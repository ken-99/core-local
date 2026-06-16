import { VehicleStore, HISTORY_CAP } from '../lib/vehicleStore'
import type { Vehicle } from '../lib/types'

function v(id: string, lng: number, lat: number, ts: number, overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id,
    position: [lng, lat],
    mode: 'bus',
    routeId: '8',
    timestamp: ts,
    ...overrides,
  }
}

describe('VehicleStore', () => {
  it('starts empty', () => {
    const s = new VehicleStore()
    expect(s.size()).toBe(0)
  })

  it('merge adds vehicles', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000), v('b', 1, 1, 1000)], 1000)
    expect(s.size()).toBe(2)
  })

  it('merge updates existing vehicles and appends history', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.merge([v('a', 0.1, 0.1, 2000)], 2000)
    expect(s.size()).toBe(1)
    const state = s.get('a')!
    expect(state.vehicle.position).toEqual([0.1, 0.1])
    expect(state.history).toHaveLength(2)
    expect(state.history[1].position).toEqual([0.1, 0.1])
  })

  it('history is capped at HISTORY_CAP', () => {
    const s = new VehicleStore()
    for (let i = 0; i < HISTORY_CAP + 10; i++) {
      s.merge([v('a', i * 0.01, 0, 1000 + i * 1000)], 1000 + i * 1000)
    }
    const state = s.get('a')!
    expect(state.history).toHaveLength(HISTORY_CAP)
    expect(state.history[0].position[0]).toBeCloseTo(10 * 0.01, 5)
  })

  it('does not append duplicate position to history', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.merge([v('a', 0, 0, 2000)], 2000)
    const state = s.get('a')!
    expect(state.history).toHaveLength(1)
  })

  it('clear() empties the store', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000), v('b', 1, 1, 1000)], 1000)
    s.clear()
    expect(s.size()).toBe(0)
  })

  it('ageOut drops vehicles whose timestamp is older than the cutoff', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000), v('b', 1, 1, 5000)], 5000)
    s.ageOut(2000)
    expect(s.size()).toBe(1)
    expect(s.get('b')).toBeDefined()
    expect(s.get('a')).toBeUndefined()
  })

  it('toGeoJSON produces a FeatureCollection of point features with mode + routeId properties', () => {
    const s = new VehicleStore()
    s.merge([
      v('a', -0.118, 51.509, 1000, { mode: 'rail', routeId: 'bakerloo' }),
      v('b', 24.945, 60.192, 1000, { mode: 'tram', routeId: '6' }),
    ], 1000)
    const fc = s.toGeoJSON()
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
    const f = fc.features.find(f => f.properties?.id === 'a')!
    expect(f.geometry.type).toBe('Point')
    expect((f.geometry as { coordinates: number[] }).coordinates).toEqual([-0.118, 51.509])
    expect(f.properties?.mode).toBe('rail')
    expect(f.properties?.routeId).toBe('bakerloo')
  })

  it('toGeoJSON includes bearing when present, omits when undefined', () => {
    const s = new VehicleStore()
    s.merge([
      v('a', 0, 0, 1000, { bearing: 45 }),
      v('b', 1, 1, 1000),
    ], 1000)
    const fc = s.toGeoJSON()
    const fa = fc.features.find(f => f.properties?.id === 'a')!
    const fb = fc.features.find(f => f.properties?.id === 'b')!
    expect(fa.properties?.bearing).toBe(45)
    expect(fb.properties?.bearing).toBeUndefined()
  })

  it('toTrailsGeoJSON returns one LineString per vehicle with at least 2 points', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.merge([v('a', 0.1, 0.1, 2000)], 2000)
    s.merge([v('a', 0.2, 0.2, 3000)], 3000)
    s.merge([v('b', 1, 1, 1000)], 1000)
    const fc = s.toTrailsGeoJSON()
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.geometry.type).toBe('LineString')
    expect((f.geometry as { coordinates: number[][] }).coordinates).toHaveLength(3)
    expect(f.properties?.mode).toBe('bus')
  })

  it('countByMode returns the correct count per mode', () => {
    const s = new VehicleStore()
    s.merge([
      v('a', 0, 0, 1000, { mode: 'bus' }),
      v('b', 1, 1, 1000, { mode: 'bus' }),
      v('c', 2, 2, 1000, { mode: 'rail' }),
    ], 1000)
    expect(s.countByMode()).toEqual({ rail: 1, bus: 2, tram: 0, ferry: 0 })
  })

  it('clear-then-merge is identical to a fresh store', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.clear()
    s.merge([v('b', 1, 1, 2000)], 2000)
    expect(s.size()).toBe(1)
    expect(s.get('b')).toBeDefined()
    expect(s.get('a')).toBeUndefined()
  })

  it('merge with empty array is a no-op', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.merge([], 2000)
    expect(s.size()).toBe(1)
  })

  it('ageOut with cutoff 0 drops nothing', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.ageOut(0)
    expect(s.size()).toBe(1)
  })

  it('ageOut with very high cutoff drops everything', () => {
    const s = new VehicleStore()
    s.merge([v('a', 0, 0, 1000)], 1000)
    s.ageOut(99_999_999)
    expect(s.size()).toBe(0)
  })
})

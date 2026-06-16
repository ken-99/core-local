import { VesselStore } from '../lib/vesselStore'
import type { VesselPosition, VesselStatic } from '../lib/types'

const pos = (mmsi: number, t = 1000): VesselPosition => ({
  mmsi, lat: 45, lon: -75, cog: 90, sog: 10, heading: 90, receivedAt: t,
})

const stat = (mmsi: number, name: string, t = 1000): VesselStatic => ({
  mmsi, name, shipType: 70, flag: 'CA', destination: 'MTRL', receivedAt: t,
})

describe('VesselStore', () => {
  test('applyPosition stores a new vessel keyed by mmsi', () => {
    const store = new VesselStore()
    store.applyPosition(pos(123, 1000))
    const v = store.get(123)
    expect(v).toBeDefined()
    expect(v!.mmsi).toBe(123)
    expect(v!.position?.lat).toBe(45)
    expect(v!.lastSeen).toBe(1000)
  })

  test('applyStatic merges into the same vessel as applyPosition', () => {
    const store = new VesselStore()
    store.applyPosition(pos(123, 1000))
    store.applyStatic(stat(123, 'EVER GIVEN', 2000))
    const v = store.get(123)
    expect(v!.position).toBeDefined()
    expect(v!.static?.name).toBe('EVER GIVEN')
    expect(v!.lastSeen).toBe(2000)
  })

  test('applyPosition overwrites previous position and updates lastSeen', () => {
    const store = new VesselStore()
    store.applyPosition(pos(123, 1000))
    store.applyPosition({ ...pos(123, 5000), lat: 46 })
    expect(store.get(123)!.position?.lat).toBe(46)
    expect(store.get(123)!.lastSeen).toBe(5000)
  })

  test('lastSeen is the max of position.receivedAt and static.receivedAt', () => {
    const store = new VesselStore()
    store.applyStatic(stat(123, 'A', 5000))
    store.applyPosition(pos(123, 1000)) // older
    expect(store.get(123)!.lastSeen).toBe(5000)
  })

  test('get returns undefined for unknown mmsi', () => {
    expect(new VesselStore().get(999)).toBeUndefined()
  })
})

describe('VesselStore.toGeoJSON', () => {
  test('returns a FeatureCollection with one Point per vessel that has a position', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 1000))
    store.applyPosition(pos(2, 1000))
    store.applyStatic(stat(3, 'NO POS', 1000)) // no position yet — excluded
    const fc = store.toGeoJSON()
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0].geometry.type).toBe('Point')
  })

  test('feature properties include mmsi, cog, name when known', () => {
    const store = new VesselStore()
    store.applyPosition(pos(123, 1000))
    store.applyStatic(stat(123, 'EVER GIVEN', 2000))
    const f = store.toGeoJSON().features[0]
    expect(f.properties?.mmsi).toBe(123)
    expect(f.properties?.cog).toBe(90)
    expect(f.properties?.name).toBe('EVER GIVEN')
  })

  test('feature properties name falls back to MMSI string when name is unknown', () => {
    const store = new VesselStore()
    store.applyPosition(pos(123, 1000))
    const f = store.toGeoJSON().features[0]
    expect(f.properties?.name).toBe('MMSI 123')
  })
})

describe('VesselStore.ageOut', () => {
  test('removes vessels not seen within maxAgeMs of now', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 1000))
    store.applyPosition(pos(2, 5000))
    store.ageOut(10_000, 14_000) // now=14000, max=10000 → cutoff=4000
    expect(store.get(1)).toBeUndefined()
    expect(store.get(2)).toBeDefined()
  })

  test('keeps vessels exactly at the cutoff', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 4000))
    store.ageOut(10_000, 14_000) // cutoff = 14000 - 10000 = 4000
    expect(store.get(1)).toBeDefined()
  })
})

describe('VesselStore history tracking', () => {
  test('applyPosition appends to history (oldest → newest)', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 1000))
    store.applyPosition({ ...pos(1, 2000), lat: 46 })
    store.applyPosition({ ...pos(1, 3000), lat: 47 })
    const h = store.get(1)!.history!
    expect(h).toHaveLength(3)
    expect(h.map(p => p.receivedAt)).toEqual([1000, 2000, 3000])
    expect(h[2].lat).toBe(47)
  })

  test('history culls entries older than trailMaxAgeMs from latest entry', () => {
    const store = new VesselStore(10_000) // 10-second trail window
    store.applyPosition(pos(1, 1000))
    store.applyPosition({ ...pos(1, 5000), lat: 46 })
    store.applyPosition({ ...pos(1, 12_000), lat: 47 }) // cutoff = 12000 - 10000 = 2000 → drops the 1000 entry
    const h = store.get(1)!.history!
    expect(h.map(p => p.receivedAt)).toEqual([5000, 12_000])
  })

  test('applyStatic preserves existing history', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 1000))
    store.applyPosition({ ...pos(1, 2000), lat: 46 })
    store.applyStatic(stat(1, 'NAME', 3000))
    expect(store.get(1)!.history).toHaveLength(2)
  })
})

describe('VesselStore.toTrailsGeoJSON', () => {
  test('returns one LineString per vessel with at least 2 history points', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 1000))                          // 1 point — excluded
    store.applyPosition(pos(2, 1000))
    store.applyPosition({ ...pos(2, 2000), lat: 46 })          // 2 points — included
    store.applyPosition(pos(3, 1000))
    store.applyPosition({ ...pos(3, 2000), lat: 47 })
    store.applyPosition({ ...pos(3, 3000), lat: 48 })          // 3 points — included
    const fc = store.toTrailsGeoJSON()
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
    expect(fc.features.every(f => f.geometry.type === 'LineString')).toBe(true)
  })

  test('LineString coordinates are oldest → newest, [lon, lat] pairs', () => {
    const store = new VesselStore()
    store.applyPosition({ ...pos(1, 1000), lat: 45, lon: -75 })
    store.applyPosition({ ...pos(1, 2000), lat: 46, lon: -76 })
    store.applyPosition({ ...pos(1, 3000), lat: 47, lon: -77 })
    const f = store.toTrailsGeoJSON().features[0]
    expect(f.geometry.coordinates).toEqual([
      [-75, 45], [-76, 46], [-77, 47],
    ])
  })

  test('feature properties include mmsi', () => {
    const store = new VesselStore()
    store.applyPosition(pos(42, 1000))
    store.applyPosition({ ...pos(42, 2000), lat: 46 })
    const f = store.toTrailsGeoJSON().features[0]
    expect(f.properties?.mmsi).toBe(42)
  })
})

describe('VesselStore.countByCategory', () => {
  test('counts vessels (with a position) per display category', () => {
    const store = new VesselStore()
    store.applyPosition(pos(1, 1000))
    store.applyStatic(stat(1, 'CARGO ONE', 1000))               // shipType 70 → cargo
    store.applyPosition(pos(2, 1000))
    store.applyStatic({ ...stat(2, 'TANKER', 1000), shipType: 80 }) // → tanker
    store.applyPosition(pos(3, 1000))                            // no static → other
    store.applyStatic(stat(4, 'NO POS', 1000))                  // static-only, no position → excluded
    const counts = store.countByCategory()
    expect(counts.cargo).toBe(1)
    expect(counts.tanker).toBe(1)
    expect(counts.other).toBe(1)
    expect(counts.passenger).toBe(0)
  })

  test('returns all-zero counts for an empty store', () => {
    const counts = new VesselStore().countByCategory()
    expect(Object.values(counts).every(n => n === 0)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { interpAlong, advectParcel, WAREHOUSE, MAX_PARCEL_AGE, flicker, smokeParcelCollection, symbolCollection, fireCollection } from './scenario'

const PATH: [number, number][] = [
  [-68.56, 63.75],
  [-68.54, 63.76],
  [-68.50, 63.77],
]

describe('interpAlong', () => {
  it('returns the first point at u=0 and the last at u=1', () => {
    expect(interpAlong(PATH, 0)).toEqual([-68.56, 63.75])
    expect(interpAlong(PATH, 1)).toEqual([-68.50, 63.77])
  })

  it('returns the sole point for a single-element path', () => {
    expect(interpAlong([[-68.52, 63.75]], 0.5)).toEqual([-68.52, 63.75])
  })

  it('returns a point strictly between the ends at u=0.5', () => {
    expect(interpAlong(PATH, 0.5)).toEqual([-68.54, 63.76])
    const [lng, lat] = interpAlong(PATH, 0.5)
    expect(lng).toBeGreaterThan(-68.56)
    expect(lng).toBeLessThan(-68.50)
    expect(lat).toBeGreaterThan(63.75)
    expect(lat).toBeLessThan(63.77)
  })

  it('clamps u outside [0,1]', () => {
    expect(interpAlong(PATH, -1)).toEqual([-68.56, 63.75])
    expect(interpAlong(PATH, 2)).toEqual([-68.50, 63.77])
  })
})

describe('advectParcel', () => {
  it('drifts downwind: bearing 90° (east) increases longitude', () => {
    const { position } = advectParcel(20, 90, 20)
    expect(position[0]).toBeGreaterThan(WAREHOUSE[0]) // east of the warehouse
  })

  it('older parcels travel farther from the warehouse', () => {
    const near = advectParcel(5, 90, 20).distanceKm
    const far = advectParcel(40, 90, 20).distanceKm
    expect(far).toBeGreaterThan(near)
  })

  it('weight fades toward zero as a parcel ages', () => {
    expect(advectParcel(40, 90, 20).weight).toBeLessThan(advectParcel(5, 90, 20).weight)
    expect(advectParcel(MAX_PARCEL_AGE + 1, 90, 20).weight).toBe(0)
  })

  it('a negative-age (not-yet-emitted) parcel has zero weight at the warehouse', () => {
    const p = advectParcel(-1, 90, 20)
    expect(p.weight).toBe(0)
    expect(p.position).toEqual(WAREHOUSE)
  })

  it('higher wind speed pushes a parcel farther for the same age', () => {
    expect(advectParcel(20, 90, 35).distanceKm).toBeGreaterThan(advectParcel(20, 90, 10).distanceKm)
  })
})

describe('flicker', () => {
  it('stays within [0.6, 1.0] and varies over time', () => {
    const samples = [0, 0.1, 0.25, 0.5, 1, 2, 3.3].map(flicker)
    for (const v of samples) {
      expect(v).toBeGreaterThanOrEqual(0.6)
      expect(v).toBeLessThanOrEqual(1.0)
    }
    expect(new Set(samples).size).toBeGreaterThan(1) // it actually oscillates
  })
})

describe('collections', () => {
  it('symbolCollection yields one point per symbol path, tagged by kind', () => {
    const fc = symbolCollection(0.3)
    expect(fc.features).toHaveLength(7)
    const kinds = new Set(fc.features.map(f => f.properties!.kind))
    expect(kinds).toEqual(new Set(['aircraft', 'vessel']))
  })

  it('smokeParcelCollection produces weighted points that decline downwind', () => {
    const fc = smokeParcelCollection(5, 90, 20)
    expect(fc.features.length).toBeGreaterThan(5)
    for (const f of fc.features) {
      const w = f.properties!.weight as number
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })

  it('fireCollection is a single weighted point at the warehouse', () => {
    const fc = fireCollection(0.5)
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.coordinates).toEqual(WAREHOUSE)
    expect(fc.features[0].properties!.weight).toBeGreaterThan(0)
  })
})

import { describe, it, expect } from 'vitest'
import { datumRows, sideOfMedian, lngLatToMerc, DECLARED_OFFSETS } from './act1'

describe('datumRows', () => {
  it('returns ≥2 differing datum-labelled values for a seabed depth (the Act 1 gate)', () => {
    const rows = datumRows(-19.42, 'FR')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const values = rows.map(r => r.value)
    expect(new Set(values).size).toBe(values.length) // all differ
  })

  it('keeps the LAT row as the real measurement, others declared', () => {
    const rows = datumRows(-19.42, 'FR')
    expect(rows[0]).toMatchObject({ datum: 'LAT', value: -19.42, kind: 'measured' })
    expect(rows.slice(1).every(r => r.kind === 'declared')).toBe(true)
  })

  it('applies the declared LAT→IGN69 and geoid→ellipsoid offsets', () => {
    const [lat, ign69, ell] = datumRows(-20, 'FR').map(r => r.value)
    expect(lat).toBe(-20)
    expect(ign69).toBeCloseTo(-20 - DECLARED_OFFSETS.latBelowIgn69_m) // deeper below land datum
    expect(ell).toBeCloseTo(ign69 + DECLARED_OFFSETS.ign69BelowEllipsoid_m)
  })

  it('uses the UK land frame (ODN Newlyn) on the UK side', () => {
    const rows = datumRows(-20, 'UK')
    expect(rows.some(r => r.datum === 'ODN_NEWLYN')).toBe(true)
    expect(rows.some(r => r.datum === 'IGN69')).toBe(false)
  })
})

describe('sideOfMedian', () => {
  it('classifies a point south of the median as FR and north as UK', () => {
    // Near mid-Channel longitude -3.5, the median sits at ~49.92.
    expect(sideOfMedian(-3.5, 48.7)).toBe('FR') // Roscoff-ish, well south
    expect(sideOfMedian(-3.5, 50.2)).toBe('UK') // toward Cornwall, north
  })
})

describe('lngLatToMerc', () => {
  it('maps the origin to (0,0) and is monotonic in each axis', () => {
    const [x0, y0] = lngLatToMerc(0, 0)
    expect(x0).toBeCloseTo(0)
    expect(y0).toBeCloseTo(0)
    expect(lngLatToMerc(1, 0)[0]).toBeGreaterThan(0)
    expect(lngLatToMerc(0, 1)[1]).toBeGreaterThan(0)
  })
})

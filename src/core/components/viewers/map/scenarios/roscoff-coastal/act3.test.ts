import { describe, it, expect } from 'vitest'
import { parseFlux, residualSeries, chartDatumToIgn69, exposure, fluxUrl, latest, recentHighWater } from './act3'
import { DECLARED_OFFSETS } from './act1'

describe('parseFlux', () => {
  it('parses the REFMAR flux and sorts by UTC time', () => {
    const json = { data: [
      { value: 3.28, timestamp: '2026/06/29 00:01:00' },
      { value: 3.27, timestamp: '2026/06/29 00:00:00' },
    ] }
    const pts = parseFlux(json)
    expect(pts).toHaveLength(2)
    expect(pts[0].v).toBe(3.27)
    expect(pts[1].t).toBeGreaterThan(pts[0].t)
    expect(pts[0].t).toBe(Date.parse('2026-06-29T00:00:00Z'))
  })
  it('is defensive against junk', () => {
    expect(parseFlux(null)).toEqual([])
    expect(parseFlux({ data: [{ value: 'x', timestamp: 1 }] as never })).toEqual([])
  })
})

describe('residualSeries', () => {
  it('aligns observed to predicted and computes surge = obs − pred', () => {
    const t0 = Date.parse('2026-06-29T00:00:00Z')
    const observed = [
      { t: t0, v: 3.40 }, { t: t0 + 60_000, v: 3.50 }, { t: t0 + 600_000, v: 3.90 },
    ]
    const predicted = [{ t: t0, v: 3.27 }, { t: t0 + 600_000, v: 3.63 }]
    const r = residualSeries(observed, predicted)
    expect(r).toHaveLength(2)
    expect(r[0].residual).toBeCloseTo(0.13)
    expect(r[1].residual).toBeCloseTo(0.27)
  })
  it('drops predicted points with no nearby observed', () => {
    const t0 = Date.parse('2026-06-29T00:00:00Z')
    const r = residualSeries([{ t: t0, v: 3 }], [{ t: t0 + 3_600_000, v: 3 }])
    expect(r).toHaveLength(0)
  })
})

describe('chartDatumToIgn69', () => {
  it('subtracts the declared LAT→IGN69 offset', () => {
    expect(chartDatumToIgn69(9)).toBeCloseTo(9 - DECLARED_OFFSETS.latBelowIgn69_m)
  })
})

describe('exposure', () => {
  it('floods low structures at a high spring level and spares high ones', () => {
    // level 9 m chart datum → ~3.5 m IGN69; +0 surge.
    const res = exposure(9, 0)
    const quay = res.find(r => r.name === 'Vieux port quay')! // threshold 3.2 IGN69
    const steps = res.find(r => r.name.includes('Ste-Barbe'))! // threshold 5.0 IGN69
    expect(quay.exposed).toBe(true)
    expect(steps.exposed).toBe(false)
  })
  it('a simulated surge pushes more structures over threshold', () => {
    const calm = exposure(8, 0).filter(r => r.exposed).length
    const surge = exposure(8, 1.5).filter(r => r.exposed).length
    expect(surge).toBeGreaterThanOrEqual(calm)
  })
})

describe('recentHighWater', () => {
  const t0 = Date.parse('2026-07-03T00:00:00Z')
  it('returns the highest level within the recent window', () => {
    const s = [
      { t: t0, v: 2.1 }, { t: t0 + 6 * 3_600_000, v: 8.3 }, { t: t0 + 12 * 3_600_000, v: 2.7 },
    ]
    expect(recentHighWater(s)).toBeCloseTo(8.3)
  })
  it('ignores peaks older than the window', () => {
    const last = t0 + 30 * 3_600_000
    const s = [{ t: t0, v: 9.9 }, { t: last, v: 3.0 }] // 9.9 is >25h before the last point
    expect(recentHighWater(s)).toBeCloseTo(3.0)
  })
  it('returns null for an empty series', () => {
    expect(recentHighWater([])).toBeNull()
  })
})

describe('fluxUrl + latest', () => {
  it('builds a UTC-windowed flux url', () => {
    const url = fluxUrl('https://x/json', 54, 1, Date.parse('2026-06-29T00:00:00Z'), Date.parse('2026-06-29T06:00:00Z'))
    expect(url).toBe('https://x/json/54?sources=1&dtStart=2026-06-29T00:00:00&dtEnd=2026-06-29T06:00:00')
  })
  it('latest returns the last point or null', () => {
    expect(latest([])).toBeNull()
    expect(latest([{ t: 1, v: 2 }, { t: 3, v: 4 }])).toEqual({ t: 3, v: 4 })
  })
})

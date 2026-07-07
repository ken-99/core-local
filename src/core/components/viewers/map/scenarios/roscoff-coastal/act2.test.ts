import { describe, it, expect } from 'vitest'
import { tideAltitude, springTideWindow, levelAt } from './act2'
import { fitTide } from './tidePrediction'
import type { TidePoint } from './act3'

// A synthetic M2-only tide (period 12.42 h, amplitude 4 m, mean 5 m) sampled
// every 20 min for 3 days — enough to fit and to exercise the window search.
function synthetic(): TidePoint[] {
  const out: TidePoint[] = []
  const t0 = 1_700_000_000_000
  const omega = (2 * Math.PI) / (12.4206012 * 3_600_000)
  for (let i = 0; i < 3 * 72; i++) {
    const t = t0 + i * 20 * 60_000
    out.push({ t, v: 5 + 4 * Math.cos(omega * (t - t0)) })
  }
  return out
}

describe('tideAltitude', () => {
  it('shifts chart-datum level into the building frame plus the calibration', () => {
    // chartDatumToIgn69 subtracts the declared LAT-below-IGN69 offset; adding the
    // calibration on top. Two levels 1 m apart stay 1 m apart.
    const a = tideAltitude(3, 0)
    const b = tideAltitude(4, 0)
    expect(b - a).toBeCloseTo(1, 6)
    expect(tideAltitude(3, 2) - tideAltitude(3, 0)).toBeCloseTo(2, 6)
  })
})

describe('springTideWindow + levelAt', () => {
  const model = fitTide(synthetic())!
  it('returns a ~12.4 h window with a high water near its middle', () => {
    const w = springTideWindow(model, 1_700_000_000_000, 2)
    const hours = (w.endT - w.startT) / 3_600_000
    expect(hours).toBeGreaterThan(11)
    expect(hours).toBeLessThan(14)
    expect(w.highT).toBeGreaterThanOrEqual(w.startT)
    expect(w.highT).toBeLessThanOrEqual(w.endT)
  })
  it('levelAt is highest near phase 0.5 and lower at the ends', () => {
    const w = springTideWindow(model, 1_700_000_000_000, 2)
    const mid = levelAt(model, w, 0.5)
    expect(mid).toBeGreaterThan(levelAt(model, w, 0))
    expect(mid).toBeGreaterThan(levelAt(model, w, 1))
  })
})

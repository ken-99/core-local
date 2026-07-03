import { describe, it, expect } from 'vitest'
import { fitTide, predictTide, predictSeries, TIDAL_CONSTITUENTS } from './tidePrediction'
import type { TidePoint } from './act3'

const HOUR = 3_600_000
const t0 = Date.parse('2026-06-05T00:00:00Z')

/** Build a synthetic tide from a subset of the real constituents + a mean. */
function synth(days: number, stepMin: number, fn: (t: number) => number): TidePoint[] {
  const pts: TidePoint[] = []
  for (let m = 0; m <= days * 24 * 60; m += stepMin) {
    const t = t0 + m * 60_000
    pts.push({ t, v: fn(t) })
  }
  return pts
}

describe('fitTide + predictTide', () => {
  const M2 = TIDAL_CONSTITUENTS[0].periodHours, S2 = TIDAL_CONSTITUENTS[1].periodHours
  const K1 = TIDAL_CONSTITUENTS[3].periodHours
  const wave = (t: number) => {
    const h = (t - t0) / HOUR
    return 5.0
      + 2.5 * Math.cos(2 * Math.PI * h / M2) + 1.2 * Math.sin(2 * Math.PI * h / M2)
      + 0.9 * Math.cos(2 * Math.PI * h / S2)
      + 0.4 * Math.sin(2 * Math.PI * h / K1)
  }

  it('recovers a synthetic tide and predicts it to sub-mm accuracy', () => {
    const model = fitTide(synth(28, 10, wave))!
    expect(model).not.toBeNull()
    expect(model.mean).toBeCloseTo(5.0, 3)
    // Prediction matches the generating function at an arbitrary (in-sample) time.
    const t = t0 + 100 * HOUR
    expect(predictTide(model, t)).toBeCloseTo(wave(t), 3)
  })

  it('predicts into the FUTURE (past the fitted record) — no lag', () => {
    const model = fitTide(synth(28, 10, wave))!
    const future = t0 + 30 * 24 * HOUR // 2 days beyond the 28-day fit window
    expect(predictTide(model, future)).toBeCloseTo(wave(future), 2)
  })

  it('leaves a real surge in the residual (observed − predicted)', () => {
    // Observed = astronomical tide + a 0.3 m sub-tidal bump over one stretch.
    const bumpStart = t0 + 200 * HOUR, bumpEnd = t0 + 210 * HOUR
    const observed = synth(28, 10, t => wave(t) + (t >= bumpStart && t <= bumpEnd ? 0.3 : 0))
    const model = fitTide(observed)!
    const predicted = predictSeries(model, observed)
    const residualAtBump = observed.find(p => p.t === t0 + 205 * HOUR)!.v
      - predicted.find(p => p.t === t0 + 205 * HOUR)!.v
    const residualCalm = observed.find(p => p.t === t0 + 50 * HOUR)!.v
      - predicted.find(p => p.t === t0 + 50 * HOUR)!.v
    expect(residualAtBump).toBeGreaterThan(0.2)   // the surge shows up
    expect(Math.abs(residualCalm)).toBeLessThan(0.05) // calm water ≈ 0
  })

  it('returns null when there are too few points to fit', () => {
    expect(fitTide([{ t: t0, v: 1 }, { t: t0 + HOUR, v: 2 }])).toBeNull()
  })
})

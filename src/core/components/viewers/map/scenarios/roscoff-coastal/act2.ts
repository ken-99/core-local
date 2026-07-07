// Act 2 — "the living shoreline". Pure tide/flood math: put the tide into the
// same vertical frame as the buildings, and pick a spring-tide window to
// animate over. No React, no MapLibre — unit-testable.
import { chartDatumToIgn69 } from './act3'
import { predictTide, type TideModel } from './tidePrediction'

const M2_HOURS = 12.4206012

/**
 * Tide level (m above chart datum) → altitude in the buildings/map vertical
 * frame. `chartDatumToIgn69` applies the declared datum offset; `waterCalib`
 * is the manual sea-level nudge (the water slider) that absorbs the coarse-DEM
 * vertical mismatch. Illustrative until BATHYELLI gives the real separation.
 */
export function tideAltitude(levelChartDatum_m: number, waterCalib_m: number): number {
  return chartDatumToIgn69(levelChartDatum_m) + waterCalib_m
}

export interface TideWindow { startT: number; endT: number; highT: number }

/**
 * Find the strongest high water in `[fromT, fromT + searchDays]` (a spring high,
 * so the scrub always shows the big range) and return one M2 cycle centred on
 * it — phase 0 and 1 land near the flanking lows, phase 0.5 near the high.
 */
export function springTideWindow(model: TideModel, fromT: number, searchDays = 15): TideWindow {
  const stepMs = 15 * 60_000
  const end = fromT + searchDays * 86_400_000
  let highT = fromT
  let hi = -Infinity
  for (let t = fromT; t <= end; t += stepMs) {
    const v = predictTide(model, t)
    if (v > hi) { hi = v; highT = t }
  }
  const halfMs = (M2_HOURS / 2) * 3_600_000
  return { startT: highT - halfMs, endT: highT + halfMs, highT }
}

/** Predicted tide level (m, chart datum) at `phase` (0..1) across the window. */
export function levelAt(model: TideModel, w: TideWindow, phase: number): number {
  const p = Math.min(1, Math.max(0, phase))
  return predictTide(model, w.startT + p * (w.endT - w.startT))
}

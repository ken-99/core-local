// Act 3 — "The twin as a live lens over live ocean data". Pure data + math:
// parse the REFMAR flux, align observed vs predicted into a residual (= surge)
// series, and decide which quayside structures are exposed at a given water
// level. No React, no MapLibre — unit-testable.
//
// Gauge values are metres referenced to zéro hydrographique (chart datum / LAT).
// To compare against structure thresholds in IGN69 we reuse the SAME declared
// datum offset as Act 1 — the datum contract, applied consistently.
import type { FeatureCollection, Point, Polygon } from 'geojson'
import { type Coord } from './constants'
import { DECLARED_OFFSETS } from './act1'

// Act 3 camera: Roscoff harbour close-up. Mercator only.
export const HARBOUR_VIEW = { center: [-3.9657, 48.7184] as Coord, zoom: 15 } as const

/** REFMAR flux source ids (verified live). */
export const REFMAR_SOURCE = { observed: 1, predicted: 2 } as const

export interface TidePoint { t: number; v: number } // t = epoch ms (UTC), v = m (chart datum)

/** Parse the REFMAR observation flux `{data:[{value,timestamp}]}`. Timestamps are
 * "YYYY/MM/DD HH:MM:SS" in UTC. */
export function parseFlux(json: unknown): TidePoint[] {
  const data = (json as { data?: { value: number; timestamp: string }[] })?.data
  if (!Array.isArray(data)) return []
  const out: TidePoint[] = []
  for (const d of data) {
    if (typeof d.value !== 'number' || typeof d.timestamp !== 'string') continue
    const iso = d.timestamp.replace(/\//g, '-').replace(' ', 'T') + 'Z'
    const t = Date.parse(iso)
    if (!Number.isNaN(t)) out.push({ t, v: d.value })
  }
  return out.sort((a, b) => a.t - b.t)
}

export interface ResidualPoint { t: number; obs: number; pred: number; residual: number }

/**
 * Align observed (dense, 1-min) to predicted (sparse, 10-min) by nearest
 * timestamp within `tolMs`, and compute residual = observed − predicted (the
 * storm-surge signal). Iterates once over each sorted series.
 */
export function residualSeries(observed: TidePoint[], predicted: TidePoint[], tolMs = 6 * 60_000): ResidualPoint[] {
  const out: ResidualPoint[] = []
  let j = 0
  for (const p of predicted) {
    while (j < observed.length - 1 && Math.abs(observed[j + 1].t - p.t) <= Math.abs(observed[j].t - p.t)) j++
    const o = observed[j]
    if (o && Math.abs(o.t - p.t) <= tolMs) out.push({ t: p.t, obs: o.v, pred: p.v, residual: o.v - p.v })
  }
  return out
}

/** Latest point in a series (or null). */
export function latest(series: TidePoint[]): TidePoint | null {
  return series.length ? series[series.length - 1] : null
}

/**
 * The highest water level over the most recent `windowMs` of a series — the
 * recent high-water mark. Storm-surge flooding happens at high tide, so the
 * exposure scenario stacks the simulated surge on THIS rather than the live
 * level (which is usually mid- or low-tide and would flood nothing). The
 * default window (~25 h) spans about two tidal cycles, so it captures the
 * current spring/neap high water rather than a week-old spring peak.
 */
export function recentHighWater(series: TidePoint[], windowMs = 25 * 3_600_000): number | null {
  if (!series.length) return null
  const cutoff = series[series.length - 1].t - windowMs
  let hi = -Infinity
  for (const p of series) if (p.t >= cutoff && p.v > hi) hi = p.v
  return hi === -Infinity ? null : hi
}

/** Chart-datum water level (m) → height relative to IGN69 (m). IGN69 zero sits
 * `latBelowIgn69_m` ABOVE chart-datum zero, so a level L above chart datum is
 * L − offset relative to IGN69. Declared offset (illustrative until BATHYELLI). */
export function chartDatumToIgn69(levelChartDatum_m: number): number {
  return levelChartDatum_m - DECLARED_OFFSETS.latBelowIgn69_m
}

// --- Illustrative harbour "water" area (for the tide fill) + quayside structure
// thresholds. Placeholders until Act 2's roofer buildings land; each threshold is
// an elevation in IGN69 (m) that floods when the water reaches it. ---
export const HARBOUR_WATER: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[
      [-3.974, 48.720], [-3.958, 48.720], [-3.955, 48.727], [-3.972, 48.727], [-3.974, 48.720],
    ]] },
  }],
}

export interface Threshold { name: string; coord: Coord; thresholdIgn69_m: number }
export const STRUCTURE_THRESHOLDS: Threshold[] = [
  { name: 'Vieux port quay', coord: [-3.9668, 48.7205], thresholdIgn69_m: 3.2 },
  { name: 'Bloscon ferry ramp', coord: [-3.9585, 48.7218], thresholdIgn69_m: 4.1 },
  { name: 'Aquarium seafront', coord: [-3.9840, 48.7240], thresholdIgn69_m: 2.6 },
  { name: 'Chapelle Ste-Barbe steps', coord: [-3.9705, 48.7229], thresholdIgn69_m: 5.0 },
]

export interface ExposureResult { name: string; coord: Coord; exposed: boolean; marginM: number }

/**
 * At an effective water level (observed chart-datum level + a simulated surge),
 * decide which structures are exposed. Positive margin = water above threshold.
 */
export function exposure(levelChartDatum_m: number, surgeM: number, thresholds = STRUCTURE_THRESHOLDS): ExposureResult[] {
  const waterIgn69 = chartDatumToIgn69(levelChartDatum_m + surgeM)
  return thresholds.map(t => {
    const marginM = waterIgn69 - t.thresholdIgn69_m
    return { name: t.name, coord: t.coord, exposed: marginM >= 0, marginM }
  })
}

/** Build a REFMAR flux URL for a source + window (UTC). */
export function fluxUrl(base: string, gaugeId: number, source: number, startMs: number, endMs: number): string {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) // YYYY-MM-DDTHH:MM:SS
  return `${base}/${gaugeId}?sources=${source}&dtStart=${iso(startMs)}&dtEnd=${iso(endMs)}`
}

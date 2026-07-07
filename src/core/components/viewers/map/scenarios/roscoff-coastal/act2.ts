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

/**
 * Grid of terrain samples for the Act 2 receding waterline. Local frame: x=east,
 * z=−north metres around ROSCOFF_CENTER (the layer's frame). `h` is the terrain
 * height (map vertical frame). `cellInMask` gates each cell to the sea side so a
 * low inland DEM spot can't flood the wrong side of town.
 */
export interface WaterGrid {
  cols: number
  rows: number
  /** local east metres per column, length `cols` */
  xs: number[]
  /** local −north metres per row, length `rows` */
  zs: number[]
  /** terrain height (map frame, m), row-major `h[row*cols + col]`, length cols*rows */
  h: number[]
  /** cell-centre-in-mask, row-major `cellInMask[row*(cols-1) + col]`, length (cols-1)*(rows-1) */
  cellInMask: boolean[]
}

interface WaterPt { x: number; z: number; h: number }

/**
 * Clip a terrain triangle to the underwater side (h < waterAltitude) and return
 * the wet polygon's corners in order (x,z). Sutherland–Hodgman against the single
 * iso-height plane — unambiguous, no marching-squares saddle case.
 */
function clipTriangleBelow(tri: WaterPt[], waterAltitude: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < tri.length; i++) {
    const a = tri[i]
    const b = tri[(i + 1) % tri.length]
    const aWet = a.h < waterAltitude
    const bWet = b.h < waterAltitude
    if (aWet) out.push({ x: a.x, z: a.z })
    if (aWet !== bWet) {
      const t = (waterAltitude - a.h) / (b.h - a.h)
      out.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) })
    }
  }
  return out
}

/**
 * Terrain-derived water surface. Split each in-mask cell into two terrain
 * triangles, clip each to the part below `waterAltitude`, and fan-triangulate the
 * wet polygon. Output is a flat footprint at y=0; the caller lifts it to the water
 * height via the model matrix, so the horizontal edge is the DEM's iso-height
 * contour at the current tide. Returns interleaved [x,y,z, …] triangle positions.
 */
export function buildWaterMesh(grid: WaterGrid, waterAltitude: number): number[] {
  const { cols, rows, xs, zs, h, cellInMask } = grid
  const verts: number[] = []
  const emit = (poly: { x: number; z: number }[]) => {
    for (let k = 1; k < poly.length - 1; k++) {
      verts.push(poly[0].x, 0, poly[0].z)
      verts.push(poly[k].x, 0, poly[k].z)
      verts.push(poly[k + 1].x, 0, poly[k + 1].z)
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!cellInMask[r * (cols - 1) + c]) continue
      const A: WaterPt = { x: xs[c], z: zs[r], h: h[r * cols + c] }
      const B: WaterPt = { x: xs[c + 1], z: zs[r], h: h[r * cols + c + 1] }
      const C: WaterPt = { x: xs[c + 1], z: zs[r + 1], h: h[(r + 1) * cols + c + 1] }
      const D: WaterPt = { x: xs[c], z: zs[r + 1], h: h[(r + 1) * cols + c] }
      emit(clipTriangleBelow([A, B, C], waterAltitude))
      emit(clipTriangleBelow([A, C, D], waterAltitude))
    }
  }
  return verts
}

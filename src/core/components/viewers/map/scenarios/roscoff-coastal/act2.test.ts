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

import { buildWaterMesh, type WaterGrid } from './act2'

// Column of z-values from an interleaved [x,y,z,…] mesh.
function zsOf(mesh: number[]): number[] {
  const out: number[] = []
  for (let i = 2; i < mesh.length; i += 3) out.push(mesh[i])
  return out
}

describe('buildWaterMesh', () => {
  // One 10 m × 10 m cell. Corners A(0,0) B(10,0) C(10,10) D(0,10); heights given
  // as [A,B,C,D]. h is row-major h[row*cols+col] = [A, B, D, C].
  const oneCell = (heights: [number, number, number, number], mask = true): WaterGrid => ({
    cols: 2, rows: 2, xs: [0, 10], zs: [0, 10],
    h: [heights[0], heights[1], heights[3], heights[2]],
    cellInMask: [mask],
  })

  it('returns nothing when the whole cell is above water', () => {
    expect(buildWaterMesh(oneCell([10, 10, 10, 10]), 5)).toEqual([])
  })

  it('covers the full cell (2 triangles) when the whole cell is underwater', () => {
    expect(buildWaterMesh(oneCell([0, 0, 0, 0]), 5).length).toBe(18)
  })

  it('emits a flat surface — every vertex sits at y=0', () => {
    const mesh = buildWaterMesh(oneCell([0, 0, 10, 10]), 5)
    expect(mesh.length).toBeGreaterThan(0)
    for (let i = 1; i < mesh.length; i += 3) expect(mesh[i]).toBe(0)
  })

  it('cuts the waterline at the interpolated iso-height, not the cell edge', () => {
    // A,B wet (h=0), C,D dry (h=10). Water at 5 → waterline halfway up (z=5).
    const z = zsOf(buildWaterMesh(oneCell([0, 0, 10, 10]), 5))
    expect(Math.max(...z)).toBeCloseTo(5, 6)
    expect(Math.min(...z)).toBeCloseTo(0, 6)
  })

  it('advances up the slope as the tide rises', () => {
    const g = oneCell([0, 0, 10, 10])
    const reach = (w: number) => Math.max(...zsOf(buildWaterMesh(g, w)))
    expect(reach(7)).toBeGreaterThan(reach(3))
  })

  it('never floods a cell whose centre is outside the sea mask', () => {
    expect(buildWaterMesh(oneCell([0, 0, 0, 0], false), 5)).toEqual([])
  })
})

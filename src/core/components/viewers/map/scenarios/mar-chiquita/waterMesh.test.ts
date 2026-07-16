import { describe, it, expect } from 'vitest'
import { buildWaterMesh, type WaterGrid } from './waterMesh'

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
    const z = zsOf(buildWaterMesh(oneCell([0, 0, 10, 10]), 5))
    expect(Math.max(...z)).toBeCloseTo(5, 6)
    expect(Math.min(...z)).toBeCloseTo(0, 6)
  })

  it('advances up the slope as the tide rises', () => {
    const g = oneCell([0, 0, 10, 10])
    const reach = (w: number) => Math.max(...zsOf(buildWaterMesh(g, w)))
    expect(reach(7)).toBeGreaterThan(reach(3))
  })

  it('never floods a cell whose centre is outside the mask', () => {
    expect(buildWaterMesh(oneCell([0, 0, 0, 0], false), 5)).toEqual([])
  })

  // Multi-cell grids — exercise the row-major indexing (h[r*cols+c],
  // cellInMask[r*(cols-1)+c], xs[c+1]/zs[r+1]) the single-cell tests never hit.
  it('covers every in-mask cell across a 3×2 grid (2 cells wide)', () => {
    const g: WaterGrid = {
      cols: 3, rows: 2, xs: [0, 10, 20], zs: [0, 10],
      h: [0, 0, 0, 0, 0, 0], cellInMask: [true, true],
    }
    const mesh = buildWaterMesh(g, 5)
    expect(mesh.length).toBe(36) // 2 cells × 2 triangles × 3 verts × 3 coords
    const xs: number[] = []
    for (let i = 0; i < mesh.length; i += 3) xs.push(mesh[i])
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(20) // right column read via xs[c+1]=xs[2]
  })

  it('masks the correct cell by column index (cellInMask[c])', () => {
    const g: WaterGrid = {
      cols: 3, rows: 2, xs: [0, 10, 20], zs: [0, 10],
      h: [0, 0, 0, 0, 0, 0], cellInMask: [false, true], // only the right cell
    }
    const mesh = buildWaterMesh(g, 5)
    expect(mesh.length).toBe(18)
    const xs: number[] = []
    for (let i = 0; i < mesh.length; i += 3) xs.push(mesh[i])
    expect(Math.min(...xs)).toBe(10) // right cell only → x in [10,20]
    expect(Math.max(...xs)).toBe(20)
  })

  it('covers stacked cells across a 2×3 grid (row indexing)', () => {
    const g: WaterGrid = {
      cols: 2, rows: 3, xs: [0, 10], zs: [0, 10, 20],
      h: [0, 0, 0, 0, 0, 0], cellInMask: [true, true],
    }
    const mesh = buildWaterMesh(g, 5)
    expect(mesh.length).toBe(36)
    const zs: number[] = []
    for (let i = 2; i < mesh.length; i += 3) zs.push(mesh[i])
    expect(Math.max(...zs)).toBe(20) // bottom row read via zs[r+1]=zs[2]
  })
})

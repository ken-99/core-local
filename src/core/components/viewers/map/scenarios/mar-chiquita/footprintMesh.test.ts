import { describe, it, expect } from 'vitest'
import { growMask, buildFootprintMesh, type FootprintGrid } from './footprintMesh'

// y-values from an interleaved [x,y,z,…] buffer.
function ysOf(buf: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < buf.length; i += 3) out.push(buf[i])
  return out
}

describe('growMask', () => {
  it('returns an unchanged copy at margin 0', () => {
    const mask = [true, false, false, true]
    const out = growMask(mask, 2, 2, 0)
    expect(out).toEqual(mask)
    expect(out).not.toBe(mask) // a copy, not the same array
  })

  it('dilates a single centre cell to the full 3×3 block at margin 1', () => {
    // 3×3 cell grid, only the centre cell on.
    const mask = new Array(9).fill(false)
    mask[1 * 3 + 1] = true
    expect(growMask(mask, 3, 3, 1)).toEqual(new Array(9).fill(true))
  })

  it('clamps growth to the grid edges', () => {
    // Corner cell on; margin 1 grows into the 2×2 block at that corner only.
    const mask = new Array(9).fill(false)
    mask[0] = true // (r0,c0)
    const out = growMask(mask, 3, 3, 1)
    const on = (r: number, c: number) => out[r * 3 + c]
    expect(on(0, 0)).toBe(true); expect(on(0, 1)).toBe(true)
    expect(on(1, 0)).toBe(true); expect(on(1, 1)).toBe(true)
    expect(on(0, 2)).toBe(false); expect(on(2, 2)).toBe(false)
  })
})

describe('buildFootprintMesh', () => {
  // One 10 m × 10 m cell: 2×2 vertices, one cell on.
  const oneCell = (): FootprintGrid => ({
    cols: 2, rows: 2, xs: [0, 10], zs: [0, 10], cellInMask: [true],
  })

  it('fills one cell as two triangles, all at y=0', () => {
    const { fill } = buildFootprintMesh(oneCell(), 0)
    expect(fill.length).toBe(18) // 2 tris × 3 verts × 3 coords
    for (const y of ysOf(fill)) expect(y).toBe(0)
  })

  it('outlines all four sides of a lone cell', () => {
    const { outline } = buildFootprintMesh(oneCell(), 0)
    expect(outline.length).toBe(24) // 4 edges × 2 endpoints × 3 coords
    for (const y of ysOf(outline)) expect(y).toBe(0)
  })

  it('drops the shared edge between two adjacent cells', () => {
    // Two cells side by side, both on. Perimeter is 6 edges, not 8 —
    // the shared interior edge must not appear.
    const grid: FootprintGrid = {
      cols: 3, rows: 2, xs: [0, 10, 20], zs: [0, 10], cellInMask: [true, true],
    }
    const { outline } = buildFootprintMesh(grid, 0)
    expect(outline.length).toBe(6 * 2 * 3) // 6 boundary edges
  })

  it('grows the filled area outward with the margin', () => {
    // Centre cell of a 3×3 cell grid; margin 1 → all 9 cells filled.
    const grid: FootprintGrid = {
      cols: 4, rows: 4, xs: [0, 10, 20, 30], zs: [0, 10, 20, 30],
      cellInMask: (() => { const m = new Array(9).fill(false); m[4] = true; return m })(),
    }
    const bare = buildFootprintMesh(grid, 0).fill.length
    const grown = buildFootprintMesh(grid, 1).fill.length
    expect(bare).toBe(18)       // just the centre cell
    expect(grown).toBe(9 * 18)  // full 3×3 block
  })

  it('places the fill on the grid’s own xs/zs', () => {
    const { fill } = buildFootprintMesh(oneCell(), 0)
    const xs: number[] = [], zs: number[] = []
    for (let i = 0; i < fill.length; i += 3) { xs.push(fill[i]); zs.push(fill[i + 2]) }
    expect(Math.min(...xs)).toBe(0); expect(Math.max(...xs)).toBe(10)
    expect(Math.min(...zs)).toBe(0); expect(Math.max(...zs)).toBe(10)
  })
})

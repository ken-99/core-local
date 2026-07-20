import { describe, it, expect } from 'vitest'
import { buildSkirtMesh } from './skirtMesh'
import type { BakedGrid } from './bakeGrid'

// Vertex grid `cols` x `rows` on a 10 m pitch, every height `height`, with the
// caller supplying the cell mask. Cells are (cols-1) x (rows-1).
const flatGrid = (cols: number, rows: number, height = 4): BakedGrid => ({
  cols,
  rows,
  xs: Array.from({ length: cols }, (_, c) => c * 10),
  zs: Array.from({ length: rows }, (_, r) => r * 10),
  h: new Array(cols * rows).fill(height),
  cellInMask: new Array((cols - 1) * (rows - 1)).fill(true),
  center: [0, 0],
})

const ysOf = (positions: number[]) => {
  const out: number[] = []
  for (let i = 1; i < positions.length; i += 3) out.push(positions[i])
  return out
}

// Each exposed edge becomes a quad = 2 triangles = 6 vertices = 18 numbers.
const NUMBERS_PER_WALL = 18

describe('buildSkirtMesh', () => {
  it('walls all four sides of a lone cell', () => {
    const { positions, t } = buildSkirtMesh(flatGrid(2, 2), {
      exaggeration: 1, depthBelowLowest: 2,
    })
    expect(positions.length).toBe(4 * NUMBERS_PER_WALL)
    expect(t.length).toBe(positions.length / 3)
  })

  it('emits nothing for a cell surrounded on all four sides', () => {
    // 3x3 cells, all in mask. Only the outer ring is exposed: 4 sides x 3 = 12
    // walls. If the middle cell contributed, this would be more.
    const { positions } = buildSkirtMesh(flatGrid(4, 4), {
      exaggeration: 1, depthBelowLowest: 2,
    })
    expect(positions.length).toBe(12 * NUMBERS_PER_WALL)
  })

  it('puts wall tops on the ground and the base at the fixed drop below it', () => {
    // Ground at 4 m, exaggeration 3 -> tops at 12. Base 2 m below the lowest
    // ground: (4 - 2) * 3 = 6.
    const { positions } = buildSkirtMesh(flatGrid(2, 2, 4), {
      exaggeration: 3, depthBelowLowest: 2,
    })
    const ys = ysOf(positions)
    expect(Math.max(...ys)).toBeCloseTo(12, 6)
    expect(Math.min(...ys)).toBeCloseTo(6, 6)
  })

  it('marks top vertices 0 and base vertices 1', () => {
    const { positions, t } = buildSkirtMesh(flatGrid(2, 2, 4), {
      exaggeration: 3, depthBelowLowest: 2,
    })
    const ys = ysOf(positions)
    for (let i = 0; i < t.length; i++) {
      expect(t[i]).toBe(ys[i] > 9 ? 0 : 1) // 12 = top, 6 = base
    }
  })

  it('measures the drop from the lowest ground, not the highest', () => {
    const grid = flatGrid(2, 2, 4)
    grid.h[3] = 1 // one corner much lower
    const { positions } = buildSkirtMesh(grid, { exaggeration: 1, depthBelowLowest: 2 })
    expect(Math.min(...ysOf(positions))).toBeCloseTo(-1, 6) // 1 - 2
  })

  it('ignores ground under cells the mask excludes', () => {
    // The low corner belongs only to the excluded cell, so the base must be
    // measured from the 4 m ground that is actually drawn, not from it.
    const grid = flatGrid(3, 2, 4) // 2 cells side by side
    grid.cellInMask = [true, false]
    grid.h[2] = -20 // top-right vertex, touched only by the excluded cell
    grid.h[5] = -20 // bottom-right vertex, likewise
    const { positions } = buildSkirtMesh(grid, { exaggeration: 1, depthBelowLowest: 2 })
    expect(Math.min(...ysOf(positions))).toBeCloseTo(2, 6) // 4 - 2
  })

  it('emits nothing when no cell is in the mask', () => {
    const grid = flatGrid(4, 4)
    grid.cellInMask = new Array(9).fill(false)
    const { positions, t } = buildSkirtMesh(grid, { exaggeration: 1, depthBelowLowest: 2 })
    expect(positions).toEqual([])
    expect(t).toEqual([])
  })
})

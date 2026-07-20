import { describe, it, expect } from 'vitest'
import { trimMaskEdges } from './edgeTrim'

// A solid rectangle of in-mask cells, `cellCols` x `cellRows`.
const solid = (cellCols: number, cellRows: number) =>
  new Array<boolean>(cellCols * cellRows).fill(true)

const countTrue = (m: boolean[]) => m.filter(Boolean).length

describe('trimMaskEdges', () => {
  it('removes exactly the border ring of a solid block', () => {
    // 5x5 solid -> only the inner 3x3 survives one pass.
    const out = trimMaskEdges(solid(5, 5), 5, 5, 1)
    expect(countTrue(out)).toBe(9)
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) expect(out[r * 5 + c]).toBe(true)
    }
  })

  it('treats cells outside the grid as not in the mask', () => {
    // Every cell of a 3x3 grid touches the grid edge except the centre, so a
    // single pass must leave exactly one cell. This is what stops the survey
    // boundary from surviving just because the array ends there.
    const out = trimMaskEdges(solid(3, 3), 3, 3, 1)
    expect(countTrue(out)).toBe(1)
    expect(out[1 * 3 + 1]).toBe(true)
  })

  it('removes a lone cell entirely', () => {
    const mask = new Array<boolean>(25).fill(false)
    mask[2 * 5 + 2] = true // one cell, no neighbours
    expect(countTrue(trimMaskEdges(mask, 5, 5, 1))).toBe(0)
  })

  it('removes two rings when asked for two passes', () => {
    // 7x7 solid -> inner 3x3 after two passes.
    expect(countTrue(trimMaskEdges(solid(7, 7), 7, 7, 2))).toBe(9)
  })

  it('leaves the mask unchanged for zero passes', () => {
    const mask = solid(4, 4)
    expect(trimMaskEdges(mask, 4, 4, 0)).toEqual(mask)
  })

  it('does not return the caller\'s array', () => {
    const mask = solid(4, 4)
    const out = trimMaskEdges(mask, 4, 4, 0)
    out[0] = false
    expect(mask[0]).toBe(true)
  })

  it('erodes a shape smaller than the trim to nothing without throwing', () => {
    expect(countTrue(trimMaskEdges(solid(3, 3), 3, 3, 5))).toBe(0)
  })
})

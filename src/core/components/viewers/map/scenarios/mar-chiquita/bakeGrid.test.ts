import { describe, it, expect } from 'vitest'
import { xyzToGrid } from './bakeGrid'

// A 3-col × 2-row GDAL XYZ block (row-major, top row = max lat, left→right).
// lng: -57.0, -56.0, -55.0 ; lat: -37.0 (top), -38.0 (bottom).
const LINES = [
  '-57.0 -37.0 1.0',
  '-56.0 -37.0 2.0',
  '-55.0 -37.0 3.0',
  '-57.0 -38.0 4.0',
  '-56.0 -38.0 5.0',
  '-55.0 -38.0 -1e30', // nodata-ish
]

describe('xyzToGrid', () => {
  it('reads cols/rows and row-major heights', () => {
    const g = xyzToGrid(LINES, 3, 2)
    expect(g.cols).toBe(3)
    expect(g.rows).toBe(2)
    expect(g.h.slice(0, 3)).toEqual([1, 2, 3])
    expect(g.h[3]).toBe(4)
  })

  it('centers on the grid extent', () => {
    const g = xyzToGrid(LINES, 3, 2)
    expect(g.center[0]).toBeCloseTo(-56.0, 6) // lng mid
    expect(g.center[1]).toBeCloseTo(-37.5, 6) // lat mid
  })

  it('local xs increase east, zs increase south (−north)', () => {
    const g = xyzToGrid(LINES, 3, 2)
    expect(g.xs[0]).toBeLessThan(g.xs[2])  // west < east
    expect(g.zs[0]).toBeLessThan(g.zs[1])  // north row < south row
  })

  it('masks any cell touching a nodata corner', () => {
    const g = xyzToGrid(LINES, 3, 2)
    // 2 cells (cols-1=2, rows-1=1). Right cell has the nodata corner → false.
    expect(g.cellInMask).toEqual([true, false])
  })
})

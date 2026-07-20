import { describe, it, expect } from 'vitest'
import { buildTerrainMesh } from './terrainMesh'
import type { BakedGrid } from './bakeGrid'

// A flat 2×2 sample grid (one cell), all in mask, centred so lng/lat are simple.
const flatCell = (height: number): BakedGrid => ({
  cols: 2, rows: 2,
  xs: [0, 10], zs: [0, 10],
  h: [height, height, height, height],
  cellInMask: [true],
  center: [-57.382, -37.708],
})
// Ortho rectangle: TL, TR, BR, BL in WGS84 (west/north … east/south).
const ORTHO: [[number, number], [number, number], [number, number], [number, number]] =
  [[-57.3833475, -37.7072129], [-57.3802695, -37.7072129], [-57.3802695, -37.7097150], [-57.3833475, -37.7097150]]

describe('buildTerrainMesh', () => {
  it('emits two triangles (18 position floats) for one in-mask cell', () => {
    const { positions } = buildTerrainMesh(flatCell(0), { exaggeration: 3, ortho: ORTHO })
    expect(positions.length).toBe(18)
  })

  it('skips cells outside the mask', () => {
    const g = { ...flatCell(0), cellInMask: [false] }
    expect(buildTerrainMesh(g, { exaggeration: 3, ortho: ORTHO }).positions.length).toBe(0)
  })

  it('lifts every vertex to height × exaggeration', () => {
    const { positions } = buildTerrainMesh(flatCell(2), { exaggeration: 3, ortho: ORTHO })
    for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBeCloseTo(6, 6) // 2 m × 3
  })

  it('gives a flat surface an up normal', () => {
    const { normals } = buildTerrainMesh(flatCell(5), { exaggeration: 3, ortho: ORTHO })
    for (let i = 0; i < normals.length; i += 3) {
      expect(normals[i]).toBeCloseTo(0, 6)
      expect(normals[i + 1]).toBeCloseTo(1, 6)
      expect(normals[i + 2]).toBeCloseTo(0, 6)
    }
  })

  it('emits unit-length normals on a slope', () => {
    // East-rising slope: h[c=1] higher than h[c=0].
    const g: BakedGrid = { cols: 2, rows: 2, xs: [0, 10], zs: [0, 10], h: [0, 5, 0, 5], cellInMask: [true], center: [-57.382, -37.708] }
    const { normals } = buildTerrainMesh(g, { exaggeration: 3, ortho: ORTHO })
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2])
      expect(len).toBeCloseTo(1, 6)
    }
    // Surface rises to the east → normal tilts west (nx < 0) somewhere.
    let sawWestTilt = false
    for (let i = 0; i < normals.length; i += 3) if (normals[i] < -1e-6) sawWestTilt = true
    expect(sawWestTilt).toBe(true)
  })

  it('keeps UVs within [0,1] for samples inside the ortho extent', () => {
    const { uvs } = buildTerrainMesh(flatCell(0), { exaggeration: 3, ortho: ORTHO })
    for (const uv of uvs) { expect(uv).toBeGreaterThanOrEqual(0); expect(uv).toBeLessThanOrEqual(1) }
  })
})

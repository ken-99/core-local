import { describe, it, expect } from 'vitest'
import { buildWaterMesh, connectedWetCells, type WaterGrid } from './waterMesh'

// Column of z-values from an interleaved [x,y,z,…] mesh.
function zsOf(mesh: number[]): number[] {
  const out: number[] = []
  for (let i = 2; i < mesh.length; i += 3) out.push(mesh[i])
  return out
}

// 6×6 vertices → 5×5 cells. All dry (h=10) except a low left edge (the sea, so
// column-0 cells flood and reach the grid boundary) and one low vertex dead in
// the interior (a dune hollow, wetting its four cells but touching no edge).
function seaAndPool(): WaterGrid {
  const cols = 6, rows = 6
  const h: number[] = new Array(cols * rows).fill(10)
  for (let r = 0; r < rows; r++) h[r * cols + 0] = 0 // sea along the left edge
  h[2 * cols + 3] = 0 // isolated interior hollow at vertex (row 2, col 3)
  return {
    cols, rows,
    xs: [0, 10, 20, 30, 40, 50], zs: [0, 10, 20, 30, 40, 50],
    h, cellInMask: new Array((cols - 1) * (rows - 1)).fill(true),
  }
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
    expect(buildWaterMesh(oneCell([10, 10, 10, 10]), 5).positions).toEqual([])
  })

  it('covers the full cell (2 triangles) when the whole cell is underwater', () => {
    expect(buildWaterMesh(oneCell([0, 0, 0, 0]), 5).positions.length).toBe(18)
  })

  it('emits a flat surface — every vertex sits at y=0', () => {
    const { positions } = buildWaterMesh(oneCell([0, 0, 10, 10]), 5)
    expect(positions.length).toBeGreaterThan(0)
    for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBe(0)
  })

  it('cuts the waterline at the interpolated iso-height, not the cell edge', () => {
    const z = zsOf(buildWaterMesh(oneCell([0, 0, 10, 10]), 5).positions)
    expect(Math.max(...z)).toBeCloseTo(5, 6)
    expect(Math.min(...z)).toBeCloseTo(0, 6)
  })

  it('advances up the slope as the tide rises', () => {
    const g = oneCell([0, 0, 10, 10])
    const reach = (w: number) => Math.max(...zsOf(buildWaterMesh(g, w).positions))
    expect(reach(7)).toBeGreaterThan(reach(3))
  })

  it('never floods a cell whose centre is outside the mask', () => {
    expect(buildWaterMesh(oneCell([0, 0, 0, 0], false), 5).positions).toEqual([])
  })

  // Multi-cell grids — exercise the row-major indexing (h[r*cols+c],
  // cellInMask[r*(cols-1)+c], xs[c+1]/zs[r+1]) the single-cell tests never hit.
  it('covers every in-mask cell across a 3×2 grid (2 cells wide)', () => {
    const g: WaterGrid = {
      cols: 3, rows: 2, xs: [0, 10, 20], zs: [0, 10],
      h: [0, 0, 0, 0, 0, 0], cellInMask: [true, true],
    }
    const { positions } = buildWaterMesh(g, 5)
    expect(positions.length).toBe(36) // 2 cells × 2 triangles × 3 verts × 3 coords
    const xs: number[] = []
    for (let i = 0; i < positions.length; i += 3) xs.push(positions[i])
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(20) // right column read via xs[c+1]=xs[2]
  })

  it('masks the correct cell by column index (cellInMask[c])', () => {
    const g: WaterGrid = {
      cols: 3, rows: 2, xs: [0, 10, 20], zs: [0, 10],
      h: [0, 0, 0, 0, 0, 0], cellInMask: [false, true], // only the right cell
    }
    const { positions } = buildWaterMesh(g, 5)
    expect(positions.length).toBe(18)
    const xs: number[] = []
    for (let i = 0; i < positions.length; i += 3) xs.push(positions[i])
    expect(Math.min(...xs)).toBe(10) // right cell only → x in [10,20]
    expect(Math.max(...xs)).toBe(20)
  })

  it('covers stacked cells across a 2×3 grid (row indexing)', () => {
    const g: WaterGrid = {
      cols: 2, rows: 3, xs: [0, 10], zs: [0, 10, 20],
      h: [0, 0, 0, 0, 0, 0], cellInMask: [true, true],
    }
    const { positions } = buildWaterMesh(g, 5)
    expect(positions.length).toBe(36)
    const zs: number[] = []
    for (let i = 2; i < positions.length; i += 3) zs.push(positions[i])
    expect(Math.max(...zs)).toBe(20) // bottom row read via zs[r+1]=zs[2]
  })

  // Per-vertex depth — how far the water stands above the terrain at each vertex.
  // Feeds the depth-shaded colour ramp; the clip already lands exactly on the
  // waterline, so depth there is 0 by construction.
  it('reports one depth per emitted vertex', () => {
    const mesh = buildWaterMesh(oneCell([0, 0, 10, 10]), 5)
    expect(mesh.positions.length).toBeGreaterThan(0)
    expect(mesh.depths.length).toBe(mesh.positions.length / 3)
  })

  it('reports depth as the water height above the terrain', () => {
    const mesh = buildWaterMesh(oneCell([2, 2, 2, 2]), 5) // flat floor 3 m under
    expect(mesh.depths.length).toBeGreaterThan(0)
    for (const d of mesh.depths) expect(d).toBeCloseTo(3, 6)
  })

  it('reports zero depth at the waterline and full depth at the deepest corner', () => {
    const mesh = buildWaterMesh(oneCell([0, 0, 10, 10]), 5)
    expect(Math.min(...mesh.depths)).toBeCloseTo(0, 6)
    expect(Math.max(...mesh.depths)).toBeCloseTo(5, 6)
  })

  it('never reports a negative depth', () => {
    const mesh = buildWaterMesh(oneCell([0, 4.9, 10, 10]), 5)
    for (const d of mesh.depths) expect(d).toBeGreaterThanOrEqual(0)
  })

  it('renders only sea-connected water, not interior pools', () => {
    // Sea along the left edge (x∈[0,10]); a lone hollow in the interior at
    // x≈20–40. If the isolated pool leaked in, some vertex would land past x=15.
    const { positions } = buildWaterMesh(seaAndPool(), 5)
    expect(positions.length).toBeGreaterThan(0)
    const xs: number[] = []
    for (let i = 0; i < positions.length; i += 3) xs.push(positions[i])
    expect(Math.max(...xs)).toBeLessThan(15)
  })
})

describe('connectedWetCells', () => {
  const CW = 5 // cells per row = cols - 1
  const at = (keep: boolean[], r: number, c: number) => keep[r * CW + c]

  it('keeps water that reaches the survey edge (the sea)', () => {
    const keep = connectedWetCells(seaAndPool(), 5)
    for (let r = 0; r < 5; r++) expect(at(keep, r, 0)).toBe(true)
  })

  it('drops an interior hollow with no path to the edge', () => {
    const keep = connectedWetCells(seaAndPool(), 5)
    // The low vertex (2,3) wets its four surrounding cells; none touch an edge.
    for (const [r, c] of [[1, 2], [1, 3], [2, 2], [2, 3]] as const) {
      expect(at(keep, r, c)).toBe(false)
    }
  })

  // Documented limit, pinned so nobody "fixes" it into an outer-edge-only seed:
  // ANY boundary cell seeds the fill, including the landward edge. Nothing is
  // surveyed past that edge, so we can't know water wouldn't arrive there —
  // LEVEL_MAX is what keeps this from showing in the demo, not this function.
  it('keeps a hollow that reaches any survey edge, seaward or not', () => {
    const g = seaAndPool()
    // Low vertex on the far (landward) edge, kept clear of the interior hollow
    // so the two can't merge — otherwise this would prove nothing.
    g.h[4 * g.cols + 5] = 0
    const keep = connectedWetCells(g, 5)
    // Its two cells sit on the right boundary, so they count as connected.
    expect(at(keep, 3, 4)).toBe(true)
    expect(at(keep, 4, 4)).toBe(true)
    // The genuinely interior hollow is still dropped.
    expect(at(keep, 2, 2)).toBe(false)
  })

  it('keeps every wet cell when the whole survey is underwater', () => {
    const g = seaAndPool()
    const keep = connectedWetCells({ ...g, h: g.h.map(() => 0) }, 5)
    expect(keep.every(Boolean)).toBe(true)
  })
})

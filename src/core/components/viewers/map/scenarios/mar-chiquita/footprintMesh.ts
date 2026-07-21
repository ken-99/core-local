/**
 * The survey footprint as a flat "site-plan" plate on the ground (y = 0): a
 * semi-transparent fill under the relief plus a crisp boundary outline, so the
 * 3D terrain reads as elevated massing on its surveyed plot.
 *
 * Shares the grid's own `xs`/`zs` cell mapping with `buildTerrainMesh`, so the
 * plate lines up exactly with the ground and water. The plate is drawn from a
 * GROWN copy of the same trimmed mask: the relief's base sits at ground level,
 * so an un-grown plate would hide directly beneath it — the margin is what leaves
 * a visible rim all around.
 */

/** Just the fields the footprint needs from a baked grid — no heights. */
export interface FootprintGrid {
  cols: number
  rows: number
  xs: number[]
  zs: number[]
  cellInMask: boolean[]
}

export interface FootprintMesh {
  /** Interleaved [x,y,z,…] triangle vertices for the fill, all at y = 0. */
  fill: number[]
  /** Interleaved [x,y,z,…] endpoint pairs for the boundary line segments. */
  outline: number[]
}

/**
 * Dilate a cell mask outward by `margin` cells — the inverse of `trimMaskEdges`.
 * A cell turns on if any cell within Chebyshev distance `margin` is on; cells
 * outside the grid count as off, so growth clamps at the grid edge. `margin = 0`
 * returns an unchanged copy.
 */
export function growMask(
  mask: boolean[],
  cellCols: number,
  cellRows: number,
  margin: number,
): boolean[] {
  if (margin <= 0) return mask.slice()
  const at = (r: number, c: number) =>
    r >= 0 && r < cellRows && c >= 0 && c < cellCols && mask[r * cellCols + c]
  const out = new Array<boolean>(cellCols * cellRows).fill(false)
  for (let r = 0; r < cellRows; r++) {
    for (let c = 0; c < cellCols; c++) {
      let on = false
      for (let dr = -margin; dr <= margin && !on; dr++) {
        for (let dc = -margin; dc <= margin && !on; dc++) {
          if (at(r + dr, c + dc)) on = true
        }
      }
      out[r * cellCols + c] = on
    }
  }
  return out
}

/**
 * Build the footprint plate for `grid`, grown outward by `marginCells`.
 *
 * `fill` is two triangles per grown-mask cell, all at y = 0 (lift the mesh in the
 * scene, as the water does). `outline` is a line segment for every grown-mask
 * cell edge whose across-neighbour is off — i.e. the plate boundary, with shared
 * interior edges left out.
 */
export function buildFootprintMesh(grid: FootprintGrid, marginCells: number): FootprintMesh {
  const { cols, rows, xs, zs, cellInMask } = grid
  const cellCols = cols - 1
  const cellRows = rows - 1
  const mask = growMask(cellInMask, cellCols, cellRows, marginCells)
  const on = (r: number, c: number) =>
    r >= 0 && r < cellRows && c >= 0 && c < cellCols && mask[r * cellCols + c]

  const fill: number[] = []
  const outline: number[] = []
  for (let r = 0; r < cellRows; r++) {
    for (let c = 0; c < cellCols; c++) {
      if (!mask[r * cellCols + c]) continue
      const x0 = xs[c], x1 = xs[c + 1], z0 = zs[r], z1 = zs[r + 1]
      // Corners A(x0,z0) B(x1,z0) C(x1,z1) D(x0,z1). Two tris A,B,C and A,C,D —
      // same winding as the ground; drawn double-sided, so it reads either way.
      fill.push(x0, 0, z0, x1, 0, z0, x1, 0, z1)
      fill.push(x0, 0, z0, x1, 0, z1, x0, 0, z1)
      // A side is on the boundary when the cell across it is off.
      if (!on(r - 1, c)) outline.push(x0, 0, z0, x1, 0, z0) // top    (z0)
      if (!on(r + 1, c)) outline.push(x0, 0, z1, x1, 0, z1) // bottom (z1)
      if (!on(r, c - 1)) outline.push(x0, 0, z0, x0, 0, z1) // left   (x0)
      if (!on(r, c + 1)) outline.push(x1, 0, z0, x1, 0, z1) // right  (x1)
    }
  }
  return { fill, outline }
}

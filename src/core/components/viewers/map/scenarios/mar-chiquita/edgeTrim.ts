/**
 * Shrink a cell mask by removing its outermost ring, `passes` times. A cell
 * survives a pass only if all four of its edge-neighbours are also in the mask,
 * so lone cells and thin spurs disappear and the outline pulls inward.
 *
 * Cells outside the grid count as NOT in the mask, so the edge of the grid
 * erodes like any other boundary. `passes = 0` returns an unchanged copy.
 *
 * Why this exists: the survey mask comes from the height file's nodata flags, so
 * the boundary is whatever the drone happened to cover — including seven cells
 * that dangle off the edge on their own and read as spikes. One pass drops 3.6%
 * of the surveyed area and takes those with it.
 *
 * `cellCols`/`cellRows` are CELL counts — one less than the grid's vertex
 * `cols`/`rows` in each direction.
 */
export function trimMaskEdges(
  mask: boolean[],
  cellCols: number,
  cellRows: number,
  passes: number,
): boolean[] {
  let keep = mask.slice()
  for (let p = 0; p < passes; p++) {
    const prev = keep
    const at = (r: number, c: number) =>
      r >= 0 && r < cellRows && c >= 0 && c < cellCols && prev[r * cellCols + c]
    const next = new Array<boolean>(cellCols * cellRows).fill(false)
    for (let r = 0; r < cellRows; r++) {
      for (let c = 0; c < cellCols; c++) {
        next[r * cellCols + c] =
          at(r, c) && at(r - 1, c) && at(r + 1, c) && at(r, c - 1) && at(r, c + 1)
      }
    }
    keep = next
  }
  return keep
}

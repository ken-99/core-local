/**
 * Grid of terrain samples for the receding waterline. Local frame: x=east,
 * z=−north metres around the grid center. `h` is the terrain height. `cellInMask`
 * gates each cell to the captured area so nodata margins never flood.
 */
export interface WaterGrid {
  cols: number
  rows: number
  /** local east metres per column, length `cols` */
  xs: number[]
  /** local −north metres per row, length `rows` */
  zs: number[]
  /** terrain height (m), row-major `h[row*cols + col]`, length cols*rows */
  h: number[]
  /** cell-centre-in-mask, row-major `cellInMask[row*(cols-1) + col]`, length (cols-1)*(rows-1) */
  cellInMask: boolean[]
}

interface WaterPt { x: number; z: number; h: number }

/** A wet polygon corner: position plus how deep the water stands there. */
interface WetPt { x: number; z: number; depth: number }

/**
 * Clip a terrain triangle to the underwater side (h < waterAltitude) and return
 * the wet polygon's corners in order (x,z) with each one's depth. Sutherland–Hodgman
 * against the single iso-height plane — unambiguous, no marching-squares saddle case.
 * Corners cut on the plane sit exactly at the waterline, so their depth is 0.
 */
function clipTriangleBelow(tri: WaterPt[], waterAltitude: number): WetPt[] {
  const out: WetPt[] = []
  for (let i = 0; i < tri.length; i++) {
    const a = tri[i]
    const b = tri[(i + 1) % tri.length]
    const aWet = a.h < waterAltitude
    const bWet = b.h < waterAltitude
    if (aWet) out.push({ x: a.x, z: a.z, depth: waterAltitude - a.h })
    if (aWet !== bWet) {
      const t = (waterAltitude - a.h) / (b.h - a.h)
      out.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z), depth: 0 })
    }
  }
  return out
}

/**
 * Which in-mask cells hold water that connects to the sea. The sea enters from
 * outside the surveyed area, so real flooding must trace back to the survey's
 * edge; a hollow in the dunes that sits below the water level but has no path to
 * that edge would never actually fill (the classic "bathtub" artefact). Seed a
 * flood-fill from every wet cell on the survey boundary and keep only the wet
 * cells it reaches — dropping the interior pools.
 *
 * NOTE the limit: the seed is EVERY boundary cell, including the inland edge, so
 * low ground that reaches the landward boundary still counts as connected. We
 * can't do better — nothing is surveyed beyond that edge, so whether water could
 * arrive there is unknowable from this data. What keeps the demo honest is
 * `LEVEL_MAX`, tuned to sit below the level where any boundary cell floods; see
 * the note on it in `constants.ts`. Do not "fix" this into an outer-edge-only
 * seed — the survey diamond is rotated, so no edge is reliably the seaward one.
 *
 * Returns one boolean per cell, indexed like `cellInMask` (`[r*(cols-1)+c]`).
 */
export function connectedWetCells(grid: WaterGrid, waterAltitude: number): boolean[] {
  const { cols, rows, h, cellInMask } = grid
  const cw = cols - 1
  const ch = rows - 1
  const idx = (r: number, c: number) => r * cw + c
  const inMask = (r: number, c: number) =>
    r >= 0 && r < ch && c >= 0 && c < cw && cellInMask[idx(r, c)]
  // A cell holds water if any of its four corners is below the level.
  const wet = (r: number, c: number) =>
    inMask(r, c) && (
      h[r * cols + c] < waterAltitude ||
      h[r * cols + c + 1] < waterAltitude ||
      h[(r + 1) * cols + c + 1] < waterAltitude ||
      h[(r + 1) * cols + c] < waterAltitude
    )
  // A cell can be fed from outside the survey if it sits on the grid edge or
  // borders a cell outside the mask — i.e. the surveyed area's own boundary.
  const onBoundary = (r: number, c: number) =>
    !inMask(r - 1, c) || !inMask(r + 1, c) || !inMask(r, c - 1) || !inMask(r, c + 1)

  const keep = new Array<boolean>(cw * ch).fill(false)
  const stack: Array<[number, number]> = []
  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      if (wet(r, c) && onBoundary(r, c)) { keep[idx(r, c)] = true; stack.push([r, c]) }
    }
  }
  const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
  while (stack.length) {
    const [r, c] = stack.pop()!
    for (const [dr, dc] of neighbours) {
      const nr = r + dr
      const nc = c + dc
      if (wet(nr, nc) && !keep[idx(nr, nc)]) { keep[idx(nr, nc)] = true; stack.push([nr, nc]) }
    }
  }
  return keep
}

/** A built water surface: triangle positions plus a depth per vertex. */
export interface WaterMesh {
  /** interleaved [x,y,z, …] triangle positions, y always 0 */
  positions: number[]
  /** water depth (m) at each vertex, `positions.length / 3` long */
  depths: number[]
}

/**
 * Terrain-derived water surface. Split each in-mask cell into two terrain
 * triangles, clip each to the part below `waterAltitude`, and fan-triangulate the
 * wet polygon. Output is a flat footprint at y=0; the caller lifts it to the water
 * height via the model matrix, so the horizontal edge is the DEM's iso-height
 * contour at the current level. Each vertex also carries its depth, which the
 * clip gives for free — waterline corners land on the plane at depth 0.
 */
export function buildWaterMesh(grid: WaterGrid, waterAltitude: number): WaterMesh {
  const { cols, rows, xs, zs, h } = grid
  // Only render water that connects back to the sea — no isolated inland pools.
  const keep = connectedWetCells(grid, waterAltitude)
  const positions: number[] = []
  const depths: number[] = []
  const push = (p: WetPt) => {
    positions.push(p.x, 0, p.z)
    depths.push(p.depth)
  }
  const emit = (poly: WetPt[]) => {
    for (let k = 1; k < poly.length - 1; k++) {
      push(poly[0])
      push(poly[k])
      push(poly[k + 1])
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!keep[r * (cols - 1) + c]) continue
      const A: WaterPt = { x: xs[c], z: zs[r], h: h[r * cols + c] }
      const B: WaterPt = { x: xs[c + 1], z: zs[r], h: h[r * cols + c + 1] }
      const C: WaterPt = { x: xs[c + 1], z: zs[r + 1], h: h[(r + 1) * cols + c + 1] }
      const D: WaterPt = { x: xs[c], z: zs[r + 1], h: h[(r + 1) * cols + c] }
      emit(clipTriangleBelow([A, B, C], waterAltitude))
      emit(clipTriangleBelow([A, C, D], waterAltitude))
    }
  }
  return { positions, depths }
}

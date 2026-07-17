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
  const { cols, rows, xs, zs, h, cellInMask } = grid
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
      if (!cellInMask[r * (cols - 1) + c]) continue
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

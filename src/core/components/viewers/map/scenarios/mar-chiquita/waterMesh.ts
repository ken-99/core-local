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

/**
 * Clip a terrain triangle to the underwater side (h < waterAltitude) and return
 * the wet polygon's corners in order (x,z). Sutherland–Hodgman against the single
 * iso-height plane — unambiguous, no marching-squares saddle case.
 */
function clipTriangleBelow(tri: WaterPt[], waterAltitude: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < tri.length; i++) {
    const a = tri[i]
    const b = tri[(i + 1) % tri.length]
    const aWet = a.h < waterAltitude
    const bWet = b.h < waterAltitude
    if (aWet) out.push({ x: a.x, z: a.z })
    if (aWet !== bWet) {
      const t = (waterAltitude - a.h) / (b.h - a.h)
      out.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) })
    }
  }
  return out
}

/**
 * Terrain-derived water surface. Split each in-mask cell into two terrain
 * triangles, clip each to the part below `waterAltitude`, and fan-triangulate the
 * wet polygon. Output is a flat footprint at y=0; the caller lifts it to the water
 * height via the model matrix, so the horizontal edge is the DEM's iso-height
 * contour at the current level. Returns interleaved [x,y,z, …] triangle positions.
 */
export function buildWaterMesh(grid: WaterGrid, waterAltitude: number): number[] {
  const { cols, rows, xs, zs, h, cellInMask } = grid
  const verts: number[] = []
  const emit = (poly: { x: number; z: number }[]) => {
    for (let k = 1; k < poly.length - 1; k++) {
      verts.push(poly[0].x, 0, poly[0].z)
      verts.push(poly[k].x, 0, poly[k].z)
      verts.push(poly[k + 1].x, 0, poly[k + 1].z)
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
  return verts
}

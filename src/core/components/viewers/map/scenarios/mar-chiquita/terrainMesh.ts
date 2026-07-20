import type { BakedGrid } from './bakeGrid'
import { R_LAT, R_LNG } from './bakeGrid'

export interface TerrainMesh {
  positions: number[]
  normals: number[]
  uvs: number[]
}

/**
 * The drone DEM as a 3D ground surface. Two triangles per in-mask cell (same
 * masking and winding as `buildWaterMesh`), each vertex lifted to its real
 * height × `exaggeration`. Normals are computed once per grid sample by central
 * differences on the exaggerated height field — so shading matches the relief
 * you actually see — and shared by every vertex touching that sample (smooth
 * shading). UVs map each sample's reconstructed lng/lat into the ortho rectangle.
 */
export function buildTerrainMesh(
  grid: BakedGrid,
  opts: { exaggeration: number; ortho: [[number, number], [number, number], [number, number], [number, number]] },
): TerrainMesh {
  const { cols, rows, xs, zs, h, cellInMask, center } = grid
  const { exaggeration: k, ortho } = opts

  // Reconstruct geography for UVs (inverse of bakeGrid's projection).
  const kLng = R_LNG * Math.cos((center[1] * Math.PI) / 180)
  const wLng = ortho[0][0], nLat = ortho[0][1], eLng = ortho[2][0], sLat = ortho[2][1]
  const uOf = (c: number) => (center[0] + xs[c] / kLng - wLng) / (eLng - wLng)
  const vOf = (r: number) => (center[1] - zs[r] / R_LAT - nLat) / (sLat - nLat)

  // Per-sample normal from exaggerated central differences (one-sided at edges).
  const at = (r: number, c: number) => h[r * cols + c]
  const normalAt = (r: number, c: number): [number, number, number] => {
    const cL = Math.max(0, c - 1), cR = Math.min(cols - 1, c + 1)
    const rU = Math.max(0, r - 1), rD = Math.min(rows - 1, r + 1)
    const dhdx = (k * (at(r, cR) - at(r, cL))) / (xs[cR] - xs[cL] || 1)
    const dhdz = (k * (at(rD, c) - at(rU, c))) / (zs[rD] - zs[rU] || 1)
    const nx = -dhdx, ny = 1, nz = -dhdz
    const len = Math.hypot(nx, ny, nz) || 1
    return [nx / len, ny / len, nz / len]
  }

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const push = (r: number, c: number) => {
    positions.push(xs[c], at(r, c) * k, zs[r])
    const n = normalAt(r, c)
    normals.push(n[0], n[1], n[2])
    uvs.push(uOf(c), vOf(r))
  }
  const tri = (a: [number, number], b: [number, number], d: [number, number]) => {
    push(a[0], a[1]); push(b[0], b[1]); push(d[0], d[1])
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!cellInMask[r * (cols - 1) + c]) continue
      // Corners A(r,c) B(r,c+1) C(r+1,c+1) D(r+1,c). Two tris: A,B,C and A,C,D.
      tri([r, c], [r, c + 1], [r + 1, c + 1])
      tri([r, c], [r + 1, c + 1], [r + 1, c])
    }
  }
  return { positions, normals, uvs }
}

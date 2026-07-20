import type { BakedGrid } from './bakeGrid'

/** A built pedestal: wall triangles plus how far down each corner sits. */
export interface SkirtMesh {
  /** interleaved [x,y,z,…] triangle positions */
  positions: number[]
  /** 0 at the top of a wall, 1 at its base — drives the vertical gradient */
  t: number[]
}

/**
 * Vertical walls around the edge of the survey, dropping from the ground down to
 * a flat base, so the relief reads as a solid slab of ground lifted out rather
 * than a sheet ending in mid-air. A stepped outline seen side-on as a wall face
 * reads as deliberate; the same outline seen against sky reads as unfinished.
 *
 * A wall is emitted for every edge where an in-mask cell meets one outside the
 * mask — the survey's true perimeter. The mask is read from `grid.cellInMask`,
 * as in `buildTerrainMesh` and `buildWaterMesh`, so passing the same grid to all
 * three is what keeps the pedestal lined up with the ground it holds up.
 *
 * Heights are exaggerated to match `buildTerrainMesh`: wall tops must sit exactly
 * on the ground mesh or the pedestal detaches. That is why the exaggeration is an
 * argument here rather than read from `constants` — the two must not drift.
 */
export function buildSkirtMesh(
  grid: BakedGrid,
  opts: { exaggeration: number; depthBelowLowest: number },
): SkirtMesh {
  const { cols, rows, xs, zs, h, cellInMask } = grid
  const { exaggeration: k, depthBelowLowest } = opts
  const cw = cols - 1
  const ch = rows - 1
  const inMask = (r: number, c: number) =>
    r >= 0 && r < ch && c >= 0 && c < cw && cellInMask[r * cw + c]
  const hAt = (r: number, c: number) => h[r * cols + c]

  // The base sits a fixed drop below the lowest ground actually being drawn —
  // not the lowest in the file, which may be under a cell the mask excludes.
  let lowest = Infinity
  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      if (!inMask(r, c)) continue
      for (const [rr, cc] of [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] as const) {
        if (hAt(rr, cc) < lowest) lowest = hAt(rr, cc)
      }
    }
  }
  if (!Number.isFinite(lowest)) return { positions: [], t: [] }
  const baseY = (lowest - depthBelowLowest) * k

  const positions: number[] = []
  const t: number[] = []
  // One quad, as two triangles: (top0, top1, base1) and (top0, base1, base0).
  const wall = (x0: number, z0: number, h0: number, x1: number, z1: number, h1: number) => {
    const y0 = h0 * k
    const y1 = h1 * k
    positions.push(x0, y0, z0, x1, y1, z1, x1, baseY, z1)
    t.push(0, 0, 1)
    positions.push(x0, y0, z0, x1, baseY, z1, x0, baseY, z0)
    t.push(0, 1, 1)
  }

  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      if (!inMask(r, c)) continue
      // North edge, z = zs[r] — exposed when the cell above is outside the mask.
      if (!inMask(r - 1, c)) wall(xs[c], zs[r], hAt(r, c), xs[c + 1], zs[r], hAt(r, c + 1))
      // South edge, z = zs[r+1].
      if (!inMask(r + 1, c)) wall(xs[c], zs[r + 1], hAt(r + 1, c), xs[c + 1], zs[r + 1], hAt(r + 1, c + 1))
      // West edge, x = xs[c].
      if (!inMask(r, c - 1)) wall(xs[c], zs[r], hAt(r, c), xs[c], zs[r + 1], hAt(r + 1, c))
      // East edge, x = xs[c+1].
      if (!inMask(r, c + 1)) wall(xs[c + 1], zs[r], hAt(r, c + 1), xs[c + 1], zs[r + 1], hAt(r + 1, c + 1))
    }
  }
  return { positions, t }
}

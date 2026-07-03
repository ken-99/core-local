// Local astronomical tide prediction by harmonic analysis — Act 3.
//
// SHOM's open flux only serves observations (sources=1 raw, sources=2 validated,
// which lags and ≈ the raw signal), so there is no live tide *prediction* to
// subtract for a real storm-surge residual. Instead we fit the astronomical
// tide from the gauge's own recent record: a least-squares fit of the dominant
// tidal constituents (fixed known frequencies) to the observed heights. The
// fitted model predicts the tide at ANY instant — past, present, future — so
// `surge = observed − predicted` becomes a real sub-tidal residual, and the
// prediction never lags. Pure math: no React, no network. Unit-testable.
import type { TidePoint } from './act3'

export interface Constituent { name: string; periodHours: number }

/**
 * Principal tidal constituents. Semidiurnal M2/S2/N2 + diurnal K1/O1 carry the
 * bulk of the signal; M4/MS4 (quarter-diurnal overtides) matter in a shallow
 * macrotidal port like Roscoff. A ~28-day record separates all of these by the
 * Rayleigh criterion; nearby pairs that need much longer records (K2≈S2, P1≈K1)
 * are deliberately omitted rather than fit unstably.
 */
export const TIDAL_CONSTITUENTS: Constituent[] = [
  { name: 'M2', periodHours: 12.4206012 },
  { name: 'S2', periodHours: 12.0000000 },
  { name: 'N2', periodHours: 12.6583475 },
  { name: 'K1', periodHours: 23.9344696 },
  { name: 'O1', periodHours: 25.8193417 },
  { name: 'M4', periodHours: 6.2103006 },
  { name: 'MS4', periodHours: 6.1033393 },
]

export interface TideModel {
  t0: number                                        // epoch ms the phase is measured from
  mean: number                                      // Z0 — mean water level
  terms: { omega: number; A: number; B: number }[]  // per constituent: A cos + B sin, omega in rad/hour
}

/** Solve the linear system M·x = b (n×n) by Gauss-Jordan with partial pivoting. */
function solveLinear(M: number[][], b: number[]): number[] | null {
  const n = b.length
  const A = M.map((row, i) => [...row, b[i]]) // augmented [M | b]
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    if (Math.abs(A[piv][col]) < 1e-12) return null // singular
    ;[A[col], A[piv]] = [A[piv], A[col]]
    const d = A[col][col]
    for (let j = col; j <= n; j++) A[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = A[r][col]
      if (f === 0) continue
      for (let j = col; j <= n; j++) A[r][j] -= f * A[col][j]
    }
  }
  return A.map(row => row[n])
}

/**
 * Fit the astronomical tide to `points` by least squares at the fixed
 * constituent frequencies. Returns null if there are too few points to
 * determine the coefficients or the system is singular.
 */
export function fitTide(points: TidePoint[], constituents = TIDAL_CONSTITUENTS): TideModel | null {
  const ncol = 1 + 2 * constituents.length
  if (points.length < ncol) return null
  const t0 = points[0].t
  const omegas = constituents.map(c => (2 * Math.PI) / c.periodHours) // rad per hour
  const M = Array.from({ length: ncol }, () => new Array(ncol).fill(0))
  const r = new Array(ncol).fill(0)
  const row = new Array(ncol)
  for (const p of points) {
    const tau = (p.t - t0) / 3_600_000 // hours from t0
    row[0] = 1
    for (let k = 0; k < omegas.length; k++) {
      row[1 + 2 * k] = Math.cos(omegas[k] * tau)
      row[2 + 2 * k] = Math.sin(omegas[k] * tau)
    }
    for (let a = 0; a < ncol; a++) {
      r[a] += row[a] * p.v
      for (let b = a; b < ncol; b++) M[a][b] += row[a] * row[b] // upper triangle
    }
  }
  for (let a = 0; a < ncol; a++) for (let b = 0; b < a; b++) M[a][b] = M[b][a] // mirror (symmetric)
  const x = solveLinear(M, r)
  if (!x) return null
  return { t0, mean: x[0], terms: omegas.map((omega, k) => ({ omega, A: x[1 + 2 * k], B: x[2 + 2 * k] })) }
}

/** Predicted astronomical height (m) at epoch-ms `t`. */
export function predictTide(model: TideModel, t: number): number {
  const tau = (t - model.t0) / 3_600_000
  let h = model.mean
  for (const { omega, A, B } of model.terms) h += A * Math.cos(omega * tau) + B * Math.sin(omega * tau)
  return h
}

/** Predicted series at the SAME timestamps as `points` (for plotting/residual). */
export function predictSeries(model: TideModel, points: TidePoint[]): TidePoint[] {
  return points.map(p => ({ t: p.t, v: predictTide(model, p.t) }))
}

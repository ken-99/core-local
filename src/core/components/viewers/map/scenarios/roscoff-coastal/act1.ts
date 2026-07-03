// Act 1 — "The Channel as a federation problem". Pure data + math: no React,
// no MapLibre, so the datum logic is unit-testable and the layer stays thin.
//
// The money shot: click a seabed point → the SAME depth expressed in several
// vertical frames, each labelled with its datum. EMODnet gives a real depth
// referenced to LAT (chart datum); we then DECLARE reversible offsets to show
// it in IGN69 (French land datum) and on the ellipsoid. That declared,
// per-layer, reversible transform IS the demo's thesis — provenance kept, not
// erased.
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson'
import { DATUM_LABEL, type Coord, type VerticalDatum } from './constants'

// --- Act 1 camera: Channel-wide (Brittany ↔ Cornwall). Mercator only. ---
export const CHANNEL_VIEW = { center: [-3.5, 49.6] as Coord, zoom: 7 } as const

// --- France–UK median line (illustrative, digitised). A styled reference line;
// also used to decide which national survey a clicked point falls under. ---
export const MEDIAN_LINE: Feature<LineString> = {
  type: 'Feature',
  properties: { name: 'France–UK median line (illustrative)' },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-6.2, 49.30], [-5.0, 49.60], [-3.5, 49.92],
      [-2.0, 49.95], [-0.8, 50.25], [0.6, 50.75], [1.45, 51.02],
    ],
  },
}

// --- Survey footprints, one per sovereign side. Toggleable. Each carries its
// operator + native vertical datum so the popup can name the provenance. ---
export const SURVEY_FOOTPRINTS: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { operator: 'SHOM', datum: 'LAT' as VerticalDatum, side: 'FR', color: '#2563eb' },
      geometry: { type: 'Polygon', coordinates: [[
        [-5.6, 48.3], [-1.6, 48.3], [-1.2, 49.7], [-5.4, 49.5], [-5.6, 48.3],
      ]] },
    },
    {
      type: 'Feature',
      properties: { operator: 'UKHO', datum: 'ODN_NEWLYN' as VerticalDatum, side: 'UK', color: '#dc2626' },
      geometry: { type: 'Polygon', coordinates: [[
        [-6.0, 49.7], [-1.4, 50.0], [-1.0, 51.0], [-6.2, 50.6], [-6.0, 49.7],
      ]] },
    },
  ],
}

/**
 * Declared vertical-datum offsets for the AOI (metres). ILLUSTRATIVE values,
 * kept explicit and in one place so they read as *declared* — the point of the
 * demo. Replaced by real per-point samples once BATHYELLI (LAT↔ellipsoid) and
 * the RAF geoid (IGN69↔ellipsoid) are ingested in Act 2.
 *   - LAT sits ~5.5 m BELOW IGN69 near Roscoff (very large tidal range).
 *   - The ellipsoid sits ~48 m BELOW the geoid/IGN69 in Brittany (geoid undulation N).
 */
export const DECLARED_OFFSETS = {
  latBelowIgn69_m: 5.5,   // IGN69 = LAT + this
  ign69BelowEllipsoid_m: 48.0, // ellipsoidal h = IGN69 orthometric H + this
  illustrative: true,
} as const

export interface DatumRow {
  datum: VerticalDatum
  label: string
  /** Signed height in metres: negative = below the datum surface (a depth). */
  value: number
  /** Real measurement vs a declared transform of it. */
  kind: 'measured' | 'declared'
}

/**
 * Express one EMODnet depth (metres below LAT, so normally negative) across the
 * vertical frames that meet in the Channel. Returns ≥2 differing datum-labelled
 * values — the Act 1 gate. `side` selects the relevant national land datum.
 */
export function datumRows(depthBelowLat_m: number, side: 'FR' | 'UK'): DatumRow[] {
  const { latBelowIgn69_m, ign69BelowEllipsoid_m } = DECLARED_OFFSETS
  const ign69 = depthBelowLat_m - latBelowIgn69_m           // deeper below land datum
  const ellipsoid = ign69 + ign69BelowEllipsoid_m           // ellipsoid is well below the geoid here
  const rows: DatumRow[] = [
    { datum: 'LAT', label: DATUM_LABEL.LAT, value: depthBelowLat_m, kind: 'measured' },
  ]
  if (side === 'UK') {
    // ODN Newlyn ≈ close to IGN69 numerically here; shown as the UK land frame,
    // display-only (we do not reconcile UK data — out of scope).
    rows.push({ datum: 'ODN_NEWLYN', label: DATUM_LABEL.ODN_NEWLYN, value: ign69, kind: 'declared' })
  } else {
    rows.push({ datum: 'IGN69', label: DATUM_LABEL.IGN69, value: ign69, kind: 'declared' })
  }
  rows.push({ datum: 'ELLIPSOID', label: DATUM_LABEL.ELLIPSOID, value: ellipsoid, kind: 'declared' })
  return rows
}

/** True north of the median line at this longitude → UK side; else FR side. */
export function sideOfMedian(lng: number, lat: number): 'FR' | 'UK' {
  const pts = MEDIAN_LINE.geometry.coordinates
  // Clamp to the line's longitude span, then linearly interpolate its latitude.
  if (lng <= pts[0][0]) return lat >= pts[0][1] ? 'UK' : 'FR'
  if (lng >= pts[pts.length - 1][0]) {
    const p = pts[pts.length - 1]
    return lat >= p[1] ? 'UK' : 'FR'
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (lng >= x0 && lng <= x1) {
      const f = (lng - x0) / (x1 - x0)
      const yOnLine = y0 + f * (y1 - y0)
      return lat >= yOnLine ? 'UK' : 'FR'
    }
  }
  return 'FR'
}

/** Web-mercator (EPSG:3857) metres from lng/lat — for building WMS pixel queries. */
export function lngLatToMerc(lng: number, lat: number): [number, number] {
  const R = 6378137
  const x = (lng * Math.PI / 180) * R
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))
  return [x, y]
}

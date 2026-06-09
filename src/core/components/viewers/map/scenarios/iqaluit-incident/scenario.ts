// Pure data + math for the synthetic "Iqaluit Warehouse Incident" demo.
// No React, no MapLibre — everything here is deterministic from its inputs so
// it can be unit-tested and so the layer can recompute cheaply each frame.
import type { FeatureCollection, Point, Polygon } from 'geojson'
import { destination } from '@turf/turf'

export type Lng = number
export type Lat = number
export type Coord = [Lng, Lat]
export type SymbolKind = 'aircraft' | 'vessel'

// --- Geography (seed values; tuned in-browser). Iqaluit / Frobisher Bay. ---
export const IQALUIT_CENTER: Coord = [-68.52, 63.75]
export const WAREHOUSE: Coord = [-68.508, 63.742] // sealift dock on the waterfront

// Warehouse footprint (a small rectangle ~80 m across) as a static polygon.
export const WAREHOUSE_FOOTPRINT: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-68.5092, 63.7416],
        [-68.5068, 63.7416],
        [-68.5068, 63.7424],
        [-68.5092, 63.7424],
        [-68.5092, 63.7416],
      ]],
    },
  }],
}

// --- Symbol paths. Aircraft near YFB (~[-68.556, 63.756]); vessels in the bay
// (SE of town: higher lng / lower lat). `speed` = path loops per time-unit. ---
export interface SymbolPath {
  id: string
  kind: SymbolKind
  path: Coord[]
  speed: number
  offset: number // phase offset in [0,1)
}

export const SYMBOLS: SymbolPath[] = [
  { id: 'air-1', kind: 'aircraft', speed: 0.55, offset: 0.0,
    path: [[-68.62, 63.80], [-68.58, 63.77], [-68.556, 63.756], [-68.50, 63.752]] },
  { id: 'air-2', kind: 'aircraft', speed: 0.32, offset: 0.4,
    path: [[-68.556, 63.756], [-68.57, 63.74], [-68.59, 63.725]] },
  { id: 'air-3', kind: 'aircraft', speed: 0.40, offset: 0.7,
    path: [[-68.49, 63.79], [-68.52, 63.77], [-68.556, 63.756]] },
  { id: 'sea-1', kind: 'vessel', speed: 0.28, offset: 0.0,
    path: [[-68.40, 63.69], [-68.45, 63.71], [-68.49, 63.735], [-68.506, 63.741]] },
  { id: 'sea-2', kind: 'vessel', speed: 0.22, offset: 0.3,
    path: [[-68.36, 63.66], [-68.42, 63.69], [-68.47, 63.715]] },
  { id: 'sea-3', kind: 'vessel', speed: 0.18, offset: 0.6,
    path: [[-68.506, 63.741], [-68.46, 63.72], [-68.40, 63.70]] },
  { id: 'sea-4', kind: 'vessel', speed: 0.20, offset: 0.15,
    path: [[-68.34, 63.71], [-68.40, 63.70], [-68.46, 63.71]] },
]

const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u)

/** Linear interpolation along a polyline at progress `u` in [0,1] (clamped). */
export function interpAlong(path: Coord[], u: number): Coord {
  if (path.length === 0) throw new Error('interpAlong: path must not be empty')
  if (path.length === 1) return path[0]
  const cu = clamp01(u)
  const segs = path.length - 1
  const f = cu * segs
  const i = Math.min(Math.floor(f), segs - 1)
  const frac = f - i
  const [ax, ay] = path[i]
  const [bx, by] = path[i + 1]
  return [ax + (bx - ax) * frac, ay + (by - ay) * frac]
}

export const MAX_PARCEL_AGE = 60 // age (time-units) at which a parcel has fully dissipated

export interface Parcel {
  position: Coord
  weight: number     // 0..1 heatmap weight; fades with age
  distanceKm: number // distance travelled from the warehouse
}

/**
 * Advect one smoke parcel of the given `age` downwind. `windBearing` is the
 * compass direction (deg, 0=N, 90=E) the smoke drifts TOWARD; `windSpeed` is in
 * knots. Lateral wander grows with age to read as billowing. Pure/deterministic.
 */
export function advectParcel(age: number, windBearing: number, windSpeed: number): Parcel {
  if (age < 0) return { position: WAREHOUSE, weight: 0, distanceKm: 0 }
  // drift per time-unit: ~0.04 km buoyancy base + 0.004 km per knot of wind
  const distanceKm = (0.04 + windSpeed * 0.004) * age
  // deterministic lateral wobble (no RNG) — small bearing oscillation, growing with age
  const wobbleDeg = Math.sin(age * 0.6) * 6 * Math.min(1, age / 20)
  const bearing = windBearing + wobbleDeg
  const dest = destination(WAREHOUSE, distanceKm, bearing, { units: 'kilometers' })
  const [lng, lat] = dest.geometry.coordinates as Coord
  const weight = Math.max(0, 1 - age / MAX_PARCEL_AGE)
  return { position: [lng, lat], weight, distanceKm }
}

const PARCEL_COUNT = 28        // parcels emitted along the plume
const PARCEL_EMIT_SPACING = 2  // age gap (time-units) between consecutive parcels

const pointFC = (
  features: { coord: Coord; props: Record<string, unknown> }[],
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: features.map(({ coord, props }) => ({
    type: 'Feature',
    properties: props,
    geometry: { type: 'Point', coordinates: coord },
  })),
})

/** Fire intensity in [0.6, 1.0], flickering deterministically with time. */
export function flicker(t: number): number {
  const base = 0.8
  const amp = 0.2 * (0.6 * Math.sin(t * 9.0) + 0.4 * Math.sin(t * 23.0))
  const v = base + amp
  return v < 0.6 ? 0.6 : v > 1 ? 1 : v
}

/** Current position of every symbol at time `t`, tagged by kind. */
export function symbolCollection(t: number): FeatureCollection<Point> {
  return pointFC(SYMBOLS.map(s => ({
    coord: interpAlong(s.path, (t * s.speed + s.offset) % 1),
    props: { id: s.id, kind: s.kind },
  })))
}

/** The drifting smoke plume as weighted points feeding the smoke heatmap. */
export function smokeParcelCollection(
  t: number, windBearing: number, windSpeed: number,
): FeatureCollection<Point> {
  const emitRate = 6 // age advanced per time-unit at the source
  const features: { coord: Coord; props: Record<string, unknown> }[] = []
  for (let i = 0; i < PARCEL_COUNT; i++) {
    // each parcel's age = elapsed-since-emission; staggered by spacing, looping
    const age = ((t * emitRate) - i * PARCEL_EMIT_SPACING + MAX_PARCEL_AGE * 100) % MAX_PARCEL_AGE
    const p = advectParcel(age, windBearing, windSpeed)
    if (p.weight <= 0) continue
    features.push({ coord: p.position, props: { weight: p.weight } })
  }
  return pointFC(features)
}

/** Single weighted fire point at the warehouse (weight = flicker). */
export function fireCollection(t: number): FeatureCollection<Point> {
  return pointFC([{ coord: WAREHOUSE, props: { weight: flicker(t) } }])
}

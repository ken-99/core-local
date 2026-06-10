// Pure data + math for the synthetic "Iqaluit Warehouse Incident" demo.
// No React, no MapLibre — everything here is deterministic from its inputs so
// it can be unit-tested and so the layer can recompute cheaply each frame.
import type { FeatureCollection, Point, Polygon } from 'geojson'
import { destination, distance, bearing as turfBearing, circle } from '@turf/turf'

export type Lng = number
export type Lat = number
export type Coord = [Lng, Lat]
export type SymbolKind = 'aircraft' | 'vessel'

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

// --- Geography (seed values; tuned in-browser). Iqaluit / Frobisher Bay. ---
export const IQALUIT_CENTER: Coord = [-68.52, 63.75]
export const WAREHOUSE: Coord = [-68.508, 63.742] // sealift dock on the waterfront
// Active incident origin: fire seat, smoke source, wind arrow + evac-ring centre.
// Moved onto the loaded BIM building (just north, in the dock opening). Kept as the
// single source of truth so DEMO_BIM_PLACEMENT and the incident stay locked together.
export const INCIDENT_ORIGIN: Coord = [-68.5049729892321, 63.744153446098714]

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

// --- Evacuation zones: concentric annular bands around the fire. Red innermost
// (a solid disk), then orange / yellow / green bands. Each outer zone is an annulus
// (outer ring + inner hole) so band colours never overlap. Pure + static. ---
export const EVAC_RADII_KM = [0.3, 0.6, 1.0, 1.6]
const EVAC_ZONES: { zone: string; color: string }[] = [
  { zone: 'red', color: '#dc2626' },
  { zone: 'orange', color: '#f97316' },
  { zone: 'yellow', color: '#eab308' },
  { zone: 'green', color: '#22c55e' },
]

/** Four concentric evacuation bands centered on the incident origin. */
export function evacZoneCollection(): FeatureCollection<Polygon> {
  const ringCoords = (km: number): Coord[] =>
    circle(INCIDENT_ORIGIN, km, { steps: 64, units: 'kilometers' })
      .geometry.coordinates[0] as Coord[]
  const features = EVAC_RADII_KM.map((r, i) => {
    const rings: Coord[][] = [ringCoords(r)]
    if (i > 0) rings.push(ringCoords(EVAC_RADII_KM[i - 1])) // hole = next-smaller circle
    return {
      type: 'Feature' as const,
      properties: { zone: EVAC_ZONES[i].zone, color: EVAC_ZONES[i].color },
      geometry: { type: 'Polygon' as const, coordinates: rings },
    }
  })
  return { type: 'FeatureCollection', features }
}

// --- Symbol paths. Aircraft around YFB (~[-68.556, 63.756]) + its SE approach;
// vessels in Koojesse Inlet / Frobisher Bay (SE of town: less-negative lng + lower
// lat = open water). `speed` is GROUND velocity in km per time-unit, so plane vs
// boat pace is physically comparable regardless of path length. ---
export interface SymbolPath {
  id: string
  kind: SymbolKind
  path: Coord[]
  speed: number  // ground velocity, km per time-unit
  offset: number // phase offset in [0,1)
}

// Aircraft cruise ~4x faster than vessels. Each aircraft has a DISTINCT long
// corridor — only air-1 overflies the runway — so they don't pile up over YFB.
// Vessels run long bay transits kept SE / offshore (lat ≤ ~63.732 = open water).
export const SYMBOLS: SymbolPath[] = [
  // air-1: long straight-in approach from the SE → touchdown → rollout NNW (the runway user).
  { id: 'air-1', kind: 'aircraft', speed: 0.60, offset: 0.0,
    path: [[-68.420, 63.668], [-68.495, 63.715], [-68.540, 63.742], [-68.557, 63.752], [-68.555, 63.763], [-68.550, 63.773]] },
  // air-2: departure climbing out far to the NW — its own corridor, never over the runway.
  { id: 'air-2', kind: 'aircraft', speed: 0.55, offset: 0.5,
    path: [[-68.575, 63.760], [-68.615, 63.778], [-68.660, 63.800], [-68.710, 63.824]] },
  // air-3: low W→E transit SOUTH of the field, over the inlet — clear of the runway.
  { id: 'air-3', kind: 'aircraft', speed: 0.58, offset: 0.25,
    path: [[-68.585, 63.700], [-68.520, 63.718], [-68.450, 63.734], [-68.380, 63.750]] },
  // Vessels: CLOSED LOOPS — each circles its own patch of the inner harbour
  // ("the box"), auto-generated and validated against the OSM islands + coastline
  // (coastlineData.ts) so every loop stays in open water. Centers spread 2.3-2.8km.
  { id: 'sea-1', kind: 'vessel', speed: 0.14, offset: 0.0,
    path: [[-68.546,63.6993],[-68.54114,63.69892],[-68.53687,63.69782],[-68.5337,63.69615],[-68.53201,63.69409],[-68.53201,63.69191],[-68.5337,63.68985],[-68.53687,63.68818],[-68.54114,63.68708],[-68.546,63.6867],[-68.55086,63.68708],[-68.55513,63.68818],[-68.5583,63.68985],[-68.55999,63.69191],[-68.55999,63.69409],[-68.5583,63.69615],[-68.55513,63.69782],[-68.55086,63.69892],[-68.546,63.6993]] },
  { id: 'sea-2', kind: 'vessel', speed: 0.12, offset: 0.35,
    path: [[-68.442,63.70195],[-68.43818,63.70165],[-68.43482,63.70079],[-68.43233,63.69947],[-68.43101,63.69786],[-68.43101,63.69614],[-68.43233,63.69453],[-68.43483,63.69321],[-68.43818,63.69235],[-68.442,63.69205],[-68.44582,63.69235],[-68.44917,63.69321],[-68.45167,63.69453],[-68.45299,63.69614],[-68.45299,63.69786],[-68.45167,63.69947],[-68.44918,63.70079],[-68.44582,63.70165],[-68.442,63.70195]] },
  { id: 'sea-3', kind: 'vessel', speed: 0.13, offset: 0.6,
    path: [[-68.498,63.71795],[-68.49418,63.71765],[-68.49082,63.71679],[-68.48833,63.71547],[-68.487,63.71386],[-68.487,63.71214],[-68.48833,63.71053],[-68.49082,63.70921],[-68.49418,63.70835],[-68.498,63.70805],[-68.50182,63.70835],[-68.50518,63.70921],[-68.50767,63.71053],[-68.509,63.71214],[-68.509,63.71386],[-68.50767,63.71547],[-68.50518,63.71679],[-68.50182,63.71765],[-68.498,63.71795]] },
  { id: 'sea-4', kind: 'vessel', speed: 0.135, offset: 0.15,
    path: [[-68.49,63.69705],[-68.48688,63.6968],[-68.48413,63.6961],[-68.48209,63.69502],[-68.48101,63.6937],[-68.48101,63.6923],[-68.48209,63.69098],[-68.48413,63.6899],[-68.48688,63.6892],[-68.49,63.68895],[-68.49312,63.6892],[-68.49587,63.6899],[-68.49791,63.69098],[-68.49899,63.6923],[-68.49899,63.6937],[-68.49791,63.69502],[-68.49587,63.6961],[-68.49312,63.6968],[-68.49,63.69705]] },
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

/** Total ground length of a polyline in km (sum of great-circle segments). */
export function pathLengthKm(path: Coord[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += distance(path[i - 1], path[i], { units: 'kilometers' })
  }
  return total
}

/** Compass bearing (deg, 0=N, clockwise) a→b; 0 for a zero-length step. */
export function bearingDeg(a: Coord, b: Coord): number {
  if (a[0] === b[0] && a[1] === b[1]) return 0
  return (turfBearing(a, b) + 360) % 360
}

// Precomputed path lengths (paths are static) so symbol velocity stays in ground
// units (km/time-unit) and plane-vs-boat speeds are physically comparable.
const PATH_LENGTHS: number[] = SYMBOLS.map(s => pathLengthKm(s.path))

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
  if (age < 0) return { position: INCIDENT_ORIGIN, weight: 0, distanceKm: 0 }
  // drift per time-unit: ~0.04 km buoyancy base + 0.004 km per knot of wind
  const distanceKm = (0.04 + windSpeed * 0.004) * age
  // deterministic lateral wobble (no RNG) — small bearing oscillation, growing with age
  const wobbleDeg = Math.sin(age * 0.6) * 6 * Math.min(1, age / 20)
  const bearing = windBearing + wobbleDeg
  const dest = destination(INCIDENT_ORIGIN, distanceKm, bearing, { units: 'kilometers' })
  const [lng, lat] = dest.geometry.coordinates as Coord
  const weight = Math.max(0, 1 - age / MAX_PARCEL_AGE)
  return { position: [lng, lat], weight, distanceKm }
}

// Smoke-plume tuning. 28 of the 30 available slots (MAX_PARCEL_AGE / spacing)
// are emitted, leaving a short gap at the source for visual breathing room.
const PARCEL_COUNT = 28          // parcels emitted along the plume
const PARCEL_EMIT_SPACING = 2    // age gap (time-units) between consecutive parcels
const PARCEL_EMIT_RATE = 6       // age advanced per time-unit at the source

/** Fire intensity in [0.6, 1.0], flickering deterministically with time. */
export function flicker(t: number): number {
  const base = 0.8
  const amp = 0.2 * (0.6 * Math.sin(t * 9.0) + 0.4 * Math.sin(t * 23.0))
  const v = base + amp
  return v < 0.6 ? 0.6 : v > 1 ? 1 : v
}

/** Current position + travel heading of every symbol at time `t`. */
export function symbolCollection(t: number): FeatureCollection<Point> {
  return pointFC(SYMBOLS.map((s, i) => {
    const len = PATH_LENGTHS[i] || 1
    const u = ((t * s.speed) / len + s.offset) % 1
    const pos = interpAlong(s.path, u)
    const back = interpAlong(s.path, Math.max(0, u - 0.01))
    const fwd = interpAlong(s.path, Math.min(1, u + 0.01))
    return { coord: pos, props: { id: s.id, kind: s.kind, heading: bearingDeg(back, fwd) } }
  }))
}

/** The drifting smoke plume as weighted points feeding the smoke heatmap. */
export function smokeParcelCollection(
  t: number, windBearing: number, windSpeed: number,
): FeatureCollection<Point> {
  const features: { coord: Coord; props: Record<string, unknown> }[] = []
  for (let i = 0; i < PARCEL_COUNT; i++) {
    // each parcel's age = elapsed-since-emission; staggered by spacing, looping
    const age = ((t * PARCEL_EMIT_RATE) - i * PARCEL_EMIT_SPACING + MAX_PARCEL_AGE * 100) % MAX_PARCEL_AGE
    const p = advectParcel(age, windBearing, windSpeed)
    // defensive: drop fully-dissipated parcels. The age formula keeps age in
    // [0, MAX_PARCEL_AGE) so this rarely fires, but it guards future tuning.
    if (p.weight <= 0) continue
    features.push({ coord: p.position, props: { weight: p.weight } })
  }
  return pointFC(features)
}

/** Single weighted fire point at the incident origin (weight = flicker). */
export function fireCollection(t: number): FeatureCollection<Point> {
  return pointFC([{ coord: INCIDENT_ORIGIN, props: { weight: flicker(t) } }])
}

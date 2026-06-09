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

/**
 * OpenSky ICAO emitter category (broadcast over Mode S Extended Squitter)
 * mapped to a small set of demo-friendly buckets.
 *
 * OpenSky `category` values (0-15):
 *   0  No information
 *   1  No ADS-B emitter category information
 *   2  Light (< 15500 lbs)
 *   3  Small (15500 to 75000 lbs)
 *   4  Large (75000 to 300000 lbs)
 *   5  High vortex large (e.g. B-757)
 *   6  Heavy (> 300000 lbs)
 *   7  High performance (> 5g acceleration and 400 kts)
 *   8  Rotorcraft
 *   9  Glider / sailplane
 *   10 Lighter-than-air
 *   11 Parachutist / skydiver
 *   12 Ultralight / hang-glider / paraglider
 *   13 Reserved
 *   14 Unmanned aerial vehicle
 *   15 Space / trans-atmospheric vehicle
 *
 * The category field is null for ~25-40% of aircraft over the Salish Sea —
 * those render as 'other' (grey) and may recolor on a later poll if the
 * aircraft starts broadcasting category.
 */

export type AircraftCategoryId
  = | 'commercial'
    | 'regional'
    | 'light'
    | 'rotorcraft'
    | 'other'

export interface AircraftCategory {
  id: AircraftCategoryId
  label: string
  /** Hex string used for icon-color and line-color. */
  color: string
}

/**
 * Display order: most-common-first for the legend (commercial > regional >
 * light > rotorcraft > other). Mirrors ship-traffic's SHIP_CATEGORIES shape.
 */
export const AIRCRAFT_CATEGORIES: AircraftCategory[] = [
  { id: 'commercial', label: 'Commercial',     color: '#2563eb' }, // blue-600
  { id: 'regional',   label: 'Regional',       color: '#0d9488' }, // teal-600
  { id: 'light',      label: 'Light / GA',     color: '#eab308' }, // yellow-500
  { id: 'rotorcraft', label: 'Rotorcraft',     color: '#7e22ce' }, // purple-700
  { id: 'other',      label: 'Other / Unknown', color: '#6b7280' }, // gray-500
]

const CATEGORY_BY_ID = Object.fromEntries(
  AIRCRAFT_CATEGORIES.map(c => [c.id, c]),
) as Record<AircraftCategoryId, AircraftCategory>

/**
 * Map an OpenSky ICAO emitter category to one of our 5 display buckets.
 * Returns 'other' for null/undefined/out-of-range/unknown categories.
 */
export function categorize(code: number | null | undefined): AircraftCategoryId {
  if (typeof code !== 'number' || !Number.isFinite(code)) return 'other'
  if (code === 4 || code === 5 || code === 6) return 'commercial'
  if (code === 3) return 'regional'
  if (code === 2) return 'light'
  if (code === 8) return 'rotorcraft'
  return 'other'
}

export function getCategoryColor(id: AircraftCategoryId): string {
  return CATEGORY_BY_ID[id].color
}

/**
 * Like `categorize()`, but falls back to an altitude-band heuristic when
 * the broadcast category is null / undefined / 0 (No information) / 1
 * (No emitter info). OpenSky's `category` field is null or 0 for ~95% of
 * aircraft over quieter regions like the Salish Sea, so this fallback
 * gives the demo visual signal on bad-broadcast days while still
 * preferring real broadcast data when it exists.
 *
 * Rules:
 *   - If `categorize(category)` returns anything other than 'other', use it.
 *   - Otherwise fall back to altitude:
 *       >= 25000 ft → commercial (cruise jets)
 *       >= 10000 ft → regional (turboprops, RJs in climb/descent)
 *       <  10000 ft → light (GA pattern, low traffic)
 *   - Aircraft with no altitude data (e.g. on-ground or not broadcast)
 *     stay 'other'. Rotorcraft can't be inferred from altitude alone, so
 *     they only color when category === 8 is broadcast explicitly.
 */
export function categorizeWithAltitude(
  code: number | null | undefined,
  altitudeFt: number | null | undefined,
): AircraftCategoryId {
  const broadcast = categorize(code)
  if (broadcast !== 'other') return broadcast
  if (typeof altitudeFt !== 'number' || !Number.isFinite(altitudeFt)) return 'other'
  if (altitudeFt >= 25000) return 'commercial'
  if (altitudeFt >= 10000) return 'regional'
  return 'light'
}

/**
 * MapLibre `match` expression keyed on feature.properties.category.
 * Used by both the symbol layer (icon-color) and the trail line layer
 * (line-color). 'other' is emitted as the default branch.
 */
export function buildCategoryColorExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'category']]
  for (const cat of AIRCRAFT_CATEGORIES) {
    if (cat.id === 'other') continue // 'other' is the default at the end
    expr.push(cat.id, cat.color)
  }
  expr.push(CATEGORY_BY_ID.other.color) // default
  return expr
}

/**
 * AIS ShipType categorization (ITU-R M.1371 vessel-type codes 0-99).
 *
 * Buckets the 100 codes into a small set of demo-friendly categories,
 * each with a color used by the symbol layer + trail line layer + legend.
 *
 * Categories are stable string ids so MapLibre `match` expressions can key
 * off feature.properties.category.
 */

export type ShipCategoryId
  = | 'cargo'
    | 'tanker'
    | 'passenger'
    | 'fishing'
    | 'tug'
    | 'sailing'
    | 'highspeed'
    | 'other'

export interface ShipCategory {
  id: ShipCategoryId
  label: string
  /** Hex string used for icon-color and line-color. */
  color: string
}

export const SHIP_CATEGORIES: ShipCategory[] = [
  { id: 'cargo',     label: 'Cargo',         color: '#f97316' }, // orange-500
  { id: 'tanker',    label: 'Tanker',        color: '#dc2626' }, // red-600
  { id: 'passenger', label: 'Passenger',     color: '#2563eb' }, // blue-600
  { id: 'fishing',   label: 'Fishing',       color: '#0d9488' }, // teal-600
  { id: 'tug',       label: 'Tug / Towing',  color: '#7e22ce' }, // purple-700
  { id: 'sailing',   label: 'Sailing / Rec', color: '#16a34a' }, // green-600
  { id: 'highspeed', label: 'High-speed',    color: '#eab308' }, // yellow-500
  { id: 'other',     label: 'Other / Unknown', color: '#6b7280' }, // gray-500
]

const CATEGORY_BY_ID = Object.fromEntries(SHIP_CATEGORIES.map(c => [c.id, c])) as Record<ShipCategoryId, ShipCategory>

/**
 * Map an AIS shipType code to one of our display categories.
 * Returns 'other' for missing/invalid codes (including the 0 = "not available" sentinel).
 *
 * Reference (ITU-R M.1371-5 §3.3.8.2.3.2):
 *   30 = fishing
 *   31, 32 = tug / towing
 *   33, 34 = dredging / diving / military / sailing / pleasure
 *   35 = military
 *   36, 37 = sailing, pleasure craft
 *   40–49 = high-speed craft
 *   50–59 = special category (pilot, search & rescue, tug, port tender, etc.)
 *           — 52 (tug) we map to tug; the rest fall to 'other'
 *   60–69 = passenger
 *   70–79 = cargo
 *   80–89 = tanker
 *   90–99 = other (hazardous material categories)
 *   0, anything else: other / unknown.
 */
export function categorizeShipType(code: number | undefined | null): ShipCategoryId {
  if (typeof code !== 'number' || !Number.isFinite(code) || code <= 0 || code > 99) {
    return 'other'
  }
  if (code === 30) return 'fishing'
  if (code === 31 || code === 32 || code === 52) return 'tug'
  if (code === 36 || code === 37) return 'sailing'
  if (code >= 40 && code <= 49) return 'highspeed'
  if (code >= 60 && code <= 69) return 'passenger'
  if (code >= 70 && code <= 79) return 'cargo'
  if (code >= 80 && code <= 89) return 'tanker'
  return 'other'
}

export function getCategoryColor(id: ShipCategoryId): string {
  return CATEGORY_BY_ID[id].color
}

/**
 * MapLibre `match` expression keyed on feature.properties.category.
 * Used by both the symbol layer (icon-color) and the trail line layer (line-color).
 */
export function buildCategoryColorExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'category']]
  for (const cat of SHIP_CATEGORIES) {
    if (cat.id === 'other') continue // 'other' is the default at the end
    expr.push(cat.id, cat.color)
  }
  expr.push(CATEGORY_BY_ID.other.color) // default
  return expr
}

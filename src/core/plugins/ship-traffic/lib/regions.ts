import type { Region } from './types'

/**
 * Demo subscription scope. Narrow on purpose:
 *  - AISStream free tier is rate-limited (a wide multi-bbox subscription can
 *    silently throttle or stop emitting after a while)
 *  - A single regional bbox gives a denser, more legible demo than
 *    thinly-populated open-ocean tiles
 *
 * Salish Sea region: covers Vancouver Harbor (Burrard Inlet), the Strait of
 * Georgia and BC Ferries corridor (Tsawwassen ↔ Swartz Bay), Victoria and
 * Esquimalt harbors, plus the Juan de Fuca approach where deep-sea traffic
 * rounds Cape Flattery into the Salish Sea.
 */
export const REGIONS: Region[] = [
  { name: 'Salish Sea (Vancouver / Victoria)', bbox: [-124.0, 48.30, -122.80, 49.40] },
]

/**
 * Convert REGIONS to AISStream.io's expected shape for the Subscribe message:
 * a list of [[lat1, lon1], [lat2, lon2]] corner pairs (note: lat first, NOT lon).
 */
export function regionsAsBoundingBoxes(): number[][][] {
  return REGIONS.map((r) => {
    const [west, south, east, north] = r.bbox
    return [[south, west], [north, east]]
  })
}

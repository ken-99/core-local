import type { Region } from './types'

/**
 * Demo subscription scope. Single Salish Sea bbox, identical to
 * ship-traffic's `regions.ts` so the two plugins co-animate the same patch
 * of map. Covers YVR, YYJ, KSEA approach corridors, BC Ferries airspace.
 */
export const REGIONS: Region[] = [
  { name: 'Salish Sea (Vancouver / Victoria)', bbox: [-124.0, 48.30, -122.80, 49.40] },
]

/**
 * Build the OpenSky bbox query string. Always uses the first (and only) region.
 *
 * OpenSky's REST API expects: lamin (south), lamax (north), lomin (west),
 * lomax (east). Adding `extended=1` requests the 18th tuple field
 * (ICAO emitter category) — null in many entries but that's expected.
 */
export function openSkyQueryString(): string {
  const [west, south, east, north] = REGIONS[0].bbox
  const params = new URLSearchParams({
    lamin: String(south),
    lamax: String(north),
    lomin: String(west),
    lomax: String(east),
    extended: '1',
  })
  return params.toString()
}

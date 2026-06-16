import { transit_realtime } from 'gtfs-realtime-bindings'
import type { CityConfig, FeedAdapter, Mode, Vehicle } from '../types'

export const HSL_PROXY_URL = '/api/hslGtfsRtProxy'

/**
 * GTFS routeType → visualization Mode.
 * https://gtfs.org/schedule/reference/#routestxt
 *   0  = Tram
 *   1  = Subway/Metro
 *   2  = Rail
 *   3  = Bus
 *   4  = Ferry
 *   12 = Monorail (treated as tram-like)
 *   100..199 = Railway (rail)
 *   700..799 = Bus
 *   900..999 = Tram
 *   1000..1099 = Ferry
 */
export function routeTypeToMode(rt: number): Mode | null {
  if (rt === 0 || rt === 12 || (rt >= 900 && rt < 1000)) return 'tram'
  if (rt === 1 || rt === 2 || (rt >= 100 && rt < 200)) return 'rail'
  if (rt === 3 || (rt >= 700 && rt < 800)) return 'bus'
  if (rt === 4 || (rt >= 1000 && rt < 1100)) return 'ferry'
  return null
}

/**
 * Classify an HSL realtime routeId to a GTFS routeType.
 *
 * Patterns derived from a live snapshot of the HSL VehiclePositions feed
 * (163 unique routeIds, 100% coverage). HSL realtime routeIds follow a
 * structured scheme distinct from the user-facing short names:
 *   - Metro (M1, M2)              → '31M1', '31M2'                  → 1 (rail)
 *   - Commuter rail (A, K, I, …)  → '3001R', '3001K', '3002P', etc. → 2 (rail)
 *   - Tram (1, 2, 3, …, 10)       → '1002', '1007', '1003H'         → 0 (tram)
 *   - Tram service variants       → '100HD', '100HF', …             → 0 (tram)
 *   - Ferry (Suomenlinna etc.)    → '1900'..'1999'                  → 4 (ferry)
 *   - Bus (everything else)       → '1500', '2015', '9633N', etc.   → 3 (bus)
 *
 * Trailing letters are service variants (e.g. '1003' and '1003H' are the
 * same line) — strip before numeric range matching.
 */
export function defaultHslRouteTypeLookup(routeId: string): number | undefined {
  if (!routeId) return undefined
  // Metro: 'M' followed by digits anywhere in the id ('31M1', '31M2').
  if (/M[0-9]+/.test(routeId)) return 1
  // Commuter rail: '3001' or '3002' optionally followed by a single letter.
  if (/^300[12][A-Z]?$/.test(routeId)) return 2
  // Tram service-variant pattern: '100' + two-or-more-letter suffix ('100HM').
  if (/^100[A-Z]+$/.test(routeId)) return 0
  // Strip trailing letters (service variants of the same numeric route).
  const base = routeId.replace(/[A-Z]+$/, '')
  const n = Number(base)
  if (!Number.isFinite(n)) return undefined
  if (n >= 1001 && n <= 1099) return 0
  if (n >= 1900 && n <= 1999) return 4
  if (n >= 1100 && n <= 9999) return 3
  return undefined
}

export function parseFeedMessage(
  bytes: Uint8Array,
  routeTypeLookup: (routeId: string) => number | undefined,
  receivedAtMs: number,
): Vehicle[] {
  const msg = transit_realtime.FeedMessage.decode(bytes)
  const out: Vehicle[] = []
  for (const ent of msg.entity) {
    const vp = ent.vehicle
    if (!vp || !vp.position) continue
    const lat = vp.position.latitude
    const lon = vp.position.longitude
    if (typeof lat !== 'number' || typeof lon !== 'number') continue

    const routeId = vp.trip?.routeId ?? ''
    if (!routeId) continue
    const rt = routeTypeLookup(routeId)
    if (rt === undefined) continue
    const mode = routeTypeToMode(rt)
    if (!mode) continue

    const vid = vp.vehicle?.id ?? ent.id
    const tsSec = vp.timestamp
    let ts: number
    if (typeof tsSec === 'number' && tsSec > 0) {
      ts = tsSec * 1000
    } else if (typeof tsSec === 'object' && tsSec !== null && 'toNumber' in tsSec) {
      ts = (tsSec as { toNumber: () => number }).toNumber() * 1000
    } else {
      ts = receivedAtMs
    }

    const v: Vehicle = {
      id: `hsl:${mode}:${vid}`,
      position: [lon, lat],
      mode,
      routeId,
      timestamp: ts,
    }
    if (typeof vp.position.bearing === 'number' && vp.position.bearing !== 0) {
      v.bearing = vp.position.bearing
    }
    out.push(v)
  }
  return out
}

async function pollHsl(_city: CityConfig): Promise<Vehicle[]> {
  const res = await fetch(HSL_PROXY_URL)
  if (!res.ok) throw new Error(`hsl: ${res.status}`)
  const buf = await res.arrayBuffer()
  return parseFeedMessage(new Uint8Array(buf), defaultHslRouteTypeLookup, Date.now())
}

export const hslGtfsRtAdapter: FeedAdapter = {
  id: 'hslGtfsRt',
  poll: pollHsl,
  defaultIntervalMs: 10_000,
}

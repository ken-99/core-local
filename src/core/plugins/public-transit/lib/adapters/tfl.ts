import type { CityConfig, FeedAdapter, Mode, TflArrivalPrediction, Vehicle } from '../types'

const TFL_PROXY = '/api/tflProxy'

/** Cap total vehicles per tick to keep MapLibre rendering smooth. */
const MAX_VEHICLES_PER_TICK = 100

function withinBbox(lon: number, lat: number, bbox: CityConfig['bbox']): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
}

export function buildTflProxyUrl(path: string): string {
  return `${TFL_PROXY}?path=${encodeURIComponent(path)}`
}

export function mapTflModeToVisualMode(tflMode: string): Mode | null {
  switch (tflMode) {
    case 'tube':
    case 'dlr':
    case 'overground':
    case 'elizabeth-line':
      return 'rail'
    case 'bus':
      return 'bus'
    case 'tram':
      return 'tram'
    case 'river-bus':
      return 'ferry'
    default:
      return null
  }
}

export function parseBusArrival(p: TflArrivalPrediction, now: number): Vehicle | null {
  if (!p.vehicleId || !p.stationCoordinates) return null
  const mode = mapTflModeToVisualMode(p.modeName)
  if (!mode) return null
  return {
    id: `tfl:${p.modeName}:${p.vehicleId}`,
    position: [p.stationCoordinates.lon, p.stationCoordinates.lat],
    mode,
    routeId: p.lineId,
    destination: p.destinationName ?? p.towards,
    timestamp: now,
  }
}

/**
 * Per-tick: fan out one fetch per feedEndpoint. Each mode contributes
 * Vehicles independently. Partial failure tolerated; total failure rejects.
 *
 * v1 only emits bus + river-bus (both have stop coordinates). Tube / DLR /
 * Overground / Elizabeth / Tram require per-line geometry interpolation
 * which is deferred to v2.
 */
async function pollTfl(city: CityConfig): Promise<Vehicle[]> {
  const now = Date.now()
  const results = await Promise.allSettled(
    city.feedEndpoints.map(async (mode) => {
      const url = buildTflProxyUrl(`/Mode/${mode}/Arrivals`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`tfl ${mode}: ${res.status}`)
      const body = await res.json() as TflArrivalPrediction[]
      const vehicles: Vehicle[] = []
      for (const p of body) {
        if (mode === 'bus' || mode === 'river-bus') {
          const v = parseBusArrival(p, now)
          if (!v) continue
          // Drop vehicles whose stop is outside the city bbox.
          if (!withinBbox(v.position[0], v.position[1], city.bbox)) continue
          vehicles.push(v)
        }
      }
      return vehicles
    }),
  )

  const successes = results.filter((r): r is PromiseFulfilledResult<Vehicle[]> => r.status === 'fulfilled')
  if (successes.length === 0) {
    throw new Error('tfl: all endpoints failed')
  }
  // Flatten + dedupe by vehicle id, keeping the FIRST occurrence (TfL orders
  // predictions by soonest-arriving first within each endpoint).
  const seen = new Set<string>()
  const merged: Vehicle[] = []
  for (const r of successes) {
    for (const v of r.value) {
      if (seen.has(v.id)) continue
      seen.add(v.id)
      merged.push(v)
      if (merged.length >= MAX_VEHICLES_PER_TICK) break
    }
    if (merged.length >= MAX_VEHICLES_PER_TICK) break
  }
  return merged
}

export const tflAdapter: FeedAdapter = {
  id: 'tfl',
  poll: pollTfl,
  defaultIntervalMs: 30_000,
}

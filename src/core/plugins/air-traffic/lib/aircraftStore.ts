import type {
  AircraftPosition,
  AircraftState,
  AircraftStatic,
  AircraftUpdate,
} from './types'
import type * as GeoJSON from 'geojson'
import { categorizeWithAltitude, AIRCRAFT_CATEGORIES } from './aircraftTypes'
import type { AircraftCategoryId } from './aircraftTypes'

/** Cap on stored history points per aircraft. 60 × 10s polling = 10 min trail. */
const MAX_HISTORY_POINTS = 60

export class AircraftStore {
  private aircraft = new Map<string, AircraftState>()

  applyUpdate(u: AircraftUpdate): void {
    if (u.kind === 'position') this.applyPosition(u.data)
    else this.applyStatic(u.data)
  }

  private applyPosition(p: AircraftPosition): void {
    const existing = this.aircraft.get(p.icao24)
    const lastSeen = Math.max(existing?.lastSeen ?? 0, p.receivedAt)
    // Append to history, hard-cap at MAX_HISTORY_POINTS (drop oldest first).
    const prevHistory = existing?.history ?? []
    const nextHistory = [...prevHistory, p]
    if (nextHistory.length > MAX_HISTORY_POINTS) {
      nextHistory.splice(0, nextHistory.length - MAX_HISTORY_POINTS)
    }
    this.aircraft.set(p.icao24, {
      icao24: p.icao24,
      position: p,
      static: existing?.static,
      lastSeen,
      history: nextHistory,
    })
  }

  private applyStatic(s: AircraftStatic): void {
    const existing = this.aircraft.get(s.icao24)
    const lastSeen = Math.max(existing?.lastSeen ?? 0, s.receivedAt)
    this.aircraft.set(s.icao24, {
      icao24: s.icao24,
      position: existing?.position,
      static: s,
      lastSeen,
      history: existing?.history,
    })
  }

  get(icao24: string): AircraftState | undefined {
    return this.aircraft.get(icao24)
  }

  size(): number {
    return this.aircraft.size
  }

  /**
   * Remove aircraft last seen before (now - maxAgeMs).
   * `now` is injectable for tests; defaults to Date.now().
   */
  ageOut(maxAgeMs: number, now: number = Date.now()): void {
    const cutoff = now - maxAgeMs
    for (const [icao24, v] of this.aircraft) {
      if (v.lastSeen < cutoff) this.aircraft.delete(icao24)
    }
  }

  /**
   * Live count per display category, over airborne aircraft (the same set the
   * symbol layer renders — it filters out on_ground). Feeds the legend counts.
   */
  countByCategory(): Record<AircraftCategoryId, number> {
    const counts = Object.fromEntries(
      AIRCRAFT_CATEGORIES.map(c => [c.id, 0]),
    ) as Record<AircraftCategoryId, number>
    for (const v of this.aircraft.values()) {
      if (!v.position || v.position.onGround) continue
      counts[categorizeWithAltitude(v.static?.category, v.position.baroAltitudeFt)]++
    }
    return counts
  }

  toGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = []
    for (const v of this.aircraft.values()) {
      if (!v.position) continue
      const callsign = v.static?.callsign?.trim() || v.icao24
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.position.lon, v.position.lat] },
        properties: {
          icao24: v.icao24,
          callsign,
          category: categorizeWithAltitude(v.static?.category, v.position.baroAltitudeFt),
          on_ground: v.position.onGround,
          heading: v.position.heading,
          altitude: v.position.baroAltitudeFt,
          velocity: v.position.velocity,
          origin_country: v.static?.originCountry,
          lastSeen: v.lastSeen,
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  toTrailsGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.LineString, Record<string, unknown>> {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
    for (const v of this.aircraft.values()) {
      const h = v.history
      if (!h || h.length < 2) continue
      // Trail color uses the LATEST position's altitude for the fallback.
      // Trails are short-lived; using current altitude is good enough.
      const latestAltitude = h[h.length - 1].baroAltitudeFt
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: h.map(p => [p.lon, p.lat]),
        },
        properties: {
          icao24: v.icao24,
          category: categorizeWithAltitude(v.static?.category, latestAltitude),
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }
}

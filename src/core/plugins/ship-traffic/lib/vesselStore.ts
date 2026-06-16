import type { VesselPosition, VesselState, VesselStatic } from './types'
import type * as GeoJSON from 'geojson'
import { categorizeShipType, SHIP_CATEGORIES } from './shipTypes'
import type { ShipCategoryId } from './shipTypes'

/** Default ceiling on trail length. Each insert culls anything older than this. */
const DEFAULT_TRAIL_MAX_AGE_MS = 10 * 60 * 1000

export class VesselStore {
  private vessels = new Map<number, VesselState>()
  private trailMaxAgeMs: number

  constructor(trailMaxAgeMs: number = DEFAULT_TRAIL_MAX_AGE_MS) {
    this.trailMaxAgeMs = trailMaxAgeMs
  }

  applyPosition(p: VesselPosition): void {
    const existing = this.vessels.get(p.mmsi)
    const lastSeen = Math.max(existing?.lastSeen ?? 0, p.receivedAt)

    // Append to history, then cull anything older than trailMaxAgeMs from the latest entry.
    const history = existing?.history ? [...existing.history, p] : [p]
    const cutoff = p.receivedAt - this.trailMaxAgeMs
    const culledHistory = history.filter(h => h.receivedAt >= cutoff)

    this.vessels.set(p.mmsi, {
      mmsi: p.mmsi,
      position: p,
      static: existing?.static,
      lastSeen,
      history: culledHistory,
    })
  }

  applyStatic(s: VesselStatic): void {
    const existing = this.vessels.get(s.mmsi)
    const lastSeen = Math.max(existing?.lastSeen ?? 0, s.receivedAt)
    this.vessels.set(s.mmsi, {
      mmsi: s.mmsi,
      position: existing?.position,
      static: s,
      lastSeen,
      history: existing?.history,
    })
  }

  get(mmsi: number): VesselState | undefined {
    return this.vessels.get(mmsi)
  }

  size(): number {
    return this.vessels.size
  }

  /** Live count per display category, over vessels with a position. Feeds the legend counts. */
  countByCategory(): Record<ShipCategoryId, number> {
    const counts = Object.fromEntries(
      SHIP_CATEGORIES.map(c => [c.id, 0]),
    ) as Record<ShipCategoryId, number>
    for (const v of this.vessels.values()) {
      if (!v.position) continue
      counts[categorizeShipType(v.static?.shipType)]++
    }
    return counts
  }

  toGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = []
    for (const v of this.vessels.values()) {
      if (!v.position) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.position.lon, v.position.lat] },
        properties: {
          mmsi: v.mmsi,
          cog: v.position.cog,
          sog: v.position.sog,
          heading: v.position.heading,
          name: v.static?.name ?? `MMSI ${v.mmsi}`,
          shipType: v.static?.shipType,
          flag: v.static?.flag,
          destination: v.static?.destination,
          lastSeen: v.lastSeen,
          category: categorizeShipType(v.static?.shipType),
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  /**
   * One LineString per vessel with at least 2 history points. Coordinates
   * are oldest → newest, so MapLibre's `line-gradient` (if used) would
   * fade from tail to head naturally.
   */
  toTrailsGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.LineString, Record<string, unknown>> {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
    for (const v of this.vessels.values()) {
      const h = v.history
      if (!h || h.length < 2) continue
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: h.map(p => [p.lon, p.lat]),
        },
        properties: {
          mmsi: v.mmsi,
          category: categorizeShipType(v.static?.shipType),
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  /**
   * Remove vessels last seen before (now - maxAgeMs).
   * `now` is injectable for tests; defaults to Date.now().
   */
  ageOut(maxAgeMs: number, now: number = Date.now()): void {
    const cutoff = now - maxAgeMs
    for (const [mmsi, v] of this.vessels) {
      if (v.lastSeen < cutoff) this.vessels.delete(mmsi)
    }
  }
}

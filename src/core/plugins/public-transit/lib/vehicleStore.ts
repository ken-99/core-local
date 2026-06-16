import type { Vehicle, VehicleState, Mode } from './types'
import { ALL_MODES } from './modes'

export const HISTORY_CAP = 60

interface FeatureCollectionLike {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point' | 'LineString'; coordinates: number[] | number[][] }
    properties: Record<string, unknown>
  }>
}

export class VehicleStore {
  private map = new Map<string, VehicleState>()

  size(): number {
    return this.map.size
  }

  get(id: string): VehicleState | undefined {
    return this.map.get(id)
  }

  merge(vehicles: Vehicle[], _now: number): void {
    for (const v of vehicles) {
      const existing = this.map.get(v.id)
      if (existing) {
        const last = existing.history[existing.history.length - 1]
        const samePos = last && last.position[0] === v.position[0] && last.position[1] === v.position[1]
        if (!samePos) {
          existing.history.push({ position: v.position, timestamp: v.timestamp })
          if (existing.history.length > HISTORY_CAP) {
            existing.history.splice(0, existing.history.length - HISTORY_CAP)
          }
        }
        existing.vehicle = v
      } else {
        this.map.set(v.id, {
          vehicle: v,
          history: [{ position: v.position, timestamp: v.timestamp }],
        })
      }
    }
  }

  clear(): void {
    this.map.clear()
  }

  /** Drop vehicles whose vehicle.timestamp is strictly older than the cutoff. */
  ageOut(cutoffMs: number): void {
    for (const [id, state] of this.map) {
      if (state.vehicle.timestamp < cutoffMs) {
        this.map.delete(id)
      }
    }
  }

  toGeoJSON(): FeatureCollectionLike {
    const features: FeatureCollectionLike['features'] = []
    for (const state of this.map.values()) {
      const props: Record<string, unknown> = {
        id: state.vehicle.id,
        mode: state.vehicle.mode,
        routeId: state.vehicle.routeId,
        timestamp: state.vehicle.timestamp,
      }
      if (state.vehicle.bearing !== undefined) props.bearing = state.vehicle.bearing
      if (state.vehicle.destination !== undefined) props.destination = state.vehicle.destination
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: state.vehicle.position },
        properties: props,
      })
    }
    return { type: 'FeatureCollection', features }
  }

  toTrailsGeoJSON(): FeatureCollectionLike {
    const features: FeatureCollectionLike['features'] = []
    for (const state of this.map.values()) {
      if (state.history.length < 2) continue
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: state.history.map(h => h.position),
        },
        properties: {
          id: state.vehicle.id,
          mode: state.vehicle.mode,
          routeId: state.vehicle.routeId,
          // Per-vertex timestamps, parallel to coordinates. Lets the renderer
          // fade older trail segments without reaching into store internals.
          timestamps: state.history.map(h => h.timestamp),
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  countByMode(): Record<Mode, number> {
    const out: Record<Mode, number> = { rail: 0, bus: 0, tram: 0, ferry: 0 }
    for (const state of this.map.values()) {
      if (ALL_MODES.includes(state.vehicle.mode)) {
        out[state.vehicle.mode] += 1
      }
    }
    return out
  }
}

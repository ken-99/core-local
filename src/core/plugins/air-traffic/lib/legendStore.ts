import * as React from 'react'
import { AIRCRAFT_CATEGORIES } from './aircraftTypes'
import type { AircraftCategoryId } from './aircraftTypes'

// Bridges AirTrafficTool's component-local state (enabled + live per-category
// counts) to the legend hook, which runs in <MapLegendHost>'s separate subtree.
export interface AirLegendState {
  active: boolean
  unavailable: boolean
  counts: Record<AircraftCategoryId, number>
}

const EMPTY: AirLegendState = {
  active: false,
  unavailable: false,
  counts: Object.fromEntries(AIRCRAFT_CATEGORIES.map(c => [c.id, 0])) as Record<AircraftCategoryId, number>,
}

let state: AirLegendState = EMPTY
const listeners = new Set<() => void>()

export function setAirLegend(next: Partial<AirLegendState>): void {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export function resetAirLegend(): void {
  state = EMPTY
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot(): AirLegendState {
  return state
}

export function useAirLegendState(): AirLegendState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

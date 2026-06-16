import * as React from 'react'
import { SHIP_CATEGORIES } from './shipTypes'
import type { ShipCategoryId } from './shipTypes'

// Bridges ShipTrafficTool's component-local state (enabled + live per-category
// counts) to the legend hook, which runs in <MapLegendHost>'s separate subtree.
export interface ShipLegendState {
  active: boolean
  unavailable: boolean
  counts: Record<ShipCategoryId, number>
}

const EMPTY: ShipLegendState = {
  active: false,
  unavailable: false,
  counts: Object.fromEntries(SHIP_CATEGORIES.map(c => [c.id, 0])) as Record<ShipCategoryId, number>,
}

let state: ShipLegendState = EMPTY
const listeners = new Set<() => void>()

export function setShipLegend(next: Partial<ShipLegendState>): void {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export function resetShipLegend(): void {
  state = EMPTY
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot(): ShipLegendState {
  return state
}

export function useShipLegendState(): ShipLegendState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

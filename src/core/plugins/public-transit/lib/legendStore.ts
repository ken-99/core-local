import * as React from 'react'
import type { Mode } from './types'

// Bridges PublicTransitTool's component-local state (enabled/city/counts/status)
// to the legend hook, which runs in <MapLegendHost>'s separate React subtree.
export interface TransitLegendState {
  active: boolean
  title: string
  modes: Mode[]
  counts: Record<Mode, number>
  unavailable: boolean
}

const EMPTY: TransitLegendState = {
  active: false,
  title: '',
  modes: [],
  counts: { rail: 0, bus: 0, tram: 0, ferry: 0 },
  unavailable: false,
}

let state: TransitLegendState = EMPTY
const listeners = new Set<() => void>()

export function setTransitLegend(next: Partial<TransitLegendState>): void {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export function resetTransitLegend(): void {
  state = EMPTY
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot(): TransitLegendState {
  return state
}

export function useTransitLegendState(): TransitLegendState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

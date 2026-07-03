'use client'
import * as React from 'react'
import { REFMAR_GAUGE } from './constants'
import { parseFlux, residualSeries, fluxUrl, latest, REFMAR_SOURCE, type TidePoint, type ResidualPoint } from './act3'

const WINDOW_DAYS = 7
const POLL_MS = 5 * 60_000 // "live updates without reload" — REFMAR is minute-cadence

export interface TideState {
  observed: TidePoint[]
  predicted: TidePoint[]
  residual: ResidualPoint[]
  currentObserved: TidePoint | null
  currentPredicted: number | null
  loading: boolean
  error: string | null
  lastFetched: number | null
}

async function fetchSource(source: number, startMs: number, endMs: number): Promise<TidePoint[]> {
  const url = fluxUrl(REFMAR_GAUGE.observationJson, REFMAR_GAUGE.id, source, startMs, endMs)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`REFMAR ${source} → HTTP ${res.status}`)
  return parseFlux(await res.json())
}

/** Predicted height at (or nearest within tol to) a timestamp. */
function predictedAt(predicted: TidePoint[], t: number, tolMs = 10 * 60_000): number | null {
  let best: TidePoint | null = null
  for (const p of predicted) {
    if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
  }
  return best && Math.abs(best.t - t) <= tolMs ? best.v : null
}

/**
 * Poll the Roscoff REFMAR gauge (observed + predicted, both open/CORS) over the
 * last 7 days and refresh on an interval — no page reload. The residual
 * (observed − predicted) is the storm-surge signal. `nowMs` is injected for
 * testability but defaults to the live clock.
 */
export function useRoscoffTide(nowMs?: () => number): TideState {
  const now = nowMs ?? Date.now
  const [state, setState] = React.useState<TideState>({
    observed: [], predicted: [], residual: [],
    currentObserved: null, currentPredicted: null,
    loading: true, error: null, lastFetched: null,
  })

  React.useEffect(() => {
    let alive = true
    const load = async () => {
      const end = now()
      const start = end - WINDOW_DAYS * 86_400_000
      try {
        const [observed, predicted] = await Promise.all([
          fetchSource(REFMAR_SOURCE.observed, start, end),
          fetchSource(REFMAR_SOURCE.predicted, start, end),
        ])
        if (!alive) return
        const currentObserved = latest(observed)
        setState({
          observed, predicted,
          residual: residualSeries(observed, predicted),
          currentObserved,
          currentPredicted: currentObserved ? predictedAt(predicted, currentObserved.t) : null,
          loading: false, error: null, lastFetched: end,
        })
      } catch (e) {
        if (!alive) return
        setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return state
}

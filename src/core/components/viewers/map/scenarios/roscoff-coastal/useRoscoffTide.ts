'use client'
import * as React from 'react'
import { REFMAR_GAUGE } from './constants'
import { parseFlux, residualSeries, fluxUrl, latest, REFMAR_SOURCE, type TidePoint, type ResidualPoint } from './act3'
import { fitTide, predictSeries, predictTide, type TideModel } from './tidePrediction'

const FIT_DAYS = 28       // record length for a stable harmonic fit
const DISPLAY_DAYS = 8    // observed window kept for the panel + 7-day sparkline
const FIT_SUBSAMPLE = 10  // thin the 1-min record to ~10-min for the fit
const POLL_MS = 5 * 60_000 // "live updates without reload" — REFMAR is minute-cadence

export interface TideState {
  observed: TidePoint[]
  predicted: TidePoint[]
  residual: ResidualPoint[]
  currentObserved: TidePoint | null
  currentPredicted: number | null
  model: TideModel | null
  loading: boolean
  error: string | null
  lastFetched: number | null
}

async function fetchObserved(startMs: number, endMs: number): Promise<TidePoint[]> {
  const url = fluxUrl(REFMAR_GAUGE.observationJson, REFMAR_GAUGE.id, REFMAR_SOURCE.observed, startMs, endMs)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`REFMAR observed → HTTP ${res.status}`)
  return parseFlux(await res.json())
}

/**
 * Poll the Roscoff REFMAR gauge and turn it into a live observed / predicted /
 * surge view. SHOM serves no live tide *prediction* (sources=2 is validated
 * observations that lag and match the raw signal), so the prediction is a
 * harmonic tide model fit once from ~28 days of the gauge's own record
 * (tidePrediction.ts). The model predicts the tide at the live instant, so
 * `surge = observed − predicted` is a real non-tidal residual and never lags.
 * `nowMs` is injected for testability but defaults to the live clock.
 */
export function useRoscoffTide(nowMs?: () => number): TideState {
  const now = nowMs ?? Date.now
  const modelRef = React.useRef<TideModel | null>(null)
  const [state, setState] = React.useState<TideState>({
    observed: [], predicted: [], residual: [],
    currentObserved: null, currentPredicted: null, model: null,
    loading: true, error: null, lastFetched: null,
  })

  React.useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setInterval> | undefined

    const apply = (observed: TidePoint[], model: TideModel, end: number) => {
      const predicted = predictSeries(model, observed)
      const co = latest(observed)
      setState({
        observed, predicted,
        residual: residualSeries(observed, predicted),
        currentObserved: co,
        currentPredicted: co ? predictTide(model, co.t) : null,
        model,
        loading: false, error: null, lastFetched: end,
      })
    }

    const poll = async () => {
      const model = modelRef.current
      if (!model) return
      try {
        const end = now()
        const observed = await fetchObserved(end - DISPLAY_DAYS * 86_400_000, end)
        if (!alive) return
        apply(observed, model, end)
      } catch (e) {
        if (!alive) return
        setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      }
    }

    const init = async () => {
      try {
        const end = now()
        const record = await fetchObserved(end - FIT_DAYS * 86_400_000, end)
        if (!alive) return
        const model = fitTide(record.filter((_, i) => i % FIT_SUBSAMPLE === 0))
        if (!model) throw new Error('not enough gauge data to fit the tide model')
        modelRef.current = model
        // First render reuses the last DISPLAY_DAYS of the record already fetched.
        const cutoff = end - DISPLAY_DAYS * 86_400_000
        apply(record.filter(p => p.t >= cutoff), model, end)
        timer = setInterval(poll, POLL_MS)
      } catch (e) {
        if (!alive) return
        setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      }
    }

    init()
    return () => { alive = false; if (timer) clearInterval(timer) }
  }, [])

  return state
}

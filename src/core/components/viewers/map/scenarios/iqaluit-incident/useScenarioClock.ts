'use client'
import * as React from 'react'

/**
 * rAF clock for the scenario. Advances `t` (in time-units ≈ seconds) only while
 * `playing`, and throttles React state updates to ~10 fps so the layer recompute
 * stays cheap. `reset()` returns to t=0. We only ever drive `source.setData()`
 * downstream — never setStyle/setProjection — so we stay clear of MapLibre's
 * render-loop re-entrancy hazard.
 */
export function useScenarioClock(playing: boolean): { t: number; reset: () => void } {
  const [t, setT] = React.useState(0)
  const tRef = React.useRef(0)
  const lastTs = React.useRef<number | null>(null)
  const lastEmit = React.useRef(0)
  const rafId = React.useRef<number | null>(null)

  React.useEffect(() => {
    const tick = (ts: number) => {
      if (lastTs.current === null) lastTs.current = ts
      const dt = (ts - lastTs.current) / 1000
      lastTs.current = ts
      if (playing) {
        tRef.current += dt
        if (ts - lastEmit.current >= 100) { // ~10 fps
          lastEmit.current = ts
          setT(tRef.current)
        }
      }
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
      lastTs.current = null
    }
  }, [playing])

  const reset = React.useCallback(() => {
    tRef.current = 0
    lastEmit.current = 0
    setT(0)
  }, [])

  return { t, reset }
}

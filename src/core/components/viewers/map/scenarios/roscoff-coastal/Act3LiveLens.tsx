'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Act3Panel } from './Act3Panel'
import { Act3LiveLensLayer } from './Act3LiveLensLayer'
import { useRoscoffTide } from './useRoscoffTide'
import { HARBOUR_VIEW, exposure as computeExposure, recentHighWater } from './act3'

interface Props { map: maplibregl.Map }

/**
 * Act 3 — the twin as a live lens. Polls the Roscoff REFMAR gauge, drives the
 * surge readout + residual plot, and highlights quayside structures exposed at
 * the current level plus a simulated surge. Flies to the harbour on mount.
 */
export const Act3LiveLens: React.FC<Props> = ({ map }) => {
  const tide = useRoscoffTide()
  const [surge, setSurge] = React.useState(0)

  React.useEffect(() => {
    map.flyTo({ center: HARBOUR_VIEW.center, zoom: HARBOUR_VIEW.zoom })
  }, [map])

  // Flooding happens at high tide, so evaluate exposure at the recent high-water
  // mark plus the simulated surge (not the live level, which is usually low/mid
  // tide and would flood nothing — see recentHighWater).
  const highWater = recentHighWater(tide.observed)
  const level = highWater ?? 0
  const exposure = React.useMemo(() => computeExposure(level, surge), [level, surge])

  return (
    <>
      <Act3Panel tide={tide} surge={surge} onSurgeChange={setSurge} exposure={exposure} highWaterM={highWater} />
      <Act3LiveLensLayer map={map} exposure={exposure} />
    </>
  )
}
Act3LiveLens.displayName = 'Act3LiveLens'

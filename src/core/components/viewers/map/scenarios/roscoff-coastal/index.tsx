'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { ROSCOFF_VIEW } from './constants'

interface Props { map: maplibregl.Map }

/**
 * Roscoff coastal digital-twin demo — self-contained scenario module
 * (mirrors `iqaluit-incident`). Mounted dev-only from MapViewer.
 *
 * SCAFFOLD (Phase 0): flies the camera to the AOI on mount, renders no layers
 * yet. Act 1 (federation scene), Act 3 (live gauge), Act 2 (point cloud + tidal
 * animation) land in later phases. Mercator only — never set projection here.
 */
export const RoscoffCoastalDemo: React.FC<Props> = ({ map }) => {
  React.useEffect(() => {
    map.flyTo({ center: ROSCOFF_VIEW.center, zoom: ROSCOFF_VIEW.zoom })
  }, [map])

  return null
}
RoscoffCoastalDemo.displayName = 'RoscoffCoastalDemo'

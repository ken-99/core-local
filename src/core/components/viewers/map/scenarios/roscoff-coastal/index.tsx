'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Act1Control } from './Act1Control'
import { Act1FederationLayer } from './Act1FederationLayer'
import { CHANNEL_VIEW } from './act1'

interface Props { map: maplibregl.Map }

/**
 * Roscoff coastal digital-twin demo — self-contained scenario module
 * (mirrors `iqaluit-incident`). Mounted dev-only from MapViewer, inside the
 * bottom-left overlay stack so its control card stacks with the others.
 *
 * Act 1 (this phase): the Channel as a federation problem — EMODnet bathymetry
 * draped Channel-wide, median line + national survey footprints, and a click
 * popup showing one seabed point across four vertical datums. Acts 2–3 (point
 * cloud + tidal animation, live gauge) land in later phases. Mercator only.
 */
export const RoscoffCoastalDemo: React.FC<Props> = ({ map }) => {
  const [footprintsVisible, setFootprintsVisible] = React.useState(true)

  // Fly to the Channel-wide view for Act 1 on mount.
  React.useEffect(() => {
    map.flyTo({ center: CHANNEL_VIEW.center, zoom: CHANNEL_VIEW.zoom })
  }, [map])

  return (
    <>
      <Act1Control
        footprintsVisible={footprintsVisible}
        onToggleFootprints={() => setFootprintsVisible(v => !v)}
      />
      <Act1FederationLayer map={map} footprintsVisible={footprintsVisible} />
    </>
  )
}
RoscoffCoastalDemo.displayName = 'RoscoffCoastalDemo'

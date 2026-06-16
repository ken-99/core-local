'use client'

import * as React from 'react'
import { Satellite } from 'lucide-react'
import { Button } from '../../sdk/components'
import type { MapToolProps } from '../../sdk/types'
import { MapContext } from '../../../store/Map/context'
import { SCENES, EOX_S2CLOUDLESS_TILES, EOX_ATTRIBUTION, type Scene } from '../lib/scenes'

const SOURCE_ID = 'sentinel-imagery-source'
const LAYER_ID = 'sentinel-imagery-layer'

export function SentinelImageryTool(_props: MapToolProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [activeSceneId, setActiveSceneId] = React.useState<string | null>(null)

  const { state: mapState } = React.useContext(MapContext)
  const map = mapState.map.map

  const activeScene: Scene | null = React.useMemo(
    () => SCENES.find(s => s.id === activeSceneId) ?? null,
    [activeSceneId],
  )

  React.useEffect(() => {
    if (!map || !activeScene) return

    let cancelled = false
    const previousMaxBounds = map.getMaxBounds()
    map.setMaxBounds(undefined)

    const applySource = () => {
      if (cancelled) return
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {
        // style may be tearing down
      }
      map.addSource(SOURCE_ID, {
        type: 'raster',
        tiles: [EOX_S2CLOUDLESS_TILES],
        tileSize: 256,
        attribution: EOX_ATTRIBUTION,
        maxzoom: 14,
      })
      map.addLayer({
        id: LAYER_ID,
        type: 'raster',
        source: SOURCE_ID,
        paint: { 'raster-opacity': 0.95 },
      })
      map.flyTo({ center: activeScene.center, zoom: activeScene.zoom, duration: 1500 })
    }

    if (map.isStyleLoaded()) applySource()
    else map.once('load', applySource)

    return () => {
      cancelled = true
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
        map.setMaxBounds(previousMaxBounds ?? undefined)
      } catch {
        // style may already be torn down
      }
    }
  }, [map, activeScene])

  const tooltip = activeScene ? `Sentinel-2 — ${activeScene.label}` : 'Sentinel-2 Imagery'

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={tooltip}
        aria-pressed={!!activeScene}
        onClick={() => setPopoverOpen(o => !o)}
        className={`pointer-events-auto${activeScene ? ' bg-accent text-accent-foreground' : ''}`}
      >
        <Satellite className="h-5 w-5" />
      </Button>
      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Sentinel-2 scene picker"
          className="absolute bottom-full mb-1 right-0 z-20 w-64 rounded bg-primary-light p-3 shadow-lg text-xs text-primary-dark pointer-events-auto"
        >
          <div className="font-medium mb-2">Sentinel-2 cloudless (2022)</div>
          <div className="flex flex-col gap-1">
            {SCENES.map(s => {
              const active = s.id === activeSceneId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSceneId(active ? null : s.id)}
                  className={`text-left rounded px-2 py-1 border ${
                    active
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-white/80 border-primary-dark/20 hover:bg-white'
                  }`}
                >
                  <div className="font-medium">{s.label}</div>
                </button>
              )
            })}
          </div>
          {activeScene && (
            <button
              type="button"
              onClick={() => setActiveSceneId(null)}
              className="mt-2 w-full rounded border border-primary-dark/20 bg-white/80 px-2 py-1 hover:bg-white"
            >
              Hide imagery
            </button>
          )}
          <div className="mt-2 text-[10px] opacity-60">
            Source: EOX s2cloudless (Sentinel-2 mosaic)
          </div>
        </div>
      )}
    </>
  )
}

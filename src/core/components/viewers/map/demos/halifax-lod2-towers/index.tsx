"use client"

/**
 * Halifax LoD2.2 towers demo.
 *
 * Drops the roofer-reconstructed LoD2.2 model of The Summit + The Horizon
 * (Horizon Court, Dartmouth) onto the map at its real coordinates, reusing the
 * existing `CustomModelLayer` (the same three.js-on-MapLibre machinery that
 * renders user 3D models). The glb is bundled at /demo/halifax-towers.glb
 * (Y-up local metres, base at y=0); CustomModelLayer only draws at zoom >= 15.5,
 * so the toggle flies the camera in.
 *
 * Self-contained: a single control card + one CustomModelLayer instance. No
 * coupling to the Files store or the database.
 */
import * as React from 'react'
import * as THREE from 'three'
import { MapContext } from '../../../../../store/Map/context'
import { CustomModelLayer } from '../../src/MapLayers/src/FileLayer/utils/CustomModelLayer'
import type { DbFile } from '../../../../../types/dbTypes'

const TOWERS = {
  id: 'halifax-lod2-towers',
  name: 'halifax-lod2-towers',
  url: '/demo/halifax-towers.glb?v=pitched2',
  extension: 'glb',
  lng: -63.5634042,
  lat: 44.6892358,
  rotation: 0,
  elevation: 0,
} as unknown as DbFile

export const HalifaxTowersDemo = () => {
  const { state } = React.useContext(MapContext)
  const map = state.map.map
  const [shown, setShown] = React.useState(false)
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null)
  const layerRef = React.useRef<{ cleanup: () => void } | null>(null)
  // Basemap 3D building extrusions hidden while the demo is on, restored after.
  const hiddenRef = React.useRef<Array<{ id: string, vis: unknown }>>([])

  const hideMassing = React.useCallback(() => {
    if (!map) return
    const layers = map.getStyle()?.layers ?? []
    hiddenRef.current = []
    for (const L of layers) {
      if (L.type === 'fill-extrusion') {
        const vis = map.getLayoutProperty(L.id, 'visibility')
        hiddenRef.current.push({ id: L.id, vis })
        map.setLayoutProperty(L.id, 'visibility', 'none')
      }
    }
  }, [map])

  const restoreMassing = React.useCallback(() => {
    if (!map) return
    for (const { id, vis } of hiddenRef.current) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', (vis as 'visible' | 'none') ?? 'visible')
      }
    }
    hiddenRef.current = []
  }, [map])

  const teardown = React.useCallback(() => {
    layerRef.current?.cleanup()
    layerRef.current = null
    restoreMassing()
  }, [restoreMassing])

  // Dispose the shared renderer on unmount.
  React.useEffect(() => () => {
    teardown()
    rendererRef.current?.dispose()
    rendererRef.current = null
  }, [teardown])

  if (!map) return null

  const show = () => {
    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: map.getCanvas().getContext('webgl') as WebGLRenderingContext,
        antialias: true,
      })
    }
    layerRef.current = CustomModelLayer(TOWERS, map, rendererRef.current)
    hideMassing()
    map.flyTo({ center: [TOWERS.lng as number, TOWERS.lat as number], zoom: 17, pitch: 60, duration: 2500 })
    setShown(true)
  }

  const hide = () => {
    teardown()
    setShown(false)
  }

  return (
    <div className="pointer-events-auto w-fit rounded-md border border-border bg-background/90 px-3 py-2 shadow-md backdrop-blur">
      <div className="text-xs font-medium text-foreground">Halifax LoD2.2 — Summit + Horizon</div>
      <div className="mb-1 text-[10px] text-muted-foreground">Roofer reconstruction · Dartmouth NS</div>
      <button
        type="button"
        onClick={shown ? hide : show}
        className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        {shown ? 'Hide towers' : 'Show towers'}
      </button>
    </div>
  )
}

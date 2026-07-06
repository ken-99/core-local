'use client'
import * as React from 'react'
import * as THREE from 'three'
import type maplibregl from 'maplibre-gl'
import { CustomModelLayer } from '../../src/MapLayers/src/FileLayer/utils/CustomModelLayer'
import type { DbFile } from '../../../../../types/dbTypes'
import { ROSCOFF_BUILDINGS, ROSCOFF_CLOSEUP_VIEW, BDORTHO_TILE_URL, GEOPLATEFORME_WMTS } from './constants'

interface Props {
  map: maplibregl.Map
  /** Metres to lift the glb base (y=0 = IGN69 ground) against the flat basemap. */
  elevation: number
  orthoVisible: boolean
}

const IDS = { orthoSrc: 'roscoff-bdortho-src', orthoLayer: 'roscoff-bdortho' }
const MODEL_NAME = 'roscoff-buildings'

/**
 * Act 2 — the living shoreline. The Roscoff harbour + old town as roofer LOD2.2
 * buildings (from open IGN LiDAR HD), draped on IGN BD ORTHO aerial imagery.
 *
 * The buildings are one baked glb placed via the core `CustomModelLayer` (a
 * MapLibre custom 3D layer that draws three.js on the map's own canvas). It only
 * renders at zoom ≥ 15.5, so we fly to a pitched close-up on mount. Mercator only.
 */
export const Act2Buildings: React.FC<Props> = ({ map, elevation, orthoVisible }) => {
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null)
  // One stable model object; elevation is applied by mutating it + a repaint,
  // so the slider never reloads the glb or pins the frame loop.
  const modelRef = React.useRef<DbFile>({
    id: -1, name: MODEL_NAME, type: 'model', assetId: MODEL_NAME, uploadedAt: '',
    fileOrganizationId: -1, extension: 'glb', url: ROSCOFF_BUILDINGS.url,
    lng: ROSCOFF_BUILDINGS.lng, lat: ROSCOFF_BUILDINGS.lat, rotation: 0,
    elevation,
  } as unknown as DbFile)

  // ── Model layer + ortho drape: add once, clean up on unmount ────────────────
  React.useEffect(() => {
    if (!map) return
    map.flyTo({ ...ROSCOFF_CLOSEUP_VIEW, duration: 2200 })

    // Hide the basemap's own LOD1 building massing so our LOD2.2 buildings don't
    // sit on top of duplicate grey blocks. Remember what we hid to restore it.
    const hiddenExtrusions: string[] = []
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.type === 'fill-extrusion' && map.getLayoutProperty(layer.id, 'visibility') !== 'none') {
        map.setLayoutProperty(layer.id, 'visibility', 'none')
        hiddenExtrusions.push(layer.id)
      }
    }

    if (!map.getSource(IDS.orthoSrc)) {
      map.addSource(IDS.orthoSrc, {
        type: 'raster', tiles: [BDORTHO_TILE_URL], tileSize: 256, maxzoom: 21,
        attribution: GEOPLATEFORME_WMTS.attribution,
      })
    }
    if (!map.getLayer(IDS.orthoLayer)) {
      map.addLayer({
        id: IDS.orthoLayer, type: 'raster', source: IDS.orthoSrc,
        layout: { visibility: orthoVisible ? 'visible' : 'none' },
        paint: { 'raster-opacity': 0.95 },
      } as maplibregl.LayerSpecification)
    }

    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: map.getCanvas().getContext('webgl') as WebGLRenderingContext,
        antialias: true,
      })
    }
    const { cleanup } = CustomModelLayer(modelRef.current, map, rendererRef.current)

    return () => {
      cleanup()
      if (map.getLayer(IDS.orthoLayer)) map.removeLayer(IDS.orthoLayer)
      if (map.getSource(IDS.orthoSrc)) map.removeSource(IDS.orthoSrc)
      for (const id of hiddenExtrusions) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
      }
      if (rendererRef.current) { rendererRef.current.dispose(); rendererRef.current = null }
    }
  }, [map])

  // Live elevation: mutate the shared model object + one repaint (render() reads
  // modelFile.elevation each frame, so no glb reload).
  React.useEffect(() => {
    modelRef.current.elevation = elevation
    map?.triggerRepaint()
  }, [map, elevation])

  // Toggle the aerial drape without touching the model.
  React.useEffect(() => {
    if (!map || !map.getLayer(IDS.orthoLayer)) return
    map.setLayoutProperty(IDS.orthoLayer, 'visibility', orthoVisible ? 'visible' : 'none')
  }, [map, orthoVisible])

  return null
}
Act2Buildings.displayName = 'Act2Buildings'

'use client'

import * as React from 'react'
import { Ship } from 'lucide-react'
import type maplibregl from 'maplibre-gl'
import type { MapToolProps } from '../../sdk/types'
import { Button } from '../../sdk/components'
import { AISStreamClient, type AISStreamStatus } from '../lib/aisstream'
import { VesselStore } from '../lib/vesselStore'
import type { VesselUpdate } from '../lib/types'
import { buildCategoryColorExpression } from '../lib/shipTypes'
import { PointTweener } from '../../_shared/pointTween'
import { setShipLegend, resetShipLegend } from '../lib/legendStore'
import { MapContext } from '../../../store/Map/context'
import { MapLayerClickPriority } from '../../../components/viewers/map/utils/MapEventManager/MapClickManager'

const SOURCE_ID = 'ship-traffic-source'
const LAYER_ID = 'ship-traffic-symbols'
const TRAILS_SOURCE_ID = 'ship-traffic-trails-source'
const TRAILS_LAYER_ID = 'ship-traffic-trails'
const ICON_ID = 'ship-traffic-triangle'
const AGE_OUT_MS = 10 * 60 * 1000
const RENDER_THROTTLE_MS = 500

/**
 * Build a 32x32 SDF-friendly bitmap of an upward-pointing triangle.
 * SDF icons use the alpha channel as a signed distance field; for a simple
 * filled triangle, opaque inside / transparent outside is good enough.
 * The icon-color paint property will paint it any color we choose.
 */
function buildTriangleIcon(): { width: number, height: number, data: Uint8Array } {
  const size = 32
  const data = new Uint8Array(size * size * 4)
  // Triangle with apex at top-center, base at bottom edges.
  // Inside test: a point (x, y) is inside if y >= top and y <= bottom and
  // |x - cx| <= (y - top) * (halfBase / height)
  const apexX = size / 2
  const top = 4
  const bottom = size - 4
  const halfBase = size / 2 - 4
  const triHeight = bottom - top
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inside
        = y >= top
          && y <= bottom
          && Math.abs(x - apexX) <= ((y - top) / triHeight) * halfBase
      const a = inside ? 255 : 0
      data[i] = 255       // R
      data[i + 1] = 255   // G
      data[i + 2] = 255   // B
      data[i + 3] = a     // A
    }
  }
  return { width: size, height: size, data }
}

export function ShipTrafficTool({ map }: MapToolProps) {
  const [enabled, setEnabled] = React.useState(false)
  const [status, setStatus] = React.useState<AISStreamStatus>('idle')

  const storeRef = React.useRef<VesselStore | null>(null)
  const clientRef = React.useRef<AISStreamClient | null>(null)
  const dirtyRef = React.useRef(false)
  const renderTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const { state: mapState } = React.useContext(MapContext)
  const mapClickManager = mapState.map.mapClickManager

  const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY ?? ''
  const notConfigured = apiKey === ''

  // Publish enabled state to the shared map.legends host (live counts pushed
  // from the render tick below).
  React.useEffect(() => {
    if (!enabled) {
      resetShipLegend()
      return
    }
    setShipLegend({ active: true, unavailable: status === 'gaveup' })
    return () => resetShipLegend()
  }, [enabled, status])

  // Lifecycle: when enabled flips true, open WS + start render loop. When false, tear down.
  React.useEffect(() => {
    if (!enabled || !map) return

    storeRef.current = new VesselStore()

    const onUpdate = (u: VesselUpdate) => {
      if (!storeRef.current) return
      if (u.kind === 'position') storeRef.current.applyPosition(u.data)
      else storeRef.current.applyStatic(u.data)
      dirtyRef.current = true
    }

    let client: AISStreamClient
    try {
      client = new AISStreamClient(apiKey, onUpdate, setStatus)
      client.connect()
      clientRef.current = client
    } catch (err) {
      console.warn('[ship-traffic]', err)
      return
    }

    // Tween markers between ~6s AIS polls so vessels glide instead of teleporting.
    // Duration slightly exceeds the poll interval so a ship is always mid-glide
    // when the next snapshot lands (continuous motion, no stop-start).
    const tweener = new PointTweener({
      idKey: 'mmsi',
      durationMs: 8000,
      render: fc => {
        const pointsSrc = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (pointsSrc) pointsSrc.setData(fc)
      },
    })
    tweener.start()

    // Render-throttle loop: feeds new snapshots to the tweener at most every
    // RENDER_THROTTLE_MS; the tweener itself drives per-frame interpolation.
    renderTimerRef.current = setInterval(() => {
      const store = storeRef.current
      if (!store) return
      store.ageOut(AGE_OUT_MS)
      setShipLegend({ counts: store.countByCategory() })
      if (!dirtyRef.current) return
      dirtyRef.current = false
      tweener.update(store.toGeoJSON())
      const trailsSrc = map.getSource(TRAILS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (trailsSrc) trailsSrc.setData(store.toTrailsGeoJSON())
    }, RENDER_THROTTLE_MS)

    return () => {
      if (renderTimerRef.current) clearInterval(renderTimerRef.current)
      renderTimerRef.current = null
      tweener.stop()
      clientRef.current?.disconnect()
      clientRef.current = null
      storeRef.current = null
    }
  }, [enabled, map, apiKey])

  // Mount/unmount the MapLibre source and symbol layer when enabled
  React.useEffect(() => {
    if (!enabled || !map) return

    const mount = () => {
      // Register an SDF triangle icon (built from a generated bitmap so we
      // don't depend on the active style's sprite sheet — triangle-15 isn't
      // in every style).
      if (!map.hasImage(ICON_ID)) {
        const { width, height, data } = buildTriangleIcon()
        map.addImage(ICON_ID, { width, height, data }, { sdf: true })
      }
      // Trail source/layer — added FIRST so the points draw on top of trails.
      if (!map.getSource(TRAILS_SOURCE_ID)) {
        map.addSource(TRAILS_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
      }
      if (!map.getLayer(TRAILS_LAYER_ID)) {
        map.addLayer({
          id: TRAILS_LAYER_ID,
          type: 'line',
          source: TRAILS_SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': buildCategoryColorExpression() as never,
            'line-opacity': 0.55,
            'line-width': 1.5,
          },
        })
      }
      // Points source/layer — symbol with rotated triangle icon.
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': ICON_ID,
            // COG sentinel is -1; treat negatives as 0 (north) so we don't
            // rotate by -1° silently.
            'icon-rotate': ['case', ['<', ['to-number', ['get', 'cog']], 0], 0, ['get', 'cog']],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': 0.6,
          },
          paint: {
            'icon-color': buildCategoryColorExpression() as never,
            'icon-halo-color': '#ffffff',
            'icon-halo-width': 1.2,
            'icon-opacity': 0.95,
          },
        })
      }
    }

    let pendingMount: (() => void) | null = null
    if (map.isStyleLoaded()) {
      mount()
    } else {
      pendingMount = mount
      map.once('load', pendingMount)
    }

    return () => {
      // If the load listener never fired, remove it so it doesn't add a stale source/layer later
      if (pendingMount) {
        try { map.off('load', pendingMount) } catch {}
        pendingMount = null
      }
      try {
        // Remove layers before sources (MapLibre rejects removeSource while a layer references it).
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
        if (map.getLayer(TRAILS_LAYER_ID)) map.removeLayer(TRAILS_LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
        if (map.getSource(TRAILS_SOURCE_ID)) map.removeSource(TRAILS_SOURCE_ID)
        if (map.hasImage(ICON_ID)) map.removeImage(ICON_ID)
      } catch {
        // Style may already be torn down
      }
    }
  }, [enabled, map])

  // Click handler — register with MapClickManager and show a MapLibre popup
  React.useEffect(() => {
    if (!enabled || !map || !mapClickManager) return

    let popup: maplibregl.Popup | null = null
    const maplibregl = require('maplibre-gl') as typeof import('maplibre-gl')

    const handler = (e: maplibregl.MapMouseEvent, hits: maplibregl.MapGeoJSONFeature[]) => {
      const feature = hits[0]
      if (!feature) return
      const props = feature.properties ?? {}
      const lng = e.lngLat?.lng
      const lat = e.lngLat?.lat
      if (typeof lng !== 'number' || typeof lat !== 'number') return
      const html = renderPopupHtml(props)

      if (popup) popup.remove()
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map)
    }

    mapClickManager.register(LAYER_ID, MapLayerClickPriority.ShipTrafficClickPriority, handler)

    return () => {
      try { mapClickManager.unregister(LAYER_ID) } catch {}
      try { popup?.remove() } catch {}
    }
  }, [enabled, map, mapClickManager])

  const tooltip = notConfigured
    ? 'Ship Traffic — not configured (set NEXT_PUBLIC_AISSTREAM_API_KEY)'
    : status === 'gaveup'
      ? 'Ship Traffic — disconnected (5 failed reconnects)'
      : enabled ? 'Ship Traffic — on (click to disable)' : 'Ship Traffic — off (click to enable)'

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={tooltip}
        disabled={notConfigured}
        aria-pressed={enabled}
        onClick={() => setEnabled(e => !e)}
        className={`pointer-events-auto${enabled ? ' bg-accent text-accent-foreground' : ''}`}
      >
        <Ship className="h-5 w-5" />
      </Button>
    </>
  )
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!))
}

function renderPopupHtml(p: Record<string, unknown>): string {
  const name = escapeHtml(p.name ?? `MMSI ${p.mmsi ?? '—'}`)
  const ship = p.shipType != null ? `Type ${escapeHtml(p.shipType)}` : 'Type —'
  const flag = p.flag ? escapeHtml(p.flag) : '—'
  const dest = p.destination ? escapeHtml(p.destination) : '—'
  const sog = typeof p.sog === 'number' && p.sog >= 0 ? `${(p.sog as number).toFixed(1)} kn` : '—'
  const cog = typeof p.cog === 'number' && p.cog >= 0 ? `${(p.cog as number).toFixed(0)}°` : '—'
  return `
    <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; min-width: 180px">
      <div style="font-weight: 600; margin-bottom: 4px">${name}</div>
      <div>MMSI: ${escapeHtml(p.mmsi)}</div>
      <div>${ship} · Flag ${flag}</div>
      <div>Dest: ${dest}</div>
      <div>SOG ${sog} · COG ${cog}</div>
    </div>
  `
}

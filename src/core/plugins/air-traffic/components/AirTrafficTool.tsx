'use client'

import * as React from 'react'
import { Plane } from 'lucide-react'
import type maplibregl from 'maplibre-gl'
import type { MapToolProps } from '../../sdk/types'
import { Button } from '../../sdk/components'
import { OpenSkyClient, POLL_INTERVAL_MS, type OpenSkyStatus } from '../lib/opensky'
import { PointTweener } from '../../_shared/pointTween'
import { AircraftStore } from '../lib/aircraftStore'
import type { AircraftUpdate } from '../lib/types'
import { AIRCRAFT_CATEGORIES, buildCategoryColorExpression } from '../lib/aircraftTypes'
import type { AircraftCategoryId } from '../lib/aircraftTypes'
import { setAirLegend, resetAirLegend } from '../lib/legendStore'
import { MapContext } from '../../../store/Map/context'
import { MapLayerClickPriority } from '../../../components/viewers/map/utils/MapEventManager/MapClickManager'

const SOURCE_ID = 'air-traffic-source'
const LAYER_ID = 'air-traffic-symbols'
const TRAILS_SOURCE_ID = 'air-traffic-trails-source'
const TRAILS_LAYER_ID = 'air-traffic-trails'
const ICON_ID = 'air-traffic-airplane'
const AGE_OUT_MS = 15 * 60 * 1000

/**
 * Build a 32x32 SDF-friendly bitmap of an upward-pointing airplane silhouette.
 * Hand-coded path because `airfield-15` / `airport-15` Maki sprites aren't in
 * the active style (same lesson as ship-traffic's triangle SDF).
 */
function buildAirplaneIcon(): { width: number, height: number, data: Uint8Array } {
  const size = 32
  const data = new Uint8Array(size * size * 4)
  // Build by drawing on an offscreen canvas, then reading pixels.
  // jsdom's canvas is stubbed so this is a pure-Math fallback path.
  const cx = size / 2
  // Polygon vertices for a plane silhouette (apex up, wings, tail).
  // Format: list of (x, y) pairs forming a single concave polygon.
  const poly: Array<[number, number]> = [
    [cx,           3],   // nose
    [cx + 1.5,    13],   // forward fuselage right
    [cx + 13,     17],   // wingtip right
    [cx + 13,     19],   // wing trailing right
    [cx + 1.5,    19],   // fuselage right behind wings
    [cx + 3,      26],   // tail right
    [cx + 3,      28],   // tailplane right
    [cx,          27],   // tail center
    [cx - 3,      28],   // tailplane left
    [cx - 3,      26],   // tail left
    [cx - 1.5,    19],   // fuselage left behind wings
    [cx - 13,     19],   // wing trailing left
    [cx - 13,     17],   // wingtip left
    [cx - 1.5,    13],   // forward fuselage left
  ]
  // Point-in-polygon (ray cast)
  const inside = (px: number, py: number): boolean => {
    let isIn = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      const intersect = ((yi > py) !== (yj > py))
        && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      if (intersect) isIn = !isIn
    }
    return isIn
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const fill = inside(x + 0.5, y + 0.5) ? 255 : 0
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = fill
    }
  }
  return { width: size, height: size, data }
}

export function AirTrafficTool({ map }: MapToolProps) {
  const [enabled, setEnabled] = React.useState(false)
  const [status, setStatus] = React.useState<OpenSkyStatus>('idle')

  const storeRef = React.useRef<AircraftStore | null>(null)
  const clientRef = React.useRef<OpenSkyClient | null>(null)
  const dirtyRef = React.useRef(false)

  const { state: mapState } = React.useContext(MapContext)
  const mapClickManager = mapState.map.mapClickManager

  // Publish enabled state to the shared map.legends host (live counts pushed
  // from the flush tick below).
  React.useEffect(() => {
    if (!enabled) {
      resetAirLegend()
      return
    }
    setAirLegend({ active: true, unavailable: status === 'gaveup' })
    return () => resetAirLegend()
  }, [enabled, status])

  // Lifecycle: poller + store, plus a render tick that flushes dirty state to MapLibre
  React.useEffect(() => {
    if (!enabled || !map) return

    storeRef.current = new AircraftStore()

    const onUpdate = (u: AircraftUpdate) => {
      if (!storeRef.current) return
      storeRef.current.applyUpdate(u)
      dirtyRef.current = true
    }

    const username = process.env.NEXT_PUBLIC_OPENSKY_USERNAME
    const password = process.env.NEXT_PUBLIC_OPENSKY_PASSWORD
    const auth = (username && password) ? { username, password } : undefined

    const client = new OpenSkyClient(onUpdate, setStatus, auth)
    client.start()
    clientRef.current = client

    // Tween markers between 10s polls so aircraft glide instead of teleporting.
    // Duration slightly exceeds the poll interval so a plane is always mid-glide
    // when the next snapshot lands (continuous motion, no stop-start).
    const tweener = new PointTweener({
      idKey: 'icao24',
      durationMs: POLL_INTERVAL_MS + 2000,
      render: fc => {
        const pointsSrc = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (pointsSrc) pointsSrc.setData(fc)
      },
    })
    tweener.start()

    // Render flush — checks dirtyRef each second and feeds new snapshots to the
    // tweener. (Polling only happens every 10s, so 1s flush is plenty cheap.)
    const flushTimer = setInterval(() => {
      const store = storeRef.current
      if (!store) return
      store.ageOut(AGE_OUT_MS)
      setAirLegend({ counts: store.countByCategory() })
      if (!dirtyRef.current) return
      dirtyRef.current = false
      tweener.update(store.toGeoJSON())
      const trailsSrc = map.getSource(TRAILS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (trailsSrc) trailsSrc.setData(store.toTrailsGeoJSON())
    }, 1000)

    return () => {
      clearInterval(flushTimer)
      tweener.stop()
      clientRef.current?.stop()
      clientRef.current = null
      storeRef.current = null
    }
  }, [enabled, map])

  // Mount/unmount source + symbol layer + trail line layer
  React.useEffect(() => {
    if (!enabled || !map) return

    const mount = () => {
      if (!map.hasImage(ICON_ID)) {
        const { width, height, data } = buildAirplaneIcon()
        map.addImage(ICON_ID, { width, height, data }, { sdf: true })
      }
      // Trails first so points draw on top
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
          // On-ground filter: hide aircraft on the ground (taxiing/parked)
          filter: ['==', ['get', 'on_ground'], false],
          layout: {
            'icon-image': ICON_ID,
            // Heading sentinel: null → 0 (north), prevents undefined-rotate.
            'icon-rotate': ['case', ['==', ['get', 'heading'], null], 0, ['get', 'heading']],
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
      if (pendingMount) {
        try { map.off('load', pendingMount) } catch {}
        pendingMount = null
      }
      try {
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

    mapClickManager.register(LAYER_ID, MapLayerClickPriority.AirTrafficClickPriority, handler)

    return () => {
      try { mapClickManager.unregister(LAYER_ID) } catch {}
      try { popup?.remove() } catch {}
    }
  }, [enabled, map, mapClickManager])

  const tooltip = status === 'gaveup'
    ? 'Air Traffic — disconnected (5 failed polls or auth fail)'
    : enabled ? 'Air Traffic — on (click to disable)' : 'Air Traffic — off (click to enable)'

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={tooltip}
        aria-pressed={enabled}
        onClick={() => setEnabled(e => !e)}
        className={`pointer-events-auto${enabled ? ' bg-accent text-accent-foreground' : ''}`}
      >
        <Plane className="h-5 w-5" />
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
  const callsign = escapeHtml(p.callsign ?? p.icao24 ?? '—')
  const country = p.origin_country ? escapeHtml(p.origin_country) : '—'
  const catId = typeof p.category === 'string' ? p.category as AircraftCategoryId : null
  const catLabel = catId ? (AIRCRAFT_CATEGORIES.find(c => c.id === catId)?.label ?? catId) : null
  const cat = catLabel ? escapeHtml(catLabel) : '—'
  const alt = typeof p.altitude === 'number' ? `${Math.round(p.altitude as number).toLocaleString()} ft` : '—'
  const vel = typeof p.velocity === 'number' ? `${(p.velocity as number).toFixed(0)} kn` : '—'
  const hdg = typeof p.heading === 'number' ? `${(p.heading as number).toFixed(0)}°` : '—'
  // Inline styles override the global `.maplibregl-popup-content { background: transparent !important }`
  // rule in `globals.css`, which would otherwise leak the map through the popup.
  const wrapStyle = [
    'background: #ffffff',
    'color: #111',
    'padding: 8px 10px',
    'border-radius: 6px',
    'box-shadow: 0 1px 4px rgba(0,0,0,0.15)',
    'font-family: ui-sans-serif, system-ui, sans-serif',
    'font-size: 12px',
    'line-height: 1.4',
    'min-width: 180px',
  ].join('; ')
  return `
    <div style="${wrapStyle}">
      <div style="font-weight: 600; margin-bottom: 4px">${callsign}</div>
      <div>ICAO: ${escapeHtml(p.icao24)}</div>
      <div>${cat} · ${country}</div>
      <div>Alt ${alt}</div>
      <div>Vel ${vel} · Hdg ${hdg}</div>
    </div>
  `
}

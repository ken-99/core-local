'use client'

import * as React from 'react'
import { Train } from 'lucide-react'
import type maplibregl from 'maplibre-gl'
import { Button } from '../../sdk/components'
import type { MapToolProps } from '../../sdk/types'
import { Poller, type PollerStatus } from '../lib/poller'
import { VehicleStore } from '../lib/vehicleStore'
import { CITIES, CITY_BY_ID, DEFAULT_CITY_ID } from '../lib/cities'
import type { CityConfig, FeedAdapter, Vehicle } from '../lib/types'
import { tflAdapter } from '../lib/adapters/tfl'
import { hslGtfsRtAdapter } from '../lib/adapters/hslGtfsRt'
import { buildModeColorExpression } from '../lib/modes'
import { PointTweener } from '../../_shared/pointTween'
import { setTransitLegend, resetTransitLegend } from '../lib/legendStore'
import { MapContext } from '../../../store/Map/context'
import { MapLayerClickPriority } from '../../../components/viewers/map/utils/MapEventManager/MapClickManager'

const SOURCE_ID = 'public-transit-source'
const LAYER_ID = 'public-transit-symbols'
const TRAILS_SOURCE_ID = 'public-transit-trails-source'
const TRAILS_LAYER_ID = 'public-transit-trails'
const AGE_OUT_MS = 2 * 60 * 1000
/** Trails are visually nice but accumulate quadratically with vehicle count;
 * disabled until we add a smarter renderer. The store still keeps history,
 * just isn't pushed to MapLibre. */
const TRAILS_ENABLED = false

const ADAPTERS: Record<FeedAdapter['id'], FeedAdapter> = {
  tfl: tflAdapter,
  hslGtfsRt: hslGtfsRtAdapter,
}

export function PublicTransitTool(_props: MapToolProps) {
  const [enabled, setEnabled] = React.useState(false)
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [activeCityId, setActiveCityId] = React.useState<CityConfig['id']>(DEFAULT_CITY_ID)
  const [status, setStatus] = React.useState<PollerStatus>('idle')

  const storeRef = React.useRef<VehicleStore | null>(null)
  const pollerRef = React.useRef<Poller | null>(null)
  const dirtyRef = React.useRef(false)

  const { state: mapState } = React.useContext(MapContext)
  const map = mapState.map.map
  const mapClickManager = mapState.map.mapClickManager

  const city = CITY_BY_ID[activeCityId]

  // Lifecycle: poller + store, plus a render tick that flushes dirty state to MapLibre
  React.useEffect(() => {
    if (!enabled || !map) return

    // The app constrains the map to Canada via maxBounds (MapViewer.tsx:35).
    // For our global-cities plugin, we have to lift that constraint while
    // active and restore it on cleanup. Capture whatever was there first so
    // we don't assume the default — orgs can override (MapViewer.tsx:136).
    const previousMaxBounds = map.getMaxBounds()
    map.setMaxBounds(undefined)

    const store = new VehicleStore()
    storeRef.current = store

    const onUpdate = (vehicles: Vehicle[]) => {
      const s = storeRef.current
      if (!s) return
      s.merge(vehicles, Date.now())
      dirtyRef.current = true
    }

    const adapter = ADAPTERS[city.adapterId]
    const poller = new Poller(onUpdate, setStatus)
    pollerRef.current = poller
    poller.start(city, adapter)

    map.flyTo({ center: city.center, zoom: city.defaultZoom, duration: 1500 })

    // Tween markers between polls so vehicles glide instead of teleporting.
    // Duration tracks the city's poll cadence (HSL 10s, TfL 30s) plus a buffer
    // so a vehicle is always mid-glide when the next snapshot lands.
    const tweener = new PointTweener({
      idKey: 'id',
      durationMs: adapter.defaultIntervalMs + 2000,
      render: fc => {
        const pointsSrc = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (pointsSrc) pointsSrc.setData(fc as never)
      },
    })
    tweener.start()

    const flushTimer = setInterval(() => {
      const s = storeRef.current
      if (!s) return
      s.ageOut(Date.now() - AGE_OUT_MS)
      setTransitLegend({ counts: s.countByMode() })
      if (!dirtyRef.current) return
      dirtyRef.current = false
      tweener.update(s.toGeoJSON() as never)
      if (TRAILS_ENABLED) {
        const trailsSrc = map.getSource(TRAILS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
        if (trailsSrc) trailsSrc.setData(s.toTrailsGeoJSON() as never)
      }
    }, 1000)

    return () => {
      clearInterval(flushTimer)
      tweener.stop()
      pollerRef.current?.stop()
      pollerRef.current = null
      storeRef.current = null
      try { map.setMaxBounds(previousMaxBounds ?? undefined) } catch {}
    }
  }, [enabled, map, city, activeCityId])

  // Mount/unmount source + circle layer.
  // We use a circle layer (not symbol) — symbol+SDF triggered MapLibre placement
  // crashes (`e1.layout is undefined`) on this branch's renderer version. Circles
  // are uglier but render without engine entanglement.
  React.useEffect(() => {
    if (!enabled || !map) return

    const mount = () => {
      if (TRAILS_ENABLED) {
        if (!map.getSource(TRAILS_SOURCE_ID)) {
          map.addSource(TRAILS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        }
        if (!map.getLayer(TRAILS_LAYER_ID)) {
          map.addLayer({
            id: TRAILS_LAYER_ID,
            type: 'line',
            source: TRAILS_SOURCE_ID,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': buildModeColorExpression() as never,
              'line-opacity': 0.55,
              'line-width': 1.5,
            },
          })
        }
      }
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': buildModeColorExpression() as never,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.9,
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

    const closePopup = () => {
      if (popup) {
        try { popup.remove() } catch {}
        popup = null
      }
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closePopup()
    }

    const handler = (e: maplibregl.MapMouseEvent, hits: maplibregl.MapGeoJSONFeature[]) => {
      const feature = hits[0]
      if (!feature) return
      const props = feature.properties ?? {}
      const lng = e.lngLat?.lng
      const lat = e.lngLat?.lat
      if (typeof lng !== 'number' || typeof lat !== 'number') return
      const html = renderPopupHtml(props, city.label)

      closePopup()
      popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'public-transit-popup',
      })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map)
      popup.on('close', () => { popup = null })
    }

    mapClickManager.register(LAYER_ID, MapLayerClickPriority.PublicTransitClickPriority, handler)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      try { mapClickManager.unregister(LAYER_ID) } catch {}
      closePopup()
    }
  }, [enabled, map, mapClickManager, city])

  // Publish legend state to the shared <MapLegendHost> (separate React subtree).
  // active/title/modes follow enabled+city; unavailable mirrors the poller status.
  React.useEffect(() => {
    if (!enabled) {
      resetTransitLegend()
      return
    }
    setTransitLegend({
      active: true,
      title: city.label,
      modes: city.modes,
      unavailable: status === 'gaveup',
    })
    return () => resetTransitLegend()
  }, [enabled, city, status])

  const tooltip = enabled ? `Public Transit — ${city.label}` : 'Public Transit'

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={tooltip}
        aria-pressed={enabled}
        onClick={() => setPopoverOpen(o => !o)}
        className={`pointer-events-auto${enabled ? ' bg-accent text-accent-foreground' : ''}`}
      >
        <Train className="h-5 w-5" />
      </Button>
      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Public transit settings"
          className="absolute bottom-full mb-1 right-0 z-20 w-60 rounded bg-primary-light p-3 shadow-lg text-xs text-primary-dark pointer-events-auto"
        >
          <label className="block mb-2">
            <span className="block font-medium mb-1">City</span>
            <select
              value={activeCityId}
              onChange={e => setActiveCityId(e.target.value as CityConfig['id'])}
              className="w-full rounded border border-primary-dark/20 bg-white/80 px-2 py-1"
            >
              {CITIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
            <span>Show vehicles</span>
          </label>
          {status === 'gaveup' && (
            <div className="mt-2 rounded bg-red-100 text-red-800 px-2 py-1 text-[11px]">
              Feed unavailable — retrying
            </div>
          )}
        </div>
      )}
    </>
  )
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!))
}

function renderPopupHtml(p: Record<string, unknown>, cityLabel: string): string {
  const route = escapeHtml(p.routeId ?? '—')
  const mode = escapeHtml(p.mode ?? '—')
  const dest = p.destination ? escapeHtml(p.destination) : ''
  const ts = typeof p.timestamp === 'number'
    ? `${Math.max(0, Math.round((Date.now() - p.timestamp) / 1000))}s ago`
    : '—'
  const bearing = typeof p.bearing === 'number' ? `${Math.round(p.bearing)}°` : '—'
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
    'line-height: 1.35',
    'min-width: 140px',
  ].join('; ')
  return `
    <div style="${wrapStyle}">
      <div style="font-weight: 600; font-size: 13px;">${route} <span style="opacity:0.7; font-weight: 400;">(${mode})</span></div>
      ${dest ? `<div style="opacity:0.8;">→ ${dest}</div>` : ''}
      <div style="opacity:0.7;">${escapeHtml(cityLabel)}</div>
      <div style="opacity:0.7;">Updated ${ts}</div>
      <div style="opacity:0.7;">Bearing ${bearing}</div>
    </div>
  `
}

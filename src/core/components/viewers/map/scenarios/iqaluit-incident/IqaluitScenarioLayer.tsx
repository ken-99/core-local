'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
import {
  WAREHOUSE, WAREHOUSE_FOOTPRINT,
  symbolCollection, smokeParcelCollection, fireCollection,
} from './scenario'
// Note: vessel loops were validated in water against OpenStreetMap coastline data
// (© OpenStreetMap contributors, ODbL) at build time — see coastlineData.ts +
// scripts/build-coastline.mjs. That data is no longer drawn on the map at runtime.

interface Props {
  map: maplibregl.Map
  t: number
  windBearing: number
  windSpeed: number
}

const IDS = {
  warehouseSrc: 'iqaluit-warehouse-src', warehouseLayer: 'iqaluit-warehouse',
  smokeSrc: 'iqaluit-smoke-src', smokeLayer: 'iqaluit-smoke',
  fireSrc: 'iqaluit-fire-src', fireLayer: 'iqaluit-fire',
  symSrc: 'iqaluit-symbols-src', symLayer: 'iqaluit-symbols',
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function makeWindArrowEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:22px solid rgba(255,255,255,.85);filter:drop-shadow(0 0 2px rgba(0,0,0,.5));'
  return el
}

// --- Symbol icons. Drawn nose/bow UP (north) so MapLibre `icon-rotate` =
// compass heading aims them along travel. Kind colour + white outline keeps them
// legible on satellite imagery and consistent with the legend. ---
const ICON = { plane: 'iqaluit-plane', boat: 'iqaluit-boat' }
const ICON_PX = 64 // drawn @ pixelRatio 2 → ~32px before icon-size

function drawPlane(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1f6f4a'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -24)            // nose
  ctx.lineTo(4, -7); ctx.lineTo(24, 4); ctx.lineTo(24, 9); ctx.lineTo(4, 5)   // right wing
  ctx.lineTo(3, 17); ctx.lineTo(12, 24); ctx.lineTo(12, 27); ctx.lineTo(0, 22) // right tailplane
  ctx.lineTo(-12, 27); ctx.lineTo(-12, 24); ctx.lineTo(-3, 17)                 // left tailplane
  ctx.lineTo(-4, 5); ctx.lineTo(-24, 9); ctx.lineTo(-24, 4); ctx.lineTo(-4, -7) // left wing
  ctx.closePath(); ctx.fill(); ctx.stroke()
}

function drawBoat(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1d4ed8'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -24)                     // bow
  ctx.quadraticCurveTo(13, -4, 11, 18)   // right side → stern
  ctx.lineTo(-11, 18)
  ctx.quadraticCurveTo(-13, -4, 0, -24)  // left side → bow
  ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-6, -6, 12, 12) // cabin
}

function makeIconData(kind: 'plane' | 'boat'): ImageData {
  const c = document.createElement('canvas')
  c.width = ICON_PX; c.height = ICON_PX
  const ctx = c.getContext('2d')!
  ctx.translate(ICON_PX / 2, ICON_PX / 2)
  if (kind === 'plane') drawPlane(ctx)
  else drawBoat(ctx)
  return ctx.getImageData(0, 0, ICON_PX, ICON_PX)
}

export const IqaluitScenarioLayer: React.FC<Props> = ({ map, t, windBearing, windSpeed }) => {
  const markerRef = React.useRef<Marker | null>(null)

  // Add sources + layers + wind marker once; remove everything on unmount.
  React.useEffect(() => {
    if (!map) return
    const addSrc = (id: string, data: GeoJSON.GeoJSON) => {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data })
    }
    addSrc(IDS.warehouseSrc, WAREHOUSE_FOOTPRINT)
    addSrc(IDS.smokeSrc, EMPTY)
    addSrc(IDS.fireSrc, EMPTY)
    addSrc(IDS.symSrc, EMPTY)

    if (!map.hasImage(ICON.plane)) map.addImage(ICON.plane, makeIconData('plane'), { pixelRatio: 2 })
    if (!map.hasImage(ICON.boat)) map.addImage(ICON.boat, makeIconData('boat'), { pixelRatio: 2 })

    if (!map.getLayer(IDS.warehouseLayer)) {
      map.addLayer({
        id: IDS.warehouseLayer, type: 'fill', source: IDS.warehouseSrc,
        paint: { 'fill-color': '#b9b1a0', 'fill-opacity': 0.5, 'fill-outline-color': '#7c2d12' },
      })
    }
    if (!map.getLayer(IDS.smokeLayer)) {
      map.addLayer({
        id: IDS.smokeLayer, type: 'heatmap', source: IDS.smokeSrc,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          // Scale intensity + radius UP with zoom so the plume stays dense + obvious
          // when zoomed in (heatmap density otherwise thins as the points spread out).
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 1.8, 15, 3.5, 18, 6],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 12, 45, 15, 120, 18, 260],
          'heatmap-opacity': 0.9,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(120,120,120,0)',
            0.12, 'rgba(110,108,105,0.55)',
            0.5, 'rgba(150,150,150,0.85)',
            1, 'rgba(215,215,215,0.97)'],
        },
      } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.fireLayer)) {
      map.addLayer({
        id: IDS.fireLayer, type: 'heatmap', source: IDS.fireSrc,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 1.2,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 13, 26],
          'heatmap-opacity': 0.9,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(120,10,0,0)',
            0.3, 'rgba(150,20,10,0.5)',
            0.6, '#f97316',
            0.85, '#fde047',
            1, '#fffbeb'],
        },
      } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.symLayer)) {
      map.addLayer({
        id: IDS.symLayer, type: 'symbol', source: IDS.symSrc,
        layout: {
          'icon-image': ['match', ['get', 'kind'], 'aircraft', ICON.plane, 'vessel', ICON.boat, ICON.boat],
          'icon-size': 0.7,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      } as maplibregl.LayerSpecification)
    }

    markerRef.current = new Marker({ element: makeWindArrowEl() }).setLngLat(WAREHOUSE).addTo(map)

    return () => {
      for (const id of [IDS.warehouseLayer, IDS.smokeLayer, IDS.fireLayer, IDS.symLayer]) {
        if (map.getLayer(id)) map.removeLayer(id)
      }
      for (const id of [IDS.warehouseSrc, IDS.smokeSrc, IDS.fireSrc, IDS.symSrc]) {
        if (map.getSource(id)) map.removeSource(id)
      }
      for (const id of [ICON.plane, ICON.boat]) {
        if (map.hasImage(id)) map.removeImage(id)
      }
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [map])

  // Push fresh data each tick + re-aim the wind marker.
  React.useEffect(() => {
    if (!map) return
    const setData = (id: string, data: GeoJSON.GeoJSON) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
      src?.setData(data)
    }
    setData(IDS.symSrc, symbolCollection(t))
    setData(IDS.smokeSrc, smokeParcelCollection(t, windBearing, windSpeed))
    setData(IDS.fireSrc, fireCollection(t))
    markerRef.current?.setRotation(windBearing)
  }, [map, t, windBearing, windSpeed])

  return null
}
IqaluitScenarioLayer.displayName = 'IqaluitScenarioLayer'

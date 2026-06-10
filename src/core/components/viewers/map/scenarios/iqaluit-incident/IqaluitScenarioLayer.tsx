'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
import {
  INCIDENT_ORIGIN, WAREHOUSE_FOOTPRINT,
  symbolCollection, smokeParcelCollection, fireCollection, evacZoneCollection,
} from './scenario'
// Note: vessel loops were validated in water against OpenStreetMap coastline data
// (© OpenStreetMap contributors, ODbL) at build time — see coastlineData.ts +
// scripts/build-coastline.mjs. That data is no longer drawn on the map at runtime.

interface Props {
  map: maplibregl.Map
  t: number
  windBearing: number
  windSpeed: number
  evacVisible: boolean
  syntheticBim: boolean
  onWarehouseClick: () => void
}

const IDS = {
  warehouseSrc: 'iqaluit-warehouse-src', warehouseLayer: 'iqaluit-warehouse',
  smokeSrc: 'iqaluit-smoke-src', smokeLayer: 'iqaluit-smoke',
  fireSrc: 'iqaluit-fire-src', fireLayer: 'iqaluit-fire',
  symSrc: 'iqaluit-symbols-src', symLayer: 'iqaluit-symbols',
  evacSrc: 'iqaluit-evac-src', evacFill: 'iqaluit-evac-fill', evacLine: 'iqaluit-evac-line',
  bimExtrudeLayer: 'iqaluit-bim-extrude',
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

export const IqaluitScenarioLayer: React.FC<Props> = ({ map, t, windBearing, windSpeed, evacVisible, syntheticBim, onWarehouseClick }) => {
  const markerRef = React.useRef<Marker | null>(null)

  // Add sources + layers + wind marker once; remove everything on unmount.
  React.useEffect(() => {
    if (!map) return
    const addSrc = (id: string, data: GeoJSON.GeoJSON) => {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data })
    }
    addSrc(IDS.warehouseSrc, WAREHOUSE_FOOTPRINT)
    addSrc(IDS.evacSrc, evacZoneCollection())
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
    if (!map.getLayer(IDS.evacFill)) {
      map.addLayer({
        id: IDS.evacFill, type: 'fill', source: IDS.evacSrc,
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
      } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.evacLine)) {
      map.addLayer({
        id: IDS.evacLine, type: 'line', source: IDS.evacSrc,
        layout: { visibility: 'none' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 },
      } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.bimExtrudeLayer)) {
      map.addLayer({
        id: IDS.bimExtrudeLayer, type: 'fill-extrusion', source: IDS.warehouseSrc,
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#64748b', 'fill-extrusion-height': 12, 'fill-extrusion-opacity': 0.85 },
      } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.smokeLayer)) {
      map.addLayer({
        id: IDS.smokeLayer, type: 'heatmap', source: IDS.smokeSrc,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          // Ramp intensity + radius up with zoom so the plume stays a dense cloud when
          // zoomed in (parcels spread apart on screen otherwise → patchy/transparent).
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 13, 1.3, 16, 2.4, 20, 3.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 13, 60, 16, 210, 20, 700],
          'heatmap-opacity': 0.75,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(120,120,120,0)',
            0.2, 'rgba(110,105,100,0.35)',
            0.6, 'rgba(140,140,140,0.7)',
            1, 'rgba(200,200,200,0.9)'],
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

    markerRef.current = new Marker({ element: makeWindArrowEl() }).setLngLat(INCIDENT_ORIGIN).addTo(map)

    return () => {
      for (const id of [IDS.bimExtrudeLayer, IDS.evacFill, IDS.evacLine, IDS.warehouseLayer, IDS.smokeLayer, IDS.fireLayer, IDS.symLayer]) {
        if (map.getLayer(id)) map.removeLayer(id)
      }
      for (const id of [IDS.evacSrc, IDS.warehouseSrc, IDS.smokeSrc, IDS.fireSrc, IDS.symSrc]) {
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

  // Toggle evacuation-ring visibility without touching the source data.
  React.useEffect(() => {
    if (!map) return
    const v = evacVisible ? 'visible' : 'none'
    for (const id of [IDS.evacFill, IDS.evacLine]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
    }
  }, [map, evacVisible])

  // Show/hide the synthetic 3D massing fallback.
  React.useEffect(() => {
    if (!map) return
    if (map.getLayer(IDS.bimExtrudeLayer)) {
      map.setLayoutProperty(IDS.bimExtrudeLayer, 'visibility', syntheticBim ? 'visible' : 'none')
    }
  }, [map, syntheticBim])

  // Make the warehouse footprint clickable (toggles the BIM model) + show a pointer.
  React.useEffect(() => {
    if (!map) return
    const onClick = () => onWarehouseClick()
    const enter = () => { map.getCanvas().style.cursor = 'pointer' }
    const leave = () => { map.getCanvas().style.cursor = '' }
    map.on('click', IDS.warehouseLayer, onClick)
    map.on('mouseenter', IDS.warehouseLayer, enter)
    map.on('mouseleave', IDS.warehouseLayer, leave)
    return () => {
      map.off('click', IDS.warehouseLayer, onClick)
      map.off('mouseenter', IDS.warehouseLayer, enter)
      map.off('mouseleave', IDS.warehouseLayer, leave)
    }
  }, [map, onWarehouseClick])

  return null
}
IqaluitScenarioLayer.displayName = 'IqaluitScenarioLayer'

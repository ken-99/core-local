'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
import {
  WAREHOUSE, WAREHOUSE_FOOTPRINT,
  symbolCollection, smokeParcelCollection, fireCollection,
} from './scenario'

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
          'heatmap-intensity': 1,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 13, 60],
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
        id: IDS.symLayer, type: 'circle', source: IDS.symSrc,
        paint: {
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-color': ['match', ['get', 'kind'], 'aircraft', '#1f6f4a', 'vessel', '#1d4ed8', '#888888'],
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

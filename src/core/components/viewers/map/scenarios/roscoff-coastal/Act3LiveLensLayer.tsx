'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { REFMAR_GAUGE } from './constants'
import { HARBOUR_WATER, type ExposureResult } from './act3'

interface Props {
  map: maplibregl.Map
  exposure: ExposureResult[]
}

const IDS = {
  waterSrc: 'roscoff-harbour-water-src', waterFill: 'roscoff-harbour-water',
  expSrc: 'roscoff-exposure-src', expCircle: 'roscoff-exposure',
}

const EMPTY: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }

const exposureFC = (exp: ExposureResult[]): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: exp.map(e => ({
    type: 'Feature',
    properties: { name: e.name, exposed: e.exposed, margin: Number(e.marginM.toFixed(2)) },
    geometry: { type: 'Point', coordinates: e.coord },
  })),
})

function makeGaugeEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;align-items:center;gap:5px;font:11px/1 system-ui;color:#0f172a;pointer-events:none'
  el.innerHTML = '<span style="width:12px;height:12px;border-radius:50%;background:#0d9488;'
    + 'border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5)"></span>'
    + '<span style="background:rgba(255,255,255,.85);padding:1px 5px;border-radius:4px;font-weight:600">REFMAR gauge 54</span>'
  return el
}

export const Act3LiveLensLayer: React.FC<Props> = ({ map, exposure }) => {
  const gaugeRef = React.useRef<Marker | null>(null)

  React.useEffect(() => {
    if (!map) return
    if (!map.getSource(IDS.waterSrc)) map.addSource(IDS.waterSrc, { type: 'geojson', data: HARBOUR_WATER })
    if (!map.getSource(IDS.expSrc)) map.addSource(IDS.expSrc, { type: 'geojson', data: EMPTY })

    if (!map.getLayer(IDS.waterFill)) {
      map.addLayer({ id: IDS.waterFill, type: 'fill', source: IDS.waterSrc,
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.28 } } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.expCircle)) {
      map.addLayer({ id: IDS.expCircle, type: 'circle', source: IDS.expSrc,
        paint: {
          'circle-radius': 7,
          'circle-color': ['case', ['get', 'exposed'], '#dc2626', '#22c55e'],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        } } as maplibregl.LayerSpecification)
    }

    gaugeRef.current = new Marker({ element: makeGaugeEl(), anchor: 'left' }).setLngLat(REFMAR_GAUGE.coord).addTo(map)

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as { name: string; exposed: boolean; margin: number }
      const html = `<div style="font:12px system-ui;color:#0f172a"><b>${p.name}</b><br/>`
        + `${p.exposed ? '<span style="color:#dc2626">exposed</span>' : '<span style="color:#16a34a">dry</span>'} `
        + `· water ${p.margin >= 0 ? '+' : '−'}${Math.abs(p.margin).toFixed(2)} m vs threshold (IGN69)</div>`
      import('maplibre-gl').then(({ Popup }) => new Popup().setLngLat(e.lngLat).setHTML(html).addTo(map))
    }
    const enter = () => { map.getCanvas().style.cursor = 'pointer' }
    const leave = () => { map.getCanvas().style.cursor = '' }
    map.on('click', IDS.expCircle, onClick)
    map.on('mouseenter', IDS.expCircle, enter)
    map.on('mouseleave', IDS.expCircle, leave)

    return () => {
      map.off('click', IDS.expCircle, onClick)
      map.off('mouseenter', IDS.expCircle, enter)
      map.off('mouseleave', IDS.expCircle, leave)
      for (const id of [IDS.expCircle, IDS.waterFill]) if (map.getLayer(id)) map.removeLayer(id)
      for (const id of [IDS.expSrc, IDS.waterSrc]) if (map.getSource(id)) map.removeSource(id)
      gaugeRef.current?.remove(); gaugeRef.current = null
    }
  }, [map])

  // Recolor exposure points as the water level / surge changes.
  React.useEffect(() => {
    if (!map) return
    const src = map.getSource(IDS.expSrc) as maplibregl.GeoJSONSource | undefined
    src?.setData(exposureFC(exposure))
  }, [map, exposure])

  return null
}
Act3LiveLensLayer.displayName = 'Act3LiveLensLayer'

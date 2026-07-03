'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Popup } from 'maplibre-gl'
import { EMODNET_WMS } from './constants'
import { MEDIAN_LINE, SURVEY_FOOTPRINTS, datumRows, sideOfMedian, lngLatToMerc, DECLARED_OFFSETS } from './act1'

interface Props {
  map: maplibregl.Map
  footprintsVisible: boolean
}

const IDS = {
  emodSrc: 'roscoff-emodnet-src', emodLayer: 'roscoff-emodnet',
  medianSrc: 'roscoff-median-src', medianLine: 'roscoff-median-line',
  footSrc: 'roscoff-footprints-src', footFill: 'roscoff-footprints-fill', footLine: 'roscoff-footprints-line',
}

// EMODnet mean-depth bathymetry as a draped WMS raster (mercator tiles, verified).
const emodnetTileUrl = () =>
  `${EMODNET_WMS.base}?service=WMS&version=1.1.1&request=GetMap&layers=${EMODNET_WMS.meanDepthLayer}`
  + `&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true&styles=`

/** GetFeatureInfo at a lng/lat → real EMODnet depth (m below LAT) or null. */
async function queryEmodnetDepth(lng: number, lat: number): Promise<number | null> {
  const [mx, my] = lngLatToMerc(lng, lat)
  const d = 60 // ~60 m half-box around the point
  const bbox = `${mx - d},${my - d},${mx + d},${my + d}`
  const url = `${EMODNET_WMS.base}?service=WMS&version=1.1.1&request=GetFeatureInfo`
    + `&layers=${EMODNET_WMS.meanDepthLayer}&query_layers=${EMODNET_WMS.meanDepthLayer}`
    + `&srs=EPSG:3857&bbox=${bbox}&width=101&height=101&x=50&y=50&info_format=application/json`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const depth = json?.features?.[0]?.properties?.Depth
    return typeof depth === 'number' ? depth : null
  } catch {
    return null
  }
}

const fmt = (m: number) => `${m >= 0 ? '+' : '−'}${Math.abs(m).toFixed(1)} m`

function popupHtml(lng: number, lat: number, depth: number | null): string {
  const side = sideOfMedian(lng, lat)
  const survey = side === 'UK' ? 'UKHO' : 'SHOM'
  const coords = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`
  if (depth === null) {
    return `<div style="font:12px system-ui;color:#334155;max-width:240px">
      <b>${coords}</b><br/><span style="color:#94a3b8">No seabed value here (land, or outside EMODnet coverage).</span></div>`
  }
  const rows = datumRows(depth, side).map(r => `
    <tr>
      <td style="padding:2px 8px 2px 0;color:#64748b">${r.label}</td>
      <td style="padding:2px 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmt(r.value)}</td>
      <td style="padding:2px 0 2px 6px;color:#94a3b8;font-size:10px">${r.kind === 'measured' ? 'measured' : 'declared'}</td>
    </tr>`).join('')
  return `<div style="font:12px/1.35 system-ui;color:#0f172a;max-width:280px">
    <div style="font-weight:650;margin-bottom:2px">Same seabed point, four datums</div>
    <div style="color:#64748b;margin-bottom:6px">${coords} · in the <b>${survey}</b> survey area (${side})</div>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:5px;color:#94a3b8;font-size:10px">
      Depth: EMODnet mean bathymetry (LAT), real value. Other frames = declared${DECLARED_OFFSETS.illustrative ? ', illustrative' : ''}
      offsets (LAT↔IGN69, geoid↔ellipsoid) — replaced by BATHYELLI + RAF geoid in Act 2.<br/>
      Provenance kept, not erased. ${EMODNET_WMS.attribution}.
    </div>
  </div>`
}

export const Act1FederationLayer: React.FC<Props> = ({ map, footprintsVisible }) => {
  const popupRef = React.useRef<Popup | null>(null)

  // Add sources + layers once; clean up on unmount.
  React.useEffect(() => {
    if (!map) return
    if (!map.getSource(IDS.emodSrc)) {
      map.addSource(IDS.emodSrc, { type: 'raster', tiles: [emodnetTileUrl()], tileSize: 256,
        attribution: EMODNET_WMS.attribution })
    }
    if (!map.getSource(IDS.medianSrc)) map.addSource(IDS.medianSrc, { type: 'geojson', data: MEDIAN_LINE })
    if (!map.getSource(IDS.footSrc)) map.addSource(IDS.footSrc, { type: 'geojson', data: SURVEY_FOOTPRINTS })

    if (!map.getLayer(IDS.emodLayer)) {
      map.addLayer({ id: IDS.emodLayer, type: 'raster', source: IDS.emodSrc,
        paint: { 'raster-opacity': 0.82 } })
    }
    if (!map.getLayer(IDS.footFill)) {
      map.addLayer({ id: IDS.footFill, type: 'fill', source: IDS.footSrc,
        layout: { visibility: footprintsVisible ? 'visible' : 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.footLine)) {
      map.addLayer({ id: IDS.footLine, type: 'line', source: IDS.footSrc,
        layout: { visibility: footprintsVisible ? 'visible' : 'none' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } } as maplibregl.LayerSpecification)
    }
    if (!map.getLayer(IDS.medianLine)) {
      map.addLayer({ id: IDS.medianLine, type: 'line', source: IDS.medianSrc,
        paint: { 'line-color': '#111827', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } } as maplibregl.LayerSpecification)
    }

    return () => {
      for (const id of [IDS.emodLayer, IDS.footFill, IDS.footLine, IDS.medianLine]) {
        if (map.getLayer(id)) map.removeLayer(id)
      }
      for (const id of [IDS.emodSrc, IDS.medianSrc, IDS.footSrc]) {
        if (map.getSource(id)) map.removeSource(id)
      }
      popupRef.current?.remove()
      popupRef.current = null
    }
  }, [map])

  // Toggle survey footprints without touching source data.
  React.useEffect(() => {
    if (!map) return
    const v = footprintsVisible ? 'visible' : 'none'
    for (const id of [IDS.footFill, IDS.footLine]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
    }
  }, [map, footprintsVisible])

  // Click a seabed point → the datum-federation popup (the Act 1 money shot).
  React.useEffect(() => {
    if (!map) return
    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      const loading = new Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat([lng, lat]).setHTML('<div style="font:12px system-ui;color:#94a3b8">Querying EMODnet…</div>').addTo(map)
      popupRef.current?.remove()
      popupRef.current = loading
      const depth = await queryEmodnetDepth(lng, lat)
      // Only update if this popup is still the active one (user may have clicked again).
      if (popupRef.current === loading) loading.setHTML(popupHtml(lng, lat, depth))
    }
    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [map])

  return null
}
Act1FederationLayer.displayName = 'Act1FederationLayer'

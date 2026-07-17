'use client'
import * as React from 'react'
import { MapContext } from '../../../../../store/Map/context'
import { WaterLayer, WATER_LAYER_ID } from './WaterLayer'
import {
  ORTHO_IMAGE_URL, ORTHO_COORDINATES, MAR_CHIQUITA_VIEW,
  LEVEL_MIN, LEVEL_MAX, LEVEL_DEFAULT, PLAY_PERIOD_MS,
} from './constants'

const ORTHO_SOURCE = 'mar-chiquita-ortho'
const ORTHO_LAYER = 'mar-chiquita-ortho'

/**
 * Mar Chiquita water-level reveal — self-contained dev demo. Drapes the drone
 * orthomosaic and shows a DEM-derived waterline driven by a level slider + Play
 * (sine) animation. Mounted in the bottom-left overlay stack (mirrors
 * HalifaxTowersDemo). Mercator only — never sets projection.
 */
export const MarChiquitaDemo: React.FC = () => {
  const { state } = React.useContext(MapContext)
  const map = state.map.map
  const [shown, setShown] = React.useState(false)
  const [level, setLevel] = React.useState(LEVEL_DEFAULT)
  const [playing, setPlaying] = React.useState(false)

  // Ortho drape on toggle.
  React.useEffect(() => {
    if (!map) return
    const add = () => {
      if (!map.getSource(ORTHO_SOURCE)) {
        map.addSource(ORTHO_SOURCE, {
          type: 'image', url: ORTHO_IMAGE_URL, coordinates: ORTHO_COORDINATES,
        })
      }
      if (!map.getLayer(ORTHO_LAYER)) {
        // Insert the ortho BELOW the water layer (a child effect adds the water
        // layer first, so it exists here) — otherwise the opaque ortho covers it.
        const beforeWater = map.getLayer(WATER_LAYER_ID) ? WATER_LAYER_ID : undefined
        map.addLayer({ id: ORTHO_LAYER, type: 'raster', source: ORTHO_SOURCE, paint: { 'raster-opacity': 1 } }, beforeWater)
      }
      map.flyTo({ center: MAR_CHIQUITA_VIEW.center, zoom: MAR_CHIQUITA_VIEW.zoom, duration: 1500 })
    }
    const remove = () => {
      try {
        if (map.getLayer(ORTHO_LAYER)) map.removeLayer(ORTHO_LAYER)
        if (map.getSource(ORTHO_SOURCE)) map.removeSource(ORTHO_SOURCE)
      } catch { /* style tearing down */ }
    }
    if (shown) { map.isStyleLoaded() ? add() : map.once('load', add) }
    else remove()
    return () => { map.off('load', add); remove() }
  }, [map, shown])

  // Play: animate the level on a sine cycle between LEVEL_MIN and LEVEL_MAX.
  React.useEffect(() => {
    if (!playing || !shown) return
    let raf = 0
    let t0 = 0
    const mid = (LEVEL_MIN + LEVEL_MAX) / 2
    const amp = (LEVEL_MAX - LEVEL_MIN) / 2
    const tick = (t: number) => {
      if (!t0) t0 = t
      const phase = ((t - t0) / PLAY_PERIOD_MS) * 2 * Math.PI
      setLevel(mid - amp * Math.cos(phase)) // starts at LEVEL_MIN, rises first
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, shown])

  if (!map) return null

  return (
    <div style={{
      pointerEvents: 'auto', background: '#fff', borderRadius: 8, padding: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,.28)', width: 260, font: '12px system-ui', color: '#334155',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Mar Chiquita — water level</strong>
        <button type="button" onClick={() => setShown(s => !s)}
          style={{ cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 8px', background: shown ? '#2b7bbd' : '#fff', color: shown ? '#fff' : '#334155' }}>
          {shown ? 'On' : 'Off'}
        </button>
      </div>
      {shown && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setPlaying(p => !p)}
              style={{ cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 10px', background: '#fff' }}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <input type="range" min={LEVEL_MIN} max={LEVEL_MAX} step={0.05} value={level}
              onChange={e => { setPlaying(false); setLevel(Number(e.target.value)) }}
              style={{ flex: 1 }} />
            <span style={{ width: 42, textAlign: 'right' }}>{level.toFixed(2)} m</span>
          </div>
          <WaterLayer map={map} level={level} />
        </>
      )}
    </div>
  )
}
MarChiquitaDemo.displayName = 'MarChiquitaDemo'

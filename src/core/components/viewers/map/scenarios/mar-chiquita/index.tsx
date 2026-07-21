'use client'
import * as React from 'react'
import { MapContext } from '../../../../../store/Map/context'
import { MarChiquitaScene } from './MarChiquitaScene'
import {
  MAR_CHIQUITA_VIEW, SCENE_PITCH,
  LEVEL_MIN, LEVEL_MAX, LEVEL_DEFAULT, PLAY_PERIOD_MS,
  LAYER_DEFAULTS, LAYER_KEYS, LAYER_LABELS, type LayerKey,
} from './constants'

/**
 * Mar Chiquita water-level reveal — self-contained dev demo. The drone DEM is
 * drawn as a 3D ground surface with the orthomosaic draped on it, under a
 * DEM-derived waterline driven by a level slider + Play (sine) animation. Three
 * independent layer toggles composite the surface: Photo / Hillshade / Height.
 * Mounted in the bottom-left overlay stack (mirrors HalifaxTowersDemo).
 * Mercator only — never sets projection.
 */
export const MarChiquitaDemo: React.FC = () => {
  const { state, dispatch } = React.useContext(MapContext)
  const map = state.map.map
  const terrainLevel = state.map.terrainLevel
  const [shown, setShown] = React.useState(false)
  const [level, setLevel] = React.useState(LEVEL_DEFAULT)
  const [playing, setPlaying] = React.useState(false)
  const [layers, setLayers] = React.useState<Record<LayerKey, boolean>>({ ...LAYER_DEFAULTS })

  // Hiding unmounts the controls but not this component, so the toggles would
  // otherwise keep their last state — the demo should open the same way every time.
  React.useEffect(() => { if (!shown) setLayers({ ...LAYER_DEFAULTS }) }, [shown])

  // Hold flat ground for as long as the demo is shown.
  //
  // The scene draws its OWN ground — the drone DEM as a 3D mesh — and depends on
  // being the only ground in the shared depth buffer, so that dunes correctly hide
  // the water behind them. The app's global terrain (default 'medium') would put a
  // second, unrelated surface (maptiler's coarse DEM) into that same depth buffer
  // and fight our occlusion. So the demo owns the terrain state while it's up.
  //
  // Do NOT "simplify" this away: without it the water appears to cut a different
  // ground than the one it was derived from, and changes on every terrain toggle.
  //
  // `latestTerrain` mirrors the live setting so the take-over effect can read it
  // without depending on it (which would make it restore on every terrain change
  // instead of only when the demo hides).
  const latestTerrain = React.useRef(terrainLevel)
  latestTerrain.current = terrainLevel

  // Take over on show, restore the user's setting on hide. Keyed off `shown`
  // only, so the cleanup fires exactly when the demo is hidden or unmounts.
  //
  // The restore puts the map back itself rather than only dispatching state: the
  // only other code that turns this setting into a real `setTerrain` call lives in
  // the Settings panel's TerrainLevel, which is mounted only while that panel is
  // open — so a state-only restore would leave the panel reading "Medium" over a
  // flat map. We re-apply only sources that already exist, because a terrain the
  // user never had applied needs no restoring (and TerrainLevel owns creating them).
  const savedTerrain = React.useRef(terrainLevel)
  React.useEffect(() => {
    if (!map || !shown) return
    savedTerrain.current = latestTerrain.current // their value, before we force off
    dispatch({ type: 'UPDATE_TERRAIN_LEVEL', payload: { terrainLevel: 'disabled' } })
    try { map.setTerrain(null) } catch { /* style tearing down */ }
    return () => {
      const restore = savedTerrain.current
      dispatch({ type: 'UPDATE_TERRAIN_LEVEL', payload: { terrainLevel: restore } })
      try {
        // Exaggerations mirror TerrainLevel's — kept in step by hand, but only
        // reachable when that component already built the source.
        if (restore === 'medium' && map.getSource('terrain-source')) {
          map.setTerrain({ source: 'terrain-source', exaggeration: 1 })
        } else if (restore === 'high' && map.getSource('hrdem-terrain')) {
          map.setTerrain({ source: 'hrdem-terrain', exaggeration: 0.0002 })
        }
      } catch { /* style tearing down */ }
    }
  }, [map, shown, dispatch])

  // While shown, re-assert flat ground if the user flips terrain back on. The
  // Settings toggle snaps to Disabled — the demo can't render on sloped ground.
  React.useEffect(() => {
    if (!map || !shown || terrainLevel === 'disabled') return
    dispatch({ type: 'UPDATE_TERRAIN_LEVEL', payload: { terrainLevel: 'disabled' } })
    try { map.setTerrain(null) } catch { /* style tearing down */ }
  }, [map, shown, terrainLevel, dispatch])

  // Fly to the scene at a tilt on show. Fire immediately and unconditionally.
  //
  // The map is already mounted by the time the demo is turned on, and flyTo is a
  // camera op that works before the style has finished — so there is nothing to
  // wait for. Waiting was the bug: 'load' fires exactly once in the map's life
  // (miss it and the camera never moves), and 'idle' can stall for seconds behind
  // tile loading. Flying right away also points MapLibre at the demo-site tiles
  // first, instead of loading the default view's tiles and only then moving.
  React.useEffect(() => {
    if (!map || !shown) return
    map.flyTo({
      center: MAR_CHIQUITA_VIEW.center, zoom: MAR_CHIQUITA_VIEW.zoom,
      pitch: SCENE_PITCH, duration: 1500,
    })
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
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {LAYER_KEYS.map((key: LayerKey) => (
              <button key={key} type="button" aria-pressed={layers[key]}
                onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                style={{
                  cursor: 'pointer', flex: 1, borderRadius: 6, padding: '3px 4px',
                  border: '1px solid #cbd5e1',
                  background: layers[key] ? '#2b7bbd' : '#fff', color: layers[key] ? '#fff' : '#334155',
                }}>
                {LAYER_LABELS[key]}
              </button>
            ))}
          </div>
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
          <MarChiquitaScene map={map} level={level} photo={layers.photo} hillshade={layers.hillshade} height={layers.height} />
        </>
      )}
    </div>
  )
}
MarChiquitaDemo.displayName = 'MarChiquitaDemo'

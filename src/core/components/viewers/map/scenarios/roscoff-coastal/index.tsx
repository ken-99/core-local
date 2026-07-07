'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Act1Control } from './Act1Control'
import { Act1FederationLayer } from './Act1FederationLayer'
import { Act2Buildings } from './Act2Buildings'
import { Act2Control } from './Act2Control'
import { Act3LiveLens } from './Act3LiveLens'
import { Act2Water } from './Act2Water'
import { useRoscoffTide } from './useRoscoffTide'
import { springTideWindow, levelAt, tideAltitude } from './act2'
import { predictTide } from './tidePrediction'
import { exposure } from './act3'
import { WATER_FLOOR_LEVEL_M } from './constants'
import { MapContext, AppConfigContext } from '../../../../../store'

interface Props { map: maplibregl.Map }

type Act = 'act1' | 'act2' | 'act3'

const TEAL = '#0d9488'

const ActSwitcher: React.FC<{ act: Act; onChange: (a: Act) => void }> = ({ act, onChange }) => (
  <div style={{
    display: 'flex', gap: 4, background: '#ffffff', borderRadius: 8, padding: 5,
    boxShadow: '0 4px 16px rgba(0,0,0,.28)', width: 340, font: '12px system-ui', pointerEvents: 'auto',
  }}>
    {([['act1', 'Act 1 · Channel'], ['act2', 'Act 2 · Shoreline'], ['act3', 'Act 3 · Live gauge']] as [Act, string][]).map(([k, label]) => (
      <button key={k} type="button" onClick={() => onChange(k)}
        style={{
          flex: 1, height: 28, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
          border: `1px solid ${act === k ? TEAL : '#cbd5e1'}`,
          background: act === k ? TEAL : '#fff', color: act === k ? '#fff' : '#334155',
        }}>
        {label}
      </button>
    ))}
  </div>
)

/**
 * Roscoff coastal digital-twin demo — self-contained scenario module
 * (mirrors `iqaluit-incident`). Mounted dev-only from MapViewer, inside the
 * bottom-left overlay stack so its cards stack with the others.
 *
 * Two acts (switchable; one mounted at a time so their layers never clash):
 *  - Act 1 — the Channel as a federation problem (EMODnet bathymetry + median
 *    line + survey footprints + the four-datum click popup).
 *  - Act 2 — the living shoreline (roofer LOD2.2 buildings from open IGN LiDAR HD,
 *    draped on IGN BD ORTHO aerial imagery).
 *  - Act 3 — the twin as a live lens (live REFMAR gauge, surge/residual,
 *    exposure highlight).
 * Mercator only — never set projection here.
 */
export const RoscoffCoastalDemo: React.FC<Props> = ({ map }) => {
  const [act, setAct] = React.useState<Act>('act1')
  const [footprintsVisible, setFootprintsVisible] = React.useState(true)
  // Each building is flattened to its own base (y=0) in the glb, and the scene has
  // no terrain, so altitude 0 seats the town on the flat aerial drape. The slider
  // stays for fine-tuning until BATHYELLI gives the real chart-datum ↔ ellipsoid seat.
  const [buildingElevation, setBuildingElevation] = React.useState(0)
  const [orthoVisible, setOrthoVisible] = React.useState(true)

  const { state: mapState, dispatch: mapDispatch } = React.useContext(MapContext)
  const { state: appConfigState } = React.useContext(AppConfigContext)
  const maptilerKey = appConfigState.runtimeConfig.maptilerKey

  // Act 2 needs terrain so the real-height buildings sit on the hillside. Enable
  // maptiler "medium" terrain while Act 2 is active (imperatively — the Settings
  // TerrainLevel effect only runs while that tab is open) and restore on leave.
  React.useEffect(() => {
    if (act !== 'act2' || !map || !maptilerKey) return
    const prior = mapState.map.terrainLevel ?? 'disabled'
    const enable = () => {
      if (!map.getSource('terrain-source')) {
        map.addSource('terrain-source', {
          type: 'raster-dem',
          url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${maptilerKey}`,
          tileSize: 256,
        })
      }
      map.setTerrain({ source: 'terrain-source', exaggeration: 1 })
    }
    if (map.loaded()) enable(); else map.once('load', enable)
    mapDispatch({ type: 'UPDATE_TERRAIN_LEVEL', payload: { terrainLevel: 'medium' } })
    return () => {
      if (prior === 'disabled') map.setTerrain(null)
      mapDispatch({ type: 'UPDATE_TERRAIN_LEVEL', payload: { terrainLevel: prior } })
    }
  }, [act, map, maptilerKey])

  // ── Act 2 tide flood state ──────────────────────────────────────────────────
  const tide = useRoscoffTide()
  const [playing, setPlaying] = React.useState(false)
  const [phase, setPhase] = React.useState(0.5)
  const [live, setLive] = React.useState(false)
  const [surge, setSurge] = React.useState(0)
  const [waterLevel, setWaterLevel] = React.useState(0)

  // Fast play clock: sweep one tide cycle every ~8 s.
  React.useEffect(() => {
    if (!playing || live) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now
      setPhase(p => (p + dt / 8) % 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, live])

  const tideWindow = React.useMemo(
    () => (tide.model ? springTideWindow(tide.model, Date.now()) : null),
    [tide.model],
  )
  const baseLevel = tide.model && tideWindow
    ? (live ? predictTide(tide.model, Date.now()) : levelAt(tide.model, tideWindow, phase))
    : 0
  const effLevel = baseLevel + surge
  // The visible plane rests on a floor so low tide doesn't sink under the terrain
  // and vanish; the readout below still shows the true level.
  const waterAltitude = tideAltitude(Math.max(effLevel, WATER_FLOOR_LEVEL_M), waterLevel)
  const exposed = exposure(baseLevel, surge)
  const nExposed = exposed.filter(e => e.exposed).length
  const levelLabel = tide.model ? `${effLevel.toFixed(2)} m` : '—'
  const exposedLabel = tide.model ? `${nExposed} of ${exposed.length} quaysides covered` : 'loading gauge…'

  return (
    <>
      <ActSwitcher act={act} onChange={setAct} />
      {act === 'act1' && (
        <>
          <Act1Control footprintsVisible={footprintsVisible} onToggleFootprints={() => setFootprintsVisible(v => !v)} />
          <Act1FederationLayer map={map} footprintsVisible={footprintsVisible} />
        </>
      )}
      {act === 'act2' && (
        <>
          <Act2Control
            elevation={buildingElevation} onElevation={setBuildingElevation}
            orthoVisible={orthoVisible} onToggleOrtho={() => setOrthoVisible(v => !v)}
            playing={playing} onTogglePlay={() => setPlaying(p => !p)}
            phase={phase} onPhase={setPhase}
            live={live} onToggleLive={() => setLive(v => !v)}
            surge={surge} onSurge={setSurge}
            waterLevel={waterLevel} onWaterLevel={setWaterLevel}
            levelLabel={levelLabel} exposedLabel={exposedLabel} />
          <Act2Buildings map={map} elevation={buildingElevation} orthoVisible={orthoVisible} />
          <Act2Water map={map} altitudeM={waterAltitude} />
        </>
      )}
      {act === 'act3' && <Act3LiveLens map={map} />}
    </>
  )
}
RoscoffCoastalDemo.displayName = 'RoscoffCoastalDemo'

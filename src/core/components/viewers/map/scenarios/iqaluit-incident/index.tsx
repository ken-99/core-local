'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { useScenarioClock } from './useScenarioClock'
import { ScenarioControl } from './ScenarioControl'
import { ScenarioLegend } from './ScenarioLegend'
import { IqaluitScenarioLayer } from './IqaluitScenarioLayer'
import { useBimContext } from '../../../../../store'
import { loadDemoBim, DEMO_BUILDING_ID, DEMO_BIM_PLACEMENT } from './loadDemoBim'
import { setGeocoderMarkerSuppressed, removeGeocoderMarker } from '../../utils/geocoder'
import type { DbFile } from '../../../../../types/dbTypes'

interface Props { map: maplibregl.Map }

/**
 * Self-contained synthetic demo: control card + legend (bottom-left overlay
 * children) plus the imperative map layer. Owns clock + wind state. Mounted
 * dev-only from MapViewer.
 */
export const IqaluitScenarioDemo: React.FC<Props> = ({ map }) => {
  const [playing, setPlaying] = React.useState(false)
  const [playbackSpeed, setPlaybackSpeed] = React.useState(1)
  const [windBearing, setWindBearing] = React.useState(120)
  const [windSpeed, setWindSpeed] = React.useState(18)
  const [evacVisible, setEvacVisible] = React.useState(false)
  const [incidentOn, setIncidentOn] = React.useState(true) // fire + smoke present; Stop erases it
  const { t, reset } = useScenarioClock(playing, playbackSpeed)

  const { dispatch: bimDispatch } = useBimContext()
  const [bimOn, setBimOn] = React.useState(false)
  const [syntheticBim, setSyntheticBim] = React.useState(false)
  const bimFileRef = React.useRef<DbFile | null>(null)
  const [bimElevation, setBimElevation] = React.useState(DEMO_BIM_PLACEMENT.elevation)
  const bimElevationRef = React.useRef(bimElevation)

  const onToggleBim = React.useCallback(async () => {
    if (bimOn) {
      const f = bimFileRef.current
      if (f) {
        bimDispatch({ type: 'REMOVE_BIM_FROM_MAP', payload: { bimModelName: f.name } })
        bimFileRef.current = null
      }
      setSyntheticBim(false)
      setBimOn(false)
      return
    }
    const fetched = await loadDemoBim(DEMO_BUILDING_ID)
    if (fetched) {
      const bimFile: DbFile = { ...fetched, ...DEMO_BIM_PLACEMENT, elevation: bimElevationRef.current }
      bimFileRef.current = bimFile
      bimDispatch({ type: 'TOGGLE_BIM_TO_MAP', payload: { buildingModel: { bimFile, building: null } } })
      setSyntheticBim(false)
      console.info('[iqaluit-demo] loaded real BIM model:', bimFile.name)
    } else {
      setSyntheticBim(true)
      console.info('[iqaluit-demo] no real model available — showing synthetic massing')
    }
    setBimOn(true)
  }, [bimOn, bimDispatch])

  // On unmount, remove any real model we added so the demo leaves no shared-store residue.
  React.useEffect(() => () => {
    const f = bimFileRef.current
    if (f) bimDispatch({ type: 'REMOVE_BIM_FROM_MAP', payload: { bimModelName: f.name } })
  }, [bimDispatch])

  // While the demo is mounted, stop the geocoder dropping its blue result pin (camera
  // fly is kept). Also clear any stray pin already on the map. Restored on unmount.
  React.useEffect(() => {
    setGeocoderMarkerSuppressed(true)
    removeGeocoderMarker()
    return () => setGeocoderMarkerSuppressed(false)
  }, [])

  // Live elevation tuning from the menu slider. BimLayer reads `bimFile.elevation` in
  // its render loop, so mutating the loaded model's elevation + repainting re-seats it
  // smoothly without reloading the .frag. (Judge in MERCATOR — the globe/DTM altitude
  // offset is buggy: see cdt-kp1-claude/notes/globe-bim-altitude-offset-bug.md.)
  const onBimElevationChange = React.useCallback((e: number) => {
    bimElevationRef.current = e
    setBimElevation(e)
    const f = bimFileRef.current
    if (f && map) { f.elevation = e; map.triggerRepaint() }
  }, [map])

  return (
    <>
      <ScenarioControl
        playing={playing}
        onPlayToggle={() => { setPlaying(p => !p); setIncidentOn(true) }}
        onRestart={() => { reset(); setIncidentOn(true) }}
        onStop={() => { setPlaying(false); reset(); setIncidentOn(false) }}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        windBearing={windBearing}
        windSpeed={windSpeed}
        onWindBearingChange={setWindBearing}
        onWindSpeedChange={setWindSpeed}
        evacVisible={evacVisible}
        onEvacToggle={() => setEvacVisible(v => !v)}
        bimOn={bimOn}
        onToggleBim={onToggleBim}
        bimElevation={bimElevation}
        onBimElevationChange={onBimElevationChange}
      />
      <ScenarioLegend />
      <IqaluitScenarioLayer map={map} t={t} windBearing={windBearing} windSpeed={windSpeed}
        evacVisible={evacVisible} incidentOn={incidentOn} syntheticBim={syntheticBim} onWarehouseClick={onToggleBim} />
    </>
  )
}
IqaluitScenarioDemo.displayName = 'IqaluitScenarioDemo'

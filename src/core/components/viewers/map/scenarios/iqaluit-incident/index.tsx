'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { useScenarioClock } from './useScenarioClock'
import { ScenarioControl } from './ScenarioControl'
import { ScenarioLegend } from './ScenarioLegend'
import { IqaluitScenarioLayer } from './IqaluitScenarioLayer'

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
  const { t, reset } = useScenarioClock(playing, playbackSpeed)

  return (
    <>
      <ScenarioControl
        playing={playing}
        onPlayToggle={() => setPlaying(p => !p)}
        onRestart={() => { reset(); }}
        onStop={() => { setPlaying(false); reset(); }}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        windBearing={windBearing}
        windSpeed={windSpeed}
        onWindBearingChange={setWindBearing}
        onWindSpeedChange={setWindSpeed}
        evacVisible={evacVisible}
        onEvacToggle={() => setEvacVisible(v => !v)}
      />
      <ScenarioLegend />
      <IqaluitScenarioLayer map={map} t={t} windBearing={windBearing} windSpeed={windSpeed} evacVisible={evacVisible} />
    </>
  )
}
IqaluitScenarioDemo.displayName = 'IqaluitScenarioDemo'

'use client'
import * as React from 'react'
import type maplibregl from 'maplibre-gl'
import { Act1Control } from './Act1Control'
import { Act1FederationLayer } from './Act1FederationLayer'
import { Act3LiveLens } from './Act3LiveLens'

interface Props { map: maplibregl.Map }

type Act = 'act1' | 'act3'

const TEAL = '#0d9488'

const ActSwitcher: React.FC<{ act: Act; onChange: (a: Act) => void }> = ({ act, onChange }) => (
  <div style={{
    display: 'flex', gap: 4, background: '#ffffff', borderRadius: 8, padding: 5,
    boxShadow: '0 4px 16px rgba(0,0,0,.28)', width: 268, font: '12px system-ui', pointerEvents: 'auto',
  }}>
    {([['act1', 'Act 1 · Channel'], ['act3', 'Act 3 · Live gauge']] as [Act, string][]).map(([k, label]) => (
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
 *  - Act 3 — the twin as a live lens (live REFMAR gauge, surge/residual,
 *    exposure highlight).
 * Act 2 (point cloud + roofer buildings + tidal animation) lands later.
 * Mercator only — never set projection here.
 */
export const RoscoffCoastalDemo: React.FC<Props> = ({ map }) => {
  const [act, setAct] = React.useState<Act>('act1')
  const [footprintsVisible, setFootprintsVisible] = React.useState(true)

  return (
    <>
      <ActSwitcher act={act} onChange={setAct} />
      {act === 'act1' && (
        <>
          <Act1Control footprintsVisible={footprintsVisible} onToggleFootprints={() => setFootprintsVisible(v => !v)} />
          <Act1FederationLayer map={map} footprintsVisible={footprintsVisible} />
        </>
      )}
      {act === 'act3' && <Act3LiveLens map={map} />}
    </>
  )
}
RoscoffCoastalDemo.displayName = 'RoscoffCoastalDemo'

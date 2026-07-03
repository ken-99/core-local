'use client'
import * as React from 'react'

interface Props {
  footprintsVisible: boolean
  onToggleFootprints: () => void
}

const TEAL = '#0d9488'
const LEGEND: [string, string][] = [
  ['#111827', 'France–UK median line'],
  ['#2563eb', 'SHOM survey (FR · chart datum)'],
  ['#dc2626', 'UKHO survey (UK · ODN Newlyn)'],
]

export const Act1Control: React.FC<Props> = ({ footprintsVisible, onToggleFootprints }) => (
  <div style={{
    background: '#ffffff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.28)',
    padding: '12px 13px', width: 268, font: '13px/1.35 system-ui, sans-serif',
    color: '#0f172a', pointerEvents: 'auto', userSelect: 'none',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, fontWeight: 650 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
      Act 1 — the Channel as a federation problem
    </div>
    <div style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
      Click any seabed point → the same depth in four vertical datums. The platform carries
      each source&rsquo;s reference frame; it does not erase it.
    </div>

    <button type="button" onClick={onToggleFootprints}
      style={{
        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
        border: `1px solid ${footprintsVisible ? TEAL : '#cbd5e1'}`,
        background: footprintsVisible ? TEAL : '#fff',
        color: footprintsVisible ? '#fff' : '#334155', marginBottom: 10,
      }}>
      {footprintsVisible ? '◉ Survey footprints on' : '○ Survey footprints'}
    </button>

    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
      {LEGEND.map(([color, label]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155' }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: color, display: 'inline-block' }} />
          {label}
        </div>
      ))}
    </div>
  </div>
)
Act1Control.displayName = 'Act1Control'

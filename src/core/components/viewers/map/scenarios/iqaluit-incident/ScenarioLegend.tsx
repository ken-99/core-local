'use client'
import * as React from 'react'

const ROWS: [string, string][] = [
  ['#1f6f4a', 'aircraft (YFB)'],
  ['#1d4ed8', 'vessel (Frobisher Bay)'],
  ['#dc2626', 'warehouse fire'],
  ['#9ca3af', 'smoke plume'],
]

export const ScenarioLegend: React.FC = () => (
  <div style={{
    width: 268, background: 'rgba(255,255,255,.95)', borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,.28)', padding: '9px 12px',
    font: '11px/1.5 system-ui, sans-serif', color: '#334155', pointerEvents: 'auto',
  }}>
    {ROWS.map(([color, label]) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 11, height: 11, borderRadius: 2, background: color, display: 'inline-block' }} />
        {label}
      </div>
    ))}
  </div>
)
ScenarioLegend.displayName = 'ScenarioLegend'

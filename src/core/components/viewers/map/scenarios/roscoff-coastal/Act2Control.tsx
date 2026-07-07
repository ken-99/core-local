'use client'
import * as React from 'react'
import { ROSCOFF_BUILDINGS } from './constants'

interface Props {
  elevation: number
  onElevation: (m: number) => void
  orthoVisible: boolean
  onToggleOrtho: () => void
  playing: boolean
  onTogglePlay: () => void
  phase: number
  onPhase: (p: number) => void
  live: boolean
  onToggleLive: () => void
  surge: number
  onSurge: (m: number) => void
  waterLevel: number
  onWaterLevel: (m: number) => void
  levelLabel: string        // e.g. "3.42 m"
  exposedLabel: string      // e.g. "3 of 4 quaysides covered"
}

const TEAL = '#0d9488'
const LEGEND: [string, string][] = [
  ['#9c5442', 'Roof (LOD2.2)'],
  ['#bebeb9', 'Wall'],
  ['#1e6f8c', 'Water (tide)'],
]

export const Act2Control: React.FC<Props> = ({
  elevation, onElevation, orthoVisible, onToggleOrtho,
  playing, onTogglePlay, phase, onPhase, live, onToggleLive,
  surge, onSurge, waterLevel, onWaterLevel, levelLabel, exposedLabel,
}) => (
  <div style={{
    background: '#ffffff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.28)',
    padding: '12px 13px', width: 268, font: '13px/1.35 system-ui, sans-serif',
    color: '#0f172a', pointerEvents: 'auto', userSelect: 'none',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, fontWeight: 650 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
      Act 2 — the living shoreline
    </div>
    <div style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
      {ROSCOFF_BUILDINGS.count} buildings reconstructed to <b>LOD2.2</b> from open IGN LiDAR HD
      (roofer), draped on IGN BD ORTHO aerial imagery.
    </div>

    <button type="button" onClick={onToggleOrtho}
      style={{
        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
        border: `1px solid ${orthoVisible ? TEAL : '#cbd5e1'}`,
        background: orthoVisible ? TEAL : '#fff',
        color: orthoVisible ? '#fff' : '#334155', marginBottom: 12,
      }}>
      {orthoVisible ? '◉ Aerial drape on' : '○ Aerial drape'}
    </button>

    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 3 }}>
        <span>Seat height</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#334155' }}>
          {elevation >= 0 ? '+' : '−'}{Math.abs(elevation)} m
        </span>
      </div>
      <input type="range" min={-30} max={40} step={1} value={elevation}
        onChange={e => onElevation(Number(e.target.value))}
        style={{ width: '100%', accentColor: TEAL, cursor: 'pointer' }} />
    </div>

    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, fontWeight: 650 }}>
        Tide <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{levelLabel}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={onTogglePlay}
          style={{ flex: 1, height: 26, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
            border: `1px solid ${TEAL}`, background: playing ? TEAL : '#fff', color: playing ? '#fff' : '#334155' }}>
          {playing ? '❚❚ Pause' : '▶ Play tide'}
        </button>
        <button type="button" onClick={onToggleLive}
          style={{ flex: 1, height: 26, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
            border: `1px solid ${live ? TEAL : '#cbd5e1'}`, background: live ? TEAL : '#fff', color: live ? '#fff' : '#334155' }}>
          {live ? '◉ Live' : '○ Live'}
        </button>
      </div>
      <input type="range" min={0} max={1} step={0.001} value={phase} disabled={live}
        onChange={e => onPhase(Number(e.target.value))}
        style={{ width: '100%', accentColor: TEAL, cursor: live ? 'not-allowed' : 'pointer', opacity: live ? 0.4 : 1 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', margin: '6px 0 3px' }}>
        <span>Simulated surge</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#334155' }}>
          {surge >= 0 ? '+' : '−'}{Math.abs(surge).toFixed(1)} m</span>
      </div>
      <input type="range" min={-1} max={3} step={0.1} value={surge}
        onChange={e => onSurge(Number(e.target.value))} style={{ width: '100%', accentColor: TEAL, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', margin: '6px 0 3px' }}>
        <span>Sea level (calibrate)</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#334155' }}>
          {waterLevel >= 0 ? '+' : '−'}{Math.abs(waterLevel)} m</span>
      </div>
      <input type="range" min={-30} max={30} step={1} value={waterLevel}
        onChange={e => onWaterLevel(Number(e.target.value))} style={{ width: '100%', accentColor: TEAL, cursor: 'pointer' }} />
      <div style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>{exposedLabel}</div>
    </div>

    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginBottom: 6 }}>
      {LEGEND.map(([color, label]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155' }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: color, display: 'inline-block' }} />
          {label}
        </div>
      ))}
    </div>
    <div style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.3 }}>
      IGN LiDAR HD (Licence Ouverte / Etalab 2.0) → roofer LOD2.2. Footprints © IGN BD TOPO.
      Vertical seat is illustrative until BATHYELLI gives the real datum separation.
    </div>
  </div>
)
Act2Control.displayName = 'Act2Control'

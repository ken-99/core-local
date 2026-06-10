'use client'
import * as React from 'react'

interface ScenarioControlProps {
  playing: boolean
  onPlayToggle: () => void
  onRestart: () => void
  onStop: () => void
  playbackSpeed: number            // clock multiplier (0.5×–4×)
  onPlaybackSpeedChange: (x: number) => void
  windBearing: number              // deg, 0=N, the way smoke drifts TOWARD
  windSpeed: number                // knots
  onWindBearingChange: (deg: number) => void
  onWindSpeedChange: (kn: number) => void
  evacVisible: boolean
  onEvacToggle: () => void
  bimOn: boolean
  onToggleBim: () => void
  bimElevation: number             // metres; offset that seats the BIM on terrain
  onBimElevationChange: (m: number) => void
}

const TEAL = '#0d9488'
const PLAYBACK_SPEEDS = [0.5, 1, 2, 4]
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const cardinal = (b: number): string => CARDINALS[Math.round((b % 360) / 45) % 8]

export const ScenarioControl: React.FC<ScenarioControlProps> = ({
  playing, onPlayToggle, onRestart, onStop, playbackSpeed, onPlaybackSpeedChange,
  windBearing, windSpeed, onWindBearingChange, onWindSpeedChange,
  evacVisible, onEvacToggle, bimOn, onToggleBim,
  bimElevation, onBimElevationChange,
}) => {
  const dialRef = React.useRef<SVGSVGElement>(null)
  const dragging = React.useRef(false)

  const bearingFromEvent = React.useCallback((clientX: number, clientY: number) => {
    const el = dialRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const a = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI // 0 = east
    const bearing = (a + 90 + 360) % 360                              // 0 = north (up)
    onWindBearingChange(Math.round(bearing))
  }, [onWindBearingChange])

  React.useEffect(() => {
    const move = (e: PointerEvent) => { if (dragging.current) bearingFromEvent(e.clientX, e.clientY) }
    const up = () => { dragging.current = false }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [bearingFromEvent])

  return (
    <div style={{
      background: '#ffffff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.28)',
      padding: '12px 13px', width: 268, font: '13px/1.3 system-ui, sans-serif',
      color: '#0f172a', pointerEvents: 'auto', userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, fontWeight: 650 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
        Demo — Iqaluit Warehouse Incident
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 11 }}>
        <button type="button" onClick={onPlayToggle}
          style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 6, background: TEAL, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button type="button" onClick={onRestart}
          style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 6, background: '#e2e8f0', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
          ⟲ Restart
        </button>
        <button type="button" onClick={onStop}
          style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontWeight: 600, cursor: 'pointer' }}>
          ■ Stop
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11, fontSize: 12, color: '#64748b' }}>
        <span>Playback</span>
        {PLAYBACK_SPEEDS.map(s => (
          <button key={s} type="button" onClick={() => onPlaybackSpeedChange(s)}
            style={{
              height: 24, padding: '0 8px', borderRadius: 5, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${playbackSpeed === s ? TEAL : '#cbd5e1'}`,
              background: playbackSpeed === s ? TEAL : '#fff',
              color: playbackSpeed === s ? '#fff' : '#334155',
            }}>
            {s}×
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 11 }}>
        <button type="button" onClick={onEvacToggle}
          style={{
            height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
            border: `1px solid ${evacVisible ? TEAL : '#cbd5e1'}`,
            background: evacVisible ? TEAL : '#fff',
            color: evacVisible ? '#fff' : '#334155',
          }}>
          {evacVisible ? '◉ Evac zones on' : '○ Evac zones'}
        </button>
        <button type="button" onClick={onToggleBim}
          style={{
            height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
            border: `1px solid ${bimOn ? TEAL : '#cbd5e1'}`,
            background: bimOn ? TEAL : '#fff',
            color: bimOn ? '#fff' : '#334155',
          }}>
          {bimOn ? '◉ BIM on' : '⬚ Load BIM'}
        </button>
      </div>

      {bimOn && (
        <div style={{ marginBottom: 11, fontSize: 12, color: '#64748b' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>BIM elevation</span><span>{bimElevation} m</span>
          </label>
          <input type="range" min={-200} max={50} step={1} value={bimElevation}
            onChange={e => onBimElevationChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: TEAL }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <svg ref={dialRef} viewBox="0 0 100 100" width={92} height={92}
          style={{ cursor: 'grab', flex: '0 0 auto' }}
          onPointerDown={e => { dragging.current = true; bearingFromEvent(e.clientX, e.clientY) }}>
          <circle cx="50" cy="50" r="46" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
          <text x="50" y="20" textAnchor="middle" fontSize="9" fill="#94a3b8">N</text>
          <text x="50" y="86" textAnchor="middle" fontSize="9" fill="#94a3b8">S</text>
          <text x="84" y="53" textAnchor="middle" fontSize="9" fill="#94a3b8">E</text>
          <text x="16" y="53" textAnchor="middle" fontSize="9" fill="#94a3b8">W</text>
          <g transform={`rotate(${windBearing} 50 50)`}>
            <line x1="50" y1="50" x2="50" y2="14" stroke={TEAL} strokeWidth="3.5" strokeLinecap="round" />
            <polygon points="50,9 45,20 55,20" fill={TEAL} />
            <circle cx="50" cy="50" r="4" fill={TEAL} />
          </g>
        </svg>

        <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
          Wind<br />
          <b>{Math.round(windBearing)}°</b> <span style={{ color: '#94a3b8' }}>({cardinal(windBearing)})</span><br />
          <b>{windSpeed}</b> <span style={{ color: '#94a3b8' }}>kn</span>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>speed</span><span>{windSpeed} kn</span>
            </label>
            <input type="range" min={0} max={40} value={windSpeed}
              onChange={e => onWindSpeedChange(Number(e.target.value))}
              style={{ width: '100%', accentColor: TEAL }} />
          </div>
        </div>
      </div>
    </div>
  )
}
ScenarioControl.displayName = 'ScenarioControl'

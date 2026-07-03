'use client'
import * as React from 'react'
import type { TideState } from './useRoscoffTide'
import type { ExposureResult } from './act3'

interface Props {
  tide: TideState
  surge: number
  onSurgeChange: (m: number) => void
  exposure: ExposureResult[]
}

const TEAL = '#0d9488'

/** Tiny inline SVG sparkline of the residual (surge) series, last 7 days. */
const ResidualSparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 2) return <div style={{ fontSize: 11, color: '#94a3b8' }}>collecting…</div>
  const W = 242, H = 40, n = Math.min(values.length, 160)
  const step = Math.max(1, Math.floor(values.length / n))
  const pts = values.filter((_, i) => i % step === 0)
  const min = Math.min(...pts, -0.1), max = Math.max(...pts, 0.1)
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => H - ((v - min) / (max - min)) * H
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const zeroY = y(0)
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {zeroY >= 0 && zeroY <= H && <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#e2e8f0" strokeWidth={1} />}
      <path d={d} fill="none" stroke={TEAL} strokeWidth={1.5} />
    </svg>
  )
}

const fmt = (v: number | null | undefined, unit = ' m') =>
  v == null ? '—' : `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(2)}${unit}`

export const Act3Panel: React.FC<Props> = ({ tide, surge, onSurgeChange, exposure }) => {
  const { currentObserved, currentPredicted, residual, loading, error, lastFetched } = tide
  const obs = currentObserved?.v ?? null
  const surgeNow = obs != null && currentPredicted != null ? obs - currentPredicted : null
  const exposedCount = exposure.filter(e => e.exposed).length
  const updated = lastFetched ? new Date(lastFetched).toLocaleTimeString() : '—'

  return (
    <div style={{
      background: '#ffffff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.28)',
      padding: '12px 13px', width: 268, font: '13px/1.35 system-ui, sans-serif',
      color: '#0f172a', pointerEvents: 'auto', userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, fontWeight: 650 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? '#ef4444' : TEAL }} />
        Act 3 — the twin as a live lens
      </div>
      <div style={{ color: '#64748b', fontSize: 12, marginBottom: 9 }}>
        Roscoff tide gauge (REFMAR 54), live. Residual = observed − predicted = the storm-surge signal.
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 11, marginBottom: 8 }}>Feed error: {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 9, textAlign: 'center' }}>
        {[['Observed', fmt(obs)], ['Predicted', fmt(currentPredicted)], ['Surge', fmt(surgeNow)]].map(([k, v]) => (
          <div key={k} style={{ background: '#f1f5f9', borderRadius: 6, padding: '6px 4px' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>{k}</div>
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Surge, last 7 days (m)</div>
      <ResidualSparkline values={residual.map(r => r.residual)} />

      <div style={{ margin: '10px 0 4px', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
        <span>Simulated surge</span><span>+{surge.toFixed(1)} m</span>
      </div>
      <input type="range" min={0} max={3} step={0.1} value={surge}
        onChange={e => onSurgeChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: TEAL }} />

      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 9, paddingTop: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#334155' }}>Exposed structures</span>
          <b style={{ color: exposedCount ? '#dc2626' : '#16a34a' }}>{exposedCount} / {exposure.length}</b>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#334155' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#dc2626', marginRight: 4 }} />exposed</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#22c55e', marginRight: 4 }} />dry</span>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
          Thresholds illustrative until roofer buildings (Act 2). Gauge datum = chart datum → IGN69 via the declared offset. Updated {loading ? '…' : updated}.
        </div>
      </div>
    </div>
  )
}
Act3Panel.displayName = 'Act3Panel'

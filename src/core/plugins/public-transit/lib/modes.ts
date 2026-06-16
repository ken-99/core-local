import type { Mode } from './types'

export const ALL_MODES: readonly Mode[] = ['rail', 'bus', 'tram', 'ferry'] as const

export const MODE_PALETTE: Record<Mode, string> = {
  rail: '#0019A8',
  bus: '#DC241F',
  tram: '#84B817',
  ferry: '#0098D4',
}

export const MODE_GLYPHS: Record<Mode, string> = {
  rail: 'transit-rail-sdf',
  bus: 'transit-bus-sdf',
  tram: 'transit-tram-sdf',
  ferry: 'transit-ferry-sdf',
}

export const MODE_LABELS: Record<Mode, string> = {
  rail: 'Rail',
  bus: 'Bus',
  tram: 'Tram',
  ferry: 'Ferry',
}

export function modeLabel(m: Mode): string {
  return MODE_LABELS[m]
}

/**
 * Build a MapLibre `match` expression that maps `properties.mode` to a hex color.
 * Final fallback never hits (every Vehicle has a known Mode), but MapLibre requires one.
 */
export function buildModeColorExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'mode']]
  for (const m of ALL_MODES) {
    expr.push(m, MODE_PALETTE[m])
  }
  expr.push('#888') // fallback
  return expr
}

/**
 * Build a MapLibre `match` expression that maps `properties.mode` to an icon-image id.
 */
export function buildModeIconImageExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'mode']]
  for (const m of ALL_MODES) {
    expr.push(m, MODE_GLYPHS[m])
  }
  expr.push(MODE_GLYPHS.bus) // fallback
  return expr
}

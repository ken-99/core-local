import {
  ALL_MODES,
  MODE_PALETTE,
  MODE_GLYPHS,
  modeLabel,
  buildModeColorExpression,
  buildModeIconImageExpression,
} from '../lib/modes'

describe('modes', () => {
  it('exposes exactly the 4 visualization modes in stable order', () => {
    expect(ALL_MODES).toEqual(['rail', 'bus', 'tram', 'ferry'])
  })

  it('has a hex color for every mode', () => {
    for (const m of ALL_MODES) {
      expect(MODE_PALETTE[m]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('has a glyph id for every mode', () => {
    for (const m of ALL_MODES) {
      expect(typeof MODE_GLYPHS[m]).toBe('string')
      expect(MODE_GLYPHS[m].length).toBeGreaterThan(0)
    }
  })

  it('uses the spec-locked colors for each mode', () => {
    expect(MODE_PALETTE.rail).toBe('#0019A8')
    expect(MODE_PALETTE.bus).toBe('#DC241F')
    expect(MODE_PALETTE.tram).toBe('#84B817')
    expect(MODE_PALETTE.ferry).toBe('#0098D4')
  })

  it('produces human labels for each mode', () => {
    expect(modeLabel('rail')).toBe('Rail')
    expect(modeLabel('bus')).toBe('Bus')
    expect(modeLabel('tram')).toBe('Tram')
    expect(modeLabel('ferry')).toBe('Ferry')
  })

  it('builds a MapLibre match expression for icon-color from mode', () => {
    const expr = buildModeColorExpression()
    expect(expr[0]).toBe('match')
    expect(expr[1]).toEqual(['get', 'mode'])
    expect(typeof expr[expr.length - 1]).toBe('string')
  })

  it('builds a MapLibre match expression for icon-image from mode', () => {
    const expr = buildModeIconImageExpression()
    expect(expr[0]).toBe('match')
    expect(expr[1]).toEqual(['get', 'mode'])
    const flat = JSON.stringify(expr)
    expect(flat).toContain('transit-rail-sdf')
    expect(flat).toContain('transit-bus-sdf')
  })

  it('every mode in the color expression is in ALL_MODES', () => {
    const expr = buildModeColorExpression()
    for (let i = 2; i < expr.length - 1; i += 2) {
      expect(ALL_MODES).toContain(expr[i])
    }
  })
})

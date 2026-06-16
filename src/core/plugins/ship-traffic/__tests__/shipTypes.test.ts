import {
  SHIP_CATEGORIES,
  buildCategoryColorExpression,
  categorizeShipType,
  getCategoryColor,
} from '../lib/shipTypes'

describe('categorizeShipType', () => {
  test('30 → fishing', () => {
    expect(categorizeShipType(30)).toBe('fishing')
  })

  test('31, 32, 52 → tug', () => {
    expect(categorizeShipType(31)).toBe('tug')
    expect(categorizeShipType(32)).toBe('tug')
    expect(categorizeShipType(52)).toBe('tug')
  })

  test('36, 37 → sailing', () => {
    expect(categorizeShipType(36)).toBe('sailing')
    expect(categorizeShipType(37)).toBe('sailing')
  })

  test('40-49 → highspeed', () => {
    expect(categorizeShipType(40)).toBe('highspeed')
    expect(categorizeShipType(45)).toBe('highspeed')
    expect(categorizeShipType(49)).toBe('highspeed')
  })

  test('60-69 → passenger', () => {
    expect(categorizeShipType(60)).toBe('passenger')
    expect(categorizeShipType(65)).toBe('passenger')
    expect(categorizeShipType(69)).toBe('passenger')
  })

  test('70-79 → cargo', () => {
    expect(categorizeShipType(70)).toBe('cargo')
    expect(categorizeShipType(75)).toBe('cargo')
    expect(categorizeShipType(79)).toBe('cargo')
  })

  test('80-89 → tanker', () => {
    expect(categorizeShipType(80)).toBe('tanker')
    expect(categorizeShipType(85)).toBe('tanker')
    expect(categorizeShipType(89)).toBe('tanker')
  })

  test('0 → other (sentinel for "not available")', () => {
    expect(categorizeShipType(0)).toBe('other')
  })

  test('undefined / null / NaN / out-of-range → other', () => {
    expect(categorizeShipType(undefined)).toBe('other')
    expect(categorizeShipType(null)).toBe('other')
    expect(categorizeShipType(Number.NaN)).toBe('other')
    expect(categorizeShipType(-1)).toBe('other')
    expect(categorizeShipType(100)).toBe('other')
    expect(categorizeShipType(999)).toBe('other')
  })

  test('uncategorized but valid codes (1-29, 33-35, 38-39, 50-51, 53-59, 90-99) → other', () => {
    expect(categorizeShipType(1)).toBe('other')
    expect(categorizeShipType(29)).toBe('other')
    expect(categorizeShipType(33)).toBe('other')
    expect(categorizeShipType(38)).toBe('other')
    expect(categorizeShipType(50)).toBe('other')
    expect(categorizeShipType(53)).toBe('other')
    expect(categorizeShipType(90)).toBe('other')
    expect(categorizeShipType(99)).toBe('other')
  })
})

describe('SHIP_CATEGORIES table', () => {
  test('every category has a unique id, label, and 7-char hex color', () => {
    const ids = new Set<string>()
    for (const cat of SHIP_CATEGORIES) {
      expect(ids.has(cat.id)).toBe(false)
      ids.add(cat.id)
      expect(cat.label.length).toBeGreaterThan(0)
      expect(cat.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test("includes 'other' as the catch-all", () => {
    expect(SHIP_CATEGORIES.some(c => c.id === 'other')).toBe(true)
  })
})

describe('getCategoryColor', () => {
  test('returns the color for each defined id', () => {
    expect(getCategoryColor('cargo')).toBe('#f97316')
    expect(getCategoryColor('other')).toBe('#6b7280')
  })
})

describe('buildCategoryColorExpression', () => {
  test('starts with [match, [get, category]] and ends with the other-color default', () => {
    const expr = buildCategoryColorExpression()
    expect(expr[0]).toBe('match')
    expect(expr[1]).toEqual(['get', 'category'])
    expect(expr[expr.length - 1]).toBe('#6b7280') // 'other' color is the default
  })

  test('contains every non-other category as a (id, color) pair', () => {
    const expr = buildCategoryColorExpression()
    const flat = expr.slice(2, -1) as string[]
    const nonOther = SHIP_CATEGORIES.filter(c => c.id !== 'other')
    expect(flat.length).toBe(nonOther.length * 2)
    for (const cat of nonOther) {
      const i = flat.indexOf(cat.id)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(flat[i + 1]).toBe(cat.color)
    }
  })
})

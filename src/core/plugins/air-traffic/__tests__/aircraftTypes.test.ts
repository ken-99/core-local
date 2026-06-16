import {
  AIRCRAFT_CATEGORIES,
  categorize,
  categorizeWithAltitude,
  buildCategoryColorExpression,
  getCategoryColor,
} from '../lib/aircraftTypes'

describe('aircraftTypes', () => {
  describe('categorize', () => {
    it('maps OpenSky Heavy (6) to commercial', () => {
      expect(categorize(6)).toBe('commercial')
    })

    it('maps OpenSky Large (4) and High vortex (5) to commercial', () => {
      expect(categorize(4)).toBe('commercial')
      expect(categorize(5)).toBe('commercial')
    })

    it('maps OpenSky Small (3) to regional', () => {
      expect(categorize(3)).toBe('regional')
    })

    it('maps OpenSky Light (2) to light', () => {
      expect(categorize(2)).toBe('light')
    })

    it('maps OpenSky Rotorcraft (8) to rotorcraft', () => {
      expect(categorize(8)).toBe('rotorcraft')
    })

    it('maps OpenSky High-perf (7) to other', () => {
      expect(categorize(7)).toBe('other')
    })

    it('maps null/undefined to other', () => {
      expect(categorize(null)).toBe('other')
      expect(categorize(undefined)).toBe('other')
    })

    it('maps category 0 (No info) and 1 (No info) to other', () => {
      expect(categorize(0)).toBe('other')
      expect(categorize(1)).toBe('other')
    })

    it('maps non-aircraft categories 9-15 to other', () => {
      for (const c of [9, 10, 11, 12, 13, 14, 15]) {
        expect(categorize(c)).toBe('other')
      }
    })

    it('maps out-of-range numbers to other', () => {
      expect(categorize(-1)).toBe('other')
      expect(categorize(99)).toBe('other')
      expect(categorize(Number.NaN)).toBe('other')
    })
  })

  describe('AIRCRAFT_CATEGORIES', () => {
    it('contains exactly 5 categories', () => {
      expect(AIRCRAFT_CATEGORIES).toHaveLength(5)
    })

    it('every category has unique id, label, and color', () => {
      const ids = AIRCRAFT_CATEGORIES.map(c => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const c of AIRCRAFT_CATEGORIES) {
        expect(c.label).toBeTruthy()
        expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })
  })

  describe('buildCategoryColorExpression', () => {
    it('returns a MapLibre match expression with all non-other categories first and other as default', () => {
      const expr = buildCategoryColorExpression() as unknown[]
      expect(expr[0]).toBe('match')
      expect(expr[1]).toEqual(['get', 'category'])
      // After ['match', ['get','category']]: pairs of (id, color), then default
      // 4 non-other categories × 2 = 8 entries, plus 1 default = 9
      expect(expr.length).toBe(2 + 8 + 1)
      // Default (last entry) is the 'other' color
      expect(expr[expr.length - 1]).toBe(getCategoryColor('other'))
    })
  })

  describe('categorizeWithAltitude', () => {
    it('uses broadcast category when present', () => {
      expect(categorizeWithAltitude(6, 35000)).toBe('commercial')
      expect(categorizeWithAltitude(2, 5000)).toBe('light')
      expect(categorizeWithAltitude(8, 1500)).toBe('rotorcraft')
    })

    it('broadcast category overrides altitude (a Cessna at 25000ft is still light)', () => {
      expect(categorizeWithAltitude(2, 25000)).toBe('light')
    })

    it('falls back to commercial at >= 25000ft when no broadcast category', () => {
      expect(categorizeWithAltitude(0, 25000)).toBe('commercial')
      expect(categorizeWithAltitude(0, 35000)).toBe('commercial')
      expect(categorizeWithAltitude(null, 28000)).toBe('commercial')
      expect(categorizeWithAltitude(undefined, 40000)).toBe('commercial')
    })

    it('falls back to regional in 10000-24999ft when no broadcast category', () => {
      expect(categorizeWithAltitude(0, 10000)).toBe('regional')
      expect(categorizeWithAltitude(0, 15000)).toBe('regional')
      expect(categorizeWithAltitude(null, 24999)).toBe('regional')
    })

    it('falls back to light below 10000ft when no broadcast category', () => {
      expect(categorizeWithAltitude(0, 9999)).toBe('light')
      expect(categorizeWithAltitude(0, 5000)).toBe('light')
      expect(categorizeWithAltitude(null, 0)).toBe('light')
    })

    it('returns "other" when no broadcast AND no altitude data', () => {
      expect(categorizeWithAltitude(0, null)).toBe('other')
      expect(categorizeWithAltitude(0, undefined)).toBe('other')
      expect(categorizeWithAltitude(null, null)).toBe('other')
      expect(categorizeWithAltitude(undefined, undefined)).toBe('other')
    })

    it('handles category 1 (No emitter info) the same as 0', () => {
      expect(categorizeWithAltitude(1, 35000)).toBe('commercial')
      expect(categorizeWithAltitude(1, null)).toBe('other')
    })

    it('rotorcraft is NOT inferred from low altitude (only from broadcast)', () => {
      // A category-0 aircraft at 1500ft is light, not rotorcraft. Rotorcraft
      // can only be identified from the broadcast.
      expect(categorizeWithAltitude(0, 1500)).toBe('light')
    })
  })
})

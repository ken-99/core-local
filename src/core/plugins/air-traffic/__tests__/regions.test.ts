import { REGIONS, openSkyQueryString } from '../lib/regions'

describe('regions', () => {
  describe('REGIONS', () => {
    it('contains a single Salish Sea region', () => {
      expect(REGIONS).toHaveLength(1)
      expect(REGIONS[0].name).toMatch(/Salish Sea/)
    })

    it('has a valid bbox (west < east, south < north, lat in [-90,90])', () => {
      for (const r of REGIONS) {
        const [west, south, east, north] = r.bbox
        expect(west).toBeLessThan(east)
        expect(south).toBeLessThan(north)
        expect(south).toBeGreaterThanOrEqual(-90)
        expect(north).toBeLessThanOrEqual(90)
      }
    })

    it('matches ship-traffic Salish Sea bbox exactly (cohabitation)', () => {
      // Same bbox as cdt-kp1/src/core/plugins/ship-traffic/lib/regions.ts —
      // both plugins should animate the same patch of map.
      expect(REGIONS[0].bbox).toEqual([-124.0, 48.30, -122.80, 49.40])
    })
  })

  describe('openSkyQueryString', () => {
    it('encodes the Salish Sea bbox as lamin/lamax/lomin/lomax with extended=1', () => {
      const qs = openSkyQueryString()
      const params = new URLSearchParams(qs)
      expect(params.get('lamin')).toBe('48.3')
      expect(params.get('lamax')).toBe('49.4')
      expect(params.get('lomin')).toBe('-124')
      expect(params.get('lomax')).toBe('-122.8')
      expect(params.get('extended')).toBe('1')
    })
  })
})

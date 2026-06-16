import { AircraftStore } from '../lib/aircraftStore'
import type { AircraftPosition, AircraftStatic } from '../lib/types'

const POS = (over: Partial<AircraftPosition> = {}): AircraftPosition => ({
  icao24: 'a4b1c5',
  lat: 49.0,
  lon: -123.0,
  heading: 90,
  velocity: 250,
  baroAltitudeFt: 30000,
  verticalRateFpm: 0,
  onGround: false,
  lastContactMs: 1_000_000,
  receivedAt: 1_000_000,
  ...over,
})

const STA = (over: Partial<AircraftStatic> = {}): AircraftStatic => ({
  icao24: 'a4b1c5',
  callsign: 'ACA123',
  originCountry: 'Canada',
  category: 6,
  receivedAt: 1_000_000,
  ...over,
})

describe('AircraftStore', () => {
  describe('applyUpdate', () => {
    it('stores a position update under icao24', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS() })
      expect(s.size()).toBe(1)
      expect(s.get('a4b1c5')?.position?.lat).toBe(49.0)
    })

    it('merges static data without losing position', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS() })
      s.applyUpdate({ kind: 'static', data: STA({ callsign: 'ACA123' }) })
      const v = s.get('a4b1c5')
      expect(v?.position?.lat).toBe(49.0)
      expect(v?.static?.callsign).toBe('ACA123')
    })

    it('icao24 keys are stable across updates', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.0 }) })
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.5 }) })
      expect(s.size()).toBe(1)
      expect(s.get('a4b1c5')?.position?.lat).toBe(49.5)
    })

    it('appends to history on each position update', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.0, receivedAt: 1000 }) })
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.1, receivedAt: 2000 }) })
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.2, receivedAt: 3000 }) })
      const v = s.get('a4b1c5')
      expect(v?.history).toHaveLength(3)
      expect(v?.history?.[0].lat).toBe(49.0)
      expect(v?.history?.[2].lat).toBe(49.2)
    })

    it('caps history at 60 points (oldest dropped)', () => {
      const s = new AircraftStore()
      for (let i = 0; i < 70; i++) {
        s.applyUpdate({ kind: 'position', data: POS({ lat: 49 + i * 0.001, receivedAt: 1000 + i }) })
      }
      const v = s.get('a4b1c5')
      expect(v?.history).toHaveLength(60)
      // Oldest 10 should have been dropped — first should be the 11th update
      expect(v?.history?.[0].receivedAt).toBe(1010)
      expect(v?.history?.[59].receivedAt).toBe(1069)
    })

    it('lastSeen reflects the latest receivedAt across kinds', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ receivedAt: 1000 }) })
      s.applyUpdate({ kind: 'static',   data: STA({ receivedAt: 5000 }) })
      s.applyUpdate({ kind: 'position', data: POS({ receivedAt: 3000 }) })
      expect(s.get('a4b1c5')?.lastSeen).toBe(5000)
    })
  })

  describe('ageOut', () => {
    it('removes aircraft last-seen before now - maxAgeMs', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'old',   receivedAt: 1_000 }) })
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'fresh', receivedAt: 50_000 }) })
      s.ageOut(10_000, 60_000)
      expect(s.size()).toBe(1)
      expect(s.get('fresh')).toBeDefined()
      expect(s.get('old')).toBeUndefined()
    })

    it('keeps aircraft updated within maxAgeMs', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ receivedAt: 50_000 }) })
      s.ageOut(10_000, 55_000)
      expect(s.size()).toBe(1)
    })
  })

  describe('toGeoJSON', () => {
    it('emits a Point feature per aircraft with a position', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS() })
      s.applyUpdate({ kind: 'static',   data: STA() })
      const fc = s.toGeoJSON()
      expect(fc.type).toBe('FeatureCollection')
      expect(fc.features).toHaveLength(1)
      expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [-123.0, 49.0] })
    })

    it('skips aircraft with no position yet (static-only)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'static', data: STA() })
      expect(s.toGeoJSON().features).toHaveLength(0)
    })

    it('properties include icao24, callsign, category, on_ground, heading, altitude, velocity, origin_country', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ heading: 270, velocity: 400, baroAltitudeFt: 35000, onGround: false }) })
      s.applyUpdate({ kind: 'static',   data: STA({ callsign: 'ACA123', originCountry: 'Canada', category: 6 }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.icao24).toBe('a4b1c5')
      expect(props.callsign).toBe('ACA123')
      expect(props.category).toBe('commercial')
      expect(props.on_ground).toBe(false)
      expect(props.heading).toBe(270)
      expect(props.altitude).toBe(35000)
      expect(props.velocity).toBe(400)
      expect(props.origin_country).toBe('Canada')
    })

    it('falls back to icao24 when callsign is empty', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS() })
      s.applyUpdate({ kind: 'static',   data: STA({ callsign: '' }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.callsign).toBe('a4b1c5')
    })

    it('category falls back to "other" when no static AND no altitude data', () => {
      const s = new AircraftStore()
      // No static (no broadcast category) and no altitude → no signal at all → 'other'.
      s.applyUpdate({ kind: 'position', data: POS({ baroAltitudeFt: null }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.category).toBe('other')
    })

    it('falls back to altitude band when no broadcast category (>= 25000ft → commercial)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ baroAltitudeFt: 35000 }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.category).toBe('commercial')
    })

    it('falls back to altitude band when no broadcast category (10000-24999ft → regional)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ baroAltitudeFt: 15000 }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.category).toBe('regional')
    })

    it('falls back to altitude band when no broadcast category (< 10000ft → light)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ baroAltitudeFt: 5000 }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.category).toBe('light')
    })

    it('broadcast category overrides altitude fallback', () => {
      const s = new AircraftStore()
      // Light aircraft at 35000ft — broadcast says light, altitude alone would say commercial.
      // Broadcast wins.
      s.applyUpdate({ kind: 'position', data: POS({ baroAltitudeFt: 35000 }) })
      s.applyUpdate({ kind: 'static',   data: STA({ category: 2 }) })
      const props = s.toGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.category).toBe('light')
    })

    it('does NOT exclude on-ground aircraft (filtering happens at the layer)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ onGround: true, baroAltitudeFt: null }) })
      const fc = s.toGeoJSON()
      expect(fc.features).toHaveLength(1)
      expect((fc.features[0].properties as Record<string, unknown>).on_ground).toBe(true)
    })
  })

  describe('toTrailsGeoJSON', () => {
    it('emits a LineString per aircraft with at least 2 history points', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.0, lon: -123.0, receivedAt: 1000 }) })
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.1, lon: -123.1, receivedAt: 2000 }) })
      const fc = s.toTrailsGeoJSON()
      expect(fc.features).toHaveLength(1)
      const coords = fc.features[0].geometry.coordinates
      expect(coords).toEqual([[-123.0, 49.0], [-123.1, 49.1]])
    })

    it('skips aircraft with fewer than 2 history points', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS() })
      expect(s.toTrailsGeoJSON().features).toHaveLength(0)
    })

    it('trail color falls back to "other" when no static AND no altitude', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.0, receivedAt: 1000, baroAltitudeFt: null }) })
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.1, receivedAt: 2000, baroAltitudeFt: null }) })
      const props = s.toTrailsGeoJSON().features[0].properties as Record<string, unknown>
      expect(props.category).toBe('other')
    })

    it('trail color uses latest altitude for fallback (descending → regional)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.0, receivedAt: 1000, baroAltitudeFt: 35000 }) })
      s.applyUpdate({ kind: 'position', data: POS({ lat: 49.1, receivedAt: 2000, baroAltitudeFt: 15000 }) })
      const props = s.toTrailsGeoJSON().features[0].properties as Record<string, unknown>
      // Latest altitude is 15000ft → regional (descending into the airport).
      expect(props.category).toBe('regional')
    })
  })

  describe('countByCategory', () => {
    it('counts airborne aircraft per display category', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'a', baroAltitudeFt: 35000 }) })
      s.applyUpdate({ kind: 'static',   data: STA({ icao24: 'a', category: 6 }) }) // commercial
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'b', baroAltitudeFt: 15000 }) }) // regional (altitude)
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'c', baroAltitudeFt: 5000 }) })  // light (altitude)
      const counts = s.countByCategory()
      expect(counts.commercial).toBe(1)
      expect(counts.regional).toBe(1)
      expect(counts.light).toBe(1)
      expect(counts.rotorcraft).toBe(0)
      expect(counts.other).toBe(0)
    })

    it('excludes on-ground aircraft (matches the rendered layer filter)', () => {
      const s = new AircraftStore()
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'air', baroAltitudeFt: 35000, onGround: false }) })
      s.applyUpdate({ kind: 'position', data: POS({ icao24: 'gnd', baroAltitudeFt: 35000, onGround: true }) })
      expect(s.countByCategory().commercial).toBe(1)
    })

    it('returns all-zero counts for an empty store', () => {
      const counts = new AircraftStore().countByCategory()
      expect(Object.values(counts).every(n => n === 0)).toBe(true)
    })
  })
})

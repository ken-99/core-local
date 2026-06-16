import {
  CITIES,
  CITY_BY_ID,
  getCityById,
  DEFAULT_CITY_ID,
  isCityKeyAvailable,
} from '../lib/cities'

describe('cities', () => {
  it('exposes London and Helsinki', () => {
    expect(CITIES.map(c => c.id).sort()).toEqual(['helsinki', 'london'])
  })

  it('London config has the expected shape', () => {
    const london = CITY_BY_ID.london
    expect(london.label).toBe('London')
    expect(london.adapterId).toBe('tfl')
    expect(london.apiKeyEnvVar).toBe('TFL_API_KEY')
    expect(london.center).toEqual([-0.118, 51.509])
    expect(london.defaultZoom).toBe(11)
    expect(london.feedEndpoints).toContain('bus')
    expect(london.feedEndpoints).toContain('tube')
    expect(london.modes).toEqual(['rail', 'bus', 'tram', 'ferry'])
  })

  it('Helsinki config has the expected shape', () => {
    const hel = CITY_BY_ID.helsinki
    expect(hel.label).toBe('Helsinki')
    expect(hel.adapterId).toBe('hslGtfsRt')
    expect(hel.apiKeyEnvVar).toBeUndefined()
    expect(hel.center).toEqual([24.945, 60.192])
    expect(hel.defaultZoom).toBe(11)
    expect(hel.feedEndpoints).toEqual(['hsl'])
    expect(hel.modes).toEqual(['rail', 'bus', 'tram', 'ferry'])
  })

  it('getCityById returns the matching config', () => {
    expect(getCityById('london').id).toBe('london')
    expect(getCityById('helsinki').id).toBe('helsinki')
  })

  it('default city is London', () => {
    expect(DEFAULT_CITY_ID).toBe('london')
  })

  it('isCityKeyAvailable returns true for cities with no required key', () => {
    expect(isCityKeyAvailable(CITY_BY_ID.helsinki, {})).toBe(true)
  })

  it('isCityKeyAvailable returns true for London regardless of key (key is optional)', () => {
    expect(isCityKeyAvailable(CITY_BY_ID.london, {})).toBe(true)
    expect(isCityKeyAvailable(CITY_BY_ID.london, { TFL_API_KEY: 'xyz' })).toBe(true)
  })
})

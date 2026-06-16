import type { CityConfig } from './types'

const LONDON: CityConfig = {
  id: 'london',
  label: 'London',
  center: [-0.118, 51.509],
  defaultZoom: 11,
  // Central London (roughly Zones 1-2) — used as a client-side filter to
  // keep payload + render load manageable. Greater London's bus fleet is
  // ~9000 vehicles, which crashes MapLibre.
  bbox: [-0.25, 51.45, 0.05, 51.58],
  adapterId: 'tfl',
  apiKeyEnvVar: 'TFL_API_KEY',
  feedEndpoints: ['tube', 'bus', 'dlr', 'overground', 'elizabeth-line', 'tram', 'river-bus'],
  modes: ['rail', 'bus', 'tram', 'ferry'],
}

const HELSINKI: CityConfig = {
  id: 'helsinki',
  label: 'Helsinki',
  center: [24.945, 60.192],
  defaultZoom: 11,
  // Helsinki Metropolitan Area bbox; documentation only.
  bbox: [24.5, 60.0, 25.3, 60.4],
  adapterId: 'hslGtfsRt',
  apiKeyEnvVar: undefined,
  feedEndpoints: ['hsl'],
  modes: ['rail', 'bus', 'tram', 'ferry'],
}

export const CITIES: ReadonlyArray<CityConfig> = [LONDON, HELSINKI]

export const CITY_BY_ID: Record<CityConfig['id'], CityConfig> = {
  london: LONDON,
  helsinki: HELSINKI,
}

export const DEFAULT_CITY_ID: CityConfig['id'] = 'london'

export function getCityById(id: CityConfig['id']): CityConfig {
  return CITY_BY_ID[id]
}

/**
 * Whether this city's API key (if any) is satisfied by the given env. London's
 * TfL key is optional, so London always returns true. Helsinki has no key,
 * also always true. Reserved as a future hook for cities with required keys.
 */
export function isCityKeyAvailable(city: CityConfig, _env: Record<string, string | undefined>): boolean {
  // No city in v1 has a hard-required key.
  return true
}

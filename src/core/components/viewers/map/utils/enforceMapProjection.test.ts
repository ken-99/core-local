import { enforceMercatorPastZoom, getProjectionType, MAX_GLOBE_ZOOM } from './enforceMapProjection'

function makeMap(zoom: number, projection: string | { type?: string } | null) {
  const setProjection = vi.fn()
  return {
    map: {
      getZoom: () => zoom,
      getProjection: () => projection,
      setProjection,
    },
    setProjection,
  }
}

describe('getProjectionType', () => {
  it('reads a string projection', () => {
    expect(getProjectionType('globe')).toBe('globe')
  })

  it('reads an object projection by type', () => {
    expect(getProjectionType({ type: 'mercator' })).toBe('mercator')
  })

  it('falls back to name when type is absent', () => {
    expect(getProjectionType({ name: 'globe' })).toBe('globe')
  })

  it('returns undefined for null/undefined', () => {
    expect(getProjectionType(null)).toBeUndefined()
    expect(getProjectionType(undefined)).toBeUndefined()
  })
})

describe('enforceMercatorPastZoom', () => {
  it('forces mercator when in globe past the threshold (the freeze case)', () => {
    const { map, setProjection } = makeMap(MAX_GLOBE_ZOOM + 1, 'globe')
    enforceMercatorPastZoom(map)
    expect(setProjection).toHaveBeenCalledWith({ type: 'mercator' })
  })

  it('handles the object-shaped projection return', () => {
    const { map, setProjection } = makeMap(MAX_GLOBE_ZOOM + 1, { type: 'globe' })
    enforceMercatorPastZoom(map)
    expect(setProjection).toHaveBeenCalledWith({ type: 'mercator' })
  })

  it('leaves the globe alone at or below the threshold', () => {
    const { map, setProjection } = makeMap(MAX_GLOBE_ZOOM, 'globe')
    enforceMercatorPastZoom(map)
    expect(setProjection).not.toHaveBeenCalled()
  })

  it('is idempotent — does nothing when already mercator', () => {
    const { map, setProjection } = makeMap(MAX_GLOBE_ZOOM + 3, 'mercator')
    enforceMercatorPastZoom(map)
    expect(setProjection).not.toHaveBeenCalled()
  })

  it('respects a custom threshold', () => {
    const { map, setProjection } = makeMap(8, 'globe')
    enforceMercatorPastZoom(map, 10)
    expect(setProjection).not.toHaveBeenCalled()
  })
})

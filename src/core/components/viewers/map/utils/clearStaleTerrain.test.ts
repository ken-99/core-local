import { clearStaleTerrain } from './clearStaleTerrain'

function makeMap(terrain: { source?: string } | null, existingSources: string[]) {
  const setTerrain = vi.fn()
  return {
    map: {
      getTerrain: () => terrain,
      getSource: (id: string) => (existingSources.includes(id) ? { id } : undefined),
      setTerrain,
    },
    setTerrain,
  }
}

describe('clearStaleTerrain', () => {
  it('clears terrain when its source is missing from the current style (the crash case)', () => {
    const { map, setTerrain } = makeMap({ source: 'terrain-source' }, ['cdt', 'terrain-dem'])
    expect(clearStaleTerrain(map)).toBe(true)
    expect(setTerrain).toHaveBeenCalledWith(null)
  })

  it('leaves terrain alone when its source still exists', () => {
    const { map, setTerrain } = makeMap({ source: 'terrain-source' }, ['cdt', 'terrain-source'])
    expect(clearStaleTerrain(map)).toBe(false)
    expect(setTerrain).not.toHaveBeenCalled()
  })

  it('is a no-op when terrain is off', () => {
    const { map, setTerrain } = makeMap(null, ['cdt'])
    expect(clearStaleTerrain(map)).toBe(false)
    expect(setTerrain).not.toHaveBeenCalled()
  })

  it('is a no-op when terrain has no source field', () => {
    const { map, setTerrain } = makeMap({}, ['cdt'])
    expect(clearStaleTerrain(map)).toBe(false)
    expect(setTerrain).not.toHaveBeenCalled()
  })
})

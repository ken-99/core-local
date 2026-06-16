import { setPoiIconsVisible, POI_LAYER_ID } from './poiIcons'

function makeFakeMap(hasLayer: boolean) {
  return {
    getLayer: vi.fn((id: string) => (hasLayer && id === POI_LAYER_ID ? {} : undefined)),
    setPaintProperty: vi.fn(),
  }
}

describe('setPoiIconsVisible', () => {
  it('does nothing when the poi layer is absent', () => {
    const map = makeFakeMap(false)
    setPoiIconsVisible(map as any, false)
    expect(map.setPaintProperty).not.toHaveBeenCalled()
  })

  it('sets icon-opacity to 0 to hide and 1 to show', () => {
    const map = makeFakeMap(true)
    setPoiIconsVisible(map as any, false)
    expect(map.setPaintProperty).toHaveBeenCalledWith(POI_LAYER_ID, 'icon-opacity', 0)
    setPoiIconsVisible(map as any, true)
    expect(map.setPaintProperty).toHaveBeenCalledWith(POI_LAYER_ID, 'icon-opacity', 1)
  })

  it('does not throw for a null map', () => {
    expect(() => setPoiIconsVisible(null, true)).not.toThrow()
  })
})

import { registerPmtilesProtocol } from './registerPmtilesProtocol'

describe('registerPmtilesProtocol', () => {
  it('registers the pmtiles protocol once, even when called repeatedly', () => {
    const addProtocol = vi.fn()
    const fakeMaplib = { addProtocol } as any

    registerPmtilesProtocol(fakeMaplib)
    registerPmtilesProtocol(fakeMaplib)

    expect(addProtocol).toHaveBeenCalledTimes(1)
    expect(addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function))
  })
})

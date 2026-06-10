import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadDemoBim } from './loadDemoBim'

const mockFetch = (files: unknown, ok = true) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ files }),
  }))
}

describe('loadDemoBim', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('returns null without fetching when buildingId is null', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await loadDemoBim(null)).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('prefers a .frag over a .ifc', async () => {
    mockFetch([
      { id: 1, name: 'model.ifc', url: 'u1' },
      { id: 2, name: 'model.frag', url: 'u2' },
    ])
    const f = await loadDemoBim(42)
    expect(f?.name).toBe('model.frag')
  })

  it('falls back to .ifc when no .frag is present', async () => {
    mockFetch([{ id: 1, name: 'model.ifc', url: 'u1' }])
    const f = await loadDemoBim(42)
    expect(f?.name).toBe('model.ifc')
  })

  it('ignores model files without a url', async () => {
    mockFetch([{ id: 1, name: 'model.frag', url: null }])
    expect(await loadDemoBim(42)).toBeNull()
  })

  it('returns null when no model files match', async () => {
    mockFetch([{ id: 1, name: 'notes.pdf', url: 'u1' }])
    expect(await loadDemoBim(42)).toBeNull()
  })

  it('returns null on a non-ok response', async () => {
    mockFetch([], false)
    expect(await loadDemoBim(42)).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await loadDemoBim(42)).toBeNull()
  })
})

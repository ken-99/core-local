import {
  buildOpenSkyUrl,
  parseStateTuple,
  OPENSKY_BASE_URL,
} from '../lib/opensky'
import type { OpenSkyStateTuple } from '../lib/types'
import type { Mock } from 'vitest'

const FULL_TUPLE: OpenSkyStateTuple = [
  'a4b1c5',           // 0: icao24
  'ACA123  ',         // 1: callsign (with trailing whitespace, real-world)
  'Canada',           // 2: origin_country
  1_700_000_000,      // 3: time_position (epoch s)
  1_700_000_000,      // 4: last_contact (epoch s)
  -123.1,             // 5: longitude
  49.2,               // 6: latitude
  10000,              // 7: baro_altitude (m)
  false,              // 8: on_ground
  250,                // 9: velocity (m/s)
  90,                 // 10: true_track
  0,                  // 11: vertical_rate
  null,               // 12: sensors
  10100,              // 13: geo_altitude
  '7020',             // 14: squawk
  false,              // 15: spi
  0,                  // 16: position_source
  6,                  // 17: category
]

describe('opensky URL', () => {
  it('uses the same-origin proxy with the regions query string', () => {
    const url = buildOpenSkyUrl()
    expect(url).toMatch(/^\/api\/openskyProxy\?/)
    expect(url).toContain('extended=1')
    expect(url).toContain('lamin=48.3')
  })

  it('OPENSKY_BASE_URL is the same-origin proxy path', () => {
    // Browser-direct calls to opensky-network.org are blocked by their CORS
    // policy (Access-Control-Allow-Origin restricted to their own origin),
    // so the client fetches via /api/openskyProxy instead. Auth (if any)
    // lives in OPENSKY_USERNAME / OPENSKY_PASSWORD on the server.
    expect(OPENSKY_BASE_URL).toBe('/api/openskyProxy')
  })
})

describe('parseStateTuple', () => {
  const NOW = 5_000_000_000
  it('returns position + static updates for a complete tuple', () => {
    const result = parseStateTuple(FULL_TUPLE, NOW)
    expect(result).not.toBeNull()
    expect(result?.position.icao24).toBe('a4b1c5')
    expect(result?.position.lat).toBe(49.2)
    expect(result?.position.lon).toBe(-123.1)
    // velocity m/s → knots: 250 * 1.94384 = 485.96
    expect(result?.position.velocity).toBeCloseTo(486.0, 0)
    // baro_altitude m → ft: 10000 * 3.28084 = 32808.4
    expect(result?.position.baroAltitudeFt).toBeCloseTo(32808, 0)
    // vertical_rate m/s → ft/min: 0 * 196.85 = 0
    expect(result?.position.verticalRateFpm).toBe(0)
    expect(result?.position.heading).toBe(90)
    expect(result?.position.onGround).toBe(false)
    expect(result?.position.lastContactMs).toBe(1_700_000_000_000) // s → ms
    expect(result?.position.receivedAt).toBe(NOW)
    expect(result?.static.callsign).toBe('ACA123') // trimmed
    expect(result?.static.originCountry).toBe('Canada')
    expect(result?.static.category).toBe(6)
  })

  it('returns null when latitude is null', () => {
    const t = [...FULL_TUPLE] as OpenSkyStateTuple
    t[6] = null
    expect(parseStateTuple(t, NOW)).toBeNull()
  })

  it('returns null when longitude is null', () => {
    const t = [...FULL_TUPLE] as OpenSkyStateTuple
    t[5] = null
    expect(parseStateTuple(t, NOW)).toBeNull()
  })

  it('returns null when last_contact is more than 60s before now', () => {
    const t = [...FULL_TUPLE] as OpenSkyStateTuple
    t[4] = 1_700_000_000 // 1.7B seconds = approx now in real time
    const tooStale = parseStateTuple(t, 1_700_000_000_000 + 61_000)
    expect(tooStale).toBeNull()
  })

  it('returns position with null fields when optional values are null', () => {
    const t = [...FULL_TUPLE] as OpenSkyStateTuple
    t[7] = null   // baro_altitude
    t[9] = null   // velocity
    t[10] = null  // true_track
    t[11] = null  // vertical_rate
    const result = parseStateTuple(t, NOW)
    expect(result?.position.baroAltitudeFt).toBeNull()
    expect(result?.position.velocity).toBeNull()
    expect(result?.position.heading).toBeNull()
    expect(result?.position.verticalRateFpm).toBeNull()
  })

  it('handles missing 18th category field (no extended=1 response)', () => {
    const t = FULL_TUPLE.slice(0, 17) as OpenSkyStateTuple
    const result = parseStateTuple(t, NOW)
    expect(result?.static.category).toBeNull()
  })

  it('handles null callsign', () => {
    const t = [...FULL_TUPLE] as OpenSkyStateTuple
    t[1] = null
    const result = parseStateTuple(t, NOW)
    expect(result?.static.callsign).toBe('')
  })
})

import { OpenSkyClient, computeBackoffMs, MAX_RETRY_ATTEMPTS } from '../lib/opensky'
import type { AircraftUpdate } from '../lib/types'

describe('computeBackoffMs', () => {
  it('returns 5000 / 10000 / 20000 / 40000 / 60000 / 60000', () => {
    expect(computeBackoffMs(0)).toBe(5_000)
    expect(computeBackoffMs(1)).toBe(10_000)
    expect(computeBackoffMs(2)).toBe(20_000)
    expect(computeBackoffMs(3)).toBe(40_000)
    expect(computeBackoffMs(4)).toBe(60_000)
    expect(computeBackoffMs(5)).toBe(60_000)
  })
})

describe('MAX_RETRY_ATTEMPTS', () => {
  it('is 5', () => {
    expect(MAX_RETRY_ATTEMPTS).toBe(5)
  })
})

describe('OpenSkyClient', () => {
  let updates: AircraftUpdate[]
  let statuses: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    updates = []
    statuses = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mockFetchOnce(response: { ok: boolean, status: number, json?: () => unknown }) {
    ;(global as unknown as { fetch: Mock }).fetch = vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      json: response.json ?? (async () => ({ time: 0, states: null })),
    })
  }

  function mockFetchSequence(responses: Array<{ ok: boolean, status: number, json?: () => unknown }>) {
    const fn = vi.fn()
    for (const r of responses) {
      fn.mockResolvedValueOnce({
        ok: r.ok,
        status: r.status,
        json: r.json ?? (async () => ({ time: 0, states: null })),
      })
    }
    ;(global as unknown as { fetch: Mock }).fetch = fn
    return fn
  }

  it('starts in idle state', () => {
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    expect(c.getStatus()).toBe('idle')
  })

  it('first poll fires immediately on start (not after the 10s wait)', async () => {
    mockFetchOnce({
      ok: true, status: 200,
      json: async () => ({ time: 0, states: [['a4b1c5', 'ACA1', 'Canada', 0, Date.now()/1000, -123, 49, 10000, false, 100, 90, 0, null, 10000, null, false, 0, 6]] }),
    })
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    // Allow the in-flight fetch promise to resolve (first poll fires immediately, no timer needed)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(1)
    c.stop()
  })

  it('schedules next poll 10s after success', async () => {
    mockFetchSequence([
      { ok: true, status: 200 },
      { ok: true, status: 200 },
    ])
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    await Promise.resolve(); await Promise.resolve()
    vi.advanceTimersByTime(10_000)
    await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(2)
    c.stop()
  })

  it('backs off on 429: 5s, 10s, 20s, 40s, 60s', async () => {
    mockFetchSequence([
      { ok: false, status: 429 },
      { ok: false, status: 429 },
      { ok: false, status: 429 },
      { ok: false, status: 429 },
      { ok: false, status: 429 },
    ])
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_000); await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(20_000); await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(40_000); await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(5)
    c.stop()
  })

  it('after 5 consecutive errors, transitions to giving-up and stops polling', async () => {
    mockFetchSequence(Array(5).fill({ ok: false, status: 503 }))
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    await Promise.resolve(); await Promise.resolve()
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve(); await Promise.resolve()
    }
    expect(c.getStatus()).toBe('gaveup')
    expect(statuses).toContain('gaveup')
    // Further timer advances should NOT cause more fetches.
    const callsBefore = (global as unknown as { fetch: Mock }).fetch.mock.calls.length
    vi.advanceTimersByTime(120_000)
    await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch.mock.calls.length).toBe(callsBefore)
    c.stop()
  })

  it('401 transitions to giving-up immediately (no retry)', async () => {
    mockFetchOnce({ ok: false, status: 401 })
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    await Promise.resolve(); await Promise.resolve()
    expect(c.getStatus()).toBe('gaveup')
  })

  it('stop() cancels the next scheduled poll', async () => {
    mockFetchOnce({ ok: true, status: 200 })
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    await Promise.resolve(); await Promise.resolve()
    c.stop()
    vi.advanceTimersByTime(60_000)
    await Promise.resolve(); await Promise.resolve()
    expect((global as unknown as { fetch: Mock }).fetch).toHaveBeenCalledTimes(1)
    expect(c.getStatus()).toBe('idle')
  })

  it('emits both position and static updates per aircraft per poll', async () => {
    mockFetchOnce({
      ok: true, status: 200,
      json: async () => ({ time: 0, states: [['a4b1c5', 'ACA1', 'Canada', 0, Date.now()/1000, -123, 49, 10000, false, 100, 90, 0, null, 10000, null, false, 0, 6]] }),
    })
    const c = new OpenSkyClient(u => updates.push(u), s => statuses.push(s))
    c.start()
    await Promise.resolve(); await Promise.resolve()
    await Promise.resolve()
    expect(updates).toHaveLength(2)
    expect(updates[0].kind).toBe('position')
    expect(updates[1].kind).toBe('static')
    c.stop()
  })

  it('does NOT attach an Authorization header (auth lives server-side in the proxy)', async () => {
    mockFetchOnce({ ok: true, status: 200 })
    // 3rd arg is accepted for API compatibility but ignored — auth is applied
    // by /api/openskyProxy from server-side env vars, never client-side.
    const c = new OpenSkyClient(
      u => updates.push(u),
      s => statuses.push(s),
      { username: 'me', password: 'pw' },
    )
    c.start()
    await Promise.resolve(); await Promise.resolve()
    const fetchMock = (global as unknown as { fetch: Mock }).fetch
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBeUndefined()
    c.stop()
  })
})

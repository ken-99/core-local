import { tflAdapter, buildTflProxyUrl, mapTflModeToVisualMode, parseBusArrival } from '../../lib/adapters/tfl'
import { CITY_BY_ID } from '../../lib/cities'
import type { TflArrivalPrediction } from '../../lib/types'

const realFetch = global.fetch

function mockFetch(handler: (url: string) => Promise<Response> | Response) {
  global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    return Promise.resolve(handler(url))
  }) as unknown as typeof fetch
}

afterEach(() => {
  global.fetch = realFetch
  vi.clearAllMocks()
})

describe('tflAdapter — utilities', () => {
  it('buildTflProxyUrl prepends /api/tflProxy and forwards path', () => {
    expect(buildTflProxyUrl('/Mode/bus/Arrivals')).toBe('/api/tflProxy?path=%2FMode%2Fbus%2FArrivals')
    expect(buildTflProxyUrl('/Line/bakerloo/Route/Sequence/inbound')).toContain('/api/tflProxy?')
  })

  it('mapTflModeToVisualMode collapses TfL modes into 4 buckets', () => {
    expect(mapTflModeToVisualMode('tube')).toBe('rail')
    expect(mapTflModeToVisualMode('dlr')).toBe('rail')
    expect(mapTflModeToVisualMode('overground')).toBe('rail')
    expect(mapTflModeToVisualMode('elizabeth-line')).toBe('rail')
    expect(mapTflModeToVisualMode('bus')).toBe('bus')
    expect(mapTflModeToVisualMode('tram')).toBe('tram')
    expect(mapTflModeToVisualMode('river-bus')).toBe('ferry')
    expect(mapTflModeToVisualMode('unknown-mode-xyz')).toBeNull()
  })

  it('parseBusArrival yields a Vehicle with stop coords', () => {
    const pred: TflArrivalPrediction = {
      id: 'p1',
      vehicleId: 'LX12ABC',
      lineId: '8',
      modeName: 'bus',
      towards: 'Bow Church',
      destinationName: 'Bow Church',
      stationName: 'Tottenham Court Road',
      stationCoordinates: { lat: 51.5165, lon: -0.1308 },
      timeToStation: 30,
    }
    const v = parseBusArrival(pred, 5000)!
    expect(v.id).toBe('tfl:bus:LX12ABC')
    expect(v.position).toEqual([-0.1308, 51.5165])
    expect(v.mode).toBe('bus')
    expect(v.routeId).toBe('8')
    expect(v.destination).toBe('Bow Church')
    expect(v.timestamp).toBe(5000)
  })

  it('parseBusArrival returns null when stationCoordinates missing', () => {
    const pred: TflArrivalPrediction = {
      id: 'p1', vehicleId: 'LX12ABC', lineId: '8', modeName: 'bus', timeToStation: 30,
    }
    expect(parseBusArrival(pred, 5000)).toBeNull()
  })
})

describe('tflAdapter — poll()', () => {
  it('calls /api/tflProxy with one URL per feedEndpoint', async () => {
    const seenPaths: string[] = []
    mockFetch(async (url) => {
      const u = new URL(url, 'http://localhost')
      seenPaths.push(u.searchParams.get('path') || '')
      return new Response(JSON.stringify([]), { status: 200 })
    })
    await tflAdapter.poll(CITY_BY_ID.london)
    expect(seenPaths.length).toBeGreaterThanOrEqual(7)
    expect(seenPaths.some(p => p.includes('/Mode/bus/Arrivals'))).toBe(true)
    expect(seenPaths.some(p => p.includes('/Mode/tube/Arrivals'))).toBe(true)
  })

  it('returns vehicles parsed from bus mode', async () => {
    mockFetch(async (url) => {
      const u = new URL(url, 'http://localhost')
      const path = u.searchParams.get('path') || ''
      if (path.includes('/Mode/bus/')) {
        const body: TflArrivalPrediction[] = [
          {
            id: 'p1', vehicleId: 'LX12ABC', lineId: '8', modeName: 'bus',
            stationCoordinates: { lat: 51.5, lon: -0.13 }, timeToStation: 30,
            destinationName: 'Bow',
          },
        ]
        return new Response(JSON.stringify(body), { status: 200 })
      }
      return new Response('[]', { status: 200 })
    })
    const vs = await tflAdapter.poll(CITY_BY_ID.london)
    expect(vs.length).toBeGreaterThanOrEqual(1)
    const bus = vs.find(v => v.id === 'tfl:bus:LX12ABC')
    expect(bus).toBeDefined()
    expect(bus!.mode).toBe('bus')
  })

  it('partial failure: one mode 5xx, others succeed → returns the successes', async () => {
    mockFetch(async (url) => {
      const u = new URL(url, 'http://localhost')
      const path = u.searchParams.get('path') || ''
      if (path.includes('/Mode/tube/')) {
        return new Response('upstream error', { status: 500 })
      }
      if (path.includes('/Mode/bus/')) {
        const body: TflArrivalPrediction[] = [
          { id: 'p1', vehicleId: 'BUS1', lineId: '8', modeName: 'bus',
            stationCoordinates: { lat: 51.5, lon: -0.13 }, timeToStation: 10 },
        ]
        return new Response(JSON.stringify(body), { status: 200 })
      }
      return new Response('[]', { status: 200 })
    })
    const vs = await tflAdapter.poll(CITY_BY_ID.london)
    expect(vs.find(v => v.id === 'tfl:bus:BUS1')).toBeDefined()
  })

  it('total failure (all endpoints 5xx) rejects', async () => {
    mockFetch(async () => new Response('upstream error', { status: 500 }))
    await expect(tflAdapter.poll(CITY_BY_ID.london)).rejects.toThrow()
  })

  it('defaultIntervalMs is 30s', () => {
    expect(tflAdapter.defaultIntervalMs).toBe(30_000)
  })

  it('id is "tfl"', () => {
    expect(tflAdapter.id).toBe('tfl')
  })

  it('deduplicates the same vehicle reported on multiple stop predictions in one tick', async () => {
    mockFetch(async (url) => {
      const u = new URL(url, 'http://localhost')
      const path = u.searchParams.get('path') || ''
      if (path.includes('/Mode/bus/')) {
        const body: TflArrivalPrediction[] = [
          { id: 'p1', vehicleId: 'BUS1', lineId: '8', modeName: 'bus',
            stationCoordinates: { lat: 51.5, lon: -0.13 }, timeToStation: 30 },
          { id: 'p2', vehicleId: 'BUS1', lineId: '8', modeName: 'bus',
            stationCoordinates: { lat: 51.6, lon: -0.20 }, timeToStation: 90 },
        ]
        return new Response(JSON.stringify(body), { status: 200 })
      }
      return new Response('[]', { status: 200 })
    })
    const vs = await tflAdapter.poll(CITY_BY_ID.london)
    const matching = vs.filter(v => v.id === 'tfl:bus:BUS1')
    expect(matching).toHaveLength(1)
    expect(matching[0].position).toEqual([-0.13, 51.5])
  })
})

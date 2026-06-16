import { buildSubscribeMessage } from '../lib/aisstream'
import { REGIONS } from '../lib/regions'

describe('buildSubscribeMessage', () => {
  test('shape matches AISStream v0 protocol', () => {
    const msg = buildSubscribeMessage('test-key')
    expect(msg.APIKey).toBe('test-key')
    expect(Array.isArray(msg.BoundingBoxes)).toBe(true)
    expect(msg.BoundingBoxes).toHaveLength(REGIONS.length)
    // Each bbox is [[lat1, lon1], [lat2, lon2]]
    expect(msg.BoundingBoxes[0]).toHaveLength(2)
    expect(msg.BoundingBoxes[0][0]).toHaveLength(2)
  })

  test('FilterMessageTypes restricts to position + static report types', () => {
    const msg = buildSubscribeMessage('test-key')
    expect(msg.FilterMessageTypes).toEqual([
      'PositionReport',
      'StandardClassBPositionReport',
      'ShipStaticData',
    ])
  })
})

import { parseAISMessage } from '../lib/aisstream'

describe('parseAISMessage', () => {
  test('parses a PositionReport into a position update', () => {
    const raw = JSON.stringify({
      MessageType: 'PositionReport',
      MetaData: { MMSI: 123, time_utc: '2024-01-01T00:00:00Z' },
      Message: {
        PositionReport: {
          Latitude: 45.1, Longitude: -75.2,
          Cog: 90.3, Sog: 12.5, TrueHeading: 90,
        },
      },
    })
    const update = parseAISMessage(raw, 5000)
    expect(update?.kind).toBe('position')
    if (update?.kind !== 'position') throw new Error('wrong kind')
    expect(update.data.mmsi).toBe(123)
    expect(update.data.lat).toBe(45.1)
    expect(update.data.lon).toBe(-75.2)
    expect(update.data.cog).toBe(90.3)
    expect(update.data.sog).toBe(12.5)
    expect(update.data.heading).toBe(90)
    expect(update.data.receivedAt).toBe(5000)
  })

  test('parses a StandardClassBPositionReport into a position update', () => {
    const raw = JSON.stringify({
      MessageType: 'StandardClassBPositionReport',
      MetaData: { MMSI: 456 },
      Message: {
        StandardClassBPositionReport: {
          Latitude: 1, Longitude: 2, Cog: 0, Sog: 0, TrueHeading: 511,
        },
      },
    })
    const update = parseAISMessage(raw, 1000)
    expect(update?.kind).toBe('position')
    if (update?.kind === 'position') expect(update.data.mmsi).toBe(456)
  })

  test('parses a ShipStaticData into a static update with name and destination', () => {
    const raw = JSON.stringify({
      MessageType: 'ShipStaticData',
      MetaData: { MMSI: 789 },
      Message: {
        ShipStaticData: {
          Name: 'EVER GIVEN',
          ShipType: 70,
          Destination: 'MTRL',
          Eta: { Month: 6, Day: 15, Hour: 12, Minute: 0 },
          ImoNumber: 9811000,
          CallSign: 'H3RC',
          Dimension: { A: 200, B: 200, C: 25, D: 25 },
          MaximumStaticDraught: 14.5,
        },
      },
    })
    const update = parseAISMessage(raw, 7000)
    expect(update?.kind).toBe('static')
    if (update?.kind !== 'static') throw new Error('wrong kind')
    expect(update.data.mmsi).toBe(789)
    expect(update.data.name).toBe('EVER GIVEN')
    expect(update.data.shipType).toBe(70)
    expect(update.data.destination).toBe('MTRL')
    expect(update.data.length).toBe(400) // A+B
    expect(update.data.beam).toBe(50)    // C+D
    expect(update.data.draft).toBe(14.5)
    expect(update.data.imo).toBe(9811000)
    expect(update.data.callSign).toBe('H3RC')
    expect(update.data.receivedAt).toBe(7000)
  })

  test('reads shipType from AISStream-v0 "Type" field (the actual wire shape)', () => {
    // AISStream's live v0 ShipStaticData payload uses `Type`, not `ShipType`.
    // Verified against a real captured message during smoke test.
    const raw = JSON.stringify({
      MessageType: 'ShipStaticData',
      MetaData: { MMSI: 366648910 },
      Message: {
        ShipStaticData: {
          Name: 'STRAIT ARROW',
          Type: 79,
          Destination: 'PORT TENDER',
        },
      },
    })
    const update = parseAISMessage(raw, 0)
    expect(update?.kind).toBe('static')
    if (update?.kind === 'static') expect(update.data.shipType).toBe(79)
  })

  test('prefers Type over ShipType when both are present', () => {
    const raw = JSON.stringify({
      MessageType: 'ShipStaticData',
      MetaData: { MMSI: 1 },
      Message: { ShipStaticData: { Name: 'X', Type: 70, ShipType: 80, Destination: '' } },
    })
    const update = parseAISMessage(raw, 0)
    expect(update?.kind).toBe('static')
    if (update?.kind === 'static') expect(update.data.shipType).toBe(70)
  })

  test('returns null on malformed JSON', () => {
    expect(parseAISMessage('{not-json', 0)).toBeNull()
  })

  test('returns null on unknown MessageType', () => {
    const raw = JSON.stringify({ MessageType: 'Whatever', MetaData: {}, Message: {} })
    expect(parseAISMessage(raw, 0)).toBeNull()
  })

  test('returns null when MMSI is missing', () => {
    const raw = JSON.stringify({
      MessageType: 'PositionReport',
      MetaData: {},
      Message: { PositionReport: { Latitude: 1, Longitude: 2 } },
    })
    expect(parseAISMessage(raw, 0)).toBeNull()
  })

  test('flag is derived from MMSI MID prefix when valid', () => {
    // MMSI starting with 366 = USA
    const raw = JSON.stringify({
      MessageType: 'ShipStaticData',
      MetaData: { MMSI: 366000001 },
      Message: { ShipStaticData: { Name: 'X', ShipType: 0, Destination: '' } },
    })
    const update = parseAISMessage(raw, 0)
    expect(update?.kind).toBe('static')
    if (update?.kind === 'static') expect(update.data.flag).toBe('US')
  })
})

import { AISStreamClient, computeBackoffMs, MAX_RECONNECT_ATTEMPTS } from '../lib/aisstream'

describe('computeBackoffMs', () => {
  test('attempt 0 → 1s, 1 → 2s, 2 → 4s, 3 → 8s, 4 → 16s, 5 → 30s capped', () => {
    expect(computeBackoffMs(0)).toBe(1000)
    expect(computeBackoffMs(1)).toBe(2000)
    expect(computeBackoffMs(2)).toBe(4000)
    expect(computeBackoffMs(3)).toBe(8000)
    expect(computeBackoffMs(4)).toBe(16000)
    expect(computeBackoffMs(5)).toBe(30000)
    expect(computeBackoffMs(99)).toBe(30000)
  })
})

class FakeWebSocket {
  static OPEN = 1
  readyState = 0
  sent: string[] = []
  onopen?: () => void
  onmessage?: (e: { data: string }) => void
  onerror?: (e: unknown) => void
  onclose?: () => void
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.lastInstance = this
  }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3; this.onclose?.() }
  static lastInstance: FakeWebSocket | null = null
}

describe('AISStreamClient', () => {
  beforeEach(() => {
    ;(globalThis as any).WebSocket = FakeWebSocket as any
    FakeWebSocket.lastInstance = null
  })

  test('connect throws when API key is missing', () => {
    const client = new AISStreamClient('', () => {})
    expect(() => client.connect()).toThrow(/api key/i)
  })

  test('connect opens WS and sends Subscribe message on open', () => {
    const updates: unknown[] = []
    const client = new AISStreamClient('test-key', u => updates.push(u))
    client.connect()
    const ws = FakeWebSocket.lastInstance!
    expect(ws.url).toBe('wss://stream.aisstream.io/v0/stream')
    ws.readyState = FakeWebSocket.OPEN
    ws.onopen?.()
    expect(ws.sent).toHaveLength(1)
    const sent = JSON.parse(ws.sent[0])
    expect(sent.APIKey).toBe('test-key')
    client.disconnect()
  })

  test('incoming PositionReport message dispatches to callback', () => {
    const updates: any[] = []
    const client = new AISStreamClient('k', u => updates.push(u))
    client.connect()
    const ws = FakeWebSocket.lastInstance!
    ws.readyState = FakeWebSocket.OPEN
    ws.onopen?.()
    ws.onmessage?.({
      data: JSON.stringify({
        MessageType: 'PositionReport',
        MetaData: { MMSI: 1 },
        Message: { PositionReport: { Latitude: 1, Longitude: 2, Cog: 0, Sog: 0, TrueHeading: 0 } },
      }),
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].kind).toBe('position')
    client.disconnect()
  })

  test('disconnect closes the socket and prevents reconnect', () => {
    vi.useFakeTimers()
    const client = new AISStreamClient('k', () => {})
    client.connect()
    const ws = FakeWebSocket.lastInstance!
    client.disconnect()
    ws.onclose?.()
    vi.advanceTimersByTime(60_000)
    // No new socket should have been created
    expect(FakeWebSocket.lastInstance).toBe(ws)
    vi.useRealTimers()
  })

  test('exposes MAX_RECONNECT_ATTEMPTS = 5', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(5)
  })

  test('unexpected onclose schedules a reconnect at the first backoff delay', () => {
    vi.useFakeTimers()
    const client = new AISStreamClient('k', () => {})
    client.connect()
    const ws1 = FakeWebSocket.lastInstance!
    // Simulate unexpected close (no disconnect call) — should schedule a reconnect
    ws1.onclose?.()
    expect(FakeWebSocket.lastInstance).toBe(ws1) // not yet
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.lastInstance).toBe(ws1) // still not — 1000ms is the first backoff
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.lastInstance).not.toBe(ws1)
    expect(FakeWebSocket.lastInstance!.url).toBe('wss://stream.aisstream.io/v0/stream')
    client.disconnect()
    vi.useRealTimers()
  })

  test('successive onclose events double the backoff delay', () => {
    vi.useFakeTimers()
    const client = new AISStreamClient('k', () => {})
    client.connect()
    const ws1 = FakeWebSocket.lastInstance!
    ws1.onclose?.() // attempt 0 → 1000ms
    vi.advanceTimersByTime(1000)
    const ws2 = FakeWebSocket.lastInstance!
    expect(ws2).not.toBe(ws1)
    ws2.onclose?.() // attempt 1 → 2000ms
    vi.advanceTimersByTime(1999)
    expect(FakeWebSocket.lastInstance).toBe(ws2) // not yet
    vi.advanceTimersByTime(1)
    const ws3 = FakeWebSocket.lastInstance!
    expect(ws3).not.toBe(ws2)
    client.disconnect()
    vi.useRealTimers()
  })

  test('after MAX_RECONNECT_ATTEMPTS consecutive failures, status flips to gaveup and no further sockets are created', () => {
    vi.useFakeTimers()
    const statuses: string[] = []
    const client = new AISStreamClient('k', () => {}, s => statuses.push(s))
    client.connect()

    // Fail MAX_RECONNECT_ATTEMPTS times in a row, advancing past each backoff
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      const ws = FakeWebSocket.lastInstance!
      ws.onclose?.() // schedule reconnect
      vi.advanceTimersByTime(30_000) // any value past the cap fires the timer
    }

    // The next ws (the MAX_RECONNECT_ATTEMPTS+1th attempt) is the one that should give up
    const finalWs = FakeWebSocket.lastInstance!
    finalWs.onclose?.() // this close is the (MAX+1)th — gaveup branch
    expect(statuses).toContain('gaveup')

    // Advance time and confirm no further connects happen
    const beforeAdvance = FakeWebSocket.lastInstance
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.lastInstance).toBe(beforeAdvance)

    client.disconnect()
    vi.useRealTimers()
  })

  test('successful onopen resets reconnectAttempts so a later close starts at the first backoff', () => {
    vi.useFakeTimers()
    const client = new AISStreamClient('k', () => {})
    client.connect()
    const ws1 = FakeWebSocket.lastInstance!
    ws1.onclose?.() // attempt 0 → 1s
    vi.advanceTimersByTime(1000)
    const ws2 = FakeWebSocket.lastInstance!
    ws2.onclose?.() // attempt 1 → 2s
    vi.advanceTimersByTime(2000)
    const ws3 = FakeWebSocket.lastInstance!
    // Now ws3 connects successfully — should reset attempts to 0
    ws3.readyState = FakeWebSocket.OPEN
    ws3.onopen?.()
    // Subsequent close should backoff from attempt=0 again, i.e. 1s, not 4s
    ws3.onclose?.()
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.lastInstance).toBe(ws3)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.lastInstance).not.toBe(ws3)
    client.disconnect()
    vi.useRealTimers()
  })
})

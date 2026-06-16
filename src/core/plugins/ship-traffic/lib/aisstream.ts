import { regionsAsBoundingBoxes } from './regions'
import type { SubscribeMessage } from './types'

export const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream'

export function buildSubscribeMessage(apiKey: string): SubscribeMessage {
  return {
    APIKey: apiKey,
    BoundingBoxes: regionsAsBoundingBoxes(),
    FilterMessageTypes: [
      'PositionReport',
      'StandardClassBPositionReport',
      'ShipStaticData',
    ],
  }
}

import type { VesselPosition, VesselStatic, VesselUpdate } from './types'

/**
 * Minimal MID-to-ISO2 lookup. Only common-enough prefixes for the demo;
 * unknown MIDs return undefined (UI shows "—" for flag).
 */
const MID_TO_ISO2: Record<number, string> = {
  // North America
  366: 'US', 367: 'US', 368: 'US', 369: 'US',
  338: 'US', 379: 'US',
  316: 'CA',
  345: 'MX',
  // South America (incl. Chile for Valparaiso)
  725: 'CL',
  710: 'BR',
  701: 'AR',
  // Common large flag states
  235: 'GB', 232: 'GB', 233: 'GB', 234: 'GB',
  311: 'BS', 352: 'PA', 354: 'PA', 357: 'PA',
  636: 'LR', 538: 'MH',
  431: 'JP', 432: 'JP',
  413: 'CN', 412: 'CN',
  477: 'HK', 525: 'ID', 563: 'SG', 564: 'SG',
  248: 'MT', 256: 'MT',
  219: 'DK', 220: 'DK',
  211: 'DE', 218: 'DE',
  227: 'FR', 228: 'FR',
  244: 'NL', 245: 'NL',
  205: 'BE',
}

function flagFromMMSI(mmsi: number): string | undefined {
  if (!Number.isFinite(mmsi) || mmsi <= 0) return undefined
  const mid = Math.floor(mmsi / 1_000_000)
  return MID_TO_ISO2[mid]
}

interface RawEnvelope {
  MessageType?: string
  MetaData?: { MMSI?: number, ShipName?: string }
  Message?: Record<string, unknown>
}

function readPositionReport(payload: any, mmsi: number, receivedAt: number): VesselPosition | null {
  const lat = payload?.Latitude
  const lon = payload?.Longitude
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return {
    mmsi,
    lat, lon,
    cog: typeof payload.Cog === 'number' ? payload.Cog : -1,
    sog: typeof payload.Sog === 'number' ? payload.Sog : -1,
    heading: typeof payload.TrueHeading === 'number' ? payload.TrueHeading : 511,
    receivedAt,
  }
}

function etaToIso(eta: any): string | undefined {
  if (!eta || typeof eta !== 'object') return undefined
  const { Month, Day, Hour, Minute } = eta
  if (typeof Month !== 'number' || typeof Day !== 'number') return undefined
  // AIS ETA omits year — assume current UTC year
  const year = new Date().getUTCFullYear()
  const m = String(Month).padStart(2, '0')
  const d = String(Day).padStart(2, '0')
  const h = String(Hour ?? 0).padStart(2, '0')
  const mi = String(Minute ?? 0).padStart(2, '0')
  return `${year}-${m}-${d}T${h}:${mi}:00Z`
}

function readShipStaticData(payload: any, mmsi: number, receivedAt: number): VesselStatic | null {
  if (!payload) return null
  const dim = payload.Dimension ?? {}
  const length = (typeof dim.A === 'number' && typeof dim.B === 'number')
    ? dim.A + dim.B
    : undefined
  const beam = (typeof dim.C === 'number' && typeof dim.D === 'number')
    ? dim.C + dim.D
    : undefined
  return {
    mmsi,
    name: typeof payload.Name === 'string' ? payload.Name.trim() : undefined,
    // AISStream's v0 ShipStaticData uses `Type`; some clients/docs say `ShipType`.
    // Read Type first, fall back to ShipType for forward-compat.
    shipType: typeof payload.Type === 'number'
      ? payload.Type
      : typeof payload.ShipType === 'number'
        ? payload.ShipType
        : undefined,
    flag: flagFromMMSI(mmsi),
    destination: typeof payload.Destination === 'string' ? payload.Destination.trim() : undefined,
    eta: etaToIso(payload.Eta),
    callSign: typeof payload.CallSign === 'string' ? payload.CallSign.trim() : undefined,
    imo: typeof payload.ImoNumber === 'number' ? payload.ImoNumber : undefined,
    length,
    beam,
    draft: typeof payload.MaximumStaticDraught === 'number' ? payload.MaximumStaticDraught : undefined,
    receivedAt,
  }
}

export function parseAISMessage(raw: string, receivedAt: number): VesselUpdate | null {
  let env: RawEnvelope
  try {
    env = JSON.parse(raw)
  } catch {
    return null
  }
  const mmsi = env.MetaData?.MMSI
  if (typeof mmsi !== 'number' || mmsi <= 0) return null

  switch (env.MessageType) {
    case 'PositionReport': {
      const data = readPositionReport(env.Message?.PositionReport, mmsi, receivedAt)
      return data ? { kind: 'position', data } : null
    }
    case 'StandardClassBPositionReport': {
      const data = readPositionReport(env.Message?.StandardClassBPositionReport, mmsi, receivedAt)
      return data ? { kind: 'position', data } : null
    }
    case 'ShipStaticData': {
      const data = readShipStaticData(env.Message?.ShipStaticData, mmsi, receivedAt)
      return data ? { kind: 'static', data } : null
    }
    default:
      return null
  }
}

export const MAX_RECONNECT_ATTEMPTS = 5

export function computeBackoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000)
}

export type AISStreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'gaveup'

export class AISStreamClient {
  private ws: WebSocket | null = null
  private apiKey: string
  private onUpdate: (u: VesselUpdate) => void
  private onStatusChange?: (s: AISStreamStatus) => void
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private parseErrorTimer = 0
  private intentionallyClosed = false
  private status: AISStreamStatus = 'idle'

  constructor(
    apiKey: string,
    onUpdate: (u: VesselUpdate) => void,
    onStatusChange?: (s: AISStreamStatus) => void,
  ) {
    this.apiKey = apiKey
    this.onUpdate = onUpdate
    this.onStatusChange = onStatusChange
  }

  private setStatus(s: AISStreamStatus) {
    this.status = s
    this.onStatusChange?.(s)
  }

  getStatus(): AISStreamStatus {
    return this.status
  }

  connect(): void {
    if (!this.apiKey) {
      throw new Error('AISStream: API key missing (set NEXT_PUBLIC_AISSTREAM_API_KEY)')
    }
    this.intentionallyClosed = false
    this.setStatus('connecting')
    const ws = new WebSocket(AISSTREAM_URL)
    this.ws = ws
    ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setStatus('open')
      ws.send(JSON.stringify(buildSubscribeMessage(this.apiKey)))
    }
    const handleText = (text: string) => {
      const update = parseAISMessage(text, Date.now())
      if (update) {
        this.onUpdate(update)
      } else {
        const now = Date.now()
        if (now - this.parseErrorTimer > 30_000) {
          this.parseErrorTimer = now
          console.warn('[ship-traffic] dropped malformed AIS message')
        }
      }
    }
    ws.onmessage = (e: MessageEvent) => {
      // AISStream may deliver text frames as Blob (default browser binaryType).
      // Decode to string before parsing.
      if (typeof e.data === 'string') {
        handleText(e.data)
      } else if (e.data instanceof Blob) {
        e.data.text().then(handleText).catch(() => {/* drop */})
      } else if (e.data instanceof ArrayBuffer) {
        handleText(new TextDecoder().decode(e.data))
      }
    }
    ws.onerror = (err) => {
      console.warn('[ship-traffic] WebSocket error', err)
    }
    ws.onclose = () => {
      this.ws = null
      if (this.intentionallyClosed) return
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.setStatus('gaveup')
        return
      }
      const delay = computeBackoffMs(this.reconnectAttempts)
      this.reconnectAttempts += 1
      this.setStatus('reconnecting')
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    }
  }

  disconnect(): void {
    this.intentionallyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
    this.setStatus('idle')
  }
}

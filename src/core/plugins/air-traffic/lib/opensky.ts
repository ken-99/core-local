import { openSkyQueryString } from './regions'
import type {
  AircraftPosition,
  AircraftStatic,
  AircraftUpdate,
  OpenSkyStateTuple,
  OpenSkyResponse,
} from './types'

/**
 * Same-origin proxy URL. Browsers can't fetch opensky-network.org directly
 * (CORS: their Access-Control-Allow-Origin is set to their own origin only),
 * so we route through a Next.js API route at /api/openskyProxy that
 * server-side-fetches and returns the JSON. Auth credentials, if configured,
 * live in OPENSKY_USERNAME / OPENSKY_PASSWORD env vars on the server side.
 */
export const OPENSKY_BASE_URL = '/api/openskyProxy'

const M_PER_S_TO_KNOTS = 1.94384
const M_TO_FT = 3.28084
const M_PER_S_TO_FT_PER_MIN = 196.850394
/** Drop entries whose last_contact is older than this when polled. */
const STALE_TUPLE_MS = 60_000

export function buildOpenSkyUrl(): string {
  return `${OPENSKY_BASE_URL}?${openSkyQueryString()}`
}

/**
 * Parse a single OpenSky state tuple into position + static updates.
 * Returns null when lat/lon are missing or the entry is stale (>60s old).
 */
export function parseStateTuple(
  t: OpenSkyStateTuple,
  receivedAt: number,
): { position: AircraftPosition, static: AircraftStatic } | null {
  const icao24 = t[0]
  const lon = t[5]
  const lat = t[6]
  if (typeof lat !== 'number' || typeof lon !== 'number') return null

  const lastContactSec = t[4]
  const lastContactMs = lastContactSec * 1000
  if (receivedAt - lastContactMs > STALE_TUPLE_MS) return null

  const baroM = t[7]
  const velMps = t[9]
  const heading = t[10]
  const vRateMps = t[11]
  const callsignRaw = t[1]
  const category = (t.length >= 18 && typeof t[17] === 'number') ? t[17] as number : null

  const position: AircraftPosition = {
    icao24,
    lat,
    lon,
    heading: typeof heading === 'number' ? heading : null,
    velocity: typeof velMps === 'number' ? velMps * M_PER_S_TO_KNOTS : null,
    baroAltitudeFt: typeof baroM === 'number' ? baroM * M_TO_FT : null,
    verticalRateFpm: typeof vRateMps === 'number' ? vRateMps * M_PER_S_TO_FT_PER_MIN : null,
    onGround: t[8],
    lastContactMs,
    receivedAt,
  }

  const staticData: AircraftStatic = {
    icao24,
    callsign: typeof callsignRaw === 'string' ? callsignRaw.trim() : '',
    originCountry: t[2],
    category,
    receivedAt,
  }

  return { position, static: staticData }
}

/**
 * Convert OpenSky's response into the per-aircraft updates the store expects.
 * Skips entries with null lat/lon or stale (>60s) last_contact.
 */
export function statesToUpdates(
  response: OpenSkyResponse,
  receivedAt: number,
): AircraftUpdate[] {
  const out: AircraftUpdate[] = []
  if (!response.states) return out
  for (const tuple of response.states) {
    const parsed = parseStateTuple(tuple, receivedAt)
    if (!parsed) continue
    out.push({ kind: 'position', data: parsed.position })
    out.push({ kind: 'static', data: parsed.static })
  }
  return out
}

export const POLL_INTERVAL_MS = 10_000
export const MAX_RETRY_ATTEMPTS = 5

const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 20_000, 40_000, 60_000]

export function computeBackoffMs(attempt: number): number {
  const idx = Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)
  return BACKOFF_SCHEDULE_MS[idx]
}

export type OpenSkyStatus = 'idle' | 'polling' | 'waiting' | 'backoff' | 'gaveup'

export interface OpenSkyAuth {
  username: string
  password: string
}

export class OpenSkyClient {
  private onUpdate: (u: AircraftUpdate) => void
  private onStatus?: (s: OpenSkyStatus) => void
  private status: OpenSkyStatus = 'idle'
  private timer: ReturnType<typeof setTimeout> | null = null
  private abortCtrl: AbortController | null = null
  private consecutiveErrors = 0
  private parseErrorTimer = 0

  constructor(
    onUpdate: (u: AircraftUpdate) => void,
    onStatus?: (s: OpenSkyStatus) => void,
    // 3rd arg kept for API compatibility with the pre-proxy version. Auth
    // credentials are applied server-side by the openskyProxy route.
    _auth?: OpenSkyAuth,
  ) {
    this.onUpdate = onUpdate
    this.onStatus = onStatus
  }

  getStatus(): OpenSkyStatus {
    return this.status
  }

  private setStatus(s: OpenSkyStatus): void {
    this.status = s
    this.onStatus?.(s)
  }

  start(): void {
    if (this.status !== 'idle') return
    void this.poll()
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.abortCtrl) {
      this.abortCtrl.abort()
      this.abortCtrl = null
    }
    this.consecutiveErrors = 0
    this.setStatus('idle')
  }

  private scheduleNext(delayMs: number, nextStatus: OpenSkyStatus): void {
    this.setStatus(nextStatus)
    this.timer = setTimeout(() => { void this.poll() }, delayMs)
  }

  private async poll(): Promise<void> {
    if (this.status === 'gaveup') return
    this.setStatus('polling')

    // Auth credentials, if any, are applied server-side by the openskyProxy
    // route — they never leave the server. The 3rd constructor arg is kept
    // for API compatibility but is unused in this code path.
    this.abortCtrl = new AbortController()
    let response: Response
    try {
      response = await fetch(buildOpenSkyUrl(), { signal: this.abortCtrl.signal })
    } catch (err) {
      // Aborts are normal on stop(); only count real errors.
      if ((err as { name?: string })?.name === 'AbortError') return
      // stop() may have run during the fetch microtask; if so, don't schedule a phantom retry.
      if ((this.status as OpenSkyStatus) === 'idle') return
      this.handleError()
      return
    } finally {
      this.abortCtrl = null
    }

    // 401 = bad creds, no retries.
    if (response.status === 401) {
      console.warn('[air-traffic] OpenSky auth failed (401) — falling back to anonymous requires toggle off/on')
      this.setStatus('gaveup')
      return
    }

    if (!response.ok) {
      this.handleError()
      return
    }

    let body: OpenSkyResponse
    try {
      body = await response.json() as OpenSkyResponse
    } catch {
      if ((this.status as OpenSkyStatus) === 'idle') return
      this.handleParseError()
      this.consecutiveErrors = 0 // parse failure isn't a backoff trigger
      this.scheduleNext(POLL_INTERVAL_MS, 'waiting')
      return
    }
    if ((this.status as OpenSkyStatus) === 'idle') return

    if (typeof body !== 'object' || body === null || !('states' in body)) {
      this.handleParseError()
      this.consecutiveErrors = 0
      this.scheduleNext(POLL_INTERVAL_MS, 'waiting')
      return
    }

    const updates = statesToUpdates(body, Date.now())
    for (const u of updates) this.onUpdate(u)

    this.consecutiveErrors = 0
    this.scheduleNext(POLL_INTERVAL_MS, 'waiting')
  }

  private handleError(): void {
    this.consecutiveErrors += 1
    if (this.consecutiveErrors >= MAX_RETRY_ATTEMPTS) {
      this.setStatus('gaveup')
      return
    }
    const delay = computeBackoffMs(this.consecutiveErrors - 1)
    this.scheduleNext(delay, 'backoff')
  }

  private handleParseError(): void {
    const now = Date.now()
    if (now - this.parseErrorTimer > 30_000) {
      this.parseErrorTimer = now
      console.warn('[air-traffic] dropped malformed OpenSky response')
    }
  }
}

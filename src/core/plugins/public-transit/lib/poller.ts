import type { CityConfig, FeedAdapter, Vehicle } from './types'

export type PollerStatus = 'idle' | 'polling' | 'waiting' | 'backoff' | 'gaveup'

export const MAX_RETRY_ATTEMPTS = 5
const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 20_000, 40_000, 60_000]

export function computeBackoffMs(attempt: number): number {
  const idx = Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)
  return BACKOFF_SCHEDULE_MS[idx]
}

/**
 * Adapter-agnostic poller. Drives any FeedAdapter through start/stop +
 * exponential backoff state machine.
 *
 *   idle → polling → waiting        (success: scheduleNext at adapter.defaultIntervalMs)
 *   idle → polling → backoff        (failure: scheduleNext at backoff)
 *   backoff → polling → waiting     (success: reset retries)
 *   backoff → polling → backoff     (failure: continue)
 *   backoff → gaveup                (retries >= MAX_RETRY_ATTEMPTS) — terminal
 */
export class Poller {
  private status: PollerStatus = 'idle'
  private timer: ReturnType<typeof setTimeout> | null = null
  private consecutiveErrors = 0
  private city: CityConfig | null = null
  private adapter: FeedAdapter | null = null
  /** Bumps every stop(); in-flight polls compare to short-circuit. */
  private generation = 0

  constructor(
    private onUpdate: (vehicles: Vehicle[]) => void,
    private onStatus?: (s: PollerStatus) => void,
  ) {}

  getStatus(): PollerStatus {
    return this.status
  }

  start(city: CityConfig, adapter: FeedAdapter): void {
    if (this.status !== 'idle') return
    this.city = city
    this.adapter = adapter
    this.consecutiveErrors = 0
    void this.poll()
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.generation += 1
    this.consecutiveErrors = 0
    this.city = null
    this.adapter = null
    this.setStatus('idle')
  }

  private setStatus(s: PollerStatus): void {
    this.status = s
    this.onStatus?.(s)
  }

  private scheduleNext(delayMs: number, nextStatus: PollerStatus): void {
    this.setStatus(nextStatus)
    this.timer = setTimeout(() => { void this.poll() }, delayMs)
  }

  private async poll(): Promise<void> {
    if (this.status === 'gaveup') return
    const adapter = this.adapter
    const city = this.city
    if (!adapter || !city) return
    const gen = this.generation
    this.setStatus('polling')

    let vehicles: Vehicle[]
    try {
      vehicles = await adapter.poll(city)
    } catch {
      if (gen !== this.generation) return
      this.handleError()
      return
    }
    if (gen !== this.generation) return

    this.onUpdate(vehicles)
    this.consecutiveErrors = 0
    this.scheduleNext(adapter.defaultIntervalMs, 'waiting')
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
}

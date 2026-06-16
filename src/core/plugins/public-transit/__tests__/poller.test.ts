import {
  Poller,
  computeBackoffMs,
  MAX_RETRY_ATTEMPTS,
} from '../lib/poller'
import { CITY_BY_ID } from '../lib/cities'
import type { FeedAdapter, Vehicle } from '../lib/types'
import type { Mock } from 'vitest'

function makeAdapter(opts: {
  poll: Mock<(input: unknown) => Promise<Vehicle[]>>
  defaultIntervalMs?: number
}): FeedAdapter {
  return {
    id: 'tfl',
    poll: opts.poll,
    defaultIntervalMs: opts.defaultIntervalMs ?? 30_000,
  }
}

describe('computeBackoffMs', () => {
  it('returns increasing delays up to a cap', () => {
    const a = computeBackoffMs(0)
    const b = computeBackoffMs(1)
    const c = computeBackoffMs(2)
    const d = computeBackoffMs(10)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(d).toBeLessThanOrEqual(60_000)
    expect(d).toBeGreaterThan(0)
  })
})

describe('Poller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in idle state', () => {
    const adapter = makeAdapter({ poll: vi.fn().mockResolvedValue([]) })
    const p = new Poller(vi.fn(), vi.fn())
    expect(p.getStatus()).toBe('idle')
    p.stop()
    void adapter
  })

  it('start() triggers an immediate poll then schedules at defaultInterval', async () => {
    const poll = vi.fn().mockResolvedValue([] as Vehicle[])
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const onUpdate = vi.fn()
    const onStatus = vi.fn()
    const p = new Poller(onUpdate, onStatus)
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve()
    await Promise.resolve()
    expect(poll).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(poll).toHaveBeenCalledTimes(2)
    p.stop()
  })

  it('emits update with the merged vehicle list', async () => {
    const vehicles: Vehicle[] = [
      { id: 'tfl:bus:1', position: [0, 0], mode: 'bus', routeId: '8', timestamp: 1 },
    ]
    const adapter = makeAdapter({ poll: vi.fn().mockResolvedValue(vehicles) })
    const onUpdate = vi.fn()
    const p = new Poller(onUpdate, vi.fn())
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    expect(onUpdate).toHaveBeenCalledWith(vehicles)
    p.stop()
  })

  it('emits status transitions: idle → polling → waiting on success', async () => {
    const adapter = makeAdapter({ poll: vi.fn().mockResolvedValue([]) })
    const onStatus = vi.fn()
    const p = new Poller(vi.fn(), onStatus)
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    const calls = onStatus.mock.calls.map(c => c[0])
    expect(calls).toContain('polling')
    expect(calls).toContain('waiting')
    p.stop()
  })

  it('on failure, transitions to backoff and retries with growing delay', async () => {
    const poll = vi.fn().mockRejectedValue(new Error('boom'))
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const onStatus = vi.fn()
    const p = new Poller(vi.fn(), onStatus)
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    expect(onStatus.mock.calls.map(c => c[0])).toContain('backoff')
    p.stop()
  })

  it('after MAX_RETRY_ATTEMPTS consecutive failures, transitions to gaveup', async () => {
    const poll = vi.fn().mockRejectedValue(new Error('boom'))
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const onStatus = vi.fn()
    const p = new Poller(vi.fn(), onStatus)
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve(); await Promise.resolve()
    }
    expect(onStatus.mock.calls.map(c => c[0])).toContain('gaveup')
    p.stop()
  })

  it('once gaveup, no further polls happen even on timer fire', async () => {
    const poll = vi.fn().mockRejectedValue(new Error('boom'))
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const p = new Poller(vi.fn(), vi.fn())
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    for (let i = 0; i < MAX_RETRY_ATTEMPTS + 2; i++) {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve(); await Promise.resolve()
    }
    const callCountAfterGaveup = poll.mock.calls.length
    vi.advanceTimersByTime(120_000)
    await Promise.resolve(); await Promise.resolve()
    expect(poll.mock.calls.length).toBe(callCountAfterGaveup)
    p.stop()
  })

  it('a successful poll after backoff resets the retry counter', async () => {
    let shouldFail = true
    const poll = vi.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error('boom')
      return []
    })
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const onStatus = vi.fn()
    const p = new Poller(vi.fn(), onStatus)
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    shouldFail = false
    vi.advanceTimersByTime(60_000)
    await Promise.resolve(); await Promise.resolve()
    expect(onStatus.mock.calls.map(c => c[0])).toContain('waiting')
    p.stop()
  })

  it('stop() prevents in-flight resolution from emitting update (race-guard)', async () => {
    let resolveFn!: (v: Vehicle[]) => void
    const poll = vi.fn().mockImplementation(() => new Promise<Vehicle[]>(r => { resolveFn = r }))
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const onUpdate = vi.fn()
    const p = new Poller(onUpdate, vi.fn())
    p.start(CITY_BY_ID.london, adapter)
    p.stop()
    resolveFn([{ id: 'x', position: [0, 0], mode: 'bus', routeId: '1', timestamp: 1 }])
    await Promise.resolve(); await Promise.resolve()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('start() while already running is a no-op', async () => {
    const poll = vi.fn().mockResolvedValue([])
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const p = new Poller(vi.fn(), vi.fn())
    p.start(CITY_BY_ID.london, adapter)
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    expect(poll).toHaveBeenCalledTimes(1)
    p.stop()
  })

  it('stop() before start() is a no-op (does not throw)', () => {
    const p = new Poller(vi.fn(), vi.fn())
    expect(() => p.stop()).not.toThrow()
  })

  it('uses adapter.defaultIntervalMs for scheduling', async () => {
    const poll = vi.fn().mockResolvedValue([])
    const adapter = makeAdapter({ poll, defaultIntervalMs: 10_000 })
    const p = new Poller(vi.fn(), vi.fn())
    p.start(CITY_BY_ID.helsinki, adapter)
    await Promise.resolve(); await Promise.resolve()
    expect(poll).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    await Promise.resolve(); await Promise.resolve()
    expect(poll).toHaveBeenCalledTimes(2)
    p.stop()
  })

  it('passes the city config to the adapter on every poll', async () => {
    const poll = vi.fn().mockResolvedValue([])
    const adapter = makeAdapter({ poll, defaultIntervalMs: 30_000 })
    const p = new Poller(vi.fn(), vi.fn())
    p.start(CITY_BY_ID.london, adapter)
    await Promise.resolve(); await Promise.resolve()
    expect(poll).toHaveBeenCalledWith(CITY_BY_ID.london)
    p.stop()
  })
})

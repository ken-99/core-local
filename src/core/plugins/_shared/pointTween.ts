import type * as GeoJSON from 'geojson'

type PointFC = GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>>

interface Entry {
  fromLng: number
  fromLat: number
  toLng: number
  toLat: number
  startMs: number
  props: Record<string, unknown>
}

export interface PointTweenOptions {
  /** Feature property holding a stable per-feature id (e.g. `icao24`, `mmsi`). */
  idKey: string
  /**
   * Tween duration in ms. Set a touch longer than the feed's poll interval so a
   * marker is always mid-glide when the next snapshot lands — motion stays
   * continuous instead of stop-start. Larger = smoother but lags reality more.
   */
  durationMs: number
  /** Called every animation frame with the interpolated collection. */
  render: (fc: PointFC) => void
  /** Injectable clock (defaults to Date.now). */
  now?: () => number
  /** Injectable scheduler (defaults to requestAnimationFrame, ~16ms fallback). */
  raf?: (cb: () => void) => number
  cancelRaf?: (handle: number) => void
}

/**
 * Smoothly animates Point markers between polled snapshots.
 *
 * The live-data plugins poll every 6–10s and snap markers to the new position,
 * which reads as stuttering. Feed each polled `FeatureCollection` to `update()`
 * and the tweener lerps every marker from its currently-displayed position
 * toward the new one across `durationMs`, re-basing on each snapshot so early
 * or late polls never cause a jump. Trails/other layers are unaffected — this
 * only owns the point source.
 */
export class PointTweener {
  private entries = new Map<string, Entry>()
  private handle: number | null = null
  private running = false
  private readonly clock: () => number
  private readonly schedule: (cb: () => void) => number
  private readonly cancel: (handle: number) => void

  constructor(private readonly opts: PointTweenOptions) {
    this.clock = opts.now ?? (() => Date.now())
    // Wrap rAF/cAF instead of using bare refs — browsers require these be
    // called with `this === window` and throw "Illegal invocation" otherwise.
    this.schedule = opts.raf
      ?? (typeof requestAnimationFrame === 'function'
        ? (cb: () => void) => requestAnimationFrame(cb)
        : (cb: () => void) => setTimeout(cb, 16) as unknown as number)
    this.cancel = opts.cancelRaf
      ?? (typeof cancelAnimationFrame === 'function'
        ? (h: number) => cancelAnimationFrame(h)
        : (h: number) => clearTimeout(h))
  }

  /** Begin the animation loop. Safe to call once; no-op while already running. */
  start(): void {
    if (this.running) return
    this.running = true
    this.loop()
  }

  /** Stop animating and drop all tween state. */
  stop(): void {
    this.running = false
    if (this.handle !== null) {
      this.cancel(this.handle)
      this.handle = null
    }
    this.entries.clear()
  }

  /** Feed a fresh polled snapshot. Re-bases each tween from its current position. */
  update(fc: PointFC): void {
    const now = this.clock()
    const next = new Map<string, Entry>()
    for (const f of fc.features) {
      const id = String(f.properties?.[this.opts.idKey] ?? '')
      if (!id) continue
      const [toLng, toLat] = f.geometry.coordinates
      const prev = this.entries.get(id)
      const cur = prev ? this.sample(prev, now) : null
      next.set(id, {
        fromLng: cur ? cur[0] : toLng,
        fromLat: cur ? cur[1] : toLat,
        toLng,
        toLat,
        startMs: now,
        props: f.properties ?? {},
      })
    }
    this.entries = next
    // Render immediately so behavior stays synchronous with the poll flush
    // (and new markers appear without waiting for the next frame).
    this.renderFrame(now)
  }

  private sample(e: Entry, now: number): [number, number] {
    const t = Math.min(1, Math.max(0, (now - e.startMs) / this.opts.durationMs))
    return [
      e.fromLng + (e.toLng - e.fromLng) * t,
      e.fromLat + (e.toLat - e.fromLat) * t,
    ]
  }

  private renderFrame(now: number): void {
    const features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[] = []
    for (const e of this.entries.values()) {
      const [lng, lat] = this.sample(e, now)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: e.props,
      })
    }
    this.opts.render({ type: 'FeatureCollection', features })
  }

  private loop = (): void => {
    if (!this.running) return
    this.renderFrame(this.clock())
    this.handle = this.schedule(this.loop)
  }
}

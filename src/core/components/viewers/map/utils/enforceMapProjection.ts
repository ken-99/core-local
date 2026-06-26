// Zoom past which the globe projection is unsafe. The globe camera math throws
// `getRayDirectionFromPixel: Not implemented` once you interact at high zoom,
// which jams MapLibre's render loop and freezes the map — so we force the flat
// (mercator) projection beyond this level.
export const MAX_GLOBE_ZOOM = 5

/** A minimal slice of the MapLibre map — just what the projection guard needs. */
export interface ProjectionMap {
  getZoom: () => number
  // MapLibre's real return is a ProjectionSpecification whose `type` can be an
  // expression, not just a string — so we take `unknown` and narrow below.
  getProjection: () => unknown
  setProjection: (projection: { type: 'mercator' | 'globe' }) => void
}

/** Read the projection name out of MapLibre's string-or-object return shape. */
export function getProjectionType(projection: unknown): string | undefined {
  if (typeof projection === 'string') return projection
  if (projection && typeof projection === 'object') {
    const p = projection as { type?: unknown; name?: unknown }
    if (typeof p.type === 'string') return p.type
    if (typeof p.name === 'string') return p.name
  }
  return undefined
}

/**
 * Force the flat (mercator) projection when zoomed in past MAX_GLOBE_ZOOM.
 *
 * Safe to call on any event. It's idempotent: it only calls setProjection when
 * the map is actually in globe past the threshold, so repeated calls (e.g. from
 * the frequent `styledata` event) do nothing once the map is already flat.
 *
 * Called on style changes as well as zoom because switching to a basemap whose
 * style declares no `projection` resets MapLibre 5.x back to its globe default —
 * stranding the map in globe at high zoom with no zoom event to catch it.
 */
export function enforceMercatorPastZoom(
  map: ProjectionMap,
  maxGlobeZoom: number = MAX_GLOBE_ZOOM,
): void {
  if (map.getZoom() <= maxGlobeZoom) return

  if (getProjectionType(map.getProjection()) !== 'mercator') {
    map.setProjection({ type: 'mercator' })
  }
}

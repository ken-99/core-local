/** A minimal slice of the MapLibre map — just what the terrain guard needs. */
export interface TerrainMap {
  getTerrain: () => { source?: string } | null | undefined
  getSource: (id: string) => unknown
  setTerrain: (terrain: null) => void
}

/**
 * Drop 3D terrain when it points at a source the current style no longer has.
 *
 * Switching basemaps replaces the style's sources. If terrain was on (the app
 * defaults to 'medium'), it keeps referencing the old terrain source — which the
 * new style dropped — and MapLibre 5.x then crashes in its terrain depth pass
 * (`useProgram` → `shaderPreludeCode` of undefined), freezing the map.
 *
 * Run on `styledata` (which fires synchronously while the new style loads, before
 * the next animation frame renders), this removes the dangling terrain in time to
 * avoid the crash. It's a no-op when terrain is off or its source is still present,
 * so legitimate terrain (e.g. after the user re-enables it) is left alone.
 *
 * Returns true when it cleared terrain, for testing/logging.
 */
export function clearStaleTerrain(map: TerrainMap): boolean {
  const source = map.getTerrain()?.source
  if (source && !map.getSource(source)) {
    map.setTerrain(null)
    return true
  }
  return false
}

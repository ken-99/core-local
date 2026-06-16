import type { Map } from 'maplibre-gl'

export const POI_LAYER_ID = 'poi'

/**
 * Show or hide the POI icons on the CDT basemap, leaving their text labels alone.
 * The icons and labels share one layer (`poi`), so we toggle the paint property
 * `icon-opacity` rather than the layer's visibility.
 *
 * No-op when the active style has no `poi` layer (e.g. Satellite), so this is
 * safe to call on any basemap.
 */
export function setPoiIconsVisible(map: Map | null | undefined, visible: boolean): void {
  if (!map || typeof map.getLayer !== 'function' || !map.getLayer(POI_LAYER_ID)) return
  // "Show" restores opacity to a flat 1. The style's original icon-opacity is a
  // focus-dimming expression (0.3 when a building is focused, else 1), but that focus
  // feature isn't wired up, so 1 is the effective value. If focus dimming is ever
  // enabled, revisit this to preserve the original expression.
  map.setPaintProperty(POI_LAYER_ID, 'icon-opacity', visible ? 1 : 0)
}

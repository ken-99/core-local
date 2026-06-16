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
  map.setPaintProperty(POI_LAYER_ID, 'icon-opacity', visible ? 1 : 0)
}

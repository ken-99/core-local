import { Protocol } from 'pmtiles'
import type maplibregl from 'maplibre-gl'

// Module-level guard: MapLibre's addProtocol is global, so we only want to
// register the pmtiles handler once per page load.
let registered = false

/**
 * Teach a MapLibre instance how to read `pmtiles://` sources.
 * Safe to call more than once — only the first call does anything.
 *
 * @param maplib the maplibre-gl module (the same instance the map uses)
 */
export function registerPmtilesProtocol(maplib: typeof maplibregl): void {
  if (registered) return
  const protocol = new Protocol()
  maplib.addProtocol('pmtiles', protocol.tile)
  registered = true
}

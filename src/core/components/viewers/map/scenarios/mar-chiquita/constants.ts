import grid from './marChiquitaGrid'

/** WGS84 center the water mesh is localized around (from the baked grid). */
export const MAR_CHIQUITA_CENTER = grid.center as [number, number]

/** Camera the scene flies to on mount (mercator only). */
export const MAR_CHIQUITA_VIEW = { center: MAR_CHIQUITA_CENTER, zoom: 17 } as const

/** Ortho drape — single georeferenced RGBA image (public/demo). */
export const ORTHO_IMAGE_URL = '/demo/mar-chiquita/ortho.png'
/** Image-source corners [TL, TR, BR, BL] in WGS84, from the ortho GeoTIFF extent. */
export const ORTHO_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [-57.3833475, -37.7072129],
  [-57.3802695, -37.7072129],
  [-57.3802695, -37.7097150],
  [-57.3833475, -37.7097150],
]

export const WATER_COLOR = '#2b7bbd'

/** Slider bounds (m), from the DEM range −0.06…9.19. */
export const LEVEL_MIN = 0
export const LEVEL_MAX = 6
export const LEVEL_DEFAULT = 2

import grid from './marChiquitaGrid'

/** WGS84 center the water mesh is localized around (from the baked grid). */
export const MAR_CHIQUITA_CENTER = grid.center as [number, number]

/** Ortho drape — single georeferenced RGBA image (public/demo). */
export const ORTHO_IMAGE_URL = '/demo/mar-chiquita/ortho.png'
/** Image-source corners [TL, TR, BR, BL] in WGS84, from the ortho GeoTIFF extent. */
export const ORTHO_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [-57.3833475, -37.7072129],
  [-57.3802695, -37.7072129],
  [-57.3802695, -37.7097150],
  [-57.3833475, -37.7097150],
]

/**
 * Where the camera should look — NOT `MAR_CHIQUITA_CENTER`.
 *
 * The DEM's bounding box is 427×421 m, but the surveyed ground inside it is a
 * rotated diamond of ~268×272 m sitting to the southwest, so the box centre is
 * ~70 m off the imagery. The mesh is right to localize around `grid.center`
 * (geometry and the model matrix must share one origin) — only the camera needs
 * the scene's real middle, which is the ortho's own centre.
 */
export const SCENE_CENTER: [number, number] = [
  (ORTHO_COORDINATES[0][0] + ORTHO_COORDINATES[2][0]) / 2,
  (ORTHO_COORDINATES[0][1] + ORTHO_COORDINATES[2][1]) / 2,
]

/** Camera the scene flies to on mount (mercator only). z18 frames the ~271 m scene. */
export const MAR_CHIQUITA_VIEW = { center: SCENE_CENTER, zoom: 18 } as const

/** Slider bounds (m), from the DEM range −0.06…9.19. */
export const LEVEL_MIN = 0
/**
 * Tuned in `data/work/preview/index.html` against the real grid + imagery.
 * `LEVEL_MAX` is the last level before the water reaches the *inland* survey
 * edge and rules a straight blue line across dry ground (0/127 boundary cells
 * wet at 3.0 m, 39/127 at 3.5 m, 80/127 at 4.5 m). `LEVEL_DEFAULT` opens with
 * the waterline at the sand's edge (~10% wet), and off 0, where the water plane
 * would z-fight the flat ortho.
 */
export const LEVEL_MAX = 3.0
export const LEVEL_DEFAULT = 0.8

/** Milliseconds per full up-down cycle of the Play animation. */
export const PLAY_PERIOD_MS = 12000

/**
 * Depth shading. Colour and opacity ramp from the water's edge to
 * `WATER_DEPTH_SATURATE_M` deep; flat blue over pale sand composites to a
 * washed-out grey. Mixed in sRGB — see `waterShading.ts`.
 */
export const WATER_SHALLOW_COLOR = '#7fd4d8'
export const WATER_DEEP_COLOR = '#14568c'
export const WATER_SHALLOW_ALPHA = 0.28
export const WATER_DEEP_ALPHA = 0.80
export const WATER_DEPTH_SATURATE_M = 2.0

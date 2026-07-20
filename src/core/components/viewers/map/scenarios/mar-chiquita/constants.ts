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
 * Where the camera should look — NOT the baked grid's own `center`.
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

/** Vertical exaggeration for the 3D relief (survey is ~270 m wide, ~9 m tall). */
export const EXAGGERATION = 3

/** DEM height range (m) the colour ramp spans (from the baked grid: −0.06…9.19). */
export const HEIGHT_MIN = 0
export const HEIGHT_MAX = 9

/** Colour-by-height ramp, low → high, mixed in sRGB. */
export const RAMP_LOW_COLOR = '#1b7a3d'  // low ground green
export const RAMP_HIGH_COLOR = '#f2efe6' // high ground pale

/** Fixed sun for hillshade: NW, high. Local frame x=east, y=up, z=−north. */
export const SUN_DIR: [number, number, number] = [-0.5, 0.7, -0.5]
/** Floor brightness in shadow, so shaded faces never go pure black. */
export const HILLSHADE_AMBIENT = 0.35

/** When Photo and Colour-by-height are both on, how strongly the tint shows. */
export const HEIGHT_TINT_STRENGTH = 0.4

/** Camera pitch (deg) the demo opens at, so the relief reads immediately. */
export const SCENE_PITCH = 50

/** The three independently-togglable surface layers. */
export type LayerKey = 'photo' | 'hillshade' | 'height'
/** Toggle order, left to right in the control strip. */
export const LAYER_KEYS: readonly LayerKey[] = ['photo', 'hillshade', 'height']
/** Which layers are on when the demo is shown (and reset to on every hide). */
export const LAYER_DEFAULTS: Record<LayerKey, boolean> = { photo: true, hillshade: false, height: false }
/** Button labels for the toggles. */
export const LAYER_LABELS: Record<LayerKey, string> = { photo: 'Photo', hillshade: 'Hillshade', height: 'Height' }

/**
 * How many rings of cells to shave off the edge of the survey before drawing.
 *
 * The mask comes from the height file's nodata flags, so the boundary is ragged
 * and seven cells dangle off it alone. Each pass shaves ~2.37 m off every edge
 * and costs ~3.6% of the surveyed area (96.4% left at 1 pass, 92.8% at 2,
 * 89.3% at 3).
 *
 * NOT purely cosmetic: the pedestal walls are built from the trimmed mask too,
 * so raising this visibly moves the walls inward as well as the outline.
 *
 * This cannot make the edges straight — a rotated shape on a square grid always
 * steps, however far it is inset. If the stepping still reads badly, the fix is
 * cutting cells partway (see the design doc), NOT a bigger trim, which only eats
 * the survey.
 */
export const EDGE_TRIM_CELLS = 1

/**
 * How far below the lowest surveyed ground the pedestal base sits, in metres.
 * Stretched by EXAGGERATION like everything else, so 3 m reads as ~9 m of wall
 * against ~27 m of stretched relief — about a third of the terrain height:
 * solid enough to look deliberate, not so tall it becomes the subject.
 */
export const PEDESTAL_DEPTH_M = 3

/**
 * Pedestal wall colours, top to base. The gradient is what makes it read as a
 * cut earth face rather than a flat card. Deliberately fixed — the wall does not
 * follow the Photo / Hillshade / Height toggles, so it stays a stable frame
 * while those change how the ground is read.
 */
export const SKIRT_TOP_COLOR = '#8a7f6d'
export const SKIRT_BASE_COLOR = '#3b352d'

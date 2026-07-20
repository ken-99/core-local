import {
  HEIGHT_MIN, HEIGHT_MAX, RAMP_LOW_COLOR, RAMP_HIGH_COLOR,
  SUN_DIR, HILLSHADE_AMBIENT,
} from './constants'

/** '#1b7a3d' → [r,g,b] as 0–1 sRGB. */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const LOW = hexToRgb(RAMP_LOW_COLOR)
const HIGH = hexToRgb(RAMP_HIGH_COLOR)
const SUN_LEN = Math.hypot(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]) || 1
const SUN = [SUN_DIR[0] / SUN_LEN, SUN_DIR[1] / SUN_LEN, SUN_DIR[2] / SUN_LEN] as const

/** Hypsometric colour for ground at `height` m, low → high, clamped, in sRGB. */
export function heightRampColor(height: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (height - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)))
  return [LOW[0] + (HIGH[0] - LOW[0]) * t, LOW[1] + (HIGH[1] - LOW[1]) * t, LOW[2] + (HIGH[2] - LOW[2]) * t]
}

/** Light factor 0–1 for a unit surface normal under the fixed sun. */
export function hillshade(normal: [number, number, number]): number {
  const d = Math.max(0, normal[0] * SUN[0] + normal[1] * SUN[1] + normal[2] * SUN[2])
  return HILLSHADE_AMBIENT + (1 - HILLSHADE_AMBIENT) * d
}

import {
  WATER_SHALLOW_COLOR, WATER_DEEP_COLOR,
  WATER_SHALLOW_ALPHA, WATER_DEEP_ALPHA, WATER_DEPTH_SATURATE_M,
} from './constants'

/** '#7fd4d8' → [r,g,b] as 0–1 sRGB. */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const SHALLOW = hexToRgb(WATER_SHALLOW_COLOR)
const DEEP = hexToRgb(WATER_DEEP_COLOR)

/** Straight sRGB colour + alpha for water standing `depth` metres deep. */
export type WaterRgba = [number, number, number, number]

/**
 * Colour the water by how deep it is: shallow at the waterline, saturating to
 * the deep colour at `WATER_DEPTH_SATURATE_M`. Opacity ramps with it, so the
 * edge stays sheer over sand while deep water reads solid.
 *
 * Mixed in **sRGB**, matching the offline preview this was tuned in — callers
 * pushing these into three.js must say so (`SRGBColorSpace`) rather than let
 * the values be read as linear.
 */
export function waterDepthRgba(depth: number): WaterRgba {
  const t = Math.min(1, Math.max(0, depth / WATER_DEPTH_SATURATE_M))
  return [
    SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t,
    SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t,
    SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t,
    WATER_SHALLOW_ALPHA + (WATER_DEEP_ALPHA - WATER_SHALLOW_ALPHA) * t,
  ]
}

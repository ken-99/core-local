import { describe, it, expect } from 'vitest'
import { waterDepthRgba } from './waterShading'
import {
  WATER_SHALLOW_COLOR, WATER_DEEP_COLOR,
  WATER_SHALLOW_ALPHA, WATER_DEEP_ALPHA, WATER_DEPTH_SATURATE_M,
} from './constants'

// '#7fd4d8' → [0.498…, 0.831…, 0.847…]
const hex = (s: string): [number, number, number] => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
]

describe('waterDepthRgba', () => {
  it('is the shallow colour at the waterline', () => {
    const [r, g, b, a] = waterDepthRgba(0)
    const [sr, sg, sb] = hex(WATER_SHALLOW_COLOR)
    expect(r).toBeCloseTo(sr, 6)
    expect(g).toBeCloseTo(sg, 6)
    expect(b).toBeCloseTo(sb, 6)
    expect(a).toBeCloseTo(WATER_SHALLOW_ALPHA, 6)
  })

  it('reaches the deep colour at the saturation depth', () => {
    const [r, g, b, a] = waterDepthRgba(WATER_DEPTH_SATURATE_M)
    const [dr, dg, db] = hex(WATER_DEEP_COLOR)
    expect(r).toBeCloseTo(dr, 6)
    expect(g).toBeCloseTo(dg, 6)
    expect(b).toBeCloseTo(db, 6)
    expect(a).toBeCloseTo(WATER_DEEP_ALPHA, 6)
  })

  it('clamps past the saturation depth instead of overshooting', () => {
    expect(waterDepthRgba(WATER_DEPTH_SATURATE_M * 10))
      .toEqual(waterDepthRgba(WATER_DEPTH_SATURATE_M))
  })

  it('mixes half way at half the saturation depth', () => {
    const [r, , , a] = waterDepthRgba(WATER_DEPTH_SATURATE_M / 2)
    const [sr] = hex(WATER_SHALLOW_COLOR)
    const [dr] = hex(WATER_DEEP_COLOR)
    expect(r).toBeCloseTo((sr + dr) / 2, 6)
    expect(a).toBeCloseTo((WATER_SHALLOW_ALPHA + WATER_DEEP_ALPHA) / 2, 6)
  })

  it('gets more opaque as the water deepens', () => {
    const shallower = waterDepthRgba(0.2)[3]
    const deeper = waterDepthRgba(1.5)[3]
    expect(deeper).toBeGreaterThan(shallower)
  })

  it('clamps a negative depth to the shallow end', () => {
    expect(waterDepthRgba(-1)).toEqual(waterDepthRgba(0))
  })
})

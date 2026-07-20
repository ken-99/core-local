import { describe, it, expect } from 'vitest'
import { heightRampColor, hillshade } from './terrainShading'
import { HILLSHADE_AMBIENT, SUN_DIR } from './constants'

describe('heightRampColor', () => {
  it('returns the low colour at the bottom of the range', () => {
    const [r, g, b] = heightRampColor(0)
    expect(r).toBeCloseTo(0x1b / 255, 5)
    expect(g).toBeCloseTo(0x7a / 255, 5)
    expect(b).toBeCloseTo(0x3d / 255, 5)
  })
  it('returns the high colour at the top of the range', () => {
    const [r, g, b] = heightRampColor(9)
    expect(r).toBeCloseTo(0xf2 / 255, 5)
    expect(g).toBeCloseTo(0xef / 255, 5)
    expect(b).toBeCloseTo(0xe6 / 255, 5)
  })
  it('clamps below and above the range', () => {
    expect(heightRampColor(-5)).toEqual(heightRampColor(0))
    expect(heightRampColor(20)).toEqual(heightRampColor(9))
  })
})

describe('hillshade', () => {
  const norm = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]
  }
  it('fully lights a slope facing the sun', () => {
    expect(hillshade(norm(SUN_DIR))).toBeCloseTo(1, 6)
  })
  it('drops to ambient for a slope facing away', () => {
    const away = norm([-SUN_DIR[0], -SUN_DIR[1], -SUN_DIR[2]])
    expect(hillshade(away)).toBeCloseTo(HILLSHADE_AMBIENT, 6)
  })
  it('never returns below ambient or above 1', () => {
    for (const n of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, -1, -1]] as const) {
      const s = hillshade(norm([...n]))
      expect(s).toBeGreaterThanOrEqual(HILLSHADE_AMBIENT - 1e-9)
      expect(s).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

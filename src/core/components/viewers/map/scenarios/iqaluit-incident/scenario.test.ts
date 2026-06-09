import { describe, it, expect } from 'vitest'
import { interpAlong } from './scenario'

const PATH: [number, number][] = [
  [-68.56, 63.75],
  [-68.54, 63.76],
  [-68.50, 63.77],
]

describe('interpAlong', () => {
  it('returns the first point at u=0 and the last at u=1', () => {
    expect(interpAlong(PATH, 0)).toEqual([-68.56, 63.75])
    expect(interpAlong(PATH, 1)).toEqual([-68.50, 63.77])
  })

  it('returns a point strictly between the ends at u=0.5', () => {
    const [lng, lat] = interpAlong(PATH, 0.5)
    expect(lng).toBeGreaterThan(-68.56)
    expect(lng).toBeLessThan(-68.50)
    expect(lat).toBeGreaterThan(63.75)
    expect(lat).toBeLessThan(63.77)
  })

  it('clamps u outside [0,1]', () => {
    expect(interpAlong(PATH, -1)).toEqual([-68.56, 63.75])
    expect(interpAlong(PATH, 2)).toEqual([-68.50, 63.77])
  })
})

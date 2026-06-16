import { REGIONS, regionsAsBoundingBoxes } from '../lib/regions'

describe('regions', () => {
  test('REGIONS is a non-empty list', () => {
    expect(REGIONS.length).toBeGreaterThan(0)
  })

  test('every bbox has west < east and south < north and lat in [-90, 90]', () => {
    for (const r of REGIONS) {
      const [west, south, east, north] = r.bbox
      expect(west).toBeLessThan(east)
      expect(south).toBeLessThan(north)
      expect(south).toBeGreaterThanOrEqual(-90)
      expect(north).toBeLessThanOrEqual(90)
    }
  })

  test('region set covers Vancouver Harbor (lon -123.10, lat 49.30)', () => {
    const vanHarbor = REGIONS.find(r =>
      r.bbox[0] <= -123.10 && r.bbox[2] >= -123.10
      && r.bbox[1] <= 49.30 && r.bbox[3] >= 49.30,
    )
    expect(vanHarbor).toBeDefined()
  })

  test('region set covers Victoria (lon -123.37, lat 48.43)', () => {
    const victoria = REGIONS.find(r =>
      r.bbox[0] <= -123.37 && r.bbox[2] >= -123.37
      && r.bbox[1] <= 48.43 && r.bbox[3] >= 48.43,
    )
    expect(victoria).toBeDefined()
  })

  test('regionsAsBoundingBoxes returns AISStream-shaped corner pairs (one per region)', () => {
    const boxes = regionsAsBoundingBoxes()
    expect(boxes).toHaveLength(REGIONS.length)
    for (const box of boxes) {
      expect(box).toHaveLength(2)
      expect(box[0]).toHaveLength(2) // [lat1, lon1]
      expect(box[1]).toHaveLength(2) // [lat2, lon2]
    }
  })
})

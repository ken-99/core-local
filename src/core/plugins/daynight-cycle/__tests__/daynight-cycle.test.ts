import {
  formatTime,
  toDisplayMinutes,
  getPresetTime,
  getLight,
  getOverlayOpacity,
  type LightConfig,
} from '../lib/sun'

describe('toDisplayMinutes', () => {
  it('returns slider + offset within 1440', () => {
    expect(toDisplayMinutes(0, 0)).toBe(0)
    expect(toDisplayMinutes(720, 0)).toBe(720)
    expect(toDisplayMinutes(0, 720)).toBe(720)
  })

  it('wraps correctly when sum exceeds 1440', () => {
    // 1400 + 100 = 1500; 1500 % 1440 = 60
    expect(toDisplayMinutes(1400, 100)).toBe(60)
  })

  it('wraps correctly for negative-equivalent inputs', () => {
    // (1439 + 1) % 1440 = 0
    expect(toDisplayMinutes(1439, 1)).toBe(0)
  })
})

describe('formatTime', () => {
  it('formats midnight (no offset)', () => {
    expect(formatTime(0, 0)).toBe('00:00')
  })

  it('formats noon (no offset)', () => {
    expect(formatTime(720, 0)).toBe('12:00')
  })

  it('formats last minute of day', () => {
    expect(formatTime(1439, 0)).toBe('23:59')
  })

  it('formats with UTC offset applied', () => {
    // slider=0, offset=720 → display=720 → 12:00
    expect(formatTime(0, 720)).toBe('12:00')
  })

  it('pads hours and minutes to two digits', () => {
    // slider=61 (1h 1m), offset=0 → display=61 → 01:01
    expect(formatTime(61, 0)).toBe('01:01')
  })
})

describe('getPresetTime', () => {
  // With offset=720 (UTC+0 solar time from getTimeOffset(0)):
  // preset slider = (PRESET_DISPLAY - offset + 1440) % 1440
  it('noon preset at offset 720 → slider 0', () => {
    // PRESET_DISPLAY_TIMES.noon = 720; (720 - 720 + 1440) % 1440 = 0
    expect(getPresetTime('noon', 720)).toBe(0)
  })

  it('night preset at offset 720 → slider 720', () => {
    // PRESET_DISPLAY_TIMES.night = 0; (0 - 720 + 1440) % 1440 = 720
    expect(getPresetTime('night', 720)).toBe(720)
  })

  it('dawn preset at offset 720 → slider 1080', () => {
    // PRESET_DISPLAY_TIMES.dawn = 360; (360 - 720 + 1440) % 1440 = 1080
    expect(getPresetTime('dawn', 720)).toBe(1080)
  })

  it('dusk preset at offset 720 → slider 390', () => {
    // PRESET_DISPLAY_TIMES.dusk = 1110; (1110 - 720 + 1440) % 1440 = 1830 % 1440 = 390
    expect(getPresetTime('dusk', 720)).toBe(390)
  })

  it('roundtrips: formatTime(getPresetTime(p, offset), offset) equals the preset display time', () => {
    const offset = 720
    expect(formatTime(getPresetTime('noon', offset), offset)).toBe('12:00')
    expect(formatTime(getPresetTime('night', offset), offset)).toBe('00:00')
    expect(formatTime(getPresetTime('dawn', offset), offset)).toBe('06:00')
    expect(formatTime(getPresetTime('dusk', offset), offset)).toBe('18:30')
  })
})

describe('getLight', () => {
  it('returns a valid LightConfig shape', () => {
    const light: LightConfig = getLight(0, 0)
    expect(light.anchor).toBe('map')
    expect(light.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(light.intensity).toBeGreaterThanOrEqual(0.1)
    expect(light.intensity).toBeLessThanOrEqual(0.5)
    expect(light.position).toHaveLength(3)
    light.position.forEach(v => expect(typeof v).toBe('number'))
  })

  it('is brighter at solar noon (display=720)', () => {
    // slider=0, offset=720 → display=720 (noon) → max intensity
    const noonLight = getLight(0, 720)
    // slider=720, offset=720 → display=0 (midnight) → min intensity
    const nightLight = getLight(720, 720)
    expect(noonLight.intensity).toBeGreaterThan(nightLight.intensity)
  })

  it('noon intensity is at or near 0.5', () => {
    const light = getLight(0, 720) // display = 720 (noon)
    expect(light.intensity).toBeCloseTo(0.5, 1)
  })

  it('midnight intensity is at or near 0.1', () => {
    const light = getLight(720, 720) // display = 0 (midnight)
    expect(light.intensity).toBeCloseTo(0.1, 1)
  })
})

describe('getOverlayOpacity', () => {
  it('is 0 at solar noon', () => {
    // slider=0, offset=720 → display=720 (noon) → opacity=0
    expect(getOverlayOpacity(0, 720)).toBeCloseTo(0, 5)
  })

  it('is ~0.4 at midnight', () => {
    // slider=720, offset=720 → display=0 (midnight) → opacity=0.4
    expect(getOverlayOpacity(720, 720)).toBeCloseTo(0.4, 1)
  })

  it('is between 0 and 0.4 for all inputs', () => {
    for (const minutes of [0, 360, 720, 1080, 1439]) {
      const opacity = getOverlayOpacity(minutes, 0)
      expect(opacity).toBeGreaterThanOrEqual(0)
      expect(opacity).toBeLessThanOrEqual(0.4)
    }
  })
})

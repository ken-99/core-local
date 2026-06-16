// src/plugins/daynight-cycle/lib/sun.ts
import SunCalc from 'suncalc'

export type Preset = 'dawn' | 'noon' | 'dusk' | 'night'

const PRESET_DISPLAY_TIMES: Record<Preset, number> = {
  dawn: 360,
  noon: 720,
  dusk: 1110,
  night: 0,
}

/** Slider value that maps to solar noon at the given longitude. */
export function getTimeOffset(lng: number): number {
  return Math.round(lng / 15) * 60 + 720
}

/** Display string for the UTC solar offset, e.g. "UTC+5". */
export function formatUtcOffset(lng: number): string {
  const hours = Math.round(lng / 15)
  const sign = hours >= 0 ? '+' : ''
  return `UTC${sign}${hours}`
}

/** Convert internal slider minutes to local display minutes (wraps at 1440). */
export function toDisplayMinutes(sliderMinutes: number, offset: number): number {
  return ((sliderMinutes + offset) % 1440 + 1440) % 1440
}

/** Slider value for a given preset name at the current time offset. */
export function getPresetTime(preset: Preset, offset: number): number {
  return (PRESET_DISPLAY_TIMES[preset] - offset + 1440) % 1440
}

/** Local time as HH:MM for the given slider position and offset. */
export function formatTime(sliderMinutes: number, offset: number): string {
  const display = toDisplayMinutes(sliderMinutes, offset)
  const h = Math.floor(display / 60)
  const m = Math.floor(display % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// --- Internal helpers ---

function sunFactor(displayMinutes: number): number {
  return (Math.cos(((displayMinutes - 720) / 720) * Math.PI) + 1) / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16)
  const ag = parseInt(a.slice(3, 5), 16)
  const ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16)
  const bg = parseInt(b.slice(3, 5), 16)
  const bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(lerp(ar, br, t))
  const g = Math.round(lerp(ag, bg, t))
  const bl = Math.round(lerp(ab, bb, t))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

// --- Public types and functions ---

export interface LightConfig {
  anchor: 'map'
  color: string
  intensity: number
  position: [number, number, number]
}

/** Lat/lng of the subsolar point (where sun is directly overhead) for a given date. */
export function getSubsolarPoint(date: Date): { lat: number; lng: number } {
  const declination = SunCalc.getPosition(date, 90, 0).altitude
  const subsolarLat = (declination * 180) / Math.PI
  const times = SunCalc.getTimes(date, 0, 0)
  const timeDiffMs = times.solarNoon.getTime() - date.getTime()
  const subsolarLng = (timeDiffMs / (3600 * 1000)) * 15
  return {
    lat: subsolarLat,
    lng: ((subsolarLng + 540) % 360) - 180,
  }
}

/** Convert subsolar lat/lng to MapLibre light position [radius, azimuth, polar]. */
export function subsolarToLightPosition(lat: number, lng: number): [number, number, number] {
  const sinD = (d: number) => Math.sin((d * Math.PI) / 180)
  const cosD = (d: number) => Math.cos((d * Math.PI) / 180)
  const acosD = (v: number) => (Math.acos(Math.max(-1, Math.min(1, v))) * 180) / Math.PI

  const polarAngle = acosD(cosD(lat) * cosD(lng))
  if (polarAngle < 0.001) return [1.5, 180, 0]

  let azimuth = acosD(sinD(lat) / sinD(polarAngle))
  if (lng < 0) azimuth = 360 - azimuth
  azimuth = (azimuth + 180) % 360

  return [1.5, azimuth, polarAngle]
}

/** Convert minutes-of-day to a UTC Date using today's calendar date. */
export function minutesToDate(minutes: number): Date {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    Math.floor(minutes / 60),
    Math.floor(minutes % 60),
    0,
  ))
}

/** Full MapLibre light configuration for the given slider position and offset. */
export function getLight(minutes: number, offset: number): LightConfig {
  const display = toDisplayMinutes(minutes, offset)
  const sf = sunFactor(display)
  const color = lerpColor('#4a6fa5', '#fffaf0', sf)
  const intensity = lerp(0.1, 0.5, sf)
  const date = minutesToDate(minutes)
  const subsolar = getSubsolarPoint(date)
  const position = subsolarToLightPosition(subsolar.lat, subsolar.lng)
  return { anchor: 'map', color, intensity, position }
}

/** Dark overlay opacity: 0 at noon, ~0.4 at midnight. */
export function getOverlayOpacity(minutes: number, offset: number): number {
  const display = toDisplayMinutes(minutes, offset)
  return lerp(0.4, 0, sunFactor(display))
}

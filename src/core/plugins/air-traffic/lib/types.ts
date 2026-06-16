/** Bounding box [west, south, east, north] in WGS84. */
export type BBox = [number, number, number, number]

export interface Region {
  name: string
  bbox: BBox
}

/**
 * One aircraft position update from a single OpenSky poll. Each poll returns
 * one of these per aircraft visible in the bbox.
 */
export interface AircraftPosition {
  /** ICAO 24-bit address as lowercase hex (e.g. "a4b1c5"). Stable per airframe. */
  icao24: string
  lat: number
  lon: number
  /** True heading in degrees, 0-359. null if not broadcast. */
  heading: number | null
  /** Velocity over ground in knots. null if not broadcast. */
  velocity: number | null
  /** Barometric altitude in feet. null if on the ground or not broadcast. */
  baroAltitudeFt: number | null
  /** Vertical rate in feet/min. null if not broadcast. Negative = descending. */
  verticalRateFpm: number | null
  onGround: boolean
  /** Unix epoch milliseconds when the OpenSky `last_contact` was. */
  lastContactMs: number
  /** Unix epoch milliseconds when WE received this update (Date.now() at poll time). */
  receivedAt: number
}

/**
 * Slow-changing fields from OpenSky — broadcast in the same payload but we
 * separate them so trail/render code doesn't churn when only position changes.
 */
export interface AircraftStatic {
  icao24: string
  /** Trimmed callsign string. May be empty if not broadcast. */
  callsign: string
  /** Origin country as a free-form string per OpenSky's `origin_country`. */
  originCountry: string
  /** ICAO emitter category 0-15. null if not broadcast (most common case). */
  category: number | null
  receivedAt: number
}

/** The merged in-memory state for one aircraft. */
export interface AircraftState {
  icao24: string
  position?: AircraftPosition
  static?: AircraftStatic
  /** Latest of position.receivedAt and static.receivedAt — used for ageing. */
  lastSeen: number
  /**
   * Recent positions (oldest → newest) for drawing a trail. Hard-capped at 60
   * entries (10 min @ 10s polling cadence).
   */
  history?: AircraftPosition[]
}

/** Either kind of update emitted by opensky.ts to the consumer. */
export type AircraftUpdate =
  | { kind: 'position', data: AircraftPosition }
  | { kind: 'static', data: AircraftStatic }

/**
 * OpenSky `state` tuple — 17 fields by index, plus optional 18th (category)
 * when we request `?extended=1`. We never index into a raw tuple in app code;
 * `opensky.ts` parses tuples into AircraftPosition + AircraftStatic immediately.
 *
 * Field order documented in https://openskynetwork.github.io/opensky-api/rest.html#response
 */
export type OpenSkyStateTuple = [
  string,        // 0: icao24
  string | null, // 1: callsign
  string,        // 2: origin_country
  number | null, // 3: time_position (epoch s)
  number,        // 4: last_contact (epoch s)
  number | null, // 5: longitude
  number | null, // 6: latitude
  number | null, // 7: baro_altitude (m)
  boolean,       // 8: on_ground
  number | null, // 9: velocity (m/s)
  number | null, // 10: true_track (deg)
  number | null, // 11: vertical_rate (m/s)
  number[] | null, // 12: sensors
  number | null, // 13: geo_altitude (m)
  string | null, // 14: squawk
  boolean,       // 15: spi
  number,        // 16: position_source
  number?,       // 17: category (only present with ?extended=1)
]

export interface OpenSkyResponse {
  time: number
  states: OpenSkyStateTuple[] | null
}

/** Bounding box [west, south, east, north] in WGS84. */
export type BBox = [number, number, number, number]

export interface Region {
  name: string
  bbox: BBox
}

/** A vessel position update — what comes off Type 1/2/3/18 messages. */
export interface VesselPosition {
  mmsi: number
  lat: number
  lon: number
  /** Course over ground, degrees 0–360. -1 if unavailable. */
  cog: number
  /** Speed over ground, knots. -1 if unavailable. */
  sog: number
  /** True heading, degrees 0–359. 511 if unavailable per AIS. */
  heading: number
  /** Unix epoch milliseconds when the message was received. */
  receivedAt: number
}

/** Static & voyage data — what comes off Type 5/24 messages. */
export interface VesselStatic {
  mmsi: number
  /** Vessel name as broadcast (max 20 chars). May be undefined for Type 24A. */
  name?: string
  /** Numeric AIS ship type. 0–99. See ITU-R M.1371. */
  shipType?: number
  /** ISO-2 country code derived from MMSI MID prefix, or undefined. */
  flag?: string
  destination?: string
  /** Eta in ISO-8601 string when known. */
  eta?: string
  callSign?: string
  imo?: number
  /** Total length in metres (dimA + dimB). */
  length?: number
  /** Total beam in metres (dimC + dimD). */
  beam?: number
  /** Static draft in metres. */
  draft?: number
  /** Unix epoch milliseconds when the static report was received. */
  receivedAt: number
}

/** The merged in-memory state for one vessel. */
export interface VesselState {
  mmsi: number
  position?: VesselPosition
  static?: VesselStatic
  /** Latest of position.receivedAt and static.receivedAt — used for ageing. */
  lastSeen: number
  /**
   * Recent positions (oldest → newest) for drawing a trail.
   * Culled to entries within trailMaxAgeMs of the latest position on each insert.
   */
  history?: VesselPosition[]
}

/** Either kind of update returned by aisstream.ts to the consumer. */
export type VesselUpdate =
  | { kind: 'position', data: VesselPosition }
  | { kind: 'static', data: VesselStatic }

/** AISStream.io subscribe message body (per their v0 protocol). */
export interface SubscribeMessage {
  APIKey: string
  BoundingBoxes: number[][][]
  FilterMessageTypes?: string[]
}

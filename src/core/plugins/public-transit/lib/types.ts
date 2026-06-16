// --- Visualization mode ---
// Drives color, glyph, legend row. Multiple feed-level modes collapse to one
// visualization mode (e.g. TfL Tube/DLR/Overground/Elizabeth → 'rail').
export type Mode = 'rail' | 'bus' | 'tram' | 'ferry'

// --- Vehicle shape (the adapter ↔ store contract) ---
export interface Vehicle {
  /** Adapter-prefixed id, e.g. 'tfl:bus:LX12ABC' or 'hsl:metro:M2-1234'. Globally unique. */
  id: string
  /** [longitude, latitude] */
  position: [number, number]
  /** Heading in degrees clockwise from north. Undefined when feed doesn't provide it. */
  bearing?: number
  mode: Mode
  /** Route identifier, e.g. 'bakerloo' | '8' | 'M1'. Adapter-specific format. */
  routeId: string
  /** Human-readable destination, when available (TfL provides for buses). */
  destination?: string
  /** ms epoch when the adapter last observed this vehicle. */
  timestamp: number
}

// --- Per-vehicle history kept in the store ---
export interface VehicleState {
  vehicle: Vehicle
  /** Position history, oldest → newest. Capped at HISTORY_CAP. */
  history: Array<{ position: [number, number]; timestamp: number }>
}

// --- City config ---
export interface CityConfig {
  id: 'london' | 'helsinki'
  label: string
  /** flyTo target. */
  center: [number, number]
  defaultZoom: number
  /** Documentation only in v1; not used as a client-side filter. */
  bbox: [number, number, number, number]
  adapterId: 'tfl' | 'hslGtfsRt'
  /** Server-side env var name. If set, the proxy route forwards it. Undefined for HSL. */
  apiKeyEnvVar?: string
  /** Adapter-specific endpoint tokens. TfL: ['tube','bus','dlr','overground','elizabeth-line','tram','river-bus']. HSL: ['hsl']. */
  feedEndpoints: string[]
  /** Visualization modes this city is expected to produce — drives legend rows. */
  modes: Mode[]
}

// --- Adapter interface ---
export interface FeedAdapter {
  id: 'tfl' | 'hslGtfsRt'
  poll(cityConfig: CityConfig): Promise<Vehicle[]>
  defaultIntervalMs: number
}

// --- TfL response shapes ---
// Subset of fields used; TfL returns more.
export interface TflArrivalPrediction {
  id: string
  vehicleId: string
  lineId: string
  /** e.g. 'tube', 'bus', 'dlr'. TfL's `modeName` mirrors this. */
  modeName: string
  /** Where the vehicle is right now, free text: "Between A and B" or stop name. */
  currentLocation?: string
  /** Destination station/stop name. */
  towards?: string
  destinationName?: string
  stationName?: string
  /** Lat/lon of the *stop*, not the vehicle. Present on bus arrivals. */
  stationCoordinates?: { lat: number; lon: number }
  /** Seconds until arrival at the next stop. */
  timeToStation: number
  /** Bus-specific. */
  vehicleRegistration?: string
}

export interface TflRouteSequence {
  lineId: string
  /** Each station: { name, lat, lon, stationId } */
  stopPointSequences: Array<{
    stopPoint: Array<{ name: string; lat: number; lon: number; stationId: string }>
  }>
}

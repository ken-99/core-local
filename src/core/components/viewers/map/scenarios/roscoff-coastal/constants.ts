// Verified constants for the Roscoff coastal digital-twin demo.
// Pure data — no React, no MapLibre. Every endpoint here was curl-verified
// 2026-07-02 (see NOTES.md + the vault RESULTS file). Rescoped from Saint-Malo
// to Roscoff because Saint-Malo's IGN LiDAR HD tiles are indexed but not yet
// published (404); Roscoff's are live (206 + range + CORS, 13.08 pts/m²).

export type Lng = number
export type Lat = number
export type Coord = [Lng, Lat]
/** [minLng, minLat, maxLng, maxLat] */
export type BBox4 = [number, number, number, number]

// --- Geography: Roscoff, north Finistère, Brittany ---
export const ROSCOFF_CENTER: Coord = [-3.9657, 48.7184] // harbour / town centre
export const AOI_WGS84: BBox4 = [-3.978, 48.7087, -3.9534, 48.7282]
export const AOI_LAMB93: BBox4 = [187209, 6868063, 189209, 6870063] // EPSG:2154 metres

/** Camera the scene flies to on mount (mercator only — globe is a known crash). */
export const ROSCOFF_VIEW = { center: ROSCOFF_CENTER, zoom: 14 } as const

// --- Vertical datums that meet in this scene (the intellectual payload) ---
export type VerticalDatum = 'IGN69' | 'LAT' | 'ODN_NEWLYN' | 'ELLIPSOID'
export const DATUM_LABEL: Record<VerticalDatum, string> = {
  IGN69: 'IGN69 (French land datum)',
  LAT: 'LAT / zéro hydrographique (chart datum)',
  ODN_NEWLYN: 'ODN Newlyn (UK land datum)',
  ELLIPSOID: 'Ellipsoidal (WGS84/GRS80)',
}

// --- Open data sources (all curl-verified; CORS `*` unless noted) ---

/** EMODnet Bathymetry WMS — Channel-wide seabed (Act 1). Vertical frame: LAT. */
export const EMODNET_WMS = {
  base: 'https://ows.emodnet-bathymetry.eu/wms',
  meanDepthLayer: 'emodnet:mean',
  contoursLayer: 'contours',
  attribution: 'EMODnet Bathymetry Consortium (2024)',
} as const

/** IGN Géoplateforme WMTS — aerial photos + LiDAR-HD elevation (Acts 1–2). */
export const GEOPLATEFORME_WMTS = {
  base: 'https://data.geopf.fr/wmts',
  orthoLayer: 'ORTHOIMAGERY.ORTHOPHOTOS',
  demLayer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
  tileMatrixSet: 'PM',
  attribution: 'IGN — Géoplateforme',
} as const

/**
 * SHOM REFMAR tide gauge, Roscoff (Act 3). The SOS endpoint answers
 * GetCapabilities only; real observations come from the open JSON flux.
 * Values are referenced to zéro hydrographique (chart datum) — shift to IGN69
 * for the scene via BATHYELLI + the gauge zero offset.
 */
export const REFMAR_GAUGE = {
  id: 54,
  name: 'ROSCOFF',
  coord: [-3.9657, 48.7184] as Coord,
  verticalRef: 'LAT' as VerticalDatum, // "zero_hydrographique" in the flux header
  /** e.g. `${observationJson}/54?sources=1&dtStart=…&dtEnd=…` (UTC, 31-day/request cap) */
  observationJson: 'https://services.data.shom.fr/maregraphie/observation/json',
  maxRequestDays: 31,
  attribution: 'SHOM — REFMAR (RONIM). Data © SHOM, https://doi.org/10.17183/REFMAR',
} as const

/** IGN LiDAR HD COPC (Act 2). Tile index via WFS; tiles are COPC .laz over HTTP range. */
export const LIDAR_HD = {
  wfs: 'https://data.geopf.fr/wfs/ows',
  wfsLayer: 'IGNF_NUAGES-DE-POINTS-LIDAR-HD:dalle',
  townCentreTile:
    'https://data.geopf.fr/telechargement/download/LiDARHD-NUALID/NUALHD_1-0__LAZ_LAMB93_BE_2025-09-22/LHD_FXX_0187_6869_PTS_LAMB93_IGN69.copc.laz',
  crsHorizontal: 'EPSG:2154', // Lambert-93
  verticalRef: 'IGN69' as VerticalDatum,
  attribution: 'IGN — LiDAR HD (Licence Ouverte / Etalab 2.0)',
} as const

/** SHOM products that need a (free) account download — Jon's manual step for Act 2. */
export const SHOM_ACCOUNT_GATED = {
  litto3dRegion: 'LITTO3D Finistère 2014',
  litto3dWfsGrid: 'LITTO3D_FINISTR_2014_GRILLE_WFS',
  bathyelliProduct: 'BATHYELLI v2.1 (ZH_ell)',
  portal: 'https://diffusion.shom.fr',
} as const

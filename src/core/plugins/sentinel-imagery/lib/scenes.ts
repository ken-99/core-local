export interface Scene {
  id: string
  label: string
  center: [number, number]
  zoom: number
}

export const SCENES: Scene[] = [
  { id: 'vancouver', label: 'Vancouver', center: [-123.12, 49.27], zoom: 9.5 },
  { id: 'toronto', label: 'Toronto', center: [-79.38, 43.7], zoom: 9.5 },
  { id: 'montreal', label: 'Montreal', center: [-73.57, 45.5], zoom: 9.5 },
]

export const EOX_S2CLOUDLESS_TILES =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg'

export const EOX_ATTRIBUTION =
  '<a href="https://s2maps.eu">Sentinel-2 cloudless 2022</a> by <a href="https://eox.at">EOX</a> (contains modified Copernicus Sentinel data 2022)'

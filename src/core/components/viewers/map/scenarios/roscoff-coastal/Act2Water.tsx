'use client'
import * as React from 'react'
import * as THREE from 'three'
import type maplibregl from 'maplibre-gl'
import type { CustomLayerInterface } from 'maplibre-gl'
import { SEA_POLYGON, WATER_COLOR, WATER_SAMPLE, ROSCOFF_CENTER } from './constants'
import { buildWaterMesh, type WaterGrid } from './act2'

interface Props {
  map: maplibregl.Map
  /** Water surface altitude (m) in the buildings/map vertical frame. */
  altitudeM: number
}

const LAYER_ID = 'roscoff-tide-water'
const R_LAT = 110_540
const R_LNG = 111_320
const [LNG0, LAT0] = ROSCOFF_CENTER
const KX = Math.cos((LAT0 * Math.PI) / 180)

/** WGS84 → local Y-up metres (x=east, z=−north) around ROSCOFF_CENTER. */
function toLocalXZ(lng: number, lat: number): [number, number] {
  return [(lng - LNG0) * R_LNG * KX, -(lat - LAT0) * R_LAT]
}

/** Ray-cast point-in-polygon against a closed WGS84 ring. */
function inPolygon(lng: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Flat fallback plane (fan over SEA_POLYGON) at y=0 — shown until the grid samples. */
function fallbackVerts(): number[] {
  const pts = SEA_POLYGON.map(([lng, lat]) => toLocalXZ(lng, lat))
  const verts: number[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    for (const idx of [0, i, i + 1]) verts.push(pts[idx][0], 0, pts[idx][1])
  }
  return verts
}

/** Sample grid: WaterGrid plus the per-point geo coords used to query the DEM. */
interface SampleGrid extends WaterGrid { lngs: number[]; lats: number[] }

/** Build the grid geometry (geo + local coords + sea mask); heights start NaN. */
function makeGrid(): { grid: SampleGrid; filled: boolean[] } {
  const [minLng, minLat, maxLng, maxLat] = WATER_SAMPLE.bbox
  const spanX = (maxLng - minLng) * R_LNG * KX
  const spanZ = (maxLat - minLat) * R_LAT
  const cols = Math.max(2, Math.round(spanX / WATER_SAMPLE.spacingM) + 1)
  const rows = Math.max(2, Math.round(spanZ / WATER_SAMPLE.spacingM) + 1)
  const lngs: number[] = []
  const lats: number[] = []
  const xs: number[] = []
  const zs: number[] = []
  for (let c = 0; c < cols; c++) {
    const lng = minLng + ((maxLng - minLng) * c) / (cols - 1)
    lngs.push(lng)
    xs.push(toLocalXZ(lng, minLat)[0])
  }
  for (let r = 0; r < rows; r++) {
    const lat = minLat + ((maxLat - minLat) * r) / (rows - 1)
    lats.push(lat)
    zs.push(toLocalXZ(minLng, lat)[1])
  }
  const cellInMask: boolean[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const cLng = (lngs[c] + lngs[c + 1]) / 2
      const cLat = (lats[r] + lats[r + 1]) / 2
      cellInMask.push(inPolygon(cLng, cLat, SEA_POLYGON))
    }
  }
  const h = new Array<number>(cols * rows).fill(Number.NaN)
  const filled = new Array<boolean>(cols * rows).fill(false)
  return { grid: { cols, rows, xs, zs, h, cellInMask, lngs, lats }, filled }
}

/**
 * Act 2 tide plane — a translucent water surface whose horizontal edge is the
 * terrain contour at the current tide height, so the sea recedes across the
 * foreshore instead of only rising in place. Samples the maptiler DEM once
 * (`queryTerrainElevation`, retried until its tiles load), then rebuilds the mesh
 * on each level change; falls back to a flat SEA_POLYGON plane until ready. Added
 * after the buildings layer so it overlays them; depthTest lets nearer building
 * parts occlude it. Mercator only.
 */
export const Act2Water: React.FC<Props> = ({ map, altitudeM }) => {
  const altRef = React.useRef(altitudeM)
  altRef.current = altitudeM

  React.useEffect(() => {
    if (!map) return
    let disposed = false
    const renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: map.getCanvas().getContext('webgl') as WebGLRenderingContext,
      antialias: true,
    })
    renderer.autoClear = false
    const camera = new THREE.Camera()
    const scene = new THREE.Scene()
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(fallbackVerts(), 3))
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WATER_COLOR), transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    })
    scene.add(new THREE.Mesh(geom, mat))
    const _m = new THREE.Matrix4()
    const _l = new THREE.Matrix4()

    const { grid, filled } = makeGrid()
    let ready = false
    let lastAlt = Number.NaN

    // Fill the grid's terrain heights from the DEM; returns true once complete.
    // queryTerrainElevation returns null for a not-yet-loaded tile, so retry.
    const trySample = (): boolean => {
      let allDone = true
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const idx = r * grid.cols + c
          if (filled[idx]) continue
          const e = map.queryTerrainElevation([grid.lngs[c], grid.lats[r]])
          if (e == null) { allDone = false; continue }
          grid.h[idx] = e
          filled[idx] = true
        }
      }
      return allDone
    }

    const layer: CustomLayerInterface = {
      id: LAYER_ID, type: 'custom', renderingMode: '3d',
      render(_gl, args) {
        if (disposed) return
        if (!ready && trySample()) { ready = true; lastAlt = Number.NaN }
        if (ready && altRef.current !== lastAlt) {
          lastAlt = altRef.current
          geom.setAttribute('position',
            new THREE.Float32BufferAttribute(buildWaterMesh(grid, altRef.current), 3))
        }
        const modelMatrix = map.transform.getMatrixForModel(ROSCOFF_CENTER as [number, number], altRef.current)
        _m.fromArray((args as { defaultProjectionData: { mainMatrix: number[] } }).defaultProjectionData.mainMatrix)
        _l.fromArray(modelMatrix)
        camera.projectionMatrix.multiplyMatrices(_m, _l)
        renderer.resetState()
        renderer.render(scene, camera)
        map.triggerRepaint()
      },
    }
    if (!map.getLayer(LAYER_ID)) map.addLayer(layer)

    return () => {
      disposed = true
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      geom.dispose(); mat.dispose(); renderer.dispose()
    }
  }, [map])

  // Altitude changes ride the ref + a repaint (the render loop rebuilds the mesh).
  React.useEffect(() => { map?.triggerRepaint() }, [map, altitudeM])
  return null
}
Act2Water.displayName = 'Act2Water'

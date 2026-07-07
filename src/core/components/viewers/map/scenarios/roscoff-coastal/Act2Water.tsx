'use client'
import * as React from 'react'
import * as THREE from 'three'
import type maplibregl from 'maplibre-gl'
import type { CustomLayerInterface } from 'maplibre-gl'
import { SEA_POLYGON, WATER_COLOR, ROSCOFF_CENTER } from './constants'

interface Props {
  map: maplibregl.Map
  /** Water surface altitude (m) in the buildings/map vertical frame. */
  altitudeM: number
}

const LAYER_ID = 'roscoff-tide-water'
const R_LAT = 110_540
const R_LNG = 111_320

/** WGS84 ring → local Y-up metres (x=east, z=-north) around ROSCOFF_CENTER. */
function ringToLocal(): number[] {
  const [lng0, lat0] = ROSCOFF_CENTER
  const k = Math.cos((lat0 * Math.PI) / 180)
  const pts: [number, number][] = SEA_POLYGON.map(([lng, lat]) => [
    (lng - lng0) * R_LNG * k, -(lat - lat0) * R_LAT,
  ])
  // Fan-triangulate (the polygon is convex): (0,i,i+1). y=0 for all.
  const verts: number[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    for (const idx of [0, i, i + 1]) verts.push(pts[idx][0], 0, pts[idx][1])
  }
  return verts
}

/**
 * Act 2 tide plane — a translucent horizontal water surface at `altitudeM`,
 * bounded to SEA_POLYGON, rendered as its own maplibre custom 3D layer. Added
 * after the buildings layer so it overlays them; depthTest lets building parts
 * in front of the water occlude it. Mercator only.
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
    geom.setAttribute('position', new THREE.Float32BufferAttribute(ringToLocal(), 3))
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WATER_COLOR), transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    })
    scene.add(new THREE.Mesh(geom, mat))
    const _m = new THREE.Matrix4()
    const _l = new THREE.Matrix4()

    const layer: CustomLayerInterface = {
      id: LAYER_ID, type: 'custom', renderingMode: '3d',
      render(_gl, args) {
        if (disposed) return
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

  // Altitude changes ride the ref + a repaint; no layer rebuild.
  React.useEffect(() => { map?.triggerRepaint() }, [map, altitudeM])
  return null
}
Act2Water.displayName = 'Act2Water'

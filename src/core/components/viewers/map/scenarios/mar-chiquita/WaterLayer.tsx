'use client'
import * as React from 'react'
import * as THREE from 'three'
import type maplibregl from 'maplibre-gl'
import type { CustomLayerInterface } from 'maplibre-gl'
import { buildWaterMesh } from './waterMesh'
import gridJson from './marChiquitaGrid'
import { WATER_COLOR } from './constants'

export const WATER_LAYER_ID = 'mar-chiquita-water'
const CENTER = gridJson.center as [number, number]
const grid = gridJson

interface Props { map: maplibregl.Map; level: number }

/**
 * Translucent water surface at `level` (m), rebuilt from the DEM grid so its
 * horizontal edge is the real iso-height contour. Rendered as its own MapLibre
 * custom 3D layer. Mercator only.
 */
export const WaterLayer: React.FC<Props> = ({ map, level }) => {
  const levelRef = React.useRef(level)
  levelRef.current = level

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
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WATER_COLOR), transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    })
    scene.add(new THREE.Mesh(geom, mat))
    const _m = new THREE.Matrix4()
    const _l = new THREE.Matrix4()

    // Rebuild geometry only when the level actually changes.
    let builtLevel = Number.NaN
    const rebuild = (lvl: number) => {
      geom.setAttribute('position', new THREE.Float32BufferAttribute(buildWaterMesh(grid, lvl), 3))
      geom.attributes.position.needsUpdate = true
      builtLevel = lvl
    }

    const layer: CustomLayerInterface = {
      id: WATER_LAYER_ID, type: 'custom', renderingMode: '3d',
      render(_gl, args) {
        if (disposed) return
        if (levelRef.current !== builtLevel) rebuild(levelRef.current)
        const modelMatrix = map.transform.getMatrixForModel(CENTER, levelRef.current)
        _m.fromArray((args as { defaultProjectionData: { mainMatrix: number[] } }).defaultProjectionData.mainMatrix)
        _l.fromArray(modelMatrix)
        camera.projectionMatrix.multiplyMatrices(_m, _l)
        renderer.resetState()
        renderer.render(scene, camera)
        map.triggerRepaint()
      },
    }
    if (!map.getLayer(WATER_LAYER_ID)) map.addLayer(layer)

    return () => {
      disposed = true
      if (map.getLayer(WATER_LAYER_ID)) map.removeLayer(WATER_LAYER_ID)
      geom.dispose(); mat.dispose(); renderer.dispose()
    }
  }, [map])

  React.useEffect(() => { map?.triggerRepaint() }, [map, level])
  return null
}
WaterLayer.displayName = 'WaterLayer'

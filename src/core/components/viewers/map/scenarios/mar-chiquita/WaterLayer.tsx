'use client'
import * as React from 'react'
import * as THREE from 'three'
import type maplibregl from 'maplibre-gl'
import type { CustomLayerInterface } from 'maplibre-gl'
import { buildWaterMesh } from './waterMesh'
import { waterDepthRgba } from './waterShading'
import gridJson from './marChiquitaGrid'

export const WATER_LAYER_ID = 'mar-chiquita-water'
const CENTER = gridJson.center as [number, number]
const grid = gridJson

interface Props { map: maplibregl.Map; level: number }

/**
 * Translucent water surface at `level` (m), rebuilt from the DEM grid so its
 * horizontal edge is the real iso-height contour, and shaded by depth so the
 * edge stays sheer over sand while deep water reads solid. Rendered as its own
 * MapLibre custom 3D layer. Mercator only.
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
    // Colour and opacity both come from the per-vertex RGBA, so the material
    // stays neutral — white at full opacity multiplies through unchanged.
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true,
      side: THREE.DoubleSide, depthWrite: false,
    })
    scene.add(new THREE.Mesh(geom, mat))
    const _m = new THREE.Matrix4()
    const _l = new THREE.Matrix4()
    const _c = new THREE.Color()

    // Rebuild geometry only when the level actually changes.
    let builtLevel = Number.NaN
    const rebuild = (lvl: number) => {
      const { positions, depths } = buildWaterMesh(grid, lvl)
      const colors = new Float32Array(depths.length * 4)
      for (let i = 0; i < depths.length; i++) {
        const [r, g, b, a] = waterDepthRgba(depths[i])
        // The ramp is mixed in sRGB (as tuned in the preview). Say so — three's
        // working space is linear, and unconverted values wash the water out.
        _c.setRGB(r, g, b, THREE.SRGBColorSpace)
        colors[i * 4] = _c.r
        colors[i * 4 + 1] = _c.g
        colors[i * 4 + 2] = _c.b
        colors[i * 4 + 3] = a
      }
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
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
        // No triggerRepaint here — it would redraw at 60fps forever. The effect
        // below already repaints when the level changes, so the map can idle.
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

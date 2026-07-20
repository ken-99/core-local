'use client'
import * as React from 'react'
import * as THREE from 'three'
import type maplibregl from 'maplibre-gl'
import type { CustomLayerInterface } from 'maplibre-gl'
import { buildTerrainMesh } from './terrainMesh'
import { buildWaterMesh } from './waterMesh'
import { waterDepthRgba } from './waterShading'
import { heightRampColor, hillshade } from './terrainShading'
import gridJson from './marChiquitaGrid'
import { EXAGGERATION, ORTHO_COORDINATES, HEIGHT_TINT_STRENGTH, ORTHO_IMAGE_URL } from './constants'

export const SCENE_LAYER_ID = 'mar-chiquita-scene'
const CENTER = gridJson.center as [number, number]
const grid = gridJson

interface SceneProps { map: maplibregl.Map; level: number; photo: boolean; hillshade: boolean; height: boolean }

/**
 * The whole Mar Chiquita scene as one MapLibre custom 3D layer: the drone DEM as
 * a ground mesh and the water as a second mesh, in one three.js scene sharing one
 * depth buffer — so higher ground correctly hides water behind it. Mercator only.
 */
export const MarChiquitaScene: React.FC<SceneProps> = ({ map, level, photo, hillshade: hillshadeOn, height }) => {
  const levelRef = React.useRef(level)
  levelRef.current = level
  const flagsRef = React.useRef({ photo, hillshade: hillshadeOn, height })
  flagsRef.current = { photo, hillshade: hillshadeOn, height }

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

    // Terrain: opaque, writes depth. Composites photo / colour-by-height / hillshade.
    const terrain = buildTerrainMesh(grid, { exaggeration: EXAGGERATION, ortho: ORTHO_COORDINATES })
    const terrainGeom = new THREE.BufferGeometry()
    terrainGeom.setAttribute('position', new THREE.Float32BufferAttribute(terrain.positions, 3))
    terrainGeom.setAttribute('normal', new THREE.Float32BufferAttribute(terrain.normals, 3))

    // Bake per-vertex height-ramp colour and hillshade brightness from the mesh's
    // own (real, un-exaggerated) heights and exaggerated-relief normals.
    const vertCount = terrain.positions.length / 3
    const heightColors = new Float32Array(vertCount * 3)
    const shades = new Float32Array(vertCount)
    const _hc = new THREE.Color()
    for (let i = 0; i < vertCount; i++) {
      const realHeight = terrain.positions[i * 3 + 1] / EXAGGERATION
      const [r, g, b] = heightRampColor(realHeight)
      _hc.setRGB(r, g, b, THREE.SRGBColorSpace) // ramp is sRGB
      heightColors[i * 3] = _hc.r; heightColors[i * 3 + 1] = _hc.g; heightColors[i * 3 + 2] = _hc.b
      shades[i] = hillshade([terrain.normals[i * 3], terrain.normals[i * 3 + 1], terrain.normals[i * 3 + 2]])
    }
    terrainGeom.setAttribute('uv', new THREE.Float32BufferAttribute(terrain.uvs, 2))
    terrainGeom.setAttribute('heightColor', new THREE.Float32BufferAttribute(heightColors, 3))
    terrainGeom.setAttribute('shade', new THREE.Float32BufferAttribute(shades, 1))

    // Ortho drape: georeferenced aerial photo, UVs already have v=0 at the north edge.
    // UVs are left unclamped — samples outside the ortho rectangle rely on three's
    // default ClampToEdge wrapping (edge smear, not a wrapped tile). The surveyed
    // diamond sits well inside the ortho, so nothing visible depends on it today;
    // if the wrapping mode ever changes here, clamp uOf/vOf in terrainMesh instead.
    const photoTex = new THREE.TextureLoader().load(ORTHO_IMAGE_URL, () => map.triggerRepaint())
    photoTex.colorSpace = THREE.SRGBColorSpace
    photoTex.flipY = false

    const terrainMat = new THREE.ShaderMaterial({
      // DoubleSide is deliberate, not laziness: buildTerrainMesh winds each cell
      // A,B,C / A,C,D in a frame where x=east and z=−north, which puts the front
      // face DOWN. With FrontSide the ground would be culled away entirely.
      side: THREE.DoubleSide, depthWrite: true, depthTest: true,
      uniforms: {
        uPhoto: { value: photoTex },
        uShowPhoto: { value: 1 },
        uShowHillshade: { value: 0 },
        uShowHeight: { value: 0 },
        uTint: { value: HEIGHT_TINT_STRENGTH },
        uGrey: { value: new THREE.Color(0x9c9c94) },
      },
      vertexShader: `
        attribute vec3 heightColor;
        attribute float shade;
        varying vec2 vUv;
        varying vec3 vHeightColor;
        varying float vShade;
        void main() {
          vUv = uv;
          vHeightColor = heightColor;
          vShade = shade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uPhoto;
        uniform float uShowPhoto, uShowHillshade, uShowHeight, uTint;
        uniform vec3 uGrey;
        varying vec2 vUv;
        varying vec3 vHeightColor;
        varying float vShade;
        void main() {
          vec3 photo = texture2D(uPhoto, vUv).rgb;
          vec3 base = uGrey;
          if (uShowPhoto > 0.5 && uShowHeight > 0.5) base = mix(photo, vHeightColor, uTint);
          else if (uShowPhoto > 0.5) base = photo;
          else if (uShowHeight > 0.5) base = vHeightColor;
          float shade = (uShowHillshade > 0.5) ? vShade : 1.0;
          gl_FragColor = vec4(base * shade, 1.0);
        }
      `,
    })
    scene.add(new THREE.Mesh(terrainGeom, terrainMat))

    // Water: translucent, tests depth but does not write it, lifted to the level.
    const waterGeom = new THREE.BufferGeometry()
    const waterMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, side: THREE.DoubleSide,
      depthWrite: false, depthTest: true,
    })
    const waterMesh = new THREE.Mesh(waterGeom, waterMat)
    scene.add(waterMesh)

    // The water is rebuilt on every level change, and Play changes the level every
    // frame — so the buffers are allocated ONCE at worst case and written in place.
    // Replacing a BufferAttribute instead would strand its GPU buffer: three.js only
    // frees the buffers a geometry still holds when you dispose it, and this WebGL
    // context belongs to MapLibre and outlives us, so nothing would ever reclaim them.
    //
    // Worst case per cell: 2 terrain triangles, each clipped against one plane to at
    // most a quad, each quad fanned to 2 triangles = 12 vertices.
    const MAX_VERTS_PER_CELL = 12
    const maxWaterVerts = grid.cellInMask.reduce((n, on) => (on ? n + MAX_VERTS_PER_CELL : n), 0)
    const waterPos = new THREE.Float32BufferAttribute(new Float32Array(maxWaterVerts * 3), 3)
    const waterCol = new THREE.Float32BufferAttribute(new Float32Array(maxWaterVerts * 4), 4)
    waterPos.setUsage(THREE.DynamicDrawUsage)
    waterCol.setUsage(THREE.DynamicDrawUsage)
    waterGeom.setAttribute('position', waterPos)
    waterGeom.setAttribute('color', waterCol)

    const _c = new THREE.Color()
    let builtLevel = Number.NaN
    const rebuildWater = (lvl: number) => {
      const { positions, depths } = buildWaterMesh(grid, lvl)
      const n = Math.min(depths.length, maxWaterVerts)
      const pos = waterPos.array as Float32Array
      const col = waterCol.array as Float32Array
      for (let i = 0; i < n; i++) {
        pos[i * 3] = positions[i * 3]
        pos[i * 3 + 1] = positions[i * 3 + 1]
        pos[i * 3 + 2] = positions[i * 3 + 2]
        const [r, g, b, a] = waterDepthRgba(depths[i])
        _c.setRGB(r, g, b, THREE.SRGBColorSpace)
        col[i * 4] = _c.r; col[i * 4 + 1] = _c.g; col[i * 4 + 2] = _c.b; col[i * 4 + 3] = a
      }
      // Upload only the part in use, not the whole worst-case buffer.
      waterPos.clearUpdateRanges(); waterPos.addUpdateRange(0, n * 3); waterPos.needsUpdate = true
      waterCol.clearUpdateRanges(); waterCol.addUpdateRange(0, n * 4); waterCol.needsUpdate = true
      waterGeom.setDrawRange(0, n)
      waterMesh.position.y = lvl * EXAGGERATION // lift the flat footprint into the frame
      builtLevel = lvl
    }

    const _m = new THREE.Matrix4()
    const _l = new THREE.Matrix4()
    const layer: CustomLayerInterface = {
      id: SCENE_LAYER_ID, type: 'custom', renderingMode: '3d',
      render(_gl, args) {
        if (disposed) return
        if (levelRef.current !== builtLevel) rebuildWater(levelRef.current)
        terrainMat.uniforms.uShowPhoto.value = flagsRef.current.photo ? 1 : 0
        terrainMat.uniforms.uShowHillshade.value = flagsRef.current.hillshade ? 1 : 0
        terrainMat.uniforms.uShowHeight.value = flagsRef.current.height ? 1 : 0
        const modelMatrix = map.transform.getMatrixForModel(CENTER, 0)
        _m.fromArray((args as { defaultProjectionData: { mainMatrix: number[] } }).defaultProjectionData.mainMatrix)
        _l.fromArray(modelMatrix)
        camera.projectionMatrix.multiplyMatrices(_m, _l)
        renderer.resetState()
        renderer.render(scene, camera)
      },
    }
    if (!map.getLayer(SCENE_LAYER_ID)) map.addLayer(layer)

    return () => {
      disposed = true
      if (map.getLayer(SCENE_LAYER_ID)) map.removeLayer(SCENE_LAYER_ID)
      terrainGeom.dispose(); terrainMat.dispose(); photoTex.dispose()
      waterGeom.dispose(); waterMat.dispose(); renderer.dispose()
    }
  }, [map])

  React.useEffect(() => { map?.triggerRepaint() }, [map, level])
  React.useEffect(() => { map?.triggerRepaint() }, [map, photo, hillshadeOn, height])
  return null
}
MarChiquitaScene.displayName = 'MarChiquitaScene'

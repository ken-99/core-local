"""Collect roofer's CityJSONSeq (LOD2.2) and emit ONE georeferenced glb for the
Roscoff Act-2 scene, placed on the CDT map via CustomModelLayer.

Roscoff source frame:  horizontal EPSG:2154 (Lambert-93), vertical IGN69 metres
(vertex_int * transform.scale + transform.translate).

CustomModelLayer loads the glb and places it with maplibre `getMatrixForModel`,
which expects a Y-up glTF model in local metres at a given lng/lat. So we:
  - drop the whole town into one local ENU frame in metres, origin = AOI centroid,
    base at y=0 (subtract min Z),
  - remap CityJSON (E, N, Z up) -> glTF (x=E-E0, y=Z-Zmin, z=-(N-N0)),
  - colour faces by semantic surface (wall / roof / ground),
  - write roscoff-buildings.glb + placement.json {lng, lat, ground_z_ign69}.

Run: <halifax-venv-python> build_buildings_glb.py ../data/output/<stem>.city.jsonl
Outputs (in the same dir as the input): roscoff-buildings.glb, placement.json
"""
import json, sys, os, struct
import numpy as np
import trimesh
import mapbox_earcut as earcut
from pyproj import Transformer


def add_matte_material(glb_path):
    """trimesh exports the mesh with per-face vertex colours but NO material, so
    glTF viewers fall back to the spec default PBR material (metalness=1). A fully
    metallic surface with no environment map has no diffuse response — it only
    catches direct specular, so every face angled away from a light renders black.

    Inject one matte material (metalness 0, roughness 1, white base, double-sided)
    and point every primitive at it. COLOR_0 multiplies the white base, so the
    per-face wall/roof colours are unchanged — only the shading is fixed."""
    buf = open(glb_path, 'rb').read()
    assert buf[:4] == b'glTF', 'not a binary glTF'
    json_len = struct.unpack_from('<I', buf, 12)[0]
    doc = json.loads(buf[20:20 + json_len].decode('utf-8'))
    doc['materials'] = [{
        'name': 'roscoff-matte',
        'pbrMetallicRoughness': {
            'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 1.0,
        },
        'doubleSided': True,
    }]
    for m in doc.get('meshes', []):
        for p in m.get('primitives', []):
            p['material'] = 0
    new_json = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    new_json += b' ' * ((4 - len(new_json) % 4) % 4)   # pad JSON chunk to 4 bytes
    bin_chunk = buf[20 + json_len:]                     # BIN chunk header + data, unchanged
    total = 12 + 8 + len(new_json) + len(bin_chunk)
    out = (b'glTF' + struct.pack('<III', 2, total, len(new_json)) + b'JSON'
           + new_json + bin_chunk)
    open(glb_path, 'wb').write(out)

SRC_CRS = 'EPSG:2154'          # Lambert-93 (horizontal); Z = IGN69 metres
OUT_NAME = 'roscoff-buildings.glb'
COL = {'WallSurface': [190, 190, 185, 255],
       'RoofSurface': [156, 84, 66, 255],
       'GroundSurface': [90, 90, 90, 255]}


def load_seq(path):
    """CityJSONSeq: line 0 = header w/ global transform, rest = CityJSONFeature."""
    lines = [l for l in open(path).read().splitlines() if l.strip()]
    return json.loads(lines[0]), [json.loads(l) for l in lines[1:]]


def reindex(b, off):
    return b + off if isinstance(b, int) else [reindex(x, off) for x in b]


def collect(header, feats):
    """Merge the feature stream into one {transform, vertices, CityObjects}."""
    tr = header['transform']
    cj = {'transform': tr, 'CityObjects': {}, 'vertices': []}
    offset = 0
    for f in feats:
        for cid, co in f['CityObjects'].items():
            co2 = json.loads(json.dumps(co))
            for g in co2.get('geometry', []):
                g['boundaries'] = reindex(g['boundaries'], offset)
            cj['CityObjects'][cid] = co2
        cj['vertices'].extend(f['vertices'])
        offset += len(f['vertices'])
    return cj


def faces_of(geom):
    surfaces = geom.get('semantics', {}).get('surfaces', [])
    values = geom.get('semantics', {}).get('values')
    if values is None:
        return
    if geom['type'] == 'Solid':
        for si, shell in enumerate(geom['boundaries']):
            for fi, face in enumerate(shell):
                yield face[0], surfaces[values[si][fi]]['type']
    else:
        for fi, face in enumerate(geom['boundaries']):
            yield face[0], surfaces[values[fi]]['type']


def triangulate(ring_xyz):
    """Triangulate a planar 3D ring -> index triples into ring_xyz."""
    p = np.asarray(ring_xyz, float)
    if len(p) < 3:
        return []
    n = np.zeros(3)
    for i in range(len(p)):
        a, b = p[i], p[(i + 1) % len(p)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    if np.linalg.norm(n) == 0:
        return []
    n /= np.linalg.norm(n)
    u = np.cross(n, [0, 0, 1] if abs(n[2]) < 0.9 else [1, 0, 0]); u /= np.linalg.norm(u)
    v = np.cross(n, u)
    p2 = np.column_stack([p @ u, p @ v]).astype(np.float64)
    try:
        idx = earcut.triangulate_float64(p2, np.array([len(p2)]))
    except Exception:
        return []
    return [tuple(idx[i:i + 3]) for i in range(0, len(idx), 3)]


def main():
    src = sys.argv[1]
    lod = sys.argv[2] if len(sys.argv) > 2 else '2.2'
    outdir = os.path.dirname(os.path.abspath(src))

    header, feats = load_seq(src)
    d = collect(header, feats)
    tr = d['transform']; s = tr['scale']; t = tr['translate']
    V = np.array(d['vertices'], float) * np.array(s) + np.array(t)  # E, N, Z(IGN69)

    E0, N0 = V[:, 0].mean(), V[:, 1].mean()
    Zmin = V[:, 2].min()

    # Reproject every vertex into a TRUE-NORTH local ENU frame in metres, origin =
    # AOI centroid. Placing raw Lambert-93 metres directly slews the model ~5.2°
    # off the map (Lambert-93 grid north != true north here — meridian
    # convergence), which is why the footprints didn't line up. An azimuthal
    # equidistant projection centred on the origin gives exact east/north metres
    # aligned to the ENU frame getMatrixForModel expects.
    to_wgs = Transformer.from_crs(SRC_CRS, 'EPSG:4326', always_xy=True)
    lon0, lat0 = to_wgs.transform(E0, N0)
    aeqd = Transformer.from_crs(
        SRC_CRS, f'+proj=aeqd +lat_0={lat0} +lon_0={lon0} +datum=WGS84 +units=m',
        always_xy=True)
    east, north = aeqd.transform(V[:, 0], V[:, 1])
    # CityJSON (E,N,Z) -> glTF (x=East, y=Up, z=-North), local metres, base at y=0.
    ENU = np.column_stack([east, V[:, 2] - Zmin, -np.asarray(north, float)])

    # Each building keeps its REAL relative IGN69 height (ENU already subtracted the
    # global minimum Z), so the sloped coastal town sits on the terrain at true
    # elevations — which is what the tidal flood needs (low harbour-front floods
    # first, high inland stays dry). Terrain is enabled for Act 2 so the ground
    # rises to meet each building.
    verts, faces, fcol = [], [], []
    for cid, co in d['CityObjects'].items():
        for g in co.get('geometry', []):
            if str(g.get('lod')) != lod:
                continue
            for ring_idx, typ in faces_of(g):
                ring = ENU[ring_idx]
                base = len(verts)
                for vx in ring:
                    verts.append(vx.tolist())
                for (a, b, c) in triangulate(ring):
                    faces.append([base + a, base + b, base + c])
                    fcol.append(COL.get(typ, [200, 200, 200, 255]))

    mesh = trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    mesh.visual.face_colors = np.array(fcol, dtype=np.uint8)
    mesh.fix_normals()
    glb = os.path.join(outdir, OUT_NAME)
    mesh.export(glb)
    add_matte_material(glb)   # give it a matte PBR material so faces aren't lit black

    n_buildings = sum(1 for c in d['CityObjects'].values() if c.get('type') == 'BuildingPart')
    placement = {'lng': round(lon0, 7), 'lat': round(lat0, 7),
                 'ground_z_ign69': round(float(Zmin), 2),
                 'crs_source': SRC_CRS + ' (H) + IGN69 (V)',
                 'buildings': n_buildings,
                 'note': 'glb is Y-up local metres, base at y=0; place at lng/lat via getMatrixForModel'}
    json.dump(placement, open(os.path.join(outdir, 'placement.json'), 'w'), indent=1)
    print(f'wrote {glb}  ({len(faces)} tris, {len(verts)} verts, {n_buildings} buildings)')
    print('placement:', placement)


if __name__ == '__main__':
    main()

// Reproducible data pipeline for the Iqaluit demo's land/water layer.
//
//   node build-coastline.mjs            # fetch + bake iqaluitCoastline.json
//   node build-coastline.mjs --routes   # also auto-route vessels through open water
//
// Source: OpenStreetMap (© OpenStreetMap contributors, ODbL) via the Overpass API.
// One-time/offline build — the app ships only the baked JSON fixture (no runtime egress).
// Requires @turf/turf (a core dependency). Run from the core repo root.
import { writeFileSync, statSync } from 'node:fs'
import * as turf from '@turf/turf'

const OUT = 'src/core/components/viewers/map/scenarios/iqaluit-incident/iqaluitCoastline.json'
const BBOX = [63.60, -68.72, 63.80, -68.28]      // s,w,n,e — Iqaluit / inner Frobisher Bay
const CLIP = [-68.62, 63.62, -68.26, 63.76]      // w,s,e,n — keep only the demo area
const TOL = 0.00018                              // Douglas-Peucker tolerance (~18 m)

async function fetchCoastline() {
  const q = `[out:json][timeout:90];(way["natural"="coastline"](${BBOX.join(',')}););out geom;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'cdt-iqaluit-demo/1.0', 'Accept': 'application/json' },
    body: 'data=' + encodeURIComponent(q),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  return res.json()
}

function bake(osm) {
  const ways = (osm.elements || []).filter(e => e.type === 'way' && e.geometry?.length > 1)
  const overlaps = c => { let w=180,s=90,e=-180,n=-90; for (const [lo,la] of c){ if(lo<w)w=lo; if(lo>e)e=lo; if(la<s)s=la; if(la>n)n=la } return !(e<CLIP[0]||w>CLIP[2]||n<CLIP[1]||s>CLIP[3]) }
  const round = ([lo,la]) => [Math.round(lo*1e5)/1e5, Math.round(la*1e5)/1e5]
  const feats = []
  for (const wy of ways) {
    const coords = wy.geometry.map(g => [g.lon, g.lat])
    if (!overlaps(coords)) continue
    let f = turf.simplify({ type:'Feature', properties:{}, geometry:{ type:'LineString', coordinates: coords } }, { tolerance: TOL, highQuality: true, mutate: true })
    f.geometry.coordinates = f.geometry.coordinates.map(round)
    feats.push(f)
  }
  const fc = { type:'FeatureCollection', attribution:'© OpenStreetMap contributors (ODbL)', features: feats }
  writeFileSync(OUT, JSON.stringify(fc))
  console.log(`baked ${feats.length} ways -> ${OUT} (${statSync(OUT).size} bytes)`)
  return fc
}

// In-water test + greedy water-walker (used to regenerate vessel paths).
function routeVessels(fc) {
  const islands = [], lines = []
  for (const f of fc.features) { const c = f.geometry.coordinates; lines.push(turf.lineString(c)); if (c.length>3 && c[0][0]===c.at(-1)[0] && c[0][1]===c.at(-1)[1]) islands.push(turf.polygon([c])) }
  const minCoastKm = p => Math.min(...lines.map(l => turf.pointToLineDistance(p, l, { units:'kilometers' })))
  const inBay = p => p[1]<=63.732 && p[0]>=-68.55 && p[0]<=-68.27 && p[1]>=63.638
  const water = (p,m) => inBay(p) && !islands.some(pg => turf.booleanPointInPolygon(p,pg)) && minCoastKm(p) >= m
  const segClean = (a,b) => { for (let s=0;s<=8;s++){ const u=s/8, p=[a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u]; if(!water(p,0.13)) return false } return true }
  const rnd = x => Math.round(x*1e5)/1e5
  const build = (start,brg,steps) => { let path=[start.map(rnd)], cur=start, b=brg
    for (let i=0;i<steps;i++){ let best=null,bb=b
      for (const da of [0,-18,18,-36,36,-54,54]) { for (const d of [0.9,0.7,0.5]) { const c=turf.destination(cur,d,b+da,{units:'kilometers'}).geometry.coordinates; if(water(c,0.16)&&segClean(cur,c)){best=c;bb=b+da*0.5;break} } if(best)break }
      if(!best)break; path.push(best.map(rnd)); cur=best; b=bb } return path }
  const seeds = [ {s:[-68.290,63.668],b:315},{s:[-68.500,63.715],b:160},{s:[-68.300,63.690],b:120},{s:[-68.460,63.690],b:300} ]
  seeds.forEach(({s,b},i) => console.log(`sea-${i+1}:`, JSON.stringify(build(s,b,7))))
}

const osm = await fetchCoastline()
const fc = bake(osm)
if (process.argv.includes('--routes')) routeVessels(fc)

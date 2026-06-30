import { BUILT_IN_MAP_STYLES } from './mapStyleCatalog'

const PREFIX =
  'https://cdtminiodevcluster.ca-east.onfullhost.cloud/pointclouds-demo/cdt-basemap-test-v1'

describe('BUILT_IN_MAP_STYLES — CDT Basemap entries', () => {
  it('includes the light, dark, swisstopo, and the three new cartographic CDT Basemap styles', () => {
    const names = BUILT_IN_MAP_STYLES.map(s => s.name)
    expect(names).toContain('CDT Basemap (light)')
    expect(names).toContain('CDT Basemap (dark)')
    expect(names).toContain('CDT Basemap (swisstopo)')
    expect(names).toContain('CDT Basemap (USGS Quad)')
    expect(names).toContain('CDT Basemap (Bartholomew)')
    expect(names).toContain('CDT Basemap (OS Landranger)')
  })

  it('includes the four oceanographic CDT Basemap styles', () => {
    const names = BUILT_IN_MAP_STYLES.map(s => s.name)
    expect(names).toContain('CDT Basemap (cmocean Deep)')
    expect(names).toContain('CDT Basemap (cmocean Thermal)')
    expect(names).toContain('CDT Basemap (GEBCO Bathymetric)')
    expect(names).toContain('CDT Basemap (Topobathy)')
  })

  it('points each CDT Basemap entry at its public MinIO style URL', () => {
    const byName = (name: string) => BUILT_IN_MAP_STYLES.find(s => s.name === name)?.url
    expect(byName('CDT Basemap (light)')).toBe(`${PREFIX}/cdt-basemap-light.minio.json`)
    expect(byName('CDT Basemap (dark)')).toBe(`${PREFIX}/cdt-basemap-dark.minio.json`)
    expect(byName('CDT Basemap (swisstopo)')).toBe(`${PREFIX}/cdt-basemap-swisstopo.json`)
    expect(byName('CDT Basemap (USGS Quad)')).toBe(`${PREFIX}/cdt-basemap-usgs-quad.json`)
    expect(byName('CDT Basemap (Bartholomew)')).toBe(`${PREFIX}/cdt-basemap-bartholomew.json`)
    expect(byName('CDT Basemap (OS Landranger)')).toBe(`${PREFIX}/cdt-basemap-os-landranger.json`)
    expect(byName('CDT Basemap (cmocean Deep)')).toBe(`${PREFIX}/cdt-basemap-cmocean-deep.json`)
    expect(byName('CDT Basemap (cmocean Thermal)')).toBe(`${PREFIX}/cdt-basemap-cmocean-thermal.json`)
    expect(byName('CDT Basemap (GEBCO Bathymetric)')).toBe(`${PREFIX}/cdt-basemap-gebco.json`)
    expect(byName('CDT Basemap (Topobathy)')).toBe(`${PREFIX}/cdt-basemap-topobathy.json`)
  })

  it('includes the GEBCO WMS bathymetry stand-in pointing at the app-hosted style', () => {
    const entry = BUILT_IN_MAP_STYLES.find(s => s.name === 'CDT Bathymetry (GEBCO WMS)')
    expect(entry).toBeDefined()
    expect(entry?.url).toBe('/mapStyles/cdt-bathy-gebco-wms.json')
  })

  it('keeps Satellite as the default (first) style', () => {
    expect(BUILT_IN_MAP_STYLES[0].name).toBe('Satellite')
  })
})

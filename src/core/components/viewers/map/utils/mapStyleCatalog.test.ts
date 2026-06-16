import { BUILT_IN_MAP_STYLES } from './mapStyleCatalog'

const PREFIX =
  'https://cdtminiodevcluster.ca-east.onfullhost.cloud/pointclouds-demo/cdt-basemap-test-v1'

describe('BUILT_IN_MAP_STYLES — CDT Basemap entries', () => {
  it('includes the light and dark CDT Basemap styles', () => {
    const names = BUILT_IN_MAP_STYLES.map(s => s.name)
    expect(names).toContain('CDT Basemap (light)')
    expect(names).toContain('CDT Basemap (dark)')
  })

  it('points each CDT Basemap entry at its public MinIO style URL', () => {
    const light = BUILT_IN_MAP_STYLES.find(s => s.name === 'CDT Basemap (light)')
    const dark = BUILT_IN_MAP_STYLES.find(s => s.name === 'CDT Basemap (dark)')
    expect(light?.url).toBe(`${PREFIX}/cdt-basemap-light.minio.json`)
    expect(dark?.url).toBe(`${PREFIX}/cdt-basemap-dark.minio.json`)
  })

  it('keeps Satellite as the default (first) style', () => {
    expect(BUILT_IN_MAP_STYLES[0].name).toBe('Satellite')
  })
})

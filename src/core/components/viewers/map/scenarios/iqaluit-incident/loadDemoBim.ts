import type { DbFile } from '../../../../../types/dbTypes'

/**
 * Building whose uploaded .frag/.ifc model the demo loads onto the map. Set to a real
 * Carleton building (MacOdrum Library, building 3267 — `cdc-MacOdrum_Library-arch.frag`)
 * discovered live in the CDT-DEV org via GET /api/files. Swap to any other building id
 * that has a model (e.g. 3237 Paterson Hall, 3234 Visualization & Simulation). `null`
 * → no real model → the caller shows the synthetic massing fallback instead. NOTE: the
 * id is org-scoped — only resolves for sessions in the org that owns the model.
 */
export const DEMO_BUILDING_ID: number | null = 3267

/**
 * Fetch a real BIM model file for the demo building. Calls the existing authenticated
 * route GET /api/files/building/{id}, which returns `{ files: DbFile[] }` — each file
 * carrying a freshly-minted presigned MinIO URL (so it must be fetched at runtime,
 * never hardcoded). Prefers a .frag (directly map-renderable) over a .ifc. Returns
 * null on any miss so the caller can fall back to synthetic massing — never throws.
 */
export async function loadDemoBim(buildingId: number | null): Promise<DbFile | null> {
  if (buildingId == null) return null
  try {
    const res = await fetch(`/api/files/building/${buildingId}`, { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = await res.json()
    const files: DbFile[] = Array.isArray(data?.files) ? data.files : []
    const byExt = (ext: string) => files.find(f => f.url && f.name?.toLowerCase().endsWith(ext))
    return byExt('.frag') ?? byExt('.ifc') ?? null
  } catch {
    return null
  }
}

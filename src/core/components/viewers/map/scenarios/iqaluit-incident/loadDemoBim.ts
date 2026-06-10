import type { DbFile } from '../../../../../types/dbTypes'

/**
 * Building whose uploaded .frag/.ifc model the demo loads onto the map. Filled in
 * live during the build once a building with a real model is identified (Carleton /
 * org 6 is the likely source). `null` = no real model configured → the caller shows
 * the synthetic massing fallback instead.
 */
export const DEMO_BUILDING_ID: number | null = null

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

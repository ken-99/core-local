# Roscoff demo — pipeline scripts (Act 2, build-time)

One-time, run-in-repo scripts that produce federated artifacts. Not app code.
Outputs go to the gitignored `../data/` and are hosted (MinIO), not committed.

Planned (Act 2, when Litto3D/BATHYELLI are downloaded + `point-tiler-rust` is available):
- `download-tiles.*` — resolve + fetch LiDAR HD COPC (P2 URLs) for the AOI.
- `pdal-colorize.*` — PDAL: reproject (EPSG:2154+IGN69 → EPSG:4979) → colorize from BD ORTHO → LAZ w/ RGB. Run via the `pdal/pdal` Docker image (no local pdal).
- `tile-3d.*` — `point-tiler-rust` → OGC 3D Tiles 1.1 → MinIO.
- `roofer.*` — `ken-99/roofer-kp` (Docker) on building-class points → LOD2.2 CityJSON → ingestion, `reconstruction_source: "roofer-lod22-lidarhd"`.

Cf. the `iqaluit-incident/scripts/build-coastline.mjs` precedent for baked-data scripts.

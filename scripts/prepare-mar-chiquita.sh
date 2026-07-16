#!/usr/bin/env bash
# One-time prep for the Mar Chiquita water-level scenario. Run once locally.
# Uses ONLY the standalone GDAL .exe tools (gdal_translate) — no Python/osgeo,
# because gdal2tiles.py's osgeo bindings are not installed on this machine.
#
# Outputs:
#   - <scenario>/data/work/dem_grid.xyz  : 180x178 DEM samples (lng lat elev), for the bake step
#   - <cdt-kp1>/public/demo/mar-chiquita/ortho.png : single RGBA drape image (<=4096 per side)
#
# Run from the core-local repo root:  bash scripts/prepare-mar-chiquita.sh
set -euo pipefail

SCN="src/core/components/viewers/map/scenarios/mar-chiquita"
SRC="$SCN/data/source"
WORK="$SCN/data/work"
# Adjust if your cdt-kp1 checkout lives elsewhere:
ORTHO_OUT="../cdt-kp1/public/demo/mar-chiquita"

DEM="$SRC/DEM_Mar Chiquita.tif"
ORTHO="$SRC/Orhomosaic_Mar Chiquita.tif"

mkdir -p "$WORK" "$ORTHO_OUT"

echo "== DEM -> 180x178 grid (XYZ) =="
gdal_translate -q -outsize 180 178 -r average "$DEM" "$WORK/dem_small.tif"
gdal_translate -q -of XYZ "$WORK/dem_small.tif" "$WORK/dem_grid.xyz"

echo "== Ortho -> single RGBA drape PNG (<=4096 each side, GPU texture-size safe) =="
gdal_translate -of PNG -outsize 4000 0 -r average "$ORTHO" "$ORTHO_OUT/ortho.png"
rm -f "$ORTHO_OUT/ortho.png.aux.xml"

echo "== Done. Grid: $WORK/dem_grid.xyz  Drape: $ORTHO_OUT/ortho.png =="
echo "Ortho corners for constants ORTHO_COORDINATES come from: gdalinfo \"$ORTHO\""

#!/usr/bin/env bash
# 重新產生 index.html 裡內嵌的 D3 和 Natural Earth 底圖。
# 需要：curl、node、python3（含 Pillow、numpy）。用法：cd tools && npm i && ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
C=.cache; mkdir -p "$C"
NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_50m_land ne_50m_lakes ne_50m_rivers_lake_centerlines ne_50m_geography_regions_polys; do
  [ -s "$C/$f.geojson" ] || curl -sSfL "$NE/$f.geojson" -o "$C/$f.geojson"
done
MS=node_modules/.bin/mapshaper
BOX=12,-14,160,70
# 海岸線（陸地）
$MS "$C/ne_50m_land.geojson" -clip bbox=$BOX -simplify 25% keep-shapes -filter-slivers min-area=150km2 \
  -filter-fields -o "$C/land.json" format=geojson precision=0.01 force
# 湖泊：只留比較大的天然湖（去掉水庫）
$MS "$C/ne_50m_lakes.geojson" -clip bbox=$BOX -filter 'scalerank<=3 && !/Reservoir|Res\.|Vodokhranilishche/.test(name||"")' \
  -simplify 12% keep-shapes -filter-slivers min-area=300km2 -filter-fields -o "$C/lakes.json" format=geojson precision=0.01 force
# 黃河、長江
$MS "$C/ne_50m_rivers_lake_centerlines.geojson" -filter '["Huang","Yangtze","Chang Jiang","Jinsha"].indexOf(name)>=0 && featurecla=="River"' \
  -each 'river=(name=="Huang"?"huang":"chang")' -dissolve river -simplify 30% -o "$C/rivers.json" format=geojson precision=0.01 force
# 山脈、高原（做陰影用，不內嵌）與沙漠（內嵌，畫成沙色）
$MS "$C/ne_50m_geography_regions_polys.geojson" -filter '["Range/mtn","Plateau"].indexOf(FEATURECLA)>=0' -clip bbox=$BOX \
  -each 'k=FEATURECLA=="Plateau"?"p":"r"' -filter-fields k -o "$C/relief-src.json" format=geojson precision=0.02 force
$MS "$C/ne_50m_geography_regions_polys.geojson" -filter 'FEATURECLA=="Desert"' -clip bbox=$BOX -simplify 20% keep-shapes \
  -filter-fields -o "$C/deserts.json" format=geojson precision=0.05 force
node build-basemap.mjs

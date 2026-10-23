// 讀 build.sh 準備好的 Natural Earth 資料，產生山脈陰影圖，
// 再把 D3 和底圖（window.NE_BASE）內嵌到 ../index.html 的標記之間。
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as d3 from 'd3';

const C = '.cache/';
// mapshaper 輸出的多邊形是逆時針（RFC 7946），D3 要順時針，所以把每一圈反過來。
const rewind = g => g.type === 'Polygon' ? {...g, coordinates: g.coordinates.map(r => r.slice().reverse())}
  : g.type === 'MultiPolygon' ? {...g, coordinates: g.coordinates.map(p => p.map(r => r.slice().reverse()))} : g;
const read = f => {
  const j = JSON.parse(fs.readFileSync(C + f, 'utf8'));
  const feats = j.features || j.geometries.map(g => ({type: 'Feature', properties: {}, geometry: g}));
  return {type: 'FeatureCollection', features: feats.filter(x => x.geometry).map(x => ({...x, geometry: rewind(x.geometry)}))};
};
const slim = fc => ({type: 'FeatureCollection', features: fc.features.map(f => ({type: 'Feature', properties: f.properties && f.properties.river ? {river: f.properties.river} : {}, geometry: f.geometry}))});

/* 投影：地圖程式也用同一組參數（NE_BASE.proj） */
const PROJ = {parallels: [25, 50], rotate: [-88, 0], scale: 1150};
const proj = d3.geoConicConformal().parallels(PROJ.parallels).rotate(PROJ.rotate).scale(PROJ.scale).translate([0, 0]);
const path = d3.geoPath(proj);

const land = read('land.json');
const [[x0, y0], [x1, y1]] = path.bounds(land);

/* 山脈陰影：把山脈、高原多邊形投影到像素座標，交給 relief.py 做成陰影圖 */
const RES = 1.5; // 每個像素代表幾個地圖單位
const W = Math.ceil((x1 - x0) / RES), H = Math.ceil((y1 - y0) / RES);
const toPx = ([x, y]) => [+((x - x0) / RES).toFixed(1), +((y - y0) / RES).toFixed(1)];
const ringsOf = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const polys = [];
for (const f of read('relief-src.json').features)
  for (const poly of ringsOf(f.geometry))
    polys.push({k: f.properties.k, rings: poly.map(r => r.map(p => toPx(proj(p))))});
fs.writeFileSync(C + 'relief-polys.json', JSON.stringify({w: W, h: H, polys}));
execFileSync('python3', ['-I', 'relief.py', C + 'relief-polys.json', C + 'relief.jpg'], {stdio: 'inherit'});
const jpg = fs.readFileSync(C + 'relief.jpg').toString('base64');

const NE = {
  source: 'Natural Earth 1:50m（公有領域）',
  proj: PROJ,
  land: slim(land),
  lakes: slim(read('lakes.json')),
  rivers: slim(read('rivers.json')),
  deserts: slim(read('deserts.json')),
  relief: {x: +x0.toFixed(2), y: +y0.toFixed(2), w: +(W * RES).toFixed(2), h: +(H * RES).toFixed(2), src: 'data:image/jpeg;base64,' + jpg}
};

const d3src = fs.readFileSync('node_modules/d3/dist/d3.min.js', 'utf8');
const lic = fs.readFileSync('node_modules/d3/LICENSE', 'utf8').trim();
const html0 = fs.readFileSync('../index.html', 'utf8');
const put = (html, tag, body) => {
  const re = new RegExp('(<!--' + tag + ':BEGIN-->)[\\s\\S]*?(<!--' + tag + ':END-->)');
  if (!re.test(html)) throw new Error('index.html 裡找不到 ' + tag + ' 標記');
  return html.replace(re, (m, a, b) => a + '\n' + body + '\n' + b);
};
let html = put(html0, 'D3', '<script>\n/* D3.js v7.9.0（ISC 授權）\n' + lic + '\n*/\n' + d3src + '\n</script>');
html = put(html, 'NE', '<script>\n/* 底圖：Natural Earth 1:50m（公有領域，naturalearthdata.com）。由 tools/build.sh 產生，不要手改。 */\nwindow.NE_BASE=' + JSON.stringify(NE) + ';\n</script>');
fs.writeFileSync('../index.html', html);
console.log('relief', W + 'x' + H, Math.round(jpg.length / 1024) + 'KB(b64)', 'land', Math.round(JSON.stringify(NE.land).length / 1024) + 'KB',
  'lakes', Math.round(JSON.stringify(NE.lakes).length / 1024) + 'KB', 'deserts', Math.round(JSON.stringify(NE.deserts).length / 1024) + 'KB',
  '→ index.html', Math.round(Buffer.byteLength(html) / 1024) + 'KB');

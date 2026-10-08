/**
 * ӨРТСӨН ОБЪЕКТЫН ЭКСПОРТ (CSV · GeoJSON) ба CSV туслах — 2026-10-01, «хэрэглэгч: бүгдийг зас».
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ersdelExport.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. WM → WGS84 хөрвүүлэлт (GeoJSON RFC 7946 нь lon/lat шаарддаг).
 *   2. Полигоны эргэлт: ArcGIS (гадна = цагийн зүүний дагуу) → GeoJSON (гадна = эсрэг),
 *      нүх нь ХАРЬЯА гадна цагирагтаа — эс бөгөөс QGIS нүхийг «арал» гэж зурна.
 *   3. CSV: мэдэгдэхгүй гүн/өртөг ХООСОН нүд (0 БИШ), таслал/хашилтыг зугтаана.
 *   4. Өртсөн объект + аюулын мөр нэг FeatureCollection-д.
 *   5. Хохирлын муж оройн төсөвт багтана (`simplifyRings`) — нүх хадгалагдана.
 */
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '@/lib/csvFile';
import {
  damageCsv, damageGeoJSON, ringsToMultiPolygon, toGeoJSONGeometry, wmToLonLat,
} from '@/lib/ersdelExport';
import { simplifyRings } from '@/lib/uyrSurface';

/* 1. WM → lon/lat */
{
  /* Сэлбэ — 106.92°E, 47.97°N (урвуу томьёогоор WM руу) */
  const R = 6378137;
  const x = (106.92 * Math.PI / 180) * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (47.97 * Math.PI / 180) / 2)) * R;
  const [lon, lat] = wmToLonLat(x, y);
  assert.ok(Math.abs(lon - 106.92) < 1e-5, `lon ${lon}`);
  assert.ok(Math.abs(lat - 47.97) < 1e-5, `lat ${lat}`);
  assert.deepEqual(wmToLonLat(0, 0), [0, 0]);
}

/* 2. Эргэлт ба нүх */
{
  /* ArcGIS: гадна CW (x,y дээшээ) */
  const outer = [[0, 0], [0, 100], [100, 100], [100, 0], [0, 0]];
  /* нүх CCW */
  const hole = [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]];
  /* тусдаа арал (CW) */
  const island = [[200, 0], [200, 50], [250, 50], [250, 0], [200, 0]];
  const mp = ringsToMultiPolygon([outer, hole, island]);
  assert.equal(mp.length, 2, 'хоёр полигон (гадна + арал)');
  const withHole = mp.find((p) => p.length === 2);
  assert.ok(withHole, 'нүх гадна цагирагтаа оногдов');
  /* RFC 7946: гадна CCW → тэмдэгтэй талбай > 0 (lon/lat-д ч эргэлт хадгалагдана) */
  const area = (r) => r.reduce((s, p, i) => {
    const q = r[(i + 1) % r.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
  assert.ok(area(withHole[0]) > 0, 'гадна цагираг CCW');
  assert.ok(area(withHole[1]) < 0, 'нүх CW');
  /* Хаалттай цагираг */
  for (const p of mp) for (const r of p) assert.deepEqual(r[0], r[r.length - 1]);

  assert.equal(toGeoJSONGeometry({ type: 'point', x: 0, y: 0 }).type, 'Point');
  assert.equal(toGeoJSONGeometry({ type: 'polyline', paths: [[[0, 0], [1, 1]]] }).type, 'LineString');
  assert.equal(toGeoJSONGeometry({ type: 'polyline', paths: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }).type, 'MultiLineString');
  assert.equal(toGeoJSONGeometry({ type: 'polygon', rings: [outer] }).type, 'Polygon');
  assert.equal(toGeoJSONGeometry({ type: 'mesh' }), null);
}

/* 3. CSV — null хоосон, зугтаалт */
{
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(NaN), '');
  assert.equal(csvCell(0), '0', '0 нь 0 хэвээр (null ≠ 0)');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(toCsv(['a', 'b'], [[1, null]]), 'a,b\r\n1,');

  const rows = [{
    layerId: 'et:24', title: 'Барилга', geom: 'area', clsLabel: 'Барилга',
    objects: [
      { layerId: 'et:24', oid: 7, measure: 123.456, depth: 0.8123, cost: 1000.4, geometry: { type: 'polygon', rings: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] } },
      { layerId: 'et:24', oid: 8, measure: 5, depth: null, cost: null, geometry: { type: 'point', x: 1, y: 1 } },
    ],
  }];
  const csv = damageCsv(rows).split('\r\n');
  assert.equal(csv.length, 3, 'толгой + 2 объект');
  /* ⚠️ 2026-10-09: сүүлийн хоёр багана truncated/total_n — мэдэгдэхгүй бол хоосон */
  assert.ok(csv[1].endsWith(',123.46,m2,0.81,1000,,'), csv[1]);
  assert.ok(csv[2].endsWith(',5,m2,,,,'), `мэдэгдэхгүй гүн/өртөг ХООСОН: ${csv[2]}`);
  assert.ok(csv[0].endsWith(',truncated,total_n'), csv[0]);

  /* 4. GeoJSON — мөр + объектууд */
  const fc = JSON.parse(damageGeoJSON(rows, [[[0, 0], [0, 50], [50, 50], [50, 0], [0, 0]]], { level: 2 }));
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 3);
  assert.equal(fc.features[0].properties.kind, 'flood_footprint');
  assert.equal(fc.features[0].properties.level, 2);
  assert.equal(fc.features[1].properties.depth_max_m, 0.81);
  assert.equal(fc.features[2].properties.depth_max_m, null, 'null хэвээр (0 БИШ)');
  assert.equal(fc.features[2].geometry.type, 'Point');
  /* Мөргүй бол зөвхөн объект */
  assert.equal(JSON.parse(damageGeoJSON(rows, null)).features.length, 2);
  assert.equal(fc.properties.partial, false, 'тайрагдаагүй бол partial=false');

  /* 4b. ⚠️ 2026-10-09: ТАЙРАГДСАН давхарга экспортод ИЛ */
  const tr = [{ ...rows[0], truncated: true, totalN: 1611 }];
  const tcsv = damageCsv(tr).split('\r\n');
  assert.ok(tcsv[1].endsWith(',1,1611'), tcsv[1]);
  const tfc = JSON.parse(damageGeoJSON(tr, null));
  assert.equal(tfc.properties.partial, true);
  assert.deepEqual(tfc.properties.truncated_layers, [{ layer_id: 'et:24', layer: 'Барилга', exported_n: 2, total_n: 1611 }]);
  assert.equal(tfc.features[0].properties.layer_truncated, true);
  assert.equal(tfc.features[0].properties.layer_total_n, 1611);
}

/* 5. Оройн төсөв */
{
  /* 2,000 оройтой тойрог + нүх */
  const circle = (cx, cy, r, n, cw) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = ((cw ? -1 : 1) * i * 2 * Math.PI) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    pts.push(pts[0]);
    return pts;
  };
  const rings = [circle(0, 0, 1000, 2000, true), circle(0, 0, 200, 400, false)];
  const out = simplifyRings(rings, { tol: 4, budget: 300 });
  const total = out.reduce((s, r) => s + r.length, 0);
  assert.ok(total <= 300, `төсөв хэтэрлээ: ${total}`);
  assert.equal(out.length, 2, 'нүх хадгалагдав');
  for (const r of out) assert.deepEqual(r[0], r[r.length - 1], 'хаалттай');
  /* Хил 8×tol-оос илүү хөдлөхгүй — радиус ~1000 хэвээр */
  for (const p of out[0]) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - 1000) < 33, 'хил хэт хөдлөв');
  /* Төсөвт багтсан бол хөндөхгүй */
  assert.equal(simplifyRings(rings, { tol: 4, budget: 10000 }), rings);
}

console.log('ersdelExport.check: OK');

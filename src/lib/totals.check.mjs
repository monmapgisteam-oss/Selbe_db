/**
 * ДАВХАРГЫН НИЙЛБЭР — дундаж хэмжээ, «уртгүй объект», бүсийн ПОЛИГОНООР шүүх (2026-10-01).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/totals.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. «Дундаж урт» = Σурт / БҮХ объект — уртгүй (`Urt_m` хоосон) объект хуваарьт орж
 *     дундажийг худал бууруулдаг байв. Одоо Σурт / УРТТАЙ объект (`nq`).
 *  2. «N объект уртгүй» — `nq` мэдэгдэхгүй (хуучин кэш) үед 0 гэж худал хэлэхгүй (null).
 *  3. `ZONE_ID`-гүй давхаргыг бүсээр шүүхэд бүсийн ПОЛИГОН (эх SR-ээр) `intersects`-ээр явна.
 */
import assert from 'node:assert/strict';
import { avgQty, missingQty, layerStats, layerTotals, loadZoneAoi } from './totals.ts';
import { LAYER_BY_ID } from './services.ts';

/* ── 1. Дундаж — хэмжээтэй объектоор ── */
assert.equal(avgQty({ n: 10, q: 800, nq: 8 }), 100, '800 м / 8 урттай объект (10 биш)');
assert.equal(avgQty({ n: 10, q: 800 }), null, 'nq мэдэгдэхгүй — буруу хуваарьтай тоо гаргахгүй');
assert.equal(avgQty({ n: 10, q: null, nq: 0 }), null);
assert.equal(avgQty({ n: 3, q: 0, nq: 0 }), null, 'урттай объект алга — дундаж алга');
assert.equal(avgQty(undefined), null);

/* ── 2. Уртгүй объект ── */
assert.equal(missingQty({ n: 10, q: 800, nq: 8 }), 2);
assert.equal(missingQty({ n: 10, q: 800 }), null, 'мэдэгдэхгүй — 0 биш');
assert.equal(missingQty({ n: 5, q: 1, nq: 5 }), 0);

/* ── 3. Статистикийн хүсэлт COUNT(qty.field)-ийг агуулна ── */
const lineId = Object.keys(LAYER_BY_ID).find((id) => LAYER_BY_ID[id].qty && LAYER_BY_ID[id].geom === 'line');
const L = LAYER_BY_ID[lineId];
const st = layerStats(L);
assert.ok(st.some((s) => s.statisticType === 'count' && s.onStatisticField === L.qty.field && s.outStatisticFieldName === 'nq'),
  'хэмжээ бөглөгдсөн объектын тоо (nq)');

/* ── 4. layerTotals — nq ба орон зайн шүүлт (AOI) ── */
{
  let sent = null;
  const realF = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent = new URLSearchParams(String(init?.body ?? ''));
    return { ok: true, json: async () => ({ features: [{ attributes: { n: 10, q: 800, nq: 8 } }] }) };
  };
  try {
    const aoi = { geometry: { rings: [[[0, 0], [0, 1], [1, 1], [0, 0]]], spatialReference: { wkid: 32648 } }, wkid: 32648, type: 'polygon', rel: 'intersects' };
    const t = await layerTotals(L, '1=1', aoi);
    assert.deepEqual(t, { n: 10, q: 800, nq: 8 });
    assert.equal(sent.get('geometryType'), 'esriGeometryPolygon');
    assert.equal(sent.get('spatialRel'), 'esriSpatialRelIntersects');
    assert.equal(sent.get('inSR'), '32648');
    assert.ok(JSON.parse(sent.get('geometry')).rings, 'бүсийн полигон биед явна');
  } finally {
    globalThis.fetch = realF;
  }
}

/* ── 5. Бүсийн полигон — олон бүсийн цагираг нэгдэнэ; олдохгүй бол null ── */
{
  const realF = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        spatialReference: { wkid: 32648, latestWkid: 32648 },
        features: [
          { geometry: { rings: [[[0, 0], [0, 10], [10, 10], [0, 0]]] } },
          { geometry: { rings: [[[20, 20], [20, 30], [30, 30], [20, 20]]] } },
        ],
      }),
    };
  };
  try {
    const a = await loadZoneAoi('A-1,B-2');
    assert.equal(a.wkid, 32648);
    assert.equal(a.geometry.rings.length, 2, 'хоёр бүсийн цагираг нэг полигонд');
    assert.equal(a.rel, 'intersects');
    await loadZoneAoi('A-1,B-2');
    assert.equal(calls, 1, 'бүсээр кэшлэгдэнэ');
  } finally {
    globalThis.fetch = realF;
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ features: [] }) });
  try {
    assert.equal(await loadZoneAoi('ZZ-404'), null, 'полигон олдоогүй — null (төслийн нийтээр үлдэнэ)');
  } finally {
    globalThis.fetch = realF;
  }
}

console.log('totals.check: OK');

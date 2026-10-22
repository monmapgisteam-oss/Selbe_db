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
import { readFileSync } from 'node:fs';
import {
  avgQty, missingQty, layerStats, layerTotals, loadZoneAoi, layerTotalsShared, lazyView, dropTotalsCache, totalsEpoch,
} from './totals.ts';
import { LAYER_BY_ID, CATALOG_LAYER_IDS, PLAN_LAYER_IDS, PKG_BY_FAMILY } from './services.ts';

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

/* ── 6. Давхарга тус бүрийн ХУВААЛЦСАН кэш (2026-10-22) — зэрэг асуулт нэг хүсэлт, уналт кэшлэгдэхгүй, эрин/бүсээр ── */
{
  const realF = globalThis.fetch;
  let calls = 0;
  let fail = false;
  globalThis.fetch = async () => {
    calls += 1;
    if (fail) return { ok: true, json: async () => ({ error: { code: 500, message: 'x' } }) };
    return { ok: true, json: async () => ({ features: [{ attributes: { n: 3, q: 30, nq: 3 } }] }) };
  };
  try {
    const id = lineId;
    const [a, b] = await Promise.all([layerTotalsShared(null, id), layerTotalsShared(null, id)]);
    assert.equal(calls, 1, 'зэрэг асуусан ижил давхарга — НЭГ хүсэлт (каталог + самбар)');
    assert.deepEqual(a, b);
    await layerTotalsShared(null, id);
    assert.equal(calls, 1, 'шийдэгдсэнийг дахин татахгүй');
    await layerTotalsShared('Багц-1', id);
    assert.equal(calls, 2, 'бүс тус бүр тусдаа');
    const e0 = totalsEpoch();
    dropTotalsCache();
    assert.equal(totalsEpoch(), e0 + 1);
    await layerTotalsShared(null, id);
    assert.equal(calls, 3, 'эрин (засвар · дахин оролдох) — шинээр татна');
    dropTotalsCache();
    fail = true;
    await assert.rejects(layerTotalsShared(null, id));
    fail = false;
    await new Promise((r) => setTimeout(r, 0));
    const n0 = calls;
    await layerTotalsShared(null, id);
    assert.equal(calls, n0 + 1, 'уналт кэшлэгдэхгүй — дараагийн асуулт дахин оролдоно');
    await assert.rejects(layerTotalsShared(null, 'zz:404'), /unknown layer/, 'мэдэгдэхгүй давхарга — унасан амлалт');
  } finally {
    globalThis.fetch = realF;
    dropTotalsCache();
  }
}

/* ── 7. `lazyView` — ирсэн · унасан · хүлээгдэж буй (цэвэр) ── */
{
  const T = { n: 1, q: null, nq: null };
  const key = (id) => `0||${id}`;
  const done = new Map([[key('a'), T]]);
  const fail = new Set([key('b'), key('c')]);
  const inflight = new Set([key('c')]);
  const v = lazyView(['a', 'b', 'c', 'd', 'a'], key, done, fail, inflight);
  assert.deepEqual([...v.map.keys()], ['a']);
  assert.deepEqual(v.failed, ['b'], 'унасан (дахин оролдоогүй) — «—» + «N давхарга татагдсангүй»');
  assert.equal(v.pending, 2, 'дахин оролдож буй (c) ба эхлээгүй (d) — «…»');
  const none = lazyView([], key, done, fail, inflight);
  assert.equal(none.map.size + none.pending + none.failed.length, 0, 'хоосон жагсаалт — хүсэлтгүй, «тоолж байна»-гүй');
}

/* ── 8. Холболт — ХАРАГДАЖ БУЙ тоо л (2026-10-22, эх кодоор) ── */
{
  const PORTAL = readFileSync('src/components/Portal.tsx', 'utf8');
  assert.match(PORTAL, /usePlanTotals\(zone, !standalone && view === 'plan', PLAN_LAYER_IDS\)/,
    'Portal: зөвхөн «Ерөнхий мэдээлэл»-ийн самбарын тойм (PLAN_LAYER_IDS) — «Хэсэгчилсэн ЕТ»-д 0');
  assert.doesNotMatch(PORTAL, /CATALOG_LAYER_IDS/, 'Portal каталогийн бүх давхаргыг урьдчилж татахгүй');
  assert.match(PORTAL, /totals=\{view === 'plan' \? totals : TOTALS_IDLE\}/, 'нуугдмал самбарт хоосон Map-ыг уналт гэж зурахгүй');
  const GD = readFileSync('src/modules/GeneralDash.tsx', 'utf8');
  assert.match(GD, /usePlanTotals\(zone, true, PLAN_CARD_IDS\)/, '«Ерөнхий дашбоард»: зөвхөн «Ерөнхий төлөвлөгөө» картын давхарга');
  for (const [f, src] of [['Portal', PORTAL], ['GeneralDash', GD]]) {
    const cat = src.slice(src.indexOf('<LayerCatalog'), src.indexOf('/>', src.indexOf('<LayerCatalog')));
    assert.ok(cat.length > 0 && !/\btotals=/.test(cat), `${f}: каталог нээлттэй бүлгийнхээ тоог өөрөө татна (totals өгөхгүй)`);
  }
  /* Картын давхаргууд — бүгд каталогт (тоо урьдынхтай ЯГ ижил: урьд каталогийн Map-аас уншдаг байв) */
  const net = ['net', 'pow', 'src'].flatMap((x) => PKG_BY_FAMILY[x] ?? []);
  const card = new Set(['et:24', 'zone', 'road', 'et:15', 'nogoon', ...net]);
  for (const id of card) assert.ok(CATALOG_LAYER_IDS.includes(id), `картын ${id} каталогт байх ёстой`);
  assert.match(GD, /'et:24', 'zone', \.\.\.PLAN_QTY\.map\(\(p\) => p\.id\), \.\.\.NET_FAMILIES\.flatMap\(\(f\) => PKG_BY_FAMILY\[f\] \?\? \[\]\)/,
    'PLAN_CARD_IDS нь картын уншдаг олонлог');
  for (const id of PLAN_LAYER_IDS) assert.ok(CATALOG_LAYER_IDS.includes(id), `тоймын ${id} каталогт`);
  const LC = readFileSync('src/components/LayerCatalog.tsx', 'utf8');
  assert.match(LC, /useLazyTotals\(zone, lazyIds, !totals\)/);
  assert.match(LC, /needle \|\| !shut\.has\(g\.key\)/, 'татах бүлэг = зурагдах бүлэг (хайлт идэвхтэй бол таарсан бүгд)');
  assert.match(LC, /const open = needle \? true : !shut\.has\(g\.key\);/, 'зурах дүрэм хэвээр — дээрхтэй нэг');
  const VP = readFileSync('src/modules/ViewPanel.tsx', 'utf8');
  assert.match(VP, /useLazyTotals\(zone, \[d\.id\]\)/, 'сонгосон давхаргын самбар өөрийнхөө тоог (каталогийн 33 давхарга тоймд байхгүй)');
}

console.log('totals.check: OK');

/**
 * НЭГЖ ТАЛБАРЫН ДАВХЦАЛ — БАГЦЛАЛТ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/parcelOverlap.check.mjs
 *
 * Хамгаалах алдаа: CEO «Газар» KPI 295 хүсэлт / 9.3 сек — `execTriage.loadOverlaps` ~50 багц
 * бүрд метадата + геометр + огтлолцлын асуулга тус тусдаа явуулдаг байв.
 * Сүлжээгүй — `fetch` хуурамч ArcGIS (тэнхлэгт зэрэгцээ дөрвөлжин/хэвтээ шугам/цэг тул
 * хайрцгийн огтлолцол = жинхэнэ огтлолцол):
 *  1. Нэг tick-ийн олон дуудлага (багц) ба ганц ганцаар (хуучин зам) — ЯГ ижил OID-ууд.
 *  2. Багцын хүсэлтийн тоо эрс цөөн (барилгын багцууд нэг татлага, нэг огтлолцлын нэгдэл).
 *  3. Дараагийн бүтэн барилгын дуудлага (`allBld`) геометрээ кэшээс авна.
 *  4. Хүрэлцэх (хил дээр) = огтлолцох; салангид объект тоологдохгүй.
 *  5. Уналт: давхарга унасан дуудлага `failed`-тэй, бүгд унасан нь алдаа — хуучин зан.
 *  6. (2026-10-09) «Бүрэн чөлөөлсөн.» зэрэг ХУВИЛБАР бичиглэл саад БИШ (ганц ба багцын зам).
 *  7. (2026-10-09) Олон хэсэгтэй нэгж талбар: 2-р хэсэг нь эх полигон дотор бол давхцана.
 */
import assert from 'node:assert/strict';

const { LAYER_BY_ID, PKG_BY_BAGTS, PARCEL_LEFT } = await import('./services.ts');

let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n += 1; console.log('  ✓', name); });

/* ── Хуурамч ArcGIS ── */
const WK = 32648;
const sq = (x, y, w = 10) => [[[x, y], [x, y + w], [x + w, y + w], [x + w, y], [x, y]]];
/* Нэгж талбар i: x = 20·i … 20·i+10, y = 0…10 (FID = 100+i) */
const PARCELS = new Map(Array.from({ length: 60 }, (_, i) => [100 + i, sq(20 * i, 0)]));
const BLD = 'mon:building';
/* Барилга OID k (1…40): k нь ТЭГШ бол нэгж талбар k-тэй давхцана, СОНДГОЙ бол хол (y=500).
   OID 41 нь нэгж талбар 41-ийн хил дээр ХҮРЭЛЦЭНЭ (x = 20·41+10 … ). */
const bldFeats = [
  ...Array.from({ length: 40 }, (_, i) => {
    const k = i + 1;
    return { attributes: { OBJECTID: k }, geometry: { rings: k % 2 === 0 ? sq(20 * k + 2, 2, 5) : sq(20 * k, 500, 5) } };
  }),
  { attributes: { OBJECTID: 41 }, geometry: { rings: sq(20 * 41 + 10, 0, 5) } },
];
const infraIds = [...new Set(Object.values(PKG_BY_BAGTS).flat())].filter((id) => LAYER_BY_ID[id] && id !== BLD).slice(0, 10);
assert.equal(infraIds.length, 10, 'дэд бүтцийн давхарга хангалтгүй');
/* Дэд бүтэц j (0…9): тэгш j — хэвтээ шугам нэгж талбар 45+j-г огтолно; сондгой — цэг 45+j дотор */
const infraFeats = (j) => (j % 2 === 0
  ? [{ attributes: { OBJECTID: 1 }, geometry: { paths: [[[20 * (45 + j) - 3, 5], [20 * (45 + j) + 4, 5]]] } }]
  : [{ attributes: { OBJECTID: 1 }, geometry: { x: 20 * (45 + j) + 5, y: 5 } }]);
const byUrl = new Map([[LAYER_BY_ID[BLD].url, () => bldFeats], ...infraIds.map((id, j) => [LAYER_BY_ID[id].url, () => infraFeats(j)])]);
let broken = null; // энэ URL унана (5-р шалгалт)
let variant = new Set(); // эдгээр FID-ийн төлөв «бүрэн  Чөлөөлсөн.» (6-р шалгалт)

const boxOf = (coords) => {
  const xs = coords.map((c) => c[0]); const ys = coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const hit = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

let calls = 0;
const kinds = { meta: 0, geom: 0, intersect: 0, parcels: 0 };
globalThis.fetch = async (url, init) => {
  calls += 1;
  const p = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
  const u = String(url);
  const base = u.replace(/\/query$/, '');
  let body;
  if (!u.endsWith('/query')) {
    kinds.meta += 1;
    body = { objectIdField: base === PARCEL_LEFT.url ? 'FID' : 'OBJECTID', extent: { spatialReference: { wkid: WK } }, advancedQueryCapabilities: { supportsPagination: true } };
  } else if (base === PARCEL_LEFT.url && p.objectIds) {
    kinds.parcels += 1;
    body = { features: p.objectIds.split(',').map(Number).map((id) => ({
      attributes: { [PARCEL_LEFT.oid]: id, [PARCEL_LEFT.fields.status]: variant.has(id) ? 'бүрэн  Чөлөөлсөн. ' : 'зөвшилцөх' },
      ...(p.returnGeometry === 'false' ? {} : { geometry: { rings: PARCELS.get(id) } }),
    })) };
  } else if (base === PARCEL_LEFT.url && p.geometry) {
    kinds.intersect += 1;
    const g = JSON.parse(p.geometry);
    const parts = [...(g.rings ?? []), ...(g.paths ?? []), ...(g.points ?? []).map((pt) => [pt])].map(boxOf);
    body = { objectIds: [...PARCELS].filter(([, r]) => parts.some((b) => r.some((ring) => hit(boxOf(ring), b)))).map(([id]) => id) };
  } else {
    kinds.geom += 1;
    if (base === broken) body = { error: { code: 400, message: 'down', details: [] } };
    else {
      let fs = byUrl.get(base)?.() ?? [];
      const m = /IN \(([\d,]+)\)/.exec(p.where ?? '');
      if (m) { const ids = new Set(m[1].split(',').map(Number)); fs = fs.filter((f) => ids.has(f.attributes.OBJECTID)); }
      body = { features: fs.map((f) => (p.outFields ? f : { geometry: f.geometry })), exceededTransferLimit: false };
    }
  }
  return { ok: true, status: 200, json: async () => structuredClone(body), text: async () => JSON.stringify(body) };
};

/* ── Ажлууд — `execTriage.loadOverlaps`-ийн хэлбэр: барилгын багц бүр OID IN, дэд бүтэц давхаргаар ── */
const bldJobs = Array.from({ length: 20 }, (_, i) => [{ layerId: BLD, where: `OBJECTID IN (${2 * i + 1},${2 * i + 2})` }]);
bldJobs.push([{ layerId: BLD, where: 'OBJECTID IN (41)' }]);
const infraJobs = infraIds.map((id) => [{ layerId: id, where: null }]);
const jobs = [...bldJobs, ...infraJobs];
const allBld = [{ layerId: BLD, where: null }];

/* Тусдаа модулийн хувилбар — кэш хуваалцахгүй */
const A = await import('./parcelOverlap.ts?batch');
const B = await import('./parcelOverlap.ts?single');

console.log('\n1–2. Багц ба ганц дуудлага — ижил үр дүн, цөөн хүсэлт');
calls = 0;
const batch = await Promise.all(jobs.map((j) => A.overlapLeftParcels(j)));
const batchCalls = calls;
const kb = { ...kinds };
calls = 0;
const single = [];
for (const j of jobs) single.push(await B.overlapLeftParcels(j));
const singleCalls = calls;

await ok('OID-ууд багц бүрд ЯГ ижил', () => {
  assert.deepEqual(batch.map((r) => [...r.oids].sort()), single.map((r) => [...r.oids].sort()));
  assert.ok(batch.every((r) => !r.failed), 'уналтгүй');
});
await ok('хүлээгдэж буй давхцал: тэгш OID-той барилга, хил дээр хүрэлцсэн 41, дэд бүтэц бүр', () => {
  assert.deepEqual(batch[0].oids, [102], 'OID 1 (хол) + 2 (талбар 2)');
  assert.deepEqual(batch[20].oids, [141], 'хил дээр хүрэлцэх = огтлолцох');
  infraIds.forEach((_, j) => assert.deepEqual(batch[21 + j].oids, [145 + j], `дэд бүтэц ${j}`));
});
await ok(`хүсэлт: багц ${batchCalls} ↔ ганцаар ${singleCalls}`, () => {
  /* parcelSR 1 + барилгын метадата 1 + бүтэн барилга 1 + дэд бүтцийн геометр 10 + нэгдлийн огтлолцол 3 + дэвшигчдийн геометр 1 */
  assert.ok(batchCalls <= 17, `багцад ${batchCalls} хүсэлт (${JSON.stringify(kb)})`);
  assert.ok(singleCalls >= 3 * batchCalls, `хэмнэлт бага: ${batchCalls} ↔ ${singleCalls}`);
  assert.equal(kb.meta, 2, 'метадата зөвхөн парселийн проекц + OID-оор задлах барилга');
});

console.log('\n3. Дараагийн бүтэн барилгын дуудлага — геометр кэшээс');
await ok('allBld: огтлолцол + дэвшигчдийн төлөв (2026-10-09)', async () => {
  const g0 = kinds.geom;
  calls = 0;
  const r = await A.overlapLeftParcels(allBld);
  assert.equal(kinds.geom, g0, 'геометр дахин татагдав');
  assert.equal(calls, 2, `${calls} хүсэлт`);
  assert.deepEqual([...r.oids].sort(), [...Array.from({ length: 20 }, (_, i) => 102 + 2 * i), 141].sort());
});

console.log('\n5. Уналт — хуучин зан');
await ok('нэг давхарга унасан дуудлага `failed`, бүгд унасан нь алдаа, бусад нь хэвийн', async () => {
  const C = await import('./parcelOverlap.ts?fail');
  broken = LAYER_BY_ID[infraIds[0]].url;
  const both = [{ layerId: infraIds[0], where: null }, { layerId: infraIds[1], where: null }];
  const [r1, r2, r3] = await Promise.allSettled([
    C.overlapLeftParcels(both),
    C.overlapLeftParcels([{ layerId: infraIds[0], where: null }]),
    C.overlapLeftParcels([{ layerId: infraIds[2], where: null }]),
  ]);
  broken = null;
  assert.equal(r1.status, 'fulfilled');
  assert.deepEqual(r1.value.failed, [infraIds[0]]);
  assert.deepEqual(r1.value.oids, [146]);
  assert.equal(r2.status, 'rejected', 'бүгд унасан → алдаа («саад алга» биш)');
  assert.equal(r3.status, 'fulfilled');
  assert.deepEqual(r3.value.oids, [147]);
  assert.equal(r3.value.failed, undefined);
});

console.log('\n6. Чөлөөлсөн-ий хувилбар бичиглэл (2026-10-09)');
await ok('«бүрэн  Чөлөөлсөн. » нь ганц ба багцын замд хоёуланд нь саад биш', async () => {
  variant = new Set([146]);
  const D = await import('./parcelOverlap.ts?variant');
  const one = await D.overlapLeftParcels([{ layerId: infraIds[1], where: null }]);
  const E = await import('./parcelOverlap.ts?variantBatch');
  const [b1, b2] = await Promise.all([
    E.overlapLeftParcels([{ layerId: infraIds[1], where: null }]),
    E.overlapLeftParcels([{ layerId: infraIds[2], where: null }]),
  ]);
  variant = new Set();
  assert.deepEqual(one.oids, []);
  assert.deepEqual(b1.oids, []);
  assert.deepEqual(b2.oids, [147]);
});

console.log('\n7. Олон хэсэгтэй нэгж талбар (2026-10-09)');
await ok('эхний хэсэг гадна, 2-р хэсэг эх полигон дотор — багцын замд давхцана', async () => {
  /* FID 159: 1-р хэсэг хол (y=900), 2-р хэсэг барилга 39-ийн (x=780…785, y=500…505) дотор бүрэн */
  PARCELS.set(159, [...sq(20 * 59, 900), ...sq(781, 501, 2)]);
  const F = await import('./parcelOverlap.ts?multipart');
  const [r1, r2] = await Promise.all([
    F.overlapLeftParcels([{ layerId: BLD, where: 'OBJECTID IN (39)' }]),
    F.overlapLeftParcels([{ layerId: BLD, where: 'OBJECTID IN (40)' }]),
  ]);
  PARCELS.set(159, sq(20 * 59, 0));
  assert.deepEqual(r1.oids, [159]);
  assert.deepEqual(r2.oids, [140]);
});

console.log(`\n${n} шалгалт ✓`);

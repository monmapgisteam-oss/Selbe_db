/**
 * ХУВААРЬ — «Тавих» → ноорог → «Батлуулах» хаалт → илгээлт → буулгалт гинжний
 * ЦЭВЭР хэсгүүдийн шалгуур (2026-09-30-ны регрессийн мэдээлэлд).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaari/obyemGate.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. Popup-ын ШҮҮСЭН `mv` (мужаас гадуурх сар хасагдсан) нийт обьёмтой тэнцвэл
 *      `unbalancedObyem` хаалт ТҮҮНИЙГ няцаахгүй — «зөв хуваасан ч болохгүй» гарахгүй.
 *   2. Гинжээр шилжсэн (`keepMonths`-оор тайрагдсан) ажил НЭРЭЭРЭЭ няцаагдана.
 *   3. Хоосон задаргаа + хуваарьтай блок нь ЗӨВХӨН серверт задаргаа байсан үед няцаагдана.
 *   4. `buildPayloadOf` → `payloadToDrafts` тойрог тэнцсэн задаргааг ХЭВЭЭР буулгана
 *      (батлагчийн `save`-ийн `unbal` худал асахгүй).
 */
import assert from 'node:assert/strict';
const g = globalThis;
g.window = g;
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;

const { unbalancedObyem, obKey } = await import('./util.ts');
const { keepMonths, monthsOf } = await import('@/lib/huvaariObyem');
const { buildPayloadOf, payloadToDrafts } = await import('./payload.ts');

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });
const M = (o) => new Map(Object.entries(o));
const BLD = ['B1', 'B2'];
const row = (i, oid, des, vol, spans, extra = {}) => ({
  i, oid, no: `1.${i + 1}`, des, deps: [], work: `Ажил ${des}`, depth: 1, group: false, vol, spans,
  act: [null, null], aStart: [null, null], aEnd: [null, null], hun: null, mashin: null, ...extra,
});

/* ── 1. Popup-ын шүүсэн задаргаа тэнцвэл хаалт нээлттэй ── */
{
  const plan = [row(0, 7, 11, 900, [span('2026-10-01', '2026-12-31'), null])];
  const ob = new Map([[obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })]]);
  assert.deepEqual(unbalancedObyem(plan, BLD, ob, new Map()), { bad: 0, names: [] }, 'зөв хуваасан → хаалт нээлттэй');
  /* Бутархай нийт — яг хуваасан */
  const plan2 = [row(0, 7, 11, 900.35, [span('2026-10-01', '2026-12-31'), null])];
  const ob2 = new Map([[obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300.35 })]]);
  assert.equal(unbalancedObyem(plan2, BLD, ob2, new Map()).bad, 0, 'бутархай нийт · яг хуваасан');
  /* Хөвөгч цэгийн алдаа — 0.1+0.2+0.7 */
  const plan3 = [row(0, 7, 11, 1, [span('2026-10-01', '2026-12-31'), null])];
  const ob3 = new Map([[obKey(11, 'B1'), M({ '2026-10': 0.1, '2026-11': 0.2, '2026-12': 0.7 })]]);
  assert.equal(unbalancedObyem(plan3, BLD, ob3, new Map()).bad, 0, '0.1+0.2+0.7 = 1 (тэвчээртэй)');
}

/* ── 2. Гинжээр шилжсэн ажил — keepMonths тайрсан → нэрээрээ няцаагдана ── */
{
  const moved = span('2026-11-01', '2027-01-31');
  const trimmed = keepMonths(moved, M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
  assert.deepEqual([...trimmed], [['2026-11', 300], ['2026-12', 300]], '10-р сар хасагдаж, 1-р сар хоосон');
  const plan = [
    row(0, 7, 11, 900, [span('2026-10-01', '2026-12-31'), null]),
    row(1, 8, 12, 900, [moved, null]),
  ];
  const ob = new Map([
    [obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })],
    [obKey(12, 'B1'), trimmed],
  ]);
  const r = unbalancedObyem(plan, BLD, ob, new Map());
  assert.equal(r.bad, 1);
  assert.deepEqual(r.names, ['1.2 Ажил 12'], 'зөвхөн шилжсэн ажил нэрлэгдэнэ — зөв хуваасан 1.1 биш');
}

/* ── 3. Хоосон задаргаа + хуваарьтай блок ── */
{
  const plan = [row(0, 7, 11, 900, [span('2027-03-01', '2027-04-30'), null])];
  const ob = new Map([[obKey(11, 'B1'), new Map()]]);
  assert.equal(unbalancedObyem(plan, BLD, ob, new Map()).bad, 0, 'серверт задаргаа байгаагүй → устгах зүйлгүй → нээлттэй');
  const srv = new Map([[11, new Map([['B1', M({ '2026-10': 900 })]])]]);
  assert.equal(unbalancedObyem(plan, BLD, ob, srv).bad, 1, 'серверт задаргаа байсан → хоосон = 0 ≠ 900 → няцаана');
  /* Хуваарь ч хоосон (`clear`) бол «арилгах» — няцаахгүй */
  const plan0 = [row(0, 7, 11, 900, [null, null])];
  assert.equal(unbalancedObyem(plan0, BLD, ob, srv).bad, 0, 'хуваарьгүй блокийн хоосон задаргаа = арилгах');
  /* Обьёмгүй / кодгүй мөр — суурьгүй, алгасна */
  const planNoVol = [row(0, 7, 11, null, [span('2026-10-01', '2026-12-31'), null])];
  assert.equal(unbalancedObyem(planNoVol, BLD, new Map([[obKey(11, 'B1'), M({ '2026-10': 5 })]]), srv).bad, 0, 'обьёмгүй → алгасна');
  const planNoDes = [row(0, 7, null, 900, [span('2026-10-01', '2026-12-31'), null])];
  assert.equal(unbalancedObyem(planNoDes, BLD, ob, srv).bad, 0, 'кодгүй → алгасна');
}

/* ── 4. Илгээлт → буулгалт тойрог: тэнцсэн задаргаа хэвээр ── */
{
  const sp = span('2026-10-01', '2026-12-31');
  const sheet = (oid, des) => ({
    oid, no: '1.1', des, work: `Ажил ${des}`, depth: 1, group: false, vol: 900, ham: null,
    start: [null, null], end: [null, null], gStart: [null, null], gEnd: [null, null],
    act: [null, null], aStart: [null, null], aEnd: [null, null], hun: null, mashin: null,
  });
  const rows = [sheet(7, 11)];
  const base = [row(0, 7, 11, 900, [null, null])];
  const months = M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 });
  const draft = new Map([[7, [sp, null]]]);
  const obDraft = new Map([[obKey(11, 'B1'), months]]);
  const pay = buildPayloadOf({
    draft, ham: new Map(), aDraft: new Map(), resDraft: new Map(), obDraft, obResDraft: new Map(),
    kind: 'plan', base, rows, obPlan: new Map(), obRes: new Map(),
  });
  assert.deepEqual(pay.obyem[obKey(11, 'B1')], { '2026-10': 300, '2026-11': 300, '2026-12': 300 });
  /* JSON тойрог — ArcGIS-д тэмдэгт мөрөөр хадгалагдана */
  const back = JSON.parse(JSON.stringify(pay));
  const ap = payloadToDrafts(back, rows, true, new Map(), new Map(), { kind: 'plan', n: 2 });
  assert.equal(ap.ok, true, `буулгалт амжилттай: ${JSON.stringify(ap)}`);
  const got = ap.maps.obDraft.get(obKey(11, 'B1'));
  assert.deepEqual([...got], [...months], 'задаргаа ХЭВЭЭР буусан');
  assert.deepEqual(ap.maps.draft.get(7), [sp, null], 'хуваарь хэвээр буусан');
  /* Батлагчийн хаалт (илгээлтийн агуулгаар) — няцаахгүй */
  const plan = [row(0, 7, 11, 900, [sp, null])];
  assert.equal(unbalancedObyem(plan, BLD, ap.maps.obDraft, new Map()).bad, 0, 'буусан задаргаа тэнцсэн хэвээр');
  /* Төрөл зөрвөл буулгахгүй */
  assert.equal(payloadToDrafts(back, rows, true, new Map(), new Map(), { kind: 'geree', n: 2 }).ok, false, 'kind зөрүү');
  /* Муж мужаас гадуурх сарыг popup-ын шүүлтгүйгээр илгээвэл (хуучин ноорог) — monthsOf-той тулгаж хаалт ажиллана */
  assert.deepEqual(monthsOf(sp), ['2026-10', '2026-11', '2026-12']);
}

console.log('✓ obyemGate: popup-ын шүүсэн задаргаа → хаалт → илгээлт → буулгалт');

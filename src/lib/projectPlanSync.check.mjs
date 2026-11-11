/**
 * `projectPlanSync.planProgressUpdates` — «Төсөл төлөвлөгөө биелэлт»-ийн S-ийг хүснэгтэд бичих мөрүүд (2026-10-29).
 *   · S хадгалсан утгаас зөрсөн мөр л; ижил (хүлцэл дотор) мөр бичигдэхгүй;
 *   · S null бол бичихгүй (null ≠ 0);
 *   · эх унасан (`failed`) эсвэл хоосон төлөвлөгөө бол юу ч бичихгүй;
 *   · эцгийн мөр ч (Σ F·X) бичигдэнэ.
 */
import assert from 'node:assert/strict';
import { buildTree, computePlan } from './projectPlan.ts';
import { planProgressUpdates } from './projectPlanSync.ts';

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const today = D('2026-10-26');

/* 1 · ТЭЗҮ (эцэг) — 1.1 (хадгалсан 40, жин 0.5), 1.2 (хадгалсан 80, жин 0.5), 1.3 (S алга, жин 0) */
const rows = [
  { objectid: 1, dd_kod: '1', etseg_kod: null, uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'ТЭЗҮ', guitsetgel_huvi: 10 },
  { objectid: 2, dd_kod: '1.1', etseg_kod: '1', uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'А', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 40 },
  { objectid: 3, dd_kod: '1.2', etseg_kod: '1', uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'Б', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 80 },
  { objectid: 4, dd_kod: '1.3', etseg_kod: '1', uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'В', heseg_ezleh_huvi: 0, guitsetgel_huvi: null },
];
const tree = buildTree(rows);
const plan = (over = {}, failed = []) => {
  const result = computePlan(tree, { override: (n) => over[n.row?.dd_kod] }, today);
  return { empty: false, tree, result, inputs: {}, months: [], monthly: new Map(), failed };
};

const ups = planProgressUpdates(plan());
const byOid = new Map(ups.map((u) => [u.objectid, u.guitsetgel_huvi]));
assert.equal(byOid.get(1), 60, 'эцэг = Σ F·X = 0.5·40 + 0.5·80 → хадгалсан 10-аас зөрсөн → бичнэ');
assert.ok(!byOid.has(2) && !byOid.has(3), 'хадгалсантай ижил навч бичигдэхгүй');
assert.ok(!byOid.has(4), 'S null → бичихгүй (null ≠ 0)');

/* амьд утга (override = блокийн бөглөлт г.м.) хадгалсанаас зөрвөл навч бичигдэнэ */
const live = new Map(planProgressUpdates(plan({ '1.1': { S: 55.5 } })).map((u) => [u.objectid, u.guitsetgel_huvi]));
assert.equal(live.get(2), 55.5, 'амьд S (override 0–100)');
assert.equal(live.get(1), 67.75, 'эцэг дагаж шинэчлэгдэнэ');

/* хүлцэл дотор — бичихгүй */
assert.equal(planProgressUpdates(plan({ '1.1': { S: 40.00000001 } })).some((u) => u.objectid === 2), false, 'хөвөгч таслалын шуугиан');

assert.deepEqual(planProgressUpdates(plan({}, ['landTotal'])), [], 'эх унасан → юу ч бичихгүй');

/* 2026-11-11: газар чөлөөлөлтийн багц/блокийн мөрийн хуучин хадгалсан хувь арилна; үе шатын мөр төслийн нийтээр */
{
  const g = buildTree([
    { objectid: 21, dd_kod: '2', etseg_kod: null, uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: 'Газар чөлөөлөлт', guitsetgel_huvi: 80 },
    { objectid: 22, dd_kod: '2.1', etseg_kod: '2', uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: 'Багц-1', bagts: 'Багц-1', heseg_ezleh_huvi: 1, guitsetgel_huvi: 75 },
    { objectid: 23, dd_kod: '2.1.1', etseg_kod: '2.1', uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: '5/1', bagts: 'Багц-1', blok: '5/1', heseg_ezleh_huvi: 1, guitsetgel_huvi: 50 },
    { objectid: 24, dd_kod: '2.1.2', etseg_kod: '2.1', uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: '5/2', bagts: 'Багц-1', blok: '5/2', heseg_ezleh_huvi: 0, guitsetgel_huvi: null },
  ]);
  const r = computePlan(g, { override: (n) => (n.depth === 1 ? { S: 91.4 } : undefined) }, today);
  const u = new Map(planProgressUpdates({ empty: false, tree: g, result: r, inputs: {}, months: [], monthly: new Map(), failed: [] }).map((x) => [x.objectid, x]));
  assert.equal(u.get(21).guitsetgel_huvi, 91.4, 'үе шатын мөр = төслийн нийт');
  assert.ok('guitsetgel_huvi' in u.get(22) && u.get(22).guitsetgel_huvi === null, 'багцын мөрийн хуучин хувь арилна');
  assert.equal(u.get(23).guitsetgel_huvi, null, 'блокийн мөрийн хуучин хувь арилна');
  assert.ok(!u.has(24), 'аль хэдийн хоосон мөр бичигдэхгүй');
}
assert.deepEqual(planProgressUpdates({ ...plan(), empty: true }), [], 'хоосон төлөвлөгөө → юу ч бичихгүй');

/* 2026-11-05 (аудит №1): БАГЦЫН түвшний эх унасан бол зөвхөн тэр багцын мөр ба өвгүүд нь бичигдэхгүй — бусад нь бичигдэнэ */
{
  const { failedScope, planSyncWarn } = await import('./projectPlanSync.ts');
  assert.equal(failedScope(['parcels']), null, 'төслийн түвшний эх → бүгд зогсоно');
  assert.equal(failedScope(['schedule:b1_9f', 'blockProgress']), null, 'холимог → бүгд зогсоно');
  assert.equal(failedScope(['schedule:no_such']), null, 'үл мэдэх хуудас → бүгд зогсоно');
  assert.deepEqual([...failedScope(['schedule:b1_9f', 'schedule:b2_9f'])], ['БАГЦ1', 'БАГЦ2'], 'хуудас → бүлгийн түлхүүр');
  assert.equal(failedScope(['land:БАГЦ2']), null, '2026-11-11: багцын газрын эх байхгүй — үл мэдэх эх → бүгд зогсоно');
  assert.deepEqual([...failedScope([])], [], 'унаагүй → хоосон хүрээ');

  const rows2 = [
    { objectid: 10, dd_kod: '5', etseg_kod: null, uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт', guitsetgel_huvi: 0 },
    { objectid: 11, dd_kod: '5.1', etseg_kod: '5', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'А', bagts: 'Багц 1', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 0 },
    { objectid: 12, dd_kod: '5.2', etseg_kod: '5', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Б', bagts: 'Багц 2', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 0 },
  ];
  const t2 = buildTree(rows2);
  const mk = (failed) => ({
    empty: false, tree: t2, inputs: {}, months: [], monthly: new Map(), failed,
    result: computePlan(t2, { override: (n) => ({ '5.1': { S: 30 }, '5.2': { S: 70 } })[n.row?.dd_kod] }, today),
  });
  const all = new Map(planProgressUpdates(mk([])).map((u) => [u.objectid, u.guitsetgel_huvi]));
  assert.deepEqual([...all.keys()].sort(), [10, 11, 12], 'унаагүй → гурвуулаа');
  const part = new Map(planProgressUpdates(mk(['schedule:b1_9f'])).map((u) => [u.objectid, u.guitsetgel_huvi]));
  assert.deepEqual([...part.keys()], [12], 'Багц 1 унасан → Багц 1 (11) ба өвөг (10) бичигдэхгүй, Багц 2 бичигдэнэ');
  assert.equal(part.get(12), 70);
  assert.deepEqual(planProgressUpdates(mk(['schedule:b1_9f', 'landTotal'])), [], 'төслийн түвшний эх давхар унавал бүгд зогсоно');

  assert.equal(planSyncWarn({ ok: true, n: 3 }), null, 'бүрэн → анхааруулгагүй');
  assert.match(planSyncWarn({ ok: true, n: 1, partial: 'schedule:b1_9f' }), /ХЭСЭГЧЛЭН.*schedule:b1_9f/, 'хэсэгчилсэн');
  assert.match(planSyncWarn({ ok: true, n: 0, skipped: 'x' }), /бичигдсэнгүй: x/, 'алгассан');
  assert.match(planSyncWarn({ ok: false, error: 'e' }), /\(e\)/, 'унасан');
}
assert.ok(ups.every((u) => Object.keys(u).sort().join() === 'guitsetgel_huvi,objectid'), 'зөвхөн guitsetgel_huvi + objectid');

{
  const stored = rows.map((r) => ({ ...r, gazar_ehleh: r.objectid === 2 ? D('2025-01-01') : null, guits_ehleh: r.objectid === 3 ? D('2025-05-01') : null }));
  const linked = buildTree(stored.map((r) => ({ ...r, gazar_ehleh: null, guits_ehleh: r.objectid === 3 ? D('2025-05-01') + 3_600_000 : null })));
  const p = { empty: false, tree: linked, result: computePlan(linked, {}, today), inputs: {}, months: [], monthly: new Map(), failed: [], stored };
  const u = new Map(planProgressUpdates(p).map((x) => [x.objectid, x]));
  assert.ok(u.has(2) && u.get(2).gazar_ehleh === null, 'газрын огноо хоосон болгох нь бичигдэнэ');
  assert.ok(!u.has(3) || !('guits_ehleh' in u.get(3)), 'ижил өдөр (цагийн зөрүү) бичигдэхгүй');
}
/* 2026-11-04: мөнгөний мөрийн `guits_*` — «Cashflow хуваарилах»-ын хугацаа, Хуваариар дарж бичихгүй; бүтцийн мөрд бичнэ; `geree_*` хэзээ ч бичихгүй */
{
  const stored = rows.map((r) => ({ ...r, guits_ehleh: D('2025-05-01'), guits_duusah: D('2025-06-01'), geree_ehleh: D('2025-05-01'), cashflow_id: r.objectid === 3 ? 7 : null }));
  const linked = buildTree(stored.map((r) => ({ ...r, guits_ehleh: D('2026-01-01'), guits_duusah: null, geree_ehleh: D('2026-01-01') })));
  const p = { empty: false, tree: linked, result: computePlan(linked, {}, today), inputs: {}, months: [], monthly: new Map(), failed: [], stored };
  const u = new Map(planProgressUpdates(p).map((x) => [x.objectid, x]));
  assert.ok(!u.has(3) || (!('guits_ehleh' in u.get(3)) && !('guits_duusah' in u.get(3))), 'мөнгөний мөрийн огноо хөндөгдөхгүй');
  assert.equal(u.get(2).guits_ehleh, D('2026-01-01'), 'бүтцийн мөрд Хуваарийн огноо бичигдэнэ');
  assert.ok([...u.values()].every((x) => !('geree_ehleh' in x) && !('geree_duusah' in x)), 'geree_* багана бичихгүй');
}
{
  const { negRowsFromPlan, negDisplay, negtgelProjectPct } = await import('./negtgel.ts');
  const p = plan();
  const neg = negRowsFromPlan(p);
  assert.equal(neg.length, 4, 'мөр бүр');
  const top = neg.find((r) => r.code === '1');
  assert.equal(top.depth, 1);
  assert.ok(Math.abs(top.act - 0.6) < 1e-9, 'S 60 → 0.6');
  assert.equal(neg.find((r) => r.code === '1.1').w, 0.5, 'F 50 → 0.5');
  const { rows, calc } = negDisplay(neg);
  assert.ok(Math.abs(calc.get(1).actPct - 60) < 1e-9, 'дэлгэцийн хувь 0–100');
  assert.equal(rows.length, 4);
  void negtgelProjectPct;
}
/* 2026-11-05: автомат урсгал — өөрийн invalidate автобусын захиалагчид «дуугүй» (гогцоогүй); startPlanSync зогсоогч таймерыг цэвэрлэнэ */
{
  const { __test, startPlanSync, schedulePlanSync } = await import('./projectPlanSync.ts');
  const { register, subscribeData, invalidate } = await import('./dataBus.ts');
  register(() => {}, ['CASHFLOW_NEW']);
  const seen = [];
  const off = subscribeData(() => seen.push(__test.isMuted()));
  __test.invalidateQuiet('CASHFLOW_NEW');
  invalidate('CASHFLOW_NEW');
  off();
  assert.deepEqual(seen, [true, false], 'өөрийн бичилтийн invalidate — muted; бусдынх — биш');
  assert.equal(__test.isMuted(), false, 'дараа нь буцаад хэвийн');

  assert.equal(typeof startPlanSync(), 'function', 'window алга (сервер) → хоосон зогсоогч');
  const timers = [];
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const id = { fn, ms }; timers.push(id); return id; };
  globalThis.clearTimeout = (id) => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); };
  globalThis.window = {};
  try {
    const stop = startPlanSync();
    assert.equal(timers.length, 1, 'нээгдэхэд нэг удаа товлоно');
    assert.equal(timers[0].ms, 20_000, 'эхний ачаалалтын дараа (20 с)');
    invalidate('CASHFLOW_NEW');
    assert.equal(timers.length, 1, 'автобусын бичилт — дахин товлоно (хуучныг цуцалж)');
    assert.equal(timers[0].ms, 15_000, 'debounce 15 с');
    __test.invalidateQuiet('CASHFLOW_NEW');
    assert.equal(timers[0].ms, 15_000, 'өөрийн invalidate — товлолт хөндөгдөхгүй');
    schedulePlanSync(5);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 5, 'хуудасны хадгалалтын дараа шууд дуудвал — шинэ товлолт');
    stop();
    assert.equal(timers.length, 0, 'зогсоогч таймерыг цэвэрлэнэ');
    invalidate('CASHFLOW_NEW');
    assert.equal(timers.length, 0, 'зогссоны дараа автобус сонсохгүй');
  } finally {
    globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; delete globalThis.window;
  }
}
console.log('projectPlanSync.check: бүгд ✅');

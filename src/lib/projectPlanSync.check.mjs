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

assert.deepEqual(planProgressUpdates(plan({}, ['parcels'])), [], 'эх унасан → юу ч бичихгүй');
assert.deepEqual(planProgressUpdates({ ...plan(), empty: true }), [], 'хоосон төлөвлөгөө → юу ч бичихгүй');
assert.ok(ups.every((u) => Object.keys(u).sort().join() === 'guitsetgel_huvi,objectid'), 'зөвхөн guitsetgel_huvi + objectid');

/* ⚠️ 2026-10-29: холбосон огноо — хүснэгтийн (stored) утгаас зөрвөл бичнэ, хоосон ч */
{
  const stored = rows.map((r) => ({ ...r, gazar_ehleh: r.objectid === 2 ? D('2025-01-01') : null, guits_ehleh: r.objectid === 3 ? D('2025-05-01') : null }));
  const linked = buildTree(stored.map((r) => ({ ...r, gazar_ehleh: null, guits_ehleh: r.objectid === 3 ? D('2025-05-01') + 3_600_000 : null })));
  const p = { empty: false, tree: linked, result: computePlan(linked, {}, today), inputs: {}, months: [], monthly: new Map(), failed: [], stored };
  const u = new Map(planProgressUpdates(p).map((x) => [x.objectid, x]));
  assert.ok(u.has(2) && u.get(2).gazar_ehleh === null, 'газрын огноо хоосон болгох нь бичигдэнэ');
  assert.ok(!u.has(3) || !('guits_ehleh' in u.get(3)), 'ижил өдөр (цагийн зөрүү) бичигдэхгүй');
}
/* ⚠️ 2026-10-29: Нэгтгэл гүйцэтгэл = «Төсөл төлөвлөгөө биелэлт» (`negtgel.negRowsFromPlan`) — 0–100 → 0–1, нэг эх */
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
console.log('projectPlanSync.check: бүгд ✅');

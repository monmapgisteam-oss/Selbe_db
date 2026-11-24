/**
 * «БАГЦЫН ГҮЙЦЭТГЭЛ» — ҮЙЛ АЖИЛЛАГААНЫ СХЕМ (2026-11-24, хэрэглэгч: 2-р унтраалга). Сүлжээгүй. Тайлангууд: `pkgPlanReports.ui.check`.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/pkgPlanViews.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. Схемийн багц сонгосон үеийн «Барилга угсралт» карт — багцын бүх үе шатын гүйцэтгэл биш, зөвхөн барилгын мөр (эсвэл биет %).
 *   2. Схемийн багцын хүснэгтийн хувь бөглөх хуудасны биет % хэвээр үлдэх; эх унасан үед хуучин тоо руу чимээгүй буцах.
 */
import assert from 'node:assert/strict';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log('  ✓', name); };

/* ── «Төсөл төлөвлөгөө биелэлт»-ийн жижиг мод: Багц 1 — ТЭЗҮ (жин 10, 100%) + барилга (жин 30, 20%); Багц 2-ын мөр унтраалттай ── */
const node = (code, phase, depth, pkg, row, children = []) => {
  const x = { code, phase, depth, pkg, row, children, parent: null };
  for (const c of children) c.parent = x;
  return x;
};
const tz1 = node('1.1', 'tezu', 2, 'Багц 1', {});
const tz = node('1', 'tezu', 1, null, {}, [tz1]);
const b1 = node('5.1', 'barilga', 2, 'Багц-1', {});
const b2 = node('5.2', 'barilga', 2, 'Багц-2', { uy_shat_tootsoh: 0 });
const bar = node('5', 'barilga', 1, null, {}, [b1, b2]);
const root = node('', 'other', 0, null, null, [tz, bar]);
const values = new Map([
  [root, { P: 50, S: 45, E: 1000, G: 100 }],
  [tz, { P: 100, S: 100, E: 100, G: 10 }],
  [tz1, { P: 100, S: 100, E: 100, G: 10 }],
  [bar, { P: 30, S: 20, E: 900, G: 35 }],
  [b1, { P: 30, S: 20, E: 600, G: 30 }],
  [b2, { P: 30, S: 0, E: 300, G: 5 }],
]);
const plan = { tree: { root, nodes: [tz, tz1, bar, b1, b2] }, result: { tree: { root, nodes: [tz, tz1, bar, b1, b2] }, values }, zuragPkg: new Map() };

const { planLiveOf, pkgProgOf, withPkgProg, phaseOf } = await import('./schemPlan.ts');
const live = planLiveOf(plan);

await ok('schemPlan: багцын гүйцэтгэл = 2-р унтраалгатай бүх мөрийн жигнэсэн S/P', () => {
  near(live.pkgProg['БАГЦ1'].S, (10 * 100 + 30 * 20) / 40, 'Багц 1 S');
  near(live.pkgProg['БАГЦ1'].P, (10 * 100 + 30 * 30) / 40, 'Багц 1 P');
  assert.equal(live.pkgProg['БАГЦ2'], undefined, 'унтраалттай мөр орохгүй');
  near(pkgProgOf(live, 'Багц 1').S, 40, 'нэрээр');
  assert.deepEqual(pkgProgOf(live, 'Багц 2'), { P: 0, S: 0, E: null }, 'мөргүй багц 0%');
  assert.equal(pkgProgOf(live, null), null, 'багц сонгоогүй');
  assert.equal(pkgProgOf(null, 'Багц 1'), null, 'эх алга');
  assert.equal(phaseOf(live, 'barilga', 'Багц 1').S, 20, 'үе шатны утга хэвээр');
});

await ok('schemPlan.withPkgProg: багцын жагсаалтын хувь → багцын гүйцэтгэл; эх алга бол null (биет руу буцахгүй)', () => {
  const rows = [{ key: 'БАГЦ1', progress: 77 }, { key: 'БАГЦ2', progress: 66 }];
  assert.deepEqual(withPkgProg(rows, live).map((r) => r.progress), [40, 0]);
  assert.deepEqual(withPkgProg(rows, null).map((r) => r.progress), [null, null]);
  assert.equal(withPkgProg(null, live), null);
});

const { buildSchem } = await import('./schem.ts');
const { nodeDetail, cardStat } = await import('./schemDetail.ts');
const bagts = withPkgProg([{ key: 'БАГЦ1', label: 'Багц 1', progress: 77, missing: 0, blocks: 2, ail: 10, contractor: '' }], live);
const src = {
  headline: null, clearance: null, overall: null, progress: null, finance: null, habea: null, zov: null, review: null,
  bagts, plan: live, ma: null, approvals: null, failed: [],
};

await ok('схем: багц сонгосон үед «Барилга угсралт» карт = «Багцын гүйцэтгэл»; сонгоогүй бол үе шатны мөр', () => {
  const sel = buildSchem(src, 'Багц 1').barilga.metrics;
  assert.deepEqual(sel.slice(0, 2).map((m) => [m.label, m.value]), [['Төлөвлөгөөт', 47.5], ['Багцын гүйцэтгэл', 40]]);
  const all = buildSchem(src, null).barilga.metrics;
  assert.deepEqual(all.slice(0, 2).map((m) => [m.label, m.value]), [['Төлөвлөгөөт', 30], ['Гүйцэтгэл', 20]]);
  const st = cardStat(src, 'Багц 1', 'bar');
  assert.equal(st.label, 'Багцын гүйцэтгэл');
  assert.equal(st.value, 40);
  assert.equal(cardStat(src, null, 'bar').value, 20, 'төслийн нийтэд барилга угсралтын үе шат');
});

await ok('схемийн дэлгэрэнгүй: багцын хүснэгт «Багцын гүйцэтгэл» баганатай, утга нь багцын гүйцэтгэл', () => {
  const d = nodeDetail(src, 'barilga', 'Багц 1');
  const m = d.metrics.find((x) => x.label === 'Багцын гүйцэтгэл');
  assert.equal(m?.value, 40);
  assert.equal(d.metrics.find((x) => x.label === 'Төсөвт өртөг')?.value, 600, 'төсөв нь барилгын мөрийнх');
  const t = d.tables.find((x) => x.title === 'Багцаар');
  assert.equal(t.cols[1], 'Багцын гүйцэтгэл');
  assert.equal(t.rows[0][1].v, 40);
});

console.log(`pkgPlanViews.check: ${n} шалгалт — БҮГД ТЭНЦЛЭЭ`);

/**
 * «БАГЦЫН ГҮЙЦЭТГЭЛ» — ТАЙЛАНГУУД НЭГ ЭХЭЭС (2026-11-24, хэрэглэгч: 2-р унтраалга). Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/pkgPlanReports.ui.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. Удирдлагын тайлан · хүлээн авагчийн тайлангийн багц бүрийн хувь/хоцрогдол өөр эхээс (биет, хуваарийн муруй).
 *   2. Дэлгэрэнгүй тайлангийн §3 багцын мөрийн «Гүйцэтгэл/Төлөвлөгөө» биет/хуваарийнх; P-г хуваарийн утга дарах.
 */
import assert from 'node:assert/strict';
import { execReportFixture, inputsFixture } from './audienceReport.fixture.mjs';

const g = globalThis;
const noop = () => {};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
const elem = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, getAttribute: () => null, appendChild: (c) => c, removeChild: (c) => c, querySelector: () => null, querySelectorAll: () => [], ...listeners });
Object.assign(g, {
  window: g,
  document: { documentElement: { ...elem(), lang: 'mn' }, body: elem(), head: elem(), createElement: elem, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], ...listeners },
  localStorage: store(), sessionStorage: store(),
  matchMedia: (q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, ...listeners }),
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
  history: { pushState: noop, replaceState: noop, back: noop, length: 1, state: null },
  ...listeners,
});
if (!g.navigator) g.navigator = {};
g.fetch = () => Promise.reject(new Error('pkgPlanReports.ui.check: сүлжээгүй'));
process.on('unhandledRejection', noop);


const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log('  ✓', name); };

const { execPkgPct, execPkgAvg, execFacts } = await import('./execReport.ts');
const pp = new Map([
  ['БАГЦ1', { S: 40, P: 47.5, rows: 2, w: 40 }],
  ['БАГЦ2', { S: 10, P: 20, rows: 1, w: 10 }],
  ['БАГЦ51', { S: 100, P: 100, rows: 1, w: 50 }],
]);

await ok('удирдлагын тайлан: багцын хувь = S; дундаж = жигнэсэн (packagesAverage)', () => {
  assert.deepEqual([...execPkgPct(pp)], [['БАГЦ1', 40], ['БАГЦ2', 10], ['БАГЦ51', 100]]);
  assert.equal(execPkgPct(null).size, 0, 'эх алга — хоосон (биет руу буцахгүй)');
  const a = execPkgAvg(pp, ['БАГЦ1', 'БАГЦ2', 'БАГЦ9']);
  near(a.S, (40 * 40 + 10 * 10) / 50, 'орон сууцны дундаж S');
  near(a.P, (40 * 47.5 + 10 * 20) / 50, 'орон сууцны дундаж P');
  assert.deepEqual(execPkgAvg(pp, []), { S: null, P: null });
});

const x = execReportFixture();
x.prog.packs = x.prog.packs.map((p) => ({ ...p, planned: p.key === 'БАГЦ1' ? 47.5 : p.key === 'БАГЦ2' ? 0 : null }));
x.prog.pkgAvg = { build: { S: 34, P: 40 }, infra: { S: 26.75, P: 30 }, all: { S: 31.5, P: 36 } };

await ok('удирдлагын тайлангийн AI баримт: «Багцын гүйцэтгэл» ба төлөвлөгөө (2 орон)', () => {
  const f = execFacts(x);
  assert.ok(f.includes('бүх багцын дундаж 31.50%'), f);
  assert.ok(f.includes('- Багц 1: 32.90% (төлөвлөгөө 47.50%)'), f);
});

const { lagInputs } = await import('./audienceReportLoad.ts');
await ok('хүлээн авагчийн тайлан: багцын хоцрогдол = P − S (ижил эх); P = 0/алга бол дүгнэхгүй', () => {
  const l = lagInputs(x.prog.packs);
  assert.deepEqual(l.map((r) => r.key), ['БАГЦ1']);
  near(l[0].gap, 47.5 - 32.9, 'хоцрогдол');
  assert.equal(l[0].coverage, 100);
});

const { buildReport } = await import('./audienceReport.ts');
await ok('хүлээн авагчийн тайлан: хавсралтын «Нийт» = бүх багцын дундаж; дэд бүтцийн явц = дэд бүтцийн багцуудын дундаж', () => {
  const r = buildReport('mayor', inputsFixture({ x }));
  assert.equal(r.appendix.rows.at(-1).at(-1), '31.50%');
  const infra = r.sections.find((s) => s.key === 'infra');
  assert.ok(infra.text[0].includes('26.75%'), infra.text[0]);
});

const { planPkgOf, withPlans } = await import('./reportData.ts');
await ok('дэлгэрэнгүй тайлан: §3 багцын мөр = S/P; хуваарийн утга P-г дарахгүй', () => {
  assert.deepEqual(planPkgOf(pp, 'БАГЦ1'), { actual: 40, planned: 47.5 });
  /* 2026-11-27: төлөвлөгөө алга = null («—»); гүйцэтгэл хэмжилтгүй = 0% */
  assert.deepEqual(planPkgOf(pp, 'БАГЦ9'), { actual: 0, planned: null }, 'мөргүй багц: гүйцэтгэл 0%, төлөвлөгөө «—»');
  /* 2026-11-27 (аудит): мөргүй багцын төлөвлөгөөг Finance-ийн хуваарийн муруйгаар НӨХӨХГҮЙ — нэг мөрөнд нэг эх, тайлбартай нийцнэ */
  const f = withPlans({ pct: 0, weightSum: 0, rows: 0, stages: [{ key: 'БАГЦ9', label: 'Багц 9', rows: 1, weight: 1, ...planPkgOf(pp, 'БАГЦ9') }] }, { total: null, lag: null });
  assert.equal(f.stages[0].planned, null, 'мөргүй багц «—» хэвээр');
  const o = { pct: 25, weightSum: 50, rows: 3, stages: [{ key: 'БАГЦ1', label: 'Багц 1', rows: 2, weight: 40, actual: 40, planned: 47.5 }, { key: 'БАГЦ2', label: 'Багц 2', rows: 1, weight: 10, actual: 10, planned: null }] };
  const w = withPlans(o, { total: 30, lag: null });
  assert.deepEqual(w.stages.map((s) => s.planned), [47.5, null]);
  assert.equal(w.plannedTotal, 30, 'төслийн нийт хуваарийн төлөвлөгөө хэвээр');
});

console.log(`pkgPlanReports.ui.check: ${n} шалгалт — БҮГД ТЭНЦЛЭЭ`);

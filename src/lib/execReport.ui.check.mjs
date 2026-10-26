/**
 * УДИРДЛАГЫН ТАЙЛАН — хуваарийн хамралт · нэгтгэлийн өөрийн төлөвлөгөө · блокийн тоо (⚠️ 2026-10-22, аудит).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/execReport.ui.check.mjs
 *
 * ⚠️ `*.ui.check.mjs` нэр ЗААВАЛ — `execReport.ts` нь `Finance.tsx` · `BuildingPanel.tsx` (JSX, ArcGIS) импортлодог тул
 *    `tools/ts-alias.mjs`-ийн UI стубууд хэрэгтэй. Сүлжээгүй.
 *
 * Хамгаалж буй алдаанууд:
 *   1. Хуваарь < 95% хамарсан үед «Орон сууцны барилга угсралт хуваариас N нэгж хувиар хоцорч/түрүүлж байна» гэж
 *      ДҮГНЭХ (огноогүй ажлын жин төлөвлөгөөнд 0-ээр орж «төлөвлөсөн» хэт бага гардаг).
 *   2. «Төслийн гүйцэтгэл» (нэгтгэл, 38.9%) нь орон сууцны «Төлөвлөсөн 34.2%»-ийн хажууд зогсож, түүний төлөвлөгөө мэт
 *      уншигдах — нэгтгэлийн ӨӨРИЙН төлөвлөгөө (`negtgelProjectPlan`, 71.9%) хамт харагдах ёстой.
 *   3. §3 «111 блок» (газрын зургийн полигон) — өөрийн хүснэгт/Дашбоардын 113-тай зөрөх.
 *   4. Нэг эгнээ: бодит 23.1% · төлөвлөсөн 34.2% · зөрүү −9.6 (харагдахгүй 24.55%-иас) — зөрүү нь харагдаж буй тооноос.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ⚠️ Хөтөчийн хамгийн бага глобалууд (импортоос ӨМНӨ) — `model.ui.check.mjs`-ийн дэд олонлог */
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
g.fetch = () => Promise.reject(new Error('execReport.ui.check: сүлжээгүй'));
process.on('unhandledRejection', noop);

const { negtgelProjectPlan, execFindings, execFacts, householdsMissingOf } = await import('./execReport.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

/* ── 1. Нэгтгэлийн ӨӨРИЙН төлөвлөгөө — `negtgelProjectPct`-ийн ижил томьёо, `planPct`-аар ── */
ok('negtgelProjectPlan = Σ 1-р түвшний (төсөлд эзлэх × төлөвлөгөө) ÷ 100 (амьдаар 71.9%)', () => {
  const rows = [
    { oid: 0, code: '', name: 'Нийт', depth: 0 },
    { oid: 1, code: '1', name: 'ТЭЗҮ', depth: 1 },
    { oid: 2, code: '2', name: 'Зураг', depth: 1 },
    { oid: 3, code: '5', name: 'Барилга', depth: 1 },
    { oid: 4, code: '6', name: 'Хүлээлгэх', depth: 1 },
    { oid: 5, code: '5.1', name: 'Бэлтгэл', depth: 2 },
  ];
  const calc = new Map([
    [0, { inProject: 100, planPct: 1 }],
    [1, { inProject: 5, planPct: 100 }],
    [2, { inProject: 10, planPct: 98.78 }],
    [3, { inProject: 79, planPct: 65.85 }],
    [4, { inProject: 0, planPct: null }],
    [5, { inProject: 3.95, planPct: 99.6 }],
  ]);
  const v = negtgelProjectPlan(rows, calc);
  assert.ok(Math.abs(v - (5 + 9.878 + 52.0215)) < 1e-9, String(v));
  /* жинтэй мөрийн төлөвлөгөө алга → null (0 гэж тооцохгүй) */
  calc.set(3, { inProject: 79, planPct: null });
  assert.equal(negtgelProjectPlan(rows, calc), null);
  assert.equal(negtgelProjectPlan([], new Map()), null, 'мөргүй → null');
});

/* ── 2. Дүгнэлт — хуваарийн хамралт < 95% бол хоцрогдол/түрүүлэлт ДҮГНЭХГҮЙ ── */
const base = (prog) => ({
  gdash: {
    budget: 100, contract: 95, progress: 38.9, progressSrc: 'negtgel', progressPlan: 71.85, packages: 74, types: 7, landPct: null,
    land: { total: 0, cleared: 0, remaining: 0, areaM2: 0, byStatus: [], reasons: [] },
    hse: { date: '2026-10-20', workers: 10, equipment: 2, manHours: 80 }, byType: [], bySource: [],
  },
  prog: {
    blocks: 113, households: 8387, householdsMissing: 0, noData: 0, asOf: '2026-10-19',
    actual: 24.55, planned: 34.19, gap: 9.64, actualLag: 24.55, planExcluded: [], planCoverage: 59.08, planFailed: 0,
    packs: [], levels: [], ...prog,
  },
  fin: { planTotal: 0, given: null, givenContracted: 0, givenOther: 0, share: null, remain: null, rows: [] },
  zov: { total: 0, ok: 0, wait: 0, no: 0, unknown: 0, byBagts: [], issues: [] },
  fetchedAt: 0,
});
ok('хамралт 59.1% — «хоцорч байна» БИШ, хамралтын шалтгаантай мөр', () => {
  const f = execFindings(base({})).filter((x) => x.area === 'Гүйцэтгэл');
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.ok(f[0].text.includes('59.1%') && f[0].text.includes('дүгнэсэнгүй'), f[0].text);
  assert.ok(!f.some((x) => /хоцорч байна|түрүүлж байна/.test(x.text)));
});
ok('хамралт мэдэгдэхгүй (null) — мөн дүгнэхгүй', () => {
  const f = execFindings(base({ planCoverage: null })).filter((x) => x.area === 'Гүйцэтгэл');
  assert.ok(f[0].text.includes('—') && !/хоцорч байна/.test(f[0].text), f[0].text);
});
ok('хамралт 100% — урьдын адил «хоцорч байна» (төлөвлөгөө, бодит нь харагдаж буй тоо)', () => {
  const f = execFindings(base({ planCoverage: 100 })).filter((x) => x.area === 'Гүйцэтгэл');
  assert.equal(f.length, 1);
  assert.ok(f[0].text.startsWith('Орон сууцны барилга угсралт хуваариас 9.6 нэгж хувиар хоцорч байна (төлөвлөгөө 34.2%, бодит 24.6%)'), f[0].text);
  const a = execFindings(base({ planCoverage: 100, gap: -2 })).filter((x) => x.area === 'Гүйцэтгэл');
  assert.ok(a[0].text.includes('түрүүлж байна'), a[0].text);
});
ok('AI баримт — орон сууцны багцаар, хамралт ба нэгтгэлийн төлөвлөгөөтэй', () => {
  const t = execFacts(base({}));
  assert.ok(t.includes('Бодит (орон сууцны багцууд): 24.6%'), 'бүх багц биш — орон сууц');
  assert.ok(t.includes('Хуваарийн хамралт (төлөвлөгөөнд огноотой ажлын жин): 59.1% — 95%-иас бага'), t);
  assert.ok(t.includes('өөрийн төлөвлөгөө (нэгтгэл гүйцэтгэл): 71.9%'), t);
  assert.ok(!execFacts(base({ planCoverage: 100 })).includes('95%-иас бага'));
});

/* ── 3. Эх кодын тулгалт — дэлгэц (React/ArcGIS Node-д рендерлэхгүй) ── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const ER = strip(readFileSync(new URL('./execReport.ts', import.meta.url), 'utf8'));
const UI = strip(readFileSync(new URL('../modules/ExecReport.tsx', import.meta.url), 'utf8'));
ok('§3 блокийн тоо — түвшний хүснэгтийн олонлог (113), газрын зургийн полигон (111) биш', () => {
  assert.match(ER, /blocks: lvKeys\.size/);
  assert.ok(!/blocks: bld\.blocks/.test(ER), 'хуучин `bld.blocks` (полигон) буцав');
  assert.match(ER, /noData: lvNoData/, '«бөглөгдөөгүй» ч ТЭР олонлогоор');
  /* ⚠️ 2026-10-26 (аудит): багц бүрийн блок ч ТЭР олонлогоор — мөрүүдийн нийлбэр = «Нийт» */
  assert.match(ER, /blocks: lv \? lv\.size : blockCount\(p\)/, 'багцын блок — түвшний олонлогоос (полигон биш)');
  assert.match(ER, /householdsMissing: lv \? householdsMissingOf\(lv, /, 'багцын «дутуу» өрх полигонгүй блокийг тоолно');
});
ok('толгой: «Төслийн гүйцэтгэл» өөрийн төлөвлөгөөтэй, «Төлөвлөсөн» хамралттай', () => {
  assert.match(UI, /x\.gdash\.progressPlan != null \? ` \(\$\{tr\('төлөвлөгөө \{0\}', pct\(x\.gdash\.progressPlan, 1\)\)\}\)`/);
  assert.match(UI, /coverageNote\(x\.prog\.planCoverage\)/);
});
ok('§3 эгнээ: бодит нь зөрүүний тал, дутуу хамралтад «хоцрогдол/түрүүлэлт» биш', () => {
  assert.match(UI, /x\.prog\.planExcluded\.length \? x\.prog\.actualLag : x\.prog\.actual/);
  assert.match(UI, /!coverageOk\(x\.prog\.planCoverage\) \? tr\('хуваарь дутуу — дүгнэхгүй'\)/);
  assert.match(UI, /plan=\{coverageOk\(x\.prog\.planCoverage\) \? x\.prog\.planned : null\}/, 'дутуу хамралтад PlanMeter «хоцрогдол» өнгөөр будахгүй');
});
ok('ангилал: «Инженерийн дэд бүтэц» өөрийн биет хувьтай (`typePhysNow`)', () => {
  assert.match(ER, /const infra = typePhysNow\(fin, cf, INFRA_TYPE, nowYm\);/);
  assert.match(ER, /if \(infra\) catPct\.set\(INFRA_TYPE, infra\.pct\);/);
});

/* ── ⚠️ 2026-10-23: полигонгүй блок ч өрхийн мэдээлэлгүйд тоологдоно ── */
ok('householdsMissingOf: AIL_TOO хоосон полигон + полигонгүй блок, дээд хязгаар нь блокийн тоо', () => {
  const keys = new Set(['Б1|1', 'Б1|2', 'Б1|3', 'Б2|1']);
  assert.equal(householdsMissingOf(keys, ['Б1|1', 'Б1|2', 'Б1|3', 'Б2|1'], 0), 0, 'бүгд полигонтой, өрхтэй');
  assert.equal(householdsMissingOf(keys, ['Б1|1', 'Б1|2'], 0), 2, 'полигонгүй 2 блок');
  assert.equal(householdsMissingOf(keys, ['Б1|1', 'Б1|2'], 1), 3, 'хоосон 1 + полигонгүй 2');
  assert.equal(householdsMissingOf(keys, [], 9), 4, 'дээд хязгаар — блокийн тоо');
  assert.ok(ER.includes('householdsMissingOf(lvKeys, uniqueBlocks(bld.rows).map((b) => b.key), bld.householdsMissing)'), 'prog.householdsMissing полигонгүй блокийг тоолно');
});

console.log(`execReport.ui.check: ${n} шалгуур ✅`);
process.exit(0);

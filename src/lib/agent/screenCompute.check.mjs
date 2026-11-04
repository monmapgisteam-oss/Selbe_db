/**
 * AI ТУСЛАХЫН `compute` — ДЭЛГЭЦИЙН ТУСЛАХТАЙ ЯГ ТЭНЦҮҮ (2026-10-19, сүлжээгүй).
 *
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/agent/screenCompute.check.mjs
 *
 * Хамгаалах алдаа: агент санхүүгийн нийт дүн / олгосон хувь / багцын хоцрогдлыг түүхий мөрөөс өөрөө бодож
 * дэлгэцээс зөрдөг байв. `finance_summary` · `pkg_plan` нь дэлгэцийн функцүүдийг (`paidShareOf`,
 * `Budget`, `lagOf`/`physLatest`/`lagLevel`/`planPctAt`) ДАХИН бичилгүй хослуулах ёстой:
 *  1. `financeSummaryOf` — `paidShareOf`-ийн ЯГ тэр тоо, төсөв нь `Budget.total`; дүнгүй HO → `null` (0 БИШ).
 *  2. `pkgPlanOf` — `lagOf` байвал түүний planned/gap, үгүй бол fallback; хэмжилт ч хуваарь ч алга → мөргүй.
 *  3. Эх сурвалжийн хатуу шүүлт: `ds:cashflow2` = `CF_WORK_WHERE` (сарын мөр орохгүй), IoT OID = `objectid`;
 *     `andWhere` нь загварын `OR`-ыг хаалтад хийнэ.
 *  4. Opus 5.5: төлөвлөгөө `thinking` блокоос (зөвхөн ```plan хашилттай), огтолсон түүхийн бодолт хасагдана.
 *  5. `tools.ts` / `screenCompute.ts` нь дэлгэцийн функцүүдийг ИМПОРТЛОДОГ (хуулбар биш).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { financeSummaryOf, pkgPlanOf } from './screenCompute.ts';
import { paidShareOf, PAID_SHARE_CONTRACTED } from '../paidShare.ts';
import { andWhere, whereError } from './tools.ts';
import { DATASET_BY_ID } from './datasets.ts';
import { planTextOf, stripThinking } from './client.ts';
import { CF_WORK_WHERE } from '../services.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

/* ── Хуурамч өгөгдөл (`paidShare.check.mjs`-ийн хэлбэр) ── */
const CF = (o) => ({
  objectid: o.oid, bagts: o.pkg, bagts2: o.pkg2 ?? null, bagts_tuvshin1: o.sec ?? '2',
  ho_dungiin_tailbar: o.note ?? '', geree_dun: o.contract ?? null,
});
const cf = [
  CF({ oid: 1, pkg: 'БАГЦ-1', note: PAID_SHARE_CONTRACTED, contract: 800 }),
  CF({ oid: 2, pkg: 'БАГЦ-2', note: PAID_SHARE_CONTRACTED, contract: 1200 }),
  CF({ oid: 3, pkg: 'БАГЦ-3', note: 'Урьдчилсан тооцоо', contract: 500 }),
  CF({ oid: 4, pkg: 'БАГЦ-9', note: PAID_SHARE_CONTRACTED, contract: 999, sec: '5' }),
];
const HO = (o) => ({ objectid: o.oid, geree_kod: o.pkg, bagts: o.pkg, dun: o.dun, tulult_turul: 'Гүйцэтгэл' });
const ho = [
  HO({ oid: 1, pkg: 'Багц-1', dun: 200 }),
  HO({ oid: 2, pkg: 'Багц-2', dun: 300 }),
  HO({ oid: 3, pkg: 'Багц-3', dun: 50 }),
  HO({ oid: 4, pkg: 'Багц-1-4', dun: 40 }),
  HO({ oid: 5, pkg: 'Багц-2', dun: null }),
];
const budget = { total: 2_493_041_880_532, orderTotal: 2_100_000_000_000, contract: 2000 };

console.log('\n1. finance_summary = дэлгэцийн туслахууд');
{
  const s = financeSummaryOf(budget, cf, ho);
  const ref = paidShareOf(cf, ho);
  ok('төсөв = Budget.total (Excel-ийн НИЙТ хүрээ), захирамж = Budget.orderTotal', () => {
    assert.equal(s.budget, budget.total);
    assert.equal(s.orderTotal, budget.orderTotal);
  });
  ok('гэрээлсэн · олгосон · тоологч · хувь — paidShareOf-ийн ЯГ тэр утга', () => {
    assert.equal(s.contracted, ref.contract);
    assert.equal(s.paid, ref.paid);
    assert.equal(s.paidContracted, ref.paidContracted);
    assert.equal(s.paidOther, ref.paidOther);
    assert.equal(s.paidPct, ref.pct);
    assert.equal(s.contracted, 2000, '5-р хэсэг ба гэрээгүй мөр хуваарьт орохгүй');
  });
  ok('мөргүй эх сурвалж → төсөв · захирамж · гэрээлсэн null (0 ₮ биш)', () => {
    const e = financeSummaryOf({ total: 0, orderTotal: 0, contract: 0, byType: [] }, [], []);
    assert.equal(e.budget, null);
    assert.equal(e.orderTotal, null);
    assert.equal(e.contracted, null);
    assert.equal(e.paid, null);
  });
  ok('бүх HO дүн хоосон → олголт null (0 ₮ биш), хувь null', () => {
    const e = financeSummaryOf(budget, cf, [HO({ oid: 9, pkg: 'Багц-1', dun: null })]);
    assert.equal(e.paid, null);
    assert.equal(e.paidPct, null);
  });
}

console.log('\n2. pkg_plan = дэлгэцийн функцүүд (lagOf / physLatest / lagLevel)');
{
  const months = new Map([
    ['Багц 1', [{ label: '2026-09', phys: 20, physAt: '2026-09-20' }]],
    ['Багц 2', [{ label: '2026-09', phys: 50, physAt: '2026-09-20' }]],
    ['Багц 3', [{ label: '2026-09', phys: null }]],
    ['Багц 4', [{ label: '2026-09', phys: 10, physAt: '2026-09-10' }]],
    ['Багц 5', [{ label: '2026-09', phys: 10, physAt: '2026-09-10' }]],
  ]);
  const lags = { 'Багц 1': { month: '2026-09', planned: 35, actual: 20, gap: 15 }, 'Багц 2': { month: '2026-09', planned: 48, actual: 50, gap: -2 } };
  const keyOf = (ms) => [...months.entries()].find(([, v]) => v === ms)?.[0];
  const deps = {
    lagOf: (ms) => lags[keyOf(ms)] ?? null,
    physLatest: (ms) => ms.at(-1).phys,
    lagLevel: (gap) => (gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null),
    planAt: (key) => (key === 'Багц 4' || key === 'Багц 5' ? 16 : null),
    isHousing: (key) => key !== 'Багц 5',
  };
  const rows = pkgPlanOf(months, deps);
  const by = Object.fromEntries(rows.map((r) => [r.bagts, r]));
  ok('lagOf байвал planned/gap/month нь ЯГ түүнийх, level = lagLevel(gap)', () => {
    assert.deepEqual(
      { p: by['Багц 1'].planned, g: by['Багц 1'].gap, m: by['Багц 1'].month, l: by['Багц 1'].level, a: by['Багц 1'].actual },
      { p: 35, g: 15, m: '2026-09', l: 'red', a: 20 },
    );
    assert.equal(by['Багц 2'].level, null, 'түрүүлсэн (gap < 0) → анхааруулгагүй');
  });
  ok('муруйн кэшгүй (lagOf null) → ТУХ-ийн fallback planAt; gap = planned − actual', () => {
    assert.equal(by['Багц 4'].planned, 16);
    assert.equal(by['Багц 4'].gap, 6);
    assert.equal(by['Багц 4'].level, 'yellow');
  });
  ok('орон сууц БИШ багцад planAt fallback хэрэглэхгүй (ТУХ-тэй ижил) — planned/gap null', () => {
    assert.equal(by['Багц 5'].planned, null);
    assert.equal(by['Багц 5'].gap, null);
    assert.equal(by['Багц 5'].actual, 10);
  });
  ok('хамралт < 95% → gap/level null, coverage буцаана; ≥ 95% → хэвийн', () => {
    const ms = new Map([['Б', [{ label: '2026-09', phys: 20, physAt: '2026-09-10' }]], ['В', [{ label: '2026-09', phys: 20, physAt: '2026-09-10' }]]]);
    const lg = { 'Б': { month: '2026-09', planned: 8.6, actual: 20, gap: -11.4, coverage: 8.6 }, 'В': { month: '2026-09', planned: 40, actual: 20, gap: 20, coverage: 100 } };
    const k2 = (m) => [...ms.entries()].find(([, v]) => v === m)?.[0];
    const r2 = Object.fromEntries(pkgPlanOf(ms, { ...deps, lagOf: (m) => lg[k2(m)] ?? null, isHousing: () => true }).map((r) => [r.bagts, r]));
    assert.deepEqual([r2['Б'].gap, r2['Б'].level, r2['Б'].coverage, r2['Б'].planned], [null, null, 8.6, 8.6], 'дүгнэхгүй, тоо хэвээр');
    assert.deepEqual([r2['В'].gap, r2['В'].level, r2['В'].coverage], [20, 'red', 100]);
  });
  ok('хэмжилтгүй ба хуваарьгүй багц мөр БОЛОХГҮЙ (null ≠ 0); хамгийн хоцорсон эхэнд', () => {
    assert.equal(by['Багц 3'], undefined);
    assert.deepEqual(rows.map((r) => r.bagts), ['Багц 1', 'Багц 4', 'Багц 2', 'Багц 5']);
  });
}

console.log('\n3. Эх сурвалжийн хатуу шүүлт');
ok('ds:cashflow2.baseWhere = CF_WORK_WHERE (сарын S-Curve мөр агентад орохгүй)', () => {
  assert.equal(DATASET_BY_ID['ds:cashflow2']?.baseWhere, CF_WORK_WHERE);
});
ok('IoT датасетууд OID = objectid', () => {
  const iot = Object.values(DATASET_BY_ID).filter((d) => d.id.startsWith('ds:iot_'));
  assert.ok(iot.length > 0);
  for (const d of iot) assert.equal(d.oid, 'objectid', d.id);
});
ok('andWhere: суурь шүүлт ∧ (загварын where) — OR нь шүүлтийг тойрохгүй', () => {
  assert.equal(andWhere(undefined, " a = 1 "), 'a = 1');
  assert.equal(andWhere(CF_WORK_WHERE, '1=1'), CF_WORK_WHERE);
  assert.equal(andWhere(CF_WORK_WHERE, "x = 1 OR y = 2"), `(${CF_WORK_WHERE}) AND (x = 1 OR y = 2)`);
});
ok('whereError: хаалтаас зугтах / тэнцвэргүй / тайлбар — татгалзана; литерал доторх хаалт зөв', () => {
  assert.equal(whereError('a = 1 AND (b = 2 OR c = 3)'), null);
  assert.equal(whereError("name = 'a) OR (1=1'"), null, 'литерал доторх хаалт тоологдохгүй');
  assert.equal(whereError("name = 'O''Brien'"), null, "'' escape");
  assert.equal(whereError(''), null);
  assert.ok(whereError('1=1) OR (1=1'), 'эрт хаах хаалт — шүүлтийг тойрно');
  assert.ok(whereError('(a = 1'), 'хаагдаагүй хаалт');
  assert.ok(whereError("a = 'x"), 'хаагдаагүй литерал');
  assert.ok(whereError('a = 1 -- )'), 'тайлбар');
  assert.ok(whereError('a = 1 /* x */'), 'блок тайлбар');
  assert.ok(whereError('a = 1; DROP'), ';');
});

console.log('\n4. Claude Opus 5.5 — төлөвлөгөө ба бодолтын блок');
const FENCE = '```';
ok('текст блок байвал түүнийг', () => {
  assert.equal(planTextOf([{ type: 'text', text: 'алхам' }, { type: 'tool_use', id: 'a', name: 'x', input: {} }]), 'алхам');
});
ok('текстгүй — бодолтын блокоос ЗӨВХӨН ```plan хашилттай хэсэг', () => {
  const raw = `бодол…\n${FENCE}plan\n1. Нэг\n2. Хоёр\n${FENCE}\nцааш`;
  assert.equal(planTextOf([{ type: 'thinking', thinking: raw, signature: 's' }]), `${FENCE}plan\n1. Нэг\n2. Хоёр\n${FENCE}`);
  assert.equal(planTextOf([{ type: 'thinking', thinking: 'хашилтгүй түүхий бодол', signature: 's' }]), '', 'түүхий бодол харагдахгүй');
  assert.equal(planTextOf([{ type: 'thinking', thinking: '', signature: 's' }]), '', 'хоосон (display omitted) — унахгүй');
});
ok('stripThinking: бодолт хасагдана, text/tool_use хэвээр; хоосон assistant → «…»', () => {
  const h = [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 't', name: 'x', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '1' }] },
    { role: 'assistant', content: [{ type: 'redacted_thinking', data: 'd' }] },
  ];
  stripThinking(h);
  assert.deepEqual(h[1].content.map((b) => b.type), ['tool_use']);
  assert.deepEqual(h[3].content, [{ type: 'text', text: '…' }]);
});

console.log('\n5. Дэлгэцийн функцийг ИМПОРТЛОДОГ (хуулбар биш)');
ok('screenCompute.ts → paidShareOf, loadBudget, Finance.lagOf/physLatest/lagLevel/pkgMonthsMap, planPctAt', () => {
  const src = readFileSync(new URL('./screenCompute.ts', import.meta.url), 'utf8');
  for (const s of ["from '@/lib/paidShare'", 'paidShareOf(', "import('@/lib/live')", 'loadBudget()', 'F.lagOf', 'F.physLatest', 'F.lagLevel', 'F.pkgMonthsMap', 'PP.planPctAt', 'TD.measDayOf']) {
    assert.ok(src.includes(s), s);
  }
  const tools = readFileSync(new URL('./tools.ts', import.meta.url), 'utf8');
  assert.ok(/'finance_summary', 'pkg_plan'/.test(tools), 'compute enum');
  assert.ok(tools.includes('andWhere(src.baseWhere'), 'query_feature суурь шүүлт');
});

console.log(`\n✅ screenCompute: ${n} шалгалт давлаа`);

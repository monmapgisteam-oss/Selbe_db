/**
 * AI ТУСЛАХЫН `compute` — ДЭЛГЭЦИЙН ТУСЛАХТАЙ ЯГ ТЭНЦҮҮ (2026-10-19, сүлжээгүй).
 *
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/agent/screenCompute.check.mjs
 *
 * Хамгаалах алдаа: агент санхүүгийн нийт дүн / олгосон хувь / багцын хоцрогдлыг түүхий мөрөөс өөрөө бодож
 * дэлгэцээс зөрдөг байв. `finance_summary` · `pkg_plan` нь дэлгэцийн функцүүдийг (`paidShareOf`,
 * `Budget`, `lagOf`/`physLatest`/`lagLevel`/`planPctAt`) ДАХИН бичилгүй хослуулах ёстой:
 *  1. `financeSummaryOf` — `paidShareOf`-ийн ЯГ тэр тоо, төсөв нь `Budget.total`; дүнгүй HO → `null` (0 БИШ).
 *  2. `pkgPlanOf` — actual/planned/gap/level нь «Багцын явц»-ийн «Багцын гүйцэтгэл» (S, P, P − S, lagLevel; 2026-11-27);
 *     биет/муруй (`physActual`, `schedPlanned`, `schedGap`) — `lagOf` байвал түүнийх, үгүй бол fallback.
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

console.log('\n2. pkg_plan = «Багцын явц» (planPkgProgress S/P, pkgGapOf, lagLevel) + биет/муруй тусдаа');
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
    plan: null,
    lagOf: (ms) => lags[keyOf(ms)] ?? null,
    physLatest: (ms) => ms.at(-1).phys,
    lagLevel: (gap) => (gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null),
    planAt: (key) => (key === 'Багц 4' || key === 'Багц 5' ? 16 : null),
    isHousing: (key) => key !== 'Багц 5',
  };
  const rows = pkgPlanOf(months, deps);
  const by = Object.fromEntries(rows.map((r) => [r.bagts, r]));
  ok('ТУСДАА хэмжүүр: lagOf байвал schedPlanned/schedGap/month нь ЯГ түүнийх, physActual = physLatest', () => {
    assert.deepEqual(
      { p: by['Багц 1'].schedPlanned, g: by['Багц 1'].schedGap, m: by['Багц 1'].month, a: by['Багц 1'].physActual },
      { p: 35, g: 15, m: '2026-09', a: 20 },
    );
    assert.equal(by['Багц 2'].schedGap, -2);
  });
  ok('муруйн кэшгүй (lagOf null) → ТУХ-ийн fallback planAt; schedGap = schedPlanned − physActual', () => {
    assert.equal(by['Багц 4'].schedPlanned, 16);
    assert.equal(by['Багц 4'].schedGap, 6);
  });
  ok('орон сууц БИШ багцад planAt fallback хэрэглэхгүй (ТУХ-тэй ижил) — schedPlanned/schedGap null', () => {
    assert.equal(by['Багц 5'].schedPlanned, null);
    assert.equal(by['Багц 5'].schedGap, null);
    assert.equal(by['Багц 5'].physActual, 10);
  });
  ok('хамралт < 95% → schedGap null, coverage буцаана; ≥ 95% → хэвийн', () => {
    const ms = new Map([['Б', [{ label: '2026-09', phys: 20, physAt: '2026-09-10' }]], ['В', [{ label: '2026-09', phys: 20, physAt: '2026-09-10' }]]]);
    const lg = { 'Б': { month: '2026-09', planned: 8.6, actual: 20, gap: -11.4, coverage: 8.6 }, 'В': { month: '2026-09', planned: 40, actual: 20, gap: 20, coverage: 100 } };
    const k2 = (m) => [...ms.entries()].find(([, v]) => v === m)?.[0];
    const r2 = Object.fromEntries(pkgPlanOf(ms, { ...deps, lagOf: (m) => lg[k2(m)] ?? null, isHousing: () => true }).map((r) => [r.bagts, r]));
    assert.deepEqual([r2['Б'].schedGap, r2['Б'].coverage, r2['Б'].schedPlanned], [null, 8.6, 8.6], 'дүгнэхгүй, тоо хэвээр');
    assert.deepEqual([r2['В'].schedGap, r2['В'].coverage], [20, 100]);
  });
  ok('«Төсөл төлөвлөгөө биелэлт» уншигдаагүй (plan null) → actual/planned/gap/level null (0% БИШ); биет/муруйгүй багц мөргүй', () => {
    for (const r of rows) assert.deepEqual([r.actual, r.planned, r.gap, r.level], [null, null, null, null], r.bagts);
    assert.equal(by['Багц 3'], undefined);
    assert.deepEqual(rows.map((r) => r.bagts), ['Багц 1', 'Багц 4', 'Багц 2', 'Багц 5'], 'муруйн хоцрогдлоор');
  });

  /* 2026-11-27 (аудит №20): «Багцын явц» (PkgProg) жагсаалттай ЯГ тэр тоо — S, P, gap = P − S (`pkgGapOf`), level = lagLevel(gap).
     Урьд нь actual = биет %, planned = муруй, gap/level муруйнаас тул «Багц 1: бодит 20%, төл. 35%, хоцрогдол 15 (улаан)» гэж
     хариулдаг байсан атал дэлгэц «62% / 66% · зөрүү 4 · анхааруулгагүй» харуулдаг байв */
  const plan = new Map([
    ['Багц 1', { S: 62, P: 66 }],
    ['Багц 2', { S: 40, P: 52.5 }],
    ['Багц 4', { S: null, P: 7 }],
    ['Багц 6', { S: 10, P: 10 }],
  ]);
  const pr = pkgPlanOf(months, { ...deps, plan });
  const pb = Object.fromEntries(pr.map((r) => [r.bagts, r]));
  /* PkgProg.tsx-ийн `pkgGapOf` ба Finance-ийн `lagLevel`-ийн ЯГ тэр томьёо (импортлох боломжгүй — @arcgis/core DOM шаардана) */
  const pkgGapOf = (v) => (v?.P ?? 0) - (v?.S ?? 0);
  ok('actual = S, planned = P, gap = pkgGapOf, level = lagLevel(gap) — багц бүрт', () => {
    for (const r of pr) {
      const v = plan.get(r.bagts);
      assert.equal(r.actual, v?.S ?? 0, r.bagts);
      assert.equal(r.planned, v?.P ?? 0, r.bagts);
      assert.equal(r.gap, pkgGapOf(v), r.bagts);
      assert.equal(r.level, deps.lagLevel(pkgGapOf(v)), r.bagts);
    }
    assert.deepEqual([pb['Багц 1'].actual, pb['Багц 1'].planned, pb['Багц 1'].gap, pb['Багц 1'].level], [62, 66, 4, null], 'муруйн улаан (15) биш');
    assert.deepEqual([pb['Багц 2'].gap, pb['Багц 2'].level], [12.5, 'red']);
    assert.deepEqual([pb['Багц 4'].actual, pb['Багц 4'].gap, pb['Багц 4'].level], [0, 7, 'yellow'], 'хэмжилтгүй S = 0%');
  });
  ok('биет/муруйн тоо ТУСДАА талбарт хэвээр', () => {
    assert.deepEqual([pb['Багц 1'].physActual, pb['Багц 1'].schedPlanned, pb['Багц 1'].schedGap], [20, 35, 15]);
  });
  ok('уншигдсан үед багц БҮР мөр (PkgProg шиг): мөргүй багц 0%, зөвхөн «Багцын гүйцэтгэл»-тэй багц ч орно', () => {
    assert.deepEqual([pb['Багц 3'].actual, pb['Багц 3'].planned, pb['Багц 3'].gap], [0, 0, 0]);
    assert.deepEqual([pb['Багц 6'].actual, pb['Багц 6'].physActual, pb['Багц 6'].schedPlanned], [10, null, null]);
    assert.equal(pr.length, 6);
    assert.deepEqual(pr.slice(0, 3).map((r) => r.bagts), ['Багц 2', 'Багц 4', 'Багц 1'], 'хамгийн их хоцорсон эхэнд');
  });
  ok('PkgProg-ийн томьёо өөрчлөгдвөл энэ шалгалт ч шинэчлэгдэнэ', () => {
    const src = readFileSync(new URL('../../modules/PkgProg.tsx', import.meta.url), 'utf8');
    assert.match(src, /export const pkgGapOf = \(v: PlanPkgProgress \| null \| undefined\): number => \(v\?\.P \?\? 0\) - \(v\?\.S \?\? 0\);/);
    assert.match(src, /const execPct = plan \? v\?\.S \?\? 0 : null;/);
    const sc = readFileSync(new URL('./screenCompute.ts', import.meta.url), 'utf8');
    assert.ok(sc.includes('loadPlanPkgProgress()'), 'pkg_plan нь «Багцын гүйцэтгэл»-ийг ачаална');
    assert.match(sc, /loadPlan\.catch\([\s\S]{0,160}return null;/, 'эх унасан (throw) → уншигдаагүй (null)');
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
ok('2026-11-27 (аудит №41): ds:pkg_progress-ийн хоцролтын тэмдэг pkg_plan-тай ижил — төлөвлөгөө − бодит, эерэг = хоцорсон', () => {
  const w = DATASET_BY_ID['ds:pkg_progress']?.warn ?? '';
  assert.ok(w.includes('`tolovlogoot_huvi − bagts_guitsetgel_huvi_1`'), w);
  assert.match(w, /эерэг бол төлөвлөгөөнөөс ХОЦОРСОН/);
  assert.doesNotMatch(w, /`bagts_guitsetgel_huvi_1 − tolovlogoot_huvi`/);
});
const { WASTE_DISTANCE_FIELD, WASTE_BIN_DEPTH_MM } = await import('./datasets.ts');
const { SENSORS } = await import('@/lib/sensors.ts');
ok('2026-11-27: хогийн савны зайн талбар — AI-д мм (дүүрэлтийн % биш); савны гүн sensors.ts-ийн derive-тэй ижил', () => {
  const m = SENSORS.flatMap((s) => s.metrics).find((x) => x.field === WASTE_DISTANCE_FIELD);
  assert.ok(m?.derive, 'зайн талбар sensors.ts-д derive-тэй');
  assert.equal(m.derive(WASTE_BIN_DEPTH_MM), 0, 'гүнтэй тэнцүү зай = 0%');
  assert.equal(m.derive(WASTE_BIN_DEPTH_MM / 2), 50);
  const desc = Object.values(DATASET_BY_ID).find((d) => d.fields?.[WASTE_DISTANCE_FIELD])?.fields[WASTE_DISTANCE_FIELD] ?? '';
  assert.match(desc, /мм/);
  assert.match(desc, /% БИШ/);
  assert.doesNotMatch(desc, /^Хогийн савны дүүрэлт \(%\)/);
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

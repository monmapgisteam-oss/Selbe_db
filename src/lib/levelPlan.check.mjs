/**
 * 6 ТҮВШНИЙ ХУВААРЬ (L1–L6) — цэвэр туслахуудын шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/levelPlan.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ӨДӨР/САР. «Өнөөдөр» орон нутгийн өдрөөр (UTC шөнө дунд); 7 хоног Даваагаас; сарын хувийг ӨДРИЙН ТООНД
 *      жигд хуваана (10-р сар 31, 11-р сар 30 өдөр) — сар дамнасан 7 хоногийн нийлбэр зөв.
 *   2. null ≠ 0. Хуваарьгүй блокийн сарын/7 хоногийн нүд null (0 БИШ); давхцалгүй хугацаа 0 (ажилгүй).
 *   3. ӨСӨЛТ. Хуримтлагдсан цувааны сар бүрийн өсөлтийн нийлбэр = эцсийн хуримтлал (pctCum-ийн жил бүрийн тэглэлт
 *      энд хамаарахгүй — өөрсдөө бодсон цуваа).
 *   4. БАГЦ. Фикстурын модноос багцууд: «Багц-16» бүлэг (хүүхдүүд нь 16.1…) багц БИШ; олон багцын «БАГЦ 1- 4» ба
 *      «Бүгд» багц БИШ; Багц-1 нь 20 блоктой; үе шатын индекс зураг төсөл/газар/сонгонд Багц-1-ийг олно.
 *   5. ДЭД БҮЛЭГ. Б1-ийн хүүхдүүд + Б2…Б5 (15 бүлэг), жин «Б.»-д эзлэх 0–100; 9F/12F-ийн давхардсан шошгод
 *      ЭХНИЙ хуудас; алдаатай огноо (эхлэх > дуусах) хос нь null.
 *   6. ТӨЛӨВ. 100% → done; дуусах өнгөрсөн → late; төлөвлөгөөнөөс 10+ пункт → behind; огноогүй → none;
 *      milestone огноогүй → missing (улаан). Гүйцэтгэл МЭДЭГДЭХГҮЙ + дуусах өнгөрсөн → none (late БИШ, null ≠ 0).
 *   7. ЗУРВАСЫН ОГНОО төлөвлөгөөт хувьтай нэг суурьтай: өвгөөс зөвхөн ӨӨРИЙН ХАДГАЛСАН ижил баганын хос
 *      (`projectPlan.spanOf`); өөр баганын огноо (`alt`) «late» болохгүй.
 *   8. L2 багц бүр «Захирамж»-аар эхэлнэ; L3-ийн дэд шатгүй зураг төсөл «Зураг төсөл» нэртэй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DAY, dayOfLocal, monthIdx, daysInMonth, fmtDay, fmtMonth, cleanSpan,
  barStatus, milestoneStatus, BEHIND_PP, spanOf, plannedOf,
  packagesOf, phaseIndex, worksNode, ownKey,
  increments, dailyRate, sumDays, linearShare, sumAll, weekCols, dayCols,
  axisOf, xMonths, heatLevel, activeRange,
  blockDetail, sheetDetails, mergePhases, blockKeyFor,
  buildL1, buildL2, buildL3, buildL4, buildLook, ganttAxis, dateIn, failLabel,
} from './levelPlan.ts';
import { assemblePlan } from './projectPlanInputs.ts';
import { buildTree, linearPlanned } from './projectPlan.ts';

const D = (iso) => Date.parse(`${iso}T00:00:00Z`);
const near = (a, b, tol, msg) => {
  if (a == null || b == null) return assert.equal(a, b, msg);
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);
};

/* ══════════ 1. Өдөр · сар · баганууд ══════════ */
{
  const local = new Date(2026, 9, 26, 3, 0, 0).getTime(); // орон нутгийн 10-26 03:00
  assert.equal(dayOfLocal(local), D('2026-10-26'), 'орон нутгийн өдөр → UTC шөнө дунд');
  assert.equal(daysInMonth(D('2026-02-10')), 28);
  assert.equal(monthIdx(D('2026-10-31')) - monthIdx(D('2026-01-01')), 9);
  assert.equal(fmtDay(D('2026-10-21')), '2026.10.21');
  assert.equal(fmtDay(null), '—');
  assert.equal(fmtMonth(D('2026-08-31')), '26.08');
  assert.deepEqual(cleanSpan(D('2026-05-01'), D('2026-04-01')), [null, null], 'эхлэх > дуусах → хос null');
  assert.deepEqual(cleanSpan(-2209161600000, D('2026-04-01')), [null, null], '1899 → хос null');

  const wk = weekCols(D('2026-10-21'), 12); // Лхагва
  assert.equal(wk.length, 12);
  assert.equal(wk[0].from, D('2026-10-19'), '7 хоног Даваагаас (10.19–10.25)');
  assert.equal(new Date(wk[0].from).getUTCDay(), 1);
  assert.equal(wk[1].from - wk[0].from, 7 * DAY);
  assert.equal(weekCols(D('2026-10-19'), 1)[0].from, D('2026-10-19'), 'Даваа гараг өөрөө — 7 хоног хойшлохгүй');
  assert.equal(weekCols(D('2026-10-25'), 1)[0].from, D('2026-10-19'), 'Ням гараг — тэр 7 хоногийн Даваа');
  assert.equal(weekCols(dayOfLocal(new Date(2026, 9, 21, 23, 30).getTime()), 1)[0].from, D('2026-10-19'), 'орон нутгийн 23:30');
  const dc = dayCols(D('2026-10-21'), 14);
  assert.equal(dc.length, 14);
  assert.equal(dc[0].from, D('2026-10-21'));
  assert.equal(dc[13].from, D('2026-11-03'));
}

/* ══════════ 2. Өсөлт · өдрийн хувь · шугаман ══════════ */
{
  assert.deepEqual(increments([10, 30, 30, 55]), [10, 20, 0, 25]);
  assert.deepEqual(increments([10, null, 40]), [10, null, null], 'null хөрш → null (0 БИШ)');
  assert.deepEqual(increments([null, 5]), [null, null]);

  const months = [D('2026-10-31'), D('2026-11-30')];
  const rate = dailyRate(months, [31, 15]);
  near(rate(D('2026-10-05')), 1, 1e-12, '10-р сар: 31 ÷ 31');
  near(rate(D('2026-11-05')), 0.5, 1e-12, '11-р сар: 15 ÷ 30');
  assert.equal(rate(D('2026-12-01')), 0, 'тэнхлэгээс хойш — ажилгүй (0)');
  assert.equal(rate(D('2026-09-30')), 0, 'тэнхлэгээс өмнө — ажилгүй (0)');
  near(sumDays(rate, D('2026-10-26'), 7), 6 * 1 + 1 * 0.5, 1e-12, 'сар дамнасан 7 хоног (10.26–11.01)');
  const rn = dailyRate(months, [31, null]);
  assert.equal(sumDays(rn, D('2026-10-26'), 7), null, 'мэдэхгүй өдөртэй 7 хоног → null');
  assert.equal(dailyRate([], [])(D('2026-10-01')), null, 'тэнхлэг алга → null');

  near(linearShare(10, D('2026-10-01'), D('2026-10-10'), D('2026-10-08'), 7), 3, 1e-12, '10 өдрийн 3 нь (8,9,10)');
  assert.equal(linearShare(10, D('2026-10-01'), D('2026-10-10'), D('2026-11-01'), 7), 0, 'давхцалгүй → 0');
  assert.equal(linearShare(null, D('2026-10-01'), D('2026-10-10'), D('2026-10-01'), 7), null, 'жингүй → null');
  assert.equal(linearShare(10, null, D('2026-10-10'), D('2026-10-01'), 7), null, 'огноогүй → null');
  near(linearShare(12, D('2026-10-01'), D('2026-10-01'), D('2026-10-01'), 1), 12, 1e-12, 'нэг өдрийн ажил');
  assert.equal(sumAll([1, 2, 3]), 6);
  assert.equal(sumAll([1, null]), null);
}

/* ══════════ 3. Төлөв ══════════ */
{
  const T = D('2026-10-21');
  assert.equal(barStatus(D('2025-01-01'), D('2027-01-01'), 100, 50, T), 'done');
  assert.equal(barStatus(D('2025-01-01'), D('2026-10-01'), 80, 100, T), 'late', 'дуусах өнгөрсөн');
  assert.equal(barStatus(D('2025-01-01'), D('2027-01-01'), 30, 30 + BEHIND_PP + 1, T), 'behind');
  assert.equal(barStatus(D('2025-01-01'), D('2027-01-01'), 30, 30 + BEHIND_PP - 1, T), 'run');
  assert.equal(barStatus(D('2027-01-01'), D('2027-06-01'), 0, 0, T), 'todo');
  assert.equal(barStatus(null, null, 40, null, T), 'none', 'огноогүй');
  assert.equal(barStatus(D('2025-01-01'), D('2027-01-01'), null, 40, T), 'none', 'гүйцэтгэл мэдэгдэхгүй (0 БИШ)');
  assert.equal(barStatus(D('2025-01-01'), D('2026-10-01'), null, 100, T), 'none', 'дуусах өнгөрсөн + гүйцэтгэл мэдэгдэхгүй → none (late БИШ)');
  assert.equal(barStatus(D('2027-01-01'), D('2027-06-01'), null, null, T), 'todo', 'ирээдүйн, мэдэгдэхгүй → эхлээгүй');
  assert.equal(barStatus(D('2025-01-01'), D('2026-10-01'), 80, 100, T, false), 'behind', 'lateOk=false → late БИШ (хоцрогдол хэвээр)');
  assert.equal(barStatus(D('2025-01-01'), D('2026-10-01'), 80, null, T, false), 'run');
  assert.equal(milestoneStatus(null, false, T), 'missing');
  assert.equal(milestoneStatus(D('2026-10-01'), false, T), 'late');
  assert.equal(milestoneStatus(D('2026-12-01'), false, T), 'upcoming');
  assert.equal(milestoneStatus(null, true, T), 'done');
  assert.equal(milestoneStatus(D('2026-10-01'), null, T), 'none', 'өнгөрсөн + гүйцэтгэл мэдэгдэхгүй → none (late БИШ)');
  assert.equal(milestoneStatus(null, null, T), 'missing', 'огноо алга → гүйцэтгэлээс үл хамааран улаан');
  assert.equal(milestoneStatus(D('2026-12-01'), null, T), 'upcoming');

  const v = { H: D('2024-01-01'), I: D('2024-06-01'), J: null, K: null, L: D('2025-01-01'), M: D('2026-01-01'), N: 1, O: 2, P: 3 };
  assert.deepEqual(spanOf(v, 'barilga'), [D('2025-01-01'), D('2026-01-01')], 'барилга → гүйцэтгэгчийн огноо');
  assert.deepEqual(spanOf(v, 'zurag'), [D('2024-01-01'), D('2024-06-01')], 'зураг → гэрээний огноо');
  assert.deepEqual(spanOf(v, 'gazar'), [D('2024-01-01'), D('2024-06-01')], 'газрын огноо алга → гэрээ');
  assert.equal(plannedOf(v, 'barilga'), 3);
  assert.equal(plannedOf(v, 'gazar'), 2);
  assert.equal(plannedOf(v, 'tezu'), 1);
  assert.equal(dateIn('2025-09-25'), D('2025-09-25'));
  assert.equal(dateIn(D('2025-09-25')), D('2025-09-25'));
  assert.equal(dateIn(''), null);
}

/* ══════════ 4. Тэнхлэг · heatmap ══════════ */
{
  const ax = axisOf([D('2026-03-15'), null, D('2026-05-02')], 1);
  assert.deepEqual(ax, { m0: monthIdx(D('2026-02-01')), n: 5 });
  near(xMonths(ax, D('2026-03-01')), 1, 1e-12, '3-р сарын 1 = 1 сар');
  near(xMonths(ax, D('2026-03-16')), 1 + 15 / 31, 1e-12, '3-р сарын 16 = 1 + 15/31');
  assert.equal(axisOf([null, undefined]), null);
  assert.equal(heatLevel(5, 10), 0.5);
  assert.equal(heatLevel(null, 10), 0);
  assert.equal(heatLevel(0, 10), 0);
  assert.deepEqual(activeRange([[0, null, 2, 0], [0, 0, 0, 1]]), [2, 3]);
  assert.equal(activeRange([[0, null]]), null);
}

/* ══════════ 5. Бөглөх хуудасны дэд бүлэг ══════════ */
{
  const row = (no, work, depth) => ({ no, work, depth });
  const rows = [
    row('А.', 'Бэлтгэл ажил', 0),
    row('Б.', 'БАРИЛГА УГСРАЛТЫН АЖИЛ', 0),
    row('Б1', 'Барилгын ажил', 1),
    row('1', 'ГАЗАР ШОРООНЫ АЖИЛ', 2),
    row('2', 'СУУРИЙН АЖИЛ', 2),
    row('Б2', 'Халаалт агаар сэлгэлт', 1),
  ];
  const c = (Dv, s, e, a) => ({ D: Dv, start: [s, s], end: [e, e], actAgg: [a, a == null ? null : a / 2] });
  const calc = [
    c(1, D('2025-01-01'), D('2025-03-01'), 1),
    c(1, D('2025-07-01'), D('2027-07-01'), 0.3),
    c(0.8, D('2025-07-01'), D('2027-04-01'), 0.35),
    c(0.05, D('2025-07-01'), D('2025-09-01'), 1),
    c(0.75, D('2026-05-01'), D('2026-04-01'), null),
    c(0.2, D('2026-06-01'), D('2027-07-01'), 0.1),
  ];
  const d = blockDetail(rows, calc, 0);
  assert.deepEqual(d.phases.map((g) => g.name), ['Барилгын ажил', 'Халаалт агаар сэлгэлт'], 'Б.-ийн шууд хүүхдүүд');
  assert.deepEqual(d.groups.map((g) => g.name), ['ГАЗАР ШОРООНЫ АЖИЛ', 'СУУРИЙН АЖИЛ', 'Халаалт агаар сэлгэлт'], 'Б1 задарч + Б2');
  near(d.groups[0].weight, 5, 1e-9, 'жин 0–100');
  near(d.groups[0].actual, 100, 1e-9, 'гүйцэтгэл 0–100');
  assert.equal(d.groups[1].start, null, 'урвуу огноо хаягдана');
  assert.equal(d.groups[1].actual, null, 'хэмжилтгүй → null');
  near(blockDetail(rows, calc, 1).groups[0].actual, 50, 1e-9, 'блок тус бүрээр');
  assert.equal(blockDetail([row('А.', 'x', 0)], [c(1, null, null, null)], 0), null, '«Б.» алга → null');

  const m = sheetDetails([
    { group: 'Багц 4-2', bld: ['6/1', '5/1'], rows, calc },
    { group: 'Багц 4-2', bld: ['6/1'], rows, calc: calc.map((x) => ({ ...x, actAgg: [0, 0] })) },
  ]);
  assert.equal(m.size, 2);
  near(m.get('БАГЦ42|6/1').groups[0].actual, 100, 1e-9, 'давхардсан шошгод ЭХНИЙ хуудас');
  /* 9F-д тэр блокийн огноо алга, 12F-д бий → 12F (makeSchedules-тэй нэг дүрэм) */
  const noDates = calc.map((x) => ({ ...x, start: [null, null], end: [null, null] }));
  const m2 = sheetDetails([
    { group: 'Багц 4-2', bld: ['6/1'], rows, calc: noDates },
    { group: 'Багц 4-2', bld: ['6/1'], rows, calc: calc.map((x) => ({ ...x, actAgg: [0, 0] })) },
  ]);
  assert.equal(m2.get('БАГЦ42|6/1').groups[0].start, D('2025-07-01'), '9F огноогүй → 12F-ийн огноотой дэд бүлэг');
  near(m2.get('БАГЦ42|6/1').groups[0].actual, 0, 1e-9, '12F-ийн гүйцэтгэл');
  const m3 = sheetDetails([{ group: 'Багц 4-2', bld: ['6/1'], rows, calc: noDates }]);
  assert.equal(m3.get('БАГЦ42|6/1').groups[0].start, null, 'аль ч хуудсанд огноо алга → эхнийх (жин харагдана)');
  near(m3.get('БАГЦ42|6/1').groups[0].weight, 5, 1e-9);
  assert.equal(blockKeyFor('Багц-4.2', '6/1'), 'БАГЦ42|6/1', 'Excel-ийн бичиглэл системийн түлхүүрт');

  const mp = mergePhases([d.phases, blockDetail(rows, calc, 1).phases]);
  assert.equal(mp.length, 2);
  near(mp[0].actual, (35 + 17.5) / 2, 1e-9, 'блокуудын энгийн дундаж');
  near(mp[0].weight, 80, 1e-9);
}

/* ══════════ 6. Фикстурын мод — багц, түвшний мөрүүд ══════════ */
const fx = JSON.parse(readFileSync(new URL('./projectPlan.fixture.json', import.meta.url), 'utf8'));
const fromSerial = (s) => (s == null ? null : (s - 25569) * DAY);
const str = (i) => (i == null ? null : fx.strs[i]);
const stored = fx.rows.map((r) => ({
  dd_kod: r[0], etseg_kod: r[1], uy_shat: r[2], bagts: str(r[3]), blok: r[4], ajil_uilchilgee: str(r[5]),
  ho_dun_geree: r[6], heseg_ezleh_huvi: r[7], tusul_ezleh_huvi: r[8],
  geree_ehleh: fromSerial(r[9]), geree_duusah: fromSerial(r[10]),
  gazar_ehleh: fromSerial(r[11]), gazar_duusah: fromSerial(r[12]),
  guits_ehleh: fromSerial(r[13]), guits_duusah: fromSerial(r[14]),
}));
{
  const tree = buildTree(stored);
  assert.equal(worksNode(tree)?.code, '5.2');
  const pk = packagesOf(tree);
  const keys = pk.map((p) => p.key);
  assert.deepEqual(keys.slice(0, 7), ['БАГЦ1', 'БАГЦ2', 'БАГЦ31', 'БАГЦ32', 'БАГЦ33', 'БАГЦ41', 'БАГЦ42'], 'орон сууцны 7 багц');
  assert.ok(!keys.includes('БАГЦ16'), '«Багц-16» бүлэг — багц биш');
  assert.ok(keys.includes('БАГЦ161') && keys.includes('БАГЦ177'), '16.1 … 17.7 багц');
  assert.ok(!keys.some((k) => !/^БАГЦ\d/.test(k)), '«Бүгд» г.м. багц биш');
  assert.equal(new Set(keys).size, keys.length, 'давхардалгүй');
  assert.equal(pk[0].blocks.length, 20, 'Багц-1 — 20 блок');
  assert.equal(pk[0].dir?.code, '5.2.1');
  assert.equal(ownKey(pk[0].blocks[0]), '', 'блокийн мөр багцын түлхүүргүй');
  const idx = phaseIndex(tree);
  assert.equal(idx.get('zurag').get('БАГЦ1')?.code, '2.1.1#2');
  assert.equal(idx.get('gazar').get('БАГЦ1')?.code, '3.1.1');
  assert.ok(idx.get('songon').get('БАГЦ1'), 'сонгон шалгаруулалтын Багц-1');
  assert.equal(idx.get('zurag').get('БАГЦ14')?.code, '2.3.2.5', '«БАГЦ 1- 4» (2.2) Багц 14 руу наалдахгүй — жинхэнэ «БАГЦ-14»');

  /* ── Хуваарь: бүх блок 2026 онд жигд (шугаман) — сарын цуваа тодорхой ── */
  const TODAY = D('2026-10-21');
  const sched = {
    has: () => true,
    at: (_p, _b, asOf) => linearPlanned(D('2026-01-01'), D('2026-12-31'), asOf),
    prime: () => {},
    keys: () => [],
  };
  const actual = { blocks: new Map([['БАГЦ1|5/1', { overall: 40, date: '2026-10-01', phases: [] }]]), universe: new Map([['БАГЦ1', ['БАГЦ1|5/1', 'БАГЦ1|5/2']]]), infra: new Map() };
  const plan = assemblePlan(stored, { actual, sched, land: new Map() }, TODAY);
  assert.equal(plan.empty, false);
  const pkgs = packagesOf(plan.tree);

  const l1 = buildL1(plan, TODAY);
  assert.equal(l1[0].t, 'bar');
  assert.equal(l1[0].id, 'L1.1');
  assert.ok(l1.some((r) => r.t === 'section' && r.id === 'L1.3'), 'чиглэлийн хэсэг');
  assert.equal(l1.filter((r) => r.t === 'bar' && r.id.startsWith('L1.2.')).length, 8, '8 үе шат');
  assert.ok(ganttAxis(l1, TODAY), 'тэнхлэг');

  const l2 = buildL2(plan, pkgs.slice(0, 1), null, TODAY);
  const b1 = l2.filter((r) => r.id.startsWith('L2.2'));
  assert.equal(b1[0].t, 'section');
  assert.deepEqual(b1.map((r) => r.t), ['section', 'ms', 'bar', 'bar', 'ms', 'ms', 'bar', 'ms', 'ms'], 'Багц-1: захирамж · зураг · газар · сонгон · зөвшөөрөл · барилга · гэрээ · ашиглалт');
  assert.equal(b1[1].name, 'Захирамж');
  assert.equal(b1[1].status, 'none', 'milestone огноо уншигдаагүй (marks = null) → «алга» БИШ, мэдээлэлгүй');
  assert.equal(b1[b1.length - 1].status, 'none', 'ашиглалт: marks = null → мэдээлэлгүй (алга БИШ)');
  const l2e = buildL2(plan, pkgs.slice(0, 1), new Map(), TODAY);
  assert.equal(l2e[l2e.length - 1].status, 'missing', 'ашиглалтын огноо уншигдсан ч алга → улаан');
  const l2m = buildL2(plan, pkgs.slice(0, 1), new Map([[pkgs[0].node.code, { tender: null, handover: D('2028-06-22'), order: D('2025-06-27'), orderNo: 'А/736' }]]), TODAY);
  assert.equal(l2m[l2m.length - 1].at, D('2028-06-22'));
  assert.equal(l2m[l2m.length - 1].status, 'upcoming');
  const ord = l2m.find((r) => r.id === 'L2.2.1');
  assert.equal(ord.name, 'Захирамж А/736');
  assert.equal(ord.at, D('2025-06-27'));
  assert.equal(ord.status, 'done', 'гарсан захирамж ✓');
  assert.equal(buildL2(plan, pkgs.slice(0, 1), new Map(), TODAY).find((r) => r.id === 'L2.2.1').status, 'missing', 'захирамж алга → улаан');

  /* ── Төлөв · огноо: мэдэгдэхгүй гүйцэтгэлтэй зурвас «late» болохгүй; өвгөөс зөвхөн хадгалсан ижил баганын хос ── */
  const planNo = assemblePlan(stored, { actual: { blocks: new Map(), universe: new Map(), infra: new Map() }, sched: null, land: new Map() }, TODAY);
  const pkN = packagesOf(planNo.tree);
  const allBars = [...buildL1(planNo, TODAY), ...buildL2(planNo, pkN, null, TODAY), ...buildL3(planNo, pkN, null, TODAY)].filter((r) => r.t === 'bar');
  assert.ok(!allBars.some((r) => r.status === 'late' && r.actual == null), 'гүйцэтгэл мэдэгдэхгүй → late БИШ');
  assert.ok(!allBars.some((r) => r.status === 'late' && r.alt), 'өөр баганын огноо → late БИШ');
  const gz = buildL1(planNo, TODAY).find((r) => r.id === 'L1.2.3');
  assert.ok(gz.alt && gz.planned != null, 'газар чөлөөлөлт: газрын огноо алга → гэрээний огноо (alt), O = гэрээний шугаман хувь');
  const l2n = buildL2(planNo, pkN.slice(0, 1), null, TODAY);
  const gz1 = l2n.find((r) => r.t === 'bar' && r.name === 'Газар чөлөөлөлт');
  assert.equal(gz1.start, null, 'өвгийн БОДОГДСОН (ах дүүсийн MIN/MAX) огноог зээлэхгүй');
  /* Өвөг мөрийн ӨӨРИЙН хадгалсан хос → inh, N-тэй ижил суурь (projectPlan.spanOf) */
  const zr = l2n.find((r) => r.t === 'bar' && r.name === 'Зураг төсөл');
  assert.ok(zr.inh, 'Багц-1 зураг төсөл — өвөг мөрийн огноо');
  let x = idx.get('zurag').get('БАГЦ1').parent;
  while (x && x.row && !(x.row.geree_ehleh != null && x.row.geree_duusah != null)) x = x.parent;
  assert.equal(zr.start, x.row.geree_ehleh, 'өвгийн өөрийн хадгалсан geree_ehleh');
  assert.equal(zr.end, x.row.geree_duusah);

  const l3 = buildL3(plan, pkgs.slice(0, 1), null, TODAY);
  assert.ok(l3.some((r) => r.t === 'bar' && r.strong), 'барилгын нийт');
  assert.equal(l3.find((r) => r.id === 'L3.1.1.1').name, 'Зураг төсөл', 'дэд шатгүй зураг төсөл — багцын ажлын нэр БИШ');
  const det = new Map([['БАГЦ1|5/1', { phases: [{ no: 'Б1', name: 'Барилгын ажил', weight: 77.5, start: D('2025-08-01'), end: D('2027-04-24'), actual: 37 }], groups: [] }]]);
  const l3d = buildL3(plan, pkgs.slice(0, 1), det, TODAY);
  const ph = l3d.find((r) => r.t === 'bar' && r.name === 'Барилгын ажил');
  assert.equal(ph?.w, 77.5, 'дэд үе шат жинтэй');

  /* ── L4: блокийн сарын өсөлт = хуваарийн сарын хувь; нийлбэр = эцсийн хуримтлал ── */
  const l4 = buildL4(plan, pkgs.slice(0, 1))[0];
  assert.deepEqual(l4.rows.slice(0, 2).map((r) => r.kind), ['total', 'cum']);
  const blk = l4.rows.find((r) => r.name === '5/1');
  const mi = plan.months.findIndex((m) => m === D('2026-01-31'));
  near(blk.cells[mi], (31 / 365) * 100, 1e-9, '1-р сарын өсөлт');
  near(blk.cells.reduce((s, v) => s + (v ?? 0), 0), 100, 1e-9, 'өсөлтийн нийлбэр = 100');
  near(blk.actual, 40, 1e-9, 'бодит гүйцэтгэл');
  assert.equal(l4.rows.find((r) => r.name === '5/2').actual, 0, 'тайлагнаагүй блок 0 (хуваарьт бий)');
  assert.ok(activeRange(l4.rows.filter((r) => r.kind !== 'cum').map((r) => r.cells)), 'идэвхтэй сар');

  /* ── L5/L6: 7 хоног = өдөрт жигд; дэд бүлэг шугаман ── */
  const det2 = new Map([['БАГЦ1|5/1', { phases: [], groups: [{ no: '1', name: 'ГАЗАР ШОРООНЫ АЖИЛ', weight: 7, start: D('2026-10-19'), end: D('2026-10-25'), actual: 40.5 }] }]]);
  const wk = weekCols(TODAY, 12);
  const l5 = buildLook(plan, pkgs.slice(0, 1), det2, wk)[0];
  const r51 = l5.rows.find((r) => r.kind === 'block' && r.name === '5/1');
  near(r51.cells[0], (7 / 365) * 100, 1e-9, '7 хоног = 7 өдрийн жигд хувь');
  const g = l5.rows.find((r) => r.kind === 'group');
  near(g.cells[0], 7, 1e-9, 'дэд бүлэг бүтэн 7 хоногт бүх жингээ');
  assert.equal(g.cells[1], 0, 'дараагийн 7 хоногт ажилгүй');
  near(g.sum, 7, 1e-9);
  assert.equal(l5.rows[0].id, 'L5.1.0');
  const l6 = buildLook(plan, pkgs.slice(0, 1), null, dayCols(TODAY, 14))[0];
  assert.equal(l6.rows[0].id, 'L6.1.0');
  assert.ok(!l6.rows.some((r) => r.kind === 'group'), 'хуудасгүй → дэд бүлэггүй');
  near(l6.rows.find((r) => r.name === '5/1').cells[0], 100 / 365, 1e-9, 'өдрийн хувь');

  /* ── null ≠ 0: хуваарьгүй (sched = null) блокийн нүд null ── */
  const plan0 = assemblePlan(stored, { actual, sched: null, land: new Map() }, TODAY);
  const l40 = buildL4(plan0, packagesOf(plan0.tree).slice(0, 1))[0];
  assert.ok(l40.rows.find((r) => r.name === '5/1').cells.every((v) => v === null), 'хуваарьгүй → null (0 БИШ)');
  const l50 = buildLook(plan0, packagesOf(plan0.tree).slice(0, 1), null, wk)[0];
  assert.equal(l50.rows.find((r) => r.name === '5/1').cells[0], null);
}

/* ── 9. Унасан эхийн нэр — дотоод код дэлгэцэнд гарахгүй (2026-10-26) ── */
{
  assert.equal(failLabel('milestones'), 'Чухал үе шатын огноо');
  assert.equal(failLabel('blockProgress'), 'Блокийн гүйцэтгэл');
  assert.equal(failLabel('sheet:b1_9f'), 'Багц 1 · 9 давхар бөглөх хуудас');
  assert.equal(failLabel('schedule:b41_9f'), 'Багц 4-1 · 9 давхар хуваарь');
  assert.equal(failLabel('land:БАГЦ1'), 'БАГЦ1 газар чөлөөлөлт');
  assert.equal(failLabel('sheet:zzz'), 'zzz бөглөх хуудас', 'танигдаагүй багц — түлхүүрээр');
  assert.equal(failLabel('somethingNew'), 'somethingNew', 'танигдаагүй код нуугдахгүй');
}

/* ══ Бүлгээр хураах · шүүх (2026-10-29) ══ */
{
  const { gParents, visibleGantt, hBlockParents, visibleHeat } = await import('./levelPlan.ts');
  const bar = (id, depth, status, name = id) => ({ t: 'bar', id, name, depth, start: 0, end: 1, actual: null, planned: null, status });
  const rows = [
    { t: 'section', id: 'A', name: 'Барилга', depth: 0 },
    bar('A1', 1, 'run', 'Суурь'),
    bar('A1a', 2, 'late', 'Цутгалт'),
    bar('A2', 1, 'done', 'Хана'),
    { t: 'section', id: 'B', name: 'Зураг төсөл', depth: 0 },
    { t: 'ms', id: 'B1', name: 'Батлах', depth: 1, at: null, status: 'missing' },
  ];
  assert.deepEqual([...gParents(rows)].sort(), ['A', 'A1', 'B']);
  const ids = (xs) => xs.map((r) => r.id).join(',');
  assert.equal(ids(visibleGantt(rows, new Set(), '', 'all')), 'A,A1,A1a,A2,B,B1', 'шүүлтгүй — бүгд');
  assert.equal(ids(visibleGantt(rows, new Set(['A']), '', 'all')), 'A,B,B1', 'хураасан хэсгийн дор нуугдана');
  assert.equal(ids(visibleGantt(rows, new Set(['A1']), '', 'all')), 'A,A1,A2,B,B1', 'зөвхөн илүү гүн мөр нуугдана');
  assert.equal(ids(visibleGantt(rows, new Set(['A']), 'цутгал', 'all')), 'A,A1,A1a', 'хайлт — өвөгтэй, хураалтыг үл тоомсорлоно');
  assert.equal(ids(visibleGantt(rows, new Set(), '', 'problem')), 'A,A1,A1a,B,B1', 'асуудалтай — хоцорсон мөр ба огноогүй milestone');
  assert.equal(ids(visibleGantt(rows, new Set(), '', 'done')), 'A,A2', 'дууссан');
  assert.equal(ids(visibleGantt(rows, new Set(), 'зураг', 'all')), 'B', 'хэсгийн нэрээр хайх');

  const pkg = { key: 'p1', label: 'Багц 1', blocks: ['1'] };
  const h = (id, kind, name = id) => ({ id, name, kind, w: null, start: null, end: null, actual: null, cells: [] });
  const sec = { pkg, rows: [h('t', 'total', 'Нийт'), h('c', 'cum', 'Өсөх дүн'), h('b1', 'block', '5/1'), h('g1', 'group', 'Суурь'), h('g2', 'group', 'Хана'), h('b2', 'block', '5/2')] };
  assert.deepEqual([...hBlockParents(sec)], ['b1']);
  const hid = (xs) => xs.map((x) => `${x.pkg.key}:${x.rows.map((r) => r.id).join(',')}`).join('|');
  assert.equal(hid(visibleHeat([sec], new Set(), new Set(), '')), 'p1:t,c,b1,g1,g2,b2');
  assert.equal(hid(visibleHeat([sec], new Set(['p1']), new Set(), '')), 'p1:', 'хураасан багц — толгой л');
  assert.equal(hid(visibleHeat([sec], new Set(), new Set(['b1']), '')), 'p1:t,c,b1,b2', 'хураасан блокийн дэд бүлэг нуугдана');
  assert.equal(hid(visibleHeat([sec], new Set(), new Set(['b1']), 'хана')), 'p1:t,c,b1,g2', 'дэд бүлэг хайхад блок ба нийт хамт');
  assert.equal(hid(visibleHeat([sec], new Set(), new Set(), 'байхгүй')), '', 'тохирохгүй багц хасагдана');
  assert.equal(hid(visibleHeat([sec], new Set(), new Set(), 'багц 1')), 'p1:t,c,b1,g1,g2,b2', 'багцын нэрээр — бүх мөр');
}

console.log('levelPlan.check ✓');

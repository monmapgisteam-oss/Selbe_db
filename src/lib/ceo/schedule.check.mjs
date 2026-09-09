/**
 * «ХУВААРИЙН ХОЦРОГДОЛ» картын ЦЭВЭР тооцооны шалгуур — сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/schedule.check.mjs
 *
 * Хамгаалж буй дүрмүүд:
 *   · сарын хоцрогдол — муруйн эхлэл (`pct > 0`), `pct ≥ actual` эхний сар,
 *     бүх цэгээс дээш → 0, муруйгүй → null (0 БИШ)
 *   · муруйг `lagOf`-оор УНШИХ (`curveViaLag`) — хэмжилтийн сараас ухарч
 *     муруйн эхлэл хүртэл; кэш хоосон / багцад хуваарь алга → undefined
 *   · null ≠ 0 — хэмжилтгүй багц тоолуурт орохгүй, тусдаа хүснэгтэд нэрээр
 *   · хэмжигдсэн багц огт байхгүй → «—», `unknown`
 *   · дедуп: `pkgKeyOf(pkg2) || pkgKeyOf(pkg)`, диапазон мөр алгасна
 *
 * ⚠️ `lagLevel` / `lagOf` нь Finance.tsx-д (Node ачаалж чадахгүй) тул энд
 *    ИЖИЛ дүрмийн туршилтын хуулбар өгнө (`lagLevel`: ≥10 улаан, ≥5 шар;
 *    `lagOfLike`: сүүлийн phys≠null сар ≤ өнөөдөр, багцын/төслийн муруй,
 *    planned ≤ 0 → null) — Finance-ийн дүрэм өөрчлөгдвөл эдгээрийг мөн засна.
 */
import assert from 'node:assert/strict';
import {
  CURVE_CAP, collectCurves, collectPkgLags, computeSchedule, curveProbe, curveViaLag,
  lagPoint, monthEndMs, monthsBetween, prevYm, slipMonthsOf, ymOf,
} from './schedule.ts';
import { CASHFLOW_NEW } from '../services.ts';

const lagLevel = (gap) => (gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null);
const pt = (label, pct) => ({ label, pct });
const NOW_YM = '2026-09';

/* `Finance.lagOf`-ийн ХУУЛБАР — кэш (муруй) байгаа/байхгүй хоёр горим */
const lagOfLike = (cache) => (months) => {
  let mi = -1;
  months.forEach((m, i) => { if (m.label <= NOW_YM && m.phys != null) mi = i; });
  if (mi < 0 || !cache) return null;
  const key = months.find((m) => m.pkg)?.pkg;
  const series = key ? cache.byBagts.get(key) : cache.months;
  if (!series?.length) return null;
  let planned = 0; let found = false;
  for (const p of series) { if (p.label > months[mi].label) break; planned = p.pct; found = true; }
  if (!found || planned <= 0) return null;
  const actual = months[mi].phys ?? 0;
  return { month: months[mi].label, planned, actual, gap: planned - actual };
};

/* ── monthsBetween / monthEndMs / prevYm ── */
assert.equal(monthsBetween('2026-01', '2026-08'), 7);
assert.equal(monthsBetween('2025-11', '2026-02'), 3);
assert.equal(monthsBetween('2026-08', '2026-03'), -5);
assert.equal(monthsBetween('x', '2026-03'), null);
assert.equal(monthEndMs('2026-08'), Date.UTC(2026, 7, 31));
assert.equal(monthEndMs('2026-13'), null);
assert.equal(prevYm('2026-01'), '2025-12');
assert.equal(prevYm('2026-10'), '2026-09');
assert.equal(prevYm('2026-00'), null);
assert.equal(prevYm('x'), null);

/* ── slipMonthsOf ── */
const series = [
  pt('2026-01', 0), pt('2026-02', 0), pt('2026-03', 10), pt('2026-04', 20), pt('2026-05', 30),
];
/* pct ≥ 15 эхний сар = 2026-04 → 5-р сард 1 сар хоцорсон */
assert.equal(slipMonthsOf(series, 15, '2026-05'), 1);
/* яг тэнцүү цэг: pct ≥ 20 → 2026-04 */
assert.equal(slipMonthsOf(series, 20, '2026-05'), 1);
/* 0% — эхлэл нь pct>0 эхний сар (2026-03), тэргүүлэх 0-үүд ТООЛОГДОХГҮЙ */
assert.equal(slipMonthsOf(series, 0, '2026-05'), 2);
/* бүх цэгээс дээш → 0 */
assert.equal(slipMonthsOf(series, 35, '2026-05'), 0);
/* түрүүлж байвал сөрөг → 0 */
assert.equal(slipMonthsOf(series, 20, '2026-03'), 0);
/* муруйгүй / бүхэлдээ 0 → null, 0 биш */
assert.equal(slipMonthsOf(undefined, 10, '2026-05'), null);
assert.equal(slipMonthsOf([], 10, '2026-05'), null);
assert.equal(slipMonthsOf([pt('2026-01', 0), pt('2026-02', 0)], 0, '2026-05'), null);
/* ХЭСЭГ муруй (хэмжилтийн сар хүртэл) дээр ижил үр дүн — ирээдүйн цэг хэрэггүй */
assert.equal(slipMonthsOf(series.slice(0, 4), 15, '2026-04'), 0);
assert.equal(slipMonthsOf(series.slice(2, 5), 15, '2026-05'), 1);

/* ── lagPoint / curveProbe: lagOf-д өгөх зохиомол цэг ── */
assert.deepEqual(lagPoint('2026-03'), [{ label: '2026-03', given: 0, phys: 0 }]);
assert.equal(lagPoint('2026-03')[0].pkg, undefined, 'pkg байхгүй → төслийн муруй');
assert.deepEqual(lagPoint('2026-03', 'БАГЦ1'), [{ label: '2026-03', given: 0, phys: 0, pkg: 'БАГЦ1' }]);
assert.deepEqual(curveProbe(NOW_YM), [{ label: NOW_YM, given: 0, phys: 0 }]);

/* ── Муруй (lagOfLike-ийн кэш) ── */
const curve = {
  months: series,
  bySheet: new Map(),
  byBagts: new Map([
    ['БАГЦ1', series],
    ['БАГЦ2', [pt('2026-01', 5), pt('2026-02', 10), pt('2026-03', 20)]],
    ['БАГЦ3', series],
  ]),
  from: Date.UTC(2026, 0, 1),
  to: Date.UTC(2026, 4, 31),
};
const lagOf = lagOfLike(curve);

/* Сорил: кэш байвал утга, хоосон бол null */
assert.notEqual(lagOf(curveProbe(NOW_YM)), null, 'кэш байвал сорил утга буцаана');
assert.equal(lagOfLike(null)(curveProbe(NOW_YM)), null, 'кэш хоосон бол сорил null');
/* Хуваарь өнөөдрийг хүртэл эхлээгүй → мөн null (нэг шалтгаанд нэгтгэнэ) */
assert.equal(lagOfLike({ ...curve, months: [pt('2026-01', 0)] })(curveProbe(NOW_YM)), null);

/* ── curveViaLag: хэмжилтийн сараас ухарч муруйн эхлэл хүртэл ── */
/* БАГЦ1, 2026-05 → [03:10, 04:20, 05:30]; тэргүүлэх 0-үүд (01, 02) ОРОХГҮЙ */
assert.deepEqual(curveViaLag(lagOf, 'БАГЦ1', '2026-05'), [pt('2026-03', 10), pt('2026-04', 20), pt('2026-05', 30)]);
/* хэмжилтийн сар дунд нь → зөвхөн тэр сар хүртэлх хэсэг */
assert.deepEqual(curveViaLag(lagOf, 'БАГЦ1', '2026-04'), [pt('2026-03', 10), pt('2026-04', 20)]);
/* БАГЦ2 эхнээсээ >0, муруй 2026-03-д дуусна → 09-д уншихад сүүлийн цэг (20) үргэлжилнэ */
assert.deepEqual(
  curveViaLag(lagOf, 'БАГЦ2', '2026-04'),
  [pt('2026-01', 5), pt('2026-02', 10), pt('2026-03', 20), pt('2026-04', 20)],
);
/* хуваарь эхлээгүй сард → undefined (хоосон массив БИШ) */
assert.equal(curveViaLag(lagOf, 'БАГЦ1', '2026-02'), undefined);
/* байхгүй багц / кэш хоосон → undefined */
assert.equal(curveViaLag(lagOf, 'БАГЦ9', '2026-05'), undefined);
assert.equal(curveViaLag(lagOfLike(null), 'БАГЦ1', '2026-05'), undefined);
/* ухрах хязгаар: эцэсгүй муруйд cap цэгээс илүү уншихгүй */
const infinite = () => ({ month: 'x', planned: 1, actual: 0, gap: 1 });
assert.equal(curveViaLag(infinite, 'K', '2026-05').length, CURVE_CAP);
assert.equal(curveViaLag(infinite, 'K', '2026-05', 3).length, 3);
/* эвдэрсэн шошго → ухарч чадахгүй, нэг цэг */
assert.equal(curveViaLag(infinite, 'K', 'x').length, 1);

/* ── computeSchedule ── */
const mk = (key, label, lag, hasPhys = true) => ({ key, curveKey: key, label, lag, hasPhys });
const pkgs = [
  mk('БАГЦ3', 'Багц 3', { month: '2026-05', planned: 30, actual: 28, gap: 2 }),
  mk('БАГЦ1', 'Багц 1', { month: '2026-05', planned: 30, actual: 15, gap: 15 }),
  mk('БАГЦ2', 'Багц 2', { month: '2026-03', planned: 20, actual: 13, gap: 7 }),
  mk('БАГЦ9', 'Багц 9', null, false),
  mk('БАГЦ8', 'Багц 8', null, true),
];
const now = Date.UTC(2026, 8, 6);

/* collectCurves: хэмжигдсэнд хэмжилтийн сар хүртэл, хэмжилтгүйд өнөөдөр хүртэл */
const curves = collectCurves(pkgs, lagOf, NOW_YM);
assert.deepEqual([...curves.keys()].sort(), ['БАГЦ1', 'БАГЦ2', 'БАГЦ3']);
assert.equal(curves.get('БАГЦ1').at(-1).label, '2026-05');
assert.equal(curves.get('БАГЦ2').at(-1).label, '2026-03');
assert.equal(curves.get('БАГЦ8'), undefined, 'хуваарьгүй багц → муруй алга');

const r = computeSchedule(pkgs, curves, lagLevel, now, ['муруй']);

assert.equal(r.value, '2');
assert.equal(r.level, 'bad');
assert.equal(r.unit, 'багц хоцорсон');
assert.deepEqual(r.failedSources, ['муруй']);
assert.equal(r.facts[0], '1 яаралтай · 1 анхаарах');
assert.equal(r.facts[1], 'хамгийн муу −15.0 пп');
assert.equal(r.facts[2], 'дундаж −8.0 пп');
assert.equal(r.facts[3], '2 багц хэмжилтгүй');

/* Хүснэгт 1: БҮХ хэмжигдсэн багц, хамгийн муу дээр */
const t1 = r.tables[0];
assert.equal(t1.cols.length, 7);
assert.deepEqual(t1.rows.map((row) => row[0].v), ['Багц 1', 'Багц 2', 'Багц 3']);
/* Багц 1: pct ≥ 15 → 2026-04, хэмжилт 2026-05 → 1 сар; зөрүү −15 */
assert.deepEqual(t1.rows[0].map((c) => c.v), ['Багц 1', '2026-05', 30, 15, -15, 1, 'Яаралтай']);
assert.equal(t1.rows[0][2].kind, 'pct');
assert.equal(t1.rows[0][4].kind, 'count');
/* Багц 2: pct ≥ 13 → 2026-03 = хэмжилтийн сар → 0 */
assert.deepEqual(t1.rows[1].map((c) => c.v), ['Багц 2', '2026-03', 20, 13, -7, 0, 'Анхаарах']);
assert.equal(t1.rows[2][6].v, 'Хэвийн');

/* Хүснэгт 2: хэмжилтгүй багц нэрээр, шалтгаан ялгаатай */
const t2 = r.tables[1];
assert.equal(t2.cols.length, 2);
assert.deepEqual(t2.rows.map((row) => row[0].v), ['Багц 8', 'Багц 9']);
assert.equal(t2.rows[0][1].v, 'хуваарь алга');
assert.equal(t2.rows[1][1].v, 'гүйцэтгэлийн бичилт алга');

/* Анхааруулга: зөвхөн улаан */
assert.equal(r.issues.length, 1);
assert.equal(r.issues[0].tone, 'bad');
assert.equal(r.issues[0].text, 'Багц 1 — төл. 30.0% / бодит 15.0% · −15.0 пп');

/* asOf: хамгийн сүүлийн хэмжилтийн сарын эцэс (2026-05-31) */
assert.equal(r.asOf, Date.UTC(2026, 4, 31));

/* asOf ирээдүй рүү гарахгүй */
const r2 = computeSchedule([pkgs[0]], curves, lagLevel, Date.UTC(2026, 4, 10));
assert.equal(r2.asOf, Date.UTC(2026, 4, 10));

/* Муруйгүй: сарын хоцрогдол «—» (null), пп хэвээр */
const r3 = computeSchedule(pkgs, new Map(), lagLevel, now);
assert.equal(r3.tables[0].rows[0][5].v, null);
assert.equal(r3.value, '2');
assert.equal(r3.tables[1].rows[0][1].v, 'хуваарь алга');

/* Бичилт ба муруй хоёул бий, гэвч lag null (хэмжилт хуваарь эхлэхээс өмнө) → ерөнхий шалтгаан */
const r3b = computeSchedule([mk('БАГЦ1', 'Багц 1', null, true)], curves, lagLevel, now);
assert.equal(r3b.tables[1].rows[0][1].v, 'хуваарь эсвэл гүйцэтгэлийн бичилт алга');

/* Хэмжигдсэн багц огт байхгүй → «—», unknown, зөвхөн хэмжилтгүй баримт */
const r4 = computeSchedule([pkgs[3], pkgs[4]], curves, lagLevel, now);
assert.equal(r4.value, '—');
assert.equal(r4.level, 'unknown');
assert.deepEqual(r4.facts, ['2 багц хэмжилтгүй']);
assert.equal(r4.tables[0].rows.length, 0);
assert.equal(r4.asOf, null);

/* Бүгд хэвийн → good, value 0; 0% хэмжилт нь ХЭМЖИЛТ (тоологдоно) */
const r5 = computeSchedule(
  [mk('БАГЦ1', 'Багц 1', { month: '2026-03', planned: 10, actual: 8, gap: 2 }),
    mk('БАГЦ3', 'Багц 3', { month: '2026-03', planned: 0.5, actual: 0, gap: 0.5 })],
  curves, lagLevel, now,
);
assert.equal(r5.level, 'good');
assert.equal(r5.value, '0');
assert.equal(r5.tables[0].rows.length, 2);
assert.equal(r5.facts[1], 'хамгийн муу −2.0 пп');
/* хэмжилтгүй байхгүй → тэр баримт гарахгүй */
assert.equal(r5.facts.length, 3);

/* Түрүүлсэн багц: зөрүү эерэг тэмдэгтэй, −0 гарахгүй */
const r6 = computeSchedule(
  [mk('БАГЦ1', 'Багц 1', { month: '2026-03', planned: 10, actual: 12, gap: -2 }),
    mk('БАГЦ3', 'Багц 3', { month: '2026-03', planned: 10, actual: 10.04, gap: -0.04 })],
  curves, lagLevel, now,
);
assert.equal(r6.facts[1], '0.0 пп'.replace(/^/, 'хамгийн муу '));
assert.ok(Object.is(r6.tables[0].rows[0][4].v, 0), 'зөрүү −0 биш 0');
assert.equal(r6.tables[0].rows[1][4].v, 2);
/* Түрүүлсэн: муруйн хэсэг хэмжилтийн сар хүртэл л байхад ч сарын хоцрогдол 0 */
assert.equal(r6.tables[0].rows[1][5].v, 0);

/* ── collectPkgLags: дедуп, диапазон алгасах, нэр pkg2 || pkg ── */
const C = CASHFLOW_NEW.fields;
const rows = [
  /* ⚠️ Cashflow_0909-д багцын багана НЭГ (`bagts`) — `pkg` ба `pkg2` ижил
     талбарыг заана. Хоёуланг нь бичвэл сүүлийнх нь эхнийхийг ДАРНА, дедуп
     шалгагдахгүй өнгөрнө. Навчны утгыг НЭГ УДАА бичнэ. */
  { [C.pkg2]: 'Багц 4-1' },
  { [C.pkg2]: 'Багц 4' },
  { [C.pkg2]: 'Багц 4-1' },
  { [C.pkg2]: 'БАГЦ 1-4' },
  { [C.pkg2]: null },
];
const months = (r0) => [
  /* ⚠️ Биет хэмжилтийг БАГЦААР ялгана: нэг багана болсон тул «дэд байна уу»
     гэдгээр ялгах боломжгүй. «4-1»-д хэмжилт бий, «Багц 4»-д алга. */
  { label: '2026-01', given: 0, phys: String(r0[C.pkg2] ?? '').includes('4-1') ? 5 : null, pkg: 'БАГЦ4' },
];
const got = collectPkgLags(rows, months, (ms) => (ms[0].phys == null ? null : { month: '2026-01', planned: 6, actual: 5, gap: 1 }));
assert.deepEqual(got.map((p) => p.key), ['БАГЦ41', 'БАГЦ4']);
assert.deepEqual(got.map((p) => p.label), ['Багц 4-1', 'Багц 4']);
assert.deepEqual(got.map((p) => p.curveKey), ['БАГЦ4', 'БАГЦ4']);
assert.equal(got[0].hasPhys, true);
assert.equal(got[1].hasPhys, false);
assert.equal(got[1].lag, null);

/* ── ymOf: lagOf-ийн nowYm-тэй ижил (UTC) ── */
assert.equal(ymOf(Date.UTC(2026, 8, 6)), '2026-09');
assert.equal(ymOf(Date.UTC(2026, 0, 31, 23, 59)), '2026-01');

/* ── finCurveMissing: бичилттэй багцын шалтгаан ялгарна, failedSources нэртэй ── */
const r7 = computeSchedule(
  [mk('БАГЦ1', 'Багц 1', null, true), mk('БАГЦ9', 'Багц 9', null, false)],
  new Map(), lagLevel, now, ['Хуваарийн муруй (Санхүүжилт)'], true,
);
assert.equal(r7.value, '—');
assert.equal(r7.level, 'unknown');
assert.deepEqual(r7.failedSources, ['Хуваарийн муруй (Санхүүжилт)']);
assert.deepEqual(r7.tables[1].rows.map((row) => row[1].v), ['хоцрогдлын муруй уншигдсангүй', 'гүйцэтгэлийн бичилт алга']);

/* ── Ачаалагчийн бүтэн гинж (Finance-гүй): collectPkgLags → collectCurves → computeSchedule ── */
const chainRows = [
  { [C.pkg2]: null, [C.pkg]: 'Багц 1' },
  { [C.pkg2]: null, [C.pkg]: 'Багц 2' },
];
const chainMonths = (r0) => {
  const key = r0[C.pkg] === 'Багц 1' ? 'БАГЦ1' : 'БАГЦ2';
  /* Багц 1: 2026-05-д 15%; Багц 2: 2026-03-д 13% */
  const at = key === 'БАГЦ1' ? '2026-05' : '2026-03';
  const phys = key === 'БАГЦ1' ? 15 : 13;
  return ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map((label) => ({
    label, given: 0, phys: label === at ? phys : null, pkg: key,
  }));
};
const chainPkgs = collectPkgLags(chainRows, chainMonths, lagOf);
const chainCurves = collectCurves(chainPkgs, lagOf, NOW_YM);
const r8 = computeSchedule(chainPkgs, chainCurves, lagLevel, now);
assert.deepEqual(r8.tables[0].rows.map((row) => row.map((c) => c.v)), [
  ['Багц 1', '2026-05', 30, 15, -15, 1, 'Яаралтай'],
  ['Багц 2', '2026-03', 20, 13, -7, 0, 'Анхаарах'],
]);

console.log('schedule.check: OK');

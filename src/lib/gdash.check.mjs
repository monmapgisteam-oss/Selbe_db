/**
 * ЕРӨНХИЙ ДАШБОАРДЫН ТООЦОО — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/gdash.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ХУГАЦААНЫ ШҮҮЛТ ажлыг ЗАЛГИХ. Олон жилийн ажил дунд жилүүддээ
 *      алга болвол S-муруй тасарч, KPI-ийн төсөв бодит дүнгээс бага гарна.
 *   2. ОГНООГҮЙ мөр шүүлтэд ЧИМЭЭГҮЙ ОРОХ. «Мэдэгдэхгүй» нь «хамаарна»
 *      гэсэн үг биш — тэднийг оруулбал ямар ч жил сонгоход нийт дүн ижил
 *      гарч, шүүлт ажиллахгүй байгааг хэн ч анзаарахгүй.
 *   3. ГҮЙЦЭТГЭЛИЙН ХУВЬ ЭНГИЙН ДУНДАЖ болох. Өртгөөр жигнэхгүй бол жижиг
 *      дууссан ажил төслийн явцыг хоёр дахин үнэлнэ.
 *   4. ХЭМЖИГДЭЭГҮЙ АЖИЛ 0% гэж тооцогдох. Багц нь нэгтгэлд байхгүй ажил
 *      «хийгдээгүй» БИШ, «мэдэгдэхгүй» — жигнэсэн дунджид огт орохгүй.
 *   5. S-МУРУЙ БУУРАХ. Хуримтлал тул муруй ХЭЗЭЭ Ч буурахгүй бөгөөд эцсийн
 *      цэг нь хамрагдсан ажлуудын хувийн нийлбэр байх ёстой.
 *   6. ЭХ ҮҮСВЭРИЙН чарт дүн ТЭГ талбарыг тоолох.
 */
import assert from 'node:assert/strict';
import {
  inPeriod, yearsOf, sCurve, kpisOf, chartTypeCost, chartTypeCount,
  chartSourceCount, chartNoteAmount, periodWindow, CONTRACTED, CF_SOURCES,
} from './gdash.ts';

const D = (y, m, d = 1) => Date.UTC(y, m - 1, d);

/** Туршилтын мөр — `CfRow`-ийн бүтэн хэлбэр */
const row = (o = {}) => ({
  oid: 1, type: 'A', project: '', pkg: 'Багц -1',
  cost: 100, note: '', start: null, end: null, share: 0,
  src: CF_SOURCES.map(() => 0),
  ...o,
});

/* ── 1. Олон жилийн ажил ДУНД жилдээ ч хамрагдана ── */
{
  const r = row({ start: D(2024, 4), end: D(2028, 4) });
  for (const y of [2024, 2025, 2026, 2027, 2028]) {
    assert.equal(inPeriod(r, { year: y, quarter: null, month: null }), true, `${y} унасан`);
  }
  assert.equal(inPeriod(r, { year: 2023, quarter: null, month: null }), false);
  assert.equal(inPeriod(r, { year: 2029, quarter: null, month: null }), false);
}

/* ── 2. Огноогүй мөр — шүүлтгүйд ОРНО, шүүлттэйд ГАРНА ── */
{
  const r = row();
  assert.equal(inPeriod(r, { year: null, quarter: null, month: null }), true);
  assert.equal(inPeriod(r, { year: 2026, quarter: null, month: null }), false);
  assert.equal(inPeriod(r, { year: null, quarter: 2, month: null }), false);
}

/* ── 2б. Улирал ба сар — цонхны хил ── */
{
  /* 2026 оны 2-р улирал = 4,5,6 сар */
  const w = periodWindow({ year: 2026, quarter: 2, month: null });
  assert.equal(w.from, D(2026, 4));
  assert.equal(w.to, D(2026, 7));

  const apr = row({ start: D(2026, 4, 10), end: D(2026, 4, 20) });
  assert.equal(inPeriod(apr, { year: 2026, quarter: 2, month: null }), true);
  assert.equal(inPeriod(apr, { year: 2026, quarter: 1, month: null }), false);
  assert.equal(inPeriod(apr, { year: 2026, quarter: null, month: 4 }), true);
  assert.equal(inPeriod(apr, { year: 2026, quarter: null, month: 5 }), false);

  /* ЖИЛГҮЙ сар — бүх жилийн тэр сарыг хамарна (давтамжийн шүүлт) */
  const multi = row({ start: D(2024, 1), end: D(2026, 12) });
  assert.equal(inPeriod(multi, { year: null, quarter: null, month: 7 }), true);
  const narrow = row({ start: D(2024, 1), end: D(2024, 2) });
  assert.equal(inPeriod(narrow, { year: null, quarter: null, month: 7 }), false);
}

/* ── 3. yearsOf — интервалын БҮХ жил, эрэмбэлсэн, давхардалгүй ── */
{
  const ys = yearsOf([
    row({ start: D(2025, 6), end: D(2027, 3) }),
    row({ start: D(2024, 1), end: D(2024, 5) }),
    row(),
  ]);
  assert.deepEqual(ys, [2024, 2025, 2026, 2027]);
}

/* ── 4. Гүйцэтгэлийн хувь — ӨРТГӨӨР ЖИГНЭНЭ, хэмжигдээгүй нь орохгүй ── */
{
  const rows = [
    row({ oid: 1, pkg: 'Багц -1', cost: 900 }),
    row({ oid: 2, pkg: 'Багц -2', cost: 100 }),
    row({ oid: 3, pkg: 'Багц -9', cost: 1000 }), // нэгтгэлд БАЙХГҮЙ
  ];
  const prog = new Map([['БАГЦ1', 10], ['БАГЦ2', 100]]);
  const k = kpisOf(rows, 0, prog);

  /* (900×10 + 100×100) / 1000 = 19%. Энгийн дундаж бол 55% байх байсан. */
  assert.equal(Math.round(k.progress * 100) / 100, 19);
  /* Хэмжигдээгүй 1000 нь хуваарьт ч, хүртвэрт ч ОРООГҮЙ */
  assert.equal(k.budget, 2000);
  assert.equal(k.packages, 3);
  assert.equal(k.types, 1);
}

/* ── 4б. Хэмжигдсэн ажил огт байхгүй бол хувь нь `null` (0 БИШ) ── */
{
  const k = kpisOf([row({ cost: 500 })], 0, new Map());
  assert.equal(k.progress, null);
}

/* ── 5. S-муруй — хуримтлал, БУУРАХГҮЙ, эцсийн цэг = хувийн нийлбэр ── */
{
  const pts = sCurve([
    row({ oid: 1, share: 60, start: D(2026, 1), end: D(2026, 3) }), // 3 сар
    row({ oid: 2, share: 40, start: D(2026, 3), end: D(2026, 4) }), // 2 сар
    row({ oid: 3, share: 0, start: D(2026, 1), end: D(2026, 2) }),  // хувьгүй — орохгүй
    row({ oid: 4, share: 10, start: null }),                        // огноогүй — орохгүй
  ]);
  assert.deepEqual(pts.map((p) => p.key), ['2026-01', '2026-02', '2026-03', '2026-04']);
  for (let i = 1; i < pts.length; i += 1) {
    assert.ok(pts[i].value >= pts[i - 1].value, 'S-муруй буурсан');
  }
  assert.equal(pts[pts.length - 1].value, 100);
  /* 1-р сар: 60/3 = 20 */
  assert.equal(pts[0].value, 20);
}

/* ── 5б. Хамрах ажилгүй бол ХООСОН массив (0-ийн цуваа БИШ) ── */
assert.deepEqual(sCurve([row({ share: 0 })]), []);

/* ── 6. Чартууд ── */
{
  const rows = [
    row({ oid: 1, type: 'ИНЖЕНЕР', cost: 300, note: CONTRACTED, pkg: 'Багц -1' }),
    row({ oid: 2, type: 'ИНЖЕНЕР', cost: 100, note: 'Урьдчилсан дүн', pkg: 'Багц -1' }),
    row({ oid: 3, type: 'БАРИЛГА', cost: 600, note: CONTRACTED, pkg: 'Багц -2' }),
  ];

  /* Төрөл × өртөг — БУУРАХ эрэмбэ, дэд нь гүйцэтгэлийн дүн */
  const c1 = chartTypeCost(rows, new Map([['БАГЦ1', 50]]));
  assert.deepEqual(c1.map((x) => x.key), ['БАРИЛГА', 'ИНЖЕНЕР']);
  assert.equal(c1[1].value, 400);
  assert.equal(c1[1].sub, 200);      // (300+100) × 50%
  assert.equal(c1[0].sub, 0);        // Багц -2 хэмжигдээгүй

  /* Төрөл × тоо — дэд нь гэрээлсэн тоо */
  const c2 = chartTypeCount(rows);
  const eng = c2.find((x) => x.key === 'ИНЖЕНЕР');
  assert.equal(eng.value, 2);
  assert.equal(eng.sub, 1);

  /* Эх үүсвэр — 0 дүнтэй талбар ТООЛОГДОХГҮЙ */
  const withSrc = [
    row({ oid: 1, note: CONTRACTED, src: [10, 0, 0, 0] }),
    row({ oid: 2, note: 'Урьдчилсан дүн', src: [5, 0, 0, 0] }),
    row({ oid: 3, note: CONTRACTED, src: [0, 0, 0, 0] }),
  ];
  const c3 = chartSourceCount(withSrc);
  assert.equal(c3.length, 1, 'дүнгүй эх үүсвэр чартад гарсан');
  assert.equal(c3[0].value, 2);
  assert.equal(c3[0].sub, 1);

  /* Тайлбар × мөнгө — хоосон тайлбар нэрлэгдэнэ, унахгүй */
  const c4 = chartNoteAmount([row({ note: '', cost: 7 })]);
  assert.equal(c4.length, 1);
  assert.equal(c4[0].value, 7);
  assert.ok(c4[0].label.length > 0);
}

console.log('gdash.check.mjs — БҮГД ТЭНЦЛЭЭ');

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
  chartSourceCount, chartNoteAmount, grainOf, CONTRACTED, CF_SOURCES,
} from './gdash.ts';

const D = (y, m, d = 1) => Date.UTC(y, m - 1, d);

/** Туршилтын мөр — `CfRow`-ийн бүтэн хэлбэр */
const row = (o = {}) => ({
  oid: 1, type: 'A', project: '', pkg: 'Багц -1',
  cost: 100, note: '', start: null, end: null, share: 0, decree: 0, progress: null,
  src: CF_SOURCES.map(() => 0),
  ...o,
});

/** Хугацааны шүүлт — хоосон массив = «бүгд» */
const P = (o = {}) => ({ years: [], quarters: [], months: [], ...o });

/* ── 1. Олон жилийн ажил ДУНД жилдээ ч хамрагдана ── */
{
  const r = row({ start: D(2024, 4), end: D(2028, 4) });
  for (const y of [2024, 2025, 2026, 2027, 2028]) {
    assert.equal(inPeriod(r, P({ years: [y] })), true, `${y} унасан`);
  }
  assert.equal(inPeriod(r, P({ years: [2023] })), false);
  assert.equal(inPeriod(r, P({ years: [2029] })), false);
}

/* ── 2. Огноогүй мөр — шүүлтгүйд ОРНО, шүүлттэйд ГАРНА ── */
{
  const r = row();
  assert.equal(inPeriod(r, P()), true);
  assert.equal(inPeriod(r, P({ years: [2026] })), false);
  assert.equal(inPeriod(r, P({ quarters: [2] })), false);
}

/* ── 2б. Улирал ба сар — хилийн шалгалт ── */
{
  const apr = row({ start: D(2026, 4, 10), end: D(2026, 4, 20) });
  assert.equal(inPeriod(apr, P({ years: [2026], quarters: [2] })), true);
  assert.equal(inPeriod(apr, P({ years: [2026], quarters: [1] })), false);
  assert.equal(inPeriod(apr, P({ years: [2026], months: [4] })), true);
  assert.equal(inPeriod(apr, P({ years: [2026], months: [5] })), false);

  /* ЖИЛГҮЙ сар — бүх жилийн тэр сарыг хамарна (давтамжийн шүүлт) */
  const multi = row({ start: D(2024, 1), end: D(2026, 12) });
  assert.equal(inPeriod(multi, P({ months: [7] })), true);
  const narrow = row({ start: D(2024, 1), end: D(2024, 2) });
  assert.equal(inPeriod(narrow, P({ months: [7] })), false);
}

/* ── 2в. ОЛОН СОНГОЛТ (2026-09-04) — хэмжээс доторх нь АЛЬ НЭГ, хэмжээс
   хооронд нь БҮГД хангагдана ── */
{
  const apr = row({ start: D(2026, 4, 10), end: D(2026, 4, 20) });
  /* Олон жил — аль нэгэнд нь таарвал болно */
  assert.equal(inPeriod(apr, P({ years: [2025, 2026] })), true);
  assert.equal(inPeriod(apr, P({ years: [2024, 2025] })), false);
  /* Олон сар */
  assert.equal(inPeriod(apr, P({ months: [4, 5] })), true);
  assert.equal(inPeriod(apr, P({ months: [5, 6] })), false);
  /* Улирал ба сар ЗЭРЭГ — хоёул хангагдана (4-р сар нь 2-р улиралд) */
  assert.equal(inPeriod(apr, P({ quarters: [2], months: [4] })), true);
  /* ⚠️ Зөрчилтэй хослол — хоосон үр дүн. Нэг сонголттой үед автоматаар
     цэвэрлэдэг байсныг олонлогтой болоход ХАСАВ; хэрэглэгчийн сонголтыг
     код булаах ёсгүй, хоосон хариу нь өөрөө мэдээлэл. */
  assert.equal(inPeriod(apr, P({ quarters: [1], months: [4] })), false);
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

/* ── 4. Гүйцэтгэлийн хувь — ӨРТГӨӨР ЖИГНЭНЭ, хэмжигдээгүй нь орохгүй ──
   ⚠️ 2026-09-04: гүйцэтгэлийг багцын нэгтгэлээс БИШ, мөрийн ӨӨРИЙН
   `Guitsetgel_huwi`-ээс авдаг болов (тэр багана бүрэн бөглөгдсөн). */
{
  const rows = [
    row({ oid: 1, cost: 900, progress: 10 }),
    row({ oid: 2, cost: 100, progress: 100 }),
    row({ oid: 3, cost: 1000, progress: null }), // ХЭМЖИГДЭЭГҮЙ
  ];
  const k = kpisOf(rows, 0);

  /* (900×10 + 100×100) / 1000 = 19%. Энгийн дундаж бол 55% байх байсан. */
  assert.equal(Math.round(k.progress * 100) / 100, 19);
  /* Хэмжигдээгүй 1000 нь хуваарьт ч, хүртвэрт ч ОРООГҮЙ */
  assert.equal(k.budget, 2000);
  assert.equal(Math.round(k.progressCovered), 50, 'хамралт = 1000/2000');

  /* ⚠️ `0` ба `null` ХОЁР ӨӨР: тэг гүйцэтгэл нь ХЭМЖИГДСЭН тул хуваарьт орно */
  const z = kpisOf([row({ cost: 100, progress: 0 }), row({ cost: 100, progress: 100 })], 0);
  assert.equal(z.progress, 50);
  assert.equal(z.progressCovered, 100);
}

/* ── 4б. Хэмжигдсэн ажил огт байхгүй бол хувь нь `null` (0 БИШ) ── */
{
  const k = kpisOf([row({ cost: 500 })], 0);
  assert.equal(k.progress, null);
}

/* ── 5. S-муруй — хуримтлал, БУУРАХГҮЙ, эцсийн цэг = хувийн нийлбэр ── */
{
  const src = [
    row({ oid: 1, share: 60, start: D(2026, 1), end: D(2026, 3) }), // 3 сар
    row({ oid: 2, share: 40, start: D(2026, 3), end: D(2026, 4) }), // 2 сар
    row({ oid: 3, share: 0, start: D(2026, 1), end: D(2026, 2) }),  // хувьгүй — орохгүй
    row({ oid: 4, share: 10, start: null }),                        // огноогүй — орохгүй
  ];
  const pts = sCurve(src, 'month');
  assert.deepEqual(pts.map((p) => p.key), ['2026-01', '2026-02', '2026-03', '2026-04']);
  for (let i = 1; i < pts.length; i += 1) {
    assert.ok(pts[i].value >= pts[i - 1].value, 'S-муруй буурсан');
  }
  assert.equal(pts[pts.length - 1].value, 100);
  /* 1-р сар: 60/3 = 20 */
  assert.equal(pts[0].value, 20);
}

/* ── 5б. АНХДАГЧ нэгтгэл нь ЖИЛ — сараар 65 цэг гарч `Trend` сүүлийг нь л
   үзүүлдэг тул муруй «шулуун» мэт харагдана (2026-09-04-ны засвар) ── */
{
  const yr = sCurve([
    row({ oid: 1, share: 30, start: D(2025, 1), end: D(2025, 12) }),
    row({ oid: 2, share: 70, start: D(2026, 1), end: D(2026, 12) }),
  ]);
  assert.deepEqual(yr.map((p) => p.key), ['2025', '2026']);
  assert.equal(yr[0].value, 30);
  assert.equal(yr[1].value, 100);
}

/* ── 5в. ТЭНХЛЭГ НЬ СОНГОСОН ХУГАЦААГААР ТАСЛАГДАНА (2026-09-04) ──
   Урьд нь мөр нь шүүгддэг ч тэнхлэг бүтэн мужаа зурдаг тул «2026» сонгоход
   ч 2024–2029 бүхэлдээ гарч, шүүлт ажиллаагүй мэт харагдаж байв. */
{
  const src = [
    row({ oid: 1, share: 40, start: D(2025, 1), end: D(2025, 12) }),
    row({ oid: 2, share: 60, start: D(2026, 1), end: D(2026, 12) }),
  ];
  const only26 = sCurve(src, 'month', P({ years: [2026] }));
  assert.equal(only26.length, 12, '2026 сонгоход зөвхөн 12 сар үлдэх ёстой');
  assert.ok(only26.every((p) => p.key.startsWith('2026')));

  /* ⚠️ ХУРИМТЛАЛ ТАСЛАХААС ӨМНӨ бодогдоно: 2026-ийн эхний цэг 0-ээс БИШ,
     2025 дуустал хуримтлагдсан 40%-аас эхэлнэ. Эс бөгөөс «2026-д төсөл
     шинээр эхэлж байна» гэсэн худал уншилт гарна. */
  assert.ok(only26[0].value > 40, `эхний цэг ${only26[0].value} — 40%-иас дээш байх ёстой`);
  assert.equal(only26[11].value, 100);

  /* ⚠️ НАРИЙВЧЛАЛ НЬ ШҮҮЛТИЙН ТҮВШИНТЭЙ ТААРНА (2026-09-04). Улирал
     сонгоход тэнхлэг нь тэр улирлын САРУУД биш, НЭГ УЛИРЛЫН цэг байна —
     сонгосноосоо илүү нарийн задалбал өөр асуултад хариулна. */
  assert.equal(grainOf(P({ years: [2026] })), 'year');
  assert.equal(grainOf(P({ years: [2026], quarters: [1] })), 'quarter');
  assert.equal(grainOf(P({ years: [2026], quarters: [1], months: [3] })), 'month');

  const q1 = sCurve(src, 'quarter', P({ years: [2026], quarters: [1] }));
  assert.equal(q1.length, 1, 'нэг улирал = нэг цэг');
  assert.equal(q1[0].label, '2026 I');

  const q4 = sCurve(src, 'quarter', P({ years: [2026] }));
  assert.deepEqual(q4.map((p) => p.label), ['2026 I', '2026 II', '2026 III', '2026 IV']);
  /* Улирлын утга нь тэр улирлын СҮҮЛИЙН сарын хуримтлал */
  assert.equal(q4[3].value, 100);

  /* Сарын шүүлт — зөвхөн сонгосон саруудын цэг */
  const mm = sCurve(src, 'month', P({ years: [2026], months: [3, 6] }));
  assert.deepEqual(mm.map((p) => p.key), ['2026-03', '2026-06']);

  /* Жилийн нарийвчлалд — жил бүрийн СҮҮЛИЙН утга (нийлбэр БИШ) */
  const yr = sCurve(src, 'year', P({ years: [2025, 2026] }));
  assert.deepEqual(yr.map((p) => p.key), ['2025', '2026']);
  assert.equal(yr[1].value, 100);
}

/* ── 5г. Хамрах ажилгүй бол ХООСОН массив (0-ийн цуваа БИШ) ── */
assert.deepEqual(sCurve([row({ share: 0 })]), []);

/* ── 6. Чартууд ── */
{
  const rows = [
    row({ oid: 1, type: 'ИНЖЕНЕР', cost: 300, note: CONTRACTED, progress: 50 }),
    row({ oid: 2, type: 'ИНЖЕНЕР', cost: 100, note: 'Урьдчилсан дүн', progress: 50 }),
    row({ oid: 3, type: 'БАРИЛГА', cost: 600, note: CONTRACTED, progress: null }),
  ];

  /* Төрөл × өртөг — БУУРАХ эрэмбэ, дэд нь гүйцэтгэлийн дүн */
  const c1 = chartTypeCost(rows);
  assert.deepEqual(c1.map((x) => x.key), ['БАРИЛГА', 'ИНЖЕНЕР']);
  assert.equal(c1[1].value, 400);
  assert.equal(c1[1].sub, 200);      // 300×50% + 100×50%
  assert.equal(c1[0].sub, 0);        // ХЭМЖИГДЭЭГҮЙ (progress: null)

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

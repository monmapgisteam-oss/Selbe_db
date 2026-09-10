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
 *   7. IPC-ИЙН МУРУЙ ХЭМЖИГДЭЭГҮЙ САРД 0 БОЛОХ (2026-09-10). Сүүлийн
 *      олголтоос хойш муруйг хэвтээгээр сунгавал «олголт зогссон» гэсэн
 *      ХУДАЛ уншилт төрнө — үнэн нь «хараахан бүртгэгдээгүй» (`null ≠ 0`).
 */
import assert from 'node:assert/strict';
import {
  inPeriod, yearsOf, sCurve, kpisOf, chartTypeCost,
  chartSourceCount, chartNoteAmount, grainOf, CONTRACTED, CF_SOURCES,
  cashflowCurve, housingMoney,
} from './gdash.ts';
import { CASHFLOW_NEW } from './services.ts';

/** Гэрээний ШАТНЫ талбарууд — индикаторын шинэ эх сурвалж */
const ST = CASHFLOW_NEW.stages;

const D = (y, m, d = 1) => Date.UTC(y, m - 1, d);

/** Туршилтын мөр — `CfRow`-ийн бүтэн хэлбэр */
const row = (o = {}) => ({
  oid: 1, type: 'A', project: '', pkg: 'Багц -1',
  cost: 100, note: '', start: null, end: null, share: 0, decree: 0, progress: null,
  src: CF_SOURCES.map(() => 0),
  /* ⚠️ Индикаторын «Гүйцэтгэлийн хувь» ЭНДЭЭС бодогдоно (`progress`-оос БИШ) */
  stage: {},
  /* ⚠️ Анхдагчаар НИЙТ дүнд ОРНО — Excel-ийн 1 ба 2-р хэсгийн мөр */
  inTotal: true,
  /* ⚠️ Анхдагчаар ЖИНХЭНЭ АЖИЛ — «Багц ажлын тоо»-нд тоологдоно */
  isWork: true,
  ...o,
});

/** ЗӨВХӨН барилга угсралтын шаттай мөр — бусад шат хэмжигдээгүй */
const buildRow = (o = {}) => row({ ...o, stage: { [ST.build]: o.progress ?? null } });

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

/* ── 4. Гүйцэтгэлийн хувь — ЗУРГААН ШАТНЫ ЖИГНЭСЭН НИЙЛБЭР ──
   ⚠️ 2026-09-08: индикатор нь ЗӨВХӨН `Guitsetgel_huwi` (барилга угсралт)
   байхаа больж, «Нэгтгэл гүйцэтгэл»-ийн төслийн НИЙТ мөртэй ижил болов:
   зургаан шат тус бүрийн төсвөөр жигнэсэн дундажийг ТОГТООСОН жингээр
   (5·10·3·1·1·79 + улсын комисс 1) нийлүүлнэ.
   ⚠️ Хэмжилтгүй шатны ЖИН хуваарьт ҮЛДЭНЭ — эс бөгөөс тэр хувь нь бусад шат
   руу тарж, гүйцэтгэл хиймлээр өснө. */
{
  const rows = [
    buildRow({ oid: 1, cost: 900, progress: 10 }),
    buildRow({ oid: 2, cost: 100, progress: 100 }),
    buildRow({ oid: 3, cost: 1000, progress: null }), // ХЭМЖИГДЭЭГҮЙ
  ];
  const k = kpisOf(rows, 0);

  /* Барилга угсралт: (900×10 + 100×100) / 1000 = 19%; жин нь 79% →
     төслийн гүйцэтгэл = 19 × 0.79 = 15.01%. Бусад шат хэмжигдээгүй. */
  assert.equal(Math.round(k.progress * 100) / 100, 15.01);
  assert.notEqual(Math.round(k.progress), 19, 'бүтэн 19% гэж хэлэхгүй — жин 79%');

  /* Хэмжигдээгүй 1000 нь шатны хуваарьт ч, хүртвэрт ч ОРООГҮЙ */
  assert.equal(k.budget, 2000);
  assert.equal(Math.round(k.progressCovered), 50, 'хамралт = 1000/2000');

  /* ⚠️ МӨНГӨ нь ХУВЬТАЙГАА таарна: 2000 × 15.01% = 300.2 */
  assert.ok(Math.abs(k.progressAmount - (2000 * k.progress) / 100) < 1e-9);

  /* ⚠️ `0` ба `null` ХОЁР ӨӨР: тэг гүйцэтгэл нь ХЭМЖИГДСЭН тул хуваарьт орно */
  const z = kpisOf([buildRow({ cost: 100, progress: 0 }), buildRow({ cost: 100, progress: 100 })], 0);
  assert.equal(Math.round(z.progress * 100) / 100, 39.5, '50% × 79 жин');

  /* ГАЗАР ЧӨЛӨӨЛӨЛТ нь тусдаа эхээс — 3% жинтэй нэмэгдэнэ */
  const g = kpisOf(rows, 0, 100);
  assert.ok(Math.abs(g.progress - (15.01 + 3)) < 1e-9, 'газрын 3% жин нэмэгдэнэ');
}

/* ── 4а. НИЙТ ТӨСӨВ — Excel-ийн хамрах хүрээ (`=+I8+I21`) ──
   ⚠️ Нийгмийн дэд бүтэц · газар чөлөөлөлт · бондын хүү нь эх файлын НИЙТ
   дүнд ОРДОГГҮЙ. Тэдгээр мөр «Багц ажлын тоо»-нд ХЭВЭЭР тоологдоно — хоёр
   индикатор өөр хамрах хүрээтэй байх нь ЗОРИУДЫН шийдвэр. */
{
  const k = kpisOf([
    buildRow({ oid: 1, cost: 1000, progress: 50 }),
    buildRow({ oid: 2, cost: 400, progress: 50, inTotal: false }), // БОНДЫН ХҮҮ мэт
  ], 0);
  assert.equal(k.budget, 1000, 'нийлбэрт ороогүй мөр төсөвт нэмэгдэхгүй');
  assert.equal(k.packages, 2, 'мөрийн тоо нь БҮГД — хамрах хүрээ хамаарахгүй');

  /*
   * АЖЛЫН БУС МӨР ТООЛОГДОХГҮЙ (2026-09-10, хэрэглэгч: «78 биш 74»).
   * ⚠️ Тэр мөр МӨНГӨН нийлбэрт нь ОРСОН хэвээр (`inTotal`) — хоёр дүрэм
   *    хоорондоо ХАМААРАЛГҮЙ: нэг нь Excel-ийн НИЙТ томьёо, нөгөө нь
   *    «энэ мөр ажил мөн үү» гэсэн асуулт.
   */
  const k2 = kpisOf([
    row({ oid: 1, cost: 100 }),
    row({ oid: 2, cost: 100, isWork: false, note: 'Төслийн хөрөнгө оруулалтаас хасах' }),
  ], 0);
  assert.equal(k2.packages, 1, 'ажлын бус мөр «Багц ажлын тоо»-нд тоологдов');
  assert.equal(k2.budget, 200, 'ажлын бус мөр МӨНГӨН нийлбэрээс буруу хасагдав');
  assert.equal(Math.round(k.progressCovered), 100, 'хамралтын хуваарь ч тэр хүрээнд');
}

/* ── 4б. Нэг ч шат хэмжигдээгүй бол хувь нь `null` (0 БИШ) ── */
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

  /*
   * Төрөл × өртөг — БУУРАХ эрэмбэ, дэд нь ГЭРЭЭЛСЭН дүн.
   *
   * ⚠️ 2026-09-07: дэд цуваа нь ГҮЙЦЭТГЭЛ байснаа ГЭРЭЭЛСЭН болов
   * (`chartTypeCost`-ийн тайлбарыг үз). Гүйцэтгэлийн хувь нь индикатор ба
   * `kpisOf`-д хэвээр шалгагдана.
   */
  const c1 = chartTypeCost(rows);
  assert.deepEqual(c1.map((x) => x.key), ['БАРИЛГА', 'ИНЖЕНЕР']);
  assert.equal(c1[1].value, 400);
  assert.equal(c1[1].sub, 300);      // зөвхөн CONTRACTED мөрийн өртөг
  assert.equal(c1[0].sub, 600);      // БАРИЛГА нь бүхэлдээ гэрээлсэн
  assert.equal(c1[1].count, 2);      // ажлын тоо
  assert.equal(c1[1].countSub, 1);   // тэдгээрээс гэрээтэй нь

  /* ⚠️ ГҮЙЦЭТГЭЛИЙН ХОЁР ХЭМЖҮҮР нь 2026-09-10-нд ЭНЭ чарт руу нэгдсэн
     (`chartTypeCount` хасагдав). `perf` нь объёмын эх сурвалж руу шилждэг,
     `fin` нь ҮРГЭЛЖ санхүүжсэн талбараас — хоёулаа өртгөөр жигнэгдэнэ. */
  const eng = c1.find((x) => x.key === 'ИНЖЕНЕР');
  assert.equal(eng.count, 2);
  assert.equal(eng.countSub, 1);
  /* Хэмжигдээгүй мөр (`progress == null`) хуваарь, хүртвэрт ч ОРОХГҮЙ */
  const perfRows = [
    buildRow({ oid: 1, type: 'A', cost: 900, progress: 10, note: CONTRACTED }),
    buildRow({ oid: 2, type: 'A', cost: 100, progress: 100, note: CONTRACTED }),
    buildRow({ oid: 3, type: 'A', cost: 1000, progress: null, note: CONTRACTED }),
  ];
  const cp = chartTypeCost(perfRows);
  assert.equal(Math.round(cp[0].fin * 100) / 100, 19, '(900×10+100×100)/1000');
  assert.equal(cp[0].perf, cp[0].fin, 'объёмын эх сурвалжгүй бол хоёулаа тэнцүү');
  /* Объёмын эх сурвалж БАЙВАЛ `perf` түүн рүү шилжинэ, `fin` ХЭВЭЭР */
  const volRows = [buildRow({ oid: 1, type: 'A', cost: 100, progress: 10, pkg2: 'Багц -1' })];
  const cv = chartTypeCost(volRows, new Map([['БАГЦ1', 80]]));
  assert.equal(cv[0].perf, 80, 'объёмын хувь давамгайлна');
  assert.equal(cv[0].fin, 10, 'санхүүжсэн нь хэвээр');

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

/* ── IPC-ийн хоёр дахь S-муруй (2026-09-10) ── */
{
  /* Төлөвлөгөө: 2026-01…03 сар бүр 100₮; нийт хуваарь 1000₮ */
  const plan = [
    { id: 1, start: D(2026, 1), pct: null, amount: 100 },
    { id: 2, start: D(2026, 2), pct: null, amount: 100 },
    { id: 3, start: D(2026, 3), pct: null, amount: 100 },
  ];
  /* Олголт: зөвхөн 1-2 сард (3-р сард ХАРААХАН бүртгэгдээгүй) */
  const ipc = new Map([['2026-01', 50], ['2026-02', 30]]);
  const c = cashflowCurve(plan, 1000, 'month', undefined, ipc);
  assert.equal(c.length, 3);

  /* Төлөвлөгөөний хуримтлал хэвээр — IPC нь түүнийг ХӨНДӨХГҮЙ */
  assert.deepEqual(c.map((p) => p.pct), [10, 20, 30], 'төлөвлөгөөт муруй өөрчлөгдөв');

  /* IPC хуримтлал: 50/1000=5%, (50+30)/1000=8% */
  assert.equal(c[0].ipcPct, 5);
  assert.equal(c[1].ipcPct, 8);
  /* ⚠️ ГОЛ ШАЛГУУР: сүүлийн олголтоос ХОЙШ `null` — 8 гэж сунгахгүй, 0 ч биш */
  assert.equal(c[2].ipcPct, null,
    'хэмжигдээгүй сард IPC муруй ТАСРАХ ёстой (null ≠ 0, хэвтээ сунгахгүй)');

  /* IPC-гүй дуудлага — хуучин зан хэвээр, бүх цэг `null` */
  const c0 = cashflowCurve(plan, 1000, 'month');
  assert.deepEqual(c0.map((p) => p.ipcPct), [null, null, null],
    'IPC өгөгдөлгүй үед муруй ОГТ зурагдах ёсгүй');

  /*
   * ТӨЛӨВЛӨГӨӨ БАЙХГҮЙ САРД ОЛГОЛТ ХИЙГДВЭЛ ТЭР САР ТЭНХЛЭГТ ГАРНА
   * (2026-09-10). Урьд нь тэнхлэг ЗӨВХӨН Cashflow төлөвлөгөөний саруудаас
   * угсрагддаг байв — гэтэл амьдаар төлөвлөгөө 2024-04…2025-05, IPC олголт
   * 2025-09…2026-08 буюу ОГТ ОГТЛОЛЦОХГҮЙ тул IPC муруй бүх цэгт 0% дээр
   * хэвтэж, ҮЗЭГДЭХГҮЙ байлаа. Одоо тэнхлэг нь гурван эх сурвалжийн НЭГДЭЛ.
   */
  const ipc2 = new Map([['2025-12', 200], ['2026-01', 50]]);
  const c2 = cashflowCurve(plan, 1000, 'month', undefined, ipc2);
  assert.equal(c2.length, 4, 'төлөвлөгөөгүй сар (2025-12) тэнхлэгт гарсангүй');
  assert.equal(c2[0].label, '2025-12');
  assert.equal(c2[0].ipcPct, 20, 'төлөвлөгөөгүй сарын олголт (200/1000) буруу');
  assert.equal(c2[1].ipcPct, 25, 'дараагийн сарын хуримтлал (250/1000) буруу');
  /* ⚠️ Тэр сард ТӨЛӨВЛӨГӨӨ байхгүй тул `pct` нь 0 — хуримтлал хараахан эхлээгүй */
  assert.equal(c2[0].pct, 0);

  /*
   * ОРОН СУУЦНЫ БИЕТ ЯВЦ ЦЭНХЭР МУРУЙД ОРНО — 6/7 дахь параметр (2026-09-10,
   * хэрэглэгчийн заавар: «ягаан хэсэг хэрэггүй, төлөвлөсөн дээр оруулаадах»).
   *
   * ⚠️ `housingMoney` нь ХУВЬ БИШ МӨНГӨ (ХО дүн × %): БАГЦ1 = 400₮ жинтэй,
   *    1-р сард 12.5% → 50₮, 3-р сард 30% → 120₮; 2-р сард ХЭМЖИЛТГҮЙ →
   *    бичлэг ҮГҮЙ (null ≠ 0). Жингүй/жагсаалтад байхгүй багц ОРОХГҮЙ.
   */
  const phys = new Map([
    ['БАГЦ1', new Map([['2026-01', 12.5], ['2026-03', 30]])],
    ['БАГЦ9', new Map([['2026-01', 99]])],           // орон сууц БИШ
    ['БАГЦ2', new Map([['2026-01', 50]])],           // жин ҮГҮЙ
  ]);
  const hm = housingMoney(phys, new Map([['БАГЦ1', 400], ['БАГЦ9', 400]]), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual([...hm], [['2026-01', 50], ['2026-03', 120]],
    'орон сууцны биет явцын мөнгө буруу (жин × хувь, хэмжилтгүй сар алгасна)');
  /*
   * ⚠️ ЦЭНХЭР МУРУЙ = ЦЭВЭР ТӨЛӨВЛӨГӨӨ (2026-09-10-ны ХОЁР ДАХЬ засвар).
   *
   * Урьд нь орон сууцны ажлуудын сарын мөнгийг ХАЯЖ (`skipIds`), оронд нь
   * тэдний өнөөдрийн биет явцыг цэнхэр муруйд НЭМДЭГ байв. Тэр нь амьд
   * өгөгдөл дээр муруйг 34.8% дээр тогтоож, 2027 он бүтнээр бөглөгдсөн ч
   * дээшлэхгүй болгосон. Одоо:
   *   pct     = 10 · 20 · 30   — БҮХ ажлын төлөвлөгөө, хасалтгүй
   *   physPct =  5 ·  5 · 12   — орон сууцны биет явц ТУСДАА (2-р сар
   *                              хэмжилтгүй тул СҮҮЛИЙН утга урагш явна)
   */
  const ch = cashflowCurve(plan, 1000, 'month', undefined, new Map(), hm);
  assert.deepEqual(ch.map((p) => p.pct), [10, 20, 30],
    'төлөвлөсөн муруй нь БҮХ ажлын cashflow байх ёстой (орон сууц хасагдахгүй)');
  assert.deepEqual(ch.map((p) => p.physPct), [5, 5, 12],
    'орон сууцны биет явц ТУСДАА муруй байх ёстой');
  /* Биет хэмжилтгүй бол гурав дахь муруй ОГТ зурагдахгүй (`null ≠ 0`) */
  const chNo = cashflowCurve(plan, 1000, 'month');
  assert.deepEqual(chNo.map((p) => p.physPct), [null, null, null],
    'биет хэмжилтгүй үед муруй 0%-ээр зурагдав');

  /* Улирлаар: IPC нь ХУРИМТЛАЛ тул бүлгийн СҮҮЛИЙНХ */
  const cq = cashflowCurve(plan, 1000, 'quarter', undefined, ipc);
  assert.equal(cq.length, 1);
  assert.equal(cq[0].amount, 300, 'улирлын мөнгө НИЙЛБЭР байх ёстой');
  assert.equal(cq[0].ipcPct, 8,
    'улирлын IPC нь бүлгийн СҮҮЛИЙН хуримтлал байх ёстой (нийлбэр БИШ)');
}

console.log('gdash.check.mjs — БҮГД ТЭНЦЛЭЭ');

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
  cashflowCurve, housingMoney, fillMonths,
  housingPct, housingSeries, pkgCostWeight, cfWeightRow, CF, contractedScope, housingPlanSeries,
  isContracted,
} from './gdash.ts';

/* ⚠️ 2026-10-09: «гэрээтэй» — порталын НЭГ предикат: түүхий мөр (`ho_dungiin_tailbar`) ба `CfRow` (`note`) */
assert.equal(isContracted({ [CF.note]: '  Гэрээлсэн   дүн ' }), true, 'зай нэгтгэнэ');
assert.equal(isContracted({ [CF.note]: 'Урьдчилсан дүн', [CF.contract]: 900 }), false, 'дүнтэй ч тайлбаргүй → гэрээгүй');
assert.equal(isContracted({ note: CONTRACTED }), true, 'CfRow');
assert.equal(isContracted({ note: '' }), false);
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
  /* ⚠️ 2026-09-30: объёмын (биет) эх сурвалжгүй бол `perf` = null — санхүүжсэн
     хувь руу чимээгүй УНАХГҮЙ (биет ба санхүүгийн хувийг холихгүй); `fin` тусдаа. */
  assert.equal(cp[0].perf, null, 'биет хэмжилтгүй бол perf null (fin руу унахгүй)');
  /* Холимог ангилал: биеттэй мөр л `perf`-д орно, биетгүй мөр хуваарьт ч орохгүй */
  const mix = chartTypeCost([
    buildRow({ oid: 1, type: 'A', cost: 100, progress: 10, pkg2: 'Багц -1' }),
    buildRow({ oid: 2, type: 'A', cost: 900, progress: 90, pkg2: 'Багц -9' }),
  ], new Map([['БАГЦ1', 40]]));
  assert.equal(mix[0].perf, 40, 'биетгүй мөрийн санхүүгийн 90% perf-д холилдов');
  assert.equal(mix[0].fin, 82, 'fin = (100×10+900×90)/1000');
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

  /*
   * ОГНООГҮЙ УРЬДЧИЛГАА (`ipcBase`, 2026-09-10) — ЭХНИЙ IPC сараас хуримтлалд
   * орно, сүүлийн сард БИШ (тэнд хуурамч оргил үүснэ). `ipcMoney` нь ЯГ ₮:
   *   01: 20+50 = 70 → 7%   02: 70+30 = 100 → 10%   03: null (муруй тасарна)
   */
  const cb = cashflowCurve(plan, 1000, 'month', undefined, ipc, new Map(), 20);
  assert.deepEqual(cb.map((p) => p.ipcPct), [7, 10, null], 'ipcBase эхний сараас орсонгүй');
  assert.deepEqual(cb.map((p) => p.ipcMoney), [70, 100, null], 'ipcMoney яг ₮ биш');
  /* `ipcBase`-гүй бол мөнгө = сарын нийлбэр */
  assert.deepEqual(c.map((p) => p.ipcMoney), [50, 80, null]);

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
  /*
   * ⚠️ Тэр сард ТӨЛӨВЛӨГӨӨ байхгүй тул `pct` нь `null` — 0 БИШ (2026-09-11).
   *    Тэнхлэг нь гурван эх сурвалжийн нэгдэл тул Cashflow-гийн төлөвлөгөө
   *    огт байхгүй сар ч гарч ирнэ; тэнд 0 зурвал «төлөвлөгөө 0%» гэсэн худал
   *    мэдэгдэл болно (`ipcPct`/`physPct`-тэй ижил дүрэм, `null ≠ 0`).
   */
  assert.equal(c2[0].pct, null,
    'төлөвлөгөөгүй сард `pct` нь null байх ёстой (0 нь «төлөвлөгөө тэг» гэсэн худал уншилт)');

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
  /* ⚠️ 2026-09-25: СИЙРЭГ эх (`buildPhys` дүрэм 2) — 2-р сард зөвхөн БАГЦ2
     шинээр тайлагнасан ч БАГЦ1-ийн 1-р сарын 10% (as-of) нийлбэрт ҮЛДЭНЭ:
     100·0.1 + 100·0.5 = 60. Урьд нь 50 болж муруй унадаг байв. */
  const sparse = housingMoney(
    new Map([
      ['БАГЦ1', new Map([['2026-01', 10], ['2026-03', 30]])],
      ['БАГЦ2', new Map([['2026-02', 50]])],
    ]),
    new Map([['БАГЦ1', 100], ['БАГЦ2', 100]]),
    ['2026-01', '2026-02', '2026-03'],
  );
  assert.deepEqual([...sparse], [['2026-01', 10], ['2026-02', 60], ['2026-03', 80]],
    'сийрэг эх: тайлагнаагүй багцын сүүлийн утга (as-of) нийлбэрт үлдэх ёстой');
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

/*
 * ── ОРОН СУУЦНЫ БИЕТ ГҮЙЦЭТГЭЛ — НЭГ ТОМЬЁО (2026-09-30) ──
 *
 * ⚠️ Урьд нь дөрвөн өөр дундаж байв (блокоор · төсвөөр · блокийн энгийн · ХО
 *    дүнгээр). Одоо `housingPct` ганц томьёо; доорх нь ХАРАГДАЦ бүрийн замаар
 *    НЭГ өгөгдлөөс ИЖИЛ тоо гарахыг баталгаажуулна:
 *      · `housingSeries` (→ `pkgShared.aggregateMonths`/`physNow`: PkgProg · Dashboard
 *        · ExecReport · GeneralDash «ОРОН СУУЦНЫ ХОРООЛОЛ»)
 *      · `housingPct` багцын одоогийн утгаар (→ `reportData.loadOverall` = Тайлан)
 *      · `housingMoney` ÷ хэмжигдсэн багцын ХО нийлбэр (→ GeneralDash S-муруй)
 */
{
  /* Жин — ТҮҮХИЙ мөрөөс (`cfWeightRow` → `pkgCostWeight`): «Нийт»-ийн гадна мөр,
     диапазон мөр, '0' түлхүүр хасагдана; нэг багцын олон гэрээ НИЙЛБЭР. */
  const raw = [
    { [CF.pkg2]: 'Багц 1', [CF.cost]: 300, [CF.code1]: '1' },
    { [CF.pkg2]: 'Багц 1', [CF.cost]: 100, [CF.code1]: '1' },
    { [CF.pkg2]: 'Багц 2', [CF.cost]: 600, [CF.code1]: '1' },
    { [CF.pkg2]: 'БАГЦ 1-4', [CF.cost]: 5000, [CF.code1]: '1' },
    { [CF.pkg2]: 'Багц 3.1', [CF.cost]: 999, [CF.code1]: '7' },
  ];
  const cost = pkgCostWeight(raw.map(cfWeightRow));
  assert.equal(cost.get('БАГЦ1'), 400, 'нэг багцын олон гэрээ нийлбэр');
  assert.equal(cost.get('БАГЦ2'), 600);
  assert.equal(cost.has('БАГЦ14'), false, 'диапазон мөр «Багц 14»-т наалдав');
  assert.equal(cost.has('БАГЦ31'), false, '«Нийт»-ийн гадна (7-р хэсэг) мөр жинд орлоо');

  /* ӨРТГӨӨР ЖИГНЭНЭ, блокоор биш: 400₮·10% + 600₮·60% = 40% (блокоор 4·10+20·60 → 51.7) */
  assert.equal(housingPct([
    { pct: 10, cost: 400, blocks: 4 }, { pct: 60, cost: 600, blocks: 20 },
  ]), 40);
  /* null ≠ 0 — хэмжигдээгүй багц хуваарьт ОРОХГҮЙ */
  assert.equal(housingPct([
    { pct: 10, cost: 400 }, { pct: null, cost: 600 },
  ]), 10, 'хэмжигдээгүй багц 0% гэж орлоо');
  assert.equal(housingPct([{ pct: null, cost: 1 }]), null, 'хэмжилтгүй үед null байх ёстой');
  assert.equal(housingPct([]), null);
  /* ХО дүн огт алга → блокийн тоонд БҮРЭН шилжинэ (хагас холихгүй) */
  assert.equal(housingPct([
    { pct: 10, cost: 0, blocks: 1 }, { pct: 40, cost: 0, blocks: 2 },
  ]), 30);
  /* Нэг нь л ХО-тэй бол ХО-гүй багц жингүй (блокоор нөхөхгүй) */
  assert.equal(housingPct([
    { pct: 10, cost: 100, blocks: 1 }, { pct: 90, cost: 0, blocks: 50 },
  ]), 10);

  /* ── Гурван замын ИЖИЛ тоо ── */
  const labels = ['2026-06', '2026-07', '2026-08'];
  const phys = new Map([
    ['БАГЦ1', new Map([['2026-06', 10], ['2026-08', 20]])],
    ['БАГЦ2', new Map([['2026-07', 50]])],
  ]);
  const physCnt = new Map([
    ['БАГЦ1', new Map([['2026-06', 4], ['2026-08', 4]])],
    ['БАГЦ2', new Map([['2026-07', 20]])],
  ]);
  const physAt = new Map([
    ['БАГЦ1', new Map([['2026-06', '2026-06-05'], ['2026-08', '2026-08-12']])],
    ['БАГЦ2', new Map([['2026-07', '2026-07-20']])],
  ]);
  const s = housingSeries(phys, physCnt, physAt, cost, labels);
  /* 6-р сар: БАГЦ2 хараахан тайлагнаагүй → 0% (finPhys дүрэм 1, as-of) */
  assert.deepEqual(s.map((x) => x.phys), [4, 34, 38],
    'сарын цуваа: 6 — 400·10/1000; 7 — (400·10+600·50)/1000; 8 — (400·20+600·50)/1000');
  assert.deepEqual(s.map((x) => x.physAt), ['2026-06-05', '2026-07-20', '2026-08-12'],
    'хэмжилтийн огноо — тэр сарын хамгийн сүүлийн бичилт');
  /* Хэмжилтгүй сар `null` (0 биш) */
  const gap = housingSeries(phys, physCnt, physAt, cost, ['2026-06', '2026-06b', '2026-07']);
  assert.equal(gap[1].phys, null, 'шинэ бичилтгүй сар null байх ёстой');

  /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): ОГТ тайлагнаагүй багц (`physN`-д л байгаа) бүх сард
     0%-иар ЖИНД ОРНО — урьд нь хасагддаг байв. Цэгийн сарууд хөдлөхгүй (шинэ бичилт үүсгэхгүй). */
  {
    const cost3 = new Map([...cost, ['БАГЦ3', 1000]]);
    const physN = new Map([['БАГЦ1', 4], ['БАГЦ2', 20], ['БАГЦ3', 5]]);
    const s3 = housingSeries(phys, physCnt, physAt, cost3, labels, physN);
    assert.deepEqual(s3.map((x) => x.phys), [2, 17, 19],
      'тайлагнаагүй БАГЦ3 (ХО 1000) 0%-иар хуваарьт: 6 — 4000/2000; 7 — 34000/2000; 8 — 38000/2000');
    assert.equal(housingSeries(phys, physCnt, physAt, cost3, ['2026-06b'], physN)[0].phys, null,
      'тайлагнаагүй багц шинэ цэг үүсгэв');
  }

  /* (1) aggregateMonths/physNow замын СҮҮЛИЙН утга */
  const viaSeries = s[s.length - 1].phys;
  /* (2) Тайлан (`loadOverall`): багц бүрийн ОДООГИЙН утга → `housingPct` */
  const viaReport = housingPct([...phys].map(([k, m]) => ({
    pct: [...m.entries()].sort()[m.size - 1][1], cost: cost.get(k) ?? 0, blocks: 1,
  })));
  /* (3) GeneralDash S-муруй: `housingMoney` (₮) ÷ хэмжигдсэн багцын ХО нийлбэр */
  const money = housingMoney(phys, cost, labels, ['БАГЦ1', 'БАГЦ2']);
  const viaMoney = (money.get('2026-08') / (cost.get('БАГЦ1') + cost.get('БАГЦ2'))) * 100;
  assert.equal(viaSeries, 38);
  assert.equal(viaReport, viaSeries, 'Тайлан ба 05/Dashboard/ExecReport-ийн орон сууцны хувь зөрөв');
  assert.equal(Math.round(viaMoney * 1e9) / 1e9, viaSeries, 'S-муруйн мөнгөн жин өөр томьёо болов');
}

/*
 * ── «ГЭРЭЭЛСЭН ДҮН»-ИЙ ХҮРЭЭ — `contractedScope` (2026-09-30) ──
 *
 * ⚠️ Дашбоардын «Санхүүжилтийн хуримтлал — сараар» (тайлбар «олгосон / гэрээний
 *    нийт дүн») `FinData.planTotal`-аар (гэрээ ЭСВЭЛ төсөв, бүх мөр) хуваадаг
 *    байсан тул Тайлангийн `paidRate` (гэрээлсэн дүн = «Нийт» хүрээ ∧ CONTRACTED)-аас
 *    доогуур гардаг байв. Энэ функц нь `reportData.contractAmount` ·
 *    `live.loadBudget.contract`-ийн ЯГ дүрэм байх ёстой.
 */
{
  const r = (o) => ({ [CF.code1]: '1', [CF.note]: CONTRACTED, [CF.contract]: 0, [CF.pkg]: '', ...o });
  const sc = contractedScope([
    r({ [CF.contract]: 100, [CF.pkg]: 'Багц 1' }),
    r({ [CF.contract]: 50, [CF.pkg]: 'Багц-3.1' }),
    /* Дотор нь давхар зай — «Гэрээлсэн  дүн» (reportData.str-ийн дүрэм) */
    r({ [CF.contract]: 7, [CF.pkg]: 'Багц 2', [CF.note]: ' Гэрээлсэн  дүн ' }),
    /* Гэрээгүй мөрд `geree_dun` бөглөгдсөн — ОРОХГҮЙ (~33 тэрбумын зөрүү) */
    r({ [CF.contract]: 999, [CF.pkg]: 'Багц 5.1', [CF.note]: 'Урьдчилсан төсөвт өртөг' }),
    /* «Нийт»-ийн гадна (5·6·7-р хэсэг) — ОРОХГҮЙ */
    r({ [CF.contract]: 888, [CF.pkg]: 'Багц 19.1', [CF.code1]: '5' }),
    /* Диапазон мөр — дүн орно, түлхүүр «БАГЦ14» болж наалдахгүй */
    r({ [CF.contract]: 3, [CF.pkg]: 'БАГЦ 1-4' }),
    /* Хоосон/«0» багц — түлхүүргүй */
    r({ [CF.contract]: 2, [CF.pkg]: '0' }),
  ]);
  assert.equal(sc.amount, 100 + 50 + 7 + 3 + 2, 'гэрээлсэн дүн: зөвхөн «Нийт» ∧ CONTRACTED мөр');
  assert.deepEqual([...sc.keys].sort(), ['БАГЦ1', 'БАГЦ2', 'БАГЦ31'], 'тоологчийн багц: гэрээлсэн мөрийн түлхүүр');
  assert.equal(sc.keys.has('БАГЦ14'), false, 'диапазон мөр «Багц 14»-т наалдав');
  assert.equal(sc.keys.has('БАГЦ51'), false, 'гэрээгүй багц тоологчид орлоо');
  assert.deepEqual(contractedScope([]), { amount: 0, keys: new Set() });
}

/*
 * ── ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ — бодит талтай НЭГ жин (`housingPlanSeries`, 2026-09-30) ──
 *
 * ⚠️ Бодит (`housingSeries` → `physNow`) ХО дүнгээр жигнэгддэг болсон атал
 *    төлөвлөгөө (`PlanCurve.months`) БЛОКИЙН тоогоор үлдэж, «төлөвлөсөн − бодит»
 *    хоёр өөр жинг хасдаг байв. Хуваариараа ЯГ явж буй төсөлд зөрүү 0 байх ЁСТОЙ.
 */
{
  const cost = new Map([['БАГЦ1', 400], ['БАГЦ2', 600]]);
  const byBagts = new Map([
    ['БАГЦ1', [{ label: '2026-06', pct: 10 }, { label: '2026-07', pct: 20 }, { label: '2026-08', pct: 30 }]],
    ['БАГЦ2', [{ label: '2026-07', pct: 50 }, { label: '2026-08', pct: 60 }, { label: '2026-09', pct: 100 }]],
    /* ХО дүнгүй багц — жингүй тул орохгүй (`housingPct`-ийн дүрэм) */
    ['БАГЦ9', [{ label: '2026-06', pct: 99 }]],
  ]);
  const base = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    .map((label, i) => ({ label, pct: -1, vol: i === 1 ? 123 : null }));
  const s = housingPlanSeries(byBagts, cost, base);
  /* 06: Б2 эхлээгүй → 0; 09-10: Б1 дууссан → сүүлийн утга (30) */
  assert.deepEqual(s.map((p) => p.pct), [4, 38, 48, 72, 72],
    'ХО жин: 06 — 400·10/1000; 07 — (400·20+600·50)/1000; 08 — (400·30+600·60)/1000; 09 — (400·30+600·100)/1000');
  assert.deepEqual(s.map((p) => p.label), base.map((p) => p.label), 'тэнхлэг base-ээс');
  assert.equal(s[1].vol, 123, 'vol нь base-ээс хадгалагдана');
  /* Хуваарийн дагуу ЯГ явж буй төсөл: бодит = төлөвлөгөө (багц бүрд) ⇒ зөрүү 0 */
  const phys = new Map([...byBagts].filter(([k]) => k !== 'БАГЦ9')
    .map(([k, pts]) => [k, new Map(pts.map((p) => [p.label, p.pct]))]));
  const act = housingSeries(phys, new Map(), undefined, cost, base.map((p) => p.label));
  for (let i = 0; i < 4; i += 1) {
    assert.equal(act[i].phys, s[i].pct, `${base[i].label}: хуваарийн дагуу явж буй төсөлд «төлөвлөсөн − бодит» ≠ 0 (жин зөрөв)`);
  }
  /* ХО жин огт алга → base хэвээр (блокийн нөөц); хоосон base → хоосон (дутуу муруй гаргахгүй) */
  assert.deepEqual(housingPlanSeries(byBagts, new Map(), base), base);
  assert.deepEqual(housingPlanSeries(byBagts, cost, []), []);
}

/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `cashflowCurve` сарыг ОРОН НУТГИЙН цагаар
   (`monthKey`) — AGOL/Excel-ээс орсон УБ-ын шөнө дунд (= өмнөх өдрийн 16:00Z) UTC-ээр өмнөх
   сард буудаг байв. Туршилт TZ-ээс хамаарахгүй: локал шөнө дунд нь ямар ч бүсэд тэр сар. */
{
  const localJun1 = new Date(2026, 5, 1).getTime();
  const c = cashflowCurve([{ id: 1, start: localJun1, pct: null, amount: 100 }], 1000, 'month');
  assert.deepEqual(c.map((p) => p.label), ['2026-06'], 'сарын 1-ний орон нутгийн шөнө дунд өмнөх сард буув');
  /* Порталаас бичигддэг UTC шөнө дунд — УБ-д ЯГ тэр сар (хуучин өгөгдөл хөдлөхгүй) */
  const utcJun1 = Date.UTC(2026, 5, 1);
  const off = new Date(utcJun1).getTimezoneOffset();
  if (off <= 0) {
    assert.deepEqual(cashflowCurve([{ id: 1, start: utcJun1, pct: null, amount: 100 }], 1000, 'month').map((p) => p.label), ['2026-06']);
  }
}

/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): S-муруйн тэнхлэг ТАСРАЛТГҮЙ. Урьд нь зөвхөн
   өгөгдөлтэй саруудаас угсардаг тул 2025-05 → 2025-08 (6, 7-р сар алга) гэж үсэрдэг байв. */
{
  assert.deepEqual(fillMonths(['2025-08', '2025-05']), ['2025-05', '2025-06', '2025-07', '2025-08']);
  assert.deepEqual(fillMonths(['2025-11', '2026-02']), ['2025-11', '2025-12', '2026-01', '2026-02'], 'оны заагаар');
  assert.deepEqual(fillMonths(['2026-03']), ['2026-03']);
  assert.deepEqual(fillMonths([]), []);
  assert.deepEqual(fillMonths(['1970-01', '2026-01']), ['1970-01', '2026-01'], 'эвдэрсэн огноо — мянган хоосон цэг үүсгэхгүй');
  /* Төлөвлөгөө 05 ба 08 (хуримтлал), IPC 05 ба 08 (хуримтлал), биет явц зөвхөн 08 */
  const plan = [
    { id: 1, start: new Date(2025, 4, 1).getTime(), pct: null, amount: 100 },
    { id: 2, start: new Date(2025, 7, 1).getTime(), pct: null, amount: 100 },
  ];
  const c = cashflowCurve(plan, 1000, 'month', undefined,
    new Map([['2025-05', 10], ['2025-08', 30]]), new Map([['2025-08', 200]]));
  assert.deepEqual(c.map((p) => p.label), ['2025-05', '2025-06', '2025-07', '2025-08'], '6, 7-р сар тэнхлэгт алга');
  assert.deepEqual(c.map((p) => p.pct), [10, 10, 10, 20], 'төлөвлөгөөний хуримтлал өөрийн хүрээнд урагш явна');
  assert.deepEqual(c.map((p) => p.ipcPct), [1, 1, 1, 4], 'IPC хуримтлал өөрийн хүрээнд урагш явна');
  assert.deepEqual(c.map((p) => p.amount), [100, 0, 0, 100], 'сарын мөнгө — хоосон сард нэмэгдэхгүй');
  assert.deepEqual(c.map((p) => p.physPct), [null, null, null, 20], 'биет явц эхний хэмжилтээс ӨМНӨ null (0 биш)');
}

console.log('gdash.check.mjs — БҮГД ТЭНЦЛЭЭ');

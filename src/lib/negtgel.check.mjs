/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛИЙН БОДОЛТЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/negtgel.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ЭЦГИЙГ КОДООР хайх. Эх хүснэгтэд код ДАВХАРДСАН («6.2» нь хоёр мөрд,
 *      «6» нь хоёр мөрд) тул модыг ЗӨВХӨН байрлал + гүнээр угсарна.
 *   2. `null` → `0`. Тааралгүй мөр 0% гэж гарвал «эх сурвалжгүй» ба «тэг
 *      гүйцэтгэл» хоёр нэгдэж, төслийн явц худал доошилно.
 *   3. ЖИГНЭЛТГҮЙ дундаж. 1,920 тэрбумын ажил ба 0.5 тэрбумын ажлыг тэнцүү
 *      жинтэй авбал нэгтгэл гүйцэтгэл утгаа алдана.
 *   4. ДАВХАР ТООЛОЛТ. Нэг гэрээ хоёр хүүхдэд орсон ч эцэгтээ НЭГ л удаа.
 *   5. ЖИНГИЙН НИЙЛБЭР 100 БИШ болох. Тэгвэл SUMPRODUCT нь хувь байхаа болино.
 *   6. Төслийн нийтийг БҮХ мөрөөр нэмэх. Эцэг ба хүүхэд хоёулаа бичигдсэн тул
 *      нийлбэр хоёр дахин өснө — ЗӨВХӨН хэсгийн мөрөөр бодно.
 */
import assert from 'node:assert/strict';
import { negtgelDepth, negtgelTree, computeNegtgel, SECTION_WEIGHT } from './negtgel.ts';
import { CASHFLOW_NEW } from './services.ts';

const ST = CASHFLOW_NEW.stages;

/* ── 1. Гүн ─────────────────────────────────────────────────────── */
assert.equal(negtgelDepth(''), 0);
assert.equal(negtgelDepth('1'), 1);
assert.equal(negtgelDepth('1.2'), 2);
assert.equal(negtgelDepth('1.2.1.1'), 4);

/* ── 2. Мод нь БАЙРЛАЛААР угсрагдана (код давхардсан ч) ─────────── */
const rows = [
  { oid: 1, code: '', name: 'ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ', depth: 0 },
  { oid: 2, code: '1', name: 'ТЭЗҮ', depth: 1 },
  { oid: 3, code: '1.1', name: 'Орон сууцны хороолол барилга угсралт', depth: 2 },
  { oid: 4, code: '1.2', name: 'Гадна инженерийн шугам сүлжээ', depth: 2 },
  { oid: 5, code: '1.2.1', name: 'Гадна дулаан, ус хангамж, ариутгах татуурга', depth: 3 },
  { oid: 6, code: '1.2.1.1', name: 'Багц 1 Гадна дулаан, ус хангамж, ариутгах татуурга', depth: 4 },
  { oid: 7, code: '1.2.1.2', name: 'Багц 2 Гадна дулаан, ус хангамж, ариутгах татуурга', depth: 4 },
  { oid: 8, code: '6', name: 'Барилга угсралт', depth: 1 },
  { oid: 9, code: '6.1', name: 'Цэцэрлэг, сургууль', depth: 2 },
  /* ⚠️ Код нь «6» — дээрх хэсэгтэй ДАВХАРДСАН (эх өгөгдөлд бий) */
  { oid: 10, code: '6', name: 'Улсын комисс, хүлээлгэн өгөх', depth: 1 },
];
const { parent, kids } = negtgelTree(rows);
assert.equal(parent[0], -1, 'дээд мөр эцэггүй');
assert.equal(parent[1], 0, '«ТЭЗҮ»-ийн эцэг нь төслийн мөр');
assert.equal(parent[5], 4, '«Багц 1»-ийн эцэг нь «Гадна дулаан…»');
assert.equal(parent[9], 0, 'давхардсан «6» код ч төслийн мөрөнд харьяалагдана');
assert.deepEqual(kids[1].map((i) => rows[i].oid), [3, 4], '«ТЭЗҮ»-ийн хүүхдүүд');
assert.deepEqual(kids[7].map((i) => rows[i].oid), [9], '«Барилга угсралт»-ын хүүхэд');

/* ── 3. Бодолт ─────────────────────────────────────────────────── */
const cf = [
  {
    turul: 'ОРОН СУУЦНЫ ХОРООЛЛЫН БАРИЛГАЖИЛТ',
    pkg2: 'БАГЦ-1',
    detail: 'Орон сууц 1',
    budget: 900,
    pct: { [ST.tezu]: 100, [ST.build]: 20, [ST.land]: null },
  },
  {
    turul: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ',
    pkg2: 'БАГЦ-5.1',
    detail: 'Ус хангамж 1',
    budget: 100,
    pct: { [ST.tezu]: 50, [ST.build]: 0, [ST.land]: null },
  },
  {
    turul: 'НИЙГМИЙН ДЭД БҮТЭЦ',
    pkg2: 'БАГЦ-19.1',
    detail: 'Сургууль',
    budget: 0,
    /* ⚠️ ХЭМЖИЛТГҮЙ гэрээ — дунджид ОРОХГҮЙ, 0 гэж тоологдохгүй */
    pct: { [ST.tezu]: null, [ST.build]: null, [ST.land]: null },
  },
];
const calc = computeNegtgel(rows, cf, 93.2);
const g = (oid) => calc.get(oid);

/* Хэсэг = бүх гэрээ, төсвөөр жигнэсэн: (900·100 + 100·50 + 0) / 1000 = 95 */
assert.equal(g(2).actPct, 95, 'ТЭЗҮ нь ЖИГНЭСЭН дундаж байх ёстой');
assert.notEqual(g(2).actPct, 75, 'энгийн дундаж (100+50)/2 БИШ');

/* Хэмжилтгүй гэрээ дунджид ОРОХГҮЙ — эс бөгөөс (100+50+0)/3 = 50 болно */
assert.ok(g(2).actPct > 90, 'хэмжилтгүй гэрээ 0 болж дунджийг татах ёсгүй');

/* ── 4. ХЭСГИЙН ЖИН ба SUMPRODUCT ──────────────────────────────── */
/* ⚠️ Жингийн нийлбэр 100 БИШ бол SUMPRODUCT нь хувь байхаа болино */
assert.equal(
  Object.values(SECTION_WEIGHT).reduce((a, b) => a + b, 0), 100,
  'хэсгийн жингийн нийлбэр ЗААВАЛ 100',
);

/* Хэсэг нь тогтоосон жингээ ШУУД авна */
assert.equal(g(2).inProject, 5, 'ТЭЗҮ-гийн жин = 5%');
assert.equal(g(8).inProject, 79, 'Барилга угсралтын жин = 79%');
assert.equal(g(10).inProject, 1, 'гэрээгүй хэсэг ч жингээ хадгална');

/* Хувь нэмэр = жин × гүйцэтгэл ÷ 100 */
assert.equal(g(2).share, 4.75, 'ТЭЗҮ: 5% × 95% = 4.75');
assert.equal(g(10).share, null, 'хэмжилтгүй хэсэгт хувь нэмэр БАЙХГҮЙ (0 БИШ)');

/* Хэсгийн жин нь доод мөрүүдэд ТӨСВӨӨР тарна — нийлбэр нь хэсгийн жин */
assert.ok(Math.abs((g(3).inProject ?? 0) + (g(4).inProject ?? 0) - 5) < 1e-9,
  'хэсэг доторх жингийн нийлбэр = хэсгийн жин');

/* Дэд багцаар — «Багц 1 Гадна дулаан…» → БАГЦ-5.1 */
assert.equal(g(6).actPct, 50, 'дэд багцаар таарсан мөр');
assert.equal(g(6).n, 1);
assert.equal(g(7).actPct, null, 'БАГЦ-5.2 гэрээ байхгүй — ХООСОН, 0 БИШ');
assert.equal(g(7).n, 0);
assert.equal(g(7).inSection, null, 'тааралгүй мөрд жин ч байхгүй');

/* Эцэг нь хүүхдүүдээсээ — «Гадна дулаан…» = «Багц 1» (100 нэгж) */
assert.equal(g(5).actPct, 50, 'эцэг нь хүүхдийнхээ гэрээг өвлөнө');
assert.equal(g(4).actPct, 50, 'дээд эцэг ч мөн');

/* Давхар тоолохгүй: 1.2 → 1.2.1 → 1.2.1.1 нь бүгд ижил НЭГ гэрээ */
assert.equal(g(4).n, 1, 'нэг гэрээ эцэгтээ НЭГ л удаа');

/* Төрлөөр — «Цэцэрлэг, сургууль» → НИЙГМИЙН ДЭД БҮТЭЦ, хэмжилтгүй */
assert.equal(g(9).n, 1, 'төрлөөр таарсан');
assert.equal(g(9).actPct, null, 'гэрээ нь хэмжилтгүй тул ХООСОН');

/* Газар чөлөөлөлт — ТУСГАЙ эх сурвалж */
const landRows = [
  { oid: 20, code: '3', name: 'Газар чөлөөлөлт', depth: 1 },
];
const landCalc = computeNegtgel(landRows, cf, 93.2);
assert.equal(landCalc.get(20).actPct, 93.2, 'газар чөлөөлөлт нь газрын модулиас');

/* Эх сурвалжгүй хэсэг («Улсын комисс») ХООСОН */
assert.equal(g(10).actPct, null, 'мэдэгдэхгүй хэсэг таамаглаж бөглөгдөхгүй');
assert.equal(g(10).n, 0);

/*
 * ТӨСЛИЙН ДЭЭД МӨР = SUMPRODUCT(жин, гүйцэтгэл), ЗӨВХӨН ХЭСГИЙН мөрөөр.
 *   ТЭЗҮ            5% × 95% = 4.75
 *   Барилга угсралт 79% × 18% = 14.22   (900·20 + 100·0) / 1000 = 18
 *   Улсын комисс     1% × —   = 0.00
 *                              ──────
 *                              18.97
 */
assert.ok(Math.abs(g(1).actPct - 18.97) < 1e-9, 'төслийн нийт = SUMPRODUCT');
assert.equal(g(1).inProject, 100, 'дээд мөр нь 100%');

/*
 * ⚠️ ХЭСГИЙН ДОТООД мөрүүдийг ЦУГ нэмбэл ДАВХАРДАНА: «Гадна инженерийн
 * шугам сүлжээ» (0.25) → «Гадна дулаан…» (0.25) → «Багц 1» (0.25) гэсэн
 * гурван мөр НЭГ ижил гэрээг гурван удаа бичдэг. Тиймээс төслийн нийтийг
 * ЗӨВХӨН ХЭСГИЙН мөрөөр бодно.
 */
const tezuKids = [3, 4, 5, 6, 7].reduce((a, o) => a + (g(o).share ?? 0), 0);
assert.ok(tezuKids > g(2).share, 'дотоод мөрүүдийн нийлбэр хэсгийнхээсээ давна');

/* Харин НАВЧ мөрүүд нь давхардахгүй — тэдний нийлбэр хэсгийн жинд багтана */
const tezuLeaves = [3, 6, 7].reduce((a, o) => a + (g(o).inProject ?? 0), 0);
assert.ok(Math.abs(tezuLeaves - 5) < 1e-9, 'навчны жин = хэсгийн жин (5%)');

console.log('negtgel.check: ok — мод · жигнэлт · давхар тоолол · жин 100 · SUMPRODUCT');

/* ══════════ АВТОМАТ БОДОЛТ (`negtgelAuto.ts`, 2026-09-25) ══════════
 *   7. ДАВХАРДСАН БҮЛЭГ КОД: «5.2.3» дөрвөн мөрд — эхнийх нь бүлэг, бусад нь
 *      түүний дэд хэсэг. «3» (хүүхэдгүй) давхардал тусдаа хэвээр.
 *   8. БАГЦЫН ДУГААР: «БАГЦ 1- 4» ≠ «БАГЦ-14» (цэг/зураас хадгална).
 *   9. ЭЦЭГ = SUMPRODUCT(жин, хүүхэд) — Σw-д ХУВААХГҮЙ (эх Excel-ийн дүрэм).
 *  10. ЭХ СУРВАЛЖГҮЙ навч хадгалсан утгаа АЛДАХГҮЙ; жин хэзээ ч бичигдэхгүй.
 */
const A = await import('./negtgelAuto.ts');

assert.deepEqual(
  A.nestDupGroups(['3', '3', '5', '5.2', '5.2.3', '5.2.3.1', '5.2.3', '5.2.3.2', '5.2.4']),
  [1, 1, 1, 2, 3, 4, 4, 5, 3],
  'бүлэг кодын давхардал эхнийхийн доор; «3» тусдаа',
);
assert.deepEqual(
  A.nestDupGroups(['5.2.3', '5.2.3.1', '5.2.3', '5.2.3.1']),
  [3, 4, 4, 5],
  'шилжсэн дэд модны давхардсан код ДАХИН шилжихгүй',
);

assert.equal(A.pkgNo('БАГЦ 1- 4'), '1-4');
assert.equal(A.pkgNo('БАГЦ-14'), '14');
assert.equal(A.pkgNo('БАГЦ - 19.1'), '19.1');
assert.equal(A.pkgNo('Багц-5.1'), '5.1');
assert.equal(A.pkgNo('БАГЦ -9'), '9');
assert.equal(A.pkgNo('БАГЦ-6.1, 6.2 Нэмэлт ажил'), A.pkgNo('БАГЦ-6.1, 6.2'));

const raw0 = (o) => ({
  oid: o.oid, code: o.code, name: o.name, bagts: o.bagts ?? '', depth: 0, w: o.w ?? null, p: o.p ?? null,
  act: o.act ?? null, planG: o.planG ?? null, planGch: null, planGu: null, perfG: null, perfGch: null, perfGu: null,
});
const tree = [
  raw0({ oid: 1, code: '4', name: 'Сонгон шалгаруулалт', p: 0.01, act: 0.5, planG: 1 }),
  raw0({ oid: 2, code: '4.1', name: 'Х', w: 0.6, act: 0.2, planG: 1 }),
  raw0({ oid: 3, code: '4.1.1', name: 'А', bagts: 'БАГЦ-16.1', w: 0.5, act: 0, planG: 1 }),
  raw0({ oid: 4, code: '4.1.2', name: 'Б', bagts: 'БАГЦ-99', w: 0.5, act: 0.4, planG: 0 }),
  raw0({ oid: 5, code: '4.2', name: 'Ц', bagts: 'Багц-7', w: 0.5, act: 0 }),
  raw0({ oid: 6, code: '6', name: 'Төслийг хүлээлгэн өгөх', p: 0.01, act: 0 }),
  raw0({ oid: 7, code: '6.1', name: 'Улсын комисс', w: 1, act: 0.3 }),
];
const dd = A.nestDupGroups(tree.map((r) => r.code));
tree.forEach((r, i) => { r.depth = dd[i]; });
const cfw = (no, tender, budget = 1) => ({ no, sec1: 'БАРИЛГА УГСРАЛТ', sec2: '', name: '', budget, tezu: null, design: null, permit: null, tender, build: null });
const src = {
  cf: [cfw('16.1', 100), cfw('7.1', 100, 3), cfw('7.2', 0, 1),
    /* ⚠️ ЗУРАГ ТӨСЛИЙН гэрээ — барилгын мөрд ОРОХГҮЙ */
    { ...cfw('16.1', 0), sec1: 'ТЭЗҮ, ЗУРАГ ТӨСӨЛ' }],
  land: 90, housing: new Map(), housingPlan: new Map(),
};
const out = A.computeNegAuto(tree, src);
const by = (oid) => out.find((r) => r.oid === oid);
assert.equal(by(3).act, 1, 'Cashflow-оос 100% (зураг төслийн гэрээ оролцохгүй)');
assert.equal(by(3).auto, true);
assert.equal(by(4).act, 0.4, 'эх сурвалжгүй багц — хадгалсан утга');
assert.equal(by(4).auto, false);
assert.equal(by(5).act, 0.75, '«Багц-7» = 7.1 + 7.2 өртгөөр жигнэсэн');
assert.equal(by(2).act, 0.7, 'эцэг = 0.5×1 + 0.5×0.4');
assert.equal(by(1).act, 0.795, 'SUMPRODUCT, Σw = 1.1-д хуваахгүй');
assert.equal(by(7).act, 0.3, 'хүлээлгэн өгөх — хадгалсан утга');
assert.equal(by(2).planG, 0.5, 'төлөвлөгөө ч SUMPRODUCT (эцгийн хадгалсан 1 дарагдана)');
assert.equal(by(2).perfG, 1.4, 'биелэлт = гүйцэтгэл ÷ төлөвлөгөө');
assert.equal(by(4).perfG, 0, 'төлөвлөгөө 0 бол биелэлт 0');
assert.ok(Math.abs(A.projectTotal(out) - (0.01 * 0.795 + 0.01 * 0.3)) < 1e-12);

/* 11. Жингийн нийлбэр 1-ээс ИХ бүлэг — эх Excel «Нийслэл төсөв»-ийг нийлбэрт оруулдаггүй */
assert.deepEqual(A.rollKids([0, 1, 2, 3], [0.8069, 0.037, 0.1561, 0.074]), [0, 1, 2], '5.2: 5.2.4 гадуур');
assert.deepEqual(A.rollKids([0, 1], [0.5, 0.5]), [0, 1], 'ердийн бүлэг бүтнээрээ');

const ups = A.negDiff(tree, out);
for (const u of ups) {
  assert.ok(!('HESEGT_EZLEH' in u) && !('TOSOLD_EZLEH_HUVI' in u), 'жин бичигдэхгүй');
  assert.ok(Object.values(u).every((v) => v !== null), 'null-оор дарахгүй');
}
assert.ok(!ups.some((u) => u.OBJECTID === 4 && 'GUITSETGELIIN_HUVI' in u), 'өөрчлөгдөөгүй утга бичигдэхгүй');

console.log('negtgelAuto: ok — давхардсан бүлэг · багцын дугаар · SUMPRODUCT · хадгалсан утга · жин бичихгүй');

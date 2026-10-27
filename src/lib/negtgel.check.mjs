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
import { negtgelDepth, negtgelTree, computeNegtgel, SECTION_WEIGHT, negtgelComplete } from './negtgel.ts';
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

/* ══════════ НЭГТГЭЛ — Excel V3 «Төсөл төлөвлөгөө биелэлт» ЗАГВАР (`negtgelAuto.ts`, 2026-10-13) ══════════
 *   7. ДАВХАРДСАН КОД: нөөц мод (`fallbackDepth`) үе шат БҮРТ тусдаа — «3» (Газар чөлөөлөлт · Зөвшөөрөл).
 *   8. БАГЦЫН ДУГААР: «БАГЦ 1- 4» ≠ «БАГЦ-14» (цэг/зураас хадгална).
 *   9. Excel-ийн МОД (`negtgelTree.ts`): 906 мөр, 8 үе шат, 8 «нийлбэрт орохгүй»; хурхираа таарахгүй бол код.
 *  10. СИСТЕМИЙН ГҮЙЦЭТГЭЛ — зөвхөн гараар бичигддэг мөрөнд (орон сууцны багц · блокгүй багц · газар),
 *      ЗӨВХӨН ӨӨРЧЛӨГДСӨН салааны өвгүүд Σ F × хүүхэд (outside хасна); бусад нүд Excel-ийн утгаа ЯГ хадгална.
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
/* 7 — «3» хоёр үе шатанд: нэг дор nestDupGroups хийвэл Зөвшөөрөл Газар чөлөөлөлтийн доор орно */
assert.deepEqual(
  A.fallbackDepth(['3', '3.1', '3.1.1', '3', '3.1', '3.2'], ['Газар', 'Газар', 'Газар', 'Зөв', 'Зөв', 'Зөв']),
  [1, 2, 3, 1, 2, 2],
  'нөөц мод — үе шат бүр тусдаа, «3» давхардал эцэг солихгүй',
);

/* 8 */
assert.equal(A.pkgNo('БАГЦ 1- 4'), '1-4');
assert.equal(A.pkgNo('БАГЦ-14'), '14');
assert.equal(A.pkgNo('БАГЦ - 19.1'), '19.1');
assert.equal(A.pkgNo('Багц-5.1'), '5.1');
assert.equal(A.pkgNo('БАГЦ -9'), '9');
assert.equal(A.pkgNo('БАГЦ-6.1, 6.2 Нэмэлт ажил'), A.pkgNo('БАГЦ-6.1, 6.2'));

/* 9 — Excel-ийн мод */
{
  const { NEG_TREE, negTreeHash } = await import('./negtgelTree.ts');
  assert.equal(NEG_TREE.depth.length, NEG_TREE.n, 'гүн мөр бүрт');
  assert.equal(NEG_TREE.n, 906, 'Excel 6–911-р мөр');
  const d = Array.from(NEG_TREE.depth, (ch) => ch.charCodeAt(0) - 48);
  assert.equal(d[0], 0, 'эхний мөр — ТӨСЛИЙН НИЙТ');
  assert.equal(d.filter((x) => x === 0).length, 1, 'нийт мөр ганц');
  assert.equal(d.filter((x) => x === 1).length, 8, '8 үе шат');
  const { parent } = A.treeOf(d);
  assert.ok(parent.slice(1).every((p) => p >= 0), 'нийтээс бусад бүх мөр эцэгтэй (outline)');
  assert.deepEqual([...NEG_TREE.outside], [64, 249, 323, 509, 699, 851, 883, 885], 'Excel-ийн томьёонд ороогүй 8 мөр');
  assert.ok(NEG_TREE.outside.every((i) => d[i] >= 2), '«нийлбэрт орохгүй» нь үе шат биш');
  /* хурхираа таарахгүй → кодоор */
  const t = A.excelTree(['0', '1', '1.1', '2'], ['', 'ТЭЗҮ', 'ТЭЗҮ', 'Зураг']);
  assert.equal(t.source, 'code');
  assert.deepEqual(t.depth, [0, 1, 2, 1]);
  assert.ok(t.outside.every((x) => !x));
  assert.equal(negTreeHash(['0', '1']), negTreeHash(['0', '1']), 'тогтвортой');
  assert.notEqual(negTreeHash(['0', '1']), negTreeHash(['0', '2']));
}

const raw0 = (o) => ({
  oid: o.oid, code: o.code ?? '', name: o.name, bagts: o.bagts ?? '', depth: o.depth, w: o.w ?? null, p: o.p ?? null,
  act: o.act ?? null, planG: o.planG ?? null, planGch: o.planGch ?? null, planGu: o.planGu ?? null,
  planNw: o.planNw ?? null, planPw: o.planPw ?? null,
  perfG: o.perfG ?? null, perfGch: o.perfGch ?? null, perfGu: o.perfGu ?? null, perfWk: o.perfWk ?? null,
  budget: null, outside: o.outside,
});
/* 10 — Excel-ийн хэлбэрийн жижиг мод. Мөр 2 (0.20) нь Σ F × хүүхэд (0.21)-ээс ЗӨРНӨ — Excel-ийн
   «гараар бичсэн» утга; хувиралгүй үед ХӨНДӨГДӨХГҮЙ ёстой. */
const xTree = () => [
  raw0({ oid: 1, depth: 1, name: 'Барилга угсралт', p: 0.79, act: 0.2, planG: 0.5, planPw: 0.4, perfG: 0.4, perfWk: 0.5 }),
  raw0({ oid: 2, depth: 2, name: 'Барилга угсралт ажил', w: 1, act: 0.2 }),
  raw0({ oid: 3, depth: 3, name: 'Орон сууцны хороолол барилга угсралт', w: 0.8, act: 0.25 }),
  raw0({ oid: 4, depth: 4, name: 'Орон сууцны хороолол барилга угсралт', bagts: 'Багц-1', w: 0.5, act: 0.3, planG: 0.8, perfG: 0.375 }),
  raw0({ oid: 5, depth: 5, name: '9 давхар 71 айл', bagts: '5/1', w: 1, act: 0.28 }),
  raw0({ oid: 6, depth: 4, name: 'Орон сууцны хороолол барилга угсралт', bagts: 'Багц-2', w: 0.5, act: 0.2 }),
  raw0({ oid: 7, depth: 3, name: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ', w: 0.2, act: 0.05 }),
  raw0({ oid: 8, depth: 4, name: 'Гадна дулаан', bagts: 'Багц-5.1', w: 0.5, act: 0.1, planG: 0 }),
  raw0({ oid: 9, depth: 4, name: 'Гадна дулаан', bagts: 'Багц-5.2', w: 0.5, act: 0 }),
  raw0({ oid: 10, depth: 3, name: 'НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)', w: 0.1, act: 0, outside: true }),
  raw0({ oid: 11, depth: 1, name: 'Газар чөлөөлөлт', p: 0.03, act: 0.93 }),
  raw0({ oid: 12, depth: 2, name: 'Орон сууцны хороолол барилга угсралт', w: 1, act: 0.96 }),
  raw0({ oid: 13, depth: 1, name: 'Ажлын зураг төсөл', p: 0.1, act: 0.92 }),
];
const { bagtsKey } = await import('./services.ts');
const xSrc = {
  land: 92,
  housing: new Map([[bagtsKey('Багц 1'), 40]]),
  housingPkgs: new Set([bagtsKey('Багц 1'), bagtsKey('Багц 2')]),
  infra: new Map([['5.1', 36]]),
  infraPkgs: new Set(['5.1', '5.2']),
  partial: [],
};
{
  const out = A.computeNegAuto(xTree(), xSrc);
  const by = (oid) => out.find((r) => r.oid === oid);
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} ≠ ${b}`);
  near(by(4).act, 0.4, 'орон сууцны багц — 01-ийн батлагдсан');
  assert.equal(by(4).auto, true);
  near(by(4).perfG, 0.5, 'өөрчлөгдсөн мөрийн биелэлт = S ÷ N');
  near(by(5).act, 0.28, 'багцын доторх мөр Excel-ийн утга');
  assert.equal(by(5).auto, false);
  near(by(6).act, 0.2, 'тайлагнаагүй багц — Excel-ийн утга (0 БИШ)');
  assert.equal(by(6).auto, false);
  near(by(3).act, 0.3, 'эцэг = 0.5×0.40 + 0.5×0.20');
  near(by(8).act, 0.36, 'блокгүй багц — 01-ийн батлагдсан');
  assert.equal(by(8).perfG, 0, 'төлөвлөгөө 0 → биелэлт 0');
  near(by(9).act, 0, 'тайлагнаагүй блокгүй багц — Excel-ийн утга');
  near(by(7).act, 0.18, 'эцэг = 0.5×0.36 + 0.5×0');
  near(by(10).act, 0, '«нийлбэрт орохгүй» мөр хөндөгдөхгүй');
  near(by(2).act, 0.276, 'эцэг = 0.8×0.30 + 0.2×0.18 (Нийслэл төсөв хасагдсан)');
  near(by(1).act, 0.276, 'үе шат = 1 × 0.276');
  near(by(1).perfG, 0.552, 'W/T — S ÷ N');
  near(by(1).perfWk, 0.69, 'Weekly — S ÷ R');
  near(by(11).act, 0.92, 'газар — модулиас');
  assert.equal(by(11).auto, true);
  near(by(12).act, 0.96, 'газрын доторх мөр Excel-ийн утга');
  near(by(13).act, 0.92, 'системийн эхгүй үе шат — Excel-ийн утга');
  assert.equal(by(13).auto, false);
  assert.equal(by(13).perfG, null, 'өөрчлөгдөөгүй мөрийн биелэлт — Excel-ийнх (энд хоосон)');
  near(A.projectTotal(out), 0.79 * 0.276 + 0.03 * 0.92 + 0.1 * 0.92, 'төслийн нийт = Σ G × S');
}
{
  /* 2026-10-27: «Next week» (Q) — багцын мөр хуваарийн муруйгаас (орон сууц `bagtsKey`, блокгүй `no:<pkgNo>`),
     өвгүүд Σ F × Q; муруйгүй багц (Багц 2, 5.2) Excel-ийн утга; хуваарьгүй салаа (13) хөндөгдөхгүй. */
  const t = xTree().map((r) => ({ ...r, planNw: r.oid === 13 ? 0.5 : 0.1 }));
  const out = A.computeNegAuto(t, { ...xSrc, planNext: new Map([[bagtsKey('Багц 1'), 60], ['no:5.1', 20]]) });
  const by = (oid) => out.find((r) => r.oid === oid);
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} ≠ ${b}`);
  near(by(4).planNw, 0.6, 'орон сууцны багц — хуваарийн муруйгаас');
  near(by(5).planNw, 0.1, 'барилгын мөр Excel-ийн утга');
  near(by(6).planNw, 0.1, 'муруйгүй багц Excel-ийн утга');
  near(by(8).planNw, 0.2, 'блокгүй багц — pkgNo-оор');
  near(by(3).planNw, 0.35, 'эцэг = 0.5×0.6 + 0.5×0.1');
  near(by(7).planNw, 0.15, 'эцэг = 0.5×0.2 + 0.5×0.1');
  near(by(2).planNw, 0.8 * 0.35 + 0.2 * 0.15, 'эцэг (Нийслэл төсөв хасагдсан)');
  near(by(13).planNw, 0.5, 'хуваарьгүй салаа хөндөгдөхгүй');
  /* Муруй байхгүй бол бүх Q Excel-ийнх */
  assert.ok(A.computeNegAuto(t, xSrc).every((r, i) => r.planNw === t[i].planNw), 'planNext-гүй — Excel хэвээр');
}
{
  /* Системийн утга Excel-тэй ИЖИЛ бол юу ч дахин бодогдохгүй — мөр 2 (0.20 ≠ Σ 0.21) Excel-ийнхээрээ */
  const same = A.computeNegAuto(xTree(), {
    ...xSrc, land: 93, housing: new Map([[bagtsKey('Багц 1'), 30]]), infra: new Map([['5.1', 10]]),
  });
  const by = (oid) => same.find((r) => r.oid === oid);
  assert.equal(by(2).act, 0.2, 'хувиралгүй салаа Excel-ийн утгаа хадгална');
  assert.equal(by(1).act, 0.2);
  assert.equal(by(1).perfG, 0.4, 'хувиралгүй мөрийн биелэлт Excel-ийнх');
  assert.equal(by(4).auto, true, 'системийн эх тэмдэглэгдэнэ');
}
{
  /* 2026-10-14/15: БАРИЛГЫН ЗАДАРГАА (`housingBreakdown`) — блокийн мөрийн S = блокийн батлагдсан хувь
     (тайлагнаагүй 0), F нь Excel-ийнх; блокт таараагүй мөр Excel-ийнх; багцын мөр = Σ F × S. */
  const { buildingKey } = await import('./services.ts');
  const tree = [
    raw0({ oid: 1, depth: 1, name: 'Барилга угсралт', p: 1, act: 0.2 }),
    raw0({ oid: 2, depth: 2, name: 'Барилга угсралт ажил', w: 1, act: 0.2 }),
    raw0({ oid: 3, depth: 3, name: 'Орон сууцны хороолол барилга угсралт', w: 1, act: 0.2 }),
    raw0({ oid: 4, depth: 4, name: 'Орон сууцны хороолол барилга угсралт', bagts: 'Багц-1', w: 1, act: 0.2 }),
    raw0({ oid: 5, depth: 5, name: '9 давхар', bagts: '5/1', w: 0.2, act: 0.2 }),
    raw0({ oid: 6, depth: 5, name: '9 давхар', bagts: '5/2', w: 0.3, act: 0.2 }),
    raw0({ oid: 7, depth: 5, name: '12 давхар', bagts: '29/1', w: 0.4, act: 0.2 }),
    raw0({ oid: 8, depth: 5, name: 'Газар шороо', bagts: 'Бүгд', w: 0.1, act: 0.5 }),
  ];
  const pk = bagtsKey('Багц 1');
  const keys = ['5/1', '5/2', '29/1'].map((b) => buildingKey('Багц-1', b));
  const src = {
    ...xSrc,
    housing: new Map([[pk, 30]]),
    blocks: new Map([[keys[0], { overall: 40 }], [keys[1], { overall: 50 }]]),
    blockUni: new Map([[pk, keys]]),
  };
  const out = A.computeNegAuto(tree, src);
  const by = (oid) => out.find((r) => r.oid === oid);
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} ≠ ${b}`);
  near(by(5).w, 0.2, 'блокийн жин — Excel-ийнх');
  near(by(7).w, 0.4, 'блокийн жин — Excel-ийнх');
  near(by(5).act, 0.4, 'блокийн S — батлагдсан');
  near(by(6).act, 0.5, 'блокийн S — батлагдсан');
  near(by(7).act, 0, 'тайлагнаагүй блок 0 (багцын дундажтай ижил дүрэм)');
  assert.equal(by(7).auto, true);
  near(by(8).w, 0.1, 'блок бус мөрийн F — Excel-ийнх');
  near(by(8).act, 0.5, 'блок бус мөрийн S — Excel-ийнх');
  assert.equal(by(8).auto, false);
  near(by(4).act, 0.2 * 0.4 + 0.3 * 0.5 + 0.4 * 0 + 0.1 * 0.5, 'багцын мөр = Σ F × S (Excel-ийн F)');
  near(by(3).act, by(4).act, 'дээш нийлнэ');
  /* Нэг ч мөр блокт таараагүй → задаргаа хөндөгдөхгүй, багцын мөр 01-ийн утга */
  const miss = A.computeNegAuto(tree, { ...src, blockUni: new Map([[pk, [buildingKey('Багц-1', '99/9')]]]) });
  const bm = (oid) => miss.find((r) => r.oid === oid);
  near(bm(4).act, 0.3, 'таарахгүй — багцын мөр 01-ийн утга');
  near(bm(5).act, 0.2, 'таарахгүй — барилгын мөр Excel-ийнх');
  /* Блокийн S Excel-тэй ИЖИЛ ч багцын мөр Σ F × S-ээр дахин бодогдоно */
  const flat = tree.map((r) => (r.depth === 5 ? { ...r, act: r.oid === 5 ? 0.4 : r.oid === 6 ? 0.5 : r.oid === 7 ? 0 : r.act } : r));
  const fb = (oid) => A.computeNegAuto(flat, src).find((r) => r.oid === oid);
  near(fb(4).act, 0.2 * 0.4 + 0.3 * 0.5 + 0.1 * 0.5, 'хувиралгүй хүүхэдтэй ч багц = Σ F × S');
}
{
  /* «Талбайн бэлтгэл» (5.1.3) доторх багцын мөр — биет гүйцэтгэл БИШ, системийн утга ОРОХГҮЙ */
  const prep = [
    raw0({ oid: 1, depth: 1, name: 'Барилга угсралт', p: 1, act: 0.5 }),
    raw0({ oid: 2, depth: 2, name: 'Бэлтгэл ажил', w: 1, act: 0.5 }),
    raw0({ oid: 3, depth: 3, name: 'Талбайн бэлтгэл ажил', w: 1, act: 0.5 }),
    raw0({ oid: 4, depth: 4, name: 'Орон сууцны хороолол барилга угсралт', w: 1, act: 0.5 }),
    raw0({ oid: 5, depth: 5, name: 'Орон сууцны хороолол барилга угсралт', bagts: 'Багц-1', w: 1, act: 0.5 }),
  ];
  const out = A.computeNegAuto(prep, xSrc);
  assert.equal(out[4].act, 0.5, 'бэлтгэл ажлын багцын мөр хөндөгдөхгүй');
  assert.equal(out[4].auto, false);
}
{
  /* Газрын модулиас утга ирээгүй → Excel-ийн утга, эх сурвалжийн тайлбар өөр */
  const lTree = [raw0({ oid: 31, depth: 1, name: 'Газар чөлөөлөлт', p: 1, act: 0.4 })];
  const noLand = A.computeNegAuto(lTree, { ...xSrc, land: null })[0];
  const withLand = A.computeNegAuto(lTree, { ...xSrc, land: 90 })[0];
  assert.equal(noLand.act, 0.4, 'land null → Excel-ийн утга');
  assert.equal(noLand.auto, false);
  assert.notEqual(noLand.how, withLand.how);
  assert.equal(withLand.act, 0.9);
  assert.equal(withLand.auto, true);
}

console.log('negtgelAuto: ok — Excel мод · нөөц мод · багцын дугаар · зөвхөн өөрчлөгдсөн салаа · outside · биелэлт');

/* ══════════ 2026-09-25-НЫ ДҮРМҮҮД (шинэ загвар дээр) ══════════
 *  13. ТӨСЛИЙН НИЙТ: жинтэй 1-р түвшний мөр `null` бол нийт `null` (null ≠ 0).
 *  15. ТӨЛӨВЛӨГӨӨ (`housingPlanOf` — лавлах хэрэгжилт): сарын хооронд өдрөөр завсарлана.
 *  16. ХАМГААЛАЛТ: мөр бүр ±0.2 (өвгөд хамт алгасна), нийт ±0.2; бичих утга хүснэгтийн масштабаар (×100).
 *  17. ЭРХ: super биш / хэрэглэгчгүй → бичихгүй; хүснэгт ЗӨВХӨН уншигддаг (амьд бичигчгүй) → `off`.
 */
{
  const { TUSUL_NEGTGEL } = await import('./services.ts');
  const { negtgelProjectPct } = await import('./negtgel.ts');
  const OID = TUSUL_NEGTGEL.oid;
  const ACT = A.VAL_FIELD.act;

  /* 13 */
  assert.equal(A.projectTotal([{ depth: 1, p: 0.5, act: null }, { depth: 1, p: 0.5, act: 0.4 }]), null, 'жинтэй null мөр → нийт null');
  assert.equal(A.projectTotal([{ depth: 1, p: 0, act: null }, { depth: 1, p: 0.5, act: 0.4 }]), 0.2, 'жингүй null мөр тоологдохгүй');
  const nRows = [{ oid: 1, code: '1', name: 'a', depth: 1 }, { oid: 2, code: '2', name: 'b', depth: 1 }];
  assert.equal(negtgelProjectPct(nRows, new Map([[1, { inProject: 50, actPct: null }], [2, { inProject: 50, actPct: 40 }]])), null,
    'negtgelProjectPct: 1-р түвшний null → null');
  assert.equal(negtgelProjectPct(nRows, new Map([[1, { inProject: 50, actPct: 10 }], [2, { inProject: 50, actPct: 40 }]])), 25);

  /* 15 */
  const curve = new Map([
    ['a', [{ label: '2026-08', pct: 10 }, { label: '2026-09', pct: 40 }, { label: '2026-10', pct: 70 }]],
    ['b', [{ label: '2026-09', pct: 40 }]],
    ['c', [{ label: '2026-06', pct: 90 }, { label: '2026-07', pct: 100 }]],
    ['d', [{ label: '2026-11', pct: 5 }]],
  ]);
  const hp = A.housingPlanOf(curve, new Date(2026, 8, 15));
  assert.ok(Math.abs(hp.get('a') - 25) < 1e-9, '15/30 өдөр: 10 + (40 − 10) × 0.5');
  assert.ok(Math.abs(hp.get('b') - 20) < 1e-9, 'энэ сард эхэлсэн: 0-ээс');
  assert.equal(hp.get('c'), 100, 'дууссан хуваарь — сүүлийн цэг');
  assert.equal(hp.has('d'), false, 'эхлээгүй хуваарь — төлөвлөгөөгүй (0 БИШ)');
  assert.equal(A.housingPlanOf(curve, new Date(2026, 8, 30)).get('a'), 40, 'сарын сүүлийн өдөр = сарын цэг');

  /* 16 — мөр бүрийн хамгаалалт: Багц-1 0.30 → 0.90 (+0.6) хамгаалалтад, өвгөд хамт; Багц-5.1 жижиг өөрчлөлт бичигдэнэ */
  const gTree = [
    raw0({ oid: 11, depth: 1, name: 'Барилга угсралт', p: 0.3, act: 0.2 }),
    raw0({ oid: 12, depth: 2, name: 'Барилга угсралт ажил', w: 1, act: 0.2 }),
    raw0({ oid: 13, depth: 3, name: 'Орон сууцны хороолол барилга угсралт', w: 0.5, act: 0.3 }),
    raw0({ oid: 14, depth: 4, name: 'Орон сууцны хороолол барилга угсралт', bagts: 'Багц-1', w: 1, act: 0.3 }),
    raw0({ oid: 15, depth: 3, name: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ', w: 0.5, act: 0.1 }),
    raw0({ oid: 16, depth: 4, name: 'Гадна дулаан', bagts: 'Багц-5.1', w: 1, act: 0.1 }),
    raw0({ oid: 17, depth: 1, name: 'Төслийг хүлээлгэн өгөх', p: 0.7, act: 0.3 }),
  ];
  const gSrc = { ...xSrc, land: null, housing: new Map([[bagtsKey('Багц 1'), 90]]), infra: new Map([['5.1', 15]]) };
  const gCalc = A.computeNegAuto(gTree, gSrc);
  /* Excel-ийн баганууд руу бичих зам (`readOnly` үед хэрэглэгдэхгүй) — хамгаалалтын логик */
  const gp = A.planNegSync(gTree, gCalc, false, 'excel');
  assert.equal(gp.totalBlocked, false);
  assert.deepEqual([...new Set(gp.blocked.map((b) => b.oid))].sort(), [11, 12, 13, 14], '0.30 → 0.90 мөр ба өвгөд нь хамгаалалтад');
  assert.deepEqual(gp.ups.map((u) => u[OID]).sort(), [15, 16], 'хамгаалалтад ороогүй мөрүүд л бичигдэнэ');
  assert.equal(gp.ups.find((u) => u[OID] === 16)[ACT], 15, 'бичих утга хүснэгтийн масштабаар (0–100)');
  assert.ok(gp.ups.every((u) => !('share_sec' in u) && !('share_prj' in u)), 'жин бичигдэхгүй');
  assert.ok(A.planNegSync(gTree, gCalc, true, 'excel').ups.some((u) => u[OID] === 14), 'force — бүгд');

  /* 16б — 2026-10-27: `sys_*` талбарууд (анхдагч) — Excel-ийн багана ОГТ бичигдэхгүй; хамгаалалт ижил */
  const sp = A.planNegSync(gTree, gCalc);
  assert.deepEqual([...new Set(sp.blocked.map((b) => b.oid))].sort(), [11, 12, 13, 14], 'sys: ижил хамгаалалт');
  assert.deepEqual(sp.ups.map((u) => u[OID]).sort(), [15, 16, 17], 'sys: анх бичихэд өөрчлөгдөөгүй мөр (17) ч');
  const SYS = new Set([OID, 'sys_guitsetgel', 'sys_next_week', 'sys_shinechilsen']);
  assert.ok(sp.ups.every((u) => Object.keys(u).every((k) => SYS.has(k))), 'sys: зөвхөн sys_* талбар');
  assert.equal(sp.ups.find((u) => u[OID] === 16).sys_guitsetgel, 15, 'sys: 0–100 масштаб');
  assert.ok(sp.ups.every((u) => typeof u.sys_shinechilsen === 'number'), 'sys: шинэчилсэн огноо');
  /* Өмнө бичсэн sys утгатай ижил бол дахин бичихгүй */
  const gSaved = gTree.map((r, i) => ({ ...r, sysAct: gCalc[i].act, sysNw: gCalc[i].planNw }));
  assert.equal(A.negSysDiff(gSaved, gCalc).length, 0, 'sys: өөрчлөлтгүй — бичихгүй');

  /* 16 — нийтийн хамгаалалт */
  const tTree = [
    raw0({ oid: 31, depth: 1, name: 'Барилга угсралт', p: 1, act: 0 }),
    raw0({ oid: 32, depth: 2, name: 'Барилга угсралт ажил', w: 1, act: 0 }),
    raw0({ oid: 33, depth: 3, name: 'Орон сууцны хороолол барилга угсралт', w: 1, act: 0 }),
    raw0({ oid: 34, depth: 4, name: 'Орон сууцны хороолол барилга угсралт', bagts: 'Багц-1', w: 1, act: 0 }),
  ];
  const tp = A.planNegSync(tTree, A.computeNegAuto(tTree, gSrc));
  assert.equal(tp.totalBlocked, true, 'нийт 0 → 90%');
  assert.equal(tp.ups.length, 0, 'нийт хамгаалалтад — юу ч бичихгүй');

  /* 17 — эрх (fail-closed) ба зөвхөн уншигдах хүснэгт */
  let writes = 0;
  const io = (user) => ({
    user: () => user,
    load: async () => ({ stored: gTree, src: gSrc }),
    write: async (u) => { writes += u.length; return u.length; },
  });
  A._resetNegSync();
  /* ⚠️ 2026-10-21 (кэшийн аудит): баталгаатай бичилтийн (n > 0) дараа `TUSUL_NEGTGEL` хүчингүй; бичилтгүй/уналтад үгүй */
  const bus = await import('./dataBus.ts');
  let negDrops = 0;
  bus.register(() => { negDrops += 1; }, ['TUSUL_NEGTGEL']);
  assert.equal(TUSUL_NEGTGEL.readOnly, true, 'Negtgel_guitsetgel_1013 — Excel-ийн баганууд readOnly (хэрэглэгчийн шийдвэр)');
  /* ⚠️ 2026-10-27: `sysWrite` — синк зөвхөн sys_* талбаруудад (16б); Excel-ийн багана руу бичих зам хаалттай хэвээр */
  assert.equal(TUSUL_NEGTGEL.sysWrite, true, 'sys_* талбаруудад бичнэ');
  assert.equal((await A.syncNegtgel({}, io(null))).kind, 'off', 'хэрэглэгчгүй → бичихгүй');
  assert.equal((await A.syncNegtgel({}, io('selbe_et'))).kind, 'off', 'super биш → бичихгүй');
  assert.equal((await A.syncNegtgel()).kind, 'off', 'анхдагч (нэвтрээгүй Node) → бичихгүй');
  assert.equal(writes, 0);
  const st = await A.syncNegtgel({}, io('saruul_monmap'));
  assert.equal(st.kind, 'guard', 'super (тестийн бичигч) — хамгаалалтын төлөв ил');
  assert.equal(st.n, 3);
  assert.equal(writes, 3, 'зөвхөн хамгаалалтад ороогүй мөрүүд бичигдэнэ (sys_*)');
  assert.equal(negDrops, 1, '2026-10-21: баталгаатай бичилт (n > 0) → TUSUL_NEGTGEL хүчингүй');
  const again = await A.syncNegtgel({}, io('saruul_monmap'));
  assert.equal(again, st, '10 минутын дотор дахин бичихгүй — сүүлийн төлөв');
  assert.equal(writes, 3);
  assert.equal(negDrops, 1, 'бичилтгүй дахин дуудалт — хүчингүй болгохгүй');
  const forced = await A.syncNegtgel({ force: true }, io('saruul_monmap'));
  assert.equal(forced.kind, 'ok', 'баталгаажуулсан бичилт');
  assert.ok(writes > 3);
  assert.equal(negDrops, 2, 'force бичилт → дахин хүчингүй');
  A._resetNegSync();
  {
    /* ⚠️ уналт/хариу алдагдсан → хүчингүй болгохгүй (ачаалагч доторх дахин ачаалал → дахин синкийн давталтаас сэргийлнэ) */
    const failing = { ...io('saruul_monmap'), write: async () => { throw new TypeError('сүлжээ тасрав'); } };
    assert.equal((await A.syncNegtgel({}, failing)).kind, 'error');
    assert.equal(negDrops, 2, 'уналтад TUSUL_NEGTGEL хүчингүй болохгүй');
    A._resetNegSync();
  }

  /* 18 — (2026-09-25) `force` явж буй энгийн синкийн үр дүнд залгигдахгүй */
  {
    let release;
    const gate = new Promise((r) => { release = r; });
    const slow = { ...io('saruul_monmap'), load: async () => { await gate; return { stored: gTree, src: gSrc }; } };
    const plain = A.syncNegtgel({}, slow);
    const f2 = A.syncNegtgel({ force: true }, io('saruul_monmap'));
    release();
    assert.equal((await plain).kind, 'guard', 'энгийн синк — хамгаалалт');
    assert.equal((await f2).kind, 'ok', 'force нь дараа нь ӨӨРӨӨ ажиллана');
    A._resetNegSync();
  }

  console.log('negtgel 2026-09-25: ok — нийт null · төлөвлөгөөний завсар · хамгаалалт (×100) · эрх · зөвхөн уншигдах хүснэгт');
}

/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ЗӨВХӨН БҮРЭН үр дүнг кэшлэнэ — эх унасан
   (`live: false`) эсвэл хэсэгчилсэн (`failed`) үр дүн дараагийн дуудалтад дахин уншигдана;
   аль эх унасныг `NegSourceError.failed` нэрлэнэ. */
{
  assert.equal(negtgelComplete({ live: true, failed: [] }), true);
  assert.equal(negtgelComplete({ live: false, failed: ['Cashflow'] }), false, 'эх унасан — кэшлэхгүй');
  assert.equal(negtgelComplete({ live: true, failed: ['Хуваарийн муруй (1 хуудас)'] }), false, 'хэсэгчилсэн — кэшлэхгүй');
  const { NegSourceError } = await import('./negtgelAuto.ts');
  const e = new NegSourceError(['Газар чөлөөлөлт', 'Хуваарийн муруй'], new Error('429'));
  assert.ok(e instanceof Error);
  assert.deepEqual(e.failed, ['Газар чөлөөлөлт', 'Хуваарийн муруй'], 'унасан эхийн нэрс');
  assert.ok(e.message.includes('Газар чөлөөлөлт') && e.message.includes('429'));
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./negtgel.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('if (!negtgelComplete(v) && fullP === mine) fullP = null;'), 'loadNegtgelFull бүрэн бус үр дүнг кэшэд үлдээж байна');
  console.log('negtgel 2026-10-01: ok — бүрэн бус үр дүн кэшлэгдэхгүй · уналтын нэр');
}

/* ⚠️ 2026-10-09 (аудит): нэгтгэлийн бичилт ба автомат бодолт.
   1. Тайлагнаагүй орон сууцны багц (`pkgProgressOf` → `{pct:0, blocks:0}`) хүснэгтэд 0 бичихгүй.
   2. Хоёр хуудсын блокоор жигнэсэн дундаж — `null` бол `null`, 0-блоктой хуудас жин 1.
   3. Давхардлын түлхүүр ӨДРӨӨР — 16:00Z ба 00:00Z нэг өдөр.
   4. Блокгүй багц (5.x · 6.x · 10) танигдана — `registerApproved` `skipped: 'blockless'`. */
{
  const { measuredHousing } = await import('./negtgelAuto.ts');
  const housing = new Map([['БАГЦ1', 21], ['БАГЦ2', 0], ['БАГЦ41', 0]]);
  const blocks = new Map([
    ['БАГЦ1|29/1', { overall: 42 }],
    ['БАГЦ2|5/1', null],
    ['БАГЦ41|1', { overall: NaN }],
  ]);
  const m = measuredHousing(housing, blocks);
  assert.deepEqual([...m], [['БАГЦ1', 21]], 'хэмжилтгүй багц (0%) хүснэгт рүү бичигдэх ёсгүй');

  const W = await import('./negtgelWrite.ts');
  /* Багц 1: 9F 12 блок 50%, 12F 17 блок нийтлэгдээгүй (0%) → 12·0.5/29 */
  assert.ok(Math.abs(W.blendBlocks([{ n: 12, v: 0.5 }, { n: 17, v: 0 }]) - 6 / 29) < 1e-12);
  assert.equal(W.blendBlocks([{ n: 12, v: 0.5 }, { n: 17, v: null }]), null, 'null ≠ 0');
  assert.ok(Math.abs(W.blendBlocks([{ n: 0, v: 0.4 }, { n: 0, v: 0.2 }]) - 0.3) < 1e-12, '0 блоктой хуудас жин 1');
  assert.equal(W.blendBlocks([]), null);

  const day = (iso) => W.dayRange(Date.parse(iso)).map((x) => new Date(x).toISOString());
  const want = ['2026-10-07T12:00:00.000Z', '2026-10-08T12:00:00.000Z'];
  assert.deepEqual(day('2026-10-07T16:00:00Z'), want, 'локал шөнө дунд (16:00Z) → 10-08');
  assert.deepEqual(day('2026-10-08T00:00:00Z'), want, 'UTC шөнө дунд → 10-08');
  assert.deepEqual(day('2026-10-08T08:00:00Z'), want, '08:00Z → 10-08');
  assert.notDeepEqual(day('2026-10-08T16:00:00Z'), want, 'дараагийн локал өдөр');

  assert.equal(W.isBlocklessBagts('Багц 5.1'), true);
  assert.equal(W.isBlocklessBagts('Багц 10'), true);
  assert.equal(W.isBlocklessBagts('Багц 1'), false);
  assert.equal(W.isBlocklessBagts('Багц 4.1'), false, '«4.1» ба «4-1» нэг багц');
  assert.equal(W.isBlocklessBagts('Байхгүй багц'), false);
  console.log('negtgel 2026-10-09: ok — тайлагнаагүй багц бичихгүй · блокоор жигнэх · өдрийн муж · блокгүй багц');
}

/* ── 2026-10-09 (F12 · R6): хуудас бүрийн хэмжээс · finally-д зарлана ── */
{
  const { readFileSync } = await import('node:fs');
  const W = readFileSync(new URL('./negtgelWrite.ts', import.meta.url), 'utf8');
  assert.ok(W.includes('if (v != null && (v < -0.5 || v > 100.5))'), 'хуудас бүрийн 0–100 шалгалт алга (F12)');
  assert.ok(W.includes('if (cur != null && cur <= 1 && r.act * 100 > 1) return { scale: x.p.label };'), 'хуучин хуудасны ≤1 гулсалт алга (F12)');
  assert.ok(/\} finally \{\s*if \(wrote\) invalidate\('BAGTS_NEGTGEL'\);\s*\}/.test(W), 'BAGTS_NEGTGEL finally-д (R6)');
  assert.equal((W.match(/invalidate\('BAGTS_NEGTGEL'\)/g) ?? []).length, 1, 'зарлал нэг газар (finally)');
  const iAdd = W.indexOf('    wrote = true;\n    const res = (await post(');
  assert.ok(iAdd > 0 || W.indexOf('    wrote = true;\r\n    const res = (await post(') > 0, 'нэмэх бичилтийн өмнө wrote тэмдэг');
  console.log('negtgel 2026-10-09 (F12/R6): ok — хэмжээс · finally');
}

/* ── 2026-10-09: блокгүй багцын `skipped` ЗӨВХӨН уншигдсан + хэмжигдээгүй үед; `!s` нь алдаа (дахин оролдоно) ── */
{
  const { readFileSync } = await import('node:fs');
  const W = readFileSync(new URL('./negtgelWrite.ts', import.meta.url), 'utf8');
  assert.ok(W.includes("if (s && s.progress == null && isBlocklessBagts(bagts)) return { ok: true, skipped: 'blockless' };"),
    'блокгүй алгасалт `s && s.progress == null` нөхцөлтэй');
  assert.ok(!/\(!s \|\| s\.progress == null\) && isBlocklessBagts/.test(W), 'хураангуй уншигдаагүй (`!s`) блокгүй багц `ok: true` болж чимээгүй алгасагдаж байна');
  const iSkip = W.indexOf('if (s && s.progress == null && isBlocklessBagts');
  const iErr = W.indexOf("if (!s) return { ok: false, error: tr('Бөглөх хуудасны хадгалсан хувилбар олдсонгүй') };");
  assert.ok(iSkip > 0 && iErr > iSkip, '`!s` → алдаа (блокгүй багцад ч)');
  console.log('negtgel 2026-10-09 (блокгүй !s): ok — уншигдаагүй хураангуй алдаа');
}

/* ── 2026-10-12 (гүйцэтгэлийн аудит): нэг түлхүүртэй ХОЁР хуудас (Багц 4-2: 9F F5_1…F5_6 + F6_1…F6_8,
   12F F6_1…F6_8 — хоёулаа «6/x») ──
   1. `uniqueBlockCounts` — жин нь шошгын ОЛОНЛОГИЙН ялгавар (12F → 0); ялгаатай хуудас (Багц 1) бүтэн.
   2. `blendSheets` (`summaryOf`-ийн цэвэр хэсэг) — 4-2-ийн дүн = 9F-ийн J (12F-ийн 0 нэмэгдэхгүй);
      Багц 1 урьдын адил блокоор жигнэнэ; `null` дүрэм хэвээр.
   3. `compute` — өөр хуудасны `null` нүд утгатай нүдийг ДАРАХГҮЙ (мөрийн дарааллаас үл хамааран);
      нэг хуудас дотор `null` нь урьдын адил «цэвэрлэгдсэн». */
{
  const { uniqueBlockCounts, compute } = await import('./blockProgress.ts');
  const { blendSheets } = await import('./negtgelWrite.ts');
  const { TASK_SHEET, buildingKey } = await import('./services.ts');
  const f6 = ['6/1', '6/2', '6/3', '6/4', '6/5', '6/6', '6/7', '6/8'];
  const bld9 = ['5/1', '5/2', '5/3', '5/4', '5/5', '5/6', ...f6];           // 4-2 · 9F (14)
  const bld12 = f6;                                                         // 4-2 · 12F (8)
  const b1_9 = Array.from({ length: 12 }, (_, i) => `29/${i + 1}`);         // Багц 1 · 9F
  const b1_12 = Array.from({ length: 17 }, (_, i) => `30/${i + 1}`);        // Багц 1 · 12F

  assert.deepEqual(uniqueBlockCounts([bld9, bld12]), [14, 0], '4-2: 12F бүрэн давхардсан → 0');
  assert.deepEqual(uniqueBlockCounts([bld12, bld9]), [8, 6], 'эрэмбэ: эхнийх давамгайлна');
  assert.deepEqual(uniqueBlockCounts([b1_9, b1_12]), [12, 17], 'Багц 1: ялгаатай түлхүүр — бүтэн');
  assert.deepEqual(uniqueBlockCounts([['5/1 барилга'], ['5/1', '5/2']]), [1, 1], '`blockKey` нормчлол');
  assert.deepEqual(uniqueBlockCounts([[], []]), [0, 0], 'блокгүй хуудас');

  assert.equal(blendSheets([{ bld: bld9, v: 0.5 }, { bld: bld12, v: 0 }]), 0.5, '4-2: нэгтгэл = 9F-ийн J (12F-ийн 0 нэмэгдэхгүй)');
  assert.equal(blendSheets([{ bld: bld9, v: 0.5 }, { bld: bld12, v: null }]), 0.5, 'жингүй хуудасны null дүнг null болгохгүй');
  assert.ok(Math.abs(blendSheets([{ bld: bld12, v: 0.2 }, { bld: bld9, v: 0.5 }]) - (0.2 * 8 + 0.5 * 6) / 14) < 1e-12, '12F батлагдвал: 8 · 6 жин');
  assert.ok(Math.abs(blendSheets([{ bld: b1_9, v: 0.5 }, { bld: b1_12, v: 0 }]) - 6 / 29) < 1e-12, 'Багц 1: 12·0.5/29 (урьдын адил)');
  assert.equal(blendSheets([{ bld: b1_9, v: 0.5 }, { bld: b1_12, v: null }]), null, 'Багц 1: null ≠ 0');
  assert.equal(blendSheets([{ bld: [], v: 0.3 }]), 0.3, 'блокгүй багц — өөрийн утга');
  assert.equal(blendSheets([{ bld: b1_9, v: null }]), null);
  assert.equal(blendSheets([]), null);

  const TS = TASK_SHEET.fields;
  const row = (sheet, date, pct) => ({
    [TS.bagts]: 'Багц 4-2', [TS.no]: TASK_SHEET.constructionNo, [TS.work]: 'Б', [TS.date]: date, [TS.block]: '6/1', [TS.progress]: pct, sheet,
  });
  const k = buildingKey('Багц 4-2', '6/1');
  const today = '2026-10-12';
  const a = [row('b42_9f', '2026-09-01', 0.4), row('b42_12f', '2026-09-10', null)];
  assert.equal(compute(a, today).get(k)?.overall, 40, '12F-ийн сүүлийн null 9F-ийн хэмжилтийг дарахгүй');
  assert.equal(compute([...a].reverse(), today).get(k)?.overall, 40, 'мөрийн дарааллаас үл хамаарна');
  assert.equal(compute([row('b42_9f', '2026-09-01', 0.4), row('b42_12f', '2026-09-10', 0.6)], today).get(k)?.overall, 60, '12F-ийн УТГАТАЙ сүүлийн нүд ялна');
  assert.equal(compute([row('b42_9f', '2026-09-01', 0.4), row('b42_9f', '2026-09-10', null)], today).has(k), false, 'нэг хуудас дотор null = цэвэрлэгдсэн (хэвээр)');
  const noSheet = [row(undefined, '2026-09-01', 0.4), row(undefined, '2026-09-10', null)];
  assert.equal(compute(noSheet, today).has(k), false, 'хуудасны түлхүүргүй мөр — хуучин дүрэм');
  console.log('negtgel 2026-10-12: ok — давхардалгүй жин · blendSheets · compute хуудас хоорондын null');
}

/* ══════════════ ⚠️ 2026-10-23 (аудит): обьём «Б.» бүлгийн хоосон нүднээс БИШ, навч мөрүүдээс ══════════════
   Нэгтгэлийн (`/190`) обьём 25/25 мөрд хоосон, дашбоардын 2 самбар «Обьём бүртгэгдээгүй» байв. */
{
  const { constructionObyem, sumObyemParts } = await import('./blockProgress.ts');
  const { readFileSync } = await import('node:fs');
  const R = (no, depth, vol, obyem, group = false) => ({ no, depth, vol, obyem, group });
  const rows = [
    R('А.', 0, null, [null, null], true),
    R('1', 1, 10, [99, 99]), // «А.» доорх — ОРОХГҮЙ
    R('Б. БАРИЛГА УГСРАЛТЫН АЖИЛ', 0, null, [null, null], true),
    R('Б1', 1, null, [null, null], true),
    R('1.1', 2, 100, [40, null]),
    R('1.2', 2, 50, [null, 25]),
    R('Б2', 1, null, [null, null], true),
    R('2.1', 2, 0, [5, null]), // Обьём 0 — төлөвлөгөөнд орохгүй, бодит нэмэгдэнэ
    R('2.2', 2, 20, [null, null]),
    R('В.', 0, null, [null, null], true),
    R('3', 1, 7, [7, 7]), // «Б.»-ээс гадна — ОРОХГҮЙ
  ];
  assert.deepEqual(constructionObyem(rows, ['o1', 'o2']), { volume: 70, volumePlan: 340 },
    'бодит = навчийн утгатай нүд (40+25+5); төлөвлөгөө = Обьём × обьёмтой блок ((100+50+20)×2)');
  assert.deepEqual(constructionObyem(rows, ['o1', null]), { volume: 45, volumePlan: 170 }, 'обьёмын талбаргүй блок тоологдохгүй');
  const empty = rows.map((r) => ({ ...r, obyem: r.obyem.map(() => null) }));
  assert.deepEqual(constructionObyem(empty, ['o1', 'o2']), { volume: null, volumePlan: 340 }, 'бөглөөгүй → бодит null (0 БИШ)');
  assert.deepEqual(constructionObyem(rows.filter((r) => !r.no.startsWith('Б')), ['o1']), { volume: null, volumePlan: null }, '«Б.» алга → null');
  assert.deepEqual(constructionObyem([R('Б', 0, null, [null], true), R('1', 1, 30, [12])], ['obyem_sum']),
    { volume: 12, volumePlan: 30 }, 'блокгүй багц (синтетик блок, цэггүй «Б»)');
  assert.deepEqual(sumObyemParts([{ n: 14, volume: 10, volumePlan: 100 }, { n: 0, volume: 99, volumePlan: 99 }]),
    { volume: 10, volumePlan: 100 }, 'бүрэн давхардсан хуудас (4-2·12F) орохгүй');
  assert.deepEqual(sumObyemParts([{ n: 4, volume: null, volumePlan: 50 }, { n: 6, volume: 3, volumePlan: 60 }]),
    { volume: 3, volumePlan: 110 });
  assert.deepEqual(sumObyemParts([{ n: 0, volume: 1, volumePlan: 2 }, { n: 0, volume: 5, volumePlan: 5 }]),
    { volume: 1, volumePlan: 2 }, 'жингүй бүх хуудас → эхнийх');
  /* Эх кодын баталгаа: бичих зам ба дашбоард НЭГ функц, «Б.» мөрийн обьём уншихаа больсон */
  const NW = readFileSync(new URL('./negtgelWrite.ts', import.meta.url), 'utf8');
  assert.match(NW, /constructionObyem\(rows, fsc\.obyem\)/, 'negtgelWrite обьём = навч мөрүүд');
  assert.match(NW, /sumObyemParts\(/, 'negtgelWrite нийлбэр = sumObyemParts');
  assert.doesNotMatch(NW, /a\[sc\.f\.obyemSum\]|a\[sc\.f\.vol\]/, '«Б.» бүлгийн хоосон нүднээс обьём уншихгүй');
  const SS = readFileSync(new URL('./sheetShared.ts', import.meta.url), 'utf8');
  assert.match(SS, /constructionObyem\(s\.rows, s\.sc\.obyem\)/, 'дашбоардын амьд обьём = навч мөрүүд');
  const DB = readFileSync(new URL('../modules/Dashboard.tsx', import.meta.url), 'utf8');
  assert.equal((DB.match(/<Data q=\{vq\}/g) ?? []).length, 2, 'обьёмын 2 самбар volAsync-аас (амьд хуудас, нөөц /190)');
  console.log('negtgel 2026-10-23: ok — обьём навч мөрүүдээс · null ≠ 0 · давхардсан хуудас орохгүй');
}

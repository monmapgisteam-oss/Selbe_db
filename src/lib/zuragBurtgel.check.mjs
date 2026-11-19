/**
 * ЗУРАГ ТӨСЛИЙН БҮРТГЭЛ (2026-11-11) — цэвэр хэсэг.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/zuragBurtgel.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. «Багц 1,2» олон багцад, «Багц 3-1» → БАГЦ31; «Бүх багц»/«Байхгүй» → багцгүй.
 *   2. Дэд бүлгийн «… БАГЦ 3-2» багцын баганаас түрүүлнэ (Excel-д «Багц 3-1» гэж буруу бичигдсэн 12 мөр).
 *   3. Төсөв (005) явцад орохгүй; явц = магадлалд орсон (давтан ч) ÷ нийт.
 *   4. ТТБ: зураг төслийн навч бүртгэлтэй багцад бүртгэлийн хувь, бусад нь хадгалсан утга.
 */
import assert from 'node:assert/strict';
import { toZRow, groupZ, pkgKeysOf, zuragPkgStats, zuragPctMap } from './zuragBurtgel.ts';
import { buildTree, computePlan } from './projectPlan.ts';

assert.deepEqual(pkgKeysOf('Багц 1,2'), ['БАГЦ1', 'БАГЦ2']);
assert.deepEqual(pkgKeysOf('Багц 3-1'), ['БАГЦ31']);
assert.deepEqual(pkgKeysOf('300.40. БАГЦ 3-2'), ['БАГЦ32']);
assert.deepEqual(pkgKeysOf('Бүх багц'), []);
assert.deepEqual(pkgKeysOf('100. БАГЦУУДЫН ЗАГВАР ЗУРАГ'), []);

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const z = (o) => toZRow({ objectid: o.oid, buleg: o.buleg ?? '003. АЖЛЫН ЗУРАГ', ded_buleg: o.ded ?? '', bagts: o.bagts, ner: `n${o.oid}`, magadlal_ognoo: o.mag ?? null, davtan_magadlal_ognoo: o.dav ?? null, huleej_avsan_ognoo: o.rec ?? null, pdf_item_id: o.pdf ?? null });
const rows = [
  z({ oid: 1, bagts: 'Багц 1,2', mag: D('2025-10-17') }),
  z({ oid: 2, bagts: 'Багц 1', ded: '300.10. БАГЦ 1' }),
  z({ oid: 3, bagts: 'Багц 3-1', ded: '300.40. БАГЦ 3-2', dav: D('2026-02-03') }),
  z({ oid: 4, bagts: 'Багц 1', buleg: '005. ТӨСӨВ', mag: D('2026-10-08') }),
  z({ oid: 5, bagts: 'Багц 2', rec: D('2026-05-11'), pdf: 'abc' }),
];
const st = zuragPkgStats(rows);
assert.deepEqual(st.get('БАГЦ1'), { total: 2, magadlal: 1, received: 0, pdf: 0, pct: 80 }, 'төсөв орохгүй; «Багц 1,2» тоологдоно');
/* 2026-11-19 (аудит): ТӨЛӨВӨӨР — хүлээж авсан баримт магадлалыг давсан тул «магадлалд орсон»-д ч тоологдоно */
assert.deepEqual(st.get('БАГЦ2'), { total: 2, magadlal: 2, received: 1, pdf: 1, pct: 180 }, 'магадлал 80 + хүлээж авсан 100');
assert.deepEqual(st.get('БАГЦ32'), { total: 1, magadlal: 1, received: 0, pdf: 0, pct: 80 }, 'дэд бүлгийн багц түрүүлнэ; давтан магадлал тоологдоно');
assert.ok(!st.has('БАГЦ31'));
const pm = zuragPctMap(rows);
assert.equal(pm.get('БАГЦ1'), 40, '2026-11-17: төлөвийн хувийн дундаж — (80 + 0) ÷ 2');
assert.deepEqual(groupZ(rows).map((g) => g.buleg), ['003. АЖЛЫН ЗУРАГ', '005. ТӨСӨВ']);

const t = buildTree([
  { objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' },
  { objectid: 2, dd_kod: '2.1', etseg_kod: '2', bagts: 'Багц-1', ajil_uilchilgee: 'a', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 100 },
  { objectid: 3, dd_kod: '2.2', etseg_kod: '2', bagts: 'БАГЦ-16.1', ajil_uilchilgee: 'b', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 100 },
]);
const r = computePlan(t, { zuragActual: (pkg) => pm.get(String(pkg ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '')) });
assert.equal(r.get('2.1').S, 40, 'бүртгэлтэй багц — бүртгэлийн хувь');
assert.equal(r.get('2.2').S, 100, 'бүртгэлгүй — хадгалсан');
/* ── 2026-11-16: төсвийн багцаар нэгтгэх ── */
{
  const { pkgNums, docPkgs, groupByBudget } = await import('./zuragBurtgel.ts');
  assert.deepEqual(pkgNums('Багц 1,2'), ['1', '2']);
  assert.deepEqual(pkgNums('Багц 3-1'), ['3.1']);
  assert.deepEqual(pkgNums('Багц 3.1'), ['3.1']);
  assert.deepEqual(pkgNums('17.1'), ['17.1']);
  assert.deepEqual(pkgNums('Бүх багц'), []);
  assert.deepEqual(pkgNums('Байхгүй'), []);
  const z = (oid, o) => ({ oid, turul: 'zurag', bagts: '', dedBuleg: '', ner: '', ...o });
  const t = (oid, o) => ({ oid, turul: 'tosov', bagts: '', dedBuleg: '', ner: '', ...o });
  assert.deepEqual(docPkgs(z(1, { bagts: 'Багц 3-1', dedBuleg: '300.40. БАГЦ 3-2' })), ['3.2'], 'зураг — дэд бүлгийн багц түрүүлнэ');
  assert.deepEqual(docPkgs(t(1, { ner: 'Багц 1,2-ын гадна цахилгаан хангамж' })), ['1', '2'], 'төсөв — багана хоосон бол нэрээс');
  assert.deepEqual(docPkgs(t(1, { ner: 'Багц 3-ын Гадна цахилгаан' })), ['3']);
  assert.deepEqual(docPkgs(t(1, { ner: 'ХТП,РП-ны барилга угсралт' })), [], 'нэрэнд багцгүй');
  const rows = [
    t(1, { bagts: 'Багц 1' }), t(2, { bagts: 'Багц 1,2' }), t(3, { bagts: 'Багц 3' }), t(4, { bagts: '17.1' }), t(5, { ner: 'Эх үүсвэр' }),
    z(11, { bagts: 'Багц 1' }), z(12, { bagts: 'Багц 2' }), z(13, { bagts: 'Багц 3-1' }), z(14, { bagts: '17.1' }), z(15, { bagts: '6.1' }), z(16, { bagts: 'Байхгүй' }),
  ];
  const g = groupByBudget(rows);
  const of = (k) => g.find((x) => x.key === k);
  assert.deepEqual(g.map((x) => x.key), ['1', '1,2', '3', '6.1', '17.1', '@Байхгүй', ''], 'багцын дугаараар; нэртэй; багцгүй сүүлд');
  assert.deepEqual(of('1').zurag.map((r) => r.oid), [11], 'Багц 1 — зөвхөн Багц 1-ийн зураг (17.1 биш)');
  assert.deepEqual(of('1,2').zurag.map((r) => r.oid), [11, 12], '«Багц 1,2» төсөв — Багц 1 + Багц 2-ын зураг');
  assert.deepEqual(of('3').zurag.map((r) => r.oid), [13], 'дэд багц 3.1 ∈ Багц 3');
  assert.deepEqual(of('6.1').tosov, [], 'төсөвгүй багц — өөрийн бүлэг');
  assert.deepEqual(of('').tosov.map((r) => r.oid), [5]);
  assert.deepEqual(of('').zurag.map((r) => r.oid), []);
  /* 2026-11-19: дугааргүй «Багц» утга — өөрийн нэрээр бүлэг («Тухайлсан»), хоосон нь «Багц заагаагүй» */
  assert.deepEqual([of('@Байхгүй').label, of('@Байхгүй').zurag.map((r) => r.oid)], ['Байхгүй', [16]]);
  const g2 = groupByBudget([z(21, { bagts: 'Тухайлсан' }), z(22, { bagts: ' тухайлсан ' }), t(23, { bagts: 'Тухайлсан', ner: 'Эх үүсвэрийн төсөв' }), z(24, {}), z(25, { bagts: 'Багц 2' })]);
  assert.deepEqual(g2.map((x) => [x.key, x.label ?? null, x.tosov.map((r) => r.oid), x.zurag.map((r) => r.oid)]),
    [['2', null, [], [25]], ['@Тухайлсан', 'Тухайлсан', [23], [21, 22]], ['', null, [], [24]]]);
}
/* ── 2026-11-17: төлөв ── */
{
  const { deriveTolov, tolovAvg, tolovPct, zuragGereePct } = await import('./zuragBurtgel.ts');
  const none = { batlagdsan_ognoo: null, magadlal_ognoo: null, davtan_magadlal_ognoo: null, huleej_avsan_ognoo: null, guitsetgegchid_ogson_ognoo: null };
  assert.equal(deriveTolov(none), 'ehleegui');
  assert.equal(deriveTolov({ ...none, batlagdsan_ognoo: 1 }), 'magadlal', 'ХБХСГ-аар батлагдсан ч тооцогдоно');
  assert.equal(deriveTolov({ ...none, magadlal_ognoo: 1, huleej_avsan_ognoo: 2 }), 'huleej_avsan');
  assert.deepEqual(['ehleegui', 'magadlal', 'huleej_avsan'].map(tolovPct), [0, 80, 100]);
  assert.equal(toZRow({ objectid: 1, magadlal_ognoo: 5, tolov: 'ehleegui' }).tolov, 'ehleegui', 'хадгалсан төлөв огнооноос түрүүлнэ');
  assert.equal(toZRow({ objectid: 1, magadlal_ognoo: 5, tolov: 'xx' }).tolov, 'magadlal', 'танигдаагүй утга — огнооноос');
  assert.equal(tolovAvg([]), null);
  const g = zuragGereePct([toZRow({ objectid: 1, geree_dugaar: 'А-1', tolov: 'huleej_avsan' }), toZRow({ objectid: 2, geree_dugaar: 'А-1' }), toZRow({ objectid: 3 })]);
  assert.equal(g.get('А1'), 50, 'гэрээгээр: (100 + 0) ÷ 2; гэрээгүй мөр орохгүй');
}
console.log('zuragBurtgel.check: бүгд ✅');

/* ── «+ Зураг нэмэх»-ийн багцын жагсаалт — ТТБ-ийн «Барилга угсралт»-ын багцын нэрс (2026-11-17) ── */
{
  const { planPkgNames } = await import('./zuragBurtgel.ts');
  const { strict: a } = await import('node:assert');
  const rows = [
    { dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл' }, { dd_kod: '2.1', bagts: 'Багц 9' },
    { dd_kod: '6', ajil_uilchilgee: 'Барилга угсралт' },
    { dd_kod: '6.10', bagts: 'Багц-10' }, { dd_kod: '6.2', bagts: 'Багц-2' }, { dd_kod: '6.2.1', bagts: 'БАГЦ  2' },
    { dd_kod: '6.1', bagts: 'БАГЦ 1- 4' }, { dd_kod: '6.3', bagts: 'БАГЦ-6.1, 6.2' }, { dd_kod: '6.4', bagts: 'БАГЦ - 19.1' }, { dd_kod: '6.5', bagts: null },
  ];
  a.deepEqual(planPkgNames(rows), ['Багц-2', 'Багц-19.1', 'Багц-10'], 'зөвхөн Барилга угсралт; Д/Д-ийн дарааллаар; давхардал, нэгтгэсэн мөр, хоосон орохгүй');
  a.deepEqual(planPkgNames([{ dd_kod: '1', ajil_uilchilgee: 'ТЭЗҮ' }]), [], 'үе шат олдоогүй — хоосон (бичих талбар хэвээр)');
  console.log('zuragBurtgel.check: багцын жагсаалт ✅');
}

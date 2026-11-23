/**
 * ТТБ-ийн ТЭЗҮ · зураг төслийн хэсэг — жинхэнэ Зургийн бүртгэлээр (2026-11-17), цэвэр логикийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/zuragPlan.check.mjs
 *
 *   1. Үе шатын хадгалсан доод мөрүүд модноос хасагдаж, бүртгэлийн бүлэг · дэд бүлэг зохиомол мөр болно; бүртгэлд байхгүй
 *      зүйл ТТБ-д орохгүй.
 *   2. Зохиомол мөрийн хувь = төлөвийн дундаж, жин = баримтын тооны хувь; үе шат = бүх баримтын дундаж.
 *   3. Үе шатын мөнгөн дүн, огноо хэвээр (хуучин мөрүүдийн нийлбэр / хүрээ). ТЭЗҮ — дэд бүлгүүд шууд үе шатын доор.
 *   4. Бүртгэлд баримтгүй үе шат хөндөгдөхгүй.
 */
import assert from 'node:assert/strict';
import { buildTree, computePlan, moneySums, planBudgetTotal } from './projectPlan.ts';
import { toZRow } from './zuragBurtgel.ts';
import { withRegistryRows, registryPlanEdits, isTezuBuleg } from './zuragPlan.ts';
import { isRegisterRow } from './hoSync/compute.ts';
import { CASHFLOW_NEW } from './services.ts';

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const rows = [
  { objectid: 10, dd_kod: '1', ajil_uilchilgee: 'ТЭЗҮ', uy_shat: 'ТЭЗҮ' },
  { objectid: 11, dd_kod: '1.1', etseg_kod: '1', ajil_uilchilgee: 'ТЭЗҮ гэрээ', ho_dun_geree: 40, guitsetgel_huvi: 100 },
  { objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' },
  { objectid: 2, dd_kod: '2.1', etseg_kod: '2', ajil_uilchilgee: 'Гэрээ I', ho_dun_geree: 100, guits_ehleh: D('2025-04-21'), guits_duusah: D('2025-08-15') },
  { objectid: 3, dd_kod: '2.1.1', etseg_kod: '2.1', bagts: 'Багц-1', ajil_uilchilgee: 'хуучин Багц-1', heseg_ezleh_huvi: 1, guitsetgel_huvi: 100 },
  { objectid: 4, dd_kod: '2.2', etseg_kod: '2', ajil_uilchilgee: 'Бүртгэлд байхгүй өөр гэрээ', ho_dun_geree: 300, guitsetgel_huvi: 50, guits_ehleh: D('2025-06-10'), guits_duusah: D('2027-03-01') },
  { objectid: 20, dd_kod: '3', ajil_uilchilgee: 'Барилга угсралт', uy_shat: 'Барилга угсралт', ho_dun_geree: 1000 },
];
const z = (oid, buleg, ded, tolov) => toZRow({ objectid: oid, buleg, ded_buleg: ded, ner: `n${oid}`, tolov });
const docs = [
  z(1, '002. ЗАГВАР ЗУРАГ', '', 'magadlal'),
  z(2, '003. АЖЛЫН ЗУРАГ', '300.10. БАГЦ 1', 'huleej_avsan'),
  z(3, '003. АЖЛЫН ЗУРАГ', '300.10. БАГЦ 1', 'ehleegui'),
  z(4, '003. АЖЛЫН ЗУРАГ', '300.20. БАГЦ 2', 'magadlal'),
];
assert.equal(isTezuBuleg('001. ТЭЗҮ, БАРИЛГАЖИЛТЫН ТӨСӨЛ'), true);
assert.equal(isTezuBuleg('003. АЖЛЫН ЗУРАГ'), false);
assert.deepEqual(withRegistryRows(rows, []), rows, 'бүртгэл хоосон — хэвээр');

const out = withRegistryRows(rows, docs);
assert.ok(!out.some((r) => ['Гэрээ I', 'хуучин Багц-1', 'Бүртгэлд байхгүй өөр гэрээ'].includes(r.ajil_uilchilgee)), 'зураг төслийн хуучин бүх доод мөр (бүртгэлд байхгүй гэрээ ч) модонд орохгүй');
assert.ok(out.some((r) => r.objectid === 11), 'ТЭЗҮ-д бүртгэлийн баримтгүй — хөндөгдөхгүй');
const v = out.filter((r) => r.registry);
assert.deepEqual(v.map((r) => `${r.dd_kod}|${r.ajil_uilchilgee}`), [
  '2.1|1. ЗАГВАР ЗУРАГ', '2.1.1|n1',
  '2.2|2. АЖЛЫН ЗУРАГ', '2.2.1|1. БАГЦ 1', '2.2.1.1|n2', '2.2.1.2|n3', '2.2.2|2. БАГЦ 2', '2.2.2.1|n4',
], 'үе шатын шууд доор бүлэг → дэд бүлэг → баримт бүр');
assert.deepEqual(v.map((r) => [r.dd_kod, r.objectid, !!r.virtual]), [['2.1', 2, false], ['2.1.1', 3, false], ['2.2', 4, false], ['2.2.1', null, true], ['2.2.1.1', null, true], ['2.2.1.2', null, true], ['2.2.2', null, true], ['2.2.2.1', null, true]],
  'хүснэгтэд ижил Д/Д-тэй мөр байвал түүний objectid; байхгүй бол зохиомол');

const t = buildTree(out);
assert.deepEqual(t.issues, []);
const r = computePlan(t, {}, D('2026-07-02'));
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} ≠ ${b}`);
near(r.get('2.1').S, 80, 'Загвар зураг — магадлал 80');
near(r.get('2.2.1').S, 50, 'Багц 1 — (100 + 0) ÷ 2');
assert.equal(r.get('2.2.1.1').S, 100, 'баримт — өөрийн төлөвийн хувь (хүлээж авсан)');
assert.equal(r.get('2.2.1.2').S, 0, 'баримт — эхлээгүй');
near(r.get('2.2.1.1').F, 50, 'баримтын жин тэнцүү');
near(r.get('2.2').S, 60, 'Ажлын зураг — (100 + 0 + 80) ÷ 3');
near(r.get('2.2').F, 75, 'жин = баримтын тоо 3 ÷ 4');
near(r.get('2').S, 65, 'үе шат — 4 баримтын дундаж');
assert.equal(r.get('2').E, 400, 'үе шатын мөнгөн дүн хэвээр — хуучин мөрүүдийн нийлбэр 100 + 300');
/* 2026-11-19 (хэрэглэгч: «бүрэн data source»): үе шатын гүйцэтгэгчийн огноо — хуучин мөрүүдийнх БИШ, баримтуудын 5 шатны
   огнооноос; энэ фикстурын баримтуудад огноо алга → хоосон */
assert.equal(r.get('2').L, null, 'эхлэх — баримтад огноо алга бол хоосон (хуучин 2025-04-21 биш)');
assert.equal(r.get('2').M, null, 'дуусах — хоосон');
{
  const zd = (oid, ded, dates) => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: ded, ner: `d${oid}`, ...dates });
  const dd = [
    zd(31, '300.10. БАГЦ 1', { magadlal_ognoo: D('2026-02-01'), huleej_avsan_ognoo: D('2026-05-10') }),
    zd(32, '300.10. БАГЦ 1', { batlagdsan_ognoo: D('2026-01-15') }),
    zd(33, '300.20. БАГЦ 2', {}),
  ];
  const { stageSpan } = await import('./zuragPlan.ts');
  assert.deepEqual(stageSpan(dd[0]), { guits_ehleh: D('2026-02-01'), guits_duusah: D('2026-05-10') }, 'эхний шат – сүүлийн шат');
  assert.deepEqual(stageSpan(dd[2]), { guits_ehleh: null, guits_duusah: null });
  const t2 = buildTree(withRegistryRows(rows, dd));
  const r2 = computePlan(t2);
  const v2 = r2.values.get(t2.nodes.find((n) => n.code === '2'));
  assert.deepEqual([v2.L, v2.M], [D('2026-01-15'), D('2026-05-10')], 'үе шат = баримтуудын хамгийн эрт эхлэх, хамгийн орой дуусах');
}
near(r.get('2').F, 400 / 1440 * 100, 'үе шатын жин мөнгөөр, өөрчлөгдөөгүй');
assert.equal(r.get('1').S, 100, 'ТЭЗҮ хуучнаараа');

/* ТЭЗҮ — ганц бүлэг: дэд бүлгүүд шууд үе шатын доор */
const tz = withRegistryRows(rows, [z(5, '001. ТЭЗҮ, БАРИЛГАЖИЛТЫН ТӨСӨЛ', '100. ТЕЗҮ', 'magadlal'), z(6, '001. ТЭЗҮ, БАРИЛГАЖИЛТЫН ТӨСӨЛ', '200. БАРИЛГАЖИЛТЫН ТӨСӨЛ', 'ehleegui')]);
assert.deepEqual(tz.filter((x) => x.registry).map((x) => `${x.dd_kod}|${x.ajil_uilchilgee}`), ['1.1|1. ТЕЗҮ', '1.1.1|n5', '1.2|2. БАРИЛГАЖИЛТЫН ТӨСӨЛ', '1.2.1|n6']);
const rt = computePlan(buildTree(tz), {}, D('2026-07-02'));
near(rt.get('1').S, 40, 'ТЭЗҮ — (80 + 0) ÷ 2');
assert.equal(rt.get('1').E, 40, 'ТЭЗҮ-ийн мөнгө хэвээр');
assert.equal(rt.get('2.1').E, 100, 'зураг төсөлд бүртгэлийн баримтгүй — хөндөгдөхгүй');
/* ── Ажлын үнэ (2026-11-18): үнэтэй баримт нэг ч байвал мөнгөөр — үнэгүй баримт төсөвгүй, бусдынх хөндөгдөхгүй ── */
{
  const zp = (oid, ded, tolov, une) => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: ded, ner: `n${oid}`, tolov, ajliin_une: une });
  const all = [zp(1, '300.10. БАГЦ 1', 'huleej_avsan', 300), zp(2, '300.10. БАГЦ 1', 'ehleegui', 100), zp(3, '300.20. БАГЦ 2', 'magadlal', 600)];
  const ra = computePlan(buildTree(withRegistryRows(rows, all)), {}, D('2026-07-02'));
  assert.equal(ra.get('2.1.1.1').E, 300, 'баримтын төсөвт өртөг = ажлын үнэ');
  assert.equal(ra.get('2.1.1').E, 400, 'дэд бүлэг — нийлбэр');
  assert.equal(ra.get('2').E, 1000, 'үе шат — баримтуудын нийлбэр (хуучин 400 биш)');
  near(ra.get('2.1.1.1').F, 75, 'жин мөнгөөр 300 ÷ 400');
  near(ra.get('2.1.1').S, 75, 'мөнгөөр жигнэсэн: 0.75 × 100 + 0.25 × 0');
  near(ra.get('2').S, 0.4 * 75 + 0.6 * 80, 'үе шат мөнгөөр');
  const part = [zp(1, '300.10. БАГЦ 1', 'huleej_avsan', 300), zp(2, '300.10. БАГЦ 1', 'ehleegui', null)];
  const rp = computePlan(buildTree(withRegistryRows(rows, part)), {}, D('2026-07-02'));
  assert.equal(rp.get('2').E, 300, 'дутуу бөглөсөн — үнэтэй баримтын төсөв хэвээр (үнэгүй нь 0)');
  assert.equal(rp.get('2.1.1.1').E, 300, 'үнэтэй баримтын төсөв арилахгүй');
  assert.equal(rp.get('2.1.1.2').E, null, 'үнэгүй баримт төсөвгүй');
  /* нэг ч баримт үнэгүй үед хуучин горим: үе шатын хуучин нийт дүн, баримтын тоогоор */
  const none = [zp(1, '300.10. БАГЦ 1', 'huleej_avsan', null), zp(2, '300.10. БАГЦ 1', 'ehleegui', null)];
  const rn = computePlan(buildTree(withRegistryRows(rows, none)), {}, D('2026-07-02'));
  assert.equal(rn.get('2').E, 400, 'үнэгүй — үе шатын хуучин нийт дүн хэвээр');
  near(rn.get('2.1.1').S, 50, 'үнэгүй — баримтын тоогоор');
  const tAll = buildTree(withRegistryRows(rows, all));
  assert.equal(moneySums(tAll).get(tAll.byCode.get('2')).contract, 1000, 'бүрэн бөглөсөн — гэрээний дүн = ажлын үнийн нийлбэр');
  near(rp.get('2.1.1').S, 100, 'дутуу бөглөсөн — үнэгүй баримт жин 0, үнэтэй нь 100%');
  /* 2026-11-18: хүснэгтэд бүгд үнэтэй бичигдсэний дараа үнэгүй шинэ баримт нэмэхэд бусдын төсөв АРИЛАХГҮЙ */
  {
    const { registryPlanEdits } = await import('./zuragPlan.ts');
    const base = [
      { objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' },
      { objectid: 20, dd_kod: '3', ajil_uilchilgee: 'Барилга угсралт', uy_shat: 'Барилга угсралт', ho_dun_geree: 1000 },
    ];
    const first = registryPlanEdits(base, all);
    let oid = 100;
    /* хүснэгтээс уншихад эцэг код Д/Д-ээс гардаг (`cfClass.cfDerive`) — энд гараар */
    const par = (a) => ({ ...a, etseg_kod: a.dd_kod.split('.').slice(0, -1).join('.') });
    const stored = [...base, ...first.adds.map((a) => ({ ...par(a), objectid: oid++ }))];
    assert.equal(registryPlanEdits(stored, all).updates.length + registryPlanEdits(stored, all).adds.length + registryPlanEdits(stored, all).deletes.length, 0, 'тааруулсны дараа засваргүй');
    const plus = [...all, zp(9, '300.20. БАГЦ 2', 'ehleegui', null)];
    const e2 = registryPlanEdits(stored, plus);
    assert.equal(e2.deletes.length, 0, 'юу ч устгахгүй');
    assert.ok(e2.updates.every((u) => !('ho_dun_geree' in u) && !('geree_dun' in u)), 'бусад баримтын төсөв, гэрээний дүн хөндөгдөхгүй');
    assert.equal(e2.adds.length, 1, 'зөвхөн шинэ баримтын мөр нэмэгдэнэ');
    assert.equal(e2.adds[0].ho_dun_geree, null, 'шинэ баримт төсөвгүй');
    const after = [...stored.map((r) => { const u = e2.updates.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; }), ...e2.adds.map((a) => ({ ...par(a), objectid: oid++ }))];
    const ep = computePlan(buildTree(withRegistryRows(after, plus)), {}, D('2026-07-02'));
    assert.equal(ep.get('2').E, 1000, 'үе шатын төсөв хэвээр 1000');
    assert.equal(ep.values.get(ep.tree.root).E, 2000, 'нийт төсөв буурахгүй');
  }
}
/* ── Олгосон дүн · урьдчилгаа · гэрээний дүн: хуучин гэрээний мөрүүд модноос хасагдсан ч төслийн нийт өөрчлөгдөхгүй ── */
{
  const paid = rows.map((x) => (x.dd_kod === '2.1' ? { ...x, olgoson_dun: 60, urdchilgaa_dun: 5, geree_dun: 100, ho_dungiin_tailbar: 'Гэрээлсэн дүн' }
    : x.dd_kod === '2.2' ? { ...x, olgoson_dun: 40 } : x));
  const tBefore = buildTree(paid);
  const before = moneySums(tBefore);
  const tAfter = buildTree(withRegistryRows(paid, docs));
  const after = moneySums(tAfter);
  const root = (m, t) => m.get(t.root);
  assert.deepEqual(root(after, tAfter), root(before, tBefore), 'төслийн нийт олгосон · урьдчилгаа · гэрээ хэвээр');
  assert.equal(root(after, tAfter).paid, 100, 'олгосон 60 + 40');
  assert.equal(after.get(tAfter.byCode.get('2')).paid, 100, 'үе шатын мөрд шилжсэн');
  assert.equal(after.get(tAfter.byCode.get('2')).contract, 100);
}
/* ── Хүснэгтэд бичих: хуучныг устгаж шинийг нэмнэ; дараа нь зөвхөн зөрснийг засна ── */
{
  assert.deepEqual(registryPlanEdits(rows, []), { adds: [], updates: [], deletes: [], held: [] }, 'бүртгэл хоосон — юу ч устгахгүй');
  const e = registryPlanEdits(rows, docs);
  /* 2026-11-19: огноо бүртгэлээс бичигддэг болсон тул огноотой 2.1, 2.2 «гадны» мөр биш — устгахгүй, байранд нь засна
     (хуучин огноо хоосолно); 2.1.1 (жин, хувь, багц л) — засна */
  assert.deepEqual(e.deletes, []);
  assert.deepEqual(e.adds.map((a) => a.dd_kod), ['2.2.1', '2.2.1.1', '2.2.1.2', '2.2.2', '2.2.2.1']);
  assert.deepEqual(e.updates.map((u) => [u.objectid, u.guits_ehleh, u.guits_duusah]), [[2, null, null], [3, undefined, undefined], [4, null, null]],
    'хуучин огноо хоосолдоно');
  assert.deepEqual(e.updates.find((u) => u.objectid === 3), { objectid: 3, ajil_uilchilgee: 'n1', bagts: null, guitsetgel_huvi: 80, zurag_oid: 1 }, '2026-11-19: бүртгэлийн мөрийн ID бичигдэнэ');
  const a = e.adds.find((x) => x.dd_kod === '2.2.1.1');
  assert.deepEqual(a, { dd_kod: '2.2.1.1', ajil_uilchilgee: 'n2', bagts: null, heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 100, ho_dun_geree: null, geree_dun: null, ho_dungiin_tailbar: null, olgoson_dun: null, guits_ehleh: null, guits_duusah: null, zurag_oid: 2, bagts_kod: null },
    'бүртгэлд байхгүй утга хоосон');
  assert.ok(!e.deletes.includes(1) && !e.deletes.includes(11) && !e.deletes.includes(20), 'үе шатын мөр, бусад үе шат хөндөгдөхгүй');
  /* Бичигдсэний дараах байдал: дахин тулгахад засвар алга; төлөв өөрчлөгдвөл ганц мөр засна; баримт хасагдвал мөр устана */
  let oid = 100;
  const stored = [...rows.filter((r) => !e.deletes.includes(r.objectid)).map((r) => { const u = e.updates.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; }),
    ...e.adds.map((x) => ({ ...x, objectid: oid++, etseg_kod: x.dd_kod.replace(/\.\d+$/, '') }))];
  assert.deepEqual(registryPlanEdits(stored, docs), { adds: [], updates: [], deletes: [], held: [] }, 'таарсан — засваргүй');
  const e2 = registryPlanEdits(stored, docs.map((d) => (d.oid === 3 ? { ...d, tolov: 'magadlal' } : d)));
  /* 2026-11-18: баримтын төлөв өөрчлөгдөхөд түүний мөр ба дээд бүлгүүдийн ДУНДАЖ хамт шинэчлэгдэнэ (бүлгийн хувийг
     хоослохгүй — гүйцэтгэл хадгалагчтай ээлжлэн дардаг байсныг зогсоов) */
  const idOf = (c) => stored.find((r) => r.dd_kod === c).objectid;
  assert.deepEqual(e2, { adds: [], updates: [
    { objectid: idOf('2.2'), guitsetgel_huvi: 86.666667 },
    { objectid: idOf('2.2.1'), guitsetgel_huvi: 90 },
    { objectid: idOf('2.2.1.2'), guitsetgel_huvi: 80 },
  ], deletes: [], held: [] });
  assert.equal(stored.find((r) => r.dd_kod === '2.2.1').guitsetgel_huvi, 50, 'бүлгийн мөрд дундаж хадгалагдана: (100 + 0) ÷ 2');
  const e3 = registryPlanEdits(stored, docs.filter((d) => d.oid !== 4));
  assert.deepEqual(e3.deletes.sort(), [stored.find((r) => r.dd_kod === '2.2.2').objectid, stored.find((r) => r.dd_kod === '2.2.2.1').objectid].sort());
  /* 2026-11-23: бүртгэлээс хасагдсан баримтын мөр гэрээний дугаартай бол устгахгүй (гэрээ, төлбөр алдагдахгүй) */
  {
    const leaf = stored.find((r) => r.dd_kod === '2.2.2.1');
    const withGeree = stored.map((r) => (r === leaf ? { ...r, geree_dugaar: 'НХААГ/1' } : r));
    const e4 = registryPlanEdits(withGeree, docs.filter((d) => d.oid !== 4));
    assert.ok(!e4.deletes.includes(leaf.objectid), 'гэрээтэй мөр устгагдахгүй');
    assert.deepEqual(e4.held, [leaf.objectid], 'гэрээтэй мөрийг үлдээсэн жагсаалтад');
    const e5 = registryPlanEdits(stored.map((r) => (r === leaf ? { ...r, guitsetgegch: 'ХХК' } : r)), docs.filter((d) => d.oid !== 4));
    assert.deepEqual(e5.held, [leaf.objectid], 'гүйцэтгэгчтэй мөр мөн үлдэнэ');
  }
  assert.equal(e3.adds.length, 0);
}

/* 2026-11-18 МӨР БАРИМТАА ДАГАНА: гэрээ · төлбөртэй мөр устахгүй; дунд нь баримт нэмэхэд гэрээ өөр баримтад шилжихгүй */
{
  const base = [
    { objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' },
    { objectid: 20, dd_kod: '3', ajil_uilchilgee: 'Барилга угсралт', uy_shat: 'Барилга угсралт', ho_dun_geree: 1000 },
  ];
  const zd = (oid, ner) => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: '', ner, tolov: 'Батлагдсан', ajliin_une: 10 });
  const docs = [zd(1, 'A'), zd(2, 'B'), zd(3, 'C')];
  let oid = 100;
  const apply = (rows, e) => [
    ...rows.filter((r) => !e.deletes.includes(r.objectid)).map((r) => { const u = e.updates.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; }),
    ...e.adds.map((x) => ({ ...x, objectid: oid++ })),
  ].map((r) => ({ ...r, etseg_kod: r.dd_kod.includes('.') ? r.dd_kod.replace(/\.\d+$/, '') : null }));
  let stored = apply(base, registryPlanEdits(base, docs));
  const idB = stored.find((r) => r.ajil_uilchilgee === 'B').objectid;
  /* B баримтад гэрээ байгуулж, төлбөр олгосон */
  stored = stored.map((r) => (r.objectid === idB ? { ...r, geree_dugaar: 'З/7', guitsetgegch: 'Зураг ХХК', olgoson_dun: 4, urdchilgaa_dun: 1 } : r));
  assert.deepEqual(registryPlanEdits(stored, docs), { adds: [], updates: [], deletes: [], held: [] }, 'гэрээ · төлбөртэй мөр устаж дахин нэмэгдэхгүй');
  /* B-ийн өмнө шинэ баримт: B нэг мөрөөр доошилно — мөр (гэрээ, төлбөртэйгээ) хамт явна */
  const plus = [docs[0], zd(9, 'X'), docs[1], docs[2]];
  const e = registryPlanEdits(stored, plus);
  assert.deepEqual(e.deletes, []);
  assert.deepEqual(e.adds.map((a) => a.ajil_uilchilgee), ['X']);
  assert.equal(e.updates.find((u) => u.objectid === idB).dd_kod, '2.1.3');
  stored = apply(stored, e);
  const b = stored.find((r) => r.objectid === idB);
  assert.deepEqual([b.ajil_uilchilgee, b.dd_kod, b.geree_dugaar, b.olgoson_dun], ['B', '2.1.3', 'З/7', 4], 'дугаартай мөрийн олгосон дүн (төлбөрийн актаас) хэвээр');
  /* 2026-11-19: дугааргүй баримтын мөр — «Ажлын үнэ» нь олгосон дүн ч мөн */
  assert.deepEqual(stored.filter((r) => ['A', 'C', 'X'].includes(r.ajil_uilchilgee)).map((r) => r.olgoson_dun), [10, 10, 10]);
  assert.equal(new Set(stored.map((r) => r.dd_kod)).size, stored.length, 'Д/Д давхардахгүй');
  assert.deepEqual(registryPlanEdits(stored, plus), { adds: [], updates: [], deletes: [], held: [] }, 'тогтвортой');
  /* нэр өөрчлөгдсөн баримт — ижил Д/Д-ийн мөр хэвээр (гэрээ хэвээр) */
  const ren = registryPlanEdits(stored, plus.map((d) => (d.oid === 2 ? zd(2, 'B2') : d)));
  assert.deepEqual([ren.adds.length, ren.deletes.length], [0, 0]);
  assert.equal(ren.updates.find((u) => u.objectid === idB).ajil_uilchilgee, 'B2');
  /* хоосон/зайтай дугаар = дугааргүй: олгосон дүнг бүртгэл бичнэ (`hoSync.isRegisterRow`-тай нэг дүрэм — эзэнгүй мөр алга) */
  for (const no of ['', '  ']) {
    const blank = stored.map((r) => (r.objectid === idB ? { ...r, geree_dugaar: no, olgoson_dun: 4 } : r));
    assert.equal(registryPlanEdits(blank, plus).updates.find((u) => u.objectid === idB)?.olgoson_dun, 10, `дугаар ${JSON.stringify(no)} — бүртгэлийн мөр`);
    const cf = CASHFLOW_NEW.fields;
    assert.equal(isRegisterRow({ [cf.phase]: 'Ажлын зураг төсөл', [cf.contractNo]: no }), true, 'hoSync ч мөн бүртгэлийн мөр гэж үзнэ');
  }
}
/* 2026-11-19: мөр бүртгэлийн ID-аараа (`zurag_oid`) баримтаа дагана — нэр ба байрлал хоёулаа өөрчлөгдсөн ч гэрээ, төлбөр хэвээр */
{
  const base = [{ objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' }, { objectid: 20, dd_kod: '3', ajil_uilchilgee: 'Барилга угсралт', uy_shat: 'Барилга угсралт', ho_dun_geree: 1 }];
  const zd = (oid, ner) => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: '', ner, tolov: 'Батлагдсан', ajliin_une: 10 });
  let oid = 500;
  const apply = (rows, e) => [
    ...rows.filter((r) => !e.deletes.includes(r.objectid)).map((r) => { const u = e.updates.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; }),
    ...e.adds.map((x) => ({ ...x, objectid: oid++ })),
  ].map((r) => ({ ...r, etseg_kod: r.dd_kod.includes('.') ? r.dd_kod.replace(/\.\d+$/, '') : null }));
  let st = apply(base, registryPlanEdits(base, [zd(7, 'A'), zd(8, 'B')]));
  const idB = st.find((r) => r.zurag_oid === 8).objectid;
  st = st.map((r) => (r.objectid === idB ? { ...r, geree_dugaar: 'З/9' } : r));
  const e = registryPlanEdits(st, [zd(9, 'X'), zd(7, 'A'), zd(8, 'B шинэ нэр')]);
  assert.deepEqual(e.deletes, [], 'гэрээтэй мөр устахгүй');
  const u = e.updates.find((x) => x.objectid === idB);
  assert.deepEqual([u.ajil_uilchilgee, u.dd_kod], ['B шинэ нэр', '2.1.3'], 'нэр, байрлал өөрчлөгдсөн ч мөр баримтаа дагана');
}
/* 2026-11-20: 182-т байхгүй `geree_ehleh` · `geree_duusah` бүртгэлийн бичилтэд орохгүй */
{
  const { REGISTRY_PLAN_KEYS } = await import('./zuragPlan.ts');
  assert.ok(!REGISTRY_PLAN_KEYS.includes('geree_ehleh') && !REGISTRY_PLAN_KEYS.includes('geree_duusah'));
}
/* 2026-11-20: үнэгүй зурагт «Төлбөрийн акт»-аар гэрээ байгуулсан — бүртгэл хадгалахад гэрээний дүн, тэмдэглэгээ арилахгүй */
{
  const base = [{ objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' }, { objectid: 20, dd_kod: '3', ajil_uilchilgee: 'Барилга угсралт', uy_shat: 'Барилга угсралт', ho_dun_geree: 1 }];
  const zd = (oid, ner) => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: '', ner, tolov: 'Батлагдсан' });
  let oid = 700;
  const e0 = registryPlanEdits(base, [zd(71, 'P'), zd(72, 'Q')]);
  /* 2026-11-24: `/.d+$/` → `/\.\d+$/` (эцэг код зөв — урьд нь мөр өөрөө өөрийнхөө эцэг болж үндэст унадаг байв) */
  let st = [...base, ...e0.adds.map((x) => ({ ...x, objectid: oid++, etseg_kod: x.dd_kod.includes('.') ? x.dd_kod.replace(/\.\d+$/, '') : null }))];
  assert.deepEqual(buildTree(st).issues, [], 'мод зөв угсрагдана');
  const id = st.find((r) => r.zurag_oid === 72).objectid;
  st = st.map((r) => (r.objectid === id ? { ...r, geree_dugaar: 'З/5', geree_dun: 40, ho_dungiin_tailbar: 'Гэрээлсэн дүн', olgoson_dun: 10 } : r));
  const e = registryPlanEdits(st, [zd(71, 'P'), zd(72, 'Q')]);
  const u = e.updates.find((x) => x.objectid === id);
  assert.ok(!u || (!('geree_dun' in u) && !('ho_dungiin_tailbar' in u) && !('olgoson_dun' in u)), 'гэрээ, төлбөр хэвээр');

  /* ── 2026-11-24 №3А: үнэгүй үе шат — гэрээтэй баримт өөрийн олгосон дүнтэй; үе шатын мөрд ДАВХАР орохгүй (20 ↔ 10) ── */
  {
    const t = buildTree(withRegistryRows(st, [zd(71, 'P'), zd(72, 'Q')]));
    const m = moneySums(t);
    assert.equal(m.get(t.root).paid, 10, 'төслийн нийт олгосон 10 (20 биш)');
    const ts = buildTree(st);
    assert.equal(m.get(t.root).paid, moneySums(ts).get(ts.root).paid, 'хадгалсан мөрийн нийлбэртэй ижил');
    assert.equal(t.byCode.get('2').row.olgoson_dun, null, 'үе шатын мөрд шилжүүлэх үлдэгдэлгүй');
  }

  /* ── 2026-11-24 №2: хасагдсан Q-ийн мөр (гэрээ «З/5») шинэ R-д шилжихгүй — Q-ийн мөр үлдээсэн, R шинэ мөр ── */
  {
    const e2 = registryPlanEdits(st, [zd(71, 'P'), zd(73, 'R')]);
    assert.deepEqual(e2.held, [id], 'Q-ийн гэрээтэй мөр үлдээсэн жагсаалтад');
    assert.ok(!e2.updates.some((x) => x.objectid === id && 'ajil_uilchilgee' in x), 'Q-ийн мөрийн нэр R болохгүй');
    assert.deepEqual(e2.adds.map((a) => [a.ajil_uilchilgee, a.zurag_oid]), [['R', 73]], 'R — шинэ мөр');
    const out = withRegistryRows(st, [zd(71, 'P'), zd(73, 'R')]);
    const r = out.find((x) => x.ajil_uilchilgee === 'R');
    assert.equal(r.objectid, null, 'R хүснэгтийн мөр авахгүй');
    assert.equal(r.geree_dugaar, undefined, 'R-д «З/5» гэрээ алга');
    const q = out.find((x) => x.objectid === id);
    assert.deepEqual([q.geree_dugaar, q.olgoson_dun], ['З/5', 10], 'Q-ийн мөр гэрээ, төлбөртэйгээ модонд үлдэнэ');
    const t = buildTree(out);
    assert.deepEqual(t.issues, [], 'Д/Д давхардахгүй, мод эвдрэхгүй');
    assert.equal(moneySums(t).get(t.root).paid, 10, 'олгосон дүн алга болохгүй, давхардахгүй');
  }
}

/* ── 2026-11-24 №1: үлдээсэн гэрээтэй мөрийн Д/Д бүртгэлийн мөртэй давхцвал ЧӨЛӨӨТ дугаар (урьд нь `/^d+$/` → үргэлж «.1», ашиглагдаж буй код) ── */
{
  const base = [{ objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' }];
  const zd = (oid, ner) => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: '', ner, tolov: 'Батлагдсан' });
  const st = [
    ...base,
    { objectid: 801, dd_kod: '2.1', etseg_kod: '2', ajil_uilchilgee: '1. АЖЛЫН ЗУРАГ' },
    { objectid: 802, dd_kod: '2.1.1', etseg_kod: '2.1', ajil_uilchilgee: 'A', zurag_oid: 81 },
    { objectid: 803, dd_kod: '2.1.2', etseg_kod: '2.1', ajil_uilchilgee: 'B', zurag_oid: 82, geree_dugaar: 'З/1', geree_dun: 30, ho_dungiin_tailbar: 'Гэрээлсэн дүн' },
  ];
  /* B бүртгэлээс хасагдсан; C, D нэмэгдсэн → 2.1.1 A · 2.1.2 C · 2.1.3 D — B-ийн 2.1.2 давхцана */
  const e = registryPlanEdits(st, [zd(81, 'A'), zd(83, 'C'), zd(84, 'D')]);
  assert.deepEqual(e.held, [803]);
  assert.deepEqual(e.updates.find((u) => u.objectid === 803), { objectid: 803, dd_kod: '2.1.4' }, 'чөлөөт дугаар 2.1.4 (2.1.1 биш)');
  const codes = [...st.filter((r) => !e.deletes.includes(r.objectid)).map((r) => e.updates.find((u) => u.objectid === r.objectid)?.dd_kod ?? r.dd_kod), ...e.adds.map((a) => a.dd_kod)];
  assert.equal(new Set(codes).size, codes.length, `182-т Д/Д давхардахгүй: ${codes.join(', ')}`);
  const out = withRegistryRows(st, [zd(81, 'A'), zd(83, 'C'), zd(84, 'D')]);
  assert.equal(out.find((r) => r.objectid === 803).dd_kod, '2.1.4', 'хуудасны мод ч ижил дугаартай');
  assert.deepEqual(buildTree(out).issues, []);
}

/* ── 2026-11-24 №3Б: үнэтэй үе шат — бүртгэлээс хасагдсан гэрээтэй үнэтэй зураг модонд үлдэнэ (төсөв 1030, 1010 биш);
   хувь нь бүртгэлээс тул үе шатын гүйцэтгэлд тооцохгүй ── */
{
  const base = [
    { objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' },
    { objectid: 20, dd_kod: '3', ajil_uilchilgee: 'Барилга угсралт', uy_shat: 'Барилга угсралт', ho_dun_geree: 1000 },
  ];
  const zp = (oid, ner, une, tolov = 'huleej_avsan') => toZRow({ objectid: oid, buleg: '003. АЖЛЫН ЗУРАГ', ded_buleg: '', ner, tolov, ajliin_une: une });
  let oid = 900;
  const e0 = registryPlanEdits(base, [zp(91, 'P', 10), zp(92, 'Q', 20, 'ehleegui')]);
  let st = [...base, ...e0.adds.map((x) => ({ ...x, objectid: oid++, etseg_kod: x.dd_kod.replace(/\.\d+$/, '') }))];
  const idQ = st.find((r) => r.zurag_oid === 92).objectid;
  st = st.map((r) => (r.objectid === idQ ? { ...r, geree_dugaar: 'З/9', olgoson_dun: 20 } : r));
  const raw = buildTree(st);
  assert.equal(planBudgetTotal(raw), 1030, 'хадгалсан мөрөөр 1030');
  const t = buildTree(withRegistryRows(st, [zp(91, 'P', 10)]));
  assert.equal(planBudgetTotal(t), 1030, 'хуудасны мод ч 1030 (Q хаягдахгүй)');
  assert.equal(computePlan(t).get('2').E, 30, 'үе шатын төсөв хоосрохгүй');
  assert.equal(moneySums(t).get(t.root).paid, 30, 'олгосон P 10 + Q 20');
  assert.equal(moneySums(t).get(t.root).contract, 30, 'гэрээ P 10 + Q 20');
  assert.equal(computePlan(t).get('2').S, 100, 'үлдээсэн Q (0%) үе шатын хувьд орохгүй — бүртгэлийн P 100%');
}

/* ── 2026-11-24 №8: зэрэг нэмэлтийн давхардал — бага objectid үлдэнэ, гэрээтэй мөр устахгүй ── */
{
  const { registryDupDeletes } = await import('./zuragPlan.ts');
  const r = (objectid, dd_kod, ajil_uilchilgee, zurag_oid, o = {}) => ({ objectid, dd_kod, ajil_uilchilgee, zurag_oid, ...o });
  const now = [
    r(100, '2.1', '1. АЖЛЫН ЗУРАГ', null), r(101, '2.1.1', 'A', 81), r(102, '2.1.2', 'B', 82),
    r(110, '2.1', '1. АЖЛЫН ЗУРАГ', null), r(111, '2.1.1', 'A', 81), r(112, '2.1.2', 'B', 82, { geree_dugaar: 'З/2' }),
    r(113, '2.1.3', 'C', 83),
  ];
  assert.deepEqual(registryDupDeletes(now, [110, 111, 112, 113]), [110, 111], 'өөрийн давхар нэмэлт устана; гэрээтэй 112, давхаргүй 113 үлдэнэ');
  assert.deepEqual(registryDupDeletes(now, [100, 101, 102]), [], 'бага objectid-тай тал юу ч устгахгүй');
  assert.deepEqual(registryDupDeletes(now, []), []);
}
console.log('zuragPlan.check: бүгд ✅');

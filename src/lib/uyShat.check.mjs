/**
 * ҮЕ ШАТНЫ МЭДЭЭЛЭЛ ОРУУЛАХ 4 ХУУДАС — цэвэр логик (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/uyShat.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. Хуудас бүр зөв мөр, зөв талбар: Захирамж/Ашиглалт — багцын барилгын мөр л; Сонгон — багцын мөрд огноо, навчинд явц;
 *      Зөвшөөрөл — навчинд огнооны хос + явц, багцын мөрийн доор мөр нэмнэ.
 *   2. Зөвхөн ӨӨРЧЛӨГДСӨН талбар илгээгдэнэ; null ≠ 0; буруу огноо/хувь ИЛГЭЭХГҮЙ; `guits_*` хос дутуу бол илгээхгүй,
 *      дан огноо ганцаараа зөв.
 *   3. Нэмсэн зөвшөөрлийн мөр — Зөвшөөрөл үе шатын, эцгийн багцтай, мөнгөгүй; жин тэнцүү; эцгийн явц хүүхдүүдээс.
 *   4. Зэрэг засвар илэрнэ.
 */
import assert from 'node:assert/strict';
import { buildTree, computePlan, isAddedWork } from './projectPlan.ts';
import {
  PAGES, badText, buildEdits, canAddRow, canDeleteRow, conflicts, editableFields, effectiveRows, origText, pendingCount,
  rowAdd, rowsOf, setEdit, textOf,
} from './uyShat.ts';
import { EMPTY_PENDING } from './zuragTosol.ts';

const N = { oid: 'objectid', cfId: 'cashflow_id' };
const d = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const row = (objectid, dd_kod, etseg_kod, o = {}) => ({ objectid, dd_kod, etseg_kod, ajil_uilchilgee: o.name ?? dd_kod, ...o });

/* Жижиг мод: Зөвшөөрөл (3) · Сонгон (4) · Барилга угсралт (5 → 5.2 → багц 2) */
const base = [
  row(30, '3', null, { uy_shat: 'Зөвшөөрөл', name: 'Зөвшөөрөл', tuvshin: 0 }),
  row(31, '3.2', '3', { name: 'Барилга эхлүүлэх зөвшөөрөл', tuvshin: 1 }),
  row(32, '3.2.1', '3.2', { bagts: 'Багц-1', name: 'Багц-1', tuvshin: 2 }),
  row(33, '3.2.2', '3.2', { bagts: 'Багц-2', name: 'Багц-2', tuvshin: 2, guits_ehleh: d('2026-01-01'), guits_duusah: d('2026-02-01'), guitsetgel_huvi: 50 }),
  row(40, '4', null, { uy_shat: 'Сонгон шалгаруулалт', name: 'Сонгон шалгаруулалт', tuvshin: 0 }),
  row(41, '4.1', '4', { bagts: 'Багц-1', name: 'Багц-1', tuvshin: 1 }),
  row(42, '4.1.1', '4.1', { bagts: 'Багц-1', blok: '5/1', name: '5/1', tuvshin: 2, guitsetgel_huvi: 0 }),
  row(43, '4.2', '4', { bagts: 'Багц-2', name: 'Багц-2', tuvshin: 1, guitsetgel_huvi: 100, songon_ognoo: d('2025-05-01') }),
  row(50, '5', null, { uy_shat: 'Барилга угсралт', name: 'Барилга угсралт', tuvshin: 0 }),
  row(52, '5.2', '5', { name: 'Барилга угсралт ажил', tuvshin: 1, heseg_ezleh_huvi: 0.95 }),
  row(53, '5.2.1', '5.2', { name: 'Орон сууц', tuvshin: 2 }),
  row(54, '5.2.1.1', '5.2.1', { bagts: 'Багц-1', name: 'Орон сууц', tuvshin: 3, ho_dun_geree: 100, zahiramj_ognoo: d('2025-04-01'), zahiramj_dugaar: 'А/1' }),
  row(55, '5.2.1.1.1', '5.2.1.1', { bagts: '5/1', name: '9 давхар', tuvshin: 4, ho_dun_geree: 100 }),
  row(56, '5.2.1.2', '5.2.1', { bagts: 'Багц-2', name: 'Орон сууц', tuvshin: 3, ho_dun_geree: 50 }),
];
const tree = buildTree(base);
const byCode = (c) => tree.byCode.get(c);

/* ── 1. Мөр, талбар ── */
{
  const z = rowsOf(PAGES.zahiramj, tree);
  assert.deepEqual(z.map((n) => n.row.dd_kod), ['5.2.1.1', '5.2.1.2'], 'Захирамж: багцын барилгын мөр л');
  assert.deepEqual(editableFields(PAGES.zahiramj, z[0]).map((f) => f.key), ['zahiramj_ognoo', 'zahiramj_dugaar']);
  assert.deepEqual(rowsOf(PAGES.ashiglalt, tree).map((n) => n.row.dd_kod), ['5.2.1.1', '5.2.1.2']);
  assert.deepEqual(editableFields(PAGES.ashiglalt, z[1]).map((f) => f.key), ['ashiglalt_ognoo']);

  const s = rowsOf(PAGES.songon, tree);
  assert.deepEqual(s.map((n) => n.row.dd_kod), ['4', '4.1', '4.1.1', '4.2'], 'Сонгон: үе шатын мод');
  assert.deepEqual(editableFields(PAGES.songon, byCode('4')).map((f) => f.key), [], 'үе шатын толгой засагдахгүй');
  assert.deepEqual(editableFields(PAGES.songon, byCode('4.1')).map((f) => f.key), ['songon_ognoo', 'geree_ognoo'], 'блоктой багц: огноо л');
  assert.deepEqual(editableFields(PAGES.songon, byCode('4.1.1')).map((f) => f.key), ['guitsetgel_huvi'], 'блок: явц л');
  assert.deepEqual(editableFields(PAGES.songon, byCode('4.2')).map((f) => f.key), ['songon_ognoo', 'geree_ognoo', 'guitsetgel_huvi'], 'блокгүй багц: бүгд');

  const v = rowsOf(PAGES.zovshoorolTtb, tree);
  assert.deepEqual(v.map((n) => n.row.dd_kod), ['3', '3.2', '3.2.1', '3.2.2']);
  assert.deepEqual(editableFields(PAGES.zovshoorolTtb, byCode('3.2.1')).map((f) => f.key), ['guits_ehleh', 'guits_duusah', 'guitsetgel_huvi']);
  assert.deepEqual(editableFields(PAGES.zovshoorolTtb, byCode('3.2')), [], 'бүлгийн мөр засагдахгүй');
  assert.ok(canAddRow(PAGES.zovshoorolTtb, byCode('3.2.1')), 'багцын зөвшөөрлийн мөрд нэмнэ');
  assert.ok(!canAddRow(PAGES.zovshoorolTtb, byCode('3.2')), 'бүлгийн мөрд нэмэхгүй');
  assert.ok(!canAddRow(PAGES.songon, byCode('4.2')), 'Сонгон хуудсанд нэмэхгүй');
  assert.ok(!canAddRow(PAGES.zovshoorolTtb, byCode('4.2')), 'өөр үе шатын мөрд нэмэхгүй');
  console.log('✅ 1. мөр, талбар');
}

/* ── 2. Засвар, ачаа ── */
{
  const P = PAGES.zahiramj;
  const r = base.find((x) => x.objectid === 54);
  const FD = P.fields[0], FN = P.fields[1];
  assert.equal(origText(r, FD), '2025-04-01');
  assert.equal(origText(r, FN), 'А/1');
  let p = setEdit(EMPTY_PENDING, r, FD, '2025-04-15');
  p = setEdit(p, r, FN, 'А/9');
  assert.equal(pendingCount(p), 1, 'нэг мөр');
  assert.equal(textOf(p, r, FN), 'А/9');
  p = setEdit(p, r, FN, 'А/1');
  assert.deepEqual(Object.keys(p.edits.o54), ['zahiramj_ognoo'], 'анхны утга руу буцсан талбар хасагдана');
  let e = buildEdits(P, base, p, N);
  assert.deepEqual(e.issues, []);
  assert.deepEqual(e.updates, [{ objectid: 54, zahiramj_ognoo: d('2025-04-15') }], 'зөвхөн өөрчлөгдсөн талбар, UTC шөнө дунд');
  /* дан огноо ганцаараа зөв, цэвэрлэвэл null */
  e = buildEdits(P, base, setEdit(EMPTY_PENDING, r, FD, ''), N);
  assert.deepEqual(e.updates, [{ objectid: 54, zahiramj_ognoo: null }]);
  assert.ok(badText(FD, '2025-13-01'));
  assert.ok(!badText(FN, ''), 'хоосон текст зөв');
  assert.deepEqual(buildEdits(P, base, setEdit(EMPTY_PENDING, r, FD, 'abc'), N).issues, [{ code: '5.2.1.1', kind: 'date' }]);
  assert.deepEqual(buildEdits(P, base, { ...EMPTY_PENDING, edits: { o999: { zahiramj_ognoo: '2025-01-01' } } }, N).issues, [{ code: null, kind: 'missing' }]);

  /* Сонгон: явц 0–100, null ≠ 0 */
  const S = PAGES.songon;
  const FP = S.fields[2];
  const r42 = base.find((x) => x.objectid === 42);
  assert.deepEqual(buildEdits(S, base, setEdit(EMPTY_PENDING, r42, FP, ''), N).updates, [{ objectid: 42, guitsetgel_huvi: null }], '0 → хоосон = null');
  assert.deepEqual(buildEdits(S, base, setEdit(EMPTY_PENDING, r42, FP, '101'), N).issues, [{ code: '4.1.1', kind: 'pct' }]);
  const r43 = base.find((x) => x.objectid === 43);
  assert.deepEqual(buildEdits(S, base, setEdit(EMPTY_PENDING, r43, S.fields[1], '2025-06-01'), N).updates, [{ objectid: 43, geree_ognoo: d('2025-06-01') }]);

  /* Зөвшөөрөл: огнооны хос */
  const Z = PAGES.zovshoorolTtb;
  const r32 = base.find((x) => x.objectid === 32);
  assert.deepEqual(buildEdits(Z, base, setEdit(EMPTY_PENDING, r32, Z.fields[0], '2026-03-01'), N).issues, [{ code: '3.2.1', kind: 'pair' }], 'эхлэх л — хос дутуу');
  const both = setEdit(setEdit(EMPTY_PENDING, r32, Z.fields[0], '2026-03-01'), r32, Z.fields[1], '2026-02-01');
  assert.deepEqual(buildEdits(Z, base, both, N).issues, [{ code: '3.2.1', kind: 'order' }]);
  const ok = setEdit(setEdit(EMPTY_PENDING, r32, Z.fields[0], '2026-03-01'), r32, Z.fields[1], '2026-04-01');
  assert.deepEqual(buildEdits(Z, base, ok, N).updates, [{ objectid: 32, guits_ehleh: d('2026-03-01'), guits_duusah: d('2026-04-01') }]);
  console.log('✅ 2. засвар, ачаа — зөвхөн өөрчлөгдсөн талбар · null ≠ 0 · хос · буруу оролт илгээхгүй');
}

/* ── 3. Зөвшөөрлийн мөр нэмэх — жин тэнцүү, эцгийн явц хүүхдүүдээс ── */
{
  const Z = PAGES.zovshoorolTtb;
  const n = byCode('3.2.1');
  const a1 = rowAdd(Z, n, tree, 'Барилгын ажил эхлүүлэх зөвшөөрөл');
  assert.ok(a1 && a1.dd_kod === '3.2.1.1' && a1.etseg_kod === '3.2.1' && a1.bagts === 'Багц-1' && a1.uy_shat === 'Зөвшөөрөл' && a1.cashflow_id === null, 'шинэ мөрийн утга');
  assert.equal(rowAdd(Z, n, tree, '  '), null, 'нэргүй');
  assert.equal(rowAdd(PAGES.songon, byCode('4.2'), tree, 'x'), null, 'Сонгон хуудсанд нэмэхгүй');
  let p = { ...EMPTY_PENDING, adds: [a1] };
  const t1 = buildTree(effectiveRows(Z, base, p));
  const a2 = rowAdd(Z, t1.byCode.get('3.2.1'), t1, 'Газар ашиглах зөвшөөрөл');
  assert.equal(a2.dd_kod, '3.2.1.2', 'дараагийн дугаар');
  p = { ...p, adds: [a1, a2] };
  const PCT = Z.fields[2];
  p = setEdit(p, a1, PCT, '100');
  p = setEdit(p, a2, PCT, '0');
  const t2 = buildTree(effectiveRows(Z, base, p));
  assert.ok(isAddedWork(t2.byCode.get('3.2.1.1')) && isAddedWork(t2.byCode.get('3.2.1.2')), 'Зөвшөөрөл үе шатын нэмсэн мөр');
  assert.ok(!isAddedWork(t2.byCode.get('3.2.1')), 'багцын мөр өөрөө нэмсэн ажил биш');
  const res = computePlan(t2, {}, d('2026-11-04'));
  assert.equal(res.get('3.2.1.1').F, 50, 'жин 1/2');
  assert.equal(res.get('3.2.1').S, 50, 'эцгийн явц = (100 + 0) / 2');
  assert.deepEqual(editableFields(Z, t2.byCode.get('3.2.1')), [], 'хүүхэдтэй болсон эцэг засагдахгүй');
  assert.ok(canAddRow(Z, t2.byCode.get('3.2.1')), 'дахин нэмж болно');
  assert.ok(!canAddRow(Z, t2.byCode.get('3.2.1.1')), 'нэмсэн мөрийн доор нэмэхгүй');
  const e = buildEdits(Z, base, p, N);
  assert.equal(e.adds.length, 2);
  assert.deepEqual(e.adds[0], {
    dd_kod: '3.2.1.1', etseg_kod: '3.2.1', tuvshin: 3, uy_shat: 'Зөвшөөрөл', bagts: 'Багц-1', blok: null,
    ajil_uilchilgee: 'Барилгын ажил эхлүүлэх зөвшөөрөл', heseg_ezleh_huvi: 0.5, guits_ehleh: null, guits_duusah: null, guitsetgel_huvi: 100, cashflow_id: null,
  });
  assert.deepEqual(e.updates, [], 'хадгалсан мөр өөрчлөгдөөгүй');

  /* Устгах — хадгалсан нэмсэн мөр; үлдсэний жин дахин хуваагдана */
  const saved = [...base,
    row(60, '3.2.2.1', '3.2.2', { bagts: 'Багц-2', name: 'А', tuvshin: 3, heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 100 }),
    row(61, '3.2.2.2', '3.2.2', { bagts: 'Багц-2', name: 'Б', tuvshin: 3, heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 0 }),
  ];
  const ts = buildTree(saved);
  assert.ok(canDeleteRow(Z, ts.byCode.get('3.2.2.1')));
  assert.ok(!canDeleteRow(Z, ts.byCode.get('3.2.2')), 'багцын мөр устгахгүй');
  const del = buildEdits(Z, saved, { ...EMPTY_PENDING, deletes: [60] }, N);
  assert.deepEqual(del.deletes, [60]);
  assert.deepEqual(del.updates, [{ objectid: 61, heseg_ezleh_huvi: 1 }], 'үлдсэн мөр 100% жин');
  assert.equal(pendingCount({ ...EMPTY_PENDING, deletes: [60] }), 1);
  console.log('✅ 3. зөвшөөрлийн мөр нэмэх/устгах — жин тэнцүү, эцгийн явц хүүхдүүдээс');
}

/* ── 4. Зэрэг засвар ── */
{
  const P = PAGES.ashiglalt;
  const u = [{ objectid: 54, ashiglalt_ognoo: d('2027-01-01') }];
  assert.deepEqual(conflicts(P, base, base, u, N), []);
  assert.deepEqual(conflicts(P, base, base.map((r) => (r.objectid === 54 ? { ...r, ashiglalt_ognoo: d('2027-06-01') } : r)), u, N), ['5.2.1.1'], 'өөр хүн зассан');
  assert.deepEqual(conflicts(P, base, base.map((r) => (r.objectid === 54 ? { ...r, zahiramj_dugaar: 'А/2' } : r)), u, N), [], 'бичихгүй талбар хамаагүй');
  assert.deepEqual(conflicts(P, base, base.filter((r) => r.objectid !== 54), u, N), ['5.2.1.1'], 'мөр устсан');
  console.log('✅ 4. зэрэг засвар');
}

console.log('uyShat.check: OK');

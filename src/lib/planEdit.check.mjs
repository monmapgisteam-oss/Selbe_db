/**
 * `planEdit` — «Төсөл төлөвлөгөө биелэлт»-ийн гараар оруулах дүрэм (2026-10-30).
 *   · гүйцэтгэлийн хувь — гараар оруулдаг үе шатын навчинд л; эцэг · барилга угсралт · газар засагдахгүй;
 *   · огноо/дугаар — хадгалагдсан бүх мөрд;
 *   · мөр нэмэх — гараар оруулдаг үе шатад, Д/Д давхардаагүй мөрийн доор; Д/Д-г систем олгоно (давхардахгүй);
 *   · шинэ бүлэг — жингийн нийлбэр яг 100%; байгаа мөрүүдийн дунд — жин 0;
 *   · устгах — гараар нэмсэн, дэд мөргүй, сарын мөнгөгүй мөр л;
 *   · шүүлт — тохирсон мөр + өвөг; утгын шүүлт засаж болох мөрд л.
 */
import assert from 'node:assert/strict';
import { buildTree } from './projectPlan.ts';
import {
  addWhy, deleteWhy, editWhy, filterPlan, importCutoff, isEmptyVal, isManualRow, isNewGroup, newRowAttrs,
  newRowsWhy, nextCodes, pkgOptions, NO_FILTER,
} from './planEdit.ts';

const T0 = Date.UTC(2026, 9, 26, 3);
const LATER = Date.UTC(2026, 9, 30, 5);
const rows = [
  { objectid: 1, dd_kod: '1', etseg_kod: null, tuvshin: 0, uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'ТЭЗҮ', created_date: T0 },
  { objectid: 2, dd_kod: '1.1', etseg_kod: '1', tuvshin: 1, uy_shat: 'ТЭЗҮ', bagts: 'Багц-1', ajil_uilchilgee: 'ТЭЗҮ боловсруулах',
    heseg_ezleh_huvi: 1, guitsetgel_huvi: 0, cashflow_id: 7, created_date: T0 },
  { objectid: 3, dd_kod: '2', etseg_kod: null, tuvshin: 0, uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Ажлын зураг төсөл', created_date: T0 },
  { objectid: 4, dd_kod: '2.1', etseg_kod: '2', tuvshin: 1, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-2', ajil_uilchilgee: 'Зураг',
    heseg_ezleh_huvi: 1, guitsetgel_huvi: 50, created_date: T0 },
  { objectid: 5, dd_kod: '2.1.1', etseg_kod: '2.1', tuvshin: 2, uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Гараар нэмсэн',
    heseg_ezleh_huvi: 0, created_date: LATER },
  { objectid: 6, dd_kod: '2.1.7', etseg_kod: '2.1', tuvshin: 2, uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Хуучин', created_date: T0 },
  { objectid: 7, dd_kod: '5', etseg_kod: null, tuvshin: 0, uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт', created_date: T0 },
  { objectid: 8, dd_kod: '5.1', etseg_kod: '5', tuvshin: 1, uy_shat: 'Барилга угсралт', bagts: 'Багц-1', ajil_uilchilgee: 'Багц-1 барилга', created_date: T0 },
  { objectid: 9, dd_kod: '3', etseg_kod: null, tuvshin: 0, uy_shat: 'Зөвшөөрөл', ajil_uilchilgee: 'Зөвшөөрөл А', created_date: T0 },
  { objectid: 10, dd_kod: '3', etseg_kod: null, tuvshin: 0, uy_shat: 'Зөвшөөрөл', ajil_uilchilgee: 'Зөвшөөрөл Б', created_date: T0 },
];
const tree = buildTree(rows);
const node = (oid) => tree.nodes.find((n) => n.row.objectid === oid);

/* ── Засах ── */
assert.equal(editWhy(node(2), 'pct'), null, 'ТЭЗҮ навч — гүйцэтгэл засагдана');
assert.match(editWhy(node(4), 'pct'), /Дэд мөр/, 'дэд мөртэй мөрийн хувь дэд мөрөөс бодогдоно');
assert.match(editWhy(node(8), 'pct'), /системээс/, 'барилга угсралтын гүйцэтгэл системээс');
assert.equal(editWhy(node(8), 'handoverDate'), null, 'огноо бүх мөрд засагдана');
assert.equal(editWhy(node(4), 'orderNo'), null);
assert.match(editWhy({ ...node(2), row: { ...node(2).row, objectid: null } }, 'contractDate'), /хадгалагдаагүй/);

/* ── Импортын хил · гараар нэмсэн ── */
const cut = importCutoff(rows);
assert.equal(cut, T0 + 86_400_000);
assert.equal(isManualRow(node(5).row, cut), true);
assert.equal(isManualRow(node(6).row, cut), false);
assert.equal(isManualRow(node(5).row, null), false, 'хил алга → гараар нэмсэн гэж үзэхгүй');
assert.equal(importCutoff([{ dd_kod: 'x' }]), null);

/* ── Устгах ── */
assert.equal(deleteWhy(node(5), cut), null, 'гараар нэмсэн навч устгагдана');
assert.match(deleteWhy(node(6), cut), /гараар нэмсэн/, 'импортын мөр устгахгүй');
assert.match(deleteWhy(node(2), cut), /мөнгө/, 'сарын мөнгөтэй мөр устгахгүй');
assert.match(deleteWhy(node(4), cut), /Дэд мөр/i);

/* ── Мөр нэмэх ── */
assert.equal(addWhy(tree, node(4)), null);
assert.match(addWhy(tree, node(8)), /системээс/, 'барилга угсралтад нэмэхгүй');
assert.match(addWhy(tree, node(9)), /давхардсан/, 'Д/Д давхардсан эцэг — шинэ мөр өөр мөрөнд залгагдана');
assert.equal(addWhy(tree, node(10)), null, 'давхардсан кодын хамгийн их objectid-тай мөрөнд нэмж болно');
{
  const [a] = newRowAttrs(tree, node(10), [{ name: 'Шинэ', weight: 100, pct: null }]);
  const t3 = buildTree([...rows, { ...a, objectid: 200 }]);
  const kid = t3.nodes.find((n) => n.row.objectid === 200);
  assert.equal(kid.parent.row.objectid, 10, 'шинэ мөр зөв эцэгтээ (давхардсан Д/Д)');
}
assert.deepEqual(nextCodes(tree, node(4), 2), ['2.1.8', '2.1.9'], 'хамгийн их дугаар + 1 (давхардахгүй)');
assert.deepEqual(nextCodes(tree, node(2), 1), ['1.1.1']);
assert.equal(isNewGroup(node(2)), true);
assert.equal(isNewGroup(node(4)), false);

/* шинэ бүлэг — жингийн нийлбэр 100 */
const g = (w, p = null, name = 'А-даалгавар') => ({ name, weight: w, pct: p });
assert.equal(newRowsWhy(node(2), [g(25), g(25), g(50)]), null);
assert.match(newRowsWhy(node(2), [g(25), g(25)]), /100%/);
assert.match(newRowsWhy(node(2), [g(null)]), /жин/i);
assert.match(newRowsWhy(node(2), [g(100, null, '  ')]), /нэр/);
assert.match(newRowsWhy(node(2), [g(100, 120)]), /0–100/);
assert.equal(newRowsWhy(node(2), [g(33.33), g(33.33), g(33.34)]), null, 'бутархай нийлбэр хүлцэлтэй');
/* байгаа мөрүүдийн дунд — жин шаардахгүй */
assert.equal(newRowsWhy(node(4), [g(null)]), null);
assert.match(newRowsWhy(node(4), []), /алга/);

const adds = newRowAttrs(tree, node(2), [g(40, 10, ' Загвар '), g(60)]);
assert.deepEqual(adds[0], {
  dd_kod: '1.1.1', etseg_kod: '1.1', tuvshin: 2, uy_shat: 'ТЭЗҮ', bagts: 'Багц-1',
  ajil_uilchilgee: 'Загвар', heseg_ezleh_huvi: 0.4, guitsetgel_huvi: 10,
}, 'жин 0–1 бутархайгаар, нэр тайрагдсан');
assert.equal(adds[1].dd_kod, '1.1.2');
assert.equal(newRowAttrs(tree, node(4), [g(70)])[0].heseg_ezleh_huvi, 0, 'байгаа мөрүүдийн дунд — жин 0');

/* шинэ мөрүүд модонд зөв эцэгтэйгээ орно */
const t2 = buildTree([...rows, ...adds.map((a, i) => ({ ...a, objectid: 100 + i }))]);
const p2 = t2.nodes.find((n) => n.row.objectid === 2);
assert.deepEqual(p2.children.map((c) => c.code), ['1.1.1', '1.1.2']);
assert.equal(p2.children[0].phase, 'tezu');

/* ── Шүүлт ── */
assert.deepEqual(pkgOptions(tree).map((o) => o.label), ['Багц-1', 'Багц-2']);
const codes = (f) => [...filterPlan(tree, { ...NO_FILTER, ...f })].map((n) => n.row.objectid).sort((a, b) => a - b);
assert.deepEqual(codes({ name: 'гараар' }), [3, 4, 5], 'тохирсон мөр + өвөг');
const pk2 = pkgOptions(tree).find((o) => o.label === 'Багц-2').key;
assert.deepEqual(codes({ pkg: pk2 }), [3, 4, 5, 6], 'багцаар (өвгийн багцыг өвлөсөн дэд мөр ч)');
assert.deepEqual(codes({ fill: { pct: 'empty' } }), [1, 2, 3, 4, 5, 6, 9, 10], '0/хоосон хувьтай, засаж болох навч + өвөг (4 нь эцэг)');
assert.deepEqual(codes({ fill: { pct: 'filled' } }), [], 'утгатай засагдах хувь алга (2.1 нь эцэг)');
assert.equal(isEmptyVal('pct', 0), true);
assert.equal(isEmptyVal('orderNo', 0), false);
assert.equal(isEmptyVal('orderNo', '  '), true);

console.log('planEdit.check ✓');

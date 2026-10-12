/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» → EXCEL — цэвэр хэсгийн шалгуур (мөр/багана → workbook загвар), хуурамч өгөгдлөөр.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/sheet.xlsx.check.mjs
 *
 * ⚠️ 2026-10-12: толгойн бүтэц (4 мөр · 14 + 4n + extra багана · нэгдсэн нүд) · бүсийн нэгдсэн нүд ·
 *    бүлгийн тод/догол · хувь (0–1, `0.0%`) ба обьём (тоо + нэгжийн формат) · null → хоосон, 0 → 0 ·
 *    ноорог/буцаагдсан/зөвшөөрсөн өнгө · горим (обьём ↔ хувь) · синтетик ба блокгүй толгой ·
 *    «Мэдээлэл» хуудас · файлын нэр · FillNew-ийн товч (эх кодын гэрээ) · buildXlsx-ээр угсрагдана.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFillWorkbook, buildHeader, buildRow, colWidths, fillXlsxName, qtyFmt } from './fill/sheetXlsx.ts';
import { computeAll } from './bagtsSheet.ts';
import { seriesBands } from './bagts.bands.ts';
import { buildXlsx } from '../../lib/xlsx.ts';

/* ── Хуурамч өгөгдөл — 2 блок (5/1 · 6/1 → хоёр цуваа), 1 бүлэг + 2 ажил ── */
const sc = { bld: ['5/1', '6/1'], synthetic: false, f: { plannedVol: 'Инженерийн_төлөвлөсөн_обьём' }, obyem: ['a', 'b'], act: ['x', 'y'], start: ['s1', 's2'], end: ['e1', 'e2'] };
const row = (oid, no, work, group, depth, o = {}) => ({
  oid, no, des: null, ham: null, work, depth, group, wC: null, wD: null, vol: null, plannedVol: null, unit: null, money: null,
  act: [null, null], obyem: [null, null], raw: {}, start: [null, null], end: [null, null],
  gStart: [null, null], gEnd: [null, null], aStart: [null, null], aEnd: [null, null], hun: null, mashin: null, ...o,
});
const D = (s) => Date.parse(s + 'T00:00:00Z');
const rowsAll = [
  row(10, 'Б. Барилга угсралтын ажил', '', true, 0),
  row(11, '1.1', 'Бетон цутгах ажил', false, 1, { vol: 1300, unit: 2, money: 2600, obyem: [650, null], act: [0.5, null], start: [D('2026-05-01'), null], end: [D('2026-08-01'), null], plannedVol: 1200 }),
  row(12, '1.2', 'Тоосго өрөх', false, 1, { vol: 0, unit: 3, obyem: [0, null], act: [0, null], raw: { bodit_ehleh: D('2026-06-02') } }),
];
const asOf = D('2026-06-15');
const pending = { '11:1': '+100' };
const calc = computeAll(rowsAll, 2, asOf, pending, {}, [true, true], undefined, 'inc');
const bands = seriesBands('b42_9f', sc.bld);
assert.equal(bands.length, 2, 'хоёр цуваа');
const extra = [{ key: 'aS', field: 'bodit_ehleh', kind: 'day', label: () => 'Бодит эхэлсэн', wKey: 'x-aS', wStyle: { width: '', minWidth: '', maxWidth: '' } }];
const base = {
  pkg: { label: 'Багц 4-2 · 9 давхар', group: 'Багц 4-2', floors: 9 },
  sc, bands, rowsAll, calc, vis: [0, 1, 2], fillMode: 'obyem', asOf, asOfOrig: asOf, extra,
  pvPend: {}, pvPreview: null, pending, pendDate: {},
  backChg: new Set(), backOk: new Set(), backChgDates: new Set(),
  info: { day: '2026-10-12', snapDay: '2026-10-10', filters: 'Бүлэг: Бүгд', user: 'tumen', locked: false, now: new Date(2026, 9, 12, 14, 5) },
};
const val = (cell) => (cell != null && typeof cell === 'object' ? cell.v : cell);
const sty = (cell) => (cell != null && typeof cell === 'object' ? cell.s ?? {} : {});

/* ── 1. Толгой — 4 мөр · 14 + 8 + 1 багана · нэгдсэн нүд ── */
{
  const h = buildHeader(sc, bands, extra);
  assert.equal(h.nHead, 4);
  assert.equal(h.rows.length, 4);
  for (const r of h.rows) assert.equal(r.length, 14 + 2 * 4 + 1, 'баганын тоо = 14 + 4n + extra');
  const r0 = h.rows[0].map(val);
  assert.deepEqual(r0.slice(0, 13), ['№', 'Ажил', 'Хувийн жин', 'Хувийн жин (нийт)', 'Одоо байгаа хувийн жин', 'Обьём', 'Инж. төлөвлөсөн обьём', 'Обьёмын нийлбэр', 'Нэгж өртөг', 'Мөнгөн дүн', 'Төлөвлөгөөт гүйцэтгэл', 'Бодит гүйцэтгэл', 'Төлөвлөгөө биелэлт'], 'тогтмол баганууд SheetHead-ийн дарааллаар');
  assert.equal(r0[13], 'Ажил гүйцэтгэл — обьём / хувь (2 барилга)');
  assert.equal(r0[15], 'Төлөвлөгөөт гүйцэтгэл (2 барилга)');
  assert.equal(r0[17], 'Төлөвлөгөөт хуваарь (2 барилга)');
  assert.equal(r0[21], 'Шинэчлэгдсэн огноо');
  assert.equal(r0[22], 'Бусад талбар');
  /* 2-р мөр — цуваа («71 айл 9 давхар» · «71 айл 12 давхар») гурван бүлэгт */
  const r1 = h.rows[1].map(val);
  assert.equal(r1[13], '71 айл 9 давхар'); assert.equal(r1[14], '71 айл 12 давхар');
  assert.equal(r1[15], '71 айл 9 давхар'); assert.equal(r1[16], '71 айл 12 давхар');
  assert.equal(r1[17], '71 айл 9 давхар'); assert.equal(r1[19], '71 айл 12 давхар');
  assert.equal(r1[22], 'Бодит эхэлсэн', 'extra баганын нэр 2-р мөрөнд');
  /* 3-р мөр — блокийн код · 4-р мөр — Эхлэх/Дуусах */
  const r2 = h.rows[2].map(val);
  assert.deepEqual(r2.slice(13, 21), ['5/1', '6/1', '5/1 барилга', '6/1 барилга', '5/1 барилга', null, '6/1 барилга', null]);
  assert.deepEqual(h.rows[3].map(val).slice(17, 21), ['Эхлэх', 'Дуусах', 'Эхлэх', 'Дуусах']);
  /* Нэгдсэн нүд */
  const has = (m) => h.merges.some((x) => x.r1 === m.r1 && x.c1 === m.c1 && x.r2 === m.r2 && x.c2 === m.c2);
  assert.ok(has({ r1: 0, c1: 0, r2: 3, c2: 0 }), '№ 4 мөр');
  assert.ok(has({ r1: 0, c1: 1, r2: 3, c2: 1 }), 'Ажил 4 мөр');
  assert.ok(has({ r1: 0, c1: 13, r2: 0, c2: 14 }), 'Ажил гүйцэтгэл бүлэг n багана');
  assert.ok(has({ r1: 0, c1: 17, r2: 0, c2: 20 }), 'хуваарь 2n багана');
  assert.ok(has({ r1: 1, c1: 17, r2: 1, c2: 18 }), 'огнооны цуваа count×2');
  assert.ok(has({ r1: 2, c1: 13, r2: 3, c2: 13 }), 'блокийн код 3–4-р мөр');
  assert.ok(has({ r1: 2, c1: 17, r2: 2, c2: 18 }), 'огнооны блок 2 багана');
  assert.ok(has({ r1: 0, c1: 21, r2: 3, c2: 21 }), 'Шинэчлэгдсэн огноо 4 мөр');
  assert.ok(has({ r1: 1, c1: 22, r2: 3, c2: 22 }), 'extra 2–4-р мөр');
  assert.ok(!has({ r1: 0, c1: 22, r2: 0, c2: 22 }), 'ганц extra-д 1-р мөрийн colSpan=1 merge үүсэхгүй');
  /* Нэг цуваатай багц — 2-р мөр бүтнээрээ нэг нэгдсэн нүд */
  const sc1 = { ...sc, bld: ['5/1', '5/2'] };
  const h1 = buildHeader(sc1, seriesBands('b1_9f', sc1.bld), []);
  assert.equal(val(h1.rows[1][13]), '71 айл 9 давхар');
  assert.ok(h1.merges.some((m) => m.r1 === 1 && m.c1 === 13 && m.c2 === 14), 'нэг цуваа n баганыг хамарна');
  assert.equal(h1.rows[0].length, 14 + 8, 'extra-гүй');
  assert.ok(sty(h.rows[0][0]).bold && sty(h.rows[0][13]).fill, 'толгой тод, бүс өнгөтэй');
}
console.log('✅ толгой — 4 мөр · багана · бүсийн нэгдсэн нүд · блок · Эхлэх/Дуусах · extra');

/* ── 2. Синтетик ба блокгүй толгой ── */
{
  const syn = buildHeader({ bld: ['*'], synthetic: true, f: { plannedVol: null } }, [], []);
  assert.equal(syn.nHead, 2);
  assert.deepEqual(syn.rows[0].map(val).slice(13, 18), ['Ажил гүйцэтгэл', 'Төлөвлөгөөт гүйцэтгэл', 'Төлөвлөгөөт хуваарь', null, 'Шинэчлэгдсэн огноо']);
  assert.deepEqual(syn.rows[1].map(val).slice(13, 17), ['Обьём (нийт · +энэ удаа)', '%', 'Эхлэх', 'Дуусах']);
  assert.ok(syn.merges.some((m) => m.r1 === 0 && m.c1 === 15 && m.c2 === 16), 'хуваарь 2 багана');
  assert.ok(syn.merges.some((m) => m.r1 === 0 && m.c1 === 0 && m.r2 === 1), '№ 2 мөр');
  const none = buildHeader({ bld: [], synthetic: false, f: { plannedVol: null } }, [], []);
  assert.equal(none.nHead, 1, 'блокгүй · extra-гүй → 1 мөр');
  assert.equal(none.rows[0].length, 14);
  assert.equal(none.merges.length, 0, 'нэг мөрт толгойд merge байхгүй');
  const noneX = buildHeader({ bld: [], synthetic: false, f: { plannedVol: null } }, [], extra);
  assert.equal(noneX.nHead, 2, 'блокгүй + extra → 2 мөр');
  assert.equal(val(noneX.rows[1][14]), 'Бодит эхэлсэн');
}
console.log('✅ синтетик (2 мөр) · блокгүй (1 мөр · +extra 2 мөр)');

/* ── 3. Мөр — бүлгийн тод/догол · хувь/обьём формат · null хоосон · 0 → 0 ── */
{
  const g = buildRow(base, 0);
  assert.equal(g.length, 23);
  assert.equal(val(g[0]), 'Б. Барилга угсралтын ажил', '№ нь бүтэн гарчиг');
  assert.equal(val(g[1]), 'Б. Барилга угсралтын ажил', 'Ажил хоосон бол гарчиг Ажил нүдэнд (FillRows.workTxt)');
  assert.ok(sty(g[1]).bold && !sty(g[1]).indent, 'бүлэг тод, гүн 0 → доголгүй');
  assert.ok(sty(g[1]).fill, 'бүлгийн мөр өнгөтэй');
  assert.equal(val(g[5]), null, 'бүлгийн Обьём null → хоосон');
  assert.equal(val(g[7]), null, 'бүлгийн обьёмын нийлбэр null → хоосон (0 биш)');

  const a = buildRow(base, 1);
  assert.equal(val(a[0]), '1.1');
  assert.equal(val(a[1]), 'Бетон цутгах ажил');
  assert.equal(sty(a[1]).indent, 1, 'ажлын мөр гүнээр догол');
  assert.ok(!sty(a[1]).bold);
  /* Жин — 0–1 бутархай, 0.00% */
  assert.ok(val(a[2]) > 0 && val(a[2]) <= 1 && sty(a[2]).numFmt === '0.00%', 'Хувийн жин 0–1 + 0.00%');
  /* Обьём — тоо + нэгж (м³ — «бетон цутгах») */
  assert.equal(val(a[5]), 1300);
  assert.equal(sty(a[5]).numFmt, '#,##0 "м³"', 'обьём бүхэл → #,##0 + нэгж');
  assert.equal(val(a[6]), 1200, 'Инж. төлөвлөсөн обьём хадгалсан утга');
  /* ⚠️ Мөнгөн дүн — дэлгэц `qty(r.money)` (хадгалсан утга), бодогдсон `c.H` БИШ — FillRows-тэй ижил */
  assert.equal(val(a[8]), 2); assert.equal(val(a[9]), 2600, 'Мөнгөн дүн хадгалсан утгаараа');
  assert.equal(sty(a[9]).numFmt, '#,##0');
  /* I/J/K — 0.0% */
  assert.equal(sty(a[11]).numFmt, '0.0%');
  /* Гүйцэтгэлийн нүд (обьём горим): блок 1 = 650 (илгээгдсэн), блок 2 = ноорог +100 → 100 (цэнхэр) */
  assert.equal(val(a[13]), 650); assert.equal(sty(a[13]).numFmt, '#,##0 "м³"');
  assert.ok(!sty(a[13]).fill, 'илгээгдсэн нүд өнгөгүй');
  assert.equal(val(a[14]), 100, 'ноорогтой нүд НООРОГИЙН утгаар (суурь null + 100)');
  assert.equal(sty(a[14]).fill, 'D5ECF0', 'ноорог — цэнхэр');
  /* Төлөвлөгөөт — 0.0% */
  assert.ok(val(a[15]) > 0 && val(a[15]) < 1 && sty(a[15]).numFmt === '0.0%', 'төлөвлөгөөт хувь (огнооны интерполяци)');
  assert.equal(val(a[16]), null, 'огноогүй блок → төлөвлөгөөт хоосон');
  /* Огноо — текст YYYY-MM-DD */
  assert.deepEqual([val(a[17]), val(a[18]), val(a[19]), val(a[20])], ['2026-05-01', '2026-08-01', null, null]);
  /* Шинэчлэгдсэн огноо — зөвхөн i === 0 */
  assert.equal(val(a[21]), null, 'asOf зөвхөн эхний мөрд');
  assert.equal(val(g[21]), '2026-06-15', 'asOf эхний мөрд');
  assert.equal(val(a[22]), null, 'extra хоосон');

  const z = buildRow(base, 2);
  assert.equal(val(z[5]), 0, 'Обьём 0 → 0 (null ≠ 0)');
  assert.equal(val(z[13]), 0, 'гүйцэтгэл 0 → 0');
  assert.equal(val(z[22]), '2026-06-02', 'extra огноо (Бодит эхэлсэн)');
  assert.equal(buildRow(base, 99), null, 'байхгүй индекс → null');
}
console.log('✅ мөр — бүлэг тод/догол · 0–1 хувь · обьём + нэгж · null хоосон · 0 → 0 · ноорог өнгө');

/* ── 4. Хувь горим · буцаагдсан/зөвшөөрсөн · хянагчийн харагдац · огнооны ноорог · pv ноорог ── */
{
  const p = buildRow({ ...base, fillMode: 'pct' }, 1);
  assert.equal(val(p[13]), 0.5, 'хувь горимд act (0–1)');
  assert.equal(sty(p[13]).numFmt, '0.0%');
  const b = buildRow({ ...base, backChg: new Set(['11:5/1', '11:6/1']), backOk: new Set(['11:6/1']), backChgDates: new Set(['11:0:s']), pendDate: { '11:0:e': '2026-09-01' } }, 1);
  assert.equal(sty(b[13]).fill, 'FBE0DF', 'буцаагдсан (засах) — улаан');
  assert.equal(sty(b[14]).fill, 'DCF3E3', 'зөвшөөрсөн — ногоон (ноорогоос давамгайлна)');
  assert.equal(sty(b[17]).fill, 'FBE0DF', 'өөрчлөгдсөн огноо — улаан');
  assert.equal(sty(b[18]).fill, 'D5ECF0', 'ноорогтой огноо — цэнхэр');
  const v = buildRow({ ...base, viewChanged: new Set(['1:5/1']), viewOk: new Set(['1:5/1']) }, 1);
  assert.equal(sty(v[13]).fill, 'DCF3E3', 'хянагчийн харагдац `${i}:${шошго}` түлхүүрээр');
  const pv = buildRow({ ...base, pvPend: { 11: '1500' } }, 1);
  assert.equal(val(pv[6]), 1500, 'Инж. төлөвлөсөн обьёмын ноорог харагдана');
  assert.equal(sty(pv[6]).fill, 'D5ECF0');
  const pv2 = buildRow({ ...base, pvPend: { 11: 'abc' } }, 1);
  assert.equal(val(pv2[6]), 1200, 'тоо биш ноорог → хадгалсан (PvCell.shown)');
  const pv3 = buildRow({ ...base, pvPreview: new Map([[11, 1400]]) }, 1);
  assert.equal(val(pv3[6]), 1400, 'илгээгдсэн урьдчилсан утга');
  const ao = buildRow({ ...base, asOfOrig: null }, 0);
  assert.equal(sty(ao[21]).fill, 'D5ECF0', 'өөрчилсөн asOf — ноорогийн өнгө');
}
console.log('✅ хувь горим · улаан/ногоон · хянагчийн түлхүүр · огнооны ноорог · pv ноорог');

/* ── 5. Workbook — шүүлт/эвхэлт (`vis`) · хөлдөөлт · өргөн · Мэдээлэл · buildXlsx ── */
{
  const wb = buildFillWorkbook({ ...base, vis: [0, 2] });
  assert.equal(wb.length, 2);
  assert.equal(wb[0].name, 'Гүйцэтгэл');
  assert.equal(wb[0].rows.length, 4 + 2, 'толгой 4 + зөвхөн vis мөрүүд');
  assert.equal(val(wb[0].rows[5][0]), '1.2', 'нуугдсан мөр (1) орохгүй');
  assert.deepEqual(wb[0].frozen, { rows: 4, cols: 2 }, 'толгой + №/Ажил хөлдөнө');
  assert.equal(wb[0].cols.length, 23);
  assert.deepEqual(colWidths(0, []).length, 14);
  assert.equal(wb[1].name, 'Мэдээлэл');
  const info = Object.fromEntries(wb[1].rows.map((r) => [val(r[0]), val(r[1])]));
  assert.equal(info['Багц'], 'Багц 4-2 · 9 давхар');
  assert.equal(info['Хувилбар'], '9F');
  assert.equal(info['Огноо'], '2026-10-12');
  assert.equal(info['Шинэчлэгдсэн огноо'], '2026-06-15');
  assert.equal(info['Өгөгдлийн огноо'], '2026-10-10');
  assert.equal(info['Горим'], 'Обьём');
  assert.equal(info['Шүүлт'], 'Бүлэг: Бүгд');
  assert.equal(info['Мөр'], '2');
  assert.equal(info['Татсан огноо-цаг'], '2026-10-12 14:05');
  assert.equal(info['Хэрэглэгч'], 'tumen');
  const wb2 = buildFillWorkbook({ ...base, info: { ...base.info, locked: true, snapDay: '', user: '' }, pkg: { label: 'Багц 5.1', group: 'Багц 5.1', floors: null } });
  const info2 = Object.fromEntries(wb2[1].rows.map((r) => [val(r[0]), val(r[1])]));
  assert.equal(info2['Горим'], 'Хяналтын харагдац');
  assert.equal(info2['Хувилбар'], '—'); assert.equal(info2['Өгөгдлийн огноо'], '—'); assert.equal(info2['Хэрэглэгч'], '—');
  /* buildXlsx-ээр угсрагдана — ZIP гарын үсэгтэй, бүх merge хүчинтэй */
  const bytes = buildXlsx(wb);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const xml = new TextDecoder().decode(bytes);
  assert.ok(xml.includes('<pane xSplit="2" ySplit="4" topLeftCell="C5"'), 'хөлдөөлт sheet1-д');
  assert.ok(xml.includes('formatCode="0.0%"') && xml.includes('&quot;м³&quot;'), 'форматууд styles-д');
  assert.ok(xml.includes('Бетон цутгах ажил') === false, 'нуугдсан мөр файлд байхгүй');
  assert.ok(xml.includes('Тоосго өрөх'), 'харагдах мөр файлд');
}
console.log('✅ workbook — vis мөрүүд · хөлдөөлт · Мэдээлэл · buildXlsx');

/* ── 6. Формат · файлын нэр ── */
assert.equal(qtyFmt(1300, null), '#,##0');
assert.equal(qtyFmt(1300.0004, 'м³'), '#,##0 "м³"', '3 орноор бөөрөнхийлөхөд бүхэл');
assert.equal(qtyFmt(12.5, 'тн'), '#,##0.### "тн"');
assert.equal(fillXlsxName({ group: 'Багц 4-2', floors: 9 }, '2026-10-12'), 'Гүйцэтгэл_Багц_4-2_9F_2026-10-12.xlsx');
assert.equal(fillXlsxName({ group: 'Багц 5.1', floors: null }, '2026-10-12'), 'Гүйцэтгэл_Багц_5.1_2026-10-12.xlsx', 'хувилбаргүй');
assert.match(fillXlsxName({ group: 'A/B:C', floors: 12 }, ''), /^Гүйцэтгэл_A_B_C_12F_\d{4}-\d{2}-\d{2}\.xlsx$/, 'хориотой тэмдэгт · өдөргүй бол өнөөдөр');
console.log('✅ формат · файлын нэр');

/* ── 7. FillNew — «Excel» товч (эх кодын гэрээ): vis/sc/bands/calc/ноорог дамжина, ачаалаагүй үед идэвхгүй ── */
{
  const FN = fs.readFileSync('src/modules/sheet/FillNew.tsx', 'utf8');
  assert.ok(FN.includes('import { downloadFillXlsx } from "./fill/sheetXlsx";'), 'FillNew: sheetXlsx импортгүй');
  const fn = FN.slice(FN.indexOf('const exportXlsx = useCallback'), FN.indexOf('[sc, bands, rowsAll, calc, vis,'));
  for (const k of ['vis', 'bands', 'calc', 'pending', 'pendDate', 'pvPend', 'pvPreview', 'backChg', 'backOk', 'backChgDates', 'view?.changed', 'view?.ok', 'extra', 'asOfOrig', 'fillMode']) {
    assert.ok(fn.includes(k), `exportXlsx-д «${k}» дамжихгүй`);
  }
  assert.ok(FN.includes("tr('Excel татах')"), 'товчны шошго');
  assert.ok(/disabled=\{!sc \|\| rows\.length === 0 \|\| calc\.length === 0 \|\| busy\}/.test(FN), 'ачаалаагүй/хоосон үед товч идэвхгүй биш');
  /* ⚠️ 2026-10-12 (хэрэглэгчийн шийдвэр): товч ЗӨВХӨН super админд (`unrestricted`) — бусдад огт зурагдахгүй */
  assert.ok(/\{unrestricted && \(\s*<button[\s\S]{0,400}tr\('Excel татах'\)/.test(FN), 'Excel товч `unrestricted`-ээр хаагдаагүй — super-ээс бусдад харагдана');
}
console.log('✅ FillNew — Excel товч · одоогийн харагдац дамжина · идэвхгүй нөхцөл');

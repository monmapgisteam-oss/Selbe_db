/**
 * ОБЬЁМ ↔ ХУВЬ ГОРИМЫН ГЭРЭЭ (2026-09-06).
 *
 * Нүдний засвар нь `pending`/`Draft.cells`/`SubmissionPayload.cells` гэсэн
 * НЭГ мөрөн сувгаар явдаг тул утгын ДҮРМИЙГ энд бэхлэв:
 *
 *     "12.5"  → ОБЬЁМ
 *     "%50"   → ХУВЬ (50%)
 *
 * ⚠️ Энэ дүрэм эвдэрвэл ноорог, илгээлт, overlay гурвуулаа чимээгүй буруу
 * уншина: «%50» гэсэн мөр обьём гэж уншигдвал 0 болж, хагас өдрийн ажил
 * алга болно. Тиймээс сүлжээгүй, цэвэр функцээр шалгана.
 *
 * ⚠️ React импортлохгүй — Node дээр шууд ачаалагдана.
 */
import assert from 'node:assert/strict';
import {
  cellObyem, cellPct, computeAll, editPct, isPctEdit,
} from './bagtsSheet.ts';

/** Хамгийн бага SheetRow — тооцоонд оролцох талбарууд л */
const row = (o) => ({
  oid: o.oid ?? 1,
  no: '1', des: 1, ham: null, work: 'ажил', depth: 4, group: false,
  wC: 1, wD: null, vol: o.vol ?? null, unit: null, money: null,
  act: o.act ?? [null], obyem: o.obyem ?? [null],
  start: [null], end: [null], raw: {},
});

/* ══════════════ 1. Утгын дүрэм ══════════════ */

assert.equal(isPctEdit('%50'), true, '«%50» нь хувь');
assert.equal(isPctEdit(' %50'), true, 'урд зайтай ч хувь');
assert.equal(isPctEdit('50'), false, 'угтваргүй нь обьём');
assert.equal(isPctEdit(undefined), false, 'засваргүй');

assert.equal(editPct('%50'), 0.5, '50% → 0.5');
assert.equal(editPct('%0'), 0, '0% → 0');
assert.ok(Math.abs(editPct('%309.9') - 3.099) < 1e-9, '100%-иас их утгыг ХАДГАЛНА');
assert.equal(editPct('%-5'), 0, 'сөрөг → 0');
assert.equal(editPct('%'), null, 'зөвхөн тэмдэг → null');
assert.equal(editPct('%abc'), null, 'тоо биш → null');
assert.equal(editPct('50'), null, 'обьёмын мөр → null');

/* ══════════════ 2. cellObyem — хоёр чиглэл ══════════════ */

const withVol = row({ oid: 7, vol: 200, obyem: [50] });
const k = '7:0';

assert.equal(cellObyem(withVol, 0, {}), 50, 'засваргүй → хадгалагдсан');
assert.equal(cellObyem(withVol, 0, { [k]: '80' }), 80, 'обьёмоор шууд');
assert.equal(cellObyem(withVol, 0, { [k]: '%25' }), 50, 'хувиар → 25% × 200 = 50');
assert.equal(cellObyem(withVol, 0, { [k]: '' }), null, 'хоосон → null');
assert.equal(cellObyem(withVol, 0, { [k]: '-9' }), 0, 'сөрөг обьём → 0');

assert.equal(cellPct(withVol, 0, { [k]: '%25' }), 0.25, 'cellPct нь хувийг өгнө');
assert.equal(cellPct(withVol, 0, { [k]: '80' }), null, 'обьёмын засварт cellPct null');

/**
 * ⚠️ Мөрийн «Обьём» БАЙХГҮЙ мөр — ХУВЬ горимын ГОЛ зорилго. Амьд өгөгдөлд
 * ийм навч 550 (нийтийн 4.4%, Багц 3.1-д 362 буюу 26.3%) бөгөөд тэдгээрийг
 * урьд нь БӨГЛӨХ БОЛОМЖГҮЙ байв: обьём бичсэн ч хувь бодогдохгүй, хувь
 * бичих зам байхгүй.
 */
const noVol = row({ oid: 9, vol: null, obyem: [null], act: [0.1] });
assert.equal(cellObyem(noVol, 0, { '9:0': '%75' }), null,
  'Обьёмгүй мөрд обьёмыг ТААМАГЛАХГҮЙ — хадгалагдсан хэвээр');
assert.equal(cellPct(noVol, 0, { '9:0': '%75' }), 0.75,
  'Обьёмгүй мөрд ХУВЬ нь бичигдэнэ');

/* ══════════════ 3. computeAll — гараар бичсэн хувь ДАВАМГАЙЛНА ══════════════ */

const rows = [withVol];
const hasOb = [true];
const cVol = computeAll(rows, 1, null, { [k]: '100' }, {}, hasOb);
const cPct = computeAll(rows, 1, null, { [k]: '%50' }, {}, hasOb);

assert.equal(cVol[0].act[0], 0.5, 'обьём 100 ÷ 200 = 50%');
assert.equal(cPct[0].act[0], 0.5, 'хувь 50% шууд');
assert.equal(cVol[0].obyem[0], 100, 'обьём горим: 100');
assert.equal(cPct[0].obyem[0], 100, 'хувь горим: 50% × 200 = 100');
assert.equal(cVol[0].J, cPct[0].J,
  'мөрийн J ИЖИЛ — хоёр чиглэл доод урсгалд ялгаагүй');

/* Обьёмгүй мөрд гараар бичсэн хувь нь ХАДГАЛАГДСАН хувийг дарна */
const cNo = computeAll([noVol], 1, null, { '9:0': '%75' }, {}, [true]);
assert.equal(cNo[0].act[0], 0.75, 'гараар бичсэн хувь давамгайлав (0.1 биш)');

/* ══════════════ 4. 100%-иас их — НУУХГҮЙ, ТАРААХГҮЙ ══════════════ */

const cOver = computeAll(rows, 1, null, { [k]: '%150' }, {}, hasOb);
assert.equal(cOver[0].act[0], 1.5, 'нүдэнд 150% ХЭВЭЭР — алдааг нуухгүй');
assert.equal(cOver[0].actAgg[0], 1, 'нэгтгэлд 100%-иар таслагдана');
assert.equal(cOver[0].actOver[0], true, 'анхааруулгын туг асна');

console.log('pct.check: ok — дүрэм ✓ хоёр чиглэл ✓ Обьёмгүй мөр ✓ 100%+ ✓');

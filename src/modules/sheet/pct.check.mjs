/**
 * ОБЬЁМ ↔ ХУВЬ ГОРИМЫН ГЭРЭЭ (2026-09-06).
 *
 * Нүдний засвар нь `pending`/`Draft.cells`/`SubmissionPayload.cells` гэсэн
 * НЭГ мөрөн сувгаар явдаг тул утгын ДҮРМИЙГ энд бэхлэв:
 *
 *     "12.5"  → ОБЬЁМ
 *     "%50"   → ХУВЬ (50%)
 */
import assert from 'node:assert/strict';
import {
  VOL_HALF_UNIT, cellObyem, cellPct, computeAll, editPct, isPctEdit, overVolume,
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

/* Бөөрөнхийлсөн Обьём — 100.0028% нь хэтрэлт биш; жинхэнэ хэтрэлт туг асаасан хэвээр */
{
  const near = [{ oid: 1, no: '1', work: 'x', depth: 0, group: false, wC: null, wD: null, vol: 10.6667, plannedVol: null, unit: null, money: null, act: [null], obyem: [10.667], raw: {}, start: [null], end: [null], gStart: [null], gEnd: [null], aStart: [null], aEnd: [null], hun: null, mashin: null, des: null, ham: null }];
  assert.equal(computeAll(near, 1, null, {}, {}, [true])[0].actOver[0], false, 'бөөрөнхийллийн зөрүү тугалахгүй');
  assert.equal(computeAll([{ ...near[0], obyem: [10.68] }], 1, null, {}, {}, [true])[0].actOver[0], true, '100.12% — туг асна');
}

/* Дэлгэцийн нэгжийн хагас (2026-11-09) — `qty()` 3 оронтой тул 0.0005 хүртэлх илүү «100%» харагдаж тугтай болдог байв */
{
  const over = (vol, ob, edits = {}, mode) => computeAll([row({ vol, obyem: [ob] })], 1, null, edits, {}, [true], undefined, mode)[0].actOver[0];
  assert.equal(VOL_HALF_UNIT, 0.0005, 'хагас нэгж = 0.5 · 10^-QTY_DEC');
  assert.equal(over(2.09069539, 2.091), false, '2.091 ÷ 2.09069539 (+0.0003) — туг асахгүй');
  assert.equal(over(0.00479951, 0.0048), false, '0.0048 ÷ 0.00479951 (+0.0000005, харьцангуй 0.01%) — туг асахгүй');
  assert.equal(over(0.00479951, 0.0048, {}, 'inc'), false, 'нэмэлтийн горимд ч мөн');
  assert.equal(over(1, 1.0006), true, 'хагас нэгжээс их илүү — туг асна');
  assert.equal(over(0.12, 2.4), true, 'жинхэнэ хэтрэлт 2.4 ÷ 0.12');
  assert.equal(over(0.12, 2.4, {}, 'inc'), true);
  assert.equal(over(0.00479951, 0.0048, { '1:0': '%100.02' }), true, 'гараар бичсэн хувь — хувиар хэвээр');
  assert.equal(overVolume(2.09069539, 2.091), false);
  assert.equal(overVolume(0.12, 2.4), false, 'дараалал: (хуримтлал, Обьём)');
  assert.equal(overVolume(2.4, 0.12), true);
}

console.log('pct.check: ok — дүрэм ✓ хоёр чиглэл ✓ Обьёмгүй мөр ✓ 100%+ ✓');

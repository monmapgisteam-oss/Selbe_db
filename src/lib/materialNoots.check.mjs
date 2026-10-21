/**
 * МАТЕРИАЛЫН НӨӨЦ ба АЖЛЫН МАТЕРИАЛ — цэвэр дүрмүүд (2026-10-21).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/materialNoots.check.mjs
 */
import assert from 'node:assert/strict';
import { TOLOV, guidKey, nootsSummary, planSync, receiptsOf, statusFixes, tolovOf } from './materialNoots.ts';
import { formatMats, parseMats } from './materialAjil.ts';

const ma = (o) => ({ oid: 1, respNo: 'SLB-REP-MA-1', verdict: 'A', material: 'Арматур', works: [], ...o });
const mir = (o) => ({ oid: 1, rowId: '{AAAA-1}', maNo: 'SLB-REP-MA-1', verdict: 'A', material: 'Арматур', qty: 10, unit: 'тн', ...o });
const row = (o) => ({ oid: 1, name: 'Арматур', inQty: 10, usedQty: null, unit: 'тн', status: TOLOV.open, mirId: 'aaaa-1', ...o });

/* 1. Төлөв — ашигласан мэдэгдэхгүй (null) бол «Дуусаагүй» (null ≠ 0) */
assert.equal(tolovOf(10, null), TOLOV.open);
assert.equal(tolovOf(10, 9), TOLOV.open);
assert.equal(tolovOf(10, 10), TOLOV.done);
assert.equal(tolovOf(null, 5), TOLOV.open);
assert.equal(tolovOf(0, 0), TOLOV.open, 'ирсэн 0 бол «дууссан» биш');

/* 2. Нөөцөд орох ачаа — MA БА MIR хоёулаа батлагдсан */
assert.equal(guidKey('{AbC-1}'), 'abc-1');
assert.equal(receiptsOf([ma()], [mir()]).length, 1);
assert.equal(receiptsOf([ma({ verdict: 'R' })], [mir()]).length, 0, 'MA R');
assert.equal(receiptsOf([ma({ verdict: null })], [mir()]).length, 0, 'MA шийдвэргүй');
assert.equal(receiptsOf([ma()], [mir({ verdict: 'R' })]).length, 0, 'MIR R');
assert.equal(receiptsOf([], [mir()]).length, 0, 'MA алга');
assert.equal(receiptsOf([ma({ verdict: 'AN' })], [mir({ verdict: 'AN' })]).length, 1, 'AN = батлагдсан');
/* Хариу бичгийн СҮҮЛИЙН хувилбар хүчинтэй — дахин илгээж R болсон бол орохгүй */
assert.equal(receiptsOf([ma({ oid: 1 }), ma({ oid: 2, verdict: 'R' })], [mir()]).length, 0, 'сүүлийн MA R');
/* Нэр MA-гийн сонголтоос */
assert.equal(receiptsOf([ma({ material: 'Бетон зуурмаг' })], [mir({ material: 'x' })])[0].name, 'Бетон зуурмаг');
assert.deepEqual(receiptsOf([ma()], [mir({ rowId: '' })]), [], 'rowId-гүй MIR алгасна');

/* 3. Синкийн төлөвлөгөө — нэмэх · шинэчлэх · хасах · давхардал */
const rc = receiptsOf([ma()], [mir(), mir({ rowId: '{BBBB-2}', qty: 5 })]);
let p = planSync([], rc);
assert.equal(p.adds.length, 2);
p = planSync([row()], rc);
assert.deepEqual(p.adds.map((a) => a.mirId), ['bbbb-2']);
assert.equal(p.updates.length, 0, 'өөрчлөлтгүй');
p = planSync([row({ inQty: 8 })], rc);
assert.deepEqual(p.updates, [{ oid: 1, name: 'Арматур', qty: 10, unit: 'тн' }], 'MIR-ийн тоо засагдвал дагана');
p = planSync([row(), row({ oid: 7 })], rc);
assert.deepEqual(p.deletes, [7], 'давхардал — БАГА objectid үлдэнэ');
p = planSync([row({ mirId: 'zzzz-9', oid: 3 })], rc);
assert.deepEqual(p.deletes, [3], 'батлагдахаа больсон MIR-ийн мөр хасагдана');
p = planSync([row({ mirId: '', oid: 4 })], rc);
assert.ok(!p.deletes.includes(4), 'mir_id-гүй (гараар) мөрийг хөндөхгүй');

/* 4. Нэрээр нэгтгэл ба төлөв */
const sums = nootsSummary([row(), row({ oid: 2, inQty: 5, mirId: 'b' }), row({ oid: 3, name: 'Бетон', unit: 'м3', inQty: null, mirId: 'c' })]);
const arm = sums.find((x) => x.name === 'Арматур');
assert.equal(arm.inSum, 15);
assert.equal(arm.usedSum, null, 'ашигласан мэдэгдэхгүй — 0 биш');
assert.equal(arm.rest, null);
assert.equal(arm.n, 2);
assert.equal(sums.find((x) => x.name === 'Бетон').inSum, null, 'бүх тоо null бол нийлбэр null');
const used = [row({ usedQty: 6 }), row({ oid: 2, inQty: 5, usedQty: 9, mirId: 'b', status: TOLOV.open })];
assert.equal(nootsSummary(used)[0].status, TOLOV.done, '15 ирсэн, 15 ашигласан → дууссан');
assert.deepEqual(statusFixes(used).map((x) => x.oid), [1, 2], 'нэг материалын БҮХ мөр «Дууссан»');
assert.deepEqual(statusFixes([row()]), [], 'төлөв зөв бол бичихгүй');

/* 5. Ажлын материал — нэг нүдэнд олон нэр, таслалтай нэр ч эвдрэхгүй */
const comma = 'Цахилгааны самбар (айлын, давхарын, цахилгааны өрөөний)';
assert.deepEqual(parseMats(`Арматур; ${comma} ;Арматур;`), ['Арматур', comma]);
assert.equal(formatMats(['Арматур', comma]), `Арматур; ${comma}`);
assert.equal(formatMats([]), null, 'хоосон → null');
assert.deepEqual(parseMats(null), []);
assert.throws(() => formatMats(['x'.repeat(1001)]), 'урт хэтэрвэл тайрахгүй, шиднэ');

console.log('✅ materialNoots: бүх шалгуур давлаа');

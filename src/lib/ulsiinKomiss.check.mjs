/**
 * «Улсын комисс» — цэвэр хэсгийн шалгалт (2026-09-28).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ulsiinKomiss.check.mjs
 */
import assert from 'node:assert/strict';
import { KOMISS_NO, KOMISS_WORK, findKomissRow, komissDepSource } from './ulsiinKomiss.ts';
import { appendRootLeaf } from '@/modules/sheet/sheetFrame.ts';

const rows = [
  { oid: 1, no: 'А.', work: 'БЭЛТГЭЛ', depth: 0, group: true, des: 1 },
  { oid: 2, no: '1', work: 'Хашаа', depth: 1, group: false, des: 2 },
  { oid: 3, no: 'Б.', work: 'БАРИЛГА УГСРАЛТ', depth: 0, group: true, des: 3 },
  { oid: 4, no: '2', work: 'Суурь', depth: 1, group: false, des: 4 },
];

/* 1. байхгүй → null; нэр том/жижиг үсэг, зай үл хамаарна; бүлэг/гүн 1 бол биш */
assert.equal(findKomissRow(rows), null);
assert.ok(findKomissRow([...rows, { oid: 9, no: 'УК', work: ' улсын КОМИСС ', depth: 0, group: false }]));
assert.equal(findKomissRow([...rows, { oid: 9, no: 'УК', work: 'Улсын комисс', depth: 1, group: false }]), null, 'гүн 1 — навч биш');
assert.equal(findKomissRow([...rows, { oid: 9, no: 'УК', work: 'Улсын комисс', depth: 0, group: true }]), null, 'бүлэг биш');
/* ⚠️ Нэгтгэлийн түлхүүртэй («…, хүлээлгэн өгөх») санаатай зөрүүтэй — таарахгүй */
assert.equal(findKomissRow([...rows, { oid: 9, no: 'УК', work: 'Улсын комисс, хүлээлгэн өгөх', depth: 0, group: false }]), null);
assert.notEqual(KOMISS_NO.slice(-1), '.', '№ нь үсэг+цэг байж болохгүй (levelFromNo)');
console.log('✅ findKomissRow');

/* 2. хамаарлын эх = сүүлийн үндсэн бүлэг («Б.») */
assert.equal(komissDepSource(rows), 3);
assert.equal(komissDepSource([{ oid: 1, no: 'A', work: 'A', depth: 0, group: true, des: 7 }]), 7, 'дэд бүтэц — ганц үндсэн');
assert.equal(komissDepSource([]), null);
console.log('✅ komissDepSource');

/* 3. appendRootLeaf — төгсгөлд, гүн 0, жин 0, хамаарал */
const sc = { bld: ['5/1'], obyem: ['o0'], f: { no: 'no', work: 'work', vol: 'vol', unit: 'unit', wC: 'wC', wD: 'wD' } };
const out = appendRootLeaf(rows, { oid: -1, no: KOMISS_NO, work: KOMISS_WORK, ham: '3FS0' }, sc, 1);
assert.equal(out.length, rows.length + 1);
const last = out[out.length - 1];
assert.equal(last.depth, 0); assert.equal(last.group, false);
assert.equal(last.wC, 0); assert.equal(last.wD, 0);
assert.equal(last.raw.wC, 0); assert.equal(last.raw.wD, 0);
assert.equal(last.vol, null); assert.equal(last.unit, null); assert.equal(last.des, null);
assert.equal(last.ham, '3FS0');
assert.equal(last.start.length, 1);
assert.equal(rows.length, 4, 'эх массив хөндөгдөөгүй');
assert.ok(findKomissRow(out), 'нэмсний дараа олдоно (idempotent хаалга)');
console.log('✅ appendRootLeaf');

console.log('\nulsiinKomiss.check: ok');

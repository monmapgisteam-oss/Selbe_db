/**
 * Зургийн бүртгэлийн PDF — нэг баримтад хэдэн ч PDF, тагаар холбоно (2026-11-17), цэвэр логикийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/zuragPdf.check.mjs
 *
 *   1. Материал нь баримтын дугаараар (`zb-<oid>`), гэрээ нь гэрээний дугаараар (`zg-…`) тэмдэглэгдэнэ.
 *   2. Гэрээний PDF нэг удаа ороход тэр гэрээний БҮХ мөрөнд харагдана; өөр гэрээний мөрөнд харагдахгүй.
 *   3. Гэрээний дугааргүй мөрөнд гэрээний PDF оруулахгүй.
 */
import assert from 'node:assert/strict';
import { docTag, gereeTag, kindTag, pdfIndex, pdfsOf, tagsFor } from './zuragPdf.ts';

const a = { oid: 11, gereeDugaar: 'ХМХ-25/81' };
const b = { oid: 12, gereeDugaar: 'хмх 25/81' }; // өөрөөр бичсэн ч нэг гэрээ
const c = { oid: 13, gereeDugaar: '34/2025/01' };
const d = { oid: 14, gereeDugaar: '' };

assert.equal(gereeTag(a.gereeDugaar), gereeTag(b.gereeDugaar), 'гэрээний түлхүүр — үсэг, цифрээр');
assert.notEqual(gereeTag(a.gereeDugaar), gereeTag(c.gereeDugaar));
assert.match(gereeTag(a.gereeDugaar), /^zg-[0-9a-z-]+$/, 'таг — таслал, тусгай тэмдэггүй');
assert.deepEqual(tagsFor(a, 'material'), [kindTag('material'), docTag(11)]);
assert.deepEqual(tagsFor(a, 'geree'), [kindTag('geree'), gereeTag('ХМХ-25/81')]);
assert.equal(tagsFor(d, 'geree'), null, 'гэрээний дугааргүй мөр — гэрээний PDF оруулахгүй');

const items = [
  { id: 'm1', tags: ['selbe-zurag', ...tagsFor(a, 'material')] },
  { id: 'm2', tags: ['selbe-zurag', ...tagsFor(a, 'material')] },
  { id: 'g1', tags: ['selbe-zurag', ...tagsFor(a, 'geree')] },
  { id: 'x1', tags: ['selbe-zurag', ...tagsFor(c, 'material')] },
  { id: 'old', tags: ['selbe-zurag'] }, // тэмдэглэгээгүй хуучин item — аль ч мөрөнд орохгүй
];
const idx = pdfIndex(items);
assert.deepEqual(pdfsOf(a, idx).map((x) => `${x.kind}:${x.item.id}`), ['geree:g1', 'material:m1', 'material:m2'], 'гэрээ эхэнд; материал хэд ч байж болно');
assert.deepEqual(pdfsOf(b, idx).map((x) => x.item.id), ['g1'], 'ижил гэрээний өөр мөр — гэрээний PDF харагдана, материал нь биш');
assert.deepEqual(pdfsOf(c, idx).map((x) => x.item.id), ['x1'], 'өөр гэрээ');
assert.deepEqual(pdfsOf(d, idx), [], 'гэрээгүй, PDF-гүй мөр');
console.log('zuragPdf.check: бүгд ✅');

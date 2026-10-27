/**
 * `codedDomain` — codedValue домэйны код → нэр (2026-10-21, аудит: ХАБЭА ослын төрөл кодоор, 31 тэмдэгтэд тасарсан).
 * Ажиллуулах: node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/codedDomain.check.mjs
 */
import assert from 'node:assert/strict';

const { codedMaps, codedName } = await import('./codedDomain.ts');

/* Амьд метадатын хэлбэр (service_d3a7…/0, 2026-10-21): код тасархай, нэр бүтэн, «other» → «Бусад» */
const fields = [
  { name: 'objectid', domain: null },
  { name: 'field_7', domain: { type: 'codedValue', codedValues: [
    { code: 'Моторт тээврийн хэрэгсэлийн осо', name: 'Моторт тээврийн хэрэгсэлийн осол зөрчил' },
    { code: 'Осол дөхсөн тохиолдол', name: 'Осол дөхсөн тохиолдол' },
    { code: 'other', name: 'Бусад' },
  ] } },
  { name: 'field_11', domain: { type: 'codedValue', codedValues: [
    { code: 'Аюулгүй ажиллагааны дүрэм зөрчс', name: 'Аюулгүй ажиллагааны дүрэм зөрчсөн' },
  ] } },
  { name: 'field_13', domain: { type: 'codedValue', codedValues: [] } },
  { name: 'field_14' },
];

/* ── codedMaps — нэрээр (том/жижиг үл хамааран), домэйнгүй талбар орохгүй ── */
const maps = codedMaps(fields, ['FIELD_7', 'field_11', 'field_13', 'field_14', 'missing']);
assert.deepEqual(Object.keys(maps), ['FIELD_7', 'field_11'], 'домэйнгүй/хоосон/байхгүй талбар толинд орохгүй');
assert.equal(maps.FIELD_7.get('other'), 'Бусад');
assert.equal(maps.FIELD_7.size, 3);
assert.deepEqual(codedMaps(undefined, ['field_7']), {}, 'талбаргүй мета → хоосон');
console.log('✅ codedMaps — нэрээр тулгалт, домэйнгүй талбар орохгүй');

/* ── codedName — код → нэр; танихгүй код хэвээр; null/хоосон → '' ── */
assert.equal(codedName(maps.FIELD_7, 'Моторт тээврийн хэрэгсэлийн осо'), 'Моторт тээврийн хэрэгсэлийн осол зөрчил', 'тасархай код → бүтэн нэр');
assert.equal(codedName(maps.FIELD_7, ' other '), 'Бусад', 'зайг хасаж тулгана');
assert.equal(codedName(maps.FIELD_7, 'Ноцтой осол'), 'Ноцтой осол', 'домэйнд байхгүй код өөрөө хэвээр (чимээгүй хоосон биш)');
assert.equal(codedName(undefined, 'Эд хөрөнгийн хохирол'), 'Эд хөрөнгийн хохирол', 'мета унасан ({}) → код хэвээр');
assert.equal(codedName(maps.FIELD_7, null), '', 'null → хоосон (дуудагч «—» тавина)');
assert.equal(codedName(maps.FIELD_7, '   '), '', 'зөвхөн зай → хоосон');
assert.equal(codedName(maps.FIELD_7, 0), '0', 'тоо → мөр');
console.log('✅ codedName — код → нэр, танихгүй код хэвээр, null ≠ нэр');
console.log('✅ codedDomain — бүх шалгалт давлаа');

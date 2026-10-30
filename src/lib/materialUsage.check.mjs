/**
 * МАТЕРИАЛЫН ЗАРЦУУЛАЛТ · НОРМ (2026-10-30) — цэвэр дүрмүүд.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/materialUsage.check.mjs
 */
import assert from 'node:assert/strict';
import { entryName, entryText, parseEntry, parseMats, setEntryNorm } from './materialAjil.ts';
import { computeUsage } from './materialUsage.ts';
import { TOLOV, usageFixes } from './materialNoots.ts';

/* 1. Бичлэг — «Нэр» (үндсэн норм) · «Нэр=норм» (тусгай норм) */
assert.deepEqual(parseEntry('Арматур'), { name: 'Арматур', norm: null });
assert.deepEqual(parseEntry('Арматур = 0,15'), { name: 'Арматур', norm: 0.15 });
assert.deepEqual(parseEntry('Арматур=abc'), { name: 'Арматур=abc', norm: null }, 'тоо биш — нэрийн хэсэг');
assert.equal(entryText({ name: 'Бетон', norm: 1.02 }), 'Бетон=1.02');
assert.equal(entryName('Бетон=1.02'), 'Бетон');
assert.deepEqual(parseMats('Арматур=0.15; Бетон; Арматур'), ['Арматур=0.15', 'Бетон'], 'нэрээр давхардал хасна');
assert.deepEqual(setEntryNorm(['Арматур', 'Бетон=1'], 'Бетон', null), ['Арматур', 'Бетон'], 'үндсэн норм руу буцаана');
assert.deepEqual(setEntryNorm(['Арматур'], 'Арматур', 0.2), ['Арматур=0.2']);

/* 2. Зарцуулалт = обьём × норм; олон материал тус бүрээр; тусгай норм давамгайлна */
const defaults = new Map([['Арматур', 0.12], ['Бетон', 1.02], ['Цемент', null]]);
let u = computeUsage([
  { mats: ['Бетон', 'Арматур'], vol: 10 },
  { mats: ['Арматур=0.2'], vol: 5 },
], defaults);
assert.ok(Math.abs(u.get('Бетон').used - 10.2) < 1e-9);
assert.ok(Math.abs(u.get('Арматур').used - (1.2 + 1)) < 1e-9, 'тусгай норм 0.2');
assert.equal(u.get('Арматур').partial, false);
assert.deepEqual(u.get('Цемент'), { used: 0, partial: false }, 'оноогоогүй материал — мэдэгдэж буй 0');

/* null ≠ 0: обьём эсвэл норм мэдэгдэхгүй ажил тооцоонд орохгүй, материал «дутуу» */
u = computeUsage([{ mats: ['Бетон'], vol: null }, { mats: ['Бетон'], vol: 2 }, { mats: ['Цемент'], vol: 3 }], defaults);
assert.equal(u.get('Бетон').used, 2.04);
assert.equal(u.get('Бетон').partial, true, 'обьёмгүй ажил');
assert.equal(u.get('Цемент').used, null, 'норм алга — тоо гаргахгүй');
assert.equal(u.get('Цемент').partial, true);
assert.equal(computeUsage([], defaults, true).get('Бетон').partial, true, 'хүснэгт уншигдаагүй — бүгд дутуу');

/* 3. Нөөцөд бичих — эхний мөрд нийт, бусдад null; бүх мөрд нэг төлөв */
const row = (o) => ({ oid: 1, name: 'Бетон', inQty: 10, usedQty: null, unit: 'м3', status: TOLOV.open, mirId: 'a', norm: 1.02, ...o });
const rows = [row({ oid: 5, inQty: 6 }), row({ oid: 2, inQty: 4 })];
let fx = usageFixes(rows, new Map([['Бетон', { used: 10.2, partial: false }]]));
assert.deepEqual(fx.find((x) => x.oid === 2), { oid: 2, used: 10.2, status: TOLOV.done }, 'эхний (бага oid) мөрд нийт');
assert.deepEqual(fx.find((x) => x.oid === 5), { oid: 5, used: null, status: TOLOV.done }, 'бусад мөрд хоосон, төлөв ижил');
fx = usageFixes(rows, new Map([['Бетон', { used: 12, partial: true }]]));
assert.ok(fx.every((x) => x.status === TOLOV.open && x.used == null), '«дутуу» зарцуулалт — нийт null, «Дууссан» болохгүй');
fx = usageFixes([row({ oid: 2, inQty: 4, usedQty: 3, status: TOLOV.open })], new Map([['Бетон', { used: 3, partial: false }]]));
assert.deepEqual(fx, [], 'өөрчлөлтгүй бол бичихгүй');

console.log('✅ materialUsage: бүх шалгуур давлаа');

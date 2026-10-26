/**
 * `cashflowMonthDun.monthDunFixes` — импортын ХО дүнгийн өөрчлөлтөд сарын `cashflow_dun` дахин бодогдоно (2026-10-26).
 *   node tools/cashflowMonthDun.check.mjs
 */
import assert from 'node:assert/strict';
import { monthDunFixes } from './cashflowMonthDun.mjs';

const months = [
  { objectid: 101, cashflow_id: 57, cashflow_huwi: 40, cashflow_dun: 400 },
  { objectid: 102, cashflow_id: 57, cashflow_huwi: 60, cashflow_dun: 600 },
  { objectid: 103, cashflow_id: 57, cashflow_huwi: null, cashflow_dun: null },
  { objectid: 201, cashflow_id: 59, cashflow_huwi: 50, cashflow_dun: 500 },
  { objectid: 301, cashflow_id: 5, cashflow_huwi: 100, cashflow_dun: 44 },
  { objectid: 401, cashflow_id: 70, cashflow_huwi: 10, cashflow_dun: 1 },
];
const updates = [
  { r: { objectid: 57, cashflow_id: 57, ho_dun_geree: 1000 }, a: { objectid: 57, ho_dun_geree: 2000 } },
  { r: { objectid: 59, cashflow_id: 59, ho_dun_geree: 1000 }, a: { objectid: 59, ho_dun_geree: 1000 } },
  { r: { objectid: 5, cashflow_id: 5, ho_dun_geree: 44 }, a: { objectid: 5, ho_dun_geree: 0 } },
  { r: { objectid: 70, cashflow_id: 70, ho_dun_geree: 10 }, a: { objectid: 70, ho_dun_geree: 20 } },
];
const got = monthDunFixes(updates, months, new Set([401]));
const by = new Map(got.map((x) => [x.objectid, x.cashflow_dun]));
assert.equal(by.get(101), 800, 'хувь × шинэ ХО ÷ 100');
assert.equal(by.get(102), 1200);
assert.ok(!by.has(103), 'хувьгүй сар — null хэвээр (0 БИШ), өөрчлөлтгүй');
assert.ok(!by.has(201), 'ХО дүн өөрчлөгдөөгүй гэрээ хөндөгдөхгүй');
assert.equal(by.get(301), null, 'шинэ ХО ≤ 0 → дүн null (recomputeFinanceAmounts.costOf)');
assert.ok(!by.has(401), 'устгагдах сарын мөр хөндөгдөхгүй');
assert.equal(got.find((x) => x.objectid === 101).old, 400, 'тайланд хуучин дүн');
assert.equal(monthDunFixes([{ r: { cashflow_id: null, ho_dun_geree: 1 }, a: { ho_dun_geree: 2 } }], months).length, 0, 'дугааргүй гэрээ');
console.log(`✅ cashflowMonthDun: ${got.length} сарын дүн дахин бодогдов — бүх шалгуур давлаа`);

/**
 * `cashflowMonthPlan` — Excel-ийн сарын ХУРИМТЛАЛ → системийн сарын мөр (2026-10-27).
 *   node tools/cashflowMonthPlan.check.mjs
 */
import assert from 'node:assert/strict';
import {
  amountOf, costOf, headerMismatches, monthKeys, monthPlanOf, monthRowAttrs, parseMonthHeader, ymOfStart,
} from './cashflowMonthPlan.mjs';

/* Сарын тэнхлэг — 2026-08 … 2028-12 = 29 сар, жил дамжина */
const keys = monthKeys('2026-08', 29);
assert.equal(keys.length, 29);
assert.equal(keys[0], '2026-08');
assert.equal(keys[5], '2027-01');
assert.equal(keys[11], '2027-07', 'Y багана — байрлалаараа 2027-07');
assert.equal(keys[28], '2028-12');

/* Толгой */
assert.equal(parseMonthHeader('2026 он 8-р сар'), '2026-08');
assert.equal(parseMonthHeader('2028 оны 1-р сар'), '2028-01');
assert.equal(parseMonthHeader('2027 он 12-р сар'), '2027-12');
assert.equal(parseMonthHeader('Нийт'), null);
const cols = ['N', 'O', 'Y'];
const k3 = ['2026-08', '2026-09', '2027-07'];
const hdr = ['2026 он 8-р сар', '2026 он 9-р сар', '2027 он 12-р сар'];
assert.deepEqual(headerMismatches(hdr, k3, cols, new Set(['Y'])), [], 'Y5-ын мэдэгдсэн алдааг зөвшөөрнө');
assert.equal(headerMismatches(hdr, k3, cols).length, 1, 'зөвшөөрөөгүй бол илэрнэ');
assert.equal(headerMismatches(['2026 он 9-р сар', ...hdr.slice(1)], k3, cols, new Set(['Y']))[0].col, 'N', 'шилжсэн багана илэрнэ');

/* Хуримтлал → сарын хувь */
{
  /* ТЭЗҮ: эхний сард бүхэлдээ (өмнөх түүх 2026-08-д нийлнэ), дараа нь 0 */
  const p = monthPlanOf([1, 1, 1], k3);
  assert.deepEqual(p.months.map((m) => m.huwi), [100, 0, 0]);
  assert.equal(p.final, 100);
}
{
  /* Хөвөгч цэг: 0.06 − 0 → 6 (6.000000000000001 БИШ) */
  const p = monthPlanOf([0, 0.06, 0.24], k3);
  assert.deepEqual(p.months.map((m) => m.huwi), [0, 6, 18]);
  assert.equal(p.months.reduce((a, m) => a + m.huwi, 0), 24);
}
{
  /* Хоосон нүд → мөр үүсэхгүй (null ≠ 0); тоон 0 → 0 хувьтай мөр */
  const p = monthPlanOf([0, null, undefined], k3);
  assert.deepEqual(p.months, [{ ym: '2026-08', huwi: 0 }]);
  assert.equal(monthPlanOf([null, null, null], k3).final, null, 'бүгд хоосон — төлөвлөгөөгүй');
  assert.equal(monthPlanOf([null, null, null], k3).months.length, 0);
}
{
  /* Буурсан хуримтлал (мөр 877: 0 0 0 0 0.2 0 0 0 0.1 0.3 … 1) — 0 болж, ДАРААГИЙН нь өмнөх ДЭЭДЭЭС;
     нийлбэр 100 (120 БИШ) */
  const k = monthKeys('2026-08', 12);
  const p = monthPlanOf([0, 0, 0, 0, 0.2, 0, 0, 0, 0.1, 0.3, 0.5, 1], k);
  assert.deepEqual(p.clamps, [{ ym: '2027-01', prev: 0.2, cum: 0 }]);
  assert.deepEqual(p.months.map((m) => m.huwi), [0, 0, 0, 0, 20, 0, 0, 0, 0, 10, 20, 50]);
  assert.equal(p.months.reduce((a, m) => a + m.huwi, 0), 100);
  assert.equal(p.final, 100);
}
{
  /* 100%-д хүрдэггүй (мөр 768: бүх сард 0.007) — нийлбэр 0.7, хиймлээр 100 болгохгүй */
  const p = monthPlanOf([0.007, 0.007, 0.007], k3);
  assert.deepEqual(p.months.map((m) => m.huwi), [0.7, 0, 0]);
  assert.equal(p.final, 0.7);
}

/* Сарын мөр — огноо (UTC үд дунд) ба дүн (порталын дүрэм) */
{
  const a = monthRowAttrs(57, '2027-02', 25, 1000);
  assert.equal(a.cashflow_id, 57);
  assert.equal(a.cashflow_start, Date.UTC(2027, 1, 1, 12));
  assert.equal(a.cashflow_end, Date.UTC(2027, 1, 28, 12), '2-р сарын сүүлийн өдөр');
  assert.equal(a.cashflow_huwi, 25);
  assert.equal(a.cashflow_dun, 250);
  assert.equal(ymOfStart(a.cashflow_start), '2027-02');
  assert.equal(ymOfStart(Date.UTC(2024, 3, 1)), '2024-04', 'хуучин UTC шөнө дунд — UTC сар');
  assert.equal(monthRowAttrs(5, '2026-08', 0, 0).cashflow_dun, null, 'ХО 0 → дүн null (costOf)');
  assert.equal(monthRowAttrs(5, '2026-08', 10, null).cashflow_dun, null);
  assert.equal(costOf(''), null);
  assert.equal(amountOf(null, 100), null, 'хувьгүй → дүн null (0 БИШ)');
  assert.equal(amountOf(0, 100), 0);
}

console.log('cashflowMonthPlan: OK');

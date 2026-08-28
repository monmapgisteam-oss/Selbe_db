/**
 * САРЫН ТЭНХЛЭГИЙН СУНГАЛТ — `cfMonthAxis`.
 *
 * ⚠️ Сунгалт нь 2026-10-01-ээс л амьдаар идэвхжинэ — өнөөдрийн огноогоор
 * ажиллуулбал 12 сар л буцаах тул ЗААВАЛ хуурамч огноогоор шалгана.
 * Энэ шалгуургүй бол сунгалтын алдаа 10-р сар хүртэл нуугдана.
 */
import assert from 'node:assert/strict';
import { cfMonthAxis, CASHFLOW2 } from '@/lib/services.ts';

// Төлөвлөгөөт цонхны дотор — сунгалтгүй, 12 сар хэвээр
const a = cfMonthAxis(new Date(2026, 7, 29)); // 2026-08
assert.equal(a.length, 12, 'цонхны дотор 12 сар байх ёстой');
assert.equal(a[a.length - 1].label, '2026-09');
assert.ok(a.every((m) => m.amount != null), 'CF багана бүгд байна');
console.log('✅ цонхны дотор — 12 сар, сунгалтгүй');

// Цонхноос хойш — өнөөдрийг хүртэл сунгана, шинэ сард CF багана алга
const b = cfMonthAxis(new Date(2026, 11, 15)); // 2026-12
assert.equal(b.length, 15, '2026-12 гэхэд 15 сар');
assert.equal(b[b.length - 1].label, '2026-12');
assert.equal(b[11].label, '2026-09');
assert.ok(b.slice(12).every((m) => m.amount === null && m.pctCum === null),
  'сунгалтын сард CF багана байхгүй (null)');
assert.ok(b.slice(0, 12).every((m) => m.amount != null), 'эхний 12 нь CF баганатай хэвээр');
console.log('✅ 2026-12 — 15 сар, сунгалт null баганатай');

// Он дамнасан сунгалт — сарын дугаарлалт эргэдэг
const c = cfMonthAxis(new Date(2027, 2, 1)); // 2027-03
assert.equal(c[c.length - 1].label, '2027-03');
assert.equal(c.length, 18);
console.log('✅ он дамнасан сунгалт зөв');

// Гажигтай цаг — 36 сараар таслагдана
const d = cfMonthAxis(new Date(2035, 0, 1));
assert.equal(d.length, CASHFLOW2.months.length + 36, 'сунгалт 36 сараар хязгаарлагдана');
console.log('✅ сунгалтын дээд хязгаар 36 сар');

// Давхардал, дараалал
for (const axis of [a, b, c]) {
  const labels = axis.map((m) => m.label);
  assert.equal(new Set(labels).size, labels.length, 'давхардсан сар алга');
  for (let i = 1; i < labels.length; i++) assert.ok(labels[i] > labels[i - 1], 'өсөх дараалал');
}
console.log('✅ давхардалгүй, өсөх дараалалтай');

console.log('\ncfAxis.check: ok');

/**
 * САРЫН ТЭНХЛЭГИЙН СУНГАЛТ — `cfMonthAxis`.
 *
 * ⚠️ Сунгалт нь 2026-10-01-ээс л амьдаар идэвхжинэ — өнөөдрийн огноогоор
 * ажиллуулбал 12 сар л буцаах тул ЗААВАЛ хуурамч огноогоор шалгана.
 * Энэ шалгуургүй бол сунгалтын алдаа 10-р сар хүртэл нуугдана.
 *
 * ⚠️ 2026-08-31: `cashflow_0813` руу шилжсэнээр сар нь БАГАНА биш МӨР болсон.
 * Тиймээс `CfMonth` дээр талбарын код (`amount`, `pctCum`…) БАЙХГҮЙ — зөвхөн
 * `label` ба төлөвлөгөөт цонхонд багтаж буйг заах `planned` үлдсэн.
 * Тэнхлэг нь ТАСРАЛТГҮЙ хуанли байх ёстой: 2026-01-д ямар ч хэмжилт байхгүй ч
 * тэнхлэгээс УНАЖ БОЛОХГҮЙ, эс тэгвээс дараагийн бүх цэг нэг нүд зүүн шилжинэ.
 */
import assert from 'node:assert/strict';
import { cfMonthAxis, CASHFLOW2 } from '@/lib/services.ts';

const PLAN_LEN = 12; // 2025-10 … 2026-09

// Төлөвлөгөөт цонхны дотор — сунгалтгүй, 12 сар хэвээр
const a = cfMonthAxis(new Date(2026, 7, 29)); // 2026-08
assert.equal(a.length, PLAN_LEN, 'цонхны дотор 12 сар байх ёстой');
assert.equal(a[0].label, CASHFLOW2.planFrom);
assert.equal(a[a.length - 1].label, CASHFLOW2.planTo);
assert.ok(a.every((m) => m.planned), 'цонхны бүх сар төлөвлөгөөт');
console.log('✅ цонхны дотор — 12 сар, сунгалтгүй');

// ⚠️ Хэмжилтгүй сар ч тэнхлэгт БАЙНА — 2026-01-д мөр байхгүй ч нүд нь үлдэнэ
assert.ok(a.some((m) => m.label === '2026-01'), 'хэмжилтгүй сар тэнхлэгээс унаж болохгүй');
console.log('✅ хэмжилтгүй сар (2026-01) тэнхлэгт хэвээр');

// Цонхноос хойш — өнөөдрийг хүртэл сунгана, шинэ сар нь төлөвлөгөөт БИШ
const b = cfMonthAxis(new Date(2026, 11, 15)); // 2026-12
assert.equal(b.length, 15, '2026-12 гэхэд 15 сар');
assert.equal(b[b.length - 1].label, '2026-12');
assert.equal(b[11].label, '2026-09');
assert.ok(b.slice(12).every((m) => !m.planned), 'сунгалтын сар төлөвлөгөөт биш');
assert.ok(b.slice(0, 12).every((m) => m.planned), 'эхний 12 нь төлөвлөгөөт хэвээр');
console.log('✅ 2026-12 — 15 сар, сунгалт planned=false');

// Он дамнасан сунгалт — сарын дугаарлалт эргэдэг
const c = cfMonthAxis(new Date(2027, 2, 1)); // 2027-03
assert.equal(c[c.length - 1].label, '2027-03');
assert.equal(c.length, 18);
console.log('✅ он дамнасан сунгалт зөв');

// Гажигтай цаг — 36 сараар таслагдана
const d = cfMonthAxis(new Date(2035, 0, 1));
assert.equal(d.length, PLAN_LEN + 36, 'сунгалт 36 сараар хязгаарлагдана');
console.log('✅ сунгалтын дээд хязгаар 36 сар');

// Давхардал, дараалал, ТАСРАЛТГҮЙ БАЙДАЛ
const nextYm = (s) => {
  const [y, m] = s.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
for (const axis of [a, b, c, d]) {
  const labels = axis.map((m) => m.label);
  assert.equal(new Set(labels).size, labels.length, 'давхардсан сар алга');
  for (let i = 1; i < labels.length; i++) {
    assert.ok(labels[i] > labels[i - 1], 'өсөх дараалал');
    assert.equal(labels[i], nextYm(labels[i - 1]), 'тэнхлэг тасралтгүй — сар алгасаагүй');
  }
}
console.log('✅ давхардалгүй, тасралтгүй, өсөх дараалалтай');

console.log('\ncfAxis.check: ok');

/**
 * САРЫН ТЭНХЛЭГ — `cfMonthAxis`.
 *
 * ⚠️ 2026-09-06: тэнхлэг нь САНХҮҮЖИЛТИЙН ХУВААРИЙН цонх байхаа больж, ЗӨВХӨН
 * БОДИТ хэмжилтийн (IPC олголт · биет гүйцэтгэл) тасралтгүй хуанли болов.
 * Хуучин `cashflow_0813` (гэрээ + сар + өмнөх шилжүүлсэн, 209 мөр) бүрмөсөн
 * хаягдсан тул `planFrom`/`planTo` цонх ба `planned` тэмдэг ч хамт хасагдсан.
 *
 * ⚠️ Тэнхлэг нь МӨРИЙН массив (`string[]`) буцаадаг болсон — урьд нь
 * `{label, planned}` обьект байв.
 *
 * Шалгах зүйл:
 *   · эхлэл нь `MONTH_AXIS_FROM` (2025-09 — хамгийн эрт огноотой IPC акт)
 *   · төгсгөл нь ӨНӨӨДӨР — тогтмол цонхоор таслахгүй
 *   · хэмжилтгүй сар (2026-01) тэнхлэгт ХЭВЭЭР — цоорхой үүсгэхгүй
 *   · тасралтгүй, өсөх, давхардалгүй
 *   · цаг буруу тохируулсан машин дээр 60 сараар хязгаарлагдана
 */
import assert from 'node:assert/strict';
import { cfMonthAxis, MONTH_AXIS_FROM } from '@/lib/services.ts';

const ok = [];
const t = (name, fn) => { fn(); ok.push(name); };

/* ── Эхлэл ба төгсгөл ── */
const a = cfMonthAxis(new Date(2026, 7, 29)); // 2026-08
t('эхлэл нь MONTH_AXIS_FROM', () => {
  assert.equal(a[0], MONTH_AXIS_FROM);
});
t('төгсгөл нь ӨНӨӨГИЙН сар', () => {
  assert.equal(a[a.length - 1], '2026-08');
});
t('2025-09 → 2026-08 = 12 сар', () => {
  assert.equal(a.length, 12);
});
t('хэмжилтгүй сар (2026-01) тэнхлэгт хэвээр', () => {
  assert.ok(a.includes('2026-01'));
});

/* ── Өнөөдөр урагшлахад тэнхлэг сунана ── */
const b = cfMonthAxis(new Date(2027, 2, 1)); // 2027-03
t('он дамнасан сунгалт зөв', () => {
  assert.equal(b[b.length - 1], '2027-03');
  assert.ok(b.includes('2026-12'));
  assert.ok(b.includes('2027-01'));
});

/* ── Хамгаалалт ── */
const c = cfMonthAxis(new Date(2035, 0, 1));
t('сунгалтын дээд хязгаар 60 сар', () => {
  assert.ok(c.length <= 60, `${c.length} сар — 60-аас их`);
});

/* ── Бүтэц ── */
t('давхардалгүй, тасралтгүй, өсөх дараалалтай', () => {
  const set = new Set(a);
  assert.equal(set.size, a.length, 'давхардсан сар');
  for (let i = 1; i < a.length; i += 1) {
    assert.ok(a[i] > a[i - 1], `эрэмбэ буруу: ${a[i - 1]} → ${a[i]}`);
    const [py, pm] = a[i - 1].split('-').map(Number);
    const [cy, cm] = a[i].split('-').map(Number);
    const step = (cy - py) * 12 + (cm - pm);
    assert.equal(step, 1, `${a[i - 1]} → ${a[i]} нь ${step} сарын алхам`);
  }
});
t('мөрийн массив буцаана (обьект БИШ)', () => {
  assert.ok(a.every((x) => typeof x === 'string'));
  assert.ok(/^\d{4}-\d{2}$/.test(a[0]));
});

ok.forEach((n) => console.log(`✅ ${n}`));
console.log('\ncfAxis.check: ok');

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН НЭГДСЭН ТООЦОО (`land.ts`) — ЦЭВЭР ЛОГИКИЙН ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/land.check.mjs
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас). Хамгаалж буй хоёр алдаа:
 *
 *  1. «БҮРЭН ЧӨЛӨӨЛСӨН»-ИЙН БИЧИГЛЭЛ. Урьд нь `=== PARCEL_CLEARED` гэж ЯГ
 *     таарцаар жишдэг тул «Бүрэн чөлөөлсөн.», «Бүрэн  чөлөөлсөн » гэх мэт мөр
 *     «чөлөөлсөн»-д тоологдохгүй, «үлдсэн» болон «шалтгаан»-д тусдаа ороод
 *     чөлөөлөлтийн хувь чимээгүй буурна. `Gazar.tsx` ижил `statusKey`-ээр
 *     бүлэглэдэг тул хоёр газрын тоо зөрөх ёсгүй.
 *  2. ТАЛБАЙН НӨХӨЛТ. `area_m2 ?? Талб_1` — хоёр асуулгаар бүрдэнэ; нөхөлтийн
 *     мөр нь «Бүрэн чөлөөлсөн.» гэх мэт бичиглэлтэй байсан ч НЭГ бүлэгт орно.
 */
import assert from 'node:assert/strict';
import {
  buildLandStatus, isClearedStatus, statusKey, parcelAltAreaWhere,
} from './land.ts';
import { PARCEL_CLEARED, PARCEL_LEFT } from './services.ts';

const S = PARCEL_LEFT.fields.status;

/* ══════════════ 1. Бичиглэлийн хэвийншүүлэлт ══════════════ */

for (const v of [
  PARCEL_CLEARED, `${PARCEL_CLEARED}.`, ` ${PARCEL_CLEARED} `, `${PARCEL_CLEARED}. `,
  'Бүрэн  чөлөөлсөн', 'бүрэн чөлөөлсөн', 'Бүрэн чөлөөлсөн', `${PARCEL_CLEARED}..`,
]) {
  assert.ok(isClearedStatus(v), `«${v}» нь чөлөөлсөн гэж танигдах ёстой`);
  assert.equal(statusKey(v), PARCEL_CLEARED, `«${v}» → нэг түлхүүр`);
}
for (const v of ['зөвшилцөх', 'Бүрэн чөлөөлөөгүй', 'Бүрэн', '', null, undefined, '—']) {
  assert.ok(!isClearedStatus(v), `«${v}» нь чөлөөлсөн БИШ`);
}
/* ⚠️ Бусад төлөвийн ТҮҮХИЙ утга хөндөгдөхгүй (trim л) — «гэрээлсэн.» ≠ «гэрээлсэн» хэвээр */
assert.equal(statusKey(' гэрээлсэн. '), 'гэрээлсэн.', 'бусад төлөвийн цэгийг хасахгүй');
assert.equal(statusKey('зөвшилцөх'), 'зөвшилцөх');
assert.equal(statusKey(null), '', 'хоосон → дуудагч өөрийн шошгыг тавина');
assert.equal(statusKey('—'), '');
console.log('✅ «Бүрэн чөлөөлсөн»-ийн бүх бичиглэл нэг ангилалд, бусад нь түүхийгээрээ');

/* ══════════════ 2. buildLandStatus — бичиглэлүүд НИЙЛНЭ ══════════════ */

const rows = [
  { [S]: PARCEL_CLEARED, n: 1900, a: 900_000 },
  { [S]: `${PARCEL_CLEARED}.`, n: 15, a: 7_000 },
  { [S]: `бүрэн  чөлөөлсөн `, n: 5, a: 3_000 },
  { [S]: 'зөвшилцөх', n: 93, a: 40_000 },
  { [S]: 'гэрээлсэн', n: 20, a: 9_000 },
  { [S]: 'гэрээлсэн.', n: 2, a: 500 },
  { [S]: null, n: 3, a: 100 },
];
const ls = buildLandStatus(rows, []);
assert.equal(ls.total, 2038);
assert.equal(ls.cleared, 1920, '3 бичиглэл бүгд чөлөөлсөнд тоологдоно (1900+15+5)');
assert.equal(ls.remaining, 118);
assert.equal(ls.resolved, ls.cleared);
assert.ok(Math.abs(ls.pct - (1920 / 2038) * 100) < 1e-9);
const cl = ls.byStatus.filter((x) => x.label === PARCEL_CLEARED);
assert.equal(cl.length, 1, 'byStatus-д «Бүрэн чөлөөлсөн» НЭГ л мөр');
assert.equal(cl[0].areaM2, 910_000);
assert.ok(!ls.byStatus.some((x) => x.label !== PARCEL_CLEARED && isClearedStatus(x.label)),
  'чөлөөлсөний хувилбар тусдаа мөр болж үлдэх ёсгүй');
/* Шалтгаанд «Бүрэн чөлөөлсөн.» ОРОХГҮЙ */
assert.ok(!ls.reasons.some((r) => isClearedStatus(r.label)), 'шалтгаан нь чөлөөлсөнийг агуулахгүй');
assert.equal(ls.reasons.reduce((s, r) => s + r.n, 0), ls.remaining, 'шалтгааны нийлбэр = үлдсэн');
/* Бусад төлөв: byStatus-д түүхийгээрээ ТУСДАА, шалтгаанд (цэг хасаж) нийлнэ — урьдын дүрэм */
assert.ok(ls.byStatus.some((x) => x.label === 'гэрээлсэн.'), 'бусад төлөвийн түүхий шошго хэвээр');
assert.equal(ls.reasons.find((r) => r.label === 'гэрээлсэн')?.n, 22);
console.log('✅ buildLandStatus: чөлөөлсөн 1920/2038, шалтгааны нийлбэр = үлдсэн');

/* ══════════════ 3. Талбайн нөхөлт (area_m2 ?? Талб_1) ══════════════ */

const ls2 = buildLandStatus(
  [{ [S]: PARCEL_CLEARED, n: 10, a: 1_000 }, { [S]: 'зөвшилцөх', n: 2, a: 200 }],
  [
    { [S]: `${PARCEL_CLEARED}.`, a: 50 }, // ⚠️ бичиглэл өөр ч НЭГ бүлэгт
    { [S]: 'маргаантай', a: 30 }, // эхний асуулгад байхгүй шошго — шинэ бүлэг, n = 0
    { [S]: 'зөвшилцөх', a: null }, // хоосон нийлбэр — алгасна
  ],
);
assert.equal(ls2.areaM2, 1_280, 'нийт талбай = area_m2 + Талб_1 нөхөлт');
assert.equal(ls2.byStatus.find((x) => x.label === PARCEL_CLEARED).areaM2, 1_050);
assert.equal(ls2.byStatus.filter((x) => isClearedStatus(x.label)).length, 1);
assert.equal(ls2.byStatus.find((x) => x.label === 'маргаантай').n, 0, 'нөхөлт мөрийн тоо НЭМЭХГҮЙ');
assert.equal(ls2.total, 12);
assert.equal(
  parcelAltAreaWhere(),
  `${PARCEL_LEFT.fields.area} IS NULL AND ${PARCEL_LEFT.fields.areaAlt} IS NOT NULL`,
);
console.log('✅ талбайн нөхөлт: нийт ба төлөв бүрд, давхар тоололгүй');

/* ══════════════ 4. Хоосон эх ══════════════ */

const empty = buildLandStatus([], []);
assert.equal(empty.total, 0);
assert.equal(empty.pct, null, '0 хуваарьт хувь null — 0% БИШ');
console.log('\nland.check: ok — бичиглэл ✓ нийлбэр ✓ нөхөлт ✓ хоосон ✓');

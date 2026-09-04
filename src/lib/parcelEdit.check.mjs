/**
 * НЭГЖ ТАЛБАР ЗАСАХ — ЦЭВЭР ЛОГИКИЙН ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/parcelEdit.check.mjs
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *
 *  1. ӨӨР ХҮНИЙ ЗАСВАРЫГ ДАРЖ БИЧИХ. Бүтэн мөрийг буцааж бичвэл яг тэр агшинд
 *     өөр хүн зассан баганыг чимээгүй дарна. `diffParcel` нь ЗӨВХӨН
 *     өөрчлөгдсөнийг л илгээх ёстой.
 *  2. БОХИР УТГЫГ «ЦЭВЭРЛЭХ». Үйлчилгээнд «гэрээлсэн. » (арын зайтай) гэсэн
 *     утга бодитоор байгаа. Trim хийвэл тэр мөр бүлэглэлтээс тасарч, өнгө нь
 *     алга болно.
 *  3. ХООСОН МӨРИЙГ `""`-ЭЭР БИЧИХ. ArcGIS-д `""` нь `NULL` БИШ — `IS NULL`
 *     шүүлтэд орохгүй тул тоо чимээгүй зөрнө.
 *  4. ТӨЛӨВИЙН ЖАГСААЛТ ЗУРАГТАЙ ЗӨРӨХ. Маягтын сонголт нь
 *     `PARCEL_STATUS_HUES`-ээс гарах ёстой; тусад нь бичвэл зурагт өнгөтэй
 *     атлаа маягтад байхгүй (эсвэл эсрэгээр) утга үүснэ.
 */

import assert from 'node:assert/strict';
import {
  STATUS_LIST, PARCEL_OID, rowToParcel, diffParcel, validateParcel,
  parcelWhere, parcelNoWhere,
} from './parcelEdit.ts';
import { PARCEL_LEFT, PARCEL_STATUS_HUES } from './services.ts';

const F = PARCEL_LEFT.fields;

/* ══════════════ 1. Төлөвийн жагсаалт нэг эх сурвалжаас ══════════════ */

assert.deepEqual(
  STATUS_LIST, Object.keys(PARCEL_STATUS_HUES),
  'маягтын төлөв нь газрын зургийн будалттай ЯГ таарах ёстой',
);
assert.equal(STATUS_LIST.length, 4, 'дөрвөн төлөв — шинэ нэмэгдвэл зураг шалга');
for (const s of ['Бүрэн чөлөөлсөн', 'Цэвэрлэсэн нэгж талбар', 'Гэрээлсэн', 'Үлдсэн нэгж талбар']) {
  assert.ok(STATUS_LIST.includes(s), `төлөв алга: ${s}`);
}

/* ══════════════ 2. Мөр → Parcel ══════════════ */

const row = {
  [PARCEL_OID]: 4,
  [F.parcelNo]: '1461802715',
  [F.owner]: 'Галя Отгонжаргал',
  [F.status]: 'Үлдсэн нэгж талбар',
  [F.progress]: 'үлдэх саналтай',
  [F.area]: 475,
  [F.areaAlt]: null,
  [F.address]: 'Хандгайтын-21 75 тоот',
  [F.note]: '7н буудал хэсэг Экстра худалдааны төв',
};
const p = rowToParcel(row);
assert.ok(p, 'мөр задрах ёстой');
assert.equal(p.oid, 4);
assert.equal(p.parcelNo, '1461802715');
assert.equal(p.areaM2, 475);

/* Талбай нөхөлт — геометргүй мөрд ЗӨВХӨН `Талбай` утгатай */
const alt = rowToParcel({ ...row, [F.area]: null, [F.areaAlt]: 312 });
assert.equal(alt.areaM2, 312, 'area_m2 хоосон бол Талбай нөхнө');

/* ⚠️ ХОЁУЛАА хоосон бол `null` — 0 БИШ */
const noArea = rowToParcel({ ...row, [F.area]: null, [F.areaAlt]: null });
assert.equal(noArea.areaM2, null, 'талбайгүй нь null байх ёстой, 0 биш');
assert.notEqual(noArea.areaM2, 0);

/* Хоосон текст — `null` биш `''` (маягт нь control-той байх ёстой) */
const blank = rowToParcel({ ...row, [F.owner]: null, [F.note]: null });
assert.equal(blank.owner, '', 'null → маягтад хоосон мөр');
assert.equal(blank.note, '');

assert.equal(rowToParcel({ ...row, [PARCEL_OID]: null }), null, 'OID-гүй мөр таарахгүй');

/* ══════════════ 3. diff — ЗӨВХӨН өөрчлөгдсөн ══════════════ */

const patchOf = (o) => ({
  owner: p.owner, status: p.status, progress: p.progress,
  address: p.address, note: p.note, ...o,
});

/* Юу ч өөрчлөөгүй → ХООСОН. Дуудагч тал сүлжээнд огт залгахгүй. */
assert.deepEqual(diffParcel(p, patchOf({})), {}, 'өөрчлөлтгүй бол хоосон diff');

/* Нэг талбар өөрчилсөн → ЗӨВХӨН тэр */
const d1 = diffParcel(p, patchOf({ status: 'Бүрэн чөлөөлсөн' }));
assert.deepEqual(Object.keys(d1), [F.status], 'зөвхөн өөрчлөгдсөн талбар илгээгдэнэ');
assert.equal(d1[F.status], 'Бүрэн чөлөөлсөн');
/* ⚠️ Эзэмшигч, тайлбар ОРОХГҮЙ — өөр хүний зэрэг зассан баганыг дарахгүй */
assert.ok(!(F.owner in d1), 'хөндөөгүй талбар илгээгдэж болохгүй');
assert.ok(!(F.note in d1));

/* Хоёр талбар */
const d2 = diffParcel(p, patchOf({ status: 'Гэрээлсэн', note: 'шинэ тэмдэглэл' }));
assert.equal(Object.keys(d2).length, 2);

/* ══════════════ 4. Хоосон мөр → null ══════════════ */

const cleared = diffParcel(p, patchOf({ note: '' }));
assert.strictEqual(cleared[F.note], null, 'хоосон мөр нь NULL болох ёстой');
assert.notStrictEqual(cleared[F.note], '', 'ArcGIS-д "" нь NULL БИШ');

/* ══════════════ 5. БОХИР УТГА ХЭВЭЭР ══════════════ */

const dirty = { ...p, progress: 'гэрээлсэн' };
const kept = diffParcel(dirty, patchOf({ progress: 'гэрээлсэн. ' }));
assert.strictEqual(
  kept[F.progress], 'гэрээлсэн. ',
  'арын зайтай утгыг trim ХИЙХГҮЙ — үйлчилгээнд ийм бичиглэл бодитоор бий',
);

/* Ижил бохир утга дахин сонгосон бол өөрчлөлт БИШ */
const same = { ...p, progress: 'гэрээлсэн. ' };
assert.deepEqual(
  diffParcel(same, patchOf({ progress: 'гэрээлсэн. ' })), {},
  'ижил бохир утга нь өөрчлөлт биш',
);

/* Гэхдээ «гэрээлсэн» ба «гэрээлсэн. » нь ӨӨР утга */
assert.ok(
  Object.keys(diffParcel(same, patchOf({ progress: 'гэрээлсэн' }))).length === 1,
  'цэг/зайгаар ялгаатай утга нь ӨӨР утга',
);

/* ══════════════ 6. Шалгуур ══════════════ */

assert.deepEqual(validateParcel(patchOf({})), {}, 'зөв ноорогт алдаа гарах ёсгүй');
assert.ok(validateParcel(patchOf({ status: '' })).status, 'төлөв заавал');
assert.ok(validateParcel(patchOf({ status: '   ' })).status, 'зөвхөн зайнаас бүтсэн төлөв');
assert.ok(
  validateParcel(patchOf({ status: 'Зохиомол төлөв' })).status,
  'жагсаалтад байхгүй төлөв нь зурагт өнгөгүй тул хориглоно',
);
/* Бусад талбар нь чөлөөт — хоосон байж БОЛНО */
assert.deepEqual(validateParcel(patchOf({ owner: '', note: '', address: '' })), {});

/* ══════════════ 7. SQL ══════════════ */

assert.equal(parcelWhere(4), 'OBJECTID = 4');
assert.equal(parcelWhere(4.9), 'OBJECTID = 4', 'бутархай OID таслагдана');
/* ⚠️ Кадастрын дугаар нь ТЕКСТ талбар — хашилтад орох ёстой */
assert.equal(parcelNoWhere('1461802715'), `${F.parcelNo} = '1461802715'`);
assert.equal(
  parcelNoWhere("a'b"), `${F.parcelNo} = 'a''b'`,
  'нэг хашилт давхарлагдаж SQL тайрагдахаас хамгаална',
);

console.log('parcelEdit.check: ok — жагсаалт ✓ задаргаа ✓ diff ✓ бохир утга ✓ шалгуур ✓ SQL ✓');

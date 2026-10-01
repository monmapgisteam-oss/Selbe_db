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
import fs from 'node:fs';
import {
  STATUS_LIST, PARCEL_OID, rowToParcel, diffParcel, validateParcel,
  parcelWhere, parcelNoWhere,
  validateParcelChanged, editFieldsOf, parcelNoLikeWhere, saveParcel,
} from './parcelEdit.ts';
import { PARCEL_CLEARED, PARCEL_LEFT, PARCEL_STATUS_HUES } from './services.ts';

const F = PARCEL_LEFT.fields;

/* ══════════════ 1. Төлөвийн жагсаалт нэг эх сурвалжаас ══════════════ */

assert.deepEqual(
  STATUS_LIST, Object.keys(PARCEL_STATUS_HUES),
  'маягтын төлөв нь газрын зургийн будалттай ЯГ таарах ёстой',
);
/* ⚠️ 2026-09-06: ДӨРӨВ → ЕС. `Selbe_parcel_20260906` нь төлөв ба шалтгааныг
   НЭГ талбарт (`явцы_1`) нийлүүлсэн тул «Бүрэн чөлөөлсөн» + 8 шалтгаан болов;
   «Цэвэрлэсэн нэгж талбар», «Үлдсэн нэгж талбар», «Гэрээлсэн» ангилал АЛГА. */
assert.equal(STATUS_LIST.length, 9, 'есөн төлөв — шинэ нэмэгдвэл зураг шалга');
assert.ok(STATUS_LIST.includes(PARCEL_CLEARED), `төлөв алга: ${PARCEL_CLEARED}`);
for (const s of ['зөвшилцөх', 'гэрээлсэн', 'татгалзсан', 'үлдэх саналтай',
  'үнийн дүн зөвшөөрөөгүй', 'маргаантай', 'дүйцүүлсэн', 'АТД']) {
  assert.ok(STATUS_LIST.includes(s), `шалтгаан алга: ${s}`);
}
/* ⚠️ Хуучин ангилал БУЦАЖ ОРВОЛ барина — эх өгөгдөл эргэж хуучирсан гэсэн үг */
for (const s of ['Цэвэрлэсэн нэгж талбар', 'Үлдсэн нэгж талбар']) {
  assert.ok(!STATUS_LIST.includes(s), `хуучин ангилал буцаж ирэв: ${s}`);
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

/* ⚠️ OID нэрийг ХАТУУ бичихгүй — `PARCEL_OID` нь `services.ts`-ээс гарна
   (2026-09-06-нд `OBJECTID` → `FID` болов). */
assert.equal(parcelWhere(4), `${PARCEL_OID} = 4`);
assert.equal(parcelWhere(4.9), `${PARCEL_OID} = 4`, 'бутархай OID таслагдана');
/* ⚠️ Кадастрын дугаар нь ТЕКСТ талбар — хашилтад орох ёстой */
assert.equal(parcelNoWhere('1461802715'), `${F.parcelNo} = N'1461802715'`);
assert.equal(
  parcelNoWhere("a'b"), `${F.parcelNo} = N'a''b'`,
  'нэг хашилт давхарлагдаж SQL тайрагдахаас хамгаална',
);

/* ══════════════ 8. ЗӨВХӨН ӨӨРЧЛӨГДСӨН талбарыг шалгана (2026-10-01) ══════════════
   ⚠️ Хуучин/танигдахгүй төлөвтэй мөрийн эзэмшигчийг засахад хөндөөгүй төлөвөөс
   болж хадгалалт ХААГДДАГ байв. */
{
  const legacy = { ...p, status: 'Үлдсэн нэгж талбар', progress: 'Үлдсэн нэгж талбар' };
  const edit = { ...patchOf({}), status: legacy.status, progress: legacy.progress, owner: 'Шинэ эзэмшигч' };
  assert.ok(validateParcel(edit).status, 'бүтэн шалгуур нь хуучин төлөвийг барьдаг хэвээр');
  assert.deepEqual(validateParcelChanged(legacy, edit), {}, 'хөндөөгүй төлөв хадгалалтыг хаах ёсгүй');
  /* хөндөөгүй төлөв diff-д ОРОХГҮЙ — түүхий утга хэвээр үлдэнэ */
  assert.deepEqual(Object.keys(diffParcel(legacy, edit)), [F.owner]);
  /* өөрчилсөн төлөв шалгагдсаар */
  assert.ok(validateParcelChanged(legacy, { ...edit, status: 'Зохиомол' }).status);
  assert.ok(validateParcelChanged(legacy, { ...edit, status: '' }).status);
  assert.deepEqual(validateParcelChanged(legacy, { ...edit, status: PARCEL_CLEARED }), {});
  /* хоосон төлөвтэй мөр ч мөн адил */
  const blankSt = { ...p, status: '', progress: '' };
  assert.deepEqual(validateParcelChanged(blankSt, { ...patchOf({}), status: '', progress: '', note: 'x' }), {});
}
console.log('✅ төлөв нь ӨӨРЧЛӨГДСӨН үед л шалгагдана');

/* ══════════════ 9. Editor Tracking — метадатагаас (2026-10-01) ══════════════ */
{
  const ef = editFieldsOf({
    editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' },
  });
  assert.deepEqual(ef, { editor: 'Editor', editDate: 'EditDate' });
  /* тохиргоо унтраалттай → null (мөр харагдахгүй) */
  assert.equal(editFieldsOf({ editFieldsInfo: null }), null);
  assert.equal(editFieldsOf({}), null);
  assert.equal(editFieldsOf(null), null);
  assert.equal(editFieldsOf({ editFieldsInfo: { creationDateField: 'C' } }), null, 'засварын талбаргүй бол null');
  /* өөр нэртэй талбар — хатуу нэр БИШ */
  const ef2 = editFieldsOf({ editFieldsInfo: { editDateField: 'last_edited_date', editorField: 'last_edited_user' } });
  const r2 = rowToParcel({ ...row, last_edited_date: 1790754747577, last_edited_user: 'gazar_choloololt' }, ef2);
  assert.equal(r2.editedBy, 'gazar_choloololt');
  assert.equal(r2.editedAt, 1790754747577);
  /* метадатагүй → null; утга алга → null (0 БИШ, 1970 он БИШ) */
  assert.equal(rowToParcel({ ...row, EditDate: 1, Editor: 'x' }).editedAt, null, 'ef-гүй бол уншихгүй');
  const r3 = rowToParcel({ ...row, EditDate: null, Editor: '  ' }, ef);
  assert.equal(r3.editedAt, null);
  assert.equal(r3.editedBy, null);
  assert.equal(rowToParcel({ ...row, EditDate: 0 }, ef).editedAt, null, '0 тамга = огноо алга');
}
console.log('✅ Editor Tracking: метадатагаас таньж, байхгүй бол чимээгүй алгасна');

/* ══════════════ 10. Дугаараар хайх — LIKE (2026-10-01) ══════════════ */
assert.equal(parcelNoLikeWhere('14618'), `${F.parcelNo} LIKE N'%14618%'`);
assert.equal(parcelNoLikeWhere("1%4_6[1]'"), `${F.parcelNo} LIKE N'%1461''%'`,
  'LIKE-ийн тусгай тэмдэгт хасагдаж, хашилт давхарлагдана');
console.log('✅ хэсэгчилсэн хайлтын SQL');

/* ══════════════ 11. saveParcel — НЭГЖ ТАЛБАРЫН тоо (2026-10-01) ══════════════ */
/* өөрчлөлтгүй бол 0, сүлжээнд залгахгүй (эрх ч шаардахгүй) */
assert.equal(await saveParcel(p, patchOf({})), 0);
/* ⚠️ Амжилтын зам сүлжээ шаарддаг тул ЭХ КОДООР: баганын тоо (`Object.keys(d).length`)
   БИШ, 1 буцаана — «3 талбар хадгалагдлаа» гэсэн төөрөгдөл буцаж ирэхгүй. */
{
  const src = fs.readFileSync('src/lib/parcelEdit.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const body = /export async function saveParcel\([\s\S]*?\n\}/.exec(src)?.[0] ?? '';
  assert.ok(body, 'saveParcel олдсонгүй');
  assert.match(body, /return 1;/, 'saveParcel нь хадгалсан НЭГЖ ТАЛБАРЫН тоог (1) буцаана');
  assert.doesNotMatch(body, /return n;/, 'баганын тоо буцаах ёсгүй');
}
console.log('✅ saveParcel: 0 (өөрчлөлтгүй) | 1 (нэгж талбар)');

console.log('parcelEdit.check: ok — жагсаалт ✓ задаргаа ✓ diff ✓ бохир утга ✓ шалгуур ✓ SQL ✓ засварын хүн ✓ хайлт ✓');

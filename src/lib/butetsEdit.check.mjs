/**
 * ДЭД БҮТЦИЙН АТРИБУТ ЗАСАХ — ЦЭВЭР ЛОГИКИЙН ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/butetsEdit.check.mjs
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *
 *  1. ӨӨР ХҮНИЙ ЗАСВАРЫГ ДАРЖ БИЧИХ. `diffRow` нь ЗӨВХӨН өөрчлөгдсөн талбарыг
 *     илгээх ёстой — бүтэн мөрийг буцааж бичвэл яг тэр агшинд өөр хүн зассан
 *     баганыг чимээгүй дарна (ArcGIS-д мөрийн түгжээ байхгүй).
 *  2. ХООСОН МӨРИЙГ `""`-ЭЭР БИЧИХ. ArcGIS-д `""` нь `NULL` БИШ — `IS NULL`
 *     шүүлтэд орохгүй тул тоо чимээгүй зөрнө.
 *  3. ТООГ ХӨРВҮҮЛЭХ АЛДАА. `Number('')` нь 0 — шалгуурын хоосон салаа тооны
 *     салаанаас ӨМНӨ байхгүй бол хоосон талбар «0» гэж бичигдэнэ.
 *  4. ТЕКСТЭЭР ХАРЬЦУУЛАХ ШААРДЛАГА. Тоог `Number` болгож харьцуулбал
 *     `NaN !== NaN` улмаас хоосон талбар БҮР «өөрчлөгдсөн» гэж уншигдана.
 *  5. СИСТЕМИЙН ТАЛБАР МАЯГТАД ГАРАХ. `OBJECTID`/`GlobalID`/`Shape__Length`
 *     маягтад оролт болж гарвал хэрэглэгч дарж бичих гэж оролдоод хүсэлт
 *     бүхэлдээ унана.
 *  6. ОГНООНЫ ТАЛБАР ЧИМЭЭГҮЙ ДАРАГДАХ. Огноог одоогоор дэмжээгүй тул тэр
 *     төрөл маягтад ОГТ гарах ёсгүй — хагас дэмжлэг нь хамгийн муу хувилбар.
 */

import assert from 'node:assert/strict';
import {
  applyAttrs, createRow, deleteRow, diffRow, emptyPatch, loadGeometry,
  oidWhere, revertAttrs, rowToPatch, saveGeometry, validateRow,
} from './butetsEdit.ts';

/* ══════════════ Хиймэл схем — үйлчилгээнд байдаг бодит хэлбэрээр ══════════════ */

/**
 * ⚠️ Талбарууд нь `et:124` (Багц 1 цахилгааны шугам)-ийн БОДИТ схем
 * (2026-09-02-нд `?f=json`-оор шалгасан): текст + тоо + системийн гурав.
 */
const meta = {
  layerId: 'et:124',
  title: 'Багц 1 цахилгааны шугам',
  url: 'https://example.invalid/FeatureServer/59',
  oidField: 'OBJECTID',
  geom: 'esriGeometryPolyline',
  canUpdate: true,
  canCreate: true,
  draw: 'polyline',
  fields: [
    { name: 'DocName', alias: 'DocName', kind: 'text', length: 255, nullable: true, codes: null },
    { name: 'ZONE_ID', alias: 'ZONE_ID', kind: 'text', length: 100, nullable: true, codes: null },
    { name: 'urt_m', alias: 'urt_m', kind: 'number', length: null, nullable: true, codes: null },
    { name: 'ner', alias: 'Нэр', kind: 'text', length: 50, nullable: false, codes: null },
    {
      name: 'turul',
      alias: 'Төрөл',
      kind: 'text',
      length: 20,
      nullable: true,
      codes: [{ code: 'a', label: 'А төрөл' }, { code: 'b', label: 'Б төрөл' }],
    },
  ],
  readOnly: [
    { name: 'OBJECTID', alias: 'OBJECTID', kind: 'number', length: null, nullable: false, codes: null },
    { name: 'Shape__Length', alias: 'Shape__Length', kind: 'number', length: null, nullable: true, codes: null },
  ],
};

const row = {
  OBJECTID: 12,
  DocName: 'Зураг-1',
  ZONE_ID: 'Багц-1',
  urt_m: 1234.5,
  ner: 'Шугам А',
  turul: 'a',
  Shape__Length: 1240.117,
  GlobalID: '{ABC}',
};

/* ══════════════ 1. Ноорог — зөвхөн засагдах талбарууд ══════════════ */

const base = rowToPatch(meta, row);
assert.deepEqual(
  Object.keys(base).sort(),
  ['DocName', 'ZONE_ID', 'ner', 'turul', 'urt_m'],
  'ноорогт ЗӨВХӨН засагдах талбарууд орно',
);
assert.equal(base.urt_m, '1234.5', 'тоо ТЕКСТЭЭР авагдана — форматлалт алдагдахгүй');
assert.ok(!('OBJECTID' in base), 'системийн талбар ноорогт орох ёсгүй');
assert.ok(!('Shape__Length' in base), 'геометрийн хэмжээ ноорогт орох ёсгүй');
assert.ok(!('GlobalID' in base), 'GlobalID ноорогт орох ёсгүй');

/* ══════════════ 2. Өөрчлөлтгүй бол ХООСОН ══════════════ */

assert.deepEqual(diffRow(meta, row, base), {}, 'юу ч зассангүй бол сүлжээнд огт залгахгүй');

/* ══════════════ 3. Зөвхөн өөрчлөгдсөн талбар ══════════════ */

assert.deepEqual(
  diffRow(meta, row, { ...base, DocName: 'Зураг-2' }),
  { DocName: 'Зураг-2' },
  'нэг талбар зассан бол НЭГ л талбар илгээгдэнэ',
);

/* ══════════════ 4. Хоосон нь `null` — `""` БИШ ══════════════ */

const cleared = diffRow(meta, row, { ...base, DocName: '' });
assert.ok('DocName' in cleared, 'хоослосон талбар илгээгдэх ёстой');
assert.equal(cleared.DocName, null, 'хоосон мөр нь NULL болно — `""` бол IS NULL шүүлтэд орохгүй');

/* ══════════════ 5. Тоо — текстээс тоо болж хөрвөнө ══════════════ */

const numed = diffRow(meta, row, { ...base, urt_m: '1300' });
assert.equal(numed.urt_m, 1300, 'тоон талбар ТОО болж илгээгдэнэ');
assert.equal(typeof numed.urt_m, 'number');

/* ⚠️ Форматын зөрүү нь өөрчлөлт ГЭЖ ТООЦОГДОНО — `1234.50` ба `1234.5` хоёр
   ӨӨР текст. Энэ нь санаатай: хэрэглэгч бичсэн зүйлээ хадгалахыг хүсдэг. */
assert.deepEqual(
  Object.keys(diffRow(meta, row, { ...base, urt_m: '1234.50' })),
  ['urt_m'],
);

/* ⚠️ Хоосон ТООН талбар нь `null` — `Number('')` буюу 0 БИШ. Энэ нь файлын
   толгойн 3-р эрсдэл: 0 гэж бичвэл «урт нь тэг» болж нийлбэрээс хасагдана. */
assert.equal(diffRow(meta, row, { ...base, urt_m: '' }).urt_m, null);

/* ══════════════ 6. Түүхий утга ХЭВЭЭР — trim хийхгүй ══════════════ */

assert.equal(
  diffRow(meta, row, { ...base, DocName: 'Зураг-2 ' }).DocName,
  'Зураг-2 ',
  'арын зайг чимээгүй авахгүй — бодит өгөгдөлд ийм бичиглэл байдаг',
);

/* ══════════════ 7. Шалгуур ══════════════ */

assert.deepEqual(validateRow(meta, base), {}, 'зөв мөр алдаагүй');

assert.ok(
  validateRow(meta, { ...base, ner: '' }).ner,
  'nullable биш талбарыг хоослоход алдаа',
);
assert.ok(
  !validateRow(meta, { ...base, DocName: '' }).DocName,
  'nullable талбарыг хоослох нь ЗӨВ — алдаа болгож болохгүй',
);
assert.ok(
  validateRow(meta, { ...base, urt_m: 'арван' }).urt_m,
  'тоон талбарт текст бичвэл алдаа',
);
assert.ok(
  !validateRow(meta, { ...base, urt_m: '' }).urt_m,
  'хоосон тоон талбар нь «тоо биш» алдаа ӨГӨХГҮЙ — хоосон салаа эхэлж шалгагдана',
);
assert.ok(
  validateRow(meta, { ...base, ZONE_ID: 'x'.repeat(101) }).ZONE_ID,
  'уртаас хэтэрсэн текст — сервер унахаас өмнө барина',
);
assert.ok(
  !validateRow(meta, { ...base, ZONE_ID: 'x'.repeat(100) }).ZONE_ID,
  'яг хязгаар дээрх урт нь ЗӨВ',
);
assert.ok(
  validateRow(meta, { ...base, turul: 'v' }).turul,
  'домэйнд байхгүй код — сонголтоос гарсан утга',
);

/* ══════════════ 8. Засварыг зөвшөөрөхгүй давхарга ══════════════ */

assert.equal(meta.canUpdate, true);

/* ══════════════ 9. SQL ══════════════ */

assert.equal(oidWhere(meta, 12), 'OBJECTID = 12');
/* ⚠️ Бутархай OID нь SQL-д орох ёсгүй — `Math.trunc` таслана */
assert.equal(oidWhere(meta, 12.9), 'OBJECTID = 12');
assert.equal(
  oidWhere({ ...meta, oidField: 'FID' }, 7), 'FID = 7',
  'OID нэр давхарга бүрт ижил БИШ — бүртгэлээс уншигдана',
);

/* ══════════════ 10. ШИНЭ ОБЪЕКТ — илгээх БИЕИЙН хэлбэр ══════════════ */

/**
 * ⚠️ ЭНЭ ТЕСТ ЯМАР АЛДААНААС ХАМГААЛЖ БАЙНА ВЭ:
 *
 *  · ГЕОМЕТР АТРИБУТ БОЛЖ ЯВАХ. `tableWrite.clean()` нь зөвхөн серверийн
 *    талбарыг (`objectid`, `shape…`) хасдаг бөгөөд «geometry» тэдгээрт
 *    ОРОХГҮЙ. Тусгайлан салгаагүй бол ArcGIS «geometry нэртэй талбар алга»
 *    гээд бүхэл хүсэлтийг татгалзана.
 *
 *  · SPATIAL REFERENCE АЛДАГДАХ. Зураг Web Mercator (102100), үйлчилгээ
 *    UTM 48N (32648). SR нь геометрийн JSON дотор ХЭВЭЭР очих ёстой —
 *    алдвал сервер координатыг өөрийн проекц гэж уншиж, объект дэлхийн өөр
 *    буланд үүснэ (буцаах арга байхгүй).
 *
 *  · ХООСОН ТАЛБАР `null` БОЛЖ ЯВАХ. Шинэ мөрөнд илгээгээгүй талбар нь
 *    үйлчилгээний анхдагчаа авна; `null` шахвал тэр анхдагчийг дарж бичнэ.
 */

const blank = emptyPatch(meta);
assert.deepEqual(
  Object.keys(blank).sort(),
  ['DocName', 'ZONE_ID', 'ner', 'turul', 'urt_m'],
  'хоосон ноорогт засагдах талбар БҮГД байна',
);
assert.ok(Object.values(blank).every((v) => v === ''), 'бүгд хоосон мөр');

const GEOM = {
  paths: [[[11876543.1, 5987654.2], [11876600.5, 5987700.9]]],
  spatialReference: { wkid: 102100, latestWkid: 3857 },
};

let sent = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  sent = { url: String(url), body: new URLSearchParams(String(init.body)) };
  return {
    ok: true,
    json: async () => ({ addResults: [{ success: true, objectId: 4242 }] }),
  };
};
try {
  const oid = await createRow(meta, GEOM, { ...blank, ner: 'Шинэ шугам', urt_m: '250' });
  assert.equal(oid, 4242, 'шинэ объектын дугаар буцаана');
} finally {
  globalThis.fetch = realFetch;
}

assert.ok(sent, 'хүсэлт огт явсангүй');
assert.ok(sent.url.endsWith('/applyEdits'), `applyEdits рүү явах ёстой: ${sent.url}`);

const adds = JSON.parse(sent.body.get('adds'));
assert.equal(adds.length, 1);
assert.deepEqual(adds[0].geometry, GEOM, 'геометр БҮТНЭЭР, SR-тэйгээ явна');
assert.equal(
  adds[0].geometry.spatialReference.wkid, 102100,
  'SR алдагдвал объект дэлхийн өөр буланд үүснэ',
);
assert.ok(!('geometry' in adds[0].attributes), 'геометр АТРИБУТ болж явж БОЛОХГҮЙ');
assert.deepEqual(
  adds[0].attributes, { ner: 'Шинэ шугам', urt_m: 250 },
  'зөвхөн БӨГЛӨСӨН талбар явна; тоо нь ТОО болж хөрвөнө',
);
assert.equal(sent.body.get('rollbackOnFailure'), 'true');
assert.equal(sent.body.get('updates'), null, 'нэмэх хүсэлтэд updates байх ёсгүй');

/* Геометргүй бол СҮЛЖЭЭНД ОГТ ЗАЛГАХГҮЙ */
await assert.rejects(() => createRow(meta, null, blank), /Геометр/);
/* Үйлчилгээ зөвшөөрөхгүй бол мөн адил */
await assert.rejects(
  () => createRow({ ...meta, canCreate: false }, GEOM, blank),
  /зөвшөөрөхгүй/,
);

/* ══════════════ 11. VERTEX ЗАСВАР — уншилт ба бичилт ══════════════ */

/**
 * ⚠️ ЭНЭ ТЕСТ ЯМАР АЛДААНААС ХАМГААЛЖ БАЙНА ВЭ:
 *
 *  · SPATIAL REFERENCE УНШИХАД АЛДАГДАХ. ArcGIS нь `spatialReference`-ийг
 *    ХАРИУНЫ ҮНДЭСТ буцаадаг, объект бүрийн геометрт БИШ. Гараар залгаж
 *    өгөхгүй бол буцааж бичихэд SR-гүй явж, объект дэлхийн өөр буланд суух
 *    ба буцаах арга байхгүй.
 *
 *  · ХЭЛБЭР БИЧИХЭД АТРИБУТ ДАГАЖ ЯВАХ. Vertex чирэх зуур өөр хүн тухайн
 *    мөрийн талбарыг зассан байж болно — бүтэн мөр илгээвэл түүнийг дарна.
 *    `updates[0].attributes` нь ЗӨВХӨН OID агуулах ёстой.
 *
 *  · ГЕОМЕТР АТРИБУТ БОЛЖ ЯВАХ (`adds`-тай ижил занга, `updates` талд).
 */

const LINE = { paths: [[[1, 2], [3, 4]]] };
const SR = { wkid: 102100, latestWkid: 3857 };

let asked = null;
const realFetch2 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  asked = { url: String(url), body: new URLSearchParams(String(init.body)) };
  return {
    ok: true,
    json: async () => ({ spatialReference: SR, features: [{ geometry: LINE }] }),
  };
};
let got;
try {
  got = await loadGeometry(meta, 12);
} finally {
  globalThis.fetch = realFetch2;
}

assert.ok(asked.url.endsWith('/query'), `query руу явах ёстой: ${asked.url}`);
assert.equal(asked.body.get('returnGeometry'), 'true');
assert.equal(
  asked.body.get('outSR'), '102100',
  'зураг Web Mercator — үйлчилгээний UTM 48N-ээс хөрвүүлэхгүй бол өөр газар буулгана',
);
assert.equal(asked.body.get('where'), 'OBJECTID = 12');
assert.deepEqual(got.paths, LINE.paths, 'геометр бүтнээрээ ирнэ');
assert.deepEqual(
  got.spatialReference, SR,
  'SR нь хариуны ҮНДЭСНЭЭС геометрт залгагдах ЁСТОЙ',
);

/* ── Бичилт ── */

let put = null;
const realFetch3 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  put = { url: String(url), body: new URLSearchParams(String(init.body)) };
  return { ok: true, json: async () => ({ updateResults: [{ success: true, objectId: 12 }] }) };
};
try {
  await saveGeometry(meta, 12, { ...LINE, spatialReference: SR });
} finally {
  globalThis.fetch = realFetch3;
}

assert.ok(put.url.endsWith('/applyEdits'));
const ups = JSON.parse(put.body.get('updates'));
assert.equal(ups.length, 1);
assert.deepEqual(ups[0].geometry.paths, LINE.paths, 'геометр `geometry` талбарт явна');
assert.deepEqual(ups[0].geometry.spatialReference, SR, 'SR хэвээр');
assert.deepEqual(
  ups[0].attributes, { OBJECTID: 12 },
  'ЗӨВХӨН OID — атрибут дагуулбал өөр хүний засварыг дарна',
);
assert.ok(!('geometry' in ups[0].attributes), 'геометр АТРИБУТ болж явж БОЛОХГҮЙ');
assert.equal(put.body.get('adds'), null, 'хэлбэр засахад adds байх ёсгүй');

await assert.rejects(() => saveGeometry(meta, 12, null), /Геометр/);
await assert.rejects(
  () => saveGeometry({ ...meta, canUpdate: false }, 12, LINE),
  /зөвшөөрөхгүй/,
);

/* ⚠️ Геометргүй засвар нь хэлбэрийг ХӨНДӨХГҮЙ — `diffRow`-ийн үр дүнд
   `geometry` түлхүүр ер нь үүсэхгүй байх ёстой. */
assert.ok(
  !('geometry' in diffRow(meta, row, { ...base, DocName: 'Зураг-3' })),
  'атрибут засварт геометр орж ирвэл хэлбэрийг санамсаргүй дарж бичнэ',
);

/* ══════════════ 12. ҮЙЛДЭЛ БУЦААХ ══════════════ */

/**
 * ⚠️ ЭНЭ ТЕСТ ЯМАР АЛДААНААС ХАМГААЛЖ БАЙНА ВЭ:
 *
 *  · БУЦААЛТ ӨӨРӨӨ ӨГӨГДӨЛ ДАРАХ. Бүтэн мөрийг сэргээвэл засвар хийснээс
 *    хойш өөр хүний бичсэн БУСАД баганыг дарна. `revertAttrs` нь ЗӨВХӨН
 *    өөрчлөгдсөн талбарыг л буцаах ёстой.
 *
 *  · ХООСОН БАЙСАН ТАЛБАРЫГ `""`-ЭЭР СЭРГЭЭХ. ArcGIS-д `""` нь `NULL` БИШ —
 *    буцаасан мөр `IS NULL` шүүлтэд орохоо болино.
 *
 *  · ТООН ТАЛБАРЫГ ТЕКСТЭЭР СЭРГЭЭХ. Double багананд мөр бичвэл хүсэлт унана.
 *
 *  · НЭМСЭНИЙГ БУЦААХ нь УСТГАЛ бөгөөд эдгээр үйлчилгээнд хувилбарын түүх
 *    асаагүй тул эргэж сэргээх арга БАЙХГҮЙ — атом (`rollbackOnFailure`)
 *    байх нь хамгийн сүүлийн хамгаалалт.
 */

const patched = { ...base, DocName: 'Зураг-9', urt_m: '999', ZONE_ID: '' };
const back = revertAttrs(meta, row, patched);
assert.deepEqual(
  Object.keys(back).sort(), ['DocName', 'ZONE_ID', 'urt_m'],
  'ЗӨВХӨН өөрчлөгдсөн талбар буцаана',
);
assert.equal(back.DocName, 'Зураг-1', 'текстийн хуучин утга');
assert.equal(back.urt_m, 1234.5, 'тоо нь ТОО болж буцна');
assert.equal(typeof back.urt_m, 'number');
assert.equal(back.ZONE_ID, 'Багц-1', 'хоослосон талбар хуучин утгаараа сэргэнэ');
assert.deepEqual(revertAttrs(meta, row, base), {}, 'өөрчлөлтгүй бол буцаах зүйл алга');

/* Хуучин нь ХООСОН байсан талбар → null */
const rowBlank = { ...row, DocName: null };
assert.equal(
  revertAttrs(meta, rowBlank, { ...base, DocName: 'шинэ' }).DocName, null,
  'хоосон байсан талбар NULL-ээр сэргэнэ — "" бол IS NULL шүүлтэд орохгүй',
);

/* ── Буцаалтын бичилт ── */

let back1 = null;
const realFetch4 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  back1 = { url: String(url), body: new URLSearchParams(String(init.body)) };
  return { ok: true, json: async () => ({ updateResults: [{ success: true, objectId: 12 }] }) };
};
try {
  await applyAttrs(meta, 12, back);
} finally {
  globalThis.fetch = realFetch4;
}
const backUps = JSON.parse(back1.body.get('updates'));
assert.deepEqual(
  backUps[0].attributes,
  { DocName: 'Зураг-1', urt_m: 1234.5, ZONE_ID: 'Багц-1', OBJECTID: 12 },
  'буцаалт нь OID + зөвхөн буцаах талбаруудыг илгээнэ',
);
assert.ok(!('geometry' in backUps[0]), 'атрибут буцаахад хэлбэрийг хөндөхгүй');

/* Хоосон буцаалт нь СҮЛЖЭЭНД ОГТ ЗАЛГАХГҮЙ */
let called = false;
const realFetch5 = globalThis.fetch;
globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
try {
  await applyAttrs(meta, 12, {});
} finally {
  globalThis.fetch = realFetch5;
}
assert.equal(called, false, 'буцаах талбаргүй бол хүсэлт явуулахгүй');

/* ── Нэмсэнийг буцаах = УСТГАХ ── */

let del = null;
const realFetch6 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  del = { url: String(url), body: new URLSearchParams(String(init.body)) };
  return { ok: true, json: async () => ({ deleteResults: [{ success: true, objectId: 4242 }] }) };
};
try {
  await deleteRow(meta, 4242);
} finally {
  globalThis.fetch = realFetch6;
}
assert.ok(del.url.endsWith('/applyEdits'));
assert.equal(del.body.get('deletes'), '4242');
assert.equal(del.body.get('adds'), null);
assert.equal(del.body.get('updates'), null);
assert.equal(
  del.body.get('rollbackOnFailure'), 'true',
  'устгал ч атом байх ёстой — хэсэгчилсэн үр дүн буцаах аргагүй',
);

console.log('butetsEdit.check: OK');

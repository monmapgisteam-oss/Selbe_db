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
  applyAttrs, createRow, deleteRow, diffRow, emptyPatch, isLostResponse, loadGeometry, loadLayerMeta,
  oidWhere, revertAttrs, revertRows, rowToPatch, saveGeometry, saveRows, validateChanged, validateRow,
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
  canDelete: true,
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
/* ⚠️ 2026-10-05: аравтын ТАСЛАЛ · мянгатын зай зөвшөөрөгдөнө (`paste.normCell`-ийн дүрэм);
   `1e3`/`0x10` ба тоо хэмжээний талбарын СӨРӨГ утга татгалзагдана. */
assert.ok(!validateRow(meta, { ...base, urt_m: '12,5' }).urt_m, '«12,5» — аравтын таслал зөв');
assert.ok(!validateRow(meta, { ...base, urt_m: '1 250' }).urt_m, '«1 250» — мянгатын зай зөв');
assert.equal(diffRow(meta, row, { ...base, urt_m: '12,5' }).urt_m, 12.5, '«12,5» нь 12.5 болж бичигдэнэ (NaN биш)');
assert.ok(validateRow(meta, { ...base, urt_m: '1e3' }).urt_m, '«1e3» тоо биш');
assert.ok(validateRow(meta, { ...base, urt_m: '0x10' }).urt_m, '«0x10» тоо биш');
assert.ok(validateRow(meta, { ...base, urt_m: '-50' }).urt_m, 'уртын талбарт сөрөг тоо байж болохгүй');
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

/* ⚠️ 2026-09-30: ЗӨВХӨН ХООСОН ЗАЙ нь `Number`-т 0 — тоон талбарт 0 бичигддэг байв
   (олноор засахад «— олон утга —» талбарт зай дарахад БҮХ мөрөнд 0) */
assert.ok(validateRow(meta, { ...base, urt_m: ' ' }).urt_m, 'зай — тоо биш');
assert.ok(validateRow(meta, { ...base, urt_m: '   ' }).urt_m, 'олон зай — тоо биш');
assert.ok(!validateRow(meta, { ...base, urt_m: ' 12.5 ' }).urt_m, 'тоо (захын зайтай) — зөв');
/* Олноор засах маягтын дэд схем (өөрчилсөн талбар л) — ижил дүрэм */
assert.ok(
  validateRow({ ...meta, fields: meta.fields.filter((f) => f.name === 'urt_m') }, { urt_m: ' ' }).urt_m,
  'олноор засах: зай → алдаа',
);

/* ⚠️ 2026-09-30: байгаа мөрт ХӨНДӨӨГҮЙ талбарын хуучин буруу утга (домэйнээс гарсан код,
   заавал талбарт хоосон) нь ӨӨР талбарын засварыг хаадаггүй — `validateChanged` */
{
  const legacy = { ...row, turul: 'хуучин', ner: null };
  const p = { ...rowToPatch(meta, legacy), DocName: 'Шинэ нэр' };
  assert.ok(validateRow(meta, p).turul && validateRow(meta, p).ner, 'бүтэн шалгуур хөндөөгүйг барьдаг');
  assert.deepEqual(validateChanged(meta, legacy, p), {}, 'хөндөөгүй талбар засварыг хаах ёсгүй');
  /* өөрчилсөн талбар нь шалгагдсаар */
  assert.ok(validateChanged(meta, legacy, { ...p, urt_m: 'арван' }).urt_m);
  assert.ok(validateChanged(meta, legacy, { ...p, turul: 'v' }).turul);
  assert.ok(validateChanged(meta, legacy, { ...p, urt_m: ' ' }).urt_m);
}

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
/* Delete-гүй үйлчилгээ — сүлжээнд хүрэхгүй шидэгдэнэ */
await assert.rejects(() => deleteRow({ ...meta, canDelete: false }, 4242), /устгахыг/);
assert.equal(del.body.get('adds'), null);
assert.equal(del.body.get('updates'), null);
assert.equal(
  del.body.get('rollbackOnFailure'), 'true',
  'устгал ч атом байх ёстой — хэсэгчилсэн үр дүн буцаах аргагүй',
);

/* ══════════════ 12. 2026-10-01 — бүхэл талбар · SR · атом бус бичилт ══════════════ */

/* ── Бүхэл тоон талбар: бутархай ба хязгаараас гарсныг татгалзана ── */
{
  const im = {
    ...meta,
    fields: [
      { name: 'Cap_Count', alias: 'Cap_Count', kind: 'number', length: null, nullable: true, codes: null, int: 'small' },
      { name: 'N', alias: 'N', kind: 'number', length: null, nullable: true, codes: null, int: 'int' },
      { name: 'Urt_m', alias: 'Urt_m', kind: 'number', length: null, nullable: true, codes: null, int: null },
    ],
  };
  assert.deepEqual(validateRow(im, { Cap_Count: '3', N: '-5', Urt_m: '2.5' }), {}, 'бүхэл ба бутархай зөв');
  assert.ok(validateRow(im, { Cap_Count: '2.5', N: '', Urt_m: '' }).Cap_Count, 'бүхэл талбарт 2.5 татгалзана');
  assert.ok(validateRow(im, { Cap_Count: '40000', N: '', Urt_m: '' }).Cap_Count, 'SmallInteger хязгаараас гарсан');
  assert.ok(validateRow(im, { Cap_Count: '', N: '3000000000', Urt_m: '' }).N, 'Integer хязгаараас гарсан');
  assert.ok(validateRow(im, { Cap_Count: 'x', N: '', Urt_m: '' }).Cap_Count, 'тоо биш');
}

/* ── loadLayerMeta: SR, атом бичилтийн дэмжлэг, бүхэл төрөл (метадатаас) ── */
{
  const realF = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      objectIdField: 'OBJECTID',
      geometryType: 'esriGeometryPolyline',
      capabilities: 'Query,Update',
      extent: { spatialReference: { wkid: 32648, latestWkid: 32648 } },
      supportsRollbackOnFailureParameter: false,
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID' },
        { name: 'Cap_Count', type: 'esriFieldTypeSmallInteger', nullable: true },
        { name: 'Urt_m', type: 'esriFieldTypeDouble', nullable: true },
      ],
    }),
  });
  try {
    const m = await loadLayerMeta('infra:6');
    assert.equal(m.wkid, 32648, 'давхаргын SR');
    assert.equal(m.rollback, false, 'supportsRollbackOnFailureParameter: false танигдана');
    assert.equal(m.fields.find((f) => f.name === 'Cap_Count').int, 'small');
    assert.equal(m.fields.find((f) => f.name === 'Urt_m').int, null);
  } finally {
    globalThis.fetch = realF;
  }
}

/* ── АТОМ БУС давхарга: багц унавал мөр бүрээр тогтоож, хэсэгчилсэн уналтыг мэдээлнэ ──
   Сервер: oid 2 «түгжигдсэн» — түүнийг агуулсан хүсэлт бүрд тэр мөр унана. */
{
  const nm = { ...meta, rollback: false };
  const bodies = [];
  const realF = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = new URLSearchParams(String(init.body));
    bodies.push(body);
    const ups = JSON.parse(body.get('updates'));
    return {
      ok: true,
      json: async () => ({
        updateResults: ups.map((u) => (u.attributes.OBJECTID === 2
          ? { objectId: 2, success: false, error: { description: 'locked' } }
          : { objectId: u.attributes.OBJECTID, success: true })),
      }),
    };
  };
  try {
    await assert.rejects(
      () => saveRows(nm, [1, 2, 3], { DocName: 'x', Shape__Length: 5 }),
      (e) => {
        assert.deepEqual(e.done, [1, 3], 'БИЧИГДСЭН мөрүүд (дундаас нь унасан ч)');
        assert.equal(e.failed.length, 1);
        assert.equal(e.failed[0].oid, 2);
        assert.match(e.failed[0].msg, /locked/);
        return true;
      },
    );
    assert.equal(bodies.length, 1 + 3, 'багц унасны дараа мөр бүрээр (3) тогтооно');
    const ups = JSON.parse(bodies[0].get('updates'));
    assert.deepEqual(ups[0].attributes, { OBJECTID: 1, DocName: 'x' }, 'серверийн талбар хасагдана');

    /* Буцаалт — шидэхгүй, { done, failed } буцаана */
    const r = await revertRows(nm, [
      { oid: 1, attrs: { DocName: 'a' } }, { oid: 2, attrs: { DocName: 'b' } }, { oid: 3, attrs: { DocName: 'c' } },
    ]);
    assert.deepEqual(r.done, [1, 3]);
    assert.deepEqual(r.failed.map((x) => x.oid), [2]);
  } finally {
    globalThis.fetch = realF;
  }
}

/* ── 2026-10-09: АТОМ БУС давхарга — хариу АЛДАГДСАН багцыг мөр бүрээр ДАХИН илгээхгүй ──
   Урьд нь timeout/сүлжээний алдаанд ч мөр бүрийг дахин бичдэг байв (`isLostResponse`-ийн
   «бичилтийг автоматаар дахин оролдохгүй» дүрмийг зөрчиж). */
{
  const nm = { ...meta, rollback: false };
  let sent = 0;
  const realF = globalThis.fetch;
  globalThis.fetch = async () => {
    sent += 1;
    throw new TypeError('fetch failed');
  };
  try {
    await assert.rejects(() => saveRows(nm, [1, 2, 3], { DocName: 'x' }), (e) => {
      assert.ok(isLostResponse(e), 'алдагдсан хариу хэвээр дамжина');
      assert.deepEqual(e.done, [], 'өмнөх багц алга');
      return true;
    });
    assert.equal(sent, 1, 'мөр бүрээр дахин илгээгээгүй');
    sent = 0;
    const r = await revertRows(nm, [{ oid: 1, attrs: { DocName: 'a' } }, { oid: 2, attrs: { DocName: 'b' } }]);
    assert.equal(sent, 1, 'буцаалт ч мөрөөр дахин илгээхгүй');
    assert.deepEqual(r.done, []);
    assert.deepEqual(r.failed.map((x) => x.oid), [1, 2], 'тодорхойгүй мөрүүд failed — дахин буцаах боломжтой');
  } finally {
    globalThis.fetch = realF;
  }
}

/* ── 2026-10-09: loadLayerMeta — `supportsRollbackOnFailureParameter` алга → атом БИШ;
   `extent.spatialReference` нь `sourceSpatialReference`-ээс ЭХЭНД ── */
{
  const realF = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      objectIdField: 'OBJECTID',
      geometryType: 'esriGeometryPolyline',
      capabilities: 'Query,Update',
      extent: { spatialReference: { wkid: 32648, latestWkid: 32648 } },
      sourceSpatialReference: { wkid: 4326, latestWkid: 4326 },
      fields: [{ name: 'OBJECTID', type: 'esriFieldTypeOID' }],
    }),
  });
  try {
    const m = await loadLayerMeta('infra:7');
    assert.equal(m.rollback, false, 'дэмжлэг нотлогдоогүй → атом гэж таамаглахгүй');
    assert.equal(m.wkid, 32648, 'extent-ийн SR давамгайлна');
  } finally {
    globalThis.fetch = realF;
  }
}

/* ── АТОМ давхарга (анхдагч): буцаалтын багц унавал бүхэлдээ failed, шидэхгүй ── */
{
  const realF = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, json: async () => ({ updateResults: [{ objectId: 7, success: false, error: { description: 'x' } }] }),
  });
  try {
    const r = await revertRows(meta, [{ oid: 7, attrs: { DocName: 'z' } }]);
    assert.deepEqual(r.done, []);
    assert.deepEqual(r.failed.map((x) => x.oid), [7]);
  } finally {
    globalThis.fetch = realF;
  }
}

console.log('butetsEdit.check: OK');

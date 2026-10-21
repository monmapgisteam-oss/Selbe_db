/**
 * ENTERPRISE ЗУРАГЛАЛ — цэвэр функцүүдийн шалгуур (`entMap.ts`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/services/entMap.check.mjs
 *
 * Шалгах зүйл: AGOL хаяг зураглалд байвал Enterprise руу, сүүл (`/query` · `?f=json` · `/applyEdits` ·
 * хавсралт) хэвээр; percent-encoded кирилл нэр decode-оор таарна; `/*` үйлчилгээний түвшний зураглал;
 * зураглалгүй · AGOL биш · суурь хоосон үед хаяг ХЭВЭЭР; `entDirectWith`.
 */
import assert from 'node:assert/strict';
import {
  remapWith, entDirectWith, entDictFor, entRequestWith, entResponseWith, entWhereWith, entFieldName, requestedFields,
  agolLayerIdWith,
} from './entMap.ts';
import { entJsBefore, entJsAfter } from '../entInterceptor.ts';
import { ENT_MAP, ENT_FIELDS } from './entMap.data.ts';

const AGOL = 'https://services.arcgis.com/ORG/arcgis/rest/services';
const AGOL2 = 'https://services.arcgis.com/ORG2/arcgis/rest/services';
const ENT = 'https://gis.example.mn/map/rest/services/Hosted';
const MAP = {
  'Bagts_1_9f/0': 'Selbe_GU/12',
  'SELBE_ALL_DATA_last_0917/36': 'Selbe_ET/3',
  'Инженерийн_дэд_бүтэц__Сэлбэ_0916/61': 'Selbe_BA/40',
  'Цамхагт_кран/50': 'Selbe_HAB/0',
  'QAQC/*': 'Selbe_QA',
  'QAQC/169': 'Selbe_QA/5',
};
const bases = [AGOL, AGOL2];

// давхаргын хаяг + сүүл
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0/query`, MAP, ENT, bases), `${ENT}/Selbe_GU/FeatureServer/12/query`);
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0/applyEdits`, MAP, ENT, bases), `${ENT}/Selbe_GU/FeatureServer/12/applyEdits`);
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0`, MAP, ENT, bases), `${ENT}/Selbe_GU/FeatureServer/12`);
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0?f=json`, MAP, ENT, bases), `${ENT}/Selbe_GU/FeatureServer/12?f=json`);
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0/7/attachments/3`, MAP, ENT, bases), `${ENT}/Selbe_GU/FeatureServer/12/7/attachments/3`);
// хоёр дахь суурь (GAZAR)
assert.equal(remapWith(`${AGOL2}/SELBE_ALL_DATA_last_0917/FeatureServer/36/query`, MAP, ENT, bases), `${ENT}/Selbe_ET/FeatureServer/3/query`);
// percent-encoded кирилл → decode түлхүүр
const infra = `${AGOL}/${encodeURIComponent('Инженерийн_дэд_бүтэц__Сэлбэ_0916')}/FeatureServer/61/query`;
assert.equal(remapWith(infra, MAP, ENT, bases), `${ENT}/Selbe_BA/FeatureServer/40/query`);
assert.equal(remapWith(`${AGOL}/${encodeURIComponent('Цамхагт_кран')}/FeatureServer/50`, MAP, ENT, bases), `${ENT}/Selbe_HAB/FeatureServer/0`);
// үйлчилгээний түвшин (`/*`)
assert.equal(remapWith(`${AGOL}/QAQC/FeatureServer`, MAP, ENT, bases), `${ENT}/Selbe_QA/FeatureServer`);
assert.equal(remapWith(`${AGOL}/QAQC/FeatureServer?f=json`, MAP, ENT, bases), `${ENT}/Selbe_QA/FeatureServer?f=json`);
assert.equal(remapWith(`${AGOL}/QAQC/FeatureServer/169/query`, MAP, ENT, bases), `${ENT}/Selbe_QA/FeatureServer/5/query`);
// зураглалгүй давхарга / үйлчилгээ → хэвээр
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/1/query`, MAP, ENT, bases), `${AGOL}/Bagts_1_9f/FeatureServer/1/query`);
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer`, MAP, ENT, bases), `${AGOL}/Bagts_1_9f/FeatureServer`);
assert.equal(remapWith(`${AGOL}/QAQC2/FeatureServer/169/query`, MAP, ENT, bases), `${AGOL}/QAQC2/FeatureServer/169/query`);
// AGOL биш хаяг (UBHUB · Enterprise · портал) → хэвээр
for (const u of [
  'https://arcgis.ubhub.mn/arcgis/rest/services/Hosted/X/VectorTileServer',
  `${ENT}/IoT_sensor/FeatureServer/12/query`,
  'https://www.arcgis.com/sharing/rest/search',
]) assert.equal(remapWith(u, MAP, ENT, bases), u);
// суурь хоосон (унтраалттай) / зураглал хоосон → хэвээр
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0/query`, MAP, '', bases), `${AGOL}/Bagts_1_9f/FeatureServer/0/query`);
assert.equal(remapWith(`${AGOL}/Bagts_1_9f/FeatureServer/0/query`, {}, ENT, bases), `${AGOL}/Bagts_1_9f/FeatureServer/0/query`);
assert.equal(remapWith('', MAP, ENT, bases), '');
// Enterprise үйлчилгээний нэр кирилл бол encode
assert.equal(remapWith(`${AGOL}/A/FeatureServer/0`, { 'A/0': 'Сэлбэ_ЕТ/4' }, ENT, bases), `${ENT}/${encodeURIComponent('Сэлбэ_ЕТ')}/FeatureServer/4`);
// entDirect
assert.equal(entDirectWith('Bagts_1_9f', 0, MAP, ENT), `${ENT}/Selbe_GU/FeatureServer/12`);
assert.equal(entDirectWith('Bagts_1_9f', 1, MAP, ENT), null);
assert.equal(entDirectWith('Bagts_1_9f', 0, MAP, ''), null);

/* ── ТАЛБАРЫН НЭРИЙН ХӨРВҮҮЛЭЛТ (2026-10-20) — Enterprise нь нэрсийг жижиг үсэг болгодог ── */
const D = entDictFor({
  oid: 'FID',
  f: ['FID', 'BAGTS', 'BLOK', 'Work_Status', 'CreationDate', 'EditDate', 'Editor'],
  ren: { fid: 'objectid', creationdate: 'created_date', editdate: 'last_edited_date', editor: 'last_edited_user' },
});
assert.equal(entFieldName('BAGTS', D), 'bagts');
assert.equal(entFieldName('FID', D), 'objectid');
assert.equal(entFieldName('EditDate', D), 'last_edited_date');
assert.equal(entFieldName('Unknown_X', D), 'unknown_x');
assert.equal(entFieldName('Unknown_X', null), 'unknown_x');
// геометрийн системийн талбар — Enterprise-д ТОМ `SHAPE__Area` / `SHAPE__Length`
assert.equal(entFieldName('Shape__Area', D), 'SHAPE__Area');
assert.equal(entFieldName('Shape__Length', null), 'SHAPE__Length');
{
  const b = { features: [{ attributes: { SHAPE__Area: 5, SHAPE__Length: 2 } }] };
  entResponseWith(b, null, []);
  assert.deepEqual(b.features[0].attributes, { Shape__Area: 5, Shape__Length: 2 });
}
// хүсэлт: outFields · orderBy · groupBy · outStatistics · where (зөвхөн нэр өөрчлөгдсөн) · adds/updates
const rq = entRequestWith({
  outFields: 'FID,BAGTS,Work_Status', orderByFields: 'BLOK DESC,FID', groupByFieldsForStatistics: 'BAGTS',
  outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'FID', outStatisticFieldName: 'n' }]),
  where: "FID > 3 AND BAGTS = N'Багц FID' AND EditDate > timestamp '2026-01-01 00:00:00'",
  updates: JSON.stringify([{ attributes: { FID: 5, Work_Status: 'x' } }]), f: 'json',
}, D);
assert.equal(rq.outFields, 'objectid,bagts,work_status');
assert.equal(rq.orderByFields, 'blok DESC,objectid');
assert.equal(rq.groupByFieldsForStatistics, 'bagts');
assert.equal(JSON.parse(rq.outStatistics)[0].onStatisticField, 'objectid');
assert.equal(rq.where, "objectid > 3 AND bagts = N'Багц FID' AND last_edited_date > timestamp '2026-01-01 00:00:00'", 'толины талбар бүр Enterprise нэрээр; литерал доторх FID хөндөгдөхгүй');
/* ⚠️ 2026-10-20: кирилл талбарын нэр `where`-д том/жижиг үсгээр ялгагддаг (Database error) — толиноор жижиг болно */
const DK = entDictFor({ oid: 'FID', f: ['FID', 'Талб_1', 'area_m2'], ren: { fid: 'objectid' } });
assert.equal(entWhereWith("area_m2 IS NULL AND Талб_1 IS NOT NULL AND Явцы_1 = N'Талб_1'", DK), "area_m2 IS NULL AND талб_1 IS NOT NULL AND Явцы_1 = N'Талб_1'", 'толинд байхгүй Явцы_1 хэвээр, литерал хэвээр');
assert.deepEqual(JSON.parse(rq.updates)[0].attributes, { objectid: 5, work_status: 'x' });
assert.equal(entRequestWith({ outFields: '*' }, D).outFields, '*');
assert.equal(entWhereWith('1=1', D), '1=1');
// хариу: дуудагчийн үсэг → толь → хэвээр
const body = {
  objectIdFieldName: 'objectid',
  fields: [{ name: 'objectid' }, { name: 'bagts' }, { name: 'last_edited_date' }, { name: 'creationdate' }],
  features: [{ attributes: { objectid: 1, bagts: 'Багц 1', work_status: 'a', last_edited_date: 9, creationdate: 7, zzz: 1 } }],
};
entResponseWith(body, D, requestedFields({ outFields: 'Bagts' }));
assert.deepEqual(body.features[0].attributes, { FID: 1, Bagts: 'Багц 1', Work_Status: 'a', EditDate: 9, creationdate: 7, zzz: 1 },
  'хөдөлгөөнгүй хуулбар (creationdate) нь эх нэр авахгүй — амьд created_date л CreationDate');
assert.equal(body.objectIdFieldName, 'FID');
assert.deepEqual(body.fields.map((f) => f.name), ['FID', 'Bagts', 'EditDate', 'creationdate']);
// JS API хөрвүүлэгч: массив outFields, мета дээр PBF хаах
const jb = entJsBefore({ outFields: ['BAGTS', 'FID'], where: 'FID=1', f: 'pbf' }, D);
assert.equal(jb.query.outFields, 'bagts,objectid');
assert.equal(jb.query.where, 'objectid=1');
assert.deepEqual(jb.requested, ['BAGTS', 'FID']);
const meta = entJsAfter({ type: 'Feature Layer', fields: [{ name: 'objectid' }, { name: 'bagts' }], objectIdField: 'objectid', supportedQueryFormats: 'JSON, geoJSON, PBF',
  editFieldsInfo: { editDateField: 'last_edited_date' } }, D, []);
assert.equal(meta.supportedQueryFormats, 'JSON');
assert.equal(meta.objectIdField, 'FID');
assert.deepEqual(meta.fields.map((f) => f.name), ['FID', 'BAGTS']);
assert.equal(meta.editFieldsInfo.editDateField, 'EditDate');
// бодит зураглал: кодын бүх хүснэгт (порталын хайлтаар олддог) Enterprise-д
for (const k of ['Selbe_Permissions/0', 'Selbe_Guitsetgel_Draft/0', 'Selbe_QAQC_Draft/0', 'Selbe_Huvaari_Batlah/0', 'Selbe_Obyem_Batlah/0', 'Selbe_Ajil_Batlah_csv/219']) {
  assert.ok(ENT_MAP[k], `зураглалд алга: ${k}`);
  assert.ok(ENT_FIELDS[ENT_MAP[k]], `талбарын толинд алга: ${ENT_MAP[k]}`);
}
assert.ok(Object.keys(ENT_MAP).length >= 225, 'зураглал дутуу');

// урвуу зураглал (Enterprise давхаргын дугаар → AGOL дугаар) — `loadInfra`: нэг Enterprise үйлчилгээнд олон AGOL үйлчилгээ
const MAP2 = {
  ...MAP,
  'Инженерийн_дэд_бүтэц__Сэлбэ_0916/*': 'Selbe_BA', 'Инженерийн_дэд_бүтэц__Сэлбэ_0916/12': 'Selbe_BA/16',
  'SELBE_ALL_DATA_last_0917/*': 'Selbe_BA', 'SELBE_ALL_DATA_last_0917/112': 'Selbe_BA/0',
};
const infraSvc = `${AGOL}/${encodeURIComponent('Инженерийн_дэд_бүтэц__Сэлбэ_0916')}/FeatureServer`;
assert.equal(agolLayerIdWith(infraSvc, 16, MAP2, ENT, bases), 12);
assert.equal(agolLayerIdWith(infraSvc, 40, MAP2, ENT, bases), 61);
assert.equal(agolLayerIdWith(infraSvc, 0, MAP2, ENT, bases), null, 'Selbe_BA/0 нь SELBE_ALL_DATA-ийнх — инженерийн биш');
assert.equal(agolLayerIdWith(infraSvc, 16, MAP2, '', bases), 16, 'зураглал унтраалттай → хэвээр');
assert.equal(agolLayerIdWith(`${AGOL}/QAQC2/FeatureServer`, 3, MAP2, ENT, bases), 3, 'зураглалгүй үйлчилгээ → хэвээр');
// бодит зураглал: инженерийн 74 давхарга бүр урвуугаар өөрийн AGOL дугаараа олно
{
  const prefix = 'Инженерийн_дэд_бүтэц__Сэлбэ_0916/';
  const whole = ENT_MAP[`${prefix}*`];
  const real = `https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/${encodeURIComponent(prefix.slice(0, -1))}/FeatureServer`;
  const bases2 = ['https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services'];
  let n = 0;
  for (const [k, v] of Object.entries(ENT_MAP)) {
    if (!k.startsWith(prefix) || k.endsWith('*')) continue;
    const entId = Number(v.slice(whole.length + 1));
    assert.equal(agolLayerIdWith(real, entId, ENT_MAP, ENT, bases2), Number(k.slice(prefix.length)), k);
    n++;
  }
  assert.equal(n, 74, 'инженерийн 74 давхарга');
}

console.log('✅ entMap: 56 шалгуур');

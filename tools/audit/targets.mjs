/**
 * СХЕМИЙН АУДИТЫН БҮРТГЭЛ (2026-11-04) — кодын тогтмолуудаас URL + кодод нэрлэсэн талбарууд. Хаяг энд ХАТУУ БИЧИГДЭХГҮЙ:
 * код өөрчлөгдвөл бүртгэл дагана. Зөвхөн тодорхойлолт, сүлжээгүй (`dataAudit.check.mjs` оффлайн тоолно).
 */
import { readFileSync } from 'node:fs';
import {
  BAGTS_NEGTGEL, BOUNDARY, BUILDING, BUILT_FIELDS, BUILT_LAYER, BIM, CASHFLOW_NEW, CF_MONTH, ENT_HOSTED, GAZAR_BUILDING,
  GAZAR_PARCEL, GUITS, HABEA, HO_IPC, IOT_SVC, IRGED_BUILT, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET, LAYER_BY_ID,
  MESH_VERSIONS, ORTHO_FLIGHTS, PARCEL_LEFT, SCENE, SELBE_PUBLIC, SOURCE_FS, SYS_PERMS, TUSUL_NEGTGEL, USAN_SAN, ZONE_FIELDS,
  ZONE_LAYER, laborCompanyFields, layerUrl,
} from '../../src/lib/services.ts';
import { DATASETS } from '../../src/lib/agent/datasets.ts';
import { declaredDatasetFields, declaredFields } from '../../src/lib/agent/driftLib.ts';
import { SENSORS } from '../../src/lib/sensors.ts';
import { ERSDEL_FS } from '../../src/lib/ersdel.ts';
import { MA_F, MA_URL } from '../../src/lib/ma.ts';
import { MIR_PHOTOS_URL, MIR_URL } from '../../src/lib/mir.ts';
import { NF, NOOTS_SVC } from '../../src/lib/materialNoots.ts';
import { FM_F, FM_TITLE } from '../../src/lib/ficMakt.ts';
import { F as ZOV_F, URL as ZOV_URL } from '../../src/lib/zovshoorol.ts';
import { F as HYANALT_F, HYANALT } from '../../src/lib/hyanalt.ts';
import { HUVAARI_OBYEM, OBYEM_FIELDS } from '../../src/lib/huvaariObyem.ts';
import { F as HUVAARI_F } from '../../src/lib/huvaariBatlah.ts';
import { F as OBYEM_F } from '../../src/lib/obyemBatlah.ts';
import { F as AJIL_F } from '../../src/lib/ajilBatlah.ts';
import { LINK_FIELDS } from '../../src/lib/ipcLink.ts';
import { PARCEL_SHAPE_AREA } from '../../src/lib/land.ts';
import { FIN_XL_TOTAL_CODE_FIELD } from '../../src/lib/finExcelLayout.ts';

const strs = (o) => Object.values(o).filter((v) => typeof v === 'string' && v !== '');
const WHERE_KW = new Set(['and', 'or', 'not', 'null', 'is', 'in', 'like', 'between', 'timestamp', 'date']);

/** `where`-ийн талбарын нэрс — мөрийн утгуудыг хасаад, харьцуулалтын зүүн талыг авна */
export function whereFields(where) {
  if (!where) return [];
  const s = String(where).replace(/'(?:[^']|'')*'/g, "''");
  const out = new Set();
  for (const m of s.matchAll(/([\p{L}_][\p{L}\p{N}_]*)\s*(?:=|<>|!=|>=|<=|>|<|\bIS\b|\bIN\b|\bLIKE\b|\bNOT\b)/giu)) {
    if (!WHERE_KW.has(m[1].toLowerCase())) out.add(m[1]);
  }
  return [...out];
}

/** `createTable`-ийн `fields: [{ name: '…', type: 'esriFieldType…' }]` — `entFields.live.check`-тэй ижил уншилт */
const tableFieldsOf = (f) => [...readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
  .matchAll(/\{\s*name:\s*'([^']+)',\s*type:\s*'esriFieldType/g)].map((m) => m[1]);

/**
 * БАРИМТЖСАН ТӨРЛҮҮД — кодын тайлбар/бичих зам тодорхой заасан цөөн талбар (зөрвөл `typeDiff`-ээр мэдээлнэ).
 * Утга нь `esriFieldType`-гүй; массив = аль нэг нь зөв.
 */
export const EXPECT_TYPE = {
  /* hoSync/compute.ts — бүхэл төгрөгөөр бичдэг, огноо нь DateOnly (мөр) */
  'ho:185': {
    tosov_niit: 'BigInteger', gereet_tosov_niit: 'BigInteger', hemnelt_hetrelt: 'BigInteger',
    tosov_niislel_tosov: 'Integer', zahiramj1_ognoo: 'DateOnly', guilgee_ognoo: 'DateOnly', on_: 'Integer',
  },
  /* projectPlanSync.ts — `guitsetgel_huvi`-д ТОО бичдэг */
  'cf:182': { guitsetgel_huvi: ['Double', 'Single'] },
  /* huvaariObyem.ts — `sar` DateOnly, `sar_txt` мөр */
  'huvaari:186': { sar: 'DateOnly', sar_txt: 'String' },
  'negtgel:190': { burtgesen_ognoo: 'Date' },
  'negtgel:187': { ct_start: 'Date', ct_end: 'Date', ex_start: 'String', ex_end: 'String', act_start: 'String', act_end: 'String' },
};

const T = (id, group, url, fields = [], extra = {}) => ({ id, group, url, kind: 'feature', fields: [...new Set(fields)], ...extra });
const X = (id, group, url, kind) => ({ id, group, url, kind, fields: [] });

/** Бүх зорилтот хаяг — БАГЦЫН ХУУДСААС БУСАД (`PKGS`-ийг `schema.mjs` тусад нь шалгана) */
export function buildTargets() {
  const out = [];

  /* 1. Давхаргууд — `LAYERS` биш `LAYER_BY_ID` (scene-ийн 2 def зөвхөн тэнд) */
  for (const l of Object.values(LAYER_BY_ID)) {
    out.push(T(l.id, 'layer', layerUrl(l), [...declaredFields(l), ...whereFields(l.where)]));
  }

  /* 2. Агентын өгөгдлийн эх сурвалжууд */
  for (const d of DATASETS) out.push(T(d.id, 'dataset', d.url, declaredDatasetFields(d)));

  /* 3. `fields.ts` */
  out.push(T('bld:0', 'fields', BUILDING.url, [BUILDING.oid, ...strs(BUILDING.fields)]));
  out.push(T('gazar:150', 'fields', GAZAR_BUILDING.url, [GAZAR_BUILDING.oid, ...strs(GAZAR_BUILDING.fields)]));
  out.push(T('gazar:151', 'fields', GAZAR_PARCEL.url, [GAZAR_PARCEL.oid, ...strs(GAZAR_PARCEL.fields)]));
  out.push(T('gazar:152', 'fields', PARCEL_LEFT.url, [PARCEL_LEFT.oid, ...strs(PARCEL_LEFT.fields), PARCEL_SHAPE_AREA]));
  out.push(T('ho:185', 'fields', HO_IPC.url, [
    HO_IPC.oid, HO_IPC.status.field, HO_IPC.docItem, ...strs(HO_IPC.contractFields), ...strs(HO_IPC.payFields),
    ...HO_IPC.emptyFields, ...strs(HO_IPC.pendingFields), ...strs(LINK_FIELDS),
  ]));
  out.push(T('cf:182', 'fields', CASHFLOW_NEW.url, [
    CASHFLOW_NEW.oid, ...strs(CASHFLOW_NEW.fields), ...strs(CASHFLOW_NEW.stages),
    ...CASHFLOW_NEW.sources.map((s) => s.field), ...strs(CF_MONTH), FIN_XL_TOTAL_CODE_FIELD,
  ]));
  out.push(T('negtgel:187', 'fields', TUSUL_NEGTGEL.url, [TUSUL_NEGTGEL.oid, ...strs(TUSUL_NEGTGEL.fields)]));
  out.push(T('negtgel:190', 'fields', BAGTS_NEGTGEL.url, [BAGTS_NEGTGEL.oid, ...strs(BAGTS_NEGTGEL.fields)]));
  for (const [k, id] of Object.entries(SELBE_PUBLIC.tables)) {
    out.push(T(`public:${k}`, 'fields', `${SELBE_PUBLIC.url}/${id}`, [SELBE_PUBLIC.oid]));
  }

  /* 4. `env.ts` · `layers.ts` · `groups.ts` */
  out.push(T('src:101', 'env', SOURCE_FS.url, [...strs(SOURCE_FS.fields), ...SOURCE_FS.consumers.map((c) => c.field)]));
  out.push(T('boundary', 'layers', BOUNDARY.plan.url, ['hec_area']));
  if (BUILT_LAYER) out.push(T('built:fields', 'layers', layerUrl(BUILT_LAYER), [...strs(BUILT_FIELDS), 'population']));
  if (ZONE_LAYER) out.push(T('zone:fields', 'layers', layerUrl(ZONE_LAYER), strs(ZONE_FIELDS)));
  for (const n of [12, 13, 14, 15, 16]) out.push(T(`iot:${n}`, 'iot', `${IOT_SVC}/${n}`, ['device_id']));
  for (const s of SENSORS) {
    out.push(T(`sensor:${s.label}`, 'iot', s.url, ['objectid', 'device_id', 'received_datetime', 'ingested_at', ...s.metrics.map((m) => m.field)]));
  }
  out.push(T('ersdel:240', 'iot', ERSDEL_FS.url, ['objectid', ERSDEL_FS.typeField]));
  out.push(T('usan:123', 'scene', USAN_SAN.url, []));
  out.push(T('irged:218', 'scene', IRGED_TOILET.url, []));
  out.push(T('irged:217', 'scene', IRGED_BUILT.url, [IRGED_BUILT.typeField, IRGED_BUILT.areaField]));

  /* 5. ХАБЭА */
  const L = HABEA.labor;
  out.push(T('habea:labor', 'habea', L.url, [
    ...strs(L.fields),
    ...L.companies.flatMap((c) => {
      const f = laborCompanyFields(c.sfx);
      return [f.mongol, f.gadaad, f.niitAjiltan, f.niitTehnik, ...(c.bagts != null ? [f.bagts] : [])];
    }),
  ]));
  out.push(T('habea:incident', 'habea', HABEA.incident.url, strs(HABEA.incident.fields)));
  out.push(T('kran:194', 'habea', HABEA.crane.url, [
    HABEA.crane.fields.dugaar, HABEA.crane.fields.blok, HABEA.crane.fields.bagts, HABEA.crane.fields.sunUrt,
    HABEA.crane.fields.undur, HABEA.crane.fields.tuluv, HABEA.crane.fields.oid, HABEA.crane.fields.link,
  ]));
  out.push(T('kran:195', 'habea', HABEA.crane.bufferUrl, [HABEA.crane.fields.bufferLink]));
  for (const it of HABEA.registers.items) {
    if (it.table == null) continue;
    out.push(T(`habea:reg:${it.key}`, 'habea', `${HABEA.registers.url}/${it.table}`, [it.date, it.week, it.sum].filter(Boolean)));
  }
  out.push(T('habea:waste', 'habea', HABEA.waste.url, [...strs(HABEA.waste.fields), ...HABEA.waste.pkgCols.map(([c]) => c)]));
  out.push(T('hse:action', 'habea', HABEA.action.url, ['survey']));
  const U = HABEA.uzleg;
  for (const k of ['v11', 'guitsetgegch', 'guitsetgegchMn', 'zahialagch', 'env', 'cold', 'fire', 'hazard', 'autocrane', 'pump', 'gondola', 'tower']) {
    const merged = { ...U.fields, ...(U.fieldsBy?.[k] ?? {}) };
    /* `habeaUzleg.UZ_OPTIONAL`-тай ижил: маягтад заавал биш — дэлгэц хоосон харуулна */
    const soft = [U.fields.siteOther, U.fields.companyOther, U.fields.block, U.fields.scEarned, U.fields.scAppl, U.fields.week, U.fields.shift];
    out.push(T(`uzleg:${k}`, 'habea', U[k].url, strs(merged), { softFields: soft }));
  }
  out.push(T('uzleg:findings', 'habea', U.hazardFindingsUrl, ['parentrowid']));

  /* 6. Чанар */
  if (MA_URL) out.push(T('chanar:ma', 'chanar', MA_URL, strs(MA_F)));
  if (MIR_URL) {
    out.push(T('chanar:mir', 'chanar', MIR_URL, [
      'objectid', 'uniquerowid', 'globalid', 'doc_no', 'insp_date', 'pkg', 'pkg_label', 'building', 'contractor_name', 'ma_no',
      'material_name', 'verdict', 'x_count', 'qty', 'qty_unit', 'remarks',
      ...Array.from({ length: 8 }, (_, i) => [`c${i + 1}_con`, `c${i + 1}_cli`]).flat(),
      'con_q_name', 'con_q_pos', 'cli_sup_name', 'cli_sup_pos', 'cli_q_name', 'cli_q_pos', 'att_flags', 'att_other',
    ]));
  }
  if (MIR_PHOTOS_URL) out.push(T('chanar:mirPhotos', 'chanar', MIR_PHOTOS_URL, ['objectid', 'parentrowid', 'photo_note']));
  out.push(T('chanar:noots', 'chanar', `${NOOTS_SVC}/0`, strs(NF), { tableIdFromRoot: NOOTS_SVC }));
  out.push(T('chanar:fm', 'chanar', `${ENT_HOSTED}/${FM_TITLE}/FeatureServer/0`, ['objectid', ...strs(FM_F)], { optional: true }));

  /* 7. Гүйцэтгэлийн хүснэгтүүд */
  out.push(T('zov:181', 'guits', ZOV_URL, strs(ZOV_F)));
  out.push(T('hyanalt:183', 'guits', HYANALT.url, [HYANALT.oid, ...strs(HYANALT_F)]));
  out.push(T('huvaari:186', 'guits', HUVAARI_OBYEM, [...OBYEM_FIELDS, 'turul', 'bagts', 'bagts_ner', 'ajil_no', 'ajil_ner', 'negj', 'hun_huch', 'mashin_mehanizm']));
  out.push(T('ajil:189', 'guits', `${GUITS}/189`, strs(AJIL_F)));
  out.push(T('draft:191', 'guits', `${GUITS}/191`, tableFieldsOf('src/lib/draftRemote.ts')));
  /* `zovshoorson_mor` — `entFields.live.check.mjs`-ийн ALLOW_MISSING-тай ижил */
  out.push(T('huvaari:192', 'guits', `${GUITS}/192`, strs(HUVAARI_F).filter((f) => f !== 'zovshoorson_mor')));
  out.push(T('obyem:193', 'guits', `${GUITS}/193`, strs(OBYEM_F)));
  out.push(T('perms:230', 'guits', `${SYS_PERMS}/230`, tableFieldsOf('src/lib/permsRemote.ts')));

  /* 8. Зөвхөн оршихуй — талбаргүй үйлчилгээнүүд */
  for (const l of [...SCENE.layers, ...MESH_VERSIONS.new.layers, ...IRGED_SCENE.layers, ...BIM.layers]) out.push(X(`scene:${l.key}`, 'scene', l.url, 'scene'));
  for (const fl of Object.values(ORTHO_FLIGHTS).flat()) out.push(X(`map:${fl.key}`, 'scene', fl.url, 'map'));
  out.push(X('vtile:road', 'scene', IRGED_ROAD.url, 'vtile'));

  return out;
}

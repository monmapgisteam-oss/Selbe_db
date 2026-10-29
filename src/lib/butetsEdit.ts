'use client';

/**
 * ДЭД БҮТЦИЙН ОБЪЕКТЫН АТРИБУТ ЗАСАХ — өгөгдлийн давхарга.
 *
 *   1. ЗӨВХӨН ӨӨРЧЛӨГДСӨН ТАЛБАРЫГ БИЧНЭ (`diffRow`). Бүтэн мөрийг буцааж
 *      бичвэл яг тэр агшинд өөр хүн зассан баганыг ДАРЖ БИЧНЭ. ArcGIS-д
 *      мөрийн түвшний түгжээ байхгүй тул энэ нь чимээгүй өгөгдөл алдагдуулна.
 *
 *   2. ТҮҮХИЙ УТГЫГ ХЭВЭЭР ХАДГАЛНА — текстийг trim ХИЙХГҮЙ. Үйлчилгээнд
 *      арын зайтай бичиглэл бодитоор байдаг бөгөөд «цэвэрлэвэл» тэр мөр
 *      өмнөх бүлэглэлтээсээ тасарна.
 */

import { t as tr } from '@/lib/i18nCore';
import { AUTH, LAYER_BY_ID, layerUrl, OID, type LayerDef } from '@/lib/services';
import { ArcGISError, arcgisPost, queryFeatures, type Row } from '@/lib/query';
import { currentUser, requireCap } from '@/lib/who';
import { canEditButetsLayer } from '@/lib/butetsAcl';

function requireLayer(meta: LayerMeta): void {
  requireCap('butets');
  if (typeof window === 'undefined') return;
  if (!AUTH.appId) return;
  if (canEditButetsLayer(currentUser(), meta.layerId)) return;
  throw new Error(tr('«{0}» давхарга таны багцын хүрээнд байхгүй — засах эрхгүй.', meta.title));
}
import { applyAll } from '@/lib/tableWrite';
import { normCell } from '@/modules/sheet/paste';
import { lenFieldUnit } from '@/lib/butetsLen';
import { isLostWrite } from '@/lib/lostWrite';

/* ══════════════════ Схем ══════════════════ */

/** Маягтад зурагдах талбарын төрөл */
export type FieldKind = 'text' | 'number';

export type FieldDef = {
  name: string;
  /** Үйлчилгээний alias — байхгүй бол нэр нь өөрөө */
  alias: string;
  kind: FieldKind;
  /** Текстийн дээд урт (үйлчилгээнээс), тоонд `null` */
  length: number | null;
  nullable: boolean;
  /** Кодлогдсон домэйн — байвал сонголтын жагсаалт болно */
  codes: { code: string; label: string }[] | null;
  /**
   * БҮХЭЛ ТООН талбар — `esriFieldTypeSmallInteger` ('small', −32768…32767) /
   * `esriFieldTypeInteger` ('int', −2³¹…2³¹−1); бутархай талбарт `null`/байхгүй.
   */
  int?: 'small' | 'int' | null;
};

export type LayerMeta = {
  layerId: string;
  title: string;
  url: string;
  oidField: string;
  /** Геометрийн төрөл — маягтын тодорхойлолтод */
  geom: string;
  /** Үйлчилгээ `Update` дэмждэг эсэх */
  canUpdate: boolean;
  /** Үйлчилгээ `Create` дэмждэг эсэх — «шинээр нэмэх» товч үүнээс шалтгаална */
  canCreate: boolean;
  /**
   * Үйлчилгээ `Delete` дэмждэг эсэх — «Устгах» товч ба `deleteRow` үүнээс.
   */
  canDelete: boolean;
  /**
   * Зурах хэрэгслийн төрөл — `geometryType`-аас.
   * `null` бол энэ давхаргад шинэ объект зурах боломжгүй (танигдахгүй геометр).
   */
  draw: 'point' | 'polyline' | 'polygon' | null;
  /**
   * Давхаргын ХАДГАЛАЛТЫН SR (`extent.spatialReference`) — урт/талбайг хавтгай эсвэл
   * геодезийн аргаар бодохыг шийднэ (`butetsLen.measureKind`). Мэдэгдэхгүй бол `null`.
   */
  wkid?: number | null;
  /**
   * `supportsRollbackOnFailureParameter` — `false` бол ОЛОН мөрийн бичилт атом БИШ:
   * багц дундаа унахад зарим мөр бичигдсэн үлдэнэ. Тэр үед мөр бүрийн үр дүнг
   * уншиж ХЭСЭГЧИЛСЭН алдааг ил мэдээлнэ (`saveRows`/`revertRows`, 2026-10-01).
   * Өгөөгүй (хуучин кэш, тест) бол `true` гэж үзнэ.
   */
  rollback?: boolean;
  /** Засагдах талбарууд — маягтын оролтууд */
  fields: FieldDef[];
  /**
   * ЗӨВХӨН ХАРУУЛАХ талбарууд (системийн, геометрээс гарах).
   */
  readOnly: FieldDef[];
};

/**
 * СЕРВЕР ӨӨРӨӨ УДИРДДАГ талбарууд — бичихгүй, маягтад оролт болгохгүй.
 */
const SERVER_FIELD = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor|se_anno|created_user|created_date|last_edited_user|last_edited_date)/i;

/** ArcGIS-ийн талбарын төрөл → маягтын төрөл. Тохирохгүйг `null` (алгасна). */
function kindOf(esriType: string): FieldKind | null {
  if (esriType === 'esriFieldTypeString') return 'text';
  if (
    esriType === 'esriFieldTypeDouble'
    || esriType === 'esriFieldTypeSingle'
    || esriType === 'esriFieldTypeInteger'
    || esriType === 'esriFieldTypeSmallInteger'
  ) return 'number';
  return null;
}

/** ArcGIS-ийн геометрийн төрөл → `SketchViewModel`-ийн хэрэгсэл */
function drawOf(t: string): 'point' | 'polyline' | 'polygon' | null {
  if (t === 'esriGeometryPoint') return 'point';
  if (t === 'esriGeometryPolyline') return 'polyline';
  if (t === 'esriGeometryPolygon') return 'polygon';
  return null;
}

type RawField = {
  name?: string;
  alias?: string;
  type?: string;
  length?: number;
  nullable?: boolean;
  editable?: boolean;
  domain?: { type?: string; codedValues?: { name?: string; code?: unknown }[] } | null;
};

/** Үйлчилгээний талбарын тодорхойлолтыг маягтын талбар болгоно */
function toField(f: RawField): FieldDef | null {
  const name = f.name ?? '';
  const kind = kindOf(f.type ?? '');
  if (!name || !kind) return null;
  const cv = f.domain?.type === 'codedValue' ? f.domain.codedValues ?? [] : null;
  return {
    name,
    alias: f.alias || name,
    kind,
    length: typeof f.length === 'number' && kind === 'text' ? f.length : null,
    int: f.type === 'esriFieldTypeSmallInteger' ? 'small' : f.type === 'esriFieldTypeInteger' ? 'int' : null,
    nullable: f.nullable !== false,
    codes: cv
      ? cv.map((c) => ({ code: String(c.code ?? ''), label: String(c.name ?? c.code ?? '') }))
      : null,
  };
}

const metaCache = new Map<string, LayerMeta>();
const metaInflight = new Map<string, Promise<LayerMeta>>();

/**
 * Давхаргын СХЕМИЙГ үйлчилгээнээс уншина.
 */
export async function loadLayerMeta(layerId: string): Promise<LayerMeta> {
  const hit = metaCache.get(layerId);
  if (hit) return hit;
  const run = metaInflight.get(layerId);
  if (run) return run;
  const p = fetchLayerMeta(layerId).finally(() => metaInflight.delete(layerId));
  metaInflight.set(layerId, p);
  return p;
}

async function fetchLayerMeta(layerId: string): Promise<LayerMeta> {

  const L: LayerDef | undefined = LAYER_BY_ID[layerId];
  if (!L) throw new Error(tr('Давхарга танигдсангүй: {0}', layerId));

  const url = layerUrl(L);
  const j = await arcgisPost<{
    fields?: RawField[];
    capabilities?: string;
    geometryType?: string;
    objectIdField?: string;
    extent?: { spatialReference?: { wkid?: number; latestWkid?: number } };
    sourceSpatialReference?: { wkid?: number; latestWkid?: number };
    supportsRollbackOnFailureParameter?: boolean;
  }>(url, {});
  if (!Array.isArray(j.fields)) throw new Error(tr('Талбарын жагсаалт ирсэнгүй'));

  const fields: FieldDef[] = [];
  const readOnly: FieldDef[] = [];
  for (const raw of j.fields) {
    const f = toField(raw);
    if (!f) continue;
    /* Системийн талбар ба үйлчилгээ өөрөө «засагдахгүй» гэснийг зөвхөн харуулна */
    if (SERVER_FIELD.test(f.name) || raw.editable === false) readOnly.push(f);
    else fields.push(f);
  }

  const meta: LayerMeta = {
    layerId,
    title: L.title ?? layerId,
    url,
    oidField: j.objectIdField || L.oid || OID,
    geom: j.geometryType ?? '',
    canUpdate: /update/i.test(j.capabilities ?? ''),
    canCreate: /create/i.test(j.capabilities ?? ''),
    canDelete: /delete/i.test(j.capabilities ?? ''),
    draw: drawOf(j.geometryType ?? ''),
    wkid: ((sr) => (typeof sr === 'number' ? sr : null))(
      j.sourceSpatialReference?.latestWkid ?? j.sourceSpatialReference?.wkid
      ?? j.extent?.spatialReference?.latestWkid ?? j.extent?.spatialReference?.wkid,
    ),
    rollback: j.supportsRollbackOnFailureParameter === true,
    fields,
    readOnly,
  };
  metaCache.set(layerId, meta);
  return meta;
}

/**
 * КЭШЛЭГДСЭН OID НЭР — синхрон, сүлжээгүй.
 */
export const cachedOidField = (layerId: string): string | null =>
  metaCache.get(layerId)?.oidField ?? null;

/* ══════════════════ Уншилт ══════════════════ */

/**
 * НЭГ мөрийг дугаараар нь БҮТНЭЭР татна.
 */
export async function loadRow(meta: LayerMeta, oid: number): Promise<Row | null> {
  if (!Number.isFinite(oid)) return null;
  const rows = await queryFeatures(meta.url, { where: oidWhere(meta, oid), limit: 1 });
  return rows.length ? rows[0] : null;
}

/**
 * ОБЪЕКТЫН ГЕОМЕТРИЙГ ТАТНА — vertex засварт зурагт буулгах.
 */
export async function loadGeometry(meta: LayerMeta, oid: number): Promise<unknown | null> {
  if (!Number.isFinite(oid)) return null;
  const j = await arcgisPost<{
    spatialReference?: Record<string, unknown>;
    features?: { geometry?: Record<string, unknown> }[];
  }>(`${meta.url}/query`, {
    where: oidWhere(meta, oid),
    outFields: meta.oidField,
    returnGeometry: 'true',
    outSR: '102100',
  });
  const g = j.features?.[0]?.geometry;
  if (!g) return null;
  return { ...g, spatialReference: j.spatialReference ?? { wkid: 102100 } };
}

/**
 * ЗӨВХӨН ГЕОМЕТРИЙГ бичнэ — атрибутыг хөндөхгүй.
 */
export async function saveGeometry(
  meta: LayerMeta,
  oid: number,
  geometry: unknown,
): Promise<void> {
  requireLayer(meta);
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));
  if (geometry == null) throw new Error(tr('Геометр зураагүй байна'));
  await applyAll(meta.url, meta.oidField, {
    updates: [{ [meta.oidField]: Math.trunc(oid), geometry }],
  });
}

/** Тухайн объектыг зурагт тодруулах / дахин татах SQL */
export const oidWhere = (meta: LayerMeta, oid: number): string =>
  `${meta.oidField} = ${Math.trunc(oid)}`;

/* ══════════════════ Маягтын утга ══════════════════ */

/**
 * Маягтын ноорог — БҮХ утга ТЕКСТЭЭР.
 */
export type Patch = Record<string, string>;

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Мөрөөс маягтын ноорог гаргана — засагдах талбарууд л орно */
export function rowToPatch(meta: LayerMeta, row: Row): Patch {
  const p: Patch = {};
  for (const f of meta.fields) p[f.name] = str(row[f.name]);
  return p;
}

/** ХООСОН ноорог — шинэ объект нэмэхэд */
export function emptyPatch(meta: LayerMeta): Patch {
  const p: Patch = {};
  for (const f of meta.fields) p[f.name] = '';
  return p;
}

/* ══════════════════ Шалгуур ══════════════════ */

/**
 * МАЯГТЫН ТООН ТЕКСТИЙГ задлана — тоо биш бол `null`.
 */
export function parseNum(raw: string): number | null {
  if (/%/.test(raw)) return null;
  const t = normCell(raw);
  if (t == null || !/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** Бичихэд — шалгуур давсан текст; задрахгүй бол хуучин `Number` (шалгуургүй дуудагчид) */
const toNum = (v: string): number => parseNum(v) ?? Number(v);

/**
 * ТОО ХЭМЖЭЭНИЙ талбар (урт · голч · тоо ширхэг · талбай…) — сөрөг утга УТГАГҮЙ.
 */
const QTY_NAME = /(urt|length|diam|golch|shirheg|count|talbai|area|urgun|width|zuzaan|thick|(^|_)too$)/i;
const QTY_ALIAS = /(урт|голч|диаметр|ширхэг|тоо хэмжээ|талбай|өргөн|зузаан)/i;
export function isQtyField(meta: LayerMeta, f: FieldDef): boolean {
  if (f.kind !== 'number') return false;
  if (lenFieldUnit(f.name, LAYER_BY_ID[meta.layerId]?.qty) != null) return true;
  return QTY_NAME.test(f.name) || QTY_ALIAS.test(f.alias);
}

export function validateRow(meta: LayerMeta, patch: Patch): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of meta.fields) {
    const v = patch[f.name] ?? '';
    if (v === '') {
      if (!f.nullable) e[f.name] = tr('Заавал бөглөнө');
      continue;
    }
    if (f.kind === 'number') {
      const x = v.trim() === '' ? null : parseNum(v);
      if (x == null) { e[f.name] = tr('Тоо оруулна уу — 12.5 гэж бичнэ үү'); continue; }
      if (x < 0 && isQtyField(meta, f)) { e[f.name] = tr('Сөрөг тоо байж болохгүй'); continue; }
      if (f.int) {
        const [lo, hi] = f.int === 'small' ? [-32768, 32767] : [-2147483648, 2147483647];
        if (!Number.isInteger(x)) e[f.name] = tr('Бүхэл тоо оруулна уу');
        else if (x < lo || x > hi) e[f.name] = tr('{0}…{1} хооронд байна', String(lo), String(hi));
      }
      if (!e[f.name] && f.codes && !f.codes.some((c) => c.code.trim() !== '' && Number(c.code) === x)) {
        e[f.name] = tr('Жагсаалтаас сонгоно уу');
      }
      continue;
    }
    if (f.length != null && v.length > f.length) {
      e[f.name] = tr('Хамгийн ихдээ {0} тэмдэгт', String(f.length));
    }
    if (f.codes && !f.codes.some((c) => c.code === v)) {
      e[f.name] = tr('Жагсаалтаас сонгоно уу');
    }
  }
  return e;
}

/**
 * БАЙГАА МӨРИЙН ЗАСВАР — ЗӨВХӨН ӨӨРЧИЛСӨН талбарыг шалгана (2026-09-30).
 */
export function validateChanged(meta: LayerMeta, before: Row, patch: Patch): Record<string, string> {
  const changed = new Set(Object.keys(diffRow(meta, before, patch)));
  return validateRow({ ...meta, fields: meta.fields.filter((f) => changed.has(f.name)) }, patch);
}

/* ══════════════════ Бичилт ══════════════════ */

/**
 * ӨӨРЧЛӨГДСӨН ТАЛБАРУУДЫГ ялгаж, `applyEdits`-ийн `attributes` болгоно.
 *
 * @returns өөрчлөлтгүй бол ХООСОН объект — дуудагч тал сүлжээнд огт залгахгүй
 */
export function diffRow(meta: LayerMeta, before: Row, patch: Patch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    const was = str(before[f.name]);
    const now = patch[f.name] ?? '';
    if (was === now) continue;
    if (now === '') { out[f.name] = null; continue; }
    out[f.name] = f.kind === 'number' ? toNum(now) : now;
  }
  return out;
}

/**
 * ЗАСВАРЫГ БУЦААХ АТРИБУТУУД — `diffRow`-ийн ЭСРЭГ утга.
 */
export function revertAttrs(
  meta: LayerMeta,
  before: Row,
  patch: Patch,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    const was = str(before[f.name]);
    const now = patch[f.name] ?? '';
    if (was === now) continue;
    out[f.name] = was === '' ? null : f.kind === 'number' ? Number(was) : was;
  }
  return out;
}

/**
 * ТҮҮХИЙ АТРИБУТУУДЫГ бичнэ — буцаалтад.
 */
export async function applyAttrs(
  meta: LayerMeta,
  oid: number,
  attrs: Record<string, unknown>,
): Promise<void> {
  requireLayer(meta);
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));
  if (!Object.keys(attrs).length) return;
  await applyAll(meta.url, meta.oidField, {
    updates: [{ [meta.oidField]: Math.trunc(oid), ...attrs }],
  });
}

/**
 * ОБЪЕКТ УСТГАНА — «шинээр нэмсэн»-ийг буцаахад.
 */
export async function deleteRow(meta: LayerMeta, oid: number): Promise<void> {
  requireLayer(meta);
  if (!meta.canDelete) throw new Error(tr('Энэ давхарга устгахыг зөвшөөрөхгүй байна'));
  await applyAll(meta.url, meta.oidField, { deletes: [Math.trunc(oid)] });
}

/**
 * БИЧИЛТИЙН ХАРИУ АЛДАГДСАН уу — үр дүн ТОДОРХОЙГҮЙ алдаа (timeout · сүлжээ тасрах ·
 * HTTP 5xx/JSON биш хариу). Серверийн ТОДОРХОЙ татгалзал (ArcGIS `error.code`, мөрийн
 * `success:false`, эрхийн алдаа) нь ЭНД орохгүй — тэр үед юу ч бичигдээгүй.
 */
export function isLostResponse(e: unknown): boolean {
  return isLostWrite(e);
}

/**
 * ШИНЭ ОБЪЕКТ нэмнэ — геометр ба атрибутаар.
 *
 * @returns шинэ объектын OBJECTID
 */
export async function createRow(
  meta: LayerMeta,
  geometry: unknown,
  patch: Patch,
): Promise<number> {
  requireLayer(meta);
  if (!meta.canCreate) throw new Error(tr('Энэ давхарга шинэ объект нэмэхийг зөвшөөрөхгүй байна'));
  if (geometry == null) throw new Error(tr('Геометр зураагүй байна'));

  const attrs: Record<string, unknown> = {};
  for (const f of meta.fields) {
    const v = patch[f.name] ?? '';
    if (v === '') continue;
    attrs[f.name] = f.kind === 'number' ? toNum(v) : v;
  }

  const r = await applyAll(meta.url, meta.oidField, {
    adds: [{ ...attrs, geometry }],
  });
  const oid = r.oids[0];
  if (oid == null) throw new Error(tr('Шинэ объект үүссэн ч дугаар нь ирсэнгүй'));
  return oid;
}

/**
 * Засварыг үйлчилгээнд бичнэ.
 *
 * @returns бичигдсэн талбарын тоо (0 = өөрчлөлт байгаагүй)
 */
export async function saveRow(
  meta: LayerMeta,
  oid: number,
  before: Row,
  patch: Patch,
): Promise<number> {
  const d = diffRow(meta, before, patch);
  const n = Object.keys(d).length;
  if (n === 0) return 0;
  requireLayer(meta);
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));

  await applyAll(meta.url, meta.oidField, {
    updates: [{ [meta.oidField]: Math.trunc(oid), ...d }],
  });
  return n;
}

/* ══════════════════ ОЛОН МӨР ЗЭРЭГ ЗАСАХ (2026-09-16) ══════════════════ */

const BATCH = 200;

const chunks = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

const inWhere = (meta: LayerMeta, oids: number[]): string =>
  `${meta.oidField} IN (${oids.map((o) => Math.trunc(o)).join(',')})`;

/** Олон мөрийг ТҮҮХИЙ утгаараа татна — буцаалтын «хуучин утга»-д */
export async function loadRows(meta: LayerMeta, oids: number[]): Promise<Row[]> {
  const parts = chunks(oids, BATCH);
  const out: Row[][] = new Array(parts.length);
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next++;
      out[i] = await queryFeatures(meta.url, { where: inWhere(meta, parts[i]) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, parts.length) }, worker));
  return out.flat();
}

/**
 * ГЕОМЕТРТ ОРСОН объектуудын дугаар — тэгш өнцөгт/полигоноор сонгоход.
 */
export async function queryOidsIn(meta: LayerMeta, geometry: unknown): Promise<number[]> {
  const sr = (geometry as { spatialReference?: { wkid?: number; latestWkid?: number } } | null)
    ?.spatialReference;
  const wkid = sr?.latestWkid ?? sr?.wkid ?? 102100;
  const rows = await queryFeatures(meta.url, {
    outFields: [meta.oidField],
    aoi: { geometry, wkid, type: 'polygon', rel: 'intersects' },
  });
  return rows
    .map((r) => Number(r[meta.oidField]))
    .filter((n) => Number.isFinite(n));
}

/** Мөр бүрийн үр дүн — бичигдсэн ба унасан мөрүүд */
export type RowsResult = {
  done: number[];
  failed: { oid: number; msg: string }[];
  unknown?: number[];
  skipped?: number[];
};

/**
 * МӨР БҮРИЙН ҮР ДҮНТЭЙ ЗАСВАР (2026-10-01, хэрэглэгч: бүгдийг зас).
 */
async function writeUpdatesEach(
  meta: LayerMeta,
  updates: Record<string, unknown>[],
): Promise<RowsResult & { stopped?: string }> {
  const oidOf = (u: Record<string, unknown>) => Math.trunc(Number(u[meta.oidField]));
  try {
    await applyAll(meta.url, meta.oidField, { updates });
    return { done: updates.map(oidOf), failed: [] };
  } catch (e) {
    if (isLostResponse(e) || (e as ArcGISError | null)?.sessionExpired === true) throw e;
    /* багц унав — мөр бүрээр тогтооно (доор) */
  }
  const out: RowsResult = { done: [], failed: [], unknown: [] };
  for (let i = 0; i < updates.length; i += 1) {
    const u = updates[i];
    try {
      await applyAll(meta.url, meta.oidField, { updates: [u] });
      out.done.push(oidOf(u));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lost = isLostResponse(e);
      if (lost || (e as ArcGISError | null)?.sessionExpired === true) {
        if (lost) {
          out.failed.push({ oid: oidOf(u), msg: tr('үр дүн тодорхойгүй — {0}', msg) });
          out.unknown?.push(oidOf(u));
        } else {
          out.failed.push({ oid: oidOf(u), msg });
        }
        for (const rest of updates.slice(i + 1)) {
          out.failed.push({ oid: oidOf(rest), msg: tr('илгээгдээгүй — {0}', msg) });
        }
        return { ...out, stopped: msg };
      }
      out.failed.push({ oid: oidOf(u), msg });
    }
  }
  return out;
}

/** Хэсэгчилсэн бичилтийн алдаа — `done`/`failed` хавсарсан */
const partialError = (res: RowsResult, cause?: unknown): Error => {
  const first = res.failed[0]?.msg ?? (cause instanceof Error ? cause.message : String(cause ?? ''));
  const err = new Error(first || tr('амжилтгүй')) as Error & Partial<RowsResult>;
  err.done = res.done.slice();
  err.failed = res.failed.slice();
  err.unknown = (res.unknown ?? []).slice();
  return err;
};

/**
 * ИЖИЛ атрибутыг ОЛОН мөрөнд бичнэ.
 *
 * @returns бичигдсэн мөрийн дугаарууд — багц дундаа унавал ӨМНӨХ багцууд
 *          бичигдсэн байх тул буцаалт зөвхөн тэдгээрт хамаарна.
 */
export async function saveRows(
  meta: LayerMeta,
  oids: number[],
  attrs: Record<string, unknown>,
): Promise<number[]> {
  requireLayer(meta);
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));
  if (!Object.keys(attrs).length || !oids.length) return [];
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(tr('«{0}» талбарын тоо буруу — 12.5 гэж бичнэ үү', k));
  }
  if (meta.rollback === false) {
    const acc: RowsResult = { done: [], failed: [], unknown: [] };
    const parts = chunks(oids, BATCH);
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      let r: Awaited<ReturnType<typeof writeUpdatesEach>>;
      try {
        r = await writeUpdatesEach(meta, part.map((oid) => ({ [meta.oidField]: Math.trunc(oid), ...attrs })));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const lost = isLostResponse(e);
        const failed = acc.failed.slice();
        for (const oid of part) failed.push({ oid: Math.trunc(oid), msg: lost ? tr('үр дүн тодорхойгүй — {0}', msg) : msg });
        for (const rest of parts.slice(i + 1)) for (const oid of rest) failed.push({ oid: Math.trunc(oid), msg: tr('илгээгдээгүй — {0}', msg) });
        const err = (e instanceof Error ? e : new Error(String(e))) as Error & Partial<RowsResult>;
        err.done = acc.done.slice();
        err.failed = failed;
        err.unknown = [...(acc.unknown ?? []), ...(lost ? part.map((o) => Math.trunc(o)) : [])];
        throw err;
      }
      acc.done.push(...r.done);
      acc.failed.push(...r.failed);
      acc.unknown?.push(...(r.unknown ?? []));
      if (r.stopped != null) {
        for (const rest of parts.slice(i + 1)) for (const oid of rest) acc.failed.push({ oid: Math.trunc(oid), msg: tr('илгээгдээгүй — {0}', r.stopped) });
        break;
      }
    }
    if (acc.failed.length) throw partialError(acc);
    return acc.done;
  }
  const done: number[] = [];
  for (const part of chunks(oids, BATCH)) {
    try {
      await applyAll(meta.url, meta.oidField, {
        updates: part.map((oid) => ({ [meta.oidField]: Math.trunc(oid), ...attrs })),
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      (err as Error & { done?: number[] }).done = done.slice();
      if (isLostResponse(e)) (err as Error & { unknown?: number[] }).unknown = part.map((o) => Math.trunc(o));
      throw err;
    }
    done.push(...part);
  }
  return done;
}

/**
 * Мөр бүрийн ӨӨРИЙН хуучин утгыг буцааж бичнэ (олон мөрийн буцаалт).
 */
export type RevertRow = { oid: number; attrs: Record<string, unknown>; wrote?: Record<string, unknown> };

/** Утгын харьцуулалт — `null`/'' нэг, тоо тоогоор */
const sameVal = (a: unknown, b: unknown): boolean => {
  const e = (v: unknown) => v == null || v === '';
  if (e(a) || e(b)) return e(a) && e(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
};

export async function revertRows(
  meta: LayerMeta,
  rows: RevertRow[],
): Promise<RowsResult> {
  requireLayer(meta);
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));
  let live = rows.filter((r) => Object.keys(r.attrs).length);
  const acc: RowsResult = { done: [], failed: [], skipped: [] };
  const cas = live.filter((r) => r.wrote && Object.keys(r.wrote).length);
  if (cas.length) {
    const skip = new Map<number, string>();
    let cur: Map<number, Row> | null = null;
    try {
      cur = new Map((await loadRows(meta, cas.map((r) => r.oid))).map((row) => [Math.trunc(Number(row[meta.oidField])), row]));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const r of cas) skip.set(Math.trunc(r.oid), tr('одоогийн утгыг уншиж чадсангүй — буцаалтыг алгаслаа: {0}', msg));
    }
    if (cur) {
      for (const r of cas) {
        const row = cur.get(Math.trunc(r.oid));
        if (!row) { skip.set(Math.trunc(r.oid), tr('мөр олдсонгүй — буцаалтыг алгаслаа')); continue; }
        const moved = Object.keys(r.attrs).find((k) => !sameVal(row[k], r.wrote?.[k]) && !sameVal(row[k], r.attrs[k]));
        if (moved != null) {
          skip.set(Math.trunc(r.oid), tr('өөр хэрэглэгч өөрчилсөн («{0}» одоо: «{1}») — буцаалтыг алгаслаа', moved, str(row[moved]) || '—'));
        }
      }
    }
    if (skip.size) {
      for (const [oid, msg] of skip) { acc.failed.push({ oid, msg }); if (cur) acc.skipped?.push(oid); }
      live = live.filter((r) => !skip.has(Math.trunc(r.oid)));
    }
  }
  const parts = chunks(live, BATCH);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    let r: Awaited<ReturnType<typeof writeUpdatesEach>>;
    try {
      r = await writeUpdatesEach(meta, part.map((x) => ({ [meta.oidField]: Math.trunc(x.oid), ...x.attrs })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const rest of parts.slice(i)) for (const x of rest) acc.failed.push({ oid: Math.trunc(x.oid), msg });
      return acc;
    }
    acc.done.push(...r.done);
    acc.failed.push(...r.failed);
    if (r.stopped != null) {
      for (const rest of parts.slice(i + 1)) for (const x of rest) acc.failed.push({ oid: Math.trunc(x.oid), msg: tr('илгээгдээгүй — {0}', r.stopped) });
      break;
    }
  }
  return acc;
}

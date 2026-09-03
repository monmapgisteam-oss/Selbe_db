'use client';

/**
 * ДЭД БҮТЦИЙН ОБЪЕКТЫН АТРИБУТ ЗАСАХ — өгөгдлийн давхарга.
 *
 * ⚠️ REACT ЭНД ОРОХГҮЙ. Зөвхөн унших/бичих/шалгах цэвэр функцүүд тул
 * `butetsEdit.check.mjs` түүнийг шууд импортлон шалгана (`parcelEdit.ts`-ийн
 * ижил зохион байгуулалт).
 *
 * ⚠️ ЯАГААД `parcelEdit.ts`-ийг ДАХИН АШИГЛААГҮЙ ВЭ. Тэр нь НЭГ үйлчилгээний
 * ТОГТМОЛ схемд (`PARCEL_LEFT.fields` — эзэмшигч, төлөв, явц…) бэхлэгдсэн:
 * талбар бүр нэрээрээ кодод бичигдсэн, `Parcel` төрөл нь тэр багануудыг
 * шууд тоолдог. Дэд бүтцийн 16 давхарга нь ӨӨР ӨӨР схемтэй — зарим нь
 * `DocName`, зарим нь `Layer`, цахилгааныхад `bagts_name`/`Length_km` нэмж
 * бий. Тэдгээрийг нэг тогтмол төрөлд шахвал давхарга бүрд «байхгүй талбар»
 * гарч, эсвэл 16 салангид маягт бичих хэрэг гарна. Тиймээс энэ модуль
 * СХЕМИЙГ ҮЙЛЧИЛГЭЭНЭЭС УНШИЖ маягтыг өөрөө байгуулна.
 *
 * ⚠️ ХАМГИЙН ЧУХАЛ ХОЁР ДҮРЭМ — `parcelEdit.ts`-ийнхтэй ИЖИЛ:
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
import { LAYER_BY_ID, layerUrl, OID, type LayerDef } from '@/lib/services';
import { queryFeatures, type Row } from '@/lib/query';
import { applyAll } from '@/lib/tableWrite';

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
   * Зурах хэрэгслийн төрөл — `geometryType`-аас.
   * `null` бол энэ давхаргад шинэ объект зурах боломжгүй (танигдахгүй геометр).
   */
  draw: 'point' | 'polyline' | 'polygon' | null;
  /** Засагдах талбарууд — маягтын оролтууд */
  fields: FieldDef[];
  /**
   * ЗӨВХӨН ХАРУУЛАХ талбарууд (системийн, геометрээс гарах).
   *
   * ⚠️ Идэвхгүй `input` болговол «яагаад бичиж болохгүй байна» гэсэн асуулт
   * төрөх тул ТОДОРХОЙЛОЛТ (`<dl>`) хэлбэрээр үзүүлнэ — `GazarEdit`-ийн
   * «Кадастрын дугаар / Талбай» хосын ижил шийдэл.
   */
  readOnly: FieldDef[];
};

/**
 * СЕРВЕР ӨӨРӨӨ УДИРДДАГ талбарууд — бичихгүй, маягтад оролт болгохгүй.
 *
 * ⚠️ `tableWrite.applyAll` ч мөн эдгээрийг хасдаг (`clean()`). Хоёр давхар
 * хамгаалалт САНААТАЙ: энд хасах нь маягтад ХАРАГДАХГҮЙ болгож,
 * тэнд хасах нь дурын дуудагчийн хүсэлт унахаас сэргийлнэ.
 */
const SERVER_FIELD = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor|se_anno)/i;

/** ArcGIS-ийн талбарын төрөл → маягтын төрөл. Тохирохгүйг `null` (алгасна). */
function kindOf(esriType: string): FieldKind | null {
  if (esriType === 'esriFieldTypeString') return 'text';
  if (
    esriType === 'esriFieldTypeDouble'
    || esriType === 'esriFieldTypeSingle'
    || esriType === 'esriFieldTypeInteger'
    || esriType === 'esriFieldTypeSmallInteger'
  ) return 'number';
  /**
   * ⚠️ Огноо, GlobalID, GUID, Blob, Raster, Geometry — ОРУУЛААГҮЙ. Эдгээр
   * давхаргуудад одоогоор огнооны талбар БАЙХГҮЙ (16/16 шалгасан, 2026-09-02)
   * тул огнооны сонгогч бичих нь ашиглагдахгүй код болно. Гарч ирвэл ЭНД
   * нэмнэ — түүнийг хүртэл огноотой талбар маягтад ОГТ гарахгүй, өөрөөр
   * хэлбэл санамсаргүй дарж бичих БОЛОМЖГҮЙ.
   */
  return null;
}

/** ArcGIS-ийн геометрийн төрөл → `SketchViewModel`-ийн хэрэгсэл */
function drawOf(t: string): 'point' | 'polyline' | 'polygon' | null {
  if (t === 'esriGeometryPoint') return 'point';
  if (t === 'esriGeometryPolyline') return 'polyline';
  if (t === 'esriGeometryPolygon') return 'polygon';
  /* ⚠️ Multipoint, Envelope — `SketchViewModel` дэмждэггүй тул ил `null`.
     Хуурамч утга буцаавал зурах товч гарч ирээд юу ч болохгүй байна. */
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
    nullable: f.nullable !== false,
    codes: cv
      ? cv.map((c) => ({ code: String(c.code ?? ''), label: String(c.name ?? c.code ?? '') }))
      : null,
  };
}

/**
 * ⚠️ ЗӨВХӨН АМЖИЛТТАЙ уншсан схемийг кэшлэнэ. Алдааг кэшлэвэл нэг удаагийн
 * сүлжээний доголдол хуудас дахин ачаалах хүртэл «энэ давхарга засагдахгүй»
 * гэж хуурамчаар хадгалагдана (`hyanalt.missingDirectorFields`-ийн сургамж).
 */
const metaCache = new Map<string, LayerMeta>();

/**
 * Давхаргын СХЕМИЙГ үйлчилгээнээс уншина.
 *
 * ⚠️ ArcGIS нь алдааг HTTP 200-ГААР буцаадаг (`{error:{…}}`) тул `res.ok`
 * хангалтгүй — БИЕИЙГ заавал шалгана. Үүнгүй бол `j.fields` нь `undefined`
 * болж «энэ давхаргад засагдах талбар алга» гэсэн ХУДАЛ дүгнэлт гарна.
 */
export async function loadLayerMeta(layerId: string): Promise<LayerMeta> {
  const hit = metaCache.get(layerId);
  if (hit) return hit;

  const L: LayerDef | undefined = LAYER_BY_ID[layerId];
  if (!L) throw new Error(tr('Давхарга танигдсангүй: {0}', layerId));

  const url = layerUrl(L);
  const res = await fetch(`${url}?f=json`);
  const j = (await res.json()) as {
    error?: { message?: string };
    fields?: RawField[];
    capabilities?: string;
    geometryType?: string;
    objectIdField?: string;
  };
  if (j.error) throw new Error(j.error.message || tr('ArcGIS алдаа'));
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
    /* ⚠️ Үйлчилгээний бодит OID нэрийг ЭРХЭМЛЭНЭ — давхаргын бүртгэл
       (`LayerDef.oid`) хоцорсон байж болно (`FID` → `OBJECTID` шилжилт). */
    oidField: j.objectIdField || L.oid || OID,
    geom: j.geometryType ?? '',
    canUpdate: /update/i.test(j.capabilities ?? ''),
    canCreate: /create/i.test(j.capabilities ?? ''),
    draw: drawOf(j.geometryType ?? ''),
    fields,
    readOnly,
  };
  metaCache.set(layerId, meta);
  return meta;
}

/* ══════════════════ Уншилт ══════════════════ */

/**
 * НЭГ мөрийг дугаараар нь БҮТНЭЭР татна.
 *
 * ⚠️ Газрын зургийн `onPick` нь давхаргын `outFields`-д АЧААЛАГДСАН талбарыг л
 * буцаадаг тул маягтыг тэр өгөгдлөөр нээвэл хагас бөглөгдсөн байж болно —
 * хадгалахад ЖИНХЭНЭ утгыг нь дарж бичих эрсдэлтэй (`loadParcel`-ийн ижил
 * шалтгаан). Тиймээс OID-г л авч мөрийг энд дахин татна.
 */
export async function loadRow(meta: LayerMeta, oid: number): Promise<Row | null> {
  if (!Number.isFinite(oid)) return null;
  const rows = await queryFeatures(meta.url, { where: oidWhere(meta, oid), limit: 1 });
  return rows.length ? rows[0] : null;
}

/**
 * ОБЪЕКТЫН ГЕОМЕТРИЙГ ТАТНА — vertex засварт зурагт буулгах.
 *
 * ⚠️ `queryFeatures`-ийг ХЭРЭГЛЭХГҮЙ: тэр нь `returnGeometry: 'false'`-ыг
 * ХАТУУ бичдэг бөгөөд зөвхөн атрибут буцаадаг. Түүнийг өөрчлөх нь порталын
 * бүх асуулгыг (~119 давхаргын нийлбэр, хайлт, дашбоард) хүндрүүлэх тул
 * энд ганц зориулалтын хүсэлт бичив.
 *
 * ⚠️ `outSR` нь ЗААВАЛ 102100 — эдгээр үйлчилгээ UTM 48N (32648)-д
 * хадгалагддаг ч зураг Web Mercator тул хөрвүүлэлгүй буулгавал объект
 * дэлхийн өөр буланд гарна.
 *
 * ⚠️ ArcGIS нь `spatialReference`-ийг ХАРИУНЫ ҮНДЭСТ буцаадаг, объект бүрийн
 * геометрт БИШ. Түүнийг гараар залгаж өгөхгүй бол буцааж бичихэд SR алдагдана.
 */
export async function loadGeometry(meta: LayerMeta, oid: number): Promise<unknown | null> {
  if (!Number.isFinite(oid)) return null;
  const res = await fetch(`${meta.url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      f: 'json',
      where: oidWhere(meta, oid),
      outFields: meta.oidField,
      returnGeometry: 'true',
      outSR: '102100',
    }),
  });
  const j = (await res.json()) as {
    error?: { message?: string };
    spatialReference?: Record<string, unknown>;
    features?: { geometry?: Record<string, unknown> }[];
  };
  /* ⚠️ ArcGIS алдааг HTTP 200-ГААР буцаадаг — биеийг ЗААВАЛ шалгана */
  if (j.error) throw new Error(j.error.message || tr('ArcGIS алдаа'));
  const g = j.features?.[0]?.geometry;
  if (!g) return null;
  return { ...g, spatialReference: j.spatialReference ?? { wkid: 102100 } };
}

/**
 * ЗӨВХӨН ГЕОМЕТРИЙГ бичнэ — атрибутыг хөндөхгүй.
 *
 * ⚠️ Атрибутыг ХАМТ илгээхгүй нь САНААТАЙ: vertex чирч байх зуур өөр хүн
 * тухайн мөрийн талбарыг зассан байж болно. Бүтэн мөрийг буцааж бичвэл
 * түүнийг чимээгүй дарна (файлын толгойн 1-р дүрэм).
 */
export async function saveGeometry(
  meta: LayerMeta,
  oid: number,
  geometry: unknown,
): Promise<void> {
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
 *
 * ⚠️ Тоог ч текстээр авч явна: `<input>` нь текст буцаадаг бөгөөд «0» ба
 * хоосон, «1.50» ба «1.5» хоёрын ялгааг тоо болгомогц алдана. Хөрвүүлэлт нь
 * ЗӨВХӨН бичих агшинд (`diffRow`) болно.
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
 * ⚠️ МЭДЭЭЛНЭ, ЗАСАХГҮЙ — хэрэглэгчийн бичсэнийг чимээгүй өөрчлөхгүй, зөвхөн
 * буруу гэдгийг хэлнэ (`validateParcel`-ийн зарчим).
 */
export function validateRow(meta: LayerMeta, patch: Patch): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of meta.fields) {
    const v = patch[f.name] ?? '';
    if (v === '') {
      /* ⚠️ Хоосон нь `null` болж бичигдэнэ — талбар nullable биш бол хориглоно */
      if (!f.nullable) e[f.name] = tr('Заавал бөглөнө');
      continue;
    }
    if (f.kind === 'number') {
      /* ⚠️ `Number('')` нь 0 — дээрх хоосон салаа үүнээс өмнө байх ЁСТОЙ */
      if (!Number.isFinite(Number(v))) e[f.name] = tr('Тоо оруулна уу');
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

/* ══════════════════ Бичилт ══════════════════ */

/**
 * ӨӨРЧЛӨГДСӨН ТАЛБАРУУДЫГ ялгаж, `applyEdits`-ийн `attributes` болгоно.
 *
 * ⚠️ Хоосон мөр → `null`, `""` БИШ. ArcGIS-ийн текст талбарт хоосон мөр бичвэл
 *    «утга байхгүй» биш «хоосон утга» болж, `IS NULL` шүүлтэд орохгүй.
 * ⚠️ ТҮҮХИЙ утгыг trim ХИЙХГҮЙ (файлын толгойн 2-р дүрэм).
 * ⚠️ Харьцуулалт нь ТЕКСТЭЭР: сервер `1.5`-ыг `1.5` гэж буцаадаг тул
 *    `String(before)` ба маягтын текст шууд тэнцэнэ. Тоо болгож харьцуулбал
 *    `NaN !== NaN` улмаас хоосон талбар бүр «өөрчлөгдсөн» гэж уншигдана.
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
    out[f.name] = f.kind === 'number' ? Number(now) : now;
  }
  return out;
}

/**
 * ЗАСВАРЫГ БУЦААХ АТРИБУТУУД — `diffRow`-ийн ЭСРЭГ утга.
 *
 * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН талбарын ХУУЧИН утгыг өгнө. Бүтэн мөрийг сэргээвэл
 * засвар хийснээс хойш өөр хүний бичсэн БУСАД баганыг дарна — буцаалт нь
 * өөрөө өгөгдөл алдагдуулах эрсдэл болно.
 *
 * ⚠️ Хуучин утга нь ХООСОН байсан бол `null` илгээнэ (`""` БИШ) —
 * `diffRow`-ийн ижил дүрэм.
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
 *
 * ⚠️ `saveRow`-оос ялгаатай нь ялгавар БОДОХГҮЙ: буцаах утгууд нь аль хэдийн
 * `revertAttrs`-аар шүүгдсэн бөгөөд тэдгээрийн зарим нь одоогийнхтой ижил
 * харагдаж болно (жишээ нь тоог `1.50` → `1.5` болгосон засвар).
 */
export async function applyAttrs(
  meta: LayerMeta,
  oid: number,
  attrs: Record<string, unknown>,
): Promise<void> {
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));
  if (!Object.keys(attrs).length) return;
  await applyAll(meta.url, meta.oidField, {
    updates: [{ [meta.oidField]: Math.trunc(oid), ...attrs }],
  });
}

/**
 * ОБЪЕКТ УСТГАНА — «шинээр нэмсэн»-ийг буцаахад.
 *
 * ⚠️ БУЦААХ АРГАГҮЙ: эдгээр үйлчилгээнд хувилбарын түүх асаагүй тул устгасан
 * мөр бүрмөсөн алга болно (`tableWrite`-ийн ижил анхааруулга). Дуудагч тал
 * ЗААВАЛ баталгаажуулалт асуух ёстой.
 */
export async function deleteRow(meta: LayerMeta, oid: number): Promise<void> {
  await applyAll(meta.url, meta.oidField, { deletes: [Math.trunc(oid)] });
}

/**
 * ШИНЭ ОБЪЕКТ нэмнэ — геометр ба атрибутаар.
 *
 * ⚠️ ГЕОМЕТР нь `__esri.Geometry.toJSON()`-ы үр дүн: `spatialReference`-ээ
 * АГУУЛСАН байх ЁСТОЙ. Эдгээр үйлчилгээ UTM 48N (32648)-д хадгалагддаг атал
 * зураг нь Web Mercator (102100) тул SR-гүй илгээвэл сервер координатыг
 * өөрийн проекц гэж уншиж, объект дэлхийн өөр буланд үүснэ.
 *
 * ⚠️ ХООСОН ТАЛБАРЫГ ОГТ ИЛГЭЭХГҮЙ (`null` ч бай): шинэ мөрөнд илгээгээгүй
 * талбар нь үйлчилгээний АНХДАГЧ утгаа авна (`templates`-ын prototype).
 * `null` шахвал тэр анхдагчийг дарж бичнэ.
 *
 * @returns шинэ объектын OBJECTID
 */
export async function createRow(
  meta: LayerMeta,
  geometry: unknown,
  patch: Patch,
): Promise<number> {
  if (!meta.canCreate) throw new Error(tr('Энэ давхарга шинэ объект нэмэхийг зөвшөөрөхгүй байна'));
  if (geometry == null) throw new Error(tr('Геометр зураагүй байна'));

  const attrs: Record<string, unknown> = {};
  for (const f of meta.fields) {
    const v = patch[f.name] ?? '';
    if (v === '') continue;
    attrs[f.name] = f.kind === 'number' ? Number(v) : v;
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
 * ⚠️ `applyAll` (`tableWrite.ts`) НЭГ атом хүсэлтээр явуулж, `rollbackOnFailure`
 * тавьж, серверийн талбарыг хасаж, HTTP-200-аар ирдэг мөр бүрийн алдааг
 * шалгадаг — шинэ `applyEdits` бичих шаардлагагүй.
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
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));

  await applyAll(meta.url, meta.oidField, {
    updates: [{ [meta.oidField]: Math.trunc(oid), ...d }],
  });
  return n;
}

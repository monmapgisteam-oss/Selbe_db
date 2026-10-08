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
import { AUTH, LAYER_BY_ID, layerUrl, OID, type LayerDef } from '@/lib/services';
import { ArcGISError, arcgisPost, queryFeatures, type Row } from '@/lib/query';
import { currentUser, requireCap } from '@/lib/who';
import { canEditButetsLayer } from '@/lib/butetsAcl';

/**
 * ⚠️ LIB-ТҮВШНИЙ ХҮРЭЭ (2026-09-23 аудит): урьд нь зөвхөн `butets` ЭРХ
 *    шалгагдаж, багцын хүрээ (`butetsAcl`) нь UI-ийн товчны `disabled`-д
 *    л байв. Багц хасагдсаны дараа нээлттэй үлдсэн маягтаас «Устгах» /
 *    «Хэлбэр засах» / «Үйлдэл буцаах» нь хүрээний ГАДНАХ давхаргад бичиж
 *    чаддаг байв. Одоо бичих функц бүр давхаргаа хүрээгээр шалгана.
 *    `requireCap`-тай ижил: Node (тест, tools) орчинд хаахгүй.
 */
function requireLayer(meta: LayerMeta): void {
  requireCap('butets');
  if (typeof window === 'undefined') return;
  /* ⚠️ Нэвтрэлт УНТРААЛТТАЙ (`AUTH_OFF=1`, `appId` хоосон) орчинд `currentUser()`
     нь `null` → хүрээ `[]` → бүх бичилт шидэгддэг байв (2026-09-24).
     `hasCap`-тай ижил: тэр горимд хаахгүй. */
  if (!AUTH.appId) return;
  if (canEditButetsLayer(currentUser(), meta.layerId)) return;
  throw new Error(tr('«{0}» давхарга таны багцын хүрээнд байхгүй — засах эрхгүй.', meta.title));
}
import { applyAll } from '@/lib/tableWrite';
import { normCell } from '@/modules/sheet/paste';
import { lenFieldUnit } from '@/lib/butetsLen';

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
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь бүхэл талбарт «2.5» эсвэл
   *    хязгаараас хэтэрсэн тоо шалгуурыг давж, сервер дээр чимээгүй тайрагдах/
   *    унах байв. `validateRow` одоо татгалзана.
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
   * ⚠️ 2026-09-24: урьд нь шалгагдахгүй байсан тул Delete-гүй үйлчилгээнд
   *    хүсэлт явж, серверийн бүрхэг алдаагаар унадаг байв.
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
   * ⚠️ 2026-10-01: инженерийн давхаргууд 32648 (UTM 48N, амьдаар баталсан).
   */
  wkid?: number | null;
  /**
   * `supportsRollbackOnFailureParameter` — `false` бол ОЛОН мөрийн бичилт атом БИШ:
   * багц дундаа унахад зарим мөр бичигдсэн үлдэнэ. Тэр үед мөр бүрийн үр дүнг
   * уншиж ХЭСЭГЧИЛСЭН алдааг ил мэдээлнэ (`saveRows`/`revertRows`, 2026-10-01).
   * Өгөөгүй (хуучин кэш, тест) бол `true` гэж үзнэ.
   * ⚠️ 2026-10-09: метадатад `supportsRollbackOnFailureParameter` БАЙХГҮЙ (undefined) бол
   *    `loadLayerMeta` нь `false` тавина — дэмжлэг нотлогдоогүй давхаргыг атом гэж таамаглахгүй
   *    (мөр бүрийн үр дүнгээр бичих нь удаан ч хагас бичилтийг нуухгүй).
   */
  rollback?: boolean;
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
    int: f.type === 'esriFieldTypeSmallInteger' ? 'small' : f.type === 'esriFieldTypeInteger' ? 'int' : null,
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
 * ⚠️ ЯВЖ БУЙ хүсэлт (2026-09-24). Урьдчилан татах (`pickTemplate`, товшилт) ба
 *    маягт нээгдэх хоёр ЗЭРЭГ дуудахад ижил давхаргын `?f=json` хоёр удаа явдаг
 *    байв. Одоо хоёр дахь нь эхнийхийг хүлээнэ. Алдаа гарвал устгагдана —
 *    `metaCache`-ийн «алдааг кэшлэхгүй» дүрэм хэвээр.
 */
const metaInflight = new Map<string, Promise<LayerMeta>>();

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
  /* ⚠️ HTTP алдаа (proxy/CDN-ийн 502, 401 HTML) — JSON парс хийхээс ӨМНӨ, 200-аар
     ирдэг `{error}` — бүгд `query.arcgisPost`-д (2026-09-30; урьд нь GET + токен
     query string-д). Эс бөгөөс «талбарын жагсаалт ирсэнгүй» гэсэн төөрөгдүүлсэн
     мэдээ гардаг байв. */
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
    /* ⚠️ Үйлчилгээний бодит OID нэрийг ЭРХЭМЛЭНЭ — давхаргын бүртгэл
       (`LayerDef.oid`) хоцорсон байж болно (`FID` → `OBJECTID` шилжилт). */
    oidField: j.objectIdField || L.oid || OID,
    geom: j.geometryType ?? '',
    canUpdate: /update/i.test(j.capabilities ?? ''),
    canCreate: /create/i.test(j.capabilities ?? ''),
    canDelete: /delete/i.test(j.capabilities ?? ''),
    draw: drawOf(j.geometryType ?? ''),
    /* ⚠️ 2026-10-01: SR ба атом бичилтийн дэмжлэг — метадатаас (feature-detect) */
    /* ⚠️ 2026-10-09 (БУЦААВ): `sourceSpatialReference` ЭХЭНД — энэ нь ХАДГАЛАЛТЫН SR бөгөөд
       `Shape__Length`/`Shape__Area`-г сервер ЯГ үүгээр боддог (`butetsLen.measureKind` нь
       «энэ талбар хавтгай метр үү» гэдгийг шийднэ). `extent.spatialReference` нь зөвхөн
       хамрах хүрээний харагдацын SR — хадгалалтаас ялгаатай байж болох (жишээ: 4326-д
       хадгалсан ч extent 102100) тул ЗӨВХӨН source алга үед нөөц. Өглөөний (extent эхэнд)
       өөрчлөлт 4326-д хадгалсан давхаргыг «хавтгай» гэж үзэж градусыг метр болгох эрсдэлтэй. */
    wkid: ((sr) => (typeof sr === 'number' ? sr : null))(
      j.sourceSpatialReference?.latestWkid ?? j.sourceSpatialReference?.wkid
      ?? j.extent?.spatialReference?.latestWkid ?? j.extent?.spatialReference?.wkid,
    ),
    /* ⚠️ 2026-10-09: ЗӨВХӨН ил `true` үед атом — `LayerMeta.rollback`-ийн тайлбар */
    rollback: j.supportsRollbackOnFailureParameter === true,
    fields,
    readOnly,
  };
  metaCache.set(layerId, meta);
  return meta;
}

/**
 * КЭШЛЭГДСЭН OID НЭР — синхрон, сүлжээгүй.
 *
 * ⚠️ 2026-09-24: зурагт товшсон объектын дугаарыг `LayerDef.oid` бүртгэлээс
 *    уншдаг байсан бол бичилт нь серверийн `objectIdField`-ээр явдаг байв —
 *    хоёр нэр зөрвөл (`FID` → `OBJECTID`) буруу мөр засагдана. Схем аль хэдийн
 *    ирсэн бол ЭНЭ нэрийг эрхэмлэнэ; ирээгүй бол `null` — дуудагч атрибутын
 *    түлхүүрээс, дараа нь бүртгэлээс хайна.
 */
export const cachedOidField = (layerId: string): string | null =>
  metaCache.get(layerId)?.oidField ?? null;

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
  /* ⚠️ HTTP алдааг JSON парсаас ӨМНӨ, 200-аар ирдэг `{error}` — `query.arcgisPost` (2026-09-30) */
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
  requireLayer(meta); // ⚠️ lib-түвшний эрх + багцын хүрээ
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
 * МАЯГТЫН ТООН ТЕКСТИЙГ задлана — тоо биш бол `null`.
 *
 * ⚠️ 2026-10-05: `inputMode="decimal"` нь mn/ru утасны гарт ТАСЛАЛ товч гаргадаг атал
 *    `Number('12,5')` нь NaN — «Тоо оруулна уу» гэдгээс өөр тайлбаргүй унадаг байв.
 *    Бөглөх хуудастай НЭГ дүрэм (`paste.normCell`): «12,5» → 12.5, «1 250» → 1250,
 *    «1,250» нь тодорхойгүй тул тоо БИШ.
 * ⚠️ `1e3` · `0x10` · `Infinity` — `Number` тоо гэж уншдаг ч хэрэглэгч ингэж тоо
 *    бичдэггүй (үсэг андуурч дарсан) тул татгалзана. Хувийн тэмдэг ч мөн (`normCell`
 *    хасдаг, энд утгагүй).
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
 * ⚠️ 2026-10-05: «-50» урт/голч хадгалагддаг байв. Схем давхарга бүрд өөр тул нэр/alias-аар
 *    таана; өндөржилт · координат зэрэг сөрөг байж БОЛОХ талбарыг санаатай хамруулаагүй.
 */
const QTY_NAME = /(urt|length|diam|golch|shirheg|count|talbai|area|urgun|width|zuzaan|thick|(^|_)too$)/i;
const QTY_ALIAS = /(урт|голч|диаметр|ширхэг|тоо хэмжээ|талбай|өргөн|зузаан)/i;
export function isQtyField(meta: LayerMeta, f: FieldDef): boolean {
  if (f.kind !== 'number') return false;
  if (lenFieldUnit(f.name, LAYER_BY_ID[meta.layerId]?.qty) != null) return true;
  return QTY_NAME.test(f.name) || QTY_ALIAS.test(f.alias);
}

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
      /* ⚠️ `Number('')` нь 0 — дээрх хоосон салаа үүнээс өмнө байх ЁСТОЙ.
         ⚠️ 2026-09-30: ЗӨВХӨН ХООСОН ЗАЙ ('  ') ч мөн `Number`-т 0 — урьд нь шалгуур давж
         тоон талбарт 0 бичигддэг байв (олноор засахад «— олон утга —» талбарт зай дарахад
         БҮХ мөрөнд 0). Тоо биш гэж хэлнэ; хоослох бол талбарыг бүр хоосолно. */
      /* ⚠️ 2026-10-05: `parseNum` (таслал · мянгатын зай зөвшөөрнө; `1e3`/`0x10` үгүй) + жишээтэй мессеж */
      const x = v.trim() === '' ? null : parseNum(v);
      if (x == null) { e[f.name] = tr('Тоо оруулна уу — 12.5 гэж бичнэ үү'); continue; }
      if (x < 0 && isQtyField(meta, f)) { e[f.name] = tr('Сөрөг тоо байж болохгүй'); continue; }
      /* ⚠️ 2026-10-01: БҮХЭЛ талбар — бутархай ба хязгаараас гарсныг татгалзана (`FieldDef.int`) */
      if (f.int) {
        const [lo, hi] = f.int === 'small' ? [-32768, 32767] : [-2147483648, 2147483647];
        if (!Number.isInteger(x)) e[f.name] = tr('Бүхэл тоо оруулна уу');
        else if (x < lo || x > hi) e[f.name] = tr('{0}…{1} хооронд байна', String(lo), String(hi));
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
 *
 * ⚠️ `diffRow` хөндөөгүй талбарыг ОГТ бичдэггүй тул тэдгээрийг шалгах утгагүй — харин
 *    хуучин өгөгдөлд домэйнээс гарсан код эсвэл заавал талбарт хоосон утга байвал
 *    хэрэглэгч огт хөндөөгүй талбарын алдаанаас болж ӨӨР талбараа хадгалж чаддаггүй
 *    байв. Шинэ объектод (`createRow`) бүх талбарыг `validateRow`-оор хэвээр.
 */
export function validateChanged(meta: LayerMeta, before: Row, patch: Patch): Record<string, string> {
  const changed = new Set(Object.keys(diffRow(meta, before, patch)));
  return validateRow({ ...meta, fields: meta.fields.filter((f) => changed.has(f.name)) }, patch);
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
    out[f.name] = f.kind === 'number' ? toNum(now) : now;
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
  requireLayer(meta);
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
  requireLayer(meta);
  if (!meta.canDelete) throw new Error(tr('Энэ давхарга устгахыг зөвшөөрөхгүй байна'));
  await applyAll(meta.url, meta.oidField, { deletes: [Math.trunc(oid)] });
}

/**
 * БИЧИЛТИЙН ХАРИУ АЛДАГДСАН уу — үр дүн ТОДОРХОЙГҮЙ алдаа (timeout · сүлжээ тасрах ·
 * HTTP 5xx/JSON биш хариу). Серверийн ТОДОРХОЙ татгалзал (ArcGIS `error.code`, мөрийн
 * `success:false`, эрхийн алдаа) нь ЭНД орохгүй — тэр үед юу ч бичигдээгүй.
 *
 * ⚠️ 2026-10-05: `applyEdits` сервер дээр БИЧИГДЭЭД хариу нь замдаа алдагдвал маягт
 *    «алдаа» гэж үлдэж, «Нэмэх»-ийг дахин дарахад объект ДАВХАРДАЖ үүсдэг байв.
 *    Дуудагч энэ үед дахин илгээхийг хааж, хэрэглэгчээр шалгуулна (бичилтийг АВТОМАТААР
 *    дахин оролдохгүй — `query.attemptRequest`-ийн дүрэм).
 */
/* ⚠️ 2026-10-09: HTTP 400/401/403/404 бол сервер хүсэлтийг ГҮЙЦЭТГЭЭГҮЙ гэсэн ТОДОРХОЙ
   татгалзал (буруу URL · эрхгүй · давхарга алга) — урьд нь `code == null` тул «хариу алдагдсан»
   гэж тооцогдож, хэрэглэгчийг дэмий «шалгаад дахин ачаал» гэж зовоодог байв. Үлдсэн нь
   (5xx · сүлжээ · timeout · JSON биш хариу) үр дүн тодорхойгүй хэвээр. */
const DEFINITE_HTTP = new Set([400, 401, 403, 404]);
export function isLostResponse(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  if (!(e instanceof ArcGISError) || e.code != null) return false;
  return e.status == null || !DEFINITE_HTTP.has(e.status);
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
  requireLayer(meta);
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));

  await applyAll(meta.url, meta.oidField, {
    updates: [{ [meta.oidField]: Math.trunc(oid), ...d }],
  });
  return n;
}

/* ══════════════════ ОЛОН МӨР ЗЭРЭГ ЗАСАХ (2026-09-16) ══════════════════ */

/**
 * ⚠️ Хэрэглэгчийн хүсэлт: «нэг давхаргын олон мөрийг сонгож нэг бөглөхөд
 * бүгдэд нь бичигдэх — ArcGIS Pro-гийн Calculate Field шиг, гэхдээ илүү
 * амар». Нэг давхаргаар хязгаарлагдана: давхарга бүр өөр схемтэй тул нэг
 * маягт зөвхөн нэг схемийг л зурж чадна.
 *
 * ⚠️ IN нөхцлийн УРТ: ArcGIS Online нь `IN (…)`-д хэдэн мянган утга даадаг ч
 * POST-ын биеийг хэт томруулахгүйн тулд 200-аар багцална. `applyEdits` ч мөн
 * адил — `bagtsSheet.applyUpdates`-ийн 500-ын сургамж (`rollbackOnFailure`
 * зөвхөн нэг багц дотор үйлчилнэ) энд ч хамаарна: багц тус бүр атом, харин
 * багцуудын хооронд бус. Тиймээс дуудагч тал амжилттай бичигдсэн мөрүүдийг
 * л буцаах жагсаалтад авна (`saveRows` нь бичигдсэн oid-уудыг буцаадаг).
 */
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
  /* ⚠️ ЗЭРЭГ татна (2026-09-24) — уншилт тул дараалал хамаагүй; 1000 объект
     сонгоход 5 хүсэлт дараалан хүлээдэг байв. 4-өөр хязгаарлаж серверийг
     дарахгүй. Үр дүнгийн дараалал багцын дарааллаар хадгалагдана. */
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
 *
 * ⚠️ `geometry` нь `toJSON()` хэлбэр, `spatialReference`-ээ агуулсан (зураг
 * Web Mercator 102100). Үйлчилгээ UTM 48N-д хадгалагддаг тул `inSR`-ийг
 * ЗААВАЛ дамжуулна — эс бөгөөс сервер координатыг өөрийн проекц гэж уншиж,
 * юу ч олдохгүй (`loadGeometry`-ийн ижил анхааруулга).
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
  /**
   * ⚠️ 2026-10-09: хариу АЛДАГДСАН мөрүүд (`failed`-д ч бий) — бичигдсэн эсэх нь тодорхойгүй тул
   * дуудагч буцаалтад (`undo`) оруулна. Хуучин дуудагчид үл тоож болно (сонголттой).
   */
  unknown?: number[];
  /**
   * ⚠️ 2026-10-09: `revertRows`-ийн CAS-аар АЛГАССАН мөрүүд (`failed`-д ч бий, шалтгаантай) —
   * одоогийн утга нь манай бичсэн ч, хуучин ч биш (өөр хэрэглэгч өөрчилсөн) эсвэл дахин уншиж чадаагүй.
   */
  skipped?: number[];
};

/**
 * МӨР БҮРИЙН ҮР ДҮНТЭЙ ЗАСВАР (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * ⚠️ `supportsRollbackOnFailureParameter: false` давхаргад `rollbackOnFailure` ҮЙЛЧЛЭХГҮЙ —
 *    `applyAll` нь эхний унасан мөрөөр бүхэл багцыг «бичигдээгүй» гэж шиддэг тул
 *    үнэндээ БИЧИГДСЭН мөрүүд буцаалтгүй, мэдэгдэлгүй үлддэг байв.
 * ⚠️ АРГА: эхлээд багцаар (`applyAll`); унавал ТЭР багцын мөр бүрийг ДАН хүсэлтээр дахин
 *    бичиж, аль нь бичигдэх / аль нь унахыг ЯГ тогтооно. Бичих утга нь мөр бүрт ижил
 *    (идемпотент) тул атом бус давхаргад хагас бичигдсэн мөрийг дахин бичих нь аюулгүй.
 *    Атом давхаргад унасан багц юу ч бичээгүй тул мөрөөр дахин оролдох нь бичигдэх
 *    боломжтой мөрүүдийг бичнэ (буцаалтад хамгийн ихийг сэргээнэ).
 * ⚠️ Бичилт нь ЗӨВХӨН `tableWrite.applyAll`-аар (серверийн талбар хасах, HTTP-200 алдаа,
 *    дутуу хариу — бүгд тэнд); кэшийг дуудагч (`DedButets` → `dropTotalsCache`) хаяна.
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
    /* ⚠️ 2026-10-09: мөрөөр дахин бичих нь ЗӨВХӨН серверийн ТОДОРХОЙ татгалзалд. Хариу
       алдагдсан (timeout · сүлжээ) эсвэл нэвтрэлт дууссан үед урьд нь мөр бүрийг ДАХИН
       илгээдэг байв — `isLostResponse`-ийн «бичилтийг автоматаар дахин оролдохгүй» дүрмийг
       зөрчиж, үр дүн тодорхойгүй багцыг дахин бичнэ. Тэр үед алдааг ДАМЖУУЛНА. */
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
      /* ⚠️ 2026-10-09: мөрийн хариу АЛДАГДСАН (timeout · сүлжээ · 5xx) эсвэл нэвтрэлт ДУУССАН —
         урьд нь дараагийн мөр бүрийг үргэлжлүүлэн илгээж (мөр бүр 30с timeout хүлээх · хугацаа
         дууссан токеноор дэмий хүсэлт) байв. ЭНД ЗОГСОНО: энэ ба ҮЛДСЭН мөрүүд `failed`.
         Хариу алдагдсан мөр БИЧИГДСЭН байж магадгүй тул «тодорхойгүй» гэж тэмдэглээд `unknown`-д
         нэмнэ — дуудагч буцаалтад (`undo`) оруулна (хуучин утгаа дахин бичих нь идемпотент). */
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
  requireLayer(meta); // ⚠️ lib-түвшний эрх + багцын хүрээ
  if (!meta.canUpdate) throw new Error(tr('Энэ давхарга засварыг зөвшөөрөхгүй байна'));
  if (!Object.keys(attrs).length || !oids.length) return [];
  /* ⚠️ 2026-10-05: NaN/Infinity нь JSON-д `null` болж талбарыг ЧИМЭЭГҮЙ хоосолно. Шалгуур
     одоо «12,5»-ыг зөвшөөрдөг тул дуудагч `Number(v)`-ээр хөрвүүлбэл NaN гарна —
     дуудагч `parseNum` хэрэглэх ёстой; энд сүүлчийн хамгаалалт. */
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(tr('«{0}» талбарын тоо буруу — 12.5 гэж бичнэ үү', k));
  }
  /* ⚠️ 2026-10-01: АТОМ БУС давхарга — мөр бүрийн үр дүнгээр (`writeUpdatesEach`). Бүх
     багцыг ДУУСТАЛ явуулж, унасныг цуглуулна; нэг ч унасан бол `done`/`failed`-тэй шиднэ. */
  if (meta.rollback === false) {
    const acc: RowsResult = { done: [], failed: [], unknown: [] };
    const parts = chunks(oids, BATCH);
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      let r: Awaited<ReturnType<typeof writeUpdatesEach>>;
      try {
        r = await writeUpdatesEach(meta, part.map((oid) => ({ [meta.oidField]: Math.trunc(oid), ...attrs })));
      } catch (e) {
        /* ⚠️ 2026-10-09: хариу алдагдсан/нэвтрэлт дууссан (`writeUpdatesEach` шиднэ) — өмнөх
           багцуудын `done`-г атом замын ижлээр алдаанд хавсарна (алдааны төрөл хэвээр).
           ⚠️ 2026-10-09 (2): `failed` ба `unknown`-г МӨН хавсарна — урьд нь зөвхөн `done` ирж,
           дуудагч энэ ба үлдсэн багцын мөрүүдийг «бичигдсэн/бичигдээгүй»-гээр ялгаж чаддаггүй
           байв. Хариу алдагдсан бол ЭНЭ багц тодорхойгүй (`unknown` → буцаалтад орно), үлдсэн
           багцууд илгээгдээгүй. Нэвтрэлт дууссан бол энэ багц ч бичигдээгүй. */
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
      /* ⚠️ 2026-10-09: мөрийн түвшинд хариу алдагдсан/нэвтрэлт дууссан (`writeUpdatesEach` ЗОГССОН)
         бол ҮЛДСЭН багцыг илгээхгүй — тэдгээр нь «илгээгдээгүй». */
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
      /* ⚠️ ХЭСЭГЧИЛСЭН БИЧИЛТ (2026-09-17): 2 дахь багц унавал эхнийх нь сервер дээр
         бичигдсэн — дуудагч мэдэх ёстой (`done` алдаанд хавсарна). Дахин «Хадгалах»
         дарахад ижил утга дахин бичигдэх тул аюулгүй. */
      const err = e instanceof Error ? e : new Error(String(e));
      (err as Error & { done?: number[] }).done = done.slice();
      /* ⚠️ 2026-10-09: хариу алдагдсан бол ЭНЭ багц тодорхойгүй — буцаалтад оруулна (`unknown`) */
      if (isLostResponse(e)) (err as Error & { unknown?: number[] }).unknown = part.map((o) => Math.trunc(o));
      throw err;
    }
    done.push(...part);
  }
  return done;
}

/**
 * Мөр бүрийн ӨӨРИЙН хуучин утгыг буцааж бичнэ (олон мөрийн буцаалт).
 *
 * ⚠️ Мөр бүр ӨӨР утгатай тул `saveRows` шиг нэг атрибут түгээхгүй —
 * `revertAttrs`-аар мөр тус бүрт бэлдсэн атрибутыг тэр мөрөнд л бичнэ.
 */
/**
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ХЭСЭГЧИЛСЭН УНАЛТЫГ МЭДЭЭЛНЭ. Урьд нь эхний
 *    унасан багцаар шидэж, өмнөх багцууд буцаагдсан ч «Үйлдэл буцаах» бүхэлдээ алдаа
 *    мэт харагдаж, дахин дарахад аль хэдийн буцаасан мөрүүдийг ДАХИН бичдэг байв.
 *    Одоо бүх багцыг явуулж `{ done, failed }` БУЦААНА (шидэхгүй) — дуудагч зөвхөн
 *    унасан мөрүүдийг дахин буцаах боломжтой үлдээнэ (`writeUpdatesEach`: багцаар, унавал
 *    мөр бүрээр).
 */
/**
 * ⚠️ 2026-10-09: `wrote` — манай БИЧСЭН (шинэ) утга. Өгсөн мөрийг буцаахын ӨМНӨ дахин уншиж,
 *    талбар бүрийн одоогийн утга нь `wrote` ч, `attrs` (хуучин) ч биш бол АЛГАСНА (CAS маягийн).
 *    Хариу АЛДАГДСАН (`unknown`) мөрүүдэд: бичигдсэн эсэх тодорхойгүй тул хооронд нь өөр хэрэглэгч
 *    засвар оруулсан бол түүнийг хуучин утгаар ЧИМЭЭГҮЙ дарахгүй.
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
  /* ⚠️ 2026-10-09: CAS — `wrote`-тэй мөрүүдийг дахин уншина (`RevertRow`-ийн ⚠️). Уншилт унавал
     тэдгээрийг БУЦААХГҮЙ (тодорхойгүй дээр бусдын утгыг дарахгүй), `failed` + `skipped`. */
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
      for (const [oid, msg] of skip) { acc.failed.push({ oid, msg }); acc.skipped?.push(oid); }
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
      /* ⚠️ 2026-10-09: `writeUpdatesEach` хариу алдагдсан/нэвтрэлт дууссан үед шиднэ. Энэ функц
         ШИДДЭГГҮЙ гэрээтэй тул ЭНЭ ба ҮЛДСЭН багцын мөрүүдийг `failed` болгоно — буцаалт нь
         идемпотент (хуучин утгаа дахин бичнэ) тул «Үйлдэл буцаах»-аар дахин оролдоход аюулгүй. */
      const msg = e instanceof Error ? e.message : String(e);
      for (const rest of parts.slice(i)) for (const x of rest) acc.failed.push({ oid: Math.trunc(x.oid), msg });
      return acc;
    }
    acc.done.push(...r.done);
    acc.failed.push(...r.failed);
    /* ⚠️ 2026-10-09: мөрийн түвшинд зогссон (хариу алдагдсан/нэвтрэлт дууссан) — үлдсэн багцыг
       илгээхгүй, `failed` болгоно (дахин «Үйлдэл буцаах»-аар оролдоно). */
    if (r.stopped != null) {
      for (const rest of parts.slice(i + 1)) for (const x of rest) acc.failed.push({ oid: Math.trunc(x.oid), msg: tr('илгээгдээгүй — {0}', r.stopped) });
      break;
    }
  }
  return acc;
}

import { t as tr } from '@/lib/i18nCore';
import Query from '@arcgis/core/rest/support/Query';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryEngineAsync from '@arcgis/core/geometry/geometryEngineAsync';
import Polyline from '@arcgis/core/geometry/Polyline';
import * as projectOperator from '@arcgis/core/geometry/operators/projectOperator';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import { LAYER_BY_ID, layerUrl, oidOf, ZONE_LAYER, ZONE_FIELDS, zoneType } from '@/lib/services';
import { polygonCenterlinesAsync } from '@/lib/polygonCenterlineAsync';
import { queryPageSafe } from '@/lib/planOverlap';
import { register } from '@/lib/dataBus';

/**
 * «ХЭСЭГЧИЛСЭН ЕТ» → 01 ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨНИЙ ӨӨРЧЛӨЛТ (2026-10-13, хэрэглэгчийн заавар).
 *
 * Шинэчлэгдсэн (Redesign, `rd:*`) тоо хэмжээ + өмнөх ерөнхий төлөвлөгөөнөөс (`sb:*`, `zone`)
 * ХЭДИЙ ХЭМЖЭЭГЭЭР нэмэгдсэн:
 *   · Бүс — ТОО; · Автозам · Дугуйн зам · Явган зам — УРТ; · Ногоон байгууламж — ТАЛБАЙ.
 * Дарахад дотор нь ЗАДАРНА: Бүс → `zone` аттрибутаар (төрөл); бусад нь ОРОН ЗАЙН — шинэчлэгдсэн
 * бүсийн төрөл бүрийн (Commercial, GER …) дотор орсон хэмжээгээр (хэрэглэгчийн сонголт; тэдгээрт
 * утгатай аттрибут байхгүй).
 *
 * УРТ — эх полигоны бүтэн сүлжээнээс raster skeleton тэнхлэг тооцож, ДАРАА нь харьцуулах хүрээ
 * болон бүсээр тайрна. Давхарга дотор давхардсан полигонуудыг эхлээд нэгтгэнэ. Нарийвчлалыг мөр бүрд
 * бодит газрын метрээр мэдээлнэ. Тэнхлэг гаргаж чадаагүй объектыг 0 урт гэж тооцохгүй.
 * Тэнхлэг нь ЗӨВХӨН статистикт ашиглагдана. Зургийн сонголтод эх полигон давхаргын
 * ID, шүүлт ба хамрах хүрээг дамжуулж, эх үйлчилгээний рендерерийг хэвээр хэрэглэнэ.
 * ⚠️ Хэмжээ нь ГЕОДЕЗИЙН (3857 → `geodesicArea/Length`) — хоёр талыг ижил аргаар хэмжинэ
 *    (`Shape__Area` нь үйлчилгээ бүрийн проекцоос хамаарч зөрдөг).
 * ⚠️ 2026-10-13 (хэрэглэгч) ХАРЬЦУУЛАЛТ — «хуучин ЕТ» = порталын 13-р хэсэг «Ерөнхий төлөвлөгөө»:
 *    · Автозам — хуучин ЕТ-ийн «Автозам» (TD/85) ↔ шинэ (Redesign/0), ХОЁУЛАА БҮТНЭЭР (`old: 'all'`).
 *      ⚠️ 2026-10-14: урьд «Сэлбэ 1 хил»-ээр (`khil1`) тайрдаг байв — хилийн дагуух замын тэнхлэг хил
 *      дээр/гадна орж тасарч, шинэ урт 20.74 км болж байв; хэрэглэгч бүтэн тэнхлэгийг (37.9 км) өөрөө
 *      бодож шалгасан. Хэрэглэгчийн анхны заавар ч «хуучин ЕТ-ийн яг автозам гэсэн хэсэгтэй».
 *      Харин «Сэлбэ 1 хил»-ээр ЗАДАЛНА (`boundary`): хил дотор · хилээс гадуур · нийт (хэрэглэгч: «зүгээр
 *      хил дотор .. км, хилээс гадуур .. км, нийт .. км гэвэл илүү ойлгомжтой»).
 *    · Дугуйн зам · Явган зам — хуучин ЕТ-ийн «Олон нийтийн бүс» ДОТОРХ хэсэгтэй (`old: 'red'`);
 *    · Бүс — хуучин ба шинэ БҮХ бүсийн тоо, талбай;
 *    · Ногоон байгууламж — хуучин ЕТ-ийн БҮТЭН ногоон полигон (`sb:1`, TD/35) ↔ шинэ зургаан
 *      ногоон давхаргын бүтэн талбай. `nogoon` (TD/118) нь бүсээр тайрсан анализын хувилбар тул ОРОХГҮЙ.
 *    ШИНЭ тал нь бүтнээрээ (автозамаас бусад) — мөр ба задлал ижил хүрээнээс тооцогдоно.
 *    Хэмжээний хамт ОБЪЕКТЫН ТОО (`oldN`/`nextN` — хүрээтэй огтлолцсон полигон) харьцуулна.
 *    Бүс нь жагсаалтын ХАМГИЙН СҮҮЛД.
 */

export type ChangeKey = 'zone' | 'road' | 'bike' | 'walk' | 'green';
type Metric = 'count' | 'len' | 'area';

type OldScope = 'khil' | 'red' | 'all' | null;
export const CHANGE_ITEMS: { key: ChangeKey; title: () => string; hue: string; metric: Metric; old: OldScope; now: string[]; next: string[] }[] = [
  { key: 'road',  title: () => tr('Автозам'),           hue: '#64748b', metric: 'len',   old: 'all',  now: ['sb:2'],  next: ['rd:0'] },
  { key: 'bike',  title: () => tr('Дугуйн зам'),        hue: '#2563eb', metric: 'len',   old: 'red', now: ['sb:15'], next: ['rd:18'] },
  { key: 'walk',  title: () => tr('Явган зам'),         hue: '#d97706', metric: 'len',   old: 'red', now: ['sb:3'],  next: ['rd:11'] },
  { key: 'green', title: () => tr('Ногоон байгууламж'), hue: '#16a34a', metric: 'area',  old: 'all', now: ['sb:1'],  next: ['rd:6', 'rd:7', 'rd:8', 'rd:9', 'rd:12', 'rd:13'] },
  { key: 'zone',  title: () => tr('Бүс'),               hue: '#a78bfa', metric: 'count', old: 'all', now: [ZONE_LAYER.id], next: ['rd:2'] },
];
/** Харьцуулалтын хүрээ — хуучин ЕТ-ийн бүсийн төрөл (`ZONE_FIELDS.type`, `zoneType`-аар жигдэлсэн) */
const RED_ZONE_TYPE = 'Олон нийтийн бүс';

const WKID = 3857;
const ZONE_FIELD = 'zone';
/** «Сэлбэ 1 хил» — автозамын харьцуулах хүрээ */
const KHIL_ID = 'khil1';
/** Шинэчлэгдсэн бүсийн давхарга — задлалын орон зайн суурь */
const RD_ZONE = 'rd:2';

type Geom = __esri.GeometryUnion;
type Feat = { geom: Geom; zone: string | null; layer: string; oid: number };

/** Applied as real FeatureLayerView filters on each side of the comparison. */
export type ChangeFilter = { ids: string[]; where?: string; geometry?: Geom };
/** Зургийн хүрээ/сонголтод зөвхөн ЭХ ПОЛИГОН — тооцоолсон тэнхлэг энд орохгүй. */
export type ChangePiece = { layer: string; geometry: __esri.Polygon };

/** Статистикийн тэнхлэг зургийн өгөгдөлтэй санамсаргүй холилдохоос хамгаална. */
export function sourceChangePieces(fs: { layer: string; geom: Geom }[]): ChangePiece[] {
  return fs.map((f) => {
    if (f.geom.type !== 'polygon') throw new Error('Change map selections require source polygons');
    return { layer: f.layer, geometry: f.geom as __esri.Polygon };
  });
}

export type ChangeGroup = {
  /** Бүсийн төрөл (`zone`); `null` — бүсээс гадуур / төрөлгүй */
  label: string | null;
  value: number;
  /** Зураг дээр тодруулах орон зайн хүрээ (тухайн төрлийн бүсүүдийн нэгдэл) */
  geometry: Geom | null;
  filters: ChangeFilter[];
  pieces: ChangePiece[];
};
/**
 * `next`/`nextCmp` — харьцуулж буй шинэ хэмжээ (автозам — хилээр тайрсан);
 * `old` — хуучин (харьцуулахгүй/өгөгдөл дутуу бол `null`); `oldN`/`nextN` — объектын тоо;
 * `area` — харьцуулах ХҮРЭЭ (зураг дээр хуучин давхаргыг үүгээр шүүнэ), бүтэн бол `null`.
 */
export type ChangeRow = {
  key: ChangeKey; next: number; nextCmp: number; old: number | null; oldN: number | null; nextN: number;
  oldScope: OldScope; area: Geom | null; groups: ChangeGroup[];
  filters: ChangeFilter[];
  pieces: ChangePiece[];
  /** Distinct source layers with features in the comparison scope, not feature counts. */
  oldLayersN: number | null; nextLayersN: number;
  oldArea: number | null; nextArea: number;
  oldComplete: boolean; nextComplete: boolean;
  oldSourceComplete: boolean; nextSourceComplete: boolean;
  /** 0 нь бодит хоосон хүрээ юу, эсвэл хэмжилт гараагүй юу гэдгийг ялгана. */
  oldMeasurementAvailable: boolean; nextMeasurementAvailable: boolean;
  /** Actual coarsest raster cell in ground meters; length itself is geodesic. */
  centerlineResolutionM: number | null;
  /**
   * «Сэлбэ 1 хил» ДОТОРХ тэнхлэгийн урт (автозам) — гадуурх нь нийт − дотор. Хил татагдаагүй бол `null`.
   * ⚠️ Хилийн дагуух замын тэнхлэг хил дээр/гадна байж болох тул «гадуур»-т орох нь хэвийн.
   */
  boundary: { oldIn: number | null; nextIn: number } | null;
};
export type ChangeResult = { rows: ChangeRow[]; failed: string[] };

/** Эх өгөгдөл бүрэн үед хоосон хүрээ = бодит 0; тэнхлэг гараагүй объект = хэмжилтгүй. */
export function changeMeasurementState({ sourceComplete, calculationComplete, sourceCount, measurementCount }: {
  sourceComplete: boolean; calculationComplete: boolean; sourceCount: number; measurementCount: number;
}): { available: boolean; complete: boolean } {
  const complete = sourceComplete && (calculationComplete || sourceCount === 0);
  return { available: sourceComplete && (complete || measurementCount > 0), complete };
}

export type ChangeComparison = { delta: number | null; percent: number | null; status: 'complete' | 'partial' | 'unavailable' };

/** Харагдаж буй хоёр хэмжилтийн зөрүү; хэсэгчилсэн тооцооны зөрүүг ил тэмдэглэнэ. */
export function compareChangeQuantity(r: Pick<ChangeRow, 'old' | 'nextCmp' | 'oldComplete' | 'nextComplete'
  | 'oldSourceComplete' | 'nextSourceComplete' | 'oldMeasurementAvailable' | 'nextMeasurementAvailable'>): ChangeComparison {
  if (!r.oldSourceComplete || !r.nextSourceComplete || !r.oldMeasurementAvailable || !r.nextMeasurementAvailable
    || r.old == null || !Number.isFinite(r.old) || !Number.isFinite(r.nextCmp)) return { delta: null, percent: null, status: 'unavailable' };
  const delta = r.nextCmp - r.old;
  return { delta, percent: r.old > 0 ? delta / r.old * 100 : null, status: r.oldComplete && r.nextComplete ? 'complete' : 'partial' };
}

async function fetchFeats(id: string, zoneField: string | null): Promise<Feat[]> {
  const def = LAYER_BY_ID[id];
  if (!def) throw new Error(`«${id}» давхарга бүртгэлгүй`);
  const u = layerUrl(def);
  const out: Feat[] = [];
  for (let start = 0; ; ) {
    const q = new Query({
      where: def.where ?? '1=1',
      outFields: zoneField ? [oidOf(def), zoneField] : [oidOf(def)],
      returnGeometry: true,
      outSpatialReference: { wkid: WKID },
      orderByFields: [`${oidOf(def)} ASC`],
      start,
      num: 2000,
    });
    /* ⚠️ 2026-10-19 (аудит): токенгүй `f=pbf` 400 → нэвтрэх цонх хүлээж `computeChange` ХЭЗЭЭ Ч шийдэгддэггүй байв
       (01-ийн самбар үүрд эргэлддэг) — хугацаатай, цонхгүй PBF → JSON (`planOverlap.queryPageSafe`-ийн ⚠️). */
    const res = await queryPageSafe(u, q);
    for (const f of res.features) {
      if (!f.geometry) continue;
      const z = zoneField ? f.attributes?.[zoneField] : null;
      out.push({ geom: f.geometry as Geom, zone: typeof z === 'string' && z.trim() ? z.trim() : null, layer: id, oid: Number(f.attributes?.[oidOf(def)]) });
    }
    if (!res.features.length) break;
    if (res.features.length < 2000 && !res.exceededTransferLimit) break;
    start += res.features.length;
  }
  return out;
}

export const measureChangeGeometry = (g: Geom, m: Metric): number => {
  if (m === 'count') return 1;
  if (m === 'area') return g.type === 'polygon' ? Math.abs(geometryEngine.geodesicArea(g as __esri.Polygon, 'square-meters')) : 0;
  if (g.type !== 'polyline') throw new Error('Length requires a calculated centerline');
  return Math.abs(geometryEngine.geodesicLength(g as __esri.Polyline, 'meters'));
};
const measure = measureChangeGeometry;

const union = async (gs: Geom[]): Promise<Geom | null> =>
  gs.length === 0 ? null : gs.length === 1 ? gs[0] : ((await geometryEngineAsync.union(gs)) as Geom | null);

/**
 * ДАВХАРДАЛГҮЙ ТАЛБАЙ — полигонуудыг НЭГТГЭЭД геодезийн талбай.
 * ⚠️ 2026-10-19 (аудит): урьд нь полигон бүрийн талбайг НЭМДЭГ байв — ногоон байгууламжийн зургаан давхарга (мөн
 *    давхарга доторх) хоорондоо давхцдаг тул давхцсан хэсэг 2–3 дахин тоологдож, бүсийн задлалын хувь 100%-иас
 *    давдаг байлаа. Уртын замын `centerlines` давхаргыг нэгтгэдэгтэй ижил дүрэм.
 */
const areaOf = async (fs: { geom: Geom }[]): Promise<number> => {
  const u = await union(fs.map((f) => f.geom));
  return u ? measureChangeGeometry(u, 'area') : 0;
};

/** Тэгш өнцөгт хүрээ (3857 нэгж) */
export type ChangeBox = { xmin: number; ymin: number; xmax: number; ymax: number };
/** Хүрээнүүдийн нэгдэл; хоосон бол `null`. Цэвэр функц. */
export function changeBoxUnion(bs: ReadonlyArray<ChangeBox | null | undefined>): ChangeBox | null {
  let out: ChangeBox | null = null;
  for (const b of bs) {
    if (!b || ![b.xmin, b.ymin, b.xmax, b.ymax].every(Number.isFinite)) continue;
    out = out
      ? { xmin: Math.min(out.xmin, b.xmin), ymin: Math.min(out.ymin, b.ymin), xmax: Math.max(out.xmax, b.xmax), ymax: Math.max(out.ymax, b.ymax) }
      : { xmin: b.xmin, ymin: b.ymin, xmax: b.xmax, ymax: b.ymax };
  }
  return out;
}
/**
 * ТӨСЛИЙН ХҮРЭЭНЭЭС ХОЛ («ТЭНЭСЭН») ОБЪЕКТЫГ ХАСНА — хүрээ нь `ref`-ийг `margin`-аар тэлсэнтэй огтлолцохгүй бол.
 * Хүрээгүй (цэг г.м.) объект үлдэнэ; `ref` байхгүй бол юу ч хасахгүй. Цэвэр функц (тест).
 * ⚠️ 2026-10-19 (аудит): хуучин ЕТ-ийн «Автозам» (TD/85) дотор Сэлбээс ХОЛ нэг полигон бий (`ChangeMapFocus`-ийн
 *    2026-10-16-ны ⚠️ — зураг тивийн хэмжээнд холддог байв). Зураг үүнийг тойрсон ч хуучин талын ОБЪЕКТЫН ТОО ба
 *    ТАЛБАЙ-д тоологдсоор байв. Одоо харьцуулалтад орохоос ӨМНӨ хасна.
 */
export function strayFree<T>(fs: readonly T[], boxOf: (f: T) => ChangeBox | null | undefined, ref: ChangeBox | null, margin: number): T[] {
  if (!ref) return [...fs];
  const r = { xmin: ref.xmin - margin, ymin: ref.ymin - margin, xmax: ref.xmax + margin, ymax: ref.ymax + margin };
  return fs.filter((f) => {
    const b = boxOf(f);
    return !b || (b.xmax >= r.xmin && b.xmin <= r.xmax && b.ymax >= r.ymin && b.ymin <= r.ymax);
  });
}
/** Төслийн хүрээний тэлэлт — ГАЗРЫН 5 км (`strayMargin`-аар 3857-ийн нэгж рүү хөрвүүлнэ) */
const STRAY_GROUND_M = 5_000;
/**
 * Газрын `groundM` метр → EPSG:3857-ийн нэгж, `y` (3857-ийн өргөрөг) дээр. Цэвэр функц (тест).
 * ⚠️ 2026-10-19 (review): урьд нь 3857-ийн 5 000 нэгжийг шууд хэрэглэдэг тул 47.9°N-д газар дээр ~3.35 км л байв
 *    (3857-ийн масштаб 1/cos(өргөрөг) ≈ 1.49). Одоо `1/cos(φ) = cosh(y / R)` (`hesegNeed`-ийн `metersPerUnit`-тэй ижил).
 */
export function strayMargin(groundM: number, y: number): number {
  return groundM * Math.cosh(y / 6378137);
}

/** The old registered road/roadOld services are simulation lines, not corresponding centerlines.
 * Derive all three road types from their supplied polygon layers by the same method. */
/**
 * ХУУЧИН ЕТ-ИЙН АВТОЗАМЫН УРТ — ХЭРЭГЛЭГЧИЙН ӨГСӨН ЛАВЛАХ ТОО (2026-10-14).
 * ⚠️ TD/85 полигоноос raster skeleton-оор гаргахад жолоо, зогсоолын сам, дотор гарц бүрийн дагуу
 *    салаа гарч «маш замбараагүй» (хэрэглэгч ArcGIS Pro дээр шалгав) — 38.7 км, салаа хайчлахад ч
 *    найдваргүй. Хэрэглэгч ArcGIS Pro дээр өөрөө бодсон тоог ӨГСӨН: «миний өгсөн тоог тавь».
 *    Хуучин талын автозамд тэнхлэг БОДОХГҮЙ. Хэрэглэгчийн Pro үр дүн: НИЙТ 24.19 км = «Сэлбэ 1 хил»
 *    дотор 18.41 км + хилээс гадуур 5.78 км (2026-10-14; урьд 26.7 км гэж буруу ойлгосон байв).
 *    Өгөгдөл шинэчлэгдвэл ЭНЭ ТООГ ГАРААР шинэчилнэ.
 */
const OLD_ROAD_REFERENCE_M = 24_190;
/** Дээрхийн «Сэлбэ 1 хил» ДОТОРХ хэсэг (гадуур = нийт − дотор = 5.78 км) */
const OLD_ROAD_REFERENCE_IN_M = 18_410;

/**
 * Тэнхлэгийг МЕТРИЙН UTM 48N (32648)-д бодно.
 * ⚠️ 2026-10-14: ижил полигон (TD/85) Web Mercator-т 52.3 км, UTM-д 38.7 км гарсан — skeleton-ий
 *    дотоод хязгаарууд координатын нэгжээс хамаардаг. Хэрэглэгчийн ArcGIS-тэй тулгах тоо UTM-ийнх тул
 *    тэнд бодоод үр дүнг 3857 руу буцаана (дараагийн тайралт/геодезийн хэмжилт 3857-д).
 */
const UTM = new SpatialReference({ wkid: 32648 });
const WM = new SpatialReference({ wkid: WKID });
let projLoad: Promise<unknown> | null = null;
const ensureProj = () => { projLoad ??= projectOperator.load().catch((e: unknown) => { projLoad = null; throw e; }); return projLoad; };

async function centerlines(fs: Feat[]): Promise<{ features: Feat[]; resolutionM: number; complete: boolean }> {
  await ensureProj().catch(() => null);
  if (!projectOperator.isLoaded()) return { features: [], resolutionM: 0, complete: false };
  const byLayer = new Map<string, Feat[]>();
  for (const f of fs) (byLayer.get(f.layer) ?? byLayer.set(f.layer, []).get(f.layer)!).push(f);
  const features: Feat[] = [];
  let resolutionM = 0, complete = true;
  for (const [layer, source] of byLayer) {
    const polygon = await union(source.map((f) => f.geom));
    if (!polygon || polygon.type !== 'polygon') { complete = false; continue; }
    const utm = projectOperator.execute(polygon, UTM) as __esri.Polygon | null | undefined;
    if (!utm?.rings?.length) { complete = false; continue; }
    const result = await polygonCenterlinesAsync(utm.rings, { resolution: 0.5, maxCells: 16_000_000 });
    resolutionM = Math.max(resolutionM, result.resolution);
    if (!result.complete) complete = false;
    if (!result.paths.length) { complete = false; continue; }
    const rawUtm = new Polyline({ paths: result.paths, spatialReference: UTM });
    const clipped = await geometryEngineAsync.intersect(rawUtm, utm) as Geom | null;
    const geom = clipped ? projectOperator.execute(clipped, WM) as Geom | null : null;
    if (!geom || geom.type !== 'polyline' || measure(geom, 'len') <= 0) { complete = false; continue; }
    features.push({ geom, zone: null, layer, oid: source[0].oid });
  }
  return { features, resolutionM, complete };
}

/** ⚠️ Модулийн кэш (статик төлөвлөгөөний өгөгдөл) — алдаа гарвал устгана */
let changeCache: Promise<ChangeResult> | null = null;
/* ⚠️ 2026-10-19 (аудит): толгойн «Шинэчлэх» (`invalidateAll`) хаяна — урьд нь сешн дуустал үлддэг байв */
register(() => { changeCache = null; }, []);
/**
 * ⚠️ 2026-10-19 (аудит): БҮХ ТООЦООНЫ ДЭЭД ХУГАЦАА — хуудас бүр `queryPageSafe`-ээр хугацаатай ч геометрийн worker
 *    гацвал самбар үүрд эргэлдэхгүй, алдаа харуулж дараагийн нээлтэд дахин оролдоно.
 */
const CHANGE_TIMEOUT_MS = 4 * 60_000;

export function computeChange(): Promise<ChangeResult> {
  if (changeCache) return changeCache;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(tr('Тооцоо хэт удаж байна ({0} мин) — дахин нээж оролдоно уу.', CHANGE_TIMEOUT_MS / 60_000))), CHANGE_TIMEOUT_MS);
  });
  const work = (async (): Promise<ChangeResult> => {
    const failed: string[] = [];
    const failedIds = new Set<string>();
    const load = (id: string, zoneField: string | null = null) => fetchFeats(id, zoneField).catch((e) => {
      console.warn(`[selbe] хэсэгчилсэн ЕТ: «${id}» татагдсангүй:`, e);
      failed.push(LAYER_BY_ID[id]?.title ?? id);
      failedIds.add(id);
      return [] as Feat[];
    });
    const [zones, oldZonesAll, khilF] = await Promise.all([
      load(RD_ZONE, ZONE_FIELD), load(ZONE_LAYER.id, ZONE_FIELDS.type), load(KHIL_ID),
    ]);
    /* ⚠️ 2026-10-19 (аудит): ТӨСЛИЙН ХҮРЭЭ — шинэ бүс + «Сэлбэ 1 хил»; хуучин талаас түүнээс хол объектыг хасна (`strayFree`) */
    const aoi = changeBoxUnion([...zones, ...khilF].map((f) => f.geom.extent));
    const margin = aoi ? strayMargin(STRAY_GROUND_M, (aoi.ymin + aoi.ymax) / 2) : 0;
    const near = (fs: Feat[]) => strayFree(fs, (f) => f.geom.extent, aoi, margin);
    const oldZones = near(oldZonesAll);
    /* Автозамын харьцуулах хүрээ — «Сэлбэ 1 хил» */
    const khil = await union(khilF.map((f) => f.geom));
    /* Харьцуулалтын хүрээ — хуучин ЕТ-ийн «Олон нийтийн бүс»-үүдийн нэгдэл */
    const redOld = oldZones.filter((z) => zoneType(z.zone) === RED_ZONE_TYPE);
    const red = await union(redOld.map((z) => z.geom));
    /** Хүрээгээр тайрсан хэмжээ ба хүрээтэй огтлолцсон объектын тоо */
    const inArea = async (fs: Feat[], m: Metric, area: Geom | null): Promise<Feat[]> => {
      if (!area || !fs.length) return [];
      const e = area.extent;
      const cand = fs.filter((f) => !e || f.geom.extent?.intersects(e));
      if (!cand.length) return [];
      const parts = (await geometryEngineAsync.intersect(cand.map((f) => f.geom), area)) as unknown as (Geom | null)[];
      return parts.flatMap((geom, i) => geom && measure(geom, m) > 0 ? [{ ...cand[i], geom }] : []);
    };
    /* Бүсийн ТӨРӨЛ бүрийн нэгтгэсэн хүрээ — задлал ба зургийн тодруулгад */
    const byType = new Map<string, Geom[]>();
    for (const z of zones) if (z.zone) (byType.get(z.zone) ?? byType.set(z.zone, []).get(z.zone)!).push(z.geom);
    const typeGeom = new Map<string, Geom | null>();
    await Promise.all([...byType].map(async ([k, gs]) => { typeGeom.set(k, await union(gs)); }));
    const allZones = await union(zones.filter((z) => z.zone).map((z) => z.geom));

    const idsWhere = (fs: Feat[], id: string) => {
      const ids = fs.filter((f) => f.layer === id).map((f) => f.oid).filter(Number.isFinite);
      return ids.length ? `${oidOf(LAYER_BY_ID[id])} IN (${ids.join(',')})` : '1=0';
    };
    const spatialFilter = (ids: string[], geometry: Geom | null): ChangeFilter =>
      geometry ? { ids, geometry } : { ids, where: '1=0' };

    const rows = await Promise.all(CHANGE_ITEMS.map(async (it): Promise<ChangeRow> => {
      const [nowF, nextF] = await Promise.all([
        it.key === 'zone' ? Promise.resolve(oldZones) : Promise.all(it.now.map((id) => load(id))).then((x) => near(x.flat())),
        it.key === 'zone' ? Promise.resolve(zones) : Promise.all(it.next.map((id) => load(id))).then((x) => x.flat()),
      ]);
      const sum = (fs: Feat[]) => fs.reduce((a, f) => a + measure(f.geom, it.metric), 0);
      /* ⚠️ 2026-10-19 (аудит): ТАЛБАЙ нь нэгтгэсэн полигоноор (`areaOf`-ийн ⚠️); тоо · урт хэвээр */
      const total = (fs: Feat[]): Promise<number> => (it.metric === 'area' ? areaOf(fs) : Promise.resolve(sum(fs)));
      const area = it.old === 'khil' ? khil : it.old === 'red' ? red : null;
      // Object counts and areas continue to use source polygon records, not skeleton edges.
      const oldSource = it.old === 'all' ? nowF : it.old ? await inArea(nowF, 'area', area) : [];
      const nextSource = it.old === 'khil' ? await inArea(nextF, 'area', khil) : nextF;
      let oldFs = oldSource, nextFs = nextSource, centerlineResolutionM: number | null = null;
      let oldLinesComplete = true, nextLinesComplete = true;
      let boundary: ChangeRow['boundary'] = null;
      /* Хуучин ЕТ-ийн автозам — хэрэглэгчийн лавлах тоо (`OLD_ROAD_REFERENCE_M`-ийн ⚠️), тэнхлэг бодохгүй */
      const oldRef = it.key === 'road' ? OLD_ROAD_REFERENCE_M : null;
      if (it.metric === 'len') {
        // Compute BEFORE all geographic clipping; boundary cuts must not invent new centerline ends.
        const [oldLines, nextLines] = await Promise.all([
          oldRef != null ? Promise.resolve({ features: [] as Feat[], resolutionM: 0, complete: true }) : centerlines(nowF),
          centerlines(nextF),
        ]);
        oldLinesComplete = oldLines.complete; nextLinesComplete = nextLines.complete;
        centerlineResolutionM = Math.max(oldLines.resolutionM, nextLines.resolutionM) || null;
        oldFs = it.old === 'all' ? oldLines.features : await inArea(oldLines.features, 'len', area);
        if (it.key === 'road' && khil && !failedIds.has(KHIL_ID)) {
          const nIn = await inArea(nextLines.features, 'len', khil);
          boundary = { oldIn: oldRef != null ? OLD_ROAD_REFERENCE_IN_M : null, nextIn: nIn.reduce((a, f) => a + measure(f.geom, 'len'), 0) };
        }
        nextFs = it.old === 'khil' ? await inArea(nextLines.features, 'len', khil) : nextLines.features;
        /* ⚠️ 2026-10-14 (хэрэглэгч: «…тэнхлэг бүрэн тооцогдоогүй» анхааруулгыг хасуулсан) — самбарт
           харуулахгүй; давхарга ачаалагдаагүй зэрэг бусад алдаа `failed`-д хэвээр */
      }
      const next = await total(nextFs);
      const oldSourceComplete = it.old !== null && !it.now.some((id) => failedIds.has(id))
        && (it.old === 'all' || (!failedIds.has(it.old === 'khil' ? KHIL_ID : ZONE_LAYER.id) && area !== null));
      const nextSourceComplete = !it.next.some((id) => failedIds.has(id))
        && (it.old !== 'khil' || (!failedIds.has(KHIL_ID) && khil !== null));
      const oldMeasurement = oldRef != null
        ? { available: oldSourceComplete, complete: oldSourceComplete }
        : changeMeasurementState({ sourceComplete: oldSourceComplete, calculationComplete: oldLinesComplete, sourceCount: oldSource.length, measurementCount: oldFs.length });
      const nextMeasurement = changeMeasurementState({ sourceComplete: nextSourceComplete, calculationComplete: nextLinesComplete, sourceCount: nextSource.length, measurementCount: nextFs.length });
      const oldComplete = oldMeasurement.complete, nextComplete = nextMeasurement.complete;
      const filters: ChangeFilter[] = [
        it.old === 'all' ? { ids: it.now }
          : it.old ? spatialFilter(it.now, area) : { ids: it.now },
        it.old === 'khil' ? spatialFilter(it.next, khil) : { ids: it.next },
      ];
      const pieces = sourceChangePieces([...(oldSourceComplete ? oldSource : []), ...(nextSourceComplete ? nextSource : [])]);
      const groupData = async (geometry: Geom | null, fs?: Feat[], oldScope?: Geom | null): Promise<{ filters: ChangeFilter[]; pieces: ChangePiece[] }> => {
        const oldGeometry = oldScope !== undefined ? oldScope : it.old === 'all' ? geometry : area && geometry
          ? (await geometryEngineAsync.intersect(area, geometry)) as Geom | null : null;
        const [oldParts, nextParts] = await Promise.all([
          oldSourceComplete ? inArea(oldSource, 'area', oldGeometry) : Promise.resolve([]),
          it.key === 'zone' && fs ? Promise.resolve(fs) : inArea(nextSource, 'area', geometry),
        ]);
        return {
          filters: [
            spatialFilter(it.now, oldGeometry),
            it.key === 'zone' && fs ? { ids: it.next, where: idsWhere(fs, RD_ZONE) } : spatialFilter(it.next, geometry),
          ],
          pieces: sourceChangePieces([...oldParts, ...nextParts]),
        };
      };
      let groups: ChangeGroup[];
      if (it.key === 'zone') {
        /* Бүс — `zone` аттрибутаар (тоо) */
        const m = new Map<string | null, Feat[]>();
        for (const f of nextFs) (m.get(f.zone) ?? m.set(f.zone, []).get(f.zone)!).push(f);
        groups = await Promise.all([...m].map(async ([label, fs]) => {
          const geometry = label ? typeGeom.get(label) ?? null : await union(fs.map((f) => f.geom));
          return { label, value: fs.length, geometry, ...await groupData(geometry, fs) };
        }));
      } else if (!failedIds.has(RD_ZONE)) {
        /* Бусад — ОРОН ЗАЙН: бүсийн төрөл бүрийн хүрээтэй огтлолцсон хэсгийн хэмжээ */
        groups = [];
        for (const [label, zg] of typeGeom) {
          if (!zg || !nextFs.length) continue;
          const geometry = it.old === 'khil' && khil
            ? (await geometryEngineAsync.intersect(zg, khil)) as Geom | null : zg;
          const parts = await inArea(nextFs, it.metric, geometry);
          const v = await total(parts);
          if (v > 0.5) groups.push({ label, value: v, geometry, ...await groupData(geometry) });
        }
        /* Measure actual outside portions; centerline lengths are now additive across disjoint zones. */
        const outside = allZones && nextFs.length
          ? (await geometryEngineAsync.difference(nextFs.map((f) => f.geom), allZones)) as unknown as (Geom | null)[]
          : nextFs.map((f) => f.geom);
        const outsideFs = outside.flatMap((geom, i) => geom && measure(geom, it.metric) > 0 ? [{ ...nextFs[i], geom }] : []);
        const rest = await total(outsideFs);
        if (rest > Math.max(1, next * 0.005)) {
          /* Зурагт эх полигоны бүсээс гадуурх хэсгээр шүүнэ — тэнхлэгийн геометрээр БИШ. */
          const sourceOutside = allZones && nextSource.length
            ? (await geometryEngineAsync.difference(nextSource.map((f) => f.geom), allZones)) as unknown as (Geom | null)[]
            : nextSource.map((f) => f.geom);
          const geometry = await union(sourceOutside.filter((g): g is Geom => !!g && measure(g, 'area') > 0));
          /* Бүтэн хуучин ЕТ-ийн ногоонд `area` null тул эх полигонуудын хамрах хүрээг авна. */
          const oldFootprint = it.old === 'all' ? await union(oldSource.map((f) => f.geom)) : area;
          const oldOutside = oldFootprint && allZones ? (await geometryEngineAsync.difference(oldFootprint, allZones)) as Geom | null : oldFootprint;
          groups.push({ label: null, value: rest, geometry, ...await groupData(geometry, undefined, oldOutside) });
        }
      } else groups = [];
      groups.sort((a, b) => b.value - a.value);
      /* ХУУЧИН/ШИНЭ харьцуулалт — дээрх ⚠️. Талбай — нэгтгэсэн полигоноор (`areaOf`) */
      const [oldVal, oldArea, nextArea] = await Promise.all([
        oldMeasurement.available ? oldRef != null ? Promise.resolve(oldRef) : total(oldFs) : Promise.resolve(null),
        oldSourceComplete ? areaOf(oldSource) : Promise.resolve(null),
        areaOf(nextSource),
      ]);
      return {
        key: it.key, next, nextCmp: next, old: oldVal,
        oldN: oldSourceComplete ? oldSource.length : null, nextN: nextSource.length,
        oldLayersN: oldSourceComplete ? new Set(oldSource.map((f) => f.layer)).size : null,
        nextLayersN: new Set(nextSource.map((f) => f.layer)).size,
        oldArea,
        nextArea,
        oldComplete, nextComplete, oldSourceComplete, nextSourceComplete, oldScope: it.old, area, filters, pieces, groups, centerlineResolutionM, boundary,
        oldMeasurementAvailable: oldMeasurement.available, nextMeasurementAvailable: nextMeasurement.available,
      };
    }));
    return { rows, failed: [...new Set(failed)] };
  })();
  const p = Promise.race([work, late]).finally(() => clearTimeout(timer));
  changeCache = p;
  /* A transient failed fetch must be retryable on the next visit. ⚠️ Зөвхөн ӨӨРИЙН кэш (дунд нь «Шинэчлэх» орж болно). */
  p.then((r) => { if (r.failed.length && changeCache === p) changeCache = null; },
    () => { if (changeCache === p) changeCache = null; });
  return p;
}

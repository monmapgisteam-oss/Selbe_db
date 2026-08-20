/**
 * БАГЦТАЙ ДАВХЦАЖ БУЙ «ҮЛДСЭН НЭГЖ ТАЛБАР» — орон зайн огтлолцол.
 *
 * «Үлдсэн нэгж талбар» гэдэг нь чөлөөлөгдөөгүй, БАРИЛГА ЭХЛҮҮЛЭХЭД СААД болж буй
 * газар. Багцын мөрөн дээр ийм талбар байвал тэр ажил эхлэх боломжгүй тул багц
 * сонгоход ЭНЭ ТОО хамгийн эхэнд хэрэгтэй.
 *
 * ⚠️ Багц нь ЗӨВХӨН барилгын блок БИШ: дэд бүтцийн 48 багц нь өөрсдийн
 *    давхаргатай (шугам хоолой, зам, цахилгаан). Тиймээс эх сурвалжийг ЖАГСААЛТ
 *    хэлбэрээр авна — сонгосон нэг багц ч, бүх багц ч ижил замаар тоологдоно.
 *
 * ⚠️ Геометрийн ТӨРӨЛ гурав (талбай · шугам · цэг) бөгөөд ArcGIS-ийн нэг асуулга
 *    НЭГ төрөл хүлээж авдаг. Тиймээс төрөл тус бүрд нэг асуулга явуулж, гарсан
 *    ObjectID-уудыг НЭГТГЭНЭ (давхардлыг Set арилгана).
 *
 * ⚠️ Хоёр давхарга ХОЁУЛАА UTM 32648 боловч үүнд НАЙДАХГҮЙ: эх геометрийг
 *    парселийн давхаргын проекцоор ЗААЖ авна (`outSR`). Проекц зөрвөл огтлолцол
 *    чимээгүй ХООСОН гарч, «саадгүй» гэсэн ХУДАЛ дүгнэлт өгнө.
 */

import { PARCEL_LEFT, LAYER_BY_ID } from './services';

/** Барилга эхлүүлэхэд саад болж буй төлөв — газар чөлөөлөлтийн давхаргын утга. */
export const LEFT_STATUS = 'Үлдсэн нэгж талбар';

/** Огтлолцуулах эх сурвалж — давхарга + (сонголтоор) түүний шүүлт. */
export type Src = { layerId: string; where?: string | null };

export type Overlap = {
  /** Давхцаж буй ҮЛДСЭН нэгж талбарын ObjectID-ууд */
  oids: number[];
};

async function post(url: string, params: Record<string, string>) {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, f: 'json' }),
  });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || 'ArcGIS error');
  return j;
}

/** Парселийн давхаргын проекц — нэг л удаа асууж кэшлэнэ. */
let srCache: Promise<number> | null = null;
function parcelSR(): Promise<number> {
  if (!srCache)
    srCache = fetch(`${PARCEL_LEFT.url}?f=json`)
      .then((r) => r.json())
      .then((m) => {
        const sr = m?.extent?.spatialReference;
        return Number(sr?.wkid ?? sr?.latestWkid) || 32648;
      })
      .catch(() => 32648);
  return srCache;
}

type Geoms = { rings: number[][][]; paths: number[][][]; points: number[][] };

/**
 * Нэг давхаргын геометрийг татаж, төрлөөр нь хуримтлуулна.
 *
 * ⚠️ `maxAllowableOffset` — геометрийг 1 м нарийвчлалаар ЕРӨНХИЙЛНӨ. Замын
 *    шугам зэрэг олон мянган цэгтэй объектын payload-ыг эрс багасгах бөгөөд
 *    нэгж талбарын хэмжээ (арав гаруй метр) дээр огтлолцлын үр дүн өөрчлөгдөхгүй.
 */
async function collect(src: Src, wkid: number, out: Geoms): Promise<void> {
  const d = LAYER_BY_ID[src.layerId];
  if (!d) return;
  const j = await post(d.url as string, {
    where: src.where ?? d.where ?? '1=1',
    returnGeometry: 'true',
    outFields: '',
    outSR: String(wkid),
    maxAllowableOffset: '1',
  });
  type G = { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
  for (const f of (j.features ?? []) as { geometry?: G }[]) {
    const g = f.geometry;
    if (!g) continue;
    if (g.rings) out.rings.push(...g.rings);
    else if (g.paths) out.paths.push(...g.paths);
    else if (typeof g.x === 'number' && typeof g.y === 'number') out.points.push([g.x, g.y]);
  }
}

/**
 * Өгсөн эх сурвалжуудтай ДАВХЦАЖ буй үлдсэн нэгж талбарууд.
 *
 * @param sources Багцын давхарга(ууд) ба тэдгээрийн шүүлт.
 */
export async function overlapLeftParcels(sources: Src[]): Promise<Overlap> {
  if (!sources.length) return { oids: [] };
  const wkid = await parcelSR();
  const g: Geoms = { rings: [], paths: [], points: [] };

  // ⚠️ Зэрэг татна — 57 дэд бүтцийн давхаргыг дараалуулбал секунд хүлээнэ.
  //    Нэг давхарга унасан ч бусад нь үргэлжлэх ёстой (`allSettled`).
  await Promise.allSettled(sources.map((s) => collect(s, wkid, g)));

  /**
   * ⚠️ ХЭСЭГЧИЛСЭН АСУУЛГА — гүйцэтгэлийн ГОЛ хүчин зүйл.
   *
   * Бүх багцын геометр нь ~8,000 хэсэгтэй (голдуу шугам хоолой). Түүнийг НЭГ
   * асуулгаар илгээхэд сервер 2,119 нэгж талбарыг тэр асар том геометртэй
   * тулгаж **57 секунд** боддог байв. 400-аар хувааж ЗЭРЭГ асуухад ижил үр дүн
   * **1.8 секундэд** гарна (хэмжсэн). Геометр татах нь ердөө 1.1 сек тул гацаа
   * нь ЗӨВХӨН энд байсан.
   */
  const CHUNK = 400;
  const cut = <T,>(a: T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += CHUNK) out.push(a.slice(i, i + CHUNK));
    return out;
  };
  const shapes: Array<[string, string]> = [
    ...cut(g.rings).map(
      (c) => ['esriGeometryPolygon', JSON.stringify({ rings: c, spatialReference: { wkid } })] as [string, string],
    ),
    ...cut(g.paths).map(
      (c) => ['esriGeometryPolyline', JSON.stringify({ paths: c, spatialReference: { wkid } })] as [string, string],
    ),
    ...cut(g.points).map(
      (c) => ['esriGeometryMultipoint', JSON.stringify({ points: c, spatialReference: { wkid } })] as [string, string],
    ),
  ];
  if (!shapes.length) return { oids: [] };

  const ask = (geometryType: string, geometry: string, where: string) =>
    post(PARCEL_LEFT.url, {
      geometry,
      geometryType,
      spatialRel: 'esriSpatialRelIntersects',
      inSR: String(wkid),
      where,
      returnIdsOnly: 'true',
    });

  // ⚠️ `N'…'` угтвар — талбар нь Unicode (nvarchar); зарим үйлчилгээнд
  //    угтваргүй кирилл харьцуулалт ХООСОН буцаадаг.
  const leftWhere = `${PARCEL_LEFT.fields.status}=N'${LEFT_STATUS}'`;
  const res = await Promise.all(shapes.map(([t, geom]) => ask(t, geom, leftWhere)));

  const left = new Set<number>();
  for (const r of res) for (const id of (r.objectIds ?? []) as number[]) left.add(id);
  return { oids: [...left] };
}

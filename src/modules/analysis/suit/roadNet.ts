/**
 * ЗАМЫН СҮЛЖЭЭГ татаж, аялал үүсгэлтээр жинлэнэ.
 *
 * ⚠️ `traffic.ts` нь ЦЭВЭР математик; энэ файл нь түүнд өгөгдөл БЭЛТГЭНЭ —
 * ArcGIS-ийн REST рүү хүсэлт явуулж, шугамын хэрчмүүдийг Web Mercator-оор
 * авчирна (`outSR=3857`). Ингэснээр `projection` модуль ачаалах шаардлагагүй
 * бөгөөд `SuitMap`-ийн 2D view-ийн координаттай ШУУД нийцнэ.
 *
 * ⚠️ Эх сурвалж нь `et:5` «Замын ТЭНХЛЭГ» — замын хөндлөн огтлолын ДУНД шугам.
 * «Авто зам» (`road`, 193) БИШ: тэр нь замын ХАШЛАГА (талбайн хүрээ) тул машин
 * замын ирмэгээр явж, дундуур нь хоосон үлддэг. Тэнхлэгээр явуулснаар машин
 * `et:29` «Зам (талбай)» полигоны яг дундуур гүйнэ.
 */

import { HOME } from '@/lib/services';
import type { Network, Pt } from './traffic';
import { zoneTrips } from './simulation';
import type { MapRow } from '../SuitMap';

/** Нэг хүсэлтэд авах бичлэгийн тоо (үйлчилгээний хязгаар 2000) */
const PAGE = 2000;

/**
 * Геометрийг ерөнхийлөх хүлцэл — ПРОЕКЦЫН нэгжээр (`WM_UNITS_PER_M`-ийг үз),
 * өөрөөр хэлбэл ≈1 бодит метр. 24 мянган хэрчмийн шилжүүлэх өгөгдөл 30 МБ-аас
 * 2.4 МБ болж багасна.
 *
 * ⚠️ Douglas-Peucker нь шугамын ҮЗҮҮРИЙГ хөдөлгөдөггүй (зөвхөн дундах оройг
 * хасна) тул сүлжээний холболтод нөлөөлөхгүй — хэмжилтээр баталсан: ерөнхийлсөн
 * ба түүхий хувилбарын «машины хүрэлцээ» хоёулаа 12.9 км.
 */
const SIMPLIFY_M = 1.5;

/**
 * ТӨСЛИЙН ХҮРЭЭ (UTM 48N, метр) — хүсэлтийн орон зайн шүүлт.
 *
 * ⚠️ ЗААВАЛ: `et:5`-д CAD-ийн ЭХ ЦЭГ рүү унасан гажсан хэрчмүүд байдаг
 * (x≈3056, y≈−2900). Тэдгээр нь газрын зургаас хэдэн мянган км зайд тул
 * шүүхгүй бол сүлжээнд салангид бүрэлдэхүүн үүсгэж, тэнд төрсөн машин
 * харагдахгүй газар «алга болно».
 */
const AREA_UTM = { xmin: 641000, ymin: 5312000, xmax: 645000, ymax: 5317000 };
const AREA_WKID = 32648;

/**
 * WEB MERCATOR-ын НЭГЖ / БОДИТ МЕТР төслийн өргөрөгт.
 *
 * ⚠️ Web Mercator нь туйл руу ойртох тусам сунадаг: масштабын коэффициент нь
 * 1/cos(φ). Сэлбэ 47.97°-т байдаг тул 1 бодит метр = 1.49 WM нэгж. Хөдөлгүүрийн
 * тогтмолууд (машины урт, хурд, наах хүлцэл) БОДИТ метрээр бичигдсэн тул энэ
 * коэффициентгүйгээр машин 1.49 дахин удаан явж, сүлжээ нь хэсэгчилдэг
 * (холбогдсон урт 31% → 5%).
 */
export const WM_UNITS_PER_M = 1 / Math.cos((HOME.lat * Math.PI) / 180);

type EsriPolyline = { paths?: number[][][] };
type QueryResp = {
  features?: { geometry?: EsriPolyline }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
};

const pageQuery = (offset: number) => new URLSearchParams({
  where: '1=1',
  geometry: JSON.stringify({ ...AREA_UTM, spatialReference: { wkid: AREA_WKID } }),
  geometryType: 'esriGeometryEnvelope',
  inSR: String(AREA_WKID),
  spatialRel: 'esriSpatialRelIntersects',
  outFields: '',
  returnGeometry: 'true',
  outSR: '3857',
  maxAllowableOffset: String(SIMPLIFY_M),
  geometryPrecision: '1',
  resultOffset: String(offset),
  resultRecordCount: String(PAGE),
  f: 'json',
});

/**
 * ДУРЫН ArcGIS line давхаргын шугамуудыг Web Mercator оройн жагсаалт болгож татна.
 *
 * ⚠️ Энэ нь `loadRoadPaths` (et:5)-ийн ЕРӨНХИЙЧИЛСӨН хувилбар — харьцуулах 3
 * сүлжээ (бодит зам · төлөвлөгөө · ачаалал бууруулах зам) бүгд ижил хайрцаг
 * (`AREA_UTM`), ижил хялбаршуулалт (`SIMPLIFY_M`), ижил CRS-ээр ирнэ. Line
 * давхаргын URL л өөр. `netSources.ts`-ийн бүртгэл үүнийг дуудна.
 */
export async function loadPathsFrom(url: string, signal?: AbortSignal): Promise<Pt[][]> {
  const fetchPage = async (offset: number): Promise<Pt[][]> => {
    const r: QueryResp = await fetch(`${url}/query?${pageQuery(offset)}`, { signal }).then((x) => x.json());
    if (r.error) throw new Error(r.error.message ?? 'ArcGIS query алдаа');
    const out: Pt[][] = [];
    for (const f of r.features ?? []) {
      for (const path of f.geometry?.paths ?? []) {
        if (path.length >= 2) out.push(path as Pt[]);
      }
    }
    return out;
  };

  // ⚠️ 24 мянган хэрчим = 13 хуудас. Дараалуулбал 13 удаагийн round-trip болж
  //    таб нээхэд удаан үзэгдэнэ — тоог нь эхлээд асуугаад ЗЭРЭГ татна.
  const cnt: { count?: number; error?: { message?: string } } = await fetch(
    `${url}/query?${new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({ ...AREA_UTM, spatialReference: { wkid: AREA_WKID } }),
      geometryType: 'esriGeometryEnvelope',
      inSR: String(AREA_WKID),
      spatialRel: 'esriSpatialRelIntersects',
      returnCountOnly: 'true',
      f: 'json',
    })}`,
    { signal },
  ).then((x) => x.json());
  if (cnt.error) throw new Error(cnt.error.message ?? 'ArcGIS count алдаа');

  const pages = Math.max(1, Math.ceil((cnt.count ?? 0) / PAGE));
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) => fetchPage(i * PAGE)),
  );
  return chunks.flat();
}

/* ⚠️ 2026-08-19: `loadRoadPaths` (et:5-ийн тусгай тохиолдол) ба доорх кэш
   (`loadRoadNetworkCached`) ХАСАГДАВ — хоёулаа зөвхөн бие биенээ дуудаж,
   гаднаас нэг ч дуудагчгүй байв. Сүлжээ татах бодит зам нь `netSources.ts` →
   `loadPathsFrom(url)` (ЕРӨНХИЙЧИЛСЭН хувилбар). */

/* ══════════════════ Аялал үүсгэлт → ирмэгийн жин ══════════════════ */

/** Аялал үүсгэлтийн нөлөө сулрах зай (БОДИТ метр) — бүсээс хол зам бага ачаалалтай. */
const DECAY_M = 350;

/**
 * Ирмэг бүрд `baseLoad` (0..1) ононо — ойрхон бүсийн аялал үүсгэлтийн НЯГТЛААР.
 *
 * ⚠️ Энэ нь ЖИНХЭНЭ оноолт (assignment) БИШ: маршрут бодохгүй, зөвхөн «хүн олонтой
 * бүсийн хажуугийн зам ачаалалтай» гэсэн орон зайн ойролцоолол. Тиймээс машины
 * ТАРХАЛТ бодитой, харин тодорхой хэрчмийн урсгалын ТОО баталгаагүй.
 */
export function assignLoads(net: Network, rows: MapRow[]): void {
  const src = rows
    .map((r) => {
      const c = r.displayGeom?.centroid;
      if (!c || r.polyHa <= 0) return null;
      return { x: c.x, y: c.y, w: zoneTrips(r) / r.polyHa };
    })
    .filter((x): x is { x: number; y: number; w: number } => x != null && x.w > 0);

  if (!src.length) {
    for (const e of net.edges) e.baseLoad = 0.5;
    return;
  }
  const maxW = src.reduce((a, z) => Math.max(a, z.w), 0) || 1;
  // Зай нь ПРОЕКЦЫН нэгжээр гардаг тул уналтын зайг мөн тэр нэгжид хөрвүүлнэ
  const decay = DECAY_M * (net.unitsPerMeter || 1);

  for (const e of net.edges) {
    const m = e.pts[Math.floor(e.pts.length / 2)];
    let best = 0;
    for (const z of src) {
      const d = Math.hypot(m[0] - z.x, m[1] - z.y);
      const v = (z.w / maxW) * Math.exp(-d / decay);
      if (v > best) best = v;
    }
    e.baseLoad = Math.max(0, Math.min(1, best));
  }
}


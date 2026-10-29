/**
 * ЗАМЫН СҮЛЖЭЭГ татаж, аялал үүсгэлтээр жинлэнэ.
 */

import { HOME } from '@/lib/services';
import { arcgisPost } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import type { Network, Pt } from './traffic';
import { zoneTrips } from './simulation';
import type { MapRow } from '../SuitMap';

/** Нэг хүсэлтэд авах бичлэгийн тоо (үйлчилгээний хязгаар 2000) */
const PAGE = 2000;

/**
 * Геометрийг ерөнхийлөх хүлцэл — ПРОЕКЦЫН нэгжээр (`WM_UNITS_PER_M`-ийг үз),
 * өөрөөр хэлбэл ≈1 бодит метр. 24 мянган хэрчмийн шилжүүлэх өгөгдөл 30 МБ-аас
 * 2.4 МБ болж багасна.
 */
const SIMPLIFY_M = 1.5;

/**
 * ТӨСЛИЙН ХҮРЭЭ (UTM 48N, метр) — хүсэлтийн орон зайн шүүлт.
 */
const AREA_UTM = { xmin: 641000, ymin: 5312000, xmax: 645000, ymax: 5317000 };
const AREA_WKID = 32648;

/**
 * WEB MERCATOR-ын НЭГЖ / БОДИТ МЕТР төслийн өргөрөгт.
 */
export const WM_UNITS_PER_M = 1 / Math.cos((HOME.lat * Math.PI) / 180);

type EsriPolyline = { paths?: number[][][] };
type QueryResp = {
  features?: { geometry?: EsriPolyline }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
};

const pageQuery = (offset: number, count = PAGE) => new URLSearchParams({
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
  /*
   * `orderByFields`-гүй үед хуудасны зааг дээр шугам ДАВХАРДАХ буюу УНАХ
   * эрсдэлтэй. Замын сүлжээнд шугам давхардвал НИЙТ УРТ хөөрөгдөж,
   * ачааллын тархалт, хүртээмжийн тооцоо бүхэлдээ гажина; унавал сүлжээ
   * тасарч маршрут олдохгүй болно. Хоёулаа ЧИМЭЭГҮЙ — алдаа гарахгүй.
   */
  orderByFields: 'objectid ASC',
  resultOffset: String(offset),
  resultRecordCount: String(count),
  f: 'json',
});

/**
 * ДУРЫН ArcGIS line давхаргын шугамуудыг Web Mercator оройн жагсаалт болгож татна.
 */
const slotFetch = <T extends { error?: { message?: string } }>(url: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> =>
  arcgisPost<T>(`${url}/query`, Object.fromEntries(params), { signal });

export async function loadPathsFrom(url: string, signal?: AbortSignal): Promise<Pt[][]> {
  const fetchPage = async (start: number, end: number): Promise<Pt[][]> => {
    const out: Pt[][] = [];
    let off = start;
    for (let guard = 0; off < end && guard < 50; guard++) {
      const r = await slotFetch<QueryResp>(url, pageQuery(off, end - off), signal);
      if (r.error) throw new Error(r.error.message ?? tr('ArcGIS query алдаа'));
      const got = r.features?.length ?? 0;
      for (const f of r.features ?? []) {
        for (const path of f.geometry?.paths ?? []) {
          if (path.length >= 2) out.push(path as Pt[]);
        }
      }
      off += got;
      if (!got || !r.exceededTransferLimit) break;
    }
    return out;
  };

  const cnt = await slotFetch<{ count?: number; error?: { message?: string } }>(
    url,
    new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({ ...AREA_UTM, spatialReference: { wkid: AREA_WKID } }),
      geometryType: 'esriGeometryEnvelope',
      inSR: String(AREA_WKID),
      spatialRel: 'esriSpatialRelIntersects',
      returnCountOnly: 'true',
      f: 'json',
    }),
    signal,
  );
  if (cnt.error) throw new Error(cnt.error.message ?? tr('ArcGIS count алдаа'));

  const total = cnt.count ?? 0;
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(tr('Замын сүлжээний давхарга хоосон ирлээ — шинжилгээ бодох боломжгүй.'));
  }
  const pages = Math.ceil(total / PAGE);
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) => fetchPage(i * PAGE, Math.min((i + 1) * PAGE, total))),
  );
  return chunks.flat();
}


/* ══════════════════ Аялал үүсгэлт → ирмэгийн жин ══════════════════ */

/** Аялал үүсгэлтийн нөлөө сулрах зай (БОДИТ метр) — бүсээс хол зам бага ачаалалтай. */
const DECAY_M = 350;

/**
 * Ирмэг бүрд `baseLoad` (0..1) ононо — ойрхон бүсийн аялал үүсгэлтийн НЯГТЛААР.
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


/**
 * ArcGIS REST асуулгын давхарга.
 *
 * Статистик татахад ArcGIS JS SDK ачаалах шаардлагагүй — `fetch` хангалттай бөгөөд
 * хамаагүй хөнгөн. SDK-г зөвхөн газрын зураг зурахад ашиглана.
 *
 * Дүрэм: алдааг ЧИМЭЭГҮЙ залгихгүй. Дуудагч тал алдааг мэдэж, UI дээр харуулна.
 * (Хуучин апп fetch алдааг залгидаг байсан тул сүлжээ унавал дэлгэц дээр хуучин
 * тоо үлдэж, хэрэглэгч буруу мэдээлэл харж байлаа.)
 */

export type Stat = {
  statisticType: 'count' | 'sum' | 'avg';
  onStatisticField: string;
  outStatisticFieldName: string;
};

export const count = (f: string, as = 'c'): Stat => ({ statisticType: 'count', onStatisticField: f, outStatisticFieldName: as });
export const sum = (f: string, as = 's'): Stat => ({ statisticType: 'sum', onStatisticField: f, outStatisticFieldName: as });
export const avg = (f: string, as = 'a'): Stat => ({ statisticType: 'avg', onStatisticField: f, outStatisticFieldName: as });

export class ArcGISError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = 'ArcGISError';
  }
}

export type Row = Record<string, string | number | null>;

type Body = { features?: { attributes: Row }[]; count?: number; error?: { message?: string } };

/**
 * POST-оор явуулна — where нөхцөл, геометр, outStatistics урт болоход GET-ийн
 * URL хязгаарт мөргөхөөс сэргийлнэ.
 */
async function request(url: string, params: Record<string, string>): Promise<Body> {
  const full = `${url}/query`;
  const res = await fetch(full, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...params }),
  });
  if (!res.ok) throw new ArcGISError(`HTTP ${res.status}`, full);
  const body: Body = await res.json();
  // ArcGIS алдааг HTTP 200-тай буцаадаг — заавал шалгана
  if (body.error) throw new ArcGISError(body.error.message || 'ArcGIS алдаа', full);
  return body;
}

/* ── Орон зайн шүүлт ── */

/** Орон зайн харьцаа */
const REL = {
  intersects: 'esriSpatialRelIntersects',
  /** Огтлолцоогүй — хилээс ГАДУУР байгаа объектыг олоход */
  disjoint: 'esriSpatialRelDisjoint',
  within: 'esriSpatialRelWithin',
  contains: 'esriSpatialRelContains',
} as const;

export type Aoi = {
  /** ArcGIS геометрийн JSON (полигонд rings, цэгт x/y + spatialReference) */
  geometry: unknown;
  wkid: number;
  /** Анхдагч: intersects */
  rel?: keyof typeof REL;
  /** Анхдагч: polygon */
  type?: 'polygon' | 'point';
  /**
   * Цэгэн сонголтын ХҮЛЦЭЛ (метр).
   * ⚠️ Заавал: нимгэн шугам, цэгэн объект дээр яг таг тааруулж дарах боломжгүй
   * тул дэлгэцийн хэдэн пикселд харгалзах зайг өгнө.
   */
  distance?: number;
};

const spatial = (aoi?: Aoi): Record<string, string> =>
  aoi
    ? {
        geometry: JSON.stringify(aoi.geometry),
        geometryType: aoi.type === 'point' ? 'esriGeometryPoint' : 'esriGeometryPolygon',
        spatialRel: REL[aoi.rel ?? 'intersects'],
        inSR: String(aoi.wkid),
        ...(aoi.distance ? { distance: String(aoi.distance), units: 'esriSRUnit_Meter' } : {}),
      }
    : {};

/* ── Асуулгууд ── */

/** Мөрийн тоо */
export async function queryCount(url: string, where = '1=1', aoi?: Aoi): Promise<number> {
  const body = await request(url, { where, returnCountOnly: 'true', ...spatial(aoi) });
  return body.count ?? 0;
}

/** Нэг мөр статистик (бүлэглэлгүй) */
export async function queryStats(url: string, stats: Stat[], where = '1=1', aoi?: Aoi): Promise<Row> {
  const body = await request(url, { where, outStatistics: JSON.stringify(stats), ...spatial(aoi) });
  return body.features?.[0]?.attributes ?? {};
}

/** Талбараар бүлэглэсэн статистик */
export async function queryGroup(
  url: string,
  groupBy: string,
  stats: Stat[],
  where = '1=1',
  aoi?: Aoi,
): Promise<Row[]> {
  const body = await request(url, {
    where,
    groupByFieldsForStatistics: groupBy,
    outStatistics: JSON.stringify(stats),
    ...spatial(aoi),
  });
  return (body.features ?? []).map((f) => f.attributes);
}

/** Бичлэгүүдийг талбартай нь татах */
export async function queryFeatures(
  url: string,
  opts: { where?: string; outFields?: string[]; orderBy?: string; limit?: number; aoi?: Aoi } = {},
): Promise<Row[]> {
  const params: Record<string, string> = {
    where: opts.where ?? '1=1',
    outFields: (opts.outFields ?? ['*']).join(','),
    returnGeometry: 'false',
    ...spatial(opts.aoi),
  };
  if (opts.orderBy) params.orderByFields = opts.orderBy;
  if (opts.limit) params.resultRecordCount = String(opts.limit);
  const body = await request(url, params);
  return (body.features ?? []).map((f) => f.attributes);
}

/** Полигоны геометрийг WGS84-д татна — орон зайн шүүлтэд эх болгож ашиглана */
export async function queryPolygon(url: string, where = '1=1'): Promise<Aoi | null> {
  const body = await request(url, {
    where,
    outFields: '',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '1',
  });
  const g = (body.features as unknown as { geometry?: { rings?: number[][][] } }[] | undefined)?.[0]?.geometry;
  if (!g?.rings) return null;
  return { geometry: { rings: g.rings, spatialReference: { wkid: 4326 } }, wkid: 4326 };
}

export type Point = { attrs: Row; lon: number; lat: number };

/** Цэгэн объектуудыг координаттай нь татна (WGS84) */
export async function queryPoints(
  url: string,
  opts: { where?: string; outFields?: string[]; orderBy?: string; limit?: number; aoi?: Aoi } = {},
): Promise<Point[]> {
  const params: Record<string, string> = {
    where: opts.where ?? '1=1',
    outFields: (opts.outFields ?? ['*']).join(','),
    returnGeometry: 'true',
    outSR: '4326',
    ...spatial(opts.aoi),
  };
  if (opts.orderBy) params.orderByFields = opts.orderBy;
  if (opts.limit) params.resultRecordCount = String(opts.limit);

  const body = await request(url, params);
  const feats = (body.features ?? []) as unknown as { attributes: Row; geometry?: { x: number; y: number } }[];
  return feats
    .filter((f) => f.geometry && Number.isFinite(f.geometry.x))
    .map((f) => ({ attrs: f.attributes, lon: f.geometry!.x, lat: f.geometry!.y }));
}

export type ExtentBox = { xmin: number; ymin: number; xmax: number; ymax: number; wkid: number };

/**
 * Давхаргын хүрээ — заасан проекцоор.
 *
 * ⚠️ ArcGIS SDK-ийн `FeatureLayer.queryExtent()`-ийг ЗОРИУДААР ашиглахгүй: тэр нь
 * `where`-ыг анхдагч гэж үзээд хүсэлтэд огт оруулдаггүй бөгөөд эдгээр FeatureServer
 * түүнийг 400 «No where clause specified» гэж татгалздаг. REST рүү шууд хандвал
 * `where=1=1` бичигдэж, найдвартай ажиллана.
 */
export async function queryExtent(url: string, wkid = 102100, where = '1=1'): Promise<ExtentBox | null> {
  const body = await request(url, {
    where,
    returnExtentOnly: 'true',
    outSR: String(wkid),
  });
  const e = (body as { extent?: { xmin: number; ymin: number; xmax: number; ymax: number } }).extent;
  if (!e || !Number.isFinite(e.xmin)) return null;
  return { xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax, wkid };
}

/** SQL мөрийн утга — нэг хашилтыг хоёр болгож escape хийнэ */
export const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** ArcGIS-ийн хоосон утга: null, "" эсвэл зөвхөн зай (" ") */
const isBlank = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '');

/**
 * «Хоосон» талбарын SQL нөхцөл.
 *
 * `groups()` нь null, "" ба " " бүгдийг НЭГ бүлэгт нэгтгэдэг. Газрын зурагт
 * шүүхэд ижил олонлогийг сонгох ёстой — тиймээс `TRIM()` ашиглана. Зөвхөн
 * `= ' '` гэж бичвэл хэд хэдэн зайтай утга шүүлтээс мултарч, баганы тоо ба
 * зураг дээрх сонголт зөрөх болно.
 */
export const blankWhere = (field: string) => `${field} IS NULL OR TRIM(${field}) = ''`;

export type Group = {
  /** Бүлгийн нэр — хоосон бол `emptyLabel` */
  label: string;
  /** Бүлэгт нэгдсэн БҮХ түүхий утга. Хоосон бүлэгт хоосон массив. */
  raws: string[];
  /** Хоосон бүлэг эсэх */
  blank: boolean;
  /** Тоон хэмжигдэхүүнүүд (outStatistics-ийн outStatisticFieldName-ээр) */
  values: Record<string, number>;
};

/**
 * Бүлэглэсэн үр дүнг цэвэрлэнэ.
 *
 * ArcGIS нь `null`, `''` ба `' '` утгыг ТУСДАА бүлэг болгож буцаадаг тул
 * "Бүртгэгдээгүй" мөр давхардаж гарна. Хоосны бүх хувилбарыг нэг бүлэгт нэгтгэнэ.
 * Мөн `'Зам'` ба `'Зам '` шиг зайтай хувилбарыг ч нэгтгэнэ.
 *
 * Нэгтгэсэн бүх түүхий утгыг `raws`-д хадгална — газрын зурагт шүүхэд `IN (…)`
 * бичиж, баганад тоологдсонтой ЯГ ижил олонлогийг сонгоно.
 */
export function groups(rows: Row[], field: string, emptyLabel: string, numeric: string[]): Group[] {
  const merged = new Map<string, Group>();

  for (const r of rows) {
    const empty = isBlank(r[field]);
    const label = empty ? emptyLabel : String(r[field]).trim();
    const g = merged.get(label) ?? {
      label,
      raws: [],
      blank: empty,
      values: Object.fromEntries(numeric.map((k) => [k, 0])),
    };
    if (!empty) {
      const raw = String(r[field]);
      if (!g.raws.includes(raw)) g.raws.push(raw);
    }
    for (const k of numeric) g.values[k] += Number(r[k] ?? 0);
    merged.set(label, g);
  }

  return [...merged.values()].sort((a, b) => (b.values[numeric[0]] ?? 0) - (a.values[numeric[0]] ?? 0));
}

/** Бүлгийг газрын зурагт шүүх SQL — тоологдсонтой яг ижил олонлог сонгоно */
export const groupWhere = (field: string, g: Group): string =>
  g.blank ? blankWhere(field) : `${field} IN (${g.raws.map(sqlStr).join(', ')})`;

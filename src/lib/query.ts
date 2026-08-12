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

type Body = { features?: { attributes: Row }[]; count?: number; exceededTransferLimit?: boolean; error?: { message?: string } };

/**
 * POST-оор явуулна — where нөхцөл, геометр, outStatistics урт болоход GET-ийн
 * URL хязгаарт мөргөхөөс сэргийлнэ.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ ЗЭРЭГ хүсэлтийн ХЯЗГААРЛАГЧ. Дашбоард нэг дор 40+ хүсэлт (өртөг 24, анализ,
 * газрын зургийн давхаргууд) явуулах үед ArcGIS «Too many requests» гэж
 * татгалздаг. Зэрэг явах хүсэлтийг хязгаарлавал сервер даахаас гадна үлдсэн нь
 * дараалалд хүлээж, шатлан ордог — бүх карт ба давхарга ачаалагдана.
 */
const MAX_CONCURRENT = 6;
let active = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  if (active >= MAX_CONCURRENT) {
    // ⚠️ Сэрэхдээ active-ийг ДАХИН нэмэхгүй — release() слотоо шууд гардуулсан
    //    (active хэвээр). Эс бөгөөс буулгах↔нэмэх хоёрын завсарт өөр acquire
    //    шургалж MAX_CONCURRENT түр хэтэрч, «Too many requests» эргэн ирнэ.
    await new Promise<void>((r) => waiters.push(r));
    return;
  }
  active++;
}
function release() {
  // Хүлээгч байвал слотыг ШУУД гардуулна — active тоо өөрчлөгдөхгүй
  const w = waiters.shift();
  if (w) w();
  else active--;
}

/**
 * ⚠️ ХУРДНЫ ХЯЗГААР дээр дахин оролдоно. Дашбоард нэг дор олон хүсэлт (өртөг 24,
 * анализ) явуулах үед ArcGIS «Unable to perform query. Too many requests.» гэж
 * HTTP 200-тай буцаадаг (эсвэл 429/503). Энэ нь ТҮР зуурын тул экспоненциал
 * backoff-той хэдэн удаа дахин оролдвол өөрөө засрана — эс бөгөөс карт чимээгүй
 * алдаа харуулна.
 */
const RETRIES = 4;
const isRateLimit = (msg: string) => /too many requests|rate limit/i.test(msg);

async function attemptRequest(url: string, params: Record<string, string>, attempt: number): Promise<Body> {
  const full = `${url}/query`;
  const res = await fetch(full, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...params }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      return attemptRequest(url, params, attempt + 1);
    }
    throw new ArcGISError(`HTTP ${res.status}`, full);
  }
  const body: Body = await res.json();
  // ArcGIS алдааг HTTP 200-тай буцаадаг — заавал шалгана
  if (body.error) {
    if (isRateLimit(body.error.message ?? '') && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      return attemptRequest(url, params, attempt + 1);
    }
    throw new ArcGISError(body.error.message || 'ArcGIS алдаа', full);
  }
  return body;
}

async function request(url: string, params: Record<string, string>): Promise<Body> {
  await acquire();
  try {
    return await attemptRequest(url, params, 0);
  } finally {
    release();
  }
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
  // ⚠️ Бүлгийн тоо maxRecordCount-аас хэтэрвэл сервер үр дүнг ЧИМЭЭГҮЙ тайрдаг —
  //    ховор ч тохиолдвол ядаж лог үлдээж мэдэгдэнэ.
  if (body.exceededTransferLimit) console.warn(`[selbe] queryGroup тайрагдав (exceededTransferLimit): ${url}`);
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

  // ⚠️ ХУУДАСЛАЛТ: сервер maxRecordCount(~2000)-аас олон мөрийг нэг хариунд
  //    өгөхгүй — exceededTransferLimit=true тавиад ТАЙРЧ буцаадаг. Давталтгүй
  //    бол их өгөгдөлтэй давхаргын мөрүүд чимээгүй дутуу ирж, алдаагүй мэт
  //    харагдана. resultOffset-оор үлдсэн хуудсуудыг татаж нэгтгэнэ.
  const rows: Row[] = [];
  for (;;) {
    const page = { ...params };
    if (rows.length) page.resultOffset = String(rows.length);
    if (opts.limit) page.resultRecordCount = String(opts.limit - rows.length);
    const body = await request(url, page);
    const feats = (body.features ?? []).map((f) => f.attributes);
    rows.push(...feats);
    if (!body.exceededTransferLimit) break;
    if (opts.limit && rows.length >= opts.limit) break;
    // Хамгаалалт: хоосон хуудас ирвэл мөнхийн давталтаас гарна
    if (!feats.length) break;
  }
  return rows;
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
 * «Хоосон» талбарын SQL нөхцөл — `null` ба тоологдсон бүх хоосон хувилбар.
 *
 * ⚠️ `TRIM()` ХЭРЭГЛЭХГҮЙ. Эдгээр FeatureServer нь `TRIM`/`LTRIM`-ийг
 * ТАТГАЛЗДАГ (`UPPER`, `LIKE` ажилладаг ч) бөгөөс хүсэлт нь чимээгүй унаж,
 * «Бүртгэгдээгүй / Тодорхойгүй» мөр дарахад зурагт ЮУ Ч БОЛДОГГҮЙ байв.
 *
 * Оронд нь `groups()`-ын цуглуулсан ЖИНХЭНЭ түүхий утгуудыг (`''`, `' '`,
 * `'  '` …) шууд жагсаана — тоологдсонтой ЯГ ижил олонлог, ямар ч SQL
 * функцгүй тул бүх үйлчилгээнд зөөвөрлөгдөнө.
 */
export const blankWhere = (field: string, raws: string[] = []) =>
  [
    `${field} IS NULL`,
    ...(raws.length ? [`${field} IN (${raws.map(sqlStr).join(', ')})`] : []),
  ].join(' OR ');

export type Group = {
  /** Бүлгийн нэр — хоосон бол `emptyLabel` */
  label: string;
  /**
   * Бүлэгт нэгдсэн БҮХ түүхий утга.
   * ⚠️ Хоосон бүлэгт `null`-аас БУСАД хувилбарууд (`''`, `' '` …) — `blankWhere`
   * тэдгээрийг `IN (…)`-д жагсааж `TRIM()`-гүйгээр шүүнэ.
   */
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
    // ⚠️ Хоосон бүлэгт ч түүхий утгыг ЦУГЛУУЛНА (`null`-аас бусдыг) — `blankWhere`
    //    тэдгээрийг жагсааж, `TRIM()`-гүйгээр яг ижил олонлогийг шүүнэ.
    if (r[field] != null) {
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
  g.blank ? blankWhere(field, g.raws) : `${field} IN (${g.raws.map(sqlStr).join(', ')})`;

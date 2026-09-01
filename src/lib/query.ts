import { t as tr } from '@/lib/i18nCore';
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

type Body = { features?: { attributes: Row }[]; count?: number; exceededTransferLimit?: boolean; objectIdFieldName?: string; error?: { message?: string } };

/**
 * POST-оор явуулна — where нөхцөл, геометр, outStatistics урт болоход GET-ийн
 * URL хязгаарт мөргөхөөс сэргийлнэ.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ ЗЭРЭГ хүсэлтийн ХЯЗГААРЛАГЧ. Дашбоард нэг дор 40+ хүсэлт (каталогийн
 * тоо/хэмжээ, анализ, газрын зургийн давхаргууд) явуулах үед ArcGIS «Too many requests» гэж
 * татгалздаг. Зэрэг явах хүсэлтийг хязгаарлавал сервер даахаас гадна үлдсэн нь
 * дараалалд хүлээж, шатлан ордог — бүх карт ба давхарга ачаалагдана.
 */
const MAX_CONCURRENT = 6;
let active = 0;
const waiters: (() => void)[] = [];
/** Хязгаарлагчийг ГАДНЫ fetch-үүдэд ч ашиглуулна (parcelOverlap г.м.) —
 * тойрч гарсан хүсэлт «Too many requests»-ийн шалтгаан болдог (2026-08-21). */
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try { return await fn(); } finally { release(); }
}
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
 * ⚠️ ХУРДНЫ ХЯЗГААР дээр дахин оролдоно. Дашбоард нэг дор олон хүсэлт
 * (каталогийн тоо/хэмжээ, анализ) явуулах үед ArcGIS «Unable to perform query. Too many requests.» гэж
 * HTTP 200-тай буцаадаг (эсвэл 429/503). Энэ нь ТҮР зуурын тул экспоненциал
 * backoff-той хэдэн удаа дахин оролдвол өөрөө засрана — эс бөгөөс карт чимээгүй
 * алдаа харуулна.
 */
const RETRIES = 4;
/** Rate-limit мессеж — энд болон хязгаарлагчаар ордог гадны fetch-үүд (roadNet г.м.) хамт шалгана */
export const isRateLimit = (msg: string) => /too many requests|rate limit/i.test(msg);

/**
 * ⚠️ Хүсэлт бүрийн ДЭЭД хугацаа. Timeout-гүй үед гацсан хүсэлт (TCP нээгдсэн ч
 * хариу ирэхгүй) слотоо суллахгүй тул 6 ийм хүсэлт MAX_CONCURRENT-ийг дүүргэж,
 * порталын БҮХ дараагийн асуулга waiters дараалалд царцдаг байв. 30с нь
 * хэмжигдсэн хамгийн хүнд асуулга (~1.8с)-аас хангалттай өгөөмөр; хэтэрвэл
 * слот finally-гээр суллагдаж, дуудагч UI дээр алдаа харуулна.
 */
const TIMEOUT_MS = 30_000;

async function attemptRequest(url: string, params: Record<string, string>, attempt: number, netRetried = false): Promise<Body> {
  const full = `${url}/query`;
  let res: Response;
  try {
    res = await fetch(full, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ f: 'json', ...params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Түр зуурын сүлжээний тасалт (browser-т fetch-ийн network алдаа нь яг
    // TypeError) — НЭГ удаа богино хүлээгээд дахин оролдоно. Нэг view-ийн олон
    // асуулгын Promise.all-д ганц глитч бүтэн харагдацыг унагадаг байв.
    // Rate-limit retry-ээс ТУСДАА тоолуур (netRetried) тул давхардахгүй.
    if (e instanceof TypeError && !netRetried) {
      await sleep(300 + Math.random() * 200);
      return attemptRequest(url, params, attempt, true);
    }
    // Timeout-ыг ДАХИН оролдохгүй (аль хэдийн 30с хүлээсэн) — ArcGISError болгож
    // дуудагчид хүргэнэ: файлын дүрмээр алдаа UI-д харагдах ёстой.
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ArcGISError(tr('Хүсэлтийн хугацаа хэтэрлээ ({0} сек)', TIMEOUT_MS / 1000), full);
    }
    throw e;
  }
  if (!res.ok) {
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      return attemptRequest(url, params, attempt + 1, netRetried);
    }
    throw new ArcGISError(`HTTP ${res.status}`, full);
  }
  const body: Body = await res.json();
  // ArcGIS алдааг HTTP 200-тай буцаадаг — заавал шалгана
  if (body.error) {
    if (isRateLimit(body.error.message ?? '') && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      return attemptRequest(url, params, attempt + 1, netRetried);
    }
    throw new ArcGISError(body.error.message || tr('ArcGIS алдаа'), full);
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

  // ⚠️ ХУУДАСЛАЛТ: сервер maxRecordCount(~2000)-аас олон мөрийг нэг хариунд
  //    өгөхгүй — exceededTransferLimit=true тавиад ТАЙРЧ буцаадаг. Давталтгүй
  //    бол их өгөгдөлтэй давхаргын мөрүүд чимээгүй дутуу ирж, алдаагүй мэт
  //    харагдана. resultOffset-оор үлдсэн хуудсуудыг татаж нэгтгэнэ.
  //
  // ⚠️ Эрэмбэгүй resultOffset хуудаслалт ArcGIS-д ТОГТВОРГҮЙ — хуудасны зааг дээр
  //    мөр давхардах/унах эрсдэлтэй (алдаагүй мэт). Дуудагч orderBy өгөөгүй бол
  //    давхаргын OID талбараар (хариунаас `objectIdFieldName` олдоно) эрэмбэлж
  //    тогтворжуулна. OID нэр давхаргаар өөр (OBJECTID/FID/ObjectID) тул хатуу
  //    нэр бичихгүй — зөвхөн хуудаслах шаардлага гарсан үед л (эхний хуудас
  //    тайрагдвал) OID-оор эрэмбэлж ЭХНЭЭС нь дахин татна. Нэг хуудасны хариу
  //    (нийтлэг тохиолдол) огт өөрчлөгдөхгүй.
  let order = opts.orderBy;
  const collect = async (): Promise<{ rows: Row[]; oidField?: string; restart: boolean }> => {
    const rows: Row[] = [];
    let oidField: string | undefined;
    for (;;) {
      const page = { ...params };
      if (order) page.orderByFields = order;
      if (rows.length) page.resultOffset = String(rows.length);
      if (opts.limit) page.resultRecordCount = String(opts.limit - rows.length);
      const body = await request(url, page);
      oidField = body.objectIdFieldName ?? oidField;
      const feats = (body.features ?? []).map((f) => f.attributes);
      // ⚠️ `exceededTransferLimit` нь ХОЁР ӨӨР шалтгаанаар асдаг: (а) серверийн
      //    `maxRecordCount` таслав, (б) ДУУДАГЧИЙН `limit` (=`resultRecordCount`)
      //    таслав. (б) тохиолдолд доорх `break` ажиллаж хуудаслалт ер нь
      //    эхлэхгүй тул эрэмбэ хэрэггүй — гэтэл ялгалгүй restart хийж байсан тул
      //    `limit`-тэй дуудлага бүр (жиш. `pickByQuery`-ийн `limit: 1` — цэгэн
      //    дээр 2+ объект байхад ҮРГЭЛЖ асдаг) хоёр дахин явж, 6 слотын
      //    хязгаарлагчийг дэмий дүүргэж «Too many requests» руу түлхдэг байв.
      //    Хуудас нь `limit`-ээр ДҮҮРСЭН эсэхээр л ялгана.
      const cappedByLimit = opts.limit != null && feats.length >= opts.limit;
      if (!order && rows.length === 0 && body.exceededTransferLimit && oidField && !cappedByLimit) {
        return { rows: [], oidField, restart: true };
      }
      rows.push(...feats);
      if (!body.exceededTransferLimit) break;
      if (opts.limit && rows.length >= opts.limit) break;
      // Хамгаалалт: хоосон хуудас ирвэл мөнхийн давталтаас гарна
      if (!feats.length) break;
    }
    return { rows, restart: false };
  };

  let res = await collect();
  if (res.restart && res.oidField) {
    order = `${res.oidField} ASC`;
    res = await collect();
  }
  return res.rows;
}

export type ExtentBox ={ xmin: number; ymin: number; xmax: number; ymax: number; wkid: number };

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

import { t as tr } from '@/lib/i18nCore';
import {
  tokenParam, ensureFreshToken, isTokenError, describeArcgisError, refreshAfterTokenError, isPortalUrl,
  lastRefreshFail, sessionDead,
} from '@/lib/authToken';
import { writeEpoch } from '@/lib/dataBus';
import { fixImportStamps } from '@/lib/editTrack';
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
  constructor(
    message: string,
    readonly url: string,
    /** ArcGIS-ийн `error.code` (498/499 токен, 400 Invalid URL …) — дуудагч түр/тогтвортой алдааг ялгана */
    readonly code?: number,
    /** ArcGIS-ийн `error.details` — `hyanalt.post` мессежид залгадаг */
    readonly details?: string[],
    readonly sessionExpired = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ArcGISError';
  }
}

export type Row = Record<string, string | number | null>;

/** ArcGIS хариуны бие — алдаа нь HTTP 200-аар `error`-т ирдэг */
export type ArcgisBody = Record<string, unknown> & {
  error?: { code?: number; message?: string; details?: string[] };
};

type Body = ArcgisBody & { features?: { attributes: Row }[]; count?: number; exceededTransferLimit?: boolean; objectIdFieldName?: string };

/**
 * POST-оор явуулна — where нөхцөл, геометр, outStatistics урт болоход GET-ийн
 * URL хязгаарт мөргөхөөс сэргийлнэ.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Хэмжилт (60 хүсэлтийн ижил ачаалал, амьд үйлчилгээ): 6 слот 4,184 мс ·
 * 10 слот 2,578 мс · 14 слот 1,671 мс — «Too many requests» хариу ГУРВУУЛАНД
 * НЬ 0. Өөрөөр хэлбэл 6 нь хэтэрхий болгоомжтой байсан; «Саад — багцаар»-ийн
 * 139 хүсэлт зөвхөн дарааллын улмаас 11 секунд болдог байв.
 */
const CONCURRENT_FLOOR = 6;
let limit = 12;
/** Хурдны хязгаар илэрмэгц баталгаажсан түвшинд БУЦНА — эргэж өсөхгүй */
function throttleDown() {
  if (limit > CONCURRENT_FLOOR) limit = CONCURRENT_FLOOR;
}
let active = 0;
const waiters: (() => void)[] = [];
/** Хязгаарлагчийг ГАДНЫ fetch-үүдэд ч ашиглуулна (parcelOverlap г.м.) —
 * тойрч гарсан хүсэлт «Too many requests»-ийн шалтгаан болдог (2026-08-21). */
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try { return await fn(); } finally { release(); }
}
async function acquire() {
  if (active >= limit) {
    await new Promise<void>((r) => waiters.push(r));
    return;
  }
  active++;
}
function release() {
  if (active > limit) { active--; return; }
  // Хүлээгч байвал слотыг ШУУД гардуулна — active тоо өөрчлөгдөхгүй
  const w = waiters.shift();
  if (w) w();
  else active--;
}

const RETRIES = 4;
/** Rate-limit мессеж — энд болон хязгаарлагчаар ордог гадны fetch-үүд (roadNet г.м.) хамт шалгана */
export const isRateLimit = (msg: string) => /too many requests|rate limit/i.test(msg);

const TIMEOUT_MS = 30_000;

/**
 * БАЙГУУЛЛАГЫН ҮЙЛЧИЛГЭЭ мөн үү — токеныг ЗӨВХӨН тийш нь илгээнэ.
 */
const ORG_BASE = (process.env.NEXT_PUBLIC_ENT_DATA ?? '').trim().replace(/\/+$/, '').replace(/\/Hosted$/i, '');
const isOrgUrl = (url: string): boolean => !!ORG_BASE && url.startsWith(`${ORG_BASE}/`);

const warnedHosts = new Set<string>();
function warnForeignHost(url: string): void {
  if (process.env.NODE_ENV === 'production') return;
  let key = url;
  try { const u = new URL(url); key = u.origin; } catch { /* харьцангуй хаяг — бүтнээр */ }
  if (warnedHosts.has(key)) return;
  warnedHosts.add(key);
  console.warn(`[query] token:'always' — org/портал биш хост (${key}): хэрэглэгчийн токен залгасангүй`);
}

/**
 * НЭГ ХҮСЭЛТИЙН ЗАМ — `arcgisPost`/`request`-ийн хуваалцсан цөм (2026-09-30).
 *
 * Сонголтууд (`ArcgisReqOpts`):
 *   · `token: 'always'` (анхдагч) — нэвтэрсэн хэрэглэгчийн ОДООГИЙН токен ҮРГЭЛЖ
 *     явна, дуудагчийн `params.token`-ийг ДАРНА (дуудагч эрт уншсан токен хуучирсан
 *     байж болно — `authToken.arcgisPost`-ын 2026-09-29-ний шийдвэр).
 *   · `token: 'org'` — зөвхөн байгууллагын URL-д (`isOrgUrl`), дуудагчийн `token`
 *     давамгайлна (`queryFeatures`/`queryExtent`-ийн хуучин зан).
 *   · `slot: false` — хязгаарлагчийн слот АВАХГҮЙ: дуудагч аль хэдийн `withSlot`
 *     дотор байвал давхар (2026-09-30: src-д `withSlot`-ийн гадна хэрэглээ үлдээгүй — `agsFetch` ч слотоо өөрөө авна)
 *     авбал слот дуусахад бие биенээ хүлээж ГАЦНА.
 *   · `describe: true` — алдааны мессежид унасан замыг залгана (`describeArcgisError`).
 *   · `timeoutMs` — зөвхөн шалгуурт (анхдагч `TIMEOUT_MS`).
 */
export type ArcgisReqOpts = {
  token?: 'always' | 'org';
  signal?: AbortSignal;
  slot?: boolean;
  describe?: boolean;
  timeoutMs?: number;
};

const backoff = (attempt: number) => sleep(400 * 2 ** attempt + Math.random() * 200);

const NET_RETRIES = 3;
const HTTP5_RETRIES = 2;
const netBackoff = (n: number) => sleep(350 * 2 ** n + Math.random() * 200);
const isReadReq = (url: string, params: Record<string, string>): boolean =>
  /\/(query|queryAttachments|queryRelatedRecords|queryDomains)\/?$/i.test(url)
  || /\/\d+\/attachments\/?$/i.test(url)
  || (Object.keys(params).length === 0 && /\/(FeatureServer|MapServer)(\/\d+)?\/?$/i.test(url));

async function attemptRequest(
  full: string,
  params: Record<string, string>,
  o: ArcgisReqOpts,
  attempt: number,
  /** Сүлжээ/5xx-ийн дахин оролдлогын тоо (2026-10-05: boolean → тоолуур) */
  netTries = 0,
  refreshed = false,
): Promise<ArcgisBody> {
  // Also covers cancellation while queued, backing off, or refreshing a token.
  if (o.signal?.aborted) throw o.signal.reason;
  const readReq = isReadReq(full, params);
  const timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
  const always = o.token !== 'org';
  const p = params;
  const hostOk = always ? isOrgUrl(full) || isPortalUrl(full) : isOrgUrl(full);
  const userTok = hostOk ? tokenParam() : {};
  if (always && !hostOk) warnForeignHost(full);
  const body = always
    ? { f: 'json', ...p, ...userTok }
    : { f: 'json', ...userTok, ...p };
  /** Энэ хүсэлтэд ЯВСАН хэрэглэгчийн токен — 498-ийн дараа «аль хэдийн солигдсон уу» */
  const sentTok = userTok.token ?? null;
  const ac = new AbortController();
  const onAbort = () => ac.abort(o.signal?.reason);
  if (o.signal?.aborted) onAbort();
  else o.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(new DOMException(`timeout ${timeoutMs}ms`, 'TimeoutError')), timeoutMs);
  const timedOut = (): boolean =>
    ac.signal.aborted && !o.signal?.aborted
    && ac.signal.reason instanceof DOMException && ac.signal.reason.name === 'TimeoutError';
  let res: Response;
  /** Биеийн JSON — `null` бол уншигдаагүй (HTTP алдаа) эсвэл JSON биш (`notJson`) */
  let json: ArcgisBody | null = null;
  let notJson = false;
  try {
    res = await fetch(full, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: ac.signal,
    });
    if (res.ok) {
      try {
        json = (await res.json()) as ArcgisBody;
      } catch (e) {
        if (ac.signal.aborted) throw e; // timeout / хэрэглэгчийн цуцлалт — доорх catch
        notJson = true;
      }
    }
  } catch (e) {
    // Түр зуурын сүлжээний тасалт (browser-т fetch-ийн network алдаа нь яг
    // TypeError) — НЭГ удаа богино хүлээгээд дахин оролдоно. Нэг view-ийн олон
    // асуулгын Promise.all-д ганц глитч бүтэн харагдацыг унагадаг байв.
    // Rate-limit retry-ээс ТУСДАА тоолуур (netTries) тул давхардахгүй.
    // Only known reads can be replayed: a lost write response may follow a commit.
    if (e instanceof TypeError && netTries < NET_RETRIES && readReq && !o.signal?.aborted && !timedOut()) {
      if (netTries === 0) await sleep(300 + Math.random() * 200);
      else await netBackoff(netTries);
      return attemptRequest(full, params, o, attempt, netTries + 1, refreshed);
    }
    // Timeout-ыг ДАХИН оролдохгүй (аль хэдийн 30с хүлээсэн) — ArcGISError болгож
    // дуудагчид хүргэнэ: файлын дүрмээр алдаа UI-д харагдах ёстой.
    if (timedOut() || (e instanceof DOMException && e.name === 'TimeoutError')) {
      throw new ArcGISError(tr('Хүсэлтийн хугацаа хэтэрлээ ({0} сек)', timeoutMs / 1000), full);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
  if (o.signal?.aborted) throw o.signal.reason;
  if (!res.ok) {
    if (res.status === 429 || res.status === 503) throttleDown();
    // A proxy's 429/503 does not prove that an upstream write was rolled back.
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES && readReq) {
      await backoff(attempt);
      return attemptRequest(full, params, o, attempt + 1, netTries, refreshed);
    }
    if ((res.status === 500 || res.status === 502 || res.status === 504)
      && netTries < HTTP5_RETRIES && readReq) {
      await netBackoff(netTries);
      return attemptRequest(full, params, o, attempt, netTries + 1, refreshed);
    }
    throw new ArcGISError(`HTTP ${res.status}`, full, undefined, undefined, false, res.status);
  }
  if (notJson || json == null) {
    throw new ArcGISError(tr('Үйлчилгээ JSON биш хариу буцаав — сүлжээгээ шалгана уу'), full);
  }
  // ArcGIS алдааг HTTP 200-тай буцаадаг — заавал шалгана
  if (json.error) {
    const { code, message, details } = json.error;
    if (isRateLimit(message ?? '')) throttleDown();
    if (isRateLimit(message ?? '') && attempt < RETRIES && readReq) {
      await backoff(attempt);
      return attemptRequest(full, params, o, attempt + 1, netTries, refreshed);
    }
    let sessionExpired = false;
    if (!refreshed && hostOk && isTokenError(code, message) && (always || !('token' in params))) {
      if (await refreshAfterTokenError(sentTok)) {
        return attemptRequest(full, params, o, attempt, netTries, true);
      }
      const fail = lastRefreshFail();
      if (sentTok != null && fail === 'network' && !sessionDead()) {
        throw new ArcGISError(message ? `Failed to fetch (token refresh) · ${message}` : 'Failed to fetch (token refresh)', full, code, details, false);
      }
      sessionExpired = sentTok != null && (fail === 'dead' || sessionDead());
    }
    const msg = message || details?.[0] || tr('ArcGIS алдаа');
    throw new ArcGISError(o.describe ? describeArcgisError(full, code, msg) : msg, full, code, details, sessionExpired);
  }
  return isOrgUrl(full) ? fixImportStamps(json) : json;
}

/** Слот авч (эсвэл авалгүй) нэг хүсэлт гүйцэтгэнэ — `ensureFreshToken` хүсэлтийн ӨМНӨ */
async function run(full: string, params: Record<string, string>, o: ArcgisReqOpts): Promise<ArcgisBody> {
  const target = full;
  await ensureFreshToken();
  if (o.slot === false) return attemptRequest(target, params, o, 0);
  await acquire();
  try {
    return await attemptRequest(target, params, o, 0);
  } finally {
    release();
  }
}

/**
 * ArcGIS REST POST — `url` руу ЯГ (`/query` залгахгүй) `f=json` + form биеэр.
 * Дурын endpoint (`/query` · `/applyEdits` · давхаргын мета `?f=json` · `sharing/rest/*`).
 */
export async function arcgisPost<T extends ArcgisBody = ArcgisBody>(
  url: string,
  params: Record<string, string>,
  opts: ArcgisReqOpts = {},
): Promise<T> {
  if (shareable(url, params, opts)) return (await shared(url, params, opts)) as T;
  return (await run(url, params, opts)) as T;
}

/**
 * НЭГТГЭЖ БОЛОХ хүсэлт мөн үү — `arcgisPost` 2026-10-04.
 */
const shareable = (url: string, params: Record<string, string>, o: ArcgisReqOpts): boolean =>
  !o.signal && o.slot !== false
  && (/\/query\/?$/i.test(url) || (Object.keys(params).length === 0 && /\/(FeatureServer|MapServer)(\/\d+)?\/?$/i.test(url)));

/**
 * ЯВАГДАЖ БУЙ ИЖИЛ ХҮСЭЛТИЙН НЭГТГЭЛ — `request` ба `arcgisPost`-ын ХУВААЛЦСАН цөм.
 * Дүрэм нь доорх `inflight`-тэй ИЖИЛ (кэш биш · эхний дуудагч биеэ, бусад нь ГҮН
 * ХУУЛБАР · алдаа хуваалцагдаж түлхүүр устна). Түлхүүрт горимын сонголтууд (`token` ·
 * `describe` · `timeoutMs`) орно — өөр горимын хариуг хуваалцахгүй.
 */
async function shared(full: string, params: Record<string, string>, o: ArcgisReqOpts): Promise<ArcgisBody> {
  const key = `${writeEpoch()}|${o.token ?? 'always'}|${o.describe ? 'd' : ''}|${o.timeoutMs ?? ''}|${reqKey(full, params)}`;
  const running = inflight.get(key);
  if (running) return structuredClone(await running);
  const p = run(full, params, o);
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * ЯВАГДАЖ БУЙ ИЖИЛ ХҮСЭЛТИЙН НЭГТГЭЛ (2026-09-07-ны гүйцэтгэлийн аудит).
 *
 * Хэмжсэн: 41 ачаалагчийг нэг удаа ажиллуулахад 436 хүсэлтийн 44 нь ЯГ ИЖИЛ
 * URL + параметртэй байв (жишээ: `loadInfra`-ийн давхаргууд хоёр id-гаар нэг
 * үйлчилгээ рүү, `loadClearance` ба `loadLandStatus` парселийн ижил
 * groupBy). Ачаалагч бүр өөрийн кэштэй ч тэдгээр кэш нь ХҮСЭЛТИЙН түвшинд
 * биш ҮР ДҮНГИЙН түвшинд байдаг тул нэг мөчид зэрэг явсан ижил асуулга
 * тусдаа сүлжээний аялал болдог — 6 слотын дараалалд шууд зай эзэлнэ.
 */
const inflight = new Map<string, Promise<ArcgisBody>>();

/** Тогтвортой түлхүүр — параметрийн ДАРААЛАЛ ялгаатай ч агуулга ижил бол нэг */
const reqKey = (url: string, params: Record<string, string>): string =>
  url + '|' + Object.keys(params).sort().map((k) => k + '=' + params[k]).join('&');

async function request(url: string, params: Record<string, string>, signal?: AbortSignal): Promise<Body> {
  if (signal) return run(`${url}/query`, params, { token: 'org', signal }) as Promise<Body>;
  return shared(`${url}/query`, params, { token: 'org' }) as Promise<Body>;
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
export async function queryStats(url: string, stats: Stat[], where = '1=1', aoi?: Aoi, signal?: AbortSignal): Promise<Row> {
  const body = await request(url, { where, outStatistics: JSON.stringify(stats), ...spatial(aoi) }, signal);
  return body.features?.[0]?.attributes ?? {};
}

/**
 * Талбараар бүлэглэсэн статистик — ТАЙРАГДСАН эсэхийг ч буцаана.
 */
export async function queryGroupEx(
  url: string,
  groupBy: string,
  stats: Stat[],
  where = '1=1',
  aoi?: Aoi,
  signal?: AbortSignal,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const body = await request(url, {
    where,
    groupByFieldsForStatistics: groupBy,
    outStatistics: JSON.stringify(stats),
    ...spatial(aoi),
  }, signal);
  const truncated = !!body.exceededTransferLimit;
  if (truncated) console.warn(`[selbe] queryGroup тайрагдав (exceededTransferLimit): ${url}`);
  return { rows: (body.features ?? []).map((f) => f.attributes), truncated };
}

/** Хуучин гарын үсэг — зөвхөн мөрүүд (дэлгэцийн дуудагчид) */
export async function queryGroup(
  url: string,
  groupBy: string,
  stats: Stat[],
  where = '1=1',
  aoi?: Aoi,
): Promise<Row[]> {
  return (await queryGroupEx(url, groupBy, stats, where, aoi)).rows;
}

/** Бичлэгүүдийг талбартай нь татах */
export async function queryFeatures(
  url: string,
  opts: {
    where?: string; outFields?: string[]; orderBy?: string; limit?: number; aoi?: Aoi;
    signal?: AbortSignal;
    /**
     * Нэвтэрсэн хэрэглэгчийн ArcGIS токен — НЭРГҮЙ уншилтыг хаасан давхаргад
     * (`allowAnonymousToQuery: false`). Ийм давхарга токенгүй асуухад алдаа
     * БИШ, ХООСОН хариу өгдөг тул «өгөгдөл алга» гэж чимээгүй ташаарна.
     */
    token?: string;
  } = {},
): Promise<Row[]> {
  const params: Record<string, string> = {
    where: opts.where ?? '1=1',
    outFields: (opts.outFields ?? ['*']).join(','),
    returnGeometry: 'false',
    ...spatial(opts.aoi),
    ...(opts.token ? { token: opts.token } : {}),
  };

  //
  let order = opts.orderBy;
  const collect = async (): Promise<{ rows: Row[]; oidField?: string; restart: boolean }> => {
    const rows: Row[] = [];
    let oidField: string | undefined;
    for (;;) {
      const page = { ...params };
      if (order) page.orderByFields = order;
      if (rows.length) page.resultOffset = String(rows.length);
      if (opts.limit) page.resultRecordCount = String(opts.limit - rows.length);
      const body = await request(url, page, opts.signal);
      oidField = body.objectIdFieldName ?? oidField;
      const feats = (body.features ?? []).map((f) => f.attributes);
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
 */
export async function queryExtent(
  url: string, wkid = 102100, where = '1=1',
  /** Нэвтрэлт шаардлагатай давхаргад (`LayerDef.auth`) — POST биеэр л явна */
  token?: string,
): Promise<ExtentBox | null> {
  const body = await request(url, {
    where,
    returnExtentOnly: 'true',
    outSR: String(wkid),
    ...(token ? { token } : {}),
  });
  const e = (body as { extent?: { xmin: number; ymin: number; xmax: number; ymax: number } }).extent;
  if (!e || !Number.isFinite(e.xmin)) return null;
  return { xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax, wkid };
}

/** SQL мөрийн утга — нэг хашилтыг хоёр болгож escape хийнэ.
 */
export const sqlStr = (v: string) => `N'${v.replace(/'/g, "''")}'`;

/**
 * ГАДНААС ИРСЭН `where`-ийн ЮНИКОД ЛИТЕРАЛД `N'…'` УГТВАР НЭМНЭ (2026-09-30).
 */
export function nPrefixUnicode(where: string): string {
  const unicode = (s: string) => [...s].some((c) => c.charCodeAt(0) > 0x7f);
  return where.replace(
    /(^|[^A-Za-z0-9_])([Nn]?)'((?:[^']|'')*)'/g,
    (all: string, pre: string, n: string, body: string) =>
      n || !unicode(body) ? all : `${pre}N'${body}'`,
  );
}

/** ArcGIS-ийн хоосон утга: null, "" эсвэл зөвхөн зай (" ") */
const isBlank = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '');

/**
 * «Хоосон» талбарын SQL нөхцөл — `null` ба тоологдсон бүх хоосон хувилбар.
 *
 * Оронд нь `groups`-ын цуглуулсан ЖИНХЭНЭ түүхий утгуудыг (`''`, `' '`,
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
   */
  raws: string[];
  /** Хоосон бүлэг эсэх */
  blank: boolean;
  /** Тоон хэмжигдэхүүнүүд (outStatistics-ийн outStatisticFieldName-ээр) — хэмжилтгүй бол 0 (нийлбэр/эрэмбэд) */
  values: Record<string, number>;
  stats: Record<string, number | null>;
  num?: boolean;
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
      stats: Object.fromEntries(numeric.map((k) => [k, null])),
    };
    if (r[field] != null) {
      const raw = String(r[field]);
      if (!g.raws.includes(raw)) g.raws.push(raw);
      if (typeof r[field] === 'number') g.num = true;
    }
    for (const k of numeric) {
      const v = r[k];
      if (v == null) continue;
      g.values[k] += Number(v);
      g.stats[k] = (g.stats[k] ?? 0) + Number(v);
    }
    merged.set(label, g);
  }

  return [...merged.values()].sort((a, b) => (b.values[numeric[0]] ?? 0) - (a.values[numeric[0]] ?? 0));
}

/** Тоон литерал (зөвхөн цифр · цэг · илтгэгч) — бусад бол null (SQL-д хашилтгүй бичихэд аюулгүй эсэх) */
const numLit = (v: string): string | null => (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v.trim()) ? v.trim() : null);

/**
 * Бүлгийг газрын зурагт шүүх SQL — тоологдсонтой яг ижил олонлог сонгоно.
 */
export const groupWhere = (field: string, g: Group): string => {
  if (g.num) {
    const lits = g.raws.map(numLit);
    if (lits.every((x): x is string => x != null)) {
      const inList = lits.length ? `${field} IN (${lits.join(', ')})` : '';
      if (!g.blank) return inList || '1=0';
      return inList ? `${field} IS NULL OR ${inList}` : `${field} IS NULL`;
    }
  }
  return g.blank ? blankWhere(field, g.raws) : `${field} IN (${g.raws.map(sqlStr).join(', ')})`;
};

import { t as tr } from '@/lib/i18nCore';
import { tokenParam, ensureFreshToken, isTokenError, describeArcgisError, refreshAfterTokenError, isPortalUrl } from '@/lib/authToken';
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
    /**
     * ⚠️ 2026-10-05: 498/499 ирээд токен ШИНЭЧЛЭГДЭЖ ЧАДААГҮЙ (нэвтрэлтийн хугацаа дууссан).
     * Шинэчлэгдсэн токеноор ч 499 хэвээр бол жинхэнэ «эрх алга» — тэр үед `false`.
     * `ui.friendlyError` үүгээр «дахин нэвтэрнэ үү» ба «админд хандана уу»-г ялгана.
     */
    readonly sessionExpired = false,
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
 * ⚠️ ЗЭРЭГ хүсэлтийн ХЯЗГААРЛАГЧ. Дашбоард нэг дор 40+ хүсэлт (каталогийн
 * тоо/хэмжээ, анализ, газрын зургийн давхаргууд) явуулах үед ArcGIS «Too many requests» гэж
 * татгалздаг. Зэрэг явах хүсэлтийг хязгаарлавал сервер даахаас гадна үлдсэн нь
 * дараалалд хүлээж, шатлан ордог — бүх карт ба давхарга ачаалагдана.
 */
/**
 * ⚠️ 2026-09-07: ТОГТМОЛ 6 → ДАСАН ЗОХИЦОХ 12↘6.
 *
 * Хэмжилт (60 хүсэлтийн ижил ачаалал, амьд үйлчилгээ): 6 слот 4,184 мс ·
 * 10 слот 2,578 мс · 14 слот 1,671 мс — «Too many requests» хариу ГУРВУУЛАНД
 * НЬ 0. Өөрөөр хэлбэл 6 нь хэтэрхий болгоомжтой байсан; «Саад — багцаар»-ийн
 * 139 хүсэлт зөвхөн дарааллын улмаас 11 секунд болдог байв.
 *
 * ⚠️ ГЭХДЭЭ 6-ийн шалтгаан ХҮЧИНТЭЙ ХЭВЭЭР: 2026-08-21-нд нүүр хуудасны
 * геометрийн ачаалалтай хольцоор ArcGIS үнэхээр татгалзаж байсан. Тиймээс
 * ХАТУУ өсгөхгүй — сервер НЭГ Л УДАА хурдны хязгаар мэдэгдмэгц энэ сешн
 * бүхэлдээ баталгаажсан 6 руу БУЦАЖ, тэндээ үлдэнэ («throttleDown»).
 * Татгалзсан хүсэлт нь урьдын адил exponential backoff-оор дахин явна тул
 * хэрэглэгч ялгааг мэдрэхгүй.
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
    // ⚠️ Сэрэхдээ active-ийг ДАХИН нэмэхгүй — release() слотоо шууд гардуулсан
    //    (active хэвээр). Эс бөгөөс буулгах↔нэмэх хоёрын завсарт өөр acquire
    //    шургалж MAX_CONCURRENT түр хэтэрч, «Too many requests» эргэн ирнэ.
    await new Promise<void>((r) => waiters.push(r));
    return;
  }
  active++;
}
function release() {
  /* ⚠️ Хязгаар БУУРСАН бол слотыг гардуулахгүй, БУЦААЖ авна — эс бөгөөс
     `throttleDown` дуудагдсан ч идэвхтэй тоо хуучин түвшиндээ түгжигдэнэ.
     Дараагийн release (active === limit болсон үед) хүлээгчийг сэрээнэ тул
     дараалал хэзээ ч гацахгүй. */
  if (active > limit) { active--; return; }
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

/**
 * БАЙГУУЛЛАГЫН ҮЙЛЧИЛГЭЭ мөн үү — токеныг ЗӨВХӨН тийш нь илгээнэ.
 *
 * ⚠️ 2026-09-21: урьд нь `url.includes('/HJzgwvlNIXssnQar/')` гэж org id ХАТУУ
 *    бичигдсэн байв — `services.ts`-ийн 2026-09-17-ны «код дотор үйлчилгээний
 *    хаяг ОГТ байхгүй» шийдвэртэй зөрчилдөж, org солиход токен явахаа больж
 *    бүх асуулга 499 авна. `services.HJ`-тэй ИЖИЛ env-ээс уншина.
 * ⚠️ `process.env.NEXT_PUBLIC_ARCGIS_HJ`-ийг ШУУД (статик нэрээр) — `services.ts`
 *    импортлохгүй: тэр модуль хувьсагч дутуу бол ачаалахдаа шиддэг бөгөөд энэ
 *    файлыг 40+ модуль импортлодог тул ачаалалтын гинжинд шинэ хатуу
 *    хамаарал нэмэхгүй. Хоосон бол токен явахгүй (урьдын адил).
 * ⚠️ Хоёр шалгуур: суурь хаягаар (`startsWith`) ЭСВЭЛ org-ийн сегментээр
 *    (`/HJzgw…/`) — services.arcgis.com-ын ижил org-ийн өөр хост (services1…)
 *    ч хамрагдана, хуучин зан төлөв хадгалагдана.
 * ⚠️ ORG СЕГМЕНТ ЗӨВХӨН `*.arcgis.com` ХОСТОД (2026-09-21, аудитын засвар). Env
 *    нь өөрийн серверийн `https://host/arcgis/rest/services` (org сегментгүй)
 *    бол урьд нь `ORG_SEG='arcgis'` болж, `/arcgis/` агуулсан ЯМАР Ч гадны
 *    хост руу (өөр байгууллагын ArcGIS Server) нэвтэрсэн хэрэглэгчийн токен
 *    явдаг байв. Одоо сегментийн шалгуур env-ийн хост ба зорилтот хост ХОЁУЛАА
 *    `*.arcgis.com` үед л; бусад хостод зөвхөн env-ийн бүтэн origin+path
 *    угтвар (`startsWith`) таарна.
 */
const ORG_BASE = (process.env.NEXT_PUBLIC_ARCGIS_HJ ?? '').trim().replace(/\/+$/, '');
const ARCGIS_COM_HOST = /^https?:\/\/[^/]*\.arcgis\.com(?::\d+)?\//i;
const ORG_SEG = ARCGIS_COM_HOST.test(`${ORG_BASE}/`)
  ? ORG_BASE.match(/^https?:\/\/[^/]+\/([^/]+)\//)?.[1] ?? ''
  : '';
const isOrgUrl = (url: string): boolean =>
  (!!ORG_BASE && url.startsWith(`${ORG_BASE}/`))
  || (!!ORG_SEG && ARCGIS_COM_HOST.test(url) && url.includes(`/${ORG_SEG}/`));

/**
 * ⚠️ 2026-10-01: `token: 'always'` дуудлага org/портал БИШ хост руу явлаа — токен
 *    залгаагүй. Зөвхөн dev-д, хост бүрд НЭГ удаа (консол дүүргэхгүй). Хаягийн
 *    зөвхөн origin+замыг бичнэ — токен URL-д хэзээ ч ордоггүй (POST бие).
 */
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
 * НЭГ ХҮСЭЛТИЙН ЗАМ — `arcgisPost`/`request`-ийн хуваалцсан цөм (⚠️ 2026-09-30).
 *
 * ⚠️ ЯАГААД: урьд нь ~20 файл `fetch`-ийг шууд дуудаж, энд байгаа хамгаалалтыг
 *    (30с timeout · зэрэг хүсэлтийн слот · 429/503 backoff · 200-аар ирдэг
 *    `{error}` · 498 токен шинэчлээд дахин) тойрдог байв; `authToken.arcgisPost`
 *    ч timeout/слотгүй байлаа. Одоо бүгд энэ нэг цөмөөр явна.
 *
 * Сонголтууд (`ArcgisReqOpts`):
 *   · `token: 'always'` (анхдагч) — нэвтэрсэн хэрэглэгчийн ОДООГИЙН токен ҮРГЭЛЖ
 *     явна, дуудагчийн `params.token`-ийг ДАРНА (дуудагч эрт уншсан токен хуучирсан
 *     байж болно — `authToken.arcgisPost`-ын 2026-09-29-ний шийдвэр).
 *     ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): «үргэлж» нь ЗӨВХӨН байгууллагын
 *     үйлчилгээ (`isOrgUrl`) эсвэл ПОРТАЛ (`authToken.isPortalUrl`) руу. Өөр хост руу
 *     (гадны ArcGIS Server, нийтийн үйлчилгээ) хэрэглэгчийн токен ЯВАХГҮЙ — dev
 *     орчинд нэг удаа анхааруулга бичнэ. Дуудагчийн өөрийн `params.token` хэвээр.
 *   · `token: 'org'` — зөвхөн байгууллагын URL-д (`isOrgUrl`), дуудагчийн `token`
 *     давамгайлна (`queryFeatures`/`queryExtent`-ийн хуучин зан).
 *   · `slot: false` — хязгаарлагчийн слот АВАХГҮЙ: дуудагч аль хэдийн `withSlot`
 *     дотор байвал давхар (⚠️ 2026-09-30: src-д `withSlot`-ийн гадна хэрэглээ үлдээгүй — `agsFetch` ч слотоо өөрөө авна)
 *     авбал слот дуусахад бие биенээ хүлээж ГАЦНА.
 *   · `describe: true` — алдааны мессежид унасан замыг залгана (`describeArcgisError`).
 *   · `timeoutMs` — зөвхөн шалгуурт (анхдагч `TIMEOUT_MS`).
 *
 * ⚠️ 498/499 (токен хүчингүй) → `ensureFreshToken(true)` → НЭГ удаа дахин. Дуудагч
 *    өөрөө `token` өгсөн (`'org'` горим) бол дахин оролдохгүй — тэр токен хэвээр
 *    явах тул утгагүй.
 *    ⚠️ 2026-10-01: шинэчлэлт `authToken.refreshAfterTokenError(sent)`-ээр — олон
 *    хүсэлт зэрэг 498 авахад НЭГ л шинэчлэлт; хүсэлт явснаас хойш токен аль хэдийн
 *    солигдсон бол шинэчлэхгүй, шинэ токеноор шууд дахин илгээнэ.
 * ⚠️ Timeout нь `AbortSignal.timeout` биш, гараар удирдсан `AbortController`:
 *    дуудагчийн `signal` (хэрэглэгч цуцлах)-тай нэгтгэхэд `AbortSignal.any`
 *    бүх хөтөчид байхгүй. Шалтгаан нь `DOMException('TimeoutError')` хэвээр тул
 *    доорх ялгалт өөрчлөгдөөгүй.
 */
export type ArcgisReqOpts = {
  token?: 'always' | 'org';
  signal?: AbortSignal;
  slot?: boolean;
  describe?: boolean;
  timeoutMs?: number;
};

const backoff = (attempt: number) => sleep(400 * 2 ** attempt + Math.random() * 200);

/**
 * ⚠️ 2026-10-05: УНШИЛТЫН сүлжээний/5xx дахин оролдлого. Урьд нь сүлжээний алдаанд НЭГ л
 *    удаа (300–500 мс) дахин оролддог, HTTP 500/502/504-ийг огт давтдаггүй байсан тул
 *    барилгын талбайн тогтворгүй сүлжээнд харагдац бүхэлдээ алдаа болдог байв.
 * ⚠️ ЗӨВХӨН баталгаатай УНШИЛТ (`…/query` · параметргүй давхаргын мета) — бичих endpoint,
 *    `sharing/rest/*` ХЭЗЭЭ Ч нэмж давтагдахгүй (үр дүн тодорхойгүй → давхар бичилт).
 *    Бичилт биш бусад хүсэлтийн хуучин НЭГ удаагийн сүлжээний давталт хэвээр.
 */
const NET_RETRIES = 3;
const HTTP5_RETRIES = 2;
const netBackoff = (n: number) => sleep(350 * 2 ** n + Math.random() * 200);
const isReadReq = (url: string, params: Record<string, string>): boolean =>
  /\/query\/?$/i.test(url)
  || (Object.keys(params).length === 0 && /\/(FeatureServer|MapServer)(\/\d+)?\/?$/i.test(url));

async function attemptRequest(
  full: string,
  params: Record<string, string>,
  o: ArcgisReqOpts,
  attempt: number,
  /** Сүлжээ/5xx-ийн дахин оролдлогын тоо (⚠️ 2026-10-05: boolean → тоолуур) */
  netTries = 0,
  refreshed = false,
): Promise<ArcgisBody> {
  const timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
  const always = o.token !== 'org';
  /* ⚠️ Нэвтэрсэн хэрэглэгчийн токен — org-only үйлчилгээнд (2026-09-17). `'org'`
     горимд дуудагч өөрөө `token` өгсөн бол түүнийг эрхэмлэнэ.
     ⚠️ 2026-10-01: `'always'` ч ЗӨВХӨН org/портал хост руу (дээрх `ArcgisReqOpts`-ийн ⚠️). */
  const hostOk = always ? isOrgUrl(full) || isPortalUrl(full) : isOrgUrl(full);
  const userTok = hostOk ? tokenParam() : {};
  if (always && !hostOk) warnForeignHost(full);
  const body = always
    ? { f: 'json', ...params, ...userTok }
    : { f: 'json', ...userTok, ...params };
  /** Энэ хүсэлтэд ЯВСАН хэрэглэгчийн токен — 498-ийн дараа «аль хэдийн солигдсон уу» */
  const sentTok = userTok.token ?? null;
  const ac = new AbortController();
  const onAbort = () => ac.abort(o.signal?.reason);
  if (o.signal?.aborted) onAbort();
  else o.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(new DOMException(`timeout ${timeoutMs}ms`, 'TimeoutError')), timeoutMs);
  /* ⚠️ 2026-09-30: timeout-ыг ЦУЦЛАЛТЫН ШАЛТГААНААР ялгана — зарим хөтөч цуцлагдсан
     хүсэлтийг (ялангуяа биеийн уншилтыг) `reason`-оос үл хамааран `AbortError`-оор
     няцаадаг тул зөвхөн шидэгдсэн алдааны нэрээр шалгавал timeout нь түүхий
     `AbortError` болж UI-д хүрдэг. Хэрэглэгч өөрөө цуцалсан бол timeout БИШ. */
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
    /* ⚠️ 2026-09-30: БИЕИЙГ ч ИЖИЛ timeout/цуцлалтын ДОР уншина. Урьд нь цаг хэмжигч
       ТОЛГОЙ ирмэгц (`fetch` resolve) цэвэрлэгддэг байсан тул сервер толгойгоо
       илгээгээд биеэ гацаавал `res.json()` ҮҮРД хүлээж, энэ хүсэлт зэрэг хүсэлтийн
       СЛОТОО хэзээ ч суллахгүй байв — дээрх `TIMEOUT_MS`-ийн ⚠️-д бичсэн «порталын
       бүх асуулга дараалалд царцах» эвдрэлийн яг өөр зам. Хэрэглэгчийн цуцлалт ч
       бие уншиж байхад хүрдэггүй байв. JSON биш хариуны зан (доор) ӨӨРЧЛӨГДӨӨГҮЙ:
       цуцлалтаас бусад уншилтын алдаа дахин оролдлогогүй «JSON биш» хэвээр. */
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
    /* ⚠️ 2026-09-30 (төслийн аудит): БИЧИХ endpoint-ийг сүлжээний алдаанд ДАХИН ИЛГЭЭХГҮЙ.
       Сервер хүсэлтийг хүлээн авч БИЧСЭНИЙ дараа хариу замдаа тасарвал (TypeError) давтан
       илгээлт нь `addFeatures`/`applyEdits`-ийн мөрийг ХОЁР удаа нэмнэ (давхар илгээлт,
       давхар хяналтын тойрог). Уншилт (query · statistics) аюулгүй тул хэвээр. 429/503 ба
       498 нь сервер хүсэлтийг ГҮЙЦЭТГЭЭГҮЙ гэсэн хариу тул тэдгээрийн давталт хэвээр. */
    const isWrite = /\/(applyEdits|addFeatures|updateFeatures|deleteFeatures|addAttachment|updateAttachment|deleteAttachments|calculate|append)\/?$/i.test(full);
    /* ⚠️ 2026-10-05: уншилтад `NET_RETRIES` хүртэл backoff-той; бусад (бичилт биш) нь хуучнаараа 1 */
    const netMax = isReadReq(full, params) ? NET_RETRIES : 1;
    if (e instanceof TypeError && netTries < netMax && !isWrite && !o.signal?.aborted && !timedOut()) {
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
  if (!res.ok) {
    if (res.status === 429 || res.status === 503) throttleDown();
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
      await backoff(attempt);
      return attemptRequest(full, params, o, attempt + 1, netTries, refreshed);
    }
    /* ⚠️ 2026-10-05: 500/502/504 — ЗӨВХӨН уншилтад дахин (`isReadReq`-ийн ⚠️). Бичилтийн
       5xx нь сервер аль хэдийн бичсэн байж болох тул ХЭЗЭЭ Ч давтахгүй. */
    if ((res.status === 500 || res.status === 502 || res.status === 504)
      && netTries < HTTP5_RETRIES && isReadReq(full, params) && !o.signal?.aborted) {
      await netBackoff(netTries);
      return attemptRequest(full, params, o, attempt, netTries + 1, refreshed);
    }
    throw new ArcGISError(`HTTP ${res.status}`, full);
  }
  if (notJson || json == null) {
    /* ⚠️ Proxy/CDN-ийн HTML хариу «SyntaxError: Unexpected token <» болж улаан
       баннерт гардаг байв (`tableWrite`/`ags`-ийн 2026-09-21-ний дүрэм). */
    throw new ArcGISError(tr('Үйлчилгээ JSON биш хариу буцаав — сүлжээгээ шалгана уу'), full);
  }
  // ArcGIS алдааг HTTP 200-тай буцаадаг — заавал шалгана
  if (json.error) {
    const { code, message, details } = json.error;
    if (isRateLimit(message ?? '')) throttleDown();
    if (isRateLimit(message ?? '') && attempt < RETRIES) {
      await backoff(attempt);
      return attemptRequest(full, params, o, attempt + 1, netTries, refreshed);
    }
    /* ⚠️ 2026-09-29 (хэрэглэгч: «илгээхэд Invalid token»): PKCE токен богино хугацаатай —
       хүчингүй болсон бол шинэчлээд НЭГ удаа дахин (`ensureFreshToken`-ийн ⚠️). */
    /* ⚠️ 2026-10-01: токен ЗӨВХӨН org/портал хостод явдаг (`hostOk`) — бусад хостод
       шинэчилээд ч токен явахгүй тул утгагүй. Шинэчлэлтийн шуурганаас сэргийлж
       `refreshAfterTokenError` (хуваалцсан Promise · «аль хэдийн солигдсон» шалгалт). */
    /* ⚠️ 2026-10-05: шинэчлэлт БҮТЭЭГҮЙ (илгээсэн токен байсан ч солигдсонгүй) → «нэвтрэлтийн
       хугацаа дууссан» гэж ТЭМДЭГЛЭНЭ. Шинэ токеноор ч 499 (`refreshed`) бол жинхэнэ «эрх алга». */
    let sessionExpired = false;
    if (!refreshed && hostOk && isTokenError(code, message) && (always || !('token' in params))) {
      if (await refreshAfterTokenError(sentTok)) {
        return attemptRequest(full, params, o, attempt, netTries, true);
      }
      sessionExpired = sentTok != null;
    }
    const msg = message || details?.[0] || tr('ArcGIS алдаа');
    throw new ArcGISError(o.describe ? describeArcgisError(full, code, msg) : msg, full, code, details, sessionExpired);
  }
  return json;
}

/** Слот авч (эсвэл авалгүй) нэг хүсэлт гүйцэтгэнэ — `ensureFreshToken` хүсэлтийн ӨМНӨ */
async function run(full: string, params: Record<string, string>, o: ArcgisReqOpts): Promise<ArcgisBody> {
  await ensureFreshToken();
  if (o.slot === false) return attemptRequest(full, params, o, 0);
  await acquire();
  try {
    return await attemptRequest(full, params, o, 0);
  } finally {
    release();
  }
}

/**
 * ArcGIS REST POST — `url` руу ЯГ (`/query` залгахгүй) `f=json` + form биеэр.
 * Дурын endpoint (`/query` · `/applyEdits` · давхаргын мета `?f=json` · `sharing/rest/*`).
 * ⚠️ Токен ЗӨВХӨН биеэр — URL-д, логд, `ArcGISError.url`-д хэзээ ч орохгүй (CWE-598).
 * ⚠️ Дедуп (`inflight`) ҮГҮЙ — бичих хүсэлт (`applyEdits`) хоёр удаа илгээгдвэл хоёр
 *    удаа биелэх ЁСТОЙ; давхардал арилгах нь зөвхөн `request()`-ийн асуулгад.
 */
export async function arcgisPost<T extends ArcgisBody = ArcgisBody>(
  url: string,
  params: Record<string, string>,
  opts: ArcgisReqOpts = {},
): Promise<T> {
  /* ⚠️ 2026-10-04 (гүйцэтгэлийн аудит): УНШИХ асуулга (`…/query`) ба давхаргын мета (`params`
     хоосон = `?f=json`) нь `request()`-ийн ижил ЯВАГДАЖ БУЙ хүсэлтийн нэгтгэлээр явна. Хэмжилт
     (CEO самбар, хүйтэн): 346 хүсэлтийн 46 нь ЯГ ИЖИЛ — `bagtsSheet.latestWhere`-ийн max/count,
     `loadSchema`/`obyemResFields`-ийн мета нь `agsFetch` → энд ирдэг тул урьд нэгтгэгддэггүй байв.
     Бичих endpoint (`applyEdits` …) ХЭЗЭЭ Ч нэгтгэгдэхгүй (доорх `shareable`). */
  if (shareable(url, params, opts)) return (await shared(url, params, opts)) as T;
  return (await run(url, params, opts)) as T;
}

/**
 * НЭГТГЭЖ БОЛОХ хүсэлт мөн үү — `arcgisPost`-ын ⚠️ 2026-10-04.
 * ⚠️ `signal`-тай бол ҮГҮЙ: эхний дуудагч цуцлахад бусад нь (цуцлаагүй) `AbortError` авна.
 * ⚠️ `slot: false` бол ҮГҮЙ: дуудагч слот барьж байх үед слот ХҮЛЭЭЖ буй өөр хүсэлтэд
 *    наалдвал бүх слот ийм дуудагчдад эзлэгдэхэд ГАЦНА (`ArcgisReqOpts.slot`-ийн ⚠️).
 * ⚠️ Зөвхөн `/query` (уншилт) эсвэл параметргүй мета — `/applyEdits`, `addFeatures`,
 *    `sharing/rest/*` (токен үүсгэх г.м.) нэгтгэгдэхгүй.
 */
const shareable = (url: string, params: Record<string, string>, o: ArcgisReqOpts): boolean =>
  !o.signal && o.slot !== false
  && (/\/query\/?$/i.test(url) || (Object.keys(params).length === 0 && /\/(FeatureServer|MapServer)(\/\d+)?\/?$/i.test(url)));

/**
 * ЯВАГДАЖ БУЙ ИЖИЛ ХҮСЭЛТИЙН НЭГТГЭЛ — `request()` ба `arcgisPost`-ын ХУВААЛЦСАН цөм.
 * Дүрэм нь доорх `inflight`-ийн ⚠️-тэй ИЖИЛ (кэш биш · эхний дуудагч биеэ, бусад нь ГҮН
 * ХУУЛБАР · алдаа хуваалцагдаж түлхүүр устна). Түлхүүрт горимын сонголтууд (`token` ·
 * `describe` · `timeoutMs`) орно — өөр горимын хариуг хуваалцахгүй.
 */
async function shared(full: string, params: Record<string, string>, o: ArcgisReqOpts): Promise<ArcgisBody> {
  const key = `${o.token ?? 'always'}|${o.describe ? 'd' : ''}|${o.timeoutMs ?? ''}|${reqKey(full, params)}`;
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
 *
 * ⚠️ ЗӨВХӨН ЗЭРЭГ явж буй хүсэлтийг нэгтгэнэ. Хариу ирмэгц түлхүүр
 *    жагсаалтаас ГАРНА — өөрөөр хэлбэл энэ нь КЭШ БИШ, тиймээс хуучирсан
 *    өгөгдөл хэзээ ч буцаахгүй бөгөөд `invalidate()`-ийн логикт огт
 *    хамаарахгүй (дуудагчийн кэшүүд урьдын адил ажиллана).
 *
 * ⚠️ ЭХНИЙ дуудагч биетээ ЯГ өмнөх шигээ авна; хоёр дахь ба цаашхи хүлээгчид
 *    ГҮН ХУУЛБАР авна. Нэг объектыг хуваалцвал нэг дуудагчийн засвар нөгөөд
 *    нь чимээгүй нэвтэрч болно — сүлжээний аялалаас хамаагүй хямд хуулбар
 *    нь тэр эрсдэлийг бүрэн хаана.
 *
 * ⚠️ Алдаа мөн хуваалцагдана: гарсан алдаа бүх хүлээгчид очих ба түлхүүр
 *    устдаг тул дараагийн оролдлого шинэ хүсэлт явуулна.
 */
const inflight = new Map<string, Promise<ArcgisBody>>();

/** Тогтвортой түлхүүр — параметрийн ДАРААЛАЛ ялгаатай ч агуулга ижил бол нэг */
const reqKey = (url: string, params: Record<string, string>): string =>
  url + '|' + Object.keys(params).sort().map((k) => k + '=' + params[k]).join('&');

/* ⚠️ 2026-10-04: нэгтгэл нь `shared()` (`arcgisPost`-той НЭГ `inflight`, нэг түлхүүрийн дүрэм) —
   хоёр дахь ба цаашхи хүлээгч сүлжээ огт хөндөхгүй, гүн хуулбар авна. */
async function request(url: string, params: Record<string, string>): Promise<Body> {
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

/**
 * Талбараар бүлэглэсэн статистик — ТАЙРАГДСАН эсэхийг ч буцаана.
 *
 * ⚠️ 2026-09-03-ны аудит: тайралт зөвхөн `console.warn`-д бичигддэг байсан
 * тул AI туслах дутуу бүлгүүдийг БҮРЭН гэж үзэж нийлбэр гаргадаг байв.
 * Дэлгэцийн дуудагчид (`ExecKpi`, `LayerCatalog`, `land`) хуучин
 * `queryGroup`-ыг хэвээр хэрэглэнэ — тэдэнд бүлгийн тоо цөөн.
 */
export async function queryGroupEx(
  url: string,
  groupBy: string,
  stats: Stat[],
  where = '1=1',
  aoi?: Aoi,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const body = await request(url, {
    where,
    groupByFieldsForStatistics: groupBy,
    outStatistics: JSON.stringify(stats),
    ...spatial(aoi),
  });
  // ⚠️ Бүлгийн тоо maxRecordCount-аас хэтэрвэл сервер үр дүнг ЧИМЭЭГҮЙ тайрдаг —
  //    ховор ч тохиолдвол ядаж лог үлдээж мэдэгдэнэ.
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
    /**
     * Нэвтэрсэн хэрэглэгчийн ArcGIS токен — НЭРГҮЙ уншилтыг хаасан давхаргад
     * (`allowAnonymousToQuery: false`). Ийм давхарга токенгүй асуухад алдаа
     * БИШ, ХООСОН хариу өгдөг тул «өгөгдөл алга» гэж чимээгүй ташаарна.
     *
     * ⚠️ Токен нь POST-ын БИЕЭР л явна (`attemptRequest`) — URL-д, алдааны
     * мессежид (`ArcGISError`) ОРОХГҮЙ. Давхардал арилгах түлхүүрт (`reqKey`)
     * орох нь зөв: өөр хэрэглэгчийн хариуг хуваалцахгүй.
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
 *  ⚠️ `N'…'` угтвар (2026-09-17): кирилл утга угтваргүй бол ArcGIS 0 мөр буцаадаг
 *     (`Gazar.tsx`-д баримтжуулсан). Латин утгад ч аюулгүй. */
export const sqlStr = (v: string) => `N'${v.replace(/'/g, "''")}'`;

/**
 * ГАДНААС ИРСЭН `where`-ийн ЮНИКОД ЛИТЕРАЛД `N'…'` УГТВАР НЭМНЭ (2026-09-30).
 *
 * ⚠️ ЯАГААД: дээрх `sqlStr`-ийн дүрэм (угтваргүй кирилл харьцуулалт зарим үйлчилгээнд
 *    АЛДААГҮЙГЭЭР 0 мөр) — порталын код литералаа `sqlStr`-аар угсардаг ч AI туслахын
 *    `query_feature`-ийн `where`-ийг ЗАГВАР өөрөө бичдэг бөгөөд зааврын жишээ нь
 *    угтваргүй (`ZONE_ID = 'Багц-1'`) байсан; `zone_overview` ч `zoneWhere`-ийн
 *    угтваргүй литералаар явдаг. Тэр үйлчилгээнүүд дээр агент «0 барилга» гэх мэт
 *    ХУДАЛ тоог итгэлтэйгээр хэлэх эрсдэлтэй байв.
 * ⚠️ Зөвхөн ASCII БУС тэмдэгттэй, угтваргүй литералд `N` нэмнэ: латин/огнооны литерал
 *    (`timestamp '2026-09-01 00:00:00'`) ба аль хэдийн `N'…'`/`n'…'` ХЭВЭЭР. `''` (дотоод
 *    хашилт) литералын нэг хэсэг. Угтвар нь латин утгад ч аюулгүй.
 * ⚠️ Угтварын өмнөх тэмдэгт таних тэмдэг (үсэг/тоо/_) БИШ байх ёстой — `N` нь баганын
 *    нэрийн төгсгөл байж болохгүй.
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

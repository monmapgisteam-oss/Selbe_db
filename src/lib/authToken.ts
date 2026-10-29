/**
 * НЭВТЭРСЭН ХЭРЭГЛЭГЧИЙН ArcGIS ТОКЕН — бүх REST хүсэлтэд.
 *
 * ⚠️ ЯАГААД (2026-09-17, хэрэглэгчийн шийдвэр: «нэвтрээгүй хүн системийг
 *    огт ашиглахгүй»): үйлчилгээнүүдийг Organization-only болгоход JS API-ийн
 *    давхаргууд (FeatureLayer) IdentityManager-ээс токеноо өөрөө авдаг ч
 *    шууд `fetch`-ээр явдаг 28 файл (`query.ts` · `ags.ts` · `tableWrite.ts` ·
 *    `hyanalt*.ts` · анализ …) токенгүй тул хоосон хариу/алдаа авна.
 *    Энэ модуль НЭГ эх сурвалж: `AuthGate` нэвтрэлт бүтмэгц IdentityManager-ээ
 *    бүртгэнэ, дараа нь `tokenParam()` синхрон уншина.
 *
 * ⚠️ Токен POST-ын БИЕЭР явна (`tokenParam`, `query.arcgisPost`).
 *    ⚠️ 2026-09-30: URL query string-д токен залгах нь ЗӨВХӨН POST хийх боломжгүй
 *    газарт зөвшөөрөгдөж байсан (`tokenQs` — 2026-10-11-нд дуудагчгүй тул устгагдав:
 *    хавсралт бүгд blob URL-аар). Бүх `fetch` хүсэлт `query.arcgisPost`-оор явна: query string
 *    нь серверийн/CDN-ийн access log-д хадгалагддаг (CWE-598) бөгөөд хөтчийн
 *    HTTP кэшийн түлхүүрт ордог. Логд, алдааны мессежид URL бичихдээ токеныг
 *    оруулахгүй байхыг анхаар.
 *
 * ⚠️ Нэвтрэлт унтраалттай (`AUTH.appId` хоосон) эсвэл Node (тест/tools)
 *    орчинд хоосон буцаана — зан төлөв өөрчлөгдөхгүй.
 * ⚠️ 2026-10-22 (аудит): ҮЛ ХАМААРАХ НЭГ — Telegram бот (Node) `registerIdentity`-д СЕРВЕРИЙН уншилтын итгэмжлэлээ
 *    (`tools/telegram-arcgis.mjs`, IdentityManager-ийн `findCredential` → `{ token, expires, refreshToken }` хэлбэр)
 *    бүртгэнэ: урьд нь энд үргэлж `null` тул ботын бүх эх сурвалж «Token Required» авдаг байв. Доорх шинэчлэлтийн
 *    механизм (`ensureFreshToken` · `refreshAfterTokenError`) түүнд ч ИЖИЛ үйлчилнэ — энэ файлын код өөрчлөгдөөгүй.
 */

import { arcgisPost as queryPost } from '@/lib/query';
import { clearMetaCache } from '@/lib/metaCache';
import { AUTH } from '@/lib/services/env';

type Esri = {
  findCredential: (url: string) => { token?: string } | null | undefined;
  /** Зөвхөн хөтчийн IdentityManager-т (`primeServerCredential`); Telegram ботын объектод байхгүй */
  getCredential?(url: string, options?: Record<string, unknown>): Promise<unknown>;
};

let esri: Esri | null = null;
let sharing = '';

/** `AuthGate` нэвтрэлт бүтмэгц дуудна. */
export function registerIdentity(mgr: Esri, sharingUrl: string): void {
  esri = mgr;
  sharing = sharingUrl;
  lastForced = null; // шинэ сешн — өмнөх шинэчлэлтийн тэмдэглэл хамаарахгүй
  /* ⚠️ 2026-10-05: шинэ сешн — «сешн дууссан» төлөв ба гарах тэмдэг цэвэр эхэлнэ */
  seenToken = false;
  ending = false;
  lastFail = null;
  quietUntil = 0;
  setDead(false);
  /* ⚠️ 2026-10-22: шинэ сешн — өмнөх хэрэглэгчийн давхаргын мета (эрхээс хамаарах capabilities) хэрэглэгдэхгүй */
  clearMetaCache();
}

/**
 * ФЕДЕРАЦИЙН СЕРВЕРИЙН ИТГЭМЖЛЭЛИЙГ УРЬДЧИЛЖ АВНА — `AuthGate` порталд нэвтэрмэгц, Portal/газрын зураг үүсэхээс ӨМНӨ.
 * `true` = итгэмжлэл бэлэн. ХЭЗЭЭ Ч шидэхгүй, `timeoutMs`-ээс удахгүй — нэвтрэлтийг саатуулахгүй.
 *
 * ⚠️ 2026-10-22 (гүйцэтгэл): урьд серверийн итгэмжлэл зөвхөн ЭХНИЙ 499-ийн ДАРАА үүсдэг байв — хуудас бүрийн ~185 мета
 *    хүсэлт эхлээд токенгүй явж «Token Required» аваад дахин илгээгддэг (CDP: эхнийх t≈3.1 с токенгүй, хоёр дахь нь
 *    t≈3.4 с токентой). `getCredential(server, { prompt: false })` нь федерацийн серверт порталын итгэмжлэлээс
 *    (`rest/info` → `owningSystemUrl` → порталын `generateToken`) ЦОНХГҮЙ үүсгэдэг албан ёсны зам. Үйлчилгээ бүрт
 *    бүртгэхийг хүсэлт тус бүрийн өмнө `entInterceptor` хийнэ (⚠️ «ЭХНИЙ ХҮСЭЛТ ТОКЕНТОЙ») — тэнд сүлжээгүй.
 * ⚠️ ШИНЭЧЛЭЛТ: ингэж үүссэн серверийн итгэмжлэл нь `ServerInfo.owningSystemUrl`-аар порталын итгэмжлэлтэй ХОЛБООТОЙ —
 *    порталын токен шинэчлэгдэхэд (JS API-ийн цаг хэмжигч эсвэл `ensureFreshToken`/`retrySession` →
 *    `Credential.refreshToken`) JS API `refreshServerTokens()`-оор серверийн токеныг ӨӨРӨӨ дахин үүсгэдэг; дахин
 *    бүртгэх шаардлагагүй. Хоорондох агшинд хуучирсан бол давхаргын хүсэлт 498 → JS API-ийн өөрийн дахин оролдлого.
 *    Тиймээс ПОРТАЛЫН токеныг `registerToken`-оор сервер рүү ГАРААР бүртгэхгүй — тэр нь холбоосгүй, шинэчлэгдэхгүй.
 */
export async function primeServerCredential(serverUrl: string, timeoutMs = 4_000): Promise<boolean> {
  const mgr = esri;
  if (!mgr || !serverUrl || typeof mgr.getCredential !== 'function') return false;
  try { if (mgr.findCredential(serverUrl)) return true; } catch { /* доорх оролдлого */ }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      mgr.getCredential(serverUrl, { prompt: false }).then(() => true, () => false),
      new Promise<boolean>((res) => { timer = setTimeout(() => res(false), timeoutMs); }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * DEV ТОКЕН — нэвтрэлт УНТРААЛТТАЙ (`NEXT_PUBLIC_AUTH_OFF=1`) ЛОКАЛ dev серверт л (2026-10-29, хэрэглэгч: «нэвтрэлт
 * унтраалттай үед зөвхөн локал dev сервер дээр хөтөч энэ токеноор өгөгдөл татдаг болгох»).
 * ⚠️ Эх нь `.env.development.local`-ын `ARCGIS_ADMIN_TOKEN` → `next.config.mjs` ЗӨВХӨН `next dev` + AUTH_OFF үед
 *    `NEXT_DEV_ARCGIS_TOKEN` болгон багцад оруулна; `next build` (production)-д ҮРГЭЛЖ хоосон (`tools/devToken.check.mjs`).
 * ⚠️ ГУРВАН ХААЛТ ЗЭРЭГ: NODE_ENV=development · `AUTH.appId` хоосон (нэвтрэлт унтраалттай) · хост localhost/127.0.0.1/[::1].
 *    Dev серверийг LAN IP/домэйнээр нээвэл ч токен явахгүй. Нэвтрэлт асаалттай үед ХЭЗЭЭ Ч хэрэглэгдэхгүй.
 * ⚠️ Токен POST-ын биеэр л явна (`tokenParam`) — URL-д орохгүй (`tools/tokenInUrl.check.mjs`).
 */
export function devTokenFor(o: { nodeEnv: string | undefined; appId: string; hostname: string | null; token: string | undefined }): string | null {
  if (o.nodeEnv !== 'development' || o.appId) return null;
  if (!o.hostname || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(o.hostname)) return null;
  const t = (o.token ?? '').trim();
  return t || null;
}
export function devToken(): string | null {
  return devTokenFor({
    nodeEnv: process.env.NODE_ENV,
    appId: AUTH.appId,
    /* ⚠️ Тестийн `window` стубт `location` байхгүй байж болно (`aclE2E.ui.check`) — хостгүй = токенгүй */
    hostname: typeof window !== 'undefined' && window.location ? window.location.hostname ?? null : null,
    token: process.env.NEXT_DEV_ARCGIS_TOKEN,
  });
}

/**
 * Dev токеныг JS API-ийн IdentityManager-т бүртгэнэ — газрын зургийн давхарга (FeatureLayer) ч түүгээр уншина.
 * REST зам (`query.ts` → `tokenParam`) үүнээс хамаарахгүй. `AuthGate` нэвтрэлт унтраалттай салаанд дуудна.
 * @param server Enterprise серверийн үндэс (`entInterceptor.ENT_SERVER`)
 */
export async function registerDevToken(server: string): Promise<boolean> {
  const t = devToken();
  if (!t || !server) return false;
  try {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    /* ⚠️ Хугацаа нь токеныхоос тусдаа (мэдэгдэхгүй) — 2 цаг; дуусвал давхарга 498 авна, dev серверээ дахин асаана */
    esriId.registerToken({ server, token: t, expires: Date.now() + 2 * 3_600_000 });
    return true;
  } catch {
    return false; /* JS API ачаалагдаагүй (Node/тест) */
  }
}

export function authToken(): string | null {
  /* ⚠️ 2026-10-29: нэвтрэлт унтраалттай локал dev — dev токен (дээрх `devToken`-ийн хаалтууд) */
  if (!esri || !sharing) return devToken();
  try {
    const t = esri.findCredential(sharing)?.token ?? null;
    /* ⚠️ 2026-10-05: энэ сешнд токен НЭГ удаа харагдсан — «итгэмжлэл алга болсон»-ыг
       «хэзээ ч нэвтрээгүй»-гээс ялгана (`markDead`). */
    if (t) seenToken = true;
    return t;
  } catch {
    return null;
  }
}

/* ══════════════════ СЕШН ДУУССАН (2026-10-05) ══════════════════ */
/**
 * ⚠️ 2026-10-05 (аудит): ТОКЕНЫ ШИНЭЧЛЭЛТ ЭЦЭСЛЭН УНАСНЫГ ИЛ БОЛГОНО.
 *    Урьд нь `ensureFreshToken` шинэчлэлтийн алдааг чимээгүй залгидаг, `AuthGate`-ийн
 *    5 минутын шалгалт «токен үхсэн» ба «сүлжээ тасарсан» хоёрыг ялгадаггүй байв:
 *    refresh token-ы хугацаа дууссан (эсвэл админ сешнийг хүчингүй болгосон) хэрэглэгч
 *    бүх хүсэлт дээр «Invalid token» аваад, гарц нь зөвхөн F5 — хадгалаагүй ажил алга.
 *    Одоо ЭЦЭСЛЭСЭН уналтыг (`classifyRefreshError` → `dead`) тэмдэглэж, `AuthGate`
 *    Portal-ыг УСТГАЛГҮЙ дээр нь «дахин нэвтрэх» цонх гаргана.
 * ⚠️ СҮЛЖЭЭНИЙ тасалдлыг (offline · fetch унах · timeout · 5xx/429) ХЭЗЭЭ Ч «дууссан»
 *    гэж үзэхгүй — тэр үед хүсэлт өөрөө алдаагаа хэлнэ, сүлжээ сэргэхэд үргэлжилнэ.
 * ⚠️ Энэ нь эрхийг НЭЭДЭГГҮЙ: токен үхсэн үед сервер бүх хүсэлтийг аль хэдийн
 *    татгалздаг — энд зөвхөн шалтгааныг хэрэглэгчид хэлнэ (fail-closed хэвээр).
 */
let seenToken = false;
/** Хэрэглэгч ӨӨРӨӨ гарч/дахин нэвтэрч байна — итгэмжлэл устах нь «дууссан» БИШ */
let ending = false;
let dead = false;
export type RefreshFail = 'network' | 'dead' | 'unknown';
/** Сүүлийн шинэчлэлтийн уналтын ангилал (`null` = амжилттай / оролдоогүй) */
let lastFail: RefreshFail | null = null;
const deadSubs = new Set<() => void>();

function setDead(v: boolean): void {
  if (dead === v) return;
  dead = v;
  for (const fn of [...deadSubs]) { try { fn(); } catch { /* захиалагчийн алдаа бусдыг зогсоохгүй */ } }
}
/**
 * ⚠️ 2026-10-09 (аудит №2): «Түр хаах»-ын дараах ЧИМЭЭГҮЙ ЦОНХ (мс-ийн цагийн тэмдэг).
 *    Урьд нь хаасны дараа ард явдаг шалгалтууд (`AuthGate`-ийн эрхийн шалгалт →
 *    `ensureFreshToken`, Portal-ын тэмдгийн poll, IoT poll → `query.ts` →
 *    `refreshAfterTokenError`) 15 с – 3 мин дотор `markDead` дуудаж цонхыг БУЦААЖ гаргадаг
 *    тул хэрэглэгч ажлаа хуулж амждаггүй байв. Одоо хаасан агшнаас `DISMISS_QUIET_MS` хүртэл
 *    `markDead` цонх ГАРГАХГҮЙ. Хэрэглэгчийн өөрийн хүсэлт (хадгалах г.м.) энэ хугацаанд ч
 *    алдаагаа ИЛ хэлнэ — `query.ts` `lastRefreshFail() === 'dead'`-ээр «нэвтрэлт дууссан»
 *    мессеж өгдөг; эрх нэмэгдэхгүй (сервер токеныг татгалзсан хэвээр). Хугацаа дуусмагц
 *    дараагийн татгалзал цонхыг дахин гаргана. «Дахин шалгах» амжилттай (`retrySession`) /
 *    шинэ сешн (`registerIdentity`) үед тэглэгдэнэ.
 */
const DISMISS_QUIET_MS = 10 * 60_000;
let quietUntil = 0;
function markDead(): void {
  if (ending || !seenToken) return;
  if (Date.now() < quietUntil) return;
  setDead(true);
}

/** Нэвтрэлтийн хугацаа дууссан (шинэчлэлт эцэслэн унасан) уу — `AuthGate`-ийн хаалтын цонх */
export const sessionDead = (): boolean => dead;
/**
 * Сүүлийн токены шинэчлэлтийн уналтын ангилал (`null` = амжилттай / оролдоогүй).
 * ⚠️ 2026-10-06: `query.ts` 498/499-ийн дараа шинэчлэлт бүтээгүй үед «нэвтрэлт дууссан»
 *    (`dead`) ба «сүлжээ тасарсан» (`network`)-ыг ЯЛГАНА — урьд нь шинэчлэлт сүлжээнээс
 *    болж унасан ч хэрэглэгчид «нэвтрэлтийн хугацаа дууссан» гэж худал хэлдэг байв.
 */
export const lastRefreshFail = (): RefreshFail | null => lastFail;
export function subscribeSessionDead(fn: () => void): () => void {
  deadSubs.add(fn);
  return () => { deadSubs.delete(fn); };
}
/**
 * Цонхыг ТҮР хаах — хэрэглэгч хадгалаагүй ажлаа хуулж авна.
 * ⚠️ 2026-10-09 (аудит №2): хаасны дараа `DISMISS_QUIET_MS` (10 мин) хүртэл токены алдаа
 *    (`refreshAfterTokenError` · `ensureFreshToken`) цонхыг ДАХИН ГАРГАХГҮЙ (`markDead`-ийн
 *    ⚠️); түүнээс хойшхи анхны татгалзал цонхыг дахин гаргана. Хүсэлтүүд өөрсдөө алдаагаа
 *    хэлсээр байна.
 */
export function dismissSessionDead(): void {
  quietUntil = Date.now() + DISMISS_QUIET_MS;
  setDead(false);
}
/**
 * «Түр хаах»-ын чимээгүй цонхыг ЦУЦЛААД «дахин нэвтрэх» цонхыг дахин гаргана (⚠️ 2026-10-19).
 * ⚠️ `AuthGate.SystemClosed`-ийн «Дахин шалгах»: систем хаалттай хэрэглэгч сешн дууссан цонхыг хаасан бол
 *    хаалтын цонх бүх дэлгэцийг эзэлж, шалгалт токенгүй тул ҮҮРД унадаг байв — одоо нэвтрэлт дууссан
 *    (`lastRefreshFail() === 'dead'`) бол энэ дуудлагаар `SessionExpired` (дээр нь) буцаж гарна.
 */
export function reopenSessionDead(): void {
  quietUntil = 0;
  markDead();
}
/** Хэрэглэгч гарах / дахин нэвтрэх гэж байна — итгэмжлэл устахыг «дууссан» гэж тэмдэглэхгүй */
export function noteSignOut(): void {
  ending = true;
  setDead(false);
}
/**
 * Гарах/дахин нэвтрэх навигаци ЦУЦЛАГДСАН («Хуудаснаас гарах уу?» → Үлдэх) — `noteSignOut`-ыг
 * буцаана. ⚠️ 2026-10-06: урьд нь `ending` үүрд `true` үлдэж, жинхэнэ сешн дуусахад ч
 * (`markDead`) цонх ХЭЗЭЭ Ч гардаггүй байв (`AuthGate.signOut`-ийн ⚠️).
 */
export function cancelSignOut(): void {
  ending = false;
}

/**
 * Шинэчлэлтийн алдааг ангилна — цэвэр функц.
 *   · `network` — offline · fetch унах · timeout · 5xx/429 (түр саатал, сешн ХЭВЭЭР)
 *   · `dead`    — сервер токеныг ТАТГАЛЗСАН (498/499/400/401 · invalid_grant · expired)
 *   · `unknown` — тодорхойгүй; дангаараа «дууссан» гэж үзэхгүй
 * ⚠️ JS API-ийн алдаа: `name` (`identity-manager:*` · `request:server`), `details.httpStatus`
 *    (ArcGIS-ийн 200-аар ирсэн `error.code` ч энд бууна), `details.messageCode`.
 */
export function classifyRefreshError(e: unknown): RefreshFail {
  const o = (e ?? {}) as {
    name?: string; message?: string; code?: unknown;
    details?: { httpStatus?: number; messageCode?: string; error?: unknown };
  };
  const st = Number(o.details?.httpStatus ?? 0) || 0;
  const text = `${o.name ?? ''} ${o.message ?? ''} ${o.details?.messageCode ?? ''} ${typeof o.details?.error === 'string' ? o.details.error : ''}`;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network';
  if (o.name === 'AbortError' || /failed to fetch|networkerror|network request|load failed|timeout|timed out|abort/i.test(text)) return 'network';
  if (st >= 500 || st === 429) return 'network';
  if (isTokenError(o.code, text) || st === 400 || st === 401 || st === 498 || st === 499
    || /invalid[_ ]grant|invalid[_ ]refresh|expired|not-authenticated|authentication-failed/i.test(text)) return 'dead';
  return 'unknown';
}

/**
 * «Дахин шалгах» — токеныг ХҮЧЭЭР шинэчилж үзнэ. `true` = сешн сэргэсэн (цонх хаагдана).
 * ⚠️ Сүлжээний/тодорхойгүй уналтад `false` — цонх хэвээр, хэрэглэгч дахин оролдоно.
 */
export async function retrySession(): Promise<boolean> {
  if (!esri || !sharing) return false;
  let c: Cred | null | undefined;
  try { c = esri.findCredential(sharing) as Cred | null | undefined; } catch { c = null; }
  if (!c || typeof c.refreshToken !== 'function') return false;
  try {
    await c.refreshToken();
    lastFail = null;
    lastForced = null;
    quietUntil = 0;
    setDead(false);
    return true;
  } catch (e) {
    lastFail = classifyRefreshError(e);
    return false;
  }
}

/** POST-ын биед задлах: `{ token }` эсвэл `{}`. */
export function tokenParam(): Record<string, string> {
  const t = authToken();
  return t ? { token: t } : {};
}

/* ⚠️ 2026-10-11 (аудит №7): `tokenQs()` (GET URL-д `&token=…` залгагч) УСТГАГДАВ — дуудагчгүй үхмэл код
   байв (хавсралт бүгд blob URL/POST биеэр: `uzlegReport.fetchAttachment`, `habeaUzleg.AttPhoto`).
   Query string-д токен залгах зам кодод огт үлдэхгүй (`tools/tokenInUrl.check.mjs`). */

/* ══════════════════ ТОКЕНЫ ХУГАЦАА (2026-09-29) ══════════════════ */
/**
 * ⚠️ ЯАГААД (хэрэглэгч: «хуваарь илгээхэд зарим багц дээр Invalid token гэх алдаа гарч
 *    байна»): нэвтрэлт нь `authorization-code` (PKCE) — хандалтын токен БОГИНО хугацаатай,
 *    JS API түүнийг цаг хэмжигчээр шинэчилдэг. Гэвч таб нуугдах/компьютер унтахад цаг
 *    хэмжигч хоцорч, `findCredential().token` нь ХУГАЦАА ДУУССАН токеныг буцаана. JS API-ийн
 *    давхаргууд өөрсдөө шинэчилдэг ч шууд `fetch` хийдэг модулиуд (`tokenParam`) хуучин
 *    токеноор явж 498 «Invalid token» авдаг байв — удаан төлөвлөөд илгээх үед л илэрнэ.
 * ⚠️ `ensureFreshToken` — бичих/унших хүсэлтийн ӨМНӨ: хугацаа дуусах дөхсөн (эсвэл
 *    `force`) бол `refreshToken()`. Зэрэг дуудлагууд НЭГ шинэчлэлтийг хуваалцана.
 *    Шинэчлэлт унавал чимээгүй — хүсэлт өөрөө жинхэнэ алдаагаа хэлнэ.
 */
type Cred = { token?: string; expires?: number; refreshToken?: () => Promise<unknown> };
let refreshing: Promise<void> | null = null;
export function ensureFreshToken(force = false): Promise<void> {
  if (!esri || !sharing) return Promise.resolve();
  let c: Cred | null | undefined;
  try { c = esri.findCredential(sharing) as Cred | null | undefined; } catch { c = null; }
  /* ⚠️ 2026-10-05: токен харагдсаны ДАРАА итгэмжлэл алга болсон (JS API шинэчлэлт
     унахад өөрөө устгадаг) — сешн дууссан. Гарах үед (`noteSignOut`) тэмдэглэхгүй. */
  if (!c) { markDead(); return Promise.resolve(); }
  if (typeof c.refreshToken !== 'function') return Promise.resolve();
  const left = typeof c.expires === 'number' && c.expires > 0 ? c.expires - Date.now() : Number.POSITIVE_INFINITY;
  if (!force && left > 90_000) return Promise.resolve();
  if (refreshing) return refreshing;
  const cred = c;
  refreshing = (async () => {
    /* ⚠️ 2026-10-05: уналтыг АНГИЛНА — сервер токеныг татгалзсан (`dead`) бол сешн
       дууссаныг тэмдэглэнэ (`sessionDead`); сүлжээний саатал бол урьдын адил чимээгүй,
       хүсэлт өөрөө алдаагаа хэлнэ. */
    try {
      await cred.refreshToken!();
      lastFail = null;
      setDead(false);
    } catch (e) {
      lastFail = classifyRefreshError(e);
      if (lastFail === 'dead') markDead();
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/**
 * 498/499-ийн ДАРАА шинэчлэх эсэх — `true` бол дуудагч НЭГ удаа дахин илгээнэ.
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас») — ШИНЭЧЛЭЛТИЙН ШУУРГА: таб сэрэхэд
 *    дашбоардын 40+ хүсэлт ИЖИЛ хуучин токеноор зэрэг 498 авдаг. `ensureFreshToken(true)`
 *    зөвхөн ЯГ ЗЭРЭГ дуудлагыг нэгтгэдэг тул шинэчлэлт дууссаны ДАРАА ирсэн 498 бүр
 *    дахин нэг шинэчлэлт эхлүүлж, токен хэд хэдэн удаа солигдон (өмнөх нь хүчингүй
 *    болж) шинэ 498 үүсгэдэг байв. Одоо:
 *      · `sent` (хүсэлтэд ЯВСАН токен) ≠ одоогийн токен → аль хэдийн шинэчлэгдсэн:
 *        шинэчлэхгүй, шууд дахин илгээнэ;
 *      · шинэчлэлт явж байвал ТҮҮНИЙГ хүлээнэ (хуваалцсан Promise);
 *      · ижил токеноос шинэчлэлт сая (30с дотор) оролдоод токен өөрчлөгдөөгүй бол
 *        (шинэчлэлт бүтээгүй) дахин оролдохгүй — хуучин токеноор давтах нь утгагүй.
 *
 * ⚠️ 2026-10-09 (аудит №2): хүлээлтийг ЦАГААР түлхүүрлэнэ, ЯВСАН ТОКЕНООР БИШ. Урьд нь
 *    `lastForced.from === sent` байсан тул шинэчлэлт БҮТМЭГЦ токен солигдож, ҮРГЭЛЖ 499
 *    хэлдэг үйлчилгээ (хаалттай `Selbe_guitsetgel_consolidated` · `Selbe_ET_20260721`,
 *    CLAUDE.md) шинэ токеноор дахин 499 өгөхөд хүлээлт ТААРАХГҮЙ болж, тэсрэлт бүр
 *    дахин нэг хүчээр шинэчлэлт эхлүүлдэг байв — дээрх шуурганы ЯГ өөр хэлбэр. Одоо
 *    хүчээр шинэчлэлтээс хойш 30с дотор ОДООГИЙН токеноор ирсэн 498/499 (ямар ч URL)
 *    дахин шинэчлэлт эхлүүлэхгүй: шинэ токен ч татгалзагдсан бол тэр нь эрхийн асуудал.
 *    (Хуучин токеноор ирсэн алдаа — `sent !== cur` — урьдын адил шууд дахин илгээнэ.)
 */
let lastForced: { at: number } | null = null;
const FORCED_COOLDOWN_MS = 30_000;
export async function refreshAfterTokenError(sent: string | null): Promise<boolean> {
  const cur = authToken();
  /* ⚠️ 2026-10-05: сервер 498/499 хэлсэн атал итгэмжлэл алга (өмнө нь байсан) — сешн дууссан */
  if (!cur) { markDead(); return false; }
  if (sent !== cur) return true;
  if (refreshing) {
    await refreshing;
    return authToken() !== sent;
  }
  if (lastForced && Date.now() - lastForced.at < FORCED_COOLDOWN_MS) return false;
  lastForced = { at: Date.now() };
  await ensureFreshToken(true);
  const changed = authToken() !== sent;
  /* ⚠️ 2026-10-05: сервер токеныг ТАТГАЛЗСАН (498/499) БА шинэчлэлт сүлжээнийх БИШ
     шалтгаанаар унасан → сешн дууссан. Шинэчлэлт бүтсэн (`lastFail === null`) атал
     дахин 499 бол тэр нь эрхийн асуудал (хаалттай үйлчилгээ) — сешн ХЭВЭЭР. */
  if (!changed && lastFail && lastFail !== 'network') markDead();
  return changed;
}

/**
 * ПОРТАЛЫН хаяг мөн үү (`AuthGate`-ийн бүртгэсэн `<portal>/sharing`-ийн суурь).
 * ⚠️ 2026-10-01: `query.arcgisPost`-ын `token: 'always'` горим токеныг ЗӨВХӨН
 *    байгууллагын үйлчилгээ (`isOrgUrl`) эсвэл энэ порталд залгана.
 */
export function isPortalUrl(url: string): boolean {
  if (!sharing) return false;
  const base = sharing.replace(/\/sharing\/?$/i, '').replace(/\/+$/, '');
  return !!base && url.startsWith(`${base}/`);
}

/** ArcGIS-ийн токены алдаа уу — 498 (хүчингүй) / 499 (шаардлагатай) */
export function isTokenError(code: unknown, message: unknown): boolean {
  return code === 498 || code === 499 || /invalid token|token required/i.test(String(message ?? ''));
}

/**
 * Алдааны мессежид ЯМАР хүсэлт унасныг нэмнэ — үйлчилгээний замын сүүл (токенгүй).
 * ⚠️ «Invalid URL» (400) нь ArcGIS-д «ийм үйлчилгээ/давхарга алга» гэсэн утгатай; аль
 *    хаяг болохыг хэлэхгүй бол хэрэглэгч ч, засагч ч юуг шалгахаа мэдэхгүй.
 */
export function describeArcgisError(url: string, code: unknown, message: unknown): string {
  const msg = String(message ?? 'ArcGIS error');
  let tail = '';
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const i = parts.lastIndexOf('services');
    tail = (i >= 0 ? parts.slice(i + 1) : parts.slice(-4)).join('/');
  } catch { tail = ''; }
  const c = typeof code === 'number' ? ` ${code}` : '';
  return tail ? `${msg} [${tail}${c}]` : msg;
}

/**
 * ArcGIS REST POST — токеныг ШИНЭЧИЛЖ, токены алдаанд НЭГ удаа дахин оролдоно (2026-09-29).
 * Батлах урсгалын хүснэгтүүдийн (`huvaariBatlah` · `ajilBatlah` · `obyemBatlah`) нийтлэг `req`.
 *
 * ⚠️ `params.token` өгөгдсөн ч НЭВТЭРСЭН хэрэглэгчийн ОДООГИЙН токен давамгайлна — дуудагч
 *    токеноо эрт уншсан (`getToken`) бол тэр нь аль хэдийн хуучирсан байж болно. Node
 *    (тест/tools) орчинд `tokenParam()` хоосон тул дуудагчийн утга хэвээр.
 * ⚠️ Алдаа HTTP 200-аар ирдэг — `error` биеийг шалгана; мессежид унасан замыг нэмнэ.
 *
 * ⚠️ 2026-09-30: биелэлт нь `query.ts`-ийн хуваалцсан цөм (`arcgisPost`) — timeout,
 *    зэрэг хүсэлтийн слот, 429/503 backoff, JSON биш хариу нэмэгдэв; алдаа нь
 *    `ArcGISError` (`Error`-ийн удам, `code` хэвээр). Энэ бүрхүүл нь батлах
 *    урсгалын дуудагчдын импортыг (`@/lib/authToken`) хөндөхгүйн тулд үлдэв.
 *    `authToken ↔ query` импортын тойрог нь АЮУЛГҮЙ: хоёулаа нөгөөгөө зөвхөн
 *    функц дотроос ашиглана, модулийн түвшинд биш.
 */
export function arcgisPost(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  return queryPost(url, params, { token: 'always', describe: true });
}

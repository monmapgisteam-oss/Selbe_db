/**
 * НЭВТЭРСЭН ХЭРЭГЛЭГЧИЙН ArcGIS ТОКЕН — бүх REST хүсэлтэд.
 *
 * ⚠️ ЯАГААД (2026-09-17, хэрэглэгчийн шийдвэр: «нэвтрээгүй хүн системийг
 *    огт ашиглахгүй»): үйлчилгээнүүдийг Organization-only болгоход JS API-ийн
 *    давхаргууд (FeatureLayer) IdentityManager-ээс токеноо өөрөө авдаг ч
 *    шууд `fetch`-ээр явдаг 28 файл (`query.ts` · `ags.ts` · `tableWrite.ts` ·
 *    `hyanalt*.ts` · анализ …) токенгүй тул хоосон хариу/алдаа авна.
 *    Энэ модуль НЭГ эх сурвалж: `AuthGate` нэвтрэлт бүтмэгц IdentityManager-ээ
 *    бүртгэнэ, дараа нь `tokenParam()`/`tokenQs()` синхрон уншина.
 *
 * ⚠️ Токен POST-ын БИЕЭР явахыг эрхэмлэнэ (`tokenParam`, `query.arcgisPost`).
 *    ⚠️ 2026-09-30: `tokenQs` (URL query string) нь ЗӨВХӨН POST хийх боломжгүй
 *    газарт — `<img src>`/`<a href>`-ийн хавсралтын хаяг (`ags.attachmentUrl`,
 *    `Habea.tsx`). Бүх `fetch` хүсэлт `query.arcgisPost`-оор явна: query string
 *    нь серверийн/CDN-ийн access log-д хадгалагддаг (CWE-598) бөгөөд хөтчийн
 *    HTTP кэшийн түлхүүрт ордог. Логд, алдааны мессежид URL бичихдээ токеныг
 *    оруулахгүй байхыг анхаар.
 *
 * ⚠️ Нэвтрэлт унтраалттай (`AUTH.appId` хоосон) эсвэл Node (тест/tools)
 *    орчинд хоосон буцаана — зан төлөв өөрчлөгдөхгүй.
 */

import { arcgisPost as queryPost } from '@/lib/query';

type Esri = { findCredential: (url: string) => { token?: string } | null | undefined };

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
  setDead(false);
}

export function authToken(): string | null {
  if (!esri || !sharing) return null;
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
type RefreshFail = 'network' | 'dead' | 'unknown';
/** Сүүлийн шинэчлэлтийн уналтын ангилал (`null` = амжилттай / оролдоогүй) */
let lastFail: RefreshFail | null = null;
const deadSubs = new Set<() => void>();

function setDead(v: boolean): void {
  if (dead === v) return;
  dead = v;
  for (const fn of [...deadSubs]) { try { fn(); } catch { /* захиалагчийн алдаа бусдыг зогсоохгүй */ } }
}
function markDead(): void {
  if (ending || !seenToken) return;
  setDead(true);
}

/** Нэвтрэлтийн хугацаа дууссан (шинэчлэлт эцэслэн унасан) уу — `AuthGate`-ийн хаалтын цонх */
export const sessionDead = (): boolean => dead;
export function subscribeSessionDead(fn: () => void): () => void {
  deadSubs.add(fn);
  return () => { deadSubs.delete(fn); };
}
/**
 * Цонхыг ТҮР хаах — хэрэглэгч хадгалаагүй ажлаа хуулж авна. ⚠️ Дараагийн токены
 * алдаа (`refreshAfterTokenError` · `ensureFreshToken`) цонхыг ДАХИН гаргана.
 */
export function dismissSessionDead(): void { setDead(false); }
/** Хэрэглэгч гарах / дахин нэвтрэх гэж байна — итгэмжлэл устахыг «дууссан» гэж тэмдэглэхгүй */
export function noteSignOut(): void {
  ending = true;
  setDead(false);
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

/**
 * GET URL-ийн төгсгөлд залгах: `&token=…` эсвэл `''`.
 * ⚠️ 2026-09-30: ЗӨВХӨН `<img src>`-ийн хавсралтын хаягт (POST боломжгүй). Шинэ
 *    `fetch`-д ХЭРЭГЛЭХГҮЙ — `query.arcgisPost` (токен биеэр).
 */
export function tokenQs(): string {
  const t = authToken();
  return t ? `&token=${encodeURIComponent(t)}` : '';
}

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
 */
let lastForced: { from: string; at: number } | null = null;
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
  if (lastForced && lastForced.from === sent && Date.now() - lastForced.at < FORCED_COOLDOWN_MS) return false;
  lastForced = { from: sent, at: Date.now() };
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

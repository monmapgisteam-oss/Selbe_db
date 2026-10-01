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
}

export function authToken(): string | null {
  if (!esri || !sharing) return null;
  try {
    return esri.findCredential(sharing)?.token ?? null;
  } catch {
    return null;
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
  if (!c || typeof c.refreshToken !== 'function') return Promise.resolve();
  const left = typeof c.expires === 'number' && c.expires > 0 ? c.expires - Date.now() : Number.POSITIVE_INFINITY;
  if (!force && left > 90_000) return Promise.resolve();
  if (refreshing) return refreshing;
  const cred = c;
  refreshing = (async () => {
    try { await cred.refreshToken!(); } catch { /* хүсэлт өөрөө алдаагаа хэлнэ */ }
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
  if (!cur) return false;
  if (sent !== cur) return true;
  if (refreshing) {
    await refreshing;
    return authToken() !== sent;
  }
  if (lastForced && lastForced.from === sent && Date.now() - lastForced.at < FORCED_COOLDOWN_MS) return false;
  lastForced = { from: sent, at: Date.now() };
  await ensureFreshToken(true);
  return authToken() !== sent;
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

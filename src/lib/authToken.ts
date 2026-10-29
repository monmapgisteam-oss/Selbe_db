/**
 * НЭВТЭРСЭН ХЭРЭГЛЭГЧИЙН ArcGIS ТОКЕН — бүх REST хүсэлтэд.
 */

import { arcgisPost as queryPost } from '@/lib/query';
import { clearMetaCache } from '@/lib/metaCache';

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
  seenToken = false;
  ending = false;
  lastFail = null;
  quietUntil = 0;
  setDead(false);
  clearMetaCache();
}

/**
 * ФЕДЕРАЦИЙН СЕРВЕРИЙН ИТГЭМЖЛЭЛИЙГ УРЬДЧИЛЖ АВНА — `AuthGate` порталд нэвтэрмэгц, Portal/газрын зураг үүсэхээс ӨМНӨ.
 * `true` = итгэмжлэл бэлэн. ХЭЗЭЭ Ч шидэхгүй, `timeoutMs`-ээс удахгүй — нэвтрэлтийг саатуулахгүй.
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

export function authToken(): string | null {
  if (!esri || !sharing) return null;
  try {
    const t = esri.findCredential(sharing)?.token ?? null;
    if (t) seenToken = true;
    return t;
  } catch {
    return null;
  }
}

/* ══════════════════ СЕШН ДУУССАН (2026-10-05) ══════════════════ */
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
 */
export const lastRefreshFail = (): RefreshFail | null => lastFail;
export function subscribeSessionDead(fn: () => void): () => void {
  deadSubs.add(fn);
  return () => { deadSubs.delete(fn); };
}
/**
 * Цонхыг ТҮР хаах — хэрэглэгч хадгалаагүй ажлаа хуулж авна.
 */
export function dismissSessionDead(): void {
  quietUntil = Date.now() + DISMISS_QUIET_MS;
  setDead(false);
}
/**
 * «Түр хаах»-ын чимээгүй цонхыг ЦУЦЛААД «дахин нэвтрэх» цонхыг дахин гаргана (2026-10-19).
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
 * буцаана. 2026-10-06: урьд нь `ending` үүрд `true` үлдэж, жинхэнэ сешн дуусахад ч
 * (`markDead`) цонх ХЭЗЭЭ Ч гардаггүй байв (`AuthGate.signOut`).
 */
export function cancelSignOut(): void {
  ending = false;
}

/**
 * Шинэчлэлтийн алдааг ангилна — цэвэр функц.
 *   · `network` — offline · fetch унах · timeout · 5xx/429 (түр саатал, сешн ХЭВЭЭР)
 *   · `dead`    — сервер токеныг ТАТГАЛЗСАН (498/499/400/401 · invalid_grant · expired)
 *   · `unknown` — тодорхойгүй; дангаараа «дууссан» гэж үзэхгүй
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


/* ══════════════════ ТОКЕНЫ ХУГАЦАА (2026-09-29) ══════════════════ */
type Cred = { token?: string; expires?: number; refreshToken?: () => Promise<unknown> };
let refreshing: Promise<void> | null = null;
export function ensureFreshToken(force = false): Promise<void> {
  if (!esri || !sharing) return Promise.resolve();
  let c: Cred | null | undefined;
  try { c = esri.findCredential(sharing) as Cred | null | undefined; } catch { c = null; }
  if (!c) { markDead(); return Promise.resolve(); }
  if (typeof c.refreshToken !== 'function') return Promise.resolve();
  const left = typeof c.expires === 'number' && c.expires > 0 ? c.expires - Date.now() : Number.POSITIVE_INFINITY;
  if (!force && left > 90_000) return Promise.resolve();
  if (refreshing) return refreshing;
  const cred = c;
  refreshing = (async () => {
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
 */
let lastForced: { at: number } | null = null;
const FORCED_COOLDOWN_MS = 30_000;
export async function refreshAfterTokenError(sent: string | null): Promise<boolean> {
  const cur = authToken();
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
  if (!changed && lastFail && lastFail !== 'network') markDead();
  return changed;
}

/**
 * ПОРТАЛЫН хаяг мөн үү (`AuthGate`-ийн бүртгэсэн `<portal>/sharing`-ийн суурь).
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
 */
export function arcgisPost(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  return queryPost(url, params, { token: 'always', describe: true });
}

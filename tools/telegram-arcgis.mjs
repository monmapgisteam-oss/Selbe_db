/**
 * TELEGRAM БОТЫН ArcGIS УНШИЛТЫН ТОКЕН — серверийн талд (2026-10-22, аудит).
 */

const REJECT_BACKOFF_MS = 10 * 60_000;
const NET_BACKOFF_MS = 30_000;

/** Орчноос тохиргоо — нууцтай объект зөвхөн `createBotCredential`-д дамжина (логлохгүй) */
export function botAuthConfig(env = process.env) {
  const token = String(env.ARCGIS_BOT_TOKEN ?? '').trim();
  const username = String(env.ARCGIS_BOT_USERNAME ?? '').trim();
  const password = String(env.ARCGIS_BOT_PASSWORD ?? '');
  const m = Number(env.ARCGIS_BOT_TOKEN_MINUTES);
  const minutes = Number.isInteger(m) && m >= 5 && m <= 20160 ? m : 120;
  if (username && password) return { mode: 'password', username, password, minutes };
  if (token) return { mode: 'static', token, minutes };
  return { mode: 'none', minutes };
}

/**
 * Токены алдаа — `authToken.classifyRefreshError` ангилна: `details.httpStatus` 400/498 → `dead` (татгалзсан),
 * мессеж «Network request failed» → `network`.
 */
export class BotTokenError extends Error {
  constructor(message, kind, httpStatus) {
    super(message);
    this.name = 'BotTokenError';
    this.kind = kind;
    if (httpStatus) this.details = { httpStatus };
  }
}

/**
 * @param {{ mode: 'none'|'static'|'password', token?: string, username?: string, password?: string, minutes: number }} cfg
 * @param {{ portalUrl: string, fetchImpl?: typeof fetch, now?: () => number }} opts
 */
export function createBotCredential(cfg, { portalUrl, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const sharing = `${String(portalUrl ?? '').trim().replace(/\/+$/, '')}/sharing`;
  const st = {
    token: cfg.mode === 'static' ? cfg.token : null,
    /* Нэр/нууц үгийн горимд 1 (эрт өнгөрсөн агшин) — эхний хүсэлтийн өмнө `ensureFreshToken` шууд үүсгэнэ. */
    expires: cfg.mode === 'password' ? 1 : undefined,
    retryAt: 0,
    lastErr: null,
    /** Сүүлд СЕРВЕР татгалзсан агшин (токены 498/499 · буруу нууц үг) — бот асуултын дараа шалгана */
    rejectedAt: 0,
  };

  async function generate() {
    if (now() < st.retryAt && st.lastErr) throw st.lastErr;
    const body = new URLSearchParams({
      f: 'json', username: cfg.username, password: cfg.password, client: 'requestip', expiration: String(cfg.minutes),
    });
    let res;
    try {
      res = await fetchImpl(`${sharing}/rest/generateToken`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
    } catch (e) {
      st.retryAt = now() + NET_BACKOFF_MS;
      throw (st.lastErr = new BotTokenError(`Network request failed (generateToken): ${e?.message ?? e}`, 'network'));
    }
    if (!res.ok) {
      const net = res.status >= 500 || res.status === 429;
      st.retryAt = now() + (net ? NET_BACKOFF_MS : REJECT_BACKOFF_MS);
      if (!net) st.rejectedAt = now();
      throw (st.lastErr = new BotTokenError(`generateToken HTTP ${res.status}`, net ? 'network' : 'rejected', res.status));
    }
    const j = await res.json().catch(() => null);
    if (!j || typeof j.token !== 'string' || !j.token) {
      const code = Number(j?.error?.code) || 400;
      const why = [j?.error?.message, ...(Array.isArray(j?.error?.details) ? j.error.details : [])].filter(Boolean).join(' ');
      st.retryAt = now() + REJECT_BACKOFF_MS;
      st.rejectedAt = now();
      throw (st.lastErr = new BotTokenError(`generateToken татгалзав (${code}): ${why || 'токен ирсэнгүй'}`, 'rejected', code >= 400 ? code : 400));
    }
    st.token = j.token;
    const exp = Number(j.expires);
    st.expires = Number.isFinite(exp) && exp > now() ? exp : now() + cfg.minutes * 60_000;
    st.retryAt = 0;
    st.lastErr = null;
  }

  /** IdentityManager-ийн `Credential`-тэй ижил хэлбэр — `authToken` үүнийг уншина */
  const credential = {
    get token() { return st.token ?? undefined; },
    get expires() { return st.expires; },
    async refreshToken() {
      if (cfg.mode === 'password') return generate();
      st.rejectedAt = now();
      throw new BotTokenError('ARCGIS_BOT_TOKEN татгалзагдлаа (хугацаа дууссан эсвэл хүчингүй)', 'rejected', 498);
    },
  };

  return {
    mode: cfg.mode,
    sharing,
    /** `authToken.registerIdentity`-д — горим `none` бол итгэмжлэлгүй */
    findCredential: () => (cfg.mode === 'none' ? null : credential),
    /** Асах үед: нэр/нууц үгийн горимд эхний токеныг авч тохиргоог шалгана (унавал шиднэ — бот ажилласаар, хүсэлт бүр дахин оролдоно) */
    async init() { if (cfg.mode === 'password') await generate(); },
    /** `t` агшнаас хойш сервер токен/нэвтрэлтийг ТАТГАЛЗСАН уу */
    rejectedSince: (t) => st.rejectedAt > 0 && st.rejectedAt >= t,
    /** Логт аюулгүй төлөв — нууцгүй */
    status: () => ({
      mode: cfg.mode,
      hasToken: !!st.token,
      expiresInS: st.expires ? Math.round((st.expires - now()) / 1000) : null,
      lastError: st.lastErr?.message ?? '',
    }),
  };
}

/** Токены алдаа мөн үү — 498/499 · «Token Required» · «Invalid token» · сешн дууссан туг */
export function isTokenFailure(e) {
  const code = e?.code;
  return code === 498 || code === 499 || e?.sessionExpired === true || e?.name === 'BotTokenError'
    || /token required|invalid token/i.test(String(e?.message ?? ''));
}

/** Хэрэглэгчид — тохируулаагүй (түр саатал БИШ) */
export const BOT_TOKEN_MISSING_TEXT = 'Ботод ArcGIS-ийн уншилтын эрх тохируулаагүй тул төслийн өгөгдлийг уншиж чадахгүй байна (түр саатал БИШ). Админ ботын тохиргоонд ARCGIS_BOT_USERNAME + ARCGIS_BOT_PASSWORD (эсвэл ARCGIS_BOT_TOKEN) тавих хэрэгтэй.';
/** Хэрэглэгчид — тохируулсан ч сервер татгалзсан */
export const BOT_TOKEN_REJECTED_TEXT = 'ArcGIS ботын нэвтрэлтийг татгалзлаа (токены хугацаа дууссан, нууц үг буруу эсвэл эрхгүй) — өгөгдөл уншигдсангүй. Админ ARCGIS_BOT_* тохиргоог шалгана уу.';

/** Алдааг хэрэглэгчийн текст болгоно — токены биш бол `null` (дуудагч өөрийн текстээ) */
export function botAuthErrorText(e, mode) {
  if (!isTokenFailure(e)) return null;
  return mode === 'none' ? BOT_TOKEN_MISSING_TEXT : BOT_TOKEN_REJECTED_TEXT;
}

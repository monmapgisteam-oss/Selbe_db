/**
 * ENTERPRISE — JS API ХҮСЭЛТИЙН INTERCEPTOR (2026-10-20; 2026-10-26-нд талбарын нэрийн хөрвүүлэлт ХАСАГДСАН).
 */
import { AUTH, ENT_HOSTED } from '@/lib/services/env';
import { fixImportStamps } from '@/lib/editTrack';
import {
  META_URL_RE, clearMetaCache, metaCache, metaKey, mutatesData, type MetaCache, type Ticket,
} from '@/lib/metaCache';

type Query = Record<string, unknown>;
type ReqOpts = { query?: Query; authMode?: unknown; signal?: AbortSignal | null } & Record<string, unknown>;
type Before = { url: string; requestOptions: ReqOpts };
type After = { url: string; data?: unknown; requestOptions?: ReqOpts };

/** Метагийн кэшийн эзэн хүсэлтийн тасалбар (requestOptions дээр — `after`/`error` хүртэл) */
const META_REQ = '__selbeMeta';

/**
 * Enterprise-ийн ФЕДЕРАЦИЙН серверийн үйлчилгээний үндэс (`…/map/rest/services`) — `ENT_DATA`-аас (`…/Hosted`).
 * `AuthGate` итгэмжлэлээ үүгээр бэлддэг, `entDocs` тусдаа нэвтрэлтийн токеноо үүнд бүртгэдэг; '' = Enterprise байхгүй (тест).
 */
export const ENT_SERVER = ENT_HOSTED ? ENT_HOSTED.replace(/\/rest\/services\/.*$/i, '/rest/services').replace(/\/+$/, '') : '';

/** Хуучин мөшгөлтийн (gdb-ээс хуулсан, AGOL-ын эх утгатай) баганатай давхаргын мета уу — `editTrack.ts` */
const hasStampCols = (b: Record<string, unknown>): boolean =>
  Array.isArray(b.fields) && typeof b.type === 'string'
  && (b.fields as { name?: unknown }[]).some((f) => typeof f?.name === 'string' && /^(creationdate|editdate)(_1)?$/.test(f.name));

/**
 * Хариуны УТГЫН засвар (нэр хөндөхгүй; цэвэр — тест): асуулгын мөрүүдийн импортын агшны мөшгөлт, хуучин мөшгөлтийн
 * баганатай давхаргын метад PBF-ийг хаана (PBF хариунд засвар хийх боломжгүй).
 */
export function entJsAfter(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const body = data as Record<string, unknown>;
  fixImportStamps(body);
  if (hasStampCols(body) && typeof body.supportedQueryFormats === 'string') body.supportedQueryFormats = 'JSON';
  return body;
}

/** IdentityManager-ийн энд хэрэгтэй хэсэг (тестэд хуурамч) */
export type IdLike = {
  findCredential(url: string, userId?: string): { userId?: string | null } | null | undefined;
  getCredential(url: string, options?: Record<string, unknown>): Promise<unknown>;
};

export type EntInterceptorDeps = {
  /** `ENT_SERVER` — итгэмжлэлийн урьдчилсан бэлтгэл ба бичилтийн илрүүлэлт энэ угтвартай хаягт л */
  entServer: string;
  /** Утгын засвар хэнд (Enterprise-ийн hosted өгөгдлийн хаяг) */
  isEntData: (url: string) => boolean;
  /** IdentityManager (ачаалагдаагүй бол `null`) */
  id: () => IdLike | null;
  /** «Нэвтэрсэн» гэж таних хаягууд — порталын `/sharing` ба серверийн үндэс (`entDocs`-ийн тусдаа нэвтрэлт) */
  sessionUrls: readonly string[];
  cache: MetaCache;
  /** Итгэмжлэлийн бэлтгэлийн дээд хүлээлт (мс) — хэтэрвэл урьдын адил токенгүй явна */
  preflightMs?: number;
  now?: () => number;
};

/** Итгэмжлэл бэлдэх дээд хүлээлт — федерацийн токен (rest/info + generateToken) ихэвчлэн < 1 с */
const PREFLIGHT_MS = 6_000;
/** Бэлтгэл УНАСНЫ дараа (нэвтрэлт өөр порталд г.м.) энэ хугацаанд дахин оролдохгүй — хүсэлт бүр дараалалд зогсохгүй */
const PREFLIGHT_COOL_MS = 30_000;

const aborted = (s: unknown): boolean => !!(s && typeof s === 'object' && (s as { aborted?: boolean }).aborted);
const hasExplicitToken = (url: string, ro: ReqOpts): boolean => /[?&]token=/i.test(url) || ro.query?.token != null;

/**
 * НЭГДСЭН INTERCEPTOR — `before`/`after`/`error` (тестэд хуурамч хамаарлаар; толгой 2026-10-22 «ГУРВАН үүрэг»).
 */
export function makeEntInterceptor(d: EntInterceptorDeps): {
  urls: (string | RegExp)[];
  before(p: Before): Promise<unknown>;
  after(r: After): void;
  error(e: unknown): void;
} {
  const now = d.now ?? Date.now;
  const onServer = (url: string): boolean => !!d.entServer && url.startsWith(`${d.entServer}/`);
  let coolUntil = 0;

  const ensureCred = async (id: IdLike, url: string, ro: ReqOpts): Promise<{ userId?: string | null } | null> => {
    const find = (u: string) => { try { return id.findCredential(u) ?? null; } catch { return null; } };
    const have = find(url);
    if (have) return have;
    if ((ro.authMode != null && ro.authMode !== 'auto') || hasExplicitToken(url, ro) || now() < coolUntil) return null;
    if (!d.sessionUrls.some((u) => !!u && !!find(u))) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), d.preflightMs ?? PREFLIGHT_MS); });
    try {
      await Promise.race([id.getCredential(url, { prompt: false }), late]);
    } catch {
      coolUntil = now() + PREFLIGHT_COOL_MS;
    } finally {
      clearTimeout(timer);
    }
    return find(url);
  };

  return {
    urls: d.entServer ? [`${d.entServer}/`, META_URL_RE] : [META_URL_RE],

    async before(p) {
      const url = p.url;
      const ro = p.requestOptions;
      const server = onServer(url);
      const id = server ? d.id() : null;
      const cred = id ? await ensureCred(id, url, ro) : null;
      if (server && mutatesData(ro)) d.cache.clear();
      const key = metaKey(url, ro, cred ? (cred.userId || 'cred') : '');
      if (!key) return undefined;
      const c = d.cache.claim(key);
      if (c.kind === 'hit') return aborted(ro.signal) ? undefined : c.data;
      if (c.kind === 'wait') {
        let got: unknown;
        try { got = await c.data; } catch { got = undefined; }
        /* Хүлээлт бүтсэнгүй (эзэн унасан/хэтэрсэн) эсвэл цуцлагдсан → ердийн замаар өөрөө (JS API алдаагаа өөрөө өгнө) */
        return got === undefined || aborted(ro.signal) ? undefined : got;
      }
      const ticket: Ticket = c.ticket;
      ro[META_REQ] = { key, ticket };
      const sig = ro.signal;
      if (sig && typeof sig.addEventListener === 'function') {
        sig.addEventListener('abort', () => d.cache.settle(key, ticket, undefined), { once: true });
      }
      return undefined;
    },

    after(r) {
      const ro = r.requestOptions;
      const m = ro?.[META_REQ] as { key: string; ticket: Ticket } | undefined;
      let ok = false;
      try {
        if (d.isEntData(r.url)) r.data = entJsAfter(r.data);
        ok = true;
      } finally {
        if (m) d.cache.settle(m.key, m.ticket, ok ? r.data : undefined);
        if (onServer(r.url) && mutatesData(ro)) d.cache.clear();
      }
    },

    error(e) {
      const det = (e as { details?: { requestOptions?: Record<string, unknown>; url?: string } } | null)?.details;
      const m = det?.requestOptions?.[META_REQ] as { key: string; ticket: Ticket } | undefined;
      if (m) d.cache.settle(m.key, m.ticket, undefined);
      if (det?.url && onServer(det.url) && mutatesData(det.requestOptions)) d.cache.clear();
    },
  };
}

let installing: Promise<void> | null = null;
/** `esriConfig.request.interceptors`-т нэг удаа суулгана — JS API байхгүй (Node) бол юу ч хийхгүй */
export function installEntInterceptor(): Promise<void> {
  if (!ENT_HOSTED) return Promise.resolve();
  if (!installing) {
    installing = doInstall().catch(() => {
      /* Импорт унавал (Node/тест) кэшийг суллаж, дараагийн дуудлагад дахин оролдоно */
      installing = null;
    });
  }
  return installing;
}

async function doInstall(): Promise<void> {
  const [cfg, idm] = await Promise.all([
    import('@arcgis/core/config'),
    import('@arcgis/core/identity/IdentityManager'),
  ]);
  const esriConfig = cfg.default as unknown as { request: { interceptors: unknown[] } };
  const esriId = idm.default as unknown as IdLike;
  const portal = AUTH.portalUrl.trim().replace(/\/+$/, '');
  esriConfig.request.interceptors.push(makeEntInterceptor({
    entServer: ENT_SERVER,
    isEntData: (u: string) => u.startsWith(`${ENT_HOSTED}/`),
    id: () => esriId,
    sessionUrls: [portal ? `${portal}/sharing` : '', ENT_SERVER].filter(Boolean),
    cache: metaCache,
  }));
  try {
    const { subscribeData } = await import('@/lib/dataBus');
    subscribeData(clearMetaCache);
  } catch { /* автобус ачаалагдаагүй — TTL ба нэвтрэлтийн хаялт хэвээр */ }
}

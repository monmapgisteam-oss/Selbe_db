/**
 * ENTERPRISE — JS API ХҮСЭЛТИЙН INTERCEPTOR (2026-10-20; 2026-10-26-нд талбарын нэрийн хөрвүүлэлт ХАСАГДСАН).
 *
 * ⚠️ ЯАГААД: газрын зургийн давхарга (FeatureLayer), ноорог/эрхийн хүснэгтийн `FeatureLayer.queryFeatures`/
 *    `applyEdits` нь `query.ts`-ийн цөмөөр БИШ, JS API-ийн өөрийн `esri/request`-ээр явдаг. `esriConfig.request.interceptors`
 *    нь JS API-ийн БҮХ хүсэлтэд (давхаргын мета · асуулга · layerView-ийн worker-ийн татлага · applyEdits) ажилладаг.
 * ⚠️ 2026-10-26 (хэрэглэгч: «хөрвүүлэх хүснэгт огт ашиглахгүй, бодит датаг шууд ашиглана»): урьд энд талбарын нэрийг
 *    (`BAGTS` ↔ `bagts`) хоёр чиглэлд хөрвүүлдэг байв (`entMap` толь). Одоо код Enterprise-ийн БОДИТ (жижиг үсэгтэй)
 *    нэрээр бичигдсэн тул хөрвүүлэлт БАЙХГҮЙ. Үлдсэн нь нэр өөрчилдөггүй:
 *      · импортын агшны мөшгөлтийн утгын засвар (`editTrack.fixImportStamps` — асуулгын хариунд);
 *      · хуучин мөшгөлтийн баганатай давхаргын метад `supportedQueryFormats = 'JSON'` (PBF хариунд утгын засвар
 *        хийх боломжгүй — урьдын зан төлөв хэвээр; бусад давхарга PBF-ээр).
 * ⚠️ Дуудах цэг: `AuthGate` (аппын эхэнд, нэвтрэлтээс үл хамааран) · `MapCanvas`/`SuitMap` (view үүсгэхээс өмнө) ·
 *    FeatureLayer кэштэй lib-үүд (`draftRemote` · `permsRemote`). Node-д (тест) JS API ачаалагдахгүй тул чимээгүй алгасна.
 * ⚠️ 2026-10-22 (гүйцэтгэл): ЭНЭ НЭГ interceptor ОЛОН үүрэгтэй — JS API `request` нь `urls`-тэй ТААРСАН ЭХНИЙ
 *    interceptor-ыг л ажиллуулдаг (`core/urlUtils.getInterceptor`), тусдаа interceptor нэмбэл давхцсан хаягт аль нэг нь
 *    ХЭЗЭЭ Ч ажиллахгүй. Дараалал — `before`: (1) серверийн итгэмжлэл (`ensureCred`) → (2) метагийн кэш (`metaCache`);
 *    `after`: утгын засвар → кэшид хадгална. Кэшийн хит `before`-оос буцахад JS API `after`-ыг ДУУДДАГГҮЙ (`request.js`)
 *    — тиймээс хадгалсан нь аль хэдийн засагдсан байх ёстой.
 *    `urls` = Enterprise серверийн бүх үйлчилгээ (`ENT_SERVER`, ортофото MapServer/ImageServer ч) + бусад хостын
 *    метагийн хаяг (`META_URL_RE` — суурь зураг); бусад хүсэлт энэ interceptor-оор огт орохгүй.
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

/** Хуучин мөшгөлтийн (gdb-ээс хуулсан, AGOL-ын эх утгатай) баганатай давхаргын мета уу — `editTrack.ts`-ийн ⚠️ */
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
 * НЭГДСЭН INTERCEPTOR — `before`/`after`/`error` (тестэд хуурамч хамаарлаар; толгойн ⚠️ 2026-10-22 «ГУРВАН үүрэг»).
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

  /**
   * ⚠️ 2026-10-22 (гүйцэтгэл): ЭХНИЙ ХҮСЭЛТ ТОКЕНТОЙ ЯВНА. JS API (`request.js`) хүсэлт бүрт итгэмжлэлийг
   *    `IdentityManager.findCredential(url)`-аар хайдаг — тэр нь итгэмжлэлийн `resources`-д ТУХАЙН ҮЙЛЧИЛГЭЭ бүртгэлтэй
   *    байхыг шаарддаг (`_isIdenticalService`). Тиймээс серверийн итгэмжлэл байсан ч ШИНЭ үйлчилгээ бүрийн эхний хүсэлт
   *    токенгүй явж 499 аваад `getCredential`-ийн дараа ДАХИН илгээгддэг байв (хуудсанд ~185 мета × 2, CDP-ээр батлав).
   *    Одоо хүсэлтийн ӨМНӨ `getCredential(url, { prompt: false })`: серверийн итгэмжлэл байвал СҮЛЖЭЭГҮЙ (үйлчилгээг
   *    бүртгээд буцаана), зөвхөн порталын итгэмжлэл байвал федерацийн токеныг НЭГ удаа үүсгэнэ (зэрэг хүсэлтүүд JS API-ийн
   *    нэг дараалалд хүлээнэ). Нэвтрэх цонх ГАРГАХГҮЙ; унавал/удвал урьдын адил токенгүй явж JS API өөрөө шийднэ.
   *    Нэвтрээгүй (итгэмжлэлгүй) · `authMode` тодорхой · ил токентой хүсэлтэд огт оролдохгүй — зан төлөв хэвээр.
   */
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
      /* ⚠️ Бичилт (ил POST/бие — `mutatesData`) → мета (extent · `editingInfo` · схем) хуучирч болзошгүй — урьдчилж
         хаяна, `after`/`error`-т ДАХИН (бичилтийн явцад эхэлсэн мета татлага кэшид суухгүй). */
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
        /* ⚠️ Засвар унасан бол засаагүй хариуг ХАДГАЛАХГҮЙ — гэхдээ хүлээгчдийг заавал чөлөөлнө */
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

/* ⚠️ 2026-10-21: boolean биш PROMISE-ыг кэшилнэ. Урьд `installed = true` нь `import('@arcgis/core/config')`
   шийдэгдэхээс ӨМНӨ тавигддаг тул зэрэг ирсэн хоёр дахь дуудагч хөрвүүлэгч суугаагүй байхад буцаж, түүний
   FeatureLayer-ийн мета хөрвүүлэгдэлгүй явдаг байв (жижиг үсэгтэй талбар → OBJECTID undefined → ноорог
   хадгалалт давхардсан add болно). Одоо бүх дуудагч НЭГ суулгалтын дуусахыг хүлээнэ. */
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
  /* ⚠️ 2026-10-22: аппын REST бичилт (`dataBus.invalidate`) · «Шинэчлэх»/таб буцах · хэл солих (`invalidateAll`) →
     метагийн кэшийг хаяна. REST бичилт (`query.ts` — шууд fetch) энэ interceptor-оор ЯВДАГГҮЙ тул ганц дохио нь энэ. */
  try {
    const { subscribeData } = await import('@/lib/dataBus');
    subscribeData(clearMetaCache);
  } catch { /* автобус ачаалагдаагүй — TTL ба нэвтрэлтийн хаялт хэвээр */ }
}

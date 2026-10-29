/**
 * ДАВХАРГА/ҮЙЛЧИЛГЭЭНИЙ МЕТАГИЙН СЕШНИЙ КЭШ (2026-10-22, гүйцэтгэл) — `entInterceptor`-ийн НЭГ interceptor дотор ажиллана.
 */

/** Кэшийн насжилт — схем ховор өөрчлөгдөнө; бичилт/нэвтрэлт/«Шинэчлэх» үүнээс өмнө хаяна */
export const TTL_MS = 10 * 60_000;
/** Явж буй ижил хүсэлтийг хүлээх дээд хугацаа — хэтэрвэл хүлээгч өөрөө татна (эзэн нь чимээгүй алга болсон ч гацахгүй) */
export const JOIN_MS = 15_000;
/** Дээд бичлэг (хуучнаас нь хаяна) — ~200 давхарга × хэдэн арван КБ */
export const MAX_ENTRIES = 600;

/** Метагийн зам (query string-гүй, төгсгөлийн `/`-гүй) */
const META_PATH_RE = /\/(?:FeatureServer|MapServer|ImageServer|VectorTileServer)(?:\/\d+)?$/i;
/** `esriConfig.request.interceptors`-ийн `urls`-д — бүтэн хаяг (query string-тэй ч таарна). `g` тугГҮЙ — `.test` төлөвгүй */
export const META_URL_RE = /^https?:\/\/[^?#]*\/(?:FeatureServer|MapServer|ImageServer|VectorTileServer)(?:\/\d+)?\/?(?:[?#]|$)/i;
/**
 * Өгөгдөл/схем ӨӨРЧИЛЖ болзошгүй хүсэлт мөн үү — ил POST/PUT/DELETE эсвэл биетэй (цэвэр — тест).
 */
export const mutatesData = (ro: MetaReqOptions | null | undefined): boolean =>
  !!ro && (ro.body != null || /^(?:post|put|patch|delete)$/i.test(typeof ro.method === 'string' ? ro.method : ''));

/** Түлхүүрт орох параметрүүд (жижиг үсгээр) — бусад нь кэшийг ХААНА */
const KEY_PARAMS = new Set(['f', 'returnadvancedsymbols']);

export type MetaReqOptions = { method?: unknown; body?: unknown; responseType?: unknown; query?: unknown };

/**
 * Кэшлэх боломжтой МЕТА хүсэлтийн түлхүүр, эсвэл `null` (цэвэр — тест).
 * `who` — итгэмжлэлийн хэрэглэгч ('' = нэргүй): өөр эрхтэй хэрэглэгчийн мета (capabilities) холилдохгүй.
 */
export function metaKey(url: string, ro: MetaReqOptions | null | undefined, who = ''): string | null {
  const o = ro ?? {};
  if (o.body != null) return null;
  const method = typeof o.method === 'string' ? o.method.toLowerCase() : '';
  if (method && method !== 'auto' && method !== 'get') return null;
  if (o.responseType != null && o.responseType !== 'json') return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const path = u.pathname.replace(/\/+$/, '');
  if (!META_PATH_RE.test(path)) return null;
  const params = new Map<string, string>();
  const put = (k: string, v: unknown): boolean => {
    if (v == null) return true;
    const lk = k.toLowerCase();
    if (!KEY_PARAMS.has(lk)) return false;
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return false;
    params.set(lk, String(v));
    return true;
  };
  for (const [k, v] of u.searchParams) if (!put(k, v)) return null;
  const q = o.query;
  if (q != null) {
    if (typeof q !== 'object' || Array.isArray(q)) return null;
    for (const [k, v] of Object.entries(q as Record<string, unknown>)) if (!put(k, v)) return null;
  }
  const f = (params.get('f') ?? '').toLowerCase();
  if (f !== 'json' && f !== 'pjson') return null;
  params.set('f', 'json');
  const qs = [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  return `${who}|${u.protocol}//${u.host.toLowerCase()}${path}?${qs}`;
}

const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)) as T);

/** Хадгалах хариу мөн үү — энгийн объект, ArcGIS-ийн алдааны бие БИШ */
const storable = (d: unknown): boolean => !!d && typeof d === 'object' && !Array.isArray(d)
  && (d as { error?: unknown }).error == null && (d as { status?: unknown }).status !== 'error';

/**
 * ХУВААЛЦАХ хуулбар: гүн хуулбар + `editingInfo.*LastEditDate` → `null` (толгой «lastEditDate» — цэвэр, тест).
 * Хүлээн авагч бүр ӨӨРИЙН хуулбартай — JS API метаг газар дээр нь засдаг (`_patchServiceJSON`).
 */
export function sharedCopy<T>(data: T): T {
  const c = clone(data);
  const ei = (c as { editingInfo?: unknown } | null)?.editingInfo;
  if (ei && typeof ei === 'object' && !Array.isArray(ei)) {
    for (const k of Object.keys(ei)) if (/lastEditDate$/i.test(k)) (ei as Record<string, unknown>)[k] = null;
  }
  return c;
}

export type Ticket = { id: number; gen: number };
export type Claim =
  | { kind: 'hit'; data: unknown }
  | { kind: 'wait'; data: Promise<unknown> }
  | { kind: 'own'; ticket: Ticket };

export type MetaCache = {
  /**
   * СИНХРОН шийдвэр (зэрэг ирсэн хоёр хүсэлт хоёулаа «эзэн» болохгүйн тулд): `hit` — хуваалцах хуулбар;
   * `wait` — явж буй хүсэлтийн хуулбар эсвэл `undefined` (унасан/хэтэрсэн → өөрөө татна); `own` — сүлжээ рүү ява.
   */
  claim(key: string): Claim;
  /** Эзний хариу (ХӨРВҮҮЛСНИЙ дараа) — хүлээгчдэд өгч, үе таарвал хадгална. `undefined` = унасан/цуцлагдсан */
  settle(key: string, ticket: Ticket, data: unknown): void;
  /** Бүгдийг хаяна; явж буй хүсэлтийн хариу хадгалагдахгүй, хүлээгчид өөрсдөө татна */
  clear(): void;
  readonly size: number;
};

export function createMetaCache(o: { ttlMs?: number; joinMs?: number; max?: number; now?: () => number } = {}): MetaCache {
  const ttl = o.ttlMs ?? TTL_MS;
  const join = o.joinMs ?? JOIN_MS;
  const max = o.max ?? MAX_ENTRIES;
  const now = o.now ?? Date.now;
  type Pending = { id: number; gen: number; at: number; promise: Promise<unknown>; resolve: (d: unknown) => void };
  const done = new Map<string, { data: unknown; at: number }>();
  const pending = new Map<string, Pending>();
  let gen = 0;
  let seq = 0;
  const drop = (key: string, p: Pending): void => {
    if (pending.get(key) === p) pending.delete(key);
    p.resolve(undefined);
  };
  const waitFor = (p: Promise<unknown>, ms: number): Promise<unknown> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<undefined>((r) => { timer = setTimeout(() => r(undefined), ms); });
    const got = p.then((d) => {
      if (d === undefined) return undefined;
      try { return sharedCopy(d); } catch { return undefined; }
    });
    return Promise.race([got, late]).finally(() => clearTimeout(timer));
  };
  return {
    claim(key) {
      const e = done.get(key);
      if (e) {
        if (now() - e.at <= ttl) {
          try { return { kind: 'hit', data: sharedCopy(e.data) }; } catch { done.delete(key); }
        } else done.delete(key);
      }
      const p = pending.get(key);
      if (p) {
        const left = join - (now() - p.at);
        if (left > 0) return { kind: 'wait', data: waitFor(p.promise, left) };
        drop(key, p);
      }
      let resolve: (d: unknown) => void = () => {};
      const promise = new Promise<unknown>((r) => { resolve = r; });
      const ticket: Ticket = { id: ++seq, gen };
      pending.set(key, { ...ticket, at: now(), promise, resolve });
      return { kind: 'own', ticket };
    },
    settle(key, ticket, data) {
      let snap: unknown;
      if (storable(data)) { try { snap = clone(data); } catch { snap = undefined; } }
      const p = pending.get(key);
      if (p && p.id === ticket.id) {
        pending.delete(key);
        p.resolve(snap);
      }
      if (snap === undefined || ticket.gen !== gen) return;
      done.delete(key);
      done.set(key, { data: snap, at: now() });
      while (done.size > max) {
        const first = done.keys().next();
        if (first.done) break;
        done.delete(first.value);
      }
    },
    clear() {
      gen += 1;
      done.clear();
      for (const [k, p] of [...pending]) drop(k, p);
    },
    get size() { return done.size; },
  };
}

/** Аппын ГАНЦ кэш (`entInterceptor` ашиглана) */
export const metaCache: MetaCache = createMetaCache();

/** Нэвтрэлт солигдох/бичилтийн дараа — бүх метаг хаяна */
export function clearMetaCache(): void {
  metaCache.clear();
}

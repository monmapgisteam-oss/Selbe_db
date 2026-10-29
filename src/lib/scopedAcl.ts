'use client';

/**
 * БАГЦААР ХУВААРИЛАХ ACL-ИЙН ЕРӨНХИЙ ЦӨМ — гурван дэд системийн ГАНЦ эх код.
 *
 *   · `aclParity.check.mjs`-ийн толгой: «Шалгалтаар олдсон 13 алдааны 7 нь
 *     ЯГ НЭГ хэв шинжтэй байв: засвар нь ижил кодын НЭГД нь л хүрч, бусад
 *     руу хуулагдаагүй.»
 *   · 2026-09-09-нд дахин хоёр ийм алдаа олдсон: `UserAdmin.flipCap`-ийн
 *     гурван салааны ЗӨВХӨН нэгэнд `.trim` байсан.
 *
 * `aclParity` тест нь давхардлыг ХАМГААЛДАГ болохоос АРИЛГАДАГГҮЙ. Энэ файл
 * шалтгааныг нь арилгана: нэг газар засвал гурвуулаа засагдана.
 */

import { isCodeSuper, roleForUser } from './services';
import type { CapKey } from './caps';

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

/* ══════════ Remote агшин ба локал бичилтийн дараалал (2026-09-25) ══════════ */

/**
 * ХУУЧИН SNAPSHOT ЛОКАЛ БИЧИЛТИЙГ ДАРАХААС ХАМГААЛАХ ГЛОБАЛ ТООЛУУР.
 *
 * ЗАГВАР: локал бичилт бүр (дараалалд орох ба дуусах агшинд) `seq`-ийг
 *    ахиулж, хэрэглэгчийн сүүлийн утгыг хадгална. `initRemote` хүсэлт
 *    эхлэхдээ тэр агшны `seq`-ийг тэмдэглэнэ. Snapshot-ыг буулгахад
 *    хэрэглэгчийн сүүлийн бичилт тэмдгээс ХОЙШ бол snapshot тэр бичилтийг
 *    агуулаагүй байж болох тул ЛОКАЛ төлөв давамгайлна; дараагийн poll
 *    (тэмдэг бичилтээс хойш) remote-оор засна.
 */
let seq = 0;
const outstanding: number[] = [];

/** `initRemote` хүсэлт эхлэхэд дуудна — дуусахад буцаасан функцийг дуудна */
export function _beginRemoteFetch(): () => void {
  const mark = seq;
  outstanding.push(mark);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const i = outstanding.indexOf(mark);
    if (i >= 0) outstanding.splice(i, 1);
  };
}

/** Локал бичилтийн агшин — дараалалд орох ба дуусахад */
export const _touchSeq = (): number => ++seq;

/** Энэ агшин (`t`) явагдаж буй snapshot хүсэлтээс ХОЙШ уу — тийм бол snapshot хуучирсан байж болно */
export function _newerThanSnapshot(t: number | undefined): boolean {
  if (t == null || !outstanding.length) return false;
  return t > Math.min(...outstanding);
}

/** Нэг аккаунтын хуваарилалт. `roles` нь үүрэггүй систем (Чанар)-д хоосон. */
/**
 * НЭГ ҮҮРЭГ + ТҮҮНИЙ БАГЦУУД — хуваарилалтын БҮТЭЦ НЭГЖ (2026-09-09).
 *
 * Тэр сул талыг нөхөхийн тулд ТАВАН хамгаалалт бичигдсэн байсан
 * (`HuvaariAcl` 3 · `ObyemAcl` 3 · `UserAdmin` 2) бөгөөд тэдгээр нь бүгд
 * «болохгүй» гэж хэлдэг: админ хүссэн зүйлээ хийж чадахгүй, «эхлээд хасаад
 * дахин томилно уу» гэсэн заавар авдаг байв. Одоо тэр хослол ЗӨВ илэрхийлэгдэх
 * тул хамгаалалтууд шаардлагагүй.
 */
export type Grant<R extends string = string> = {
  /** Үүрэг. Үүрэггүй систем (Чанар)-д `''`. */
  role: R | '';
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
};

export type Assign<R extends string = string> = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  /**
   * ҮҮРЭГ БҮР ӨӨРИЙН БАГЦТАЙ. Үүрэггүй системд ганц `{ role: '', bagts }`.
   */
  grants: Grant<R>[];
};

type LegacyAssign = { user: string; roles?: string[]; bagts?: string[] };

/**
 * ХУУЧИН → ШИНЭ. Үржвэрийг задлахгүй, ЯГ ТЭР УТГААР нь хадгална: хуучин
 * `{roles:[a,b], bagts:[X,Y]}` нь «a ба b хоёулаа X, Y-д» гэсэн утгатай
 * байсан тул үүрэг бүрд ижил багцын жагсаалт өгнө. Ингэж хөрвүүлбэл эрх
 * НЭМЭГДЭХГҮЙ, ХАСАГДАХГҮЙ — зөвхөн илэрхийлэл нь өөрчлөгдөнө.
 */
const fromLegacy = <R extends string>(a: LegacyAssign, hasRoles: boolean): Grant<R>[] => {
  const bagts = (Array.isArray(a.bagts) ? a.bagts : []).filter((b) => typeof b === 'string');
  if (!hasRoles) return [{ role: '' as const, bagts }];
  const roles = (Array.isArray(a.roles) ? a.roles : []).filter((r) => typeof r === 'string');
  return roles.map((role) => ({ role: role as R, bagts }));
};

/**
 * ХУВААРИЛАЛТЫН ӨӨРЧЛӨЛТИЙГ ШИНЭ УТГА ДЭЭР ДАВХАРЛАНА — цэвэр (`scopedAcl.check.mjs`, 2026-10-04).
 * Нэгж нь (үүрэг, багц) хос: `next − base` = нэмсэн, `base − next` = хассан. `fresh`
 * (remote-оос дөнгөж уншсан) дээр хассаныг хасаж нэмснийг нэмнэ — завсарт өөр админы
 * хийсэн өөрчлөлт хадгалагдана. Үүрэгт `ALL_BAGTS` байвал зөвхөн `[ALL_BAGTS]`.
 * Үүргийн дараалал: `fresh`-ийнх, дараа нь шинэ.
 */
export function mergeGrantDelta<R extends string>(
  base: readonly Grant<R>[], next: readonly Grant<R>[], fresh: readonly Grant<R>[],
): Grant<R>[] {
  const SEP = '\u0001';
  const pairs = (gs: readonly Grant<R>[]) => new Set(gs.flatMap((g) => g.bagts.map((b) => `${g.role}${SEP}${b}`)));
  const b = pairs(base);
  const n = pairs(next);
  const out = new Map<string, Set<string>>();
  const add = (role: string, bag: string) => {
    const s = out.get(role) ?? new Set<string>();
    s.add(bag);
    out.set(role, s);
  };
  for (const g of fresh) for (const bag of g.bagts) {
    const k = `${g.role}${SEP}${bag}`;
    if (b.has(k) && !n.has(k)) continue;
    add(g.role, bag);
  }
  for (const g of next) for (const bag of g.bagts) {
    if (!b.has(`${g.role}${SEP}${bag}`)) add(g.role, bag);
  }
  return [...out].filter(([, s]) => s.size > 0).map(([role, s]) => ({
    role: role as R | '',
    bagts: s.has(ALL_BAGTS) ? [ALL_BAGTS] : [...s],
  }));
}

/** Бичилтийн үр дүн — `sync` нь мөр, `granted` нь эрхийн олголт */
export type AclWrite = {
  ok: boolean;
  error?: string;
  sync?: Promise<boolean>;
  granted?: Promise<boolean>;
};

/** Нэг дэд системийн тохиргоо */
export type AclSpec<R extends string> = {
  /** `localStorage` түлхүүр — систем бүрд ӨӨР байх ЁСТОЙ */
  storeKey: string;
  /** `window` эвентийн нэр — систем бүрд ӨӨР */
  event: string;
  /**
   * ҮҮРЭГ → ЭРХ. Хоосон объект = үүрэггүй систем (Чанар), тэр үед
   * `capsFor` нь ганц эрхийг заана.
   */
  roleCaps: Readonly<Record<R, CapKey>>;
  /**
   * ҮҮРЭГГҮЙ системийн ганц эрх (Чанар). Үүрэгтэй системд `undefined`.
   */
  soleCap?: CapKey;
  /** Алсын бичилт — `permsRemote`-ийн харгалзах хос */
  push: (user: string, roles: R[], bagts: string[], grants: Grant<R>[]) => Promise<boolean>;
  remove: (user: string) => Promise<boolean>;
  read?: (user: string) => Promise<{ row: { roles?: string[]; bagts?: string[]; grants?: Grant<string>[] } | null } | null>;
  /** Алдааны мессежүүд — систем бүр өөрийн үгтэй */
  msg: {
    noUser: string;
    superUser: string;
    noRole?: string;
    noBagts: string;
  };
};

/** Нэг дэд системийн бүрэн API */
export type Acl<R extends string> = {
  list: () => Assign<R>[];
  syncRemote: (
    rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
  ) => void;
  failedUsers: () => string[];
  set: (user: string, roles: R[], bagts: string[], grant?: boolean) => AclWrite;
  /** Үүрэг бүрд ӨӨР багц — `set`-ийн ерөнхий хэлбэр */
  setGrants: (user: string, grants: Grant<R>[], grant?: boolean) => AclWrite;
  /** Тухайн хэрэглэгчийн хуваарилалт (байхгүй бол `null`) */
  grantsOf: (user: string | null | undefined) => Grant<R>[] | null;
  remove: (user: string, revoke?: boolean) => AclWrite;
  purge: (user: string) => Promise<boolean>;
  /**
   * БИЧИЛТ УНАСАН МӨРИЙГ ДАХИН ИЛГЭЭХ (2026-10-01) — локал төлөвийг (мөр байвал upsert,
   * алга бол устгал) remote руу ДАХИН бичиж, `grant` бол үүргийн эрхийг дахин олгоно.
   */
  retry: (user: string, grant?: boolean) => AclWrite;
  /** `null` = хязгааргүй · `[]` = хуваарилагдаагүй · `[...]` = заасан багцууд */
  scope: (user: string | null | undefined, role?: R) => string[] | null;
  hasRole: (user: string | null | undefined, role: R) => boolean;
  subscribe: (fn: () => void) => () => void;
  /**
   * Энэ сешнд remote хуваарилалт уншигдсан уу (2026-09-24). Панелийн
   * түгжээнд — `permissions.remoteReady` · `caps.capsRemoteReady`-тэй хамт
   * ӨӨРИЙН тугаа шалгана; эс бөгөөс энэ ACL хараахан уншигдаагүй атлаа
   * нөгөө хоёр бэлэн бол панел «нээлттэй» болж `[]` дээр дарж бичнэ.
   */
  ready: () => boolean;
};

export function makeAcl<R extends string>(spec: AclSpec<R>): Acl<R> {
  const ROLES = new Set<string>(Object.keys(spec.roleCaps));
  const hasRoles = ROLES.size > 0;

  /** Танигдахгүй үүргийг хаяна — эвдэрсэн мөр эрх нээхгүй */
  const saneRoles = (v: unknown): R[] =>
    (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ROLES.has(x)) : []) as R[];

  let cache: Assign<R>[] | null = null;

  /**
   * Энэ сешнд remote хуваарилалт НЭГ Ч УДАА уншигдсан уу (2026-09-21).
   */
  let remoteSynced = false;
  /** Уншилтад ХҮЧИНТЭЙ жагсаалт — remote ачаалагдаагүй бол хоосон */
  const effective = (): Assign<R>[] => (remoteSynced ? load() : []);

  const normalize = (a: Assign<R> | LegacyAssign): Assign<R> | null => {
    if (!a || typeof a.user !== 'string') return null;
    const g = (a as Assign<R>).grants;
    if (Array.isArray(g)) {
      const clean = g.filter((x) => x && Array.isArray(x.bagts));
      return clean.length ? { user: a.user, grants: clean } : null;
    }
    const from = fromLegacy<R>(a as LegacyAssign, hasRoles);
    return from.length ? { user: a.user, grants: from } : null;
  };

  function load(): Assign<R>[] {
    if (cache) return cache;
    if (typeof window === 'undefined') return [];
    try {
      const raw = JSON.parse(localStorage.getItem(spec.storeKey) || '[]') as unknown[];
      cache = Array.isArray(raw)
        ? raw.map((x) => normalize(x as Assign<R>)).filter((x): x is Assign<R> => x != null)
        : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function notify(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(spec.event));
  }

  function save(list: Assign<R>[]): void {
    cache = list;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(spec.storeKey, JSON.stringify(list));
      } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
    }
    notify();
  }

  /* ══════════════ Remote бичилтийн дараалал ба үр дүн ══════════════ */

  const failed = new Set<string>();

  function markResult(u: string, ok: boolean): void {
    const before = failed.has(u);
    if (ok) failed.delete(u); else failed.add(u);
    if (before !== failed.has(u)) notify();
  }

  /** Нэг хэрэглэгчийн remote үйлдлүүд ДАРААЛНА — remove/add/багц уралдахгүй */
  const chain = new Map<string, Promise<unknown>>();
  /** Хэрэглэгч бүрийн СҮҮЛИЙН локал бичилтийн агшин (`_touchSeq`) — `syncRemote`-д */
  const touched = new Map<string, number>();

  function enqueue<T>(u: string, fn: () => Promise<T>): Promise<T> {
    touched.set(u, _touchSeq());
    const prev = chain.get(u) ?? Promise.resolve();
    const p = prev.then(fn, fn);
    const tail = p.then(() => undefined, () => undefined);
    chain.set(u, tail);
    void tail.then(() => {
      touched.set(u, _touchSeq());
      if (chain.get(u) === tail) chain.delete(u);
    });
    return p;
  }

  /** Remote мөр → цэвэр `grants` — `syncRemote`-ийн задлалтай ИЖИЛ дүрэм (хуучин хэлбэр · танигдахгүй үүрэг) */
  function cleanGrants(user: string, r: { roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }): Grant<R>[] {
    const raw: Grant<string>[] = Array.isArray(r.grants)
      ? r.grants
      : fromLegacy<R>({ user, roles: r.roles, bagts: r.bagts }, hasRoles);
    return raw
      .filter((g) => g && Array.isArray(g.bagts))
      .map((g) => ({
        role: (hasRoles ? (ROLES.has(String(g.role)) ? g.role : null) : '') as R | '',
        bagts: g.bagts.filter((b) => typeof b === 'string'),
      }))
      .filter((g): g is Grant<R> => g.role !== null && g.bagts.length > 0);
  }

  /**
   * Хуваарилалтыг remote руу бичих.
   */
  async function pushRow(user: string, delta?: { base: Grant<R>[]; next: Grant<R>[] }): Promise<boolean> {
    try {
      if (delta && spec.read && !failed.has(user)) {
        const fresh = await spec.read(user);
        if (!fresh) return false;
        const freshGrants = fresh.row ? cleanGrants(user, fresh.row) : [];
        const merged = mergeGrantDelta(delta.base, delta.next, freshGrants);
        const cur = load();
        const has = cur.some((x) => x.user === user);
        save(merged.length
          ? (has ? cur.map((x) => (x.user === user ? { user, grants: merged } : x)) : [...cur, { user, grants: merged }])
          : cur.filter((x) => x.user !== user));
      }
      const a = load().find((x) => x.user === user);
      if (!a) return spec.remove(user);
      const roles = [...new Set(a.grants.map((g) => g.role))].filter((r): r is R => r !== '');
      const bagts = [...new Set(a.grants.flatMap((g) => g.bagts))];
      return spec.push(a.user, roles, bagts, a.grants);
    } catch {
      return false;
    }
  }

  /**
   * ЭРХИЙГ ҮҮРЭГТЭЙ НЬ ТААРУУЛНА — хуваарилалт ажиллах чадвартай байх ёстой.
   *
   * ДҮРЭМ: үүрэг БАЙВАЛ эрхийг олгоно. Үүрэг БАЙХГҮЙ бол — тухайн эрхийг
   * зөвхөн НЭГ Ч үүрэг үлдээгүй үед л хасна (хуваарилалт бүхэлдээ арилах).
   */
  async function syncCaps(user: string, roles: R[]): Promise<boolean> {
    if (isCodeSuper(user)) return true;
    try {
      const c = await import('./caps');
      if (!c.capsRemoteReady()) return false;
      const cur = c.capsStored(user);
      const next = new Set(cur);

      if (hasRoles) {
        const none = roles.length === 0;
        for (const [role, cap] of Object.entries(spec.roleCaps) as [R, CapKey][]) {
          if (roles.includes(role)) next.add(cap);
          else if (none) next.delete(cap);
        }
      } else if (spec.soleCap) {
        /* Үүрэггүй систем (Чанар): хуваарилалт байвал олгоно, үгүй бол хасна */
        if (roles.length === 0 && !load().some((a) => a.user === user)) next.delete(spec.soleCap);
        else next.add(spec.soleCap);
      }

      /* Өөрчлөлтгүй бол ArcGIS руу дэмий бичихгүй */
      if (next.size === cur.length && cur.every((x) => next.has(x))) return true;
      return await c.setCaps(user, [...next]);
    } catch {
      return false;
    }
  }

  /* ══════════════════════════ API ══════════════════════════ */

  const list = (): Assign<R>[] => effective();

  /**
   * REMOTE-ООС ИРСЭН хуваарилалтыг cache-д буулгана — `initRemote` дуудна.
   */
  const syncRemote = (
    rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<string>[] }[],
  ): void => {
    const byUser = new Map<string, Assign<R>>();
    for (const r of rows) {
      if (!r.user) continue;
      const user = r.user.trim().toLowerCase();

      const raw: Grant<string>[] = Array.isArray(r.grants)
        ? r.grants
        : fromLegacy<R>({ user, roles: r.roles, bagts: r.bagts }, hasRoles);

      /* Танигдахгүй үүрэг, багцгүй мөрийг хаяна — fail-closed */
      const grants = raw
        .filter((g) => g && Array.isArray(g.bagts))
        .map((g) => ({
          role: (hasRoles ? (ROLES.has(String(g.role)) ? g.role : null) : '') as R | '',
          bagts: g.bagts.filter((b) => typeof b === 'string'),
        }))
        .filter((g): g is Grant<R> => g.role !== null && g.bagts.length > 0);

      if (!grants.length) continue;
      byUser.set(user, { user, grants });
    }
    const keep = new Set<string>(failed);
    for (const u of chain.keys()) keep.add(u);
    for (const [u, t] of touched) if (_newerThanSnapshot(t)) keep.add(u);
    if (keep.size) {
      const local = new Map(load().map((a) => [a.user, a] as const));
      for (const u of keep) {
        const loc = local.get(u);
        if (loc) byUser.set(u, loc); else byUser.delete(u);
      }
    }
    remoteSynced = true;
    save([...byUser.values()]);
  };

  /**
   * Аккаунтад үүрэг ба багц олгох / шинэчлэх.
   *
   * @param grant `false` бол эрхийг ЭНД олгохгүй — багц солиход эрх аль
   *   хэдийн олгогдсон тул дахин бичих нь дэмий.
   */
  /**
   * ХУВААРИЛАЛТЫГ БҮТНЭЭР солино.
   */
  const set = (user: string, roles: R[], bagts: string[], grant = true): AclWrite => {
    const rs = saneRoles(roles);
    const grants: Grant<R>[] = hasRoles
      ? rs.map((role) => ({ role, bagts }))
      : [{ role: '' as const, bagts }];
    return setGrants(user, grants, grant);
  };

  /**
   * ҮҮРЭГ БҮРД ӨӨР БАГЦ (2026-09-09) — үржвэрийн асуудлыг шийдсэн зам.
   * «Багц 1-д зохиогч, Багц 5-д батлагч» гэж ЯГ томилно.
   */
  const setGrants = (user: string, grants: Grant<R>[], grant = true): AclWrite => {
    const u = user.trim().toLowerCase();
    if (!u) return { ok: false, error: spec.msg.noUser };
    if (isCodeSuper(u)) return { ok: false, error: spec.msg.superUser };

    /* Танигдахгүй үүрэг, багцгүй мөрийг хаяна */
    const clean = grants
      .filter((g) => g && Array.isArray(g.bagts) && g.bagts.length > 0)
      .filter((g) => (hasRoles ? ROLES.has(String(g.role)) : true))
      .map((g) => ({ role: (hasRoles ? g.role : '') as R | '', bagts: g.bagts }));

    if (hasRoles && !clean.length) {
      /* Үүрэг байсан ч багцгүй бол «багц сонго», огт үүрэггүй бол «үүрэг сонго» */
      return {
        ok: false,
        error: grants.some((g) => ROLES.has(String(g?.role)))
          ? spec.msg.noBagts
          : (spec.msg.noRole ?? spec.msg.noBagts),
      };
    }
    if (!clean.length) return { ok: false, error: spec.msg.noBagts };

    const cur = load();
    const exists = cur.some((a) => a.user === u);
    const base = cur.find((a) => a.user === u)?.grants ?? [];
    const next = exists
      ? cur.map((a) => (a.user === u ? { user: u, grants: clean } : a))
      : [...cur, { user: u, grants: clean }];
    save(next);

    /* Эрхийг олгоход БҮХ үүргийн нэгдлийг өгнө */
    const rolesAll = [...new Set(clean.map((g) => g.role))].filter((r): r is R => r !== '');
    const run = enqueue(u, async () => {
      const ok = await pushRow(u, { base, next: clean as Grant<R>[] });
      const g = grant ? await syncCaps(u, rolesAll) : true;
      return { ok, g };
    });
    const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
    const granted = run.then((r) => r.g);
    return { ok: true, sync, granted };
  };

  /**
   * Хуваарилалтаас хасах.
   *
   * @param revoke `true` (анхдагч) бол харгалзах эрхийг мөн БУЦААНА.
   *   Устгагдсан аккаунтын өнчин мөрийг цэвэрлэхэд `false`.
   */
  const removeAssign = (user: string, revoke = true): AclWrite => {
    const u = user.trim().toLowerCase();
    if (!u) return { ok: false, error: spec.msg.noUser };
    const base = load().find((a) => a.user === u)?.grants ?? [];
    save(load().filter((a) => a.user !== u));
    const run = enqueue(u, async () => {
      const ok = await pushRow(u, { base, next: [] });
      const g = revoke && !load().some((a) => a.user === u) ? await syncCaps(u, [] as R[]) : true;
      return { ok, g };
    });
    const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
    const granted = run.then((r) => r.g);
    return { ok: true, sync, granted };
  };

  /**
   * Аккаунт УСТГАХАД хуваарилалтыг бүрмөсөн арилгах.
   */
  const purge = (user: string): Promise<boolean> => {
    const u = user.trim().toLowerCase();
    if (!u) return Promise.resolve(true);
    save(load().filter((a) => a.user !== u));
    return enqueue(u, async () => {
      const ok = await pushRow(u);
      markResult(u, ok);
      return ok;
    });
  };

  /**
   * «ДАХИН ИЛГЭЭХ» · «ДАХИН ОЛГОХ» (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   */
  const retry = (user: string, grant = true): AclWrite => {
    const u = user.trim().toLowerCase();
    if (!u) return { ok: false, error: spec.msg.noUser };
    const run = enqueue(u, async () => {
      const ok = await pushRow(u);
      const a = load().find((x) => x.user === u);
      const rolesAll = a ? [...new Set(a.grants.map((g) => g.role))].filter((r): r is R => r !== '') : [];
      let g = grant && a ? await syncCaps(u, rolesAll) : true;
      if (grant && a && !isCodeSuper(u)) {
        try {
          const c = await import('./caps');
          if (c.capsRemoteReady() && c.dirtyCapKeys().includes(u)) g = (await c.setCaps(u, c.capsStored(u))) && g;
        } catch {
          g = false;
        }
      }
      return { ok, g };
    });
    const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
    const granted = run.then((r) => r.g);
    return { ok: true, sync, granted };
  };

  /**
   * Тухайн хэрэглэгчийн багцууд — ҮҮРЭГТЭЙ системд ТУХАЙН ҮҮРГЭЭР.
   *
   * Буцаах утга:
   *   · `null`  — ХЯЗГААРГҮЙ (хатуу `super`, эсвэл `ALL_BAGTS`)
   *   · `[]`    — хуваарилагдаагүй (тэр үүргээр)
   *   · `[...]` — заасан багцууд
   */
  const scope = (user: string | null | undefined, role?: R): string[] | null => {
    if (!user) return [];
    if (roleForUser(user) === 'super') return null;
    const a = effective().find((x) => x.user === user.trim().toLowerCase());
    if (!a) return [];

    const rel = hasRoles && role != null ? a.grants.filter((g) => g.role === role) : a.grants;
    if (!rel.length) return [];
    if (rel.some((g) => g.bagts.includes(ALL_BAGTS))) return null;
    return [...new Set(rel.flatMap((g) => g.bagts))];
  };

  /** Хуваарилалтыг ЯГ ХЭВЭЭР нь унших — панел засварлахад хэрэгтэй */
  const grantsOf = (user: string | null | undefined): Grant<R>[] | null => {
    if (!user) return null;
    return effective().find((x) => x.user === user.trim().toLowerCase())?.grants ?? null;
  };

  /** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
  const hasRole = (user: string | null | undefined, role: R): boolean => {
    if (!user) return false;
    if (roleForUser(user) === 'super') return true;
    const a = effective().find((x) => x.user === user.trim().toLowerCase());
    return a?.grants.some((g) => g.role === role) ?? false;
  };

  const subscribe = (fn: () => void): () => void => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(spec.event, fn);
    return () => window.removeEventListener(spec.event, fn);
  };

  return {
    list, syncRemote, failedUsers: () => [...failed],
    set, setGrants, grantsOf, remove: removeAssign, purge, retry, scope, hasRole, subscribe,
    ready: () => remoteSynced,
  };
}

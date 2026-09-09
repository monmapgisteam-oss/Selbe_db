'use client';

/**
 * БАГЦААР ХУВААРИЛАХ ACL-ИЙН ЕРӨНХИЙ ЦӨМ — гурван дэд системийн ГАНЦ эх код.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ БАЙХ ЁСТОЙ ВЭ (2026-09-09). Чанар · Хуваарь · Обьём
 * гурав нь ЯГ ИЖИЛ бүтэцтэй, ~250 мөр тус бүр, ялгаа нь ЗӨВХӨН нэр байв
 * (`huvaariAcl` ба `obyemAcl` хоёрыг тэмдэгтийн нэрээр солиод `diff` хийхэд
 * ЯЛГАА ГАРАХГҮЙ). Тэр давхардлын үнэ нь баримтжуулагдсан:
 *
 *   · `aclParity.check.mjs`-ийн толгой: «Шалгалтаар олдсон 13 алдааны 7 нь
 *     ЯГ НЭГ хэв шинжтэй байв: засвар нь ижил кодын НЭГД нь л хүрч, бусад
 *     руу хуулагдаагүй.»
 *   · 2026-09-09-нд дахин хоёр ийм алдаа олдсон: `UserAdmin.flipCap`-ийн
 *     гурван салааны ЗӨВХӨН нэгэнд `.trim()` байсан.
 *
 * `aclParity` тест нь давхардлыг ХАМГААЛДАГ болохоос АРИЛГАДАГГҮЙ. Энэ файл
 * шалтгааныг нь арилгана: нэг газар засвал гурвуулаа засагдана.
 *
 * ⚠️ `guitsetgelAcl` нь ЭНД ОРОХГҮЙ. Тэр нь ШАТТАЙ (`stage`) бөгөөд «нэг
 * аккаунт нэг шатанд» гэсэн үндсэн өөр дүрэмтэй; албадан нэгтгэвэл
 * хийсвэрлэл эвдэрч, хоёулангийнх нь логик бүрхэг болно.
 *
 * ⚠️ ХАДГАЛАЛТ нь өөрчлөгдөөгүй: `localStorage` түлхүүр, ArcGIS-ийн мөрийн
 * угтвар, JSON хэлбэр бүгд ХЭВЭЭР. Энэ бол цэвэр бүтцийн нэгтгэл —
 * өгөгдөл шилжүүлэх шаардлагагүй.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { roleForUser } from './services';
import type { CapKey } from './caps';

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

/** Нэг аккаунтын хуваарилалт. `roles` нь үүрэггүй систем (Чанар)-д хоосон. */
/**
 * НЭГ ҮҮРЭГ + ТҮҮНИЙ БАГЦУУД — хуваарилалтын БҮТЭЦ НЭГЖ (2026-09-09).
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭЛБЭР ВЭ: урьд нь `{ roles[], bagts[] }` байсан нь ҮҮРЭГ ×
 * БАГЦЫН ҮРЖВЭР үүсгэдэг байв. «Багц 1-д зохиогч, Багц 5-д батлагч» гэж
 * томилохыг оролдвол дөрвөн хослол үүсч, тэр хүн Багц 1-д БАТЛАГЧ ч болно —
 * `decidePlan` зохиогч=батлагчийг татгалздаг тул тэр багц ГАЦНА.
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
   * ⚠️ Хоосон массив БАЙХГҮЙ: мөр нь өөрөө хасагдана.
   */
  grants: Grant<R>[];
};

/** ⚠️ ХУУЧИН ХЭЛБЭР — зөвхөн УНШИХАД (2026-09-09-өөс өмнөх мөрүүд) */
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
   * ⚠️ Хуваарилалт байвал олгоно, арилвал буцаана.
   */
  soleCap?: CapKey;
  /** Алсын бичилт — `permsRemote`-ийн харгалзах хос */
  /**
   * ⚠️ `roles`/`bagts` нь ХУУЧИН клиентэд зориулсан НЭГДЭЛ, `grants` нь ҮНЭН
   *    эх сурвалж. Хоёуланг нь дамжуулна — `permsRemote` хоёуланг бичнэ.
   */
  push: (user: string, roles: R[], bagts: string[], grants: Grant<R>[]) => Promise<boolean>;
  remove: (user: string) => Promise<boolean>;
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
  /** ⚠️ Хуучин (`roles`/`bagts`) ба шинэ (`grants`) хоёуланг хүлээж авна */
  syncRemote: (
    rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<R>[] }[],
  ) => void;
  failedUsers: () => string[];
  set: (user: string, roles: R[], bagts: string[], grant?: boolean) => AclWrite;
  /** Үүрэг бүрд ӨӨР багц — `set`-ийн ерөнхий хэлбэр */
  setGrants: (user: string, grants: Grant<R>[], grant?: boolean) => AclWrite;
  /** Тухайн хэрэглэгчийн хуваарилалт (байхгүй бол `null`) */
  grantsOf: (user: string | null | undefined) => Grant<R>[] | null;
  remove: (user: string, revoke?: boolean) => AclWrite;
  purge: (user: string) => Promise<boolean>;
  /** `null` = хязгааргүй · `[]` = хуваарилагдаагүй · `[...]` = заасан багцууд */
  scope: (user: string | null | undefined, role?: R) => string[] | null;
  hasRole: (user: string | null | undefined, role: R) => boolean;
  subscribe: (fn: () => void) => () => void;
};

export function makeAcl<R extends string>(spec: AclSpec<R>): Acl<R> {
  const ROLES = new Set<string>(Object.keys(spec.roleCaps));
  const hasRoles = ROLES.size > 0;

  /** Танигдахгүй үүргийг хаяна — эвдэрсэн мөр эрх нээхгүй */
  const saneRoles = (v: unknown): R[] =>
    (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ROLES.has(x)) : []) as R[];

  let cache: Assign<R>[] | null = null;

  /**
   * ⚠️ ХУУЧИН ХЭЛБЭРИЙГ УНШИНА (2026-09-09). `localStorage` дээр өмнөх
   *    хувилбарын `{roles[], bagts[]}` мөр үлдсэн байж болно — хөрвүүлэхгүй
   *    бол `grants` нь `undefined` болж БҮХ хуваарилалт чимээгүй алга болно.
   *    Хөрвүүлэлт нь эрхийг НЭМЭХГҮЙ, ХАСАХГҮЙ (`fromLegacy`).
   */
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
    /*
     * ⚠️ `localStorage` БҮТЭЛГҮЙТЭЖ БОЛНО (2026-09-07-ны 100% аудит):
     * хувийн горим, квот дүүрэх, сайтын өгөгдөл хаасан тохиргоо — гурвуулаа
     * ШИДДЭГ. Хамгаалалтгүй бол `save` шидэж, дуудагч унаж, админы панел
     * эвдэрнэ; бүр муу нь `notify()` хүрэхгүй тул захиалагчид ХУУЧИН эрхээ
     * хараад үлдэнэ.
     * ⚠️ Санах ойн `cache` дээр аль хэдийн шинэчлэгдсэн бөгөөд алсын бичилт
     * тусдаа явдаг тул локал хадгалалт унасан ч ажиллагаа ҮРГЭЛЖИЛНЭ.
     */
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

  function enqueue<T>(u: string, fn: () => Promise<T>): Promise<T> {
    const prev = chain.get(u) ?? Promise.resolve();
    const p = prev.then(fn, fn);
    const tail = p.then(() => undefined, () => undefined);
    chain.set(u, tail);
    void tail.then(() => { if (chain.get(u) === tail) chain.delete(u); });
    return p;
  }

  /**
   * Хуваарилалтыг remote руу бичих.
   * ⚠️ Жагсаалтыг ГҮЙЦЭТГЭХ агшиндаа уншина: дараалалд хүлээх хооронд
   *    хэрэглэгч хасагдсан/дахин нэмэгдсэн бол сүүлийн байдал нь бичигдэнэ.
   */
  async function pushRow(user: string): Promise<boolean> {
    try {
      const a = load().find((x) => x.user === user);
      if (!a) return spec.remove(user);
      /*
       * ⚠️ ХУУЧИН ХЭЛБЭРИЙН НЭГДЭЛ (2026-09-09): бүх үүрэг, бүх багцыг
       *    ХАВТГАЙЛНА. Энэ нь мэдээллийг АЛДДАГ (аль үүрэг аль багцад
       *    байсныг мартана) тул зөвхөн хуучин build-ийн нөөц болгож бичнэ;
       *    `grants` нь бүтнээрээ дагалдана.
       */
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
   * ⚠️ ЗӨВХӨН ХЭРЭГТЭЙГ НЬ ХӨНДӨНӨ (2026-09-08). Урьд нь үүрэг байхгүй бол
   * `toggleCap(u, cap, false)` гэж БОЛЗОЛГҮЙ унтраадаг байв — тэр нь эрхийг
   * ЯМАР ЗАМААР олгосныг үл ялгана. Админ гараар олгосон эрхийг энэ
   * хуваарилалт чимээгүй УСТГАДАГ байлаа.
   *
   * ДҮРЭМ: үүрэг БАЙВАЛ эрхийг олгоно. Үүрэг БАЙХГҮЙ бол — тухайн эрхийг
   * зөвхөн НЭГ Ч үүрэг үлдээгүй үед л хасна (хуваарилалт бүхэлдээ арилах).
   */
  async function syncCaps(user: string, roles: R[]): Promise<boolean> {
    try {
      const c = await import('./caps');
      const cur = c.capsOf(user);
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

  const list = (): Assign<R>[] => load();

  /**
   * REMOTE-ООС ИРСЭН хуваарилалтыг cache-д буулгана — `initRemote` дуудна.
   *
   * ⚠️ REMOTE = ЭЦСИЙН ҮНЭН: энд байхгүй хэрэглэгчийн хуваарилалт ХАСАГДСАН.
   * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР: давхар мөр ирвэл СҮҮЛИЙНХ (их OBJECTID) ялна.
   * ⚠️ `trim()` (2026-09-08): remote мөрийн username-д санамсаргүй зай орвол
   *    түлхүүр нь бичилтийн талынхтай (`set` нь `trim().toLowerCase()`)
   *    ТААРАХГҮЙ болж, хуваарилалт «алга болдог» байв.
   * ⚠️ Үүрэгтэй системд үүрэггүй мөрийг АЛГАСНА — «хуваарилагдсан ч юу ч
   *    хийж чадахгүй» гэсэн утгагүй төлөв үүсгэхгүй.
   */
  const syncRemote = (
    rows: { user: string; roles?: string[]; bagts?: string[]; grants?: Grant<R>[] }[],
  ): void => {
    const byUser = new Map<string, Assign<R>>();
    for (const r of rows) {
      if (!r.user) continue;
      const user = r.user.trim().toLowerCase();

      /*
       * ⚠️ ХОЁР ХЭЛБЭР ЗЭРЭГ (2026-09-09). ArcGIS дээр хуучин
       *    `{roles[], bagts[]}` мөр үлдсэн байж болно — шинэ хэлбэрийг л
       *    уншвал тэдгээр эрх ЧИМЭЭГҮЙ алга болно. Хөрвүүлэлт нь эрхийг
       *    НЭМЭХГҮЙ, ХАСАХГҮЙ; дараагийн бичилтэд шинэ хэлбэрээр хадгалагдана.
       */
      const raw: Grant<R>[] = Array.isArray(r.grants)
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
    save([...byUser.values()]);
  };

  /**
   * Аккаунтад үүрэг ба багц олгох / шинэчлэх.
   *
   * ⚠️ Хатуу super-ийг ХУВААРИЛАХГҮЙ: түүнд хязгаар үйлчилдэггүй (`scope`
   *    `null` буцаана) тул хуваарилалт нь худал хязгаар л харуулна.
   *
   * @param grant `false` бол эрхийг ЭНД олгохгүй — багц солиход эрх аль
   *   хэдийн олгогдсон тул дахин бичих нь дэмий.
   */
  /**
   * ХУВААРИЛАЛТЫГ БҮТНЭЭР солино.
   *
   * ⚠️ Гарын үсэг нь ХЭВЭЭР (`roles[], bagts[]`) — дуудагч талд өөрчлөлт
   *    шаардахгүй. Дотроо `grants`-д хөрвүүлнэ: тэр хэлбэр нь үүрэг бүрд
   *    ӨӨР багц өгөх боломжтой (`setGrants`), энэ нь бүгдэд ижил өгнө.
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
    if (roleForUser(u) === 'super') return { ok: false, error: spec.msg.superUser };

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
    const next = exists
      ? cur.map((a) => (a.user === u ? { user: u, grants: clean } : a))
      : [...cur, { user: u, grants: clean }];
    save(next);

    /* Эрхийг олгоход БҮХ үүргийн нэгдлийг өгнө */
    const rolesAll = [...new Set(clean.map((g) => g.role))].filter((r): r is R => r !== '');
    const run = enqueue(u, async () => {
      const ok = await pushRow(u);
      const g = grant ? await syncCaps(u, rolesAll) : true;
      return { ok, g };
    });
    /*
     * ⚠️ ЭРХ ОЛГОЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08). Урьд нь `markResult(u,
     *    r.ok)` байсан тул: хуваарилалтын мөр бичигдээд `syncCaps` УНАВАЛ
     *    админд «амжилттай» гэж ХУДАЛ харагдана. Хэрэглэгч нь хуваарилагдсан
     *    ч эрхгүй тул хуудсаа ОГТ нээж чадахгүй, шалтгаан нь хаана ч
     *    бичигдэхгүй. Хасалт ба нэмэлт хоёр ижил хатуу шалгуур байх ёстой.
     */
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
    save(load().filter((a) => a.user !== u));
    const run = enqueue(u, async () => {
      const ok = await pushRow(u);
      /*
       * ⚠️ ЭРХ БУЦААЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08). Урьд нь `syncCaps`-ийн
       *    үр дүнг хаяж зөвхөн мөрийн бичилтийг буцаадаг байв: `__cap__:` мөр
       *    ArcGIS дээр ҮЛДСЭН ч `sync` нь `true` гарч, админд «амжилттай» гэж
       *    ХУДАЛ мэдээлдэг. Дараагийн `initRemote` тэр мөрийг эргүүлж татаж
       *    эрхийг СЭРГЭЭДЭГ тул хасагдсан хүн харагдацтайгаа үлддэг байлаа.
       */
      const g = revoke ? await syncCaps(u, [] as R[]) : true;
      return { ok, g };
    });
    const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
    const granted = run.then((r) => r.g);
    return { ok: true, sync, granted };
  };

  /**
   * Аккаунт УСТГАХАД хуваарилалтыг бүрмөсөн арилгах.
   * ⚠️ Эрх БУЦААХГҮЙ — аккаунт бүхэлдээ устаж байгаа тул tombstone-той
   *    уралдах ёсгүй (`purgeAssign`-тай ижил дүрэм).
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
    const a = load().find((x) => x.user === user.trim().toLowerCase());
    if (!a) return [];

    /*
     * ⚠️ ҮҮРЭГ ЗААСАН БОЛ ЗӨВХӨН ТҮҮНИЙ БАГЦУУД (2026-09-09). Урьд нь бүх
     *    үүргийн багц нэг сагсанд байсан тул «Багц 1-д зохиогч, Багц 5-д
     *    батлагч» гэсэн хүн Багц 1-д Ч БАТЛАГЧ болдог байв. Одоо grant бүр
     *    өөрийн багцтай тул хязгаар ЯГ таарна.
     * ⚠️ Үүрэг заагаагүй бол (`role` undefined) — БҮХ үүргийн НЭГДЭЛ, өөрөөр
     *    хэлбэл «энэ систем дотор ямар нэг эрхтэй багцууд».
     */
    const rel = hasRoles && role != null ? a.grants.filter((g) => g.role === role) : a.grants;
    if (!rel.length) return [];
    if (rel.some((g) => g.bagts.includes(ALL_BAGTS))) return null;
    return [...new Set(rel.flatMap((g) => g.bagts))];
  };

  /** Хуваарилалтыг ЯГ ХЭВЭЭР нь унших — панел засварлахад хэрэгтэй */
  const grantsOf = (user: string | null | undefined): Grant<R>[] | null => {
    if (!user) return null;
    return load().find((x) => x.user === user.trim().toLowerCase())?.grants ?? null;
  };

  /** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
  const hasRole = (user: string | null | undefined, role: R): boolean => {
    if (!user) return false;
    if (roleForUser(user) === 'super') return true;
    const a = load().find((x) => x.user === user.trim().toLowerCase());
    return a?.grants.some((g) => g.role === role) ?? false;
  };

  const subscribe = (fn: () => void): () => void => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(spec.event, fn);
    return () => window.removeEventListener(spec.event, fn);
  };

  return {
    list, syncRemote, failedUsers: () => [...failed],
    set, setGrants, grantsOf, remove: removeAssign, purge, scope, hasRole, subscribe,
  };
}

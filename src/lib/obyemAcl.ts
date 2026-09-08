'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН БАГЦЫН ХУВААРИЛАЛТ.
 *
 * ⚠️ `huvaariAcl.ts`-ТЭЙ ИЖИЛ БҮТЭЦ, ӨӨР АСУУЛТ (2026-09-08). Хуваарь нь
 * ОГНООГ («хэзээ»), энэ нь ОБЬЁМЫГ («хэр их») төлөвлөнө. Хоёр үүрэгтэй:
 *
 *   · ЗАСВАРЛАГЧ (`obyemEdit`)    — «Инженерийн төлөвлөсөн обьём» баганын
 *                                   нүднүүдийг засаж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ    (`obyemApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Нэг аккаунт хоёуланг нь эзэмшиж болно (жижиг багцад хэвийн), гэхдээ
 * ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй — `obyemBatlah.decideObyem` зохиогч=батлагч
 * тохиолдлыг ТАТГАЛЗАНА (UI-д биш, домэйн функцэд).
 *
 * ⚠️ ЯАГААД ГҮЙЦЭТГЭЛИЙН УРСГАЛААС (`guitsetgelAcl`) ТУСДАА ВЭ: тэнд «НЭГ
 * АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэм бий тул обьёмын батлагчийг томилохын
 * тулд түүнийг дөрвөн шатны аль нэгэнд оруулах шаардлагатай болж, тэр нь
 * ГҮЙЦЭТГЭЛ зөвшөөрөх эрх дагуулна. Төлөвлөсөн обьём бол ТӨЛӨВЛӨГӨӨ —
 * гүйцэтгэлийн хэмжилт биш, өөр хариуцлага.
 *
 * ⚠️ ЯАГААД ХУВААРИЙН (`huvaariAcl`) ЭРХИЙГ ДАХИН АШИГЛААГҮЙ ВЭ: тэр нь
 * «Хуваарь» харагдацын огноог засах эрх бөгөөс `huvaariBatlah` нь багц бүрд
 * ЗӨВХӨН НЭГ хүлээгдэж буй илгээлт зөвшөөрдөг. Обьём ба огноог нэг илгээлтэд
 * нийлүүлбэл нэг нь буцаагдахад нөгөө нь ч гацна. Мөн энэ багана нь өөр
 * ХУУДСАНД («Гүйцэтгэл бөглөх») тул харагдацын эрх ч өөр.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд `__obyem__:` угтвартай мөрөнд
 * (`__flow__:` / `__cap__:` / `__qaqc__:` / `__huvaari__:`-ийн адил). Шинэ
 * үйлчилгээ, шинэ багана хэрэггүй.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { roleForUser } from './services';

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

/** Обьёмын хоёр үүрэг */
export type ObyemRole = 'editor' | 'approver';

/** Нэг аккаунтын обьёмын хуваарилалт */
export type ObyemAssign = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  /**
   * ҮҮРГҮҮД — хоосон массив БАЙХГҮЙ (мөр нь өөрөө хасагдана).
   * ⚠️ Хоёулаа байж БОЛНО. Өөрийгөө батлахаас `decideObyem` хамгаална.
   */
  roles: ObyemRole[];
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
};

const KEY = 'selbe-obyem-acl-v1';
const EVENT = 'selbe-obyem-acl-change';

const ROLES = new Set<string>(['editor', 'approver']);
/** Танигдахгүй үүргийг хаяна — эвдэрсэн мөр эрх нээхгүй */
const saneRoles = (v: unknown): ObyemRole[] =>
  (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ROLES.has(x)) : []) as ObyemRole[];

let cache: ObyemAssign[] | null = null;

function load(): ObyemAssign[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as ObyemAssign[];
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function save(list: ObyemAssign[]): void {
  cache = list;
  /*
   * ⚠️ `localStorage` БҮТЭЛГҮЙТЭЖ БОЛНО: хувийн горим, квот дүүрэх, сайтын
   * өгөгдөл хаасан тохиргоо — гурвуулаа ШИДДЭГ. Санах ойн `cache` дээр аль
   * хэдийн шинэчлэгдсэн бөгөөд алсын бичилт тусдаа явдаг тул локал хадгалалт
   * унасан ч ажиллагаа ҮРГЭЛЖИЛНЭ. `huvaariAcl.save`-ийн ижил загвар.
   */
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
  }
  notify();
}

/** Бүх хуваарилалт — панелийн жагсаалт */
export const listObyemAssigns = (): ObyemAssign[] => load();

/**
 * REMOTE-ООС ИРСЭН хуваарилалтыг cache-д буулгана — `permissions.initRemote` дуудна.
 *
 * ⚠️ REMOTE = ЭЦСИЙН ҮНЭН: энд байхгүй хэрэглэгчийн хуваарилалт ХАСАГДСАН.
 * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР: давхар мөр ирвэл СҮҮЛИЙНХ (их OBJECTID) ялна.
 * ⚠️ Үүрэггүй мөрийг АЛГАСНА — «хуваарилагдсан ч юу ч хийж чадахгүй» гэсэн
 *    утгагүй төлөв үүсгэхгүй.
 */
export function _syncRemoteObyem(
  rows: { user: string; roles: string[]; bagts: string[] }[],
): void {
  const byUser = new Map<string, ObyemAssign>();
  for (const r of rows) {
    if (!r.user) continue;
    const roles = saneRoles(r.roles);
    if (!roles.length) continue;
    /* ⚠️ trim() (2026-09-08): remote мөрийн username-д санамсаргүй хоосон зай
       орвол түлхүүр нь бичилтийн талын (setObyemAssign нь trim().toLowerCase()
       хийдэг) түлхүүртэй ТААРАХГҮЙ болж, хуваарилалт «алга болдог» байв. */
    const user = r.user.trim().toLowerCase();
    byUser.set(user, {
      user,
      roles,
      bagts: (Array.isArray(r.bagts) ? r.bagts : []).filter((b) => typeof b === 'string'),
    });
  }
  save([...byUser.values()]);
}

/* ══════════════ Remote бичилтийн дараалал ба үр дүн ══════════════ */

const failed = new Set<string>();

function markResult(u: string, ok: boolean): void {
  const before = failed.has(u);
  if (ok) failed.delete(u); else failed.add(u);
  if (before !== failed.has(u)) notify();
}

/** Remote бичилт нь унасан хэрэглэгчид — панелийн анхааруулга */
export const obyemFailedUsers = (): string[] => [...failed];

/**
 * Нэг хэрэглэгчийн remote үйлдлүүд ДАРААЛНА.
 * ⚠️ Хасаад шууд дахин нэмэхэд хойшилсон устгалт шинэ нэмэлтийн ДАРАА
 *    буулгаж, хуваарилалтыг чимээгүй арилгадаг байв (`guitsetgelAcl`-ийн
 *    2026-08-29-ний сургамж).
 */
const chain = new Map<string, Promise<unknown>>();

function enqueue<T>(u: string, fn: () => Promise<T>): Promise<T> {
  const prev = chain.get(u) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  chain.set(u, tail);
  void tail.then(() => { if (chain.get(u) === tail) chain.delete(u); });
  return p;
}

async function pushObyem(user: string): Promise<boolean> {
  try {
    const m = await import('./permsRemote');
    const a = load().find((x) => x.user === user);
    return a ? m.obyemUpsert(a.user, a.roles, a.bagts) : m.obyemRemove(user);
  } catch {
    return false;
  }
}

/**
 * ЭРХИЙГ ҮҮРЭГТЭЙ НЬ ТААРУУЛНА — хуваарилалт нь ажиллах чадвартай байх ёстой.
 *
 * ⚠️ `obyemEdit`/`obyemApprove` эрх нь `CAP_HOST_VIEW`-ээр «Гүйцэтгэл»
 *    харагдацыг мөн нээнэ. Үүрэг хасагдвал ТЭР эрхийг буцаана — эс бөгөөс
 *    хуваарилалтаас хасагдсан хүн эрхээ хадгалж үлдэнэ.
 */
async function syncCaps(user: string, roles: ObyemRole[]): Promise<boolean> {
  try {
    const c = await import('./caps');
    /*
     * ⚠️ ЗӨВХӨН ХЭРЭГТЭЙГ НЬ ХӨНДӨНӨ (2026-09-08) — `huvaariAcl.syncCaps`-ийн
     * ижил үндэслэл. Урьд нь үүрэг байхгүй бол эрхийг БОЛЗОЛГҮЙ унтраадаг тул
     * админ гараар («Нэмэлт эрх» унтраалгаар) олгосон эрх чимээгүй УСТДАГ байв.
     * ДҮРЭМ: үүрэг байвал олгоно; үүрэг байхгүй бол зөвхөн хуваарилалт
     * БҮХЭЛДЭЭ арилах үед (`roles=[]`) хасна.
     */
    const cur = c.capsOf(user);
    const wantA = roles.includes('editor');
    const wantB = roles.includes('approver');
    const none = !wantA && !wantB;
    const next = new Set(cur);
    if (wantA) next.add('obyemEdit'); else if (none) next.delete('obyemEdit');
    if (wantB) next.add('obyemApprove'); else if (none) next.delete('obyemApprove');
    if (next.size === cur.length && cur.every((x) => next.has(x))) return true;
    return await c.setCaps(user, [...next]);
  } catch {
    return false;
  }
}

/**
 * Аккаунтад обьёмын үүрэг ба багц олгох / шинэчлэх.
 *
 * ⚠️ Хатуу super-ийг ХУВААРИЛАХГҮЙ: түүнд хязгаар үйлчилдэггүй.
 * ⚠️ Үүрэггүй болговол мөр нь ХАСАГДАНА.
 */
export function setObyemAssign(
  user: string, roles: ObyemRole[], bagts: string[], grant = true,
): { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Аккаунтын нэрээ бичнэ үү' };
  if (roleForUser(u) === 'super') {
    return { ok: false, error: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй' };
  }
  const rs = saneRoles(roles);
  if (!rs.length) return { ok: false, error: 'Дор хаяж нэг үүрэг сонгоно уу' };
  if (!bagts.length) return { ok: false, error: 'Багц сонгоно уу' };

  const list = load();
  const exists = list.some((a) => a.user === u);
  const next = exists
    ? list.map((a) => (a.user === u ? { ...a, roles: rs, bagts } : a))
    : [...list, { user: u, roles: rs, bagts }];
  save(next);

  const run = enqueue(u, async () => {
    const ok = await pushObyem(u);
    const g = grant ? await syncCaps(u, rs) : true;
    return { ok, g };
  });
  /*
   * ⚠️ ЭРХ ОЛГОЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08). remove*Assign дээр энэ
   *    алдааг зассан ч ХАСАЛТ талдаа л зассан байв. Урьд нь markResult(u, r.ok)
   *    байсан тул: хуваарилалтын мөр бичигдээд syncCaps (эрх олгох) УНАВАЛ
   *    админд «амжилттай» гэж ХУДАЛ харагдана. Хэрэглэгч нь хуваарилагдсан ч
   *    эрхгүй тул хуудсаа ОГТ нээж чадахгүй, шалтгаан нь хаана ч бичигдэхгүй.
   *    Хасалт ба нэмэлт хоёр ижил хатуу шалгуур байх ёстой.
   */
  const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
  const granted = run.then((r) => r.g);
  return { ok: true, sync, granted };
}

/**
 * Хуваарилалтаас хасах.
 *
 * @param revoke `true` (анхдагч) бол `obyemEdit` ба `obyemApprove` эрхийг мөн
 *   БУЦААНА. Устгагдсан аккаунтын өнчин мөрийг цэвэрлэхэд `false`.
 */
export function removeObyemAssign(
  user: string, revoke = true,
): { ok: boolean; sync: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  save(load().filter((a) => a.user !== u));
  const run = enqueue(u, async () => {
    const ok = await pushObyem(u);
    /*
     * ⚠️ ЭРХ БУЦААЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08) — `qaqcAcl` /
     *    `huvaariAcl`-ийн ижил засвар. Урьд нь `syncCaps`-ийн үр дүнг хаядаг
     *    тул `__cap__:` мөр ArcGIS дээр ҮЛДСЭН ч `sync` нь `true` гарч,
     *    админд «амжилттай» гэж ХУДАЛ мэдээлдэг байв. Дараагийн `initRemote`
     *    тэр мөрийг эргүүлж татаж `obyemEdit`/`obyemApprove` эрхийг
     *    СЭРГЭЭДЭГ тул хасагдсан хүн эрхээ хадгалж үлддэг.
     */
    const g = revoke ? await syncCaps(u, []) : true;
    return { ok, g };
  });
  const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
  const granted = run.then((r) => r.g);
  return { ok: true, sync, granted };
}

/**
 * Аккаунт УСТГАХАД хуваарилалтыг бүрмөсөн арилгах.
 * ⚠️ Эрх БУЦААХГҮЙ — аккаунт бүхэлдээ устаж байгаа тул tombstone-той
 *    уралдах ёсгүй.
 */
export function purgeObyemAssign(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  if (!u) return Promise.resolve(true);
  save(load().filter((a) => a.user !== u));
  return enqueue(u, async () => {
    const ok = await pushObyem(u);
    markResult(u, ok);
    return ok;
  });
}

/**
 * Тухайн хэрэглэгчийн ОБЬЁМЫН багцууд — ТУХАЙН ҮҮРГЭЭР.
 *
 * Буцаах утга:
 *   · `null`  — ХЯЗГААРГҮЙ (хатуу `super`, эсвэл `ALL_BAGTS`).
 *   · `[]`    — тэр үүргээр хуваарилагдаагүй.
 *   · `[...]` — заасан багцууд.
 *
 * ⚠️ `roleForUser` (ХАТУУ жагсаалт) л хязгааргүй болгоно — `roleOf` БИШ.
 *    Панелийн «Супер» preset нь scope-оос чөлөөлөгддөггүй.
 */
export function obyemScope(
  user: string | null | undefined, role: ObyemRole,
): string[] | null {
  if (!user) return [];
  if (roleForUser(user) === 'super') return null;
  const a = load().find((x) => x.user === user.toLowerCase());
  if (!a || !a.roles.includes(role)) return [];
  if (a.bagts.includes(ALL_BAGTS)) return null;
  return a.bagts;
}

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasObyemRole = (user: string | null | undefined, role: ObyemRole): boolean => {
  if (!user) return false;
  if (roleForUser(user) === 'super') return true;
  return load().find((x) => x.user === user.toLowerCase())?.roles.includes(role) ?? false;
};

export function subscribeObyemAcl(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

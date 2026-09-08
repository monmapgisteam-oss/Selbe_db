'use client';

/**
 * ХУВААРИЙН БАГЦЫН ХУВААРИЛАЛТ — ГҮЙЦЭТГЭЛИЙН УРСГАЛААС ТУСДАА.
 *
 * ⚠️ `qaqcAcl.ts`-ТЭЙ ИЖИЛ ШАЛТГААН, НЭГ ЯЛГААТАЙ (2026-09-07). Чанарын
 * хуваарилалт нь НЭГ үүрэгтэй («хэн бөглөх вэ»), харин хуваарь нь ХОЁР:
 *
 *   · ЗОХИОГЧ  (`plan`)        — огноог төлөвлөж, батлуулахаар илгээнэ
 *   · БАТЛАГЧ  (`planApprove`) — илгээгдсэнийг батлах / буцаах
 *
 * Тиймээс нэг аккаунт нэг мөрөнд ХОЁР үүргийн аль нэг (эсвэл хоёул) байж
 * болно. Хоёуланг нэг хүнд өгсөн ч ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй —
 * `huvaariBatlah.decidePlan` зохиогч=батлагч тохиолдлыг татгалзана.
 *
 * ⚠️ ЯАГААД УРСГАЛЫН ТОМИЛГОО (`guitsetgelAcl`) ТОХИРОХГҮЙ ВЭ: тэнд «НЭГ
 * АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэм бий тул хуваарийн батлагчийг
 * томилохын тулд түүнийг гүйцэтгэлийн дөрвөн шатны аль нэгэнд оруулах
 * шаардлагатай болж, тэр нь ГҮЙЦЭТГЭЛ зөвшөөрөх эрх дагуулна. Хуваарь бол
 * ТӨЛӨВЛӨГӨӨ — өөр асуулт, өөр хариуцлага.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд `__huvaari__:` угтвартай мөрөнд
 * (`__flow__:` / `__cap__:` / `__qaqc__:`-ийн адил). Шинэ үйлчилгээ хэрэггүй.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц.
 */

import { roleForUser } from './services';

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

/** Хуваарийн хоёр үүрэг */
export type PlanRole = 'author' | 'approver';

/** Нэг аккаунтын хуваарийн хуваарилалт */
export type HuvaariAssign = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  /**
   * ҮҮРГҮҮД — хоосон массив БАЙХГҮЙ (мөр нь өөрөө хасагдана).
   * ⚠️ Хоёулаа байж БОЛНО: жижиг багцад нэг хүн зохиож, өөр багцад батлах нь
   *    хэвийн. Өөрийгөө батлахаас `decidePlan` хамгаална.
   */
  roles: PlanRole[];
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
};

const KEY = 'selbe-huvaari-acl-v1';
const EVENT = 'selbe-huvaari-acl-change';

const ROLES = new Set<string>(['author', 'approver']);
/** Танигдахгүй үүргийг хаяна — эвдэрсэн мөр эрх нээхгүй */
const saneRoles = (v: unknown): PlanRole[] =>
  (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ROLES.has(x)) : []) as PlanRole[];

let cache: HuvaariAssign[] | null = null;

function load(): HuvaariAssign[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as HuvaariAssign[];
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function save(list: HuvaariAssign[]): void {
  cache = list;
  /*
   * ⚠️ `localStorage` БҮТЭЛГҮЙТЭЖ БОЛНО (2026-09-07-ны 100% аудит):
   * хувийн горим, квот дүүрэх, сайтын өгөгдөл хаасан тохиргоо — гурвуулаа
   * ШИДДЭГ. Хамгаалалтгүй бол `save` шидэж, дуудагч (`setAssign` г.м.)
   * унаж, админы панел эвдэрнэ; бүр муу нь `notify()` хүрэхгүй тул
   * захиалагчид ХУУЧИН эрхээ хараад үлдэнэ.
   * ⚠️ Санах ойн `cache` нь дээр аль хэдийн шинэчлэгдсэн бөгөөд алсын
   * бичилт тусдаа явдаг тул локал хадгалалт унасан ч ажиллагаа
   * ҮРГЭЛЖИЛНЭ — зөвхөн хуудас дахин ачаалахад кэш хоосон эхэлнэ.
   * `caps.ts`-ийн `save`-ийн ижил загвар.
   */
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
  }
  notify();
}

/** Бүх хуваарилалт — панелийн жагсаалт */
export const listHuvaariAssigns = (): HuvaariAssign[] => load();

/**
 * REMOTE-ООС ИРСЭН хуваарилалтыг cache-д буулгана — `permissions.initRemote` дуудна.
 *
 * ⚠️ REMOTE = ЭЦСИЙН ҮНЭН: энд байхгүй хэрэглэгчийн хуваарилалт ХАСАГДСАН.
 * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР: давхар мөр ирвэл СҮҮЛИЙНХ (их OBJECTID) ялна.
 * ⚠️ Үүрэггүй мөрийг АЛГАСНА — «хуваарилагдсан ч юу ч хийж чадахгүй» гэсэн
 *    утгагүй төлөв үүсгэхгүй.
 */
export function _syncRemoteHuvaari(
  rows: { user: string; roles: string[]; bagts: string[] }[],
): void {
  const byUser = new Map<string, HuvaariAssign>();
  for (const r of rows) {
    if (!r.user) continue;
    const roles = saneRoles(r.roles);
    if (!roles.length) continue;
    /* ⚠️ trim() (2026-09-08): remote мөрийн username-д санамсаргүй хоосон зай
       орвол түлхүүр нь бичилтийн талын (set*Assign нь trim().toLowerCase()
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
export const huvaariFailedUsers = (): string[] => [...failed];

/** Нэг хэрэглэгчийн remote үйлдлүүд ДАРААЛНА */
const chain = new Map<string, Promise<unknown>>();

function enqueue<T>(u: string, fn: () => Promise<T>): Promise<T> {
  const prev = chain.get(u) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  chain.set(u, tail);
  void tail.then(() => { if (chain.get(u) === tail) chain.delete(u); });
  return p;
}

async function pushHuvaari(user: string): Promise<boolean> {
  try {
    const m = await import('./permsRemote');
    const a = load().find((x) => x.user === user);
    return a ? m.huvaariUpsert(a.user, a.roles, a.bagts) : m.huvaariRemove(user);
  } catch {
    return false;
  }
}

/**
 * ЭРХИЙГ ҮҮРЭГТЭЙ НЬ ТААРУУЛНА — хуваарилалт нь ажиллах чадвартай байх ёстой.
 *
 * ⚠️ `plan`/`planApprove` эрх нь `CAP_HOST_VIEW`-ээр «Хуваарь» харагдацыг
 *    мөн нээнэ. Үүрэг хасагдвал ТЭР эрхийг буцаана — эс бөгөөс хуваарилалтаас
 *    хасагдсан хүн эрхээ хадгалж, бүх багцад ажиллах болно.
 */
async function syncCaps(user: string, roles: PlanRole[]): Promise<boolean> {
  try {
    const c = await import('./caps');
    const a = await c.toggleCap(user, 'plan', roles.includes('author'));
    const b = await c.toggleCap(user, 'planApprove', roles.includes('approver'));
    return a && b;
  } catch {
    return false;
  }
}

/**
 * Аккаунтад хуваарийн үүрэг ба багц олгох / шинэчлэх.
 *
 * ⚠️ Хатуу super-ийг ХУВААРИЛАХГҮЙ: түүнд хязгаар үйлчилдэггүй.
 * ⚠️ Үүрэггүй болговол мөр нь ХАСАГДАНА (`removeHuvaariAssign`-тай ижил үр дүн).
 */
export function setHuvaariAssign(
  user: string, roles: PlanRole[], bagts: string[], grant = true,
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
    const ok = await pushHuvaari(u);
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
 * @param revoke `true` (анхдагч) бол `plan` ба `planApprove` эрхийг мөн
 *   БУЦААНА. Устгагдсан аккаунтын өнчин мөрийг цэвэрлэхэд `false`.
 */
export function removeHuvaariAssign(
  user: string, revoke = true,
): { ok: boolean; sync: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  save(load().filter((a) => a.user !== u));
  const run = enqueue(u, async () => {
    const ok = await pushHuvaari(u);
    /*
     * ⚠️ ЭРХ БУЦААЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08). Урьд нь `syncCaps`-ийн
     *    үр дүнг хаяж зөвхөн мөрийн бичилтийг буцаадаг байв: `__cap__:` мөр
     *    ArcGIS дээр ҮЛДСЭН ч `sync` нь `true` гарч, админд «амжилттай» гэж
     *    ХУДАЛ мэдээлдэг. Дараагийн `initRemote` тэр мөрийг эргүүлж татаж
     *    `plan`/`planApprove` эрхийг СЭРГЭЭДЭГ тул хуваарилалтаас хасагдсан
     *    хүн «Хуваарь» харагдацтайгаа үлддэг байлаа.
     *    `qaqcAcl.removeQaqcAssign`-ийн ижил загвар.
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
 *    уралдах ёсгүй (`purgeAssign`-тай ижил дүрэм).
 */
export function purgeHuvaariAssign(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  if (!u) return Promise.resolve(true);
  save(load().filter((a) => a.user !== u));
  return enqueue(u, async () => {
    const ok = await pushHuvaari(u);
    markResult(u, ok);
    return ok;
  });
}

/**
 * Тухайн хэрэглэгчийн ХУВААРИЙН багцууд — ТУХАЙН ҮҮРГЭЭР.
 *
 * Буцаах утга:
 *   · `null`  — ХЯЗГААРГҮЙ (хатуу `super`, эсвэл `ALL_BAGTS`).
 *   · `[]`    — тэр үүргээр хуваарилагдаагүй.
 *   · `[...]` — заасан багцууд.
 */
export function huvaariScope(
  user: string | null | undefined, role: PlanRole,
): string[] | null {
  if (!user) return [];
  if (roleForUser(user) === 'super') return null;
  const a = load().find((x) => x.user === user.toLowerCase());
  if (!a || !a.roles.includes(role)) return [];
  if (a.bagts.includes(ALL_BAGTS)) return null;
  return a.bagts;
}

/** Тухайн хэрэглэгчид энэ үүрэг байгаа эсэх (багцаас үл хамааран) */
export const hasPlanRole = (user: string | null | undefined, role: PlanRole): boolean => {
  if (!user) return false;
  if (roleForUser(user) === 'super') return true;
  return load().find((x) => x.user === user.toLowerCase())?.roles.includes(role) ?? false;
};

export function subscribeHuvaariAcl(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

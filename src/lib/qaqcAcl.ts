'use client';

/**
 * ЧАНАРЫН (QAQC) БАГЦЫН ХУВААРИЛАЛТ — ГҮЙЦЭТГЭЛИЙН УРСГАЛААС БҮРЭН ТУСДАА.
 *
 * ⚠️ ЯАГААД ТУСДАА МОДУЛЬ ВЭ (2026-09-07). Урьд нь «Чанар (QAQC)» хуудас
 * багцаа `guitsetgelAcl.bagtsScope`-оос авдаг байв — өөрөөр хэлбэл урсгалын
 * ДӨРВӨН ШАТНЫ томилгооноос. Үүнээс гарах мухардал:
 *
 *   · `setAssign` нь «НЭГ АККАУНТ ЗӨВХӨН НЭГ ШАТАНД» гэсэн дүрэмтэй —
 *     чанарын хяналтын ажилтанд багц өгөхийн тулд түүнийг гүйцэтгэгч /
 *     инженер / менежер / захирлын АЛЬ НЭГЭНД томилох ёстой болдог.
 *   · Тэгмэгц тэр хүн `resolveFlowStage`-ээр гүйцэтгэлийг ЗӨВШӨӨРӨХ/БУЦААХ
 *     эрхтэй болно. Энэ нь `caps.ts`-д бичигдсэн үндсэн санааг («чанарын
 *     баримтыг гүйцэтгэгч биш, чанарын хяналтын ажилтан хөтөлнө … нэг эрхэнд
 *     нийлүүлбэл хэн юуг баталсан нь замхарна») шууд зөрчинө.
 *   · Хэрэв тэр хүн өмнө нь өөр шатанд байсан бол ТЭР ТОМИЛГОО нь чимээгүй
 *     ХАСАГДАНА — QAQC багц өгөх гэсэн үйлдэл урсгалын хяналтыг эвдэнэ.
 *   · `qaqc` эрх нь `CAP_HOST_VIEW`-ээр харагдацыг нээдэг ч багц нь урсгалаас
 *     гардаг тул хуудас нээгдээд ХООСОН үлддэг байв — эрх нь өөрөө ажиллах
 *     чадваргүй.
 *
 * Тиймээс QAQC-ийн багцын хүрээ ЭНД, өөрийн гэсэн хадгалалттай, урсгалын
 * `Stage` ойлголтод ОГТ хамааралгүй байна. Нэг хүн урсгалын дурын шатанд
 * (эсвэл ямар ч шатанд үгүй) байж, зэрэг QAQC багцтай байж чадна.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд `__qaqc__:` угтвартай мөрөнд
 * (`__flow__:` / `__cap__:`-ийн адил). Шинэ багана, шинэ үйлчилгээ хэрэггүй.
 *
 * ⚠️ FAIL-CLOSED: хуваарилагдаагүй бол `[]` — нэг ч багц. Урсгалын
 * `bagtsScope` 2026-08-28-нд яг ижил шалтгаанаар fail-closed болсон:
 * «хуваарилагдаагүй бол бүх зүйл нээлттэй» гэсэн урвуу анхдагч нь хяналтыг
 * утгагүй болгодог.
 */

import { roleForUser } from './services';

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга (урсгалынхтай ижил тэмдэг) */
export const ALL_BAGTS = '*';

/** Нэг аккаунтын чанарын багцын хуваарилалт */
export type QaqcAssign = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
};

const KEY = 'selbe-qaqc-acl-v1';
const EVENT = 'selbe-qaqc-acl-change';

let cache: QaqcAssign[] | null = null;

function load(): QaqcAssign[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as QaqcAssign[];
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function save(list: QaqcAssign[]): void {
  cache = list;
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(list));
  notify();
}

/** Бүх хуваарилалт — панелийн жагсаалт */
export const listQaqcAssigns = (): QaqcAssign[] => load();

/**
 * REMOTE-ООС ИРСЭН хуваарилалтыг cache-д буулгана — `permissions.initRemote` дуудна.
 *
 * ⚠️ REMOTE = ЭЦСИЙН ҮНЭН (`_syncRemoteAssigns`/`_syncRemoteCaps`-тэй ижил
 * дүрэм): энд байхгүй хэрэглэгчийн хуваарилалт ХАСАГДСАН гэсэн үг. Локалтай
 * нэгтгэвэл өөр админы хассан багц энэ browser дээр мөнхөд үлдэнэ.
 *
 * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР: давхар мөр ирвэл СҮҮЛИЙНХ (их OBJECTID) ялна.
 */
export function _syncRemoteQaqc(rows: { user: string; bagts: string[] }[]): void {
  const byUser = new Map<string, QaqcAssign>();
  for (const r of rows) {
    if (!r.user) continue;
    const user = r.user.toLowerCase();
    byUser.set(user, {
      user,
      bagts: (Array.isArray(r.bagts) ? r.bagts : []).filter((b) => typeof b === 'string'),
    });
  }
  save([...byUser.values()]);
}

/* ══════════════ Remote бичилтийн дараалал ба үр дүн ══════════════ */

/** ArcGIS бичилт нь СҮҮЛД унасан хэрэглэгчид (энэ сешн) — панел мөр бүрд тэмдэг */
const failed = new Set<string>();

function markResult(u: string, ok: boolean): void {
  const before = failed.has(u);
  if (ok) failed.delete(u); else failed.add(u);
  if (before !== failed.has(u)) notify();
}

/** Remote бичилт нь унасан хэрэглэгчид — панелийн анхааруулга */
export const qaqcFailedUsers = (): string[] => [...failed];

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
 * Хуваарилалтыг remote руу бичих — унавал `false`.
 * ⚠️ Жагсаалтыг ГҮЙЦЭТГЭХ агшиндаа уншина: дараалалд хүлээх хооронд хэрэглэгч
 *    хасагдсан/дахин нэмэгдсэн бол сүүлийн байдал нь бичигдэнэ.
 */
async function pushQaqc(user: string): Promise<boolean> {
  try {
    const m = await import('./permsRemote');
    const a = load().find((x) => x.user === user);
    return a ? m.qaqcUpsert(a.user, a.bagts) : m.qaqcRemove(user);
  } catch {
    return false;
  }
}

/**
 * Аккаунтад чанарын багц олгох / шинэчлэх.
 *
 * ⚠️ Хатуу super-ийг ХУВААРИЛАХГҮЙ: түүнд хязгаар үйлчилдэггүй (`qaqcScope`
 *    `null` буцаана) тул хуваарилалт нь худал хязгаар харуулаад л дуусна.
 *
 * ⚠️ Урсгалын `setAssign`-аас ЯЛГААТАЙ нь — энд ямар ч ШАТ байхгүй, тиймээс
 *    «нэг аккаунт нэг шатанд» гэсэн хасалт ч байхгүй. QAQC хуваарилалт нь
 *    хэрэглэгчийн урсгалын томилгоог ОГТ хөндөхгүй.
 *
 * @param grant `false` бол `qaqc` эрхийг ЭНД олгохгүй — багц солиход эрх аль
 *   хэдийн олгогдсон тул дахин бичих нь дэмий.
 */
export function setQaqcAssign(
  user: string, bagts: string[], grant = true,
): { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Аккаунтын нэрээ бичнэ үү' };
  if (roleForUser(u) === 'super') {
    return { ok: false, error: 'Админ (super) хуваарилалтаас үл хамаарна — бүх багц нээлттэй' };
  }
  if (!bagts.length) return { ok: false, error: 'Багц сонгоно уу' };

  const list = load();
  const exists = list.some((a) => a.user === u);
  const next = exists
    ? list.map((a) => (a.user === u ? { ...a, bagts } : a))
    : [...list, { user: u, bagts }];
  save(next);

  /*
   * ЭРХИЙГ ДАГУУЛЖ ӨГНӨ — хуваарилалт нь ажиллах чадвартай байх ёстой.
   * `qaqc` эрх нь `CAP_HOST_VIEW`-ээр «Чанар (QAQC)» харагдацыг мөн нээнэ.
   */
  const run = enqueue(u, async () => {
    const ok = await pushQaqc(u);
    let g = true;
    if (grant) {
      try {
        const c = await import('./caps');
        g = await c.toggleCap(u, 'qaqc', true);
      } catch { g = false; }
    }
    return { ok, g };
  });
  const sync = run.then((r) => { markResult(u, r.ok); return r.ok; });
  const granted = run.then((r) => r.g);
  return { ok: true, sync, granted };
}

/**
 * Хуваарилалтаас хасах.
 *
 * @param revoke `true` (анхдагч) бол `qaqc` эрхийг мөн БУЦААНА — хуваарилалтгүй
 *   эрх нь хоосон хуудас л нээдэг тул үлдээх нь утгагүй. Устгагдсан аккаунтын
 *   өнчин мөрийг цэвэрлэхэд `false` дамжуулна (эрхийн мөр аль хэдийн үгүй).
 */
export function removeQaqcAssign(
  user: string, revoke = true,
): { ok: boolean; sync: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  save(load().filter((a) => a.user !== u));
  const run = enqueue(u, async () => {
    const ok = await pushQaqc(u);
    /*
     * ⚠️ ЭРХ БУЦААЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-07-ны merge аудит).
     *    Урьд нь `catch` нь хоосон байсан тул `__cap__:` мөр ArcGIS дээр
     *    ҮЛДСЭН ч `sync` нь `true` гарч, админд «амжилттай» гэж ХУДАЛ
     *    мэдээлдэг байв. Дараагийн `initRemote` тэр мөрийг эргүүлж татаж
     *    `qaqc` эрхийг СЭРГЭЭДЭГ тул хэрэглэгч багцгүй атлаа эрхтэй
     *    үлдэж, хоосон хуудсыг мөнхөд нээдэг байлаа. Тайлбарт бичсэн
     *    «дараагийн initRemote-оор remote ялна» нь эсрэгээрээ ажиллана.
     */
    let g = true;
    if (revoke) {
      try {
        const c = await import('./caps');
        g = await c.toggleCap(u, 'qaqc', false);
      } catch { g = false; }
    }
    return { ok, g };
  });
  const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
  const granted = run.then((r) => r.g);
  return { ok: true, sync, granted };
}

/**
 * Аккаунт УСТГАХАД хуваарилалтыг бүрмөсөн арилгах.
 *
 * ⚠️ `removeQaqcAssign`-аас ялгаатай нь эрх БУЦААХГҮЙ: аккаунт бүхэлдээ
 * устгагдаж байгаа тул эрхийн бичилт tombstone-той уралдах ёсгүй
 * (`purgeAssign`-тай ижил дүрэм). Мөр үлдвэл тэр нэрийг дараа дахин нэмэхэд
 * чанарын багц нь өөрөө эргэж ирнэ.
 */
export function purgeQaqcAssign(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  if (!u) return Promise.resolve(true);
  save(load().filter((a) => a.user !== u));
  return enqueue(u, async () => {
    const ok = await pushQaqc(u);
    markResult(u, ok);
    return ok;
  });
}

/**
 * Тухайн хэрэглэгчийн ЧАНАРЫН багцууд.
 *
 * Буцаах утга:
 *   · `null`  — ХЯЗГААРГҮЙ (хатуу `super`, эсвэл `ALL_BAGTS` ил хуваарилсан).
 *   · `[]`    — хуваарилагдаагүй. Нэг ч багц харахгүй.
 *   · `[...]` — заасан багцууд.
 */
export function qaqcScope(user: string | null | undefined): string[] | null {
  if (!user) return [];
  if (roleForUser(user) === 'super') return null;
  const a = load().find((x) => x.user === user.toLowerCase());
  if (!a) return [];
  if (a.bagts.includes(ALL_BAGTS)) return null;
  return a.bagts;
}

export function subscribeQaqcAcl(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

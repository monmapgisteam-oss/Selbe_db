'use client';

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХИЙН RUNTIME STORE.
 *
 * Суурь эрх нь `services.ts`-ийн хатуу тохиргоо (`ROLE_BY_USER` + `ROLE_ACCESS`).
 * Super admin панелаас хийсэн өөрчлөлт нь ArcGIS дээрх ХУВААЛЦСАН хүснэгтэд
 * (`permsRemote.ts`) хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс ч) үйлчилнэ.
 *
 * Урсгал: нэвтрэнгүүт `initRemote()` хүснэгтээс cache-д татна → sync `resolveAccess`
 * cache-аас уншина → засвар нь cache + `localStorage` + хүснэгт рүү бичнэ.
 * ArcGIS байхгүй/алдаа бол `localStorage` cache-аар offline ажиллана.
 *
 * ⚠️ DIRTY-SET (2026-08-27): ArcGIS бичилт унасан локал өөрчлөлтийг түлхүүрээр
 * нь тэмдэглэж localStorage-д хадгална. Урьд нь `initRemote` (5 мин тутам)
 * cache-ийг remote-оор БҮХЭЛД нь дарж бичдэг байсан тул бичилт нь унасан
 * админы засвар ≤5 минутын дотор чимээгүй буцдаг байв. Одоо: initRemote бүрд
 * dirty мөрүүдийг ЭХЛЭЭД дахин бичиж үзнэ (retry) — бүтвэл цэвэрлэнэ, унавал
 * локал утгыг нь remote snapshot дээр давхарлан үлдээнэ. UserAdmin-ы
 * «ArcGIS-т хадгалагдсангүй» тэмдэг энэ dirty-set-ээс уншдаг тул ҮНЭН.
 */

import {
  ROLE_ACCESS,
  ROLE_BY_USER,
  VIEWS,
  roleForUser,
  type Role,
  type ViewKey,
} from './services';

/** Нэг хэрэглэгчийн эрх — харагдацууд ('all' = бүгд) ба ТЭЗҮ-БОНУ баримт */
export type Access = { views: ViewKey[] | 'all'; docs: boolean };

/**
 * ⚠️ `true` бол нэвтэрсэн БҮХ аккаунт бүх харагдацыг үзнэ (үүрэг/override
 * хязгаарлалт үл хэрэгсэгдэнэ). `false` — эрх/үүргийн хязгаарлалт идэвхтэй.
 * (Жагсаалтгүй бүртгэлийг `AuthGate` хэвээр denied болгоно.)
 */
const GRANT_ALL = false;

/** Панелд харуулах нэг мөр — суурь эсвэл override хэрэглэгч */
export type UserPerm = {
  username: string;
  /** Суурь үүрэг (байвал) — зөвхөн лавлагаа/preset-д */
  role: Role | null;
  views: ViewKey[] | 'all';
  docs: boolean;
  /** localStorage-д override-той юу (суурь бус) */
  overridden: boolean;
};

const KEY = 'selbe-perms-v1';
const DIRTY_KEY = 'selbe-perms-dirty-v1';
const EVENT = 'selbe-perms-change';

/**
 * ⚠️ `removed` — аккаунт УСТГАГДСАН тэмдэглэгээ (tombstone). Хатуу тохиргооны
 * (`ROLE_BY_USER`) хэрэглэгчийг кодоос хасалгүйгээр админ панелаас устгахад
 * хэрэгтэй: энгийн delete нь суурь эрхийг нь буцааж «амилуулдаг» байв.
 * Тэмдэглэгээтэй хэрэглэгч жагсаалтад гарахгүй, `hasAccess` нэвтрэлтийг нь
 * татгалзана. Панелийн «Буцаах» товч тэмдэглэгээг арилгаж суурь эрхийг сэргээнэ.
 */
type Entry = {
  views: ViewKey[] | 'all'; docs: boolean; role: Role | null; removed?: boolean;
};
type Store = Record<string, Entry>;

/**
 * ArcGIS-д хүрч ЧАДААГҮЙ локал өөрчлөлтүүд: түлхүүр → зорьсон мөр
 * (`null` = мөрийг устгах гэсэн). localStorage-д хадгалагдана — refresh
 * даваад ч retry хийгдэнэ.
 */
type DirtyMap = Record<string, Entry | null>;

/** ЗӨВ харагдацын түлхүүрүүд — бүртгэлээс автоматаар */
const VALID_VIEWS = new Set<string>(VIEWS.map((v) => v.key));

/**
 * Хадгалагдсан views-ийг ЦЭВЭРЛЭНЭ — бүртгэлээс хасагдсан түлхүүр
 * (жиш. 2026-08-27-нд хасагдсан `bagts`, `monitor`) үлдсэн бол шүүнэ.
 * ⚠️ Эс бөгөөс Root-ийн `clamp` тэр түлхүүрийг navScope-д нэвтрүүлж,
 * Portal `VIEW_BY_KEY[key]` → undefined дээр БҮХЭЛДЭЭ унадаг байв.
 */
/**
 * ХОЦРОГСДЫН ЗУРАГЛАЛ — устгагдсан харагдацын түлхүүрийг залгамжлагч руу.
 *
 * ⚠️ `sheet` («Гүйцэтгэл бөглөх») нь `guitsetgel` дотор ТАБ болж нэгдсэн.
 * Энэ зураглалгүй бол ArcGIS-т хадгалагдсан хуучин эрх нь `VALID_VIEWS`-д
 * байхгүй тул чимээгүй хасагдаж, тэр хүн гүйцэтгэлийн хуудсаа бүрмөсөн
 * алдана — эрх ЧИМЭЭГҮЙ хумигдах нь хамгийн муу төрлийн алдаа.
 */
const LEGACY_VIEW: Record<string, ViewKey> = { sheet: 'guitsetgel' };

const sanitizeViews = (v: ViewKey[] | 'all'): ViewKey[] | 'all' => {
  if (v === 'all') return 'all';
  if (!Array.isArray(v)) return [];
  const out: ViewKey[] = [];
  for (const k of v) {
    const m = LEGACY_VIEW[k as string] ?? k;
    if (VALID_VIEWS.has(m) && !out.includes(m)) out.push(m);
  }
  return out;
};

const sanitizeEntry = (e: Entry): Entry => ({ ...e, views: sanitizeViews(e.views) });

/**
 * Санах ойн CACHE — sync унших цорын ганц эх сурвалж. Эхэндээ `localStorage`-оос
 * (offline/хурдан), нэвтэрсний дараа `initRemote()`-оор ArcGIS хүснэгтээс шинэчлэгдэнэ.
 */
let cache: Store = loadLocal();

/**
 * Энэ сешнд remote хүснэгт НЭГ Ч УДАА амжилттай уншигдсан уу.
 * ⚠️ Панелаас нэмсэн (хатуу жагсаалтад байхгүй) хэрэглэгчийг ЗӨВХӨН remote
 * баталгаажсан үед л нэвтрүүлнэ — эс бөгөөс localStorage-оо гараар засаад
 * өөрийгөө нэмсэн бүртгэл нэвтэрч чаддаг байв (fail-open admission).
 */
let remoteLoaded = false;

function loadLocal(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
    const out: Store = {};
    for (const [k, e] of Object.entries(raw)) out[k] = sanitizeEntry(e);
    return out;
  } catch {
    return {};
  }
}

function saveLocal(s: Store): void {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
}

function loadDirty(): DirtyMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(DIRTY_KEY) || '{}') as DirtyMap;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveDirty(d: DirtyMap): void {
  if (typeof window !== 'undefined') localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
}

/** Бичилтийн үр дүнг dirty-set-д тусгана (ok → цэвэрлэ, унав → тэмдэглэ) */
function trackWrite(key: string, intended: Entry | null, ok: boolean): void {
  const d = loadDirty();
  if (ok) {
    if (!(key in d)) return;
    delete d[key];
  } else {
    d[key] = intended;
  }
  saveDirty(d);
  notify();
}

/** ArcGIS-т хүрээгүй өөрчлөлттэй түлхүүрүүд — UserAdmin-ы тэмдэгт */
export function dirtyKeys(): string[] {
  return Object.keys(loadDirty());
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function loadStore(): Store {
  return cache;
}

function saveStore(s: Store): void {
  cache = s;
  saveLocal(s);
  notify();
}

/** Хатуу тохиргооны ХАЛДАШГҮЙ super эсэх — tombstone-д автдаггүй (доорх тайлбар) */
const isHardSuper = (username: string): boolean => roleForUser(username) === 'super';

/**
 * DIRTY мөрүүдийг remote руу ДАХИН бичиж үзнэ.
 * Буцаана: амжилтгүй ҮЛДСЭН dirty map (дараа нь overlay хийхэд).
 */
async function retryDirtyOnce(): Promise<DirtyMap> {
  const d = loadDirty();
  const keys = Object.keys(d);
  if (!keys.length) return {};
  const m = await import('./permsRemote');
  const left: DirtyMap = {};
  for (const key of keys) {
    const intended = d[key];
    try {
      const ok = intended === null
        ? await m.remove(key)
        : await m.upsert({ username: key, role: intended.role, views: intended.views, docs: intended.docs, removed: intended.removed });
      if (!ok) left[key] = intended;
    } catch {
      left[key] = intended;
    }
  }
  saveDirty(left);
  return left;
}

/** Гараар «дахин синк» — UserAdmin-ы товчноос. Үлдсэн dirty тоог буцаана. */
export async function retryDirty(): Promise<number> {
  const left = await retryDirtyOnce();
  notify();
  return Object.keys(left).length;
}

/**
 * ArcGIS хүснэгтээс эрхийг татаж cache-д хийнэ. Super admin (`canCreate`) анх
 * дуудахад хүснэгт байхгүй бол автоматаар үүсгэнэ. Нэвтэрсний дараа дуудна.
 * ArcGIS байхгүй/алдаа бол `localStorage`-ийн cache хэвээр (offline).
 *
 * Буцаана: remote амжилттай уншигдсан эсэх (админ панел offline тэмдэг харуулна).
 *
 * ⚠️ Урсгалын томилгоог (`__flow__:` мөрүүд) мөн эндээс `guitsetgelAcl` руу
 * дамжуулна — нэг таталтаар хоёр дэд систем шинэчлэгдэнэ.
 */
export async function initRemote(canCreate: boolean): Promise<boolean> {
  const { fetchAll } = await import('./permsRemote');
  const remote = await fetchAll(canCreate);
  if (!remote) return false; // ArcGIS алга — cache хэвээр

  // 1) Унасан локал бичилтүүдийг эхлээд дахин тулгана — «локал үүрд ялна»
  //    биш, retry-then-clear: өөр админы засварыг мөнхөд дарахгүй.
  const stillDirty = await retryDirtyOnce();

  // 2) Remote snapshot + үлдсэн dirty давхарга
  const s: Store = {};
  for (const [k, r] of Object.entries(remote.perms)) {
    s[k] = sanitizeEntry({ views: r.views, docs: r.docs, role: r.role, ...(r.removed ? { removed: true } : {}) });
  }
  for (const [k, intended] of Object.entries(stillDirty)) {
    if (intended === null) delete s[k];
    else s[k] = sanitizeEntry(intended);
  }
  cache = s;
  remoteLoaded = true;
  saveLocal(s);

  // 3) Урсгалын томилгоо → guitsetgelAcl (динамик — SSR/гогцооноос сэргийлнэ)
  try {
    const acl = await import('./guitsetgelAcl');
    acl._syncRemoteAssigns(remote.flow, canCreate);
  } catch { /* урсгалын модуль ачаалагдаагүй орчинд (тест г.м.) — алгасна */ }

  // 4) Нэмэлт эрхүүд (`__cap__:`) → caps.ts
  try {
    const caps = await import('./caps');
    caps._syncRemoteCaps(remote.caps);
  } catch { /* модуль ачаалагдаагүй орчин — алгасна */ }

  notify();
  return true;
}

/** Энэ сешнд remote эрх амжилттай уншигдсан уу — админ панелийн offline тэмдэг */
export const remoteReady = (): boolean => remoteLoaded;

/** Хатуу тохиргооноос суурь эрх — override байхгүй хэрэглэгчид */
function baseline(username: string): Access | null {
  const role = roleForUser(username);
  if (!role) return null;
  const a = ROLE_ACCESS[role];
  return { views: a.views, docs: a.docs };
}

/**
 * НЭВТРЭХ ЭРХ (admission) — хэрэглэгч порталд орж чадах уу.
 *
 * ⚠️ `GRANT_ALL`-аас ХАМААРАХГҮЙ: хатуу жагсаалт ЭСВЭЛ панелаас нэмсэн (store)
 * хэрэглэгч л нэвтэрнэ. Аль алинд байхгүй бол `AuthGate` татгалзана.
 *
 * ⚠️ Store-д тулгуурласан нэвтрэлт ЗӨВХӨН `remoteLoaded` үед: localStorage-оо
 * гараар засаад өөрийгөө нэмсэн бүртгэл remote-д байхгүй тул нэвтрэхгүй.
 *
 * ⚠️ Хатуу тохиргооны SUPER нь tombstone-д АВТАХГҮЙ: хуваалцсан хүснэгт org
 * доторхи бичих эрхтэй хэн бүхэнд нээлттэй тул `removed` мөр бичээд бүх
 * админыг түгжих боломжтой байв. Super-ийг хасах цорын ганц зам = код
 * (`ROLE_BY_USER`) өөрчлөх. Панел ч super дээр «Устгах» товч гаргахгүй.
 */
export function hasAccess(username?: string | null): boolean {
  if (!username) return false;
  if (isHardSuper(username)) return true;
  // ⚠️ Тombstone-ыг ХАМГИЙН ТҮРҮҮНД: устгагдсан аккаунт хатуу жагсаалтад
  //    байсан ч нэвтрэхгүй — эс бөгөөс «устгах» нь зөвхөн нүднээс далдлаад
  //    нэвтрэлтэд нөлөөгүй худал аюулгүй байдал болно.
  const ov = loadStore()[username.toLowerCase()];
  if (ov?.removed) return false;
  if (roleForUser(username)) return true;
  return remoteLoaded && !!ov;
}

/**
 * Нэвтэрсэн хэрэглэгчийн эцсийн эрх: override байвал түүнийг, эс бөгөөс хатуу
 * суурийг. Аль нь ч байхгүй бол `null` (нэвтрэх эрхгүй).
 */
export function resolveAccess(username?: string | null): Access | null {
  if (!username) return null;
  const ov = loadStore()[username.toLowerCase()];
  // Устгагдсан аккаунт — GRANT_ALL ч эрх өгөхгүй. Хатуу super халдашгүй.
  if (ov?.removed) return isHardSuper(username) ? baseline(username) : null;
  // ТҮР: бүх нэвтэрсэн аккаунт бүх эрхтэй
  if (GRANT_ALL) return { views: 'all', docs: true };
  if (ov) return { views: ov.views, docs: ov.docs };
  return baseline(username);
}

/**
 * ХЭРЭГЛЭГЧИЙН ИДЭВХТЭЙ ҮҮРЭГ — override-ын role, эс бөгөөс хатуу тохиргоо.
 *
 * ⚠️ 2026-08-27: урьд нь `AuthGate` зөвхөн `roleForUser` (хатуу жагсаалт)
 * хэрэглэдэг байсан тул панелаас нэмсэн урсгалын аккаунтын `role` нь `null`
 * үлдэж, «Гүйцэтгэлийн хяналт» дээр ШАТ СОНГОГЧ нээлттэй болдог байв — тэр
 * хүн инженер/менежер/ерөнхий шатыг дураараа сольж ӨӨРИЙН ажлаа ӨӨРӨӨ
 * батлах боломжтой. Одоо энэ функц үүргийн ГАНЦ эх сурвалж.
 */
export function roleOf(username?: string | null): Role | null {
  if (!username) return null;
  const ov = loadStore()[username.toLowerCase()];
  if (ov?.removed) return isHardSuper(username) ? 'super' : null;
  return ov?.role ?? roleForUser(username);
}

/** Панелийн жагсаалт — хатуу тохиргооны бүх хэрэглэгч + override-той шинэ хэрэглэгч */
export function listUsers(): UserPerm[] {
  const store = loadStore();
  const rows = new Map<string, UserPerm>();

  // 1) Хатуу тохиргооны хэрэглэгчид
  for (const [uname, role] of Object.entries(ROLE_BY_USER)) {
    const a = ROLE_ACCESS[role];
    rows.set(uname.toLowerCase(), {
      username: uname,
      role,
      views: a.views,
      docs: a.docs,
      overridden: false,
    });
  }
  // 2) Override — суурийг дарж бичих, шинэ хэрэглэгч нэмэх; устгагдсан нь нуугдана
  //    (халдашгүй super-ээс бусад нь — түүнд tombstone үйлчлэхгүй тул суурь нь үлдэнэ)
  for (const [uname, ov] of Object.entries(store)) {
    if (ov.removed) {
      if (!isHardSuper(uname)) rows.delete(uname.toLowerCase());
      continue;
    }
    const existing = rows.get(uname.toLowerCase());
    rows.set(uname.toLowerCase(), {
      username: existing?.username ?? uname,
      role: ov.role ?? existing?.role ?? null,
      views: ov.views,
      docs: ov.docs,
      overridden: true,
    });
  }
  return [...rows.values()].sort((a, b) => a.username.localeCompare(b.username));
}

/** УСТГАГДСАН аккаунтууд — панелийн «Буцаах» жагсаалтад (халдашгүй super орохгүй) */
export function listRemoved(): string[] {
  return Object.entries(loadStore())
    .filter(([k, v]) => v.removed && !isHardSuper(k))
    .map(([k]) => k)
    .sort();
}

/**
 * Аккаунтыг УСТГАХ.
 * · Хатуу тохиргоотой (`ROLE_BY_USER`) хэрэглэгч — tombstone бичнэ (жагсаалтаас
 *   нуугдаж, нэвтрэлт нь татгалзагдана; «Буцаах»-аар сэргээгдэнэ).
 * · Панелаас нэмсэн хэрэглэгч — мөрийг бүрмөсөн арилгана (`clearOverride`-той ижил).
 * · Хатуу SUPER — ТАТГАЛЗАНА: код өөрчлөхөөс өөр замаар super хасагдахгүй.
 */
export function removeUser(username: string): Promise<boolean> {
  if (isHardSuper(username)) return Promise.resolve(false);
  const key = username.toLowerCase();
  if (roleForUser(username)) {
    const entry: Entry = { views: [], docs: false, role: null, removed: true };
    const store = { ...loadStore() };
    store[key] = entry;
    saveStore(store);
    return import('./permsRemote')
      .then((m) => m.upsert({ username, role: null, views: [], docs: false, removed: true }))
      .catch(() => false)
      .then((ok) => { trackWrite(key, entry, ok); return ok; });
  }
  return clearOverride(username);
}

/**
 * Хэрэглэгчийн эрхийг хадгалах (override) — cache + localStorage + ArcGIS хүснэгт.
 * ⚠️ ArcGIS бичилтийн үр дүнг (амжилттай эсэх) promise-оор буцаана — `false`
 * бол өөрчлөлт зөвхөн энэ browser-т үлдсэн гэсэн үг: dirty-set-д тэмдэглэгдэж,
 * дараагийн `initRemote`/`retryDirty` дээр автоматаар дахин бичигдэнэ.
 */
export function setUser(username: string, access: Access, role: Role | null = null): Promise<boolean> {
  const key = username.toLowerCase();
  const entry: Entry = { views: sanitizeViews(access.views), docs: access.docs, role };
  const store = { ...loadStore() };
  store[key] = entry;
  saveStore(store);
  return import('./permsRemote')
    .then((m) => m.upsert({ username, role, views: entry.views, docs: entry.docs }))
    .catch(() => false)
    .then((ok) => { trackWrite(key, entry, ok); return ok; });
}

/** Override-ыг устгах — cache + localStorage + ArcGIS хүснэгтээс. Үр дүн: setUser-тэй адил. */
export function clearOverride(username: string): Promise<boolean> {
  const key = username.toLowerCase();
  const store = { ...loadStore() };
  delete store[key];
  saveStore(store);
  return import('./permsRemote')
    .then((m) => m.remove(username))
    .catch(() => false)
    .then((ok) => { trackWrite(key, null, ok); return ok; });
}

/** localStorage/өөр таб дахь өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribe(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== DIRTY_KEY) return;
    // ⚠️ Өөр табын бичилтийг cache-д ЗААВАЛ татна — урьд нь зөвхөн fn()
    //    дуудаад cache хуучнаараа үлдэж, дахин зурсан UI хуучин эрхийг
    //    харуулсаар байв.
    cache = loadLocal();
    fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

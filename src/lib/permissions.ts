'use client';

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХИЙН RUNTIME STORE.
 *
 * Суурь эрх нь `services.ts`-ийн хатуу тохиргоо (`ROLE_BY_USER` + `ROLE_ACCESS`).
 * Super admin панелаас хийсэн өөрчлөлт нь ArcGIS дээрх ХУВААЛЦСАН хүснэгтэд
 * (`permsRemote.ts`) хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс ч) үйлчилнэ.
 *
 * Урсгал: нэвтрэнгүүт `initRemote` хүснэгтээс cache-д татна → sync `resolveAccess`
 * cache-аас уншина → засвар нь cache + `localStorage` + хүснэгт рүү бичнэ.
 * ArcGIS байхгүй/алдаа бол `localStorage` cache-аар offline ажиллана.
 */

import {
  ROLE_ACCESS,
  ROLE_BY_USER,
  VIEWS,
  roleForUser,
  isCodeSuper,
  BOOTSTRAP_SUPER,
  tableSuperUsers,
  _markTableSuper,
  _setTableSupers,
  type Role,
  type ViewKey,
} from './services';
import { capViewsOf, capsRemoteReady, capsStored, hasCap, isWorkflowView, UNSAFE_KEY } from './caps';
import { NEW_ACCOUNT_ROLE, _typesMark, roleAccess } from './roleTypes';
import { currentUser, requireCap } from './who';
import { _beginRemoteFetch, _newerThanSnapshot, _touchSeq } from './scopedAcl';
import { _setRoleReader, stageOfUser } from './guitsetgelAcl';
import type { SysState } from './permsRemote';

/** Нэг хэрэглэгчийн эрх — харагдацууд ('all' = бүгд) ба ТЭЗҮ-БОНУ баримт */
export type Access = { views: ViewKey[] | 'all'; docs: boolean };

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

type Entry = {
  views: ViewKey[] | 'all'; docs: boolean; role: Role | null; removed?: boolean;
};
type Store = Record<string, Entry>;

/**
 * ArcGIS-д хүрч ЧАДААГҮЙ локал өөрчлөлтүүд: түлхүүр → зорьсон мөр
 * (`e`, `null` = мөрийг устгах гэсэн) + бичсэн хүн (`by`). localStorage-д
 * хадгалагдана — refresh даваад ч «Дахин синк»-ээр retry хийгдэнэ.
 */
type DirtyItem = { by: string; e: Entry | null; revive?: boolean };
type DirtyMap = Record<string, DirtyItem>;

/**
 * ЭНЭ СЕШНД (JS runtime) бичилт нь унаж dirty-д орсон түлхүүрүүд → зорьсон
 * утгын JSON.
 */
const mine = new Map<string, string>();
const ser = (e: Entry | null): string => JSON.stringify(e);

/**
 * НЭГ ТҮЛХҮҮРИЙН remote бичилтүүд ДАРААЛНА (2026-09-25, аудитын засвар).
 */
const chain = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chain.get(key) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  chain.set(key, tail);
  void tail.then(() => { if (chain.get(key) === tail) chain.delete(key); });
  return p;
}

const touched = new Map<string, number>();
/** Дуусаагүй хэрэглэгчийн бичилтийн тоо (түлхүүрээр) — snapshot-оос ӨМНӨ эхэлсэн ч дуусаагүйг хамгаална */
const writing = new Map<string, number>();
function serialWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  touched.set(key, _touchSeq());
  writing.set(key, (writing.get(key) ?? 0) + 1);
  const p = serial(key, fn);
  const done = (): void => {
    touched.set(key, _touchSeq());
    const n = (writing.get(key) ?? 1) - 1;
    if (n > 0) writing.set(key, n); else writing.delete(key);
  };
  void p.then(done, done);
  return p;
}

/** ЗӨВ харагдацын түлхүүрүүд — бүртгэлээс автоматаар */
const VALID_VIEWS = new Set<string>(VIEWS.map((v) => v.key));

/**
 * Хадгалагдсан views-ийг ЦЭВЭРЛЭНЭ — бүртгэлээс хасагдсан түлхүүр
 * (жиш. 2026-08-27-нд хасагдсан `bagts`, `monitor`) үлдсэн бол шүүнэ.
 */
/**
 * ХОЦРОГСДЫН ЗУРАГЛАЛ — устгагдсан харагдацын түлхүүрийг залгамжлагч руу.
 */
const LEGACY_VIEW: Record<string, ViewKey> = {
  sheet: 'guitsetgel',
  tsogts: 'pkgProg',
};

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

const VALID_ROLES = new Set<string>(Object.keys(ROLE_ACCESS));
const unknownRole = (raw: string | null): Role | null =>
  raw && raw.trim() && raw.length <= 32 && !VALID_ROLES.has(raw) && !UNSAFE_KEY.has(raw) ? (raw as Role) : null;
const sanitizeEntry = (e: Entry): Entry => ({
  ...e,
  views: sanitizeViews(e.views),
  role: e.role && VALID_ROLES.has(e.role) ? e.role : null,
});

/**
 * Санах ойн CACHE — sync унших цорын ганц эх сурвалж. Эхэндээ `localStorage`-оос
 * (offline/хурдан), нэвтэрсний дараа `initRemote()`-оор ArcGIS хүснэгтээс шинэчлэгдэнэ.
 */
let cache: Store = loadLocal();

/**
 * Энэ сешнд remote хүснэгт НЭГ Ч УДАА амжилттай уншигдсан уу.
 */
let remoteLoaded = false;

function loadLocal(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
    const out: Store = {};
    for (const [k, e] of Object.entries(raw)) if (!UNSAFE_KEY.has(k)) out[k] = sanitizeEntry(e);
    return out;
  } catch {
    return {};
  }
}

function saveLocal(s: Store): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* хувийн горим / квот дүүрсэн — алсын эх сурвалж хэвээр */ }
}

function loadDirty(): DirtyMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(DIRTY_KEY) || '{}') as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return {};
    const out: DirtyMap = {};
    for (const [k, v] of Object.entries(raw)) {
      if (UNSAFE_KEY.has(k)) continue;
      const item = v && typeof v === 'object' && 'e' in v && 'by' in v
        ? (v as DirtyItem)
        : { by: '', e: (v ?? null) as Entry | null };
      out[k] = {
        by: typeof item.by === 'string' ? item.by : '',
        e: item.e ?? null,
        ...(item.revive === true ? { revive: true } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function saveDirty(d: DirtyMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  } catch { /* хувийн горим / квот дүүрсэн */ }
}

/** Бичилтийн үр дүнг dirty-set-д тусгана (ok → цэвэрлэ, унав → тэмдэглэ) */
function trackWrite(key: string, intended: Entry | null, ok: boolean, revive = false): void {
  const d = loadDirty();
  if (ok) {
    mine.delete(key);
    if (!(key in d)) return;
    delete d[key];
  } else {
    d[key] = { by: currentUser() ?? '', e: intended, ...(revive ? { revive: true } : {}) };
    mine.set(key, ser(intended));
  }
  saveDirty(d);
  notify();
}

/** ArcGIS-т хүрээгүй өөрчлөлттэй түлхүүрүүд — UserAdmin-ы тэмдэгт */
export function dirtyKeys(): string[] {
  return Object.keys(loadDirty());
}

/**
 * ЭНЭ СЕШНД ҮҮСЭЭГҮЙ dirty мөрүүд (2026-09-25) — «Дахин синк» бичихээс өмнө
 * ИЛ баталгаажуулахад. `by` нь localStorage-оос — баталгаагүй лавлагаа.
 */
export function foreignDirty(): { key: string; by: string; role: Role | null }[] {
  return Object.entries(loadDirty())
    .filter(([k, v]) => mine.get(k) !== ser(v.e))
    .map(([key, v]) => ({ key, by: v.by, role: v.e && !v.e.removed ? v.e.role ?? null : null }));
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function loadStore(): Store {
  return cache;
}

/** Кэшийн super мөрүүд (устгагдаагүй `role:'super'`) — `roles._setTableSupers`-д (2026-10-21) */
const supersIn = (s: Store): string[] =>
  Object.entries(s).filter(([, r]) => r && !r.removed && r.role === 'super').map(([u]) => u);

function saveStore(s: Store): void {
  cache = s;
  saveLocal(s);
  notify();
}

/**
 * SUPER эсэх — tombstone-д автдаггүй (доорх тайлбар).
 */
const isHardSuper = (username: string): boolean => roleForUser(username) === 'super';

/**
 * Нэвтэрсэн хэрэглэгч ЗӨВХӨН АНХНЫ АДМИНААР super (`roles.BOOTSTRAP_SUPER` — хүснэгт уншигдсан, super мөргүй) бол
 * түүний түлхүүр, үгүй бол `null` — `setUser`-ийн «өөрийн мөрөө эхэлж бич» дүрэмд (2026-10-21).
 */
const bootstrapOnlySuper = (): string | null => {
  const me = (currentUser() ?? '').trim().toLowerCase();
  if (!me || me !== BOOTSTRAP_SUPER.toLowerCase()) return null;
  const sup = tableSuperUsers();
  return sup && sup.length === 0 ? me : null;
};

/**
 * Dirty тэмдгийг арилгана — ЗӨВХӨН утга нь хэвээр (`want`) бол (хооронд нь шинэ бичилт орсон бол
 * тэр нь өөрөө тэмдэглэгдэнэ). 2026-10-09 (аудит №6): remote-д tombstone олдоход retry ба
 * `setUser` хоёулаа энэ замаар хаяна — `mine`-ээс ч хасна, эс бөгөөс `mineDirty` давхарлана.
 */
function dropDirty(key: string, want: string): void {
  const now = loadDirty();
  if (now[key] && ser(now[key].e) === want) {
    delete now[key];
    saveDirty(now);
  }
  if (mine.get(key) === want) mine.delete(key);
}

/**
 * DIRTY мөрүүдийг remote руу ДАХИН бичиж үзнэ.
 * Буцаана: энэ удаад АМЖИЛТТАЙ бичигдсэн түлхүүр → утга (cache-д тусгахад).
 *
 * @param onlyMine `true` бол ЗӨВХӨН энэ runtime-д үүссэн, өөрчлөгдөөгүй мөр
 *   (`mine`-ийн тайлбар) — автомат зам (`initRemote`). `false` — бүгд, зөвхөн
 *   админы ИЛ «Дахин синк»-ээс.
 */
async function retryDirtyOnce(onlyMine: boolean): Promise<Record<string, Entry | null>> {
  const done: Record<string, Entry | null> = {};
  const keys = Object.keys(loadDirty());
  if (!keys.length) return done;
  let m: typeof import('./permsRemote');
  try {
    m = await import('./permsRemote');
  } catch {
    return done; // модуль ачаалагдсангүй — бүгд dirty хэвээр
  }
  for (const key of keys) {
    await serial(key, async () => {
      const item = loadDirty()[key];
      if (!item) return; // хооронд нь амжилттай хадгалагдсан
      const want = ser(item.e);
      if (onlyMine && mine.get(key) !== want) return;
      const e = item.e;
      if (e && e.role === 'super' && !e.removed && mine.get(key) !== want) {
        dropDirty(key, want);
        console.warn(`[selbe] «${key}»: өмнөх сешний super олголтыг илгээсэнгүй — шаардлагатай бол самбараас дахин олгоно уу`);
        return;
      }
      const revive = item.revive === true && !e?.removed;
      let rawRole: string | null = null;
      if (!e?.removed && !revive && !isCodeSuper(key)) {
        let fresh: Awaited<ReturnType<typeof m.userRead>> = null;
        try { fresh = await m.userRead(key); } catch { fresh = null; }
        if (!fresh) return; // уншиж чадсангүй — dirty хэвээр, дараагийн retry
        rawRole = typeof fresh.row?.role === 'string' ? fresh.row.role : null;
        if (fresh.row?.removed) {
          dropDirty(key, want);
          done[key] = sanitizeEntry({ views: [], docs: false, role: null, removed: true });
          console.warn(`[selbe] «${key}» remote-д устгагдсан — хүлээгдэж буй локал засварыг хаяв (tombstone хэвээр)`);
          return;
        }
      }
      let ok = false;
      try {
        ok = e === null
          ? await m.remove(key)
          : await m.upsert({ username: key, role: e.role ?? (e.removed ? null : unknownRole(rawRole)), views: e.views, docs: e.docs, removed: e.removed });
      } catch {
        ok = false;
      }
      if (!ok) return;
      const now = loadDirty();
      if (now[key] && ser(now[key].e) === want) {
        delete now[key];
        saveDirty(now);
      }
      if (mine.get(key) === want) mine.delete(key);
      done[key] = e;
      _markTableSuper(key, !!e && e.role === 'super' && !e.removed);
    });
  }
  return done;
}

/** Remote руу бичигдсэн утгуудыг cache дээр тусгана (дараалалд бичилт хүлээж буйг алгасна) */
function applyDone(s: Store, done: Record<string, Entry | null>): void {
  for (const [k, e] of Object.entries(done)) {
    if (chain.has(k)) continue; // шинэ бичилт хүлээгдэж байна — локал утга нь илүү шинэ
    if (e === null) delete s[k];
    else s[k] = sanitizeEntry(e);
  }
}

/** ЭНЭ runtime-д үүссэн, одоо ч dirty мөрүүд — snapshot дээр давхарлана */
function mineDirty(): Record<string, Entry | null> {
  const out: Record<string, Entry | null> = {};
  for (const [k, v] of Object.entries(loadDirty())) {
    if (mine.get(k) === ser(v.e)) out[k] = v.e;
  }
  return out;
}

/**
 * Гараар «дахин синк» — UserAdmin-ы товчноос. Үлдсэн dirty тоог буцаана.
 * @param onlyMine `true` — админ өмнөх сешний мөрийг бичихийг ЗӨВШӨӨРӨӨГҮЙ үед
 */
export async function retryDirty(onlyMine = false): Promise<number> {
  const done = await retryDirtyOnce(onlyMine);
  if (Object.keys(done).length) {
    const s = { ...loadStore() };
    applyDone(s, done);
    cache = s;
    saveLocal(s);
  }
  notify();
  return Object.keys(loadDirty()).length;
}

/**
 * ArcGIS хүснэгтээс эрхийг татаж cache-д хийнэ. Super admin (`canCreate`) анх
 * дуудахад хүснэгт байхгүй бол автоматаар үүсгэнэ. Нэвтэрсний дараа дуудна.
 * ArcGIS байхгүй/алдаа бол `localStorage`-ийн cache хэвээр (offline).
 *
 * Буцаана: remote амжилттай уншигдсан эсэх (админ панел offline тэмдэг харуулна).
 */
/**
 * @param canCreate хүснэгт байхгүй бол үүсгэх эрх (зөвхөн нэвтрэх агшны хатуу super)
 * @param trusted  dirty-set-ийг дахин илгээж, давхарлах эрх (хатуу super-ийн сешн).
 */
export async function initRemote(canCreate: boolean, trusted: boolean = canCreate): Promise<boolean> {
  const fetched = _beginRemoteFetch();
  try {
    return await initRemoteInner(canCreate, trusted);
  } finally {
    fetched();
  }
}

async function initRemoteInner(canCreate: boolean, trusted: boolean): Promise<boolean> {
  const { fetchAll } = await import('./permsRemote');
  const typesMark = _typesMark();
  const remote = await fetchAll(canCreate);
  if (!remote) return false; // ArcGIS алга — cache хэвээр
  malformedRows = remote.malformed ?? [];

  // 1) Унасан локал бичилтүүдийг эхлээд дахин тулгана — «локал үүрд ялна»
  //    биш, retry-then-clear: өөр админы засварыг мөнхөд дарахгүй.
  const done = trusted ? await retryDirtyOnce(true) : {};

  // 2) Remote snapshot + дөнгөж бичигдсэн + үлдсэн (энэ runtime-ийн) dirty давхарга
  const s: Store = {};
  for (const [k, r] of Object.entries(remote.perms)) {
    s[k] = sanitizeEntry({ views: r.views, docs: r.docs, role: r.role, ...(r.removed ? { removed: true } : {}) });
  }
  applyDone(s, done);
  const conf: Store = { ...s };
  const dirtyNow = trusted ? mineDirty() : {};
  if (trusted) {
    for (const [k, intended] of Object.entries(dirtyNow)) {
      if (intended === null) delete s[k];
      else s[k] = sanitizeEntry(intended);
    }
  }
  const keep = new Set<string>(writing.keys());
  for (const [k, t] of touched) if (_newerThanSnapshot(t)) keep.add(k);
  for (const k of keep) {
    const loc = cache[k];
    if (loc) s[k] = loc; else delete s[k];
  }
  cache = s;
  remoteLoaded = true;
  const prevSup = tableSuperUsers();
  const sup = new Set(supersIn(conf));
  for (const [k, intended] of Object.entries(dirtyNow)) {
    if (!intended || intended.role !== 'super' || intended.removed) sup.delete(k);
  }
  if (prevSup) {
    /* явж буй / snapshot-ын дараах түлхүүр — `setUser` · retry-гийн тавьсан тэмдгийг хадгална */
    const prev = new Set(prevSup);
    for (const k of keep) { if (prev.has(k)) sup.add(k); else sup.delete(k); }
  }
  _setTableSupers(sup);
  saveLocal(s);

  // 3) Урсгалын томилгоо → guitsetgelAcl (динамик — SSR/гогцооноос сэргийлнэ)
  try {
    const acl = await import('./guitsetgelAcl');
    acl._syncRemoteAssigns(remote.flow);
  } catch (e) {
    console.error('[selbe] урсгалын томилгооны синк амжилтгүй:', e);
  }

  // 4) Нэмэлт эрхүүд (`__cap__:`) → caps.ts
  try {
    const caps = await import('./caps');
    caps._syncRemoteCaps(remote.caps, trusted);
  } catch (e) {
    console.error('[selbe] нэмэлт эрхийн (caps) синк амжилтгүй:', e);
  }

  // 5) 2026-10-23: Чанарын (QAQC) хуваарилалт (`__qaqc__:`) ХАСАГДСАН — «Чанар (QAQC)» системээс устсан.

  // 6) Хуваарийн хуваарилалт (`__huvaari__:`) → huvaariAcl.ts
  try {
    const hv = await import('./huvaariAcl');
    hv._syncRemoteHuvaari(remote.huvaari);
  } catch (e) {
    console.error('[selbe] хуваарийн хуваарилалтын синк амжилтгүй:', e);
  }

  // 7) Инженерийн төлөвлөсөн обьёмын хуваарилалт (`__obyem__:`) → obyemAcl.ts
  try {
    const ob = await import('./obyemAcl');
    ob._syncRemoteObyem(remote.obyem);
  } catch (e) {
    console.error('[selbe] обьёмын хуваарилалтын синк амжилтгүй:', e);
  }

  // 8) Чанарын баримтын хуваарилалт (`__chanar__:`) → chanarAcl.ts
  try {
    const ch = await import('./chanarAcl');
    ch._syncRemoteChanar(remote.chanar ?? []);
  } catch (e) {
    console.error('[selbe] чанарын баримтын хуваарилалтын синк амжилтгүй:', e);
  }

  // 9) Нэмэлт ажлын хуваарилалт (`__ajil__:`) → ajilAcl.ts
  try {
    const aj = await import('./ajilAcl');
    aj._syncRemoteAjil(remote.ajil ?? []);
  } catch (e) {
    console.error('[selbe] нэмэлт ажлын хуваарилалтын синк амжилтгүй:', e);
  }

  // 10) Дэд бүтцийн засварын хуваарилалт (`__butets__:`) → butetsAcl.ts
  try {
    const bt = await import('./butetsAcl');
    bt._syncRemoteButets(remote.butets ?? []);
  } catch (e) {
    console.error('[selbe] дэд бүтцийн засварын хуваарилалтын синк амжилтгүй:', e);
  }

  // 11) Эрхийн төрлийн загвар (`__type__:`) → roleTypes.ts (2026-09-25)
  try {
    const rt = await import('./roleTypes');
    rt._syncRemoteTypes(remote.types ?? [], typesMark);
  } catch (e) {
    console.error('[selbe] эрхийн төрлийн загварын синк амжилтгүй:', e);
  }

  // 11б) 2026-10-26: «Хуваарь харах» хүрээний уншигч (`_setHuvaariViewReader`) — модуль ачаалагдахдаа бүртгэнэ.
  //      ACL-ууд (6–10) ба загвар (11) синклэгдсэний ДАРАА — эс бөгөөс хоосон хүрээгээр «Хуваарь» хаалттай үлдэнэ (fail-closed).
  try {
    await import('./huvaariView');
  } catch (e) {
    console.error('[selbe] хуваарь харах хүрээний модуль ачаалагдсангүй:', e);
  }

  // 12) «Систем түр хаах» төлөв (`__sys__:maintenance`, 2026-10-19)
  _syncRemoteSys(remote.sys ?? null);

  notify();
  return true;
}

/** Энэ сешнд remote эрх амжилттай уншигдсан уу — админ панелийн offline тэмдэг */
export const remoteReady = (): boolean => remoteLoaded;

/**
 * ЭРХИЙН ХҮСНЭГТИЙН ЗАДЛАГДААГҮЙ МӨРҮҮД (2026-10-19, аудит) — сүүлийн амжилттай `initRemote`-ийн.
 */
let malformedRows: import('./permsRemote').MalformedRow[] = [];
export const remoteMalformed = (): readonly import('./permsRemote').MalformedRow[] => malformedRows;

/* ═══════════════ СИСТЕМ ТҮР ХААХ (maintenance) — 2026-10-19 ═══════════════
 * Нийслэлийн дата төв рүү шилжих үед порталыг түр хаана. Төлөв нь эрхийн хүснэгтийн `__sys__:maintenance`
 * мөрөнд (байгууллагад хуваалцсан, статик сайт сервергүй) — `initRemote` бүрд (нэвтрэх · 5 мин · таб идэвхжих ·
 * хаалттай хэрэглэгчид 30 с) уншигдана.
 */
let sysState: SysState | null = null;

const sysSig = (x: SysState | null): string => (x ? JSON.stringify([x.on, x.note ?? '', x.until ?? '', x.by, x.at]) : '');

/** Remote-оос уншсан төлөвийг тусгана — `initRemoteInner` ба шалгуур (`*.check.mjs`) */
export function _syncRemoteSys(next: SysState | null): void {
  if (sysSig(next) === sysSig(sysState)) return;
  sysState = next;
}

/** Систем ХААЛТТАЙ бол төлөв (хэн · хэзээ · тайлбар · дахин нээгдэх), эс бөгөөс `null` */
export const systemClosed = (): SysState | null => (sysState?.on ? sysState : null);

/**
 * Хаалттай үед нэвтэрч чадах уу — кодын super ЭСВЭЛ `sysClose` эрхтэй.
 */
export function canBypassClosed(username?: string | null): boolean {
  if (!username) return false;
  if (isHardSuper(username) || hasCap(username, 'sysClose')) return true;
  return !capsRemoteReady() && capsStored(username).includes('sysClose');
}

/** ЭНЭ хэрэглэгчид систем хаалттай бол төлөв (`AuthGate` блоклоно), эс бөгөөс `null` */
export const closedFor = (username?: string | null): SysState | null =>
  (systemClosed() && !canBypassClosed(username) ? systemClosed() : null);

/**
 * СИСТЕМИЙГ ХААХ / НЭЭХ — `sysClose` эрхтэй эсвэл кодын super (`who.requireCap` — super бүх эрхтэй).
 */
export class SysStaleError extends Error {
  constructor(readonly fresh: SysState | null) {
    super('sys-stale');
    this.name = 'SysStaleError';
  }
}

/** Хаалттай төлөвийн гарын үсэг — `on: false` мөр = нээлттэй (`null`)-тэй ижил */
const closedSig = (x: SysState | null | undefined): string => sysSig(x?.on ? x : null);

/**
 * «Систем түр хаах» төлөвийг ОДОО дахин уншина (2026-10-19 — удирдлагын цонх нээгдэхэд).
 * @returns шинэ төлөв (`systemClosed`-ийн хэлбэр), уншиж чадаагүй бол `undefined` (сүүлийн мэдэгдэж буй хэвээр)
 */
export async function refreshSystemClosed(): Promise<SysState | null | undefined> {
  const { sysRead } = await import('./permsRemote');
  const r = await sysRead();
  if (!r) return undefined;
  _syncRemoteSys(r.state);
  notify();
  return systemClosed();
}

export async function setSystemClosed(
  on: boolean, note = '', until = '', opts?: { expect?: SysState | null; update?: boolean },
): Promise<boolean> {
  requireCap('sysClose');
  const n = note.trim().slice(0, 500);
  const u = until.trim().slice(0, 100);
  const st: SysState = {
    on,
    ...(on && n ? { note: n } : {}),
    ...(on && u ? { until: u } : {}),
    by: currentUser() ?? '',
    at: Date.now(),
  };
  const { sysRead, sysUpsert } = await import('./permsRemote');
  if (opts && 'expect' in opts) {
    const fresh = await sysRead();
    if (!fresh) return false;
    if (closedSig(fresh.state) !== closedSig(opts.expect) || (opts.update && !fresh.state?.on)) {
      _syncRemoteSys(fresh.state);
      notify();
      throw new SysStaleError(systemClosed());
    }
  }
  if (!(await sysUpsert(st))) return false;
  const back = await sysRead();
  _syncRemoteSys(back ? back.state : st);
  notify();
  return (systemClosed() != null) === on;
}

export function _markRemoteLoaded(v = true): void {
  remoteLoaded = v;
}

/** Хатуу тохиргооноос суурь эрх — override байхгүй хэрэглэгчид */
function baseline(username: string): Access | null {
  const role = roleForUser(username);
  if (!role) return null;
  const a = roleAccess(role);
  return { views: a.views, docs: a.docs };
}

/**
 * НЭВТРЭХ ЭРХ (admission) — хэрэглэгч порталд орж чадах уу.
 */
export function hasAccess(username?: string | null): boolean {
  if (!username) return false;
  if (isHardSuper(username)) return true;
  const ov = loadStore()[username.trim().toLowerCase()];
  if (ov?.removed) return false;
  if (roleForUser(username)) return true;
  return remoteLoaded && !!ov;
}

const VIEW_ORDER = new Map<string, number>(VIEWS.map((v, i) => [v.key, i]));

/**
 * ХУВААРИЛАЛТААР БАТАЛГААЖСАН УРСГАЛТАЙ ХАРАГДАЦУУД (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *   · засах эрхийн гэр харагдац (`CAP_HOST_VIEW` ∩ `WORKFLOW_VIEWS`) — эрх нь хуваарилалтаас
 *   · урсгалын шатанд томилогдсон (`stageOfUser`, «Зөвхөн харна» ч) → «Гүйцэтгэл»
 */
/**
 * «ХУВААРЬ ХАРАХ» УНШИГЧ (2026-10-26) — `huvaariView.ts` ачаалагдахдаа бүртгэнэ (`_setRoleReader`-ийн загвар).
 */
let hvViewReader: ((user: string) => boolean) | null = null;
export function _setHuvaariViewReader(f: (user: string) => boolean): void { hvViewReader = f; }

export function workflowViewsOf(username?: string | null): ViewKey[] {
  if (!username) return [];
  const out = new Set<ViewKey>(capViewsOf(username).filter(isWorkflowView));
  if (stageOfUser(username)) out.add('guitsetgel');
  if (roleOf(username) === 'zahiral') out.add('guitsetgel');
  if (hvViewReader?.(username)) out.add('huvaari');
  return [...out];
}

/**
 * Нэвтэрсэн хэрэглэгчийн эцсийн эрх: override байвал түүнийг, эс бөгөөс хатуу
 * суурийг. Аль нь ч байхгүй бол `null` (нэвтрэх эрхгүй).
 */
export function resolveAccess(username?: string | null): Access | null {
  const base = resolveBaseAccess(username);
  if (!base || !username) return base;
  if (isHardSuper(username)) {
    if (base.views === 'all') return base;
    const extra = capViewsOf(username).filter((v) => !(base.views as ViewKey[]).includes(v));
    return extra.length ? { ...base, views: [...(base.views as ViewKey[]), ...extra] } : base;
  }
  const stored: ViewKey[] = base.views === 'all' ? VIEWS.map((v) => v.key) : base.views;
  const set = new Set<ViewKey>(stored.filter((v) => !isWorkflowView(v)));
  for (const v of capViewsOf(username)) set.add(v);
  for (const v of workflowViewsOf(username)) set.add(v);
  const views = [...set].sort((a, b) => (VIEW_ORDER.get(a) ?? 999) - (VIEW_ORDER.get(b) ?? 999));
  return { ...base, views };
}

/**
 * СУУРЬ эрх — нэмэлт эрхийн (`CAP_HOST_VIEW`) харагдацгүйгээр.
 */
export function resolveBaseAccess(username?: string | null): Access | null {
  if (!username) return null;
  const ov = loadStore()[username.trim().toLowerCase()];
  // Устгагдсан аккаунт — GRANT_ALL ч эрх өгөхгүй. Хатуу super халдашгүй.
  if (ov?.removed) return isHardSuper(username) ? baseline(username) : null;
  if (isHardSuper(username)) return baseline(username);
  // ТҮР: бүх нэвтэрсэн аккаунт бүх эрхтэй
  if (GRANT_ALL) return { views: 'all', docs: true };
  if (ov && remoteLoaded) return { views: ov.views, docs: ov.docs };
  const base = baseline(username);
  if (!ov || !base) return base;
  const views: Access['views'] = ov.views === 'all'
    ? base.views
    : base.views === 'all' ? ov.views : base.views.filter((v) => (ov.views as ViewKey[]).includes(v));
  return { views, docs: base.docs && ov.docs };
}

/**
 * ХЭРЭГЛЭГЧИЙН ИДЭВХТЭЙ ҮҮРЭГ — override-ын role, эс бөгөөс хатуу тохиргоо.
 */
export function roleOf(username?: string | null): Role | null {
  if (!username) return null;
  if (isHardSuper(username)) return 'super';
  const ov = loadStore()[username.trim().toLowerCase()];
  if (ov?.removed) return null;
  return (remoteLoaded ? ov?.role : null) ?? roleForUser(username);
}
_setRoleReader(roleOf);

/** Панелийн жагсаалт — хатуу тохиргооны бүх хэрэглэгч + override-той шинэ хэрэглэгч */
export function listUsers(): UserPerm[] {
  const store = loadStore();
  const rows = new Map<string, UserPerm>();

  // 1) Хатуу тохиргооны хэрэглэгчид
  for (const [uname, role] of Object.entries(ROLE_BY_USER)) {
    const a = roleAccess(role);
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
    if (isCodeSuper(uname)) continue;
    if (roleForUser(uname) === 'super') {
      rows.set(uname.toLowerCase(), { username: uname, role: 'super', views: 'all', docs: true, overridden: false });
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
  const boot = BOOTSTRAP_SUPER.toLowerCase();
  if (!rows.has(boot) && roleForUser(boot) === 'super') {
    rows.set(boot, { username: boot, role: 'super', views: 'all', docs: true, overridden: false });
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
 * Аккаунтыг УСТГАХ — tombstone бичнэ (жагсаалтаас нуугдаж, нэвтрэлт нь татгалзагдана; «Буцаах»-аар
 * сэргээгдэнэ — `restoreUser`). 2026-10-23: панелаас нэмсэн ба хүснэгтийн super-т ч tombstone (доорх).
 * · Кодын (тестийн) SUPER — ТАТГАЛЗАНА; өөрийн super-ийг өөрөө устгахгүй.
 */
export function removeUser(username: string): Promise<boolean> {
  if (isCodeSuper(username)) return Promise.resolve(false);
  const key = username.trim().toLowerCase();
  const role = roleForUser(username);
  if (role === 'super' && key === (currentUser() ?? '').trim().toLowerCase()) return Promise.resolve(false);
  const prevRole = roleOf(username);
  const keepRole: Role | null = prevRole && prevRole !== 'super' ? prevRole : null;
  const entry: Entry = { views: [], docs: false, role: keepRole, removed: true };
  const store = { ...loadStore() };
  store[key] = entry;
  saveStore(store);
  _markTableSuper(key, false);
  return serialWrite(key, () => import('./permsRemote')
    .then((m) => m.upsert({ username, role: keepRole, views: [], docs: false, removed: true }))
    .catch(() => false)
    .then((ok) => { trackWrite(key, entry, ok); return ok; }));
}

/**
 * УСТГАГДСАН АККАУНТЫГ СЭРГЭЭХ — «Устгагдсан аккаунтууд / Буцаах» (2026-10-23).
 * · Кодын суурьтай (`ROLE_BY_USER`, зөвхөн тест) — tombstone-ыг арилгана (`clearOverride(revive)`), суурь эрх буцна.
 * · Бусад (панелаас нэмсэн · хуучин хүснэгтийн super) — tombstone-ын оронд ЖИРИЙН мөр бичнэ: tombstone-д хадгалсан
 *   төрөл (байхгүй бол шинэ аккаунтын төрөл `NEW_ACCOUNT_ROLE`) ба тэр төрлийн загварын (урсгалгүй) харагдац.
 */
export async function restoreUser(username: string): Promise<boolean> {
  const key = username.trim().toLowerCase();
  if (!key || isCodeSuper(key)) return false;
  const tomb = loadStore()[key];
  if (Object.hasOwn(ROLE_BY_USER, key)) return clearOverride(username, { revive: true });
  const kept = tomb?.removed && tomb.role && tomb.role !== 'super' && VALID_ROLES.has(tomb.role) ? tomb.role : null;
  const role: Role = kept ?? NEW_ACCOUNT_ROLE;
  const a = roleAccess(role);
  const views: ViewKey[] = (a.views === 'all' ? VIEWS.map((v) => v.key) : a.views).filter((v) => !isWorkflowView(v));
  return setUser(username, { views, docs: a.docs }, role, undefined, { revive: true });
}

/**
 * Хэрэглэгчийн эрхийг хадгалах (override) — cache + localStorage + ArcGIS хүснэгт.
 */
export function setUser(
  username: string, access: Access, role: Role | null = null, baseOf?: UserBase,
  opts: { revive?: boolean } = {},
): Promise<boolean> {
  const key = username.trim().toLowerCase();
  if (isCodeSuper(username)) return Promise.resolve(true);
  const boot = role === 'super' ? bootstrapOnlySuper() : null;
  if (boot && boot !== key) {
    return setUser(boot, { views: 'all', docs: true }, 'super')
      .then((own) => (own ? setUser(username, access, role, baseOf, opts) : false));
  }
  const entry: Entry = { views: sanitizeViews(access.views), docs: access.docs, role };
  const prev = loadStore()[key];
  const bl = baseline(username);
  const base: Entry | null = baseOf
    ? { views: sanitizeViews(baseOf.views), docs: baseOf.docs, role: baseOf.role }
    : prev ?? (bl ? { views: bl.views, docs: bl.docs, role: roleForUser(username) } : null);
  const store = { ...loadStore() };
  store[key] = entry;
  saveStore(store);
  if (role !== 'super') _markTableSuper(key, false);
  return serialWrite(key, async () => {
    let out = entry;
    let ok = false;
    let revive = opts.revive === true;
    /* remote мөрийн ТҮҮХИЙ үүрэг (шүүгээгүй) — доорх `unknownRole` */
    let rawRole: string | null = null;
    try {
      const m = await import('./permsRemote');
      const wasDirty = key in loadDirty();
      revive = opts.revive === true || loadDirty()[key]?.revive === true;
      const hard = isCodeSuper(username);
      if (!wasDirty || !hard) {
        const fresh = await m.userRead(username);
        if (!fresh) { trackWrite(key, entry, false, revive); return false; }
        rawRole = typeof fresh.row?.role === 'string' ? fresh.row.role : null;
        const fr = fresh.row
          ? sanitizeEntry({
            views: fresh.row.views, docs: fresh.row.docs, role: fresh.row.role,
            ...(fresh.row.removed ? { removed: true } : {}),
          })
          : null;
        if (fr?.removed && !base?.removed && !hard && !revive) {
          dropDirty(key, ser(loadDirty()[key]?.e ?? null));
          const s = { ...loadStore() };
          s[key] = fr;
          saveStore(s);
          _markTableSuper(key, false);
          return false;
        }
        if (!wasDirty) out = mergeUserDelta(base, entry, fr);
        /* Нөгөө админы өөрчлөлтийг локал кэшид ч тусгана — дараагийн засвар түүн дээрээс */
        if (ser(out) !== ser(entry)) {
          const s = { ...loadStore() };
          s[key] = out;
          saveStore(s);
        }
      }
      ok = await m.upsert({ username, role: out.role ?? unknownRole(rawRole), views: out.views, docs: out.docs });
    } catch {
      ok = false;
    }
    if (ok) _markTableSuper(key, out.role === 'super');
    trackWrite(key, out, ok, revive);
    return ok;
  });
}

/** `setUser`-ийн ялгаа бодох суурь — ноорог үүсэх агшны харагдац · баримт · үүрэг */
export type UserBase = { views: ViewKey[] | 'all'; docs: boolean; role: Role | null };

/**
 * ХЭРЭГЛЭГЧИЙН МӨРИЙН ӨӨРЧЛӨЛТИЙГ ШИНЭ УТГА ДЭЭР ДАВХАРЛАНА — цэвэр (2026-10-05).
 * `base` → `next` нь ЭНЭ админы өөрчлөлт; `fresh` нь remote-оос дөнгөж уншсан мөр (`null` = алга).
 *   · Харагдац: `next − base` = нээсэн, `base − next` = хаасан → `fresh` дээр. Гурвын аль нэг нь
 *     `'all'` бол ялгаа тодорхойгүй — `next`-ийг бүтнээр нь (урьдын зан).
 *   · Баримт (`docs`) ба үүрэг (`role`): энэ админ ӨӨРЧИЛСӨН бол `next`-ийнх, үгүй бол `fresh`-ийнх.
 *   · `fresh` алга, эсвэл суурь мэдэгдэхгүй (`base === null`, шинэ аккаунт) бол `next`.
 */
export function mergeUserDelta(base: UserBase | null, next: UserBase, fresh: UserBase | null): UserBase {
  if (!fresh || !base) return next;
  let views: ViewKey[] | 'all' = next.views;
  if (next.views !== 'all' && base.views !== 'all' && fresh.views !== 'all') {
    const b = new Set<ViewKey>(base.views);
    const n = new Set<ViewKey>(next.views);
    const out = fresh.views.filter((v) => !(b.has(v) && !n.has(v)));
    for (const v of next.views) if (!b.has(v) && !out.includes(v)) out.push(v);
    views = out;
  }
  return {
    views,
    docs: base.docs === next.docs ? fresh.docs : next.docs,
    role: base.role === next.role ? fresh.role : next.role,
  };
}

/**
 * Override-ыг устгах — cache + localStorage + ArcGIS хүснэгтээс. Үр дүн: setUser-тэй адил.
 */
export function clearOverride(username: string, opts: { revive?: boolean } = {}): Promise<boolean> {
  const key = username.trim().toLowerCase();
  const revive = opts.revive === true;
  return serialWrite(key, async () => {
    let ok = false;
    try {
      const m = await import('./permsRemote');
      if (!revive && !isCodeSuper(key)) {
        const fresh = await m.userRead(username);
        if (!fresh) {
          if (!loadStore()[key]?.removed) { const s0 = { ...loadStore() }; delete s0[key]; saveStore(s0); _markTableSuper(key, false); }
          trackWrite(key, null, false);
          return false;
        }
        if (fresh.row?.removed) {
          dropDirty(key, ser(loadDirty()[key]?.e ?? null));
          const s = { ...loadStore() };
          s[key] = sanitizeEntry({ views: [], docs: false, role: null, removed: true });
          saveStore(s);
          _markTableSuper(key, false);
          return false;
        }
      }
      ok = await m.remove(username);
    } catch {
      ok = false;
    }
    if (ok) {
      const store = { ...loadStore() };
      delete store[key];
      saveStore(store);
      _markTableSuper(key, false);
    }
    trackWrite(key, null, ok, revive);
    return ok;
  });
}

function narrowOnly(cur: Store, loc: Store): Store {
  const out: Store = { ...cur };
  for (const [k, l] of Object.entries(loc)) {
    const c = cur[k];
    if (!c) continue; // шинэ мөр — нэмэхгүй (remote-оос л)
    if (l.removed) {
      if (k === (currentUser() ?? '').toLowerCase()) out[k] = l;
      continue;
    }
    if (c.removed) continue; // локал нь tombstone-ыг арилгах гэсэн — үл тооцно
    const views: Entry['views'] = l.views === 'all'
      ? c.views
      : c.views === 'all' ? l.views : c.views.filter((v) => (l.views as ViewKey[]).includes(v));
    out[k] = { views, docs: c.docs && l.docs, role: c.role };
  }
  return out;
}

/** Өөр табын өөрчлөлтийн дараах remote дахин уншилт — 30 сек-д ДЭЭД ТАЛ нь нэг (табууд хооронд ping-pong-гүй) */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastRefresh = 0;
function scheduleRemoteRefresh(): void {
  if (refreshTimer) return;
  const wait = Math.max(2_000, lastRefresh + 30_000 - Date.now());
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    lastRefresh = Date.now();
    const u = currentUser();
    initRemote(false, !!u && isHardSuper(u)).catch(() => { /* дараагийн poll дахин уншина */ });
  }, wait);
}

/** localStorage/өөр таб дахь өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribe(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== DIRTY_KEY) return;
    if (!remoteLoaded) {
      cache = loadLocal();
    } else {
      const loc = loadLocal();
      if (JSON.stringify(loc) !== JSON.stringify(cache)) {
        cache = narrowOnly(cache, loc);
        scheduleRemoteRefresh();
      }
    }
    fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

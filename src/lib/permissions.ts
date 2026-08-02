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
 */

import {
  ROLE_ACCESS,
  ROLE_BY_USER,
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
const EVENT = 'selbe-perms-change';

type Store = Record<string, { views: ViewKey[] | 'all'; docs: boolean; role: Role | null }>;

/**
 * Санах ойн CACHE — sync унших цорын ганц эх сурвалж. Эхэндээ `localStorage`-оос
 * (offline/хурдан), нэвтэрсний дараа `initRemote()`-оор ArcGIS хүснэгтээс шинэчлэгдэнэ.
 */
let cache: Store = loadLocal();

function loadLocal(): Store {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

function saveLocal(s: Store): void {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
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

/**
 * ArcGIS хүснэгтээс эрхийг татаж cache-д хийнэ. Super admin (`canCreate`) анх
 * дуудахад хүснэгт байхгүй бол автоматаар үүсгэнэ. Нэвтэрсний дараа дуудна.
 * ArcGIS байхгүй/алдаа бол `localStorage`-ийн cache хэвээр (offline).
 */
export async function initRemote(canCreate: boolean): Promise<void> {
  const { fetchAll } = await import('./permsRemote');
  const remote = await fetchAll(canCreate);
  if (!remote) return; // ArcGIS алга — cache хэвээр
  const s: Store = {};
  for (const [k, r] of Object.entries(remote)) s[k] = { views: r.views, docs: r.docs, role: r.role };
  cache = s;
  saveLocal(s);
  notify();
}

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
 * хэрэглэгч л нэвтэрнэ. Аль алинд байхгүй бол `AuthGate` татгалзана. (GRANT_ALL нь
 * зөвхөн нэвтэрсэн хэрэглэгч ЮУ ХАРАХЫГ өргөтгөдөг болохоос ХЭНИЙГ оруулахыг биш.)
 */
export function hasAccess(username?: string | null): boolean {
  if (!username) return false;
  if (roleForUser(username)) return true;
  return !!loadStore()[username.toLowerCase()];
}

/**
 * Нэвтэрсэн хэрэглэгчийн эцсийн эрх: override байвал түүнийг, эс бөгөөс хатуу
 * суурийг. Аль нь ч байхгүй бол `null` (нэвтрэх эрхгүй).
 */
export function resolveAccess(username?: string | null): Access | null {
  if (!username) return null;
  // ТҮР: бүх нэвтэрсэн аккаунт бүх эрхтэй
  if (GRANT_ALL) return { views: 'all', docs: true };
  const ov = loadStore()[username.toLowerCase()];
  if (ov) return { views: ov.views, docs: ov.docs };
  return baseline(username);
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
  // 2) Override — суурийг дарж бичих, шинэ хэрэглэгч нэмэх
  for (const [uname, ov] of Object.entries(store)) {
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

/** Хэрэглэгчийн эрхийг хадгалах (override) — cache + localStorage + ArcGIS хүснэгт */
export function setUser(username: string, access: Access, role: Role | null = null): void {
  const store = { ...loadStore() };
  store[username.toLowerCase()] = { views: access.views, docs: access.docs, role };
  saveStore(store);
  // ArcGIS хүснэгтэд бичих (fire-and-forget — offline бол localStorage хэвээр)
  void import('./permsRemote').then((m) =>
    m.upsert({ username, role, views: access.views, docs: access.docs }));
}

/** Override-ыг устгах — cache + localStorage + ArcGIS хүснэгтээс */
export function clearOverride(username: string): void {
  const store = { ...loadStore() };
  delete store[username.toLowerCase()];
  saveStore(store);
  void import('./permsRemote').then((m) => m.remove(username));
}

/** localStorage/өөр таб дахь өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribe(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

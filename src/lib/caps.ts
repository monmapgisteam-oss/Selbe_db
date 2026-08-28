'use client';

/**
 * НЭМЭЛТ ЭРХҮҮД (capabilities) — харагдацаас ТУСДАА, нэг бүрчлэн олгодог.
 *
 * ⚠️ Яагаад үүрэг (`Role`) эсвэл харагдац (`ViewKey`)-д НИЙЛҮҮЛЭЭГҮЙ вэ:
 *   · Үүрэг нь «энэ хүн хэн бэ» — багц бүхэлдээ. «Мөр нэмэх» нь тэрхүү багцын
 *     нэг ч гишүүнд автоматаар өгөгдөх ёсгүй ЭРСДЭЛТЭЙ үйлдэл (хуудасны бүтэц
 *     өөрчлөгдөж, БҮХ жин, мөнгөн дүн дахин бодогдоно).
 *   · Харагдац нь «юуг ХАРАХ вэ» — энэ нь «юуг ХИЙХ вэ». Хоёуланг нэг
 *     жагсаалтад хольвол «Гүйцэтгэл бөглөх»-ийг харах бүрд бүтэц засах эрх
 *     дагалдана.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд, `__cap__:` угтвартай мөрөнд
 * (`__flow__:`-ийн адил). Үйлчилгээнд ШИНЭ БАГАНА нэмэх шаардлагагүй.
 *
 * ⚠️ FAIL-CLOSED: эх сурвалж унших боломжгүй, мөр эвдэрсэн, эсвэл түлхүүр
 * танигдахгүй бол эрх нь ОЛГОГДООГҮЙ гэж үзнэ.
 */

import { AUTH } from './services';
import type { CapRow } from './permsRemote';

/** Одоогоор нэг эрх — жагсаалт өсөхөд UI автоматаар дагана. */
export type CapKey = 'addRow' | 'qaqc' | 'zovshoorol';

/**
 * Панелд харуулах бүртгэл — ЗӨВХӨН түлхүүр.
 *
 * ⚠️ Нэр/тайлбарыг энд БИЧИХГҮЙ: `t()`-г модулийн түвшинд дуудвал хэл нь
 * ачаалах үед тогтож, хэл солиход шинэчлэгдэхгүй болно. Мөн i18n гаргагч нь
 * зөвхөн ҮСГЭН `tr('…')` дуудлагыг олдог тул текст толиноос хоцорно.
 * Тиймээс дэлгэцийн текст `UserAdmin`-д, зурагдах агшинд бичигдэнэ.
 */
export const CAPS: { key: CapKey; icon: string }[] = [
  { key: 'addRow', icon: 'plus' },
  /**
   * QAQC — «Гүйцэтгэл бөглөх» хуудасны Inspection Test Plan хэсэг (М-акт,
   * FIC, MA, MIR баримтын 9 багана) бөглөх эрх.
   *
   * ⚠️ Гүйцэтгэлийн хувь бөглөхөөс ТУСДАА: чанарын баримт бичгийг барилгын
   * гүйцэтгэгч биш, чанарын хяналтын ажилтан хөтөлдөг. Нэг эрхэнд нийлүүлбэл
   * обьём бөглөх бүрд баримтын багана нээгдэж, хэн юуг баталсан нь замхарна.
   */
  { key: 'qaqc', icon: 'shield' },
  /**
   * ЗӨВШӨӨРӨЛ — «Зөвшөөрөл» харагдац дээр зөвшөөрөл нэмэх, засах, устгах.
   *
   * ⚠️ ХАРАХААС тусдаа: зөвшөөрлийн төлөв нь ажил эхлүүлэх шийдвэрт
   * шууд нөлөөлдөг тул хардаг бүх хүн засаж чадах ёсгүй.
   */
  { key: 'zovshoorol', icon: 'file' },
];

const VALID = new Set<string>(CAPS.map((c) => c.key));
const KEY = 'selbe-caps-v1';
const EVENT = 'selbe-caps-change';

type Store = Record<string, CapKey[]>;

/** Танигдахгүй түлхүүрийг хаяна — хуучин/эвдэрсэн мөр эрх нээхгүй. */
const sane = (v: unknown): CapKey[] =>
  Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && VALID.has(x)) as CapKey[]) : [];

function load(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const j = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Store = {};
    for (const [k, v] of Object.entries(j)) out[k.toLowerCase()] = sane(v);
    return out;
  } catch {
    return {};
  }
}

let cache: Store = load();

function save(s: Store) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
}

function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

/** Нэг хэрэглэгчийн олгогдсон эрхүүд. */
export function capsOf(username?: string | null): CapKey[] {
  if (!username) return [];
  return cache[username.toLowerCase()] ?? [];
}

/**
 * Тухайн эрх олгогдсон эсэх.
 *
 * ⚠️ НЭВТРЭЛТ УНТРААЛТТАЙ орчинд (`AUTH.appId` хоосон — дев) БҮХ эрх нээлттэй.
 * Учир нь тэр үед `AuthGate` нь `status: 'off'` болж, харагдац бүрийг
 * нэвтрэлтгүйгээр нээдэг бөгөөд `user` нь `null` байна. Хэрэв энд `null`-ыг
 * «эрхгүй» гэж уншвал бүх зүйл нээлттэй атлаа ЭРХЭЭР хаагдсан цөөн хэдэн
 * функц (мөр нэмэх, QAQC) л ЧИМЭЭГҮЙ ажиллахгүй болно — яг ийм зөрчил
 * 2026-08-28-нд «мөр нэмэх ажиллахгүй» гэсэн гомдол болсон.
 *
 * ⚠️ Production-д `.env` дэх `appId` дүүрэн тул энэ салаа ХЭЗЭЭ Ч биелэхгүй.
 */
export function hasCap(username: string | null | undefined, cap: CapKey): boolean {
  if (!AUTH.appId) return true;
  return capsOf(username).includes(cap);
}

/**
 * Хэрэглэгчийн эрхийн ЖАГСААЛТЫГ БҮТНЭЭР солино.
 *
 * ⚠️ Эхлээд локалд бичээд дараа нь ArcGIS руу илгээнэ — сүлжээ унасан ч
 * админ өөрийн дарсныг шууд харна. Буцах утга нь ArcGIS-т бичигдсэн эсэх;
 * `false` бол дуудагч талд ИЛ анхааруулах ёстой (эрх зөвхөн энэ browser-т).
 */
export async function setCaps(username: string, caps: CapKey[]): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const next = sane(caps);
  cache = { ...cache, [u]: next };
  if (next.length === 0) delete cache[u];
  save(cache);
  notify();
  try {
    const r = await import('./permsRemote');
    return next.length ? await r.capUpsert(u, next) : await r.capRemove(u);
  } catch {
    return false;
  }
}

/** Нэг эрхийг асаах/унтраах товчлол. */
export function toggleCap(username: string, cap: CapKey, on: boolean): Promise<boolean> {
  const cur = capsOf(username);
  return setCaps(username, on ? [...new Set([...cur, cap])] : cur.filter((c) => c !== cap));
}

export function subscribeCaps(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * ArcGIS-аас ирсэн мөрүүдийг локал кэш болгоно (`initRemote` дуудна).
 *
 * ⚠️ Алсын хуулбар нь ЭЦСИЙН ҮНЭН: энд байхгүй хэрэглэгчийн эрх ХАСАГДСАН
 * гэсэн үг. Локалыг нэгтгэвэл өөр админы хассан эрх энэ browser дээр мөнхөд
 * үлдэнэ — эрх ЧИМЭЭГҮЙ өргөжих нь хамгийн муу төрлийн алдаа.
 */
export function _syncRemoteCaps(rows: CapRow[]): void {
  const s: Store = {};
  for (const r of rows) {
    const c = sane(r.caps);
    if (r.user && c.length) s[r.user.toLowerCase()] = c;
  }
  cache = s;
  save(s);
  notify();
}

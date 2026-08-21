'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН УРСГАЛЫН ЭРХ — ХЭН, АЛЬ ШАТАНД, АЛЬ БАГЦАД.
 *
 * ⚠️ ЭНЭ НЬ `permissions.ts`-ЭЭС ӨӨР АСУУЛТАД хариулна: тэр нь «хэн ямар
 * харагдац үзэх вэ», энэ нь «хэн аль багцын гүйцэтгэлийг бөглөх / хянах вэ».
 * Хоёр нь ТУСДАА хадгалагдана — гэхдээ ХОЛБООТОЙ ажиллана: шатанд томилохдоо
 * `permissions`-д үүрэг ба `guitsetgel` харагдацыг ДАГУУЛЖ өгнө (доорх
 * `grantFlowAccess`). Ингэснээр «томилсон атлаа нэвтрээд юу ч олдохгүй» гэсэн
 * хагас төлөв үүсэхгүй.
 *
 * ⚠️ АККАУНТЫН ТООНД ХЯЗГААР БАЙХГҮЙ. Багц бүрд өөр гүйцэтгэгч, өөр инженер
 * байх тул урьдчилан таамагласан дээд тоо нь заавал буруу гарна.
 *
 * ⚠️ ОДООГООР `localStorage`-д хадгална — ТУХАЙН BROWSER-Т. ArcGIS дээрх
 * хуваалцсан хүснэгт (`permsRemote.ts` загвараар) нэмэгдэх хүртэл өөр
 * төхөөрөмжид дамжихгүй. Тиймээс панел дээр үүнийг ИЛ бичнэ — чимээгүй
 * орхивол админ «тохируулсан» гэж бодох боловч бусдад хүрээгүй байна.
 * Дараа нь зөвхөн `load`/`save` хоёрыг сольж алсын хадгалалт руу залгана.
 */

import type { Stage } from './hyanalt';
import { ROLE_ACCESS, type Role, type ViewKey } from './services';

/**
 * ШАТ → ПОРТАЛЫН ҮҮРЭГ.
 *
 * ⚠️ Шатанд томилохдоо үүргийг нь БАС өгнө. Эс бөгөөс аккаунт нь урсгалд
 *    жагссан атлаа «Гүйцэтгэлийн хяналт» харагдацыг огт нээж чадахгүй —
 *    админ «томилчихлоо» гэж бодох боловч тэр хүн нэвтрээд юу ч олохгүй.
 */
export const STAGE_ROLE: Record<Stage, Role> = {
  company: 'guitsetgegch',
  engineer: 'injener',
  manager: 'menejer',
  director: 'eronhii',
};

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

/** Нэг томилгоо: нэг аккаунт, нэг шат, багцуудын жагсаалт */
export type Assign = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  stage: Stage;
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
};

const KEY = 'selbe-guitsetgel-acl-v1';
const EVENT = 'selbe-guitsetgel-acl-change';

let cache: Assign[] | null = null;

function load(): Assign[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as Assign[];
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(list: Assign[]): void {
  cache = list;
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  }
}

export const listAssigns = (): Assign[] => load();

/** Нэг шатны томилгоонууд — панелийн багана */
export const assignsOf = (stage: Stage): Assign[] =>
  load().filter((a) => a.stage === stage);

/**
 * Аккаунт нэмэх/шинэчлэх.
 *
 * ⚠️ Нэг аккаунт нэг шатанд ЗӨВХӨН НЭГ мөртэй — багц нь нэг мөрд жагсана.
 *    Хоёр мөр зөвшөөрвөл аль нь үнэн болох нь тодорхойгүй болно.
 */
export function setAssign(user: string, stage: Stage, bagts: string[]): { ok: boolean; error?: string } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Аккаунтын нэрээ бичнэ үү' };

  const list = load();
  const exists = list.some((a) => a.stage === stage && a.user === u);
  /*
   * ⚠️ НЭГ АККАУНТ ЗӨВХӨН НЭГ ШАТАНД. Нэг хүн бөглөгч ба хянагч хоёулаа
   *    байвал өөрийнхөө ажлыг өөрөө батлах зам нээгдэж, дөрвөн шатны
   *    хяналт бүхэлдээ утгагүй болно. Тиймээс өмнөх шатнаас нь ХАСНА.
   */
  const cleaned = list.filter((a) => !(a.user === u && a.stage !== stage));
  const next = exists
    ? cleaned.map((a) => (a.stage === stage && a.user === u ? { ...a, bagts } : a))
    : [...cleaned, { user: u, stage, bagts }];
  save(next);

  /*
   * ЭРХИЙГ ДАГУУЛЖ ӨГНӨ — томилгоо нь ажиллах чадвартай байх ёстой.
   * ⚠️ Хэрэглэгчийн БУСАД харагдацыг хасахгүй: `guitsetgel`-ийг НЭМЖ л
   *    өгнө. Дарж бичвэл давхар үүрэгтэй хүн (жишээ нь супер админ)
   *    бүх эрхээ алдана.
   */
  void grantFlowAccess(u, stage);
  return { ok: true };
}

export function removeAssign(user: string, stage: Stage): void {
  const u = user.trim().toLowerCase();
  save(load().filter((a) => !(a.stage === stage && a.user === u)));
}

/**
 * Урсгалын эрхийг олгоно: үүргийг тавьж, `guitsetgel` харагдацыг НЭМНЭ.
 *
 * ⚠️ Динамик import — `permissions.ts` нь энэ файлыг импортлодоггүй ч
 *    ирээдүйд гогцоо үүсэхээс сэргийлж, мөн серверийн зурагдалтад
 *    `localStorage` хөндөхгүйн тулд.
 */
async function grantFlowAccess(user: string, stage: Stage): Promise<boolean> {
  try {
    const { resolveAccess, setUser } = await import('./permissions');
    const role = STAGE_ROLE[stage];
    const cur = resolveAccess(user);
    const base = cur?.views ?? ROLE_ACCESS[role].views;
    // «Бүх эрх»-тэй хүнийг хумихгүй — тэр аль хэдийн бүгдийг үзнэ
    const views: ViewKey[] | 'all' =
      base === 'all' ? 'all' : [...new Set<ViewKey>([...base, 'guitsetgel'])];
    return setUser(user, { views, docs: cur?.docs ?? ROLE_ACCESS[role].docs }, role);
  } catch {
    return false;
  }
}

/** Аккаунт аль шатанд томилогдсон бэ (томилогдоогүй бол `null`) */
export function stageOfUser(user?: string | null): Stage | null {
  if (!user) return null;
  const a = load().find((x) => x.user === user.toLowerCase());
  return a?.stage ?? null;
}

/**
 * Тухайн хэрэглэгч энэ шатанд АЛЬ БАГЦУУДЫГ хариуцах вэ.
 *
 * `null` = хязгаарлалт байхгүй (томилгоо огт хийгээгүй, эсвэл «бүх багц»).
 * ⚠️ Томилгоогүй үед ХООСОН массив буцаавал систем шинээр асахад хэн ч юу ч
 *    харахгүй болж, тохируулах хүн өөрөө орж чадахгүй болно.
 */
export function bagtsFor(user: string | null | undefined, stage: Stage): string[] | null {
  if (!user) return null;
  const a = load().find((x) => x.stage === stage && x.user === user.toLowerCase());
  if (!a) return null;
  if (a.bagts.includes(ALL_BAGTS) || a.bagts.length === 0) return null;
  return a.bagts;
}

/** Өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribeAcl(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = null; fn(); }
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

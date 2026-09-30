/**
 * ГҮЙЦЭТГЭЛИЙН УРСГАЛЫН ЭРХИЙН ХҮСНЭГТ — НҮДНИЙ ЦЭВЭР ДҮРЭМ (2026-09-30).
 *
 * `GuitsetgelAcl` панел нь «багц × шат» хүснэгт болов: мөр = багц, багана =
 * шат, нүд бүрд тэр багцын тэр шатанд томилогдсон аккаунтууд. Гэхдээ
 * ХАДГАЛАЛТ нь хуучин хэвээр АККАУНТААР (`guitsetgelAcl.Assign`): нэг аккаунт
 * = нэг шат + багцын жагсаалт (эсвэл «бүх багц»). Тиймээс нүдэнд нэмэх/хасах
 * бүрийг тэр аккаунтын мөрийн өөрчлөлт болгож хөрвүүлэх хэрэгтэй — энэ файл
 * ЗӨВХӨН тэр хөрвүүлэлтийг хийнэ (бичилтгүй, UI-гүй, тестлэгдэнэ).
 *
 * ⚠️ БИЗНЕСИЙН ДҮРЭМ ӨӨРЧЛӨГДӨӨГҮЙ («ажилгааны дүрэм хэвээр»):
 *    · НЭГ АККАУНТ НЭГ ШАТАНД — өөр шатны нүдэнд нэмбэл ШИЛЖҮҮЛЭХ (`move`),
 *      асууна; хуучин багц ба «Зөвхөн харна» арилна (`aclOps.moveMsg`).
 *    · «Бүх багц»-тай аккаунт аль хэдийн бүх мөрийг хамарна — дахин нэмэхгүй
 *      (жагсаалт руу буулгавал ХУМИГДАНА).
 *    · Сүүлийн багцыг хасвал «бүх багц» руу БУЦАХГҮЙ (fail-closed, 2026-08-29)
 *      — томилгоог бүхэлд нь хасна (`drop`, ✕-ийн зам: асууж эрх буцаана).
 *    · «Бүх багц»-тай аккаунтыг НЭГ мөрөөс хасвал бусад бүх багцын ИЛ
 *      жагсаалт болно (`narrow`) — хүрээ өөрчлөгдөх тул асууна.
 *
 * ⚠️ `GRID_ALL` нь `guitsetgelAcl.ALL_BAGTS`-тай ИЖИЛ утга ('*'). Энэ файлыг
 *    цэвэр байлгахын тулд тэр модулийг (permissions, ArcGIS) импортлохгүй —
 *    тэнцүү эсэхийг `guitsetgelGrid.check.mjs` баталгаажуулна.
 */

import type { Stage } from './hyanalt';

/** «Бүх багц» — `guitsetgelAcl.ALL_BAGTS`-тай ижил (тестээр батлагдана) */
export const GRID_ALL = '*';

/** Аккаунтын одоогийн томилгоо (байхгүй бол null) */
export type CellCur = { stage: Stage; bagts: string[] } | null | undefined;

/** Нүдний үйлдлийг аккаунтын мөрийн өөрчлөлт болгосон төлөвлөгөө */
export type CellPlan =
  /** Өөрчлөлтгүй (аль хэдийн хамарсан / энэ нүдэнд байхгүй) */
  | { kind: 'none' }
  /** Шинэ томилгоо — эрх олгоно */
  | { kind: 'create'; stage: Stage; bagts: string[] }
  /** Өөр шатнаас шилжүүлэх — асууна, эрх дахин олгоно */
  | { kind: 'move'; from: Stage; stage: Stage; bagts: string[] }
  /** Ижил шатны багц солих — эрх хөндөхгүй (grant=false) */
  | { kind: 'set'; stage: Stage; bagts: string[] }
  /** «Бүх багц» → ил жагсаалт — асууна, grant=false */
  | { kind: 'narrow'; stage: Stage; bagts: string[] }
  /** Томилгоог бүхэлд нь хасах — ✕-ийн зам (`flowDropOp`) */
  | { kind: 'drop'; stage: Stage };

const hasAll = (b: string[]): boolean => b.includes(GRID_ALL);

/**
 * Энэ аккаунт (pkg, stage) нүдийг хамардаг уу.
 * `'all'` — «бүх багц»-аар; `'pkg'` — тэр багцаар ил; null — үгүй.
 * `pkg === GRID_ALL` («Бүх багц» мөр) бол зөвхөн «бүх багц»-тай нь хамарна.
 */
export function cellHolds(cur: CellCur, stage: Stage, pkg: string): 'all' | 'pkg' | null {
  if (!cur || cur.stage !== stage) return null;
  if (hasAll(cur.bagts)) return 'all';
  if (pkg === GRID_ALL) return null;
  return cur.bagts.includes(pkg) ? 'pkg' : null;
}

/** (pkg, stage) нүдэнд аккаунт НЭМЭХ */
export function planCellAdd(cur: CellCur, stage: Stage, pkg: string): CellPlan {
  if (!cur) return { kind: 'create', stage, bagts: [pkg] };
  if (cur.stage !== stage) return { kind: 'move', from: cur.stage, stage, bagts: [pkg] };
  if (hasAll(cur.bagts)) return { kind: 'none' };
  if (pkg === GRID_ALL) return { kind: 'set', stage, bagts: [GRID_ALL] };
  if (cur.bagts.includes(pkg)) return { kind: 'none' };
  return { kind: 'set', stage, bagts: [...cur.bagts, pkg] };
}

/**
 * (pkg, stage) нүднээс аккаунт ХАСАХ.
 * @param allPkgs бүх багцын жагсаалт (`PKG_GROUPS`) — «бүх багц»-ыг ил болгоход
 */
export function planCellRemove(cur: CellCur, stage: Stage, pkg: string, allPkgs: readonly string[]): CellPlan {
  const held = cellHolds(cur, stage, pkg);
  if (!cur || !held) return { kind: 'none' };
  /* «Бүх багц» мөрнөөс хасах = «бүх багц»-ыг цуцлах; хоосон жагсаалт байхгүй тул бүхэлд нь */
  if (pkg === GRID_ALL) return { kind: 'drop', stage };
  const base = held === 'all' ? [...allPkgs] : cur.bagts;
  const left = base.filter((b) => b !== pkg && b !== GRID_ALL);
  if (!left.length) return { kind: 'drop', stage };
  return held === 'all' ? { kind: 'narrow', stage, bagts: left } : { kind: 'set', stage, bagts: left };
}

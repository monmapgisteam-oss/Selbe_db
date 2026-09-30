/**
 * «БАГЦ × ҮҮРЭГ» ХҮСНЭГТИЙН НҮДНИЙ ЦЭВЭР ДҮРЭМ — Хуваарь · Обьём · Нэмэлт ажил ·
 * Чанарын баримт · Дэд бүтэц · QAQC (2026-09-30).
 *
 * Эдгээр хуудас `GuitsetgelAcl`-ийн загвараар хүснэгт болов: мөр = багц,
 * багана = үүрэг, нүд бүрд тэр багцын тэр үүргийн аккаунтууд. ХАДГАЛАЛТ нь
 * хуучин хэвээр АККАУНТААР — үүрэг бүр өөрийн багцын жагсаалттай grant
 * (`scopedAcl.Grant`), QAQC-д нэг жагсаалт. Нүдний нэмэх/хасах бүрийг тэр
 * аккаунтын мөрийн өөрчлөлт болгох дүрэм ЗӨВХӨН энд (бичилтгүй, UI-гүй,
 * `aclGrid.check.mjs`-ээр тестлэгдэнэ). Бичилт нь `aclOps.scopedCellOp` ·
 * `aclOps.qaqcCellOp`.
 *
 * ⚠️ БИЗНЕСИЙН ДҮРЭМ ӨӨРЧЛӨГДӨӨГҮЙ (`aclOps.addPkgOp` · `removePkgOp`-той ижил):
 *    · Мөргүй аккаунт → зөвхөн ЭНЭ багцаар шинэ мөр (`create`, эрх олгоно).
 *    · Байгаа мөр → ЗӨВХӨН тухайн үүргийн grant хөндөгдөнө; бусад үүрэг
 *      өөрийн багцтай хэвээр (2026-09-09-ний үүрэг × багцын үржвэрийн засвар).
 *    · «Бүх багц»-тай grant аль хэдийн бүх мөрийг хамарна — ДАХИН нэмэхгүй
 *      (жагсаалт руу буулгавал ХУМИГДАНА).
 *    · Багцгүй үлдсэн grant өөрөө унана; нэг ч grant үлдэхгүй бол мөрийг
 *      бүхэлд нь хасна (`drop`) — «бүх багц» руу БУЦАХГҮЙ (fail-closed).
 * ⚠️ ЦОРЫН ГАНЦ ЯЛГАА (хүснэгтийн шаардлага, `GuitsetgelAcl`-тай ижил):
 *    «Бүх багц»-тай grant-ыг НЭГ мөрөөс хасвал бусад бүх багцын ИЛ жагсаалт
 *    болно (`narrow`, асууна). Урьд картын панел «энэ үүргийг бүхэлд нь хасах
 *    уу?» гэж асуудаг байв — хүснэгтэд бүдэг чипийг нэг мөрөөс хасахад бүх
 *    мөрөөс алга болох нь гэнэтийн. Дэд бүтцэд энэ дүрэм 2026-09-23-наас бий.
 *
 * ⚠️ `GRID_ALL` нь `scopedAcl.ALL_BAGTS` · `qaqcAcl.ALL_BAGTS`-тай ИЖИЛ ('*').
 *    Энэ файлыг цэвэр байлгахын тулд тэдгээрийг (permissions, ArcGIS)
 *    импортлохгүй — тэнцүү эсэхийг `aclGrid.check.mjs` баталгаажуулна.
 */

/** «Бүх багц» — `scopedAcl.ALL_BAGTS`-тай ижил (тестээр батлагдана) */
export const GRID_ALL = '*';

/** Нэг үүргийн багцын жагсаалт — `scopedAcl.Grant`-тай ижил хэлбэр */
export type GridGrant = { role: string; bagts: string[] };

/** Жагсаалтын (QAQC — үүрэггүй) нүдний төлөвлөгөө */
export type ListPlan =
  /** Өөрчлөлтгүй (аль хэдийн хамарсан / энэ нүдэнд байхгүй) */
  | { kind: 'none' }
  /** Шинэ мөр — эрх олгоно */
  | { kind: 'create'; bagts: string[] }
  /** Багц нэмэх/хасах — эрх хөндөхгүй */
  | { kind: 'set'; bagts: string[] }
  /** «Бүх багц» → бусад багцын ил жагсаалт — асууна */
  | { kind: 'narrow'; bagts: string[] }
  /** Сүүлийн багц — мөрийг бүхэлд нь хасна (✕-ийн зам, асууна) */
  | { kind: 'drop' };

/** Үүрэгтэй (grant) нүдний төлөвлөгөө — `grants` нь мөрийн ШИНЭ бүтэн жагсаалт */
export type GrantPlan =
  | { kind: 'none' }
  /** Мөргүй аккаунт — шинэ мөр */
  | { kind: 'create'; grants: GridGrant[] }
  /** Мөрийн grant-ууд солигдоно (үүрэг бүхэлдээ унаж болно — `roleGone`) */
  | { kind: 'set'; grants: GridGrant[]; roleGone: boolean }
  /** «Бүх багц» → бусад багцын ил жагсаалт — асууна */
  | { kind: 'narrow'; grants: GridGrant[]; left: string[] }
  /** Нэг ч grant үлдэхгүй — мөрийг бүхэлд нь хасна */
  | { kind: 'drop' };

type Bagts = readonly string[] | null | undefined;
type Grants = readonly GridGrant[] | null | undefined;

const hasAll = (b: readonly string[]): boolean => b.includes(GRID_ALL);

/* ══════════════════════ Жагсаалт (QAQC) ══════════════════════ */

/** Энэ жагсаалт `pkg` мөрийг хамардаг уу — `'all'` «бүх багц»-аар, `'pkg'` ил */
export function listHolds(bagts: Bagts, pkg: string): 'all' | 'pkg' | null {
  if (!bagts || !bagts.length) return null;
  if (hasAll(bagts)) return 'all';
  return bagts.includes(pkg) ? 'pkg' : null;
}

/** `pkg` нүдэнд НЭМЭХ. `bagts` = null/undefined бол мөргүй аккаунт */
export function planListAdd(bagts: Bagts, pkg: string): ListPlan {
  if (!bagts) return { kind: 'create', bagts: [pkg] };
  if (listHolds(bagts, pkg)) return { kind: 'none' };
  return { kind: 'set', bagts: [...bagts, pkg] };
}

/**
 * `pkg` нүднээс ХАСАХ.
 * @param universe бүх багцын жагсаалт — «бүх багц»-ыг ил болгоход
 */
export function planListRemove(bagts: Bagts, pkg: string, universe: readonly string[]): ListPlan {
  const held = listHolds(bagts, pkg);
  if (!bagts || !held) return { kind: 'none' };
  const base = held === 'all' ? universe : bagts;
  const left = base.filter((b) => b !== pkg && b !== GRID_ALL);
  if (!left.length) return { kind: 'drop' };
  return held === 'all' ? { kind: 'narrow', bagts: left } : { kind: 'set', bagts: left };
}

/* ══════════════════════ Үүрэгтэй grant (5 систем) ══════════════════════ */

/** Энэ мөр (`role`, `pkg`) нүдийг хамардаг уу */
export function grantHolds(grants: Grants, role: string, pkg: string): 'all' | 'pkg' | null {
  return listHolds(grants?.find((g) => g.role === role)?.bagts, pkg);
}

/** (`role`, `pkg`) нүдэнд НЭМЭХ. `grants` = null/undefined бол мөргүй аккаунт */
export function planGrantAdd(grants: Grants, role: string, pkg: string): GrantPlan {
  if (!grants) return { kind: 'create', grants: [{ role, bagts: [pkg] }] };
  const mine = grants.find((g) => g.role === role);
  const p = planListAdd(mine ? mine.bagts : null, pkg);
  if (p.kind === 'none') return p;
  const next = mine
    ? grants.map((g) => (g.role === role ? { role, bagts: p.kind === 'set' ? p.bagts : [pkg] } : { ...g, bagts: [...g.bagts] }))
    : [...grants.map((g) => ({ ...g, bagts: [...g.bagts] })), { role, bagts: [pkg] }];
  return { kind: 'set', grants: next, roleGone: false };
}

/**
 * (`role`, `pkg`) нүднээс ХАСАХ.
 * @param universe тухайн системийн бүх багц (`PKG_GROUPS` / `BUTETS_PACKS` түлхүүр)
 */
export function planGrantRemove(grants: Grants, role: string, pkg: string, universe: readonly string[]): GrantPlan {
  const mine = grants?.find((g) => g.role === role);
  if (!grants || !mine) return { kind: 'none' };
  const p = planListRemove(mine.bagts, pkg, universe);
  if (p.kind === 'none' || p.kind === 'create') return { kind: 'none' };
  const left = p.kind === 'drop' ? [] : p.bagts;
  /* Багцгүй үлдсэн grant өөрөө унана */
  const next = grants
    .map((g) => (g.role === role ? { role, bagts: left } : { ...g, bagts: [...g.bagts] }))
    .filter((g) => g.bagts.length > 0);
  if (!next.length) return { kind: 'drop' };
  if (p.kind === 'narrow') return { kind: 'narrow', grants: next, left };
  return { kind: 'set', grants: next, roleGone: !left.length };
}

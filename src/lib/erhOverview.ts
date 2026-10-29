'use client';

/**
 * ЭРХИЙН НЭГДСЭН ТОЙМ — «хэн юу хийж чадах вэ» ба «багц бүрд хэн байгаа вэ».
 *
 *   1. «Батбаяр юу хийж чадах вэ?» — таван бүлгийг тус тусад нь нээж,
 *      түүний нэрийг хайх ёстой.
 *   2. «Багц 3.1-ийг хэн хариуцаж байна?» — мөн адил.
 *
 * Улмаас гацаа нь ЗӨВХӨН гарсны дараа мэдэгддэг: батлагч томилоогүй багц
 * илгээлт хүлээн авах хүртэл чимээгүй, зохиогч=батлагч болсон багц
 * `decidePlan` татгалзах хүртэл чимээгүй.
 */

import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { STAGE_ORDER, type Stage } from './hyanalt';
import { ALL_BAGTS } from './scopedAcl';
import type { CapKey } from './caps';
import { ROLE_CAPS, SCOPED_SYSTEMS, capSystem, rolesOfCap } from './aclRoleCaps';
import { reviewerClashes, type Reviewer } from './chanarMs';

/* ── Тоймд хэрэгтэй хэмжээгээр нь эх сурвалжийг тодорхойлно ── */

/** Гүйцэтгэлийн урсгалын томилгоо (`guitsetgelAcl.Assign`) */
export type FlowRow = { user: string; stage: Stage; bagts: string[]; viewOnly?: boolean };
/** Багцын хуваарилалт — үүрэгтэй (хуваарь · обьём) эсвэл үүрэггүй (чанар) */
export type ScopedRow = { user: string; grants: { role: string; bagts: string[] }[]; bagts?: string[] };

export type ErhSource = {
  /** Порталын БҮХ аккаунт (жижиг үсгээр биш, харагдах хэлбэрээр) */
  users: string[];
  flow: FlowRow[];
  huvaari: ScopedRow[];
  obyem: ScopedRow[];
  /** Чанарын баримт — 6 үүрэг (author · tuh · chanar · habea · tug · cheng), 2026-09-28 */
  chanar: ScopedRow[];
  /**
   * Нэмэлт ажил (editor · approver) ба дэд бүтцийн засвар (editor), 2026-09-23.
   */
  ajil?: ScopedRow[];
  butets?: ScopedRow[];
  /**
   * Хатуу `super` аккаунтууд (2026-09-24). `roleForUser`-ыг ЭНД
   *    импортлохгүй (дээрх шалтгаан) — дуудагч өгнө. СОНГОМОЛ: хуучин тест
   *    эх сурвалж нь энэгүй.
   */
  supers?: string[];
  codeSupers?: string[];
  gone?: string[];
  absent?: string[];
  typeStage?: Record<string, Stage>;
  viewRoles?: string[];
  hvType?: Record<string, { scope: 'all' | 'own'; bagts: string[] | null }>;
  /** Аккаунт → нэмэлт эрхүүд (`caps.capsOf`) */
  caps: Record<string, string[]>;
  /** Аккаунт → нээлттэй харагдацын тоо ба нийт */
  views: Record<string, { open: number; total: number }>;
};

/** Нэг хүний нэг дэд систем дэх үүрэг */
export type RoleLine = {
  /** Үүргийн түлхүүр (`author`/`approver`/`editor`) — чанарт хоосон */
  role: string;
  /** Багцууд. `null` = БҮХ багц. */
  bagts: string[] | null;
};

/** Нэг хүний БҮРЭН эрхийн зураг */
export type UserErh = {
  user: string;
  /** Урсгалын шат (`null` = томилогдоогүй) ба багцууд; `viewOnly` = зөвхөн харна */
  flow: { stage: Stage; bagts: string[] | null; viewOnly: boolean } | null;
  /** Хатуу super — бүх багц, бүх шат; хуваарилалт түүнд үйлчилдэггүй */
  superUser: boolean;
  codeSuper: boolean;
  huvaari: RoleLine[];
  obyem: RoleLine[];
  chanar: RoleLine[];
  ajil: RoleLine[];
  /** Дэд бүтцийн засвар — багц нь `BUTETS_PACKS` түлхүүр */
  butets: RoleLine[];
  caps: string[];
  views: { open: number; total: number };
  /** Ямар нэг эрх байгаа эсэх — «юу ч хийхгүй» аккаунтыг ялгана */
  any: boolean;
  /**
   * ТАНИГДААГҮЙ БАГЦ (2026-10-19, аудит) — хуваарилалтад байгаа ч `PKG_GROUPS`-д алга нэр (нэр солигдсон, гараар
   * засагдсан мөр). Тэр нэр ямар ч багцыг НЭЭХГҮЙ (`scope`-ийн `includes` хэзээ ч таарахгүй) — админ засах ёстой.
   */
  unknownBagts: string[];
  hvType: { scope: 'all' | 'own'; bagts: string[] | null } | null;
  viewRole: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();

/** `[ALL_BAGTS]` → `null` (=бүх багц); хоосон → `[]` */
const bagtsOf = (b: string[]): string[] | null =>
  (b.includes(ALL_BAGTS) ? null : b);

const KNOWN = new Set<string>(PKG_GROUPS);
/** `PKG_GROUPS`-д алга (ба `ALL_BAGTS` биш) багцын нэрс — давхардалгүй, эрэмбэтэй */
const unknownOf = (lists: (readonly string[] | null | undefined)[]): string[] =>
  [...new Set(lists.flatMap((l) => l ?? []).filter((b) => b !== ALL_BAGTS && !KNOWN.has(b)))].sort();

/** Нэг хүний бүх эрхийг цуглуулна */
export function userErh(src: ErhSource, user: string): UserErh {
  const k = norm(user);
  const f = src.flow.find((x) => norm(x.user) === k);

  const lines = (rows: ScopedRow[]): RoleLine[] => {
    const r = rows.find((x) => norm(x.user) === k);
    if (!r) return [];
    return r.grants.map((g) => ({ role: g.role, bagts: bagtsOf(g.bagts) }));
  };

  const huvaari = lines(src.huvaari);
  const obyem = lines(src.obyem);
  const chanar = lines(src.chanar);
  const ajil = lines(src.ajil ?? []);
  const butets = lines(src.butets ?? []);
  const caps = src.caps[k] ?? [];
  const views = src.views[k] ?? { open: 0, total: 0 };
  const superUser = (src.supers ?? []).some((x) => norm(x) === k);
  const codeSuper = (src.codeSupers ?? []).some((x) => norm(x) === k);
  const rawGrants = (rows: ScopedRow[]): (readonly string[])[] => {
    const r = rows.find((x) => norm(x.user) === k);
    if (!r) return [];
    return [...(r.grants ?? []).map((g) => g.bagts), ...(Array.isArray(r.bagts) ? [r.bagts] : [])];
  };
  const unknownBagts = unknownOf([
    f?.bagts,
    ...rawGrants(src.huvaari), ...rawGrants(src.obyem), ...rawGrants(src.chanar), ...rawGrants(src.ajil ?? []),
  ]);

  return {
    user,
    flow: f ? { stage: f.stage, bagts: bagtsOf(f.bagts), viewOnly: f.viewOnly === true } : null,
    superUser,
    codeSuper,
    huvaari,
    obyem,
    chanar,
    ajil,
    butets,
    caps,
    views,
    any: superUser || !!f || huvaari.length > 0 || obyem.length > 0 || chanar.length > 0
      || ajil.length > 0 || butets.length > 0 || caps.length > 0,
    unknownBagts,
    hvType: src.hvType?.[k] ?? null,
    viewRole: (src.viewRoles ?? []).some((x) => norm(x) === k),
  };
}

/**
 * ТӨРӨЛ ↔ УРСГАЛЫН ШАТ ЗӨРӨӨ — 2026-10-22 (аудит).
 */
export type TypeStageGap = { user: string; want: Stage | null; have: Stage | null };
export function typeStageGaps(src: ErhSource): TypeStageGap[] {
  const skip = new Set([...(src.gone ?? []), ...(src.absent ?? []), ...(src.supers ?? [])].map(norm));
  const out: TypeStageGap[] = [];
  for (const k of src.viewRoles ?? []) {
    const key = norm(k);
    if (skip.has(key)) continue;
    const have = src.flow.find((x) => norm(x.user) === key)?.stage ?? null;
    if (have) out.push({ user: src.users.find((u) => norm(u) === key) ?? key, want: null, have });
  }
  for (const [k, want] of Object.entries(src.typeStage ?? {})) {
    const key = norm(k);
    if (skip.has(key)) continue;
    const have = src.flow.find((x) => norm(x.user) === key)?.stage ?? null;
    if (have !== want) out.push({ user: src.users.find((u) => norm(u) === key) ?? key, want, have });
  }
  return out.sort((a, b) => a.user.localeCompare(b.user));
}

/** Танигдаагүй багцтай хуваарилалттай аккаунтууд — тоймын «Анхаарах» (2026-10-19, аудит) */
export const unknownPkgUsers = (src: ErhSource): { user: string; bagts: string[] }[] =>
  allUserErh(src).filter((u) => u.unknownBagts.length > 0).map((u) => ({ user: u.user, bagts: u.unknownBagts }));

/** Нэг багцад хэн юу хариуцаж байгаа */
export type PkgErh = {
  bagts: string;
  /** Шат бүрийн эзэд (олон байж болно) */
  flow: Record<Stage, string[]>;
  /**
   * Шат бүрийн «Зөвхөн харна» томилгоо (2026-09-25) — ЭЗЭН БИШ (`flow`-д
   * ороогүй), матрицад саарал харагдана. Зөвхөн харагчтай шат нь
   * `flowGap`-д хоосон гэж тоологдоно — илгээлт тэнд зогсоно.
   */
  flowViewers: Record<Stage, string[]>;
  /** Үүрэг → эзэд */
  huvaari: Record<string, string[]>;
  obyem: Record<string, string[]>;
  chanar: Record<string, string[]>;
  /** Нэмэлт ажил — editor · approver (2026-09-23) */
  ajil: Record<string, string[]>;
  /** Гацаа ба цоорхойн жагсаалт — `pkgIssues` бөглөнө */
  issues: PkgIssue[];
};

export type PkgIssue = {
  /** `bad` = ажил ГАЦНА · `warn` = дутуу ч ажиллана */
  tone: 'bad' | 'warn';
  /** Хэл рүү орчуулахад бэлэн ТҮЛХҮҮР ба утгууд (`tr` нь дуудагч талд) */
  key: string;
  /** `{0}`, `{1}` … орлуулга */
  args: string[];
  /**
   * Матрицын аль баганыг улаан/шар болгох вэ (`MATRIX_COLS[].id`, 2026-09-25).
   */
  cols?: string[];
  superOnly?: boolean;
};

/** Тухайн багцад тэр мөр хамаарах уу (`ALL_BAGTS` бүгдэд) */
const covers = (b: string[], g: string): boolean =>
  b.includes(ALL_BAGTS) || b.includes(g);

/**
 * Нэг багцын эрхийн зураг ба ЦООРХОЙ.
 */
export function pkgErh(src: ErhSource, bagts: string): PkgErh {
  const viewRole = new Set((src.viewRoles ?? []).map(norm));
  const noDecide = (x: FlowRow): boolean => !!x.viewOnly || viewRole.has(norm(x.user));
  const flow = Object.fromEntries(
    STAGE_ORDER.map((st) => [
      st,
      src.flow.filter((x) => x.stage === st && !noDecide(x) && covers(x.bagts, bagts)).map((x) => x.user),
    ]),
  ) as Record<Stage, string[]>;
  const flowViewers = Object.fromEntries(
    STAGE_ORDER.map((st) => [
      st,
      src.flow.filter((x) => x.stage === st && noDecide(x) && covers(x.bagts, bagts)).map((x) => x.user),
    ]),
  ) as Record<Stage, string[]>;

  const byRole = (rows: ScopedRow[]): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      for (const g of r.grants) {
        if (!covers(g.bagts, bagts)) continue;
        if (!(out[g.role] ??= []).includes(r.user)) out[g.role].push(r.user);
      }
    }
    return out;
  };

  const huvaari = byRole(src.huvaari);
  const obyem = byRole(src.obyem);
  const chanar = byRole(src.chanar);
  const ajil = byRole(src.ajil ?? []);

  const gone = new Set((src.gone ?? []).map(norm));
  const live = <T extends Record<string, string[]>>(m: T): T => (gone.size
    ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.filter((x) => !gone.has(norm(x)))])) as T
    : m);

  const supers = new Set((src.supers ?? []).map(norm).filter((x) => !gone.has(x)));
  const L = { flow: live(flow), huvaari: live(huvaari), obyem: live(obyem), chanar: live(chanar), ajil: live(ajil) };
  const issues = pkgIssues(bagts, L.flow, L.huvaari, L.obyem, L.chanar, L.ajil);
  const colUsers = (id: string): string[] => {
    const [sys, role] = id.split(':');
    const m = (L as Record<string, Record<string, string[]>>)[sys];
    return (m?.[role] ?? []) as string[];
  };
  const noPlain = (i: PkgIssue): boolean =>
    !i.key.endsWith('SelfApprove') && i.key !== 'chanarOneManRoles' && !!i.cols?.length
    && i.cols.every((c) => colUsers(c).every((u) => supers.has(norm(u))));
  return {
    bagts, flow, flowViewers, huvaari, obyem, chanar, ajil,
    issues: supers.size ? issues.map((i) => (noPlain(i) ? { ...i, superOnly: true } : i)) : issues,
  };
}

/**
 * ӨӨРӨӨС НЬ ӨӨР БАТЛАГЧГҮЙ ЗОХИОГЧ БАЙНА УУ (2026-09-25, аудитын засвар).
 */
const noOther = (authors: string[], approvers: string[]): boolean =>
  authors.some((a) => !approvers.some((b) => b !== a));

/**
 * Багцын ЦООРХОЙГ илрүүлнэ.
 */
function pkgIssues(
  bagts: string,
  flow: Record<Stage, string[]>,
  huvaari: Record<string, string[]>,
  obyem: Record<string, string[]>,
  chanar: Record<string, string[]>,
  ajil: Record<string, string[]> = {},
): PkgIssue[] {
  const out: PkgIssue[] = [];

  /* ── Чанарын баримт — тухайн төрлийн хянагч БҮГД зөвшөөрөх ёстой ── */
  const cA = chanar.author ?? [];
  if (cA.length) {
    const missing = ['tuh', 'chanar', 'habea', 'tug', 'cheng']
      .filter((r) => noOther(cA, chanar[r] ?? []));
    if (missing.length) {
      out.push({ tone: 'warn', key: 'chanarNoReviewer', args: [bagts, missing.join(', ')], cols: missing.map((r) => `chanar:${r}`) });
    }
  }
  for (const c of reviewerClashes(chanar as Partial<Record<Reviewer, string[]>>, cA)) {
    out.push({
      tone: 'warn', key: 'chanarOneManRoles',
      args: [bagts, c.kinds.join(', '), c.roles.join(', '), c.users.join(', ')],
      cols: c.roles.map((r) => `chanar:${r}`),
    });
  }

  /* ── Хуваарь ── */
  const hA = huvaari.author ?? [];
  const hB = huvaari.approver ?? [];
  if (hA.length && !hB.length) {
    out.push({ tone: 'bad', key: 'huvaariNoApprover', args: [bagts], cols: ['huvaari:approver'] });
  } else if (hA.length && hB.length && noOther(hA, hB)) {
    out.push({ tone: 'bad', key: 'huvaariSelfApprove', args: [bagts, hB.join(', ')], cols: ['huvaari:author', 'huvaari:approver'] });
  }

  /* ── Обьём — хуваарьтай ИЖИЛ дүрэм ── */
  const oA = obyem.editor ?? [];
  const oB = obyem.approver ?? [];
  if (oA.length && !oB.length) {
    out.push({ tone: 'bad', key: 'obyemNoApprover', args: [bagts], cols: ['obyem:approver'] });
  } else if (oA.length && oB.length && noOther(oA, oB)) {
    out.push({ tone: 'bad', key: 'obyemSelfApprove', args: [bagts, oB.join(', ')], cols: ['obyem:editor', 'obyem:approver'] });
  }

  /* ── Нэмэлт ажил — обьёмтой ИЖИЛ дүрэм (`ajilBatlah.decideAjil` зохиогч=батлагчийг татгалзана) ── */
  const aA = ajil.editor ?? [];
  const aB = ajil.approver ?? [];
  if (aA.length && !aB.length) {
    out.push({ tone: 'bad', key: 'ajilNoApprover', args: [bagts], cols: ['ajil:approver'] });
  } else if (aA.length && aB.length && noOther(aA, aB)) {
    out.push({ tone: 'bad', key: 'ajilSelfApprove', args: [bagts, aB.join(', ')], cols: ['ajil:editor', 'ajil:approver'] });
  }

  /* ── Гүйцэтгэлийн урсгал — долоон шат бүрэн байх ёстой (2026-10-23: + төлөвлөлтийн инженер) ── */
  const gaps = STAGE_ORDER.filter((st) => flow[st].length === 0);
  if (gaps.length && gaps.length < STAGE_ORDER.length) {
    out.push({ tone: 'bad', key: 'flowGap', args: [bagts, String(gaps.length)], cols: gaps.map((st) => `flow:${st}`) });
  } else if (gaps.length === STAGE_ORDER.length) {
    out.push({ tone: 'warn', key: 'flowEmpty', args: [bagts], cols: gaps.map((st) => `flow:${st}`) });
  }

  return out;
}

/** Бүх багцын тойм — админы «юу дутуу вэ» дэлгэц */
export const allPkgErh = (src: ErhSource): PkgErh[] =>
  PKG_GROUPS.map((g) => pkgErh(src, g));

/** Бүх хэрэглэгчийн тойм — эрхгүй нь СҮҮЛД */
export const allUserErh = (src: ErhSource): UserErh[] =>
  src.users
    .map((u) => userErh(src, u))
    .sort((a, b) => Number(b.any) - Number(a.any) || a.user.localeCompare(b.user, 'mn'));

/* ══════════════════ БАГЦ × СИСТЕМИЙН МАТРИЦ (2026-09-25) ══════════════════ */

/** Матрицын нэг баганы систем */
export type MatrixSys = 'flow' | 'huvaari' | 'obyem' | 'ajil' | 'chanar';

/** Матрицын багана — `id` нь `PkgIssue.cols`-той таарна */
export type MatrixCol = { id: string; sys: MatrixSys; role: string };

/**
 * АРВАН ЕСӨН БАГАНА (2026-10-23: урсгал 7 шаттай): урсгал ×7 · Хуваарь ×2 · Обьём ×2 · Нэмэлт ажил ×2 ·
 * Чанарын баримт ×6 (2026-09-28: + ТУГ, + ЧХ инженер). 2026-10-23: QAQC багана хасагдсан.
 */
export const MATRIX_COLS: MatrixCol[] = [
  ...STAGE_ORDER.map((st): MatrixCol => ({ id: `flow:${st}`, sys: 'flow', role: st })),
  ...(['huvaari', 'obyem', 'ajil', 'chanar'] as const).flatMap((sys) =>
    Object.keys(ROLE_CAPS[sys]).map((role): MatrixCol => ({ id: `${sys}:${role}`, sys, role }))),
];

/** Матрицын нэг нүд */
export type MatrixCell = {
  /** Эзэд — тэр үүрэг/шатыг тэр багцад эзэмшдэг */
  owners: string[];
  /** «Зөвхөн харна» томилгоо — ЭЗЭН БИШ (урсгалын баганад л) */
  viewers: string[];
  /** `bad` — ажил гацна · `warn` — дутуу · `null` — хэвийн */
  tone: 'bad' | 'warn' | null;
};

export type MatrixRow = { bagts: string; cells: Record<string, MatrixCell>; issues: PkgIssue[] };

/**
 * Багц бүрийн мөр — нүд бүрд эзэд, харагчид ба өнгө.
 */
export function pkgMatrix(src: ErhSource): MatrixRow[] {
  return allPkgErh(src).map((p) => {
    const cells: Record<string, MatrixCell> = {};
    for (const c of MATRIX_COLS) {
      const owners = c.sys === 'flow' ? p.flow[c.role as Stage]
        : (p[c.sys][c.role] ?? []);
      const viewers = c.sys === 'flow' ? p.flowViewers[c.role as Stage] : [];
      const hit = p.issues.filter((i) => i.cols?.includes(c.id));
      const tone = hit.some((i) => i.tone === 'bad') ? 'bad' : hit.length ? 'warn' : null;
      cells[c.id] = { owners, viewers, tone };
    }
    return { bagts: p.bagts, cells, issues: p.issues };
  });
}

/**
 * ДЭД БҮТЦИЙН ХҮСНЭГТ — `BUTETS_PACKS` × «Засварлагч».
 */
export function butetsRows(
  src: ErhSource, packs: { key: string; name: string }[],
): { key: string; name: string; editors: string[] }[] {
  const rows = src.butets ?? [];
  return packs.map((p) => ({
    key: p.key,
    name: p.name,
    editors: rows
      .filter((r) => r.grants.some((g) => g.role === 'editor' && covers(g.bagts, p.key)))
      .map((r) => r.user),
  }));
}

/* ══════════════ ГАРГАЛГААТАЙ ЭРХ ↔ ХУВААРИЛАЛТ (2026-09-25) ══════════════ */

/** Тухайн системийн мөрүүд (`UserErh`-ээс) */
const linesOf = (u: UserErh, sys: (typeof SCOPED_SYSTEMS)[number]): RoleLine[] => u[sys];

/**
 * ЭРХИЙН ЭХ СУРВАЛЖ БОЛСОН БАГЦУУД.
 *   · `null` — бүх багц (`ALL_BAGTS`)
 *   · `[]`   — хуваарилалтгүй (энгийн эрх, эсвэл өнчин)
 *   · `[…]`  — заасан багцууд
 */
export function capBacking(u: UserErh, cap: CapKey): string[] | null {
  const sys = capSystem(cap);
  if (!sys) return [];
  const roles = rolesOfCap(cap);
  const lines = linesOf(u, sys).filter((l) => roles.includes(l.role));
  if (lines.some((l) => l.bagts === null)) return null;
  return [...new Set(lines.flatMap((l) => l.bagts ?? []))];
}

/** Эх сурвалж (хуваарилалт) байгаа эсэх */
const backed = (u: UserErh, cap: CapKey): boolean => {
  const b = capBacking(u, cap);
  return b === null || b.length > 0;
};

/**
 * ӨНЧИН ЭРХ — асаалттай атлаа тэр системд түүн рүү заадаг үүрэг алга.
 */
export function orphanCaps(u: UserErh): CapKey[] {
  if (u.codeSuper) return [];
  return (u.caps as CapKey[]).filter((c) => capSystem(c) !== null && !backed(u, c));
}

/**
 * ЭСРЭГ ТОХИОЛДОЛ — хуваарилалт бий атлаа эрх алга (эрх олголт унасан).
 */
export function missingCaps(u: UserErh): CapKey[] {
  if (u.codeSuper) return [];
  const out = new Set<CapKey>();
  for (const sys of SCOPED_SYSTEMS) {
    const map = ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>;
    for (const l of linesOf(u, sys)) {
      const c = map[l.role];
      if (c && !u.caps.includes(c)) out.add(c);
    }
  }
  return [...out];
}

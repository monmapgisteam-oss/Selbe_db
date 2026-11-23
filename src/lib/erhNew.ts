'use client';

/**
 * ШИНЭ ЭРХИЙН ДЭЛГЭЦИЙН ЦЭВЭР ЛОГИК (2026-11-23) — админ порталын «Шинэ эрх» бүлэг (Хүмүүс · Багцууд · Албан үүрэг).
 * Сүлжээ · React · localStorage · `window` үгүй (`erhNew.check.mjs` шалгана). Дэлгэц (`modules/ErhNew*.tsx`) нимгэн, бичих нь
 * `erhNewLive.ts`. Загвар өөрөө `jobModel.ts`.
 *
 *   · Хүснэгт — аккаунт бүрийн бодит мөрийг (`Snapshot`) хүн (`Person`) болгож, шүүнэ (`buildRows` · `filterRows`).
 *   · Хүний ноорог — засах алхам бүр ялгааг ДАХИН нормчилно (`tidy`): `compile(ноорог)` нь админы харсан эрх ЯГ мөн.
 *   · Хадгалах — `rightsDiff`-ийн жагсаалтаар баталгаажуулж, ЗӨВХӨН зөрсөн хэсгийг аюулгүй дарааллаар бичнэ (`writePlan`):
 *     аккаунтын мөр → гүйцэтгэлийн урсгал → багцын зургаан хуваарилалт → энгийн эрх.
 *   · ТЭЗҮ-БОНУ баримтын туг (`docs`) ажиллах үед нөлөөгүй (`Root.docsAllowed = !!access`) — энд харагдахгүй, хадгалахад
 *     одоогийн утга ХЭВЭЭР (`wantOf`), ялгааны тоонд ч орохгүй.
 *   · «Санхүүгийн бүртгэл — мөр нэмэх» (`finRow`) эрхийг ямар ч код шалгадаггүй — нэмэх сонголтод гарахгүй.
 */

import { capLabel } from '@/modules/capText';
import { issueText, roleLabel } from '@/modules/erhLabels';
import { STAGE_ORDER, type Stage } from './hyanalt';
import { STAGE_LABEL } from './hyanaltGroup';
import { PLAIN_CAPS, ROLE_CAPS, SCOPED_SYSTEMS } from './aclRoleCaps';
import { VIEWS, bagtsKey, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS, type CapKey } from './caps';
import { typeLabel } from './roleTypes';
import { t as tr } from './i18nCore';
import {
  ALL, CATALOG, JOB_DEFS, canDo, compile, coverage, decompile, describe, findDef, jobFit, normRights, personWith, replacePerson, rightsDiff,
  validate, whoCan,
  type Catalog, type Change, type Diff, type Grant, type JobDef, type PackageCoverage, type Person, type Problem,
  type Rights, type RightsInput, type Sys,
} from './jobModel';

/* ══════════════════════ Оролт ══════════════════════ */

/** Аккаунтын мөр (`permissions.listUsers`) — устгагдсан (tombstone) нь ОРОХГҮЙ */
export type Account = { user: string; role: Role | null; views: readonly string[] | 'all'; docs: boolean };
type FlowIn = { user: string; stage: string; bagts: readonly string[]; viewOnly?: boolean };
type AclIn = { user: string; grants: readonly { role: string; bagts: readonly string[] }[] };

/** Бүх хүний одоогийн мөрүүд — дуудагч (`erhNewLive.liveSnapshot`) дэлгүүрүүдээс угсарна */
export type Snapshot = {
  accounts: readonly Account[];
  flow: readonly FlowIn[];
  acl: Partial<Record<Sys, readonly AclIn[]>>;
  /** Жижиг үсгийн нэр → ХАДГАЛСАН эрхүүд (`caps.capsStored`) */
  caps: Readonly<Record<string, readonly string[]>>;
};

const lc = (s: string): string => s.trim().toLowerCase();
const uniq = <T,>(a: readonly T[]): T[] => [...new Set(a)];
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Нэг аккаунтын бодит эрх, нормчилсон (`jobModel.normRights`) */
export function rightsOf(snap: Snapshot, user: string, cat: Catalog = CATALOG): Rights {
  const k = lc(user);
  const a = snap.accounts.find((x) => lc(x.user) === k);
  const f = snap.flow.find((x) => lc(x.user) === k);
  const acl: NonNullable<RightsInput['acl']> = {};
  for (const sys of SCOPED_SYSTEMS) {
    const row = snap.acl[sys]?.find((x) => lc(x.user) === k);
    if (row) acl[sys] = row.grants;
  }
  return normRights({
    role: a?.role ?? null,
    views: a?.views ?? [],
    docs: a?.docs === true,
    flow: f ? { stage: f.stage, bagts: f.bagts, viewOnly: f.viewOnly === true } : null,
    acl,
    caps: snap.caps[k] ?? [],
  }, cat);
}

/* ══════════════════════ Хүний мөр ══════════════════════ */

/** Харагдах ялгаа — ТЭЗҮ-БОНУ (`docs`) нөлөөгүй тул тоологдохгүй, харагдахгүй */
export const shown = (d: Diff): boolean => d.kind !== 'docs';
export const diffCount = (p: Pick<Person, 'add' | 'remove'>): number =>
  p.add.filter(shown).length + p.remove.filter(shown).length;

/** Албан үүргийн шошго — тодорхойлолтгүй (хуучин) үүрэгт `typeLabel` */
export const jobLabel = (role: Role | null, defs: readonly JobDef[] = JOB_DEFS): string =>
  (role ? (findDef(defs, role)?.label ?? typeLabel(role)) : tr('Албан үүрэггүй'));

/** Багцын нэр — дэд бүтцийн хосгүй түлхүүрийг («БАГЦ1ХОЛБОО») нэрээр нь */
export const pkgName = (t: string, cat: Catalog = CATALOG): string =>
  (t === ALL ? tr('Бүх багц') : cat.butets.find((p) => p.key === t)?.name ?? t);

/** Хүний багцын жагсаалт — албан үүргийн хүрээгээр (`all` → бүх багц, `none` → хоосон) */
export function pkgListOf(p: Pick<Person, 'job' | 'bagts'>, defs: readonly JobDef[] = JOB_DEFS): string[] {
  const def = findDef(defs, p.job);
  if (def?.scope === 'all') return [ALL];
  if (!def || def.scope === 'none') return [];
  return [...p.bagts];
}

/** Багцын товч бичвэр — «Багц-1, Багц-2 +3» · «Бүх багц» · «—» */
export function pkgShort(list: readonly string[], max = 2, cat: Catalog = CATALOG): string {
  if (list[0] === ALL) return tr('Бүх багц');
  if (!list.length) return '—';
  const head = list.slice(0, max).map((t) => pkgName(t, cat)).join(', ');
  return list.length > max ? `${head} +${list.length - max}` : head;
}

export type PersonRow = {
  /** Харагдах нэр (аккаунтын бичлэгээр) */
  user: string;
  /** Жижиг үсгээр — түлхүүр */
  key: string;
  rights: Rights;
  person: Person;
  jobLabel: string;
  pkgs: string[];
  pkgText: string;
  diffs: number;
  problems: Problem[];
  /** Энэ хүн юу хийж чадах вэ */
  can: string[];
  /** Хайлтын бичвэр (жижиг үсгээр) */
  hay: string;
};

export function personRow(user: string, rights: Rights, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): PersonRow {
  const person = decompile(user, rights, defs, cat);
  const pkgs = pkgListOf(person, defs);
  const can = canDo(rights, defs, cat);
  const label = jobLabel(person.job, defs);
  const chips = [...person.add, ...person.remove].filter(shown).map((d) => describe(d, defs, cat));
  return {
    user,
    key: lc(user),
    rights,
    person,
    jobLabel: label,
    pkgs,
    pkgText: pkgShort(pkgs, 2, cat),
    diffs: diffCount(person),
    problems: validate(person, defs, cat),
    can,
    hay: lc([user, label, ...pkgs.map((t) => pkgName(t, cat)), ...can, ...chips].join(' ')),
  };
}

/** Бүх аккаунтын мөр — нэрээр эрэмбэлсэн */
export function buildRows(snap: Snapshot, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): PersonRow[] {
  return snap.accounts
    .map((a) => personRow(a.user, rightsOf(snap, a.user, cat), defs, cat))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Шинжилгээний оролт (`coverage` · `whoCan`) */
export const holdersOf = (rows: readonly PersonRow[]): { user: string; rights: Rights }[] =>
  rows.map((r) => ({ user: r.key, rights: r.rights }));

/* ══════════════════════ Шүүлт ══════════════════════ */

/** «Албан үүрэггүй» шүүлтүүр */
export const NO_JOB = '-';
export type PeopleFilter = { q?: string; job?: string; pkg?: string; diff?: boolean; problem?: boolean };

/**
 * Хайлт: үг БҮР нэр · албан үүрэг · багц · «юу хийж чадах» (эрх · үүрэг · шат · харагдацын шошго) · ялгааны аль нэгэнд
 * таарах ёстой. Багцын шүүлт — тэр багцад ямар нэг томилгоотой (`whoCan({ bagts })`).
 */
export function filterRows(
  rows: readonly PersonRow[], f: PeopleFilter, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): PersonRow[] {
  const terms = lc(f.q ?? '').split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.job && (f.job === NO_JOB ? r.person.job !== null : r.person.job !== f.job)) return false;
    if (f.diff && !r.diffs) return false;
    if (f.problem && !r.problems.length) return false;
    if (f.pkg && !whoCan({ bagts: f.pkg }, [{ user: r.key, rights: r.rights }], defs, cat).length) return false;
    return terms.every((t) => r.hay.includes(t));
  });
}

/* ══════════════════════ Албан үүргийн бүлэг ══════════════════════ */

const GROUPS: readonly { title: () => string; keys: readonly Role[] }[] = [
  { title: () => tr('Гүйцэтгэгч'), keys: ['guitsetgegch', 'guitshabea'] },
  { title: () => tr('Хяналт'), keys: ['injener', 'menejer', 'tolovloltiin', 'eronhii'] },
  { title: () => tr('Удирдлага'), keys: ['heltsiin', 'gazriin', 'zahiral', 'super'] },
  { title: () => tr('Мэргэжилтэн'), keys: ['habea', 'butets', 'zurag', 'gazar', 'sanhuu', 'chanar'] },
];

/** Сонгогчийн таван бүлэг — бүлэгт ороогүй тодорхойлолт «Бусад»-д */
export function jobGroups(defs: readonly JobDef[] = JOB_DEFS): { title: string; defs: JobDef[] }[] {
  const used = new Set<string>(GROUPS.flatMap((g) => g.keys));
  const out = GROUPS.map((g) => ({ title: g.title(), defs: g.keys.map((k) => findDef(defs, k)).filter((d): d is JobDef => !!d) }));
  out.push({ title: tr('Бусад'), defs: defs.filter((d) => !used.has(d.key)) });
  return out.filter((g) => g.defs.length > 0);
}

/* ══════════════════════ Багцын сонголт ══════════════════════ */

/** Багцын «гэр бүл» — «Багц-3.1» → «Багц-3» (цэгтэй дугаартай багцад л) */
export const pkgFamily = (g: string): string => /^(.*\d)\.\d+$/.exec(g)?.[1] ?? g;

/** Хоёроос олон гишүүнтэй гэр бүлүүд — сонгогчийн «Багц-5 бүгд» товч */
export function pkgFamilies(list: readonly string[]): { family: string; members: string[] }[] {
  const by = new Map<string, string[]>();
  for (const g of list) {
    const f = pkgFamily(g);
    if (f !== g) by.set(f, [...(by.get(f) ?? []), g]);
  }
  return [...by].filter(([, m]) => m.length > 1).map(([family, members]) => ({ family, members }));
}

/** Систем бүрийн сонгож болох багц — дэд бүтэц түлхүүр+нэрээр, ХАБЭА Багц 1 … 4.2 */
export function pkgOptions(space: Sys | 'flow' | 'person', cat: Catalog = CATALOG): { key: string; name: string }[] {
  if (space === 'butets') return cat.butets.map((p) => ({ key: p.key, name: p.name }));
  if (space === 'habea') return cat.habea.map((g) => ({ key: g, name: g }));
  if (space === 'person') {
    const paired = new Set(cat.groups.map((g) => bagtsKey(g)));
    return [
      ...cat.groups.map((g) => ({ key: g, name: g })),
      /* хосгүй дэд бүтцийн багц — хүний жагсаалтад түлхүүрээрээ (`jobModel` — зөвхөн дэд бүтцэд үйлчилнэ) */
      ...cat.butets.filter((p) => !paired.has(p.key)).map((p) => ({ key: p.key, name: p.name })),
    ];
  }
  return cat.groups.map((g) => ({ key: g, name: g }));
}

/* ══════════════════════ Хүний ноорог засах ══════════════════════ */

/** Ялгааг ДАХИН нормчилно — `compile` нь хэвээр, ялгаа хамгийн цөөн, ижил албан үүрэг · багцаар */
export const tidy = (p: Person, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Person =>
  personWith(p.user, compile(p, defs, cat), p.job, p.bagts, defs, cat);

/** Хүний одоо барьж буй багцууд (урсгал · хуваарь · обьём · нэмэлт ажил · чанар) — `PKG_GROUPS`-ийн нэрээр; `*` бол бүгд */
export function touchedPkgs(r: Rights, cat: Catalog = CATALOG): string[] {
  const lists = [r.flow?.bagts ?? [], ...(['huvaari', 'obyem', 'ajil', 'chanar'] as const).flatMap((sys) => (r.acl[sys] ?? []).map((g) => g.bagts))];
  if (lists.some((l) => l[0] === ALL)) return [ALL];
  const on = new Set(lists.flat());
  return cat.groups.filter((g) => on.has(g));
}

/**
 * АЛБАН ҮҮРЭГ СОЛИХ — шинэ албан үүргийн эрх үйлчилж, хуучных арилна:
 *   · «хассан» ялгаа арилна (хуучин үүргийнх байсан); «нэмсэн» ялгаа ХЭВЭЭР (тухайн хүний онцгой эрх) — гэхдээ шинэ үүрэг өөрөө
 *     шаттай бол «нэмсэн» шат арилна (нэг аккаунт = нэг шат; шатыг шинэ үүрэг тодорхойлно)
 *   · багцын жагсаалт — шинэ үүрэг багцаар ажилладаг бол хэвээр; хоосон бол одоо барьж буй багцуудаас (`touchedPkgs`)
 */
export function setJob(p: Person, job: Role | null, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Person {
  const def = findDef(defs, job);
  const pk = def?.scope === 'packages';
  const bagts = !pk ? [] : p.bagts.length ? [...p.bagts] : touchedPkgs(compile(p, defs, cat), cat);
  const add = def?.stage ? p.add.filter((d) => d.kind !== 'stage') : p.add;
  return tidy({ user: p.user, job, bagts, add, remove: [] }, defs, cat);
}

/**
 * БАГЦЫН ЖАГСААЛТ СОЛИХ — шинээр нэмсэн багцад албан үүргийн эрх БҮРЭН олгогдоно: тэр багцыг «хассан» ялгаанаас авна
 * (эс бөгөөс жагсаалтад нэмсэн ч эрх гарахгүй — админыг төөрөгдүүлнэ).
 */
export function setBagts(p: Person, bagts: readonly string[], defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Person {
  const old = new Set(p.bagts);
  const added = bagts.filter((b) => !old.has(b));
  const remove = added.includes(ALL)
    ? p.remove.filter((d) => d.kind !== 'role' && d.kind !== 'stage')
    : p.remove.flatMap((d): Diff[] => {
      if (d.kind !== 'role' && d.kind !== 'stage') return [d];
      const left = d.bagts.filter((b) => !added.includes(b));
      return left.length ? [{ ...d, bagts: left }] : [];
    });
  return tidy({ ...p, bagts: [...bagts], remove }, defs, cat);
}

/** Эрх нэмэх («нэмсэн» ялгаа) */
export const addRight = (p: Person, d: Diff, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Person =>
  tidy({ ...p, add: [...p.add, d] }, defs, cat);

/** Ялгааны чип хасах — «нэмсэн»-ийг хасвал эрх алга болно, «хассан»-ыг хасвал албан үүргийн эрх буцна */
export function dropDiff(
  p: Person, side: 'add' | 'remove', d: Diff, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): Person {
  return tidy({ ...p, [side]: p[side].filter((x) => !same(x, d)) }, defs, cat);
}

/** Албан үүргээс ирэх нэг эрх (хасаж болох) */
export type Item = { id: string; diff: Diff; text: string };

/** Хоёр багцын жагсаалтын огтлолцол (`*` = бүгд) */
const meet = (a: readonly string[], b: readonly string[]): string[] => {
  if (a[0] === ALL) return [...b];
  if (b[0] === ALL) return [...a];
  return a.filter((x) => b.includes(x));
};

/** АЛБАН ҮҮРГЭЭС ирж, ОДОО үйлчилж буй эрхүүд — хасвал «хассан» ялгаа болно (`dropBase`) */
export function baseItems(p: Person, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Item[] {
  const base = compile({ ...p, add: [], remove: [] }, defs, cat);
  const now = compile(p, defs, cat);
  const out: Item[] = [];
  const push = (id: string, diff: Diff): void => { out.push({ id, diff, text: describe(diff, defs, cat) }); };
  if (base.flow && now.flow?.stage === base.flow.stage) {
    const bagts = meet(base.flow.bagts, now.flow.bagts);
    if (bagts.length) push('flow', { kind: 'stage', stage: base.flow.stage, bagts, ...(base.flow.viewOnly ? { viewOnly: true } : {}) });
  }
  for (const sys of SCOPED_SYSTEMS) {
    for (const g of base.acl[sys] ?? []) {
      const cur = now.acl[sys]?.find((x) => x.role === g.role)?.bagts ?? [];
      const bagts = meet(g.bagts, cur);
      if (bagts.length) push(`acl:${sys}:${g.role}`, { kind: 'role', sys, role: g.role, bagts });
    }
  }
  for (const c of base.caps) if (now.caps.includes(c)) push(`cap:${c}`, { kind: 'cap', cap: c });
  for (const v of base.views) if (now.views.includes(v)) push(`view:${v}`, { kind: 'view', view: v });
  return out;
}

/** Албан үүргийн эрхийг энэ хүнээс хасна («хассан» ялгаа) */
export const dropBase = (p: Person, item: Item, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Person =>
  tidy({ ...p, remove: [...p.remove, item.diff] }, defs, cat);

/** Ялгааны чипийн бичвэр */
export const diffText = (d: Diff, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): string => describe(d, defs, cat);

/* ══════════════════════ «+ Эрх нэмэх»-ийн сонголт ══════════════════════ */

/** Системийн нэр (сонголтод) */
export function sysName(sys: Sys): string {
  if (sys === 'huvaari') return tr('Хуваарь');
  if (sys === 'obyem') return tr('Инженерийн обьём');
  if (sys === 'ajil') return tr('Нэмэлт ажил');
  if (sys === 'chanar') return tr('Чанарын баримт');
  if (sys === 'butets') return tr('Дэд бүтцийн засвар');
  return tr('ХАБЭА');
}

/** Шууд олгож болох энгийн эрхүүд — `finRow` нөлөөгүй тул ОРОХГҮЙ */
export const ADDABLE_CAPS: readonly CapKey[] = PLAIN_CAPS.filter((c) => c !== 'finRow');

/** Багцын үүргийн сонголт — систем × үүрэг */
export const roleChoices = (): { sys: Sys; role: string; label: string }[] =>
  SCOPED_SYSTEMS.flatMap((sys) => Object.keys(ROLE_CAPS[sys]).map((role) => ({
    sys, role, label: `${sysName(sys)} — ${roleLabel(sys, role)}`,
  })));

/** «Хяналтын хугацаа» нь «Гүйцэтгэл»-ийг хардаг хүнд автоматаар нээгдэнэ (`permissions.resolveAccess`) */
export const AUTO_VIEW: ViewKey = 'hyanaltHugatsaa';
export const autoHugatsaa = (r: Pick<Rights, 'flow' | 'role'>): boolean => !!r.flow || r.role === 'zahiral';

/** Нэмж болох харагдацууд — урсгалын бус, одоо байхгүй; «Гүйцэтгэл»-тэй хүнд «Хяналтын хугацаа» ОРОХГҮЙ (автоматаар) */
export const viewChoices = (r: Rights): ViewKey[] =>
  VIEWS.map((v) => v.key).filter((k) => !WORKFLOW_VIEWS.includes(k) && !r.views.includes(k) && !(k === AUTO_VIEW && autoHugatsaa(r)));

export const viewTitle = (k: ViewKey): string => VIEWS.find((v) => v.key === k)?.title ?? k;

/* ══════════════════════ Албан үүргийн санал ══════════════════════ */

/**
 * ӨӨР АЛБАН ҮҮРЭГ ялгааг цөөлөх үү — `jobFit`-ийн эхнийх одоогийнхоос өөр, ялгаа нь БАГА бол. Админ (`super`) — хэзээ ч
 * санал болгохгүй (админыг доошлуулах санал гаргахгүй).
 */
export function suggestion(
  draft: Person, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): { def: JobDef; person: Person; saves: number } | null {
  if (draft.job === 'super' || findDef(defs, draft.job)?.admin) return null;
  const best = jobFit(compile(draft, defs, cat), defs, cat)[0];
  if (!best || best.def.key === draft.job || best.def.admin) return null;
  const saves = diffCount(draft) - diffCount(best.person);
  return saves > 0 ? { def: best.def, person: { ...best.person, user: draft.user }, saves } : null;
}

/* ══════════════════════ Хадгалах ══════════════════════ */

/** Бичих эрх: ноорог + ТЭЗҮ-БОНУ туг ОДООГИЙНХОО (шинэ аккаунтад албан үүргийнх) */
export function wantOf(draft: Person, have: Rights, isNew: boolean, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Rights {
  const w = compile(draft, defs, cat);
  return isNew ? w : { ...w, docs: have.docs };
}

/** Баталгаажуулах жагсаалт — «Нэмнэ — …» / «Хасна — …» */
export const confirmList = (want: Rights, have: Rights, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Change[] =>
  rightsDiff(want, have, defs, cat);

export type Step =
  | { kind: 'account'; role: Role | null; views: ViewKey[]; docs: boolean }
  /** `flow: null` = томилгооноос хасна */
  | { kind: 'flow'; flow: Rights['flow']; from: Rights['flow'] }
  /** `grants: []` = хуваарилалтаас бүрэн хасна */
  | { kind: 'acl'; sys: Sys; grants: Grant[] }
  | { kind: 'caps'; add: CapKey[]; remove: CapKey[] };

/**
 * БИЧИХ ТӨЛӨВЛӨГӨӨ — ЗӨВХӨН зөрсөн хэсэг, аюулгүй дарааллаар:
 *   1. аккаунтын мөр (үүрэг · харагдац) — шинэ аккаунт эхлээд үүснэ; Ерөнхий захирлаас шилжихэд урсгалд томилох эрх нээгдэнэ
 *   2. гүйцэтгэлийн урсгал — нэг шат, багц, «зөвхөн харна»
 *   3. багцын зургаан хуваарилалт — хуваарилалт өөрөө үүргийн эрхийг олгож/буцаана
 *   4. энгийн эрх — зөвхөн нэмсэн/хассан (бусад админы завсрын өөрчлөлт хадгалагдана)
 */
export function writePlan(want: Rights, have: Rights, isNew: boolean): Step[] {
  const out: Step[] = [];
  if (isNew || want.role !== have.role || !same(want.views, have.views) || want.docs !== have.docs) {
    out.push({ kind: 'account', role: want.role, views: [...want.views], docs: want.docs });
  }
  if (!same(want.flow, have.flow)) out.push({ kind: 'flow', flow: want.flow, from: have.flow });
  for (const sys of SCOPED_SYSTEMS) {
    const w = want.acl[sys] ?? [], h = have.acl[sys] ?? [];
    if (!same(w, h)) out.push({ kind: 'acl', sys, grants: w.map((g) => ({ role: g.role, bagts: [...g.bagts] })) });
  }
  const add = want.caps.filter((c) => !have.caps.includes(c));
  const remove = have.caps.filter((c) => !want.caps.includes(c));
  if (add.length || remove.length) out.push({ kind: 'caps', add, remove });
  return out;
}

/** Алхмын нэр — үр дүнгийн жагсаалтад */
export function stepLabel(s: Step): string {
  if (s.kind === 'account') return tr('Аккаунтын мөр (албан үүрэг · харагдац)');
  if (s.kind === 'flow') return tr('Гүйцэтгэлийн урсгал');
  if (s.kind === 'acl') return sysName(s.sys);
  return tr('Энгийн эрх');
}

/** Ноорогт хадгалахыг хаах алдаа (`validate`-ийн `error`) */
export const blockers = (draft: Person, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Problem[] =>
  validate(draft, defs, cat).filter((x) => x.level === 'error');

/* ══════════════════════ Шинэ аккаунт · хүн солих ══════════════════════ */

/** ArcGIS хэрэглэгчийн нэрийн бүтэц — хуучин самбарын `add`-тай ижил */
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9@._-]{2,127}$/;

export function newNameError(name: string, existing: readonly string[], removed: readonly string[]): string | null {
  const n = name.trim();
  if (!n) return null;
  if (!NAME_RE.test(n)) return tr('«{0}» нь ArcGIS хэрэглэгчийн нэрийн бүтцэд тохирохгүй (латин үсэг/тоо, 3+ тэмдэгт).', n);
  const k = lc(n);
  if (existing.some((u) => lc(u) === k)) return tr('«{0}» аль хэдийн жагсаалтад байна.', n);
  if (removed.some((u) => lc(u) === k)) return tr('«{0}» устгагдсан — «Хэрэглэгчдийн эрх удирдах» хуудасны «Буцаах» товчоор сэргээнэ үү.', n);
  return null;
}

/** Шинэ аккаунтын анхны ноорог — «Мэдээлэл танилцах» */
export const newPerson = (user: string, job: Role = 'taniltsah'): Person =>
  ({ user: lc(user), job, bagts: [], add: [], remove: [] });

/**
 * «ЯГ ЭНЭ ХҮН ШИГ» / «ХҮН СОЛИХ» — `from`-ын албан үүрэг · багц · ялгааг `to`-д. Урьдчилан харах: `to`-гийн одоогийнхоос юу
 * нэмэгдэж, хасагдах вэ (ТЭЗҮ-БОНУ туг `to`-гийнхоо).
 */
export function copyPreview(
  from: Person, to: string, toRights: Rights | null, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): { person: Person; changes: Change[] } {
  const person = replacePerson(from, to);
  const have = toRights ?? normRights({}, cat);
  const want = wantOf(person, have, !toRights, defs, cat);
  return { person, changes: confirmList(want, have, defs, cat) };
}

/* ══════════════════════ Багцуудын хамралт ══════════════════════ */

export type Tone = 'bad' | 'warn' | null;
export type SlotDef = { id: string; sys: 'flow' | Sys; role: string; group: () => string; label: () => string };

/** Багц бүрийн үүрүүд — урсгалын 7 шат · хуваарь · обьём · нэмэлт ажил · чанар · дэд бүтэц · ХАБЭА */
export const SLOT_DEFS: readonly SlotDef[] = [
  ...STAGE_ORDER.map((st): SlotDef => ({ id: `flow:${st}`, sys: 'flow', role: st, group: () => tr('Гүйцэтгэлийн урсгал'), label: () => STAGE_LABEL[st] })),
  ...SCOPED_SYSTEMS.flatMap((sys) => Object.keys(ROLE_CAPS[sys]).map((role): SlotDef => ({
    id: `${sys}:${role}`, sys, role, group: () => sysName(sys), label: () => roleLabel(sys, role),
  }))),
];

export type Slot = { id: string; group: string; label: string; holders: string[]; viewers: string[]; tone: Tone; why: string };
export type PkgRow = { bagts: string; slots: Slot[]; issues: { tone: Exclude<Tone, null>; text: string; users: string[] }[]; tone: Tone };

const CHANAR_REVIEWERS = ['tuh', 'chanar', 'habea', 'tug', 'cheng'] as const;
const worse = (a: Tone, b: Tone): Tone => (a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : null);

/**
 * `coverage` → дэлгэцийн мөр. Өнгө:
 *   · `stuck` — улаан («ажил зогсоно»); Гүйцэтгэгч компанигүй урсгал ҮРГЭЛЖ улаан (одоогийн тоймын шийдвэр)
 *   · `gap` — шар («дутуу»); урсгал бүхэлдээ хоосон бол бусад шат шар
 *   · бусад системийн `empty` — тэр багцад систем хэрэглэгдээгүй, өнгөгүй
 *   · зөрчил (өөрийгөө батлах · нэг багцад олон зохиогч) ба нэг хүн чанарын олон хянагч үүрэгтэй — шар
 */
export function pkgRows(cov: readonly PackageCoverage[]): PkgRow[] {
  return cov.map((c) => {
    const issues: PkgRow['issues'] = [];
    const slots: Slot[] = SLOT_DEFS.map((d) => {
      const holders = d.sys === 'flow' ? c.flow[d.role as Stage] : (c[d.sys][d.role] ?? []);
      const viewers = d.sys === 'flow' ? c.flowViewers[d.role as Stage] : [];
      const m = c.missing.find((x) => x.sys === d.sys && x.role === d.role);
      let tone: Tone = null;
      if (m?.level === 'stuck') tone = 'bad';
      else if (m?.level === 'gap') tone = 'warn';
      else if (m?.level === 'empty' && d.sys === 'flow') tone = d.role === 'company' ? 'bad' : 'warn';
      return { id: d.id, group: d.group(), label: d.label(), holders, viewers, tone, why: m && tone ? m.text : '' };
    });
    const flowEmpty = STAGE_ORDER.every((st) => !c.flow[st].length);
    if (flowEmpty) issues.push({ tone: 'bad', text: issueText({ tone: 'warn', key: 'flowEmpty', args: [c.bagts] }), users: [] });
    const seen = new Set<string>();
    for (const s of slots) {
      if (!s.tone || !s.why || seen.has(s.why) || (flowEmpty && s.id.startsWith('flow:'))) continue;
      seen.add(s.why);
      issues.push({ tone: s.tone, text: s.why, users: [] });
    }
    const mark = (ids: string[], text: string): void => {
      for (const s of slots) if (ids.includes(s.id)) { s.tone = worse(s.tone, 'warn'); if (!s.why) s.why = text; }
    };
    for (const x of c.conflicts) {
      issues.push({ tone: 'warn', text: x.text, users: x.users });
      mark(x.roles.map((r) => `${x.sys}:${r}`), x.text);
    }
    /* Нэг хүн чанарын хэд хэдэн хянагч үүрэгтэй (2026-11-23, шийдвэр) — хараат бус хяналт алдагдана */
    const users = uniq(CHANAR_REVIEWERS.flatMap((r) => c.chanar[r] ?? []));
    for (const u of users) {
      const roles = CHANAR_REVIEWERS.filter((r) => (c.chanar[r] ?? []).includes(u));
      if (roles.length < 2) continue;
      const text = tr('{0}: {1} чанарын баримтыг {2} үүргээр давхар хянана — нэг хүн нэг л хянагч үүрэгтэй байхыг зөвлөнө.',
        c.bagts, u, roles.map((r) => roleLabel('chanar', r)).join(', '));
      issues.push({ tone: 'warn', text, users: [u] });
      mark(roles.map((r) => `chanar:${r}`), text);
    }
    const tone = slots.reduce<Tone>((t, s) => worse(t, s.tone), issues.reduce<Tone>((t, i) => worse(t, i.tone), null));
    return { bagts: c.bagts, slots, issues, tone };
  });
}

/**
 * ШИНЭЭР ҮҮСЭХ ГАЦАА — энэ хүний эрх `want` болбол (`null` = аккаунт хасагдвал) ӨМНӨ байгаагүй «ажил зогсоно» асуудлууд,
 * бусад хүн хэвээр. Баталгаажуулах жагсаалтад (хуучин самбарын `aclOps.newBlockingText`-ийн ижил зорилго).
 */
export function newStuck(
  rows: readonly PersonRow[], user: string, want: Rights | null, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): string[] {
  const k = lc(user);
  const before = holdersOf(rows);
  const after = [...before.filter((h) => h.user !== k), ...(want ? [{ user: k, rights: want }] : [])];
  const bad = (hs: typeof before): string[] =>
    pkgRows(coverage(hs, defs, cat.groups, cat)).flatMap((r) => r.issues.filter((i) => i.tone === 'bad').map((i) => i.text));
  const had = new Set(bad(before));
  return uniq(bad(after).filter((t) => !had.has(t)));
}

/** Нэг мөрийн хураангуй — «Хүмүүс»-ийн дээд мөрөнд */
export const covSummary = (rows: readonly PkgRow[]): { bad: number; warn: number } =>
  ({ bad: rows.filter((r) => r.tone === 'bad').length, warn: rows.filter((r) => r.tone === 'warn').length });

/* ══════════════════════ Хэн … хийж чадах вэ ══════════════════════ */

export type WhoQuery = { cap?: CapKey; sys?: Sys; role?: string; stage?: Stage };
export type WhoChoice = { id: string; group: string; label: string; q: WhoQuery };

/** Хайлтын сонголт — шат · багцын үүрэг · энгийн эрх */
export function whoChoices(): WhoChoice[] {
  return [
    ...STAGE_ORDER.map((st): WhoChoice => ({
      id: `stage:${st}`, group: tr('Гүйцэтгэлийн урсгал'),
      label: st === 'company' ? tr('Гүйцэтгэлийг бөглөж илгээх ({0})', STAGE_LABEL[st]) : tr('Гүйцэтгэлийг хянах — {0}', STAGE_LABEL[st]),
      q: { stage: st },
    })),
    ...roleChoices().map((r): WhoChoice => ({ id: `role:${r.sys}:${r.role}`, group: tr('Багцын үүрэг'), label: r.label, q: { sys: r.sys, role: r.role } })),
    ...ADDABLE_CAPS.map((c): WhoChoice => ({ id: `cap:${c}`, group: tr('Энгийн эрх'), label: capLabel(c), q: { cap: c } })),
  ];
}

/** Хэн чадах вэ — жижиг үсгийн нэрс (`jobModel.whoCan`) */
export function whoCanRows(
  q: WhoQuery, bagts: string | null, rows: readonly PersonRow[], defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): string[] {
  return whoCan({ ...q, ...(bagts ? { bagts } : {}) }, holdersOf(rows), defs, cat);
}

/* ══════════════════════ Албан үүргийн жагсаалт ══════════════════════ */

export type JobInfo = {
  def: JobDef; stage: string; scope: string; roles: string[]; caps: string[]; views: string[]; count: number;
};

/** «Албан үүрэг» хуудасны мөр — шошгоор (түлхүүр биш) */
export function jobInfos(rows: readonly PersonRow[], defs: readonly JobDef[] = JOB_DEFS): JobInfo[] {
  return defs.map((def) => ({
    def,
    stage: def.stage ? STAGE_LABEL[def.stage] : '—',
    scope: def.scope === 'packages' ? tr('Өөрийн багцууд') : def.scope === 'all' ? tr('Бүх багц') : tr('Багцгүй'),
    roles: def.pkgRoles.map((p) => `${sysName(p.sys)} — ${roleLabel(p.sys, p.role)}`),
    caps: def.caps.map(capLabel),
    views: def.views.map(viewTitle),
    count: rows.filter((r) => r.person.job === def.key).length,
  }));
}

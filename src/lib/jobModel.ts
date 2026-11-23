'use client';

/**
 * АЛБАН ҮҮРГИЙН ЗАГВАР (2026-11-23) — эрхийн тохиргооны шинэ загварын 1-р үе шат: ЦЭВЭР сан (сүлжээ · React · localStorage ·
 * `window` үгүй), ажиллаж буй апп-ын зан төлөвийг ӨӨРЧЛӨХГҮЙ.
 *
 * Зорилго: админ нэг хүнд ЗӨВХӨН «хэн · албан үүрэг · аль багц» гурвыг оруулна. Систем албан үүргийн тодорхойлолтоос
 * (`JobDef`) бодит эрхийг (`Rights` — одоогийн мөрүүд: үүрэг · харагдац · урсгалын шат · багцын зургаан хуваарилалт ·
 * энгийн эрх) гаргана (`compile`). Ажиллах үеийн эрхийн шалгалтууд тэр мөрүүдийг л уншдаг тул хөндөгдөхгүй.
 *
 *   · Хүн бүрийн ОНЦГОЙ тохиолдол — «нэмсэн» (`add`) ба «хассан» (`remove`) ялгаа (`Diff`) болж ИЛ хадгалагдана.
 *   · Тодорхойлолт АМЬД: тодорхойлолтыг өөрчлөхөд тэр албан үүрэгтэй бүх хүний эрх дагана (`mergeDefs`).
 *   · `decompile` — одоогийн мөрүүдээс хүнийг сэргээнэ: `compile(decompile(x)) = x` (нормчилсны дараа) ҮРГЭЛЖ биелнэ.
 *
 * БАГЦЫН ГУРВАН НЭРИЙН ОРОН ЗАЙ (`Catalog`) ба хүний багцын жагсаалт (`Person.bagts`):
 *   · урсгал · хуваарь · обьём · нэмэлт ажил · чанар — `PKG_GROUPS`-ийн нэр («Багц-5.1»)
 *   · дэд бүтэц — `BUTETS_PACKS`-ийн түлхүүр («БАГЦ51»)
 *   · ХАБЭА — `PKG_GROUPS`-ийн дэд олонлог (Багц 1 … 4.2; `habeaAcl.HABEA_PKGS`-тэй ижил дүрэм)
 * Хүний жагсаалт `PKG_GROUPS`-ийн нэрээр бичигдэнэ. Дүрэм нь `huvaariView.ownPkgScope`-ынхтой ИЖИЛ: багцын нэр `g` нь дэд
 * бүтцийн `bagtsKey(g)` түлхүүртэй багц. `PKG_GROUPS`-д хосгүй дэд бүтцийн багц («БАГЦ1ХОЛБОО» …) жагсаалтад ТҮЛХҮҮРЭЭРЭЭ
 * орж, зөвхөн дэд бүтцийн системд үйлчилнэ. Тухайн системд хүчингүй багц тэр системд ТООЦОГДОХГҮЙ.
 */

import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { capLabel } from '@/modules/capText';
import { bagtsText, issueText, roleLabel } from '@/modules/erhLabels';
import { REVIEW_STAGES, STAGE_ORDER, type Stage } from './hyanalt';
import { STAGE_LABEL } from './hyanaltGroup';
import { PLAIN_CAPS, ROLE_CAPS, SCOPED_SYSTEMS, isDerivedCap } from './aclRoleCaps';
import { BUTETS_PACKS } from './butetsPacks';
import { ROLE_ACCESS, VIEWS, bagtsKey, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS, type CapKey } from './caps';
import { _defaultTpl, hvScopeOf, typeLabel } from './roleTypes';
import { t as tr } from './i18nCore';

/* ══════════════════════ Төрлүүд ══════════════════════ */

/** «Бүх багц» — хуваарилалтын мөрүүдийн `ALL_BAGTS`-тай ижил тэмдэг */
export const ALL = '*';

export type PkgRole = { sys: 'huvaari' | 'obyem' | 'ajil' | 'chanar' | 'butets' | 'habea'; role: string };
export type Sys = PkgRole['sys'];
/** Багцын жагсаалттай зүйл: зургаан систем + гүйцэтгэлийн урсгал */
type Space = Sys | 'flow';

export type JobDef = {
  /** Аккаунтын мөрийн `role` */
  key: Role;
  label: string;
  /** Өөрийн багцууд дээр барих урсгалын шат */
  stage: Stage | null;
  stageViewOnly?: boolean;
  /** Өөрийн багцууд дээр барих багцын үүргүүд */
  pkgRoles: PkgRole[];
  /** ЗӨВХӨН энгийн эрх — хуваарилалтаас гардаг эрх `pkgRoles`-оос ирнэ */
  caps: CapKey[];
  /** Урсгалын бус харагдацууд */
  views: ViewKey[];
  /** ТЭЗҮ-БОНУ баримт (2026-11-23: загварын `docs` тохиргоо — эрхийн мөрийн `docs` талбар) */
  docs: boolean;
  huvaariView: 'all' | 'own' | 'none';
  home: ViewKey;
  /** Багцын жагсаалт хэрэгтэй юу: `all` = бүх багц (`*`), `none` = багцгүй */
  scope: 'packages' | 'all' | 'none';
  admin?: boolean;
};

/**
 * НЭГ ЯЛГАА. 2026-11-23: `docs` төрөл нэмэгдсэн — эрхийн мөрийн `docs` талбар албан үүргийнхээс зөрөх тохиолдлыг
 * илэрхийлэхгүй бол `compile(decompile(x)) = x` биелэхгүй.
 */
export type Diff =
  | { kind: 'cap'; cap: CapKey }
  | { kind: 'role'; sys: Sys; role: string; bagts: string[] }
  | { kind: 'view'; view: ViewKey }
  | { kind: 'stage'; stage: Stage; bagts: string[]; viewOnly?: boolean }
  | { kind: 'docs' };

export type Person = { user: string; job: Role | null; bagts: string[]; add: Diff[]; remove: Diff[] };

export type Grant = { role: string; bagts: string[] };
/** НЭГ хэрэглэгчийн бодит мөрүүд, нормчилсон */
export type Rights = {
  role: Role | null;
  /** Урсгалын бус харагдацууд (урсгалтайг ажиллах үед хуваарилалтаас нээнэ — `permissions.workflowViewsOf`) */
  views: ViewKey[];
  docs: boolean;
  flow: { stage: Stage; bagts: string[]; viewOnly: boolean } | null;
  acl: Partial<Record<Sys, Grant[]>>;
  /** ЗӨВХӨН энгийн эрх */
  caps: CapKey[];
};

/** `normRights`-ийн сул оролт — хүснэгтээс уншсан мөрүүд */
export type RightsInput = {
  role?: Role | null;
  views?: readonly string[] | 'all';
  docs?: boolean;
  flow?: { stage: string; bagts: readonly string[]; viewOnly?: boolean } | null;
  acl?: Partial<Record<Sys, readonly { role: string; bagts: readonly string[] }[]>>;
  caps?: readonly string[];
};

export type ChangeWhat = Diff | { kind: 'job'; job: Role | null };
export type Change = { op: 'add' | 'remove'; what: ChangeWhat; text: string };

export type Problem = {
  code:
    | 'noJob' | 'noDef' | 'noPackages' | 'bagtsIgnored' | 'unknownPkg' | 'unknownRole' | 'unknownCap' | 'derivedCap'
    | 'twoStages' | 'zahiralStage' | 'adminWork' | 'noopRemove';
  level: 'error' | 'warn';
  text: string;
};

/** Багцын гурван нэрийн орон зай */
export type Catalog = {
  /** `PKG_GROUPS` */
  groups: readonly string[];
  /** Дэд бүтцийн багцууд (`BUTETS_PACKS`) */
  butets: readonly { key: string; name: string }[];
  /** ХАБЭА-д оноож болох багцууд */
  habea: readonly string[];
};

/** `habeaAcl.HABEA_PKGS`-ийн дүрэм (тэр модуль сүлжээний код татдаг тул энд давтав — шалгуур хоёрыг тулгана) */
const HABEA_RE = /^Багц\s*[-–]?\s*[1-4](\D|$)/;
export const CATALOG: Catalog = {
  groups: PKG_GROUPS,
  butets: BUTETS_PACKS,
  habea: PKG_GROUPS.filter((g) => HABEA_RE.test(g)),
};

/* ══════════════════════ Жижиг туслахууд ══════════════════════ */

const uniq = <T,>(a: readonly T[]): T[] => [...new Set(a)];
const VIEW_IX = new Map<string, number>(VIEWS.map((v, i) => [v.key, i]));
const WF = new Set<string>(WORKFLOW_VIEWS);
/** Загварт орох (урсгалын бус) харагдац мөн үү */
const isTplView = (v: unknown): v is ViewKey => typeof v === 'string' && VIEW_IX.has(v) && !WF.has(v);
const isAnyView = (v: unknown): v is ViewKey => typeof v === 'string' && VIEW_IX.has(v);
const sortViews = (v: readonly ViewKey[]): ViewKey[] =>
  uniq(v).sort((a, b) => (VIEW_IX.get(a) ?? 0) - (VIEW_IX.get(b) ?? 0));
const PLAIN = new Set<string>(PLAIN_CAPS);
const PLAIN_IX = new Map<string, number>(PLAIN_CAPS.map((c, i) => [c, i]));
const isPlain = (c: unknown): c is CapKey => typeof c === 'string' && PLAIN.has(c);
const STAGES = new Set<string>(STAGE_ORDER);
const isStage = (s: unknown): s is Stage => typeof s === 'string' && STAGES.has(s);
const isSys = (s: unknown): s is Sys => typeof s === 'string' && (SCOPED_SYSTEMS as readonly string[]).includes(s);
const rolesOf = (sys: Sys): string[] => Object.keys(ROLE_CAPS[sys]);
const isRole = (sys: Sys, role: unknown): role is string => typeof role === 'string' && Object.hasOwn(ROLE_CAPS[sys], role);
const capOfRole = (sys: Sys, role: string): CapKey => (ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>)[role];
const lc = (s: string): string => s.trim().toLowerCase();
/** Шатны дугаар — гүйцэтгэгч 0, хянах шатууд 1 … 6 (`REVIEW_STAGES`-ийн дараалал) */
export const stageNo = (s: Stage): number => (s === 'company' ? 0 : REVIEW_STAGES.indexOf(s) + 1);

/* ══════════════════════ Багцын нэрийн орон зай ══════════════════════ */

type Ix = {
  groups: Set<string>;
  /** `bagtsKey(нэр)` → `PKG_GROUPS`-ийн нэр (бичлэгийн зөрүүг арилгана — `scopedAcl`-ийн `aliases`-тай ижил) */
  canon: Map<string, string>;
  butets: Set<string>;
  /** дэд бүтцийн түлхүүр → хос `PKG_GROUPS` нэр (байвал) */
  packGroup: Map<string, string>;
  packName: Map<string, string>;
  habea: Set<string>;
  /** Хүний жагсаалтад орж болох бүх нэр: `PKG_GROUPS` + хосгүй дэд бүтцийн түлхүүрүүд */
  tokens: string[];
  ordG: Map<string, number>;
  ordB: Map<string, number>;
  ordT: Map<string, number>;
};
const IXS = new WeakMap<Catalog, Ix>();
function indexOf(cat: Catalog): Ix {
  const hit = IXS.get(cat);
  if (hit) return hit;
  const canon = new Map<string, string>();
  for (const g of cat.groups) if (!canon.has(bagtsKey(g))) canon.set(bagtsKey(g), g);
  const packGroup = new Map<string, string>();
  for (const p of cat.butets) {
    const g = canon.get(p.key);
    if (g) packGroup.set(p.key, g);
  }
  const tokens = [...cat.groups, ...cat.butets.map((p) => p.key).filter((k) => !packGroup.has(k))];
  const ix: Ix = {
    groups: new Set(cat.groups),
    canon,
    butets: new Set(cat.butets.map((p) => p.key)),
    packGroup,
    packName: new Map(cat.butets.map((p) => [p.key, p.name])),
    habea: new Set(cat.habea),
    tokens,
    ordG: new Map(cat.groups.map((g, i) => [g, i])),
    ordB: new Map(cat.butets.map((p, i) => [p.key, i])),
    ordT: new Map(tokens.map((t, i) => [t, i])),
  };
  IXS.set(cat, ix);
  return ix;
}

/** Системийн бүх багц — «бүх багц»-аас нэрлэсэн багц хасахад задлана */
const universe = (space: Space, ix: Ix): string[] =>
  (space === 'butets' ? [...ix.butets] : space === 'habea' ? [...ix.habea] : [...ix.groups]);

const sortBy = (list: string[], ord: Map<string, number>): string[] =>
  list.sort((a, b) => {
    const x = ord.get(a), y = ord.get(b);
    if (x != null && y != null) return x - y;
    if (x != null) return -1;
    if (y != null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

/** Системийн багцын жагсаалтыг нормчилно: `*` ганцаараа · бичлэг нэг болно · давхардалгүй · эрэмбэлэгдсэн */
function normList(space: Space, list: unknown, ix: Ix): string[] {
  const a = (Array.isArray(list) ? list : []).filter((b): b is string => typeof b === 'string').map((b) => b.trim()).filter(Boolean);
  if (a.includes(ALL)) return [ALL];
  /* 2026-11-23: дэд бүтцийн мөрөнд «Багц-5.1» гэж бичигдсэн нэр ч `scopeHas`-аар «БАГЦ51»-тэй таардаг тул түлхүүр болгоно */
  if (space === 'butets') return sortBy(uniq(a.map((b) => (ix.butets.has(bagtsKey(b)) ? bagtsKey(b) : b))), ix.ordB);
  return sortBy(uniq(a.map((b) => ix.canon.get(bagtsKey(b)) ?? b)), ix.ordG);
}

/** Хүний жагсаалтын нэг нэр → нормчилсон нэр (танигдахгүй бол `null`) */
function canonToken(t: string, ix: Ix): string | null {
  const s = t.trim();
  const g = ix.canon.get(bagtsKey(s));
  if (g) return g;
  return ix.butets.has(s) ? s : null;
}
function normTokens(list: unknown, ix: Ix): string[] {
  const a = (Array.isArray(list) ? list : []).filter((b): b is string => typeof b === 'string');
  if (a.some((b) => b.trim() === ALL)) return [ALL];
  return sortBy(uniq(a.map((b) => canonToken(b, ix)).filter((b): b is string => b !== null)), ix.ordT);
}
/** Хүний жагсаалтын нэр → тухайн системийн нэр; тэр системд хүчингүй бол `null` */
function tokenTo(space: Space, token: string, ix: Ix): string | null {
  if (space === 'butets') {
    const k = ix.butets.has(token) ? token : bagtsKey(token);
    return ix.butets.has(k) ? k : null;
  }
  if (space === 'habea') return ix.habea.has(token) ? token : null;
  return ix.groups.has(token) ? token : null;
}
/** Системийн нэр → хүний жагсаалтын нэр; каталогт алга бол `null` */
function tokenFrom(space: Space, name: string, ix: Ix): string | null {
  if (space === 'butets') return ix.packGroup.get(name) ?? (ix.butets.has(name) ? name : null);
  if (space === 'habea') return ix.habea.has(name) ? name : null;
  return ix.groups.has(name) ? name : null;
}
const spread = (space: Space, tokens: readonly string[], ix: Ix): string[] =>
  (tokens[0] === ALL
    ? [ALL]
    : uniq(tokens.map((t) => tokenTo(space, t, ix)).filter((b): b is string => b !== null)));

const minus = (space: Space, cur: string[], del: string[], ix: Ix): string[] => {
  if (del.includes(ALL)) return [];
  const d = new Set(del);
  return (cur[0] === ALL ? universe(space, ix) : cur).filter((b) => !d.has(b));
};
const plus = (cur: string[], add: string[]): string[] =>
  (cur.includes(ALL) || add.includes(ALL) ? [ALL] : uniq([...cur, ...add]));

/**
 * Хоёр жагсаалтын зөрүү. `del` — суурийнхээс хасах, `add` — нэмэх, `keep` — хассаны дараа сууринд юм үлдэх эсэх.
 * «Бүх багц» ↔ нэрлэсэн жагсаалт: суурь `*` бол бүгдийг хасаад бодитыг нэмнэ; бодит нь `*` бол `*`-г л нэмнэ.
 */
function listDiff(base: readonly string[], act: readonly string[]): { del: string[]; add: string[]; keep: boolean } {
  const bAll = base[0] === ALL, aAll = act[0] === ALL;
  if (bAll && aAll) return { del: [], add: [], keep: true };
  if (bAll) return { del: [ALL], add: [...act], keep: false };
  if (aAll) return { del: [], add: [ALL], keep: base.length > 0 };
  const b = new Set(base), a = new Set(act);
  return { del: base.filter((x) => !a.has(x)), add: act.filter((x) => !b.has(x)), keep: base.some((x) => a.has(x)) };
}

/* ══════════════════════ Албан үүргийн тодорхойлолт ══════════════════════ */

type Tail = Pick<JobDef, 'views' | 'docs' | 'huvaariView' | 'home'>;
/**
 * Одоо байгаа үүргийн харагдац · баримт · «Хуваарь харах» · нүүр цонх — `roleTypes`-ийн АНХДАГЧ загвараас ЯГ хэвээр.
 * Шинэ үүрэг (загваргүй) — `ROLE_ACCESS`-ийн нарийн сууриас.
 */
function tailOf(role: Role): Tail {
  const t = _defaultTpl(role);
  if (t) {
    const views = t.on.filter((x) => x.startsWith('view:')).map((x) => x.slice(5)).filter(isTplView);
    return { views: sortViews(views), docs: t.on.includes('docs'), huvaariView: hvScopeOf(t.on), home: t.home };
  }
  const a = ROLE_ACCESS[role];
  const views = (a.views === 'all' ? VIEWS.map((v) => v.key) : a.views).filter(isTplView);
  return { views: sortViews(views), docs: a.docs, huvaariView: 'none', home: a.home };
}

const withLabel = (d: Omit<JobDef, 'label'>, get: () => string): JobDef =>
  Object.defineProperty({ ...d }, 'label', { enumerable: true, configurable: true, get }) as JobDef;

/** Шошго `roleTypes.typeLabel`-ээс, ЗУРАГДАХ агшинд (хэл солигдоход дагана) */
function job(key: Role, o: Partial<Omit<JobDef, 'key' | 'label'>> = {}): JobDef {
  return withLabel({ key, stage: null, pkgRoles: [], caps: [], scope: 'none', ...tailOf(key), ...o }, () => typeLabel(key));
}

/**
 * АНХДАГЧ АЛБАН ҮҮРГҮҮД (2026-11-23) — одоогийн 91 хэрэглэгчийн бодит эрхээс гаргасан.
 *   · Хяналтын инженерийн «дэд бүтэц засах» (`butets.editor`) анхдагчид ОРООГҮЙ — хүн бүрд «нэмсэн» ялгаа.
 *   · «Чанар» — өнөөдрийн төрлийн загвар хэвээр; чанарын баримтын үүрэг (ТУХ · Чанар · ХАБЭА …) хүн бүрд ялгаатай тул
 *     «нэмсэн» ялгаагаар.
 *   · Ерөнхий захирал — шатгүй, бүх багцыг зөвхөн харна (`guitsetgelAcl.resolveFlowStage`).
 *   · Админ (`super`) — зөвхөн эрх удирдана; ажлын эрхгүй (2026-11-20-ны шийдвэр).
 *   · Шинэ таван үүрэг (`guitshabea` · `habea` · `butets` · `zurag` · `sanhuu`) — «Хуваарь харах» = «Үгүй» (2026-11-23):
 *     `roleTypes.TYPE_ORDER`-т ороогүй үүрэгт ажиллах үед `typeHuvaariScope` ҮРГЭЛЖ `none` буцаадаг — загварт өөр утга бичвэл
 *     `canDo` худал хэлнэ.
 */
export const JOB_DEFS: readonly JobDef[] = [
  job('guitsetgegch', {
    stage: 'company', scope: 'packages',
    pkgRoles: [{ sys: 'huvaari', role: 'author' }, { sys: 'ajil', role: 'editor' }],
  }),
  job('guitshabea', { scope: 'packages', pkgRoles: [{ sys: 'habea', role: 'viewer' }] }),
  job('injener', {
    stage: 'engineer', scope: 'packages',
    pkgRoles: [{ sys: 'ajil', role: 'approver' }, { sys: 'obyem', role: 'editor' }],
  }),
  job('menejer', { stage: 'manager', scope: 'packages' }),
  job('tolovloltiin', { stage: 'planner', scope: 'packages' }),
  job('eronhii', {
    stage: 'director', scope: 'packages',
    pkgRoles: [{ sys: 'huvaari', role: 'approver' }, { sys: 'obyem', role: 'approver' }],
  }),
  job('heltsiin', { stage: 'head', scope: 'packages' }),
  job('gazriin', { stage: 'chief', scope: 'packages' }),
  job('zahiral', { scope: 'all' }),
  job('habea', { caps: ['habeaData'] }),
  job('butets', { scope: 'packages', pkgRoles: [{ sys: 'butets', role: 'editor' }] }),
  job('zurag', { caps: ['zuragEdit'] }),
  job('gazar', { caps: ['gazar'] }),
  job('sanhuu', { caps: ['finEdit', 'cfSwitch', 'ipcCreate', 'ipcApprove'] }),
  job('chanar'),
  job('taniltsah'),
  job('super', { admin: true }),
];

export const findDef = (defs: readonly JobDef[], key: Role | null | undefined): JobDef | undefined =>
  (key ? defs.find((d) => d.key === key) : undefined);

/** Хадгалсан өөрчлөлт — JSON болгож болно, албан үүргийн түлхүүрээр. `admin` ба `key` солигдохгүй. */
export type JobOverride = Partial<Pick<JobDef,
  'label' | 'stage' | 'stageViewOnly' | 'pkgRoles' | 'caps' | 'views' | 'docs' | 'huvaariView' | 'home' | 'scope'>>;
export type StoredDefs = Partial<Record<Role, JobOverride>>;

/**
 * Хүснэгтээс ирсэн (итгэлгүй) өөрчлөлтийг шүүнэ: танигдахгүй талбар · буруу утга хаягдана (суурь утга хэвээр),
 * жагсаалтаас танигдахгүй түлхүүр хасагдана.
 *   · хуваарилалтаас гардаг эрх `caps`-д орохгүй;
 *   · админы тодорхойлолтод шат · багцын үүрэг · эрх нэмэгдэхгүй (админ ажлын эрхгүй — зөвхөн хүн бүрийн «нэмсэн» ялгаагаар);
 *   · Ерөнхий захиралд шат тавигдахгүй.
 */
export function cleanOverride(base: JobDef, raw: unknown): JobOverride {
  const out: JobOverride = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  const work = !base.admin;
  if (typeof r.label === 'string' && r.label.trim()) out.label = r.label.trim();
  if (work && base.key !== 'zahiral' && (r.stage === null || isStage(r.stage))) out.stage = r.stage;
  if (work && typeof r.stageViewOnly === 'boolean') out.stageViewOnly = r.stageViewOnly;
  if (work && Array.isArray(r.pkgRoles)) {
    const seen = new Set<string>();
    out.pkgRoles = r.pkgRoles.flatMap((x): PkgRole[] => {
      const p = (x ?? {}) as { sys?: unknown; role?: unknown };
      if (!isSys(p.sys) || !isRole(p.sys, p.role) || seen.has(`${p.sys}:${p.role}`)) return [];
      seen.add(`${p.sys}:${p.role}`);
      return [{ sys: p.sys, role: p.role }];
    });
  }
  if (work && Array.isArray(r.caps)) out.caps = uniq(r.caps.filter(isPlain));
  if (Array.isArray(r.views)) out.views = sortViews(r.views.filter(isTplView));
  if (typeof r.docs === 'boolean') out.docs = r.docs;
  if (r.huvaariView === 'all' || r.huvaariView === 'own' || r.huvaariView === 'none') out.huvaariView = r.huvaariView;
  if (isAnyView(r.home)) out.home = r.home;
  if (r.scope === 'packages' || r.scope === 'all' || r.scope === 'none') out.scope = r.scope;
  return out;
}

/**
 * Суурь тодорхойлолт + хадгалсан өөрчлөлт. Танигдахгүй албан үүргийн түлхүүр хаягдана; суурийн дараалал хадгалагдана.
 */
export function mergeDefs(builtin: readonly JobDef[], stored: unknown): JobDef[] {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return builtin.map((b) => {
    const copy = Object.defineProperties({}, Object.getOwnPropertyDescriptors(b)) as JobDef;
    /* 2026-11-23: жагсаалтууд суурийнхтай ХУВААЛЦАГДАХГҮЙ — хуулбарыг өөрчлөхөд `JOB_DEFS` хөндөгдөхгүй */
    copy.pkgRoles = b.pkgRoles.map((p) => ({ ...p }));
    copy.caps = [...b.caps];
    copy.views = [...b.views];
    if (!Object.hasOwn(s, b.key)) return copy;
    const { label, ...rest } = cleanOverride(b, s[b.key]);
    Object.assign(copy, rest);
    if (label !== undefined) Object.defineProperty(copy, 'label', { enumerable: true, configurable: true, value: label });
    return copy;
  });
}

/* ══════════════════════ Нормчлол ══════════════════════ */

const EMPTY: Rights = { role: null, views: [], docs: false, flow: null, acl: {}, caps: [] };

/**
 * Бодит мөрүүдийг нормчилно: эрэмбэлсэн · давхардалгүй · `['*']` ганцаараа.
 *   · харагдац — зөвхөн урсгалын БУС (хадгалсан «Гүйцэтгэл» зэргийг ажиллах үед хуваарилалтаас нээдэг тул тоохгүй); `'all'` задарна
 *   · эрх — зөвхөн энгийн (хуваарилалтаас гардаг эрхийг хуваарилалт өөрөө бичнэ)
 *   · хуваарилалт — нэг үүргийн мөрүүд нэгдэнэ; хоосон багцтай мөр · танигдахгүй үүрэг хаягдана
 */
export function normRights(r: RightsInput, cat: Catalog = CATALOG): Rights {
  const ix = indexOf(cat);
  const rawViews: readonly unknown[] = r.views === 'all' ? VIEWS.map((v) => v.key) : (r.views ?? []);
  const views = sortViews(rawViews.filter(isTplView));
  const caps = uniq((r.caps ?? []).filter(isPlain)).sort((a, b) => (PLAIN_IX.get(a) ?? 0) - (PLAIN_IX.get(b) ?? 0));
  let flow: Rights['flow'] = null;
  if (r.flow && isStage(r.flow.stage)) {
    const bagts = normList('flow', r.flow.bagts, ix);
    if (bagts.length) flow = { stage: r.flow.stage, bagts, viewOnly: r.flow.viewOnly === true };
  }
  const acl: Rights['acl'] = {};
  for (const sys of SCOPED_SYSTEMS) {
    const rows = r.acl?.[sys];
    if (!Array.isArray(rows)) continue;
    const grants: Grant[] = [];
    for (const role of rolesOf(sys)) {
      const bagts = normList(sys, rows.filter((g) => g && g.role === role).flatMap((g) => (Array.isArray(g.bagts) ? g.bagts : [])), ix);
      if (bagts.length) grants.push({ role, bagts });
    }
    if (grants.length) acl[sys] = grants;
  }
  return { role: r.role ?? null, views, docs: r.docs === true, flow, acl, caps };
}

/** Хоёр эрх нормчилсны дараа ижил үү */
export const sameRights = (a: RightsInput, b: RightsInput, cat: Catalog = CATALOG): boolean =>
  JSON.stringify(normRights(a, cat)) === JSON.stringify(normRights(b, cat));

const bagtsOfRole = (r: Rights, sys: Sys, role: string): string[] => r.acl[sys]?.find((g) => g.role === role)?.bagts ?? [];

/* ══════════════════════ Хүн → бодит мөр (compile) ══════════════════════ */

/** Ялгаагүй суурь: албан үүрэг + багцын жагсаалтаас гарах эрх */
function baseOf(jobKey: Role | null, bagts: readonly string[], defs: readonly JobDef[], cat: Catalog): Rights {
  const def = findDef(defs, jobKey);
  if (!def) return { ...EMPTY, role: jobKey };
  const ix = indexOf(cat);
  const tokens = def.scope === 'all' ? [ALL] : def.scope === 'packages' ? normTokens(bagts, ix) : [];
  const flow = def.stage
    ? { stage: def.stage, bagts: spread('flow', tokens, ix), viewOnly: def.stageViewOnly === true }
    : null;
  const acl: Partial<Record<Sys, Grant[]>> = {};
  for (const p of def.pkgRoles) {
    if (!isSys(p.sys) || !isRole(p.sys, p.role)) continue;
    acl[p.sys] = [...(acl[p.sys] ?? []), { role: p.role, bagts: spread(p.sys, tokens, ix) }];
  }
  return normRights({ role: jobKey, views: def.views, docs: def.docs, flow, acl, caps: def.caps }, cat);
}

/**
 * ХҮН → БОДИТ МӨРҮҮД. Дараалал: албан үүргийн суурь → «хассан» ялгаанууд → «нэмсэн» ялгаанууд.
 *   · шат: «хассан» нь суурийн шатны багцаас хасна (өөр шат бол үл тооно); «нэмсэн» нь ижил шатанд багц нэмнэ, ӨӨР шат бол
 *     урсгалын мөрийг бүхэлд нь солино (нэг аккаунт = нэг шат).
 *   · хуваарилалтаас гардаг эрх · танигдахгүй түлхүүртэй ялгаа үл тооно — `validate` хэлнэ, энд чимээгүй засахгүй.
 */
export function compile(p: Person, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Rights {
  const ix = indexOf(cat);
  const base = baseOf(p.job, p.bagts ?? [], defs, cat);
  const views = new Set<ViewKey>(base.views);
  const caps = new Set<CapKey>(base.caps);
  let docs = base.docs;
  let flow = base.flow ? { ...base.flow } : null;
  const acl = new Map<string, { sys: Sys; role: string; bagts: string[] }>();
  for (const sys of SCOPED_SYSTEMS) for (const g of base.acl[sys] ?? []) acl.set(`${sys}:${g.role}`, { sys, role: g.role, bagts: g.bagts });

  for (const d of p.remove ?? []) {
    if (d.kind === 'view') views.delete(d.view);
    else if (d.kind === 'cap') caps.delete(d.cap);
    else if (d.kind === 'docs') docs = false;
    else if (d.kind === 'stage') {
      if (flow && flow.stage === d.stage) {
        const bagts = minus('flow', flow.bagts, normList('flow', d.bagts, ix), ix);
        flow = bagts.length ? { ...flow, bagts } : null;
      }
    } else if (d.kind === 'role') {
      const cur = acl.get(`${d.sys}:${d.role}`);
      if (cur) cur.bagts = minus(d.sys, cur.bagts, normList(d.sys, d.bagts, ix), ix);
    }
  }
  for (const d of p.add ?? []) {
    if (d.kind === 'view') {
      if (isTplView(d.view)) views.add(d.view);
    } else if (d.kind === 'cap') {
      if (isPlain(d.cap)) caps.add(d.cap);
    } else if (d.kind === 'docs') {
      docs = true;
    } else if (d.kind === 'stage') {
      if (!isStage(d.stage)) continue;
      const bagts = normList('flow', d.bagts, ix);
      if (!flow || flow.stage !== d.stage) flow = { stage: d.stage, bagts, viewOnly: d.viewOnly === true };
      else flow = { stage: flow.stage, bagts: plus(flow.bagts, bagts), viewOnly: d.viewOnly === undefined ? flow.viewOnly : d.viewOnly };
    } else if (d.kind === 'role') {
      if (!isSys(d.sys) || !isRole(d.sys, d.role)) continue;
      const k = `${d.sys}:${d.role}`;
      const cur = acl.get(k);
      const bagts = normList(d.sys, d.bagts, ix);
      if (cur) cur.bagts = plus(cur.bagts, bagts);
      else acl.set(k, { sys: d.sys, role: d.role, bagts });
    }
  }
  const outAcl: Partial<Record<Sys, Grant[]>> = {};
  for (const g of acl.values()) outAcl[g.sys] = [...(outAcl[g.sys] ?? []), { role: g.role, bagts: g.bagts }];
  return normRights({ role: p.job, views: [...views], docs, flow, acl: outAcl, caps: [...caps] }, cat);
}

/* ══════════════════════ Бодит мөр → хүн (decompile) ══════════════════════ */

/** Суурь ба бодитын ЯГ зөрүү — `compile` эдгээрийг буцааж хэрэглэхэд бодит нь гарна */
function diffOf(base: Rights, act: Rights): { add: Diff[]; remove: Diff[] } {
  const add: Diff[] = [], remove: Diff[] = [];
  for (const v of base.views) if (!act.views.includes(v)) remove.push({ kind: 'view', view: v });
  for (const v of act.views) if (!base.views.includes(v)) add.push({ kind: 'view', view: v });
  if (base.docs && !act.docs) remove.push({ kind: 'docs' });
  if (!base.docs && act.docs) add.push({ kind: 'docs' });
  for (const c of base.caps) if (!act.caps.includes(c)) remove.push({ kind: 'cap', cap: c });
  for (const c of act.caps) if (!base.caps.includes(c)) add.push({ kind: 'cap', cap: c });

  const b = base.flow, a = act.flow;
  if (b && !a) {
    remove.push({ kind: 'stage', stage: b.stage, bagts: [...b.bagts] });
  } else if (a && (!b || b.stage !== a.stage)) {
    if (b) remove.push({ kind: 'stage', stage: b.stage, bagts: [...b.bagts] });
    add.push({ kind: 'stage', stage: a.stage, bagts: [...a.bagts], ...(a.viewOnly ? { viewOnly: true } : {}) });
  } else if (a && b) {
    const d = listDiff(b.bagts, a.bagts);
    if (d.del.length) remove.push({ kind: 'stage', stage: b.stage, bagts: d.del });
    /* сууринд багц үлдвэл «зөвхөн харна» нь суурийнхаас зөрсөн үед л; үлдэхгүй бол мөр шинээр үүсэх тул `true` үед л */
    const vo = d.keep ? (a.viewOnly !== b.viewOnly ? a.viewOnly : undefined) : (a.viewOnly ? true : undefined);
    if (d.add.length || vo !== undefined) add.push({ kind: 'stage', stage: a.stage, bagts: d.add, ...(vo !== undefined ? { viewOnly: vo } : {}) });
  }

  for (const sys of SCOPED_SYSTEMS) {
    for (const role of rolesOf(sys)) {
      const d = listDiff(bagtsOfRole(base, sys, role), bagtsOfRole(act, sys, role));
      if (d.del.length) remove.push({ kind: 'role', sys, role, bagts: d.del });
      if (d.add.length) add.push({ kind: 'role', sys, role, bagts: d.add });
    }
  }
  return { add, remove };
}

const pkgCount = (ds: readonly Diff[]): number =>
  ds.reduce((n, d) => n + (d.kind === 'role' || d.kind === 'stage' ? d.bagts.length : 0), 0);
/** Ялгааны тоо: [ялгааны мөрийн тоо, тэдгээр дэх багцын тоо] */
export const personCost = (p: Pick<Person, 'add' | 'remove'>): [number, number] =>
  [p.add.length + p.remove.length, pkgCount(p.add) + pkgCount(p.remove)];
type Cost = [number, number, number];
const less = (a: Cost, b: Cost): boolean => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]);

/** Багцын жагсаалтын сонголтыг ЯГ тоочих дээд хязгаар (ангийн тоо) — түүнээс их бол олонхийн саналаар */
const EXACT_CLASSES = 10;

/**
 * БАГЦЫН ЖАГСААЛТЫГ СОНГОНО — албан үүрэг тогтсон үед ялгааны тоог ХАМГИЙН БАГА болгох жагсаалт.
 *
 * Албан үүргийн «үүр» бүр (шат + багцын үүрэг) өөрийн бодит багцтай. Багцуудыг үүрүүд дэх гишүүнчлэлээр нь ангилна; нэг ангийн
 * багцууд ялгааны тоонд ижил нөлөөтэй тул хариу нь ангиудын нэгдэл. Ангийн тоо цөөн (үүр ≤ 3 бол ≤ 7) тул бүх хослолыг тоочиж
 * ЯГ хамгийн бага ялгаатайг авна; `['*']` мөн нэг нэр дэвшигч. Тэнцвэл: ялгаан дахь багцын тоо бага → богино жагсаалт.
 */
function chooseBagts(act: Rights, jobKey: Role | null, defs: readonly JobDef[], cat: Catalog): string[] {
  const def = findDef(defs, jobKey);
  if (!def || def.scope !== 'packages') return [];
  const ix = indexOf(cat);
  const slots: { space: Space; list: string[] }[] = [];
  if (def.stage) slots.push({ space: 'flow', list: act.flow && act.flow.stage === def.stage ? act.flow.bagts : [] });
  const seen = new Set<string>();
  for (const p of def.pkgRoles) {
    if (!isSys(p.sys) || !isRole(p.sys, p.role) || seen.has(`${p.sys}:${p.role}`)) continue;
    seen.add(`${p.sys}:${p.role}`);
    slots.push({ space: p.sys, list: bagtsOfRole(act, p.sys, p.role) });
  }
  if (!slots.length) return [];

  const anyAll = slots.some((s) => s.list[0] === ALL);
  const cand = anyAll
    ? ix.tokens
    : uniq(slots.flatMap((s) => s.list.map((b) => tokenFrom(s.space, b, ix)).filter((t): t is string => t !== null)));
  const classes = new Map<string, string[]>();
  for (const t of cand) {
    const sig = slots.map((s) => {
      const name = tokenTo(s.space, t, ix);
      if (name === null) return '-';
      return s.list[0] === ALL || s.list.includes(name) ? '1' : '0';
    }).join('');
    if (!sig.includes('1')) continue;
    classes.set(sig, [...(classes.get(sig) ?? []), t]);
  }
  const groups = [...classes.entries()];

  const state: { best: string[]; cost: Cost | null } = { best: [], cost: null };
  const tryOne = (tokens: string[]): void => {
    const d = diffOf(baseOf(jobKey, tokens, defs, cat), act);
    const c: Cost = [...personCost(d), tokens.length];
    if (!state.cost || less(c, state.cost)) { state.cost = c; state.best = tokens; }
  };
  tryOne([]);
  if (groups.length <= EXACT_CLASSES) {
    for (let m = 1; m < 1 << groups.length; m += 1) {
      tryOne(groups.flatMap(([, ts], i) => ((m >> i) & 1 ? ts : [])));
    }
  } else {
    /* олон үүртэй (хадгалсан) тодорхойлолт: олонхийн санал + үүр бүрийн өөрийн жагсаалт + нэгдэл */
    const count = (sig: string, ch: string): number => sig.split(ch).length - 1;
    tryOne(groups.flatMap(([sig, ts]) => (count(sig, '1') > count(sig, '0') ? ts : [])));
    for (let i = 0; i < slots.length; i += 1) tryOne(groups.flatMap(([sig, ts]) => (sig[i] === '1' ? ts : [])));
    tryOne(groups.flatMap(([, ts]) => ts));
  }
  tryOne([ALL]);
  return normTokens(state.best, ix);
}

function decompileAs(user: string, act: Rights, jobKey: Role | null, defs: readonly JobDef[], cat: Catalog): Person {
  const bagts = chooseBagts(act, jobKey, defs, cat);
  const d = diffOf(baseOf(jobKey, bagts, defs, cat), { ...act, role: jobKey });
  return { user: lc(user), job: jobKey, bagts, add: d.add, remove: d.remove };
}

/**
 * БОДИТ МӨРҮҮД → ХҮН. Албан үүрэг нь мөрийн `role` ХЭВЭЭР (хүнийг чимээгүй өөр ангилалд шилжүүлэхгүй — санал болгох нь
 * `suggestJob`). Тэр үүргээр ялгааны тоог хамгийн бага болгох багцын жагсаалтыг сонгож, үлдсэнийг ЯГ ялгаагаар бичнэ.
 * Баталгаа: `compile(decompile(u, x)) = normRights(x)`.
 */
export function decompile(user: string, actual: RightsInput, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Person {
  const act = normRights(actual, cat);
  return decompileAs(user, act, act.role, defs, cat);
}

/**
 * ӨГСӨН албан үүрэг · багцын жагсаалттай хүн (2026-11-23) — админ багцын жагсаалтыг гараар солиход бодит мөр ХЭВЭЭР үлдэх
 * ялгааг гаргана: `compile(personWith(u, x, job, bagts))` = `normRights(x)` (үүрэг нь `job`).
 */
export function personWith(
  user: string, actual: RightsInput, jobKey: Role | null, bagts: readonly string[],
  defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): Person {
  const act = normRights(actual, cat);
  const def = findDef(defs, jobKey);
  const list = def && def.scope === 'packages' ? normTokens(bagts, indexOf(cat)) : [];
  const d = diffOf(baseOf(jobKey, list, defs, cat), { ...act, role: jobKey });
  return { user: lc(user), job: jobKey, bagts: list, add: d.add, remove: d.remove };
}

export type JobFit = {
  def: JobDef;
  /** Тэр албан үүрэгт шилжүүлбэл гарах хүн */
  person: Person;
  /** Ажлын эрхийн (шат · багцын үүрэг · эрх) ялгааны тоо */
  work: number;
  /** Харагдац · баримтын ялгааны тоо */
  other: number;
};

/**
 * Албан үүрэг бүрд тааруулж эрэмбэлнэ: эхлээд АЖЛЫН эрхийн ялгаа бага, дараа нь харагдацын ялгаа бага, тэнцвэл одоогийн үүрэг.
 * Админы үүргийг хэзээ ч САНАЛ болгохгүй (одоо админ бол л жагсаалтад орно).
 */
export function jobFit(actual: RightsInput, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): JobFit[] {
  const act = normRights(actual, cat);
  const isWork = (d: Diff): boolean => d.kind === 'cap' || d.kind === 'role' || d.kind === 'stage';
  return defs
    .filter((d) => !d.admin || d.key === act.role)
    .map((def, i) => {
      const person = decompileAs('', act, def.key, defs, cat);
      const all = [...person.add, ...person.remove];
      const work = all.filter(isWork).length;
      return { def, person, work, other: all.length - work, i };
    })
    .sort((a, b) => a.work - b.work || a.other - b.other
      || Number(b.def.key === act.role) - Number(a.def.key === act.role) || a.i - b.i)
    .map(({ def, person, work, other }) => ({ def, person, work, other }));
}

/** Хамгийн бага ялгаатай албан үүрэг (`jobFit`-ийн эхнийх) — тодорхойлолтгүй бол `null` */
export function suggestJob(actual: RightsInput, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): JobDef | null {
  return jobFit(actual, defs, cat)[0]?.def ?? null;
}

/** АЖИЛ ХҮЛЭЭЛЦЭХ — ижил албан үүрэг · багц · ялгаа өөр аккаунтад */
export function replacePerson(from: Person, to: string): Person {
  const copy = (ds: readonly Diff[]): Diff[] => ds.map((d) => (d.kind === 'role' || d.kind === 'stage' ? { ...d, bagts: [...d.bagts] } : { ...d }));
  return { user: lc(to), job: from.job, bagts: [...from.bagts], add: copy(from.add), remove: copy(from.remove) };
}

/* ══════════════════════ Бичвэр ══════════════════════ */

/** Системийн багцын жагсаалт → уншихад зориулсан бичвэр (дэд бүтцийн түлхүүр нэрээрээ) */
function pkgText(space: Space, bagts: readonly string[], ix: Ix): string {
  if (bagts[0] === ALL) return bagtsText(null);
  return bagtsText(space === 'butets' ? bagts.map((k) => ix.packGroup.get(k) ?? ix.packName.get(k) ?? k) : [...bagts]);
}
/** Багцын үүрэг → юу хийх вэ (эрхийн одоо байгаа шошгоор; чанарын хянагчид үүргийн нэр нэмнэ) */
function roleText(sys: Sys, role: string): string {
  const base = capLabel(capOfRole(sys, role));
  return sys === 'chanar' && role !== 'author' ? `${base} (${roleLabel('chanar', role)})` : base;
}
function stageText(stage: Stage, viewOnly: boolean): string {
  const label = STAGE_LABEL[stage];
  if (stage === 'company') {
    return viewOnly ? tr('гүйцэтгэлийг зөвхөн харна ({0})', label) : tr('гүйцэтгэлийг бөглөж илгээнэ ({0})', label);
  }
  const n = String(stageNo(stage));
  return viewOnly ? tr('гүйцэтгэлийн {0}-р шатыг зөвхөн харна ({1})', n, label) : tr('гүйцэтгэлийг {0}-р шатанд хянана ({1})', n, label);
}
const viewTitle = (v: ViewKey): string => VIEWS.find((x) => x.key === v)?.title ?? v;

function whatText(d: ChangeWhat, defs: readonly JobDef[], ix: Ix): string {
  if (d.kind === 'job') return `${tr('Албан үүрэг')}: ${d.job ? (findDef(defs, d.job)?.label ?? typeLabel(d.job)) : tr('үгүй')}`;
  if (d.kind === 'cap') return capLabel(d.cap);
  if (d.kind === 'view') return `${tr('Харагдац')}: ${viewTitle(d.view)}`;
  if (d.kind === 'docs') return tr('ТЭЗҮ-БОНУ баримт үзэх');
  if (d.kind === 'stage') return `${pkgText('flow', d.bagts, ix)}: ${stageText(d.stage, d.viewOnly === true)}`;
  return `${pkgText(d.sys, d.bagts, ix)}: ${roleText(d.sys, d.role)}`;
}

/**
 * ХОЁР ЭРХИЙН ЗӨРҮҮ — баталгаажуулах жагсаалтад: `have`-ээс `want` болгоход юу НЭМЭГДЭЖ, юу ХАСАГДАХ вэ.
 * Шат эсвэл «зөвхөн харна» солигдвол урсгалын мөр бүхлээрээ хасагдаж, шинээр нэмэгдэнэ.
 */
export function rightsDiff(
  want: RightsInput, have: RightsInput, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG,
): Change[] {
  const ix = indexOf(cat);
  const w = normRights(want, cat), h = normRights(have, cat);
  const out: Change[] = [];
  const push = (op: Change['op'], what: ChangeWhat): void => {
    const thing = whatText(what, defs, ix);
    out.push({ op, what, text: op === 'add' ? tr('Нэмнэ — {0}', thing) : tr('Хасна — {0}', thing) });
  };
  if (w.role !== h.role) {
    if (h.role) push('remove', { kind: 'job', job: h.role });
    if (w.role) push('add', { kind: 'job', job: w.role });
  }
  const hf = h.flow, wf = w.flow;
  if (hf && wf && hf.stage === wf.stage && hf.viewOnly === wf.viewOnly) {
    const d = listDiff(hf.bagts, wf.bagts);
    if (d.del.length) push('remove', { kind: 'stage', stage: hf.stage, bagts: d.del, ...(hf.viewOnly ? { viewOnly: true } : {}) });
    if (d.add.length) push('add', { kind: 'stage', stage: wf.stage, bagts: d.add, ...(wf.viewOnly ? { viewOnly: true } : {}) });
  } else {
    if (hf) push('remove', { kind: 'stage', stage: hf.stage, bagts: [...hf.bagts], ...(hf.viewOnly ? { viewOnly: true } : {}) });
    if (wf) push('add', { kind: 'stage', stage: wf.stage, bagts: [...wf.bagts], ...(wf.viewOnly ? { viewOnly: true } : {}) });
  }
  for (const sys of SCOPED_SYSTEMS) {
    for (const role of rolesOf(sys)) {
      const d = listDiff(bagtsOfRole(h, sys, role), bagtsOfRole(w, sys, role));
      if (d.del.length) push('remove', { kind: 'role', sys, role, bagts: d.del });
      if (d.add.length) push('add', { kind: 'role', sys, role, bagts: d.add });
    }
  }
  for (const c of h.caps) if (!w.caps.includes(c)) push('remove', { kind: 'cap', cap: c });
  for (const c of w.caps) if (!h.caps.includes(c)) push('add', { kind: 'cap', cap: c });
  for (const v of h.views) if (!w.views.includes(v)) push('remove', { kind: 'view', view: v });
  for (const v of w.views) if (!h.views.includes(v)) push('add', { kind: 'view', view: v });
  if (h.docs && !w.docs) push('remove', { kind: 'docs' });
  if (!h.docs && w.docs) push('add', { kind: 'docs' });
  return out;
}

/** Нэг ялгааг уншихад зориулсан бичвэр (2026-11-23, шинэ эрхийн дэлгэцийн чип — `rightsDiff`-ийн ижил үг, «Нэмнэ —»-гүй) */
export const describe = (d: ChangeWhat, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): string =>
  whatText(d, defs, indexOf(cat));

/**
 * ЭНЭ ХҮН ЮУ ХИЙЖ ЧАДАХ ВЭ — энгийн өгүүлбэрүүд, одоо байгаа шошгоноос (`capText.capLabel` · `STAGE_LABEL` · `VIEWS`).
 */
export function canDo(rights: RightsInput, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): string[] {
  const ix = indexOf(cat);
  const r = normRights(rights, cat);
  const def = findDef(defs, r.role);
  const out: string[] = [];
  if (def?.admin) out.push(tr('Хэрэглэгчийн эрх удирдах (админ самбар)'));
  if (r.flow) out.push(`${pkgText('flow', r.flow.bagts, ix)}: ${stageText(r.flow.stage, r.flow.viewOnly || r.role === 'zahiral')}`);
  else if (r.role === 'zahiral') out.push(`${bagtsText(null)}: ${tr('гүйцэтгэлийг зөвхөн харна ({0})', typeLabel('zahiral'))}`);
  for (const sys of SCOPED_SYSTEMS) {
    for (const g of r.acl[sys] ?? []) out.push(`${pkgText(sys, g.bagts, ix)}: ${roleText(sys, g.role)}`);
  }
  for (const c of r.caps) out.push(capLabel(c));
  if (def && def.huvaariView !== 'none') {
    out.push(`${tr('Хуваарь харах')}: ${def.huvaariView === 'all' ? bagtsText(null) : tr('Өөрийн багц')}`);
  }
  if (r.views.length) out.push(`${tr('Харагдац')}: ${r.views.map(viewTitle).join(' · ')}`);
  if (r.docs) out.push(tr('ТЭЗҮ-БОНУ баримт үзэх'));
  return out;
}

/* ══════════════════════ Шалгалт (validate) ══════════════════════ */

/**
 * ДҮРМИЙН ЗӨРЧЛИЙГ ХЭЛНЭ — чимээгүй засахгүй. Домайн кодын дүрмүүд:
 *   · нэг аккаунт = нэг шат (`guitsetgelAcl.setAssign` өөр шатыг арилгадаг)
 *   · Ерөнхий захирал шат барихгүй (`guitsetgelAcl` — `ZAHIRAL_NO_FLOW`)
 *   · хуваарилалтаас гардаг эрхийг шууд нэмэхгүй/хасахгүй (`aclRoleCaps.isDerivedCap`)
 *   · админ ажлын эрхгүй — зөвхөн хүн бүрийн ИЛ «нэмсэн» ялгаагаар (тодорхойлолтод байж болохгүй)
 */
export function validate(p: Person, defs: readonly JobDef[] = JOB_DEFS, cat: Catalog = CATALOG): Problem[] {
  const ix = indexOf(cat);
  const out: Problem[] = [];
  const push = (code: Problem['code'], level: Problem['level'], text: string): void => { out.push({ code, level, text }); };
  const def = findDef(defs, p.job);
  const bagts = p.bagts ?? [];
  if (!p.job) push('noJob', 'warn', tr('Албан үүрэг сонгоогүй — бүх эрх «нэмсэн» ялгаагаар бичигдэнэ.'));
  else if (!def) push('noDef', 'error', tr('«{0}» албан үүрэгт тодорхойлолт алга.', typeLabel(p.job)));

  const unknown = bagts.filter((b) => b.trim() !== ALL && canonToken(b, ix) === null);
  if (unknown.length) push('unknownPkg', 'warn', tr('Танигдахгүй багц: {0} — тооцогдохгүй.', unknown.join(', ')));
  if (def) {
    const needs = !!def.stage || def.pkgRoles.length > 0;
    if (def.scope === 'packages' && needs && !bagts.length) {
      push('noPackages', 'warn', tr('«{0}» албан үүрэгт багц сонгоогүй — багцын эрх гарахгүй.', def.label));
    }
    if (def.scope !== 'packages' && bagts.length) {
      push('bagtsIgnored', 'warn', tr('«{0}» албан үүрэг багцын жагсаалт хэрэглэхгүй — сонгосон багц тооцогдохгүй.', def.label));
    }
    if (def.admin && (def.stage || def.pkgRoles.length || def.caps.length)) {
      push('adminWork', 'error', tr('Админы тодорхойлолтод ажлын эрх байж болохгүй — зөвхөн тухайн хүнд «нэмсэн» ялгаагаар олгоно.'));
    }
    for (const c of def.caps) {
      if (isDerivedCap(c)) push('derivedCap', 'error', tr('«{0}» эрх хуваарилалтаас гардаг — шууд олгохгүй, багцын үүргээр олгоно.', capLabel(c)));
    }
  }

  const all: { d: Diff; removed: boolean }[] = [
    ...(p.add ?? []).map((d) => ({ d, removed: false })), ...(p.remove ?? []).map((d) => ({ d, removed: true })),
  ];
  const base = baseOf(p.job, bagts, defs, cat);
  const noop = (d: Diff): void => push('noopRemove', 'warn', tr('Албан үүрэгт байхгүй зүйлийг хассан: {0}', whatText(d, defs, ix)));
  const badPkg = (space: Space, list: readonly string[]): void => {
    const valid = new Set(universe(space, ix));
    const bad = normList(space, list, ix).filter((b) => b !== ALL && !valid.has(b));
    if (bad.length) push('unknownPkg', 'warn', tr('Танигдахгүй багц: {0} — тооцогдохгүй.', bad.join(', ')));
  };
  for (const { d, removed } of all) {
    if (d.kind === 'cap') {
      if (isPlain(d.cap)) { if (removed && !base.caps.includes(d.cap)) noop(d); }
      else if (isDerivedCap(d.cap)) push('derivedCap', 'error', tr('«{0}» эрх хуваарилалтаас гардаг — шууд олгохгүй, багцын үүргээр олгоно.', capLabel(d.cap)));
      else push('unknownCap', 'error', tr('Танигдахгүй эрх: {0}', String(d.cap)));
    } else if (d.kind === 'view') {
      if (removed && !base.views.includes(d.view)) noop(d);
    } else if (d.kind === 'docs') {
      if (removed && !base.docs) noop(d);
    } else if (d.kind === 'role') {
      if (!isSys(d.sys) || !isRole(d.sys, d.role)) {
        push('unknownRole', 'error', tr('Танигдахгүй багцын үүрэг: {0}', `${String(d.sys)}.${String(d.role)}`));
        continue;
      }
      badPkg(d.sys, d.bagts);
      if (removed && !bagtsOfRole(base, d.sys, d.role).length) noop(d);
    } else if (d.kind === 'stage') {
      badPkg('flow', d.bagts);
      if (removed && base.flow?.stage !== d.stage) noop(d);
    }
  }

  /* Нэг аккаунт = нэг шат: «нэмсэн» шатууд хоорондоо, мөн хассаны дараа үлдсэн суурийн шаттай */
  const kept = compile({ ...p, add: [] }, defs, cat).flow;
  const stages = uniq([
    ...(kept ? [kept.stage] : []),
    ...(p.add ?? []).flatMap((d) => (d.kind === 'stage' && isStage(d.stage) ? [d.stage] : [])),
  ]);
  if (stages.length > 1) {
    push('twoStages', 'error', tr('Нэг аккаунт зөвхөн нэг шат барина: {0}. Сүүлд нэмсэн шат л үлдэнэ.', stages.map((s) => STAGE_LABEL[s]).join(', ')));
  }
  if (p.job === 'zahiral' && compile(p, defs, cat).flow) {
    push('zahiralStage', 'error', tr('Ерөнхий захирал урсгалын шатанд томилогдохгүй — бүх багцыг зөвхөн харна.'));
  }
  return out;
}

/* ══════════════════════ Бүх хүн дээрх шинжилгээ ══════════════════════ */

export type Missing = {
  sys: 'flow' | Sys;
  /** Шат эсвэл багцын үүрэг */
  role: string;
  /** `stuck` — ажил гацна · `gap` — нөхөх ёстой, гацаа биш · `empty` — энэ систем багцад огт томилогдоогүй */
  level: 'stuck' | 'gap' | 'empty';
  text: string;
};
export type Conflict = {
  kind: 'selfApprove' | 'duplicate';
  sys: Sys;
  roles: string[];
  users: string[];
  text: string;
};
export type PackageCoverage = {
  bagts: string;
  /** Шат бүрийг ШИЙДВЭР гаргах эрхтэй барьж буй хүмүүс */
  flow: Record<Stage, string[]>;
  /** Шатыг зөвхөн харж буй хүмүүс («Зөвхөн харна» · Ерөнхий захирал) */
  flowViewers: Record<Stage, string[]>;
  huvaari: Record<string, string[]>;
  obyem: Record<string, string[]>;
  ajil: Record<string, string[]>;
  chanar: Record<string, string[]>;
  /** Дэд бүтцийн засварлагчид — багцын хос дэд бүтцийн багцаар (`bagtsKey`); хосгүй бол хоосон (2026-11-23) */
  butets: Record<string, string[]>;
  /** ХАБЭА-г энэ багцаар харах хязгаартай хүмүүс (2026-11-23) — хязгаар тул ажил гацаахгүй */
  habea: Record<string, string[]>;
  missing: Missing[];
  conflicts: Conflict[];
};

/**
 * Шинжилгээний оролт — ХҮН (`Person`, `compile`-оор задална) эсвэл аккаунтын БОДИТ мөрүүд (2026-11-23).
 */
export type Holder = Person | { user: string; rights: RightsInput };
const holderRights = (h: Holder, defs: readonly JobDef[], cat: Catalog): Rights =>
  ('rights' in h ? normRights(h.rights, cat) : compile(h, defs, cat));

const covers = (list: readonly string[] | undefined, g: string): boolean => !!list && (list[0] === ALL || list.includes(g));
/** Зохиогч бүрд ӨӨР батлагч байна уу — үгүй бол өөрийнхөө илгээснийг батлах хүнгүй (`erhOverview`-ийн дүрэм) */
const noOther = (authors: readonly string[], approvers: readonly string[]): boolean =>
  authors.some((a) => !approvers.some((b) => b !== a));

const PAIRS: readonly { sys: 'huvaari' | 'obyem' | 'ajil'; first: string; second: string }[] = [
  { sys: 'huvaari', first: 'author', second: 'approver' },
  { sys: 'obyem', first: 'editor', second: 'approver' },
  { sys: 'ajil', first: 'editor', second: 'approver' },
];
const CHANAR_REVIEWERS = ['tuh', 'chanar', 'habea', 'tug', 'cheng'] as const;

/**
 * БАГЦ БҮРИЙН ХАМРАЛТ — хэн аль үүрийг барьж байна, юу ДУТУУ, юу ЗӨРЧИЛТЭЙ.
 *
 * «АЖИЛ ЮУНД ГАЦАХ ВЭ» дүрмүүд (урсгалын код · `erhOverview.pkgIssues`-тэй ижил):
 *   1. Гүйцэтгэл — илгээсэн обьём зургаан хянах шатыг ДАРААЛЛААР дамжина (`hyanalt.nextReview`; хоосон шатыг алгасдаггүй). Шат бүрд
 *      шийдвэр гаргах эрхтэй (хөндлөнгийн «зөвхөн харна» биш, Ерөнхий захирал биш) дор хаяж нэг хүн хэрэгтэй. Гүйцэтгэгч компани
 *      алга бол бөглөж илгээх хүнгүй. Долоон шат БҮГД хоосон бол багц эхлээгүй (`empty`), хэсэгчлэн хоосон бол гацаа (`stuck`).
 *   2. Хуваарь — зохиогч ба ӨӨР батлагч (өөрийнхөө илгээснийг өөрөө батлахгүй — `huvaariBatlah.decidePlan`). Зохиогчтой, батлагчгүй
 *      = гацаа; батлагчтай, зохиогчгүй = нөхөх (`gap`); хоёулаа алга = `empty`.
 *   3. Инженерийн обьём (засварлагч + батлагч) · Нэмэлт ажил (мөр нэмэгч + батлагч) — хуваарьтай ижил дүрэм.
 *   4. Чанарын баримт — ирүүлэгчтэй багцад таван хянагч үүрэг бүрд ирүүлэгчээс ӨӨР хүн; нэг ч хянагчгүй = гацаа, зарим нь = нөхөх.
 * ЗӨРЧИЛ: нэг хүн нэг багцад зохиогч+батлагч (засварлагч+батлагч) · хуваарийн нэг багцад нэгээс олон зохиогч/батлагч
 * (`huvaariAcl.planRoleConflict` — нэг багцад нэг зохиогч, нэг батлагч).
 */
export function coverage(
  people: readonly Holder[],
  defs: readonly JobDef[] = JOB_DEFS,
  packages: readonly string[] = CATALOG.groups,
  cat: Catalog = CATALOG,
): PackageCoverage[] {
  const ix = indexOf(cat);
  const list = people.map((p) => ({ user: lc(p.user), r: holderRights(p, defs, cat) }));
  const who = (u: string): string => {
    const role = list.find((p) => p.user === u)?.r.role ?? null;
    const label = role ? findDef(defs, role)?.label : undefined;
    return label ? `${u} (${label})` : u;
  };
  return packages.map((raw): PackageCoverage => {
    /* бичлэгийн зөрүүг арилгана («Багц 5.1» → «Багц-5.1»); дэд бүтцийн системд хос түлхүүрээр */
    const bagts = canonToken(raw, ix) ?? raw.trim();
    const packKey = tokenTo('butets', bagts, ix);
    const stageMap = (viewers: boolean): Record<Stage, string[]> => Object.fromEntries(STAGE_ORDER.map((st) => [
      st,
      list.filter((p) => p.r.flow?.stage === st && covers(p.r.flow.bagts, bagts)
        && (p.r.flow.viewOnly || p.r.role === 'zahiral') === viewers).map((p) => p.user).sort(),
    ])) as Record<Stage, string[]>;
    const byRole = (sys: Sys): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      const name = sys === 'butets' ? packKey : bagts;
      if (name === null) return out;
      for (const role of rolesOf(sys)) {
        const users = list.filter((p) => covers(bagtsOfRole(p.r, sys, role), name)).map((p) => p.user).sort();
        if (users.length) out[role] = users;
      }
      return out;
    };
    const flow = stageMap(false);
    const sysMap = { huvaari: byRole('huvaari'), obyem: byRole('obyem'), ajil: byRole('ajil'), chanar: byRole('chanar') };
    const missing: Missing[] = [];
    const conflicts: Conflict[] = [];

    const anyFlow = STAGE_ORDER.some((st) => flow[st].length > 0);
    for (const st of STAGE_ORDER) {
      if (flow[st].length) continue;
      missing.push({
        sys: 'flow', role: st, level: anyFlow ? 'stuck' : 'empty',
        text: st === 'company'
          ? tr('{0}: гүйцэтгэгч компани томилогдоогүй — гүйцэтгэлийг хэн ч бөглөж илгээхгүй.', bagts)
          : tr('{0}: гүйцэтгэлийн урсгалын {1}-р шат ({2}) томилогдоогүй — илгээлт тэр шатанд зогсоно.', bagts, String(stageNo(st)), STAGE_LABEL[st]),
      });
    }

    for (const { sys, first, second } of PAIRS) {
      const A = sysMap[sys][first] ?? [], B = sysMap[sys][second] ?? [];
      const noFirst = sys === 'huvaari'
        ? tr('{0}: хуваарийн зохиогч томилоогүй — хуваарийг хэн ч төлөвлөж илгээхгүй.', bagts)
        : sys === 'obyem'
          ? tr('{0}: обьёмын засварлагч томилоогүй — инженерийн төлөвлөсөн обьёмыг хэн ч засахгүй.', bagts)
          : tr('{0}: нэмэлт ажлын мөр нэмэгч томилоогүй — шинэ ажлын мөрийг хэн ч нэмэхгүй.', bagts);
      const noSecond = issueText({ tone: 'bad', key: `${sys}NoApprover`, args: [bagts] });
      if (!A.length && !B.length) {
        missing.push({ sys, role: first, level: 'empty', text: noFirst }, { sys, role: second, level: 'empty', text: noSecond });
      } else if (!A.length) {
        missing.push({ sys, role: first, level: 'gap', text: noFirst });
      } else if (!B.length) {
        missing.push({ sys, role: second, level: 'stuck', text: noSecond });
      } else if (noOther(A, B)) {
        missing.push({ sys, role: second, level: 'stuck', text: issueText({ tone: 'bad', key: `${sys}SelfApprove`, args: [bagts, B.join(', ')] }) });
      }
      for (const u of A.filter((x) => B.includes(x))) {
        conflicts.push({
          kind: 'selfApprove', sys, roles: [first, second], users: [u],
          text: tr('{0}: {1} нь «{2}» ба «{3}» хоёулаа — өөрийн илгээснийг өөрөө батлах боломжгүй.', bagts, who(u), roleText(sys, first), roleText(sys, second)),
        });
      }
    }
    for (const role of ['author', 'approver']) {
      const users = sysMap.huvaari[role] ?? [];
      if (users.length > 1) {
        conflicts.push({
          kind: 'duplicate', sys: 'huvaari', roles: [role], users,
          text: tr('{0}: «{1}» эрхтэй {2} хүн байна ({3}) — нэг багцад нэг л байна.', bagts, roleText('huvaari', role), String(users.length), users.map(who).join(', ')),
        });
      }
    }

    const cA = sysMap.chanar.author ?? [];
    if (cA.length) {
      const gaps = CHANAR_REVIEWERS.filter((r) => noOther(cA, sysMap.chanar[r] ?? []));
      const stuck = cA.some((a) => !CHANAR_REVIEWERS.some((r) => (sysMap.chanar[r] ?? []).some((u) => u !== a)));
      const text = issueText({ tone: 'warn', key: stuck ? 'chanarNoReviewer' : 'chanarRoleGap', args: [bagts, gaps.join(', ')] });
      for (const r of gaps) missing.push({ sys: 'chanar', role: r, level: stuck ? 'stuck' : 'gap', text });
    }
    return { bagts, flow, flowViewers: stageMap(true), ...sysMap, butets: byRole('butets'), habea: byRole('habea'), missing, conflicts };
  });
}

/**
 * ХЭН ЧАДАХ ВЭ — өгсөн нөхцөл БҮГДИЙГ хангасан аккаунтууд (эрэмбэлсэн).
 *   · `cap` — энгийн эрх бол эрхийн жагсаалтаас; хуваарилалтаас гардаг эрх бол тэр эрхийг өгдөг үүргээс
 *   · `sys` (+ `role`) — багцын үүрэг; `stage` — урсгалын шат (зөвхөн харагч тооцогдохгүй)
 *   · `bagts` — дээрх бүгдийг тэр багцаар хязгаарлана; ганцаараа бол тэр багцад ямар нэг томилгоотой хүн
 */
export function whoCan(
  q: { cap?: CapKey; sys?: Sys; role?: string; stage?: Stage; bagts?: string },
  people: readonly Holder[],
  defs: readonly JobDef[] = JOB_DEFS,
  cat: Catalog = CATALOG,
): string[] {
  const ix = indexOf(cat);
  const g = q.bagts == null ? null : (ix.canon.get(bagtsKey(q.bagts)) ?? q.bagts.trim());
  const on = (space: Space, list: readonly string[]): boolean => {
    if (!list.length) return false;
    if (g === null || list[0] === ALL) return true;
    return list.includes(space === 'butets' ? (tokenTo('butets', g, ix) ?? g) : g);
  };
  const hasRole = (r: Rights, sys: Sys, roles: readonly string[]): boolean =>
    (r.acl[sys] ?? []).some((x) => roles.includes(x.role) && on(sys, x.bagts));
  const out: string[] = [];
  for (const p of people) {
    const r = holderRights(p, defs, cat);
    let ok = true;
    if (q.cap) {
      const cap = q.cap;
      const sys = SCOPED_SYSTEMS.find((s) => (Object.values(ROLE_CAPS[s]) as string[]).includes(cap));
      ok &&= sys
        ? hasRole(r, sys, rolesOf(sys).filter((role) => capOfRole(sys, role) === cap))
        : r.caps.includes(cap);
    }
    if (q.sys) ok &&= hasRole(r, q.sys, q.role ? [q.role] : rolesOf(q.sys));
    if (q.stage) ok &&= !!r.flow && r.flow.stage === q.stage && !r.flow.viewOnly && r.role !== 'zahiral' && on('flow', r.flow.bagts);
    if (!q.cap && !q.sys && !q.stage) {
      ok = g !== null && ((!!r.flow && on('flow', r.flow.bagts)) || SCOPED_SYSTEMS.some((s) => hasRole(r, s, rolesOf(s))));
    }
    if (ok) out.push(lc(p.user));
  }
  return uniq(out).sort();
}

'use client';

/**
 * ЭРХИЙН ТӨРӨЛ — 10 төрөл × системийн бүх тохиргоо (2026-09-25).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шийдвэр). Урьд нь хэрэглэгчийн «үүрэг» нь гурван
 *    preset (Супер · Энгийн · Төлөвлөлт) байж, бусад эрхийг (хуваарь, обьём,
 *    чанар…) хүн бүрд долоон хуудсаар тусад нь өгдөг байв. Одоо төрөл бүрд юу
 *    ХАРАХ, юу ЗАСАХ нь нэг загвартай; хэрэглэгчид төрөл + багц сонгоод
 *    «Төрлөөр тохируулах» дарахад бүгд нэг дор бичигдэнэ (`roleTypeApply.ts`).
 *
 * ⚠️ ЗАГВАР ӨӨРӨӨ ЭРХ ОЛГОХГҮЙ. Хэрэгжүүлэлт нь урьдын хуваарилалтын бичих
 *    давхаргаар (`aclOps` · `caps` · `guitsetgelAcl`) явна — хяналт, fail-closed
 *    дүрмүүд хэвээр. Загварыг өөрчилсний дараа тухайн төрлийн хэрэглэгчдэд
 *    «Дахин хэрэгжүүлэх» дарж тараана.
 * ⚠️ ХАРАГДАЦ ба НҮҮР ЦОНХ нь харин ШУУД загвараас (`roleAccess`) — урсгалын
 *    томилгоо (`grantFlowAccess`) ба «Сэргээх» нь `ROLE_ACCESS`-ийн оронд
 *    үүнийг уншдаг, эс бөгөөс загварын харагдацыг `guitsetgel` ганцаар дарна.
 *
 * ⚠️ Анхдагч загвар = хэрэглэгчийн 2026-09-25-нд чеклэсэн хүснэгт. Хүснэгтэд
 *    (`__type__:` мөр) хадгалсан загвар байвал тэр давамгайлна.
 */

import { t as tr } from './i18nCore';
import { ROLE_ACCESS, VIEWS, type Role, type ViewKey } from './services';
import type { ScopedSys } from './aclRoleCaps';
import type { CapKey } from './caps';

/** Сонгох 10 төрөл — дараалал нь урсгалын шат, дараа нь урсгалын бус, эцэст нь super */
export const TYPE_ORDER: readonly Role[] = [
  'guitsetgegch', 'injener', 'menejer', 'eronhii', 'heltsiin', 'gazriin',
  'taniltsah', 'chanar', 'gazar', 'super',
];

export const isTypeRole = (r: Role | null | undefined): r is Role => !!r && TYPE_ORDER.includes(r);

/* ⚠️ Текстийг ЗУРАГДАХ агшинд — модулийн түвшинд `tr()` дуудвал хэл солиход хоцорно */
export function typeLabel(r: Role): string {
  if (r === 'guitsetgegch') return tr('Гүйцэтгэгч компани');
  if (r === 'injener') return tr('Хяналтын инженер');
  if (r === 'menejer') return tr('Багцын менежер');
  if (r === 'eronhii') return tr('Ерөнхий менежер');
  if (r === 'heltsiin') return tr('Хэлтсийн дарга');
  if (r === 'gazriin') return tr('Газрын дарга');
  if (r === 'taniltsah') return tr('Мэдээлэл танилцах');
  if (r === 'chanar') return tr('Чанар');
  if (r === 'gazar') return tr('Газар чөлөөлөлт');
  if (r === 'super') return tr('Super');
  if (r === 'beginner') return tr('Энгийн (хуучин)');
  return tr('Төлөвлөлт (хуучин)');
}

/* ══════════════════════ Тохиргооны каталог ══════════════════════ */

/**
 * Багцаар хуваарилагддаг тохиргоо → систем · үүрэг.
 * ⚠️ `aclRoleCaps.ROLE_CAPS`-тэй тэгш: `cap:plan` = Хуваарь зохиогч → `plan` г.м.
 */
export const SCOPED_SETTING: Readonly<Record<string, { sys: ScopedSys; role: string }>> = {
  'cap:plan': { sys: 'huvaari', role: 'author' },
  'cap:planApprove': { sys: 'huvaari', role: 'approver' },
  'cap:obyemEdit': { sys: 'obyem', role: 'editor' },
  'cap:obyemApprove': { sys: 'obyem', role: 'approver' },
  'cap:addRow': { sys: 'ajil', role: 'editor' },
  'cap:ajilApprove': { sys: 'ajil', role: 'approver' },
  'chanar:author': { sys: 'chanar', role: 'author' },
  'chanar:tuh': { sys: 'chanar', role: 'tuh' },
  'chanar:chanar': { sys: 'chanar', role: 'chanar' },
  'chanar:habea': { sys: 'chanar', role: 'habea' },
  'cap:butets': { sys: 'butets', role: 'editor' },
};

/** Хуваарилалтгүй дөрвөн энгийн эрх (`aclRoleCaps.PLAIN_CAPS`) */
export const PLAIN_SETTING: Readonly<Record<string, CapKey>> = {
  'cap:zovshoorol': 'zovshoorol',
  'cap:finEdit': 'finEdit',
  'cap:finRow': 'finRow',
  'cap:gazar': 'gazar',
};

/** Super-т шууд олгох бүх эрх (`hasCap` super-ийг тойрдоггүй — `UserAdmin.flipCap`-ийн ⚠️) */
export const SUPER_CAP: Readonly<Record<string, CapKey>> = {
  'cap:plan': 'plan', 'cap:planApprove': 'planApprove',
  'cap:obyemEdit': 'obyemEdit', 'cap:obyemApprove': 'obyemApprove',
  'cap:addRow': 'addRow', 'cap:ajilApprove': 'ajilApprove',
  'chanar:author': 'chanarAuthor', 'chanar:tuh': 'chanarReview', 'chanar:chanar': 'chanarReview', 'chanar:habea': 'chanarReview',
  'cap:qaqc': 'qaqc', 'cap:butets': 'butets',
  'cap:zovshoorol': 'zovshoorol', 'cap:finEdit': 'finEdit', 'cap:finRow': 'finRow', 'cap:gazar': 'gazar',
};

export type SettingRow = { id: string; label: string; hint?: string; superOnly?: true };
export type SettingGroup = { title: string; rows: SettingRow[] };

/** Хүснэгтийн бүлэг ба мөрүүд — ЗУРАГДАХ агшинд (`tr`) */
export function settingGroups(): SettingGroup[] {
  return [
    {
      title: tr('Харах цонх'),
      rows: [
        ...VIEWS.map((v) => ({ id: `view:${v.key}`, label: v.title })),
        { id: 'docs', label: tr('ТЭЗҮ · ДБОНҮ баримт үзэх') },
      ],
    },
    {
      title: tr('Гүйцэтгэлийн урсгал (6 шат)'),
      rows: [
        { id: 'flow:act', label: tr('Өөрийн шатанд гүйцэтгэл бөглөх / хянах / батлах'), hint: tr('Зөвхөн урсгалын 6 төрөлд — шат нь төрлөөсөө') },
        { id: 'flow:viewOnly', label: tr('Зөвхөн харна (шийдвэр гаргахгүй)'), hint: tr('Дээрхтэй хамт чеклэвэл дээрх нь давамгайлна') },
      ],
    },
    {
      title: tr('Хуваарь'),
      rows: [
        { id: 'cap:plan', label: tr('Хуваарь төлөвлөх') },
        { id: 'cap:planApprove', label: tr('Хуваарь батлах') },
      ],
    },
    {
      title: tr('Инженерийн обьём'),
      rows: [
        { id: 'cap:obyemEdit', label: tr('Инженерийн обьём засах') },
        { id: 'cap:obyemApprove', label: tr('Инженерийн обьём батлах') },
      ],
    },
    {
      title: tr('Нэмэлт ажил'),
      rows: [
        { id: 'cap:addRow', label: tr('Мөр нэмэх (нэмэлт ажил илгээх)') },
        { id: 'cap:ajilApprove', label: tr('Нэмэлт ажил батлах') },
      ],
    },
    {
      title: tr('Чанарын баримт'),
      rows: [
        { id: 'chanar:author', label: tr('Чанарын баримт ирүүлэх (гүйцэтгэгч)') },
        { id: 'chanar:tuh', label: tr('Хянах — ТУХ') },
        { id: 'chanar:chanar', label: tr('Хянах — Чанар') },
        { id: 'chanar:habea', label: tr('Хянах — ХАБЭА') },
      ],
    },
    { title: tr('QAQC'), rows: [{ id: 'cap:qaqc', label: tr('QAQC — Inspection Test Plan бөглөх') }] },
    { title: tr('Инженерийн дэд бүтэц'), rows: [{ id: 'cap:butets', label: tr('Инженерийн дэд бүтцийн засвар (бөглөх)') }] },
    {
      title: tr('Бусад засвар'),
      rows: [
        { id: 'cap:zovshoorol', label: tr('Зөвшөөрөл засах') },
        { id: 'cap:finEdit', label: tr('Санхүүгийн бүртгэл — утга засах') },
        { id: 'cap:finRow', label: tr('Санхүүгийн бүртгэл — мөр нэмэх, устгах') },
        { id: 'cap:gazar', label: tr('Газрын төлөв засах') },
      ],
    },
    {
      title: tr('Удирдлага'),
      rows: [{ id: 'admin', label: tr('Хэрэглэгчийн эрх удирдах (админ самбар)'), hint: tr('Зөвхөн Super төрөлд'), superOnly: true }],
    },
  ];
}

const VIEW_KEYS = new Set<string>(VIEWS.map((v) => v.key));
const KNOWN = new Set<string>([
  ...VIEWS.map((v) => `view:${v.key}`), 'docs', 'flow:act', 'flow:viewOnly',
  ...Object.keys(SCOPED_SETTING), 'cap:qaqc', ...Object.keys(PLAIN_SETTING), 'admin',
]);

/* ══════════════════════ Загвар ══════════════════════ */

export type TypeTpl = {
  /** Чеклэсэн тохиргооны id-ууд */
  on: string[];
  /** Нэвтрэхэд нээгдэх цонх */
  home: ViewKey;
  /** `own` — зөвхөн оноосон багц · `all` — бүх багц */
  scope: 'own' | 'all';
};

const V = (...k: string[]) => k.map((x) => `view:${x}`);
const ALL_VIEWS = VIEWS.map((v) => `view:${v.key}`);
const LEADER = [
  ...ALL_VIEWS, 'docs', 'flow:act', 'flow:viewOnly',
  'cap:planApprove', 'cap:obyemApprove', 'cap:ajilApprove', 'cap:zovshoorol',
];

/** ⚠️ Хэрэглэгчийн 2026-09-25-нд чеклэсэн хүснэгт — хадгалсан загвар байхгүй үеийн анхдагч */
const DEFAULT_TPL: Record<string, TypeTpl> = {
  guitsetgegch: {
    on: [...V('guitsetgel', 'pkgFin', 'pkgProg', 'plan', 'huvaari', 'huvaariBatlah', 'ajilBatlah', 'habea', 'dedButets', 'qaqc', 'zovshoorol', 'chanar'),
      'flow:act', 'cap:plan', 'cap:addRow', 'chanar:author', 'cap:qaqc', 'cap:zovshoorol'],
    home: 'guitsetgel', scope: 'own',
  },
  injener: {
    on: [...V('gdash', 'dashboard', 'plan', 'pkgFin', 'pkgProg', 'gazar', 'huvaari', 'huvaariBatlah', 'ajilBatlah', 'habea', 'dedButets', 'zovshoorol', 'guitsetgel', 'qaqc', 'chanar'),
      'docs', 'flow:act', 'flow:viewOnly', 'cap:obyemEdit', 'cap:ajilApprove', 'cap:butets', 'cap:zovshoorol', 'cap:qaqc',
      'chanar:author', 'chanar:tuh', 'chanar:chanar', 'chanar:habea', 'cap:planApprove'],
    home: 'guitsetgel', scope: 'own',
  },
  menejer: {
    on: [...V('gdash', 'dashboard', 'plan', 'pkgFin', 'pkgProg', 'gazar', 'huvaari', 'huvaariBatlah', 'ajilBatlah', 'habea', 'dedButets', 'zovshoorol', 'guitsetgel', 'finance', 'chanar', 'qaqc'),
      'docs', 'flow:act', 'flow:viewOnly', 'cap:planApprove', 'cap:obyemApprove', 'cap:ajilApprove', 'cap:zovshoorol'],
    home: 'gdash', scope: 'own',
  },
  eronhii: { on: LEADER, home: 'gdash', scope: 'all' },
  heltsiin: { on: LEADER, home: 'gdash', scope: 'all' },
  gazriin: { on: LEADER, home: 'gdash', scope: 'all' },
  taniltsah: {
    on: [...V('gdash', 'dashboard', 'plan', 'pkgProg', 'tailan', 'schem', 'sysdoc', 'gazar'), 'docs'],
    home: 'gdash', scope: 'all',
  },
  chanar: {
    on: [...V('qaqc', 'chanar', 'gdash', 'plan', 'gazar', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
      'cap:qaqc', 'chanar:chanar', 'chanar:tuh', 'chanar:author', 'chanar:habea'],
    home: 'chanar', scope: 'all',
  },
  gazar: {
    on: [...V('gazar', 'gdash', 'plan', 'irged', 'huvaari', 'habea', 'iot', 'dedButets', 'zovshoorol', 'chanar', 'schem'), 'cap:gazar'],
    home: 'gazar', scope: 'all',
  },
  super: {
    on: [...ALL_VIEWS, 'docs', ...Object.keys(SUPER_CAP), 'admin'],
    home: 'gdash', scope: 'all',
  },
};

/**
 * Хүснэгтээс ирсэн (итгэлгүй) загварыг шүүнэ.
 * ⚠️ FAIL-CLOSED: танигдахгүй id хаягдана; `admin` зөвхөн super-т; эвдэрсэн бол `null`
 *    (анхдагч загвар үйлчилнэ — хоосон загвар хэн нэгний эрхийг чимээгүй хумихгүй).
 */
export function cleanTpl(role: Role, raw: unknown): TypeTpl | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { on?: unknown; home?: unknown; scope?: unknown };
  if (!Array.isArray(r.on)) return null;
  const on = [...new Set(r.on.filter((x): x is string => typeof x === 'string' && KNOWN.has(x)))]
    .filter((x) => x !== 'admin' || role === 'super');
  const home = typeof r.home === 'string' && VIEW_KEYS.has(r.home) ? (r.home as ViewKey) : (DEFAULT_TPL[role]?.home ?? 'gdash');
  return { on, home, scope: r.scope === 'all' ? 'all' : 'own' };
}

/* ══════════════════════ Хүснэгтээс уншсан загвар ══════════════════════ */

let remote: Partial<Record<Role, TypeTpl>> = {};
let synced = false;
const EVENT = 'selbe-roletypes-change';
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

/** `permissions.initRemote`-оос — `__type__:` мөрүүд */
export function _syncRemoteTypes(rows: { role: string; tpl: unknown }[]): void {
  const next: Partial<Record<Role, TypeTpl>> = {};
  for (const row of rows) {
    const role = row.role as Role;
    if (!isTypeRole(role)) continue;
    const t = cleanTpl(role, row.tpl);
    if (t) next[role] = t;
  }
  remote = next;
  synced = true;
  notify();
}

export const typesReady = (): boolean => synced;
/** Хүснэгтэд хадгалсан загвартай эсэх (анхдагчаас ялгаж харуулна) */
export const isStoredTpl = (r: Role): boolean => !!remote[r];

export function subscribeTypes(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Төрлийн одоогийн загвар — хадгалсан, эс бөгөөс анхдагч */
export function tplOf(role: Role): TypeTpl {
  const t = remote[role] ?? DEFAULT_TPL[role];
  return t ? { on: [...t.on], home: t.home, scope: t.scope } : { on: [], home: ROLE_ACCESS[role].home, scope: 'own' };
}

/** Загварыг хүснэгтэд бичнэ — амжилттай бол локал хуулбарыг шинэчилнэ */
export async function saveTpl(role: Role, tpl: TypeTpl): Promise<boolean> {
  const clean = cleanTpl(role, tpl);
  if (!clean || !isTypeRole(role)) return false;
  try {
    const { typeUpsert } = await import('./permsRemote');
    const ok = await typeUpsert(role, clean);
    if (ok) { remote = { ...remote, [role]: clean }; notify(); }
    return ok;
  } catch {
    return false;
  }
}

/**
 * ҮҮРГИЙН ХАРАГДАЦ · БАРИМТ · НҮҮР ЦОНХ — `ROLE_ACCESS`-ийн оронд уншина.
 * ⚠️ Хуучин хоёр үүрэг (beginner · tolovlolt) `ROLE_ACCESS`-ээсээ.
 * ⚠️ Super үргэлж `'all'` — загвараас харагдац хасагдсан ч админ самбарт хүрэх
 *    замаа алдахгүй.
 */
export function roleAccess(role: Role): { views: ViewKey[] | 'all'; docs: boolean; home: ViewKey } {
  if (!isTypeRole(role)) return ROLE_ACCESS[role];
  const t = tplOf(role);
  if (role === 'super') return { views: 'all', docs: true, home: t.home };
  const views = t.on.filter((x) => x.startsWith('view:')).map((x) => x.slice(5) as ViewKey);
  return { views, docs: t.on.includes('docs'), home: t.home };
}

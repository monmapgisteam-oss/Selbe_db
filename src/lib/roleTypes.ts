'use client';

/**
 * ЭРХИЙН ТӨРӨЛ — 11 төрөл (2026-10-23-нд 10-аас — «Төлөвлөлтийн инженер» нэмэгдэв) × ХАРАХ тохиргоо (2026-09-25 · 2026-09-30).
 */

import { t as tr } from './i18nCore';
import { ROLE_ACCESS, VIEWS, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS } from './caps';

const TPL_VIEWS = VIEWS.filter((v) => !WORKFLOW_VIEWS.includes(v.key));

/** Сонгох 11 төрөл (2026-10-23: `tolovloltiin` нэмэгдэв) — дараалал нь урсгалын шат, дараа нь урсгалын бус, эцэст нь super */
export const TYPE_ORDER: readonly Role[] = [
  'guitsetgegch', 'injener', 'menejer', 'tolovloltiin', 'eronhii', 'heltsiin', 'gazriin',
  'zahiral',
  'taniltsah', 'chanar', 'gazar', 'super',
];

export const isTypeRole = (r: Role | null | undefined): r is Role => !!r && TYPE_ORDER.includes(r);

/**
 * ШИНЭ АККАУНТЫН АНХДАГЧ ТӨРӨЛ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export const NEW_ACCOUNT_ROLE: Role = 'taniltsah';

export function typeLabel(r: Role): string {
  if (r === 'guitsetgegch') return tr('Гүйцэтгэгч компани');
  if (r === 'injener') return tr('Хяналтын инженер');
  if (r === 'menejer') return tr('Багцын ахлах инженер');
  if (r === 'tolovloltiin') return tr('Төлөвлөлтийн инженер');
  if (r === 'eronhii') return tr('Төлөвлөлтийн ахлах инженер');
  if (r === 'heltsiin') return tr('Хэлтсийн дарга');
  if (r === 'gazriin') return tr('Газрын дарга');
  if (r === 'zahiral') return tr('Ерөнхий захирал');
  if (r === 'taniltsah') return tr('Мэдээлэл танилцах');
  if (r === 'chanar') return tr('Чанар');
  if (r === 'gazar') return tr('Газар чөлөөлөлт');
  if (r === 'super') return tr('Super');
  if (r === 'beginner') return tr('Энгийн (хуучин)');
  return tr('Төлөвлөлт (хуучин)');
}

/* ══════════════════════ Тохиргооны каталог ══════════════════════ */

/**
 * «ХУВААРЬ ХАРАХ» — ГУРВАН УТГАТАЙ ТӨРЛИЙН ТОХИРГОО (2026-10-26, хэрэглэгч):
 *   · `all`  — бүх багц (`on`-д `huvaari:all`)
 *   · `own`  — өөрийн багц: тухайн хүний ЯМАР НЭГ хуваарилалттай багцууд (`huvaariView.huvaariViewScope`; `on`-д `huvaari:own`)
 *   · `none` — үгүй (аль нь ч байхгүй)
 */
export type HvScope = 'all' | 'own' | 'none';
export const HV_ALL = 'huvaari:all';
export const HV_OWN = 'huvaari:own';
const isHvId = (id: string): boolean => id === HV_ALL || id === HV_OWN;
/** `on`-оос гурван утгын нэг — хоёулаа байвал (эвдэрсэн мөр) НАРИЙН нь (`own`) */
export const hvScopeOf = (on: readonly string[]): HvScope =>
  (on.includes(HV_OWN) ? 'own' : on.includes(HV_ALL) ? 'all' : 'none');
/** `on`-ыг шинэ утгаар — бусад id хөндөгдөхгүй */
export const withHvScope = (on: readonly string[], v: HvScope): string[] =>
  [...on.filter((x) => !isHvId(x)), ...(v === 'all' ? [HV_ALL] : v === 'own' ? [HV_OWN] : [])];
export const HV_ROW = 'huvaari:scope';
/**
 * «Хуваарь харах»-ыг админ ШИЙДСЭН гэсэн тэмдэг — хадгалсан загварын `seen`-д (ViewKey, `cleanTpl`-ийн `VIEW_KEYS` шүүлтийг давна).
 */
const HUVAARI_MARK: ViewKey = 'huvaari';


export type SettingRow = {
  id: string; label: string; hint?: string; superOnly?: true; info?: 'author' | 'approver';
  select?: true;
};
export type SettingGroup = { title: string; rows: SettingRow[] };

/**
 * Хүснэгтийн бүлэг ба мөрүүд — ЗУРАГДАХ агшинд (`tr`).
 */
export function settingGroups(): SettingGroup[] {
  return [
    {
      title: tr('Харах цонх'),
      rows: [
        ...TPL_VIEWS.map((v) => ({ id: `view:${v.key}`, label: v.title })),
      ],
    },
    {
      title: tr('Хуваарь'),
      rows: [
        { id: HV_ROW, label: tr('Хуваарь харах'), select: true,
          hint: tr('Зөвхөн харна (засах, илгээх, батлах эрхгүй). «Өөрийн багц» — тухайн хүнд аль нэг эрхийн хуудсанд оноогдсон багцууд. Хадгалмагц үйлчилнэ.') },
        { id: 'huvaari:author', label: tr('Хуваарь зохиох'), hint: tr('«Хуваарийн эрх»-ээс багцаар оноогдоно'), info: 'author' },
        { id: 'huvaari:approver', label: tr('Хуваарь батлах'), hint: tr('«Хуваарийн эрх»-ээс багцаар оноогдоно'), info: 'approver' },
      ],
    },
    {
      title: tr('Удирдлага'),
      rows: [{ id: 'admin', label: tr('Хэрэглэгчийн эрх удирдах (админ самбар)'),
        hint: tr('Зөвхөн Super төрөлд (эрхийн тохиргооноос олгоно) — загвараас тохируулагдахгүй'), superOnly: true }],
    },
  ];
}

const VIEW_KEYS = new Set<string>(VIEWS.map((v) => v.key));
const KNOWN = new Set<string>([...TPL_VIEWS.map((v) => `view:${v.key}`), 'docs', 'admin', HV_ALL, HV_OWN]);

/* ══════════════════════ Загвар ══════════════════════ */

export type TypeTpl = {
  /** Чеклэсэн тохиргооны id-ууд (`view:*` · `docs` · `admin`) */
  on: string[];
  /** Нэвтрэхэд нээгдэх цонх */
  home: ViewKey;
  /**
   * ХАДГАЛАХ АГШИНД каталогт байсан харагдацууд (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   */
  seen?: ViewKey[];
};

const V = (...k: string[]) => k.map((x) => `view:${x}`);
const ALL_VIEWS = TPL_VIEWS.map((v) => `view:${v.key}`);
const LEADER = [...ALL_VIEWS, 'docs', HV_ALL];

const DEFAULT_TPL: Record<string, TypeTpl> = {
  guitsetgegch: {
    on: [...V('pkgFin', 'pkgProg', 'plan', 'hesegET', 'habea', 'dedButets', 'zovshoorol'), HV_OWN],
    home: 'guitsetgel',
  },
  injener: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol'), 'docs', HV_OWN],
    home: 'guitsetgel',
  },
  menejer: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol', 'finance'), 'docs', HV_OWN],
    home: 'gdash',
  },
  tolovloltiin: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol', 'finance'), 'docs', HV_ALL],
    home: 'gdash',
  },
  eronhii: { on: LEADER, home: 'gdash' },
  heltsiin: { on: LEADER, home: 'gdash' },
  gazriin: { on: LEADER, home: 'gdash' },
  zahiral: { on: LEADER, home: 'gdash' },
  taniltsah: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgProg', 'tailan', 'schem', 'sysdoc', 'gazar'), 'docs', HV_ALL],
    home: 'gdash',
  },
  chanar: {
    on: V('gdash', 'plan', 'hesegET', 'gazar', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
    home: 'ma',
  },
  gazar: {
    on: V('gazar', 'gdash', 'plan', 'hesegET', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
    home: 'gazar',
  },
  super: { on: [...ALL_VIEWS, 'docs', 'admin', HV_ALL], home: 'gdash' },
};

export const _defaultTpl = (role: Role): TypeTpl | undefined => {
  const t = DEFAULT_TPL[role];
  return t ? { on: [...t.on], home: t.home } : undefined;
};

/**
 * НАРИЙН НӨӨЦ ЗАГВАР — `ROLE_ACCESS`-ийн харагдац/баримт/нүүр цонх л.
 */
function narrowTpl(role: Role): TypeTpl {
  const a = ROLE_ACCESS[role];
  const views = a.views === 'all' ? ALL_VIEWS : a.views.filter((v) => !WORKFLOW_VIEWS.includes(v)).map((v) => `view:${v}`);
  return { on: [...views, ...(a.docs ? ['docs'] : [])], home: a.home };
}

/**
 * Хүснэгтээс ирсэн (итгэлгүй) загварыг шүүнэ.
 */
export function cleanTpl(role: Role, raw: unknown): TypeTpl | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { on?: unknown; home?: unknown; seen?: unknown };
  if (!Array.isArray(r.on)) return null;
  const on0 = [...new Set(r.on.filter((x): x is string => typeof x === 'string' && KNOWN.has(x)))]
    .filter((x) => x !== 'admin' || role === 'super');
  const on = withHvScope(on0, hvScopeOf(on0));
  const home = typeof r.home === 'string' && VIEW_KEYS.has(r.home) ? (r.home as ViewKey) : (DEFAULT_TPL[role]?.home ?? 'gdash');
  if (!Array.isArray(r.seen)) return { on, home };
  const seen = [...new Set(r.seen.filter((x): x is ViewKey => typeof x === 'string' && VIEW_KEYS.has(x)))];
  return { on, home, seen };
}

/* ══════════════════════ Шинэ хуудас — загварт тохируулаагүй (2026-10-01) ══════════════════════ */

/** Загварт орох харагдацын түлхүүрүүд — ОДООГИЙН каталог (урсгалтай 6 хасагдсан) */
export const tplViewKeys = (): ViewKey[] => TPL_VIEWS.map((v) => v.key);
/**
 * ХАДГАЛАХ агшны `seen` — каталог + «Хуваарь харах» шийдсэн тэмдэг (2026-10-26, `HUVAARI_MARK`).
 */
export const tplSeenKeys = (): ViewKey[] => [...tplViewKeys(), HUVAARI_MARK];

/**
 * «Хуваарь харах»-ыг админ энэ загварт ШИЙДСЭН эсэх (2026-10-26) — `seen`-д тэмдэгтэй.
 * Анхдагч (хадгалаагүй) загвар — `DEFAULT_TPL` өөрөө шийдвэр тул `true`.
 */
export const planViewDecided = (t: TypeTpl, stored: boolean): boolean => !stored || !!t.seen?.includes(HUVAARI_MARK);

/**
 * Тэмдэггүй (энэ тохиргооноос ӨМНӨ хадгалсан) загварт «Хуваарь харах»-ын АНХДАГЧ утгыг тавина — санах ойд л,
 * хадгалсан мөрийг дахин бичихгүй ( 2026-10-26, `HUVAARI_MARK`).
 */
function withPlanDefault(role: Role, t: TypeTpl): TypeTpl {
  if (t.seen?.includes(HUVAARI_MARK)) return t;
  return { ...t, on: withHvScope(t.on, hvScopeOf(DEFAULT_TPL[role]?.on ?? [])) };
}

/**
 * `seen`-гүй (2026-10-01-ээс ӨМНӨ хадгалсан) загварын «мэдэж байсан» каталог.
 */
const VIEWS_AFTER_TEMPLATES: readonly string[] = ['tuh'];
const LEGACY_SEEN = (): ViewKey[] => tplViewKeys().filter((k) => !VIEWS_AFTER_TEMPLATES.includes(k));

/**
 * ХАДГАЛСАН загвар «мэдээгүй» (хадгалах агшинд каталогт байгаагүй) харагдацууд.
 */
export function unseenViews(role: Role): ViewKey[] {
  loadCache();
  if (role === 'super') return [];
  const t = remote[role];
  if (!t) return [];
  const seen = new Set<string>(t.seen ?? LEGACY_SEEN());
  return tplViewKeys().filter((k) => !seen.has(k));
}

/* ══════════════════════ Хүснэгтээс уншсан загвар ══════════════════════ */

let remote: Partial<Record<Role, TypeTpl>> = {};
let broken = new Set<Role>();
let synced = false;
/** localStorage-оос сэргээсэн эсэх (анхны синкээс өмнө) */
let cacheLoaded = false;
let cacheTried = false;
const EVENT = 'selbe-roletypes-change';
const CACHE_KEY = 'selbe-roletypes-cache-v1';
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

/**
 * СИНКЛЭСЭН ЗАГВАРЫН КЭШ (2026-09-25).
 */
function loadCache(): void {
  if (cacheTried) return;
  cacheTried = true;
  if (synced || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as { tpl?: Record<string, unknown>; broken?: unknown };
    const next: Partial<Record<Role, TypeTpl>> = {};
    for (const [k, v] of Object.entries(d.tpl ?? {})) {
      const role = k as Role;
      if (!isTypeRole(role)) continue;
      const t = cleanTpl(role, v);
      if (t) next[role] = t;
    }
    remote = next;
    broken = new Set((Array.isArray(d.broken) ? d.broken : [])
      .filter((x): x is Role => typeof x === 'string' && isTypeRole(x as Role)));
    cacheLoaded = true;
  } catch { /* эвдэрсэн кэш — `narrowTpl` үйлчилнэ */ }
}

function saveCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ tpl: remote, broken: [...broken] }));
  } catch { /* дүүрсэн/хаалттай localStorage — кэшгүй ажиллана */ }
}

/**
 * ХУУЧИН SNAPSHOT ШИНЭ `saveTpl`-ИЙГ ДАРАХААС ХАМГААЛАХ (2026-09-25).
 */
let tick = 0;
const writtenAt = new Map<Role, number>();
/** `initRemote` хүсэлт эхлэхэд — буцаасан утгыг `_syncRemoteTypes`-д өгнө */
export const _typesMark = (): number => tick;

/**
 * `permissions.initRemote`-оос — `__type__:` мөрүүд.
 */
export function _syncRemoteTypes(rows: { role: string; tpl: unknown }[], mark?: number): void {
  const next: Partial<Record<Role, TypeTpl>> = {};
  const nextBroken = new Set<Role>();
  for (const row of rows) {
    const role = row.role as Role;
    if (!isTypeRole(role)) continue;
    const t = cleanTpl(role, row.tpl);
    if (t) { next[role] = t; nextBroken.delete(role); } else { delete next[role]; nextBroken.add(role); }
  }
  if (mark !== undefined) {
    for (const [role, at] of writtenAt) {
      if (at <= mark) continue;
      const mine = remote[role];
      if (mine) next[role] = mine; else delete next[role];
      if (broken.has(role)) nextBroken.add(role); else nextBroken.delete(role);
    }
  }
  remote = next;
  broken = nextBroken;
  synced = true;
  cacheTried = true;
  saveCache();
  notify();
}

export const typesReady = (): boolean => synced;
/** Хүснэгтэд хадгалсан загвартай эсэх (анхдагчаас ялгаж харуулна) */
export const isStoredTpl = (r: Role): boolean => { loadCache(); return !!remote[r]; };

export function subscribeTypes(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Төрлийн одоогийн загвар — хадгалсан › (синк/кэш «мөргүй» гэсэн бол) анхдагч › нарийн нөөц.
 */
export function tplOf(role: Role): TypeTpl {
  loadCache();
  const known = synced || cacheLoaded;
  const stored = remote[role];
  const t = stored ? withPlanDefault(role, stored) : (known && !broken.has(role) ? DEFAULT_TPL[role] : undefined);
  if (!t) return narrowTpl(role);
  const copy: TypeTpl = { on: [...t.on], home: t.home, ...(t.seen ? { seen: [...t.seen] } : {}) };
  if (synced) return copy;
  const allowed = new Set(narrowTpl(role).on);
  return { ...copy, on: copy.on.filter((x) => allowed.has(x)) };
}

/**
 * Загварыг хүснэгтэд бичнэ — амжилттай бол локал хуулбарыг шинэчилнэ.
 */
export async function saveTpl(role: Role, tpl: TypeTpl): Promise<boolean> {
  const cleaned = cleanTpl(role, tpl);
  if (!cleaned || !isTypeRole(role)) return false;
  const clean: TypeTpl = { ...cleaned, seen: tplSeenKeys() };
  const before = writtenAt.get(role);
  writtenAt.set(role, ++tick);
  let ok = false;
  try {
    const { typeUpsert } = await import('./permsRemote');
    ok = await typeUpsert(role, clean);
    if (ok) {
      remote = { ...remote, [role]: clean };
      broken.delete(role);
      saveCache();
      notify();
    }
    return ok;
  } catch {
    return false;
  } finally {
    if (ok) writtenAt.set(role, ++tick);
    else if (before === undefined) writtenAt.delete(role);
    else writtenAt.set(role, before);
  }
}

/**
 * ҮҮРГИЙН ХАРАГДАЦ · БАРИМТ · НҮҮР ЦОНХ — `ROLE_ACCESS`-ийн оронд уншина.
 */
export function roleAccess(role: Role): { views: ViewKey[] | 'all'; docs: boolean; home: ViewKey } {
  if (!isTypeRole(role)) return ROLE_ACCESS[role];
  const t = tplOf(role);
  if (role === 'super') return { views: 'all', docs: true, home: t.home };
  const views = t.on.filter((x) => x.startsWith('view:')).map((x) => x.slice(5) as ViewKey);
  return { views, docs: t.on.includes('docs'), home: t.home };
}

/**
 * ТӨРЛИЙН «ХУВААРЬ ХАРАХ» ХҮРЭЭ (2026-10-26, хэрэглэгч) — `all` · `own` · `none`. Хүнд задлах нь
 * `huvaariView.huvaariViewScope` (өөрийн багц = хуваарилалтууд, + зохиогч · батлагчийн багц).
 */
export function typeHuvaariScope(role: Role | null | undefined): HvScope {
  if (!isTypeRole(role)) return 'none';
  return hvScopeOf(tplOf(role).on);
}

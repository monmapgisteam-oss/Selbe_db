'use client';

/**
 * ЭРХИЙН ТӨРӨЛ — 10 төрөл × ХАРАХ тохиргоо (2026-09-25 · 2026-09-30).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шийдвэр). Урьд нь хэрэглэгчийн «үүрэг» нь гурван
 *    preset (Супер · Энгийн · Төлөвлөлт) байж, харагдацыг хүн бүрд тусад нь
 *    өгдөг байв. Одоо төрөл бүрд юу ХАРАХ (харагдац · ТЭЗҮ-БОНУ · нүүр цонх ·
 *    админ самбар) нэг загвартай; хэрэглэгчид төрөл сонгоод «Төрлөөр тохируулах»
 *    дарахад харагдац нь нэг дор бичигдэнэ (`roleTypeApply.ts`).
 *
 * ⚠️ ЗӨВХӨН ХАРАХ (2026-09-30, хэрэглэгчийн шийдвэр). Урьд нь загварт засах эрх
 *    (`cap:*`), чанарын үүрэг (`chanar:*`), урсгал (`flow:*`), багцын хүрээ
 *    (`scope`) ч байж, «Төрлөөр тохируулах» нь хуваарилалт бичдэг байв. Одоо
 *    засах эрх БҮР админ порталын ӨӨРИЙН хуудсанд багц/аккаунтаар олгогдоно;
 *    загвар тэднийг ОГТ хөндөхгүй. Хүснэгтэд хадгалсан хуучин загварын
 *    `cap:*` · `chanar:*` · `flow:*` id нь `KNOWN` шүүлтээр ЧИМЭЭГҮЙ хаягдана
 *    (fail-closed — `cleanTpl`).
 * ⚠️ ХАРАГДАЦ ба НҮҮР ЦОНХ нь ШУУД загвараас (`roleAccess`) — урсгалын
 *    томилгоо (`grantFlowAccess`) ба «Сэргээх» нь `ROLE_ACCESS`-ийн оронд
 *    үүнийг уншдаг; шатанд томилогдсон хүнд «Гүйцэтгэл» хуудсыг
 *    `grantFlowAccess` өөрөө нэмдэг (загвараас хамаарахгүй).
 *
 * ⚠️ Анхдагч загвар = хэрэглэгчийн 2026-09-25-нд чеклэсэн хүснэгтийн ХАРАХ хэсэг.
 *    Хүснэгтэд (`__type__:` мөр) хадгалсан загвар байвал тэр давамгайлна.
 */

import { t as tr } from './i18nCore';
import { ROLE_ACCESS, VIEWS, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS } from './caps';

/**
 * ⚠️ ЗАГВАРТ ОРОХ ХАРАГДАЦ — урсгалтай 6-г ХАСНА (2026-09-30, хэрэглэгчийн
 *    шийдвэр): Гүйцэтгэл · Хуваарь · Хуваарь батлах · Нэмэлт ажил батлах · Чанарын
 *    баримт · Чанар (QAQC) нь урсгалын хуваарилалтаар нээгдэнэ (`caps.WORKFLOW_VIEWS`).
 *    Загвар зөвхөн харах хуудас олгоно; хадгалсан хуучин загварын тэдгээр id
 *    `cleanTpl`-д хаягдана.
 */
const TPL_VIEWS = VIEWS.filter((v) => !WORKFLOW_VIEWS.includes(v.key));

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

/*
 * ⚠️ `SCOPED_SETTING` · `PLAIN_SETTING` · `SUPER_CAP` УСТСАН (2026-09-30) —
 *    загвар засах эрх агуулахгүй (толгойн ⚠️). Хуучин id-ууд `KNOWN`-д ОРОХГҮЙ.
 */

export type SettingRow = { id: string; label: string; hint?: string; superOnly?: true };
export type SettingGroup = { title: string; rows: SettingRow[] };

/**
 * Хүснэгтийн бүлэг ба мөрүүд — ЗУРАГДАХ агшинд (`tr`).
 * ⚠️ ЗӨВХӨН ХАРАХ (2026-09-30): харагдац · ТЭЗҮ-БОНУ · админ самбар. Засах эрхийн
 *    мөрүүд (`cap:*` · `chanar:*` · `flow:*`) ХАСАГДСАН — толгойн ⚠️.
 */
export function settingGroups(): SettingGroup[] {
  return [
    {
      title: tr('Харах цонх'),
      rows: [
        ...TPL_VIEWS.map((v) => ({ id: `view:${v.key}`, label: v.title })),
        { id: 'docs', label: tr('ТЭЗҮ · ДБОНҮ баримт үзэх') },
      ],
    },
    {
      title: tr('Удирдлага'),
      rows: [{ id: 'admin', label: tr('Хэрэглэгчийн эрх удирдах (админ самбар)'), hint: tr('Зөвхөн Super төрөлд'), superOnly: true }],
    },
  ];
}

const VIEW_KEYS = new Set<string>(VIEWS.map((v) => v.key));
/* ⚠️ 2026-09-30: хадгалсан хуучин загварын `cap:*` · `chanar:*` · `flow:*` id ба урсгалтай 6
   харагдац (`view:guitsetgel` …) ЭНД БАЙХГҮЙ тул хаягдана */
const KNOWN = new Set<string>([...TPL_VIEWS.map((v) => `view:${v.key}`), 'docs', 'admin']);

/* ══════════════════════ Загвар ══════════════════════ */

export type TypeTpl = {
  /** Чеклэсэн тохиргооны id-ууд (`view:*` · `docs` · `admin`) */
  on: string[];
  /** Нэвтрэхэд нээгдэх цонх */
  home: ViewKey;
};

const V = (...k: string[]) => k.map((x) => `view:${x}`);
const ALL_VIEWS = TPL_VIEWS.map((v) => `view:${v.key}`);
const LEADER = [...ALL_VIEWS, 'docs'];

/**
 * ⚠️ Хэрэглэгчийн 2026-09-25-нд чеклэсэн хүснэгтийн ХАРАХ хэсэг — хадгалсан загвар
 *    байхгүй үеийн анхдагч (2026-09-30: засах эрх · урсгал · `scope` хасагдсан).
 * ⚠️ 2026-09-25: ЗӨВХӨН синк (эсвэл кэш) «мөр байхгүй» гэж хэлсэн үед — `tplOf`.
 */
const DEFAULT_TPL: Record<string, TypeTpl> = {
  guitsetgegch: {
    on: V('pkgFin', 'pkgProg', 'plan', 'habea', 'dedButets', 'zovshoorol'),
    home: 'guitsetgel',
  },
  injener: {
    on: [...V('gdash', 'dashboard', 'plan', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol'), 'docs'],
    home: 'guitsetgel',
  },
  menejer: {
    on: [...V('gdash', 'dashboard', 'plan', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol', 'finance'), 'docs'],
    home: 'gdash',
  },
  eronhii: { on: LEADER, home: 'gdash' },
  heltsiin: { on: LEADER, home: 'gdash' },
  gazriin: { on: LEADER, home: 'gdash' },
  taniltsah: {
    on: [...V('gdash', 'dashboard', 'plan', 'pkgProg', 'tailan', 'schem', 'sysdoc', 'gazar'), 'docs'],
    home: 'gdash',
  },
  chanar: {
    on: V('gdash', 'plan', 'gazar', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
    home: 'chanar',
  },
  gazar: {
    on: V('gazar', 'gdash', 'plan', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
    home: 'gazar',
  },
  super: { on: [...ALL_VIEWS, 'docs', 'admin'], home: 'gdash' },
};

/**
 * НАРИЙН НӨӨЦ ЗАГВАР — `ROLE_ACCESS`-ийн харагдац/баримт/нүүр цонх л.
 * ⚠️ 2026-09-25: эвдэрсэн мөр ба анхны синкээс ӨМНӨ (кэшгүй) үед `DEFAULT_TPL`-ийн
 *    оронд үүнийг өгнө — FAIL-CLOSED. `DEFAULT_TPL` нь хэрэглэгчийн чеклэсэн
 *    хүснэгт тул ӨРГӨН; хадгалсан загвар нь нарийн байхад синк хүлээх хооронд
 *    (эсвэл мөр эвдэрсэн үед) хүнд илүү цонх нээгдэж байв.
 */
function narrowTpl(role: Role): TypeTpl {
  const a = ROLE_ACCESS[role];
  /* ⚠️ Урсгалтай харагдац загварт орохгүй (`TPL_VIEWS`) */
  const views = a.views === 'all' ? ALL_VIEWS : a.views.filter((v) => !WORKFLOW_VIEWS.includes(v)).map((v) => `view:${v}`);
  return { on: [...views, ...(a.docs ? ['docs'] : [])], home: a.home };
}

/**
 * Хүснэгтээс ирсэн (итгэлгүй) загварыг шүүнэ.
 * ⚠️ FAIL-CLOSED: танигдахгүй id хаягдана; `admin` зөвхөн super-т; эвдэрсэн бол `null`
 *    (⚠️ 2026-09-25: эвдэрсэн мөрд `narrowTpl` үйлчилнэ — `_syncRemoteTypes`).
 * ⚠️ 2026-09-30: хуучин `cap:*` · `chanar:*` · `flow:*` · `scope` нь ЭНД хаягдана
 *    (толгойн ⚠️). Урсгалын «Гүйцэтгэл» хуудсыг `grantFlowAccess` өөрөө нэмдэг тул
 *    загвараас албадахгүй.
 */
export function cleanTpl(role: Role, raw: unknown): TypeTpl | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { on?: unknown; home?: unknown };
  if (!Array.isArray(r.on)) return null;
  const on = [...new Set(r.on.filter((x): x is string => typeof x === 'string' && KNOWN.has(x)))]
    .filter((x) => x !== 'admin' || role === 'super');
  const home = typeof r.home === 'string' && VIEW_KEYS.has(r.home) ? (r.home as ViewKey) : (DEFAULT_TPL[role]?.home ?? 'gdash');
  return { on, home };
}

/* ══════════════════════ Хүснэгтээс уншсан загвар ══════════════════════ */

let remote: Partial<Record<Role, TypeTpl>> = {};
/** ⚠️ 2026-09-25: мөр нь БАЙГАА атлаа эвдэрсэн төрлүүд — `narrowTpl` үйлчилнэ */
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
 * ⚠️ ЯАГААД: урьд нь анхны синкээс өмнө (эсвэл синк унахад) `DEFAULT_TPL`
 *    үйлчилдэг байв — админ загварыг нарийсгасан ч ачаалах бүрд хэдэн секунд
 *    (эсвэл ArcGIS унасан бол бүтэн сешн) ӨРГӨН анхдагч харагдац нээгдэнэ.
 *    Одоо сүүлийн синкийг кэшилж, кэшгүй бол `narrowTpl` (fail-closed).
 * ⚠️ Кэш итгэлгүй (localStorage) — `cleanTpl`-ээр дахин шүүнэ.
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
 * ⚠️ ЯАГААД: poll-ийн `fetchAll` `saveTpl`-ээс ӨМНӨ эхэлж ДАРАА нь ирвэл
 *    хуучин загвар локал хуулбарыг дарж, «Хэрэгжүүлэх» ХУУЧИН загварыг тараана.
 * ЗАГВАР: `saveTpl` эхлэх ба дуусах агшинд тоолуурыг ахиулж төрөл бүрд
 *    тэмдэглэнэ; `permissions.initRemote` хүсэлт эхлэхдээ `_typesMark()`-ийг
 *    авч синкэд өгнө. Тэмдгээс хойш бичигдсэн төрөлд ЛОКАЛ хуулбар давамгайлна —
 *    дараагийн poll remote-оор засна (`scopedAcl._beginRemoteFetch`-ийн санаа).
 */
let tick = 0;
const writtenAt = new Map<Role, number>();
/** `initRemote` хүсэлт эхлэхэд — буцаасан утгыг `_syncRemoteTypes`-д өгнө */
export const _typesMark = (): number => tick;

/**
 * `permissions.initRemote`-оос — `__type__:` мөрүүд.
 * ⚠️ `tpl: null` (эвдэрсэн мөр, `permsRemote`) → `broken` — `narrowTpl`.
 * @param mark хүсэлт эхэлсэн агшны `_typesMark()` — байхгүй (тест) бол хамгаалалтгүй
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
 * ⚠️ 2026-09-25: эвдэрсэн мөр ба синк/кэшгүй үед `narrowTpl` (fail-closed).
 */
export function tplOf(role: Role): TypeTpl {
  loadCache();
  const known = synced || cacheLoaded;
  const t = remote[role] ?? (known && !broken.has(role) ? DEFAULT_TPL[role] : undefined);
  return t ? { on: [...t.on], home: t.home } : narrowTpl(role);
}

/** Загварыг хүснэгтэд бичнэ — амжилттай бол локал хуулбарыг шинэчилнэ */
export async function saveTpl(role: Role, tpl: TypeTpl): Promise<boolean> {
  const clean = cleanTpl(role, tpl);
  if (!clean || !isTypeRole(role)) return false;
  /* ⚠️ 2026-09-25: эхлэх ба дуусах агшинд тэмдэглэнэ — `_typesMark`-ийн тайлбар */
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
    /* ⚠️ 2026-09-25 (аудит 8): УНАСАН бичилт тэмдэглэгээг АХИУЛАХГҮЙ — урьд нь
       `finally` үргэлж ахиулдаг тул амжилтгүй хадгалалтын дараа ч poll-ийн шинэ
       snapshot энэ төрөлд ХУУЧИН локал хуулбарыг хадгалж, өөр админы бичсэн
       загвар харагдахгүй байв. Унавал өмнөх тэмдэглэгээг сэргээнэ. */
    if (ok) writtenAt.set(role, ++tick);
    else if (before === undefined) writtenAt.delete(role);
    else writtenAt.set(role, before);
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

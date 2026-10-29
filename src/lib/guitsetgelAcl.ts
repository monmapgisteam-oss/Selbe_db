'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН УРСГАЛЫН ЭРХ — ХЭН, АЛЬ ШАТАНД, АЛЬ БАГЦАД.
 */

import { STAGE_ORDER, type Stage } from './hyanalt';
import { t as tr } from './i18nCore';
import {
  ROLE_STAGE, STAGE_ROLE, isCodeSuper, roleForUser, type Role, type ViewKey,
} from './services';
import { _newerThanSnapshot, _touchSeq } from './scopedAcl';
import { roleAccess } from './roleTypes';


/** Урсгалын долоон шатны үүрэг (2026-10-23: 7 шат) — «энэ хүний ажил зөвхөн урсгал» гэж таних олонлог */
const FLOW_ROLES = new Set<Role>(Object.values(STAGE_ROLE));

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

let roleReader: ((u: string) => Role | null) | null = null;
export function _setRoleReader(fn: (u: string) => Role | null): void { roleReader = fn; }
/** «Ерөнхий захирал» урсгалд томилогдохгүй (зөвхөн харна) — `setAssign`-ийн татгалзлын мессеж */
const ZAHIRAL_NO_FLOW = () => tr('Ерөнхий захирал урсгалын шатанд томилогдохгүй — бүх багцыг зөвхөн ХАРНА. Эхлээд эрхийн төрлийг солино уу.');
async function isZahiralNow(u: string): Promise<boolean> {
  try {
    const { roleOf } = await import('./permissions');
    return roleOf(u) === 'zahiral';
  } catch {
    return false;
  }
}

/** Нэг томилгоо: нэг аккаунт, нэг шат, багцуудын жагсаалт */
export type Assign = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  stage: Stage;
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
  /**
   * ХӨНДЛӨНГИЙН ХЯНАЛТ — ХАРНА, ШИЙДВЭРЛЭХГҮЙ (2026-09-09).
   */
  viewOnly?: boolean;
  /**
   * ЭРХИЙН ТӨРЛИЙГ ЭНЭ ТОМИЛГОО АВТОМАТААР ТАВЬСАН (2026-10-23, хэрэглэгч: «бүгдийг зас»).
   */
  autoRole?: boolean;
};

const KEY = 'selbe-guitsetgel-acl-v1';
const EVENT = 'selbe-guitsetgel-acl-change';

let cache: Assign[] | null = null;

/**
 * Энэ сешнд remote томилгоо НЭГ Ч УДАА уншигдсан уу (2026-09-21).
 */
let remoteSynced = false;
/** Уншилтад ХҮЧИНТЭЙ жагсаалт — remote ачаалагдаагүй бол хоосон */
const effective = (): Assign[] => (remoteSynced ? load() : []);
/** Remote уншигдсан уу — панелийн түгжээнд (2026-09-24) */
export const flowAclReady = (): boolean => remoteSynced;

function load(): Assign[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    cache = Array.isArray(raw) ? raw.flatMap((a): Assign[] => {
      if (!a || typeof a !== 'object') return [];
      const r = a as { user?: unknown; stage?: unknown; bagts?: unknown; viewOnly?: unknown; autoRole?: unknown };
      if (typeof r.user !== 'string' || !r.user.trim() || typeof r.stage !== 'string' || !STAGES.has(r.stage)) return [];
      if (!Array.isArray(r.bagts)) return [];
      return [{
        user: r.user.trim().toLowerCase(),
        stage: r.stage as Stage,
        bagts: r.bagts.filter((b): b is string => typeof b === 'string'),
        ...(r.viewOnly === true ? { viewOnly: true as const } : {}),
        ...(r.autoRole === true ? { autoRole: true as const } : {}),
      }];
    }) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function save(list: Assign[]): void {
  cache = list;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
  }
  notify();
}

const STAGES = new Set<string>(STAGE_ORDER);

/**
 * REMOTE-ООС ИРСЭН томилгоог cache-д буулгана — `permissions.initRemote` дуудна.
 */
export function _syncRemoteAssigns(
  rows: { user: string; stage: string; bagts: string[]; viewOnly?: boolean; autoRole?: boolean }[],
): void {
  const byUser = new Map<string, Assign>();
  for (const r of rows) {
    if (!r.user || !STAGES.has(r.stage)) continue;
    const user = r.user.trim().toLowerCase();
    byUser.set(user, {
      user,
      stage: r.stage as Stage,
      bagts: (Array.isArray(r.bagts) ? r.bagts : []).filter((b) => typeof b === 'string'),
      ...(r.viewOnly === true ? { viewOnly: true as const } : {}),
      ...(r.autoRole === true ? { autoRole: true as const } : {}),
    });
  }
  const keep = new Set<string>(failed);
  for (const u of chain.keys()) keep.add(u);
  for (const [u, t] of touched) if (_newerThanSnapshot(t)) keep.add(u);
  if (keep.size) {
    const local = new Map(load().map((a) => [a.user, a] as const));
    for (const u of keep) {
      const loc = local.get(u);
      if (loc) byUser.set(u, loc); else byUser.delete(u);
    }
  }
  remoteSynced = true;
  save([...byUser.values()]);
}

export const listAssigns = (): Assign[] => effective();

/** Нэг шатны томилгоонууд — панелийн багана */
export const assignsOf = (stage: Stage): Assign[] =>
  effective().filter((a) => a.stage === stage);

/* ══════════════ Remote бичилтийн дараалал ба үр дүн ══════════════ */

/**
 * ArcGIS бичилт нь СҮҮЛД унасан хэрэглэгчид (энэ сешн). Панел мөр бүрд тэмдэг
 * тавина — урьд нь баганад нэг boolean байсан тул өөр мөрийн дараагийн амжилт
 * өмнөх мөрийн алдааг чимээгүй арчдаг байв.
 */
const failed = new Set<string>();

function markResult(u: string, ok: boolean): void {
  const before = failed.has(u);
  if (ok) failed.delete(u); else failed.add(u);
  if (before !== failed.has(u)) notify();
}

/** Remote бичилт нь унасан хэрэглэгчид — панелийн тэмдэг */
export const flowFailedUsers = (): string[] => [...failed];

/** Нэг хэрэглэгчийн remote үйлдлүүд ДАРААЛНА — remove/add/chip уралдахгүй */
const chain = new Map<string, Promise<unknown>>();
/** Хэрэглэгч бүрийн СҮҮЛИЙН локал бичилтийн агшин (`_touchSeq`) — `_syncRemoteAssigns`-д */
const touched = new Map<string, number>();

function enqueue<T>(u: string, fn: () => Promise<T>): Promise<T> {
  touched.set(u, _touchSeq());
  const prev = chain.get(u) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  chain.set(u, tail);
  void tail.then(() => {
    touched.set(u, _touchSeq());
    if (chain.get(u) === tail) chain.delete(u);
  });
  return p;
}

/**
 * Томилгоог remote руу бичих — унавал `false` (панел анхааруулга харуулна).
 */
async function pushFlow(user: string, delta?: FlowDelta): Promise<boolean> {
  try {
    const m = await import('./permsRemote');
    if (delta && !failed.has(user)) {
      const fresh = await m.flowRead(user);
      if (!fresh) return false;
      const fr = fresh.row && STAGES.has(fresh.row.stage)
        ? {
          user,
          stage: fresh.row.stage as Stage,
          bagts: fresh.row.bagts.filter((b) => typeof b === 'string'),
          ...(fresh.row.viewOnly === true ? { viewOnly: true as const } : {}),
          ...(fresh.row.autoRole === true ? { autoRole: true as const } : {}),
        }
        : null;
      if (!delta.next && fresh.row && !fr) {
        save(load().filter((x) => x.user !== user));
        return true;
      }
      const merged = mergeFlowDelta(delta.base, delta.next, fr);
      const cur = load();
      /* Байрлалыг хадгална — нэгтгэсэн мөр жагсаалтын төгсгөл рүү үсрэхгүй */
      save(merged
        ? (cur.some((x) => x.user === user) ? cur.map((x) => (x.user === user ? merged : x)) : [...cur, merged])
        : cur.filter((x) => x.user !== user));
    }
    const a = load().find((x) => x.user === user);
    return a ? m.flowUpsert(a.user, a.stage, a.bagts, a.viewOnly === true, a.autoRole === true) : m.flowRemove(user);
  } catch {
    return false;
  }
}

/** Нэг дуудлагын өмнөх/дараах локал мөр (`null` = мөр алга) — `pushFlow`-ийн нэгтгэлд */
type FlowDelta = { base: Assign | null; next: Assign | null };

/**
 * УРСГАЛЫН ТОМИЛГООНЫ ӨӨРЧЛӨЛТИЙГ ШИНЭ МӨР ДЭЭР ДАВХАРЛАНА — цэвэр (2026-10-05).
 * `base` → `next` нь ЭНЭ админы ганц өөрчлөлт; `fresh` нь remote-оос дөнгөж уншсан мөр.
 *
 *   · Хасалт (`next === null`): `fresh` ӨӨР шатанд байвал (нөгөө админ дөнгөж шилжүүлсэн)
 *     түүнийг ХЭВЭЭР үлдээнэ — `removeAssign(u, stage)` зөвхөн ТЭР шатнаас хасдаг дүрэмтэй ижил.
 *   · Шат СОЛИГДСОН / шинэ томилгоо, эсвэл `fresh` өөр шатанд: `next`-ийг БҮТНЭЭР нь —
 *     «нэг аккаунт нэг шатанд» (шат солих нь хуучин багцыг САНААТАЙ арилгадаг).
 *   · Ижил шатанд багц солих: `next − base` = нэмсэн, `base − next` = хассан → `fresh` дээр.
 *     «Бүх багц» байвал зөвхөн `[ALL_BAGTS]`. Үр дүн ХООСОН гарвал (`fresh`-д өөр багц
 *     үлдээгүй) `next`-ийн багц — хоосон мөр бичихгүй.
 *   · `viewOnly`: энэ админ ӨӨРЧИЛСӨН бол `next`-ийнх, үгүй бол `fresh`-ийнх (эрх нэмэхгүй тал).
 */
export function mergeFlowDelta(base: Assign | null, next: Assign | null, fresh: Assign | null): Assign | null {
  if (!next) return fresh && base && fresh.stage !== base.stage ? fresh : null;
  if (!fresh || fresh.stage !== next.stage || (base !== null && base.stage !== next.stage)) return next;
  const b = new Set(base?.bagts ?? []);
  const n = new Set(next.bagts);
  const out = new Set(fresh.bagts.filter((x) => !(b.has(x) && !n.has(x))));
  for (const x of next.bagts) if (!b.has(x)) out.add(x);
  const bagts = out.has(ALL_BAGTS) ? [ALL_BAGTS] : [...out];
  const voChanged = base !== null && (base.viewOnly === true) !== (next.viewOnly === true);
  const viewOnly = voChanged ? next.viewOnly === true : fresh.viewOnly === true;
  return {
    user: next.user,
    stage: next.stage,
    bagts: bagts.length ? bagts : next.bagts,
    ...(viewOnly ? { viewOnly: true as const } : {}),
    ...(next.autoRole === true ? { autoRole: true as const } : {}),
  };
}

/**
 * Аккаунт нэмэх/шинэчлэх (шатанд томилох).
 *
 * @param grant `false` бол порталын эрхийг (`grantFlowAccess`) ЭНД олгохгүй —
 *   багц солиход эрх аль хэдийн олгогдсон тул дахин бичих нь дэмий.
 * @returns `ok` — локал бичилт; `sync` — remote томилгооны амлалт (панел
 *   `false` үед «ArcGIS-т хадгалагдсангүй» анхааруулга харуулна); `granted` —
 *   эрх олголтын амлалт (тестэд хүлээнэ).
 */
export function setAssign(
  user: string, stage: Stage, bagts: string[], grant = true,
): { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: tr('Аккаунтын нэрээ бичнэ үү') };
  if (isCodeSuper(u)) {
    return { ok: false, error: tr('Админ (super) томилгооноос үл хамаарна — бүх шат, бүх багц нээлттэй') };
  }
  if (!bagts.length) return { ok: false, error: tr('Багц сонгоно уу') };
  if (roleReader?.(u) === 'zahiral') return { ok: false, error: ZAHIRAL_NO_FLOW() };

  const list = load();
  const base = list.find((a) => a.user === u) ?? null;
  const exists = list.some((a) => a.stage === stage && a.user === u);
  const cleaned = list.filter((a) => !(a.user === u && a.stage !== stage));
  const next = exists
    ? cleaned.map((a) => (a.stage === stage && a.user === u ? { ...a, bagts } : a))
    : [...cleaned, { user: u, stage, bagts }];
  save(next);

  /*
   * ЭРХИЙГ ДАГУУЛЖ ӨГНӨ — томилгоо нь ажиллах чадвартай байх ёстой.
   * Remote бичилт (`pushFlow`) ба эрх олголт нэг хэрэглэгчийн дараалалд
   * (`enqueue`) явна — өмнөх хасалтын revoke-той уралдахгүй.
   */
  const run = enqueue(u, async () => {
    if (grant && (await isTombstoned(u))) {
      save(load().filter((a) => a.user !== u));
      await pushFlow(u);
      return { ok: false, g: false };
    }
    if (!roleReader && (await isZahiralNow(u))) {
      const rest = load().filter((a) => a.user !== u);
      save(base ? [...rest, base] : rest);
      return { ok: false, g: false };
    }
    let mine = next.find((a) => a.user === u) ?? null;
    if (grant && mine) {
      const auto = await autoRoleFor(u, stage, base);
      if ((mine.autoRole === true) !== auto) {
        const row: Assign = { ...mine };
        if (auto) row.autoRole = true; else delete row.autoRole;
        save(load().map((a) => (a.user === u && a.stage === stage ? row : a)));
        mine = row;
      }
    }
    const ok = await pushFlow(u, { base, next: mine });
    const g = grant ? await grantFlowAccess(u, stage) : true;
    return { ok, g };
  });
  const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
  const granted = run.then((r) => r.g);
  return { ok: true, sync, granted };
}

/**
 * Томилгоог хасах + олгосон эрхийг БУЦААХ.
 *
 * @param revoke `false` бол олгосон эрхийг БУЦААХГҮЙ — аккаунт бүхэлдээ
 *   устгагдах гэж байгаа үед (UserAdmin-ы устгах зам) хэрэглэнэ. Эс бөгөөс
 *   энд бичих `clearOverride`/`setUser` нь дараагийн tombstone бичилттэй
 *   УРАЛДАЖ, устгагдсан хэрэглэгчийг remote дээр амилуулж болно.
 */
export function removeAssign(user: string, stage: Stage, revoke = true): { sync: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { sync: Promise.resolve(false) };
  const before = load();
  const base = before.find((a) => a.user === u) ?? null;
  const after = before.filter((a) => !(a.stage === stage && a.user === u));
  save(after);
  const sync = enqueue(u, async () => {
    // Жагсаалтад байхгүй → flowRemove; хооронд нь дахин нэмэгдсэн бол upsert
    const ok = await pushFlow(u, { base, next: after.find((a) => a.user === u) ?? null });
    /*
     *    `enqueue` нь ЗӨВХӨН энэ хөтчийн дуудлагуудыг цувуулдаг. Гэтэл шатын
     *    өөрчлөлт АЛСААС ч ирдэг: өөр админ, эсвэл `permissions.initRemote`
     *    → `_syncRemoteAssigns` (нэвтрэх үед + 5 мин тутам + visibilitychange).
     *    Тэр үед `stage` нь ЗАХИАЛСАН агшных хэвээр хөлдсөн байх тул шинэ
     *    томилгоотой болсон хүний `role`-ыг `null` болгож, `guitsetgel`
     *    харагдацыг хасдаг байв — хүн `manager` шатанд ЖИНХЭНЭ томилогдсон
     *    (`resolveFlowStage.canReview = true`) атлаа хуудсаа огт нээж чаддаггүй,
     *    панел дээр «томилогдсон» гэж харагдсаар байдаг тул админ шалтгааныг
     *    олохгүй.
     *
     *    Шийдэл: `pushFlow`-тэй ИЖИЛ дүрэм — гүйцэтгэх агшиндаа жагсаалтыг
     *    ДАХИН уншина. Хэрэглэгч ямар нэг шатанд байвал (өөр шат ч бай)
     *    түүний эрхийг нь тэр томилгоо хариуцна, энд буцааж авахгүй.
     */
    const g = revoke && !stageOfUser(u) ? await revokeFlowAccess(u, stage, base?.autoRole === true).catch(() => false) : true;
    markResult(u, ok && g);
    return ok && g;
  });
  return { sync };
}

/**
 * Аккаунтын томилгоог БҮХ шатнаас (локал + remote) арилгана — эрх буцаахгүй.
 */
export function purgeAssign(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  if (!u) return Promise.resolve(true);
  save(load().filter((a) => a.user !== u));
  return enqueue(u, async () => {
    const ok = await pushFlow(u);
    markResult(u, ok);
    return ok;
  });
}

/**
 * БИЧИЛТ УНАСАН ТОМИЛГООГ ДАХИН ИЛГЭЭХ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export function retryFlow(user: string, grant = true): { sync: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { sync: Promise.resolve(false) };
  const sync = enqueue(u, async () => {
    const ok = await pushFlow(u);
    const a = load().find((x) => x.user === u);
    const g = grant && a ? await grantFlowAccess(u, a.stage) : true;
    markResult(u, ok && g);
    return ok && g;
  });
  return { sync };
}

/**
 * ХӨНДЛӨНГИЙН ХЯНАЛТЫН тугийг асаах / унтраах (2026-09-09).
 */
export function setViewOnly(
  user: string, viewOnly: boolean,
): { ok: boolean; error?: string; sync?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: tr('Аккаунтын нэрээ бичнэ үү') };
  const list = load();
  const cur = list.find((a) => a.user === u);
  if (!cur) {
    return { ok: false, error: tr('Эхлээд шатанд томилно уу — хөндлөнгийн хяналт нь томилгоон дээр тавигдана') };
  }
  const nextRow: Assign = viewOnly
    ? { ...cur, viewOnly: true }
    : { user: cur.user, stage: cur.stage, bagts: cur.bagts, ...(cur.autoRole === true ? { autoRole: true as const } : {}) };
  save(list.map((a) => (a.user === u ? nextRow : a)));
  const sync = enqueue(u, async () => {
    const ok = await pushFlow(u, { base: cur, next: nextRow });
    markResult(u, ok);
    return ok;
  });
  return { ok: true, sync };
}

const viewsEqual = (a: ViewKey[] | 'all', b: ViewKey[] | 'all'): boolean =>
  a === 'all' || b === 'all' ? a === b : a.length === b.length && a.every((v) => b.includes(v));

/**
 * Урсгалын эрхийг олгоно: үүргийг тавьж, харагдацыг тохируулна.
 */
/** Аккаунт УСТГАГДСАН (tombstone) эсэх — `permissions.listRemoved` (хатуу super орохгүй). */
async function isTombstoned(user: string): Promise<boolean> {
  try {
    const { listRemoved } = await import('./permissions');
    return listRemoved().includes(user.trim().toLowerCase());
  } catch {
    return false;
  }
}

/**
 * `grantFlowAccess` эрхийн төрлийг АВТОМАТААР тавих/солих уу (2026-10-23, `Assign.autoRole`).
 * · super · урсгалын БУС төрөл (админы ил сонголт — хэзээ ч солигдохгүй) → `false`;
 * · төрөлгүй, эсвэл ӨӨР урсгалын төрөлтэй (шилжилтэд дагаж солигдоно) → `true`;
 * · аль хэдийн тэр шатны төрөлтэй: өмнөх мөр (ижил хүн) тугтай байсан бол `true` (өмнө нь автоматаар тавигдсан),
 *   эс бөгөөс `false` — админ төрлийг ӨМНӨ нь ил сонгосон.
 */
async function autoRoleFor(user: string, stage: Stage, prev: Assign | null): Promise<boolean> {
  try {
    if (roleForUser(user) === 'super') return false;
    const { roleOf } = await import('./permissions');
    const cur = roleOf(user);
    if (cur == null) return true;
    if (!FLOW_ROLES.has(cur)) return false;
    if (cur !== STAGE_ROLE[stage]) return true;
    return prev?.autoRole === true;
  } catch {
    return false;
  }
}

async function grantFlowAccess(user: string, stage: Stage): Promise<boolean> {
  try {
    if (await isTombstoned(user)) return false;
    if (roleForUser(user) === 'super') return true;
    const { resolveBaseAccess, roleOf, setUser } = await import('./permissions');
    const role = STAGE_ROLE[stage];
    const curRole = roleOf(user);
    const cur = resolveBaseAccess(user);
    const pureFlow = curRole == null || FLOW_ROLES.has(curRole);
    const tpl = roleAccess(role);
    /* Урсгалын БУС төрөлтэй хүнд загвар НЭМЭХГҮЙ (урьдын дүрэм) — зөвхөн «Гүйцэтгэл» */
    const tplViews: ViewKey[] | 'all' = pureFlow ? tpl.views : [];
    const views: ViewKey[] | 'all' = tplViews === 'all' || cur?.views === 'all'
      ? 'all'
      : [...new Set<ViewKey>([...(cur?.views ?? []), ...tplViews, 'guitsetgel'])];
    const docs = cur ? cur.docs : tpl.docs;
    // Урсгалын бус үүрэгтэй хүний ҮНДСЭН үүргийг нь хадгална (супер хэвээр)
    const keepRole = pureFlow ? role : curRole;
    return setUser(user, { views, docs }, keepRole);
  } catch {
    return false;
  }
}

/**
 * Урсгалын эрхийг БУЦААНА — томилгооноос хасагдсан хүнд.
 * · Устгагдсан (tombstone) аккаунт → ЮУ Ч ХИЙХГҮЙ.
 * · Хатуу УРСГАЛЫН үүрэгтэй хэрэглэгч → override-ыг арилгаж СУУРЬ эрх рүү нь буцаана.
 * · Хатуу урсгалын БУС үүрэгтэй (super/beginner/tolovlolt) → grant-тай тэгш хэмтэй:
 *   зөвхөн олгосныг (`guitsetgel`, суурьд нь байхгүй бол) хасна; админы бусад
 *   тохиргоо (нэмэлт харагдац, баримт) хэвээр. Үр дүн суурьтай ижил бол override
 *   хэрэггүй тул арилгана.
 * · Панелаас нэмсэн, зөвхөн урсгалын хүн → `guitsetgel` харагдацыг хасна
 *   (үлдсэн харагдац нь хэвээр — админ хүсвэл панелаас бүрмөсөн устгана).
 */
async function revokeFlowAccess(user: string, stage: Stage, autoRole = false): Promise<boolean> {
  const { resolveBaseAccess, roleOf, setUser, clearOverride } = await import('./permissions');
  const cur = resolveBaseAccess(user);
  if (!cur) return true;
  if (roleForUser(user) === 'super') return true;
  const base = roleForUser(user);
  if (base && FLOW_ROLES.has(base)) {
    return await clearOverride(user);
  }
  const curRole = roleOf(user);
  const keepBase: Role | null = base ?? (curRole && !FLOW_ROLES.has(curRole) ? curRole : null);
  const baseViews = keepBase ? roleAccess(keepBase).views : null;
  const keepGuits = baseViews === 'all' || (Array.isArray(baseViews) && baseViews.includes('guitsetgel'));
  const views = cur.views === 'all' || keepGuits ? cur.views : cur.views.filter((v) => v !== 'guitsetgel');
  const role = curRole === STAGE_ROLE[stage] && autoRole ? null : curRole;
  if (base) {
    const b = roleAccess(base);
    if (role === base && cur.docs === b.docs && viewsEqual(views, b.views)) {
      return await clearOverride(user);
    }
  }
  return await setUser(user, { views, docs: cur.docs }, role);
}

/**
 * «Сэргээх»-ийн ДАРАА томилгоотой хүний урсгалын эрхийг дахин олгоно (UserAdmin).
 */
export function regrantFlowAccess(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  if (!remoteSynced) return Promise.resolve(false);
  const st = stageOfUser(u);
  return st ? grantFlowAccess(u, st) : Promise.resolve(true);
}

/** Аккаунт аль шатанд томилогдсон бэ (томилогдоогүй бол `null`) */
export function stageOfUser(user?: string | null): Stage | null {
  if (!user) return null;
  const a = effective().find((x) => x.user === user.trim().toLowerCase());
  return a?.stage ?? null;
}

/**
 * ХӨНДЛӨНГИЙН ХЯНАЛТ уу — ХАРНА, ШИЙДВЭРЛЭХГҮЙ (2026-09-09).
 */
export function isViewOnly(user?: string | null): boolean {
  if (!user) return false;
  return effective().find((x) => x.user === user.trim().toLowerCase())?.viewOnly === true;
}

/**
 * Тухайн ШАТАНД хэрэглэгчийн харах/бөглөх БАГЦУУД.
 *
 * Буцаах утга:
 *   · `null`   — ХЯЗГААРГҮЙ. Зөвхөн `ALL_BAGTS` («Бүх багц») ил томилсон үед.
 *   · `[]`     — ТОМИЛОГДООГҮЙ, эсвэл багц заагаагүй. Юу ч харахгүй.
 *   · `[...]`  — заасан багцууд.
 */
export function bagtsFor(user: string | null | undefined, stage: Stage): string[] | null {
  if (!user) return [];
  const key = user.trim().toLowerCase();
  const a = effective().find((x) => x.stage === stage && x.user === key);
  if (!a) return [];
  if (a.bagts.includes(ALL_BAGTS)) return null;
  return a.bagts;
}

/**
 * БҮХ ШАТ дундах нэгдсэн багцын хамрах хүрээ.
 */
export function bagtsScope(user: string | null | undefined): string[] | null {
  if (!user) return [];
  const out = new Set<string>();
  for (const st of STAGE_ORDER) {
    const b = bagtsFor(user, st);
    if (b === null) return null; // аль нэг шатанд «бүх багц» — хязгааргүй
    b.forEach((x) => out.add(x));
  }
  return [...out];
}

/** «Гүйцэтгэлийн хяналт» хуудасны шийдвэр — хэн, аль шатанд, аль багцад */
export type FlowStage = {
  /** Идэвхтэй шат (`null` = томилогдоогүй, урсгалын үүрэггүй) */
  stage: Stage | null;
  /** Зөвшөөрөх/буцаах эрхтэй юу */
  canReview: boolean;
  /** Шатыг гараар солих сонгогч нээлттэй юу (зөвхөн админ / дев) */
  canPick: boolean;
  /** Багцын хүрээ: `null` = хязгааргүй, `[]` = нэг ч багц */
  scope: string[] | null;
  viewAll?: boolean;
};

/**
 * ХЭРЭГЛЭГЧИЙН УРСГАЛЫН ШАТ — ГАНЦ ЭХ СУРВАЛЖ (2026-08-29).
 *
 * Дүрэм:
 *   1. `super` (2026-10-21-ээс эрхийн хүснэгтийн `role:'super'` мөр · кодын тестийн super) эсвэл нэвтрэлт
 *      унтраалттай дев орчин → сонгогчоор дурын шат, БҮХ багц (админы аврах эрх). 2026-10-23: анхдагч шат =
 *      super-ийн өөрийн томилгоо (`stageOfUser`), үгүй бол инженер; өөрийгөө батлах дүрэм super-т ч үйлчилнэ
 *      (`hyanaltStore.authz`).
 *   2. Томилогдсон → тэр шат, тэр багцууд. Үүрэг нь юу ч байсан (beginner,
 *      tolovlolt, урсгалын үүрэг) — томилгоо ДАВАМГАЙЛНА.
 *   3. Томилогдоогүй → зөвхөн харна (fail-closed): урсгалын үүрэгтэй бол
 *      үүргийнхээ шатыг харуулна (толгойн нэр), багц `[]`.
 */
export function resolveFlowStage(
  user: string | null | undefined,
  role: Role | null,
  picked?: Stage | null,
  authOff = false,
): FlowStage {
  if (authOff || roleForUser(user) === 'super') {
    return { stage: picked ?? stageOfUser(user) ?? 'engineer', canReview: true, canPick: true, scope: null };
  }
  if (role === 'zahiral') {
    return { stage: picked ?? 'chief', canReview: false, canPick: false, scope: null, viewAll: true };
  }
  const st = stageOfUser(user);
  if (st) {
    const viewOnly = isViewOnly(user);
    return {
      stage: st,
      canReview: !viewOnly,
      canPick: false,
      scope: bagtsFor(user, st),
    };
  }
  const byRole = role ? ROLE_STAGE[role] ?? null : null;
  return { stage: byRole, canReview: false, canPick: false, scope: [] };
}

/** Өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribeAcl(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    if (!remoteSynced) cache = null;
    fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * ЦЭСНИЙ ТООН ТЭМДЭГ — харагдац бүрт «танд хүлээгдэж буй хэдэн зүйл байна» (2026-09-30).
 */
import type { ViewKey } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import { register } from '@/lib/dataBus';
import type { MaRow } from '@/lib/ma';
import type { MirRow } from '@/lib/mir';
import type { NavBadges } from './ViewRail';

type Counter = (username: string | null) => Promise<number | null>;

/** Модулиас нэрээр тоолуур хайна — олдохгүй бол `null` (алгасна) */
async function probe(mod: Promise<unknown>, names: string[]): Promise<Counter | null> {
  const m = (await mod) as Record<string, unknown>;
  for (const n of names) {
    const f = m[n];
    if (typeof f === 'function') return f as Counter;
  }
  return null;
}

let guitsCompany = false;
async function countReviewWithStage(username: string | null): Promise<number | null> {
  const [{ countReviewPending }, { stageOfUser }] = await Promise.all([import('@/lib/hyanaltStore'), import('@/lib/guitsetgelAcl')]);
  const n = await countReviewPending(username);
  if (n != null) guitsCompany = stageOfUser((username ?? '').trim().toLowerCase()) === 'company';
  return n;
}

const MA_BADGE_TTL_MS = 60_000;
let maMirCache: { key: string; at: number; p: Promise<[MaRows, MirRows]> } | null = null;
register(() => { maMirCache = null; }, []);
type MaRows = MaRow[];
type MirRows = MirRow[];
function maMirForBadge(key: string, loadMa: () => Promise<MaRows>, loadMir: () => Promise<MirRows>): Promise<[MaRows, MirRows]> {
  const c = maMirCache;
  if (c && c.key === key && Date.now() - c.at < MA_BADGE_TTL_MS) return c.p;
  const p = Promise.all([loadMa(), loadMir()]);
  const slot = { key, at: Date.now(), p };
  maMirCache = slot;
  p.catch(() => { if (maMirCache === slot) maMirCache = null; });
  return p;
}

async function countMaPending(username: string | null): Promise<number | null> {
  const me = (username ?? '').trim().toLowerCase();
  if (!me) return null;
  const [{ hasCap }, { entSession }, { AUTH }] = await Promise.all([
    import('@/lib/caps'), import('@/lib/entDocs'), import('@/lib/services'),
  ]);
  if (!hasCap(me, 'chanarReview')) return 0;
  const sess = entSession();
  if (!sess) return null;
  const [ma, mir, fm, acl, { PKGS }] = await Promise.all([
    import('@/lib/ma'), import('@/lib/mir'), import('@/lib/ficMakt'), import('@/lib/chanarAcl'), import('@/modules/sheet/bagts.pkg'),
  ]);
  const [[mas, mirs], fms] = await Promise.all([maMirForBadge(`${me}|${sess.user}`, ma.loadMa, mir.loadMir), fm.loadFm()]);
  if (!fms.length) return 0;
  const mirBy = mir.mirsByMa(mirs);
  const fmBy = fm.fmByMa(fms);
  let n = 0;
  for (const m of ma.latestPerRespNo(mas)) {
    const docs = m.respNo ? fmBy.get(m.respNo) : undefined;
    if (!docs) continue;
    const bagts = PKGS.find((p) => p.key === m.pkg)?.group;
    if (!bagts) continue;
    if (AUTH.appId && acl.reviewerRolesFor(me, bagts).length === 0) continue;
    const chain = ma.chainOf(m.verdict, {
      MIR: mir.mirVerdictFor(mirBy.get(m.respNo)),
      FIC: fm.fmVerdictFor(docs.FIC),
      MAKT: fm.fmVerdictFor(docs.MAKT),
    });
    for (const kind of ['FIC', 'MAKT'] as const) {
      const st = chain.find((x) => x.key === kind);
      if (!st || st.state === 'locked') continue;
      n += docs[kind].filter((d) => d.status === 'pending' && !fm.isOwnUpload(d.uploadedBy, me, sess.user)).length;
    }
  }
  return n;
}

/**
 * Харагдац → тоолуур(ууд). Нэг харагдацад хэд хэдэн эх сурвалж байвал НИЙЛБЭР.
 */
const SOURCES: { view: ViewKey; part?: 'obyem' | 'review'; load: () => Promise<Counter | null> }[] = [
  /* ✅ `src/lib/ajilBatlah.ts` — шийдвэрлэх боломжтой нэмэлт ажлын илгээлт */
  { view: 'ajilBatlah', load: () => probe(import('@/lib/ajilBatlah'), ['countAjilPending']) },
  /* ✅ `src/lib/huvaariBatlah.ts` — өөр батлагчийн түгжсэнийг тоолохгүй */
  { view: 'huvaariBatlah', load: () => probe(import('@/lib/huvaariBatlah'), ['countPlanPending']) },
  /* ✅ 2026-10-08: `countPlanReturned` — ЗОХИОГЧИД буцаагдсан, дахин илгээгээгүй илгээлт
     («Хуваарь» харагдац; `ViewRail.BADGE_LABEL` нь «буцаагдсан N» гэж уншина). */
  /* ✅ 2026-10-09: `countPlanApproved` — ЗОХИОГЧИД саяхан (3 хоног) батлагдсан, «Хуваарь» хуудсанд хараагүй
     илгээлт; буцаагдсантай НИЙЛБЭР («Хуваарь» харагдац — `ViewRail.badgeLabel` «шинэ шийдвэр» гэж уншина). */
  { view: 'huvaari', load: async () => countPlanNews },
  /* ✅ `countObyemPending(username)` — `src/lib/obyemBatlah.ts`.
     Обьёмыг «Гүйцэтгэл» (бөглөх хуудас) дотор батладаг тул тэр харагдацад. */
  { view: 'guitsetgel', part: 'obyem', load: () => probe(import('@/lib/obyemBatlah'), ['countObyemPending']) },
  /* ✅ 2026-10-04: `hyanaltStore.countReviewPending` — таны шатанд хүлээгдэж буй
     гүйцэтгэлийн хяналт (дээрх обьёмтой НИЙЛБЭР, нэг харагдац). */
  { view: 'guitsetgel', part: 'review', load: async () => countReviewWithStage },
  { view: 'ma', load: async () => countMaPending },

];

/**
 * Хүрээнд байгаа харагдацуудын тэмдгийг ачаална.
 */
export async function loadNavBadges(username: string | null, scope: 'all' | ViewKey[]): Promise<NavBadges> {
  const inScope = (k: ViewKey) => scope === 'all' || scope.includes(k);
  const srcs = SOURCES.filter((src) => inScope(src.view));
  const results = await Promise.allSettled(
    srcs.map(async (src): Promise<number | 'skip' | null> => {
      const f = await src.load();
      if (!f) return 'skip';
      const n = await f(username);
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    }),
  );
  const out: NavBadges = {};
  const failed = new Set<ViewKey>();
  const parts: Partial<Record<ViewKey, Partial<Record<'obyem' | 'review', number>>>> = {};
  results.forEach((r, i) => {
    const view = srcs[i].view;
    if (r.status !== 'fulfilled' || r.value === null) { failed.add(view); return; }
    if (r.value === 'skip') return;
    out[view] = (out[view] ?? 0) + r.value;
    const part = srcs[i].part;
    if (part) (parts[view] ??= {})[part] = r.value;
  });
  for (const v of failed) out[v] = null;
  for (const v of Object.keys(parts) as ViewKey[]) if (!failed.has(v)) PARTS[v] = parts[v];
  return out;
}

const PARTS: Partial<Record<ViewKey, Partial<Record<'obyem' | 'review', number>>>> = {};

export function badgeLabelFor(view: ViewKey, n: number, fmt: (x: number) => string = String): string | null {
  if (!n) return null;
  if (view === 'guitsetgel') {
    const p = PARTS.guitsetgel ?? {};
    const ob = p.obyem ?? 0;
    const rv = p.review ?? 0;
    if (guitsCompany && ob === 0) return tr('Буцаасан {0} — засах', fmt(n));
    if (ob > 0 && rv > 0) return tr('{0} хүлээгдэж байна (хяналт {1} · обьём {2})', fmt(n), fmt(rv), fmt(ob));
    if (ob > 0) return tr('Обьём батлах {0}', fmt(n));
    return null;
  }
  if (view === 'ma') return tr('Таны шийдвэр хүлээж буй {0}', fmt(n));
  return null;
}

/**
 * Шинэ тэмдгийг өмнөхтэй НИЙЛҮҮЛНЭ — `null` (эх сурвалж унасан) харагдацад өмнөх ТОО хэвээр,
 * өмнө нь тоо байгаагүй бол `null` (тэмдэггүй). Хүрээнээс гарсан харагдац (шинэд түлхүүргүй)
 * хасагдана. 2026-10-06: `Portal`-ын «Алдаа чимээгүй — өмнөх тоо хэвээр» дүрмийн биелэлт.
 */
export function mergeNavBadges(prev: NavBadges, next: NavBadges): NavBadges {
  const out: NavBadges = { ...next };
  for (const k of Object.keys(next) as ViewKey[]) {
    if (next[k] !== null) continue;
    const p = prev[k];
    out[k] = typeof p === 'number' ? p : null;
  }
  return out;
}

/**
 * ЗӨВХӨН ХАМГИЙН СҮҮЛИЙН дуудлагын хариуг хэрэглэх ачаалагч.
 */
export function makeBadgeRefresher(
  load: (username: string | null, scope: 'all' | ViewKey[]) => Promise<NavBadges> = loadNavBadges,
): (username: string | null, scope: 'all' | ViewKey[]) => Promise<NavBadges | null> {
  let seq = 0;
  return async (username, scope) => {
    const my = ++seq;
    let b: NavBadges;
    try {
      b = await load(username, scope);
    } catch {
      return null;
    }
    return my === seq ? b : null;
  };
}

/** Тэмдэгтэй харагдацууд — эдгээрээс гарахад тоог шууд шинэчилнэ */
export const BADGE_VIEWS: ReadonlySet<ViewKey> = new Set(SOURCES.map((x) => x.view));

/* ══ 2026-10-12 (аудит №8): «ХУВААРЬ»-ИЙН «ШИНЭ ШИЙДВЭР» — багц бүрээр · «харсан» тэмдэг ══ */
/**
 * БУЦААГДСАН шийдвэрийг «Хуваарь» хуудсанд харсан (`Huvaari` — `lastDecision` нь буцаагдсан, зохиогч нь би).
 */
const RETURNED_SEEN_KEY = 'selbe-huvaari-returned-seen';
const APPROVED_SEEN_KEY = 'selbe-huvaari-approved-seen';
function seenSet(key: string): Set<number> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : []);
  } catch { return new Set(); }
}
/** Зохиогч буцаагдсан илгээлтийг «Хуваарь» хуудсанд харсныг тэмдэглэнэ */
export function markPlanReturnedSeen(oid: number): void {
  try {
    const s = seenSet(RETURNED_SEEN_KEY);
    if (s.has(oid)) return;
    s.add(oid);
    localStorage.setItem(RETURNED_SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch { /* хаалттай орчин */ }
}
/** Нэг «шинэ шийдвэр» — багц · төрөл · илгээлт · шийдвэр */
export type PlanNews = { pkgKey: string; kind: 'plan' | 'geree' | null; oid: number; status: 'returned' | 'approved' };
/**
 * ЗОХИОГЧИЙН ШИНЭ ШИЙДВЭРҮҮД (багц бүрээр) — `Huvaari`-ийн багц сонгогчийн цэг · үсрэх товч, цэсний тэмдэг.
 */
export async function loadPlanNews(username: string | null): Promise<PlanNews[] | null> {
  try {
    const m = await import('@/lib/huvaariBatlah');
    const [nR, nA] = await Promise.all([m.countPlanReturned(username), m.countPlanApproved(username)]);
    if (nR == null || nA == null) return null;
    if (!nR && !nA) return [];
    const me = (username ?? '').trim().toLowerCase();
    const [{ huvaariScope }, { AUTH }] = await Promise.all([import('@/lib/huvaariAcl'), import('@/lib/services')]);
    const sc = AUTH.appId ? huvaariScope(me, 'author') : null;
    const rows = await m.loadLastPerPkg();
    const rSeen = seenSet(RETURNED_SEEN_KEY);
    const aSeen = seenSet(APPROVED_SEEN_KEY);
    const now = Date.now();
    const out: PlanNews[] = [];
    for (const x of rows) {
      if (x.author.trim().toLowerCase() !== me || (sc != null && !sc.includes(x.pkgGroup))) continue;
      const kind = x.kind ?? null;
      if (nR > 0 && x.status === m.PLAN_STATUS.returned && !rSeen.has(x.oid)) {
        out.push({ pkgKey: x.pkgKey, kind, oid: x.oid, status: 'returned' });
      } else if (nA > 0 && x.status === m.PLAN_STATUS.approved && x.approverAt != null
        && now - x.approverAt < m.PLAN_APPROVED_TTL && !aSeen.has(x.oid)) {
        out.push({ pkgKey: x.pkgKey, kind, oid: x.oid, status: 'approved' });
      }
    }
    return out;
  } catch {
    return null;
  }
}
/** «Хуваарь» цэсний тэмдэг — `loadPlanNews`-ийн тоо (дээрх SOURCES) */
async function countPlanNews(username: string | null): Promise<number | null> {
  const xs = await loadPlanNews(username);
  return xs == null ? null : xs.length;
}

/* ══ 2026-09-30 (кэшийн ажлын урсгал — ЗӨВХӨН энэ блок): чанарын тэмдгийг ACL ирэхэд дахин тоолох ══ */
/**
 * ТЭМДЭГ ДАХИН ТООЛОХ ДОХИО — `Portal` `refreshBadges`-ээ өгнө, тайлах функц буцаана.
 */
export function subscribeNavBadges(_cb: () => void): () => void {
  return () => {};
}

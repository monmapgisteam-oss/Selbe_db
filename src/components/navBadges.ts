/**
 * ЦЭСНИЙ ТООН ТЭМДЭГ — харагдац бүрт «танд хүлээгдэж буй хэдэн зүйл байна» (2026-09-30).
 *
 * ⚠️ ЯАГААД: батлагч «Нэмэлт ажил батлах», «Хуваарь батлах» зэрэг хуудсыг
 *    өөрөө нээж шалгахаас өөр мэдэх замгүй байв — хүлээгдэж буй санал
 *    өдөр хоногоор гацдаг. Цэсэнд тоо гарвал нээх шаардлагагүйгээр харна.
 *
 * ⚠️ ТООЛУУР НЬ LIB-ИЙН ФУНКЦ — энд зөвхөн холбоос. Дүрэм (хэн юуг батлах
 *    эрхтэй, өөрийн илгээлтийг тоолохгүй г.м.) тэр функц дотор, батлах
 *    хуудастай НЭГ эх сурвалжаас.
 *
 * ⚠️ `null` ≠ 0: тоолуур «мэдэхгүй» (`null`) буцаавал ЭСВЭЛ шидвэл тэмдэг
 *    ГАРАХГҮЙ (чимээгүй) — худал «0» ч, айдас төрүүлэх алдаа ч харуулахгүй.
 *    ⚠️ 2026-10-06: өмнө нь ТОО байсан бол тэр нь хэвээр үлдэнэ (`mergeNavBadges`).
 *
 * ⚠️ DYNAMIC import — тоолуурын модулиуд (ArcGIS хүсэлт, ACL) порталын
 *    үндсэн chunk-д орохгүй; анх нэвтэрсний ДАРАА л татагдана.
 *
 * ⚠️ ЗАРИМ ТООЛУУР ХАРААХАН БАЙХГҮЙ (өөр ажлын урсгалд нэмэгдэж байгаа).
 *    `probe` нь модулийн экспортыг НЭРЭЭР хайдаг тул функц нэмэгдмэгц энэ
 *    файлыг засахгүйгээр ажиллаж эхэлнэ; байхгүй бол тэр мөрийг алгасна.
 */
import type { ViewKey } from '@/lib/services';
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

/**
 * Харагдац → тоолуур(ууд). Нэг харагдацад хэд хэдэн эх сурвалж байвал НИЙЛБЭР.
 */
const SOURCES: { view: ViewKey; load: () => Promise<Counter | null> }[] = [
  /* ✅ `src/lib/ajilBatlah.ts` — шийдвэрлэх боломжтой нэмэлт ажлын илгээлт */
  { view: 'ajilBatlah', load: () => probe(import('@/lib/ajilBatlah'), ['countAjilPending']) },
  /* ✅ `src/lib/huvaariBatlah.ts` — өөр батлагчийн түгжсэнийг тоолохгүй */
  { view: 'huvaariBatlah', load: () => probe(import('@/lib/huvaariBatlah'), ['countPlanPending']) },
  /* ✅ 2026-10-08: `countPlanReturned` — ЗОХИОГЧИД буцаагдсан, дахин илгээгээгүй илгээлт
     («Хуваарь» харагдац; `ViewRail.BADGE_LABEL` нь «буцаагдсан N» гэж уншина). */
  /* ✅ 2026-10-09: `countPlanApproved` — ЗОХИОГЧИД саяхан (3 хоног) батлагдсан, «Хуваарь» хуудсанд хараагүй
     илгээлт; буцаагдсантай НИЙЛБЭР («Хуваарь» харагдац — `ViewRail.badgeLabel` «шинэ шийдвэр» гэж уншина). */
  /* ⚠️ 2026-10-12 (аудит №8): хоёуланг НЭГ тоолуур (`countPlanNews` → `loadPlanNews`) — буцаагдсан шийдвэрийг ч «Хуваарь»
     хуудсанд ХАРСНЫ дараа тоолохгүй (`markPlanReturnedSeen`). Урьд нь шошго «шинэ шийдвэр» атлаа буцаалт дахин илгээх
     хүртэл тоологддог байв (зан ба шошго зөрнө). Дүрэм (эрх · хүрээ · 3 хоног) lib-ийн `countPlanReturned`/
     `countPlanApproved`-оос — энд зөвхөн «харсан»-ыг хасна. */
  { view: 'huvaari', load: async () => countPlanNews },
  /* ✅ `countObyemPending(username)` — `src/lib/obyemBatlah.ts`.
     Обьёмыг «Гүйцэтгэл» (бөглөх хуудас) дотор батладаг тул тэр харагдацад. */
  { view: 'guitsetgel', load: () => probe(import('@/lib/obyemBatlah'), ['countObyemPending']) },
  /* ✅ 2026-10-04: `hyanaltStore.countReviewPending` — таны шатанд хүлээгдэж буй
     гүйцэтгэлийн хяналт (дээрх обьёмтой НИЙЛБЭР, нэг харагдац). */
  { view: 'guitsetgel', load: () => probe(import('@/lib/hyanaltStore'), ['countReviewPending']) },
  /* ✅ `chanarStore.countChanarActionable` — чанарын баримтын «таны ээлж».
     ⚠️ ACL ачаалагдахаас өмнө бага тоолно — 3 минут тутмын шинэчлэлт засна. */
  {
    view: 'chanar',
    load: async () =>
      (await probe(import('@/lib/chanarStore'), ['countChanarActionable', 'countChanarPending', 'countActionable']))
      ?? probe(import('@/lib/chanarMs'), ['countChanarActionable', 'countChanarPending', 'countActionable']),
  },
];

/**
 * Хүрээнд байгаа харагдацуудын тэмдгийг ачаална.
 * ⚠️ Алдаа ЧИМЭЭГҮЙ — тэмдэг бол туслах мэдээлэл, порталын ажилд саад болохгүй.
 */
/**
 * ⚠️ 2026-10-06 (аудит): УНАСАН эх сурвалжтай харагдац `null` («мэдэхгүй») болно — урьд нь
 *    уналт ЧИМЭЭГҮЙ хаягдаж, нийлбэр харагдацын («Гүйцэтгэл» = обьём + хяналт) тэмдэг нэг
 *    эх сурвалжийн ХАГАС дүнг бүтэн мэт харуулдаг байв. Нэг эх сурвалж унахад тэр харагдацын
 *    нийлбэр БҮХЭЛДЭЭ `null` — `mergeNavBadges` өмнөх тоог үлдээнэ.
 * ⚠️ Тоолуур модульд ХАРААХАН байхгүй (`probe` → `null`) нь уналт БИШ — алгасна (толгойн ⚠️).
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
  results.forEach((r, i) => {
    const view = srcs[i].view;
    if (r.status !== 'fulfilled' || r.value === null) { failed.add(view); return; }
    if (r.value === 'skip') return;
    out[view] = (out[view] ?? 0) + r.value;
  });
  for (const v of failed) out[v] = null;
  return out;
}

/**
 * Шинэ тэмдгийг өмнөхтэй НИЙЛҮҮЛНЭ — `null` (эх сурвалж унасан) харагдацад өмнөх ТОО хэвээр,
 * өмнө нь тоо байгаагүй бол `null` (тэмдэггүй). Хүрээнээс гарсан харагдац (шинэд түлхүүргүй)
 * хасагдана. ⚠️ 2026-10-06: `Portal`-ын «Алдаа чимээгүй — өмнөх тоо хэвээр» дүрмийн биелэлт.
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
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): тэмдгийг 3 мин тутам · харагдацаас
 *    гарахад · ACL ирэхэд · бичилт бүрийн дараа (`dataBus`) — олон эх үүсвэрээс
 *    ЗЭРЭГ эхлүүлдэг. Хариунууд ДАРААЛАЛГҮЙ ирдэг тул бичилтийн ӨМНӨХ удаан хариу
 *    сүүлд ирвэл шинэ тоог ХУУЧИН тоогоор дарж, тэмдэг дараагийн 3 минут хүртэл
 *    худал үлддэг байв (эсвэл хэрэглэгч солигдоход өмнөх хүний тоо гарна).
 *    Дуудлага бүр дугаар авна; хариу ирэхэд илүү шинэ дуудлага эхэлсэн бол `null`
 *    (хэрэглэхгүй). Алдаа ч мөн `null` — тэмдэг чимээгүй, өмнөх тоо хэвээр.
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

/* ══ ⚠️ 2026-10-12 (аудит №8): «ХУВААРЬ»-ИЙН «ШИНЭ ШИЙДВЭР» — багц бүрээр · «харсан» тэмдэг ══ */
/**
 * БУЦААГДСАН шийдвэрийг «Хуваарь» хуудсанд харсан (`Huvaari` — `lastDecision` нь буцаагдсан, зохиогч нь би).
 * ⚠️ ЭНЭ ХӨТЧИЙН localStorage — `huvaariBatlah.markPlanApprovedSeen`-ийн ижил загвар (өөр төхөөрөмжид дахин «шинэ»).
 *    Сүүлийн 200 л хадгална. Хаалттай орчинд чимээгүй (тэмдэг «шинэ» хэвээр — аюулгүй тал).
 */
const RETURNED_SEEN_KEY = 'selbe-huvaari-returned-seen';
/**
 * ⚠️ `huvaariBatlah.APPROVED_SEEN_KEY`-тэй ҮСЭГ ҮСГЭЭРЭЭ ИЖИЛ (lib экспортлодоггүй) — энд ЗӨВХӨН УНШИНА (`countPlanApproved`-ийн
 *    «хараагүй» шүүлттэй ижил жагсаалт гаргахад). Бичих нь `markPlanApprovedSeen`-д л.
 */
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
 * ⚠️ ЭРХ · ХҮРЭЭ · 3 ХОНОГ — lib-ийн `countPlanReturned`/`countPlanApproved` (НЭГ эх сурвалж): аль нэг нь `null` бол `null`
 *    («мэдэхгүй», null ≠ 0 — тэмдэг өмнөх тоогоо үлдээнэ); хоёулаа 0 бол хүсэлтгүйгээр `[]`. Үгүй бол багцын сүүлийн
 *    илгээлтүүдийг (`loadLastPerPkg`, толгой л) нэг удаа уншиж, «харсан»-ыг хасна.
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
/** «Хуваарь» цэсний тэмдэг — `loadPlanNews`-ийн тоо (дээрх SOURCES-ийн ⚠️) */
async function countPlanNews(username: string | null): Promise<number | null> {
  const xs = await loadPlanNews(username);
  return xs == null ? null : xs.length;
}

/* ══ ⚠️ 2026-09-30 (кэшийн ажлын урсгал — ЗӨВХӨН энэ блок): чанарын тэмдгийг ACL ирэхэд дахин тоолох ══ */
/**
 * ТЭМДЭГ ДАХИН ТООЛОХ ДОХИО. `countChanarActionable` нь ACL ачаалагдахаас ӨМНӨ бага
 * тоолдог байв (дээрх SOURCES-ийн ⚠️); одоо (1) тоолуур өөрөө ACL-ийг хязгаартай
 * хүлээнэ (`chanarStore.whenChanarAclReady`), (2) энэ дохио ACL өөрчлөгдөх бүрд
 * (`chanarStore.subscribeChanarActionable`) `cb`-г дуудна — `Portal` `refreshBadges`-ээ
 * өгнө. Тайлах функц буцаана. ⚠️ Модуль ДИНАМИКААР — толгойн ⚠️-ийн адил үндсэн
 * chunk-д орохгүй; тайлагдсаны дараа ирсэн бүртгэл шууд тайлагдана.
 */
export function subscribeNavBadges(cb: () => void): () => void {
  let alive = true;
  let off: (() => void) | null = null;
  import('@/lib/chanarStore').then(
    (m) => { if (alive) off = m.subscribeChanarActionable(cb); else off = null; },
    () => { /* чимээгүй — тэмдэг бол туслах мэдээлэл */ },
  );
  return () => { alive = false; off?.(); off = null; };
}

/**
 * БӨГЛӨХ ХУУДАСНЫ МӨРИЙН ХУВААЛЦСАН УНШИЛТ — CEO самбарын уншигчид (обьёмын зөрүү · QAQC-ийн мод · оноон самбар).
 *
 * ⚠️ 2026-10-21 (гүйцэтгэлийн аудит): `loadVarianceKpi` (24 багц, багц бүрд 5 алхамт `loadRows`: мета · max огноо ·
 *    тоо · мөр · лавлах — 122 хүсэлт / 11.5 МБ) ба `loadQaqcKpi` → `loadScoreQual` (10 багц, ижил алхам, 4 баганаар)
 *    нэг сешнд ИЖИЛ жаазыг тус тусдаа татдаг байв (хэмжилт: хоёулаа зэрэг 165 хүсэлт / 17.2 МБ). Одоо багц тутамд
 *    НЭГ уншилт; 5 мин TTL, `BAGTS_SHEET` бичилтээр хаягдана (`live.cached`-ийн дүрэм — багцаар түлхүүрлэсэн тул гараар
 *    бичсэн кэш, `register`-тэй).
 * ⚠️ ХОЁР ТӨРӨЛ (`SheetKind`), `'tree'` ⊂ `'variance'`: Нүүр (`CeoScorecard` → `loadScoreQual`) зөвхөн QAQC-ийн модыг
 *    уншдаг тул үргэлж баганын нэгдлээр татвал Нүүрний нээлт бүрд +4.7 МБ (хэмжсэн) дэмий ирэх байв. Тиймээс дуудагч
 *    ТӨРЛӨӨ хэлнэ: кэшид дээд зэргийн (`variance`) уншилт байвал доод (`tree`) дуудагчид хүрэлцэнэ; доод зэргийн уншилт
 *    хараахан ЯВААГҮЙ (битүүмжлэгдээгүй — `fillSchema`-г хүлээж буй) бол төрлийг нь өргөжүүлж НЭГ татлага хуваалцана
 *    (CEO самбарт зөрүү · QAQC зэрэг эхэлж ижил `fillSchema`-г хүлээдэг — `decide`). Явсан бол шинэ татлага (хуучин зан).
 * ⚠️ ҮР ДҮН: `loadRows` `fields`-д байхгүй баганыг `null`, байгааг нь уншдаг; жаазыг сонгох (`latestWhere` ·
 *    `lastFrame` · лавлах) `fields`-ээс хамаардаггүй. `gun` одоо зөрүүнд ч ирнэ (мод ⊂ зөрүү) — `gun` ДҮҮРСЭН хуудсанд
 *    (Багц 3.3 — 2026-10-21-ний хэмжилт) гүн `TREES` биш мөрөөс (`loadRows`-ийн 1-р эх, бөглөх хуудас · QAQC · муруй
 *    яг энэ замаар) гарна: урьд нь зөрүү `gun`-гүй татаж `TREES` зэрэгцүүлэлтэд унадаг (1460 ≠ 1459, «1 багц
 *    уншигдаагүй») байсан тул тэр багцын хэтрэлт КАРТАД ОРДОГГҮЙ байв — одоо орно (3.24 → 5.63 тэрбум ₮, 177 → 244 ажил).
 *    Урьд нь уншигддаг байсан багцуудын мөр ЯГ ижил (хэмжсэн).
 * ⚠️ Бүдүүвч нь `fillSchema` — зөрүүний 2026-10-09-ний шийдвэр (блокгүй багц `obyem_sum`-аар хэмжигдэнэ); блоктой
 *    багцад `loadSchema(pkg)`-тэй ЯГ ижил, QAQC-ийн 10 багц бүгд блоктой.
 * ⚠️ УНАЛТ КЭШЛЭГДЭХГҮЙ (дараагийн дуудагч дахин оролдоно); явж буй уншилтыг зэрэг дуудагчид хуваалцана.
 * ⚠️ `rows` массив ХУВААЛЦАГДАНА — уншигчид өөрчлөхгүй (зөрүү зөвхөн уншина; `attachTree` шинэ массив үүсгэнэ).
 * ⚠️ React импортлохгүй — `sheetShared.check.mjs` Node дээр ачаална.
 */
import { fillSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { register } from './dataBus';
import { SESSION_TTL_MS } from './live';

/** Уншилтын төрөл — `'tree'` (QAQC-ийн мод: 4 багана) ⊂ `'variance'` (зөрүү: + обьём · нэгж · огноо · блокийн обьём) */
export type SheetKind = 'tree' | 'variance';
const RANK: Record<SheetKind, number> = { tree: 0, variance: 1 };

/**
 * Төрөл бүрийн баганууд (цэвэр функц — `sheetShared.check` тулгана):
 *   · `tree` (`ceo/qaqc.loadTreeRows`): `oid` (эрэмбэ) · `no` (жаазны заагч) · `work` (зэрэгцүүлэлт) · `gun` (гүн);
 *   · `variance` (`execTriage.loadVariance`, 2026-08-21): дээрх + `vol` · `unit` · `asOf` · `fillDate` · `obyem[]`.
 * ⚠️ Байхгүй талбар (`null`/`undefined`) ОРОХГҮЙ — `outFields`-д байхгүй багана оруулбал query бүхэлдээ унана.
 */
export const sharedFields = (sc: Schema, kind: SheetKind): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun,
  ...(kind === 'variance' ? [sc.f.vol, sc.f.unit, sc.f.asOf, sc.f.fillDate, ...sc.obyem] : []),
].filter((x): x is string => !!x))];

/** Явж буй/дууссан уншилтын төрөл ба битүүмжлэл (`loadRows` руу орсон эсэх) */
export type Pending = { kind: SheetKind; sealed: boolean };

/**
 * Кэшийн шийдвэр (цэвэр): `reuse` — байгаа уншилт хүрэлцэнэ; `upgrade` — хараахан яваагүй уншилтын төрлийг өргөжүүлж
 * хуваалцана; `new` — шинэ татлага.
 */
export const decide = (hit: Pending | null, kind: SheetKind): 'reuse' | 'upgrade' | 'new' => {
  if (!hit) return 'new';
  if (RANK[hit.kind] >= RANK[kind]) return 'reuse';
  return hit.sealed ? 'new' : 'upgrade';
};

export type SharedSheet = { sc: Schema; rows: SheetRow[] };

type Entry = { p: Promise<SharedSheet>; at: number; want: Pending };
const sheetCache = new Map<string, Entry>();
register(() => { sheetCache.clear(); }, ['BAGTS_SHEET']);

/** Багцын сүүлийн жааз — сешнд нэг уншилт (`pkg.key`-ээр). Шиднэ (уншигч өөрөө `allSettled`/`catch`-аар шийднэ). */
export function loadSheetShared(pkg: Pkg, kind: SheetKind): Promise<SharedSheet> {
  const hit = sheetCache.get(pkg.key);
  const live = hit && Date.now() - hit.at <= SESSION_TTL_MS ? hit : null;
  const d = decide(live?.want ?? null, kind);
  if (live && d === 'reuse') return live.p;
  if (live && d === 'upgrade') { live.want.kind = kind; return live.p; }
  const want: Pending = { kind, sealed: false };
  const p = (async (): Promise<SharedSheet> => {
    const sc = await fillSchema(pkg);
    /* ⚠️ Нэг microtask хүлээнэ: ижил `fillSchema`-г хүлээсэн нөгөө уншигч (CeoBoard: зөрүү + QAQC зэрэг) яг энэ мөчид
       ирж төрлөө өргөжүүлдэг (`upgrade`) — дараа нь л битүүмжилж татна. */
    await Promise.resolve();
    want.sealed = true;
    /* ⚠️ 2026-10-22 (гүйцэтгэлийн аудит): `persist` — хуудас өөрчлөгдөөгүй бол (НЭГ тандалт) хөтчийн кэшээс
       (`sheetCache`); зөрүүний 24 хуудас (10.7 МБ) нээлт бүрд дахин татагдахгүй. */
    const { rows } = await loadRows(pkg, sc, undefined, sharedFields(sc, want.kind), { persist: true });
    return { sc, rows };
  })();
  const entry: Entry = { p, at: Date.now(), want };
  sheetCache.set(pkg.key, entry);
  /* ⚠️ Уналт нь ЗӨВХӨН өөрөө идэвхтэй байхад л кэшийг цэвэрлэнэ (`live.cached`-ийн 2026-09-08-ны дүрэм) */
  p.catch(() => { if (sheetCache.get(pkg.key) === entry) sheetCache.delete(pkg.key); });
  return p;
}

/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» → ХЯНАЛТАД АВТОМАТААР ОРУУЛАХ ГҮҮР.
 *
 * Компани хуудсаа бөглөж «Нийтлэх» дармагц ЭНД нэг хяналтын бүртгэл үүснэ.
 * Тэр агшнаас эхлэн ажил талбайн инженерийн дараалалд орно.
 */

import { BUILDING } from './services';
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/authToken';
import { addRows, addedOid, deleteRow, ensureUniqueId, queryAll, F, HYANALT, OWNER, STATUS, type Attrs, type Row, type Status } from './hyanalt';
import { serverNow, syncServerClock } from './serverClock';
import { groupWorks } from './hyanaltGroup';

/* ── Багц → гүйцэтгэгч компани ── */

let COMPANY: Map<string, string> | null = null;

const norm = (s: string) => s.replace(/[\s-]/g, '').replace(/\./g, '').toLowerCase();

async function companyOf(bagts: string): Promise<string> {
  if (!COMPANY) {
    let ok = false;
    const map = new Map<string, string>();
    try {
      const j = (await arcgisPost(`${BUILDING.url}/query`, {
        where: '1=1',
        groupByFieldsForStatistics: `${BUILDING.fields.bagts},${BUILDING.fields.contractor}`,
        outStatistics: JSON.stringify([
          { statisticType: 'count', onStatisticField: BUILDING.oid, outStatisticFieldName: 'n' },
        ]),
      })) as { features?: { attributes: Attrs }[] };
      for (const f of j.features ?? []) {
        const k = norm(String(f.attributes[BUILDING.fields.bagts] ?? ''));
        const v = String(f.attributes[BUILDING.fields.contractor] ?? '').trim();
        if (k && v && !map.has(k)) map.set(k, v);
      }
      ok = true;
    } catch {
      /* сүлжээ унасан — кэшлэхгүй, дараагийн удаа дахин оролдоно */
    }
    if (!ok) return '';
    COMPANY = map;
  }
  return COMPANY.get(norm(bagts)) ?? '';
}

/* ── Бүртгэлийн дугаар ── */

const nextId = (rows: Attrs[]) => {
  const max = rows.reduce((m, r) => {
    const n = Number(String(r[F.id] ?? '').replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `G-${String(max + 1).padStart(6, '0')}`;
};

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
};

/**
 * ЭНЭ ӨДРИЙН ИЛГЭЭЛТЭД АЛЬ ХЭДИЙН НЭЭЛТТЭЙ ХЯНАЛТЫН БҮРТГЭЛ БАЙНА УУ?
 *
 * Байвал ШИНЭ мөр үүсгэхгүй — тэр бүртгэлээр нь үргэлжилнэ (`saveSubmission`
 * илгээлтийн мөрийг update хийсэн тул хянагч шинэ агуулгыг тэндээс харна).
 *
 *    1. `Эх_мөрийн_дугаар === sheetOid` — илгээлтийн мөрийн OBJECTID нь
 *       хянагчийн агуулга олох ганц зам.
 *    2. `Шилжүүлсэн` БИШ — мөчлөг дууссан бол шинэ бүртгэл үүсэх нь зөв.
 *    3.  ХЯНАГЧИЙН ГАР ДЭЭР байх (`OWNER[төлөв] !== 'company'`).
 *       2026-09-07-ны шалгалтын CRITICAL олдвор: буцаагдсан гурван төлөв
 *       (`Инженер буцаасан` · `Менежер буцаасан` · `Төлөвлөлтийн ахлах инженер буцаасан`)
 *       ч `Шилжүүлсэн` биш тул гүйцэтгэгч засвараа илгээхэд ШИНЭ тойрог
 *       ҮҮСЭХГҮЙ, ажил МӨНХӨД гацах байлаа.
 *    4. `Ажлын_нэр` нь ӨДРӨӨР эхлэх — `closeSubmission` хоёр удаа унасан
 *       ховор тохиолдолд өчигдрийн `sub|` мөр хөлдөөгүй үлдэж, маргааш нь
 *       ЯГ ТЭР OBJECTID дахин ашиглагдвал өчигдрийн хянагдаж буй мөр
 *       өнөөдрийн ажлыг «бүртгэгдсэн» гэж дарах байлаа.
 *    5. ЗӨВХӨН АЖЛЫН ОДООГИЙН (сүүлийн) ТОЙРОГ шалгагдана (2026-09-25-ны
 *       аудит, HIGH). `recheck('ok')` нь ХУУЧИН мөрийг САНААТАЙ засдаггүй
 *       («Менежер буцаасан» хэвээр, OWNER = инженер) бөгөөд шинэ тойрог
 *       нэмдэг. Урьд нь энд ижил `sheetOid`-той БҮХ мөрийг шалгадаг байсан
 *       тул тэр хуучин A мөр үүрд «хянагчийн гар дээр» мэт таарч байв:
 *       одоогийн B тойрог «Инженер буцаасан» болоход гүйцэтгэгчийн засвар
 *       `reused: true` гэж A-д шингэж, ШИНЭ тойрог ҮҮСЭХГҮЙ — B компанид
 *       үлдэж, засварыг хэн ч харахгүй, ажил мөнхөд гацна. Одоо ажил бүрийн
 *       (`багц|ажил|компани`) одоогийн мөрийг `groupWorks`-тэй ИЖИЛ эрэмбээр
 *       (`Хэддэх_удаа`, дараа нь OBJECTID) сонгоод ЗӨВХӨН түүнийг шалгана.
 */
export function openReviewRow(
  rows: readonly Attrs[],
  sheetOid: number | null,
  dayTag: string,
): Attrs | null {
  if (sheetOid == null || sheetOid <= 0) return null;
  const cur = currentRows(rows, sheetOid, (r) => String(r[F.ajil] ?? '').startsWith(dayTag));
  return cur.find((r) => {
    const st = String(r[F.status] ?? '') as Status;
    if (st === STATUS.transferred) return false;
    /* Гүйцэтгэгчийн гар дээр (буцаагдсан) бол ЖИНХЭНЭ дахин илгээлт — шинэ тойрог */
    if (OWNER[st] === 'company') return false;
    return true;
  }) ?? null;
}

/**
 * ИЛГЭЭЛТ ХЯНАЛТАД БҮРТГҮҮЛЭХ ШААРДЛАГАТАЙ ЮУ? (2026-10-04, цэвэр — `hyanaltSubmit.check.mjs`)
 *
 *    · буцаагдсан (компанийн гар дээр) → илгээлт (`subAt`) буцаалтаас ХОЙШ бол ТИЙМ.
 */
export function needsRegistration(
  rows: readonly Attrs[],
  sheetOid: number | null,
  dayTag: string,
  subAt: number,
): boolean {
  if (sheetOid == null || sheetOid <= 0) return false;
  const cur = currentRows(rows, sheetOid, (r) => String(r[F.ajil] ?? '').startsWith(dayTag));
  if (!cur.length) return true;
  if (openReviewRow(rows, sheetOid, dayTag)) return false;
  const ms = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const t = typeof v === 'string' && v ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  const RET = [F.engineerReturned, F.managerReturned, F.plannerReturned, F.directorReturned, F.headReturned, F.chiefReturned];
  const SENT = [F.engineerSent, F.managerSent, F.plannerSent, F.directorSent, F.headSent, F.chiefSent];
  return cur.some((r) => {
    const st = String(r[F.status] ?? '') as Status;
    if (st === STATUS.transferred) {
      const fin = Math.max(0, ...SENT.map((k) => ms(r[k])));
      return fin > 0 && subAt > fin;
    }
    if (OWNER[st] !== 'company') return false;
    const back = Math.max(0, ...RET.map((k) => ms(r[k])));
    return subAt > back;
  });
}

/** Ажлын түлхүүр — `hyanaltGroup.workKey`-тэй ЯГ ИЖИЛ (`багц|ажил|компани`). */
const workKeyOf = (r: Attrs) =>
  `${String(r[F.bagts] ?? '')}|${String(r[F.ajil] ?? '')}|${String(r[F.company] ?? '')}`;

/** `hyanaltStore.toRow`-ын `num`-тэй ижил — тоо биш бол 0. */
const num0 = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * ЭНЭ ИЛГЭЭЛТИЙН (`sheetOid`) АЖИЛ БҮРИЙН ОДООГИЙН МӨР.
 */
function currentRows(
  rows: readonly Attrs[],
  sheetOid: number,
  pred: (r: Attrs) => boolean,
): Attrs[] {
  const best = new Map<string, Attrs>();
  for (const r of rows) {
    if (Number(r[F.sheetOid]) !== sheetOid || !pred(r)) continue;
    const k = workKeyOf(r);
    const b = best.get(k);
    if (!b) { best.set(k, r); continue; }
    const de = num0(r[F.ergelt]) - num0(b[F.ergelt]);
    const oidOf = (x: Attrs) => num0(x.__oid ?? x[HYANALT.oid]);
    const doid = oidOf(r) - oidOf(b);
    if (de > 0 || (de === 0 && doid >= 0)) best.set(k, r);
  }
  return [...best.values()];
}

/**
 * ХЯНАЛТАД ЯВАА ИЛГЭЭЛТ — энэ хуудсанд шинээр илгээх ХОРИГ (2026-10-09, цэвэр — `hyanaltSubmit.check.mjs`).
 */
const FILL_DAY = /^Гүйцэтгэл · (\d{4}\.\d{2}\.\d{2})/;

const str0 = (v: unknown): string => (v == null ? '' : String(v));
const asRow = (r: Attrs): Row => ({
  ...r,
  __oid: num0(r.__oid ?? r[HYANALT.oid]),
  [F.ergelt]: num0(r[F.ergelt]),
  [F.bagts]: str0(r[F.bagts]),
  [F.ajil]: str0(r[F.ajil]),
  [F.company]: str0(r[F.company]),
  [F.status]: str0(r[F.status]),
}) as unknown as Row;

export type ReviewLockState = {
  /** Хянагчийн гар дээр (хориг) байгаа өдрүүд («2026.10.04») */
  days: string[];
  /** Гүйцэтгэгч рүү БУЦААГДСАН (засах ёстой) өдрүүд */
  returned: string[];
};

export function reviewLockState(
  rows: readonly Attrs[],
  bagts: string,
  sheet: string,
  otherSheets: readonly string[],
): ReviewLockState {
  const days = new Set<string>();
  const ret = new Set<string>();
  for (const w of groupWorks(rows.map(asRow))) {
    if (w.bagts !== bagts) continue;
    const m = FILL_DAY.exec(w.ajil);
    if (!m) continue;
    if (sheet && !w.ajil.includes(sheet) && otherSheets.some((n) => n && w.ajil.includes(n))) continue;
    if (w.status === STATUS.transferred) continue;
    (w.owner === 'company' ? ret : days).add(m[1]);
  }
  return { days: [...days].sort(), returned: [...ret].sort() };
}

export function reviewLockDays(
  rows: readonly Attrs[],
  bagts: string,
  sheet: string,
  otherSheets: readonly string[],
): string[] {
  return reviewLockState(rows, bagts, sheet, otherSheets).days;
}

export function reviewLockBlocks(st: ReviewLockState, fillMs: number): boolean {
  if (!st.days.length) return false;
  const d = dayLabel(fillMs);
  return !(st.returned.includes(d) && !st.days.includes(d));
}

export const reviewLockMsg = (days: string) =>
  tr('Хяналтад явж буй илгээлт ({0}) 7 шатаа бүрэн дуусаагүй байна — 7-р шат батлаж архивласны дараа шинээр бөглөж илгээнэ. Буцаасан илгээлтийг засаж дахин илгээх боломжтой.', days);

/**
 * Шинэ илгээлтийн ДОМЭЙН хориг (`reviewLockState`) — `saveSubmission` бичихээс ӨМНӨ дууддаг.
 */
export async function reviewLockDeny(bagts: string, sheet: string, otherSheets: readonly string[], fillMs: number): Promise<string | null> {
  let rows: Attrs[];
  try {
    rows = await queryAll();
  } catch (e) {
    return tr('Хяналтын бүртгэлийг уншиж чадсангүй — өмнөх илгээлт хянагдаж байгаа эсэх тодорхойгүй тул илгээсэнгүй, дахин оролдоно уу. ({0})', e instanceof Error ? e.message : String(e));
  }
  const st = reviewLockState(rows, bagts, sheet, otherSheets);
  if (!reviewLockBlocks(st, fillMs)) return null;
  return reviewLockMsg(st.days.join(', '));
}

/** Өдрийн шошго — `Ажлын_нэр`-ийн угтвар («Гүйцэтгэл · 2026.09.07») */
export const dayTagOf = (fillMs: number) => `Гүйцэтгэл · ${dayLabel(fillMs)}`;

/**
 * ХУУЧИН (хуудасны шошгогүй) НЭРИЙГ ӨВЛӨХ ЁСТОЙ ЮУ?
 *
 *    Тиймээс хуучин нэрийг ЗӨВХӨН ЯГ ЭНЭ илгээлтийн (`Эх_мөрийн_дугаар ===
 *    sheetOid`) нээлттэй мөрөөс өвлөнө — өөр илгээлтийн нээлттэй мөр байгаа
 *    нь энэ илгээлтээс шошго хасах шалтгаан БИШ. Ингэснээр тухайн илгээлтийн
 *    ӨӨРИЙНХ нь түүх (ergelt тоолуур, буцаалтын түүх) тасрахгүй хэвээр үлдэнэ.
 */
export function hasOpenLegacy(
  rows: readonly Attrs[],
  bagts: string,
  company: string,
  legacyAjil: string,
  sheetOid: number | null,
): boolean {
  if (sheetOid == null || sheetOid <= 0) return false;
  return currentRows(
    rows,
    sheetOid,
    (r) =>
      String(r[F.bagts] ?? '') === bagts &&
      String(r[F.company] ?? '') === company &&
      String(r[F.ajil] ?? '') === legacyAjil,
  ).some((r) => String(r[F.status] ?? '') !== STATUS.transferred);
}

/**
 * Нийтэлсэн гүйцэтгэлийг хяналтад бүртгэнэ.
 *
 * @param bagts    багцын нэр — «Багц 4-2» маягаар
 * @param fillMs   бөглөсөн өдөр (илгээлтийн `payload.fillMs`; батлагдахад
 *                 архивын жаазны `buglusun_ognoo` болно)
 * @param sheetOid ИЛГЭЭЛТИЙН мөрийн OBJECTID (`Selbe_Guitsetgel_Draft`,
 *                 `sub|<pkgKey>`). Архивын дугаар БИШ — гүйцэтгэл нь
 *                 хараахан архивт ороогүй; `hyanaltDetail`/`hyanaltStore`
 *                 үүгээр илгээлтийг олно.
 * @param sheet    ХУУДСЫН нэр («Багц 1 · 9 давхар») — доорх.
 * @returns бүртгэлийн дугаар, эсвэл алдааны мессеж
 */
export async function submitForReview(
  bagts: string,
  fillMs: number,
  sheetOid: number | null,
  sheet = '',
): Promise<{ ok: true; id: string; reused?: true } | { ok: false; error: string }> {
  try {
    await syncServerClock();
    if (typeof window !== 'undefined') {
      const { companyDeny } = await import('./submission');
      const deny = await companyDeny(bagts, true);
      if (deny) return { ok: false, error: deny };
    }
    const [rows, company] = await Promise.all([queryAll(), companyOf(bagts)]);
    const id = nextId(rows);
    const legacyAjil = `Гүйцэтгэл · ${dayLabel(fillMs)}`;
    const openLegacy = hasOpenLegacy(rows, bagts, company, legacyAjil, sheetOid);
    const ajil = !sheet || openLegacy ? legacyAjil : `${legacyAjil} · ${sheet}`;
    /*
     * ТОЙРГИЙН ДУГААР — тухайн (багц|ажил|компани) түлхүүрийн ХАМГИЙН ИХ + 1.
     */
    const ergelt = rows.reduce((m, r) => {
      if (String(r[F.bagts] ?? '') !== bagts) return m;
      if (String(r[F.ajil] ?? '') !== ajil) return m;
      if (String(r[F.company] ?? '') !== company) return m;
      const n = Number(r[F.ergelt]);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0) + 1;

    /*
     *    ЯАГААД: 2026-09-07-оос «хянагдаж байхад дахин илгээх» хориг
     *    (`FillNew.inReview`) ХАСАГДСАН — хэрэглэгч «хэдэн ч удаа илгээх
     *    боломжтой байх ёстой» гэж шаардсан. Тэр хориг нь энэ функцийн ЦОРЫН
     *    ГАНЦ idempotency хамгаалалт байсан тул хасагдмагц нэг өдөрт «Илгээх»
     *    дарах бүрд ergelt+1-тэй ШИНЭ мөр үүсч, нэг илгээлт олон тойрог мэт
     *    харагдаж, инженерийн дараалал давхардсан мөрөөр дүүрэх байлаа.
     *
     *    Хэрэглэгчийн шийдвэр (2026-09-07): «төдий өдрийн илгээлтийг дахин
     *    илгээвэл ТЭР өдрийн илгээлт update хийгдэнэ — шинэ тойрог үүсгэхгүй».
     *    Тиймээс тэр илгээлтийн мөрийг (`Эх_мөрийн_дугаар === sheetOid`)
     *    заасан, ХААГДААГҮЙ (`Шилжүүлсэн` биш) бүртгэл байвал БАЙГААГ нь
     *    буцаана — `saveSubmission` тэр өдрийн `sub|` мөрийг update хийсэн
     *    тул хянагч ШИНЭ агуулгыг тэр мөрөөрөө харна.
     */
    const open = openReviewRow(rows, sheetOid, legacyAjil);
    if (open) return { ok: true, id: String(open[F.id] ?? ''), reused: true };

    const attrs: Attrs = {
      [F.id]: id,
      [F.sheetOid]: sheetOid ?? 0,
      [F.ergelt]: ergelt,
      [F.bagts]: bagts,
      [F.ajil]: ajil,
      [F.company]: company,
      [F.companySent]: serverNow(),
      [F.engineer]: '', [F.engineerDecision]: '', [F.engineerReason]: '',
      [F.engineerReturned]: null, [F.engineerSent]: null,
      [F.manager]: '', [F.managerDecision]: '', [F.managerReason]: '',
      [F.managerReturned]: null, [F.managerSent]: null,
      [F.status]: STATUS.engineerReview,
    };

    const res = await addRows([attrs]);
    const mine = addedOid(res);
    if (mine > 0 && sheetOid != null && sheetOid > 0) {
      try {
        const wk = workKeyOf(attrs);
        const twin = (await queryAll())
          .filter((r) => {
            const o = num0(r[HYANALT.oid]);
            return o > 0 && o < mine && Number(r[F.sheetOid]) === sheetOid
              && workKeyOf(r) === wk && num0(r[F.ergelt]) === ergelt;
          })
          .sort((a, b) => num0(a[HYANALT.oid]) - num0(b[HYANALT.oid]))[0];
        if (twin && (await deleteRow(mine))) return { ok: true, id: String(twin[F.id] ?? ''), reused: true };
      } catch (e) {
        console.warn('[selbe] давхар хяналтын мөрийн шалгалт унав:', e);
      }
    }
    const fid = await ensureUniqueId(addedOid(res), id);
    return { ok: true, id: fid };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

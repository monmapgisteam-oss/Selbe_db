/**
 * ХАБ-ЫН БҮРТГЭЛҮҮД — «Бусад үзүүлэлт» карт (2026-10-08, хэрэглэгчийн хүсэлт).
 *
 * Эх сурвалж (2026-10-15-наас): Сэлбэ ENTERPRISE `Hosted/Сэлбэ_ХАБ1015` FeatureServer (хүснэгтүүд,
 * талбарын нэр ЖИЖИГ ҮСЭГТЭЙ; урьд нь AGOL `Сэлбэ_ХАБ1007`):
 *   · 40 — Талбайн зааварчилгааны бүртгэл  (огноо: `огноо`)
 *   · 42 — Сануулах хуудас өгсөн бүртгэл    (огноо: `баримтын_он__сар__өдөр`)
 *   · 37 — Хариуцлага тооцох мэдэгдэх       (огноо: `огноо`)
 *   · 33 — Сайжруулах (огноогүй: `week` + `тоо` → долоо хоногийн НИЙЛБЭР)
 *   · 43 — Хог хаягдал (`loadHabeaWaste`)
 * «Аюулыг мэдээлэх хуудас» — эх хүснэгт ОДООГООР БАЙХГҮЙ: «—»
 * (`null ≠ 0` — тэг гэж харуулбал «бүртгэл алга» гэж ХУДАЛ уншигдана).
 *
 * ⚠️ «7 ХОНОГ» = ӨМНӨХ БҮТЭН долоо хоног (Даваа 00:00 → дараагийн Даваа 00:00) — хэрэглэгч:
 *    «сүүлийн долоо хоногийн нийт тоо, Даваа гараг шинэчлэгддэг».
 * ⚠️ 2026-10-09: хил нь УЛААНБААТАРЫН цагаар — `habeaUzleg.prevWeek`-ийг ШУУД дахин ашиглана.
 *    Урьд нь энд хөтчийн ЛОКАЛ цагаар (`getDay`/`setDate`) тусдаа хуулбар байсан тул гадаадаас
 *    (эсвэл UTC-тэй машинаас) нээхэд долоо хоногийн хил үзлэгийн KPI-аас 8 цагаар зөрдөг байв.
 * ⚠️ Тоо нь серверийн `returnCountOnly` — мөр татахгүй.
 * ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — `arcgisPost` биеийг шалгаж шиднэ.
 * ⚠️ 2026-10-19: БИЧИЛТ (`applyEdits`) Enterprise ТОКЕНТОЙ (`entDocs.entSession` — MA · FIC/М-актын ижил сешн).
 *    Урьд нь Enterprise хост (`gis.selbecity.mn`) нь `query.isOrgUrl`/портал БИШ тул `arcgisPost` токен ОГТ
 *    залгадаггүй — бичилт НЭРГҮЙ явдаг байв (үйлчилгээ одоогоор нэргүй засварыг зөвшөөрдөг; админ хаана).
 *    Сешнгүй бол бичихгүй — `HabeaEntSignInRequired` (маягт `EntSignIn`-ийг харуулна); ГЭХДЭЭ
 *    `NEXT_PUBLIC_ENT_PORTAL_URL` хоосон бол урьдын адил нэргүй (`entAuth`-ийн ⚠️). Уншилт нэргүй хэвээр
 *    (үйлчилгээ нийтэд нээлттэй үед); бичилтийн шалгалтын уншилт (GlobalID · тоо · дугаар) токентой.
 */
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/query';
import { cached } from '@/lib/live';
import { AUTH, HABEA } from '@/lib/services';
import { currentUser, requireCap } from '@/lib/who';
import { invalidate } from '@/lib/dataBus';
import { isLostWrite } from '@/lib/lostWrite';
import { prevWeek } from '@/modules/habeaUzleg';
import { ENT_PORTAL, entSession } from '@/lib/entDocs';
import { HABEA_TTL_MS, HABEA_POLL_MS } from '@/lib/habeaTiming';

export type RegisterRow = {
  key: string;
  label: string;
  /** Өмнөх бүтэн долоо хоногийн тоо — эх сурвалжгүй / тоо ирээгүй бол `null` */
  week: number | null;
  /** ⚠️ 2026-10-19: `week === null`-ийн ШАЛТГААН (картын hover) — алга бол «эх сурвалж холбогдоогүй» */
  hint?: string;
};

export type RegisterData = { rows: RegisterRow[]; weekNo: number; start: Date; end: Date };

/**
 * Өмнөх бүтэн долоо хоног — Даваа 00:00 (УЛААНБААТАР) хилтэй.
 * ⚠️ 2026-10-09: `habeaUzleg.prevWeek`-ийн ХУУЛБАР БИШ, өөрөө — хоёр дүрэм дахин зөрөхгүй.
 */
export const lastFullWeek = (now = new Date()): { start: Date; end: Date; no: number } => prevWeek(now);

/** ArcGIS SQL-ийн огноо — сервер UTC-ээр хадгалдаг; `prevWeek`-ийн хил аль хэдийн ЖИНХЭНЭ агшин */
const sqlTs = (d: Date) => `timestamp '${d.toISOString().slice(0, 19).replace('T', ' ')}'`;

/**
 * ⚠️ 2026-10-09: `count` ирээгүй бол `null` (урьд нь 0 — «бүртгэл алга» гэж ХУДАЛ уншигдана).
 */
const countOf = async (url: string, where: string, auth: Record<string, string> = {}): Promise<number | null> => {
  const j = await arcgisPost<{ count?: number }>(`${url}/query`, {
    f: 'json', where, returnCountOnly: 'true', ...auth,
  }, { token: 'org' });
  return typeof j.count === 'number' && Number.isFinite(j.count) ? j.count : null;
};

/**
 * ISO долоо хоногийн ОН — долоо хоногийн Пүрэв гараг (UB) аль онд байна (Даваа эхлэл + 3 хоног).
 * ⚠️ 2026-10-19: 1-р сарын эхэн/12-р сарын сүүлийн долоо хоног өмнөх/дараагийн ISO онд харьяалагдаж болно.
 */
export const isoWeekYear = (start: Date): number => new Date(start.getTime() + 3 * 86_400_000 + 8 * 3_600_000).getUTCFullYear();

/**
 * «Сайжруулалт» (огноогүй хүснэгт) — тухайн долоо хоногийн `тоо`-ны НИЙЛБЭР (⚠️ 2026-10-19 засвар).
 *  · Урьд нь `week = N` ОНГҮЙ тул ӨМНӨХ оны ижил дугаартай мөр нийлбэрт холилдож болдог байв;
 *  · мөр алга бол 0 буцаадаг байв («0 сайжруулалт» ≠ «бүртгэл ирээгүй») → одоо `null` («—»).
 * Он: хүснэгтэд `year` талбар (`it.year`) тохируулсан бол `AND year = Y`. Амьд схем (2026-10-19:
 * objectid · week · тоо · globalid) ОН талбаргүй.
 * ⚠️ 2026-10-19 (засвар): он талбаргүй үед тухайн ISO долоо хоногийн утгыг ХАРУУЛНА, «оны ялгаагүй» тэмдэглэлтэй
 *    (hover) — урьд нь хүснэгтэд ≥ 8 долоо хоногоор хойших дугаар байвал (`isMultiYear`) `null` болгодог тул оны
 *    ихэнх хугацаанд (өнгөрсөн оны сүүлийн долоо хоногууд үлдсэн л бол) карт «—» байв. `isMultiYear` одоо зөвхөн
 *    тэмдэглэлийг хүчтэй болгоно. `null` нь ЗӨВХӨН тухайн долоо хоногт мөр алга үед.
 *    `max(week)` асуулга унавал (`catch → null`) БҮХ бүртгэлийн ачаалалтыг унагахгүй — тэмдэглэл энгийн хэвээр.
 */
async function improvementSum(
  it: { key: string; label: string; table: number | null; week?: string; sum?: string; year?: string },
  w: { start: Date; no: number },
): Promise<RegisterRow> {
  const url = `${HABEA.registers.url}/${it.table}/query`;
  const base = { key: it.key, label: it.label };
  const where = it.year ? `${it.week} = ${w.no} AND ${it.year} = ${isoWeekYear(w.start)}` : `${it.week} = ${w.no}`;
  const [j, wk] = await Promise.all([
    arcgisPost<{ features?: { attributes?: { s?: number | null; n?: number | null } }[] }>(url, {
      f: 'json', where,
      outStatistics: JSON.stringify([
        { statisticType: 'sum', onStatisticField: it.sum, outStatisticFieldName: 's' },
        { statisticType: 'count', onStatisticField: it.sum, outStatisticFieldName: 'n' },
      ]),
    }),
    /* Он талбаргүй үед л — хүснэгтийн долоо хоногийн дээд дугаар (олон оны өгөгдөл илрүүлэх) */
    it.year ? Promise.resolve(null) : arcgisPost<{ features?: { attributes?: { m?: number | null } }[] }>(url, {
      f: 'json', where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: it.week, outStatisticFieldName: 'm' }]),
    }).catch(() => null),
  ]);
  if (!Array.isArray(j.features)) return { ...base, week: null };
  const a = j.features[0]?.attributes ?? {};
  const v = numOrNull(a.s);
  const n = numOrNull(a.n);
  if (!n || v == null) return { ...base, week: null, hint: tr('Энэ долоо хоногт бүртгэл ирээгүй') };
  if (it.year) return { ...base, week: v };
  const maxWk = numOrNull(wk?.features?.[0]?.attributes?.m);
  return {
    ...base,
    week: v,
    hint: maxWk != null && isMultiYear([maxWk], w.no)
      ? tr('Оны ялгаагүй — хүснэгтэд он талбар алга; өөр оны ижил долоо хоногийн мөр нийлбэрт орсон байж болзошгүй')
      : tr('Оны ялгаагүй — хүснэгтэд он талбар алга (долоо хоногийн дугаараар)'),
  };
}

async function fetchRegisters(w: { start: Date; end: Date; no: number }): Promise<RegisterData> {
  const rows = await Promise.all(HABEA.registers.items.map(async (it): Promise<RegisterRow> => {
    /* ⚠️ 2026-10-08: «Нийт» багана ХАСАГДАВ (хэрэглэгч: «зөвхөн сүүлийн долоо хоногийн мэдээ») */
    if (it.table != null && it.week && it.sum) return improvementSum(it, w);
    if (it.table == null || !it.date) return { key: it.key, label: it.label, week: null };
    const week = await countOf(
      `${HABEA.registers.url}/${it.table}`,
      `${it.date} >= ${sqlTs(w.start)} AND ${it.date} < ${sqlTs(w.end)}`,
    );
    return { key: it.key, label: it.label, week };
  }));
  return { rows, weekNo: w.no, start: w.start, end: w.end };
}

/*
 * ⚠️ 5 минутын кэш (`HABEA` таг) — ХАБЭА-гийн бусад эх сурвалжтай ижил хэмнэл.
 * ⚠️ 2026-10-09: кэшийн ТҮЛХҮҮР нь долоо хоногийн эхлэл (UB). Урьд нь ганц кэш байсан тул
 *    Даваа гараг дамжихад `weekKey` солигдож дахин дуудсан ч TTL (5 мин) дотор ӨМНӨХ долоо
 *    хоногийн тоо буцдаг байв. Зөвхөн сүүлийн долоо хоногийнхыг барина.
 * ⚠️ 2026-10-09 (аудит №6): ганц слот — хуучин долоо хоногийн `cached` ЭНД үлдэхгүй; харин `live.cached`
 *    dataBus-д бүртгэсэн хаалтаа (`register`) хасах API байхгүй тул долоо хоног тутам нэг хөнгөн
 *    хаалт (`p = null`) үлдэнэ — unregister нэмэх нь dataBus-ийн өөрчлөлт (`habeaUzleg.loadWeekScores`-тэй ижил).
 */
let regCache: { k: number; load: () => Promise<RegisterData> } | null = null;

/* ХАБЭА-ийн кэшийн TTL ба ХУУДАСНЫ POLL (2026-10-21, кэшийн аудит) — POLL нь TTL-ээс ЗААВАЛ УРТ (тайлбар `habeaTiming.ts`-д).
   ⚠️ 2026-10-22 (аудит): тодорхойлолт `habeaTiming.ts`-д (импортгүй модуль — `cacheDrop.check.mjs` ТООГООР харьцуулна);
   энд дахин экспортолно — `Habea.tsx` · `habeaRegisters.ui.check.mjs` эндээс авсаар. */
export { HABEA_TTL_MS, HABEA_POLL_MS };

/** Карт ачаалагч. ⚠️ Дуудагч `now`-оо өгнө (render-ийн `Date.now()` биш — react-hooks/purity). */
export function loadHabeaRegisters(now = new Date()): Promise<RegisterData> {
  const w = prevWeek(now);
  const k = w.start.getTime();
  if (!regCache || regCache.k !== k) regCache = { k, load: cached(() => fetchRegisters(w), HABEA_TTL_MS, ['HABEA']) };
  return regCache.load();
}

/* ═════════════════ ХУУДАСЛАЛТ ═════════════════ */

/** Нэг хуудасны мөр — `maxRecordCount` (2000)-оос хэтрэхгүй */
const PAGE = 2000;
/** Хамгаалалт — эвдэрсэн `exceededTransferLimit` мөнхийн давталт үүсгэхгүй */
const MAX_PAGES = 100;

/**
 * БҮХ мөр — `orderByFields` (OID) + `resultOffset` хуудаслалт.
 * ⚠️ 2026-10-09: урьд нь нэг л асуулга (≤2000 мөр) байсан; дараалалгүй offset нь давхардсан/
 *    алдагдсан мөр өгдөг (CLAUDE.md «ArcGIS REST-ийн занга»).
 */
async function queryAll(url: string, where: string, oidField: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 0, off = 0; page < MAX_PAGES; page += 1) {
    const j = await arcgisPost<{ features?: { attributes?: Record<string, unknown> }[]; exceededTransferLimit?: boolean }>(
      `${url}/query`,
      {
        f: 'json', where, outFields: '*', returnGeometry: 'false',
        orderByFields: oidField, resultOffset: String(off), resultRecordCount: String(PAGE),
      },
    );
    const fs = j.features ?? [];
    for (const ft of fs) out.push(ft.attributes ?? {});
    if (!j.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return out;
}

/* ═════════════════ ХОГ ХАЯГДАЛ (2026-10-08) ═════════════════ */

/** Тоон нүд — хоосон (`null`/'') бол `null` (`Number(null) = 0` БИШ) */
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ISO долоо хоногийн хүчинтэй дугаар */
export const isWeekNo = (n: number | null): n is number => n != null && Number.isInteger(n) && n >= 1 && n <= 53;

/**
 * Нэг мөр — хаягдлын төрөл, багц бүрийн рейс (бүх долоо хоногийн НИЙЛБЭР).
 * ⚠️ 2026-10-09: хэмжилттэй нүдгүй багц `byPkg`-д ОРОХГҮЙ (урьд нь `Number(null)` → 0 нэмэгдэж
 *    «0 рейс» гэж ХУДАЛ уншигддаг байв) — `null ≠ 0`.
 */
export type WasteRow = { metric: string; byPkg: Record<string, number> };
/**
 * ⚠️ 2026-10-09: хүснэгтэд ОН/ОГНОО талбар БАЙХГҮЙ (амьд метадата: Week · Category · Metric ·
 *    Багц_* · FID; CreationDate/editFieldsInfo ч алга). Он ялгах талбар нэмэх нь схемийн өөрчлөлт.
 * ⚠️ 2026-10-09 (аудит): урьд нь энд «ХАМРАХ долоо хоногуудыг (`weeks`) ил шошголно» гэж байсан ч
 *    тэр шошгыг ea2fd95 (хэрэглэгчийн хүсэлтээр) ХАССАН — дахин нэмэхгүй. Оронд нь `multiYear`:
 *    хүснэгтэд зорилтот долоо хоногоос ЛАВ хойших дугаар байвал (жиш. 2027-ийн 5-р
 *    долоо хоногт 2026-ийн 22…52) мөрүүд ӨӨР ОНЫХ гэсэн үг — ижил дугаартай өнгөрсөн оны мөр
 *    нийлбэрт холилдож болзошгүйг карт ИЛ хэлнэ. Босго — `isMultiYear` (аудит №2: ≥ 8 долоо хоног).
 */
/**
 * ⚠️ 2026-10-09 (хэрэглэгч: «бусад шиг сүүлийн 7 хоног харагддаг»): `rows` нь ЗӨВХӨН өмнөх
 *    бүтэн долоо хоногийн (`prevWeek().no` — «Бусад үзүүлэлт»-тэй НЭГ дүрэм) мөрүүдийн нийлбэр.
 *    `weekNo` — тэр долоо хоног; `weeks` — хүснэгтэд байгаа бүх долоо хоног.
 */
/**
 * ⚠️ 2026-10-09 (аудит №2): ОЛОН ОНЫ ӨГӨГДЛИЙН ДҮРЭМ — хүснэгтэд зорилтот долоо хоногоос (`weekNo`)
 *    `MULTI_YEAR_GAP` (8)-аас ДООШГҮЙ долоо хоногоор хойших дугаар байвал л «өнгөрсөн оных».
 *    Урьд нь `n > weekNo + 1` байсан тул ганц алдаатай/урьдчилан оруулсан ирээдүйн долоо хоног (жиш.
 *    40-р долоо хоногт 44) «он ялгагдаагүй» гэж ХУДАЛ анхааруулдаг байв. 8 долоо хоног (~2 сар) урагш
 *    оруулах/шивэх нь бодитой биш; өнгөрсөн оны мөр (жиш. 2027-ийн 1-д 2026-ийн 40…52) үүнийг амархан давна.
 *    ⚠️ Хязгаар: `weekNo` ≥ 45 (оны сүүл) үед өнгөрсөн оны 52/53-ыг ялгаж чадахгүй — он талбаргүй тул
 *    хуурамч анхааруулгаас дутуу анхааруулга нь бага хор хөнөөлтэй гэж сонгосон.
 */
export const MULTI_YEAR_GAP = 8;
export const isMultiYear = (weeks: readonly number[], weekNo: number): boolean =>
  weeks.some((n) => n - weekNo >= MULTI_YEAR_GAP);

export type WasteData = { rows: WasteRow[]; weeks: number[]; weekNo: number; multiYear: boolean };

type WasteRaw = { wk: number | null; metric: string; cols: Record<string, number | null> };

async function fetchWaste(): Promise<WasteRaw[]> {
  const W = HABEA.waste;
  const list = await queryAll(W.url, '1=1', W.fields.oid);
  return list.map((a) => ({
    /* ⚠️ 2026-10-09: хоосон Week → `null` (урьд нь `Number(null)` = 0 → «0-р долоо хоног») */
    wk: numOrNull(a[W.fields.week]),
    metric: String(a[W.fields.metric] ?? ''),
    cols: Object.fromEntries(W.pkgCols.map(([col]) => [col, numOrNull(a[col])])),
  }));
}

const cachedWaste = cached(fetchWaste, 5 * 60_000, ['HABEA']);
/** Хог хаягдлын карт ачаалагч. ⚠️ Дуудагч `now`-оо өгнө (render-ийн `Date.now()` биш). */
export async function loadHabeaWaste(now = new Date()): Promise<WasteData> {
  const W = HABEA.waste;
  const weekNo = prevWeek(now).no;
  const list = await cachedWaste();
  const by = new Map<string, Record<string, number>>();
  const weeks = new Set<number>();
  for (const r of list) {
    if (isWeekNo(r.wk)) weeks.add(r.wk);
    if (r.wk !== weekNo) continue;
    const cur = by.get(r.metric) ?? {};
    for (const [col, name] of W.pkgCols) {
      const v = r.cols[col];
      if (v != null) cur[name] = (cur[name] ?? 0) + v;
    }
    by.set(r.metric, cur);
  }
  const wk = [...weeks].sort((x, y) => x - y);
  return {
    rows: [...by.entries()].map(([metric, byPkg]) => ({ metric, byPkg })), weeks: wk, weekNo,
    /* ⚠️ 2026-10-09 (аудит): он ялгах талбаргүй тул ОЛОН ОНЫ өгөгдлийг илрүүлнэ (`WasteData`-ийн ⚠️) */
    multiYear: isMultiYear(wk, weekNo),
  };
}

/* ═════════════════ БИЧИЛТ — «habeaData» эрхтэй хэрэглэгч (2026-10-08) ═════════════════ */

/**
 * ⚠️ 2026-10-19: Enterprise-ийн сешн шаардлагатай — бичилт НЭРГҮЙ явахгүй (файлын толгойн ⚠️).
 * Маягт (`HabeaEntry`) энэ алдааг таньж `EntSignIn`-ийг харуулна.
 */
export class HabeaEntSignInRequired extends Error {
  constructor() {
    super(tr('ХАБЭА-гийн бүртгэл Enterprise геопорталд хадгалагддаг — хадгалахын өмнө Enterprise-д нэвтэрнэ үү.'));
    this.name = 'HabeaEntSignInRequired';
  }
}

/** Enterprise токены эх — тестэд солих боломжтой (`setEntTokenSource`) */
let entTokenSource: () => string | null = () => entSession()?.token ?? null;
/** ⚠️ ЗӨВХӨН шалгуурт — Enterprise сешнийг дуурайна */
export function setEntTokenSource(fn: () => string | null): void { entTokenSource = fn; }

/** Enterprise геопорталын хаяг (`NEXT_PUBLIC_ENT_PORTAL_URL`) — тестэд солих боломжтой (`setEntPortal`) */
let entPortal = ENT_PORTAL;
/** ⚠️ ЗӨВХӨН шалгуурт */
export function setEntPortal(url: string): void { entPortal = url; }
/** Enterprise нэвтрэлт тохируулагдсан эсэх — хоосон бол бичилт урьдын адил НЭРГҮЙ (`entAuth`-ийн ⚠️) */
export const habeaEntConfigured = (): boolean => !!entPortal;

let warnedAnon = false;
/**
 * Бичилтийн токен (POST биеэр, `token: 'org'` горим — дуудагчийн `token` хэвээр) — сешнгүй бол ШИДНЭ.
 * ⚠️ 2026-10-19: `NEXT_PUBLIC_ENT_PORTAL_URL` ТОХИРУУЛААГҮЙ бол (`EntSignIn` юу ч зурахгүй → сешн хэзээ ч үүсэхгүй)
 *    ӨМНӨХ зан — НЭРГҮЙ бичилт (`{}`), консолд нэг удаа анхааруулга; маягт тэмдэглэл харуулна
 *    (`HabeaEntry.EntGate`). Эс тэгвээс production-д хувьсагч тавигдахаас өмнө ХАБЭА-гийн бүртгэл бүрмөсөн
 *    хаагддаг байв. Тохируулсан үед сешн ЗААВАЛ.
 */
function entAuth(): Record<string, string> {
  if (!entPortal) {
    if (!warnedAnon) {
      warnedAnon = true;
      console.warn('[habea] NEXT_PUBLIC_ENT_PORTAL_URL тохируулаагүй — ХАБЭА-гийн бичилт Enterprise токенгүй (нэргүй) явна.');
    }
    return {};
  }
  const t = entTokenSource();
  if (!t) throw new HabeaEntSignInRequired();
  return { token: t };
}
/*
 * ⚠️ БАТЛАГЧГҮЙ — шууд ArcGIS-д. ⚠️ `requireCap('habeaData')` — UI-ийн товч нуугдсан ч консолоос бичихийг хаана.
 * ⚠️ `invalidate('HABEA')` нь `finally`-д — хариу алдагдсан ч (мөр сууссан байж магадгүй) карт шинэчлэгдэнэ.
 * ⚠️ 2026-10-09: ХАРИУ АЛДАГДСАН (`isLostWrite`) бичилтийг ХЭЗЭЭ Ч сохроор дахин илгээхгүй —
 *    урьд нь хэрэглэгч «Хадгалах»-ыг дахин дарахад ДАВХАРДСАН мөр үүсдэг байв. Эхлээд серверээс
 *    асууна: бүртгэлд клиентийн GlobalID-аар, хог хаягдалд (GlobalID-гүй хүснэгт) ижил утгатай
 *    мөрийн тоогоор.
 */

/** Хариу алдагдсан ба шалгахад мөр олдоогүй — үр дүн ТОДОРХОЙГҮЙ (дахин дарахад эхлээд шалгана) */
export class HabeaLostWrite extends Error {
  constructor(readonly lost: unknown, readonly before?: number, readonly sig?: string) {
    super(tr('Серверийн хариу алдагдсан — мөр бичигдсэн эсэх тодорхойгүй. Дахин «Хадгалах» дарвал эхлээд шалгаж, давхардуулахгүй.'));
    this.name = 'HabeaLostWrite';
  }
}

type ApplyRes = { success?: boolean; objectId?: number; globalId?: string; error?: { description?: string } };

/** `applyEdits`-ийн НЭГ нэмэлтийн үр дүн — хоосон/дутуу хариу амжилт БИШ (`tableWrite.check`-ийн дүрэм) */
const oneAdd = (j: { addResults?: ApplyRes[] }): ApplyRes => {
  const r = j.addResults ?? [];
  if (r.length !== 1) throw new Error(tr('сервер {0}/{1} мөрийн хариу буцаав — бичигдээгүй гэж үзнэ', r.length, 1));
  return r[0];
};

/** Клиентийн GlobalID — `{XXXXXXXX-XXXX-4XXX-YXXX-XXXXXXXXXXXX}` (ArcGIS-ийн хэв) */
export function newGlobalId(): string {
  const c = globalThis.crypto;
  let u: string;
  if (c?.randomUUID) u = c.randomUUID();
  else {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `{${u.toUpperCase()}}`;
}

/** Тухайн GlobalID-тай мөр сервер дээр байгаа юу — асуулга унавал ШИДНЭ (тодорхойгүй) */
async function gidExists(url: string, gidField: string, gid: string): Promise<boolean> {
  const n = await countOf(url, `${gidField} = '${gid.replace(/'/g, "''")}'`, entAuth());
  if (n == null) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  return n > 0;
}

/**
 * Хүснэгтийн бичих талбар — маягт угсрахад.
 * ⚠️ 2026-10-19 (хэрэглэгч: «домэйн оруулсан талбар сонголтоор харагддаг байх»): `options` —
 *    кодлогдсон домэйны {код, нэр} жагсаалт; байвал маягт `<select>` зурна (жиш. 40-ийн
 *    «Талбайн зааварчилгаа өгсөн» — ХАБ ажилтнуудын нэрс).
 */
export type EntryField = {
  name: string; alias: string; type: 'date' | 'number' | 'text' | 'long';
  options?: { code: string; name: string }[];
};

const SYS_FIELD = /^(objectid|fid|globalid|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)$/i;
/** Урт текстийн талбар — `textarea` */
const LONG_RE = /агуулга|тайлбар/i;

/**
 * Талбарын ДЭЛГЭЦИЙН нэр — метадатын alias нь орчуулагдахгүй тул НЭРЭЭР нь `tr()`.
 * ⚠️ 2026-10-09: талбарын нэрс амьд метадатаас. Шинэ талбар нэмэгдвэл alias-аараа (монголоор) гарна — энд мөр нэмнэ.
 * ⚠️ 2026-10-19: түлхүүрүүд AGOL-ийн (`Сэлбэ_ХАБ1007`, «Огноо») нэрээр байсан; Enterprise (`Сэлбэ_ХАБ1015` —
 *    37 · 40 · 42, PostgreSQL) талбарууд ЖИЖИГ үсэгтэй («огноо») тул англи шошго огт таардаггүй байв.
 *    Хайлт ТОМ/ЖИЖИГ үсэг ҮЛ ХАМААРНА (`LABEL_LC`) — хоёр схемд ажиллана.
 */
const FIELD_LABEL: Record<string, () => string> = {
  f_: () => tr('№'),
  'д_д': () => tr('д/д'),
  'Огноо': () => tr('Огноо'),
  'Баримтын_дугаар': () => tr('Баримтын дугаар'),
  'Талбайн_зааварчилгаа_өгсөн_багц': () => tr('Талбайн зааварчилгаа өгсөн багц'),
  'Товч_агуулга': () => tr('Товч агуулга'),
  'Дуусах_хугацаа': () => tr('Дуусах хугацаа'),
  /* ⚠️ 2026-10-26 (аудит): Enterprise хүснэгт 40-д ЛАТИН нэртэй (`duusah_hugatsaa`) — кирилл түлхүүрт таарахгүй тул alias-аар
     (tr-гүй) англи горимд монголоор гардаг байв */
  duusah_hugatsaa: () => tr('Дуусах хугацаа'),
  'Талбайн_зааварчилгаа_өгсөн': () => tr('Талбайн зааварчилгаа өгсөн'),
  'Компаний_нэр': () => tr('Компаний нэр'),
  'Байршил': () => tr('Байршил'),
  'Зөрчлийн_төрөл': () => tr('Зөрчлийн төрөл'),
  'Агуулга': () => tr('Агуулга'),
  'Зөрчилд_ноогдуулсан_мөнгөн_дүн': () => tr('Зөрчилд ноогдуулсан мөнгөн дүн'),
  'Мэдэгдэх_хуудас__pdf_file_': () => tr('Мэдэгдэх хуудас'),
  'Баримтын_он__сар__өдөр': () => tr('Баримтын он, сар, өдөр'),
  'Баримтын_бүртгэлийн_дугаар': () => tr('Баримтын бүртгэлийн дугаар'),
  'Багцын_нэр': () => tr('Багцын нэр'),
  'Сануулах_хуудас_бичсэн': () => tr('Сануулах хуудас бичсэн'),
  'Нэмэлт_тайлбар': () => tr('Нэмэлт тайлбар'),
};
const LABEL_LC = new Map(Object.entries(FIELD_LABEL).map(([k, v]) => [k.toLowerCase(), v]));
export const entryFieldLabel = (f: EntryField): string => LABEL_LC.get(f.name.toLowerCase())?.() ?? f.alias;

/** Бүртгэлийн хүснэгтийн талбарууд (Enterprise 37 · 40 · 42 — ⚠️ 2026-10-19: урьд «35 · 38 · 36» AGOL) — метадатаас, дарааллаар */
export async function loadEntryFields(table: number): Promise<EntryField[]> {
  const j = await arcgisPost<{ fields?: {
    name?: string; alias?: string; type?: string; editable?: boolean;
    domain?: { codedValues?: { code?: unknown; name?: unknown }[] } | null;
  }[] }>(`${HABEA.registers.url}/${table}`, { f: 'json' });
  return (j.fields ?? [])
    .filter((f) => f.name && !SYS_FIELD.test(f.name) && f.editable !== false && !/OID|GlobalID/.test(f.type ?? ''))
    .map((f) => {
      const t = String(f.type ?? '');
      const type: EntryField['type'] = /Date/.test(t) ? 'date'
        : /Double|Integer|Single/.test(t) ? 'number'
          : LONG_RE.test(String(f.alias ?? f.name)) ? 'long' : 'text';
      const cv = f.domain?.codedValues;
      const options = cv?.length ? cv.map((c) => ({ code: String(c.code), name: String(c.name ?? c.code) })) : undefined;
      return { name: String(f.name), alias: String(f.alias || f.name), type, ...(options ? { options } : {}) };
    });
}

/**
 * Дугаарын (№ · д/д) дараагийн утга — хамгийн их + 1 (хүснэгт хоосон бол 1).
 * ⚠️ 2026-10-19: Enterprise сешн байвал токентой (бичилтийн өмнөх уншилт); маягтын санал (сешнгүй) нэргүй.
 */
export async function nextNumber(table: number, field: string): Promise<number> {
  const t = entTokenSource();
  const j = await arcgisPost<{ features?: { attributes?: { m?: number | null } }[] }>(
    `${HABEA.registers.url}/${table}/query`,
    { f: 'json', where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'm' }]), ...(t ? { token: t } : {}) },
    { token: 'org' },
  );
  const m = numOrNull(j.features?.[0]?.attributes?.m);
  return m != null ? m + 1 : 1;
}

/**
 * ДУГААРЫН (№ · д/д) ДАВХАРДЛЫГ БИЧСЭНИЙ ДАРАА ЗАСНА — `hyanalt.ensureUniqueId`-ийн загвар.
 * ⚠️ 2026-10-21 (аудит): `nextNumber` нь клиентэд max+1 тул хоёр хүн зэрэг хадгалбал ИЖИЛ дугаар авдаг
 *    байв. Шинэ мөрийн (`oid`) дугаарыг ӨӨРӨӨС БАГА objectid-тай мөр эзэмшиж байвал ӨӨРИЙНХИЙГ шинэ
 *    max+1 болгоно — ТЭНЦҮҮЛЭГЧ: зөвхөн ИХ objectid-тай тал шилжинэ (хоёр клиент ижил дүрмээр шийдэх тул
 *    хоёулаа шилжиж дахин давхцахгүй). Гурав ба түүнээс олон зэрэг бичилтэд цөөн удаа давтана.
 *    Дэлгэцийн дугаар тул алдаа нь хадгалалтыг УНАГАХГҮЙ (`console.warn`) — мөр аль хэдийн бичигдсэн.
 *    `oid` мэдэгдэхгүй бол (хариунд `objectId` алга) клиентийн GlobalID-аар олно.
 */
async function ensureUniqueSeq(
  table: number, field: string, oid: number, n: number, auth: Record<string, string>,
  gid?: string,
): Promise<void> {
  const url = `${HABEA.registers.url}/${table}`;
  let cur = n;
  try {
    let id = Number.isInteger(oid) && oid > 0 ? oid : 0;
    if (!id && gid) {
      const j = await arcgisPost<{ objectIds?: number[] | null }>(`${url}/query`, {
        f: 'json', where: `${HABEA.registers.gidField} = '${gid.replace(/'/g, "''")}'`, returnIdsOnly: 'true', ...auth,
      }, { token: 'org' });
      id = Number(j.objectIds?.[0]) || 0;
    }
    if (!id) return;
    for (let i = 0; i < 3; i += 1) {
      const below = await countOf(url, `${field} = ${cur} AND objectid < ${id}`, auth);
      if (below == null) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
      if (below === 0) return;
      const next = await nextNumber(table, field);
      const j = await arcgisPost<{ updateResults?: ApplyRes[] }>(`${url}/applyEdits`, {
        f: 'json',
        updates: JSON.stringify([{ attributes: { objectid: id, [field]: next } }]),
        rollbackOnFailure: 'true',
        ...auth,
      }, { token: 'org' });
      const r = j.updateResults ?? [];
      if (r.length !== 1 || r[0].success !== true) throw new Error(r[0]?.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
      cur = next;
    }
  } catch (e) {
    console.warn('[habea] бүртгэлийн дугаарын давхардлын шалгалт унав:', e);
  }
}

/**
 * Бүртгэлийн мөр нэмэх — клиентийн GlobalID-тай (`useGlobalIds`).
 * ⚠️ 2026-10-09: `gid`-ийг дуудагч НЭГ маягтад тогтвортой барина — дахин «Хадгалах» дарахад ижил
 *    `gid`-ээр эхлээд серверээс асууна (байвал амжилт, ДАХИН ИЛГЭЭХГҮЙ). Хоцорч суусан анхны
 *    бичилт ба дахин илгээлт уралдвал давхар GlobalID-ийг сервер өөрөө татгалзана → дахин асууна.
 * ⚠️ `autoSeq` — санал болгосон дугаарыг (№ · д/д) хэрэглэгч өөрчлөөгүй бол бичихийн ЯГ ӨМНӨ
 *    дахин бодно (маягт нээлттэй байх хооронд өөр хүн нэмсэн бол давхардахгүй).
 * ⚠️ 2026-10-09 (аудит №6): `retry` нь ЗӨВХӨН ИЖИЛ УТГАТАЙ дахин илгээлтэд хүчинтэй — `addWaste`-ийн
 *    `sig` загвар. Урьд нь хариу алдагдсаны дараа хэрэглэгч талбараа ЗАСААД дахин дарахад ижил `gid`
 *    олдвол юу ч бичилгүй «амжилттай» хаагддаг — засвар алга болдог байв. Одоо `HabeaLostWrite.sig` =
 *    `registerSig(attrs)`; дуудагч утга өөрчлөгдвөл ШИНЭ `gid`-ээр, `retry`-гүй илгээнэ (`HabeaEntry`).
 */
/** Бүртгэлийн утгын гарын үсэг — дахин илгээлт ижил утгатай эсэхийг тулгахад (`addWaste`-ийн `sig`) */
export const registerSig = (attrs: Record<string, unknown>): string =>
  JSON.stringify(Object.keys(attrs).sort().map((k) => [k, attrs[k]]));

export async function addRegister(
  table: number, attrs: Record<string, unknown>, gid: string, opts: { autoSeq?: string; retry?: boolean } = {},
): Promise<void> {
  requireCap('habeaData');
  /* ⚠️ 2026-10-19: Enterprise сешнгүй бол юу ч илгээхгүй (`invalidate`-ээс ӨМНӨ — карт хөндөгдөхгүй) */
  const auth = entAuth();
  const R = HABEA.registers;
  const url = `${R.url}/${table}`;
  try {
    if (opts.retry && await gidExists(url, R.gidField, gid)) return;
    const a = { ...attrs };
    if (opts.autoSeq) a[opts.autoSeq] = await nextNumber(table, opts.autoSeq);
    let res: ApplyRes;
    try {
      res = oneAdd(await arcgisPost<{ addResults?: ApplyRes[] }>(`${url}/applyEdits`, {
        f: 'json',
        adds: JSON.stringify([{ attributes: { ...a, [R.gidField]: gid } }]),
        useGlobalIds: 'true',
        rollbackOnFailure: 'true',
        ...auth,
      }, { token: 'org' }));
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      /* Хариу алдагдсан — ЗӨВХӨН уншина. Шалгалт өөрөө унавал «тодорхойгүй». */
      const found = await gidExists(url, R.gidField, gid).catch(() => null);
      if (found) return;
      throw new HabeaLostWrite(e, undefined, registerSig(attrs));
    }
    /* ⚠️ 2026-10-21 (аудит): `success !== true` — талбаргүй/`undefined` үр дүн ч амжилт БИШ (`oneAdd` зөвхөн тоог шалгадаг) */
    if (res.success !== true) {
      /* Давхар GlobalID (хоцорч суусан анхны бичилт) — мөр аль хэдийн байвал амжилт */
      if (await gidExists(url, R.gidField, gid).catch(() => false)) return;
      throw new Error(res.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
    }
    /* ⚠️ 2026-10-21 (аудит): зэрэг хадгалалтын ДАВХАР дугаар — бичсэний ДАРАА шалгаж засна (`ensureUniqueSeq`) */
    if (opts.autoSeq && typeof a[opts.autoSeq] === 'number') {
      await ensureUniqueSeq(table, opts.autoSeq, Number(res.objectId), a[opts.autoSeq] as number, auth, gid);
    }
  } finally {
    invalidate('HABEA');
  }
}

type WasteMeta = {
  capabilities?: string;
  fields?: { name?: string; domain?: { codedValues?: { code?: unknown; name?: unknown }[] } | null }[];
};
const wasteMeta = () => arcgisPost<WasteMeta>(HABEA.waste.url, { f: 'json' });

/** «Хог хаягдал»-ын маягтын төрлүүд — домэйны код ба нэр (метадатаас), домэйны дарааллаар */
export async function loadWasteMetrics(): Promise<{ code: string; name: string }[]> {
  const W = HABEA.waste;
  const meta = await wasteMeta();
  const dom = meta.fields?.find((f) => f.name === W.fields.metric)?.domain?.codedValues ?? [];
  return dom.map((c) => ({ code: String(c.code), name: String(c.name ?? c.code) }));
}

/**
 * ⚠️ 2026-10-09 (аудит): давхарга МӨР НЭМЭХИЙГ зөвшөөрдөг эсэх — метадатын `capabilities`-д `Create`.
 *    Амьд метадата: `Хог_хаягдал/FeatureServer/0` → `"capabilities": "Query"` — эзэмшигч/админаас
 *    бусдын `applyEdits` унадаг атал «+ Нэмэх» харагдаж, хэрэглэгч маягт бөглөөд л алдаа авдаг байв.
 *    `null` = метадата татагдсангүй (тодорхойгүй — товчийг ХААХГҮЙ, бичилт өөрөө алдаагаа хэлнэ).
 */
export const parseCanCreate = (capabilities: unknown): boolean | null =>
  typeof capabilities === 'string' ? /(^|,)\s*create\s*(,|$)/i.test(capabilities) : null;
export const loadWasteCanCreate = cached(
  () => wasteMeta().then((m) => parseCanCreate(m.capabilities), () => null),
  5 * 60_000, ['HABEA'], (v) => v != null,
);

/**
 * ⚠️ 2026-10-09 (аудит №2): НЭВТЭРСЭН ХЭРЭГЛЭГЧ AGOL-ИЙН БАЙГУУЛЛАГЫН АДМИН МӨН ҮҮ (`community/self` → `role`).
 *    AGOL дээр «Enable editing» унтраалттай ч эзэмшигч ба байгууллагын админ бичиж чаддаг. Урьд нь
 *    «+ Нэмэх» товч зөвхөн порталын super-д идэвхтэй үлддэг тул habeaData эрхтэй AGOL админ товч
 *    хаалттай авдаг байв. ⚠️ Эзэмшигчийг ШАЛГАХГҮЙ: давхаргын метадата `owner` өгдөггүй (зөвхөн
 *    `serviceItemId`) — нэмэлт `content/items/<id>` хүсэлт шаардах тул зөвхөн админ эрх.
 *    ⚠️ `username` нэвтэрсэн хэрэглэгчтэй тулгана (`hyanaltStore.loginFullName`-ийн загвар); хэрэглэгчээр
 *    кэшлэнэ, уналтыг кэшлэхгүй → `false` (товч хаалттай хэвээр — бичилт өөрөө алдаагаа хэлнэ).
 *    Нэвтрэлт унтраалттай (дев) / Node (тест) → `false`.
 */
export const isOrgAdminRole = (role: unknown): boolean => String(role ?? '').trim().toLowerCase() === 'org_admin';
const orgAdminByUser = new Map<string, Promise<boolean>>();
export function loadIsOrgAdmin(): Promise<boolean> {
  if (typeof window === 'undefined' || !AUTH.appId) return Promise.resolve(false);
  const u = (currentUser() ?? '').trim().toLowerCase();
  if (!u) return Promise.resolve(false);
  let p = orgAdminByUser.get(u);
  if (!p) {
    p = arcgisPost<{ username?: string; role?: string }>(
      `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest/community/self`, { f: 'json' },
    ).then((j) => String(j?.username ?? '').trim().toLowerCase() === u && isOrgAdminRole(j?.role));
    p.catch(() => orgAdminByUser.delete(u));
    orgAdminByUser.set(u, p);
  }
  return p.catch(() => false);
}

/** Хог хаягдлын мөрийн ЯГ утгын WHERE — хариу алдагдсан бичилтийг тоолж шалгахад */
const wasteWhere = (week: number, metric: string, cols: Record<string, number | null>): string => {
  const W = HABEA.waste;
  const parts = [`${W.fields.week} = ${week}`, `${W.fields.metric} = N'${metric.replace(/'/g, "''")}'`];
  for (const [c] of W.pkgCols) parts.push(cols[c] == null ? `${c} IS NULL` : `${c} = ${Number(cols[c])}`);
  return parts.join(' AND ');
};

/**
 * Хог хаягдлын ШИНЭ мөр (2026-10-08 хэрэглэгчийн шийдвэр: байгаа мөрийг дарж бичихгүй).
 * ⚠️ 2026-10-09: хүснэгт GlobalID-ГҮЙ (амьд метадата: `globalIdField` хоосон,
 *    `supportsApplyEditsWithGlobalIds: false`) — хариу алдагдвал ИЖИЛ утгатай мөрийн тоог
 *    бичихээс ӨМНӨХТЭЙ харьцуулна. Олдохгүй бол `HabeaLostWrite` (`before`, `sig`) — дуудагч
 *    ИЖИЛ утгаар дахин дарвал `prior`-оор эхлээд дахин тоолно (өссөн бол амжилт, илгээхгүй).
 * ⚠️ Хоосон нүд → `null` (0 БИШ — `null ≠ 0`).
 */
export async function addWaste(
  week: number, metric: string, cols: Record<string, number | null>,
  prior?: { before: number; sig: string } | null,
): Promise<void> {
  requireCap('habeaData');
  const W = HABEA.waste;
  if (!isWeekNo(week)) throw new Error(tr('Долоо хоног 1–53 байна.'));
  /* ⚠️ 2026-10-19: Enterprise токен — бичилт ба түүний шалгалтын тоолол (`addRegister`-ийн ⚠️) */
  const auth = entAuth();
  const where = wasteWhere(week, metric, cols);
  try {
    let before: number | null;
    if (prior && prior.sig === where) {
      const now = await countOf(W.url, where, auth);
      if (now != null && now > prior.before) return;
      before = prior.before;
    } else {
      before = await countOf(W.url, where, auth);
    }
    let res: ApplyRes;
    try {
      res = oneAdd(await arcgisPost<{ addResults?: ApplyRes[] }>(`${W.url}/applyEdits`, {
        f: 'json',
        adds: JSON.stringify([{ attributes: { [W.fields.week]: week, [W.fields.category]: 'Waste', [W.fields.metric]: metric, ...cols } }]),
        rollbackOnFailure: 'true',
        ...auth,
      }, { token: 'org' }));
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      const after = await countOf(W.url, where, auth).catch(() => null);
      if (before != null && after != null && after > before) return;
      throw new HabeaLostWrite(e, before ?? undefined, where);
    }
    /* ⚠️ 2026-10-21 (аудит): `success !== true` — талбаргүй/`undefined` үр дүн ч амжилт БИШ (`oneAdd` зөвхөн тоог шалгадаг) */
    if (res.success !== true) throw new Error(res.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
  } finally {
    invalidate('HABEA');
  }
}

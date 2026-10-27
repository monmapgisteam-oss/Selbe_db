/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ · БИЕЛЭЛТ — АМЬД ОРОЛТЫН АДАПТЕРУУД ба АЧААЛАГЧ.
 *
 * `projectPlan.ts` (цэвэр томьёоны хөдөлгүүр) нь синхрон callback-уудаар амьд утга авдаг
 * (`PlanInputs`). Энэ файл тэдгээр callback-ыг системийн эх сурвалжуудаас бэлдэнэ:
 *
 *   blockActual(pkg, blok)        — бөглөх хуудасны блокийн «Б.» гүйцэтгэл (`blockProgress`)
 *   pkgActual(pkg)                — блокгүй багцын (5.x · 6.x · 7.1 · 10) «Б.» гүйцэтгэл (`loadInfraProgress`)
 *   blockPlanned(pkg, blok, asOf) — Хуваарийн төлөвлөгөөт % дурын өдрөөр (`bagtsSheet.planCurve`, блок тус бүрээр)
 *   land(pkg, blok)               — газар чөлөөлөлт % = чөлөөлөгдсөн ÷ нийт нэгж талбарын ТОО (орон зайн огтлолцол)
 *
 * ба `loadProjectPlan()` — CASHFLOW_NEW-ийн Excel мөрүүдийг (dd_kod IS NOT NULL) уншиж мод угсраад,
 * оролтуудыг цуглуулж `computePlan` + `monthlySeries`-ийг бодно.
 *
 * ⚠️ 2026-10-26: ТҮЛХҮҮР. Excel-ийн багцын бичиглэл («Багц-1», «БАГЦ-5.1», «Багц-4.2», «БАГЦ - 19.1») ба
 *    системийн нэр («Багц 1», «Багц 5.1», «Багц 4-2») НЭГ `bagtsKey`-д («БАГЦ1» · «БАГЦ51» · «БАГЦ42») буудаг;
 *    блок нь `buildingKey(багц, блок)` («БАГЦ42|6/1») — `blockProgress`/`sheetRows`-ийн ЯГ тэр түлхүүр. Тиймээс
 *    нэг багцын 9F/12F хуудас (`pkg.group` нэг) системийн бусад хэсэгтэй АДИЛ нэг багцад нийлнэ.
 *    Олон багцыг хамарсан мөр («БАГЦ 1-4», «БАГЦ-6.1, 6.2») `pkgKeyOf`-оор хоосон түлхүүр авч АЛЬ Ч багцад
 *    наалдахгүй (`isPkgRange`-ийн ⚠️ — Багц 14 руу хуурамч наалдалт).
 * ⚠️ 2026-10-26: ЭХ УНАВАЛ `null`, ӨӨР ЭХ РҮҮ ЧИМЭЭГҮЙ ШИЛЖИХГҮЙ. `PlanInputs`-ийн дүрмээр `undefined` нь
 *    «дараагийн эх» (хадгалсан утга → шугаман L/M) гэсэн үг. Хуваарь уншигдаагүйд блокийн P-г шугаманаар
 *    бодвол итгэл төрүүлэхүйц ХУДАЛ тоо гарна — тиймээс уналт/хуваарьгүй нь `null`, `failed`-д нэрээрээ.
 * ⚠️ Бүх хувь 0–100 (`pct()` 100-аар үржүүлдэггүй); null ≠ 0.
 */
import {
  buildTree, computePlan, monthlySeries, monthEnds, orderPlanRows, saneDate, ubToday,
  type PlanInputs, type PlanNode, type PlanResult, type PlanStoredRow, type PlanTree,
} from './projectPlan';
import {
  CASHFLOW_NEW, CF_MONTH, BUILDING, PARCEL_LEFT, PKG_BY_BAGTS, LAYER_BY_ID,
  bagtsKey, buildingKey, pkgKeyOf, isConstructionNo,
} from './services';
import {
  loadBlockProgress, loadBlockUniverse, loadInfraProgress,
  type BlockProgressMap, type BlockUniverse, type PkgProgress,
} from './blockProgress';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows, planCurve, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { planFields } from './planProgress';
import { countPlanRows, loadPkgPlan, planPctFromMonths, type PkgPlan } from './huvaariObyem';
import { queryFeatures, arcgisPost } from './query';
import { isClearedStatus } from './land';
import { cached, SESSION_TTL_MS } from './live';
import { register } from './dataBus';
import { t as tr } from './i18nCore';
import { subscribeTotals } from './totals';

const DAY = 86_400_000;

/* ══════════════════ 1. Excel мөрүүд (CASHFLOW_NEW) ══════════════════ */

const CF = CASHFLOW_NEW.fields;

/**
 * Хадгалсан мөрийг уншихдаа ЭНЭ талбарууд (`PlanStoredRow`-ийн түлхүүр → хүснэгтийн эх нэр).
 * ⚠️ Хариуны түлхүүрийг ТОМ/ЖИЖИГ ҮСЭГ ҮЛ ЯЛГАН уншина (`attrOf`) — Enterprise-ийн бодит нэр жижиг үсэгтэй
 *    (⚠️ 2026-10-26: толь/хөрвүүлэлт хасагдсан); хуучин том үсэгтэй мөр (кэш · фикстур) ч уншигдана.
 */
const STORED_FIELDS: [keyof PlanStoredRow, string][] = [
  ['objectid', CASHFLOW_NEW.oid],
  ['dd_kod', CF.ddKod],
  ['etseg_kod', CF.parentKod],
  ['tuvshin', CF.level],
  ['uy_shat', CF.phase],
  ['bagts', CF.pkg],
  ['blok', CF.block],
  ['ajil_uilchilgee', CF.detail],
  ['ho_dun_geree', CF.budget],
  ['heseg_ezleh_huvi', CF.wSection],
  ['tusul_ezleh_huvi', CF.wProject],
  ['geree_ehleh', CF.contractStart],
  ['geree_duusah', CF.contractEnd],
  ['gazar_ehleh', CF.landStart],
  ['gazar_duusah', CF.landEnd],
  ['guits_ehleh', CF.contractorStart],
  ['guits_duusah', CF.contractorEnd],
  ['guitsetgel_huvi', CF.progressPct],
  ['cashflow_id', CF_MONTH.id],
];
const TEXT_KEYS = new Set<keyof PlanStoredRow>(['dd_kod', 'etseg_kod', 'uy_shat', 'bagts', 'blok', 'ajil_uilchilgee']);

/** Атрибутыг нэрээр — эхлээд яг, дараа нь том/жижиг үсэг үл ялган */
function attrOf(a: Record<string, unknown>, name: string): unknown {
  if (name in a) return a[name];
  const lo = name.toLowerCase();
  for (const k of Object.keys(a)) if (k.toLowerCase() === lo) return a[k];
  return undefined;
}

/** Тоо (мөрөөр ирсэн тоо ч) эсвэл null — хоосон мөр 0 БИШ */
const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (v: unknown): string | null => {
  const t = v == null ? '' : String(v).trim();
  return t ? t : null;
};

/** Хүснэгтийн мөр → `PlanStoredRow` (цэвэр — тестлэгдэнэ) */
export function toStoredRow(a: Record<string, unknown>): PlanStoredRow {
  const out: Record<string, unknown> = {};
  for (const [k, f] of STORED_FIELDS) {
    const v = attrOf(a, f);
    out[k] = TEXT_KEYS.has(k) ? textOrNull(v) : numOrNull(v);
  }
  return out as PlanStoredRow;
}

/**
 * `dd_kod`-ын БАЙГАЛИЙН эрэмбэ — цифрийн хэсгийг тоогоор («1.10» > «1.9»), бусдыг тэмдэгтээр.
 * ⚠️ 2026-10-26 (тохиролцоо, cf-wave2): dd_kod нь ЭРЭМБЭЛЭГДЭХ код — Excel-ийн дараалал үүгээр сэргэнэ.
 *    Серверийн `orderByFields` нь мөрөөр («1.10» < «1.9») эрэмбэлдэг тул клиентэд ДАХИН эрэмбэлнэ.
 *    Тэнцвэл objectid (тогтвортой). Код давтагдашгүй бол ах дүүсийн дараалал л нөлөөлнө (`sortPlanRows`-ийн ⚠️).
 */
export function compareDdKod(a: string | null | undefined, b: string | null | undefined): number {
  const x = String(a ?? '').match(/\d+|\D+/g) ?? [];
  const y = String(b ?? '').match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const p = x[i], q = y[i];
    const dp = /^\d/.test(p), dq = /^\d/.test(q);
    if (dp && dq) {
      const d = Number(p) - Number(q);
      if (d) return d;
      if (p.length !== q.length) return p.length - q.length; // «01» ба «1»
    } else if (p !== q) return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

/**
 * Мөрүүдийг Excel-ийн дараалалд (цэвэр) — `projectPlan.orderPlanRows`.
 * ⚠️ 2026-10-27: `dd_kod` ДАВХАРДВАЛ (импорт `--kod=excel`) objectid-ийн дараалал (= Excel-ийн дараалал, импорт
 *    хүснэгтийг Excel-ийн дарааллаар бүрэн дахин бичдэг) — тэр үед эцгийн холбоос ч дарааллаас хамаарна.
 */
export function sortPlanRows(rows: readonly PlanStoredRow[]): PlanStoredRow[] {
  return orderPlanRows(rows, compareDdKod);
}

/**
 * Excel-ийн БҮХ мөр — мөнгөний + бүтцийн (`dd_kod IS NOT NULL`), сарын мөр ОРОХГҮЙ.
 * ⚠️ `Cashflow_start IS NULL`-ийг давхар тавина: сарын мөрд dd_kod хоосон байх ёстой ч (импортын дүрэм)
 *    хуулбарласан сарын мөр dd_kod-той ирвэл модонд давхардсан код болж нийлбэрийг хөөргөнө.
 * ⚠️ 0 мөр (импортоос өмнө) нь АЛДАА БИШ — `loadProjectPlan` хоосон төлөв буцаана.
 */
async function fetchPlanRows(): Promise<PlanStoredRow[]> {
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: `${CF.ddKod} IS NOT NULL AND ${CF_MONTH.start} IS NULL`,
    outFields: [...new Set(STORED_FIELDS.map(([, f]) => f))],
    orderBy: `${CF.ddKod} ASC, ${CASHFLOW_NEW.oid} ASC`,
  });
  return sortPlanRows(rows.map((r) => toStoredRow(r as Record<string, unknown>)).filter((r) => r.dd_kod));
}
const loadPlanRows = cached(fetchPlanRows, SESSION_TTL_MS, ['CASHFLOW_NEW']);

/* ══════════════════ 2. Бодит гүйцэтгэл (бөглөх хуудас) ══════════════════ */

/** Бодит гүйцэтгэлийн эх — `blockActualOf`/`pkgActualOf`-ийн оролт */
export type ActualSources = {
  /** Блок бүрийн «Б.» (`compute`) — `null` = ачаалалт унасан */
  blocks: BlockProgressMap | null;
  /** Багц бүрийн блокийн хуваарь (бөглөх хуудасны бүдүүвч) — `null` = унасан */
  universe: BlockUniverse | null;
  /** Блокгүй багцын гүйцэтгэл (`bagtsKey` → `PkgProgress`) — `null` = унасан */
  infra: Map<string, PkgProgress> | null;
};

/** `${bagtsKey}|${блок}` — `blockProgress`-ийн түлхүүр */
export const blockKeyOf = (pkg: string | null | undefined, blok: string): string => buildingKey(pkg ?? '', blok);

/**
 * БЛОКИЙН БОДИТ ГҮЙЦЭТГЭЛ (0–100).
 * ⚠️ 2026-10-26: бөглөх хуудасны хуваарьт БАЙГАА атлаа хэмжилтгүй блок → 0 (`pkgProgressOf`-ийн 2026-10-01-ний
 *    хэрэглэгчийн шийдвэр «тайлагнаагүй блок = 0%»; Excel-д ч эхлээгүй блок 0, төлөв «Эхлээгүй»).
 *    Хуваарьт ч, хэмжилтэд ч байхгүй (хуудасгүй багц, нэр зөрсөн блок) → `undefined` (мэдэхгүй → хадгалсан S → null).
 *    Эх УНАСАН → `null` (0 гэж зурахгүй).
 */
export function blockActualOf(src: ActualSources): NonNullable<PlanInputs['blockActual']> {
  return (pkg, blok) => {
    if (!src.blocks) return null;
    const k = blockKeyOf(pkg, blok);
    const v = src.blocks.get(k);
    if (v && Number.isFinite(v.overall)) return v.overall;
    if (!src.universe) return null;
    const pk = bagtsKey(pkg);
    return src.universe.get(pk)?.includes(k) ? 0 : undefined;
  };
}

/**
 * БЛОКГҮЙ НАВЧНЫ (дэд бүтэц) БОДИТ ГҮЙЦЭТГЭЛ — блокгүй багцын бөглөх хуудас (5.x · 6.x · 7.1 · 10).
 * ⚠️ Блоктой багцын блокгүй навч («Бүгд · Өндөржилтөөс гарах газар шороо») энд ОРОХГҮЙ (`undefined`) — тэр
 *    нь багцын нийт гүйцэтгэл биш, нэг ажлын мөр.
 */
export function pkgActualOf(src: ActualSources): NonNullable<PlanInputs['pkgActual']> {
  return (pkg) => {
    const pk = pkgKeyOf(pkg);
    if (!pk) return undefined;
    if (!src.infra) return null;
    const v = src.infra.get(pk);
    return v && Number.isFinite(v.pct) ? v.pct : undefined;
  };
}

async function fetchActual(): Promise<{ src: ActualSources; failed: string[] }> {
  const [b, u, i] = await Promise.allSettled([loadBlockProgress(), loadBlockUniverse(), loadInfraProgress()]);
  const failed: string[] = [];
  if (b.status === 'rejected') failed.push('blockProgress');
  if (u.status === 'rejected') failed.push('blockUniverse');
  if (i.status === 'rejected') failed.push('infraProgress');
  return {
    src: {
      blocks: b.status === 'fulfilled' ? b.value : null,
      universe: u.status === 'fulfilled' ? u.value : null,
      infra: i.status === 'fulfilled' ? i.value : null,
    },
    failed,
  };
}
const loadActual = cached(fetchActual, SESSION_TTL_MS, ['BAGTS_SHEET'], (v) => !v.failed.length);

/* ══════════════════ 3. Хуваарийн төлөвлөгөөт % (блок тус бүрээр) ══════════════════ */

/** Хуваарийн нэг хуудас — `makeSchedules`-ийн оролт */
export type PlanSheet = {
  /** `Pkg.key` («b42_9f») */
  key: string;
  /** `Pkg.group` («Багц 4-2») — 9F/12F нэг багцад нийлнэ */
  group: string;
  /** Блокийн шошго (`Schema.bld`) */
  bld: readonly string[];
  rows: SheetRow[];
  /**
   * Сарын обьёмын задаргаанаас гарах хувь (0–1) — `planProgress.loadPlanCurve`-ийн `planPct`-тэй ижил үүрэг.
   * `null` → огнооны шугаман (`planAt`).
   */
  monthly?: (des: number | null, blok: string, start: number | null, end: number | null, asOf: number) => number | null;
};

/** Блокийн хуваарь — синхрон асуулт (`blockPlanned`), урьдчилж бодох (`prime`) */
export type BlockSchedules = {
  /** Энэ блок хуваарьтай юу */
  has: (pkg: string | null | undefined, blok: string) => boolean;
  /** Төлөвлөгөөт хувь 0–100 `asOf` өдрөөр; хуваарьгүй бол null */
  at: (pkg: string | null | undefined, blok: string, asOf: number) => number | null;
  /** Олон өдрийг НЭГ дор бодож кэшлэнэ (`planCurve` нэг дуудалтаар) */
  prime: (asOfs: readonly number[]) => void;
  /** Хуваарьтай блокийн түлхүүрүүд (`buildingKey`) */
  keys: () => string[];
};

/**
 * ⚠️ 2026-10-26 (cf-spec): ХУВААРИЙН АЛДААТАЙ ОГНОО → null — эхлэх > дуусах, 2000-аас өмнө / 2100-аас хойш
 *    (Excel-ийн 0 сериал 1899-12-30 г.м.). Хос нь ХАМТ хаягдана: ганц талтай муж хуваарь биш.
 */
const cleanSpan = (s: number | null | undefined, e: number | null | undefined): [number | null, number | null] => {
  const a = saneDate(s), b = saneDate(e);
  return a == null || b == null || b < a ? [null, null] : [a, b];
};

const dayOf = (ms: number) => Math.floor(ms / DAY);

/**
 * Хуудсуудаас блок бүрийн хуваарь (цэвэр — тестлэгдэнэ).
 *
 * ⚠️ 2026-10-26: БЛОК ТУС БҮРИЙН муруй. `planCurve` нь мөрийн блокуудын ДУНДЖИЙГ буцаадаг тул (`avgOut`) блокийн
 *    утгыг гаргахын тулд мөр бүрийн огноог ЗӨВХӨН тэр блокийнхоор (`start[b]`/`end[b]` → нэг баганат) хуулж,
 *    `nBld = 1`-ээр дуудна. Жин (`vol × unit` · `money` · `wD`) блокоос хамаардаггүй тул `computeAll`/«Хуваарь»-тай
 *    ЯГ НЭГ дүрэм (жин D, огнооны өв own/agg, бүлгийн онцгой тохиолдол) — тусдаа томьёо БИЧИХГҮЙ.
 *    Утга нь «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» мөрийнх (`isConstructionNo`) — бэлтгэл ажил ОРОХГҮЙ (`planProgress`-тэй ижил).
 * ⚠️ «Хуваарьгүй» = «Б.» мөрийн доорх аль ч мөрөнд тэр блокийн ЗӨВ огнооны хос алга → `null` (0 БИШ).
 *    `planCurve` огноогүй блокт 0 гаргадаг (`AVERAGE(IF(…="",0,…))`) тул энд тусад нь шалгана.
 * ⚠️ НЭГ ТҮЛХҮҮР ХОЁР ХУУДАСНЫ (Багц 4-2: 9F-ийн F6_x ба 12F-ийн F6_x — `uniqueBlockCounts`-ийн ⚠️) үед
 *    ӨМНӨХ хуудас (PKGS-ийн дараалал, 9F) ДАВАМГАЙЛНА — хуваарьгүй бол дараагийнх.
 */
export function makeSchedules(sheets: readonly PlanSheet[]): BlockSchedules {
  type Entry = { sh: PlanSheet; b: number; bi: number; rowsB: SheetRow[] | null; memo: Map<number, number> };
  const entries = new Map<string, Entry>();
  for (const sh of sheets) {
    const bi = sh.rows.findIndex((r) => isConstructionNo(r.no));
    if (bi < 0) continue; // ⚠️ ачаалагч (`fetchSchedules`) «Б.» мөргүй хуудсыг `failed`-д бүртгэнэ
    /* «Б.» мөрийн доод мөрүүд (гүнээр) — хуваарьтай эсэхийг энд л шалгана */
    let end = bi + 1;
    while (end < sh.rows.length && sh.rows[end].depth > sh.rows[bi].depth) end += 1;
    sh.bld.forEach((label, b) => {
      const k = buildingKey(sh.group, label);
      if (entries.has(k)) return;
      for (let i = bi; i < end; i += 1) {
        const [s, e] = cleanSpan(sh.rows[i].start[b], sh.rows[i].end[b]);
        if (s != null && e != null) {
          entries.set(k, { sh, b, bi, rowsB: null, memo: new Map() });
          return;
        }
      }
    });
  }
  /* ⚠️ 2026-10-26 (хяналтын олдвор): сарын задаргааны callback-д ЦЭВЭРЛЭСЭН биш ЭХ огноо (`raw`) өгнө.
     `cleanSpan` урвуу мужийг [null, null] болгодог тул түүгээр дамжуулбал `planPctFromMonths` огноогүй гэж
     бүтэн сараар хувь гаргаж, урвуу (= хуваарьгүй, 2026-10-08) мөрийг «бүрэн төлөвлөгдсөн» мэт тоолж байв.
     Эх хосоор өгвөл `planPctFromMonths` өөрийн «урвуу → null» дүрмийг `planProgress`-тэй ЯГ адил хэрэгжүүлнэ. */
  const raw = new Map<SheetRow, [number | null, number | null]>();
  const rowsOf = (en: Entry): SheetRow[] => {
    if (!en.rowsB) {
      en.rowsB = en.sh.rows.map((r) => {
        const [s, e] = cleanSpan(r.start[en.b], r.end[en.b]);
        const row = { ...r, start: [s], end: [e] };
        raw.set(row, [r.start[en.b] ?? null, r.end[en.b] ?? null]);
        return row;
      });
    }
    return en.rowsB;
  };
  const run = (en: Entry, asOfs: readonly number[]) => {
    const { sh, b } = en;
    const label = sh.bld[b];
    const pp = sh.monthly
      ? (row: SheetRow, _b: number, asOf: number) => {
        const [s, e] = raw.get(row) ?? [row.start[0], row.end[0]];
        return sh.monthly!(row.des, label, s, e, asOf);
      }
      : undefined;
    const cur = planCurve(rowsOf(en), 1, asOfs, pp);
    asOfs.forEach((t, i) => {
      const v = cur[i]?.[en.bi];
      en.memo.set(dayOf(t), v == null || !Number.isFinite(v) ? 0 : v);
    });
  };
  const entryOf = (pkg: string | null | undefined, blok: string) => entries.get(blockKeyOf(pkg, blok));
  return {
    has: (pkg, blok) => !!entryOf(pkg, blok),
    at: (pkg, blok, asOf) => {
      const en = entryOf(pkg, blok);
      if (!en) return null;
      const d = dayOf(asOf);
      if (!en.memo.has(d)) run(en, [asOf]);
      return en.memo.get(d)! * 100;
    },
    prime: (asOfs) => {
      for (const en of entries.values()) {
        const need = [...new Map(asOfs.filter((t) => !en.memo.has(dayOf(t))).map((t) => [dayOf(t), t])).values()];
        if (need.length) run(en, need);
      }
    },
    keys: () => [...entries.keys()],
  };
}

/** `blockPlanned` callback — хуваарьгүй/уншигдаагүй блок `null` (шугаман руу УНАХГҮЙ — файлын толгойн ⚠️) */
export function blockPlannedOf(sched: BlockSchedules | null): NonNullable<PlanInputs['blockPlanned']> {
  return (pkg, blok, asOf) => (sched ? sched.at(pkg, blok, asOf) : null);
}

/**
 * Сарын задаргааны callback (цэвэр — тестлэгдэнэ) — `planProgress.loadPlanCurve`-ийн `planPct`-тэй ЯГ нэг дүрэм:
 * хоёр огноо `sane` (2000–2100) бол ЭХ хосоороо (урвуу → `planPctFromMonths` null), эс бөгөөс бүтэн сараар.
 */
export function monthlyOf(ob: PkgPlan | null | undefined): PlanSheet['monthly'] {
  if (!ob || !ob.size) return undefined;
  return (des, blok, s, e, asOf) => {
    if (des == null) return null;
    const m = ob.get(des)?.get(blok);
    return m ? planPctFromMonths(m, asOf, saneDate(s) != null && saneDate(e) != null ? { start: s, end: e } : null) : null;
  };
}

/**
 * Хуваарийн хуудсуудыг уншина — `planProgress.loadPlanCurve`-тэй ИЖИЛ уншилт (`planFields`, `persist` кэш,
 * сарын задаргаа `HUVAARI_OBYEM` хоосон бол асуухгүй).
 * ⚠️ Хуудас УНАВАЛ `failed`-д; тэр багцын блокууд хуваарьгүй (null) болно — өөр хуудсаар нөхөхгүй.
 * ⚠️ 2026-10-26 (хяналтын олдвор): ЗӨВХӨН блоктой хуудас (`floors != null`) — блокгүй 16 хуудас блокийн хуваарь
 *    хэзээ ч өгөхгүй атлаа уналт нь «бүрэн биш» гэж худал анхааруулж, кэшийг (`!failed.length`) огт тогтоохгүй байв.
 *    Уншигдсан ч «Б.» мөргүй хуудас = УНАЛТ (`planProgress`-ийн 2026-10-06-ны ⚠️) — чимээгүй null биш.
 */
async function fetchSchedules(): Promise<{ sched: BlockSchedules; failed: string[]; failedGroups: string[] }> {
  const failed: string[] = [];
  const emptyP = countPlanRows().then((c) => c === 0).catch(() => false);
  const blockPkgs = PKGS.filter((p) => p.floors != null);
  const got = await Promise.all(blockPkgs.map(async (pkg, order): Promise<(PlanSheet & { order: number }) | null> => {
    try {
      const sc = await loadSchema(pkg);
      if (!sc.bld.length) return null; // блокгүй хуудас — блокийн хуваарь биш
      const obP: Promise<PkgPlan | null> = emptyP
        .then((empty) => (empty ? null : loadPkgPlan(pkg.key).then((x) => x.plan)))
        .catch(() => null);
      const r = await loadRows(pkg, sc, undefined, planFields(sc), { persist: true });
      const ob = await obP;
      if (!r.rows.some((row) => isConstructionNo(row.no))) {
        failed.push(pkg.key);
        console.warn(`[selbe] төслийн төлөвлөгөө: ${pkg.key} хуудсанд «Б.» мөр алга`);
        return null;
      }
      return { key: pkg.key, group: pkg.group, bld: sc.bld, rows: r.rows, monthly: monthlyOf(ob), order };
    } catch (e) {
      failed.push(pkg.key);
      console.warn(`[selbe] төслийн төлөвлөгөө: ${pkg.key} хуваарь уншигдсангүй`, e);
      return null;
    }
  }));
  const sheets = got.filter((x): x is PlanSheet & { order: number } => !!x).sort((a, b) => a.order - b.order);
  /* ⚠️ Хуудас нь унасан багцын БҮХ блок хуваарьгүй — 12F уншигдаад 9F унасан үед 12F-ийн давхардсан «6/x»
     9F-ийн оронд ялж болохгүй (давамгайллын дүрэм эвдэрнэ) */
  const failedGroups = [...new Set(blockPkgs.filter((p) => failed.includes(p.key)).map((p) => bagtsKey(p.group)))];
  const ok = sheets.filter((s) => !failedGroups.includes(bagtsKey(s.group)));
  return { sched: makeSchedules(ok), failed: failed.map((k) => `schedule:${k}`), failedGroups };
}
const loadSchedules = cached(fetchSchedules, SESSION_TTL_MS, ['BAGTS_SHEET', 'HUVAARI_OBYEM'], (v) => !v.failed.length);

/* ══════════════════ 4. Газар чөлөөлөлт % (нэгж талбарын тоогоор) ══════════════════ */

/*
 * ⚠️ 2026-10-26: ХОЛБООС НЬ ОРОН ЗАЙН. Нэгж талбарын давхаргад (`PARCEL_LEFT`, Enterprise `GA_Selbe_jijuur`)
 *    багц/блокийн талбар АЛГА (`Блок` 31/2,088 мөрд л) — атрибутаар холбох боломжгүй (`Gazar.useZoneLeft`-ийн ⚠️).
 *    «Саад — багцаар»-тай (`parcelOverlap` · `pkgSaad`) ИЖИЛ хүрээ:
 *      · орон сууцны блок → барилгын давхаргын (`BUILDING`, `${BAGTS_AJLUUD}/0`) тэр блокийн footprint;
 *      · блоктой багц (блокгүй мөр) → тэр багцын бүх блокийн footprint;
 *      · дэд бүтцийн/нийгмийн багц → `PKG_BY_BAGTS`-ийн давхаргууд.
 *    Нийт = хүрээтэй ДОТООД огтлолцолтой нэгж талбар (зөвхөн хилээр хүрэлцсэн нь ОРОХГҮЙ — `parcelOverlap`-ийн
 *    2026-10-22-ны дүрэм, `TOL` 0.1 м), чөлөөлсөн = тэдгээрийн «Бүрэн чөлөөлсөн» (`isClearedStatus`).
 * ⚠️ ЯАГААД ӨӨРӨӨ ОГТЛОЛЦУУЛНА ВЭ. `overlapLeftParcels` нь ЗӨВХӨН үлдсэн талбарыг (серверт `parcelLeftWhere`)
 *    тоолдог — НИЙТ тоо түүнээс гарахгүй. Серверт блок бүрээр 2 тоолох асуулга = 226+ хүсэлт; харин бүх нэгж
 *    талбар (2 хуудас) + footprint (1) + багцын давхаргууд (давхарга бүрд 1) татаад клиентэд огтлолцуулах нь хямд.
 * ⚠️ Хүрээ олдоогүй (footprint-гүй блок — `buildingKey`-ийн ⚠️ БАГЦ2|5/8) → `null` («мэдэхгүй»).
 *    Хүрээ байгаа ч нэг ч нэгж талбартай огтлолцоогүй → `EMPTY_AREA_PCT` (чөлөөлөх газар алга = бүрэн).
 */
/** Нэгж талбаргүй хүрээний хувь — чөлөөлөх газар байхгүй тул 100 (⚠️ дээрх) */
export const EMPTY_AREA_PCT = 100;
/** Хүрэлцэл ялгах хүлцэл (м) — `parcelOverlap.GEN_M`-тэй ижил */
const TOL = 0.1;
/** Огтлолцлын проекц — нэгж талбарын давхаргынх (UTM 48N, метр) */
const WKID = 32648;

type Box = [number, number, number, number];
/** Нэг нэгж талбар — цагиргууд (нүхтэй ч) + төлөв */
export type LandParcel = { rings: number[][][]; cleared: boolean };
/** Хүрээний нэг объект — полигон · шугам · цэг */
export type LandShape = { rings?: number[][][]; paths?: number[][][]; pt?: number[] };

const bboxOf = (parts: number[][][]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of parts) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};
const boxHit = (a: Box, b: Box, e: number) => a[0] <= b[2] + e && b[0] <= a[2] + e && a[1] <= b[3] + e && b[1] <= a[3] + e;

/** Цэг цагиргуудын ДОТОР уу — even-odd (нүх зөв) */
function inRings(rings: number[][][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
/** Цэгээс хэрчим хүртэлх зайн квадрат */
function segDist2(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}
/** Цэг дүрсийн ДОТОР, хилээс `TOL`-оос ХОЛ уу — хилээр хүрэлцсэн нь огтлолцол БИШ */
function strictlyIn(rings: number[][][], x: number, y: number): boolean {
  if (!inRings(rings, x, y)) return false;
  const t2 = TOL * TOL;
  for (const r of rings) for (let k = 1; k < r.length; k += 1) {
    if (segDist2(r[k - 1][0], r[k - 1][1], r[k][0], r[k][1], x, y) <= t2) return false;
  }
  return true;
}
/**
 * Хоёр хэрчим ЖИНХЭНЭ огтлолцох уу — төгсгөл бүр нөгөө шугамаас `TOL`-оос хол, эсрэг талд.
 * ⚠️ Хилээр давхцсан (коллинеар) эсвэл оройгоор хүрэлцсэн нь ОРОХГҮЙ — хөрш талбар «саад» болохгүй.
 */
function properCross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const side = (p: number[], q: number[], r: number[]) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (!L) return 0;
    const s = (dx * (r[1] - p[1]) - dy * (r[0] - p[0])) / L; // r-ийн pq шугамаас тэмдэгтэй зай
    return s > TOL ? 1 : s < -TOL ? -1 : 0;
  };
  const o1 = side(a, b, c), o2 = side(a, b, d), o3 = side(c, d, a), o4 = side(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * Нэгж талбарын ДОТООД цэг — хамгийн урт ирмэгийн дундаас дотогш 2·TOL; нимгэн бол хоёр дахь, … эцэст нь null.
 * ⚠️ Төв (centroid) БИШ — хотгор хэлбэрт төв гадна унадаг.
 */
function interiorPoint(rings: number[][][]): number[] | null {
  const edges: [number, number[], number[]][] = [];
  for (const r of rings) for (let k = 1; k < r.length; k += 1) {
    const l = Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]);
    if (l > 4 * TOL) edges.push([l, r[k - 1], r[k]]);
  }
  edges.sort((p, q) => q[0] - p[0]);
  for (const [l, a, b] of edges.slice(0, 6)) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    for (const s of [1, -1]) {
      const x = mx + s * nx * 2 * TOL, y = my + s * ny * 2 * TOL;
      if (strictlyIn(rings, x, y)) return [x, y];
    }
  }
  return null;
}

/** Нэгж талбарын индекс — торон (grid) хайлттай */
export type ParcelIndex = {
  parcels: readonly LandParcel[];
  boxes: Box[];
  inner: (number[] | null)[];
  near: (bb: Box) => number[];
};

const CELL = 100; // м

/** Нэгж талбаруудыг индекслэнэ (цэвэр) */
export function makeParcelIndex(parcels: readonly LandParcel[]): ParcelIndex {
  const boxes = parcels.map((p) => bboxOf(p.rings));
  const inner = parcels.map((p) => interiorPoint(p.rings));
  const grid = new Map<string, number[]>();
  const cells = (bb: Box, fn: (k: string) => void) => {
    const x0 = Math.floor((bb[0] - TOL) / CELL), x1 = Math.floor((bb[2] + TOL) / CELL);
    const y0 = Math.floor((bb[1] - TOL) / CELL), y1 = Math.floor((bb[3] + TOL) / CELL);
    /* ⚠️ Хэт том хүрээ (км-ийн шугам) — торыг гүйлгэхгүй, бүгдийг нэр дэвшүүлнэ */
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 40_000) { fn('*'); return; }
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) fn(`${x},${y}`);
  };
  boxes.forEach((bb, i) => {
    if (!Number.isFinite(bb[0])) return;
    cells(bb, (k) => { const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]); });
  });
  const near = (bb: Box): number[] => {
    const out = new Set<number>();
    let all = false;
    cells(bb, (k) => {
      if (k === '*') { all = true; return; }
      for (const i of grid.get(k) ?? []) out.add(i);
    });
    if (all) boxes.forEach((_, i) => out.add(i));
    return [...out].filter((i) => boxHit(boxes[i], bb, TOL));
  };
  return { parcels, boxes, inner, near };
}

/**
 * Хүрээний объектуудтай ДОТООД огтлолцолтой нэгж талбарын индексүүд (цэвэр — тестлэгдэнэ).
 *   · объектын хэрчим нэгж талбарын ирмэгийг жинхэнэ огтолно, эсвэл объектын орой/хэрчмийн дунд нэгж
 *     талбарын ДОТОР (хилээс TOL-оос хол) — шугам, полигоны хил, бүрэн багтсан объект;
 *   · полигон объект нэгж талбарын дотоод цэгийг агуулна — нэгж талбар объект дотор бүрэн багтсан.
 */
export function parcelHits(idx: ParcelIndex, shapes: readonly LandShape[]): Set<number> {
  const hit = new Set<number>();
  const segHits = (a: number[], b: number[]) => {
    const bb: Box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const i of idx.near(bb)) {
      if (hit.has(i)) continue;
      const rings = idx.parcels[i].rings;
      if (strictlyIn(rings, a[0], a[1]) || strictlyIn(rings, b[0], b[1]) || strictlyIn(rings, mid[0], mid[1])) {
        hit.add(i);
        continue;
      }
      outer: for (const r of rings) for (let k = 1; k < r.length; k += 1) {
        if (properCross(a, b, r[k - 1], r[k])) { hit.add(i); break outer; }
      }
    }
  };
  for (const s of shapes) {
    if (s.pt) {
      const [x, y] = s.pt;
      for (const i of idx.near([x, y, x, y])) if (strictlyIn(idx.parcels[i].rings, x, y)) hit.add(i);
      continue;
    }
    const parts = s.rings ?? s.paths ?? [];
    for (const p of parts) for (let k = 1; k < p.length; k += 1) segHits(p[k - 1], p[k]);
    if (s.rings?.length) {
      const bb = bboxOf(s.rings);
      for (const i of idx.near(bb)) {
        if (hit.has(i)) continue;
        const ip = idx.inner[i];
        if (ip && strictlyIn(s.rings, ip[0], ip[1])) hit.add(i);
      }
    }
  }
  return hit;
}

/** Огтлолцлоос хувь (0–100): чөлөөлсөн ÷ нийт; нэгж талбаргүй бол `EMPTY_AREA_PCT` */
export function landPctOf(idx: ParcelIndex, hits: ReadonlySet<number>): number {
  if (!hits.size) return EMPTY_AREA_PCT;
  let c = 0;
  for (const i of hits) if (idx.parcels[i].cleared) c += 1;
  return (c / hits.size) * 100;
}

/** Газрын навчны түлхүүр — блок бол `buildingKey`, эс бөгөөс `P|<pkgKeyOf>` («» = олон багц → холбохгүй) */
export const landKeyOf = (pkg: string | null | undefined, blok: string | null | undefined): string =>
  (blok ? blockKeyOf(pkg, blok) : `P|${pkgKeyOf(pkg)}`);

/** Газар чөлөөлөлтийн эх — хүрээ ба нэгж талбар */
export type LandSources = {
  /** `null` = нэгж талбар уншигдаагүй */
  parcels: ParcelIndex | null;
  /** `buildingKey` → footprint-ууд; `null` = барилгын давхарга уншигдаагүй */
  footprints: Map<string, LandShape[]> | null;
  /** `bagtsKey` → дэд бүтцийн давхаргын объектууд; давхарга нь унасан багц `failedPkgs`-д */
  infra: Map<string, LandShape[]>;
  failedPkgs: ReadonlySet<string>;
};

/**
 * Excel-ийн багцын түлхүүр → каталогийн (`PKG_BY_BAGTS`) НЭМЭЛТ түлхүүрүүд.
 * ⚠️ 2026-10-26 (хяналтын олдвор): Excel ба каталог зарим багцыг өөрөөр бичдэг тул давхарга олдохгүй/дутуу байв:
 *    · Excel «БАГЦ-7.1» (БАГЦ71) — каталогт Багц 7-ийн хөрсний усны давхаргууд (infra:61/62) «БАГЦ-7» (БАГЦ7);
 *    · Excel «Багц-6.1…6.4» — каталогт цахилгааны шугам (БАГЦ61…64) ба «Багц 6.x · Холбоо» (infra:42–51,
 *      `Багц1_Холбоо`… → БАГЦ1ХОЛБОО…) ТУСДАА түлхүүртэй — холбоогүйгээр хүрээний ХЭСГЭЭР бодогдож байв.
 *    «БАГЦ-7.2»-ийн давхарга каталогт АЛГА — `null` (мэдэхгүй) хэвээр.
 */
const LAND_PKG_ALIAS: Readonly<Record<string, readonly string[]>> = {
  БАГЦ71: ['БАГЦ7'],
  БАГЦ61: ['БАГЦ1ХОЛБОО'],
  БАГЦ62: ['БАГЦ2ХОЛБОО'],
  БАГЦ63: ['БАГЦ3ХОЛБОО'],
  БАГЦ64: ['БАГЦ4ХОЛБОО'],
};

/** Багцын (`pkgKeyOf`) газрын хүрээний давхаргын id-ууд — өөрийнх + `LAND_PKG_ALIAS` */
export function landLayerIdsOf(pk: string): string[] {
  if (!pk) return [];
  return [...new Set([pk, ...(LAND_PKG_ALIAS[pk] ?? [])].flatMap((k) => PKG_BY_BAGTS[k] ?? []))];
}

/**
 * Түлхүүр бүрийн хувь (цэвэр). `null` = мэдэхгүй (хүрээ алга / эх унасан).
 * ⚠️ Дэд бүтцийн давхаргатай багц (`landLayerIdsOf`) давхаргаараа; давхаргагүй бол блоктой багцын footprint-уудаар.
 */
export function landPctMap(src: LandSources, keys: Iterable<string>): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const idx = src.parcels;
  for (const k of new Set(keys)) {
    if (!idx) { out.set(k, null); continue; }
    let shapes: LandShape[] | null = null;
    if (!k.startsWith('P|')) {
      shapes = src.footprints ? src.footprints.get(k) ?? null : null;
    } else {
      const pk = k.slice(2);
      if (!pk || src.failedPkgs.has(pk)) shapes = null;
      else if (landLayerIdsOf(pk).length) shapes = src.infra.get(pk) ?? null;
      else if (src.footprints) {
        const fs: LandShape[] = [];
        for (const [bk, f] of src.footprints) if (bk.slice(0, bk.indexOf('|')) === pk) fs.push(...f);
        shapes = fs.length ? fs : null;
      }
    }
    out.set(k, shapes && shapes.length ? landPctOf(idx, parcelHits(idx, shapes)) : null);
  }
  return out;
}

/** `land` callback — бэлдсэн хувиас; бэлдээгүй түлхүүр `null` */
export function landOf(pcts: ReadonlyMap<string, number | null>): NonNullable<PlanInputs['land']> {
  return (pkg, blok) => pcts.get(landKeyOf(pkg, blok)) ?? null;
}

type Geo = { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number; points?: number[][] };
type Feat = { attributes?: Record<string, unknown>; geometry?: Geo };

/**
 * Давхаргын объектуудыг геометртэй нь ХУУДАСЛАН татна.
 * ⚠️ Эхний хуудас эрэмбэгүй; хязгаарт хүрвэл OID-оор (`objectIdFieldName`) ЭХНЭЭС нь эрэмбэтэй (CLAUDE.md:
 *    эрэмбэгүй offset давхардал/алдагдал). Хоосон хуудас атлаа `exceededTransferLimit` → алдаа (дутуу үр дүн биш).
 */
async function fetchGeoFeats(url: string, where: string, outFields: string[], gen: boolean): Promise<Feat[]> {
  let order: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const out: Feat[] = [];
    let restart = false;
    for (let page = 0; page < 200; page += 1) {
      const params: Record<string, string> = {
        where,
        ...(outFields.length ? { outFields: outFields.join(',') } : {}),
        returnGeometry: 'true',
        outSR: String(WKID),
        ...(gen ? { maxAllowableOffset: String(TOL) } : {}),
        ...(order ? { orderByFields: order, resultOffset: String(out.length) } : {}),
      };
      const j = await arcgisPost<{ features?: Feat[]; exceededTransferLimit?: boolean; objectIdFieldName?: string }>(`${url}/query`, params);
      const fs = j.features ?? [];
      if (!order && j.exceededTransferLimit) {
        order = `${j.objectIdFieldName || 'objectid'} ASC`;
        restart = true;
        break;
      }
      out.push(...fs);
      if (!j.exceededTransferLimit) return out;
      if (!fs.length) break;
    }
    if (!restart) throw new Error(tr('ArcGIS: {0} давхарга бүрэн татагдсангүй', url));
  }
  throw new Error(tr('ArcGIS: {0} давхарга бүрэн татагдсангүй', url));
}

const shapeOf = (g: Geo | undefined): LandShape[] => {
  if (!g) return [];
  if (g.rings?.length) return [{ rings: g.rings }];
  if (g.paths?.length) return [{ paths: g.paths }];
  if (typeof g.x === 'number' && typeof g.y === 'number') return [{ pt: [g.x, g.y] }];
  if (g.points?.length) return g.points.map((p) => ({ pt: p }));
  return [];
};

async function fetchParcels(): Promise<ParcelIndex> {
  const fs = await fetchGeoFeats(PARCEL_LEFT.url, '1=1', [PARCEL_LEFT.fields.status], false);
  const parcels: LandParcel[] = [];
  for (const f of fs) {
    const rings = f.geometry?.rings;
    if (!rings?.length) continue;
    parcels.push({ rings, cleared: isClearedStatus(attrOf(f.attributes ?? {}, PARCEL_LEFT.fields.status)) });
  }
  return makeParcelIndex(parcels);
}
const loadParcels = cached(fetchParcels, SESSION_TTL_MS, ['PARCEL_LEFT']);

/** Барилгын footprint — `buildingKey` → объектууд (нэг түлхүүрт ХОЁР feature байж болно — `buildingKey`-ийн ⚠️) */
async function fetchFootprints(): Promise<Map<string, LandShape[]>> {
  const F = BUILDING.fields;
  const fs = await fetchGeoFeats(BUILDING.url, '1=1', [F.bagts, F.block], true);
  const out = new Map<string, LandShape[]>();
  for (const f of fs) {
    const a = f.attributes ?? {};
    const b = attrOf(a, F.bagts), bl = attrOf(a, F.block);
    if (!bagtsKey(b) || !String(bl ?? '').trim()) continue;
    const k = buildingKey(b, bl);
    const arr = out.get(k) ?? [];
    arr.push(...shapeOf(f.geometry));
    out.set(k, arr);
  }
  return out;
}
const loadFootprints = cached(fetchFootprints, SESSION_TTL_MS, ['BUILDING']);

/**
 * Дэд бүтцийн давхаргын геометр — давхарга бүрд НЭГ удаа.
 * ⚠️ `parcelOverlap.geomCache`-тэй ижил эх (экспортгүй тул хуваалцахгүй); засвар нь `DedButets` →
 *    `dropTotalsCache()` тул `subscribeTotals`-аар хаяна. Амжилтгүй амлалт кэшлэгдэхгүй.
 */
const layerGeomCache = new Map<string, Promise<LandShape[]>>();
/* ⚠️ 2026-10-26 (хяналтын олдвор): газрын мемог (`landMemo`) ХАМТ хаяна — эс бөгөөс нэгж талбар · footprint-ийн
   объект ижил тул `prepareLand` хуучин геометрийн хувийг 5 минут хүртэл буцаана. */
register(() => { layerGeomCache.clear(); landMemo = null; }, []);
subscribeTotals(() => { layerGeomCache.clear(); landMemo = null; });
function layerShapes(id: string): Promise<LandShape[]> {
  const hit = layerGeomCache.get(id);
  if (hit) return hit;
  const d = LAYER_BY_ID[id];
  const p = d?.url
    ? fetchGeoFeats(d.url, d.where || '1=1', [], true).then((fs) => fs.flatMap((f) => shapeOf(f.geometry)))
    : Promise.reject(new Error(tr('ArcGIS: {0} давхарга бүрэн татагдсангүй', id)));
  layerGeomCache.set(id, p);
  p.catch(() => { if (layerGeomCache.get(id) === p) layerGeomCache.delete(id); });
  return p;
}

/** Модны газар чөлөөлөлтийн навчнууд → хэрэгтэй түлхүүрүүд */
export function landKeysOf(tree: PlanTree): string[] {
  const out = new Set<string>();
  for (const n of tree.nodes) if (n.phase === 'gazar' && !n.children.length) out.add(landKeyOf(n.pkg, n.blok));
  return [...out];
}

/**
 * ⚠️ Тооцооны МЕМО — оролтын ОБЪЕКТЫН ИЖИЛ БАЙДЛААР (кэшлэгдсэн нэгж талбар · footprint · түлхүүрүүд) түлхүүрлэнэ.
 *    Эх кэшүүд (`PARCEL_LEFT` · `BUILDING`) хаягдахад шинэ объект ирж мемо өөрөө хуучирна; дэд бүтцийн давхаргын
 *    геометр (`subscribeTotals` · `register`) объектын түлхүүрт ОРОХГҮЙ тул тэдгээрийн callback мемог шууд хаяна.
 */
let landMemo: { parcels: ParcelIndex | null; foot: Map<string, LandShape[]> | null; sig: string; res: Promise<{ pcts: Map<string, number | null>; failed: string[] }> } | null = null;

async function prepareLand(keys: string[]): Promise<{ pcts: Map<string, number | null>; failed: string[] }> {
  if (!keys.length) return { pcts: new Map(), failed: [] };
  const [pr, fr] = await Promise.allSettled([loadParcels(), loadFootprints()]);
  const parcels = pr.status === 'fulfilled' ? pr.value : null;
  const foot = fr.status === 'fulfilled' ? fr.value : null;
  const sig = keys.join(';');
  if (landMemo && landMemo.parcels === parcels && landMemo.foot === foot && landMemo.sig === sig && parcels && foot) return landMemo.res;
  const res = (async () => {
    const failed: string[] = [];
    if (!parcels) failed.push('parcels');
    if (!foot) failed.push('footprints');
    const infra = new Map<string, LandShape[]>();
    const failedPkgs = new Set<string>();
    if (parcels) {
      const pks = [...new Set(keys.filter((k) => k.startsWith('P|')).map((k) => k.slice(2)))].filter((pk) => landLayerIdsOf(pk).length);
      await Promise.all(pks.map(async (pk) => {
        const got = await Promise.allSettled(landLayerIdsOf(pk).map(layerShapes));
        /* ⚠️ Нэг давхарга нь унасан багц ДУТУУ хүрээгээр бодогдохгүй — `null` (хагас тоо «чөлөөлөгдсөн» мэт) */
        if (got.some((g) => g.status === 'rejected')) { failedPkgs.add(pk); failed.push(`land:${pk}`); return; }
        infra.set(pk, got.flatMap((g) => (g.status === 'fulfilled' ? g.value : [])));
      }));
    }
    return { pcts: landPctMap({ parcels, footprints: foot, infra, failedPkgs }, keys), failed };
  })();
  landMemo = { parcels, foot, sig, res };
  res.then((r) => { if (r.failed.length && landMemo?.res === res) landMemo = null; }, () => { if (landMemo?.res === res) landMemo = null; });
  return res;
}

/* ══════════════════ 5. Нэгтгэл — ачаалагч ══════════════════ */

/** Оролтуудыг нэгтгэнэ (цэвэр) */
export function makeInputs(src: {
  actual: ActualSources;
  sched: BlockSchedules | null;
  land: ReadonlyMap<string, number | null>;
}): PlanInputs {
  return {
    blockActual: blockActualOf(src.actual),
    pkgActual: pkgActualOf(src.actual),
    blockPlanned: blockPlannedOf(src.sched),
    land: landOf(src.land),
  };
}

/**
 * Сарын тэнхлэг — төслийн огнооны мужаас (H/J/L MIN … I/K/M MAX, үндсэн мөрийн бодогдсон утга).
 * Огноо огт алга бол хоосон.
 */
export function planMonths(res: PlanResult): number[] {
  const v = res.values.get(res.tree.root);
  if (!v) return [];
  const lo = [v.H, v.J, v.L].filter((x): x is number => x != null);
  const hi = [v.I, v.K, v.M].filter((x): x is number => x != null);
  if (!lo.length || !hi.length) return [];
  const from = Math.min(...lo), to = Math.max(...hi);
  return to < from ? [] : monthEnds(from, to);
}

export type ProjectPlan = {
  /** Excel мөр алга (импортоос өмнө) — харагдац «өгөгдөл импортлогдоогүй» гэж харуулна, алдаа БИШ */
  empty: boolean;
  tree: PlanTree;
  result: PlanResult;
  inputs: PlanInputs;
  /** Сарын тэнхлэг (сар бүрийн сүүлийн өдөр, ms) */
  months: number[];
  /** Мөр бүрийн сарын хуримтлагдсан төлөвлөгөөт % (0–100) — `months`-той ижил урт */
  monthly: Map<PlanNode, (number | null)[]>;
  /**
   * УНШИГДААГҮЙ эх сурвалжууд (`blockProgress` · `schedule:b1_9f` · `parcels` · `land:БАГЦ161` …).
   * Хоосон биш бол тэр эхийн мөрүүд `null` — дэлгэц «бүрэн биш»-ийг ил харуулна.
   */
  failed: string[];
};

/** Хоосон төлөв (цэвэр) */
export function emptyPlan(today: number = ubToday()): ProjectPlan {
  const tree = buildTree([]);
  return { empty: true, tree, result: computePlan(tree, {}, today), inputs: {}, months: [], monthly: new Map(), failed: [] };
}

/**
 * Мөр + оролтоос бүтэн тооцоо (цэвэр, `sched`-ийг өдрүүдээр урьдчилж бодно).
 * ⚠️ P/Q/R = өнөөдөр · +7 · −7 хоног (`computePlan`), сарын цуваа нь сар бүрийн сүүлийн өдөр — хуваарийг
 *    эдгээр өдрөөр НЭГ дуудалтаар бодно (блок бүрд `planCurve` нэг удаа).
 */
export function assemblePlan(
  rows: readonly PlanStoredRow[],
  src: { actual: ActualSources; sched: BlockSchedules | null; land: ReadonlyMap<string, number | null> },
  today: number = ubToday(),
  failed: string[] = [],
): ProjectPlan {
  if (!rows.length) return { ...emptyPlan(today), failed };
  const tree = buildTree(rows);
  const inputs = makeInputs(src);
  src.sched?.prime([today, today + 7 * DAY, today - 7 * DAY]);
  const result = computePlan(tree, inputs, today);
  const months = planMonths(result);
  src.sched?.prime(months);
  const monthly = months.length ? monthlySeries(result, months, inputs) : new Map<PlanNode, (number | null)[]>();
  return { empty: false, tree, result, inputs, months, monthly, failed };
}

/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ — харагдацуудын нэг эх.
 *
 * ⚠️ Хэсэг бүр өөрийн кэштэй (`cached`, 5 мин, автобусны түлхүүрээр): CASHFLOW_NEW · BAGTS_SHEET ·
 *    HUVAARI_OBYEM · PARCEL_LEFT · BUILDING. Тооцоо (`computePlan`) дуудалт бүрд — хурдан (~905 мөр).
 * ⚠️ Excel мөр алга → `empty: true` (бусад эхийг ОГТ татахгүй). CASHFLOW_NEW унасан → шидэнэ (энэ бол
 *    харагдацын үндэс — хоосон гэж худал хэлэхгүй). Бусад эх унавал `failed`-д, тэр мөрүүд `null`.
 * @param today ms — тестэд/«өдрөөр харах»-д тогтмол өгнө
 */
export async function loadProjectPlan(today: number = ubToday()): Promise<ProjectPlan> {
  const rows = await loadPlanRows();
  if (!rows.length) return emptyPlan(today);
  const keys = landKeysOf(buildTree(rows));
  const [a, s, l] = await Promise.allSettled([loadActual(), loadSchedules(), prepareLand(keys)]);
  const failed: string[] = [];
  const actual: ActualSources = a.status === 'fulfilled'
    ? a.value.src
    : { blocks: null, universe: null, infra: null };
  if (a.status === 'fulfilled') failed.push(...a.value.failed); else failed.push('actual');
  const sched = s.status === 'fulfilled' ? s.value.sched : null;
  if (s.status === 'fulfilled') failed.push(...s.value.failed); else failed.push('schedule');
  const land = l.status === 'fulfilled' ? l.value.pcts : new Map<string, number | null>();
  if (l.status === 'fulfilled') failed.push(...l.value.failed); else failed.push('land');
  return assemblePlan(rows, { actual, sched, land }, today, failed);
}

/* ══════════════════ 5. Гэрээний АМЬД гүйцэтгэл (дашбоард · ТУХ · Нэгтгэл) ══════════════════ */

/** Нэг гэрээний (cashflow_id) амьд гүйцэтгэл — 0–100, хэмжилтгүй null (0 БИШ) */
export type LiveProgress = {
  /** Мөрийн өөрийн S: барилга угсралт = гүйцэтгэл бөглөх (блок/багц), газар = газар чөлөөлөлт, бусад = порталд засагдсан утга (дэд мөртэй бол Σ F·X) */
  S: number | null;
  /** Үе шат бүрийн хувь — түлхүүр `CASHFLOW_NEW.stages`-ийн талбарын нэр; тухайн багцын тэр үе шатны ДЭЭД мөрийн S, `build` = өөрийн S */
  stages: Record<string, number | null>;
};

/**
 * cashflow_id → амьд гүйцэтгэл — «Төсөл төлөвлөгөө биелэлт»-ийн S (`computePlan`), цэвэр (тестлэгдэнэ).
 * ⚠️ 2026-10-27 (хэрэглэгч: «cashflow-ийн явц үргэлж системээс амьд уншигддаг болго, Excel-ийн тоо хэрэггүй»):
 *    дашбоард (`gdash.loadGdashCf`) · ТУХ (`tuhData.progressOf`) · Нэгтгэл (`negtgel.loadCfStages`) гэрээний явц ба
 *    үе шатны хувийг ЭНДЭЭС авна. Хүснэгтийн `guitsetgel_huvi` · `tezu` · `ajliin_zurag_tusul` · `gazar_chuluulult` ·
 *    `zuwshuurul` · `songon_shalgaruulalt` (Excel-ийн импортын агшин) тэнд УНШИГДАХГҮЙ — `guitsetgel_huvi` нь зөвхөн
 *    computePlan-ийн гар оролт (ТЭЗҮ · зураг төсөл · зөвшөөрөл · сонгон). Хэсэгт/төсөлд эзлэх (F · G) хэвээр хадгалсан жин.
 * ⚠️ Үе шатын мөрийг багцаар `bagtsKey`-ээр (диапазон мөр ч өөртэйгөө таарна) — pre-order тул хамгийн гүехэн нь эхэнд.
 */
export function liveProgressOf(plan: ProjectPlan): Map<number, LiveProgress> {
  const ST = CASHFLOW_NEW.stages;
  const PHASE_FIELD: [string, string][] = [
    ['tezu', ST.tezu], ['zurag', ST.design], ['gazar', ST.land], ['zovshoorol', ST.permit], ['songon', ST.tender],
  ];
  const sOf = (n: PlanNode): number | null => {
    const v = plan.result.values.get(n)?.S;
    return v == null || !Number.isFinite(v) ? null : v;
  };
  const top = new Map<string, PlanNode>();
  for (const n of plan.tree.nodes) {
    const pk = bagtsKey(n.pkg);
    if (!pk) continue;
    const k = `${n.phase}|${pk}`;
    const cur = top.get(k);
    if (!cur || n.depth < cur.depth) top.set(k, n);
  }
  const out = new Map<number, LiveProgress>();
  for (const n of plan.tree.nodes) {
    const id = n.row?.cashflow_id;
    if (id == null || out.has(id)) continue;
    const S = sOf(n);
    const pk = bagtsKey(n.pkg);
    const stages: Record<string, number | null> = { [ST.build]: S };
    for (const [ph, f] of PHASE_FIELD) {
      const t = pk ? top.get(`${ph}|${pk}`) : undefined;
      stages[f] = t ? sOf(t) : null;
    }
    out.set(id, { S, stages });
  }
  return out;
}

/** Амьд гүйцэтгэл — `loadProjectPlan` (хэсгүүд нь сешний кэштэй, `BAGTS_SHEET` · `CASHFLOW_NEW` invalidate-аар шинэчлэгдэнэ) */
export const loadLiveProgress = (): Promise<Map<number, LiveProgress>> => loadProjectPlan().then(liveProgressOf);

/* Тест/дотоод хэрэглээнд */
export const __test = { cleanSpan, interiorPoint, properCross, strictlyIn, attrOf };

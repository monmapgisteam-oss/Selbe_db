/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ · БИЕЛЭЛТ — Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудасны
 * (261007 V3) ТОМЬЁОНЫ ЦЭВЭР ХӨДӨЛГҮҮР. React-гүй, сүлжээгүй — тестлэгдэнэ.
 *
 * Оролт: `CASHFLOW_NEW` хүснэгтэд хадгалсан Excel-ийн мөрүүд (dd_kod · etseg_kod ·
 * тогтмол нүднүүд) + амьд утгууд (бөглөх хуудасны блокийн гүйцэтгэл, Хуваарийн
 * төлөвлөгөөт %, газар чөлөөлөлтийн %, өнөөдөр). Гаралт: мөр бүрийн E…W.
 *
 *   E  Урьдчилсан төсөвт өртөг   — хадгалсан, эс бөгөөс хүүхдүүдийн НИЙЛБЭР
 *   F  Хэсэгт эзлэх (0–100)      — хадгалсан › G/G_эцэг › E/E_эцэг › Барилга угсралтын хосын F
 *   G  Төсөлд эзлэх (0–100)      — хадгалсан › F × G_эцэг
 *   H/I · J/K · L/M огноо         — хадгалсан, эс бөгөөс үр удмын MIN эхлэх / MAX дуусах
 *   N/O/P/Q/R/S (0–100)          — навч: дүрмээр (доор), эцэг: Σ F_хүүхэд × X_хүүхэд
 *   T/U/V/W (0–100)              — S/N · S/O · S/P · S/R  (хуваарь 0 → 0)
 */
import { spanFrac } from './plan';
import { t as tr } from '@/lib/i18nCore';

/* ══════════════════ Төрлүүд ══════════════════ */

/** Хувийн 6 багана (Excel N…S) */
export type Metric = 'N' | 'O' | 'P' | 'Q' | 'R' | 'S';
export const METRICS: readonly Metric[] = ['N', 'O', 'P', 'Q', 'R', 'S'];

/** L0 үе шат — `uy_shat`-аас таньна */
export type PhaseKind =
  | 'tezu' | 'zurag' | 'gazar' | 'zovshoorol' | 'songon'
  | 'barilga' | 'huleelgeh' | 'zugshruulelt' | 'other';

/** Хүснэгтэд хадгалсан нэг Excel мөр (жижиг үсэгтэй талбар; огноо = ms epoch) */
export type PlanStoredRow = {
  objectid?: number | null;
  dd_kod: string | null;
  etseg_kod?: string | null;
  tuvshin?: number | null;
  uy_shat?: string | null;
  bagts?: string | null;
  blok?: string | null;
  ajil_uilchilgee?: string | null;
  /** E — Урьдчилсан төсөвт өртөг (₮) */
  ho_dun_geree?: number | null;
  /** F — БУТАРХАЙ 0–1 (Excel-ийнхээр; `STORED_WEIGHT`) */
  heseg_ezleh_huvi?: number | null;
  /** G — БУТАРХАЙ 0–1 (Excel-ийнхээр; `STORED_WEIGHT`) */
  tusul_ezleh_huvi?: number | null;
  /** Зөвхөн санах ойд (2026-11-04): хүснэгтэд багана алга — `guits_*` эсвэл Хуваарийн «Гэрээ» огноо */
  geree_ehleh?: number | null;
  geree_duusah?: number | null;
  gazar_ehleh?: number | null;
  gazar_duusah?: number | null;
  guits_ehleh?: number | null;
  guits_duusah?: number | null;
  /** S — 0–100 (зөвхөн ТЭЗҮ · Зураг төсөл · Зөвшөөрөл · Сонгон шалгаруулалтын навчинд) */
  guitsetgel_huvi?: number | null;
  cashflow_id?: number | null;
  /** Гэрээ байгуулсан огноо — L2 «Сонгон шалгаруулалт (гэрээ байгуулсан)» */
  geree_ognoo?: number | null;
  /** Захирамжийн огноо ба дугаар («А/736») */
  zahiramj_ognoo?: number | null;
  zahiramj_dugaar?: string | null;
  /** Ашиглалтад оруулах огноо */
  ashiglalt_ognoo?: number | null;
  /** Мөр үүсгэсэн агшин (сервер) — импортын мөрийг гараар нэмсэнээс ялгана (`planEdit.isManualRow`) */
  created_date?: number | null;
  /** Захирамжийн дүнгийн эх үүсвэр (₮) — `CASHFLOW_NEW.sources`; зөвхөн өөрийн мөрд харагдана, нийлбэрлэхгүй (2026-11-03) */
  zahiramj_unet_tsaas?: number | null;
  zahiramj_borluulalt_dun?: number | null;
  zahiramj_niislel_tusuv?: number | null;
  zahiramj_nzd_nuuts?: number | null;
  /** Олгосон дүн · урьдчилгаа (₮) — IPC-ээс систем бичнэ */
  /** Гэрээний дүн — урьдчилсан төсвөөс (`ho_dun_geree`) тусдаа */
  geree_dun?: number | null;
  olgoson_dun?: number | null;
  urdchilgaa_dun?: number | null;
  /** Зөвхөн харуулах баганууд (2026-11-04, хэрэглэгч: «ил гарга») — тооцоонд оролцохгүй */
  ho_dun_zahiramj?: number | null;
  zahiramj_unet_tsaas_huvi?: number | null;
  tezu?: number | null;
  ajliin_zurag_tusul?: number | null;
  gazar_chuluulult?: number | null;
  zuwshuurul?: number | null;
  songon_shalgaruulalt?: number | null;
  geree_dugaar?: string | null;
  guitsetgegch?: string | null;
  zahialagch_hynalt_baig?: string | null;
  ho_dungiin_tailbar?: string | null;
  sar_mongo_eh?: string | null;
  bagts_tuvshin1?: string | null;
  ajil_tuvshin1?: string | null;
  bagts_tuvshin2?: string | null;
  ajil_tuvshin2?: string | null;
  bagts_tuvshin3?: string | null;
  ajil_tuvshin3?: string | null;
};

/** Эх үүсвэрийн талбарууд — `CASHFLOW_NEW.sources`-ийн дараалал (үнэт цаас · төслийн орлого · нийслэлийн төсөв · НЗД нөөц) */
export const SOURCE_KEYS = ['zahiramj_unet_tsaas', 'zahiramj_borluulalt_dun', 'zahiramj_niislel_tusuv', 'zahiramj_nzd_nuuts'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];
export type SourceSums = Record<SourceKey, number | null>;

/**
 * ЭХ ҮҮСВЭР (2026-11-03, хэрэглэгч) — мөр бүр, эцэг/бүлгийн мөр, Төслийн нийт бүгд АМЬД нийлбэр: модоор (өөрийнх
 * бичигдсэн мөр › хүүхдүүдийн нийлбэр, «Нийслэл төсөв» хэсэг орохгүй — E-тэй ижил дүрэм); хүүхэд бүгд хоосон бол null.
 * Төслийн нийтийн нийлбэр = төслийн нийт дүн байхаар өгөгдлийг тааруулсан: «Газар чөлөөлөлт» (Д/Д 3) мөрөнд эх үүсвэр
 * бичигдээгүй дүнг 4-т тэнцүү бичсэн (нэг удаагийн өгөгдлийн засвар).
 */
export function sourceSums(tree: PlanTree): Map<PlanNode, SourceSums> {
  const roll = new Map<PlanNode, SourceSums>();
  for (const n of [...tree.nodes].reverse().concat(tree.root)) {
    const r = n.row;
    const own = !!r && SOURCE_KEYS.some((k) => num(r[k]) != null);
    const v = {} as SourceSums;
    for (const k of SOURCE_KEYS) {
      if (own) { v[k] = num(r![k]); continue; }
      let s = 0, any = false;
      for (const c of n.children) {
        if (c.outside) continue;
        const x = roll.get(c)?.[k];
        if (x != null) { s += x; any = true; }
      }
      v[k] = any ? s : null;
    }
    roll.set(n, v);
  }
  return roll;
}

export type PlanNode = {
  /** `dd_kod` (үндэс бол `''`) */
  code: string;
  /** Эх мөр — синтетик үндэст `null` */
  row: PlanStoredRow | null;
  parent: PlanNode | null;
  children: PlanNode[];
  depth: number;
  /** Оролтын дараалал — модны урьдчилсан (pre-order) байрлал */
  index: number;
  phase: PhaseKind;
  /**
   * Барилга угсралт үе шатын L1 хэсэг: «Бэлтгэл ажил» (`beltgel`) эсвэл
   * «Барилга угсралт ажил» (`barilga`). Бусад үе шатад `null`.
   */
  sub: 'beltgel' | 'barilga' | null;
  /** Багц — өөрийн `bagts`, блок мөрөнд өвөг мөрийнх */
  pkg: string | null;
  /** Блок («5/1») — блокийн мөрөнд л */
  blok: string | null;
  /** «Нийслэл төсөв» — эцгийн E ба N…S нийлбэрт ОРОХГҮЙ */
  outside: boolean;
  /**
   * F-ийн ХОС — Барилга угсралт ажлын (төсөвтэй) хэсгийн ижил багц/блокийн мөр.
   * Excel: F86 = F721. Төсөвгүй хэсгүүдийн (Газар чөлөөлөлт, Зөвшөөрөл, Сонгон, Бэлтгэл…)
   * мөр жингээ эндээс хуулна.
   */
  twin: PlanNode | null;
};

export type PlanTree = {
  root: PlanNode;
  /** Үндэсгүй, урьдчилсан дарааллаар */
  nodes: PlanNode[];
  byCode: Map<string, PlanNode>;
  /** Бүтцийн анхааруулга (давхардсан код, олдоогүй эцэг, хосгүй мөр) */
  issues: string[];
};

export type PlanValues = {
  E: number | null;
  /**
   * ОНООСОН ТӨСӨВ (2026-11-03) — өөрийн E, байхгүй бол эцгийн оноосон төсөв × Хэсэгт эзлэх. Зөвхөн харуулах:
   * нийлбэр, хувь, тайланд ОРОХГҮЙ (E хэвээр).
   */
  EA: number | null;
  /** 0–100 */
  F: number | null;
  /** 0–100 */
  G: number | null;
  H: number | null; I: number | null;
  J: number | null; K: number | null;
  L: number | null; M: number | null;
  N: number | null; O: number | null; P: number | null;
  Q: number | null; R: number | null; S: number | null;
  T: number | null; U: number | null; V: number | null; W: number | null;
  /** Блокийн төлөв (S-ээр) — зөвхөн блокийн мөрөнд */
  status: BlockStatus | null;
};

/** Блокийн төлөв — 0 → Эхлээгүй, (0,100) → Эхэлсэн, 100 → Дууссан */
export type BlockStatus = 'notStarted' | 'started' | 'done';

/**
 * Амьд оролтууд. Бүх хувь 0–100. Callback `undefined` буцаавал «мэдээлэл алга»
 * гэж үзээд дараагийн эх рүү (хадгалсан утга → шугаман) шилжинэ; `null` буцаавал
 * «мэдээлэлгүй» гэж ТОГТООНО.
 */
export type PlanInputs = {
  /** Барилга угсралт ажлын блокийн бодит гүйцэтгэл (бөглөх хуудас · blockProgress) */
  blockActual?: (pkg: string | null, blok: string, node: PlanNode) => number | null | undefined;
  /** Барилга угсралт ажлын блокгүй навчны (дэд бүтэц) бодит гүйцэтгэл */
  pkgActual?: (pkg: string | null, node: PlanNode) => number | null | undefined;
  /** Блокийн гүйцэтгэгчийн төлөвлөгөөт хувь `asOf` өдрөөр (Хуваарь · planProgress) */
  blockPlanned?: (pkg: string | null, blok: string, asOf: number, node: PlanNode) => number | null | undefined;
  /**
   * БЛОКГҮЙ барилга угсралтын навчны төлөвлөгөөт хувь (2026-10-29) — гүйцэтгэлийн хүснэгтийн Хуваариас.
   * `null` = гүйцэтгэлийн хүснэгтгүй багц эсвэл хуваарь бөглөөгүй (гэрээний огноо руу УНАХГҮЙ); `undefined` = хуучин дүрэм.
   */
  pkgPlanned?: (pkg: string | null, asOf: number, node: PlanNode) => number | null | undefined;
  /**
   * БЛОКГҮЙ барилга угсралтын навчны гүйцэтгэгчийн муж (L/M) — гүйцэтгэлийн хүснэгтийн Хуваариас (2026-10-29).
   * `null` = хүснэгтгүй/хуваарьгүй тул ХООСОН (хадгалсан `guits_*`-ийг ч үл тоомсорлоно); `undefined` = хадгалсан утга.
   */
  pkgSpan?: (pkg: string | null, node: PlanNode) => [number, number] | null | undefined;
  /** Газар чөлөөлөлт үе шатын навчны % (нэгж талбарын ТООГООР), `blok` нь null байж болно */
  land?: (pkg: string | null, blok: string | null, node: PlanNode) => number | null | undefined;
  /**
   * ДАРАХ утга — мөрийн хэмжүүрийг шууд өгнө (Excel-тэй тулгах шалгалт, гар оруулга).
   * Объектод түлхүүр БАЙВАЛ (утга нь null ч) тэр нь ЭЦСИЙН — хүүхдээс бодохгүй.
   */
  override?: (node: PlanNode) => Partial<Record<Metric, number | null>> | undefined;
  /**
   * `true` = Excel-ийн хадгалсан жинг ЯГ мөрдөнө (тулгалтын тест). Анхдагч (`false`) — бүрэн автомат: Хэсэгт эзлэх
   * төсвөөр (`budgetShare`), Төсөлд эзлэх = F × G_эцэг (2026-11-03).
   */
  excelWeights?: boolean;
};

/* ══════════════════ Жижиг туслахууд ══════════════════ */

const DAY = 86_400_000;
/** Улаанбаатарын цагийн бүс (UTC+8, зуны цаггүй) */
const UB_OFFSET_MS = 8 * 3_600_000;

/**
 * ӨНӨӨДӨР — Улаанбаатарын ХУАНЛИЙН өдөр, тэр өдрийн UTC шөнө дунд (ms).
 */
export const ubToday = (now: number = Date.now()): number =>
  Math.floor((now + UB_OFFSET_MS) / DAY) * DAY;
const OK_LO = Date.UTC(2000, 0, 1);
const OK_HI = Date.UTC(2100, 0, 1);

/** Зөв огноо (2000–2100) эсвэл null — Excel-ийн 0 сериал, «11/30/207» зэргийг хаяна */
export const saneDate = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= OK_LO && v <= OK_HI ? v : null;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Хадгалсан жингийн (F, G) хуваагч — 1 = бутархай (0–1). Импорт 0–100 болговол 100 болгоно.
 */
export const STORED_WEIGHT = 1;
const wt = (v: unknown): number | null => { const x = num(v); return x == null ? null : x / STORED_WEIGHT; };

/** 0–100 → 0–1 (null хэвээр) */
const frac = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : v / 100;
/** 0–1 → 0–100 */
const hund = (v: number | null): number | null => (v == null ? null : v * 100);

/**
 * ШУГАМАН ТӨЛӨВЛӨГӨӨТ ХУВЬ (0–100) — `start`…`end` хооронд жигд, `date` өдрийн
 * төгсгөлөөр. Хоёр захыг оруулсан муж (`plan.spanFrac`-ийн конвенц).
 */
export function linearPlanned(start: number | null | undefined, end: number | null | undefined, date: number): number | null {
  const s = saneDate(start);
  const e = saneDate(end);
  if (s == null || e == null || e < s) return null;
  return spanFrac({ start: s, end: e }, date) * 100;
}

/** Блокийн төлөв: 0 → Эхлээгүй, >0 → Эхэлсэн, 100 → Дууссан. null → null. */
export function blockStatus(pct: number | null | undefined): BlockStatus | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= 100 - 1e-9) return 'done';
  if (pct <= 1e-9) return 'notStarted';
  return 'started';
}

/** Биелэлт = гүйцэтгэл / төлөвлөгөө (0–100). Excel: IF(план=0, 0, S/план). */
const ratio = (s: number | null, plan: number | null): number | null =>
  s == null || plan == null ? null : plan === 0 ? 0 : (s / plan) * 100;

const PHASE_RX: [RegExp, PhaseKind][] = [
  [/ТЭЗҮ/i, 'tezu'],
  [/зураг/i, 'zurag'],
  [/газар\s*чөлөөл/i, 'gazar'],
  [/зөвшөөрөл/i, 'zovshoorol'],
  [/сонгон/i, 'songon'],
  [/барилга\s*угсралт/i, 'barilga'],
  [/хүлээлгэн/i, 'huleelgeh'],
  [/зүгшрүүл/i, 'zugshruulelt'],
];
/** `uy_shat` (эсвэл L0 мөрийн нэр) → үе шатын төрөл */
export function phaseKind(name: string | null | undefined): PhaseKind {
  const s = String(name ?? '');
  for (const [rx, k] of PHASE_RX) if (rx.test(s)) return k;
  return 'other';
}

/** Блокийн код мөн үү («5/1», «29/3», «6/8») */
export const isBlockCode = (v: unknown): boolean => /^\s*\d+\s*\/\s*\d+\s*$/.test(String(v ?? ''));

const OUTSIDE_RX = /нийслэл\s*төсөв/i;

/** Тааруулах түлхүүр — зай, зураас, цэгийг хаяж том үсгээр (`bagtsKey`-тэй ижил санаа) */
const keyC = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z/]/g, '');
const keyD = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * НЭМСЭН АЖИЛ (2026-11-03, «ТЭЗҮ · Ажлын зураг төсөл» хуудасны «+ Ажил нэмэх») — Ажлын зураг төсөл үе шатын,
 * ЭЦЭГТЭЙГЭЭ ИЖИЛ БАГЦТАЙ, мөнгөгүй (`cashflow_id` хоосон) мөр. Хүснэгтийн бусад мөр энэ үе шатад эцгээсээ өөр
 * багцтай тул андуурагдахгүй. Жин нь хадгалсан «Хэсэгт эзлэх»; төсөв нь эцгийн төсвөөс хувиар оноогдоно (`EA`).
 */
export function isAddedWork(n: PlanNode): boolean {
  const p = n.parent?.row;
  if (n.phase !== 'zurag' || !n.row || !p || n.row.cashflow_id != null) return false;
  const b = keyC(n.row.bagts);
  return !!b && b === keyC(p.bagts);
}

/** «Гэрээлсэн дүн» бичигдсэн мөр мөн үү */
const isContractNote = (r: PlanStoredRow | null | undefined): boolean =>
  String(r?.ho_dungiin_tailbar ?? '').replace(/\s+/g, ' ').trim() === 'Гэрээлсэн дүн';

export type MoneySums = { paid: number | null; advance: number | null; contract: number | null };

/**
 * МӨР БҮРИЙН НИЙЛБЭР (2026-11-04) — олгосон дүн, урьдчилгаа, гэрээний дүн: өөрийн утга + доод мөрүүд («Нийслэл төсөв» орохгүй).
 * ТТБ-ийн багана, бүх хуудасны хувь энэ нэг тооцооноос уншина. Үндэс мөр = төслийн нийт.
 */
export function moneySums(tree: PlanTree): Map<PlanNode, MoneySums> {
  const out = new Map<PlanNode, MoneySums>();
  const add = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);
  const go = (n: PlanNode): MoneySums => {
    const r = n.row;
    let s: MoneySums = {
      paid: num(r?.olgoson_dun),
      advance: num(r?.urdchilgaa_dun),
      contract: isContractNote(r) ? num(r?.geree_dun) : null,
    };
    for (const c of n.children) {
      const k = go(c);
      if (c.outside) continue;
      s = { paid: add(s.paid, k.paid), advance: add(s.advance, k.advance), contract: isContractNote(r) ? s.contract : add(s.contract, k.contract) };
    }
    out.set(n, s);
    return s;
  };
  go(tree.root);
  return out;
}

/**
 * БАГЦЫН ГЭРЭЭНИЙ МӨР (2026-11-04) — мөнгөний мөр, өөрийн `ho_dun_geree` > 0, доор нь мөнгөгүй дүнтэй мөрүүд (блок, газар шорооны
 * ажил). Гэрээний дүн энэ мөрөнд л засагдана; дэд мөрүүд нь дүнгээ хувиар дагана (`hoSync.planBlockBudgets`).
 */
export function isSplitParent(n: PlanNode): boolean {
  const r = n.row;
  if (!r || r.cashflow_id == null || !(typeof r.ho_dun_geree === 'number' && r.ho_dun_geree > 0)) return false;
  const kids = n.children.filter((c) => !c.outside);
  return kids.length > 0 && kids.every((c) => c.row?.cashflow_id == null) && kids.some((c) => (c.row?.ho_dun_geree ?? 0) > 0);
}

/* ══════════════════ Мод ══════════════════ */

/**
 * Excel-ийн МӨРИЙН ДАРААЛАЛ — `buildTree`-ийн оролтыг бэлдэнэ (2026-10-27).
 */
export function orderPlanRows<T extends PlanStoredRow>(
  rows: readonly T[],
  cmp: (a: string | null | undefined, b: string | null | undefined) => number,
): T[] {
  const seen = new Set<string>();
  let dup = false;
  for (const r of rows) {
    const k = String(r.dd_kod ?? '').trim();
    if (!k) continue;
    if (seen.has(k)) { dup = true; break; }
    seen.add(k);
  }
  const oid = (r: T) => (typeof r.objectid === 'number' && Number.isFinite(r.objectid) ? r.objectid : Infinity);
  const byOid = (p: { r: T; i: number }, q: { r: T; i: number }) => {
    const a = oid(p.r), b = oid(q.r);
    return a === b ? p.i - q.i : a < b ? -1 : 1;
  };
  return rows
    .map((r, i) => ({ r, i }))
    .sort((p, q) => (dup ? byOid(p, q) : cmp(p.r.dd_kod, q.r.dd_kod) || byOid(p, q)))
    .map((x) => x.r);
}

/**
 * Хадгалсан мөрүүдээс мод угсарна.
 */
export function buildTree(rows: readonly PlanStoredRow[]): PlanTree {
  const issues: string[] = [];
  const root: PlanNode = {
    code: '', row: null, parent: null, children: [], depth: 0, index: -1,
    phase: 'other', sub: null, pkg: null, blok: null, outside: false, twin: null,
  };
  const byCode = new Map<string, PlanNode>();
  const all: PlanNode[] = [];
  const seen = new Map<string, PlanNode[]>();
  rows.forEach((row, i) => {
    const code = String(row.dd_kod ?? '').trim();
    if (!code) return;
    const n: PlanNode = {
      code, row, parent: null, children: [], depth: 0, index: i,
      phase: 'other', sub: null, pkg: null, blok: null, outside: false, twin: null,
    };
    all.push(n);
    const list = seen.get(code) ?? [];
    list.push(n);
    seen.set(code, list);
    if (!byCode.has(code)) byCode.set(code, n);
  });

  /* Эцэг холбох */
  for (const n of all) {
    const pk = String(n.row?.etseg_kod ?? '').trim();
    let p: PlanNode = root;
    if (pk) {
      const cands = seen.get(pk);
      if (!cands?.length) issues.push(tr('эцэг олдсонгүй: {0} → {1}', n.code, pk));
      else if (cands.length === 1) p = cands[0];
      else {
        /* түвшин яг нэгээр бага (байвал), дотроос нь хамгийн ойрын ӨМНӨХ */
        const tv = n.row?.tuvshin;
        const others = cands.filter((c) => c !== n);
        const lvl = typeof tv === 'number' ? others.filter((c) => c.row?.tuvshin === tv - 1) : [];
        const pool = lvl.length ? lvl : others;
        const prev = pool.filter((c) => c.index < n.index);
        if (prev.length) p = prev[prev.length - 1];
        else if (pool.length === 1) p = pool[0];
        else { p = pool[0] ?? cands[0]; issues.push(tr('dd_kod давхардсан: {0}', pk)); }
      }
      if (p === n) { issues.push(tr('өөрөө өөрийнхөө эцэг: {0}', n.code)); p = root; }
    }
    n.parent = p;
    p.children.push(n);
  }
  /* Дугуй холбоос тасална (A→B→A): үндэснээс хүрэхгүй мөрийг үндэст залгана */
  const reach = new Set<PlanNode>();
  const walk = (n: PlanNode) => { reach.add(n); for (const c of n.children) if (!reach.has(c)) walk(c); };
  walk(root);
  for (const n of all) {
    if (reach.has(n)) continue;
    issues.push(tr('дугуй холбоос: {0}', n.code));
    n.parent!.children = n.parent!.children.filter((c) => c !== n);
    n.parent = root;
    root.children.push(n);
    walk(n);
  }

  /* Шинж — урьдчилсан дарааллаар */
  const nodes: PlanNode[] = [];
  const visit = (n: PlanNode, depth: number) => {
    for (const c of n.children) {
      c.depth = depth;
      const r = c.row!;
      if (depth === 1) c.phase = phaseKind(r.uy_shat || r.ajil_uilchilgee);
      else c.phase = r.uy_shat ? phaseKind(r.uy_shat) : n.phase;
      if (c.phase === 'other' && n !== root) c.phase = n.phase;
      if (c.phase === 'barilga') {
        c.sub = depth === 2 ? (/бэлтгэл/i.test(String(r.ajil_uilchilgee ?? '')) ? 'beltgel' : 'barilga') : n.sub;
      }
      const b = String(r.bagts ?? '').trim();
      const bl = String(r.blok ?? '').trim();
      c.blok = bl || (isBlockCode(b) ? b.replace(/\s/g, '') : null);
      c.pkg = b && !isBlockCode(b) ? b : n.pkg;
      c.outside = OUTSIDE_RX.test(String(r.ajil_uilchilgee ?? ''));
      nodes.push(c);
      visit(c, depth + 1);
    }
  };
  visit(root, 1);

  linkTwins(root, nodes, issues);
  return { root, nodes, byCode, issues };
}

/**
 * F-ийн ХОС холбоно (Excel: F86=F721, F11=F719, F254=F890).
 *
 * Эх = Барилга угсралт ажлын (`sub === 'barilga'`) хэсэг — тэнд жин нь E/E_эцэг-ээр
 * бодогддог. Хос хэрэгтэй мөр = F хадгалаагүй, E-гүй, үе шатын түвшин биш мөр.
 */
function linkTwins(root: PlanNode, nodes: PlanNode[], issues: string[]) {
  const src = root.children.find((p) => p.phase === 'barilga')
    ?.children.find((c) => c.sub === 'barilga') ?? null;
  if (!src) return;
  const desc = (n: PlanNode): PlanNode[] => {
    const out: PlanNode[] = [];
    const go = (x: PlanNode) => { for (const c of x.children) { out.push(c); go(c); } };
    go(n);
    return out;
  };
  const srcAll = desc(src);
  const pick = (n: PlanNode, cands: PlanNode[]): PlanNode | null => {
    const cOf = (x: PlanNode) => keyC(x.blok ?? x.row?.bagts);
    const c = cOf(n), d = keyD(n.row?.ajil_uilchilgee);
    const tries: ((x: PlanNode) => boolean)[] = [
      (x) => cOf(x) === c && keyD(x.row?.ajil_uilchilgee) === d,
      (x) => !!d && keyD(x.row?.ajil_uilchilgee) === d,
      (x) => !!c && cOf(x) === c,
    ];
    for (const t of tries) {
      const hit = cands.filter(t);
      if (hit.length === 1) return hit[0];
    }
    return null;
  };
  const keyN = (v: unknown) => keyD(v).replace(/[^0-9a-zа-яөүё]/g, '');
  const loose = (n: PlanNode, scope: PlanNode): PlanNode | null => {
    const sib = n.parent?.children ?? [];
    const cands = scope.children;
    const d = keyN(n.row?.ajil_uilchilgee);
    if (d.length >= 6) {
      const hit = cands.filter((x) => {
        const xd = keyN(x.row?.ajil_uilchilgee);
        return xd.length >= 6 && (xd.startsWith(d) || d.startsWith(xd));
      });
      if (hit.length === 1) return hit[0];
    }
    const i = sib.indexOf(n);
    return i >= 0 && sib.length === cands.length ? cands[i] : null;
  };
  const inSrc = new Set<PlanNode>([src, ...srcAll]);
  for (const n of nodes) {
    if (n.depth < 2 || inSrc.has(n)) continue;
    /* Нэмсэн ажил — хос хайхгүй (байрлалаар буруу блоктой холбогдож жин нь блокийн төсвөөр бодогдохоос хамгаална) */
    if (isAddedWork(n)) continue;
    const r = n.row!;
    const scope = n.parent?.twin ?? src;
    n.twin = pick(n, scope.children) ?? pick(n, desc(scope)) ?? pick(n, srcAll)
      ?? (n.parent?.twin ? loose(n, n.parent.twin) : null);
    if (!n.twin && wt(r.heseg_ezleh_huvi) == null && num(r.ho_dun_geree) == null && n.children.length === 0) {
      issues.push(tr('F-ийн хос олдсонгүй: {0}', [n.code, r.bagts, r.ajil_uilchilgee].filter((x) => String(x ?? '').trim()).join(' ')));
    }
  }
}

/* ══════════════════ Тооцоо ══════════════════ */

export type PlanResult = {
  tree: PlanTree;
  today: number;
  /** Мөр бүрийн утга (үндэс оролцоно — `tree.root`) */
  values: Map<PlanNode, PlanValues>;
  /** `dd_kod`-оор */
  get: (code: string) => PlanValues | undefined;
};

/** Навчны огноо — өөрийнх, эс бөгөөс хамгийн ойрын өвөг мөрийн (хоёулаа байгаа) */
function spanOf(n: PlanNode, a: 'geree' | 'gazar' | 'guits'): [number | null, number | null] {
  for (let x: PlanNode | null = n; x && x.row; x = x.parent) {
    const s = saneDate(x.row[`${a}_ehleh`]);
    const e = saneDate(x.row[`${a}_duusah`]);
    if (s != null && e != null) return [s, e];
  }
  return [null, null];
}

/**
 * O · P-ийн муж — өөрийн төрлийн (`gazar` / `guits`) огноо навч ба өвөгт алга бол ГЭРЭЭНИЙ (H/I) муж.
 */
function spanOrGeree(n: PlanNode, a: 'gazar' | 'guits'): [number | null, number | null] {
  const sp = spanOf(n, a);
  return sp[0] != null && sp[1] != null ? sp : spanOf(n, 'geree');
}

/** P-ийн навчны дүрэм `asOf` өдрөөр (Q = +7, R = −7, сарын цуваа) — 0–1 */
function plannedLeaf(n: PlanNode, asOf: number, inputs: PlanInputs): number | null {
  if (n.phase === 'barilga' && n.sub === 'barilga' && n.blok && inputs.blockPlanned) {
    const v = inputs.blockPlanned(n.pkg, n.blok, asOf, n);
    if (v !== undefined) return frac(v);
  }
  /* ⚠️ 2026-10-29 (хэрэглэгч: «гүйцэтгэлийн хүснэгттэй холбо, хүснэгтгүйг хоосол»): блокгүй багцын барилга угсралт —
     гүйцэтгэлийн хүснэгтийн Хуваариас; хүснэгтгүй багц `null` (гэрээний огнооны шугаман хувь ГАРГАХГҮЙ) */
  if (n.phase === 'barilga' && n.sub === 'barilga' && !n.blok && inputs.pkgPlanned) {
    const v = inputs.pkgPlanned(n.pkg, asOf, n);
    if (v !== undefined) return frac(v);
  }
  const [s, e] = spanOrGeree(n, 'guits');
  return frac(linearPlanned(s, e, asOf));
}

function leafValue(n: PlanNode, m: Metric, today: number, inputs: PlanInputs): number | null {
  const r = n.row!;
  switch (m) {
    case 'N': { const [s, e] = spanOf(n, 'geree'); return frac(linearPlanned(s, e, today)); }
    case 'O': { const [s, e] = spanOrGeree(n, 'gazar'); return frac(linearPlanned(s, e, today)); }
    case 'P': return plannedLeaf(n, today, inputs);
    case 'Q': return plannedLeaf(n, today + 7 * DAY, inputs);
    case 'R': return plannedLeaf(n, today - 7 * DAY, inputs);
    case 'S': {
      if (n.phase === 'barilga' && n.sub === 'barilga') {
        const v = n.blok ? inputs.blockActual?.(n.pkg, n.blok, n) : inputs.pkgActual?.(n.pkg, n);
        if (v !== undefined) return frac(v);
      } else if (n.phase === 'gazar') {
        const v = inputs.land?.(n.pkg, n.blok, n);
        if (v !== undefined) return frac(v);
      }
      return frac(num(r.guitsetgel_huvi));
    }
  }
}

/** Σ F·X — нийлбэрт орох (outside биш), утгатай хүүхдүүдээр; бүгд null бол null */
function rollup(n: PlanNode, val: (c: PlanNode) => number | null, F: Map<PlanNode, number | null>): number | null {
  let sum = 0;
  let any = false;
  for (const c of n.children) {
    if (c.outside) continue;
    const x = val(c);
    const f = F.get(c) ?? null;
    if (x == null || f == null) continue;
    sum += f * x;
    any = true;
  }
  return any ? sum : null;
}

/**
 * Бүх мөрийн E…W-г бодно. `today` — ms (UTC өдрөөр тасалж, өдрийн төгсгөлөөр үнэлнэ; анхдагч нь УБ-ын өнөөдөр
 * `ubToday()` — дуудагч цагтай `Date.now()` өгвөл УБ-ын 00:00–08:00-д өчигдөр болно).
 */
export function computePlan(tree: PlanTree, inputs: PlanInputs = {}, today: number = ubToday()): PlanResult {
  const { root, nodes } = tree;
  const post = [...nodes].reverse(); // хүүхэд эцгээсээ өмнө
  const ov = new Map<PlanNode, Partial<Record<Metric, number | null>>>();
  if (inputs.override) for (const n of nodes) { const o = inputs.override(n); if (o) ov.set(n, o); }

  /* ── E: хадгалсан › (нийлбэрт орох) хүүхдүүдийн нийлбэр ── */
  const E = new Map<PlanNode, number | null>();
  for (const n of [...post, root]) {
    const own = n.row ? num(n.row.ho_dun_geree) : null;
    if (own != null) { E.set(n, own); continue; }
    let s = 0, any = false;
    for (const c of n.children) {
      if (c.outside) continue;
      const v = E.get(c);
      if (v != null) { s += v; any = true; }
    }
    E.set(n, any ? s : null);
  }

  /* ── F (0–1): хадгалсан › G/G_эцэг (үе шат) › E/E_эцэг › хосын F ── */
  const F = new Map<PlanNode, number | null>();
  F.set(root, 1);
  const busy = new Set<PlanNode>();
  /**
   * ⚠️ 2026-11-03 (хэрэглэгч: «Excel-ийг бүрэн автомат болго»): нэг эцгийн доорх (нийлбэрт орох) БҮХ мөр төсөвт өртөгтэй
   * бол Хэсэгт эзлэх = мөрийн төсөвт өртөг ÷ тэдгээрийн нийлбэр — хадгалсан жингээс ДЭЭГҮҮР (төсөв өөрчлөгдөхөд дагана).
   * Аль нэг мөр төсөвгүй бол хадгалсан жин (бичмэгц томьёо автоматаар ажиллана). Үе шатны мөр (үндсийн хүүхэд) — хамаарахгүй.
   */
  const budgetShare = (n: PlanNode): number | null => {
    const p = n.parent;
    if (inputs.excelWeights || !p || p === root || n.outside) return null;
    /* хэрэглэгч 2026-11-03: төсөвт өртөг хоосон бол 0 гэж бодно; бүлэгт нэг ч төсөв байхгүй бол (÷0) хадгалсан жин */
    const sib = p.children.filter((c) => !c.outside);
    let tot = 0;
    for (const c of sib) tot += E.get(c) ?? 0;
    return tot > 0 ? (E.get(n) ?? 0) / tot : null;
  };
  /**
   * 2026-11-03 (хэрэглэгч): бүлэгт өөрийн төсөв байхгүй бол — мөр бүрийн Барилга угсралтын ижил багц/блокийн мөрийн (ихэр)
   * төсвөөр бүлэг ДОТРОО хувь: ихрийн төсөв ÷ бүлгийн ихрүүдийн төсвийн нийлбэр (ихэргүй мөр = 0) → нийлбэр 100%.
   * Дэд шат (эцэг нь ижил ихэртэй) — ихэр тооцохгүй. Бүлэгт ихрийн төсөв огт байхгүй бол хадгалсан жин.
   */
  const twinBudget = (c: PlanNode): number => (c.twin && c.parent?.twin !== c.twin ? E.get(c.twin) ?? 0 : 0);
  const twinShare = (n: PlanNode): number | null => {
    const p = n.parent;
    if (inputs.excelWeights || !p || p === root || n.outside) return null;
    let tot = 0;
    for (const c of p.children) if (!c.outside) tot += twinBudget(c);
    return tot > 0 ? twinBudget(n) / tot : null;
  };
  const fOf = (n: PlanNode): number | null => {
    if (F.has(n)) return F.get(n)!;
    if (busy.has(n)) return null;
    busy.add(n);
    const r = n.row!;
    let f = budgetShare(n) ?? twinShare(n) ?? wt(r.heseg_ezleh_huvi);
    if (f == null) {
      /* Хадгалсан Төсөлд эзлэх ÷ эцгийнх — ЗӨВХӨН үе шатны мөр ба Excel горимд (автомат горимд эцгийн G томьёогоор
         өөрчлөгдөх тул хуучин G-ээс буцааж бодвол жин хэт томордог — 2026-11-03) */
      const g = n.parent === root || inputs.excelWeights ? wt(r.tusul_ezleh_huvi) : null;
      const gp = g == null ? null : gOf(n.parent!);
      const e = E.get(n) ?? null;
      const ep = n.parent ? E.get(n.parent) ?? null : null;
      if (g != null && gp) f = g / gp;
      else if (e != null && ep) f = e / ep;
      else if (n.twin) f = fOf(n.twin);
    }
    busy.delete(n);
    F.set(n, f);
    return f;
  };
  /* ── G (0–1): хадгалсан › F × G_эцэг. F нь үе шатын мөрд G/G_эцэг тул хоёр нь харилцан
     дууддаг — чиглэл нь ҮРГЭЛЖ эцэг рүү тул дугуйрахгүй. ── */
  const G = new Map<PlanNode, number | null>();
  G.set(root, 1);
  /* ⚠️ 2026-11-03 (хэрэглэгч: бүрэн автомат): үе шатны мөр (үндсийн хүүхэд) — хадгалсан бодлогын жин; бусад мөр — ҮРГЭЛЖ
     Хэсэгт эзлэх × эцэг мөрийн Төсөлд эзлэх (хадгалсан утга зөвхөн F бодогдохгүй үед). */
  function gOf(n: PlanNode): number | null {
    if (G.has(n)) return G.get(n)!;
    const own = wt(n.row!.tusul_ezleh_huvi);
    let g: number | null = n.parent === root || inputs.excelWeights ? own : null;
    if (g == null) {
      const f = fOf(n);
      const gp = gOf(n.parent!);
      g = f != null && gp != null ? f * gp : own;
    }
    G.set(n, g);
    return g;
  }
  for (const n of nodes) { fOf(n); gOf(n); }

  /* ── EA: оноосон төсөв — өөрийн E › эцгийн EA × F (урьдчилсан дарааллаар: эцэг хүүхдээсээ өмнө) ── */
  const EA = new Map<PlanNode, number | null>();
  EA.set(root, E.get(root) ?? null);
  for (const n of nodes) {
    const own = E.get(n) ?? null;
    const pa = n.parent ? EA.get(n.parent) ?? null : null;
    const f = F.get(n) ?? null;
    EA.set(n, own ?? (pa != null && f != null && !n.outside ? pa * f : null));
  }

  /* ── H…M: хадгалсан › үр удмын MIN эхлэх / MAX дуусах ── */
  const D = new Map<PlanNode, (number | null)[]>();
  const DF: [keyof PlanStoredRow, 'min' | 'max'][] = [
    ['geree_ehleh', 'min'], ['geree_duusah', 'max'],
    ['gazar_ehleh', 'min'], ['gazar_duusah', 'max'],
    ['guits_ehleh', 'min'], ['guits_duusah', 'max'],
  ];
  /* `agg` — үр удмын бүх утгын min/max (Excel MIN(H529:H903) нь бүх үр удмыг хамардаг) */
  const agg = new Map<PlanNode, (number | null)[]>();
  for (const n of [...post, root]) {
    const own = DF.map(([k]) => (n.row ? saneDate(n.row[k]) : null));
    /* ⚠️ 2026-10-29: блокгүй барилга угсралтын НАВЧНЫ гүйцэтгэгчийн муж — гүйцэтгэлийн хүснэгтийн Хуваариас (`pkgSpan`) */
    if (!n.children.length && n.phase === 'barilga' && n.sub === 'barilga' && !n.blok && inputs.pkgSpan) {
      const sp = inputs.pkgSpan(n.pkg, n);
      if (sp !== undefined) { own[4] = sp?.[0] ?? null; own[5] = sp?.[1] ?? null; }
    }
    const a: (number | null)[] = DF.map(() => null);
    for (const c of n.children) {
      const cv = D.get(c)!, ca = agg.get(c)!;
      DF.forEach(([, op], i) => {
        for (const v of [cv[i], ca[i]]) {
          if (v == null) continue;
          a[i] = a[i] == null ? v : op === 'min' ? Math.min(a[i]!, v) : Math.max(a[i]!, v);
        }
      });
    }
    agg.set(n, a);
    D.set(n, own.map((v, i) => v ?? a[i]));
  }

  /* ── N…S: навч — дүрэм/дарах утга, эцэг — Σ F·X ── */
  const X = new Map<PlanNode, Record<Metric, number | null>>();
  for (const n of [...post, root]) {
    const o = n.row ? ov.get(n) : undefined;
    const rec = {} as Record<Metric, number | null>;
    for (const m of METRICS) {
      if (o && m in o) { rec[m] = frac(o[m] ?? null); continue; }
      if (n.children.length) rec[m] = rollup(n, (c) => X.get(c)![m], F);
      else rec[m] = n.row ? leafValue(n, m, today, inputs) : null;
    }
    X.set(n, rec);
  }

  const values = new Map<PlanNode, PlanValues>();
  for (const n of [root, ...nodes]) {
    const x = X.get(n)!;
    const d = D.get(n)!;
    const S = hund(x.S), N = hund(x.N), O = hund(x.O), P = hund(x.P), R = hund(x.R);
    values.set(n, {
      E: E.get(n) ?? null,
      EA: EA.get(n) ?? null,
      F: hund(F.get(n) ?? null),
      G: hund(G.get(n) ?? null),
      H: d[0], I: d[1], J: d[2], K: d[3], L: d[4], M: d[5],
      N, O, P, Q: hund(x.Q), R, S,
      T: ratio(S, N), U: ratio(S, O), V: ratio(S, P), W: ratio(S, R),
      status: n.blok ? blockStatus(S) : null,
    });
  }
  return { tree, today, values, get: (code) => { const n = tree.byCode.get(code); return n ? values.get(n) : undefined; } };
}

/* ══════════════════ Сарын хуримтлагдсан цуваа («…сараар») ══════════════════ */

/** `from`-ын сараас `to`-гийн сар хүртэл САР БҮРИЙН СҮҮЛИЙН ӨДӨР (UTC шөнө дунд, ms) */
export function monthEnds(from: number, to: number, max = 240): number[] {
  const a = new Date(from), b = new Date(to);
  const out: number[] = [];
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); out.length < max; m++) {
    const end = Date.UTC(y, m + 1, 0);
    out.push(end);
    if (Date.UTC(y, m, 1) >= Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1)) break;
  }
  return out;
}

/**
 * САРЫН ХУРИМТЛАГДСАН ТӨЛӨВЛӨГӨӨТ % (0–100) мөр бүрд — Excel «…сараар».
 * Навч: блок → Хуваарийн төлөвлөгөө (`blockPlanned`), бусад → шугаман L/M; эцэг → Σ F·X
 * (F нь `computePlan`-ынх). `override` нь навч/эцэгт бүтэн цуваа өгч болно (шалгалт).
 */
export function monthlySeries(
  res: PlanResult,
  months: readonly number[],
  inputs: PlanInputs & {
    /** Сар бүрийн дарах утга; массивын `undefined` элемент = тэр сарыг бодно */
    overrideMonthly?: (node: PlanNode) => readonly (number | null | undefined)[] | undefined;
  } = {},
): Map<PlanNode, (number | null)[]> {
  const { root, nodes } = res.tree;
  const F = new Map<PlanNode, number | null>();
  for (const n of nodes) F.set(n, frac(res.values.get(n)!.F));
  const out = new Map<PlanNode, (number | null)[]>();
  for (const n of [...[...nodes].reverse(), root]) {
    const o = n.row ? inputs.overrideMonthly?.(n) : undefined;
    const s = months.map((t, i) => {
      const ov = o?.[i];
      if (ov !== undefined) return frac(ov);
      if (n.children.length) return rollup(n, (c) => out.get(c)![i], F);
      return n.row ? plannedLeaf(n, t, inputs) : null;
    });
    out.set(n, s);
  }
  for (const [n, s] of out) out.set(n, s.map(hund));
  return out;
}

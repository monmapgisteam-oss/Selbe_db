/**
 * САРЫН МӨНГӨ — «Гараар» (сарын мөр) ба «Хуваарь» (тооцоолсон) эхийн НЭГДСЭН цуваа.
 *
 * НЭГЖ: бүх дүн ₮ (төгрөг). Сарын түлхүүр «YYYY-MM». Хувь (`pct`) 0–100 (`pct` 100-аар үржүүлдэггүй).
 */
import { t as tr } from '@/lib/i18nCore';
import {
  CASHFLOW_NEW, CF_MONTH, CF_WORK_WHERE, bagtsKey, blockKey, pkgKeyOf,
} from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { cached, SESSION_TTL_MS } from '@/lib/live';
import { register } from '@/lib/dataBus';
import { CONTRACTED, cfStartKeyOf, type CfPlanRow } from '@/lib/gdash';
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { PLAN_COVERAGE_MIN, planFields } from '@/lib/planProgress';
import { cfIdOfPctKey, countPlanRows, loadPkgPct, loadPkgPlan, monthStart, type PkgPlan, type PkgPct } from '@/lib/huvaariObyem';

/* ══════════════════ Эх ══════════════════ */

export type MonthSource = 'garaar' | 'huvaari';
export const SRC_MANUAL: MonthSource = 'garaar';
export const SRC_HUVAARI: MonthSource = 'huvaari';

/** Мөнгөний мөрийн (гэрээ) тооцоонд хэрэгтэй хэсэг */
export type MoneyRow = {
  /** `Cashflow_ID` — сарын мөрүүд үүгээр холбогдоно */
  id: number;
  /** Багцын түлхүүр (`pkgKeyOf`) — диапазон/хоосон бол '' */
  pkg: string;
  /** Сарын мөнгөний суурь (₮) — `moneyBaseOf`; хоосон/0/NaN бол null */
  cost: number | null;
  source: MonthSource;
  /** Үе шат нь «Барилга угсралт» — багцын сарын хувь зөвхөн энэ гэрээнд (`MainSpan.pctKeyFor`-той нэг дүрэм). `false` л хасна. */
  build?: boolean;
  /** «Гэрээлсэн дүн» тэмдэгтэй — гэрээ байгуулагдсан */
  contracted?: boolean;
};

const numOrNull = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : null;
};

/**
 * САРЫН МӨНГӨНИЙ СУУРЬ: гэрээ байгуулагдсан бол гэрээний дүн (`geree_dun`), эс бөгөөс төсөв (`ho_dun_geree`). Уншихад л сонгоно —
 * «Гэрээ үүсгэх» төсвийг хөндөхгүй тул нийт төсөв хэвээр; гэрээ цуцлахад суурь төсөв рүү буцна.
 */
export function moneyBaseOf(r: Readonly<Record<string, unknown>>): number | null {
  const F = CASHFLOW_NEW.fields;
  if (String(r[F.amountNote] ?? '').trim() === CONTRACTED) {
    const geree = numOrNull(r[F.contractAmount]);
    if (geree != null && geree > 0) return geree;
  }
  return numOrNull(r[F.budget]);
}

/** Мөнгөний мөр → `MoneyRow`. `Cashflow_ID`-гүй мөр (бүтцийн) → null (`Number(null) = 0` занга). */
export function moneyRowOf(r: Readonly<Record<string, unknown>>): MoneyRow | null {
  const F = CASHFLOW_NEW.fields;
  const id = numOrNull(r[CF_MONTH.id]);
  if (id == null || !(id > 0)) return null;
  const cost = moneyBaseOf(r);
  return {
    id,
    pkg: pkgKeyOf(r[F.pkg]),
    cost: cost != null && cost > 0 ? cost : null,
    /* 2026-11-16 (хэрэглэгч: «ямар ч тэмдэг хэрэггүй»): бүх ажлын сарын мөнгө ҮРГЭЛЖ Хуваариас — `sar_mongo_eh` уншихгүй */
    source: SRC_HUVAARI,
    build: isSwitchPhase(r[F.phase]),
    contracted: String(r[F.amountNote] ?? '').trim() === CONTRACTED,
  };
}

/* ══════════════════ Хуудас → сарын ₮ (цэвэр) ══════════════════ */

/** `SheetRow`-ийн хэрэгтэй хэсэг */
export type UnitRow = { des: number | null; unit: number | null; group?: boolean };

export type SheetMoney = {
  /** «YYYY-MM» → ₮ */
  byMonth: Map<string, number>;
  /** Нэгж өртөггүй тул ₮ болоогүй (ажил × блок × сар) нүдний тоо */
  noUnit: number;
  /** Хуудасны НАВЧ мөрд олдоогүй ажлын кодтой нүдний тоо */
  noRow: number;
};

/**
 * НЭГ ХУУДАСНЫ сарын мөнгө = Σ (ажил · блок · сарын обьём × тухайн ажлын нэгж өртөг).
 * @param skipBlok — тооцохгүй блок (давхардсан, толгой) — `blockKey`-ээр тулгана
 */
export function sheetMonthMoney(
  rows: readonly UnitRow[],
  plan: PkgPlan,
  skipBlok: (blok: string) => boolean = () => false,
): SheetMoney {
  const unitOf = new Map<number, number | null>();
  for (const r of rows) if (!r.group && r.des != null) unitOf.set(r.des, r.unit);
  const out: SheetMoney = { byMonth: new Map(), noUnit: 0, noRow: 0 };
  for (const [des, byBlok] of plan) {
    for (const [blok, byMonth] of byBlok) {
      if (skipBlok(blok)) continue;
      for (const [sar, v] of byMonth) {
        if (v == null || !Number.isFinite(v) || monthStart(sar) == null) continue;
        if (!unitOf.has(des)) { out.noRow += 1; continue; }
        const u = unitOf.get(des);
        if (u == null || !Number.isFinite(u)) { out.noUnit += 1; continue; }
        out.byMonth.set(sar, (out.byMonth.get(sar) ?? 0) + v * u);
      }
    }
  }
  return out;
}

/** Нэг БАГЦЫН (бүх хуудасны) тооцоолсон цуваа */
export type PkgMoney = {
  /** `bagtsKey(Pkg.group)` */
  key: string;
  byMonth: Map<string, number>;
  noUnit: number;
  noRow: number;
  /** Тооцоонд орсон хуудсууд (`Pkg.key`) */
  sheets: string[];
  /** Уншигдаагүй хуудсууд — хоосон биш бол цуваа ДУТУУ, ашиглахгүй */
  failed: string[];
  /**
   * БАГЦЫН САРЫН ХУВЬ («YYYY-MM» → 0–100; `huvaariObyem.loadPkgPct`, 2026-11-05) — байвал сарын мөнгө = хувь × гэрээний
   * ХО дүн (нийлбэр ХО дүнтэй тэнцэнэ), обьём × нэгж өртгийн `byMonth` хэрэглэгдэхгүй.
   */
  pct?: Map<string, number>;
};

/** Хуудсуудын цувааг нэг багц болгоно */
export function mergeSheetMoney(key: string, parts: readonly { sheet: string; money: SheetMoney }[], failed: readonly string[] = []): PkgMoney {
  const out: PkgMoney = { key, byMonth: new Map(), noUnit: 0, noRow: 0, sheets: [], failed: [...failed] };
  for (const { sheet, money } of parts) {
    out.sheets.push(sheet);
    out.noUnit += money.noUnit;
    out.noRow += money.noRow;
    for (const [k, v] of money.byMonth) out.byMonth.set(k, (out.byMonth.get(k) ?? 0) + v);
  }
  return out;
}

/* ══════════════════ Нэгдсэн цуваа (цэвэр) ══════════════════ */

export type ContractState =
  /** 'garaar' — гараар оруулсан сарын мөрөөс */
  | 'manual'
  /** 'huvaari' — тооцоолсон, сартай */
  | 'ok'
  /** 'huvaari' — багцын хуваарьт сарын обьём (₮ болох) алга */
  | 'empty'
  /** 'huvaari' — багцын түлхүүргүй (диапазон/хоосон `bagts`) */
  | 'noKey'
  /** 'huvaari' — тэр багцад бөглөх хуудас (PKGS) алга */
  | 'noSheet'
  /** 'huvaari' — хуудас уншигдсангүй (дутуу цуваа гаргахгүй) */
  | 'failed'
  /** 'huvaari' — багцаа өөр 'huvaari' гэрээтэй хуваалцдаг ч ХО дүнгүй тул хувь оноогдсонгүй */
  | 'sharedNoCost';

export type ContractMoney = {
  id: number;
  source: MonthSource;
  pkg: string;
  cost: number | null;
  /** `MoneyRow.build` */
  build?: boolean;
  /** `MoneyRow.contracted` */
  contracted?: boolean;
  /** «YYYY-MM» → ₮. 'garaar' — дүнтэй (`Cashflow_dun` ≠ null) сарын мөрүүдийн нийлбэр */
  months: Map<string, number>;
  state: ContractState;
  /** 'huvaari' — багцын цуваанаас авсан хувь (0–1); бусад үед null */
  share: number | null;
  /**
   * 'huvaari' — багцын хуудсанд НЭГЖ ӨРТӨГГҮЙ тул ₮ болоогүй нүдний тоо (`PkgMoney.noUnit`); 'garaar' үед 0.
   */
  noUnit: number;
  /** 'huvaari' — хуудсанд олдоогүй ажлын кодтой нүдний тоо (`PkgMoney.noRow`); 'garaar' үед 0 */
  noRow: number;
};

/**
 * ЦУВААНЫ ЦООРХОЙ — S-муруй (ерөнхий дашбоард · ТУХ) аль гэрээгүйгээр зурагдсаныг хэлнэ (null ≠ 0).
 */
export type MoneyGaps = {
  /** Мөнгөний мөр эсвэл аль нэг хуудас уншигдсангүй — цуваа ДУТУУ (дахин ачаалбал засагдаж магадгүй) */
  partial: boolean;
  /** Хуудас уншигдаагүй тул цуваагүй 'huvaari' гэрээ (`Cashflow_ID`) */
  failed: number[];
  /** Тооцоолсон сар ГАРААГҮЙ бусад 'huvaari' гэрээ (empty · noKey · noSheet · sharedNoCost) */
  missing: number[];
  /** Гэрээ байгуулагдсан ч сарын дүнгийн нийлбэр гэрээний дүнгээс `100 − PLAN_COVERAGE_MIN` хувиас илүү зөрсөн (сар огт оруулаагүй ч орно) */
  short: number[];
  /** Нэгж өртөггүй тул ₮-д ороогүй нүд (багц тус бүрийг НЭГ удаа) */
  noUnit: number;
  /** Хуудсанд олдоогүй ажлын кодтой нүд (багц тус бүрийг НЭГ удаа) */
  noRow: number;
};

/** Цоорхой байгаа эсэх */
export const hasMoneyGaps = (g: MoneyGaps | null | undefined): boolean =>
  !!g && (g.partial || g.failed.length > 0 || g.missing.length > 0 || g.short.length > 0 || g.noUnit > 0 || g.noRow > 0);

export type MonthlyMoney = {
  /** `Cashflow_ID` → гэрээний цуваа */
  contracts: Map<number, ContractMoney>;
  /** Багцын түлхүүр (`pkgKeyOf`) → «YYYY-MM» → ₮ (тухайн багцын бүх гэрээний ҮР ДҮНТЭЙ цуваа) */
  pkgs: Map<string, Map<string, number>>;
  /**
   * ҮР ДҮНТЭЙ САРЫН МӨРҮҮД — `gdash.loadCfPlan`-ын хэлбэр (`cashflowCurve` · `tuhData.cfPlanPctAt`).
   */
  rows: CfPlanRow[];
  /** Хүнд ойлгомжтой анхааруулга (багц хуваалцсан, нэгжгүй обьём, уншигдаагүй хуудас) */
  issues: string[];
  /** Цуваанаас дутсан 'huvaari' гэрээ ба нэгжгүй нүд (`MoneyGaps`) */
  gaps: MoneyGaps;
};

/** «YYYY-MM» → тэр сарын 1-ний UTC 12:00 (мс) */
const monthNoon = (k: string): number => {
  const s = monthStart(k)!;
  return s + 12 * 3600_000;
};

/**
 * Мөнгөний мөр + гараар сарын мөр + багцын тооцоолсон цуваа → үр дүнтэй цуваа.
 * @param manual — `CF_MONTH_WHERE` мөрүүд (`CfPlanRow`; `gdash.loadCfPlanManual`)
 * @param sheets — `bagtsKey(group)` → `PkgMoney` (`loadSheetMoney`). 'huvaari' гэрээгүй бол хоосон Map хангалттай.
 */
export function buildMonthlyMoney(
  money: readonly MoneyRow[],
  manual: readonly CfPlanRow[],
  sheets: ReadonlyMap<string, PkgMoney>,
  /** PKGS-д хуудастай багцын түлхүүрүүд — `noSheet` ба `empty`-г ялгана (анхдагч: PKGS) */
  sheetKeys: ReadonlySet<string> = PKG_KEYS,
  /**
   * ГЭРЭЭНИЙ «Үндсэн хугацаа»-ны сарын хувь (`Cashflow_ID` → «YYYY-MM» → 0–100; `pctByIdOf`, 2026-11-05) — хүснэгтгүй багц,
   * ТЭЗҮ/зураг төсөл зэрэг БҮХ гэрээнд: сарын мөнгө = хувь × хөрөнгө оруулалтын дүн. `null` = хувийн хүснэгт уншигдсангүй (тэр гэрээнүүд
   * `failed`, хоосон гэж худал хэлэхгүй); өгөөгүй бол хуучин зан төлөв.
   */
  pctById?: ReadonlyMap<number, ReadonlyMap<string, number>> | null,
): MonthlyMoney {
  const issues: string[] = [];
  const contracts = new Map<number, ContractMoney>();
  for (const m of money) {
    if (contracts.has(m.id)) { issues.push(tr('Cashflow_ID давхардсан: {0}', m.id)); continue; }
    contracts.set(m.id, {
      id: m.id, source: m.source, pkg: m.pkg, cost: m.cost, build: m.build, contracted: m.contracted, months: new Map(),
      state: m.source === SRC_HUVAARI ? 'empty' : 'manual', share: null, noUnit: 0, noRow: 0,
    });
  }
  const isHuv = (id: number) => contracts.get(id)?.source === SRC_HUVAARI;

  /* ── 'garaar': сарын мөрийн дүн ── */
  for (const r of manual) {
    const c = contracts.get(r.id);
    if (!c || c.source !== SRC_MANUAL || r.start == null || r.amount == null) continue;
    const k = cfStartKeyOf(r.start);
    if (!k) continue;
    c.months.set(k, (c.months.get(k) ?? 0) + r.amount);
  }

  /* ── 'huvaari': гэрээний «Үндсэн хугацаа»-ны сарын хувь (гэрээгээр) — хуудас шаардахгүй ── */
  const byPct = new Set<number>();
  for (const c of contracts.values()) {
    if (c.source !== SRC_HUVAARI) continue;
    const m = pctById?.get(c.id);
    if (!m?.size) continue;
    byPct.add(c.id);
    if (c.cost == null) {
      c.state = 'sharedNoCost';
      issues.push(tr('Гэрээ {0}: хөрөнгө оруулалтын дүнгүй тул Хуваарийн сарын хувиас ₮ бодогдсонгүй', c.id));
      continue;
    }
    for (const [k, v] of m) c.months.set(k, (c.cost * v) / 100);
    c.state = 'ok';
  }

  /* ── 'huvaari': багцын цувааг гэрээнд оноох ── */
  const byPkg = new Map<string, ContractMoney[]>();
  for (const c of contracts.values()) {
    if (c.source !== SRC_HUVAARI || byPct.has(c.id)) continue;
    /* хувийн хүснэгт уншигдаагүй — хуудасгүй гэрээний сарын хувь мэдэгдэхгүй (хоосон биш) */
    if (pctById === null && (!c.pkg || !sheetKeys.has(c.pkg))) { c.state = 'failed'; continue; }
    if (!c.pkg) { c.state = 'noKey'; issues.push(tr('Гэрээ {0}: багцын дугааргүй (эсвэл олон багцын) мөр — Хуваарь-аас сарын мөнгө бодогдохгүй', c.id)); continue; }
    if (!sheetKeys.has(c.pkg)) { c.state = 'noSheet'; issues.push(tr('Гэрээ {0}: {1} багцад бөглөх хуудас алга — Хуваарь-аас сарын мөнгө бодогдохгүй', c.id, c.pkg)); continue; }
    byPkg.set(c.pkg, [...(byPkg.get(c.pkg) ?? []), c]);
  }
  for (const [key, list] of byPkg) {
    const pm = sheets.get(key);
    if (pm && pm.failed.length) {
      for (const c of list) c.state = 'failed';
      issues.push(tr('{0}: хуудас уншигдсангүй ({1}) — тооцоолсон сарын мөнгө гарахгүй', key, pm.failed.join(', ')));
      continue;
    }
    /* 2026-11-05: багцын САРЫН ХУВЬ Хуваарьт байвал — сарын мөнгө = хувь × гэрээний ХО дүн (нийлбэр = ХО дүн × Σхувь/100).
       Багцаа хуваалцсан гэрээ бүр ӨӨРИЙН ХО дүнгээр; ХО дүнгүй гэрээнд ₮ бодогдохгүй (null ≠ 0). */
    if (pm?.pct?.size) {
      for (const c of list) {
        /* Багцын хувь нь барилгын гэрээнийх: өөрийн хувь оруулаагүй зураг төсөл, ТЭЗҮ-ийн гэрээ түүнийг өвлөхгүй */
        if (c.build === false) { c.state = 'empty'; continue; }
        if (c.cost == null) {
          c.state = 'sharedNoCost';
          issues.push(tr('Гэрээ {0}: хөрөнгө оруулалтын дүнгүй тул Хуваарийн сарын хувиас ₮ бодогдсонгүй', c.id));
          continue;
        }
        for (const [k, v] of pm.pct) c.months.set(k, (c.cost * v) / 100);
        c.state = c.months.size ? 'ok' : 'empty';
      }
      continue;
    }
    if (pm && pm.noUnit) issues.push(tr('{0}: нэгж өртөггүй {1} нүдний обьём ₮-д тооцогдсонгүй', key, pm.noUnit));
    if (pm && pm.noRow) issues.push(tr('{0}: хуудсанд олдоогүй ажлын кодтой {1} нүд алгасагдав', key, pm.noRow));
    for (const c of list) { c.noUnit = pm?.noUnit ?? 0; c.noRow = pm?.noRow ?? 0; }
    /* Хувь: ганц бол 1; олон бол ХО дүнгээр (толгой) */
    let shares: Map<ContractMoney, number>;
    if (list.length === 1) shares = new Map([[list[0], 1]]);
    else {
      const withCost = list.filter((c) => c.cost != null);
      const tot = withCost.reduce((a, c) => a + (c.cost ?? 0), 0);
      shares = new Map(withCost.map((c) => [c, tot > 0 ? (c.cost ?? 0) / tot : 0]));
      for (const c of list) if (c.cost == null) c.state = 'sharedNoCost';
      issues.push(tr('{0}: {1} гэрээ нэг багцын Хуваарийг хуваалцана — хөрөнгө оруулалтын дүнгийн харьцаагаар хуваав', key, list.length));
    }
    for (const [c, sh] of shares) {
      c.share = sh;
      if (!pm || !pm.byMonth.size) { c.state = 'empty'; continue; }
      for (const [k, v] of pm.byMonth) c.months.set(k, v * sh);
      c.state = c.months.size ? 'ok' : 'empty';
    }
  }

  /* ── Үр дүнтэй мөрүүд ── */
  const rows: CfPlanRow[] = manual.filter((r) => !isHuv(r.id));
  for (const c of contracts.values()) {
    if (c.source !== SRC_HUVAARI) continue;
    for (const k of [...c.months.keys()].sort()) {
      const amount = c.months.get(k)!;
      rows.push({
        id: c.id,
        start: monthNoon(k),
        pct: c.cost != null ? (amount / c.cost) * 100 : null,
        amount,
      });
    }
  }

  /* ── Багцаар ── */
  const pkgs = new Map<string, Map<string, number>>();
  for (const c of contracts.values()) {
    if (!c.pkg) continue;
    const m = pkgs.get(c.pkg) ?? new Map<string, number>();
    for (const [k, v] of c.months) m.set(k, (m.get(k) ?? 0) + v);
    pkgs.set(c.pkg, m);
  }
  /* ── Цоорхой (`MoneyGaps`) ── */
  const gaps: MoneyGaps = { partial: false, failed: [], missing: [], short: [], noUnit: 0, noRow: 0 };
  for (const c of contracts.values()) {
    if (c.source === SRC_HUVAARI) {
      if (c.state === 'failed') gaps.failed.push(c.id);
      else if (c.state !== 'ok') gaps.missing.push(c.id);
    }
    /* Гэрээтэй ажил: төлөвлөгөө бүрэн байх ёстой. Босго нь гүйцэтгэгчийн хуваарийн `PLAN_COVERAGE_MIN`-тай нэг. Гэрээгүй ажил хамаарахгүй. */
    if (c.contracted && c.cost != null && (c.state === 'ok' || c.state === 'manual')) {
      let sum = 0;
      for (const v of c.months.values()) sum += v;
      if (Math.abs((sum / c.cost) * 100 - 100) > 100 - PLAN_COVERAGE_MIN) gaps.short.push(c.id);
    }
  }
  for (const key of byPkg.keys()) {
    const pm = sheets.get(key);
    if (pm && !pm.failed.length) { gaps.noUnit += pm.noUnit; gaps.noRow += pm.noRow; }
  }
  return { contracts, pkgs, rows, issues, gaps };
}

/** Хуваарийн сарын хувийн бүх мөр (`loadPkgPct().pct`) → `Cashflow_ID` → сар → хувь («CF:<id>» түлхүүртэй нь л) */
export function pctByIdOf(all: PkgPct): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const [k, m] of all) {
    const id = cfIdOfPctKey(k);
    if (id != null && m.size) out.set(id, m);
  }
  return out;
}

/** PKGS-д хуудастай багцын түлхүүрүүд */
export const PKG_KEYS: ReadonlySet<string> = new Set(PKGS.map((p) => bagtsKey(p.group)));

/** 'huvaari' гэрээнүүдийн багцын түлхүүр */
export const huvaariPkgKeys = (money: readonly MoneyRow[]): Set<string> =>
  new Set(money.filter((m) => m.source === SRC_HUVAARI && m.pkg).map((m) => m.pkg));

/* ══════════════════ Сүлжээ — унших ══════════════════ */

/** Мөнгөний мөрүүд (78) — зөвхөн хэрэгтэй талбарууд */
export const loadMoneyRows = cached<MoneyRow[]>(async () => {
  const F = CASHFLOW_NEW.fields;
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: CF_WORK_WHERE,
    outFields: [CASHFLOW_NEW.oid, CF_MONTH.id, F.pkg, F.phase, F.budget, F.contractAmount, F.amountNote],
  });
  return rows.map(moneyRowOf).filter((x): x is MoneyRow => x != null);
}, SESSION_TTL_MS, ['CASHFLOW_NEW']);

/**
 * Багцуудын ТООЦООЛСОН сарын мөнгө (зөвхөн `keys`-д байгаа багц — 'huvaari' гэрээтэй нь).
 */
export async function loadSheetMoney(keys: ReadonlySet<string>, pctGiven?: PkgPct): Promise<Map<string, PkgMoney>> {
  const out = new Map<string, PkgMoney>();
  /* 2026-11-05: багцын сарын хувьтай багц — хуудас, обьём унших ШААРДЛАГАГҮЙ (сарын мөнгө = хувь × хөрөнгө оруулалтын дүн).
     Хувийн хүснэгт уншигдахгүй бол бүх багц «уншигдсангүй» (хоосон гэж ХУДАЛ хэлэхгүй). */
  let pctAll: PkgPct;
  try {
    pctAll = pctGiven ?? (await loadPkgPct()).pct;
  } catch (e) {
    console.warn('[selbe] сарын мөнгө: Хуваарийн сарын хувь уншигдсангүй', e);
    return failedSheets(keys);
  }
  const rest = new Set<string>();
  for (const k of keys) {
    const m = pctAll.get(k);
    if (m?.size && PKG_KEYS.has(k)) out.set(k, { ...mergeSheetMoney(k, []), pct: new Map(m) });
    else rest.add(k);
  }
  const wanted = PKGS.filter((p) => rest.has(bagtsKey(p.group)));
  if (!wanted.length) return out;
  const cnt = await countPlanRows();
  if (cnt === 0) {
    for (const k of rest) if (PKG_KEYS.has(k)) out.set(k, mergeSheetMoney(k, []));
    return out;
  }
  const schemas = await Promise.all(wanted.map((p) => loadSchema(p).catch(() => null)));
  const parts = new Map<string, { sheet: string; money: SheetMoney }[]>();
  const failed = new Map<string, string[]>();
  /** Багц бүрд аль хэдийн тоологдсон блок (PKGS-ийн дарааллаар — эхнийх давамгайлна) */
  const seen = new Map<string, Set<string>>();
  const prior = new Map<Pkg, Set<string>>();
  wanted.forEach((p, i) => {
    const g = bagtsKey(p.group);
    const s = seen.get(g) ?? new Set<string>();
    prior.set(p, new Set(s));
    for (const b of schemas[i]?.bld ?? []) { const k = blockKey(b); if (k) s.add(k); }
    seen.set(g, s);
  });
  await Promise.all(wanted.map(async (p, i) => {
    const g = bagtsKey(p.group);
    const sc: Schema | null = schemas[i];
    try {
      if (!sc) throw new Error('schema');
      const plan = (await loadPkgPlan(p.key)).plan;
      if (!plan.size) { parts.set(g, [...(parts.get(g) ?? []), { sheet: p.key, money: { byMonth: new Map(), noUnit: 0, noRow: 0 } }]); return; }
      const { rows } = await loadRows(p, sc, undefined, planFields(sc), { persist: true });
      const before = prior.get(p)!;
      const money = sheetMonthMoney(rows, plan, (b) => { const k = blockKey(b); return !!k && before.has(k); });
      parts.set(g, [...(parts.get(g) ?? []), { sheet: p.key, money }]);
    } catch (e) {
      console.warn(`[selbe] сарын мөнгө: ${p.key} уншигдсангүй`, e);
      failed.set(g, [...(failed.get(g) ?? []), p.key]);
    }
  }));
  for (const k of new Set(wanted.map((p) => bagtsKey(p.group)))) {
    out.set(k, mergeSheetMoney(k, parts.get(k) ?? [], failed.get(k) ?? []));
  }
  return out;
}

/* Хуваарийн сарын хувийн кэш — 186-ын бичилтээр (`HUVAARI_OBYEM`) унана; уналт кэшлэгдэхгүй */
let pctP: { at: number; p: Promise<PkgPct> } | null = null;
register(() => { pctP = null; }, ['HUVAARI_OBYEM']);
function loadPctCached(): Promise<PkgPct> {
  if (pctP && Date.now() - pctP.at <= SESSION_TTL_MS) return pctP.p;
  const p = loadPkgPct().then((x) => x.pct);
  pctP = { at: Date.now(), p };
  p.catch(() => { if (pctP?.p === p) pctP = null; });
  return p;
}

/* Кэш — түлхүүрийн олонлогоор; ЗӨВХӨН бүрэн (уналтгүй) үр дүн (`live.cached`-ын `keep` дүрэм) */
const sheetMoneyCache = new Map<string, { at: number; p: Promise<Map<string, PkgMoney>> }>();
register(() => { sheetMoneyCache.clear(); }, ['HUVAARI_OBYEM', 'BAGTS_SHEET', 'CASHFLOW_NEW']);
function loadSheetMoneyCached(keys: ReadonlySet<string>): Promise<Map<string, PkgMoney>> {
  const id = [...keys].sort().join('|');
  const hit = sheetMoneyCache.get(id);
  if (hit && Date.now() - hit.at <= SESSION_TTL_MS) return hit.p;
  const p = loadSheetMoney(keys);
  sheetMoneyCache.set(id, { at: Date.now(), p });
  p.then((m) => {
    if ([...m.values()].some((x) => x.failed.length) && sheetMoneyCache.get(id)?.p === p) sheetMoneyCache.delete(id);
  }, () => { if (sheetMoneyCache.get(id)?.p === p) sheetMoneyCache.delete(id); });
  return p;
}

/**
 * Уншилт бүхэлдээ унасан үеийн цуваа — хуудастай багц бүр `failed` (тэр багцын хуудсуудыг нэрлэнэ), цуваагүй.
 */
export function failedSheets(keys: ReadonlySet<string>): Map<string, PkgMoney> {
  const out = new Map<string, PkgMoney>();
  for (const k of keys) {
    if (!PKG_KEYS.has(k)) continue;
    const names = PKGS.filter((p) => bagtsKey(p.group) === k).map((p) => p.key);
    out.set(k, mergeSheetMoney(k, [], names.length ? names : [k]));
  }
  return out;
}

/** Дутуу (хуудас унасан / мөнгөний мөр уншигдаагүй) үр дүн — `gdash.loadCfPlan` кэшлэхгүй */
const partial = new WeakSet<object>();
export const isPartialMoney = (v: object): boolean => partial.has(v);
/** `withHuvaari`-ийн буцаасан массив → цоорхой (`gdash.cfPlanGaps`). Цоорхойгүй / 'huvaari' гэрээгүй бол null. */
const gapsOf = new WeakMap<object, MoneyGaps>();
export const moneyGapsOf = (v: object): MoneyGaps | null => gapsOf.get(v) ?? null;

/**
 * НЭГДСЭН ЦУВАА — гараар сарын мөр (`manual`) + мөнгөний мөр + Хуваарь.
 */
export async function loadMonthlyMoney(manual: readonly CfPlanRow[]): Promise<MonthlyMoney> {
  let money: MoneyRow[];
  try {
    money = await loadMoneyRows();
  } catch (e) {
    console.warn('[selbe] сарын мөнгө: мөнгөний мөр уншигдсангүй — гараар цуваа хэвээр', e);
    const r = buildMonthlyMoney([], manual, new Map());
    r.gaps.partial = true;
    partial.add(r); partial.add(r.rows);
    return r;
  }
  const keys = huvaariPkgKeys(money);
  const anyHuv = money.some((m) => m.source === SRC_HUVAARI);
  /* Гэрээний «Үндсэн хугацаа»-ны сарын хувь — 'huvaari' гэрээ байвал л; уншигдахгүй бол null (тэр гэрээнүүд `failed`) */
  let pctAll: PkgPct | null | undefined;
  if (anyHuv) {
    try { pctAll = await loadPctCached(); } catch (e) {
      console.warn('[selbe] сарын мөнгө: Хуваарийн сарын хувь уншигдсангүй', e);
      pctAll = null;
    }
  }
  let sheets: Map<string, PkgMoney>;
  try {
    sheets = !keys.size ? new Map<string, PkgMoney>() : pctAll === null ? failedSheets(keys) : await loadSheetMoneyCached(keys);
  } catch (e) {
    console.warn('[selbe] сарын мөнгө: Хуваарийн хуудас уншигдсангүй — гараар цуваа хэвээр', e);
    sheets = failedSheets(keys);
  }
  const r = buildMonthlyMoney(money, manual, sheets, PKG_KEYS, pctAll === undefined ? undefined : pctAll === null ? null : pctByIdOf(pctAll));
  if (pctAll === null || [...sheets.values()].some((x) => x.failed.length)) { r.gaps.partial = true; partial.add(r); partial.add(r.rows); }
  return r;
}

/**
 * `gdash.loadCfPlan`-ын үр дүнтэй мөрүүд. 'huvaari' гэрээгүй бол `manual`-ийг ӨӨРИЙГ нь буцаана.
 */
export async function withHuvaari(manual: CfPlanRow[]): Promise<CfPlanRow[]> {
  const r = await loadMonthlyMoney(manual);
  const anyHuv = [...r.contracts.values()].some((c) => c.source === SRC_HUVAARI);
  if (!anyHuv) {
    if (partial.has(r.rows)) { const out = manual.slice(); partial.add(out); gapsOf.set(out, r.gaps); return out; }
    return manual;
  }
  if (hasMoneyGaps(r.gaps)) gapsOf.set(r.rows, r.gaps);
  return r.rows;
}

/* ══════════════════ Хуваарийн үе шат ══════════════════ */

export const SWITCH_PHASE = 'Барилга угсралт';
export const isSwitchPhase = (v: unknown): boolean => /^барилга\s+угсралт$/i.test(String(v ?? '').trim());

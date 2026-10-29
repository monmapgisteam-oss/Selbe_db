/**
 * САРЫН МӨНГӨ — «Гараар» (сарын мөр) ба «Хуваарь» (тооцоолсон) эхийн НЭГДСЭН цуваа.
 *
 * НЭГЖ: бүх дүн ₮ (төгрөг). Сарын түлхүүр «YYYY-MM». Хувь (`pct`) 0–100 (`pct` 100-аар үржүүлдэггүй).
 */
import { t as tr } from '@/lib/i18nCore';
import {
  CASHFLOW_NEW, CF_MONTH, CF_MONTH_WHERE, CF_WORK_WHERE, bagtsKey, blockKey, pkgKeyOf,
} from '@/lib/services';
import { arcgisPost, queryFeatures, ArcGISError, type ArcgisBody, type Row } from '@/lib/query';
import { cached, SESSION_TTL_MS } from '@/lib/live';
import { invalidate, register } from '@/lib/dataBus';
import { isLostWrite } from '@/lib/lostWrite';
import { requireCap } from '@/lib/who';
import type { CapKey } from '@/lib/caps';
import { cfStartKeyOf, type CfPlanRow } from '@/lib/gdash';
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { planFields } from '@/lib/planProgress';
import { countPlanRows, loadPkgPlan, monthStart, type PkgPlan } from '@/lib/huvaariObyem';

/* ══════════════════ Эх ══════════════════ */

export type MonthSource = 'garaar' | 'huvaari';
export const SRC_MANUAL: MonthSource = 'garaar';
export const SRC_HUVAARI: MonthSource = 'huvaari';

/**
 * ШИЛЖҮҮЛЭХ ЭРХ — «Гараар → Хуваарь» (шинэ cap, «Эрх» хэсгээс «Төлөвлөлтийн ахлах инженер»-т).
 */
export const CF_SWITCH_CAP: CapKey = 'cfSwitch';

/** `sar_mongo_eh`-ийн утга → эх. Хоосон/null/танихгүй → 'garaar' (талбарын анхдагч — одоогийн 78 мөр бүгд null). */
export const monthSourceOf = (v: unknown): MonthSource =>
  String(v ?? '').trim().toLowerCase() === SRC_HUVAARI ? SRC_HUVAARI : SRC_MANUAL;

/** Мөнгөний мөрийн (гэрээ) тооцоонд хэрэгтэй хэсэг */
export type MoneyRow = {
  /** `Cashflow_ID` — сарын мөрүүд үүгээр холбогдоно */
  id: number;
  /** Багцын түлхүүр (`pkgKeyOf`) — диапазон/хоосон бол '' */
  pkg: string;
  /** ХО дүн (₮) — хоосон/0/NaN бол null */
  cost: number | null;
  source: MonthSource;
};

const numOrNull = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : null;
};

/** Мөнгөний мөр → `MoneyRow`. `Cashflow_ID`-гүй мөр (бүтцийн) → null (`Number(null) = 0` занга). */
export function moneyRowOf(r: Readonly<Record<string, unknown>>): MoneyRow | null {
  const F = CASHFLOW_NEW.fields;
  const id = numOrNull(r[CF_MONTH.id]);
  if (id == null || !(id > 0)) return null;
  const cost = numOrNull(r[F.budget]);
  return {
    id,
    pkg: pkgKeyOf(r[F.pkg]),
    cost: cost != null && cost > 0 ? cost : null,
    source: monthSourceOf(r[F.monthSource]),
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
  /** Нэгж өртөггүй тул ₮-д ороогүй нүд (багц тус бүрийг НЭГ удаа) */
  noUnit: number;
  /** Хуудсанд олдоогүй ажлын кодтой нүд (багц тус бүрийг НЭГ удаа) */
  noRow: number;
};

/** Цоорхой байгаа эсэх */
export const hasMoneyGaps = (g: MoneyGaps | null | undefined): boolean =>
  !!g && (g.partial || g.failed.length > 0 || g.missing.length > 0 || g.noUnit > 0 || g.noRow > 0);

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
): MonthlyMoney {
  const issues: string[] = [];
  const contracts = new Map<number, ContractMoney>();
  for (const m of money) {
    if (contracts.has(m.id)) { issues.push(tr('Cashflow_ID давхардсан: {0}', m.id)); continue; }
    contracts.set(m.id, {
      id: m.id, source: m.source, pkg: m.pkg, cost: m.cost, months: new Map(),
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

  /* ── 'huvaari': багцын цувааг гэрээнд оноох ── */
  const byPkg = new Map<string, ContractMoney[]>();
  for (const c of contracts.values()) {
    if (c.source !== SRC_HUVAARI) continue;
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
      issues.push(tr('{0}: {1} гэрээ нэг багцын Хуваарийг хуваалцана — ХО дүнгийн харьцаагаар хуваав', key, list.length));
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
  const gaps: MoneyGaps = { partial: false, failed: [], missing: [], noUnit: 0, noRow: 0 };
  for (const c of contracts.values()) {
    if (c.source !== SRC_HUVAARI) continue;
    if (c.state === 'failed') gaps.failed.push(c.id);
    else if (c.state !== 'ok') gaps.missing.push(c.id);
  }
  for (const key of byPkg.keys()) {
    const pm = sheets.get(key);
    if (pm && !pm.failed.length) { gaps.noUnit += pm.noUnit; gaps.noRow += pm.noRow; }
  }
  return { contracts, pkgs, rows, issues, gaps };
}

/** PKGS-д хуудастай багцын түлхүүрүүд */
export const PKG_KEYS: ReadonlySet<string> = new Set(PKGS.map((p) => bagtsKey(p.group)));

/** 'huvaari' гэрээнүүдийн багцын түлхүүр */
export const huvaariPkgKeys = (money: readonly MoneyRow[]): Set<string> =>
  new Set(money.filter((m) => m.source === SRC_HUVAARI && m.pkg).map((m) => m.pkg));

/* ══════════════════ Сүлжээ — унших ══════════════════ */

/** Мөнгөний мөрүүд (78) — зөвхөн хэрэгтэй 4 талбар */
export const loadMoneyRows = cached<MoneyRow[]>(async () => {
  const F = CASHFLOW_NEW.fields;
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: CF_WORK_WHERE,
    outFields: [CASHFLOW_NEW.oid, CF_MONTH.id, F.pkg, F.budget, F.monthSource],
  });
  return rows.map(moneyRowOf).filter((x): x is MoneyRow => x != null);
}, SESSION_TTL_MS, ['CASHFLOW_NEW']);

/**
 * Багцуудын ТООЦООЛСОН сарын мөнгө (зөвхөн `keys`-д байгаа багц — 'huvaari' гэрээтэй нь).
 */
export async function loadSheetMoney(keys: ReadonlySet<string>): Promise<Map<string, PkgMoney>> {
  const out = new Map<string, PkgMoney>();
  const wanted = PKGS.filter((p) => keys.has(bagtsKey(p.group)));
  if (!wanted.length) return out;
  const cnt = await countPlanRows();
  if (cnt === 0) {
    for (const k of keys) if (PKG_KEYS.has(k)) out.set(k, mergeSheetMoney(k, []));
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
  let sheets: Map<string, PkgMoney>;
  try {
    sheets = keys.size ? await loadSheetMoneyCached(keys) : new Map<string, PkgMoney>();
  } catch (e) {
    console.warn('[selbe] сарын мөнгө: Хуваарийн хуудас уншигдсангүй — гараар цуваа хэвээр', e);
    sheets = failedSheets(keys);
  }
  const r = buildMonthlyMoney(money, manual, sheets);
  if ([...sheets.values()].some((x) => x.failed.length)) { r.gaps.partial = true; partial.add(r); partial.add(r.rows); }
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

/* ══════════════════ Шилжүүлэлт — «Гараар → Хуваарь» ══════════════════ */

export const SWITCH_PHASE = 'Барилга угсралт';
export const isSwitchPhase = (v: unknown): boolean => /^барилга\s+угсралт$/i.test(String(v ?? '').trim());

/**
 * Үе шатын шалгуурын ТАТГАЛЗЛЫН шалтгаан (товчны `title` · алдаа) — таарсан бол null.
 */
export function switchPhaseWhy(v: unknown): string | null {
  if (isSwitchPhase(v)) return null;
  const s = String(v ?? '').trim();
  return s
    ? tr('Хуваарь эх зөвхөн «{0}» үе шатын гэрээнд — энэ гэрээ «{1}» тул шилжүүлэхгүй', SWITCH_PHASE, s)
    : tr('Энэ гэрээний үе шат (uy_shat) тодорхойгүй — Хуваарь эх зөвхөн «{0}» үе шатын гэрээнд тул шилжүүлэхгүй', SWITCH_PHASE);
}

/**
 * ШИЛЖҮҮЛЭХИЙН ӨМНӨХ ТООЦОО — тухайн багцын Хуваарь-аас ОДОО гарах сарын мөнгө.
 *   'ok'         — сартай, нэгжгүй/олдоогүй нүдгүй;
 *   'incomplete' — сартай ч нэгж өртөггүй / хуудсанд олдоогүй нүдтэй (`total` ДУТУУ);
 *   'empty'      — ₮ болох сарын обьём алга (`huvaari_obyem` хоосон г.м.) — шилжүүлбэл гэрээ S-муруйгаас ГАРНА;
 *   'failed'     — хуудас/задаргаа уншигдсангүй — юу гарахыг мэдэхгүй тул ХЭЗЭЭ Ч шилжүүлэхгүй.
 */
export type SwitchPreview = {
  pkg: string;
  verdict: 'ok' | 'incomplete' | 'empty' | 'failed';
  /** Тооцоолсон нийт ₮ (багцын бүх сар) — 'empty' / 'failed' үед null (0 БИШ) */
  total: number | null;
  /** Тооцоолсон сарын тоо */
  months: number;
  noUnit: number;
  noRow: number;
  /** Уншигдаагүй хуудсууд */
  failed: string[];
};

/** `PkgMoney` → `SwitchPreview` (цэвэр) */
export function judgePreview(pkg: string, pm: PkgMoney | undefined): SwitchPreview {
  if (!pm) return { pkg, verdict: 'failed', total: null, months: 0, noUnit: 0, noRow: 0, failed: [pkg] };
  const base = { pkg, months: pm.byMonth.size, noUnit: pm.noUnit, noRow: pm.noRow, failed: [...pm.failed] };
  if (pm.failed.length) return { ...base, verdict: 'failed', total: null };
  if (!pm.byMonth.size) return { ...base, verdict: 'empty', total: null };
  let total = 0;
  for (const v of pm.byMonth.values()) total += v;
  return { ...base, verdict: pm.noUnit || pm.noRow ? 'incomplete' : 'ok', total };
}

/**
 * Багцын тооцоог ШИНЭЭР (кэшгүй) уншина — батлуулах цонхонд «тооцоолсон нийт» харуулах ба `switchToHuvaari`-ийн шалгуур.
 */
export async function previewSwitch(pkg: string): Promise<SwitchPreview> {
  try {
    return judgePreview(pkg, (await loadSheetMoney(new Set([pkg]))).get(pkg));
  } catch (e) {
    console.warn(`[selbe] шилжүүлэлтийн урьдчилсан тооцоо: ${pkg} уншигдсангүй`, e);
    return judgePreview(pkg, undefined);
  }
}

/** Шилжүүлэлтийн сүлжээний давхарга — тестэд солигдоно */
export type SwitchIo = {
  /** CASHFLOW_NEW-ээс уншина (хуудаслалттай, OID эрэмбээр) */
  query: (where: string, outFields: string[]) => Promise<Row[]>;
  /** CASHFLOW_NEW-ийн `applyEdits` (биеэр, токен query-ийн цөмд) — 200-алдаа `ArcGISError` болж шидэгдэнэ */
  applyEdits: (body: Record<string, string>) => Promise<ArcgisBody>;
  /** Багцын тооцоолсон сарын мөнгө (`previewSwitch`) */
  preview: (pkg: string) => Promise<SwitchPreview>;
};

const defaultIo: SwitchIo = {
  query: (where, outFields) => queryFeatures(CASHFLOW_NEW.url, { where, outFields, orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  applyEdits: (body) => arcgisPost(`${CASHFLOW_NEW.url}/applyEdits`, body),
  preview: previewSwitch,
};

/** Нэг хүсэлтээр устгах сарын мөрийн дээд хязгаар — хуудаславал атом алдагдана (`tableWrite.applyAll`) */
export const SWITCH_MAX_DELETES = 1000;

/**
 * ШИЛЖҮҮЛЭЛТИЙН БИЕ — мөнгөний мөрийн `sar_mongo_eh` = 'huvaari' + тэр гэрээний гараар САРЫН мөрүүдийг устгах, НЭГ
 * хүсэлтэд (`rollbackOnFailure` — бүгд эсвэл юу ч үгүй).
 */
export function buildSwitchEdits(oid: number, monthOids: readonly number[]): Record<string, string> {
  const body: Record<string, string> = {
    rollbackOnFailure: 'true',
    updates: JSON.stringify([{ attributes: { [CASHFLOW_NEW.oid]: oid, [CASHFLOW_NEW.fields.monthSource]: SRC_HUVAARI } }]),
  };
  if (monthOids.length) body.deletes = monthOids.join(',');
  return body;
}

type EditRes = { success?: boolean; objectId?: number; error?: { description?: string } };

/**
 * `applyEdits`-ийн хариуг дүгнэнэ.
 *   'ok'     — бүх мөр `success: true`, тоо таарсан;
 *   'refused'— аль нэг нь `success: false` (`rollbackOnFailure` → юу ч бичигдээгүй, ТОДОРХОЙ);
 *   'unsure' — тоо зөрсөн / `success` талбаргүй (сервер бичсэн байж болно — `huvaariObyem.applyPlanEdits`-ийн дүрэм).
 */
export function judgeSwitch(j: ArcgisBody, nUpd: number, nDel: number): { verdict: 'ok' | 'refused' | 'unsure'; msg?: string } {
  const u = (j.updateResults ?? []) as EditRes[];
  const d = (j.deleteResults ?? []) as EditRes[];
  const bad = [...u, ...d].find((r) => r.success === false);
  if (bad) return { verdict: 'refused', msg: bad.error?.description || tr('амжилтгүй') };
  if (u.length !== nUpd || d.length !== nDel || [...u, ...d].some((r) => r.success !== true)) return { verdict: 'unsure' };
  return { verdict: 'ok' };
}

export type SwitchResult = {
  /** Устгасан гараар сарын мөр */
  deleted: number;
  /** Аль хэдийн 'huvaari', гараар мөр ч үлдээгүй — юу ч бичээгүй */
  already: boolean;
  /** Хариу алдагдсан/тодорхойгүй байсныг дахин уншиж баталсан */
  verified: boolean;
  /** Шилжүүлэх үеийн тооцоо (`already` үед null) */
  preview: SwitchPreview | null;
};

export type SwitchOpts = {
  /**
   * 'empty' / 'incomplete' тооцоотой ч шилжүүлнэ — дуудагч ХОЁР ДАХЬ, тооцоолсон нийтийг нэрлэсэн батлуулах цонх
   * харуулсны дараа л `true` өгнө. 'failed'-ийг энэ ч зөвшөөрөхгүй.
   */
  allowIncomplete?: boolean;
  /**
   * Хэрэглэгчийн БАТЛАСАН тооцоо (батлуулах цонхонд харуулсан `SwitchPreview`-ийн дүгнэлт ба нийт).
   */
  expect?: { verdict: SwitchPreview['verdict']; total: number | null };
};

/** Батласан тооцоо ↔ шилжүүлэх үеийн тооцоо таарах уу (нийт ±1 ₮ — хуудсуудын нийлбэрийн дараалал хөвдөг) */
export function sameVerdict(a: { verdict: SwitchPreview['verdict']; total: number | null }, b: SwitchPreview): boolean {
  if (a.verdict !== b.verdict) return false;
  if (a.total == null || b.total == null) return a.total == null && b.total == null;
  return Math.abs(a.total - b.total) <= 1;
}

/** Хариу алдагдсан, дахин уншилтаар ч батлагдаагүй — `lostWrite.isLostWrite` үнэн (`lost: true`) */
export type SwitchLostError = Error & { lost: true };
/** Тооцоо хоосон/дутуу тул (`allowIncomplete`-гүй) татгалзсан — юу ч бичигдээгүй */
export type SwitchIncompleteError = Error & { incomplete: true; preview: SwitchPreview };
export const isSwitchIncomplete = (e: unknown): e is SwitchIncompleteError =>
  !!e && typeof e === 'object' && (e as { incomplete?: unknown }).incomplete === true;

/** ₮ — бүхэл, мянгатын таслалтай (React-гүй; `format.mnt`-ийн оронд — энэ файл Node тестэд шууд ачаалагдана) */
const tg = (v: number): string => Math.round(v).toLocaleString('en-US');

/** Тооцооны төлвийг хүнд ойлгомжтой хэлнэ (батлуулах цонх · алдаа) */
export function previewText(p: SwitchPreview): string {
  if (p.verdict === 'failed') return tr('Хуваарийн бөглөх хуудас уншигдсангүй ({0}) — тооцоолсон сарын мөнгө тодорхойгүй', p.failed.join(', ') || p.pkg);
  if (p.verdict === 'empty') return tr('Хуваарьт нэгж өртөгтэй сарын обьём АЛГА — шилжүүлбэл энэ гэрээний сарын мөнгө ХООСОН болж S-муруйд орохгүй');
  if (p.verdict === 'incomplete') {
    return tr('Хуваарь-аас {0} сард нийт {1} ₮ гарна, гэхдээ {2} нүд нэгж өртөггүй, {3} нүд хуудсанд олдоогүй тул ДУТУУ', p.months, tg(p.total ?? 0), p.noUnit, p.noRow);
  }
  return tr('Хуваарь-аас {0} сард нийт {1} ₮ гарна', p.months, tg(p.total ?? 0));
}

/**
 * ГЭРЭЭГ «Хуваарь» ЭХ РҮҮ ШИЛЖҮҮЛНЭ — БУЦААХГҮЙ (гараар сарын мөр бүрмөсөн устна; дуудагч БАТЛУУЛАХ ЦОНХ заавал).
 *
 * Алхам: эрх (`cfSwitch`) → мөнгөний мөрийг ШИНЭЭР унших (яг 1, багц нь хуудастай, «Барилга угсралт» үе шат) → сарын
 * мөрийн OID → тэр багцад өөр 'huvaari' гэрээ алга → Хуваарийн тооцоо (`preview`; 'failed' бол татгалзана, 'empty' /
 * 'incomplete' бол `allowIncomplete` + таарсан `expect`-гүй татгалзана; `expect` өгөгдсөн бол дүгнэлт/нийт зөрвөл
 * татгалзана) → НЭГ атом `applyEdits` → хариуг мөр бүрээр (`success === true`)
 * шалгах. Хариу алдагдсан (`isLostWrite`) / тодорхойгүй бол ДАХИН УНШИЖ: `sar_mongo_eh` = 'huvaari' ба ИЛГЭЭСЭН сарын
 * мөрүүд алга бол амжилт (`verified`), эс бөгөөс `lost` алдаа.
 */
export async function switchToHuvaari(cashflowId: number, io: SwitchIo = defaultIo, opts: SwitchOpts = {}): Promise<SwitchResult> {
  requireCap(CF_SWITCH_CAP);
  if (!Number.isInteger(cashflowId) || cashflowId <= 0) throw new Error(tr('Гэрээний дугаар (Cashflow_ID) буруу: {0}', String(cashflowId)));
  const F = CASHFLOW_NEW.fields;
  const oidF = CASHFLOW_NEW.oid;
  const parentWhere = `(${CF_WORK_WHERE}) AND ${CF_MONTH.id} = ${cashflowId}`;
  const monthWhere = `(${CF_MONTH_WHERE}) AND ${CF_MONTH.id} = ${cashflowId}`;
  const read = async () => {
    const [parents, months] = await Promise.all([
      io.query(parentWhere, [oidF, CF_MONTH.id, F.pkg, F.monthSource, F.phase]),
      io.query(monthWhere, [oidF]),
    ]);
    return { parents, months };
  };

  const { parents, months } = await read();
  if (parents.length !== 1) {
    throw new Error(parents.length
      ? tr('Cashflow_ID {0} {1} мөнгөний мөрт давхардсан — шилжүүлэхгүй', cashflowId, parents.length)
      : tr('Cashflow_ID {0} мөнгөний мөр олдсонгүй', cashflowId));
  }
  const p = parents[0];
  const oid = Number(p[oidF]);
  if (!Number.isInteger(oid)) throw new Error(tr('Мөрийн дугаар алга — засварыг илгээх боломжгүй'));
  const pkg = pkgKeyOf(p[F.pkg]);
  if (!pkg || !PKG_KEYS.has(pkg)) {
    throw new Error(tr('Энэ гэрээний багцад ({0}) Хуваарийн бөглөх хуудас алга — сарын мөнгө тооцоологдохгүй тул шилжүүлэхгүй', String(p[F.pkg] ?? '—')));
  }
  const phaseWhy = switchPhaseWhy(p[F.phase]);
  if (phaseWhy) throw new Error(phaseWhy);
  const monthOids = months.map((r) => Number(r[oidF])).filter((x) => Number.isInteger(x));
  if (monthOids.length !== months.length) throw new Error(tr('Сарын мөрийн дугаар уншигдсангүй — шилжүүлэхгүй'));
  if (monthSourceOf(p[F.monthSource]) === SRC_HUVAARI && monthOids.length === 0) return { deleted: 0, already: true, verified: false, preview: null };
  if (monthOids.length > SWITCH_MAX_DELETES) throw new Error(tr('Сарын мөр хэт олон ({0}) — нэг атом хүсэлтээр устгах боломжгүй', monthOids.length));

  const all = await io.query(CF_WORK_WHERE, [CF_MONTH.id, F.pkg, F.monthSource]);
  const rival = all.find((r) => Number(r[CF_MONTH.id]) !== cashflowId
    && monthSourceOf(r[F.monthSource]) === SRC_HUVAARI && pkgKeyOf(r[F.pkg]) === pkg);
  if (rival) {
    throw new Error(tr('{0} багцын Хуваарь аль хэдийн Cashflow_ID {1} гэрээнд оноогдсон — нэг багцын хуудас нэг л гэрээнд', pkg, String(rival[CF_MONTH.id])));
  }

  const preview = await io.preview(pkg);
  if (preview.verdict === 'failed') throw new Error(`${previewText(preview)} — ${tr('шилжүүлэхгүй')}`);
  if (opts.expect && !sameVerdict(opts.expect, preview)) {
    throw new Error(tr('Хуваарийн тооцоо батлуулсны дараа өөрчлөгдсөн: {0} — шилжүүлэхгүй, дахин шалгана уу', previewText(preview)));
  }
  if (preview.verdict !== 'ok' && (!opts.allowIncomplete || !opts.expect)) {
    const e = new Error(`${previewText(preview)} — ${tr('шилжүүлэхгүй')}`) as SwitchIncompleteError;
    e.incomplete = true;
    e.preview = preview;
    throw e;
  }

  const body = buildSwitchEdits(oid, monthOids);
  const sent = new Set(monthOids);
  let touched = false;
  const verify = async (): Promise<SwitchResult> => {
    let after: Awaited<ReturnType<typeof read>>;
    try {
      after = await read();
    } catch (e) {
      throw lostErr(e);
    }
    const ok = after.parents.length === 1 && monthSourceOf(after.parents[0][F.monthSource]) === SRC_HUVAARI
      && !after.months.some((r) => sent.has(Number(r[oidF])));
    if (!ok) throw lostErr();
    return { deleted: monthOids.length, already: false, verified: true, preview };
  };
  try {
    let j: ArcgisBody;
    try {
      j = await io.applyEdits(body);
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      touched = true;
      return await verify();
    }
    const v = judgeSwitch(j, 1, monthOids.length);
    if (v.verdict === 'refused') throw new Error(`${tr('Шилжүүлэлт')}: ${v.msg}`);
    touched = true;
    if (v.verdict === 'unsure') return await verify();
    return { deleted: monthOids.length, already: false, verified: false, preview };
  } finally {
    if (touched) invalidate('CASHFLOW_NEW');
  }
}

/* ══════════════════ Шилжүүлэлтийн НЭГДСЭН урсгал (батлуулах цонхтой) ══════════════════ */

/** Батлуулах цонх — `confirm.askConfirm`-ийн хэлбэр (React-гүй байлгахын тулд дуудагч өгнө) */
export type SwitchAsk = (msg: string, o: { ok: string; danger: boolean; title: string }) => Promise<boolean>;

export type SwitchFlowArgs = {
  cashflowId: number;
  /** Батлуулах цонхонд нэрлэх гэрээ («Багц-1 · Барилга угсралт» г.м.) */
  name: string;
  /** Гэрээний багцын түлхүүр (`pkgKeyOf(bagts)`) */
  pkg: string;
  /** Мөнгөний мөрийн `uy_shat` — `switchPhaseWhy`-аар урьдчилан шүүнэ (`switchToHuvaari` дахин шалгана) */
  phase: unknown;
  /** Устах гараар сарын мөрийн тоо */
  manualRows: number;
  /** Устах гараар сарын нийт ₮ (`Cashflow_dun`) — дүнтэй мөр алга бол null (0 БИШ) */
  manualTotal: number | null;
  /** ₮ хэвжүүлэгч (`format.mnt`) */
  money: (v: number) => string;
  ask: SwitchAsk;
  /** Урьдчилсан тооцоо / бичилтийн үед true, цонх нээлттэй үед false — товчны «Шилжүүлж байна…» */
  onBusy?: (busy: boolean) => void;
  io?: SwitchIo;
};

export type SwitchFlowResult =
  /** Хэрэглэгч цуцалсан — юу ч бичигдээгүй */
  | { kind: 'cancel' }
  /** Урьдчилан татгалзсан (үе шат · тооцоо уншигдаагүй) — юу ч бичигдээгүй */
  | { kind: 'refused'; msg: string }
  | { kind: 'done'; result: SwitchResult };

/**
 * «ГАРААР → ХУВААРЬ» — ХОЁР харагдацын (`CashflowPlan` · Санхүүжилтийн «Төсөл төлөвлөгөө биелэлт») НЭГ урсгал.
 */
export async function confirmAndSwitch(a: SwitchFlowArgs): Promise<SwitchFlowResult> {
  const phaseWhy = switchPhaseWhy(a.phase);
  if (phaseWhy) return { kind: 'refused', msg: phaseWhy };
  const io = a.io ?? defaultIo;
  a.onBusy?.(true);
  let pv: SwitchPreview;
  try {
    pv = await io.preview(a.pkg).catch(() => judgePreview(a.pkg, undefined));
  } finally {
    a.onBusy?.(false);
  }
  if (pv.verdict === 'failed') return { kind: 'refused', msg: `${previewText(pv)} — ${tr('шилжүүлэхгүй')}` };
  if (!(await a.ask(
    tr('«{0}» гэрээний гараар оруулсан {1} сарын мөр (нийт {2}) УСТАЖ, сарын мөнгө Хуваарийн сарын обьём × нэгж өртгөөр тооцоологдоно: {3}. Буцаах боломжгүй. Шилжүүлэх үү?',
      a.name, a.manualRows, a.manualTotal == null ? '—' : a.money(a.manualTotal), previewText(pv)),
    { ok: tr('Шилжүүлэх'), danger: true, title: tr('Хуваарь руу шилжүүлэх') },
  ))) return { kind: 'cancel' };
  const incomplete = pv.verdict !== 'ok';
  if (incomplete && !(await a.ask(
    tr('АНХААР: {0}. Гараар оруулсан {1} устаад оронд нь {2} үлдэнэ. Ийм хэвээр шилжүүлэх үү?',
      previewText(pv), a.manualTotal == null ? tr('сарын мөрүүд') : a.money(a.manualTotal),
      pv.total == null ? tr('хоосон цуваа') : a.money(pv.total)),
    { ok: tr('Ийм хэвээр шилжүүлэх'), danger: true, title: tr('Тооцоолсон сарын мөнгө дутуу') },
  ))) return { kind: 'cancel' };
  a.onBusy?.(true);
  try {
    const result = await switchToHuvaari(a.cashflowId, io, {
      allowIncomplete: incomplete,
      expect: { verdict: pv.verdict, total: pv.total },
    });
    return { kind: 'done', result };
  } finally {
    a.onBusy?.(false);
  }
}

function lostErr(cause?: unknown): SwitchLostError {
  const e = new ArcGISError(
    tr('Шилжүүлэлтийн хариу ирсэнгүй — бичигдсэн эсэх тодорхойгүй. Хуудсыг дахин ачаалж шалгана уу.'),
    `${CASHFLOW_NEW.url}/applyEdits`,
  ) as unknown as SwitchLostError;
  e.lost = true;
  if (cause !== undefined) (e as { cause?: unknown }).cause = cause;
  return e;
}

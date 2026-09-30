/**
 * ТУХ (ТӨСЛИЙН УДИРДЛАГЫН ХЭСЭГ) — БАГЦЫН ХЯНАЛТЫН САМБАРЫН ӨГӨГДӨЛ.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ (2026-09-30, хэрэглэгчийн заавар): «ТУХ» харагдац нь
 *    `docs/jishee/Selbe City Packages.html` жишээний БҮТЦИЙГ системийн загвараар
 *    дууриана. Жишээний тоо БҮГД хатуу бичигдсэн (JSON) — энд НЭГ Ч тоо зохиохгүй.
 *    Тоо бүр системийн байгаа ачаалагчаас (`loadFinData`, `loadPlanCurve`,
 *    `loadGdashCf`/`loadCfPlan`, `HO_IPC`, «Хуваарь»-ийн бөглөх хуудас) гарна.
 *
 * ⚠️ ШИНЭ ТООЦОО нь ЗӨВХӨН доорх цэвэр функцууд бөгөөд `tuhData.check.mjs`-ээр
 *    шалгагдана: багцын бүлэг (`groupOf`), төлөв (`statusOf`), 7 хоногийн ахиц
 *    (`weekDelta`), гэрээний сарын төлөвлөгөөний хуримтлал (`cfPlanPctAt`),
 *    EV/PV/SPI (`earned`), хуваарийн мөрийн муж (`rowSpan`).
 *
 * ⚠️ `null` ≠ 0 (06 §2): хэмжигдээгүй, бөглөөгүй утга ХООСОН үлдэнэ — дэлгэц
 *    дээр «—». Хувь БҮГД 0–100 (`pct()` 100-аар үржүүлдэггүй).
 *
 * ⚠️ ЭХ СУРВАЛЖГҮЙ ХЭСЭГ (материалын 3-6-9, ТУХ-ын арга хэмжээ, журам, асуудал,
 *    зураг, BIM, дулаан авах блок, 7 хоногийн төлөвлөгөө/PPC, багц хоорондын
 *    уялдаа) энд ОГТ БАЙХГҮЙ — харагдац нь бүтцээ хадгалаад хоосон харуулна
 *    (хэрэглэгчийн сонголт, 2026-09-30).
 */
import { t as tr } from '@/lib/i18nCore';
import {
  CASHFLOW_NEW, HO_IPC, PKG_FAMILY_BY_BAGTS, bagtsKey, pkgKeyOf,
} from '@/lib/services';
import { finXlChartCat, FIN_XL_TOTAL_CODE_FIELD } from '@/lib/finExcelLayout';
import type { CfPlanRow } from '@/lib/gdash';
import type { HoContract } from '@/lib/ipc';

type Row = Record<string, unknown>;

/* ══════════════════════ БҮЛЭГ ══════════════════════ */

/**
 * Жишээ HTML-ийн 8 бүлэг — ДАРААЛАЛ нь шүүлтүүрийн дараалал.
 * ⚠️ Нэр нь `label()` — хэл солиход шинэчлэгдэнэ (модулийн түвшинд `tr()` бүү дууд).
 */
export type TuhGroup = 'housing' | 'networks' | 'energy' | 'heat' | 'external' | 'social' | 'other' | 'design';
export const TUH_GROUPS: { key: TuhGroup; label: () => string }[] = [
  { key: 'housing', label: () => tr('Орон сууц') },
  { key: 'networks', label: () => tr('Инженерийн шугам сүлжээ') },
  { key: 'energy', label: () => tr('Эрчим хүч, холбоо') },
  { key: 'heat', label: () => tr('Дулааны эх үүсвэр') },
  { key: 'external', label: () => tr('Өндөржилт, гадна тохижилт') },
  { key: 'social', label: () => tr('Нийгмийн дэд бүтэц') },
  { key: 'other', label: () => tr('Бусад, нэмэлт ажил') },
  { key: 'design', label: () => tr('Зураг төсөл') },
];
export const groupLabel = (g: TuhGroup): string => TUH_GROUPS.find((x) => x.key === g)?.label() ?? g;

/** Орон сууцны 7 багц — `gdash.HOUSING_PKGS`-тэй ИЖИЛ түлхүүр (`bagtsKey`) */
export const TUH_HOUSING: readonly string[] = [
  'БАГЦ1', 'БАГЦ2', 'БАГЦ31', 'БАГЦ32', 'БАГЦ33', 'БАГЦ41', 'БАГЦ42',
];

const s = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Гэрээний мөрийн бүлэг.
 *
 * ⚠️ ДҮРЭМ (эх нь CASHFLOW_NEW-ийн шатлал, НЭРЭЭР биш КОДООР аль болох):
 *   1. Хэсгийн код `7` (бондын хүү) — ажил биш, ОРОХГҮЙ (`null`).
 *   2. Хэсгийн код `1` — ТЭЗҮ, зураг төсөл → `design`.
 *   3. Хэсгийн код `6` — газар чөлөөлөлт, цэвэрлэгээ → `other`.
 *   4. Хэсгийн код `5` эсвэл чартын ангилал «НИЙГМИЙН…» → `social`.
 *   5. «ОРОН СУУЦНЫ ХОРООЛОЛ»: орон сууцны 7 багц → `housing`, бусад
 *      (жишээ нь «БАГЦ 1- 4» нийлбэр мөр) → `other`.
 *   6. «ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ» → `external`.
 *   7. «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ» — газрын зургийн давхаргын гэр бүл pow/com →
 *      energy; эс бөгөөс 3-р түвшний нэр ба ажлын нэрээр (цахилгаан/холбоо/кВ →
 *      energy, дулааны станц/эх үүсвэр → heat, авто зам → other, бусад →
 *      networks).
 *   ⚠️ Гэр бүл `src` («эх үүсвэр») нь УС хангамжийн эх үүсвэрийг (Багц 10–15) ч
 *      агуулдаг (амьдаар шалгав, 2026-09-30) — түүгээр «Дулааны эх үүсвэр» гэж
 *      ангилбал усан сан, насос станц дулаанд орно. Тиймээс дулааныг НЭРЭЭР л.
 */
export function groupOf(row: Row): TuhGroup | null {
  const code = s(row[FIN_XL_TOTAL_CODE_FIELD]);
  if (code === '7') return null;
  if (code === '1') return 'design';
  if (code === '6') return 'other';
  const cat = s(finXlChartCat(row)).toUpperCase();
  if (code === '5' || cat.startsWith('НИЙГМИЙН')) return 'social';
  const key = pkgKeyOf(row[CASHFLOW_NEW.fields.pkg]);
  if (cat.startsWith('ОРОН СУУЦ')) return TUH_HOUSING.includes(key) ? 'housing' : 'other';
  if (cat.startsWith('ГАДНА ТОХИЖИЛТ')) return 'external';
  if (cat.startsWith('ИНЖЕНЕРИЙН')) {
    const fam = key ? PKG_FAMILY_BY_BAGTS[key] : undefined;
    if (fam === 'pow' || fam === 'com') return 'energy';
    const lvl3 = s(row.ajil_tuvshin3).toLowerCase();
    const name = s(row[CASHFLOW_NEW.fields.detail]).toLowerCase();
    if (/авто зам/.test(lvl3) || /авто зам/.test(name)) return 'other';
    if (/цахилгаан|холбоо/.test(lvl3) || (/кв|станц/.test(name) && !/дулаан/.test(name))) return 'energy';
    if (/дулааны станц|дулааны эх үүсвэр|дулаан хангамжийн эх/.test(name)) return 'heat';
    return 'networks';
  }
  return 'other';
}

/* ══════════════════════ БАГЦ ══════════════════════ */

/** Багцын төлөв — жишээний 6 төлөв. ⚠️ `stopped` эх сурвалжгүй тул ХЭЗЭЭ Ч оноогдохгүй (тайлбарт л) */
export type TuhStatus = 'done' | 'run' | 'late' | 'todo' | 'stopped' | 'none';
export const TUH_STATUS: { key: TuhStatus; icon: string; label: () => string; tone: 'good' | 'warn' | 'bad' | 'mute' }[] = [
  { key: 'done', icon: '✓', label: () => tr('Дууссан'), tone: 'good' },
  { key: 'run', icon: '●', label: () => tr('Хийгдэж байна'), tone: 'good' },
  { key: 'late', icon: '▲', label: () => tr('Хоцорсон'), tone: 'warn' },
  { key: 'todo', icon: '◌', label: () => tr('Эхлээгүй'), tone: 'bad' },
  { key: 'stopped', icon: '■', label: () => tr('Зогссон'), tone: 'bad' },
  { key: 'none', icon: '○', label: () => tr('Гэрээлээгүй'), tone: 'mute' },
];
export const statusMeta = (k: TuhStatus) => TUH_STATUS.find((x) => x.key === k) ?? TUH_STATUS[TUH_STATUS.length - 1];

/** Хоцорсонд тооцох зөрүү (pp) — `execReport.LATE_GAP`, `lagLevel`-ийн шар босготой ИЖИЛ */
export const TUH_LATE_GAP = 5;

/**
 * Багцын төлөв.
 *
 * ⚠️ ДҮРЭМ (хэрэглэгчтэй тохирсон, 2026-09-30):
 *   · Гэрээлээгүй — «Гэрээлсэн дүн» тэмдэглэгээтэй гэрээ алга;
 *   · Дууссан — гүйцэтгэл ≥ 100;
 *   · Эхлээгүй — гэрээтэй, гүйцэтгэл 0 эсвэл хэмжигдээгүй;
 *   · Хоцорсон — гүйцэтгэгчийн төлөвлөгөөнөөс ≥ 5 pp хоцорсон;
 *   · бусад — Хийгдэж байна.
 * ⚠️ «Зогссон» — системд эх сурвалжгүй, ОНООХГҮЙ.
 */
export function statusOf(p: { contracted: boolean; progress: number | null; gap: number | null }): TuhStatus {
  if (!p.contracted) return 'none';
  if (p.progress != null && p.progress >= 100) return 'done';
  if (p.progress == null || p.progress <= 0) return 'todo';
  if (p.gap != null && p.gap >= TUH_LATE_GAP) return 'late';
  return 'run';
}

export type TuhPkg = {
  /** `pkgKeyOf(bagts)`; диапазон/хоосон бол `cf:<OBJECTID>`; зураг төсөл бол `d:<OBJECTID>` */
  key: string;
  /** Багцын түлхүүр (`bagtsKey`) — газрын зураг, IPC, хуваарьтай холбоно. Диапазон мөрд `''` */
  pkgKey: string;
  /** Дэлгэцийн код — «БАГЦ-5.1» (түүхий бичиглэл) */
  code: string;
  /** Ажлын бүтэн нэр (`ajil_uilchilgee`) */
  name: string;
  group: TuhGroup;
  rows: Row[];
  /** Σ ХО дүн (гэрээ), ₮ — бүгд хоосон бол `null` */
  cost: number | null;
  /** «Гэрээлсэн дүн» тэмдэглэгээтэй мөр бий */
  contracted: boolean;
  contractor: string;
  client: string;
  contractNo: string;
  /** Гэрээт эхлэх/дуусах — мөрүүдийн MIN/MAX (мс) */
  start: number | null;
  end: number | null;
  /** Сарын төлөвлөгөөний `Cashflow_ID`-ууд */
  cfIds: number[];
  /** Захирамжийн дугаар/огноо — «Журам → Захирамж» ангилалд */
  orders: { no: string; date: number | null }[];
};

const numOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : null;
};
const dateOf = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(x) && x > 0 ? x : null;
};
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/**
 * ГЭРЭЭНИЙ МӨРҮҮД → ТУХ-ын багцууд.
 *
 * ⚠️ Нэг багцад (ижил `pkgKeyOf`, ижил бүлэг) олон гэрээ байж болно — НЭГТГЭНЭ
 *    (дүн нийлбэр, огноо MIN/MAX). Зураг төслийн мөр бүр ТУСДАА: нэг кодтой
 *    барилгын гэрээтэй («Багц 7.1» ТЭЗҮ ба «БАГЦ-7.1» барилга) нийлбэл мөнгө холилдоно.
 * ⚠️ Диапазон/хоосон кодтой мөр («БАГЦ 1-4») ТУСДАА багц — аль нэг багцад наалдахгүй
 *    (`pkgKeyOf`-ийн ⚠️).
 */
export function buildTuhPkgs(contracts: readonly Row[], contractedNote: string): TuhPkg[] {
  const F = CASHFLOW_NEW.fields;
  const byKey = new Map<string, TuhPkg>();
  for (const r of contracts) {
    const group = groupOf(r);
    if (!group) continue;
    const pkgKey = pkgKeyOf(r[F.pkg]);
    const oid = numOf(r[CASHFLOW_NEW.oid]) ?? 0;
    const key = group === 'design' ? `d:${oid}` : pkgKey ? `${group === 'housing' ? '' : group + ':'}${pkgKey}` : `cf:${oid}`;
    const cost = numOf(r[F.budget]);
    const cur = byKey.get(key);
    const order = s(r[F.orderNo]) ? { no: s(r[F.orderNo]), date: dateOf(r[F.orderDate]) } : null;
    const cfId = numOf(r.Cashflow_ID);
    if (cur) {
      cur.rows.push(r);
      if (cost != null) cur.cost = (cur.cost ?? 0) + cost;
      cur.contracted ||= s(r[F.amountNote]) === contractedNote;
      cur.contractor = uniq([...cur.contractor.split(' · '), s(r[F.contractor])]).join(' · ');
      cur.client = uniq([...cur.client.split(' · '), s(r[F.client])]).join(' · ');
      cur.contractNo = uniq([...cur.contractNo.split(' · '), s(r[F.contractNo])]).join(' · ');
      const st = dateOf(r[F.startDate]);
      const en = dateOf(r[F.endDate]);
      if (st != null && (cur.start == null || st < cur.start)) cur.start = st;
      if (en != null && (cur.end == null || en > cur.end)) cur.end = en;
      if (cfId != null) cur.cfIds.push(cfId);
      if (order) cur.orders.push(order);
      continue;
    }
    byKey.set(key, {
      key,
      pkgKey,
      code: s(r[F.pkg]) || '—',
      name: s(r[F.detail]),
      group,
      rows: [r],
      cost,
      contracted: s(r[F.amountNote]) === contractedNote,
      contractor: s(r[F.contractor]),
      client: s(r[F.client]),
      contractNo: s(r[F.contractNo]),
      start: dateOf(r[F.startDate]),
      end: dateOf(r[F.endDate]),
      cfIds: cfId != null ? [cfId] : [],
      orders: order ? [order] : [],
    });
  }
  const order = new Map(TUH_GROUPS.map((g, i) => [g.key, i]));
  return [...byKey.values()].sort((a, b) => (order.get(a.group)! - order.get(b.group)!)
    || a.code.localeCompare(b.code, 'mn', { numeric: true }));
}

/**
 * Багцын биет гүйцэтгэл (0–100).
 * ⚠️ Орон сууц — багцын БОДИТ гүйцэтгэл (`Finance.physLatest` · `pkgMonthsMap`,
 *    «Гүйцэтгэл» · «Багцын мэдээлэл»-ийн жагсаалттай ИЖИЛ эх; 2026-09-30 merge —
 *    урьд `loadFillPkgProgress`); бусад — гэрээний `guitsetgel_huvi` (дүнгээр
 *    жигнэсэн, хэмжигдээгүй мөр жинд орохгүй).
 */
export function progressOf(p: TuhPkg, fill: ReadonlyMap<string, number> | null): number | null {
  if (p.group === 'housing') return fill?.get(p.pkgKey) ?? null;
  let top = 0;
  let base = 0;
  let plain: number | null = null;
  for (const r of p.rows) {
    const v = numOf(r[CASHFLOW_NEW.fields.progressPct]);
    if (v == null) continue;
    const w = numOf(r[CASHFLOW_NEW.fields.budget]) ?? 0;
    if (w > 0) { top += w * v; base += w; } else plain ??= v;
  }
  return base > 0 ? top / base : plain;
}

/* ══════════════════════ ГЭРЭЭНИЙ ТӨЛӨВЛӨГӨӨ ══════════════════════ */

const ymOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * ГЭРЭЭНИЙ ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛ (0–100) — CASHFLOW_NEW-ийн сарын мөрүүдийн
 * (`Cashflow_huwi`, ажил бүрд нийлбэр 100) `ym` сар хүртэлх ХУРИМТЛАЛ.
 *
 * ⚠️ Олон гэрээтэй багцад — гэрээ бүрийн хуримтлалыг ХО дүнгээр жигнэнэ.
 * ⚠️ Сарын мөр огт бөглөгдөөгүй гэрээ жинд ОРОХГҮЙ; бүгд хоосон бол `null`
 *    (0 биш — «төлөвлөгөө 0%» гэж ХУДАЛ хэлэхгүй).
 */
export function cfPlanPctAt(
  plan: readonly CfPlanRow[],
  items: readonly { id: number; cost: number }[],
  ym: string,
): number | null {
  let top = 0;
  let base = 0;
  for (const it of items) {
    let has = false;
    let cum = 0;
    for (const r of plan) {
      if (r.id !== it.id || r.pct == null || r.start == null) continue;
      has = true;
      if (ymOf(r.start) <= ym) cum += r.pct;
    }
    if (!has) continue;
    const w = it.cost > 0 ? it.cost : 1;
    top += w * Math.min(100, cum);
    base += w;
  }
  return base > 0 ? top / base : null;
}

/** Багцын гэрээнүүд → `cfPlanPctAt`-ийн оролт */
export const cfItemsOf = (p: TuhPkg): { id: number; cost: number }[] => p.rows
  .map((r) => ({ id: numOf(r.Cashflow_ID) ?? -1, cost: numOf(r[CASHFLOW_NEW.fields.budget]) ?? 0 }))
  .filter((x) => x.id > 0);

/* ══════════════════════ 7 ХОНОГИЙН АХИЦ ══════════════════════ */

/**
 * Өнгөрсөн 7 хоногийн ахиц (pp) — блокийн түүхийн цуваа (`progressSeries(…,
 * 'day', 'latest')`)-аас: `today`-ийн байдлаарх утга − 7 хоногийн өмнөх утга.
 * ⚠️ Аль нэг агшинд хэмжилт алга бол `null` (0 биш).
 */
export function weekDelta(series: readonly { label: string; overall: number }[], today: string): number | null {
  const before = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(before.getTime())) return null;
  before.setUTCDate(before.getUTCDate() - 7);
  const wk = before.toISOString().slice(0, 10);
  let now: number | null = null;
  let then: number | null = null;
  for (const p of series) {
    if (p.label <= today) now = p.overall;
    if (p.label <= wk) then = p.overall;
  }
  return now != null && then != null ? now - then : null;
}

/* ══════════════════════ EV · PV · SPI ══════════════════════ */

/**
 * ОЛОГДСОН ӨРТӨГ (EV) ба ТӨЛӨВЛӨСӨН ӨРТӨГ (PV).
 *
 *     EV = ГЭРЭЭНИЙ ДҮН × биет гүйцэтгэл
 *     PV = ГЭРЭЭНИЙ ДҮН × төлөвлөгөөт гүйцэтгэл   (гэрээний / гүйцэтгэгчийн)
 *     SPI = EV ÷ PV · SV = EV − PV
 *
 * ⚠️ Хувь бүр 0–100. Аль нэг нь `null` бол тэр үзүүлэлт `null`. PV = 0 бол
 *    SPI утгагүй (`null`) — «∞» гэж харуулахгүй.
 */
export function earned(bac: number | null, actual: number | null, planContract: number | null, planContractor: number | null) {
  const ev = bac != null && actual != null ? (bac * actual) / 100 : null;
  const pvC = bac != null && planContract != null ? (bac * planContract) / 100 : null;
  const pvG = bac != null && planContractor != null ? (bac * planContractor) / 100 : null;
  return {
    ev,
    pvContract: pvC,
    pvContractor: pvG,
    svContract: ev != null && pvC != null ? ev - pvC : null,
    spiContract: ev != null && pvC ? ev / pvC : null,
    spiContractor: ev != null && pvG ? ev / pvG : null,
  };
}

/* ══════════════════════ IPC ══════════════════════ */

/** Хүлээгдэж буй дүнгийн талбарууд (HO_IPC) — ⚠️ одоогоор бүгд хоосон; хоосон бол `null` */
export const HO_PENDING = HO_IPC.pendingFields;

export type TuhIpc = {
  contracts: HoContract[];
  contractTotal: number | null;
  paid: number | null;
  paidPct: number | null;
  advance: number | null;
  /** Олгосон IPC-ийн дугаарууд (өсөх) */
  ipcNos: number[];
  /** Сүүлд олгосон гүйлгээ — «YYYY-MM-DD» */
  lastPaidDate: string | null;
  lastIpc: number | null;
  /** Хүлээгдэж буй дүн (төрийн сан · ХО хэлц · захиалагч) — бүгд хоосон бол `null` */
  pending: number | null;
};

const sumOrNull = (xs: (number | null)[]): number | null => {
  const k = xs.filter((x): x is number => x != null);
  return k.length ? k.reduce((a, b) => a + b, 0) : null;
};

/**
 * Багцын IPC нэгтгэл — `groupHo`-ийн гэрээнүүдийг `pkgKey`-ээр шүүнэ.
 * ⚠️ Гэрээний дүнг ГЭРЭЭНЭЭС (мөрөөс биш) — `HoContract`-ийн ⚠️.
 */
export function ipcOf(pkgKey: string, all: readonly HoContract[], ipcNumbers: (pays: readonly Row[]) => number[]): TuhIpc | null {
  if (!pkgKey) return null;
  const cs = all.filter((c) => c.key === pkgKey);
  if (!cs.length) return null;
  const pays = cs.flatMap((c) => c.pays);
  const contractTotal = sumOrNull(cs.map((c) => c.contractTotal));
  const paid = sumOrNull(cs.map((c) => c.paidTotal));
  const P = HO_IPC.payFields;
  let lastPaidDate: string | null = null;
  for (const r of pays) {
    const d = s(r[P.payDate]).slice(0, 10);
    if (d && (!lastPaidDate || d > lastPaidDate)) lastPaidDate = d;
  }
  const nos = ipcNumbers(pays);
  const pend = sumOrNull(pays.flatMap((r) => Object.values(HO_PENDING).map((f) => numOf(r[f]))));
  return {
    contracts: cs,
    contractTotal,
    paid,
    paidPct: paid != null && contractTotal ? (paid / contractTotal) * 100 : null,
    advance: sumOrNull(cs.map((c) => c.advanceTotal)),
    ipcNos: nos,
    lastPaidDate,
    lastIpc: nos.length ? nos[nos.length - 1] : null,
    /* ⚠️ Бүх утга 0 ч «хүлээгдэж буй дүн алга» гэсэн утгатай — 0-ийг `null`-оос ялгана */
    pending: pend,
  };
}

/* ══════════════════════ ХУВААРЬ («Хуваарь» модуль) ══════════════════════ */

/** Хуваарийн мөрийн хэрэгтэй хэсэг — `bagtsSheet.SheetRow`-ийн дэд олонлог */
export type PlanLikeRow = {
  work: string;
  depth: number;
  group: boolean;
  start: (number | null)[];
  end: (number | null)[];
  act: (number | null)[];
  hun: number | null;
  mashin: number | null;
};

const OK_LO = Date.UTC(2000, 0, 1);
const OK_HI = Date.UTC(2100, 0, 1);
const sane = (x: number | null | undefined): x is number => x != null && x > OK_LO && x < OK_HI;

/**
 * Мөрийн МУЖ — өөрийн ба бүх ДЭД мөрийн блокуудын MIN эхлэл / MAX дуусгалт.
 * ⚠️ «Хуваарь» харагдацын бүлгийн зурвасын дүрэмтэй ИЖИЛ (дэд ажлуудын MIN/MAX,
 *    `planProgress`-ийн ⚠️) — бүлгийн өөрийн огноо давамгайлахгүй.
 */
export function rowSpan(rows: readonly PlanLikeRow[], i: number): { start: number | null; end: number | null } {
  let start: number | null = null;
  let end: number | null = null;
  const take = (r: PlanLikeRow) => {
    for (let b = 0; b < r.end.length; b += 1) {
      const st = r.start[b];
      const en = r.end[b];
      if (sane(st) && (start == null || st < start)) start = st;
      if (sane(en) && (end == null || en > end)) end = en;
    }
  };
  const d0 = rows[i].depth;
  if (!rows[i].group) take(rows[i]);
  for (let j = i + 1; j < rows.length && rows[j].depth > d0; j += 1) if (!rows[j].group) take(rows[j]);
  if (start == null && end == null) take(rows[i]);
  return { start, end };
}

/** Мөрийн бодит гүйцэтгэл (0–1) — хэмжигдсэн блокуудын дундаж; нэг ч алга бол `null` */
export function rowAct(r: PlanLikeRow): number | null {
  const xs = r.act.filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? Math.min(1, xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** «Улсын комисс» мөр мөн эсэх */
export const isCommissionWork = (w: string) => /улсын\s+комисс/i.test(w);

/**
 * УЛСЫН КОМИССЫН ОГНОО — хуваарийн «Улсын комисс» мөрийн (дэд мөртэй бол
 * тэдгээрийн) хамгийн хожуу дуусгалт. Мөр байхгүй/огноо бөглөгдөөгүй бол `null`.
 */
export function commissionOf(rows: readonly PlanLikeRow[]): number | null {
  let out: number | null = null;
  rows.forEach((r, i) => {
    if (!isCommissionWork(r.work)) return;
    const e = rowSpan(rows, i).end;
    if (e != null && (out == null || e > out)) out = e;
  });
  return out;
}

/**
 * ГОЛ ҮЕ ШАТ — хуваарийн ДЭЭД түвшний (хамгийн бага гүн) мөрүүд, дуусгалтаараа.
 * ⚠️ Огноогүй мөр жагсаалтад «огноогүй» гэж үлдэнэ (хаяхгүй).
 */
export function milestonesOf(rows: readonly PlanLikeRow[]): { name: string; end: number | null; start: number | null; act: number | null }[] {
  if (!rows.length) return [];
  const top = Math.min(...rows.map((r) => r.depth));
  const out: { name: string; end: number | null; start: number | null; act: number | null }[] = [];
  rows.forEach((r, i) => {
    if (r.depth !== top || !r.work.trim()) return;
    const sp = rowSpan(rows, i);
    out.push({ name: r.work.trim(), start: sp.start, end: sp.end, act: rowAct(r) });
  });
  return out;
}

/** Хүн хүч / техник — НАВЧ мөрүүдийн нийлбэр; бүгд хоосон бол `null` */
export function resourcesOf(rows: readonly PlanLikeRow[]): { hun: number | null; mashin: number | null } {
  const leaf = rows.filter((r) => !r.group);
  return {
    hun: sumOrNull(leaf.map((r) => r.hun)),
    mashin: sumOrNull(leaf.map((r) => r.mashin)),
  };
}

/* ══════════════════════ ОГНОО ══════════════════════ */

export const DAY_MS = 86_400_000;
/** Хоёр огнооны зөрүү (хоног, бүхэл) — аль нэг нь `null` бол `null` */
export const daysBetween = (a: number | null, b: number | null): number | null =>
  a != null && b != null ? Math.round((b - a) / DAY_MS) : null;

/** Гэрээт хугацааны өнгөрсөн хувь (0–100) — муж алга бол `null` */
export function elapsedPct(start: number | null, end: number | null, now: number): number | null {
  if (start == null || end == null || end <= start) return null;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

/** `bagtsKey`-ийн дахин экспорт — модулиуд нэг эхээс импортлоно */
export { bagtsKey };

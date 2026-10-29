/**
 * ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛИЙН МУРУЙ — «Гүйцэтгэл бөглөх» хуудасны ХУВААРЬТ
 * үндэслэсэн, сар тутмын өссөн хувь.
 *
 *     cumPct = (тухайн сар хүртэлх мөнгө) / (12 сарын ЦОНХНЫ нийлбэр)
 *
 * Хуваагч нь ТОГТМОЛ 12 сарын цонхны нийлбэр тул муруй нь цонх дуусахад ҮРГЭЛЖ
 * 100% болно. Дэлгэц дээр «2026-09-д төсөл 100% дуусна» гэж гарч байсан нь
 * ЯГ ЭНЭ: төсөл бодитоор 2027-12 хүртэл үргэлжилдэг.
 *
 * Улмаас Багц 1-ийн «Б.» мөрийн өөрийн огноо 2027-04-20-нд дуусдаг ч дэд
 * ажлууд нь 2028-01-01 хүртэл үргэлжилдэг байв: муруй 2027-08-д 100%
 * хүрч, «Хуваарь» дээр ажил үргэлжилсээр байхад «төлөвлөгөө дууссан» гэж
 * ХУДАЛ хэлж байлаа.
 *
 * Тиймээс `planCurve`-д өгөхөөс ӨМНӨ бүлгийн мөрүүдийн огноог цэвэрлэдэг БАЙВ.
 */
import { PKGS, loadSchema, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows, planCurve, msToDay } from '@/modules/sheet/bagtsSheet';
import { t as tr } from './i18nCore';
import { pct } from './format';
import { bagtsKey, isConstructionNo } from './services';
import { uniqueBlockCounts } from './blockProgress';
import { countPlanRows, loadPkgPlan, planPctFromMonths } from './huvaariObyem';
import { register } from './dataBus';

/** Нэг сарын цэг */
export type PlanPoint = {
  /** «2026-09» */
  label: string;
  /** Төлөвлөгөөт хувь 0–100 */
  pct: number;
  /**
   * ТУХАЙН САРД төлөвлөсөн обьём (хуваарийн сарын задаргаанаас).
   */
  vol: number | null;
};

export type PlanCurve = {
  months: PlanPoint[];
  /** Хуудас бүрийн муруй — `Pkg.key`-ээр («b1_9f») түлхүүрлэсэн */
  bySheet: Map<string, PlanPoint[]>;
  /** Багц бүрийн муруй — `bagtsKey(Pkg.group)`-оор; `Pack.key`-тэй ТААРНА */
  byBagts: Map<string, PlanPoint[]>;
  /** Хуваарийн муж (ms) — тэнхлэгийг эндээс тогтооно */
  from: number | null;
  to: number | null;
  /**
   * УНШИГДААГҮЙ хуудсууд (`Pkg.key`) — бүдүүвч эсвэл мөр нь (дахин
   * оролдлогын дараа ч) татагдаагүй.
   */
  failed: string[];
};

const OK_LO = Date.UTC(2000, 0, 1);
const OK_HI = Date.UTC(2100, 0, 1);
const sane = (ms: unknown): ms is number => typeof ms === 'number'
  && Number.isFinite(ms) && ms >= OK_LO && ms <= OK_HI;

/** Сарын СҮҮЛИЙН өдөр — тухайн сарын эцсийн байдлаар үнэлнэ */
const monthEnd = (y: number, m: number) => Date.UTC(y, m + 1, 0);
const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;

/** Тэнхлэгийн дээд хязгаар (сар) — гажигтай огнооноос сэргийлнэ */
export const AXIS_MAX_MONTHS = 120;

/**
 * САРЫН ТЭНХЛЭГ — `from`-ын сараас `to`-гийн сар хүртэл (цэвэр функц, тестлэгдэнэ).
 */
export function monthAxis(from: number, to: number): { axis: { label: string; asOf: number }[]; capped: boolean } {
  const d0 = new Date(from);
  const d1 = new Date(to);
  const axis: { label: string; asOf: number }[] = [];
  let capped = false;
  for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); ;) {
    axis.push({ label: ym(y, m), asOf: monthEnd(y, m) });
    if (y === d1.getUTCFullYear() && m === d1.getUTCMonth()) break;
    m += 1; if (m > 11) { m = 0; y += 1; }
    /* Гажигтай өгөгдлөөс сэргийлэх дээд хязгаар */
    if (axis.length > AXIS_MAX_MONTHS) { capped = true; break; }
  }
  return { axis, capped };
}

/** Нэг хуудасны бэлтгэсэн төлөв */
type Sheet = {
  key: string;
  group: string;
  rows: Awaited<ReturnType<typeof loadRows>>['rows'];
  /** Хуудасны ӨӨРИЙН блокийн тоо — `planCurve`-ийн дундаж үүгээр */
  nBld: number;
  /** Блокийн шошгууд (`Schema.bld`) — багц доторх давхардлыг ялгахад */
  bld: readonly string[];
  nUniq: number;
  /** «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» мөрийн индекс; олдоогүй бол `-1` */
  bi: number;
  /** Сарын задаргааны хувь бодогч (задаргаагүй бол `undefined`) */
  planPct?: (row: { des: number | null; start: (number | null)[]; end: (number | null)[] }, b: number, asOf: number) => number | null;
  /** Сар → тухайн сард төлөвлөсөн обьёмын нийлбэр */
  volByMonth: Map<string, number>;
  from: number;
  to: number;
};

/**
 * Хуваариас төлөвлөгөөт муруйг бодно.
 */
/**
 * МУРУЙД ХЭРЭГТЭЙ БАГАНУУД — `loadRows`-ийн `fields` (2026-10-04, гүйцэтгэлийн аудит).
 */
export const planFields = (sc: Schema): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.fillDate, sc.f.asOf, sc.f.des,
  sc.f.wD, sc.f.vol, sc.f.unit, sc.f.money,
  ...sc.start, ...sc.end,
].filter((x): x is string => !!x))];

/**
 * ЗАДАРГААНЫ ХҮСНЭГТ ХООСОН УУ — `countPlanRows`-ийн 5 минутын кэш.
 */
let planEmptyP: Promise<boolean> | null = null;
let planEmptyAt = 0;
register(() => { planEmptyP = null; }, ['HUVAARI_OBYEM']);
function planTableEmpty(): Promise<boolean> {
  if (!planEmptyP || Date.now() - planEmptyAt > 5 * 60_000) {
    planEmptyAt = Date.now();
    const raw = countPlanRows();
    const mine = raw.then((c) => c === 0);
    planEmptyP = mine;
    void raw.then((c) => { if (c == null && planEmptyP === mine) planEmptyP = null; });
  }
  return planEmptyP;
}

export async function loadPlanCurve(): Promise<PlanCurve> {
  const sheets: Sheet[] = [];
  /** Уншигдаагүй хуудсууд — `PlanCurve.failed` */
  const failed: { key: string; group: string }[] = [];
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch {
      await new Promise((res) => setTimeout(res, 800));
      return fn();
    }
  };
  const emptyP = planTableEmpty();

  await Promise.all(PKGS.map(async (pkg) => {
    let sc: Awaited<ReturnType<typeof loadSchema>>;
    let r: Awaited<ReturnType<typeof loadRows>>;
    /** Сарын обьёмын задаргаа — мөрийн уншилттай ЗЭРЭГ (доорх 2026-10-04) */
    let obP: Promise<Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null> = Promise.resolve(null);
    try {
      sc = await retry(() => loadSchema(pkg));
      if (!sc.bld.length) return;
      const s = sc;
      obP = emptyP.then((empty) => (empty ? null : loadPkgPlan(pkg.key).then((x) => x.plan))).catch(() => null);
      r = await retry(() => loadRows(pkg, s, undefined, planFields(s), { persist: true }));
    } catch (e) {
      failed.push({ key: pkg.key, group: bagtsKey(pkg.group) });
      console.warn(`[selbe] төлөвлөгөөт муруй: ${pkg.key} уншигдсангүй — багц/төслийн муруй гаргахгүй`, e);
      return;
    }
    if (!r.rows.length) return;

    const rows = r.rows;

    /* Хуваарийн муж — АЖЛЫН мөрүүдийн огноогоор */
    let from: number | null = null;
    let to: number | null = null;
    for (const row of rows) {
      for (let b = 0; b < sc.bld.length; b += 1) {
        const s = row.start[b];
        const e = row.end[b];
        if (!sane(s) || !sane(e) || e < s) continue;
        if (from == null || s < from) from = s;
        if (to == null || e > to) to = e;
      }
    }
    if (from == null || to == null) return;

    /*
     * САРЫН ОБЬЁМЫН ЗАДАРГАА — байвал төлөвлөгөөт хувь ТҮҮГЭЭР (S-муруй).
     */
    const obPlan = await obP;
    const planPct = obPlan && obPlan.size
      ? (row: { des: number | null; start: (number | null)[]; end: (number | null)[] }, b: number, asOf: number): number | null => {
        if (row.des == null) return null;
        const blok = sc.bld[b];
        const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
        const s = row.start[b];
        const e = row.end[b];
        return m ? planPctFromMonths(m, asOf, sane(s) && sane(e) ? { start: s, end: e } : null) : null;
      }
      : undefined;

    /*
     * САРЫН ОБЬЁМЫН НИЙЛБЭР — зөвхөн ХАРУУЛАХ зорилгоор.
     */
    const volByMonth = new Map<string, number>();
    if (obPlan) {
      for (const byBlok of obPlan.values()) {
        for (const m of byBlok.values()) {
          for (const [sar, v] of m) {
            if (v != null && Number.isFinite(v)) volByMonth.set(sar, (volByMonth.get(sar) ?? 0) + v);
          }
        }
      }
    }

    const bi = rows.findIndex((x) => isConstructionNo(x.no));
    if (bi < 0) {
      failed.push({ key: pkg.key, group: bagtsKey(pkg.group) });
      console.warn(`[selbe] төлөвлөгөөт муруй: ${pkg.key} — «Б.» мөр олдсонгүй, багц/төслийн муруй гаргахгүй`);
      return;
    }

    sheets.push({
      key: pkg.key,
      volByMonth,
      group: bagtsKey(pkg.group),
      rows,
      nBld: sc.bld.length,
      bld: sc.bld,
      nUniq: sc.bld.length,
      bi,
      planPct,
      from,
      to,
    });
  }));

  const failedKeys = failed.map((x) => x.key);
  if (!sheets.length) {
    return { months: [], bySheet: new Map(), byBagts: new Map(), from: null, to: null, failed: failedKeys };
  }
  /** Хуудас нь унасан багцууд — тэдний нэгтгэсэн муруй ГАРАХГҮЙ */
  const failedGroups = new Set(failed.map((x) => x.group));

  const pkgOrder = new Map(PKGS.map((p, i) => [p.key, i]));
  sheets.sort((a, b) => (pkgOrder.get(a.key) ?? 0) - (pkgOrder.get(b.key) ?? 0));
  const byGroup = new Map<string, Sheet[]>();
  for (const sh of sheets) byGroup.set(sh.group, [...(byGroup.get(sh.group) ?? []), sh]);
  for (const g of byGroup.values()) {
    uniqueBlockCounts(g.map((x) => x.bld)).forEach((n, i) => { g[i].nUniq = n; });
  }

  const from = Math.min(...sheets.map((x) => x.from));
  const to = Math.max(...sheets.map((x) => x.to));

  /* Сарын тэнхлэг — хуваарийн ЭХНЭЭС ТӨГСГӨЛ хүртэл */
  const { axis, capped } = monthAxis(from, to);
  if (capped) {
    const last = axis[axis.length - 1].asOf;
    for (const sh of sheets) {
      if (sh.to > last) failedKeys.push(`${sh.key}: ${tr('хуваарийн огноо тэнхлэгийн хязгаараас ({0} сар) гадуур — {1}', String(AXIS_MAX_MONTHS), msToDay(sh.to))}`);
    }
  }
  const asOfs = axis.map((a) => a.asOf);

  const bySheet = new Map<string, PlanPoint[]>();
  /** багц → сар бүрийн (нийлбэр, блокийн тоо) */
  const gAcc = new Map<string, { s: number; n: number }[]>();
  const tAcc: { s: number; n: number }[] = axis.map(() => ({ s: 0, n: 0 }));

  for (const sh of sheets) {
    const curves = planCurve(sh.rows, sh.nBld, asOfs, sh.planPct);
    const pts: PlanPoint[] = [];
    const gArr = gAcc.get(sh.group) ?? axis.map(() => ({ s: 0, n: 0 }));
    /* Хуваарь ЭХЛЭХЭЭС ӨМНӨХ сарууд — тухайн хуудсанд төлөвлөгөө байхгүй */
    const startYm = ym(new Date(sh.from).getUTCFullYear(), new Date(sh.from).getUTCMonth());
    /* Хуваарь ДУУСАХ сар — түүнээс хойш цэг ГАРАХГҮЙ */
    const endYm = ym(new Date(sh.to).getUTCFullYear(), new Date(sh.to).getUTCMonth());
    axis.forEach((a, i) => {
      const plan = curves[i]?.[sh.bi];
      if (plan == null || !Number.isFinite(plan)) return;
      if (a.label < startYm || a.label > endYm) {
        if (!sh.nUniq) return;
        gArr[i].s += plan * sh.nBld;
        gArr[i].n += sh.nBld;
        tAcc[i].s += plan * sh.nBld;
        tAcc[i].n += sh.nBld;
        return;
      }
      pts.push({ label: a.label, pct: plan * 100, vol: sh.volByMonth.get(a.label) ?? null });
      if (!sh.nUniq) return;
      /* Багц/төслийн нэгтгэлд БЛОКИЙН ТООГООР жигнэнэ. */
      gArr[i].s += plan * sh.nBld;
      gArr[i].n += sh.nBld;
      tAcc[i].s += plan * sh.nBld;
      tAcc[i].n += sh.nBld;
    });
    if (pts.length) bySheet.set(sh.key, pts);
    gAcc.set(sh.group, gArr);
  }

  /**
   * Багц бүрийн ХУВААРИЙН МУЖ — доторх хуудсуудынхаа нэгдэл.
   */
  /** багц → сар → обьёмын нийлбэр */
  const gVol = new Map<string, Map<string, number>>();
  /** төсөл → сар → обьёмын нийлбэр */
  const tVol = new Map<string, number>();
  for (const sh of sheets) {
    if (!sh.nUniq) continue;
    const g = gVol.get(sh.group) ?? new Map<string, number>();
    for (const [sar, v] of sh.volByMonth) {
      g.set(sar, (g.get(sar) ?? 0) + v);
      tVol.set(sar, (tVol.get(sar) ?? 0) + v);
    }
    gVol.set(sh.group, g);
  }

  const gRange = new Map<string, { a: string; z: string }>();
  for (const sh of sheets) {
    const a = ym(new Date(sh.from).getUTCFullYear(), new Date(sh.from).getUTCMonth());
    const z = ym(new Date(sh.to).getUTCFullYear(), new Date(sh.to).getUTCMonth());
    const cur = gRange.get(sh.group);
    gRange.set(sh.group, {
      a: cur && cur.a < a ? cur.a : a,
      z: cur && cur.z > z ? cur.z : z,
    });
  }

  const byBagts = new Map<string, PlanPoint[]>();
  for (const [g, arr] of gAcc) {
    if (failedGroups.has(g)) continue;
    const rg = gRange.get(g);
    const pts: PlanPoint[] = [];
    axis.forEach((a, i) => {
      if (rg && (a.label < rg.a || a.label > rg.z)) return;
      if (arr[i].n > 0) {
        pts.push({
          label: a.label,
          pct: (arr[i].s / arr[i].n) * 100,
          vol: gVol.get(g)?.get(a.label) ?? null,
        });
      }
    });
    if (pts.length) byBagts.set(g, pts);
  }

  const months: PlanPoint[] = [];
  axis.forEach((a, i) => {
    if (failed.length) return;
    if (tAcc[i].n > 0) {
      months.push({
        label: a.label,
        pct: (tAcc[i].s / tAcc[i].n) * 100,
        vol: tVol.get(a.label) ?? null,
      });
    }
  });

  return { months, bySheet, byBagts, from, to, failed: failedKeys };
}

/**
 * ТӨЛӨВЛӨГӨӨТ ХУВЬ — ТОДОРХОЙ ӨДРИЙН байдлаар (цэвэр функц).
 */
export function planPctAt(
  series: ReadonlyArray<{ label: string; pct: number }>,
  at: string,
): number | null {
  const y = Number(at.slice(0, 4));
  const mo = Number(at.slice(5, 7));
  const day = Number(at.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const cur = at.slice(0, 7);
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const frac = Number.isFinite(day) ? Math.max(0, Math.min(1, day / days)) : 1;
  let p1: number | null = null;
  let p0: number | null = null;
  let past: { label: string; pct: number } | null = null;
  for (const pt of series) {
    if (pt.label === cur) p1 = pt.pct;
    else if (pt.label === prev) p0 = pt.pct;
    if (pt.label < cur && (!past || pt.label > past.label)) past = pt;
  }
  if (p1 != null) return (p0 ?? 0) + (p1 - (p0 ?? 0)) * frac;
  return past ? past.pct : null;
}

/**
 * ХУВААРИЙН ХАМРАЛТ (%) — төлөвлөгөөт муруйн ТӨГСГӨЛИЙН утга, 0–100 (цэвэр функц).
 */
export function planCoverage(series: ReadonlyArray<{ label: string; pct: number }> | null | undefined): number | null {
  if (!series?.length) return null;
  let last = series[0];
  for (const p of series) if (p.label > last.label) last = p;
  return Number.isFinite(last.pct) ? Math.max(0, Math.min(100, last.pct)) : null;
}

export const PLAN_COVERAGE_MIN = 95;

/** Хуваарь дүгнэхэд хангалттай хамарсан уу — мэдэгдэхгүй (`null`) бол ҮГҮЙ (2026-10-22) */
export const coverageOk = (c: number | null | undefined): boolean => c != null && c >= PLAN_COVERAGE_MIN;

/**
 * «хуваарь X% хамарсан» — «Төлөвлөсөн %»-ийн хажууд (2026-10-22, аудит). Бүрэн (≥ 99.95) эсвэл
 * мэдэгдэхгүй бол '' — бүрэн хуваарьт дуу чимээ нэмэхгүй.
 */
export const coverageNote = (c: number | null | undefined): string =>
  (c == null || c >= 99.95 ? '' : tr('хуваарь {0} хамарсан', pct(c, 1)));

/**
 * ХЭМЖИЛТИЙН ӨДӨР — төлөвлөгөөг (`planPctAt`) ЯМАР өдрөөр жишихийг сонгоно.
 *   · `physAt` хүчинтэй ба тухайн сард багтана → тэр өдөр;
 *   · `physAt` алга ба сар нь ОДООГИЙН сар → ӨНӨӨДӨР;
 *   · бусад үед → сарын эцэс (`-31`, хуучин зан төлөв).
 */
export function measureDayOf(label: string, physAt: string | null | undefined, today: string): string {
  if (physAt && /^\d{4}-\d{2}-\d{2}$/.test(physAt) && physAt.slice(0, 7) === label) return physAt;
  if (label === today.slice(0, 7)) return today;
  return `${label}-31`;
}

/**
 * КЭШТЭЙ МУРУЙ (5 мин) — «Нэгтгэл гүйцэтгэл»-ийн дэлгэц ба удирдлагын тайлан
 * НЭГ хуулбарыг хуваалцана (2026-09-25).
 */
let curveP: Promise<PlanCurve> | null = null;
let curveAt = 0;
register(() => { curveP = null; }, ['BAGTS_SHEET', 'HUVAARI_OBYEM']);

export function loadPlanCurveCached(): Promise<PlanCurve> {
  if (!curveP || Date.now() - curveAt > 5 * 60_000) {
    curveAt = Date.now();
    const mine = loadPlanCurve();
    curveP = mine;
    mine.catch(() => { if (curveP === mine) curveP = null; });
    mine.then((pc) => { if (pc.failed.length && curveP === mine) curveP = null; }, () => {});
  }
  return curveP;
}

/**
 * УДИРДЛАГЫН ТАЙЛАН — ХУГАЦААНЫ ӨӨРЧЛӨЛТ (өсөлт · бууралт), ЦЭВЭР тооцоо (сүлжээгүй, React-гүй — `execPeriodCalc.check.mjs`).
 */
import { t as tr } from '@/lib/i18nCore';
import { dayKey, num, pct } from '@/lib/format';

export type ExecPeriodKey = '7d' | '30d' | 'thisMonth' | 'prevMonth' | 'custom';
/** Хугацаа — `from` · `to` хоёулаа ОРНО (YYYY-MM-DD) */
export type ExecPeriod = { key: ExecPeriodKey; from: string; to: string };

export const PERIOD_KEYS: readonly ExecPeriodKey[] = ['7d', '30d', 'thisMonth', 'prevMonth', 'custom'];
export const periodLabel = (k: ExecPeriodKey): string => ({
  '7d': tr('7 хоног'), '30d': tr('30 хоног'), thisMonth: tr('Энэ сар'), prevMonth: tr('Өмнөх сар'), custom: tr('Огноо сонгох'),
})[k];

const isDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Хугацааг тооцно. `custom` буруу/хоосон бол 30 хоног (түлхүүр нь `custom` хэвээр — оролт харагдана).
 */
export function periodOf(key: ExecPeriodKey, now: number, custom?: { from?: string; to?: string }): ExecPeriod {
  const today = dayKey(now);
  const d = new Date(now);
  // Inclusive local calendar days, including today (also safe across DST).
  const startOfLast = (days: number) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - days + 1).getTime());
  if (key === '7d') return { key, from: startOfLast(7), to: today };
  if (key === 'thisMonth') return { key, from: dayKey(new Date(d.getFullYear(), d.getMonth(), 1).getTime()), to: today };
  if (key === 'prevMonth') {
    return {
      key,
      from: dayKey(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()),
      to: dayKey(new Date(d.getFullYear(), d.getMonth(), 0).getTime()),
    };
  }
  if (key === 'custom' && isDay(custom?.from) && isDay(custom?.to) && custom.from <= custom.to) {
    return { key, from: custom.from, to: custom.to };
  }
  return { key, from: startOfLast(30), to: today };
}

export type ExecDelta = {
  prev: number | null;
  now: number | null;
  delta: number | null;
  /** Цэгийн огноо (YYYY-MM-DD) — хэмжилт/бүртгэл хэзээнийх вэ */
  prevAt?: string | null;
  nowAt?: string | null;
  /** Эхнээс өмнө цэг байгаагүй тул хугацааны ЭХНИЙ цэгтэй харьцуулав (тайлбарт нэрлэнэ) */
  prevInside?: boolean;
};

export type ProgressPoint = { at: string; v: number | null };

export type ExecDeltaInput = {
  /** Орон сууцны биет гүйцэтгэлийн өдрийн түүх — сарын нэгтгэлээс авч БОЛОХГҮЙ. */
  housing: readonly ProgressPoint[];
  packs: readonly { key: string; label: string; points: readonly ProgressPoint[] }[];
  /** IPC төлбөр — огноо (epoch ms, байхгүй бол null) ба дүн; `key` = багцын түлхүүр (`finPkgKey`, санхүүгийн мөртэй ижил) */
  pays: readonly { at: number | null; amount: number | null; key?: string }[];
  /** Нийт олголт — зөвхөн уншилт амжилттай эсэх (null); түүхэн үлдэгдлийг `pays`-аас бодно. */
  givenTotal: number | null;
  /** ХАБ өдрийн бүртгэл — `workforce.detail.days` */
  days: readonly { key: string; workers: number | null; technik: number | null }[];
  /** Зөвшөөрөл — төлөв ба шийдвэрийн огноо; `null` = бүртгэл холбогдоогүй */
  zov: readonly { kind: 'ok' | 'no' | 'wait' | 'unknown'; at: number | null }[] | null;
};

export type ExecDeltas = {
  period: ExecPeriod;
  housing: ExecDelta;
  packs: { key: string; label: string; prev: number | null; now: number | null; delta: number | null }[];
  /** `delta` = хугацаанд олгосон ₮; `count` төлбөрийн тоо; `undated` огноогүй (тоологдоогүй) төлбөр */
  given: ExecDelta & { count: number; undated: number };
  /** Багц бүрд хугацаанд олгосон ₮ (түлхүүр = `pays[].key`) — багцын санхүүгийн мөрийн хажууд */
  givenByKey: Record<string, number>;
  workers: ExecDelta;
  technik: ExecDelta;
  /** Хугацаанд шийдвэрлэгдсэн зөвшөөрөл; `null` = бүртгэл холбогдоогүй */
  zov: { ok: number; no: number; wait: number } | null;
  /** Сарын цуваа (график) — ачаалагч тавина (`computeSeries`); хугацаанаас хамаарахгүй */
  series?: ExecSeries;
};

/* ══════════════ Сарын цуваа — график (2026-10-28, хэрэглэгч: «цаг хугацааны график болго») ══════════════ */

export type SeriesInput = {
  /** Сарын цэг — `Finance.aggregateMonths` (бүх тэнхлэг; `phys` null = хэмжилтгүй сар, `given` тухайн сарын олголт ₮) */
  months: readonly { label: string; phys: number | null; given: number }[];
  /** Орон сууцны хуваарийн муруй — `Finance.projectPlanOf` (`label` YYYY-MM · `pct` 0–100) */
  plan: readonly { label: string; pct: number }[];
  packs: readonly { key: string; label: string; kind: 'build' | 'infra'; months: readonly { label: string; phys: number | null }[] }[];
  /** Гэрээлсэн нийт дүн ₮ (`fin.planTotal`) — хуримтлагдсан олголтын хуваарь */
  planTotal: number;
  /** Одоогийн сар YYYY-MM — тэнхлэгийн төгсгөл */
  nowYm: string;
};

export type ExecSeries = {
  /** YYYY-MM — эхний өгөгдөлтэй сараас одоогийн сар хүртэл */
  months: string[];
  housingPlan: (number | null)[];
  housingActual: (number | null)[];
  packs: { key: string; label: string; kind: 'build' | 'infra'; values: (number | null)[] }[];
  /** Сар бүрийн олголт ₮ (огноотой төлбөрөөр) — баганан график */
  paidMonthly: number[];
  /** Хуримтлагдсан олголт ₮ (тэнхлэгээс өмнөх олголт эхний цэгт орно) */
  paidCum: number[];
  /** Хуримтлагдсан олголт ÷ гэрээлсэн нийт, 0–100; гэрээлсэн дүн 0 бол null */
  paidCumPct: (number | null)[];
};

/**
 * Сарын цуваа — тэнхлэг нь `months`-ийн эхний ӨГӨГДӨЛТЭЙ (хэмжилт · олголт · төлөвлөгөө) сараас `nowYm` хүртэл.
 */
export function computeSeries(i: SeriesInput): ExecSeries {
  const planBy = new Map(i.plan.map((p) => [p.label, p.pct]));
  const all = [...i.months].sort((a, b) => a.label.localeCompare(b.label)).filter((m) => m.label <= i.nowYm);
  let cum = 0;
  const cumBy = new Map<string, number>();
  for (const m of all) { cum += m.given || 0; cumBy.set(m.label, cum); }
  const first = all.findIndex((m) => m.phys != null || (m.given || 0) !== 0 || planBy.has(m.label));
  const axis = first < 0 ? [] : all.slice(first);
  const months = axis.map((m) => m.label);
  const packVal = (pm: readonly { label: string; phys: number | null }[]) => {
    const by = new Map(pm.map((m) => [m.label, m.phys]));
    return months.map((l) => by.get(l) ?? null);
  };
  return {
    months,
    housingPlan: months.map((l) => planBy.get(l) ?? null),
    housingActual: axis.map((m) => m.phys),
    packs: i.packs.map((p) => ({ key: p.key, label: p.label, kind: p.kind, values: packVal(p.months) })),
    paidMonthly: axis.map((m) => m.given || 0),
    paidCum: months.map((l) => cumBy.get(l) ?? 0),
    paidCumPct: months.map((l) => (i.planTotal > 0 ? ((cumBy.get(l) ?? 0) / i.planTotal) * 100 : null)),
  };
}

/** Сонгосон хугацааны сарууд тэнхлэг дээр — [эхний, сүүлийн] индекс; тэнхлэгт байхгүй бол null */
export function bandOf(months: readonly string[], period: ExecPeriod): [number, number] | null {
  const a = period.from.slice(0, 7);
  const b = period.to.slice(0, 7);
  let i0 = -1;
  let i1 = -1;
  months.forEach((m, i) => {
    if (m >= a && m <= b) { if (i0 < 0) i0 = i; i1 = i; }
  });
  return i0 < 0 ? null : [i0, i1];
}

/** Цуваанаас [from, to]-гийн эхнээс ӨМНӨХ сүүлийн ба төгсгөл хүртэлх сүүлийн цэг */
export function seriesDelta(points: readonly { at: string; v: number | null }[], from: string, to: string): ExecDelta {
  let prev: { at: string; v: number } | null = null;
  let first: { at: string; v: number } | null = null;
  let now: { at: string; v: number } | null = null;
  for (const p of [...points].sort((a, b) => a.at.localeCompare(b.at))) {
    if (p.v == null || !Number.isFinite(p.v)) continue;
    if (p.at < from) prev = { at: p.at, v: p.v };
    else if (p.at <= to && !first) first = { at: p.at, v: p.v };
    if (p.at <= to) now = { at: p.at, v: p.v };
  }
  const base = prev ?? first;
  const fresh = !!now && !!base && now.at !== base.at;
  return {
    prev: base?.v ?? null,
    now: now?.v ?? null,
    delta: fresh && now && base ? now.v - base.v : null,
    prevAt: base?.at ?? null,
    nowAt: now?.at ?? null,
    prevInside: !prev && !!first,
  };
}

export function computeExecDeltas(i: ExecDeltaInput, period: ExecPeriod): ExecDeltas {
  const { from, to } = period;
  let inPeriod = 0;
  let beforePeriod = 0;
  let count = 0;
  let undated = 0;
  const givenByKey: Record<string, number> = {};
  for (const p of i.pays) {
    if (p.amount == null || !Number.isFinite(p.amount)) continue;
    if (p.at == null || !Number.isFinite(p.at)) { undated += 1; continue; }
    const k = dayKey(p.at);
    if (k < from) beforePeriod += p.amount;
    if (k >= from && k <= to) {
      inPeriod += p.amount;
      count += 1;
      if (p.key) givenByKey[p.key] = (givenByKey[p.key] ?? 0) + p.amount;
    }
  }
  const givenNow = i.givenTotal == null ? null : beforePeriod + inPeriod;
  const dayPts = (sel: (d: ExecDeltaInput['days'][number]) => number | null) => i.days.map((d) => ({ at: d.key, v: sel(d) }));
  let zov: ExecDeltas['zov'] = null;
  if (i.zov) {
    zov = { ok: 0, no: 0, wait: 0 };
    for (const z of i.zov) {
      if (z.at == null) continue;
      const k = dayKey(z.at);
      if (k < from || k > to) continue;
      if (z.kind === 'ok') zov.ok += 1;
      else if (z.kind === 'no') zov.no += 1;
      else if (z.kind === 'wait') zov.wait += 1;
    }
  }
  return {
    period,
    housing: seriesDelta(i.housing, from, to),
    packs: i.packs.map((p) => {
      const d = seriesDelta(p.points, from, to);
      return { key: p.key, label: p.label, prev: d.prev, now: d.now, delta: d.delta };
    }),
    given: {
      prev: givenNow == null ? null : beforePeriod,
      now: givenNow,
      delta: givenNow == null ? null : inPeriod,
      count,
      undated,
    },
    givenByKey,
    workers: seriesDelta(dayPts((d) => d.workers), from, to),
    technik: seriesDelta(dayPts((d) => d.technik), from, to),
    zov,
  };
}

/* ══════════════ Текст ══════════════ */

export type Trend = { text: string; tone: 'good' | 'bad' | 'mute' };

/**
 * Зөрүүний текст — `pp` нэгж хувь · `n` тоо · `mnt` ₮. `upGood` өгвөл өнгө (өсөлт сайн/муу), өгөхгүй бол саарал.
 */
export function deltaText(delta: number | null, unit: 'pp' | 'n' | 'mnt', o: { upGood?: boolean; arrows?: boolean } = {}): Trend | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const a = Math.abs(delta);
  const body = unit === 'pp' ? tr('{0} н.х', num(a, 1)) : unit === 'mnt' ? `${num(a)} ₮` : num(a);
  const zero = unit === 'pp' ? a < 0.05 : unit === 'mnt' ? a < 1 : a < 0.5;
  const sign = zero ? '' : delta > 0 ? '+' : '−';
  const arrow = o.arrows === false ? '' : zero ? '= ' : delta > 0 ? '▲ ' : '▼ ';
  const tone: Trend['tone'] = zero || o.upGood == null ? 'mute' : (delta > 0) === o.upGood ? 'good' : 'bad';
  return { text: `${arrow}${sign}${body}`, tone };
}

/** Нэг багцын биет гүйцэтгэлийн өөрчлөлт — багцын жагсаалтын мөрийн хажууд (хэмжилтгүй бол null) */
export function packTrendOf(d: ExecDeltas | null, key: string, arrows = true): Trend | null {
  const p = d?.packs.find((x) => x.key === key);
  return p ? deltaText(p.delta, 'pp', { upGood: true, arrows }) : null;
}

/** Нэг багцад хугацаанд олгосон ₮ — санхүүгийн мөрийн хажууд; олголтгүй бол «= 0 ₮» (null ≠ 0: `d` алга бол null) */
export function givenTrendOf(d: ExecDeltas | null, key: string, arrows = true): Trend | null {
  if (!d || d.given.now == null) return null;
  return deltaText(d.givenByKey[key] ?? 0, 'mnt', { upGood: true, arrows });
}

export type DeltaRow = { key: string; label: string; prev: string; now: string; delta: number | null; trend: Trend | null; note?: string };

const mnt = (v: number | null): string => (v == null || !Number.isFinite(v) ? '—' : `${num(v)} ₮`);

/** Дэлгэц · PDF · PNG-д НЭГ мөрүүд (багц бүрийн мөр зөвхөн хэмжилттэйд) */
export function execDeltaRows(d: ExecDeltas, arrows = true): DeltaRow[] {
  const rows: DeltaRow[] = [];
  const h = d.housing;
  rows.push({
    key: 'housing', label: tr('Орон сууцны биет гүйцэтгэл'), prev: pct(h.prev, 1), now: pct(h.now, 1), delta: h.delta,
    trend: deltaText(h.delta, 'pp', { upGood: true, arrows }),
    note: h.prevAt && h.nowAt
      ? (h.delta == null
        ? tr('хугацаанд шинэ хэмжилт алга (сүүлийнх {0})', h.nowAt)
        : h.prevInside ? tr('хэмжилт {0} → {1} (хугацааны эхнээс өмнөх хэмжилт алга)', h.prevAt, h.nowAt) : tr('хэмжилт {0} → {1}', h.prevAt, h.nowAt))
      : h.now != null ? tr('хугацаанд хэмжилт алга') : undefined,
  });
  const g = d.given;
  rows.push({
    key: 'given', label: tr('Олгосон санхүүжилт'), prev: mnt(g.prev), now: mnt(g.now), delta: g.delta,
    trend: deltaText(g.delta, 'mnt', { upGood: true, arrows }),
    note: [g.count ? tr('{0} төлбөр', num(g.count)) : '', g.undated ? tr('огноогүй {0} төлбөр тоологдоогүй', num(g.undated)) : '']
      .filter(Boolean).join(' · ') || undefined,
  });
  rows.push({
    key: 'workers', label: tr('ХАБ — ажиллаж буй хүн'), prev: num(d.workers.prev), now: num(d.workers.now), delta: d.workers.delta,
    trend: deltaText(d.workers.delta, 'n', { arrows }),
    note: d.workers.prevAt && d.workers.nowAt
      ? (d.workers.prevInside ? tr('бүртгэл {0} → {1} (хугацааны эхнээс өмнөх бүртгэл алга)', d.workers.prevAt, d.workers.nowAt) : tr('бүртгэл {0} → {1}', d.workers.prevAt, d.workers.nowAt))
      : undefined,
  });
  rows.push({
    key: 'technik', label: tr('ХАБ — техник хэрэгсэл'), prev: num(d.technik.prev), now: num(d.technik.now), delta: d.technik.delta,
    trend: deltaText(d.technik.delta, 'n', { arrows }),
  });
  if (d.zov) {
    rows.push({
      key: 'zov', label: tr('Зөвшөөрөл — хугацаанд шийдвэрлэсэн'), prev: '—',
      now: tr('зөвшөөрсөн {0} · татгалзсан {1}', num(d.zov.ok), num(d.zov.no)), delta: null, trend: null,
    });
  }
  for (const p of d.packs) {
    if (p.now == null) continue;
    rows.push({ key: `pkg:${p.key}`, label: p.label, prev: pct(p.prev, 1), now: pct(p.now, 1), delta: p.delta, trend: deltaText(p.delta, 'pp', { upGood: true, arrows }) });
  }
  return rows;
}

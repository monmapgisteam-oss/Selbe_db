/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — ГУРВАН тайлан НЭГ тооцооноос (2026-11-05, хэрэглэгчийн шийдвэр):
 *   · Хотын дарга — хамгийн дэлгэрэнгүй (9 бүлэг, 13 график, хавсралт хүснэгт)
 *   · Иргэдийн Төлөөлөгчдийн Хурал — 4 график + анхаарах асуудлын жагсаалт
 *   · Төлөөлөн удирдах зөвлөл — 6 график + шийдвэрийн жагсаалт, хавсралт хүснэгт
 *
 * Гараар оруулах талбар ОГТ БАЙХГҮЙ (чөлөөт текст, гарын үсэг алга) — зөвхөн үүсгэсэн огноо ба хэрэглэгчийн нэр.
 * Хэсэг бүр = НЭГ график + тооноос үүссэн 2–3 өгүүлбэр (хугацааны өөрчлөлт байвал түүнтэй). Хүснэгт ЗӨВХӨН хавсралтад.
 * Хэмжигдээгүй явц = 0% («явцгүй» гэж хэзээ ч бичихгүй). ЦЭВЭР — сүлжээгүй, React-гүй (`audienceReport.check.mjs`).
 */
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { execFindings, LATE_GAP, type ExecReport } from '@/lib/execReport';
import { coverageOk } from '@/lib/planProgress';
import { bandOf, type ExecDelta, type ExecDeltas, type ExecPeriod } from '@/lib/execPeriodCalc';
import { PARCEL_CLEARED, HO_IPC } from '@/lib/services';
import { bn } from '@/lib/audienceChart';

/* ═══════════════ Төрөл ═══════════════ */

export type Audience = 'mayor' | 'council' | 'board';
export const AUDIENCES: readonly Audience[] = ['mayor', 'council', 'board'];

/** Хүлээн авагчийн БҮТЭН нэр — товчлолгүй (хэрэглэгчийн дүрэм) */
export function audienceLabel(a: Audience): string {
  if (a === 'mayor') return tr('Хотын дарга');
  if (a === 'council') return tr('Иргэдийн Төлөөлөгчдийн Хурал');
  return tr('Төлөөлөн удирдах зөвлөл');
}

/** Үе шатын нэг мөр — «Төсөл төлөвлөгөө биелэлт»-ийн модны 1-р түвшин (S = бодит, P = төлөвлөгөө, 0–100) */
export type PhaseInput = { key: string; label: string; S: number | null; P: number | null };

export type ReportInputs = {
  x: ExecReport;
  /** Хугацааны өөрчлөлт — ачаалалт унавал null (өөрчлөлтийн өгүүлбэр гарахгүй) */
  d: ExecDeltas | null;
  /** Төслийн нийт мөр (root) — «Төсөл төлөвлөгөө биелэлт» гол эх; уншигдаагүй бол null */
  project: { S: number | null; P: number | null } | null;
  phases: PhaseInput[];
  /** Барилга угсралт үе шатын дэд хэсэг — Бэлтгэл ажил · Барилга угсралт ажил */
  buildSub: PhaseInput[];
  /** IPC-ийн төлөв бүрийн дүн ₮ (Гүйцэтгэл → IPC үүссэн → Гарын үсэг зурсан → Олгосон); null = уншигдаагүй */
  ipc: { work: number; created: number; signed: number; paid: number } | null;
  /** Багц бүрийн хоцрогдол (`Finance.lagOf`) — хэмжилт ба хуваарьтай багцаар */
  lag: { key: string; label: string; planned: number; actual: number; gap: number; coverage: number | null }[];
  /** Багц бүр дээрх чөлөөлөгдөөгүй нэгж талбар (`pkgSaad`); null = уншигдаагүй */
  saad: { key: string; name: string; n: number }[] | null;
  /** ХАБЭА өдрийн бүртгэл (огноогоор өсөх); null = уншигдаагүй */
  hseDays: { key: string; workers: number | null; technik: number | null }[] | null;
  /** Нийгмийн дэд бүтцийн объектууд (`publicSync.niigemRows`); null = уншигдаагүй */
  niigem: { name: string; pct: number | null; bagts: string }[] | null;
  /** Ирэх саруудын төлөвлөсөн санхүүжилт (сарын мөр); null = сарын мөр алга */
  cashOutlook: { months: string[]; planned: number[] } | null;
  /** Үүсгэсэн огноо (YYYY-MM-DD) */
  today: string;
  period: ExecPeriod;
  /** Тайлан үүсгэсэн хэрэглэгчийн нэр */
  user: string;
  /** Уншигдаагүй заавал биш эх сурвалжууд (`audienceReportLoad`) — дэлгэцэд нэрлэнэ */
  failed?: string[];
};

export type Unit = 'pct' | 'mnt' | 'num';
export type KpiItem = { label: string; value: string; sub?: string; trend?: string | null };
export type BarItem = {
  label: string;
  value: number | null;
  /** Багана дээр хэвлэх бэлэн текст */
  text?: string;
  hot?: boolean;
  /** Төлөвлөгөөний тэмдэг (ижил нэгжээр) — хоцрогдол харуулна */
  mark?: number | null;
};
export type LineSeries = { label: string; values: (number | null)[]; dashed?: boolean };
export type ListItem = { text: string; tone: 'bad' | 'warn' | 'info' };

/** График — ЗӨВХӨН өгөгдөл; зурах нь `audienceChart.chartSvg` (дэлгэц · PDF нэг зураг) */
export type ChartSpec =
  | { kind: 'kpi'; items: KpiItem[] }
  | { kind: 'bars'; items: BarItem[]; unit: Unit; max?: number }
  | { kind: 'line'; months: string[]; series: LineSeries[]; unit: Unit; bars?: { label: string; values: (number | null)[]; unit: Unit } | null }
  | { kind: 'stacked'; items: { label: string; value: number }[]; unit: Unit }
  | { kind: 'list'; items: ListItem[] };

export type Section = {
  key: string;
  /** «2.1» — бүлгийн дугаар ба дэд дугаар */
  no: string;
  /** Бүлгийн дугаар (1-ээс) */
  group: number;
  title: string;
  chart: ChartSpec;
  /** Тооноос үүссэн 2–3 өгүүлбэр */
  text: string[];
};

export type Appendix = { no: string; title: string; head: string[]; rows: string[][] };

export type Report = {
  audience: Audience;
  title: string;
  subtitle: string;
  sections: Section[];
  /** Хүснэгт ЗӨВХӨН энд — Хотын дарга ба Төлөөлөн удирдах зөвлөлд */
  appendix: Appendix | null;
};

/* ═══════════════ Туслах ═══════════════ */

/** Хэмжигдээгүй явц = 0% (хэрэглэгчийн дүрэм — «явцгүй» гэж бичихгүй) */
export const progressOf = (v: number | null | undefined): number => (v == null || !Number.isFinite(v) ? 0 : v);

/** Мөнгө — бүтэн дүн, таслалтай (2026-09-01 дүрэм); мэдээлэлгүй → «мэдээлэлгүй» */
export const money = (v: number | null | undefined): string => bn(v);

const abs1 = (v: number) => num(Math.abs(v), 1);

/** Чиглэлийн үг — тэг бол «өөрчлөгдөөгүй» */
const trendWord = (delta: number, zeroBelow: number): string =>
  Math.abs(delta) < zeroBelow ? tr('өөрчлөгдөөгүй') : delta > 0 ? tr('өссөн') : tr('буурсан');

/** Нэгж хувийн өөрчлөлтийн өгүүлбэр — өөрчлөлт мэдэгдэхгүй бол null (өгүүлбэр гарахгүй) */
function ppDelta(subject: string, d: ExecDeltas | null, delta: number | null | undefined): string | null {
  if (!d || delta == null || !Number.isFinite(delta)) return null;
  const { from, to } = d.period;
  if (Math.abs(delta) < 0.05) return tr('Сонгосон хугацаанд ({0} → {1}) {2} өөрчлөгдөөгүй.', from, to, subject);
  return tr('Сонгосон хугацаанд ({0} → {1}) {2} {3} нэгж хувиар {4}.', from, to, subject, abs1(delta), trendWord(delta, 0.05));
}

/** Тоон өөрчлөлтийн өгүүлбэр (хүн, техник) — бүртгэлийн огноогоор (`prevAt` → `nowAt`), алга бол хугацаагаар */
function nDelta(subject: string, unit: string, d: ExecDeltas | null, delta: ExecDelta | null | undefined): string | null {
  if (!d || delta?.delta == null || !Number.isFinite(delta.delta)) return null;
  const from = delta.prevAt ?? d.period.from;
  const to = delta.nowAt ?? d.period.to;
  if (Math.abs(delta.delta) < 0.5) return tr('{0} өмнөх бүртгэлээс ({1} → {2}) өөрчлөгдөөгүй.', subject, from, to);
  return tr('{0} өмнөх бүртгэлээс ({1} → {2}) {3} {4} {5}.', subject, from, to, num(Math.abs(delta.delta)), unit, trendWord(delta.delta, 0.5));
}

/** Хугацааны олголтын өгүүлбэр */
function givenDelta(d: ExecDeltas | null): string | null {
  if (!d || d.given.delta == null) return null;
  return tr('Сонгосон хугацаанд ({0} → {1}) {2} олгосон, {3} төлбөр.', d.period.from, d.period.to, money(d.given.delta), num(d.given.count));
}

const byDesc = <T,>(arr: readonly T[], v: (t: T) => number): T[] => [...arr].sort((a, b) => v(b) - v(a));

/** Орон сууцны хуваарийн төлөв — «хоцрогдол» · «хуваарийн дагуу» · «түрүүлэлт» · хамралт дутуу */
export function scheduleStatus(x: ExecReport): { label: string; sentence: string } {
  const p = x.prog;
  const actual = progressOf(p.planExcluded.length ? p.actualLag : p.actual);
  if (p.planned == null) {
    return { label: tr('хуваарь алга'), sentence: tr('Орон сууцны барилга угсралтын хуваарь уншигдаагүй тул хоцрогдлыг дүгнэсэнгүй; бодит явц {0}.', pct(actual, 1)) };
  }
  if (!coverageOk(p.planCoverage)) {
    return {
      label: tr('хамрах хүрээ {0}', p.planCoverage == null ? '—' : pct(p.planCoverage, 0)),
      sentence: tr('Хуваарь {0} хамарсан тул хоцрогдлыг дүгнэсэнгүй (төлөвлөгөө {1}, бодит {2}).',
        p.planCoverage == null ? '—' : pct(p.planCoverage, 1), pct(p.planned, 1), pct(actual, 1)),
    };
  }
  const gap = p.planned - actual;
  if (gap >= LATE_GAP) {
    return { label: tr('хоцрогдол {0} н.х', num(gap, 1)), sentence: tr('Орон сууцны барилга угсралт хуваариас {0} нэгж хувиар хоцорч байна (төлөвлөгөө {1}, бодит {2}).', num(gap, 1), pct(p.planned, 1), pct(actual, 1)) };
  }
  if (gap < 0) {
    return { label: tr('түрүүлэлт {0} н.х', num(-gap, 1)), sentence: tr('Орон сууцны барилга угсралт хуваариас {0} нэгж хувиар түрүүлж байна (төлөвлөгөө {1}, бодит {2}).', num(-gap, 1), pct(p.planned, 1), pct(actual, 1)) };
  }
  return { label: tr('хуваарийн дагуу'), sentence: tr('Орон сууцны барилга угсралт хуваарийн дагуу явж байна (төлөвлөгөө {0}, бодит {1}).', pct(p.planned, 1), pct(actual, 1)) };
}

/** Хуваариас `LATE_GAP`-аас илүү хоцорсон багцууд (зөвхөн хамралт хангалттай хуваарьтай) */
export const latePacks = (i: ReportInputs) => i.lag.filter((l) => coverageOk(l.coverage) && l.gap >= LATE_GAP);
/** 5%-иас доош явцтай орон сууцны багцууд (хэмжигдээгүй = 0%) */
export const stalledPacks = (x: ExecReport) => x.prog.packs.filter((p) => p.kind === 'build' && progressOf(p.progress) < 5);

/* ═══════════════ Хэсгүүд ═══════════════ */

const ipcTotals = (i: ReportInputs) => i.ipc ? i.ipc.created + i.ipc.signed : 0;

function kpiSummary(i: ReportInputs, full: boolean): Section {
  const { x, d } = i;
  const projS = i.project?.S ?? x.gdash.progress;
  const projP = i.project?.P ?? x.gdash.progressPlan;
  const housing = progressOf(x.prog.actual);
  const st = scheduleStatus(x);
  const items: KpiItem[] = [
    { label: tr('Төслийн нийт явц'), value: pct(progressOf(projS), 1), sub: projP == null ? tr('Төсөл төлөвлөгөө биелэлт') : tr('төлөвлөгөө {0}', pct(projP, 1)) },
    { label: tr('Барилгын явц'), value: pct(housing, 1), sub: x.prog.asOf ? tr('хэмжилт {0}', x.prog.asOf) : undefined, trend: d && d.housing.delta != null ? `${d.housing.delta >= 0 ? '+' : '−'}${abs1(d.housing.delta)} ${tr('н.х')}` : null },
    { label: tr('Газар чөлөөлөлт'), value: pct(progressOf(x.gdash.landPct), 1), sub: tr('{0} нэгж талбар үлдсэн', num(x.gdash.land.remaining)) },
    { label: tr('Олголт'), value: x.fin.share == null ? tr('мэдээлэлгүй') : pct(x.fin.share, 1), sub: tr('гэрээлсэн дүнгийн'), trend: d && d.given.delta != null ? `${d.given.delta < 0 ? '−' : '+'}${money(Math.abs(d.given.delta))}` : null },
    { label: tr('Хуваарийн төлөв'), value: st.label, sub: x.prog.planned == null ? undefined : tr('төлөвлөгөө {0}', pct(x.prog.planned, 1)) },
  ];
  const text = [
    projP == null
      ? tr('Төслийн нийт явц {0} («Төсөл төлөвлөгөө биелэлт»-ийн Төслийн нийт мөр).', pct(progressOf(projS), 1))
      : tr('Төслийн нийт явц {0}, төлөвлөгөө {1} («Төсөл төлөвлөгөө биелэлт»-ийн Төслийн нийт мөр).', pct(progressOf(projS), 1), pct(projP, 1)),
    tr('Барилгын явц {0}, газар чөлөөлөлт {1} ({2} нэгж талбарын {3} нь чөлөөлөгдсөн).', pct(housing, 1), pct(progressOf(x.gdash.landPct), 1), num(x.gdash.land.total), num(x.gdash.land.cleared)),
    ppDelta(tr('Барилгын явц'), d, d?.housing.delta) ?? st.sentence,
  ];
  if (full) {
    return { key: 'summary', no: '1', group: 1, title: tr('Нэг хуудас хураангуй'), chart: { kind: 'kpi', items }, text };
  }
  return { key: 'summary', no: '1', group: 1, title: tr('Гол үзүүлэлт'), chart: { kind: 'kpi', items: items.slice(0, 3) }, text };
}

function finFlow(i: ReportInputs, no: string, group: number, withContract: boolean): Section {
  const { x, d } = i;
  const s = d?.series;
  const months = s?.months ?? [];
  const series: LineSeries[] = [{ label: tr('Хуримтлагдсан олголт'), values: s?.paidCum ?? [] }];
  if (withContract && months.length) series.push({ label: tr('Гэрээлсэн нийт дүн'), values: months.map(() => x.fin.planTotal), dashed: true });
  const chart: ChartSpec = {
    kind: 'line', months, series, unit: 'mnt',
    bars: months.length ? { label: tr('Сарын олголт'), values: s?.paidMonthly ?? [], unit: 'mnt' } : null,
  };
  /* Хугацааны төгсгөлийн сар (тэнхлэгт байвал), эс бөгөөс сүүлийн сар */
  const band = d && months.length ? bandOf(months, d.period) : null;
  const lastIdx = band ? band[1] : months.length - 1;
  const text = [
    tr('Нийт төсөв {0}, гэрээлсэн {1} (төсвийн {2}), олгосон {3} (гэрээлсэн дүнгийн {4}).',
      money(x.gdash.budget), money(x.gdash.contract), x.gdash.budget > 0 ? pct((x.gdash.contract / x.gdash.budget) * 100, 1) : '—',
      money(x.fin.given), x.fin.share == null ? '—' : pct(x.fin.share, 1)),
    givenDelta(d) ?? tr('Олгогдоогүй үлдэгдэл {0}.', money(x.fin.remain)),
  ];
  if (lastIdx >= 0 && s) {
    const cum = s.paidCum[lastIdx];
    /* Огноогүй төлбөр — тэнхлэгийн ТӨГСГӨЛИЙН хуримтлал ба нийт олголтын зөрүү (графикийн шугамд орохгүй) */
    const end = s.paidCum[s.paidCum.length - 1];
    const undated = x.fin.given != null && end != null ? x.fin.given - end : 0;
    text.push(Math.abs(undated) >= 1e6
      ? tr('{0} сард {1} олгосон; хуримтлагдсан олголт {2}; огноогүй төлбөр {3} графикт ороогүй (нийт олголт {4}).', months[lastIdx], money(s.paidMonthly[lastIdx]), money(cum), money(undated), money(x.fin.given))
      : tr('{0} сард {1} олгосон; хуримтлагдсан олголт {2}.', months[lastIdx], money(s.paidMonthly[lastIdx]), money(cum)));
  } else text.push(tr('Сарын олголтын цуваа уншигдаагүй тул график мэдээлэлгүй.'));
  return { key: 'finFlow', no, group, title: tr('Санхүүжилт — сарын олголт ба хуримтлал'), chart, text };
}

function ipcStatus(i: ReportInputs, no: string, group: number): Section {
  const { x, ipc } = i;
  const S = HO_IPC.status;
  /* Төлөв бүрийн ДҮН — тусдаа багана (нэг нийлбэрийн хувь биш: «Олгосон» бүх хугацааны, «Гүйцэтгэл» одоогийн хүлээлт) */
  const chart: ChartSpec = ipc
    ? { kind: 'bars', unit: 'mnt', items: [
      { label: S.work, value: ipc.work }, { label: S.created, value: ipc.created }, { label: S.signed, value: ipc.signed }, { label: S.paid, value: ipc.paid, hot: true },
    ] }
    : { kind: 'bars', unit: 'mnt', items: [] };
  const text = ipc
    ? [
      tr('Гүйцэтгэл ирсэн {0}, IPC үүссэн {1}, гарын үсэг зурсан {2}, олгосон {3}.', money(ipc.work), money(ipc.created), money(ipc.signed), money(ipc.paid)),
      tr('Олголт хүлээж буй IPC-ийн дүн {0} (үүссэн ба гарын үсэг зурсан).', money(ipcTotals(i))),
      tr('Олгосон санхүүжилт гэрээлсэн дүнгийн {0}.', x.fin.share == null ? '—' : pct(x.fin.share, 1)),
    ]
    : [tr('IPC-ийн төлөвийн бүртгэл уншигдаагүй тул энэ хэсэг мэдээлэлгүй.'), tr('Олгосон санхүүжилт нийт {0}.', money(x.fin.given))];
  return { key: 'ipc', no, group, title: tr('IPC-ийн төлөв (гүйцэтгэлээс олголт хүртэл)'), chart, text };
}

function finPacks(i: ReportInputs, no: string, group: number): Section {
  const { x, d } = i;
  const started = x.fin.rows.filter((r) => r.given > 0 && r.plan > 0 && r.pct != null);
  const items: BarItem[] = byDesc(started, (r) => r.pct ?? 0).map((r, k) => ({
    label: r.label, value: r.pct, hot: k === 0, text: `${money(r.given)} · ${pct(r.pct, 1)}`,
  }));
  const low = x.fin.rows.filter((r) => r.contracted && r.plan > 0 && (r.pct ?? 0) < 10);
  const zero = x.fin.rows.filter((r) => r.contracted && r.given === 0 && !r.rangePaid);
  const top = items[0];
  const text = [
    tr('Гэрээт {0} багцаас {1}-д олголт эхэлсэн; {2} багц олголт огт аваагүй.', num(x.fin.rows.filter((r) => r.contracted).length), num(started.length), num(zero.length)),
    top ? tr('Хамгийн өндөр олголттой багц {0} ({1}); гэрээний 10%-д хүрээгүй {2} багц.', top.label, pct(top.value, 1), num(low.length)) : tr('Олголт эхэлсэн багц алга; гэрээний 10%-д хүрээгүй {0} багц.', num(low.length)),
  ];
  if (d && d.given.now != null) {
    const keys = Object.entries(d.givenByKey).sort((a, b) => b[1] - a[1]);
    if (keys.length) {
      const name = x.fin.rows.find((r) => r.key === keys[0][0])?.label ?? keys[0][0];
      text.push(tr('Сонгосон хугацаанд хамгийн их олголт {0} багцад — {1}.', name, money(keys[0][1])));
    } else text.push(tr('Сонгосон хугацаанд ({0} → {1}) багцад олголт хийгдээгүй.', d.period.from, d.period.to));
  }
  return { key: 'finPacks', no, group, title: tr('Багц бүрийн олголт (гэрээлсэн дүнд эзлэх хувь)'), chart: { kind: 'bars', unit: 'pct', max: 100, items }, text };
}

function phases(i: ReportInputs, no: string, group: number): Section {
  const items: BarItem[] = [
    ...i.phases.map((p) => ({ label: p.label, value: progressOf(p.S), mark: p.P, text: p.P == null ? pct(progressOf(p.S), 1) : `${pct(progressOf(p.S), 1)} · ${tr('төлөвлөгөө {0}', pct(p.P, 1))}` })),
    ...i.buildSub.map((p) => ({ label: `— ${p.label}`, value: progressOf(p.S), mark: p.P, text: p.P == null ? pct(progressOf(p.S), 1) : `${pct(progressOf(p.S), 1)} · ${tr('төлөвлөгөө {0}', pct(p.P, 1))}` })),
  ];
  const projS = progressOf(i.project?.S ?? i.x.gdash.progress);
  const projP = i.project?.P ?? null;
  const sorted = byDesc(i.phases, (p) => progressOf(p.S));
  const text: string[] = [
    projP == null ? tr('Төслийн нийт явц {0}, {1} үе шат.', pct(projS, 1), num(i.phases.length))
      : tr('Төслийн нийт явц {0} (төлөвлөгөө {1}), {2} үе шат.', pct(projS, 1), pct(projP, 1), num(i.phases.length)),
  ];
  if (sorted.length >= 2) {
    text.push(tr('Хамгийн өндөр явцтай үе шат «{0}» {1}, хамгийн бага «{2}» {3}.', sorted[0].label, pct(progressOf(sorted[0].S), 1), sorted[sorted.length - 1].label, pct(progressOf(sorted[sorted.length - 1].S), 1)));
  } else text.push(tr('«Төсөл төлөвлөгөө биелэлт»-ийн үе шатны мөр уншигдаагүй тул график мэдээлэлгүй.'));
  const beltgel = i.buildSub.find((p) => /бэлтгэл/i.test(p.label));
  const barilga = i.buildSub.find((p) => !/бэлтгэл/i.test(p.label));
  if (beltgel && barilga) text.push(tr('Бэлтгэл ажил {0}, барилга угсралт ажил {1}.', pct(progressOf(beltgel.S), 1), pct(progressOf(barilga.S), 1)));
  return { key: 'phases', no, group, title: tr('Үе шатны явц (бодит ба төлөвлөгөө)'), chart: { kind: 'bars', unit: 'pct', max: 100, items }, text };
}

function housingLine(i: ReportInputs, no: string, group: number): Section {
  const { x, d } = i;
  const s = d?.series;
  const months = s?.months ?? [];
  const chart: ChartSpec = {
    kind: 'line', months, unit: 'pct',
    series: [{ label: tr('Төлөвлөгөө'), values: s?.housingPlan ?? [], dashed: true }, { label: tr('Бодит'), values: s?.housingActual ?? [] }],
  };
  const st = scheduleStatus(x);
  const text = [st.sentence, ppDelta(tr('Орон сууцны биет гүйцэтгэл'), d, d?.housing.delta) ?? tr('{0} блок, {1} өрх — сүүлийн хэмжилт {2}.', num(x.prog.blocks), num(x.prog.households), x.prog.asOf || '—')];
  if (!months.length) text.push(tr('Сарын цуваа уншигдаагүй тул график мэдээлэлгүй.'));
  else if (x.prog.noData > 0) text.push(tr('{0} блокийн гүйцэтгэл бөглөгдөөгүй тул 0%-иар тооцогдсон.', num(x.prog.noData)));
  return { key: 'housing', no, group, title: tr('Орон сууц — төлөвлөгөө ба бодит явц'), chart, text };
}

function packLag(i: ReportInputs, no: string, group: number, infraToo: boolean): Section {
  const { x } = i;
  const lagBy = new Map(i.lag.map((l) => [l.key, l]));
  const packs = x.prog.packs.filter((p) => infraToo || p.kind === 'build');
  const items: BarItem[] = byDesc(packs, (p) => progressOf(p.progress)).map((p) => {
    const l = lagBy.get(p.key);
    const late = l && coverageOk(l.coverage) && l.gap >= LATE_GAP;
    return {
      label: p.name, value: progressOf(p.progress), mark: l && coverageOk(l.coverage) ? l.planned : null,
      text: `${pct(progressOf(p.progress), 1)}${late ? ` · ${tr('хоцрогдол {0} н.х', num(l.gap, 1))}` : ''}`,
    };
  });
  const keys = new Set(packs.map((p) => p.key));
  const late = latePacks(i).filter((l) => keys.has(l.key));
  const worst = byDesc(late, (l) => l.gap)[0];
  const stalled = stalledPacks(x);
  /* Хуваарь нь ШАЛГАГДАХ (хамрах хүрээ хангалттай) багц л дүгнэгдэнэ — бусдыг «хуваарийн дагуу» гэж ойлгуулахгүй */
  const evaluable = i.lag.filter((l) => keys.has(l.key) && coverageOk(l.coverage)).length;
  const text = [
    tr('{0} багцаас хуваарь нь шалгагдах {1}; үүнээс {2} нь хуваариас {3} нэгж хувиас илүү хоцорсон, {4} багцын хуваарь хангалтгүй тул дүгнэсэнгүй.',
      num(packs.length), num(evaluable), num(late.length), num(LATE_GAP), num(packs.length - evaluable)),
    worst ? tr('Хамгийн их хоцрогдол {0}: төлөвлөгөө {1}, бодит {2} ({3} нэгж хувь).', worst.label, pct(worst.planned, 1), pct(worst.actual, 1), num(worst.gap, 1))
      : tr('Хуваарь нь шалгагдах {0} багцын хоцрогдол {1} нэгж хувиас бага.', num(evaluable), num(LATE_GAP)),
    tr('{0} орон сууцны багц 5%-иас доош явцтай.', num(stalled.length)),
  ];
  return { key: 'packLag', no, group, title: tr('Багц бүрийн явц ба хуваарийн хоцрогдол'), chart: { kind: 'bars', unit: 'pct', max: 100, items }, text };
}

function infraPacks(i: ReportInputs, no: string, group: number): Section {
  const packs = i.x.prog.packs.filter((p) => p.kind === 'infra');
  const items: BarItem[] = byDesc(packs, (p) => progressOf(p.progress)).map((p, k) => ({ label: p.name, value: progressOf(p.progress), hot: k === 0, text: pct(progressOf(p.progress), 1) }));
  const avg = packs.length ? packs.reduce((s, p) => s + progressOf(p.progress), 0) / packs.length : 0;
  const started = packs.filter((p) => progressOf(p.progress) > 0).length;
  const text = [
    tr('Дэд бүтцийн {0} багцын дундаж явц {1}; {2} багц эхэлсэн.', num(packs.length), pct(avg, 1), num(started)),
    items[0] ? tr('Хамгийн өндөр явцтай {0} ({1}), хамгийн бага {2} ({3}).', items[0].label, pct(items[0].value, 1), items[items.length - 1].label, pct(items[items.length - 1].value, 1))
      : tr('Дэд бүтцийн багцын бүртгэл алга тул график мэдээлэлгүй.'),
  ];
  return { key: 'infra', no, group, title: tr('Дэд бүтцийн багцуудын явц'), chart: { kind: 'bars', unit: 'pct', max: 100, items }, text };
}

function social(i: ReportInputs, no: string, group: number, withHousing: boolean): Section {
  const rows = i.niigem ?? [];
  const items: BarItem[] = [];
  if (withHousing) items.push({ label: tr('Орон сууцны барилга угсралт'), value: progressOf(i.x.prog.actual), hot: true, text: pct(progressOf(i.x.prog.actual), 1) });
  for (const r of byDesc(rows, (r) => progressOf(r.pct))) items.push({ label: r.name, value: progressOf(r.pct), text: pct(progressOf(r.pct), 1) });
  const started = rows.filter((r) => progressOf(r.pct) > 0).length;
  const done = rows.filter((r) => progressOf(r.pct) >= 100).length;
  const text: string[] = [];
  if (withHousing) text.push(tr('Орон сууцны барилга угсралт {0}: {1} блок, {2} өрх.', pct(progressOf(i.x.prog.actual), 1), num(i.x.prog.blocks), num(i.x.prog.households)));
  if (i.niigem) {
    text.push(tr('Нийгмийн дэд бүтцийн {0} объектоос {1} нь эхэлсэн, {2} нь дууссан.', num(rows.length), num(started), num(done)));
    const top = byDesc(rows, (r) => progressOf(r.pct))[0];
    if (top && progressOf(top.pct) > 0) text.push(tr('Хамгийн өндөр явцтай объект «{0}» {1}.', top.name, pct(progressOf(top.pct), 1)));
    else if (rows.length) text.push(tr('Нэг ч объектын барилга угсралт эхлээгүй (явц 0%).'));
  } else text.push(tr('Нийгмийн дэд бүтцийн мөр уншигдаагүй тул энэ хэсэг мэдээлэлгүй.'));
  if (text.length < 2) text.push(tr('Объектын явц «Төсөл төлөвлөгөө биелэлт»-ийн Барилга угсралт ажлын мөрөөс.'));
  return {
    key: 'social', no, group,
    title: withHousing ? tr('Орон сууц ба нийгмийн дэд бүтцийн явц') : tr('Нийгмийн дэд бүтцийн объектууд'),
    chart: { kind: 'bars', unit: 'pct', max: 100, items }, text,
  };
}

function landStatus(i: ReportInputs, no: string, group: number): Section {
  const g = i.x.gdash;
  const items = g.land.byStatus.filter((b) => b.n > 0).map((b) => ({ label: b.label, value: b.n }));
  const top = g.land.reasons[0];
  const text = [
    tr('Газар чөлөөлөлт {0}: {1} нэгж талбараас {2} нь чөлөөлөгдсөн, {3} үлдсэн.', pct(progressOf(g.landPct), 1), num(g.land.total), num(g.land.cleared), num(g.land.remaining)),
    top ? tr('Чөлөөлөгдөөгүй талбарын гол шалтгаан «{0}» ({1} талбар).', top.label, num(top.n)) : tr('Чөлөөлөгдөөгүй талбарын шалтгаан бүртгэгдээгүй.'),
  ];
  const cleared = g.land.byStatus.find((b) => b.label === PARCEL_CLEARED);
  if (cleared && g.land.total > 0) text.push(tr('«{0}» төлөвтэй талбар нийт талбарын {1}.', cleared.label, pct((cleared.n / g.land.total) * 100, 1)));
  return { key: 'land', no, group, title: tr('Газар чөлөөлөлт — нэгж талбарын төлөв'), chart: { kind: 'stacked', unit: 'num', items }, text };
}

function landPacks(i: ReportInputs, no: string, group: number): Section {
  const rows = (i.saad ?? []).filter((s) => s.n > 0);
  const items: BarItem[] = byDesc(rows, (s) => s.n).map((s, k) => ({ label: s.name, value: s.n, hot: k === 0, text: num(s.n) }));
  const text = i.saad
    ? [
      tr('{0} багц дээр чөлөөлөгдөөгүй нэгж талбар давхцаж байна.', num(rows.length)),
      items[0] ? tr('Хамгийн их саадтай багц {0} ({1} талбар).', items[0].label, num(items[0].value)) : tr('Нэг ч багц дээр чөлөөлөгдөөгүй талбар алга.'),
    ]
    : [tr('Багцын саадын бүртгэл уншигдаагүй тул энэ хэсэг мэдээлэлгүй.'), tr('Нийт {0} нэгж талбар чөлөөлөгдөөгүй.', num(i.x.gdash.land.remaining))];
  return { key: 'landPacks', no, group, title: tr('Багц бүр дээрх чөлөөлөгдөөгүй нэгж талбар'), chart: { kind: 'bars', unit: 'num', items }, text };
}

function riskCounts(i: ReportInputs, no: string, group: number): Section {
  const { x } = i;
  const late = latePacks(i).length;
  const stalled = stalledPacks(x).length;
  const saad = (i.saad ?? []).filter((s) => s.n > 0).length;
  const items: BarItem[] = [
    { label: tr('Зөвшөөрөл хүлээгдэж буй'), value: x.zov ? x.zov.wait : null },
    { label: tr('Зөвшөөрөл олгогдоогүй'), value: x.zov ? x.zov.no : null, hot: !!x.zov && x.zov.no > 0 },
    { label: tr('Хуваариас хоцорсон багц'), value: late },
    { label: tr('5%-иас доош явцтай багц'), value: stalled },
    { label: tr('Газрын саадтай багц'), value: i.saad ? saad : null },
  ].map((b) => ({ ...b, text: b.value == null ? tr('мэдээлэлгүй') : num(b.value) }));
  const text = [
    x.zov ? tr('Зөвшөөрөл: {0} хүлээгдэж байна, {1} олгогдоогүй (нийт {2}).', num(x.zov.wait), num(x.zov.no), num(x.zov.total)) : tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул зөвшөөрлийн тоо мэдээлэлгүй.'),
    tr('Хуваариас хоцорсон {0} багц, 5%-иас доош явцтай {1} багц, газрын саадтай {2} багц.', num(late), num(stalled), num(saad)),
    tr('Чөлөөлөгдөөгүй {0} нэгж талбар холбогдох ажлыг эхлүүлэхэд саад болно.', num(x.gdash.land.remaining)),
  ];
  return { key: 'risk', no, group, title: tr('Эрсдэл ба саад'), chart: { kind: 'bars', unit: 'num', items }, text };
}

function workforce(i: ReportInputs, no: string, group: number): Section {
  const { x, d } = i;
  const days = (i.hseDays ?? []).slice(-60);
  const chart: ChartSpec = {
    kind: 'line', months: days.map((r) => r.key), unit: 'num',
    series: [{ label: tr('Ажиллаж буй хүн'), values: days.map((r) => r.workers) }, { label: tr('Техник хэрэгсэл'), values: days.map((r) => r.technik), dashed: true }],
  };
  const h = x.gdash.hse;
  const text = [
    h ? tr('ХАБЭА-ийн сүүлийн бүртгэл {0}: {1} ажилтан, {2} техник хэрэгсэл, {3} хүн цаг.', h.date, num(h.workers), num(h.equipment), num(h.manHours)) : tr('ХАБЭА-ийн бүртгэл олдсонгүй тул ажиллах хүчний тоо мэдээлэлгүй.'),
    nDelta(tr('Ажиллаж буй хүн'), tr('хүнээр'), d, d?.workers) ?? (i.hseDays ? tr('Өдрийн бүртгэл {0} өдөр.', num(i.hseDays.length)) : tr('Өдрийн бүртгэлийн цуваа уншигдаагүй тул график мэдээлэлгүй.')),
  ];
  const t2 = nDelta(tr('Техник хэрэгсэл'), tr('нэгжээр'), d, d?.technik);
  if (t2) text.push(t2);
  return { key: 'workforce', no, group, title: tr('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй — ажиллах хүч'), chart, text };
}

/** Анхаарах зүйл — дүгнэлт (`execFindings`) + хоцорсон багц + 5%-иас доош багц + хүлээгдэж буй зөвшөөрөл */
export function attentionItems(i: ReportInputs): ListItem[] {
  const { x } = i;
  /* Багц бүр НЭГ л удаа — хамгийн хүнд олдвороороо; хуваарийн хамрах хүрээний дүгнэлт 4.1-д байгаа тул энд давтахгүй */
  const seen = new Set<string>();
  const out: ListItem[] = [];
  const push = (key: string | null, it: ListItem) => {
    if (key) { if (seen.has(key)) return; seen.add(key); }
    out.push(it);
  };
  for (const l of byDesc(latePacks(i), (l) => l.gap)) {
    push(l.key, { text: tr('{0} хуваариас {1} нэгж хувиар хоцорсон (төлөвлөгөө {2}, бодит {3}).', l.label, num(l.gap, 1), pct(l.planned, 1), pct(l.actual, 1)), tone: l.gap >= 10 ? 'bad' : 'warn' });
  }
  for (const p of stalledPacks(x)) push(p.key, { text: tr('{0} явц {1} — ажил эхлээгүй эсвэл бөглөгдөөгүй.', p.name, pct(progressOf(p.progress), 1)), tone: 'warn' });
  for (const f of execFindings(x)) {
    if (f.sev === 'info' || /хамарсан|хамрах хүрээ/i.test(f.text)) continue;
    const pk = x.prog.packs.find((p) => f.text.includes(p.name))?.key ?? null;
    push(pk, { text: f.text, tone: f.sev });
  }
  if (x.zov) {
    for (const z of x.zov.issues.slice(0, 10)) push(null, { text: tr('{0} · {1}-р шат · {2} — {3} ({4}).', z.bagts, num(z.shat), z.ner, z.tolov, z.baiguullaga || '—'), tone: 'warn' });
  }
  return out;
}

function attention(i: ReportInputs, no: string, group: number, title: string): Section {
  const items = attentionItems(i);
  const bad = items.filter((it) => it.tone === 'bad').length;
  const text = [
    tr('{0} асуудал анхаарал шаардаж байна, үүнээс {1} нь шийдвэр шаардсан.', num(items.length), num(bad)),
    tr('Жагсаалт тайлангийн тооноос автоматаар үүссэн: дүгнэлт, хуваариас хоцорсон багц, 5%-иас доош явцтай багц, хүлээгдэж буй зөвшөөрөл.'),
  ];
  return { key: 'attention', no, group, title, chart: { kind: 'list', items }, text };
}

function decisions(i: ReportInputs, no: string, group: number): Section {
  const fs = execFindings(i.x).filter((f) => f.advice);
  const items: ListItem[] = fs.map((f) => ({ text: `${f.area}: ${f.advice}`, tone: f.sev }));
  for (const l of byDesc(latePacks(i), (l) => l.gap).slice(0, 5)) {
    items.push({ text: tr('{0}: хоцрогдол {1} нэгж хувь — хүн хүч, техникийн нэмэлт хуваарилалт шийдэх.', l.label, num(l.gap, 1)), tone: l.gap >= 10 ? 'bad' : 'warn' });
  }
  const text = [
    tr('{0} шийдвэрийн санал — тайлангийн дүгнэлт ба хоцорсон багцаас автоматаар.', num(items.length)),
    tr('Шийдвэр шаардсан (улаан) {0}, анхаарах (шар) {1}.', num(items.filter((it) => it.tone === 'bad').length), num(items.filter((it) => it.tone === 'warn').length)),
  ];
  return { key: 'decisions', no, group, title: tr('Шийдвэрийн жагсаалт'), chart: { kind: 'list', items }, text };
}

function cashOutlook(i: ReportInputs, no: string, group: number): Section {
  const { x } = i;
  const c = i.cashOutlook;
  if (c && c.months.length) {
    const items: BarItem[] = c.months.map((m, k) => ({ label: m, value: c.planned[k], text: money(c.planned[k]) }));
    const sum = c.planned.reduce((s, v) => s + v, 0);
    const top = byDesc(items, (b) => b.value ?? 0)[0];
    const text = [
      tr('Ирэх {0} сард төлөвлөсөн санхүүжилт {1} (сарын төлөвлөгөөний мөрөөр).', num(c.months.length), money(sum)),
      tr('Хамгийн их төлөвлөлттэй сар {0} — {1}.', top.label, money(top.value)),
      tr('Гэрээлсэн дүнгийн олгогдоогүй үлдэгдэл {0}.', money(x.fin.remain)),
    ];
    return { key: 'cash', no, group, title: tr('Мөнгөн урсгалын төлөв — ирэх саруудын төлөвлөсөн санхүүжилт'), chart: { kind: 'bars', unit: 'mnt', items }, text };
  }
  const items: BarItem[] = [
    { label: tr('Гэрээлсэн нийт дүн'), value: x.fin.planTotal, text: money(x.fin.planTotal) },
    { label: tr('Олгосон'), value: x.fin.given, hot: true, text: money(x.fin.given) },
    { label: tr('Олгогдоогүй үлдэгдэл'), value: x.fin.remain, text: money(x.fin.remain) },
  ];
  const text = [
    tr('Сарын төлөвлөгөөний мөр алга тул ирэх саруудын төлөвлөлтийн оронд гэрээлсэн дүнгийн үлдэгдлийг үзүүлэв.'),
    tr('Гэрээлсэн {0}, олгосон {1}, олгогдоогүй үлдэгдэл {2}.', money(x.fin.planTotal), money(x.fin.given), money(x.fin.remain)),
  ];
  return { key: 'cash', no, group, title: tr('Мөнгөн урсгалын төлөв — гэрээлсэн дүнгийн үлдэгдэл'), chart: { kind: 'bars', unit: 'mnt', items }, text };
}

function finThree(i: ReportInputs, no: string, group: number): Section {
  const { x, d } = i;
  const items: BarItem[] = [
    { label: tr('Нийт төсөв'), value: x.gdash.budget, text: money(x.gdash.budget) },
    { label: tr('Гэрээлсэн'), value: x.gdash.contract, text: money(x.gdash.contract) },
    { label: tr('Олгосон'), value: x.fin.given, hot: true, text: money(x.fin.given) },
  ];
  const text = [
    tr('Төслийн нийт төсөв {0}, үүнээс {1} ({2}) гэрээгээр баталгаажсан.', money(x.gdash.budget), money(x.gdash.contract), x.gdash.budget > 0 ? pct((x.gdash.contract / x.gdash.budget) * 100, 1) : '—'),
    tr('Бодитоор олгосон санхүүжилт {0} — гэрээлсэн дүнгийн {1}.', money(x.fin.given), x.fin.share == null ? '—' : pct(x.fin.share, 1)),
  ];
  const g = givenDelta(d);
  if (g) text.push(g);
  return { key: 'finThree', no, group, title: tr('Санхүүжилт — төсөв, гэрээлсэн, олгосон'), chart: { kind: 'bars', unit: 'mnt', items }, text };
}

function appendixOf(x: ExecReport, no: string): Appendix {
  const prog = new Map(x.prog.packs.map((p) => [p.key, p]));
  const rows = x.fin.rows.map((r) => {
    const p = prog.get(r.key);
    return [
      r.contracted ? r.label : `${r.label} (${tr('гэрээгүй')})`,
      r.plan > 0 ? num(r.plan) : '—',
      num(r.given),
      r.pct == null ? '—' : pct(r.pct, 1),
      p ? pct(progressOf(p.progress), 1) : '—',
    ];
  });
  for (const g of x.fin.ranges) rows.push([tr('{0} (хэд хэдэн багц хамарсан олголт)', g.label), '—', num(g.given), '—', '—']);
  rows.push([tr('Нийт'), num(x.fin.planTotal), num(x.fin.given), x.fin.share == null ? '—' : pct(x.fin.share, 1), pct(progressOf(x.prog.actual), 1)]);
  return {
    no, title: tr('Хавсралт — багц бүрийн гэрээ, олголт, явц'),
    head: [tr('Багц'), tr('Гэрээлсэн (₮)'), tr('Олгосон (₮)'), tr('Олголт'), tr('Явц')],
    rows,
  };
}

/* ═══════════════ Тайлан ═══════════════ */

export function reportTitle(a: Audience): string {
  if (a === 'mayor') return tr('Сэлбэ ухаалаг хотын төслийн тайлан — Хотын даргад');
  if (a === 'council') return tr('Сэлбэ ухаалаг хотын төслийн тайлан — Иргэдийн Төлөөлөгчдийн Хуралд');
  return tr('Сэлбэ ухаалаг хотын төслийн тайлан — Төлөөлөн удирдах зөвлөлд');
}

export function reportSubtitle(i: ReportInputs): string {
  return tr('Хугацаа {0} → {1} · Үүсгэсэн {2} · {3}', i.period.from, i.period.to, i.today, i.user || '—');
}

export function buildReport(aud: Audience, i: ReportInputs): Report {
  let sections: Section[];
  let appendix: Appendix | null = null;
  if (aud === 'mayor') {
    sections = [
      kpiSummary(i, true),
      finFlow(i, '2.1', 2, false), ipcStatus(i, '2.2', 2), finPacks(i, '2.3', 2),
      phases(i, '3', 3),
      housingLine(i, '4.1', 4), packLag(i, '4.2', 4, false),
      infraPacks(i, '5.1', 5), social(i, '5.2', 5, false),
      landStatus(i, '6.1', 6), landPacks(i, '6.2', 6),
      riskCounts(i, '7.1', 7), workforce(i, '7.2', 7),
      attention(i, '8', 8, tr('Дараагийн сард анхаарах зүйл')),
    ];
    appendix = appendixOf(i.x, '9');
  } else if (aud === 'council') {
    sections = [
      kpiSummary(i, false),
      social(i, '2', 2, true),
      finThree(i, '3', 3),
      housingLine(i, '4', 4),
      attention(i, '5', 5, tr('Анхаарах асуудал')),
    ];
  } else {
    sections = [
      kpiSummary(i, true),
      finFlow(i, '2', 2, true),
      ipcStatus(i, '3', 3),
      packLag(i, '4', 4, true),
      cashOutlook(i, '5', 5),
      riskCounts(i, '6', 6),
      decisions(i, '7', 7),
    ];
    appendix = appendixOf(i.x, '8');
  }
  return { audience: aud, title: reportTitle(aud), subtitle: reportSubtitle(i), sections, appendix };
}

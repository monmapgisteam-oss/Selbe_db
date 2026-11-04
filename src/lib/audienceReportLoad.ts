/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — ОРОЛТЫН АЧААЛАГЧ (2026-11-05). Тооцоо нь `audienceReport.ts` (цэвэр); энд зөвхөн одоо байгаа
 * ачаалагчдаас `ReportInputs`-ийг угсарна. Заавал биш эх (өөрчлөлт · төлөвлөгөөний мод · IPC · хоцрогдол · саад · ХАБЭА ·
 * нийгмийн дэд бүтэц · сарын мөр) унавал ТЭР хэсэг «мэдээлэлгүй» болно — тайлан бүхэлдээ унахгүй; `failed`-д нэрлэнэ.
 */
import { loadExecReport, type ExecReport } from '@/lib/execReport';
import { loadExecDeltas } from '@/lib/execPeriod';
import type { ExecPeriod } from '@/lib/execPeriodCalc';
import { loadProjectPlan, type ProjectPlan } from '@/lib/projectPlanInputs';
import type { PlanNode } from '@/lib/projectPlan';
import { loadHoRows, type Row } from '@/lib/ipc';
import { perfRows, docRows } from '@/lib/ipcFlow';
import { HO_IPC } from '@/lib/services';
import { loadFinData, pkgMonthsMap, lagOf, type MonthPt } from '@/modules/Finance';
import { loadPlanCurveCached } from '@/lib/planProgress';
import { loadPkgOverlaps } from '@/lib/pkgSaad';
import { loadWorkforceKpi, type WorkforceKpi } from '@/lib/ceo/workforce';
import { niigemRows } from '@/lib/publicSync/compute';
import { loadCfPlan, type CfPlanRow } from '@/lib/gdash';
import { dayKey, monthKey } from '@/lib/format';
import type { PhaseInput, ReportInputs } from '@/lib/audienceReport';

const txt = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * «Төсөл төлөвлөгөө биелэлт»-ийн мод → Төслийн нийт мөр (S/P) · үе шатууд (1-р түвшин) · Барилга угсралтын дэд хэсэг.
 */
export function phasesOf(plan: Pick<ProjectPlan, 'empty' | 'tree' | 'result'>): Pick<ReportInputs, 'project' | 'phases' | 'buildSub'> {
  if (plan.empty) return { project: null, phases: [], buildSub: [] };
  const v = (n: PlanNode) => plan.result.values.get(n);
  const label = (n: PlanNode) => txt(n.row?.uy_shat) || txt(n.row?.ajil_uilchilgee) || n.code;
  const row = (n: PlanNode, key: string): PhaseInput => ({ key, label: label(n), S: fin(v(n)?.S), P: fin(v(n)?.P) });
  const phases = plan.tree.root.children.map((n, k) => row(n, `${n.phase}:${k}`));
  const b = plan.tree.root.children.find((n) => n.phase === 'barilga');
  const buildSub: PhaseInput[] = [];
  for (const sub of ['beltgel', 'barilga'] as const) {
    const c = b?.children.find((x) => x.sub === sub);
    if (c) buildSub.push({ ...row(c, `barilga:${sub}`), label: txt(c.row?.ajil_uilchilgee) || label(c) });
  }
  const rv = v(plan.tree.root);
  return { project: { S: fin(rv?.S), P: fin(rv?.P) }, phases, buildSub };
}

/**
 * IPC-ийн төлөв бүрийн дүн ₮ — Гүйцэтгэл (IPC-д ороогүй AUTO мөрийн `guits_une`) · IPC үүссэн · Гарын үсэг зурсан (баримтын
 * дүн) · Олгосон (`paid` = `hoTotals.paid`, бүх төлбөр; алга бол олгосон баримтын нийлбэр).
 */
export function ipcStatusTotals(rows: readonly Row[], paid: number | null): NonNullable<ReportInputs['ipc']> {
  const S = HO_IPC.status;
  let work = 0;
  for (const p of perfRows(rows)) if (p.status === S.work) work += p.une ?? 0;
  let created = 0, signed = 0, paidDocs = 0;
  for (const d of docRows(rows)) {
    if (d.isCancel) continue;
    if (d.status === S.created) created += d.total ?? 0;
    else if (d.status === S.signed) signed += d.total ?? 0;
    else if (d.status === S.paid) paidDocs += d.total ?? 0;
  }
  return { work, created, signed, paid: paid ?? paidDocs };
}

/** Багц бүрийн хоцрогдол — `Finance.lagOf` (хуваарийн муруй ачаалагдсан байх ёстой) */
export function lagInputs(packs: ExecReport['prog']['packs'], byKey: ReadonlyMap<string, MonthPt[]>): ReportInputs['lag'] {
  const out: ReportInputs['lag'] = [];
  for (const p of packs) {
    const l = lagOf(byKey.get(p.key) ?? []);
    if (l) out.push({ key: p.key, label: p.name, planned: l.planned, actual: l.actual, gap: l.gap, coverage: l.coverage });
  }
  return out;
}

/** Ирэх `n` сарын төлөвлөсөн санхүүжилт — сарын мөрийн `amount` сараар; одоогийн сараас хойш; мөр алга бол null */
export function cashOutlookOf(rows: readonly CfPlanRow[], nowYm: string, n = 6): ReportInputs['cashOutlook'] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.start == null || r.amount == null || !Number.isFinite(r.amount)) continue;
    const k = monthKey(r.start);
    if (k < nowYm) continue;
    by.set(k, (by.get(k) ?? 0) + r.amount);
  }
  const months = [...by.keys()].sort().slice(0, n);
  return months.length ? { months, planned: months.map((m) => by.get(m) ?? 0) } : null;
}

export async function loadAudienceInputs(period: ExecPeriod, user: string, now: number = Date.now()): Promise<ReportInputs> {
  const x = await loadExecReport();
  const [d, plan, ho, finPair, saad, wf, cf] = await Promise.allSettled([
    loadExecDeltas(x, period),
    loadProjectPlan(),
    loadHoRows(),
    Promise.all([loadPlanCurveCached(), loadFinData()]),
    loadPkgOverlaps(),
    loadWorkforceKpi() as Promise<WorkforceKpi>,
    loadCfPlan(),
  ]);
  const failed: string[] = [];
  const ok = <T,>(r: PromiseSettledResult<T>, name: string): T | null => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[selbe] хүлээн авагчийн тайлан: ${name} уншигдсангүй`, r.reason);
    failed.push(name);
    return null;
  };
  const deltas = ok(d, 'deltas');
  const pl = ok(plan, 'plan');
  const hoRows = ok(ho, 'ipc');
  const fp = ok(finPair, 'lag');
  const ov = ok(saad, 'saad');
  const w = ok(wf, 'hse');
  const cfRows = ok(cf, 'cashflow');
  const ph = pl ? phasesOf(pl) : { project: null, phases: [], buildSub: [] };
  return {
    x,
    d: deltas,
    ...ph,
    ipc: hoRows ? ipcStatusTotals(hoRows, x.fin.given) : null,
    lag: fp ? lagInputs(x.prog.packs, pkgMonthsMap(fp[1])) : [],
    saad: ov ? ov.filter((o) => !o.failed).map((o) => ({ key: o.key, name: o.name, n: o.oids.length })) : null,
    hseDays: w ? [...w.detail.days].sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ key: r.key, workers: r.workers, technik: r.technik })) : null,
    niigem: pl && !pl.empty ? niigemRows(pl).map((r) => ({ name: txt(r.ner), pct: fin(r.guitsetgel_huvi), bagts: txt(r.bagts_kod) })) : null,
    cashOutlook: cfRows ? cashOutlookOf(cfRows, monthKey(now)) : null,
    today: dayKey(now),
    period,
    user,
    failed,
  };
}

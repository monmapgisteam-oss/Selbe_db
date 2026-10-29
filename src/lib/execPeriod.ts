/**
 * УДИРДЛАГЫН ТАЙЛАН — хугацааны өөрчлөлтийн АЧААЛАГЧ (2026-10-28). Тооцоо нь `execPeriodCalc.ts` (цэвэр, тестлэгдсэн);
 * энд зөвхөн түүхтэй эх сурвалжуудыг татаж оролт болгоно.
 */
import { loadFinData, aggregateMonths, pkgMonthsMap, projectPlanOf } from '@/modules/Finance';
import { loadPlanCurveCached } from '@/lib/planProgress';
import { loadWorkforceKpi, type WorkforceKpi } from '@/lib/ceo/workforce';
import { loadZov, TOLOV } from '@/lib/zovshoorol';
import { HO_IPC, hoAmount, pkgKeyOf } from '@/lib/services';
import { finPkgKey } from '@/lib/pkgAlias';
import { dayKey, monthKey } from '@/lib/format';
import { loadBlockHistory, loadBlockUniverse, loadInfraHistory, loadInfraUniverse } from '@/lib/blockProgress';
import { cfWeightRow, pkgCostWeight } from '@/lib/gdash';
import { execProgressPoints } from '@/lib/execPeriodProgress';
import type { ExecReport } from '@/lib/execReport';
import { computeExecDeltas, computeSeries, type ExecDeltas, type ExecPeriod } from '@/lib/execPeriodCalc';

/** ArcGIS огнооны талбар — epoch ms тоо (эсвэл текст огноо); хоосон → null */
const msOf = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function loadExecDeltas(x: ExecReport, period: ExecPeriod): Promise<ExecDeltas> {
  const [fin, pc, wf, zovRows, histB, universeB, histI, universeI] = await Promise.all([
    loadFinData(),
    loadPlanCurveCached().catch(() => null),
    (loadWorkforceKpi() as Promise<WorkforceKpi>).catch(() => null),
    loadZov().catch(() => null),
    loadBlockHistory(), loadBlockUniverse(), loadInfraHistory(), loadInfraUniverse(),
  ]);
  const byKey = pkgMonthsMap(fin);
  const HP = HO_IPC.payFields;
  const HC = HO_IPC.contractFields;
  const months = aggregateMonths(fin, pc);
  const packs = x.prog.packs.map((p) => ({ key: p.key, label: p.name, kind: p.kind, months: byKey.get(p.key) ?? [] }));
  const progress = execProgressPoints(
    new Map([...histB, ...histI]), new Map([...universeB, ...universeI]),
    pkgCostWeight(fin.contracts.map(cfWeightRow)), dayKey(Date.now()),
  );
  const d = computeExecDeltas({
    housing: progress.housing,
    packs: packs.map((p) => ({ key: p.key, label: p.label, points: progress.packs.get(p.key) ?? [] })),
    pays: fin.pays.map((p) => {
      const k = pkgKeyOf(p[HC.pkg]);
      return { at: msOf(p[HP.payDate]), amount: hoAmount(p), key: k && k !== '0' ? finPkgKey(k) : undefined };
    }),
    givenTotal: x.fin.given,
    days: wf?.detail.days.map((d) => ({ key: d.key, workers: d.workers, technik: d.technik })) ?? [],
    zov: zovRows
      ? zovRows.map((z) => ({
        kind: z.tolov === TOLOV.ok ? 'ok' : z.tolov === TOLOV.no ? 'no' : z.tolov === TOLOV.wait ? 'wait' : 'unknown',
        at: z.ognoo,
      }))
      : null,
  }, period);
  d.series = computeSeries({
    months,
    plan: pc ? projectPlanOf(fin, pc) : [],
    packs,
    planTotal: x.fin.planTotal,
    nowYm: monthKey(),
  });
  return d;
}

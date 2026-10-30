'use client';

/**
 * ХУВААРИЙН ШИНЖИЛГЭЭ (2026-10-29) — `Huvaari.tsx`-ээс механикаар салгав (логик ХЭВЭЭР). Самбарын нээлттэй таб дээр л
 * бодно (`lib/planAnalysis`): асуудал · эгзэгтэй зам (хуанлийн улаан хүрээ — `critOids`) · хоцролт · нөөц · Excel экспорт.
 * Өгөгдлийг өөрчлөхгүй.
 */
import { useCallback, useMemo } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { fixCyr } from '@/lib/format';
import { spanDays, type PlanRow, type Span } from '@/lib/plan';
import { baselineDelays, criticalFloat, planIssues, sumResByMonth } from '@/lib/planAnalysis';
import type { MonthRes } from '@/lib/huvaariObyem';
import { buildXlsx, downloadXlsx, type XlsxCell } from '@/lib/xlsx';
import { fileDate } from '@/lib/csvFile';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import type { AnaTab } from './AnalysisPanel';
import type { PlanKind } from './types';

export function useAnalysis({
  ana, plan, base, blk, unbalRows, kind, refSpanOf, sc, obResOf, obOf, pkgKey,
}: {
  ana: AnaTab | null;
  plan: PlanRow[];
  base: PlanRow[];
  blk: number;
  unbalRows: Map<number, number[]>;
  kind: PlanKind;
  refSpanOf: (oid: number, b: number) => Span | null;
  sc: Schema | null;
  obResOf: (des: number | null, blok: string) => Map<string, MonthRes>;
  obOf: (des: number | null, blok: string) => Map<string, number>;
  pkgKey: string;
}) {
  const anaIssues = useMemo(
    () => (ana === 'issues' ? planIssues(plan, blk, {
      unbal: unbalRows,
      geree: kind === 'plan' ? (i) => refSpanOf(plan[i].oid, blk) : undefined,
      withDeps: kind === 'plan',
    }) : null),
    [ana, plan, blk, unbalRows, kind, refSpanOf],
  );
  const anaCrit = useMemo(() => (ana === 'crit' ? criticalFloat(plan, blk) : null), [ana, plan, blk]);
  const critOids = useMemo(() => {
    if (!anaCrit) return null;
    const s = new Set<number>();
    for (const [i, f] of anaCrit) if (f <= 0) s.add(plan[i].oid);
    return s;
  }, [anaCrit, plan]);
  const anaDelays = useMemo(() => (ana === 'delay' ? baselineDelays(base, plan, blk) : null), [ana, base, plan, blk]);
  const anaRes = useMemo(() => {
    if (ana !== 'res' || !sc) return null;
    const parts: Map<string, MonthRes>[] = [];
    for (const r of plan) {
      if (r.group || r.des == null) continue;
      for (const blok of sc.bld) parts.push(obResOf(r.des, blok));
    }
    return sumResByMonth(parts);
  }, [ana, sc, plan, obResOf]);
  /** EXCEL — ажил × блок бүрийн огноо · хоног · обьём · сарын обьём (ноорог орсон, одоогийн таб) */
  const exportPlan = useCallback(() => {
    if (!sc) return;
    const items: { r: PlanRow; b: number; sp: Span; months: Map<string, number> }[] = [];
    const mset = new Set<string>();
    for (const r of plan) {
      if (r.group) continue;
      r.spans.forEach((sp, b) => {
        if (!sp) return;
        const blok = sc.bld[b] ?? '';
        const months = kind === 'plan' && r.des != null && blok ? obOf(r.des, blok) : new Map<string, number>();
        for (const k of months.keys()) mset.add(k);
        items.push({ r, b, sp, months });
      });
    }
    const mk = [...mset].sort();
    const bold = { bold: true, fill: 'E8EEF7', border: true };
    const head: XlsxCell[] = [tr('№'), tr('Код'), tr('Ажил'), tr('Блок'), tr('Эхлэх'), tr('Дуусах'), tr('Хоног'), tr('Обьём'), ...mk]
      .map((v) => ({ v, s: bold }));
    const rowsX: XlsxCell[][] = [head];
    for (const it of items) {
      rowsX.push([
        it.r.no, it.r.des, fixCyr(it.r.work), sc.bld[it.b] ?? '', msToDay(it.sp.start), msToDay(it.sp.end), spanDays(it.sp),
        it.r.vol, ...mk.map((k) => it.months.get(k) ?? null),
      ]);
    }
    const bytes = buildXlsx([{ name: kind === 'plan' ? tr('Төлөвлөгөө') : tr('Гэрээ'), rows: rowsX, frozen: { rows: 1, cols: 3 }, cols: [6, 6, 48, 8, 11, 11, 7, 10] }]);
    downloadXlsx(`${tr('Хуваарь')}_${pkgKey}_${fileDate()}.xlsx`, bytes);
  }, [sc, plan, kind, obOf, pkgKey]);

  return { anaIssues, anaCrit, critOids, anaDelays, anaRes, exportPlan };
}

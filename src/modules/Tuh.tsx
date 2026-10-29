'use client';

/**
 * «ТУХ» — ТӨСЛИЙН УДИРДЛАГЫН ХЭСГИЙН БАГЦЫН ХЯНАЛТЫН САМБАР (2026-09-30).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Dim } from '@/components/MapCanvas';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { useAsync } from '@/lib/useAsync';
import { readParam, writeParams } from '@/lib/urlState';
import { loadBudget } from '@/lib/live';
import { loadCfPlan, cfPlanGaps, cfGapsText, CONTRACTED } from '@/lib/gdash';
import { CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { loadPlanCurveCached } from '@/lib/planProgress';
import { loadBlockHistory } from '@/lib/blockProgress';
import { loadWorkforceKpi, type WorkforceDetail } from '@/lib/ceo/workforce';
import { loadPkgDeps } from '@/lib/workDepsRemote';
import { buildPacks, type Pack } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import { loadFinData } from '@/modules/Finance';
import { friendlyError, Loading } from '@/components/ui';
import { loadCommissionDates } from './tuh/tuhSchedule';
import { buildModel, type TuhSrc } from './tuh/model';
import type { LiveMap } from '@/lib/tuhData';

const loadLiveProgressLazy = (): Promise<LiveMap> => import('@/lib/projectPlanInputs').then((m) => m.loadLiveProgress());
import { Overview } from './tuh/Overview';
import { PkgDetail } from './tuh/PkgDetail';
import { TuhMap, type MapSel } from './tuh/TuhMap';
import s from './tuh.module.css';

export function Tuh({ dim, setDim, onOpenDeps }: {
  dim: Dim;
  setDim: (d: Dim) => void;
  /**
   * «Багцын хамаарал» харагдац руу шилжих (`Portal.setView`) — эрхгүй/өгөөгүй бол холбоос гарахгүй.
   */
  onOpenDeps?: () => void;
}) {
  const { hostRef, ...side } = useSideResize('tuh');
  const contentRef = useRef<HTMLDivElement>(null);

  const bq = useBuildings();
  const finQ = useAsync(loadFinData, []);
  const planQ = useAsync(loadPlanCurveCached, []);
  const cfPlanQ = useAsync(loadCfPlan, []);
  const histQ = useAsync(loadBlockHistory, []);
  const comQ = useAsync(loadCommissionDates, []);
  const wfQ = useAsync(loadWorkforceKpi, []);
  const budgetQ = useAsync(loadBudget, []);
  const depQ = useAsync(loadPkgDeps, []);
  const liveQ = useAsync(loadLiveProgressLazy, []);

  const [sel, setSel] = useState<string | null>(() => readParam('tuh'));
  useEffect(() => { writeParams({ tuh: sel }, { push: true }); }, [sel]);
  useEffect(() => {
    const onPop = () => setSel(readParam('tuh'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /* Багц солиход агуулга дээрээсээ эхэлнэ */
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [sel]);

  const packs = useMemo<Pack[]>(() => buildPacks(bq.state === 'ready' ? bq.data.rows : null), [bq]);

  const model = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    const failed: string[] = [];
    if (planQ.state === 'error') failed.push(tr('Хуваарийн төлөвлөгөө'));
    if (cfPlanQ.state === 'error') failed.push(tr('Гэрээний сарын төлөвлөгөө'));
    if (histQ.state === 'error') failed.push(tr('Гүйцэтгэлийн түүх'));
    if (comQ.state === 'error') failed.push(tr('Улсын комиссын огноо'));
    if (comQ.state === 'ready' && comQ.data.failed.length) failed.push(tr('Улсын комиссын огноо ({0})', comQ.data.failed.join(', ')));
    if (wfQ.state === 'error') failed.push(tr('Хүн хүч (ХАБЭА)'));
    if (bq.state === 'error') failed.push(tr('Барилгын блок'));
    if (planQ.state === 'ready' && planQ.data.failed.length) failed.push(`${tr('Хуваарийн төлөвлөгөө')} (${planQ.data.failed.join(', ')})`);
    if (budgetQ.state === 'error') failed.push(tr('Гэрээний нийт дүн'));
    if (depQ.state === 'error') failed.push(tr('Багцын хамаарал'));
    if (liveQ.state === 'error') failed.push(tr('Гэрээний амьд гүйцэтгэл'));
    const loading = new Set<TuhSrc>();
    if (planQ.state === 'loading') loading.add('plan');
    if (cfPlanQ.state === 'loading') loading.add('cfPlan');
    if (histQ.state === 'loading') loading.add('hist');
    if (comQ.state === 'loading') loading.add('commission');
    if (wfQ.state === 'loading') loading.add('workforce');
    if (bq.state === 'loading') loading.add('packs');
    if (budgetQ.state === 'loading') loading.add('budget');
    if (depQ.state === 'loading') loading.add('deps');
    if (liveQ.state === 'loading') loading.add('live');
    const wf = wfQ.state === 'ready' && 'detail' in wfQ.data ? (wfQ.data as { detail: WorkforceDetail }).detail : null;
    const gaps = cfPlanQ.state === 'ready' ? cfPlanGaps(cfPlanQ.data) : null;
    const cfGaps = gaps ? cfGapsText(gaps, (id) => {
      const r = finQ.data.contracts.find((c) => Number(c[CF_MONTH.id]) === id);
      return r ? String(r[CASHFLOW_NEW.fields.pkg] ?? '').trim() || null : null;
    }) : null;
    return buildModel({
      fin: finQ.data,
      plan: planQ.state === 'ready' ? planQ.data : null,
      cfPlan: cfPlanQ.state === 'ready' ? cfPlanQ.data : null,
      packs: bq.state === 'ready' ? packs : null,
      hist: histQ.state === 'ready' ? histQ.data : null,
      commission: comQ.state === 'ready' ? comQ.data.dates : null,
      commissionPartial: comQ.state === 'ready' ? comQ.data.partial : null,
      workforce: wf,
      docs: null,
      deps: depQ.state === 'ready' ? depQ.data.deps : null,
      live: liveQ.state === 'ready' ? liveQ.data : null,
      contractedNote: CONTRACTED,
      failed,
      cfGaps,
      loading,
      planError: planQ.state === 'error',
    });
  }, [finQ, planQ, cfPlanQ, histQ, comQ, wfQ, bq, packs, budgetQ, depQ, liveQ]);

  /*
   * «ДАХИН ОРОЛДОХ» — УНАСАН эх сурвалжуудыг л дахин татна (2026-10-01, «хэрэглэгч:
   * бүгдийг зас»). Урьд нь зөвхөн шар мөр гардаг тул бүтэн хуудас refresh хийхээс өөр
   * аргагүй байв (газрын зураг ч дахин ачаалагдана).
   */
  const retryFailed = useCallback(() => {
    if (finQ.state === 'error') finQ.retry?.();
    if (planQ.state === 'error' || (planQ.state === 'ready' && planQ.data.failed.length)) planQ.retry?.();
    if (cfPlanQ.state === 'error' || (cfPlanQ.state === 'ready' && cfPlanGaps(cfPlanQ.data)?.partial)) cfPlanQ.retry?.();
    if (histQ.state === 'error') histQ.retry?.();
    if (comQ.state === 'error' || (comQ.state === 'ready' && comQ.data.failed.length)) comQ.retry?.();
    if (wfQ.state === 'error') wfQ.retry?.();
    if (bq.state === 'error') bq.retry?.();
    if (budgetQ.state === 'error') budgetQ.retry?.();
    if (depQ.state === 'error') depQ.retry?.();
  }, [finQ, planQ, cfPlanQ, histQ, comQ, wfQ, bq, budgetQ, depQ]);

  const row = model && sel ? model.rows.find((r) => r.p.key === sel) ?? null : null;
  const open = useCallback((k: string) => setSel(k), []);
  const back = useCallback(() => setSel(null), []);

  const selPkg = row ? row.p.pkgKey : null;
  const selHousing = row?.p.group === 'housing';
  const mapSel = useMemo<MapSel>(
    () => (selPkg == null ? null : { pkgKey: selPkg, housing: selHousing }),
    [selPkg, selHousing],
  );
  /* Газрын зураг дээр блок дарвал — тэр блокийн (орон сууцны) багц нээгдэнэ */
  const onPickPkg = useCallback((pkgKey: string | null) => {
    if (!pkgKey || !model) return;
    const hit = model.rows.find((r) => r.p.pkgKey === pkgKey && r.p.group === 'housing')
      ?? model.rows.find((r) => r.p.pkgKey === pkgKey);
    if (hit) setSel(hit.p.key);
  }, [model]);

  return (
    <div ref={hostRef} className={`${s.tuh} ${side.hostClass}`} style={side.style}>
      <SplitGrip {...side.right} />
      <div ref={contentRef} className={s.content}>
        {finQ.state === 'loading' ? (
          <Loading />
        ) : finQ.state === 'error' ? (
          <p className={s.failNote} role="alert">
            {tr('Санхүүгийн өгөгдөл татагдсангүй')}: {friendlyError(finQ.error)}
            {' '}
            <button type="button" className={s.retryBtn} onClick={retryFailed}>{tr('Дахин оролдох')}</button>
          </p>
        ) : !model ? null : row ? (
          <PkgDetail key={row.p.key} r={row} m={model} onBack={back} onOpen={open} onOpenDeps={onOpenDeps} />
        ) : (
          <Overview m={model} contractTotal={budgetQ.state === 'ready' ? budgetQ.data.contract : null} onOpen={open} onRetry={retryFailed} onOpenDeps={onOpenDeps} />
        )}
      </div>
      <div className={s.side}>
        <TuhMap dim={dim} setDim={setDim} sel={mapSel} packs={packs} packsState={bq.state} onPickPkg={onPickPkg} />
      </div>
    </div>
  );
}

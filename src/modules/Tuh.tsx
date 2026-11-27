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
import { loadTuhDocs } from './tuh/tuhDocs';
import type { LiveMap, PkgProgMap } from '@/lib/tuhData';

const loadLiveProgressLazy = (): Promise<LiveMap> => import('@/lib/projectPlanInputs').then((m) => m.loadLiveProgress());
/** 2026-11-24: БАГЦЫН ГҮЙЦЭТГЭЛ — «Төсөл төлөвлөгөө биелэлт»-ийн 2-р унтраалгатай мөрүүдээс (систем даяар нэг эх) */
const loadPlanPkgLazy = (): Promise<PkgProgMap> => import('@/lib/projectPlanInputs').then((m) => m.loadPlanPkgProgress());
/** 2026-11-27 (аудит): гэрээлсэн нийтэд орсон газрын нөхөх олговор — «олгосон хувь»-ийн тоологчид (`withProjectContract`) */
const loadLandCompLazy = (): Promise<number> => import('@/lib/projectPlanInputs').then((m) => m.loadProjectLandComp()).catch(() => 0);
/**
 * 2026-11-24 (аудит): «Төсөл төлөвлөгөө биелэлт»-ийн Төслийн нийт мөрийн S/P — удирдлагын тайлантай ИЖИЛ дүрэм: бодит эх унасан
 * бол S «—», хэмжигдээгүй бол 0%.
 */
async function loadProjectRoot(): Promise<{ S: number | null; P: number | null } | null> {
  const [{ loadProjectPlan }, { negtgelActualFailed }] = await Promise.all([import('@/lib/projectPlanInputs'), import('@/lib/negtgel')]);
  const pl = await loadProjectPlan();
  if (pl.empty) return null;
  const v = pl.result.values.get(pl.tree.root);
  return { S: negtgelActualFailed(pl.failed) ? null : v?.S ?? 0, P: v?.P ?? null };
}
import { PkgList, Portfolio, anchorId } from './tuh/Board';
import { loadTuhExtra, type TuhExtra } from './tuh/extra';
import b from './tuh/board.module.css';
import { TuhMap, type MapSel } from './tuh/TuhMap';
import s from './tuh.module.css';

export function Tuh({ dim, setDim, onOpenDeps }: {
  dim: Dim;
  setDim: (d: Dim) => void;
  /**
   * «6 түвшний хуваарь» руу шилжих (`Portal.setView`; 2026-11-24: багцын хамаарал тэнд засагдана) — эрхгүй/өгөөгүй бол холбоос гарахгүй.
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
  const pkgQ = useAsync(loadPlanPkgLazy, []);
  const docsQ = useAsync(loadTuhDocs, []);
  const projQ = useAsync(loadProjectRoot, []);
  const compQ = useAsync(loadLandCompLazy, []);
  /* 2026-11-23: газар · зөвшөөрөл · ХАБЭА · нэмэлт ажил · блок/дулаан — багцаар */
  const extraQ = useAsync(() => loadTuhExtra(), []);
  /**
   * Гүйлгэхэд шүүлтийн мөрийн доор байгаа багц — жагсаалтын тодруулга (URL-д бичихгүй, газрын зургийг хөдөлгөхгүй).
   * `undefined` = гүйлгэлт хараахан тооцогдоогүй (тэр үед дарсан `sel` тодорно).
   */
  const [active, setActive] = useState<string | null | undefined>(undefined);

  const [sel, setSel] = useState<string | null>(() => readParam('tuh'));
  /** Сонголт бүрийн тоолуур — ИЖИЛ багцыг дахин дарахад ч тэр рүү буцаж гүйлгэнэ */
  const [jump, setJump] = useState(0);
  useEffect(() => { writeParams({ tuh: sel }, { push: true }); }, [sel]);
  useEffect(() => {
    const onPop = () => { setSel(readParam('tuh')); setJump((n) => n + 1); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const ready = finQ.state === 'ready';
  /*
   * Багц сонгоход (жагсаалт · анхааруулга · хамаарал · газрын зураг · URL) тэр багц руу ГҮЙЛГЭЖ очно.
   * Самбар хараахан зурагдаагүй (өгөгдөл ачаалж буй, шүүлт цэвэрлэгдэж буй) бол гарч иртэл хүлээнэ (≤6 сек);
   * олдсоны дараа 600мс-д дахин — Lazy график зурагдаж өндөр өөрчлөгдсөн байрлалыг засна.
   */
  useEffect(() => {
    if (!ready) return undefined;
    if (!sel) { contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return undefined; }
    let t: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    let hits = 0;
    const go = () => {
      const el = document.getElementById(anchorId(sel));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        if (++hits < 2) t = setTimeout(go, 600);
        return;
      }
      if (++tries < 40) t = setTimeout(go, 150);
    };
    t = setTimeout(go, 30);
    return () => clearTimeout(t);
  }, [sel, jump, ready]);

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
    if (docsQ.state === 'error') failed.push(tr('MA · MIR (Survey123)'));
    if (projQ.state === 'error') failed.push(tr('Төсөл төлөвлөгөө биелэлт'));
    if (pkgQ.state === 'error') failed.push(tr('Багцын гүйцэтгэл'));
    const loading = new Set<TuhSrc>();
    if (pkgQ.state === 'loading') loading.add('pkg');
    if (docsQ.state === 'loading') loading.add('docs');
    if (projQ.state === 'loading') loading.add('project');
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
      docs: docsQ.state === 'ready' ? docsQ.data : null,
      deps: depQ.state === 'ready' ? depQ.data.deps : null,
      live: liveQ.state === 'ready' ? liveQ.data : null,
      contractedNote: CONTRACTED,
      failed,
      cfGaps,
      loading,
      planError: planQ.state === 'error',
      /* 2026-11-23 (аудит №8): олгосон хувийг ТТБ-ийн гэрээлсэн нийт (2,046.5) дүнгээр — ажлын мөрийн нийлбэрээр биш */
      projContract: budgetQ.state === 'ready' ? budgetQ.data.contract : null,
      landComp: compQ.state === 'ready' ? compQ.data : 0,
      project: projQ.state === 'ready' ? projQ.data : null,
      /* 2026-11-24: багцын мөрийн гүйцэтгэл/төлөвлөгөө — ачаалж буй/унасан бол null («…»/«—»), хуучин эх рүү буцахгүй */
      pkgProg: pkgQ.state === 'ready' ? pkgQ.data : null,
    });
  }, [finQ, planQ, cfPlanQ, histQ, comQ, wfQ, bq, packs, budgetQ, depQ, liveQ, docsQ, projQ, pkgQ, compQ]);

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
    if (docsQ.state === 'error') docsQ.retry?.();
    if (projQ.state === 'error') projQ.retry?.();
    if (pkgQ.state === 'error') pkgQ.retry?.();
    /* Анхааруулгын мөрөнд нэрлэгддэг бүх эх — амьд гүйцэтгэл ба нэмэлт сэдвүүд (газар · зөвшөөрөл · ХАБЭА · …) */
    if (liveQ.state === 'error') liveQ.retry?.();
    if (extraQ.state === 'error' || (extraQ.state === 'ready' && extraQ.data.failed.length)) extraQ.retry?.();
  }, [finQ, planQ, cfPlanQ, histQ, comQ, wfQ, bq, budgetQ, depQ, docsQ, liveQ, extraQ, projQ, pkgQ]);

  /* Нэмэлт сэдвийн ачаалагч бүхэлдээ унавал «…» мөнхөд үлдэхгүй — бүх хэсэг «—», анхааруулгын мөрөнд нэрлэнэ */
  const extra = useMemo<TuhExtra | null>(() => (
    extraQ.state === 'ready' ? extraQ.data
      : extraQ.state === 'error' ? { land: null, permits: null, safety: null, ajilPending: null, blocks: null, failed: [tr('Газар · зөвшөөрөл · ХАБЭА · нэмэлт ажил · блок')] }
        : null
  ), [extraQ]);

  /* Жагсаалтын тодруулга — гүйлгэлтээр тооцсон багц; тооцоогүй бол дарсан */
  const listSel = active === undefined ? sel : active;
  const open = useCallback((k: string | null) => { setSel(k); setActive(k); setJump((n) => n + 1); }, []);

  /* Газрын зураг зөвхөн дарсан (sel) багцад томруулна — гүйлгэх (active) үед хөдлөхгүй */
  const picked = model && sel ? model.rows.find((r) => r.p.key === sel) ?? null : null;
  const selPkg = picked ? picked.p.pkgKey : null;
  const selHousing = picked?.p.group === 'housing';
  const mapSel = useMemo<MapSel>(
    () => (selPkg == null ? null : { pkgKey: selPkg, housing: selHousing }),
    [selPkg, selHousing],
  );
  /* Газрын зураг дээр блок дарвал — тэр блокийн (орон сууцны) багц нээгдэнэ */
  const onPickPkg = useCallback((pkgKey: string | null) => {
    if (!pkgKey || !model) return;
    const hit = model.rows.find((r) => r.p.pkgKey === pkgKey && r.p.group === 'housing')
      ?? model.rows.find((r) => r.p.pkgKey === pkgKey);
    if (hit) open(hit.p.key);
  }, [model, open]);

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
        ) : !model ? null : (
          /* 2026-11-23: ТУХ шинээр — багц бүрээр хянах (жагсаалт + нийт хяналт / багцын самбар) */
          <div className={b.shell}>
            <div className={b.layout}>
              <PkgList m={model} sel={listSel} onOpen={open} />
              <Portfolio
                m={model}
                extra={extra}
                contractTotal={budgetQ.state === 'ready' ? budgetQ.data.contract : null}
                sel={sel}
                jump={jump}
                onOpen={open}
                onActive={setActive}
                onRetry={retryFailed}
                onOpenDeps={onOpenDeps}
              />
            </div>
          </div>
        )}
      </div>
      <div className={s.side}>
        <TuhMap dim={dim} setDim={setDim} sel={mapSel} packs={packs} packsState={bq.state} onPickPkg={onPickPkg} />
      </div>
    </div>
  );
}

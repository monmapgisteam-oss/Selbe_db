'use client';

/**
 * «ТУХ» — ТӨСЛИЙН УДИРДЛАГЫН ХЭСГИЙН БАГЦЫН ХЯНАЛТЫН САМБАР (2026-09-30).
 *
 * ⚠️ ЯАГААД: хэрэглэгч `docs/jishee/Selbe City Packages.html` жишээг өгч
 *    «бүтцийг алдагдуулахгүй, загварыг бүрэн системийг дууриалга, газрын зураг
 *    системийнхтэй яг адилхан, тоо бүгд системээс» гэсэн. Тиймээс:
 *      · БҮТЭЦ (хэсэг, багана, таб, дараалал) — жишээнийх;
 *      · ЗАГВАР — системийн токен/бүрэлдэхүүн (`tuh.module.css`);
 *      · ЗУРАГ — `TuhMap` (PkgProg-ийн ижил жор), БАРУУН талд байнга;
 *      · ТОО — `tuh/model.ts` → системийн ачаалагчууд. Эх сурвалжгүй нь «—».
 *
 * ⚠️ Сонгосон багц `?tuh=` параметрт — PkgProg/PkgFin-ийн `?pkg=`-тэй ХОЛИХГҮЙ
 *    (ТУХ-ын түлхүүр бүлгийн угтвартай: «energy:БАГЦ61»).
 * ⚠️ Газрын зураг НЭГ Л УДАА mount — тойм/дэлгэрэнгүй зөвхөн зүүн баганад солигдоно.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Dim } from '@/components/MapCanvas';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { useAsync } from '@/lib/useAsync';
import { readParam, writeParams } from '@/lib/urlState';
import { loadBudget } from '@/lib/live';
import { loadCfPlan, CONTRACTED } from '@/lib/gdash';
import { loadPlanCurveCached } from '@/lib/planProgress';
import { loadBlockHistory } from '@/lib/blockProgress';
import { loadWorkforceKpi, type WorkforceDetail } from '@/lib/ceo/workforce';
import { loadAllDocs } from '@/lib/chanarStore';
import { loadDeps } from '@/lib/bagtsHamaaral';
import { buildPacks, type Pack } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import { loadFinData } from '@/modules/Finance';
import { friendlyError } from '@/components/ui';
import { loadCommissionDates } from './tuh/tuhSchedule';
import { buildModel, type TuhSrc } from './tuh/model';
import { Overview } from './tuh/Overview';
import { PkgDetail } from './tuh/PkgDetail';
import { TuhMap, type MapSel } from './tuh/TuhMap';
import s from './tuh.module.css';

export function Tuh({ dim, setDim, onOpenDeps }: {
  dim: Dim;
  setDim: (d: Dim) => void;
  /**
   * «Багцын хамаарал» харагдац руу шилжих (`Portal.setView`) — эрхгүй/өгөөгүй бол холбоос гарахгүй.
   * ⚠️ 2026-10-06: URL-аар тойрч болохгүй (`ViewCtx.setView`-ийн ⚠️) тул дуудагчаас ирнэ.
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
  const docQ = useAsync(loadAllDocs, []);
  const budgetQ = useAsync(loadBudget, []);
  /* ⚠️ 2026-10-06 (аудит): «Багцын хамаарал»-ын холбоосууд — урьд нь ТУХ огт уншдаггүй тул
     «Улсын комисст бэлэн байдал»-ын салбар багцын нүд үргэлж «—», «бүртгэгдээгүй» гэсэн
     ХУДАЛ бичигтэй байв. */
  const depQ = useAsync(loadDeps, []);

  const [sel, setSel] = useState<string | null>(() => readParam('tuh'));
  /*
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): багц нээх/хаах нь хөтчийн ТҮҮХЭНД шинэ бичлэг
   *    (`push`) — Back тойм руу буцааж, Forward багцыг дахин нээнэ. Урьд нь `replace` тул
   *    Back дарахад ТУХ-аас бүхэлдээ гардаг байв.
   *    · popstate → URL-аас `sel` сэргээнэ; тэр үед URL аль хэдийн зөв тул доорх
   *      `writeParams` өөрөө no-op (`urlState.writeParams`-ийн ⚠️) — гогцоо үүсэхгүй.
   *    · Анхны mount-д URL = төлөв → мөн no-op (шинэ бичлэг үүсэхгүй).
   *    · `Portal`-ийн popstate (харагдац ижил) нь харагдацыг хөндөхгүй — ТУХ mount хэвээр.
   */
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
    /* ⚠️ Унасан эх сурвалжийг НЭРЛЭЖ хэлнэ — холбогдох тоо «—» болж, «0» гэж уншигдахгүй */
    const failed: string[] = [];
    if (planQ.state === 'error') failed.push(tr('Хуваарийн төлөвлөгөө'));
    if (cfPlanQ.state === 'error') failed.push(tr('Гэрээний сарын төлөвлөгөө'));
    if (histQ.state === 'error') failed.push(tr('Гүйцэтгэлийн түүх'));
    if (comQ.state === 'error') failed.push(tr('Улсын комиссын огноо'));
    if (comQ.state === 'ready' && comQ.data.failed.length) failed.push(tr('Улсын комиссын огноо ({0})', comQ.data.failed.join(', ')));
    if (wfQ.state === 'error') failed.push(tr('Хүн хүч (ХАБЭА)'));
    if (docQ.state === 'error') failed.push(tr('MA/MIR баримт'));
    if (bq.state === 'error') failed.push(tr('Барилгын блок'));
    /* ⚠️ 2026-09-30: хагас уншигдсан хуваарь (`PlanCurve.failed`) — тэр багцын гүйцэтгэгчийн
       төлөвлөгөө «—» болно; шалтгааныг нэрлэнэ («Гүйцэтгэл»-ийн `TsKpi`-тэй ижил) */
    if (planQ.state === 'ready' && planQ.data.failed.length) failed.push(`${tr('Хуваарийн төлөвлөгөө')} (${planQ.data.failed.join(', ')})`);
    if (budgetQ.state === 'error') failed.push(tr('Гэрээний нийт дүн'));
    if (depQ.state === 'error') failed.push(tr('Багцын хамаарал'));
    /* ⚠️ 2026-10-01: ачаалж буй эх сурвалж — тэдгээрийн тоо «—» биш «…» (`model.lz`-ийн ⚠️) */
    const loading = new Set<TuhSrc>();
    if (planQ.state === 'loading') loading.add('plan');
    if (cfPlanQ.state === 'loading') loading.add('cfPlan');
    if (histQ.state === 'loading') loading.add('hist');
    if (comQ.state === 'loading') loading.add('commission');
    if (wfQ.state === 'loading') loading.add('workforce');
    if (docQ.state === 'loading') loading.add('docs');
    if (bq.state === 'loading') loading.add('packs');
    if (budgetQ.state === 'loading') loading.add('budget');
    if (depQ.state === 'loading') loading.add('deps');
    const wf = wfQ.state === 'ready' && 'detail' in wfQ.data ? (wfQ.data as { detail: WorkforceDetail }).detail : null;
    return buildModel({
      fin: finQ.data,
      plan: planQ.state === 'ready' ? planQ.data : null,
      cfPlan: cfPlanQ.state === 'ready' ? cfPlanQ.data : null,
      /* ⚠️ 2026-09-30: барилгын давхарга ирээгүй/унасан бол `null` — блок, айлын тоо «—»
         (урьд нь `buildPacks(null)` → «0 айл · 0 блок» гэж ХУДАЛ харагддаг байв) */
      packs: bq.state === 'ready' ? packs : null,
      hist: histQ.state === 'ready' ? histQ.data : null,
      commission: comQ.state === 'ready' ? comQ.data.dates : null,
      commissionPartial: comQ.state === 'ready' ? comQ.data.partial : null,
      workforce: wf,
      docs: docQ.state === 'ready' ? docQ.data : null,
      deps: depQ.state === 'ready' ? depQ.data.deps : null,
      contractedNote: CONTRACTED,
      failed,
      loading,
      /* ⚠️ 2026-10-09: «Гүйцэтгэлийн явц» график унасан муруйг «дата алга» гэж бичихгүй (`TuhModel.planFailed`) */
      planError: planQ.state === 'error',
    });
  }, [finQ, planQ, cfPlanQ, histQ, comQ, wfQ, docQ, bq, packs, budgetQ, depQ]);

  /*
   * «ДАХИН ОРОЛДОХ» — УНАСАН эх сурвалжуудыг л дахин татна (⚠️ 2026-10-01, «хэрэглэгч:
   * бүгдийг зас»). Урьд нь зөвхөн шар мөр гардаг тул бүтэн хуудас refresh хийхээс өөр
   * аргагүй байв (газрын зураг ч дахин ачаалагдана).
   * ⚠️ Хагас уншигдсан (`data.failed`) хуваарь/комиссыг ч дахин татна — хэсэгчилсэн үр дүн
   *    кэшлэгдэхгүй (`cached(…, keep)`; комисст 2026-10-07-нд нэмэв — урьд нь тайлбар
   *    ийм байсан ч `loadCommissionDates` keep-гүй тул дутуу хуулбар 5 мин үлддэг байв).
   */
  const retryFailed = useCallback(() => {
    if (finQ.state === 'error') finQ.retry?.();
    if (planQ.state === 'error' || (planQ.state === 'ready' && planQ.data.failed.length)) planQ.retry?.();
    if (cfPlanQ.state === 'error') cfPlanQ.retry?.();
    if (histQ.state === 'error') histQ.retry?.();
    if (comQ.state === 'error' || (comQ.state === 'ready' && comQ.data.failed.length)) comQ.retry?.();
    if (wfQ.state === 'error') wfQ.retry?.();
    if (docQ.state === 'error') docQ.retry?.();
    if (bq.state === 'error') bq.retry?.();
    if (budgetQ.state === 'error') budgetQ.retry?.();
    if (depQ.state === 'error') depQ.retry?.();
  }, [finQ, planQ, cfPlanQ, histQ, comQ, wfQ, docQ, bq, budgetQ, depQ]);

  const row = model && sel ? model.rows.find((r) => r.p.key === sel) ?? null : null;
  const open = useCallback((k: string) => setSel(k), []);
  const back = useCallback(() => setSel(null), []);

  /* ⚠️ 2026-09-30: ЭНГИЙН утгаар мемолно — `row` нь загвар дахин бүрдэх бүрд (эх сурвалж
     бүр ачаалагдахад) шинэ объект тул газрын зураг сонгосон багц руу дахин нисдэг байв. */
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
          <p className={s.loading}>{tr('Ачаалж байна…')}</p>
        ) : finQ.state === 'error' ? (
          <p className={s.failNote} role="alert">
            {tr('Санхүүгийн өгөгдөл татагдсангүй')}: {friendlyError(finQ.error)}
            {' '}
            {/* ⚠️ 2026-10-01: дахин оролдох (`retryFailed`-ийн ⚠️) */}
            <button type="button" className={s.retryBtn} onClick={retryFailed}>{tr('Дахин оролдох')}</button>
          </p>
        ) : !model ? null : row ? (
          <PkgDetail key={row.p.key} r={row} m={model} onBack={back} onOpen={open} onOpenDeps={onOpenDeps} />
        ) : (
          <Overview m={model} contractTotal={budgetQ.state === 'ready' ? budgetQ.data.contract : null} onOpen={open} onRetry={retryFailed} onOpenDeps={onOpenDeps} />
        )}
      </div>
      <div className={s.side}>
        {/* ⚠️ 2026-10-06 (аудит): `packsState` — блок ирээгүй/унасан үед «давхаргагүй» гэж худал
            бичихгүй, бүх блок руу нисэхгүй (`TuhMap`-ийн ⚠️) */}
        <TuhMap dim={dim} setDim={setDim} sel={mapSel} packs={packs} packsState={bq.state} onPickPkg={onPickPkg} />
      </div>
    </div>
  );
}

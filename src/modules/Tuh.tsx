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
import { loadFillPkgProgress } from '@/lib/live';
import { loadCfPlan, CONTRACTED } from '@/lib/gdash';
import { loadPlanCurveCached } from '@/lib/planProgress';
import { loadBlockHistory } from '@/lib/blockProgress';
import { loadWorkforceKpi, type WorkforceDetail } from '@/lib/ceo/workforce';
import { loadAllDocs } from '@/lib/chanarStore';
import { buildPacks, type Pack } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import { loadFinData } from '@/modules/Finance';
import { friendlyError } from '@/components/ui';
import { loadCommissionDates } from './tuh/tuhSchedule';
import { buildModel } from './tuh/model';
import { Overview } from './tuh/Overview';
import { PkgDetail } from './tuh/PkgDetail';
import { TuhMap, type MapSel } from './tuh/TuhMap';
import s from './tuh.module.css';

export function Tuh({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const { hostRef, ...side } = useSideResize('tuh');
  const contentRef = useRef<HTMLDivElement>(null);

  const bq = useBuildings();
  const finQ = useAsync(loadFinData, []);
  const planQ = useAsync(loadPlanCurveCached, []);
  const cfPlanQ = useAsync(loadCfPlan, []);
  const fillQ = useAsync(loadFillPkgProgress, []);
  const histQ = useAsync(loadBlockHistory, []);
  const comQ = useAsync(loadCommissionDates, []);
  const wfQ = useAsync(loadWorkforceKpi, []);
  const docQ = useAsync(loadAllDocs, []);
  const budgetQ = useAsync(loadBudget, []);

  const [sel, setSel] = useState<string | null>(() => readParam('tuh'));
  useEffect(() => { writeParams({ tuh: sel }); }, [sel]);
  /* Багц солиход агуулга дээрээсээ эхэлнэ */
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [sel]);

  const packs = useMemo<Pack[]>(() => buildPacks(bq.state === 'ready' ? bq.data.rows : null), [bq]);

  const model = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    /* ⚠️ Унасан эх сурвалжийг НЭРЛЭЖ хэлнэ — холбогдох тоо «—» болж, «0» гэж уншигдахгүй */
    const failed: string[] = [];
    if (planQ.state === 'error') failed.push(tr('Хуваарийн төлөвлөгөө'));
    if (cfPlanQ.state === 'error') failed.push(tr('Гэрээний сарын төлөвлөгөө'));
    if (fillQ.state === 'error') failed.push(tr('Биет гүйцэтгэл'));
    if (histQ.state === 'error') failed.push(tr('Гүйцэтгэлийн түүх'));
    if (comQ.state === 'error') failed.push(tr('Улсын комиссын огноо'));
    if (comQ.state === 'ready' && comQ.data.failed.length) failed.push(tr('Улсын комиссын огноо ({0})', comQ.data.failed.join(', ')));
    if (wfQ.state === 'error') failed.push(tr('Хүн хүч (ХАБЭА)'));
    if (docQ.state === 'error') failed.push(tr('MA/MIR баримт'));
    if (bq.state === 'error') failed.push(tr('Барилгын блок'));
    const wf = wfQ.state === 'ready' && 'detail' in wfQ.data ? (wfQ.data as { detail: WorkforceDetail }).detail : null;
    return buildModel({
      fin: finQ.data,
      plan: planQ.state === 'ready' ? planQ.data : null,
      cfPlan: cfPlanQ.state === 'ready' ? cfPlanQ.data : null,
      fill: fillQ.state === 'ready' ? fillQ.data : null,
      packs,
      hist: histQ.state === 'ready' ? histQ.data : null,
      commission: comQ.state === 'ready' ? comQ.data.dates : null,
      workforce: wf,
      docs: docQ.state === 'ready' ? docQ.data : null,
      contractedNote: CONTRACTED,
      failed,
    });
  }, [finQ, planQ, cfPlanQ, fillQ, histQ, comQ, wfQ, docQ, bq, packs]);

  const row = model && sel ? model.rows.find((r) => r.p.key === sel) ?? null : null;
  const open = useCallback((k: string) => setSel(k), []);
  const back = useCallback(() => setSel(null), []);

  const mapSel = useMemo<MapSel>(
    () => (row ? { pkgKey: row.p.pkgKey, housing: row.p.group === 'housing' } : null),
    [row],
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
          <p className={s.failNote}>{tr('Санхүүгийн өгөгдөл татагдсангүй')}: {friendlyError(finQ.error)}</p>
        ) : !model ? null : row ? (
          <PkgDetail key={row.p.key} r={row} m={model} onBack={back} onOpen={open} />
        ) : (
          <Overview m={model} contractTotal={budgetQ.state === 'ready' ? budgetQ.data.contract : null} onOpen={open} />
        )}
      </div>
      <div className={s.side}>
        <TuhMap dim={dim} setDim={setDim} sel={mapSel} packs={packs} onPickPkg={onPickPkg} />
      </div>
    </div>
  );
}

'use client';

import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type Dispatch, type SetStateAction,
} from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Section, Stats, Stat, Data, Empty, Bars, Note, TIP_RULE, friendlyError } from '@/components/ui';
import { CHART, lineSegments, areaPath } from '@/lib/chartStyle';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useAsync, type Async } from '@/lib/useAsync';
import { usePlanTotals, qtyText } from '@/lib/totals';
import { loadLandStatus } from '@/lib/land';
import { loadFillPkgProgress, loadHeadline } from '@/lib/live';
import { loadBagtsRows } from '@/lib/execData';
import { loadNegtgelFull, loadNegtgelPct } from '@/lib/negtgel';
import { loadFinData, typePhysNow, INFRA_TYPE, aggregateMonths } from '@/modules/Finance';
import { loadHoRows } from '@/lib/ipc';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { loadPkgOverlaps } from '@/lib/pkgSaad';
import { FIN_XL_LAND_CODE } from '@/lib/finExcelLayout';
import {
  BLOCK_LAYER,
  PKG_BY_FAMILY, BUILDING, LAYER_BY_ID, PARCEL_LEFT, ZONE_FIELD, ZONE_NONE, type PkgFamily,
  ZONE_FIELDS, ZONE_LAYER, zoneCanon,
  pkgKeyOf,
  HO_IPC, hoAmount,
  cfMonthAxis,
  BUILT_STATUS,
} from '@/lib/services';
import { sqlStr } from '@/lib/query';
import { mapPkgKeySet, mapPkgLayers } from '@/lib/pkgAlias';
import { mnt, num, pct, monthKey } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow, loadReasonOids, loadSubPkgLayers,
  loadCfPlan, cfPlanGaps, cfGapsText, cashflowCurve, housingMoney, pkgCostWeight, loadBuildPkgs,
  chartTypeCost, chartSourceMerged, xMatch,
  type XDim,
  grainOf, kpisOf, progressLabel, inPeriod, yearsOf, periodActive, activeSubPkgTypes, effectivePeriod,
  type Grain,
  NO_PERIOD, isContracted,
  type CfRow, type Period, type SubBar, type SubPkg, type TimePoint,
} from '@/lib/gdash';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { Segmented } from '@/components/Switch';
import g from './generalDash.module.css';
import { pkgWorkAdded, pkgWorkDrop, pkgWorkOn } from '@/modules/generalDashLayers';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ТӨСЛИЙН НЭГ ХУУДАС ДЭЭРХ ТОЙМ.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Жил · Улирал · Сар — БҮХ картад нэгэн зэрэг үйлчилнэ     │
 *   ├────────────┬──────────────────────────┬──────────────────┤
 *   │ САНХҮҮ     │ индикаторын зурвас       │ ХАБ              │
 *   │ 4 чарт     │ ГАЗРЫН ЗУРАГ (2D/3D/BIM) │ ГАЗАР ЧӨЛӨӨЛӨЛТ  │
 *   │            │ S-МУРУЙ                  │ ЕРӨНХИЙ ТӨЛӨВЛ.  │
 *   └────────────┴──────────────────────────┴──────────────────┘
 */
export function GeneralDash({
  dim, setDim, zone, setZone,
}: {
  dim: Dim;
  setDim: (d: Dim) => void;
  zone: string | null;
  setZone: (z: string | null) => void;
}) {
  const [periodUi, setPeriod] = useState<Period>(NO_PERIOD);
  const [layerOpen, setLayerOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  /**
   * ЗУРГИЙН УДИРДЛАГЫГ ХУРААХ — ХОЁР ТУСДАА (2026-09-04, хэрэглэгчийн хүсэлт:
   * «2D 3D товчийг ДЭЭШЭЭ хураа, давхарга ба тунгалагийг ЗҮҮН тийш хугална,
   * сум харагдана — яг header шиг»).
   */
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  /**
   * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ШҮҮЛТ — сонгосон шалтгааны нэгж талбарууд.
   */
  const [parcelWhere, setParcelWhere] = useState<string | null>(null);

  /**
   * ХАЖУУГИЙН ХОЁР БАГАНЫГ ЧИРЖ ӨРГӨСГӨНӨ — «Төслийн дэлгэрэнгүй мэдээлэл»,
   * «Багцын гүйцэтгэл» хоёртой ИЖИЛ механизм (`--side-l` / `--side-r`).
   */
  const { hostRef: sideHostRef, ...side } = useSideResize('gdash');

  /* Газрын зургийн API — дэд багц дарахад тэр давхарга руу ойртуулна */
  const map = useMap();

  /* Суурь давхарга — бүс ба ерөнхий төлөвлөгөөний барилга (дэлгэрэнгүй
     дашбоардтай ижил эхлэл). Каталогоос нэмсэн нь `useLayerPicks`-д үлдэнэ. */
  const base = useMemo(() => ['zone', 'et:24'], []);
  const [visible, setVisible] = useLayerPicks(base);

  const totals = usePlanTotals(null, true, PLAN_CARD_IDS);
  const cf = useAsync(loadGdashCf, []);
  const periodYears = useMemo(() => (cf.state === 'ready' ? yearsOf(cf.data) : []), [cf]);
  const period = useMemo(() => effectivePeriod(periodUi, periodYears), [periodUi, periodYears]);
  /**
   * САРЫН ТӨЛӨВЛӨГӨӨ — S-муруйн нарийвчлал.
   */
  /**
   * ЧАРТЫН ХӨНДЛӨН ШҮҮЛТ — БҮРХҮҮЛИЙН төлөв.
   */
  const [xs, setXs] = useState<{ dim: XDim; key: string } | null>(null);
  /**
   * БАРИЛГА УГСРАЛТЫН ОБЪЁМООР бодогдсон гүйцэтгэл — багц → % (0–100).
   */
  /*
   *    ӨМНӨ: `loadPkgProgress` → `BAGTS_NEGTGEL` = БАТЛАГДСАН илгээлтийн
   *    архив. Хяналтын 4 шат дамжсаны дараа шинэчлэгддэг тул амьд
   *    бөглөлтөөс ХОЦОРДОГ (амьдаар: Багц 2 — архив 27.60, бөглөлт 28.20).
   *
   *    ОДОО: `loadFillPkgProgress` → «Гүйцэтгэл бөглөх» хуудсуудын АМЬД
   *    бөглөлт, «05. Багцын гүйцэтгэл» хуудасны `Pack.progress`-ТАЙ ЯГ
   *    ИЖИЛ томьёогоор (блокуудын энгийн дундаж).
   */
  const fillProg = useAsync(loadFillPkgProgress, []);
  const pkgPct = useMemo(() => {
    const m = new Map<string, number>();
    if (fillProg.state === 'ready') for (const [k, v] of fillProg.data) m.set(k, v);
    return m;
  }, [fillProg]);
  /**
   * ОРОН СУУЦНЫ ХОРООЛЛЫН БИЕТ ГҮЙЦЭТГЭЛ — «Багцын гүйцэтгэл» хуудасны
   * «бодит гүйцэтгэлийн хувь» ЯГ ТЭР тоо (2026-09-10, хэрэглэгчийн заавар).
   */
  const finD = useAsync(loadFinData, []);

  const cfPlan = useAsync(loadCfPlan, []);
  /**
   * САРЫН МӨНГӨН ХУВААРИЛАЛТ — `Cashflow_dun`-ийн нийлбэр сараар.
   */
  /**
   * CASHFLOW-ИЙН S-МУРУЙ — багана нь сарын мөнгө, муруй нь хуримтлагдсан хувь.
   */
  const cfTotal = useMemo(
    () => (cf.state === 'ready' ? cf.data.reduce((a, r) => (r.inTotal ? a + r.cost : a), 0) : 0),
    [cf],
  );
  /**
   * НИЙТ ТӨСӨВТ ОРДОГ ажлуудын сарын мөр л — `cfTotal`-тай НЭГ хүрээ.
   */
  const cfPlanInScope = useMemo(() => {
    const plan = cfPlan.data ?? [];
    if (cf.state !== 'ready') return plan;
    const ids = new Set<number>();
    for (const r of cf.data) if (r.inTotal && r.cfId != null) ids.add(r.cfId);
    return plan.filter((p) => ids.has(p.id));
  }, [cfPlan.data, cf]);
  /**
   * ОЛГОСОН IPC САРААР — `'YYYY-MM'` → ₮ (2026-09-10, хэрэглэгчийн заавар:
   * «IPC олгосон мэдээллүүдийг графикт нэмж өөр өнгөөр харуулах»).
   */
  const hoQ = useAsync(loadHoRows, []);
  const { ipcByMonth, ipcUndated } = useMemo(() => {
    const byMonth = new Map<string, number>();
    let undated = 0;
    if (hoQ.state !== 'ready') return { ipcByMonth: byMonth, ipcUndated: 0 };
    const P = HO_IPC.payFields;
    for (const r of hoQ.data) {
      const amt = hoAmount(r);
      if (amt == null) continue;
      const k = ymOf(r[P.payDate]);
      if (k) byMonth.set(k, (byMonth.get(k) ?? 0) + amt);
      else undated += amt;
    }
    return { ipcByMonth: byMonth, ipcUndated: undated };
  }, [hoQ]);
  /**
   * ОРОН СУУЦНЫ БИЕТ ЯВЦ МӨНГӨН ДҮНГЭЭР — ГУРАВ ДАХЬ ТУСДАА МУРУЙ
   * (2026-09-10-ны ХОЁР ДАХЬ засвар, хэрэглэгчийн сонголт «A»).
   */
  const housingMoneyByMonth = useMemo(() => {
    if (finD.state !== 'ready' || cf.state !== 'ready') return new Map<string, number>();
    /* Багц → ХО дүн (жин). Нэг багцад олон гэрээ байвал НИЙЛБЭР. */
    const w = pkgCostWeight(cf.data.map((r) => ({ pkg: r.pkg2 || r.pkg, cost: r.cost, inTotal: r.inTotal })));
    return housingMoney(finD.data.phys, w, cfMonthAxis());
  }, [finD, cf]);
  /**
   * ОРОН СУУЦНЫ БАРИЛГАЖИЛТЫН ОДООГИЙН ХУВЬ — «05. Багцын гүйцэтгэл»
   * хуудасны «бодит гүйцэтгэлийн хувь» индикатортой ЯГ НЭГ тоо (2026-09-10,
   * хэрэглэгчийн заавар: «энэ 2 нэг мэдээлэл тул source-г 05-ын бодит
   * гүйцэтгэлийн хувиас авахаар холбо»).
   */
  const housingNow = useMemo(() => {
    if (finD.state !== 'ready') return null;
    const now = monthKey();
    let last: number | null = null;
    let at = '';
    for (const m of aggregateMonths(finD.data)) {
      if (m.label > now) continue;
      if (m.phys != null) { last = m.phys; at = m.label; }
    }
    return last == null ? null : { pct: last, at };
  }, [finD]);
  const catPct = useMemo(() => {
    const m = new Map<string, number>();
    if (housingNow != null) m.set('ОРОН СУУЦНЫ ХОРООЛОЛ', housingNow.pct);
    if (finD.state === 'ready' && cf.state === 'ready') {
      const inf = typePhysNow(finD.data, cf.data, INFRA_TYPE);
      if (inf) m.set(INFRA_TYPE, inf.pct);
    }
    return m;
  }, [housingNow, finD, cf]);
  const cfGapsNote = useMemo(() => {
    if (cfPlan.state !== 'ready') return null;
    const gaps = cfPlanGaps(cfPlan.data);
    if (!gaps) return null;
    if (cf.state !== 'ready') return cfGapsText(gaps);
    const byId = new Map<number, CfRow>();
    for (const r of cf.data) if (r.cfId != null && !byId.has(r.cfId)) byId.set(r.cfId, r);
    return cfGapsText(
      gaps,
      (id) => { const r = byId.get(id); return r ? (r.pkg || r.project || null) : null; },
      (id) => byId.get(id)?.inTotal ?? false,
    );
  }, [cfPlan, cf]);
  const cfCurve = useMemo(
    () => cashflowCurve(
      cfPlanInScope, cfTotal, grainOf(period), period, ipcByMonth,
      housingMoneyByMonth, ipcUndated,
    ),
    [cfPlanInScope, cfTotal, period, ipcByMonth, housingMoneyByMonth, ipcUndated],
  );
  const cfFilteredOut = useMemo(
    () => cfCurve.length === 0 && periodActive(period) && cashflowCurve(
      cfPlanInScope, cfTotal, 'year', NO_PERIOD, ipcByMonth,
      housingMoneyByMonth, ipcUndated,
    ).length > 0,
    [cfCurve, cfPlanInScope, cfTotal, period, ipcByMonth, housingMoneyByMonth, ipcUndated],
  );
  /**
   * S-МУРУЙН ХААЛГА — ДӨРВӨН ЭХИЙГ НЭГ `Async` болгоно (2026-09-11).
   */
  const cfGate = useMemo((): Async<true> => {
    const srcs = [cfPlan, cf, hoQ];
    const bad = srcs.find((q) => q.state === 'error');
    if (bad && bad.state === 'error') {
      return { state: 'error', data: null, error: bad.error, retry: bad.retry };
    }
    const wait = srcs.find((q) => q.state === 'loading');
    if (wait) return { state: 'loading', data: null, error: null };
    return { state: 'ready', data: true, error: null };
  }, [cfPlan, cf, hoQ]);
  const [cfMode, setCfMode] = useState<'chart' | 'table'>('chart');

  /**
   * ШҮҮЛТЭД БАГТСАН дэд багц → ажлын төрлүүд.
   */
  const active = useMemo(
    () => (cf.state === 'ready'
      ? activeSubPkgTypes(cf.data.filter((r) => inPeriod(r, period)))
      : null),
    [cf, period],
  );
  /**
   * СОНГОСОН ШАЛТГААН — БҮРХҮҮЛД (2026-09-07).
   */
  const [reason, setReason] = useState<string | null>(null);
  const byReason = useAsync(loadReasonOids, []);
  /** Сонгосон шалтгаанд ногдох нэгж талбарын OID-ууд; `null` = сонгоогүй */
  const reasonOids = useMemo(
    () => (reason != null && byReason.state === 'ready'
      ? byReason.data.get(reason) ?? null
      : null),
    [reason, byReason],
  );

  /**
   * Шалтгаан сонгох — төлөв, газрын зураг, саадын жагсаалт ГУРВУУЛАА дагана.
   */
  /**
   * Шалтгааны өмнөх давхаргын сонголт — цуцлахад БУЦААНА.
   */
  const beforeReason = useRef<string[] | null>(null);
  /** «Тулгамдаж буй асуудал»-аас багц асаахын ӨМНӨХ давхаргын сонголт */
  const beforePkg = useRef<string[] | null>(null);
  /**
   * «Ажлын төрлөөр давхцаж буй»-г дарахаас ӨМНӨХ давхаргын төлөв.
   */
  const beforeType = useRef<string[] | null>(null);

  /**
   * ЧАРТЫН СОНГОЛТ → ГАЗРЫН ЗУРГИЙН ДАВХАРГА (2026-09-15, хэрэглэгчийн
   * заавар: «зүүн панелийн чартууд газрын зурагтай холбогдоно /талбар —
   * багц/»).
   *
   * Чартын нэг баганыг дарахад тэр ангилалд багтах ажлуудын БАГЦЫН нэрийг
   * (`bagts`) цуглуулж, түүнд харгалзах давхаргуудыг зурагт асаана.
   */
  const buildPkgs = useAsync(loadBuildPkgs, []);
  const xsPick = useMemo(() => {
    if (!xs || cf.state !== 'ready') return null;
    const ids = new Set<string>();
    /* Блокийн давхаргад шүүлт болгох `BAGTS` утгууд (орон сууцны багц) */
    const houses = new Set<string>();
    let land = false;
    const byKey = buildPkgs.state === 'ready' ? buildPkgs.data : null;
    for (const r of cf.data) {
      if (!inPeriod(r, period) || !xMatch(r, xs.dim, xs.key)) continue;
      if (r.sec === FIN_XL_LAND_CODE) { land = true; continue; }
      const k = pkgKeyOf(r.pkg2);
      if (!k) continue;
      const layers = mapPkgLayers(k);
      if (layers?.length) { for (const id of layers) ids.add(id); continue; }
      const house = byKey?.get(k);
      if (house) houses.add(house);
    }
    if (houses.size) ids.add(BLOCK_LAYER);
    if (land) ids.add(PARCEL_LAYER);
    if (ids.size === 0) return null;
    return {
      ids: [...ids],
      houseWhere: houses.size
        ? `${BUILDING.fields.bagts} IN (${[...houses].map(sqlStr).join(', ')})`
        : null,
    };
  }, [xs, cf, period, buildPkgs]);

  const beforeXs = useRef<string[] | null>(null);
  const visRef = useRef<string[]>(visible);
  useSyncRef(visRef, visible);
  const reasonRef = useRef(reason);
  useSyncRef(reasonRef, reason);
  useEffect(() => {
    if (xsPick == null) {
      if (beforeXs.current) {
        setVisible(beforeXs.current);
        beforeXs.current = null;
      }
      return;
    }
    if (reasonRef.current != null) return;
    if (beforeXs.current == null) beforeXs.current = visRef.current;
    setVisible(xsPick.ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xsPick]);

  const pickReason = useCallback((k: string) => {
    const next = k === reason ? null : k;
    if (next != null && (byReason.state !== 'ready' || !byReason.data.get(next)?.size)) return;
    setReason(next);

    if (beforeType.current) {
      setVisible(beforeType.current);
      beforeType.current = null;
    }

    /* ЦУЦЛАХ — шүүлт ба давхаргын сонголт хоёуланг нь буцаана */
    if (next == null) {
      setParcelWhere(null);
      if (beforeReason.current) {
        setVisible(beforeReason.current);
        beforeReason.current = null;
      }
      beforePkg.current = null;
      return;
    }

    const oids = byReason.state === 'ready' ? byReason.data.get(next) : null;
    if (!oids || oids.size === 0) { setParcelWhere(null); return; }

    if (beforeReason.current == null) beforeReason.current = beforeXs.current ?? visible;
    beforePkg.current = null;
    beforeXs.current = null;
    setVisible([PARCEL_LAYER]);

    const where = `${PARCEL_LEFT.oid} IN (${[...oids].join(',')})`;
    setParcelWhere(where);
    map.zoomToWhere(PARCEL_LAYER, where);
  }, [byReason, map, reason, setVisible, visible]);

  const knownKeys = useMemo(
    () => (cf.state === 'ready' ? mapPkgKeySet(activeSubPkgTypes(cf.data).keys()) : null),
    [cf],
  );
  const activeKeys = useMemo(
    () => (periodActive(period) && active ? mapPkgKeySet(active.keys()) : null),
    [period, active],
  );

  const contracts = useAsync(loadContractSum, []);

  /**
   * Зураг дээр бүс дарахад ТУХАЙН бүс рүү шүүнэ — дэлгэрэнгүй дашбоардтай
   * ижил зан төлөв. `ZONE_NONE` («мэдээлэл байхгүй») нь бүс БИШ тул
   * сонголт болгохгүй: сонговол бүх карт хоосорч, буцаах товч нь өөрөө
   * харагдахгүй болно.
   */
  const houseWhere = xsPick?.houseWhere ?? null;
  const layerWhere = useMemo(() => ({
    [PARCEL_LAYER]: parcelWhere,
    [BLOCK_LAYER]: houseWhere,
  }), [parcelWhere, houseWhere]);

  const pick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    if (!attrs) return;
    const raw = layerId === ZONE_LAYER.id ? attrs[ZONE_FIELDS.id] : (attrs[ZONE_FIELD] ?? attrs[ZONE_FIELDS.id]);
    const zid = zoneCanon(raw);
    if (zid && zid !== zoneCanon(ZONE_NONE)) setZone(zid);
  }, [setZone]);

  return (
    <div className={g.shell}>
      <div
        ref={sideHostRef}
        className={`${g.body} ${side.hostClass}`}
        style={side.style}
      >
        <SplitGrip {...side.right} />

      <div className={g.main}>
      <div className={g.top}>
        <SplitGrip {...side.left} />

      <aside className={g.left}>
        <Data q={cf} minH={520}>
          {(rows) => <FinCharts rows={rows} period={period} xs={xs} setXs={setXs} pkgPct={pkgPct} catPct={catPct} housingNow={housingNow?.pct ?? null} housingAt={housingNow?.at ?? null} contracts={contracts.state === 'ready' ? contracts.data : null} />}
        </Data>
      </aside>

      <main className={g.center}>
        <PeriodBar
          period={periodUi}
          setPeriod={setPeriod}
          years={periodYears}
        />
        {zone && <p className={g.wait} role="note">{tr('Бүс зөвхөн газрын зургийг шүүнэ — үзүүлэлт, графикууд төслийн нийтээр.')}</p>}
        <Data q={cf} minH={72}>
          {(rows) => (
            <KpiStrip
              rows={rows}
              period={period}
              xs={xs}
              contracts={contracts.state === 'ready' ? contracts.data : null}
              contractsErr={contracts.state === 'error'}
            />
          )}
        </Data>

        <div className={g.hero}>
          <MapCanvas
            dim={dim}
            visible={visible}
            opacity={opacity}
            zone={zone}
            layerWhere={layerWhere}
            uniform
            onPick={pick}
          />

          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => setLayerOpen((v) => !v)}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          />
          {opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}
          {layerOpen && (
            <div className={g.catPanel}>
              <LayerCatalog
                view="plan"
                visible={visible}
                setVisible={setVisible}
                selected={layerSel}
                onSelect={setLayerSel}
                onClose={() => setLayerOpen(false)}
                zone={zone}
                embedded
                extra={(
                  <PkgWorkList
                    rows={cf.state === 'ready' ? cf.data : null}
                    visible={visible}
                    setVisible={setVisible}
                  />
                )}
              />
            </div>
          )}
        </div>

      </main>
      </div>

      <div className={g.curve}>
        {/*
          * CASHFLOW — САРЫН S-МУРУЙ.
          */}
        <Section
          title={tr('Төсөл нийт — гүйцэтгэлийн явц')}
          note={(
            <span className={g.tlTabs}>
              {/*
                * ДОМОГ — ХОЁР МУРУЙ (2026-09-10). Өнгө нь тайлбаргүй бол
                * «аль нь юу вэ» гэдгийг таах аргагүй; хүснэгтийн горимд
                * хэрэггүй тул зөвхөн график дээр гарна.
                */}
              {cfMode === 'chart' && (
                <span className={g.tlKey}>
                  <b style={{ height: 2, background: 'repeating-linear-gradient(to right, var(--chart-plan) 0 4px, transparent 4px 8px)' }} />{tr('Төлөвлөсөн')}
                  <b style={{ background: 'var(--chart-actual)' }} />{tr('Олгосон')}
                </span>
              )}
              <Segmented value={cfMode} onChange={setCfMode} label={tr('Харагдац')}
                options={[{ value: 'chart', label: tr('График') }, { value: 'table', label: tr('Хүснэгт') }]} />
            </span>
          )}
        >
          {/*
            * `cf` ирээгүй байхад `cfTotal` нь 0 бөгөөд `cashflowCurve` нь
            * `total <= 0` үед `[]` буцаадаг (`gdash.ts:945`). Тиймээс `cfPlan`
            * түрүүлж ирэхэд хэрэглэгч «Сарын хуваарилалт бөглөгдөөгүй — Cashflow
            * хувиарлах хэсгээс оруулна уу» гэсэн ЗААВАРТАЙ хоосон дэлгэц хараад
            * байхгүй өгөгдөл бөглөх гэж очдог байв.
            */}
          <Data q={cfGate} minH={190}>
            {() => (cfCurve.length === 0 ? (
              cfFilteredOut
                ? <Empty label={tr('Сонгосон хугацаанд cashflow-ийн мөр алга')} />
                : <Empty
                label={tr('Сарын хуваарилалт бөглөгдөөгүй')}
                hint={tr('«Санхүүжилт → Cashflow хувиарлах» хэсгээс ажил бүрийн сарын хувийг оруулна уу.')}
              />
            ) : (
              <Timeline points={cfCurve} grain={grainOf(period)} total={cfTotal} mode={cfMode} />
            ))}
          </Data>
          {cfGate.state === 'ready' && cfGapsNote && <div role="status"><Note>{cfGapsNote}</Note></div>}
        </Section>
      </div>
      </div>

      <aside className={g.right}>
        <HseCard />
        <LandCard
          active={active}
          reason={reason}
          byReason={byReason}
          onPickReason={pickReason}
          onShowLayers={(ids) => {
            if (!ids) {
              if (beforeType.current) setVisible(beforeType.current);
              beforeType.current = null;
              return;
            }
            const base = beforeType.current ?? visible;
            beforeType.current = base;
            setVisible([...new Set([...base, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
        />
        <SaadCard
          keys={activeKeys}
          known={knownKeys}
          oids={reasonOids}
          onShowLayers={(ids) => {
            if (!ids) {
              if (beforePkg.current) setVisible(beforePkg.current);
              beforePkg.current = null;
              return;
            }
            const base = beforePkg.current ?? visible;
            beforePkg.current = base;
            setVisible([...new Set([...base, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
        />
        <PlanCard totals={totals} />
      </aside>
      </div>
    </div>
  );
}

/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

/** Шүүлтийн гурван хэмжээс — `Period`-ийн талбарын нэр */
type Dim3 = 'years' | 'quarters' | 'months';

const QUARTERS = [1, 2, 3, 4];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * ХУГАЦААНЫ ШҮҮЛТ — ArcGIS-ийн атрибут хүснэгтийн шүүлттэй ИЖИЛ хэлбэр
 * (2026-09-04, хэрэглэгчийн хүсэлт).
 */
function PeriodBar({
  period, setPeriod, years,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  years: number[];
}) {
  const toggle = (k: Dim3, v: number) => {
    const cur = period[k];
    setPeriod({
      ...period,
      [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((x, y) => x - y),
    });
  };

  const CFG: Record<Dim3, { label: string; opts: number[]; text: (v: number) => string; full: (v: number) => string }> = {
    years: {
      label: tr('Жил'), opts: years, text: (v) => String(v), full: (v) => String(v),
    },
    quarters: {
      label: tr('Улирал'),
      opts: QUARTERS,
      text: (v) => String(v),
      full: (v) => tr('{0}-р улирал', String(v)),
    },
    months: {
      label: tr('Сар'),
      opts: MONTHS,
      text: (v) => String(v),
      full: (v) => tr('{0}-р сар', String(v)),
    },
  };

  /**
   * БҮЛЭГ — нэр, «Бүгд», дараа нь утга бүр өөрийн ШАХМАЛААР.
   */
  const grp = (k: Dim3) => {
    const c = CFG[k];
    const sel = period[k];
    const allPicked = c.opts.length > 0 && sel.length === c.opts.length;
    const allOn = sel.length === 0 || allPicked;
    return (
      <span key={k} className={g.fGrp}>
        <span className={g.fGrpLbl}>{c.label}</span>
        <button
          type="button"
          aria-pressed={allOn}
          className={`${g.fPill} ${allOn ? g.fPillOn : ''}`}
          onClick={() => setPeriod({ ...period, [k]: allPicked ? [] : [...c.opts] })}
        >
          {tr('Бүгд')}
        </button>
        {c.opts.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={sel.includes(v)}
            title={c.full(v)}
            aria-label={c.full(v)}
            className={`${g.fPill} ${sel.includes(v) ? g.fPillOn : ''}`}
            onClick={() => toggle(k, v)}
          >
            {c.text(v)}
          </button>
        ))}
      </span>
    );
  };

  return (
    <div className={g.filters}>
      {grp('years')}
      {grp('quarters')}
      {grp('months')}
      {periodActive(period) && (
        <button
          type="button"
          className={g.fClear}
          title={tr('Шүүлт цуцлах')}
          aria-label={tr('Шүүлт цуцлах')}
          onClick={() => setPeriod(NO_PERIOD)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

function FailMark({ error, retry }: { error?: unknown; retry?: () => void }) {
  const why = error == null ? tr('Өгөгдөл татагдсангүй') : friendlyError(error);
  const style = { color: 'var(--bad-ink)', font: 'inherit', background: 'none', border: 0, padding: 0 } as const;
  return retry ? (
    <button
      type="button"
      onClick={retry}
      title={`${why} · ${tr('Дахин оролдох')}`}
      aria-label={`${why} · ${tr('Дахин оролдох')}`}
      style={{ ...style, cursor: 'pointer' }}
    >
      ⚠
    </button>
  ) : (
    <span role="img" title={why} aria-label={why} style={style}>⚠</span>
  );
}

function KpiStrip({
  rows, period, contracts, contractsErr, xs,
}: {
  rows: CfRow[];
  period: Period;
  contracts: Map<number, number> | null;
  contractsErr: boolean;
  /** Чартын хөндлөн сонголт — `null` бол шүүлтгүй */
  xs: { dim: XDim; key: string } | null;
}) {
  const land = useAsync(loadLandStatus, []);
  const landPct = land.state === 'ready' ? land.data.pct : null;
  const wbsQ = useAsync(loadNegtgelPct, []);
  const wbsPct = wbsQ.state === 'ready' ? wbsQ.data : null;

  const k = useMemo(() => {
    const sel = rows.filter((r) => inPeriod(r, period) && (xs == null || xMatch(r, xs.dim, xs.key)));
    /*
     * НИЙТ ГЭРЭЭЛСЭН ДҮН — ЗӨВХӨН ГЭРЭЭЛЭГДСЭН мөрүүд (2026-09-08,
     * хэрэглэгчийн заавар: «буруу талбараас утга авсан байна»).
     */
    const csum = contracts
      ? sel.reduce((s, r) => (r.inTotal && isContracted(r) ? s + (contracts.get(r.oid) ?? 0) : s), 0)
      : 0;
    const whole = !periodActive(period) && xs == null;
    const outOfTotal = sel.length > 0 && sel.every((r) => !r.inTotal);
    return { ...kpisOf(sel, csum, landPct, whole ? wbsPct : null), whole, outOfTotal };
  }, [rows, period, contracts, landPct, xs, wbsPct]);
  /** Шүүлтгүй ба нэгтгэл хараахан ирээгүй — «…» */
  const progWait = k.whole && wbsQ.state === 'loading';

  return (
    <div className={g.kpis}>
      <Stats cols={3}>
        <Stat icon="calc" value={k.outOfTotal ? tr('Нийт төсөвт ордоггүй') : kpiMnt(k.budget)} label={tr('Нийт төсөв')} />
        <Stat icon="file" value={contracts ? (k.outOfTotal ? tr('Нийт төсөвт ордоггүй') : kpiMnt(k.contract)) : contractsErr ? <FailMark /> : '…'} label={tr('Нийт гэрээлсэн дүн')} />
        {/*
          * Тэр тоо нь `төсөв × гүйцэтгэлийн хувь` гэсэн ДЕРИВАТИВ байсан —
          * бодитоор олгосон мөнгө БИШ. Гүйцэтгэлийн ТӨЛБӨРИЙН АКТ (IPC) нь
          * жинхэнэ олголтыг мэддэг бөгөөд бэлэн болмогц ЭНД холбогдоно.
          */}
        <Stat
          icon="chart"
          value={progWait ? '…' : k.progress == null ? '—' : pct(k.progress)}
          label={progWait ? tr('Гүйцэтгэлийн хувь') : progressLabel(k.progressSrc)}
        />
        <Stat icon="layers" value={num(k.packages)} label={tr('Багц ажил (гэрээний мөр)')} />
        <Stat icon="grid" value={num(k.types)} label={tr('Нийт төрлийн тоо')} />
        <Stat
          icon="polygon"
          value={land.state === 'loading' ? '…'
            : land.state === 'error' ? <FailMark error={land.error} retry={land.retry} />
              : landPct == null ? '—' : pct(landPct)}
          label={tr('Газар чөлөөлөлт')}
        />
      </Stats>
    </div>
  );
}

/* ══════════════════════ ЗҮҮН — САНХҮҮГИЙН 4 ЧАРТ ══════════════════════ */

/**
 * ЧАРТЫН МӨР → `ui.tsx`-ийн `Bars`-ын мөр.
 */
/**
 * ЧАРТЫН МӨР → `ui.tsx`-ийн `Bars`.
 *
 * ═══ НЭГ ДҮРЭМ, ЗУРГААН ЧАРТАД (2026-09-04, хэрэглэгчийн шийдвэр) ═══
 *
 *   МӨРӨН ДЭЭР — гүйлгэж уншихад хэрэгтэй ХАМГИЙН БАГА зүйл.
 *   HOVER ДЭЭР — тухайн мөрийг судлахад хэрэгтэй БҮТЭН задаргаа, цэгтэй
 *                мөрүүдээр.
 */

/**
 * ЧАРТЫН ДОТОРХ ШОШГЫГ ЭНГИЙН ҮСЭГТ буулгана (2026-09-04, хэрэглэгчийн
 * хүсэлт: «чарт дотор байгаа uppercase болиул, чартын нэр uppercase»).
 */
const KEEP_UPPER = new Set(['ТЭЗҮ', 'ХАБ', 'ХАБЭА', 'НЗД', 'БОНУ', 'ХХК', 'IoT', 'QAQC', 'BIM']);

const nice = (v: string): string => {
  if (v !== v.toUpperCase()) return v;
  const out = v
    .split(' ')
    .map((w) => (KEEP_UPPER.has(w.replace(/[^A-Za-zЀ-ӿ]/g, '')) ? w : w.toLowerCase()))
    .join(' ');
  /* Эхний ҮСГИЙГ том болгоно (эхний үг товчлол бол аль хэдийн том) */
  const i = out.search(/[A-Za-zЀ-ӿ]/);
  return i < 0 ? out : out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
};

/**
 * Мөнгө — мөрөн дээр ТОЙМЛОСОН («29.0 тэрбум ₮»), бүтэн нь hover-т.
 */
const byBar = <T extends { value: number | null }>(a: T[]): T[] =>
  a.slice().sort((x, y) => (y.value ?? -1) - (x.value ?? -1));

const mntShort = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return tr('{0} их наяд ₮', num(v / 1e12, 2));
  if (a >= 1e9) return tr('{0} тэрбум ₮', num(v / 1e9, 1));
  if (a >= 1e6) return tr('{0} сая ₮', num(v / 1e6, 1));
  return mnt(v);
};

/** KPI зурвасын дүн — жинхэнэ 0-ийг «0 ₮» (`mntShort`-ийн «—» нь чартын мөрүүдэд хэвээр) */
const kpiMnt = (v: number): string => (v === 0 ? '0 ₮' : mntShort(v));

/** МӨНГӨН чарт — мөрөнд «хувь · тоймлосон дүн», hover-т бүтэн задаргаа */
const moneyBars = (
  items: SubBar[],
  subLabel?: { has: string; none: string },
  /**
   * ЭЗЛЭХ ХУВИЙН СУУРИЙН НЭР.
   */
  base: string = tr('Нийт төсвийн'),
  /**
   * АЖЛЫН НИЙТ ТООГ hover-т бичих эсэх.
   */
  showCount = true,
) => {
  const shown = items.filter((i) => i.value > 0);
  const all = shown.reduce((x, y) => x + y.value, 0);
  const total = shown.reduce((x, y) => (y.inTotal === false ? x : x + y.value), 0);
  return byBar(shown.map((i) => {
    const out = i.inTotal === false;
    const share = out ? null : (total > 0 ? pct((i.value / total) * 100, 1) : null);
    const hint = out
      ? [
        tr('Нийт төсөвт ордоггүй'),
        tr('{0} {1}-ийг эзэлж байна', tr('Бүх ажлын нийлбэрийн'),
          all > 0 ? pct((i.value / all) * 100, 1) : '—'),
      ]
      : [tr('{0} {1}-ийг эзэлж байна', base, share ?? '—')];
    if (subLabel) {
      hint.push(i.sub > 0
        ? `${subLabel.has}: ${mntShort(i.sub)} (${i.value > 0 ? pct((i.sub / i.value) * 100, 0) : '—'})`
        : subLabel.none);
    }
    /*
     * ОЛГОСОН ДҮН — захирамжаар (2026-09-06, хэрэглэгчийн хүсэлт).
     */
    /*
     * АЖЛЫН ТОО — нэгтгэсэн чартын хоёр дахь хэмжигдэхүүн (2026-09-06).
     */
    if (i.count != null) {
      const lines: string[] = [];
      if (showCount) lines.push(tr('{0} ажил', num(i.count)));
      if (i.countSub != null) {
        if (i.countSub > 0) {
          lines.push(`${tr('Гэрээ хийсэн')}: ${num(i.countSub)} (${i.count > 0 ? pct((i.countSub / i.count) * 100, 0) : '—'})`);
        } else if (!subLabel) {
          lines.push(tr('Нэг ч гэрээ хийгдээгүй'));
        }
      }
      if (lines.length > 0) hint.push(TIP_RULE, ...lines);
    }
    /*
     * ГҮЙЦЭТГЭЛИЙН ХОЁР ХЭМЖҮҮР — «Гэрээлсэн байдал, бодит гүйцэтгэл»
     * чартаас НЭГТГЭГДСЭН (2026-09-10, хэрэглэгчийн заавар).
     */
    if (i.perf !== undefined) {
      hint.push(TIP_RULE);
      hint.push(i.perf == null
        ? tr('Гүйцэтгэл хэмжигдээгүй')
        : `${tr('Бодит гүйцэтгэл')}: ${pct(i.perf, 1)}`);
      if (i.fin != null && (i.perf == null || Math.abs(i.fin - i.perf) > 0.05)) {
        hint.push(`${tr('Төлөвлөгөөний биелэлт')}: ${pct(i.fin, 1)}`);
      }
    }
    return {
      key: i.key,
      label: nice(i.label),
      value: subLabel
        ? (i.value > 0 ? Math.min(100, (i.sub / i.value) * 100) : null)
        : i.value,
      mark: subLabel ? i.fin : null,
      markColor: 'var(--warn)',
      /* Мөр: хувь эхэнд (харьцаа), тоймлосон дүн ард */
      display: share ? `${share} · ${mntShort(i.value)}` : mntShort(i.value),
      /* Hover: БҮТЭН төгрөг — `format.mnt` нь портал даяар бүтэн бичдэг */
      tipValue: mnt(i.value),
      hint,
    };
  }));
};

/**
 * ТООН чарт — мөрөнд зөвхөн тоо, hover-т нэгж, эзлэх хувь, дэд задаргаа.
 */
const countBars = (
  items: SubBar[],
  unit: { one: string; many: string },
  subLabel?: { has: string; none: string },
) => {
  const total = items.reduce((x, y) => x + y.value, 0);
  return byBar(items.map((i) => {
    const hint = [tr(
      'Нийт {0} {1}-ийг эзэлж байна', unit.many, total > 0 ? pct((i.value / total) * 100, 1) : '—',
    )];
    if (subLabel) {
      hint.push(i.sub > 0
        ? `${subLabel.has}: ${num(i.sub)} (${i.value > 0 ? pct((i.sub / i.value) * 100, 0) : '—'})`
        : subLabel.none);
    }
    /*
     * БОДИТ ГҮЙЦЭТГЭЛ — cashflow-гийн `Guitsetgel_huwi`, өртгөөр жигнэсэн.
     */
    if (i.perf !== undefined) {
      hint.push(TIP_RULE);
      hint.push(i.perf == null
        ? tr('Гүйцэтгэл хэмжигдээгүй')
        : `${tr('Бодит гүйцэтгэл')}: ${pct(i.perf, 1)}`);
      /*
       * ТӨЛӨВЛӨГӨӨНИЙ БИЕЛЭЛТ — гэрээний амьд явцын (`gdash.CfRow.progress`, 2026-10-27; урьд `guitsetgel_huvi`) жигнэсэн дундаж.
       */
      if (i.fin != null && (i.perf == null || Math.abs(i.fin - i.perf) > 0.05)) {
        hint.push(`${tr('Төлөвлөгөөний биелэлт')}: ${pct(i.fin, 1)}`);
      }
    }
    return {
      key: i.key,
      label: nice(i.label),
      value: subLabel ? (i.value > 0 ? (i.sub / i.value) * 100 : null) : i.value,
      mark: subLabel ? i.fin : null,
      markColor: 'var(--warn)',
      display: num(i.value),
      tipValue: `${num(i.value)} ${unit.one}`,
      hint,
    };
  }));
};

/**
 * БҮХ ЧАРТ НЭГ ӨНГӨТЭЙ.
 */
const BAR_HUE = 'var(--data)';

/**
 * «ТӨСЛИЙН ГҮЙЦЭТГЭЛ» ЧАРТЫН МӨРҮҮД — ЯГ ЭДГЭЭР зургаан үзүүлэлт.
 */
const WBS_CHART: { label: string; wbs?: string[]; lvl3?: string; housing?: true }[] = [
  { get label() { return tr('ТЭЗҮ, зураг төсөл'); }, wbs: ['1', '2'] },
  { get label() { return tr('Сонгон шалгаруулалт'); }, wbs: ['4'] },
  { get label() { return tr('Газар чөлөөлөлт'); }, wbs: ['3'] },
  { get label() { return tr('Гадна инженерийн шугам сүлжээ'); }, wbs: ['5.2.3'] },
  { get label() { return tr('Гадна цахилгаан хангамж'); }, lvl3: 'Гадна цахилгаан холбоо, дохиолол' },
  { get label() { return tr('Орон сууцны барилга угсралт'); }, housing: true },
];

function FinCharts({
  rows, period, xs, setXs, pkgPct, catPct, housingNow, housingAt, contracts,
}: {
  rows: CfRow[];
  contracts: Map<number, number> | null;
  period: Period;
  /** Багц → объёмоор бодогдсон гүйцэтгэл (`chartTypeCost`-ийн тайлбар) */
  pkgPct: Map<string, number>;
  /** Ангилал → ил дарах гүйцэтгэл (жиш. орон сууц — «Багцын гүйцэтгэл»-ээс) */
  catPct: Map<string, number>;
  /** «05. Багцын гүйцэтгэл»-ийн одоогийн жигнэсэн хувь — `WBS_CHART.housing` */
  housingNow: number | null;
  housingAt: string | null;
  xs: { dim: XDim; key: string } | null;
  setXs: (v: { dim: XDim; key: string } | null
    | ((p: { dim: XDim; key: string } | null) => { dim: XDim; key: string } | null)) => void;
}) {
  const sel = useMemo(() => rows.filter((r) => inPeriod(r, period)), [rows, period]);

  /**
   * ХӨНДЛӨН ШҮҮЛТ — нэг чартын багана дарахад БУСАД чарт нарийсна.
   */
  const narrow = useMemo(
    () => (xs ? sel.filter((r) => xMatch(r, xs.dim, xs.key)) : sel),
    [sel, xs],
  );
  const rType = xs && xs.dim !== 'type' ? narrow : sel;
  const rSrc = xs && xs.dim !== 'source' ? narrow : sel;
  /** Мөр дарах — дахин дарвал тайлагдана */
  const pickX = (dim: XDim) => (k: string) => setXs(
    (v) => (v && v.dim === dim && v.key === k ? null : { dim, key: k }),
  );
  const onX = (dim: XDim) => (xs && xs.dim === dim ? xs.key : null);

  /**
   * ТӨСЛИЙН ГҮЙЦЭТГЭЛ — «Нэгтгэл гүйцэтгэл» табтай НЭГ эх сурвалж.
   */

  const wbs = useAsync(loadNegtgelFull, []);
  const wbsBars = useMemo(() => {
    if (wbs.state !== 'ready') return [];
    const byCode = new Map<string, (typeof wbs.data.rows)[number]>();
    for (const r of wbs.data.rows) if (!byCode.has(r.code.trim())) byCode.set(r.code.trim(), r);
    /** Гэрээний 3-р түвшний бүлгийн өртгөөр жигнэсэн гүйцэтгэл */
    const lvl3Pct = (name: string): number | null => {
      let base = 0;
      let top = 0;
      for (const r of rows) {
        if (r.lvl3 !== name || r.cost <= 0 || r.progress == null) continue;
        base += r.cost;
        top += (r.cost * r.progress) / 100;
      }
      return base > 0 ? (top / base) * 100 : null;
    };
    return WBS_CHART
      .map((spec) => {
        if (spec.housing) {
          return { spec, base: null as number | null, pctVal: housingNow };
        }
        if (spec.lvl3) {
          return { spec, base: null as number | null, pctVal: lvl3Pct(spec.lvl3) };
        }
        let base = 0;
        let top = 0;
        for (const c2 of spec.wbs ?? []) {
          const r = byCode.get(c2);
          const k = r ? wbs.data.calc.get(r.oid) : null;
          if (!k || k.actPct == null || k.inProject == null) continue;
          base += k.inProject;
          top += k.inProject * k.actPct;
        }
        return { spec, base, pctVal: base > 0 ? top / base : null };
      })
      .filter((x) => x.pctVal != null)
      .map((x) => ({
        key: x.spec.lvl3 ?? (x.spec.housing ? 'housing' : (x.spec.wbs ?? []).join('+')),
        label: x.spec.label,
        value: x.pctVal as number,
        display: pct(x.pctVal as number, 1),
        tipValue: pct(x.pctVal as number, 1),
        hint: [
          x.spec.housing
            ? `${tr('Эх сурвалж')}: ${tr('Багцын гүйцэтгэл')} · ${tr('бодит гүйцэтгэлийн хувь')}`
            : x.spec.lvl3
            ? `${tr('Эх сурвалж')}: ${tr('гэрээний гүйцэтгэл')} · ${x.spec.lvl3}`
            : `${tr('Задаргаа')}: ${(x.spec.wbs ?? []).join(' · ')}`,
          ...(x.base != null ? [`${tr('Төсөлд эзлэх')}: ${pct(x.base, 2)}`] : []),
        ],
      }));
  }, [wbs, rows, housingNow]);

  const c1 = useMemo(() => chartTypeCost(rType, pkgPct, catPct, contracts), [rType, pkgPct, catPct, contracts]);
  const c3 = useMemo(() => chartSourceMerged(rSrc), [rSrc]);

  return (
    <>
      <Section title={tr('Төсөв, гэрээлсэн дүн')}>
        <Bars
          color={BAR_HUE}
          max={100}
          items={moneyBars(
            c1,
            { has: tr('Гэрээлсэн дүн'), none: tr('Нэг ч гэрээ хийгдээгүй') },
            undefined,
            false,
          )}
          limit={8}
          selected={onX('type')}
          onSelect={pickX('type')}
        />
      </Section>

      {/*
        * ТӨСЛИЙН ГҮЙЦЭТГЭЛ — «Гэрээлсэн байдал, бодит гүйцэтгэл»-ийн ОРОНД
        * (2026-09-10, хэрэглэгчийн заавар). Тэр чартын агуулга нь
        * «Төсөв, гэрээлсэн дүн»-ий hover панель руу нэгдсэн.
        */}
      <Section
        title={tr('Төслийн гүйцэтгэл')}
        note={housingAt ? tr('сүүлийн хэмжилт: {0}', housingAt) : undefined}
      >
        <Data q={wbs} minH={150}>
          {() => (wbsBars.length === 0
            ? <Empty label={tr('Гүйцэтгэл хэмжигдээгүй')} />
            : (
              <Bars
                color={BAR_HUE}
                max={100}
                items={wbsBars}
              />
            ))}
        </Data>
      </Section>

      <Section title={tr('Захирамжийн эх үүсвэр')}>
        <Bars
          color={BAR_HUE}
          items={moneyBars(c3, undefined, tr('Захирамжийн нийт дүнгийн'))}
          limit={8}
          selected={onX('source')}
          onSelect={pickX('source')}
        />
      </Section>

    </>
  );
}

/* ══════════════════════ S-МУРУЙ + ОЛГОСОН ДҮН ══════════════════════ */

/**
 * НЭГ ТЭНХЛЭГ, ХОЁР ХЭМЖИГДЭХҮҮН — багана нь МӨНГӨ, муруй нь ХУВЬ.
 */
/**
 * ХУГАЦААНЫ ЧАРТ — багана нь МӨНГӨ, муруй нь ХУРИМТЛАГДСАН ХУВЬ.
 */
/**
 * HO-гийн огноо → 'YYYY-MM'. `guilgee_ognoo` нь DateOnly МӨР («2026-03-05»),
 * гэвч epoch тоо ирвэл ч барина (`Finance.ym`-ийн хураангуй хуулбар —
 * тэр нь экспортлогдоогүй, энд зөвхөн IPC-ийн сарын түлхүүрт хэрэгтэй).
 */
function ymOf(v: unknown): string | null {
  if (v == null || v === '' || v === 0) return null;
  if (typeof v === 'number' && v > 1e12) return monthKey(v);
  const m = String(v).trim().match(/^(\d{4})-(\d{1,2})(?:\D|$)/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}`;
}

function Timeline({
  points, grain, total, mode,
}: {
  points: TimePoint[];
  /** Тэнхлэгийн шошгын хэлбэрийг ЭНЭ шийднэ (жил · улирал · сар) */
  grain: Grain;
  /**
   * ХУВИЙН МӨНГӨН СУУРЬ — hover-т «64.3% ≈ энэ хэдэн төгрөг» гэж бичихэд.
   */
  total: number;
  /** `table` бол ижил өгөгдлийг ХҮСНЭГТЭЭР — чартын ард байгаа тоо */
  mode: 'chart' | 'table';
}) {
  const all = points;
  /**
   * ЗААСАН үе — hover, эсвэл заагаагүй үед СҮҮЛИЙНХ.
   */
  const [hov, setHov] = useState<number | null>(null);
  /**
   * ЗУМЫН ЦОНХ — [эхлэл, төгсгөл] индекс, эсвэл `null` = бүтэн.
   */
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  /**
   * ХҮСНЭГТИЙН ЭРЭМБЭ — ArcGIS-ийн атрибут хүснэгттэй ижил зан.
   */
  const [sort, setSort] = useState<{
    c: 'label' | 'sub' | 'pct' | 'ipc'; d: 1 | -1;
  }>({ c: 'label', d: 1 });
  const barRef = useRef<HTMLDivElement | null>(null);
  const gid = useId().replace(/:/g, '');
  /** Явагдаж буй чирэлтийн `window` сонсогчийг цэвэрлэгч — unmount-д дуудна (2026-10-09) */
  const dragOff = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragOff.current?.(); }, []);

  const N = all.length;
  const zoomOf = `${grain}:${N}`;
  const [prevZoomOf, setPrevZoomOf] = useState(zoomOf);
  if (prevZoomOf !== zoomOf) {
    setPrevZoomOf(zoomOf);
    setZoom(null);
  }
  const lo = zoom ? Math.max(0, Math.min(zoom[0], N - 1)) : 0;
  const hi = zoom ? Math.max(lo, Math.min(zoom[1], N - 1)) : N - 1;
  const pts = zoom ? all.slice(lo, hi + 1) : all;
  /**
   * ХУРИМТЛАГДСАН ХУВИЙН МӨНГӨН ЭКВИВАЛЕНТ (2026-09-08, хэрэглэгчийн хүсэлт:
   * «64.3% хүрэхэд хэдэн төгрөг зарцуулсан бэ»).
   */
  const budget = total;
  const cumOf = (p: number) => (budget * Math.max(0, Math.min(100, p))) / 100;

  /**
   * Чирэлт — «шинээр сонгох», «зөөх», «ирмэгээс сунгах» гурвыг НЭГ логикоор.
   */
  const drag = (mode: 'new' | 'move' | 'lo' | 'hi') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const track = barRef.current;
    /** Заагуурын x → цэгийн индекс */
    const idxAt = (clientX: number): number => {
      if (!track || N < 2) return 0;
      const r = track.getBoundingClientRect();
      const t = (clientX - r.left) / Math.max(1, r.width);
      return Math.max(0, Math.min(N - 1, Math.round(t * (N - 1))));
    };
    const start = idxAt(e.clientX);
    const a0 = lo;
    const b0 = hi;

    const move = (ev: PointerEvent) => {
      const i = idxAt(ev.clientX);
      if (mode === 'new') setZoom([Math.min(start, i), Math.max(start, i)]);
      else if (mode === 'lo') setZoom([Math.min(i, b0), b0]);
      else if (mode === 'hi') setZoom([a0, Math.max(i, a0)]);
      else {
        /* Зөөх — өргөнөө ХАДГАЛНА, хоёр ирмэгт хүрч зогсоно */
        const w = b0 - a0;
        const d = i - start;
        const s = Math.max(0, Math.min(N - 1 - w, a0 + d));
        setZoom([s, s + w]);
      }
    };
    const off = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    const up = () => {
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      off();
    };
    // eslint-disable-next-line react-hooks/refs
    const prevOff = dragOff.current;
    if (prevOff) prevOff();
    dragOff.current = off;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  if (!all.length) return <Empty label={tr('Төлөвлөгөөт хугацаатай ажил олдсонгүй')} />;

  /*
   * ХҮСНЭГТ — ЧАРТЫН ЯГ ТЭР ӨГӨГДӨЛ.
   */
  if (mode === 'table') {
    /**
     * ОН ба ДЭД ҮЕ — ТУСДАА БАГАНА (2026-09-07, хэрэглэгчийн хүсэлт).
     */
    const subCol = grain === 'month' ? tr('Сар') : grain === 'quarter' ? tr('Улирал') : null;
    const subOf = (p: { key: string; label: string }) => (
      grain === 'month' ? p.key.slice(5)
        : grain === 'quarter' ? (p.label.split(' ')[1] ?? '')
          : ''
    );
    const numCmp = (x: number | null, y: number | null) => (
      x == null ? (y == null ? 0 : 1) : y == null ? -1 : (x - y) * sort.d
    );
    const sorted = [...all].sort((a, b) => (
      sort.c === 'label' ? a.key.localeCompare(b.key) * sort.d
        : sort.c === 'sub' ? subOf(a).localeCompare(subOf(b)) * sort.d
          : sort.c === 'ipc' ? numCmp(a.ipcPct, b.ipcPct)
              : numCmp(a.pct, b.pct)
    ));
    const head = (
      c: 'label' | 'sub' | 'pct' | 'ipc',
      label: string,
      right = false,
    ) => (
      <th className={right ? g.tlThNum : undefined} aria-sort={
        sort.c !== c ? 'none' : sort.d === 1 ? 'ascending' : 'descending'
      }>
        <button
          type="button"
          className={g.tlSort}
          onClick={() => setSort((v) => (v.c === c ? { c, d: v.d === 1 ? -1 : 1 } : { c, d: 1 }))}
        >
          {label}
          <i aria-hidden>{sort.c !== c ? '' : sort.d === 1 ? '▲' : '▼'}</i>
        </button>
      </th>
    );
    return (
      <div className={g.tlTblWrap}>
        <table className={g.tlTbl}>
          <thead>
            <tr>
              {head('label', tr('Он'))}
              {subCol && head('sub', subCol)}
              {head('pct', tr('Нийт хөрөнгөд эзлэх хувь'), true)}
              {head('ipc', tr('Олгосон IPC, %'), true)}
              <th className={g.tlThNum}>{tr('Олгосон IPC, ₮')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.key}>
                <td>{p.key.slice(0, 4)}</td>
                {subCol && <td>{subOf(p)}</td>}
                <td className={g.tlNum}>{p.pct == null ? '' : pct(p.pct)}</td>
                <td className={g.tlNum}>{p.ipcPct == null ? '' : pct(p.ipcPct)}</td>
                <td className={g.tlNum}>{p.ipcMoney == null ? '' : mnt(p.ipcMoney)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }


  const n = pts.length;
  const at = hov != null && hov < n ? hov : n - 1;
  const cur = pts[at];
  /**
   * НАЛУУ ТЭНХЛЭГ — 12-оос олон үе харагдаж байвал.
   */
  /**
   * ТЭНХЛЭГИЙН ШОШГО — ЗӨВХӨН ДОТООД хэсэг («06», «II»), он нь ДООРХ зурваст.
   */
  const shortLbl = (p: { key: string; label: string }): string => (
    grain === 'year' ? p.label
      : grain === 'quarter' ? (p.label.split(' ')[1] ?? p.label)
        : p.key.slice(5)
  );
  const ticks = pts.map((p) => shortLbl(p));
  const tilt = n > 8
    && ticks.filter(Boolean).length > 8
    && (ticks.some((t) => t.length >= 4) || n > 24);
  /**
   * ОНЫ БҮЛГҮҮД — зэргэлдээ нүднүүдийг он тус бүрээр нэгтгэнэ.
   */
  const yrs: { y: string; c: number }[] = [];
  for (const p of pts) {
    const y = p.key.slice(0, 4);
    const last = yrs[yrs.length - 1];
    if (last && last.y === y) last.c += 1;
    else yrs.push({ y, c: 1 });
  }
  /**
   * ХУВИЙН ШОШГО — ЦЭГ БҮРД (2026-09-07, хэрэглэгчийн хүсэлт «бүх шошгыг
   * харуул»).
   */
  const twoRow = n > 10;

  const xOf = (i: number) => ((i + 0.5) / n) * 100;
  /**
   * ОЛГОСОН IPC-ИЙН МУРУЙ — төлөвлөгөөнийхтэй ИЖИЛ smooth (2026-09-10,
   * хэрэглэгч: «IPC хэсэг графикт орохдоо адилхан smooth line байна»).
   */
  const curveOf = (pick: (p: typeof pts[number]) => number | null): string => {
    const vals = pts.map(pick);
    if (vals.filter((v) => v != null && Number.isFinite(v)).length < 2) return '';
    return lineSegments(vals.map((v, i) => (v == null || !Number.isFinite(v)
      ? null
      : { x: xOf(i), y: 100 - Math.max(0, Math.min(100, v)) })))
      .map((s) => s.d)
      .join(' ');
  };
  /**
   * ТӨЛӨВЛӨСӨН МУРУЙ — одоо ЭНЭ Ч `curveOf`-оор (2026-09-11).
   */
  const path = curveOf((p) => p.pct);
  const ipcPath = curveOf((p) => p.ipcPct);
  const ipcArea = (() => {
    const vals = pts.map((p) => p.ipcPct);
    if (vals.filter((v) => v != null && Number.isFinite(v)).length < 2) return '';
    return lineSegments(vals.map((v, i) => (v == null || !Number.isFinite(v)
      ? null
      : { x: xOf(i), y: 100 - Math.max(0, Math.min(100, v)) })))
      .map((s) => areaPath(s, 100))
      .filter(Boolean)
      .join(' ');
  })();

  return (
    <div className={g.tl}>
      {/* Уншилтын мөр — заасан (эсвэл сүүлийн) үеийн хоёр тоо НЭГ газар */}
      <div className={g.tlHead} aria-live="polite" aria-atomic="true">
        <span className={g.tlHeadLbl}>{cur.label}</span>
        <span className={g.tlHeadTag} style={{ marginLeft: 0 }}>
          <i style={{ background: 'var(--chart-plan)' }} />
          {tr('Төлөвлөгөө')}
        </span>
        <b className={g.tlHeadPct}>{cur.pct == null ? '—' : pct(cur.pct)}</b>
        {cur.pct != null && <span className={g.tlHeadAmt}>{mntShort(cumOf(cur.pct))}</span>}
        {/*
          * ГУРВАН МУРУЙН УТГА (2026-09-10, хэрэглэгч: «жижиг олгосон хувийн
          * мэдээллийг гаргамаар байна»). Өнгөт цэг нь домогтой таарна.
          */}
        {cur.ipcPct != null && (
          <span className={g.tlHeadTag} title={tr('Олгосон IPC — хуримтлагдсан')}>
            <i style={{ background: 'var(--chart-actual)' }} />
            {tr('Бодит (олгосон IPC): {0}', pct(cur.ipcPct))}
            {cur.ipcMoney != null && <> · {tr('олгосон {0}', mnt(cur.ipcMoney))}</>}
          </span>
        )}
        {zoom && (
          <button type="button" className={g.tlReset} onClick={() => setZoom(null)}>
            {tr('Бүтэн харах')}
          </button>
        )}
      </div>

      <div className={g.tlMain}>
        {/*
          * ЖИЛИЙН ЗААГ — тасархай босоо зураас.
          */}
        <div className={g.tlGrid} aria-hidden>
          {pts.map((p, i) => (
            i < n - 1 && p.key.slice(0, 4) !== pts[i + 1].key.slice(0, 4)
              ? <i key={p.key} className={g.tlYr} style={{ left: `${((i + 1) / n) * 100}%` }} />
              : null
          ))}
          {/*
            * ЗААГУУРЫН ЗУРААС — hover хийсэн ҮЕД гарна.
            */}
          {hov != null && hov < n && (
            <i className={g.tlCursor} style={{ left: `${xOf(hov)}%` }} />
          )}
        </div>

      <div
        className={g.tlPlot}
        tabIndex={0}
        role="group"
        aria-label={tr('Хугацааны график — үе сонгохдоо ← → товч')}
        onBlur={() => setHov(null)}
        onKeyDown={(e) => {
          const c = hov != null && hov < n ? hov : n - 1;
          const next = e.key === 'ArrowLeft' ? c - 1 : e.key === 'ArrowRight' ? c + 1
            : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
          if (next == null) return;
          e.preventDefault();
          setHov(Math.max(0, Math.min(n - 1, next)));
        }}
      >
        <div className={g.tlBars}>
          {pts.map((p, i) => (
            <div
              key={p.key}
              className={`${g.tlCol} ${i === at ? g.tlColOn : ''}`}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov((v) => (v === i ? null : v))}
            >
            </div>
          ))}
        </div>

        <svg className={g.tlSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`tlFill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--chart-actual)', stopOpacity: CHART.areaTop }} />
              <stop offset="100%" style={{ stopColor: 'var(--chart-actual)', stopOpacity: CHART.areaBottom }} />
            </linearGradient>
          </defs>
          {CHART.grid.filter((v) => v < 100).map((v) => (
            <line
              key={v}
              x1={0}
              x2={100}
              y1={100 - v}
              y2={100 - v}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: 'var(--line)', strokeWidth: 1, strokeDasharray: '3 4' }}
            />
          ))}
          {ipcArea && <path d={ipcArea} fill={`url(#tlFill-${gid})`} />}
          <path
            className={g.tlLine}
            d={path}
            fill="none"
            vectorEffect="non-scaling-stroke"
            style={{
              stroke: 'var(--chart-plan)', strokeWidth: CHART.stroke, strokeDasharray: CHART.planDash,
              strokeLinecap: 'butt',
            }}
          />
          {ipcPath && (
            <path
              className={g.tlLineIpc}
              d={ipcPath}
              fill="none"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: 'var(--chart-actual)', strokeWidth: CHART.stroke, strokeLinecap: 'round', strokeLinejoin: 'round' }}
            />
          )}
        </svg>

        {/*
          * Цэг — БҮГД хувийн шошготой. Заасан цэг томорно.
          */}
        <div className={g.tlDots}>
          {pts.map((p, i) => (p.pct == null ? null : (
            <span
              key={p.key}
              className={`${g.tlDot} ${hov === i ? g.tlDotOn : hov != null && hov < n ? g.tlDotDim : ''}`}
              style={{
                left: `${((i + 0.5) / n) * 100}%`,
                bottom: `${Math.max(0, Math.min(100, p.pct))}%`,
              }}
            >
              <b className={twoRow && i % 2 === 1 ? g.tlDotUp : undefined}>{pct(p.pct)}</b>
            </span>
          )))}
          {pts.map((p, i) => {
            if (p.ipcPct == null) return null;
            const step = n > 24 ? Math.ceil(n / 12) : 1;
            const lastIpc = pts.reduce((a, q, k) => (q.ipcPct != null ? k : a), -1);
            const label = i === at || i === lastIpc || (n - 1 - i) % step === 0;
            return (
              <span
                key={`ipc-${p.key}`}
                className={`${g.tlDot} ${g.tlDotIpc} ${i === at ? g.tlDotOn : ''}`}
                style={{
                  left: `${((i + 0.5) / n) * 100}%`,
                  bottom: `${Math.max(0, Math.min(100, p.ipcPct))}%`,
                }}
              >
                {label && <b>{pct(p.ipcPct)}</b>}
              </span>
            );
          })}
        </div>
      </div>

      <div className={`${g.tlAxis} ${tilt ? g.tlAxisTilt : ''}`}>
        {pts.map((p, i) => (
          <span key={p.key} className={i === at ? g.tlAxisOn : undefined}>
            <b>{shortLbl(p)}</b>
          </span>
        ))}
      </div>

      {/* ОНЫ ЗУРВАС — тасархай заагийн хооронд нэг удаа */}
      {grain !== 'year' && (
        <div className={g.tlYrRow} aria-hidden>
          {yrs.map((v, i) => (
            <span key={`${v.y}-${i}`} style={{ width: `${(v.c / n) * 100}%` }}>{v.y}</span>
          ))}
        </div>
      )}
      </div>

      {/*
        * ЗУМЫН ЗУРВАС — ArcGIS дашбоардын хугацааны гулсуурын зан.
        */}
      {N > 12 && (
        <div className={g.tlRange}>
          <div className={g.tlRangeHead}>
            <span className={g.tlRangePill}>{all[lo].label}</span>
            <span className={g.tlRangeRule} />
            <span className={g.tlRangeSpan}>
              {!zoom || (lo === 0 && hi === N - 1)
                ? tr('Бүх хугацаа')
                : grain === 'year' ? tr('{0} жил', hi - lo + 1)
                  : grain === 'quarter' ? tr('{0} улирал', hi - lo + 1)
                    : tr('{0} сар', hi - lo + 1)}
            </span>
            <span className={g.tlRangeRule} />
            <span className={g.tlRangePill}>{all[hi].label}</span>
          </div>
          <div className={g.tlZoom} ref={barRef} onPointerDown={drag('new')}>
            <div
              className={g.tlZoomWin}
              style={{
                left: `${(lo / (N - 1)) * 100}%`,
                right: `${100 - (hi / (N - 1)) * 100}%`,
              }}
              onPointerDown={drag('move')}
            >
              <i className={g.tlZoomGrip} onPointerDown={drag('lo')} />
              <i className={`${g.tlZoomGrip} ${g.tlZoomGripR}`} onPointerDown={drag('hi')} />
            </div>
          </div>
          <div className={g.tlRangeTicks} aria-hidden>
            {all.map((p, i) => (
              <i key={p.key} className={i >= lo && i <= hi ? g.tlRangeTickOn : undefined} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ БАРУУН — ГАЗАР ЧӨЛӨӨЛӨЛТ ══════════════════════ */

/**
 * ДЭД БАГЦ бүрд давхцаж буй ҮЛДСЭН нэгж талбарууд (ObjectID).
 */
function useOverlapBySubPkg(enabled: boolean) {
  const subs = useAsync<SubPkg[]>(loadSubPkgLayers, []);
  const [out, setOut] = useState<
    { m: Map<string, number[]>; failed: Set<string> } | 'error' | null
  >(null);

  useEffect(() => {
    if (!enabled || subs.state !== 'ready') return;
    let alive = true;
    const keys = subs.data.map((sp) => sp.key);
    Promise.allSettled(
      subs.data.map((sp) => overlapLeftParcels(
        sp.layerIds.map((layerId) => ({ layerId, where: null })),
      )),
    ).then((res) => {
      if (!alive) return;
      if (res.length > 0 && res.every((r) => r.status === 'rejected')) { setOut('error'); return; }
      const m = new Map<string, number[]>();
      const failed = new Set<string>();
      res.forEach((r, i) => {
        if (r.status === 'rejected') { failed.add(keys[i]); return; }
        if ((r.value.failed?.length ?? 0) > 0) failed.add(keys[i]);
        if (r.value.oids.length > 0) m.set(keys[i], r.value.oids);
      });
      setOut({ m, failed });
    });
    return () => { alive = false; };
  }, [enabled, subs]);

  return { subs, out: subs.state === 'error' ? ('error' as const) : out };
}

/**
 * «БАГЦ 74» — ДАВХАРГЫН жагсаалтын доод хэсэгт гарах АЖЛЫН жагсаалт
 * (2026-09-15, хэрэглэгчийн заавар: «давхаргын доор багц 74 гэж шинээр
 * үүсгэнэ, тэнд багцын ажлууд жагсаалтаар харагдана»).
 */
function PkgWorkList({
  rows, visible, setVisible,
}: {
  rows: CfRow[] | null;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
}) {
  const [open, setOpen] = useState(false);
  const map = useMap();
  const addedRef = useRef(new Map<CfRow['oid'], string[]>());

  const works = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => r.isWork)
      .map((r) => {
        const key = pkgKeyOf(r.pkg2);
        return { oid: r.oid, pkg: r.pkg, name: r.name, ids: (key && mapPkgLayers(key)) || [] };
      })
      .sort((a, b) => a.pkg.localeCompare(b.pkg) || a.name.localeCompare(b.name));
  }, [rows]);

  const onCount = works.filter((w) => pkgWorkOn(w, visible)).length;

  if (works.length === 0) return null;

  return (
    <section className={g.pkgSec}>
      <button
        type="button"
        className={g.pkgHead}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={g.pkgCaret}>{open ? '▾' : '▸'}</span>
        <span className={g.pkgTitle}>{tr('{0} багц', num(works.length))}</span>
        <span className={`${g.pkgCount} num`}>{onCount}/{works.length}</span>
      </button>
      {open && (
        <div className={g.pkgRows}>
          {works.map((w) => {
            const has = w.ids.length > 0;
            const isOn = pkgWorkOn(w, visible);
            return (
              <button
                key={w.oid}
                type="button"
                disabled={!has}
                className={`${g.pkgRow} ${isOn ? g.pkgRowOn : ''}`}
                title={has ? w.name : tr('{0} — орон зайн давхаргагүй', w.name)}
                onClick={() => {
                  if (!has) return;
                  if (isOn) {
                    const drop = pkgWorkDrop(works, w, addedRef.current);
                    addedRef.current.delete(w.oid);
                    setVisible((v) => v.filter((id) => !drop.includes(id)));
                    return;
                  }
                  addedRef.current.set(w.oid, pkgWorkAdded(w, visible));
                  setVisible((v) => [...new Set([...v, ...w.ids])]);
                  if (w.ids[0]) map.zoomToLayer(w.ids[0]);
                }}
              >
                <span className={g.pkgBagts}>{w.pkg || '—'}</span>
                <span className={g.pkgName}>{w.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Газар чөлөөлөлтийн нэгж талбарын давхарга — шалтгааны зум үүн дээр */
const PARCEL_LAYER = 'land:left';

function LandCard({
  onShowLayers,
  active,
  reason,
  byReason,
  onPickReason,
}: {
  /** `null` = сонголт ТАЙЛАГДСАН, өмнөх давхаргын төлөвийг сэргээ */
  onShowLayers: (ids: string[] | null) => void;
  /** Шүүлтэд багтсан дэд багц → ажлын төрлүүд; `null` = өгөгдөл хараахан алга */
  active: Map<string, string[]> | null;
  /**
   * СОНГОСОН ШАЛТГААН — БҮРХҮҮЛИЙН төлөв (2026-09-07).
   */
  reason: string | null;
  byReason: ReturnType<typeof useAsync<Map<string, Set<number>>>>;
  onPickReason: (k: string) => void;
}) {
  const land = useAsync(loadLandStatus, []);
  const { subs, out: ov } = useOverlapBySubPkg(reason != null);

  /**
   * АЖЛЫН ТӨРӨЛ бүрд ТУХАЙН ШАЛТГААНТАЙ давхцсан талбарын тоо.
   */
  const rows = useMemo(() => {
    if (reason == null || ov == null || ov === 'error' || subs.state !== 'ready') return [];
    const want = byReason.state === 'ready' ? byReason.data.get(reason) : null;
    if (!want) return [];
    const acc = new Map<string, { oids: Set<number>; layers: Set<string>; failed: boolean }>();
    for (const sp of subs.data) {
      const types = active?.get(sp.key);
      if (!types || types.length === 0) continue;
      const hit = (ov.m.get(sp.key) ?? []).filter((o) => want.has(o));
      const bad = ov.failed.has(sp.key);
      if (hit.length === 0 && !bad) continue;
      for (const ty of types) {
        let a = acc.get(ty);
        if (!a) { a = { oids: new Set(), layers: new Set(), failed: false }; acc.set(ty, a); }
        for (const o of hit) a.oids.add(o);
        for (const id of sp.layerIds) a.layers.add(id);
        if (bad) a.failed = true;
      }
    }
    return [...acc]
      .map(([ty, a]) => ({
        key: ty,
        label: nice(ty),
        layerIds: [...a.layers],
        value: a.oids.size,
        sub: 0,
        failed: a.failed,
      }))
      .sort((x, y) => y.value - x.value);
  }, [reason, ov, subs, byReason, active]);
  const failedTypes = useMemo(
    () => new Set(rows.filter((r) => r.failed).map((r) => r.key)),
    [rows],
  );

  /**
   * СОНГОСОН АЖЛЫН ТӨРӨЛ — мөр тодруулах ба зургийн холбоос.
   */
  const [pick, setPick] = useState<string | null>(null);

  const [prevReason, setPrevReason] = useState(reason);
  if (prevReason !== reason) {
    setPrevReason(reason);
    setPick(null);
  }

  /** Мөр дарах — асаах/тайлах */
  const show = (key: string) => {
    if (pick === key) {
      setPick(null);
      onShowLayers(null);
      return;
    }
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    setPick(key);
    onShowLayers(r.layerIds);
  };

  return (
    <Section title={tr('Газар чөлөөлөлт')}>
      <Data q={land} minH={220}>
        {(d) => (
          <>
            <Stats cols={1}>
              <Stat value={num(d.remaining)} label={tr('Чөлөөгдөөгүй нэгж талбар')} accent />
            </Stats>

            <h4 className={g.sub}>{tr('Чөлөөгдөөгүй шалтгаанаар')}</h4>
            {d.reasons.length === 0
              ? <Empty label={tr('Шалтгаан бүртгэгдээгүй')} />
              : (
                <Bars
                  color={BAR_HUE}
                  selected={reason}
                  /* Дахин дарвал сонголт тайлагдана — цуцлах тусдаа товчгүй */
                  onSelect={onPickReason}
                  items={countBars(
                    d.reasons.map((r) => ({ key: r.label, label: r.label, value: r.n, sub: 0 })),
                    { one: tr('нэгж талбар'), many: tr('чөлөөгдөөгүй талбарын') },
                  )}
                />
              )}

            <h4 className={g.sub}>{tr('Ажлын төрлөөр давхцаж буй')}</h4>
            {reason == null ? null
              : ov == null || byReason.state === 'loading' ? (
              <p className={g.wait}>{tr('Давхцлыг тооцож байна…')}</p>
            ) : ov === 'error' || byReason.state === 'error' ? (
              <Empty label={tr('Давхцал тооцогдсонгүй')} />
            ) : rows.length === 0 ? (
              <Empty label={tr('Давхцал илрээгүй')} />
            ) : (
              <Bars
                color={BAR_HUE}
                /* Дарахад давхарга зурагт асаж, түүн рүү ойртоно; дахин
                   дарвал тайлагдаж, зураг өмнөх төлөв рүүгээ буцна. */
                selected={pick}
                onSelect={show}
                items={countBars(rows, { one: tr('нэгж талбар'), many: tr('давхцлын') })
                  .map((it) => (failedTypes.has(it.key)
                    ? {
                      ...it,
                      color: 'var(--warn)',
                      ...(it.value === 0 ? { display: tr('татагдсангүй') } : {}),
                      hint: [...it.hint, tr('Зарим давхаргын давхцал татагдсангүй — тоо дутуу байж болно')],
                    }
                    : it))}
              />
            )}
          </>
        )}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — СААД, БАГЦААР ══════════════════════ */

/**
 * БАГЦ БҮР ДЭЭР ДАВХЦАЖ БУЙ ҮЛДСЭН НЭГЖ ТАЛБАР.
 */
function SaadCard({
  onShowLayers,
  keys,
  known,
  oids,
}: {
  /** `null` = сонголт ТАЙЛАГДЛАА, давхаргыг өмнөх төлөвт нь буцаа */
  onShowLayers: (ids: string[] | null) => void;
  /**
   * ХУГАЦААНЫ ШҮҮЛТЭД багтсан багцын түлхүүрүүд. `null` = шүүлтгүй (бүгд).
   */
  keys: Set<string> | null;
  /** Cashflow-д холбогдох ажилтай БҮХ (газрын зургийн) түлхүүр — эндээс гадуурх багц шүүлтэд ХАСАГДАХГҮЙ */
  known: Set<string> | null;
  /**
   * СОНГОСОН ШАЛТГААНЫ нэгж талбарууд. `null` = шалтгаан сонгоогүй (бүгд).
   */
  oids: Set<number> | null;
}) {
  const q = useAsync(loadPkgOverlaps, []);
  /**
   * СОНГОСОН БАГЦ — дахин дарвал ТАЙЛАГДАНА (2026-09-07, хэрэглэгчийн хүсэлт).
   */
  const [sel, setSel] = useState<string | null>(null);
  const [prevOids, setPrevOids] = useState(oids);
  if (prevOids !== oids) {
    setPrevOids(oids);
    setSel(null);
  }
  const rows = useMemo(() => {
    if (q.state !== 'ready') return [];
    const byKey = keys ? q.data.filter((r) => keys.has(r.key) || (known != null && !known.has(r.key))) : q.data;
    if (!oids) return byKey.map((r) => ({ ...r, hit: r.oids }));
    return byKey
      .map((r) => ({ ...r, hit: r.oids.filter((o) => oids.has(o)) }))
      .filter((r) => r.hit.length > 0 || r.failed)
      .sort((a, b) => b.hit.length - a.hit.length);
  }, [q, keys, known, oids]);
  const okRows = useMemo(() => rows.filter((r) => !r.failed), [rows]);
  /**
   * ХҮЧИНТЭЙ сонголт — жагсаалтад БАЙГАА эсэхээр шалгагдана.
   */
  const cur = sel != null && rows.some((r) => r.key === sel) ? sel : null;
  return (
    <Section
      title={tr('Тулгамдаж буй асуудал')}
      note={okRows.length > 0
        ? tr('{0} багц · {1} талбар',
            num(okRows.length),
            num(new Set(okRows.flatMap((r) => r.hit)).size))
        : undefined}
    >
      <Data q={q} minH={160}>
        {() => (rows.length === 0
          ? <Empty label={tr('Аль ч багц дээр давхцсан үлдсэн нэгж талбар алга.')} />
          : (
            <Bars
              color="var(--bad)"
              limit={8}
              selected={cur}
              onSelect={(k) => {
                const next = k === cur ? null : k;
                setSel(next);
                const r = next != null ? rows.find((x) => x.key === next) : null;
                onShowLayers(r ? r.layerIds : null);
              }}
              items={rows.map((r) => ({
                key: r.key,
                label: nice(tr(r.name)),
                value: r.hit.length,
                display: r.failed ? tr('татагдсангүй') : tr('{0} талбар', num(r.hit.length)),
                ...(r.failed ? { color: 'var(--warn)' } : {}),
              }))}
            />
          ))}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ ══════════════════════ */

/**
 * Хэмжээ авах давхаргууд — id ба картын шошго.
 */
const PLAN_QTY: { id: string; label: string }[] = [
  { id: 'road', get label() { return tr('Нийт замын урт'); } },
  { id: 'et:15', get label() { return tr('Инженерийн бэлтгэлийн урт'); } },
  { id: 'nogoon', get label() { return tr('Ногоон байгууламж'); } },
];

/** Инженерийн шугам сүлжээ — гурван гэр бүлийн давхаргын нийлбэр урт */
const NET_FAMILIES: PkgFamily[] = ['net', 'pow', 'src'];

/**
 * «Ерөнхий төлөвлөгөө» картын (`PlanCard`) уншдаг БҮХ давхарга — `usePlanTotals`-ын жагсаалт (2026-10-22).
 */
const PLAN_CARD_IDS: string[] = [...new Set([
  'et:24', 'zone', ...PLAN_QTY.map((p) => p.id), ...NET_FAMILIES.flatMap((f) => PKG_BY_FAMILY[f] ?? []),
])];

function PlanCard({ totals }: { totals: ReturnType<typeof usePlanTotals> }) {
  const started = useAsync(async () => (await loadBagtsRows()).reduce((a, r) => a + r.blocks, 0), []);
  const hq = useAsync(loadHeadline, []);
  const builtFailed = hq.state === 'error' || (hq.state === 'ready' && Number.isNaN(hq.data.usableM2));
  const byStatus = hq.state === 'ready' && !builtFailed ? hq.data.byStatus : null;
  const nOf = (label: string) => byStatus?.find((s) => s.label === label)?.n ?? 0;
  const existing = byStatus ? nOf(BUILT_STATUS[0].value) : null;
  const fresh = byStatus ? byStatus.reduce((a, s) => a + s.n, 0) - (existing ?? 0) : null;

  return (
    <Section title={tr('Ерөнхий төлөвлөгөө')}>
      <Data q={totals} minH={200}>
        {(t) => {
          const cnt = (id: string) => t.get(id)?.n ?? null;
          const qty = (id: string) => {
            const d = LAYER_BY_ID[id];
            const q = t.get(id)?.q;
            return d && q != null ? qtyText(d, q) : null;
          };

          /* Шугам сүлжээний нийт урт. Аль нэг нь дутвал нийлбэрт орохгүй — тоо БАГА гарна, ХУДАЛ гарахгүй. */
          const netIds = [...new Set(NET_FAMILIES.flatMap((f) => PKG_BY_FAMILY[f] ?? []))]
            .filter((id) => LAYER_BY_ID[id]?.qty?.unit === 'м');
          const netM = netIds.reduce((s, id) => s + (t.get(id)?.q ?? 0), 0);
          const netMissing = netIds.filter((id) => t.get(id)?.q == null).length;

          const lines: { key: string; label: string; text: string }[] = [];
          for (const p of PLAN_QTY) {
            const text = qty(p.id);
            if (text) lines.push({ key: p.id, label: p.label, text });
          }
          if (netM > 0) {
            lines.push({
              key: 'net',
              label: tr('Инженерийн шугам сүлжээ'),
              text: tr('{0} км', num(netM / 1000, 1))
                + (netMissing ? ` ${tr('(дутуу: {0} давхарга)', num(netMissing))}` : ''),
            });
          }
          const zones = cnt('zone');
          if (zones != null) lines.push({ key: 'zone', label: tr('Хот төлөвлөлтийн бүс'), text: num(zones) });

          return (
            <>
              <Stats cols={2}>
                <Stat
                  value={cnt('et:24') == null ? '—' : num(cnt('et:24')!)}
                  label={existing != null && fresh != null
                    ? tr('Нийт барилга (одоо {0} · шинэ {1})', num(existing), num(fresh))
                    : builtFailed
                      ? tr('Нийт барилга (одоо {0} · шинэ {1})', '—', '—')
                      : tr('Нийт барилга (ЕТ)')}
                  accent
                />
                <Stat
                  value={started.state === 'ready' ? num(started.data) : started.state === 'error' ? '—' : '…'}
                  label={tr('Баригдаж эхэлсэн блок')}
                />
              </Stats>
              {(builtFailed || started.state === 'error') && (
                <p role="status" style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--bad-ink)' }}>
                  {tr('Барилгын тоо татагдсангүй: {0}', friendlyError(hq.state === 'error' ? hq.error : started.state === 'error' ? started.error : null))}
                </p>
              )}
              {lines.length > 0 && (
                <ul className={g.plain}>
                  {lines.map((l) => (
                    <li key={l.key}><span>{l.label}</span><b className="num">{l.text}</b></li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — ХАБ ══════════════════════ */

function HseCard() {
  const hse = useAsync(loadHseNow, []);
  const stamp = hse.state === 'ready' ? hse.data?.date : null;
  const denied = hse.state === 'error'
    && friendlyError(hse.error) === tr('Энэ өгөгдөлд хандах эрх алга байна. Админд хандана уу.');
  return (
    <Section title={tr('ХАБ')} note={stamp || undefined}>
      {denied ? <Empty icon="shield" label={tr('Танд энэ хэсгийг харах эрх олгогдоогүй')} /> : (
      <Data q={hse} minH={130}>
        {(d) => (d == null ? <Empty label={tr('Бүртгэл алга')} /> : (
          <Stats cols={3}>
            <Stat value={num(d.workers)} label={tr('Ажиллаж буй хүн')} accent />
            <Stat value={num(d.equipment)} label={tr('Техник хэрэгсэл')} />
            <Stat value={num(d.manHours)} label={tr('Хүн цаг')} />
          </Stats>
        ))}
      </Data>
      )}
    </Section>
  );
}

export default GeneralDash;

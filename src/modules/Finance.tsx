'use client';

import {
  useState, useEffect, useMemo, useRef, useCallback, useId, type MouseEvent, type ReactNode,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  Data, Empty, userError, tabFocusNav,
} from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { CashflowPlan } from '@/modules/CashflowPlan';
import { useAsync } from '@/lib/useAsync';
import {
  queryFeatures, arcgisPost,
} from '@/lib/query';
import { cached } from '@/lib/live';

/**
 * ӨДӨР ТУТАМ ЗАСАГДДАГ хүснэгтийн кэшийн хугацаа.
 */
const LIVE_TTL = 60_000;
import { loadBlockHistory, loadBlockUniverse, loadInfraHistory, loadInfraUniverse } from '@/lib/blockProgress';
import { loadPlanCurveCached, planPctAt, measureDayOf, planCoverage, coverageOk, type PlanCurve, type PlanPoint } from '@/lib/planProgress';
import { buildPhys, type PhysAtMap } from '@/lib/finPhys';
import {
  housingPlanSeries, housingSeries, planScope, pkgCostWeight, cfWeightRow, HOUSING_PKGS,
} from '@/lib/gdash';
import {
  CASHFLOW_NEW, HO_IPC, pkgKeyOf, cfMonthAxis, hoAmount,
  CF_WORK_WHERE, CF_MONTH_WHERE, CF_MONTH, bagtsKey,
} from '@/lib/services';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { MAP_PKG_ALIAS } from '@/lib/pkgAlias';
import { loadHoRows, groupHo, type HoContract } from '@/lib/ipc';
import {
  setFinNavDirty,
} from '@/lib/finEdit';
import {
  finXlRowHidden, finXlChartCat,
} from '@/lib/finExcelLayout';
import {
  mnt, num, pct, date, monthKey, dayKey,
} from '@/lib/format';
import { fitLabels, textW, useChartWidth } from '@/lib/chartFit';
import { CHART, lineSegments } from '@/lib/chartStyle';
import {
  invalidate,
} from '@/lib/dataBus';
import {
  hasCap, subscribeCaps,
} from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { IpcTable } from '@/modules/IpcTable';
import {
  loadMonthlyMoney, monthSourceOf, confirmAndSwitch, switchPhaseWhy, PKG_KEYS, SRC_HUVAARI, CF_SWITCH_CAP, type MonthlyMoney,
} from '@/lib/monthlyMoney';
import type { ProjectPlan } from '@/lib/projectPlanInputs';
import type { PlanNode, PlanValues, BlockStatus } from '@/lib/projectPlan';
import {
  MANUAL_PHASES, NO_FILTER, PLAN_EDIT, PLAN_EDIT_KEYS, addWhy, deletePlanRow, deleteWhy, filterActive, filterPlan,
  importCutoff, pkgOptions, savePlanValue, type FillFilter, type PlanEditKey, type PlanFilter,
} from '@/lib/planEdit';
import { AddRowsPanel, EDIT_LABEL, PlanEditCell } from '@/modules/PlanEntry';
import f from './finance.module.css';

/**
 * `loadProjectPlan.failed`-ийн ДОТООД түлхүүрийг (`schedule:b1_9f` · `land:БАГЦ161` · `footprints`…) хүний нэр рүү.
 */
function planFailedLabels(failed: readonly string[]): string[] {
  const out = new Set<string>();
  for (const k of failed) {
    const [head, rest] = k.split(/:(.*)/s);
    if (head === 'schedule') {
      const p = rest ? PKGS.find((x) => x.key === rest) : undefined;
      out.add(p ? tr('{0}: {1}', tr('Хуваарь'), p.label) : tr('Хуваарь'));
    } else if (head === 'land') {
      out.add(rest ? tr('{0}: {1}', tr('Газар чөлөөлөлт'), rest) : tr('Газар чөлөөлөлт'));
    } else if (k === 'parcels') out.add(tr('Нэгж талбар'));
    else if (k === 'footprints') out.add(tr('Барилгын давхарга'));
    else if (k === 'blockProgress' || k === 'blockUniverse' || k === 'infraProgress' || k === 'actual') out.add(tr('Гүйцэтгэл'));
    else out.add(k);
  }
  return [...out];
}

/* ═══════════════════════════════════════════════════════════
   САНХҮҮЖИЛТ — CASHFLOW (төлөвлөгөө) + IPC (олгосон акт).
   МӨР (гэрээ/багц) БҮРД тусдаа график: сар бүр хэдэн хувьд гүйцэтгэж,
   хэдэн төгрөг ТӨЛӨВЛӨСӨН (PLAN слот) ба IPC-ээр хэдийг ОЛГОСОН (ACT слот).
   ═══════════════════════════════════════════════════════════ */

/** Утгыг тоо руу — ArcGIS Double эсвэл "0" мэт мөр ирдэг */
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** IPC огноог "YYYY-MM" болгох ("2026.05.04" ба "2026-05-04" 2-уул) */
/**
 * IPC-ийн огнооноос «YYYY-MM» сар гаргана.
 */
function ym(v: unknown): string | null {
  if (v == null || v === '' || v === 0) return null;
  // ArcGIS-ийн Date талбар — ms epoch тоо
  if (typeof v === 'number' && v > 1e12) return monthKey(v);
  const s = String(v).trim().replace(/\./g, '-');
  const okYear = (y: number) => y >= 2000 && y <= 2100;
  // ISO: оныг мөрийн ЭХНЭЭС барина — «20026…» гэх гажигт дундаас таслахгүй
  let m = s.match(/^(\d{4})-(\d{1,2})(?:\D|$)/);
  if (m && okYear(Number(m[1]))) return `${m[1]}-${m[2].padStart(2, '0')}`;
  // Американ: M/D/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && okYear(Number(m[3]))) return `${m[3]}-${m[1].padStart(2, '0')}`;
  return null;
}



/**
 * S-муруйн гурван цуваа — баталгаажсан палитрын слотууд.
 */
const ACT = 'var(--data)'; // олгосон санхүүжилтийн өссөн ₮ — бүтэн шугам
const PHYS = 'var(--chart-plan)'; // биет гүйцэтгэлийн % — тасархай шугам

type Row = Record<string, unknown>;

/**
 * Нэг сарын цэг: олгосон ₮ + биет гүйцэтгэл %.
 */
export type MonthPt = {
  label: string; // «2025-10»
  given: number; // тухайн сард IPC-ээр олгосон ₮ (net)
  /**
   * Сарын эцсийн байдлаарх БИЕТ гүйцэтгэл, % («Гүйцэтгэл бөглөх»).
   */
  phys: number | null;
  /**
   * `phys`-ийн ХЭМЖИЛТИЙН огноо «YYYY-MM-DD» (`FinData.physAt`).
   */
  physAt?: string | null;
  /**
   * БАГЦЫН ТҮЛХҮҮР — `phys` аль багцаас гарсан бэ (`bagtsKey`/`pkgKeyOf`).
   */
  pkg?: string;
  physLag?: number | null;
  /** `physLag`-ийн хэмжилтийн огноо — `physAt`-тай ижил утгатай */
  physLagAt?: string | null;
};

/** Багц бүрийн IPC: сар → олгосон нийлбэр */
export type GivenMap = Map<string, Map<string, number>>;

/** Багц бүрийн биет гүйцэтгэл: сар → % (блокуудын дундаж, тухайн сарын эцсээр) */
export type PhysMap = Map<string, Map<string, number>>;

/**
 * `physCnt` — багц бүрийн сар тутмын БЛОКИЙН ТОО (phys дундаж хэдэн блокоос гарсан).
 * Төслийн нэгтгэсэн биет гүйцэтгэлийг багцуудаар блок-жигнэхэд (давхар дунджийг
 * зайлсхийхэд) ашиглана — `phys`-ийн утгыг ХӨНДӨХГҮЙ, зэрэгцээ мэдээлэл.
 */
export type FinData = {
/**
   * ГЭРЭЭНИЙ мөрүүд (76) — `Cashflow_0909`.
   */
  contracts: Row[];
  /**
   * Багц → ГЭРЭЭНИЙ НИЙТ ДҮН, ₮ (`Geree_erh_dun`; хоосон бол
   * `Urdch_tusuwt_urtug`).
   */
  planTotal: Map<string, number>;
  given: GivenMap;
  /**
   * Багц → нийт олгосон (цэвэр) дүн — ОГНООГҮЙ актыг ч ОРУУЛНА.
   */
  givenTotal: Map<string, number>;
  phys: PhysMap;
  physCnt: PhysMap;
  /**
   * Багц → сар → тэр цэгийн ХЭМЖИЛТИЙН огноо «YYYY-MM-DD» (2026-09-25).
   */
  physAt: PhysAtMap;
  /**
   * Багц → блокийн ХУВААРЬ (бөглөх хуудасны блок) — `finPhys.PhysBuild.physN`.
   */
  physN?: Map<string, number>;
  /**
   * ТӨЛБӨРИЙН МӨРҮҮД (45) — `HO_IPC` түүхий мөр, OID дарааллаар.
   */
  pays: Row[];
  /**
   * ГЭРЭЭНИЙ ТҮВШИН (22) — `groupHo`-оор dedup хийсэн.
   */
  contractsHo: HoContract[];
};

// ═══════════════════════════════════════════════════════════
//  КОМБО ГРАФИК (envhub хэлээр) — градиентгүй, glow-гүй хавтгай дүрслэл.
// ═══════════════════════════════════════════════════════════

export function ComboChart({
  items,
  height = 280,
  lagMonth,
  lagLvl,
  hidePhys = false,
  contract = null,
}: {
  items: MonthPt[];
  height?: number;
  /**
   * ГЭРЭЭНИЙ НИЙТ ДҮН, ₮ — биет % -ийг ₮ тэнхлэгт буулгах суурь.
   */
  contract?: number | null;
  /** Хоцрогдол хэмжсэн сар — тэр сарын БИЕТ багана анивчина */
  lagMonth?: string;
  lagLvl?: 'red' | 'yellow' | null;
  /**
   * БИЕТ гүйцэтгэлийн цуваа, шошго, тултипын мөрийг НУУНА.
   */
  hidePhys?: boolean;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /* Олголтын талбайн градиентийн id — нэг хуудсанд хэд хэдэн ComboChart байж болно */
  const gid = useId().replace(/:/g, '');
  const N = items.length;

  /*
   * ── Өссөн S-муруйн өгөгдөл — ₮ ТЭНХЛЭГ: олгосон санхүүжилт · биет гүйцэтгэл.
   */
  const cums = items.reduce<number[]>((a, it) => { a.push((a[a.length - 1] ?? 0) + it.given); return a; }, []);
  /** Биет нь ӨӨРИЙН %-ийн тэнхлэгтэй эсэх — `contract` */
  const ownAxis = !(contract != null && Number.isFinite(contract) && contract > 0);
  const physVal = (p: number | null): number | null => (
    p == null || ownAxis ? null : (Math.max(0, Math.min(100, p)) / 100) * (contract as number)
  );
  const yMax = Math.max(1, ...cums, ...(hidePhys ? [] : items.map((it) => physVal(it.phys) ?? 0)));
  const rows = items.map((it, i) => ({
    label: it.label,
    financing: cums[i], // өссөн олгосон санхүүжилт ₮
    physical: physVal(it.phys), // биет гүйцэтгэлийн үнэ цэнэ ₮ (өөр тэнхлэгтэй бол null)
    physPct: it.phys, // шошго/тултипт харуулах биет % (null = хэмжигдээгүй)
    givenCum: cums[i],
    it,
  }));
  // Бодит муруйнууд (санхүүжилт, биет) зөвхөн ОДОО хүртэл; төлөвлөгөө л дуустал хүрнэ
  let lastPhys = -1;
  rows.forEach((r, i) => { if (r.physPct != null) lastPhys = i; });
  // Нуусан үед сүүлийн биет цэгийг -1 болгоно — доорх бүх зурах нөхцөл унтарна
  if (hidePhys) lastPhys = -1;

  /*
   * ── ХЭМЖЭЭ ─────────────────────────────────────────────────────────────
   */
  const W = useChartWidth(wrapRef, 1600);
  const H = height;
  /**
   * Зүүн зай — Y тэнхлэгийн шошгын ТУСДАА багана.
   */
  const padL = Math.round(textW(num(yMax)) + 16);
  /* баруун — сүүлийн шошгыг багтаах зай; биет өөрийн тэнхлэгтэй бол «100%» шошго */
  const padR = ownAxis && !hidePhys ? 40 : 30;
  const padT = 26;
  const padB = 30;  // доор — ЗӨВХӨН он сар (хувиуд tooltip руу шилжсэн)

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
  /** Биет цэгийн Y — ₮ тэнхлэгт (гэрээтэй) эсвэл өөрийн 0–100% тэнхлэгт */
  const yPhys = (r: { physical: number | null; physPct: number | null }) => (
    ownAxis
      ? padT + (1 - Math.max(0, Math.min(100, r.physPct ?? 0)) / 100) * plotH
      : yFor(r.physical ?? 0)
  );

  /* Сүүлийн УТГАТАЙ цэгүүд — тэдгээр дээр л шошго, том цэг үлдэнэ */
  const lastGiven = rows.reduce((a, r, i) => (r.givenCum > 0 ? i : a), -1);

  /* Цэгүүдийг нэг л удаа бодно — зам, шошго бүгд эндээс */
  const givenPts = rows.slice(0, lastGiven + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.givenCum) }));
  const physSegs = lineSegments(rows.slice(0, lastPhys + 1).map((r, i) => (
    r.physPct == null ? null : { x: xFor(i), y: yPhys(r) }
  )));
  const givenSegs = lineSegments(givenPts);


  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left - padL) / Math.max(1, plotW);
    setHi(Math.max(0, Math.min(N - 1, Math.round(t * (N - 1)))));
  };
  const pt = hi != null ? rows[hi] : null;
  /** Цэгийн тунгалаг — Environment `AreaChart`: энгийн .5, заасан 1, бусад .15 */
  const dotOp = (i: number) => (hi == null ? 0.5 : i === hi ? 1 : 0.15);

  const anchorFor = (i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');

  /*
   * ── ШОШГЫН БАГТААМЖ ──
   */
  const envThin = (i: number, last: number) => {
    if (N <= 1 || i === 0 || i === last) return true;
    const gap = 100 / (N - 1);
    const step = Math.max(1, Math.ceil(11 / gap));
    return i % step === 0 && (last - i) * gap >= 11;
  };
  const fitFor = (last: number, valOf: (r: typeof rows[number]) => string) => new Set(
    fitLabels(rows.slice(0, last + 1).map((r, i) => ({
      i,
      x: xFor(i),
      w: textW(valOf(r)),
      anchor: anchorFor(i),
    })).filter((l) => envThin(l.i, last))),
  );
  const givenLbl = fitFor(lastGiven, (r) => num(r.givenCum));
  const physLbl = fitFor(lastPhys, (r) => pct(r.physPct, 1));
  /* X тэнхлэгийн он·сар — «2026-09» тогтмол 7 тэмдэгт */
  const axisLbl = new Set(fitLabels(rows.map((r, i) => ({
    i, x: xFor(i), w: textW(r.label, 11), anchor: anchorFor(i),
  })), 14));

  /** Гарын удирдлагын анхдагч цэг — сүүлийн утгатай сар (эсвэл сүүлийн сар) */
  const homeIdx = Math.max(lastGiven, lastPhys) >= 0 ? Math.max(lastGiven, lastPhys) : N - 1;

  return (
    <div
      className={f.chartWrap}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHi(null)}
      tabIndex={N > 0 ? 0 : undefined}
      role="group"
      aria-label={tr('{0} — сар сонгохдоо ← → товч', tr('Санхүүжилтийн явц'))}
      onFocus={() => setHi((h) => h ?? homeIdx)}
      onBlur={() => setHi(null)}
      onKeyDown={(e) => {
        if (!N) return;
        const cur = hi ?? homeIdx;
        const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1
          : e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : null;
        if (next == null) return;
        e.preventDefault();
        setHi(Math.max(0, Math.min(N - 1, next)));
      }}
    >
      {/* Дэлгэц уншигчийн уншилт — tooltip-тэй ИЖИЛ тоо */}
      <span aria-live="polite" className={f.srOnly}>
        {pt ? [
          pt.label,
          `${tr('Олгосон санхүүжилт')}: ${pt.givenCum > 0 ? mnt(pt.givenCum) : '—'}`,
          ...(hidePhys ? [] : [`${tr('Биет гүйцэтгэл')}: ${pct(pt.physPct, 1)}`]),
        ].join(', ') : ''}
      </span>
      <svg
        className={f.comboSvg}
        style={{ height: H }}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={tr('Санхүүжилтийн явц: олгосон санхүүжилт, биет гүйцэтгэл')}
      >
        {/* ── ТОР ба Y тэнхлэг ── */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = yFor(t * yMax);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={f.curveGrid} />
              <text x={padL - 8} y={gy + 3} className={f.sAxisY} textAnchor="end">
                {t === 0 ? '0' : num(t * yMax)}
              </text>
              {ownAxis && !hidePhys && (
                <text x={W - padR + 6} y={gy + 3} className={f.sAxisY} textAnchor="start" style={{ fill: PHYS }}>
                  {pct(t * 100, 0)}
                </text>
              )}
            </g>
          );
        })}

        {/* ХОЦРОГДСОН САР — тасархай босоо шугам + лугшдаг цэг */}
        {lagMonth != null && lagLvl != null && (() => {
          const li = rows.findIndex((r) => r.label === lagMonth);
          if (li < 0) return null;
          const color = lagLvl === 'red' ? 'var(--bad)' : 'var(--warn)';
          const cx = xFor(li);
          return (
            <g>
              <line
                x1={cx} x2={cx} y1={padT} y2={padT + plotH}
                style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.45 }}
              />
              {rows[li].physPct != null && (
                <circle
                  cx={cx} cy={yPhys(rows[li])} r={5} style={{ fill: color }}
                  className={lagLvl === 'red' ? f.barBlinkRed : f.barBlinkYellow}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })()}

        {/* ── МУРУЙНУУД — олгосон санхүүжилт (зузаан, бүтэн) ба биет гүйцэтгэл ── */}
        <defs>
          <linearGradient id={`cmb-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: ACT, stopOpacity: CHART.areaTop }} />
            <stop offset="100%" style={{ stopColor: ACT, stopOpacity: CHART.areaBottom }} />
          </linearGradient>
        </defs>
        {givenSegs.map((seg) => (seg.single ? null : (
          <path
            key={`ga-${seg.from}`}
            d={`${seg.d} L${seg.pts[seg.pts.length - 1].x},${padT + plotH} L${seg.pts[0].x},${padT + plotH} Z`}
            style={{ fill: `url(#cmb-${gid})`, stroke: 'none' }}
          />
        )))}
        {givenSegs.map((seg) => (seg.single ? null : (
          <path key={`gs-${seg.from}`} d={seg.d} className={f.actLine} style={{ stroke: ACT, strokeWidth: CHART.stroke }} vectorEffect="non-scaling-stroke" />
        )))}
        {/* Ганцаарчилсан хэмжилт (хоёр талдаа цоорхой) — шугамгүй; цэгийг доорх ЦЭГҮҮД давхарга зурна */}
        {physSegs.map((seg) => (seg.single ? null : (
          <path
            key={`ps-${seg.from}`}
            d={seg.d}
            className={f.physLine}
            style={{ stroke: PHYS, strokeWidth: CHART.stroke, strokeDasharray: CHART.planDash, strokeLinecap: 'butt' }}
            vectorEffect="non-scaling-stroke"
          />
        )))}

        {/* ── HOVER — босоо шугам ── */}
        {hi != null && (
          <line x1={xFor(hi)} x2={xFor(hi)} y1={padT} y2={padT + plotH} className={f.curveCursor} />
        )}

        {/* ── ЦЭГҮҮД — Environment `AreaChart`: 5px + 2px `--surface` цагираг, ҮРГЭЛЖ харагдана
            (.5; заасан сар 1, бусад.15; томруулахгүй). Биет нь зөвхөн ХЭМЖИГДСЭН сард (null ≠ 0). */}
        {rows.map((r, i) => (i <= lastGiven ? (
          <circle
            key={`gd-${i}`}
            cx={xFor(i)}
            cy={yFor(r.givenCum)}
            r={CHART.markerR + CHART.ring / 2}
            className={f.sDot}
            style={{ fill: ACT, strokeWidth: CHART.ring, opacity: dotOp(i) }}
          />
        ) : null))}
        {rows.map((r, i) => (i <= lastPhys && r.physPct != null ? (
          <circle
            key={`pd-${i}`}
            cx={xFor(i)}
            cy={yPhys(r)}
            r={CHART.markerR + CHART.ring / 2}
            className={f.sDot}
            style={{ fill: PHYS, strokeWidth: CHART.ring, opacity: dotOp(i) }}
          />
        ) : null))}

        {/* ── ЦЭГ БҮР ДЭЭР УТГА ── */}
        {rows.map((r, i) => {
          if (i > lastGiven || r.givenCum <= 0 || !givenLbl.has(i)) return null;
          const x = xFor(i);
          const y = yFor(r.givenCum);
          return (
            <g key={`gv-${i}`}>
              <text x={x} y={Math.min(padT + plotH - 4, y + 16)} className={`${f.ptVal} ${i === hi ? f.ptValOn : ''}`} textAnchor={anchorFor(i)}>
                {num(r.givenCum)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          if (i > lastPhys || r.physPct == null || !physLbl.has(i)) return null;
          const x = xFor(i);
          const y = yPhys(r);
          return (
            <g key={`ph-${i}`}>
              <text x={x} y={Math.min(padT + plotH - 4, y + 28)} className={`${f.ptVal} ${i === hi ? f.ptValOn : ''}`} textAnchor={anchorFor(i)}>
                {pct(r.physPct, 1)}
              </text>
            </g>
          );
        })}

        {/* ── X тэнхлэг — ЗӨВХӨН он сар. Хоёр хувийн мөр tooltip руу шилжсэн:
            тэдгээр нь харьцуулах биш, лавлах тоо тул байнга харагдах шаардлагагүй
            бөгөөд график доор гурван мөр эзэлж, муруйд өгөх зайг иддэг байв. */}
        {rows.map((r, i) => (axisLbl.has(i) ? (
          <text key={r.label} x={xFor(i)} y={H - 10} className={`${f.axisX} ${i === hi ? f.axisXOn : ''}`} textAnchor={anchorFor(i)}>
            {r.label}
          </text>
        ) : null))}
      </svg>

      {/* ── TOOLTIP — задаргаа бүхэлдээ энд ── */}
      {pt && hi != null && (() => {
        /* Түшиц цэг — олголт (байвал), эс бөгөөс хэмжигдсэн биет, эс бөгөөс ёроол */
        const ty = hi <= lastGiven ? yFor(pt.givenCum)
          : hi <= lastPhys && pt.physPct != null ? yPhys(pt) : padT + plotH;
        const t = (xFor(hi) - padL) / Math.max(1, plotW);
        const shift = t < 0.22 ? '0%' : t > 0.78 ? '-100%' : '-50%';
        const below = (ty / H) * 100 < 45;
        /* Сарын олголт = өссөн дүнгийн өөрчлөлт (Environment-ийн ▲/▼ мөр) */
        const d = hi > 0 ? pt.it.given : null;
        return (
          <div
            className={f.tip}
            style={{ left: xFor(hi), top: ty, transform: `translate(${shift}, ${below ? '10px' : 'calc(-100% - 10px)'})` }}
          >
            <div className={f.tipHd}>
              <span className={f.tipDot} style={{ background: ACT }} />
              <span className="num">{pt.label}</span>
            </div>
            <div className={f.tipBody}>
              <div className={f.tipMain}>
                <span className={`num ${f.tipBig}`} style={{ color: ACT }}>{pt.givenCum > 0 ? num(pt.givenCum) : '—'}</span>
                <span className={f.tipUnit}>₮ · {tr('Олгосон санхүүжилт')}</span>
              </div>
              {d != null && pt.givenCum > 0 && (
                <div className={f.tipMeta}>
                  <span className="num" style={{ color: d !== 0 ? 'var(--data)' : 'var(--ink-3)' }}>
                    {d > 0 ? '▲' : d < 0 ? '▼' : '='} {num(Math.abs(d))} ₮
                  </span>
                </div>
              )}
              {!hidePhys && (
                <p className={f.tipRow}>
                  <i className={f.tipSwDash} />
                  {/* «—» = ХЭМЖИГДЭЭГҮЙ; жинхэнэ 0% нь «0.0%» гэж гарна */}
                  {tr('Биет гүйцэтгэл')}<b className="num">{pct(pt.physPct, 1)}</b>
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ДАТА
// ═══════════════════════════════════════════════════════════

/**
 * Санхүүжилтийн бүх дата — CASHFLOW_NEW (гэрээ) + IPC (олгосон, цэвэрлэсэн) +
 * TASK_SHEET (биет гүйцэтгэл, сарын эцсийн байдлаар).
 */
export const loadFinData = cached(loadFinDataRaw, LIVE_TTL, ['HO_IPC', 'CASHFLOW_NEW', 'BAGTS_SHEET', 'HUVAARI_OBYEM'], () => planCurveComplete());

/**
 * ГЭРЭЭНИЙ БҮРТГЭЛ — НЭГ кэштэй эх (2026-08-24 аудит): урьд нь
 * `loadFinDataRaw` ба `loadFinRegister` ижил хүснэгтийг тус тусдаа
 * '*'-аар татдаг тул Нүүр (ExecKpi) · Багцын санхүү · Санхүүжилт гурвыг
 * дараалан нээхэд давхар татагдаж, 6 слотын хязгаарлагчийг дэмий эзэлдэг
 * байв.
 */
const loadCashflowNewRows = cached(
  () => queryFeatures(CASHFLOW_NEW.url, { where: CF_WORK_WHERE, outFields: ['*'], orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  LIVE_TTL,
  ['CASHFLOW_NEW'],
);
/**
 * САРЫН ЗАДАРГАА — S-муруйн төлөвлөгөө (`Cashflow_final`-ийн доторх мөрүүд).
 */
const loadCfMonthRows = cached(
  () => queryFeatures(CASHFLOW_NEW.url, {
    where: CF_MONTH_WHERE,
    outFields: ['*'],
    orderBy: `cashflow_id ASC, cashflow_start ASC, ${CASHFLOW_NEW.oid} ASC`,
  }),
  LIVE_TTL,
  ['CASHFLOW_NEW'],
);

/**
 * ХУВААРИЙН МУРУЙН МОДУЛ-ТҮВШНИЙ КЭШ — `lagOf` СИНХРОН тул үүнээс уншина.
 */
let planCurveCache: PlanCurve | null = null;
/**
 * ТӨСЛИЙН (орон сууцны) ТӨЛӨВЛӨГӨӨ — ХО дүнгээр жигнэсэн (`projectPlanOf`), `lagOf`-ийн
 * БАГЦГҮЙ (төслийн нэгтгэл) зам үүнийг уншина. `planCurveCache`-тэй ХОС бөглөгдөнө.
 */
let planProjectCache: PlanPoint[] | null = null;

/**
 * ХУВААРИЙН МУРУЙ БҮРЭН УНШИГДСАН ЭСЭХ — `loadFinData`-ийн кэшийн `keep`.
 */
export function planCurveComplete(): boolean {
  return planCurveCache != null && planCurveCache.failed.length === 0;
}

/**
 * ТУХАЙН БАГЦЫН ХУВААРИЙН МУРУЙ УНШИГДААГҮЙ ЮУ — `lagOf` `null` буцаасны ШАЛТГААНЫГ ялгана.
 */
export function planCurveMissing(key?: string | null): boolean {
  const pc = planCurveCache;
  if (!pc) return true;
  if (!pc.failed.length) return false;
  if (!key) return true;
  return PKGS.some((p) => pc.failed.includes(p.key) && bagtsKey(p.group) === key);
}

/**
 * ТӨСЛИЙН «ОРОН СУУЦНЫ» НЭГТГЭЛИЙН БАГЦУУД — `gdash.HOUSING_PKGS` (`housingMoney`-тэй НЭГ олонлог).
 */
const HOUSING_SET: ReadonlySet<string> = new Set(HOUSING_PKGS);
const housingKeys = (fin: Pick<FinData, 'phys' | 'physN'>): string[] =>
  [...new Set([...fin.phys.keys(), ...(fin.physN?.keys() ?? [])])].filter((k) => HOUSING_SET.has(k));

/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨТ ХУВИЙН ЦУВАА — бодит тал (`pkgShared.aggregateMonths`/`physNow`)-тай
 * ЯГ НЭГ жин (`gdash.pkgCostWeight` ← ижил `contracts`). PkgProg `TsKpi` + графикийн
 * төслийн муруй · удирдлагын тайлан · `lagOf` (Дашбоард, PkgFin) бүгд ЭНЭ функцээр.
 */
export function projectPlanOf(fin: Pick<FinData, 'contracts' | 'phys' | 'physN'>, pc: PlanCurve): PlanPoint[] {
  const pkgs = housingKeys(fin);
  return housingPlanSeries(pc.byBagts, pkgCostWeight(fin.contracts.map(cfWeightRow)), pc.months, pkgs);
}

export function projectPlanScope(
  fin: Pick<FinData, 'contracts' | 'phys' | 'physN'>,
  pc: PlanCurve | null = planCurveCache,
): { keys: Set<string>; excluded: string[] } | null {
  if (!pc) return null;
  const sc = planScope(pc.byBagts, pkgCostWeight(fin.contracts.map(cfWeightRow)), housingKeys(fin));
  /* PKGS-д алга (дэд бүтэц г.м.) бол «БАГЦ14» → «Багц 14» */
  const name = (k: string) => PKGS.find((p) => bagtsKey(p.group) === k)?.group ?? k.replace(/^БАГЦ/, 'Багц ');
  return { keys: sc.keys, excluded: sc.excluded.map(name) };
}

export function projectLagNow(
  fin: FinData,
  pc: PlanCurve | null,
  nowYm: string = monthKey(),
  today: string = dayKey(Date.now()),
): { planned: number | null; actual: number | null; gap: number | null; measAt: string; physAsOf: string; excluded: string[]; coverage: number | null } {
  const sc = projectPlanScope(fin, pc);
  let last: { label: string; phys: number; physAt: string | null | undefined } | null = null;
  for (const m of aggregateMonths(fin, pc)) {
    if (m.label > nowYm) continue;
    const v = m.physLag !== undefined ? m.physLag : m.phys;
    if (v != null) last = { label: m.label, phys: v, physAt: m.physLagAt !== undefined ? m.physLagAt : m.physAt };
  }
  const measAt = last ? measureDayOf(last.label, last.physAt, today) : `${nowYm}-31`;
  const plan = pc?.months.length ? projectPlanOf(fin, pc) : [];
  const planned = plan.length ? planPctAt(plan, measAt) : null;
  const actual = last ? last.phys : null;
  return {
    planned, actual,
    gap: planned != null && actual != null ? planned - actual : null,
    measAt,
    physAsOf: last ? (last.physAt ?? last.label) : '',
    excluded: sc?.excluded ?? [],
    coverage: plan.length ? planCoverage(plan) : null,
  };
}

export { planScopeNote } from '@/lib/gdash';

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд — IPC олголт + ХО дүнгээр жигнэсэн биет гүйцэтгэл.
 */
export function aggregateMonths(
  d: FinData,
  pc: PlanCurve | null = planCurveCache,
): { label: string; given: number; phys: number | null; physAt: string | null; physLag?: number | null; physLagAt?: string | null }[] {
  const labels = cfMonthAxis();
  const cost = pkgCostWeight(d.contracts.map(cfWeightRow));
  const series = housingSeries(d.phys, d.physCnt, d.physAt, cost, labels, d.physN, HOUSING_SET);
  const sc = pc ? projectPlanScope(d, pc) : null;
  const lagS = sc?.excluded.length
    ? housingSeries(d.phys, d.physCnt, d.physAt, cost, labels, d.physN, sc.keys)
    : null;
  return series.map((s, i) => {
    let given = 0;
    d.given.forEach((byMon) => { given += byMon.get(s.label) ?? 0; });
    const out: { label: string; given: number; phys: number | null; physAt: string | null; physLag?: number | null; physLagAt?: string | null } =
      { label: s.label, given, phys: s.phys, physAt: s.physAt };
    if (lagS) { out.physLag = lagS[i].phys; out.physLagAt = lagS[i].physAt; }
    return out;
  });
}

/** `physNow`-ийн кэш (2026-10-04) — доорх */
const PHYS_NOW = new WeakMap<FinData, Map<string, number | null>>();

/**
 * ТӨСЛИЙН БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — `aggregateMonths`-ийн одоогийн сар хүртэлх СҮҮЛИЙН
 * хэмжигдсэн сарын ХО дүнгээр жигнэсэн % (`gdash.housingPct`). PkgProg `TsKpi` ·
 * Дашбоард · ExecReport · «Багцын мэдээлэл» бүгд ЭНЭ туслахаас — нэг үзүүлэлт, нэг тоо.
 * Тайлагнаагүй бол `null` («мэдээлэлгүй», 0 биш).
 */
export function physNow(d: FinData, nowYm: string = monthKey()): number | null {
  const key = `${nowYm}|${monthKey()}`;
  let byKey = PHYS_NOW.get(d);
  if (!byKey) { byKey = new Map(); PHYS_NOW.set(d, byKey); }
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  let actual: number | null = null;
  for (const m of aggregateMonths(d)) {
    if (m.label > nowYm) continue;
    if (m.phys != null) actual = m.phys;
  }
  byKey.set(key, actual);
  return actual;
}

/**
 * БАГЦЫН ОЛОНЛОГИЙН БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — `physNow`-той ЯГ НЭГ томьёо (`gdash.housingSeries`: ХО дүнгээр
 * жигнэсэн, хуудастай боловч тайлагнаагүй багц 0%), зөвхөн `only` багцаар. Хэмжилтгүй бол `null` (0 биш).
 */
export function physNowOf(d: FinData, only: ReadonlySet<string>, nowYm: string = monthKey()): { pct: number; at: string } | null {
  if (!only.size) return null;
  const cost = pkgCostWeight(d.contracts.map(cfWeightRow));
  let out: { pct: number; at: string } | null = null;
  for (const s of housingSeries(d.phys, d.physCnt, d.physAt, cost, cfMonthAxis(), d.physN, only)) {
    if (s.label > nowYm) continue;
    if (s.phys != null) out = { pct: s.phys, at: s.label };
  }
  return out;
}

/** Cashflow-ийн ажлын төрөл (`CfRow.type`) — инженерийн дэд бүтэц (2026-10-22, `typePhysNow`) */
export const INFRA_TYPE = 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ';

/**
 * АЖЛЫН ТӨРЛИЙН (ангиллын) БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — тэр төрлийн мөрүүдийн багцаар (`pkgKeyOf(pkg2)`) `physNowOf`.
 */
export function typePhysNow(
  d: FinData,
  rows: Iterable<{ type: string; pkg2: string }>,
  type: string,
  nowYm: string = monthKey(),
): { pct: number; at: string } | null {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.type !== type) continue;
    const k = pkgKeyOf(r.pkg2);
    if (k && k !== '0') keys.add(k);
  }
  return physNowOf(d, keys, nowYm);
}

/**
 * «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ»-ийн биет хувь `FinData.contracts`-аас (ТҮҮХИЙ мөр — ангилал `finXlChartCat`, `gdash.loadGdashCf`-ийн
 * `CfRow.type`-тай НЭГ дүрэм) — «Гүйцэтгэл»-ийн «Төслийн төрөл» (2026-10-22, аудит). GeneralDash · удирдлагын тайлантай
 * (`typePhysNow(…, CfRow[])`) ижил тоо.
 */
export function infraPhysNow(d: FinData, nowYm: string = monthKey()): { pct: number; at: string } | null {
  const C = CASHFLOW_NEW.fields;
  return typePhysNow(
    d,
    d.contracts.map((r) => ({ type: finXlChartCat(r), pkg2: String(r[C.pkg2] ?? '').trim() })),
    INFRA_TYPE,
    nowYm,
  );
}

async function loadFinDataRaw(): Promise<FinData> {
    const [contracts, ipc, histB, universeB, histI, universeI] = await Promise.all([
      loadCashflowNewRows(),
      loadHoRows(),
      /*
       * БИЕТ ГҮЙЦЭТГЭЛ — блок бүрийн «Б.» мөрийн бүх агшин.
       */
      loadBlockHistory(),
      loadBlockUniverse(),
      loadInfraHistory(),
      loadInfraUniverse(),
      loadPlanCurveCached()
        .then((pc) => { planCurveCache = pc; })
        .catch(() => { planCurveCache = null; }),
    ]);

    /*
     * HO төлбөр → багц бүрд: сар → олгосон дүн.
     */
    /*
     * БАГЦ → ГЭРЭЭНИЙ ДҮН. Нэг багцад олон гэрээ байж болно (жиш. зураг
     * төсөл + ажил) тул НИЙЛБЭР.
     */
    const CFN = CASHFLOW_NEW.fields;
    const planTotal = new Map<string, number>();
    contracts.forEach((r) => {
      const k = pkgKeyOf(r[CFN.pkg2]) || pkgKeyOf(r[CFN.pkg]);
      if (!k || k === '0') return;
      const v = n(r[CFN.contractAmount]) || n(r[CFN.budget]);
      if (!v) return;
      planTotal.set(k, (planTotal.get(k) ?? 0) + v);
    });

    const HC = HO_IPC.contractFields;
    const HP = HO_IPC.payFields;
    const axis = cfMonthAxis();
    const first = axis[0];
    const last = axis[axis.length - 1];
    const given: GivenMap = new Map();
    const givenTotal = new Map<string, number>();
    ipc.forEach((r) => {
      const amt = hoAmount(r);
      if (amt == null || amt === 0) return;
      const k = pkgKeyOf(r[HC.pkg]);
      if (!k || k === '0') return;
      givenTotal.set(k, (givenTotal.get(k) ?? 0) + amt);
      const raw = ym(r[HP.payDate]);
      if (!raw) return; // огноогүй — цувааны гадна (дээрх)
      if (raw < first || raw > last) return;
      const mon = raw;
      const byMon = given.get(k) ?? new Map<string, number>();
      byMon.set(mon, (byMon.get(mon) ?? 0) + amt);
      given.set(k, byMon);
    });

    /*
     * Биет гүйцэтгэл → багц бүрд: сар → % (0–100).
     */
    const nowYm = monthKey();
    const hist = new Map([...histB, ...histI]);
    const universe = new Map([...universeB, ...universeI]);
    const { phys, physCnt, physAt, physN } = buildPhys(hist, axis, nowYm, universe);
    planProjectCache = planCurveCache ? projectPlanOf({ contracts, phys, physN }, planCurveCache) : null;
    return {
      contracts, planTotal, given, givenTotal, phys, physCnt, physAt, physN,
      pays: ipc,
      contractsHo: groupHo(ipc),
    };
}

/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛ — ГРАФИКГҮЙ, зөвхөн ХОЁР ХҮСНЭГТ (хэрэглэгчийн хүсэлт,
 * 2026-08-14): Cashflow (гэрээ/захирамжийн санхүүжилт /106) ба IPC (олгосон
 * акт /107). Хуучин комбо графикууд (ComboChart) энэ харагдацаас ХАСАГДСАН —
 * ComboChart нь «Багцын хяналт» (Tsogts)-д ХЭВЭЭР ашиглагдана.
 */
/** Үйлчилгээний талбарын тодорхойлолт — нэр, харагдах alias, төрөл */
type FieldDef = {
  name: string;
  alias: string;
  type: string;
  /**
   * Үйлчилгээний `codedValue` domain-ий сонголтууд — байвал нүд нь чөлөөт
   * бичвэр биш СОНГОЛТ болно.
   */
  choices?: string[];
};
type FinTables = {
  cashflow: Row[]; ipc: Row[];
  cfFields: FieldDef[]; ipcFields: FieldDef[];
  /**
   * Баганын метадата татагдсангүй (2026-09-23). Урьд нь `loadFields` алдаанд
   * `[]` буцааж, тэр хоосон жагсаалт 5 минут КЭШЛЭГДЭЖ хүснэгт баганагүй
   * харагддаг байв — шалтгаан нь хаана ч гардаггүй. Одоо тэмдэглэгдэж,
   * «Дахин оролдох» нь кэшийг хаяна.
   */
  fieldsError: boolean;
  /**
   * САРЫН ЗАДАРГАА — `Cashflow_final`-ийн доторх нэмэлт мөрүүд.
   */
  cfMonths: Row[];
  /**
   * Сарын задаргаа УНШИГДСАНГҮЙ (2026-09-29 аудит 10). Урьд нь алдаа `[]`
   * болж «сар огт үүсээгүй»-тэй ялгагдахгүй байв — хугацаа засахад БҮХ сар
   * дахин нэмэгдэж давхардан, S-муруй хоёр дахин тоологддог. `publish` энэ үед
   * сарын нийцүүлэлтийг зогсооно; «Cashflow хувиарлах» «уншигдсангүй» гэж хэлнэ.
   */
  cfMonthsError: boolean;
};

/**
 * Давхаргын талбарын метадата (`?f=json`) — alias нь хүний уншихуйц баганын нэр.
 */
async function loadFields(url: string): Promise<FieldDef[]> {
  const j = await arcgisPost<{ fields?: unknown }>(url, { f: 'json' });
  if (!Array.isArray(j?.fields)) throw new Error('fields missing');
  return j.fields.map((x: {
    name: string; alias?: string; type: string;
    domain?: { type?: string; codedValues?: { name?: string }[] };
  }) => ({
    name: x.name,
    alias: x.alias || x.name,
    type: x.type,
    choices: x.domain?.type === 'codedValue'
      ? (x.domain.codedValues ?? []).map((v) => String(v.name ?? '')).filter(Boolean)
      : undefined,
  }));
}

const loadFinRegister = cached(loadFinRegisterRaw, LIVE_TTL, ['HO_IPC', 'CASHFLOW_NEW'],
  (v) => !v.fieldsError && !v.cfMonthsError);

async function loadFinRegisterRaw(): Promise<FinTables> {
  const [cfFields, ipcFields, cashflow, ipc, cfMonths] = await Promise.all([
    loadFields(CASHFLOW_NEW.url).catch((e) => { console.warn('[selbe] cf fields:', e); return null; }),
    loadFields(HO_IPC.url).catch((e) => { console.warn('[selbe] ipc fields:', e); return null; }),
    loadCashflowNewRows(),
    loadHoRows(),
    loadCfMonthRows().catch((e) => { console.warn('[selbe] cf months:', e); return null; }),
  ]);
  return {
    cashflow: cashflow.filter((r) => !finXlRowHidden(r)),
    ipc,
    cfFields: cfFields ?? [],
    ipcFields: ipcFields ?? [],
    fieldsError: cfFields == null || ipcFields == null,
    cfMonths: cfMonths ?? [],
    cfMonthsError: cfMonths == null,
  };
}

export function Finance() {
  const q = useAsync<FinTables>(loadFinRegister, []);

  return (
    <div className={f.frame}>
      <Data q={q} loading={tr('Санхүүжилтийн бүртгэл…')}>
        {(d) => <FinTablesView d={d} onSaved={() => q.retry?.()} />}
      </Data>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ХАРАГДАЦ — мөр (гэрээ/багц) бүрд ТУСДАА график
// ═══════════════════════════════════════════════════════════

/**
 * Гэрээний мөрөөс сарын цэгүүд — IPC олголт + биет гүйцэтгэл.
 */
export function contractMonths(r: Row, fin: FinData): MonthPt[] {
  const C = CASHFLOW_NEW.fields;
  const { given, phys } = fin;
  const k2 = pkgKeyOf(r[C.pkg2]);
  const k3 = pkgKeyOf(r[C.pkg]);
  const byMon = given.get(k2) ?? given.get(k3);
  const ph = phys.get(k2) ?? phys.get(k3);
  const at = fin.physAt?.get(k2) ?? fin.physAt?.get(k3);
  const zeroPkg = !ph && !!(fin.physN?.has(k2) || fin.physN?.has(k3));
  const nowYm = zeroPkg ? monthKey() : '';
  const pkg = (phys.has(k2) ? k2 : phys.has(k3) ? k3
    : zeroPkg ? (fin.physN?.has(k2) ? k2 : k3) : (k2 || k3)) || undefined;

  return cfMonthAxis().map((label) => ({
    label,
    given: byMon?.get(label) ?? 0,
    phys: ph?.get(label) ?? (zeroPkg && label === nowYm ? 0 : null),
    physAt: at?.get(label) ?? null,
    pkg,
  }));
}

/**
 * БАГЦ БҮРИЙН САРЫН ЦЭГҮҮД — гэрээний мөрийг багцын түлхүүрээр (`pkg2` → `pkg`)
 * тааруулж НЭГ УДАА бэлдэнэ. «Гүйцэтгэл» (`PkgProg`) ба «Багцын мэдээлэл»
 * (`Bagts`) жагсаалтын БОДИТ гүйцэтгэл ба хоцрогдол ҮҮНЭЭС.
 */
export function pkgMonthsMap(fin: FinData): Map<string, MonthPt[]> {
  const C = CASHFLOW_NEW.fields;
  const m = new Map<string, MonthPt[]>();
  fin.contracts.forEach((r) => {
    const k2 = pkgKeyOf(r[C.pkg2]);
    const k3 = pkgKeyOf(r[C.pkg]);
    [k2, k3].forEach((k) => {
      if (k && !m.has(k)) m.set(k, contractMonths(r, fin));
    });
  });
  for (const [src, { key }] of Object.entries(MAP_PKG_ALIAS)) {
    const pts = m.get(src);
    if (pts && !m.has(key)) m.set(key, pts);
  }
  return m;
}

/**
 * БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — ЭНЭ САР хүртэлх хамгийн сүүлийн биет % (0–100).
 * `lagOf.actual`-тай ИЖИЛ цэг (`m.label <= nowYm && m.phys != null`).
 */
export function physLatest(months: MonthPt[] | null | undefined): number | null {
  if (!months) return null;
  const nowYm = monthKey();
  let v: number | null = null;
  for (const m of months) if (m.label <= nowYm && m.phys != null) v = m.phys;
  return v;
}

/** `lagOf`-ийн үр дүн — 2026-10-22 (аудит): `coverage` = тухайн муруйн хуваарийн хамралт (`planCoverage`, 0–100) */
export type LagPoint = { month: string; planned: number; actual: number; gap: number; coverage: number | null };

/**
 * ХОЦРОГДЛЫН ШАЛГАЛТ — БИЕТ гүйцэтгэлийн ХУВИЙГ жишнэ (дүн биш):
 * сүүлийн биет дататай сар дээр «хуваариар байх ЁСТОЙ биет %» − «бодит биет %».
 * Хоёул бөглөгдсөн үед л утга буцаана — өрөөсгөл дататай харьцуулалт хийхгүй.
 */
export function lagOf(months: MonthPt[]): LagPoint | null {
  const nowYm = monthKey();
  let mi = -1;
  months.forEach((m, i) => {
    if (m.label <= nowYm && lagPhys(m) != null) mi = i;
  });
  if (mi < 0) return null;
  const series = lagSeriesCurve(months);
  if (!series) return null;
  return lagPointAt(months[mi], series);
}

/**
 * `lagOf`-ийн ТӨЛӨВЛӨГӨӨТ МУРУЙ — `null` бол хоцрогдол мэдэгдэхгүй.
 */
function lagSeriesCurve(months: readonly MonthPt[]): PlanPoint[] | null {
  const pc = planCurveCache;
  if (!pc) return null;
  /* Багцын муруй (`pkg` тодорхой) эсвэл ТӨСЛИЙН нийт муруй (`aggregateMonths`) */
  const key = months.find((m) => m.pkg)?.pkg;
  const series = key ? pc.byBagts.get(key) : (planProjectCache ?? pc.months);
  return series?.length ? series : null;
}

/**
 * НЭГ ХЭМЖИЛТИЙН ЦЭГИЙН ХОЦРОГДОЛ. Төлөвлөгөө нь ХЭМЖИЛТ ХИЙГДСЭН тэр ӨДРИЙН байдлаар —
 * цаг хугацаагаар тэнцүү харьцуулалт (өнөөдрийн төлөвлөгөөг хуучин хэмжилтээс хасахгүй).
 */
function lagPhys(m: MonthPt): number | null {
  return m.physLag !== undefined ? m.physLag : m.phys;
}
function lagPhysAt(m: MonthPt): string | null | undefined {
  return m.physLagAt !== undefined ? m.physLagAt : m.physAt;
}

function lagPointAt(m: MonthPt, series: readonly PlanPoint[]): LagPoint | null {
  const planned = planPctAt(series, measureDayOf(m.label, lagPhysAt(m), dayKey(Date.now())));
  if (planned == null || planned <= 0) return null;
  const actual = lagPhys(m) ?? 0;
  return { month: m.label, planned, actual, gap: planned - actual, coverage: planCoverage(series) };
}

/**
 * ХОЦРОГДЛЫН САРЫН ЦУВАА — хэмжилттэй сар БҮРД `lagOf`-ийн ЯГ ижил дүрэм (муруй, өдөр,
 * `planned <= 0` алгасна). Сүүлийн элемент == `lagOf(months)` (тэр сард хуваарь эхэлсэн бол).
 */
export function lagSeriesOf(months: MonthPt[]): LagPoint[] {
  const series = lagSeriesCurve(months);
  if (!series) return [];
  const nowYm = monthKey();
  const out: LagPoint[] = [];
  for (const m of months) {
    if (m.label > nowYm || lagPhys(m) == null) continue;
    const p = lagPointAt(m, series);
    if (p) out.push(p);
  }
  return out;
}

/**
 * `lagOf` `null` БУЦААСАН ШАЛТГААН — хоцрогдол тодорхой бол `'ok'`.
 *   · `'no-phys'`    — биет хэмжилт алга;
 *   · `'no-curve'`   — хуваарийн муруй уншигдаагүй (`planCurveMissing`);
 *   · `'not-started'`— муруй уншигдсан ч энэ багцад хуваарь алга эсвэл хэмжилтийн өдөр
 *                      хараахан эхлээгүй (`planned <= 0`).
 */
export function lagReasonOf(months: MonthPt[]): 'ok' | 'no-phys' | 'no-curve' | 'not-started' {
  const nowYm = monthKey();
  if (!months.some((m) => m.label <= nowYm && m.phys != null)) return 'no-phys';
  if (lagOf(months)) return 'ok';
  const key = months.find((m) => m.pkg)?.pkg;
  if (!planCurveCache || planCurveMissing(key)) return 'no-curve';
  return 'not-started';
}

/** Хоцрогдлын зэрэглэл: ≥10% улаан, 5–10% шар, бусад нь alert биш */
export const lagLevel = (gap: number): 'red' | 'yellow' | null =>
  gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null;

/**
 * ХОЦРОГДЛЫГ ДҮГНЭЖ БОЛОХ УУ — муруй хангалттай хамарсан (`planProgress.coverageOk`, ≥ 95%).
 */
export const lagJudged = (lag: { coverage?: number | null } | null | undefined): boolean =>
  !!lag && coverageOk(lag.coverage);

/** `lagLevel` — ЗӨВХӨН дүгнэж болох хоцрогдолд (`lagJudged`), эс бөгөөс `null` (2026-10-22) */
export const lagLevelOf = (lag: { gap: number; coverage?: number | null } | null | undefined): 'red' | 'yellow' | null =>
  (lag && lagJudged(lag) ? lagLevel(lag.gap) : null);

/**
 * `Cashflow_ID` — хоосон бол `null`.
 */
const cfIdOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/* ═══ САРЫН МӨНГӨНИЙ ЭХ — «Гараар» / «Хуваарь» (2026-10-26, `monthlyMoney`-ийн толгой) ═══ */

/** Тооцоолсон ('huvaari') сарын СИНТЕТИК мөрийн тэмдэг — OID-гүй, засагдахгүй */
const HUV_ROW = '__huv';

/** Сарын мөр → `monthlyMoney`-ийн оролт (`gdash.CfPlanRow`) — `CashflowPlan.manualOf`-тэй ижил дүрэм */
const manualCfRows = (rows: readonly Row[]) => rows
  .map((r) => {
    const amt = r[CF_MONTH.amount];
    const pc = r[CF_MONTH.pct];
    const numOr = (v: unknown) => (v == null || String(v).trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
    return { id: cfIdOf(r[CF_MONTH.id]) ?? -1, start: cfIdOf(r[CF_MONTH.start]), pct: numOr(pc), amount: numOr(amt) };
  })
  .filter((r) => r.id > 0 && r.start != null);

/**
 * 5-р түвшний сарын дэд мөрд утгаа харуулах багана мөн эсэх (`cashflow_*`).
 */
export const isCfMonthCol = (name: string): boolean => name.toLowerCase().startsWith('cashflow_');

/**
 * Тооцоолсон сарын мөнгө → 5-р түвшний синтетик сарын мөр (гараар мөрийн талбарын нэрээр).
 * `Cashflow_huwi` = дүн ÷ ХО дүн × 100 (0–100, гараар мөрийн нэгж); ХО дүнгүй бол null («—», 0 биш).
 * `start`/`end` — тэр сарын 1 ба сүүлийн өдрийн UTC үд дунд (`publish`-ийн бичилтийн конвенц).
 */
export function huvMonthRows(money: MonthlyMoney | null | undefined): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  if (!money) return out;
  for (const c of money.contracts.values()) {
    if (c.source !== SRC_HUVAARI) continue;
    out.set(c.id, [...c.months.keys()].sort().map((k) => {
      const [y, mo] = k.split('-').map(Number);
      const amount = c.months.get(k)!;
      return {
        [HUV_ROW]: true,
        [CF_MONTH.id]: c.id,
        [CF_MONTH.start]: Date.UTC(y, mo - 1, 1, 12),
        [CF_MONTH.end]: Date.UTC(y, mo, 0, 12),
        [CF_MONTH.pct]: c.cost != null ? (amount / c.cost) * 100 : null,
        [CF_MONTH.amount]: amount,
      };
    }));
  }
  return out;
}


/* ═══════════════════════════════════════════════════════════
   ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ — Excel (261007 V3)-ийн үндсэн хуудас (2026-10-26) */

/** Ачаалагч — динамик импорт (импорт) */
const loadProjectPlanLazy = (): Promise<ProjectPlan> =>
  import('@/lib/projectPlanInputs').then((m) => m.loadProjectPlan());

type PpKind = 'money' | 'w' | 'date' | 'pct';
type PpCol = { k: Exclude<keyof PlanValues, 'status'>; label: string; kind: PpKind; title?: string };
type PpGroup = { label: string | null; cols: PpCol[] };

/**
 * Excel-ийн үндсэн хуудасны баганууд (E…W), дарааллаар нь.
 */
function ppGroups(): PpGroup[] {
  const pctCol = (k: PpCol['k'], label: string, title?: string): PpCol => ({ k, label, kind: 'pct', title });
  return [
    { label: null, cols: [{ k: 'E', label: tr('Урьдчилсан төсөвт өртөг'), kind: 'money' }] },
    { label: null, cols: [{ k: 'F', label: tr('Хэсэгт эзлэх'), kind: 'w' }] },
    { label: null, cols: [{ k: 'G', label: tr('Төсөлд эзлэх'), kind: 'w' }] },
    { label: tr('Гэрээ (хавсралт 5)'), cols: [{ k: 'H', label: tr('Эхлэх'), kind: 'date' }, { k: 'I', label: tr('Дуусах'), kind: 'date' }] },
    { label: tr('Гүйцэтгэгч · төлөвлөгөөт'), cols: [{ k: 'L', label: tr('Эхлэх'), kind: 'date' }, { k: 'M', label: tr('Дуусах'), kind: 'date' }] },
    { label: tr('ОСНАУГ / Газар чөлөөлөлт · бодит'), cols: [{ k: 'J', label: tr('Эхлэх'), kind: 'date' }, { k: 'K', label: tr('Дуусах'), kind: 'date' }] },
    {
      label: tr('Төлөвлөгөөт хувь'),
      cols: [pctCol('N', tr('Гэрээ')), pctCol('O', tr('Газар чөлөөлөлт')), pctCol('P', tr('Гүйцэтгэгч'))],
    },
    { label: null, cols: [pctCol('Q', tr('Ирэх долоо хоног'), '+7')] },
    { label: null, cols: [pctCol('R', tr('Өмнө долоо хоног'), '−7')] },
    { label: null, cols: [pctCol('S', tr('Гүйцэтгэлийн хувь'))] },
    {
      label: tr('Биелэлт'),
      cols: [
        pctCol('T', tr('Гэрээ'), 'S / N'), pctCol('U', tr('Газар чөлөөлөлт'), 'S / O'),
        pctCol('V', tr('Гүйцэтгэгч'), 'S / P'), pctCol('W', tr('Өмнө долоо хоног'), 'S / R'),
      ],
    },
  ];
}

const ppFmt = (kind: PpKind, v: number | null): string => {
  if (kind === 'money') return num(v);
  if (kind === 'w') return pct(v, 2);
  if (kind === 'date') return date(v);
  return pct(v, 1);
};

const ppStatusText = (s: BlockStatus): string =>
  s === 'done' ? tr('Дууссан') : s === 'started' ? tr('Эхэлсэн') : tr('Эхлээгүй');

/**
 * «Төсөл төлөвлөгөө биелэлт» таб — ачаалагч.
 */
function ProjectPlanView(props: {
  works: Row[];
  months: Row[];
  monthsError: boolean;
  canSwitch: boolean;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const q = useAsync<ProjectPlan>(loadProjectPlanLazy, []);
  return (
    <section className={`${f.reg} ${f.ppReg}`}>
      <Data q={q} loading={tr('Төсөл төлөвлөгөө тооцоолж байна…')}>
        {(plan) => (plan.empty ? (
          <Empty
            label={tr('Төсөл төлөвлөгөөний өгөгдөл хараахан импортлогдоогүй')}
            hint={tr('Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг Cashflow хүснэгтэд импортлоход энд шатлалтай харагдана.')}
          />
        ) : <ProjectPlanTable plan={plan} {...props} />)}
      </Data>
    </section>
  );
}

export function ProjectPlanTable({
  plan, works, months, monthsError, canSwitch, canEdit = false, onSaved,
}: {
  plan: ProjectPlan;
  works: Row[];
  months: Row[];
  monthsError: boolean;
  canSwitch: boolean;
  /** Гараар оруулах утга засах, мөр нэмэх/устгах (`finEdit`) */
  canEdit?: boolean;
  onSaved: () => void;
}) {
  const { tree, result } = plan;
  const groups = useMemo(() => ppGroups(), []);
  const cols = useMemo(() => groups.flatMap((g) => g.cols), [groups]);

  /** Д/Д — модны байрлалаас (толгой) */
  const ddOf = useMemo(() => {
    const m = new Map<PlanNode, string>();
    const go = (n: PlanNode, pre: string) => n.children.forEach((c, i) => {
      const s = pre ? `${pre}.${i + 1}` : String(i + 1);
      m.set(c, s);
      go(c, s);
    });
    go(tree.root, '');
    return m;
  }, [tree]);
  const maxDepth = useMemo(() => tree.nodes.reduce((a, n) => Math.max(a, n.depth), 1), [tree]);

  /**
   * ЭВХЭЛТ — Excel-ийн outline: түвшин (`lvl`, тэр гүн хүртэл дэлгэнэ) + мөр бүрийн гар солилт (`tog`, `index`-ээр).
   */
  const [lvl, setLvl] = useState(2);
  const [tog, setTog] = useState<Map<number, boolean>>(new Map());
  const isOpen = (n: PlanNode) => tog.get(n.index) ?? n.depth < lvl;
  const setLevel = (v: number) => { setLvl(v); setTog(new Map()); };
  const toggle = (n: PlanNode) => setTog((m) => new Map(m).set(n.index, !isOpen(n)));

  /**
   * ХАРАГДАЦ ба ШҮҮЛТ (2026-10-30): «Бүрэн хүснэгт» — Excel-ийн бүх багана; «Мэдээлэл оруулах» — зөвхөн гараар
   * оруулах утгууд. Шүүлт идэвхтэй бол тохирсон мөр + өвөг нь (эвхэлтийг үл тоомсорлоно).
   */
  const [mode, setMode] = useState<'full' | 'entry'>('full');
  const [flt, setFlt] = useState<PlanFilter>(NO_FILTER);
  const [adding, setAdding] = useState<PlanNode | null>(null);
  const cutoff = useMemo(() => importCutoff(plan.stored ?? tree.nodes.map((n) => n.row!)), [plan.stored, tree]);
  const pkgOpts = useMemo(() => pkgOptions(tree), [tree]);
  const filtering = filterActive(flt);
  const keep = useMemo(() => (filtering ? filterPlan(tree, flt) : null), [filtering, tree, flt]);

  const vis: PlanNode[] = [];
  const walk = (n: PlanNode) => {
    for (const c of n.children) {
      vis.push(c);
      if (c.children.length && isOpen(c)) walk(c);
    }
  };
  if (keep) vis.push(...tree.nodes.filter((n) => keep.has(n)));
  else walk(tree.root);

  /* ── Сарын мөнгөний эх — мөнгөний мөр (`cashflow_id`) бүрд ── */
  const F = CASHFLOW_NEW.fields;
  const workBy = useMemo(() => {
    const m = new Map<number, Row>();
    for (const w of works) {
      const id = cfIdOf(w[CF_MONTH.id]);
      if (id != null && !m.has(id)) m.set(id, w);
    }
    return m;
  }, [works]);
  /**
   * Гэрээ бүрийн ГАРААР сарын мөрийн тоо ба нийт ₮ (`Cashflow_dun`) — батлуулах цонхны «N сарын мөр (нийт X) устана».
   */
  const monthCnt = useMemo(() => {
    const m = new Map<number, { n: number; total: number | null }>();
    for (const r of months) {
      const id = cfIdOf(r[CF_MONTH.id]);
      if (id == null) continue;
      const c = m.get(id) ?? { n: 0, total: null };
      c.n += 1;
      const raw = r[CF_MONTH.amount];
      const v = raw == null || String(raw).trim() === '' ? null : Number(raw);
      if (v != null && Number.isFinite(v)) c.total = (c.total ?? 0) + v;
      m.set(id, c);
    }
    return m;
  }, [months]);

  const [busyId, setBusyId] = useState<number | null>(null);
  const busyRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /**
   * «ГАРААР → ХУВААРЬ» — гараар сарын мөр УСТАНА, буцаахгүй. Шалгалт (эрх · мөнгөний мөр ганц · багц хуудастай ·
   * үе шат · атом бичилт · алдагдсан хариуг дахин уншиж батлах) бүгд `switchToHuvaari` дотор.
   */
  const doSwitch = async (id: number, w: Row) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const pkgText = String(w[F.pkg] ?? '').trim() || '—';
    const ajil = String(w.ajil_uilchilgee ?? '').trim() || '—';
    const mc = monthCnt.get(id);
    setErr(null);
    setMsg(null);
    try {
      const fl = await confirmAndSwitch({
        cashflowId: id,
        name: tr('{0} · {1} (Cashflow_ID {2})', pkgText, ajil, id),
        pkg: pkgKeyOf(w[F.pkg]),
        phase: w[F.phase],
        manualRows: mc?.n ?? 0,
        manualTotal: mc?.total ?? null,
        money: mnt,
        ask: askConfirm,
        onBusy: (b) => setBusyId(b ? id : null),
      });
      if (fl.kind === 'refused') { setErr(fl.msg); return; }
      if (fl.kind === 'cancel') return;
      const r = fl.result;
      setMsg(r.already ? tr('Аль хэдийн Хуваарь эхтэй') : tr('Хуваарь руу шилжүүлэв · {0} сарын мөр устгав', r.deleted));
      onSaved();
    } catch (e) {
      setErr(userError(e));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const moneyCell = (n: PlanNode) => {
    const id = n.row?.cashflow_id;
    if (id == null) return <td className={f.ppMoney} />;
    const w = workBy.get(id);
    if (!w) {
      return <td className={f.ppMoney} title={tr('Гэрээний бүртгэлд Cashflow_ID {0} мөр алга', id)}>—</td>;
    }
    const huv = monthSourceOf(w[F.monthSource]) === SRC_HUVAARI;
    const srcText = huv ? tr('Хуваарь') : tr('Гараар');
    const pkgOk = PKG_KEYS.has(pkgKeyOf(w[F.pkg]));
    const why = !pkgOk
      ? tr('Энэ гэрээний багцад Хуваарийн бөглөх хуудас алга — шилжүүлэх боломжгүй')
      : switchPhaseWhy(w[F.phase])
        ?? (monthsError ? tr('Сарын задаргаа уншигдсангүй — хуудсыг дахин ачаална уу') : undefined);
    return (
      <td className={f.ppMoney}>
        <span className={`${f.ppSrc} ${huv ? f.ppSrcHuv : ''}`} title={tr('Сарын мөнгө: {0}', srcText)}>{srcText}</span>
        {canSwitch && !huv && (
          <button
            type="button"
            className={f.ppSwitch}
            disabled={busyId != null || !!why}
            title={why}
            onClick={() => void doSwitch(id, w)}
          >
            {busyId === id ? tr('Шилжүүлж байна…') : tr('Хуваарь руу шилжүүлэх')}
          </button>
        )}
      </td>
    );
  };

  const rowCls = (n: PlanNode): string => [
    n.depth === 1 ? f.ppL1 : n.depth === 2 ? f.ppL2 : '',
    n.blok ? f.ppBlk : '',
    n.outside ? f.ppOut : '',
  ].filter(Boolean).join(' ');

  const valCells = (v: PlanValues | undefined, blk: boolean) => cols.map((c) => {
    const x = v ? v[c.k] : null;
    const st = c.k === 'S' && blk && v?.status ? v.status : null;
    return (
      <td key={c.k} className={`${f.cellNum} ${c.kind === 'date' ? f.ppDate : ''}`} title={st ? ppStatusText(st) : undefined}>
        {st && <i className={`${f.ppDot} ${st === 'done' ? f.ppDone : st === 'started' ? f.ppOn : f.ppNot}`} aria-hidden />}
        {ppFmt(c.kind, x)}
      </td>
    );
  });

  /* ── Гараар оруулах утга · мөр нэмэх/устгах ── */
  const onSaveVal = async (n: PlanNode, k: PlanEditKey, v: unknown): Promise<boolean> => {
    setErr(null);
    setMsg(null);
    try {
      await savePlanValue(n, k, v);
      setMsg(tr('Хадгаллаа: {0} · {1}', n.code, EDIT_LABEL[k]()));
      return true;
    } catch (e) {
      setErr(userError(e));
      return false;
    }
  };
  const doDelete = async (n: PlanNode) => {
    const name = String(n.row?.ajil_uilchilgee ?? '').trim();
    setErr(null);
    setMsg(null);
    if (!(await askConfirm(tr('«{0} {1}» мөрийг устгах уу? Устгасныг буцаах боломжгүй.', n.code, name), { danger: true, ok: tr('Устгах') }))) return;
    try {
      await deletePlanRow(n, cutoff);
      setMsg(tr('Мөр устгалаа: {0}', n.code));
    } catch (e) {
      setErr(userError(e));
    }
  };

  const nameCell = (n: PlanNode) => {
    const kids = n.children.length > 0;
    const open = kids && isOpen(n);
    return (
      <td className={`${f.ppFz2} ${f.ppName}`} title={n.row?.ajil_uilchilgee ?? undefined}>
        <span className={f.ppIndent} style={{ paddingLeft: (n.depth - 1) * 14 }}>
          {kids && !keep ? (
            <button
              type="button"
              className={f.ppCaret}
              aria-expanded={open}
              aria-label={open ? tr('Хумих') : tr('Дэлгэх')}
              onClick={() => toggle(n)}
            >{open ? '−' : '+'}</button>
          ) : <i className={f.ppCaretSp} aria-hidden />}
          {n.row?.ajil_uilchilgee || '—'}
        </span>
      </td>
    );
  };

  /** Баганын шүүлтийн мөр — Багц · Ажлын нэр бүх харагдацад, утгын (хоосон/утгатай) шүүлт «Мэдээлэл оруулах»-д */
  const fillSel = (k: PlanEditKey) => (
    <th key={k} className={f.ppHd}>
      <select
        className={f.ppFltIn}
        aria-label={tr('{0} — шүүх', EDIT_LABEL[k]())}
        value={flt.fill[k] ?? 'all'}
        onChange={(e) => setFlt((x) => ({ ...x, fill: { ...x.fill, [k]: e.target.value as FillFilter } }))}
      >
        <option value="all">{tr('Бүгд')}</option>
        <option value="empty">{tr('Хоосон')}</option>
        <option value="filled">{tr('Утгатай')}</option>
      </select>
    </th>
  );
  const filterRow = (rest: ReactNode) => (
    <tr className={f.ppFlt}>
      <th className={`${f.ppFz0} ${f.ppNo}`} />
      <th className={`${f.ppFz1} ${f.ppPkg}`}>
        <select
          className={f.ppFltIn}
          aria-label={tr('Багцаар шүүх')}
          value={flt.pkg}
          onChange={(e) => setFlt((x) => ({ ...x, pkg: e.target.value }))}
        >
          <option value="">{tr('Бүгд')}</option>
          {pkgOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </th>
      <th className={`${f.ppFz2} ${f.ppName}`}>
        <input
          type="search"
          className={f.ppFltIn}
          placeholder={tr('Ажлын нэр эсвэл Д/Д')}
          aria-label={tr('Ажлын нэрээр шүүх')}
          value={flt.name}
          onChange={(e) => setFlt((x) => ({ ...x, name: e.target.value }))}
        />
      </th>
      {rest}
    </tr>
  );

  const rootV = result.values.get(tree.root);
  return (
    <>
      <header className={f.regHd}>
        <h2>{tr('Төсөл төлөвлөгөө биелэлт')}</h2>
        <span>{tr('{0}-ний байдлаар · {1} мөр', date(result.today), num(tree.nodes.length))}</span>
      </header>
      <div className={f.ppBar}>
        <div className={f.tabs} role="group" aria-label={tr('Харагдац')}>
          <button
            type="button"
            aria-pressed={mode === 'full'}
            className={`${f.tab} ${mode === 'full' ? f.tabOn : ''}`}
            onClick={() => setMode('full')}
          >{tr('Бүрэн хүснэгт')}</button>
          <button
            type="button"
            aria-pressed={mode === 'entry'}
            className={`${f.tab} ${mode === 'entry' ? f.tabOn : ''}`}
            onClick={() => setMode('entry')}
          >{tr('Мэдээлэл оруулах')}</button>
        </div>
        {filtering && (
          <button type="button" className={f.tab} onClick={() => setFlt(NO_FILTER)}>{tr('Шүүлт арилгах')}</button>
        )}
        <span className={f.ppBarLbl}>{tr('Түвшин')}</span>
        <div className={f.tabs} role="group" aria-label={tr('Түвшин')}>
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={lvl === v && tog.size === 0}
              className={`${f.tab} ${lvl === v && tog.size === 0 ? f.tabOn : ''}`}
              onClick={() => setLevel(v)}
            >
              {v === maxDepth ? tr('Бүгд') : String(v)}
            </button>
          ))}
        </div>
        {err && <p role="alert" className={f.editErr}>{err}</p>}
        {msg && <p role="status" className={f.editOk}>{msg}</p>}
      </div>
      {plan.failed.length > 0 && (
        <p role="status" className={f.ppWarn}>
          {tr('Зарим эх уншигдсангүй ({0}) — холбогдох мөрүүд «—».', planFailedLabels(plan.failed).join(', '))}
        </p>
      )}
      {tree.issues.length > 0 && (
        <details className={f.ppIssues}>
          <summary>{tr('Бүтцийн анхааруулга: {0}', num(tree.issues.length))}</summary>
          <ul>{tree.issues.slice(0, 200).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </details>
      )}
      {adding && canEdit && (
        <AddRowsPanel
          key={adding.index}
          tree={tree}
          parent={adding}
          onClose={() => setAdding(null)}
          onDone={(k) => { setAdding(null); setErr(null); setMsg(tr('{0} мөр нэмлээ', k)); }}
        />
      )}
      {keep && !vis.length && <p role="status" className={f.ppWarn}>{tr('Шүүлтэд тохирох мөр алга')}</p>}
      {mode === 'entry' ? (
      <div className={f.ppWrap}>
        <table className={`${f.tbl} ${f.ppTbl}`}>
          <thead>
            <tr>
              <th className={`${f.ppFz0} ${f.ppNo}`}>{tr('Д/Д')}</th>
              <th className={`${f.ppFz1} ${f.ppPkg}`}>{tr('Багц')}</th>
              <th className={`${f.ppFz2} ${f.ppName}`}>{tr('Ажлын нэр')}</th>
              <th className={f.ppHd}>{tr('Хэсэгт эзлэх')}</th>
              {PLAN_EDIT_KEYS.map((k) => <th key={k} className={f.ppHd}>{EDIT_LABEL[k]()}</th>)}
              {canEdit && <th className={f.ppHd}>{tr('Үйлдэл')}</th>}
            </tr>
            {filterRow(<>
              <th />
              {PLAN_EDIT_KEYS.map(fillSel)}
              {canEdit && <th />}
            </>)}
          </thead>
          <tbody>
            {vis.map((n) => {
              const r = n.row!;
              const v = result.values.get(n);
              const why = canEdit && MANUAL_PHASES.has(n.phase) ? addWhy(tree, n) : null;
              return (
                <tr key={n.index} className={rowCls(n)}>
                  <td className={`${f.ppFz0} ${f.ppNo}`}>{ddOf.get(n)}</td>
                  <td className={`${f.ppFz1} ${f.ppPkg}`}>{n.blok ?? (r.bagts || '')}</td>
                  {nameCell(n)}
                  <td className={f.cellNum}>{pct(v?.F ?? null, 2)}</td>
                  {PLAN_EDIT_KEYS.map((k) => (
                    <PlanEditCell
                      key={k} n={n} k={k} canEdit={canEdit} onSave={onSaveVal} onError={setErr}
                      value={k === 'pct' ? v?.S ?? null : r[PLAN_EDIT[k].key]}
                    />
                  ))}
                  {canEdit && (
                    <td className={f.ppAct}>
                      {MANUAL_PHASES.has(n.phase) && (
                        <button
                          type="button"
                          className={f.ppMini}
                          disabled={!!why}
                          title={why ?? tr('Энэ мөрийн доор дэд мөр нэмэх')}
                          onClick={() => setAdding(n)}
                        >{tr('Дэд мөр')}</button>
                      )}
                      {deleteWhy(n, cutoff) == null && (
                        <button type="button" className={`${f.ppMini} ${f.ppMiniBad}`} onClick={() => void doDelete(n)}>
                          {tr('Устгах')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : (
      <div className={f.ppWrap}>
        <table className={`${f.tbl} ${f.ppTbl}`}>
          <thead>
            <tr>
              <th rowSpan={2} className={`${f.ppFz0} ${f.ppNo}`}>{tr('Д/Д')}</th>
              <th rowSpan={2} className={`${f.ppFz1} ${f.ppPkg}`}>{tr('Багц')}</th>
              <th rowSpan={2} className={`${f.ppFz2} ${f.ppName}`}>{tr('Ажлын нэр')}</th>
              {groups.map((g, gi) => (g.label
                ? <th key={gi} colSpan={g.cols.length} className={f.ppGrp}>{g.label}</th>
                : <th key={gi} rowSpan={2} className={f.ppHd} title={g.cols[0].title}>{g.cols[0].label}</th>))}
              <th rowSpan={2} className={f.ppHd}>{tr('Сарын мөнгө')}</th>
            </tr>
            <tr>
              {groups.filter((g) => g.label).flatMap((g) => g.cols).map((c) => (
                <th key={c.k} className={f.ppHd} title={c.title}>{c.label}</th>
              ))}
            </tr>
            {filterRow(<>
              {cols.map((c) => <th key={c.k} />)}
              <th />
            </>)}
          </thead>
          <tbody>
            <tr className={f.ppTot}>
              <td className={`${f.ppFz0} ${f.ppNo}`} />
              <td className={`${f.ppFz1} ${f.ppPkg}`} />
              <td className={`${f.ppFz2} ${f.ppName}`}>{tr('Төслийн нийт')}</td>
              {valCells(rootV, false)}
              <td className={f.ppMoney} />
            </tr>
            {vis.map((n) => {
              const r = n.row!;
              const v = result.values.get(n);
              return (
                <tr key={n.index} className={rowCls(n)}>
                  <td className={`${f.ppFz0} ${f.ppNo}`}>{ddOf.get(n)}</td>
                  <td className={`${f.ppFz1} ${f.ppPkg}`}>{n.blok ?? (r.bagts || '')}</td>
                  {nameCell(n)}
                  {valCells(v, !!n.blok)}
                  {moneyCell(n)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <p className={f.ppFoot}>
        {mode === 'entry'
          ? tr('Гараар оруулах утгууд: нүдийг дарж засаад Enter дарна. Барилга угсралт ба газар чөлөөлөлтийн гүйцэтгэл системээс бодогддог тул засагдахгүй.')
          : tr('Хувь 0–100; «—» = мэдээлэлгүй (0 биш). Гүйцэтгэгчийн төлөвлөгөө: блок → Хуваарь, бусад → огнооны хооронд жигд. Биелэлт = гүйцэтгэл ÷ төлөвлөгөө.')}
      </p>
    </>
  );
}

/** Санхүүжилтийн табууд */
type FinTab = 'ipc' | 'plan' | 'proj';

/**
 * Санхүүжилт — Cashflow ба IPC-ийн БҮРЭН хүснэгт (график огт байхгүй).
 */
function FinTablesView({ d, onSaved }: { d: FinTables; onSaved: () => void }) {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCaps(() => setTick((n) => n + 1)), []);
  void tick;
  const canEdit = hasCap(user?.username, 'finEdit');
  const canSwitch = hasCap(user?.username, CF_SWITCH_CAP);

  /**
   * САРЫН МӨНГӨ — 'huvaari' гэрээний тооцоолсон сарууд (`monthlyMoney`).
   */
  const srcField = CASHFLOW_NEW.fields.monthSource;
  const huvIds = useMemo(() => {
    const s = new Set<number>();
    for (const w of d.cashflow) {
      const id = cfIdOf(w[CF_MONTH.id]);
      if (id != null && monthSourceOf(w[srcField]) === SRC_HUVAARI) s.add(id);
    }
    return s;
  }, [d.cashflow, srcField]);
  const hasHuv = huvIds.size > 0;
  const moneyQ = useAsync<MonthlyMoney | null>(
    () => (hasHuv ? loadMonthlyMoney(manualCfRows(d.cfMonths)) : Promise.resolve(null)),
    [hasHuv, d.cfMonths],
  );
  const money: MonthlyMoney | null | undefined = !hasHuv ? null : moneyQ.state === 'ready' ? moneyQ.data : undefined;

  /**
   * Урьд нь Cashflow (76 мөр) ба IPC (90 мөр) нэг хуудсанд дараалж
   * зурагддаг байв. Хоёулаа дотроо хоёр тэнхлэгээр гүйдэг тул хуудас
   * бүхэлдээ гурван өөр гүйлгэлттэй болж, доод хүснэгтийг олохын тулд
   * дээдийг нь өнгөрөх шаардлагатай байлаа. Нэг мөчид НЭГ хүснэгт.
   */
  const [tab, setTab] = useState<FinTab>('proj');
  const planDirty = useRef(false);
  const onPlanDirty = useCallback((v: boolean) => { planDirty.current = v; setFinNavDirty('plan', v); }, []);
  const switchTab = async (t: FinTab) => {
    if (t === tab) return;
    if (tab === 'plan' && planDirty.current
      && !(await askConfirm(tr('Cashflow хувиарлалтад хадгалаагүй засвар байна. Таб солибол алдагдана. Үргэлжлүүлэх үү?'), { danger: true, ok: tr('Таб солих') }))) return;
    setTab(t);
  };

  return (
    <>
      <header className={f.pageHd}>
        {d.fieldsError && (
          <p role="status" style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--warn)' }}>
            {tr('Баганын мэдээлэл ачаалагдсангүй')}{' '}
            <button type="button" className={f.tab} onClick={() => invalidate('CASHFLOW_NEW', 'HO_IPC')}>
              {tr('Дахин оролдох')}
            </button>
          </p>
        )}
        {/* Хүснэгт солих — идэвхтэй нь дүүргэлттэй */}
        <div className={f.tabs} role="tablist" style={{ marginLeft: 'auto' }} onKeyDown={(e) => tabFocusNav(e)}>
          <button
            type="button"
            role="tab"
            tabIndex={tab === 'proj' ? 0 : -1}
            aria-selected={tab === 'proj'}
            className={`${f.tab} ${tab === 'proj' ? f.tabOn : ''}`}
            onClick={() => void switchTab('proj')}
          >
            {tr('Төсөл төлөвлөгөө биелэлт')}
          </button>
          <button
            type="button"
            role="tab"
            tabIndex={tab === 'ipc' ? 0 : -1}
            aria-selected={tab === 'ipc'}
            className={`${f.tab} ${tab === 'ipc' ? f.tabOn : ''}`}
            onClick={() => void switchTab('ipc')}
          >
            {tr('Төлбөрийн акт (IPC)')}
          </button>
          <button
            type="button"
            role="tab"
            tabIndex={tab === 'plan' ? 0 : -1}
            aria-selected={tab === 'plan'}
            className={`${f.tab} ${tab === 'plan' ? f.tabOn : ''}`}
            onClick={() => void switchTab('plan')}
          >
            {tr('Cashflow хувиарлах')}
          </button>
        </div>
      </header>

      {tab === 'proj' ? (
      <ProjectPlanView
        key="proj"
        works={d.cashflow}
        months={d.cfMonths}
        monthsError={d.cfMonthsError}
        canSwitch={canSwitch}
        canEdit={canEdit}
        onSaved={onSaved}
      />
      ) : tab === 'plan' ? (
      <CashflowPlan
        key="plan"
        canEdit={canEdit}
        works={d.cashflow}
        months={d.cfMonths}
        monthsError={d.cfMonthsError}
        onSaved={onSaved}
        onDirty={onPlanDirty}
        canSwitch={canSwitch}
        money={money}
      />
      ) : (
      <IpcTable contracts={groupHo(d.ipc)} />
      )}
    </>
  );
}


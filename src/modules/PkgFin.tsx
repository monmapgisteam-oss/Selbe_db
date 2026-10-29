'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';

import { Section, Note, Data, Empty, Loading, Rows, Bars, Donut, List, ListItem } from '@/components/ui';
import {
  buildPacks, PackKpi, InvestCard, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import { useBuildings, pickedBuilding } from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, ComboChart, lagOf, lagLevelOf, lagJudged, projectPlanScope, planScopeNote, type FinData,
} from '@/modules/Finance';
import { coverageNote } from '@/lib/planProgress';
import { useAsync, type Async } from '@/lib/useAsync';
import { HUE, catOf, aggregateMonths, type PackCat } from '@/modules/pkgShared';
import { housingSeries, pkgCostWeight, cfWeightRow, contractedScope, gapPts } from '@/lib/gdash';
import { FIN_PKG_ALIAS, rangePaysOf, type RangePay } from '@/lib/pkgAlias';
import {
  BUILDING, CASHFLOW_NEW, HO_IPC, LAYER_BY_ID, pkgKeyOf, bagtsKey,
  zoneWhere,
  hoAmount, hoPayCode } from '@/lib/services';
import { cat, date, mnt, num, pct, monthKey, NO_DATA } from '@/lib/format';

/**
 * ОЛГОГДООГҮЙ ҮЛДЭГДЭЛ ₮ — `Math.max(0, гэрээ − олголт)` тул 0 нь ЖИНХЭНЭ «бүрэн төлөгдсөн».
 */
const remainMnt = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : v === 0 ? tr('0 ₮') : mnt(v);
import { hoTotals } from '@/lib/ipc';
import { paidShareOf, type PaidShare } from '@/lib/paidShare';
import { PackLayers } from '@/components/PackLayers';
import { readParam, writeParams } from '@/lib/urlState';
import o from './pkgFinOv.module.css';
import f from './finance.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import ts from './pkgFin.module.css';

/**
 * БАРИЛГЫН ЦОГЦ ХЯНАЛТ — «Багцын мэдээлэл» + «Барилгын хяналт» + «Санхүүжилт»
 * ГУРВЫГ НЭГ дэлгэцэд нэгтгэсэн, карт бүр ЗУРГИЙГ ТОЙРСОН чөлөөт бүтэцтэй:
 *
 *   · ДЭЭР  — багц СОНГОГЧ + сонгосон багцын KPI хавтангууд
 *   · ЗҮҮН  — гэрээ/төсөв (эсвэл ХО) ба эх үүсвэрийн картууд
 *   · ТӨВ   — газрын зураг; БАРИЛГА ДАРАХАД баруун картууд тухайн барилгын
 *             хяналт болж солигдоно («‹ Багц руу буцах»)
 *   · БАРУУН— блок бүрийн гүйцэтгэл ба ажлын төрлийн задаргаа
 *   · ДООР  — санхүүгийн график БҮТЭН өргөнөөр (төлөвлөгөө·олгосон·биет + badge)
 */

/** Дараалал нь дэлгэцийн дараалал; нэрийг render үед tr()-ээр авна */
const PACK_CATS: { key: PackCat; name: () => string }[] = [
  { key: 'build', name: () => tr('Барилга угсралт') },
  { key: 'infra', name: () => tr('Инженерийн дэд бүтэц') },
  { key: 'soc', name: () => tr('Нийгмийн барилга') },
  { key: 'site', name: () => tr('Өндөржилт') },
];
/**
 * ӨМНӨХ ОНД ШИЛЖҮҮЛСЭН нийт ₮ — ЗӨВХӨН ТӨСЛИЙН нэгдсэн дүн.
 */

/* ══════════════ НЭГ БАГЦ ↔ ОЛОН ГЭРЭЭ (2026-09-04) ══════════════ */

/**
 * Гэрээний мөрөөс БАГЦ-хэмжээст Map-ийн (given · givenTotal · phys) ЭХ ТҮЛХҮҮР.
 */
const pkgSrcKey = (
  r: FinData['contracts'][number],
  map: Map<string, unknown>,
): string | null => {
  const C = CASHFLOW_NEW.fields;
  const k2 = pkgKeyOf(r[C.pkg2]);
  const k3 = pkgKeyOf(r[C.pkg]);
  return map.has(k2) ? k2 : map.has(k3) ? k3 : null;
};

/**
 * НЭГ БАГЦЫН БҮХ ГЭРЭЭГ нэг сарын цуваа болгон НЭГТГЭНЭ.
 */
function mergePkgMonths(
  rows: FinData['contracts'],
  d: FinData,
): ReturnType<typeof contractMonths> | null {
  if (!rows.length) return null;
  if (rows.length === 1) return contractMonths(rows[0], d);
  const given = new Map<string, number>();    // сар → олгосон ₮
  const seenGiven = new Set<string>();
  const seenPhys = new Set<string>();
  rows.forEach((r) => {
    const ms = contractMonths(r, d);
    const givenK = pkgSrcKey(r, d.given);
    const givenNew = givenK != null && !seenGiven.has(givenK);
    if (givenNew) seenGiven.add(givenK);
    /* Эх түлхүүрийн давхардал `Set`-ээр хасагдана — хоёр гэрээ нэг эхэд унавал нэг л удаа */
    const physK = pkgSrcKey(r, d.phys) ?? (d.physN ? pkgSrcKey(r, d.physN) : null);
    if (physK != null) seenPhys.add(physK);
    for (const m of ms) {
      if (!given.has(m.label)) given.set(m.label, 0);
      if (givenNew) given.set(m.label, (given.get(m.label) ?? 0) + m.given);
    }
  });
  const physKey = seenPhys.size === 1 ? [...seenPhys][0] : undefined;

  /* «YYYY-MM» тул үсгэн эрэмбэ = цаг хугацааны эрэмбэ */
  const labels = [...given.keys()].sort();
  const only = <V,>(src: Map<string, V>): Map<string, V> =>
    new Map([...seenPhys].flatMap((k) => { const v = src.get(k); return v ? [[k, v] as const] : []; }));
  const cost = pkgCostWeight(d.contracts.map(cfWeightRow));
  const series = housingSeries(only(d.phys), only(d.physCnt), only(d.physAt), cost, labels,
    d.physN ? only(d.physN) : undefined);
  return series.map((s) => ({
    label: s.label,
    given: given.get(s.label) ?? 0,
    phys: s.phys,
    physAt: s.physAt,
    pkg: physKey,
  }));
}

/**
 * Багцын ОЛГОСОН НИЙТ дүн (₮) — гэрээ БҮРЭЭР, эх түлхүүрийн давхардлыг хасаж.
 */
/**
 * САНХҮҮ ↔ ГАЗРЫН ЗУРГИЙН БАГЦЫН ХОЛБООС (2026-09-15, хэрэглэгч: «холболт
 * байвал хий»).
 *
 * Санхүүгийн хүснэгтүүд (`Cashflow_0909`, `HO_IPC`) ба газрын зургийн
 * давхарга (`Test0911S`) ИЖИЛ ажлыг ӨӨР дугаараар бичдэг. Эдгээр мөр ямар ч
 * багцад холбогдохгүй тул тэр багц «санхүү бүртгэлгүй» эсвэл «—» харагддаг байв.
 */

/**
 * Санхүүгийн өгөгдлийг холбоостой хувилбар болгоно — хуудасны БҮХ хэсэг
 * (жагсаалт, KPI, карт, сарын график, төлбөрийн жагсаалт) нэг л тоо харуулна.
 */
function aliasFin(d: FinData): FinData {
  const C = CASHFLOW_NEW.fields;
  const HC = HO_IPC.contractFields;
  const hits = (m: Map<string, unknown>) => [...m.keys()].some((k) => k in FIN_PKG_ALIAS);
  if (!hits(d.planTotal) && !hits(d.givenTotal)) return d;

  type R = FinData['contracts'][number];
  const reRow = (r: R, field: string): R => {
    const a = FIN_PKG_ALIAS[pkgKeyOf(r[field])];
    return a ? { ...r, [field]: a.label, __bagtsSrc: String(r[field] ?? '') } : r;
  };
  const tgt = (k: string) => FIN_PKG_ALIAS[k]?.key ?? k;
  const mergeNum = (m: Map<string, number>) => {
    const out = new Map<string, number>();
    m.forEach((v, k) => { const t = tgt(k); out.set(t, (out.get(t) ?? 0) + v); });
    return out;
  };
  const mergeMon = <T,>(m: Map<string, Map<string, T>>, add: ((a: T, b: T) => T) | null) => {
    const out = new Map<string, Map<string, T>>();
    m.forEach((mon, k) => {
      const t = tgt(k);
      const cur = out.get(t);
      if (!cur) { out.set(t, new Map(mon)); return; }
      mon.forEach((v, ym) => {
        const was = cur.get(ym);
        if (add && was !== undefined) cur.set(ym, add(was, v));
        else if (!cur.has(ym)) cur.set(ym, v);
      });
    });
    return out;
  };

  return {
    ...d,
    contracts: d.contracts.map((r) => {
      const x = reRow(r, C.pkg2);
      return C.pkg === C.pkg2 ? x : reRow(x, C.pkg);
    }),
    pays: d.pays.map((r) => reRow(r, HC.pkg)),
    planTotal: mergeNum(d.planTotal),
    givenTotal: mergeNum(d.givenTotal),
    given: mergeMon(d.given, (a, b) => a + b),
    phys: mergeMon(d.phys, null),
    physCnt: mergeMon(d.physCnt, null),
    physAt: mergeMon(d.physAt, null),
  };
}

function pkgGivenTotal(rows: FinData['contracts'], d: FinData): number {
  const seen = new Set<string>();
  let s = 0;
  for (const r of rows) {
    const k = pkgSrcKey(r, d.givenTotal);
    if (k == null || seen.has(k)) continue;
    seen.add(k);
    s += d.givenTotal.get(k) ?? 0;
  }
  return s;
}

/**
 * «ОЛГОСОН ХУВЬ» — олгосон ÷ гэрээлсэн дүн × 100 (0–100), гэрээлсэн дүн 0 бол `null`.
 */
export const paidPctOf = (given: number, contract: number): number | null =>
  contract > 0 ? (given / contract) * 100 : null;

/**
 * БАГЦ БҮРИЙН САНХҮҮЖИЛТ — «Багц бүрийн санхүүжилт» жагсаалт ба дээд KPI-тай
 * ЯГ ИЖИЛ тооцоо, React-гүй ЦЭВЭР функц.
 */
export function pkgFinRows(packs: Pack[], raw: FinData): {
  rows: {
    key: string; label: string; plan: number; given: number; pct: number | null;
    /**
     * ГЭРЭЭЛСЭН ДҮН — ЗӨВХӨН `note === CONTRACTED` («Гэрээлсэн дүн») мөрийн
     * `geree_dun` нийлбэр (2026-09-21). `plan` нь `geree_dun || ho_dun_geree`
     * тул гэрээгүй багцад ч ТӨСВӨӨР бөглөгддөг — «гэрээ байгуулагдсан» гэж
     * уншиж болохгүй. Удирдлагын тайлан (§3/§4) гэрээт ба гэрээгүй багцыг
     * ЭНЭ хоёр талбараар ялгана.
     */
    contract: number;
    contracted: boolean;
    rangePaid?: string;
  }[];
  /** Төслийн нийт — `TsKpi`-тай ижил: гэрээний нийлбэр ба олгосон нийлбэр */
  planTotal: number;
  givenTotal: number;
} {
  const d = aliasFin(raw);
  const C = CASHFLOW_NEW.fields;
  const rowsByKey = new Map<string, FinData['contracts']>();
  d.contracts.forEach((r) => {
    const k2 = pkgKeyOf(r[C.pkg2]);
    const k3 = pkgKeyOf(r[C.pkg]);
    [...new Set([k2, k3])].forEach((k) => {
      if (!k || k === '0') return;
      const arr = rowsByKey.get(k) ?? [];
      arr.push(r);
      rowsByKey.set(k, arr);
    });
  });
  const rangeOf = new Map<string, string>();
  for (const rp of rangePaysOf(raw.pays)) for (const k of rp.members) if (!rangeOf.has(k)) rangeOf.set(k, rp.label);
  const rows = packs
    .map((p) => {
      const list = rowsByKey.get(p.key);
      if (!list) return null;
      const plan = d.planTotal.get(p.key) ?? 0;
      const given = pkgGivenTotal(list, d);
      if (plan <= 0 && given <= 0) return null;
      const rangePaid = given === 0 ? rangeOf.get(p.key) : undefined;
      const scope = contractedScope(list);
      const contract = scope.amount;
      const contracted = scope.keys.size > 0 || scope.amount > 0;
      return {
        key: p.key, label: tr(p.name), plan, given,
        pct: rangePaid ? null : paidPctOf(given, contracted ? contract : 0),
        contract, contracted,
        ...(rangePaid ? { rangePaid } : {}),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.given - a.given);
  let planTotal = 0;
  d.planTotal.forEach((v) => { planTotal += v; });
  let givenTotal = 0;
  d.givenTotal.forEach((v) => { givenTotal += v; });
  return { rows, planTotal, givenTotal };
}

/**
 *   · `fin`  — гэрээ, CASHFLOW, олгосон санхүүжилт, хөрөнгө оруулалт
 *   · `prog` — биет явц, блокийн төлөв, давхцал, барилгын хяналт
 *
 * Багцын жагсаалт, газрын зураг, өгөгдөл ачаалалт нь ХОЁУЛАНД ижил тул
 * хуваалцагдана — салгасан нь ЗӨВХӨН дээд индикатор ба баруун баганын карт.
 */
export function PkgFin({ dim, setDim }: {
  dim: Dim;
  setDim: (d: Dim) => void;
}) {
  /**
   * Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   */
  const { hostRef: sideHostRef, ...side } = useSideResize('pkgFin');
  const q = useBuildings();
  const finRaw = useAsync<FinData>(loadFinData, []);
  const finRawData = finRaw.state === 'ready' ? finRaw.data : null;
  const finAliased = useMemo(() => (finRawData ? aliasFin(finRawData) : null), [finRawData]);
  const finQ = useMemo<Async<FinData>>(
    () => (finAliased && finRaw.state === 'ready' ? { ...finRaw, data: finAliased } : finRaw),
    [finRaw, finAliased],
  );
  const projShare = useMemo<PaidShare | null>(
    () => (finRawData ? paidShareOf(finRawData.contracts, finRawData.pays) : null),
    [finRawData],
  );
  const { zoomToWhere, setHighlight } = useMap();

  /** Сонгосон багц — Bagts-тай ижил `?pkg=` параметрээр хуваалцагдана */
  const [sel, setSel] = useState<string | null>(() => readParam('pkg'));

  useEffect(() => { setHighlight(null); }, [setHighlight]);
  useEffect(() => { writeParams({ pkg: sel }); }, [sel]);

  const packs = useMemo<Pack[]>(
    () => buildPacks(q.state === 'ready' ? q.data.rows : null),
    [q],
  );

  const active = packs.find((p) => p.key === sel) ?? null;

  /*
   *    1. ТАЙЛБАРГҮЙ ҮЛДСЭН. Тоон индикатор нь 2026-08-21-нд эндээс хасагдаж
   *       «Багц N — блокууд» картын толгойд нүүсэн боловч тэр карт
   *       (`BlocksCard`) нь ЗӨВХӨН «Багцын гүйцэтгэл» талд зурагддаг. Үр
   *       дүнд санхүүгийн зурагт улаан анивчсан полигон гарч ирдэг ч юуных
   *       болохыг хэлэх тоо ч, шошго ч байхгүй байв.
   *
   *    2. СЭДЭВ НЬ ЗӨРСӨН. Чөлөөлөгдөөгүй талбар нь АЖИЛ ЭХЛҮҮЛЭХЭД саад —
   *       биет явцын ойлголт. Энэ давхарга мөнгөн дүн огт агуулаагүй (газрын
   *       үнэлгээ нь `GAZAR_BUILDING.NIIT_UNE`, «Газар чөлөөлөлт» харагдацад).
   *       `finOnly` тугийн дүрэм: санхүүгийн цонхонд гүйцэтгэл харагдахгүй.
   *
   *    3. ҮНЭТЭЙ. `overlapLeftParcels` нь блокийн давхарга + дэд бүтцийн ~48
   *       багцын геометрийг татаж, мянган хэсгээр орон зайн огтлолцол бодуулна.
   *       Уншигдахгүй үр дүнгийн төлөө төлөх ёсгүй зардал.
   *
   *    Саадын мэдээлэл «Багцын гүйцэтгэл» талдаа тоо, тайлбар, дарж очих
   *    товчтойгоо БҮРЭН хэвээр — энд давхардуулах шаардлагагүй.
   */

  /**
   * САНХҮҮГИЙН КАРТЫН ӨНДӨР — картын дээд ирмэгийн бариулаар чирч тохируулна
   * (2026-08-21, хэрэглэгчийн хүсэлт). ДЭЭШ чирвэл график өндөрсөж, газрын
   * зургийн мөр (1fr) агшина. localStorage-д хадгалагдана; давхар товшилт —
   * анхны хэмжээ. SplitGrip-ийн хэвтээ хувилбартай ижил зарчим, гэхдээ SVG-д
   * өндөр нь prop тул CSS хувьсагч бус React төлөв (график цөөн элементтэй
   * тул чирэлтийн re-render хямд).
   */
  const [finH, setFinH] = useState(FIN_H0);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(FIN_H_LS));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(v) && v >= FIN_H_MIN && v <= FIN_H_MAX) setFinH(v);
    } catch { /* хувийн горим */ }
  }, []);
  const finGripDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = finH;
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      // Дээш чирэх = өндөрсөх (дэлгэцийн Y доош өсдөг тул хасна)
      setFinH(Math.min(FIN_H_MAX, Math.max(FIN_H_MIN, Math.round(h0 - (ev.clientY - y0)))));
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.removeEventListener('lostpointercapture', up);
      grip.blur();
      setFinH((h) => {
        try { localStorage.setItem(FIN_H_LS, String(h)); } catch { /* хувийн горим */ }
        return h;
      });
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    /* capture алдагдсан ч чирэлт ЗААВАЛ дуусна — эс бөгөөс төлөв гацна */
    grip.addEventListener('lostpointercapture', up);
  };
  const finGripReset = () => {
    setFinH(FIN_H0);
    try { localStorage.removeItem(FIN_H_LS); } catch { /* хувийн горим */ }
  };

  /**
   * Багц → тухайн багцад ХАМААРАХ БҮХ гэрээний мөр.
   */
  const rowsByKey = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    const C = CASHFLOW_NEW.fields;
    const rowsByKey = new Map<string, FinData['contracts']>();
    finQ.data.contracts.forEach((r) => {
      const k2 = pkgKeyOf(r[C.pkg2]);
      const k3 = pkgKeyOf(r[C.pkg]);
      /* Дэд ба үндсэн түлхүүр ИЖИЛ байвал (БАГЦ-7: pkg = pkg2) нэг гэрээ
         жагсаалтад ХОЁР УДАА орж, хуваарь давхар тоологдоно — `Set` хаана. */
      [...new Set([k2, k3])].forEach((k) => {
        if (!k || k === '0') return;
        const arr = rowsByKey.get(k) ?? [];
        arr.push(r);
        rowsByKey.set(k, arr);
      });
    });
    return rowsByKey;
  }, [finQ]);

  /**
   * Багц бүрийн САНХҮҮГИЙН сарын цэгүүд. Жагсаалтын ГРАФИК болон хоцрогдлын
   * alert үүнээс тооцогдоно.
   */
  const finMap = useMemo(() => {
    if (!rowsByKey || finQ.state !== 'ready') return null;
    const m = new Map<string, ReturnType<typeof contractMonths>>();
    rowsByKey.forEach((rows, k) => {
      const ms = mergePkgMonths(rows, finQ.data);
      if (ms) m.set(k, ms);
    });
    return m;
  }, [rowsByKey, finQ]);

  /**
   * Багц → ОЛГОСОН НИЙТ дүн (₮).
   */
  const givenMap = useMemo(() => {
    if (!rowsByKey || finQ.state !== 'ready') return null;
    const d = finQ.data;
    const m = new Map<string, number>();
    rowsByKey.forEach((rows, k) => { m.set(k, pkgGivenTotal(rows, d)); });
    return m;
  }, [rowsByKey, finQ]);

  /**
   * Багц → ГЭРЭЭЛСЭН ДҮН (₮) — «олгосон хувь»-ийн хуваарь (`paidPctOf`).
   */
  /**
   * ОЛОН БАГЦ ХАМАРСАН олголт (HO «БАГЦ-10, БАГЦ-11, БАГЦ-13, БАГЦ-15» 5.09 · «Багц-1-4» 0.88 тэрбум).
   */
  const ranges = useMemo<RangePay[]>(
    () => (finQ.state === 'ready' ? rangePaysOf(finQ.data.pays) : []),
    [finQ],
  );
  const rangeOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of ranges) for (const k of r.members) if (!m.has(k)) m.set(k, r.label);
    return m;
  }, [ranges]);

  const contractMap = useMemo(() => {
    if (!rowsByKey) return null;
    const m = new Map<string, number>();
    rowsByKey.forEach((rows, k) => { m.set(k, contractedScope(rows).amount); });
    return m;
  }, [rowsByKey]);

  /**
   * Багц → ГЭРЭЭНИЙ ТҮҮХИЙ МӨР (CASHFLOW_NEW).
   */
  const finRow = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    const C = CASHFLOW_NEW.fields;
    const m = new Map<string, (typeof finQ.data.contracts)[number]>();
    finQ.data.contracts.forEach((r) => {
      [pkgKeyOf(r[C.pkg2]), pkgKeyOf(r[C.pkg])].forEach((k) => {
        if (k && k !== '0' && !m.has(k)) m.set(k, r);
      });
    });
    return m;
  }, [finQ]);

  /**
   * СОНГОСОН БАГЦЫН САНХҮҮ — төлөвлөгөө ба олгосон ₮.
   *
   * `null` = ачаалж байна · дүн 0 = гэрээ бүртгэгдээгүй.
   */
  const activeFin = useMemo(() => {
    if (!givenMap || finQ.state !== 'ready') return null;
    const d = finQ.data;
    if (active) {
      return {
        plan: d.planTotal.get(active.key) ?? 0,
        given: givenMap.get(active.key) ?? 0,
        contract: contractMap?.get(active.key) ?? 0,
        givenContracted: givenMap.get(active.key) ?? 0,
      };
    }
    let plan = 0;
    let given = 0;
    d.planTotal.forEach((v) => { plan += v; });
    d.givenTotal.forEach((v) => { given += v; });
    return { plan, given, contract: projShare?.contract ?? 0, givenContracted: projShare?.paidContracted ?? 0 };
  }, [givenMap, contractMap, active, finQ, projShare]);

  /**
   * ALERT-тэй (төлөвлөгөөнөөс хоцорсон) багцууд — ТУСДАА бүлэг болж жагсаалтын
   * ХАМГИЙН ДЭЭР гарна. Гүйцэтгэл хэвийн болмогц lag арилж, багц өөрийн
   * бүлэгтээ аяндаа буцна (тусгай төлөв хадгалахгүй).
   */
  const alertKeys = useMemo(() => new Set<string>(), []);

  /** Багц → гэрээний нийт дүн, ₮ — жагсаалт ба картуудын «төлөвлөгөө» багана */
  const planMap = useMemo(
    () => (finQ.state === 'ready' ? finQ.data.planTotal : null),
    [finQ],
  );
  const alerted = useMemo(() => packs.filter((p) => alertKeys.has(p.key)), [packs, alertKeys]);



  /**
   * ХОЦРОГДОЛТОЙ багцуудын блокийн шүүлт — багц СОНГООГҮЙ үед газрын зураг дээр
   * ЗӨВХӨН эдгээр багцын блок харагдана (анхаарал татах). Хоцрогдолгүй бол
   * (эсвэл багц сонгосон бол) энэ хэрэглэгдэхгүй.
   */
  const alertedWhere = useMemo(() => {
    const oids = alerted
      .filter((p) => p.kind === 'build')
      .flatMap((p) => p.blocks.map((b) => b.oid));
    return oids.length ? `${BUILDING.oid} IN (${oids.join(',')})` : null;
  }, [alerted]);

  const [visible, setVisible] = useLayerPicks(active ? active.layerIds : [BLOCK_LAYER]);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  useZoomToFilter({ zone });

  /**
   * ЗУРАГТ ӨГӨХ жагсаалт — каталогийн сонголт шууд.
   */
  const mapVisible = visible;

  const layerWhere = useMemo<Record<string, string | null>>(
    () => {
      const w: Record<string, string | null> = {};
      if (zone) {
        for (const id of mapVisible) {
          const d = LAYER_BY_ID[id];
          if (d) w[id] = zoneWhere(d, zone);
        }
      }
      // Багц сонгосон → тэр багц; эс бөгөөс → зөвхөн хоцрогдолтой багцын блокууд
      w[BLOCK_LAYER] = active?.where ?? alertedWhere;
      return w;
    },
    [active, alertedWhere, zone, mapVisible],
  );

  /** Багц солих — барилгын сонголт цуцлагдана (өөр багцын барилга үлдэхгүй) */
  const pick = useCallback((k: string | null) => {
    setSel(k);
    setHighlight(null);
  }, [setHighlight]);

  /** Зураг дээрх барилга дарах → баруун талд тухайн барилгын хяналт */
  /* useCallback — inline функц render бүрд шинэ лавлагаа болж memo(MapCanvas)-ыг
     эвддэг (Iot-д 2026-08-24-нд илэрсэн ижил ангиллын алдаа). setPb/setHighlight
     хоёул тогтвортой тул хамаарал [setHighlight]. */
  const onMapPick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    const b = pickedBuilding(attrs, layerId);
    if (!b) {
      pick(null);
      return;
    }
    const k = bagtsKey(b.bagts);
    /* Багц нь тодорхойлогдохгүй барилга (bagts талбар хоосон) — сонголтыг
       цэвэрлэнэ. Юу ч хийхгүй орхивол даралт «мэдрэгдээгүй» мэт болно. */
    pick(packs.find((x) => x.key === k)?.key ?? null);
  }, [packs, pick]);

  /**
   * Сонгосон багц руу нисэх.
   *
   * Багц ХОЁР ТӨРӨЛТЭЙ (`buildPacks`):
   *   · `build` — давхарга нь БҮХ блокийн нэг давхарга, багцыг нь `where`
   *     (блокийн OID жагсаалт) ялгана;
   *   · `infra` — ДАВХАРГА нь өөрөө багц, тиймээс `where` нь `null`.
   *
   * `??` гинж нь дэд бүтцийн багцын `null`-ыг `alertedWhere` руу унагаадаг
   * байлаа — тэр нь БАРИЛГЫН блокийн OID-ууд. Өөр давхаргын OID-аар шүүх тул
   * үр дүн хоосон буцаж, зураг огт хөдөлдөггүй байв.
   *
   * Одоо: багц сонгосон бол `where` нь ЗӨВХӨН тухайн багцынх (байхгүй бол
   * давхарга бүхэлдээ); `alertedWhere` нь зөвхөн багц СОНГООГҮЙ үед хүчинтэй.
   */
  useEffect(() => {
    if (active) {
      const id = active.layerIds[0];
      if (id) zoomToWhere(id, active.where ?? '1=1');
      return;
    }
    zoomToWhere(BLOCK_LAYER, alertedWhere ?? '1=1');
  }, [active, alertedWhere, zoomToWhere]);

  const loading = q.state === 'loading';
  const errQ: Async<unknown> | null = q.state === 'error' ? q : null;
  const finErr: Async<unknown> | null = finQ.state === 'error' ? finQ : null;

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={sideHostRef}
      className={`${ts.pack} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ── ДЭЭР: индикаторууд — сонголтгүй үед төслийн 6 үзүүлэлт
          (2026-08-21, хэрэглэгчийн жагсаалтаар); багц сонгоход тухайн
          багцын KPI хэвээр ── */}
      <div className={ts.kpi}>
        {errQ ? null : loading ? <Loading /> : finErr ? (
          <Empty label={tr('Санхүүгийн өгөгдөл уншигдсангүй')} />
        ) : active ? (
          <PackKpi active={active} packs={packs} fin={activeFin} />
        ) : (
          <TsKpi packs={packs} fin={finQ.state === 'ready' ? finQ.data : null} share={projShare} />
        )}
      </div>

      {/* ── ЗҮҮН: багцын жагсаалт ── */}
      <aside className={ts.list}>
        <h2 className={o.colHead}>{tr('Багц')}</h2>
        {errQ ? (
          <Section title={tr('Багцууд')}><Data q={errQ}>{() => null}</Data></Section>
        ) : loading ? (
          <Section title={tr('Багцууд')}><Loading /></Section>
        ) : (
          <>
            <p className={ts.srcNote}>
              {tr('Санхүүгийн хоцрогдол тооцогдохгүй — гэрээнд сарын төлбөрийн хуваарь байхгүй. Доорх жагсаалт нь олгосон дүнгээр эрэмбэлэгдсэн.')}
            </p>
            {/* ДӨРВӨН АНГИЛЛААР (2026-08-21) — барилга угсралт · дэд бүтэц ·
                нийгмийн барилга · өндөржилт; alert-тэй нь дээрх бүлэгт */}
            {PACK_CATS.map((c) => (
              <TsPackList
                key={c.key}
                title={c.name()}
                mode={c.key === 'infra' ? 'layers' : 'fin'}
                note={c.key === 'infra' ? tr('давхарга · гэрээний дүнгийн %') : tr('олгосон · гэрээний дүнгийн %')}
                givenMap={givenMap}
                planMap={planMap}
                contractMap={contractMap}
                finFailed={finErr != null}
                packs={packs.filter((p) => catOf(p) === c.key && !alertKeys.has(p.key))}
                sel={sel}
                onSel={pick}
                finMap={finMap}
                rangeOf={rangeOf}
              />
            ))}
            {ranges.length > 0 && (
              <Section title={tr('Хэд хэдэн багцад олгосон')} note={tr('багц тус бүрд хуваагдаагүй')}>
                <List>
                  {ranges.map((r) => (
                    <ListItem key={r.label} title={r.label} sub={tr('{0} багц', num(r.members.length))} value={mnt(r.amount)} color={cat(0)} />
                  ))}
                </List>
              </Section>
            )}
            <Note>
              {tr('Багц сонгоход баруунд гэрээ/төсөв, эх үүсвэр, төлбөр, доор санхүүгийн график гарна. Зураг дээрх барилга дарахад тухайн багц сонгогдоно.')}
            </Note>
          </>
        )}
      </aside>

      {/* ── ТӨВ: зураг ── */}
      <div className={ts.map}>
        <MapCanvas
          dim={dim}
          visible={mapVisible}
          opacity={opacity}
          zone={zone}
          layerWhere={layerWhere}
          uniform
          onPick={onMapPick}
        />

        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        />

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="monitor"
              visible={visible}
              setVisible={setVisible}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
              zone={zone}
              embedded
            />
          </div>
        )}

        {opOpen && (
          <OpacityPanel
            visible={visible}
            opacity={opacity}
            setOpacity={setOpacity}
            onClose={() => setOpOpen(false)}
          />
        )}

        <div className={o.packLegend}>
          {active?.kind === 'infra'
            ? active.layerIds.map((id) => (
              <span key={id} className={o.packLegendItem}>
                <i style={{ background: LAYER_BY_ID[id].hue } as CSSProperties} />
                {LAYER_BY_ID[id].title}
              </span>
            ))
            /* Зураг гүйцэтгэл заахгүй тул түвшний тайлбар ч гарахгүй —
               эс бөгөөс байхгүй утгыг тайлбарлана. */
            : (
              <span className={o.packLegendItem}>
                <i style={{ background: HUE } as CSSProperties} />
                {tr('Багцын блок')}
              </span>
            )}
        </div>
      </div>

      {/* ── БАРУУН нэг багана: барилга дарсан бол ХЯНАЛТ, эс бөгөөс гэрээ+эх үүсвэр ── */}
      <div className={ts.r}>
        {errQ ? (
          <Data q={errQ}>{() => null}</Data>
        ) : finErr ? (
          <>
            {active?.kind === 'infra' && <InvestCard p={active} />}
            <Data q={finErr}>{() => null}</Data>
          </>
        ) : !active ? (
          /* Багц сонгоогүй — ТӨСЛИЙН НЭГДСЭН: гэрээ/төсөв · эх үүсвэр · төлөв · блок гүйцэтгэл */
          <>
            <CatChart packs={packs} givenMap={givenMap} planMap={planMap} contractMap={contractMap} finOnly />
            <PkgFinList packs={packs} givenMap={givenMap} planMap={planMap} contractMap={contractMap} />
          </>
        ) : active.kind === 'build' ? (
          <>
            <PkgFinCard p={active} fin={activeFin} />
            <PkgFinDetail row={finRow?.get(active.key) ?? null} loading={!finRow} />
            <PkgPays p={active} finQ={finQ} />
            <PkgMonths p={active} finMap={finMap} />
          </>
        ) : (
          /* Дэд бүтцийн багц — хөрөнгө оруулалт ба гэрээний задаргаа */
          <>
            <InvestCard p={active} />
            <PkgFinDetail row={finRow?.get(active.key) ?? null} loading={!finRow} />
            <PkgPays p={active} finQ={finQ} />
            <PkgMonths p={active} finMap={finMap} />
          </>
        )}
      </div>

      {/* ── ДООД ГОЛ: санхүүгийн график (багц сонгоогүй бол ТӨСЛИЙН НЭГДСЭН) ── */}
      <div className={ts.fin}>
        {/* Өндрийн бариул — картын ДЭЭД ирмэг: дээш чирвэл график томорно */}
        <button
          type="button"
          className={ts.finGrip}
          role="separator"
          aria-orientation="horizontal"
          aria-label={tr('Графикийн өндөр')}
          title={tr('Чирж өндрийг тохируулна · давхар товшвол анхны хэмжээ')}
          onPointerDown={finGripDown}
          onDoubleClick={finGripReset}
        />
        <FinCard p={active} finQ={finQ} projShare={projShare} chartH={finH} finOnly />
      </div>
    </div>
  );
}

/**
 * БАГЦЫН ЖАГСААЛТ (Tsogts хувилбар) — МӨНГӨН ДҮН БИШ, ГҮЙЦЭТГЭЛИЙН ХУВИЙГ
 * харуулж, төлөвлөгөөнөөс хоцорсон багцад ALERT (улаан/шар) өгнө:
 *   · build багц — биет гүйцэтгэлийн % (блокийн дундаж)
 *   · infra багц — санхүүгийн гүйцэтгэл % (олгосон/гэрээний дүн, CASHFLOW_NEW+IPC)
 * Хоцрогдол = Finance-ийн lagOf дүрэм (CF өссөн төлөвлөгөө vs биет %).
 */
/**
 * ДЭЭД ИНДИКАТОРУУД (2026-08-21, хэрэглэгчийн жагсаалтаар) — багц сонгоогүй
 * үеийн төслийн нэгдсэн 6 үзүүлэлт. Хувиуд нь доод графиктай ИЖИЛ аргачлал
 * (`aggregateMonths`) тул хоёр газрын тоо зөрөхгүй.
 */
function TsKpi({ packs, fin, share }: {
  packs: Pack[];
  fin: FinData | null;
  share: PaidShare | null;
}) {
  const t = useMemo(() => {
    if (!fin || !share) return null;
    const months = aggregateMonths(fin);
    const nowYm = monthKey();
    const lag = lagOf(months);
    const planned: number | null = lag ? lag.planned : null;
    let actual: number | null = null;
    for (const m of months) {
      if (m.label > nowYm) continue;
      if (m.phys != null) actual = m.phys;
    }
    const gap = lag ? lag.gap : null;
    const given = hoTotals(fin.pays).paid;
    const givenContracted = share.paidContracted;
    return {
      planned, actual, gap, given,
      share: share.pct,
      /** Олгогдоогүй үлдэгдэл ₮ — 2026-10-04: ГЭРЭЭЛСЭН − гэрээлсэн багцын олголт (удирдлагын
          тайлангийн `fin.remain`-тэй нэг); урьд нь төлөвлөгөө (гэрээ ЭСВЭЛ төсөв) − багцын олголт */
      remain: given == null ? null : Math.max(0, share.contract - givenContracted),
    };
  }, [fin, share]);
  const items = [
      { v: num(packs.length), l: tr('нийт төслийн тоо'), h: tr('Багцын бүртгэлд буй бүх багц ажил — гэрээ, санхүүжилт бүртгэгдээгүй багц ч орно') },
      { v: t == null ? '…' : mnt(t.given), l: tr('олгосон санхүүжилт') },
      { v: t == null ? '…' : t.share == null ? '—' : pct(t.share, 1), l: tr('олгосон — гэрээний дүнгийн %') },
      { v: t == null ? '…' : remainMnt(t.remain), l: tr('олгогдоогүй үлдэгдэл') },
  ];
  return (
    <>
      {items.map((i) => (
        /* Нэг аяс (--data) — өнгөөр ялгах утга биш, зэрэгцсэн нэг эгнээ */
        <div key={i.l} className={o.tile} style={{ '--tone': 'var(--data)' } as CSSProperties}>
          <span className={`${o.tileVal} num`} title={'h' in i && i.h ? i.h : i.v}><b>{i.v}</b></span>
          <span className={o.tileLabel}>{i.l}</span>
        </div>
      ))}
    </>
  );
}

/**
 * «Багц 6.5 · …» → [6, 5]. Дугааргүй нэр хамгийн сүүлд.
 */
const pkgNum = (name: string): [number, number] => {
  const m = /Багц\s*(\d+)(?:[.-](\d+))?/i.exec(name);
  return m ? [Number(m[1]), m[2] ? Number(m[2]) : 0] : [9999, 0];
};

function TsPackList({
  title, note, packs, sel, onSel, finMap, planMap, givenMap, contractMap, mode = 'fin', finFailed = false, rangeOf,
}: {
  title: string;
  /**
   * Багц → ОЛОН БАГЦ ХАМАРСАН олголтын мөр (`pkgAlias.rangePaysOf`) — 2026-10-04.
   */
  rangeOf?: ReadonlyMap<string, string>;
  note: string;
  /**
   * Санхүүгийн өгөгдөл УНАСАН (2026-09-25). `planMap` нь `null` үед мөр бүр
   * «санхүү бүртгэлгүй» гэж ХУДАЛ бичигддэг байв — ачаалж буй бол «…»,
   * унасан бол «санхүү уншигдсангүй».
   */
  finFailed?: boolean;
  /**
   * МӨРИЙН АГУУЛГА.
   *   `fin`    — олгосон ₮ / гэрээ ₮ ба хувь (анхдагч).
   *   `layers` — «Багцын гүйцэтгэл»-ийн ИЖИЛ мөр: давхаргын тоо, олгосон ÷ гэрээ
   *              хувь (2026-09-15), багцын дугаараар эрэмбэ,
   *              дарахад давхаргууд задарна (`PackLayers`).
   */
  mode?: 'fin' | 'layers';
  packs: Pack[];
  sel: string | null;
  onSel: (k: string | null) => void;
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
  /** Багц → гэрээний нийт дүн, ₮ (`FinData.planTotal`) */
  planMap: Map<string, number> | null;
  /**
   * Багц → олгосон НИЙТ дүн, ₮ — огноогүй актыг ч багтаасан (`givenMap`).
   */
  givenMap: Map<string, number> | null;
  /**
   * Багц → ГЭРЭЭЛСЭН ДҮН, ₮ (`gdash.contractedScope`) — «олгосон хувь»-ийн хуваарь.
   */
  contractMap: Map<string, number> | null;
}) {
  if (!packs.length) return null;
  const layers = mode === 'layers';
  const rows = packs
    .map((p) => {
      const months = finMap?.get(p.key) ?? null;
      const plan = planMap?.get(p.key) ?? 0;
      const given = givenMap
        ? (givenMap.get(p.key) ?? 0)
        : (months ? months.reduce((a, m) => a + m.given, 0) : 0);
      const contract = contractMap?.get(p.key) ?? 0;
      const shared = given <= 0 ? (rangeOf?.get(p.key) ?? null) : null;
      const execPct = shared ? null : paidPctOf(given, contract);
      return { p, execPct, plan, given, contract, shared };
    })
    .sort((a, b) => {
      if (!layers) return b.given - a.given || b.plan - a.plan;
      const [a1, a2] = pkgNum(a.p.name);
      const [b1, b2] = pkgNum(b.p.name);
      return a1 - b1 || a2 - b2 || a.p.name.localeCompare(b.p.name, 'mn', { numeric: true });
    });
  return (
    <Section
      title={title}
      note={tr('{0} багц · {1}', num(packs.length), note)}
      collapsible
    >
      <List>
        {rows.map(({ p, execPct, plan, given, contract, shared }) => {
          /* Сонгогдсон эсэх — мөрийг тодруулахад. Сонголтын үр дүн нь доод
             бүтэн график ба баруун картуудад гарна. */
          const open = p.key === sel;
          return (
            <Fragment key={p.key}>
            <ListItem
              title={tr(p.name)}
              sub={layers
                ? (p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй'))
                : !planMap
                  ? (finFailed ? tr('санхүү уншигдсангүй') : '…')
                  : shared
                    ? tr('хэд хэдэн багцад олгосон («{0}»)', shared)
                  : contract > 0
                    ? tr('{0} / {1}', mnt(given), mnt(contract))
                    : plan > 0 || given > 0
                      ? tr('{0} / {1}', mnt(given), mnt(plan))
                      : tr('санхүү бүртгэлгүй')}
              value={
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  flexWrap: 'wrap', justifyContent: 'flex-end',
                }}>
                  {!planMap ? '—' : execPct == null
                    ? (shared ? <span title={tr('хэд хэдэн багцад олгосон («{0}»)', shared)}>—*</span> : '—')
                    : <span title={tr('гэрээний дүнгийн %')}>{pct(execPct, 1)}</span>}
                </span>
              }
              color={layers ? cat(2) : cat(0)}
              active={open}
              onClick={() => onSel(open ? null : p.key)}
            />
            {open && layers && <PackLayers layerIds={p.layerIds} />}
            </Fragment>
          );
        })}
      </List>
    </Section>
  );
}

/**
 * ТӨСЛИЙН НЭГДСЭН карт — багц сонгоогүй үеийн баруун карт.
 * (BUS_cashflow-ийн төсөв/захирамж/гэрээний мөрүүд 2026-08-13-нд хасагдсан.)
 * «Олгосон санхүүжилт» нь БОДИТ IPC актын нийлбэр (CASHFLOW_NEW+IPC — Finance-тэй
 * нэг эх сурвалж). Дэд бүтцийн ХО (INVEST /249) 2026-08-14-нд түр хасагдсан.
 */
/**
 * «ТӨСЛИЙН ТӨРӨЛ» — 4 ангиллын гүйцэтгэлийн харьцуулсан багана (2026-08-21,
 * хуучин «Төсөл нийт» картын оронд, хэрэглэгчийн хүсэлтээр). Барилга угсралт
 * нь блокийн дундаж %, бусад ангилал нь санхүүгийн гүйцэтгэл % (олгосон ÷
 * төлөвлөгөө — зүүн жагсаалттай ИЖИЛ дүрэм тул тоо зөрөхгүй). Ангилал бүрд
 * багцын тоо шошгонд хамт гарна.
 */
/**
 * БАГЦ БҮРИЙН САНХҮҮЖИЛТ — төлөвлөгөө, олгосон, олгосон хувь.
 */
/**
 * СОНГОСОН БАГЦЫН САНХҮҮГИЙН КАРТ — «Багцын санхүү»-гийн баруун багана.
 */
function PkgFinCard({ p, fin }: { p: Pack; fin: { plan: number; given: number; contract: number; givenContracted: number } | null }) {
  const contractor = p.blocks.map((b) => b.contractor).find((c) => c) ?? '—';
  const has = !!fin && (fin.plan > 0 || fin.given > 0);
  const share = fin ? paidPctOf(fin.givenContracted, fin.contract) : null;
  return (
    <Section tone="primary" title={tr('{0} — санхүү', tr(p.name))}>
      {fin == null ? (
        <Loading />
      ) : !has ? (
        <Empty label={tr('Гэрээ бүртгэгдээгүй')} />
      ) : (
        <Rows
          items={[
            { key: tr('Гүйцэтгэгч'), value: contractor },
            { key: tr('Төлөвлөгөөт санхүүжилт'), value: <span className="num">{mnt(fin.plan)}</span> },
            { key: tr('Олгосон санхүүжилт'), value: <span className="num">{mnt(fin.given)}</span> },
            { key: tr('олгосон — гэрээний дүнгийн %'), value: <span className="num">{share == null ? '—' : pct(share, 1)}</span> },
            {
              key: tr('Олгогдоогүй үлдэгдэл'),
              value: <span className="num">{fin.contract > 0 ? mnt(Math.max(0, fin.contract - fin.givenContracted)) : '—'}</span>,
            },
          ]}
        />
      )}
    </Section>
  );
}

/**
 * СОНГОСОН БАГЦЫН ГЭРЭЭ БА САНХҮҮЖИЛТИЙН ЭХ ҮҮСВЭР.
 */
function PkgFinDetail({ row, loading }: { row: Record<string, unknown> | null; loading: boolean }) {
  const C = CASHFLOW_NEW.fields;
  const txt = (v: unknown) => String(v ?? '').trim();
  const nn2 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  if (loading) return <Section title={tr('Гэрээний мэдээлэл')}><Loading /></Section>;
  if (!row) return <Section title={tr('Гэрээний мэдээлэл')}><Empty label={tr('Гэрээ бүртгэгдээгүй')} /></Section>;

  /* Урт текст (ажлын нэр 163 тэмдэгт хүрдэг) — 3 мөрөөр таслаж, бүтнийг нь
     hover-ийн `title`-д. Тайлбаргүй таславал мэдээлэл алдагдана. */
  const long = (v: string) => <span className={ts.clamp3} title={v}>{v}</span>;
  const items: { key: string; value: React.ReactNode }[] = [];
  const push = (k: string, v: React.ReactNode, ok: boolean) => { if (ok) items.push({ key: k, value: v }); };
  const money = (v: unknown) => <span className="num">{mnt(nn2(v))}</span>;

  push(tr('Ажлын нэр'), long(txt(row[C.detail])), !!txt(row[C.detail]));
  push(tr('Төрөл'), long(txt(row[C.type])), !!txt(row[C.type]));
  push(tr('Гэрээний дугаар'), txt(row[C.contractNo]), !!txt(row[C.contractNo]));
  push(tr('Гэрээ байгуулсан'), date(row[C.contractDate] as number), !!row[C.contractDate]);
  push(tr('Гүйцэтгэгч'), long(txt(row[C.contractor])), !!txt(row[C.contractor]));
  push(tr('Захиалагчийн хяналт'), long(txt(row[C.client])), !!txt(row[C.client]));
  push(tr('Урьдчилсан төсөвт өртөг'), money(row[C.budget]), nn2(row[C.budget]) > 0);
  push(tr('Захирамжийн дугаар'), txt(row[C.orderNo]), !!txt(row[C.orderNo]));
  push(tr('Захирамжийн нийт дүн'), money(row[C.orderTotal]), nn2(row[C.orderTotal]) > 0);
  push(tr('Гэрээ байгуулах эрх олгосон'), money(row[C.contractAmount]), nn2(row[C.contractAmount]) > 0);

  /* ЭХ ҮҮСВЭР — дүнтэй нь л. Өнгө нь services.ts-д тодорхойлогдсон. */
  const src = CASHFLOW_NEW.sources
    .map((x) => ({ ...x, v: nn2(row[x.field]) }))
    .filter((x) => x.v > 0);
  const srcTotal = src.reduce((a, x) => a + x.v, 0);

  return (
    <>
      <Section title={tr('Гэрээний мэдээлэл')}>
        {items.length ? <Rows items={items} /> : <Empty label={tr('Талбарууд хоосон')} />}
      </Section>
      {src.length === 0 ? (
        <Section title={tr('Санхүүжилтийн эх үүсвэр')}>
          <Empty label={tr('Эх үүсвэр бүртгэгдээгүй')} />
        </Section>
      ) : (
        <Section title={tr('Санхүүжилтийн эх үүсвэр')} note={tr('{0} эх үүсвэр', String(src.length))}>
          <Donut
            items={src.map((x) => ({
              key: x.field,
              label: x.label,
              value: x.v,
              color: cat(CASHFLOW_NEW.sources.findIndex((s) => s.field === x.field)),
              display: mnt(x.v),
            }))}
            size="lg"
            /*
             *    `stack` — тайлбар нь цагирагийн ДООР бүтэн өргөнөөр жагсана:
             *    нэр хэдий ч урт байсан багтана, давхцах орон зай ч үгүй.
             */
            stack
            center={mnt(srcTotal)}
            centerLabel={tr('нийт')}
          />
        </Section>
      )}
    </>
  );
}

/**
 * ОЛГОСОН ТӨЛБӨР (`HO_IPC`) — сонгосон багцаар.
 */
function PkgPays({ p, finQ }: { p: Pack; finQ: Async<FinData> }) {
  const HC = HO_IPC.contractFields;
  const HP = HO_IPC.payFields;

  const acts = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    return finQ.data.pays
      .filter((r) => pkgKeyOf(r[HC.pkg]) === p.key)
      .map((r) => ({
        code: hoPayCode(r),
        /** `tulult_turul` — урьдчилгаа | гүйцэтгэл | хоосон(2) */
        kind: r[HP.kind] == null ? '' : String(r[HP.kind]),
        payDate: r[HP.payDate] as string | null,
        amount: hoAmount(r),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finQ, p.key]);

  if (finQ.state === 'loading') return <Section title={tr('Олгосон төлбөр')}><Loading /></Section>;
  if (finQ.state === 'error') return <Section title={tr('Олгосон төлбөр')}><Data q={finQ}>{() => null}</Data></Section>;
  if (!acts || !acts.length) return <Section title={tr('Олгосон төлбөр')}><Empty label={tr('Төлбөр бүртгэгдээгүй')} /></Section>;

  const paidTotal = acts.reduce((a, x) => a + (x.amount ?? 0), 0);
  const withAmt = acts.filter((x) => x.amount != null).length;

  const kindSum = (test: (k: string) => boolean) =>
    acts.reduce((a, x) => (x.amount != null && test(x.kind) ? a + x.amount : a), 0);
  const parts = [
    { key: 'adv', label: tr('Урьдчилгаа төлбөр'), value: kindSum((k) => k === HO_IPC.kinds.advance), color: cat(0) },
    { key: 'work', label: tr('Гүйцэтгэлийн төлбөр'), value: kindSum((k) => k === HO_IPC.kinds.work), color: cat(1) },
    { key: 'na', label: tr('Ангилагдаагүй'), value: kindSum((k) => k !== HO_IPC.kinds.advance && k !== HO_IPC.kinds.work), color: cat(2) },
  ];
  /* Сөрөг зүсмэгийг цагирагт зурах боломжгүй — ил тэмдэглэж хасна */
  const bad = parts.filter((x) => x.value < 0);
  const shown = parts.filter((x) => x.value > 0);
  const shownTotal = shown.reduce((a, x) => a + x.value, 0);

  return (
    <>
      <Section
        title={tr('Олгосон төлбөр')}
        note={tr('{0} төлбөр · {1} дүнтэй', String(acts.length), String(withAmt))}
      >
        {/* Төлбөр бүр: код ба гүйлгээний огноо — утга нь олгосон дүн. */}
        <Rows
          items={acts.map((x, i) => ({
            key: acts.filter((y) => y.code === x.code).length > 1
              ? `${x.code} ${acts.slice(0, i + 1).filter((y) => y.code === x.code).length}`
              : x.code,
            value: (
              <span className="num">
                {x.amount == null ? tr('дүнгүй') : mnt(x.amount)}
                {x.payDate ? (
                  <small className={ts.actPeriod}>{date(x.payDate)}</small>
                ) : null}
              </span>
            ),
          }))}
        />
      </Section>

      {/* ТӨЛБӨРИЙН БҮТЭЦ — урьдчилгаа / гүйцэтгэл. Хоёулаа гүйцэтгэгчид
          ОЛГОГДСОН мөнгө; ялгаа нь зөвхөн үндэслэл. */}
      {shown.length > 0 && (
        <Section
          title={tr('Төлбөрийн бүтэц')}
          note={tr('нийт {0}', mnt(shownTotal))}
        >
          <Donut
            items={shown.map((x) => ({ ...x, display: mnt(x.value) }))}
            size="lg"
            stack
            center={mnt(paidTotal)}
            centerLabel={tr('олгосон')}
          />
          {bad.length > 0 && (
            <Note>
              {tr('Өгөгдлийн зөрчил: {0} — сөрөг дүн тул цагирагт орсонгүй.',
                bad.map((x) => `${x.label} ${mnt(x.value)}`).join(' · '))}
            </Note>
          )}
        </Section>
      )}
    </>
  );
}

/**
 * СОНГОСОН БАГЦЫН САР БҮРИЙН САНХҮҮЖИЛТ.
 */
function PkgMonths({
  p, finMap,
}: {
  p: Pack;
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
}) {
  const months = finMap?.get(p.key) ?? null;
  const rows = (months ?? []).filter((m) => m.given > 0);

  if (!finMap) return <Section title={tr('Сар бүрийн санхүүжилт')}><Loading /></Section>;
  if (!rows.length) return <Section title={tr('Сар бүрийн санхүүжилт')}><Empty label={tr('Олголт бүртгэгдээгүй')} /></Section>;

  return (
    <Section
      title={tr('Сар бүрийн санхүүжилт')}
      note={tr('{0} сар · олгосон', num(rows.length))}
    >
      <Rows
        items={rows.map((m) => ({
          key: m.label,
          value: <span className="num">{mnt(m.given)}</span>,
        }))}
      />
    </Section>
  );
}

function PkgFinList({
  packs, givenMap, planMap, contractMap,
}: {
  packs: Pack[];
  /** Багц → олгосон нийт дүн, ₮ (`givenMap`) */
  givenMap: Map<string, number> | null;
  /** Багц → гэрээний нийт дүн, ₮ */
  planMap: Map<string, number> | null;
  /** Багц → ГЭРЭЭЛСЭН ДҮН, ₮ — «олгосон хувь»-ийн хуваарь (2026-10-01, `paidPctOf`) */
  contractMap: Map<string, number> | null;
}) {
  const rows = useMemo(() => {
    if (!givenMap) return null;
    return packs
      .map((p) => {
        if (!givenMap.has(p.key)) return null;
        const plan = planMap?.get(p.key) ?? 0;
        const given = givenMap.get(p.key) ?? 0;
        if (plan <= 0 && given <= 0) return null;
        const contract = contractMap?.get(p.key) ?? 0;
        return { key: p.key, label: tr(p.name), plan, given, contract, pct: paidPctOf(given, contract) };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.given - a.given);
  }, [packs, givenMap, planMap, contractMap]);

  if (!rows) return <Section title={tr('Багц бүрийн санхүүжилт')}><Loading /></Section>;
  if (!rows.length) return <Section title={tr('Багц бүрийн санхүүжилт')}><Empty label={tr('Гэрээ бүртгэгдээгүй')} /></Section>;

  return (
    <Section
      title={tr('Багц бүрийн санхүүжилт')}
      note={tr('{0} багц (гэрээ эсвэл олголттой) · {1}', num(rows.length), tr('олгосон · гэрээний дүнгийн %'))}
    >
      <Bars
        max={100}
        items={rows.map((r) => ({
          key: r.key,
          label: r.label,
          value: r.pct,
          color: r.pct == null ? NO_DATA : undefined,
          display: `${mnt(r.given)} / ${mnt(r.contract > 0 ? r.contract : r.plan)}`,
        }))}
      />
    </Section>
  );
}

function CatChart({
  packs,
  givenMap,
  planMap,
  contractMap = null,
  finOnly = false,
}: {
  packs: Pack[];
  /** Багц → олгосон нийт дүн, ₮ (`givenMap`) */
  givenMap: Map<string, number> | null;
  /** Багц → гэрээний нийт дүн, ₮ */
  planMap: Map<string, number> | null;
  /**
   * Багц → ГЭРЭЭЛСЭН ДҮН, ₮ — санхүүгийн горимын хувийн хуваарь (2026-10-01, ШИЙДВЭР:
   * «гэрээний дүнгийн %», удирдлагын тайлантай нэг — `paidPctOf`).
   */
  contractMap?: Map<string, number> | null;
  /**
   * САНХҮҮГИЙН хэл: багана бүр ОЛГОСОН / ТӨЛӨВЛӨГӨӨ хувь.
   */
  finOnly?: boolean;
}) {
  const rows = PACK_CATS.map((c) => {
    const list = packs.filter((p) => catOf(p) === c.key);
    const pcts: number[] = [];
    /* Мөнгөн салааны ЖИГНЭЛТ — төлөвлөгөөт (гэрээний) дүнгээр */
    let wNum = 0;
    let wDen = 0;
    for (const p of list) {
      if (!finOnly) {
        if (p.kind === 'build' && p.progress != null) pcts.push(p.progress);
        continue;
      }
      if (!givenMap?.has(p.key)) continue;
      const plan = contractMap ? contractMap.get(p.key) ?? 0 : planMap?.get(p.key) ?? 0;
      const given = givenMap.get(p.key) ?? 0;
      if (plan > 0) {
        pcts.push((given / plan) * 100);
        wNum += given;
        wDen += plan;
      }
    }
    const mean = finOnly
      ? (wDen > 0 ? (wNum / wDen) * 100 : null)
      : (pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null);
    return { c, n: list.length, mean };
  });
  return (
    <Section
      tone="primary"
      title={tr('Төслийн төрөл')}
      note={finOnly ? tr('{0} багц · {1}', num(packs.length), tr('олгосон · гэрээний дүнгийн %')) : tr('{0} багц ажил', num(packs.length))}
    >
      <Bars
        max={100}
        items={rows.map((r, i) => ({
          key: r.c.key,
          label: `${r.c.name()} · ${num(r.n)}`,
          value: r.mean,
          color: r.mean == null ? NO_DATA : cat(i),
          display: r.mean == null ? tr('мэдээлэлгүй') : pct(r.mean, 1),
        }))}
      />
    </Section>
  );
}

/**
 * САНХҮҮГИЙН ГРАФИК — Finance-ийн ComboChart-ыг сонгосон багцад; багц
 * СОНГООГҮЙ бол ТӨСЛИЙН НЭГДСЭН (бүх гэрээний сарын нийлбэр, олгосон бүгд,
 * биет нь багцуудын дундаж). Гэрээний мөрийг `bagtsKey`-ээр тааруулна
 * («БАГЦ-4.1» = «Багц 4-1»); хоцрогдлын badge мөн Finance-ийн дүрмээр.
 */
/** Санхүүгийн графикийн өндрийн хязгаарууд (px) — чирэх бариул */
const FIN_H0 = 220;
const FIN_H_MIN = 140;
const FIN_H_MAX = 520;
const FIN_H_LS = 'selbe.finh.pkgfin';

function FinCard({
  p,
  finQ,
  projShare = null,
  chartH = FIN_H0,
  finOnly = false,
}: {
  p: Pack | null;
  finQ: Async<FinData>;
  projShare?: PaidShare | null;
  /** Комбо графикийн өндөр (px) — дээд ирмэгийн чирэх бариулаас (2026-08-21) */
  chartH?: number;
  /**
   * ЗӨВХӨН МӨНГӨНИЙ хэл: биет гүйцэтгэлийн үзүүлэлт, шугам, легенд, хоцрогдлын
   * тэмдэг бүгд НУУГДАНА.
   */
  finOnly?: boolean;
}) {
  /**
   * Үзүүлэлтийн мөр нээлттэй эсэх — ЗӨВХӨН энэ мөрөнд үйлчилнэ, доорх график
   * ҮРГЭЛЖ харагдана (2026-08-21, хэрэглэгчийн хүсэлт). Санадаггүй — refresh
   * хийхэд нээлттэй эхэлнэ.
   */
  const [kpiOpen, setKpiOpen] = useState(true);
  const d = finQ.state === 'ready' ? finQ.data : null;
  const C = CASHFLOW_NEW.fields;

  // Дата бэлэн бол сарын цэг, нийт дүн, хоцрогдлыг урьдчилан бодно — badge-ийг
  // гарчигт (нэрний хажууд) ба note-д (баруун талд) тавихад хэрэгтэй.
  let months: ReturnType<typeof contractMonths> | null = null;
  let total = 0;
  let noRow = false;
  /**
   * Олгосон НИЙТ дүн (₮).
   */
  let givenTotal = 0;
  let givenShown: number | null = 0;
  let contractAmt = 0;
  let givenContracted = 0;
  let projExcl: string[] = [];
  if (d) {
    if (p) {
      const rows = d.contracts.filter(
        (r) => pkgKeyOf(r[C.pkg2]) === p.key || pkgKeyOf(r[C.pkg]) === p.key,
      );
      if (!rows.length) noRow = true;
      else {
        months = mergePkgMonths(rows, d);
        total = [...new Set(rows.map((r) => pkgSrcKey(r, d.planTotal)))]
          .reduce<number>((a, k) => a + (k ? (d.planTotal.get(k) ?? 0) : 0), 0);
        /* Түлхүүрийн уналт нь `contractMonths`-ийн `given.get(...)`-тэй ЯГ ижил;
           хоёр гэрээ нэг түлхүүрт унавал НЭГ УДАА л тоологдоно. */
        givenTotal = pkgGivenTotal(rows, d);
        contractAmt = contractedScope(rows).amount;
        givenContracted = contractAmt > 0 ? givenTotal : 0;
      }
      givenShown = givenTotal;
    } else {
      months = aggregateMonths(d);
      projExcl = projectPlanScope(d)?.excluded ?? [];
      d.planTotal.forEach((v) => { total += v; });
      d.givenTotal.forEach((v) => { givenTotal += v; });
      givenShown = hoTotals(d.pays).paid;
      contractAmt = projShare?.contract ?? 0;
      givenContracted = projShare?.paidContracted ?? 0;
    }
  }
  const lag = months ? lagOf(months) : null;
  const lvl = lagLevelOf(lag);

  /**
   * KPI — ГЭРЭЭНИЙ дүн ба IPC-ийн олгосон акт (₮), тэдгээрийн ЗӨРҮҮ; мөн
   * ГҮЙЦЭТГЭЛИЙН ХУВЬ хоёр (төлөвлөгөөт = ХУВААРИАС, бодит = биет
   * гүйцэтгэл %) ба тэдгээрийн ЗӨРҮҮ.
   */
  const plannedPct: number | null = lag ? lag.planned : null;
  const actualPct: number | null = lag ? lag.actual : null;
  // Санхүүжилтийн зөрүү — төлөвлөсөн − олгосон (₮). Эерэг = олгоогүй үлдэгдэл.
  const finGap = contractAmt > 0 ? Math.max(0, contractAmt - givenContracted) : null;
  // олгосон ÷ ГЭРЭЭЛСЭН дүн (%) — `paidPctOf`, хавтан/жагсаалттай нэг
  const givenShare = paidPctOf(givenContracted, contractAmt);
  // Гүйцэтгэлийн зөрүү — төлөвлөгөөт − бодит (%). Эерэг = хоцрогдол.
  const progGap = plannedPct != null && actualPct != null ? plannedPct - actualPct : null;
  const gapText = gapPts(progGap);

  // ГАРЧИГ — нэр + (хоцрогдол бол) нэрний ХАЖУУД alert badge
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {p ? tr(p.name) : tr('Төсөл нийт')}{' '}
      {finOnly ? tr('— санхүүжилтийн явц') : tr('— санхүүжилт ба гүйцэтгэлийн явц')}
      {!finOnly && lag && lvl && (
        <span
          className={`${f.lagBadge} ${lvl === 'red' ? f.lagRed : f.lagYellow}`}
          title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
        >
          {lvl === 'red' ? tr('Хоцрогдол') : tr('Анхаарах')} {gapPts(lag.gap)}
        </span>
      )}
    </span>
  );
  /**
   * NOTE — гарчгийн БАРУУН талд «олгогдох нийт санхүүжилт» (график дээр биш).
   *
   *   · ЭНД (`FinData.planTotal` нийлбэр)        2,529,545,325,331 ₮
   *   · Дашбоардын KPI (`Headline.investTotal`)  2,493,041,880,532 ₮
   *   · ЗӨРҮҮ                                       36,503,444,799 ₮
   */
  const note =
    total > 0 ? (
      <span className={ts.totNote}>
        {tr('Багцын гэрээ/төсвийн дүн (гэрээгүй бол төсвөөр):')} <b>{num(total)} ₮</b>
      </span>
    ) : undefined;

  return (
    <Section tone="primary" title={title} note={note}>
      {finQ.state === 'loading' ? (
        <Loading label={tr('Санхүүжилтийн өгөгдлийг татаж байна…')} />
      ) : finQ.state === 'error' ? (
        <Data q={finQ}>{() => null}</Data>
      ) : noRow ? (
        <Empty label={tr('Cashflow-д энэ багцын гэрээ бүртгэлгүй.')} />
      ) : months ? (
        <>
          {/* Үзүүлэлтийн мөрийг нуух/харуулах — ГРАФИКТ огт нөлөөлөхгүй */}
          <button
            type="button"
            className={ts.kpiToggle}
            aria-expanded={kpiOpen}
            onClick={() => setKpiOpen((v) => !v)}
          >
            <span className={`${ts.kpiCaret} ${kpiOpen ? '' : ts.kpiCaretOff}`} aria-hidden>▾</span>
            {tr('Үзүүлэлтүүд')}
          </button>
          {kpiOpen && (
          <div className={ts.finKpi}>
            {[
              { v: contractAmt > 0 ? mnt(contractAmt) : '—', l: tr('Гэрээний нийт дүн'), c: 'var(--ink)' },
              {
                v: (
                  <>
                    {mnt(givenShown)}
                    {givenShare != null && (
                      <small style={{ display: 'block', fontSize: '0.72em', opacity: 0.7, fontWeight: 600 }}>
                        {pct(givenShare, 1)}
                      </small>
                    )}
                  </>
                ),
                l: tr('Олгосон санхүүжилт'),
                c: 'var(--ink)',
              },
              { v: remainMnt(finGap), l: tr('Олгогдоогүй үлдэгдэл'), c: 'var(--ink)' },
              ...(finOnly ? [] : [
                {
                  v: plannedPct == null ? '—' : pct(plannedPct, 1),
                  l: tr('Төлөвлөгөөт гүйцэтгэл') + (lag && coverageNote(lag.coverage) ? ` · ${coverageNote(lag.coverage)}` : ''),
                  c: 'var(--ink)',
                },
                {
                  v: actualPct == null ? '—' : pct(actualPct, 1),
                  l: projExcl.length ? tr('Бодит гүйцэтгэл (хуваарьтай багцаар)') : tr('Бодит гүйцэтгэл'),
                  c: 'var(--ink)',
                },
                {
                  v: gapText,
                  l: tr('Гүйцэтгэлийн зөрүү') + (lag && !lagJudged(lag) ? ` · ${tr('хуваарь дутуу — дүгнэхгүй')}` : ''),
                  c: 'var(--ink)',
                },
              ]),
            ].map((k) => (
              <div key={k.l}>
                <span className={`${ts.finKpiVal} num`} style={{ color: k.c }}>{k.v}</span>
                <span className={ts.finKpiLabel}>{k.l}</span>
              </div>
            ))}
          </div>
          )}
          <div className={ts.finLegend}>
            <span><i className={ts.legSolid} style={{ background: 'var(--data)' }} />{tr('Олгосон санхүүжилт')}</span>
            {!finOnly && <span><i className={ts.legDash} />{tr('Биет гүйцэтгэл')}</span>}
            {!finOnly && projExcl.length > 0 && <span>{planScopeNote(projExcl)}</span>}
          </div>
          <ComboChart
            items={months}
            height={chartH}
            lagMonth={finOnly ? undefined : lag?.month}
            lagLvl={finOnly ? null : lvl}
            hidePhys={finOnly}
            contract={total > 0 ? total : null}
          />
        </>
      ) : null}
    </Section>
  );
}


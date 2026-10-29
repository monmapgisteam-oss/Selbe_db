'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';

import {
  Section, Note, Data, Empty, Loading, Rows, Bars, List, ListItem,
} from '@/components/ui';
import { PackLayers } from '@/components/PackLayers';
import {
  buildPacks, PackKpi, BlocksCard, LayersCard, levelColor, blockCount, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import {
  useBuildings, MonitorBagts, MonitorGeneral, MonitorDetail, useTaskPerf,
  pickedBuilding, uniqueBlocks, type PickedBuilding,
} from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, pkgMonthsMap, physLatest, lagOf, lagLevelOf, lagJudged, projectPlanOf,
  projectPlanScope, projectLagNow, infraPhysNow, type FinData,
} from '@/modules/Finance';
import { useAsync, type Async } from '@/lib/useAsync';
import { levelCounts, type BlockProgressMap } from '@/lib/blockProgress';
import {
  HUE, catOf, aggregateMonths, physNow, progMonthsOf, SR_ONLY, type PackCat,
} from '@/modules/pkgShared';
export { aggregateMonths, physNow } from '@/modules/pkgShared';
import { gapPts, gapPtsWord } from '@/lib/gdash';
import {
  loadPlanCurveCached, planPctAt, measureDayOf, planCoverage, coverageOk, coverageNote,
  type PlanPoint, type PlanCurve,
} from '@/lib/planProgress';

/**
 * «Гүйцэтгэлийн явц» графикийн нэг цэг — ТӨЛӨВЛӨГӨӨ (хуваариас) ба БОДИТ
 * (биет гүйцэтгэл), хоёулаа ХУВЬ.
 */
export type ProgPt = {
  label: string; plan: number; act: number | null; vol: number | null;
  /**
   * ХЭМЖИЛТИЙН ӨДРИЙН төлөвлөгөө (2026-09-25) — `act`-ын огноогоор завсарласан
   * (`planPctAt`). `plan` нь САРЫН ЭЦСИЙН цэг тул сарын эхэнд хэмжсэн
   * гүйцэтгэлтэй жишихэд хиймэл «хоцрогдол» гарна. `null` = хэмжилтгүй сар.
   */
  planM?: number | null;
};
import {
  BUILDING, PROGRESS_LEVELS, LAYER_BY_ID, bagtsKey,
  zoneWhere, parcelOidsWhere } from '@/lib/services';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { cat, shade, num, pct, monthKey, dayKey } from '@/lib/format';
import { fitLabels, textW, useChartWidth } from '@/lib/chartFit';
import { CHART, lineSegments, monotonePath } from '@/lib/chartStyle';
import { readParam, writeParams } from '@/lib/urlState';
import o from './pkgProgOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { overlapLeftParcels, type Overlap } from '@/lib/parcelOverlap';
import ts from './pkgProg.module.css';

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
/**
 * БАРИЛГА УГСРАЛТЫН АНГИЛАЛ — жагсаалтын ТОЛГОЙД гардаг (2026-09-10).
 */
const BUILD_CAT: PackCat = 'build';
const PACK_CATS: { key: PackCat; name: () => string }[] = [
  { key: 'build', name: () => tr('Барилга угсралт') },
  { key: 'infra', name: () => tr('Инженерийн дэд бүтэц') },
  { key: 'soc', name: () => tr('Нийгмийн барилга') },
  { key: 'site', name: () => tr('Өндөржилт') },
];
/** Газар чөлөөлөлтийн нэгж талбарын давхарга — давхцсан талбарыг зурахад. */
const PARCEL_LAYER = 'land:left';

/** Дундаж — бөглөгдөөгүй блокийг оруулахгүй (Bagts-ийн meanOf-той ижил дүрэм) */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

/**
 *   · `fin`  — гэрээ, CASHFLOW, олгосон санхүүжилт, хөрөнгө оруулалт
 *   · `prog` — биет явц, блокийн төлөв, давхцал, барилгын хяналт
 *
 * Багцын жагсаалт, газрын зураг, өгөгдөл ачаалалт нь ХОЁУЛАНД ижил тул
 * хуваалцагдана — салгасан нь ЗӨВХӨН дээд индикатор ба баруун баганын карт.
 */
const todayDayKey = (): string => dayKey(Date.now());

export function PkgProg({ dim, setDim }: {
  dim: Dim;
  setDim: (d: Dim) => void;
}) {
  /**
   * Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   */
  const { hostRef: sideHostRef, ...side } = useSideResize('pkgProg');
  const q = useBuildings();
  const finQ = useAsync<FinData>(loadFinData, []);
  const { zoomToWhere, setHighlight } = useMap();

  /** Сонгосон багц — Bagts-тай ижил `?pkg=` параметрээр хуваалцагдана */
  const [sel, setSel] = useState<string | null>(() => readParam('pkg'));
  /** Зураг дээр дарсан барилга — баруун картууд барилгын хяналт руу шилжинэ */
  const [pb, setPb] = useState<PickedBuilding | null>(null);
  const perfQ = useTaskPerf(pb);

  useEffect(() => { setHighlight(null); }, [setHighlight]);
  useEffect(() => () => { setHighlight(null); }, [setHighlight]);
  useEffect(() => { writeParams({ pkg: sel }); }, [sel]);

  const packs = useMemo<Pack[]>(
    () => (q.state === 'ready' ? buildPacks(q.data.rows, q.data.pkgPct) : buildPacks(null)),
    [q],
  );

  const active = packs.find((p) => p.key === sel) ?? null;

  /**
   * БАГЦТАЙ ДАВХЦАЖ БУЙ «ҮЛДСЭН НЭГЖ ТАЛБАР» — чөлөөлөгдөөгүй, барилга
   * эхлүүлэхэд саад болж буй газар. Багц сонгоход орон зайн огтлолцлоор олж,
   * газрын зурагт зурж, тоог нь KPI-д гаргана.
   */
  const [overlap, setOverlap] = useState<Overlap | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverlap(null);
    /* Багц сонгосон бол ТҮҮНИЙ бүх давхарга; эс бөгөөс БҮХ БАГЦЫНХ —
       барилгын блокууд + дэд бүтцийн 48 багцын давхаргууд. Зөвхөн блокоор
       тоолвол шугам хоолой, замын коридор дээрх саад тоологдохгүй үлддэг. */
    const srcs = active
      ? active.layerIds.map((id) => ({ layerId: id, where: active.where }))
      : [
          { layerId: BLOCK_LAYER, where: null },
          ...packs.flatMap((pk) =>
            pk.kind === 'infra' ? pk.layerIds.map((id) => ({ layerId: id, where: pk.where })) : [],
          ),
        ];
    overlapLeftParcels(srcs)
      .then((r) => alive && setOverlap(r.failed?.length ? 'error' : r))
      .catch(() => alive && setOverlap('error'));
    return () => {
      alive = false;
    };
  }, [active, packs]);

  /** Амжилттай үр дүн л — зурагт/шүүлтэд алдааны төлөв «хоосон» мэт орохгүй */
  const ovOk = overlap !== 'error' ? overlap : null;

  /**
   * КАРТААС СОНГОСОН давхцсан талбарууд — газрын зураг ҮҮГЭЭР нарийсна.
   */
  const [ovPick, setOvPick] = useState<{ key: string; oids: number[] } | null>(null);
  const [cardSel, setCardSel] = useState<{ key: string; oid: string } | null>(null);
  /* Багц солиход сонголт суллагдана — өөр багцын талбар дээр түгжигдэхгүй. */
  const [selActive, setSelActive] = useState(active);
  if (selActive !== active) {
    setSelActive(active);
    setOvPick(null);
    setCardSel(null);
  }

  /** Сонгогдсон багц — түүний давхаргууд зурагт нэмэгдэнэ */
  const ovPack = useMemo(
    () => (ovPick ? packs.find((x) => x.key === ovPick.key) ?? null : null),
    [ovPick, packs],
  );

  /** Зурагт үзүүлэх давхцсан талбарууд — сонголт байвал түүнийг */
  const ovShown = useMemo(
    () => (ovPick?.oids.length ? ovPick.oids : (ovOk?.oids ?? [])),
    [ovPick, ovOk],
  );

  /**
   * БАГЦ БҮРИЙН давхцсан үлдсэн нэгж талбар — «Багц N — блокууд» картын
   * толгойд ба «Саад — багцаар» чартад. Багц тус бүрд тусдаа огтлолцол тул
   * зэрэг бодогдож, нэг нь унавал бусдыг унагахгүй (allSettled).
   */
  const [ovByPack, setOvByPack] = useState<Map<string, Overlap | 'error'> | null>(null);
  useEffect(() => {
    let alive = true;
    const builds = packs.filter((pk) => pk.kind === 'build');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOvByPack(q.state === 'ready' && !builds.length ? new Map() : null);
    if (q.state !== 'ready' || !builds.length) return;
    Promise.allSettled(
      builds.map(async (pk) => [
        pk.key,
        await overlapLeftParcels(pk.layerIds.map((id) => ({ layerId: id, where: pk.where }))),
      ] as const),
    ).then((rs) => {
      if (!alive) return;
      const m = new Map<string, Overlap | 'error'>();
      rs.forEach((r, i) => {
        if (r.status === 'fulfilled') m.set(r.value[0], r.value[1].failed?.length ? 'error' : r.value[1]);
        else m.set(builds[i].key, 'error');
      });
      setOvByPack(m);
    });
    return () => { alive = false; };
  }, [packs, q.state]);

  /**
   * АНГИЛАЛ БҮРИЙН асуудалтай (давхцсан үлдсэн) нэгж талбар — «Блокийн
   * төлөв» картад БАЙНГА харагдана (2026-08-21: блокуудын картууд хаалттай
   * үед ч уншигдахын тулд). Ангилал бүрд нэг огтлолцол — дөрөвхөн хүсэлт,
   * нэг нь унавал бусдыг унагахгүй.
   */
  const [ovByCat, setOvByCat] = useState<Map<PackCat, number | 'error'> | null>(null);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOvByCat(null);
    if (q.state !== 'ready' || !packs.length) return;
    Promise.allSettled(PACK_CATS.map(async (c) => {
      const srcs = packs
        .filter((p) => catOf(p) === c.key)
        .flatMap((p) => p.layerIds.map((id) => ({ layerId: id, where: p.where })));
      if (!srcs.length) return [c.key, 0] as const;
      const r = await overlapLeftParcels(srcs);
      if (r.failed?.length) throw new Error('partial overlap');
      return [c.key, r.oids.length] as const;
    })).then((rs) => {
      if (!alive) return;
      const m = new Map<PackCat, number | 'error'>();
      rs.forEach((r, i) => {
        if (r.status === 'fulfilled') m.set(r.value[0], r.value[1]);
        else m.set(PACK_CATS[i].key, 'error');
      });
      setOvByCat(m);
    });
    return () => { alive = false; };
  }, [packs, q.state]);

  /**
   * САНХҮҮГИЙН КАРТЫН ӨНДӨР — картын дээд ирмэгийн бариулаар чирч тохируулна
   * (2026-08-21, хэрэглэгчийн хүсэлт). ДЭЭШ чирвэл график өндөрсөж, газрын
   * зургийн мөр (1fr) агшина. localStorage-д хадгалагдана; давхар товшилт —
   * анхны хэмжээ. SplitGrip-ийн хэвтээ хувилбартай ижил зарчим, гэхдээ SVG-д
   * өндөр нь prop тул CSS хувьсагч бус React төлөв (график цөөн элементтэй
   * тул чирэлтийн re-render хямд).
   */
  /**
   * Багц бүрийн САНХҮҮГИЙН сарын цэгүүд — гэрээний мөрийг bagtsKey-ээр
   * тааруулж НЭГ УДАА бэлдэнэ. Жагсаалтын гүйцэтгэлийн хувь ба хоцрогдлын
   * alert үүнээс тооцогдоно.
   */
  const finMap = useMemo(
    () => (finQ.state === 'ready' ? pkgMonthsMap(finQ.data) : null),
    [finQ],
  );

  /**
   * ХУВААРИЙН ТӨЛӨВЛӨГӨӨ — «Гүйцэтгэл бөглөх» хуудсуудын эхлэх/дуусах
   * огноонд суурилсан сар тутмын өссөн хувь (`loadPlanCurve`).
   */
  const planQ = useAsync(loadPlanCurveCached, []);

  /**
   * Графикийн мөрүүд: тэнхлэг ба ТӨЛӨВЛӨГӨӨ нь ХУВААРИАС, БОДИТ гүйцэтгэл нь
   * хуучин санхүүгийн цэгүүдээс (`phys`) шошгоор тааруулж холбогдоно.
   */
  const progMonths = useMemo<ProgPt[] | null>(() => {
    const pc = planQ.state === 'ready' ? planQ.data : null;
    const base = active
      ? (finMap?.get(active.key) ?? null)
      : (finQ.state === 'ready'
        ? aggregateMonths(finQ.data, pc).map((m) => (m.physLag !== undefined
          ? { ...m, phys: m.physLag, physAt: m.physLagAt ?? null }
          : m))
        : null);
    if (!pc) return null;
    /* Багц сонгосон бол тэр багцын муруй; сонгоогүй бол ТӨСЛИЙН нийт. */
    const series = active && active.key !== '__all'
      ? pc.byBagts.get(active.key)
      : (finQ.state === 'ready' ? projectPlanOf(finQ.data, pc) : pc.months);
    return progMonthsOf(base, series);
  }, [active, finMap, finQ, planQ]);
  const planExcl = useMemo<string[]>(() => (finQ.state === 'ready' && planQ.state === 'ready'
    ? projectPlanScope(finQ.data, planQ.data)?.excluded ?? []
    : []), [finQ, planQ]);
  const chartCov = useMemo<string>(() => {
    const pc = planQ.state === 'ready' ? planQ.data : null;
    if (!pc) return '';
    const series = active && active.key !== '__all'
      ? pc.byBagts.get(active.key)
      : (finQ.state === 'ready' ? projectPlanOf(finQ.data, pc) : pc.months);
    return coverageNote(planCoverage(series));
  }, [active, finQ, planQ]);


  /**
   * ALERT-тэй (төлөвлөгөөнөөс хоцорсон) багцууд — ТУСДАА бүлэг болж жагсаалтын
   * ХАМГИЙН ДЭЭР гарна. Гүйцэтгэл хэвийн болмогц lag арилж, багц өөрийн
   * бүлэгтээ аяндаа буцна (тусгай төлөв хадгалахгүй).
   */
  const alertKeys = useMemo(() => {
    const s = new Set<string>();
    if (!finMap) return s;
    packs.forEach((p) => {
      const months = finMap.get(p.key);
      if (!months) return;
      if (lagLevelOf(lagOf(months))) s.add(p.key);
    });
    return s;
  }, [packs, finMap]);
  const alerted = useMemo(() => packs.filter((p) => alertKeys.has(p.key)), [packs, alertKeys]);
  const lagUnknown = useMemo(() => {
    if (planQ.state !== 'ready' || !planQ.data.failed.length) return [] as Pack[];
    const failed = new Set(planQ.data.failed);
    const groups = new Set(PKGS.filter((x) => failed.has(x.key)).map((x) => bagtsKey(x.group)));
    return packs.filter((p) => p.kind === 'build' && groups.has(p.key) && !alertKeys.has(p.key));
  }, [packs, planQ, alertKeys]);



  /**
   * НЭГДСЭН псевдо-багц — багц СОНГООГҮЙ үед «Блок бүрийн гүйцэтгэл» болон
   * блокийн төлөвийн картуудад бүх 113 блокийг өгнө (хоосон төлөвийн оронд
   * ТӨСЛИЙН ЕРӨНХИЙ мэдээлэл харагдана).
   */
  const allPack = useMemo<Pack | null>(() => {
    const build = packs.filter((p) => p.kind === 'build');
    if (!build.length) return null;
    const blocks = build.flatMap((p) => p.blocks);
    return {
      key: '__all',
      name: tr('Бүх багц'),
      kind: 'build',
      layerIds: [BLOCK_LAYER],
      where: null,
      blocks,
      households: build.reduce((s, p) => s + p.households, 0),
      progress: meanOf(uniqueBlocks(blocks).map((b) => b.progress ?? 0)),
    };
  }, [packs]);

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
   * ЗУРАГТ ӨГӨХ жагсаалт — каталогийн сонголт (`visible`) дээр давхцсан
   * үлдсэн нэгж талбар олдвол газар чөлөөлөлтийн давхаргыг НЭМНЭ: инженер
   * аль блок дээр саад байгааг зурган дээр шууд харна.
   */
  const mapVisible = useMemo(() => {
    const ids = [...visible];
    if (ovPack) ids.push(...ovPack.layerIds);
    if (ovShown.length) ids.push(PARCEL_LAYER);
    return ids.length === visible.length ? visible : [...new Set(ids)];
  }, [visible, ovPack, ovShown]);
  /**
   * ДАВХЦСАН НЭГЖ ТАЛБАРЫН ХЭВ МАЯГ — УЛААН (хэрэглэгчийн шийдвэр, 2026-08-25).
   */

  const parcelStyle = useMemo(
    () =>
      ovShown.length
        ? { [PARCEL_LAYER]: { hue: '#dc2626', fill: 0.3, width: 2.1 } }
        : undefined,
    [ovShown],
  );

  const layerWhere = useMemo<Record<string, string | null>>(
    () => {
      const w: Record<string, string | null> = {};
      if (zone) {
        for (const id of mapVisible) {
          const d = LAYER_BY_ID[id];
          if (d) w[id] = zoneWhere(d, zone);
        }
      }
      /* Багц сонгосон → тэр багц; чартаас багц сонгосон → түүнийх;
         эс бөгөөс → зөвхөн хоцрогдолтой багцын блокууд. */
      w[BLOCK_LAYER] = active ? active.where : (ovPack?.where ?? alertedWhere);
      if (ovPack) {
        for (const id of ovPack.layerIds) if (id !== BLOCK_LAYER) w[id] = ovPack.where;
      }
      w[PARCEL_LAYER] = ovShown.length ? parcelOidsWhere(ovShown) : null;
      return w;
    },
    [active, alertedWhere, ovPack, ovShown, zone, mapVisible],
  );

  /** Багц солих — барилгын сонголт цуцлагдана (өөр багцын барилга үлдэхгүй) */
  const pick = useCallback((k: string | null) => {
    setSel(k);
    setPb(null);
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
    const oid = Number(attrs?.[BUILDING.oid]);
    setPb(b);
    if (Number.isFinite(oid)) setHighlight(`${BUILDING.oid} = ${oid}`, BLOCK_LAYER);
  }, [setHighlight, pick]);
  const backToPack = () => {
    setPb(null);
    setHighlight(null);
  };

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

  /**
   * НЭГ АНГИЛЛЫН ЖАГСААЛТ — ХОЁР газраас дуудагдана (барилга угсралт нь
   * хоцрогдлын ДЭЭР, үлдсэн нь ДООР) тул нэг тодорхойлолт (2026-09-10).
   */
  const catList = (c: { key: PackCat; name: () => string }) => (
    <TsPackList
      key={c.key}
      title={c.name()}
      /* Дэд бүтэц/нийгмийн барилгад биет хувь байхгүй тул
         «гүйцэтгэлийн хувь» гэж амлахгүй — зурагт байгаа зүйлээ л. */
      note={c.key === BUILD_CAT ? tr('блокийн гүйцэтгэл') : tr('зурагт харагдах давхарга')}
      packs={packs.filter((p) => catOf(p) === c.key && !alertKeys.has(p.key))}
      sel={sel}
      onSel={pick}
      finMap={finMap}
    />
  );

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
        {errQ ? null : loading ? <Loading /> : active ? (
          <PackKpi active={active} packs={packs} />
        ) : (
          <TsKpi packs={packs} finQ={finQ} planQ={planQ} />
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
            {/*
              * БАРИЛГА УГСРАЛТ нь ХАМГИЙН ДЭЭР (2026-09-10, хэрэглэгчийн
              * заавар: «хоцрогдолтой багц болон барилга угсралт 2 картын
              * байрыг соли»). Хоцрогдол нь СЭРЭМЖЛҮҮЛЭГ бөгөөд түүнийг
              * жагсаалтын толгойд тавихад ердийн ажлын явц хоёр дэлгэц
              * доош бууж, хуудас нээх бүрд эхлээд асуудал уншигддаг байв.
              */}
            {PACK_CATS.filter((c) => c.key === BUILD_CAT).map(catList)}
            {alerted.length > 0 && (
              <div className={ts.alertCard}>
                <TsPackList
                  title={tr('⚠ Хоцрогдолтой багц')}
                  note={tr('төлөвлөгөөнөөс хоцорсон')}
                  packs={alerted}
                  sel={sel}
                  onSel={pick}
                  finMap={finMap}
                />
              </div>
            )}
            {lagUnknown.length > 0 && (
              <Section title={tr('⚠ Хоцрогдол тодорхойгүй багц')}>
                <Note>{tr('{0}: бөглөх хуудас уншигдсангүй — хоцрогдол тооцоологдоогүй.', lagUnknown.map((p) => tr(p.name)).join(', '))}</Note>
              </Section>
            )}
            {finQ.state === 'error' && (
              <Section title={tr('⚠ Хоцрогдолтой багц')}>
                <Note>{tr('Санхүүгийн өгөгдөл татагдсангүй — хоцрогдол тооцоологдоогүй.')}</Note>
                <Data q={finQ}>{() => null}</Data>
              </Section>
            )}
            {/* ҮЛДСЭН АНГИЛЛУУД — инженерийн дэд бүтэц · нийгмийн барилга ·
                өндөржилт (барилга угсралт нь дээр, alert-тэй нь тусдаа) */}
            {PACK_CATS.filter((c) => c.key !== BUILD_CAT).map(catList)}
            <Note>
              {tr('Багц сонгоход баруунд гэрээ/төсөв, эх үүсвэр, блок бүрийн гүйцэтгэл, доор санхүүгийн график гарна. Зураг дээрх барилга дарахад баруун талд тухайн барилгын хяналт нээгдэнэ.')}
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
          layerStyle={parcelStyle}
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
          {(active ?? ovPack)?.kind === 'infra'
            ? (active ?? ovPack)!.layerIds.map((id) => (
              <span key={id} className={o.packLegendItem}>
                <i style={{ background: LAYER_BY_ID[id].hue } as CSSProperties} />
                {LAYER_BY_ID[id].title}
              </span>
            ))
            : PROGRESS_LEVELS.map((l, i) => (
              <span key={l.key} className={o.packLegendItem}>
                <i style={{ background: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length) } as CSSProperties} />
                {l.label} <b>{l.range}</b>
              </span>
            ))}
        </div>
      </div>

      {/* ── БАРУУН нэг багана: барилга дарсан бол ХЯНАЛТ, эс бөгөөс гэрээ+эх үүсвэр ── */}
      <div className={ts.r}>
        {pb ? (
          <>
            <button type="button" className={ts.backBtn} onClick={backToPack}>
              ‹ {pb.bagts} · {pb.blok} {tr('— багц руу буцах')}
            </button>
            <MonitorGeneral b={pb} q={perfQ} />
            <MonitorDetail b={pb} q={perfQ} />
          </>
        ) : errQ ? (
          <Data q={errQ}>{() => null}</Data>
        ) : !active ? (
          /* Багц сонгоогүй — ТӨСЛИЙН НЭГДСЭН: гэрээ/төсөв · эх үүсвэр · төлөв · блок гүйцэтгэл */
          <>
            <CatChart
              packs={packs}
              housing={finQ.state === 'ready' ? physNow(finQ.data, monthKey()) : finQ.state === 'error' ? null : undefined}
              infra={finQ.state === 'ready' ? infraPhysNow(finQ.data)?.pct ?? null : finQ.state === 'error' ? null : undefined}
            />
            {allPack && q.state === 'ready' && <LevelsCard pm={q.data.prog} keys={q.data.keys} ovByCat={ovByCat} />}
            {/* ТӨСЛИЙН НИЙТ давхцсан үлдсэн нэгж талбар — хэрэглэгчийн
                хүсэлтээр (2026-08-21) ТУСДАА КАРТ болгож БУЦААВ: FinCard-аас
                хассан нэгдсэн тоо. Багц бүрийн задаргаа нь доорх «Багц N —
                блокууд» картуудын толгойд; энэ нь бүх багцын НИЙТ (блок + дэд
                бүтэц, давхардалгүй). Сонголтгүй үед `overlap` яг энэ утга. */}
            <Section>
              {/* Алдааны үед шошго нь өөрөө «тоолж чадсангүй» гэж хэлнэ —
                  «—» дангаараа «0/өгөгдөлгүй»-тэй андуурагдана */}
              <span className={ts.ovTotLabel}>
                {overlap === 'error' ? tr('Давхцал тоолж чадсангүй') : tr('Давхцсан үлдсэн нэгж талбар')}
              </span>
              <b
                className={`${ts.ovTotVal} num`}
                style={{ color: overlap === 'error' ? 'var(--ink-3)' : ovOk?.oids.length ? 'var(--bad-ink)' : 'var(--good-ink)' }}
              >
                {overlap == null ? '…' : overlap === 'error' ? '—' : num(overlap.oids.length)}
              </b>
            </Section>
            {/* Блок бүрийн гүйцэтгэл — БАГЦААР нь бүлэглэсэн (нэг багц = нэг карт). */}
            {packs.filter((p) => p.kind === 'build').map((p) => (
              /* АНХДАГЧ нь ХААЛТТАЙ (2026-08-21) — олон багцын блок нэг
                 баганад маш урт тул үзье гэсэн нь нээж харна; refresh хийхэд
                 мөн хаалттай эхэлнэ. Нээхэд эхэлж багцын давхцсан үлдсэн
                 нэгж талбар, доор нь блокуудын мэдээлэл хэвээрээ. */
              <BlocksCard
                key={p.key}
                p={p}
                title={tr('{0} — блокууд', tr(p.name))}
                collapsible
                /* ЗӨВХӨН «Багц 1» анхнаасаа нээлттэй (2026-08-21, хэрэглэгчийн
                   хүсэлт) — жагсаалтын эхний багц жишээ болж дэлгэгдэнэ */
                defaultOpen={p.key === 'БАГЦ1'}
                overlapN={(() => {
                  const r = ovByPack?.get(p.key);
                  return ovByPack == null || r === undefined ? null : r === 'error' ? 'error' : r.oids.length;
                })()}
                overlapOids={(() => {
                  const r = ovByPack?.get(p.key);
                  return r && r !== 'error' ? r.oids : undefined;
                })()}
                onOverlapPick={(oids) => setOvPick(oids ? { key: p.key, oids } : null)}
                sel={cardSel?.key === p.key ? cardSel.oid : null}
                onSel={(v) => setCardSel(v ? { key: p.key, oid: v } : null)}
              />
            ))}
          </>
        ) : active.kind === 'build' ? (
          /* Барилгын багц — блокийн жагсаалт ба ажлын хяналт (БИЕТ явц) */
          <>
            <BlocksCard
              p={active}
              overlapN={overlap == null ? null : overlap === 'error' ? 'error' : overlap.oids.length}
              overlapOids={ovOk?.oids}
              onOverlapPick={(oids) => setOvPick(oids && active ? { key: active.key, oids } : null)}
            />
            <MonitorBagts bagts={active.name} />
          </>
        ) : (
          /* Дэд бүтцийн багц — давхаргын бүтэц */
          <LayersCard p={active} />
        )}
      </div>

      {/* ── ГҮЙЦЭТГЭЛИЙН МУРУЙ — төлөвлөсөн vs бодит, хоорондын ЗӨРҮҮ ── */}
      <div className={ts.prog}>
        <ProgChart
          months={progMonths}
          planFailed={planQ.state === 'error' ? -1 : planQ.state === 'ready' ? planQ.data.failed.length : 0}
          loading={planQ.state === 'loading' || finQ.state === 'loading'}
          title={(active
            ? tr('{0} — гүйцэтгэлийн явц', tr(active.name))
            : tr('Төсөл нийт — гүйцэтгэлийн явц') + (planExcl.length ? ` ${tr('(хуваарьтай багцаар)')}` : ''))
            + (chartCov ? ` · ${chartCov}` : '')}
        />
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
 * үеийн төслийн нэгдсэн 6 үзүүлэлт.
 */
function TsKpi(
  { packs, finQ, planQ }:
  { packs: Pack[]; finQ: Async<FinData>; planQ: Async<PlanCurve> },
) {
  const fin = finQ.state === 'ready' ? finQ.data : null;
  const plan = useMemo<PlanPoint[] | null>(() => (planQ.state === 'ready'
    ? (fin ? projectPlanOf(fin, planQ.data) : planQ.data.months)
    : null), [planQ, fin]);
  /** Уншигдаагүй бөглөх хуудсууд — төслийн муруй ХООСОН (`PlanCurve.failed`) */
  const planFailed = planQ.state === 'ready' ? planQ.data.failed.length : 0;
  /** Хэмжилт БОЛОМЖГҮЙ (алдаа) — «…» биш «—». */
  const failed = finQ.state === 'error' || planQ.state === 'error';
  const t = useMemo(() => {
    if (!fin) return null;
    const nowYm = monthKey();
    let planned: number | null = null;
    const actual = physNow(fin, nowYm);
    /*
     * ТӨЛӨВЛӨГӨӨ — ХУВААРИАС, доорх графиктай ЯГ НЭГ эх сурвалж.
     */
    let lastM: { label: string; physAt?: string | null } | null = null;
    for (const m of aggregateMonths(fin)) if (m.label <= nowYm && m.phys != null) lastM = m;
    const at = lastM ? measureDayOf(lastM.label, lastM.physAt, todayDayKey()) : `${nowYm}-31`;
    if (plan?.length) planned = planPctAt(plan, at);
    let gap = planned != null && actual != null ? planned - actual : null;
    let excluded: string[] = [];
    let actualShown = actual;
    let coverage: number | null = null;
    if (planQ.state === 'ready') {
      const ln = projectLagNow(fin, planQ.data, nowYm, todayDayKey());
      planned = ln.planned;
      gap = ln.gap;
      excluded = ln.excluded;
      if (ln.excluded.length) actualShown = ln.actual;
      coverage = ln.coverage;
    }
    return { planned, actual: actualShown, gap, excluded, coverage };
  }, [fin, plan, planQ]);
  /** Хэмжигдээгүй утгын дэлгэц: ачаалж байхад л «…», бусад үед (алдаа, эсвэл
      бэлэн ч утга null — мэдээлэлгүй) «—». */
  const loading = finQ.state === 'loading' || planQ.state === 'loading';
  const none = loading && !failed ? '…' : '—';
  const covNote = coverageNote(t?.coverage);
  const items = [
      { v: num(packs.length), l: tr('нийт төслийн тоо'), h: tr('Багцын бүртгэлд буй бүх багц ажил — гэрээ, санхүүжилт бүртгэгдээгүй багц ч орно') },
      {
        v: t?.actual == null ? none : pct(t.actual, 1),
        l: t?.excluded.length ? `${tr('бодит гүйцэтгэлийн хувь')} ${tr('(хуваарьтай багцаар)')}` : tr('бодит гүйцэтгэлийн хувь'),
      },
      { v: t?.planned == null ? none : pct(t.planned, 1), l: tr('төлөвлөсөн гүйцэтгэлийн хувь') + (covNote ? ` · ${covNote}` : '') },
      {
        v: t?.gap == null ? none : gapPts(t.gap),
        l: tr('гүйцэтгэлийн зөрүүгийн хувь')
          + (t?.gap != null && !coverageOk(t.coverage) ? ` · ${tr('хуваарь дутуу — дүгнэхгүй')}` : ''),
    },
  ];
  const errQ: Async<unknown> | null =
    finQ.state === 'error' ? finQ : planQ.state === 'error' ? planQ : null;
  return (
    <>
      {!errQ && planFailed > 0 && (
        <div className={o.tile} style={{ '--tone': 'var(--warn)' } as CSSProperties}>
          <span className={o.tileLabel}>{tr('{0} багцын хуудас уншигдсангүй — дүн дутуу', planFailed)}</span>
        </div>
      )}
      {items.map((i) => (
        /* Нэг аяс (--data) — өнгөөр ялгах утга биш, зэрэгцсэн нэг эгнээ */
        <div key={i.l} className={o.tile} style={{ '--tone': 'var(--data)' } as CSSProperties}>
          <span className={`${o.tileVal} num`} title={'h' in i && i.h ? i.h : i.v}><b>{i.v}</b></span>
          <span className={o.tileLabel}>{i.l}</span>
        </div>
      ))}
      {errQ && (
        <div className={o.tile} style={{ '--tone': 'var(--bad)' } as CSSProperties}>
          <Data q={errQ}>{() => null}</Data>
        </div>
      )}
    </>
  );
}

function TsPackList({
  title, note, packs, sel, onSel, finMap,
}: {
  title: string;
  note: string;
  packs: Pack[];
  sel: string | null;
  onSel: (k: string | null) => void;
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
}) {
  if (!packs.length) return null;
  /**
   * ALERT-тэй багц БҮЛГИЙНХЭЭ ХАМГИЙН ДЭЭР: улаан → шар → хэвийн гэсэн
   * зэрэглэлээр, alert доторх нь хоцрогдлын хэмжээгээр (их нь эхэнд).
   * Дата шинэчлэгдэж гүйцэтгэл хэвийн болмогц lag арилдаг тул багц ААНДАА
   * хэвийн дарааллынхаа байранд буцна — тусгай төлөв хадгалахгүй.
   */
  const rows = packs
    .map((p) => {
      const months = finMap?.get(p.key) ?? null;
      /* ХОЦРОГДОЛ — БИЕТ явц төлөвлөсөн явцаас хэдэн ХУВЬ хоцорсон */
      const lag = months ? lagOf(months) : null;
      const lvl = lagLevelOf(lag);
      let execPct: number | null = null;
      execPct = physLatest(months);
      return { p, lag, lvl, execPct };
    })
    .sort((a, b) => {
      const rank = (l: 'red' | 'yellow' | null) => (l === 'red' ? 0 : l === 'yellow' ? 1 : 2);
      /* Ижил зэрэглэлд ХОЦРОГДЛЫН ХУВЬ-аар — их нь эхэнд */
      return rank(a.lvl) - rank(b.lvl) || (b.lag?.gap ?? 0) - (a.lag?.gap ?? 0);
    });
  return (
    <Section
      title={title}
      note={tr('{0} багц · {1}', num(packs.length), note)}
      collapsible
    >
      <List>
        {rows.map(({ p, lag, lvl, execPct }) => {
          /* Сонгогдсон эсэх — мөрийг тодруулахад. Сонголтын үр дүн нь доод
             бүтэн график ба баруун картуудад гарна. */
          const open = p.key === sel;
          return (
            <Fragment key={p.key}>
            <ListItem
              title={tr(p.name)}
              sub={p.kind === 'build'
                  ? tr('{0} блок · {1} айл{2}', num(blockCount(p)), num(p.households), lag && (lvl || !lagJudged(lag))
                    ? tr(' · төл. {0}% / бодит {1}%', lag.planned.toFixed(1), lag.actual.toFixed(1))
                      + (lagJudged(lag) || !coverageNote(lag.coverage) ? '' : ` · ${coverageNote(lag.coverage)}`)
                    : '')
                  /* Дэд бүтэц: гүйцэтгэлийн харагдацад мөнгө дурдахгүй —
                     зөвхөн зурагт хэдэн давхаргатай нь. */
                  : (p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй'))}
              value={
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  flexWrap: 'wrap', justifyContent: 'flex-end',
                }}>
                  {execPct == null ? '—' : pct(execPct, 1)}
                  {lvl && lag && (
                    <b
                      className={`${ts.gapBadge} ${lvl === 'red' ? ts.gapRed : ts.gapYellow}`}
                      title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
                    >
                      <span className={lvl === 'red' ? ts.alertBlink : undefined}>⚠</span>
                      <span className="num">{gapPts(lag.gap)}</span>
                      <small className="num">
                        {lag.planned.toFixed(1)}/{lag.actual.toFixed(1)}
                      </small>
                    </b>
                  )}
                </span>
              }
              color={lvl === 'red' ? 'var(--bad)' : lvl === 'yellow' ? 'var(--warn)' : p.kind === 'build' ? levelColor(execPct) : cat(2)}
              active={open}
              onClick={() => onSel(open ? null : p.key)}
            />
            {open && p.kind === 'infra' && <PackLayers layerIds={p.layerIds} />}
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
 * нь орон сууцны биет % (`physNow`, 2026-09-30), бусад ангилал нь санхүүгийн гүйцэтгэл % (олгосон ÷
 * төлөвлөгөө — зүүн жагсаалттай ИЖИЛ дүрэм тул тоо зөрөхгүй). Ангилал бүрд
 * багцын тоо шошгонд хамт гарна.
 */
/**
 * БАГЦ БҮРИЙН САНХҮҮЖИЛТ — төлөвлөгөө, олгосон, олгосон хувь.
 */
function CatChart({ packs, housing, infra }: {
  packs: Pack[];
  /**
   * Орон сууцны (барилга угсралт) биет хувь — `physNow` (ХО дүнгээр жигнэсэн,
   * `gdash.housingPct`). `undefined` = ачаалж байна («…»), `null` = мэдээлэлгүй.
   */
  housing: number | null | undefined;
  infra?: number | null;
}) {
  const rows = PACK_CATS.map((c) => {
    const list = packs.filter((p) => catOf(p) === c.key);
    const pcts: number[] = [];
    if (c.key === 'build') {
      return { c, n: list.length, mean: housing ?? null, wait: housing === undefined };
    }
    if (c.key === 'infra') {
      return { c, n: list.length, mean: infra ?? null, wait: infra === undefined };
    }
    for (const p of list) {
      if (p.kind !== 'build') continue;
      for (const b of p.blocks) if (b.progress != null) pcts.push(b.progress);
    }
    const mean = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    return { c, n: list.length, mean, wait: false };
  });
  return (
    <Section
      tone="primary"
      title={tr('Төслийн төрөл')}
      note={tr('{0} багц ажил', num(packs.length))}
    >
      <Bars
        max={100}
        items={rows.map((r, i) => ({
          key: r.c.key,
          label: `${r.c.name()} · ${num(r.n)}`,
          value: r.mean,
          color: cat(i),
          display: r.wait ? '…' : r.mean == null ? tr('мэдээлэлгүй') : pct(r.mean, 1),
        }))}
      />
    </Section>
  );
}

/** Блокийн ТӨЛӨВИЙН тоолол — 113 блок гүйцэтгэлийн 4 түвшнээр (сонгоогүй үед) */
function LevelsCard({
  pm,
  keys,
  ovByCat,
}: {
  /** Блок бүрийн хэмжилт (`loadBuildings().prog`) */
  pm: BlockProgressMap;
  /** Хуваарь — бөглөх хуудасны БҮХ блок (`loadBuildings().keys` = `universeKeys`) */
  keys: readonly string[];
  /**
   * Ангилал бүрийн асуудалтай (давхцсан үлдсэн) нэгж талбар — null = ачаалж
   * байна, `'error'` = тухайн ангиллын тоолол унасан («0» гэж худлахгүй).
   */
  ovByCat: Map<PackCat, number | 'error'> | null;
}) {
  const counts = levelCounts(pm, keys);
  const total = counts.reduce((a, b) => a + b, 0);
  const all = new Set<string>(keys);
  pm.forEach((_, k) => all.add(k));
  let noData = 0;
  all.forEach((k) => { const v = pm.get(k)?.overall; if (v == null || !Number.isFinite(v)) noData++; });
  return (
    <Section title={tr('Блокийн төлөв')} note={tr('{0} блок{1}', total, noData ? tr(' · {0} тайлангүй (0%)', noData) : '')}>
      <Bars
        color={HUE}
        items={PROGRESS_LEVELS.map((l, i) => ({
          key: l.key,
          label: `${l.label} ${l.range}`,
          value: counts[i],
          color: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length),
          display: tr('{0} блок', counts[i]),
        }))}
      />
      {/* АСУУДАЛТАЙ НЭГЖ ТАЛБАР — ангиллаар (2026-08-21, хэрэглэгчийн
          хүсэлт): блокуудын картууд ХААЛТТАЙ үед ч эндээс байнга уншигдана.
          Тоо нь тухайн ангиллын бүх давхаргатай давхцсан талбарын
          давхардалгүй тоолол. */}
      <div className={o.ovDivider} style={{ marginTop: 12 }}>{tr('Асуудалтай нэгж талбар')}</div>
      <Rows
        items={PACK_CATS.map((c) => {
          const v = ovByCat?.get(c.key);
          return {
            key: c.name(),
            value: (
              /* Алдаа ≠ «0 асуудалтай» — саарал «—», тайлбар нь title-д */
              <span
                className="num"
                style={v === 'error' ? { color: 'var(--ink-3)' } : undefined}
                title={v === 'error' ? tr('давхцал тоолж чадсангүй') : undefined}
              >
                {ovByCat == null ? '…' : v === 'error' ? '—' : num(v ?? 0)}
              </span>
            ),
          };
        })}
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



/**
 * ГҮЙЦЭТГЭЛИЙН ЯВЦ — ТӨЛӨВЛӨСӨН vs БОДИТ, хоорондын ЗӨРҮҮ будагдана.
 */
/**
 * Бүхэлчлэл нь ЖИЖИГ ХӨДӨЛГӨӨНИЙГ НУУНА: 26.14% → 27% гэж бөөрөнхийлөхөд
 * тухайн өдөр 0.4 нэгжээр ахисан гүйцэтгэл дэлгэц дээр ОГТ өөрчлөгдөөгүй
 * мэт харагдана. Мөн «0%» нь «эхлээгүй» ба «0.4% хийгдсэн» хоёрыг
 * ялгахгүй болгоно.
 */
export function ProgChart({ months, title, planFailed = 0, loading = false }: {
  months: ProgPt[] | null;
  title: string;
  loading?: boolean;
  /**
   * Уншигдаагүй бөглөх хуудасны тоо (`PlanCurve.failed`); `-1` = муруй бүхэлдээ
   * уншигдсангүй. 2026-09-25: урьд нь хоёулаа «Гүйцэтгэлийн дата алга» гэж
   * харагдаж, «дата байхгүй» ба «уншиж чадсангүй» ялгагддаггүй байв.
   */
  planFailed?: number;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = useChartWidth(wrapRef, 1200);

  if (!months || !months.length) {
    return (
      <Section title={title}>
        <Empty label={planFailed !== 0
          ? (planFailed > 0
            ? tr('{0} багцын хуудас уншигдсангүй — дүн дутуу', planFailed)
            : tr('Төлөвлөгөөт муруй уншигдсангүй'))
          : loading ? tr('Ачаалж байна…') : tr('Гүйцэтгэлийн өгөгдөл алга.')}
        />
      </Section>
    );
  }

  const rows = months;
  const measured = rows.map((r, i) => (r.act == null ? -1 : i)).filter((i) => i >= 0);
  const lastAct = measured.length ? measured[measured.length - 1] : -1;
  const cur = lastAct >= 0 ? rows[lastAct] : null;
  const curAct = cur?.act ?? null;
  const curGap = curAct == null ? null : (cur!.planM ?? cur!.plan) - curAct;
  const behind = (curGap ?? 0) > 0;

  const N = rows.length;
  const H = 250;
  const padL = 40;
  const padR = 56;  /* сүүлийн цэгийн шошго */
  const padT = 24;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;

  const planPts = rows.map((r, i) => ({ x: xFor(i), y: yFor(r.plan) }));
  const actPts = rows.map((r, i) => (r.act == null ? null : { x: xFor(i), y: yFor(r.act) }));
  const planSegs = lineSegments(planPts);
  const actSegs = lineSegments(actPts);

  /*
   * ЗӨРҮҮГИЙН ТАЛБАЙ — төлөвлөгөөний муруйгаас бодит муруй хүртэл.
   */
  const gapAreas = actSegs.filter((sg) => !sg.single).map((sg) => {
    const top = monotonePath(planPts, sg.from, sg.to);
    const back = monotonePath([...sg.pts].reverse()).replace(/^M/, 'L');
    return `${top} ${back} Z`;
  });

  const hv = hi != null && hi >= 0 && hi < N ? hi : null;
  const pt = hv != null ? rows[hv] : null;
  const ptPlan = pt ? (pt.act != null ? (pt.planM ?? pt.plan) : pt.plan) : 0;
  const anchor =(i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');
  const PLAN_C = 'var(--chart-plan)';
  const ACT_C = 'var(--chart-actual)';
  /* Цэгийн тэмдэг — 5px дүүргэлт (`CHART.markerR`) + гадна талд 2px гадаргуун цагираг (`CHART.ring`). */
  const dotOp = (i: number) => (hv == null ? 0.5 : i === hv ? 1 : 0.15);
  const dot = (cx: number, cy: number, fill: string, op: number) => (
    <circle cx={cx} cy={cy} r={CHART.markerR + CHART.ring / 2} className={ts.progDot} style={{ fill, strokeWidth: CHART.ring, opacity: op }} />
  );
  const envThin = (i: number, last: number) => {
    if (N <= 1 || i === 0 || i === last) return true;
    const gap = 100 / (N - 1);
    const step = Math.max(1, Math.ceil(11 / gap));
    return i % step === 0 && (last - i) * gap >= 11;
  };

  /*
   *    Тэнд 2026-08-25-нд «зөвхөн эцсийн утга үзүүлэх нь БУРУУ: 12 сарын урт
   *    графикийг гаргаад ганц тоо уншуулах юм бол график хэрэггүй» гэж
   *    зассан байсныг энэ график давтаж, дахин ЗӨВХӨН сүүлийн цэгээ
   *    тоогоор бичдэг байв (2026-08-27).
   */
  const fitPct = (idx: number[], valOf: (i: number) => string) => new Set(
    fitLabels(idx.map((i) => ({ i, x: xFor(i), w: textW(valOf(i)), anchor: anchor(i) }))),
  );
  const planLbl = fitPct(
    rows.map((_, i) => i).filter((i) => i !== N - 1 && envThin(i, N - 1)),
    (i) => pct(rows[i].plan, 1),
  );
  const actLbl = fitPct(
    measured.filter((i) => i !== N - 1 && i !== lastAct && envThin(i, lastAct)),
    (i) => pct(rows[i].act, 1),
  );
  /* X тэнхлэгийн он·сар — «2026-09» */
  const axisLbl = new Set(fitLabels(
    rows.map((r, i) => ({ i, x: xFor(i), w: textW(r.label, 11), anchor: anchor(i) })),
    14,
  ));

  return (
    <Section
      title={title}
      note={
        curGap == null ? undefined : (
          <span className={behind ? ts.progBad : ts.progGood}>
            {gapPtsWord(curGap)}
          </span>
        )
      }
    >
      {/* Легенд — тэмдэг нь ШУГАМЫН ХЭЛБЭРИЙГ давтана */}
      <div className={ts.progLegend}>
        <span><i className={ts.progDash} style={{ color: PLAN_C }} />{tr('Төлөвлөсөн')}</span>
        {measured.length > 0 && (
          <>
            <span><i className={ts.progSolid} style={{ background: ACT_C }} />{tr('Бодит гүйцэтгэл')}</span>
            <span><i className={behind ? ts.progAreaBad : ts.progAreaGood} />{tr('Зөрүү')}</span>
          </>
        )}
        {measured.length === 0 && (
          <span className={ts.progNoData}>
            {loading ? tr('Ачаалж байна…') : tr('Бодит гүйцэтгэл хараахан бөглөгдөөгүй')}
          </span>
        )}
      </div>

      <div
        className={ts.progWrap}
        ref={wrapRef}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = (e.clientX - r.left - padL) / Math.max(1, plotW);
          setHi(Math.max(0, Math.min(N - 1, Math.round(t * (N - 1)))));
        }}
        onMouseLeave={() => setHi(null)}
        tabIndex={0}
        role="group"
        aria-label={tr('{0} — сар сонгохдоо ← → товч', title)}
        onFocus={() => setHi((h) => h ?? (lastAct >= 0 ? lastAct : N - 1))}
        onBlur={() => setHi(null)}
        onKeyDown={(e) => {
          const cur = hv ?? (lastAct >= 0 ? lastAct : N - 1);
          const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1
            : e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : null;
          if (next == null) return;
          e.preventDefault();
          setHi(Math.max(0, Math.min(N - 1, next)));
        }}
      >
        {/* Дэлгэц уншигчийн уншилт — фокус/hover-ийн сарын утгууд (tooltip-тэй ижил тоо) */}
        <span aria-live="polite" style={SR_ONLY}>
          {pt ? tr('{0}: төлөвлөсөн {1}, бодит {2}, зөрүү {3}',
            pt.label, pct(ptPlan, 1), pt.act == null ? '—' : pct(pt.act, 1),
            pt.act == null ? '—' : gapPts(ptPlan - pt.act)) : ''}
        </span>
        <svg className={ts.progSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {/* Тор — 0/25/50/75/100%, шошго торны ЗҮҮН талд */}
          {CHART.grid.map((t) => {
            const gy = yFor(t);
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={ts.progGrid} />
                <text x={padL - 8} y={gy + 3} className={ts.progAxisY} textAnchor="end">{t}%</text>
              </g>
            );
          })}

          {/* ЗӨРҮҮ — байрлалаараа өнгөтэй: бодит нь доогуур бол улаан */}
          {gapAreas.map((d, k) => (
            <path key={`gap-${k}`} d={d} className={behind ? ts.progGapBad : ts.progGapGood} style={{ opacity: CHART.gapFill }} />
          ))}

          {planSegs.map((sg) => (sg.single ? null : (
            <path
              key={`pl-${sg.from}`}
              d={sg.d}
              className={ts.progPlan}
              style={{ stroke: PLAN_C, strokeWidth: CHART.stroke, strokeDasharray: CHART.planDash, strokeLinecap: 'butt' }}
              vectorEffect="non-scaling-stroke"
            />
          )))}
          {/* Ганцаарчилсан хэмжилт (хоёр талдаа цоорхой) — шугамгүй; цэгийг доорх ЦЭГҮҮД давхарга зурна */}
          {actSegs.map((sg) => (sg.single ? null : (
            <path
              key={`as-${sg.from}`}
              d={sg.d}
              className={ts.progAct}
              style={{ stroke: ACT_C, strokeWidth: CHART.stroke }}
              vectorEffect="non-scaling-stroke"
            />
          )))}

          {/* Hover — босоо шугам. 2026-10-23: Environment crosshair — `--data` 1px `2 2`.7;
              цуваа бүрийн 7px тэмдэг (`SvgHoverMarker`) ХАСАГДСАН — цэг нь доор 1 тунгалагтай тодорно. */}
          {hv != null && (
            <line x1={xFor(hv)} x2={xFor(hv)} y1={padT} y2={padT + plotH} className={ts.progCursor} />
          )}

          {/* ЦЭГҮҮД — бүх сарын төлөвлөгөө, зөвхөн ХЭМЖИГДСЭН сарын бодит (null ≠ 0). */}
          {rows.map((r, i) => <g key={`pd-${i}`}>{dot(xFor(i), yFor(r.plan), PLAN_C, dotOp(i))}</g>)}
          {rows.map((r, i) => (r.act != null ? <g key={`ad-${i}`}>{dot(xFor(i), yFor(r.act), ACT_C, dotOp(i))}</g> : null))}

          {/* ТӨЛӨВЛӨГӨӨНИЙ утга — муруйн ДЭЭР талд. */}
          {rows.map((r, i) => (planLbl.has(i) ? (
            <g key={`pl-${i}`}>
              <text
                x={xFor(i)}
                y={Math.max(12, yFor(r.plan) - 9)}
                className={`${ts.progVal} ${i === hv ? ts.progValOn : ''}`}
                textAnchor={anchor(i)}
              >
                {pct(r.plan, 1)}
                {r.vol != null && (
                  <tspan className={ts.progVol}>{` · ${num(r.vol, 0)}`}</tspan>
                )}
              </text>
            </g>
          ) : null))}

          {/* БОДИТ гүйцэтгэлийн утга — муруйн ДООР талд, зөвхөн ХЭМЖИГДСЭН сард. */}
          {rows.map((r, i) => (actLbl.has(i) && r.act != null ? (
            <g key={`ac-${i}`}>
              <text
                x={xFor(i)}
                y={Math.min(padT + plotH - 4, yFor(r.act) + 16)}
                className={`${ts.progVal} ${i === hv ? ts.progValOn : ''}`}
                textAnchor={anchor(i)}
              >
                {pct(r.act, 1)}
              </text>
            </g>
          ) : null))}

          {/* Сүүлийн цэгүүдийн утга — цэгийн БАРУУН талд. */}
          <text
            x={xFor(N - 1) + 9}
            y={yFor(rows[N - 1].plan) + 4}
            className={`${ts.progEnd} ${hv === N - 1 ? ts.progValOn : ''}`}
          >
            {pct(rows[N - 1].plan, 1)}
          </text>
          {curAct != null && (
            <text
              x={xFor(lastAct) + 9}
              y={yFor(curAct) + 4}
              className={`${ts.progEnd} ${hv === lastAct ? ts.progValOn : ''}`}
            >
              {pct(curAct, 1)}
            </text>
          )}

          {/* X тэнхлэг — он сар */}
          {rows.map((r, i) => (axisLbl.has(i) ? (
            <text key={r.label} x={xFor(i)} y={H - 9} className={`${ts.progAxisX} ${i === hv ? ts.progAxisXOn : ''}`} textAnchor={anchor(i)}>
              {r.label}
            </text>
          ) : null))}
        </svg>

        {pt && hv != null && (() => {
          /* Түшиц цэг — бодит (хэмжигдсэн бол), эс бөгөөс төлөвлөгөө */
          const ty = pt.act != null ? yFor(pt.act) : yFor(pt.plan);
          const t = (xFor(hv) - padL) / Math.max(1, plotW);
          const shift = t < 0.22 ? '0%' : t > 0.78 ? '-100%' : '-50%';
          const below = (ty / H) * 100 < 45;
          /* Өмнөх сараас өөрчлөлт — ХОЁУЛАА хэмжигдсэн үед л (null ≠ 0) */
          const prev = hv > 0 ? rows[hv - 1].act : null;
          const d = pt.act != null && prev != null ? pt.act - prev : null;
          return (
            <div
              className={ts.progTip}
              style={{ left: xFor(hv), top: ty, transform: `translate(${shift}, ${below ? '10px' : 'calc(-100% - 10px)'})` }}
            >
              <div className={ts.progTipHd}>
                <span className={ts.progTipDot} style={{ background: ACT_C }} />
                <span className="num">{pt.label}</span>
              </div>
              <div className={ts.progTipBody}>
                <div className={ts.progTipMain}>
                  <span className={`num ${ts.progTipBig}`} style={{ color: ACT_C }}>{pct(pt.act, 1)}</span>
                  <span className={ts.progTipUnit}>{tr('Бодит')}</span>
                </div>
                {d != null && (
                  <div className={ts.progTipMeta}>
                    <span className="num" style={{ color: d !== 0 ? 'var(--data)' : 'var(--ink-3)' }}>
                      {d > 0 ? '▲' : d < 0 ? '▼' : '='} {tr('{0} н.х', num(Math.abs(d), 1))}
                    </span>
                  </div>
                )}
                <p className={ts.progTipRow}>
                  <i className={ts.progTipSwDash} />
                  {tr('Төлөвлөсөн')}<b className="num">{pct(ptPlan, 1)}</b>
                </p>
                <p className={ts.progTipRow}>
                  <i />
                  {tr('Зөрүү')}
                  <b className="num">
                    {pt.act == null ? '—' : gapPts(ptPlan - pt.act)}
                  </b>
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </Section>
  );
}

'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { usePlanTotals } from '@/lib/totals';
import { Section, Note, Data, Empty, Rows, Bars, List, ListItem } from '@/components/ui';
import { PackLayers } from '@/components/PackLayers';
import {
  buildPacks, PackKpi, BlocksCard, LayersCard, levelColor, blockCount, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import {
  useBuildings, MonitorBagts, MonitorGeneral, MonitorDetail, useTaskPerf,
  pickedBuilding, uniqueBlocks, type PickedBuilding,
} from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, pkgMonthsMap, physLatest, lagOf, lagLevel, projectPlanOf,
  projectPlanScope, projectLagNow, planScopeNote, type FinData,
} from '@/modules/Finance';
import { useAsync, type Async } from '@/lib/useAsync';
import { levelCounts, type BlockProgressMap } from '@/lib/blockProgress';
import {
  HUE, catOf, aggregateMonths, physNow, progMonthsOf, pp, ppAbs, SR_ONLY, type PackCat,
} from '@/modules/pkgShared';
/* ⚠️ Хуучин импортлогчдод — `aggregateMonths` урьд нь эндээс экспортлогддог байв. */
export { aggregateMonths, physNow } from '@/modules/pkgShared';
import { gapPts } from '@/lib/gdash';
import { loadPlanCurveCached, planPctAt, measureDayOf, type PlanPoint, type PlanCurve } from '@/lib/planProgress';

/**
 * «Гүйцэтгэлийн явц» графикийн нэг цэг — ТӨЛӨВЛӨГӨӨ (хуваариас) ба БОДИТ
 * (биет гүйцэтгэл), хоёулаа ХУВЬ.
 *
 * ⚠️ 2026-09-06: урьд нь `MonthPt` (санхүүгийн цэг)-ийг дамжуулж, төлөвлөгөөг
 *    түүний `cumPct` талбараас уншдаг байв — тэр нь МӨНГӨний өссөн хувь
 *    бөгөөд биет %-тай харьцуулагдаж болохгүй. Одоо графикт зөвхөн өөрийнх
 *    нь хэрэгтэй хоёр тоо орно, мөнгөн талбар огт байхгүй.
 */
/**
 * ⚠️ `vol` — тухайн сард ТӨЛӨВЛӨСӨН обьём (хуваарийн сарын задаргаанаас).
 *    `null` = задаргаа ороогүй; 0 БИШ. Нэгж холилдсон нийлбэр тул зөвхөн
 *    ХАРУУЛНА, тооцоонд ОРОХГҮЙ (`planProgress.PlanPoint.vol`-ийн ⚠️).
 */
/* ⚠️ export (2026-09-30) — «ТУХ» ижил графикийг ашиглана (нэг график хэл) */
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
 *
 * ⚠️ ШИНЭ ЛОГИК БАРАГ БИЧЭЭГҮЙ: картууд нь Bagts-ийн, барилгын хяналт нь
 * BuildingPanel-ийн, санхүүгийн график нь Finance-ийн ЭКСПОРТ — гурван хуучин
 * харагдацын ажиллагаа өөрчлөлтгүй ЭНД дахин угсрагдана. Хуучин 3 цэс хэвээр;
 * нэгтгэл батлагдмагц устгаж болно.
 */

/** Дараалал нь дэлгэцийн дараалал; нэрийг render үед tr()-ээр авна */
/**
 * БАРИЛГА УГСРАЛТЫН АНГИЛАЛ — жагсаалтын ТОЛГОЙД гардаг (2026-09-10).
 * ⚠️ Тогтмолоор нэрлэв: `PACK_CATS`-ийн дараалал өөрчлөгдөхөд ч «аль нь
 *    дээр вэ» гэдэг нь индексээр биш УТГААР тодорхойлогдоно.
 */
const BUILD_CAT: PackCat = 'build';
const PACK_CATS: { key: PackCat; name: () => string }[] = [
  { key: 'build', name: () => tr('Барилга угсралт') },
  /* ⚠️ «Инженерийн дэд бүтэц» (2026-09-10, хэрэглэгчийн заавар): зөвхөн
     «Дэд бүтэц» гэвэл нийгмийн дэд бүтэцтэй андуурагдана. */
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
 * ⚠️ ЭНЭ МОДУЛЬ ЗӨВХӨН «БАГЦЫН ГҮЙЦЭТГЭЛ»-Д. 
 *
 * ⚠️ 2026-08-21 (хэрэглэгчийн хүсэлт): урьд нь ГАНЦ «Багцын хяналт» цонх гэрээ,
 * санхүүжилт, биет явц, барилгын хяналтыг БҮГДИЙГ багтааж, баруун багана 6-7
 * карт болдог байв. Одоо хоёр харагдац НЭГ модулиас гарна:
 *
 *   · `fin`  — гэрээ, CASHFLOW, олгосон санхүүжилт, хөрөнгө оруулалт
 *   · `prog` — биет явц, блокийн төлөв, давхцал, барилгын хяналт
 *
 * Багцын жагсаалт, газрын зураг, өгөгдөл ачаалалт нь ХОЁУЛАНД ижил тул
 * хуваалцагдана — салгасан нь ЗӨВХӨН дээд индикатор ба баруун баганын карт.
 */
/* ⚠️ 2026-10-08: `Date.now()`-ийг render-ийн гадна (react-hooks/purity) — `monthKey()`-тэй ижил загвар */
const todayDayKey = (): string => dayKey(Date.now());

export function PkgProg({ dim, setDim }: {
  dim: Dim;
  setDim: (d: Dim) => void;
}) {
  /**
   * Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   * ⚠️ Горим тус бүр ӨӨРИЙН өргөнтэй: санхүүгийн баруун багана нь графиктай,
   * гүйцэтгэлийнх нь блокийн урт жагсаалттай — нэг утга хоёуланд тохирохгүй.
   */
  /* ⚠️ 2026-09-30: `hostRef`-ийг ТУСАД НЬ задална — React Compiler нь `*Ref` нэртэй
     талбар агуулсан обьектыг бүхэлд нь ref гэж үзэж, `side.style`/`side.left`
     хандалт бүрийг «render үеийн ref хандалт» гэж анхааруулдаг байв. */
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
  /* ⚠️ 2026-10-07: харагдац ХААГДАХАД ч тодруулгыг арилгана — `MapProvider.hl` порталын
     хэмжээнд амьдардаг тул зурагт дарсан барилгын тодруулга (`onMapPick`) дараагийн
     харагдацын зурагт үлддэг байв. `Dashboard`-ын 2026-09-29-ний unmount-цэвэрлэлттэй
     ижил зарчим. */
  useEffect(() => () => { setHighlight(null); }, [setHighlight]);
  useEffect(() => { writeParams({ pkg: sel }); }, [sel]);

  const packs = useMemo<Pack[]>(
    /* ⚠️ 2026-09-30: `pkgPct` — сонгосон багцын KPI хавтан (`PackKpi`) жагсаалтын
       «бодит гүйцэтгэл» (`physLatest`)-тэй нэг тоо (`Bagts.buildPacks`-ийн ⚠️) */
    () => (q.state === 'ready' ? buildPacks(q.data.rows, q.data.pkgPct) : buildPacks(null)),
    [q],
  );

  const active = packs.find((p) => p.key === sel) ?? null;

  /**
   * БАГЦТАЙ ДАВХЦАЖ БУЙ «ҮЛДСЭН НЭГЖ ТАЛБАР» — чөлөөлөгдөөгүй, барилга
   * эхлүүлэхэд саад болж буй газар. Багц сонгоход орон зайн огтлолцлоор олж,
   * газрын зурагт зурж, тоог нь KPI-д гаргана.
   *
   * ⚠️ Хариу хожуу ирж БУСАД багцын үр дүнг дарж бичихээс `alive` хамгаална
   *    (хэрэглэгч хурдан дараалан сонгоход).
   */
  /* ⚠️ Алдааг `{oids: []}`-оор ОРЛУУЛАХГҮЙ — «0 саад» нь ногооноор «саад алга»
     гэсэн ХАРИУЛТ болж уншигддаг тул татаж чадаагүйг жинхэнэ 0-ээс ялгаж
     `'error'` төлөвт хадгална (KPI/картад саарлаар «тоолж чадсангүй»). */
  const [overlap, setOverlap] = useState<Overlap | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    setOverlap(null);
    /* ⚠️ Багц СОНГООГҮЙ үед ч тоолно — тэгэхдээ БҮХ блокоор (`where = null`),
       өөрөөр хэлбэл төслийн НИЙТ саад. Урьд нь сонголтгүй үед огт тоолохгүй
       байсан тул хэрэглэгч «нийт хэдэн талбар саад болж байна» гэдгийг
       мэдэхийн тулд багц бүрийг ээлжлэн сонгох шаардлагатай байв. */
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
    /* ⚠️ ХАГАС ҮР ДҮН = АЛДАА (2026-09-25 аудит): `overlapLeftParcels` нь зарим
       давхарга унавал (429 г.м.) `failed: [...]`-тай ДУТУУ тоо буцаадаг — урьд нь
       бүрэн тоо мэт (12 нь 20-ын оронд, эсвэл ногоон 0) харагддаг байв.
       `pkgSaad`-ийн ижил дүрэм; кэш хагас хариуг хадгалдаггүй тул дахин ачаалахад
       дахин оролдоно. */
    overlapLeftParcels(srcs)
      .then((r) => alive && setOverlap(r.failed?.length ? 'error' : r))
      .catch(() => alive && setOverlap('error'));
    return () => {
      alive = false;
    };
    /* ⚠️ `packs` ЗААВАЛ — багц сонгоогүй үед эх сурвалжийг `packs`-аас бүрдүүлдэг;
       урьд нь өгөгдөл ачаалагдахаас өмнөх хоосон `packs`-аар тоолоод дахин
       тоолдоггүй тул дэд бүтцийн багцын саад нийт тоонд ордоггүй байв. */
  }, [active, packs]);

  /** Амжилттай үр дүн л — зурагт/шүүлтэд алдааны төлөв «хоосон» мэт орохгүй */
  const ovOk = overlap !== 'error' ? overlap : null;

  /**
   * КАРТААС СОНГОСОН давхцсан талбарууд — газрын зураг ҮҮГЭЭР нарийсна.
   *
   * ⚠️ `ovOk` нь ТӨСЛИЙН (эсвэл сонгосон багцын) БҮХ давхцсан талбар. Багцын
   *    картын зурвас дээр дарахад зөвхөн ТЭР багцынх үлдэх ёстой — эс бөгөөс
   *    зураг нэг талбар руу ойртсон ч эргэн тойронд өөр багцын хэдэн арван
   *    улаан полигон зурагдсан хэвээр байна.
   */
  /**
   * ⚠️ ЗӨВХӨН OID БИШ, БАГЦЫН ТҮЛХҮҮР ч хамт. Талбарууд нь «хаана саад байна»
   *    гэдгийг хэлдэг ч «ЮУНД саад болж байна» гэдгийг хэлдэггүй: сонгосон
   *    багцын ӨӨРИЙН давхарга (цахилгааны шугам, ус хангамжийн цагираг г.м.)
   *    зурагдахгүй бол хэрэглэгч улаан талбаруудыг хоосон агаарт хараад
   *    учрыг нь олохгүй (2026-08-27, хэрэглэгчийн заалт).
   */
  const [ovPick, setOvPick] = useState<{ key: string; oids: number[] } | null>(null);
  /**
   * ⚠️ 2026-09-21: багц СОНГООГҮЙ үеийн «Багц N — блокууд» картуудын
   * сонголт — НЭГ л карт, нэг л мөр (`BlocksCard.sel`-ийн тайлбар).
   * `oid` нь блокийн OID эсвэл давхцлын зурвасын түлхүүр (`'overlap'`).
   */
  const [cardSel, setCardSel] = useState<{ key: string; oid: string } | null>(null);
  /* Багц солиход сонголт суллагдана — өөр багцын талбар дээр түгжигдэхгүй.
     ⚠️ 2026-09-30: эффект биш, RENDER дунд — `active` солигдсон тэр render-т л. */
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
   *
   * ⚠️ ЗӨВХӨН БАРИЛГЫН багц (7). Бүх багцаар (55) тоолох оролдлого
   *    2026-08-27-нд хийгдээд БУЦААГДСАН: карт бэлэн болох хугацаа 14 сек
   *    болж, 131 хүсэлт порталын нийтлэг 6-слотын дараалалд орж бусад
   *    картыг хойшлуулж байв. Бүх багцын задаргаа нь «Газар чөлөөлөлт»
   *    харагдацад (тэнд газрын сэдэв тул байрандаа) шилжсэн.
   */
  /* ⚠️ ТОО биш ОБЬЕКТ: картын зурвасыг дарахад тэр багцын давхцсан талбар руу
     очих тул ObjectID-ууд хэрэгтэй (зөвхөн тоогоор очих газар мэдэгдэхгүй). */
  const [ovByPack, setOvByPack] = useState<Map<string, Overlap | 'error'> | null>(null);
  useEffect(() => {
    let alive = true;
    const builds = packs.filter((pk) => pk.kind === 'build');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    if (!builds.length) { setOvByPack(new Map()); return; }
    Promise.allSettled(
      builds.map(async (pk) => [
        pk.key,
        await overlapLeftParcels(pk.layerIds.map((id) => ({ layerId: id, where: pk.where }))),
      ] as const),
    ).then((rs) => {
      if (!alive) return;
      const m = new Map<string, Overlap | 'error'>();
      /* ⚠️ Унасныг АЛГАСАХГҮЙ — түлхүүр нь Map-д огт орохгүй бол картын толгой
         «тоолж байна…» гэж МӨНХӨД хүлээлгэдэг байв; `'error'` = ил хэлнэ. */
      rs.forEach((r, i) => {
        /* ⚠️ `failed` (хагас) = 'error' — дутуу тоог бүрэн мэт харуулахгүй (2026-09-25) */
        if (r.status === 'fulfilled') m.set(r.value[0], r.value[1].failed?.length ? 'error' : r.value[1]);
        else m.set(builds[i].key, 'error');
      });
      setOvByPack(m);
    });
    return () => { alive = false; };
  }, [packs]);

  /**
   * АНГИЛАЛ БҮРИЙН асуудалтай (давхцсан үлдсэн) нэгж талбар — «Блокийн
   * төлөв» картад БАЙНГА харагдана (2026-08-21: блокуудын картууд хаалттай
   * үед ч уншигдахын тулд). Ангилал бүрд нэг огтлолцол — дөрөвхөн хүсэлт,
   * нэг нь унавал бусдыг унагахгүй.
   */
  const [ovByCat, setOvByCat] = useState<Map<PackCat, number | 'error'> | null>(null);
  useEffect(() => {
    if (!packs.length) return;
    let alive = true;
    Promise.allSettled(PACK_CATS.map(async (c) => {
      const srcs = packs
        .filter((p) => catOf(p) === c.key)
        .flatMap((p) => p.layerIds.map((id) => ({ layerId: id, where: p.where })));
      if (!srcs.length) return [c.key, 0] as const;
      const r = await overlapLeftParcels(srcs);
      /* ⚠️ Хагас үр дүн (`failed`) → 'error' (2026-09-25): дэд бүтцийн цөөн давхарга
         унахад «асуудал 0» ногоон худал гардаг байв. */
      if (r.failed?.length) throw new Error('partial overlap');
      return [c.key, r.oids.length] as const;
    })).then((rs) => {
      if (!alive) return;
      const m = new Map<PackCat, number | 'error'>();
      /* ⚠️ Унасныг АЛГАСАХГҮЙ — Map-д байхгүй түлхүүр `?? 0`-оор «асуудал 0»
         гэсэн худал сайн мэдээ болдог байв; `'error'` = «—» саарлаар гарна. */
      rs.forEach((r, i) => {
        if (r.status === 'fulfilled') m.set(r.value[0], r.value[1]);
        else m.set(PACK_CATS[i].key, 'error');
      });
      setOvByCat(m);
    });
    return () => { alive = false; };
  }, [packs]);

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
  /* ⚠️ 2026-09-30: логик нь `Finance.pkgMonthsMap`-д — «Багцын мэдээлэл» ч мөн үүнийг ашиглана. */
  const finMap = useMemo(
    () => (finQ.state === 'ready' ? pkgMonthsMap(finQ.data) : null),
    [finQ],
  );

  /**
   * ХУВААРИЙН ТӨЛӨВЛӨГӨӨ — «Гүйцэтгэл бөглөх» хуудсуудын эхлэх/дуусах
   * огноонд суурилсан сар тутмын өссөн хувь (`loadPlanCurve`).
   *
   * ⚠️ Урьд нь `cashflow_0813`-аас гардаг байсан (`aggregateMonths().cumPct`)
   *    бөгөөд хуваагч нь 12 САРЫН ЦОНХНЫ нийлбэр байсан тул муруй нь цонхны
   *    төгсгөлд ҮРГЭЛЖ 100% болж, дэлгэцэд «2026-09-д төсөл дуусна» гэж
   *    ГАРЧ БАЙВ. Төсөл бодитоор 2027-12 хүртэл үргэлжилдэг.
   */
  /* ⚠️ 2026-09-25: КЭШТЭЙ хувилбар — Finance (`loadFinData` доторх
     `planCurveCache`) · negtgel · execReport-той НЭГ хуулбар. Урьд нь энэ
     хуудас нээгдэхэд 10 бөглөх хуудас ХОЁР удаа бүтнээр уншигддаг байв. */
  const planQ = useAsync(loadPlanCurveCached, []);

  /**
   * Графикийн мөрүүд: тэнхлэг ба ТӨЛӨВЛӨГӨӨ нь ХУВААРИАС, БОДИТ гүйцэтгэл нь
   * хуучин санхүүгийн цэгүүдээс (`phys`) шошгоор тааруулж холбогдоно.
   *
   * ⚠️ Хуваарь олдоогүй үед (дэд бүтцийн багц — бөглөх хуудасгүй) ХУУЧИН
   *    зан төлөв хэвээр: тэнд хуваарийн эх сурвалж огт байхгүй.
   */
  const progMonths = useMemo<ProgPt[] | null>(() => {
    const pc = planQ.state === 'ready' ? planQ.data : null;
    /* ⚠️ 2026-10-09 (аудит №2): ТӨСЛИЙН графикт хуваарьгүй багц байвал БОДИТ шугам ч
       хуваарьтай багцаар (`physLag`) — төлөвлөгөөт шугамтай нэг олонлог, зөрүү хэтрэхгүй.
       Гарчиг «(хуваарьтай багцаар)» гэж хэлнэ; толгойн «бодит гүйцэтгэл» (`physNow`) бүх багцаар. */
    const base = active
      ? (finMap?.get(active.key) ?? null)
      : (finQ.state === 'ready'
        ? aggregateMonths(finQ.data, pc).map((m) => (m.physLag !== undefined
          ? { ...m, phys: m.physLag, physAt: m.physLagAt ?? null }
          : m))
        : null);
    /* ⚠️ Хуваарь ирээгүй бол ГРАФИК ЗУРАХГҮЙ — cashflow руу буцаж унах зам
       2026-09-06-нд хаагдсан (тэр үйлчилгээ байхгүй). Хоосон график нь
       буруу муруйгаас ДЭЭР.
       ⚠️ `pc.months` хоосон эсэхийг ЭНД шалгахгүй (2026-09-25 аудит): өөр хуудас
       унаснаас төслийн нийт хоосон байхад бүрэн ачаалсан багцын `byBagts`
       муруй алга болдог байв — хоосон цувааг доорх `series` шалгалт барина. */
    if (!pc) return null;
    /* Багц сонгосон бол тэр багцын муруй; сонгоогүй бол ТӨСЛИЙН нийт.
       ⚠️ 2026-09-30: төслийн муруй — `projectPlanOf` (ХО дүнгээр, бодит `aggregateMonths`-тай
       нэг жин); урьд нь `pc.months` (БЛОКИЙН тоогоор) тул хоёр шугам өөр жинтэй байв. */
    const series = active && active.key !== '__all'
      ? pc.byBagts.get(active.key)
      : (finQ.state === 'ready' ? projectPlanOf(finQ.data, pc) : pc.months);
    /* ⚠️ 2026-09-30: цэгүүдийг `pkgShared.progMonthsOf` бүтээнэ — «ТУХ» ижил функцийг
       хэрэглэдэг (хэмжилтгүй сар `null`, `planM` нь хэмжилтийн өдрөөр). */
    return progMonthsOf(base, series);
  }, [active, finMap, finQ, planQ]);
  /** ⚠️ 2026-10-09 (аудит №2): төслийн төлөвлөгөө/хоцрогдлоос хасагдсан хуваарьгүй багцууд */
  const planExcl = useMemo<string[]>(() => (finQ.state === 'ready' && planQ.state === 'ready'
    ? projectPlanScope(finQ.data, planQ.data)?.excluded ?? []
    : []), [finQ, planQ]);


  /**
   * ALERT-тэй (төлөвлөгөөнөөс хоцорсон) багцууд — ТУСДАА бүлэг болж жагсаалтын
   * ХАМГИЙН ДЭЭР гарна. Гүйцэтгэл хэвийн болмогц lag арилж, багц өөрийн
   * бүлэгтээ аяндаа буцна (тусгай төлөв хадгалахгүй).
   */
  const alertKeys = useMemo(() => {
    const s = new Set<string>();
    if (!finMap) return s;
    /*
     * ⚠️ ЭНД ЗӨВХӨН БИЕТ ХОЦРОГДОЛ: төлөвлөсөн явцаас хэдэн хувь хоцорсон.
     *    Санхүүжилтийн хоцрогдол нь «Багцын санхүү» модулийнх — хоёрыг нэг
     *    дүрмээр шийдвэл нэг цонхны alert нөгөөгийнхөө асуултад хариулж,
     *    «яагаад улаан байна вэ» гэдэг нь ойлгогдохгүй болно.
     */
    packs.forEach((p) => {
      const months = finMap.get(p.key);
      if (!months) return;
      const lag = lagOf(months);
      if (lag && lagLevel(lag.gap)) s.add(p.key);
    });
    return s;
  }, [packs, finMap]);
  const alerted = useMemo(() => packs.filter((p) => alertKeys.has(p.key)), [packs, alertKeys]);
  /**
   * ⚠️ 2026-09-25: ХОЦРОГДОЛ НЬ МЭДЭГДЭХГҮЙ багцууд — бөглөх хуудас нь уншигдаагүй
   *    (`PlanCurve.failed`) тул `byBagts`-д муруй байхгүй, `lagOf` `null` буцааж
   *    `alertKeys` тэднийг ЧИМЭЭГҮЙ орхидог байв: «⚠ Хоцрогдолтой багц» бүлэгт
   *    гарахгүй нь «хоцроогүй» гэсэн худал сайн мэдээ. Одоо тусдаа мэдэгдэл.
   */
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
      /* ⚠️ 2026-10-01: давхардсан полигон нэг блок (`uniqueBlocks`).
         ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): тайлагнаагүй блок 0% (урьд нь хасагддаг байв) */
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

  /**
   * ⚠️ 2026-08-20: Багцын давхаргууд нь СУУРЬ, дээр нь каталогийн сонголт
   * (`useLayerPicks`). Урьд нь `visible` нь зөвхөн сонгосон багцаас гардаг тул
   * энэ цонхонд давхаргын каталог огт байхгүй, порталын бусад ~84 давхаргын
   * нэгийг ч контекст болгон нэмэх арга үгүй байв.
   */
  const [visible, setVisible] = useLayerPicks(active ? active.layerIds : [BLOCK_LAYER]);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  useZoomToFilter({ zone });

  /**
   * ЗУРАГТ ӨГӨХ жагсаалт — каталогийн сонголт (`visible`) дээр давхцсан
   * үлдсэн нэгж талбар олдвол газар чөлөөлөлтийн давхаргыг НЭМНЭ: инженер
   * аль блок дээр саад байгааг зурган дээр шууд харна.
   *
   * ⚠️ `setVisible` рүү БИЧИХГҮЙ — тэр нь хэрэглэгчийн каталогийн сонголт тул
   * overlap ирэх бүрд бохирдоно. Зөвхөн ГАРАЛТ дээр давхарлана.
   */
  const mapVisible = useMemo(() => {
    const ids = [...visible];
    /* ⚠️ Сонгосон багцын давхарга — саад ЮУНД болж байгааг харуулна. Багц
       СОНГООГҮЙ (жагсаалтаас) үед энэ нь цорын ганц зам: `visible`-ийн суурь
       нь зөвхөн блокийн давхарга тул дэд бүтцийн шугам огт зурагдахгүй. */
    if (ovPack) ids.push(...ovPack.layerIds);
    if (ovShown.length) ids.push(PARCEL_LAYER);
    return ids.length === visible.length ? visible : [...new Set(ids)];
  }, [visible, ovPack, ovShown]);
  /**
   * ДАВХЦСАН НЭГЖ ТАЛБАРЫН ХЭВ МАЯГ — УЛААН (хэрэглэгчийн шийдвэр, 2026-08-25).
   *
   * ⚠️ Улаан нь энэ порталд «саад / эрсдэл» гэсэн ТӨЛӨВИЙН өнгө бөгөөд
   *    давхцсан үлдсэн талбарын ТОО аль хэдийн улаанаар бичигддэг
   *    (`--bad-ink`). Зураг нь өөр өнгөөр (ягаан) ярьж байсан тул тоо ба
   *    полигон хоёр НЭГ зүйлийг хэлж байгаа нь нүдэнд холбогдохгүй байв.
   *
   * ⚠️ Блокууд улбар шар (`#ea580c`) тул ойролцоо өнгөтэй: ЗУЗААН хүрээ
   *    (4.2) ба өндөр дүүргэлт (0.3) нь ялгааг барина.
   *
   * ⚠️ HEX-ЭЭР бичнэ, CSS хувьсагчаар БИШ: MapCanvas-ийн `rgb()` нь зөвхөн
   *    `#rrggbb`-г задалдаг тул `var(--bad)` өгвөл NaN болж, полигон огт
   *    зурагдахгүй. Утга нь `globals.css`-ийн `--bad`-тай ижил.
   */
  /**
   * ⚠️ АНИВЧИЛТ ХАСАГДСАН (2026-08-28, хэрэглэгчийн заавар): пульс нь
   * талбаруудыг тасралтгүй томруулж жижигрүүлдэг тул хэлбэр, хэмжээг нь
   * нүдээр уншиж болохгүй болно. Ялгааг өнгө ба зузаан хүрээ барина.
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
      /* ⚠️ `layerWhere` өгөгдмөгц MapCanvas бүсийн (zone) fallback-ийг БҮХ
         давхаргад алгасдаг (жагсаалтад БАЙХГҮЙ давхарга ч `?? null`-аар
         шүүлтгүй болдог) тул каталогоос асаасан бүсчлэлтэй давхаргууд «Бүс»
         сонгоход шүүгдэлгүй, каталогийн тоотойгоо зөрдөг байв. Тиймээс бүсийн
         шүүлтийг давхарга бүрд ЭНДЭЭС өөрсдөө тавина (noZone давхаргад
         `zoneWhere` null тул зан төрх өөрчлөгдөхгүй — тэдгээрт орон зайн маск
         хэвээр үйлчилнэ). */
      const w: Record<string, string | null> = {};
      if (zone) {
        for (const id of mapVisible) {
          const d = LAYER_BY_ID[id];
          if (d) w[id] = zoneWhere(d, zone);
        }
      }
      /* Багц сонгосон → тэр багц; чартаас багц сонгосон → түүнийх;
         эс бөгөөс → зөвхөн хоцрогдолтой багцын блокууд.
         ⚠️ 2026-09-21: `active?.where ?? …` гинж нь дэд бүтцийн багцын
         `where: null`-ыг («давхарга бүхэлдээ») `alertedWhere` руу унагаадаг
         байв — доорх zoom-ийн эффектийн 2026-08-21-ний засвартай ижил алдаа.
         Багц сонгосон бол ТҮҮНИЙ where (null = шүүлтгүй); `alertedWhere` нь
         зөвхөн багц сонгоогүй үед. `ovPack` нь `??`-ээр хэвээр: чартаас
         сонгосон дэд бүтцийн багцын давхаргад блок ордоггүй тул блокийн
         давхарга анхдагч (хоцрогдолтой) шүүлтээ хадгална. */
      w[BLOCK_LAYER] = active ? active.where : (ovPack?.where ?? alertedWhere);
      /* ⚠️ Чартаас сонгосон багцын БУСАД давхарга (дэд бүтцийн шугам) —
         давхаргын БҮХ объект биш, зөвхөн тэр багцынхыг үлдээнэ. */
      if (ovPack) {
        for (const id of ovPack.layerIds) if (id !== BLOCK_LAYER) w[id] = ovPack.where;
      }
      // ⚠️ Давхаргад 2,119 талбар бий — ЗӨВХӨН давхцсаныг үлдээнэ, эс бөгөөс
      //    бүх хот дүүрэн парсел зурагдаж блокууд дарагдана.
      /* ⚠️ Картаас нэг багц сонгосон бол ТҮҮНИЙ талбарууд; эс бөгөөс бүгд. */
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
    /*
     * ⚠️ ХООСОН ГАЗАР ДАРВАЛ СОНГОЛТ АРИЛНА. Урьд нь `if (!b) return` байсан
     *    тул барилга сонгосны дараа зөвхөн дээд талын «‹ багц руу буцах» товч
     *    л гарц болдог байв — зурган дээр хаана ч дарсан шүүлт хэвээр наалдаж,
     *    хэрэглэгч «гацсан» гэж мэдэрдэг. Газрын зурагт хоосон газар дарах нь
     *    «сонголтоо болих» гэсэн ердийн дохио.
     */
    if (!b) {
      /* ⚠️ Багцын сонголтыг БАС арилгана: зөвхөн барилгыг цуцлаад багцын
         шүүлтийг үлдээвэл зураг тэр багцаараа хумигдсан хэвээр байх тул
         хэрэглэгч «арилсангүй» гэж мэдэрнэ. Хоосон газар дарах = БҮХ
         сонголтоо болих. */
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
   * ⚠️ 2026-08-21 ЗАСВАР: урьд нь `zoomToWhere(id, active?.where ?? alertedWhere
   * ?? '1=1')` байсан тул ЗӨВХӨН БАРИЛГЫН багцад ажилладаг байв.
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
      /* ⚠️ Alert-тай багц нь ТУСДАА бүлэгт гарсан тул эндээс хасагдана —
         эс бөгөөс нэг багц хоёр газар давхардаж жагсана. */
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
      /* ⚠️ Горимын класс — хоёр харагдац бүтцээрээ ижил тул ялгах ЦОРЫН ГАНЦ
         дохио нь өнгө. Хэрэглэгч табаа сольсноо мэдэхгүй бол санхүүгийн тоог
         гүйцэтгэл гэж уншина. */
      className={`${ts.pack} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ── ДЭЭР: индикаторууд — сонголтгүй үед төслийн 6 үзүүлэлт
          (2026-08-21, хэрэглэгчийн жагсаалтаар); багц сонгоход тухайн
          багцын KPI хэвээр ── */}
      <div className={ts.kpi}>
        {errQ ? null : loading ? <Empty label={tr('Ачаалж байна…')} /> : active ? (
          /* ⚠️ `fin` дамжуулснаар PackKpi нь МӨНГӨНИЙ хавтан гаргана —
             гүйцэтгэл/блок/айл огт харагдахгүй. */
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
          <Section title={tr('Багцууд')}><Empty label={tr('Ачаалж байна…')} /></Section>
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
            {/* ⚠ ХОЦРОГДОЛТОЙ багцууд — тусдаа бүлэг, карт бүхэлдээ анивчина.
                ⚠️ 2026-08-21: ЗӨВХӨН гүйцэтгэлийн харагдацад — хоцрогдол нь биет
                явц vs төлөвлөгөөний зөрүү тул санхүүгийн асуултын хэсэг БИШ. */}
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
            {/* ⚠️ 2026-09-08 (аудит, HIGH): `finMap` нь `finQ`-ээс гардаг тул
                `loadFinData` унавал `alertKeys` ХООСОРЧ «⚠ Хоцрогдолтой багц»
                бүлэг бүхэлдээ алга болно — тэр нь «хоцорсон багц алга» гэсэн
                ХУДАЛ сайн мэдээ. Хоосон нь «мэдээлэлгүй» гэдгийг ил хэлнэ. */}
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

        {/* ⚠️ 2026-08-20: Урьд нь ЗӨВХӨН 2D/3D/BIM байсан — Давхарга ч, Тунгалаг
            ч, Бүс ч байхгүй. Одоо бүх харагдацтай ижил нэгдсэн зурвас. */}
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
              totals={catTotals}
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
          {/* ⚠️ Чартаас сонгосон багц ч тайлбартай байна — эс бөгөөс зурагт
              нэмэгдсэн шугам ямар давхарга болох нь нэргүй үлдэнэ. */}
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
            {/* ⚠️ 2026-09-30: орон сууцны багана = `physNow` (TsKpi-тай нэг тоо); ачаалж байхад `undefined` */}
            <CatChart packs={packs} housing={finQ.state === 'ready' ? physNow(finQ.data, monthKey()) : finQ.state === 'error' ? null : undefined} />
            {/* ⚠️ 2026-10-06: хуваарь = бөглөх хуудасны блок (`q.data.keys`), газрын зургийн блок БИШ */}
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
                /* ⚠️ 2026-08-23 (хэрэглэгчийн хүсэлт): ЯГААН (`--overlap`) → УЛААН
                   (`--bad-ink`). Урьд нь тоо нь зурган дээрх давхцлын давхаргын
                   ягаантай ижил утгатай байсан; одоо тоо нь «саад/эрсдэл» гэсэн
                   статусын хэлээр (улаан) ярина — багцын картуудын толгой дахь
                   давхцлын тоотой ч нэг өнгө болов (`BlocksCard`).
                   ⚠️ ГАЗРЫН ЗУРАГ дээрх полигон ЯГААН ХЭВЭЭР: тэр нь улбар шар
                   блокуудаас ялгарахын тулд зориуд сонгогдсон (`Tsogts.tsx` §350). */
                style={{ color: overlap === 'error' ? 'var(--ink-3)' : ovOk?.oids.length ? 'var(--bad-ink)' : 'var(--good-ink)' }}
              >
                {overlap == null ? '…' : overlap === 'error' ? '—' : num(overlap.oids.length)}
              </b>
            </Section>
            {/* Блок бүрийн гүйцэтгэл — БАГЦААР нь бүлэглэсэн (нэг багц = нэг карт).
                ⚠️ Зөвхөн ГҮЙЦЭТГЭЛИЙН харагдацад: блокийн биет явц нь санхүүгийн
                асуултад хамаарахгүй, харин баганыг маш урт болгодог. */}
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
                /* ⚠️ 2026-09-21: 7 картын сонголт НЭГ төлөвт (`cardSel`) — зөвхөн
                   сүүлд сонгосон карт «сонгогдсон» харагдана (`BlocksCard.sel`). */
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
          /* ⚠️ 2026-09-29 (аудит 10): ачаалж байх үед `progMonths` = null тул график
             «Гүйцэтгэлийн дата алга» гэж ХАРИУЛТ мэт бичдэг байв — ачаалал ≠ хоосон. */
          loading={planQ.state === 'loading' || finQ.state === 'loading'}
          title={active
            ? tr('{0} — гүйцэтгэлийн явц', tr(active.name))
            : tr('Төсөл нийт — гүйцэтгэлийн явц') + (planExcl.length ? ` ${tr('(хуваарьтай багцаар)')}` : '')}
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
 *
 * ⚠️ ТӨЛӨВЛӨСӨН хувь нь доод графиктай ИЖИЛ эх сурвалжаас — «Гүйцэтгэл
 *    бөглөх»-ийн ХУВААРЬ (`loadPlanCurve`), 2026-09-04-нөөс. Урьдын
 *    `aggregateMonths().cumPct` нь cashflow-ийн 12 сарын ЦОНХОНД
 *    нормчлогддог тул «2026-09-д 100%» гэсэн худал тоо өгдөг байв.
 * ⚠️ БОДИТ хувь нь хэвээр `aggregateMonths().phys` — ХО дүнгээр жигнэсэн биет %
 *    (`gdash.housingPct`, 2026-09-30; өмнө нь блокоор).
 */
/*
 * ⚠️ 2026-09-08 (аудит, HIGH): `fin`/`plan`-ийг задалсан утгаар БИШ, бүтэн
 *    `Async`-аар авна. Урьд нь дуудагч тал `finQ.state === 'ready' ? … : null`
 *    гэж шахдаг байсан тул АЧААЛЖ БАЙГАА ба АЛДАА ГАРСАН хоёр ялгагдахгүй
 *    болж, `loadFinData`/`loadPlanCurve` унамагц гурван хавтан «…» гэж
 *    МӨНХӨД хөлдөж, алдааны мессеж ч, «Дахин оролдох» товч ч хаана ч
 *    гардаггүй байв — тэр нь `Bagts.tsx:531`-д нэг удаа зассан алдаатай ЯГ
 *    ижил. Одоо: ачаалж байна = «…», алдаа = «—» (+ доор нэрлэсэн алдаа).
 */
function TsKpi(
  { packs, finQ, planQ }:
  { packs: Pack[]; finQ: Async<FinData>; planQ: Async<PlanCurve> },
) {
  const fin = finQ.state === 'ready' ? finQ.data : null;
  /* ⚠️ 2026-09-30: `projectPlanOf` — ТӨЛӨВЛӨГӨӨ бодит (`physNow`)-той НЭГ (ХО) жинтэй;
     урьд нь `planQ.data.months` (БЛОКИЙН тоогоор) тул «зөрүү» хоёр өөр жинг хасдаг байв. */
  const plan = useMemo<PlanPoint[] | null>(() => (planQ.state === 'ready'
    ? (fin ? projectPlanOf(fin, planQ.data) : planQ.data.months)
    : null), [planQ, fin]);
  /** Уншигдаагүй бөглөх хуудсууд — төслийн муруй ХООСОН (`PlanCurve.failed`) */
  const planFailed = planQ.state === 'ready' ? planQ.data.failed.length : 0;
  /** Хэмжилт БОЛОМЖГҮЙ (алдаа) — «…» биш «—». */
  const failed = finQ.state === 'error' || planQ.state === 'error';
  const t = useMemo(() => {
    if (!fin) return null;
    const nowYm = monthKey(); /* ⚠️ ОРОН НУТГИЙН сар — UTC slice нь сарын 1-ний шөнө ӨМНӨХ сар өгдөг */
    let planned: number | null = null;
    /* ⚠️ 2026-09-22: `physNow` — Dashboard/ExecReport-той НЭГ туслах (pkgShared.ts) */
    const actual = physNow(fin, nowYm);
    /*
     * ТӨЛӨВЛӨГӨӨ — ХУВААРИАС, доорх графиктай ЯГ НЭГ эх сурвалж.
     * ⚠️ `aggregateMonths().cumPct` (cashflow) ХЭРЭГЛЭХГҮЙ: түүний хуваагч
     *    нь 12 сарын цонхны нийлбэр тул цонх дуусахад үргэлж 100% болдог.
     */
    /* ⚠️ 2026-09-25: ХЭМЖИЛТИЙН ӨДРИЙН төлөвлөгөө — урьд нь ЭНЭ сарын эцсийн
       цэгийг (`p.label <= nowYm`) хэдэн сарын өмнөх хэмжилттэй жишиж хиймэл
       «хоцрогдол» гаргадаг байв. `Finance.lagOf` ба `execReport`-той НЭГ дүрэм
       (`planPctAt` = `negtgelAuto.housingPlanOf`). Хэмжилтгүй бол энэ сарын эцэс (хуучин зан). */
    let lastM: { label: string; physAt?: string | null } | null = null;
    for (const m of aggregateMonths(fin)) if (m.label <= nowYm && m.phys != null) lastM = m;
    /* ⚠️ 2026-10-08: `measureDayOf` — `Finance.lagOf` · `execReport` · ТУХ-тай НЭГ дүрэм (`planProgress`-ийн
       «ганц дүрэм» ⚠️ 2026-10-04): `physAt` алга ба сар нь одоогийнх бол ӨНӨӨДӨР, `-31` биш. */
    const at = lastM ? measureDayOf(lastM.label, lastM.physAt, todayDayKey()) : `${nowYm}-31`;
    if (plan?.length) planned = planPctAt(plan, at);
    let gap = planned != null && actual != null ? planned - actual : null;
    /* ⚠️ 2026-10-09 (аудит №2): хуудас уншигдсан бол төлөвлөгөө ба зөрүүг `projectLagNow`-оор —
       хоёр тал НЭГ (хуваарьтай) багцын олонлог. Хуваарьгүй багц бодит талд л тоологдож хоцрогдлыг
       хэтрүүлэхгүй; `actual` (толгойн тоо) нь `physNow` хэвээр. */
    let excluded: string[] = [];
    if (planQ.state === 'ready') {
      const ln = projectLagNow(fin, planQ.data, nowYm, todayDayKey());
      planned = ln.planned;
      gap = ln.gap;
      excluded = ln.excluded;
    }
    /* ⚠️ 2026-09-06: НИЙТ ТӨЛӨВЛӨГӨӨ = ГЭРЭЭНИЙ дүнгүүдийн нийлбэр
       (`FinData.planTotal`). Урьд нь «өмнөх онд шилжүүлсэн + 12 сарын
       цонхны хуваарь» байсан — «ӨМНӨХ ШИЛЖҮҮЛСЭН» мөрийн төрөл ба сарын
       хуваарь хоёул `cashflow_0813`-тайгаа хамт хаягдсан. */
    let planTotal = 0;
    fin.planTotal.forEach((v) => { planTotal += v; });
    /* ⚠️ 2026-09-25: `givenTotal` — сарын цуваа огноогүй/тэнхлэгээс гадуурх
       төлбөрийг ОРУУЛДАГГҮЙ (Finance-ийн ⚠️); нийт дүн нь PkgFin-тэй ижил. */
    let given = 0;
    fin.givenTotal.forEach((v) => { given += v; });
    return {
      planned, actual, gap, given, excluded,
      share: planTotal > 0 ? (given / planTotal) * 100 : null,
      /** Төлөвлөгөөт нийтээс олгогдоогүй үлдэгдэл ₮ */
      remain: Math.max(0, planTotal - given),
    };
  }, [fin, plan, planQ]);
  /**
   * ⚠️ Индикаторууд ГОРИМООР ялгана. «Нийт төслийн тоо» ХОЁУЛАНД байна — тэр нь
   * контекст (хэдэн багцын тухай ярьж байна) бөгөөд аль ч асуултад хэрэгтэй.
   * Гүйцэтгэлийн зөрүү нь БИЕТ vs ТӨЛӨВЛӨГӨӨ тул гүйцэтгэлийн талд; олгосон
   * санхүүжилт ба түүний хувь нь санхүүгийн талд.
   */
  /** Хэмжигдээгүй утгын дэлгэц: ачаалж байхад л «…», бусад үед (алдаа, эсвэл
      бэлэн ч утга null — мэдээлэлгүй) «—».
      ⚠️ 2026-09-21: урьд нь `failed ? '—' : '…'` тул хоёр хүсэлт амжилттай
      ирсэн ч `actual`/`planned` null бол «…» мөнхөд «ачаалж байна» мэт харагдав. */
  const loading = finQ.state === 'loading' || planQ.state === 'loading';
  const none = loading && !failed ? '…' : '—';
  const items = [
      { v: num(packs.length), l: tr('нийт төслийн тоо') },
      { v: t?.actual == null ? none : pct(t.actual, 1), l: tr('бодит гүйцэтгэлийн хувь') },
      { v: t?.planned == null ? none : pct(t.planned, 1), l: tr('төлөвлөсөн гүйцэтгэлийн хувь') },
      {
        /* ⚠️ 2026-10-06 (аудит): нэгж pp, `num()` — ТУХ-тай нэг хэлбэр (`pkgShared.pp`).
           `gap` = төлөвлөгөө − бодит (эерэг = хоцорсон) тул тэмдгийг эргүүлнэ: хоцорсон → «-5.0 pp».
           ⚠️ 2026-10-09 (аудит №2): порталын нэг хэлбэр `gdash.gapPts` — «−5.0 н.х», тэг «0.0 н.х». */
        v: t?.gap == null ? none : gapPts(t.gap),
        l: tr('гүйцэтгэлийн зөрүүгийн хувь'),
    },
  ];
  /* ⚠️ Алдааг НУУХГҮЙ — нэрлэсэн шалтгаан ба «Дахин оролдох» товч `Data`-аас
     гарна. Хоёулаа унасан үед НЭГ мессеж хангалттай (эхнийх нь). */
  const errQ: Async<unknown> | null =
    finQ.state === 'error' ? finQ : planQ.state === 'error' ? planQ : null;
  return (
    <>
      {/* ⚠️ 2026-09-25: `PlanCurve.failed` ИЛ ГАРНА — урьд нь нэг хуудас уншигдаагүй
          үед төслийн төлөвлөгөө чимээгүй «—» болж, шалтгаан хаана ч гардаггүй байв. */}
      {!errQ && planFailed > 0 && (
        <div className={o.tile} style={{ '--tone': 'var(--warn)' } as CSSProperties}>
          <span className={o.tileLabel}>{tr('{0} багцын хуудас уншигдсангүй — дүн дутуу', planFailed)}</span>
        </div>
      )}
      {/* ⚠️ 2026-10-09 (аудит №2): хуваарьгүй багц төлөвлөгөө/зөрүүнээс хасагдсаныг нэрлэнэ */}
      {!errQ && t?.excluded.length ? (
        <div className={o.tile} style={{ '--tone': 'var(--warn)' } as CSSProperties}>
          <span className={o.tileLabel}>{planScopeNote(t.excluded)}</span>
        </div>
      ) : null}
      {items.map((i) => (
        /* Нэг аяс (--data) — өнгөөр ялгах утга биш, зэрэгцсэн нэг эгнээ */
        <div key={i.l} className={o.tile} style={{ '--tone': 'var(--data)' } as CSSProperties}>
          <span className={`${o.tileVal} num`}>{i.v}</span>
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
      const lvl = lag ? lagLevel(lag.gap) : null;
      let execPct: number | null = null;
      /*
       * ⚠️ БОДИТ ГҮЙЦЭТГЭЛ (2026-09-30, хэрэглэгч: «бодит гүйцэтгэлийн хувь руу
       *    шилжүүл») — ажлын хуудсын БИЕТ %, дээд талын «бодит гүйцэтгэлийн хувь»
       *    ба хоцрогдлын тэмдгийн «бодит»-той НЭГ эх (`physLatest` = `lagOf`-ийн
       *    цэг). Урьд нь `p.progress` — блокийн хүснэгтийн ЖИНГҮЙ дундаж байсан
       *    тул жагсаалт ба толгойн тоо зөрдөг байв.
       *    Хэмжилтгүй бол «—» (блокийн дундаж руу БУЦАЖ УНАХГҮЙ — хоёр өөр
       *    хэмжигдэхүүн нэг баганад холилдоно).
       */
      if (p.kind === 'build') execPct = physLatest(months);
      /*
       * ⚠️ ДЭД БҮТЦИЙН БАГЦАД БИЕТ ЯВЦЫН ӨГӨГДӨЛ БАЙХГҮЙ. Урьд нь түүний
       *    оронд «олгосон / төлөвлөгөө» МӨНГӨН хувийг «гүйцэтгэл» гэж
       *    үзүүлдэг байв — гүйцэтгэлийн цонхонд санхүүгийн тоо, дээрээс нь
       *    ӨӨР нэрээр. Барилгын багцын биет хувьтай нэг баганад зэрэгцэн
       *    зогсох тул харьцуулж болохгүй хоёр хэмжигдэхүүн холилдож байв.
       *    Одоо «мэдээлэлгүй» гэж ил хэлнэ.
       */
      return { p, lag, lvl, execPct };
    })
    .sort((a, b) => {
      const rank = (l: 'red' | 'yellow' | null) => (l === 'red' ? 0 : l === 'yellow' ? 1 : 2);
      /* Ижил зэрэглэлд ХОЦРОГДЛЫН ХУВЬ-аар — их нь эхэнд */
      return rank(a.lvl) - rank(b.lvl) || (b.lag?.gap ?? 0) - (a.lag?.gap ?? 0);
    });
  return (
    /*
     * ⚠️ БҮХ БҮЛЭГ НЭЭЛТТЭЙ ЭХЭЛНЭ (хэрэглэгчийн шийдвэр, 2026-08-25). Хураах
     *    нь ЗӨВХӨН хэрэглэгчийн санаачилгаар — гарчиг дээр дарж хаана.
     *    Анхнаасаа хаалттай байвал зүүн багана хоосон харагдаж, ямар багц
     *    байгаа нь ч мэдэгдэхгүй байв.
     */
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
                  ? tr('{0} блок · {1} айл{2}', num(blockCount(p)), num(p.households), lag && lvl ? tr(' · төл. {0}% / бодит {1}%', lag.planned.toFixed(1), lag.actual.toFixed(1)) : '')
                  /* Дэд бүтэц: гүйцэтгэлийн харагдацад мөнгө дурдахгүй —
                     зөвхөн зурагт хэдэн давхаргатай нь. */
                  : (p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй'))}
              value={
                /* ⚠️ `flexWrap` — «Санхүүжилт»-ийн жагсаалттай ЯГ ижил зан:
                   нарийн самбарт тэмдэг картаас хальж гарахгүй. */
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  flexWrap: 'wrap', justifyContent: 'flex-end',
                }}>
                  {execPct == null ? '—' : pct(execPct, 1)}
                  {/**
                    * ⚠️ 2026-08-18: анхааруулга нь ЗӨВХӨН «⚠» тэмдэг байсныг
                    * ЗӨРҮҮ + ТӨЛӨВЛӨСӨН/БОДИТ гурвалаар ил гаргав. Урьд нь тоо
                    * нь зөвхөн hover-ийн `title`-д байсан тул жагсаалтыг нүдээр
                    * гүйлгэхэд аль багц хэр хоцорсныг ХАРАХ арга байхгүй байлаа.
                    */}
                  {lvl && lag && (
                    <b
                      className={`${ts.gapBadge} ${lvl === 'red' ? ts.gapRed : ts.gapYellow}`}
                      title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
                    >
                      <span className={lvl === 'red' ? ts.alertBlink : undefined}>⚠</span>
                      {/* ⚠️ 2026-10-06 (аудит): pp — `pkgShared.pp` (ТУХ-тай нэг хэлбэр) */}
                      <span className="num">{pp(-lag.gap)}</span>
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
            {/**
              * ⚠️ ДЭД БҮТЦИЙН БАГЦ ДАРАХАД ДАВХАРГУУД ЗАДАРНА (2026-09-11,
              * хэрэглэгчийн хүсэлт): «Багц 5.1 · 10 давхарга» → доор нь 10
              * давхарга, давхарга дарахад түүний өгөгдөл. Дахин дарвал хаагдана —
              * `onSel` аль хэдийн toggle тул тусдаа төлөв хэрэггүй.
              *
              * ⚠️ ЗӨВХӨН `infra`: барилгын багцын задаргаа нь блок бөгөөд тэр
              * нь баруун талын `BlocksCard`-д аль хэдийн гардаг.
              *
              * ⚠️ Утгын багана (`valueFor`) ӨГӨӨГҮЙ: энэ жагсаалтын утга нь
              * гүйцэтгэлийн хувь бөгөөд давхаргад тийм хэмжигдэхүүн байхгүй.
              * Урт нь давхарга дарахад өгөгдлийн хэсэгт нийлбэрээр гарна.
              */}
            {open && p.kind === 'infra' && <PackLayers layerIds={p.layerIds} />}
            {/*
              * ⚠️ ЖАГСААЛТЫН ДОТОРХ ЖИЖИГ ГРАФИК ХАСАГДСАН (2026-08-25).
              *    290px өргөн, 140px өндөр талбайд 12 сарын гурван цуваа
              *    багтахгүй: шошго нь дүрс болж, муруйнууд нийлж, юу ч
              *    уншигдахгүй байв. Багц сонгоход доод талын БҮТЭН график
              *    аль хэдийн тэр багц руу шилждэг — хоёр дахь, муудсан
              *    хуулбар нь зөвхөн эргэлзээ төрүүлнэ.
              */}
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
 *
 * ⚠️ Тоо нь доод графиктай ИЖИЛ эх сурвалжаас (`contractMonths`): төлөвлөгөө нь
 * сарын `amount`-ийн нийлбэр, олгосон нь `given`-ийнх. Тусад нь тооцвол хоёр
 * газрын дүн зөрнө.
 *
 * ⚠️ Санхүүгийн бүртгэлгүй багцыг ХАСНА — «0 ₮» гэж харуулбал «олгоогүй»
 * гэсэн ХУДАЛ дохио өгнө; бодит утга нь «гэрээ бүртгэгдээгүй».
 */
function CatChart({ packs, housing }: {
  packs: Pack[];
  /**
   * Орон сууцны (барилга угсралт) биет хувь — `physNow` (ХО дүнгээр жигнэсэн,
   * `gdash.housingPct`). `undefined` = ачаалж байна («…»), `null` = мэдээлэлгүй.
   */
  housing: number | null | undefined;
}) {
  const rows = PACK_CATS.map((c) => {
    const list = packs.filter((p) => catOf(p) === c.key);
    const pcts: number[] = [];
    /*
     * ⚠️ ЗӨВХӨН БИЕТ явц. Урьд нь дэд бүтцийн багцад биет өгөгдөл байхгүй тул
     *    «олгосон / төлөвлөгөө» мөнгөн хувиар нөхөж, барилгын биет хувьтай НЭГ
     *    баганад нийлүүлдэг байв — хоёр өөр хэмжигдэхүүний дундаж нь юуг ч
     *    хэмждэггүй тоо.
     */
    /* ⚠️ 2026-09-30: ОРОН СУУЦ (`build`) = `housing` (`physNow` — ХО дүнгээр
       жигнэсэн, дээд индикатор `TsKpi`-тай ЯГ НЭГ тоо). Урьд нь (2026-09-25) БҮХ
       тайлагнасан блокийн энгийн дундаж байсан тул нэг дэлгэц дээр орон сууцны
       хоёр өөр хувь зэрэг харагддаг байв. Бусад ангилал биет өгөгдөлгүй тул
       хоосон («мэдээлэлгүй») хэвээр — мөнгөн хувиар нөхөхгүй. */
    if (c.key === 'build') {
      return { c, n: list.length, mean: housing ?? null, wait: housing === undefined };
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
      {/* ⚠️ 2026-10-09 («графикийн жигдрэл»): ангилал бүр `cat(i)` (dark-тай токен) —
          урьд нь `shade(HUE)` hex. Мэдээлэлгүй ангилал `null` (зурвасгүй) — 0 БИШ. */}
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
  /* ⚠️ 2026-10-04 (2026-10-01-ний «тайлагнаагүй блок = 0%» шийдвэр): хэмжилтгүй блок «0–25%»-д
     ТООЛОГДОНО. Тайлангүйн тоо `note`-д ил хэвээр.
     ⚠️ 2026-10-06: Дашбоард · Удирдлагын тайлантай НЭГ дүрэм (`blockProgress.levelCounts`) — урьд нь
     газрын зургийн давхаргын блокоор (`allPack.blocks`) тоолдог тул footprint-гүй (29/3, 5/8) блок
     орохгүй, хуваарь Дашбоардын тархалтаас зөрдөг байв. */
  const counts = levelCounts(pm, keys);
  const total = counts.reduce((a, b) => a + b, 0);
  const all = new Set<string>(keys);
  pm.forEach((_, k) => all.add(k));
  let noData = 0;
  all.forEach((k) => { const v = pm.get(k)?.overall; if (v == null || !Number.isFinite(v)) noData++; });
  return (
    <Section title={tr('Блокийн төлөв')} note={tr('{0} блок{1}', total, noData ? tr(' · {0} тайлангүй (0%)', noData) : '')}>
      {/* ⚠️ 2026-10-09 («графикийн жигдрэл»): `shade(HUE)` САНААТАЙ үлдэв — газрын зургийн
          блокийн давхарга ба түүний тайлбар (`packLegend`) ЯГ эдгээр өнгөөр будагддаг;
          зурагтай ижил байх нь токеноос чухал (төлөвлөгөөний «HUE identity» дүрэм). */}
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

/* ⚠️ `aggregateMonths` · `catOf` · `HUE` → `pkgShared.ts` (2026-09-17): хоёр
   харагдацын ижил хуулбар нэг эх сурвалж болов. */


/**
 * ГҮЙЦЭТГЭЛИЙН ЯВЦ — ТӨЛӨВЛӨСӨН vs БОДИТ, хоорондын ЗӨРҮҮ будагдана.
 *
 * ⚠️ «Багцын санхүү»-гийн «санхүүжилтийн явц» графиктай ИЖИЛ дүрслэл
 *    (хэрэглэгчийн шийдвэр, 2026-08-25): тасархай = зорилт, зузаан бүтэн =
 *    баримт, хоорондын талбай = зөрүү. Хоёр цонхны график нэг хэлээр ярьвал
 *    хэрэглэгч нэгийг сурчихаад нөгөөг нь дахин тайлах шаардлагагүй.
 *
 * ⚠️ ЯЛГАА нь ХЭМЖИГДЭХҮҮНД: тэнд ₮ (хуримтлагдах мөнгө), энд % (биет явц).
 *    Мөнгө ЭНД ОГТ ГАРАХГҮЙ.
 *
 * ⚠️ ТЭНХЛЭГ ба ТӨЛӨВЛӨГӨӨ нь 2026-09-04-нөөс ХУВААРИАС ирнэ (`progMonths`):
 *    төслийн эхлэхээс дуусах хүртэл (2025-08 … 2027-12), 29 сар. Урьд нь
 *    cashflow-ийн 12 сарын цонх байсан тул муруй нь тэр цонхны төгсгөлд
 *    үргэлж 100% болж, «2026-09-д төсөл дуусна» гэж ХУДАЛ харуулж байв.
 */
/**
 * ⚠️ ХУВЬ БҮХ ГАЗАРТ АРАВТЫН НЭГ ОРОНТОЙ (2026-09-09, хэрэглэгчийн заавар:
 * «бутархайгаараа бүх цаг үед харагдана, бүхэлчилж болохгүй»).
 *
 * Бүхэлчлэл нь ЖИЖИГ ХӨДӨЛГӨӨНИЙГ НУУНА: 26.14% → 27% гэж бөөрөнхийлөхөд
 * тухайн өдөр 0.4 нэгжээр ахисан гүйцэтгэл дэлгэц дээр ОГТ өөрчлөгдөөгүй
 * мэт харагдана. Мөн «0%» нь «эхлээгүй» ба «0.4% хийгдсэн» хоёрыг
 * ялгахгүй болгоно.
 */
/**
 * ⚠️ export (2026-09-30) — «ТУХ» харагдац багц бүрийн S-муруйд ЭНЭ графикийг
 *    ашиглана: хэрэглэгч «үндсэн системтэй адилхан» байхыг шаардсан.
 */
export function ProgChart({ months, title, planFailed = 0, loading = false }: {
  months: ProgPt[] | null;
  title: string;
  /**
   * ⚠️ 2026-09-29 (аудит 10): хуваарь (`planQ`) эсвэл бодит гүйцэтгэл (`finQ`)
   * АЧААЛЖ байна. Урьд нь энэ үед «дата алга» / «хараахан бөглөгдөөгүй» гэж
   * бичигдэж, хүлээлтийг хоосон ХАРИУЛТ мэт уншуулдаг байв.
   */
  loading?: boolean;
  /**
   * Уншигдаагүй бөглөх хуудасны тоо (`PlanCurve.failed`); `-1` = муруй бүхэлдээ
   * уншигдсангүй. ⚠️ 2026-09-25: урьд нь хоёулаа «Гүйцэтгэлийн дата алга» гэж
   * харагдаж, «дата байхгүй» ба «уншиж чадсангүй» ялгагддаггүй байв.
   */
  planFailed?: number;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /**
   * ⚠️ БОДИТ ӨРГӨН (px) — виртуал 1200 БИШ (2026-09-03, зохиомжийн засвар).
   * `preserveAspectRatio="none"` нь виртуал өргөнийг бодит рүү сунгадаг тул
   * ҮСЭГ нь хэвтээгээр гажиж, нарийн цонхонд шошго шахагдан уншигдахаа
   * больдог байв. Одоо 1 нэгж = 1px — «Санхүүжилтийн явц» графиктай ижил.
   * ⚠️ Доорх «дата алга» гэсэн эрт буцалтаас ДЭЭР дуудагдана: hook нь рендер
   *    бүрд ИЖИЛ дарааллаар дуудагдах ёстой.
   */
  const W = useChartWidth(wrapRef, 1200);

  if (!months || !months.length) {
    return (
      <Section title={title}>
        <Empty label={planFailed !== 0
          ? (planFailed > 0
            ? tr('{0} багцын хуудас уншигдсангүй — дүн дутуу', planFailed)
            : tr('Төлөвлөгөөт муруй уншигдсангүй'))
          /* ⚠️ 2026-09-29 (аудит 10): алдаа нь ачааллаас ДАВУУ — унасан муруйг хүлээлгэхгүй */
          : loading ? tr('Ачаалж байна…') : tr('Гүйцэтгэлийн дата алга.')}
        />
      </Section>
    );
  }

  const rows = months;
  /*
   * ⚠️ ХЭМЖИГДСЭН сарууд — `act != null`. Урьд нь `act > 0` байсан тул:
   *   · жинхэнэ 0% (ажил эхлээгүй) нь ХЭМЖИЛТ атлаа муруйнаас таслагдаж,
   *   · датагүй багц (жиш. бөглөж эхлээгүй Багц 2) дээр «Бодит гүйцэтгэл»
   *     ба «Зөрүү» ХОЁУЛАА чимээгүй алга болж, зөвхөн төлөвлөгөөний тасархай
   *     шугам үлддэг — хэрэглэгч графикийг эвдэрсэн гэж үздэг байв.
   */
  const measured = rows.map((r, i) => (r.act == null ? -1 : i)).filter((i) => i >= 0);
  const lastAct = measured.length ? measured[measured.length - 1] : -1;
  const cur = lastAct >= 0 ? rows[lastAct] : null;
  const curAct = cur?.act ?? null;
  /* ⚠️ 2026-09-25: хэмжилтийн ӨДРИЙН төлөвлөгөөтэй (`planM`) — KPI хавтан ба
     `lagOf`-той нэг тоо; сарын эцсийн цэг нь хиймэл хоцрогдол өгдөг байв. */
  const curGap = curAct == null ? null : (cur!.planM ?? cur!.plan) - curAct;
  const behind = (curGap ?? 0) > 0;

  const N = rows.length;
  const H = 250;
  /* ⚠️ Y тэнхлэгт ТУСДАА багана (2026-09-03). Урьд нь шошго нь торны ДЭЭР,
     графикийн талбай дотор сууж, эхний саруудын муруй ба шошготой давхарладаг
     байв — тиймээс эхний цэгийн шошгыг 26px хойш түлхэх «labelX» хачирхалтай
     дүрэм хэрэгтэй болсон. «Санхүүжилтийн явц»-тай ижил бүтэц: тоо нь гадна,
     муруй нь дотор. */
  const padL = 40;
  const padR = 56;  /* сүүлийн цэгийн шошго */
  const padT = 24;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;

  const planPts = rows.map((r, i) => ({ x: xFor(i), y: yFor(r.plan) }));
  /* ⚠️ 2026-10-09 («графикийн жигдрэл»): `null` = ЦООРХОЙ. Урьд нь зөвхөн хэмжигдсэн
     цэгүүдийг (`measured`) нэг замд оруулж, ДУНДАХ хэмжилтгүй сарыг ГҮҮРЭЭР холбодог
     байв — «тэр сард X% байсан» гэсэн худал уншилт (CLAUDE.md: null ≠ 0, цоорхой
     үлдээнэ). Одоо `chartStyle.lineSegments` нь null дээр муруйг ТАСАЛНА. */
  const actPts = rows.map((r, i) => (r.act == null ? null : { x: xFor(i), y: yFor(r.act) }));
  /* ⚠️ Нэг МОНОТОН муруй (`chartStyle`) — локал Catmull-Rom (`curve`) хасагдсан:
     хашилттай ч гэсэн тэр нь хуримтлагдсан муруйд бага зэрэг хэтэрдэг байв. */
  const planSegs = lineSegments(planPts);
  const actSegs = lineSegments(actPts);

  /*
   * ЗӨРҮҮГИЙН ТАЛБАЙ — төлөвлөгөөний муруйгаас бодит муруй хүртэл.
   * ⚠️ Хоёр шугам ойрхон явахад ялгаа нь нүдэнд баригддаггүй; будсанаар
   *    зөрүү нь ХЭМЖЭЭ болж харагдана.
   * ⚠️ 2026-10-09: бодит муруйн ХЭСЭГ БҮРД тусдаа талбай — цоорхой сард зөрүү
   *    будагдахгүй (хэмжилтгүй сарын зөрүү ТОДОРХОЙГҮЙ). Буцах ирмэг нь бодит
   *    муруйн ЯГ ижил монотон зам (урвуу чиглэлд) — урьд нь шулуун хугарал
   *    байсан тул талбайн ирмэг муруйгаас зөрж харагддаг байв.
   */
  const gapAreas = actSegs.filter((sg) => !sg.single).map((sg) => {
    const top = monotonePath(planPts.slice(sg.from, sg.to + 1));
    const back = monotonePath([...sg.pts].reverse()).replace(/^M/, 'L');
    return `${top} ${back} Z`;
  });

  /* ⚠️ 2026-09-25: ХУУЧИРСАН `hi` — багц солиход `months` богиносож, өмнөх
     hover-ийн индекс мужаас гарч `rows[hi].plan` дээр УНАДАГ байв. */
  const hv = hi != null && hi >= 0 && hi < N ? hi : null;
  const pt = hv != null ? rows[hv] : null;
  /* ⚠️ 2026-09-29 (аудит 10): tooltip-ийн «Төлөвлөсөн»/«Зөрүү» нь толгойн тэмдэглэл
     (`curGap`) ба KPI-тай НЭГ суурь — хэмжилтийн ӨДРИЙН төлөвлөгөө (`planM`). Урьд нь
     сарын эцсийн `plan`-аар бодож, нэг цэгт хоёр өөр зөрүү гардаг байв. Хэмжилтгүй
     сард `planM` = null тул сарын эцсийн цэг хэвээр. */
  const ptPlan = pt ? (pt.act != null ? (pt.planM ?? pt.plan) : pt.plan) : 0;
  const anchor =(i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');
  /* ⚠️ 2026-10-09: S-муруйн НЭГ эх — `globals.css`-ийн `--chart-plan`/`--chart-actual`
     (= `--c3`/`--c2`, урьдын `cat(2)`/`cat(1)`-тэй ижил утга, dark-тай). */
  const PLAN_C = 'var(--chart-plan)';
  const ACT_C = 'var(--chart-actual)';
  /* Цэгийн тэмдэг — r = `CHART.markerR`, эргэн тойронд гадаргуун цагираг (`CHART.ring`) */
  const dot = (cx: number, cy: number, fill: string, r: number = CHART.markerR) => (
    <circle cx={cx} cy={cy} r={r} className={ts.progDot} style={{ fill, strokeWidth: CHART.ring }} />
  );

  /*
   * ⚠️ ЦЭГ БҮР ДЭЭР УТГА — «Санхүүжилтийн явц» (ComboChart)-ийн ЯГ тэр дүрэм.
   *
   *    Тэнд 2026-08-25-нд «зөвхөн эцсийн утга үзүүлэх нь БУРУУ: 12 сарын урт
   *    графикийг гаргаад ганц тоо уншуулах юм бол график хэрэггүй» гэж
   *    зассан байсныг энэ график давтаж, дахин ЗӨВХӨН сүүлийн цэгээ
   *    тоогоор бичдэг байв (2026-08-27).
   *
   * ⚠️ Мөргөлдөхөөс сэргийлэх дүрэм: ТӨЛӨВЛӨГӨӨ муруйнхаа ДЭЭР, БОДИТ нь
   *    ДООР бичигдэнэ — хоёр цуваа ойртсон ч давхцахгүй.
   * ⚠️ Сүүлийн цэгийг АЛГАСНА: тэнд том шошго тусдаа бичигдэнэ (давхарлахгүй).
   */
  /**
   * ⚠️ БАГТААМЖААР сонгоно, тогтмол алхмаар БИШ (2026-09-03). Хэдэн сар
   *    харагдахаас хамааран «25%» гэсэн богино шошго ч нарийн цонхонд
   *    мөргөлдөнө; жинхэнэ пикселээр хэмжиж багтахыг нь л үлдээнэ.
   * ⚠️ Сүүлийн цэгийг АЛГАСНА: тэнд том шошго тусдаа бичигдэнэ (давхарлахгүй).
   */
  const fitPct = (idx: number[], valOf: (i: number) => string) => new Set(
    fitLabels(idx.map((i) => ({ i, x: xFor(i), w: textW(valOf(i)), anchor: anchor(i) }))),
  );
  const planLbl = fitPct(
    rows.map((_, i) => i).filter((i) => i !== N - 1),
    (i) => pct(rows[i].plan, 1),
  );
  /* ⚠️ `i !== lastAct`: сүүлийн хэмжилт дээр доорх ТОМ шошго аль хэдийн
     бичигдэнэ — хоёуланг нь зурвал нэг цэг дээр хоёр тоо давхарлана. */
  const actLbl = fitPct(
    measured.filter((i) => i !== N - 1 && i !== lastAct),
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
            {/* ⚠️ 2026-10-06 (аудит): «5.0 pp» — `pkgShared.ppAbs` (хувь биш, хувийн нэгж) */}
            {behind ? tr('хоцрогдол') : tr('түрүүлсэн')} {ppAbs(curGap)}
          </span>
        )
      }
    >
      {/* Легенд — тэмдэг нь ШУГАМЫН ХЭЛБЭРИЙГ давтана */}
      {/*
        * ⚠️ ЗУРАГДААГҮЙ ЦУВААГ ТАЙЛБАРТ ЖАГСААХГҮЙ. Урьд нь бөглөгдөөгүй
        *    багц дээр «Бодит гүйцэтгэл» ба «Зөрүү» гэж бичээд, харгалзах
        *    шугам нь огт байхгүй байсан тул хэрэглэгч дутуу зурагдсан гэж
        *    ойлгодог байв. Одоо дата байхгүйг ИЛ хэлнэ.
        */}
      <div className={ts.progLegend}>
        <span><i className={ts.progDash} style={{ borderTopColor: PLAN_C }} />{tr('Төлөвлөсөн')}</span>
        {measured.length > 0 && (
          <>
            <span><i className={ts.progSolid} style={{ background: ACT_C }} />{tr('Бодит гүйцэтгэл')}</span>
            <span><i className={behind ? ts.progAreaBad : ts.progAreaGood} />{tr('Зөрүү')}</span>
          </>
        )}
        {/* ⚠️ 2026-09-29 (аудит 10): `finQ` ачаалж байхад «бөглөгдөөгүй» гэж хэлэхгүй —
            бодит гүйцэтгэл ирээгүй байгаа нь бөглөөгүй гэсэн үг БИШ. */}
        {measured.length === 0 && (
          <span className={ts.progNoData}>
            {loading ? tr('Ачаалж байна…') : tr('Бодит гүйцэтгэл хараахан бөглөгдөөгүй')}
          </span>
        )}
      </div>

      <div
        className={ts.progWrap}
        ref={wrapRef}
        /* ⚠️ ЗУРАГЛАЛ нь ГРАФИКИЙН ТАЛБАЙГААР — бүтэн өргөнөөр бодоход зүүн
           тэнхлэгийн багана ба баруун шошгын зайнаас болж заагуур хулганаас
           хазайж, өөр сарын tooltip гардаг байв. */
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = (e.clientX - r.left - padL) / Math.max(1, plotW);
          setHi(Math.max(0, Math.min(N - 1, Math.round(t * (N - 1)))));
        }}
        onMouseLeave={() => setHi(null)}
        /* ⚠️ 2026-10-06 (аудит): ГАРААР ч уншигдана — урьд нь сарын утга зөвхөн хулганы
           hover-оор гардаг байв. Tab-аар фокуслоход сүүлийн хэмжилт (эсвэл сүүлийн сар) дээр
           зогсож, ←/→ сараар, Home/End эхлэл/төгсгөл рүү; уншилт нь доорх `aria-live` мөрөнд. */
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
            pt.act == null ? '—' : pp(pt.act - ptPlan)) : ''}
        </span>
        {/* ⚠️ `preserveAspectRatio="none"` ХАСАГДСАН — `viewBox` нь бодит
            пикселтэй тэнцүү тул үсэг гажихаа болив. */}
        <svg className={ts.progSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {/* Тор — 0/25/50/75/100%, шошго торны ДЭЭР (зүүн ирмэгт) */}
          {CHART.grid.map((t) => {
            const gy = yFor(t);
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={ts.progGrid} />
                {/* ⚠️ Торны ЗҮҮН талд, гадна багананд — муруй ба шошготой
                    давхцахгүй (2026-09-03). Босоо голлолт: `gy + 3`. */}
                <text x={padL - 8} y={gy + 3} className={ts.progAxisY} textAnchor="end">{t}%</text>
              </g>
            );
          })}

          {/* ЗӨРҮҮ — байрлалаараа өнгөтэй: бодит нь доогуур бол улаан */}
          {gapAreas.map((d, k) => (
            <path key={`gap-${k}`} d={d} className={behind ? ts.progGapBad : ts.progGapGood} style={{ opacity: CHART.gapFill }} />
          ))}

          {/* ⚠️ 2026-10-09: төлөвлөгөө 2px ТАСАРХАЙ (`CHART.planDash`), бодит 2px БҮТЭН (урьд 1.6 / 2.8).
              Зузаан биш ХЭЛБЭР нь үүргийг хэлнэ — бүх S-муруйд нэг дүрэм. */}
          {planSegs.map((sg) => (sg.single ? null : (
            <path
              key={`pl-${sg.from}`}
              d={sg.d}
              className={ts.progPlan}
              style={{ stroke: PLAN_C, strokeWidth: CHART.stroke, strokeDasharray: CHART.planDash }}
              vectorEffect="non-scaling-stroke"
            />
          )))}
          {actSegs.map((sg) => (sg.single
            /* Ганцаарчилсан хэмжилт (хоёр талдаа цоорхой) — шугамгүй тул ЦЭГ */
            ? <g key={`as-${sg.from}`}>{dot(sg.pts[0].x, sg.pts[0].y, ACT_C)}</g>
            : (
              <path
                key={`as-${sg.from}`}
                d={sg.d}
                className={ts.progAct}
                style={{ stroke: ACT_C, strokeWidth: CHART.stroke }}
                vectorEffect="non-scaling-stroke"
              />
            )))}

          {/* ТӨЛӨВЛӨГӨӨНИЙ утга — муруйн ДЭЭР талд */}
          {rows.map((r, i) => (planLbl.has(i) ? (
            <g key={`pl-${i}`}>
              {dot(xFor(i), yFor(r.plan), PLAN_C)}
              {/* ⚠️ y-г 12-оос дээш барина: дээд ирмэгт хүрсэн цэгийн шошго
                  SVG-ийн гаднаас тасарч, тоо хагас харагддаг. */}
              {/* ⚠️ ОБЬЁМ нь хувийн ХАЖУУД (2026-09-09, хэрэглэгчийн
                  хүсэлт «обьём давхар харагдмаар бн»). Задаргаа ороогүй
                  сард ЗӨВХӨН хувь — «0» гэж бичвэл «тэр сард ажил
                  төлөвлөөгүй» гэж ХУДАЛ уншигдана (`null ≠ 0`). */}
              <text
                x={xFor(i)}
                y={Math.max(12, yFor(r.plan) - 9)}
                className={ts.progVal}
                style={{ fill: PLAN_C }}
                textAnchor={anchor(i)}
              >
                {pct(r.plan, 1)}
                {r.vol != null && (
                  <tspan className={ts.progVol}>{` · ${num(r.vol, 0)}`}</tspan>
                )}
              </text>
            </g>
          ) : null))}

          {/* БОДИТ гүйцэтгэлийн утга — муруйн ДООР талд, зөвхөн ХЭМЖИГДСЭН сард.
              ⚠️ `i !== lastAct`: сүүлийн хэмжилт дээр доорх ТОМ шошго аль хэдийн
                 бичигдэнэ — хоёуланг нь зурвал нэг цэг дээр хоёр тоо давхарлана
                 (2026-08 дээр «0%» хоёр удаа гарч байсан). */}
          {rows.map((r, i) => (actLbl.has(i) && r.act != null ? (
            <g key={`ac-${i}`}>
              {dot(xFor(i), yFor(r.act), ACT_C)}
              <text
                x={xFor(i)}
                y={Math.min(padT + plotH - 4, yFor(r.act) + 16)}
                className={ts.progVal}
                style={{ fill: ACT_C }}
                textAnchor={anchor(i)}
              >
                {pct(r.act, 1)}
              </text>
            </g>
          ) : null))}

          {/* Сүүлийн цэгүүд — томоор, тодоор */}
          <g>
            {dot(xFor(N - 1), yFor(rows[N - 1].plan), PLAN_C, CHART.markerR + 1)}
            <text x={xFor(N - 1) + 9} y={yFor(rows[N - 1].plan) + 4} className={ts.progEnd} style={{ fill: PLAN_C }}>
              {pct(rows[N - 1].plan, 1)}
            </text>
          </g>
          {curAct != null && (
            <g>
              {dot(xFor(lastAct), yFor(curAct), ACT_C, CHART.markerR + 1)}
              <text x={xFor(lastAct) + 9} y={yFor(curAct) + 4} className={ts.progEnd} style={{ fill: ACT_C }}>
                {pct(curAct, 1)}
              </text>
            </g>
          )}

          {/* Hover — босоо шугам + цуваа бүрийн цэг */}
          {hv != null && (
            <g>
              <line x1={xFor(hv)} x2={xFor(hv)} y1={padT} y2={padT + plotH} className={ts.progCursor} />
              {dot(xFor(hv), yFor(rows[hv].plan), PLAN_C, CHART.markerR + 1)}
              {rows[hv].act != null && dot(xFor(hv), yFor(rows[hv].act as number), ACT_C, CHART.markerR + 1)}
            </g>
          )}

          {/* X тэнхлэг — он сар */}
          {rows.map((r, i) => (axisLbl.has(i) ? (
            <text key={r.label} x={xFor(i)} y={H - 9} className={ts.progAxisX} textAnchor={anchor(i)}>
              {r.label}
            </text>
          ) : null))}
        </svg>

        {pt && (
          <div
            className={ts.progTip}
            /* ⚠️ 2026-10-09: `xFor(hv)` ПИКСЕЛЭЭР — `viewBox` = бодит өргөн (`W`) тул
               муруйн цэгтэй яг давхцана. Урьд нь `hv/(N-1)`%-аар (wrap-ийн бүтэн өргөн)
               тул `padL`/`padR`-ийн хэрээр цэгээс зөрдөг байв — ComboChart-ын
               2026-10-07-ны засвартай ижил. */
            style={{
              left: xFor(hv!),
              transform: `translateX(${hv! < N / 2 ? '10px' : 'calc(-100% - 10px)'})`,
            }}
          >
            <p className={`num ${ts.progTipHd}`}>{pt.label}</p>
            <p className={ts.progTipRow}>
              <i style={{ background: PLAN_C }} />
              {tr('Төлөвлөсөн')}<b className="num">{pct(ptPlan, 1)}</b>
            </p>
            <p className={ts.progTipRow}>
              <i style={{ background: ACT_C }} />
              {/* ⚠️ «—» нь ХЭМЖИГДЭЭГҮЙ гэсэн үг; жинхэнэ 0% нь «0.0%» гэж гарна */}
              {tr('Бодит')}<b className="num">{pct(pt.act, 1)}</b>
            </p>
            <p className={`${ts.progTipRow} ${ts.progTipGap}`}>
              {tr('Зөрүү')}
              <b className="num">
                {/* ⚠️ 2026-10-06 (аудит): pp — `pkgShared.pp` (бодит − төлөвлөгөө) */}
                {pt.act == null ? '—' : pp(pt.act - ptPlan)}
              </b>
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

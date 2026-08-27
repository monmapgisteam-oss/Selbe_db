'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { usePlanTotals } from '@/lib/totals';
import { Section, Note, Data, Empty, Rows, Bars, List, ListItem } from '@/components/ui';
import {
  buildPacks, PackKpi, BlocksCard, LayersCard, levelColor, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import {
  useBuildings, MonitorBagts, MonitorGeneral, MonitorDetail, useTaskPerf,
  pickedBuilding, type PickedBuilding,
} from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, lagOf, lagLevel,
  type FinData, type MonthPt,
} from '@/modules/Finance';
import { useAsync, type Async } from '@/lib/useAsync';
import {
  BUILDING, CASHFLOW2, PROGRESS_LEVELS, LAYER_BY_ID, pkgKeyOf,
  PKG_FAMILY_BY_BAGTS, zoneWhere,
} from '@/lib/services';
import { cat, shade, num, pct } from '@/lib/format';
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

const HUE = LAYER_BY_ID[BLOCK_LAYER].hue;

/**
 * БАГЦЫН АНГИЛАЛ (2026-08-21, хэрэглэгчийн хүсэлт) — жагсаалт, «Төслийн
 * төрөл» chart, «Блокийн төлөв»-ийн асуудалтай талбарын тоолол гурвуулаа
 * ЭНЭ нэг ангиллыг хэрэглэнэ. Блоктой багц = барилга угсралт; бусад нь
 * PKG_TABLE-ийн гэр бүлээс: soc = нийгмийн барилга, site = өндөржилт,
 * үлдсэн (net/pow/src/com) = дэд бүтэц.
 */
type PackCat = 'build' | 'infra' | 'soc' | 'site';
const catOf = (p: Pack): PackCat => {
  if (p.kind === 'build') return 'build';
  const fam = PKG_FAMILY_BY_BAGTS[p.key];
  return fam === 'soc' ? 'soc' : fam === 'site' ? 'site' : 'infra';
};
/** Дараалал нь дэлгэцийн дараалал; нэрийг render үед tr()-ээр авна */
const PACK_CATS: { key: PackCat; name: () => string }[] = [
  { key: 'build', name: () => tr('Барилга угсралт') },
  { key: 'infra', name: () => tr('Дэд бүтэц') },
  { key: 'soc', name: () => tr('Нийгмийн барилга') },
  { key: 'site', name: () => tr('Өндөржилт') },
];
/** Газар чөлөөлөлтийн нэгж талбарын давхарга — давхцсан талбарыг зурахад. */
const PARCEL_LAYER = 'land:left';

/** Утгыг тоо руу — ArcGIS Double эсвэл "0" мэт мөр ирдэг */
const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

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
export function PkgProg({ dim, setDim }: {
  dim: Dim;
  setDim: (d: Dim) => void;
}) {
  /**
   * Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   * ⚠️ Горим тус бүр ӨӨРИЙН өргөнтэй: санхүүгийн баруун багана нь графиктай,
   * гүйцэтгэлийнх нь блокийн урт жагсаалттай — нэг утга хоёуланд тохирохгүй.
   */
  const side = useSideResize('pkgProg');
  const q = useBuildings();
  const finQ = useAsync<FinData>(loadFinData, []);
  const { zoomToWhere, setHighlight } = useMap();

  /** Сонгосон багц — Bagts-тай ижил `?pkg=` параметрээр хуваалцагдана */
  const [sel, setSel] = useState<string | null>(() => readParam('pkg'));
  /** Зураг дээр дарсан барилга — баруун картууд барилгын хяналт руу шилжинэ */
  const [pb, setPb] = useState<PickedBuilding | null>(null);
  const perfQ = useTaskPerf(pb);

  useEffect(() => { setHighlight(null); }, [setHighlight]);
  useEffect(() => { writeParams({ pkg: sel }); }, [sel]);

  const packs = useMemo<Pack[]>(
    () => buildPacks(q.state === 'ready' ? q.data.rows : null),
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
    overlapLeftParcels(srcs)
      .then((r) => alive && setOverlap(r))
      .catch(() => alive && setOverlap('error'));
    return () => {
      alive = false;
    };
  }, [active]);

  /** Амжилттай үр дүн л — зурагт/шүүлтэд алдааны төлөв «хоосон» мэт орохгүй */
  const ovOk = overlap !== 'error' ? overlap : null;

  /**
   * БАГЦ БҮРИЙН давхцсан үлдсэн нэгж талбар — «Багц N — блокууд» картын
   * толгойд. FinCard-ын нэгдсэн индикаторыг багцаар задалж энд зөөв
   * (2026-08-21, хэрэглэгчийн хүсэлт). Багц тус бүрд тусдаа огтлолцол тул
   * зэрэг бодогдож, нэг нь унавал бусдыг унагахгүй (allSettled).
   */
  const [ovByPack, setOvByPack] = useState<Map<string, number | 'error'> | null>(null);
  useEffect(() => {
    let alive = true;
    const builds = packs.filter((pk) => pk.kind === 'build');
    if (!builds.length) { setOvByPack(new Map()); return; }
    Promise.allSettled(
      builds.map(async (pk) => [
        pk.key,
        (await overlapLeftParcels(pk.layerIds.map((id) => ({ layerId: id, where: pk.where })))).oids.length,
      ] as const),
    ).then((rs) => {
      if (!alive) return;
      const m = new Map<string, number | 'error'>();
      /* ⚠️ Унасныг АЛГАСАХГҮЙ — түлхүүр нь Map-д огт орохгүй бол картын толгой
         «тоолж байна…» гэж МӨНХӨД хүлээлгэдэг байв; `'error'` = ил хэлнэ. */
      rs.forEach((r, i) => {
        if (r.status === 'fulfilled') m.set(r.value[0], r.value[1]);
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
      return [c.key, (await overlapLeftParcels(srcs)).oids.length] as const;
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
   * Багц бүрийн САНХҮҮГИЙН сарын цэгүүд — CASHFLOW2-ийн мөрийг bagtsKey-ээр
   * тааруулж НЭГ УДАА бэлдэнэ. Жагсаалтын гүйцэтгэлийн хувь ба хоцрогдлын
   * alert үүнээс тооцогдоно.
   */
  const finMap = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    const C = CASHFLOW2.fields;
    const m = new Map<string, ReturnType<typeof contractMonths>>();
    finQ.data.contracts.forEach((r) => {
      // ⚠️ `pkgKeyOf` — «БАГЦ 1-4» мэт ОЛОН багц хамарсан мөр нь bagtsKey-ээр
      //    «БАГЦ14» болж, бодит «Багц 14 · Дулаан хангамжийн нэвтрэх суваг»-т
      //    ХАРИЙН ТЭЗҮ гэрээ (2.23 тэрбум ₮) наалдаж, тэр багц «санхүү
      //    бүртгэлгүй» гэхийн оронд ХУДАЛ гүйцэтгэл харуулдаг байв.
      const k2 = pkgKeyOf(r[C.pkg2]);
      const k3 = pkgKeyOf(r[C.pkg]);
      [k2, k3].forEach((k) => {
        if (k && k !== '0' && !m.has(k)) m.set(k, contractMonths(r, finQ.data.given, finQ.data.phys));
      });
    });
    return m;
  }, [finQ]);

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
      progress: meanOf(blocks.map((b) => b.progress)),
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
  const mapVisible = useMemo(
    () => (ovOk?.oids.length ? [...new Set([...visible, PARCEL_LAYER])] : visible),
    [visible, ovOk],
  );
  /**
   * ДАВХЦСАН НЭГЖ ТАЛБАРЫН ХЭВ МАЯГ — УЛААН (хэрэглэгчийн шийдвэр, 2026-08-25).
   *
   * ⚠️ Улаан нь энэ порталд «саад / эрсдэл» гэсэн ТӨЛӨВИЙН өнгө бөгөөд
   *    давхцсан үлдсэн талбарын ТОО аль хэдийн улаанаар бичигддэг
   *    (`--bad-ink`). Зураг нь өөр өнгөөр (ягаан) ярьж байсан тул тоо ба
   *    полигон хоёр НЭГ зүйлийг хэлж байгаа нь нүдэнд холбогдохгүй байв.
   *
   * ⚠️ Блокууд улбар шар (`#ea580c`) тул ойролцоо өнгөтэй: ЗУЗААН хүрээ
   *    (4.2) ба өндөр дүүргэлт (0.3) нь ялгааг барина. Дээрээс нь энэ давхарга
   *    ПУЛЬСЛЭДЭГ тул хөдөлгөөнөөрөө ч ялгарна.
   *
   * ⚠️ HEX-ЭЭР бичнэ, CSS хувьсагчаар БИШ: MapCanvas-ийн `rgb()` нь зөвхөн
   *    `#rrggbb`-г задалдаг тул `var(--bad)` өгвөл NaN болж, полигон огт
   *    зурагдахгүй. Утга нь `globals.css`-ийн `--bad`-тай ижил.
   */
  /** Анивчих давхарга — давхцсан талбар олдсон үед л. */
  const parcelPulse = useMemo(
    () => (ovOk?.oids.length ? [PARCEL_LAYER] : undefined),
    [ovOk],
  );

  const parcelStyle = useMemo(
    () =>
      ovOk?.oids.length
        ? { [PARCEL_LAYER]: { hue: '#dc2626', fill: 0.3, width: 4.2 } }
        : undefined,
    [ovOk],
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
      // Багц сонгосон → тэр багц; эс бөгөөс → зөвхөн хоцрогдолтой багцын блокууд
      w[BLOCK_LAYER] = active?.where ?? alertedWhere;
      // ⚠️ Давхаргад 2,119 талбар бий — ЗӨВХӨН давхцсаныг үлдээнэ, эс бөгөөс
      //    бүх хот дүүрэн парсел зурагдаж блокууд дарагдана.
      w[PARCEL_LAYER] = ovOk?.oids.length
        ? `OBJECTID IN (${ovOk.oids.join(',')})`
        : null;
      return w;
    },
    [active, alertedWhere, ovOk, zone, mapVisible],
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

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={side.hostRef}
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
          <TsKpi packs={packs} fin={finQ.state === 'ready' ? finQ.data : null} />
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
            {/* ⚠ ХОЦРОГДОЛТОЙ багцууд — тусдаа бүлэг, ХАМГИЙН ДЭЭР, карт бүхэлдээ анивчина.
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
            {/* ДӨРВӨН АНГИЛЛААР (2026-08-21) — барилга угсралт · дэд бүтэц ·
                нийгмийн барилга · өндөржилт; alert-тэй нь дээрх бүлэгт */}
            {PACK_CATS.map((c) => (
              <TsPackList
                key={c.key}
                title={c.name()}
                /* Дэд бүтэц/нийгмийн барилгад биет хувь байхгүй тул
                   «гүйцэтгэлийн хувь» гэж амлахгүй — зурагт байгаа зүйлээ л. */
                note={c.key === 'build' ? tr('блокийн гүйцэтгэл') : tr('зурагт харагдах давхарга')}
                /* ⚠️ Alert-тай багц нь ДЭЭД бүлэгт гарсан тул эндээс хасагдана —
                   эс бөгөөс нэг багц хоёр газар давхардаж жагсана. */
                packs={packs.filter((p) => catOf(p) === c.key && !alertKeys.has(p.key))}
                sel={sel}
                onSel={pick}
                finMap={finMap}
              />
            ))}
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
          pulseIds={parcelPulse}
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
          {active?.kind === 'infra'
            ? active.layerIds.map((id) => (
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
            <CatChart packs={packs} />
            {allPack && <LevelsCard blocks={allPack.blocks} ovByCat={ovByCat} />}
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
                overlapN={ovByPack == null ? null : (ovByPack.get(p.key) ?? null)}
              />
            ))}
          </>
        ) : active.kind === 'build' ? (
          /* Барилгын багц — блокийн жагсаалт ба ажлын хяналт (БИЕТ явц) */
          <>
            <BlocksCard p={active} overlapN={overlap == null ? null : overlap === 'error' ? 'error' : overlap.oids.length} />
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
          months={
            active
              ? (finMap?.get(active.key) ?? null)
              : (finQ.state === 'ready' ? aggregateMonths(finQ.data) : null)
          }
          title={active ? tr('{0} — гүйцэтгэлийн явц', tr(active.name)) : tr('Төсөл нийт — гүйцэтгэлийн явц')}
        />
      </div>

    </div>
  );
}

/**
 * БАГЦЫН ЖАГСААЛТ (Tsogts хувилбар) — МӨНГӨН ДҮН БИШ, ГҮЙЦЭТГЭЛИЙН ХУВИЙГ
 * харуулж, төлөвлөгөөнөөс хоцорсон багцад ALERT (улаан/шар) өгнө:
 *   · build багц — биет гүйцэтгэлийн % (блокийн дундаж)
 *   · infra багц — санхүүгийн гүйцэтгэл % (олгосон/төлөвлөгөө, CASHFLOW2+IPC)
 * Хоцрогдол = Finance-ийн lagOf дүрэм (CF өссөн төлөвлөгөө vs биет %).
 */
/**
 * ДЭЭД ИНДИКАТОРУУД (2026-08-21, хэрэглэгчийн жагсаалтаар) — багц сонгоогүй
 * үеийн төслийн нэгдсэн 6 үзүүлэлт. Хувиуд нь доод графиктай ИЖИЛ аргачлал
 * (`aggregateMonths`) тул хоёр газрын тоо зөрөхгүй.
 */
function TsKpi({ packs, fin }: { packs: Pack[]; fin: FinData | null }) {
  const t = useMemo(() => {
    if (!fin) return null;
    const months = aggregateMonths(fin);
    const nowYm = new Date().toISOString().slice(0, 7);
    let planned: number | null = null;
    let actual: number | null = null;
    for (const m of months) {
      if (m.label > nowYm) continue;
      if (m.cumPct > 0) planned = m.cumPct;
      if (m.phys > 0) actual = m.phys;
    }
    const gap = planned != null && actual != null ? planned - actual : null;
    const C = CASHFLOW2.fields;
    const planTotal =
      fin.contracts.reduce((a, r) => a + nn(r[C.prevAmount]), 0) +
      months.reduce((a, m) => a + m.amount, 0);
    let given = 0;
    fin.given.forEach((byMon) => byMon.forEach((v) => { given += v; }));
    return {
      planned, actual, gap, given,
      share: planTotal > 0 ? (given / planTotal) * 100 : null,
      /** Төлөвлөгөөт нийтээс олгогдоогүй үлдэгдэл ₮ */
      remain: Math.max(0, planTotal - given),
    };
  }, [fin]);
  /**
   * ⚠️ Индикаторууд ГОРИМООР ялгана. «Нийт төслийн тоо» ХОЁУЛАНД байна — тэр нь
   * контекст (хэдэн багцын тухай ярьж байна) бөгөөд аль ч асуултад хэрэгтэй.
   * Гүйцэтгэлийн зөрүү нь БИЕТ vs ТӨЛӨВЛӨГӨӨ тул гүйцэтгэлийн талд; олгосон
   * санхүүжилт ба түүний хувь нь санхүүгийн талд.
   */
  const items = [
      { v: num(packs.length), l: tr('нийт төслийн тоо') },
      { v: t?.actual == null ? '…' : pct(t.actual, 1), l: tr('бодит гүйцэтгэлийн хувь') },
      { v: t?.planned == null ? '…' : pct(t.planned, 1), l: tr('төлөвлөсөн гүйцэтгэлийн хувь') },
      {
        v: t?.gap == null ? '…' : `${t.gap >= 0 ? '−' : '+'}${Math.abs(t.gap).toFixed(1)}%`,
        l: tr('гүйцэтгэлийн зөрүүгийн хувь'),
    },
  ];
  return (
    <>
      {items.map((i) => (
        /* Нэг аяс (--data) — өнгөөр ялгах утга биш, зэрэгцсэн нэг эгнээ */
        <div key={i.l} className={o.tile} style={{ '--tone': 'var(--data)' } as CSSProperties}>
          <span className={`${o.tileVal} num`}>{i.v}</span>
          <span className={o.tileLabel}>{i.l}</span>
        </div>
      ))}
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
      if (p.kind === 'build') execPct = p.progress;
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
                  ? tr('{0} блок · {1} айл{2}', num(p.blocks.length), num(p.households), lag && lvl ? tr(' · төл. {0}% / бодит {1}%', lag.planned.toFixed(0), lag.actual.toFixed(0)) : '')
                  /* Дэд бүтэц: гүйцэтгэлийн харагдацад мөнгө дурдахгүй —
                     зөвхөн зурагт хэдэн давхаргатай нь. */
                  : (p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй'))}
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {execPct == null ? '—' : pct(execPct, 0)}
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
                      <span className="num">−{lag.gap.toFixed(1)}%</span>
                      <small className="num">
                        {lag.planned.toFixed(0)}/{lag.actual.toFixed(0)}
                      </small>
                    </b>
                  )}
                </span>
              }
              color={lvl === 'red' ? 'var(--bad)' : lvl === 'yellow' ? 'var(--warn)' : p.kind === 'build' ? levelColor(p.progress) : cat(2)}
              active={open}
              onClick={() => onSel(open ? null : p.key)}
            />
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
 * «Олгосон санхүүжилт» нь БОДИТ IPC актын нийлбэр (CASHFLOW2+IPC — Finance-тэй
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
 *
 * ⚠️ Тоо нь доод графиктай ИЖИЛ эх сурвалжаас (`contractMonths`): төлөвлөгөө нь
 * сарын `amount`-ийн нийлбэр, олгосон нь `given`-ийнх. Тусад нь тооцвол хоёр
 * газрын дүн зөрнө.
 *
 * ⚠️ Санхүүгийн бүртгэлгүй багцыг ХАСНА — «0 ₮» гэж харуулбал «олгоогүй»
 * гэсэн ХУДАЛ дохио өгнө; бодит утга нь «гэрээ бүртгэгдээгүй».
 */
function CatChart({ packs }: { packs: Pack[] }) {
  const rows = PACK_CATS.map((c) => {
    const list = packs.filter((p) => catOf(p) === c.key);
    const pcts: number[] = [];
    /*
     * ⚠️ ЗӨВХӨН БИЕТ явц. Урьд нь дэд бүтцийн багцад биет өгөгдөл байхгүй тул
     *    «олгосон / төлөвлөгөө» мөнгөн хувиар нөхөж, барилгын биет хувьтай НЭГ
     *    баганад нийлүүлдэг байв — хоёр өөр хэмжигдэхүүний дундаж нь юуг ч
     *    хэмждэггүй тоо.
     */
    for (const p of list) {
      if (p.kind === 'build' && p.progress != null) pcts.push(p.progress);
    }
    const mean = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    return { c, n: list.length, mean };
  });
  return (
    <Section
      tone="primary"
      title={tr('Төслийн төрөл')}
      note={tr('{0} багц ажил', num(packs.length))}
    >
      <Bars
        color={HUE}
        max={100}
        items={rows.map((r, i) => ({
          key: r.c.key,
          label: `${r.c.name()} · ${num(r.n)}`,
          value: r.mean ?? 0,
          color: shade(HUE, i, rows.length),
          display: r.mean == null ? tr('мэдээлэлгүй') : pct(r.mean, 1),
        }))}
      />
    </Section>
  );
}

/** Блокийн ТӨЛӨВИЙН тоолол — 113 блок гүйцэтгэлийн 4 түвшнээр (сонгоогүй үед) */
function LevelsCard({
  blocks,
  ovByCat,
}: {
  blocks: Pack['blocks'];
  /**
   * Ангилал бүрийн асуудалтай (давхцсан үлдсэн) нэгж талбар — null = ачаалж
   * байна, `'error'` = тухайн ангиллын тоолол унасан («0» гэж худлахгүй).
   */
  ovByCat: Map<PackCat, number | 'error'> | null;
}) {
  const counts = PROGRESS_LEVELS.map(() => 0);
  let noData = 0;
  blocks.forEach((b) => {
    if (b.progress == null) { noData++; return; }
    counts[Math.min(PROGRESS_LEVELS.length - 1, Math.floor(b.progress / 25))]++;
  });
  return (
    <Section title={tr('Блокийн төлөв')} note={tr('{0} блок{1}', blocks.length, noData ? tr(' · {0} мэдээлэлгүй', noData) : '')}>
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
 * биет нь багцуудын дундаж). CASHFLOW2-ийн мөрийг `bagtsKey`-ээр тааруулна
 * («БАГЦ-4.1» = «Багц 4-1»); хоцрогдлын badge мөн Finance-ийн дүрмээр.
 */
/** Санхүүгийн графикийн өндрийн хязгаарууд (px) — чирэх бариул */

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд: төлөвлөгөө = бүх гэрээний сарын нийлбэр,
 * олгосон = бүх багцын IPC нийлбэр, өссөн хувь = нийлбэрийн харьцаа,
 * биет = биет дататай багцуудын дундаж.
 */
function aggregateMonths(d: FinData) {
  const labels = CASHFLOW2.months;
  const planM = labels.map((m) => d.contracts.reduce((a, r) => a + nn(r[m.amount]), 0));
  const planTotal = planM.reduce((a, b) => a + b, 0);
  let cum = 0;
  return labels.map((m, i) => {
    cum += planM[i];
    let given = 0;
    d.given.forEach((byMon) => { given += byMon.get(m.label) ?? 0; });
    // ⚠️ Төслийн сарын биет гүйцэтгэл — багцуудын дунджийн ДУНДАЖ БИШ. Давхар
    //    дундаж нь блок цөөтэй багцыг том багцтай ижил жинтэй болгож гажуудуулж,
    //    мөн дэлгэц дээрх PackKpi-ийн блок-жигнэсэн дүнтэй зөрдөг. Багц бүрийг
    //    блокийнх нь тоогоор жигнэнэ: Σ(pct_p · blocks_p) / Σ blocks_p.
    let physW = 0, physN = 0;
    d.phys.forEach((byMon, k) => {
      const v = byMon.get(m.label);
      if (v == null) return;
      const w = d.physCnt.get(k)?.get(m.label) ?? 1;
      physW += v * w;
      physN += w;
    });
    return {
      label: m.label,
      amount: planM[i],
      amountCum: cum,
      cumPct: planTotal > 0 ? (cum / planTotal) * 100 : 0,
      given,
      phys: physN > 0 ? physW / physN : 0,
    };
  });
}


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
 */
function ProgChart({ months, title }: { months: MonthPt[] | null; title: string }) {
  const [hi, setHi] = useState<number | null>(null);

  if (!months || !months.length) {
    return <Section title={title}><Empty label={tr('Гүйцэтгэлийн дата алга.')} /></Section>;
  }

  const rows = months.map((m) => ({ label: m.label, plan: m.cumPct, act: m.phys }));
  let lastAct = -1;
  rows.forEach((r, i) => { if (r.act > 0) lastAct = i; });
  const cur = lastAct >= 0 ? rows[lastAct] : null;
  const curGap = cur ? cur.plan - cur.act : null;
  const behind = (curGap ?? 0) > 0;

  const N = rows.length;
  const W = 1200;
  const H = 250;
  const padL = 8;   /* Y шошго торны ДЭЭР сууна — тусдаа багана эзлэхгүй */
  const padR = 56;  /* сүүлийн цэгийн шошго */
  const padT = 24;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;

  const planPts = rows.map((r, i) => ({ x: xFor(i), y: yFor(r.plan) }));
  const actPts = rows.slice(0, lastAct + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.act) }));

  /*
   * ЗӨРҮҮГИЙН ТАЛБАЙ — төлөвлөгөөний муруйгаас бодит муруй хүртэл.
   * ⚠️ Хоёр шугам ойрхон явахад ялгаа нь нүдэнд баригддаггүй; будсанаар
   *    зөрүү нь ХЭМЖЭЭ болж харагдана.
   */
  const gapArea = actPts.length > 1
    ? curve(planPts.slice(0, actPts.length))
      + ' L ' + [...actPts].reverse().map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' L ')
      + ' Z'
    : '';

  const step = Math.max(1, Math.ceil(N / 12));
  const pt = hi != null ? rows[hi] : null;
  const anchor = (i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');

  return (
    <Section
      title={title}
      note={
        curGap == null ? undefined : (
          <span className={behind ? ts.progBad : ts.progGood}>
            {behind ? tr('хоцрогдол') : tr('түрүүлсэн')} {Math.abs(curGap).toFixed(1)}%
          </span>
        )
      }
    >
      {/* Легенд — тэмдэг нь ШУГАМЫН ХЭЛБЭРИЙГ давтана */}
      <div className={ts.progLegend}>
        <span><i className={ts.progDash} style={{ borderTopColor: cat(2) }} />{tr('Төлөвлөсөн')}</span>
        <span><i className={ts.progSolid} style={{ background: cat(1) }} />{tr('Бодит гүйцэтгэл')}</span>
        <span><i className={behind ? ts.progAreaBad : ts.progAreaGood} />{tr('Зөрүү')}</span>
      </div>

      <div
        className={ts.progWrap}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHi(Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width) * (N - 1)))));
        }}
        onMouseLeave={() => setHi(null)}
      >
        <svg className={ts.progSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
          {/* Тор — 0/25/50/75/100%, шошго торны ДЭЭР (зүүн ирмэгт) */}
          {[0, 25, 50, 75, 100].map((t) => {
            const gy = yFor(t);
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={ts.progGrid} />
                <text x={padL} y={gy - 5} className={ts.progAxisY} textAnchor="start">{t}%</text>
              </g>
            );
          })}

          {/* ЗӨРҮҮ — байрлалаараа өнгөтэй: бодит нь доогуур бол улаан */}
          {gapArea && <path d={gapArea} className={behind ? ts.progGapBad : ts.progGapGood} />}

          {planPts.length > 1 && (
            <path d={curve(planPts)} className={ts.progPlan} style={{ stroke: cat(2) }} vectorEffect="non-scaling-stroke" />
          )}
          {actPts.length > 1 && (
            <path d={curve(actPts)} className={ts.progAct} style={{ stroke: cat(1) }} vectorEffect="non-scaling-stroke" />
          )}

          {/* Сүүлийн цэгүүд — графикийн ЦОРЫН ГАНЦ тогтмол тоо */}
          <g>
            <circle cx={xFor(N - 1)} cy={yFor(rows[N - 1].plan)} r={4} className={ts.progDot} style={{ fill: cat(2) }} />
            <text x={xFor(N - 1) + 9} y={yFor(rows[N - 1].plan) + 4} className={ts.progEnd} style={{ fill: cat(2) }}>
              {rows[N - 1].plan.toFixed(0)}%
            </text>
          </g>
          {cur && (
            <g>
              <circle cx={xFor(lastAct)} cy={yFor(cur.act)} r={4} className={ts.progDot} style={{ fill: cat(1) }} />
              <text x={xFor(lastAct) + 9} y={yFor(cur.act) + 4} className={ts.progEnd} style={{ fill: cat(1) }}>
                {cur.act.toFixed(0)}%
              </text>
            </g>
          )}

          {/* Hover — босоо шугам + цуваа бүрийн цэг */}
          {hi != null && (
            <g>
              <line x1={xFor(hi)} x2={xFor(hi)} y1={padT} y2={padT + plotH} className={ts.progCursor} />
              <circle cx={xFor(hi)} cy={yFor(rows[hi].plan)} r={4} className={ts.progDot} style={{ fill: cat(2) }} />
              {hi <= lastAct && (
                <circle cx={xFor(hi)} cy={yFor(rows[hi].act)} r={4} className={ts.progDot} style={{ fill: cat(1) }} />
              )}
            </g>
          )}

          {/* X тэнхлэг — он сар */}
          {rows.map((r, i) => (i === 0 || i === N - 1 || i % step === 0 ? (
            <text key={r.label} x={xFor(i)} y={H - 9} className={ts.progAxisX} textAnchor={anchor(i)}>
              {r.label}
            </text>
          ) : null))}
        </svg>

        {pt && (
          <div
            className={ts.progTip}
            style={{
              left: `${(hi! / Math.max(1, N - 1)) * 100}%`,
              transform: `translateX(${hi! < N / 2 ? '10px' : 'calc(-100% - 10px)'})`,
            }}
          >
            <p className={`num ${ts.progTipHd}`}>{pt.label}</p>
            <p className={ts.progTipRow}>
              <i style={{ background: cat(2) }} />
              {tr('Төлөвлөсөн')}<b className="num">{pt.plan.toFixed(1)}%</b>
            </p>
            <p className={ts.progTipRow}>
              <i style={{ background: cat(1) }} />
              {tr('Бодит')}<b className="num">{pt.act > 0 ? `${pt.act.toFixed(1)}%` : '—'}</b>
            </p>
            <p className={`${ts.progTipRow} ${ts.progTipGap}`}>
              {tr('Зөрүү')}
              <b className="num">
                {pt.act > 0 ? `${pt.plan - pt.act >= 0 ? '−' : '+'}${Math.abs(pt.plan - pt.act).toFixed(1)}%` : '—'}
              </b>
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

/** Catmull-Rom → куб Безье: муруй жигд, эвдрэлгүй */
function curve(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}`
      + ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}`
      + ` ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
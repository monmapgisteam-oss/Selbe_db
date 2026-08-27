'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
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
  buildPacks, PackKpi, ContractCard, BlocksCard,
  InvestCard, LayersCard, levelColor, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import {
  useBuildings, MonitorBagts, MonitorGeneral, MonitorDetail, useTaskPerf,
  pickedBuilding, type PickedBuilding,
} from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, ComboChart, lagOf, lagLevel, type FinData,
} from '@/modules/Finance';
import { useAsync, type Async } from '@/lib/useAsync';
import {
  BUILDING, CASHFLOW2, PROGRESS_LEVELS, LAYER_BY_ID, pkgKeyOf,
  PKG_FAMILY_BY_BAGTS, zoneWhere,
} from '@/lib/services';
import { cat, shade, mntAbbr, num, pct } from '@/lib/format';
import { readParam, writeParams } from '@/lib/urlState';
import o from './tsogtsOv.module.css';
import f from './finance.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { overlapLeftParcels, type Overlap } from '@/lib/parcelOverlap';
import ts from './tsogts.module.css';

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
 * Багцын харагдацын ГОРИМ.
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
export type PackMode = 'fin' | 'prog';

export function Tsogts({ dim, setDim, mode }: {
  dim: Dim;
  setDim: (d: Dim) => void;
  mode: PackMode;
}) {
  const isFin = mode === 'fin';
  /**
   * Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   * ⚠️ Горим тус бүр ӨӨРИЙН өргөнтэй: санхүүгийн баруун багана нь графиктай,
   * гүйцэтгэлийнх нь блокийн урт жагсаалттай — нэг утга хоёуланд тохирохгүй.
   */
  const side = useSideResize(isFin ? 'pkgFin' : 'pkgProg');
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
  const [finH, setFinH] = useState(FIN_H0);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(FIN_H_LS));
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
   * ДАВХЦСАН НЭГЖ ТАЛБАРЫН ХЭВ МАЯГ — барилгын блокоос ЯЛГАРАХ ёстой.
   *
   * ⚠️ Анхны загвар нь улаавтар (`#e11d48`) бөгөөд блокууд ч улбар шар
   *    (`#ea580c`) тул ортофото дээр хоёулаа ижил төстэй харагдаж, аль нь
   *    барилга, аль нь газар болох нь ялгагдахаа больдог. Тод ягаан + зузаан
   *    хүрээ нь хоёуланг нь эрс тасалж өгнө.
   */
  /** Анивчих давхарга — давхцсан талбар олдсон үед л. */
  const parcelPulse = useMemo(
    () => (ovOk?.oids.length ? [PARCEL_LAYER] : undefined),
    [ovOk],
  );

  const parcelStyle = useMemo(
    () =>
      ovOk?.oids.length
        ? { [PARCEL_LAYER]: { hue: '#d946ef', fill: 0.22, width: 3.4 } }
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
  const pick = (k: string | null) => {
    setSel(k);
    setPb(null);
    setHighlight(null);
  };

  /** Зураг дээрх барилга дарах → баруун талд тухайн барилгын хяналт */
  /* useCallback — inline функц render бүрд шинэ лавлагаа болж memo(MapCanvas)-ыг
     эвддэг (Iot-д 2026-08-24-нд илэрсэн ижил ангиллын алдаа). setPb/setHighlight
     хоёул тогтвортой тул хамаарал [setHighlight]. */
  const onMapPick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    const b = pickedBuilding(attrs, layerId);
    if (!b) return;
    const oid = Number(attrs?.[BUILDING.oid]);
    setPb(b);
    if (Number.isFinite(oid)) setHighlight(`${BUILDING.oid} = ${oid}`, BLOCK_LAYER);
  }, [setHighlight]);
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
          <PackKpi active={active} packs={packs} />
        ) : (
          <TsKpi packs={packs} fin={finQ.state === 'ready' ? finQ.data : null} mode={mode} />
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
            {!isFin && alerted.length > 0 && (
              <div className={ts.alertCard}>
                <TsPackList
                  title={tr('⚠ Хоцрогдолтой багц')}
                  note={tr('төлөвлөгөөнөөс хоцорсон')}
                  packs={alerted}
                  sel={sel}
                  onSel={pick}
                  finMap={finMap}
                  finOnly={isFin}
                />
              </div>
            )}
            {/* ДӨРВӨН АНГИЛЛААР (2026-08-21) — барилга угсралт · дэд бүтэц ·
                нийгмийн барилга · өндөржилт; alert-тэй нь дээрх бүлэгт */}
            {PACK_CATS.map((c) => (
              <TsPackList
                key={c.key}
                title={c.name()}
                note={isFin
                  ? tr('олгосон / төлөвлөгөө')
                  : c.key === 'build' ? tr('блокийн гүйцэтгэл') : tr('гүйцэтгэлийн хувь')}
                /* ⚠️ Санхүүгийн горимд ХОЦРОГДОЛТОЙ бүлэг байхгүй тул тэдгээр
                   багцыг энд буцааж оруулна — эс бөгөөс жагсаалтаас алга болно. */
                packs={packs.filter((p) => catOf(p) === c.key && (isFin || !alertKeys.has(p.key)))}
                sel={sel}
                onSel={pick}
                finMap={finMap}
                finOnly={isFin}
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
        {pb && !isFin ? (
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
            <CatChart packs={packs} finMap={finMap} finOnly={isFin} />
            {!isFin && allPack && <LevelsCard blocks={allPack.blocks} ovByCat={ovByCat} />}
            {/* ТӨСЛИЙН НИЙТ давхцсан үлдсэн нэгж талбар — хэрэглэгчийн
                хүсэлтээр (2026-08-21) ТУСДАА КАРТ болгож БУЦААВ: FinCard-аас
                хассан нэгдсэн тоо. Багц бүрийн задаргаа нь доорх «Багц N —
                блокууд» картуудын толгойд; энэ нь бүх багцын НИЙТ (блок + дэд
                бүтэц, давхардалгүй). Сонголтгүй үед `overlap` яг энэ утга. */}
            {!isFin && (
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
            )}
            {isFin && <PkgFinList packs={packs} finMap={finMap} />}
            {/* Блок бүрийн гүйцэтгэл — БАГЦААР нь бүлэглэсэн (нэг багц = нэг карт).
                ⚠️ Зөвхөн ГҮЙЦЭТГЭЛИЙН харагдацад: блокийн биет явц нь санхүүгийн
                асуултад хамаарахгүй, харин баганыг маш урт болгодог. */}
            {!isFin && packs.filter((p) => p.kind === 'build').map((p) => (
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
          /* ⚠️ Гэрээ нь САНХҮҮГИЙН баримт (дүн, хугацаа, гүйцэтгэгч), блокийн
             жагсаалт ба ажлын хяналт нь БИЕТ явц — тус тусын харагдацад. */
          isFin ? <ContractCard p={active} /> : (
            <>
              <BlocksCard p={active} overlapN={overlap == null ? null : overlap === 'error' ? 'error' : overlap.oids.length} />
              <MonitorBagts bagts={active.name} />
            </>
          )
        ) : (
          /* Дэд бүтцийн багц: хөрөнгө оруулалт → санхүү, давхаргын бүтэц → гүйцэтгэл */
          isFin ? <InvestCard p={active} /> : <LayersCard p={active} />
        )}
      </div>

      {/* ── ДООД ГОЛ: санхүүгийн график (сонгоогүй бол ТӨСЛИЙН НЭГДСЭН).
             ⚠️ ЗӨВХӨН санхүүгийн харагдацад — CASHFLOW, олгосон дүн, төлбөрийн
             акт бүгд мөнгөн хэмжигдэхүүн. Гүйцэтгэлийн харагдац доод зурвасгүй
             тул зураг ба блокийн жагсаалт өндрийг бүтнээр авна. */}
      {isFin && (
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
        <FinCard p={active} finQ={finQ} chartH={finH} finOnly />
      </div>
      )}
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
function TsKpi({ packs, fin, mode }: { packs: Pack[]; fin: FinData | null; mode: PackMode }) {
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
  const items = mode === 'fin'
    ? [
      { v: num(packs.length), l: tr('нийт төслийн тоо') },
      { v: t == null ? '…' : mntAbbr(t.given), l: tr('олгосон санхүүжилт') },
      { v: t?.share == null ? '…' : pct(t.share, 1), l: tr('нийт санхүүжилтийн олгосон хувь') },
      /* ⚠️ Гүйцэтгэлийн хувийн оронд МӨНГӨН үлдэгдэл — санхүүгийн харагдацад
         биет явцын тоо огт гарахгүй (2026-08-21, хэрэглэгчийн хүсэлт). */
      { v: t == null ? '…' : mntAbbr(t.remain), l: tr('олгогдоогүй үлдэгдэл') },
    ]
    : [
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
  title, note, packs, sel, onSel, finMap, finOnly = false,
}: {
  title: string;
  note: string;
  packs: Pack[];
  sel: string | null;
  onSel: (k: string | null) => void;
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
  /**
   * САНХҮҮГИЙН хэл: мөр бүрийн утга нь ОЛГОСОН ХУВЬ (мөнгө), дэд мөрөнд
   * олгосон/төлөвлөгөө ₮. Биет гүйцэтгэл, хоцрогдлын тэмдэг ХАРАГДАХГҮЙ.
   *
   * ⚠️ 2026-08-21: хоцрогдол нь биет vs төлөвлөгөөний зөрүү тул «Багцын
   * гүйцэтгэл» талын ойлголт — санхүүгийн жагсаалтад орох ёсгүй.
   */
  finOnly?: boolean;
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
      // ⚠️ Санхүүгийн горимд хоцрогдол ОГТ тооцохгүй — тэмдэг ч, эрэмбэ ч
      const lag = finOnly ? null : (months ? lagOf(months) : null);
      const lvl = lag ? lagLevel(lag.gap) : null;
      const plan = months ? months.reduce((a, m) => a + m.amount, 0) : 0;
      const given = months ? months.reduce((a, m) => a + m.given, 0) : 0;
      let execPct: number | null = null;
      if (finOnly) {
        // САНХҮҮ: багцын төрлөөс үл хамааран ОЛГОСОН / ТӨЛӨВЛӨГӨӨ
        execPct = plan > 0 ? (given / plan) * 100 : null;
      } else if (p.kind === 'build') execPct = p.progress;
      else if (months) execPct = plan > 0 ? (given / plan) * 100 : null;
      return { p, lag, lvl, execPct, plan, given };
    })
    .sort((a, b) => {
      const rank = (l: 'red' | 'yellow' | null) => (l === 'red' ? 0 : l === 'yellow' ? 1 : 2);
      return rank(a.lvl) - rank(b.lvl) || (b.lag?.gap ?? 0) - (a.lag?.gap ?? 0);
    });
  return (
    <Section title={title} note={tr('{0} багц · {1}', num(packs.length), note)}>
      <List>
        {rows.map(({ p, lag, lvl, execPct, plan, given }) => {
          /**
           * ⚠️ 2026-08-18 (хэрэглэгчийн хүсэлт): багц дарахад ЖАГСААЛТЫН ДОТОР,
           * ЯГ ТЭР МӨРИЙН ДООР сарын цуваа задарна. Урьд нь сонголт зөвхөн
           * дэлгэцийн ӨӨР хэсэг дэх картуудыг сольдог байсан тул хэрэглэгч
           * жагсаалтаас нүдээ салгаж, багц хооронд харьцуулах боломжгүй байв.
           * Одоо хэд хэдэн багцыг ээлжлэн дарж, нэг байрлалд цувааг нь хардаг.
           */
          const months = finMap?.get(p.key) ?? null;
          const open = p.key === sel;
          return (
            <Fragment key={p.key}>
            <ListItem
              title={tr(p.name)}
              sub={finOnly
                ? (plan > 0 || given > 0
                  ? tr('{0} / {1}', mntAbbr(given), mntAbbr(plan))
                  : tr('санхүү бүртгэлгүй'))
                : p.kind === 'build'
                  ? tr('{0} блок · {1} айл{2}', num(p.blocks.length), num(p.households), lag && lvl ? tr(' · төл. {0}% / бодит {1}%', lag.planned.toFixed(0), lag.actual.toFixed(0)) : '')
                  : tr('{0}{1}', p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй'), execPct != null ? '' : tr(' · санхүү бүртгэлгүй'))}
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
              color={lvl === 'red' ? 'var(--bad)' : lvl === 'yellow' ? 'var(--warn)' : finOnly ? cat(0) : p.kind === 'build' ? levelColor(p.progress) : cat(2)}
              active={open}
              onClick={() => onSel(open ? null : p.key)}
            />
            {open && (
              <div className={ts.packExpand}>
                {months && months.length ? (
                  <>
                    <div className={ts.packLegend}>
                      <span><i style={{ background: cat(2) }} />{tr('Төлөвлөгөө')}</span>
                      <span><i style={{ background: cat(0) }} />{tr('Санхүүжилт')}</span>
                      {!finOnly && <span><i style={{ background: cat(1) }} />{tr('Биет %')}</span>}
                    </div>
                    {/* ⚠️ Намхан (140px) — жагсаалтын мөр хооронд задарч байгаа тул
                        доод бүтэн графикийн (220px) орлуулга БИШ, товч тойм. */}
                    <ComboChart items={months} height={140} lagMonth={lag?.month} lagLvl={lvl} />
                  </>
                ) : (
                  <Empty label={tr('Cashflow-д энэ багцын гэрээ бүртгэлгүй.')} />
                )}
              </div>
            )}
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
function PkgFinList({
  packs, finMap,
}: {
  packs: Pack[];
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
}) {
  const rows = useMemo(() => {
    if (!finMap) return null;
    return packs
      .map((p) => {
        const months = finMap.get(p.key);
        if (!months) return null;
        const plan = months.reduce((a, m) => a + m.amount, 0);
        const given = months.reduce((a, m) => a + m.given, 0);
        if (plan <= 0 && given <= 0) return null;
        return { key: p.key, label: tr(p.name), plan, given, pct: plan > 0 ? (given / plan) * 100 : null };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.given - a.given);
  }, [packs, finMap]);

  if (!rows) return <Section title={tr('Багц бүрийн санхүүжилт')}><Empty label={tr('Ачаалж байна…')} /></Section>;
  if (!rows.length) return <Section title={tr('Багц бүрийн санхүүжилт')}><Empty label={tr('Гэрээ бүртгэгдээгүй')} /></Section>;

  return (
    <Section
      title={tr('Багц бүрийн санхүүжилт')}
      note={tr('{0} багц · олгосон ₮', num(rows.length))}
    >
      <Bars
        color={HUE}
        max={100}
        items={rows.map((r, i) => ({
          key: r.key,
          label: r.label,
          value: r.pct ?? 0,
          color: shade(HUE, i, rows.length),
          display: `${mntAbbr(r.given)} / ${mntAbbr(r.plan)}`,
        }))}
      />
    </Section>
  );
}

function CatChart({
  packs,
  finMap,
  finOnly = false,
}: {
  packs: Pack[];
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
  /**
   * САНХҮҮГИЙН хэл: багана бүр ОЛГОСОН / ТӨЛӨВЛӨГӨӨ хувь.
   *
   * ⚠️ 2026-08-21: нэгдсэн горимд build багц нь БИЕТ гүйцэтгэлээр, infra нь
   * санхүүгээр хэмжигддэг тул хоёр өөр хэмжигдэхүүн нэг чартад холилддог байв.
   * Санхүүгийн харагдацад бүгд НЭГ хэмжүүрээр — мөнгө.
   */
  finOnly?: boolean;
}) {
  const rows = PACK_CATS.map((c) => {
    const list = packs.filter((p) => catOf(p) === c.key);
    const pcts: number[] = [];
    for (const p of list) {
      if (!finOnly && p.kind === 'build') {
        if (p.progress != null) pcts.push(p.progress);
        continue;
      }
      const months = finMap?.get(p.key);
      if (!months) continue;
      const plan = months.reduce((a, m) => a + m.amount, 0);
      const given = months.reduce((a, m) => a + m.given, 0);
      if (plan > 0) pcts.push((given / plan) * 100);
    }
    const mean = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    return { c, n: list.length, mean };
  });
  return (
    <Section
      tone="primary"
      title={tr('Төслийн төрөл')}
      note={finOnly ? tr('олгосон хувь · {0} багц', num(packs.length)) : tr('{0} багц ажил', num(packs.length))}
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
const FIN_H0 = 220;
const FIN_H_MIN = 140;
const FIN_H_MAX = 520;
const FIN_H_LS = 'selbe.finh.tsogts';

function FinCard({
  p,
  finQ,
  chartH = FIN_H0,
  finOnly = false,
}: {
  p: Pack | null;
  finQ: Async<FinData>;
  /** Комбо графикийн өндөр (px) — дээд ирмэгийн чирэх бариулаас (2026-08-21) */
  chartH?: number;
  /**
   * ЗӨВХӨН МӨНГӨНИЙ хэл: биет гүйцэтгэлийн үзүүлэлт, шугам, легенд, хоцрогдлын
   * тэмдэг бүгд НУУГДАНА.
   *
   * ⚠️ 2026-08-21 (хэрэглэгчийн хүсэлт): «Багцын санхүү» харагдац дээр ажлын
   * гүйцэтгэл ХАРАГДАХ ЁСГҮЙ — тэр бүхэн «Багцын гүйцэтгэл» талд. Хоцрогдол нь
   * биет vs төлөвлөгөөний ЗӨРҮҮ тул мөн гүйцэтгэлийн ойлголт.
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
  const C = CASHFLOW2.fields;

  // Дата бэлэн бол сарын цэг, нийт дүн, хоцрогдлыг урьдчилан бодно — badge-ийг
  // гарчигт (нэрний хажууд) ба note-д (баруун талд) тавихад хэрэгтэй.
  let months: ReturnType<typeof contractMonths> | null = null;
  let total = 0;
  let noRow = false;
  if (d) {
    if (p) {
      const row =
        d.contracts.find((r) => pkgKeyOf(r[C.pkg2]) === p.key) ??
        d.contracts.find((r) => pkgKeyOf(r[C.pkg]) === p.key) ??
        null;
      if (!row) noRow = true;
      else {
        months = contractMonths(row, d.given, d.phys);
        total = nn(row[C.prevAmount]) + months.reduce((a, m) => a + m.amount, 0);
      }
    } else {
      months = aggregateMonths(d);
      total =
        d.contracts.reduce((a, r) => a + nn(r[C.prevAmount]), 0) +
        months.reduce((a, m) => a + m.amount, 0);
    }
  }
  const lag = months ? lagOf(months) : null;
  const lvl = lag ? lagLevel(lag.gap) : null;

  /**
   * KPI — Cashflow (төлөвлөсөн санхүүжилт) ба IPC (олгосон акт)-ын ₮ дүн, тэдгээрийн
   * ЗӨРҮҮ; мөн ГҮЙЦЭТГЭЛИЙН ХУВЬ хоёр (төлөвлөгөөт = Cashflow-ийн өссөн %, бодит =
   * биет гүйцэтгэл %) ба тэдгээрийн ЗӨРҮҮ. Хоёр хувийг «одоо» хүртэлх сүүлийн
   * бөглөгдсөн сараар авна — `lagOf`-той ижил дүрэм тул хоцрогдлын badge-тэй таарна.
   */
  const givenTotal = months ? months.reduce((a, m) => a + m.given, 0) : 0;
  const nowYm = new Date().toISOString().slice(0, 7);
  let plannedPct: number | null = null;
  let actualPct: number | null = null;
  if (months) {
    for (const m of months) {
      if (m.label > nowYm) continue;
      if (m.cumPct > 0) plannedPct = m.cumPct;
      if (m.phys > 0) actualPct = m.phys;
    }
  }
  // Санхүүжилтийн зөрүү — төлөвлөсөн − олгосон (₮). Эерэг = олгоогүй үлдэгдэл.
  const finGap = total - givenTotal;
  // IPC-ийн санхүүжилтийн гүйцэтгэл — олгосон ÷ төлөвлөсөн (%)
  const givenShare = total > 0 ? (givenTotal / total) * 100 : null;
  // Гүйцэтгэлийн зөрүү — төлөвлөгөөт − бодит (%). Эерэг = хоцрогдол.
  const progGap = plannedPct != null && actualPct != null ? plannedPct - actualPct : null;
  const gapText = progGap == null ? '—' : `${progGap >= 0 ? '−' : '+'}${Math.abs(progGap).toFixed(1)}%`;

  // ГАРЧИГ — нэр + (хоцрогдол бол) нэрний ХАЖУУД alert badge
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {p ? tr(p.name) : tr('Төсөл нийт')}{' '}
      {finOnly ? tr('— санхүүжилт · төлөвлөгөө') : tr('— санхүүжилт · төлөвлөгөө · гүйцэтгэл')}
      {!finOnly && lag && lvl && (
        <span
          className={`${f.lagBadge} ${lvl === 'red' ? f.lagRed : f.lagYellow}`}
          title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
        >
          {lvl === 'red' ? tr('Хоцрогдол') : tr('Анхаарах')} −{lag.gap.toFixed(1)}%
        </span>
      )}
    </span>
  );
  // NOTE — гарчгийн БАРУУН талд «олгогдох нийт санхүүжилт» (график дээр биш)
  const note =
    total > 0 ? (
      <span className={ts.totNote}>
        {tr('Олгогдох нийт:')} <b>{num(total)} ₮</b>
      </span>
    ) : undefined;

  return (
    <Section tone="primary" title={title} note={note}>
      {finQ.state === 'loading' ? (
        <Empty label={tr('Санхүүжилтийн дата…')} />
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
          {/* ⚠️ 2026-08-21 (хэрэглэгчийн хүсэлт): KPI-ийн утгууд НЭГ өнгөөр —
              урьд нь графикийн цувааны өнгө + төлөвийн улаан/ногоон холилдож
              байсныг болиулав. Цувааны өнгө legend + график дээрээ үлдэнэ.
              Нэгж нь товчилсон («тэрб. ₮») — нарийхан нүдэнд багтана. */}
          {kpiOpen && (
          <div className={ts.finKpi}>
            {[
              { v: mntAbbr(total), l: tr('Cashflow төлөвлөсөн'), c: 'var(--ink)' },
              {
                v: (
                  <>
                    {mntAbbr(givenTotal)}
                    {/**
                      * ⚠️ 2026-08-20: Хувийг ТУСДАА МӨРӨНД. Урьд нь утгын хажууд
                      * мөрлөж байсан бөгөөд `.finKpiVal` нь `nowrap` тул
                      * «314.5 тэрбум ₮ 27%» нь нүдний 1fr өргөнөөс ХАЛЬЖ, «27%»
                      * баруун хүрээн дээгүүр гарч бичигддэг байв.
                      */}
                    {givenShare != null && (
                      <small style={{ display: 'block', fontSize: '0.72em', opacity: 0.7, fontWeight: 600 }}>
                        {givenShare.toFixed(0)}%
                      </small>
                    )}
                  </>
                ),
                l: tr('IPC олгосон'),
                c: 'var(--ink)',
              },
              /* ⚠️ envhub: эерэг зөрүү нь хэвийн үлдэгдэл тул ТОГТМОЛ warn өнгө
                 нь худал дохио байв — төлөв заадаггүй утга var(--ink)-ээр. */
              { v: mntAbbr(finGap), l: tr('Санхүүжилтийн зөрүү'), c: 'var(--ink)' },
              /* ⚠️ Гүйцэтгэлийн гурван хувь ЗӨВХӨН нэгдсэн горимд — санхүүгийн
                 харагдацад биет явц огт харагдахгүй (2026-08-21). */
              ...(finOnly ? [] : [
                { v: plannedPct == null ? '—' : pct(plannedPct, 1), l: tr('Төлөвлөгөөт гүйцэтгэл'), c: 'var(--ink)' },
                { v: actualPct == null ? '—' : pct(actualPct, 1), l: tr('Бодит гүйцэтгэл'), c: 'var(--ink)' },
                { v: gapText, l: tr('Гүйцэтгэлийн зөрүү'), c: 'var(--ink)' },
              ]),
              /* ⚠️ «Давхцсан үлдсэн нэгж талбар» индикатор ЭНДЭЭС ХАСАГДАВ
                 (2026-08-21): нэгдсэн тоо нь аль багц саадтайг хэлдэггүй
                 байсан тул багцаар задарч «Багц N — блокууд» картуудын
                 толгойд очив. */
            ].map((k) => (
              <div key={k.l}>
                <span className={`${ts.finKpiVal} num`} style={{ color: k.c }}>{k.v}</span>
                <span className={ts.finKpiLabel}>{k.l}</span>
              </div>
            ))}
          </div>
          )}
          <div className={ts.finLegend}>
            <span><i style={{ background: cat(2) }} />{tr('Төлөвлөгөө өссөн ₮')}</span>
            <span><i style={{ background: cat(0) }} />{tr('Санхүүжилт өссөн ₮')}</span>
            {!finOnly && <span><i style={{ background: cat(1) }} />{tr('Биет гүйцэтгэл %')}</span>}
          </div>
          <ComboChart
            items={months}
            height={chartH}
            lagMonth={finOnly ? undefined : lag?.month}
            lagLvl={finOnly ? null : lvl}
            hidePhys={finOnly}
          />
        </>
      ) : null}
    </Section>
  );
}

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд: төлөвлөгөө = бүх гэрээний сарын нийлбэр,
 * олгосон = бүх багцын IPC нийлбэр, өссөн хувь = нийлбэрийн харьцаа,
 * биет = биет дататай багцуудын дундаж.
 */
export function aggregateMonths(d: FinData) {
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

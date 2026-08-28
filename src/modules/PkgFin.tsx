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
import { Section, Note, Data, Empty, Rows, Bars, Donut, List, ListItem } from '@/components/ui';
import {
  buildPacks, PackKpi, InvestCard, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import { useBuildings, pickedBuilding } from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, ComboChart, lagOf, lagLevel,
  finLagOf, finLagLevel, type FinData,
} from '@/modules/Finance';
import { useAsync, type Async } from '@/lib/useAsync';
import {
  BUILDING, CASHFLOW2, IPC_LOG, LAYER_BY_ID, pkgKeyOf, bagtsKey,
  PKG_FAMILY_BY_BAGTS, zoneWhere, cfMonthAxis } from '@/lib/services';
import { cat, shade, date, mntAbbr, num, pct } from '@/lib/format';
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
/** Утгыг тоо руу — ArcGIS Double эсвэл "0" мэт мөр ирдэг */
const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ⚠️ ЭНЭ МОДУЛЬ ЗӨВХӨН «БАГЦЫН САНХҮҮ»-Д. 
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
export function PkgFin({ dim, setDim }: {
  dim: Dim;
  setDim: (d: Dim) => void;
}) {
  /**
   * Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   * ⚠️ Горим тус бүр ӨӨРИЙН өргөнтэй: санхүүгийн баруун багана нь графиктай,
   * гүйцэтгэлийнх нь блокийн урт жагсаалттай — нэг утга хоёуланд тохирохгүй.
   */
  const side = useSideResize('pkgFin');
  const q = useBuildings();
  const finQ = useAsync<FinData>(loadFinData, []);
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
   * ⚠️ «ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАР» ЭНЭ ХАРАГДАЦААС БҮРЭН ХАСАГДАВ
   *    (2026-08-27, хэрэглэгчийн шийдвэр). Гурван шалтгаан:
   *
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
   * Багц → ГЭРЭЭНИЙ ТҮҮХИЙ МӨР (CASHFLOW2).
   *
   * ⚠️ `finMap` нь зөвхөн САРЫН цэгүүдийг хадгалдаг тул гэрээний дугаар,
   *    огноо, эх үүсвэр, төсөвт өртөг зэрэг бүх лавлах талбар алдагддаг.
   *    Санхүүгийн дэлгэрэнгүйд тэдгээр нь ЯГ хэрэгтэй — «энэ мөнгө ямар
   *    гэрээгээр, ямар эх үүсвэрээс гарч байна вэ».
   */
  const finRow = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    const C = CASHFLOW2.fields;
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
   * ⚠️ Индикатор ба баруун карт ХОЁУЛАА энэ утгыг хэрэглэнэ: хоёр газарт
   *    тусад нь бодвол нэгийг нь засахад нөгөө нь хоцорч, нэг дэлгэц дээр
   *    хоёр өөр дүн харагдана.
   *
   * `null` = ачаалж байна · дүн 0 = гэрээ бүртгэгдээгүй.
   */
  const activeFin = useMemo(() => {
    if (!finMap) return null;
    const months = active ? finMap.get(active.key) : null;
    if (months) {
      return {
        plan: months.reduce((a, m) => a + m.amount, 0),
        given: months.reduce((a, m) => a + m.given, 0),
      };
    }
    // Багц сонгосон ч гэрээгүй → тэг; сонгоогүй бол БҮХ багцын нийлбэр
    if (active) return { plan: 0, given: 0 };
    let plan = 0;
    let given = 0;
    finMap.forEach((ms) => ms.forEach((m) => { plan += m.amount; given += m.given; }));
    return { plan, given };
  }, [finMap, active]);

  /**
   * ALERT-тэй (төлөвлөгөөнөөс хоцорсон) багцууд — ТУСДАА бүлэг болж жагсаалтын
   * ХАМГИЙН ДЭЭР гарна. Гүйцэтгэл хэвийн болмогц lag арилж, багц өөрийн
   * бүлэгтээ аяндаа буцна (тусгай төлөв хадгалахгүй).
   */
  const alertKeys = useMemo(() => {
    const s = new Set<string>();
    if (!finMap) return s;
    /*
     * ⚠️ ЭНД ЗӨВХӨН САНХҮҮГИЙН ХОЦРОГДОЛ: авах ХУГАЦАА нь өнгөрсөн атлаа
     *    мөнгө нь ороогүй. Биет явцын хоцрогдол нь «Багцын гүйцэтгэл»
     *    модулийнх — хоёрыг нэг дүрмээр шийдвэл нэг цонхны alert
     *    нөгөөгийнхөө асуултад хариулж, «яагаад улаан байна вэ» гэдэг нь
     *    ойлгогдохгүй болно.
     */
    packs.forEach((p) => {
      const months = finMap.get(p.key);
      if (!months) return;
      const fl = finLagOf(months);
      if (fl && finLagLevel(fl.pct, fl.gap, fl.noRecord)) s.add(p.key);
    });
    return s;
  }, [packs, finMap]);
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
   * ЗУРАГТ ӨГӨХ жагсаалт — каталогийн сонголт шууд.
   * ⚠️ Урьд нь давхцсан үлдсэн нэгж талбарын давхаргыг ЭНД нэмдэг байсныг
   *    хассан (дээрх тайлбарыг үз).
   */
  const mapVisible = visible;

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
    /*
     * ⚠️ САНХҮҮГИЙН ХАРАГДАЦАД БАРИЛГА СОНГОХ УТГАГҮЙ: барилгын хяналт нь
     *    биет явцын хэсэг тул тэнд нээгддэггүй бөгөөд урьд нь дарахад ЮУ Ч
     *    гардаггүй байв — хэрэглэгч эвдэрсэн гэж боддог. Оронд нь тухайн
     *    блокийн БАГЦЫГ сонгоно: санхүүгийн цонхны бүх карт багцаар ярьдаг
     *    тул энэ нь «энэ барилга хэний мөнгөөр баригдаж байна» гэсэн
     *    асуултын шууд хариулт.
     */
    const k = bagtsKey(b.bagts);
    /* Багц нь тодорхойлогдохгүй барилга (bagts талбар хоосон) — сонголтыг
       цэвэрлэнэ. Юу ч хийхгүй орхивол даралт «мэдрэгдээгүй» мэт болно. */
    pick(packs.find((x) => x.key === k)?.key ?? null);
  }, [packs, pick]);

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
          <PackKpi active={active} packs={packs} fin={activeFin} />
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
                  title={tr('⚠ Санхүүжилт хоцорсон багц')}
                  note={tr('хугацаа өнгөрсөн ч аваагүй')}
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
                note={tr('олгосон / төлөвлөгөө')}
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
          /* ⚠️ Блокуудыг ГҮЙЦЭТГЭЛЭЭР өнгө ялгахгүй: зураг нь биет явцыг
             ярьвал энэ цонх нэрэндээ үл нийцнэ. Нэг жигд өнгө = «эдгээр нь
             тухайн багцын блокууд» гэсэн БАЙРЛАЛЫН мэдээлэл. */
          uniform
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
        ) : !active ? (
          /* Багц сонгоогүй — ТӨСЛИЙН НЭГДСЭН: гэрээ/төсөв · эх үүсвэр · төлөв · блок гүйцэтгэл */
          <>
            <CatChart packs={packs} finMap={finMap} finOnly />
            <PkgFinList packs={packs} finMap={finMap} />
          </>
        ) : active.kind === 'build' ? (
          /* ⚠️ Гэрээ нь САНХҮҮГИЙН баримт (дүн, хугацаа, гүйцэтгэгч), блокийн
             жагсаалт ба ажлын хяналт нь БИЕТ явц — тус тусын харагдацад. */
          <>
            {/* ⚠️ БАГЦ СОНГОСОН ҮЕД ЗӨВХӨН ТҮҮНИЙ ДЭЛГЭРЭНГҮЙ. Ерөнхий
                харьцуулалтын чартууд нь СОНГОЛТГҮЙ үеийн хариулт — сонголттой
                үед доор нь дахин гаргавал хэрэглэгч аль тоо сонгосон багцынх,
                аль нь бүх төслийнх болохыг ялгаж чадахаа болино. */}
            <PkgFinCard p={active} fin={activeFin} />
            <PkgFinDetail row={finRow?.get(active.key) ?? null} loading={!finRow} />
            <PkgActs p={active} finQ={finQ} />
            <PkgMonths p={active} finMap={finMap} />
          </>
        ) : (
          /* Дэд бүтцийн багц — хөрөнгө оруулалт ба гэрээний задаргаа */
          <>
            <InvestCard p={active} />
            <PkgFinDetail row={finRow?.get(active.key) ?? null} loading={!finRow} />
            <PkgActs p={active} finQ={finQ} />
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
        <FinCard p={active} finQ={finQ} chartH={finH} finOnly />
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
      if (m.phys != null) actual = m.phys;
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
      { v: t == null ? '…' : mntAbbr(t.given), l: tr('олгосон санхүүжилт') },
      { v: t?.share == null ? '…' : pct(t.share, 1), l: tr('нийт санхүүжилтийн олгосон хувь') },
      /* ⚠️ Гүйцэтгэлийн хувийн оронд МӨНГӨН үлдэгдэл — санхүүгийн харагдацад
         биет явцын тоо огт гарахгүй (2026-08-21, хэрэглэгчийн хүсэлт). */
      { v: t == null ? '…' : mntAbbr(t.remain), l: tr('олгогдоогүй үлдэгдэл') },
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
      /*
       * ⚠️ ХОЦРОГДОЛ нь горимоороо ӨӨР утгатай:
       *   · гүйцэтгэл — БИЕТ явц төлөвлөгөөнөөс хэдэн ХУВЬ хоцорсон
       *   · санхүү    — авах хугацаа өнгөрсөн ч хэдэн ТӨГРӨГ ороогүй
       * Тиймээс тэмдэг нь ч өөр нэгжээр (% vs ₮) ярина.
       */
      const fl = months ? finLagOf(months) : null;
      const lvl = fl ? finLagLevel(fl.pct, fl.gap, fl.noRecord) : null;
      const plan = months ? months.reduce((a, m) => a + m.amount, 0) : 0;
      const given = months ? months.reduce((a, m) => a + m.given, 0) : 0;
      // Багцын төрлөөс үл хамааран ОЛГОСОН / ТӨЛӨВЛӨГӨӨ
      const execPct = plan > 0 ? (given / plan) * 100 : null;
      /*
       * ⚠️ ДЭД БҮТЦИЙН БАГЦАД БИЕТ ЯВЦЫН ӨГӨГДӨЛ БАЙХГҮЙ. Урьд нь түүний
       *    оронд «олгосон / төлөвлөгөө» МӨНГӨН хувийг «гүйцэтгэл» гэж
       *    үзүүлдэг байв — гүйцэтгэлийн цонхонд санхүүгийн тоо, дээрээс нь
       *    ӨӨР нэрээр. Барилгын багцын биет хувьтай нэг баганад зэрэгцэн
       *    зогсох тул харьцуулж болохгүй хоёр хэмжигдэхүүн холилдож байв.
       *    Одоо «мэдээлэлгүй» гэж ил хэлнэ.
       */
      return { p, fl, lvl, execPct, plan, given };
    })
    .sort((a, b) => {
      const rank = (l: 'red' | 'yellow' | null) => (l === 'red' ? 0 : l === 'yellow' ? 1 : 2);
      /* Ижил зэрэглэлд ДУТУУ ДҮНГЭЭР — их нь эхэнд */
      const w = (x: typeof a) => x.fl?.gap ?? 0;
      return rank(a.lvl) - rank(b.lvl) || w(b) - w(a);
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
        {rows.map(({ p, fl, lvl, execPct, plan, given }) => {
          /* Сонгогдсон эсэх — мөрийг тодруулахад. Сонголтын үр дүн нь доод
             бүтэн график ба баруун картуудад гарна. */
          const open = p.key === sel;
          return (
            <Fragment key={p.key}>
            <ListItem
              title={tr(p.name)}
              sub={plan > 0 || given > 0
                ? tr('{0} / {1}', mntAbbr(given), mntAbbr(plan))
                : tr('санхүү бүртгэлгүй')}
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {execPct == null ? '—' : pct(execPct, 0)}
                  {/**
                    * ⚠️ 2026-08-18: анхааруулга нь ЗӨВХӨН «⚠» тэмдэг байсныг
                    * ЗӨРҮҮ + ТӨЛӨВЛӨСӨН/БОДИТ гурвалаар ил гаргав. Урьд нь тоо
                    * нь зөвхөн hover-ийн `title`-д байсан тул жагсаалтыг нүдээр
                    * гүйлгэхэд аль багц хэр хоцорсныг ХАРАХ арга байхгүй байлаа.
                    */}
                  {/* САНХҮҮГИЙН хоцрогдол — дутуу ₮ ба хэдэн сар */}
                  {lvl && fl && (
                    <b
                      className={`${ts.gapBadge} ${lvl === 'red' ? ts.gapRed : ts.gapYellow}`}
                      title={tr('{0} хүртэл авах ёстой {1}, олгогдсон {2}', fl.month, mntAbbr(fl.planned), mntAbbr(fl.given))}
                    >
                      <span className={lvl === 'red' ? ts.alertBlink : undefined}>⚠</span>
                      <span className="num">−{mntAbbr(fl.gap)}</span>
                      <small className="num">{tr('{0} сар', String(fl.lateMonths))}</small>
                    </b>
                  )}
                  {/* ⚠️ БҮРТГЭЛ АЛГА — улаан БИШ, саарал. Төлөвлөгөө нь
                      өнгөрсөн атлаа олголтын акт нэг ч ороогүй: асуудал нь
                      мөнгөнд биш, БҮРТГЭЛД байж болно. */}
                  {fl?.noRecord && (
                    <b
                      className={ts.noRecBadge}
                      title={tr('{0} хүртэл {1} авах төлөвлөгөөтэй ч олголтын акт бүртгэгдээгүй', fl.month, mntAbbr(fl.planned))}
                    >
                      {tr('бүртгэл алга')}
                    </b>
                  )}
                </span>
              }
              color={lvl === 'red' ? 'var(--bad)' : lvl === 'yellow' ? 'var(--warn)' : cat(0)}
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
/**
 * СОНГОСОН БАГЦЫН САНХҮҮГИЙН КАРТ — «Багцын санхүү»-гийн баруун багана.
 *
 * ⚠️ Урьд нь энд `ContractCard` («{багц} — гүйцэтгэл») сууж, гүйцэтгэлийн
 *    цагираг ба блок/айлын тоог үзүүлдэг байв — санхүүгийн цонхон дээр биет
 *    явцын хариулт. Одоо зөвхөн мөнгө.
 *
 * ⚠️ Гүйцэтгэгчийн нэр ҮЛДСЭН: тэр нь гэрээний тал, мөнгө ХЭНД очиж байгааг
 *    хэлдэг тул санхүүгийн асуултын нэг хэсэг.
 */
function PkgFinCard({ p, fin }: { p: Pack; fin: { plan: number; given: number } | null }) {
  const contractor = p.blocks.map((b) => b.contractor).find((c) => c) ?? '—';
  const has = !!fin && (fin.plan > 0 || fin.given > 0);
  const share = has && fin!.plan > 0 ? (fin!.given / fin!.plan) * 100 : null;
  return (
    <Section tone="primary" title={tr('{0} — санхүү', tr(p.name))}>
      {fin == null ? (
        <Empty label={tr('Ачаалж байна…')} />
      ) : !has ? (
        <Empty label={tr('Гэрээ бүртгэгдээгүй')} />
      ) : (
        <Rows
          items={[
            { key: tr('Гүйцэтгэгч'), value: contractor },
            { key: tr('Төлөвлөгөөт санхүүжилт'), value: <span className="num">{mntAbbr(fin.plan)}</span> },
            { key: tr('Олгосон санхүүжилт'), value: <span className="num">{mntAbbr(fin.given)}</span> },
            { key: tr('Олгосон хувь'), value: <span className="num">{share == null ? '—' : pct(share, 1)}</span> },
            {
              key: tr('Олгогдоогүй үлдэгдэл'),
              value: <span className="num">{mntAbbr(Math.max(0, fin.plan - fin.given))}</span>,
            },
          ]}
        />
      )}
    </Section>
  );
}

/**
 * СОНГОСОН БАГЦЫН ГЭРЭЭ БА САНХҮҮЖИЛТИЙН ЭХ ҮҮСВЭР.
 *
 * ⚠️ Энэ багана нь сонгосон багцын санхүүгийн БҮХ мэдээллийг харуулах ёстой
 *    (хэрэглэгчийн шаардлага). Дүнгүүд ганцаараа «хэдэн төгрөг» гэдгийг л
 *    хэлдэг; гэрээний дугаар, огноо, захирамж, эх үүсвэр нь «яагаад, юуны
 *    үндсэн дээр» гэдгийг хэлнэ — хяналтын ажилд хоёулаа хэрэгтэй.
 *
 * ⚠️ ХООСОН талбарыг МӨРӨӨР НЬ хасна: 12 мөрийн 8 нь «—» байвал жагсаалт
 *    нь мэдээлэл биш чимэг болно.
 */
function PkgFinDetail({ row, loading }: { row: Record<string, unknown> | null; loading: boolean }) {
  const C = CASHFLOW2.fields;
  const txt = (v: unknown) => String(v ?? '').trim();
  const nn2 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  if (loading) return <Section title={tr('Гэрээний мэдээлэл')}><Empty label={tr('Ачаалж байна…')} /></Section>;
  if (!row) return <Section title={tr('Гэрээний мэдээлэл')}><Empty label={tr('Гэрээ бүртгэгдээгүй')} /></Section>;

  /* Урт текст (ажлын нэр 163 тэмдэгт хүрдэг) — 3 мөрөөр таслаж, бүтнийг нь
     hover-ийн `title`-д. Тайлбаргүй таславал мэдээлэл алдагдана. */
  const long = (v: string) => <span className={ts.clamp3} title={v}>{v}</span>;
  const items: { key: string; value: React.ReactNode }[] = [];
  const push = (k: string, v: React.ReactNode, ok: boolean) => { if (ok) items.push({ key: k, value: v }); };
  const money = (v: unknown) => <span className="num">{mntAbbr(nn2(v))}</span>;

  push(tr('Ажлын нэр'), long(txt(row[C.name])), !!txt(row[C.name]));
  push(tr('Төрөл'), long(txt(row[C.type])), !!txt(row[C.type]));
  push(tr('Гэрээний дугаар'), txt(row[C.contractNo]), !!txt(row[C.contractNo]));
  push(tr('Гэрээ байгуулсан'), date(row[C.contractDate] as number), !!row[C.contractDate]);
  push(tr('Гүйцэтгэгч'), long(txt(row[C.contractor])), !!txt(row[C.contractor]));
  push(tr('Захиалагчийн хяналт'), long(txt(row[C.client])), !!txt(row[C.client]));
  push(tr('Урьдчилсан төсөвт өртөг'), money(row[C.budget]), nn2(row[C.budget]) > 0);
  push(tr('Захирамжийн дугаар'), txt(row[C.orderNo]), !!txt(row[C.orderNo]));
  push(tr('Захирамжийн нийт дүн'), money(row[C.orderTotal]), nn2(row[C.orderTotal]) > 0);
  push(tr('Гэрээ байгуулах эрх олгосон'), money(row[C.contractAmount]), nn2(row[C.contractAmount]) > 0);
  push(tr('Өмнө шилжүүлсэн'), money(row[C.prevAmount]), nn2(row[C.prevAmount]) > 0);
  push(
    tr('Өмнө шилжүүлсэн хувь'),
    <span className="num">{pct(nn2(row[C.prevPct]) * 100, 1)}</span>,
    nn2(row[C.prevPct]) > 0,
  );

  /* ЭХ ҮҮСВЭР — дүнтэй нь л. Өнгө нь services.ts-д тодорхойлогдсон. */
  const src = CASHFLOW2.sources
    .map((x) => ({ ...x, v: nn2(row[x.field]) }))
    .filter((x) => x.v > 0);
  const srcTotal = src.reduce((a, x) => a + x.v, 0);

  return (
    <>
      <Section title={tr('Гэрээний мэдээлэл')}>
        {items.length ? <Rows items={items} /> : <Empty label={tr('Талбарууд хоосон')} />}
      </Section>
      {src.length === 0 ? (
        /* ⚠️ Картыг ЧИМЭЭГҮЙ нуухгүй: 65 багцын 13-д эх үүсвэр бүртгэгдээгүй
           бөгөөд хэсэг нь огт байхгүй байхад бусад багцад байдаг нь
           «ачаалагдсангүй юу» гэсэн эргэлзээ төрүүлнэ. */
        <Section title={tr('Санхүүжилтийн эх үүсвэр')}>
          <Empty label={tr('Эх үүсвэр бүртгэгдээгүй')} />
        </Section>
      ) : (
        <Section title={tr('Санхүүжилтийн эх үүсвэр')} note={tr('{0} эх үүсвэр', String(src.length))}>
          {/* ⚠️ Багана биш ЦАГИРАГ: эх үүсвэрүүд нь НИЙТИЙН ХУВААРИЛАЛТ
              (нийлбэр нь гэрээний дүн) тул «хэн хэдэн хувийг эзэлж байна»
              гэдэг нь гол асуулт. Багана нь урттай харьцуулдаг, цагираг нь
              БҮХЭЛД ЭЗЛЭХ ХУВЬ-ийг шууд харуулна.
              `stack` — нарийн баганад тайлбар нь доогуураа бүтэн өргөнөөр. */}
          <Donut
            items={src.map((x) => ({
              key: x.field,
              label: x.label,
              value: x.v,
              color: x.color,
              display: mntAbbr(x.v),
            }))}
            size={140}
            width={22}
            /*
             * ⚠️ ЗУРААСТАЙ ШОШГО (`leaders`) ЭНД ТОХИРОХГҮЙ. Тэр байрлал нь
             *    цагирагийн хоёр талд 106px өргөн шошгын багана нэмдэг — нийт
             *    352px. Баруун багана нь ~380px, дотор нь картын дүүргэлт бий
             *    тул «Нийслэлийн төсөв» мэт урт нэр хайрцгаасаа хальж, картын
             *    ирмэгээс гардаг. Дашбоард дээр тэр хэв маяг ажилладаг нь
             *    самбар нь өргөн учраас.
             *
             *    `stack` — тайлбар нь цагирагийн ДООР бүтэн өргөнөөр жагсана:
             *    нэр хэдий ч урт байсан багтана, давхцах орон зай ч үгүй.
             */
            stack
            center={mntAbbr(srcTotal)}
            centerLabel={tr('нийт')}
          />
        </Section>
      )}
    </>
  );
}

/**
 * ГҮЙЦЭТГЭЛИЙН АКТУУД (IPC) — сонгосон багцаар.
 *
 * ⚠️ Мөнгө нь АКТААР олгогддог: «34.8 тэрбум олгосон» гэдэг нь хэдэн актын
 *    нийлбэр вэ, аль нь хэзээний хугацааг хамарсан бэ гэдгийг хэлдэггүй.
 *    Хяналтын ажилд мөрдөх нэгж нь ЯГ ЭНЭ акт тул тусад нь жагсаана.
 *
 * ⚠️ ӨГӨГДЛИЙН БАЙДАЛ (2026-08-25-нд шалгасан): 90 акт, 10 багц хамарсан.
 *    Дүнгийн талбарууд ХАГАС дүүрсэн (gross 25/90, net 25/90, барьцаа 12/90,
 *    үлдэгдэл 21/90), төлөв ба төлсөн огноо ОГТ хоосон. Тиймээс дүнгүй актыг
 *    ч ХАСАХГҮЙ — «акт байгаа ч дүн бүртгэгдээгүй» гэдэг нь өөрөө хяналтын
 *    мэдээлэл; 0-ээр дүүргэвэл «олгоогүй» гэсэн ХУДАЛ дүгнэлт төрнө.
 */
function PkgActs({ p, finQ }: { p: Pack; finQ: Async<FinData> }) {
  const F = IPC_LOG.fields;
  const nn2 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const acts = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    return finQ.data.acts
      .filter((r) => bagtsKey(r[F.pkg]) === p.key)
      .map((r) => ({
        no: String(r[F.no] ?? '').trim(),
        from: r[F.periodFrom] as number | null,
        to: r[F.periodTo] as number | null,
        gross: nn2(r[F.gross]),
        ret: nn2(r[F.retention]),
        net: nn2(r[F.net]),
        out: nn2(r[F.outstanding]),
      }))
      .filter((x) => x.no)
      .sort((a, b) => a.no.localeCompare(b.no));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finQ, p.key]);

  if (finQ.state === 'loading') return <Section title={tr('Гүйцэтгэлийн акт')}><Empty label={tr('Ачаалж байна…')} /></Section>;
  if (!acts || !acts.length) return <Section title={tr('Гүйцэтгэлийн акт')}><Empty label={tr('Акт бүртгэгдээгүй')} /></Section>;

  const netTotal = acts.reduce((a, x) => a + x.net, 0);
  const retTotal = acts.reduce((a, x) => a + x.ret, 0);
  const outTotal = acts.reduce((a, x) => a + x.out, 0);
  const withAmt = acts.filter((x) => x.net > 0).length;

  return (
    <>
      <Section
        title={tr('Гүйцэтгэлийн акт')}
        note={tr('{0} акт · {1} дүнтэй', String(acts.length), String(withAmt))}
      >
        {/* Акт бүр: № ба хамрах хугацаа — утга нь олгосон дүн */}
        <Rows
          items={acts.map((x) => ({
            key: x.no,
            value: (
              <span className="num">
                {x.net > 0 ? mntAbbr(x.net) : tr('дүнгүй')}
                {x.from && x.to ? (
                  <small className={ts.actPeriod}>{date(x.from)} – {date(x.to)}</small>
                ) : null}
              </span>
            ),
          }))}
        />
      </Section>

      {/* АКТЫН БҮТЭЦ — олгосон / барьцаа / үлдэгдэл. Барьцаа нь ХОЙШЛУУЛСАН
          мөнгө болохоос алдагдал биш; үлдэгдэл нь төлөгдөөгүй үлдсэн. */}
      {(netTotal > 0 || retTotal > 0 || outTotal > 0) && (
        <Section title={tr('Актын дүнгийн бүтэц')} note={tr('нийт {0}', mntAbbr(netTotal + retTotal + outTotal))}>
          <Donut
            items={[
              { key: 'net', label: tr('Олгосон'), value: netTotal, color: cat(0), display: mntAbbr(netTotal) },
              { key: 'ret', label: tr('Барьцаанд суутгасан'), value: retTotal, color: cat(2), display: mntAbbr(retTotal) },
              { key: 'out', label: tr('Төлөгдөөгүй үлдэгдэл'), value: outTotal, color: cat(1), display: mntAbbr(outTotal) },
            ].filter((x) => x.value > 0)}
            size={140}
            width={22}
            stack
            center={mntAbbr(netTotal)}
            centerLabel={tr('олгосон')}
          />
        </Section>
      )}
    </>
  );
}

/**
 * СОНГОСОН БАГЦЫН САР БҮРИЙН САНХҮҮЖИЛТ.
 *
 * ⚠️ Доод талын график нь МУРУЙ — чиг хандлагыг хэлнэ, тодорхой сарын ТООГ
 *    хэлдэггүй (hover шаардана). Хяналтын ажилд «6-р сард хэд олгогдох
 *    ёстой байсан, хэд олгосон бэ» гэсэн ЯГ тоо хэрэгтэй байдаг тул энд
 *    сараар нь задална.
 *
 * ⚠️ Утгагүй сарууд (төлөвлөгөө ч, олголт ч 0) ХАСАГДАНА — 24 мөрийн 18 нь
 *    тэг байвал жагсаалт уншигдахаа больдог.
 */
function PkgMonths({
  p, finMap,
}: {
  p: Pack;
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
}) {
  const months = finMap?.get(p.key) ?? null;
  const rows = (months ?? []).filter((m) => m.amount > 0 || m.given > 0);

  if (!finMap) return <Section title={tr('Сар бүрийн санхүүжилт')}><Empty label={tr('Ачаалж байна…')} /></Section>;
  if (!rows.length) return <Section title={tr('Сар бүрийн санхүүжилт')}><Empty label={tr('Гэрээ бүртгэгдээгүй')} /></Section>;

  return (
    <Section
      title={tr('Сар бүрийн санхүүжилт')}
      note={tr('{0} сар · олгосон / төлөвлөгөө', num(rows.length))}
    >
      <Rows
        items={rows.map((m) => ({
          key: m.label,
          value: (
            <span className="num">
              {m.given > 0 ? mntAbbr(m.given) : '—'}
              {' / '}
              {m.amount > 0 ? mntAbbr(m.amount) : '—'}
            </span>
          ),
        }))}
      />
    </Section>
  );
}

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
      if (!finOnly) {
        /*
         * ⚠️ ГҮЙЦЭТГЭЛИЙН харагдацад ЗӨВХӨН БИЕТ явц. Урьд нь дэд бүтцийн
         *    багцад биет өгөгдөл байхгүй тул «олгосон / төлөвлөгөө» мөнгөн
         *    хувиар нөхөж, барилгын биет хувьтай НЭГ баганад нийлүүлдэг байв —
         *    хоёр өөр хэмжигдэхүүний дундаж нь юуг ч хэмждэггүй тоо.
         */
        if (p.kind === 'build' && p.progress != null) pcts.push(p.progress);
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
const FIN_H_LS = 'selbe.finh.pkgfin';

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
  /* САНХҮҮЖИЛТИЙН хоцрогдол — хугацаа өнгөрсөн ч ороогүй мөнгө */
  const fl = months ? finLagOf(months) : null;
  const flLvl = fl ? finLagLevel(fl.pct, fl.gap, fl.noRecord) : null;

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
      if (m.phys != null) actualPct = m.phys;
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
      {finOnly ? tr('— санхүүжилтийн явц') : tr('— санхүүжилт ба гүйцэтгэлийн явц')}
      {!finOnly && lag && lvl && (
        <span
          className={`${f.lagBadge} ${lvl === 'red' ? f.lagRed : f.lagYellow}`}
          title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
        >
          {lvl === 'red' ? tr('Хоцрогдол') : tr('Анхаарах')} −{lag.gap.toFixed(1)}%
        </span>
      )}
      {/* ⚠️ САНХҮҮЖИЛТИЙН ХОЦРОГДОЛ — хугацаа нь өнгөрсөн атлаа аваагүй мөнгө.
          Биет хоцрогдлоос ТУСДАА тэмдэг: нэг нь ажил, нөгөө нь мөнгө. */}
      {fl && flLvl && (
        <span
          className={`${f.lagBadge} ${flLvl === 'red' ? f.lagRed : f.lagYellow}`}
          title={tr('{0} хүртэл авах ёстой {1} · олгогдсон {2} · {3} сар хоцорсон', fl.month, mntAbbr(fl.planned), mntAbbr(fl.given), String(fl.lateMonths))}
        >
          {tr('Санхүүжилт хоцорсон')} −{mntAbbr(fl.gap)}
        </span>
      )}
    </span>
  );
  // NOTE — гарчгийн БАРУУН талд «олгогдох нийт санхүүжилт» (график дээр биш)
  const note =
    total > 0 ? (
      <span className={ts.totNote}>
        {tr('Нийт төсөв:')} <b>{num(total)} ₮</b>
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
              { v: mntAbbr(total), l: tr('Төлөвлөсөн санхүүжилт'), c: 'var(--ink)' },
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
                l: tr('Олгосон санхүүжилт'),
                c: 'var(--ink)',
              },
              /* ⚠️ envhub: эерэг зөрүү нь хэвийн үлдэгдэл тул ТОГТМОЛ warn өнгө
                 нь худал дохио байв — төлөв заадаггүй утга var(--ink)-ээр. */
              { v: mntAbbr(finGap), l: tr('Олгогдоогүй үлдэгдэл'), c: 'var(--ink)' },
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
            {/* Тасархай зураас = ЛАВЛАГАА (төлөвлөгөө), бүтэн = БОДИТ.
                Графикийн шугамын хэлбэртэй ЯГ таарна. */}
            <span><i className={ts.legDash} style={{ borderTopColor: cat(2) }} />{tr('Төлөвлөсөн санхүүжилт')}</span>
            <span><i className={ts.legSolid} style={{ background: cat(0) }} />{tr('Олгосон санхүүжилт')}</span>
            {!finOnly && <span><i style={{ background: cat(1) }} />{tr('Биет гүйцэтгэл')}</span>}
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
function aggregateMonths(d: FinData) {
  /* ⚠️ Сунгасан тэнхлэг — CF-ийн 12 сараас хойшхи бодит утгууд царцахгүй.
     Сунгасан сард төлөвлөгөөт багана алга (null) тул төлөвлөгөө 0. */
  const labels = cfMonthAxis();
  const planM = labels.map((m) => (m.amount ? d.contracts.reduce((a, r) => a + nn(r[m.amount as string]), 0) : 0));
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
      // ⚠️ Хэмжилт огт байхгүй сар — `null`. 0 гэж буцаавал график дээр
      //    «биет гүйцэтгэл тэг» гэсэн худал шугам зурагдана.
      phys: physN > 0 ? physW / physN : null,
    };
  });
}

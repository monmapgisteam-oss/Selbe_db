'use client';

/**
 * ЭРСДЭЛИЙН ДҮРСЛЭЛ — газрын зураг дээрх БҮХ график нэг эндээс.
 *
 * ⚠️ Яагаад `featureEffect`/`layerStyle` БИШ, ГРАФИК вэ:
 *
 *   · `featureEffect` (тодруулга) нь ЗӨВХӨН MapView-д ажилладаг — SceneView
 *     түүнийг чимээгүй үл тоомсорлоно (`MapCanvas`-ийн `MapProvider` §тайлбар).
 *     Тиймээс 2D-д ажиллаад 3D/BIM-д алга болдог үр дүн гарна.
 *
 *   · `layerStyle` нь давхаргыг БҮХЭЛД нь будна — «өртсөн» ба «өртөөгүй»
 *     объектыг ялгахгүй. Хэрэглэгчийн асуулт нь яг тэр ялгаа.
 *
 *   ГРАФИК нь MapView, SceneView ХОЁУЛАНД ижил ажиллана — 2D-д хавтгай
 *   дүүргэлт, 3D/BIM-д өргөгдсөн эзэлхүүн (ус · утааны давхарга) болно.
 */

import { useCallback, useEffect, useRef } from 'react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import MediaLayer from '@arcgis/core/layers/MediaLayer';
import ImageElement from '@arcgis/core/layers/support/ImageElement';
import ExtentAndRotationGeoreference from '@arcgis/core/layers/support/ExtentAndRotationGeoreference';
import Extent from '@arcgis/core/geometry/Extent';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import { useMap, type Dim } from '@/components/MapCanvas';
import { t as tr } from '@/lib/i18nCore';
import { bandAt, type Band, type DamageRow } from '@/lib/ersdelGeom';
import type { Station } from '@/lib/ersdel';
import type { FloodData } from '@/lib/uyr';

/** Давхаргын id-ууд — каталогт ОРОХГҮЙ (`listMode: 'hide'`) */
const FLOOD_ID = 'ersdel:flood';
/** Нэг зүсмэлийг хэдэн секундэд туулах вэ — 12 алхам ≈ 14 сек */
const STEP_S = 1.2;
/**
 * Фреймийн доод завсар (мс) — ~30 фрейм/сек.
 * ⚠️ 20-оос 30 болгов: усны хөдөлгөөн 20-д бага зэрэг «алхамтай» харагддаг.
 * Зурах өөрөө 0.8 мс тул зардал нь текстур ачаалалт (1 МБ/фрейм) — 30 МБ/сек
 * нь орчин үеийн GPU-д асуудалгүй.
 */
const FRAME_MS = 33;
const BAND_ID = 'ersdel:band';
const DMG_ID = 'ersdel:damage';
const ST_ID = 'ersdel:station';

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** ХОХИРОЛ = УЛААН. Ганц утга, ганц өнгө — бусад бүх өнгө нь аюулын мужийнх. */
const DAMAGE = '#dc2626';

const is3D = (d: Dim) => d === '3d' || d === 'bim';

/**
 * ⚠️ `Graphic.symbol` нь `Symbol` КЛАСС биш, ялгаварласан PROPERTIES union-ыг
 * хүлээж авдаг (ArcGIS-ийн autocast). Тиймээс `__esri.Symbol` рүү хөрвүүлбэл
 * TS татгалзана — шинжийн ЯГ төрлөөр нь нэрлэе.
 */
type Sym = Graphic['symbol'];

/* ── Симбол ── */

/** Аюулын муж — 2D хавтгай дүүргэлт */
const bandFill2d = (hue: string, alpha: number, onWater: boolean) => ({
  type: 'simple-fill',
  color: [...rgb(hue), alpha],
  /* Усны дээр — тод, зузаан хүрээ: шинжилгээний ХИЛ уншигдах ёстой */
  outline: onWater
    ? { color: [255, 255, 255, 0.85], width: 1.6 }
    : { color: [...rgb(hue), 0.9], width: 0.8 },
});

/**
 * Аюулын муж — 3D ЭЗЭЛХҮҮН.
 *
 * ⚠️ `extrude` нь газраас ДЭЭШ өргөнө: үерт энэ нь усны гүн (0.6–1.8 м), агаарт
 * инверсийн давхаргын өндөр (90–320 м). Хоёулаа БОДИТ хэмжигдэхүүн тул 3D
 * харагдац нь чимэглэл биш, ХЭМЖЭЭГ өөрөө хэлнэ.
 *
 * ⚠️ `edges` нь зөвхөн ҮЕРТ: 300 м өндөр утааны блокийн ирмэгийг зурвал бүх
 * дүрс тор мэт болно.
 */
const bandFill3d = (hue: string, alpha: number, height: number, edges: boolean) => ({
  type: 'polygon-3d',
  symbolLayers: [{
    type: 'extrude',
    size: Math.max(0.4, height),
    material: { color: [...rgb(hue), alpha] },
    ...(edges ? { edges: { type: 'solid', color: [...rgb(hue), 0.55], size: 0.6 } } : {}),
  }],
});

/** Өртсөн объект — 2D */
const dmg2d = (geom: 'area' | 'line' | 'point') =>
  geom === 'area'
    ? { type: 'simple-fill', color: [...rgb(DAMAGE), 0.55], outline: { color: [...rgb(DAMAGE), 1], width: 1.2 } }
    : geom === 'line'
      ? { type: 'simple-line', color: [...rgb(DAMAGE), 1], width: 3 }
      : {
        type: 'simple-marker', style: 'circle', size: 9,
        color: [...rgb(DAMAGE), 1], outline: { color: [255, 255, 255, 0.95], width: 1.2 },
      };

/**
 * Өртсөн объект — 3D.
 *
 * ⚠️ Барилгыг УЛААН БҮРХҮҮЛ-ээр (14 м өргөсгөсөн, хагас тунгалаг) ороож
 * харуулна. Хавтгай улаан толбо нь 3D/BIM-д барилгын ЁРООЛД дарагдаж
 * харагдахгүй болдог — өндөр нь л нүдэнд хүрнэ.
 */
const dmg3d = (geom: 'area' | 'line' | 'point') =>
  geom === 'area'
    ? {
      type: 'polygon-3d',
      symbolLayers: [{
        type: 'extrude', size: 14,
        material: { color: [...rgb(DAMAGE), 0.45] },
        edges: { type: 'solid', color: [...rgb(DAMAGE), 1], size: 1 },
      }],
    }
    : geom === 'line'
      ? { type: 'line-3d', symbolLayers: [{ type: 'line', size: 5, material: { color: [...rgb(DAMAGE), 1] } }] }
      : {
        type: 'point-3d',
        symbolLayers: [{
          type: 'icon', resource: { primitive: 'circle' }, size: 11,
          material: { color: [...rgb(DAMAGE), 1] },
          outline: { color: [255, 255, 255, 1], size: 1.4 },
        }],
      };

/** Харуулын цэг — усны цэнхэр, агаарын улбар шар */
const ST_HUE: Record<Station['kind'], string> = { water: '#0284c7', air: '#ea580c' };

const station2d = (kind: Station['kind'], on: boolean) => ({
  type: 'simple-marker',
  style: kind === 'water' ? 'circle' : 'diamond',
  size: on ? 15 : 11,
  color: [...rgb(ST_HUE[kind]), 0.95],
  outline: { color: on ? [255, 255, 255, 1] : [255, 255, 255, 0.85], width: on ? 2.4 : 1.4 },
});

const station3d = (kind: Station['kind'], on: boolean) => ({
  type: 'point-3d',
  symbolLayers: [{
    type: 'icon',
    resource: { primitive: kind === 'water' ? 'circle' : 'kite' },
    size: on ? 17 : 12,
    material: { color: [...rgb(ST_HUE[kind]), 1] },
    outline: { color: [255, 255, 255, 1], size: on ? 2.2 : 1.2 },
  }],
  // ⚠️ Харуул нь газрын гадаргуу дээр биш, 3D-д БАРИЛГЫН дунд алдагддаг тул
  //    дээш өргөж («callout» шонгүй) харагдуулна.
  verticalOffset: { screenLength: 22, maxWorldLength: 120, minWorldLength: 12 },
  callout: { type: 'line', size: 1.2, color: [255, 255, 255, 0.85] },
});

/* ── Компонент ── */

/**
 * Зурган дээр дарахад буцах МЭДЭЭЛЭЛ.
 *
 * ⚠️ Гурван ӨӨР зүйл дээр дарж болно — тус бүр өөр асуултад хариулна:
 *   · `station` — «энэ харуул юу хэмжиж байна вэ»
 *   · `damage`  — «энэ улаан объект юу вэ, ямар гүн/агууламжид өртөв»
 *   · `band`    — «энэ газарт ус хэр гүн байх вэ / агаар хэр бохирдох вэ»
 */
export type Pick =
  | { kind: 'station'; oid: number }
  /** Үерийн растерын НЭГ НҮД — гүн, хурд, чиглэл, цуваа нь `uyr.ts`-ээс */
  | { kind: 'flood'; idx: number }
  | { kind: 'damage'; layerId: string; oid: number | null; band: Band | null }
  | { kind: 'band'; band: Band }
  | null;

export function Overlay({
  dim,
  bands,
  bandOnFlood = false,
  damage,
  stations,
  selected,
  onPick,
  flood = null,
  floodSlice = 0,
  playing = false,
  onSlice,
}: {
  dim: Dim;
  /** Аюулын мужууд — хоосон бол зөвхөн харуул зурагдана */
  bands: Band[];
  /**
   * Бүс нь УРСАЖ БУЙ УСНЫ ДЭЭР зурагдаж байна уу.
   * ⚠️ Тийм бол дүүргэлтийг НИМГЭН, хүрээг ТОД болгоно: өтгөн дүүргэлт нь
   * доорх растерын гүний өнгө, хөдөлгөөн хоёуланг нь дардаг.
   */
  bandOnFlood?: boolean;
  /** Өртсөн объектууд — улаанаар */
  damage: DamageRow[];
  stations: Station[];
  /** Сонгосон харуулын OID — томроод цагаан хүрээтэй болно */
  selected: number | null;
  /** Зурган дээр дарахад — хоосон газар бол `null` */
  onPick: (p: Pick) => void;
  /**
   * ҮЕРИЙН ЦАГ ХУГАЦААНЫ растер. Байвал тухайн зүсмэлийн зургийг газрын зурагт
   * тавина — 2D-д хавтгай, 3D/BIM-д газрын гадаргуу дээр наалдана.
   */
  flood?: FloodData | null;
  /** Идэвхтэй зүсмэлийн дугаар (зогссон үед) */
  floodSlice?: number;
  /** Анимаци явж байна уу */
  playing?: boolean;
  /** Анимаци шинэ зүсмэл рүү орлоо — эцэг нь заагчаа дагуулна */
  onSlice?: (s: number) => void;
}) {
  const { view } = useMap();

  /**
   * ⚠️ ГУРВАН тусдаа давхарга: муж (доор) → хохирол (дунд) → харуул (дээр).
   * Нэг давхаргад хийвэл графикийн дараалал нь массивын дараалалаас хамаарч,
   * шинэчлэлт бүрд харуулын цэг усан доор алга болно.
   */
  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const mk = (id: string) =>
      new GraphicsLayer({
        id,
        // Каталог/давхаргын жагсаалтад ОРОХГҮЙ — энэ нь үр дүн, давхарга биш
        listMode: 'hide',
        // ⚠️ Газрын гадаргуу дээр наана: 3D-д `extrude` нь эндээс дээш өргөнө
        elevationInfo: { mode: 'on-the-ground' },
      });
    const layers = [mk(BAND_ID), mk(DMG_ID), mk(ST_ID)];
    view.map.addMany(layers);
    return () => {
      if (view.map) view.map.removeMany(layers);
      layers.forEach((l) => l.destroy());
    };
  }, [view]);

  /* ── ҮЕРИЙН ЦАГ ХУГАЦААНЫ РАСТЕР (MediaLayer) ──
   *
   * ⚠️ Яагаад `MediaLayer` вэ: 512×512 нүдийн гүнийг вектор болгож зурвал
   *    хэдэн мянган полигон болох ба зүсмэл солих бүрд дахин байгуулах нь
   *    боломжгүй. `MediaLayer` нь canvas-ыг ШУУД газрын зураг дээр байрлуулна —
   *    зүсмэл солиход зөвхөн `source` солигдоно (NEMA-гийн `FloodScene`-ийн
   *    хийдэгтэй ижил).
   * ⚠️ `elevationInfo: on-the-ground` — 3D/BIM-д газрын гадаргуу дагаж наалдана.
   */
  const floodLayerRef = useRef<MediaLayer | null>(null);
  useEffect(() => {
    if (!view || view.destroyed || !view.map || !flood) return;
    const e = flood.meta.extent;
    const geo = new ExtentAndRotationGeoreference({
      extent: new Extent({
        xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax,
        spatialReference: { wkid: flood.meta.wkid },
      }),
    });
    /**
     * ⚠️ ЭХЛЭЭД нэг элементтэй үүсгэнэ. Хоосон `source: []`-ээр үүсгээд дараа нь
     * `layer.source = [...]` гэж БҮТЭН эх сурвалжийг дахин оноох нь ажиллахгүй
     * (зураг шинэчлэгдэхгүй, «урсахгүй» болсны ГОЛ шалтгаан). NEMA-гийн
     * `FloodScene` шиг `source.elements`-ийг БАЙРАНД нь солино.
     */
    const layer = new MediaLayer({
      id: FLOOD_ID,
      listMode: 'hide',
      source: [new ImageElement({ image: flood.frame(0, 0, 0), georeference: geo })],
    });
    /**
     * ⚠️ `elevationInfo` ӨГӨХГҮЙ. `MediaLayer` нь SceneView-д ҮРГЭЛЖ газрын
     * гадаргуу дээр наалддаг (`MediaLayerView3D` нь зөвхөн «drape» горимтой,
     * `elevationInfo`-г огт уншдаггүй — эх кодоор шалгав). Тиймээс 2D, 3D, BIM
     * гуравт ижил ажиллана; вектор давхаргууд (`GraphicsLayer`) нь ЭСРЭГЭЭР
     * заавал `elevationInfo` шаарддаг — доор өгсөн.
     */
    floodLayerRef.current = layer;
    geoRef.current = geo;
    /* ⚠️ ХАМГИЙН ДООД давхаргад (index 0): аюулын муж, өртсөн объект, харуул
       гурвуулаа усны ДЭЭР харагдах ёстой. */
    view.map.add(layer, 0);
    return () => {
      if (view.map) view.map.remove(layer);
      layer.destroy();
      floodLayerRef.current = null;
      geoRef.current = null;
    };
  }, [view, flood]);

  /**
   * ФРЕЙМ СОЛИХ — нэг л газраас.
   *
   * ⚠️ `elements.removeAll()` + `add()` нь ArcGIS-д зургийг ДАХИН татахыг
   * заана; `layer.source`-ыг дарж бичих нь заахгүй.
   */
  const drawFrame = useCallback((sl: number, f: number, phase: number) => {
    const layer = floodLayerRef.current;
    const geo = geoRef.current;
    const fd = floodRef.current;
    if (!layer || !geo || !fd) return;
    const el = new ImageElement({ image: fd.frame(sl, f, phase), georeference: geo });
    const src = layer.source as unknown as { elements: { removeAll(): void; add(x: unknown): void } };
    src.elements.removeAll();
    src.elements.add(el);
  }, []);

  /**
   * АНИМАЦИ — 12 зүсмэлийг ҮСРЭНГҮЙ солихгүй, хооронд нь ШИНГЭЭНЭ.
   *
   * ⚠️ Зөвхөн зүсмэл солих (900 мс тутам) нь «12 өөр зураг» болж харагдана —
   * ус урсахгүй, үсэрнэ. Тиймээс `requestAnimationFrame`-ээр тасралтгүй
   * хугацаа тоолж, зүсмэл хоорондын утгыг шингээж (`f`), дээр нь урсгалын
   * долгионыг (`phase`) нэмнэ.
   *
   * ⚠️ React төлөв фрейм тутамд ШИНЭЧЛЭХГҮЙ — 30 фрейм/сек дээр 1000 мөрт
   * компонент дахин зурагдана. Зөвхөн БҮХЭЛ зүсмэл солигдоход эцэгт мэдэгдэнэ.
   */
  /* ЗОГССОН үед — сонгосон зүсмэлийг зурна (гүйгч чирэхэд ч энэ ажиллана)
   *
   * ⚠️ `view` нь ХАМААРАЛД ЗААВАЛ орно. 2D↔3D↔BIM шилжихэд `MediaLayer` дахин
   * үүсэж, эхний элемент нь `frame(0,0,0)` — өөрөөр хэлбэл ЭХНИЙ зүсмэл.
   * Энэ эффект дахин ажиллахгүй бол 7-р минутад зогсоод горим сольсон хүн
   * гэнэт 0-р минутын усыг хараад «загварчлал эхнээсээ эхэллээ» гэж ойлгоно.
   * Эффектүүд ЗАРЛАСАН дарааллаараа ажилладаг тул давхарга үүссэний ДАРАА
   * энэ нь зөв зүсмэлийг дахин зурна. */
  useEffect(() => {
    if (!flood || playing) return;
    drawFrame(floodSlice, 0, 0);
  }, [view, flood, playing, floodSlice, drawFrame]);

  useEffect(() => {
    if (!flood || !playing) return;
    /**
     * ⚠️ `floodSlice` нь ЭНЭ эффектийн хамааралд ОРОХГҮЙ. Анимаци нь шинэ
     * зүсмэл болгонд `onSlice`-оор эцгийн төлөвийг шинэчилдэг; хэрэв түүнийг
     * хамаарал болговол эффект дахин эхлэж, `t0` тэглэгдэн ус зүсмэл бүрд
     * ЭХНЭЭС нь эхэлж «гацсан» мэт харагдана.
     */
    let raf = 0;
    const t0 = performance.now();
    const SL = flood.meta.slices;
    let lastInt = -1;
    let lastDraw = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      /**
       * ⚠️ ФРЕЙМИЙГ ХЯЗГААРЛАНА (~20/сек). Зурах нь хямд (0.8 мс) ч фрейм
       * тутамд шинэ `ImageElement` үүсэж 512×512 RGBA текстур GPU руу ачаалагдана.
       * 60/сек бол 60 МБ/сек илүүдэл ачаалал; ус 20/сек-д ч гөлгөр урсана.
       */
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      const el = (now - t0) / 1000;
      /* Нэг зүсмэл = `STEP_S` секунд; төгсгөлд эргэж эхэлнэ */
      const pos = (el / STEP_S) % SL;
      const sl = Math.floor(pos);
      drawFrame(sl, pos - sl, el);
      if (sl !== lastInt) {
        lastInt = sl;
        onSliceRef.current?.(sl);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flood, playing, drawFrame]);

  /* ── Аюулын муж ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(BAND_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();
    for (const b of bands) {
      // ⚠️ 3D-д тунгалаг ИХ байх ёстой: 300 м өндөр цул блок нь доорх хот,
      //    барилгыг бүрэн нуудаг. 2D-д эсрэгээрээ — хэт тунгалаг бол ортофото
      //    дээр өнгө нь ялгагдахгүй.
      /* ⚠️ Урсаж буй усны дээр дүүргэлт НИМГЭН — доорх хөдөлгөөн уншигдана */
      const alpha = bandOnFlood
        ? (d3 ? 0.10 : 0.14)
        : d3 ? (b.height > 40 ? 0.16 : 0.42) : 0.34;
      const g = new Graphic({
        geometry: b.geometry,
        attributes: { band: b.key, label: b.label },
      });
      /* ⚠️ Симболыг БҮТЭЭГЧид биш, дараа нь ОНООНО: `Graphic`-ийн бүтээгчийн
         `symbol` нь ялгаварласан union (`{type:'simple-fill'} | …`) хүлээдэг
         тул объектыг цутгах боломжгүй; instance-ийн шинж нь `Symbol` төрөл. */
      g.symbol = (d3
        ? bandFill3d(b.hue, alpha, b.height, b.height <= 40)
        : bandFill2d(b.hue, alpha, bandOnFlood)) as unknown as Sym;
      gl.add(g);
    }
  }, [view, dim, bands, bandOnFlood]);

  /* ── Өртсөн объект (улаан) ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(DMG_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();
    for (const row of damage) {
      const sym = (d3 ? dmg3d(row.geom) : dmg2d(row.geom)) as unknown as Sym;
      for (const src of row.graphics) {
        const g = new Graphic({ geometry: src.geometry, attributes: src.attributes });
        g.symbol = sym;
        gl.add(g);
      }
    }
  }, [view, dim, damage]);

  /* ── Харуулын цэг ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(ST_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();
    for (const st of stations) {
      const on = st.oid === selected;
      const g = new Graphic({
        geometry: new Point({ longitude: st.lon, latitude: st.lat }),
        attributes: { oid: st.oid, name: st.name, torol: st.torol },
        popupTemplate: {
          title: '{name}',
          content: tr('Төрөл: {0}', '{torol}'),
        } as unknown as __esri.PopupTemplate,
      });
      g.symbol = (d3 ? station3d(st.kind, on) : station2d(st.kind, on)) as unknown as Sym;
      gl.add(g);
    }
  }, [view, dim, stations, selected]);

  /* ── Дарж мэдээлэл авах ──
     ⚠️ `MapCanvas` өөрөө ч `click`-ийг сонсдог (каталогийн давхаргын атрибут
        → `onPick` проп). Хоёулаа зэрэг ажиллана: тэр нь ДАВХАРГЫН объектыг,
        энэ нь АЮУЛЫН үр дүнг (улаан объект, муж) хариуцна — өөр өөр асуулт.
     ⚠️ `bands`/`damage` нь эффектийн хамаарлаас ГАДУУР, ref-ээр уншигдана:
        эс бөгөөс шинжилгээ ажиллах бүрд `click` бүртгэл салж дахин холбогдоно. */
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const damageRef = useRef(damage);
  damageRef.current = damage;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const floodRef = useRef(flood);
  floodRef.current = flood;
  const geoRef = useRef<ExtentAndRotationGeoreference | null>(null);
  const onSliceRef = useRef(onSlice);
  onSliceRef.current = onSlice;

  useEffect(() => {
    if (!view || view.destroyed) return;
    const h = view.on('click', (ev: __esri.ViewClickEvent) => {
      const pt = ev.mapPoint;
      /**
       * ⚠️ ҮЕРИЙН НҮД нь `hitTest`-д ОГТ гарч ирэхгүй: `MediaLayer` нь ганц
       * зураг бөгөөд түүний доторх нүд гэсэн ойлголт ArcGIS-д байхгүй. Тиймээс
       * дарсан цэгийн координатаас торын индексийг ӨӨРСДӨӨ бодно.
       */
      const fd = floodRef.current;
      const fIdx = fd && pt ? fd.indexAt(pt.x, pt.y) : null;
      /**
       * ⚠️ ЭХЛЭЭД `hitTest` (улаан объект, харуулын цэг нь ЯГ дарсан пикселээс
       * тодорхойлогдоно), дараа нь мужийн `contains` — хэрэв hitTest хоосон
       * буцвал (3D-д торон гадаргуу туяаг таслах тохиолдол) геометрийн шалгалт
       * гүйцээнэ.
       */
      view.hitTest(ev).then((res) => {
        if (view.destroyed) return;
        const band = pt ? bandAt(bandsRef.current, pt) : null;
        for (const r of res.results) {
          if (r.type !== 'graphic') continue;
          const id = r.graphic.layer == null ? '' : String(r.graphic.layer.id);
          const a = (r.graphic.attributes ?? {}) as Record<string, unknown>;
          if (id === ST_ID) {
            pickRef.current({ kind: 'station', oid: Number(a.oid) });
            return;
          }
          if (id === DMG_ID) {
            pickRef.current({
              kind: 'damage',
              layerId: String(a.layerId ?? ''),
              oid: a.oid == null ? null : Number(a.oid),
              band,
            });
            return;
          }
        }
        /* Улаан объект, харуул хоёр ОЛДООГҮЙ бол: үерийн нүд → аюулын муж */
        if (fIdx != null && fd && fd.depth(0, fIdx) >= 0) {
          // ⚠️ Хуурай нүд ч мэдээлэлтэй («энд ус ирээгүй») тул шүүхгүй
          pickRef.current({ kind: 'flood', idx: fIdx });
          return;
        }
        pickRef.current(band ? { kind: 'band', band } : null);
      }).catch(() => {});
    });
    return () => h.remove();
  }, [view]);

  return null;
}

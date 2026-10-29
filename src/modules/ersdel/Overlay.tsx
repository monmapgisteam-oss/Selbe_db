'use client';

/**
 * ЭРСДЭЛИЙН ДҮРСЛЭЛ — газрын зураг дээрх БҮХ график нэг эндээс.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import MediaLayer from '@arcgis/core/layers/MediaLayer';
import ImageElement from '@arcgis/core/layers/support/ImageElement';
import ExtentAndRotationGeoreference from '@arcgis/core/layers/support/ExtentAndRotationGeoreference';
import { buildFlow, clampBox, type Flow, type MercBox } from '@/lib/salhiUrsgal';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import type { WindField } from '@/lib/salhiTor';
import Extent from '@arcgis/core/geometry/Extent';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import { IMAGERY_ID, useMap, type Dim } from '@/components/MapCanvas';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { useSyncRef } from '@/lib/useSyncRef';
import { bandAt, type Band, type DamageRow } from '@/lib/ersdelGeom';
import type { Station } from '@/lib/ersdel';
import { flowDeg, type FloodData, type FloodMode } from '@/lib/uyr';
import Polygon from '@arcgis/core/geometry/Polygon';
import { waterSurfaceAt, type WaterBand } from '@/lib/uyrSurface';
import { buildWaterFlow, type WaterFlow } from '@/lib/uyrUrsgal';

/** Давхаргын id-ууд — каталогт ОРОХГҮЙ (`listMode: 'hide'`) */
const FLOOD_ID = 'ersdel:flood';
/**
 * Салхины урсгалын растер — каталогт ОРОХГҮЙ (үр дүн, давхарга биш).
 */
const FLOW_ID = 'ersdel:flow';
/**
 * УСНЫ УРСГАЛЫН СУДАЛ — гүний растерын ДЭЭР, тусдаа `MediaLayer`.
 */
const WFLOW_ID = 'ersdel:wflow';
/** Нэг зүсмэлийг хэдэн секундэд туулах вэ — 24 алхам ≈ 22 сек */
const STEP_S = 0.9;
/**
 * Фреймийн доод завсар (мс) — ~30 фрейм/сек.
 */
const FRAME_MS = 33;
/**
 * УСНЫ 3D ГАДАРГУУГ хэдэн мс тутамд дахин байгуулах вэ (~8/сек).
 */
const SURF_MS = 125;

/**
 * Усны гадаргуугийн кэшийн АЛХАМ — 1/`SURF_Q` зүсмэл (2026-10-09).
 */
const SURF_Q = 8;

/**
 * Кэшийн ДЭЭД хэмжээ (агшин). Бүтэн тоглуулга = `slices × SURF_Q + 1`
 * (24 × 8 + 1 = 193) агшин бүгд багтах ёстой — эс бөгөөс дараалсан
 * тоглуулгад FIFO кэш хуучныг нь яг хэрэгтэй үед нь гаргаж, ДАХИН
 * тоглуулахад нэг ч оногдохгүй. Цагирагийг `Float64Array`-аар шахаж
 * хадгалдаг тул нэг агшин ≈ 8,000 орой × 16 Б ≈ 130 КБ → ~25 МБ.
 */
const SURF_CACHE_MAX = 200;

/** Кэшид хадгалах шахсан зурвас — цагираг бүр `[x0, y0, x1, y1, …]` */
type PackedBand = { z: number; depth: number; deg: number; rings: Float64Array[] };
/**
 * УСНЫ ГАДАРГУУ (3D) — бүс тус бүрд ТУСДАА давхарга.
 */
const WATER_IDS = ['ersdel:water0', 'ersdel:water1', 'ersdel:water2'];

/**
 * ЗАГВАРЧЛАЛЫН УСНЫ ГАДАРГУУ (3D · BIM) — «дижитал ихэр»-ийн харагдац.
 */
const WSURF_ID = 'ersdel:wsurf';

/** Усны замын шугам — тайлбарын давхарга */
const PATH_ID = 'ersdel:path';
/**
 * ГОЛЫН ОРОЛТЫН НҮД + ГИДРОГРАФЫН ТЭМДЭГ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
const INLET_ID = 'ersdel:inlet';

const BAND_ID = 'ersdel:band';
const DMG_ID = 'ersdel:damage';
const ST_ID = 'ersdel:station';

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}/i.test(h)) return [220, 38, 38];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** ХОХИРОЛ = УЛААН. Ганц утга, ганц өнгө — бусад бүх өнгө нь аюулын мужийнх. */
const DAMAGE = '#dc2626';

const is3D = (d: Dim) => d === '3d' || d === 'bim';

type Sym = Graphic['symbol'];

/* ── Симбол ── */

/** Аюулын муж — 2D хавтгай дүүргэлт */
const bandFill2d = (hue: string, alpha: number, onWater: boolean) => ({
  type: 'simple-fill',
  color: [...rgb(hue), alpha],
  outline: onWater
    ? { color: [...rgb(hue), 0.95], width: 1.6 }
    : { color: [...rgb(hue), 0.9], width: 0.8 },
});

/**
 * Аюулын муж — 3D ЭЗЭЛХҮҮН.
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

/**
 * ЖИНХЭНЭ УС (3D) — ArcGIS-ийн `water` симбол.
 *
 * @param waveDeg — долгионы чиглэл (градус). Загварчлалын дундаж урсгалаас
 *   авна; байхгүй бол голын ерөнхий чиглэл (хойноос урагш).
 * @param strength — гүн ус илүү сэвсгэр: гүехэн дээр «rippled», гүнд «moderate».
 */
const waterSym = (waveDeg: number, strength: 'rippled' | 'slight' | 'moderate') => ({
  type: 'polygon-3d',
  symbolLayers: [{
    type: 'water',
    color: '#1c4f7c',
    waveDirection: waveDeg,
    waveStrength: strength,
    /* Сэлбэ бол ЖИЖИГ урсгал — «large» нь далайн өргөн долгион өгнө */
    waterbodySize: 'small',
  }],
});

/**
 * Өртсөн объект — 2D. БҮХ геометр НЭГ ӨНГӨ, НЭГ ХАНАЛТ.
 */
const DMG_A = 0.72;

const dmg2d = (geom: 'area' | 'line' | 'point') =>
  geom === 'area'
    ? {
      type: 'simple-fill',
      color: [...rgb(DAMAGE), DMG_A],
      outline: { color: [...rgb(DAMAGE), DMG_A], width: 1.2 },
    }
    : geom === 'line'
      ? { type: 'simple-line', color: [...rgb(DAMAGE), DMG_A], width: 3 }
      : {
        type: 'simple-marker',
        style: 'circle',
        size: 9,
        color: [...rgb(DAMAGE), DMG_A],
        outline: { color: [...rgb(DAMAGE), DMG_A], width: 0.8 },
      };

/**
 * Өртсөн объект — 3D.
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
          outline: { color: [...rgb(DAMAGE), 1], size: 1 },
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
  verticalOffset: { screenLength: 22, maxWorldLength: 120, minWorldLength: 12 },
  callout: { type: 'line', size: 1.2, color: [255, 255, 255, 0.85] },
});

/* ── Компонент ── */

/**
 * Зурган дээр дарахад буцах МЭДЭЭЛЭЛ.
 */
export type Pick =
  | { kind: 'station'; oid: number }
  /** Үерийн растерын НЭГ НҮД — гүн, хурд, чиглэл, цуваа нь `uyr.ts`-ээс */
  | { kind: 'flood'; idx: number }
  | { kind: 'damage'; layerId: string; oid: number | null; band: Band | null }
  | { kind: 'band'; band: Band; idx?: number }
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
  floodMode = 'depth',
  path = null,
  floodSlice = 0,
  playing = false,
  onSlice,
  onEnd,
  windField = null,
  windFlow = false,
  windHour = 0,
}: {
  dim: Dim;
  /** Аюулын мужууд — хоосон бол зөвхөн харуул зурагдана */
  bands: Band[];
  /**
   * Бүс нь УРСАЖ БУЙ УСНЫ ДЭЭР зурагдаж байна уу.
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
  /** Растерыг юугаар будах вэ — гүн · хурд · аюул */
  floodMode?: FloodMode;
  /**
   * УСНЫ ЗАМ — сонгосон нүднээс ДЭЭШ (ус хаанаас ирсэн) ба ДООШ (хаашаа
   * явна) мөрдсөн шугам, Web Mercator цэгүүд.
   */
  path?: { up: number[][]; down: number[][] } | null;
  /** Идэвхтэй зүсмэлийн дугаар (зогссон үед) */
  floodSlice?: number;
  /** Анимаци явж байна уу */
  playing?: boolean;
  /** Анимаци шинэ зүсмэл рүү орлоо — эцэг нь заагчаа дагуулна */
  onSlice?: (s: number) => void;
  /**
   * Анимаци ТӨГСГӨЛД хүрлээ.
   */
  onEnd?: () => void;
  /**
   * САЛХИНЫ ТАЛБАР. Байвал (ба `windFlow` асаалттай бол) тоосонцрын урсгал
   * зурагдана. `null` бол давхарга ОГТ үүсэхгүй — хоосон canvas ч GPU-д
   * текстур эзэлнэ.
   */
  windField?: WindField | null;
  /** Урсгалын анимац асаалттай эсэх */
  windFlow?: boolean;
  /** Аль цагийн салхиар урсгах вэ (`windField.times`-ын индекс) */
  windHour?: number;
}) {
  const { view } = useMap();

  const onEndRef = useRef(onEnd);
  useSyncRef(onEndRef, onEnd);
  const floodSliceRef = useRef(floodSlice);
  useSyncRef(floodSliceRef, floodSlice);
  const drawSurfaceRef = useRef<((pos: number) => void) | null>(null);
  const drawWFlowRef = useRef<((pos: number, dt?: number) => void) | null>(null);
  const bandsRef = useRef(bands);
  useSyncRef(bandsRef, bands);
  const damageRef = useRef(damage);
  useSyncRef(damageRef, damage);
  const pickRef = useRef(onPick);
  useSyncRef(pickRef, onPick);
  const floodRef = useRef(flood);
  useSyncRef(floodRef, flood);
  const modeRef = useRef<FloodMode>(floodMode);
  useSyncRef(modeRef, floodMode);
  const waveDirRef = useRef(180);
  const onSliceRef = useRef(onSlice);
  useSyncRef(onSliceRef, onSlice);


  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const mk = (id: string) =>
      new GraphicsLayer({
        id,
        // Каталог/давхаргын жагсаалтад ОРОХГҮЙ — энэ нь үр дүн, давхарга биш
        listMode: 'hide',
        elevationInfo: { mode: 'on-the-ground' },
      });
    const water = WATER_IDS.map((id) => new GraphicsLayer({
      id,
      listMode: 'hide',
      elevationInfo: { mode: 'relative-to-ground', offset: 0 },
    }));
    const wsurf = new GraphicsLayer({
      id: WSURF_ID,
      listMode: 'hide',
      elevationInfo: { mode: 'absolute-height', offset: 0 },
    });
    const layers = [...water, wsurf, mk(BAND_ID), mk(DMG_ID), mk(PATH_ID), mk(INLET_ID), mk(ST_ID)];
    view.map.addMany(layers);
    return () => {
      if (view.map) view.map.removeMany(layers);
      layers.forEach((l) => l.destroy());
    };
  }, [view]);

  /* ── ҮЕРИЙН ЦАГ ХУГАЦААНЫ РАСТЕР (MediaLayer) ──
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
    const layer = new MediaLayer({
      id: FLOOD_ID,
      listMode: 'hide',
      source: [new ImageElement({ image: flood.frame(0, 0, 0, modeRef.current), georeference: geo })],
    });
    floodLayerRef.current = layer;
    geoRef.current = geo;
    /**
     * Урьд нь `add(layer, 0)` гэж ХАМГИЙН ДООД индекст тавьдаг байв — санаа нь
     * «аюулын муж, өртсөн объект, харуул гурвуулаа усны дээр гарах» байсан ч
     * индекс 0 нь ОРТОФОТОГИЙН БАЙР (`buildLayers`-д `IMAGERY_ID` GroupLayer
     * хамгийн түрүүнд нэмэгддэг). Үр дүнд ус ортофотогийн ДООР орж, зураг дээр
     * ОГТ харагддаггүй байлаа — «симуляц урсахгүй байна» гэсний жинхэнэ учир.
     *
     * Одоо ортофотог олоод түүний ДАРАА тавина: ус зурган дээр урсах ба
     * вектор давхаргууд (барилга, зам, муж, харуул) усны дээр хэвээр үлдэнэ.
     */
    const ortho = view.map.findLayerById(IMAGERY_ID);
    const at = ortho ? view.map.layers.indexOf(ortho) + 1 : 0;
    view.map.add(layer, at);
    return () => {
      if (view.map) view.map.remove(layer);
      layer.destroy();
      floodLayerRef.current = null;
      geoRef.current = null;
    };
  }, [view, flood]);

  /* ── УСНЫ УРСГАЛЫН СУДАЛ (MediaLayer) ──
   */
  const wflowLayerRef = useRef<MediaLayer | null>(null);
  const wflowRef = useRef<WaterFlow | null>(null);
  useEffect(() => {
    if (!view || view.destroyed || !view.map || !flood) return;
    const e = flood.meta.extent;
    const geo = new ExtentAndRotationGeoreference({
      extent: new Extent({
        xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax,
        spatialReference: { wkid: flood.meta.wkid },
      }),
    });
    const flow = buildWaterFlow(flood);
    const layer = new MediaLayer({
      id: WFLOW_ID,
      listMode: 'hide',
      source: [new ImageElement({ image: flow.step(0), georeference: geo })],
    });
    wflowLayerRef.current = layer;
    wflowRef.current = flow;
    wflowGeoRef.current = geo;
    const base = view.map.findLayerById(FLOOD_ID);
    const ortho = view.map.findLayerById(IMAGERY_ID);
    const at = base ? view.map.layers.indexOf(base) + 1
      : ortho ? view.map.layers.indexOf(ortho) + 1 : 0;
    view.map.add(layer, at);
    /* Эхний харагдац горимоос — `drawWFlow` дуудагдахаас өмнө ч зөв байна */
    layer.visible = modeRef.current === 'depth';
    const vis = layer.watch('visible', (v: boolean) => {
      if (v && modeRef.current !== 'depth') layer.visible = false;
    });
    return () => {
      vis.remove();
      if (view.map) view.map.remove(layer);
      layer.destroy();
      wflowLayerRef.current = null;
      wflowRef.current = null;
      wflowGeoRef.current = null;
    };
  }, [view, flood]);

  /**
   * СУДЛЫГ нэг фрейм урагшлуулна.
   */
  const drawWFlow = useCallback((pos: number, dt?: number) => {
    const layer = wflowLayerRef.current;
    const geo = wflowGeoRef.current;
    const flow = wflowRef.current;
    if (!layer || !geo || !flow) return;
    layer.visible = modeRef.current === 'depth';
    if (!layer.visible) return;
    const el = new ImageElement({ image: flow.step(pos, dt), georeference: geo });
    const src = layer.source as unknown as { elements: { removeAll(): void; add(x: unknown): void } };
    src.elements.removeAll();
    src.elements.add(el);
  }, []);
  useSyncRef(drawWFlowRef, drawWFlow);

  /**
   * ФРЕЙМ СОЛИХ — нэг л газраас.
   */
  const drawFrame = useCallback((sl: number, f: number, phase: number) => {
    const layer = floodLayerRef.current;
    const geo = geoRef.current;
    const fd = floodRef.current;
    if (!layer || !geo || !fd) return;
    const el = new ImageElement({ image: fd.frame(sl, f, phase, modeRef.current), georeference: geo });
    const src = layer.source as unknown as { elements: { removeAll(): void; add(x: unknown): void } };
    src.elements.removeAll();
    src.elements.add(el);
  }, []);

  /**
   * АНИМАЦИ — 12 зүсмэлийг ҮСРЭНГҮЙ солихгүй, хооронд нь ШИНГЭЭНЭ.
   */
  /* ЗОГССОН үед — сонгосон зүсмэлийг зурна (гүйгч чирэхэд ч энэ ажиллана)
   */
  useEffect(() => {
    if (!flood || playing) return;
    drawFrame(floodSlice, 0, 0);
    drawWFlowRef.current?.(floodSlice);
  }, [view, flood, playing, floodSlice, floodMode, drawFrame]);

  useEffect(() => {
    if (!flood || !playing) return;
    let raf = 0;
    const SL = flood.meta.slices;
    const from = floodSliceRef.current >= SL - 1 ? 0 : floodSliceRef.current;
    const t0 = performance.now() - from * STEP_S * 1000;
    let lastInt = -1;
    let lastDraw = 0;
    let lastSurf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;
      const dtDraw = (now - lastDraw) / 1000;
      lastDraw = now;
      const el = (now - t0) / 1000;
      const pos = el / STEP_S;
      /**
       * Урьд нь `% SL` гэж мөчлөглөдөг байсан нь мөчлөг бүрийн ЗААГТ усыг
       * 48 га-гаас 2 га руу НЭГ ФРЕЙМД буулгаж, «цаг алгаслаа» гэсэн хамгийн
       * тод үсрэлтийг өөрөө үүсгэж байв. Үер нь мөчлөгт үзэгдэл БИШ — нэг
       * удаа ирж, оргилдож, татардаг.
       */
      if (pos >= SL - 1) {
        drawFrame(SL - 1, 0, el);
        drawSurfaceRef.current?.(SL - 1);
        drawWFlowRef.current?.(SL - 1);
        onSliceRef.current?.(SL - 1);
        onEndRef.current?.();
        cancelAnimationFrame(raf);
        return;
      }
      const sl = Math.floor(pos);
      drawFrame(sl, pos - sl, el);
      drawWFlowRef.current?.(pos, dtDraw);
      /**
       * УСНЫ ГАДАРГУУ (3D) — БУТАРХАЙ агшинд, ~8 удаа/сек.
       */
      if (now - lastSurf >= SURF_MS) {
        lastSurf = now;
        drawSurfaceRef.current?.(pos);
      }
      if (sl !== lastInt) {
        lastInt = sl;
        onSliceRef.current?.(sl);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flood, playing, drawFrame]);

  const flowLayerRef = useRef<MediaLayer | null>(null);
  const flowRef = useRef<Flow | null>(null);
  const flowGeoRef = useRef<ExtentAndRotationGeoreference | null>(null);

  /**
   * ЗУРАХ ХҮРЭЭ — газрын зургийн ХАРАГДАЦЫГ дагана.
   */
  const [box, setBox] = useState<MercBox | null>(null);
  useEffect(() => {
    if (!view || view.destroyed || !windFlow) return;
    const KM = 1000;
    const snap = (v: number) => Math.round(v / KM) * KM;
    const apply = () => {
      const e = view.extent;
      if (!e) return;
      const next = clampBox({
        xmin: snap(e.xmin), ymin: snap(e.ymin), xmax: snap(e.xmax), ymax: snap(e.ymax),
      });
      if (!(next.xmax > next.xmin && next.ymax > next.ymin)) return;
      setBox((cur) => (cur
        && cur.xmin === next.xmin && cur.ymin === next.ymin
        && cur.xmax === next.xmax && cur.ymax === next.ymax
        ? cur : next));
    };
    apply();
    const h = reactiveUtils.watch(
      () => view.stationary && view.extent,
      (v) => { if (v) apply(); },
    );
    return () => h.remove();
  }, [view, windFlow]);

  /* ── САЛХИНЫ УРСГАЛ (MediaLayer) ──
   */
  useEffect(() => {
    if (!view || view.destroyed || !view.map || !windField || !box) return;
    const geo = new ExtentAndRotationGeoreference({
      extent: new Extent({
        xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax,
        spatialReference: { wkid: 102100 },
      }),
    });
    const flow = buildFlow(windField, box);
    const layer = new MediaLayer({
      id: FLOW_ID,
      listMode: 'hide',
      opacity: 0.95,
      source: [new ImageElement({ image: flow.step(windHour), georeference: geo })],
    });
    flowLayerRef.current = layer;
    flowRef.current = flow;
    flowGeoRef.current = geo;
    /* Ортофотогийн дээр, вектор давхаргуудын доор — үерийнхтэй ижил байр */
    const ortho = view.map.findLayerById(IMAGERY_ID);
    const at = ortho ? view.map.layers.indexOf(ortho) + 1 : 0;
    view.map.add(layer, at);
    return () => {
      if (view.map) view.map.remove(layer);
      layer.destroy();
      flowLayerRef.current = null;
      flowRef.current = null;
      flowGeoRef.current = null;
    };
  }, [view, windField, box, windHour]);

  /**
   * АНИМАЦИЙН ГОГЦОО — `FRAME_MS` (~30 фрейм/сек).
   */
  useEffect(() => {
    if (!windField || !windFlow || !box) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      const layer = flowLayerRef.current;
      const geo = flowGeoRef.current;
      const flow = flowRef.current;
      if (!layer || !geo || !flow) return;
      const el = new ImageElement({ image: flow.step(windHour), georeference: geo });
      const src = layer.source as unknown as {
        elements: { removeAll(): void; add(x: unknown): void };
      };
      src.elements.removeAll();
      src.elements.add(el);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [windField, windFlow, windHour, box]);

  /* ── ЗАГВАРЧЛАЛЫН УСНЫ ГАДАРГУУ (3D · BIM) ──
   */
  /**
   * Зүсмэл бүрийн зурвасууд — БҮГД урьдчилж бодогдоно.
   */
  const poolRef = useRef<Graphic[]>([]);
  const surfCacheRef = useRef<{ fd: FloodData | null; m: Map<number, PackedBand[]> }>({ fd: null, m: new Map() });
  const surfDrawnRef = useRef<{ key: number; fd: FloodData; gl: GraphicsLayer } | null>(null);
  const wsLayerRef = useRef<GraphicsLayer | null>(null);
  /** Долгионы гурван хүч — симболыг фрейм тутам ДАХИН ҮҮСГЭХГҮЙ */
  const symsRef = useRef<Record<string, Sym>>({});
  const dimRef = useRef<Dim>(dim);
  useSyncRef(dimRef, dim);
  const d3Now = is3D(dim);
  useEffect(() => {
    const c = surfCacheRef.current;
    if (c.fd !== flood || !d3Now) {
      c.fd = null;
      c.m.clear();
    }
  }, [flood, d3Now]);

  /**
   * УСНЫ ГАДАРГУУГ БУТАРХАЙ АГШИНД шинэчилнэ.
   */
  const drawSurface = useCallback((pos: number) => {
    const gl = view?.map?.findLayerById(WSURF_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    if (wsLayerRef.current !== gl) { poolRef.current = []; wsLayerRef.current = gl; }
    const pool = poolRef.current;
    const fd = floodRef.current;
    if (!is3D(dimRef.current) || !fd?.terrain) {
      pool.forEach((g) => { g.visible = false; });
      surfDrawnRef.current = null;
      return;
    }
    const sKey = Math.round(pos * SURF_Q);
    const drawn = surfDrawnRef.current;
    if (drawn && drawn.key === sKey && drawn.fd === fd && drawn.gl === gl) return;
    /**
     * СИМБОЛЫН КЭШ — «чиглэл(30°) + хүч» түлхүүрээр.
     */
    const symOf = (deg: number, k: 'rippled' | 'slight' | 'moderate') => {
      const q = Math.round(deg / 30) % 12;
      const key = `${q}:${k}`;
      const hit = symsRef.current[key];
      if (hit) return hit;
      const made = waterSym(q * 30, k) as unknown as Sym;
      symsRef.current[key] = made;
      return made;
    };
    const sr = { wkid: fd.meta.wkid, vcsWkid: 3855 };
    const cache = surfCacheRef.current;
    if (cache.fd !== fd) { cache.fd = fd; cache.m.clear(); }
    let bands = cache.m.get(sKey);
    if (!bands) {
      bands = waterSurfaceAt(fd, sKey / SURF_Q).map((bd: WaterBand) => ({
        z: bd.z,
        depth: bd.depth,
        deg: bd.deg,
        rings: bd.rings.map((r) => Float64Array.from(r.flat())),
      }));
      if (cache.m.size >= SURF_CACHE_MAX) {
        const oldest = cache.m.keys().next().value;
        if (oldest !== undefined) cache.m.delete(oldest);
      }
      cache.m.set(sKey, bands);
    }
    surfDrawnRef.current = { key: sKey, fd, gl };
    bands.forEach((bd, i) => {
      /* Гүн ус — илүү хүчтэй долгион; захын нимгэн ус бараг тайван */
      const sym = symOf(bd.deg, bd.depth >= 1.2 ? 'moderate' : bd.depth >= 0.5 ? 'slight' : 'rippled');
      const geom = new Polygon({
        hasZ: true,
        rings: bd.rings.map((r) => {
          const out: number[][] = new Array(r.length >> 1);
          for (let k = 0; k < out.length; k++) out[k] = [r[2 * k], r[2 * k + 1], bd.z];
          return out;
        }),
        spatialReference: sr,
      });
      let g = pool[i];
      if (!g) {
        g = new Graphic({ geometry: geom, attributes: { z: bd.z, depth: bd.depth } });
        g.symbol = sym;
        pool[i] = g;
        gl.add(g);
      } else {
        g.geometry = geom;
        if (g.symbol !== sym) g.symbol = sym;
        g.visible = true;
      }
    });
    /* Илүүдэл графикийг УСТГАХГҮЙ, зөвхөн НУУНА — дараагийн агшинд хэрэгтэй */
    for (let i = bands.length; i < pool.length; i++) pool[i].visible = false;
  }, [view]);

  useSyncRef(drawSurfaceRef, drawSurface);

  /* ЗОГССОН үед — сонгосон зүсмэлийн гадаргуу */
  useEffect(() => {
    if (playing) return;
    drawSurface(floodSlice);
  }, [view, dim, flood, floodSlice, playing, drawSurface]);

  /* ── УСНЫ ЗАМ (тайлбар) ──
   */
  useEffect(() => {
    const gl = view?.map?.findLayerById(PATH_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    gl.removeAll();
    if (!path) return;
    const sr = { wkid: 102100 };
    const mk2 = (pts: number[][], up: boolean) => {
      if (pts.length < 2) return;
      const g = new Graphic({
        geometry: { type: 'polyline', paths: [pts], spatialReference: sr } as unknown as Graphic['geometry'],
        attributes: { dir: up ? 'up' : 'down' },
      });
      g.symbol = {
        type: 'simple-line',
        color: up ? [125, 211, 252, 0.95] : [250, 204, 21, 0.95],
        width: up ? 2 : 2.6,
        style: up ? 'short-dash' : 'solid',
        cap: 'round',
        join: 'round',
      } as unknown as Sym;
      gl.add(g);
    };
    mk2(path.up, true);
    mk2(path.down, false);
  }, [view, dim, path]);

  /* ── ГОЛЫН ОРОЛТ + ГИДРОГРАФЫН ТЭМДЭГ (2026-10-01) ──
   */
  useEffect(() => {
    const gl = view?.map?.findLayerById(INLET_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    gl.removeAll();
    const m = flood?.meta;
    if (!m?.inlets?.length) return;
    const d3 = is3D(dim);
    const W = m.width;
    const cw = (m.extent.xmax - m.extent.xmin) / W;
    const ch = (m.extent.ymax - m.extent.ymin) / m.height;
    const sr = { wkid: m.wkid };
    let sx = 0;
    let sy = 0;
    for (const i of m.inlets) {
      const x = m.extent.xmin + ((i % W) + 0.5) * cw;
      const y = m.extent.ymax - (Math.floor(i / W) + 0.5) * ch;
      sx += x;
      sy += y;
      const g = new Graphic({ geometry: new Point({ x, y, spatialReference: sr }), attributes: { inlet: i } });
      g.symbol = (d3
        ? {
          type: 'point-3d',
          symbolLayers: [{
            type: 'icon', resource: { primitive: 'triangle' }, size: 9,
            material: { color: [14, 165, 233, 1] }, outline: { color: [255, 255, 255, 1], size: 1 },
          }],
          verticalOffset: { screenLength: 10, maxWorldLength: 60, minWorldLength: 4 },
        }
        : {
          type: 'simple-marker', style: 'triangle', size: 9, angle: 180,
          color: [14, 165, 233, 0.95], outline: { color: [255, 255, 255, 1], width: 1 },
        }) as unknown as Sym;
      gl.add(g);
    }
    const q = m.hydroQ?.[Math.max(0, Math.min(m.slices - 1, floodSlice))];
    if (q == null) return;
    const n = m.inlets.length;
    const label = tr('Голын оролт · {0} м³/с', num(q, 1));
    const at = new Point({ x: sx / n, y: sy / n, spatialReference: sr });
    const t = new Graphic({ geometry: at, attributes: { inletLabel: true } });
    t.symbol = (d3
      ? {
        type: 'point-3d',
        symbolLayers: [{
          type: 'text', text: label, size: 10,
          material: { color: [255, 255, 255, 1] },
          halo: { color: [12, 74, 110, 1], size: 1.5 },
        }],
        verticalOffset: { screenLength: 34, maxWorldLength: 200, minWorldLength: 10 },
        callout: { type: 'line', size: 1, color: [14, 165, 233, 1] },
      }
      : {
        type: 'text', text: label, color: [255, 255, 255, 1],
        haloColor: [12, 74, 110, 1], haloSize: 1.5, yoffset: 14,
        font: { size: 10, weight: 'bold' },
      }) as unknown as Sym;
    gl.add(t);
  }, [view, dim, flood, floodSlice]);

  /* ── Аюулын муж ── */
  useEffect(() => {
    const gl = view?.map?.findLayerById(BAND_ID) as GraphicsLayer | undefined;
    if (!gl) return;
    const d3 = is3D(dim);
    gl.removeAll();

    /**
     * ЖИНХЭНЭ УС (3D · BIM) — үерийн бүсийг `water` симболоор.
     */
    const waterLayers = WATER_IDS
      .map((id) => view?.map?.findLayerById(id) as GraphicsLayer | undefined);
    waterLayers.forEach((wl) => wl?.removeAll());

    const isFlood = bands.length > 0 && bands[0].key.startsWith('flood');
    /**
     * `WSURF_ID` давхарга нь тухайн агшны БОДИТ усны гадаргууг аль хэдийн
     * зурчихсан байна. Дээр нь мужийн буфер усыг давхарлавал хоёр өөр
     * утгатай (агшин vs давтагдах хугацаа) хоёр ус нийлж, аль нь ч
     * уншигдахгүй болно. Тиймээс энэ тохиолдолд муж нь зөвхөн ХИЛ болж
     * газарт хэвтэнэ — «ус хаана хүрч болох вэ» гэдэг хариулт хэвээр.
     */
    const simWater = d3 && isFlood && !!flood?.terrain;
    if (simWater) {
      const merged = geometryEngine.union(bands.map((b) => b.geometry)) as unknown as
        __esri.Polygon | null;
      if (merged) {
        const g = new Graphic({
          geometry: merged,
          attributes: { band: bands[0].key, label: bands[0].label },
        });
        g.symbol = bandFill2d(bands[0].hue, 0.08, true) as unknown as Sym;
        gl.add(g);
      }
      return;
    }
    if (d3 && isFlood) {
      const waveDeg = waveDirRef.current;
      bands.forEach((b, i) => {
        const wl = waterLayers[i];
        if (!wl) return;
        /* Гүн ус — илүү хүчтэй долгион; захын нимгэн ус нь бараг тайван */
        const strength = b.height >= 1.2 ? 'moderate' : b.height >= 0.5 ? 'slight' : 'rippled';
        wl.elevationInfo = {
          mode: 'relative-to-ground',
          offset: Math.max(0.05, b.height),
        } as unknown as GraphicsLayer['elevationInfo'];
        const g = new Graphic({
          geometry: b.geometry,
          attributes: { band: b.key, label: b.label, depth: b.height },
        });
        g.symbol = waterSym(waveDeg, strength) as unknown as Sym;
        wl.add(g);
      });
      return;
    }

    /**
     * Аюулын муж нь ГУРВАН УГСРАА цагирагаас тогтдог (гүн · дунд · зах).
     * Дүүргэлтийн өнгө нь 2026-08-29-нөөс аль хэдийн НЭГ (`ersdelGeom`
     * §floodBands) боловч цагираг БҮР өөрийн ХҮРЭЭТЭЙ зурагддаг тул зурган
     * дээр 3 давхар цагаан зураас гарч, нэг муж нь ГУРВАН тусдаа бүс мэт
     * уншигдсаар байв.
     *
     * Одоо 2D-д тэдгээрийг НЭГТГЭЖ (`union`) ганц график болгоно: нэг
     * дүүргэлт, нэг гадна хүрээ.
     */
    const oneHue = bands.length > 1 && bands.every((b) => b.hue === bands[0].hue);
    if (!d3 && oneHue) {
      const merged = geometryEngine.union(bands.map((b) => b.geometry)) as unknown as
        __esri.Polygon | null;
      if (merged) {
        const b0 = bands[0];
        const alpha = bandOnFlood ? 0.14 : 0.34;
        const g = new Graphic({
          geometry: merged,
          attributes: { band: b0.key, label: b0.label },
        });
        g.symbol = bandFill2d(b0.hue, alpha, bandOnFlood) as unknown as Sym;
        gl.add(g);
        return;
      }
    }

    for (const b of bands) {
      const alpha = bandOnFlood
        ? (d3 ? 0.10 : 0.14)
        : d3 ? (b.height > 40 ? 0.16 : 0.42) : 0.34;
      const g = new Graphic({
        geometry: b.geometry,
        attributes: { band: b.key, label: b.label },
      });
      g.symbol = (d3
        ? bandFill3d(b.hue, alpha, b.height, b.height <= 40)
        : bandFill2d(b.hue, alpha, bandOnFlood)) as unknown as Sym;
      gl.add(g);
    }
  }, [view, dim, bands, bandOnFlood, flood]);

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

  /* ── Дарж мэдээлэл авах ── */
  /* (Зарлалтууд нь дээр, `drawWFlowRef`-ийн дэргэд — 2026-09-30.) */
  /**
   * Долгионы чиглэл (градус, `waveDirRef`) — загварчлалын ДУНДАЖ урсгалаас нэг удаа бодно.
   */
  useEffect(() => {
    if (!flood) { waveDirRef.current = 180; return; }
    const m = flood.meta;
    const s = m.slices - 1;
    let su = 0;
    let sv = 0;
    /* Бүх нүдийг гүйхгүй — 16 нүд тутам дээж (чиглэл дунджаар тогтвортой) */
    for (let i = 0; i < m.width * m.height; i += 16) {
      const d = flood.depth(s, i);
      if (d < m.wetM) continue;
      su += flood.u(s, i);
      sv += flood.v(s, i);
    }
    waveDirRef.current = su === 0 && sv === 0 ? 180 : flowDeg(su, sv);
  }, [flood]);
  const geoRef = useRef<ExtentAndRotationGeoreference | null>(null);
  const wflowGeoRef = useRef<ExtentAndRotationGeoreference | null>(null);

  useEffect(() => {
    if (!view || view.destroyed) return;
    const h = view.on('click', (ev: __esri.ViewClickEvent) => {
      const pt = ev.mapPoint;
      const fd = floodRef.current;
      const fIdx = fd && pt ? fd.indexAt(pt.x, pt.y) : null;
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
        /**
         * Урьд нь `fd.depth(0, fIdx) >= 0` — гүн хэзээ ч сөрөг биш тул
         * торны ДОТОРХ ямар ч цэг үерийн нүд болж, `Ersdel.tsx`-ийн
         * `hazInfo` («Энэ цэгт ус ирээгүй») нь `featInfo`-г (каталогийн
         * давхаргын объект, `MapCanvas`-ийн даралт) ҮРГЭЛЖ дардаг байв —
         * загварын горимд барилга дараад атрибутыг нь харах боломжгүй.
         * Одоо БҮХ хугацааны дээд гүн (`maxDepth`, байхгүй бол одоогийн
         * зүсмэл) ≥ `wetM` үед л үерийн нүд; хуурай цэг → муж эсвэл `null`,
         * тэгэхээр каталогийн объектын мэдээлэл гарна.
         */
        if (fIdx != null && fd) {
          const dMax = fd.maxDepth ? fd.maxDepth(fIdx) : fd.depth(floodSliceRef.current, fIdx);
          if (dMax >= fd.meta.wetM) {
            pickRef.current({ kind: 'flood', idx: fIdx });
            return;
          }
        }
        pickRef.current(band ? { kind: 'band', band, idx: fIdx ?? undefined } : null);
      }).catch(() => {});
    });
    return () => h.remove();
  }, [view]);

  return null;
}

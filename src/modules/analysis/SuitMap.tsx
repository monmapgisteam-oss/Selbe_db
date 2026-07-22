'use client';

import { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import Basemap from '@arcgis/core/Basemap';
import Ground from '@arcgis/core/Ground';
import Graphic from '@arcgis/core/Graphic';
import Home from '@arcgis/core/widgets/Home';
import ScaleBar from '@arcgis/core/widgets/ScaleBar';
import type Layer from '@arcgis/core/layers/Layer';
import type Polygon from '@arcgis/core/geometry/Polygon';
import esriConfig from '@arcgis/core/config';

import BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import BuildingExplorer from '@arcgis/core/widgets/BuildingExplorer';
import {
  ET, BASEMAP_URL, IMAGERY, SCENE, BIM, ELEVATION_URL, HOME, LAYER_BY_ID, layerUrl,
} from '@/lib/services';
import type { Dim } from '@/components/MapCanvas';

/** 3d ба bim хоёулаа SceneView ашиглана */
const is3D = (d: Dim) => d === '3d' || d === 'bim';
import { MAP_LAYERS, type MapLayerDef } from '@/lib/analysis/config';
import type { Zone } from '@/lib/analysis/data';
import s from './suitability.module.css';

export type MapRow = Zone & { urban: number | null; displayGeom: Polygon | null };

/** Барилгын төлөвийн өнгө — эх аппын палитр */
const STATUS_COLORS: Record<string, [number, number, number]> = {
  'Төлөвлөсөн': [96, 165, 250],
  'Баригдаж байгаа': [251, 146, 60],
  'Одоо байгаа': [134, 139, 150],
};

/** Дүүргэлт 70% тунгалаг — доорх бүсийн оноо харагдана. Хүрээ нь alpha ×3. */
const BLD_ALPHA = 0.3;
const BLD_ALPHA_DIM = 0.15;
const bldFill = (c: number[], a = BLD_ALPHA) => ({
  type: 'simple-fill', color: [...c, a],
  outline: { color: [...c, Math.min(1, a * 3)], width: 0.4 },
});

const ZONE_ALPHA = 0.5;
const ZONE_ALPHA_NODATA = 0.2;
/** Сонгосон бүсийн хүрээ — cyan (ногоон дүүргэлт дээр ч тодорно) */
const SELECT_COLOR = [34, 211, 238, 1];

const hexToRgba = (hex: string, a: number) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a,
];

/**
 * 3D-д давхаргыг ГАЗРЫН ГАДАРГУУ дээр наана.
 * ⚠️ Заавал: гадаргуу ~1350 м өндөрт байх бөгөөд `elevationInfo` өгөхгүй бол
 * давхарга 0 м-т үлдэж мешийн доор алга болно.
 */
const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

function rendererFor(d: MapLayerDef) {
  const c = d.color;
  switch (d.kind) {
    case 'line':
      return { type: 'simple', symbol: { type: 'simple-line', color: [...c, 0.95], width: 0.75 } };
    case 'point':
      return { type: 'simple', symbol: { type: 'simple-marker', style: 'circle', size: 7,
        color: [...c, 0.95], outline: { color: [15, 20, 27, 0.9], width: 1.2 } } };
    case 'point-lg':
      return { type: 'simple', symbol: { type: 'simple-marker', style: 'diamond', size: 12,
        color: [...c, 0.95], outline: { color: [15, 20, 27, 0.9], width: 1.4 } } };
    case 'hatch':
      return { type: 'simple', symbol: { type: 'simple-fill', style: 'diagonal-cross',
        color: [...c, 0.55], outline: { color: [...c, 0.75], width: 0.8 } } };
    default:
      return { type: 'simple', symbol: { type: 'simple-fill', color: [...c, 0.35],
        outline: { color: [...c, 0.9], width: 0.6 } } };
  }
}

/** Барилгын renderer — `Barilga_ty` (төлөв)-өөр */
const buildingRenderer = () => ({
  type: 'unique-value', field: 'Barilga_ty',
  defaultSymbol: bldFill([203, 213, 225], BLD_ALPHA_DIM), defaultLabel: 'Бусад',
  uniqueValueInfos: Object.entries(STATUS_COLORS).map(([value, c]) => ({ value, label: value, symbol: bldFill(c) })),
});

/**
 * Бүсийн шошгын симбол.
 *
 * ⚠️ 2D ба 3D-д ӨӨР төрөл: `TextSymbol` нь SceneView-д ДЭМЖИГДЭХГҮЙ (ArcGIS-ийн
 * баримтжуулсан хязгаарлалт) тул тэнд `point-3d` + `text` symbolLayer хэрэглэнэ.
 * Нэг ижил бичвэрийг хоёр хэлбэрээр угсарч байгаа нь энэ шалтгаантай.
 */
function labelSymbol(dim: Dim, text: string, color: string, halo: string, haloSize: number, size: number) {
  if (is3D(dim)) {
    return {
      type: 'point-3d',
      symbolLayers: [{
        type: 'text',
        text,
        material: { color },
        halo: { color: halo, size: haloSize },
        size,
      }],
    } as unknown as __esri.SymbolProperties;
  }
  return {
    type: 'text',
    color,
    haloColor: halo,
    haloSize,
    text,
    font: { size, family: 'Segoe UI', weight: 'bold' },
  } as unknown as __esri.SymbolProperties;
}

/**
 * Суурь зураг — порталтай ЯГ ИЖИЛ: Esri-гийн нийтийн растр тайл + ортофото.
 * ⚠️ Вектор тайлын суурь зураг БИШ: загвар солиход `VectorTileContainer`
 * дээр унадаг ба 2D-д ортофото түүнийг бүрэн бүрхдэг.
 */
const baseMap = () =>
  new Basemap({ baseLayers: [new TileLayer({ url: BASEMAP_URL })], title: 'World Imagery' });

export function SuitMap({
  dim,
  rows,
  colorOf,
  shown,
  selected,
  onSelect,
  layerOn,
  zoneTip,
  buildingTip,
}: {
  /** 2D (MapView + ортофото) эсвэл 3D (SceneView + IntegratedMesh) */
  dim: Dim;
  rows: MapRow[];
  /** Бүсийн будалтын өнгө (одоогийн горимын оноогоор) */
  colorOf: (r: MapRow) => string;
  /** Шүүлтэд багтаж байгаа эсэх — багтаагүйг бүдгэрүүлнэ */
  shown: (r: MapRow) => boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Давхарга ил эсэх — `MAP_LAYERS[].key`-ээр (`zone`/`label` ч энд орно) */
  layerOn: Record<string, boolean>;
  /** Hover панелийн HTML — эх аппын адил мөрөөр угсарна */
  zoneTip: (r: MapRow) => string;
  buildingTip: (attrs: Record<string, unknown>) => string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<MapView | SceneView | null>(null);
  const zoneRef = useRef<GraphicsLayer | null>(null);
  const labelRef = useRef<GraphicsLayer | null>(null);
  const bldRef = useRef<FeatureLayer | null>(null);
  const bimWidgetRef = useRef<BuildingExplorer | null>(null);
  // ⚠️ Энэ файлд `Map` нэрийг ArcGIS-ийн `Map` класс эзэлсэн тул JS-ийн Map
  //    ашиглах боломжгүй — энгийн объект хангалттай.
  const ctxRef = useRef<Record<string, Layer>>({});
  const [ready, setReady] = useState(false);

  // Callback-уудыг ref-ээр — эффектийг дахин ажиллуулахгүйгээр шинэчилнэ
  const cb = useRef({ colorOf, shown, zoneTip, buildingTip, onSelect, rows });
  cb.current = { colorOf, shown, zoneTip, buildingTip, onSelect, rows };

  /**
   * Map-ыг НЭГ УДАА үүсгэнэ; view нь 2D/3D солигдох бүрд дахин үүснэ.
   * ⚠️ Map-ыг дахин үүсгэвэл давхаргууд шинээр ачаалагдаж, сонголт алдагдана.
   */
  useEffect(() => {
    if (!el.current) return;

    if (!mapRef.current) {
      esriConfig.assetsPath = 'https://js.arcgis.com/4.31/@arcgis/core/assets';

      const zoneLayer = new GraphicsLayer({ title: 'Тохиромжтой байдал', elevationInfo: ON_GROUND });
      const labelLayer = new GraphicsLayer({ title: 'Шошго', elevationInfo: ON_GROUND });
      zoneRef.current = zoneLayer;
      labelRef.current = labelLayer;

      /**
       * ⚠️ `special` давхаргууд (оноон будалт, шошго) нь дээрх GraphicsLayer —
       * тэдгээрийг ЭНД дахин үүсгэхгүй, зөвхөн `ctxRef`-т бүртгэж ил байдлыг
       * нь нэг ижил механизмаар удирдана.
       */
      ctxRef.current.zone = zoneLayer;
      ctxRef.current.label = labelLayer;

      const ctx = MAP_LAYERS.filter((d) => !d.special).map((d) => {
        // Хяналтын давхаргууд ХУУЧИН үйлчилгээнд тул каталогоос хаягаа авчирна
        const url = d.layerId ? layerUrl(LAYER_BY_ID[d.layerId]) : `${ET}/${d.n}`;
        const lyr = new FeatureLayer({
          url,
          title: d.title,
          visible: d.on,
          outFields: ['*'],
          elevationInfo: ON_GROUND,
          renderer: (d.kind === 'building' ? buildingRenderer() : rendererFor(d)) as __esri.RendererProperties,
          popupEnabled: false, // popup биш — hover панель
        });
        ctxRef.current[d.key] = lyr;
        return { d, lyr };
      });

      const buildingLayer = ctx.find((x) => x.d.kind === 'building')?.lyr ?? null;
      bldRef.current = buildingLayer;
      const under = ctx.filter((x) => x.lyr !== buildingLayer).map((x) => x.lyr);

      /* Ортофото — СУУРЬ. Хамгийн эхэнд нэмснээр бүх давхаргын доор. */
      const imagery = new GroupLayer({
        id: 'imagery',
        title: IMAGERY.title,
        visible: true,
        listMode: 'hide',
        layers: IMAGERY.urls.map((url, i) => new ImageryLayer({
          id: `imagery:${i}`, url, visible: true,
          format: 'jpgpng', popupEnabled: false, legendEnabled: false,
        })),
      });

      /**
       * ⚠️ ДАРААЛАЛ: ортофото → контекст → бүсийн будалт → барилга → шошго.
       * Барилгыг бүсийн полигоны ДЭЭР зурна — эс бөгөөс будалт дор дарагдана.
       */
      mapRef.current = new Map({
        basemap: baseMap(),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: [imagery, ...under, zoneLayer, ...(buildingLayer ? [buildingLayer] : []), labelLayer],
      });
    }

    const map = mapRef.current;
    setReady(false);

    const view: MapView | SceneView = is3D(dim)
      ? new SceneView({
        container: el.current,
        map,
        camera: {
          position: { longitude: HOME.lon, latitude: HOME.lat - 0.012, z: 2600 },
          tilt: 62, heading: 0,
        },
        popupEnabled: false,
        qualityProfile: 'high',
      })
      : new MapView({
        container: el.current,
        map,
        center: [HOME.lon, HOME.lat],
        zoom: HOME.zoom,
        constraints: { snapToZoom: false, rotationEnabled: false },
        popupEnabled: false,
      });
    viewRef.current = view;

    // ⚠️ Виджетүүд MapView|SceneView хоёуланг хүлээж авдаг ч төрлийн
    //    тодорхойлолт нь MapView-г л заадаг тул нэг удаа cast хийнэ.
    const anyView = view as MapView;
    view.ui.move('zoom', 'top-right');
    view.ui.add(new Home({ view: anyView }), 'top-right');
    view.ui.add(new ScaleBar({ view: anyView, unit: 'metric', style: 'line' }), 'bottom-right');

    view.when(() => { if (!view.destroyed) setReady(true); }).catch(() => {});

    /* Дарж бүс сонгох */
    const click = view.on('click', (e) => {
      const zoneLayer = zoneRef.current;
      if (!zoneLayer) return;
      view.hitTest(e, { include: [zoneLayer] })
        .then((hit) => {
          const g = hit.results.find(
            (r) => r.type === 'graphic' && (r.graphic.attributes as { zoneId?: string })?.zoneId,
          );
          cb.current.onSelect(
            g && g.type === 'graphic' ? (g.graphic.attributes as { zoneId: string }).zoneId : null,
          );
        })
        .catch(() => {});
    });

    /**
     * Hover панель. Барилга бүсийн дээр зурагддаг тул эхлээд барилгыг үзүүлнэ.
     * ⚠️ `hitTest` нь async тул хожуу ирсэн хуучин хариу шинийг дарахгүйн тулд
     * token-оор хамгаална.
     */
    let token = 0;
    let lastKey: string | null = null;
    const move = view.on('pointer-move', (e) => {
      const my = ++token;
      const include = [bldRef.current, zoneRef.current].filter(Boolean) as Layer[];
      if (!include.length) return;
      view.hitTest(e, { include })
        .then((hit) => {
          if (my !== token || !tipEl.current) return;
          const tip = tipEl.current;
          const bld = hit.results.find((r) => r.type === 'graphic' && r.graphic.layer === bldRef.current);
          const zone = hit.results.find(
            (r) => r.type === 'graphic' && (r.graphic.attributes as { zoneId?: string })?.zoneId,
          );

          let key: string | null = null;
          let html: string | null = null;
          if (bld && bld.type === 'graphic') {
            const a = bld.graphic.attributes as Record<string, unknown>;
            key = `b${a.OBJECTID}`;
            if (key !== lastKey) html = cb.current.buildingTip(a);
          } else if (zone && zone.type === 'graphic') {
            const id = (zone.graphic.attributes as { zoneId: string }).zoneId;
            const r = cb.current.rows.find((x) => x.id === id);
            if (r) { key = `z${id}`; if (key !== lastKey) html = cb.current.zoneTip(r); }
          }

          if (!key) {
            tip.hidden = true; lastKey = null;
            if (!view.destroyed && view.container) view.container.style.cursor = '';
            return;
          }
          if (!view.destroyed && view.container) view.container.style.cursor = 'pointer';
          if (html !== null) { tip.innerHTML = html; lastKey = key; }
          tip.hidden = false;
          placeTip(tip, e.x, e.y);
        })
        .catch(() => {});
    });

    const leave = view.on('pointer-leave', () => {
      if (tipEl.current) tipEl.current.hidden = true;
      lastKey = null;
    });

    return () => {
      click.remove();
      move.remove();
      leave.remove();
      /**
       * ⚠️ `view.destroy()` нь 4.17-оос хойш ӨӨРИЙН `map`-ыг ч хамт устгадаг.
       * 2D↔3D солиход Map хэвээр үлдэх ёстой тул холбоог эхлээд тасална — эс
       * бөгөөс шинэ view «The provided map is already destroyed» гэж унана.
       */
      view.container = null as unknown as HTMLDivElement;
      (view as unknown as { map: Map | null }).map = null;
      view.destroy();
      viewRef.current = null;
    };
  }, [dim]);

  /** Map-ыг компонент бүрмөсөн салахад л устгана */
  useEffect(() => () => {
    mapRef.current?.destroy();
    mapRef.current = null;
    zoneRef.current = null;
    labelRef.current = null;
    bldRef.current = null;
    ctxRef.current = {};
  }, []);

  /**
   * 3D давхаргуудыг ЗӨВХӨН тохирох горимд газрын зурагт байлгана (3d = меш,
   * bim = барилгын загвар).
   * ⚠️ `visible: false`-ээр нуух нь ХАНГАЛТГҮЙ: MapView нь эдгээрийг дэмждэггүй
   * тул зурагт БАЙХАД л «Failed to create layerview» өгнө.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of SCENE.layers) {
      const id = `scene:${m.key}`;
      const existing = map.findLayerById(id);
      if (dim === '3d' && !existing) {
        // Индекс 1 — ортофотогийн дараа, бусад давхаргын өмнө
        map.add(new IntegratedMeshLayer({ id, url: m.url, title: m.title, visible: true }), 1);
      } else if (dim !== '3d' && existing) {
        map.remove(existing);
        existing.destroy();
      }
    }

    for (const b of BIM.layers) {
      const existing = map.findLayerById(b.key);
      if (dim === 'bim' && !existing) {
        map.add(new BuildingSceneLayer({ id: b.key, url: b.url, title: b.title, visible: true }));
      } else if (dim !== 'bim' && existing) {
        map.remove(existing);
        existing.destroy();
      }
    }
  }, [dim, ready]);

  /** BuildingExplorer виджет — ЗӨВХӨН BIM горимд (MapCanvas-тай ижил зан) */
  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    if (!map || !view || !ready) return;

    const clear = () => {
      if (bimWidgetRef.current) {
        view.ui.remove(bimWidgetRef.current);
        bimWidgetRef.current.destroy();
        bimWidgetRef.current = null;
      }
    };

    if (dim !== 'bim') { clear(); return; }

    const layers = BIM.layers
      .map((b) => map.findLayerById(b.key))
      .filter((l): l is BuildingSceneLayer => l instanceof BuildingSceneLayer);
    if (!layers.length) return;

    clear();
    const widget = new BuildingExplorer({ view: view as SceneView, layers });
    view.ui.add(widget, 'top-right');
    bimWidgetRef.current = widget;

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, ready]);

  /** Панелийг заагчийн хажууд, зургийн хүрээнээс гарахгүйгээр */
  function placeTip(tip: HTMLDivElement, x: number, y: number) {
    const pad = 14;
    const box = tip.parentElement?.getBoundingClientRect();
    if (!box) return;
    let left = x + pad, top = y + pad;
    if (left + tip.offsetWidth > box.width - 6) left = x - tip.offsetWidth - pad;
    if (top + tip.offsetHeight > box.height - 6) top = y - tip.offsetHeight - pad;
    tip.style.left = `${Math.max(6, left)}px`;
    tip.style.top = `${Math.max(6, top)}px`;
  }

  /* ── Давхаргын ил байдал (оноон будалт, шошго ч энд орно) ── */
  useEffect(() => {
    for (const [key, lyr] of Object.entries(ctxRef.current)) lyr.visible = layerOn[key] ?? false;
  }, [layerOn]);

  /* ── Бүсийн будалт ба шошго ── */
  const paintKey = rows.map((r) => `${r.id}:${colorOf(r)}:${shown(r) ? 1 : 0}`).join('|')
    + `#${selected ?? ''}#${dim}`;
  useEffect(() => {
    const zoneLayer = zoneRef.current, labelLayer = labelRef.current;
    if (!zoneLayer || !labelLayer) return;
    zoneLayer.removeAll();
    labelLayer.removeAll();

    // Сонгосон бүсийг ХАМГИЙН СҮҮЛД зурж хүрээ нь хөршүүддээ дарагдахгүй байлгана
    const ordered = [...rows].sort(
      (a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0),
    );

    for (const r of ordered) {
      if (!r.displayGeom) continue;
      const col = colorOf(r);
      const isSel = selected === r.id;
      const vis = shown(r);
      const isBagts = /багц/i.test(r.id);
      const hasSel = selected !== null;

      let alpha = r.urban == null ? ZONE_ALPHA_NODATA : ZONE_ALPHA;
      if (!vis) alpha = 0.06;
      else if (hasSel && !isSel) alpha *= 0.45;

      zoneLayer.add(new Graphic({
        geometry: r.displayGeom,
        attributes: { zoneId: r.id },
        symbol: {
          type: 'simple-fill',
          color: hexToRgba(col, alpha),
          outline: {
            color: isSel ? SELECT_COLOR : hexToRgba(col, Math.min(1, alpha * 1.35)),
            width: isSel ? 1.6 : 0.6,
          },
        } as unknown as __esri.SymbolProperties,
      }));

      if (vis) {
        // Зөвхөн бүсийн НЭР — оноо нь өнгө, эрэмбэ, дэлгэрэнгүйгээс уншигдана
        labelLayer.add(new Graphic({
          geometry: r.displayGeom.centroid,
          symbol: labelSymbol(
            dim,
            r.id,
            isSel ? '#ffffff' : isBagts ? '#ffeeba' : '#dbe4ee',
            isSel ? '#000000' : '#0a0e13',
            isSel ? 2.2 : 1.1,
            isSel ? 11 : isBagts ? 9 : 7.5,
          ),
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintKey]);

  /** Сонгосон бүс рүү төвлөрөх */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.destroyed || !selected) return;
    const r = rows.find((x) => x.id === selected);
    if (r?.displayGeom) view.goTo({ target: r.displayGeom, scale: 6000 }, { duration: 550 }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /** Судалгааны талбар руу эхэлж төвлөрөх (view дахин үүсэх бүрд) */
  const fitKey = `${rows.length}|${ready}|${dim}`;
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.destroyed || !ready || !rows.length) return;
    const extents = rows.map((r) => r.displayGeom?.extent).filter(Boolean) as __esri.Extent[];
    if (!extents.length) return;
    const union = extents.reduce((a, e) => a.union(e), extents[0].clone());
    view.goTo(union.expand(1.12)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div className={s.mapWrap}>
      <div ref={el} className={s.viewDiv} />
      <div ref={tipEl} className={s.mapTip} hidden />
    </div>
  );
}

'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer';
import BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import BuildingExplorer from '@arcgis/core/widgets/BuildingExplorer';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Ground from '@arcgis/core/Ground';
import TileLayer from '@arcgis/core/layers/TileLayer';
import type Layer from '@arcgis/core/layers/Layer';
import Basemap from '@arcgis/core/Basemap';
import Extent from '@arcgis/core/geometry/Extent';
import esriConfig from '@arcgis/core/config';
import '@arcgis/core/assets/esri/themes/light/main.css';

import {
  LAYERS, LAYER_BY_ID, layerUrl, drawOrder, DASH_PATTERN,
  HOME, BASEMAP_URL, IMAGERY, SCENE, BIM, ELEVATION_URL, ZONE_LAYER,
  ZONE_FIELD, ZONE_NONE, ZONE_TYPE_EMPTY_HUE, OID, BUILDING, SURVEY,
  type LayerDef,
} from '@/lib/services';
import { queryExtent, queryFeatures, sqlStr, type Aoi } from '@/lib/query';
import { num, pct, date, text } from '@/lib/format';
import s from './map.module.css';

/**
 * Газрын зургийн харагдац:
 *   · 2d  — MapView, ортофото
 *   · 3d  — SceneView, IntegratedMesh (гадна фотограмметр)
 *   · bim — SceneView, BuildingSceneLayer (зохион бүтээсэн загвар)
 *
 * ⚠️ 3d ба bim ХОЁУЛАА SceneView ашиглана — ялгаа нь зөвхөн ямар 3D давхарга
 * ачаалахад л байна.
 */
export type Dim = '2d' | '3d' | 'bim';
type AnyView = MapView | SceneView;
const is3D = (d: Dim) => d === '3d' || d === 'bim';

/* ─────────────────── Map контекст ─────────────────── */

type MapApi = {
  view: AnyView | null;
  /**
   * Ангиллын тодруулга (SQL where). null = цуцлах. Таарахгүйг БҮДГЭРҮҮЛНЭ.
   * `onlyLayerIds` заавал бол ЗӨВХӨН тэдгээр давхаргад хэрэглэнэ — шүүлтийн
   * талбар бусад давхаргад байхгүй үед (жишээ нь `Barilga_ty` нь бүсийн давхаргад
   * байхгүй) featureEffect унахаас сэргийлнэ. Нэг эсвэл олон давхарга. Заагаагүй
   * бол бүх давхаргад.
   */
  setHighlight: (where: string | null, onlyLayerIds?: string | string[]) => void;
  /** Давхаргыг бүхэлд нь харагдах хүрээнд нь аваачих */
  zoomToLayer: (id: string) => void;
  /** Тодорхой бүсийн хүрээнд аваачих */
  zoomToZone: (zone: string) => void;
};

const Ctx = createContext<MapApi>({
  view: null, setHighlight: () => {}, zoomToLayer: () => {}, zoomToZone: () => {},
});

const RegisterCtx = createContext<(view: AnyView | null) => void>(() => {});

export const useMap = () => useContext(Ctx);

/* ─────────────────── Симбол ─────────────────── */

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/**
 * ⚠️ ArcGIS-д өнгөний alpha нь СИМБОЛЫН ТӨРЛӨӨС хамаарч өөр хэмжээстэй:
 *   · энгийн симбол (simple-fill, simple-marker) → 0–1
 *   · CIM симбол (CIMSolidStroke)                → 0–100
 */
const c = (hex: string, a = 1): number[] => [...rgb(hex), a];
const cim = (hex: string, a = 1): number[] => [...rgb(hex), Math.round(a * 100)];

/**
 * Полигон — нам дүүргэлт + нимгэн ТОД хүрээ.
 *
 * ⚠️ Дүүргэлтийн утга нь ортофото АНХНААСАА суурь болсон учир шийдвэрлэх ач
 * холбогдолтой. Ортофото нь дунд өнгөтэй, нарийн бүтэцтэй дэвсгэр (дундаж RGB
 * 115,113,107) тул 0.2 тунгалагт давхаргууд угаагдаж алга болдог.
 * Хэмжсэн (CIE Lab ΔE): a=0.16 → 12–18 (сул) · a=0.30 → 22–34 (тод).
 */
const fill = (hex: string, a = 0.3, w = 0.9) =>
  ({ type: 'simple-fill', color: c(hex, a), outline: { color: c(hex, 1), width: w } }) as const;

/**
 * Шугам — нимгэн зураас + нарийн бараан хүрээлэл (casing).
 *
 * Шугаман давхаргад дүүргэлт байхгүй тул харагдац нь БҮХЭЛДЭЭ зураасаас хамаарна.
 * Ортофото нарийн бүтэцтэй тул дан нимгэн зураас түүн дээр тасарч алга болдог;
 * зузаалах нь шийдэл биш (зураг бөглөрнө). Доор нь бараан хагас тунгалаг
 * хүрээлэл тавьж дэвсгэрээс ТАСЛАНА — картографийн стандарт арга.
 *
 * ⚠️ Хээг үндсэн зураас ба хүрээлэлд ЯГ ижлээр өгнө — эс бөгөөс хүрээлэл бүтэн
 * үлдэж, тасархай нь «дүүрсэн» мэт харагдана.
 * ⚠️ symbolLayers-ийн ЭХНИЙХ нь ДЭЭР зурагдана.
 */
const line = (hex: string, w = 1.4, dash: NonNullable<LayerDef['dash']> = 'solid') => {
  const pattern = DASH_PATTERN[dash];
  // Цэгэн хээнд Round үзүүр; бусад тасархайд Butt — Round нь богино зураасыг
  // хоёр талаас сунгаж `dot` ба `dash`-ыг ялгагдахгүй болгоно.
  const capStyle = dash === 'dot' || dash === 'solid' ? 'Round' : 'Butt';
  const effects = pattern
    ? [{ type: 'CIMGeometricEffectDashes', dashTemplate: pattern, lineDashEnding: 'NoConstraint' }]
    : undefined;
  const stroke = (width: number, color: number[]) => ({
    type: 'CIMSolidStroke', enable: true, capStyle, joinStyle: 'Round', width, color,
    ...(effects ? { effects } : {}),
  });
  return {
    type: 'cim',
    data: {
      type: 'CIMSymbolReference',
      symbol: {
        type: 'CIMLineSymbol',
        symbolLayers: [stroke(w, cim(hex, 1)), stroke(w + 1.3, cim('#0b1220', 0.4))],
      },
    },
  } as const;
};

/** Цэг — цагаан хүрээтэй; хэлбэрээр нь сэдэв доторх давхаргууд ялгарна */
const dot = (hex: string, size = 9, marker: NonNullable<LayerDef['marker']> = 'circle') =>
  ({
    type: 'simple-marker', style: marker, size,
    color: c(hex, 0.95),
    outline: { color: [255, 255, 255, 0.9], width: 1.4 },
  }) as const;

const simple = (sym: unknown) => ({ type: 'simple', symbol: sym }) as __esri.RendererProperties;

/** Каталогийн тодорхойлолтоос симбол — зураг ба тайлбар нэг эх сурвалжтай */
export const symbolOf = (d: LayerDef, hue = d.hue) =>
  d.geom === 'line'
    ? line(hue, d.width ?? 1.4, d.dash ?? 'solid')
    : d.geom === 'point'
      ? dot(hue, d.size ?? 9, d.marker ?? 'circle')
      : fill(hue, d.fill ?? 0.3, d.width ?? 0.9);

/**
 * Давхаргын хүрээг зургийн проекцоор.
 *
 * ⚠️ SDK-ийн `FeatureLayer.queryExtent()`-ийг ашиглахгүй: тэр нь `where`-ыг
 * хүсэлтэд огт оруулдаггүй бөгөөд эдгээр FeatureServer 400 «No where clause
 * specified» гэж татгалздаг. REST рүү шууд хандана (`lib/query.ts`).
 */
async function extentOf(url: string, view: AnyView, where = '1=1'): Promise<Extent | null> {
  const wkid = view.spatialReference?.wkid ?? 102100;
  const box = await queryExtent(url, wkid, where);
  if (!box) return null;
  return new Extent({
    xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax,
    spatialReference: view.spatialReference,
  });
}

/** Бүсийн шошго — цагаан halo-той тул аль ч дэвсгэрт уншигдана */
const zoneLabels = () =>
  [
    {
      labelExpressionInfo: { expression: `Trim(Text($feature.${ZONE_FIELD}))` },
      symbol: {
        type: 'text',
        color: c('#111827'),
        haloColor: [255, 255, 255, 0.92],
        haloSize: 1.7,
        font: { size: 10, weight: 'bold' },
      },
      labelPlacement: 'always-horizontal',
      minScale: 14000,
    },
  ] as unknown as __esri.LabelClassProperties[];

const baseMap = () =>
  new Basemap({ baseLayers: [new TileLayer({ url: BASEMAP_URL })], title: 'World Imagery' });

/* ─────────────────── Давхарга үүсгэх ─────────────────── */

export const IMAGERY_ID = 'imagery';

/** Дарж сонгогдохгүй, шүүлтэд оролцохгүй давхаргууд */
const PASSIVE = new Set<string>([
  'sketch',
  IMAGERY_ID,
  ...SCENE.layers.map((l) => `scene:${l.key}`),
  ...BIM.layers.map((l) => l.key),
]);

/**
 * 3D-д вектор давхаргыг ГАЗРЫН ГАДАРГУУ дээр наана.
 * ⚠️ Заавал: гадаргуу ~1350 м өндөрт байх бөгөөд `elevationInfo` өгөхгүй бол
 * давхарга 0 м-т үлдэж мешийн доор алга болно.
 */
const ON_GROUND = { mode: 'on-the-ground' } as unknown as __esri.FeatureLayerProperties['elevationInfo'];

function buildLayers(): Layer[] {
  const L: Layer[] = [];

  /* Ортофото — СУУРЬ. Хамгийн эхэнд нэмснээр бүх вектор давхаргын доор. */
  L.push(new GroupLayer({
    id: IMAGERY_ID,
    title: IMAGERY.title,
    visible: true,
    listMode: 'hide',
    /**
     * ⚠️ `visibilityMode: 'inherited'` БИШ. Тэр горимд хүүхэд давхарга нэмэгдэх
     * агшинд эцгийнхээ `visible`-ыг шингээдэг бөгөөд конструкторын шинжүүд ямар
     * дарааллаар олгогдох нь баталгаагүй.
     */
    layers: IMAGERY.urls.map((url, i) => new ImageryLayer({
      id: `${IMAGERY_ID}:${i}`, url, visible: true,
      format: 'jpgpng', popupEnabled: false, legendEnabled: false,
    })),
  }));

  /* Сэдэвчилсэн давхаргууд — каталогаас ерөнхийлж */
  const V = LAYERS.map((d) => new FeatureLayer({
    id: d.id,
    url: layerUrl(d),
    title: d.title,
    outFields: ['*'],
    popupEnabled: false,
    visible: false,
    ...(d.minScale ? { minScale: d.minScale } : {}),
    elevationInfo: ON_GROUND,
    renderer: d.paint
      ? ({
          type: 'unique-value',
          field: d.paint.field,
          defaultSymbol: symbolOf(d, ZONE_TYPE_EMPTY_HUE),
          defaultLabel: d.paint.emptyLabel,
          uniqueValueInfos: Object.entries(d.paint.values).map(([value, hue]) => ({
            value, label: value, symbol: symbolOf(d, hue),
          })),
        } as __esri.RendererProperties)
      : d.breaks
        ? ({
            type: 'class-breaks',
            field: d.breaks.field,
            defaultSymbol: symbolOf(d, '#64748b'),
            defaultLabel: d.breaks.emptyLabel,
            classBreakInfos: d.breaks.levels.map((l) => ({
              minValue: l.min,
              // ⚠️ ArcGIS classBreak нь maxValue-г ОРУУЛЖ тоолдог; самбарын SQL нь
              //    `< max` тул багахан хасаж хоёуланг нь тааруулна.
              maxValue: l.max - 0.0001,
              label: `${l.label} (${l.range})`,
              symbol: symbolOf(d, l.color),
            })),
          } as __esri.RendererProperties)
        : simple(symbolOf(d)),
    ...(d.id === ZONE_LAYER.id ? { labelingInfo: zoneLabels() } : {}),
  }));

  /**
   * ДАРААЛАЛ: талбай → шугам → цэг.
   * ⚠️ `sort` нь ES2019-оос хойш тогтвортой тул ижил геометртэй давхаргууд
   * каталогийн дарааллаа хадгална.
   */
  L.push(...[...V].sort((a, b) => drawOrder(a.id) - drawOrder(b.id)));
  return L;
}

/* ─────────────────── Provider ─────────────────── */

export function MapProvider({ children }: { children: ReactNode }) {
  // Ref биш STATE — MapCanvas view-гээ бүртгүүлэхэд хэрэглэгчид дахин зурагдана
  const [view, setView] = useState<AnyView | null>(null);
  const register = useCallback((v: AnyView | null) => setView(v), []);

  const [hl, setHl] = useState<{ where: string | null; only?: string | string[] }>({ where: null });

  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const onlyList = hl.only == null ? null : Array.isArray(hl.only) ? hl.only : [hl.only];
    view.map.layers.forEach((l) => {
      if (PASSIVE.has(l.id) || !('featureEffect' in l)) return;
      const fl = l as FeatureLayer;
      // ⚠️ `visible` шалгахгүй: нуугдсан давхаргын эффектийг цэвэрлэх боломжтой
      //    байх ёстой, эс бөгөөс дахин асаахад хуучин шүүлт үлдэнэ.
      // `only` заасан бол ЗӨВХӨН тэр давхаргууд — бусдынхыг цэвэрлэнэ.
      const apply = hl.where && (!onlyList || onlyList.includes(l.id));
      fl.featureEffect = apply
        ? ({
            filter: { where: hl.where },
            excludedEffect: 'opacity(15%) grayscale(80%)',
          } as unknown as __esri.FeatureEffect)
        : (null as unknown as __esri.FeatureEffect);
    });
  }, [view, hl]);

  const setHighlight = useCallback(
    (where: string | null, only?: string | string[]) => setHl({ where, only }),
    [],
  );

  const goTo = useCallback(async (url: string, w: string) => {
    if (!view || view.destroyed) return;
    try {
      const e = await extentOf(url, view, w);
      if (e && !view.destroyed) view.goTo(e.expand(1.2)).catch(() => {});
    } catch (err) {
      console.error('[selbe] хүрээг тодорхойлж чадсангүй:', err);
    }
  }, [view]);

  const zoomToLayer = useCallback((id: string) => {
    const d = LAYER_BY_ID[id];
    if (d) goTo(layerUrl(d), '1=1');
  }, [goTo]);

  const zoomToZone = useCallback((zone: string) => {
    goTo(layerUrl(ZONE_LAYER), `${ZONE_FIELD} = ${sqlStr(zone)}`);
  }, [goTo]);

  const api = useMemo<MapApi>(
    () => ({ view, setHighlight, zoomToLayer, zoomToZone }),
    [view, setHighlight, zoomToLayer, zoomToZone],
  );

  return (
    <RegisterCtx.Provider value={register}>
      <Ctx.Provider value={api}>{children}</Ctx.Provider>
    </RegisterCtx.Provider>
  );
}

/* ─────────────────── Компонент ─────────────────── */

export function MapCanvas({
  dim,
  visible,
  zone,
  onPick,
  children,
}: {
  dim: Dim;
  /** Ил байгаа давхаргын id-ууд */
  visible: string[];
  /** Сонгосон бүс — БҮХ давхаргыг тэр бүсээр хатуу шүүнэ. null = бүгд. */
  zone: string | null;
  onPick: (attrs: Record<string, unknown> | null, layerId: string | null) => void;
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<AnyView | null>(null);
  const bimWidgetRef = useRef<BuildingExplorer | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const [ready, setReady] = useState(false);
  /** Ачаалагдаж чадаагүй 3D загварын тоо — null = асуудалгүй */
  const [meshError, setMeshError] = useState<number | null>(null);
  /** Хулганы доорх объектын товч мэдээлэл */
  const [tip, setTip] = useState<
    { x: number; y: number; id: string; attrs: Record<string, unknown> } | null
  >(null);

  const register = useContext(RegisterCtx);
  const registerRef = useRef(register);
  registerRef.current = register;

  /** Массивыг эффектийн хамааралд өгч болохгүй (лавлагаа нь рендер бүрт шинэ) */
  const visibleKey = visible.join(',');

  /**
   * Map-ыг НЭГ УДАА үүсгэнэ; view нь 2D/3D солигдох бүрд дахин үүснэ.
   * ⚠️ Map-ыг дахин үүсгэвэл давхаргууд шинээр ачаалагдаж, сонголт алдагдана.
   */
  useEffect(() => {
    if (!el.current) return;

    if (!mapRef.current) {
      esriConfig.assetsPath = 'https://js.arcgis.com/4.31/@arcgis/core/assets';
      mapRef.current = new Map({
        basemap: baseMap(),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: buildLayers(),
      });
    }

    const map = mapRef.current;
    setReady(false);

    const view: AnyView =
      is3D(dim)
        ? new SceneView({
            container: el.current,
            map,
            camera: {
              position: { longitude: HOME.lon, latitude: HOME.lat - 0.012, z: 2600 },
              tilt: 62, heading: 0,
            },
            popupEnabled: false,
            qualityProfile: 'high',
            ui: { components: ['zoom', 'navigation-toggle', 'compass', 'attribution'] },
          })
        : new MapView({
            container: el.current,
            map,
            center: [HOME.lon, HOME.lat],
            zoom: HOME.zoom,
            popupEnabled: false,
            constraints: { rotationEnabled: false },
            ui: { components: ['zoom', 'attribution'] },
          });
    viewRef.current = view;

    view.when(() => {
      if (view.destroyed) return;
      setReady(true);
      registerRef.current(view);
      // Эхлэх хүрээг БҮСИЙН давхаргаар — төслийн жинхэнэ хамрах хүрээ
      extentOf(layerUrl(ZONE_LAYER), view)
        .then((e) => {
          if (e && !view.destroyed) view.goTo(e.expand(1.1)).catch(() => {});
        })
        .catch((e) => console.error('[selbe] эхлэх хүрээг тодорхойлж чадсангүй:', e));
    }).catch((e: unknown) => console.error('[selbe] газрын зураг үүсгэж чадсангүй:', e));

    /**
     * Дарж/хулгана аваачихад ХАМААРАХ давхаргын объектыг олох.
     *
     * ⚠️ `hitTest`-д `include` ӨГӨХГҮЙ. 3D-д `IntegratedMesh` нь бүх талбайг
     * бүрхдэг бөгөөд `include`-д ороогүй давхарга нь ТУСГААРЛАГДАХ биш, туяаг
     * түрүүлж таслах учир доор нь дарагдсан вектор объект огт буцаж ирдэггүй
     * байв — 3D-д сонголт «ажиллахгүй» байсны шалтгаан. Бүх үр дүнг авчраад
     * КАТАЛОГТ БҮРТГЭЛТЭЙ, ИЛ давхаргын эхнийхийг нь өөрсдөө шүүнэ.
     */
    const pickHit = (r: __esri.HitTestResult) => {
      for (const x of r.results) {
        if (x.type !== 'graphic') continue;
        const lyr = x.graphic.layer;
        if (!lyr || !lyr.visible || PASSIVE.has(lyr.id)) continue;
        if (!LAYER_BY_ID[lyr.id]) continue;
        return { attrs: x.graphic.attributes as Record<string, unknown>, id: lyr.id };
      }
      return null;
    };

    /**
     * ⚠️ `hitTest` нь РЕНДЕРЛЭГДСЭН пикселээс хамаарна. 3D-д (`SceneView`)
     * вектор давхаргууд газрын гадаргуу дээр наалддаг бөгөөд `IntegratedMesh`
     * тэдгээрийг далдалж, гадаргуугийн композит бүрэн болтол `hitTest` хоосон
     * буцаадаг — сонголт «ажиллахгүй» болдгийн ГОЛ шалтгаан.
     *
     * Тиймээс hitTest хоосон бол ОРОН ЗАЙН АСУУЛГА руу шилжинэ: дарсан цэгээс
     * хэдэн пикселийн хүлцэлтэйгээр ил давхаргуудаас хайна. Энэ нь зургийн
     * рендерээс огт хамаарахгүй тул 2D, 3D хоёуланд ижил ажиллана.
     */
    const pickByQuery = async (mapPoint: __esri.Point, tolerance: number) => {
      const ids = view.map.layers.toArray()
        .filter((l) => l.visible && LAYER_BY_ID[l.id])
        .map((l) => l.id)
        // Дээд талынхыг ЭХЭЛЖ шалгана: цэг → шугам → талбай
        .sort((a, b) => drawOrder(b) - drawOrder(a));
      if (!ids.length) return null;

      const wkid = mapPoint.spatialReference?.wkid ?? 102100;
      const aoi: Aoi = {
        geometry: { x: mapPoint.x, y: mapPoint.y, spatialReference: { wkid } },
        wkid,
        type: 'point',
        distance: tolerance,
      };

      const rows = await Promise.all(
        ids.map((id) => queryFeatures(layerUrl(LAYER_BY_ID[id]), { aoi, limit: 1 }).catch(() => [])),
      );
      for (let i = 0; i < ids.length; i++) {
        if (rows[i].length) return { attrs: rows[i][0] as Record<string, unknown>, id: ids[i] };
      }
      return null;
    };

    const click = view.on('click', (e) => {
      view.hitTest(e)
        .then(async (r) => {
          const hit = pickHit(r);
          if (hit) { pickRef.current(hit.attrs, hit.id); return; }
          if (view.destroyed || !e.mapPoint) { pickRef.current(null, null); return; }
          // ≈6 пикселийн хүлцэл — нимгэн шугам, жижиг цэгийг барихад хангалттай
          const tol = Math.max(2, (view.resolution || 1) * 6);
          const q = await pickByQuery(e.mapPoint, tol);
          if (!view.destroyed) pickRef.current(q?.attrs ?? null, q?.id ?? null);
        })
        .catch(() => {/* view устгагдсан — сонголт өөрчлөгдөхгүй */});
    });

    let busy = false;
    const move = view.on('pointer-move', (e) => {
      if (busy) return;
      busy = true;
      view.hitTest(e)
        .then((r) => {
          if (view.destroyed || !view.container) return;
          const hit = pickHit(r);
          view.container.style.cursor = hit ? 'pointer' : 'default';
          // Товч мэдээллийн хайрцаг — заагчийн хажууд
          setTip(hit ? { x: e.x, y: e.y, id: hit.id, attrs: hit.attrs } : null);
        })
        .catch(() => {})
        // ⚠️ finally — эс бөгөөс нэг унасан hitTest `busy`-г үүрд түгжинэ
        .finally(() => { busy = false; });
    });

    const leave = view.on('pointer-leave', () => setTip(null));

    return () => {
      click.remove();
      move.remove();
      leave.remove();
      setTip(null);
      /**
       * ⚠️ `view.destroy()` нь 4.17-оос хойш ӨӨРИЙН `map`-ыг ч хамт устгадаг.
       * 2D↔3D солиход Map хэвээр үлдэх ёстой тул холбоог эхлээд тасална — эс
       * бөгөөс шинэ view «The provided map is already destroyed» гэж унана.
       */
      view.container = null as unknown as HTMLDivElement;
      (view as unknown as { map: Map | null }).map = null;
      view.destroy();
      viewRef.current = null;
      registerRef.current(null);
    };
  }, [dim]);

  /** Map-ыг компонент бүрмөсөн салахад л устгана */
  useEffect(() => () => { mapRef.current?.destroy(); mapRef.current = null; }, []);

  /**
   * 3D давхаргуудыг ЗӨВХӨН тохирох горимд газрын зурагт байлгана.
   *   · 3d  → IntegratedMesh (гадна фотограмметр)
   *   · bim → BuildingSceneLayer (12 барилгын загвар)
   *
   * ⚠️ `visible: false`-ээр нуух нь ХАНГАЛТГҮЙ: MapView нь эдгээр 3D давхаргыг
   * дэмждэггүй тул зурагт БАЙХАД л «Failed to create layerview» өгнө. Тиймээс
   * горим биш үед бүрмөсөн ХАСНА.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of SCENE.layers) {
      const id = `scene:${m.key}`;
      const existing = map.findLayerById(id);
      if (dim === '3d' && !existing) {
        // Индекс 1 — ортофотогийн дараа, вектор давхаргуудын өмнө
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

  /**
   * BuildingExplorer виджет — ЗӨВХӨН BIM горимд.
   *
   * ⚠️ Дээрх effect-ийн ДАРАА байрлана: BIM давхаргууд газрын зурагт нэмэгдсэн
   * байх ёстой (React effect-үүд зарлагдсан дарааллаараа ажиллана). Виджет нь
   * тэдгээр давхаргаар давхар/дисциплин/категориор шүүх боломж өгнө.
   *
   * ⚠️ view дахин үүсэх (2D↔3D↔BIM солих) бүрд шинэ виджет хэрэгтэй тул хуучныг
   * заавал устгана — `view.destroy()` UI-г цэвэрлэдэг ч бид ref-ээ гар аргаар
   * тэглэхгүй бол устсан виджет рүү заасаар үлдэнэ.
   */
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
  }, [dim, ready]);

  /* Харагдац ба БҮСИЙН шүүлт */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = new Set(visibleKey ? visibleKey.split(',') : []);

    map.layers.forEach((l) => {
      if (l.id === IMAGERY_ID) { l.visible = true; return; }
      if (l.id.startsWith('scene:')) { l.visible = dim === '3d'; return; }
      if (l.id.startsWith('bim:')) { l.visible = dim === 'bim'; return; }

      l.visible = on.has(l.id);

      /**
       * Бүсийн шүүлт — `definitionExpression`-оор объектыг БҮРЭН хасна.
       *
       * ⚠️ `featureEffect` БИШ. Тэрийг ангиллын тодруулга эзэлдэг бөгөөд ArcGIS
       * давхаргад ганцхан `featureEffect` байдаг тул хоёуланг нэг дор хийвэл
       * сүүлд бичсэн нь нөгөөгөө чимээгүй устгана. `definitionExpression` нь
       * тусдаа механизм — хоёулаа зэрэг ажиллана.
       */
      const d = LAYER_BY_ID[l.id];
      if (d && 'definitionExpression' in l) {
        (l as FeatureLayer).definitionExpression =
          zone && !d.noZone ? `${ZONE_FIELD} = ${sqlStr(zone)}` : (null as unknown as string);
      }
    });
  }, [visibleKey, dim, ready, zone]);

  /** 3D/BIM загвар ачаалагдсан эсэх — CORS/сүлжээний асуудлыг ил хэлнэ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !is3D(dim)) { setMeshError(null); return; }
    const ids = dim === 'bim'
      ? BIM.layers.map((b) => b.key)
      : SCENE.layers.map((m) => `scene:${m.key}`);
    const layers = ids.map((id) => map.findLayerById(id)).filter((l): l is Layer => l != null);
    if (!layers.length) { setMeshError(null); return; }
    let alive = true;
    Promise.allSettled(layers.map((l) => l.load())).then((rs) => {
      if (!alive) return;
      const failed = rs.filter((r) => r.status === 'rejected').length;
      setMeshError(failed === 0 ? null : failed);
    });
    return () => { alive = false; };
  }, [dim, ready]);

  return (
    <div className={s.wrap}>
      <div ref={el} className={s.view} />
      {!ready && <div className={s.loading}>Газрын зураг ачаалж байна…</div>}

      {meshError != null && dim === 'bim' && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert">
          <b className={s.warnTitle}>Барилгын загвар ачаалагдсангүй ({meshError})</b>
          <span>
            <code>tiles.arcgis.com</code> дээрх BuildingSceneLayer-т хандаж чадсангүй.
            Үйлчилгээ нийтэд ил байгаа эсэхийг шалгана уу.
          </span>
        </div>
      )}

      {meshError != null && dim === '3d' && (
        <div className={`${s.float} ${s.floatBR} ${s.warn}`} role="alert">
          <b className={s.warnTitle}>3D бодит загвар ачаалагдсангүй ({meshError})</b>
          <span>
            <code>arcgis.ubhub.mn:6443</code> руу хандаж чадсангүй. Сервер ажиллаж
            байгаа эсэх, CORS-ын <b>allowedOrigins</b>-д энэ хаяг байгаа эсэхийг шалгана уу.
          </span>
        </div>
      )}

      {/* Хулганы доорх объектын ТОВЧ мэдээлэл. Дэлгэрэнгүй нь дарахад
          баруун самбарт гарна — энд зөвхөн «энэ юу вэ» гэдгийг хэлнэ. */}
      {tip && <MapTip x={tip.x} y={tip.y} id={tip.id} attrs={tip.attrs} />}

      {/* ⚠️ Газрын зураг дээрх «Тайлбар» хайрцгийг ХАССАН: давхаргын каталог
          багана нь симбол, тоо, өртгийг аль хэдийн хажууд нь харуулж байгаа тул
          зураг дээр үгээр давтах нь зургийн талбайг л иддэг байв. */}
      {children}
    </div>
  );
}

/* ─────────────────── Товч мэдээллийн хайрцаг ─────────────────── */

/**
 * Хулганы доорх объектын ТОВЧ мэдээлэл.
 *
 * ⚠️ Талбарууд нь каталогийн тодорхойлолтоос гарна (`qty`, `facets`) — давхарга
 * бүрд гар аргаар бичихгүй. Хяналтын хоёр давхарга нь ерөнхий загварт багтахгүй
 * тул тэдгээрт л онцгой мөрүүд нэмнэ.
 *
 * ⚠️ Байрлалыг `transform`-оор шилжүүлж хүрээнээс гаргахгүй: `right`/`bottom`
 * тооцоолохын тулд хайрцгийн хэмжээг мэдэх шаардлагатай болох ба энэ нь рендер
 * бүрд `offsetWidth` уншиж, layout thrash үүсгэнэ.
 */
function MapTip({
  x, y, id, attrs,
}: {
  x: number;
  y: number;
  id: string;
  attrs: Record<string, unknown>;
}) {
  const d = LAYER_BY_ID[id];
  if (!d) return null;

  const rows: { k: string; v: string }[] = [];

  if (d.qty && attrs[d.qty.field] != null) {
    const q = Number(attrs[d.qty.field]);
    rows.push({
      k: d.qty.unit === 'м²' ? 'Талбай' : 'Урт',
      v: d.qty.unit === 'м²' ? `${num(q / 10_000, 2)} га` : `${num(q, 1)} ${d.qty.unit}`,
    });
  }

  if (d.id === 'mon:building') {
    const F = BUILDING.fields;
    const g = Number(attrs[F.progress] ?? -1);
    rows.push({ k: 'Блок', v: text(attrs[F.block]) });
    rows.push({ k: 'Гүйцэтгэл', v: g < 0 ? '—' : pct(g, 0) });
    rows.push({ k: 'Айл', v: num(Number(attrs[F.households] ?? 0)) });
    rows.push({ k: 'Гүйцэтгэгч', v: text(attrs[F.contractor]) });
  } else if (d.id === 'mon:survey') {
    const F = SURVEY.fields;
    rows.push({ k: 'Огноо', v: date(attrs[F.date] as string) });
    rows.push({ k: 'Барилга', v: text(attrs[F.building]) });
    rows.push({ k: 'Гүйцэтгэл', v: pct(Number(attrs[F.total] ?? 0), 0) });
  } else {
    for (const f of (d.facets ?? []).slice(0, 3)) {
      if (attrs[f.field] == null || String(attrs[f.field]).trim() === '') continue;
      rows.push({ k: f.label, v: text(attrs[f.field]) });
    }
    const zoneId = text(attrs[ZONE_FIELD], '').trim();
    if (zoneId && zoneId !== ZONE_NONE.trim()) rows.push({ k: 'Бүс', v: zoneId });
  }

  return (
    <div
      className={s.tip}
      style={{ left: x, top: y, '--tone': d.hue } as CSSProperties}
      aria-hidden
    >
      <div className={s.tipHead}>{d.title}</div>
      {rows.length > 0 && (
        <dl className={s.tipRows}>
          {rows.map((r) => (
            <div key={r.k}>
              <dt>{r.k}</dt>
              <dd className="num">{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={s.tipHint}>дарж дэлгэрэнгүйг харна</div>
    </div>
  );
}

export { OID };

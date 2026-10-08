/**
 * 3D/BIM ЗУРАГЛАЛЫН ГОРИМ — «Хурдан» (АНХДАГЧ) ↔ «Нарийн» (⚠️ 2026-10-04, 3D/BIM гүйцэтгэл).
 *
 * ⚠️ ЯАГААД: UBHUB-ийн 58 BIM үйлчилгээ LOD-ГҮЙ (root + навч mesh л) тул SDK камерын зайнаас
 *    үл хамааран БҮХ геометрийг татаж зурдаг. 2026-10-04-нд nodepages-ийг нэг бүрчлэн тоолов:
 *    нийт ~586 сая орой / ~19,000 node, үүний 452 сая (77%) / 10,214 node нь `GenericModel`
 *    (IFC `buildingelementpart` — хана/хавтангийн ҮЕ ДАВХАРГА, фасадын өнгөлгөө). Хуучин
 *    (`high` + бүх Architectural) горимд BIM руу орсноос хойш 60с-д 6,200 хүсэлт / 70 МБ,
 *    60с-д ч дуусдаггүй, орбит кадр медиан 150 мс (≈6 fps). Сервер LOD-той дахин нийтлэгдэх
 *    хүртэл хөшүүрэг нь МАНАЙ талд — юуг, ямар чанараар зурах.
 * ⚠️ «Нарийн» = 2026-10-04-ний ӨМНӨХ зан ЯГ ХЭВЭЭР (`high`, бүх Architectural хүүхэд асаалттай —
 *    MapCanvas-ийн «Architectural үргэлж асаалттай» ⚠️). Хэрэглэгчийн өмнөх шийдвэрүүд тэнд л.
 * ⚠️ «Хурдан» = (1) `qualityProfile: 'medium'` — SDK-ийн өөрийн профайл: AO, тусгал, antialias
 *    унтраалттай, pixelRatio ≤ 1, санах ойн хязгаар бага; (2) үүл 0 · од унтраалттай · сүүдэргүй;
 *    (3) камерын өндөр ≤ `FAST_ALT_MAX` (бүх хотыг татуулах хол зай руу гарахгүй); (4) BIM-д
 *    Map-д ЗӨВХӨН камерт ойр `BIM_BUDGET` барилга (`manageBim`), тэдгээрт гадна бүрхүүл (`SHELL`)
 *    ирмэггүй (`noEdges`), хамгийн ойр ≤`NEAR_MAX`-д бүрэн гадна төрх (`NEAR_EXTRA`).
 *    Хэмжилт (RTX 3050, BIM орсноос хойш): 60с-д 6,207 хүсэлт / 70 МБ → 2,885 / 20 МБ; бүрэн
 *    ачаалагдах ∞ (60с-д дуусдаггүй) → 12с; GPU 1,109 → 88 МБ; орбит медиан 150 → 17 мс.
 * ⚠️ localStorage-д хувь хүний тохиргоо (`MESH_VER_KEY`-тэй ижил загвар) — бүх уншилт/бичилт
 *    try/catch-тэй (хувийн цонх, хаалттай хадгалалтад анхдагч «Хурдан» руу унана).
 * ⚠️ 3D КЛАССЫН RUNTIME импортгүй (SceneView/BuildingSceneLayer — `import type` л) — `lazy3d.ts`-ийн
 *    ⚠️: MapTools (статик граф) энэ файлыг импортолдог тул 3D модулийг 2D хэрэглэгч рүү чирэхгүй.
 *    Runtime импорт нь зөвхөн React ба `reactiveUtils` (MapCanvas-ийн статик графт аль хэдийн бий).
 */
import { useSyncExternalStore } from 'react';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import type SceneView from '@arcgis/core/views/SceneView';
import type BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';

export type Render3d = 'fast' | 'fine';

/** `localStorage` түлхүүр — 3D/BIM зураглалын горим */
const KEY = 'selbe-render3d';

let cur: Render3d | null = null;
const subs = new Set<() => void>();

const read = (): Render3d => {
  try { return window.localStorage.getItem(KEY) === 'fine' ? 'fine' : 'fast'; } catch { return 'fast'; }
};

/** Одоогийн горим (синхрон — эффект/ref дотор) */
export const getRender3d = (): Render3d =>
  (cur ??= typeof window === 'undefined' ? 'fast' : read());

export function setRender3d(v: Render3d): void {
  if (getRender3d() === v) return;
  cur = v;
  try { window.localStorage.setItem(KEY, v); } catch { /* хадгалахгүй ч ажиллана */ }
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/* ⚠️ Статик export — серверийн снапшот «Хурдан»; клиент localStorage-оос уншаад зөрвөл React
   өөрөө дахин зурна (hydration-д алдаа гаргахгүй — `useSyncExternalStore`-ийн зан). */
export const useRender3d = (): Render3d => useSyncExternalStore(subscribe, getRender3d, () => 'fast');

/* ══════════════════════ SceneView ══════════════════════ */

/**
 * «Хурдан»-д камерын хамгийн их өндөр (м, далайн түвшнээс). Газар ~1350 м, анхны камер 2600 м,
 * төслийн талбай ~1.6 × 2.2 км — 8 км-ээс дээш BIM/меш цэг төдий харагдах ч SDK тэр бүх
 * хүрээний tile/node-ийг татна.
 */
export const FAST_ALT_MAX = 8000;

type ViewPrev = { altMax: number; stars: boolean; weather: SceneView['environment']['weather']; shadows: boolean };
/** View бүрийн АНХНЫ утга — «Нарийн» руу буцахад ЯГ сэргээнэ (view дахин ашиглагддаг: `mapPark`) */
const viewPrev = new WeakMap<object, ViewPrev>();

/** Шинэ SceneView-д өгөх профайл — үүсгэх агшинд зөв профайлтай (дараа нь солих нь дахин тохируулга) */
export const profileFor = (m: Render3d): SceneView['qualityProfile'] => (m === 'fast' ? 'medium' : 'high');

/**
 * SceneView-ийн чанарын тохиргоо. Идемпотент — горим солигдох/view дахин авах бүрд дуудна.
 * ⚠️ «Нарийн»-ий профайл ҮРГЭЛЖ `'high'` — MapCanvas/SuitMap хоёулаа урьд нь түүгээр үүсгэдэг байв.
 */
export function applyView3d(view: SceneView, m: Render3d): void {
  if (view.destroyed) return;
  const env = view.environment;
  const light = env.lighting as { directShadowsEnabled?: boolean };
  let prev = viewPrev.get(view);
  if (!prev) {
    prev = {
      altMax: view.constraints.altitude.max,
      stars: env.starsEnabled,
      weather: env.weather,
      shadows: light.directShadowsEnabled === true,
    };
    viewPrev.set(view, prev);
  }
  if (m === 'fast') {
    if (view.qualityProfile !== 'medium') view.qualityProfile = 'medium';
    env.starsEnabled = false;
    /* ⚠️ Үүлийг ШИНЭ объектоор — анхдагч weather инстанцыг view-үүд ХУВААЛЦДАГ (2026-10-04: түүнийг
       шууд 0 болгоход дараагийн view-ийн «анхны» утга 0 болж «Нарийн» үүлээ сэргээхээ больсон) */
    if (env.weather === prev.weather && prev.weather?.type === 'sunny') env.weather = { type: 'sunny', cloudCover: 0 };
    if (light.directShadowsEnabled) light.directShadowsEnabled = false;
    view.constraints.altitude.max = Math.min(prev.altMax, FAST_ALT_MAX);
  } else {
    if (view.qualityProfile !== 'high') view.qualityProfile = 'high';
    env.starsEnabled = prev.stars;
    if (env.weather !== prev.weather) env.weather = prev.weather as never;
    if (prev.shadows && !light.directShadowsEnabled) light.directShadowsEnabled = true;
    view.constraints.altitude.max = prev.altMax;
  }
}

/* ══════════════════════ BIM (BuildingSceneLayer) ══════════════════════ */

/**
 * «Хурдан»-ы ГАДНА БҮРХҮҮЛ — modelName-ээр (дэд давхаргын `id` үйлчилгээ бүрд ӨӨР: GenericModel
 * нэгд 2, нөгөөд 3). 2026-10-04-ний тоолол (58 үйлчилгээ, сая орой): Walls 6.3 · Slabs 1.5 ·
 * Windows 16.1 · Plates 36.2 (Багц 1-ийн `_117` 5 загварын фасад — тэдэнд Walls/Slabs БАЙХГҮЙ) ·
 * Site/Roofs/Columns/Beams/CurtainWall* < 2.
 * ⚠️ ХАСАГДСАН: GenericModel 452 (хана/хавтангийн давхарга — бүрхүүлийн ДАВХАРДАЛ, гэхдээ
 *    фасадын өнгө/дээврийн өнгөлгөө ЭНД тул ойрын ≤`NEAR_MAX` барилгад `manageBim` буцаана) · Railings 21.5 ·
 *    Doors 14.6 (ихэнх нь дотор хаалга) · OpeningElement 2.1 (нүхний эзлэхүүн — үйлчилгээ өөрөө
 *    нуудаг) · Stairs 0.5. StructuralFraming (20.1) нь Structural бүлэгт — бүлэг нь үйлчилгээний
 *    анхдагчаар НУУГДМАЛ, «Хурдан» ч хөндөхгүй.
 */
const SHELL = new Set([
  'Walls', 'Slabs', 'Floors', 'Roofs', 'Columns', 'Beams', 'StructuralFraming', 'Plates',
  'CurtainWallPanels', 'CurtainWallMullions', 'Windows', 'Site',
]);
/** Ойрын барилгад бүрхүүл дээр НЭМЭГДЭХ — фасадын өнгө, дээвэр (`GenericModel` = buildingelementpart) */
const NEAR_EXTRA = new Set(['GenericModel']);

type Sym = { symbolLayers?: { forEach: (f: (sl: { edges?: unknown }) => void) => void } | null } | null | undefined;
type Rend = { clone: () => Rend; symbol?: Sym; defaultSymbol?: Sym; uniqueValueInfos?: { symbol?: Sym }[] | null };
type Sub = { visible: boolean; modelName?: string | null; type?: string; renderer?: Rend | null; load?: () => Promise<unknown> };
/** Дэд давхарга бүрийн ҮЙЛЧИЛГЭЭНИЙ анхдагч — «Нарийн» руу буцахад суурь (давхарга кэштэй: `bimCache`) */
const subPrev = new WeakMap<object, boolean>();

/**
 * ИРМЭГГҮЙ RENDERER — «Хурдан»-д.
 * ⚠️ ЯАГААД: 58 үйлчилгээний БҮХ дэд давхарга `drawingInfo`-доо `edges: solid 0.75px` (60% тунгалаг)
 *    зарладаг. 2026-10-04-ний профайл («Хурдан» бүрхүүлтэй ч орбит медиан 117 мс): кадрын CPU-ийн
 *    ~17% нь `EdgeRenderer`/`EdgeView` (+ ирмэгт зориулсан гүний дамжлага), үлдсэн нь draw call
 *    бүрийн материал/шейдер сонголт (`ComponentMaterial.acquireTechnique`). Ирмэгийг хасахад ДАМЖЛАГА
 *    бүхэлдээ алга болно. Өнгө ХЭВЭЭР: эх renderer-ийг `clone()` хийж ЗӨВХӨН `edges`-ийг хасна
 *    (fill `multiply` цагаан — эх өнгө). «Нарийн»-д эх renderer-ийг ЯГ буцаана (`rendPrev`).
 */
const rendPrev = new WeakMap<object, Rend | null>();
const edgeless = new WeakSet<object>();
const noEdges = (r: Rend): Rend => {
  const c = r.clone();
  for (const sym of [c.symbol, c.defaultSymbol, ...(c.uniqueValueInfos ?? []).map((u) => u.symbol)]) {
    sym?.symbolLayers?.forEach((sl) => { if (sl.edges) sl.edges = null; });
  }
  return c;
};
/** «Хурдан»-д ирмэггүй байх ЁСТОЙ дэд давхарга — хоцорсон `load()`-ийн хариу горимтой тулгана */
const wantEdgeless = new WeakMap<object, boolean>();
const setEdges = (s: Sub, on: boolean) => {
  wantEdgeless.set(s, !on);
  if (on) {
    if (!edgeless.has(s)) return;
    edgeless.delete(s);
    s.renderer = rendPrev.get(s) ?? null;
    return;
  }
  if (edgeless.has(s)) return;
  /* ⚠️ Дэд давхаргын renderer нь ӨӨРИЙН метадатад (`sublayers/N`) — давхарга `when()` болоход
     ачаалагдаагүй байж болно (2026-10-04: эхний хувилбар renderer `null` уншаад ирмэгийг ҮЛДЭЭЖ
     байв). Ачаалагдсаны дараа дахин; харагдах дэд давхаргыг SDK ямар ч байсан ачаална. */
  if (!s.renderer) {
    if (s.visible) s.load?.().then(() => { if (wantEdgeless.get(s)) setEdges(s, false); }).catch(() => {});
    return;
  }
  if (!rendPrev.has(s)) rendPrev.set(s, s.renderer);
  const r = rendPrev.get(s);
  if (!r) return;
  s.renderer = noEdges(r);
  edgeless.add(s);
};

/**
 * BIM давхаргын дэд давхаргуудыг горимоор тавина. `layer.when()`-ий ДАРАА дуудна (⚠️ тэр
 * хүртэл `allSublayers` хоосон).
 * @param archOn «Нарийн»-д Architectural бүлэг + бүх хүүхдийг асаах эсэх (MapCanvas: true —
 *   хэрэглэгчийн шийдвэр; SuitMap: false — үйлчилгээний анхдагч).
 * @param near «Хурдан»-д энэ барилга камерт ойр эсэх — бүрэн гадна төрх (`NEAR_EXTRA`).
 */
export function applyBimMode(layer: BuildingSceneLayer, m: Render3d, archOn: boolean, near = false): void {
  if (layer.destroyed) return;
  const all = layer.allSublayers.toArray() as unknown as Sub[];
  for (const s of all) if (!subPrev.has(s)) subPrev.set(s, s.visible);
  const set = (s: Sub, v: boolean) => { if (s.visible !== v) s.visible = v; };
  if (m === 'fine') {
    for (const s of all) {
      const mn = s.modelName ?? '';
      /* ⚠️ FullModel/Overview — BuildingExplorer виджет (`showFullModel`) урьд нь ҮРГЭЛЖ FullModel-ийг
         асааж Overview-г унтраадаг байв; үйлчилгээний JSON нь эсрэгээрээ (Overview: true) тул
         snapshot-оос сэргээвэл Overview-ийн каркас бүрэн загвартай ДАВХАР гарна (2026-10-04, шалгав). */
      set(s, /^FullModel$/i.test(mn) ? true : mn === 'Overview' ? false : (subPrev.get(s) ?? s.visible));
      setEdges(s, true);
    }
    if (!archOn) return;
    /* MapCanvas-ийн «ARCHITECTURAL ҮРГЭЛЖ АСААЛТТАЙ» ⚠️ — бүлэг ба хүүхдүүдийг ХОЁУЛАНГ нь */
    const arch = all.find((s) => /architectural/i.test(s.modelName ?? ''));
    if (!arch) return;
    set(arch, true);
    const kids = (arch as unknown as __esri.BuildingGroupSublayer).sublayers;
    kids?.forEach((k) => set(k as unknown as Sub, true));
    return;
  }
  for (const s of all) {
    const mn = s.modelName ?? '';
    if (s.type === 'building-group') {
      /* Бүлэг: FullModel · Architectural асаалттай (бүрхүүл тэнд), бусад бүлэг анхдагчаараа */
      set(s, /^(FullModel|Architectural)$/i.test(mn) ? true : (subPrev.get(s) ?? s.visible));
    } else if (mn === 'Overview') {
      /* ⚠️ Overview нь эдгээр үйлчилгээнд ЦОНХНЫ КАРКАС төдий (хоёр блоктойд 1–7 мянган орой) —
         барилга шиг харагддаггүй тул хэзээ ч асаахгүй (2026-10-04, дэлгэцийн зургаар шалгав) */
      set(s, false);
    } else {
      set(s, SHELL.has(mn) || (near && NEAR_EXTRA.has(mn)));
      setEdges(s, false);
    }
  }
}

/**
 * «ХУРДАН»-Ы BIM ТӨСӨВ — газрын зурагт ЗЭРЭГ байх BIM давхаргын дээд тоо (⚠️ 2026-10-04, хэмжилт).
 *
 * ⚠️ ЯАГААД давхаргыг Map-аас ХАСДАГ вэ (нуух биш): BuildingSceneLayer бүр ~12 дэд давхаргын
 *    view-тэй бөгөөд тэд камер хөдлөх БҮРД (нуугдсан/suspended ч) accessor-ийн tracking-аар
 *    дахин тооцоолно. Хэмжилт (RTX 3050, орбитын кадр медиан): 58 давхарга бүрхүүлтэй 111 мс ·
 *    58 БҮГД НУУГДМАЛ 27.7 мс (!) · 10 давхарга Map-д 11–17 мс · 0 давхарга 5.6 мс. Тиймээс
 *    камерт хамгийн ойр `BIM_BUDGET` барилга л Map-д; бусад нь `bimCache`-д амьд үлдэж (метадата
 *    дахин татахгүй), буцаж нэмэгдэхэд геометр нь хөтчийн HTTP кэшээс (`max-age=86400`) ирнэ.
 * ⚠️ Алс барилгын оронд MapCanvas нь 2D-ийн extrude барилгыг (`scene3d:4`) ХАРУУЛНА (`onShown`).
 * ⚠️ `BIM_HYST` — хил дээрх барилга камер бага зэрэг хөдлөхөд нэмэгдэж/хасагдаж «анивчихгүй»:
 *    аль хэдийн зурагт буй нь дараалалдаа `BIM_BUDGET + BIM_HYST` дотор байвал үлдэнэ.
 */
export const BIM_BUDGET = 14;
const BIM_HYST = 4;

/**
 * «Хурдан»-д БҮРЭН ГАДНА ТӨРХТЭЙ (`NEAR_EXTRA`) зурах ойрын барилга — камераас `NEAR_M` метр
 * дотор, хамгийн ойр `NEAR_MAX`. ⚠️ Нэг GenericModel = 4–24 сая орой, 90–320 node: олныг зэрэг
 * асаавал хуучин удаашрал буцна.
 */
export const NEAR_M = 420;
export const NEAR_MAX = 3;

type Ranked = { id: string; d: number };

/**
 * Ачаалагдсан BIM-ийг камераас газрын бодит МЕТРЭЭР эрэмбэлнэ. Зөвхөн ДЭЛГЭЦЭНД (25%-ийн захтай)
 * буух нь — ар талын барилгад төсөв зарцуулахгүй; нэг ч байхгүй бол бүгдээс хамгийн ойр нь.
 * ⚠️ `view.extent`-ээр БИШ: хазайсан (tilt 62°) камерт тэр нь бодит харагдах талбайгаас ЖИЖИГ —
 *    2026-10-04-нд дэлгэцийн дээд хэсгийн барилгууд төсвөөс хасагдаж «алга» болж байв. Төв цэгийг
 *    `toScreen`-ээр буулгаж + камерын чиглэлийн ард (dot < 0) байгааг хасна (ар талын цэг ч
 *    дэлгэц рүү «толин» буудаг).
 * ⚠️ Web Mercator: масштабын коэффициент 1/cos(φ) — x/y-г cos(φ)-ээр үржүүлж метр болгоно.
 * ⚠️ 2026-10-09: урьд нь давхаргын `fullExtent` ба харагдацыг ҮРГЭЛЖ Web Mercator гэж үздэг байв —
 *    WGS84 (градус) экстенттэй BIM-ийн төвийг метртэй шууд хасаж, бүх зай ~сая метр болж эрэмбэ
 *    санамсаргүй болдог. Одоо экстентийн SR харагдацынхаас өөр бол `webMercatorUtils`-ээр (синхрон,
 *    WGS84 ↔ WM) харагдацын SR руу буулгана; буулгах боломжгүй бол хуучин зан (шууд) — эрэмбээс
 *    хасвал «Хурдан» горимд тэр барилга ХЭЗЭЭ Ч харагдахгүй болно. Масштаб нь харагдацын SR-ээс:
 *    WM → cos(φ), газарзүйн → градусын метр, бусад (проекцтой) → 1.
 */
export function rankBim(view: SceneView, layers: { id: string | number; fullExtent?: __esri.Extent | null }[]): Ranked[] {
  const p = view.camera?.position;
  if (!p) return [];
  const vsr = view.spatialReference;
  const geo = !!vsr?.isGeographic;
  const lat = geo ? (p.y * Math.PI) / 180 : Math.atan(Math.sinh(p.y / 6378137));
  /** Харагдацын SR-ийн нэгж → метр (x, y тус тусдаа — газарзүйн SR-д ялгаатай) */
  const wm = vsr == null || vsr.isWebMercator;
  const kx = geo ? 111_320 * Math.cos(lat) : (wm ? Math.cos(lat) : 1);
  const ky = geo ? 110_574 : (wm ? Math.cos(lat) : 1);
  const toView = (c: __esri.Point): __esri.Point => {
    const sr = c.spatialReference;
    if (!sr || !vsr || sr.equals(vsr)) return c;
    if (webMercatorUtils.canProject(sr, vsr)) return (webMercatorUtils.project(c, vsr) as __esri.Point | null) ?? c;
    return c;
  };
  const w = view.width || 0;
  const h = view.height || 0;
  const mx = w * 0.25;
  const my = h * 0.25;
  const hd = ((view.camera.heading ?? 0) * Math.PI) / 180;
  const fx = Math.sin(hd);
  const fy = Math.cos(hd);
  const all: (Ranked & { inView: boolean })[] = [];
  for (const l of layers) {
    const c0 = l.fullExtent?.center;
    if (!c0) continue;
    const c = toView(c0);
    const dx = (c.x - p.x) * kx;
    const dy = (c.y - p.y) * ky;
    const dz = c.z != null && p.z != null ? c.z - p.z : 0;
    const sp = w && h && dx * fx + dy * fy > 0 ? view.toScreen(c) : null;
    all.push({
      id: String(l.id),
      d: Math.hypot(dx, dy, dz),
      inView: !!sp && sp.x > -mx && sp.x < w + mx && sp.y > -my && sp.y < h + my,
    });
  }
  const vis = all.filter((r) => r.inView);
  return (vis.length ? vis : all).sort((a, b) => a.d - b.d);
}

/**
 * BIM ДАВХАРГЫН УДИРДЛАГА — MapCanvas ба SuitMap хоёулаа (эффект дотроос) дуудна; буцаах функц нь
 * cleanup. `all` — Map-ын БҮХ 58 инстанц (`bimCache`, Map-д байгаа эсэхээс үл хамаарна).
 *   · «Нарийн»: урьдын зан — бүгд Map-д, `applyBimMode(fine)`.
 *   · «Хурдан»: метадатыг (service+layer, давхарга бүрд 2 хүсэлт) ачаалж, камер ЗОГСОХ бүрд
 *     `rankBim` → эхний `BIM_BUDGET` (+ hysteresis) Map-д, бусад нь хасагдана; ойрын ≤`NEAR_MAX`
 *     бүрэн гадна төрхтэй. Кадр бүрд ажил НЭМЭХГҮЙ (зөвхөн `stationary`).
 * ⚠️ Давхарга Map-д НЭМЭХ/ХАСАХ ганц эзэн нь энэ (BIM горимд) — `dim` солигдоход хасах нь
 *    MapCanvas/SuitMap-ийн 3D давхаргын эффектэд хэвээр.
 * @param onShown Map-д байгаа BIM-ийн id-ууд өөрчлөгдөх бүрд (MapCanvas: доорх extrude барилгыг шүүх).
 */
export function manageBim(o: {
  view: SceneView;
  map: { layers: { includes: (l: never) => boolean }; add: (l: never) => void; remove: (l: never) => void };
  all: BuildingSceneLayer[];
  m: Render3d;
  archOn: boolean;
  onShown?: (ids: ReadonlySet<string>) => void;
}): () => void {
  const { view, map, all, m, archOn, onShown } = o;
  let stale = false;
  let near = new Set<string>();
  let shown = new Set<string>();
  /** Энэ горимоор дэд давхарга нь ТАВИГДСАН (Map-д буй) давхарга — «Нарийн»-аас ирэхэд Map-д үлдсэн
      давхаргыг ч заавал дахин тавина (2026-10-04: эхний хувилбар тэднийг «Нарийн»-ий тохиргоотой үлдээж байв) */
  const applied = new Set<string>();
  const inMap = (l: BuildingSceneLayer) => map.layers.includes(l as never);
  const apply = (l: BuildingSceneLayer) => applyBimMode(l, m, archOn, near.has(String(l.id)));

  if (m === 'fine') {
    /* Урьдын зан: 58 бүгд Map-д (`BIM.layers`-ийн дарааллаар) */
    for (const l of all) if (!inMap(l)) map.add(l as never);
    shown = new Set(all.map((l) => String(l.id)));
    onShown?.(shown);
    // ⚠️ Алдааг залгина — нэг барилга ачаалагдахгүй бол бусад нь хэвийн
    for (const l of all) l.when(() => { if (!stale) apply(l); }).catch(() => {});
    return () => { stale = true; };
  }

  const pick = () => {
    if (stale || view.destroyed) return;
    const ranked = rankBim(view, all.filter((l) => l.loaded));
    const next = new Set(ranked.slice(0, BIM_BUDGET).map((r) => r.id));
    for (const r of ranked.slice(BIM_BUDGET, BIM_BUDGET + BIM_HYST)) if (shown.has(r.id)) next.add(r.id);
    const nextNear = new Set(ranked.filter((r) => r.d <= NEAR_M).slice(0, NEAR_MAX).map((r) => r.id));
    const touch: BuildingSceneLayer[] = [];
    let deferred = false;
    for (const l of all) {
      const id = String(l.id);
      if (!next.has(id)) {
        if (!inMap(l)) { applied.delete(id); continue; }
        /* ⚠️ LayerView нь ҮҮСЧ ДУУСААГҮЙ давхаргыг хасахгүй — SDK 4.34-ийн `BuildingSceneLayerView3D`
           `_rejectWhenSublayerView` дотор `null.set` TypeError + AbortError-ийг БАРИГДААГҮЙ
           (unhandledrejection) шиддэг (2026-10-04, горимыг дахин дахин солих туршилтаар баталсан). Үүссэний
           дараа хасна — дараагийн эрэмбэлэлтийг 800 мс-ийн дараа дахин. */
        /* ⚠️ 2026-10-09: ачаалал УНАСАН (`loadStatus === 'failed'`) эсвэл LayerView үүсгэх нь
           ТАТГАЛЗСАН (`lvFailed`) давхаргад LayerView ХЭЗЭЭ Ч үүсэхгүй — урьд нь тийм давхарга Map-д
           мөнх үлдэж, 800 мс-ийн дахин оролдлого зогсолтгүй давтагддаг байв. Тэдгээрийг шууд хасна. */
        const lvGone = l.loadStatus === 'failed' || lvFailed.has(id);
        if (!lvGone && !view.allLayerViews.some((lv) => lv.layer === (l as unknown))) {
          deferred = true;
          watchLv(l);
          continue;
        }
        map.remove(l as never);
        applied.delete(id);
        continue;
      }
      if (!inMap(l)) map.add(l as never);
      if (!applied.has(id) || near.has(id) !== nextNear.has(id)) touch.push(l);
    }
    near = nextNear;
    for (const l of touch) { apply(l); applied.add(String(l.id)); }
    const changed = next.size !== shown.size || [...next].some((id) => !shown.has(id));
    shown = next;
    if (changed) onShown?.(shown);
    /* ⚠️ 2026-10-09: дахин оролдлого ХЯЗГААРТАЙ (`RETRY_MAX`) — хойшлуулалтгүй эрэмбэлэлт тоолуурыг
       тэглэнэ; хязгаарт хүрвэл дараагийн `stationary` хүртэл зогсоно. */
    if (!deferred) tries = 0;
    else if (!retry && tries < RETRY_MAX) { tries++; retry = setTimeout(() => { retry = null; soon(); }, 800); }
  };
  const RETRY_MAX = 10;
  let tries = 0;
  /** LayerView үүсгэх нь татгалзсан давхаргууд (id) */
  const lvFailed = new Set<string>();
  const lvWatched = new Set<string>();
  const watchLv = (l: BuildingSceneLayer) => {
    const id = String(l.id);
    if (lvWatched.has(id)) return;
    lvWatched.add(id);
    view.whenLayerView(l as never).catch(() => { if (!stale) { lvFailed.add(id); soon(); } });
  };
  /* Метадата ачаалагдах бүрд биш — 120 мс-ээр багцалж нэг удаа эрэмбэлнэ */
  let t: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const soon = () => { if (!t) t = setTimeout(() => { t = null; pick(); }, 120); };
  /* Өмнөх горимоос үлдсэн (Map-д байгаа) давхарга — эхний эрэмбэлэлт хүртэл хэвээр, дараа нь төсвөөр */
  shown = new Set(all.filter(inMap).map((l) => String(l.id)));
  for (const l of all) l.load().then(() => { if (!stale) soon(); }).catch(() => {});
  const h = reactiveUtils.watch(() => view.stationary, (st) => { if (st) { tries = 0; soon(); } });
  return () => { stale = true; h.remove(); if (t) clearTimeout(t); if (retry) clearTimeout(retry); };
}

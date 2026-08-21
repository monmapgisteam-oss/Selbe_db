'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { MapCanvas, MapProvider, useMap, type Dim } from '@/components/MapCanvas';
import { t as tr } from '@/lib/i18nCore';
import { ViewRail } from '@/components/ViewRail';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import dynamic from 'next/dynamic';
import { Dashboard } from '@/modules/Dashboard';
import { Bagts } from '@/modules/Bagts';
import { Tsogts } from '@/modules/Tsogts';
import { Gazar } from '@/modules/Gazar';
import { Habea } from '@/modules/Habea';
import { Irged } from '@/modules/Irged';
import { Iot } from '@/modules/Iot';
/* ⚠️ ТОМ, ховор-эхний харагдацууд dynamic chunk (2026-08-21 гүйцэтгэлийн
   аудит): Suitability (analysis стек), Sheet/Pivot, Tailan (+reportPdf),
   Guitsetgel, Finance нийлээд Portal chunk-ийн parse хугацааг ~30-40%
   нэмдэг байв. Portal нөхцөлт рендэрлэдэг тул unmount үеийн зан өөрчлөгдөхгүй;
   эхний нээлтэд Booting-той ижил түр төлөв харагдана. */
const Suitability = dynamic(() => import('@/modules/analysis/Suitability').then((m) => m.Suitability), { ssr: false });
const Finance = dynamic(() => import('@/modules/Finance').then((m) => m.Finance), { ssr: false });
const Guitsetgel = dynamic(() => import('@/modules/Guitsetgel').then((m) => m.Guitsetgel), { ssr: false });
const Sheet = dynamic(() => import('@/modules/sheet/Sheet').then((m) => m.Sheet), { ssr: false });
const Tailan = dynamic(() => import('@/modules/Tailan').then((m) => m.Tailan), { ssr: false });
import { Icon } from '@/components/Icon';
import { DocViewer } from '@/components/DocViewer';
import { UserAdmin } from '@/components/UserAdmin';
import { LocaleToggle } from '@/components/LocaleToggle';
import { AgentButton, AgentChat } from '@/components/AgentChat';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { FilterProvider, useFilter } from '@/lib/filter';
import { usePlanTotals } from '@/lib/totals';
import { queryStats, count, sum } from '@/lib/query';
import { loadHeadline } from '@/lib/live';
import {
  DEFAULT_VIEW, VIEW_BY_KEY, layerUrl, oidOf, zoneWhere,
  PLAN_LAYER_IDS, CATALOG_LAYER_IDS, LAYER_BY_ID, groupOf,
  ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER, BUILT_FIELDS,
  type ViewKey,
} from '@/lib/services';
import { readParam, writeParams } from '@/lib/urlState';
import { num } from '@/lib/format';
import { ViewPanel } from '@/modules/ViewPanel';
import { BuildingSummary, MonitorTrend, useBuildings } from '@/modules/BuildingPanel';

import s from '@/app/shell.module.css';

/** Баруун самбарын өргөний хязгаар ба анхны утга (px) */
const PANEL_MIN = 300;
const PANEL_MAX = 720;
const PANEL_DEFAULT = 360;
const PANEL_KEY = 'selbe-panel-width';

/**
 * Зүүн каталогийн өргөний хязгаар ба анхны утга (px).
 *
 * ⚠️ Доод хязгаар нь `globals.css`-ийн `--catalog` (296px)-ээс бага: давхаргын
 * нэр урт (жишээ нь «Цахилгаан дамжуулах агаарын шугам 110кв») тул хэт нарийсгах
 * нь утгагүй ч, зураг дээр илүү зай гаргах хэрэгцээ бодитой.
 */
const CAT_MIN = 232;
const CAT_MAX = 560;
const CAT_DEFAULT = 296;
const CAT_KEY = 'selbe-catalog-width';

/** «Барилгын хяналт»-ын ЗҮҮН дундаж баганы өргөн (px) */
const MON_MIN = 240;
const MON_MAX = 620;
const MON_DEFAULT = 300;
const MON_KEY = 'selbe-monleft-width';

/** Зургийн доорх явцын муруйн зурвасын өндөр (px) */
const TREND_MIN = 140;
const TREND_MAX = 560;
const TREND_DEFAULT = 240;
const TREND_KEY = 'selbe-montrend-height';

/**
 * БАГАНА/МӨР ЧИРЭХ — самбар, каталог, зүүн багана, доод зурвас БҮГД үүнийг.
 *
 * ⚠️ `dir` нь чирэлтийн тэмдгийг заана: БАРУУН талын самбар зүүн тийш чирэхэд
 * өргөсдөг тул `-1`, ЗҮҮН талын каталог баруун тийш чирэхэд өргөсдөг тул `+1`.
 * `axis: 'y'` нь ӨНДӨР — зургийн доорх зурвас ДЭЭШ чирэхэд өндөрсдөг тул `-1`.
 * Бүгдэд нь нэг томьёо — ялгаа нь зөвхөн тэнхлэг ба тэмдэг.
 */
function useColumnResize(
  { min, max, initial, storageKey, dir, axis = 'x' }:
  { min: number; max: number; initial: number; storageKey: string; dir: 1 | -1; axis?: 'x' | 'y' },
) {
  const [width, setWidth] = useState(initial);
  const [dragging, setDragging] = useState(false);
  /**
   * ⚠️ Одоогийн өргөн REF-ээр давхар — `onPointerDown` render бүрт шинээр
   * үүсвэл `memo(LayerCatalog)` пропсын өөрчлөлт гэж үзэж дахин зурна.
   * Ref-ээс уншсанаар callback нь тогтмол лавлагаатай (useCallback) болно.
   */
  const widthRef = useRef(initial);

  // ⚠️ Зөвхөн эффект дотор: localStorage нь статик экспортын үед байхгүй
  useEffect(() => {
    const v = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(v) && v >= min && v <= max) { widthRef.current = v; setWidth(v); }
  }, [storageKey, min, max]);

  // ⚠️ Чирэлтийн ДУНДУУР компонент unmount болбол `up()` хэзээ ч ажиллахгүй,
  //    body-ийн класс үлдэж апп даяар курсор/текст сонголт эвдэрнэ (globals.css-ийн
  //    `body.resizing *`) — unmount дээр заавал цэвэрлэнэ.
  useEffect(() => () => { document.body.classList.remove('resizing', 'resizingRow'); }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const save = (w: number) => {
      try { localStorage.setItem(storageKey, String(w)); } catch { /* private mode */ }
    };
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    setDragging(true);
    const cls = axis === 'y' ? 'resizingRow' : 'resizing';
    document.body.classList.add(cls);

    const at = (ev: { clientX: number; clientY: number }) => (axis === 'y' ? ev.clientY : ev.clientX);
    const x0 = at(e);
    const w0 = widthRef.current;

    const move = (ev: PointerEvent) => {
      const w = Math.min(max, Math.max(min, w0 + dir * (at(ev) - x0)));
      widthRef.current = w;
      setWidth(w);
    };
    const up = () => {
      setDragging(false);
      document.body.classList.remove(cls);
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      save(widthRef.current);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }, [min, max, dir, axis, storageKey]);

  /** Давхар товшиход анхны өргөнд буцаана */
  const onDoubleClick = useCallback(() => {
    widthRef.current = initial;
    setWidth(initial);
    try { localStorage.setItem(storageKey, String(initial)); } catch { /* private mode */ }
  }, [initial, storageKey]);

  return { width, dragging, onPointerDown, onDoubleClick };
}

/**
 * Гадна бүрхүүл — зөвхөн контекстүүдийг өгнө.
 *
 * ⚠️ `FilterProvider` нь `useMap()`-ыг дуудах тул `MapProvider`-ын ДОТОР байх
 * ёстой. Мөн порталын агуулга `useFilter()`-ыг дуудах тул түүнээс ДООР байх
 * ёстой — иймд агуулгыг тусад нь салгав.
 */
export default function Portal(
  { onHome, navScope = 'all', docsAllowed = true, isSuper = false }:
    { onHome?: () => void; navScope?: 'all' | ViewKey[]; docsAllowed?: boolean; isSuper?: boolean } = {},
) {
  return (
    <MapProvider>
      {/* Нэвтрээд дашбоард (газрын зураг) бэлэн болтол ачаалалтын дэлгэц */}
      <Booting />
      <FilterProvider>
        <PortalContent onHome={onHome} navScope={navScope} docsAllowed={docsAllowed} isSuper={isSuper} />
      </FilterProvider>
    </MapProvider>
  );
}

/**
 * BOOTING — портал нээгдэхэд газрын зураг (view) бэлэн болтол ДҮҮРЭН ДЭЛГЭЦИЙН
 * ачаалалтын хэсэг харуулна. `useMap().view` нь `view.when()` (setReady) дээр л
 * тавигддаг тул түүнийг «дашбоард нээгдлээ» дохио болгоно. Эхний удаа бэлэн
 * болмогц дахин ХАРАГДАХГҮЙ (2D↔3D солиход анивчихгүй).
 */
function Booting() {
  const { view } = useMap();
  /**
   * ⚠️ Порталын зураггүй standalone харагдац (analysis, sheet, tailan, finance —
   * `layers: []`) context-д view ХЭЗЭЭ Ч бүртгэдэггүй тул хүлээх дохио ирэхгүй,
   * Booting 12с дэмий таглана — тэдгээрт ЭХНЭЭСЭЭ дууссан гэж үзнэ.
   * (useState-ийн initializer-т нэг удаа тооцно — hooks-ийн дараалал тогтвортой.)
   */
  const [done, setDone] = useState(() => {
    const v = VIEW_BY_KEY[initialView()];
    return !!v.standalone && !v.layers.length;
  });
  useEffect(() => {
    if (done) return;
    // ⚠️ Context дэх `view` нь dev StrictMode-ийн register(null) timing-ээс болж
    //    заримдаа хоцордог тул DOM-ийн `esri-view` бэлэн эсэхийг ч POLLING-оор
    //    шалгана. Аль нэг нь бэлэн болмогц (эсвэл дээд тал нь ~12с) хаана.
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      const el = document.querySelector('.esri-view') as (Element & { __esriView__?: { ready?: boolean } }) | null;
      const domReady = !!(el && el.__esriView__ && el.__esriView__.ready);
      if (domReady || !!view || tries > 40) setDone(true);
    }, 300);
    return () => clearInterval(iv);
  }, [view, done]);
  if (done) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 22, background: 'radial-gradient(120% 120% at 50% 30%, #0f1b2e 0%, #0a1220 60%, #070d18 100%)',
        color: '#e2e8f0',
      }}
    >
      <style>{'@keyframes selbeSpin{to{transform:rotate(360deg)}}@keyframes selbePulse{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" width={60} height={60} style={{ animation: 'selbePulse 1.8s ease-in-out infinite' }} />
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid rgba(148,197,255,0.18)', borderTopColor: '#38bdf8',
        animation: 'selbeSpin .9s linear infinite',
      }} />
      <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: 0.3 }}>{tr('Дашбоард ачаалж байна…')}</div>
      <div style={{ fontSize: 12.5, color: '#8aa0bd' }}>{tr('Сэлбэ 20 минутын хот · Digital Twin Platform')}</div>
    </div>
  );
}

/**
 * URL-аас эхлэх төлөвийг уншина (хуваалцсан холбоос, F5).
 * ⚠️ Portal нь `ssr:false` тул initializer-ууд ҮРГЭЛЖ хөтөч дээр ажиллана;
 * буруу/хуучирсан утгыг чимээгүй хаяж анхдагчид буцна — URL-аар апп эвдэхгүй.
 */
const initialView = (): ViewKey => {
  const v = readParam('v');
  return v && VIEW_BY_KEY[v as ViewKey] ? (v as ViewKey) : DEFAULT_VIEW;
};

const initialDim = (): Dim => {
  const d = readParam('d');
  return d === '3d' || d === 'bim' ? d : '2d';
};
const initialLayer = (): string | null => {
  const l = readParam('l');
  return l && LAYER_BY_ID[l] ? l : null;
};

function PortalContent(
  { onHome, navScope = 'all', docsAllowed = true, isSuper = false }:
    { onHome?: () => void; navScope?: 'all' | ViewKey[]; docsAllowed?: boolean; isSuper?: boolean },
) {
  /**
   * Газрын зураг ХОЁРХОН төрөлтэй: 2D = ортофото, 3D = меш. Суурийг энэ л шийднэ.
   */
  const [dim, setDim] = useState<Dim>(initialDim);

  /**
   * ХАРАГДАЦ — порталын гол удирдлага. Сонгоход зураг ба самбар ХОЁУЛАА солигдоно.
   * `visible` нь харагдацын анхны давхаргуудаар дүүрнэ; хэрэглэгч каталогоос
   * нэмж асаана.
   */
  const [view, setViewState] = useState<ViewKey>(initialView);
  const [visible, setVisible] = useState<string[]>(() => VIEW_BY_KEY[initialView()].initial);

  /**
   * Каталогийн багана нээлттэй эсэх ба самбарт задалж харуулах давхарга.
   *
   * ⚠️ Эхлэхэд каталогийг НЭЭХГҮЙ: анх орж ирсэн хүн зургаа хараагүй байхад
   * жагсаалт гарвал юуных болохыг нь мэдэхгүй. Хэрэглэгч өөрөө «Ерөнхий
   * мэдээлэл» дарахад нээгдэнэ.
   */
  // Давхаргын сонголт — «Давхарга» товчоор нээж/хаана.
  // ⚠️ 2026-08-18: зүүн БАГАНА байсныг зурган дээрх ХӨВӨГЧ POPUP болгов
  //    (хэрэглэгчийн шийдвэр) — идэвхжихэд зураг шахагдахгүй, дээр нь хөвнө.
  const [catalog, setCatalog] = useState(true);
  const [layer, setLayer] = useState<string | null>(initialLayer);

  /**
   * ЗҮҮН ЦЭС ХУРААГДСАН эсэх (хэрэглэгчийн шийдвэр, 2026-08-18) — хураахад
   * зөвхөн дүрс үлдэж 54px болно. Сонголт localStorage-д хадгалагдана.
   * ⚠️ Зөвхөн эффект дотор уншина — статик экспортод localStorage байхгүй.
   */
  const [navMin, setNavMin] = useState(false);
  useEffect(() => {
    try { setNavMin(localStorage.getItem('selbe-nav-min') === '1'); } catch { /* private */ }
  }, []);
  const toggleNav = useCallback(() => {
    setNavMin((v) => {
      try { localStorage.setItem('selbe-nav-min', v ? '0' : '1'); } catch { /* private */ }
      return !v;
    });
  }, []);

  /**
   * ТУНГАЛАГ — давхарга бүрийн opacity override (0–1) ба тохируулах цонх нээлттэй
   * эсэх. Override байхгүй давхарга эх webmap-ийн анхдагчаа хадгална.
   */
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [opacityOpen, setOpacityOpen] = useState(false);
  const closeOpacity = useCallback(() => setOpacityOpen(false), []);

  /** Сонгосон бүс — БҮХ давхарга, БҮХ тоо үүгээр шүүгдэнэ */
  const [zone, setZone] = useState<string | null>(() => readParam('z'));
  // Шүүлт солигдоход зураг тэр объектууд руу нисэнэ
  useZoomToFilter({ zone });
  const [picked, setPicked] = useState<Record<string, unknown> | null>(null);
  const [pickedLayer, setPickedLayer] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const { clear: clearFilter } = useFilter();

  /** ТЭЗҮ ба судалгааны баримт бичгийн глобал popup нээлттэй эсэх */
  const [docsOpen, setDocsOpen] = useState(false);
  /** Хэрэглэгчийн эрх удирдлагын modal (зөвхөн super admin) */
  const [adminOpen, setAdminOpen] = useState(false);
  /**
   * AI туслахын цонх нээлттэй эсэх.
   * ⚠️ Агент нь `navScope`-оор хязгаарлагдана — тэр нь хэрэглэгчийн үзэж болох
   * харагдацууд. Тиймээс эрхгүй хэсгийн давхаргыг агент ч харахгүй.
   */
  const [agentOpen, setAgentOpen] = useState(false);

  /**
   * Давхаргын тоо, хэмжээ — каталогийн багана, багцын тойм, давхаргын дашбоард
   * ГУРВУУЛАА эндээс уншина. Нэг эх сурвалж, нэг хүсэлтийн багц.
   *
   * ⚠️ «Барилгын хяналт»-д хяналтын хоёр давхарга НЭМЭГДЭНЭ: тэнд каталог
   * нээгдэх бөгөөд мөрүүд нь тоогоо харуулах ёстой.
   */
  /**
   * ⚠️ Тусдаа бүрэн дэлгэцтэй харагдац (дашбоард, анализ) нь порталын каталог,
   * самбарыг зурахгүй, өөрсдөө өгөгдлөө татна — тэдгээрт `usePlanTotals`-ыг
   * дуудахгүй (29 хүсэлт дэмий).
   */
  const standalone = !!VIEW_BY_KEY[view].standalone;

  const catalogIds = useMemo(
    // ⚠️ 2026-08-20: Каталог БҮХ давхаргыг харуулдаг болсон тул тоо/өртгийн
    //    жагсаалт нь түүнтэй ижил байх ёстой (эс бөгөөс шинэ мөрүүд «…» хэвээр).
    () => CATALOG_LAYER_IDS,
    [view],
  );
  // ⚠️ Зөвхөн каталог/самбартай харагдацуудад — дашбоард/анализ өөрсдөө татна
  const totals = usePlanTotals(zone, !standalone, catalogIds);

  const setView = useCallback((v: ViewKey) => {
    setViewState(v);
    // Харагдацын анхны давхаргууд ил — эхлэх байдал үргэлж утга учиртай
    setVisible(VIEW_BY_KEY[v].initial);
    // ⚠️ Өмнөх харагдацын сонголт шинэ давхаргын талбарын нэрсээр уншигдвал
    //    бүх мөр «Бүртгэгдээгүй» болно
    setPicked(null);
    setPickedLayer(null);
    setLayer(null);
    /**
     * Шүүлт нь өмнөх харагдацын давхаргын талбарын нэрээр бичигдсэн SQL. Үлдвэл
     * шинэ харагдацын давхаргад тэр талбар байхгүй тул ArcGIS хүсэлт бүхэлдээ
     * унаж, зураг чимээгүй хоосорно.
     */
    clearFilter();
    // ⚠️ Каталог товчоор удирдагдана. «Ерөнхий төлөвлөгөө» нь давхаргын жагсаалт
    //    гол агуулгатай тул НЭЭЛТТЭЙ эхэлнэ; бусад харагдац хумигдсан.
    setCatalog(v === 'plan');
  }, [clearFilter]);

  /* ── URL төлөв — хуваалцах холбоос, F5, Back ── */

  /** Өмнөх харагдац — ХАРАГДАЦ солигдоход л түүхийн шинэ бичлэг үүсгэнэ */
  const lastViewRef = useRef(view);

  /**
   * Төлөв → URL. Харагдац солиход `push` (Back ажиллана), бусад өөрчлөлтөд
   * replace — бүс/давхарга сонгох бүрд түүх урсгавал Back дарахад мөр бүрээр
   * ухрах болно. Анхдагч утгууд URL-д БИЧИГДЭХГҮЙ (writeParams null → устгана).
   * popstate-ээр сэргээх үед URL аль хэдийн зөв тул writeParams өөрөө no-op.
   */
  useEffect(() => {
    const push = view !== lastViewRef.current;
    lastViewRef.current = view;
    writeParams({
      v: view === DEFAULT_VIEW ? null : view,
      z: zone,
      l: layer,
      d: dim === '2d' ? null : dim,
    }, { push });
  }, [view, zone, layer, dim]);

  /* URL → төлөв: хөтчийн Back/Forward-д харагдацыг бүтэн сэргээнэ */
  useEffect(() => {
    const onPop = () => {
      // `setView` нь харагдацын бүрэн шинэчлэл (шүүлт цэвэрлэх г.м.) хийдэг
      setView(initialView());
      setZone(readParam('z'));
      setLayer(initialLayer());
      setDim(initialDim());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView]);

  /**
   * ЭРХИЙН ХАМГААЛАЛТ — идэвхтэй `view` нь навигацийн хүрээнд ЗААВАЛ байна. Гүн
   * холбоосоор (`?v=…`) эрхгүй харагдац орж ирвэл хүрээний эхний харагдац руу
   * шилжүүлж, хязгаарлагдсан хэрэглэгч эрхгүй агуулга үзэхээс сэргийлнэ.
   */
  useEffect(() => {
    // ⚠️ Хоосон массивыг «бүх эрх» гэж үзэж БОЛОХГҮЙ — эрхгүй deep-link бүрэн
    //    зурагддаг байв. Хоосон хүрээтэй үед Root Portal-ыг огт зурдаггүй тул
    //    энд navScope үргэлж 1+ гишүүнтэй.
    if (navScope === 'all') return;
    if (!navScope.includes(view)) {
      // ⚠️ Redirect түүхэнд PUSH хийвэл Back → эрхгүй view сэргэж guard дахин
      //    push — гарах аргагүй гогцоо. lastViewRef-ыг урьдчилан оноож URL
      //    эффектийн push-ыг дарна: redirect нь replace байх ёстой.
      lastViewRef.current = navScope[0];
      setView(navScope[0]);
    }
  }, [navScope, view, setView]);

  const pick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs);
    setPickedLayer(layerId);
  }, []);

  /** Тогтмол лавлагаа — `memo(LayerCatalog)`-ийг дэмий дахин зуруулахгүй */
  const closeCatalog = useCallback(() => setCatalog(false), []);

  /**
   * ОРТОФОТО — харагдац бүрийн анхдагч (хэрэглэгчийн хүсэлт, 2026-07-31):
   * «Багцын мэдээлэл» ба «Барилгын хяналт» дээр АСААЛТТАЙ (гүйцэтгэлийг бодит
   * агаарын зурагтай нь тулгаж хардаг), бусад харагдацад унтраалттай (топографи).
   * Харагдац дотроо гараар унтраасан/асаасан нь дараагийн солилт хүртэл үлдэнэ.
   */
  const { setOrtho } = useMap();
  useEffect(() => {
    // tsogts — багц+хяналтын нэгдсэн харагдац тул мөн ортофототой
    // habea — кран, аюулгүйн бүсийг бодит талбай дээр нь хардаг (2026-08-12)
    setOrtho(view === 'bagts' || view === 'monitor' || view === 'tsogts' || view === 'habea');
  }, [view, setOrtho]);

  /* ── Багануудын өргөн ── */

  // Самбар БАРУУН талд тул зүүн тийш чирэхэд өргөснө → тэмдэг урвуу
  const panelSize = useColumnResize({
    min: PANEL_MIN, max: PANEL_MAX, initial: PANEL_DEFAULT, storageKey: PANEL_KEY, dir: -1,
  });
  // Каталог ЗҮҮН талд — баруун тийш чирэхэд өргөснө
  const catSize = useColumnResize({
    min: CAT_MIN, max: CAT_MAX, initial: CAT_DEFAULT, storageKey: CAT_KEY, dir: 1,
  });
  // «Барилгын хяналт»-ын зүүн багана — мөн ЗҮҮН талд тул +1
  const monSize = useColumnResize({
    min: MON_MIN, max: MON_MAX, initial: MON_DEFAULT, storageKey: MON_KEY, dir: 1,
  });
  // Зургийн доорх муруйн зурвас — ДЭЭШ чирэхэд өндөрснө
  const trendSize = useColumnResize({
    min: TREND_MIN, max: TREND_MAX, initial: TREND_DEFAULT, storageKey: TREND_KEY, dir: -1, axis: 'y',
  });

  const active = VIEW_BY_KEY[view];
  /**
   * ⚠️ Бүтэн талбайг эзлэх харагдацууд (ерөнхий дашбоард, анализ) нь ӨӨРСДИЙН
   * бүрэн зохион байгуулалттай — порталын каталог/самбар/нэгтгэлийг зурахгүй.
   * Хоёр ArcGIS view зэрэг ажиллавал WebGL контекст үрэгдэж зураг анивчина тул
   * харагдац бүр өөрийн ганц зурагтай.
   *   · analysis  — Suitability Modeler (өөрийн 3 багана, харанхуй палитр)
   *   · dashboard — газрын зургийг тойрсон үзүүлэлтийн самбар
   */
  const isDash = view === 'dashboard';
  const isSheet = view === 'sheet';
  const isBagts = view === 'bagts';
  const isTailan = view === 'tailan';
  const isGazar = view === 'gazar';
  const isFinance = view === 'finance';
  const isHabea = view === 'habea';
  const isIot = view === 'iot';
  const isGuitsetgel = view === 'guitsetgel';
  const isTsogts = view === 'tsogts';
  const isIrged = view === 'irged';
  // `standalone` нь эдгээрийг ЯГ тэмдэглэдэг — тусад нь тоолохгүй
  const isFull = standalone;
  /**
   * ⚠️ «Ерөнхий мэдээлэл»-нд нэгтгэсэн зурвас нь самбарын толгойд (доод хүрээгүй)
   * үлдэнэ. Каталогийн НЭЭЛТ нь бүх харагдацад «Давхарга» товчоор удирдагдана —
   * plan-д ч жагсаалтыг нуух/харуулах боломжтой (хэрэглэгчийн хүсэлт).
   */
  const planPanel = view === 'plan';
  // Каталог нь зөвхөн «Ерөнхий мэдээлэл» ба «Барилгын хяналт»-д байна
  const catOpen = catalog && !isFull;

  /**
   * «Ерөнхий мэдээлэл»-д ХЭДЭН БАГЦ сонгогдсоныг тоолно — самбар өөрөө өргөсөж
   * сонгосон багцуудыг ЗЭРЭГЦЭЭ багана болгон харуулахад ашиглана.
   *
   * ⚠️ `ViewPanel`-ийн `pickedGroups`-тэй ИЖИЛ дүрэм: анхны багцтай яг тэнцүү бол
   * «хараахан сонгоогүй» тул 0; бүс сонгогдвол ZONE_ID-гүй давхаргыг хасна.
   */
  const planGroups = useMemo(() => {
    if (view !== 'plan') return 0;
    const initial = VIEW_BY_KEY.plan.initial;
    const untouched =
      visible.length === initial.length && initial.every((id) => visible.includes(id));
    if (untouched) return 0;
    const on = PLAN_LAYER_IDS.filter(
      (id) => visible.includes(id) && !(zone && LAYER_BY_ID[id]?.noZone),
    );
    if (!on.length) return 0;
    return new Set(on.map(groupOf).filter(Boolean)).size;
  }, [view, visible, zone]);

  /**
   * ⚠️ 2+ багц сонгоход самбарыг АВТОМАТААР өргөсгөж хоёр баганыг зэрэг харуулна
   * («Ерөнхий дашбоард»-ын дэлгэрэнгүйтэй ижил зарчим). Хэрэглэгчийн гараар
   * тохируулсан өргөнөөс (`panelSize.width`) ХЭТ БАГА болгохгүй — `max()`; мөн
   * газрын зургийг хамгаалж `52vw`-ээр таглана. Багц сонгоогүй үед хуучин өргөн.
   */
  const autoCols = Math.min(2, planGroups);
  const autoPanel = planGroups >= 2 ? autoCols * 300 + (autoCols - 1) * 10 + 44 : 0;
  const panelVar = planGroups >= 2
    ? `max(${panelSize.width}px, min(${autoPanel}px, 52vw))`
    : `${panelSize.width}px`;

  return (
    <>
      {/* ⚠️ 2026-08-18: `--hue: active.hue` ХАСАГДАВ — харагдац бүр өөр өнгөөр
          будагддаг байсныг байгууллагын НЭГ акцентад (globals.css) нэгтгэв.
          Мөн `shellCat` хасагдав: каталог багана биш, зурган дээрх popup боллоо. */}
      <div
        className={`${s.shell} ${isFull ? s.shellSuit : ''} ${!isFull && !planPanel ? s.shellFoot : ''} ${view === 'monitor' ? s.shellMon : ''} ${navMin ? s.shellNavMin : ''}`}
        style={{
          '--panel': panelVar,
          '--catalog': `${catSize.width}px`,
          '--monleft': `${monSize.width}px`,
          '--montrend': `${trendSize.width}px`,
        } as CSSProperties}
      >
        <header className={s.head}>
          {/* Лого/нэр дээр дарахад НҮҮР рүү буцна (onHome өгөгдсөн бол товч болно) */}
          <button
            type="button"
            className={s.brand}
            onClick={onHome}
            disabled={!onHome}
            title={onHome ? tr('Нүүр хуудас руу буцах') : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className={s.logo} />
            {/* ⚠️ 2026-08-21: Дэд гарчиг ХАСАГДАВ (хэрэглэгчийн хүсэлт) — толгойд
                зөвхөн брэндийн нэр үлдэнэ. `brandText`-ийг хэвээр үлдээв: логоны
                хажуугийн босоо зэрэгцүүлэлт түүнээс хамаарна. */}
            <span className={s.brandText}>
              <h1 className={s.brandName}>{tr('Сэлбэ ухаалаг хот')}</h1>
            </span>
          </button>

          {/* ⚠️ 2026-08-17: Харагдац сонголт толгойноос ЗҮҮН БАГАНА руу зөөгдөв
              (доорх `<aside className={s.nav}>`) — envhub-ийн хэлтсийн жагсаалт
              шиг босоо. Толгойд зөвхөн брэнд ба хэрэгслийн товчнууд үлдэнэ. */}

          <ActiveFilterChip />

          {/* ⚠️ Хэрэгслүүд ЗААВАЛ өөрийн саванд. Урьд нь `ActiveFilterChip` нь
              баруун тийш түлхэх үүрэг гүйцэтгэдэг байсан ч тэр нь шүүлт
              идэвхгүй үед `null` буцаадаг — тэгэхээр товчнууд брэндийн ЯГ
              хажууд наалдаж, толгойн баруун тал хоосон үлддэг байв.
              `margin-left: auto` нь шүүлт байгаа эсэхээс ҮЛ ХАМААРАН түлхэнэ. */}
          {/* ⚠️ «Хэрэглэгчийн эрх» ЭНДЭЭС ХАСАГДСАН (2026-08-20) — зүүн цэсний
              «СИСТЕМ» бүлэгт, хамгийн доод талд шилжив. Толгойд зөвхөн БҮХ
              хэрэглэгчид хамаатай хоёр солигч (хэл, гэрэлтүүлэг) үлдэнэ. */}
          <div className={s.headTools}>
            <LocaleToggle className={s.iconBtn} />

            <button
              type="button"
              className={s.iconBtn}
              onClick={toggle}
              aria-label={theme === 'dark' ? tr('Цайвар горим') : tr('Харанхуй горим')}
              title={theme === 'dark' ? tr('Цайвар горим') : tr('Харанхуй горим')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
          </div>
        </header>

        {/* ── ЗҮҮН БАГАНА: харагдацын жагсаалт ──
            envhub-ийн «ХЭЛТЭС» самбартай ижил — дугаарласан босоо жагсаалт.
            Толгойн доор, бүх мөрийг эзэлнэ (`grid-area: nav`). */}
        <aside className={s.nav}>
          {/* Цэс хураах/дэлгэх — хураахад зөвхөн дүрс үлдэнэ (54px) */}
          <button
            type="button"
            className={s.navFold}
            onClick={toggleNav}
            aria-pressed={navMin}
            aria-label={navMin ? tr('Цэс дэлгэх') : tr('Цэс хураах')}
            title={navMin ? tr('Цэс дэлгэх') : tr('Цэс хураах')}
          >
            <span className={s.navFoldArrow} aria-hidden>{navMin ? '»' : '«'}</span>
            {!navMin && <span>{tr('Хураах')}</span>}
          </button>
          <ViewRail
            view={view}
            setView={setView}
            catalogOpen={catOpen}
            navScope={navScope}
            collapsed={navMin}
            onDocs={docsAllowed ? () => setDocsOpen(true) : undefined}
            docsActive={docsOpen}
            onAdmin={isSuper ? () => setAdminOpen(true) : undefined}
            adminActive={adminOpen}
          />
        </aside>

        {/* Бүтэн талбайн харагдацууд — ерөнхий дашбоард ба анализ */}
        {isFull && (
          <div className={s.suit}>
            {isDash
              ? <Dashboard dim={dim} setDim={setDim} zone={zone} setZone={setZone} />
              : isBagts
                ? <Bagts dim={dim} setDim={setDim} />
                : isTsogts
                  ? <Tsogts dim={dim} setDim={setDim} />
                  : isSheet
                    ? <Sheet />
                    : isTailan
                      ? <Tailan />
                      : isGazar
                        ? <Gazar dim={dim} setDim={setDim} />
                        : isFinance
                          ? <Finance />
                          : isHabea
                            ? <Habea dim={dim} setDim={setDim} />
                            : isIrged
                              ? <Irged dim={dim} setDim={setDim} />
                              : isIot
                                ? <Iot dim={dim} setDim={setDim} />
                                : isGuitsetgel
                                  ? <Guitsetgel onView={setView} />
                                  : <Suitability dim={dim} setDim={setDim} />}
          </div>
        )}

        {!isFull && (
          <>
            {/* «Барилгын хяналт» — ЗҮҮН талд дундаж, зургийн ДООР явцын муруй */}
            {view === 'monitor' && <MonitorFrame size={monSize} trend={trendSize} />}

            <div className={s.map}>
              <MapCanvas dim={dim} visible={visible} opacity={opacity} zone={zone} onPick={pick} />

              {/* Газрын зургийн НЭГДСЭН хэрэгслийн зурвас — бүх харагдацад ижил
                  (`MapTools`). Урьд нь энэ блок энд гараар бичигдсэн байв. */}
              <MapTools
                dim={dim}
                setDim={setDim}
                layersOpen={catOpen}
                onLayers={() => setCatalog((v) => !v)}
                opacityOpen={opacityOpen}
                onOpacity={() => setOpacityOpen((v) => !v)}
                zone={zone}
                setZone={setZone}
              />

              {/* Тунгалаг тохируулах хөвөгч цонх */}
              {opacityOpen && (
                <OpacityPanel
                  visible={visible}
                  opacity={opacity}
                  setOpacity={setOpacity}
                  onClose={closeOpacity}
                />
              )}

              {/**
                * Давхаргын сонголт — идэвхжихэд зурган дээр ХӨВӨГЧ POPUP болж
                * гарна (хэрэглэгчийн шийдвэр, 2026-08-18). Урьд нь grid-ийн
                * тусдаа багана байсан тул нээхэд зураг шахагддаг байв.
                * `embedded` — grid-area/хүрээг унтраасан хөвөгч хувилбар.
                */}
              {catOpen && (
                <div className={s.catPop}>
                  <LayerCatalog
                    view={view === 'monitor' ? 'monitor' : 'plan'}
                    totals={totals}
                    visible={visible}
                    setVisible={setVisible}
                    selected={layer}
                    onSelect={setLayer}
                    onClose={closeCatalog}
                    pinned={false}
                    embedded
                    resizing={catSize.dragging}
                    onResizeStart={catSize.onPointerDown}
                    onResizeReset={catSize.onDoubleClick}
                    zone={zone}
                  />
                </div>
              )}

            </div>

            <aside className={s.panel} id="panel" aria-label={tr('{0} самбар', active.title)}>
              {/* Өргөн тохируулах бариул — самбарын зүүн ирмэг дээр */}
              <div
                className={`${s.grip} ${panelSize.dragging ? s.gripOn : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label={tr('Самбарын өргөн')}
                onPointerDown={panelSize.onPointerDown}
                onDoubleClick={panelSize.onDoubleClick}
                title={tr('Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
              />

              <header className={s.panelHead}>
                <span className={s.panelIcon}><Icon name={active.icon} /></span>
                <div>
                  <h2 className={s.panelTitle}>{active.title}</h2>
                  <p className={s.panelDesc}>{active.desc}</p>
                </div>
              </header>

              {/**
                * Нэгтгэсэн үзүүлэлт — гарчгийн ЯГ доор, самбарын доторх тогтмол зурвас.
                *
                * ⚠️ ЗӨВХӨН «Ерөнхий мэдээлэл»-д. «Барилгын хяналт» нь ӨӨР ХҮНИЙ
                * хэсэг бөгөөд тэнд энэ зурвас хуучнаараа ДЭЛГЭЦИЙН ДООД хүрээнд
                * үлдэнэ — тэр харагдацын зохион байгуулалтыг зөвшөөрөлгүй
                * өөрчлөхгүй.
                */}
              {planPanel && <SummaryBar zone={zone} />}

              <div className={s.panelBody}>
                <ViewPanel
                  view={view}
                  totals={totals}
                  visible={visible}
                  setVisible={setVisible}
                  zone={zone}
                  setZone={setZone}
                  picked={picked}
                  pickedLayer={pickedLayer}
                  openCatalog={() => setCatalog(true)}
                  layer={layer}
                  setLayer={setLayer}
                />
              </div>
            </aside>

            {/* «Барилгын хяналт» — нэгтгэсэн үзүүлэлт хуучнаараа доод хүрээнд */}
            {!planPanel && (
              <footer className={s.dashFoot} aria-label={tr('Нэгтгэсэн үзүүлэлт')}>
                <SummaryBar zone={zone} />
              </footer>
            )}
          </>
        )}
      </div>

      {/* ТЭЗҮ баримт бичгийн глобал popup — fixed тул бүх харагдацыг халхална */}
      {/* ⚠️ `docsAllowed`-ыг ЭНД дахин шалгана (`Home`-той ижил): эрх нь ажиллаж
          байх үед super admin панелаас буурвал нээлттэй цонх өөрөө хаагдана. */}
      <DocViewer open={docsAllowed && docsOpen} onClose={() => setDocsOpen(false)} />

      {/* Хэрэглэгчийн эрх удирдлага — зөвхөн super admin нээж чадна */}
      {isSuper && <UserAdmin open={adminOpen} onClose={() => setAdminOpen(false)} />}

      {/* AI туслах — бүх харагдацад нэг л удаа (яриа харагдац соливол тасрахгүй) */}
      <AgentButton open={agentOpen} onToggle={() => setAgentOpen(true)} />
      <AgentChat open={agentOpen} onClose={() => setAgentOpen(false)} scope={navScope} />
    </>
  );
}

/* ── «Барилгын хяналт»-ын хүрээ ── */

/**
 * ЗҮҮН дундаж багана + газрын зургийн ДООРХ явцын муруй.
 *
 * ⚠️ Хоёулаа НЭГ `useBuildings()`-ээс уншина — тусад нь дуудвал 113 блокийн
 * хүсэлт хоёр удаа явна. Fragment тул grid-ийн шууд хүүхдүүд хэвээр: муруй нь
 * DOM-д зүүн баганын хажууд ч, `grid-area: trend` нь зургийн доор тавина.
 */
function MonitorFrame(
  { size, trend }: { size: ReturnType<typeof useColumnResize>; trend: ReturnType<typeof useColumnResize> },
) {
  const q = useBuildings();
  return (
    <>
      <aside className={s.monLeft} aria-label={tr('Барилгын дундаж мэдээлэл')}>
        {/* Өргөн тохируулах бариул — баганы БАРУУН ирмэг дээр */}
        <div
          className={`${s.grip} ${size.dragging ? s.gripOn : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={tr('Зүүн баганын өргөн')}
          onPointerDown={size.onPointerDown}
          onDoubleClick={size.onDoubleClick}
          title={tr('Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
        />
        <div className={s.monScroll}>
          <BuildingSummary q={q} />
        </div>
      </aside>

      <section className={s.monTrend} aria-label={tr('Барилга угсралтын явц')}>
        {/* Өндөр тохируулах бариул — зурвасын ДЭЭД ирмэг дээр */}
        <div
          className={`${s.rowGrip} ${trend.dragging ? s.rowGripOn : ''}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label={tr('Явцын зурвасын өндөр')}
          onPointerDown={trend.onPointerDown}
          onDoubleClick={trend.onDoubleClick}
          title={tr('Чирж өндөрсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
        />
        <div className={s.monScroll}>
          <MonitorTrend q={q} />
        </div>
      </section>
    </>
  );
}

/* ── Идэвхтэй шүүлт ── */

/**
 * Газрын зурагт одоо ямар шүүлт үйлчилж байгааг ҮРГЭЛЖ харуулна.
 *
 * ⚠️ Урьд нь идэвхтэй шүүлт зөвхөн түүнийг үүсгэсэн самбарын мөрөнд л
 * тодорсон байдаг байв. Хэрэглэгч доош гүйлгэж, өөр хэсэг рүү шилжсэний дараа
 * зураг яагаад бүдгэрсэн шалтгааныг олох арга байхгүй байлаа.
 */
function ActiveFilterChip() {
  const { active, clear } = useFilter();
  if (!active) return null;

  return (
    <div className={s.filterChip} style={{ '--tone': active.color ?? 'var(--hue)' } as CSSProperties}>
      <span className={s.filterDot} aria-hidden />
      <span className={s.filterText}>
        <span className={s.filterGroup}>{active.group}</span>
        <span className={s.filterLabel}>{active.label}</span>
      </span>
      <button type="button" className={s.filterClear} onClick={clear} aria-label={tr('Шүүлт цуцлах')}>
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
          <path
            d="M3 3l6 6M9 3l-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

/* ── Самбарын толгойн доорх нэгтгэсэн үзүүлэлт ── */

/**
 * ⚠️ Энэ зурвас урьд нь ДЭЛГЭЦИЙН ДООД хүрээ байв. Тэнд байхдаа газрын зургийн
 * өндрөөс 76px хасч, нүд хамгийн бага очдог булан руу түлхэгдэж байлаа. Одоо
 * самбарын гарчгийн доор: харагдацын нэрийг уншсан хүн шууд дараагийн мөрөнд
 * төслийн хэмжээг харна.
 */
function SummaryBar({ zone }: { zone: string | null }) {
  // ⚠️ Хоёр давхарга бүсээ ӨӨР талбар, ӨӨР бичиглэлээр агуулна — нэг WHERE-ийг
  //    хоёуланд нь тавьж болохгүй (`zoneWhere` давхарга бүрд нь угсарна).
  const where = zone ?? '1=1';

  const q = useAsync(async () => {
    const Z = ZONE_FIELDS;
    const B = BUILT_FIELDS;
    const zoneQ = zone ? zoneWhere(ZONE_LAYER, zone) ?? '1=1' : '1=1';
    const builtQ = zone ? zoneWhere(BUILT_LAYER, zone) ?? '1=1' : '1=1';
    const [zones, built, headline] = await Promise.all([
      queryStats(layerUrl(ZONE_LAYER), [
        count(oidOf(ZONE_LAYER), 'n'), sum(Z.landHa, 'ga'), sum(Z.households, 'ail'),
      ], zoneQ),
      queryStats(layerUrl(BUILT_LAYER), [count(oidOf(BUILT_LAYER), 'n'), sum(B.population, 'pop')], builtQ),
      loadHeadline(),
    ]);
    return {
      zones: Number(zones.n ?? 0),
      /**
       * ⚠️ Бүс сонгогдсон үед тэр бүсийн `GAZAR_GA`; сонгоогүй үед хилийн
       * давхаргын АМЬД `Hec_area` (урьд нь бэхлэгдсэн 158 га байсан). Бүх
       * бүсийн нийлбэр (~131 га) нь зөвхөн бүсчилсэн газрыг хамардаг тул
       * төслийн хэмжээг илэрхийлэхгүй.
       */
      ga: zone ? Number(zones.ga ?? 0) : headline.areaHa,
      ail: Number(zones.ail ?? 0),
      built: Number(built.n ?? 0),
      pop: Number(built.pop ?? 0),
    };
  }, [where]);

  if (q.state === 'error') {
    return <div className={s.sumBar} role="alert"><span className={s.sumLabel}>{tr('Үзүүлэлт татагдсангүй')}</span></div>;
  }
  if (q.state !== 'ready') return <div className={s.sumBar} />;

  const items = [
    { v: num(q.data.ga, 1), l: tr('га талбай') },
    { v: num(q.data.zones), l: tr('бүс') },
    { v: num(q.data.built), l: tr('барилга') },
    { v: num(q.data.ail), l: tr('айл') },
    { v: num(q.data.pop), l: tr('хүн ам') },
  ];

  return (
    <div className={s.sumBar}>
      {zone && <span className={s.sumZone}>{zone}</span>}
      {items.map((i) => (
        <div key={i.l} className={s.sumStat}>
          <span className={`${s.sumValue} num`}>{i.v}</span>
          <span className={s.sumLabel}>{i.l}</span>
        </div>
      ))}
    </div>
  );
}

'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { MapCanvas, MapProvider, applyViewBasemap, useMap, type Dim } from '@/components/MapCanvas';
import { t as tr } from '@/lib/i18nCore';
import { ViewRail, type NavBadges } from '@/components/ViewRail';
import { HelpPanel, HelpTip } from '@/components/HelpPanel';
import { loadNavBadges, makeBadgeRefresher, subscribeNavBadges, BADGE_VIEWS } from '@/components/navBadges';
import { subscribeData } from '@/lib/dataBus';
import { useAuth } from '@/components/AuthGate';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { MapTools } from '@/components/MapTools';
import { zonesLabel } from '@/components/ZoneFilter';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import dynamic from 'next/dynamic';
/* ⚠️ 2026-09-30: харагдацын модулиуд (статик `Dashboard` + бүх `dynamic` chunk)
   ба тэдгээрийн ⚠️ шийдвэрүүд `viewRegistry.tsx`-д — шинэ харагдац нэмэхэд
   энд ЮУ Ч засахгүй. */
import { ViewSlot, type PlanJump } from '@/components/viewRegistry';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Icon } from '@/components/Icon';
import { DocViewer } from '@/components/DocViewer';
import { LocaleToggle } from '@/components/LocaleToggle';
/* ⚠️ 2026-10-04: товч нь тусдаа хөнгөн файлаас — `AgentChat` нь доор `dynamic` (`AgentButton.tsx`-ийн ⚠️) */
import { AgentButton } from '@/components/AgentButton';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { FilterProvider, useFilter } from '@/lib/filter';
import { usePlanTotals } from '@/lib/totals';
import { queryStats, count, sum } from '@/lib/query';
import { loadHeadline, loadHousing, POPULATION_FIELD } from '@/lib/live';
import {
  DEFAULT_VIEW, VIEW_BY_KEY, layerUrl, oidOf, zoneWhere,
  PLAN_LAYER_IDS, CATALOG_LAYER_IDS, LAYER_BY_ID, groupOf,
  ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER,
  PLAN_ALWAYS_ON_IDS,
  type ViewKey,
} from '@/lib/services';
import { readParam, writeParams } from '@/lib/urlState';
import { planNavBusy } from '@/lib/huvaariBatlah';
/* ⚠️ 2026-09-29 (аудит 10): импортгүй хөнгөн lib — `Finance` өөрөө `dynamic` */
import { finNavDirty } from '@/lib/finEdit';
/* ⚠️ 2026-09-30: харагдацын ерөнхий «хадгалаагүй засвар» туг — импортгүй lib (`confirmLeave`) */
import { navDirtyLabels } from '@/lib/navGuard';
import { num } from '@/lib/format';
/**
 * ⚠️ `ViewPanel` (64 KB) нь ЗӨВХӨН `standalone` БИШ харагдацуудад зурагдана
 * (`!isFull` салбар). Анхдагч `dashboard` нь standalone тул эхний ачаалалтад
 * ХЭРЭГГҮЙ — 2026-09-03-ны аудитаар динамик болгов.
 */
const ViewPanel = dynamic(() => import('@/modules/ViewPanel').then((m) => m.ViewPanel), { ssr: false });
/**
 * ⚠️ 2026-10-04 (ачааллын аудит): хоёр том, ХОВОР цонх `dynamic` — урьд нь статик
 *    байсан тул бүх хэрэглэгчийн Portal chunk-д орж байв:
 *    · `UserAdmin` (~630 КБ эх код: эрхийн хүснэгтүүд, `ChanarAcl` → `chanarMs` …) —
 *      ЗӨВХӨН super admin-д mount болдог. Mount-ын нөхцөл ӨӨРЧЛӨГДӨӨГҮЙ (`isSuper`)
 *      тул super-ийн хувьд төлөв/эффектийн зан урьдын адил, зөвхөн дэвсгэрт татагдана;
 *      бусад хэрэглэгч ОГТ татахгүй.
 *    · `AgentChat` (~220 КБ: агентын клиент, датасетийн бүртгэл, markdown) — анх
 *      НЭЭХЭД л mount (`agentMounted`).
 */
const UserAdmin = dynamic(() => import('@/components/UserAdmin').then((m) => m.UserAdmin), { ssr: false });
const AgentChat = dynamic(() => import('@/components/AgentChat').then((m) => m.AgentChat), { ssr: false });

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
  /* ⚠️ 2026-09-30: хадгалсан өргөнийг useState-ийн INITIALIZER-т уншина (урьд
     нь эффект дотор setState — нэг илүү рендер, eslint set-state-in-effect).
     Portal нь `ssr:false` тул initializer ҮРГЭЛЖ хөтөч дээр ажиллана; `window`
     хамгаалалт нь зөвхөн болгоомжлол.
     ⚠️ try/catch (2026-09-07): хувийн горимд `getItem` ШИДДЭГ бөгөөд шидсэн
     алдаа ЭНЭ БҮХЭЛ ПОРТАЛЫГ унагана — баганын өргөн санагдахгүй нь ердөө
     тав тухын асуудал. */
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const v = Number(localStorage.getItem(storageKey));
      return Number.isFinite(v) && v >= min && v <= max ? v : initial;
    } catch { return initial; /* хувийн горим — анхдагч өргөн хэвээр */ }
  });
  const [dragging, setDragging] = useState(false);
  /**
   * ⚠️ Одоогийн өргөн REF-ээр давхар — `onPointerDown` render бүрт шинээр
   * үүсвэл `memo(LayerCatalog)` пропсын өөрчлөлт гэж үзэж дахин зурна.
   * Ref-ээс уншсанаар callback нь тогтмол лавлагаатай (useCallback) болно.
   */
  const widthRef = useRef(width);

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
    /* ⚠️ 2026-09-25: `lostpointercapture` — барилт өөр шалтгаанаар (элемент
       DOM-оос салах, хөтөч барилтыг булаах) алдагдвал `pointerup` ирэхгүй тул
       body-ийн `resizing` класс ба чирэлтийн төлөв гацаж үлддэг байв.
       `done` туг — up + lost хоёулаа ирэхэд хоёр удаа ажиллахгүй. */
    let done = false;
    const up = () => {
      if (done) return;
      done = true;
      setDragging(false);
      document.body.classList.remove(cls);
      if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.removeEventListener('lostpointercapture', up);
      save(widthRef.current);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    grip.addEventListener('lostpointercapture', up);
  }, [min, max, dir, axis, storageKey]);

  /**
   * ⚠️ 2026-09-25: ГАРААР өргөн тохируулах — бариул нь зөвхөн хулганаар
   * ажилладаг байв. Сум (x тэнхлэгт ←/→, y-д ↑/↓) нь бариулыг ДЭЛГЭЦ дээр
   * тэр зүгт хөдөлгөнө (чирэлттэй ижил `dir` томьёо); Shift — 4 дахин том
   * алхам; Home/End — хязгаар.
   */
  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const fwd = axis === 'y' ? 'ArrowDown' : 'ArrowRight';
    const back = axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
    let w: number;
    if (e.key === fwd) w = widthRef.current + dir * step;
    else if (e.key === back) w = widthRef.current - dir * step;
    else if (e.key === 'Home') w = min;
    else if (e.key === 'End') w = max;
    else return;
    e.preventDefault();
    w = Math.min(max, Math.max(min, w));
    widthRef.current = w;
    setWidth(w);
    try { localStorage.setItem(storageKey, String(w)); } catch { /* private mode */ }
  }, [min, max, dir, axis, storageKey]);

  /** Давхар товшиход анхны өргөнд буцаана */
  const onDoubleClick = useCallback(() => {
    widthRef.current = initial;
    setWidth(initial);
    try { localStorage.setItem(storageKey, String(initial)); } catch { /* private mode */ }
  }, [initial, storageKey]);

  return { width, dragging, onPointerDown, onDoubleClick, onKeyDown };
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
      <Booting navScope={navScope} />
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
function Booting({ navScope }: { navScope: 'all' | ViewKey[] }) {
  const { view } = useMap();
  /**
   * ⚠️ Порталын зураггүй standalone харагдац (analysis, sheet, tailan, finance —
   * `layers: []`) context-д view ХЭЗЭЭ Ч бүртгэдэггүй тул хүлээх дохио ирэхгүй,
   * Booting 12с дэмий таглана — тэдгээрт ЭХНЭЭСЭЭ дууссан гэж үзнэ.
   * (useState-ийн initializer-т нэг удаа тооцно — hooks-ийн дараалал тогтвортой.)
   */
  const [done, setDone] = useState(() => {
    const v = VIEW_BY_KEY[clampView(initialView(), navScope)];
    return !!v.standalone && !v.layers.length;
  });
  useEffect(() => {
    if (done) return;
    // ⚠️ Context дэх `view` нь dev StrictMode-ийн register(null) timing-ээс болж
    //    заримдаа хоцордог тул DOM-ийн `esri-view` бэлэн эсэхийг ч POLLING-оор
    //    шалгана. Аль нэг нь бэлэн болмогц (эсвэл дээд тал нь ~12с) хаана.
    /* ⚠️ 2026-10-04: харагдацын ӨГӨГДӨЛ/ЗУРАГ унасан бол ШУУД хаана — урьд нь
       ХАБЭА-ийн «ачаалахад алдаа гарлаа» 12с эргэлдэгчийн ард нуугддаг, iot-ийн
       удаан 3D бүхэл 12с таглаж байв. Дохио (DOM): `[data-boot-fail]` (MapCanvas
       initError, модулийн алдааны карт) эсвэл `role="alert"`; ~3с болоод DOM-д
       нэг ч зураг (`[data-map-canvas]`) алга бол харагдац зураггүй — хүлээх
       зүйл байхгүй. Дээд хязгаар 12с → ~8с. Overlay өөрөө `role="status"`. */
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      const el = document.querySelector('.esri-view') as (Element & { __esriView__?: { ready?: boolean } }) | null;
      const domReady = !!(el && el.__esriView__ && el.__esriView__.ready);
      const failed = !!document.querySelector('[data-boot-fail], [role="alert"]');
      const noMap = tries >= 10 && !document.querySelector('[data-map-canvas]');
      if (domReady || !!view || failed || noMap || tries > 26) setDone(true);
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
      <img src="/logo.svg" alt="" width={60} height={60} style={{ animation: 'selbePulse 1.8s ease-in-out infinite' }} />
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid rgba(148,197,255,0.18)', borderTopColor: '#38bdf8',
        animation: 'selbeSpin .9s linear infinite',
      }} />
      <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: 0.3 }}>{tr('Дашбоард ачаалж байна…')}</div>
      {/* ⚠️ 2026-09-25: «20 минутын хот» → «Ухаалаг хот» — Home/Landing-ийн брэндтэй
          НЭГ нэр (2026-08-24-ний хэрэглэгчийн шийдвэр, тэдгээрийн ⚠️-г үз). */}
      <div style={{ fontSize: 12.5, color: '#8aa0bd' }}>
        {tr('Сэлбэ')} {tr('Ухаалаг хот')} · Digital Twin Platform
      </div>
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
  /* ⚠️ `Object.hasOwn` (2026-09-21) — `?v=constructor` / `__proto__` нь энгийн
     индексжүүлэлтээр prototype-ийн гишүүнийг «олж» харагдац биш утга буцаагаад
     Portal бүхэлдээ унадаг байв. `Root.scopeFromUrl`-тай ижил хамгаалалт. */
  return v && Object.hasOwn(VIEW_BY_KEY, v) ? (v as ViewKey) : DEFAULT_VIEW;
};

/**
 * URL-д ПОРТАЛЫН хүрээ байгаа юу — `false` бол `Root` нүүр хуудас руу шилжиж Portal-ыг
 * unmount хийнэ (popstate-ийн «порталаас гарах» салаа).
 * ⚠️ 2026-09-30: `Root.scopeFromUrl`-ийн «null биш» нөхцөлтэй ЯГ ИЖИЛ дүрэм (`all=1` ·
 *    хуучин `g` · хүчинтэй `v`) — нэгийг өөрчилвөл нөгөөг ХАМТ засна. `Root`-ийг
 *    импортлохгүй: тэр нь Portal-ыг `dynamic`-аар ачаалдаг (мөчлөг үүснэ).
 */
const inPortalUrl = (): boolean => {
  const v = readParam('v');
  return readParam('all') === '1' || !!readParam('g') || (!!v && Object.hasOwn(VIEW_BY_KEY, v));
};

/**
 * Харагдацыг эрхийн хүрээгээр хайчилна.
 * ⚠️ 2026-08-29: `?v=finance` гүн холбоос эрхгүй хэрэглэгчид ЭХНИЙ commit-д
 *    зурагдаж (өгөгдлийн effect ч ажиллаад) дараа нь л guard шилжүүлдэг байв —
 *    initializer-т хайчилснаар эрхгүй агуулга нэг агшин ч гарахгүй.
 */
const clampView = (v: ViewKey, scope: 'all' | ViewKey[]): ViewKey =>
  scope === 'all' || !scope.length || scope.includes(v) ? v : scope[0];

/**
 * ⚠️ IoT нь 3D-ЭЭР эхэлнэ (2026-08-21, хүсэлт): мэдрэгчийн тэмдэг газраас дээш
 * өргөгдсөн байдгаараа л уншигдана — 2D-д тэр өндөр харагдахгүй тул цэгүүд
 * ортофото дээр хавтгайрч, аль нь юу болох нь ялгагдахгүй.
 *
 * ⚠️ URL-ийн `?d=` нь ҮРГЭЛЖ дээгүүр: хуваалцсан холбоос хүний сонгосон горимыг
 * хадгална, эс бөгөөс `?v=iot&d=2d` гэсэн холбоос өөрөө 3D болж нээгдэнэ.
 */
const initialDim = (): Dim => {
  /* ⚠️ «Инженерийн дэд бүтэц» ҮРГЭЛЖ 2D-ээр нээгдэнэ (2026-09-16, хэрэглэгчийн
     хүсэлт) — `?d=3d` URL ч дарж чадахгүй. Шугам, худгийн тор нь 3D мешэн дээр
     барилгын дор дарагдаж уншигдахгүй; засах горим ч зөвхөн 2D-д ажилладаг. */
  if (initialView() === 'dedButets') return '2d';
  const d = readParam('d');
  if (d === '3d' || d === 'bim' || d === '2d') return d;
  return initialView() === 'iot' ? '3d' : '2d';
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
  const [view, setViewState] = useState<ViewKey>(() => clampView(initialView(), navScope));
  const [visible, setVisible] = useState<string[]>(() => VIEW_BY_KEY[clampView(initialView(), navScope)].initial);

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
  /* ⚠️ 2026-08-25 (хэрэглэгчийн шийдвэр): анх орж ирэхэд зүүн цэс ХУРААСТАЙ —
     зөвхөн дүрс (54px) харагдаж, газрын зурагт илүү зай өгнө. Товчоор дэлгэнэ. */
  /* ⚠️ 2026-09-30: initializer-т уншина (эффект дотор setState байсан) — Portal
     `ssr:false` тул хөтөч дээр л ажиллана. Дүрэм ХЭВЭЭР: хадгалсан `'1'` л
     хураана; хадгалалт хаалттай (шидвэл) бол анхдагч ХУРААСТАЙ. */
  const [navMin, setNavMin] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem('selbe-nav-min') === '1'; } catch { return true; /* private */ }
  });
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
  /* Зүүн цэсний «Гарах» мөрөнд (`ViewRail.onSignOut`) */
  const auth = useAuth();
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
   * ⚠️ 2026-10-04 (ачааллын аудит): AI цонх (`AgentChat` — `dynamic`, ~220 КБ эх код)
   *    анх НЭЭГДЭХЭД л mount болно. Хаалттай үед тэр юу ч зурдаггүй, реле шалгалт ч
   *    зөвхөн `open` үед — тиймээс нээгээгүй хэрэглэгч chunk-ийг ОГТ татахгүй. Нэг
   *    удаа нээсний дараа mount хэвээр (яриа, өргөн горим хадгалагдана — урьдын адил).
   */
  const [agentMounted, setAgentMounted] = useState(false);
  /** Порталын тусламжийн цонх (2026-09-30, `HelpPanel`) */
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  /**
   * ЦЭСНИЙ ТООН ТЭМДЭГ (2026-09-30, `navBadges.ts`).
   *
   * ⚠️ Нэвтэрсний ДАРАА л ачаална (эрх, токен бэлэн) · 3 минут тутам ·
   *    тэмдэгтэй харагдацаас ГАРАХАД шууд (батлагч дөнгөж шийдвэрлэсэн тоо
   *    хуучин хэвээр үлдэхгүй). Алдаа чимээгүй — өмнөх тоо хэвээр.
   * ⚠️ Таб нуугдсан үед хүсэлт явуулахгүй.
   */
  const [badges, setBadges] = useState<NavBadges>({});
  const badgeUser = auth.user?.username ?? null;
  const badgeReady = auth.status === 'signed-in' || auth.status === 'off';
  /* ⚠️ `navScope` массив нь `Root`-ийн рендер бүрт ШИНЭ лавлагаа (эрхийн poll
     15 с–5 мин тутам рендерлэдэг) — шууд deps-д тавибал тэр бүрд дахин татна.
     Агуулгын түлхүүрээр л шинэчилнэ. */
  const scopeKey = navScope === 'all' ? 'all' : navScope.join(',');
  const badgeScope = useMemo<'all' | ViewKey[]>(
    () => (scopeKey === 'all' ? 'all' : (scopeKey.split(',').filter(Boolean) as ViewKey[])),
    [scopeKey],
  );
  /* ⚠️ 2026-10-01: ЗӨВХӨН СҮҮЛИЙН дуудлагын хариу (`makeBadgeRefresher`-ийн ⚠️) —
     дараалалгүй ирсэн хуучин хариу шинэ тоог дарахгүй. */
  const [badgeRefresher] = useState(() => makeBadgeRefresher(loadNavBadges));
  const refreshBadges = useCallback(() => {
    if (!badgeReady || document.visibilityState === 'hidden') return;
    badgeRefresher(badgeUser, badgeScope).then((b) => { if (b) setBadges(b); }, () => { /* чимээгүй */ });
  }, [badgeReady, badgeUser, badgeScope, badgeRefresher]);
  useEffect(() => {
    refreshBadges();
    const iv = setInterval(refreshBadges, 3 * 60_000);
    /* ⚠️ 2026-09-30: ACL ирэхэд (чанарын тоо ACL-гүй бага гардаг) ба бичилт
       бүрийн дараа (`dataBus.invalidate`) тэмдгийг шууд шинэчилнэ — 3 минут хүлээхгүй. */
    const offBadge = subscribeNavBadges(refreshBadges);
    const offData = subscribeData(refreshBadges);
    return () => { clearInterval(iv); offBadge(); offData(); };
  }, [refreshBadges]);

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
    // ⚠️ 2026-08-20: Каталог БҮХ давхаргыг харуулдаг болсон тул тоо/хэмжээний
    //    жагсаалт нь түүнтэй ижил байх ёстой (эс бөгөөс шинэ мөрүүд «…» хэвээр).
    () => CATALOG_LAYER_IDS,
    [],
  );
  // ⚠️ Зөвхөн каталог/самбартай харагдацуудад — дашбоард/анализ өөрсдөө татна
  const totals = usePlanTotals(zone, !standalone, catalogIds);

  /* ⚠️ Хуваарийн батлах/хадгалах гинж явж байхад харагдац солихоос өмнө асууна
     (2026-09-25 аудит #4, `planNavBusy`-ийн ⚠️) — салгавал гинж дундаа тасарна. */
  const viewNowRef = useRef(view);
  /* ⚠️ 2026-09-30: ref-ийг ЭФФЕКТЭД шинэчилнэ (рендер дотор бичих нь eslint
     react-hooks/refs). Уншигч нь зөвхөн үйл явдлын хариулагч ба доорх guard
     эффект — хоёулаа энэ эффектийн ДАРАА ажиллана (зарлалтын дараалал). */
  useEffect(() => { viewNowRef.current = view; });
  /* ⚠️ 2026-09-25: `boolean` буцаана — татгалзсан эсэхийг popstate мэдэх ёстой
     (доорх `onPop`-ийн ⚠️). */
  /* ⚠️ 2026-09-30: хамгаалалт ТУСДАА функц — харагдац солих, лого (нүүр рүү)
     ба «Гарах» ГУРВУУЛАА үүгээр явна. Урьд нь зөвхөн `setView`-д байсан тул
     лого эсвэл «Гарах» дарахад хадгалаагүй ажил асуултгүй алга болдог байв. */
  const confirmLeave = useCallback((): boolean => {
    if (planNavBusy()
      && !window.confirm(tr('Хуваарь хадгалагдаж/батлагдаж байна — одоо гарвал дундаа тасарч болзошгүй. Гарах уу?'))) return false;
    /* ⚠️ 2026-09-29 (аудит 10): Санхүүгийн бүртгэл / «Cashflow хувиарлах»-ын
       хадгалаагүй засвар — урьд нь зөвхөн `Finance` доторх таб солилтод асуудаг
       байсан тул өөр харагдац руу шилжихэд `pend`/`adds` баталгаагүй алга болдог байв. */
    if (finNavDirty()
      && !window.confirm(tr('Санхүүгийн бүртгэлд хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?'))) return false;
    /* ⚠️ 2026-09-30: ЕРӨНХИЙ хамгаалалт (`navGuard.setNavDirty`) — «Дэд бүтэц», «Газар»,
       «Зөвшөөрөл» зэрэг харагдацын засварын маягт урьд нь харагдац солих, лого,
       «Гарах»-д асуултгүй алга болдог байв. Шинэ харагдац энд юу ч засахгүйгээр нэмэгдэнэ. */
    const labels = navDirtyLabels();
    if (labels.length
      && !window.confirm(tr('{0}: хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?', labels.join(' · ')))) return false;
    return true;
  }, []);
  const setView = useCallback((v: ViewKey): boolean => {
    if (v !== viewNowRef.current && !confirmLeave()) return false;
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
    /**
     * IoT руу орход 3D. ⚠️ ЗӨВХӨН IoT-д тавина — бусад харагдац руу шилжихэд
     * горимыг ХҮЧЭЭР 2D болгохгүй: хэрэглэгч 3D-г санаатай сонгосон бол тэр
     * сонголт нь харагдац солих болгонд алга болох ёсгүй.
     */
    if (v === 'iot') setDim('3d');
    /**
     * ⚠️ ХАБЭА — ЗААВАЛ 2D-ЭЭР нээгдэнэ (2026-09-06, хэрэглэгчийн хүсэлт).
     *
     * Дээрх дүрмийн ЗАРИМДАА БУРУУ ажилладаг талыг нөхөж байна: IoT нь
     * 3D тавьдаг ч буцааж авдаггүй тул IoT → ХАБЭА гэж явахад зураг 3D
     * хэвээр нээгддэг байв. ХАБЭА-гийн гол дүрслэл нь краны цэг ба
     * аюулгүйн бүсийн ПОЛИГОН — 3D мешэн дээр бүс нь хэвтээ хавтгайд
     * дарагдаж, кран хоорондын давхцал уншигдахгүй болно.
     *
     * ⚠️ URL-ийн `?d=` нь ЭНД хөндөгдөхгүй: энэ нь хэрэглэгч ХАРАГДАЦ
     * СОЛИХОД л ажилладаг. Анхны ачаалалт ба Back нь `initialDim()`-ээр
     * явдаг тул хуваалцсан холбоосын горим ХЭВЭЭР үлдэнэ.
     */
    if (v === 'habea') setDim('2d');
    /* ⚠️ «Инженерийн дэд бүтэц» мөн ЗААВАЛ 2D (2026-09-16) — `initialDim`-ийн
       тайлбарыг үз. Харагдац солихдоо ч, анхны ачаалалтад ч ижил дүрэм. */
    if (v === 'dedButets') setDim('2d');
    return true;
  }, [clearFilter, confirmLeave]);

  const badgeViewRef = useRef(view);
  useEffect(() => {
    const prev = badgeViewRef.current;
    badgeViewRef.current = view;
    if (prev !== view && BADGE_VIEWS.has(prev)) refreshBadges();
  }, [view, refreshBadges]);

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
    /* Сүүлд ажилласан харагдац — дараагийн session-д «Орох» дарахад Root
       эндээс сэргээнэ (үргэлж дашбоардаас эхлэхгүй). Private горимд
       localStorage хаалттай байж болох тул алдааг залгина. */
    try { localStorage.setItem('selbe-last-view', view); } catch { /* хаалттай орчин */ }
  }, [view, zone, layer, dim]);

  /** Одоогийн URL төлөв — Back татгалзагдахад URL-ыг буцааж бичихэд (onPop) */
  const urlNowRef = useRef({ view, zone, layer, dim });
  /* ⚠️ 2026-09-30: эффектэд шинэчилнэ (`viewNowRef`-тэй ижил) — `onPop` нь
     popstate үйл явдалд л уншина. */
  useEffect(() => { urlNowRef.current = { view, zone, layer, dim }; });

  /* URL → төлөв: хөтчийн Back/Forward-д харагдацыг бүтэн сэргээнэ */
  useEffect(() => {
    /** Татгалзсан Back — одоогийн төлөвийг URL-д PUSH-ээр буцааж бичнэ (доорх ⚠️ 2026-09-25) */
    const restoreUrl = (extra: Record<string, string> = {}) => {
      const cur = urlNowRef.current;
      writeParams({
        v: cur.view === DEFAULT_VIEW ? null : cur.view,
        z: cur.zone,
        l: cur.layer,
        d: cur.dim === '2d' ? null : cur.dim,
        ...extra,
      }, { push: true });
    };
    const onPop = () => {
      /* ⚠️ 2026-09-30: НҮҮР ХУУДАС РУУ Back (URL-д порталын хүрээ үлдээгүй — `inPortalUrl`)
         нь харагдац солих БИШ, ПОРТАЛААС ГАРАХ: `Root` Portal-ыг бүхэлд нь unmount хийнэ.
         Урьд нь энд `setView(DEFAULT_VIEW)` л дуудагддаг тул одоогийн харагдац нь
         анхдагч бол асуулт ОГТ гардаггүй, асуусан ч «Үгүй» гэхэд `Root`-ийн popstate
         (эхэлж бүртгэгдсэн) аль хэдийн нүүр рүү шилжүүлчихсэн байж хадгалаагүй ажил
         алга болдог байв. Одоо лого/«Гарах»-тай ИЖИЛ `confirmLeave()`; татгалзвал
         `all=1`-тэй URL-ыг буцааж бичнэ — `Root` өөрийн сонсогчийг хойшлуулж
         (`setTimeout`) ЭНЭ сэргээсэн URL-ыг уншина. */
      if (!inPortalUrl()) {
        if (!confirmLeave()) restoreUrl({ all: '1' });
        return;
      }
      // `setView` нь харагдацын бүрэн шинэчлэл (шүүлт цэвэрлэх г.м.) хийдэг
      // ⚠️ Эрхгүй харагдац руу Back хийвэл хайчилж, URL-ыг replace-ээр засна
      //    (push хийвэл доорх guard-тай гогцоо үүснэ)
      const next = clampView(initialView(), navScope);
      /* ⚠️ 2026-09-25: Хэрэглэгч «Гарах уу?»-д ҮГҮЙ гэвэл харагдац хэвээр ч
         урьд нь доорх бүс/давхарга/горимыг ӨМНӨХ бичлэгээс тавьж, URL нь өөр
         харагдацыг заасан хэвээр үлддэг байв (төлөв ≠ URL, F5 → буруу
         харагдац). Татгалзвал юуг ч хөндөхгүй, одоогийн төлөвийг URL-д
         PUSH-ээр буцааж бичнэ — Back-ийн өмнөх бичлэг түүхэнд хэвээр. */
      if (!setView(next)) {
        restoreUrl();
        return;
      }
      if (next !== initialView()) lastViewRef.current = next;
      setZone(readParam('z'));
      setLayer(initialLayer());
      setDim(initialDim());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView, navScope, confirmLeave]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: эрхийн хүрээ АЖИЛЛАЖ БАЙХАД хумигдахад (гаднын permissions store) харагдацыг шилжүүлэх; `setView` нь шүүлт/сонголт цэвэрлэх гаднын нөлөөтэй тул рендер дотор тооцож болохгүй
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
   * ОРТОФОТО — харагдац бүрийн анхдагч.
   *
   * ⚠️ 2026-08-28 (хэрэглэгчийн хүсэлт): «Ерөнхий дашбоард» ба «Ерөнхий
   * төлөвлөгөө» ХОЁРООС БУСАД бүх харагдац эхний оролтод ортофототой нээгдэнэ.
   * Урьд нь (2026-07-31) зөвхөн pkgFin/pkgProg/habea асаалттай, бусад нь
   * топографи байв. Тэр хоёр нь төлөвлөлтийн бүсчлэл/давхаргыг өнгөөр уншдаг
   * тул топографи хэвээр; бусад нь бодит талбайтай тулгаж хардаг.
   *
   * Харагдац дотроо гараар унтраасан/асаасан нь дараагийн солилт хүртэл үлдэнэ.
   * `Ersdel` өөрөө ч `setOrtho(true)` хийдэг — энэ дүрэмтэй нийцнэ.
   */
  const { setOrtho, view: mapView } = useMap();
  useEffect(() => {
    /* ⚠️ 2026-09-24: «Инженерийн дэд бүтэц» ч ортофотогүй нээгдэнэ — суурь нь
       LIGHT GRAY CANVAS (доор), ортофото түүнийг бүрхэж шугам уншигдахгүй. */
    setOrtho(view !== 'gdash' && view !== 'dashboard' && view !== 'plan' && view !== 'dedButets');
  }, [view, setOrtho]);
  /* Суурь зураг: дэд бүтэц — LIGHT GRAY CANVAS, бусад — хиймэл дагуул */
  useEffect(() => {
    applyViewBasemap(mapView, view === 'dedButets' ? 'gray-vector' : 'satellite', view);
  }, [view, mapView]);

  /* ── Багануудын өргөн ── */

  // Самбар БАРУУН талд тул зүүн тийш чирэхэд өргөснө → тэмдэг урвуу
  const panelSize = useColumnResize({
    min: PANEL_MIN, max: PANEL_MAX, initial: PANEL_DEFAULT, storageKey: PANEL_KEY, dir: -1,
  });
  // Каталог ЗҮҮН талд — баруун тийш чирэхэд өргөснө
  const catSize = useColumnResize({
    min: CAT_MIN, max: CAT_MAX, initial: CAT_DEFAULT, storageKey: CAT_KEY, dir: 1,
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
  /**
   * «ХУВААРЬ БАТЛАХ» → «ХУВААРЬ» ДАМЖУУЛАЛТ — ЗӨВХӨН САНАХ ОЙД.
   *
   * Батлах дараалал дээр «Хуваарь хуудсанд батлах» дарахад тэр багцаар
   * `Huvaari` нээгдэж, шийдвэрлэх цонх өөрөө гарна (батлах логик тэнд л
   * байна, хуулбарлагдаагүй — `HuvaariBatlah.tsx`-ийн толгойг үз).
   *
   * ⚠️ URL-Д БИЧИХГҮЙ: `writeParams` (urlState.ts) нь ТАНИХГҮЙ түлхүүрийг
   *    хөнддөггүй тул `?approve=<oid>` нь харагдац солиход ч, F5-д ч ҮЛДЭЖ,
   *    аль хэдийн шийдвэрлэгдсэн саналын цонхыг ДАХИН нээх байлаа. Мөн
   *    хуваалцсан холбоос нь бусдад ч тэр цонхыг нээнэ.
   * ⚠️ `sessionStorage` ч мөн адил F5-ыг ДАВНА — яг тэр эрсдэлээс
   *    зайлсхийх шаардлагатай. React төлөв нь refresh-д үхдэг тул
   *    цэвэрлэх юм байхгүй: энэ нь шинж, хязгаарлалт биш.
   */
  const [planJump, setPlanJump] = useState<PlanJump | null>(null);
  const clearPlanJump = useCallback(() => setPlanJump(null), []);
  // `standalone` нь бүтэн дэлгэцийн харагдацуудыг ЯГ тэмдэглэдэг — тусад нь тоолохгүй
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
        className={`${s.shell} ${isFull ? s.shellSuit : ''} ${!isFull && !planPanel ? s.shellFoot : ''} ${navMin ? s.shellNavMin : ''}`}
        style={{
          '--panel': panelVar,
          '--catalog': `${catSize.width}px`,
        } as CSSProperties}
      >
        <header className={s.head}>
          {/* Лого/нэр дээр дарахад НҮҮР рүү буцна (onHome өгөгдсөн бол товч болно) */}
          <button
            type="button"
            className={s.brand}
            /* ⚠️ 2026-09-30: `confirmLeave` — хадгалаагүй ажлын хамгаалалт (дээрх ⚠️) */
            onClick={onHome ? () => { if (confirmLeave()) onHome(); } : undefined}
            disabled={!onHome}
            title={onHome ? tr('Нүүр хуудас руу буцах') : undefined}
          >
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

            {/* ⚠️ 2026-09-30: ТУСЛАМЖ — хэрэглэгчийн эрхэнд байгаа хэсэг бүр юунд
                зориулагдсан, хэн ашигладгийг тайлбарлана (`HelpPanel`). Баруун
                захад: анхны зөвлөмжийн сум (`help.module.css` §tipArrow) үүнийг заана. */}
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => setHelpOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
              aria-label={tr('Тусламж — хэсэг бүр юунд зориулагдсан')}
              title={tr('Тусламж — хэсэг бүр юунд зориулагдсан')}
            >
              <span aria-hidden style={{ fontWeight: 700, fontSize: 16, lineHeight: 1 }}>?</span>
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
            /* ⚠️ Нэвтэрсэн үед л (2026-09-23): auth унтраалттай (`off`) бол гарах
               зүйл байхгүй тул мөр гарахгүй. */
            userName={auth.user?.fullName || auth.user?.username}
            onSignOut={auth.status === 'signed-in' ? () => { if (confirmLeave()) void auth.signOut(); } : undefined}
            badges={badges}
          />
        </aside>

        {/* Бүтэн талбайн харагдацууд — ерөнхий дашбоард ба анализ */}
        {isFull && (
          <div className={s.suit}>
            {/* ⚠️ ХАРАГДАЦ БҮР ТУСДАА ХАШЛАГАД (2026-09-03-ны аудит): нэг
                модулийн рендерийн throw бүх порталыг үхүүлдэг байв — навигац,
                каталог, ХАДГАЛААГҮЙ НООРОГ бүгд алга болно. `key={view}` нь
                харагдац солиход хашлагыг remount хийж, хуучин алдааг арилгана. */}
            <ErrorBoundary scope="view" key={view} label={tr('«{0}» нээгдсэнгүй', VIEW_BY_KEY[view].title)}>
              {/* ⚠️ 2026-09-30: харагдац → модуль нь `viewRegistry.tsx`-ийн НЭГ
                  хүснэгт (урьд нь энд 20 давхар гурвалсан оператор байв).
                  Модуль бүр контекстоос зөвхөн өөрт хэрэгтэй пропоо авна. */}
              <ViewSlot
                view={view}
                ctx={{ dim, setDim, zone, setZone, navScope, setView, planJump, setPlanJump, clearPlanJump }}
              />
            </ErrorBoundary>
          </div>
        )}

        {!isFull && (
          <>
            <div className={s.map}>
              <MapCanvas
                dim={dim}
                visible={visible}
                opacity={opacity}
                zone={zone}
                /* ⚠️ Явган хүний зам нь ЗӨВХӨН «Ерөнхий төлөвлөгөө»-д үргэлж
                   асаалттай (`services.ts` §PLAN_ALWAYS_ON_IDS). */
                alwaysOn={planPanel ? PLAN_ALWAYS_ON_IDS : undefined}
                onPick={pick}
              />

              {/* Газрын зургийн НЭГДСЭН хэрэгслийн зурвас — бүх харагдацад ижил
                  (`MapTools`). Урьд нь энэ блок энд гараар бичигдсэн байв. */}
              <MapTools
                dim={dim}
                setDim={setDim}
                layersOpen={catOpen}
                onLayers={() => setCatalog((v) => !v)}
                opacityOpen={opacityOpen}
                /* ⚠️ Тунгалаг нь `setView`-д ТЭГЛЭГДДЭГГҮЙ (санаатай — доорх
                   `setView`-ийн жагсаалтыг үз) тул өмнөх харагдацад 10% болгосон
                   давхарга энд ч бүдэг хэвээр. Товчны тэмдэг нь тэр далд төлөвийг
                   ил болгоно (2026-09-15-ны хэрэглээний аудит). */
                opacityCount={Object.values(opacity).filter((v) => v < 1).length}
                onOpacity={() => setOpacityOpen((v) => !v)}
                zone={zone}
                setZone={setZone}
                /* ⚠️ ЗҮҮН ХАВТАС — ЗӨВХӨН энэ харагдацад (2026-09-15,
                   хэрэглэгчийн заавар). Бусад зураг хуучин зохиомжтой. */
                dock
              />

              {/* Тунгалаг тохируулах хөвөгч цонх */}
              {opacityOpen && (
                <OpacityPanel
                  visible={visible}
                  opacity={opacity}
                  setOpacity={setOpacity}
                  onClose={closeOpacity}
                  dock
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
                    view="plan"
                    totals={totals}
                    visible={visible}
                    setVisible={setVisible}
                    selected={layer}
                    onSelect={setLayer}
                    onClose={closeCatalog}
                    forced={planPanel ? PLAN_ALWAYS_ON_IDS : undefined}
                    pinned={false}
                    embedded
                    resizing={catSize.dragging}
                    onResizeStart={catSize.onPointerDown}
                    onResizeReset={catSize.onDoubleClick}
                    onResizeKey={catSize.onKeyDown}
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
                tabIndex={0}
                aria-valuenow={panelSize.width}
                aria-valuemin={PANEL_MIN}
                aria-valuemax={PANEL_MAX}
                onPointerDown={panelSize.onPointerDown}
                onDoubleClick={panelSize.onDoubleClick}
                onKeyDown={panelSize.onKeyDown}
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

              {/* ⚠️ Баруун самбар нь газрын зурагтай ХАМТ зурагддаг тул
                  түүний уналт зургийг ч авч унагадаг байв — тусад нь хашина. */}
              <div className={s.panelBody}>
                <ErrorBoundary scope="view" key={`panel-${view}`} label={tr('Самбар нээгдсэнгүй')}>
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
                </ErrorBoundary>
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

      {/* Порталын тусламж ба анхны оролтын зөвлөмж (2026-09-30) */}
      <HelpPanel open={helpOpen} onClose={closeHelp} navScope={navScope} view={view} onGo={setView} />
      {!helpOpen && <HelpTip onOpen={() => setHelpOpen(true)} />}

      {/* AI туслах — бүх харагдацад нэг л удаа (яриа харагдац соливол тасрахгүй) */}
      <AgentButton open={agentOpen} onToggle={() => { setAgentMounted(true); setAgentOpen(true); }} />
      {/* ⚠️ 2026-10-04: анх НЭЭХЭД л mount (дээрх `agentMounted`-ийн ⚠️) — дараа нь хаасан ч
          mount хэвээр тул яриа хадгалагдана. */}
      {agentMounted && <AgentChat open={agentOpen} onClose={() => setAgentOpen(false)} scope={navScope} />}
    </>
  );
}

/* ── «Барилгын хяналт»-ын хүрээ ── */

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
    const zoneQ = zone ? zoneWhere(ZONE_LAYER, zone) ?? '1=1' : '1=1';
    const builtQ = zone ? zoneWhere(BUILT_LAYER, zone) ?? '1=1' : '1=1';
    /* ⚠️ 2026-09-22 (өгөгдлийн аудит): «айл» ба «хүн ам» нь урьд нь /106 `URH_TOO`
       (8,591) ба /108 `Total_population` (68,326 — `live.ts:35`-д ХОРИОТОЙ багтаамжийн
       тоо) байсан бөгөөд бусад БҮХ харагдацын `loadHousing().ail` (/112 AIL_TOO) ·
       `loadHeadline().population` (/108 `Population`)-той зөрдөг байв. Одоо бүс
       СОНГООГҮЙ үед яг тэр хоёр эхээс; бүс сонгосон үед /108-ыг бүсээр шүүж
       `Population` (`POPULATION_FIELD`) талбараар, айлыг /112-т бүсийн талбар
       байхгүй тул /106 `URH_TOO`-оор (бүсийн төлөвлөлтийн өрх) авна. */
    const [zones, built, headline, housing] = await Promise.all([
      queryStats(layerUrl(ZONE_LAYER), [
        count(oidOf(ZONE_LAYER), 'n'), sum(Z.landHa, 'ga'), sum(Z.households, 'ail'),
      ], zoneQ),
      queryStats(layerUrl(BUILT_LAYER), [count(oidOf(BUILT_LAYER), 'n'), sum(POPULATION_FIELD, 'pop')], builtQ),
      loadHeadline(),
      loadHousing(),
    ]);
    /* ⚠️ 2026-09-25: SUM нь мөргүй/бүх утга хоосон үед `null` буцаадаг —
       `Number(x ?? 0)` нь «мэдээлэлгүй»-г «0 га / 0 хүн» гэж худал харуулдаг
       байв (null ≠ 0). COUNT нь үргэлж тоо тул `?? 0` хэвээр. */
    const orNull = (v: unknown): number | null => {
      const n = v == null ? NaN : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      zones: Number(zones.n ?? 0),
      /**
       * ⚠️ Бүс сонгогдсон үед тэр бүсийн `GAZAR_GA`; сонгоогүй үед хилийн
       * давхаргын АМЬД `Hec_area` (урьд нь бэхлэгдсэн 158 га байсан). Бүх
       * бүсийн нийлбэр (~131 га) нь зөвхөн бүсчилсэн газрыг хамардаг тул
       * төслийн хэмжээг илэрхийлэхгүй.
       */
      ga: zone ? orNull(zones.ga) : headline.areaHa,
      ail: zone ? orNull(zones.ail) : housing.ail,
      built: Number(built.n ?? 0),
      pop: zone ? orNull(built.pop) : headline.population,
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
      {zone && <span className={s.sumZone}>{zonesLabel(zone.split(',').filter(Boolean))}</span>}
      {items.map((i) => (
        <div key={i.l} className={s.sumStat}>
          <span className={`${s.sumValue} num`}>{i.v}</span>
          <span className={s.sumLabel}>{i.l}</span>
        </div>
      ))}
    </div>
  );
}

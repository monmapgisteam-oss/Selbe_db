'use client';

import {
  Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ErrorInfo, type ReactNode,
} from 'react';
/* ⚠️ 2026-10-23: Environment — толгой/dock/KPI-ийн дүрс lucide-react-ээс шууд */
import {
  Building2, CircleQuestionMark, House, LandPlot, LoaderCircle, LogOut, MapPin, Moon,
  RefreshCw, Shapes, Sun, User, Users, type LucideIcon,
} from 'lucide-react';
import { MapCanvas, MapProvider, applyViewBasemap, useMap, type Dim, type MapLayerFilter } from '@/components/MapCanvas';
import { PlanOverlapLayers, PlanOverlapPanel, OVERLAP_LAYER_ID, type OverlapFocus } from '@/components/PlanOverlap';
import { CompareLabels, DetailLayerMenu, SwipeToggle, layerItems, type DetailGroup } from '@/components/DetailLayers';
import { HesegPanel, type HesegTab } from '@/components/HesegPanel';
import { ChangePanel, type ChangePick } from '@/components/HesegChange';
import { ChangeMapFocus } from '@/components/ChangeMapFocus';
import { ChangeBoundary } from '@/components/ChangeBoundary';
import { NeedPanel, NeedLayer, useNeedSelection, resetNeedSelection, NEED_COMPARE_LAYERS } from '@/components/HesegNeed';
import { OVERLAP_CATS, infraIdsOfType, type OverlapCat } from '@/lib/planOverlap';
import { hesegMapLayers } from '@/lib/hesegMap';
import { t as tr } from '@/lib/i18nCore';
import { ViewRail, type NavBadges } from '@/components/ViewRail';
import { HelpPanel, HelpTip } from '@/components/HelpPanel';
import { loadNavBadges, makeBadgeRefresher, mergeNavBadges, subscribeNavBadges, BADGE_VIEWS } from '@/components/navBadges';
import { subscribeData, invalidateAll, dataRefreshedAt } from '@/lib/dataBus';
import { friendlyError } from '@/components/ui';
import { useAuth } from '@/components/AuthGate';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { MapTools } from '@/components/MapTools';
import { ResizableColumns } from '@/components/ResizableColumns';
import { zonesLabel } from '@/components/ZoneFilter';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import dynamic from 'next/dynamic';
/* ⚠️ 2026-09-30: харагдацын модулиуд (статик `Dashboard` + бүх `dynamic` chunk)
   ба тэдгээрийн ⚠️ шийдвэрүүд `viewRegistry.tsx`-д — шинэ харагдац нэмэхэд
   энд ЮУ Ч засахгүй. */
import { ViewSlot, type PlanJump } from '@/components/viewRegistry';
import { ErrorBoundary, chunkErrorText, isChunkLoadError } from '@/components/ErrorBoundary';
import { Icon } from '@/components/Icon';
import { DocViewer } from '@/components/DocViewer';
import { LocaleToggle, hasUnsavedWork } from '@/components/LocaleToggle';
/* ⚠️ 2026-10-04: товч нь тусдаа хөнгөн файлаас — `AgentChat` нь доор `dynamic` (`AgentButton.tsx`-ийн ⚠️) */
import { AgentButton, AgentLoading } from '@/components/AgentButton';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { FilterProvider, useFilter } from '@/lib/filter';
import { usePlanTotals } from '@/lib/totals';
import { queryStats, count, sum } from '@/lib/query';
import { loadHeadline, loadHousing, POPULATION_FIELD } from '@/lib/live';
import {
  DEFAULT_VIEW, VIEW_BY_KEY, layerUrl, oidOf, zoneWhere,
  PLAN_LAYER_IDS, LAYER_BY_ID, groupOf,
  ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER,
  PLAN_ALWAYS_ON_IDS, DED_BUTETS_LAYER_IDS, INFRA_SYSTEMS,
  type ViewKey,
} from '@/lib/services';
import { readParam, writeParams, foreignViewParams } from '@/lib/urlState';
import { planNavBusy } from '@/lib/huvaariBatlah';
/* ⚠️ 2026-09-29 (аудит 10): импортгүй хөнгөн lib — `Finance` өөрөө `dynamic` */
import { finNavDirty } from '@/lib/finEdit';
/* ⚠️ 2026-09-30: харагдацын ерөнхий «хадгалаагүй засвар» туг — импортгүй lib (`confirmLeave`) */
import { navDirtyLabels } from '@/lib/navGuard';
import { num } from '@/lib/format';
import { ReportButton } from '@/components/ReportButton';
/* ⚠️ 2026-10-19: «Систем түр хаах» — удирдлагын цонх ба шар зурвас (жижиг, ArcGIS-гүй) */
import { SystemCloseDialog, SystemClosedStrip, useCanCloseSystem, useSystemClosed } from '@/components/SystemCloseDialog';
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
/* ⚠️ 2026-10-06 (аудит): `loading` — chunk татагдах хооронд хоосон дэлгэц биш мэдэгдэл.
   `UserAdmin` нь super-т ХААЛТТАЙ байхад ч mount болдог (дээрх ⚠️) тул түүний мэдэгдэл
   ЗӨВХӨН цонх нээгдсэн үед (`AdminOpenCtx`) — эхлэлд super-т анивчихгүй. */
const AdminOpenCtx = createContext(false);
function AdminLoading() {
  const open = useContext(AdminOpenCtx);
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,0.25)', color: 'var(--ink)', fontSize: 13,
      }}
    >
      <span style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
        {tr('Ачаалж байна…')}
      </span>
    </div>
  );
}
/**
 * ХӨВӨГЧ ЦОНХНЫ ХАШЛАГА (⚠️ 2026-10-06, аудит).
 * ⚠️ `ErrorBoundary scope="view"` нь fallback-аа УРСГАЛД (`minHeight: 240`) зурдаг — харагдацын
 *    саванд зөв, харин Portal-ын төгсгөлийн хөвөгч цонхнуудад (DocViewer · UserAdmin · HelpPanel ·
 *    AgentChat — бүгд `position: fixed`) тэр нь 100dvh-ийн shell-ийн ДООР, дэлгэцээс гадна гарна.
 *    Энд fallback нь баруун доод буланд ТОГТМОЛ мэдэгдэл: chunk-ийн алдаа (шинэ хувилбар) →
 *    «Хуудсыг дахин ачаалах» (`ErrorBoundary.isChunkLoadError`-ийн ⚠️ — автоматаар reload ХИЙХГҮЙ);
 *    бусад → «Хаах» (цонхыг хааж хашлагыг цэвэрлэнэ, дахин нээж болно).
 */
class OverlayBoundary extends Component<
  { children: ReactNode; label: string; onReset: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OverlayBoundary:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    const btn: CSSProperties = {
      padding: '5px 12px', borderRadius: 8, border: '1px solid var(--line-strong)',
      background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', cursor: 'pointer',
    };
    return (
      <div
        role="alert"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 3600, display: 'grid', gap: 8,
          maxWidth: 'min(360px, calc(100vw - 32px))', padding: '12px 14px', borderRadius: 10,
          background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-strong)',
          boxShadow: 'var(--shadow)', fontSize: 12.5,
        }}
      >
        <b>{this.props.label}</b>
        {chunk && <span>{chunkErrorText()}</span>}
        <div>
          {chunk ? (
            <button type="button" style={btn} onClick={() => location.reload()}>{tr('Хуудсыг дахин ачаалах')}</button>
          ) : (
            <button type="button" style={btn} onClick={() => { this.props.onReset(); this.setState({ error: null }); }}>
              {tr('Хаах')}
            </button>
          )}
        </div>
      </div>
    );
  }
}

const UserAdmin = dynamic(() => import('@/components/UserAdmin').then((m) => m.UserAdmin), {
  ssr: false,
  loading: () => <AdminLoading />,
});
const AgentChat = dynamic(() => import('@/components/AgentChat').then((m) => m.AgentChat), {
  ssr: false,
  loading: () => <AgentLoading />,
});

import s from '@/app/shell.module.css';
/* ⚠️ 2026-10-21 (аудит): эрх хасагдсан харагдацын хаалтын цонх (`ViewLost`) — `AuthGate`-ийн цонхнуудтай нэг загвар */
import a from '@/components/auth.module.css';
import { useFocusTrap } from '@/lib/useFocusTrap';

/** Тэмдэггүй үеийн ТОГТМОЛ лавлагаа — `ViewRail`-д рендер бүрт шинэ объект өгөхгүй */
const EMPTY_BADGES: NavBadges = {};
/** ⚠️ 2026-10-22: нуугдмал самбарын (`hesegET`) тоо — татахгүй, «ачаалж буй» (хоосон Map-ыг уналт гэж зурахгүй) */
const TOTALS_IDLE = { state: 'loading', data: null, error: null } as const;
/**
 * ⚠️ 2026-10-22 (аудит): ЯВЖ БУЙ БИЧИЛТИЙН (`setNavDirty`-ийн `-send`/`-apply` түлхүүртэй) тугуудын нэрс — «Гүйцэтгэл
 *    бөглөх»-ийн илгээлт (`fillnew-send`), «Гүйцэтгэлийн хяналт»-ын шийдвэр (`hyanalt-apply`), нэмэлт ажил буулгалт
 *    (`ajil-apply`). `navGuard` түлхүүрийг гаргадаггүй тул НЭРЭЭР тулгана (дуудагч бүр ижил `tr()`-ээр өгдөг). Эрх хасагдсан
 *    харагдацын товч (`setView` `force`) хадгалаагүй засварын асуултыг алгасдаг ч эдгээрийг АСУУСААР (`confirmLeave`-ийн
 *    `busyOnly`). Шинэ ийм туг нэмбэл нэрийг энд нэмнэ — `portalLeave.check.mjs` эх кодоос тулгаж унагана.
 */
const navBusyLabels = (): string[] => {
  const busy = new Set([
    tr('Гүйцэтгэл илгээж байна'),
    tr('Гүйцэтгэлийн шийдвэр хадгалж байна'),
    tr('Нэмэлт ажлыг хуудсанд буулгаж байна'),
  ]);
  return navDirtyLabels().filter((l) => busy.has(l));
};
/**
 * «Хэсэгчилсэн ЕТ» (`hesegET`) — ХЭСЭГ БҮРИЙН газрын зургийн давхаргууд (2026-10-13, хэрэглэгчийн заавар).
 * ⚠️ Модулийн ТОГТМОЛ — `MapCanvas`-ийн эффектийг рендер бүрт дэмий эргүүлэхгүй.
 */
/** Шинэчлэгдсэн (`rd:*`, Redesign): бүс + `OVERLAP_CATS`-ийн шинэ давхаргууд */
const DETAIL_NEXT_LAYERS: string[] = ['rd:2', ...OVERLAP_CATS.flatMap((c) => c.next)];
/**
 * Сонголтгүй үед Swipe-ийн зүүн тал (хуучин ЕТ): ЗӨВХӨН бүс ба барилга — «Ерөнхий дашбоард»-ын зурагтай
 * ИЖИЛ (`VIEW_BY_KEY.gdash` = `zone` · `et:24`; 2026-10-14, хэрэглэгч: «хуучин ЕТ харагдацыг зөвхөн zone
 * болон барилга харагдаж байх»). Урьд нь план 2D-ийн бүх 14 давхарга байв.
 */
/* + хуучин ЕТ-ийн «Автозам» (`sb:2`, 2026-10-14 хэрэглэгч: «бүс ба барилга + зам») */
/**
 * + дугуйн зам (`sb:15`) · явган хүний зам (`et:27`) · ногоон байгууламж (`sb:1`) — давхаргын цэсэнд
 * АНХДАГЧААР УНТРААЛТТАЙ (`OLD_ET_OPTIONAL` → `detailHidden`-ийн анхны утга), чагтлахад асна
 * (2026-10-14, хэрэглэгч: «check буюу асаагаад map дээр харж болохоор оруул, чагтлаагүй байдлаар»).
 */
const OLD_ET_OPTIONAL: string[] = ['sb:15', 'et:27', 'sb:1'];
const OLD_ET_LAYERS: string[] = [ZONE_LAYER.id, BUILT_LAYER.id, 'sb:2', ...OLD_ET_OPTIONAL];
/**
 * 01 «Өөрчлөлт» — SWIPE: ЗҮҮН нь 13-р ЕТ-ийн зураг, БАРУУН нь шинэ хэсэгчилсэн ЕТ (хэрэглэгч: «харьцуулах
 * хэсэг нь 13 дээр байгаа ерөнхий төлөвлөгөөний map»). Мөр сонгоход ИЖИЛ СЭДВИЙН хоёр давхарга
 * (`CHANGE_ITEMS` `now` ↔ `next`) үлдэнэ. Хуучин бүс нь сонголтгүй эсвэл «Бүс» сонгосон үед асна.
 * ⚠️ Инженерийн шугам 01-д ХАРАГДАХГҮЙ («шугам сүлжээний мэдээлэл харуулахаа боль»).
 */
const H01_SWIPE = {
  /* Сэдэв сонгоход харагдах хуучин давхаргууд (`OVERLAP_CATS.now`) ч ЗҮҮН талд таслагдана */
  leading: [...new Set([...OLD_ET_LAYERS, ...OVERLAP_CATS.flatMap((c) => c.now)])],
  trailing: DETAIL_NEXT_LAYERS,
};
/** The selected intersections are isolated from the partial plan in compare mode. */
const H02_SWIPE = { leading: DETAIL_NEXT_LAYERS, trailing: [OVERLAP_LAYER_ID.next] };
const H03_SWIPE = { leading: DED_BUTETS_LAYER_IDS, trailing: [...DETAIL_NEXT_LAYERS, ...NEED_COMPARE_LAYERS.trailing] };

/**
 * Багануудын АНХНЫ өргөн (px) — `ResizableColumns` (⚠️ 2026-10-23: Environment — каталог · зураг · самбар
 * гурван чирэгддэг багана). Хязгаар (зүүн ≤560 · баруун ≤720) нь урьдын `useColumnResize`-тэй ИЖИЛ; доод нь 180
 * (Environment). Чирэлтийн логик (try/catch хадгалалт · `lostpointercapture` · гараар) `ResizableColumns`-д шилжив.
 * Хуучин түлхүүрүүдийг (`selbe-catalog-width` · `selbe-panel-width`) нэг удаа уншина — хэрэглэгчийн өргөн алдагдахгүй.
 */
const CAT_DEFAULT = 286;
const PANEL_DEFAULT = 360;
const COL_LEGACY = { left: 'selbe-catalog-width', right: 'selbe-panel-width' };

/**
 * ⚠️ 2026-10-05: СҮЛЖЭЭНИЙ ТӨЛӨВ (`navigator.onLine` + online/offline үйл явдал) — толгойн
 *    «Сүлжээний холболт тасарсан» туузад. `subscribe` нь модулийн түвшинд (тогтмол лавлагаа —
 *    `useSyncExternalStore` рендер бүрд дахин бүртгэхгүй).
 * ⚠️ `onLine === true` нь интернэт БАЙГАА гэсэн баталгаа биш (зөвхөн сүлжээний интерфейс) —
 *    тиймээс тууз нь зөвхөн ТАСАРСАН-ыг хэлнэ; хүсэлтийн алдаа урьдын адил карт бүрд гарна.
 */
const subscribeOnline = (fn: () => void): (() => void) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
};
const isOnline = (): boolean => navigator.onLine;

/** Таб ЭНЭ хугацаанаас удаан нуугдаад буцаж ирвэл бүх кэшийг хаяна (`live.SESSION_TTL_MS`-тэй ижил) */
const AWAY_REFRESH_MS = 5 * 60_000;
const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

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
        /* ⚠️ 2026-10-23: Environment — цэнхэр радиал градиент → хуудасны paper (--bg), эргэгч нь lucide
           Loader2 (--data); градиент/туяа хэрэглэхгүй (дизайны дүрэм) */
        gap: 22, background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
      <style>{'@keyframes selbeSpin{to{transform:rotate(360deg)}}@keyframes selbePulse{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
      <img src="/logo.svg" alt="" width={60} height={60} style={{ animation: 'selbePulse 1.8s ease-in-out infinite' }} />
      <LoaderCircle size={32} strokeWidth={1.5} aria-hidden style={{ color: 'var(--data)', animation: 'selbeSpin .9s linear infinite' }} />
      <div style={{ fontSize: 13, fontWeight: 500 }}>{tr('Дашбоард ачаалж байна…')}</div>
      {/* ⚠️ 2026-09-25: «20 минутын хот» → «Ухаалаг хот» — Home/Landing-ийн брэндтэй
          НЭГ нэр (2026-08-24-ний хэрэглэгчийн шийдвэр, тэдгээрийн ⚠️-г үз). */}
      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
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
  /* ⚠️ 2026-10-13: «Хэсэгчилсэн ЕТ» мөн ЗААВАЛ 2D — swipe нь зөвхөн MapView-д ажилладаг */
  if (initialView() === 'dedButets' || initialView() === 'hesegET') return '2d';
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
  // ⚠️ 2026-10-23: Environment — дахин чирэгддэг ЗҮҮН БАГАНА (`ResizableColumns`, хэрэглэгчийн шийдвэр:
  //    «KPI мөр + 3 багана»). Нээх/хаах төлөв (энэ `catalog`) ба бүх товч хуучнаараа.
  const [catalog, setCatalog] = useState(true);
  const [layer, setLayer] = useState<string | null>(initialLayer);
  /**
   * «ХЭСЭГЧИЛСЭН ЕТ» (`hesegET`) — гурван хэсэг (2026-10-13, хэрэглэгчийн заавар):
   *   01 `change` — ерөнхий төлөвлөгөөний өөрчлөлт (тоо хэмжээ + хуучнаас нэмэгдсэн);
   *   02 `overlap` — одоо байгаа дэд бүтэцтэй давхцал (багц ажлын давхаргаар);
   *   03 `need` — дэд бүтэц хүртээмжгүй шинэ барилгын нэмэлт холболт.
   * ⚠️ Урьд «Ерөнхий төлөвлөгөө»-ний «Detail»/«Одоо» горим байсныг ТУСДАА харагдац болгов —
   *    «Ерөнхий төлөвлөгөө» анхныхаа хэвээр.
   */
  const [hesegTab, setHesegTab] = useState<HesegTab>('change');
  /** 01-д СОНГОСОН мөр — зураг дээр тэр ангиллын давхаргууд л үлдэнэ (ЕТ-ний карт шиг) */
  const [hesegPick, setHesegPick] = useState<ChangePick>(null);
  /* `overlapFocus` — самбар ↔ зураг hover-ийн холбоо (`PlanOverlap.tsx`-ийн ⚠️). 02 нь ЗӨВХӨН шинэ тал. */
  const [overlapFocus, setOverlapFocus] = useState<OverlapFocus>(null);
  /* Самбарт ДАРЖ СОНГОСОН карт/мөр — hover байхгүй үед зураг дээр үлдэнэ (`PlanOverlap.tsx`-ийн ⚠️) */
  const [overlapSel, setOverlapSel] = useState<OverlapFocus>(null);
  /* 02-т чагтаар зураг дээр АСААСАН ангиллууд (`PlanOverlapPanel` §shown) — анхдагч нь унтраалттай */
  const [overlapShown, setOverlapShown] = useState<OverlapCat[]>([]);
  /**
   * Харьцуулах SWIPE АСААЛТТАЙ эсэх — зургийн «Харьцуулах» товч (`SwipeToggle`, fullscreen-ий доор).
   * ⚠️ 2026-10-13: анхдагч УНТРААЛТТАЙ (хэрэглэгч: «Swipe button дарахад compare хийдэг байх»).
   */
  const [hesegSwipe, setHesegSwipe] = useState(false);
  /* 03-т сонгосон инженерийн төрөл — зураг дээрх шугамыг тэр төрлөөр шүүнэ */
  const needSelection = useNeedSelection();
  /**
   * «Detail»-ийн давхаргын товчоор (`DetailLayerMenu`) УНТРААСАН давхаргууд (2026-10-13).
   * ⚠️ Хасагдсан жагсаалт (асаалттай биш) — анхдагч нь бүгд асаалттай.
   */
  const [detailHidden, setDetailHidden] = useState<string[]>(OLD_ET_OPTIONAL);
  const needExistingIds = useMemo(() => needSelection.type
    ? needSelection.ready ? infraIdsOfType(needSelection.type).filter((id) => DED_BUTETS_LAYER_IDS.includes(id)) : []
    : DED_BUTETS_LAYER_IDS, [needSelection.type, needSelection.ready]);
  const detailVisible = useMemo(() => hesegMapLayers({
    tab: hesegTab, compare: hesegSwipe,
    partial: DETAIL_NEXT_LAYERS, previous: OLD_ET_LAYERS,
    change: hesegPick, overlapActive: !!overlapSel || overlapShown.length > 0,
    needActive: !!needSelection.type || !!needSelection.zone || needSelection.priorityOnly,
    /* ⚠️ Сэдэв сонгосон бол тэр сэдвийн хуучин давхаргыг (жиш. дугуйн зам) анхдагч `OLD_ET_OPTIONAL` нуулт ДАРАХГҮЙ */
    hidden: hesegPick ? detailHidden.filter((id) => !(OLD_ET_OPTIONAL.includes(id) && hesegPick.oldLayers.includes(id))) : detailHidden,
    existing: needExistingIds,
  }), [detailHidden, hesegTab, hesegSwipe, hesegPick, overlapShown, overlapSel, needSelection.type, needSelection.zone, needSelection.priorityOnly, needExistingIds]);
  const detailFilters = useMemo<readonly MapLayerFilter[] | undefined>(() => {
    if (hesegTab === 'change') return hesegPick?.filters;
    if (hesegTab !== 'need' || !hesegSwipe || !needSelection.zone) return undefined;
    return [{ ids: DED_BUTETS_LAYER_IDS, ...(needSelection.existingGeometry
      ? { geometry: needSelection.existingGeometry } : { where: '1=0' }) }];
  }, [hesegTab, hesegPick, hesegSwipe, needSelection.zone, needSelection.existingGeometry]);
  /* Цэс зөвхөн одоогийн сонголтод зурагдах эх давхаргуудыг удирдана. */
  const detailGroups = useMemo<DetailGroup[]>(() => {
    if (hesegTab === 'change') {
      return [
        ...(hesegSwipe ? [{ key: 'now', title: tr('Ерөнхий төлөвлөгөө'), items: layerItems(hesegPick?.oldLayers ?? OLD_ET_LAYERS) }] : []),
        { key: 'next', title: tr('Хэсэгчилсэн ЕТ'), items: layerItems(hesegPick?.layers ?? DETAIL_NEXT_LAYERS) },
      ];
    }
    if (hesegTab === 'overlap' && (hesegSwipe || (!overlapSel && !overlapShown.length))) {
      return [{ key: 'next', title: tr('Хэсэгчилсэн ЕТ'), items: layerItems(DETAIL_NEXT_LAYERS) }];
    }
    if (hesegTab === 'need') {
      return [
        ...(hesegSwipe ? [{ key: 'existing', title: tr('Одоо байгаа инженерийн дэд бүтэц'), items: INFRA_SYSTEMS.map((system) => ({
          key: system.key, title: system.title, hue: system.hue, ids: system.ids.filter((id) => needExistingIds.includes(id)),
        })).filter((system) => system.ids.length > 0) }] : []),
        ...(!needSelection.type && !needSelection.zone && !needSelection.priorityOnly
          ? [{ key: 'next', title: tr('Хэсэгчилсэн ЕТ'), items: layerItems(DETAIL_NEXT_LAYERS) }] : []),
      ];
    }
    return [];
  }, [hesegTab, hesegSwipe, hesegPick, overlapSel, overlapShown.length, needSelection.type, needSelection.zone, needSelection.priorityOnly, needExistingIds]);

  /* ⚠️ 2026-10-23: Environment — ЗҮҮН ЦЭСНИЙ ХУРААХ/ДЭЛГЭХ (54px ↔ бүтэн, `selbe-nav-min`; 2026-08-18 ·
     08-25 · 09-30 · 10-06-ны шийдвэрүүд) ХАСАГДАВ: dock нь ҮРГЭЛЖ 104px (дүрс + товч шошго), бүтэн нэр
     tooltip-д (`ViewRail`). Хураах товч, түүний төлөв, хадгалалт байхгүй. */
  /* ⚠️ 2026-10-23 (хэрэглэгч: «menu хэсэгт хийсэн бүх засварыг буцаа»): цэс урьдын хэлбэрт — 244px ↔ 54px
     хураах (`selbe-nav-min`, анхдагч ХУРААСТАЙ — 2026-08-25 · 10-06-ны шийдвэр). */
  const [navMin, setNavMin] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem('selbe-nav-min') !== '0'; } catch { return true; /* private */ }
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
  const { clear: clearFilter, active: filterActive } = useFilter();
  /* ⚠️ 2026-10-07: `setView`-д ref-ээр — deps-д оруулбал шүүлт солигдох бүрд `setView` шинэчлэгдэнэ */
  const filterActiveRef = useRef(filterActive != null);
  useEffect(() => { filterActiveRef.current = filterActive != null; }, [filterActive]);

  /** ТЭЗҮ ба судалгааны баримт бичгийн глобал popup нээлттэй эсэх */
  const [docsOpen, setDocsOpen] = useState(false);
  /** Хэрэглэгчийн эрх удирдлагын modal (зөвхөн super admin) */
  const [adminOpen, setAdminOpen] = useState(false);
  /**
   * ⚠️ 2026-10-19: «Систем түр хаах» цонх — `sysClose` эрхтэй эсвэл кодын super (`useCanCloseSystem`). Цэсний «Систем»
   *    бүлэгт товч (`ViewRail.onSysClose`); хаалттай үед ЭНЭ хэрэглэгч нэвтэрсэн бол (эрхтэй) шар зурвас.
   */
  const [sysOpen, setSysOpen] = useState(false);
  const canSys = useCanCloseSystem(auth.user?.username, auth.status === 'signed-in');
  const sysNow = useSystemClosed();
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
  /* ⚠️ 2026-10-06 (аудит): тэмдэг ХЭНИЙХ болохыг хамт хадгална — уналтад өмнөх тоо хэвээр
     үлдэх (`mergeNavBadges`) тул хэрэглэгч солигдоход өмнөх хүний тоо нөгөөд гарахгүй. */
  const [badgeState, setBadgeState] = useState<{ who: string | null; b: NavBadges }>({ who: null, b: {} });
  const badgeUser = auth.user?.username ?? null;
  const badges = badgeState.who === badgeUser ? badgeState.b : EMPTY_BADGES;
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
    /* ⚠️ 2026-10-06 (аудит): БҮХ газрыг солихгүй, НИЙЛҮҮЛНЭ — унасан эх сурвалжтай харагдацад
       (`null`) өмнөх тоо хэвээр (дээрх «Алдаа чимээгүй — өмнөх тоо хэвээр»). Урьд нь «Гүйцэтгэл»-ийн
       нийлбэр (обьём + хяналт) нэг нь унахад ХАГАС дүн харуулдаг байв (`navBadges.mergeNavBadges`). */
    badgeRefresher(badgeUser, badgeScope).then((b) => {
      if (b) setBadgeState((prev) => ({ who: badgeUser, b: mergeNavBadges(prev.who === badgeUser ? prev.b : {}, b) }));
    }, () => { /* чимээгүй */ });
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

  /* ⚠️ 2026-10-22 (гүйцэтгэлийн аудит): урьд нь каталогийн БҮХ 158 давхаргыг (~156 статистик хүсэлт) харагдац нээх
     бүрд татдаг байв (2026-08-20: каталог бүх давхаргыг харуулдаг) — бүлгүүд хураалттай эхэлдэг, «Хэсэгчилсэн ЕТ»-д
     самбар нуугдмал тул тэр тоог хэн ч хараагүй байхад. Одоо ЗӨВХӨН самбарын тойм (`ViewPanel.PlanOverview` —
     `PLAN_LAYER_IDS`, «Ерөнхий мэдээлэл» л); каталог нээлттэй бүлгийнхээ тоог өөрөө татна (`LayerCatalog`-д
     `totals` өгөхгүй), сонгосон давхаргын самбар — өөрийнхөө. Бүгд давхарга тус бүрийн НЭГ кэшээс
     (`totals.layerTotalsShared`) тул тоо зөрөхгүй, давхардсан хүсэлтгүй. */
  const totals = usePlanTotals(zone, !standalone && view === 'plan', PLAN_LAYER_IDS);

  /* ⚠️ Хуваарийн батлах/хадгалах гинж явж байхад харагдац солихоос өмнө асууна
     (2026-09-25 аудит #4, `planNavBusy`-ийн ⚠️) — салгавал гинж дундаа тасарна. */
  const viewNowRef = useRef(view);
  /** Порталын ерөнхий мэдэгдлийн тууз: эрх хумигдаж харагдац солигдсон (⚠️ 2026-10-06),
   *  хадгалаагүй ажлаас болж автомат шинэчлэл хойшилсон (⚠️ 2026-10-12, `onVis`) */
  const [portalNotice, setPortalNotice] = useState<string | null>(null);
  /** ⚠️ 2026-10-12 (дарааллын аудит): таб буцахад хадгалаагүй ажлаас болж ХОЙШЛУУЛСАН шинэчлэл */
  const refreshDeferredRef = useRef(false);
  /* ⚠️ 2026-09-30: ref-ийг ЭФФЕКТЭД шинэчилнэ (рендер дотор бичих нь eslint
     react-hooks/refs). Уншигч нь зөвхөн үйл явдлын хариулагч ба доорх guard
     эффект — хоёулаа энэ эффектийн ДАРАА ажиллана (зарлалтын дараалал). */
  useEffect(() => { viewNowRef.current = view; });
  /* ⚠️ 2026-09-25: `boolean` буцаана — татгалзсан эсэхийг popstate мэдэх ёстой
     (доорх `onPop`-ийн ⚠️). */
  /* ⚠️ 2026-09-30: хамгаалалт ТУСДАА функц — харагдац солих, лого (нүүр рүү)
     ба «Гарах» ГУРВУУЛАА үүгээр явна. Урьд нь зөвхөн `setView`-д байсан тул
     лого эсвэл «Гарах» дарахад хадгалаагүй ажил асуултгүй алга болдог байв. */
  /* ⚠️ 2026-10-21 (аудит): `reason` — асуултын ӨМНӨ яагаад гарах болсныг хэлнэ (эрх хасагдсан үед
     урьд нь зөвхөн «Хадгалаагүй засвар байна. Гарах уу?» гарч, хэрэглэгч шалтгааныг мэдэхгүй
     «Болих» дарж эрхгүй харагдацдаа үлддэг байв — доорх эрхийн хамгаалалтын ⚠️). */
  const confirmLeave = useCallback((reason?: string, busyOnly = false): boolean => {
    const ask = (msg: string) => window.confirm(reason ? `${reason}\n\n${msg}` : msg);
    if (planNavBusy()
      && !ask(tr('Хуваарь хадгалагдаж/батлагдаж байна — одоо гарвал дундаа тасарч болзошгүй. Гарах уу?'))) return false;
    /* ⚠️ 2026-10-22 (аудит): `busyOnly` (эрх хасагдсан цонхны товч — `setView`-ийн `force`) — ЗӨВХӨН ЯВЖ БУЙ бичилтийг
       асууна: дээрх Хуваарийн гинж (`planNavBusy` — `Huvaari.tsx`-ийн «ГИНЖ ЯВЖ БАЙХАД ГАРАХГҮЙ» ⚠️) ба илгээлт/шийдвэр/
       буулгалт (`navBusyLabels`). Хадгалаагүй засварын асуултууд (доор) алгасагдана — товч өөрөө «алдагдана» гэж хэлдэг
       тул давхар асуухгүй (2026-10-21-ний шийдвэр хэвээр). Урьд нь `force` бүх асуултыг алгасаж модулийг бичилтийн
       дундуур unmount хийдэг байв. */
    if (busyOnly) {
      const busyL = navBusyLabels();
      return !busyL.length
        || ask(tr('{0}: бичилт явж байна — одоо гарвал дундаа тасарч болзошгүй. Гарах уу?', busyL.join(' · ')));
    }
    /* ⚠️ 2026-09-29 (аудит 10): Санхүүгийн бүртгэл / «Cashflow хувиарлах»-ын
       хадгалаагүй засвар — урьд нь зөвхөн `Finance` доторх таб солилтод асуудаг
       байсан тул өөр харагдац руу шилжихэд `pend`/`adds` баталгаагүй алга болдог байв. */
    if (finNavDirty()
      && !ask(tr('Санхүүгийн бүртгэлд хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?'))) return false;
    /* ⚠️ 2026-09-30: ЕРӨНХИЙ хамгаалалт (`navGuard.setNavDirty`) — «Дэд бүтэц», «Газар»,
       «Зөвшөөрөл» зэрэг харагдацын засварын маягт урьд нь харагдац солих, лого,
       «Гарах»-д асуултгүй алга болдог байв. Шинэ харагдац энд юу ч засахгүйгээр нэмэгдэнэ. */
    const labels = navDirtyLabels();
    if (labels.length
      && !ask(tr('{0}: хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?', labels.join(' · ')))) return false;
    /* ⚠️ 2026-10-06 (аудит): дээрх гурван тугт ОРООГҮЙ модулиуд (QAQC-ийн хадгалаагүй нүд,
       `useDraftSync`, CashflowPlan …) — тэдний `beforeunload` сонсогчоос асууна
       (`LocaleToggle.hasUnsavedWork`-ийн ⚠️). Дээр аль хэдийн асууж зөвшөөрсөн бол ДАХИН
       асуухгүй (тэр модулиуд ч `beforeunload` бүртгэдэг тул давхар асуулт гарна). */
    const asked = planNavBusy() || finNavDirty() || labels.length > 0;
    if (!asked && hasUnsavedWork()
      && !ask(tr('Хадгалаагүй өөрчлөлт байна. Гарвал алдагдана. Гарах уу?'))) return false;
    return true;
  }, []);
  /**
   * ⚠️ 2026-10-05: ӨГӨГДЛИЙН ШИНЭЧЛЭЛ. Кэшийн TTL нь ДАРААГИЙН дуудалтад л шалгагддаг тул
   *    нээлттэй харагдац өөрөө хэзээ ч дахин татдаггүй, `invalidateAll` зөвхөн хэл солиход
   *    холбогдсон байв — өглөө нээсэн дашбоард оройн тоог F5 дартал харуулдаггүй.
   *    (а) толгойн «Шинэчлэх» товч + «Өгөгдөл: HH:MM» (сүүлд БҮТНЭЭР шинэчилсэн / сешн эхэлсэн цаг);
   *    (б) таб `AWAY_REFRESH_MS`-ээс удаан нуугдаад буцаж ирэхэд автоматаар.
   * ⚠️ ХАДГАЛААГҮЙ ЗАСВАРТАЙ үед (б) АЖИЛЛАХГҮЙ, (а) асууна — дахин таталт засварын маягтын
   *    суурь өгөгдлийг сольж болзошгүй. `confirmLeave`-тэй ИЖИЛ гурван туг.
   */
  const dataAt = useSyncExternalStore(subscribeData, dataRefreshedAt, () => 0);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  /*
   * ⚠️ 2026-10-12 (дарааллын аудит): гурван туг ХАНГАЛТГҮЙ — `confirmLeave`-ийн адил
   *    `hasUnsavedWork()` (QAQC-ийн нүд · `useDraftSync` · CashflowPlan …-ын `beforeunload`
   *    сонсогч) ч энд орно. Урьд нь тэдгээрийн хадгалаагүй маягт дээр таб буцаж ирэхэд
   *    `invalidateAll` чимээгүй ажиллаж, маягтын суурь мөр дахин татагдаж засвар дарагдах
   *    эрсдэлтэй байв; «Шинэчлэх» ч асуулгүй явдаг байв.
   */
  const refreshData = useCallback(() => {
    const dirty = planNavBusy() || finNavDirty() || navDirtyLabels().length > 0 || hasUnsavedWork();
    if (dirty && !window.confirm(tr('Хадгалаагүй засвар байна. Өгөгдлийг шинэчлэхэд засвар алдагдаж болзошгүй. Шинэчлэх үү?'))) return;
    refreshDeferredRef.current = false;
    invalidateAll();
  }, []);
  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const away = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      /* ⚠️ 2026-10-12: урьд ХОЙШЛУУЛСАН шинэчлэл байвал богино завсрын дараа ч дахин оролдоно */
      if (away <= AWAY_REFRESH_MS && !refreshDeferredRef.current) return;
      if (planNavBusy() || finNavDirty() || navDirtyLabels().length > 0 || hasUnsavedWork()) {
        /* ⚠️ 2026-10-12: хадгалаагүй ажилтай бол ХОЙШЛУУЛНА (дараагийн таб буцах үед, ажил
           хадгалагдсан бол ажиллана); шалтгааныг НЭГ УДАА л хэлнэ — таб бүр сэлгэхэд давтахгүй. */
        if (!refreshDeferredRef.current) {
          refreshDeferredRef.current = true;
          setPortalNotice(tr('Хадгалаагүй ажил байгаа тул өгөгдлийг автоматаар шинэчилсэнгүй — хадгалсны дараа «Шинэчлэх» дарна уу.'));
        }
        return;
      }
      refreshDeferredRef.current = false;
      invalidateAll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ⚠️ 2026-10-13 (хэрэглэгч: «гүйцэтгэл бөглөх батлагдсан тохиолдолд шууд багцын гүйцэтгэлийн зүүн панел
     өөрчлөгдөх ёстой, автомат болох ёстой»): БАТЛАЛТ ХАРАГЧ — өөр хэрэглэгч/таб эцэслэн баталсныг (60 с ·
     таб идэвхжихэд) илрүүлж гүйцэтгэлийн кэшийг хүчингүй болгоно (`hyanaltStore.startApprovalWatch`-ийн ⚠️).
     ⚠️ ДИНАМИК импорт — `hyanaltStore` том тул порталын анхны багцад оруулахгүй. */
  useEffect(() => {
    let off: (() => void) | null = null;
    let dead = false;
    void import('@/lib/hyanaltStore')
      .then((m) => { if (!dead) off = m.startApprovalWatch(); })
      .catch((e) => console.warn('[selbe] батлалт харагч ачаалагдсангүй', e));
    return () => { dead = true; off?.(); };
  }, []);

  /* ⚠️ 2026-10-21 (аудит): `opts.reason` — асуултын шалтгаан (`confirmLeave`-ийн ⚠️); `opts.force` — АСУУЛГҮЙ
     шилжинэ: эрх хасагдсан харагдацын хаалтын цонхны товч (`ViewLost`) — хэрэглэгч шалтгааныг аль хэдийн
     уншсан, хадгалаагүй ажил алдагдахыг товч өөрөө хэлдэг тул давхар асуулт гаргахгүй. */
  const setView = useCallback((v: ViewKey, opts?: { reason?: string; force?: boolean }): boolean => {
    /* ⚠️ 2026-10-06 (аудит): ИЖИЛ харагдац руу «шилжих» нь ЮУ Ч хийхгүй. Урьд нь доорх бүрэн
       шинэчлэл (асаасан давхарга, сонголт, шүүлт, каталог) ажиллаж, идэвхтэй мөр дээр дахин
       дарах (`ViewRail`-ийн ⚠️ «жагсаалт хумигдана/дэлгэгдэнэ»), алгасах холбоосын `#` навигаци
       ба `Tuh`-ийн түүхийн бичлэг дээрх Back (popstate) хэрэглэгчийн ажлыг чимээгүй арилгадаг
       байв. Каталогийг сэлгэх нь ЗӨВХӨН цэсний даралтад (`railSelect`). */
    if (v === viewNowRef.current) return true;
    /* ⚠️ 2026-10-22 (аудит): `force` нь ЗӨВХӨН хадгалаагүй засварын асуултыг алгасна — явж буй бичилтийг (Хуваарийн
       save→decidePlan гинж · гүйцэтгэлийн илгээлт/шийдвэр · нэмэлт ажил буулгалт) асуусаар (`confirmLeave`-ийн
       `busyOnly`). Урьд нь `!opts?.force && …` нь БҮХ асуултыг алгасаж, бичилт явж байхад эрх хумигдаад «Болих»
       дарсан хэрэглэгч цонхны товчоор модулийг гинжийн дундуур unmount хийдэг байв. */
    if (!confirmLeave(opts?.reason, !!opts?.force)) return false;
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
     * ⚠️ 2026-10-07: ЗӨВХӨН шүүлт идэвхтэй үед — урьд нь харагдац солих бүрд
     * дуудагдаж, зураг сонгосон бүсээ орхиод төслийн бүтэн хүрээ рүү нисдэг байв.
     * Самбарын шууд тодруулгыг самбар өөрөө unmount-даа цэвэрлэнэ.
     */
    if (filterActiveRef.current) clearFilter();
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
    if (v === 'dedButets' || v === 'hesegET') setDim('2d');
    if (v === 'hesegET') {
      setHesegSwipe(false);
      setHesegTab('change');
      setHesegPick(null);
      setOverlapSel(null);
      setOverlapFocus(null);
      setOverlapShown([]);
      resetNeedSelection();
      /* ⚠️ 2026-10-19 (аудит): `[]` биш `OLD_ET_OPTIONAL` — урьд нь харагдац руу орох бүрд хуучин ЕТ-ийн сонгомол
         давхаргууд (дугуйн · явган зам · ногоон) АНХДАГЧ унтраалтаа алдаж бүгд асдаг байв (`OLD_ET_OPTIONAL`-ийн ⚠️). */
      setDetailHidden(OLD_ET_OPTIONAL);
    }
    return true;
  }, [clearFilter, confirmLeave]);
  /** Цэсний даралт — идэвхтэй харагдац дээр дахин дарвал ЗӨВХӨН каталогийг сэлгэнэ (`ViewRail`-ийн ⚠️) */
  const railSelect = useCallback((v: ViewKey) => {
    if (v === viewNowRef.current) { setCatalog((c) => !c); return; }
    setView(v);
  }, [setView]);
  /** «Гарах» — dock-ийн мөр ба толгойн хэрэглэгчийн чип ХОЁУЛАА (`confirmLeave`-ийн хамгаалалттай) */
  const signOut = () => { if (confirmLeave()) void auth.signOut(); };

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
    const v = view === DEFAULT_VIEW ? null : view;
    /* ⚠️ 2026-10-06 (аудит): ХАРАГДАЦ СОЛИХОД (`push`) бусад харагдацын параметрийг
       (`tuh`, `pkg`, `fine` — `urlState.VIEW_PARAMS`) арилгана. Урьд нь `writeParams` танихгүй
       түлхүүрийг хөнддөггүй тул `?v=tuh&tuh=…` нь бусад харагдацад ч үлдэж, хуваалцсан
       холбоос/буцаж ороход хуучин сонголт сэргэдэг байв. URL аль хэдийн ЭНЭ харагдацыг заасан
       бол (popstate-ийн сэргээлт) хөндөхгүй — Back/Forward-ийн түүх бохирдохгүй. */
    const stale = push && readParam('v') !== v ? foreignViewParams(view) : {};
    writeParams({
      ...stale,
      v,
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
      /* ⚠️ 2026-10-06 (аудит): харагдац ӨӨРЧЛӨГДӨӨГҮЙ popstate (алгасах холбоосын `#`,
         `Tuh`-ийн дотоод түүх) — харагдацын шинэчлэлийг ОГТ ажиллуулахгүй (`setView`-ийн ⚠️).
         Бүс/давхаргыг л URL-аас уншина (ижил бол no-op). Горимыг (`dim`) ХӨНДӨХГҮЙ:
         `initialDim` нь `?d=` байхгүй үед харагдацын анхдагчийг (IoT → 3D) өгдөг тул
         хэрэглэгчийн сонгосон 2D-г `#` навигаци 3D болгоно. */
      if (next === viewNowRef.current) {
        setZone(readParam('z'));
        setLayer(initialLayer());
        return;
      }
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
      /* ⚠️ 2026-10-06 (аудит): шилжвэл ШАЛТГААНЫГ хэлнэ — урьд нь хадгалаагүй засваргүй үед
         харагдац чимээгүй солигддог тул хэрэглэгч юу болсныг ойлгодоггүй байв. Татгалзвал
         (хадгалаагүй ажлаа хадгалахаар) `lastViewRef`-ийг буцаана. `navScope` нь `Root`-д
         агуулгын түлхүүрээр тогтворжсон тул энэ эффект рендер бүрт дахин асуухгүй. */
      const from = VIEW_BY_KEY[view].title;
      const to = VIEW_BY_KEY[navScope[0]].title;
      /* ⚠️ 2026-10-21 (аудит): асуултад ШАЛТГААНЫГ хэлнэ (`confirmLeave(reason)`). Татгалзвал («Болих» —
         хадгалаагүй ажлаа алдахгүйн тулд) харагдац ҮЛДЭХ ч эрхгүй агуулга ХАРАГДАХГҮЙ: доорх `viewAllowed`
         рендерийн хамгаалалт `ViewLost` хаалтын цонх гаргаж, порталыг `inert` болгоно (Root-ийн `frozen`-тэй
         ижил зарчим — ажил нь амьд, эрх сэргэвэл цонх өөрөө хаагдана). */
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: эрхийн хүрээ АЖИЛЛАЖ БАЙХАД хумигдахад (гаднын permissions store) харагдацыг шилжүүлэх; `setView` нь шүүлт/сонголт цэвэрлэх гаднын нөлөөтэй тул рендер дотор тооцож болохгүй
      if (setView(navScope[0], { reason: tr('Таны эрх өөрчлөгдсөн тул «{0}» харагдац хаагдана.', from) })) setPortalNotice(tr('Таны эрх өөрчлөгдсөн тул «{0}» хаагдаж, «{1}» руу шилжлээ.', from, to)); else lastViewRef.current = view;
    }
  }, [navScope, view, setView]);
  /**
   * ⚠️ 2026-10-21 (аудит): РЕНДЕРИЙН ЭРХИЙН ХАМГААЛАЛТ. Дээрх эффект нь «Болих»-оор няцаагдах (хадгалаагүй
   *    ажил) ба эффект ажиллах хүртэлх нэг кадрын аль алинд нь эрхгүй харагдац бүрэн зурагддаг байв. Одоо
   *    `view` хүрээнд байхгүй л бол порталын агуулга `inert`, дээр нь `ViewLost` хаалтын цонх (шалтгаан +
   *    хүрээний эхний харагдац руу АСУУЛГҮЙ шилжих товч). Эрх сэргэвэл (`navScope` дахин агуулна) цонх алга.
   */
  const viewAllowed = navScope === 'all' || navScope.includes(view);

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
    /* ⚠️ 2026-10-13: «Хэсэгчилсэн ЕТ» мөн ортофотогүй — LIGHT GRAY CANVAS суурьтай нээгдэнэ (хэрэглэгчийн заавар) */
    setOrtho(view !== 'gdash' && view !== 'dashboard' && view !== 'plan' && view !== 'dedButets' && view !== 'hesegET');
  }, [view, setOrtho]);
  /* Суурь зураг: дэд бүтэц — LIGHT GRAY CANVAS, бусад — хиймэл дагуул */
  useEffect(() => {
    applyViewBasemap(mapView, view === 'dedButets' || view === 'hesegET' ? 'gray-vector' : 'satellite', view);
  }, [view, mapView]);

  /* ── Багануудын өргөн — `ResizableColumns` (доорх рендер; `CAT_DEFAULT`-ийн ⚠️) ── */
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
  /* ⚠️ 2026-10-06 (аудит, гүйцэтгэл): `ViewSlot`-ын контекст рендер бүрт ШИНЭ объект байсан тул
     харагдацын модуль Portal-ын рендер бүрд (тэмдэг, сүлжээ, өгөгдлийн цаг) дахин зурагддаг байв. */
  const slotCtx = useMemo(
    () => ({ dim, setDim, zone, setZone, navScope, setView, planJump, setPlanJump, clearPlanJump }),
    [dim, zone, navScope, setView, planJump, clearPlanJump],
  );
  // `standalone` нь бүтэн дэлгэцийн харагдацуудыг ЯГ тэмдэглэдэг — тусад нь тоолохгүй
  const isFull = standalone;
  /**
   * ⚠️ «Ерөнхий мэдээлэл»-нд нэгтгэсэн зурвас нь самбарын толгойд (доод хүрээгүй)
   * үлдэнэ. Каталогийн НЭЭЛТ нь бүх харагдацад «Давхарга» товчоор удирдагдана —
   * plan-д ч жагсаалтыг нуух/харуулах боломжтой (хэрэглэгчийн хүсэлт).
   */
  const planPanel = view === 'plan';
  /** «Хэсэгчилсэн ЕТ» (`hesegET`) — дээрх `hesegTab`-ийн ⚠️ */
  const planDetail = view === 'hesegET';
  // Каталог нь зөвхөн «Ерөнхий мэдээлэл» ба «Барилгын хяналт»-д байна
  const catOpen = catalog && !isFull && !planDetail;

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
   * тохируулсан өргөнөөс ХЭТ БАГА болгохгүй — `max()`; мөн газрын зургийг хамгаалж
   * `52vw`-ээр таглана. Багц сонгоогүй үед хуучин өргөн.
   * ⚠️ 2026-10-23: `max()` нь `ResizableColumns`-ийн CSS-д (`--col-r-eff`) — энд зөвхөн ДООД хязгаар
   *    (`--col-r-floor`); хэрэглэгчийн өргөн (`--col-r`) компонентод.
   */
  const autoCols = Math.min(2, planGroups);
  const autoPanel = planGroups >= 2 ? autoCols * 300 + (autoCols - 1) * 10 + 44 : 0;
  const colsStyle = planGroups >= 2
    ? ({ '--col-r-floor': `min(${autoPanel}px, 52vw)` } as CSSProperties)
    : undefined;

  return (
    <>
      {/* ⚠️ 2026-10-05: сүлжээ тасарсан тууз — `role="status"` (`alert` биш: `Booting` нь
          `[role="alert"]`-ыг «харагдац унасан» дохио гэж уншдаг). Товшилтыг хаахгүй. */}
      {!online && (
        <div className={s.offline} role="status" aria-live="polite">
          {tr('Сүлжээний холболт тасарсан')}
        </div>
      )}
      {/* ⚠️ 2026-10-06: эрх хумигдаж харагдац солигдсон — `role="status"` (`offline`-ийн ⚠️).
          ⚠️ 2026-10-12: мөн хадгалаагүй ажлаас болж хойшилсон автомат шинэчлэл (`onVis`). */}
      {portalNotice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            /* ⚠️ 2026-10-23: толгой 80px (`--head`) болсон тул түүний ДООР */
            position: 'fixed', top: 'calc(var(--head) + 8px)', left: '50%', transform: 'translateX(-50%)', zIndex: 3500,
            display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'min(560px, calc(100vw - 32px))',
            padding: '8px 10px 8px 14px', borderRadius: 10, background: 'var(--surface)', color: 'var(--ink)',
            border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow)', fontSize: 12.5,
          }}
        >
          <span>{portalNotice}</span>
          <button
            type="button"
            onClick={() => setPortalNotice(null)}
            aria-label={tr('Хаах')}
            title={tr('Хаах')}
            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}
      {/* ⚠️ 2026-10-23: Environment — ХҮРЭЭ: зүүн DOCK (`--nav` 104px, fixed; ≤900px-д доод зурвас) + баруун
          тал (толгой `--head` 80px sticky · агуулга 12px зайтай). Газрын зурагтай харагдац: KPI зурвас ДЭЭР,
          доор нь чирэгддэг 3 багана (каталог · зураг · самбар — `ResizableColumns`). Бүтэн дэлгэцийн
          харагдацууд (`viewRegistry`) дотоод бүтцээ хадгалж зөвхөн энэ хүрээнд сууна.
          ⚠️ 2026-08-18: `--hue: active.hue` ХАСАГДСАН хэвээр (байгууллагын НЭГ акцент).
          ⚠️ z-index: толгой 20 · dock 15 ХЭВЭЭР — модулиудын бүтэн дэлгэцийн overlay (30–40) тэднээс дээр
             гарахаар тооцогдсон (`dedButets`/`finance.module.css`). Хүрээнд `transform`/`filter` БАЙХГҮЙ
             (тэд `fixed`-ийн эх хүрээг өөрчилнө); blur зөвхөн толгойн `backdrop-filter`. */}
      <div
        className={`${s.shell} ${navMin ? s.shellNavMin : ''}`}
        /* ⚠️ 2026-10-21 (аудит): эрхгүй харагдац — агуулга `inert` (`viewAllowed`-ийн ⚠️, `ViewLost` дээр нь) */
        inert={!viewAllowed}
      >
        {/* ── ЗҮҮН DOCK: харагдацын жагсаалт (Environment `shell/sidebar.tsx`) ── */}
        <aside className={s.dock} aria-label={tr('Цэс')}>
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
          <div className={s.dockNav}>
            {/* ⚠️ 2026-10-06 (аудит): цэс ч ТУСДАА хашлагад — уналт нь бүх порталыг үхүүлэхгүй */}
            <ErrorBoundary scope="view" label={tr('Цэс нээгдсэнгүй')}>
            <ViewRail
              view={view}
              setView={railSelect}
              catalogOpen={catOpen}
              navScope={navScope}
              collapsed={navMin}
              onDocs={docsAllowed ? () => setDocsOpen(true) : undefined}
              docsActive={docsOpen}
              onAdmin={isSuper ? () => setAdminOpen(true) : undefined}
              adminActive={adminOpen}
              onSysClose={canSys ? () => setSysOpen(true) : undefined}
              sysCloseActive={sysOpen}
              sysClosedNow={!!sysNow}
              /* ⚠️ Нэвтэрсэн үед л (2026-09-23): auth унтраалттай (`off`) бол гарах
                 зүйл байхгүй тул мөр гарахгүй. */
              userName={auth.user?.fullName || auth.user?.username}
              onSignOut={auth.status === 'signed-in' ? signOut : undefined}
              badges={badges}
            />
            </ErrorBoundary>
          </div>
        </aside>

        <div className={s.frame}>
        <header className={s.head}>
          {/* Лого/нэр дээр дарахад НҮҮР рүү буцна (onHome өгөгдсөн бол товч болно).
              ⚠️ 2026-10-23: Environment — 60px лого (≤640px-д 44px), Manrope 16px/700 UPPERCASE брэнд, доор нь
              11px зам заагч = идэвхтэй харагдацын нэр (≤640px-д нуугдана). */}
          <div className={s.identity}>
            <button
              type="button"
              className={s.brand}
              /* ⚠️ 2026-09-30: `confirmLeave` — хадгалаагүй ажлын хамгаалалт (дээрх ⚠️) */
              onClick={onHome ? () => { if (confirmLeave()) onHome(); } : undefined}
              disabled={!onHome}
              title={onHome ? tr('Нүүр хуудас руу буцах') : undefined}
            >
              <img src="/logo.svg" alt="" className={s.logo} />
              {/* ⚠️ 2026-08-21: Дэд гарчиг ХАСАГДСАН (хэрэглэгчийн хүсэлт) — толгойд зөвхөн брэндийн нэр. */}
              <h1 className={s.brandName}>{tr('Сэлбэ ухаалаг хот')}</h1>
            </button>
            <div className={s.crumb}>{active.title}</div>
          </div>

          {/* ⚠️ 2026-08-17: Харагдац сонголт толгойноос ЗҮҮН DOCK руу зөөгдсөн. */}

          <ActiveFilterChip />

          {/* ⚠️ Хэрэгслүүд ЗААВАЛ өөрийн саванд. Урьд нь `ActiveFilterChip` нь
              баруун тийш түлхэх үүрэг гүйцэтгэдэг байсан ч тэр нь шүүлт
              идэвхгүй үед `null` буцаадаг — тэгэхээр товчнууд брэндийн ЯГ
              хажууд наалдаж, толгойн баруун тал хоосон үлддэг байв.
              `margin-left: auto` нь шүүлт байгаа эсэхээс ҮЛ ХАМААРАН түлхэнэ. */}
          {/* ⚠️ «Хэрэглэгчийн эрх» толгойд БИШ (2026-08-20) — dock-ийн «СИСТЕМ» бүлэгт.
              ⚠️ 2026-10-23: Environment — 40px дугуй дүрсэн товчнууд, 1px зааг, дараа нь хэрэглэгчийн чип. */}
          <div className={s.headTools}>
            {/* ⚠️ 2026-10-05: өгөгдлийн цаг + гараар шинэчлэх (дээрх `refreshData`-ийн ⚠️) */}
            <span className={`${s.dataAt} num`} title={tr('Өгөгдлийг сүүлд бүтнээр шинэчилсэн цаг')}>
              {tr('Өгөгдөл: {0}', hhmm(dataAt))}
            </span>
            <button
              type="button"
              className={s.iconBtn}
              onClick={refreshData}
              aria-label={tr('Шинэчлэх')}
              title={tr('Бүх өгөгдлийг дахин татах')}
            >
              <RefreshCw size={18} strokeWidth={1.6} aria-hidden />
            </button>

            {/* ⚠️ 2026-10-15: «Тайлан» — идэвхтэй харагдацыг (1–26 бүгд) Word болгон татна (`ReportButton`).
                ЗӨВХӨН super admin-д (хэрэглэгчийн заавар) — `isSuper` нь `AuthGate`-ийн hard role. */}
            {isSuper && <ReportButton
              viewKey={view}
              title={active.title}
              desc={active.desc}
              filters={zone ? [`${tr('Бүс')}: ${zonesLabel(zone.split(',').filter(Boolean))}`] : []}
            />}

            <LocaleToggle className={s.iconBtn} />

            <button
              type="button"
              className={s.iconBtn}
              onClick={toggle}
              aria-label={theme === 'dark' ? tr('Цайвар горим') : tr('Харанхуй горим')}
              title={theme === 'dark' ? tr('Цайвар горим') : tr('Харанхуй горим')}
            >
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.6} aria-hidden /> : <Moon size={18} strokeWidth={1.6} aria-hidden />}
            </button>

            {/* ⚠️ 2026-09-30: ТУСЛАМЖ — хэрэглэгчийн эрхэнд байгаа хэсэг бүр юунд
                зориулагдсан, хэн ашигладгийг тайлбарлана (`HelpPanel`). Анхны зөвлөмжийн
                сум (`help.module.css` §tipArrow) толгойн баруун захыг заана. */}
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => setHelpOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
              aria-label={tr('Тусламж — хэсэг бүр юунд зориулагдсан')}
              title={tr('Тусламж — хэсэг бүр юунд зориулагдсан')}
            >
              <CircleQuestionMark size={18} strokeWidth={1.6} aria-hidden />
            </button>

            {/* ⚠️ 2026-10-23: Environment `auth/user-chip.tsx` — ХЭН нэвтэрсэн, яаж ГАРАХ. Нэвтэрсэн үед л
                (auth `off` бол гарах зүйлгүй — dock-ийн «Гарах» мөртэй ижил нөхцөл). */}
            {auth.status === 'signed-in' && auth.user && (
              <>
                <span className={s.headDiv} aria-hidden />
                <UserChip
                  name={auth.user.fullName || auth.user.username}
                  username={auth.user.username}
                  thumbnail={auth.user.thumbnail}
                  onSignOut={signOut}
                />
              </>
            )}
          </div>
        </header>

        {/* Бүтэн талбайн харагдацууд — ерөнхий дашбоард ба анализ */}
        {/* ⚠️ 2026-10-06: `id="main"` — алгасах холбоосын (`SkipLink`) ЗОРИЛТ. Модулиуд өөрсдийн
            `<main>`-тэй тул энд ДАХИН `<main>` нэмэхгүй (давхар landmark). */}
        {isFull && (
          /* ⚠️ 2026-10-06 (аудит): `id="main"` — `SkipLink`-ийн зорилт (урьд нь `#panel` зөвхөн
             самбартай харагдацад байв). `<main>` БИШ: модулиуд өөрсдөө `<main>` зурдаг (давхар main). */
          <div className={s.suit} id="main" tabIndex={-1}>
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
                ctx={slotCtx}
              />
            </ErrorBoundary>
          </div>
        )}

        {!isFull && (
          /* ⚠️ 2026-10-23: `id="main"` нь ЭНЭ ажлын талбарт (KPI · каталог · зураг · самбар бүгд) — урьд нь зураг
             (`#main`) ба самбар (`#panel`) тусдаа байв. Тайлан (`viewReport.roots`) KPI-г ч багтааж, давхардуулахгүйн
             тулд самбарын `id="panel"` хасагдсан; `SkipLink` `#main` руу (fallback хэвээр). Каталог `data-report-skip`. */
          <div className={s.work} id="main" tabIndex={-1}>
            {/* ── KPI ЗУРВАС (Environment `.analytics-overview`) — урьд нь самбарын толгойн доор (plan) эсвэл
                дэлгэцийн доод хүрээнд (бусад) байсан нэгтгэсэн үзүүлэлт. «Хэсэгчилсэн ЕТ»-д байхгүй (урьдын адил). */}
            {!planDetail && (
              <ErrorBoundary scope="view" compact label={tr('Нэгтгэсэн үзүүлэлт нээгдсэнгүй')}>
                <SummaryBar zone={zone} />
              </ErrorBoundary>
            )}

            <ResizableColumns
              id="portal"
              left={catOpen ? CAT_DEFAULT : undefined}
              right={PANEL_DEFAULT}
              legacy={COL_LEGACY}
              className={s.cols}
              style={colsStyle}
            >
              {/**
                * Давхаргын сонголт — ЗҮҮН БАГАНА (⚠️ 2026-10-23: Environment — байнгын багана; 2026-08-18-ны
                * зурган дээрх ХӨВӨГЧ popup (`catPop`) ба 2026-09-15-ны «зургийн зүүн ирмэгт» шийдвэр ХАСАГДАВ).
                * Нээх/хаах нь урьдын адил («Давхарга» товч · цэсний идэвхтэй мөр · ×) — хаахад багана алга болж
                * зураг өргөснө. `embedded` — өөрийн хүрээгүй хувилбар (карт нь `.catCol`).
                */}
              {catOpen && (
                <div className={s.catCol}>
                  <ErrorBoundary scope="view" label={tr('Давхаргын жагсаалт нээгдсэнгүй')}>
                  {/* ⚠️ 2026-10-22: `totals` ӨГӨХГҮЙ — нээлттэй бүлгийнхээ тоог л өөрөө татна (дээрх `totals`-ийн ⚠️) */}
                  <LayerCatalog
                    view="plan"
                    visible={visible}
                    setVisible={setVisible}
                    selected={layer}
                    onSelect={setLayer}
                    onClose={closeCatalog}
                    forced={planPanel ? PLAN_ALWAYS_ON_IDS : undefined}
                    pinned={false}
                    embedded
                    zone={zone}
                  />
                  </ErrorBoundary>
                </div>
              )}

              {/* ⚠️ 2026-10-07: `data-map-host` — бүтэн дэлгэц энэ хашлагыг бүхэлд нь авна (`MapCanvas.toggleFs`).
                  ⚠️ 2026-10-23: Environment — зураг нь 12px булантай карт (--line хүрээ, overflow hidden, ≥300px). */}
              <div className={s.map} data-map-host="">
                {/* ⚠️ 2026-10-06 (аудит): зураг, хэрэгслийн зурвас, тунгалаг, каталог, нэгтгэлийн
                    зурвас ТУС БҮР өөрийн хашлагад — урьд нь `scope="view"`-ийн ГАДНА байсан тул
                    тэдгээрийн рендерийн алдаа (эсвэл байршуулалтын дараах chunk 404) root
                    хашлагад (layout.tsx) хүрч ПОРТАЛЫГ БҮХЭЛД нь сольдог байв. Зургийн хашлага
                    `key`-гүй: харагдац солих бүрд ArcGIS зургийг дахин үүсгэхгүй. */}
                <ErrorBoundary scope="view" label={tr('Газрын зураг нээгдсэнгүй')}>
                <MapCanvas
                  dim={dim}
                  /* ⚠️ «Detail» — зөвхөн хоёр талын давхарга + `bare`: суурь 14-ийн бусад нь асахгүй.
                     Swipe: зүүн — одоогийн ерөнхий төлөвлөгөө, баруун — шинэчлэгдсэн (`DETAIL_NEXT_LAYERS`). */
                  visible={planDetail ? detailVisible : visible}
                  bare={planDetail}
                  /* Харьцуулах товч асаалттай үед л (`hesegSwipe`); хэсэг бүр өөрийн хоёр талтай */
                  swipe={planDetail && hesegSwipe
                    ? (hesegTab === 'change' ? H01_SWIPE : hesegTab === 'overlap' ? H02_SWIPE : H03_SWIPE)
                    : undefined}
                  layerFilters={planDetail ? detailFilters : undefined}
                  opacity={opacity}
                  zone={planDetail ? null : zone}
                  /* ⚠️ Явган хүний зам нь ЗӨВХӨН «Ерөнхий төлөвлөгөө»-д үргэлж
                     асаалттай (`services.ts` §PLAN_ALWAYS_ON_IDS). */
                  alwaysOn={planPanel && !planDetail ? PLAN_ALWAYS_ON_IDS : undefined}
                  onPick={pick}
                />
                </ErrorBoundary>

                {planDetail && dim === '2d' && hesegTab === 'change' && (
                  <ErrorBoundary scope="view" floating label={tr('Тооцоолж чадсангүй')}>
                    <ChangeBoundary />
                    <ChangeMapFocus pick={hesegPick} />
                  </ErrorBoundary>
                )}

                {/* «Detail» — давхцлын тодруулга (swipe нь зөвхөн 2D-д, `MapCanvas` §swipe).
                    ⚠️ 2026-10-13: «Одоогийн төлөвлөгөө» / «Шинэчлэгдсэн» товч зургаас САМБАРЫН ТОЛГОЙ руу
                    шилжив (хэрэглэгчийн заавар) — `PlanOverlapPanel` §sideSwitch. */}
                {planDetail && dim === '2d' && hesegTab === 'overlap' && (
                  <ErrorBoundary scope="view" floating label={tr('Давхцлын тооцоо нээгдсэнгүй')}>
                    <PlanOverlapLayers focus={overlapFocus} shown={overlapShown} selected={overlapSel} />
                  </ErrorBoundary>
                )}

                {planDetail && dim === '2d' && hesegTab === 'need' && (
                  <ErrorBoundary scope="view" floating label={tr('Нэмэлт хэрэгцээний тооцоо нээгдсэнгүй')}>
                    <NeedLayer />
                  </ErrorBoundary>
                )}

                {/* «Хэсэгчилсэн ЕТ» — харьцуулах (swipe) товч, fullscreen-ий ДООР (`DetailLayers.tsx` §SwipeToggle) */}
                {planDetail && dim === '2d' && (
                  <ErrorBoundary scope="view" floating label={tr('Харьцуулах товч нээгдсэнгүй')}>
                    <SwipeToggle on={hesegSwipe} setOn={setHesegSwipe} />
                    <CompareLabels
                      on={hesegSwipe}
                      leading={hesegTab === 'change' ? tr('Хуучин ЕТ') : hesegTab === 'overlap' ? tr('Хэсэгчилсэн ЕТ') : tr('Одоо байгаа инженерийн дэд бүтэц')}
                      trailing={hesegTab === 'change' ? tr('Хэсэгчилсэн ЕТ') : hesegTab === 'overlap' ? tr('Сонгосон давхцал') : tr('Шинээр нэмэгдэх хэрэгцээ')}
                    />
                  </ErrorBoundary>
                )}

                {/* «Detail» — суурь зургийн товчны ДООР давхаргын товч (`DetailLayers.tsx`) */}
                {planDetail && detailGroups.length > 0 && (
                  <ErrorBoundary scope="view" floating label={tr('Давхаргын жагсаалт нээгдсэнгүй')}>
                    <DetailLayerMenu groups={detailGroups} hidden={detailHidden} setHidden={setDetailHidden} />
                  </ErrorBoundary>
                )}

                {/* Газрын зургийн НЭГДСЭН хэрэгслийн зурвас — бүх харагдацад ижил
                    (`MapTools`). Урьд нь энэ блок энд гараар бичигдсэн байв.
                    ⚠️ 2026-10-13: «Detail»-д ГАРАХГҮЙ (хэрэглэгч: «энэ байхгүй, одоо дээр бол байна») —
                    каталог/тунгалаг/бүс тэнд утгагүй; давхаргыг дээрх товч удирдана. */}
                {!planDetail && (
                <ErrorBoundary scope="view" floating label={tr('Зургийн хэрэгслүүд нээгдсэнгүй')}>
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
                </ErrorBoundary>
                )}

                {/* Тунгалаг тохируулах хөвөгч цонх */}
                {opacityOpen && !planDetail && (
                  <ErrorBoundary scope="view" floating label={tr('Тунгалаг тохируулах цонх нээгдсэнгүй')} onClose={closeOpacity}>
                  <OpacityPanel
                    visible={visible}
                    opacity={opacity}
                    setOpacity={setOpacity}
                    onClose={closeOpacity}
                    dock
                  />
                  </ErrorBoundary>
                )}
              </div>

              {/* ── БАРУУН БАГАНА: самбар — картууд босоо цуваа, багана өөрөө гүйнэ ──
                  ⚠️ 2026-10-23: өргөн тохируулах бариул нь `ResizableColumns`-д (урьд нь самбарын зүүн ирмэгт). */}
              <aside className={s.panel} aria-label={tr('{0} самбар', active.title)}>
                {/* ⚠️ 2026-10-13: «Detail» горимд гарчгийн карт НУУГДАНА (хэрэглэгчийн заавар) */}
                {!planDetail && (
                <header className={s.panelHead}>
                  <span className={s.panelIcon}><Icon name={active.icon} /></span>
                  <div className={s.panelHeadText}>
                    <h2 className={s.panelTitle}>{active.title}</h2>
                    <p className={s.panelDesc}>{active.desc}</p>
                  </div>
                </header>
                )}

                {/* «Хэсэгчилсэн ЕТ» — гурван хэсэгтэй самбар (`HesegPanel`) */}
                {planDetail && (
                  <div className={s.panelBody}>
                    <ErrorBoundary scope="view" label={tr('Давхцлын самбар нээгдсэнгүй')}>
                      <HesegPanel
                        tab={hesegTab}
                        setTab={(x) => {
                          if (x === hesegTab) return;
                          setHesegTab(x); setHesegPick(null); setOverlapSel(null); setOverlapFocus(null);
                          /* ⚠️ 2026-10-19 (аудит): таб солиход ч хуучин ЕТ-ийн сонгомол давхарга АНХДАГЧААР унтраалттай */
                          setOverlapShown([]); resetNeedSelection(); setHesegSwipe(false); setDetailHidden(OLD_ET_OPTIONAL);
                        }}
                        change={<ChangePanel pick={hesegPick} setPick={setHesegPick} />}
                        overlap={(
                          <PlanOverlapPanel
                            side="next"
                            focus={overlapFocus} setFocus={setOverlapFocus}
                            selected={overlapSel} setSelected={setOverlapSel}
                            shown={overlapShown} setShown={setOverlapShown}
                          />
                        )}
                        need={<NeedPanel />}
                      />
                    </ErrorBoundary>
                  </div>
                )}

                {/* ⚠️ Баруун самбар нь газрын зурагтай ХАМТ зурагддаг тул
                    түүний уналт зургийг ч авч унагадаг байв — тусад нь хашина. */}
                {/* ⚠️ «Detail»-д УСТГАХГҮЙ, нуух — самбарын дотоод төлөв «Одоо» руу буцахад хэвээр.
                    `hidden` атрибут БИШ: `.panelBody`-ийн `display: flex` түүнийг дарна. */}
                <div className={s.panelBody} style={planDetail ? { display: 'none' } : undefined}>
                  <ErrorBoundary scope="view" key={`panel-${view}`} label={tr('Самбар нээгдсэнгүй')}>
                  <ViewPanel
                    view={view}
                    /* ⚠️ 2026-10-22: нуугдмал самбарт тоо татахгүй — хоосон (унтраалттай) Map-ыг «N давхарга татагдсангүй»
                       (role=alert) гэж зурахгүйн тулд «ачаалж буй» төлөв (`TOTALS_IDLE`) */
                    totals={view === 'plan' ? totals : TOTALS_IDLE}
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
            </ResizableColumns>
          </div>
        )}
        </div>
      </div>

      {/* ⚠️ 2026-10-21 (аудит): эрхгүй харагдацын хаалтын цонх (`viewAllowed`-ийн ⚠️) */}
      {/* `!viewAllowed` нь `navScope`-ыг массив болгож нарийсгана (TS-ийн alias нарийсгалт) */}
      {!viewAllowed && (
        <ViewLost
          from={VIEW_BY_KEY[view].title}
          to={VIEW_BY_KEY[navScope[0]].title}
          onGo={() => setView(navScope[0], { force: true })}
        />
      )}

      {/* ТЭЗҮ баримт бичгийн глобал popup — fixed тул бүх харагдацыг халхална */}
      {/* ⚠️ `docsAllowed`-ыг ЭНД дахин шалгана (`Home`-той ижил): эрх нь ажиллаж
          байх үед super admin панелаас буурвал нээлттэй цонх өөрөө хаагдана. */}
      {/* ⚠️ 2026-10-06 (аудит): ХӨВӨГЧ ЦОНХ БҮР ТУСДАА ХАШЛАГАД — `dynamic` chunk-ийн 404 (шинэ
          хувилбар байршсан) эсвэл рендерийн throw нь урьд нь root хашлага хүртэл хөөрч БҮХ
          порталыг (хадгалаагүй ажилтай нь) унагадаг байв. `OverlayBoundary` — буланд мэдэгдэл
          («Хуудсыг дахин ачаалах» / «Хаах»), бусад хэсэг ажиллана. */}
      <OverlayBoundary label={tr('Баримт бичгийн цонх нээгдсэнгүй')} onReset={() => setDocsOpen(false)}>
        <DocViewer open={docsAllowed && docsOpen} onClose={() => setDocsOpen(false)} />
      </OverlayBoundary>

      {/* Хэрэглэгчийн эрх удирдлага — зөвхөн super admin нээж чадна */}
      {isSuper && (
        <OverlayBoundary label={tr('Эрхийн удирдлага нээгдсэнгүй')} onReset={() => setAdminOpen(false)}>
          <AdminOpenCtx.Provider value={adminOpen}>
            <UserAdmin open={adminOpen} onClose={() => setAdminOpen(false)} />
          </AdminOpenCtx.Provider>
        </OverlayBoundary>
      )}

      {/* ⚠️ 2026-10-19: «Систем түр хаах» — удирдлагын цонх (эрхтэй) ба хаалттай үеийн шар зурвас. Зурвас нь
          ЗӨВХӨН ЭНЭ хэрэглэгчид хаалт үйлчлэхгүй үед (`auth.sysClosed` хоосон) — хаалттай хэрэглэгчид
          `SystemClosed` цонх аль хэдийн бүтэн дэлгэцээр. */}
      {canSys && (
        <OverlayBoundary label={tr('Систем түр хаах цонх нээгдсэнгүй')} onReset={() => setSysOpen(false)}>
          <SystemCloseDialog open={sysOpen} onClose={() => setSysOpen(false)} />
        </OverlayBoundary>
      )}
      {/* ⚠️ 2026-10-19 (аудит): зурвас ЗӨВХӨН хаалтыг ДАВАХ эрхтэйд (`canSys` = `canBypassClosed`). Урьд нь хаалт
          хараахан тусаагүй (дараагийн poll хүлээж буй) энгийн хэрэглэгчид «бусдад хаалттай» гэж ХУДАЛ хэлдэг байв. */}
      {sysNow && canSys && !auth.sysClosed && !sysOpen && (
        <SystemClosedStrip onOpen={() => setSysOpen(true)} />
      )}

      {/* Порталын тусламж ба анхны оролтын зөвлөмж (2026-09-30) */}
      <OverlayBoundary label={tr('Тусламж нээгдсэнгүй')} onReset={closeHelp}>
        <HelpPanel open={helpOpen} onClose={closeHelp} navScope={navScope} view={view} onGo={setView} />
        {!helpOpen && <HelpTip onOpen={() => setHelpOpen(true)} />}
      </OverlayBoundary>

      {/* AI туслах — бүх харагдацад нэг л удаа (яриа харагдац соливол тасрахгүй) */}
      <AgentButton open={agentOpen} onToggle={() => { setAgentMounted(true); setAgentOpen(true); }} />
      {/* ⚠️ 2026-10-04: анх НЭЭХЭД л mount (дээрх `agentMounted`-ийн ⚠️) — дараа нь хаасан ч
          mount хэвээр тул яриа хадгалагдана. */}
      {agentMounted && (
        <OverlayBoundary label={tr('AI туслах нээгдсэнгүй')} onReset={() => setAgentOpen(false)}>
          <AgentChat open={agentOpen} onClose={() => setAgentOpen(false)} scope={navScope} />
        </OverlayBoundary>
      )}
    </>
  );
}

/* ── Эрх хасагдсан харагдацын хаалтын цонх ── */

/**
 * ⚠️ 2026-10-21 (аудит): эрх хасагдсан атлаа хадгалаагүй ажлаас болж («Болих») үлдсэн харагдацыг
 * ХААНА — `AuthGate.AccessLost`-той ижил загвар (`auth.module.css`), фокусын урхитай (`useFocusTrap`).
 * Агуулга нь ард `inert` — харагдахгүй, дарагдахгүй; эрх сэргэвэл Portal энэ цонхыг зурахаа болино.
 * Товч нь `setView(…, { force: true })` — асуулгүй: хадгалаагүй ажил алдагдахыг товч өөрөө хэлнэ.
 * ⚠️ 2026-10-22 (аудит): ЯВЖ БУЙ бичилт (Хуваарийн гинж · илгээлт · шийдвэр · буулгалт) байвал товч АСУУНА
 *    (`confirmLeave`-ийн `busyOnly`) — «Болих» бол бичилт дуустал цонх хэвээр, дараа нь дахин дарна.
 * `role="alertdialog"` (`alert` БИШ — `Booting` нь `[role="alert"]`-ыг «харагдац унасан» гэж уншдаг).
 */
function ViewLost({ from, to, onGo }: { from: string; to: string; onGo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref} className={`${a.screen} ${a.screenOver}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-view-lost">
      <div className={a.card}>
        <div className={a.title} id="selbe-view-lost">{tr('«{0}» харагдацын эрх хасагдлаа', from)}</div>
        <p className={a.sub}>
          {tr('Таны эрх өөрчлөгдсөн тул энэ харагдац хаагдах ёстой. Хадгалаагүй ажил байгаа тул одоогоор хаагаагүй — эрх сэргээгдвэл энэ цонх өөрөө хаагдаж, ажил тань хэвээр үлдэнэ.')}
        </p>
        <button type="button" className={a.btn} onClick={onGo}>
          {tr('«{0}» руу шилжих — хадгалаагүй ажил алдагдана', to)}
        </button>
      </div>
    </div>
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

/* ── Хэрэглэгчийн чип (толгойн баруун захад) ── */

/**
 * ⚠️ 2026-10-23: Environment `auth/user-chip.tsx` — 40px pill (28px аватар + нэр), дарахад нэр · нэвтрэх нэр ·
 * «Гарах». Порталын толгойд урьд нь хэрэглэгчийн мөр БАЙГААГҮЙ (зөвхөн цэсний «Гарах» мөр — хэвээр үлдэнэ).
 * ⚠️ `UserCard.tsx`-д БИШ, ЭНД: тэр файл эрхийн удирдлагын хүнд модулиудыг (`UserRights`, `UserWorkflow` …)
 *    импортлодог — Portal-аас импортловол `UserAdmin`-ий `dynamic` хуваалт (2026-10-04-ний ⚠️) эвдэрнэ.
 * Аватар — `AuthGate`-ийн токенгүй `thumbnail`; ачаалагдахгүй бол дүрс рүү буцна.
 */
function UserChip({ name, username, thumbnail, onSignOut }: {
  name: string;
  username: string;
  thumbnail: string | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  /* Гадуур товшиход / Esc — хаагдана (нээлттэй үлдвэл газрын зураг дээр товшилтыг залгина) */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={box} className={s.user}>
      <button
        type="button"
        className={s.userChip}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={name}
        title={name}
      >
        {thumbnail && imgOk ? (
          <img src={thumbnail} alt="" className={s.userAvatar} onError={() => setImgOk(false)} />
        ) : (
          <span className={s.userAvatar} aria-hidden><User size={13} strokeWidth={1.75} /></span>
        )}
        <span className={s.userName}>{name}</span>
      </button>
      {open && (
        <div className={s.userMenu}>
          <div className={s.userMenuHead}>
            <div className={s.userMenuName}>{name}</div>
            <div className={`${s.userMenuId} num`}>{username}</div>
          </div>
          <button type="button" className={s.userMenuItem} onClick={() => { setOpen(false); onSignOut(); }}>
            <LogOut size={13} strokeWidth={1.75} aria-hidden />
            {tr('Гарах')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── KPI зурвас — нэгтгэсэн үзүүлэлт ── */

/**
 * ⚠️ Энэ зурвас урьд нь ДЭЛГЭЦИЙН ДООД хүрээ, дараа нь самбарын гарчгийн доор байв.
 * ⚠️ 2026-10-23: Environment — ажлын талбарын ДЭЭД мөр, `.analytics-stat` хавтангууд (38px дүрсний хайрцаг,
 *    10px шошго, 23px утга) auto-fit сүлжээнд. Ачаалж байхад хавтангууд «…»-тэй (хоосон зурвас биш).
 *    Тоо, асуулга, null ≠ 0 дүрэм ӨӨРЧЛӨГДӨӨГҮЙ.
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
    /* ⚠️ 2026-10-05: шалтгаан (`friendlyError`) + «Дахин оролдох». Урьд нь дөрвөн асуулгын аль нэг
       унахад нүцгэн «Үзүүлэлт татагдсангүй» л гарч, F5-аас өөр гарцгүй байв. */
    return (
      <div className={s.kpi} role="alert" aria-label={tr('Нэгтгэсэн үзүүлэлт')}>
        <div className={`${s.stat} ${s.statWide}`}>
          <span className={s.statLabel} title={q.error.message}>
            {tr('Үзүүлэлт татагдсангүй')} — {friendlyError(q.error)}
          </span>
          {q.retry && (
            <button type="button" className={s.sumRetry} onClick={q.retry}>{tr('Дахин оролдох')}</button>
          )}
        </div>
      </div>
    );
  }
  /* Ачаалж байхад — шошготой хавтангууд «…»-тэй (утга «0» БИШ: null ≠ 0) */
  const ready = q.state === 'ready' ? q.data : null;
  const items: { v: string; l: string; I: LucideIcon }[] = [
    { v: ready ? num(ready.ga, 1) : '…', l: tr('га талбай'), I: LandPlot },
    { v: ready ? num(ready.zones) : '…', l: tr('бүс'), I: Shapes },
    { v: ready ? num(ready.built) : '…', l: tr('барилга'), I: Building2 },
    { v: ready ? num(ready.ail) : '…', l: tr('айл'), I: House },
    { v: ready ? num(ready.pop) : '…', l: tr('хүн ам'), I: Users },
  ];

  return (
    <div className={s.kpi} role="region" aria-label={tr('Нэгтгэсэн үзүүлэлт')} aria-busy={!ready}>
      {zone && (
        <div className={s.stat}>
          <span className={s.statIcon} aria-hidden><MapPin size={20} strokeWidth={1.5} /></span>
          <div className={s.statText}>
            <span className={s.statLabel}>{tr('Бүс')}</span>
            <span className={`${s.statValue} ${s.statValueText}`} title={zonesLabel(zone.split(',').filter(Boolean))}>
              {zonesLabel(zone.split(',').filter(Boolean))}
            </span>
          </div>
        </div>
      )}
      {items.map((i) => (
        <div key={i.l} className={s.stat}>
          <span className={s.statIcon} aria-hidden><i.I size={20} strokeWidth={1.5} /></span>
          <div className={s.statText}>
            <span className={s.statLabel}>{i.l}</span>
            <span className={`${s.statValue} num`}>{i.v}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

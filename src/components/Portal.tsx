'use client';

import {
  Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ErrorInfo, type ReactNode,
} from 'react';
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
import { ViewSlot, type PlanJump } from '@/components/viewRegistry';
import { ErrorBoundary, chunkErrorText, isChunkLoadError } from '@/components/ErrorBoundary';
import { Icon } from '@/components/Icon';
import { DocViewer } from '@/components/DocViewer';
import { LocaleToggle, hasUnsavedWork } from '@/components/LocaleToggle';
import { AgentButton, AgentLoading } from '@/components/AgentButton';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { FilterProvider, useFilter } from '@/lib/filter';
import { usePlanTotals } from '@/lib/totals';
import { queryStats, queryFeatures, count, sum, type Row } from '@/lib/query';
import { loadHeadline, loadHousing, POPULATION_FIELD } from '@/lib/live';
import {
  DEFAULT_VIEW, VIEW_BY_KEY, layerUrl, oidOf, zoneWhere,
  PLAN_LAYER_IDS, LAYER_BY_ID, groupOf,
  ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER, zoneCanon,
  PLAN_ALWAYS_ON_IDS, DED_BUTETS_LAYER_IDS, INFRA_SYSTEMS,
  type ViewKey,
} from '@/lib/services';
import { readParam, writeParams, foreignViewParams } from '@/lib/urlState';
import { planNavBusy } from '@/lib/huvaariBatlah';
import { finNavDirty } from '@/lib/finEdit';
import { navDirtyLabels } from '@/lib/navGuard';
import { num } from '@/lib/format';
import { ReportButton } from '@/components/ReportButton';
import { askConfirm } from '@/lib/confirm';
import { SystemCloseDialog, SystemClosedStrip, useCanCloseSystem, useSystemClosed } from '@/components/SystemCloseDialog';
/** «Тайлан» товч ГАРАХГҮЙ харагдацууд (2026-10-19, хэрэглэгч) — Санхүүжилт, Үйл ажиллагааны схем, Чанар (QAQC), БАТЛАХ бүлэг, ТУХ, Багцын хамаарал, Зөвшөөрөл */
const NO_REPORT = new Set<string>(['finance', 'schem', 'qaqc', 'huvaariBatlah', 'ajilBatlah', 'chanar', 'ma', 'tuh', 'bagtsHamaaral', 'zovshoorol']);
const ViewPanel = dynamic(() => import('@/modules/ViewPanel').then((m) => m.ViewPanel), { ssr: false });
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
 * ХӨВӨГЧ ЦОНХНЫ ХАШЛАГА (2026-10-06, аудит).
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
import a from '@/components/auth.module.css';
import { useFocusTrap } from '@/lib/useFocusTrap';

/** Тэмдэггүй үеийн ТОГТМОЛ лавлагаа — `ViewRail`-д рендер бүрт шинэ объект өгөхгүй */
const EMPTY_BADGES: NavBadges = {};
const TOTALS_IDLE = { state: 'loading', data: null, error: null } as const;
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
 * Багануудын АНХНЫ өргөн (px) — `ResizableColumns` (2026-10-23: Environment — каталог · зураг · самбар
 * гурван чирэгддэг багана). Хязгаар (зүүн ≤560 · баруун ≤720) нь урьдын `useColumnResize`-тэй ИЖИЛ; доод нь 180
 * (Environment). Чирэлтийн логик (try/catch хадгалалт · `lostpointercapture` · гараар) `ResizableColumns`-д шилжив.
 * Хуучин түлхүүрүүдийг (`selbe-catalog-width` · `selbe-panel-width`) нэг удаа уншина — хэрэглэгчийн өргөн алдагдахгүй.
 */
const CAT_DEFAULT = 286;
const PANEL_DEFAULT = 360;
const COL_LEGACY = { left: 'selbe-catalog-width', right: 'selbe-panel-width' };

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
  const [done, setDone] = useState(() => {
    const v = VIEW_BY_KEY[clampView(initialView(), navScope)];
    return !!v.standalone && !v.layers.length;
  });
  useEffect(() => {
    if (done) return;
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
        gap: 22, background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
      <style>{'@keyframes selbeSpin{to{transform:rotate(360deg)}}@keyframes selbePulse{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
      <img src="/logo.svg" alt="" width={60} height={60} style={{ animation: 'selbePulse 1.8s ease-in-out infinite' }} />
      <LoaderCircle size={32} strokeWidth={1.5} aria-hidden style={{ color: 'var(--data)', animation: 'selbeSpin .9s linear infinite' }} />
      <div style={{ fontSize: 13, fontWeight: 500 }}>{tr('Дашбоард ачаалж байна…')}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {tr('Сэлбэ')} {tr('Ухаалаг хот')} · Digital Twin Platform
      </div>
    </div>
  );
}

/**
 * URL-аас эхлэх төлөвийг уншина (хуваалцсан холбоос, F5).
 */
const initialView = (): ViewKey => {
  const v = readParam('v');
  return v && Object.hasOwn(VIEW_BY_KEY, v) ? (v as ViewKey) : DEFAULT_VIEW;
};

/**
 * URL-д ПОРТАЛЫН хүрээ байгаа юу — `false` бол `Root` нүүр хуудас руу шилжиж Portal-ыг
 * unmount хийнэ (popstate-ийн «порталаас гарах» салаа).
 */
const inPortalUrl = (): boolean => {
  const v = readParam('v');
  return readParam('all') === '1' || !!readParam('g') || (!!v && Object.hasOwn(VIEW_BY_KEY, v));
};

/**
 * Харагдацыг эрхийн хүрээгээр хайчилна.
 */
const clampView = (v: ViewKey, scope: 'all' | ViewKey[]): ViewKey =>
  scope === 'all' || !scope.length || scope.includes(v) ? v : scope[0];

const initialDim = (): Dim => {
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
   */
  // Давхаргын сонголт — «Давхарга» товчоор нээж/хаана.
  const [catalog, setCatalog] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 620px)').matches);
  const [layer, setLayer] = useState<string | null>(initialLayer);
  /**
   * «ХЭСЭГЧИЛСЭН ЕТ» (`hesegET`) — гурван хэсэг (2026-10-13, хэрэглэгчийн заавар):
   *   01 `change` — ерөнхий төлөвлөгөөний өөрчлөлт (тоо хэмжээ + хуучнаас нэмэгдсэн);
   *   02 `overlap` — одоо байгаа дэд бүтэцтэй давхцал (багц ажлын давхаргаар);
   *   03 `need` — дэд бүтэц хүртээмжгүй шинэ барилгын нэмэлт холболт.
   */
  const [hesegTab, setHesegTab] = useState<HesegTab>('change');
  /** 01-д СОНГОСОН мөр — зураг дээр тэр ангиллын давхаргууд л үлдэнэ (ЕТ-ний карт шиг) */
  const [hesegPick, setHesegPick] = useState<ChangePick>(null);
  /* `overlapFocus` — самбар ↔ зураг hover-ийн холбоо (`PlanOverlap.tsx`). 02 нь ЗӨВХӨН шинэ тал. */
  const [overlapFocus, setOverlapFocus] = useState<OverlapFocus>(null);
  /* Самбарт ДАРЖ СОНГОСОН карт/мөр — hover байхгүй үед зураг дээр үлдэнэ (`PlanOverlap.tsx`) */
  const [overlapSel, setOverlapSel] = useState<OverlapFocus>(null);
  /* 02-т чагтаар зураг дээр АСААСАН ангиллууд (`PlanOverlapPanel` §shown) — анхдагч нь унтраалттай */
  const [overlapShown, setOverlapShown] = useState<OverlapCat[]>([]);
  /**
   * Харьцуулах SWIPE АСААЛТТАЙ эсэх — зургийн «Харьцуулах» товч (`SwipeToggle`, fullscreen-ий доор).
   */
  const [hesegSwipe, setHesegSwipe] = useState(false);
  /* 03-т сонгосон инженерийн төрөл — зураг дээрх шугамыг тэр төрлөөр шүүнэ */
  const needSelection = useNeedSelection();
  /**
   * «Detail»-ийн давхаргын товчоор (`DetailLayerMenu`) УНТРААСАН давхаргууд (2026-10-13).
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
  const filterActiveRef = useRef(filterActive != null);
  useEffect(() => { filterActiveRef.current = filterActive != null; }, [filterActive]);

  /** ТЭЗҮ ба судалгааны баримт бичгийн глобал popup нээлттэй эсэх */
  const [docsOpen, setDocsOpen] = useState(false);
  /** Хэрэглэгчийн эрх удирдлагын modal (зөвхөн super admin) */
  const [adminOpen, setAdminOpen] = useState(false);
  const [sysOpen, setSysOpen] = useState(false);
  const canSys = useCanCloseSystem(auth.user?.username, auth.status === 'signed-in');
  const sysNow = useSystemClosed();
  /**
   * AI туслахын цонх нээлттэй эсэх.
   */
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentMounted, setAgentMounted] = useState(false);
  /** Порталын тусламжийн цонх (2026-09-30, `HelpPanel`) */
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  /**
   * ЦЭСНИЙ ТООН ТЭМДЭГ (2026-09-30, `navBadges.ts`).
   */
  const [badgeState, setBadgeState] = useState<{ who: string | null; b: NavBadges }>({ who: null, b: {} });
  const badgeUser = auth.user?.username ?? null;
  const badges = badgeState.who === badgeUser ? badgeState.b : EMPTY_BADGES;
  const badgeReady = auth.status === 'signed-in' || auth.status === 'off';
  const scopeKey = navScope === 'all' ? 'all' : navScope.join(',');
  const badgeScope = useMemo<'all' | ViewKey[]>(
    () => (scopeKey === 'all' ? 'all' : (scopeKey.split(',').filter(Boolean) as ViewKey[])),
    [scopeKey],
  );
  const [badgeRefresher] = useState(() => makeBadgeRefresher(loadNavBadges));
  const refreshBadges = useCallback(() => {
    if (!badgeReady || document.visibilityState === 'hidden') return;
    badgeRefresher(badgeUser, badgeScope).then((b) => {
      if (b) setBadgeState((prev) => ({ who: badgeUser, b: mergeNavBadges(prev.who === badgeUser ? prev.b : {}, b) }));
    }, () => { /* чимээгүй */ });
  }, [badgeReady, badgeUser, badgeScope, badgeRefresher]);
  useEffect(() => {
    refreshBadges();
    const iv = setInterval(refreshBadges, 3 * 60_000);
    const offBadge = subscribeNavBadges(refreshBadges);
    const offData = subscribeData(refreshBadges);
    return () => { clearInterval(iv); offBadge(); offData(); };
  }, [refreshBadges]);

  /**
   * Давхаргын тоо, хэмжээ — каталогийн багана, багцын тойм, давхаргын дашбоард
   * ГУРВУУЛАА эндээс уншина. Нэг эх сурвалж, нэг хүсэлтийн багц.
   */
  const standalone = !!VIEW_BY_KEY[view].standalone;

  const totals = usePlanTotals(zone, !standalone && view === 'plan', PLAN_LAYER_IDS);

  const viewNowRef = useRef(view);
  /** Порталын ерөнхий мэдэгдлийн тууз: эрх хумигдаж харагдац солигдсон (2026-10-06),
   *  хадгалаагүй ажлаас болж автомат шинэчлэл хойшилсон (2026-10-12, `onVis`) */
  const [portalNotice, setPortalNotice] = useState<string | null>(() => {
    const asked = readParam('v');
    const req = initialView();
    const got = clampView(req, navScope);
    return asked && req !== got
      ? tr('«{0}» харагдац танд нээгдээгүй тул «{1}» руу орлоо.', VIEW_BY_KEY[req].title, VIEW_BY_KEY[got].title)
      : null;
  });
  const refreshDeferredRef = useRef(false);
  useEffect(() => { viewNowRef.current = view; });
  const leaveAsks = useCallback((busyOnly = false): string[] => {
    const qs: string[] = [];
    if (planNavBusy()) qs.push(tr('Хуваарь хадгалагдаж/батлагдаж байна — одоо гарвал дундаа тасарч болзошгүй. Гарах уу?'));
    if (busyOnly) {
      const busyL = navBusyLabels();
      if (busyL.length) qs.push(tr('{0}: бичилт явж байна — одоо гарвал дундаа тасарч болзошгүй. Гарах уу?', busyL.join(' · ')));
      return qs;
    }
    if (finNavDirty()) qs.push(tr('Санхүүгийн бүртгэлд хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?'));
    const labels = navDirtyLabels();
    if (labels.length) qs.push(tr('{0}: хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?', labels.join(' · ')));
    const asked = qs.length > 0;
    if (!asked && hasUnsavedWork()) qs.push(tr('Хадгалаагүй өөрчлөлт байна. Гарвал алдагдана. Гарах уу?'));
    return qs;
  }, []);
  /** Асуулт нээлттэй эсэх — давхар даралт/Back асуултыг ДАРААЛУУЛЖ олон цонх гаргахгүй (2-р дуудлага `false`) */
  const leavingRef = useRef(false);
  const confirmLeave = useCallback(async (reason?: string, busyOnly = false): Promise<boolean> => {
    const qs = leaveAsks(busyOnly);
    if (!qs.length) return true;
    if (leavingRef.current) return false;
    leavingRef.current = true;
    try {
      /* Асуулт бүр шалтгаанаар эхэлнэ (`reason`); нэгийг нь «Үлдэх» гэвэл гарахгүй */
      for (const q of qs) {
        if (!(await askConfirm(reason ? `${reason}\n\n${q}` : q, { danger: true, ok: tr('Хаяад гарах'), cancel: tr('Үлдэх') }))) return false;
      }
      return true;
    } finally {
      leavingRef.current = false;
    }
  }, [leaveAsks]);
  const dataAt = useSyncExternalStore(subscribeData, dataRefreshedAt, () => 0);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const refreshData = useCallback(async () => {
    const dirty = planNavBusy() || finNavDirty() || navDirtyLabels().length > 0 || hasUnsavedWork();
    if (dirty && !(await askConfirm(
      tr('Хадгалаагүй засвар байна. Өгөгдлийг шинэчлэхэд засвар алдагдаж болзошгүй. Шинэчлэх үү?'),
      { danger: true, ok: tr('Шинэчлэх') },
    ))) return;
    refreshDeferredRef.current = false;
    invalidateAll();
  }, []);
  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const away = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away <= AWAY_REFRESH_MS && !refreshDeferredRef.current) return;
      if (planNavBusy() || finNavDirty() || navDirtyLabels().length > 0 || hasUnsavedWork()) {
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

  useEffect(() => {
    let off: (() => void) | null = null;
    let dead = false;
    void import('@/lib/hyanaltStore')
      .then((m) => { if (!dead) off = m.startApprovalWatch(); })
      .catch((e) => console.warn('[selbe] батлалт харагч ачаалагдсангүй', e));
    return () => { dead = true; off?.(); };
  }, []);

  const setView = useCallback(async (v: ViewKey, opts?: { reason?: string; force?: boolean }): Promise<boolean> => {
    if (v === viewNowRef.current) return true;
    if (!(await confirmLeave(opts?.reason, !!opts?.force))) return false;
    setViewState(v);
    // Харагдацын анхны давхаргууд ил — эхлэх байдал үргэлж утга учиртай
    setVisible(VIEW_BY_KEY[v].initial);
    setPicked(null);
    setPickedLayer(null);
    setLayer(null);
    /**
     * Шүүлт нь өмнөх харагдацын давхаргын талбарын нэрээр бичигдсэн SQL. Үлдвэл
     * шинэ харагдацын давхаргад тэр талбар байхгүй тул ArcGIS хүсэлт бүхэлдээ
     * унаж, зураг чимээгүй хоосорно.
     */
    if (filterActiveRef.current) clearFilter();
    setCatalog(v === 'plan' && !window.matchMedia('(max-width: 620px)').matches);
    /**
     * IoT руу орход 3D. ЗӨВХӨН IoT-д тавина — бусад харагдац руу шилжихэд
     * горимыг ХҮЧЭЭР 2D болгохгүй: хэрэглэгч 3D-г санаатай сонгосон бол тэр
     * сонголт нь харагдац солих болгонд алга болох ёсгүй.
     */
    if (v === 'iot') setDim('3d');
    /**
     * Дээрх дүрмийн ЗАРИМДАА БУРУУ ажилладаг талыг нөхөж байна: IoT нь
     * 3D тавьдаг ч буцааж авдаггүй тул IoT → ХАБЭА гэж явахад зураг 3D
     * хэвээр нээгддэг байв. ХАБЭА-гийн гол дүрслэл нь краны цэг ба
     * аюулгүйн бүсийн ПОЛИГОН — 3D мешэн дээр бүс нь хэвтээ хавтгайд
     * дарагдаж, кран хоорондын давхцал уншигдахгүй болно.
     */
    if (v === 'habea') setDim('2d');
    if (v === 'dedButets' || v === 'hesegET') setDim('2d');
    if (v === 'hesegET') {
      setHesegSwipe(false);
      setHesegTab('change');
      setHesegPick(null);
      setOverlapSel(null);
      setOverlapFocus(null);
      setOverlapShown([]);
      resetNeedSelection();
      setDetailHidden(OLD_ET_OPTIONAL);
    }
    return true;
  }, [clearFilter, confirmLeave]);
  /** Цэсний даралт — идэвхтэй харагдац дээр дахин дарвал ЗӨВХӨН каталогийг сэлгэнэ (`ViewRail`) */
  const railSelect = useCallback((v: ViewKey) => {
    if (v === viewNowRef.current) { setCatalog((c) => !c); return; }
    void setView(v);
  }, [setView]);
  const ctxSetView = useCallback((v: ViewKey): boolean => { void setView(v); return true; }, [setView]);
  /** «Гарах» — dock-ийн мөр ба толгойн хэрэглэгчийн чип ХОЁУЛАА (`confirmLeave`-ийн хамгаалалттай) */
  const signOut = async () => { if (await confirmLeave()) void auth.signOut(); };

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
  useEffect(() => { urlNowRef.current = { view, zone, layer, dim }; });

  /* URL → төлөв: хөтчийн Back/Forward-д харагдацыг бүтэн сэргээнэ */
  useEffect(() => {
    /** Татгалзсан Back — одоогийн төлөвийг URL-д PUSH-ээр буцааж бичнэ (доорх 2026-09-25) */
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
      if (!inPortalUrl()) {
        if (!leaveAsks().length) return;
        restoreUrl({ all: '1' });
        void confirmLeave().then((ok) => { if (ok) onHome?.(); });
        return;
      }
      // `setView` нь харагдацын бүрэн шинэчлэл (шүүлт цэвэрлэх г.м.) хийдэг
      const next = clampView(initialView(), navScope);
      if (next === viewNowRef.current) {
        setZone(readParam('z'));
        setLayer(initialLayer());
        return;
      }
      const urlView = initialView();
      const z = readParam('z');
      const l = initialLayer();
      const d = initialDim();
      void setView(next).then((ok) => {
        if (!ok) {
          restoreUrl();
          return;
        }
        if (next !== urlView) lastViewRef.current = next;
        setZone(z);
        setLayer(l);
        setDim(d);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView, navScope, confirmLeave, leaveAsks, onHome]);

  /**
   * ЭРХИЙН ХАМГААЛАЛТ — идэвхтэй `view` нь навигацийн хүрээнд ЗААВАЛ байна. Гүн
   * холбоосоор (`?v=…`) эрхгүй харагдац орж ирвэл хүрээний эхний харагдац руу
   * шилжүүлж, хязгаарлагдсан хэрэглэгч эрхгүй агуулга үзэхээс сэргийлнэ.
   */
  useEffect(() => {
    if (navScope === 'all') return;
    if (!navScope.includes(view)) {
      lastViewRef.current = navScope[0];
      const from = VIEW_BY_KEY[view].title;
      const to = VIEW_BY_KEY[navScope[0]].title;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void setView(navScope[0], { reason: tr('Таны эрх өөрчлөгдсөн тул «{0}» харагдац хаагдана.', from) }).then((ok) => {
        if (ok) setPortalNotice(tr('Таны эрх өөрчлөгдсөн тул «{0}» хаагдаж, «{1}» руу шилжлээ.', from, to)); else lastViewRef.current = view;
      });
    }
  }, [navScope, view, setView]);
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
   * Харагдац дотроо гараар унтраасан/асаасан нь дараагийн солилт хүртэл үлдэнэ.
   * `Ersdel` өөрөө ч `setOrtho(true)` хийдэг — энэ дүрэмтэй нийцнэ.
   */
  const { setOrtho, view: mapView } = useMap();
  useEffect(() => {
    setOrtho(view !== 'gdash' && view !== 'dashboard' && view !== 'plan' && view !== 'dedButets' && view !== 'hesegET');
  }, [view, setOrtho]);
  /* Суурь зураг: дэд бүтэц — LIGHT GRAY CANVAS, бусад — хиймэл дагуул */
  useEffect(() => {
    applyViewBasemap(mapView, view === 'dedButets' || view === 'hesegET' ? 'gray-vector' : 'satellite', view);
  }, [view, mapView]);

  /* ── Багануудын өргөн — `ResizableColumns` (доорх рендер; `CAT_DEFAULT`) ── */
  const active = VIEW_BY_KEY[view];
  /**
   * «ХУВААРЬ БАТЛАХ» → «ХУВААРЬ» ДАМЖУУЛАЛТ — ЗӨВХӨН САНАХ ОЙД.
   *
   * Батлах дараалал дээр «Хуваарь хуудсанд батлах» дарахад тэр багцаар
   * `Huvaari` нээгдэж, шийдвэрлэх цонх өөрөө гарна (батлах логик тэнд л
   * байна, хуулбарлагдаагүй — `HuvaariBatlah.tsx`-ийн толгойг үз).
   */
  const [planJump, setPlanJump] = useState<PlanJump | null>(null);
  const clearPlanJump = useCallback(() => setPlanJump(null), []);
  const slotCtx = useMemo(
    () => ({ dim, setDim, zone, setZone, navScope, setView: ctxSetView, planJump, setPlanJump, clearPlanJump }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dim, zone, navScope, ctxSetView, planJump, clearPlanJump, theme],
  );
  // `standalone` нь бүтэн дэлгэцийн харагдацуудыг ЯГ тэмдэглэдэг — тусад нь тоолохгүй
  const isFull = standalone;
  const planPanel = view === 'plan';
  /** «Хэсэгчилсэн ЕТ» (`hesegET`) — дээрх `hesegTab` */
  const planDetail = view === 'hesegET';
  // Каталог нь зөвхөн «Ерөнхий мэдээлэл» ба «Барилгын хяналт»-д байна
  const catOpen = catalog && !isFull && !planDetail;

  /**
   * «Ерөнхий мэдээлэл»-д ХЭДЭН БАГЦ сонгогдсоныг тоолно — самбар өөрөө өргөсөж
   * сонгосон багцуудыг ЗЭРЭГЦЭЭ багана болгон харуулахад ашиглана.
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

  const autoCols = Math.min(2, planGroups);
  const autoPanel = planGroups >= 2 ? autoCols * 300 + (autoCols - 1) * 10 + 44 : 0;
  const colsStyle = planGroups >= 2
    ? ({ '--col-r-floor': `min(${autoPanel}px, 52vw)` } as CSSProperties)
    : undefined;

  return (
    <>
      {!online && (
        <div className={s.offline} role="status" aria-live="polite">
          {tr('Сүлжээний холболт тасарсан')}
        </div>
      )}
      {portalNotice && (
        <div
          role="status"
          aria-live="polite"
          style={{
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
      <div
        className={`${s.shell} ${navMin ? s.shellNavMin : ''}`}
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
            <ErrorBoundary scope="view" label={tr('Цэс нээгдсэнгүй')}>
            <ViewRail
              view={view}
              setView={railSelect}
              navScope={navScope}
              collapsed={navMin}
              onDocs={docsAllowed ? () => setDocsOpen(true) : undefined}
              docsActive={docsOpen}
              onAdmin={isSuper ? () => setAdminOpen(true) : undefined}
              adminActive={adminOpen}
              onSysClose={canSys ? () => setSysOpen(true) : undefined}
              sysCloseActive={sysOpen}
              sysClosedNow={!!sysNow}
              userName={auth.user?.fullName || auth.user?.username}
              onSignOut={auth.status === 'signed-in' ? signOut : undefined}
              badges={badges}
            />
            </ErrorBoundary>
          </div>
        </aside>

        <div className={s.frame}>
        <header className={s.head}>
          {/* Лого/нэр дээр дарахад НҮҮР рүү буцна (onHome өгөгдсөн бол товч болно). */}
          <div className={s.identity}>
            <button
              type="button"
              className={s.brand}
              onClick={onHome ? async () => { if (await confirmLeave()) onHome(); } : undefined}
              disabled={!onHome}
              title={onHome ? tr('Нүүр хуудас руу буцах') : undefined}
            >
              <img src="/logo.svg" alt="" className={s.logo} />
              <h1 className={s.brandName}>{tr('Сэлбэ ухаалаг хот')}</h1>
            </button>
            <div className={s.crumb}>{active.title}</div>
          </div>


          <ActiveFilterChip />

          <div className={s.headTools}>
            <span className={`${s.dataAt} num`} title={tr('Өгөгдлийг сүүлд бүтнээр шинэчилсэн цаг')}>
              {tr('Өгөгдөл: {0}', hhmm(dataAt))}
            </span>
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => void refreshData()}
              aria-label={tr('Шинэчлэх')}
              title={tr('Бүх өгөгдлийг дахин татах')}
            >
              <RefreshCw size={18} strokeWidth={1.6} aria-hidden />
            </button>

            {isSuper && !NO_REPORT.has(view) && <ReportButton
              viewKey={view}
              title={active.title}
              desc={active.desc}
              filters={zone && (!standalone || view === 'gdash' || view === 'dashboard')
                ? [view === 'gdash'
                  ? tr('Бүс (зөвхөн газрын зураг): {0}', zonesLabel(zone.split(',').filter(Boolean)))
                  : `${tr('Бүс')}: ${zonesLabel(zone.split(',').filter(Boolean))}`]
                : []}
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
        {isFull && (
          <div className={s.suit} id="main" tabIndex={-1}>
            <ErrorBoundary scope="view" key={view} label={tr('«{0}» нээгдсэнгүй', VIEW_BY_KEY[view].title)}>
              <ViewSlot
                view={view}
                ctx={slotCtx}
              />
            </ErrorBoundary>
          </div>
        )}

        {!isFull && (
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
                * Давхаргын сонголт — ЗҮҮН БАГАНА (2026-10-23: Environment — байнгын багана; 2026-08-18-ны
                * зурган дээрх ХӨВӨГЧ popup (`catPop`) ба 2026-09-15-ны «зургийн зүүн ирмэгт» шийдвэр ХАСАГДАВ).
                * Нээх/хаах нь урьдын адил («Давхарга» товч · цэсний идэвхтэй мөр · ×) — хаахад багана алга болж
                * зураг өргөснө. `embedded` — өөрийн хүрээгүй хувилбар (карт нь `.catCol`).
                */}
              {catOpen && (
                <div className={s.catCol}>
                  <ErrorBoundary scope="view" label={tr('Давхаргын жагсаалт нээгдсэнгүй')}>
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

              <div className={s.map} data-map-host="">
                <ErrorBoundary scope="view" label={tr('Газрын зураг нээгдсэнгүй')}>
                <MapCanvas
                  dim={dim}
                  visible={planDetail ? detailVisible : visible}
                  bare={planDetail}
                  /* Харьцуулах товч асаалттай үед л (`hesegSwipe`); хэсэг бүр өөрийн хоёр талтай */
                  swipe={planDetail && hesegSwipe
                    ? (hesegTab === 'change' ? H01_SWIPE : hesegTab === 'overlap' ? H02_SWIPE : H03_SWIPE)
                    : undefined}
                  layerFilters={planDetail ? detailFilters : undefined}
                  opacity={opacity}
                  zone={planDetail ? null : zone}
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

                {/* «Detail» — давхцлын тодруулга (swipe нь зөвхөн 2D-д, `MapCanvas` §swipe). */}
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
                    (`MapTools`). Урьд нь энэ блок энд гараар бичигдсэн байв. */}
                {!planDetail && (
                <ErrorBoundary scope="view" floating label={tr('Зургийн хэрэгслүүд нээгдсэнгүй')}>
                <MapTools
                  dim={dim}
                  setDim={setDim}
                  layersOpen={catOpen}
                  onLayers={() => setCatalog((v) => !v)}
                  opacityOpen={opacityOpen}
                  opacityCount={Object.values(opacity).filter((v) => v < 1).length}
                  onOpacity={() => setOpacityOpen((v) => !v)}
                  zone={zone}
                  setZone={setZone}
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

              {/* ── БАРУУН БАГАНА: самбар — картууд босоо цуваа, багана өөрөө гүйнэ ── */}
              <aside className={s.panel} aria-label={tr('{0} самбар', active.title)}>
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

                <div className={s.panelBody} style={planDetail ? { display: 'none' } : undefined}>
                  <ErrorBoundary scope="view" key={`panel-${view}`} label={tr('Самбар нээгдсэнгүй')}>
                  <ViewPanel
                    view={view}
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

      {/* `!viewAllowed` нь `navScope`-ыг массив болгож нарийсгана (TS-ийн alias нарийсгалт) */}
      {!viewAllowed && (
        <ViewLost
          from={VIEW_BY_KEY[view].title}
          to={VIEW_BY_KEY[navScope[0]].title}
          onGo={() => { void setView(navScope[0], { force: true }); }}
        />
      )}

      {/* ТЭЗҮ баримт бичгийн глобал popup — fixed тул бүх харагдацыг халхална */}
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

      {canSys && (
        <OverlayBoundary label={tr('Систем түр хаах цонх нээгдсэнгүй')} onReset={() => setSysOpen(false)}>
          <SystemCloseDialog open={sysOpen} onClose={() => setSysOpen(false)} />
        </OverlayBoundary>
      )}
      {sysNow && canSys && !auth.sysClosed && !sysOpen && (
        <SystemClosedStrip onOpen={() => setSysOpen(true)} />
      )}

      {/* Порталын тусламж ба анхны оролтын зөвлөмж (2026-09-30) */}
      <OverlayBoundary label={tr('Тусламж нээгдсэнгүй')} onReset={closeHelp}>
        <HelpPanel open={helpOpen} onClose={closeHelp} navScope={navScope} view={view} onGo={setView} user={auth.user?.username} />
        {!helpOpen && <HelpTip onOpen={() => setHelpOpen(true)} />}
      </OverlayBoundary>

      {/* AI туслах — бүх харагдацад нэг л удаа (яриа харагдац соливол тасрахгүй) */}
      <AgentButton open={agentOpen} onToggle={() => { setAgentMounted(true); setAgentOpen(true); }} />
      {agentMounted && (
        <OverlayBoundary label={tr('AI туслах нээгдсэнгүй')} onReset={() => setAgentOpen(false)}>
          <AgentChat open={agentOpen} onClose={() => setAgentOpen(false)} scope={navScope} />
        </OverlayBoundary>
      )}
    </>
  );
}

/* ── Эрх хасагдсан харагдацын хаалтын цонх ── */

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

/** Бүсийн тоо/талбай/өрх — каноник кодоор ДАВХАРДАЛГҮЙ (кодгүй мөр тус бүр нэг); SUM-ын дүрмээр утгагүй бол `null` */
function zoneTotals(rows: Row[]): { n: number; ga: number | null; ail: number | null } {
  const Z = ZONE_FIELDS;
  const seen = new Set<string>();
  let n = 0; let ga: number | null = null; let ail: number | null = null;
  const add = (acc: number | null, v: unknown) => {
    const x = v == null || v === '' ? NaN : Number(v);
    return Number.isFinite(x) ? (acc ?? 0) + x : acc;
  };
  for (const r of rows) {
    const code = zoneCanon(r[Z.id]);
    if (code) {
      if (seen.has(code)) continue;
      seen.add(code);
    }
    n += 1;
    ga = add(ga, r[Z.landHa]);
    ail = add(ail, r[Z.households]);
  }
  return { n, ga, ail };
}

function SummaryBar({ zone }: { zone: string | null }) {
  const where = zone ?? '1=1';

  const q = useAsync(async () => {
    const Z = ZONE_FIELDS;
    const zoneQ = zone ? zoneWhere(ZONE_LAYER, zone) ?? '1=1' : '1=1';
    const builtQ = zone ? zoneWhere(BUILT_LAYER, zone) ?? '1=1' : '1=1';
    const [zones, built, headline, housing] = await Promise.all([
      queryFeatures(layerUrl(ZONE_LAYER), { where: zoneQ, outFields: [Z.id, Z.landHa, Z.households] }).then(zoneTotals),
      queryStats(layerUrl(BUILT_LAYER), [count(oidOf(BUILT_LAYER), 'n'), sum(POPULATION_FIELD, 'pop')], builtQ),
      loadHeadline(),
      loadHousing(),
    ]);
    const orNull = (v: unknown): number | null => {
      const n = v == null ? NaN : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      zones: Number(zones.n ?? 0),
      ga: zone ? orNull(zones.ga) : headline.areaHa,
      ail: zone ? orNull(zones.ail) : housing.ail,
      built: Number(built.n ?? 0),
      pop: zone ? orNull(built.pop) : headline.population,
    };
  }, [where]);

  if (q.state === 'error') {
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

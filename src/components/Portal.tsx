'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { MapCanvas, MapProvider, type Dim } from '@/components/MapCanvas';
import { ViewRail } from '@/components/ViewRail';
import { LayerCatalog } from '@/components/LayerCatalog';
import { Suitability } from '@/modules/analysis/Suitability';
import { Dashboard } from '@/modules/Dashboard';
import { Sheet } from '@/modules/sheet/Sheet';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { FilterProvider, useFilter } from '@/lib/filter';
import { usePlanTotals } from '@/lib/totals';
import { queryStats, count, sum, sqlStr } from '@/lib/query';
import {
  DEFAULT_VIEW, VIEW_BY_KEY, layerUrl, OID, ZONE_FIELD, PROJECT_AREA_HA,
  PLAN_LAYER_IDS, MONITOR_LAYER_IDS,
  ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER, BUILT_FIELDS,
  type ViewKey,
} from '@/lib/services';
import { num } from '@/lib/format';
import { ViewPanel } from '@/modules/ViewPanel';
import { BuildingSummary } from '@/modules/BuildingPanel';

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
 * БАГАНА ЧИРЭХ — самбар ба каталог ХОЁУЛАА үүнийг хэрэглэнэ.
 *
 * ⚠️ `dir` нь чирэлтийн тэмдгийг заана: БАРУУН талын самбар зүүн тийш чирэхэд
 * өргөсдөг тул `-1`, ЗҮҮН талын каталог баруун тийш чирэхэд өргөсдөг тул `+1`.
 * Хоёуланд нь нэг томьёо — ялгаа нь зөвхөн энэ тэмдэг.
 */
function useColumnResize(
  { min, max, initial, storageKey, dir }:
  { min: number; max: number; initial: number; storageKey: string; dir: 1 | -1 },
) {
  const [width, setWidth] = useState(initial);
  const [dragging, setDragging] = useState(false);

  // ⚠️ Зөвхөн эффект дотор: localStorage нь статик экспортын үед байхгүй
  useEffect(() => {
    const v = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(v) && v >= min && v <= max) setWidth(v);
  }, [storageKey, min, max]);

  /** Чирэлтийн үед хамгийн сүүлд тооцсон өргөн — тавихад хадгална */
  const last = useRef(initial);

  const save = (w: number) => {
    try { localStorage.setItem(storageKey, String(w)); } catch { /* private mode */ }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add('resizing');

    const x0 = e.clientX;
    const w0 = width;
    last.current = w0;

    const move = (ev: PointerEvent) => {
      const w = Math.min(max, Math.max(min, w0 + dir * (ev.clientX - x0)));
      last.current = w;
      setWidth(w);
    };
    const up = () => {
      setDragging(false);
      document.body.classList.remove('resizing');
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      save(last.current);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };

  /** Давхар товшиход анхны өргөнд буцаана */
  const onDoubleClick = () => { setWidth(initial); save(initial); };

  return { width, dragging, onPointerDown, onDoubleClick };
}

/**
 * Гадна бүрхүүл — зөвхөн контекстүүдийг өгнө.
 *
 * ⚠️ `FilterProvider` нь `useMap()`-ыг дуудах тул `MapProvider`-ын ДОТОР байх
 * ёстой. Мөн порталын агуулга `useFilter()`-ыг дуудах тул түүнээс ДООР байх
 * ёстой — иймд агуулгыг тусад нь салгав.
 */
export default function Portal() {
  return (
    <MapProvider>
      <FilterProvider>
        <PortalContent />
      </FilterProvider>
    </MapProvider>
  );
}

function PortalContent() {
  /**
   * Газрын зураг ХОЁРХОН төрөлтэй: 2D = ортофото, 3D = меш. Суурийг энэ л шийднэ.
   */
  const [dim, setDim] = useState<Dim>('2d');

  /**
   * ХАРАГДАЦ — порталын гол удирдлага. Сонгоход зураг ба самбар ХОЁУЛАА солигдоно.
   * `visible` нь харагдацын анхны давхаргуудаар дүүрнэ; хэрэглэгч каталогоос
   * нэмж асаана.
   */
  const [view, setViewState] = useState<ViewKey>(DEFAULT_VIEW);
  const [visible, setVisible] = useState<string[]>(VIEW_BY_KEY[DEFAULT_VIEW].initial);

  /**
   * Каталогийн багана нээлттэй эсэх ба самбарт задалж харуулах давхарга.
   *
   * ⚠️ Эхлэхэд каталогийг НЭЭХГҮЙ: анх орж ирсэн хүн зургаа хараагүй байхад
   * жагсаалт гарвал юуных болохыг нь мэдэхгүй. Хэрэглэгч өөрөө «Ерөнхий
   * мэдээлэл» дарахад нээгдэнэ.
   */
  // Давхаргын сонголтын ЗҮҮН БАГАНА — «Давхарга» товчоор нээж/хаана.
  // Анхнаасаа НЭЭЛТТЭЙ: давхаргын жагсаалт зүүн талд шууд харагдана.
  const [catalog, setCatalog] = useState(true);
  const [layer, setLayer] = useState<string | null>(null);

  /** Сонгосон бүс — БҮХ давхарга, БҮХ тоо үүгээр шүүгдэнэ */
  const [zone, setZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, unknown> | null>(null);
  const [pickedLayer, setPickedLayer] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const { clear: clearFilter } = useFilter();

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
    () => (view === 'monitor' ? [...MONITOR_LAYER_IDS, ...PLAN_LAYER_IDS] : PLAN_LAYER_IDS),
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
    // ⚠️ Каталог нь зурган дээрх товчоор удирдагдана — харагдац солиход хумина
    setCatalog(false);
  }, [clearFilter]);

  const pick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs);
    setPickedLayer(layerId);
  }, []);

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
  const isDash = view === 'dashboard';
  const isSuit = view === 'analysis';
  const isSheet = view === 'sheet';
  // `standalone` нь эдгээрийг ЯГ тэмдэглэдэг — тусад нь тоолохгүй
  const isFull = standalone;
  /**
   * ⚠️ «Ерөнхий мэдээлэл»-д каталог БАЙНГА зүүн талд бэхлэгдэнэ — хаагдахгүй.
   * Энэ харагдацын гол ажил нь 29 давхаргыг асаах/унтраах тул жагсаалт нь
   * агуулга өөрөө, түр нээдэг туслах цонх биш. Хаах товч, «Давхарга» товч
   * хоёулаа далд болно — хаах боломжгүй зүйлийг хаах товч нь төөрөгдөл.
   *
   * «Барилгын хяналт» нь ХУУЧНААР үлдэнэ (товчоор нээж/хаана): тэнд гол
   * агуулга нь блокийн гүйцэтгэл бөгөөд каталог нь нэмэлт контекст.
   */
  const catPinned = view === 'plan';
  // Каталог нь зөвхөн «Ерөнхий мэдээлэл» ба «Барилгын хяналт»-д байна
  const catOpen = (catPinned || catalog) && !isFull;

  return (
    <>
      <div
        className={`${s.shell} ${isFull ? s.shellSuit : ''} ${catOpen ? s.shellCat : ''} ${!isFull && !catPinned ? s.shellFoot : ''} ${view === 'monitor' ? s.shellMon : ''}`}
        style={{
          '--hue': active.hue,
          '--panel': `${panelSize.width}px`,
          '--catalog': `${catSize.width}px`,
        } as CSSProperties}
      >
        <header className={s.head}>
          <div className={s.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className={s.logo} />
            <span className={s.brandText}>
              <h1 className={s.brandName}>Сэлбэ 20 минутын хот</h1>
              <span className={s.brandSub}>Ерөнхий төлөвлөгөө ба төсвийн портал</span>
            </span>
          </div>

          {/* Харагдац сонголт — толгойд хэвтээ таб хэлбэрээр */}
          <ViewRail view={view} setView={setView} catalogOpen={catOpen} header />

          {/* ⚠️ Үзүүлэлтүүд толгойгоос ДООД зурваст (`SummaryBar`) шилжсэн тул
              шүүлтийн тэмдэг нь баруун тийш түлхэх үүргийг авна. */}
          <ActiveFilterChip />

          <button
            type="button"
            className={s.iconBtn}
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Цайвар горим' : 'Харанхуй горим'}
            title={theme === 'dark' ? 'Цайвар горим' : 'Харанхуй горим'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
        </header>

        {/* Бүтэн талбайн харагдацууд — ерөнхий дашбоард ба анализ */}
        {isFull && (
          <div className={s.suit}>
            {isDash
              ? <Dashboard dim={dim} setDim={setDim} zone={zone} setZone={setZone} />
              : isSheet
                ? <Sheet />
                : <Suitability dim={dim} setDim={setDim} />}
          </div>
        )}

        {!isFull && (
          <>
            {/* «Барилгын хяналт» — газрын зургийн ЗҮҮН талд бүх барилгын ДУНДАЖ (статик) */}
            {view === 'monitor' && (
              <aside className={s.monLeft} aria-label="Барилгын дундаж мэдээлэл">
                <BuildingSummary />
              </aside>
            )}

            <div className={s.map}>
              <MapCanvas dim={dim} visible={visible} zone={zone} onPick={pick} />

              {/* Газрын зураг дээрх хэрэгслүүд — давхарга нээх ба 2D/3D/BIM */}
              <div className={s.mapTools}>
                {/* ⚠️ Каталог бэхлэгдсэн харагдацад товч ХЭРЭГГҮЙ — дарахад юу ч
                    болохгүй товч нь эвдэрсэн мэт сэтгэгдэл төрүүлнэ. */}
                {!catPinned && (
                  <button
                    type="button"
                    aria-pressed={catOpen}
                    className={`${s.mapBtn} ${catOpen ? s.mapBtnOn : ''}`}
                    onClick={() => setCatalog((v) => !v)}
                    title="Давхаргын жагсаалт"
                  >
                    <Icon name="layers" size={15} />
                    Давхарга
                  </button>
                )}

                <div className={s.mapDims} role="group" aria-label="Газрын зургийн харагдац">
                  {(['2d', '3d', 'bim'] as Dim[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={dim === d}
                      className={`${s.dimBtn} ${dim === d ? s.dimOn : ''}`}
                      onClick={() => setDim(d)}
                    >
                      {d.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Давхаргын сонголт — ЗҮҮН талын багана (товчоор нээж/хаана).
                Layer дээр дарахад баруун самбарт түүний дашбоард гарна. */}
            {catOpen && (
              <LayerCatalog
                view={view === 'monitor' ? 'monitor' : 'plan'}
                totals={totals}
                visible={visible}
                setVisible={setVisible}
                selected={layer}
                onSelect={setLayer}
                onClose={() => setCatalog(false)}
                pinned={catPinned}
                resizing={catSize.dragging}
                onResizeStart={catSize.onPointerDown}
                onResizeReset={catSize.onDoubleClick}
                zone={zone}
              />
            )}

            <aside className={s.panel} id="panel" aria-label={`${active.title} самбар`}>
              {/* Өргөн тохируулах бариул — самбарын зүүн ирмэг дээр */}
              <div
                className={`${s.grip} ${panelSize.dragging ? s.gripOn : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Самбарын өргөн"
                onPointerDown={panelSize.onPointerDown}
                onDoubleClick={panelSize.onDoubleClick}
                title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
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
              {catPinned && <SummaryBar zone={zone} />}

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
            {!catPinned && (
              <footer className={s.dashFoot} aria-label="Нэгтгэсэн үзүүлэлт">
                <SummaryBar zone={zone} />
              </footer>
            )}
          </>
        )}
      </div>
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
      <button type="button" className={s.filterClear} onClick={clear} aria-label="Шүүлт цуцлах">
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
  const where = zone ? `${ZONE_FIELD} = ${sqlStr(zone)}` : '1=1';

  const q = useAsync(async () => {
    const Z = ZONE_FIELDS;
    const B = BUILT_FIELDS;
    const [zones, built] = await Promise.all([
      queryStats(layerUrl(ZONE_LAYER), [
        count(OID, 'n'), sum(Z.landHa, 'ga'), sum(Z.households, 'ail'),
      ], where),
      queryStats(layerUrl(BUILT_LAYER), [count(OID, 'n'), sum(B.population, 'pop')], where),
    ]);
    return {
      zones: Number(zones.n ?? 0),
      /**
       * ⚠️ Бүс сонгогдсон үед тэр бүсийн `GAZAR_GA`; сонгоогүй үед ТӨСЛИЙН
       * албан ёсны талбай (`PROJECT_AREA_HA`). Бүх бүсийн нийлбэр (131 га) нь
       * зөвхөн бүсчилсэн газрыг хамардаг тул төслийн хэмжээг илэрхийлэхгүй.
       */
      ga: zone ? Number(zones.ga ?? 0) : PROJECT_AREA_HA,
      ail: Number(zones.ail ?? 0),
      built: Number(built.n ?? 0),
      pop: Number(built.pop ?? 0),
    };
  }, [where]);

  if (q.state === 'error') {
    return <div className={s.sumBar} role="alert"><span className={s.sumLabel}>Үзүүлэлт татагдсангүй</span></div>;
  }
  if (q.state !== 'ready') return <div className={s.sumBar} />;

  const items = [
    { v: num(q.data.ga, 1), l: 'га талбай' },
    { v: num(q.data.zones), l: 'бүс' },
    { v: num(q.data.built), l: 'барилга' },
    { v: num(q.data.ail), l: 'айл' },
    { v: num(q.data.pop), l: 'хүн ам' },
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

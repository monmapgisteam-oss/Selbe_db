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
import { Icon } from '@/components/Icon';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
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

import s from '@/app/shell.module.css';

/** Баруун самбарын өргөний хязгаар ба анхны утга (px) */
const PANEL_MIN = 300;
const PANEL_MAX = 720;
const PANEL_DEFAULT = 360;
const PANEL_KEY = 'selbe-panel-width';

export default function Portal() {
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
  const [catalog, setCatalog] = useState(false);
  const [layer, setLayer] = useState<string | null>(null);

  /** Сонгосон бүс — БҮХ давхарга, БҮХ тоо үүгээр шүүгдэнэ */
  const [zone, setZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, unknown> | null>(null);
  const [pickedLayer, setPickedLayer] = useState<string | null>(null);
  const { theme, toggle } = useTheme();

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
    // Каталогтой харагдац — идэвхтэй дээр нь дахин дарвал хумина.
    // Тусдаа дэлгэцтэй харагдацад (дашбоард, анализ) каталог байхгүй.
    setCatalog(!VIEW_BY_KEY[v].standalone ? !(view === v && catalog) : false);
  }, [view, catalog]);

  const pick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs);
    setPickedLayer(layerId);
  }, []);

  /* ── Баруун самбарын өргөн ── */

  const [panelW, setPanelW] = useState(PANEL_DEFAULT);
  const [dragging, setDragging] = useState(false);

  // ⚠️ Зөвхөн эффект дотор: localStorage нь статик экспортын үед байхгүй
  useEffect(() => {
    const v = Number(localStorage.getItem(PANEL_KEY));
    if (Number.isFinite(v) && v >= PANEL_MIN && v <= PANEL_MAX) setPanelW(v);
  }, []);

  /** Чирэлтийн үед хамгийн сүүлд тооцсон өргөн — тавихад хадгална */
  const lastW = useRef(PANEL_DEFAULT);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add('resizing');

    const x0 = e.clientX;
    const w0 = panelW;
    lastW.current = w0;

    // Самбар БАРУУН талд тул зүүн тийш чирэхэд өргөснө → тэмдэг нь урвуу
    const move = (ev: PointerEvent) => {
      const w = Math.min(PANEL_MAX, Math.max(PANEL_MIN, w0 + (x0 - ev.clientX)));
      lastW.current = w;
      setPanelW(w);
    };
    const up = () => {
      setDragging(false);
      document.body.classList.remove('resizing');
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      try { localStorage.setItem(PANEL_KEY, String(lastW.current)); } catch { /* private mode */ }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };

  /** Давхар товшиход анхны өргөнд буцаана */
  const resetWidth = () => {
    setPanelW(PANEL_DEFAULT);
    try { localStorage.setItem(PANEL_KEY, String(PANEL_DEFAULT)); } catch { /* private mode */ }
  };

  const active = VIEW_BY_KEY[view];
  // Каталог нь «Ерөнхий мэдээлэл» ба «Барилгын хяналт» ХОЁУЛАНД байна
  const catOpen = catalog && !standalone;
  /**
   * ⚠️ Тусдаа дэлгэцтэй харагдацууд ӨӨРИЙН БҮРЭН ДЭЛГЭЦТЭЙ: өөрсдийн газрын
   * зураг, өөрийн байрлалтай. Тиймээс порталын каталог, самбарыг РЕНДЕРЛЭХГҮЙ —
   * хоёр ArcGIS view зэрэг ажиллавал WebGL контекст үрэгдэж, зураг анивчина.
   *   · analysis  — Suitability Modeler (өөрийн 3 багана, харанхуй палитр)
   *   · dashboard — газрын зургийг тойрсон үзүүлэлтийн самбар
   */
  const isSuit = view === 'analysis';
  const isDash = view === 'dashboard';

  return (
    <MapProvider>
      <div
        className={`${s.shell} ${isSuit ? s.shellSuit : ''} ${isDash ? s.shellDash : ''} ${catOpen ? s.shellCat : ''}`}
        style={{ '--hue': active.hue, '--panel': `${panelW}px` } as CSSProperties}
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

          <HeaderStats zone={zone} />

          <div className={s.dimSwitch} role="group" aria-label="Газрын зургийн харагдац">
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

        <div className={s.rail}>
          <ViewRail view={view} setView={setView} catalogOpen={catOpen} />
        </div>

        {/* Анализ — Suitability Modeler-ийн ЭХ дизайнаараа бүтэн талбайг эзэлнэ */}
        {isSuit && (
          <div className={s.suit}>
            {/* ⚠️ Толгойн 2D/3D товч энд ч үйлчилнэ — газрын зураг нь бусад
                харагдацтай ижил суурьтай (ортофото / IntegratedMesh). */}
            <Suitability dim={dim} />
          </div>
        )}

        {/* Ерөнхий дашбоард — газрын зургийг тойрсон үзүүлэлтийн самбар */}
        {isDash && (
          <div className={s.dash}>
            <Dashboard dim={dim} zone={zone} />
          </div>
        )}

        {/* Давхаргын каталог — зүүн модны хажуугийн багана */}
        {!standalone && catOpen && (
          <LayerCatalog
            view={view === 'monitor' ? 'monitor' : 'plan'}
            totals={totals}
            visible={visible}
            setVisible={setVisible}
            selected={layer}
            onSelect={setLayer}
            onClose={() => setCatalog(false)}
            zone={zone}
          />
        )}

        {!standalone && (
          <>
            <div className={s.map}>
              <MapCanvas dim={dim} visible={visible} zone={zone} onPick={pick} />
            </div>

            <aside className={s.panel} id="panel" aria-label={`${active.title} самбар`}>
              {/* Өргөн тохируулах бариул — самбарын зүүн ирмэг дээр */}
              <div
                className={`${s.grip} ${dragging ? s.gripOn : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Самбарын өргөн"
                onPointerDown={startResize}
                onDoubleClick={resetWidth}
                title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
              />

              <header className={s.panelHead}>
                <span className={s.panelIcon}><Icon name={active.icon} /></span>
                <div>
                  <h2 className={s.panelTitle}>{active.title}</h2>
                  <p className={s.panelDesc}>{active.desc}</p>
                </div>
              </header>

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
          </>
        )}
      </div>
    </MapProvider>
  );
}

/* ── Толгойн ерөнхий үзүүлэлт ── */

function HeaderStats({ zone }: { zone: string | null }) {
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
       * албан ёсны талбай (`PROJECT_AREA_HA`). Бүх бүсийн `GAZAR_GA`-гийн
       * нийлбэр (131 га) нь зөвхөн бүсчилсэн газрыг хамардаг бөгөөд эх
       * өгөгдөлд алдаатай бичлэгүүдтэй тул төслийн хэмжээг илэрхийлэхгүй.
       */
      ga: zone ? Number(zones.ga ?? 0) : PROJECT_AREA_HA,
      ail: Number(zones.ail ?? 0),
      built: Number(built.n ?? 0),
      pop: Number(built.pop ?? 0),
    };
  }, [where]);

  if (q.state === 'error') {
    return (
      <div className={s.headStats} role="alert">
        <span className={s.headStatLabel}>Үзүүлэлт татагдсангүй</span>
      </div>
    );
  }
  if (q.state !== 'ready') return <div className={s.headStats} />;

  const items = [
    { v: num(q.data.ga, 1), l: 'га талбай' },
    { v: num(q.data.zones), l: 'бүс' },
    { v: num(q.data.built), l: 'барилга' },
    { v: num(q.data.ail), l: 'айл' },
    { v: num(q.data.pop), l: 'хүн ам' },
    // ⚠️ «₮ төсөв» ХАСАГДСАН: санхүүгийн бүх дүн «Тохиромжтой байдлын
    //    үнэлгээ» модульд төвлөрсөн.
  ];

  return (
    <div className={s.headStats}>
      {items.map((i) => (
        <div key={i.l} className={s.headStat}>
          <span className={`${s.headStatValue} num`}>{i.v}</span>
          <span className={s.headStatLabel}>{i.l}</span>
        </div>
      ))}
    </div>
  );
}

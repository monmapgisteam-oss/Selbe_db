'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MapCanvas, MapProvider } from '@/components/MapCanvas';
import { Icon } from '@/components/Icon';
import { OverlayControl } from '@/components/OverlayControl';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { queryCount, queryStats, queryFeatures, sum } from '@/lib/query';
import { MODULES, DEFAULT_MODULE, BAGTS, ZONE, BUILDING, BOUNDARY, type ModuleKey } from '@/lib/services';
import { num } from '@/lib/format';

import { BagtsPanel } from '@/modules/BagtsPanel';
import { ZonePanel } from '@/modules/ZonePanel';
import { BuildingSummary, BuildingDetail } from '@/modules/BuildingPanel';
import { ParcelPanel } from '@/modules/ParcelPanel';
import { EstimatorPanel } from '@/modules/EstimatorPanel';
import { GeneralPanel } from '@/modules/GeneralPanel';
import { UtilityPanel } from '@/modules/UtilityPanel';
import { SurveyPanel, SurveyOutside } from '@/modules/SurveyPanel';

import s from '@/app/shell.module.css';

const isModule = (v: string): v is ModuleKey => MODULES.some((m) => m.key === v);

export default function Portal() {
  const [module, setModule] = useState<ModuleKey>(DEFAULT_MODULE);
  const [sublayers, setSublayers] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, unknown> | null>(null);
  /** Дарсан объект аль давхаргаас ирсэн — олон дэд давхарга ил үед чухал */
  const [pickedLayer, setPickedLayer] = useState<string | null>(null);
  /** Зурагт давхцуулж харах нэмэлт давхаргууд — статистикт нөлөөлөхгүй */
  const [overlays, setOverlays] = useState<string[]>([]);
  const { theme, toggle } = useTheme();

  const pick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs);
    setPickedLayer(layerId);
  }, []);

  const clearPicked = useCallback(() => {
    setPicked(null);
    setPickedLayer(null);
  }, []);

  const active = MODULES.find((m) => m.key === module)!;

  /* Модуль солигдоход сонголт цэвэрлэнэ */
  const go = useCallback(
    (key: ModuleKey) => {
      setModule(key);
      clearPicked();
      setSublayers([]);
      setOverlays([]);
    },
    [clearPicked],
  );

  /**
   * URL hash ↔ модуль.
   *
   * ⚠️ Заавал `go()`-оор дамжина. Шууд `setModule` дуудвал өмнөх модулийн сонголт
   * (`picked`) үлдэж, шинэ модулийн самбар ӨӨР схемийн атрибутыг уншина.
   */
  const moduleRef = useRef(module);
  moduleRef.current = module;

  useEffect(() => {
    const read = () => {
      const h = location.hash.slice(1);
      if (isModule(h)) {
        go(h);
      } else {
        // Модуль биш hash (жишээ нь skip-link-ийн `#panel`) — үсрэлт нь болчихсон,
        // одоо hash-ыг зөв модуль руу нь буцаана. Эс бөгөөс дахин ачаалахад
        // хэрэглэгч уншиж байсан модуль руугаа биш, эхнийх рүү унана.
        history.replaceState(null, '', `#${moduleRef.current}`);
      }
    };
    read();
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, [go]);

  useEffect(() => {
    if (location.hash.slice(1) !== module) history.replaceState(null, '', `#${module}`);
    document.title = `${active.title} · Сэлбэ портал`;
  }, [module, active.title]);

  /**
   * Туслах багана — ЗӨВХӨН доорх модульд. Бусад нь нэг баганат хэвээр.
   * `side` нь газрын зургийн аль талд байхыг заана (үндсэн дашбоард нөгөө талд).
   */
  const AUX: Partial<Record<ModuleKey, {
    side: 'left' | 'right';
    icon: string;
    title: string;
    desc: string;
    node: ReactNode;
  }>> = {
    building: {
      side: 'right',
      icon: 'chart',
      title: 'Нэгдсэн үзүүлэлт',
      desc: 'Бүх блокийн дундаж ба ангилал',
      node: <BuildingSummary />,
    },
    survey: {
      side: 'left',
      icon: 'target',
      title: 'Байрлалын хяналт',
      desc: 'Төслийн хилээс гадуур бүртгэсэн тайлан',
      node: <SurveyOutside />,
    },
  };

  const aux = AUX[module];

  return (
    <MapProvider>
    <div
      className={[
        s.shell,
        aux && (aux.side === 'left' ? s.shellSplitLeft : s.shellSplitRight),
      ].filter(Boolean).join(' ')}
      style={{ '--hue': active.hue } as CSSProperties}
    >
      <header className={s.head}>
        <div className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandText}>
            <h1 className={s.brandName}>Сэлбэ 20 минутын хот</h1>
            <span className={s.brandSub}>Орон зайн мэдээллийн портал</span>
          </span>
        </div>

        <HeaderStats />

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

      {/* ── Давхаргын жагсаалт ── */}
      <nav className={s.rail} aria-label="Давхаргууд">
        <div className={s.railHead}>Давхарга</div>
        <div className={s.railList}>
          {MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-current={m.key === module}
              title={m.title}
              className={`${s.layer} ${m.key === module ? s.layerOn : ''}`}
              style={{ '--tone': m.hue } as CSSProperties}
              onClick={() => go(m.key)}
            >
              <span className={s.layerIcon}>
                <Icon name={m.icon} />
              </span>
              <span className={s.layerText}>
                <span className={s.layerTitle}>{m.title}</span>
                {m.desc && <span className={s.layerDesc}>{m.desc}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className={s.railFoot}>
          Бүх үзүүлэлт ArcGIS FeatureServer-ээс ажиллах үедээ шууд татагдана.
        </div>
      </nav>

      {/* ── Модулийн үндсэн дашбоард ──
          Нэг баганат үед баруун талд. Хоёр баганат үед туслах баганын эсрэг талд
          (aux.side === 'right' бол зүүн, 'left' бол баруун). */}
      <aside className={s.panel} id="panel" aria-label={`${active.title} дашбоард`}>
        <header className={s.panelHead}>
          <span className={s.panelIcon}>
            <Icon name={active.icon} />
          </span>
          <div>
            <h2 className={s.panelTitle}>{active.title}</h2>
            {active.desc && <p className={s.panelDesc}>{active.desc}</p>}
          </div>
        </header>

        <div className={s.panelBody}>
          {module === 'bagts' && <BagtsPanel picked={picked} />}
          {module === 'zone' && <ZonePanel picked={picked} />}
          {module === 'building' && <BuildingDetail picked={picked} />}
          {module === 'parcel' && <ParcelPanel picked={picked} />}
          {module === 'estimator' && <EstimatorPanel />}
          {module === 'general' && (
            <GeneralPanel
              picked={picked}
              pickedLayer={pickedLayer}
              clearPicked={clearPicked}
              sublayers={sublayers}
              setSublayers={setSublayers}
            />
          )}
          {module === 'utility' && (
            <UtilityPanel sublayers={sublayers} setSublayers={setSublayers} />
          )}
          {module === 'survey' && <SurveyPanel picked={picked} />}
        </div>
      </aside>

      {/* ── Газрын зураг ──
          MapCanvas-ийн children нь зураг дээр хөвнө. «Нэмэлт давхарга» нь зөвхөн
          зурагт нөлөөлдөг тул самбарт биш, энд байрлана. */}
      <div className={s.map}>
        <MapCanvas
          module={module}
          sublayers={sublayers}
          overlays={overlays}
          onPick={pick}
        >
          <OverlayControl module={module} overlays={overlays} setOverlays={setOverlays} />
        </MapCanvas>
      </div>

      {/* ── Туслах багана (2 баганат үед) ──
          Үндсэн дашбоардтай яг ижил бүтэц: ижил өргөн, толгой, бие. */}
      {aux && (
        <aside className={s.summary} aria-label={aux.title}>
          <header className={s.panelHead}>
            <span className={s.panelIcon}>
              <Icon name={aux.icon} />
            </span>
            <div>
              <h2 className={s.panelTitle}>{aux.title}</h2>
              <p className={s.panelDesc}>{aux.desc}</p>
            </div>
          </header>

          <div className={s.panelBody}>{aux.node}</div>
        </aside>
      )}
    </div>
    </MapProvider>
  );
}

/* ── Толгойн ерөнхий үзүүлэлт ── */

function HeaderStats() {
  const q = useAsync(async () => {
    const [area, bagts, zoneRows, blocks, households] = await Promise.all([
      // Талбай — ТӨЛӨВЛӨЛТИЙН ТАЛБАЙгаас (нэг эрх бүхий полигон, 159.57 га).
      // ⚠️ Бүсийн `SUM(GAZAR_GA)` ашиглаж болохгүй: тэр давхаргад 20 бүс давхардсан
      //    хуулбартай тул нийлбэр нь 175.85 га гэж хийсвэрждэг.
      queryStats(BOUNDARY.plan.url, [sum(BOUNDARY.plan.areaField, 'ha')]),
      queryCount(BAGTS.url),
      // Бүсийн ТОО — мөн ZONE_ID-аар дедупликац хийж бодит бүсийн тоог гаргана
      queryFeatures(ZONE.url, { outFields: [ZONE.fields.id] }),
      queryCount(BUILDING.url),
      queryStats(BUILDING.url, [sum(BUILDING.fields.households, 'ail')]),
    ]);

    const ids = zoneRows.map((r) => String(r[ZONE.fields.id] ?? '').trim());
    const named = new Set(ids.filter(Boolean));
    const unnamed = ids.filter((v) => !v).length;

    return {
      ga: Number(area.ha ?? 0),
      bagts,
      zones: named.size + unnamed,
      blocks,
      households: Number(households.ail ?? 0),
    };
  }, []);

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
    { v: num(q.data.bagts), l: 'багц' },
    { v: num(q.data.zones), l: 'бүс' },
    { v: num(q.data.blocks), l: 'блок' },
    { v: num(q.data.households), l: 'айл' },
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

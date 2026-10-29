'use client';

import { useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFilter, type ActiveFilter } from '@/lib/filter';
import { Icon } from './Icon';
import { ZoneFilter } from './ZoneFilter';
import { useMap, type Dim } from './MapCanvas';
import { prefetch3d } from './lazy3d';
import { BIM_PKGS, setBimPkg, setRender3d, useBimPkg, useRender3d, type Render3d } from './render3d';
import s from './mapTools.module.css';

/**
 * ИДЭВХТЭЙ ШҮҮЛТИЙН ЧИП-ийн бичиглэл — шүүлт байхгүй бол `null`.
 */
/** 3D/BIM зураглалын горимын товчны дараалал */
const R3: Render3d[] = ['fast', 'fine'];

export function activeFilterLabel(
  active: Pick<ActiveFilter, 'group' | 'label'> | null,
  highlight: { where: string | null; geometry?: unknown },
): string | null {
  if (active) return active.group ? `${active.group}: ${active.label}` : active.label;
  if (highlight.where || highlight.geometry) return tr('Газрын зургийн шүүлт');
  return null;
}

/**
 * Зургийн хэрэгслийн зурвасын ✕-тэй ЧИП — идэвхтэй шүүлтийг ҮРГЭЛЖ цуцлах боломж.
 */
export function ActiveFilterChip() {
  const filter = useFilter();
  const { highlight, setHighlight } = useMap();
  const label = activeFilterLabel(filter.active, highlight);
  if (!label) return null;
  const clear = () => {
    if (filter.active) filter.clear();
    if (highlight.where || highlight.geometry) setHighlight(null);
  };
  return (
    <div data-report-skip="" className={`${s.filterChip} mapFilterChip`} role="status" title={label}>
      <span className={s.filterChipText}>{label}</span>
      <button
        type="button"
        className={s.filterChipX}
        onClick={clear}
        aria-label={tr('Шүүлтийг цуцлах')}
        title={tr('Шүүлтийг цуцлах')}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * ГАЗРЫН ЗУРГИЙН НЭГДСЭН ХЭРЭГСЛИЙН ЗУРВАС.
 *
 *   · «Багцын хяналт», «Газар чөлөөлөлт» — Давхарга ч, Тунгалаг ч алга
 *   · «Ерөнхий дашбоард», «Иргэдэд хүрэх» — Тунгалаг алга
 *   · «ХАБЭА», «Тохиромжтой байдал» — Бүс алга
 *   · «IoT хяналт» — BIM огт алга (зөвхөн 2D/3D)
 *
 * Одоо БҮХ харагдац ижил зурвас, ижил дараалал, ижил загвартай:
 *
 *   [Давхарга] [Тунгалаг] [Бүс] │ [2D 3D BIM] [харагдацын нэмэлт товч…]
 *
 * Товч бүр нь ХАРГАЛЗАХ ПРОП өгсөн үед л зурагдана — жишээ нь зөвхөн
 * унших зурагт `onLayers` дамжуулахгүй бол «Давхарга» гарахгүй. Гэхдээ
 * зорилго нь БҮХ харагдацад гурвуулаа байх (хэрэглэгчийн шийдвэр).
 */
export function MapTools({
  dim,
  setDim,
  dims = ['2d', '3d', 'bim'],
  layersOpen,
  onLayers,
  opacityOpen,
  opacityCount = 0,
  onOpacity,
  zone,
  setZone,
  dock = false,
  children,
}: {
  dim: Dim;
  setDim: (d: Dim) => void;
  /**
   * Ямар хэмжээст горимууд боломжтой вэ.
   */
  dims?: Dim[];
  /** Давхаргын каталог нээлттэй эсэх. `onLayers` байхгүй бол товч зурагдахгүй. */
  layersOpen?: boolean;
  onLayers?: () => void;
  /** Тунгалагийн хавтан нээлттэй эсэх. `onOpacity` байхгүй бол товч зурагдахгүй. */
  opacityOpen?: boolean;
  /**
   * ХЭДЭН давхаргын тунгалаг ӨӨРЧЛӨГДСӨН бэ — товчны тэмдэгт.
   */
  opacityCount?: number;
  onOpacity?: () => void;
  /**
   * Бүсийн шүүлт. `setZone` байхгүй бол товч зурагдахгүй.
   */
  zone?: string | null;
  setZone?: (z: string | null) => void;
  /**
   * ЗҮҮН ХАВТАСНЫ ЗОХИОМЖ — зурвас нь зургийн зүүн ирмэгийн хавтасны
   * ХЭВТЭЭ ТОЛГОЙ болно (2026-09-15).
   */
  dock?: boolean;
  /** Харагдацын ӨӨРИЙН товчнууд — «Полигон зурах», «Дулаан» гэх мэт */
  children?: ReactNode;
}) {
  /**
   * «Бүс» хавтан нээлттэй эсэх.
   */
  const [zoneOpen, setZoneOpen] = useState(false);
  /**
   * ЗУРВАС ба ХАРАГДАЦЫН ТОВЧ ХУРААГДСАН эсэх (2026-09-15, хэрэглэгчийн
   * заавар: «Ерөнхий дашбоард дээрх зургийн товчны hide/unhide-ыг энэ
   * төсөл дээрх БҮХ зурагтай ижил болго»).
   */
  const barOn = true;
  const r3 = useRender3d();
  const bimPkg = useBimPkg();
  const zoneCount = zone ? zone.split(',').filter(Boolean).length : 0;

  /**
   * Бүсийн хавтан ЖИНХЭНЭ ил үү.
   */
  const zoneShown = zoneOpen && !layersOpen && !opacityOpen && barOn;


  return (
    <>
    {/*
      * Зурвасыг хураах/дэлгэх бариул — зургийн зүүн ирмэг дээр.
      */}

    <div data-report-skip="" className={`${s.tools} mapToolsBar ${dock ? s.toolsDock : ''}`}>
      <ActiveFilterChip />
      {onLayers && (
        <button
          type="button"
          aria-pressed={layersOpen}
          className={`${s.btn} mapToolsBtn ${dock ? s.btnDock : ''} ${layersOpen ? s.btnOn : ''}`}
          onClick={onLayers}
          title={tr('Давхаргын жагсаалт')}
        >
          <Icon name="layers" size={15} />
          {tr('Давхарга')}
        </button>
      )}

      {onOpacity && (
        <button
          type="button"
          aria-pressed={opacityOpen}
          className={`${s.btn} mapToolsBtn ${dock ? s.btnDock : ''} ${opacityOpen ? s.btnOn : ''}`}
          onClick={onOpacity}
          title={tr('Давхаргын тунгалаг')}
        >
          <Icon name="droplet" size={15} />
          {tr('Тунгалаг')}{opacityCount ? ` · ${opacityCount}` : ''}
        </button>
      )}

      {/* «Бүс» — «Давхарга»/«Тунгалаг»-тай ЯГ ижил товч, ижил хэлбэрийн хавтан */}
      {setZone && (
        <button
          type="button"
          aria-pressed={zoneShown}
          className={`${s.btn} mapToolsBtn ${dock ? s.btnDock : ''} ${zoneShown ? s.btnOn : ''}`}
          onClick={() => {
            if (zoneShown) { setZoneOpen(false); return; }
            if (layersOpen) onLayers?.();
            if (opacityOpen) onOpacity?.();
            setZoneOpen(true);
          }}
          title={tr('Бүсээр шүүх')}
        >
          <Icon name="frame" size={15} />
          {tr('Бүс')}{zoneCount ? ` · ${zoneCount}` : ''}
        </button>
      )}

      {children}
    </div>

    {/**
      * 2D ↔ 3D ↔ BIM — ЗУРВАСААС САЛГАЖ, ГОЛД (хэрэглэгчийн хүсэлт 2026-08-23).
      * Хэмжээст горим нь «юуг харуулах» биш «ЯАЖ харуулах» сонголт тул панель
      * нээгчидтэй нэг баганад байхаас илүү тусдаа, өмнөх байрлалдаа тохирно.
      */}
    {/* 2D/3D/BIM сегментийг хураах бариул — зурвасныхаа дор/дээр */}

    <div data-report-skip="" className={`${s.dimsBar} mapDims`} role="group" aria-label={tr('Газрын зургийн харагдац')}>
      {dims.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={dim === d}
          className={`${s.dimBtn} mapDimBtn ${dim === d ? s.dimOn : ''}`}
          onClick={() => setDim(d)}
          onPointerEnter={d === '2d' ? undefined : prefetch3d}
          onFocus={d === '2d' ? undefined : prefetch3d}
        >
          {d.toUpperCase()}
        </button>
      ))}
      {dim !== '2d' && (
        <>
          <span className={s.dimSep} aria-hidden="true" />
          <span className={s.qGroup} role="group" aria-label={tr('3D зураглалын чанар')}>
            {R3.map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={r3 === q}
                className={`${s.dimBtn} ${s.qBtn} mapDimBtn ${r3 === q ? s.dimOn : ''}`}
                title={q === 'fast'
                  ? tr('Хурдан — гөлгөр хөдөлгөөн: BIM-ийн гадна бүрхүүл, ойрын барилга бүрэн, сүүдэр/тусгалгүй')
                  : tr('Нарийн — СОНГОСОН багцын BIM-ийн бүх элемент, өндөр чанар')}
                onClick={() => setRender3d(q)}
              >
                {q === 'fast' ? tr('Хурдан') : tr('Нарийн')}
              </button>
            ))}
          </span>
          {dim === 'bim' && r3 === 'fine' && (
            <select
              className={s.pkgSel}
              value={bimPkg.pkg}
              aria-label={tr('BIM багц')}
              title={tr('Нарийн горимд зөвхөн энэ багцын BIM ачаалагдана')}
              onChange={(e) => setBimPkg(e.target.value, true)}
            >
              {!bimPkg.pkg && <option value="">{tr('Багц…')}</option>}
              {BIM_PKGS.map((p) => (
                <option key={p} value={p}>{tr('Багц {0}', p)}</option>
              ))}
            </select>
          )}
        </>
      )}
    </div>

    {setZone && zoneShown && (
      <div
        className={`${s.zonePanel} ${dock ? s.zoneDock : ''}`}
        role="region"
        aria-label={tr('Бүсээр шүүх')}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setZoneOpen(false); } }}
      >
        <header className={s.zoneHead}>
          <span className={s.zoneTitle}>{tr('Бүсээр шүүх')}</span>
          <button
            type="button"
            className={s.zoneClose}
            onClick={() => setZoneOpen(false)}
            aria-label={tr('Хаах')}
            title={tr('Хаах')}
          >
            ×
          </button>
        </header>
        <div className={s.zoneBody}>
          <ZoneFilter zone={zone ?? null} setZone={setZone} variant="panel" />
        </div>
      </div>
    )}
    </>
  );
}

/** Харагдацын нэмэлт товчийг зурвасын ижил загвараар зурах туслах. */
export function MapToolBtn({
  icon,
  on = false,
  disabled = false,
  title,
  onClick,
  children,
}: {
  icon?: string;
  on?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      className={`${s.btn} mapToolsBtn ${on ? s.btnOn : ''}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

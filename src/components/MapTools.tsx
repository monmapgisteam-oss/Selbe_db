'use client';

import { useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from './Icon';
import { ZoneFilter } from './ZoneFilter';
import type { Dim } from './MapCanvas';
import s from './mapTools.module.css';

/**
 * ГАЗРЫН ЗУРГИЙН НЭГДСЭН ХЭРЭГСЛИЙН ЗУРВАС.
 *
 * ⚠️ 2026-08-20: Урьд нь ЕС харагдац тус бүр өөрийн зурвасыг гараар барьдаг
 * байв (`['2d','3d','bim'].map(...)` нь есөн файлд хуулагдсан). Үр дүнд нь
 * бүрдэл нь харагдац болгонд зөрдөг байлаа:
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
  onOpacity,
  zone,
  setZone,
  children,
}: {
  dim: Dim;
  setDim: (d: Dim) => void;
  /**
   * Ямар хэмжээст горимууд боломжтой вэ.
   * ⚠️ Анхдагчаар ГУРВУУЛАА. Хязгаарлах бодит шалтгаан гарвал (жиш. тухайн
   * зурагт web scene холбогдоогүй) л богиносгоно — «санаж яваагүй» гэдэг нь
   * шалтгаан биш байсан тул IoT-д BIM дутдаг байв.
   */
  dims?: Dim[];
  /** Давхаргын каталог нээлттэй эсэх. `onLayers` байхгүй бол товч зурагдахгүй. */
  layersOpen?: boolean;
  onLayers?: () => void;
  /** Тунгалагийн хавтан нээлттэй эсэх. `onOpacity` байхгүй бол товч зурагдахгүй. */
  opacityOpen?: boolean;
  onOpacity?: () => void;
  /**
   * Бүсийн шүүлт. `setZone` байхгүй бол товч зурагдахгүй.
   *
   * ⚠️ Бүсгүй давхаргад аюулгүй: `zoneWhere()` нь `noZone` давхаргад `null`
   * буцаадаг тул шүүлт тэдэнд үйлчлэхгүй, `definitionExpression` эвдэрч
   * давхарга алга болох эрсдэлгүй (DATA_DICTIONARY-ийн сануулга).
   */
  zone?: string | null;
  setZone?: (z: string | null) => void;
  /** Харагдацын ӨӨРИЙН товчнууд — «Полигон зурах», «Дулаан» гэх мэт */
  children?: ReactNode;
}) {
  /**
   * «Бүс» хавтан нээлттэй эсэх.
   *
   * ⚠️ Төлөв нь ЭНД амьдарна — «Давхарга»/«Тунгалаг» хоёрын төлөв модульд
   * байдаг (тэдний агуулга модулиас хамаардаг), харин бүсийн жагсаалт нь БҮХ
   * харагдацад ижил тул модуль бүрд `useState` нэмүүлэх шаардлагагүй.
   */
  const [zoneOpen, setZoneOpen] = useState(false);
  const zoneCount = zone ? zone.split(',').filter(Boolean).length : 0;

  /**
   * Бүсийн хавтан ЖИНХЭНЭ ил үү.
   *
   * ⚠️ Гурван хавтан (каталог · тунгалаг · бүс) зурвасын баруун талын НЭГ л
   * байрлалыг эзэлдэг тул зэрэг нээгдвэл бие бие рүүгээ дарна. Бусад хоёрын
   * аль нэг нээлттэй үед бүсийнхийг НУУНА.
   *
   * ⚠️ Үүнийг `useEffect`-ээр (нөгөө хоёр нээгдэхэд `setZoneOpen(false)`)
   * хийсэн ч болно, гэхдээ тэр нь илүү дамжлагат рендер үүсгэдэг. ГАРГАЖ АВСАН
   * утга нь энгийн: хэрэглэгч нөгөө хавтангаа хаахад бүсийнх нь нээлттэй
   * хэвээрээ буцаж гарч ирнэ — сонголт нь алдагдахгүй.
   */
  const zoneShown = zoneOpen && !layersOpen && !opacityOpen;

  return (
    <>
    <div className={s.tools}>
      {onLayers && (
        <button
          type="button"
          aria-pressed={layersOpen}
          className={`${s.btn} ${layersOpen ? s.btnOn : ''}`}
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
          className={`${s.btn} ${opacityOpen ? s.btnOn : ''}`}
          onClick={onOpacity}
          title={tr('Давхаргын тунгалаг')}
        >
          <Icon name="droplet" size={15} />
          {tr('Тунгалаг')}
        </button>
      )}

      {/* «Бүс» — «Давхарга»/«Тунгалаг»-тай ЯГ ижил товч, ижил хэлбэрийн хавтан */}
      {setZone && (
        <button
          type="button"
          aria-pressed={zoneShown}
          className={`${s.btn} ${zoneShown ? s.btnOn : ''}`}
          onClick={() => setZoneOpen((v) => !v)}
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
    <div className={s.dimsBar} role="group" aria-label={tr('Газрын зургийн харагдац')}>
      {dims.map((d) => (
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

    {/* ⚠️ Хавтан нь `.tools`-ЫН ГАДНА — тэр нь `overflow-y: auto` тул дотор нь
        байрлуулбал бүсийн жагсаалт гүйлгэх хайрцагт таслагдана. */}
    {setZone && zoneShown && (
      <div className={s.zonePanel}>
        <header className={s.zoneHead}>
          <span className={s.zoneTitle}>{tr('Бүсээр шүүх')}</span>
          <button
            type="button"
            className={s.zoneClose}
            onClick={() => setZoneOpen(false)}
            aria-label={tr('Хаах')}
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
      className={`${s.btn} ${on ? s.btnOn : ''}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

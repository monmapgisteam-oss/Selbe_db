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
  /**
   * ХЭДЭН давхаргын тунгалаг ӨӨРЧЛӨГДСӨН бэ — товчны тэмдэгт.
   *
   * ⚠️ 2026-09-15-ны хэрэглээний аудит: тунгалаг нь харагдац солиход
   *    ТЭГЛЭГДДЭГГҮЙ бөгөөд товчинд ямар ч тэмдэг байгаагүй тул 10%-д
   *    чирсэн давхарга бүх дараагийн харагдацад бараг үл үзэгдэх хэвээр
   *    үлдэж, «яагаад зураг хоосон вэ» гэсэн жинхэнэ занга үүсгэдэг байв.
   *    «Бүс · 2»-тай ЯГ ижил хэлбэр.
   */
  opacityCount?: number;
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
  /**
   * ЗҮҮН ХАВТАСНЫ ЗОХИОМЖ — зурвас нь зургийн зүүн ирмэгийн хавтасны
   * ХЭВТЭЭ ТОЛГОЙ болно (2026-09-15).
   *
   * ⚠️ ЗӨВХӨН «Ерөнхий төлөвлөгөө»-д (хэрэглэгчийн заавар: «мапын зүүн
   * талд гаргана гэдэг нь зөвхөн ерөнхий төлөвлөгөө дээр, бусад нь яг
   * хэвээрээ»). Анхдагч `false` — бусад бүх харагдац зүүн дээд буланд
   * босоо баганатай хэвээр.
   */
  dock?: boolean;
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
  /**
   * ЗУРВАС ба ХАРАГДАЦЫН ТОВЧ ХУРААГДСАН эсэх (2026-09-15, хэрэглэгчийн
   * заавар: «Ерөнхий дашбоард дээрх зургийн товчны hide/unhide-ыг энэ
   * төсөл дээрх БҮХ зурагтай ижил болго»).
   *
   * ⚠️ Урьд нь энэ зан ЗӨВХӨН «Ерөнхий дашбоард»-д, тэр модулийн ӨӨРИЙН
   * товч ба `data-tools`/`data-dims` CSS-ээр хийгдсэн байв. Одоо
   * хуваалцсан бүрэлдэхүүн дотор орсон тул харагдац бүрд давтах
   * шаардлагагүй — шинэ зураг нэмэхэд ч өөрөө дагана.
   *
   * ⚠️ АНХДАГЧ нь НЭЭЛТТЭЙ (2026-09-15-ны залруулга: «энэ 3 сонголт
   * хаачив?»). Богино хугацаанд хураасан хэвээр эхлүүлж үзсэн нь
   * «Давхарга · Тунгалаг · Бүс» гурвыг нүднээс далдалж, хэрэглэгч
   * жижиг бариулыг олохгүй байв. Хураах боломж нь бариулаар үлдэнэ.
   */
  const [barOn, setBarOn] = useState(true);
  const [dimsOn, setDimsOn] = useState(false);
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
  const zoneShown = zoneOpen && !layersOpen && !opacityOpen && barOn;

  return (
    <>
    {/* ⚠️ `mapTools*` — ГЛОБАЛ нэрс (`statCard`, `secTitle`-тэй ижил зарчим).
        Дуудагч харагдац товчны хэмжээг өөрийн нягтралд тааруулж дарж бичихэд
        хэрэгтэй: жижиг зурагтай дашбоардад 176px өргөн багана нь зургийн
        талыг эзэлдэг. Энд ЗӨВХӨН нэр — хэмжээ нь энэ файлын анхдагч хэвээр. */}
    {/*
      * Зурвасыг хураах/дэлгэх бариул — зургийн зүүн ирмэг дээр.
      *
      * ⚠️ Жагсаалт нээлттэй үед ч ХЭВЭЭР харагдана: жагсаалт нь товчны
      * баганын БАРУУН талаас эхэлдэг тул давхцахгүй (`shell.module.css`
      * §catPop, `generalDash.module.css` §catPanel).
      */}
    <button
      type="button"
      aria-expanded={barOn}
      className={[
        s.tab,
        dock ? s.tabDock : s.toolsTab,
        barOn ? (dock ? s.tabDockOpen : s.toolsTabOpen) : '',
      ].filter(Boolean).join(' ')}
      title={barOn ? tr('Товчнуудыг хураах') : tr('Товчнуудыг харуулах')}
      aria-label={barOn ? tr('Товчнуудыг хураах') : tr('Товчнуудыг харуулах')}
      onClick={() => setBarOn((v) => !v)}
    >
      {barOn ? '◂' : '▸'}
    </button>

    {barOn && (
    <div className={`${s.tools} mapToolsBar ${dock ? s.toolsDock : ''}`}>
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
          onClick={() => setZoneOpen((v) => !v)}
          title={tr('Бүсээр шүүх')}
        >
          <Icon name="frame" size={15} />
          {tr('Бүс')}{zoneCount ? ` · ${zoneCount}` : ''}
        </button>
      )}

      {children}
    </div>
    )}

    {/**
      * 2D ↔ 3D ↔ BIM — ЗУРВАСААС САЛГАЖ, ГОЛД (хэрэглэгчийн хүсэлт 2026-08-23).
      * Хэмжээст горим нь «юуг харуулах» биш «ЯАЖ харуулах» сонголт тул панель
      * нээгчидтэй нэг баганад байхаас илүү тусдаа, өмнөх байрлалдаа тохирно.
      */}
    {/* 2D/3D/BIM сегментийг хураах бариул — зурвасныхаа дор/дээр */}
    <button
      type="button"
      aria-expanded={dimsOn}
      className={`${s.tab} ${s.dimsTab} ${dimsOn ? s.dimsTabOpen : ''}`}
      title={dimsOn ? tr('Харагдацын товч хураах') : tr('Харагдацын товч дэлгэх')}
      aria-label={dimsOn ? tr('Харагдацын товч хураах') : tr('Харагдацын товч дэлгэх')}
      onClick={() => setDimsOn((v) => !v)}
    >
      {dimsOn ? '▴' : '▾'}
    </button>

    {dimsOn && (
    <div className={`${s.dimsBar} mapDims`} role="group" aria-label={tr('Газрын зургийн харагдац')}>
      {dims.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={dim === d}
          className={`${s.dimBtn} mapDimBtn ${dim === d ? s.dimOn : ''}`}
          onClick={() => setDim(d)}
        >
          {d.toUpperCase()}
        </button>
      ))}
    </div>
    )}

    {/* ⚠️ Хавтан нь `.tools`-ЫН ГАДНА — тэр нь `overflow-y: auto` тул дотор нь
        байрлуулбал бүсийн жагсаалт гүйлгэх хайрцагт таслагдана. */}
    {setZone && zoneShown && (
      <div className={`${s.zonePanel} ${dock ? s.zoneDock : ''}`}>
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
      className={`${s.btn} mapToolsBtn ${on ? s.btnOn : ''}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

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
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): хоёр эх сурвалж —
 *    · `useFilter().active` (самбарын ангиллын шүүлт) → «Бүлэг: Нэр»;
 *    · `useMap().highlight` (`setHighlight`-ийг ШУУД дууддаг модулиуд — полигон,
 *      хайлт г.м.) → ерөнхий «Газрын зургийн шүүлт».
 *    Урьд нь шууд `setHighlight` хийсэн шүүлт зөвхөн тэр модулийн дотор цуцлагддаг
 *    тул самбар солигдох/хаагдахад зураг БҮДЭГ хэвээр «гацдаг» байв.
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
 * ⚠️ Самбарын шүүлт байвал `filter.clear()` (төлөв + тодруулга + бүсийн хүрээ рүү
 *    буцах); зөвхөн тодруулга бол `setHighlight(null)`.
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
  /* ⚠️ 2026-10-07 (хэрэглэгчийн хүсэлт: «эхний харагдац дээр хураагдсан байх»): АНХДАГЧ ХУРААГДСАН.
     Дээрх 2026-09-15-ны «нээлттэй» шийдвэрийг хэрэглэгч өөрөө сольсон — бариул (◂) нь нээх зам. */
  /* ⚠️ 2026-10-23 (хэрэглэгчийн баталсан санал): ◂/▴ ХУРААХ СУМ ХАСАГДАВ — зурвас ба 2D/3D/BIM ҮРГЭЛЖ харагдана
     (дээрх/доорх анхдагч төлвийн шийдвэрүүд хүчингүй). */
  const barOn = true;
  /* ⚠️ 2026-10-04: 3D/BIM зураглалын горим — MapCanvas ижил хадгалалтаас уншина (`render3d.ts`) */
  const r3 = useRender3d();
  /* ⚠️ 2026-10-14: «Нарийн»-ы BIM багц (`render3d.BimPkgState`) */
  const bimPkg = useBimPkg();
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

  /* ⚠️ 2026-10-23: 3D/BIM-ийн `lift` (205px доош) ХАСАГДАВ — Esri-ийн +/− · луужин · чиглэл солих баруун
     дээд баганад шилжсэн (`MapCanvas` §ui.move) тул зүүн дээд булан энэ зурвасынх. */

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

    <div data-report-skip="" className={`${s.tools} mapToolsBar ${dock ? s.toolsDock : ''}`}>
      {/* ⚠️ 2026-10-01: идэвхтэй шүүлт/тодруулга байвал ✕-тэй чип — ХАМГИЙН ДЭЭР */}
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
          /* ⚠️ 2026-10-07: каталог/тунгалаг нээлттэй үед «Бүс» ҮХМЭЛ байв — `zoneShown`-ийн
             нуух дүрэм (дээрх ⚠️) ХЭВЭЭР, харин товшилт нөгөө хоёрыг хаагаад бүсийнхийг гаргана. */
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
          /* ⚠️ 2026-10-04: 3D/BIM-ийн модуль хоцорч ачаалагдана (`lazy3d`) — товч руу хулгана/фокус
             очмогц урьдчилан татаж, дарах агшны хүлээлтийг багасгана (2D хэрэглэгч товч руу
             очоогүй бол огт татахгүй). */
          onPointerEnter={d === '2d' ? undefined : prefetch3d}
          onFocus={d === '2d' ? undefined : prefetch3d}
        >
          {d.toUpperCase()}
        </button>
      ))}
      {/* ⚠️ 2026-10-04: 3D/BIM ЗУРАГЛАЛЫН ГОРИМ — «Хурдан» (анхдагч) / «Нарийн» (`render3d.ts`-ийн ⚠️).
          ЗӨВХӨН 3D/BIM-д (2D-д утгагүй). Сонголт localStorage-д — дараагийн нээлтэд хэвээр. */}
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
          {/* ⚠️ 2026-10-14 (хэрэглэгч: «нарийн дээр багц сонгоод ачаалладаг болго»): «Нарийн» + BIM үед БАГЦ
              сонгогч — зөвхөн тэр багцын BIM ачаалагдана (`render3d.BimPkgState`). Сонгоогүй бол камерт ойр
              багц өөрөө сонгогдоно; сонгоход тэр багц руу ойртоно. */}
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

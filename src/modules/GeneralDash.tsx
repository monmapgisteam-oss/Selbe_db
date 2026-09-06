'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Section, Stats, Stat, Data, Empty, Bars, monotonePath, TIP_RULE } from '@/components/ui';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useAsync } from '@/lib/useAsync';
import { usePlanTotals, qtyText } from '@/lib/totals';
import { loadLandStatus } from '@/lib/land';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { loadPkgOverlaps } from '@/lib/pkgSaad';
import {
  /* ⚠️ `PKG_BY_FAMILY` нь ЗӨВХӨН «Ерөнхий төлөвлөгөө» картын шугам
     сүлжээний нийлбэр уртад хэрэглэгдэнэ — газар чөлөөлөлтийн давхцал нь
     2026-09-04-нд гэр бүлээс ДЭД БАГЦ руу шилжсэн. */
  PKG_BY_FAMILY, BUILDING, LAYER_BY_ID, PARCEL_LEFT, ZONE_FIELD, ZONE_NONE, type PkgFamily,
} from '@/lib/services';
import { queryStats, count } from '@/lib/query';
import { cat, mnt, num, pct } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow, loadReasonOids, loadSubPkgLayers,
  chartTypeCost, chartTypeCount, chartSourceMerged, chartNoteAmount,
  timeline, grainOf, kpisOf, inPeriod, yearsOf, periodActive, activeSubPkgTypes,
  type Grain,
  NO_PERIOD,
  type CfRow, type Period, type SubBar, type SubPkg,
} from '@/lib/gdash';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import g from './generalDash.module.css';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ТӨСЛИЙН НЭГ ХУУДАС ДЭЭРХ ТОЙМ.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Жил · Улирал · Сар — БҮХ картад нэгэн зэрэг үйлчилнэ     │
 *   ├────────────┬──────────────────────────┬──────────────────┤
 *   │ САНХҮҮ     │ индикаторын зурвас       │ ХАБ              │
 *   │ 4 чарт     │ ГАЗРЫН ЗУРАГ (2D/3D/BIM) │ ГАЗАР ЧӨЛӨӨЛӨЛТ  │
 *   │            │ S-МУРУЙ                  │ ЕРӨНХИЙ ТӨЛӨВЛ.  │
 *   └────────────┴──────────────────────────┴──────────────────┘
 *
 * ⚠️ ЭНЭ НЬ «Төслийн дэлгэрэнгүй мэдээлэл» (`Dashboard.tsx`)-ЫГ ОРЛОХГҮЙ.
 * Тэр нь 9 дэд хэсэгт задардаг СУДЛАХ хэрэгсэл; энэ нь нэг дэлгэцэд багтдаг,
 * задрахгүй ТОЙМ. Хоёулаа `standalone` харагдац бөгөөд `MapCanvas`-аа
 * хуваалцана.
 *
 * ⚠️ ХУГАЦААНЫ ШҮҮЛТ нь ЗӨВХӨН cashflow-д тулгуурласан картуудад (зүүн 4 чарт,
 * S-муруй, индикатор) үйлчилнэ. ХАБ, газар чөлөөлөлт, ерөнхий төлөвлөгөө нь
 * ажлын төлөвлөгөөт хугацааны талбаргүй тул тэднийг хуурамчаар шүүхгүй —
 * картын толгойд «Бүх хугацаа» гэж ИЛ бичнэ.
 */
export function GeneralDash({
  dim, setDim, zone, setZone,
}: {
  dim: Dim;
  setDim: (d: Dim) => void;
  zone: string | null;
  setZone: (z: string | null) => void;
}) {
  const [period, setPeriod] = useState<Period>(NO_PERIOD);
  const [layerOpen, setLayerOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  /**
   * ЗУРГИЙН УДИРДЛАГЫГ ХУРААХ — ХОЁР ТУСДАА (2026-09-04, хэрэглэгчийн хүсэлт:
   * «2D 3D товчийг ДЭЭШЭЭ хураа, давхарга ба тунгалагийг ЗҮҮН тийш хугална,
   * сум харагдана — яг header шиг»).
   *
   * ⚠️ Нэг товчоор ХОЁУЛАНГ нь хураадаг байсныг САЛГАВ: тэдгээр нь зургийн
   * өөр өөр буланд, өөр хэрэгцээтэй. 2D/3D/BIM-ийг ховор сольдог тул байнга
   * хураалттай байлгамаар; давхаргын жагсаалт эсрэгээрээ ажлын хэрэгсэл.
   *
   * ⚠️ Хураах товч нь ӨӨРӨӨ ХЭЗЭЭ Ч нуугдахгүй — эс бөгөөс буцааж нээх зам
   * үлдэхгүй. Тиймээс сум нь хураасан ч байрандаа үлдэж, чиглэлээ л сольдог.
   */
  /* ⚠️ АНХДАГЧААР ХУРААЛТТАЙ (2026-09-04, хэрэглэгчийн шийдвэр: «ингээд hide
     хийсэн, нээгээд харна, бусад үед hide»). Энэ дашбоардын зураг нь гурван
     баганын дунд, доор нь S-муруйтай тул талбай нь хомс — удирдлага нь
     хэрэгтэй агшинд нь л гарч ирнэ. */
  const [toolsOn, setToolsOn] = useState(false);
  const [dimsOn, setDimsOn] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  /**
   * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ШҮҮЛТ — сонгосон шалтгааны нэгж талбарууд.
   *
   * ⚠️ ЗУМ ХАНГАЛТГҮЙ: «дүйцүүлсэн» дээр дарахад 3 талбар руу ойртдог ч бусад
   * 2,085 талбар нь дэлгэц дүүрэн хэвээр үлдэж, аль гурав нь болох нь
   * ялгагдахгүй байв (хэрэглэгчийн шүүмж, 2026-09-06). Тиймээс
   * `definitionExpression`-ээр бусдыг нь БҮРМӨСӨН хасна.
   */
  const [parcelWhere, setParcelWhere] = useState<string | null>(null);

  /**
   * ХАЖУУГИЙН ХОЁР БАГАНЫГ ЧИРЖ ӨРГӨСГӨНӨ — «Төслийн дэлгэрэнгүй мэдээлэл»,
   * «Багцын гүйцэтгэл» хоёртой ИЖИЛ механизм (`--side-l` / `--side-r`).
   *
   * ⚠️ Өргөнийг `localStorage`-д түлхүүрээрээ санана; давхар товшвол анхны
   * (дэлгэцийн хэмжээнээс хамаарсан) утгад буцна.
   */
  const side = useSideResize('gdash');

  /* Газрын зургийн API — дэд багц дарахад тэр давхарга руу ойртуулна */
  const map = useMap();

  /* Суурь давхарга — бүс ба ерөнхий төлөвлөгөөний барилга (дэлгэрэнгүй
     дашбоардтай ижил эхлэл). Каталогоос нэмсэн нь `useLayerPicks`-д үлдэнэ. */
  const base = useMemo(() => ['zone', 'et:24'], []);
  const [visible, setVisible] = useLayerPicks(base);

  const totals = usePlanTotals(zone, true);
  const cf = useAsync(loadGdashCf, []);

  /**
   * ШҮҮЛТЭД БАГТСАН дэд багц → ажлын төрлүүд.
   *
   * ⚠️ Баруун баганын хоёр карт (`LandCard`-ын «Ажлын төрлөөр давхцаж буй»,
   * `SaadCard`) нь cashflow дээр тулгуурладаг тул хугацааны шүүлтийг ДАГАХ
   * ёстой. Урьд нь тэдгээр нь өөрсдийн кэшлэгдсэн бүтэн жагсаалтаас уншдаг
   * байсан тул шүүлт тавихад ч БҮГД харагдсаар байв (хэрэглэгчийн шүүмж,
   * 2026-09-06).
   *
   * ⚠️ Шүүлт идэвхгүй үед энэ нь БҮХ мөрөөс угсрагдана — өөрөөр хэлбэл
   * жагсаалт бүрэн хэвээр. Тусдаа «шүүлттэй юу» салаа хэрэггүй.
   */
  const active = useMemo(
    () => (cf.state === 'ready'
      ? activeSubPkgTypes(cf.data.filter((r) => inPeriod(r, period)))
      : null),
    [cf, period],
  );
  /* ⚠️ Шүүлт ИДЭВХГҮЙ бол `null` — `SaadCard`-ийн `keys` тайлбарыг үз */
  const activeKeys = useMemo(
    () => (periodActive(period) && active ? new Set(active.keys()) : null),
    [period, active],
  );

  const contracts = useAsync(loadContractSum, []);
  /* ⚠️ Багцын нэгтгэлээс гүйцэтгэл татахаа БОЛИВ (2026-09-04): `Cashflow_0904`
     дээр `Guitsetgel_huwi` бүрэн бөглөгдсөн тул мөр бүр өөрийн хувьтай.
     Нэгтгэлээр холбоход 26 багцаас 2 нь л таардаг байв. */


  /**
   * Зураг дээр бүс дарахад ТУХАЙН бүс рүү шүүнэ — дэлгэрэнгүй дашбоардтай
   * ижил зан төлөв. ⚠️ `ZONE_NONE` («мэдээлэл байхгүй») нь бүс БИШ тул
   * сонголт болгохгүй: сонговол бүх карт хоосорч, буцаах товч нь өөрөө
   * харагдахгүй болно.
   */
  const pick = useCallback((attrs: Record<string, unknown> | null) => {
    if (!attrs) return;
    const zid = String(attrs[ZONE_FIELD] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  return (
    <div className={g.shell}>
      <PeriodBar
        period={period}
        setPeriod={setPeriod}
        years={cf.state === 'ready' ? yearsOf(cf.data) : []}
      />

      {/*
        * ⚠️ ЧИРЭХ БАРИУЛ НЬ ЭНЭ ДОТОР, `shell`-д БИШ. `SplitGrip` нь
        * `top: 0; bottom: 0`-оор эцгийгээ БҮТНЭЭР дамнадаг тул бүрхүүлд
        * тавибал шүүлтийн зурвасны дээгүүр гарч, түүний товчнуудыг халхалж
        * байв. Гурван баганыг тусдаа торонд боосноор бариул зөвхөн багануудын
        * өндрийг эзэлнэ.
        */}
      <div
        ref={side.hostRef}
        className={`${g.body} ${side.hostClass}`}
        style={side.style}
      >
        <SplitGrip {...side.left} />
        <SplitGrip {...side.right} />

      <aside className={g.left}>
        <Data q={cf} minH={520}>
          {(rows) => <FinCharts rows={rows} period={period} />}
        </Data>
      </aside>

      <main className={g.center}>
        <Data q={cf} minH={72}>
          {(rows) => (
            <KpiStrip
              rows={rows}
              period={period}
              contracts={contracts.state === 'ready' ? contracts.data : null}
            />
          )}
        </Data>

        {/* ⚠️ Хураалтыг `data-*`-ААР дамжуулна: `MapTools` нь ХУВААЛЦСАН
            бүрэлдэхүүн бөгөөд хоёр хэсгээ нэг зэрэг зурдаг тул JSX-ээс
            тусад нь салгах боломжгүй. Глобал нэрсээр (§ЗУРГИЙН ДЭЭРХ
            ТОВЧНУУД) энэ харагдацад л нуугдана. */}
        <div className={g.hero} data-tools={toolsOn ? '1' : '0'} data-dims={dimsOn ? '1' : '0'}>
          <MapCanvas
            dim={dim}
            visible={visible}
            opacity={opacity}
            zone={zone}
            layerWhere={{ [PARCEL_LAYER]: parcelWhere }}
            uniform
            onPick={pick}
          />

          {/* Дээш хураах — 2D/3D/BIM зурвас (зургийн дээд төвд) */}
          <button
            type="button"
            aria-expanded={dimsOn}
            className={`${g.mapTab} ${g.dimsTab} ${dimsOn ? g.dimsTabOpen : ''}`}
            title={dimsOn ? tr('Харагдацын товч хураах') : tr('Харагдацын товч дэлгэх')}
            aria-label={dimsOn ? tr('Харагдацын товч хураах') : tr('Харагдацын товч дэлгэх')}
            onClick={() => setDimsOn((v) => !v)}
          >
            {dimsOn ? '▴' : '▾'}
          </button>

          {/* Зүүн тийш хугалах — давхарга · тунгалаг · бүс */}
          <button
            type="button"
            aria-expanded={toolsOn}
            className={`${g.mapTab} ${g.toolsTab} ${toolsOn ? g.toolsTabOpen : ''}`}
            title={toolsOn ? tr('Товчнуудыг хураах') : tr('Товчнуудыг харуулах')}
            aria-label={toolsOn ? tr('Товчнуудыг хураах') : tr('Товчнуудыг харуулах')}
            onClick={() => setToolsOn((v) => !v)}
          >
            {toolsOn ? '‹' : '›'}
          </button>

          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => setLayerOpen((v) => !v)}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          />
          {toolsOn && opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}
          {toolsOn && layerOpen && (
            <div className={g.catPanel}>
              <LayerCatalog
                view="plan"
                totals={totals}
                visible={visible}
                setVisible={setVisible}
                selected={layerSel}
                onSelect={setLayerSel}
                onClose={() => setLayerOpen(false)}
                zone={zone}
                embedded
              />
            </div>
          )}
        </div>

        <div className={g.curve}>
        {/* ⚠️ Домог нь `note` пропоор ТОЛГОЙД — `Section` түүнийг гарчгийн
            баруун захад тавьдаг. Чартын дор байхад нүд «муруй юу вэ» гэж
            асуухдаа доош гүйж, буцаж ирэх шаардлагатай болдог. */}
        <Section
          title={tr('Хөрөнгө оруулалтын гүйцэтгэл')}
          note={<TimelineKey />}
        >
          <Data q={cf} minH={190}>
            {(rows) => (
              <Timeline
                /*
                 * ⚠️ МӨРҮҮДИЙГ УРЬДЧИЛАН ШҮҮХГҮЙ — `timeline()` ӨӨРӨӨ
                 * тасалдаг бөгөөд ХУРИМТЛАЛЫГ таслахаас ӨМНӨ бодох ёстой.
                 * Урьд нь энд `inPeriod`-оор шүүж өгдөг байсан тул тухайн
                 * үеэс ӨМНӨ дууссан ажлууд хуримтлалд ОРОЛЦОХГҮЙ, муруй
                 * доогуур эхэлдэг байв: 2027-г сонгоход 96.0% байх ёстой
                 * цэг 81.6% гэж гарч байлаа (2026-09-06-ны аудит).
                 *
                 * ⚠️ Багананы дүнд энэ нөлөөлөхгүй: сонгосон үеэс гадуурх
                 * ажлын мөнгө тэр үеийн саруудад ямар ч байсан ногдохгүй.
                 */
                rows={rows}
                period={period}
                /* ⚠️ Нарийвчлал нь СОНГОСОН ШҮҮЛТИЙН ТҮВШИНТЭЙ таарна: жил →
                   жилээр, улирал → улиралаар, сар → сараар. */
                grain={grainOf(period)}
              />
            )}
          </Data>
        </Section>
        </div>
      </main>

      <aside className={g.right}>
        {/* ⚠️ Давхаргыг ЭНД асаана: `visible` нь бүрхүүлийн төлөв бөгөөд
            карт нь түүнд шууд хүрэхгүй. Зурагт гаргаад л орхихгүй, түүн рүү
            ОЙРТУУЛНА — 42 давхаргын аль нэг нь дэлгэцийн гадна байвал
            «юу ч болсонгүй» гэж уншигдана. */}
        <HseCard />
        <LandCard
          active={active}
          onShowLayers={(ids) => {
            setVisible((v) => [...new Set([...v, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
          /* ⚠️ Шалтгаан сонгоход зураг ТЭР талбарууд руу ойртоно: жагсаалт
             дээрх «63» гэдэг тоо ХААНА байгаа нь эс бөгөөс уншигдахгүй.
             Давхаргыг ЗААВАЛ асаана — унтарсан давхарга руу зум хийвэл
             «юу ч болсонгүй» гэж уншигдана. */
          onZoomParcels={(oids) => {
            if (!oids || oids.length === 0) { setParcelWhere(null); return; }
            const where = `${PARCEL_LEFT.oid} IN (${oids.join(',')})`;
            setParcelWhere(where);
            setVisible((v) => [...new Set([...v, PARCEL_LAYER])]);
            map.zoomToWhere(PARCEL_LAYER, where);
          }}
        />
        <SaadCard
          keys={activeKeys}
          onShowLayers={(ids) => {
            setVisible((v) => [...new Set([...v, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
        />
        <PlanCard totals={totals} />
      </aside>
      </div>
    </div>
  );
}

/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

/** Шүүлтийн гурван хэмжээс — `Period`-ийн талбарын нэр */
type Dim3 = 'years' | 'quarters' | 'months';

const QUARTERS = [1, 2, 3, 4];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * ХУГАЦААНЫ ШҮҮЛТ — ArcGIS-ийн атрибут хүснэгтийн шүүлттэй ИЖИЛ хэлбэр
 * (2026-09-04, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ Урьд нь 22 чип (6 жил + 4 улирал + 12 сар) нэг эгнээнд задгай байсан:
 * зурвас хоёр мөр болж, доорх картуудаас илүү зай эзэлж, «одоо юу сонгогдсон
 * байна» гэдэг нь 22 товчны дундаас олдохгүй байв. Одоо ГУРВАН унждаг товч —
 * сонгосон утга нь товчин дээрээ бичигдэнэ.
 *
 * ⚠️ Цэс нь `position: fixed`, байрлалыг товчны хэмжээнээс авна: зурвас нь
 * `overflow`-той эцгийн дотор байх тул `absolute` цэс тасарна.
 */
function PeriodBar({
  period, setPeriod, years,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  years: number[];
}) {
  const [open, setOpen] = useState<{ k: Dim3; x: number; y: number } | null>(null);
  const [shown, setShown] = useState(true);

  /**
   * ⚠️ ОЛОН СОНГОЛТ (2026-09-04, хэрэглэгчийн хүсэлт). Хэмжээс тус бүр нь
   * ОЛОНЛОГ; хоосон = бүгд. Гурав нь хоорондоо БАЙ (AND) — «2026 · 1,2-р
   * улирал» гэвэл тэр хоёр улирлын аль нэгэнд нь хамаарах 2026 оны ажил.
   *
   * ⚠️ Улирал ба сарыг ХАРИЛЦАН УНТРААХАА БОЛИВ. Нэг сонголттой үед «2-р
   * улирал ба 11-р сар» нь ҮРГЭЛЖ хоосон байсан тул автоматаар цэвэрлэдэг
   * байв; олонлогтой үед «2-р улирал ба 4,5-р сар» гэх мэт УТГАТАЙ хослол
   * үүсдэг тул автоматаар устгах нь хэрэглэгчийн сонголтыг булаана.
   */
  const toggle = (k: Dim3, v: number) => {
    const cur = period[k];
    setPeriod({
      ...period,
      [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((x, y) => x - y),
    });
  };

  const CFG: Record<Dim3, { label: string; opts: number[]; text: (v: number) => string }> = {
    years: { label: tr('Жил'), opts: years, text: (v) => String(v) },
    quarters: { label: tr('Улирал'), opts: QUARTERS, text: (v) => tr('{0}-р улирал', String(v)) },
    months: { label: tr('Сар'), opts: MONTHS, text: (v) => tr('{0}-р сар', String(v)) },
  };

  /** Сегмент дээрх утга — олон сонгосон бол «2024 +2» гэж хураана */
  const valueOf = (k: Dim3) => {
    const sel = period[k];
    if (sel.length === 0) return '';
    if (sel.length === 1) return CFG[k].text(sel[0]);
    return tr('{0} +{1}', CFG[k].text(sel[0]), String(sel.length - 1));
  };

  const drop = (k: Dim3) => {
    const on = period[k].length > 0;
    return (
      <button
        key={k}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open?.k === k}
        className={`${g.fDrop} ${on ? g.fDropOn : ''}`}
        onClick={(ev) => {
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          setOpen((o) => (o?.k === k ? null : { k, x: r.left, y: r.bottom }));
        }}
      >
        <span className={g.fDropLbl}>{CFG[k].label}</span>
        <span className={g.fDropVal}>{valueOf(k)}</span>
      </button>
    );
  };

  const menu = () => {
    if (!open) return null;
    const c = CFG[open.k];
    const sel = period[open.k];
    return (
      <>
        <div className={g.fVeil} onClick={() => setOpen(null)} />
        <ul
          className={g.fMenu}
          role="listbox"
          aria-multiselectable
          style={{ left: Math.min(open.x, Math.max(8, window.innerWidth - 200)), top: open.y }}
        >
          {/* ⚠️ «Бүгд» нь ЦЭВЭРЛЭХ үйлдэл: тухайн хэмжээсийн олонлогийг
              хоослоно. Чагт БИШ тул дугуй тэмдэггүй. */}
          <li>
            <button
              type="button"
              className={`${g.fOpt} ${sel.length === 0 ? g.fOptOn : ''}`}
              onClick={() => setPeriod({ ...period, [open.k]: [] })}
            >
              {tr('Бүгд')}
            </button>
          </li>
          {c.opts.map((v) => (
            <li key={v}>
              {/* ⚠️ Цэс сонголт бүрд ХААГДАХГҮЙ — олон зүйл сонгох гол зорилго */}
              <button
                type="button"
                role="option"
                aria-selected={sel.includes(v)}
                className={`${g.fOpt} ${sel.includes(v) ? g.fOptOn : ''}`}
                onClick={() => toggle(open.k, v)}
              >
                <i className={g.fTick} aria-hidden>{sel.includes(v) ? '✓' : ''}</i>
                {c.text(v)}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  };

  /** Хураасан үеийн товч дээрх утга */
  const summary = (['years', 'quarters', 'months'] as Dim3[])
    .map((k) => valueOf(k))
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`${g.filters} ${shown ? '' : g.fThin}`}>
      {shown && menu()}
      {shown && (
        <div className={g.fBar}>
          {drop('years')}
          {drop('quarters')}
          {drop('months')}
          {/*
            * ⚠️ ЦУЦЛАХ нь ЗУРВАСЫН ДОТОР, сүүлийн сегмент — хайлтын талбарын
            * ✕-тэй ижил зарчим: цэвэрлэх үйлдэл цэвэрлэх зүйлтэйгээ нэг
            * хүрээнд. Гадна нь тусад нь зогсоход «Шүүх» товчны хэсэг мэт
            * уншигдаж байв.
            */}
          {periodActive(period) && (
            <button
              type="button"
              className={g.fClear}
              title={tr('Шүүлт цуцлах')}
              aria-label={tr('Шүүлт цуцлах')}
              onClick={() => setPeriod(NO_PERIOD)}
            >
              ✕
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        aria-expanded={shown}
        aria-label={shown ? tr('Шүүлт хураах') : tr('Шүүлт дэлгэх')}
        className={`${g.fToggle} ${shown ? '' : g.fToggleThin} ${!shown && periodActive(period) ? g.fToggleOn : ''}`}
        /* ⚠️ Хураасан үед идэвхтэй шүүлт `title`-д үлдэнэ — «яагаад тоо бага
           байна вэ» гэсэн асуултад хариулах зам хаагдах ёсгүй. */
        title={shown ? tr('Шүүлт хураах')
          : summary ? tr('Шүүлт: {0}', summary) : tr('Шүүлт дэлгэх')}
        onClick={() => setShown((v) => !v)}
      >
        <span className={g.fToggleLbl}>{tr('Шүүх')}</span>
        <span aria-hidden>{shown ? '▴' : '▾'}</span>
      </button>
    </div>
  );
}

/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

function KpiStrip({
  rows, period, contracts,
}: {
  rows: CfRow[];
  period: Period;
  contracts: Map<number, number> | null;
}) {
  const land = useAsync(loadLandStatus, []);

  const k = useMemo(() => {
    const sel = rows.filter((r) => inPeriod(r, period));
    const csum = contracts ? sel.reduce((s, r) => s + (contracts.get(r.oid) ?? 0), 0) : 0;
    return kpisOf(sel, csum);
  }, [rows, period, contracts]);

  const landPct = land.state === 'ready' ? land.data.pct : null;

  return (
    <div className={g.kpis}>
      {/* ⚠️ ЗУРГААУЛАА НЭГ ЭГНЭЭНД — `cols` нь дээд тал нь 4 тул баганын тоог
          `.kpis`-ийн CSS-ээс дарж бичнэ (`statsGrid` глобал нэрийн зориулалт
          яг энэ). Хоёр эгнээ болбол зурагнаас ~60px хулгайлна. */}
      <Stats cols={3}>
        {/* ⚠️ Индикаторт ТОВЧИЛСОН дүн: бүтэн 15 оронтой тоо нь нүдээ дүүргэж,
            зэргэлдээх шошготойгоо зөрдөг. Бүтэн дүн нь «Санхүүжилт» табын
            хүснэгтэд ба чартын hover цонхонд ХЭВЭЭР байгаа. */}
        {/* ⚠️ `accent` ХАСАГДСАН (2026-09-04): зургаагийн ганц нь өнгөт
            дэвсгэр, өнгөт тоотой байхад тэр нь «СОНГОГДСОН» гэж уншигдаж
            байв — үнэндээ энэ зурвас дарагддаггүй, сонголтгүй. Ялгаа
            хэрэгтэй бол дараалал нь өөрөө хангалттай: нийт төсөв эхэнд. */}
        <Stat icon="calc" value={mntShort(k.budget)} label={tr('Нийт төсөв')} />
        <Stat icon="file" value={contracts ? mntShort(k.contract) : '…'} label={tr('Нийт гэрээний дүн')} />
        {/* ⚠️ ХУВЬ + МӨНГӨ хамт: «19.1%» гэдэг нь ямар хэмжээний ажил болохыг
            дангаараа хэлдэггүй. Мөнгө нь `Σ өртөг × хувь` — захирамжаар
            олгосон дүн БИШ (`Kpi.progressAmount`-ийн тайлбарыг үз). */}
        <Stat
          icon="chart"
          value={k.progress == null ? '—' : `${pct(k.progress)} · ${mntShort(k.progressAmount)}`}
          label={tr('Гүйцэтгэлийн хувь')}
        />
        <Stat icon="layers" value={num(k.packages)} label={tr('Багц ажлын тоо')} />
        <Stat icon="grid" value={num(k.types)} label={tr('Нийт төрлийн тоо')} />
        <Stat icon="polygon" value={landPct == null ? '…' : pct(landPct)} label={tr('Газар чөлөөлөлт')} />
      </Stats>
    </div>
  );
}

/* ══════════════════════ ЗҮҮН — САНХҮҮГИЙН 4 ЧАРТ ══════════════════════ */

/**
 * ЧАРТЫН МӨР → `ui.tsx`-ийн `Bars`-ын мөр.
 *
 * ⚠️ 2026-09-04: энд ӨӨРИЙН гэсэн багана зурдаг `SubBars` байсныг ХАСАВ.
 * Тэр нь дэд цувааг багана дотор давхарлаж харуулдаг байсан ч порталын бусад
 * 18 харагдац бүгд `Bars`-ыг хэрэглэдэг тул ЗӨВХӨН энэ дэлгэц өөр хэлээр
 * ярьж байлаа (өөр өндөр, өөр фонт, өөр hover). Хэрэглэгчийн шаардлага:
 * «бусад button-ы чартуудтай ижил бол».
 *
 * ⚠️ ДЭД ЦУВАА АЛДАГДААГҮЙ, ЗҮГЭЭР Л ТЕКСТ БОЛСОН: `Bars` нь нэг мөрд нэг
 * утга зурдаг тул дэд утгыг `display`-д хувиар бичнэ («1.9 их наяд · 24%»).
 * Давхарласан зурвасаас илүү нарийн уншигдана — нүдээр хоёр уртыг жишихээс
 * тоо шууд харах нь баталгаатай.
 */
/**
 * ЧАРТЫН МӨР → `ui.tsx`-ийн `Bars`.
 *
 * ═══ НЭГ ДҮРЭМ, ЗУРГААН ЧАРТАД (2026-09-04, хэрэглэгчийн шийдвэр) ═══
 *
 *   МӨРӨН ДЭЭР — гүйлгэж уншихад хэрэгтэй ХАМГИЙН БАГА зүйл.
 *   HOVER ДЭЭР — тухайн мөрийг судлахад хэрэгтэй БҮТЭН задаргаа, цэгтэй
 *                мөрүүдээр.
 *
 * ⚠️ Урьд нь мөрөн дээр гурван тоо зэрэг байсан («76.4% · 1.92 их наяд ₮ ·
 * гүйцэтгэл 24%») тул ангиллын нэр шахагдаж хоёр мөр болж, жагсаалт
 * замбараагүй харагддаг байв. «нийтэд», «гүйцэтгэл» гэсэн үгс нь мөр бүрд
 * давтагдаж чимээ нэмдэг — тэдгээр нь hover дээр БҮТЭН ӨГҮҮЛБЭР болж
 * тодорхой болно.
 */

/**
 * ЧАРТЫН ДОТОРХ ШОШГЫГ ЭНГИЙН ҮСЭГТ буулгана (2026-09-04, хэрэглэгчийн
 * хүсэлт: «чарт дотор байгаа uppercase болиул, чартын нэр uppercase»).
 *
 * ⚠️ ТОМ ҮСЭГ НЬ ЗАГВАР БИШ, ӨГӨГДӨЛ. `Turul` талбарын утга үйлчилгээнд
 * «ОРОН СУУЦНЫ ХОРООЛЛЫН БАРИЛГАЖИЛТ» гэж БИЧИГДСЭН тул CSS-ийн
 * `text-transform` унтраагаад ч өөрчлөгдөхгүй — эндээс хөрвүүлнэ.
 *
 * ⚠️ ТОВЧЛОЛ ХЭВЭЭР: «ТЭЗҮ» → «Тэзү» болговол уншигдахаа болино. Доорх
 * олонлогт байгаа үг л том үсгээрээ үлдэнэ. Шинэ товчлол гарвал ЭНД нэм —
 * ерөнхий дүрмээр (урт, эгшиг) таах нь «ОРОН», «БУСАД» зэрэг ердийн үгийг
 * товчлол гэж андуурна.
 *
 * ⚠️ Зөвхөн БҮХЭЛДЭЭ том үсэгтэй мөрд үйлчилнэ — «Гэрээлсэн дүн» гэх мэт
 * аль хэдийн зөв бичигдсэн утгыг хөндөхгүй.
 */
const KEEP_UPPER = new Set(['ТЭЗҮ', 'ХАБ', 'ХАБЭА', 'НЗД', 'БОНУ', 'ХХК', 'IoT', 'QAQC', 'BIM']);

const nice = (v: string): string => {
  if (v !== v.toUpperCase()) return v;
  const out = v
    .split(' ')
    .map((w) => (KEEP_UPPER.has(w.replace(/[^A-Za-zЀ-ӿ]/g, '')) ? w : w.toLowerCase()))
    .join(' ');
  /* Эхний ҮСГИЙГ том болгоно (эхний үг товчлол бол аль хэдийн том) */
  const i = out.search(/[A-Za-zЀ-ӿ]/);
  return i < 0 ? out : out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
};

/**
 * Мөнгө — мөрөн дээр ТОЙМЛОСОН («29.0 тэрбум ₮»), бүтэн нь hover-т.
 *
 * ⚠️ `format.mnt`-ИЙГ ӨӨРЧИЛЖ БОЛОХГҮЙ. Тэр нь САНААТАЙ бүтэн бичдэг
 * («2,512,585,832,535 ₮») бөгөөд тэр файлд «товчлолыг бүү сэргээ» гэсэн
 * тэмдэглэл бий — портал даяар 7 газар бүтэн дүн шаарддаг. Тиймээс энэ
 * товчлол нь ЗӨВХӨН энэ дашбоардын чарт ба индикаторт үйлчилнэ.
 */
/**
 * ⚠️ ЭРЭМБЭ НЬ БАГАНЫ УРТААР, ИХЭЭС БАГА РУУ (2026-09-04, хэрэглэгчийн
 * хүсэлт).
 *
 * ⚠️ ТҮҮХИЙ УТГААР БИШ. Дэд цуваатай чартад багана нь мөрийн доторх
 * биелэлтийн ХУВИЙГ зурдаг (§БАГАНЫН УРТ) тул түүхий тоогоор эрэмбэлбэл
 * баганууд эмх замбараагүй харагдана: «51 ажил / 53%» нь «2 ажил / 100%»-аас
 * дээр зогсоод богино зурвастай байна. Нүд эрэмбийг ЗУРВАСААР уншдаг.
 *
 * ⚠️ ҮР ДАГАВАР: мөрийн баруун талын ТОО дараалалгүй харагдана (2 нь 51-ээс
 * дээр гарч болно). Санаатай — нэг жагсаалт хоёр эрэмбийг зэрэг илэрхийлэх
 * аргагүй.
 */
const byBar = <T extends { value: number }>(a: T[]): T[] =>
  a.slice().sort((x, y) => y.value - x.value);

const mntShort = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  /* ⚠️ НЭГЖ БҮТЭН ҮГЭЭР («их наяд», «тэрбум») — 2026-09-04-нд «их н.» гэж
     товчилж үзээд хэрэглэгч буцаав. Товчлогдох нь ЗӨВХӨН ТОО: 15 оронтой
     дүн нүдэнд багтдаггүй, харин нэгжийн үг нь уншигдах ёстой. */
  if (a >= 1e12) return tr('{0} их наяд ₮', num(v / 1e12, 2));
  if (a >= 1e9) return tr('{0} тэрбум ₮', num(v / 1e9, 1));
  if (a >= 1e6) return tr('{0} сая ₮', num(v / 1e6, 1));
  return mnt(v);
};

/** МӨНГӨН чарт — мөрөнд «хувь · тоймлосон дүн», hover-т бүтэн задаргаа */
const moneyBars = (
  items: SubBar[],
  subLabel?: { has: string; none: string },
  /**
   * ЭЗЛЭХ ХУВИЙН СУУРИЙН НЭР.
   *
   * ⚠️ Анхдагч нь «Нийт төсөв» — учир нь чартын мөрүүдийн нийлбэр нь яг
   * `Урьдчилсан төсөвт өртөг`-ийн нийлбэртэй тэнцдэг (төрөл, тайлбараар
   * бүлэглэсэн чартууд).
   *
   * ⚠️ ЭХ ҮҮСВЭРИЙН чартад ЭНЭ ҮНЭН БИШ: захирамжийн эх үүсвэрүүдийн нийлбэр
   * 2.46 их наяд бөгөөд нийт төсвөөс 55.4 тэрбумаар БАГА (захирамж бүх ажилд
   * бүрэн бүртгэгдээгүй). Тэнд «Нийт төсвийн 60.5%» гэж бичих нь худал —
   * жинхэнэ суурь нь эх үүсвэрүүдийн нийлбэр (2026-09-06-ны аудит).
   */
  base: string = tr('Нийт төсвийн'),
) => {
  /*
   * ⚠️ ДҮНГҮЙ АНГИЛАЛ МӨНГӨН ЧАРТАД ГАРАХГҮЙ (2026-09-04, хэрэглэгчийн
   * шийдвэр). «Урьдчилсан төсөвт өртөг» нь хоосон мөрүүд «0.0% · —» гэсэн
   * хоосон зурвас болж хоёр мөр эзэлдэг байв — мөнгөний чартад тэдгээр нь
   * мэдээлэл ОГТ өгөхгүй.
   *
   * ⚠️ НУУСАН НЬ ЗАСАГДАХГҮЙ ГЭСЭН ҮГ БИШ: шүүлт нь өгөгдлөөс ХАМААРНА, тул
   * үйлчилгээнд дүн бөглөмөгц тэр ангилал ДАРААГИЙН ачаалалтад аяндаа
   * харагдана. Хатуу жагсаалтаар хассан бол чимээгүй мартагдана.
   *
   * ⚠️ ТООН чартад энэ шүүлт ХАМААРАХГҮЙ: тэнд 0 гэдэг «нэг ч ажил байхгүй»
   * гэсэн утга агуулж болох тул үзүүлэх нь зөв.
   */
  const shown = items.filter((i) => i.value > 0);
  const total = shown.reduce((x, y) => x + y.value, 0);
  return byBar(shown.map((i) => {
    const share = total > 0 ? pct((i.value / total) * 100, 1) : null;
    /* ⚠️ БҮТЭН ӨГҮҮЛБЭР: «Нийт дүнгийн 1.2%» гэсэн тасархай хэллэг нь юуны
       1.2% болохыг хэлдэггүй. Суурийг ЗААВАЛ нэрлэнэ — `base`-ийн тайлбарыг
       үз (чарт бүрийн суурь ижил БИШ). */
    const hint = [tr('{0} {1}-ийг эзэлж байна', base, share ?? '—')];
    /*
     * ⚠️ ТЭГ ДЭД УТГЫГ Ч ХАРУУЛНА (`> 0` БИШ). 2026-09-04-нд «Гадна тохижилт
     * 14 / 0 гэрээтэй» мөр нь дэд утгагүй гэж тооцогдож БҮТЭН өтгөн будагдаж,
     * «14/14 гэрээлсэн» мэт харагдаж байв — яг ЭСРЭГ утга. Тэр мөрд hover-т
     * тайлбар ч гардаггүй тул зөрчлөө шалгах ч аргагүй байлаа.
     * «Хэмжигдсэн бөгөөд тэг» ба «хэмжигдээгүй» хоёр ялгаатай: чартад дэд
     * цуваа зарлагдсан бол мөр БҮРД хамаарна.
     */
    /*
     * ⚠️ ТЭГ БОЛ БҮТЭН ӨГҮҮЛБЭР («Гүйцэтгэл огт бүртгэгдээгүй»), «…: 0 (0%)»
     * БИШ. Хоёр шалтгаан: (а) тэг нь тоо биш МЭДЭГДЭЛ — уншигч түүнийг
     * форматын үлдэгдэл гэж алгасах эрсдэлтэй; (б) 2026-09-04-нд «14 / 0»
     * мөр нь бүтэн будагдаж «14/14» мэт харагдсан тул тэг тохиолдол
     * ХАМГИЙН тодорхой бичигдэх шаардлагатай.
     */
    if (subLabel) {
      hint.push(i.sub > 0
        ? `${subLabel.has}: ${mntShort(i.sub)} (${i.value > 0 ? pct((i.sub / i.value) * 100, 0) : '—'})`
        : subLabel.none);
    }
    /*
     * ОЛГОСОН ДҮН — захирамжаар (2026-09-06, хэрэглэгчийн хүсэлт).
     *
     * ⚠️ Хувийн СУУРЬ нь ЭНЭ МӨРИЙН төсөв, нийт төсөв БИШ: «87 тэрбумаас
     * хэдийг олгосон» гэсэн асуулт нь мөрийн дотоод харьцаа. Дээрх мөр
     * («Нийт төсвийн …») нь гадаад харьцааг аль хэдийн хэлсэн — хоёуланг нь
     * нэг суурьтай бичвэл нэг нь илүүц болно.
     */
    /*
     * АЖЛЫН ТОО — нэгтгэсэн чартын хоёр дахь хэмжигдэхүүн (2026-09-06).
     *
     * ⚠️ Багана нь МӨНГӨӨР хэмжигдсэн хэвээр: эдгээр мөр нь тоог зөвхөн
     * ХЭЛНЭ, зурвасын уртад ОГТ нөлөөлөхгүй.
     */
    if (i.count != null) {
      hint.push(tr('{0} ажил', num(i.count)));
      if (i.countSub != null) {
        hint.push(i.countSub > 0
          ? `${tr('Гэрээ хийсэн')}: ${num(i.countSub)} (${i.count > 0 ? pct((i.countSub / i.count) * 100, 0) : '—'})`
          : tr('Нэг ч гэрээ хийгдээгүй'));
      }
    }
    if (i.alloc != null) {
      /* ⚠️ ОЛГОЛТ нь дээрх мөрүүдээс ӨӨР ЭХ СУРВАЛЖТАЙ (захирамж, гүйцэтгэл
         биш) тул зураасаар тусгаарлана — эс бөгөөс нэг бүлэг мэт уншигдана. */
      hint.push(TIP_RULE);
      hint.push(i.alloc > 0
        ? tr('Олгосон: {0} ({1})',
            mntShort(i.alloc),
            i.value > 0 ? pct((i.alloc / i.value) * 100, 1) : '—')
        : tr('Захирамжаар олголт бүртгэгдээгүй'));
    }
    return {
      key: i.key,
      label: nice(i.label),
      /*
       * ⚠️ БАГАНЫН УРТ = МӨРИЙН ДОТОРХ БИЕЛЭЛТИЙН ХУВЬ (дэд цуваатай үед).
       * «8 ажлаас 7 гэрээтэй» бол 87.5% дүүрнэ. Дуудагч тал `max={100}`
       * дамжуулна — эс бөгөөс тэнхлэг нь хамгийн их ХУВИАР хэмжигдэж,
       * 100%-тай мөр байхгүй үед бүх багана хиймлээр сунана.
       *
       * ⚠️ Дэд цуваагүй чартад урт нь УТГЫН ХЭМЖЭЭ хэвээр.
       */
      value: subLabel ? (i.value > 0 ? (i.sub / i.value) * 100 : 0) : i.value,
      /* Мөр: хувь эхэнд (харьцаа), тоймлосон дүн ард */
      display: share ? `${share} · ${mntShort(i.value)}` : mntShort(i.value),
      /* Hover: БҮТЭН төгрөг — `format.mnt` нь портал даяар бүтэн бичдэг */
      tipValue: mnt(i.value),
      hint,
    };
  }));
};

/**
 * ТООН чарт — мөрөнд зөвхөн тоо, hover-т нэгж, эзлэх хувь, дэд задаргаа.
 *
 * ⚠️ НЭГЖ ЗААВАЛ. Hover дээр ганцаар зогсох «22» гэсэн тоо нь юуны 22 болох
 * нь тайлбаргүй байв (2026-09-04, хэрэглэгчийн ажиглалт): цонхны толгойд
 * зөвхөн ангиллын нэр байдаг тул чартын гарчгийг харахгүйгээр уншигдахгүй.
 *
 * ⚠️ ХОЁР ХЭЛБЭР хэрэгтэй: `one` нь нэрлэхийн («22 ажил»), `many` нь
 * харьяалахын («Нийт ажлын 28.9%») — монгол хэлэнд нэг үгээр хоёуланг нь
 * зөв бичих боломжгүй.
 */
const countBars = (
  items: SubBar[],
  unit: { one: string; many: string },
  subLabel?: { has: string; none: string },
) => {
  const total = items.reduce((x, y) => x + y.value, 0);
  return byBar(items.map((i) => {
    const hint = [tr(
      'Нийт {0} {1}-ийг эзэлж байна', unit.many, total > 0 ? pct((i.value / total) * 100, 1) : '—',
    )];
    /* ⚠️ Тэг бол бүтэн өгүүлбэр — `moneyBars`-ийн тайлбарыг үз */
    if (subLabel) {
      hint.push(i.sub > 0
        ? `${subLabel.has}: ${num(i.sub)} (${i.value > 0 ? pct((i.sub / i.value) * 100, 0) : '—'})`
        : subLabel.none);
    }
    return {
      key: i.key,
      label: nice(i.label),
      /*
       * ⚠️ БАГАНЫН УРТ = МӨРИЙН ДОТОРХ БИЕЛЭЛТИЙН ХУВЬ (дэд цуваатай үед).
       * «8 ажлаас 7 гэрээтэй» бол 87.5% дүүрнэ. Дуудагч тал `max={100}`
       * дамжуулна — эс бөгөөс тэнхлэг нь хамгийн их ХУВИАР хэмжигдэж,
       * 100%-тай мөр байхгүй үед бүх багана хиймлээр сунана.
       *
       * ⚠️ Дэд цуваагүй чартад урт нь УТГЫН ХЭМЖЭЭ хэвээр.
       */
      value: subLabel ? (i.value > 0 ? (i.sub / i.value) * 100 : 0) : i.value,
      display: num(i.value),
      tipValue: `${num(i.value)} ${unit.one}`,
      hint,
    };
  }));
};

/**
 * БҮХ ЧАРТ НЭГ ӨНГӨТЭЙ.
 *
 * ⚠️ Мөр бүр өөр өнгөтэй байх нь «ангилал бүр өөр зүйл» гэсэн утга дамжуулдаг
 * ч энд мөрүүд нь НЭГ хэмжигдэхүүний харьцуулалт тул өнгө мэдээлэл өгөхгүй,
 * зөвхөн шуугиан нэмнэ. Урт нь өөрөө харьцааг хэлнэ.
 */
const BAR_HUE = cat(0);

function FinCharts({
  rows, period,
}: {
  rows: CfRow[];
  period: Period;
}) {
  const sel = useMemo(() => rows.filter((r) => inPeriod(r, period)), [rows, period]);

  const c1 = useMemo(() => chartTypeCost(sel), [sel]);
  const c2 = useMemo(() => chartTypeCount(sel), [sel]);
  const c3 = useMemo(() => chartSourceMerged(sel), [sel]);
  const c4 = useMemo(() => chartNoteAmount(sel), [sel]);

  return (
    <>
      <Section title={tr('Урьдчилсан төсөвт өртөг')}>
        {/* ⚠️ `max={100}` — дэд цуваатай тул тэнхлэг нь 0–100% (§БАГАНЫН УРТ) */}
        <Bars
          color={BAR_HUE}
          max={100}
          items={moneyBars(c1, { has: tr('Гүйцэтгэсэн дүн'), none: tr('Гүйцэтгэл огт бүртгэгдээгүй') })}
          limit={8}
        />
      </Section>

      <Section title={tr('Төрөл')}>
        <Bars
          color={BAR_HUE}
          max={100}
          items={countBars(c2, { one: tr('ажил'), many: tr('ажлын') },
            { has: tr('Гэрээ хийсэн'), none: tr('Нэг ч гэрээ хийгдээгүй') })}
          limit={8}
        />
      </Section>

      {/* ⚠️ НЭГ ЧАРТ (2026-09-06, хэрэглэгчийн хүсэлт): багана нь МӨНГӨ,
          ажлын тоо нь hover-т. Хоёр чартын МЭДЭЭЛЭЛ БҮРЭН нийлсэн — юу ч
          хасагдаагүй. Урьд нь дараалал нь зөрдөг тул (мөнгөөр Үнэт цаас
          тэргүүлж, тоогоор Нийслэлийн төсөв) нэг ангилал хоёр өөр байрлалд
          харагддаг байв. */}
      <Section title={tr('Захирамжийн эх үүсвэр')}>
        {/* ⚠️ СУУРЬ нь «нийт төсөв» БИШ — `moneyBars`-ийн `base`-ийн тайлбарыг үз */}
        <Bars
          color={BAR_HUE}
          items={moneyBars(c3, undefined, tr('Захирамжийн нийт дүнгийн'))}
          limit={8}
        />
      </Section>

      <Section title={tr('Хөрөнгө оруулалтын төрөл')}>
        <Bars color={BAR_HUE} items={moneyBars(c4)} limit={8} />
      </Section>
    </>
  );
}

/* ══════════════════════ S-МУРУЙ + ОЛГОСОН ДҮН ══════════════════════ */

/**
 * НЭГ ТЭНХЛЭГ, ХОЁР ХЭМЖИГДЭХҮҮН — багана нь МӨНГӨ, муруй нь ХУВЬ.
 *
 * ⚠️ ХОЁР ЧАРТЫГ НЭГТГЭВ (2026-09-04, хэрэглэгчийн хүсэлт). Тусад нь байхад
 * «2026-д олголт оргилдоо хүрч, ЯГ ТЭР ҮЕД муруй эгц өгссөн» гэсэн ХОЛБОО
 * нүднээс далд үлддэг байв — хоёр өөр хэвтээ тэнхлэгийг нүд өөрөө
 * зэрэгцүүлж чаддаггүй.
 *
 * ⚠️ ӨӨРСДӨӨ ЗУРСАН шалтгаан: `ui.tsx`-д багана (`Series`) ба муруй (`Trend`)
 * тус тусдаа бий ч ХОСЛУУЛСАН хувилбар байхгүй. Хамтын санд нэмбэл 20 гаруй
 * дуудагчийн API тэлнэ — энэ хэлбэр одоохондоо ганц дуудагчтай.
 *
 * ⚠️ ХОЁР ТЭНХЛЭГ, НЭГ ХУВААРЬТ ШАХАХГҮЙ: багана нь 0…max(мөнгө), муруй нь
 * 0…100%. Нэг хуваарьт оруулбал 2.5 их наяд ба 100 хоёрын харьцаанаас болж
 * муруй ёроолд наалдана.
 */
function Timeline({ rows, grain, period }: { rows: CfRow[]; grain: Grain; period: Period }) {
  const pts = useMemo(() => timeline(rows, grain, period), [rows, grain, period]);
  /**
   * ЗААСАН үе — hover, эсвэл заагаагүй үед СҮҮЛИЙНХ.
   *
   * ⚠️ ШОШГЫГ ХАДГАЛНА, гэхдээ ХОЁР ТУСДАА ДАВХАРТ ба ШИГШСЭН байдлаар:
   *   · хувь → цэгийн ДЭЭР (муруйн давхар),
   *   · мөнгөн дүн → тэнхлэгийн шошгын ДООР (мөнгөний давхар).
   * Урьд нь хоёулаа зурвасын дотор нэг өндөрт өрсөлдөж, 2024–2025-ын
   * шошгууд давхарлаж, чарт уншигдахгүй болсон байв. Уншилтын мөр нь
   * ШИГШИГДЭЖ гараагүй үеийн тоог hover-оор гүйцээнэ.
   */
  const [hov, setHov] = useState<number | null>(null);
  if (!pts.length) return <Empty label={tr('Төлөвлөгөөт хугацаатай ажил олдсонгүй')} />;

  const maxAmt = Math.max(1, ...pts.map((p) => p.amount));
  const n = pts.length;
  const at = hov != null && hov < n ? hov : n - 1;
  const cur = pts[at];
  /* ⚠️ ШОШГЫГ ШИГШИНЭ: 36 сар бүгдийг бичвэл давхарлана. Эхний, сүүлийн
     ба заасан үе ҮРГЭЛЖ гарна — тэднийг алдвал муруйн эхлэл/төгсгөл
     уншигдахгүй. */
  const step = Math.max(1, Math.ceil(n / 9));
  const shown = (i: number) => i === at || i === 0 || i === n - 1 || i % step === 0;
  /**
   * НАЛУУ ТЭНХЛЭГ — 12-оос олон үе сонгогдоход.
   *
   * ⚠️ Хэвтээ шошго нь баганын өргөнөөс («2026-06» ≈ 44px) урт болмогц
   * хөршүүдтэйгээ ХОЛИЛДДОГ. Налуулбал шошго бүр өөрийн диагональ зурваст
   * суух тул БҮГДИЙГ нь бичиж болно — шигшилт хэрэггүй.
   *
   * ⚠️ Налуу үед мөнгөн дүнг тэнхлэгээс ХАСНА: хоёр налуу мөр бие биенийхээ
   * дундуур гарна. Тэр тоо уншилтын мөрөнд hover-оор гарсаар байна.
   */
  const tilt = n > 12;

  /* ⚠️ Цэгийн х-байрлал нь баганын ТӨВД — эс бөгөөс муруй баганаас хазайна */
  const path = monotonePath(pts.map((p, i) => ({
    x: ((i + 0.5) / n) * 100,
    y: 100 - Math.max(0, Math.min(100, p.pct)),
  })));

  return (
    <div className={g.tl}>
      {/* Уншилтын мөр — заасан (эсвэл сүүлийн) үеийн хоёр тоо НЭГ газар */}
      <div className={g.tlHead}>
        <span className={g.tlHeadLbl}>{cur.label}</span>
        <b className={g.tlHeadPct}>{pct(cur.pct)}</b>
        <span className={g.tlHeadAmt}>
          {cur.amount > 0 ? mntShort(cur.amount) : tr('олголтгүй')}
        </span>
      </div>

      <div className={g.tlPlot}>
        <div className={g.tlBars}>
          {pts.map((p, i) => (
            <div
              key={p.key}
              className={`${g.tlCol} ${i === at ? g.tlColOn : ''}`}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov((v) => (v === i ? null : v))}
            >
              <i className={g.tlBar} style={{ height: `${(p.amount / maxAmt) * 100}%` }} />
            </div>
          ))}
        </div>

        <svg className={g.tlSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path className={g.tlLine} d={path} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>

{/*
          * Цэг — шигшигдсэн үед хувийн шошготой. Заасан цэг томорно.
          *
          * ⚠️ ТУСДАА БҮРХҮҮЛД: `bottom: %` нь ХАМГИЙН ОЙРЫН байрлуулсан
          * өвгөөс тоологддог. Урьд нь тэр нь `.tlPlot` байсан бөгөөд түүний
          * өндөрт 20px padding НЭМЭГДДЭГ тул цэг бүр муруйнаасаа яг тэр
          * 20px-ээр ДЭЭГҮҮР зурагдаж, шошго нь бүр 29px тасардаг байв
          * (хэрэглэгчийн шүүмж, 2026-09-06). Энэ бүрхүүл нь SVG-тэй ЯГ ижил
          * `inset`-тэй — хоёр давхар нэг хуваарьтай болов.
          */}
        <div className={g.tlDots}>
          {pts.map((p, i) => (
            <span
              key={p.key}
              className={`${g.tlDot} ${i === at ? g.tlDotOn : ''}`}
              style={{
                left: `${((i + 0.5) / n) * 100}%`,
                bottom: `${Math.max(0, Math.min(100, p.pct))}%`,
              }}
            >
              {shown(i) && <b>{pct(p.pct)}</b>}
            </span>
          ))}
        </div>
      </div>

      {/* ⚠️ Мөнгөн дүн ЗУРВАС ДОТОР биш ЭНД — муруйн хувийн шошготой нэг
          өндөрт таарч давхарлахаас сэргийлнэ. */}
      <div className={`${g.tlAxis} ${tilt ? g.tlAxisTilt : ''}`}>
        {pts.map((p, i) => (
          <span key={p.key} className={i === at ? g.tlAxisOn : undefined}>
            <b>{tilt || shown(i) ? p.label : ''}</b>
            {!tilt && <i>{shown(i) && p.amount > 0 ? mntShort(p.amount) : ''}</i>}
          </span>
        ))}
      </div>

    </div>
  );
}

/**
 * ДОМОГ — картын ТОЛГОЙД.
 *
 * ⚠️ ШОШГО нь талбарын НЭРЭЭР (2026-09-06, хэрэглэгчийн заавар):
 * «Захирамжийн дүн хөрөнгө оруулалтын эх үүсвэр нийт хөрөнгөд эзлэх» —
 * товчилбол «Нийт хөрөнгөд эзлэх хувь». Муруй нь ГҮЙЦЭТГЭЛ БИШ — тэр нь
 * `Zah_eh_unet_tsaas_huwi` (ажил бүрийн нийт төсөвт эзлэх хувь)-ийг ажлын
 * саруудад тарааж хуримтлуулсан ТӨЛӨВЛӨГӨӨ. Бодит гүйцэтгэл
 * (`Guitsetgel_huwi`) энэ чартад ОРООГҮЙ. Хуучин «Хуримтлагдсан хувь»
 * гэсэн шошго нь юуны хуримтлал болохыг хэлдэггүй байв.
 *
 * ⚠️ ЗААВАЛ БАЙНА: нэг зурган дээр хоёр хэмжигдэхүүн байгааг хэлэхгүй бол
 * багананы өндөр ба муруйн өндрийг НЭГ хуваарь гэж уншина.
 */
function TimelineKey() {
  return (
    <span className={g.tlLegend}>
      <i className={g.tlKeyBar} aria-hidden /> {tr('Олгосон дүн')}
      <i className={g.tlKeyLine} aria-hidden /> {tr('Нийт хөрөнгөд эзлэх хувь')}
    </span>
  );
}

/* ══════════════════════ БАРУУН — ГАЗАР ЧӨЛӨӨЛӨЛТ ══════════════════════ */

/**
 * ДЭД БАГЦ бүрд давхцаж буй ҮЛДСЭН нэгж талбарууд (ObjectID).
 *
 * ⚠️ ЗӨВХӨН ШААРДЛАГАТАЙ ҮЕД (`enabled`). 42 дэд багц × нэг орон зайн асуулга
 * = 42 хүсэлт; хуудас нээх бүрд явуулбал бусад картын өгөгдөл хойшилно
 * (`PkgProg.tsx`-д 131 хүсэлтийн улмаас яг ийм асуудал гарч, задаргаа нь
 * «Газар чөлөөлөлт» харагдац руу шилжсэн). Хэрэглэгч шалтгаан сонгосон
 * үед л эхэлнэ.
 *
 * ⚠️ `overlapLeftParcels` нь үр дүнгээ ӨӨРӨӨ кэшилдэг тул шалтгаан солих
 * бүрд сүлжээ дахин хөндөгдөхгүй.
 *
 * ⚠️ ТОО биш OID — шалтгаанаар нарийсгахад хоёр олонлогийг огтолно.
 */
function useOverlapBySubPkg(enabled: boolean) {
  const subs = useAsync<SubPkg[]>(loadSubPkgLayers, []);
  const [out, setOut] = useState<Map<string, number[]> | 'error' | null>(null);

  useEffect(() => {
    if (!enabled || subs.state !== 'ready') return;
    let alive = true;
    Promise.allSettled(
      subs.data.map(async (sp) => [
        sp.key,
        (await overlapLeftParcels(sp.layerIds.map((layerId) => ({ layerId, where: null })))).oids,
      ] as const),
    ).then((res) => {
      if (!alive) return;
      if (res.every((r) => r.status === 'rejected')) { setOut('error'); return; }
      const m = new Map<string, number[]>();
      for (const r of res) if (r.status === 'fulfilled' && r.value[1].length > 0) m.set(r.value[0], r.value[1]);
      setOut(m);
    });
    return () => { alive = false; };
  }, [enabled, subs]);

  return { subs, out };
}

/** Газар чөлөөлөлтийн нэгж талбарын давхарга — шалтгааны зум үүн дээр */
const PARCEL_LAYER = 'land:left';

function LandCard({
  onShowLayers,
  onZoomParcels,
  active,
}: {
  onShowLayers: (ids: string[]) => void;
  onZoomParcels: (oids: number[] | null) => void;
  /** Шүүлтэд багтсан дэд багц → ажлын төрлүүд; `null` = өгөгдөл хараахан алга */
  active: Map<string, string[]> | null;
}) {
  const land = useAsync(loadLandStatus, []);
  const byReason = useAsync(loadReasonOids, []);

  /**
   * СОНГОСОН ШАЛТГААН. `null` = сонгоогүй — тэр үед доорх «Багцын төрлөөр
   * давхцаж буй» УТГА ХАРУУЛАХГҮЙ: бүх шалтгааны давхцлыг нийлүүлж үзүүлбэл
   * дээрх жагсаалттай холбоогүй тусдаа тоо болж, хоёр хэсэг нэг картад
   * зэрэгцээд бие биенээ тайлбарлахгүй байв.
   */
  const [reason, setReason] = useState<string | null>(null);
  const { subs, out: ov } = useOverlapBySubPkg(reason != null);

  /**
   * АЖЛЫН ТӨРӨЛ бүрд ТУХАЙН ШАЛТГААНТАЙ давхцсан талбарын тоо.
   *
   * ⚠️ Хоёр олонлогийн ОГТЛОЛЦОЛ: `ov` нь ОРОН ЗАЙН давхцал (аль талбар аль
   * дэд багцын давхаргатай), `byReason` нь АТРИБУТ (аль талбар яагаад
   * үлдсэн). Аль нэгийг дангаар нь ашиглавал асуултын хагаст л хариулна.
   *
   * ⚠️ ДАВХАРДЛЫГ ОЛОНЛОГООР АРИЛГАНА: нэг төрөлд олон дэд багц харьяалагдах
   * бөгөөд нэг нэгж талбар тэдгээрийн ХЭД ХЭДТЭЙ давхцаж болно. Тоог нь дүнгээр
   * нэмбэл нэг талбар олон удаа тоологдож, шалтгааны нийт тооноос ДАВНА.
   *
   * ⚠️ Огтлолцол нь ДЭД БАГЦЫН түвшинд тооцогдсон хэвээр (`ov`) — зөвхөн
   * ҮР ДҮНГ нь төрлөөр дахин хувааж байна. Тиймээс нэмэлт сүлжээний хүсэлт
   * ҮҮСЭХГҮЙ бөгөөд мөр дарахад асаах давхаргууд нь тэр төрлийн БҮХ дэд багцын
   * давхарга болно.
   */
  const rows = useMemo(() => {
    if (reason == null || ov == null || ov === 'error' || subs.state !== 'ready') return [];
    const want = byReason.state === 'ready' ? byReason.data.get(reason) : null;
    if (!want) return [];
    const acc = new Map<string, { oids: Set<number>; layers: Set<string> }>();
    for (const sp of subs.data) {
      /* ⚠️ ХУГАЦААНЫ ШҮҮЛТ: тухайн үед ажилгүй дэд багц ЖАГСААЛТААС ГАРНА */
      const types = active?.get(sp.key);
      if (!types || types.length === 0) continue;
      const hit = (ov.get(sp.key) ?? []).filter((o) => want.has(o));
      if (hit.length === 0) continue;
      for (const ty of types) {
        let a = acc.get(ty);
        if (!a) { a = { oids: new Set(), layers: new Set() }; acc.set(ty, a); }
        for (const o of hit) a.oids.add(o);
        for (const id of sp.layerIds) a.layers.add(id);
      }
    }
    return [...acc]
      .map(([ty, a]) => ({
        key: ty,
        label: nice(ty),
        layerIds: [...a.layers],
        value: a.oids.size,
        sub: 0,
      }))
      .sort((x, y) => y.value - x.value);
  }, [reason, ov, subs, byReason, active]);

  /**
   * Шалтгаан сонгох — төлөв тавиад ГАЗРЫН ЗУРГИЙГ тэр талбарууд руу аваачна.
   *
   * ⚠️ OID-оор (`FID IN (…)`) зумна, шалтгааны ТЕКСТЭЭР биш: жагсаалтын шошго
   * нь `cleanReason`-оор цэвэрлэгдсэн (арын зай, төгсгөлийн «.» хасагдсан) тул
   * түүхий утгатай үргэлж таарахгүй — SQL нь чимээгүй 0 мөр буцаана.
   */
  const pickReason = (k: string) => {
    const next = k === reason ? null : k;
    setReason(next);
    const oids = next != null && byReason.state === 'ready' ? byReason.data.get(next) : null;
    onZoomParcels(oids ? [...oids] : null);
  };

/** Мөр дарахад тухайн төрлийн БҮХ давхаргыг зурагт асааж, эхнийх рүү ойртоно */
  const show = (key: string) => {
    const r = rows.find((x) => x.key === key);
    if (r) onShowLayers(r.layerIds);
  };

  return (
    <Section title={tr('Газар чөлөөлөлт')}>
      <Data q={land} minH={220}>
        {(d) => (
          <>
            {/* ⚠️ «Чөлөөлөлтийн хувь» ЭНД БАЙХГҮЙ: тэр тоо зургийн дээрх
                индикаторын зурваст аль хэдийн бий — давхардал. */}
            <Stats cols={1}>
              <Stat value={num(d.remaining)} label={tr('Чөлөөгдөөгүй нэгж талбар')} accent />
            </Stats>

            <h4 className={g.sub}>{tr('Чөлөөгдөөгүй шалтгаанаар')}</h4>
            {d.reasons.length === 0
              ? <Empty label={tr('Шалтгаан бүртгэгдээгүй')} />
              : (
                <Bars
                  color={BAR_HUE}
                  selected={reason}
                  /* Дахин дарвал сонголт тайлагдана — цуцлах тусдаа товчгүй */
                  onSelect={pickReason}
                  items={countBars(
                    d.reasons.map((r) => ({ key: r.label, label: r.label, value: r.n, sub: 0 })),
                    { one: tr('нэгж талбар'), many: tr('чөлөөгдөөгүй талбарын') },
                  )}
                />
              )}

            <h4 className={g.sub}>{tr('Ажлын төрлөөр давхцаж буй')}</h4>
            {/* ⚠️ Шалтгаан сонгоогүй үед ЮУ Ч БИЧИХГҮЙ — «Дээрээс шалтгаан
                сонгоно уу» гэсэн заавар хэрэглэгчийн шийдвэрээр хасагдав
                (2026-09-06). */}
            {reason == null ? null
              : ov == null || byReason.state === 'loading' ? (
              <p className={g.wait}>{tr('Давхцлыг тооцож байна…')}</p>
            ) : ov === 'error' || byReason.state === 'error' ? (
              <Empty label={tr('Давхцал тооцогдсонгүй')} />
            ) : rows.length === 0 ? (
              <Empty label={tr('Давхцал илрээгүй')} />
            ) : (
              <Bars
                color={BAR_HUE}
                /* Дарахад давхарга зурагт асаж, түүн рүү ойртоно */
                onSelect={show}
                items={countBars(rows, { one: tr('нэгж талбар'), many: tr('давхцлын') })}
              />
            )}
          </>
        )}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — СААД, БАГЦААР ══════════════════════ */

/**
 * БАГЦ БҮР ДЭЭР ДАВХЦАЖ БУЙ ҮЛДСЭН НЭГЖ ТАЛБАР.
 *
 * ⚠️ Ачаалагч нь «Газар чөлөөлөлт» харагдацтай ХУВААЛЦСАН (`@/lib/pkgSaad`) —
 * тэнд кэшлэгдсэн тул хоёр дахь харагдац НЭМЭЛТ хүсэлт үүсгэхгүй. Тусдаа
 * хуулбар бичвэл 55 багцын огтлолцол хоёр дахин явна.
 *
 * ⚠️ ХУГАЦААНЫ ШҮҮЛТЭД ОРОХГҮЙ: нэгж талбарт төлөвлөгөөт хугацааны талбар
 * байхгүй тул жил/улирлаар шүүвэл хуурамч тэг гарна ([[LandCard]]-тай нэг зарчим).
 *
 * ⚠️ ЗӨВХӨН СААДТАЙ багц — `loadPkgOverlaps` нь тэгүүдийг аль хэдийн шүүсэн.
 */
function SaadCard({
  onShowLayers,
  keys,
}: {
  onShowLayers: (ids: string[]) => void;
  /**
   * ХУГАЦААНЫ ШҮҮЛТЭД багтсан багцын түлхүүрүүд. `null` = шүүлтгүй (бүгд).
   *
   * ⚠️ Шүүлт ИДЭВХГҮЙ үед `null` дамжина, БҮХ ТҮЛХҮҮРИЙН олонлог БИШ:
   * cashflow-д огт байхгүй багц (барилгын блокоос гарсан нэрс) байдаг тул
   * бүтэн олонлогоор шүүвэл тэдгээр нь шүүлтгүй үед ч чимээгүй алга болно.
   */
  keys: Set<string> | null;
}) {
  const q = useAsync(loadPkgOverlaps, []);
  const rows = useMemo(
    () => (q.state !== 'ready' ? [] : keys ? q.data.filter((r) => keys.has(r.key)) : q.data),
    [q, keys],
  );
  return (
    <Section
      title={tr('Саад — багцаар')}
      /* ⚠️ ЯЛГААТАЙ талбар — зурвасуудын НИЙЛБЭР БИШ. Нэг үлдсэн нэгж
         талбар хэд хэдэн багцын шугам/блоктой зэрэг огтлолцоно (амьдаар: 105
         талбарын 73 нь 2–7 багцад тоологдож, нийлбэр 244 болдог). `Gazar`
         харагдацад 2026-09-06-нд яг үүнийг зассан — энэ бол тэр кодын
         хуулбар тул ижил дүрэм үйлчилнэ. */
      note={rows.length > 0
        ? tr('{0} багц · {1} талбар',
            num(rows.length),
            num(new Set(rows.flatMap((r) => r.oids)).size))
        : undefined}
    >
      <Data q={q} minH={160}>
        {() => (rows.length === 0
          ? <Empty label={tr('Аль ч багц дээр давхцсан үлдсэн нэгж талбар алга.')} />
          : (
            <Bars
              color="var(--bad)"
              /* ⚠️ Эхний 8 — баруун багана нарийн; үлдсэнийг «дэлгэх» товчоор */
              limit={8}
              onSelect={(k) => {
                const r = rows.find((x) => x.key === k);
                if (r) onShowLayers(r.layerIds);
              }}
              items={rows.map((r) => ({
                key: r.key,
                label: nice(tr(r.name)),
                value: r.oids.length,
                display: tr('{0} талбар', num(r.oids.length)),
              }))}
            />
          ))}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ ══════════════════════ */

/**
 * Хэмжээ авах давхаргууд — id ба картын шошго.
 *
 * ⚠️ Нэгжийг ГАРААР бичихгүй: `qtyText` нь давхаргын өөрийнх нь `qty.unit`-ыг
 * (м / км / м²) уншиж, жижиг утгыг ухаалаг нэгжид хөрвүүлдэг. Гараар «км» гэж
 * бичвэл метрээр хөтлөгддөг давхарга 1000 дахин буруу гарна.
 *
 * ⚠️ `LAYER_BY_ID`-д БАЙХГҮЙ id нь картаас чимээгүй унана — үйлчилгээ
 * солигдоход «0 км» гэсэн худал мөр үлдэхээс сэргийлнэ.
 */
const PLAN_QTY: { id: string; label: string }[] = [
  { id: 'road', label: tr('Нийт замын урт') },
  { id: 'et:15', label: tr('Инженерийн бэлтгэлийн урт') },
  { id: 'nogoon', label: tr('Ногоон байгууламж') },
];

/** Инженерийн шугам сүлжээ — гурван гэр бүлийн давхаргын нийлбэр урт */
const NET_FAMILIES: PkgFamily[] = ['net', 'pow', 'src'];

function PlanCard({ totals }: { totals: ReturnType<typeof usePlanTotals> }) {
  /**
   * ⚠️ «Баригдаж эхэлсэн» нь `BUILDING` давхаргын БҮХ обьект (113 блок): тэр
   * давхарга нь өөрөө барилга угсралт эхэлсэн блокуудын жагсаалт. Нийт
   * ТӨЛӨВЛӨГДСӨН барилга нь ерөнхий төлөвлөгөөний `et:24`-д — ӨӨР давхарга
   * тул хоёр тоог хольж болохгүй.
   */
  const started = useAsync(
    async () => Number((await queryStats(BUILDING.url, [count(BUILDING.oid, 'n')], '1=1')).n ?? 0),
    [],
  );

  return (
    <Section title={tr('Ерөнхий төлөвлөгөө')}>
      <Data q={totals} minH={200}>
        {(t) => {
          const cnt = (id: string) => t.get(id)?.n ?? null;
          const qty = (id: string) => {
            const d = LAYER_BY_ID[id];
            const q = t.get(id)?.q;
            return d && q != null ? qtyText(d, q) : null;
          };

          /* Шугам сүлжээний нийт урт — гэр бүлийн давхаргууд нь бүгд ижил
             нэгжтэй (метр) тул нийлбэр нь утгатай. Аль нэг нь дутвал
             нийлбэрт орохгүй — тоо БАГА гарна, ХУДАЛ гарахгүй. */
          const netIds = [...new Set(NET_FAMILIES.flatMap((f) => PKG_BY_FAMILY[f] ?? []))];
          const netM = netIds.reduce((s, id) => s + (t.get(id)?.q ?? 0), 0);

          const lines: { key: string; label: string; text: string }[] = [];
          for (const p of PLAN_QTY) {
            const text = qty(p.id);
            if (text) lines.push({ key: p.id, label: p.label, text });
          }
          if (netM > 0) {
            lines.push({
              key: 'net',
              label: tr('Инженерийн шугам сүлжээ'),
              text: tr('{0} км', num(netM / 1000, 1)),
            });
          }
          const zones = cnt('zone');
          if (zones != null) lines.push({ key: 'zone', label: tr('Хот төлөвлөлтийн бүс'), text: num(zones) });

          return (
            <>
              <Stats cols={2}>
                <Stat
                  value={cnt('et:24') == null ? '—' : num(cnt('et:24')!)}
                  label={tr('Нийт төлөвлөгдсөн барилга')}
                  accent
                />
                <Stat
                  value={started.state === 'ready' ? num(started.data) : '…'}
                  label={tr('Баригдаж эхэлсэн блок')}
                />
              </Stats>
              {lines.length > 0 && (
                <ul className={g.plain}>
                  {lines.map((l) => (
                    <li key={l.key}><span>{l.label}</span><b className="num">{l.text}</b></li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — ХАБ ══════════════════════ */

function HseCard() {
  const hse = useAsync(loadHseNow, []);
  /**
   * ⚠️ Огноог ЗААВАЛ үзүүлнэ — маягт өдөр бүр бөглөгддөггүй тул «өнөөдрийн
   * байдлаар» гэдэг нь сүүлийн бүртгэлийн өдөр. Гэвч тайлбар бичихгүй, зөвхөн
   * ОГНОО — гарчгийн баруун талд (`note`) сууна: тоонуудын доор бүтэн
   * өгүүлбэр байснаа хэрэглэгч хассан (2026-09-06).
   */
  const stamp = hse.state === 'ready' ? hse.data?.date : null;
  return (
    <Section title={tr('ХАБ')} note={stamp || undefined}>
      <Data q={hse} minH={130}>
        {(d) => (d == null ? <Empty label={tr('Бүртгэл алга')} /> : (
          <Stats cols={3}>
            <Stat value={num(d.workers)} label={tr('Ажиллаж буй хүн')} accent />
            <Stat value={num(d.equipment)} label={tr('Техник хэрэгсэл')} />
            <Stat value={num(d.manHours)} label={tr('Хүн цаг')} />
          </Stats>
        ))}
      </Data>
    </Section>
  );
}

export default GeneralDash;

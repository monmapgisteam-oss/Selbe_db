'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Section, Stats, Stat, Data, Empty, Bars, monotonePath } from '@/components/ui';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useAsync } from '@/lib/useAsync';
import { usePlanTotals, qtyText } from '@/lib/totals';
import { loadLandStatus } from '@/lib/land';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import {
  /* ⚠️ `PKG_BY_FAMILY` нь ЗӨВХӨН «Ерөнхий төлөвлөгөө» картын шугам
     сүлжээний нийлбэр уртад хэрэглэгдэнэ — газар чөлөөлөлтийн давхцал нь
     2026-09-04-нд гэр бүлээс ДЭД БАГЦ руу шилжсэн. */
  PKG_BY_FAMILY, BUILDING, LAYER_BY_ID, ZONE_FIELD, ZONE_NONE, type PkgFamily,
} from '@/lib/services';
import { queryStats, count } from '@/lib/query';
import { cat, mnt, num, pct } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow, loadReasonOids, loadSubPkgLayers,
  chartTypeCost, chartTypeCount, chartSourceCount, chartSourceAmount, chartNoteAmount,
  timeline, grainOf, kpisOf, inPeriod, yearsOf, periodActive,
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
 *   │ САНХҮҮ     │ индикаторын зурвас       │ ГАЗАР ЧӨЛӨӨЛӨЛТ  │
 *   │ 4 чарт     │ ГАЗРЫН ЗУРАГ (2D/3D/BIM) │ ЕРӨНХИЙ ТӨЛӨВЛ.  │
 *   │            │ S-МУРУЙ                  │ ХАБ              │
 *   └────────────┴──────────────────────────┴──────────────────┘
 *
 * ⚠️ ЭНЭ НЬ «Төслийн дэлгэрэнгүй мэдээлэл» (`Dashboard.tsx`)-ЫГ ОРЛОХГҮЙ.
 * Тэр нь 9 дэд хэсэгт задардаг СУДЛАХ хэрэгсэл; энэ нь нэг дэлгэцэд багтдаг,
 * задрахгүй ТОЙМ. Хоёулаа `standalone` харагдац бөгөөд `MapCanvas`-аа
 * хуваалцана.
 *
 * ⚠️ ХУГАЦААНЫ ШҮҮЛТ нь ЗӨВХӨН cashflow-д тулгуурласан картуудад (зүүн 4 чарт,
 * S-муруй, индикатор) үйлчилнэ. Газар чөлөөлөлт, ерөнхий төлөвлөгөө, ХАБ нь
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
          <MapCanvas dim={dim} visible={visible} opacity={opacity} zone={zone} uniform onPick={pick} />

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
        <Section title={tr('Нийт төслийн S-муруй ба олгосон дүн')}>
          <Data q={cf} minH={190}>
            {(rows) => (
              <Timeline
                rows={rows.filter((r) => inPeriod(r, period))}
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
        <LandCard
          onShowLayers={(ids) => {
            setVisible((v) => [...new Set([...v, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
        />
        <PlanCard totals={totals} />
        <HseCard />
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
        <Stat icon="chart" value={k.progress == null ? '—' : pct(k.progress)} label={tr('Гүйцэтгэлийн хувь')} />
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
const moneyBars = (items: SubBar[], subLabel?: { has: string; none: string }) => {
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
       1.2% болохыг хэлдэггүй. Суурь нь ҮРГЭЛЖ нийт төсөв (индикаторын
       «Нийт төсөв»-тэй ижил тоо) тул түүнийг нэрлэнэ. */
    const hint = [tr('Нийт төсвийн {0}-ийг эзэлж байна', share ?? '—')];
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
  const c3 = useMemo(() => chartSourceCount(sel), [sel]);
  const c3m = useMemo(() => chartSourceAmount(sel), [sel]);
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

      {/* ⚠️ ХОЁР ЧАРТ: «хэдэн ажил» ба «хэдэн төгрөг» нь эрс өөр хариу өгдөг —
          Нийслэлийн төсөв 2 ажилтай ч 4.3 тэрбум, Үнэт цаас 51 ажилтай бөгөөд
          1,488 тэрбум. Аль нэгийг нь л үзүүлбэл нөгөө талын дүр зураг алга. */}
      <Section title={tr('Захирамжийн эх үүсвэр — мөнгөн дүн')}>
        <Bars color={BAR_HUE} items={moneyBars(c3m)} limit={8} />
      </Section>

      <Section title={tr('Захирамжийн эх үүсвэр — төслийн тоо')}>
        <Bars
          color={BAR_HUE}
          max={100}
          items={countBars(c3, { one: tr('ажил'), many: tr('ажлын') },
            { has: tr('Гэрээ хийсэн'), none: tr('Нэг ч гэрээ хийгдээгүй') })}
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
  if (!pts.length) return <Empty label={tr('Төлөвлөгөөт хугацаатай ажил олдсонгүй')} />;

  const maxAmt = Math.max(1, ...pts.map((p) => p.amount));
  const n = pts.length;
  /* ⚠️ Цэгийн х-байрлал нь баганын ТӨВД — эс бөгөөс муруй баганаас хазайна */
  const path = monotonePath(pts.map((p, i) => ({
    x: ((i + 0.5) / n) * 100,
    y: 100 - Math.max(0, Math.min(100, p.pct)),
  })));

  return (
    <div className={g.tl}>
      <div className={g.tlPlot}>
        <div className={g.tlBars}>
          {pts.map((p) => (
            <div key={p.key} className={g.tlCol} title={`${p.label} · ${mntShort(p.amount)}`}>
              <span className={g.tlVal}>{p.amount > 0 ? mntShort(p.amount) : ''}</span>
              <i className={g.tlBar} style={{ height: `${(p.amount / maxAmt) * 100}%` }} />
            </div>
          ))}
        </div>

        <svg className={g.tlSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path className={g.tlLine} d={path} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>

        {pts.map((p, i) => (
          <span
            key={p.key}
            className={g.tlDot}
            style={{
              left: `${((i + 0.5) / n) * 100}%`,
              bottom: `${Math.max(0, Math.min(100, p.pct))}%`,
            }}
          >
            <b>{pct(p.pct)}</b>
          </span>
        ))}
      </div>

      <div className={g.tlAxis}>
        {pts.map((p) => <span key={p.key}>{p.label}</span>)}
      </div>

      {/* ⚠️ Домог ЗААВАЛ: нэг зурган дээр хоёр хэмжигдэхүүн байгааг хэлэхгүй
          бол багананы өндөр ба муруйн өндрийг НЭГ хуваарь гэж уншина. */}
      <p className={g.tlLegend}>
        <i className={g.tlKeyBar} aria-hidden /> {tr('Олгосон дүн')}
        <i className={g.tlKeyLine} aria-hidden /> {tr('Хуримтлагдсан хувь')}
      </p>
    </div>
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

function LandCard({ onShowLayers }: { onShowLayers: (ids: string[]) => void }) {
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
   * Дэд багц бүрд ТУХАЙН ШАЛТГААНТАЙ давхцсан талбарын тоо.
   *
   * ⚠️ Хоёр олонлогийн ОГТЛОЛЦОЛ: `ov` нь ОРОН ЗАЙН давхцал (аль талбар аль
   * дэд багцын давхаргатай), `byReason` нь АТРИБУТ (аль талбар яагаад
   * үлдсэн). Аль нэгийг дангаар нь ашиглавал асуултын хагаст л хариулна.
   */
  const rows = useMemo(() => {
    if (reason == null || ov == null || ov === 'error' || subs.state !== 'ready') return [];
    const want = byReason.state === 'ready' ? byReason.data.get(reason) : null;
    if (!want) return [];
    return subs.data
      .map((sp) => ({
        key: sp.key,
        label: sp.label,
        value: (ov.get(sp.key) ?? []).filter((o) => want.has(o)).length,
        sub: 0,
      }))
      .filter((x) => x.value > 0)
      .sort((x, y) => y.value - x.value);
  }, [reason, ov, subs, byReason]);

  /** Мөр дарахад тухайн дэд багцын давхаргыг зурагт асааж, түүн рүү ойртоно */
  const show = (key: string) => {
    if (subs.state !== 'ready') return;
    const sp = subs.data.find((x) => x.key === key);
    if (sp) onShowLayers(sp.layerIds);
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
                  onSelect={(k) => setReason((v) => (v === k ? null : k))}
                  items={countBars(
                    d.reasons.map((r) => ({ key: r.label, label: r.label, value: r.n, sub: 0 })),
                    { one: tr('нэгж талбар'), many: tr('чөлөөгдөөгүй талбарын') },
                  )}
                />
              )}

            <h4 className={g.sub}>{tr('Дэд багцаар давхцаж буй')}</h4>
            {reason == null ? (
              /* ⚠️ Заавар нь ХООСОН ЗУРВАСЫГ орлоно: юу ч харагдахгүй байвал
                 «ачаалж чадаагүй» гэж эндүүрнэ. */
              <p className={g.wait}>{tr('Дээрээс шалтгаан сонгоно уу')}</p>
            ) : ov == null || byReason.state === 'loading' ? (
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
  return (
    <Section title={tr('ХАБ')}>
      <Data q={hse} minH={130}>
        {(d) => (d == null ? <Empty label={tr('Бүртгэл алга')} /> : (
          <>
            <Stats cols={3}>
              <Stat value={num(d.workers)} label={tr('Ажиллаж буй хүн')} accent />
              <Stat value={num(d.equipment)} label={tr('Техник хэрэгсэл')} />
              <Stat value={num(d.manHours)} label={tr('Хүн цаг')} />
            </Stats>
            {/* ⚠️ Огноог ЗААВАЛ үзүүлнэ — маягт өдөр бүр бөглөгддөггүй тул
                «өнөөдрийн байдлаар» гэдэг нь сүүлийн бүртгэлийн өдөр. */}
            <p className={g.stamp}>{tr('Сүүлд бөглөсөн: {0}', d.date || '—')}</p>
          </>
        ))}
      </Data>
    </Section>
  );
}

export default GeneralDash;

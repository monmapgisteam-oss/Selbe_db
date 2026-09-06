'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Section, Stats, Stat, Data, Trend, Empty } from '@/components/ui';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useAsync } from '@/lib/useAsync';
import { usePlanTotals, qtyText } from '@/lib/totals';
import { loadLandStatus } from '@/lib/land';
import { loadPkgProgress, latestPkgProgress } from '@/lib/live';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import {
  PKG_BY_FAMILY, BUILDING, LAYER_BY_ID, ZONE_FIELD, ZONE_NONE, type PkgFamily,
} from '@/lib/services';
import { queryStats, count } from '@/lib/query';
import { cat, mnt, num, pct } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow,
  chartTypeCost, chartTypeCount, chartSourceCount, chartNoteAmount,
  sCurve, kpisOf, inPeriod, yearsOf, periodActive,
  NO_PERIOD, CONTRACTED,
  type CfRow, type Period, type SubBar,
} from '@/lib/gdash';
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
  const [opacity, setOpacity] = useState<Record<string, number>>({});

  /* Суурь давхарга — бүс ба ерөнхий төлөвлөгөөний барилга (дэлгэрэнгүй
     дашбоардтай ижил эхлэл). Каталогоос нэмсэн нь `useLayerPicks`-д үлдэнэ. */
  const base = useMemo(() => ['zone', 'et:24'], []);
  const [visible, setVisible] = useLayerPicks(base);

  const totals = usePlanTotals(zone, true);
  const cf = useAsync(loadGdashCf, []);
  const contracts = useAsync(loadContractSum, []);
  const progress = useAsync(
    async () => {
      const rows = latestPkgProgress(await loadPkgProgress());
      const m = new Map<string, number>();
      for (const r of rows) if (r.actual != null) m.set(r.key, r.actual);
      return m;
    },
    [],
  );

  const prog = progress.state === 'ready' ? progress.data : null;

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

      <aside className={g.left}>
        <Data q={cf} minH={520}>
          {(rows) => <FinCharts rows={rows} period={period} progress={prog} />}
        </Data>
      </aside>

      <main className={g.center}>
        <Data q={cf} minH={72}>
          {(rows) => (
            <KpiStrip
              rows={rows}
              period={period}
              contracts={contracts.state === 'ready' ? contracts.data : null}
              progress={prog}
            />
          )}
        </Data>

        <div className={g.hero}>
          <MapCanvas dim={dim} visible={visible} opacity={opacity} zone={zone} uniform onPick={pick} />
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
          {opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}
          {layerOpen && (
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

        <Section
          title={tr('Нийт төслийн S-муруй')}
          note={tr('Төлөвлөгөөт хугацаанд хуримтлагдах хөрөнгө оруулалтын хувь')}
        >
          <Data q={cf} minH={190}>
            {(rows) => <SCurve rows={rows.filter((r) => inPeriod(r, period))} />}
          </Data>
        </Section>
      </main>

      <aside className={g.right}>
        <LandCard />
        <PlanCard totals={totals} />
        <HseCard />
      </aside>
    </div>
  );
}

/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

const QUARTERS = [1, 2, 3, 4];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function PeriodBar({
  period, setPeriod, years,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  years: number[];
}) {
  /**
   * ⚠️ САР сонгоход УЛИРАЛ автоматаар унтарна (ба эсрэгээр): «2-р улирал ба
   * 11-р сар» гэсэн хослол нь ҮРГЭЛЖ хоосон олонлог бөгөөд хэрэглэгч бүх
   * чарт яагаад хоосон болсныг ойлгохгүй. Хоёул нэг тэнхлэгийн хоёр өөр
   * нарийвчлал тул сүүлд дарсан нь нөгөөг орлоно.
   */
  const pickQuarter = (q: number | null) => setPeriod({ ...period, quarter: q, month: null });
  const pickMonth = (m: number | null) => setPeriod({ ...period, month: m, quarter: null });

  const chip = (key: string, on: boolean, label: string, onClick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      className={`${g.chip} ${on ? g.chipOn : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className={g.filters}>
      <span className={g.fLabel}>{tr('Жил')}</span>
      <div className={g.fGroup}>
        {chip('y-all', period.year == null, tr('Бүгд'), () => setPeriod({ ...period, year: null }))}
        {years.map((y) => chip(`y${y}`, period.year === y, String(y), () => setPeriod({ ...period, year: y })))}
      </div>

      <span className={g.fLabel}>{tr('Улирал')}</span>
      <div className={g.fGroup}>
        {chip('q-all', period.quarter == null, tr('Бүгд'), () => pickQuarter(null))}
        {QUARTERS.map((q) => chip(`q${q}`, period.quarter === q, `${q}`, () => pickQuarter(q)))}
      </div>

      <span className={g.fLabel}>{tr('Сар')}</span>
      <div className={g.fGroup}>
        {chip('m-all', period.month == null, tr('Бүгд'), () => pickMonth(null))}
        {MONTHS.map((m) => chip(`m${m}`, period.month === m, `${m}`, () => pickMonth(m)))}
      </div>

      {periodActive(period) && (
        <button type="button" className={g.clear} onClick={() => setPeriod(NO_PERIOD)}>
          {tr('Шүүлт цуцлах')}
        </button>
      )}
    </div>
  );
}

/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

function KpiStrip({
  rows, period, contracts, progress,
}: {
  rows: CfRow[];
  period: Period;
  contracts: Map<number, number> | null;
  progress: Map<string, number> | null;
}) {
  const land = useAsync(loadLandStatus, []);

  const k = useMemo(() => {
    const sel = rows.filter((r) => inPeriod(r, period));
    const csum = contracts ? sel.reduce((s, r) => s + (contracts.get(r.oid) ?? 0), 0) : 0;
    return kpisOf(sel, csum, progress ?? new Map());
  }, [rows, period, contracts, progress]);

  const landPct = land.state === 'ready' ? land.data.pct : null;

  return (
    <div className={g.kpis}>
      <Stats cols={3}>
        <Stat value={mnt(k.budget)} label={tr('Нийт төсөв')} accent />
        <Stat value={contracts ? mnt(k.contract) : '…'} label={tr('Нийт гэрээний дүн')} />
        <Stat value={k.progress == null ? '—' : pct(k.progress)} label={tr('Гүйцэтгэлийн хувь')} />
        <Stat value={num(k.packages)} label={tr('Багц ажлын тоо')} />
        <Stat value={num(k.types)} label={tr('Нийт төрлийн тоо')} />
        <Stat value={landPct == null ? '…' : pct(landPct)} label={tr('Газар чөлөөлөлт')} />
      </Stats>
      {/* ⚠️ ХАМРАЛТЫГ ИЛ БИЧНЭ — гүйцэтгэл нь зөвхөн барилгын багцуудад
          хэмжигддэг тул тэр хувь БҮХ төслийнх мэт уншигдах ёсгүй. */}
      {k.progress != null && k.progressCovered < 99 && (
        <p className={g.stamp}>
          {tr('Гүйцэтгэлийн хувь нь нийт төсвийн {0}-д хэмжигдсэн', pct(k.progressCovered, 0))}
        </p>
      )}
    </div>
  );
}

/* ══════════════════════ ЗҮҮН — САНХҮҮГИЙН 4 ЧАРТ ══════════════════════ */

/**
 * ДЭД ЦУВААТАЙ БАГАНА — гол утга нь бүтэн зурвас, дэд цуваа нь дотор нь.
 *
 * ⚠️ `ui.tsx`-ийн `Bars` нь НЭГ утга л зурдаг, `Stack` нь НЭГ мөрийг хувааж
 * зурдаг. Даалгаврын «series chart хэсэгт дотор нь …» гэдэг нь ангилал бүрд
 * ХОЁР ДАВХАР утга — тэр хэлбэр эдгээрийн аль нь ч биш тул энд бичив.
 * Хамтын сан руу (`ui.tsx`) гаргаагүй нь: ганц дуудагчтай хэлбэрээр нийтийн
 * API-г тэлэх нь дараагийн хүнд илүү сонголт болж ирнэ.
 */
function SubBars({
  items, hue, subLabel, fmt, emptyLabel,
}: {
  items: SubBar[];
  hue: number;
  /** Дэд цувааны нэр — хоосон мөр бол дэд цуваа огт байхгүй чарт */
  subLabel: string;
  fmt: (v: number) => string;
  emptyLabel?: string;
}) {
  if (!items.length) {
    return <Empty label={emptyLabel ?? tr('Сонгосон хугацаанд өгөгдөл алга')} />;
  }
  const top = Math.max(1, ...items.map((i) => i.value));
  const anySub = Boolean(subLabel) && items.some((i) => i.sub > 0);

  return (
    <div className={g.bars}>
      {items.map((i, n) => (
        <div key={i.key} className={g.barRow}>
          <span className={g.barName} title={i.label}>{i.label}</span>
          <span className={g.barTrack}>
            <span
              className={g.barFill}
              style={{ width: `${(i.value / top) * 100}%`, background: cat(hue + n) }}
            />
            {subLabel && i.sub > 0 && (
              <span
                className={g.barSub}
                style={{ width: `${(i.sub / top) * 100}%` }}
                title={`${subLabel}: ${fmt(i.sub)}`}
              />
            )}
          </span>
          <span className={`${g.barVal} num`}>{fmt(i.value)}</span>
        </div>
      ))}
      {anySub && (
        <p className={g.barLegend}>
          <i className={g.swatchSub} aria-hidden /> {subLabel}
        </p>
      )}
    </div>
  );
}

function FinCharts({
  rows, period, progress,
}: {
  rows: CfRow[];
  period: Period;
  progress: Map<string, number> | null;
}) {
  const sel = useMemo(() => rows.filter((r) => inPeriod(r, period)), [rows, period]);
  const prog = useMemo(() => progress ?? new Map<string, number>(), [progress]);

  const c1 = useMemo(() => chartTypeCost(sel, prog), [sel, prog]);
  const c2 = useMemo(() => chartTypeCount(sel), [sel]);
  const c3 = useMemo(() => chartSourceCount(sel), [sel]);
  const c4 = useMemo(() => chartNoteAmount(sel), [sel]);

  return (
    <>
      <Section
        title={tr('Төрөл — урьдчилсан төсөвт өртөг')}
        note={tr('Багана дотор — гүйцэтгэлийн хувиар хэмжсэн дүн')}
      >
        <SubBars items={c1} hue={0} subLabel={tr('Гүйцэтгэсэн дүн')} fmt={mnt} />
      </Section>

      <Section
        title={tr('Төрөл — төслийн тоо')}
        note={tr('Багана дотор — «{0}» тайлбартай ажил', CONTRACTED)}
      >
        <SubBars items={c2} hue={2} subLabel={tr('Гэрээ хийсэн')} fmt={(v) => num(v)} />
      </Section>

      <Section
        title={tr('Захирамжийн эх үүсвэр — төслийн тоо')}
        note={tr('Нэг ажил олон эх үүсвэрт хамаарч болно')}
      >
        <SubBars items={c3} hue={4} subLabel={tr('Гэрээ хийсэн')} fmt={(v) => num(v)} />
      </Section>

      <Section title={tr('Хөрөнгө оруулалтын дүнгийн тайлбар — мөнгөн дүн')}>
        <SubBars items={c4} hue={6} subLabel="" fmt={mnt} />
      </Section>
    </>
  );
}

/* ══════════════════════ S-МУРУЙ ══════════════════════ */

function SCurve({ rows }: { rows: CfRow[] }) {
  const pts = useMemo(() => sCurve(rows), [rows]);
  if (!pts.length) return <Empty label={tr('Төлөвлөгөөт хугацаатай ажил олдсонгүй')} />;
  return (
    <Trend
      points={pts.map((p) => ({ label: p.label, value: p.value }))}
      height={168}
      unit="%"
      fmt={(v) => pct(v)}
      visible={24}
    />
  );
}

/* ══════════════════════ БАРУУН — ГАЗАР ЧӨЛӨӨЛӨЛТ ══════════════════════ */

/**
 * БАГЦЫН ТӨРӨЛ → шошго.
 *
 * ⚠️ Түлхүүрүүд нь `services.ts`-ийн `PkgFamily`; шошгыг тэндхийн `PKG_HUE`-ийн
 * тайлбараас (багц бүр аль ажлыг хамардаг) буулгав. Тэр гэр бүлийн жагсаалт
 * `PKG_BY_FAMILY`-ээс автоматаар ирдэг тул шинэ давхарга нэмэгдэхэд энд юу ч
 * засах шаардлагагүй — зөвхөн ШИНЭ гэр бүл нэмэгдвэл TS шошго дутууг заана.
 */
const FAMILY_LABEL: Record<PkgFamily, string> = {
  com: tr('Барилгажилт'),
  net: tr('Дулаан · ус · ариутгах татуурга'),
  pow: tr('Цахилгаан хангамж'),
  src: tr('Эх үүсвэр · магистраль'),
  site: tr('Өндөржилт · тохижилт'),
  soc: tr('Нийгмийн барилга'),
};

/** Багцын төрөл бүрд давхцаж буй ҮЛДСЭН нэгж талбарын тоо */
function useOverlapByFamily() {
  const [out, setOut] = useState<Map<PkgFamily, number> | 'error' | null>(null);

  useEffect(() => {
    let alive = true;
    const fams = Object.keys(FAMILY_LABEL) as PkgFamily[];
    Promise.allSettled(
      fams.map(async (fam) => {
        const ids = PKG_BY_FAMILY[fam] ?? [];
        if (!ids.length) return [fam, 0] as const;
        const r = await overlapLeftParcels(ids.map((layerId) => ({ layerId, where: null })));
        return [fam, r.oids.length] as const;
      }),
    ).then((res) => {
      if (!alive) return;
      /* ⚠️ БҮГД унавал `'error'` — хоосон Map буцаавал «давхцал алга» гэсэн
         ХУДАЛ дүгнэлт гарна. Хэсэгчлэн унасан бол ирсэн хэсгийг үзүүлнэ. */
      if (res.every((r) => r.status === 'rejected')) { setOut('error'); return; }
      const m = new Map<PkgFamily, number>();
      for (const r of res) if (r.status === 'fulfilled' && r.value[1] > 0) m.set(r.value[0], r.value[1]);
      setOut(m);
    });
    return () => { alive = false; };
  }, []);

  return out;
}

function LandCard() {
  const land = useAsync(loadLandStatus, []);
  const ov = useOverlapByFamily();

  return (
    <Section title={tr('Газар чөлөөлөлт')} note={tr('Бүх хугацаа')}>
      <Data q={land} minH={220}>
        {(d) => (
          <>
            <Stats cols={2}>
              <Stat value={num(d.remaining)} label={tr('Чөлөөгдөөгүй нэгж талбар')} accent />
              <Stat value={d.pct == null ? '—' : pct(d.pct)} label={tr('Чөлөөлөлтийн хувь')} />
            </Stats>

            <h4 className={g.sub}>{tr('Чөлөөгдөөгүй шалтгаанаар')}</h4>
            <SubBars
              items={d.reasons.map((r) => ({ key: r.label, label: r.label, value: r.n, sub: 0 }))}
              hue={1}
              subLabel=""
              fmt={(v) => num(v)}
              emptyLabel={tr('Шалтгаан бүртгэгдээгүй')}
            />

            <h4 className={g.sub}>{tr('Багцын төрлөөр давхцаж буй')}</h4>
            {ov == null ? (
              <p className={g.wait}>{tr('Давхцлыг тооцож байна…')}</p>
            ) : ov === 'error' ? (
              <Empty label={tr('Давхцал тооцогдсонгүй')} />
            ) : (
              <SubBars
                items={[...ov]
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => ({ key: k, label: FAMILY_LABEL[k], value: n, sub: 0 }))}
                hue={3}
                subLabel=""
                fmt={(v) => num(v)}
                emptyLabel={tr('Давхцал илрээгүй')}
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
    <Section title={tr('Ерөнхий төлөвлөгөө')} note={tr('Бүх хугацаа')}>
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

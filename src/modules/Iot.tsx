'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { Data, Trend, Note, Bars } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { usePlanTotals } from '@/lib/totals';
import { useAsync } from '@/lib/useAsync';
import {
  loadSensors, RANGES, type RangeKey, type SensorLive, type MetricSeries,
} from '@/lib/sensors';
import { num } from '@/lib/format';
import { sumBy } from '@/lib/agg';
import { VIEW_BY_KEY } from '@/lib/services';
import s from './iot.module.css';
import o from './iotOv.module.css';

/**
 * IoT ХЯНАЛТ — Mononet-ээс 15 минут тутам ингест хийгддэг таван мэдрэгч.
 *
 * ⚠️ ХОЁР ЗҮЙЛИЙГ ИЛ ГАРГАНА (нуухгүй):
 *
 * 1. ХУУЧИРСАН ЗААЛТ. Түүхий мөр 15 минут тутам ирж байгаа ч Mononet-ийн
 *    decoder тогтворгүй тул ЗАДАРСАН утга нь хэдэн өдрөөр хоцорч болно.
 *    Сүүлийн заалтыг «одоогийн байдал» гэж чимээгүй харуулбал шийдвэр
 *    гаргагчийг төөрөгдүүлнэ — тиймээс нас (`ageHours`) үзүүлэлт бүр дээр гарна.
 *
 * 2. ЗААЛТГҮЙ МЭДРЭГЧ. Задарсан утга огт ирээгүй мэдрэгчийг жагсаалтаас
 *    ХАСАХГҮЙ — «дүлий» гэж ил үзүүлнэ.
 */

/* ══════════════════ Амьд цаг ══════════════════ */

/**
 * ЗУРАГДАХ үеийн «одоо».
 *
 * ⚠️ 2026-08-19: `sensors.ts` нь `ageHours`-ыг ТАТАХ мөчид бодож өгдөг. Тэр нь
 * хөлдсөн тоо: 09:00-д «31 мин өмнө» гэж уншсан хэрэглэгч 15:00 болтол ЯГ тэр
 * бичгийг ногоон өнгөтэй хараад, 6.5 цаг хуучирсныг мэдэхгүй байв — энэ модулийн
 * «хуучирсан заалтыг НУУХГҮЙ» гэсэн үндсэн амлалтыг UI өөрөө зөрчиж байлаа.
 * Одоо нас нь `latestAt` (жинхэнэ цагийн тэмдэг) дээр минут тутам дахин бодогдоно.
 *
 * Context болгосон шалтгаан: 10 орчим газар нас хэрэгтэй — компонент бүрд
 * тусдаа `setInterval` тавивал таб бүрд арван таймер ажиллана.
 */
const NowCtx = createContext(0);
const useNow = () => useContext(NowCtx);

/** epoch ms → цаг (одоогийн мөчөөс). Тэмдэглэгээгүй бол `null`. */
const ageOf = (t: number | null | undefined, now: number): number | null =>
  t == null ? null : Math.max(0, (now - t) / 3_600_000);

/* ══════════════════ Туслах тооцоо ══════════════════ */

/** Хэр шинэ вэ — 1 цагаас доош минутаар, 48-аас доош цагаар, цаашид хоногоор */
const freshLabel = (h: number | null): string => {
  if (h == null) return tr('заалт алга');
  if (h < 1) return tr('{0} мин өмнө', Math.round(h * 60));
  if (h < 48) return tr('{0} цаг өмнө', Math.round(h));
  return tr('{0} хоног өмнө', Math.round(h / 24));
};

/**
 * Насаар өнгө — 2 цаг хүртэл шинэ, 48 хүртэл анхаарах, цаашид хуучирсан.
 * ⚠️ ЗӨВХӨН текстэд хэрэглэгддэг тул `-ink` хувилбарууд: цайвар горимд
 * дүүргэлтийн токен цагаан дээр 4.5:1 хүрдэггүй (харанхуйд хоёулаа ижил).
 */
const freshTone = (h: number | null): string => {
  if (h == null) return 'var(--ink-3)';
  if (h <= 2) return 'var(--good-ink)';
  if (h <= 48) return 'var(--warn-ink)';
  return 'var(--bad-ink)';
};

/** `Trend` нь `label`-ыг ШУУД хэвлэдэг тул богино байлгана */
const axisLabel = (t: number): string => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Сүүлийн заалт нь 24 цагийн ӨМНӨХ-ээс хэдэн хувиар зөрсөн бэ.
 *
 * ⚠️ ЗЭРГЭЛДЭЭ хоёр заалтыг харьцуулж БОЛОХГҮЙ: 15 минутын алхам нь чимээ ихтэй
 * тул температур 0.1° хэлбэлзэхэд «+4%» гэж гарна. Тиймээс сүүлийн цэгээс 24
 * цагийн өмнөх цагт ХАМГИЙН ОЙР цэгийг суурь болгоно. Цуваа 24 цагаас богино
 * бол хамгийн эхний цэгийг авна (тэр үед `hours` нь бодит зөрүүг хэлнэ).
 */
function delta(m: MetricSeries): { pct: number; diff: number; hours: number } | null {
  const p = m.points;
  if (p.length < 2) return null;
  const last = p[p.length - 1];
  const want = last.t - 24 * 3_600_000;
  let base = p[0];
  for (const x of p) {
    if (Math.abs(x.t - want) < Math.abs(base.t - want)) base = x;
  }
  if (base.t === last.t || base.v === 0) return null;
  return {
    pct: ((last.v - base.v) / Math.abs(base.v)) * 100,
    diff: last.v - base.v,
    hours: (last.t - base.t) / 3_600_000,
  };
}

/** Хувийн өөрчлөлт → «+3.4%» / «−1.2%» (минус нь U+2212, зураас биш) */
const pctLabel = (pct: number) => `${pct >= 0 ? '+' : '−'}${num(Math.abs(pct), 1)}%`;

/**
 * 24 цагийн өөрчлөлтийн бичиглэл.
 *
 * ⚠️ ХУВИАР хэмжигддэг үзүүлэлтийн өөрчлөлтийг ДАХИН хувиар илэрхийлж
 * БОЛОХГҮЙ. Хогийн сав хоосон (1.8%) байгаад дүүрэхэд (96.9%) харьцангуй
 * өөрчлөлт нь «+5,212.7%» болно — тоо нь зөв ч утга нь ойлгомжгүй, суурь нь
 * тэгд ойртох тусам хязгааргүй тэсрэнэ. Тийм үзүүлэлтэд ХУВИЙН НЭГЖ (х.н.)
 * буюу энгийн ялгавар нь цорын ганц зөв хэмжүүр: «+95 х.н.».
 */
const deltaLabel = (m: MetricSeries, d: { pct: number; diff: number }) =>
  m.unit.startsWith('%')
    ? `${d.diff >= 0 ? '+' : '−'}${num(Math.abs(d.diff), 0)} ${tr('х.н.')}`
    : pctLabel(d.pct);

/**
 * ТААМГИЙН бичиглэл — «≈14 цагийн дараа 80%».
 *
 * ⚠️ «≈» тэмдэг ЗААВАЛ: энэ нь одоогийн хурдаар шугаман экстраполяци хийсэн
 * НӨХЦӨЛТ таамаг болохоос хэмжсэн баримт БИШ. Тэмдэггүй бол хэрэглэгч
 * хуваарь мэт уншиж, буруу төлөвлөнө.
 */
const etaLabel = (h: number): string =>
  h < 1 ? tr('≈{0} мин', Math.round(h * 60))
    : h < 48 ? tr('≈{0} цаг', Math.round(h))
      : tr('≈{0} хоног', Math.round(h / 24));

/** Цаг тутмын хурд — маш бага утгыг «тогтвортой» гэж уншина */
const rateLabel = (m: MetricSeries, perHour: number): string => {
  const a = Math.abs(perHour);
  if (a < 10 ** -(m.dp + 1)) return tr('тогтвортой');
  const sign = perHour > 0 ? '+' : '−';
  return `${sign}${num(a, Math.max(m.dp, 2))} ${m.unit}/${tr('ц')}`;
};

/*
 * ⚠️ 2026-08-25 (хэрэглэгчийн шийдвэр): газрын зурган дээрх мэдрэгчийн цэгийг
 * ОДООГИЙН ТӨЛВӨӨР будаж байсныг БУЦААВ — цэгүүд `services.ts`-ийн
 * `IOT_LAYERS`-д заасан давхарга тус бүрийн ТОГТМОЛ өнгөндөө үлдэнэ (2D, 3D
 * хоёуланд). Төлвийн мэдээлэл нь ЖАГСААЛТАД хэвээр: нүд бүрийн нас, өнгө
 * (`freshTone`), унасан/дүлий мэдрэгчийн сэрэмжлүүлэг, Telegram хянагч.
 */

type Card = { s: SensorLive; m: MetricSeries };

/**
 * ⚠️ `MapCanvas` нь memo() — render бүрд шинэ `() => {}` дамжуулбал memo эвдэрч,
 * минут тутмын цагийн tick (`setNow`) бүрд 3000+ мөрт компонент дэмий дахин
 * ажиллана. Тиймээс модулийн түвшний ТОГТВОРТОЙ noop (Irged.tsx-ийн загвар).
 */
const noop = () => {};

/* ══════════════════ Жижиг бүрэлдэхүүн ══════════════════ */


/** Дүрст мөр — тоо, баруун талдаа шошго */
function Tile({
  icon,
  label,
  value,
  pill,
  pillTint,
}: {
  icon: string;
  label: string;
  value: string;
  pill: string;
  pillTint: string;
}) {
  return (
    <div className={s.tile}>
      <span className={s.tileIcon}>
        <Icon name={icon} size={17} />
      </span>
      <span className={s.tileMain}>
        <span className={s.tileLabel}>{label}</span>
        <span className={`${s.tileVal} num`}>{value}</span>
      </span>
      <span className={s.pill} style={{ ['--tint' as string]: pillTint }}>
        {pill}
      </span>
    </div>
  );
}

/** Нэг үзүүлэлтийн агшны нүд */
function Cell({ c }: { c: Card }) {
  const has = c.m.latest != null;
  const d = delta(c.m);
  const age = ageOf(c.m.latestAt, useNow());
  return (
    <div className={s.metric}>
      <div className={s.metricHd}>
        <span className={s.metricDot} />
        {/* ⚠️ Нүд нь нарийн тул тайлбар нь ЗӨВХӨН hover-т багтана — нэрийг нь
            гурван цэгээр таслах үед бүтэн нэр ч энэ дотор л уншигдана. */}
        <span
          className={s.metricName}
          title={`${c.s.label} · ${c.m.label}${c.m.unit ? ` (${c.m.unit})` : ''}\n${c.m.note}`}
        >
          {c.m.label}
        </span>
        <span className={`${s.metricAge} num`} style={{ color: freshTone(age) }}>
          {freshLabel(age)}
        </span>
      </div>
      <div className={`${s.metricVal} num`}>
        {has ? num(c.m.latest ?? 0, c.m.dp) : '—'}
        {has && c.m.unit && <span className={s.metricUnit}>{c.m.unit}</span>}
      </div>
      <div className={`${s.metricFoot} num`}>
        <span>
          {has ? `${num(c.m.min ?? 0, c.m.dp)} … ${num(c.m.max ?? 0, c.m.dp)}` : tr('задарсан заалт алга')}
        </span>
        <span title={d ? tr('{0} цагийн өөрчлөлт', num(d.hours, 0)) : ''}>
          {d ? deltaLabel(c.m, d) : ''}
        </span>
      </div>
      {/* ⚠️ ТААМАГ зөвхөн БОСГОТОЙ, түүнд ОЙРТОЖ буй үзүүлэлтэд гарна —
          «хэзээ ч хүрэхгүй» тоо нь мөр эзлээд мэдээлэл өгөхгүй. */}
      {c.m.trend?.etaHours != null && c.m.alert && (
        <div className={s.metricEta} title={tr('Одоогийн хурд: {0}', rateLabel(c.m, c.m.trend.perHour))}>
          <Icon name="target" size={11} />
          {tr('{0} дараа {1}{2}', etaLabel(c.m.trend.etaHours), num(c.m.alert.value, c.m.dp), c.m.unit)}
        </div>
      )}
    </div>
  );
}

/** Хугацааны цуваа — нэг чарт нэг карт */
function ChartCard({ c, height = 150 }: { c: Card; height?: number }) {
  return (
    <section className={s.card}>
      <header className={s.cardHd}>
        {/* ⚠️ Нэгж нь ГАРЧИГТ — чартын тоон шошгод нэгж бичигддэггүй тул
            «Гадна орчны температур» нь °C үү, °F үү гэдэг өөр хаанаас ч
            уншигдахгүй.
            ⚠️ 2026-08-21: Толгойн доорх тайлбарын МӨР хасагдав (хүсэлт) — карт
            бүрд 2–3 мөр эзэлж, хажуугийн нарийн баганад чартын өндрийг иддэг
            байв. Агуулга нь АЛДАГДААГҮЙ: мэдрэгч, түүний тодорхойлолт, DevEUI,
            хэмжигдэхүүний утга бүгд доорх hover-т үлдэв. */}
        <h3
          className={s.cardTitle}
          title={`${c.s.label} · ${c.m.label}${c.m.unit ? ` (${c.m.unit})` : ''}\n${c.m.note}\n\n${c.s.note}\nDevEUI: ${c.s.devEui}`}
        >
          {c.m.label}{c.m.unit ? `, ${c.m.unit}` : ''}
        </h3>
        <span className={s.cardNote}>
          {num(c.m.points.length)} / {num(c.m.total)} {tr('цэг')}
        </span>
      </header>
      <div className={s.cardBody}>
        {/* Өнгө заахгүй — `Trend`-ийн анхдагч нь өгөгдлийн ГАНЦ өнгө var(--data) */}
        <Trend
          unit={c.m.unit}
          height={height}
          /* ⚠️ 2026-08-21: 90 цэгийг 320px картад шахахад муруй нь ялгагдахгүй
             шуугиан болж, тэнхлэгийн 6 шошго л үлддэг байв. Одоо 8 цэг харагдаж,
             үлдсэнийг нь хэвтээ гүйлгэнэ — цэг бүрийн огноо/цаг ч уншигдана. */
          visible={8}
          /* Цэг бүрийн заалтыг тоогоор бичнэ — 8 л зэрэг харагдах тул зай хүрнэ */
          showValues
          /* Босго нь `sensors.ts`-д хэмжигдэхүүн тус бүрд. Оноогоогүй бол
             (гэрэлтүүлэг, хуримтлагдсан тоолуур) шугам зурагдахгүй. */
          alert={c.m.alert}
          /* ⚠️ 2026-08-19: `note` тавихгүй. `Trend`-ийн тэнхлэгийн шошго нь
             `note ?? label` гэж уншдаг (Dashboard-д note нь ЖИНХЭНЭ огноо
             байдаг). Энд note-д УТГЫГ өгч байсан тул IoT-ийн график бүрийн
             хэвтээ тэнхлэг огнооны оронд «312 мм», «98 %» гэсэн утгын жагсаалт
             болдог байв. Утга нь Trend-ийн уншилтын мөр ба цэг бүрийн
             `aria-label`-д аль хэдийн бий. */
          points={c.m.points.map((p) => ({
            label: axisLabel(p.t),
            value: p.v,
          }))}
        />
      </div>
    </section>
  );
}

/* ══════════════════ Үндсэн харагдац ══════════════════ */

export function Iot({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /**
   * ДАХИН ТАТАХ тоолуур. `loadSensors` нь 5 минутын TTL-тэй кэштэй тул энэ нь
   * TTL дуусаагүй үед хуучин амлалтыг л буцаана — өөрөөр хэлбэл сүлжээ рүү
   * илүүдэл хүсэлт явахгүй, харин хуучирмагц шинэчилнэ.
   *
   * ⚠️ Таб нуугдсан үед тоолуур ЗОГСОНО: арын 10 таб бүгд IoT сервис рүү
   *    цохих нь утгагүй. Таб идэвхжихэд шууд нэг удаа шинэчилнэ.
   */
  /**
   * ХАРУУЛАХ ХУГАЦААНЫ ХҮРЭЭ. Анхдагч 7 хоног — 24 цаг нь хэт богино (хогийн
   * мэдрэгчийн decoder хэдэн өдрөөр хоцордог тул хоосон чарт гарах эрсдэлтэй),
   * 30 хоног нь эхний ачаалалд хэт хүнд.
   */
  const [range, setRange] = useState<RangeKey>('7d');
  const [tick, setTick] = useState(0);
  /** Зурагдах үеийн «одоо» — нас бүрийг үүн дээр бодно (дээрх `NowCtx`) */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const bump = () => {
      setNow(Date.now());
      if (!document.hidden) setTick((t) => t + 1);
    };
    // Нас нь минут тутам, дахин татах нь 5 минут тутам (TTL-тэй ижил)
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    const poll = setInterval(bump, 5 * 60_000);
    const onShow = () => { if (!document.hidden) bump(); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);

  const q = useAsync(() => loadSensors(range), [tick, range]);
  /**
   * Мэдрэгчийн 5 давхарга нь СУУРЬ; каталогоос порталын аль ч давхаргыг дээр
   * нь нэмнэ (`useLayerPicks`) — урьд нь энэ цонхонд каталог огт байхгүй байв.
   */
  const [visible, setVisible] = useLayerPicks(VIEW_BY_KEY.iot.initial);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  useZoomToFilter({ zone });

  return (
    <NowCtx.Provider value={now}>
    <div className={s.wrap}>
      {/**
       * ⚠️ Газрын зураг нь `Data`-аас ГАДНА — мэдрэгчийн заалт татагдахыг хүлээхгүй
       * шууд зурагдана. Байрлал нь ИЛ (`grid-row: 2`) тул DOM дараалал нөлөөлөхгүй.
       */}
      <section className={`${s.card} ${s.mapCard} ${s.pMap}`}>
        <div className={s.mapBar}>
          <span className={s.mapTitle}>
            <Icon name="radio" size={14} /> {tr('Мэдрэгчийн байршил')}
          </span>
        </div>
        <div className={s.mapBox}>
          <MapCanvas
            dim={dim}
            visible={visible}
            opacity={opacity}
            zone={zone}
            uniform
            onPick={noop}
          />

          {/* ⚠️ 2026-08-20: Урьд нь ЗӨВХӨН «2D | 3D» байсан — Давхарга, Тунгалаг,
              Бүс алга, BIM нь бүр огт байхгүй байв. Одоо бусад харагдацтай яг
              ижил нэгдсэн зурвас (`MapTools`) бөгөөд мэдрэгчийн цэгүүд дээр
              порталын аль ч давхаргыг контекст болгон нэмнэ. */}
          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={catOpen}
            onLayers={() => setCatOpen((v) => !v)}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          />

          {catOpen && (
            <div className={o.catPanel}>
              <LayerCatalog
                view="iot"
                totals={catTotals}
                visible={visible}
                setVisible={setVisible}
                selected={layerSel}
                onSelect={setLayerSel}
                onClose={() => setCatOpen(false)}
                zone={zone}
                embedded
              />
            </div>
          )}

          {opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}
        </div>
      </section>

      <Data q={q} loading={tr('Мэдрэгчийн заалт уншиж байна…')}>
        {(all) => <Board all={all} range={range} setRange={setRange} />}
      </Data>
    </div>
    </NowCtx.Provider>
  );
}

function Board({ all, range, setRange }: {
  all: SensorLive[]; range: RangeKey; setRange: (r: RangeKey) => void;
}) {
  const cards: Card[] = all.flatMap((sn) => sn.series.map((m) => ({ s: sn, m })));
  /** Сервис нь ӨӨРӨӨ унасан мэдрэгч — decoder-ийн хоцролтоос ТУСДАА тоологдоно */
  const failed = all.filter((x) => x.error);
  const live = all.filter((x) => x.lastAt != null);
  const total = sumBy(all, (x) => x.n);

  /**
   * Цувааг зургийн ХОЁР ТАЛД агуулгаар нь хуваана (2026-08-21, хүсэлт).
   *
   * ⚠️ Үзүүлэлтийг ХАСАХГҮЙ — БҮГД чарттай. Урьд нь эхний «hero» үзүүлэлтийг
   * хасдаг байсан (тэр нь зургийн доорх ТОМ цуваанд тусад нь гардаг байв);
   * тэр карт 2026-08-21-нд хасагдахад хасалтыг нь ч зэрэг авсан — эс бөгөөс
   * уг үзүүлэлтийн түүх хаанаас ч харагдахгүй болно.
   *
   * ⚠️ Хуваалт нь МЭДРЭГЧЭЭР — үзүүлэлтийн нэрээр БИШ. Нэрээр хуваавал нэг
   * мэдрэгчийн заалтууд («Гадна орчны температур» ба «Гадна орчны чийгшил»)
   * хоёр тийш салж, харьцуулах гэсэн хүн дэлгэц дамжуулан харах болно.
   *
   * ЗҮҮН — газар, орчны хэмжилт (хөрс + гэрэл).
   * БАРУУН — агаар ба нийтийн үйлчилгээний тоолуур (агаар + хог + ус).
   */
  const LEFT_SENSORS = new Set(['soil', 'light']);
  const plotted = cards.filter((c) => c.m.points.length >= 2);
  const chartsL = plotted.filter((c) => LEFT_SENSORS.has(c.s.key));
  const chartsR = plotted.filter((c) => !LEFT_SENSORS.has(c.s.key));

  return (
    <>
      {/* ── Бүх үзүүлэлт — агшны утга ── */}
      <section className={`${s.card} ${s.pCells}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Бүх үзүүлэлт')}</h3>
          {/* ⚠️ Хүрээ нь ЧАРТ ба доод/дээд/дундажид үйлчилнэ — «сүүлийн утга»
              нь хүрээнээс үл хамааран ҮРГЭЛЖ хамгийн сүүлийн заалт. */}
          <span className={s.rangeBar} role="group" aria-label={tr('Хугацааны хүрээ')}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                className={`${s.rangeBtn} ${range === r.key ? s.rangeBtnOn : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </span>
        </header>
        <div className={s.cardBody}>
          <div className={s.grid}>
            {/* ⚠️ 2026-08-21: «Мэдрэгч» хайрцаг зургийн дээрх тусдаа мөрөөс
                ЭНД, сүлжээний ХАМГИЙН ЭХЭНД шилжив (захиалагчийн хүсэлт). */}
            <Tile
              icon="radio"
              label={tr('Мэдрэгч')}
              value={tr('{0} ш', num(all.length))}
              pill={tr('{0} идэвхтэй', num(live.length))}
              pillTint={live.length === all.length ? 'var(--good-ink)' : 'var(--warn-ink)'}
            />
            {cards.map((c) => (
              <Cell key={`${c.s.key}-${c.m.key}`} c={c} />
            ))}
          </div>
          {/* ⚠️ 2026-08-21: «Сүүлийн заалт» карт хасагдсан ч ДОТОРХ ХОЁР
              СЭРЭМЖЛҮҮЛГИЙГ энд авчрав. Эдгээргүй бол унасан үйлчилгээ ба
              задраагүй заалт нь ялгагдалгүй, чимээгүй хоосон нүд болж харагдана. */}
          {failed.length > 0 && (
            <>
              <Note>
                <b>{failed.length}</b> {tr('мэдрэгчийн үйлчилгээ татагдсангүй — доорх алдааг үзнэ үү. Энэ нь decoder-ийн хоцролт БИШ, хүсэлт өөрөө амжилтгүй болсон.')}
              </Note>
              {/* ⚠️ Дээрх «доорх алдааг үзнэ үү» амлалтын БИЕЛЭЛ. Мэдрэгч бүрийн
                  алдааны жагсаалт 2026-08-21-нд «Сүүлийн заалт» карттай ХАМТ
                  устсан тул аль мэдрэгч ямар шалтгаанаар унасан нь хаана ч
                  харагдахгүй болсон байв — унасан мэдрэгчийн series хоосон тул
                  дээрх сүлжээнээс нүд нь ч бүрмөсөн алга болдог. Хуучин загварын
                  (9e884e9) дагуу алдааг улаанаар, мэдрэгч бүрд нэг мөрөөр гаргана. */}
              {failed.map((x) => (
                <Note key={x.key}>
                  <b>{x.label}</b>:{' '}
                  <span style={{ color: 'var(--bad-ink)' }}>{x.error}</span>
                </Note>
              ))}
            </>
          )}
          {live.length + failed.length < all.length && (
            <Note>
              <b>{all.length - live.length - failed.length}</b> {tr('мэдрэгчээс задарсан утга ирээгүй. Холбоо тасраагүй — түүхий өгөгдөл ирж байгаа ч Mononet-ийн decoder утгыг задлаагүй байна.')}
            </Note>
          )}
        </div>
      </section>


      {/* ⚠️ Зургийн ДООР байсан гурван карт ХАСАГДСАН (захиалагчийн хүсэлт,
          2026-08-21): «Сав хүртэлх зай» цуваа (`pTrend`), «Заалтын шинэлэг
          байдал» цагираг (`pDonut`), «Идэвхтэй мэдрэгч» бөгж (`pRing`).
          Тэдгээрийн grid-ийн мөр бүхэлдээ хоосорсон тул `iot.module.css`-д
          мөрийн дугаарыг ч дагуулж зассан. */}

      {/* ── ЗҮҮН ЦУВАА — хөрс ба орчны гэрэл ── */}
      <div className={`${s.chartCol} ${s.pChartsL}`}>
        {chartsL.map((c) => (
          <ChartCard key={`${c.s.key}-${c.m.key}`} c={c} />
        ))}
      </div>

      {/* ── БАРУУН БАГАНА — бүртгэлийн диаграм ба агаар/үйлчилгээний цуваа ──
          ⚠️ Хоёулаа НЭГ блокод, grid-ийн хоёр мөрийг дамжина. Тусад нь тавибал
          баганан диаграм нь мөр 1-ийг өөрийн өндрөөр сунгаж, зүүн талд
          индикаторын доор хоосон зай үлдээдэг байв (зураг тэр зайгаар
          доошилно). */}
      <div className={s.pRight}>
        <section className={`${s.card} ${s.pBars}`}>
          <header className={s.cardHd}>
            <h3 className={s.cardTitle}>{tr('Бүртгэл үзүүлэлтээр')}</h3>
            <span className={s.cardNote}>{tr('нийт')} {num(total)}</span>
          </header>
          <div className={s.cardBody}>
            {/**
              * ⚠️ МЭДРЭГЧЭЭР биш, ҮЗҮҮЛЭЛТ ТУС БҮРЭЭР. Хоёр шалтгаан:
              * (а) 5 мэдрэгчийн багана нь картын гуравны нэгийг л эзэлж, доод талд
              *     нь хоосон зай үлдээдэг;
              * (б) decoder нь ТАЛБАР ТУС БҮРД өөрөөр унтардаг тул мэдрэгчийн нийлбэр
              *     нь аль талбар дутуу ирснийг НУУНА (усны тоолуур: 287 мөрөөс
              *     заалттай нь ердөө 11; хогийн мэдрэгч: 10,427-оос 1,647).
              */}
            {/* Мөр бүрийн өнгө заахгүй — `Bars`-ын анхдагч нь var(--data), ялгаа нь эрэмбээр */}
            <Bars
              items={cards.map((c) => ({
                key: `${c.s.key}-${c.m.key}`,
                label: c.m.label,
                value: c.m.total,
              }))}
            />
          </div>
        </section>

        <div className={`${s.chartCol} ${s.pChartsR}`}>
          {chartsR.map((c) => (
            <ChartCard key={`${c.s.key}-${c.m.key}`} c={c} />
          ))}
        </div>
      </div>


    </>
  );
}

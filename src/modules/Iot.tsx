'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { Data, Trend, Note, friendlyError } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';

import { useAsync } from '@/lib/useAsync';
import {
  loadSensors, RANGES, SENSOR_STALE_H, withGaps, type RangeKey, type SensorLive, type MetricSeries,
  UB_OFFSET_MS,
} from '@/lib/sensors';
import { num } from '@/lib/format';
import { VIEW_BY_KEY } from '@/lib/services';
import s from './iot.module.css';
import o from './iotOv.module.css';

/**
 * IoT ХЯНАЛТ — Mononet-ээс ингест хийгддэг таван мэдрэгч.
 *
 * 1. ХУУЧИРСАН ЗААЛТ. Түүхий мөр тогтмол ирж байгаа ч Mononet-ийн decoder
 *    тогтворгүй тул ЗАДАРСАН утга нь хэдэн өдрөөр хоцорч болно. (Задарсан
 *    заалтын бодит алхам: дөрвөн мэдрэгчид ≈60 мин, усны тоолуурт ≈6 цаг —
 *    2026-08-26-нд амьд хэмжсэн.)
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
 * Насаар өнгө — 2 цаг хүртэл шинэ, `SENSOR_STALE_H` (24, 2026-10-04 — урьд нь 48) хүртэл анхаарах,
 * цаашид хуучирсан (CEO самбарын `IOT_STALE_H`-тэй нэг).
 */
const freshTone = (h: number | null): string => {
  if (h == null) return 'var(--ink-3)';
  if (h <= 2) return 'var(--good-ink)';
  if (h <= SENSOR_STALE_H) return 'var(--warn-ink)';
  return 'var(--bad-ink)';
};

/** `Trend` нь `label`-ыг ШУУД хэвлэдэг тул богино байлгана */
const axisLabel = (t: number): string => {
  const d = new Date(t + UB_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};


/**
 * ТААМГИЙН бичиглэл — «≈14 цагийн дараа 80%».
 */
const etaLabel = (h: number): string =>
  h <= 0 ? tr('≈одоо')
    : h < 1 ? tr('≈{0} мин', Math.round(h * 60))
    : h < 48 ? tr('≈{0} цаг', Math.round(h))
      : tr('≈{0} хоног', Math.round(h / 24));

/** Цаг тутмын хурд — маш бага утгыг «тогтвортой» гэж уншина */
const rateLabel = (m: MetricSeries, perHour: number): string => {
  const a = Math.abs(perHour);
  if (a < 10 ** -(m.dp + 1)) return tr('тогтвортой');
  const sign = perHour > 0 ? '+' : '−';
  return `${sign}${num(a, Math.max(m.dp, 2))} ${m.unit}/${tr('ц')}`;
};


type Card = { s: SensorLive; m: MetricSeries };


/* ══════════════════ Жижиг бүрэлдэхүүн ══════════════════ */


/** Нэг үзүүлэлтийн агшны нүд */
function Cell({ c }: { c: Card }) {
  const has = c.m.latest != null;
  const age = ageOf(c.m.latestAt, useNow());
  return (
    <div className={s.metric}>
      <span
        className={s.metricName}
        title={`${c.s.label} · ${c.m.label}${c.m.unit ? ` (${c.m.unit})` : ''}\n${c.m.note}`}
      >
        <span className={s.metricDot} />
        {c.m.label}
      </span>
      <span className={`${s.metricVal} num`}>
        {has ? num(c.m.latest ?? 0, c.m.dp) : '—'}
        {has && c.m.unit && <span className={s.metricUnit}>{c.m.unit}</span>}
      </span>
      {c.m.fault && (
        <span className={`${s.metricAge} num`} style={{ color: 'var(--bad-ink)' }}
          title={c.m.faultNote ?? tr('боломжгүй утга — мэдрэгчийн гэмтэл')}>
          {c.m.faultNote ?? tr('мэдрэгчийн гэмтэл')}
        </span>
      )}
      {/* Нас — мөрийн ТӨГСГӨЛД. Өнгө нь шинэлэг байдлыг заана (ногоон/шар/улаан). */}
      <span className={`${s.metricAge} num`} style={{ color: freshTone(age) }}>
        {freshLabel(age)}
      </span>
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
  const trendPts = useMemo(
    () => withGaps(c.m.points).map((p) => ({ label: axisLabel(p.t), value: p.v })),
    [c.m.points],
  );
  return (
    <section className={s.card}>
      <header className={s.cardHd}>
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
          visible={8}
          /* Цэг бүрийн заалтыг тоогоор бичнэ — 8 л зэрэг харагдах тул зай хүрнэ */
          showValues
          /* Босго нь `sensors.ts`-д хэмжигдэхүүн тус бүрд. Оноогоогүй бол
             (гэрэлтүүлэг, хуримтлагдсан тоолуур) шугам зурагдахгүй. */
          alert={c.m.alert}
          points={trendPts}
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

  const q = useAsync(() => loadSensors(range), [tick, range], { keepOn: [tick] });
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
  useZoomToFilter({ zone });

  return (
    <NowCtx.Provider value={now}>
    <div className={s.wrap}>
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
          />

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
  const cards: Card[] = useMemo(() => all.flatMap((sn) => sn.series.map((m) => ({ s: sn, m }))), [all]);
  /** Сервис нь ӨӨРӨӨ унасан мэдрэгч — decoder-ийн хоцролтоос ТУСДАА тоологдоно */
  const failed = useMemo(() => all.filter((x) => x.error), [all]);
  const live = useMemo(() => all.filter((x) => x.lastAt != null), [all]);

  /**
   * Цувааг зургийн ХОЁР ТАЛД агуулгаар нь хуваана (2026-08-21, хүсэлт).
   *
   * ЗҮҮН — газар, орчны хэмжилт (хөрс + гэрэл).
   * БАРУУН — агаар ба нийтийн үйлчилгээний тоолуур (агаар + хог + ус).
   */
  const [chartsL, chartsR] = useMemo(() => {
    const LEFT_SENSORS = new Set(['soil', 'light']);
    const plotted = cards.filter((c) => c.m.points.length >= 2);
    return [
      plotted.filter((c) => LEFT_SENSORS.has(c.s.key)),
      plotted.filter((c) => !LEFT_SENSORS.has(c.s.key)),
    ];
  }, [cards]);

  return (
    <>
      {/* ── Бүх үзүүлэлт — агшны утга ── */}
      <section className={`${s.card} ${s.pCells}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Бүх үзүүлэлт')}</h3>
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
            {cards.map((c) => (
              <Cell key={`${c.s.key}-${c.m.key}`} c={c} />
            ))}
          </div>
          {failed.length > 0 && (
            <>
              <Note>
                {tr('{0} мэдрэгчийн өгөгдөл татагдсангүй.', num(failed.length))}
                {(() => {
                  const why = [...new Set(failed.map((x) => friendlyError(x.error)))];
                  return why.length === 1 ? <> {why[0]}</> : null;
                })()}
              </Note>
              <details>
                <summary>{tr('Дэлгэрэнгүй')}</summary>
              {failed.map((x) => (
                <Note key={x.key}>
                  <b>{x.label}</b>:{' '}
                  <span style={{ color: 'var(--bad-ink)' }}>{x.error}</span>
                </Note>
              ))}
              </details>
            </>
          )}
          {live.length + failed.length < all.length && (
            <Note>
              {tr('{0} мэдрэгчээс шинэ утга ирээгүй байна. Мэдрэгч холбогдсон — утга боловсруулагдахыг хүлээж байна.', num(all.length - live.length - failed.length))}
            </Note>
          )}
        </div>
      </section>



      {/* ── ЗҮҮН ЦУВАА — хөрс ба орчны гэрэл ── */}
      <div className={`${s.chartCol} ${s.pChartsL}`}>
        {chartsL.map((c) => (
          <ChartCard key={`${c.s.key}-${c.m.key}`} c={c} />
        ))}
      </div>

      {/* ── БАРУУН БАГАНА — бүртгэлийн диаграм ба агаар/үйлчилгээний цуваа ── */}
      <div className={s.pRight}>
        <div className={`${s.chartCol} ${s.pChartsR}`}>
          {chartsR.map((c) => (
            <ChartCard key={`${c.s.key}-${c.m.key}`} c={c} />
          ))}
        </div>
      </div>


    </>
  );
}

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { Data, Empty, Trend, Rows, Note, Bars, Donut, Ring, SubHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAsync } from '@/lib/useAsync';
import { loadSensors, type SensorLive, type MetricSeries } from '@/lib/sensors';
import { num } from '@/lib/format';
import { sumBy } from '@/lib/agg';
import { VIEW_BY_KEY } from '@/lib/services';
import s from './iot.module.css';

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

/** epoch ms → «2026-08-13 19:46» (орон нутгийн бүсээр) */
const stamp = (t: number | null): string => {
  if (t == null) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
function delta(m: MetricSeries): { pct: number; hours: number } | null {
  const p = m.points;
  if (p.length < 2) return null;
  const last = p[p.length - 1];
  const want = last.t - 24 * 3_600_000;
  let base = p[0];
  for (const x of p) {
    if (Math.abs(x.t - want) < Math.abs(base.t - want)) base = x;
  }
  if (base.t === last.t || base.v === 0) return null;
  return { pct: ((last.v - base.v) / Math.abs(base.v)) * 100, hours: (last.t - base.t) / 3_600_000 };
}

/** Утга нь ямар төрлийнх болохыг заасан дүрс */
const ICONS: Record<string, string> = {
  distance: 'trash',
  battery: 'bolt',
  batteryVoltage: 'bolt',
  moisture: 'droplet',
  humidity: 'droplet',
  temperature: 'flame',
  electricity: 'bolt',
  illumination: 'sun',
  meterReading: 'waves',
};
const iconOf = (m: MetricSeries) => ICONS[m.key] ?? 'radio';

/** Хувийн өөрчлөлт → «+3.4%» / «−1.2%» (минус нь U+2212, зураас биш) */
const pctLabel = (pct: number) => `${pct >= 0 ? '+' : '−'}${num(Math.abs(pct), 1)}%`;

type Card = { s: SensorLive; m: MetricSeries };

/* ══════════════════ Жижиг бүрэлдэхүүн ══════════════════ */

/**
 * Толгой хавтангийн жижиг хандлага. `Trend`-ийг ХЭРЭГЛЭХГҮЙ: тэр нь тэнхлэгийн
 * шошго, торлол, тайлбар зурдаг тул 34px өндөрт уншигдахгүй болно. Энэ нь зөвхөн
 * хэлбэрийг харуулах — тоог доор нь ил бичсэн тул давхар уншилт үүсэхгүй.
 *
 * ⚠️ Хамгийн ихдээ 48 цэг: 34px өндөрт илүү нягт зураас шуугиан болно.
 */
function Spark({ points }: { points: { t: number; v: number }[] }) {
  if (points.length < 2) return null;
  const step = Math.max(1, Math.ceil(points.length / 48));
  const p = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const vs = p.map((x) => x.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  // Тогтмол утгатай цуваа — 0-д хуваахаас сэргийлж дунджаар нь шулуун татна
  const span = hi - lo || 1;
  const W = 100;
  const H = 30;
  const xy = p.map((x, i) => [(i / (p.length - 1)) * W, H - ((x.v - lo) / span) * (H - 4) - 2] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const last = xy[xy.length - 1];
  return (
    <svg className={s.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className={s.sparkArea} d={`${line} L${W} ${H} L0 ${H} Z`} />
      <path className={s.sparkLine} d={line} vectorEffect="non-scaling-stroke" />
      <circle className={s.sparkDot} cx={last[0]} cy={last[1]} r={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Тэргүүлэх индикатор карт — хамгийн чухал хоёр заалт.
 * envhub хэв: гадаргуу + hairline + eyebrow + том num + спарклайн var(--data).
 */
function Hero({ c }: { c: Card }) {
  const d = delta(c.m);
  const has = c.m.latest != null;
  const now = useNow();
  return (
    <div className={s.hero}>
      <div className={s.heroTop}>
        <span className={s.heroLabel}>{c.m.label}</span>
        <span className={s.heroIcon}>
          <Icon name={iconOf(c.m)} size={15} />
        </span>
      </div>
      <div>
        <div className={`${s.heroVal} num`}>
          {has ? num(c.m.latest ?? 0, c.m.dp) : '—'}
          {has && c.m.unit && <span className={s.heroUnit}>{c.m.unit}</span>}
        </div>
        <Spark points={c.m.points} />
        <div className={s.heroSub}>
          {c.s.label} · {freshLabel(ageOf(c.m.latestAt, now))}
          {d && tr(' · {0} / {1}ц', pctLabel(d.pct), Math.round(d.hours))}
        </div>
      </div>
    </div>
  );
}

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
        <span className={s.metricName} title={`${c.s.label} · ${c.m.label}`}>
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
        <span>{d ? pctLabel(d.pct) : ''}</span>
      </div>
    </div>
  );
}

/** Хугацааны цуваа — нэг чарт нэг карт */
function ChartCard({ c, height = 150 }: { c: Card; height?: number }) {
  return (
    <section className={s.card}>
      <header className={s.cardHd}>
        <h3 className={s.cardTitle}>{c.m.label}</h3>
        <span className={s.cardNote}>
          {c.s.label} · {num(c.m.points.length)} / {num(c.m.total)} {tr('цэг')}
        </span>
      </header>
      <div className={s.cardBody}>
        {/* Өнгө заахгүй — `Trend`-ийн анхдагч нь өгөгдлийн ГАНЦ өнгө var(--data) */}
        <Trend
          unit={c.m.unit}
          height={height}
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

  const q = useAsync(loadSensors, [tick]);
  const visible = VIEW_BY_KEY.iot.initial;

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
          <div className={s.dims} role="group" aria-label={tr('Газрын зургийн харагдац')}>
            {(['2d', '3d'] as Dim[]).map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={dim === x}
                className={`${s.dimBtn} ${dim === x ? s.dimOn : ''}`}
                onClick={() => setDim(x)}
              >
                {x.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className={s.mapBox}>
          <MapCanvas dim={dim} visible={visible} zone={null} uniform onPick={() => {}} />
        </div>
      </section>

      <Data q={q} loading={tr('Мэдрэгчийн заалт уншиж байна…')}>
        {(all) => <Board all={all} />}
      </Data>
    </div>
    </NowCtx.Provider>
  );
}

function Board({ all }: { all: SensorLive[] }) {
  const now = useNow();
  const cards: Card[] = all.flatMap((sn) => sn.series.map((m) => ({ s: sn, m })));
  /** Сервис нь ӨӨРӨӨ унасан мэдрэгч — decoder-ийн хоцролтоос ТУСДАА тоологдоно */
  const failed = all.filter((x) => x.error);
  const withData = cards.filter((c) => c.m.points.length > 0);
  const live = all.filter((x) => x.lastAt != null);
  const total = sumBy(all, (x) => x.n);

  /**
   * ⚠️ Толгой хавтанд ЗААЛТТАЙ үзүүлэлт л гарна. Тогтмол «агаарын температур»
   * гэж хатуу сонговол decoder тэр талбарыг задлаагүй өдөр хоёр том хавтан «—»
   * харуулж, дашбоардын хамгийн тод хэсэг хоосон болдог.
   */
  const heroes = withData.slice(0, 2);
  /**
   * ⚠️ Зөвхөн ЭХНИЙ толгойг хасна. Хоёр дахь толгой хавтан нь спарклайнтай ч
   * БҮТЭН цуваагүй үлдэж, тэр үзүүлэлтийн түүх хаанаас ч харагдахгүй болдог байв
   * (эхнийх нь доорх том чартад гарна, хоёр дахь нь хаана ч гарахгүй).
   */
  const rest = cards.filter((c) => c !== heroes[0]);

  // Шинэлэг байдлын хуваарилалт — цагирагт
  const bucket = { fresh: 0, warn: 0, stale: 0, none: 0 };
  for (const c of cards) {
    const h = ageOf(c.m.latestAt, now);
    if (h == null) bucket.none++;
    else if (h <= 2) bucket.fresh++;
    else if (h <= 48) bucket.warn++;
    else bucket.stale++;
  }
  const freshItems = [
    { key: 'fresh', label: tr('2 цагаас шинэ'), value: bucket.fresh, color: 'var(--good)' },
    { key: 'warn', label: tr('2–48 цаг'), value: bucket.warn, color: 'var(--warn)' },
    { key: 'stale', label: tr('48 цагаас хуучин'), value: bucket.stale, color: 'var(--bad)' },
    { key: 'none', label: tr('заалт алга'), value: bucket.none, color: 'var(--ink-3)' },
  ].filter((x) => x.value > 0);

  const livePct = all.length ? (live.length / all.length) * 100 : null;
  const freshest = cards.reduce<number | null>(
    (acc, c) => { const h = ageOf(c.m.latestAt, now); return h != null && (acc == null || h < acc) ? h : acc; },
    null,
  );

  return (
    <>
      {heroes[0] && (
        <div className={s.pHeroA}>
          <Hero c={heroes[0]} />
        </div>
      )}
      {heroes[1] && (
        <div className={s.pHeroB}>
          <Hero c={heroes[1]} />
        </div>
      )}

      <div className={s.pTiles}>
        <Tile
          icon="radio"
          label={tr('Мэдрэгч')}
          value={tr('{0} ш', num(all.length))}
          pill={tr('{0} идэвхтэй', num(live.length))}
          pillTint={live.length === all.length ? 'var(--good-ink)' : 'var(--warn-ink)'}
        />
        <Tile
          icon="chart"
          label={tr('Нийт бүртгэл')}
          value={num(total)}
          pill={freshLabel(freshest)}
          pillTint={freshTone(freshest)}
        />
      </div>

      {/* ── Сүүлийн заалт — газрын зургийн хажууд ── */}
      <section className={`${s.card} ${s.pList}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Сүүлийн заалт')}</h3>
          <span className={s.cardNote}>{tr('15 мин тутам')}</span>
        </header>
        <div className={s.cardBody}>
          <Rows
            items={all.map((x) => ({
              key: x.label,
              value: (
                /* ⚠️ 2026-08-19: СЕРВИСИЙН АЛДААГ ил гаргана. Урьд нь `x.error`-ыг
                   хаана ч уншдаггүй байсан тул үйлчилгээ унасан мэдрэгч «заалт
                   алга» гэж decoder-ийн хоцролттой ЯГ адилхан харагдаж, доорх
                   тайлбар нь «Холбоо тасраагүй» гэж ХУДАЛ баталгаа өгдөг байв. */
                <span style={{ color: x.error ? 'var(--bad-ink)' : freshTone(ageOf(x.lastAt, now)) }}>
                  {x.error
                    ? tr('татагдсангүй — {0}', x.error)
                    : x.lastAt == null
                      ? tr('заалт алга')
                      : `${stamp(x.lastAt)} · ${freshLabel(ageOf(x.lastAt, now))}`}
                </span>
              ),
            }))}
          />
          {/**
            * ⚠️ 2026-08-19: Тайлбарыг ХОЁР ТУСДАА шалтгаанд салгав. Урьд нь заалт
            * ирээгүй БҮХ мэдрэгчийг «Холбоо тасраагүй — decoder задлаагүй» гэж
            * НЭГ мөрөөр тайлбарладаг байв. Гэтэл сервис нь өөрөө унасан үед тэр
            * өгүүлбэр нь ХУДАЛ баталгаа: юу ч ирээгүй, decoder ч буруугүй.
            */}
          {failed.length > 0 && (
            <Note>
              <b>{failed.length}</b> {tr('мэдрэгчийн үйлчилгээ татагдсангүй — доорх алдааг үзнэ үү. Энэ нь decoder-ийн хоцролт БИШ, хүсэлт өөрөө амжилтгүй болсон.')}
            </Note>
          )}
          {live.length + failed.length < all.length && (
            <Note>
              <b>{all.length - live.length - failed.length}</b> {tr('мэдрэгчээс задарсан утга ирээгүй. Холбоо тасраагүй — түүхий өгөгдөл ирж байгаа ч Mononet-ийн decoder утгыг задлаагүй байна.')}
            </Note>
          )}
          {/**
            * ⚠️ Мэдрэгчийн нас нь ҮЗҮҮЛЭЛТИЙН насыг НУУНА: нэг мэдрэгчийн хоёр талбар
            * тэс өөр хугацаанд ирж болно (батерей 31 мин, зай 5 хоног — `sensors.ts`).
            * Дээрх жагсаалт нь мэдрэгч тус бүрийн ХАМГИЙН ШИНЭ заалтыг харуулдаг тул
            * хоцорсон талбар харагдахгүй өнгөрдөг. Тиймээс задаргааг нь доор нэмэв.
            */}
          <SubHead>{tr('Үзүүлэлт тус бүрээр')}</SubHead>
          <Rows
            items={cards.map((c) => ({
              key: c.m.label,
              value: (
                <span style={{ color: freshTone(ageOf(c.m.latestAt, now)) }}>{freshLabel(ageOf(c.m.latestAt, now))}</span>
              ),
            }))}
          />
        </div>
        <div className={s.cardFoot}>
          <span>{tr('Сүүлд шинэчлэгдсэн')}</span>
          <span className="num" style={{ color: freshTone(freshest) }}>
            {freshLabel(freshest)}
          </span>
        </div>
      </section>

      {/* ── Үндсэн цуваа ── */}
      {heroes[0] ? (
        <div className={s.pTrend}>
          <ChartCard c={heroes[0]} height={176} />
        </div>
      ) : (
        <section className={`${s.card} ${s.pTrend}`}>
          <div className={s.cardBody}>
            <Empty label={tr('Цуваа зурах заалт алга')} icon="chart" />
          </div>
        </section>
      )}

      {/* ── Шинэлэг байдал — цагираг ── */}
      <section className={`${s.card} ${s.pDonut}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Заалтын шинэлэг байдал')}</h3>
          <span className={s.cardNote}>{num(cards.length)} {tr('үзүүлэлт')}</span>
        </header>
        <div className={s.cardBody}>
          {freshItems.length ? (
            <>
              <Donut items={freshItems} size={150} width={22} centerLabel={tr('үзүүлэлт')} />
              <div className={s.legend}>
                {freshItems.map((x) => (
                  <span key={x.key} className={s.legendRow} style={{ ['--tint' as string]: x.color }}>
                    <span className={s.legendBullet} />
                    <span className={s.legendName}>{x.label}</span>
                    <span className={`${s.legendPct} num`}>{num((x.value / cards.length) * 100, 0)}%</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <Empty label={tr('Үзүүлэлт алга')} icon="chart" />
          )}
        </div>
      </section>

      {/* ── Идэвхтэй мэдрэгчийн хувь — бөгж ── */}
      <section className={`${s.card} ${s.pRing}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Идэвхтэй мэдрэгч')}</h3>
          <span className={s.cardNote}>
            {num(live.length)} / {num(all.length)}
          </span>
        </header>
        <div className={s.cardBody}>
          <div className={s.ringWrap}>
            <Ring
              value={livePct}
              size={202}
              width={18}
              color={livePct === 100 ? 'var(--good)' : 'var(--warn)'}
              label={tr('заалт ирсэн')}
              decimals={0}
            />
          </div>
        </div>
        {/**
          * ⚠️ Доод мөр НЭГ мөр байсныг ХОЁР нүд болгов: бөгж (132px) нь хажуугийн
          * чартын карт тогтоосон 332px мөрийг дүүргэдэггүй тул доор нь ~110px хоосон
          * зай үлддэг байв. Бөгжийг 162px болгож, задаргааг нүд болгон дүүргэв.
          */}
        <div className={s.split}>
          <span className={s.splitCell}>
            <span className={s.splitLabel}>{tr('Идэвхтэй')}</span>
            <span className={`${s.splitVal} num`} style={{ color: 'var(--good-ink)' }}>
              {num(live.length)}
            </span>
          </span>
          <span className={s.splitCell}>
            <span className={s.splitLabel}>{tr('Дүлий')}</span>
            <span
              className={`${s.splitVal} num`}
              style={{ color: all.length === live.length ? 'var(--ink-3)' : 'var(--bad-ink)' }}
            >
              {num(all.length - live.length)}
            </span>
          </span>
        </div>
      </section>

      {/* ── Бүх үзүүлэлт — агшны утга ── */}
      <section className={`${s.card} ${s.pCells}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Бүх үзүүлэлт')}</h3>
          <span className={s.cardNote}>{tr('сүүлийн утга · доод…дээд · 24ц өөрчлөлт')}</span>
        </header>
        <div className={s.cardBody}>
          <div className={s.grid}>
            {cards.map((c) => (
              <Cell key={`${c.s.key}-${c.m.key}`} c={c} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Мэдрэгч тус бүрийн бүртгэл ── */}
      <section className={`${s.card} ${s.pBars}`}>
        <header className={s.cardHd}>
          <h3 className={s.cardTitle}>{tr('Бүртгэл үзүүлэлтээр')}</h3>
          <span className={s.cardNote}>{tr('нийт')} {num(total)}</span>
        </header>
        <div className={s.cardBody}>
          {/**
            * ⚠️ Урьд нь 5 МЭДРЭГЧЭЭР харуулдаг байсныг 10 ҮЗҮҮЛЭЛТ болгов. Хоёр шалтгаан:
            * (а) 5 багана нь 470px картын гуравны нэгийг л эзэлж, 268px хоосон үлдээдэг;
            * (б) decoder нь ТАЛБАР ТУС БҮРД өөрөөр унтардаг тул мэдрэгчийн нийлбэр нь
            *     аль талбар дутуу ирснийг НУУНА (нэг мэдрэгчийн зай 1,642, батерей 1,725).
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

      {/* ── Үлдсэн үзүүлэлтийн цуваа ── */}
      <div className={s.pCharts}>
        <div className={s.chartGrid}>
          {rest
            .filter((c) => c.m.points.length >= 2)
            .map((c) => (
              <ChartCard key={`${c.s.key}-${c.m.key}`} c={c} />
            ))}
        </div>
      </div>
    </>
  );
}

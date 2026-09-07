/**
 * CEO САМБАР — «Smart city: IoT босго хэтрэлт» (түлхүүр `iot`).
 *
 * Эх сурвалж: `loadSensors('7d')` — таван мэдрэгчийн сүүлийн 7 ХОНОГИЙН ЗАДАРСАН
 * заалт (`src/lib/sensors.ts`). Үндсэн дүрэм нь `tools/iot-watch.mjs`-ийн
 * Telegram харуулаас АВСАН: хэтрэлт = `m.alert && m.latest >= m.alert.value`,
 * хуучирсан = `> IOT_STALE_H` цаг, унасан = `sensor.error`, дуугүй = заалт алга.
 *
 * ⚠️ ХАРУУЛТАЙ БҮРЭН ИЖИЛ БИШ — хоёр зөрүү САНААТАЙ (2026-09-06, хянагчийн олдвор):
 *    1. Харуул `loadSensors('24h')`, энд '7d' (доорх тайлбар). Харуулын 24ц
 *       хүрээнд 25ц+ өмнөх заалт `latest = null` → «дуугүй»; энд тэр заалт
 *       утгатайгаа ирж, 48ц хүртэл «одоогийн», дараа нь «хуучирсан».
 *    2. Харуул хуучирсныг МЭДРЭГЧЭЭР (`sn.lastAt`), энд ХЭМЖИГДЭХҮҮНЭЭР
 *       (`m.ageHours`) шалгана.
 *    Үр дагавар: 30 цагийн өмнө сүүлд заалт өгсөн мэдрэгчийг харуул «дуугүй»,
 *    энэ карт «ажиллаж байна» гэнэ. Тиймээс самбар ногоон байхад Telegram-д
 *    дохио явсан байж БОЛНО — энэ нь алдаа биш, хүрээний зөрүү. Харуулыг
 *    дараа нь '7d' + хэмжигдэхүүн тус бүрийн нас руу шилжүүлбэл хоёр тал
 *    бүрэн нийлнэ; тэр хүртэл `IOT_STALE_H` (48) л хамтын тогтмол.
 *
 * ⚠️ ЯАГААД '24h' БИШ '7d' ВЭ (2026-09-06, хянагчийн олдвор). `sensors.ts`-ийн
 *    `summarize()` нь `latest`/`latestAt`/`ageHours`-ыг ЗӨВХӨН хүрээн доторх
 *    цэгээс гаргадаг. 24 цагийн хүрээнд заалттай хэмжигдэхүүн бүрийн нас ≤ 24ц
 *    тул `> 48ц` = «хуучирсан» ХЭЗЭЭ Ч биелэхгүй; 25ц–5 хоногийн өмнө сүүлд
 *    задарсан хэмжигдэхүүн `latest = null` болж «дуугүй» гэж ХУДАЛ тоологдож,
 *    сүүлийн мэдэгдэж буй утга/цаг нь алга болно. 7 хоног (168ц) авахад
 *    48ц-ийн босго утгатай болно. Хандлага/ETA-д нөлөөгүй — `fit()` өөрөө
 *    сүүлийн 24ц-аар цонхолдог. `Iot.tsx` ч '7d'-ээр эхэлдэг тул `sensors.ts`-ийн
 *    кэш хуваалцагдана (нэмэлт татах хүсэлт үүсэхгүй).
 *    ⚠️ 7 хоногоос ХУУЧИН сүүлчийн заалттай хэмжигдэхүүн мөн `latest = null` →
 *    «дуугүй». Тийм заалт «сүүлийн мэдэгдэж буй утга» гэж хэрэглэхэд хэтэрхий
 *    хуучин тул зориуд буцаахгүй.
 *
 * ⚠️ IoT нь порталын бусад хэсгээс ӨӨР ArcGIS байгууллагад (Mononet ингест) —
 *    `dataBus`-т түлхүүр байхгүй, портал дотроос хэн ч бичдэггүй тул кэш нь
 *    ЗӨВХӨН TTL-ээр (5 мин, `sensors.ts`-тэй ижил) шинэчлэгдэнэ. Таг ХООСОН.
 *
 * ⚠️ ХУУЧИРСНЫГ ХЭМЖИГДЭХҮҮН ТУС БҮРД шалгана (`m.ageHours`), мэдрэгчээр биш:
 *    нэг мэдрэгчийн хоёр утга өөр өөр хугацаанд ирдэг (Mononet-ийн decoder
 *    талбар бүрд тусдаа унтардаг) тул мэдрэгчийн `lastAt` шинэхэн байхад
 *    хэтэрсэн утга нь 3–5 хоногийн өмнөх байж болно (7 хоногийн хүрээнд ийм
 *    заалт бодитоор ирнэ). Тийм хэтрэлт «одоо арга хэмжээ ав» биш — тусад нь
 *    `staleExceed` (шар), улаан биш.
 *
 * ⚠️ ХӨРСНИЙ ЧИЙГ — их байх нь САЙН (`sensors.ts`: «15%-аас дээш — хөрс
 *    хангалттай чийглэг»). Босгыг «дээш давсан» гэж тоолвол чийглэг хөрс улаан
 *    болно. Энд урвуулна: босгоос ДООШ бол «хуурай» (шар), дээш бол хэвийн.
 *
 * ⚠️ `null` ≠ 0: заалтгүй хэмжигдэхүүн нь хэтрэлт ч биш, хэвийн ч биш —
 *    «дуугүй». Хүснэгтэд `cell(null)` → «—». Тоолуурт ОРОХГҮЙ.
 *
 * ⚠️ ХЭТЭРСЭН хэмжигдэхүүнд `trend.etaHours` ҮРГЭЛЖ null (`sensors.ts`-ийн
 *    `eta()`: «аль хэдийн давсан»). Тиймээс «Дүүрэх (цаг)» багана нь зөвхөн
 *    БОСГОНД ДӨХӨЖ буй мөрөнд утгатай — тэдгээрийг `approaching` гэж хүснэгтийн
 *    СҮҮЛД мэдээллийн зорилгоор жагсаана. ТҮВШИНД НӨЛӨӨЛӨХГҮЙ (доорх
 *    `IOT_ETA_NEAR_H`-ийн тайлбар).
 */

import { cached } from '@/lib/live';
import { loadSensors, type MetricSeries, type SensorLive } from '@/lib/sensors';
import { num } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import { cell, table, type Cell, type KpiIssue, type KpiResult, type Level } from './kpi';

/**
 * Хуучирсан гэж үзэх нас (цаг).
 * ⚠️ `tools/iot-watch.mjs`-ийн `STALE_H`-тэй ИЖИЛ байх ёстой — нэгийг өөрчилбөл
 *    нөгөөг заавал дага.
 * ⚠️ `loadSensors`-ийн хүрээ (168ц) энэ тооноос ИХ байх ёстой — эс бөгөөс
 *    «хуучирсан» төлөв хэзээ ч гарахгүй (дээрх '7d'-ийн тайлбар).
 */
export const IOT_STALE_H = 48;

/**
 * ⚠️ САНАЛ (2026-09-06): босгонд хүрэх таамаг (`trend.etaHours`) энэ цагаас
 *    БАГА бол «дөхөж байна» гэж эхний хүснэгтийн сүүлд ЖАГСААНА. Хог цуглуулах
 *    маршрутыг өглөө төлөвлөдөг тул нэг хоногийн дотор дүүрэх сав өнөөдрийн
 *    ажил. Таамаг зөвхөн хуримтлагддаг хэмжигдэхүүнд (`forecast: true` —
 *    одоогоор хогийн сав) байдаг тул циклтэй температур/чийгшилд нөлөөгүй.
 * ⚠️ ТҮВШИНД НӨЛӨӨЛӨХГҮЙ, `issues`-д ОРОХГҮЙ (хянагчийн шаардлага, 2026-09-06):
 *    техник даалгаврын түвшний дүрэм нь «хэтрэлт/унасан → улаан; хуучирсан/
 *    дуугүй/хуурай/хуучирсан хэтрэлт → шар; бусад ногоон». 70%-тай сав 2%/ц-аар
 *    дүүрч байгаа нь картыг шар болгож болохгүй — зөвхөн мэдээлэл.
 */
export const IOT_ETA_NEAR_H = 24;

/**
 * Утга ИХ байх нь САЙН хэмжигдэхүүнүүд — `sensor.key:metric.key`.
 * ⚠️ `sensors.ts` бүх босгыг «дээш» чиглэлээр зурдаг (захиалагчийн шийдвэр,
 *    2026-08-21); энд ЗӨВХӨН дохионы утгыг урвуулна, чартыг хөндөхгүй.
 */
export const IOT_HIGHER_IS_GOOD: ReadonlySet<string> = new Set(['soil:moisture']);

/* ══════════════ Төрлүүд ══════════════ */

/** Босготой нэг хэмжигдэхүүний дохио — хэтэрсэн / хуучирсан хэтрэлт / дөхөж буй / хуурай */
export type IotHit = {
  sensor: string;
  metric: string;
  unit: string;
  dp: number;
  latest: number;
  threshold: number;
  /** latest − threshold (дөхөж буй / хуурай мөрөнд СӨРӨГ) */
  over: number;
  /** over / |threshold| × 100 — 0–100 масштаб, 100-аас давж болно; босго 0 бол null */
  overPct: number | null;
  latestAt: number | null;
  ageHours: number | null;
  /** Босго хүрэх таамаг (цаг) — зөвхөн `forecast` хэмжигдэхүүнд; хэтэрсэн бол null */
  eta: number | null;
  stale: boolean;
};

export type IotSensorState = 'down' | 'alert' | 'silent' | 'stale' | 'ok';

export type IotSensorRow = {
  sensor: string;
  state: IotSensorState;
  lastAt: number | null;
  error: string | null;
};

export type IotMetricRow = {
  sensor: string;
  metric: string;
  latest: number | null;
  unit: string;
  dp: number;
  threshold: number | null;
  ageHours: number | null;
  /** Эрэмбэ — 0 хамгийн муу (`RANK`) */
  rank: number;
};

export type IotSummary = {
  /** Тодорхойлогдсон мэдрэгчийн тоо */
  sensors: number;
  /** Алдаагүй татагдсан мэдрэгч — 0 бол юу ч уншигдаагүй */
  loaded: number;
  /** ОДООГИЙН (хуучраагүй) хэтрэлт — улаан */
  exceed: IotHit[];
  /** Хуучирсан заалт дээрх хэтрэлт — шар */
  staleExceed: IotHit[];
  /** Босгонд `IOT_ETA_NEAR_H` цагийн дотор хүрэх төлөвтэй — зөвхөн мэдээлэл, түвшинд нөлөөгүй */
  approaching: IotHit[];
  /** Хөрс хуурай (босгоос ДООШ) — шар */
  dry: IotHit[];
  /** Одоогийн хэтрэлттэй мэдрэгчийн тоо */
  sensorsExceeding: number;
  states: IotSensorRow[];
  down: number;
  silent: number;
  /**
   * Хуучирсан ХЭМЖИГДЭХҮҮНИЙ тоо (мэдрэгч биш) — унасан/дуугүй мэдрэгчийнх
   * ороогүй. ⚠️ Мэдрэгчээр тоолвол «нэг утга нь шинэ» мэдрэгч далдлагдана.
   */
  stale: number;
  metrics: IotMetricRow[];
  /** Хамгийн сүүлийн задарсан заалт — бүх хэмжигдэхүүнээр */
  asOf: number | null;
};

/* ══════════════ Цэвэр тооцоо ══════════════ */

/** Эрэмбэ — хүснэгт бүр ХАМГИЙН МУУГААС эхэлнэ */
const RANK = {
  exceed: 0, down: 1, staleExceed: 2, dry: 3, silent: 4, stale: 5, approaching: 6, ok: 7,
} as const;

const SENSOR_RANK: Record<IotSensorState, number> = { down: 0, alert: 1, silent: 2, stale: 3, ok: 4 };

/**
 * Хэмжигдэхүүний нас — `latestAt`-аас `now`-оор бодно (кэшлэгдсэн `ageHours`
 * нь ачаалсан мөчийнх тул 5 минутын дотор хуучирна); `latestAt` байхгүй бол
 * `ageHours`-ыг хэвээр авна.
 */
const ageOf = (m: MetricSeries, now: number): number | null => (
  m.latestAt != null ? (now - m.latestAt) / 3_600_000 : m.ageHours
);

const isStale = (age: number | null): boolean => age != null && age > IOT_STALE_H;

function hitOf(
  sn: SensorLive, m: MetricSeries, latest: number, threshold: number,
  age: number | null, stale: boolean,
): IotHit {
  const over = latest - threshold;
  return {
    sensor: sn.label,
    metric: m.label,
    unit: m.unit,
    dp: m.dp,
    latest,
    threshold,
    over,
    overPct: threshold !== 0 ? (over / Math.abs(threshold)) * 100 : null,
    latestAt: m.latestAt,
    ageHours: age,
    eta: m.trend?.etaHours ?? null,
    stale,
  };
}

/** Хамгийн их хэтэрсэн нь эхэнд — нэгж өөр тул ХУВИАР, тэнцвэл үнэмлэхүй зөрүүгээр */
const worstFirst = (a: IotHit, b: IotHit): number => (
  ((b.overPct ?? -Infinity) - (a.overPct ?? -Infinity)) || (b.over - a.over)
);

export function computeIot(sensors: readonly SensorLive[], now: number): IotSummary {
  const exceed: IotHit[] = [];
  const staleExceed: IotHit[] = [];
  const approaching: IotHit[] = [];
  const dry: IotHit[] = [];
  const states: IotSensorRow[] = [];
  const metrics: IotMetricRow[] = [];
  let stale = 0;
  let loaded = 0;
  let sensorsExceeding = 0;
  let asOf: number | null = null;

  for (const sn of sensors) {
    if (sn.error) {
      states.push({ sensor: sn.label, state: 'down', lastAt: sn.lastAt, error: sn.error });
      // Унасан мэдрэгчийн хэмжигдэхүүнүүд «Бүх хэмжигдэхүүн»-д null-аар үлдэнэ —
      // жагсаалтаас алга болбол CEO тэр мэдрэгч огт байхгүй гэж бодно.
      for (const m of sn.metrics) {
        metrics.push({
          sensor: sn.label, metric: m.label, latest: null, unit: m.unit, dp: m.dp,
          threshold: m.alert?.value ?? null, ageHours: null, rank: RANK.down,
        });
      }
      continue;
    }
    loaded++;
    let hitFresh = false;
    let anyFresh = false;
    let anyReading = false;

    for (const m of sn.series) {
      const age = ageOf(m, now);
      const st = isStale(age);
      let rank: number = RANK.ok;
      if (m.latestAt != null && (asOf == null || m.latestAt > asOf)) asOf = m.latestAt;

      if (m.latest == null) {
        // ⚠️ Хүрээнд (7 хоног) задарсан заалт огт байхгүй — «дуугүй». `m.total > 0`
        //    байж болно (7 хоногоос хуучин заалт серверт бий) — тэр утга энд ирдэггүй.
        rank = RANK.silent;
      } else {
        anyReading = true;
        if (st) { stale++; rank = RANK.stale; } else anyFresh = true;

        if (m.alert) {
          const h = hitOf(sn, m, m.latest, m.alert.value, age, st);
          if (IOT_HIGHER_IS_GOOD.has(`${sn.key}:${m.key}`)) {
            // ⚠️ Урвуу чиглэл: босгоос ДООШ нь асуудал (хуурай); дээш нь хэвийн
            if (m.latest < m.alert.value) { dry.push(h); rank = RANK.dry; }
          } else if (m.latest >= m.alert.value) {
            if (st) { staleExceed.push(h); rank = RANK.staleExceed; }
            else { exceed.push(h); hitFresh = true; rank = RANK.exceed; }
          } else if (!st && h.eta != null && h.eta <= IOT_ETA_NEAR_H) {
            // Зөвхөн мэдээлэл — түвшинд нөлөөгүй (`IOT_ETA_NEAR_H`-ийн тайлбар)
            approaching.push(h);
            rank = RANK.approaching;
          }
        }
      }

      metrics.push({
        sensor: sn.label, metric: m.label, latest: m.latest, unit: m.unit, dp: m.dp,
        threshold: m.alert?.value ?? null, ageHours: age, rank,
      });
    }

    if (hitFresh) sensorsExceeding++;
    // ⚠️ Дараалал `iot-watch.mjs`-ийн `stateOf`-той ижил: дуугүй → хуучирсан → босго → хэвийн.
    //    «Хуучирсан» = БҮХ утга нь хуучирсан (мэдрэгчийн `lastAt` > 48ц-тай тэнцүү).
    const state: IotSensorState = !anyReading ? 'silent'
      : !anyFresh ? 'stale'
        : hitFresh ? 'alert' : 'ok';
    states.push({ sensor: sn.label, state, lastAt: sn.lastAt, error: null });
  }

  exceed.sort(worstFirst);
  staleExceed.sort(worstFirst);
  approaching.sort((a, b) => (a.eta ?? Infinity) - (b.eta ?? Infinity));
  dry.sort((a, b) => a.over - b.over); // хамгийн хуурай нь эхэнд
  states.sort((a, b) => SENSOR_RANK[a.state] - SENSOR_RANK[b.state]);
  metrics.sort((a, b) => a.rank - b.rank);

  return {
    sensors: sensors.length,
    loaded,
    exceed,
    staleExceed,
    approaching,
    dry,
    sensorsExceeding,
    states,
    down: states.filter((s) => s.state === 'down').length,
    silent: states.filter((s) => s.state === 'silent').length,
    stale,
    metrics,
    asOf,
  };
}

/**
 * Түвшин — техник даалгаврын дүрмээр ҮГЧЛЭН:
 *   хэтрэлт > 0 эсвэл унасан > 0 → улаан;
 *   хуучирсан хэтрэлт / хуурай / дуугүй / хуучирсан > 0 → шар; бусад ногоон.
 * ⚠️ `sensors === 0` (`loadSensors` өөрөө шидсэн — мэдрэгчийн жагсаалт ч ирээгүй)
 *    л «мэдэхгүй». Таван FeatureServer БҮГД унасан бол `down = 5` → УЛААН
 *    (хянагчийн шаардлага, 2026-09-06: даалгавар «унасан → улаан» гэсэн; урьд
 *    нь `loaded === 0` → unknown байсан нь картыг «татагдсангүй» гэж саарал
 *    болгож байв). Гол тоо нь тэр үед `—` (`buildIotKpi`) — юу ч хэмжигдээгүй
 *    байхад «0 хэтрэлт» гэж бичихгүй (`null` ≠ 0).
 * ⚠️ `approaching` ЭНД ОРОХГҮЙ — зөвхөн мэдээлэл.
 */
export function iotLevel(s: IotSummary): Level {
  if (s.sensors === 0) return 'unknown';
  if (s.exceed.length > 0 || s.down > 0) return 'bad';
  if (s.staleExceed.length > 0 || s.dry.length > 0 || s.silent > 0 || s.stale > 0) return 'warn';
  return 'good';
}

/* ══════════════ Хэлбэржүүлэлт ══════════════ */

/** «83%» · «27.4°C» — нэгжийг залгаж бичнэ (`iot-watch.mjs`-тэй ижил) */
const val = (v: number | null, m: { dp: number; unit: string }): string | null => (
  v == null ? null : `${num(v, m.dp)}${m.unit}`
);

/** Тэмдэгтэй зөрүү — «+3.2°C» / «−2.0%r.h.» */
const signed = (v: number, m: { dp: number; unit: string }): string => (
  `${v < 0 ? '−' : '+'}${num(Math.abs(v), m.dp)}${m.unit}`
);

/** Цаг хүртэл нарийвчилсан агшин — IoT-д огноо дангаараа хангалтгүй (заалт цаг тутам) */
function stamp(ms: number | null): string | null {
  if (ms == null) return null;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const round1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);

const STATE_WORD: Record<IotSensorState, () => string> = {
  down: () => tr('унасан'),
  alert: () => tr('босго давсан'),
  silent: () => tr('дуугүй'),
  stale: () => tr('хуучирсан'),
  ok: () => tr('ажиллаж байна'),
};

function hitRow(h: IotHit, status: string): Cell[] {
  return [
    cell(h.sensor),
    cell(h.metric),
    cell(val(h.latest, h)),
    cell(val(h.threshold, h)),
    cell(signed(h.over, h)),
    cell(round1(h.ageHours)),
    cell(stamp(h.latestAt)),
    cell(round1(h.eta)),
    cell(status),
  ];
}

export function buildIotKpi(s: IotSummary, failedSources: string[]): KpiResult {
  const level = iotLevel(s);

  /* ── Баримт: зөвхөн тоо ── */
  const facts: string[] = [
    tr('{0} / {1} мэдрэгч', s.sensorsExceeding, s.sensors),
    tr('{0} унасан · {1} дуугүй · {2} хуучирсан', s.down, s.silent, s.stale),
  ];
  if (s.dry.length) facts.push(tr('хөрс хуурай {0}', s.dry.length));
  const extra: string[] = [];
  if (s.staleExceed.length) extra.push(tr('{0} хуучирсан хэтрэлт', s.staleExceed.length));
  if (s.approaching.length) extra.push(tr('{0} дөхөж байна', s.approaching.length));
  if (extra.length) facts.push(extra.join(' · '));

  /* ── Анхааруулга: нэрээр (⚠️ `approaching` ОРОХГҮЙ — зөвхөн хүснэгтэд) ── */
  const issues: KpiIssue[] = [];
  for (const h of s.exceed) {
    issues.push({ tone: 'bad', text: `${h.sensor} · ${h.metric} ${val(h.latest, h)} ≥ ${val(h.threshold, h)}` });
  }
  for (const st of s.states) {
    if (st.state !== 'down') continue;
    issues.push({ tone: 'bad', text: `${st.sensor} · ${tr('унасан')}${st.error ? ` · ${st.error}` : ''}` });
  }
  for (const h of s.staleExceed) {
    issues.push({
      tone: 'warn',
      text: `${h.sensor} · ${h.metric} ${val(h.latest, h)} ≥ ${val(h.threshold, h)} · ${tr('{0} цагийн өмнө', num(h.ageHours, 0))}`,
    });
  }
  for (const h of s.dry) {
    issues.push({ tone: 'warn', text: `${h.sensor} · ${h.metric} ${val(h.latest, h)} < ${val(h.threshold, h)} · ${tr('хуурай')}` });
  }

  /* ── Хүснэгтүүд ── */
  const hitRows: Cell[][] = [
    ...s.exceed.map((h) => hitRow(h, tr('одоогийн'))),
    ...s.staleExceed.map((h) => hitRow(h, tr('хуучирсан'))),
    ...s.dry.map((h) => hitRow(h, h.stale ? `${tr('хуурай')} · ${tr('хуучирсан')}` : tr('хуурай'))),
    ...s.approaching.map((h) => hitRow(h, tr('дөхөж байна'))),
  ];
  const t1 = table(
    tr('Босго давсан хэмжигдэхүүн'),
    [tr('Мэдрэгч'), tr('Хэмжигдэхүүн'), tr('Утга'), tr('Босго'), tr('Хэтрэлт'),
      tr('Нас (цаг)'), tr('Хэзээ'), tr('Дүүрэх (цаг)'), tr('Төлөв')],
    hitRows,
  );

  const t2 = table(
    tr('Мэдрэгчийн төлөв'),
    [tr('Мэдрэгч'), tr('Төлөв'), tr('Сүүлийн заалт'), tr('Алдаа')],
    s.states.map((st) => [
      cell(st.sensor),
      cell(STATE_WORD[st.state]()),
      cell(stamp(st.lastAt)),
      cell(st.error),
    ]),
  );

  const t3 = table(
    tr('Бүх хэмжигдэхүүн'),
    [tr('Мэдрэгч'), tr('Хэмжигдэхүүн'), tr('Утга'), tr('Нэгж'), tr('Босго'), tr('Нас (цаг)')],
    s.metrics.map((m) => [
      cell(m.sensor),
      cell(m.metric),
      cell(m.latest == null ? null : num(m.latest, m.dp)),
      cell(m.unit),
      cell(m.threshold == null ? null : num(m.threshold, m.dp)),
      cell(round1(m.ageHours)),
    ]),
  );

  return {
    // ⚠️ Юу ч уншигдаагүй (`loaded === 0`) бол «0 хэтрэлт» биш «—» — null ≠ 0.
    value: s.loaded === 0 ? '—' : num(s.exceed.length),
    unit: tr('хэмжигдэхүүн босго давсан'),
    facts,
    level,
    tables: [t1, t2, t3],
    issues,
    asOf: s.asOf,
    failedSources,
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ `loadSensors` ганц мэдрэгчийн алдааг ӨӨРӨӨ барьж `error` болгодог тул
 *    энд «хэсэгчилсэн уналт» нь унасан мэдрэгчүүд — тэдгээрийн нэр
 *    `failedSources`-д (сервис тус бүр тусдаа FeatureServer). Бүхэлдээ унавал
 *    (`throw`) `unknown` — шидэхгүй, самбар картаа зурна.
 * ⚠️ Хүрээ '7d' — '24h' биш (файлын толгойн тайлбар): 24ц хүрээнд «хуучирсан»
 *    хэзээ ч гарахгүй.
 */
export const loadIotKpi = cached<KpiResult>(async () => {
  const now = Date.now();
  let sensors: SensorLive[];
  try {
    sensors = await loadSensors('7d');
  } catch {
    return buildIotKpi(computeIot([], now), [tr('IoT мэдрэгч')]);
  }
  const summary = computeIot(sensors, now);
  const failed = sensors.filter((sn) => sn.error).map((sn) => sn.label);
  return buildIotKpi(summary, failed);
}, 5 * 60_000, []);

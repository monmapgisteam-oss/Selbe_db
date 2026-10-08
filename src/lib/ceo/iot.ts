/**
 * CEO САМБАР — «Smart city: IoT босго хэтрэлт» (түлхүүр `iot`).
 *
 * Эх сурвалж: `loadSensors('7d')` — таван мэдрэгчийн сүүлийн 7 ХОНОГИЙН ЗАДАРСАН
 * заалт (`src/lib/sensors.ts`). Үндсэн дүрэм нь `tools/iot-watch.mjs`-ийн
 * Telegram харуулаас АВСАН: хэтрэлт = `m.alert && m.latest >= m.alert.value`,
 * хуучирсан = `> IOT_STALE_H` цаг, унасан = `sensor.error`, дуугүй = заалт алга.
 *
 * ⚠️ 2026-10-09: доорх хоёр догол мөрийг ОДООГИЙН кодоор шинэчлэв — урьд нь устсан
 *    зан төлөвийг (хүрээн доторх `latest`, 48ц босго) тайлбарлаж байв.
 *
 * ⚠️ ХАРУУЛТАЙ ЯЛГААТАЙ ХЭВЭЭР (2026-09-06, хянагчийн олдвор):
 *    1. Харуул `loadSensors('24h')`, энд '7d'. 2026-09-17-оос `summarize()` нь
 *       `latest`/`latestAt`/`ageHours`-ыг хүрээгээр огтлоогүй БҮТЭН таталтаас
 *       гаргадаг тул хоёулаа ижил «сүүлийн заалт»-ыг харна; хүрээ нь зөвхөн
 *       чарт/доод/дээд/дундаж, таталтын `limit`-д нөлөөлнө.
 *    2. Харуул хуучирсныг МЭДРЭГЧЭЭР (`sn.lastAt`), энд ХЭМЖИГДЭХҮҮНЭЭР
 *       (`m.ageHours`) шалгана. Тиймээс нэг утга нь шинэ, нөгөө нь хуучирсан
 *       мэдрэгчийг харуул «хэвийн/босго», энэ карт «хуучирсан хэтрэлт» (шар) гэж
 *       болно — энэ нь алдаа биш, нарийвчлалын зөрүү.
 *    Хуучирсны босго нь хоёуланд НЭГ: `SENSOR_STALE_H` (24ц, 2026-10-04).
 *    Хөрсний чийгийн урвуу чиглэл (`IOT_HIGHER_IS_GOOD`) ба физик мужаас гадуурх
 *    заалт (`fault`) харуулд ч мөн адил (2026-10-09).
 *
 * ⚠️ ЯАГААД '24h' БИШ '7d' ВЭ: `summarize()`-ийн `latest` нь хүрээнээс үл хамаарах
 *    болсон ч (дээрх 1) ТАТАЛТ нь хүрээний `limit`-ээр хязгаарлагддаг — '24h'
 *    (400 мөр) нь decoder хэдэн өдрөөр хоцорсон хэмжигдэхүүнийг огт татахгүй байж
 *    болно. '7d' (1,400 мөр) нь илүү нөөцтэй. Хандлага/ETA-д нөлөөгүй — `fit()`
 *    өөрөө сүүлийн 24ц-аар цонхолдог. `Iot.tsx` ч '7d'-ээр эхэлдэг тул
 *    `sensors.ts`-ийн кэш хуваалцагдана (нэмэлт татах хүсэлт үүсэхгүй).
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
import { loadSensors, outOfRange, SENSOR_STALE_H, type MetricSeries, type SensorLive } from '@/lib/sensors';
import { num } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import { cell, table, kpiComplete, type Cell, type KpiIssue, type KpiResult, type Level } from './kpi';

/**
 * Хуучирсан гэж үзэх нас (цаг).
 * ⚠️ `tools/iot-watch.mjs`-ийн `STALE_H`-тэй ИЖИЛ байх ёстой — нэгийг өөрчилбөл
 *    нөгөөг заавал дага.
 * ⚠️ `loadSensors`-ийн хүрээ (168ц) энэ тооноос ИХ байх ёстой — эс бөгөөс
 *    «хуучирсан» төлөв хэзээ ч гарахгүй (дээрх '7d'-ийн тайлбар).
 */
/* ⚠️ 2026-10-04: 48 → 24 цаг — `sensors.SENSOR_STALE_H` (Iot хуудас)-тай НЭГ тоо; хоногоос дээш
   дуугүй мэдрэгч «шинэхэн» гэж харагдахгүй. `tools/iot-watch.mjs`-ийн анхдагч ч 24. */
export const IOT_STALE_H = SENSOR_STALE_H;

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
/* ⚠️ 2026-10-04: «их нь сайн» хэмжигдэхүүн ч ФИЗИК мужаас гадуур (хөрсний чийг > 100%) бол
   «хэвийн» БИШ — мэдрэгчийн гэмтэл (`faults`, `sensors.Metric.valid`). */

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

/** ⚠️ 2026-10-04: `fault` — сүүлийн заалт физик мужаас гадуур (мэдрэгчийн гэмтэл) */
export type IotSensorState = 'down' | 'alert' | 'fault' | 'silent' | 'stale' | 'ok';

/** Физик мужаас гадуур заалт — мэдрэгчийн гэмтэл (2026-10-04) */
/* ⚠️ 2026-10-09: `latest = null` — ТҮҮХИЙ мужаас гадуур (`sensors.Metric.rawValid`), харагдах нэгжээр утгагүй */
export type IotFault = { sensor: string; metric: string; unit: string; dp: number; latest: number | null; latestAt: number | null };

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
  /** Физик мужаас гадуур заалт — мэдрэгчийн гэмтэл, шар (2026-10-04) */
  faults: IotFault[];
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
  exceed: 0, down: 1, fault: 2, staleExceed: 3, dry: 4, silent: 5, stale: 6, approaching: 7, ok: 8,
} as const;

const SENSOR_RANK: Record<IotSensorState, number> = { down: 0, alert: 1, fault: 2, silent: 3, stale: 4, ok: 5 };

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
  const faults: IotFault[] = [];
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
      /* ⚠️ 2026-09-08: `dailyDiff`-ийн ЦУВАА Ч ОРНО. Эрүүл салбар нь `sn.series`
         давтдаг бөгөөд `loadOne` нь `dailyDiff`-тэй хэмжигдэхүүн бүрд НЭМЭЛТ
         цуваа үүсгэдэг (`series.length > metrics.length`). Энд зөвхөн
         `sn.metrics` давтагдаж байсан тул мэдрэгч унамагц «Усны хоногийн
         хэрэглээ» мөр хүснэгтээс БҮРМӨСӨН алга болж, яг дээрх тайлбарын
         сэргийлэхийг зорьсон үр дагавар үүсдэг байв. */
      for (const m of sn.metrics) {
        for (const d of [m, ...(m.dailyDiff ? [m.dailyDiff] : [])]) {
          metrics.push({
            sensor: sn.label, metric: d.label, latest: null, unit: d.unit, dp: d.dp,
            threshold: d.alert?.value ?? null, ageHours: null, rank: RANK.down,
          });
        }
      }
      continue;
    }
    loaded++;
    let hitFresh = false;
    let anyFresh = false;
    let anyReading = false;
    let anyFault = false;

    for (const m of sn.series) {
      const age = ageOf(m, now);
      const st = isStale(age);
      let rank: number = RANK.ok;
      if (m.latestAt != null && (asOf == null || m.latestAt > asOf)) asOf = m.latestAt;

      if (m.latest == null && !m.fault) {
        // ⚠️ Хүрээнд (7 хоног) задарсан заалт огт байхгүй — «дуугүй». `m.total > 0`
        //    байж болно (7 хоногоос хуучин заалт серверт бий) — тэр утга энд ирдэггүй.
        rank = RANK.silent;
      } else if (m.latest == null) {
        /* ⚠️ 2026-10-09: сүүлийн заалт ТҮҮХИЙ мужаас гадуур (`rawValid`) — гэмтэл, дуугүй БИШ */
        anyReading = true;
        if (st) { stale++; rank = RANK.stale; } else anyFresh = true;
        anyFault = true;
        faults.push({ sensor: sn.label, metric: m.label, unit: m.unit, dp: m.dp, latest: null, latestAt: m.latestAt });
        if (!st) rank = RANK.fault;
      } else {
        anyReading = true;
        if (st) { stale++; rank = RANK.stale; } else anyFresh = true;

        /* ⚠️ 2026-10-04: физик мужаас гадуур — гэмтэл; босготой ЖИШИХГҮЙ (хөрсний чийг 6553% нь
           «хангалттай чийглэг» биш). `m.fault` (ачаалагч) ба `outOfRange` (муж) хоёулаа нэг дүрэм. */
        if (m.fault || outOfRange(m, m.latest)) {
          anyFault = true;
          faults.push({ sensor: sn.label, metric: m.label, unit: m.unit, dp: m.dp, latest: m.latest, latestAt: m.latestAt });
          rank = RANK.fault;
        } else if (m.alert) {
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
        : hitFresh ? 'alert' : anyFault ? 'fault' : 'ok';
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
    faults,
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
  if (s.staleExceed.length > 0 || s.dry.length > 0 || s.faults.length > 0 || s.silent > 0 || s.stale > 0) return 'warn';
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
  fault: () => tr('мэдрэгчийн гэмтэл'),
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
  if (s.faults.length) facts.push(tr('мэдрэгчийн гэмтэл {0}', s.faults.length));
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
  for (const x of s.faults) {
    issues.push({ tone: 'warn', text: `${x.sensor} · ${x.metric} ${val(x.latest, x) ?? '—'} · ${tr('боломжгүй утга — мэдрэгчийн гэмтэл')}` });
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
/* ⚠️ 2026-09-25: БҮХЭЛДЭЭ УНАСАН үр дүнг КЭШЛЭХГҮЙ. Урьд нь `catch` дотор
   unknown карт БУЦААДАГ (амжилттай амлалт) тул `cached` түүнийг 5 минут
   барьж, сүлжээ сэргэсэн ч самбар «мэдэхгүй» хэвээр байв. Одоо дотоод
   ачаалагч ШИДНЭ (`cached` унасан амлалтыг хаядаг), unknown картыг гадна
   талын `loadIotKpiSafe` (registry-ийн дуудагч) зурна. */
export const loadIotKpi = cached<KpiResult>(async () => {
  const now = Date.now();
  const sensors: SensorLive[] = await loadSensors('7d');
  const summary = computeIot(sensors, now);
  const failed = sensors.filter((sn) => sn.error).map((sn) => sn.label);
  return buildIotKpi(summary, failed);
  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): унасан мэдрэгчтэй картыг КЭШЛЭХГҮЙ (`kpiComplete`) */
}, 5 * 60_000, [], kpiComplete);

/** Самбарын ачаалагч — бүхэлдээ унавал шидэхгүй, unknown карт (кэшлэгдэхгүй) */
export const loadIotKpiSafe = (): Promise<KpiResult> =>
  loadIotKpi().catch(() => buildIotKpi(computeIot([], Date.now()), [tr('IoT мэдрэгч')]));

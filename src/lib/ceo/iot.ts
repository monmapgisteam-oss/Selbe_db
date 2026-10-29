/**
 * CEO САМБАР — «Smart city: IoT босго хэтрэлт» (түлхүүр `iot`).
 *
 * Эх сурвалж: `loadSensors('7d')` — таван мэдрэгчийн сүүлийн 7 ХОНОГИЙН ЗАДАРСАН
 * заалт (`src/lib/sensors.ts`). Үндсэн дүрэм нь `tools/iot-watch.mjs`-ийн
 * Telegram харуулаас АВСАН: хэтрэлт = `m.alert && m.latest >= m.alert.value`,
 * хуучирсан = `> IOT_STALE_H` цаг, унасан = `sensor.error`, дуугүй = заалт алга.
 */

import { cached } from '@/lib/live';
import { loadSensors, outOfRange, SENSOR_STALE_H, type MetricSeries, type SensorLive } from '@/lib/sensors';
import { num } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import { cell, table, kpiComplete, type Cell, type KpiIssue, type KpiResult, type Level } from './kpi';

/**
 * Хуучирсан гэж үзэх нас (цаг).
 */
export const IOT_STALE_H = SENSOR_STALE_H;

export const IOT_ETA_NEAR_H = 24;

/**
 * Утга ИХ байх нь САЙН хэмжигдэхүүнүүд — `sensor.key:metric.key`.
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

export type IotSensorState = 'down' | 'alert' | 'fault' | 'silent' | 'stale' | 'ok';

/** Физик мужаас гадуур заалт — мэдрэгчийн гэмтэл (2026-10-04) */
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
   * ороогүй. Мэдрэгчээр тоолвол «нэг утга нь шинэ» мэдрэгч далдлагдана.
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
        rank = RANK.silent;
      } else if (m.latest == null) {
        anyReading = true;
        if (st) { stale++; rank = RANK.stale; } else anyFresh = true;
        anyFault = true;
        faults.push({ sensor: sn.label, metric: m.label, unit: m.unit, dp: m.dp, latest: null, latestAt: m.latestAt });
        if (!st) rank = RANK.fault;
      } else {
        anyReading = true;
        if (st) { stale++; rank = RANK.stale; } else anyFresh = true;

        if (m.fault || outOfRange(m, m.latest)) {
          anyFault = true;
          faults.push({ sensor: sn.label, metric: m.label, unit: m.unit, dp: m.dp, latest: m.latest, latestAt: m.latestAt });
          rank = RANK.fault;
        } else if (m.alert) {
          const h = hitOf(sn, m, m.latest, m.alert.value, age, st);
          if (IOT_HIGHER_IS_GOOD.has(`${sn.key}:${m.key}`)) {
            if (!st && m.latest < m.alert.value) { dry.push(h); rank = RANK.dry; }
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

  /* ── Анхааруулга: нэрээр (`approaching` ОРОХГҮЙ — зөвхөн хүснэгтэд) ── */
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

export const loadIotKpi = cached<KpiResult>(async () => {
  const now = Date.now();
  const sensors: SensorLive[] = await loadSensors('7d');
  const summary = computeIot(sensors, now);
  const failed = sensors.filter((sn) => sn.error).map((sn) => sn.label);
  return buildIotKpi(summary, failed);
}, 5 * 60_000, [], kpiComplete);

/** Самбарын ачаалагч — бүхэлдээ унавал шидэхгүй, unknown карт (кэшлэгдэхгүй) */
export const loadIotKpiSafe = (): Promise<KpiResult> =>
  loadIotKpi().catch(() => buildIotKpi(computeIot([], Date.now()), [tr('IoT мэдрэгч')]));

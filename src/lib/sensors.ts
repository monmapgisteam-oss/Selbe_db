'use client';

/**
 * IoT МЭДРЭГЧ — Mononet-ээс ArcGIS руу ингест хийгддэг таван FeatureServer.
 * Мэдрэгч тус бүр НЭГ төхөөрөмжтэй; давхарга нь мөр тутамд геометрээ давтдаг
 * (телеметрийн хүснэгт биш, цэгийн давхарга).
 *
 * 1. `received_datetime` нь STRING (Date БИШ). ISO-8601 + бүх мөр ижил `+08:00`
 *    бүстэй тул МӨРӨӨР эрэмбэлэхэд хугацааны эрэмбэтэй яг тохирно — тиймээс
 *    `orderByFields` сервер талд ажиллана (шалгасан). `ingested_at` нь АЧААЛСАН
 *    хугацаа тул хэмжилтийн хугацаа БИШ — түүгээр цуваа зурж БОЛОХГҮЙ.
 *
 * 2. Задарсан утга (`payload_decoded_data_*`) нь мөр бүрд БАЙХГҮЙ: Mononet-ийн
 *    decoder тогтворгүй. Тиймээс бүх query нь утгын талбар дээр
 *    `IS NOT NULL` шүүлттэй — эс бөгөөс цуваа нүхтэй болно. Мөн хамгийн сүүлийн
 *    ЗАДАРСАН заалт нь өнөөдрийнх байх албагүй, тиймээс `ageHours`-ыг ил гаргаж
 *    дашбоард дээр хуучирсныг нь харуулна.
 */

import { queryFeatures, queryCount } from '@/lib/query';
import { IOT_SVC as IOT } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import { register } from '@/lib/dataBus';

/**
 * Утга ИХ байх нь САЙН хэмжигдэхүүнүүд — `sensor.key:metric.key`.
 */
export const HIGHER_IS_GOOD: ReadonlySet<string> = new Set(['soil:moisture']);

/**
 * Объектыг getter-ийг нь АМЬДААР нь хадгалж хуулна (`{...x}` нь getter-ийг ДУУДААД тухайн
 * агшны утгыг хөлдөөдөг).
 */
function liveCopy<A extends object, B extends object>(src: A, extra: B): A & B {
  const o = Object.defineProperties({}, Object.getOwnPropertyDescriptors(src)) as A & B;
  return Object.assign(o, extra);
}

/** Нэг хэмжигдэхүүн — давхарга дээрх нэг тоон талбар */
export type Metric = {
  key: string;
  label: string;
  field: string;
  unit: string;
  /** Аравтын орон — дэлгэцэнд */
  dp: number;
  /**
   * ЮУГ хэмждэг вэ — картын толгойн доор гарна.
   */
  note: string;
  /**
   * АНХААРУУЛГЫН БОСГО — чартад шугамаар зурагдаж, босгоос ДЭЭШ гарсан цэг
   * улаанаар онцлогдоно.
   *
   * Утга нь оноох боломжгүй хэмжигдэхүүнд ОРХИНО (`undefined`) — зохиомол
   * босго нь мэдээлэл өгөхгүй, зөвхөн улаан өнгө үрнэ.
   */
  alert?: { value: number; note: string };
  /**
   * ФИЗИК БОЛОМЖИТ МУЖ (харагдах утгаар, `derive`-ийн ДАРАА) — гадуурх сүүлийн заалт = МЭДРЭГЧИЙН
   * ГЭМТЭЛ (`MetricSeries.fault`), «хэвийн» ч, «босго давсан» ч БИШ.
   */
  valid?: { min: number; max: number };
  /**
   * ТҮҮХИЙ заалтын физик муж — `derive`-ээс ӨМНӨ шалгана.
   */
  rawValid?: { min: number; max: number; lowNote?: string };
  /**
   * Түүхий заалтыг ХАРАГДАХ утга болгох хувиргалт.
   */
  derive?: (raw: number) => number;
  /**
   * ХУРИМТЛАГДСАН тоолуурыг ХОНОГИЙН ХЭРЭГЛЭЭ болгож ТУСДАА цуваа нэмнэ.
   */
  dailyDiff?: Omit<Metric, 'field' | 'derive' | 'dailyDiff'>;
  /**
   * БОСГО ХҮРЭХ ХУГАЦААГ ТААМАГЛАХ эсэх (`trend.etaHours`).
   */
  forecast?: boolean;
};

export type SensorDef = {
  key: string;
  label: string;
  url: string;
  /** Мэдрэгч ӨӨРӨӨ юу вэ — бүх хэмжигдэхүүнд нь нийтлэг тайлбар */
  note: string;
  /**
   * Төхөөрөмжийн DevEUI (LoRaWAN-ы дэлхий даяарх дугаар).
   */
  devEui: string;
  /**
   * Газрын зурган дээрх ЦЭГИЙН давхаргын id (`services.ts` → `IOT_LAYERS`).
   */
  layerId: string;
  /** Гол хэмжигдэхүүн — цуваа ба «сүүлийн заалт» картад энэ гарна */
  metrics: Metric[];
};

/**
 * ХОГИЙН САВНЫ ГҮН (мм) — ультрасоник заалтыг дүүрэлтийн хувь болгоход хэрэгтэй.
 */
const BIN_DEPTH_MM = 3015;

export const SENSORS: SensorDef[] = [
  {
    key: 'waste',
    get label() { return tr('Хогийн савны дүүрэлт'); },
    get note() { return tr('Ультрасоник зай, түвшин мэдрэгч. Савны амсараас хог хүртэлх зайг хэмжинэ — зай БАГАСАХ нь сав дүүрч байгааг заана.'); },
    devEui: '24e124713c198712',
    layerId: 'iot:waste_sensor',
    url: `${IOT}/15`,
    metrics: [
      {
        /**
         * Мэдрэгч нь ЗАЙГ илгээдэг ч тэр нь дүүрэлтийн ЭСРЭГ хэмжүүр: сав
         * дүүрэх тусам зай БАГАСНА. Тиймээс түүхий зайн дээр «босгоос дээш
         * гарвал улаан» гэсэн дүрэм ажиллах ФИЗИК боломжгүй — дүүрэн сав нь
         * ямагт доод үзүүрт байна. Босгыг өсгөөд ч шийдэгдэхгүй.
         *
         * Хөрвүүлснээр: сав дүүрэх тусам хувь нь ӨСӨЖ, 80%-ийн шугамыг
         * давж, улаан болно — бусад чарттай ижил зарчим.
         */
        key: 'fill', get label() { return tr('Хогийн савны дүүрэлт'); }, field: 'payload_decoded_data_distance',
        unit: '%', dp: 0,
        get note() { return tr('Савны эзлэхүүний хэдэн хувь нь дүүрсэн бэ. Мэдрэгч ЗАЙГ хэмждэг тул дүүрэлт нь савны гүнээс уг зайг хассан нь.'); },
        /** дүүрэлт % = (гүн − зай) / гүн; 0…100-д хумина (гажуу заалтаас хамгаална) */
        derive: (mm) => Math.max(0, Math.min(100, ((BIN_DEPTH_MM - mm) / BIN_DEPTH_MM) * 100)),
        rawValid: {
          min: 30, max: BIN_DEPTH_MM * 1.5,
          get lowNote() { return tr('гэмтэл эсвэл хэт дүүрсэн (мэдрэгчийн сохор бүс)'); },
        },
        alert: { value: 80, get note() { return tr('Сав ≥80% дүүрсэн — цэвэрлэх шаардлагатай'); } },
        forecast: true,
      },
    ],
  },
  {
    key: 'soil',
    get label() { return tr('Хөрсний мэдрэгч'); },
    get note() { return tr('Хөрсний чийгшил, температур болон цахилгаан дамжуулах чадлыг хэмждэг сенсор.'); },
    devEui: '24e124126c148914',
    layerId: 'iot:soil_meter',
    url: `${IOT}/12`,
    metrics: [
      {
        key: 'moisture', get label() { return tr('Хөрсний чийг'); }, field: 'payload_decoded_data_moisture',
        unit: '%r.h.', dp: 1,
        get note() { return tr('Хөрсний эзлэхүүний харьцангуй чийгшил.'); },
        /**
         * ФИЗИК утгаараа асуудал нь ХУУРАЙШИЛТ тул «дээш давсан» нь энд хөрс
         * ЧИЙГЛЭГ гэсэн үг — бүх чартад нэг чиглэл хэрэглэж байгаагийн үр дүн.
         */
        alert: { value: 15, get note() { return tr('15%-аас дээш — хөрс хангалттай чийглэг'); } },
        valid: { min: 0, max: 100 },
      },
      {
        key: 'temperature', get label() { return tr('Хөрсний температур'); }, field: 'payload_decoded_data_temperature',
        unit: '°C', dp: 1,
        get note() { return tr('Мэдрэгч булагдсан гүн дэх хөрсний температур.'); },
        alert: { value: 25, get note() { return tr('Үндэсний бүс хэт халсан'); } },
        valid: { min: -40, max: 80 },
      },
      {
        key: 'electricity', get label() { return tr('Хөрсний цахилгаан дамжуулах чадал'); }, field: 'payload_decoded_data_electricity',
        unit: 'µS/cm', dp: 0,
        get note() { return tr('Хөрсний цахилгаан дамжуулах чадал (EC) — давсжилт, бордооны агууламжийн шууд бус хэмжүүр. USDA-гийн ангиллаар давсжаагүй хөрс нь 2,000 µS/cm-ээс доош; хэмжигдсэн дээд нь 135.'); },
        /**
         * USDA-гийн хөрсний давсжилтын ангилал (ECe, ханасан зуурмагийн
         * ханд, 25°C): давсжаагүй <2 dS/m, маш бага 2–4, бага 4–8, дунд
         * 8–16, хүчтэй ≥16. 1 dS/m = 1,000 µS/cm тул давсжилтын ЭХНИЙ
         * зааг нь 2,000 µS/cm.
         *
         * Энэ мэдрэгчийн бүртгэсэн ДЭЭД утга 135 µS/cm — стандартын заагаас
         * 15 дахин доогуур, өөрөөр хэлбэл хөрс нь давсжилтын хувьд бүрэн
         * хэвийн. 2,000-ын шугам зурвал тэнхлэг тэр хүртэл сунаж, бодит
         * 0…135-ын хэлбэлзэл ёроолд шахагдан ШУЛУУН ЗУРААС болно — чарт
         * унших боломжгүй болно. Харин 100 гэсэн зохиомол тоо нь ямар ч
         * стандартад тулгуурлаагүй, зүгээр л дээд мужийг тэмдэглэдэг байв.
         *
         * Тиймээс шугам ОГТ зурахгүй: «давсжилтын асуудал алга» гэдэг нь
         * улаан зураасаар биш, шугамгүй байдлаараа л зөв илэрхийлэгдэнэ.
         */
        valid: { min: 0, max: 20000 },
      },
    ],
  },
  {
    key: 'light',
    get label() { return tr('Орчны гэрэл'); },
    get note() { return tr('Орчны гэрэл мэдрэгч сенсор.'); },
    devEui: '24e124126c148962',
    layerId: 'iot:light_sensor',
    url: `${IOT}/14`,
    metrics: [
      {
        key: 'illumination', get label() { return tr('Орчны гэрэл мэдрэгч'); }, field: 'payload_decoded_data_illumination',
        unit: 'lux', dp: 0,
        get note() { return tr('Мэдрэгч дээр тусах гэрлийн түвшин.'); },
        valid: { min: 0, max: 200000 },
      },
    ],
  },
  {
    key: 'air',
    get label() { return tr('Агаарын температур, чийг'); },
    get note() { return tr('Гадна орчны температур, чийгшил мэдрэгч сенсор.'); },
    devEui: '24e124136c220656',
    layerId: 'iot:temp_humidity',
    url: `${IOT}/16`,
    metrics: [
      {
        key: 'temperature', get label() { return tr('Гадна орчны температур'); }, field: 'payload_decoded_data_temperature',
        unit: '°C', dp: 1,
        get note() { return tr('Гадна орчны агаарын температур.'); },
        /**
         * Тиймээс 28°C нь ажлын зохион байгуулалтын ЗӨВЛӨМЖ утга: бүртгэсэн
         * дээд нь 30°C тул хамгийн халуун өдрүүдийг л тэмдэглэнэ.
         */
        alert: { value: 28, get note() { return tr('Халуун — гадна ажлын нөхцөл хүндэрнэ'); } },
        valid: { min: -60, max: 60 },
      },
      {
        key: 'humidity', get label() { return tr('Гадна орчны чийгшил'); }, field: 'payload_decoded_data_humidity',
        unit: '%r.h.', dp: 0,
        get note() { return tr('Гадна орчны агаарын харьцангуй чийгшил.'); },
        /**
         * ✅ СТАНДАРТАД ТУЛГУУРЛАСАН: EN ISO 13788:2012 (барилгын хийц дэх
         * дулаан-чийгийн горим) нь хөгц ургахаас сэргийлэх ЭГЗЭГТЭЙ
         * харьцангуй чийгшлийг 0.8 (80%) гэж тогтоосон — гадаргуугийн
         * сарын дундаж чийгшил үүнээс хэтэрч болохгүй.
         */
        alert: { value: 80, get note() { return tr('Конденсац, хөгцний эрсдэл'); } },
        valid: { min: 0, max: 100 },
      },
    ],
  },
  {
    key: 'water',
    get label() { return tr('Усны тоолуур'); },
    get note() { return tr('Усны хэрэглээний тоолуур. Заалтыг LoRaWAN-аар илгээнэ.'); },
    devEui: '8254812512001104',
    layerId: 'iot:water_meter',
    url: `${IOT}/13`,
    metrics: [
      {
        key: 'meterReading', get label() { return tr('Тоолуурын заалт'); }, field: 'payload_decoded_data_meterreading',
        get unit() { return tr('м³'); }, dp: 2,
        get note() { return tr('Тоолуурын ХУРИМТЛАГДСАН заалт — өссөн дүн тул хэрэглээ нь хоёр заалтын ЗӨРҮҮ.'); },
        dailyDiff: {
          key: 'dailyUse',
          get label() { return tr('Усны хоногийн хэрэглээ'); },
          get unit() { return tr('м³'); },
          dp: 2,
          get note() { return tr('Хоногийн сүүлийн заалт ба өмнөх хоногийн сүүлийн заалтын ЗӨРҮҮ — тухайн хоногт хэрэглэсэн бодит эзлэхүүн.'); },
        },
      },
    ],
  },
];

/** Нэг хэмжилт — задарсан утгатай нэг мөр */
export type Reading = { t: number; v: number };

export type MetricSeries = Metric & {
  /** Хугацаагаар ӨСӨХ эрэмбэтэй (хамгийн хуучин нь эхэнд) */
  points: Reading[];
  latest: number | null;
  latestAt: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  ageHours: number | null;
  /** Серверт БОДИТООР байгаа заалтын тоо (татсан хэмжээ БИШ). */
  total: number | null;
  /**
   * ХАНДЛАГА ба ТААМАГ — сүүлийн 24 цагийн шугаман тэгшитгэлээс.
   *
   * `etaHours` — босго хүртэл хэдэн цаг үлдсэн. Босгогүй, эсвэл хурд нь
   * босгоос ХОЛДОЖ байгаа, эсвэл аль хэдийн давсан бол `null`.
   */
  trend: { perHour: number; etaHours: number | null } | null;
  /**
   * СҮҮЛИЙН заалт физик мужаас (`Metric.valid`) гадуур — мэдрэгчийн гэмтэл (2026-10-04).
   */
  fault: boolean;
  faultNote?: string | null;
};

export type SensorLive = SensorDef & {
  series: MetricSeries[];
  /** Хамгийн сүүлийн ЗАДАРСАН заалтын хугацаа (ямар ч хэмжигдэхүүнээр) */
  lastAt: number | null;
  /** Тэр заалт хэдэн цагийн өмнөх вэ — хуучирсныг ил гаргана */
  ageHours: number | null;
  /** Задарсан заалттай мөрийн тоо — тооллого бүгд унавал `null` (2026-10-09) */
  n: number | null;
  /** Сүүлийн заалт `SENSOR_STALE_H`-аас хуучин (2026-10-04) — «шинэхэн» гэж харуулахгүй */
  stale: boolean;
  error?: string;
};

/**
 * МЭДРЭГЧ ХУУЧИРСАН гэж үзэх нас (цаг) — 2026-10-04: 24 цаг. Мэдрэгчүүд 30 мин–хэдэн цагийн
 * давтамжтай илгээдэг тул хоногоос дээш дуугүй бол холболт/тэжээлийн асуудал.
 */
export const SENSOR_STALE_H = 24;

/** Утга физик мужаас гадуур уу (`Metric.valid`) — муж тодорхойгүй бол `false` */
export const outOfRange = (m: Pick<Metric, 'valid'>, v: number | null): boolean =>
  v != null && m.valid != null && (v < m.valid.min || v > m.valid.max);

/**
 * ISO-8601 (`+08:00`) эсвэл `dd/MM/yyyy HH:mm:ss` → epoch ms.
 * Задрахгүй бол null.
 */
/** Asia/Ulaanbaatar-ын тогтмол зөрүү (2017 оноос зуны цаггүй) */
export const UB_OFFSET_MS = 8 * 3_600_000;

export function parseTs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) { const ms = v.getTime(); return Number.isFinite(ms) ? ms : null; }
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{12,13}$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, dd, MM, yyyy, hh = '0', mi = '0', ss = '0'] = m;
    if (+MM < 1 || +MM > 12 || +dd < 1 || +dd > 31 || +hh > 23 || +mi > 59 || +ss > 59) return null;
    return Date.UTC(+yyyy, +MM - 1, +dd, +hh, +mi, +ss) - UB_OFFSET_MS;
  }
  /* Ташуу зураастай бусад хэлбэрийг `Date.parse`-д ӨГӨХГҮЙ — тэр нь MM/DD гэж таана */
  if (s.includes('/')) return null;
  const dOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dOnly) {
    const ms = Date.parse(`${dOnly[1]}T00:00:00+08:00`);
    return Number.isFinite(ms) ? ms : null;
  }
  const bare = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/);
  const iso = Date.parse(bare ? `${bare[1]}T${bare[2]}+08:00` : s);
  return Number.isFinite(iso) ? iso : null;
}

/** УБ-ын хуанлийн ХОНОГИЙН дугаар (epoch-оос) — хостын бүсээс үл хамаарна (2026-10-09) */
export const ubDay = (ms: number): number => Math.floor((ms + UB_OFFSET_MS) / 86_400_000);

/**
 * Цувааг ХЭТ ОЛОН цэгээс хамгаална — 1,600 цэгтэй Trend нь SVG-д уншигдахгүй
 * бөгөөд hover-ийн 26px хүрэх талбарууд бүрэн давхарлана.
 */
export function thin<T extends Reading>(arr: T[], max: number, keep?: (x: T) => boolean, low = false): T[] {
  const n = arr.length;
  if (n <= max) return arr;
  if (max < 3) return max <= 0 ? [] : max === 1 ? [arr[n - 1]] : [arr[0], arr[n - 1]];
  const inner = max - 2;
  const span = n - 2; // [1, n−2] — дотоод индексүүд (span > inner)
  const out: T[] = [arr[0]];
  let prev = 0;
  for (let k = 0; k < inner; k++) {
    const lo = Math.max(prev + 1, 1 + Math.floor((k * span) / inner));
    const hi = Math.min(Math.floor(((k + 1) * span) / inner), n - 2);
    if (hi < lo) continue; // span > inner тул гарахгүй — хамгаалалт
    let pick = (lo + hi) >> 1; // хэсгийн ТӨВ (keep-гүй үед тэнцүү алхмын сийрэгжүүлэлт)
    if (keep) {
      let best = -1;
      for (let j = lo; j <= hi; j++) {
        if (!keep(arr[j])) continue;
        if (best < 0 || (low ? arr[j].v < arr[best].v : arr[j].v > arr[best].v)) best = j;
      }
      if (best >= 0) pick = best;
    }
    out.push(arr[pick]);
    prev = pick;
  }
  out.push(arr[n - 1]);
  return out;
}

/**
 * ЦООРХОЙ ТЭМДЭГЛЭХ — `Trend`-ийн хэвтээ тэнхлэг нь ИНДЕКСЭЭР (цаг хугацаагаар биш)
 * зурагддаг тул 3 хоног заалтгүй завсар нь хөрш хоёр цэгийн хоорондох ЖИРИЙН шугам
 * мэт харагддаг байв (2026-10-09). Алхам нь медиан алхмаас 3 дахин урт бол завсрын
 * дунд `null` цэг оруулна — `Trend` тэнд муруйг ТАСАЛНА (null ≠ 0).
 */
export function withGaps(points: Reading[], factor = 3): { t: number; v: number | null }[] {
  if (points.length < 3) return points;
  const steps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
  const med = steps[Math.floor(steps.length / 2)];
  if (!(med > 0)) return points;
  const out: { t: number; v: number | null }[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i].t - points[i - 1].t;
    if (gap > factor * med) out.push({ t: points[i - 1].t + gap / 2, v: null });
    out.push(points[i]);
  }
  return out;
}

/* ══════════════════ Хугацааны хүрээ ══════════════════ */

/**
 * ХАРУУЛАХ ХУГАЦААНЫ ХҮРЭЭ.
 */
export type RangeKey = '24h' | '7d' | '30d';

export const RANGES: { key: RangeKey; label: string; hours: number; limit: number }[] = [
  { key: '24h', get label() { return tr('24 цаг'); }, hours: 24, limit: 400 },
  { key: '7d', get label() { return tr('7 хоног'); }, hours: 24 * 7, limit: 1400 },
  { key: '30d', get label() { return tr('30 хоног'); }, hours: 24 * 30, limit: 4000 },
];

const rangeOf = (k: RangeKey) => RANGES.find((r) => r.key === k) ?? RANGES[1];

/**
 * ХАМГИЙН БАГА КВАДРАТААР шугаман хандлага — сүүлийн `windowH` цагийн цэгүүдээр.
 */
function fit(points: Reading[], windowH = 24): { perHour: number } | null {
  if (points.length < 3) return null;
  const last = points[points.length - 1].t;
  const from = last - windowH * 3_600_000;
  const w = points.filter((x) => x.t >= from);
  if (w.length < 3) return null;
  const spanH = (w[w.length - 1].t - w[0].t) / 3_600_000;
  if (spanH < 1) return null;
  // x-ийг ЦАГААР авна — налуу нь шууд «нэгж/цаг» болно
  const xs = w.map((x) => (x.t - w[0].t) / 3_600_000);
  const ys = w.map((x) => x.v);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return { perHour: num / den };
}

/**
 * Босго хүртэл хэдэн цаг үлдсэн вэ.
 * `null` — босгогүй, аль хэдийн давсан, эсвэл хурд нь босгоос ХОЛДОЖ байгаа.
 */
function eta(latest: number | null, perHour: number, alert?: { value: number }, ageHours: number | null = null): number | null {
  if (latest == null || !alert) return null;
  const gap = alert.value - latest;
  if (gap <= 0) return null;            // аль хэдийн давсан
  if (perHour <= 0) return null;        // босго руу ойртохгүй байна
  const h = gap / perHour;
  if (h > 24 * 30) return null;
  return ageHours == null ? h : Math.max(0, h - ageHours);
}

/**
 * Цуваанаас ХОНОГИЙН хэрэглээ — хуримтлагдсан тоолуурын зөрүү.
 */
function dailyDiffPoints(points: Reading[]): Reading[] {
  const lastByDay = new Map<number, Reading>();
  for (const r of points) {
    const key = ubDay(r.t);
    const cur = lastByDay.get(key);
    if (!cur || r.t >= cur.t) lastByDay.set(key, r); // хоногийн СҮҮЛИЙН заалт
  }
  const days = [...lastByDay.values()].sort((a, b) => a.t - b.t);
  const out: Reading[] = [];
  for (let i = 1; i < days.length; i++) {
    if (ubDay(days[i].t) !== ubDay(days[i - 1].t) + 1) continue; // цоорхой хоног
    const v = days[i].v - days[i - 1].v;
    if (v >= 0) out.push({ t: days[i].t, v }); // цэг хоногийн сүүлийн мөчид буух нь зөв
  }
  return out;
}

/** Цувааны нэгдсэн үзүүлэлт — суурь ба уламжлал хоёулаа үүгээр бүтнэ */
function summarize(
  m: Metric, pts: Reading[], total: number | null, all: Reading[] = pts, badAt: number | null = null,
  higherIsGood = false,
  badLow = false,
): MetricSeries {
  const clean = m.valid ? pts.filter((x) => !outOfRange(m, x.v)) : pts;
  const vals = clean.map((x) => x.v);
  const lastOk = all.length ? all[all.length - 1] : null;
  const badLast = badAt != null && (lastOk == null || badAt > lastOk.t);
  const last = badLast ? null : lastOk;
  const lastAt = badLast ? badAt : (lastOk?.t ?? null);
  const f = m.forecast && !badLast ? fit(clean) : null;
  const a = m.alert;
  return liveCopy(m, {
    points: thin(
      clean, 90,
      a ? (higherIsGood ? (x: Reading) => x.v < a.value : (x: Reading) => x.v >= a.value) : undefined,
      higherIsGood,
    ),
    latest: last?.v ?? null,
    latestAt: lastAt,
    ageHours: lastAt != null ? (Date.now() - lastAt) / 3_600_000 : null,
    total,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
    avg: vals.length ? vals.reduce((s2, x) => s2 + x, 0) / vals.length : null,
    trend: f ? { perHour: f.perHour, etaHours: eta(last?.v ?? null, f.perHour, m.alert, lastAt != null ? (Date.now() - lastAt) / 3_600_000 : null) } : null,
    fault: badLast || outOfRange(m, last?.v ?? null),
    faultNote: badLast && badLow ? (m.rawValid?.lowNote ?? null) : null,
  });
}

/**
 * Нэг мэдрэгч — хэмжигдэхүүн ТУС БҮРД тусдаа query.
 *
 * (Тэр «Батерей» карт 2026-08-21-нд хасагдсан ч ДҮРЭМ нь хэвээр: Mononet-ийн
 * decoder талбар ТУС БҮРД өөр өөр унтардаг тул нэг where нь бусдыг нь хаана.)
 */
async function loadOne(def: SensorDef, range: RangeKey): Promise<SensorLive> {
  const { hours, limit } = rangeOf(range);
  const from = Date.now() - hours * 3_600_000;
  const per = await Promise.all(
    def.metrics.map(async (m): Promise<MetricSeries[]> => {
      const where = `${m.field} IS NOT NULL`;
      const [rows, total] = await Promise.all([
        queryFeatures(def.url, {
          where,
          outFields: ['received_datetime', m.field],
          orderBy: 'objectid DESC',
          limit,
        }),
        queryCount(def.url, where).catch((): number | null => null),
      ]);

      const pts: Reading[] = [];
      /** Түүхий мужаас гадуурх ХАМГИЙН СҮҮЛИЙН заалтын цаг (`Metric.rawValid`, 2026-10-09) */
      let badAt: number | null = null;
      let badLow = false;
      for (const r of rows) {
        const t = parseTs(r.received_datetime);
        if (t == null) continue;
        const v = r[m.field];
        if (v == null || v === '') continue;
        const raw = Number(v);
        if (!Number.isFinite(raw)) continue;
        if (m.rawValid && (raw < m.rawValid.min || raw > m.rawValid.max)) {
          if (badAt == null || t > badAt) { badAt = t; badLow = raw < m.rawValid.min; }
          continue;
        }
        pts.push({ t, v: m.derive ? m.derive(raw) : raw });
      }
      pts.sort((x, y) => x.t - y.t); // ӨСӨХ — Trend зүүнээс баруун тийш уншина
      const inRange = pts.filter((x) => x.t >= from);

      const out = [summarize(m, inRange, total, pts, badAt, HIGHER_IS_GOOD.has(`${def.key}:${m.key}`), badLow)];
      // Хуримтлагдсан тоолуур → ХОНОГИЙН хэрэглээний тусдаа цуваа
      if (m.dailyDiff) {
        const dpAll = dailyDiffPoints(pts);
        const dp = dpAll.filter((x) => x.t >= from);
        out.push(summarize(
          liveCopy(m.dailyDiff, { field: m.field }),
          dp,
          dp.length,
          dpAll,
        ));
      }
      return out;
    }),
  ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  const flat = Array.isArray(per) ? per.flat() : per;
  if (typeof flat === 'string' || !flat) {
    return liveCopy(def, {
      series: [],
      lastAt: null,
      ageHours: null,
      n: null,
      stale: false,
      error: typeof flat === 'string' && flat ? flat : tr('Сервис татагдсангүй'),
    });
  }

  const lastAt = flat.reduce<number | null>(
    (acc, m) => (m.latestAt != null && (acc == null || m.latestAt > acc) ? m.latestAt : acc),
    null,
  );

  return liveCopy(def, {
    series: flat,
    lastAt,
    ageHours: lastAt == null ? null : (Date.now() - lastAt) / 3_600_000,
    stale: lastAt != null && (Date.now() - lastAt) / 3_600_000 > SENSOR_STALE_H,
    // Мэдрэгчийн нийт заалт — хэмжигдэхүүнүүдийн ХАМГИЙН ИХ нь (нийлбэр биш:
    // ижил мөр олон утга агуулж болно тул нийлбэрлэвэл давхарлана).
    n: ((xs) => (xs.length ? Math.max(...xs) : null))(flat.map((m) => m.total).filter((x): x is number => x != null)),
  });
}

/**
 * ХУГАЦААТАЙ кэштэй loader — амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ).
 */
function cached<T>(
  fn: () => Promise<T>,
  ttlMs = 5 * 60_000,
  keep?: (v: T) => boolean,
): () => Promise<T> {
  let p: Promise<T> | null = null;
  let at = 0;
  register(() => { p = null; }, []);
  return () => {
    if (!p || Date.now() - at > ttlMs) {
      at = Date.now();
      const mine = fn();
      p = mine;
      mine.catch(() => { if (p === mine) p = null; });
      if (keep) void mine.then((v) => { if (!keep(v) && p === mine) p = null; }, () => {});
    }
    return p;
  };
}

/** БҮРЭН үр дүн — нэг ч мэдрэгч `error`-гүй (`cached`-ийн `keep`, 2026-10-21). Хоосон жагсаалт бүрэн. */
export const sensorsComplete = (xs: readonly Pick<SensorLive, 'error'>[]): boolean => xs.every((s) => !s.error);

/**
 * Таван мэдрэгчийг ЗЭРЭГ ачаална.
 */
/**
 * Таван мэдрэгчийг ЗЭРЭГ ачаална — ХҮРЭЭ ТУС БҮРД тусдаа кэштэй.
 */
const byRange = new Map<RangeKey, () => Promise<SensorLive[]>>();

export function loadSensors(range: RangeKey = '7d'): Promise<SensorLive[]> {
  let f = byRange.get(range);
  if (!f) {
    f = cached<SensorLive[]>(() => Promise.all(SENSORS.map((d) => loadOne(d, range))), undefined, sensorsComplete);
    byRange.set(range, f);
  }
  return f();
}

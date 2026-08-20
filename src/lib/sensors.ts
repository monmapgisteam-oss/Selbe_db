'use client';

/**
 * IoT МЭДРЭГЧ — Mononet-ээс ArcGIS руу 15 минут тутам ингест хийгддэг таван
 * FeatureServer. Мэдрэгч тус бүр НЭГ төхөөрөмжтэй; давхарга нь мөр тутамд
 * геометрээ давтдаг (телеметрийн хүснэгт биш, цэгийн давхарга).
 *
 * ⚠️ ХОЁР ЗҮЙЛИЙГ САНАХ:
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
import { t as tr } from '@/lib/i18nCore';

const IOT = process.env.NEXT_PUBLIC_ARCGIS_IOT
  ?? 'https://services-ap1.arcgis.com/OgVoRiKUkHg9Iokz/arcgis/rest/services';

/** Нэг хэмжигдэхүүн — давхарга дээрх нэг тоон талбар */
export type Metric = {
  key: string;
  label: string;
  field: string;
  unit: string;
  /** Аравтын орон — дэлгэцэнд */
  dp: number;
};

export type SensorDef = {
  key: string;
  label: string;
  url: string;
  /** Гол хэмжигдэхүүн — цуваа ба «сүүлийн заалт» картад энэ гарна */
  metrics: Metric[];
};

/**
 * ⚠️ Давхаргын ДУГААР нь сервис тус бүрд өөр (60–64) — эдгээр нь нэг том
 * FeatureServer-ийн дугаарлалтаас үлдсэн. Хатуу бичихээс өөр аргагүй.
 */
export const SENSORS: SensorDef[] = [
  {
    key: 'waste',
    label: tr('Хогийн савны дүүрэлт'),
    url: `${IOT}/Waste_Sensor/FeatureServer/62`,
    metrics: [
      { key: 'distance', label: tr('Сав хүртэлх зай'), field: 'payload_decoded_data_distance', unit: tr('мм'), dp: 0 },
      { key: 'battery', label: tr('Батерей'), field: 'payload_decoded_data_battery', unit: '%', dp: 0 },
    ],
  },
  {
    key: 'soil',
    label: tr('Хөрсний мэдрэгч'),
    url: `${IOT}/Soil_Meter/FeatureServer/63`,
    metrics: [
      { key: 'moisture', label: tr('Хөрсний чийг'), field: 'payload_decoded_data_moisture', unit: '%', dp: 1 },
      { key: 'temperature', label: tr('Хөрсний температур'), field: 'payload_decoded_data_temperature', unit: '°C', dp: 1 },
      { key: 'electricity', label: tr('Цахилгаан дамжуулалт'), field: 'payload_decoded_data_electricity', unit: '', dp: 0 },
    ],
  },
  {
    key: 'light',
    label: tr('Гэрэлтүүлэг'),
    url: `${IOT}/Light_Sensor/FeatureServer/60`,
    metrics: [
      { key: 'illumination', label: tr('Гэрэлтүүлэг'), field: 'payload_decoded_data_illumination', unit: 'lux', dp: 0 },
    ],
  },
  {
    key: 'air',
    label: tr('Агаарын температур, чийг'),
    url: `${IOT}/Temp_Humidity/FeatureServer/64`,
    metrics: [
      { key: 'temperature', label: tr('Температур'), field: 'payload_decoded_data_temperature', unit: '°C', dp: 1 },
      { key: 'humidity', label: tr('Чийгшил'), field: 'payload_decoded_data_humidity', unit: '%', dp: 0 },
    ],
  },
  {
    key: 'water',
    label: tr('Усны тоолуур'),
    url: `${IOT}/Water_Meter/FeatureServer/61`,
    metrics: [
      { key: 'meterReading', label: tr('Тоолуурын заалт'), field: 'payload_decoded_data_meterReading', unit: tr('м³'), dp: 2 },
      { key: 'batteryVoltage', label: tr('Батерейн хүчдэл'), field: 'payload_decoded_data_batteryVoltage', unit: 'V', dp: 2 },
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
  /** ⚠️ Хэмжигдэхүүн БҮР өөрийн наспай — нэг мэдрэгчийн хоёр утга өөр өөр
   *  хугацаанд ирж болно (батерей 31 мин, зай 5 хоног). */
  ageHours: number | null;
  /** Серверт БОДИТООР байгаа заалтын тоо (татсан хэмжээ БИШ) */
  total: number;
};

export type SensorLive = SensorDef & {
  series: MetricSeries[];
  /** Хамгийн сүүлийн ЗАДАРСАН заалтын хугацаа (ямар ч хэмжигдэхүүнээр) */
  lastAt: number | null;
  /** Тэр заалт хэдэн цагийн өмнөх вэ — хуучирсныг ил гаргана */
  ageHours: number | null;
  /** Задарсан заалттай мөрийн тоо */
  n: number;
  error?: string;
};

/** ISO-8601 (`+08:00`) эсвэл `dd/MM/yyyy HH:mm:ss` → epoch ms. Задрахгүй бол null. */
export function parseTs(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = Date.parse(s);
  if (Number.isFinite(iso)) return iso;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const [, dd, MM, yyyy, hh, mi, ss] = m;
    return Date.UTC(+yyyy, +MM - 1, +dd, +hh, +mi, +ss);
  }
  return null;
}

/**
 * Цувааг ХЭТ ОЛОН цэгээс хамгаална — 1,600 цэгтэй Trend нь SVG-д уншигдахгүй
 * бөгөөд hover-ийн 26px хүрэх талбарууд бүрэн давхарлана.
 * ⚠️ 90 хязгаар нь ТЭНХЛЭГЭЭС гарна: `Trend` нь цэг БҮРИЙН шошгыг хэвлэдэг тул
 *    180 цэгт огнооны бичиг бүрэн давхарлаж уншигдахгүй болдог байв.
 * Тэнцүү алхмаар СИЙРЭГЖҮҮЛНЭ (дундажлахгүй: оргил утгыг тэгшлэхгүй).
 */
function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

/**
 * Нэг мэдрэгч — хэмжигдэхүүн ТУС БҮРД тусдаа query.
 *
 * ⚠️ 2026-08-18: Урьд нь ГАНЦ `where` (эхний хэмжигдэхүүнээр) бүх утгыг хаадаг
 * байв. Хогийн мэдрэгч дээр: зайтай 1,642 мөр, батерейтай 1,725 — зөвхөн
 * батерейтай 83 мөр БҮРМӨСӨН унтардаг байлаа. Үр дүнд «Батерей» карт 5 хоногийн
 * өмнөх 100%-ийг харуулж байхад 31 минутын өмнөх 98% сервер дээр байсан.
 */
async function loadOne(def: SensorDef, limit: number): Promise<SensorLive> {
  const per = await Promise.all(
    def.metrics.map(async (m): Promise<MetricSeries> => {
      const where = `${m.field} IS NOT NULL`;
      const [rows, total] = await Promise.all([
        queryFeatures(def.url, {
          where,
          outFields: ['received_datetime', m.field],
          // String талбар боловч ISO-8601 тул мөрийн эрэмбэ = хугацааны эрэмбэ
          orderBy: 'received_datetime DESC',
          limit,
        }),
        // ⚠️ `limit` нь ХАТУУ таг тул татсан мөрийн тоо ≠ нийт. Жинхэнэ тоог
        //    тусад нь асууна — эс бөгөөс «нийт заалт» нь таган дээр зогсоно.
        queryCount(def.url, where).catch(() => 0),
      ]);

      const pts: Reading[] = [];
      for (const r of rows) {
        const t = parseTs(r.received_datetime);
        if (t == null) continue;
        const v = r[m.field];
        if (v == null || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) pts.push({ t, v: n });
      }
      pts.sort((x, y) => x.t - y.t); // ӨСӨХ — Trend зүүнээс баруун тийш уншина

      const vals = pts.map((x) => x.v);
      const last = pts.length ? pts[pts.length - 1] : null;
      return {
        ...m,
        points: thin(pts, 90),
        latest: last?.v ?? null,
        latestAt: last?.t ?? null,
        ageHours: last ? (Date.now() - last.t) / 3_600_000 : null,
        total: total || pts.length,
        min: vals.length ? Math.min(...vals) : null,
        max: vals.length ? Math.max(...vals) : null,
        avg: vals.length ? vals.reduce((s2, x) => s2 + x, 0) / vals.length : null,
      };
    }),
    // ⚠️ Алдааны ЖИНХЭНЭ мессежийг барина — «Сервис татагдсангүй» гэсэн ерөнхий
    //    мөр нь HTTP 500, эрхийн татгалзал, талбар байхгүй гурвыг ялгагдахгүй
    //    болгодог байв. UI нь энийг хэрэглэгчид ил гаргана (`error`).
  ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  if (typeof per === 'string' || !per) {
    return {
      ...def,
      series: [],
      lastAt: null,
      ageHours: null,
      n: 0,
      error: typeof per === 'string' && per ? per : tr('Сервис татагдсангүй'),
    };
  }

  const lastAt = per.reduce<number | null>(
    (acc, m) => (m.latestAt != null && (acc == null || m.latestAt > acc) ? m.latestAt : acc),
    null,
  );

  return {
    ...def,
    series: per,
    lastAt,
    ageHours: lastAt == null ? null : (Date.now() - lastAt) / 3_600_000,
    // Мэдрэгчийн нийт заалт — хэмжигдэхүүнүүдийн ХАМГИЙН ИХ нь (нийлбэр биш:
    // ижил мөр олон утга агуулж болно тул нийлбэрлэвэл давхарлана).
    n: per.length ? Math.max(...per.map((m) => m.total)) : 0,
  };
}

/**
 * ХУГАЦААТАЙ кэштэй loader — амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ).
 *
 * ⚠️ 2026-08-19: TTL нэмэгдэв. Урьд нь амжилттай хариу сешн ДУУСТАЛ кэшлэгддэг
 * байв — мэдрэгчийн заалт мөн чанараараа АМЬД өгөгдөл тул тэр нь буруу: 09:00-д
 * нээсэн таб 15:00 болтол «31 мин өмнө» гэж ногоон өнгөөр хэвтэж, карт нь өөрөө
 * «15 мин тутам» гэж зарладаг байлаа. Портал руу буцаж ирэхэд ч дахин татдаггүй.
 * (`live.ts`-ийн KPI-ууд нь өдөрт нэг л өөрчлөгддөг тул тэнд мөнхийн кэш зөв —
 * энэ файлын өгөгдөл ӨӨР шинжтэй.)
 */
function cached<T>(fn: () => Promise<T>, ttlMs = 5 * 60_000): () => Promise<T> {
  let p: Promise<T> | null = null;
  let at = 0;
  return () => {
    if (!p || Date.now() - at > ttlMs) {
      at = Date.now();
      p = fn();
      p.catch(() => { p = null; });
    }
    return p;
  };
}

/**
 * Таван мэдрэгчийг ЗЭРЭГ ачаална.
 * ⚠️ Нэг нь унасан ч бусад нь гарна (`loadOne` алдааг барьж `error` болгоно) —
 * IoT сервис нь порталын бусад хэсэгтэй ӨӨР байгууллагад тул тусад нь унаж болно.
 */
export const loadSensors = cached<SensorLive[]>(async () =>
  Promise.all(SENSORS.map((d) => loadOne(d, 1200))),
);

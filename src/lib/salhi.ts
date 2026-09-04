'use client';

/**
 * САЛХИ — Open-Meteo-гийн цаг тутмын урьдчилсан мэдээ.
 *
 * `F:\Share\NEMA ANALYSIS WEB\WIND-MODULE.md`-ийн ӨГӨГДЛИЙН давхаргыг энэ
 * төсөлд тохируулан порталсан хувилбар.
 *
 * ══════════════════ ЮУГ АВЧ, ЮУГ АВААГҮЙ ══════════════════
 *
 * АВСАН — цэвэр логик, ямар ч хамааралгүй:
 *   · Open-Meteo-гийн дуудлага, 429-ийн дахин оролдлого
 *   · localStorage кэш (2 цаг) ба квот дүүрсэн үед ХУУЧИН кэш рүү ухрах
 *   · чиглэлийн градусыг 8 зүгийн нэр болгох
 *
 * АВААГҮЙ — Leaflet-ээс салгах боломжгүй хэсэг:
 *   · `leaflet-velocity`-ийн тоосонцрын анимац
 *   · Монгол орныг бүхэлд нь хамарсан 8×18 тор (144 цэг) ба bilinear
 *     интерполяц. Энэ самбарт ГАНЦ цэгийн (Сэлбэ) утга хэрэгтэй тул торны
 *     оронд нэг дуудлага явуулна — API-д 5 дахин бага ачаалал.
 *
 * ⚠️ ЭНЭ ӨГӨГДӨЛ ЖИНХЭНЭ. `ersdel.ts`-ийн харуулын ЗААЛТ нь жишээ өгөгдөл
 *    (тэр давхаргад утгын талбар байхгүй) — салхи нь тэднээс ЯЛГААТАЙ тул
 *    UI дээр хольж «бүгд жишээ» эсвэл «бүгд жинхэнэ» гэж үзүүлэх нь ХУДАЛ
 *    болно. Дуудагч тал ялгааг нь ил гаргах үүрэгтэй.
 */

import { t as tr } from '@/lib/i18nCore';

const API = 'https://api.open-meteo.com/v1/forecast';

/** Кэшийн хугацаа — эх модультай ижил 2 цаг */
const CACHE_TTL = 2 * 3600 * 1000;

/** Нэг цагийн заалт */
export type WindHour = {
  /** epoch ms */
  t: number;
  /** м/с */
  speed: number;
  /**
   * Салхи ХААНААС үлээж байгаа чиглэл, градусаар (цаг уурын конвенц).
   * ⚠️ «Хаашаа» БИШ: 0° = хойноос, 90° = зүүнээс. Бохирдлын тархалтад
   *    хаанаас үлээж байгаа нь чухал тул хөрвүүлэхгүй хадгална.
   */
  dirDeg: number;
};

export type Wind = {
  hours: WindHour[];
  lat: number;
  lon: number;
  /** Татсан мөч — кэшнээс ирсэн бол ХУУЧИН байж болно */
  asOf: number;
  /** Кэшнээс ирсэн эсэх — UI-д «шинэ эсэх»-ийг ил гаргана */
  cached: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 8 зүгийн нэр. ⚠️ Монголоор «зүүн» = ДОРНО (east), «баруун» = ӨРНӨ (west) —
 * англи «left/right»-аар бодвол эсрэгээр буудаг нийтлэг алдаа.
 */
const DIRS = [
  tr('Хойд'), tr('Зүүн хойд'), tr('Зүүн'), tr('Зүүн өмнөд'),
  tr('Өмнөд'), tr('Баруун өмнөд'), tr('Баруун'), tr('Баруун хойд'),
];

/** Градус → зүгийн нэр («Баруун хойд») */
export const dirName = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/**
 * САЛХИНЫ ХҮЧ → БОХИРДЛЫН ТАРХАЛТ.
 *
 * ⚠️ Улаанбаатарын өвлийн смогийн гол хүчин зүйл нь утаа өөрөө БИШ, харин
 * САЛХИГҮЙ байдал: хотхон хөндийд байрлах тул 1 м/с-ээс сул салхитай үед
 * температурын урвуу давхарга үүсч, бохирдол хуримтлагдана. Тиймээс АЧИ-г
 * салхинаас тусад нь харвал «яагаад өнөөдөр муу байна» гэдэг нь тайлбаргүй
 * үлдэнэ.
 *
 * Ангилал нь Beaufort-ын хуваарийн эхний гишүүдэд тулгуурлав (0–0.5 нам гүм,
 * 0.5–1.5 салхины сэвшээ, 1.6–3.3 хөнгөн салхи).
 */
export const dispersionOf = (speed: number): { label: string; tone: string } =>
  speed < 1
    ? { label: tr('Нам гүм — бохирдол хуримтлагдана'), tone: 'var(--bad)' }
    : speed < 3
      ? { label: tr('Сул — тархалт удаан'), tone: 'var(--warn)' }
      : { label: tr('Хангалттай — бохирдол тарна'), tone: 'var(--good)' };

type MeteoResponse = {
  hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] };
};

type Cached = { ts: number; hours: WindHour[] };

const keyOf = (lat: number, lon: number, date: string) =>
  `salhi:${date}:${lat.toFixed(2)},${lon.toFixed(2)}`;

function readCache(key: string): Cached | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null; // private горим / квот дүүрсэн
  }
}

async function fetchHours(lat: number, lon: number, date: string): Promise<WindHour[]> {
  const url =
    `${API}?latitude=${lat}&longitude=${lon}` +
    '&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto' +
    `&start_date=${date}&end_date=${date}`;

  /**
   * ⚠️ 429 (квот) дээр НЭГ удаа дахин оролдоно — эх модулийн зан. Open-Meteo
   * нь түлхүүргүй үнэгүй тул өдрийн хязгаартай; шууд алдаа шидвэл самбар
   * хоосорно.
   */
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(url);
    if (res.ok) break;
    if (res.status === 429 && attempt === 0) { await sleep(1200); continue; }
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res?.ok) throw new Error(tr('Салхины үйлчилгээний хязгаар (429)'));

  const j = (await res.json()) as MeteoResponse;
  const time = j.hourly?.time ?? [];
  const sp = j.hourly?.wind_speed_10m ?? [];
  const dr = j.hourly?.wind_direction_10m ?? [];

  const out: WindHour[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = Date.parse(time[i]);
    // ⚠️ Дутуу цагийг ОРХИНО — 0-ээр дүүргэвэл «нам гүм» гэсэн ХУДАЛ дохио өгнө
    if (!Number.isFinite(t) || sp[i] == null || dr[i] == null) continue;
    out.push({ t, speed: Number(sp[i]), dirDeg: Number(dr[i]) });
  }
  return out;
}

/**
 * Нэг цэгийн ӨНӨӨДРИЙН 24 цагийн салхи.
 *
 * Урсгал: кэш (2ц дотор) → сүлжээ → алдаа гарвал ХУУЧИРСАН кэш. Гуравдугаар
 * шат нь чухал: квот дүүрэхэд самбар хоосрохын оронд хуучин утгыг `cached`
 * тэмдэгтэйгээр үзүүлнэ.
 */
export async function loadWind(lat: number, lon: number): Promise<Wind> {
  const date = ymd(new Date());
  const key = keyOf(lat, lon, date);
  const cached = readCache(key);

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { hours: cached.hours, lat, lon, asOf: cached.ts, cached: true };
  }

  try {
    const hours = await fetchHours(lat, lon, date);
    const ts = Date.now();
    try { localStorage.setItem(key, JSON.stringify({ ts, hours } satisfies Cached)); } catch { /* квот */ }
    return { hours, lat, lon, asOf: ts, cached: false };
  } catch (err) {
    if (cached) return { hours: cached.hours, lat, lon, asOf: cached.ts, cached: true };
    throw err;
  }
}

/** Одоогийн цагт ХАМГИЙН ОЙР заалт — цуваа ирээдүйг ч агуулдаг тул сонгоно */
export function nowHour(w: Wind): WindHour | null {
  if (!w.hours.length) return null;
  const now = Date.now();
  return w.hours.reduce((a, b) => (Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a));
}

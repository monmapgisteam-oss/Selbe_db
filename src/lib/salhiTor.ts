'use client';

/**
 * САЛХИНЫ ТОР — олон цэгийн талбар, bilinear интерполяц, U/V вектор.
 *
 * `F:\Share\NEMA ANALYSIS WEB\WIND-MODULE.md` §9.1–9.5-ын ӨГӨГДЛИЙН давхаргыг
 * энэ порталд тохируулсан хувилбар. `salhi.ts` (ганц цэг) нь самбарын
 * ТООН заалтад үйлчилдэг; энэ файл нь ЗУРАГ дээрх урсгалын анимац ба
 * курсорын доорх утгад хэрэгтэй ТАЛБАРЫГ өгнө.
 *
 * ══════════════════ ТОРНЫ ХЭМЖЭЭ — МОНГОЛ ОРОН ══════════════════
 *
 * Эх модулийн хүрээ: `86–121°E · 40–53°N`, `2.0°` алхам.
 *
 * ⚠️ Бодит тор нь 19×8 = 152 цэг болж, `122°E · 54°N` хүртэл ЖААХАН ХЭТЭРНЭ:
 * 35° ба 13° нь 2°-д бүхлээр хуваагдахгүй тул алхмын тоог ДЭЭШ бөөрөнхийлөв.
 * Дутуу бөөрөнхийлвөл зүүн (Дорнод) ба хойд (Хөвсгөл) захын зурвас тороос
 * ГАДУУР үлдэж, `windAt` тэнд захын утгаар хазаарлана — өөрөөр хэлбэл улсын
 * хилийн дотор «хөлдсөн» салхи гарна. 152 цэг нь нэг хүсэлтэд асуудалгүй.
 *
 * ⚠️ 2026-09-03: ЭХЭНДЭЭ Сэлбэ дүүргийг тойрсон 5×5 (0.06°) ЖИЖИГ тор хийсэн
 * нь БУРУУ байв. Логик нь «дүүргийн хэмжээст нарийн градиент хэрэгтэй» гэсэн
 * ч үр дүнд нь урсгал зөвхөн Улаанбаатарын орчимд, ирмэгтэйгээ ТАСАРЧ
 * харагддаг байлаа — зургийг холдуулахад салхи гэнэт дуусдаг хайрцаг гарна.
 * Салхи бол улс орны хэмжээний үзэгдэл; хэрэглэгч зургийг холдуулж бүтэн
 * дүр зургийг хардаг тул хүрээ нь ОРНЫ хэмжээтэй байх ЁСТОЙ.
 *
 * ⚠️ 2° алхам дээр Сэлбэ дүүрэг (0.03°) бүхэлдээ нэг нүдэнд унана — тэнд
 * урсгал ЖИГД харагдана. Энэ нь алдаа БИШ: 30 км-ийн дотор синоптик салхи
 * бодитоор ч бараг ижил. Дүүргийн ТООН заалт нь `salhi.ts`-ийн ганц цэгээс
 * тусад нь ирдэг тул нарийвчлал алдагдахгүй.
 *
 * ⚠️ ГАНЦ ХҮСЭЛТ. Open-Meteo нь `latitude=a,b,c&longitude=x,y,z` гэж ХОСООР
 * (декарт үржвэр БИШ) уншиж, массив буцаана. 126 цэг нь эх модулийн 300-ын
 * багцын хязгаарт багтана — тиймээс багцлах давталт энд хэрэггүй.
 */

import { t as tr } from '@/lib/i18nCore';

const API = 'https://api.open-meteo.com/v1/forecast';

/* ══════════════════ Торны хэмжээс ══════════════════ */

/**
 * МОНГОЛ ОРНЫ ХҮРЭЭ — эх модулийн (`WIND-MODULE.md` §10) ЯГ тэр утга.
 * ⚠️ Тогтмол: тор нь газрын зургийн хөдөлгөөнөөс ҮЛ ХАМААРНА. Хэрэглэгч
 * гүйлгэх бүрд дахин татвал API-гийн өдрийн квот хормын дотор дүүрнэ.
 */
const LON_MIN = 86;
const LON_MAX = 121;
const LAT_MIN = 40;
const LAT_MAX = 53;

/** Торны нүдийн алхам (°) — эх модулийн `STEP` */
export const STEP = 2.0;

/**
 * ЗАНГУУ ЦЭГ — Сэлбэ дүүрэг (агаарын харуулуудын төв).
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ (2026-09-03, амьдаар илрүүлсэн зөрчил):
 * 2°-ийн тор дээр Сэлбэ рүү хамгийн ойр зангилаа нь ~110 км зайд байдаг тул
 * bilinear интерполяци нь бүсийн ЕРӨНХИЙ урсгалыг өгдөг — дүүргийн бодит
 * салхийг БИШ. Үр дүнд:
 *
 *   · сэвсгэр (`salhi.ts`, ЯГ тэр цэг) — 229°-аас, 0.5 м/с
 *   · тоосонцор (тор)                  — 8°-аас, 2.5 м/с
 *   · ЗӨРҮҮ 139° — зурган дээр бохирдол зүүн хойш, салхи урагш чиглэнэ
 *
 * Хоёулаа Open-Meteo-гийнх, ижил цагийнх; ялгаа нь ЗӨВХӨН орон зайн
 * нарийвчлалаас. Тиймээс торыг зангуу цэгийн ЯГ заалтад тааруулж
 * залруулна (`applyAnchor`).
 */
const ANCHOR = { lat: 47.9664, lon: 106.9214 };

/**
 * Залруулгын НӨЛӨӨНИЙ РАДИУС (°).
 * ⚠️ Нэг нүднээс (2°) бага байх ЁСТОЙ: том байвал орон даяарх урсгалыг
 * нэг цэгийн заалтаар дарж, тор нь утгаа алдана.
 */
const ANCHOR_R = 1.2;

/** Зангилааны тоо: 18 багана × 7 мөр = 126 цэг */
export const NX = Math.round((LON_MAX - LON_MIN) / STEP) + 1;
export const NY = Math.round((LAT_MAX - LAT_MIN) / STEP) + 1;

/** Торны баруун-урд булан */
const LON0 = LON_MIN;
const LAT0 = LAT_MIN;

/** Торны хамрах хүрээ — WGS84 (зурагт байрлуулахад) */
export const GRID_BBOX = {
  xmin: LON0,
  ymin: LAT0,
  xmax: LON0 + (NX - 1) * STEP,
  ymax: LAT0 + (NY - 1) * STEP,
} as const;

/* ══════════════════ Төрөл ══════════════════ */

export type WindField = {
  /** Цаг тутмын epoch ms — `u`/`v`-ийн эхний хэмжээс */
  times: number[];
  /**
   * Салхины хэвтээ бүрэлдэхүүн, м/с. Байрлал: `[h * NX * NY + y * NX + x]`.
   *
   * ⚠️ `y` нь ӨМНӨӨС ХОЙШ өснө (LAT0 = 0-р мөр) — canvas-ын `y` УРАГШ өсдөгтэй
   * ЭСРЭГ тул зурахдаа урвуулна (`uyr.ts`-ийн ижил анхааруулга).
   */
  u: Float32Array;
  v: Float32Array;
  /** Татсан огноо `YYYY-MM-DD` */
  date: string;
  /** Кэшнээс ирсэн эсэх */
  cached: boolean;
};

/* ══════════════════ Вектор хөрвүүлэлт (§9.4) ══════════════════ */

const RAD = Math.PI / 180;

/**
 * ХУРД + ЗҮГ → U/V вектор.
 *
 * ⚠️ Цаг уурын конвенц: `dirDeg` нь салхи ХААНААС үлээж байгаа зүг
 * (0° = хойноос). Тиймээс хоёуланд нь ХАСАХ тэмдэг — вектор нь салхи
 * ХААШАА явахыг заана.
 *
 *   u = -speed · sin(dir)   (зүүн→баруун эерэг)
 *   v = -speed · cos(dir)   (өмнөөс→хойш эерэг)
 */
export const toUV = (speed: number, dirDeg: number) => ({
  u: -speed * Math.sin(dirDeg * RAD),
  v: -speed * Math.cos(dirDeg * RAD),
});

/** U/V → хурд + зүг (урвуу хөрвүүлэлт, §9.4) */
export const fromUV = (u: number, v: number) => ({
  speed: Math.hypot(u, v),
  dirDeg: ((Math.atan2(-u, -v) / RAD) + 360) % 360,
});

/* ══════════════════ Bilinear интерполяц (§9.5) ══════════════════ */

/**
 * ЦЭГИЙН САЛХИ — торны 4 хөрш зангилааг жинлэн.
 *
 * ⚠️ Торны ГАДНА цэгийг ХАЗААРНА (clamp), экстраполяци ХИЙХГҮЙ: 25 цэгийн
 * торыг хэдэн зуун км гадагш сунгавал утга нь физик утгаа алдана. Хэрэглэгч
 * дүүргээс хол гүйлгэвэл захын утга харагдана — энэ нь худал тоо гаргахаас
 * дээр.
 *
 * @param h Цагийн индекс (`field.times`-ын)
 */
export function windAt(field: WindField, h: number, lat: number, lon: number) {
  const hi = Math.max(0, Math.min(field.times.length - 1, Math.round(h)));
  const fx = Math.max(0, Math.min(NX - 1, (lon - LON0) / STEP));
  const fy = Math.max(0, Math.min(NY - 1, (lat - LAT0) / STEP));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(NX - 1, x0 + 1);
  const y1 = Math.min(NY - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (a: Float32Array, x: number, y: number) => a[hi * NX * NY + y * NX + x];
  const mix = (a: Float32Array) => {
    const a00 = at(a, x0, y0); const a10 = at(a, x1, y0);
    const a01 = at(a, x0, y1); const a11 = at(a, x1, y1);
    return (a00 * (1 - tx) + a10 * tx) * (1 - ty) + (a01 * (1 - tx) + a11 * tx) * ty;
  };
  const u = mix(field.u);
  const v = mix(field.v);
  return { u, v, ...fromUV(u, v) };
}

/**
 * ТОРЫГ ЗАНГУУ ЦЭГИЙН ЗААЛТАД ТААРУУЛНА.
 *
 * Зангуу цэг дээрх торны интерполяц ба ЯГ заалтын ЗӨРҮҮГ бодоод, түүнийг
 * ойролцоох зангилаануудад Гауссын жингээр тарааж нэмнэ. Ингэснээр:
 *   · зангуу цэг дээр талбар нь ЯГ заалттай бараг тэнцэнэ,
 *   · нөлөө нь ~1 нүдэнд бүдгэрч, орон даяарх урсгал ХЭВЭЭР үлдэнэ.
 *
 * ⚠️ Зөрүүг ХУВЬААР биш, ВЕКТОРООР нэмнэ: хурдаар үржүүлбэл намуухан бүсэд
 * (u,v≈0) залруулга бараг үйлчлэхгүй атал яг тэр үед чиглэлийн зөрүү
 * хамгийн их байдаг.
 */
function applyAnchor(
  u: Float32Array,
  v: Float32Array,
  H: number,
  sp: number[],
  dr: number[],
): void {
  /* Зангилаа бүрийн жин — цагаас ҮЛ ХАМААРНА, нэг удаа бодно */
  const w = new Float32Array(NX * NY);
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      const dLon = (LON0 + x * STEP) - ANCHOR.lon;
      const dLat = (LAT0 + y * STEP) - ANCHOR.lat;
      const d = Math.hypot(dLon, dLat);
      w[y * NX + x] = Math.exp(-((d / ANCHOR_R) ** 2));
    }
  }

  for (let h = 0; h < H; h++) {
    const exact = toUV(sp[h] ?? 0, dr[h] ?? 0);
    const base = h * NX * NY;

    /* Торны интерполяц зангуу цэг дээр — залруулга ХИЙХЭЭС ӨМНӨ */
    const fx = Math.max(0, Math.min(NX - 1, (ANCHOR.lon - LON0) / STEP));
    const fy = Math.max(0, Math.min(NY - 1, (ANCHOR.lat - LAT0) / STEP));
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const x1 = Math.min(NX - 1, x0 + 1); const y1 = Math.min(NY - 1, y0 + 1);
    const tx = fx - x0; const ty = fy - y0;
    const mix = (a: Float32Array) => {
      const g = (x: number, y: number) => a[base + y * NX + x];
      return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty)
        + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
    };
    /**
     * ⚠️ Жингүүд нийлбэрээрээ 1 БИШ тул зөрүүг зангуу цэг дээрх ҮР ДҮНГИЙН
     * жингээр хуваана — эс бөгөөс залруулга дутуу хийгдэж, зөрүү үлдэнэ.
     */
    const wAt = (
      (w[y0 * NX + x0] * (1 - tx) + w[y0 * NX + x1] * tx) * (1 - ty)
      + (w[y1 * NX + x0] * (1 - tx) + w[y1 * NX + x1] * tx) * ty
    );
    if (wAt < 1e-6) continue;
    const du = (exact.u - mix(u)) / wAt;
    const dv = (exact.v - mix(v)) / wAt;

    for (let i = 0; i < NX * NY; i++) {
      u[base + i] += du * w[i];
      v[base + i] += dv * w[i];
    }
  }
}

/* ══════════════════ Татах ба кэш (§9.2, §9.3) ══════════════════ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Эх модультай ижил түлхүүрийн хэв — `windCache:YYYY-MM-DD` */
/* ⚠️ Түлхүүрт `a` (anchor) — залруулгагүй ХУУЧИН кэш уншигдвал зөрчил
   эргэж ирнэ. Формат солигдох бүрд энэ тэмдгийг ӨӨРЧИЛНӨ. */
const keyOf = (date: string) => `selbe-windgrid:${date}:${NX}x${NY}@${STEP}a`;
/** Кэшийн хугацаа — эх модультай ижил 2 цаг */
const TTL = 2 * 3600 * 1000;

type Cached = { ts: number; times: number[]; u: number[]; v: number[] };

function readCache(key: string): Cached | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as Cached;
    return Array.isArray(j.times) && Array.isArray(j.u) ? j : null;
  } catch {
    return null;
  }
}

/**
 * ТОРЫГ ТАТНА — нэг өдрийн 24 цаг, 25 цэг, НЭГ хүсэлт.
 *
 * ⚠️ Алдааны үед ХУУЧИРСАН кэш рүү ухарна (§9.2-ийн fallback зарчим): салхи
 * нь чимэглэл БИШ, сэвсгэрийн чиглэлийг тодорхойлдог тул «өчигдрийн салхи»
 * нь «салхи алга»-аас хамаагүй дээр. Хуучин эсэхийг дуудагч тал
 * (`field.cached`) ил гаргана.
 */
export async function loadWindField(date: string): Promise<WindField> {
  const key = keyOf(date);
  const hit = readCache(key);
  if (hit && Date.now() - hit.ts < TTL) {
    return {
      times: hit.times,
      u: Float32Array.from(hit.u),
      v: Float32Array.from(hit.v),
      date,
      cached: true,
    };
  }

  const lats: number[] = [];
  const lons: number[] = [];
  /* ⚠️ ӨМНӨӨС ХОЙШ, БАРУУНААС ЗҮҮН — `windAt`-ийн индексжүүлэлттэй ИЖИЛ
     дараалал. Зөрвөл талбар нь толин тусгал болж, урсгал эсрэг чиглэнэ. */
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      lats.push(+(LAT0 + y * STEP).toFixed(4));
      lons.push(+(LON0 + x * STEP).toFixed(4));
    }
  }
  /* ⚠️ ЗАНГУУ ЦЭГ нь торны СҮҮЛД — ижил хүсэлтээр авна. Тусдаа дуудлага
     явуулбал өөр агшны загвар унших эрсдэлтэй (Open-Meteo цаг тутам
     шинэчлэгддэг) бөгөөд квот ч хоёр дахин зарцуулагдана. */
  lats.push(ANCHOR.lat);
  lons.push(ANCHOR.lon);

  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timezone: 'auto',
    start_date: date,
    end_date: date,
  });

  const get = async (): Promise<Response> => {
    const r = await fetch(`${API}?${params}`);
    /* ⚠️ 429 — өдрийн квот. НЭГ удаа дахин оролдоно (§9.2). */
    if (r.status === 429) {
      await sleep(1200);
      return fetch(`${API}?${params}`);
    }
    return r;
  };

  try {
    const res = await get();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    /* ⚠️ ГАНЦ цэгт объект, ОЛОН цэгт массив ирдэг — хоёуланг нь хүлээнэ */
    const arr = (Array.isArray(body) ? body : [body]) as {
      hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] };
      error?: boolean;
      reason?: string;
    }[];
    if (arr[0]?.error) throw new Error(arr[0].reason ?? tr('Open-Meteo алдаа'));
    /* Тор + зангуу цэг */
    if (arr.length !== NX * NY + 1) {
      throw new Error(tr('Торны цэг дутуу ирлээ: {0}/{1}', String(arr.length), String(NX * NY + 1)));
    }

    const times = (arr[0].hourly?.time ?? []).map((t) => new Date(t).getTime());
    const H = times.length;
    if (!H) throw new Error(tr('Цагийн цуваа хоосон'));

    const u = new Float32Array(H * NX * NY);
    const v = new Float32Array(H * NX * NY);
    for (let i = 0; i < NX * NY; i++) {
      const sp = arr[i].hourly?.wind_speed_10m ?? [];
      const dr = arr[i].hourly?.wind_direction_10m ?? [];
      for (let h = 0; h < H; h++) {
        const w = toUV(sp[h] ?? 0, dr[h] ?? 0);
        u[h * NX * NY + i] = w.u;
        v[h * NX * NY + i] = w.v;
      }
    }

    /* Зангуу цэгийн ЯГ заалт — торыг түүн рүү татна */
    const aSp = arr[NX * NY].hourly?.wind_speed_10m ?? [];
    const aDr = arr[NX * NY].hourly?.wind_direction_10m ?? [];
    applyAnchor(u, v, H, aSp, aDr);

    try {
      window.localStorage.setItem(key, JSON.stringify({
        ts: Date.now(), times, u: [...u], v: [...v],
      } satisfies Cached));
    } catch {
      /* квот дүүрсэн — кэшгүй ажиллана */
    }
    return { times, u, v, date, cached: false };
  } catch (e) {
    if (hit) {
      /* ⚠️ Хугацаа нь дууссан ч кэш байвал ТҮҮНИЙГ буцаана */
      return {
        times: hit.times,
        u: Float32Array.from(hit.u),
        v: Float32Array.from(hit.v),
        date,
        cached: true,
      };
    }
    throw e;
  }
}

/** Одоогийн цагт хамгийн ойр индекс — цуваа нь орон нутгийн цагаар */
export function nowIndex(field: WindField): number {
  const t = Date.now();
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < field.times.length; i++) {
    const d = Math.abs(field.times[i] - t);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

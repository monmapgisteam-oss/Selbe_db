'use client';

/**
 * ЭРСДЭЛИЙН ЗАГВАР — IoT-ийн НЭГТГЭСЭН үр дүн: голын усны чанар ба агаарын
 * бохирдол. Хоёр горим:
 *
 *   1. ОДООГИЙН БАЙДАЛ   — харуулуудын сүүлийн заалт, 72 цагийн цуваа.
 *   2. ТААМАГЛАЛЫН ЗАГВАР — үер / агаарын бохирдлын ГУРВАН түвшний хувилбар.
 *      ⚠️ Түвшин 1 нь ХАМГИЙН ХҮНД (онц аюултай), 3 нь хамгийн хөнгөн.
 *
 * ══════════════════════ ӨГӨГДЛИЙН ГАРАЛ — ИЛ ХЭЛНЭ ══════════════════════
 *
 * · ХАРУУЛЫН БАЙРШИЛ нь ЖИНХЭНЭ: `Example_data` FeatureServer-ийн 12 цэг,
 *   төрлийг нь `Torol` талбар хэлнэ («Усны харуул» / «Агаарын чанар»).
 *
 * · ЗААЛТ (усны түвшин, PM2.5 г.м.) нь ЖИШЭЭ ӨГӨГДӨЛ — тэр давхаргад утгын
 *   талбар БАЙХГҮЙ (зөвхөн OBJECTID, GlobalID, Torol) тул хаанаас ч уншигдах
 *   заалт алга. Тиймээс энд ЗАГВАРААР үүсгэнэ. Хэрэглэгчийг төөрөгдүүлэхгүйн
 *   тулд UI дээр «жишээ өгөгдөл» гэсэн тэмдэг ҮРГЭЛЖ гарна (`Ersdel.tsx`).
 *
 * · Цуваа нь ДЕТЕРМИНИСТ (үрээр тогтсон): render бүрд, таб солих бүрд ижил тоо
 *   гарна. `Math.random()` хэрэглэвэл график хэсэг бүрд өөрчлөгдөж, «амьд
 *   өгөгдөл» мэт хуурамч сэтгэгдэл төрүүлнэ.
 *
 * · Утгын хязгаар нь БОДИТ: Улаанбаатарын 8-р сарын агаар (MNS 4585:2016) ба
 *   Сэлбэ голын урсацын горим. Эх сурвалж бүрийн тайлбарыг талбар тус бүрд
 *   доор бичив.
 */

import { queryFeatures } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';

/* ══════════════════════ Харуулын эх сурвалж ══════════════════════ */

/**
 * ЖИШЭЭ ХАРУУЛЫН давхарга — захиалагчийн үүсгэсэн цэгэн FeatureServer.
 * ⚠️ Талбарууд: `OBJECTID`, `GlobalID`, `Torol` (төрөл). Утгын талбар БАЙХГҮЙ.
 */
export const ERSDEL_FS = {
  url: process.env.NEXT_PUBLIC_ARCGIS_ERSDEL
    ?? 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/Example_data/FeatureServer/0',
  /** Төрлийн талбар — «Усны харуул» / «Агаарын чанар» */
  typeField: 'Torol',
} as const;

/** Харуулын ТӨРӨЛ — `Torol` талбарын түүхий утгаас */
export type StationKind = 'water' | 'air';

/**
 * `Torol` → дотоод төрөл.
 * ⚠️ Түүхий утгыг `tr()`-ээр ОРЧУУЛЖ харьцуулж БОЛОХГҮЙ (Gazar.tsx-ийн
 * `STATUS_META`-тай ижил сургамж): англи горимд түлхүүр таарахгүй болно.
 */
const KIND_BY_TOROL: Record<string, StationKind> = {
  'Усны харуул': 'water',
  'Агаарын чанар': 'air',
};

export type Station = {
  oid: number;
  /** `Torol`-ын ТҮҮХИЙ утга — дэлгэцэд `KIND_LABEL` орчуулгыг хэрэглэнэ */
  torol: string;
  kind: StationKind;
  /** Дэлгэцийн нэр — «Усны харуул №3» */
  name: string;
  lon: number;
  lat: number;
};

export const KIND_LABEL: Record<StationKind, string> = {
  water: tr('Голын усны харуул'),
  air: tr('Агаарын чанарын харуул'),
};

/**
 * Харуулын цэгүүдийг татна.
 *
 * ⚠️ Геометр ХЭРЭГТЭЙ (зурагт биш — доод/дээд урсгалыг ӨРГӨРГӨӨР ялгахад):
 * `queryFeatures` нь геометр буцаадаггүй тул энд шууд REST-д хандана.
 */
export async function loadStations(): Promise<Station[]> {
  const url = `${ERSDEL_FS.url}/query`;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: `OBJECTID,${ERSDEL_FS.typeField}`,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });
  const res = await fetch(`${url}?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? 'ArcGIS error');
  type Feat = { attributes: Record<string, unknown>; geometry?: { x: number; y: number } };
  const feats: Feat[] = body.features ?? [];

  /** Төрөл тус бүрийн дугаарлалт — «Усны харуул №1…8» */
  const seq: Record<string, number> = {};
  return feats
    .filter((f) => f.geometry)
    .map((f) => {
      const torol = String(f.attributes[ERSDEL_FS.typeField] ?? '').trim();
      const kind = KIND_BY_TOROL[torol] ?? 'water';
      seq[kind] = (seq[kind] ?? 0) + 1;
      return {
        oid: Number(f.attributes.OBJECTID ?? 0),
        torol,
        kind,
        name: kind === 'water'
          ? tr('Усны харуул №{0}', seq[kind])
          : tr('Агаарын харуул №{0}', seq[kind]),
        lon: f.geometry!.x,
        lat: f.geometry!.y,
      };
    })
    .sort((a, b) => (a.kind === b.kind ? a.oid - b.oid : a.kind === 'water' ? -1 : 1));
}

/**
 * `queryFeatures`-ийг ХЭРЭГЛЭХГҮЙ шалтгаан дээр дурдсан (геометр). Гэхдээ
 * төрлийн задаргааг тоолоход л хэрэгтэй бол энэ хөнгөн хувилбар хангалттай.
 */
export const countByTorol = async (): Promise<Record<string, number>> => {
  const rows = await queryFeatures(ERSDEL_FS.url, { outFields: [ERSDEL_FS.typeField] });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[ERSDEL_FS.typeField] ?? '').trim() || '—';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

/* ══════════════════════ Детерминист санамсаргүй ══════════════════════ */

/** xmur3 — мөрөөс 32-бит үр */
function seedOf(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32 — хөнгөн, давтагдах PRNG */
function rngOf(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [-1..1] хүрээний зөөлөн шуугиан — хөрш цэгүүд хоорондоо холбоотой */
function noise(seed: string, i: number, smooth = 3): number {
  const r = rngOf(seedOf(seed));
  let acc = 0;
  // Хөдөлгөөнт дундаж: цэг бүр өмнөх `smooth` санамсаргүй утгаас бүрдэнэ тул
  // цуваа нь «цахилгаан оч» биш, жинхэнэ хэмжилт шиг гөлгөр болно.
  const buf: number[] = [];
  for (let k = 0; k <= i + smooth; k++) {
    buf.push(r() * 2 - 1);
    if (buf.length > smooth) buf.shift();
    acc = buf.reduce((s, v) => s + v, 0) / buf.length;
  }
  return acc;
}

/* ══════════════════════ Хэмжигдэхүүн ══════════════════════ */

export type Point = { t: number; v: number };

export type Metric = {
  key: string;
  label: string;
  unit: string;
  /** Аравтын орон */
  dp: number;
  /** ЮУГ хэмждэг, ямар стандартаар үнэлдэг вэ — hover-т */
  note: string;
  /** Хэвийн хязгаар (стандарт). Давбал «анхаарах», `bad`-аас цааш «хэтэрсэн» */
  warn: number;
  bad: number;
  /** Их утга САЙН уу (уусмал хүчилтөрөгч) — үнэлгээний чиглэл */
  higherBetter?: true;
  points: Point[];
  latest: number;
  min: number;
  max: number;
  avg: number;
};

export type StationLive = Station & { metrics: Metric[] };

/** Цувааны урт — 72 цаг, 1 цагийн алхам */
export const SPAN_H = 72;

/**
 * ⚠️ «Одоо»-г ЦАГААР бөөрөнхийлнө. Эс бөгөөс минут тутмын цагийн tick бүрд
 * бүх цуваа дахин үүсч, график чичирнэ.
 */
export const hourOf = (now: number) => Math.floor(now / 3_600_000) * 3_600_000;

/** Утгын үнэлгээ — «хэвийн / анхаарах / хэтэрсэн» */
export type Grade = 'ok' | 'warn' | 'bad';

export const gradeOf = (m: Metric, v = m.latest): Grade => {
  if (m.higherBetter) return v <= m.bad ? 'bad' : v <= m.warn ? 'warn' : 'ok';
  return v >= m.bad ? 'bad' : v >= m.warn ? 'warn' : 'ok';
};

export const GRADE_COLOR: Record<Grade, string> = {
  ok: 'var(--good-ink)',
  warn: 'var(--warn-ink)',
  bad: 'var(--bad-ink)',
};

export const GRADE_LABEL: Record<Grade, string> = {
  ok: tr('хэвийн'),
  warn: tr('анхаарах'),
  bad: tr('хэтэрсэн'),
};

/* ── Голын ус ── */

/**
 * УСНЫ ХЭМЖИГДЭХҮҮН — Сэлбэ голын 8-р сарын горим.
 *
 * ⚠️ Босго нь MNS 4586:1998 «Усны чанар — Гадаргын усны чанарын үзүүлэлт»-ийн
 * II зэрэглэлийн (ахуйн-соёл ариун цэврийн) хязгаараас. Урсац/түвшин нь
 * стандартгүй (гидрологийн горим) тул тэдгээрийн босго нь ҮЕРИЙН сэрэмжлүүлэх
 * түвшин — `FLOOD_LEVELS`-ийн 3-р түвшний утгаас авав.
 */
const WATER_METRICS = [
  {
    key: 'level', label: tr('Усны түвшин'), unit: tr('м'), dp: 2,
    note: tr('Харуул дээрх усны гүн. Үерийн сэрэмжлүүлэх түвшин — 0.9 м.'),
    warn: 0.9, bad: 1.6,
  },
  {
    key: 'flow', label: tr('Урсац'), unit: tr('м³/с'), dp: 2,
    note: tr('Түвшин–урсацын муруйгаар (Q = k·h^1.8) бодов. Сэрэмжлүүлэх — 26 м³/с.'),
    warn: 26, bad: 52,
  },
  {
    key: 'turb', label: tr('Булингар'), unit: 'NTU', dp: 0,
    note: tr('Усан дахь дүүжин бодис. MNS 4586:1998 — 25 NTU.'),
    warn: 25, bad: 60,
  },
  {
    key: 'do', label: tr('Уусмал хүчилтөрөгч'), unit: tr('мг/л'), dp: 2,
    note: tr('Их байх нь САЙН. MNS 4586:1998 — 6 мг/л-ээс багагүй.'),
    warn: 6, bad: 4, higherBetter: true as const,
  },
  {
    key: 'ph', label: tr('pH'), unit: '', dp: 2,
    note: tr('Хүчиллэг–шүлтлэг. MNS 4586:1998 — 6.5–8.5 хооронд.'),
    warn: 8.5, bad: 9,
  },
  {
    key: 'wtemp', label: tr('Усны температур'), unit: '°C', dp: 1,
    note: tr('Хүчилтөрөгчийн уусалт температураас урвуу хамааралтай.'),
    warn: 20, bad: 24,
  },
  {
    key: 'nh4', label: tr('Аммони азот (NH₄-N)'), unit: tr('мг/л'), dp: 2,
    note: tr('Ахуйн бохирдлын шууд шинж. MNS 4586:1998 — 0.5 мг/л.'),
    warn: 0.5, bad: 1.2,
  },
  {
    key: 'ec', label: tr('Эрдэсжилт'), unit: 'µS/см', dp: 0,
    note: tr('Цахилгаан дамжуулах чанар — уусмал давсны хэмжээг илэрхийлнэ.'),
    warn: 600, bad: 900,
  },
] as const;

/* ── Агаар ── */

/**
 * АГААРЫН ХЭМЖИГДЭХҮҮН — босго нь MNS 4585:2016 «Агаарын чанар. Агаар дахь
 * бохирдуулах бодисын зөвшөөрөгдөх дээд хэмжээ»-ийн 24 ЦАГИЙН дунджаас.
 *
 * ⚠️ Одоогийн заалт нь 8-р сарын (халаалтын бус улирлын) хэмжээнд — Улаанбаатарт
 * зун PM2.5 нь 10–40 µg/м³ байдаг. Өвлийн 200–500 µg/м³ нь `AIR_LEVELS`-ийн
 * ТААМАГЛАЛЫН хувилбарт (халаалтын улирлын инверси) гарна.
 */
const AIR_METRICS = [
  {
    key: 'pm25', label: 'PM2.5', unit: 'µg/м³', dp: 1,
    note: tr('2.5 мкм-ээс жижиг тоосонцор. MNS 4585:2016 — 24 цагийн дундаж 50 µg/м³.'),
    warn: 50, bad: 100,
  },
  {
    key: 'pm10', label: 'PM10', unit: 'µg/м³', dp: 0,
    note: tr('10 мкм-ээс жижиг тоосонцор. MNS 4585:2016 — 24 цагийн дундаж 100 µg/м³.'),
    warn: 100, bad: 200,
  },
  {
    key: 'so2', label: 'SO₂', unit: 'µg/м³', dp: 1,
    note: tr('Хүхэрлэг хий — нүүрсний шаталтын шинж. MNS 4585:2016 — 50 µg/м³.'),
    warn: 50, bad: 100,
  },
  {
    key: 'no2', label: 'NO₂', unit: 'µg/м³', dp: 1,
    note: tr('Азотын давхар исэл — тээврийн шинж. MNS 4585:2016 — 40 µg/м³.'),
    warn: 40, bad: 85,
  },
  {
    key: 'co', label: 'CO', unit: tr('мг/м³'), dp: 2,
    note: tr('Нүүрстөрөгчийн дутуу исэл. MNS 4585:2016 — 8 цагийн дундаж 10 мг/м³.'),
    warn: 10, bad: 20,
  },
  {
    key: 'aqi', label: tr('АЧИ (агаарын чанарын индекс)'), unit: '', dp: 0,
    note: tr('PM2.5-аас US EPA-ийн эвдрэлийн цэгээр бодов. 100-аас дээш — эмзэг бүлэгт хортой.'),
    warn: 100, bad: 150,
  },
  {
    key: 'atemp', label: tr('Агаарын температур'), unit: '°C', dp: 1,
    note: tr('Инверсийн эрсдэлийг үнэлэхэд — хүйтэн, салхигүй үед бохирдол хуримтлагдана.'),
    warn: 30, bad: 34,
  },
  {
    key: 'wind', label: tr('Салхины хурд'), unit: tr('м/с'), dp: 1,
    note: tr('Бага байх нь МУУ: 1 м/с-ээс доош салхинд бохирдол тархахаа болино.'),
    warn: 1.5, bad: 0.8, higherBetter: true as const,
  },
] as const;

/**
 * PM2.5 → АЧИ (US EPA 2024 эвдрэлийн цэг).
 * ⚠️ Монголд өөрийн индекс албан ёсоор батлагдаагүй тул олон улсын нийтлэг
 * EPA хуваарийг хэрэглэв — UI дээр ч ингэж тэмдэглэнэ.
 */
export function aqiOfPm25(c: number): number {
  const bp: [number, number, number, number][] = [
    [0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300],
    /* ⚠️ EPA 2024: «Аюултай» муж нь 225.5–325.4 → 301–500. Урьд нь 225.5–500
       гэж сунгаснаас PM2.5=325 үед 373 (зөв нь 500) гарч, хамгийн аюултай
       агшинд индексийг 130 нэгжээр ДУТУУ харуулдаг байв. 325.4-өөс дээш нь
       EPA-д «индексээс хальсан» — 500-д тогтооно (доорх return). */
    [225.5, 325.4, 301, 500],
  ];
  for (const [cl, ch, il, ih] of bp) {
    if (c <= ch) return Math.round(((ih - il) / (ch - cl)) * (c - cl) + il);
  }
  return 500;
}

/** АЧИ-ийн ангилал — өнгө нь утгаас (зөвхөн муу тал руу) */
export const AQI_BAND = (a: number): { label: string; color: string } =>
  a <= 50 ? { label: tr('Сайн'), color: 'var(--good)' }
    : a <= 100 ? { label: tr('Дунд зэрэг'), color: 'var(--warn)' }
      : a <= 150 ? { label: tr('Эмзэг бүлэгт хортой'), color: 'var(--warn)' }
        : a <= 200 ? { label: tr('Хортой'), color: 'var(--bad)' }
          : a <= 300 ? { label: tr('Маш хортой'), color: 'var(--bad)' }
            : { label: tr('Аюултай'), color: 'var(--bad)' };

/* ══════════════════════ Цуваа үүсгэх ══════════════════════ */

/**
 * ХАРУУЛ БҮРИЙН цуваа. Бүх утга детерминист (үр = харуулын OID + талбар).
 *
 * ⚠️ ХОЁР бодит физик хамаарлыг ЗОРИУДААР баримталсан — эс бөгөөс «санамсаргүй
 * тоо» нь мэргэжлийн нүдэнд шууд илэрнэ:
 *
 *   · УС: түвшин ↑ → урсац ↑ (Q = k·h^1.8 рейтингийн муруй) → булингар ↑,
 *     эрдэсжилт ↓ (шингэрэлт), аммони ↓. Доод урсгал руу (өмнө зүг, бага
 *     өргөрөг) бохирдол нэмэгдэнэ — гэр хорооллын ахуйн ус нийлдэг.
 *
 *   · АГААР: PM нь ӨГЛӨӨ 07–09 ба ОРОЙ 19–23 цагт (халаалт, зуух) оргилдоно,
 *     14–16 цагт хамгийн бага. Салхи ↑ → PM ↓. NO₂ нь тээврийн оргилыг дагана.
 */
export function buildMetrics(st: Station, now: number): Metric[] {
  const t0 = hourOf(now) - (SPAN_H - 1) * 3_600_000;

  /**
   * ДООД УРСГАЛЫН коэффициент 0..1 — өргөрөг бага (өмнөд) = доод урсгал.
   * Сэлбэ гол хойноос урагш урсдаг тул энэ нь газарзүйн БОДИТ дараалал.
   */
  const north = 47.9762;
  const south = 47.9584;
  const down = Math.min(1, Math.max(0, (north - st.lat) / (north - south)));

  /** Хур борооны ЯВДАЛ — 30 цагийн өмнө 14 мм бороо (цуваанд бодит хэлбэр өгнө) */
  const rainAt = SPAN_H - 30;
  const rain = (i: number) => {
    const d = i - rainAt;
    if (d < 0) return 0;
    // Хурдан өсөж (2 цаг), удаан татрах (18 цаг) — жинхэнэ гидрографын хэлбэр
    return d < 2 ? d / 2 : Math.exp(-(d - 2) / 18);
  };

  const out: Metric[] = [];
  /** Нэг цуваа тооцоод `Metric` болгож савлана */
  const push = (
    def: (typeof WATER_METRICS | typeof AIR_METRICS)[number],
    fn: (i: number, hour: number) => number,
  ) => {
    const points: Point[] = [];
    for (let i = 0; i < SPAN_H; i++) {
      const t = t0 + i * 3_600_000;
      const hour = new Date(t).getHours();
      points.push({ t, v: Math.max(0, fn(i, hour)) });
    }
    const vals = points.map((p) => p.v);
    out.push({
      ...def,
      higherBetter: 'higherBetter' in def ? def.higherBetter : undefined,
      points,
      latest: vals[vals.length - 1],
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: vals.reduce((s, v) => s + v, 0) / vals.length,
    } as Metric);
  };

  if (st.kind === 'water') {
    const sd = (k: string) => `w${st.oid}:${k}`;
    /** Түвшин — суурь + борооны хариу + шуугиан */
    const level = (i: number) =>
      0.34 + down * 0.12 + rain(i) * 0.42 + noise(sd('level'), i) * 0.03;
    /** Рейтингийн муруй — голын хөндлөн огтлолоос (k нь доод урсгалд том) */
    const flow = (i: number) => (1.9 + down * 1.1) * Math.pow(level(i), 1.8);

    for (const def of WATER_METRICS) {
      switch (def.key) {
        case 'level': push(def, (i) => level(i)); break;
        case 'flow': push(def, (i) => flow(i)); break;
        case 'turb':
          // Булингар нь урсацын квадрат язгууртай пропорциональ (наносны тээвэрлэлт)
          push(def, (i) => 8 + down * 6 + 46 * Math.pow(flow(i), 0.75) + noise(sd('turb'), i) * 4);
          break;
        case 'do':
          // Температур ↑ ба бохирдол ↑ → хүчилтөрөгч ↓
          push(def, (i, h) =>
            9.4 - down * 2.3 - 0.11 * (13 + 3.4 * Math.sin(((h - 15) / 24) * 2 * Math.PI))
            + noise(sd('do'), i) * 0.25);
          break;
        case 'ph':
          push(def, (i, h) => 7.85 - down * 0.18 + 0.12 * Math.sin(((h - 16) / 24) * 2 * Math.PI) + noise(sd('ph'), i) * 0.06);
          break;
        case 'wtemp':
          push(def, (i, h) => 13 + 3.4 * Math.sin(((h - 15) / 24) * 2 * Math.PI) - rain(i) * 1.6 + noise(sd('wt'), i) * 0.4);
          break;
        case 'nh4':
          // Ахуйн бохирдол доод урсгалд; урсац ихсэхэд ШИНГЭРНЭ
          push(def, (i) => (0.06 + down * 0.62) / (1 + rain(i) * 1.4) + noise(sd('nh4'), i) * 0.05);
          break;
        case 'ec':
          push(def, (i) => (215 + down * 260) / (1 + rain(i) * 0.55) + noise(sd('ec'), i) * 14);
          break;
      }
    }
    return out;
  }

  /* ── Агаар ── */
  const sd = (k: string) => `a${st.oid}:${k}`;
  /** Хоногийн хэлбэр: өглөө/оройн зуухны оргил, өдрийн доод цэг */
  const diurnal = (h: number) =>
    0.55
    + 0.75 * Math.exp(-((h - 8) ** 2) / 6)
    + 0.95 * Math.exp(-((h - 21) ** 2) / 9)
    - 0.35 * Math.exp(-((h - 15) ** 2) / 12);
  /** Салхи — өдөр эрчимжиж, шөнө намдана (бохирдлын шингэрэлтийн гол хүчин зүйл) */
  const wind = (i: number, h: number) =>
    Math.max(0.3, 1.9 + 1.5 * Math.sin(((h - 15) / 24) * 2 * Math.PI) + noise(sd('wind'), i) * 0.5);
  /** Гэр хорооллын нөлөө — ХОЙД (дээд) талд илүү, төслийн талбайн хойд захад */
  const ger = 1 + (1 - down) * 0.45;
  const pm25 = (i: number, h: number) =>
    Math.max(3, (9 + 14 * diurnal(h) * ger) / (0.6 + wind(i, h) * 0.5) + noise(sd('pm'), i) * 2.4);

  for (const def of AIR_METRICS) {
    switch (def.key) {
      case 'pm25': push(def, pm25); break;
      case 'pm10':
        // Хатуу тоосонцор — PM2.5-аас гадна замын/хөрсний тоос (салхитай үед ИХ)
        push(def, (i, h) => pm25(i, h) * 2.05 + wind(i, h) * 6 + noise(sd('pm10'), i) * 5);
        break;
      case 'so2':
        push(def, (i, h) => 4 + 11 * diurnal(h) * ger + noise(sd('so2'), i) * 1.5);
        break;
      case 'no2':
        // Тээврийн оргил — 08 ба 18 цаг (зуухны оргилоос ӨӨР хэлбэр)
        push(def, (i, h) =>
          11 + 16 * (Math.exp(-((h - 8) ** 2) / 4) + Math.exp(-((h - 18) ** 2) / 5))
          + noise(sd('no2'), i) * 2.2);
        break;
      case 'co':
        push(def, (i, h) => 0.45 + 0.9 * diurnal(h) * ger + noise(sd('co'), i) * 0.12);
        break;
      case 'aqi': push(def, (i, h) => aqiOfPm25(pm25(i, h))); break;
      case 'atemp':
        push(def, (i, h) => 17 + 8.5 * Math.sin(((h - 15) / 24) * 2 * Math.PI) + noise(sd('at'), i) * 1.1);
        break;
      case 'wind': push(def, wind); break;
    }
  }
  return out;
}

/** Бүх харуулын жишээ заалт — байршил нь ЖИНХЭНЭ, утга нь ЗАГВАР */
export const buildLive = (stations: Station[], now: number): StationLive[] =>
  stations.map((st) => ({ ...st, metrics: buildMetrics(st, now) }));

/* ══════════════════════ ТААМАГЛАЛЫН ЗАГВАР ══════════════════════ */

export type HazardKey = 'flood' | 'air';
export type LevelKey = 1 | 2 | 3;

export const HAZARDS: { key: HazardKey; title: string; icon: string; desc: string }[] = [
  {
    key: 'flood',
    title: tr('Голын үер'),
    icon: 'waves',
    desc: tr('Сэлбэ голын хур борооны үер — усны түвшин, урсац, үерлэх зурвас'),
  },
  {
    key: 'air',
    title: tr('Агаарын бохирдол'),
    icon: 'flame',
    desc: tr('Халаалтын улирлын инверси — PM2.5-ийн тархалт, өртөх бүс'),
  },
];

/** Түвшний нэр — ⚠️ 1 нь ХАМГИЙН ХҮНД */
export const LEVELS: { key: LevelKey; title: string; short: string; color: string }[] = [
  { key: 1, title: tr('1-р түвшин — Онц аюултай'), short: tr('1-р түвшин'), color: 'var(--bad)' },
  { key: 2, title: tr('2-р түвшин — Аюултай'), short: tr('2-р түвшин'), color: 'var(--warn)' },
  { key: 3, title: tr('3-р түвшин — Анхааруулах'), short: tr('3-р түвшин'), color: 'var(--data)' },
];

/**
 * ҮЕРИЙН ГУРВАН ХУВИЛБАР — ДАВТАГДАХ ХУГАЦААГААР.
 *
 * ⚠️ Эдгээр нь ЗАГВАРЫН ТААМАГ — гидрологийн албан ёсны тооцоо БИШ. Сэлбэ голын
 * дээд ай сав (~48 км²), хотын хатуу гадаргуугийн эзлэх хувь өндөр (урсацын
 * коэффициент 0.55–0.7) гэсэн таамаг дээр тогтов. Түвшин бүрийн `reach` нь
 * голын полигоны ИРМЭГЭЭС хэдэн метр ус халихыг заана — үерийн зурвас түүгээр
 * буфер татаж байгуулагдана (`ersdelGeom.ts`).
 *
 * ⚠️ ЭНЭ НЬ CRF ЗАГВАРЧЛАЛААС ТУСДАА. «Усны тархалт» самбар дахь анимаци нь
 * ОБЕГ-ын (NEMA) гидравлик загварчлалын бодит үр дүн (`public/uyr/`); харин
 * аюулын ТҮВШИН ба хохирлын тооцоо нь энэ давтагдалд суурилсан хувилбарууд.
 * Хоёулаа зэрэг харагдана: доор нь урсаж буй бодит ус, дээр нь сонгосон
 * түвшний зурвас.
 */
export type FloodParams = {
  /** Давтагдах хугацаа (жил) */
  period: number;
  /** 24 цагийн хур тунадас (мм) */
  rain: number;
  /** Оргил урсац (м³/с) */
  peak: number;
  /** Усны түвшний өсөлт (м) */
  rise: number;
  /** Голын ирмэгээс үерлэх зурвасын өргөн (м) — буфер энэ зайгаар тавигдана */
  reach: number;
  /** Үерийн дундаж гүн (м) — 3D-д усны гадаргууг энэ өндрөөр өргөнө */
  depth: number;
  /** Урьдчилан сэрэмжлүүлэх хугацаа (цаг) */
  lead: number;
};

export const FLOOD_LEVELS: Record<LevelKey, FloodParams> = {
  1: { period: 100, rain: 72, peak: 96, rise: 2.6, reach: 135, depth: 1.8, lead: 3 },
  2: { period: 20, rain: 48, peak: 52, rise: 1.6, reach: 85, depth: 1.1, lead: 6 },
  3: { period: 5, rain: 31, peak: 26, rise: 0.9, reach: 45, depth: 0.6, lead: 12 },
};

export type AirParams = {
  /** Оргил PM2.5 (µg/м³) */
  pm25: number;
  /** АЧИ */
  aqi: number;
  /** Инверсийн давхаргын өндөр (м) — 3D-д утааны давхарга энэ өндөрт зурагдана */
  inversion: number;
  /** Салхины хурд (м/с) */
  wind: number;
  /** Салхины чиглэл (градус, ХААНААС үлээж буй — 315 = баруун хойноос) */
  windDir: number;
  /** Утааны сэвсгэрийн урт (м) — эх үүсвэрээс салхины дагуу */
  plume: number;
  /** Хажуу тийш тархалт (м) */
  spread: number;
  /** Үргэлжлэх хугацаа (цаг) */
  hours: number;
};

/**
 * АГААРЫН БОХИРДЛЫН ГУРВАН ХУВИЛБАР — халаалтын улирлын инверсийн үзэгдэл.
 *
 * ⚠️ Түвшин 1 нь Улаанбаатарын өвлийн ХАМГИЙН хүнд өдрүүдийн бодит хэмжээнд
 * (PM2.5 300+ µg/м³, АЧИ 350+) тохирно. Инверсийн давхарга нам болох тусам
 * бохирдол хуримтлагдана — тиймээс түвшин 1-д `inversion` хамгийн БАГА.
 */
export const AIR_LEVELS: Record<LevelKey, AirParams> = {
  /* ⚠️ aqi нь aqiOfPm25(320)-тай нийцнэ — EPA 2024 засварын дараа 371 → 489 */
  1: { pm25: 320, aqi: 489, inversion: 90, wind: 0.6, windDir: 315, plume: 2400, spread: 900, hours: 14 },
  2: { pm25: 165, aqi: 215, inversion: 180, wind: 1.4, windDir: 315, plume: 1600, spread: 620, hours: 9 },
  3: { pm25: 85, aqi: 166, inversion: 320, wind: 2.6, windDir: 300, plume: 1000, spread: 420, hours: 6 },
};

/* ══════════════════════ Хохирлын үнэлгээ ══════════════════════ */

/**
 * ХОХИРЛЫН АНГИЛАЛ — нэгж үнэ нь объектын ТӨРЛӨӨС хамаарна.
 *
 * ⚠️ 2026-08-27: Урьд нь зөвхөн ГЕОМЕТРИЙН төрлөөр (талбай/шугам/цэг) байсан.
 * Тэр нь бодит тоо гаргахад ЭВДЭРСЭН байв — амьдаар хэмжив:
 *
 *   · 1-р түвшний үерийн зурваст 2,018 МОД орох бөгөөд «худаг, тулгуур»-ын
 *     3.4 сая ₮ нэгж үнээр 6.9 ТЭРБУМ ₮ гарч, нийт дүнг утгагүй хөөргөж байлаа.
 *   · Явган зам (983 полигон) ба ногоон байгууламжид БАРИЛГЫН 145,000 ₮/м²
 *     тавигдаж байв — хатуу хучилтын сэргээлт түүнээс 2.5 дахин хямд.
 *
 * ⚠️ ТААМАГ хэвээр: гэрээний бодит үнээс НЭГ Ч мөр уншаагүй. Түвшин бүрд
 * эрчмийн коэффициентээр (`SEVERITY`) үржинэ.
 */
export type DamageClass =
  | 'building' | 'paved' | 'green' | 'pipe' | 'bridge' | 'tree' | 'amenity' | 'point';

export const DAMAGE_RATE: Record<
  DamageClass,
  { rate: number; per: 'm2' | 'm' | 'ea'; unit: string; label: string }
> = {
  building: { rate: 145_000, per: 'm2', unit: tr('₮/м²'), label: tr('Барилга') },
  paved: { rate: 55_000, per: 'm2', unit: tr('₮/м²'), label: tr('Хатуу хучилт') },
  green: { rate: 18_000, per: 'm2', unit: tr('₮/м²'), label: tr('Ногоон байгууламж') },
  pipe: { rate: 92_000, per: 'm', unit: tr('₮/м'), label: tr('Инженерийн шугам') },
  bridge: { rate: 350_000, per: 'm', unit: tr('₮/м'), label: tr('Гүүрэн байгууламж') },
  tree: { rate: 250_000, per: 'ea', unit: tr('₮/ш'), label: tr('Мод') },
  amenity: { rate: 1_200_000, per: 'ea', unit: tr('₮/ш'), label: tr('Тохижилтын төхөөрөмж') },
  point: { rate: 3_400_000, per: 'ea', unit: tr('₮/ш'), label: tr('Худаг, тулгуур') },
};

/**
 * Давхарга → ангилал. Каталогийн `GROUP_LAYERS` бүлэглэлийг ЭНД ХЭРЭГЛЭЖ
 * БОЛОХГҮЙ: `et:24` (Барилга), `et:29`/`et:27`/`dugui` (зам), `nogoon`, `tgl`
 * зэрэг нь 2026-08-24-ний webmap шилжилтээр бүлгээс ГАРСАН ч `LAYERS`-д хэвээр
 * (`services.ts` §GROUP_LAYERS-ийн тайлбар) — `groupOf()` тэдгээрт `null`
 * буцаана.
 */
const CLASS_BY_ID: Record<string, DamageClass> = {
  // Барилга
  'et:24': 'building', 'sb:4': 'building',
  'gazar:building': 'building', 'mon:building': 'building',
  // Хатуу хучилт — зам, явган зам, дугуйн зам
  'et:29': 'paved', 'et:27': 'paved', 'dugui': 'paved',
  'sb:2': 'paved', 'sb:3': 'paved', 'sb:15': 'paved', 'sb:5': 'paved',
  'road': 'paved', 'roadOld': 'paved',
  // Ногоон
  'nogoon': 'green', 'sb:1': 'green',
  'sb:0': 'tree',
  // Тохижилт — тоглоом, спорт, сүүдрэвч
  'tgl': 'amenity', 'sb:7': 'amenity', 'sb:8': 'amenity',
  'sb:10': 'amenity', 'sb:11': 'amenity', 'sb:13': 'amenity', 'sb:14': 'amenity',
  'et:12': 'bridge',
};

/**
 * ⚠️ Тодорхойлогдоогүй ТАЛБАЙН давхаргад `paved` (55,000 ₮/м²) авна — `building`
 * бол дүнг хөөрөгдөж, `green` бол дутуу хэлнэ. Инженерийн багцын полигонууд
 * (`po:*`, `Өндөржилт`, `Тохижилт`) бодитоор хатуу хучилтад ойр.
 */
export const classOf = (id: string, geom: 'area' | 'line' | 'point'): DamageClass =>
  CLASS_BY_ID[id] ?? (geom === 'line' ? 'pipe' : geom === 'point' ? 'point' : 'paved');

/**
 * ҮЕРТ ХОХИРОГЧ БИШ давхаргууд — усны биетүүд.
 *
 * ⚠️ Үерийн зурвас нь ГОЛООС үүсдэг тул гол (`sb:16`) нь тодорхойлолтоороо
 * 100% зурвас дотор байна. Түүнийг «өртсөн объект» гэж тоовол 46 га усан
 * гадаргуу хохирлын дүнд ороод зогсохгүй, зурагт УЛААНААР будагдаж «гол
 * эвдэрсэн» гэсэн утгагүй дүр зураг гарна.
 */
export const FLOOD_SKIP_IDS = new Set(['sb:16', 'usan-san', 'd3:usan_san']);

/** Түвшний эрчим — хохирлын коэффициент (1-р түвшин хамгийн хүнд) */
export const SEVERITY: Record<LevelKey, number> = { 1: 1, 2: 0.55, 3: 0.25 };

/**
 * АГААРЫН бохирдол нь БАРИЛГЫГ эвддэггүй — хохирол нь ЭРҮҮЛ МЭНДИЙН.
 * Тиймээс агаарын хувилбарт өртсөн барилгын м²-ээр биш, ӨРТӨЛТӨӨР үнэлнэ:
 * барилгын талбайгаас оршин суугчийн тоог тооцоолж (35 м²/хүн), хүн тутамд
 * ноогдох өдрийн эрүүл мэндийн зардлын таамгаар үржүүлнэ.
 *
 * ⚠️ Энэ нь ЭРҮҮЛ МЭНДИЙН ЭДИЙН ЗАСГИЙН бүдүүн таамаг (ДЭМБ-ын арга зүйн
 * зарчмаар «өртөлт × нэгж зардал») — эмнэлгийн бодит бүртгэлээс уншаагүй.
 */
export const EXPOSURE = {
  /** Нэг оршин суугчид ноогдох орон сууцны талбай (м²) */
  m2PerPerson: 35,
  /** Өртсөн хүн тутмын нэг өдрийн эрүүл мэндийн зардлын таамаг (₮) */
  costPerPersonDay: 12_500,
} as const;

/** Хувилбарын нэг мөрийн хураангуй — самбарын толгойд */
export const scenarioNote = (h: HazardKey, lv: LevelKey): string => {
  if (h === 'flood') {
    const p = FLOOD_LEVELS[lv];
    return tr('{0} жилд нэг давтагдах үер · 24 цагт {1} мм хур · оргил урсац {2} м³/с · түвшин +{3} м',
      p.period, p.rain, p.peak, p.rise);
  }
  const p = AIR_LEVELS[lv];
  return tr('Инверси {0} м · салхи {1} м/с · PM2.5 {2} µg/м³ · АЧИ {3} · {4} цаг үргэлжилнэ',
    p.inversion, p.wind, p.pm25, p.aqi, p.hours);
};

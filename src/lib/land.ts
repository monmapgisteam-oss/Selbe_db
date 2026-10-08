'use client';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН НЭГДСЭН АМЬД ТООЦОО — `PARCEL_LEFT`.
 *
 * ⚠️ Урьд нь «Газар чөлөөлөлт» харагдац АМЬД (90%), харин Ерөнхий дашбоард/
 * Тайлан нь илтгэлээс бэхлэгдсэн ӨӨР тоо (95.5% · LAND ◆) харуулж хоёр газар
 * ЗӨРДӨГ байв. Одоо бүх дашбоард ЭНЭ ганц тооцооноос уншина (хэрэглэгчийн
 * шийдвэр, 2026-08-13: хатуу тоо байхгүй, бүгд үйлчилгээнээс).
 *
 * ⚠️ 2026-09-06: ХОЁР АНГИЛАЛ болов. Шинэ эх (`Selbe_parcel_20260906`) нь
 * төлөв ба шалтгааныг НЭГ талбарт нийлүүлсэн тул:
 *     чөлөөлсөн = «Бүрэн чөлөөлсөн»
 *     үлдсэн    = БУСАД БҮГД (утга нь өөрөө шалтгаан)
 * Хуучин «Цэвэрлэсэн нэгж талбар» ангилал эх өгөгдөлд байхгүй болсон тул
 * `cleaned` нь ҮРГЭЛЖ 0 — талбарыг хассангүй, дуудагчид (`Gazar`,
 * `schemDetail`) эвдрэхгүйн тулд. Хувь = чөлөөлсөн ÷ нийт.
 */

import { queryGroup, count, sum, sqlStr, type Row } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import { PARCEL_CLEARED, PARCEL_LEFT } from '@/lib/services';
import { text } from '@/lib/format';
import { register } from '@/lib/dataBus';

/* ══════════════ ТӨЛӨВИЙН ХЭВИЙНШҮҮЛЭЛТ — `Gazar.tsx` ба энэ файл ХУВААЛЦАНА ══════════════ */

/**
 * Харьцуулах түлхүүр — зай нэгтгэж (NBSP орно), төгсгөлийн цэг/зайг хасаж,
 * жижиг үсгээр. ЗӨВХӨН ЖИШИХЭД — хадгалах/харуулах утга БИШ.
 */
const cmpKey = (v: unknown): string =>
  String(v ?? '').replace(/\s+/g, ' ').trim().replace(/[\s.]+$/, '').toLocaleLowerCase('mn');
const CLEARED_KEY = cmpKey(PARCEL_CLEARED);

/**
 * «Бүрэн чөлөөлсөн»-ийн АЛЬ Ч бичиглэл мөн үү.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь `land.ts` ба `Gazar.tsx`
 *    хоёул `=== PARCEL_CLEARED` гэж ЯГ таарцаар жишдэг байв. Үйлчилгээнд
 *    «Бүрэн чөлөөлсөн.», «Бүрэн  чөлөөлсөн », «бүрэн чөлөөлсөн» гэх мэт
 *    бичиглэл орвол тэр мөрүүд «чөлөөлсөн»-д ТООЛОГДОХГҮЙ, харин «үлдсэн»
 *    болон «шалтгаан»-д тусдаа мөр болж ороод чөлөөлөлтийн хувь чимээгүй
 *    буурна. Одоо бүх бичиглэлийг НЭГ ангилалд нийлүүлнэ. Амьдаар
 *    (2026-10-01) бүх 1,920 мөр цэвэр — энэ нь урьдчилсан хамгаалалт.
 * ⚠️ Бусад төлөвийн ТҮҮХИЙ утга ХӨНДӨГДӨХГҮЙ (`parcelEdit.ts`-ийн 2-р дүрэм):
 *    зөвхөн «чөлөөлсөн» эсэхийг шийдэхэд хэвийншүүлнэ.
 */
export const isClearedStatus = (v: unknown): boolean => cmpKey(v) === CLEARED_KEY;

/**
 * Төлөвийн БҮЛГИЙН түлхүүр: «Бүрэн чөлөөлсөн»-ийн бүх бичиглэл → `PARCEL_CLEARED`,
 * хоосон/«—» → `''` (дуудагч өөрийн «Тодорхойгүй» шошгыг тавина), бусад нь
 * trim хийсэн ТҮҮХИЙ утга (өмнөх дүрэм хэвээр).
 */
export function statusKey(v: unknown): string {
  if (isClearedStatus(v)) return PARCEL_CLEARED;
  const s = text(v, '').trim();
  return s === '—' ? '' : s;
}

/**
 * Төлөвийн баганыг ДАРЖ ШҮҮХ WHERE — бүлгийн ТҮҮХИЙ утгуудаас (`Gazar.tsx`).
 *
 * ⚠️ 2026-10-09: «Тодорхойгүй» багана урьд нь зөвхөн `IS NULL OR = ''` байсан тул
 *    `statusKey`-ээр тэр бүлэгт нийлдэг «—» ба ЗӨВХӨН ЗАЙТАЙ утгын мөрүүд баганад
 *    ТООЛОГДСОН атлаа дарж шүүхэд газрын зурагт ГАРДАГГҮЙ байв. Одоо түүхий утга бүрийг
 *    (`''`-ээс бусад) `=`-ээр нэмнэ. Бусад төлөвт түүхий утга алга бол `value`-гаар.
 */
export function statusRawsWhere(field: string, raws: Iterable<string>, unknown: boolean, value: string): string {
  const eq = [...raws].filter((x) => x !== '').map((x) => `${field} = ${sqlStr(x)}`);
  if (unknown) return `(${[`${field} IS NULL`, `${field} = ''`, ...eq].join(' OR ')})`;
  return eq.length ? `(${eq.join(' OR ')})` : `${field} = ${sqlStr(value)}`;
}

/**
 * Талбайн НӨХӨЛТИЙН мөрүүд: `area_m2` хоосон, гараар бичсэн `Талб_1` бөглөгдсөн.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): талбайн дүрэм НЭГ — `area_m2 ?? Талб_1`
 *    (`parcelEdit.rowToParcel`-тэй ижил COALESCE). Энэ FeatureServer нь
 *    outStatistics-т COALESCE авдаггүй тул `SUM(area_m2)` + энэ нөхцөлөөр
 *    `SUM(Талб_1)` гэсэн ХОЁР асуулгаар бүрдүүлнэ. `land.ts` ба `Gazar.tsx`
 *    ХОЁУЛАА энэ нөхцөлийг ашиглана — нэг нь л нөхвөл «Нийт талбай» зөрнө.
 */
export const parcelAltAreaWhere = (): string =>
  `${PARCEL_LEFT.fields.area} IS NULL AND ${PARCEL_LEFT.fields.areaAlt} IS NOT NULL`;

export type LandStatus = {
  /** Нийт нэгж талбар (бүх төлөв, хоосон Tuluv орно) */
  total: number;
  /** Нийт талбай, м² */
  areaM2: number;
  cleared: number;
  cleaned: number;
  remaining: number;
  /**
   * Шийдвэрлэгдсэн — одоо `cleared`-тай ИЖИЛ (`cleaned` нь үргэлж 0).
   * ⚠️ Талбарыг үлдээсэн нь дуудагчийг эвдэхгүйн тулд; шинэ код `cleared`-ыг
   *    хэрэглэ.
   */
  resolved: number;
  /** resolved ÷ total × 100 (0 хуваарьт null) */
  pct: number | null;
  /** Төлөв бүрийн тоо — жагсаалтад байгаа дарааллаар нь */
  byStatus: { label: string; n: number; areaM2: number }[];
  /**
   * ҮЛДСЭН талбарын шалтгаан — тоогоор буурах эрэмбээр.
   * ⚠️ Шинэ эхэд шалтгаан нь ТӨЛӨВИЙН талбартай НЭГ тул энэ жагсаалт нь
   *    `byStatus`-аас «Бүрэн чөлөөлсөн»-ийг хассантай ТЭНЦҮҮ — нэмэлт асуулга
   *    ЯВУУЛАХГҮЙ (урьд нь гурав дахь `queryGroup` явдаг байв).
   */
  reasons: { label: string; n: number }[];
};

let cache: Promise<LandStatus> | null = null;
/**
 * ⚠️ 2026-10-05: кэшийн НАС — `live.SESSION_TTL_MS`-тэй ИЖИЛ 5 мин (тэндээс импортлохгүй:
 *    `live.loadClearance` энэ файлыг динамикаар ачаалдаг, мөчлөг үүсгэхгүй). Урьд нь TTL-гүй
 *    тул өөр хэрэглэгчийн засвар хуудсаа refresh хийтэл харагддаггүй байв.
 */
const CACHE_TTL_MS = 5 * 60_000;
let cacheAt = 0;

/**
 * ⚠️ КЭШИЙГ ӨГӨГДЛИЙН АВТОБУСАД ХОЛБОВ (2026-08-31). Энэ нь `cached()`-ээр
 * ороогдоогүй ГАРААР бичсэн кэш тул `invalidate('PARCEL_LEFT')` түүнийг
 * хөнддөггүй байв. «Газар чөлөөлөлт» дээр нэгж талбарын төлөв засмагц
 * дашбоард, тайлан бүгд шинэчлэгддэг атлаа ЭНЭ тооцоо сешн дуустал хуучин
 * хувиа барьж, хоёр газар өөр тоо харуулах болно.
 */
register(() => { cache = null; }, ['PARCEL_LEFT']);

/** Шалтгааны нэрийг Gazar-тай ИЖИЛ дүрмээр цэвэрлэнэ (арын зай, төгсгөлийн «.») */
const cleanReason = (v: unknown): string => {
  const s = text(v).trim().replace(/\.$/, '').trim();
  return !s || s === '—' ? tr('Тодорхойгүй') : s;
};

/** Нэг удаа татаад кэшлэнэ — олон дашбоард зэрэг дуудахад нэг л багц хүсэлт явна */
export function loadLandStatus(): Promise<LandStatus> {
  if (!cache || Date.now() - cacheAt > CACHE_TTL_MS) {
    const L = PARCEL_LEFT;
    cacheAt = Date.now();
    const mine = Promise.all([
      queryGroup(
        L.url,
        L.fields.status,
        [count(L.oid, 'n'), sum(L.fields.area, 'a')],
      ),
      /**
       * ⚠️ `areaAlt` НӨХӨЛТ: `area_m2` (кадастр) хоосон ч гараар бичсэн `Талбай`
       * утгатай мөрүүд бий (2026-08: 9 мөр, 4,328 м²) — эдгээрийг алгасвал
       * «Нийт талбай» дутуу гарна (services.ts-ийн `areaAlt`-ийн амлалт).
       * Эдгээр FeatureServer outStatistics-т SQL илэрхийлэл (COALESCE) авдаггүй
       * тул тусдаа асуулгаар татаж клиент талд нэмнэ.
       */
      queryGroup(
        L.url,
        L.fields.status,
        [sum(L.fields.areaAlt, 'a')],
        parcelAltAreaWhere(),
      ),
    ]).then(([statusRows, altRows]) => buildLandStatus(statusRows, altRows));
    cache = mine;
    // Амжилтгүй амлалтыг кэшлэхгүй — «дахин оролдох» сэргэх боломжтой байг
    /* ⚠️ 2026-10-05: зөвхөн ӨӨРӨӨ идэвхтэй үед (`live.cached`-ийн `p === mine` хаалттай ижил) —
       TTL-ээр шинэ хүсэлт эхэлсний дараа хуучин нь унахад шинэ кэшийг устгахгүй. */
    mine.catch(() => { if (cache === mine) cache = null; });
  }
  return cache;
}

/**
 * Хоёр асуулгын мөрөөс `LandStatus` угсарна — ЦЭВЭР функц (`land.check.mjs`).
 *
 * ⚠️ 2026-10-01: `loadLandStatus`-ийн `.then` дотроос ГАРГАВ — сүлжээгүйгээр
 *    шалгагдах ёстой («Бүрэн чөлөөлсөн»-ийн бичиглэл ба талбайн нөхөлт).
 */
export function buildLandStatus(statusRows: Row[], altRows: Row[]): LandStatus {
  const L = PARCEL_LEFT;
  /**
   * ⚠️ `text(v, '')` — анхдагч «—» БОЛОХГҮЙ. `text()`-ийн анхдагч нь «—»
   * тул `|| 'Тодорхойгүй'` салаа ХЭЗЭЭ Ч ажиллахгүй байв (энэ мөрөнд
   * ямар ч хоосон утга «—» болж гарна). Хуучин үйлчилгээнд хоосон `Tuluv`
   * байгаагүй тул нуугдаж байсныг `selbe_parcel_last0731` (1 хоосон мөр)
   * ил гаргав. Шошго нь давхаргын `paint.emptyLabel`-тай нэг байх ёстой.
   *
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): шошгыг `statusKey`-ээр — «Бүрэн
   * чөлөөлсөн»-ийн бүх бичиглэл НЭГ мөрөнд НИЙЛНЭ (тоо ба талбай нь
   * нэмэгдэнэ), бусад төлөв урьдын адил trim хийсэн түүхий утгаараа.
   */
  const labelOf = (v: unknown): string => statusKey(v) || tr('Тодорхойгүй');
  const byStatus: LandStatus['byStatus'] = [];
  for (const r of statusRows) {
    const label = labelOf(r[L.fields.status]);
    const n = Number(r.n ?? 0);
    const a = Number(r.a ?? 0);
    const g = byStatus.find((x) => x.label === label);
    if (g) { g.n += n; g.areaM2 += a; }
    else byStatus.push({ label, n, areaM2: a });
  }
  /*
   * `areaAlt` нөхөлт — area_m2 хоосон мөрийн гараар бичсэн талбайг харгалзах
   * төлөвт нь нэмнэ (нийт `areaM2` byStatus-аас нийлдэг тул мөн нөхөгдөнө).
   *
   * ⚠️ 2026-09-11: урьд нь `if (g) g.areaM2 += …` гэж бичигдсэн байсан тул
   * `byStatus`-д тэр шошго БАЙХГҮЙ бол талбай ЧИМЭЭГҮЙ хаягдаж, «Нийт
   * талбай» дутуу гардаг байв. Энэ нь бодитоор тохиолдоно: эхний асуулга
   * нь БҮХ мөрийг бүлэглэдэг ч хоёр асуулга ХОЁР ӨӨР агшинд явдаг —
   * завсарт шинэ төлөв үүсвэл хоёр дахь хариунд байгаа шошго эхнийхэд
   * байхгүй байна. Одоо шинэ бүлэг ҮҮСГЭНЭ: `n = 0` (мөрийн тоо эхний
   * асуулгаас гарах ёстой, энд давхар тоолохгүй), талбай нь хадгалагдана.
   *
   * ⚠️ АМЬДААР ЭНЭ ЗАМ ОДООГООР ХООСОН: 2026-09-11-ний хэмжилтээр
   * `area_m2 IS NULL` = 0 (нийт 2,088) тул `altRows` хоосон буцдаг. ГЭХДЭЭ
   * кодын зам ЗӨВ байх ёстой — өгөгдөл өөрчлөгдөж, `area_m2` дахин хоосон
   * болох боломжийг ХААХГҮЙ (`services.ts`-ийн `areaAlt` амлалт хүчинтэй
   * хэвээр: 140/2,088 мөрд гараар бичсэн талбай бий). Тиймээс асуулгыг
   * ХАСААГҮЙ — дэмий нэг хүсэлт нь чимээгүй алдагдсан талбайгаас хямд.
   */
  for (const r of altRows) {
    /* ⚠️ 2026-10-01: эхний асуулгатай ИЖИЛ шошго (`labelOf`) — эс бөгөөс
       «Бүрэн чөлөөлсөн.»-ий нөхөлтийн талбай тусдаа мөр болж үлдэнэ. */
    const label = labelOf(r[L.fields.status]);
    const add = Number(r.a ?? 0);
    if (!add) continue;
    const g = byStatus.find((x) => x.label === label);
    if (g) g.areaM2 += add;
    else byStatus.push({ label, n: 0, areaM2: add });
  }
  const of = (v: string) => byStatus.find((x) => x.label === v)?.n ?? 0;
  const total = byStatus.reduce((s, x) => s + x.n, 0);
  const areaM2 = byStatus.reduce((s, x) => s + x.areaM2, 0);
  /**
   * ⚠️ ТҮҮХИЙ утгаар жишнэ — `tr()` ХЭРЭГЛЭХГҮЙ. `byStatus.label` нь
   * үйлчилгээний түүхий монгол утга тул EN хэлэнд `tr()`-ээр орчуулсан
   * түлхүүр («Fully acquired» г.м.) хэзээ ч таарахгүй, чөлөөлөлт 0%
   * гардаг байв. `tr()` зөвхөн ДЭЛГЭЦИЙН текстэд (loadClearance-ийн загвар).
   */
  const cleared = of(PARCEL_CLEARED);
  /* ⚠️ «Цэвэрлэсэн нэгж талбар» ангилал шинэ эхэд БАЙХГҮЙ — 0 хэвээр. */
  const cleaned = 0;
  /* ⚠️ ҮЛДСЭН нь НИЙТЭЭС ХАСАЖ гарна, нэрлэсэн төлөвөөр БИШ: шинэ эхэд
     шалтгаан бүр өөрөө нэг «төлөв» тул тэдгээрийг гараар жагсаавал шинэ
     шалтгаан нэмэгдэхэд чимээгүй тоологдохгүй үлдэнэ. */
  const remaining = total - cleared;
  const resolved = cleared;

  /* ⚠️ Шалтгаан = `byStatus` хасах «Бүрэн чөлөөлсөн». Нэмэлт асуулга
     шаардахгүй болов (хүсэлт 3 → 2). */
  const rmap = new Map<string, number>();
  for (const r of byStatus) {
    if (r.label === PARCEL_CLEARED) continue;
    const k = cleanReason(r.label);
    rmap.set(k, (rmap.get(k) ?? 0) + r.n);
  }
  const reasons = [...rmap.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n);

  return {
    total, areaM2, cleared, cleaned, remaining, resolved,
    pct: total ? (resolved / total) * 100 : null,
    byStatus,
    reasons,
  };
}

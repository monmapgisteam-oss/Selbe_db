/**
 * СХЕМИЙН ЭХ СУРВАЛЖУУДЫГ ЦУГЛУУЛАХ.
 *
 * ⚠️ ШИНЭ ArcGIS QUERY ЭНД БАЙХГҮЙ. Бүх тоо нь өөр харагдацууд аль хэдийн
 * татдаг, `cached()`-аар ороогдсон ачаалагчдаас гарна. Тиймээс Дашбоард эсвэл
 * Тайлангаас ирсэн хэрэглэгчид схем нээхэд НЭМЭЛТ хүсэлт огт явахгүй.
 *
 * ⚠️ ХҮСЭЛТҮҮД ЗЭРЭГ ЯВНА (`Promise.allSettled`), дараалж биш. `loadHeadline`
 * дээр бичигдсэн сургамжийг давтана: нэг эх сурвалж унахад бусад нь хамт
 * унаж, бараг бүх харагдацын толгойн зурвас хоосордог байв.
 *
 * ⚠️ УНАСАН ЭХ СУРВАЛЖИЙГ НУУХГҮЙ. `failed` жагсаалт нь дэлгэц дээр нэрлэгдэж
 * гарна — гурван зураастай схем тайлбаргүй бол «төсөлд өгөгдөл алга» гэж
 * уншигдана, тэр нь буруу тооноос ч дор.
 */

import { cached, loadHeadline, loadClearance, SESSION_TTL_MS } from '@/lib/live';
import {
  loadOverall, loadProgress, loadFinance, loadHabeaSummary,
} from '@/lib/reportData';
import { queryAll } from '@/lib/hyanalt';
import { loadZov } from '@/lib/zovshoorol';
import { loadBagtsRows } from '@/lib/execData';
import { t as tr } from '@/lib/i18nCore';
import { SOURCE_NAME, type SchemSources } from '@/lib/schem';

/**
 * ⚠️ Нэрсийн толь `schem.ts`-д — дэлгэрэнгүй самбар мөн адил түүнээс уншиж
 * `failed`-тэй тулгадаг тул ХОЁР газар бичигдэж болохгүй.
 */
const NAME = SOURCE_NAME;

/**
 * ⚠️ 2026-10-09: `loadZov` ба `hyanalt.queryAll` нь КЭШГҮЙ ачаалагч — файлын толгойн
 *    «нэмэлт хүсэлт огт явахгүй» гэсэн амлалтыг зөрчиж, схем нээх бүрд хоёр бүтэн
 *    хүснэгтийг (2000-аар хуудаслан) дахин татдаг байв. Энд `live.cached`-аар ороож
 *    тухайн хүснэгтийн DataKey-ээр тэмдэглэв — бичилт (`invalidate('ZOVSHOOROL' | 'HYANALT')`)
 *    кэшийг хаяна, TTL нь сешний анхдагч.
 * ⚠️ `loadZov` унахдаа `null` БУЦААДАГ (шиддэггүй) тул `keep`-ээр `null`-ыг кэшлэхгүй —
 *    эс бөгөөс түр уналт 5 минут «зөвшөөрөл татагдсангүй» болж үлдэнэ.
 */
const loadZovCached = cached(loadZov, SESSION_TTL_MS, ['ZOVSHOOROL'], (v) => v != null);
const queryAllCached = cached(queryAll, SESSION_TTL_MS, ['HYANALT']);

/**
 * ⚠️ 2026-09-25 аудит: ХЭСЭГЧИЛСЭН ҮР ДҮН КЭШЛЭГДЭХГҮЙ. Урьд нь нэг эх сурвалж
 *    түр унахад тэр дутуу схем 5 минут кэшэд үлдэж, «Дахин оролдох» ч мөн
 *    хадгалсан хагасаа буцаадаг байв. Одоо хэсэгчилсэн үед reject (`cached`
 *    хадгалахгүй) → доорх `loadSchemSources` үр дүнг нь буцаана; дараагийн
 *    дуудлага (эсвэл «Дахин оролдох») шинээр татна. Амжилттай эх сурвалжууд
 *    өөрсдийн `cached` ачаалагчтай тул дахин оролдох нь хямд.
 */
/**
 * БҮХ ЭХ СУРВАЛЖ УНАСАН үеийн алдаа (⚠️ 2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ Урьд нь шалтгаанаас үл хамааран «сүлжээгээ шалгана уу» гэдэг байв — 499 («Token
 *    Required») · 403 · 498 (эрх/нэвтрэлт) ч «сүлжээ» болж, хэрэглэгч буруу зүйл
 *    шалгадаг байлаа. Одоо ЭХНИЙ бодит шалтгааныг мессежид оруулж `name`-ийг
 *    (`TimeoutError`) хадгална — `Data` → `friendlyError` эрх/сүлжээ/хугацааг ялгана,
 *    техникийн мөр нь эвхмэл хэсэгт үлдэнэ.
 */
export function schemAllFailedError(reason: unknown): Error {
  const why = reason instanceof Error ? reason.message : reason == null ? '' : String(reason);
  const e = new Error(why
    ? tr('Схемийн эх сурвалж бүгд татагдсангүй: {0}', why)
    : tr('Схемийн эх сурвалж бүгд татагдсангүй'));
  if (reason instanceof Error && reason.name && reason.name !== 'Error') e.name = reason.name;
  return e;
}

class SchemPartial extends Error {
  constructor(readonly result: SchemSources) {
    super(tr('{0} эх сурвалж татагдсангүй', result.failed.join(', ')));
  }
}

const schemSourcesFull = cached<SchemSources>(async () => {
  const [h, c, o, p, f, hb, z, r, b] = await Promise.allSettled([
    loadHeadline(),
    loadClearance(),
    loadOverall(),
    loadProgress(),
    loadFinance(),
    loadHabeaSummary(),
    loadZovCached(),
    queryAllCached(),
    loadBagtsRows(),
  ]);

  const failed: string[] = [];
  /** ⚠️ 2026-10-01: эхний бодит шалтгаан — бүгд унавал ангилахад (`schemAllFailedError`) */
  let firstReason: unknown = null;
  const take = <T>(name: string, x: PromiseSettledResult<T>): T | null => {
    if (x.status === 'fulfilled') {
      /**
       * ⚠️ `loadZov()` нь REJECT ХИЙДЭГГҮЙ — алдаагаа `null`-аар буцаадаг
       * (`zovshoorol.ts`). Тиймээс `fulfilled` гэдэг нь амжилт гэсэн үг биш;
       * утга нь `null` бол мөн л унасан гэж тоолно.
       */
      if (x.value == null) failed.push(name);
      return x.value;
    }
    console.error(`[selbe] схем · ${name}:`, x.reason);
    firstReason ??= x.reason;
    failed.push(name);
    return null;
  };

  /* ⚠️ 2026-10-09: ХАГАС толгой (`Headline.partial` — хил/барилга/төсөв аль нэг нь унасан, NaN
     талбартай) нь `fulfilled` ирдэг тул урьд нь «амжилттай» тоологдож, NaN-тай схем 5 минут
     КЭШЛЭГДДЭГ байв. Утгыг нь харуулсаар (бусад талбар нь зөв) `failed`-д нэрлэнэ —
     доорх `SchemPartial` кэшлэхгүй. `loadFinance` (`reportData`) хагас төлөвгүй: аль нэг
     хүснэгт унавал бүхэлдээ шиддэг тул `take` аль хэдийн «унасан» гэж тоолно. */
  const headline = take(NAME.headline, h);
  if (headline?.partial && !failed.includes(NAME.headline)) failed.push(NAME.headline);
  const src: SchemSources = {
    headline,
    clearance: take(NAME.clearance, c),
    overall: take(NAME.overall, o),
    progress: take(NAME.progress, p),
    finance: take(NAME.finance, f),
    habea: take(NAME.habea, hb),
    zov: take(NAME.zov, z),
    review: take(NAME.review, r),
    bagts: take(NAME.bagts, b),
    failed,
  };

  /**
   * ⚠️ БҮГД унавал хэсэгчлэн үзүүлэх юм алга — сүлжээ бүхэлдээ тасарсан гэсэн
   * үг. Тэр үед хоосон схем зурахын оронд алдаа шидэж `Data`-гийн «дахин
   * оролдох» товчийг гаргана.
   */
  /* ⚠️ 2026-10-09: «БҮГД унасан» = ЕСӨН эх БҮГД утгагүй (`null`). Урьд нь `failed.length === 9`
     байсан тул ХАГАС толгой (утгатай, `failed`-д нэрлэгдсэн) + бусад 8 унасан үед хагас өгөгдлийг
     хаяж «бүгд унасан» алдаа шиддэг байв. Давхардсан нэрийг ч тоолохгүй (`Set`). */
  const got = [src.headline, src.clearance, src.overall, src.progress, src.finance, src.habea, src.zov, src.review, src.bagts];
  if (got.every((v) => v == null) && new Set(failed).size >= got.length) {
    throw schemAllFailedError(firstReason);
  }
  if (failed.length) throw new SchemPartial(src);
  return src;
}, 5 * 60_000, ['CASHFLOW_NEW', 'PARCEL_LEFT', 'BAGTS_SHEET', 'BAGTS_NEGTGEL', 'HABEA', 'HO_IPC', 'HYANALT', 'ZOVSHOOROL']);

/** Схемийн эх сурвалжууд. Хэсэгчилсэн үед `failed` дүүрэн, кэшлэгдэхгүй. */
export async function loadSchemSources(): Promise<SchemSources> {
  try {
    return await schemSourcesFull();
  } catch (e) {
    if (e instanceof SchemPartial) return e.result;
    throw e;
  }
}

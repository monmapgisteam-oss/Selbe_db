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

import { cached, loadHeadline, loadClearance } from '@/lib/live';
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

export const loadSchemSources = cached<SchemSources>(async () => {
  const [h, c, o, p, f, hb, z, r, b] = await Promise.allSettled([
    loadHeadline(),
    loadClearance(),
    loadOverall(),
    loadProgress(),
    loadFinance(),
    loadHabeaSummary(),
    loadZov(),
    queryAll(),
    loadBagtsRows(),
  ]);

  const failed: string[] = [];
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
    failed.push(name);
    return null;
  };

  const src: SchemSources = {
    headline: take(NAME.headline, h),
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
  if (failed.length === 9) {
    throw new Error(tr('Өгөгдөл татагдсангүй — сүлжээгээ шалгана уу'));
  }
  return src;
}, 5 * 60_000, ['CASHFLOW2', 'PARCEL_LEFT', 'BAGTS_SHEET', 'BAGTS_NEGTGEL', 'HABEA', 'IPC_LOG', 'HYANALT', 'ZOVSHOOROL']);

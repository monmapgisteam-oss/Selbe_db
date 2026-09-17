/**
 * Node-д TypeScript эх кодыг ШУУД импортлох тусламж (зөвхөн ТЕСТЭД).
 *
 * ⚠️ Node 24 нь `.ts` файлын төрлийн тэмдэглэгээг өөрөө хуулж хаядаг боловч
 * ХОЁР зүйлийг мэдэхгүй: (1) `@/…` alias (tsconfig-ийн зохиомол зам),
 * (2) өргөтгөлгүй импорт (`./plan2d`). Хоёуланг нь энд нөхнө.
 *
 * ⚠️ Энэ нь build-д ОГТ ОРОХГҮЙ — зөвхөн `node --import` дамжуулж тест
 * ажиллуулахад хэрэглэгдэнэ. Порталын webpack өөрийн resolver-той.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const SRC = pathToFileURL(
  resolvePath(dirname(fileURLToPath(import.meta.url)), '..', 'src') + '/',
).href;

/**
 * Өргөтгөлгүй бол туршиж үзэх дараалал.
 *
 * ⚠️ «Цэг байвал өргөтгөлтэй» гэж үзэж БОЛОХГҮЙ: модулийн нэр өөрөө цэгтэй
 *    байдаг (./bagts.trees, ./bagts.pkg) бөгөөд тэднийг өргөтгөлтэй гэж
 *    андуурвал .ts хувилбар нь огт туршигдахгүй, тест ERR_MODULE_NOT_FOUND-
 *    оор унана. Тиймээс ЖИНХЭНЭ өргөтгөлүүдийг нэрээр нь жагсаав.
 */
const candidates = (spec) =>
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/i.test(spec)
    ? [spec]
    : [`${spec}.ts`, `${spec}.tsx`, `${spec}/index.ts`, spec];

export async function resolve(specifier, context, next) {
  let spec = specifier;

  if (spec.startsWith('@/')) spec = SRC + spec.slice(2);

  /**
   * Зөвхөн ФАЙЛ руу заасан импортод л өргөтгөл нөхнө — `node:*`-ыг хөндөхгүй.
   *
   * ⚠️ БАГЦЫН нэр нь үл хамаарах зүйлтэй: `@arcgis/core/**` нь webpack-д
   * өргөтгөлгүй бичигддэг (`@arcgis/core/geometry/geometryEngine`) ч Node-ийн
   * ESM нь `.js`-гүйгээр олохгүй. Багцын нэрийг ЭХЛЭЭД хэвээр нь туршиж, зөвхөн
   * УНАСАН тохиолдолд `.js` нэмж дахин үзнэ — бусад багцын шийдвэрлэлт
   * өөрчлөгдөхгүй.
   */
  const isFile = spec.startsWith('.') || spec.startsWith('file:');
  if (!isFile) {
    try {
      return await next(specifier, context);
    } catch (e) {
      if (/\.(js|mjs|cjs|json)$/i.test(spec)) throw e;
      return next(`${spec}.js`, context);
    }
  }

  let lastErr;
  for (const c of candidates(spec)) {
    try {
      return await next(c, context);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/*
 * ⚠️ АМЬД ШАЛГУУРЫГ АЛГАСАХ (2026-09-17): `ts-alias.mjs` org-only үйлчилгээг
 *    тандаад `liveSkip` дамжуулна. `SELBE_LIVE_SKIP` тэмдэгтэй `.check.mjs`
 *    файлыг ажиллуулахгүй, оронд нь ⏭ мэдэгдэл хэвлэдэг хоосон модуль өгнө.
 *    Файл дотроос `process.exit()` дуудвал Windows дээр libuv assertion-оор
 *    унадаг тул ЭНД (эх код ачаалахаас өмнө) шийднэ.
 */
let liveSkip = false;
export function initialize(data) { liveSkip = !!data?.liveSkip; }

export async function load(url, context, next) {
  const r = await next(url, context);
  if (liveSkip && /\.check\.mjs$/.test(url) && r.source != null) {
    const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
    if (src.includes('SELBE_LIVE_SKIP')) {
      const msg = '⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга';
      return { ...r, source: `console.log(${JSON.stringify(msg)});\nexport {};\n` };
    }
  }
  return r;
}

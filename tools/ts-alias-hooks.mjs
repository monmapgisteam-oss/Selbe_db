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

  // Зөвхөн ФАЙЛ руу заасан импортод л өргөтгөл нөхнө — `node:*`, багцын нэрийг хөндөхгүй
  const isFile = spec.startsWith('.') || spec.startsWith('file:');
  if (!isFile) return next(specifier, context);

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

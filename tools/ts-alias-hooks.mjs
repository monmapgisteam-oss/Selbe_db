/**
 * Node-д TypeScript эх кодыг ШУУД импортлох тусламж (зөвхөн ТЕСТЭД).
 *
 * ⚠️ Node 24 нь `.ts` файлын төрлийн тэмдэглэгээг өөрөө хуулж хаядаг боловч
 * ХОЁР зүйлийг мэдэхгүй: (1) `@/…` alias (tsconfig-ийн зохиомол зам),
 * (2) өргөтгөлгүй импорт (`./plan2d`). Хоёуланг нь энд нөхнө.
 *
 * ⚠️ Энэ нь build-д ОГТ ОРОХГҮЙ — зөвхөн `node --import` дамжуулж тест
 * ажиллуулахад хэрэглэгдэнэ. Порталын webpack өөрийн resolver-той.
 *
 * ⚠️ 2026-09-30: `.tsx` (JSX) — Node-ийн type stripping JSX-ийг ОГТ ойлгохгүй
 *    («Unknown file extension .tsx») тул `.tsx`-ийг devDependency `typescript`-ээр
 *    `transpileModule` хийнэ (`jsx: react-jsx`). Урьд `.tsx` импорт ямагт унадаг
 *    байсан тул одоо байгаа шалгууруудад нөлөөгүй.
 *
 * ⚠️ 2026-09-30: UI SMOKE ГОРИМ (`initialize({ ui: true })` — `ts-alias.mjs` нь
 *    `*.ui.check.mjs` оролтын цэгт л асаана). Тэр үед:
 *      · `*.css` / `*.module.css` → `tools/ui-stub-css.mjs` (класс нэрээ буцаадаг Proxy);
 *      · `next/dynamic`            → `tools/ui-stub-next-dynamic.mjs` (синхрон;
 *                                    `preloadDynamic()`-ийн дараа жинхэнэ компонент);
 *      · `@arcgis/core/**`         → зохиомол модуль: жинхэнэ файлын export нэрсийг
 *                                    уншиж, нэр бүрд `mkStub()` (tools/ui-stub-arcgis.mjs).
 *    Зохиомол модулиудын URL нь `tools/.ui-stubs/…` доорх БАЙХГҮЙ файл — `resolve`
 *    `shortCircuit` тул Node диск рүү хандахгүй; харин `react` зэрэг bare импорт
 *    тэр замаас `node_modules` руу зөв шийдвэрлэгдэнэ (data:/custom scheme бол чадахгүй).
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { readFileSync } from 'node:fs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const SRC = pathToFileURL(resolvePath(TOOLS, '..', 'src') + '/').href;
const STUB_ROOT = pathToFileURL(resolvePath(TOOLS, '.ui-stubs') + '/').href;
const STUB_CSS = pathToFileURL(resolvePath(TOOLS, 'ui-stub-css.mjs')).href;
const STUB_DYNAMIC = pathToFileURL(resolvePath(TOOLS, 'ui-stub-next-dynamic.mjs')).href;
const STUB_ARCGIS_LIB = pathToFileURL(resolvePath(TOOLS, 'ui-stub-arcgis.mjs')).href;

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

let liveSkip = false;
let ui = false;
export function initialize(data) { liveSkip = !!data?.liveSkip; ui = !!data?.ui; }

export async function resolve(specifier, context, next) {
  let spec = specifier;

  if (spec.startsWith('@/')) spec = SRC + spec.slice(2);

  if (ui) {
    /* ⚠️ CSS-ийг файл байгаа эсэхээс үл хамааран стубална (`import './x.css'`
       хажуугийн импорт ч, `import s from './x.module.css'` ч). */
    if (/\.css$/i.test(spec)) return { url: STUB_CSS, shortCircuit: true };
    if (spec === 'next/dynamic') return { url: STUB_DYNAMIC, shortCircuit: true };
    if (spec === '@arcgis/core' || spec.startsWith('@arcgis/core/')) {
      let real = '';
      try { real = (await next(specifier, context)).url; }
      catch { try { real = (await next(`${specifier}.js`, context)).url; } catch { /* багц алга — default-only стуб */ } }
      const sub = spec.replace(/^@arcgis\/core\/?/, '') || 'index';
      return { url: `${STUB_ROOT}arcgis/${sub}.mjs?real=${encodeURIComponent(real)}`, shortCircuit: true };
    }
  }

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

/* ── `.tsx` → JS (typescript.transpileModule) ── */
let tsMod = null;
async function transpileTsx(url) {
  tsMod ??= (await import('typescript')).default;
  const file = fileURLToPath(url);
  const src = readFileSync(file, 'utf8');
  const out = tsMod.transpileModule(src, {
    fileName: file,
    compilerOptions: {
      module: tsMod.ModuleKind.ESNext,
      target: tsMod.ScriptTarget.ES2022,
      jsx: tsMod.JsxEmit.ReactJSX,
      isolatedModules: true,
      esModuleInterop: true,
      /* ⚠️ `import.meta`, top-level await хэвээр — ESNext */
    },
  });
  return out.outputText;
}

/* ── `@arcgis/core/**` зохиомол модулийн эх код ── */
/**
 * Жинхэнэ (minified ESM) файлаас export НЭРСИЙГ түүнэ:
 *   `export{a as b,c as default}` · `export{x}from"…"` · `export const/function/class x` · `export default`
 * `export*from"…"`-ыг ДАГАХГҮЙ (arcgis-ийн модулиуд ихэвчлэн ил нэрээр экспортолдог).
 * Нэр олдоогүй бол `default` л — ямар ч тохиолдолд импорт унахгүй.
 */
function arcgisExportNames(realUrl) {
  const names = new Set(['default']);
  if (!realUrl) return names;
  let src = '';
  try { src = readFileSync(fileURLToPath(realUrl), 'utf8'); } catch { return names; }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const as = /\s+as\s+(\S+)$/.exec(p);
      names.add(as ? as[1] : p);
    }
  }
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return names;
}

function arcgisStubSource(url) {
  const u = new URL(url);
  const real = decodeURIComponent(u.searchParams.get('real') || '');
  const mod = u.pathname.replace(/.*\/arcgis\//, '').replace(/\.mjs$/, '');
  const names = arcgisExportNames(real);
  const lines = [`import { mkStub } from ${JSON.stringify(STUB_ARCGIS_LIB)};`];
  for (const n of names) {
    if (!/^[A-Za-z_$][\w$]*$/.test(n)) continue;
    const v = `mkStub(${JSON.stringify(`@arcgis/core/${mod}${n === 'default' ? '' : '.' + n}`)})`;
    lines.push(n === 'default' ? `export default ${v};` : `export const ${n} = ${v};`);
  }
  return lines.join('\n') + '\n';
}

export async function load(url, context, next) {
  if (ui && url.startsWith(STUB_ROOT)) {
    return { format: 'module', source: arcgisStubSource(url), shortCircuit: true };
  }
  if (/\.tsx$/i.test(url) && url.startsWith('file:')) {
    return { format: 'module', source: await transpileTsx(url), shortCircuit: true };
  }
  const r = await next(url, context);
  /*
   * ⚠️ АМЬД ШАЛГУУРЫГ АЛГАСАХ (2026-09-17): `ts-alias.mjs` org-only үйлчилгээг
   *    тандаад `liveSkip` дамжуулна. `SELBE_LIVE_SKIP` тэмдэгтэй `.check.mjs`
   *    файлыг ажиллуулахгүй, оронд нь ⏭ мэдэгдэл хэвлэдэг хоосон модуль өгнө.
   *    Файл дотроос `process.exit()` дуудвал Windows дээр libuv assertion-оор
   *    унадаг тул ЭНД (эх код ачаалахаас өмнө) шийднэ.
   */
  if (liveSkip && /\.check\.mjs$/.test(url) && r.source != null) {
    const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
    if (src.includes('SELBE_LIVE_SKIP')) {
      const msg = '⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга';
      return { ...r, source: `console.log(${JSON.stringify(msg)});\nexport {};\n` };
    }
  }
  return r;
}

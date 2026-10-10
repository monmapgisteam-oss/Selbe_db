import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * ESLint (flat config) — Next.js-ийн албан ёсны дүрмүүд.
 * `npm run lint` (CI-д мөн ажиллана). tsc-ийн давхардсан шалгалтууд
 * (unused г.м.) typecheck дээрээ байгаа тул энд Next/React-ийн дүрэм гол.
 */

/**
 * ⚠️ 2026-10-09: `tools/` доторх `.mjs` (Node скрипт: тестийн loader, i18n, бот, шалгуурын гүйгч) урьд нь
 *    БҮХЭЛДЭЭ ignore байсан — тэнд хэвлэгдсэн алдаа/тодорхойгүй хувьсагч хэзээ ч баригддаггүй.
 *    Одоо Node-ийн глобалтай шалгана. `globals` багцыг импортлохгүй: зөвхөн дамжин орсон
 *    хамаарал (package.json-д алга) тул шинэчлэлтэд алга болж config бүхэлдээ унах эрсдэлтэй —
 *    ашиглагдаж буй глобалуудыг энд ил жагсаав. `npm run lint` нь `eslint src tools` тул
 *    CI-ийн хаалт (`test.yml` → `npm run lint`) `tools/`-ийг ч шалгана.
 */
const NODE_GLOBALS = Object.fromEntries([
  'process', 'Buffer', 'console', 'URL', 'URLSearchParams', 'fetch', 'Headers', 'Request',
  'Response', 'FormData', 'Blob', 'AbortSignal', 'AbortController', 'TextEncoder', 'TextDecoder',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'structuredClone', 'performance', 'crypto', 'globalThis',
].map((g) => [g, 'readonly']));

/*
 * ⚠️ 2026-10-09 (аудит №6): `agent-proxy/*.mjs` (реле: server · worker · claudeCode · rateLimit) ч lint-д
 *    орно — урьд `npm run lint` нь `src tools` л байсан тул релейн тодорхойгүй хувьсагч/алдаа CI-д
 *    хэзээ ч баригддаггүй байв. `agent-proxy/node_modules` (тусдаа багц) ба `host/` (PowerShell) ignore.
 */
export default [
  { ignores: ['node_modules/**', '.next/**', 'out/**', 'tools/**/*.{js,cjs,py,ipynb,txt}', 'agent-proxy/node_modules/**', 'agent-proxy/host/**'] },
  ...coreWebVitals,
  ...nextTs,
  {
    rules: {
      // Статик export тул <img> санаатай — анхааруулга үлдээвэл жинхэнэ
      // асуудлыг живүүлнэ.
      '@next/next/no-img-element': 'off',
      // `catch {}`-ийн хоосон блок төсөлд санаатай (тайлбартай) хэрэглэгддэг.
      'no-empty': ['error', { allowEmptyCatch: true }],
      /**
       * react-hooks v6-ийн (React Compiler-д зориулсан) ШИНЭ хатуу дүрмүүд —
       * төслийн олон жилийн санаатай хэв маягийг (render үед `ref.current = x`
       * бичих, эффект дотор өгөгдөл-синкийн setState г.м.) error гэж үздэг.
       * Тэдгээрийг warn болгож (сайжруулах газрын жагсаалт), ҮЛДСЭН бүх дүрэм
       * error хэвээр — CI unaна.
       */
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      /**
       * САНААТАЙ ХАЯСАН утга — `_` угтвартай нэр. Rest-destructuring-аар
       * талбар хасахад (`const { color: _c, ...rest } = x`) хаясан хувьсагч
       * зайлшгүй үүсдэг бөгөөд түүнийг «ашиглаагүй» гэж заах нь ЖИНХЭНЭ
       * ашиглаагүй хувьсагчийг живүүлнэ.
       */
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: NODE_GLOBALS },
    rules: { 'no-undef': 'error' },
  },
  /* ⚠️ 2026-10-09 (аудит №6): реле — Node ба Cloudflare Worker (`worker.mjs`) хоёулаа ижил Web глобалтай */
  {
    files: ['agent-proxy/*.mjs'],
    languageOptions: { sourceType: 'module', globals: NODE_GLOBALS },
    rules: { 'no-undef': 'error' },
  },
];

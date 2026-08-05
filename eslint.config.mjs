import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * ESLint (flat config) — Next.js-ийн албан ёсны дүрмүүд.
 * `npm run lint` (CI-д мөн ажиллана). tsc-ийн давхардсан шалгалтууд
 * (unused г.м.) typecheck дээрээ байгаа тул энд Next/React-ийн дүрэм гол.
 */
export default [
  { ignores: ['node_modules/**', '.next/**', 'out/**', 'tools/**'] },
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
    },
  },
];

/**
 * PostCSS — Next.js-ийн АНХДАГЧ тохиргооны ЯГ хуулбар (`next/dist/build/webpack/config/blocks/css/plugins.js`
 * `getDefaultPlugins`), ганц ялгаа нь `autoprefixer.flexbox: false`.
 *
 * ⚠️ 2026-10-21: ЯАГААД — `@arcgis/core`-ийн `main.css` (node_modules) нь flex доторх `align-items: start/end`
 *    хэрэглэдэг тул Next-ийн анхдагч autoprefixer (`flexbox: 'no-2009'`) dev/build бүрд «start/end value has mixed
 *    support, consider using flex-start/flex-end» сануулга өгч, webpack-ийн кэш «No serializer registered for
 *    Warning» гэж нэмж бичдэг байв. Тэр файлыг засах боломжгүй (гуравдагч сан).
 * ⚠️ `flexbox: false` АЮУЛГҮЙ: доорх зорилтот хөтчүүд (Next-ийн `MODERN_BROWSERSLIST_TARGET` — chrome 64 · edge 79 ·
 *    firefox 67 · opera 51 · safari 12; төсөлд browserslist тохиргоо байхгүй тул Next үүнийг хэрэглэдэг) flexbox-ийг
 *    prefix-гүй бүрэн дэмждэг — flex-ийн `-webkit-` prefix хэзээ ч нэмэгдэхгүй байсан. Бусад бүх prefix/feature ижил.
 * ⚠️ Плагинуудыг Next-ийн ДОТООД хуулбараас (`next/dist/compiled/…`) — тусдаа суулгах шаардлагагүй. Next-ийн
 *    хувилбар шинэчлэхэд энэ файлыг `getDefaultPlugins`-тэй харьцуулна.
 */
const config = {
  plugins: {
    'next/dist/compiled/postcss-flexbugs-fixes': {},
    'next/dist/compiled/postcss-preset-env': {
      browsers: ['chrome 64', 'edge 79', 'firefox 67', 'opera 51', 'safari 12'],
      autoprefixer: { flexbox: false },
      stage: 3,
      features: { 'custom-properties': false },
    },
  },
};

export default config;

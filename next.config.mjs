import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages (smart.selbecity.mn, 2026-09-09-өөс; өмнө selbe.monmap.mn) —
  // бүрэн статик экспорт, сервер шаардлагагүй.
  // ⚠️ 2026-10-09 (аудит): домэйн нь repo → Settings → Pages → Custom domain-оос (`actions/deploy-pages`
  //    `public/CNAME`-ийг үл тоомсорлоно; файл хэвээр). `next start` ажиллахгүй — `out/`-ыг статикаар үйлчил.
  output: 'export',
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // ⚠️ 2026-10-29 (хэрэглэгч: «нэвтрэлт унтраалттай үед зөвхөн локал dev сервер дээр хөтөч энэ токеноор өгөгдөл
  //    татдаг болгох»): `.env.development.local`-ын ARCGIS_ADMIN_TOKEN-ыг ЗӨВХӨН `next dev` (NODE_ENV=development)
  //    + NEXT_PUBLIC_AUTH_OFF=1 үед `NEXT_DEV_ARCGIS_TOKEN` нэрээр багцад оруулна; `next build`-д ҮРГЭЛЖ хоосон —
  //    токен production багц/GitHub Pages-д ХЭЗЭЭ Ч орохгүй (`tools/devToken.check.mjs` энэ нөхцөлийг тулгана).
  //    Хөтөч дээр дахин 3 хаалт (`authToken.devToken`): development · appId хоосон · localhost хост.
  env: {
    NEXT_DEV_ARCGIS_TOKEN: process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AUTH_OFF === '1'
      ? (process.env.ARCGIS_ADMIN_TOKEN ?? '')
      : '',
  },
  trailingSlash: true,
  images: { unoptimized: true },

  // ⚠️ Desktop дээр давхар package-lock.json байдгаас Next workspace root-оо
  //    эндүүрдэг (build file-tracing буруу үндэслэдэг) — төслийн хавтсыг зааж өгөв.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  // ArcGIS MapView/SceneView нь StrictMode-ийн давхар mount-д WebGL context алдаж,
  // dev дээр зураг анивчина. Effect-үүд цэвэр destroy() хийдэг ч давхар үүсгэлт нь
  // ArcGIS-ийн хувьд үнэтэй тул унтраав.
  reactStrictMode: false,

  // ⚠️ DEV-ийн webpack кэшийг САНАХ ОЙД (2026-10-09) — ЗӨВХӨН `NEXT_DEV_MEMORY_CACHE=1`
  //    үед (жиш. тухайн worktree-ийн `.env.development.local`). Нэг машин дээр
  //    `.next/cache/webpack/client-development/1.pack.gz` (~1.2 GB) «crc error»-той
  //    бичигдэж, дараагийн асаалт түүнийг уншихдаа ГАЦАЖ хүсэлтэд хариу өгөхгүй байв
  //    (`incorrect data check`). Санах ойн кэш дискэнд юу ч бичихгүй тул эвдрэх зүйлгүй;
  //    зардал нь — дахин асаахад эхний эмхэтгэл кэшгүй. Env-гүй бол бусад worktree ба
  //    build ӨМНӨХ ШИГЭЭ (дискэн кэш).
  // ⚠️ 2026-10-09 (аудит): `maxGenerations: 1` — webpack-ийн санах ойн кэшийн анхдагч нь
  //    `Infinity` тул урт dev сешнд хэзээ ч чөлөөлөгдөхгүй, санах ой тасралтгүй өсдөг байв.
  //    1 = сүүлийн эмхэтгэлд ашиглагдаагүй зүйлийг дараагийн эмхэтгэлд хаяна; дахин эмхэтгэлийн
  //    хурдны ашиг хэвээр, дискэнд юу ч бичихгүй (дээрх зорилго хэвээр).
  /* ⚠️ 2026-10-21: `@arcgis/core`-ийн сэдвийн CSS (`assets/esri/themes/<сэдэв>/main.css`) дээрх autoprefixer-ийн
     «start/end value has mixed support» анхааруулгыг ШҮҮНЭ. Тэр файл `node_modules` дотор тул засах
     боломжгүй; анхааруулга нь dev консолыг асаалт бүрд дүүргэж, жинхэнэ алдааг нууж байв. ЗӨВХӨН тэр
     сангийн, ЗӨВХӨН энэ мессеж — манай CSS-ийн анхааруулга хэвээр харагдана (`planOverlap.module.css`-ийн
     `align-items: end` → `flex-end` болгож эх үүсвэрээр нь зассан). */
  webpack: (config, { dev }) => {
    if (dev && process.env.NEXT_DEV_MEMORY_CACHE === '1') config.cache = { type: 'memory', maxGenerations: 1 };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /[\\/]@arcgis[\\/]core[\\/]assets[\\/]/, message: /autoprefixer: .*mixed support/ },
    ];
    return config;
  },
};

export default nextConfig;

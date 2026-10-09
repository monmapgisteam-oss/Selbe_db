import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages (smart.selbecity.mn, 2026-09-09-өөс; өмнө selbe.monmap.mn) —
  // бүрэн статик экспорт, сервер шаардлагагүй. Домэйн нь `public/CNAME`-ээс.
  output: 'export',
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
  webpack: (config, { dev }) => {
    if (dev && process.env.NEXT_DEV_MEMORY_CACHE === '1') config.cache = { type: 'memory' };
    return config;
  },
};

export default nextConfig;

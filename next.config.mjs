import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages (selbe.monmap.mn) — бүрэн статик экспорт, сервер шаардлагагүй
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
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages (selbe.monmap.mn) — бүрэн статик экспорт, сервер шаардлагагүй
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },

  // ArcGIS MapView/SceneView нь StrictMode-ийн давхар mount-д WebGL context алдаж,
  // dev дээр зураг анивчина. Effect-үүд цэвэр destroy() хийдэг ч давхар үүсгэлт нь
  // ArcGIS-ийн хувьд үнэтэй тул унтраав.
  reactStrictMode: false,
};

export default nextConfig;

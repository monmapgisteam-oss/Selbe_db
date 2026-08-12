import type { Metadata, Viewport } from 'next';
import { Roboto, Roboto_Mono } from 'next/font/google';
// ⚠️ THEME_KEY-г 'use client' модулиас (theme.tsx) импортлохгүй: сервер компонентэд
//    тэр нь client reference proxy болж, доорх THEME_INIT-д функцын эх код шингэн
//    inline script эвдэрдэг байв. Заавал энгийн модулиас (themeKey.ts).
import { ThemeProvider } from '@/lib/theme';
import { THEME_KEY } from '@/lib/themeKey';
import './globals.css';

// Бүх апп `dynamic(ssr:false)` Portal-ын дотор ачаалагддаг тул модулиудын CSS нь
// async chunk-д орж, dev дээр `<head>`-д ОРОХГҮЙ — иймд Portal будагдсаны дараа л
// стайл ирж анивчна (FOUC), код засахад CSS алга болно. Эдгээрийг root layout
// (сервер, prerender) дээр урьдчилан импортлон `<head>`-д байнга байлгана.
// ponytail: SPA бүх модулио ачаалдаг тул CSS-ийг тусад нь хуваах утгагүй.
import './shell.module.css';
import '@/modules/overview.module.css';
import '@/modules/dashboard.module.css';
import '@/modules/survey.module.css';
import '@/modules/analysis/suitability.module.css';
import '@/modules/sheet/sheet.module.css';
import '@/modules/finance.module.css';
import '@/modules/tsogts.module.css';
import '@/modules/habea.module.css';
import '@/components/auth.module.css';
import '@/components/home.module.css';
import '@/components/swatch.module.css';
import '@/components/opacity.module.css';
import '@/components/map.module.css';
import '@/components/ui.module.css';
import '@/components/catalog.module.css';
import '@/components/tree.module.css';

// ⚠️ Төслийн ЖИГД үндсэн фонт — Roboto (Inter-ийг орлов). Roboto-д 600 жин
//    БАЙХГҮЙ тул CSS дэх font-weight:600/650 нь автоматаар хамгийн ойрын 700-д
//    буудаг (CSS фонт тааруулалт) — тод текст арай зузаан харагдана.
const roboto = Roboto({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});
// Тоон утгын зэрэгцүүлэлт (tabular) — мөн Roboto гэр бүлээс (жигд төрх)
const robotoMono = Roboto_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Сэлбэ — Орон зайн мэдээллийн портал',
  description:
    'Сэлбэ дэд төвийн орон зайн мэдээллийн портал. Багцын хил, бүсчлэл, барилгын явц, газар чөлөөлөлт, инженерийн шугам сүлжээ, талбайн хяналтын үзүүлэлт — ArcGIS үйлчилгээнээс шууд.',
  metadataBase: new URL('https://selbe.monmap.mn'),
  // favicon.ico байхгүйгээс 404 гарч байсан — SVG лого нь бүх орчин үеийн browser-т favicon болно
  icons: { icon: '/logo.svg' },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    title: 'Сэлбэ — Орон зайн мэдээллийн портал',
    description: 'Давхарга идэвхжүүлэхэд тухайн давхаргын дашбоард нээгдэнэ.',
    url: 'https://selbe.monmap.mn',
    images: ['/logo.svg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Гэрэл асах анивчилтыг (FOUC) зайлуулах — React ачаалахаас өмнө горимоо тавина
const THEME_INIT = `
try {
  var t = localStorage.getItem('${THEME_KEY}')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={`${roboto.variable} ${robotoMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <a href="#panel" className="skip">
          Дашбоард руу үсрэх
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

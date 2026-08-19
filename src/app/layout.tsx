import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
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
// ⚠️ 2026-08-17: `survey.module.css`-ийг ЖАГСААЛТААС хасав — түүний классуудыг
//    ямар ч компонент импортлодоггүй (зөвхөн энд байсан) тул критик замд дэмий
//    ачаа байлаа. Файл нь өөрөө хэвээр.
import './shell.module.css';
import '@/modules/overview.module.css';
import '@/modules/dashboard.module.css';
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

/**
 * ⚠️ 2026-08-17: ГАНЦХАН гэр бүл — INTER (envhub «Environment» порталын дизайн
 * хэлийг бүрэн дуурайв). Тэнд хоёр дахь фонт хориотой: тоон утга ч, гарчиг ч,
 * тайлбар ч бүгд Inter, зөвхөн хэмжээ/жин/tracking-ээр ялгарна. Тоон
 * зэрэгцүүлэлтийг mono фонт БИШ `.num` (tabular-nums) хийнэ.
 *
 * `--mono`, `--cond` токенууд `globals.css`-д мөн Inter руу заадаг болсон тул
 * тэдгээрийг хэрэглэдэг бүх CSS өөрчлөлтгүй ажиллана.
 */
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
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

// Гэрэл асах анивчилтыг (FOUC) зайлуулах — React ачаалахаас өмнө горимоо тавина.
// ⚠️ 2026-08-17: envhub шиг АНХДАГЧ нь DARK (урьд нь системийн тохиргоог дагадаг
// байв). Хэрэглэгчийн сонгосон горим (localStorage) ямагт давамгайлна.
// ⚠️ 2026-08-18: Хадгалагдсан утгыг ШАЛГАНА. Урьд нь localStorage-ийн юуг ч
// шууд `data-theme`-д тавьдаг байв — хуучирсан/эвдэрсэн утга (жиш. 'auto',
// хагас бичигдсэн мөр) нь `[data-theme='dark']`-т ч, `[data-theme='light']`-д ч
// тохирохгүй тул каскад `:root` дээр унаж, DARK анхдагчийн оронд ЦАЙВАР горим
// нээгддэг байлаа.
const THEME_INIT = `
try {
  var t = localStorage.getItem('${THEME_KEY}');
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={inter.variable} suppressHydrationWarning>
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

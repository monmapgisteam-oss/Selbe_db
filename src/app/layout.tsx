import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/lib/theme';
import { LocaleProvider } from '@/lib/i18n';
import { SkipLink } from '@/components/SkipLink';
import { DocumentTitle } from '@/components/DocumentTitle';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { THEME_KEY } from '@/lib/themeKey';
import './globals.css';

// Бүх апп `dynamic(ssr:false)` Portal-ын дотор ачаалагддаг тул модулиудын CSS нь
// async chunk-д орж, dev дээр `<head>`-д ОРОХГҮЙ — иймд Portal будагдсаны дараа л
// стайл ирж анивчна (FOUC), код засахад CSS алга болно. Эдгээрийг root layout
// (сервер, prerender) дээр урьдчилан импортлон `<head>`-д байнга байлгана.
// ponytail: SPA бүх модулио ачаалдаг тул CSS-ийг тусад нь хуваах утгагүй.
import './shell.module.css';
import '@/modules/bagtsOv.module.css';
import '@/modules/dashboardOv.module.css';
import '@/modules/gazarOv.module.css';
import '@/modules/habeaOv.module.css';
import '@/modules/iotOv.module.css';
import '@/modules/irgedOv.module.css';
import '@/modules/pkgFinOv.module.css';
import '@/modules/pkgProgOv.module.css';
import '@/modules/dashboard.module.css';
import '@/modules/analysis/suitability.module.css';
import '@/modules/sheet/sheet.module.css';
import '@/modules/huvaari.module.css';
import '@/modules/schem.module.css';
import '@/modules/finance.module.css';
import '@/modules/pkgFin.module.css';
import '@/modules/pkgProg.module.css';
import '@/modules/tuh.module.css';
import '@/modules/bagtsHamaaral.module.css';
import '@/modules/zuragTosol.module.css';
import '@/modules/levelPlan.module.css';
import '@/modules/habea.module.css';
import '@/components/auth.module.css';
import '@/components/locale.module.css';
import '@/components/home.module.css';
import '@/components/swatch.module.css';
import '@/components/opacity.module.css';
import '@/components/map.module.css';
import '@/components/mapTools.module.css';
import '@/components/ui.module.css';
import '@/components/catalog.module.css';
import '@/components/tree.module.css';
import '@/components/resizableColumns.module.css';

/**
 * `--mono`, `--cond` токенууд `globals.css`-д мөн Inter руу заадаг болсон тул
 * тэдгээрийг хэрэглэдэг бүх CSS өөрчлөлтгүй ажиллана.
 */

export const metadata: Metadata = {
  title: 'Сэлбэ — Орон зайн мэдээллийн портал',
  description:
    'Сэлбэ дэд төвийн орон зайн мэдээллийн портал. Багцын хил, бүсчлэл, барилгын явц, газар чөлөөлөлт, инженерийн шугам сүлжээ, талбайн хяналтын үзүүлэлт — ArcGIS үйлчилгээнээс шууд.',
  metadataBase: new URL('https://smart.selbecity.mn'),
  // favicon.ico байхгүйгээс 404 гарч байсан — SVG лого нь бүх орчин үеийн browser-т favicon болно
  icons: { icon: '/logo.svg' },
  manifest: '/manifest.json',
  referrer: 'strict-origin-when-cross-origin',
  openGraph: {
    type: 'website',
    title: 'Сэлбэ — Орон зайн мэдээллийн портал',
    description: 'Давхарга идэвхжүүлэхэд тухайн давхаргын дашбоард нээгдэнэ.',
    url: 'https://smart.selbecity.mn',
    images: ['/logo.svg'],
  },
};

/*
 * ХАРАГДАХ ТАЛБАР (viewport).
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Гэрэл асах анивчилтыг (FOUC) зайлуулах — React ачаалахаас өмнө горимоо тавина.
const THEME_INIT = `
try {
  var t = localStorage.getItem('${THEME_KEY}');
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <SkipLink />
        {/* Табын гарчгийг хэлээр нь солино — metadata нь статик prerender тул
            клиент талд л боломжтой (олдвор #37) */}
        <DocumentTitle />
        <ErrorBoundary>
          <LocaleProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </LocaleProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

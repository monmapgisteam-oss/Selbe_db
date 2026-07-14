import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Сэлбэ — Орон зайн мэдээллийн портал',
  description:
    'Сэлбэ дэд төвийн орон зайн мэдээллийн портал. Багцын хил, бүсчлэл, барилгын явц, газар чөлөөлөлт, инженерийн шугам сүлжээ, талбайн хяналтын үзүүлэлт — ArcGIS үйлчилгээнээс шууд.',
  metadataBase: new URL('https://selbe.monmap.mn'),
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
  var t = localStorage.getItem('selbe-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
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

'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from '@/components/AuthGate';

/**
 * ArcGIS SDK нь браузерын API-д (ResizeObserver, WebGL) шууд түшиглэдэг тул
 * серверт огт ажиллуулж болохгүй. Аппын үндсийг (`Root`) client-only болгож
 * ачаална — тэр нь видео дэвсгэртэй НҮҮР хуудас, сонгосон харагдацыг шийднэ.
 *
 * ⚠️ `AuthProvider` нь дээр — нүүр хуудас нэвтрэлтгүй ч харагдана; нэвтрэлт нь
 * харагдацад орох үед л шаардагдана (`useAuth`).
 */
const Root = dynamic(() => import('@/components/Root'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '100dvh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink-3)',
        fontSize: '0.85rem',
      }}
    >
      Сэлбэ порталыг ачаалж байна…
    </div>
  ),
});

export default function Page() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

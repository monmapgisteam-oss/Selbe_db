'use client';

import dynamic from 'next/dynamic';
import { AuthGate } from '@/components/AuthGate';

/**
 * ArcGIS SDK нь браузерын API-д (ResizeObserver, WebGL) шууд түшиглэдэг тул
 * серверт огт ажиллуулж болохгүй. Порталыг бүхэлд нь client-only болгож ачаална.
 */
const Portal = dynamic(() => import('@/components/Portal'), {
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
  // Нэвтэрсэн (эсвэл нэвтрэлт унтраалттай) үед л Portal ачаалагдана
  return (
    <AuthGate>
      <Portal />
    </AuthGate>
  );
}

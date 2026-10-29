'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { t as tr, getDictEpoch, loadLocaleDict, subscribeDict } from '@/lib/i18nCore';
import { AuthProvider } from '@/components/AuthGate';
import { LocaleRemount } from '@/lib/i18n';

/**
 * ArcGIS SDK нь браузерын API-д (ResizeObserver, WebGL) шууд түшиглэдэг тул
 * серверт огт ажиллуулж болохгүй. Аппын үндсийг (`Root`) client-only болгож
 * ачаална — тэр нь видео дэвсгэртэй НҮҮР хуудас, сонгосон харагдацыг шийднэ.
 */
const Root = dynamic(
  () => Promise.all([
    import('@/components/Root'),
    loadLocaleDict().catch((e: unknown) => { console.warn('[selbe] хэлний толь татагдсангүй:', e); }),
  ]).then(([m]) => m),
  { ssr: false, loading: () => <Booting /> },
);

/** Ачаалах мэдэгдэл — толь ирэхэд (англи горим) дахин зурагдана (`subscribeDict`) */
function Booting() {
  useSyncExternalStore(subscribeDict, getDictEpoch, getDictEpoch);
  return (
    <div
      style={{
        height: '100dvh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink-3)',
        fontSize: '0.85rem',
      }}
    >
      {tr('Сэлбэ порталыг ачаалж байна…')}
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <LocaleRemount>
        <Root />
      </LocaleRemount>
    </AuthProvider>
  );
}

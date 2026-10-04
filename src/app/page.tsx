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
 *
 * ⚠️ `AuthProvider` нь дээр — нүүр хуудас нэвтрэлтгүй ч харагдана; нэвтрэлт нь
 * харагдацад орох үед л шаардагдана (`useAuth`).
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `AuthProvider` нь `LocaleRemount`-ийн
 *    ГАДНА — хэл солиход нэвтрэлтийн шалгалт (portal.load · эрхийн хүснэгт) ДАХИН
 *    ЯВАХГҮЙ, зөвхөн `Root` (орчуулгатай дэд мод) remount болно (`i18n.tsx`-ийн ⚠️).
 */
/*
 * ⚠️ 2026-10-04 (ачааллын аудит): англи хэлний толь (`en.ts`, ~720 КБ) нь эхний
 *    chunk-д ОРОХОО БОЛЬСОН (`i18nCore.loadLocaleDict`-ийн ⚠️). `Root` нь толь
 *    ачаалагдтал ХҮЛЭЭНЭ — англи горимд `Root`-ын доорх бүх `tr()` (модулийн
 *    түвшний getter, `perLocale` ч) эхний зурагтаас англиар гарна. Хоёр хүсэлт
 *    ЗЭРЭГЦЭЖ явна (дараалсан биш). mn-д `loadLocaleDict` шууд шийднэ.
 *    Толь татагдаж чадаагүй бол апп МОНГОЛООР ч гэсэн нээгдэнэ (`catch`) —
 *    хэлний алдаанаас болж портал огт нээгдэхгүй байх нь илүү муу.
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

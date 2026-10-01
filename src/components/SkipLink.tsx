'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { t as tr, getLocale, getServerLocale, subscribeLocale } from '@/lib/i18nCore';

/**
 * ГАРААР УДИРДАХ АЛГАСАХ ХОЛБООС — Tab дархад хамгийн түрүүнд гарч, каталог,
 * цэсийг алгасаад шууд самбар руу үсэрнэ.
 *
 * ⚠️ Тусдаа 'use client' компонент байх ШАЛТГААН: `layout.tsx` нь СЕРВЕР
 * компонент бөгөөд орчуулагчийг тэндээс дуудаж болохгүй (Next нь 'use client'
 * модулийн экспортыг client reference proxy болгодог). Ганц мөрийн текстийн
 * төлөө layout-ыг бүхэлд нь client болгох нь үнэтэй — иймд зөвхөн энэ холбоосыг
 * салгав.
 *
 * ⚠️ ХОЁР АЛХАМТ зурагдалт. Энэ бол prerender хийгддэг ЦОРЫН ГАНЦ орчуулагдсан
 * текст: сервер дээр localStorage байхгүй тул үргэлж монголоор гардаг. Эхний
 * зурагтаа ЯГ ТҮҮНИЙГ давтаж (hydration зөрчилгүй), mount болсны дараа л
 * орчуулна. `suppressHydrationWarning` нь энд ТААРАХГҮЙ байсан — тэр нь
 * анхааруулгыг дуугүй болгодог ч серверийн текстийг ХЭВЭЭР үлдээдэг тул
 * англи горимд монголоороо гацдаг байв.
 */
export function SkipLink() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: hydration — эхний зураг серверийнхтэй ижил байх ёстой, localStorage/цагийг mount-ын ДАРАА л уншина
  useEffect(() => setMounted(true), []);
  /* ⚠️ 2026-09-30: ХЭЛНИЙ STORE-ЫГ ЗАХИАЛНА (утга нь зөвхөн дахин зурахад). SkipLink нь
     `layout.tsx`-д `LocaleProvider`-ийн ГАДНА тул хэл солиход (2026-09-30-наас дахин
     ачаалалтгүй, `key` remount) өмнөх хэлээрээ үлддэг байв — `DocumentTitle`-ийн хэв.
     Hydration-д серверийн утга (mn) тул зөрчилгүй; текст нь `mounted`-оор хаалттай хэвээр. */
  useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);

  return (
    <a href="#panel" className="skip">
      {mounted ? tr('Дашбоард руу үсрэх') : 'Дашбоард руу үсрэх'}
    </a>
  );
}

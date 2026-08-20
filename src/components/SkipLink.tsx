'use client';

import { useEffect, useState } from 'react';

import { t as tr } from '@/lib/i18nCore';

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
  useEffect(() => setMounted(true), []);

  return (
    <a href="#panel" className="skip">
      {mounted ? tr('Дашбоард руу үсрэх') : 'Дашбоард руу үсрэх'}
    </a>
  );
}

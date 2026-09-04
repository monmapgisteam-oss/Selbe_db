'use client';

import { useEffect } from 'react';

import { t as tr } from '@/lib/i18nCore';

/**
 * ХӨТЧИЙН ТАБЫН ГАРЧГИЙГ ХЭЛЭЭР НЬ СОЛИХ (2026-08 аудит, олдвор #37).
 *
 * ⚠️ layout.tsx-ийн `metadata.title` нь статик export-ын prerender —
 * LocaleProvider хэл тогтоосны дараа ч өөрчлөгдөхгүй тул EN хэрэглэгчийн
 * таб/bookmark монголоор үлддэг байв. SkipLink-ийн хоёр алхамт хэвтэй ижил:
 * сервер дээр монгол гарчиг prerender хийгдэж, mount болсны ДАРАА л клиент
 * талд орчуулна (тиймээс hydration зөрчил үүсэхгүй).
 *
 * ⚠️ Тусдаа 'use client' файл байх шалтгаан — SkipLink-тэй ижил: layout.tsx
 * нь сервер компонент тул орчуулагчийг тэндээс шууд дуудаж болохгүй.
 * Mount-д НЭГ л удаа хангалттай: `setLocale` нь `location.reload()` хийдэг.
 */
export function DocumentTitle() {
  useEffect(() => {
    // mn хэлэнд tr() түлхүүрээ өөрийг нь буцаадаг тул нөхцөл шалгах шаардлагагүй
    const t = tr('Сэлбэ — Орон зайн мэдээллийн портал');
    if (document.title !== t) document.title = t;
  }, []);
  return null;
}

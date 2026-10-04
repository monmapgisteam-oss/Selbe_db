'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { t as tr, getDictEpoch, getLocale, getServerLocale, subscribeDict, subscribeLocale } from '@/lib/i18nCore';

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
 *
 * ⚠️ 2026-09-30: хэлийг `i18nCore`-ийн store-оос захиалж, солигдох бүрд
 * гарчгийг дахин тавина (урьд нь mount-д нэг удаа — `setLocale` заавал дахин
 * ачаалдаг байсан; одоо `LOCALE_SWITCH_RELOADS` унтраалттай ч зөв).
 */
export function DocumentTitle() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);
  /* ⚠️ 2026-10-04: англи толь ХОЙШЛОГДОН ачаалагддаг (`i18nCore.loadLocaleDict`) — ирэхэд
     гарчгийг дахин тавина (эс бөгөөс англи горимд монгол гарчиг үлдэнэ). */
  const dictEpoch = useSyncExternalStore(subscribeDict, getDictEpoch, getDictEpoch);
  useEffect(() => {
    // mn хэлэнд tr() түлхүүрээ өөрийг нь буцаадаг тул нөхцөл шалгах шаардлагагүй
    const t = tr('Сэлбэ — Орон зайн мэдээллийн портал');
    if (document.title !== t) document.title = t;
  }, [locale, dictEpoch]);
  return null;
}

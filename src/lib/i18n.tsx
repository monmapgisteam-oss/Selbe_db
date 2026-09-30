'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { DEFAULT_LOCALE, type Locale } from './localeKey';
import {
  getLocale, getLocaleGeneration, getServerLocale, setLocale, subscribeLocale,
} from './i18nCore';

/**
 * ОЛОН ХЭЛНИЙ REACT ДАВХАРГА.
 *
 * ⚠️ Орчуулгын ЦӨМ нь `i18nCore.ts`-д ('use client'-ГҮЙ) — `themeKey.ts` /
 * `theme.tsx` хуваалттай яг ижил шалтгаан. Өгөгдлийн модулиуд (`services.ts`,
 * `financeFieldLabels.ts`) орчуулагчийг ТЭНДЭЭС импортолно; энэ файл нь зөвхөн
 * React-д хэрэгтэй хэсэг.
 *
 * ⚠️ Кодод орчуулагч нь `tr` нэрээр импортлогддог — `t` нь энэ кодын олон
 * файлд (жиш. `ViewPanel.tsx`-ийн `t: Totals`) аль хэдийн эзэлсэн нэр.
 */

export { t, t as tr, getLocale, setLocale, perLocale } from './i18nCore';
export { LOCALE_KEY, LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, type Locale } from './localeKey';

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

const getServerGeneration = () => 0;

/**
 * ⚠️ 2026-09-30: хэл нь `i18nCore`-ийн store-оос `useSyncExternalStore`-оор —
 *    анхны утга СИНХРОН (урьд нь эффект дотор `setState` тул эхний рендер
 *    үргэлж mn байгаад дараа нь солигддог байв). Prerender-д
 *    `getServerLocale` (mn); hydration-ы дараа React өөрөө клиентийн утгаар
 *    дахин зурна — зөрчилгүй.
 * ⚠️ `key={generation}` — сешн дотор хэл солигдвол (`LOCALE_SWITCH_RELOADS`
 *    2026-09-30-наас `false`) аппын дэд модыг бүхэлд нь remount хийнэ: `tr()`-ийг
 *    рендерээс гадуур (useMemo/useState initializer) дуудсан газрууд шинэ
 *    хэлээр дахин үнэлэгдэнэ. Анхны уншилтад generation 0 тул hydration-ы
 *    дараах локаль тохируулга remount ҮҮСГЭХГҮЙ.
 * ⚠️ Модулийн түвшний тогтмолууд (`VIEWS.title` гэх мэт) remount-д ДАХИН
 *    ҮНЭЛЭГДЭХГҮЙ — тэдгээр нь getter / `perLocale(() => …)` хэлбэрт
 *    (`i18nCore.perLocale`, `i18nLazy.check.mjs`); шинэ `key: tr('…')`
 *    модулийн түвшинд бичвэл тэр шалгуур унагана.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);
  const generation = useSyncExternalStore(subscribeLocale, getLocaleGeneration, getServerGeneration);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <Ctx.Provider key={generation} value={locale}>{children}</Ctx.Provider>;
}

/** Хэлний сонголт — товч, солигч UI-д */
export function useLocale() {
  return { locale: useContext(Ctx), setLocale };
}

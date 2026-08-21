'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEFAULT_LOCALE, type Locale } from './localeKey';
import { getLocale, setLocale } from './i18nCore';

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

export { t, t as tr, getLocale, setLocale } from './i18nCore';
export { LOCALE_KEY, LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, type Locale } from './localeKey';

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Сервер дээр `getLocale()` нь үргэлж mn; клиент дээр эхний эффектэд зөв утга
  const [locale, setState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const l = getLocale();
    setState(l);
    document.documentElement.lang = l;
  }, []);

  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

/** Хэлний сонголт — товч, солигч UI-д */
export function useLocale() {
  return { locale: useContext(Ctx), setLocale };
}

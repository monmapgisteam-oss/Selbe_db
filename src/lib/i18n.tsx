'use client';

import { createContext, Fragment, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { DEFAULT_LOCALE, type Locale } from './localeKey';
import {
  getLocale, getLocaleGeneration, getServerLocale, setLocale, subscribeLocale,
} from './i18nCore';

/**
 * ОЛОН ХЭЛНИЙ REACT ДАВХАРГА.
 */

export { t, t as tr, getLocale, setLocale, perLocale } from './i18nCore';
export { LOCALE_KEY, LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, type Locale } from './localeKey';

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

const getServerGeneration = () => 0;

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

/**
 * ХЭЛ СОЛИГДОХОД ДЭД МОДЫГ REMOUNT ХИЙХ ХИЛ ( 2026-10-01, дээрх `LocaleProvider`).
 */
export function LocaleRemount({ children }: { children: ReactNode }) {
  const generation = useSyncExternalStore(subscribeLocale, getLocaleGeneration, getServerGeneration);
  return <Fragment key={generation}>{children}</Fragment>;
}

/** Хэлний сонголт — товч, солигч UI-д */
export function useLocale() {
  return { locale: useContext(Ctx), setLocale };
}

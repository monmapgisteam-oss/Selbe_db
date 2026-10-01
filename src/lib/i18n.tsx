'use client';

import { createContext, Fragment, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

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
 *    ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `key` ЭНД БИШ — `LocaleRemount`-д
 *    (доор). Урьд энэ Provider бүх аппыг (`page.tsx`-ийн `AuthProvider`-ийг ч)
 *    remount хийдэг тул хэл солих бүрд НЭВТРЭЛТИЙН ШАЛГАЛТ (portal.load · эрхийн
 *    хүснэгт) дахин явж, дэлгэц «шалгаж байна» болж анивчдаг байв. Одоо
 *    `AuthProvider` (текстгүй контекст) remount-ийн ГАДНА, `Root` дотор нь.
 * ⚠️ Модулийн түвшний тогтмолууд (`VIEWS.title` гэх мэт) remount-д ДАХИН
 *    ҮНЭЛЭГДЭХГҮЙ — тэдгээр нь getter / `perLocale(() => …)` хэлбэрт
 *    (`i18nCore.perLocale`, `i18nLazy.check.mjs`); шинэ `key: tr('…')`
 *    модулийн түвшинд бичвэл тэр шалгуур унагана.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

/**
 * ХЭЛ СОЛИГДОХОД ДЭД МОДЫГ REMOUNT ХИЙХ ХИЛ (⚠️ 2026-10-01, дээрх `LocaleProvider`-ийн ⚠️).
 *
 * ⚠️ Зөвхөн `tr()`-ийг рендерээс гадуур (useMemo/useState initializer) хадгалдаг
 *    дэд модыг ороо — `page.tsx`-д `Root`. Нэвтрэлт (`AuthProvider`) ба бусад
 *    текстгүй, үнэтэй төлөвийг ГАДНА нь үлдээнэ.
 * ⚠️ Газрын зургийн view (ArcGIS) ДОТОР нь үлдэх ч remount-д УСТАХГҮЙ —
 *    `MapCanvas` хэл солих агшинд view-гээ `mapPark`-д түр хадгалж, шинэ
 *    `MapCanvas` түүнийгээ авна (камер, ачаалсан tile хэвээр).
 */
export function LocaleRemount({ children }: { children: ReactNode }) {
  const generation = useSyncExternalStore(subscribeLocale, getLocaleGeneration, getServerGeneration);
  return <Fragment key={generation}>{children}</Fragment>;
}

/** Хэлний сонголт — товч, солигч UI-д */
export function useLocale() {
  return { locale: useContext(Ctx), setLocale };
}

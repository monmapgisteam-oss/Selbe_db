/**
 * Хэлний localStorage түлхүүр ба төрөл — `i18n.tsx` (client) ба `layout.tsx`
 * (сервер) хоёул эндээс уншина.
 *
 * ⚠️ ЗААВАЛ 'use client'-ГҮЙ тусдаа файл — `themeKey.ts`-тэй яг ижил шалтгаан:
 * 'use client' модулиас сервер компонент рүү импортлогдсон утгыг Next нь CLIENT
 * REFERENCE proxy болгодог тул `<script>`-д шингээх мөрийг эвддэг.
 */
export const LOCALE_KEY = 'selbe-locale';

/** Дэмжигдэх хэлүүд — `mn` нь ЭХ ХЭЛ (кодод шууд бичигдсэн текст). */
export const LOCALES = ['mn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'mn';

/** Хадгалагдсан/танихгүй утгыг найдвартай хэл болгоно */
export const asLocale = (v: unknown): Locale =>
  LOCALES.includes(v as Locale) ? (v as Locale) : DEFAULT_LOCALE;

/** Хэлний товчинд харуулах нэр */
export const LOCALE_LABEL: Record<Locale, string> = {
  mn: 'Монгол',
  en: 'English',
};

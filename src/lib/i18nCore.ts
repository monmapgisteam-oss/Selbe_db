/**
 * ОЛОН ХЭЛНИЙ ЦӨМ — эх текст нь ӨӨРӨӨ түлхүүр.
 *
 * `t('Ногоон байгууламж')` → mn дээр яг өөрөө, en дээр толиос хайна. Иймд
 * МОНГОЛ толь ХЭРЭГГҮЙ: түлхүүр олдохгүй бол эх мөрөө буцаана. gettext,
 * react-intl, vue-i18n бүгд ийм зарчмаар ажилладаг.
 *
 * ⚠️ ЗААВАЛ 'use client'-ГҮЙ тусдаа файл — `themeKey.ts`/`theme.tsx`-тэй яг ижил
 * шалтгаан. `t`-г `services.ts`, `financeFieldLabels.ts` зэрэг ЭНГИЙН (client
 * тэмдэггүй) өгөгдлийн модулиуд импортолдог. Хэрэв эх нь 'use client' байвал
 * Next тэдгээрийг client reference proxy болгож, модулийн түвшний дуудалт
 * эвдэрнэ. React-ийн хэсэг (`LocaleProvider`, `useT`) нь `i18n.tsx`-д.
 *
 * ⚠️ Кодын монгол текстийг ЗАСВАЛ `en.ts`-ийн түлхүүр хоцорч, тэр мөр англи
 * дээр орчуулагдахаа болино (унахгүй — монголоор харагдана).
 */
import en from '@/i18n/en';
import enData from '@/i18n/enData';
import { LOCALE_KEY, DEFAULT_LOCALE, asLocale, type Locale } from './localeKey';

type Dict = Record<string, string>;

/**
 * ⚠️ Хоёр эх нэгтгэгдэнэ: `en.ts` нь КОДЫН мөрүүд, `enData.ts` нь ArcGIS-ээс
 * ирдэг ӨГӨГДЛИЙН утгууд. Сүүлийнх нь кодод бичигдээгүй тул шалгагч түүнийг
 * «хэрэглэгдээгүй» гэж үзэхээс сэргийлж тусдаа файлд байдаг.
 */
const DICTS: Partial<Record<Locale, Dict>> = { en: { ...(en as Dict), ...(enData as Dict) } };

/**
 * ⚠️ ХЭЛИЙГ МОДУЛЬ АЧААЛАХ ҮЕД, СИНХРОНООР тогтооно.
 *
 * Учир нь `services.ts`, `financeFieldLabels.ts`, `wbs.data.ts` зэрэг өгөгдлийн
 * модулиуд `t(...)`-ийг МОДУЛИЙН ТҮВШИНД (компонентээс гадуур, нэг удаа) дуудна.
 * Хэл нь эффект дотор хожим тавигдвал тэдгээр тогтмолууд МОНГОЛООР хөлдөж,
 * англи горимд хэсэг нь орчуулагдаагүй үлдэнэ.
 *
 * Prerender (статик экспорт)-ийн үед `localStorage` байхгүй — анхдагч mn. Аппын
 * их бие `dynamic(ssr:false)` доор ачаалагддаг тул hydration зөрчил гарахгүй.
 */
function initial(): Locale {
  try {
    return asLocale(localStorage.getItem(LOCALE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

const current: Locale = typeof window === 'undefined' ? DEFAULT_LOCALE : initial();

/**
 * `{0}`, `{1}` … байрлалын орлуулга.
 *
 * ⚠️ Байрлалаар (нэрээр биш) учир нь эх кодын `${expr}` нь дурын илэрхийлэл
 * бөгөөд утга учиртай нэр өгөх боломжгүй. Байрлал нь орчуулагчид үг дараалал
 * солих эрхийг хэвээр үлдээнэ — англи дээр `{1}`-ийг урд нь тавьж болно.
 */
function interpolate(s: string, args: readonly unknown[]): string {
  if (!args.length) return s;
  return s.replace(/\{(\d+)\}/g, (whole, i: string) => {
    const v = args[Number(i)];
    return v === undefined ? whole : String(v);
  });
}

/**
 * Орчуулах. Модулийн түвшинд ч, компонент дотор ч дуудаж болно.
 *
 * ```ts
 * t('Нийт төсөв')
 * t('{0} багц хоцорч байна', num(lagging))
 * ```
 */
export function t(key: string, ...args: unknown[]): string {
  return interpolate(DICTS[current]?.[key] ?? key, args);
}

/** Одоогийн хэл — React-ээс гадуур уншихад */
export const getLocale = (): Locale => current;

/**
 * Хэл солих.
 *
 * ⚠️ ХУУДСЫГ ДАХИН АЧААЛНА. Дээрх шалтгаанаар: модулийн түвшний олон зуун
 * тогтмол ачаалах агшиндаа орчуулагддаг тул зөвхөн React-ийг дахин зураад
 * тэдгээрийг шинэчилж ЧАДАХГҮЙ. Дахин ачаалах нь хэл солих гэсэн ховор,
 * зориудын үйлдэлд хүлээн зөвшөөрөгдөх үнэ — оронд нь 90 файлын турш «хагас
 * орчуулагдсан дэлгэц» гэсэн нууц алдааг бүрмөсөн үгүй болгоно.
 */
export function setLocale(next: Locale): void {
  if (next === current) return;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    /* хувийн горим — санахгүй ч дахин ачаалахад анхдагчаар нээгдэнэ */
  }
  location.reload();
}

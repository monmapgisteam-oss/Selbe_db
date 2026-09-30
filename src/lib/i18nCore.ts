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
 * эвдэрнэ. React-ийн хэсэг (`LocaleProvider`) нь `i18n.tsx`-д.
 *
 * ⚠️ Кодын монгол текстийг ЗАСВАЛ `en.ts`-ийн түлхүүр хоцорч, тэр мөр англи
 * дээр орчуулагдахаа болино (унахгүй — монголоор харагдана).
 *
 * ⚠️ React-гүй, Node-д ч ачаалагдана (`agent.check.mjs` зэрэг тест `en.ts`-ийг
 * үүгээр уншдаг) — энд `react` импортлохгүй.
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

/* ══ ЖИЖИГ STORE (2026-09-30) — `useSyncExternalStore`-д зориулсан ══
 *
 * `current` нь одоогийн хэл; `generation` нь СЕШН ДОТОР хэл солигдсон тоо
 * (анхны уншилт 0). `i18n.tsx`-ийн `LocaleProvider` энэ хоёрыг захиалж,
 * `generation`-оор аппын дэд модыг `key`-ээр remount хийнэ (доорх `setLocale`).
 */
let current: Locale = typeof window === 'undefined' ? DEFAULT_LOCALE : initial();
let generation = 0;
const listeners = new Set<() => void>();

/** Хэл/үеийн өөрчлөлтийг захиалах — `useSyncExternalStore`-ийн `subscribe` */
export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

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

/** Одоогийн хэл — React-ээс гадуур уншихад; `useSyncExternalStore`-ийн `getSnapshot` */
export const getLocale = (): Locale => current;

/** Prerender-ийн хэл (үргэлж mn) — `useSyncExternalStore`-ийн `getServerSnapshot` */
export const getServerLocale = (): Locale => DEFAULT_LOCALE;

/** Сешн доторх хэл солилтын тоо — `LocaleProvider`-ын remount `key` */
export const getLocaleGeneration = (): number => generation;

/**
 * ХЭЛ БҮРД НЭГ УДАА бодогдох тогтмол — модулийн түвшний `tr()`-тэй массив/
 * объектод (2026-09-30).
 *
 * ```ts
 * const DIRS = perLocale(() => [tr('Хойд'), tr('Зүүн')]);
 * DIRS()[0]   // одоогийн хэлээр; хэл солигдвол дараагийн дуудалтад дахин бодно
 * ```
 *
 * ⚠️ Үр дүнг `generation`-оор кэшилдэг тул identity нэг хэл дотор ТОГТМОЛ —
 *    React-ийн deps/`useMemo`-д аюулгүй (энгийн getter бол дуудалт бүрд шинэ
 *    массив үүсгэж, эффектийг үүрд давтуулна). Node/prerender-д `generation`
 *    үргэлж 0 тул нэг л удаа бодогдоно — өмнөх `const X = [...]`-тэй ижил зардал.
 * ⚠️ Мөр (string) утгад ХЭРЭГГҮЙ — `get title() { return tr('…'); }` хангалттай:
 *    primitive-д identity байхгүй, толины хайлт нь хямд.
 */
export function perLocale<T>(make: () => T): () => T {
  let gen = -1;
  let val: T;
  return () => {
    if (gen !== generation) { val = make(); gen = generation; }
    return val;
  };
}

/**
 * ⚠️ 2026-09-30: ХЭЛ СОЛИХОД ХУУДАС ДАХИН АЧААЛАГДАХГҮЙ (`false`).
 *
 * Store шинэчлэгдэж, `LocaleProvider` `key={generation}`-ээр аппын дэд модыг
 * remount хийнэ — `<html lang>`, табын гарчиг, бүх компонент шинэ хэлээр
 * зурагдана. Урьд `true` байсан шалтгаан: модулийн түвшинд (функцээс гадуур)
 * дуудсан `tr('…')` — `VIEWS.title`, `financeFieldLabels`, `wbs.data`,
 * `agent/datasets` … ~1,540 дуудалт, 50 гаруй файл — ачаалах үеийн хэлээр
 * ХӨЛДДӨГ байв (модуль нэг л удаа ачаалагддаг, remount ч дахин үнэлэхгүй).
 * 2026-09-30-нд бүгдийг lazy болгов:
 *   · `key: tr('…')`        → `get key() { return tr('…'); }` (унших бүрд толь)
 *   · массив/объект утга     → `perLocale(() => …)` (дээр) + getter
 *   · `const X = tr('…')`   → `() => tr('…')`, дуудалтад `X()`
 *   · tuple хүснэгт (`pkg.ts`) → нэр нь thunk `() => tr('…')`
 * `i18nLazy.check.mjs` шинэ модулийн түвшний дуудалтыг унагана — туг буцааж
 * `true` болгох шаардлагагүй. Node/prerender-д `generation` 0 тул getter ч,
 * `perLocale` ч урьдын тогтмолтой ижил (монгол) утга өгнө.
 */
export const LOCALE_SWITCH_RELOADS: boolean = false;

/**
 * Хэл солих. Сонголтыг хадгалаад, дээрх тугаас хамааран хуудсыг дахин
 * ачаална ЭСВЭЛ store-оо шинэчилж захиалагчдад мэдэгдэнэ.
 */
export function setLocale(next: Locale): void {
  if (next === current) return;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    /* хувийн горим — санахгүй ч дахин ачаалахад анхдагчаар нээгдэнэ */
  }
  if (LOCALE_SWITCH_RELOADS) {
    location.reload();
    return;
  }
  current = next;
  generation += 1;
  listeners.forEach((fn) => fn());
}

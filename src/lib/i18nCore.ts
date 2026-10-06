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
import { LOCALE_KEY, DEFAULT_LOCALE, asLocale, type Locale } from './localeKey';

type Dict = Record<string, string>;

/**
 * ⚠️ Хоёр эх нэгтгэгдэнэ: `en.ts` нь КОДЫН мөрүүд, `enData.ts` нь ArcGIS-ээс
 * ирдэг ӨГӨГДЛИЙН утгууд. Сүүлийнх нь кодод бичигдээгүй тул шалгагч түүнийг
 * «хэрэглэгдээгүй» гэж үзэхээс сэргийлж тусдаа файлд байдаг.
 *
 * ⚠️ 2026-10-04 (ачааллын аудит): толь СТАТИК импорт БИШ — `loadLocaleDict`-ээр
 *    (доор) хэрэгтэй үед л татагдана. `en.ts` нь ~720 КБ эх код бөгөөд урьд нь
 *    `layout`/`page`-ийн ЭХНИЙ chunk-д орж, хэрэглэгчдийн дийлэнх болох МОНГОЛ
 *    хэрэглэгчид ч бүрэн татагдаж parse хийгддэг байв (эхний chunk-ийн эх кодын
 *    ~49%). Одоо mn хэрэглэгч огт татахгүй.
 * ⚠️ `t()` СИНХРОН хэвээр: англи горимд аппын үндэс (`page.tsx`-ийн `Root`)
 *    толь ачаалагдтал ЗУРАГДАХГҮЙ (`loadLocaleDict`-ийг хүлээнэ), хэл солиход
 *    (`setLocale`) толь эхлээд ачаалагдаад ДАРАА НЬ store солигдоно. Иймд
 *    толь алга үед `tr()` дуудагдах цорын ганц газар нь `Root`-оос ГАДНАХ
 *    жижиг хэсгүүд (ачаалах мэдэгдэл, `SkipLink`, `DocumentTitle`) — тэдгээр
 *    `subscribeDict`-ээр толь ирэхэд дахин зурагдана.
 */
const DICTS: Partial<Record<Locale, Dict>> = {};

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
/** Хэрэглэгчийн СҮҮЛД сонгосон хэл — толь ачаалагдаж байх үед `current`-оос түрүүлж болно */
let wanted: Locale = current;
const listeners = new Set<() => void>();

/* ══ ТОЛИЙН ХОЙШЛУУЛСАН АЧААЛАЛТ (⚠️ 2026-10-04, дээрх `DICTS`-ийн ⚠️) ══ */

/** Хэлний толь бүрийн нэг л удаагийн ачаалалт (давхар хүсэлтгүй) */
const dictLoads: Partial<Record<Locale, Promise<void>>> = {};
/** Толь ачаалагдсан тоо — `useSyncExternalStore`-ийн snapshot (`subscribeDict`) */
let dictEpoch = 0;
const dictListeners = new Set<() => void>();

/**
 * Хэлний толийг ачаална (mn-д толь хэрэггүй — шууд шийднэ). Давхар дуудалт нэг
 * хүсэлтийг хуваалцана; сүлжээний алдаанд дараагийн дуудалт дахин оролдоно.
 *
 * ⚠️ `dataBus`-ийн `subscribeLocale`-ийг МЭДЭГДЭХГҮЙ (кэш хаяхгүй) — толь ирэх
 *    нь хэл СОЛИХ биш. Зөвхөн `subscribeDict`-ийн захиалагчид (Root-оос гадуурх
 *    текст) дахин зурагдана.
 * ⚠️ Webpack-д `import()` нь тусдаа chunk — монгол хэрэглэгч хэзээ ч татахгүй.
 */
export function loadLocaleDict(l: Locale = current): Promise<void> {
  if (l === DEFAULT_LOCALE || DICTS[l]) return Promise.resolve();
  const p = dictLoads[l] ?? Promise.all([import('@/i18n/en'), import('@/i18n/enData')]).then(([a, b]) => {
    DICTS[l] = { ...(a.default as Dict), ...(b.default as Dict) };
    dictEpoch += 1;
    dictListeners.forEach((fn) => fn());
  });
  dictLoads[l] = p;
  p.catch(() => { if (dictLoads[l] === p) delete dictLoads[l]; });
  return p;
}

/** Толь ачаалагдахыг захиалах — `useSyncExternalStore`-ийн `subscribe` */
export function subscribeDict(fn: () => void): () => void {
  dictListeners.add(fn);
  return () => { dictListeners.delete(fn); };
}

/** Ачаалагдсан толины тоо (snapshot) — prerender-д 0 */
export const getDictEpoch = (): number => dictEpoch;

/* ⚠️ Хөтөч дээр англи хэрэглэгчийн толийг МОДУЛЬ АЧААЛАХ ДАРУЙ эхлүүлнэ — `Root`
   chunk-тэй зэрэгцэж татагдана (дараалсан хүлээлт үүсэхгүй). Алдааг энд залгина;
   `Root`-ийн loader дахин оролдоно. */
if (typeof window !== 'undefined' && current !== DEFAULT_LOCALE) {
  loadLocaleDict(current).catch(() => { /* `page.tsx`-ийн loader дахин оролдоно */ });
}

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
  if (next === wanted) return;
  wanted = next;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    /* хувийн горим — санахгүй ч дахин ачаалахад анхдагчаар нээгдэнэ */
  }
  if (LOCALE_SWITCH_RELOADS) {
    location.reload();
    return;
  }
  /* ⚠️ 2026-10-04: толь бэлэн (эсвэл mn) бол урьдын адил СИНХРОН солино. Үгүй бол
     эхлээд толийг ачаалаад ДАРАА НЬ солино — хагас орчуулагдсан дэлгэц гарахгүй.
     Хүлээх хооронд хэрэглэгч буцааж сольсон бол (`wanted`) хуучин хүсэлтийг хэрэгжүүлэхгүй.
     Толь татагдаж чадаагүй бол хэл СОЛИГДОХГҮЙ (монгол дэлгэц `lang=en`-тэй холилдохгүй). */
  if (next !== DEFAULT_LOCALE && !DICTS[next]) {
    setSwitchState('loading');
    loadLocaleDict(next).then(
      () => {
        if (wanted === next) applyLocale(next);
        setSwitchState('idle');
      },
      (e: unknown) => {
        console.warn('[selbe] хэлний толь татагдсангүй:', e);
        if (wanted !== next) { setSwitchState('idle'); return; }
        wanted = current;
        try { localStorage.setItem(LOCALE_KEY, current); } catch { /* хувийн горим */ }
        setSwitchState('error');
      },
    );
    return;
  }
  setSwitchState('idle');
  applyLocale(next);
}

/* ══ ХЭЛ СОЛИХ ЯВЦ (⚠️ 2026-10-06, аудит) ══
 *
 * Англи толь (~720 КБ) татагдах хооронд товч ямар ч дохиогүй, уналт нь зөвхөн
 * `console.warn` байв — хэрэглэгч «товч ажиллахгүй байна» гэж дахин дахин дардаг.
 * `LocaleToggle` энэ төлөвийг `subscribeDict`-ээр (тусдаа сонсогчгүй) уншиж
 * завгүй/алдааны тэмдэг харуулна. Snapshot нь primitive — `useSyncExternalStore`-д аюулгүй.
 */
export type LocaleSwitchState = 'idle' | 'loading' | 'error';
let switchState: LocaleSwitchState = 'idle';
function setSwitchState(s: LocaleSwitchState): void {
  if (switchState === s) return;
  switchState = s;
  dictListeners.forEach((fn) => fn());
}
/** Хэл солих явц — `useSyncExternalStore(subscribeDict, getLocaleSwitchState, …)` */
export const getLocaleSwitchState = (): LocaleSwitchState => switchState;
/** Prerender-ийн snapshot — үргэлж `idle` */
export const getServerLocaleSwitchState = (): LocaleSwitchState => 'idle';
/** Алдааны мэдэгдлийг хаах */
export function clearLocaleSwitchError(): void {
  if (switchState === 'error') setSwitchState('idle');
}

function applyLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  generation += 1;
  listeners.forEach((fn) => fn());
}

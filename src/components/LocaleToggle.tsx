'use client';

import { useLocale } from '@/lib/i18n';
import { t as tr, loadLocaleDict } from '@/lib/i18nCore';
import s from './locale.module.css';

/**
 * ХАДГАЛААГҮЙ АЖИЛ БАЙГАА ЭСЭХ — хуудасны `beforeunload` хамгаалалтуудаас асууна.
 *
 * ⚠️ 2026-09-30: ЯАГААД. Хэл солих нь 2026-09-30-наас хуудсыг ДАХИН АЧААЛАХГҮЙ —
 *    `LocaleProvider` аппын дэд модыг `key`-ээр REMOUNT хийнэ
 *    (`i18nCore.LOCALE_SWITCH_RELOADS`). Reload үед модуль бүрийн `beforeunload`
 *    хамгаалалт (Finance · CashflowPlan · Huvaari-ийн ноорог ба батлах гинж · Qaqc ·
 *    GazarEdit · ZovshoorolEdit · «Гүйцэтгэл бөглөх»-ийн `useDraftSync` · Pivot ·
 *    UserAdmin) хөтчийн «Хуудаснаас гарах уу?» асуултыг гаргадаг байв. Remount нь
 *    `beforeunload` үүсгэдэггүй тул хадгалаагүй засвар, хадгалах/батлах гинж
 *    АСУУЛТГҮЙ, ЧИМЭЭГҮЙ алга болдог байв.
 * ⚠️ Модуль бүрийн «dirty» төлөвийг энд ХУУЛБАРЛАХГҮЙ (шинэ модуль нэмэгдэхэд
 *    хоцорно) — ЯГ ТЭДГЭЭР сонсогчдоос асууна: цуцлах боломжтой хиймэл
 *    `beforeunload` илгээхэд аль нэг нь `preventDefault()` (эсвэл `returnValue = ''`)
 *    дуудвал «хадгалаагүй ажил бий». Хуудас хаагдахгүй — энэ бол зөвхөн үйл явдал;
 *    `@arcgis/core`, `next`, `react-dom` `beforeunload` сонсдоггүй (2026-09-30-нд
 *    `node_modules`-оос шалгав).
 * ⚠️ `useDraftSync`-ийн сонсогч дараалалд буй ноорогоо ШУУД илгээдэг (`flush`) —
 *    remount-ийн ӨМНӨ ноорог хадгалагдах тул хор биш, харин ашигтай.
 */
export function hasUnsavedWork(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  } catch {
    return false;
  }
}

/**
 * Хэл солихыг зөвшөөрөх үү — хадгалаагүй ажил байвал хэрэглэгчээс асууна.
 * `true` = солиход аюулгүй (эсвэл хэрэглэгч алдахыг зөвшөөрөв).
 */
export function confirmLocaleSwitch(): boolean {
  if (!hasUnsavedWork()) return true;
  return window.confirm(tr('Хадгалаагүй өөрчлөлт байна — хэл солиход алдагдана. Солих уу?'));
}

/**
 * ХЭЛ СОЛИХ ТОВЧ — нүүр хуудас ба порталын толгой ХОЁУЛАНД нь.
 *
 * ⚠️ Товч дээр ОДООГИЙН биш, ШИЛЖИХ хэлийг бичнэ (монголоор үзэж байхад «EN»).
 * Дарвал юу болохыг харуулах нь хэрэглэгчид ойлгомжтой — «MN» гэж байвал
 * «монгол болгох уу, монгол дээр байна уу» гэдэг нь эргэлзээтэй.
 *
 * `className` өгвөл хостын товчны хэв маягт (жиш. порталын `.iconBtn`) уусна;
 * өгөхгүй бол өөрийн бие даасан хэлбэрээ хэрэглэнэ.
 *
 * ⚠️ 2026-09-30: `confirmLocaleSwitch` — хадгалаагүй ажлын хамгаалалт (дээрх ⚠️).
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const next = locale === 'mn' ? 'en' : 'mn';
  const label = locale === 'mn' ? 'Switch to English' : tr('Монгол хэл рүү шилжих');
  /* ⚠️ 2026-10-04: англи толь хойшлогдон ачаалагддаг (`i18nCore.loadLocaleDict`) — товч
     руу заахад/фокуслахад урьдчилан татна, дарахад солилт шууд болно. Алдааг залгина:
     дарахад `setLocale` өөрөө дахин оролдоно. */
  const warm = () => { loadLocaleDict(next).catch(() => { /* setLocale дахин оролдоно */ }); };

  return (
    <button
      type="button"
      className={className ?? s.btn}
      onClick={() => { if (confirmLocaleSwitch()) setLocale(next); }}
      onPointerEnter={warm}
      onFocus={warm}
      aria-label={label}
      title={label}
    >
      <span className={s.code} aria-hidden>
        {next.toUpperCase()}
      </span>
    </button>
  );
}

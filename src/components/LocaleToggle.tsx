'use client';

import { useSyncExternalStore } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import {
  t as tr, loadLocaleDict, subscribeDict, getLocaleSwitchState, getServerLocaleSwitchState, clearLocaleSwitchError,
} from '@/lib/i18nCore';
import { askConfirm } from '@/lib/confirm';
import s from './locale.module.css';

/**
 * ХАДГАЛААГҮЙ АЖИЛ БАЙГАА ЭСЭХ — хуудасны `beforeunload` хамгаалалтуудаас асууна.
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
export async function confirmLocaleSwitch(): Promise<boolean> {
  if (!hasUnsavedWork()) return true;
  return askConfirm(tr('Хадгалаагүй өөрчлөлт байна — хэл солиход алдагдана. Солих уу?'), {
    ok: tr('Хэл солих'),
    danger: true,
  });
}

/**
 * ХЭЛ СОЛИХ ТОВЧ — нүүр хуудас ба порталын толгой ХОЁУЛАНД нь.
 *
 * `className` өгвөл хостын товчны хэв маягт (жиш. порталын `.iconBtn`) уусна;
 * өгөхгүй бол өөрийн бие даасан хэлбэрээ хэрэглэнэ.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const next = locale === 'mn' ? 'en' : 'mn';
  const label = locale === 'mn' ? 'Switch to English' : tr('Монгол хэл рүү шилжих');
  const warm = () => { loadLocaleDict(next).catch(() => { /* setLocale дахин оролдоно */ }); };
  const sw = useSyncExternalStore(subscribeDict, getLocaleSwitchState, getServerLocaleSwitchState);
  const busy = sw === 'loading';

  return (
    <span className={s.wrap}>
      <button
        type="button"
        className={className ?? s.btn}
        onClick={async () => { if (await confirmLocaleSwitch()) setLocale(next); }}
        onPointerEnter={warm}
        onFocus={warm}
        disabled={busy}
        aria-busy={busy}
        aria-label={label}
        title={busy ? tr('Хэлний толь ачаалж байна…') : label}
      >
        {busy
          ? <LoaderCircle size={16} strokeWidth={1.6} className={s.spin} aria-hidden />
          : <span className={s.code} aria-hidden>{next.toUpperCase()}</span>}
      </button>
      {sw === 'error' && (
        <span className={s.err} role="status">
          {tr('Хэлний толь татагдсангүй — холболтоо шалгаад дахин дарна уу.')}
          <button type="button" className={s.errClose} onClick={clearLocaleSwitchError} aria-label={tr('Хаах')}>✕</button>
        </span>
      )}
    </span>
  );
}

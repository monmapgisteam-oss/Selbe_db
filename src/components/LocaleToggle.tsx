'use client';

import { useLocale } from '@/lib/i18n';
import { t as tr } from '@/lib/i18nCore';
import s from './locale.module.css';

/**
 * ХЭЛ СОЛИХ ТОВЧ — нүүр хуудас ба порталын толгой ХОЁУЛАНД нь.
 *
 * ⚠️ Товч дээр ОДООГИЙН биш, ШИЛЖИХ хэлийг бичнэ (монголоор үзэж байхад «EN»).
 * Дарвал юу болохыг харуулах нь хэрэглэгчид ойлгомжтой — «MN» гэж байвал
 * «монгол болгох уу, монгол дээр байна уу» гэдэг нь эргэлзээтэй.
 *
 * `className` өгвөл хостын товчны хэв маягт (жиш. порталын `.iconBtn`) уусна;
 * өгөхгүй бол өөрийн бие даасан хэлбэрээ хэрэглэнэ.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const next = locale === 'mn' ? 'en' : 'mn';
  const label = locale === 'mn' ? 'Switch to English' : tr('Монгол хэл рүү шилжих');

  return (
    <button
      type="button"
      className={className ?? s.btn}
      onClick={() => setLocale(next)}
      aria-label={label}
      title={label}
    >
      <span className={s.code} aria-hidden>
        {next.toUpperCase()}
      </span>
    </button>
  );
}

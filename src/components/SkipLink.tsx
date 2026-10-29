'use client';

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';

import { t as tr, getDictEpoch, getLocale, getServerLocale, subscribeDict, subscribeLocale } from '@/lib/i18nCore';

/**
 * ГАРААР УДИРДАХ АЛГАСАХ ХОЛБООС — Tab дархад хамгийн түрүүнд гарч, каталог,
 * цэсийг алгасаад шууд самбар руу үсэрнэ.
 */
export function SkipLink() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);
  useSyncExternalStore(subscribeDict, getDictEpoch, getDictEpoch);

  return (
    <a href="#main" className="skip" onClick={jump}>
      {mounted ? tr('Дашбоард руу үсрэх') : 'Дашбоард руу үсрэх'}
    </a>
  );
}

function jump(e: MouseEvent<HTMLAnchorElement>): void {
  const el = document.getElementById('main') ?? document.getElementById('panel') ?? document.querySelector('main');
  if (!(el instanceof HTMLElement)) return; // зорилтгүй — хөтчийн анхдагч (хор хөнөөлгүй)
  e.preventDefault();
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '-1');
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }
  el.focus();
  el.scrollIntoView({ block: 'start' });
}

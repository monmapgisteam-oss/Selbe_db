'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { t as tr, getDictEpoch, getLocale, getServerLocale, subscribeDict, subscribeLocale } from '@/lib/i18nCore';

/**
 * ХӨТЧИЙН ТАБЫН ГАРЧГИЙГ ХЭЛЭЭР НЬ СОЛИХ (2026-08 аудит, олдвор #37).
 */
export function DocumentTitle() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);
  const dictEpoch = useSyncExternalStore(subscribeDict, getDictEpoch, getDictEpoch);
  useEffect(() => {
    // mn хэлэнд tr() түлхүүрээ өөрийг нь буцаадаг тул нөхцөл шалгах шаардлагагүй
    const apply = () => {
      const t = tr('Сэлбэ — Орон зайн мэдээллийн портал');
      if (document.title !== t) document.title = t;
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [locale, dictEpoch]);
  return null;
}

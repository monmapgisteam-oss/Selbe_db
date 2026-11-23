'use client';

/**
 * «ХУВААРЬ · НЭМЭЛТ АЖИЛ БАТЛАХ» (2026-11-23, хэрэглэгч) — хоёр батлах хуудас нэг цэсэнд, таб болгон.
 * Харагдацын түлхүүр (`huvaariBatlah` · `ajilBatlah`) ба эрх хэвээр: таб дарахад тухайн харагдац руу шилжинэ,
 * зөвхөн нэгийг нь харах эрхтэйд таб гарахгүй. Цэсний нэгтгэл — `ViewRail`.
 */

import type { ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { ViewKey } from '@/lib/services';
import s from './batlahHub.module.css';

export type BatlahTab = 'huvaariBatlah' | 'ajilBatlah';

/** Хэрэглэгч хоёуланг нь харж болох уу — цэсэнд нэг мөр болох нөхцөл */
export const batlahMerged = (can: (k: ViewKey) => boolean): boolean => can('huvaariBatlah') && can('ajilBatlah');

export function BatlahHub({ tab, navScope, setView, children }: {
  tab: BatlahTab;
  navScope: 'all' | ViewKey[];
  setView: (v: ViewKey) => boolean;
  children: ReactNode;
}) {
  const can = (k: ViewKey) => navScope === 'all' || navScope.includes(k);
  if (!batlahMerged(can)) return <>{children}</>;
  const TABS: { key: BatlahTab; label: string }[] = [
    { key: 'huvaariBatlah', label: tr('Хуваарь') },
    { key: 'ajilBatlah', label: tr('Нэмэлт ажил') },
  ];
  return (
    <div className={s.hub}>
      <div className={s.tabs} role="tablist" aria-label={tr('Батлах')}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`}
            onClick={() => { if (tab !== t.key) setView(t.key); }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.body}>{children}</div>
    </div>
  );
}

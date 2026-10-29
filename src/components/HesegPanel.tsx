'use client';

import { t as tr } from '@/lib/i18nCore';
import type { ReactNode } from 'react';
import s from './heseg.module.css';

/**
 * «ХЭСЭГЧИЛСЭН ЕТ» — баруун самбарын ГУРВАН ХЭСЭГ (2026-10-13, хэрэглэгчийн заавар):
 *   01 Ерөнхий төлөвлөгөөний өөрчлөлт · 02 Одоо байгаа дэд бүтэцтэй давхцал · 03 Нэмэлт хэрэгцээ.
 */
export type HesegTab = 'change' | 'overlap' | 'need';

const TABS: { key: HesegTab; no: string; title: () => string }[] = [
  { key: 'change', no: '01', title: () => tr('Ерөнхий төлөвлөгөөний өөрчлөлт') },
  { key: 'overlap', no: '02', title: () => tr('Одоо байгаа дэд бүтэцтэй давхцаж буй хэсэг') },
  { key: 'need', no: '03', title: () => tr('Нэмэлт хэрэгцээ тооцоолох') },
];

export function HesegPanel({
  tab, setTab, change, overlap, need,
}: {
  tab: HesegTab; setTab: (t: HesegTab) => void;
  change: ReactNode; overlap: ReactNode; need: ReactNode;
}) {
  return (
    <div className={s.wrap}>
      <nav className={s.tabs} aria-label={tr('Хэсэгчилсэн ЕТ')}>
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`${s.tab} ${tab === x.key ? s.tabOn : ''}`}
            aria-pressed={tab === x.key}
            onClick={() => setTab(x.key)}
            title={x.title()}
          >
            <span className={s.tabNo}>{x.no}</span>
            <span className={s.tabTitle}>{x.title()}</span>
          </button>
        ))}
      </nav>
      <div className={s.body}>
        {tab === 'change' ? change : tab === 'overlap' ? overlap : need}
      </div>
    </div>
  );
}

'use client';

import { t as tr } from '@/lib/i18nCore';
import r from './report.module.css';

/** In-document navigation; every section remains visible and printable. */
export function ReportContents({ prefix, titles }: { prefix: string; titles: string[] }) {
  return (
    <nav className={r.contents} aria-label={tr('Тайлангийн агуулга')}>
      <p className={r.contentsTitle}>{tr('Агуулга')}</p>
      <ol>
        {titles.map((title, i) => (
          <li key={title}>
            <a href={`#${prefix}-${i + 1}`} onClick={(event) => {
              const section = document.getElementById(`${prefix}-${i + 1}`);
              if (!section) return;
              event.preventDefault();
              section.scrollIntoView({ block: 'start' });
              section.focus({ preventScroll: true });
            }}><span>{String(i + 1).padStart(2, '0')}</span>{title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

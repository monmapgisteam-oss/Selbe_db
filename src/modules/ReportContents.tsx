'use client';

import type { ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { pct } from '@/lib/format';
/* ⚠️ 2026-10-04: ТУХ-ын хэмжигч (дүүргэлт = бодит, зураас = төлөвлөгөө) — шинээр зурахгүй */
import { Meter as HeroMeter } from '@/modules/tuh/charts';
import r from './report.module.css';

/**
 * ТОЛГОЙ — ТУХ-ын hero (зүүн: огноо · гарчиг · дэд гарчиг; баруун: гол хувь + хэмжигч).
 * Хоёр горим (удирдлагын · дэлгэрэнгүй) хоёулаа үүнийг хэрэглэнэ.
 * ⚠️ `value` нь 0–100 (`pct()` 100-аар үржүүлдэггүй). `null` → «—», ачаалж буй бол «…».
 */
export function ReportHero({ meta, title, sub, figLabel, value, plan, loading, note }: {
  meta: ReactNode; title: string; sub: string; figLabel: string;
  value: number | null; plan?: number | null; loading?: boolean; note?: ReactNode;
}) {
  return (
    <header className={r.hero}>
      <div>
        <p className={r.eyebrow}>{meta}</p>
        <h1>{title}</h1>
        <p className={r.heroSub}>{sub}</p>
      </div>
      <div className={r.heroFig}>
        <span className={r.eyebrow}>{figLabel}</span>
        <span className={r.heroNum}>{loading ? '…' : pct(value, 1)}</span>
        <HeroMeter value={loading ? null : value} plan={loading ? null : plan} wide />
        {note && <span className={r.heroNote}>{note}</span>}
      </div>
    </header>
  );
}

/**
 * Баримт доторх навигаци — ТУХ-ын багцын дэлгэрэнгүйн `secNav` шиг наалддаг мөр
 * (2026-10-04). Бүх хэсэг харагдах, хэвлэгдэх хэвээр; хэвлэхэд энэ мөр нуугдана.
 */
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

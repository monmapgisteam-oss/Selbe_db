'use client';

import { useState } from 'react';
import { tr } from '@/lib/i18n';
import { askConfirm } from '@/lib/confirm';
import { userError } from '@/components/ui';
import s from '@/app/shell.module.css';

/**
 * Толгойн «Тайлан» товч — ИДЭВХТЭЙ харагдацын дэлгэц дээр харагдаж буй бүх
 * үзүүлэлтийг (KPI, хүснэгт, график, газрын зураг) идэвхтэй шүүлтийн хамт Word
 * (.docx) болгон татна. Khorshoo_loan-ийн `ReportButton`-тэй ижил зарчим.
 *
 * ⚠️ Толгойд байрласан тул зүүн цэсний 1–26 харагдац БҮРД ижил ажиллана — модуль
 *    бүрд тусдаа товч нэмэхгүй (`lib/viewReport.ts`-ийн ⚠️ ЯАГААД DOM-ООС).
 * ⚠️ Хүнд код (`viewReport` · `docx`) зөвхөн дарах үед dynamic import-оор ачаална.
 * ⚠️ 2026-10-23 (UX аудит E1/E10/X3):
 *    - дэлгэц АЧААЛЖ байхад (`pendingCount`) татахаас өмнө асууна — урьд нь ачаалагдаагүй хэсэг тайланд
 *      чимээгүй дутуу ордог байв;
 *    - алдааг `window.alert(err.message)` (түүхий англи мөр) биш — `userError` + «Дахин оролдох» цонх;
 *    - бичиг «Word тайлан» — татах (⬇) дүрстэй товч нь «Тайлан» харагдац руу шилжих мэт уншигддаг байв;
 *      нэр нь ТАТАХ үйлдэл ба файлын төрлийг хэлнэ.
 */
export function ReportButton({ viewKey, title, desc, filters }: {
  viewKey: string;
  title: string;
  desc?: string;
  filters: string[];
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      /* «Дахин оролдох» — давталт (busy хэвээр; рекурс дуудвал `finally` нь шинэ оролдлогын дундуур busy-г унтраана) */
      for (;;) {
        try {
          const { downloadViewReport, pendingCount } = await import('@/lib/viewReport');
          const n = pendingCount();
          if (n > 0 && !(await askConfirm(
            tr('Дэлгэцийн {0} хэсэг ачаалж байна — одоо татвал тэдгээр нь тайланд дутуу орно.', n),
            { ok: tr('Одоо татах'), cancel: tr('Хүлээх') },
          ))) return;
          await downloadViewReport({ key: viewKey, title, desc, filters });
          return;
        } catch (err) {
          console.error(err);
          if (!(await askConfirm(
            tr('Тайлан үүсгэхэд алдаа гарлаа: {0}', userError(err)),
            { ok: tr('Дахин оролдох'), cancel: tr('Хаах') },
          ))) return;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`${s.iconBtn} ${s.reportBtn}`}
      onClick={() => void onClick()}
      disabled={busy}
      aria-busy={busy}
      aria-label={tr('«{0}» хэсгийн тайлан татах (Word)', title)}
      title={tr('«{0}» хэсгийн тайлан татах (Word)', title)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <span>{busy ? tr('Бэлтгэж байна…') : tr('Word тайлан')}</span>
    </button>
  );
}

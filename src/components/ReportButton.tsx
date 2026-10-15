'use client';

import { useState } from 'react';
import { tr } from '@/lib/i18n';
import s from '@/app/shell.module.css';

/**
 * Толгойн «Тайлан» товч — ИДЭВХТЭЙ харагдацын дэлгэц дээр харагдаж буй бүх
 * үзүүлэлтийг (KPI, хүснэгт, график, газрын зураг) идэвхтэй шүүлтийн хамт Word
 * (.docx) болгон татна. Khorshoo_loan-ийн `ReportButton`-тэй ижил зарчим.
 *
 * ⚠️ Толгойд байрласан тул зүүн цэсний 1–26 харагдац БҮРД ижил ажиллана — модуль
 *    бүрд тусдаа товч нэмэхгүй (`lib/viewReport.ts`-ийн ⚠️ ЯАГААД DOM-ООС).
 * ⚠️ Хүнд код (`viewReport` · `docx`) зөвхөн дарах үед dynamic import-оор ачаална.
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
      const { downloadViewReport } = await import('@/lib/viewReport');
      await downloadViewReport({ key: viewKey, title, desc, filters });
    } catch (err) {
      console.error(err);
      window.alert(tr('Тайлан үүсгэхэд алдаа гарлаа: {0}', err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`${s.iconBtn} ${s.reportBtn}`}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      title={tr('«{0}» хэсгийн тайлан татах (Word)', title)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <span>{busy ? tr('Бэлтгэж байна…') : tr('Тайлан')}</span>
    </button>
  );
}

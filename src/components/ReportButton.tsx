'use client';

import { useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
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

  /* ⚠️ 2026-10-23: Environment — толгойн 40px ДУГУЙ дүрсэн товч (lucide FileText; бэлтгэж байхад Loader2 эргэнэ).
     Урьдын «⤓ Тайлан» бичиг нь `aria-label`-д («Тайлан — …» / «Бэлтгэж байна…») шилжив. */
  const label = busy ? tr('Бэлтгэж байна…') : `${tr('Тайлан')} — ${tr('«{0}» хэсгийн тайлан татах (Word)', title)}`;
  return (
    <button
      type="button"
      className={`${s.iconBtn} ${s.reportBtn}`}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      aria-label={label}
      title={tr('«{0}» хэсгийн тайлан татах (Word)', title)}
    >
      {busy
        ? <LoaderCircle size={18} strokeWidth={1.6} className={s.spin} aria-hidden />
        : <FileText size={18} strokeWidth={1.6} aria-hidden />}
    </button>
  );
}

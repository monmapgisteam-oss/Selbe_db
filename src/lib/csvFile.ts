/**
 * CSV ба ТЕКСТ ФАЙЛ ТАТАХ — жижиг, хамааралгүй туслах (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 * ⚠️ `emailReport.download`-ыг импортлохгүй: тэр модуль pdfmake-ийг чирдэг тул
 *    эрсдэл/анализын багцад хэдэн зуун КБ дэмий орно.
 * ⚠️ CSV нь UTF-8 + BOM (`﻿`) — BOM-гүй бол Excel кирилл бичвэрийг
 *    «ÐÐ°…» болгож нээдэг. Тусгаарлагч нь таслал, аравтын цэг нь «.» (машинд
 *    уншигдах; мянгатын бүлэглэлгүй).
 */

/** Нэг нүд — `null`/`undefined` → ХООСОН (0 БИШ — null ≠ 0) */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Толгой + мөрүүд → CSV бичвэр (CRLF — Excel-ийн хүлээдэг мөрийн төгсгөл) */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * Бичвэрийг файл болгон татна (хөтөчид л ажиллана).
 * ⚠️ `text/csv` бол BOM-ыг ӨӨРӨӨ нэмнэ — дуудагч нэмэх шаардлагагүй.
 */
export function downloadText(filename: string, text: string, mime: string): void {
  const body = mime.startsWith('text/csv') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Файлын нэрийн огноо — `2026-10-01` (орон нутгийн цагаар) */
export function fileDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

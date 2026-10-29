'use client';

/**
 * ТАЙЛАНГ OUTLOOK-ООР ИЛГЭЭХ.
 *
 * pdfmake нь ХҮНД сан тул зөвхөн товч дарахад динамикаар ачаална (`import`).
 */
import type { BagtsRow } from '@/modules/Dashboard';
import { t as tr } from '@/lib/i18nCore';
import { buildReportDoc } from './reportPdf';
import type { ReportExtra } from './reportData';

/**
 * Тайлан хүлээн авагчид — `NEXT_PUBLIC_REPORT_RECIPIENTS`-аар тохируулна.
 *
 * Хаяг нэмэхэд `emailViaEml` (To: толгой) ба `emailViaMailto` (mailto: хаяг)
 * ХОЁУЛАА автоматаар дагана.
 */
export const REPORT_RECIPIENTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_REPORT_RECIPIENTS ?? '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list;
})();
const PDF_NAME = 'Selbe_tailan.pdf';

/** UTF-8 текстийг base64 болгоно (кирилл найдвартай) */
function b64utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
/** MIME мөр — 76 тэмдэгтээр таслана */
const wrap76 = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n');
/**
 * Гарчиг дахь кириллийг MIME-encoded-word болгоно.
 */
const ENC_WORD_BYTES = 45;
const encHeader = (str: string): string => {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of str) {
    const n = enc.encode(ch).length;
    if (cur && curBytes + n > ENC_WORD_BYTES) { parts.push(cur); cur = ''; curBytes = 0; }
    cur += ch;
    curBytes += n;
  }
  if (cur || !parts.length) parts.push(cur);
  return parts.map((p) => `=?UTF-8?B?${b64utf8(p)}?=`).join('\r\n ');
};

/**
 * pdfmake баримтыг base64 PDF болгоно (динамик ачаалалт).
 */
export async function renderPdfBase64(doc: unknown): Promise<string> {
  const mod = await import('pdfmake/build/pdfmake');
  const vfsMod = await import('pdfmake/build/vfs_fonts');
  const pdfMake = ((mod as unknown as { default?: unknown }).default ?? mod) as {
    addVirtualFileSystem?: (v: unknown) => void;
    vfs?: unknown;
    createPdf: (d: unknown) => { getBase64: () => Promise<string> };
  };
  const vfs = (vfsMod as unknown as { default?: unknown }).default ?? vfsMod;
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;
  return pdfMake.createPdf(doc).getBase64();
}

/** pdfmake-ээр PDF үүсгэж base64 буцаана (динамик ачаалалт) */
async function makePdfBase64(rows: BagtsRow[], dateStr: string, extra: ReportExtra): Promise<string> {
  return renderPdfBase64(buildReportDoc(rows, dateStr, extra));
}

/** Blob-ыг файл болгож татна */
export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Мэйлийн богино гарчиг ба их бие */
const subjectOf = (dateStr: string) => tr('Сэлбэ 20 минутын хотын ерөнхий тайлан ({0})', dateStr);
const bodyText = () => tr('Сайн байна уу,\n\nСэлбэ 20 минутын хотын ерөнхий тайланг (PDF) хавсаргав.\n\nХүндэтгэсэн,');
const bodyHtml = () => tr('<p>Сайн байна уу,</p><p>Сэлбэ 20 минутын хотын ерөнхий тайланг (PDF) хавсаргав.</p><p>Хүндэтгэсэн,</p>');

/**
 * CLASSIC OUTLOOK — `.eml` (X-Unsent) татна. Нээхэд Outlook мэйл бичих цонх,
 * PDF хавсаргагдсан, Send дарахад бэлэн.
 */
export async function emailViaEml(rows: BagtsRow[], dateStr: string, extra: ReportExtra): Promise<void> {
  const pdfB64 = await makePdfBase64(rows, dateStr, extra);
  const bd = 'SELBE-TAILAN-BOUNDARY-8f2c1a';
  const eml = [
    'X-Unsent: 1',
    `To: ${REPORT_RECIPIENTS.join(', ')}`,
    `Subject: ${encHeader(subjectOf(dateStr))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${bd}"`,
    '',
    `--${bd}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64utf8(bodyHtml())),
    '',
    `--${bd}`,
    `Content-Type: application/pdf; name="${PDF_NAME}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${PDF_NAME}"`,
    '',
    wrap76(pdfB64),
    `--${bd}--`,
    '',
  ].join('\r\n');
  download('Selbe_tailan.eml', new Blob([eml], { type: 'message/rfc822' }));
}

/**
 * NEW OUTLOOK / ВЭБ — PDF-ийг ТАТААД `mailto` нээнэ (хэрэглэгч гараар хавсаргана).
 */
export async function emailViaMailto(rows: BagtsRow[], dateStr: string, extra: ReportExtra): Promise<void> {
  const pdfB64 = await makePdfBase64(rows, dateStr, extra);
  const bytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
  download(PDF_NAME, new Blob([bytes], { type: 'application/pdf' }));
  const url = `mailto:${REPORT_RECIPIENTS.join(',')}`
    + `?subject=${encodeURIComponent(subjectOf(dateStr))}`
    + '&body=' + (encodeURIComponent(tr('{0}\n\n(Татсан {1}-ийг энэ мэйлд чирж хавсаргана уу.)', bodyText(), PDF_NAME)));
  window.location.href = url;
}

/** Зөвхөн PDF татах (мэйлгүй) */
export async function downloadReportPdf(rows: BagtsRow[], dateStr: string, extra: ReportExtra): Promise<void> {
  const pdfB64 = await makePdfBase64(rows, dateStr, extra);
  const bytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
  download(PDF_NAME, new Blob([bytes], { type: 'application/pdf' }));
}

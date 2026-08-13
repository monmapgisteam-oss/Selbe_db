'use client';

/**
 * ТАЙЛАНГ OUTLOOK-ООР ИЛГЭЭХ.
 *
 * ⚠️ Вэбээс `mailto:` нь файл ХАВСАРГАЖ ЧАДДАГГҮЙ (хөтчийн хориг). PDF-ийг
 * автоматаар хавсаргаж, «Send дарахад бэлэн» болгох цорын ганц арга бол
 * `X-Unsent: 1` толгойтой `.eml` файл үүсгэх — Classic Outlook (desktop) үүнийг
 * нээхэд ШИНЭ мэйл бичих цонх (хавсралттай, Send товчтой) гарна.
 *
 * ⚠️ New Outlook / вэб (OWA) нь `.eml`-ийг ингэж нээхгүй тул тэдэнд PDF-ийг
 * ТАТААД `mailto` нээх нөөц арга (`emailViaMailto`) — хэрэглэгч татсан PDF-ээ
 * гараар чирж хавсаргана.
 *
 * pdfmake нь ХҮНД сан тул зөвхөн товч дарахад динамикаар ачаална (`import()`).
 */
import type { BagtsRow } from '@/modules/Dashboard';
import { buildReportDoc, type ReportLive } from './reportPdf';

export type { ReportLive } from './reportPdf';

/** Тест хугацааны хүлээн авагчид (нарийн тохиргоо дараа) */
export const REPORT_RECIPIENTS = ['bilguuntugs@monmap.mn'];
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
/** Гарчиг дахь кириллийг MIME-encoded-word болгоно */
const encHeader = (str: string) => `=?UTF-8?B?${b64utf8(str)}?=`;

/** pdfmake-ээр PDF үүсгэж base64 буцаана (динамик ачаалалт) */
async function makePdfBase64(rows: BagtsRow[], dateStr: string, live: ReportLive): Promise<string> {
  const mod = await import('pdfmake/build/pdfmake');
  const vfsMod = await import('pdfmake/build/vfs_fonts');
  // ⚠️ UMD/CJS interop — build нь `module.exports`-оор гардаг тул `.default`.
  const pdfMake = ((mod as unknown as { default?: unknown }).default ?? mod) as {
    addVirtualFileSystem?: (v: unknown) => void;
    vfs?: unknown;
    createPdf: (d: unknown) => { getBase64: () => Promise<string> };
  };
  const vfs = (vfsMod as unknown as { default?: unknown }).default ?? vfsMod;
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;

  const doc = buildReportDoc(rows, dateStr, live);
  // ⚠️ pdfmake 0.3.x — `getBase64()` нь PROMISE (callback БИШ). Callback дамжуулбал
  //    Promise шийдэгдэхгүй, товч мөнхөд «Бэлтгэж байна…» дээр гацна.
  return pdfMake.createPdf(doc).getBase64();
}

/** Blob-ыг файл болгож татна */
function download(filename: string, blob: Blob): void {
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
const subjectOf = (dateStr: string) => `Сэлбэ 20 минутын хот — Ерөнхий тайлан (${dateStr})`;
const bodyText = 'Сайн байна уу,\n\nСэлбэ 20 минутын хотын ерөнхий тайланг (PDF) хавсаргав.\n\nХүндэтгэсэн,';
const bodyHtml = '<p>Сайн байна уу,</p><p>Сэлбэ 20 минутын хотын ерөнхий тайланг (PDF) хавсаргав.</p><p>Хүндэтгэсэн,</p>';

/**
 * CLASSIC OUTLOOK — `.eml` (X-Unsent) татна. Нээхэд Outlook мэйл бичих цонх,
 * PDF хавсаргагдсан, Send дарахад бэлэн.
 */
export async function emailViaEml(rows: BagtsRow[], dateStr: string, live: ReportLive): Promise<void> {
  const pdfB64 = await makePdfBase64(rows, dateStr, live);
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
    wrap76(b64utf8(bodyHtml)),
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
export async function emailViaMailto(rows: BagtsRow[], dateStr: string, live: ReportLive): Promise<void> {
  const pdfB64 = await makePdfBase64(rows, dateStr, live);
  const bytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
  download(PDF_NAME, new Blob([bytes], { type: 'application/pdf' }));
  const url = `mailto:${REPORT_RECIPIENTS.join(',')}`
    + `?subject=${encodeURIComponent(subjectOf(dateStr))}`
    + `&body=${encodeURIComponent(`${bodyText}\n\n(Татсан ${PDF_NAME}-ийг энэ мэйлд чирж хавсаргана уу.)`)}`;
  window.location.href = url;
}

/** Зөвхөн PDF татах (мэйлгүй) */
export async function downloadReportPdf(rows: BagtsRow[], dateStr: string, live: ReportLive): Promise<void> {
  const pdfB64 = await makePdfBase64(rows, dateStr, live);
  const bytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
  download(PDF_NAME, new Blob([bytes], { type: 'application/pdf' }));
}

'use client';

/**
 * ТАЙЛАН ТАТАХ КАРТ — агентын хариулт доторх ```report блок.
 *
 * ⚠️ ФАЙЛЫН АГУУЛГА нь ЭНЭ ХАРИУЛТ ӨӨРӨӨ (`source`) — блок дотор өгөгдөл
 * байхгүй. Ингэснээр файл ба дэлгэц хэзээ ч зөрөхгүй, токен ч нэмэгдэхгүй.
 *
 * ⚠️ БҮТЭЭГЧИД ДИНАМИК ИМПОРТТОЙ (`AgentChart`-аас ялгаатай): pdfmake нь ~835 КБ
 * фонттой ирдэг, OOXML бичигч ч жижиг биш. Товч ДАРАГДАХ хүртэл татагдахгүй.
 *
 * ⚠️ Хэрэв блок задлагдахгүй бол ЮУ Ч ЗУРАХГҮЙ (`AgentChart`-ийн дүрэм) —
 * хэрэглэгчид түүхий JSON хэзээ ч харагдахгүй.
 */

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { parseBlocks } from '@/lib/agent/blocks';
import { parseReport, reportTables, slug, type ReportDoc, type ReportFormat } from '@/lib/agent/report';
import { csvTable, typeTable } from '@/lib/agent/reportCells';
import { csvCell, downloadText, fileDate, toCsv } from '@/lib/csvFile';
import s from '@/components/agent.module.css';

/** Товчин дээрх нэр — `tr()` нь модулийн хамрах хүрээнд дуудагдаж БОЛОХГҮЙ */
function label(f: ReportFormat): string {
  if (f === 'pdf') return tr('PDF');
  if (f === 'docx') return tr('Word');
  if (f === 'xlsx') return tr('Excel');
  return tr('CSV');
}

export function AgentReport({ raw, source }: { raw: string; source: string }) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [err, setErr] = useState('');

  const spec = parseReport(raw);
  if (!spec) return null;

  const doc: ReportDoc = {
    title: spec.title || tr('Тайлан'),
    date: fileDate(),
    /* ⚠️ Тайлангийн блок өөрөө файлд ОРОХГҮЙ */
    blocks: parseBlocks(source).filter((b) => b.kind !== 'report'),
  };
  const tables = reportTables(doc);

  /* ⚠️ Хүснэгт/графикгүй хариултад Excel · CSV утгагүй — товчийг огт гаргахгүй.
     Бүгд шүүгдвэл ядаж PDF үлдэнэ (хэрэглэгч файл хүссэн). */
  const picked = spec.formats.filter((f) => (f === 'xlsx' || f === 'csv' ? tables.length > 0 : true));
  const formats: ReportFormat[] = picked.length ? picked : ['pdf'];

  async function make(f: ReportFormat) {
    setBusy(f);
    setErr('');
    try {
      const name = `Selbe_${slug(doc.title)}_${doc.date}`;
      if (f === 'csv') {
        /* ⚠️ CSV-д хуудас байхгүй тул хүснэгтүүдийг нэрээр нь зааглаж дараалуулна.
           ⚠️ Утгууд нь ТОО (`typeTable`) — нэгж толгойд, хувь 0–100 (`csvTable`). */
        const text = tables
          .map((t) => {
            const c = csvTable(typeTable(t));
            /* ⚠️ 2026-10-21: хүснэгтийн НЭР ч `csvCell`-ээр — түүхий бичвэл `=…` томьёо/таслал
               Excel-д томьёо болж эсвэл баганыг задалдаг байв (утгууд аль хэдийн `toCsv`-ээр). */
            return [csvCell(t.name), toCsv(c.head, c.rows)].join('\r\n');
          })
          .join('\r\n\r\n');
        downloadText(`${name}.csv`, text, 'text/csv');
      } else if (f === 'xlsx') {
        const [{ buildChatXlsx }, { downloadXlsx }] = await Promise.all([
          import('@/lib/agent/reportXlsx'),
          import('@/lib/xlsx'),
        ]);
        downloadXlsx(`${name}.xlsx`, buildChatXlsx(doc));
      } else if (f === 'docx') {
        const [{ buildChatDocx, DOCX_MIME }, { downloadXlsx }] = await Promise.all([
          import('@/lib/agent/reportDocx'),
          import('@/lib/xlsx'),
        ]);
        downloadXlsx(`${name}.docx`, buildChatDocx(doc), DOCX_MIME);
      } else {
        const [{ buildChatPdf }, { renderPdfBase64, download }] = await Promise.all([
          import('@/lib/agent/reportPdf'),
          import('@/lib/emailReport'),
        ]);
        const b64 = await renderPdfBase64(buildChatPdf(doc));
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        download(`${name}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
      }
    } catch (e) {
      /* ⚠️ Алдааг ЧИМЭЭГҮЙ залгихгүй — хэрэглэгч татагдсан гэж бодож хүлээнэ */
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={s.report}>
      <p className={s.reportTitle}>{doc.title}</p>
      <div className={s.reportBtns}>
        {formats.map((f) => (
          <button
            key={f}
            type="button"
            className={s.chip}
            disabled={busy != null}
            aria-busy={busy === f || undefined}
            title={tr('{0} файлаар татах', label(f))}
            aria-label={tr('{0} файлаар татах', label(f))}
            onClick={() => void make(f)}
          >
            {busy === f ? tr('{0} — бэлдэж байна…', label(f)) : label(f)}
          </button>
        ))}
      </div>
      {err ? <p className={s.reportErr} role="alert">{tr('Файл үүсгэж чадсангүй.')} <span>{err}</span></p> : null}
    </div>
  );
}

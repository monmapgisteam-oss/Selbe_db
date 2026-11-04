/**
 * IPC БАРИМТ (2026-11-04) — чеклэсэн гүйцэтгэл бүр тусдаа мөр, хамгийн доор нийлбэр, гарын үсгийн хэсэг.
 * Цэвэр `ipcFlowPdfDoc` + татах.
 */
import { docTitle, type IpcDocRow, type PerfRow } from '@/lib/ipcFlow';

const n0 = (v: number | null | undefined): string =>
  (v == null ? '—' : Math.round(v).toLocaleString('en-US'));

const line = (label: string) => ({
  columns: [
    { text: label, width: 150 },
    { text: '______________________ / ______________ /', width: '*' },
  ],
  margin: [0, 10, 0, 0],
});

export function ipcFlowPdfDoc(o: {
  code: string;
  contractNo: string;
  contractor: string;
  doc: IpcDocRow;
  rows: readonly PerfRow[];
}): Record<string, unknown> {
  const { code, contractNo, contractor, doc, rows } = o;
  const title = doc.isCancel ? 'IPC ЦУЦЛАЛТЫН БАРИМТ' : doc.advance ? 'УРЬДЧИЛГАА ТӨЛБӨРИЙН БАРИМТ' : 'IPC БАРИМТ';
  const hdr = ['№', 'Огноо', 'Гүйцэтгэлийн бүртгэл', 'Дүн, ₮'].map((text, i) => ({
    text, bold: true, alignment: i > 2 ? 'right' : 'left', fillColor: '#eeeeee',
  }));
  const body = rows.map((r, i) => [
    String(i + 1), r.day, r.id,
    { text: n0(r.une), alignment: 'right' },
  ]);
  const content: unknown[] = [
    { text: title, bold: true, fontSize: 14, alignment: 'center', margin: [0, 0, 0, 12] },
    { text: `Баримтын дугаар: IPC-${String(doc.no).padStart(2, '0')}` },
    { text: `Огноо: ${doc.day}` },
    { text: `Гэрээ: ${code}${contractNo ? ` (${contractNo})` : ''}` },
    { text: `Багц: ${doc.pkg}` },
    { text: `Гүйцэтгэгч: ${contractor || '—'}`, margin: [0, 0, 0, 12] },
  ];
  if (rows.length) {
    content.push({
      table: {
        headerRows: 1,
        widths: [20, 60, '*', 110],
        body: [
          hdr,
          ...body,
          [{ text: 'НИЙТ', colSpan: 3, bold: true }, {}, {}, { text: n0(doc.total), bold: true, alignment: 'right' }],
        ],
      },
    });
  } else {
    content.push({ text: `Дүн: ${n0(doc.total)} ₮`, bold: true, fontSize: 12 });
  }
  content.push(
    { text: 'Гарын үсэг', bold: true, margin: [0, 24, 0, 0] },
    line('Захиалагч:'),
    line('Хяналтын зөвлөх:'),
    line('Гүйцэтгэгч:'),
  );
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 36],
    defaultStyle: { fontSize: 10 },
    info: { title: docTitle(code, doc) },
    content,
  };
}

export async function downloadIpcFlowPdf(o: Parameters<typeof ipcFlowPdfDoc>[0]): Promise<void> {
  const { renderPdfBase64, download } = await import('@/lib/emailReport');
  const b64 = await renderPdfBase64(ipcFlowPdfDoc(o));
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  download(`${docTitle(o.code, o.doc)}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
}

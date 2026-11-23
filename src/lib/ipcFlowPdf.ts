/**
 * IPC БАРИМТ (2026-11-04) — чеклэсэн гүйцэтгэл бүр тусдаа мөр, хамгийн доор нийлбэр, гарын үсгийн хэсэг.
 * Цэвэр `ipcFlowPdfDoc` + татах.
 */
import { docTitle, type IpcDocRow, type PerfRow } from '@/lib/ipcFlow';
import { IPC_DOC } from '@/lib/services';
import { t7Of, type IpcRec } from '@/lib/ipcDocTable';
import { t7Page, type IpcSigners } from '@/lib/ipcPdf';

/** Мөнгө — 2026-11-23-аас ҮРГЭЛЖ 2 аравтын оронтой (бүхэлдэхгүй) */
const n0 = (v: number | null | undefined): string =>
  (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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
  const title = doc.advance ? 'УРЬДЧИЛГАА ТӨЛБӨРИЙН БАРИМТ' : 'IPC БАРИМТ';
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

/* ─────────────── IPC БАРИМТЫН ХҮСНЭГТИЙН МӨР (2026-11-23, `Guitsetgel_talbe/238`) ─────────────── */

const SG = IPC_DOC.signers;
const nameOf = (r: Record<string, unknown>, f: string): string => String(r[f] ?? '').trim();
/** 238-ийн гарын үсэг зурагчид → «Хүснэгт 7»-гийн загвар */
export const signersOf = (r: Record<string, unknown>): IpcSigners => ({
  approve: nameOf(r, SG.approve), ceo: nameOf(r, SG.ceo), chiefAcc: nameOf(r, SG.chiefAcc), hoSpec: nameOf(r, SG.hoSpec),
  pmoHead: nameOf(r, SG.pmoHead), pmoDept: nameOf(r, SG.pm1), pm: nameOf(r, SG.pm2),
  cDir: nameOf(r, SG.cDir), cAcc: nameOf(r, SG.cAcc), cEng: nameOf(r, SG.cEng),
});

const sigLine = (role: string, name: string) => ({
  columns: [
    { text: role, width: 190 },
    { text: `______________________ /${name || '______________'}/`, width: '*' },
  ],
  margin: [0, 6, 0, 0],
});

/** Баримтын файлын нэр — «IPC_<код>_IPC-03_<үеийн төгсгөл>» */
export const ipcDocTitle = (code: string, rec: IpcRec): string => docTitle(code, { no: rec.no ?? 0, day: rec.to || rec.day });

/**
 * IPC БАРИМТ — 1-р хуудас «Хүснэгт 7» (238-ийн мөр + өмнөх IPC-үүдээс хуримтлал), 2-р хуудас орсон бөглөлтүүд, суутгалын
 * тайлбар, гарын үсэг. `recs` — гэрээний бүх IPC (`recordsOf`), `i` — энэ баримт.
 */
export function ipcDocPdfDoc(o: {
  code: string;
  contractNo: string;
  contractor: string;
  project: string;
  contract: number | null;
  recs: readonly IpcRec[];
  i: number;
  fills: readonly PerfRow[];
}): Record<string, unknown> {
  const rec = o.recs[o.i];
  const r = rec.row;
  const s = signersOf(r);
  const atDay = rec.to || rec.day;
  const at = atDay ? Date.parse(`${atDay}T00:00:00Z`) : null;
  const page1 = t7Page({
    t7: t7Of(o.recs, o.i, o.contract),
    annual: typeof r[IPC_DOC.fields.annual] === 'number' ? (r[IPC_DOC.fields.annual] as number) : null,
    project: o.project || rec.pkg,
    contractNo: o.contractNo,
    contractor: o.contractor,
    at: Number.isFinite(at) ? at : null,
    signers: s,
  });
  const hdr = ['№', 'Огноо', 'Гүйцэтгэлийн бүртгэл', 'Дүн, ₮'].map((text, k) => ({
    text, bold: true, alignment: k > 2 ? 'right' : 'left', fillColor: '#eeeeee',
  }));
  const fillsTotal = o.fills.reduce((a, x) => a + (x.une ?? 0), 0);
  const page2: unknown[] = [
    { text: rec.advance ? 'УРЬДЧИЛГАА ТӨЛБӨРИЙН БАРИМТ' : 'IPC БАРИМТ — ГҮЙЦЭТГЭЛИЙН ЗАДАРГАА', bold: true, fontSize: 12, alignment: 'center', margin: [0, 0, 0, 10] },
    { text: `Баримтын код: ${rec.kod || `IPC-${String(rec.no ?? 0).padStart(2, '0')}`}` },
    { text: `Ажлын үе: ${rec.from || '—'} — ${rec.to || '—'}` },
    { text: `Гэрээ: ${o.code}${o.contractNo ? ` (${o.contractNo})` : ''}` },
    { text: `Багц: ${rec.pkg || '—'}` },
    { text: `Гүйцэтгэгч: ${o.contractor || '—'}${nameOf(r, IPC_DOC.fields.contractorRd) ? ` · РД ${nameOf(r, IPC_DOC.fields.contractorRd)}` : ''}`, margin: [0, 0, 0, 10] },
  ];
  if (o.fills.length) {
    page2.push({
      table: {
        headerRows: 1,
        widths: [20, 70, '*', 120],
        body: [
          hdr,
          ...o.fills.map((x, k) => [String(k + 1), x.day, x.id, { text: n0(x.une), alignment: 'right' }]),
          [{ text: 'БӨГЛӨЛТИЙН НИЙТ', colSpan: 3, bold: true }, {}, {}, { text: n0(fillsTotal), bold: true, alignment: 'right' }],
        ],
      },
    });
  }
  const note = String(r[IPC_DOC.fields.note] ?? '').trim();
  if (note) page2.push({ text: `Суутгалын тайлбар: ${note}`, margin: [0, 10, 0, 0] });
  page2.push(
    { text: 'Гарын үсэг', bold: true, margin: [0, 18, 0, 0] },
    sigLine('Санхүүгийн хэлтсийн дарга:', nameOf(r, SG.finHead)),
    sigLine('Хяналтын зөвлөхийн дарга:', s.pmoHead),
    sigLine('Хяналтын менежер:', s.pmoDept),
    sigLine('Хяналтын менежер:', s.pm),
    sigLine('Гүйцэтгэгчийн захирал:', s.cDir),
    sigLine('Гүйцэтгэгчийн нягтлан бодогч:', s.cAcc),
    sigLine('Гүйцэтгэгчийн төслийн удирдагч:', nameOf(r, SG.cPm)),
    sigLine('Гүйцэтгэгчийн инженер:', s.cEng),
  );
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 22, 24, 22],
    defaultStyle: { fontSize: 9 },
    info: { title: ipcDocTitle(o.code, rec) },
    content: [...page1, { text: '', pageBreak: 'after' }, ...page2],
  };
}

export async function downloadIpcDocPdf(o: Parameters<typeof ipcDocPdfDoc>[0]): Promise<void> {
  const { renderPdfBase64, download } = await import('@/lib/emailReport');
  const b64 = await renderPdfBase64(ipcDocPdfDoc(o));
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  download(`${ipcDocTitle(o.code, o.recs[o.i])}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
}

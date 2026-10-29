/**
 * AI ТУСЛАХЫН ТАЙЛАН — Excel (.xlsx).
 */

import { t as tr } from '@/lib/i18nCore';
import { buildXlsx, type XlsxCell, type XlsxSheet, type XlsxStyle } from '@/lib/xlsx';
import { headingOf } from './blocks';
import { reportTables, type ReportDoc } from './report';
import { colHeader, plain, typeTable, type TypedTable } from './reportCells';

/* ── Загварууд — `modules/sheet/fill/sheetXlsx.ts`-ийн хэв маягаар ── */
const C_HEAD = 'E7ECF2';

const S_TITLE: XlsxStyle = { bold: true };
const S_HEAD: XlsxStyle = { bold: true, fill: C_HEAD, border: true, align: 'center', valign: 'center', wrap: true };
const S_TEXT: XlsxStyle = { border: true };
const S_WRAP: XlsxStyle = { wrap: true, valign: 'top' };

/**
 * Загварын кэш — `numFmt` бүрд НЭГ объект (`cellXfs` томрохгүй;
 * `sheetXlsx.sty()`-ийн зарчим).
 */
function styler() {
  const cache = new Map<string, XlsxStyle>();
  return (numFmt?: string): XlsxStyle => {
    const k = numFmt ?? '';
    let s = cache.get(k);
    if (!s) {
      s = numFmt ? { border: true, numFmt } : S_TEXT;
      cache.set(k, s);
    }
    return s;
  };
}

/**
 * Баганын өргөн — ХАРАГДАХ бичвэрийн уртаар (кирилл арай өргөн тул ×1.1).
 */
function widthOf(texts: string[]): number {
  const len = Math.max(0, ...texts.map((t) => t.length));
  return Math.min(52, Math.max(10, Math.round(len * 1.1) + 2));
}

/** Нэг хүснэгт → нэг хуудас */
function tableSheet(t: TypedTable, sty: ReturnType<typeof styler>): XlsxSheet {
  const head = t.cols.map((c) => colHeader(c, true));
  const rows: XlsxCell[][] = [
    [{ v: t.name, s: S_TITLE }],
    head.map((h): XlsxCell => ({ v: h, s: S_HEAD })),
    ...t.rows.map((r) => r.map((v, i): XlsxCell => ({ v, s: sty(t.cols[i].numFmt) }))),
  ];
  return {
    name: t.name,
    rows,
    cols: t.cols.map((c, i) => widthOf([
      head[i],
      ...t.rows.map((r) => (r[i] == null ? '' : String(r[i]))),
      /* Тоон баганад формат нь орон зай нэмдэг (мянгатын таслал, нэгж) */
      ...(c.kind === 'text' ? [] : ['          ']),
    ])),
    /* Гарчиг + толгой хөлдүү — урт жагсаалт гүйлгэхэд баганын нэр харагдана */
    frozen: { rows: 2, cols: 0 },
  };
}

/** Агентын бичвэр — ХАМГИЙН СҮҮЛИЙН хуудас */
function noteSheet(doc: ReportDoc): XlsxSheet {
  const rows: XlsxCell[][] = [
    [{ v: doc.title, s: S_TITLE }],
    [doc.date],
    [],
  ];
  for (const b of doc.blocks) {
    const h = headingOf(b);
    if (h) { rows.push([{ v: h, s: S_TITLE }]); continue; }
    if (b.kind === 'para') { rows.push([{ v: plain(b.text), s: S_WRAP }]); continue; }
    if (b.kind === 'list') {
      for (const it of b.items) rows.push([{ v: `• ${plain(it)}`, s: S_WRAP }]);
      rows.push([]);
      continue;
    }
    if (b.kind === 'chart' && b.spec?.note) rows.push([{ v: plain(b.spec.note), s: S_WRAP }]);
  }
  return { name: tr('Тайлбар'), rows, cols: [90] };
}

export function buildChatXlsx(doc: ReportDoc): Uint8Array {
  const sty = styler();
  const sheets: XlsxSheet[] = reportTables(doc).map((t) => tableSheet(typeTable(t), sty));
  sheets.push(noteSheet(doc));
  return buildXlsx(sheets);
}

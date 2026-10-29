/**
 * AI ТУСЛАХЫН ТАЙЛАН — PDF (pdfmake).
 */
import type { Content, TableCell, CanvasElement, TDocumentDefinitions } from 'pdfmake/interfaces';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { isNumeric } from '@/lib/agent/format';
import { headingOf, type MdBlock } from '@/lib/agent/blocks';
import type { ChartSpec } from '@/lib/agent/chart';
import type { ReportDoc } from '@/lib/agent/report';
import { ACCENT, INK, INK2, MUTED, PAPER, RULE, SURF, T, tableLayout, th } from '@/lib/pdfTheme';

/** Хуудасны ашиглах өргөн (A4 − хоёр талын 40pt) */
const W = 515;

/* ── Мөрийн доторх тэмдэглэгээ → pdfmake-ийн текстийн хэсгүүд ── */

/**
 * `**тод**` ба кодын тэмдэглэгээ — `AgentMarkdown.inline`-тай ИЖИЛ дүрэм.
 */
function runs(text: string): Content[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return { text: T(p.slice(2, -2)), bold: true, color: INK };
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return { text: T(p.slice(1, -1)), color: INK2 };
    }
    return { text: T(p) };
  });
}

/** Хүснэгтийн нүдэнд тэмдэглэгээг арилгана — нүд дотор олон хэсэг хэрэггүй */
const plain = (s: string) => T(s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'));

/* ── График ── */

/** Тоог шошго болгоно — нэгж өгөгдсөн бол хамт */
function valText(v: number | null, unit?: string): string {
  if (v == null) return '—';
  const s = num(v, Number.isInteger(v) ? 0 : 1);
  if (!unit) return s;
  return unit === '%' ? `${s}%` : `${s} ${unit}`;
}

/**
 * ХЭВТЭЭ ЗУРВАС — `bar`/`column`/`pie`/`stack`/`gauge` бүгд үүгээр.
 */
function bars(spec: ChartSpec): Content {
  const vals = spec.data.map((d) => d.value).filter((v): v is number => v != null);
  const total = vals.reduce((a, b) => a + b, 0);
  const share = spec.type === 'pie' || spec.type === 'stack';
  const top = spec.type === 'gauge' ? 100 : share ? Math.max(total, 1) : Math.max(1, ...vals);
  const nameW = 140;
  const valW = 110;
  const trackW = W - nameW - valW - 16;
  return {
    margin: [0, 4, 0, 8],
    table: {
      widths: [nameW, trackW, valW],
      body: spec.data.map((d): TableCell[] => [
        { text: plain(d.label), style: 'barName' },
        {
          canvas: [
            { type: 'rect', x: 0, y: 2, w: trackW, h: 9, r: 2, color: SURF },
            ...(d.value == null ? [] : [{
              type: 'rect' as const,
              x: 0,
              y: 2,
              w: Math.max(1, (trackW * Math.min(Math.max(d.value, 0), top)) / top),
              h: 9,
              r: 2,
              color: ACCENT,
            }]),
          ],
        },
        {
          text: share && d.value != null && total > 0
            ? `${valText(d.value, spec.unit)} · ${num((d.value / total) * 100, 1)}%`
            : valText(d.value, spec.unit),
          style: 'barVal',
          alignment: 'right',
        },
      ]),
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: (i: number) => (i === 0 ? 0 : 8),
      paddingRight: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };
}

/**
 * ХУГАЦААНЫ ЦУВАА — `line`.
 */
function line(spec: ChartSpec): Content {
  const H = 72;
  const n = spec.data.length;
  const vals = spec.data.map((d) => d.value).filter((v): v is number => v != null);
  const hi = Math.max(...vals);
  const lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (n > 1 ? (W * i) / (n - 1) : W / 2);
  const y = (v: number) => H - ((v - lo) / span) * H;
  const cv: CanvasElement[] = [
    { type: 'line', x1: 0, y1: H, x2: W, y2: H, lineWidth: 0.6, lineColor: RULE },
  ];
  for (let i = 1; i < n; i++) {
    const a = spec.data[i - 1].value;
    const b = spec.data[i].value;
    if (a == null || b == null) continue;
    cv.push({ type: 'line', x1: x(i - 1), y1: y(a), x2: x(i), y2: y(b), lineWidth: 1.4, lineColor: ACCENT });
  }
  for (let i = 0; i < n; i++) {
    const v = spec.data[i].value;
    if (v == null) continue;
    cv.push({ type: 'ellipse', x: x(i), y: y(v), r1: 2, r2: 2, color: ACCENT });
  }
  return {
    margin: [0, 6, 0, 8],
    stack: [
      { canvas: cv },
      {
        margin: [0, 4, 0, 0],
        columns: spec.data.map((d) => ({
          width: W / n,
          text: plain(d.label).slice(0, 9),
          style: 'axis',
          alignment: 'center' as const,
        })),
      },
      {
        margin: [0, 2, 0, 0],
        text: spec.data.map((d) => `${plain(d.label)} ${valText(d.value, spec.unit)}`).join(' · '),
        style: 'note',
      },
    ],
  };
}

function chartContent(spec: ChartSpec): Content[] {
  return [
    ...(spec.title ? [{ text: plain(spec.title), style: 'caption' } as Content] : []),
    spec.type === 'line' ? line(spec) : bars(spec),
    ...(spec.note ? [{ text: plain(spec.note), style: 'note' } as Content] : []),
  ];
}

/* ── Блок → агуулга ── */

function blockContent(b: MdBlock): Content[] {
  const head = headingOf(b);
  if (head) return [{ text: T(head), style: 'h3' }];

  if (b.kind === 'para') return [{ text: runs(b.text), style: 'lead' }];

  if (b.kind === 'list') {
    const items = b.items.map((it) => ({ text: runs(it) }));
    return [b.ordered
      ? { ol: items, style: 'item', margin: [0, 0, 0, 8] }
      : { ul: items, style: 'item', margin: [0, 0, 0, 8] }];
  }

  if (b.kind === 'table') {
    const cols = Math.max(b.head.length, ...b.rows.map((r) => r.length));
    const widths = Array.from({ length: cols }, (_, i) => (i === 0 ? '*' : 'auto'));
    const row = (cs: string[]) => Array.from({ length: cols }, (_, i): TableCell => {
      const v = cs[i] ?? '';
      return { text: plain(v), alignment: i > 0 && isNumeric(plain(v)) ? 'right' : 'left' };
    });
    return [{
      margin: [0, 2, 0, 10],
      table: {
        headerRows: 1,
        widths,
        body: [
          Array.from({ length: cols }, (_, i) => th(plain(b.head[i] ?? ''), i > 0)),
          ...b.rows.map(row),
        ],
      },
      layout: tableLayout,
    }];
  }

  if (b.kind === 'chart') return b.spec ? chartContent(b.spec) : [];
  return [];
}

/** Баримтын тодорхойлолт — `renderPdfBase64`-д шууд дамжина */
export function buildChatPdf(doc: ReportDoc): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 44],
    background: () => ({
      table: { widths: [595], heights: [842], body: [[{ text: '', fillColor: PAPER }]] },
      layout: 'noBorders',
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK2, lineHeight: 1.3 },
    styles: {
      eyebrow: { fontSize: 7, color: MUTED, characterSpacing: 1.2 },
      docTitle: { fontSize: 16, bold: true, color: INK, lineHeight: 1.2, margin: [0, 6, 0, 2] },
      docDate: { fontSize: 8, color: MUTED, margin: [0, 0, 0, 10] },
      h3: { fontSize: 10, bold: true, color: INK, margin: [0, 10, 0, 3] },
      lead: { fontSize: 9.5, color: INK2, lineHeight: 1.5, margin: [0, 0, 0, 8] },
      item: { fontSize: 9, color: INK2, lineHeight: 1.45 },
      caption: { fontSize: 9.5, bold: true, color: INK, margin: [0, 10, 0, 4] },
      note: { fontSize: 7.5, color: MUTED, lineHeight: 1.4, margin: [0, 4, 0, 0] },
      axis: { fontSize: 6.5, color: MUTED },
      th: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.3 },
      barName: { fontSize: 8.5, color: INK2 },
      barVal: { fontSize: 8.5, color: INK, bold: true },
    },
    footer: (page: number, count: number) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: tr('Сэлбэ ухаалаг хотын хөгжлийн төсөл · AI туслах'), fontSize: 7.5, color: MUTED },
        { text: tr('Хуудас {0} / {1}', page, count), fontSize: 7.5, color: MUTED, alignment: 'right' },
      ],
    }),
    content: [
      { text: tr('Сэлбэ 20 минутын хот · AI туслахын тайлан').toUpperCase(), style: 'eyebrow' },
      { text: T(doc.title), style: 'docTitle' },
      { text: T(doc.date), style: 'docDate' },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 0.6, lineColor: RULE }], margin: [0, 0, 0, 12] },
      ...doc.blocks.flatMap(blockContent),
    ],
  };
}

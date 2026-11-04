/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — PDF (pdfmake), ЦОРЫН ГАНЦ гарц (2026-11-05, хэрэглэгч: «дэлгэцэд харуулахгүй, шууд PDF»).
 *   · нүүр: хүлээн авагч · гарчиг · хугацаа · үүсгэсэн огноо, хэрэглэгч · гол 4 тоо; гараар бөглөх зүйл, гарын үсэг БАЙХГҮЙ
 *   · агуулга · хэсэг бүр: гарчиг + график (`audienceChart.chartSvg`, 515pt) + тооноос үүссэн өгүүлбэр
 *   · урт баганан график `splitSpec`-ээр хуудасны хэмжээнд хуваагдана; график + өгүүлбэр нэг хуудсанд (`unbreakable`)
 *   · хавсралт хүснэгт (бүтэн дүн ₮) — зөвхөн Хотын дарга, Төлөөлөн удирдах зөвлөлд
 * Хэв маяг `execPdf.ts`-тэй ижил (`pdfTheme`: A4, Roboto, толгой/хөл; `₮` → «төг»).
 */
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { t as tr } from '@/lib/i18nCore';
import { PAPER, INK, INK2, INK3, MUTED, RULE, RULE2, SURF, T, tableLayout, th, td, tdBold } from '@/lib/pdfTheme';
import { chartSvg, splitSpec, svgHeight, CHART_W } from '@/lib/audienceChart';
import { audienceLabel, type Report, type Section } from '@/lib/audienceReport';
import { renderPdfBase64, download } from '@/lib/emailReport';

/** A4 — 40pt захтай агуулгын өргөн (`execPdf`-тэй ижил) */
export const PDF_CONTENT_W = CHART_W;
/** Хуудасны агуулгын өндөр (842 − 52 − 44) — график үүнээс халихгүй */
export const PDF_CONTENT_H = 746;

/** Нэг хэсэг → блокууд. Хуваагдсан график бүр өөрийн `unbreakable` багцтай; өгүүлбэр сүүлийн графиктай хамт. */
function sectionBlocks(s: Section): Content[] {
  const specs = splitSpec(s.chart);
  const out: Content[] = [];
  specs.forEach((spec, k) => {
    const svg = chartSvg(spec, PDF_CONTENT_W);
    const blocks: Content[] = [
      { text: T(k === 0 ? `${s.no}. ${s.title}` : `${s.no}. ${s.title} (${tr('үргэлжлэл')})`), style: k === 0 ? 'h2' : 'h2cont' },
      { svg: T(svg), width: PDF_CONTENT_W, margin: [0, 2, 0, 6] },
    ];
    if (k === specs.length - 1) {
      blocks.push({
        table: { widths: ['*'], body: [[{ stack: s.text.map((t): Content => ({ text: T(t), style: 'lead', margin: [0, 0, 0, 3] })), margin: [8, 6, 8, 4] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2 : 0), vLineColor: () => RULE2, fillColor: () => SURF, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 0, 0, 10],
      });
    }
    /* Жагсаалт (урт) хуудас дамжиж болно; график хуудаснаас өндөр бол зөвхөн тэр үед задарна */
    const unbreakable = s.chart.kind !== 'list' && svgHeight(svg) + 60 < PDF_CONTENT_H;
    out.push({ stack: blocks, unbreakable });
  });
  return out;
}

/** Нүүрний гол тоо — 1-р хэсгийн картуудаас (нэг эх) */
function coverFacts(report: Report): Content {
  const kpi = report.sections[0]?.chart;
  const items = kpi && kpi.kind === 'kpi' ? kpi.items.slice(0, 4) : [];
  if (!items.length) return { text: '' };
  return {
    margin: [0, 18, 0, 0],
    columns: items.map((k) => ({
      stack: [
        { text: T(k.value), fontSize: 18, bold: true, color: INK },
        { text: T(k.label).toUpperCase(), style: 'coverFactL', margin: [0, 2, 0, 0] },
        ...(k.sub ? [{ text: T(k.sub), fontSize: 8, color: INK3 } as Content] : []),
      ],
    })),
    columnGap: 14,
  };
}

export function buildAudienceDoc(report: Report, dateStr: string): TDocumentDefinitions {
  const who = audienceLabel(report.audience);
  const sections = report.sections.flatMap((s, i): Content[] => {
    const blocks = sectionBlocks(s);
    /* Бүлэг солигдоход шинэ хуудас (эхний бүлгээс бусад) */
    const newGroup = i > 0 && s.group !== report.sections[i - 1].group;
    if (newGroup && blocks.length) {
      const first = blocks[0] as { stack: Content[]; unbreakable: boolean };
      blocks[0] = { ...first, pageBreak: 'before' };
    }
    return blocks;
  });
  const app = report.appendix;
  return {
    pageSize: 'A4',
    pageMargins: [40, 52, 40, 44],
    background: () => ({
      table: { widths: [595], heights: [842], body: [[{ text: '', fillColor: PAPER }]] },
      layout: 'noBorders',
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK2, lineHeight: 1.3 },
    styles: {
      eyebrow: { fontSize: 8, color: MUTED, characterSpacing: 2.2 },
      coverTitle: { fontSize: 24, bold: true, color: INK, lineHeight: 1.15 },
      coverSub: { fontSize: 10.5, color: INK3, lineHeight: 1.5 },
      coverFactL: { fontSize: 7, color: MUTED, characterSpacing: 0.4 },
      h1: { fontSize: 15, bold: true, color: INK, margin: [0, 0, 0, 2] },
      h2: { fontSize: 12.5, bold: true, color: INK, margin: [0, 12, 0, 4] },
      h2cont: { fontSize: 10, bold: true, color: INK3, margin: [0, 10, 0, 4] },
      lead: { fontSize: 9.5, color: INK2, lineHeight: 1.45 },
      note: { fontSize: 7.5, color: MUTED, lineHeight: 1.4, margin: [0, 5, 0, 0] },
      th: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.3 },
      tocItem: { fontSize: 9, color: INK2, margin: [0, 0, 0, 5] },
    },
    header: (page: number) => (page === 1 ? '' : {
      margin: [40, 24, 40, 0],
      stack: [
        { text: T(`${tr('Сэлбэ ухаалаг хотын төслийн тайлан')} · ${who}`).toUpperCase(), fontSize: 7, color: MUTED, characterSpacing: 1.2 },
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: PDF_CONTENT_W, y2: 6, lineWidth: 0.6, lineColor: RULE }] },
      ],
    }),
    footer: (page: number, count: number) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: T(tr('Үүсгэсэн {0} · {1}', dateStr, report.subtitle)), fontSize: 7.5, color: MUTED },
        { text: tr('Хуудас {0} / {1}', page, count), fontSize: 7.5, color: MUTED, alignment: 'right' },
      ],
    }),
    content: [
      /* ══ Нүүр ══ */
      { text: who.toUpperCase(), style: 'eyebrow', margin: [0, 80, 0, 26] },
      { text: T(report.title), style: 'coverTitle', margin: [0, 0, 0, 16] },
      { columns: [{ width: 400, text: T(report.subtitle), style: 'coverSub' }], margin: [0, 0, 0, 26] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: RULE2 }] },
      coverFacts(report),
      { text: tr('Автоматаар үүссэн — гараар оруулсан мэдээлэлгүй; бүх тоо, тайлбар Сэлбэ порталын өгөгдлөөс.'), style: 'note', margin: [0, 18, 0, 0] },
      { text: tr('Тайлангийн бүтэц'), style: 'h1', margin: [0, 36, 0, 8] },
      ...report.sections.map((s): Content => ({
        columns: [{ width: 28, text: s.no, fontSize: 9, color: INK3, bold: true }, { width: '*', text: T(s.title), style: 'tocItem' }],
      })),
      ...(app ? [{ columns: [{ width: 28, text: app.no, fontSize: 9, color: INK3, bold: true }, { width: '*', text: T(app.title), style: 'tocItem' }] } as Content] : []),
      /* ══ Хэсгүүд ══ */
      { text: '', pageBreak: 'before' },
      ...sections,
      /* ══ Хавсралт ══ */
      ...(app ? [
        { text: T(`${app.no}. ${app.title}`), style: 'h1', pageBreak: 'before' } as Content,
        {
          table: {
            headerRows: 1,
            widths: ['*', 92, 92, 50, 46],
            body: [
              app.head.map((h, k): TableCell => th(h, k > 0)),
              ...app.rows.map((row, ri): TableCell[] => row.map((c, k) => (ri === app.rows.length - 1 ? tdBold(c, k > 0) : td(c, k > 0)))),
            ],
          },
          layout: tableLayout,
        } as Content,
      ] : []),
      { text: tr('Эх сурвалж: Сэлбэ порталын «Төсөл төлөвлөгөө биелэлт» · Ерөнхий дашбоард · Багцын гүйцэтгэл · Багцын санхүү · IPC · Газар чөлөөлөлт · Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй. Бүх тоо, тайлбар автоматаар үүссэн.'), style: 'note', margin: [0, 16, 0, 0] },
    ],
  };
}

const fileName = (report: Report) => `Selbe_tailan_${report.audience}.pdf`;

export async function downloadAudiencePdf(report: Report, dateStr: string): Promise<void> {
  const doc = buildAudienceDoc(report, dateStr);
  const b64 = await renderPdfBase64(doc);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  download(fileName(report), new Blob([bytes], { type: 'application/pdf' }));
}

/**
 * УДИРДЛАГЫН ТАЙЛАН — PDF (pdfmake).
 *
 * БҮТЭЦ (2026-09-17, хэрэглэгчийн заавар: `D:\Selbe\Tailan`-д байгаа
 * лавлагаа тайланг «өнгө зүс, style, design» хүртэл нь дуурайв):
 *   1  Нүүр хуудас — гарчиг, товч тодорхойлолт, гол дөрвөн үзүүлэлт
 *   2  Гүйцэтгэлийн хураангуй — зургаан үзүүлэлт, гол дүгнэлт, агуулга
 *   3+ 1. Төслийн ерөнхий байдал … 5. Зөвшөөрөл
 *   ..  6. Дүгнэлт ба зөвлөмж
 *   ..  Хавсралт
 *
 * ⚠️ Өгөгдөл нь ЗӨВХӨН `ExecReport` — дэлгэц (`ExecReport.tsx`)-тэй ижил тоо.
 * ⚠️ Roboto фонтод ₮ БАЙХГҮЙ — `reportPdf.ts`-тэй ижил дүрмээр «төг» болгоно.
 * ⚠️ ТАЙЛАН ДҮГНЭЛТЭЭС ЭХЭЛДЭГГҮЙ: хураангуй хуудсан дээрх «гол дүгнэлт» нь
 *    заалт (уншигчийг чиглүүлэх), бүрэн дүгнэлт ба зөвлөмж нь баримтын ДАРАА.
 */
import type { TDocumentDefinitions, Content, TableCell, CustomTableLayout } from 'pdfmake/interfaces';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { execFindings, execFindingBrief, type ExecFinding, type ExecReport } from '@/lib/execReport';
import { TOLOV } from '@/lib/zovshoorol';
import { PARCEL_CLEARED } from '@/lib/services';
import { buildInfographic, toPng, money } from '@/lib/execInfographic';
import { renderPdfBase64, download } from '@/lib/emailReport';

/* ══════════════════════ Өнгөний палитр ══════════════════════
 *
 * ⚠️ Лавлагаа баримтаас ШУУД авсан утгууд (PDF-ийн зурах командуудаас
 * задлав). Дулаан цаас, бараг хар гарчиг, цэнхэр акцент, дулаан саарал
 * зураас. Аль нэгийг өөрчилбөл баримт «өөр газраас гарсан» мэт харагдана.
 */
const PAPER = '#f9f9f7';   // хуудасны дэвсгэр
const INK = '#0b0b0b';     // гарчиг
const INK2 = '#33322f';    // үндсэн бичвэр
const INK3 = '#52514e';    // хоёрдогч
const MUTED = '#898781';   // тайлбар, толгойн шошго
const RULE = '#e1e0d9';    // хүснэгтийн зураас
const RULE2 = '#c3c2b7';   // тод зааг
const SURF = '#f0efec';    // хөнгөн дүүргэлт
const BLUE = '#2a78d6';    // акцент
const RED = '#d03b3b';
const AMBER = '#fab219';

/** Roboto-д байхгүй тэмдэгтийг PDF-д орлуулна */
const T = (s: string) => s.replace(/₮/g, tr('төг'));

/* ══════════════════════ Хүснэгтийн загвар ══════════════════════
 *
 * ⚠️ БОСОО ЗУРААСГҮЙ: лавлагаа баримт мөр хоорондын нимгэн хэвтээ
 * зураасаар л ялгадаг. Босоо шугам нэмбэл «хүснэгтэн тор» болж, хэв маяг
 * эрс өөрчлөгдөнө.
 */
/* ⚠️ pdfmake-ийн `CustomTableLayout` нь `node`-ыг `ContentTable` гэж өгдөг
   тул тоологчийг `any`-гүйгээр бичихэд төрөл зөрнө — хамгийн бага хүрээнд
   `TableLayout` гэж зарлаж, доторх хандалтыг хамгаална. */
const tableLayout: CustomTableLayout = {
  hLineColor: (i, node) => (i === 1 || i === node.table.body.length ? RULE2 : RULE),
  vLineWidth: () => 0,
  hLineWidth: (i, node) => (i === 0 ? 0 : i === 1 || i === node.table.body.length ? 0.9 : 0.5),
  paddingLeft: (i) => (i === 0 ? 0 : 6),
  paddingRight: (i, node) => (i === (Array.isArray(node.table.widths) ? node.table.widths.length : 1) - 1 ? 0 : 6),
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

const th = (t: string, right = false): TableCell =>
  ({ text: T(t), style: 'th', alignment: right ? 'right' : 'left' });
const td = (t: string | number, right = false, color?: string): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', ...(color ? { color } : {}) });
const tdBold = (t: string | number, right = false): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', bold: true });

/** Бүлгийн гарчиг — дугаар, нэр, доор нь нэг мөрийн тодорхойлолт */
const h2 = (no: string, title: string, sub?: string): Content[] => [
  { text: T(`${no}. ${title}`), style: 'h2' },
  ...(sub ? [{ text: T(sub), style: 'h2sub' } as Content] : []),
];
/** Хүснэгт/зургийн дээрх нэр */
const cap = (t: string): Content => ({ text: T(t), style: 'caption' });
/** Хүснэгтийн доорх тайлбар */
const note = (t: string): Content => ({ text: T(t), style: 'note' });
/** Тэргүү догол мөр — бүлэг бүрийн эхний тайлбар */
const lead = (t: string): Content => ({ text: T(t), style: 'lead' });

/**
 * ГОЛ ҮЗҮҮЛЭЛТИЙН МӨР — шошго (жижиг, том үсэг), утга (том), тодотгол.
 * ⚠️ Хүрээгүй: лавлагаа баримт KPI-г хайрцаглахгүй, зөвхөн доогуур
 * зураасаар зааглана.
 */
function kpiRow(items: { label: string; value: string; sub?: string }[]): Content {
  return {
    margin: [0, 6, 0, 10],
    table: {
      widths: items.map(() => '*'),
      body: [items.map((k): TableCell => ({
        stack: [
          { text: T(k.label).toUpperCase(), style: 'kpiLabel' },
          { text: T(k.value), style: 'kpiVal' },
          ...(k.sub ? [{ text: T(k.sub), style: 'kpiSub' } as Content] : []),
        ],
        border: [false, false, false, false],
      }))],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i, node) => {
        const n = Array.isArray(node.table.widths) ? node.table.widths.length : 0;
        return i === 0 || i === n ? 0 : 0.5;
      },
      vLineColor: () => RULE,
      paddingLeft: (i) => (i === 0 ? 0 : 12),
      paddingRight: () => 12,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    } as CustomTableLayout,
  };
}

/**
 * ХЭВТЭЭ ЗУРВАСАН ЧАРТ — нэр, зурвас, утга.
 * ⚠️ pdfmake-д чарт байхгүй тул хүснэгт + `canvas`-аар зурна. Зурвасын
 * өргөн нь хамгийн их утгад харьцуулагдана.
 */
function barChart(
  rows: { label: string; value: number; text: string }[],
  o: { nameW?: number; valW?: number; color?: string } = {},
): Content {
  const top = Math.max(1, ...rows.map((r) => r.value));
  const nameW = o.nameW ?? 150;
  const valW = o.valW ?? 120;
  const trackW = 515 - nameW - valW - 16;
  return {
    margin: [0, 4, 0, 10],
    table: {
      widths: [nameW, trackW, valW],
      body: rows.map((r): TableCell[] => [
        { text: T(r.label), style: 'barName' },
        {
          canvas: [
            { type: 'rect', x: 0, y: 2, w: trackW, h: 9, r: 2, color: SURF },
            { type: 'rect', x: 0, y: 2, w: Math.max(1, (trackW * r.value) / top), h: 9, r: 2, color: o.color ?? BLUE },
          ],
        },
        { text: T(r.text), style: 'barVal', alignment: 'right' },
      ]),
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: (i) => (i === 0 ? 0 : 8),
      paddingRight: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    } as CustomTableLayout,
  };
}

/** AI дүгнэлтийн энгийн текстийг мөр мөрөөр — «•» мөрүүд жагсаалт болно */
function summaryBlocks(text: string): Content[] {
  const out: Content[] = [];
  let ul: string[] = [];
  const flush = () => { if (ul.length) { out.push({ ul: ul.map(T), style: 'finding' }); ul = []; } };
  for (const raw of text.split(/\r?\n/)) {
    const ln = raw.trim();
    if (!ln) { flush(); continue; }
    if (/^[•\-*·]\s*/.test(ln)) { ul.push(ln.replace(/^[•\-*·]\s*/, '')); continue; }
    flush();
    out.push({ text: T(ln), style: /^[^:]{2,40}:$/.test(ln) ? 'h3' : 'lead' });
  }
  flush();
  return out;
}

/** Хүндрэлийн зэргийн өнгө — зөвхөн АСУУДАЛ өнгөтэй */
const sevColor = (s: ExecFinding['sev']) => (s === 'bad' ? RED : s === 'warn' ? AMBER : MUTED);

/**
 * ДҮГНЭЛТИЙН БЛОК — хэсгийн шошго, мэдэгдэл, зөвлөмж.
 * ⚠️ Нэрсийн жагсаалт ЭНД БИШ, хавсралтад — 34 нэр дүгнэлтийн дунд орвол
 * гол санаа живнэ (2026-09-17, хэрэглэгчийн заавар).
 */
function findingBlocks(list: ExecFinding[], withAdvice: boolean): Content[] {
  const withItems = list.filter((f) => f.items?.length);
  return list.flatMap((f): Content[] => {
    const idx = withItems.indexOf(f);
    const ref = idx >= 0 ? ` ${tr('Дэлгэрэнгүйг хавсралт {0}-аас үзнэ үү.', num(idx + 1))}` : '';
    return [
      { text: T(f.area).toUpperCase(), style: 'chip', color: sevColor(f.sev) },
      { text: T(`${f.text}${ref}`), style: 'finding' },
      ...(withAdvice && f.advice
        ? [{ text: T(`${tr('Зөвлөмж:')} ${f.advice}`), style: 'advice' } as Content]
        : []),
    ];
  });
}

/* ══════════════════════ Баримт ══════════════════════ */

export async function buildExecDoc(
  x: ExecReport, dateStr: string, summary: string | null,
): Promise<TDocumentDefinitions> {
  const findings = execFindings(x);
  const g = x.gdash;
  const p = x.prog;
  const f = x.fin;
  const z = x.zov;

  /**
   * ЭХЛЭЭГҮЙ АЖИЛ — олголт огт хийгдээгүй багцууд.
   * ⚠️ `given === 0` нь «олголт хийгдээгүй»; `pct == null` нь «гэрээгүй тул
   * хувь бодогдохгүй» — ХОЁР ӨӨР утга, хольж болохгүй.
   */
  const finZero = f.rows.filter((r) => r.given === 0 && r.plan > 0);
  const finStarted = f.rows.filter((r) => !(r.given === 0 && r.plan > 0));
  /** Хавсралтад орох дүгнэлтүүд — дэлгэцтэй ИЖИЛ дараалал */
  const appendix = findings.filter((a) => a.items?.length);
  /** Захирамжийн эх үүсвэрүүдийн нийлбэр — хувийн СУУРЬ (нийт төсөв БИШ) */
  const srcSum = g.bySource.reduce((a, s) => a + s.amount, 0);

  const gapText = p.gap == null ? '—' : `${p.gap > 0 ? '−' : p.gap < 0 ? '+' : ''}${num(Math.abs(p.gap), 1)}`;
  const buildPk = p.packs.filter((k) => k.kind === 'build');
  const topType = g.byType[0];
  const topReason = g.land.reasons[0];
  const bestPk = [...buildPk].filter((k) => k.progress != null).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
  const worstPk = [...buildPk].filter((k) => k.progress != null).sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0))[0];

  return {
    pageSize: 'A4',
    pageMargins: [40, 52, 40, 44],
    /* ⚠️ Дулаан цаасны өнгө — лавлагаа баримтын гол шинж.
       ⚠️ `canvas` БИШ, ХҮСНЭГТ: pdfmake 0.3.11-д background-д canvas өгвөл
       `processCanvas` → `addAll(undefined)` гэж унадаг (2026-09-17-нд
       Node дээр хагаслан баталсан). Бүтэн хуудасны нэг нүдтэй хүснэгт ижил
       үр дүн өгнө. */
    background: () => ({
      table: { widths: [595], heights: [842], body: [[{ text: '', fillColor: PAPER }]] },
      layout: 'noBorders',
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK2, lineHeight: 1.3 },
    styles: {
      /* Нүүр хуудас */
      eyebrow: { fontSize: 8, color: MUTED, characterSpacing: 2.2 },
      coverTitle: { fontSize: 26, bold: true, color: INK, lineHeight: 1.15 },
      coverSub: { fontSize: 10.5, color: INK3, lineHeight: 1.5 },
      coverFactL: { fontSize: 7.5, color: MUTED, characterSpacing: 0.4 },
      coverFactV: { fontSize: 10, color: INK2 },
      coverKpiV: { fontSize: 17, bold: true, color: INK },
      coverKpiL: { fontSize: 7.5, color: MUTED },
      /* Бүлэг */
      h1: { fontSize: 15, bold: true, color: INK, margin: [0, 0, 0, 2] },
      h2: { fontSize: 14, bold: true, color: INK, margin: [0, 14, 0, 2] },
      h2sub: { fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 8] },
      h3: { fontSize: 10, bold: true, color: INK, margin: [0, 10, 0, 3] },
      lead: { fontSize: 9.5, color: INK2, lineHeight: 1.5, margin: [0, 0, 0, 10] },
      caption: { fontSize: 9.5, bold: true, color: INK, margin: [0, 12, 0, 5] },
      note: { fontSize: 7.5, color: MUTED, lineHeight: 1.4, margin: [0, 5, 0, 0] },
      /* Хүснэгт */
      th: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.3 },
      /* KPI */
      kpiLabel: { fontSize: 7, color: MUTED, characterSpacing: 0.4 },
      kpiVal: { fontSize: 14, bold: true, color: INK, margin: [0, 3, 0, 0] },
      kpiSub: { fontSize: 7.5, color: MUTED, margin: [0, 2, 0, 0] },
      /* Чарт */
      barName: { fontSize: 8.5, color: INK2 },
      barVal: { fontSize: 8.5, color: INK, bold: true },
      /* Дүгнэлт */
      chip: { fontSize: 7, bold: true, characterSpacing: 0.8, margin: [0, 8, 0, 2] },
      finding: { fontSize: 9, color: INK2, lineHeight: 1.45 },
      advice: { fontSize: 8.5, color: INK3, italics: true, lineHeight: 1.4, margin: [0, 2, 0, 0] },
      findingItem: { fontSize: 8, color: INK3, margin: [6, 1, 0, 2] },
      /* Агуулга */
      tocItem: { fontSize: 9, color: INK2, margin: [0, 0, 0, 6] },
    },
    /* ⚠️ Нүүр хуудсанд толгой ГАРАХГҮЙ — тэр нь бие даасан хавтас */
    header: (page: number) => (page === 1 ? '' : {
      margin: [40, 24, 40, 0],
      stack: [
        { text: tr('Сэлбэ ухаалаг хотын удирдлагын тайлан').toUpperCase(), fontSize: 7, color: MUTED, characterSpacing: 1.2 },
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 0.6, lineColor: RULE }] },
      ],
    }),
    footer: (page: number, count: number) => (page === 1 ? {
      margin: [40, 12, 40, 0],
      columns: [
        { text: tr('Сэлбэ ухаалаг хотын хөгжлийн төсөл'), fontSize: 7.5, color: MUTED },
        { text: tr('Нууцлалын зэрэглэл: Дотоод хэрэглээ'), fontSize: 7.5, color: MUTED, alignment: 'right' },
      ],
    } : {
      margin: [40, 12, 40, 0],
      columns: [
        { text: tr('Сэлбэ ухаалаг хотын удирдлагын тайлан'), fontSize: 7.5, color: MUTED },
        { text: tr('Хуудас {0} / {1}', page, count), fontSize: 7.5, color: MUTED, alignment: 'right' },
      ],
    }),
    content: [
      /* ══════════ 1. НҮҮР ХУУДАС ══════════ */
      { text: tr('Удирдлагын тайлан · Гүйцэтгэлийн тойм').toUpperCase(), style: 'eyebrow', margin: [0, 80, 0, 26] },
      { text: tr('Сэлбэ ухаалаг хотын'), style: 'coverTitle' },
      { text: tr('удирдлагын тайлан'), style: 'coverTitle', margin: [0, 0, 0, 16] },
      /* ⚠️ Өргөнийг БАГАНААР хязгаарлана — `text`-д `width` байхгүй */
      {
        columns: [{
          width: 380,
          text: tr('Төслийн санхүүжилт, барилга угсралтын биет гүйцэтгэл, газар чөлөөлөлт болон зөвшөөрлийн явцын нэгдсэн тайлан.'),
          style: 'coverSub',
        }],
        margin: [0, 0, 0, 34],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: RULE2 }] },
      {
        margin: [0, 14, 0, 0],
        columns: [
          { stack: [{ text: T(dateStr), style: 'coverFactV' }, { text: tr('Тайлан үүсгэсэн огноо').toUpperCase(), style: 'coverFactL' }] },
          { stack: [{ text: tr('{0} ажлын багц', num(g.packages)), style: 'coverFactV' }, { text: tr('{0} төрөл', num(g.types)).toUpperCase(), style: 'coverFactL' }] },
          { stack: [{ text: tr('6 үе шат'), style: 'coverFactV' }, { text: tr('Жигнэсэн гүйцэтгэлийн хэмжилт').toUpperCase(), style: 'coverFactL' }] },
        ],
        columnGap: 18,
      },
      /* ⚠️ 2×2 — мөнгөн дүн БҮТЭН бичигддэг (товчлол хориотой, `format.ts`)
         тул дөрвүүлэнг нэг мөрөнд багтаахгүй */
      {
        margin: [0, 48, 0, 0],
        columns: [
          { stack: [{ text: g.progress == null ? '—' : pct(g.progress, 1), style: 'coverKpiV' }, { text: tr('Төслийн нийт гүйцэтгэл'), style: 'coverKpiL' }] },
          { stack: [{ text: T(money(g.budget)), style: 'coverKpiV' }, { text: tr('Нийт төсөв'), style: 'coverKpiL' }] },
        ],
        columnGap: 24,
      },
      {
        margin: [0, 22, 0, 0],
        columns: [
          { stack: [{ text: g.landPct == null ? '—' : pct(g.landPct, 1), style: 'coverKpiV' }, { text: tr('Газар чөлөөлөлт'), style: 'coverKpiL' }] },
          { stack: [{ text: T(money(f.given)), style: 'coverKpiV' }, { text: tr('Олгосон санхүүжилт'), style: 'coverKpiL' }] },
        ],
        columnGap: 24,
      },

      /* ══════════ 2. ГҮЙЦЭТГЭЛИЙН ХУРААНГУЙ ══════════ */
      { text: tr('Гүйцэтгэлийн хураангуй'), style: 'h1', pageBreak: 'before' },
      { text: tr('{0} байдлаарх нэгдсэн үзүүлэлт', dateStr), style: 'h2sub' },
      kpiRow([
        { label: tr('Нийт төсөв'), value: money(g.budget), sub: `${num(g.budget)} ₮` },
        { label: tr('Нийт гэрээлсэн дүн'), value: money(g.contract), sub: g.budget > 0 ? tr('төсвийн {0}', pct((g.contract / g.budget) * 100, 1)) : undefined },
        { label: tr('Төслийн гүйцэтгэл'), value: g.progress == null ? '—' : pct(g.progress, 1), sub: tr('6 шатны жигнэсэн хувь') },
      ]),
      kpiRow([
        { label: tr('Газар чөлөөлөлт'), value: g.landPct == null ? '—' : pct(g.landPct, 1), sub: tr('{0} / {1} нэгж талбар', num(g.land.cleared), num(g.land.total)) },
        { label: tr('Олгосон санхүүжилт'), value: money(f.given), sub: f.share == null ? undefined : tr('гэрээний {0}', pct(f.share, 1)) },
        { label: tr('Ажлын багц'), value: num(g.packages), sub: tr('{0} төрөл ажил', num(g.types)) },
      ]),
      {
        margin: [0, 16, 0, 0],
        columns: [
          {
            width: '*',
            stack: [
              { text: tr('Гол дүгнэлтүүд'), style: 'h3', margin: [0, 0, 0, 2] },
              ...findingBlocks(findings, false),
            ],
          },
          {
            width: 180,
            stack: [
              { text: tr('Тайлангийн бүтэц'), style: 'h3', margin: [0, 0, 0, 6] },
              ...[
                tr('Төслийн ерөнхий байдал'),
                tr('Газар чөлөөлөлт ба талбайн бэлтгэл'),
                tr('Орон сууцны багцуудын биет гүйцэтгэл'),
                tr('Гэрээт багцуудын санхүүжилт'),
                tr('Зөвшөөрөл ба тусгай зөвшөөрлүүд'),
                tr('Дүгнэлт ба зөвлөмж'),
              ].map((t, i): Content => ({
                columns: [
                  { width: 14, text: String(i + 1), fontSize: 9, color: BLUE, bold: true },
                  { width: '*', text: T(t), style: 'tocItem' },
                ],
              })),
              { text: tr('Хавсралт'), style: 'tocItem', color: MUTED, margin: [14, 2, 0, 0] },
            ],
          },
        ],
        columnGap: 26,
      },

      /* ══════════ 1. ТӨСЛИЙН ЕРӨНХИЙ БАЙДАЛ ══════════ */
      { text: '', pageBreak: 'before' },
      ...h2('1', tr('Төслийн ерөнхий байдал'),
        tr('Ажлын төрлөөр төсөв, гэрээлэлт, гүйцэтгэл ба захирамжийн эх үүсвэрийн бүтэц')),
      lead(tr('Төслийн нийт {0} төсвийн {1}-тай тэнцэх дүнгээр гэрээ байгуулагдсан бөгөөд ажлын хэмжээгээрээ {2} төрөлд хуваагдана.{3}',
        money(g.budget),
        g.budget > 0 ? pct((g.contract / g.budget) * 100, 1) : '—',
        num(g.types),
        topType ? tr(' Хамгийн том эзлэх хувьтай нь {0} ({1}).', topType.label.toLocaleLowerCase('mn-MN'), money(topType.cost)) : '')),
      cap(tr('Ажлын төрлөөр төсвийн хэмжээ')),
      barChart(g.byType.map((t) => ({ label: t.label, value: t.cost, text: `${num(t.cost)} ₮` })), { nameW: 165, valW: 130 }),
      cap(tr('Ажлын төрлөөр (төсөв, гэрээлсэн дүн, гүйцэтгэл)')),
      { table: { headerRows: 1, widths: ['*', 32, 36, 94, 94, 46], body: [
        [th(tr('Ажлын төрөл')), th(tr('Ажил'), true), th(tr('Гэрээт'), true), th(tr('Төсөв (төг)'), true), th(tr('Гэрээлсэн (төг)'), true), th(tr('Гүйцэтгэл'), true)],
        ...g.byType.map((t): TableCell[] => [
          td(t.label), td(num(t.n), true), td(num(t.contracted), true),
          td(num(t.cost), true), td(t.contract > 0 ? num(t.contract) : '—', true),
          td(t.perf == null ? '—' : pct(t.perf, 1), true),
        ]),
        [tdBold(tr('Нийт')), tdBold(num(g.byType.reduce((a, t) => a + t.n, 0)), true),
          tdBold(num(g.byType.reduce((a, t) => a + t.contracted, 0)), true),
          tdBold(num(g.byType.reduce((a, t) => a + t.cost, 0)), true),
          tdBold(num(g.byType.reduce((a, t) => a + t.contract, 0)), true), tdBold('', true)],
      ] }, layout: tableLayout },
      note(tr('Нийт төсөв нь орон сууцны хороолол ба ГИШС-ийн хүрээгээр тооцогдсон; хүснэгт нь гэрээний бүх мөрийг хамарна. Газар чөлөөлөлт зэрэг ажлын төрлийн гүйцэтгэлийн хувь нь гэрээт дүнгээс үл хамааран биет хэмжигдэхүүнээр тооцогддог тул гэрээгүй ч гүйцэтгэлтэй байж болно.')),

      ...(g.bySource.length ? [
        { text: tr('Захирамжийн эх үүсвэр'), style: 'caption', pageBreak: 'before' } as Content,
        barChart(g.bySource.map((s) => ({
          label: s.label,
          value: s.amount,
          text: `${srcSum ? pct((s.amount / srcSum) * 100, 1) : '—'} · ${num(s.amount)} ₮`,
        })), { nameW: 150, valW: 150 }),
        { table: { headerRows: 1, widths: ['*', 40, 100, 110, 46], body: [
          [th(tr('Эх үүсвэр')), th(tr('Ажил'), true), th(tr('Гэрээт дүн (төг)'), true), th(tr('Захирамжийн дүн (төг)'), true), th(tr('Хувь'), true)],
          ...g.bySource.map((s): TableCell[] => [
            td(s.label), td(num(s.n), true), td(num(s.contracted), true), td(num(s.amount), true),
            td(srcSum ? pct((s.amount / srcSum) * 100, 1) : '—', true),
          ]),
          [tdBold(tr('Нийт')), tdBold(num(g.bySource.reduce((a, s) => a + s.n, 0)), true),
            tdBold(num(g.bySource.reduce((a, s) => a + s.contracted, 0)), true),
            tdBold(num(srcSum), true), tdBold('100.0%', true)],
        ] }, layout: tableLayout } as Content,
        note(tr('Хувь нь захирамжийн нийт дүнд эзлэх жин; захирамжийн дүн бүх ажилд бүрэн бүртгэгдээгүй тул нийт төсвөөс бага гарна.')),
      ] : []),

      /* ══════════ 2. ГАЗАР ЧӨЛӨӨЛӨЛТ ══════════ */
      { text: '', pageBreak: 'before' },
      ...h2('2', tr('Газар чөлөөлөлт ба талбайн бэлтгэл'),
        tr('{0} нэгж талбар, {1} м² нийт талбай', num(g.land.total), num(g.land.areaM2))),
      lead(tr('Газар чөлөөлөлт {0}-д хүрсэн ({1} / {2} нэгж талбар бүрэн чөлөөлөгдсөн).{3}',
        g.landPct == null ? '—' : pct(g.landPct, 1), num(g.land.cleared), num(g.land.total),
        topReason && g.land.remaining
          ? tr(' Үлдсэн {0} нэгж талбарын гол саад нь «{1}» төлөвт байгаа {2} талбар (үлдэгдлийн {3}).',
            num(g.land.remaining), topReason.label, num(topReason.n), pct((topReason.n / g.land.remaining) * 100, 1))
          : '')),
      cap(tr('Нэгж талбарын төлөвийн бүтэц')),
      { table: { headerRows: 1, widths: ['*', 70, 90, 80], body: [
        [th(tr('Төлөв')), th(tr('Талбар (нэгж)'), true), th(tr('Талбай (м²)'), true), th(tr('Нийт дүнд эзлэх хувь'), true)],
        ...g.land.byStatus.map((b): TableCell[] => [
          td(b.label, false, b.label === PARCEL_CLEARED ? undefined : RED),
          td(num(b.n), true), td(num(b.areaM2), true),
          td(g.land.total ? pct((b.n / g.land.total) * 100, 1) : '—', true),
        ]),
        [tdBold(tr('Нийт')), tdBold(num(g.land.total), true), tdBold(num(g.land.areaM2), true),
          tdBold(g.landPct == null ? '—' : tr('{0} чөлөөлсөн', pct(g.landPct, 1)), true)],
      ] }, layout: tableLayout },
      ...(g.land.reasons.length ? [
        cap(tr('Чөлөөлөгдөөгүй {0} нэгж талбарын шалтгаан', num(g.land.remaining))),
        barChart(g.land.reasons.map((r) => ({
          label: r.label,
          value: r.n,
          text: `${num(r.n)} (${g.land.remaining ? pct((r.n / g.land.remaining) * 100, 1) : '—'})`,
        })), { nameW: 200, valW: 90, color: RED }),
      ] : [note(tr('Чөлөөгдөөгүй талбарын шалтгаан бүртгэгдээгүй.'))]),
      cap(tr('Хөдөлмөрийн аюулгүй байдлын (ХАБ) талбайн хүн хүч')),
      ...(g.hse ? [
        kpiRow([
          { label: tr('Ажиллаж буй хүн'), value: num(g.hse.workers), sub: g.hse.date ? tr('сүүлийн бүртгэл {0}', g.hse.date) : undefined },
          { label: tr('Техник хэрэгсэл'), value: num(g.hse.equipment), sub: tr('нэгж') },
          { label: tr('Хүн цаг (нийт)'), value: num(g.hse.manHours), sub: tr('сүүлийн бүртгэлийн агшны байдлаар') },
        ]),
        note(tr('Тоо нь өдөр тутмын хуримтлал биш, сүүлийн бүртгэлийн агшны байдал.')),
      ] : [note(tr('ХАБ-ын бүртгэл алга, мэдээлэлгүй.'))]),

      /* ══════════ 3. БИЕТ ГҮЙЦЭТГЭЛ ══════════ */
      { text: '', pageBreak: 'before' },
      ...h2('3', tr('Орон сууцны багцуудын биет гүйцэтгэл'),
        tr('{0} багц, {1} блок, {2} өрх — барилга угсралтын биет хэмжигдэхүүн', num(buildPk.length), num(p.blocks), num(p.households))),
      lead(tr('Барилга угсралтын нийт биет гүйцэтгэл {0}, төлөвлөсөн {1}-тэй харьцуулахад {2} нэгж хувийн зөрүүтэй байна.{3}',
        p.actual == null ? '—' : pct(p.actual, 1),
        p.planned == null ? '—' : pct(p.planned, 1),
        gapText,
        bestPk && worstPk
          ? tr(' {0} хамгийн хурдтай ({1}), {2} хамгийн удаан ({3}) явцтай байна.',
            bestPk.name, pct(bestPk.progress ?? 0, 1), worstPk.name, pct(worstPk.progress ?? 0, 1))
          : '')),
      kpiRow([
        { label: tr('Бодит гүйцэтгэл'), value: p.actual == null ? '—' : pct(p.actual, 1), sub: p.asOf ? tr('хэмжилт {0}', p.asOf) : undefined },
        { label: tr('Төлөвлөсөн'), value: p.planned == null ? '—' : pct(p.planned, 1), sub: tr('хуваариас') },
        { label: tr('Зөрүү'), value: tr('{0} н.х', gapText), sub: p.gap == null ? undefined : p.gap >= 5 ? tr('төлөвлөгөөнөөс хоцорч байна') : p.gap < 0 ? tr('төлөвлөгөөнөөс түрүүлж байна') : tr('хуваарийн дагуу') },
      ]),
      cap(tr('Багц тус бүрийн биет гүйцэтгэл')),
      barChart(buildPk.map((k) => ({ label: k.name, value: k.progress ?? 0, text: k.progress == null ? tr('мэдээлэлгүй') : pct(k.progress, 1) })), { nameW: 110, valW: 70 }),
      { table: { headerRows: 1, widths: ['*', 60, 70, 80], body: [
        [th(tr('Багц')), th(tr('Блок'), true), th(tr('Өрх'), true), th(tr('Гүйцэтгэл'), true)],
        ...buildPk.map((k): TableCell[] => [
          td(k.name), td(num(k.blocks), true), td(num(k.households), true),
          td(k.progress == null ? tr('мэдээлэлгүй') : pct(k.progress, 1), true,
            k.progress != null && k.progress < 5 ? RED : undefined),
        ]),
        [tdBold(tr('Нийт')), tdBold(num(p.blocks), true), tdBold(num(p.households), true),
          tdBold(p.actual == null ? '—' : pct(p.actual, 1), true)],
      ] }, layout: tableLayout },
      cap(tr('Блокийн гүйцэтгэлийн түвшингийн тархалт ({0} блок)', num(p.blocks))),
      { table: { headerRows: 1, widths: ['*', 90, 60], body: [
        [th(tr('Түвшин')), th(tr('Хувь')), th(tr('Блок'), true)],
        ...p.levels.map((l): TableCell[] => [td(l.label), td(l.range), td(num(l.n), true)]),
        [td(tr('Бөглөгдөөгүй'), false, MUTED), td('—', false, MUTED), td(num(p.noData), true, MUTED)],
      ] }, layout: tableLayout },

      /* ══════════ 4. САНХҮҮЖИЛТ ══════════ */
      { text: '', pageBreak: 'before' },
      ...h2('4', tr('Гэрээт багцуудын санхүүжилт'),
        tr('{0} гэрээт багц — инженерийн шугам сүлжээ, нийгмийн дэд бүтэц зэргийг хамарна', num(f.rows.length))),
      lead(tr('Гэрээний нийт дүнгийн {0}-д санхүүжилт олгогдсон байна.{1}',
        f.share == null ? '—' : pct(f.share, 1),
        finZero.length
          ? tr(' Доор санхүүжилт эхэлсэн {0} багцыг үзүүлэв; олголт огт хийгдээгүй {1} багцыг хавсралтад жагсаав.',
            num(finStarted.length), num(finZero.length))
          : '')),
      kpiRow([
        { label: tr('Гэрээний нийт дүн'), value: money(f.planTotal), sub: `${num(f.planTotal)} ₮` },
        { label: tr('Олгосон санхүүжилт'), value: money(f.given), sub: f.share == null ? undefined : tr('гэрээний дүнгээс {0}', pct(f.share, 1)) },
        { label: tr('Олгогдоогүй үлдэгдэл'), value: money(f.remain), sub: tr('гэрээт боловч санхүүжилт хүлээгдэж буй') },
      ]),
      ...(finStarted.length ? [
        cap(tr('Санхүүжилт эхэлсэн {0} багц (олгосон дүнгээр эрэмбэлэв)', num(finStarted.length))),
        barChart(finStarted.map((r) => ({
          label: r.label, value: r.given,
          text: `${num(r.given)} ₮ · ${r.pct == null ? '—' : pct(r.pct, 1)}`,
        })), { nameW: 160, valW: 140 }),
      ] : []),
      { table: { headerRows: 1, widths: ['*', 100, 100, 46], body: [
        [th(tr('Гэрээт багц')), th(tr('Гэрээ (төг)'), true), th(tr('Олгосон (төг)'), true), th(tr('Хувь'), true)],
        ...finStarted.map((r): TableCell[] => [
          td(r.label), td(r.plan > 0 ? num(r.plan) : '—', true), td(num(r.given), true),
          td(r.pct == null ? '—' : pct(r.pct, 1), true, r.pct != null && r.pct < 10 && r.plan > 0 ? RED : undefined),
        ]),
        /* ⚠️ ЭХЛЭЭГҮЙ АЖЛУУД НЭГ МӨРӨНД — нэрс нь хавсралтад (§тайлбар) */
        ...(finZero.length ? [[
          td(tr('Эхлээгүй ажил ({0} багц)', num(finZero.length)), false, RED),
          td(num(finZero.reduce((a, r) => a + r.plan, 0)), true),
          td(num(0), true), td('0.0%', true, RED),
        ] as TableCell[]] : []),
        [tdBold(tr('Нийт')), tdBold(num(f.planTotal), true), tdBold(num(f.given), true),
          tdBold(f.share == null ? '—' : pct(f.share, 1), true)],
      ] }, layout: tableLayout },
      ...(finZero.length ? [note(tr('«Эхлээгүй ажил» гэдэг нь гэрээ байгуулагдсан боловч олголт хараахан хийгдээгүй багцууд; нэрсийг хавсралтаас үзнэ үү.'))] : []),
      note(tr('«Олгосон» нь урьдчилгаа ба гүйцэтгэлийн бүх төлбөрийн нийлбэр.')),

      /* ══════════ 5. ЗӨВШӨӨРӨЛ ══════════ */
      { text: '', pageBreak: 'before' },
      ...h2('5', tr('Зөвшөөрөл ба тусгай зөвшөөрлүүд'),
        z ? tr('{0} багцад хамаарах {1} зөвшөөрлийн явц', num(z.byBagts.length), num(z.total)) : undefined),
      ...(!z ? [note(tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул энэ хэсэг мэдээлэлгүй.'))] : [
        lead(tr('Нийт {0} зөвшөөрлийн {1} нь олгогдсон, {2} нь хариу хүлээгдэж байгаа бөгөөд {3} зөвшөөрөл татгалзагдсан байна.',
          num(z.total), num(z.ok), num(z.wait), num(z.no))),
        kpiRow([
          { label: tr('Зөвшөөрсөн'), value: `${num(z.ok)} / ${num(z.total)}`, sub: tr('нийт зөвшөөрлөөс') },
          { label: tr('Хүлээгдэж буй'), value: num(z.wait), sub: tr('хариу хүлээгдэж байна') },
          { label: tr('Зөвшөөрөөгүй'), value: num(z.no), sub: z.no > 0 ? tr('ажил эхлэхэд шууд саад') : undefined },
        ]),
        cap(tr('Багц тус бүрийн зөвшөөрлийн төлөв')),
        { table: { headerRows: 1, widths: ['*', 55, 75, 75, 75], body: [
          [th(tr('Багц')), th(tr('Нийт'), true), th(tr('Зөвшөөрсөн'), true), th(tr('Хүлээгдэж буй'), true), th(tr('Зөвшөөрөөгүй'), true)],
          ...z.byBagts.map((b): TableCell[] => [
            td(b.bagts), td(num(b.total), true), td(num(b.ok), true), td(num(b.wait), true),
            td(num(b.no + b.unknown), true, b.no + b.unknown > 0 ? RED : undefined),
          ]),
          [tdBold(tr('Нийт')), tdBold(num(z.total), true), tdBold(num(z.ok), true), tdBold(num(z.wait), true), tdBold(num(z.no + z.unknown), true)],
        ] }, layout: tableLayout } as Content,
        ...(z.issues.length ? [
          cap(tr('Анхаарал шаардах зөвшөөрлүүд')),
          { table: { headerRows: 1, widths: [64, 46, '*', 110, 78], body: [
            [th(tr('Багц')), th(tr('Шат')), th(tr('Зөвшөөрлийн төрөл')), th(tr('Байгууллага')), th(tr('Төлөв'))],
            ...z.issues.map((i): TableCell[] => [
              td(i.bagts), td(tr('{0}-р шат', num(i.shat))), td(i.ner), td(i.baiguullaga || '—'),
              td(tr(i.tolov), false, i.tolov === TOLOV.no ? RED : AMBER),
            ]),
          ] }, layout: tableLayout } as Content,
        ] : [note(tr('Бүх зөвшөөрөл зөвшөөрөгдсөн.'))]),
      ]),

      /* ══════════ 6. ДҮГНЭЛТ БА ЗӨВЛӨМЖ ══════════ */
      { text: '', pageBreak: 'before' },
      ...h2('6', summary ? tr('AI дүгнэлт') : tr('Дүгнэлт ба зөвлөмж'),
        tr('Тайланд илэрсэн гол асуудал бүрт харгалзах үйл ажиллагааны зөвлөмж')),
      ...(summary ? summaryBlocks(summary) : findingBlocks(findings, true)),

      /* ══════════ ХАВСРАЛТ ══════════ */
      ...(appendix.length || finZero.length ? [
        { text: tr('Хавсралт'), style: 'h1', pageBreak: 'before' } as Content,
        ...(finZero.length ? [
          { text: tr('Хавсралт {0}. {1}', num(1), tr('Олголт эхлээгүй {0} багц', num(finZero.length))), style: 'caption' } as Content,
          { table: { headerRows: 1, widths: ['*', 110, 100], body: [
            [th(tr('Гэрээт багц')), th(tr('Гэрээ (төг)'), true), th(tr('Олгосон (төг)'), true)],
            ...finZero.map((r): TableCell[] => [td(r.label), td(num(r.plan), true), td(num(0), true)]),
            [tdBold(tr('Нийт')), tdBold(num(finZero.reduce((a, r) => a + r.plan, 0)), true), tdBold(num(0), true)],
          ] }, layout: tableLayout } as Content,
        ] : []),
        ...appendix.flatMap((a, i): Content[] => [
          { text: tr('Хавсралт {0}. {1}', num(i + 1 + (finZero.length ? 1 : 0)), a.text), style: 'caption' },
          { ul: (a.items ?? []).map(T), style: 'findingItem' },
        ]),
      ] : []),

      note(tr('Эх сурвалж: Сэлбэ порталын Ерөнхий дашбоард · Багцын гүйцэтгэл · Багцын санхүү · Зөвшөөрөл. Тайлан үүсгэсэн огнооны байдлаар.')),
    ],
  };
}

const PDF_NAME = 'Selbe_udirdlagiin_tailan.pdf';
const PNG_NAME = 'Selbe_infografik.png';

export async function downloadExecPdf(x: ExecReport, dateStr: string, summary: string | null): Promise<void> {
  const doc = await buildExecDoc(x, dateStr, summary);
  const b64 = await renderPdfBase64(doc);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  download(PDF_NAME, new Blob([bytes], { type: 'application/pdf' }));
}

/** Инфографикийг ЗУРАГ (PNG, 2× нарийвчлал) болгож татна */
export async function downloadInfographic(x: ExecReport, dateStr: string, summary: string | null): Promise<void> {
  const png = toPng(buildInfographic(x, dateStr, execFindingBrief(x), summary), 2);
  const bytes = Uint8Array.from(atob(png.split(',')[1]), (c) => c.charCodeAt(0));
  download(PNG_NAME, new Blob([bytes], { type: 'image/png' }));
}

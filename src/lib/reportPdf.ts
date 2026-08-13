/**
 * Тайлангийн PDF — «Тайлан» хуудасны агуулгыг pdfmake-ээр вектор PDF болгоно
 * (мэйлд хавсаргах, татахад). Дэлгэц дээрх тайлантай ИЖИЛ хэсэг, ижил өгөгдөл.
 *
 * ⚠️ 2026-08-13: бэхлэгдсэн ◆ тоонууд УСТСАН — бүх утга дуудагчийн дамжуулсан
 * АМЬД багцаас (`ReportLive`) ирнэ. Тиймээс PDF нь дэлгэцтэй хэзээ ч зөрөхгүй.
 *
 * ⚠️ pdfmake-ийн өгөгдмөл Roboto фонт нь Монгол кириллийг (Ө, Ү) БҮРЭН дэмждэг
 * ч ₮ тэмдэгт байхгүй: «төг»-өөр орлуулна — эс бөгөөс квадрат (tofu) болно.
 */
import type {
  TDocumentDefinitions, Content, TableCell,
} from 'pdfmake/interfaces';
import type { BagtsRow } from '@/modules/Dashboard';
import type { LandStatus } from '@/lib/land';
import {
  liveStage,
  type Headline, type ProjectProgress, type SocialLive, type Budget,
} from '@/lib/live';
import { SCHEDULE } from '@/lib/brief';
import { num, pct } from '@/lib/format';

/** Тайланд дамжих амьд өгөгдлийн багц — Тайлан хуудас бүгдийг бэлдэж өгнө */
export type ReportLive = {
  headline: Headline;
  project: ProjectProgress;
  land: LandStatus;
  social: SocialLive;
  /** Төслийн төсөв — Cashflow /106 (олон нийтийн бүсгүй) */
  budget: Budget;
};

/** Roboto-д байхгүй тэмдэгтийг PDF-д орлуулна */
const T = (s: string) => s.replace(/₮/g, 'төг');

const HEAD = '#eef1f5';
const TOTAL = '#eaf1fb';
const LINE = '#cbd2da';

const tableLayout = {
  hLineColor: () => LINE,
  vLineColor: () => LINE,
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

/** Гарчгийн нүд */
const th = (t: string, right = false): TableCell =>
  ({ text: t, style: 'th', alignment: right ? 'right' : 'left', fillColor: HEAD });
/** Энгийн нүд */
const td = (t: string | number, right = false, fill?: string): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', ...(fill ? { fillColor: fill } : {}) });

function section(no: string, title: string, intro: string, table: Content, note?: string): Content[] {
  const out: Content[] = [
    { text: `${no}. ${title}`, style: 'h2' },
    { text: intro, style: 'intro' },
    table,
  ];
  if (note) out.push({ text: T(note), style: 'note' });
  return out;
}

/** «Тайлан» хуудасны бүрэн агуулгыг pdfmake баримт болгоно — БҮГД АМЬД */
export function buildReportDoc(rows: BagtsRow[], dateStr: string, live: ReportLive): TDocumentDefinitions {
  const { headline, project, land, social, budget } = live;
  const sorted = [...rows].sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
  const blocks = rows.reduce((a, x) => a + x.blocks, 0);
  const ail = rows.reduce((a, x) => a + x.ail, 0);
  const avg = blocks ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks : null;

  // Төсөв — Cashflow /106 (олон нийтийн бүсгүй)
  const split = budget.sources;
  const investTotal = budget.orderTotal;

  return {
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 48],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#14181c', lineHeight: 1.25 },
    styles: {
      h1: { fontSize: 18, bold: true },
      sub: { fontSize: 9, color: '#6b7280', margin: [0, 4, 0, 0] },
      h2: { fontSize: 12, bold: true, margin: [0, 15, 0, 2] },
      intro: { fontSize: 9, color: '#4a5461', margin: [0, 0, 0, 6] },
      th: { fontSize: 8, bold: true, color: '#4a5461' },
      note: { fontSize: 8, color: '#6b7280', margin: [0, 5, 0, 0] },
      foot: { fontSize: 7.5, color: '#6b7280', margin: [0, 18, 0, 0] },
    },
    footer: (page: number, count: number) => ({
      text: `Сэлбэ 20 минутын хот — Ерөнхий тайлан · ${page} / ${count}`,
      style: 'foot', alignment: 'center', margin: [0, 0, 0, 0],
    }),
    content: [
      { text: 'Сэлбэ 20 минутын хот — Ерөнхий тайлан', style: 'h1' },
      { text: `Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт · Огноо: ${dateStr}`, style: 'sub' },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1.2, lineColor: '#14181c' }] },

      ...section('1', 'Үндсэн үзүүлэлт',
        'Төслийн цар хүрээ ба нэгдсэн гүйцэтгэлийн гол үзүүлэлтүүд — ArcGIS үйлчилгээнээс ажиллах үедээ бодогдсон.',
        { table: { headerRows: 1, widths: ['*', 150], body: [
          [th('Үзүүлэлт'), th('Утга', true)],
          [td('Төслийн талбай'), td(`${num(headline.areaHa, 1)} га`, true)],
          [td('Орон сууцны блок'), td(num(blocks), true)],
          [td('Өрхийн орон сууц'), td(num(ail), true)],
          [td('Хамрагдах хүн ам'), td(num(headline.population), true)],
          [td('Төслийн нийт гүйцэтгэл'), td(pct(project.actual, 2), true)],
          [td('Нийт хөрөнгө оруулалт'), td(`${num(headline.investTotal / 1e12, 2)} их наяд төг`, true)],
        ] }, layout: tableLayout }),

      ...section('2', 'Орон сууцны 7 багц',
        'Багц тус бүрийн блок, өрх, гүйцэтгэгч ба барилга угсралтын гүйцэтгэл — гүйцэтгэлээр буурах эрэмбээр. Тоо нь ArcGIS-ээс амьдаар татагдсан.',
        { table: { headerRows: 1, widths: ['*', 42, 42, 120, 58], body: [
          [th('Багц'), th('Блок', true), th('Өрх', true), th('Гүйцэтгэгч'), th('Гүйцэтгэл', true)],
          ...sorted.map((x): TableCell[] => [
            td(x.label), td(num(x.blocks), true), td(num(x.ail), true),
            td(x.contractor), td(pct(x.progress, 2), true),
          ]),
          [td('Нийт', false, TOTAL), td(num(blocks), true, TOTAL), td(num(ail), true, TOTAL),
            td('', false, TOTAL), td(pct(avg, 2), true, TOTAL)],
        ] }, layout: tableLayout }),

      ...section('3', 'Хэрэгжилтийн үе шат',
        'Гүйцэтгэл нь «Төсөл Гүйцэтгэл» хүснэгтийн жигнэсэн дүн; амьд бүртгэлгүй үе шат «—».',
        { table: { headerRows: 1, widths: ['*', 115, 58], body: [
          [th('Үе шат'), th('Төлөв'), th('Гүйцэтгэл', true)],
          ...SCHEDULE.map((st): TableCell[] => {
            const v = liveStage(project, st.stages);
            return [
              td(`${st.no}. ${st.label}`), td(st.status),
              td(v == null ? '—' : pct(v, v >= 1 ? 1 : 0), true),
            ];
          }),
        ] }, layout: tableLayout }),

      ...section('4', 'Газар чөлөөлөлт',
        `Нийт ${num(land.total)} нэгж талбараас ${num(land.resolved)} чөлөөлөгдсөн (бүрэн ${num(land.cleared)} + цэвэрлэсэн ${num(land.cleaned)}), ${num(land.remaining)} үлдсэн — гүйцэтгэл ${pct(land.pct, 1)}. Үлдсэн нэгж талбарын шалтгааны задаргаа:`,
        { table: { headerRows: 1, widths: ['*', 60], body: [
          [th('Шалтгаан'), th('Тоо', true)],
          ...land.reasons.map((b): TableCell[] => [td(b.label), td(num(b.n), true)]),
          [td('Үлдсэн нийт', false, TOTAL), td(num(land.remaining), true, TOTAL)],
        ] }, layout: tableLayout }),

      ...section('5', 'Хөрөнгө оруулалтын бүтэц',
        'Санхүүжилтийн эх үүсвэр тус бүрийн дүн — Cashflow /106 (захирамжаар).',
        { table: { headerRows: 1, widths: ['*', 70, 110], body: [
          [th('Эх үүсвэр'), th('Хувь', true), th('Дүн (тэрбум төг)', true)],
          ...split.map((s): TableCell[] => [
            td(s.label),
            td(investTotal ? `${num((s.value / investTotal) * 100, 1)}%` : '—', true),
            td(num(s.value / 1e9, 1), true),
          ]),
          [td('Нийт', false, TOTAL), td('100%', true, TOTAL), td(num(investTotal / 1e9, 1), true, TOTAL)],
        ] }, layout: tableLayout }),

      ...section('6', 'Нийгмийн үйлчилгээний барилга',
        'Төслөөр шинээр баригдах нийгмийн үйлчилгээний байгууламж — test_data давхаргуудаас.',
        { table: { headerRows: 1, widths: ['*', 55, 90], body: [
          [th('Байгууламж'), th('Тоо', true), th('Хүчин чадал', true)],
          ...social.rows.map((row): TableCell[] => [
            td(row.label), td(num(row.n), true), td(row.capacity == null ? '—' : num(row.capacity), true),
          ]),
          [td('Нийт', false, TOTAL), td(num(social.totalN), true, TOTAL), td('', false, TOTAL)],
        ] }, layout: tableLayout }),

      ...section('7', 'Иргэдэд хүрэх үр өгөөж',
        'Төслийн иргэдэд үзүүлэх нийгэм, эдийн засгийн гол үр өгөөж.',
        { table: { headerRows: 1, widths: [110, '*'], body: [
          [th('Үзүүлэлт', true), th('Тайлбар')],
          [td(num(headline.population), true), td('иргэн шинэ, дэд бүтэц бүхий орон сууцанд амьдарна')],
          [td(`${num(ail)} өрх`, true), td('айл өрх шинэ орон сууцтай болно')],
          [td(num(social.totalN), true), td('нийгмийн үйлчилгээний барилга шинээр баригдана')],
          ...(headline.greenHa != null
            ? [[td(`${num(headline.greenHa, 1)} га`, true), td('ногоон байгууламж шинээр байгуулагдана')] as TableCell[]]
            : []),
        ] }, layout: tableLayout }),

      { text: 'Бүх үзүүлэлт ArcGIS үйлчилгээнээс ажиллах үедээ татагдсан амьд өгөгдөл. Багц тус бүрийн блок, өрх, гүйцэтгэгч, гүйцэтгэл нь барилгын давхарга + Selbe_guitsetgel_consolidated-ийн нэгдэл.',
        style: 'foot' },
    ],
  };
}

/**
 * Тайлангийн PDF — «Тайлан» хуудасны агуулгыг pdfmake-ээр вектор PDF болгоно
 * (мэйлд хавсаргах, татахад). Дэлгэц дээрх тайлантай ИЖИЛ хэсэг, ижил өгөгдөл.
 *
 * ⚠️ pdfmake-ийн өгөгдмөл Roboto фонт нь Монгол кириллийг (Ө, Ү) БҮРЭН дэмждэг
 * ч ХОЁР тэмдэгт байхгүй: ₮ (төгрөг) ба ◆. Тэдгээрийг PDF-д «төг» ба «*»-ээр
 * орлуулна — эс бөгөөс квадрат (tofu) болж гарна. Дэлгэц дээр (хөтөч) ₮/◆ хэвээр.
 */
import type {
  TDocumentDefinitions, Content, TableCell,
} from 'pdfmake/interfaces';
import type { BagtsRow } from '@/modules/Dashboard';
import { HEADLINE, OVERALL, SCHEDULE, LAND, INVEST_SPLIT, SOCIAL, BENEFITS } from '@/lib/brief';
import { num, pct } from '@/lib/format';

const bn = (v: number) => num(v / 1e9, 1);
/** Roboto-д байхгүй тэмдэгтийг PDF-д орлуулна */
const T = (s: string) => s.replace(/₮/g, 'төг').replace(/◆/g, '*');

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

/** «Тайлан» хуудасны бүрэн агуулгыг pdfmake баримт болгоно */
export function buildReportDoc(rows: BagtsRow[], dateStr: string): TDocumentDefinitions {
  const sorted = [...rows].sort((a, b) => b.budget - a.budget);
  const blocks = rows.reduce((a, x) => a + x.blocks, 0);
  const ail = rows.reduce((a, x) => a + x.ail, 0);
  const budget = rows.reduce((a, x) => a + x.budget, 0);
  const avg = blocks ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks : null;

  const investTotal = INVEST_SPLIT.reduce((a, s) => a + s.bn, 0);

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
        'Төслийн цар хүрээ ба нэгдсэн гүйцэтгэлийн гол үзүүлэлтүүд.',
        { table: { headerRows: 1, widths: ['*', 150], body: [
          [th('Үзүүлэлт'), th('Утга', true)],
          [td('Төслийн талбай'), td(`${num(HEADLINE.areaHa)} га *`, true)],
          [td('Орон сууцны блок'), td(num(HEADLINE.blocks), true)],
          [td('Өрхийн орон сууц'), td(num(HEADLINE.households), true)],
          [td('Хамрагдах хүн ам'), td(`${num(HEADLINE.population)} *`, true)],
          [td('Төслийн нийт гүйцэтгэл'), td(`${pct(OVERALL.reported, 2)} *`, true)],
          [td('Нийт хөрөнгө оруулалт'), td(`${num(HEADLINE.investBn, 1)} тэрбум төг *`, true)],
        ] }, layout: tableLayout }),

      ...section('2', 'Орон сууцны 7 багц',
        'Багц тус бүрийн блок, өрх, төсөвт өртөг ба барилга угсралтын гүйцэтгэл — төсвөөр буурах эрэмбээр. Тоо нь ArcGIS-ээс амьдаар татагдсан.',
        { table: { headerRows: 1, widths: ['*', 42, 42, 88, 58], body: [
          [th('Багц'), th('Блок', true), th('Өрх', true), th('Төсөв (тэрбум төг)', true), th('Гүйцэтгэл', true)],
          ...sorted.map((x): TableCell[] => [
            td(x.label), td(num(x.blocks), true), td(num(x.ail), true),
            td(x.budget > 0 ? bn(x.budget) : '—', true), td(pct(x.progress, 2), true),
          ]),
          [td('Нийт', false, TOTAL), td(num(blocks), true, TOTAL), td(num(ail), true, TOTAL),
            td(bn(budget), true, TOTAL), td(pct(avg, 2), true, TOTAL)],
        ] }, layout: tableLayout }),

      ...section('3', 'Хэрэгжилтийн үе шат',
        'Төслийн үндсэн зургаан үе шат ба тайлагдсан гүйцэтгэл.',
        { table: { headerRows: 1, widths: ['*', 115, 58], body: [
          [th('Үе шат'), th('Төлөв'), th('Гүйцэтгэл', true)],
          ...SCHEDULE.map((st): TableCell[] => [
            td(`${st.no}. ${st.label}`), td(st.status), td(`${pct(st.pct, st.pct >= 1 ? 1 : 0)} *`, true),
          ]),
        ] }, layout: tableLayout }),

      ...section('4', 'Газар чөлөөлөлт',
        `Нийт ${num(LAND.total)} нэгж талбараас ${num(LAND.contracted)} гэрээлэгдэж, ${num(LAND.left)} үлдсэн (гүйцэтгэл ${pct(LAND.pct, 1)}). Үлдсэн нэгж талбарын задаргаа:`,
        { table: { headerRows: 1, widths: ['*', 60], body: [
          [th('Ангилал'), th('Тоо', true)],
          ...[...LAND.breakdown].sort((a, b) => b.n - a.n).map((b): TableCell[] => [td(b.label), td(num(b.n), true)]),
          [td('Үлдсэн нийт', false, TOTAL), td(num(LAND.left), true, TOTAL)],
        ] }, layout: tableLayout },
        LAND.note),

      ...section('5', 'Хөрөнгө оруулалтын бүтэц',
        'Санхүүжилтийн эх үүсвэр тус бүрийн эзлэх хувь ба дүн. (*)',
        { table: { headerRows: 1, widths: ['*', 70, 110], body: [
          [th('Эх үүсвэр'), th('Хувь', true), th('Дүн (тэрбум төг)', true)],
          ...INVEST_SPLIT.map((s): TableCell[] => [td(s.label), td(`${num(s.pct, 1)}%`, true), td(num(s.bn, 1), true)]),
          [td('Нийт', false, TOTAL), td('100%', true, TOTAL), td(num(investTotal, 1), true, TOTAL)],
        ] }, layout: tableLayout }),

      ...section('6', 'Нийгмийн үйлчилгээний барилга',
        'Одоо байгаа ба шинээр баригдах нийгмийн үйлчилгээний байгууламж. (*)',
        { table: { headerRows: 1, widths: ['*', 65, 65, 50], body: [
          [th('Байгууламж'), th('Одоо', true), th('Шинэ', true), th('Нийт', true)],
          ...SOCIAL.rows.map((row): TableCell[] => [td(row.label), td(row.now, true), td(row.add, true), td(num(row.total), true)]),
          [td('Нийт', false, TOTAL), td(SOCIAL.totals.now, true, TOTAL), td(SOCIAL.totals.add, true, TOTAL), td(num(SOCIAL.totals.total), true, TOTAL)],
        ] }, layout: tableLayout },
        SOCIAL.note),

      ...section('7', 'Иргэдэд хүрэх үр өгөөж',
        'Төслийн иргэдэд үзүүлэх нийгэм, эдийн засгийн гол үр өгөөж.',
        { table: { headerRows: 1, widths: [110, '*'], body: [
          [th('Үзүүлэлт', true), th('Тайлбар')],
          ...BENEFITS.map((b): TableCell[] => [td(`${b.value}${b.unit ? ` ${b.unit}` : ''}`, true), td(b.text)]),
        ] }, layout: tableLayout }),

      { text: '* тэмдэгтэй үзүүлэлт нь илтгэлээс бэхлэгдсэн (Танилцуулга 2026.07.09); бусад нь ArcGIS-ээс амьдаар татагдсан. Багц тус бүрийн блок, өрх, төсөв, гүйцэтгэл нь building_GOL + BUS_cashflow + Selbe_guitsetgel_consolidated-ийн нэгдэл.',
        style: 'note', margin: [0, 16, 0, 0] },
    ],
  };
}

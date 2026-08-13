/**
 * Тайлангийн PDF — «Тайлан» хуудасны агуулгыг pdfmake-ээр вектор PDF болгоно
 * (мэйлд хавсаргах, татахад). Дэлгэц дээрх тайлантай ИЖИЛ хэсэг, ижил өгөгдөл.
 *
 * ⚠️ pdfmake-ийн өгөгдмөл Roboto фонт нь Монгол кириллийг (Ө, Ү) БҮРЭН дэмждэг
 * ч ₮ (төгрөг) тэмдэгт БАЙХГҮЙ. Түүнийг PDF-д «төг»-өөр орлуулна — эс бөгөөс
 * квадрат (tofu) болж гарна. Дэлгэц дээр (хөтөч) ₮ хэвээр.
 *
 * ⚠️ Энэ баримт `Tailan.tsx`-ийн ТОЛИН ХУВИЛБАР: хэсгийн дугаар, гарчиг,
 * хүснэгтийн дугаар ба багана бүр ижил. Аль нэгэнд нь хэсэг нэмбэл нөгөөд нь
 * ЗААВАЛ хамт нэмнэ — эс бөгөөс мэйлээр явсан PDF дэлгэцээс зөрнө.
 *
 * ⚠️ БЭХЛЭГДСЭН ТОО АГУУЛАХГҮЙ (`@/lib/brief` импортлохгүй). Бүх үзүүлэлт
 * `ReportExtra` + багцын амьд хүснэгтээс ирнэ. Товч танилцуулга ба дүгнэлт нь
 * `buildFindings()`-ээс — дэлгэцтэй ЯГ ижил өгүүлбэр.
 */
import type {
  TDocumentDefinitions, Content, TableCell,
} from 'pdfmake/interfaces';
import type { BagtsRow } from '@/modules/Dashboard';
import { buildFindings, type ReportExtra } from '@/lib/reportData';
import { num, pct } from '@/lib/format';

const bn = (v: number) => num(v / 1e9, 1);
/** Тэг өртөг = «нэгж үнэ загварт ороогүй» — 0 гэж бичихгүй */
const bnOrDash = (v: number) => (v > 0 ? bn(v) : '—');

const HEAD = '#eef1f5';
const TOTAL = '#eaf1fb';
const LINE = '#cbd2da';
const LEAD_BG = '#f4f6f9';

/** Roboto-д байхгүй тэмдэгтийг PDF-д орлуулна */
const T = (s: string) => s.replace(/₮/g, 'төг');

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

/** Товч танилцуулгын хүрээ — зөвхөн зүүн ирмэгийн зураас */
const leadLayout = {
  hLineWidth: () => 0,
  vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
  vLineColor: () => '#14181c',
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 8,
  paddingBottom: () => 8,
};

/** Гарчгийн нүд */
const th = (t: string, right = false): TableCell =>
  ({ text: t, style: 'th', alignment: right ? 'right' : 'left', fillColor: HEAD });
/** Энгийн нүд */
const td = (t: string | number, right = false, fill?: string): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', ...(fill ? { fillColor: fill } : {}) });

function section(no: string, title: string, intro: string): Content[] {
  return [
    { text: `${no}. ${title}`, style: 'h2' },
    { text: T(intro), style: 'intro' },
  ];
}

/** Хүснэгтийн дугаартай тайлбар — ХҮСНЭГТИЙН ДЭЭД талд (дэлгэцтэй ижил) */
const cap = (no: string, t: string): Content =>
  ({ text: T(`Хүснэгт ${no}. ${t}`), style: 'caption' });

const note = (t: string): Content => ({ text: T(t), style: 'note' });

/** «Тайлан» хуудасны бүрэн агуулгыг pdfmake баримт болгоно */
export function buildReportDoc(
  rows: BagtsRow[], dateStr: string, extra: ReportExtra,
): TDocumentDefinitions {
  const { overall, land, social, progress, finance, infra, habea } = extra;
  const d = buildFindings(extra);

  const sorted = [...rows].sort((a, b) => b.budget - a.budget);
  const blocks = rows.reduce((a, x) => a + x.blocks, 0);
  const ail = rows.reduce((a, x) => a + x.ail, 0);
  const budget = rows.reduce((a, x) => a + x.budget, 0);
  const bagtsAvg = blocks
    ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks
    : null;
  const srcTotal = finance.sources.reduce((a, s) => a + s.value, 0);

  /* ── Товч танилцуулга — дэлгэцийн `.lead` блоктой ижил гурван догол ── */
  const lead = [
    `Сэлбэ 20 минутын хотын төслийн хэрэгжилт тайлан үүсгэх өдрийн байдлаар ${pct(overall.pct, 2)}-тай байна. Төслийн жингийн ${pct(d.buildWeight, 1)}-ийг эзэлдэг барилга угсралтын ажил ${pct(d.buildActual, 2)}-ийн гүйцэтгэлтэй${d.buildLag != null ? ` буюу төлөвлөгөөнөөс ${num(d.buildLag, 1)} нэгж хувиар хоцорч байна` : ''}. Газар чөлөөлөлтийн гүйцэтгэл${land.pct != null ? ` ${pct(land.pct, 1)}` : ''} байгаа ч ${num(d.landLeft)} нэгж талбар шийдвэрлэгдээгүй үлдсэн байна.`,
    `Санхүүгийн хувьд захирамжаар ${bn(finance.orderTotal)} тэрбум ₮ батлагдсанаас ${bn(finance.contractAmount)} тэрбум${d.contractRate != null ? ` (${pct(d.contractRate, 1)})` : ''} нь гэрээгээр баталгаажиж, ${bn(finance.paid)} тэрбум${d.paidRate != null ? ` (${pct(d.paidRate, 1)})` : ''} нь бодитоор олгогдсон байна.`,
    `Барилгын талбайд ${num(habea.workers)} ажилтан, ${num(habea.tehnik)} нэгж техник ажиллаж байгаа бөгөөд орон сууцны ${num(blocks)} блок, ${num(ail)} өрхийн орон сууц баригдаж байна.`,
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 48],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#14181c', lineHeight: 1.25 },
    styles: {
      h1: { fontSize: 18, bold: true },
      sub: { fontSize: 9, color: '#6b7280', margin: [0, 4, 0, 0] },
      h2: { fontSize: 12, bold: true, margin: [0, 15, 0, 2] },
      intro: { fontSize: 9, color: '#4a5461', margin: [0, 0, 0, 2] },
      th: { fontSize: 8, bold: true, color: '#4a5461' },
      note: { fontSize: 8, color: '#6b7280', margin: [0, 5, 0, 0] },
      caption: { fontSize: 8.5, bold: true, color: '#4a5461', margin: [0, 10, 0, 4] },
      lead: { fontSize: 9, color: '#2c333b', lineHeight: 1.45 },
      finding: { fontSize: 9, color: '#2c333b', margin: [0, 0, 0, 6] },
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

      /* ── Товч танилцуулга ── */
      {
        margin: [0, 14, 0, 4],
        table: {
          widths: ['*'],
          body: [[{
            fillColor: LEAD_BG,
            stack: lead.map((t, i) => ({ text: T(t), style: 'lead', margin: [0, i ? 6 : 0, 0, 0] })),
          }]],
        },
        layout: leadLayout,
      },

      ...section('1', 'Үндсэн үзүүлэлт',
        'Энэ хэсэгт төслийн цар хүрээ, гүйцэтгэл, санхүүжилтийн долоон гол үзүүлэлтийг нэгтгэв. Гүйцэтгэлийн хоёр өөр хэмжүүрийг ялган үзэх нь зүйтэй: төслийн нийт гүйцэтгэл нь бүх үе шатыг жин харгалзан тооцсон дүн бол барилга угсралтын гүйцэтгэл нь зөвхөн орон сууцны блокуудыг хамарна.'),
      cap('1', 'Төслийн нэгдсэн үзүүлэлт'),
      { table: { headerRows: 1, widths: ['*', 160], body: [
        [th('Үзүүлэлт'), th('Утга', true)],
        [td('Орон сууцны блок'), td(num(blocks), true)],
        [td('Өрхийн орон сууц'), td(num(ail), true)],
        [td('Төслийн нийт гүйцэтгэл'), td(pct(overall.pct, 2), true)],
        [td('Барилга угсралтын гүйцэтгэл'), td(pct(progress.overall, 2), true)],
        [td('Захирамжаар батлагдсан дүн'), td(`${bn(finance.orderTotal)} тэрбум ₮`, true)],
        [td('Гэрээгээр байгуулагдсан дүн'), td(`${bn(finance.contractAmount)} тэрбум ₮`, true)],
        [td('Бодитоор олгосон санхүүжилт', false, TOTAL), td(`${bn(finance.paid)} тэрбум ₮`, true, TOTAL)],
      ] }, layout: tableLayout },
      note(`Төслийн нийт гүйцэтгэл нь хэрэгжилтийн ${num(overall.rows)} ажлыг жин харгалзан тооцсон дүн (3-р хэсэг); барилга угсралтын гүйцэтгэл нь хяналтын ${num(progress.blocks)} блокийн дундаж (6-р хэсэг).`),

      ...section('2', 'Орон сууцны 7 багц',
        `Орон сууцны барилгажилт долоон багцад хуваагдан хэрэгжиж байна. Нийт ${num(blocks)} блокт ${num(ail)} өрхийн орон сууц төлөвлөгдсөн бөгөөд төсөвт өртөг ${bn(budget)} тэрбум ₮ байна. Багц хоорондын гүйцэтгэлийн зөрүү их байна: хамгийн өндөр нь ${d.bestBagts?.bagts ?? '—'} (${pct(d.bestBagts?.pct ?? null, 2)}), хамгийн бага нь ${d.worstBagts?.bagts ?? '—'} (${pct(d.worstBagts?.pct ?? null, 2)}).`),
      cap('2', 'Багц тус бүрийн блок, өрх, төсөв ба гүйцэтгэл (төсөвт өртгөөр буурах эрэмбээр)'),
      { table: { headerRows: 1, widths: ['*', 42, 42, 88, 58], body: [
        [th('Багц'), th('Блок', true), th('Өрх', true), th('Төсөв (тэрбум төг)', true), th('Гүйцэтгэл', true)],
        ...sorted.map((x): TableCell[] => [
          td(x.label), td(num(x.blocks), true), td(num(x.ail), true),
          td(x.budget > 0 ? bn(x.budget) : '—', true), td(pct(x.progress, 2), true),
        ]),
        [td('Нийт', false, TOTAL), td(num(blocks), true, TOTAL), td(num(ail), true, TOTAL),
          td(bn(budget), true, TOTAL), td(pct(bagtsAvg, 2), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('3', 'Хэрэгжилтийн үе шат',
        `Төсөл нь бэлтгэлээс барилга угсралт хүртэл зургаан үе шаттай. Үе шат бүр төсөлд эзлэх өөрийн жинтэй тул нийт гүйцэтгэл нь энгийн дундаж биш, жин харгалзан тооцсон дүн болно.${d.heavyStage ? ` Одоогийн байдлаар төслийн жингийн ${pct(d.heavyStage.weight, 1)}-ийг «${d.heavyStage.label}» үе шат эзэлж байгаа тул нийт гүйцэтгэл голчлон түүнээс хамаарч байна.` : ''}`),
      cap('3', 'Үе шатны эзлэх жин, бодит гүйцэтгэл ба төлөвлөгөө'),
      { table: { headerRows: 1, widths: ['*', 44, 66, 66, 66], body: [
        [th('Үе шат'), th('Ажил', true), th('Эзлэх жин', true), th('Гүйцэтгэл', true), th('Төлөвлөгөө', true)],
        ...overall.stages.map((s): TableCell[] => [
          td(s.label), td(num(s.rows), true), td(pct(s.weight, 2), true),
          td(pct(s.actual, 2), true), td(s.planned == null ? '—' : pct(s.planned, 1), true),
        ]),
        [td('Нийт', false, TOTAL), td(num(overall.rows), true, TOTAL), td(pct(overall.weightSum, 2), true, TOTAL),
          td(pct(overall.pct, 2), true, TOTAL), td('—', true, TOTAL)],
      ] }, layout: tableLayout },
      note(`Эзлэх жингийн нийлбэр ${pct(overall.weightSum, 2)} — эх хүснэгтэд бүх ажил бүртгэгдээгүй тул нийт гүйцэтгэлийг жингийн нийлбэрт харьцуулан тооцов. Төлөвлөгөө бөглөөгүй үе шатыг «—» тэмдгээр илэрхийлэв.`),

      ...section('4', 'Газар чөлөөлөлт',
        `Төслийн талбайд нийт ${num(land.parcels)} нэгж талбар (${num(land.areaM2)} м²) бүртгэгдсэн бөгөөд үе шатны гүйцэтгэл ${land.pct != null ? pct(land.pct, 1) : '—'} байна. Ажлын үндсэн хэсэг дууссан ч ${num(d.landLeft)} нэгж талбар шийдвэрлэгдээгүй хэвээр байгаа нь барилга угсралтын хуваарьт нөлөөлөх эрсдэлтэй.`),
      cap('4.1', 'Нэгж талбарын төлөв'),
      { table: { headerRows: 1, widths: ['*', 90, 80], body: [
        [th('Төлөв'), th('Нэгж талбар', true), th('Эзлэх хувь', true)],
        ...land.byStatus.map((s): TableCell[] => [
          td(s.label), td(num(s.n), true),
          td(land.parcels ? pct((s.n / land.parcels) * 100, 1) : '—', true),
        ]),
        [td('Нийт', false, TOTAL), td(num(land.parcels), true, TOTAL), td('100%', true, TOTAL)],
      ] }, layout: tableLayout },

      ...(land.byReason.length ? [
        cap('4.2', `Шийдвэрлэгдээгүй нэгж талбарын шалтгаан${d.topReason ? ` — тэргүүлэх шалтгаан «${d.topReason.label}»` : ''}`),
        { table: { headerRows: 1, widths: ['*', 90], body: [
          [th('Шалтгаан'), th('Нэгж талбар', true)],
          ...land.byReason.map((s): TableCell[] => [td(s.label), td(num(s.n), true)]),
        ] }, layout: tableLayout } as Content,
      ] : []),

      ...section('5', 'Нийгмийн үйлчилгээний барилга',
        `Орон сууцны хорооллыг дагалдан ерөнхий төлөвлөгөөнд ${num(social.n)} нийгмийн үйлчилгээний байгууламж, нийт барилгын талбай ${num(social.areaM2)} м² тусгагдсан байна. Эдгээр нь сургууль, цэцэрлэг, төрийн үйлчилгээ, хүүхдийн хөгжлийн байгууламжийг хамарна.`),
      cap('5', 'Нийгмийн үйлчилгээний байгууламжийн жагсаалт'),
      { table: { headerRows: 1, widths: ['*', 60, 100], body: [
        [th('Байгууламж'), th('Тоо', true), th('Талбай (м²)', true)],
        ...social.rows.map((s): TableCell[] => [
          td(s.title), td(num(s.n), true), td(s.areaM2 > 0 ? num(s.areaM2) : '—', true),
        ]),
        [td('Нийт', false, TOTAL), td(num(social.n), true, TOTAL), td(num(social.areaM2), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('6', 'Барилга угсралтын гүйцэтгэл',
        `Хяналтын ${num(progress.blocks)} блокийн ажлын үе шат тус бүрийн гүйцэтгэлээс тооцсон дундаж ${pct(progress.overall, 2)} байна${progress.date ? ` (сүүлийн тайлагнал ${progress.date})` : ''}.${d.startedPhases.length ? ` Одоогоор «${d.startedPhases.join('», «')}» үе шат эхэлсэн` : ''}${d.notStartedPhases.length ? ` бөгөөд үлдсэн ${num(d.notStartedPhases.length)} үе шат хараахан эхлээгүй байна` : ''}.`),
      cap('6.1', 'Багц тус бүрийн барилга угсралтын гүйцэтгэл'),
      { table: { headerRows: 1, widths: ['*', 60, 80], body: [
        [th('Багц'), th('Блок', true), th('Гүйцэтгэл', true)],
        ...progress.byBagts.map((b): TableCell[] => [
          td(b.bagts), td(num(b.blocks), true), td(pct(b.pct, 2), true),
        ]),
        [td('Нийт', false, TOTAL), td(num(progress.blocks), true, TOTAL), td(pct(progress.overall, 2), true, TOTAL)],
      ] }, layout: tableLayout },

      cap('6.2', 'Ажлын үе шат тус бүрийн дундаж гүйцэтгэл'),
      { table: { headerRows: 1, widths: ['*', 90], body: [
        [th('Үе шат'), th('Дундаж гүйцэтгэл', true)],
        ...progress.phases.map((p): TableCell[] => [td(`${p.no}. ${p.name}`), td(pct(p.pct, 2), true)]),
      ] }, layout: tableLayout },

      cap('6.3', 'Гүйцэтгэл хамгийн бага арван блок — анхаарал шаардсан ажлууд'),
      { table: { headerRows: 1, widths: ['*', 90, 80], body: [
        [th('Багц'), th('Блок'), th('Гүйцэтгэл', true)],
        ...progress.slowest.map((b): TableCell[] => [td(b.bagts), td(b.block), td(pct(b.pct, 2), true)]),
      ] }, layout: tableLayout },
      note('Дундаж нь блок бүрийг тэнцүү жинтэйгээр тооцсон; 2-р хэсгийн багцын гүйцэтгэлтэй нэг эх сурвалжаас гарна.'),

      ...section('7', 'Санхүүжилтийн явц',
        `Захирамж, гэрээгээр баталгаажсан ${num(finance.rows)} ажлын санхүүжилт дөрвөн эх үүсвэрээс бүрдэж байна.${d.topSource ? ` Санхүүжилтийн дийлэнх хэсгийг «${d.topSource.label}» эх үүсвэр бүрдүүлж, нийт дүнгийн ${pct(d.topSource.share, 1)}-ийг эзэлж байна.` : ''}`),
      cap('7.1', 'Санхүүжилтийн эх үүсвэрийн бүтэц'),
      { table: { headerRows: 1, widths: ['*', 110, 70], body: [
        [th('Эх үүсвэр'), th('Дүн (тэрбум төг)', true), th('Хувь', true)],
        ...finance.sources.map((s): TableCell[] => [
          td(s.label), td(bn(s.value), true), td(srcTotal ? pct((s.value / srcTotal) * 100, 1) : '—', true),
        ]),
        [td('Нийт', false, TOTAL), td(bn(srcTotal), true, TOTAL), td('100%', true, TOTAL)],
      ] }, layout: tableLayout },

      cap('7.2', `Сар бүрийн олголт ба хуримтлагдсан дүн${d.peakMonth ? ` — хамгийн их олголт ${d.peakMonth.label} сард` : ''}`),
      { table: { headerRows: 1, widths: ['*', 120, 110], body: [
        [th('Сар'), th('Олгосон (тэрбум төг)', true), th('Хуримтлагдсан', true)],
        ...finance.months.map((m): TableCell[] => [
          td(m.label), td(m.amount > 0 ? bn(m.amount) : '—', true), td(bn(m.cum), true),
        ]),
      ] }, layout: tableLayout },

      cap('7.3', 'Ажлын төрлөөр — төсөв ба гэрээний дүн'),
      { table: { headerRows: 1, widths: ['*', 45, 78, 78], body: [
        [th('Төрөл'), th('Ажил', true), th('Төсөв', true), th('Гэрээ', true)],
        ...finance.byType.map((t): TableCell[] => [
          td(t.type), td(num(t.n), true), td(bnOrDash(t.budget), true), td(bnOrDash(t.contract), true),
        ]),
        [td('Нийт', false, TOTAL), td(num(finance.rows), true, TOTAL),
          td(bn(finance.budget), true, TOTAL), td(bn(finance.contractAmount), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('8', 'Дэд бүтцийн хэрэгжилт',
        `Ерөнхий төлөвлөгөөний ${num(infra.totals.layers)} давхаргад ${num(infra.totals.n)} объект бүртгэгдсэн бөгөөд шугам сүлжээний нийт урт ${num(infra.totals.len)} м, талбайн хэмжээ ${num(infra.totals.area)} м² байна. Өртгийн загвараар тооцсон дүн ${bn(infra.totals.cost)} тэрбум ₮ байна.`),
      cap('8', 'Ажлын бүлэг тус бүрийн объект, хэмжээ ба төсөвт өртөг'),
      { table: { headerRows: 1, widths: ['*', 44, 52, 62, 72, 62], body: [
        [th('Ажлын бүлэг'), th('Дав.', true), th('Объект', true), th('Урт (м)', true), th('Талбай (м²)', true), th('Өртөг (тэрбум)', true)],
        ...infra.groups.map((g): TableCell[] => [
          td(g.title), td(num(g.layers), true), td(num(g.n), true),
          td(g.len > 0 ? num(g.len) : '—', true), td(g.area > 0 ? num(g.area) : '—', true),
          td(bnOrDash(g.cost), true),
        ]),
        [td('Нийт', false, TOTAL), td(num(infra.totals.layers), true, TOTAL), td(num(infra.totals.n), true, TOTAL),
          td(num(infra.totals.len), true, TOTAL), td(num(infra.totals.area), true, TOTAL), td(bnOrDash(infra.totals.cost), true, TOTAL)],
      ] }, layout: tableLayout },
      note('Өртгийн загвар нь нэгж үнэ батлагдсан бүлгүүдийг л хамарна — «—» тэмдэглэгээ нь өртөг тэг гэсэн үг биш, тухайн бүлэгт нэгж үнэ тогтоогоогүйг илэрхийлнэ.'),

      ...section('9', 'Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй',
        `${habea.date ? `${habea.date}-ны байдлаар ` : ''}барилгын талбайд ${num(habea.workers)} ажилтан (дотоодын ${num(habea.mongol)}, гадаадын ${num(habea.gadaad)}), ${num(habea.tehnik)} нэгж техник ажиллаж байна. Дотоодын ажиллах хүч нийт ажиллагсдын ${pct(d.mongolShare, 1)}-ийг эзэлж байна.`),
      cap('9', 'Гүйцэтгэгч байгууллага тус бүрийн хүн хүч, техник'),
      { table: { headerRows: 1, widths: ['*', 62, 58, 52, 52, 52], body: [
        [th('Гүйцэтгэгч'), th('Багц'), th('Ажилтан', true), th('Дотоод', true), th('Гадаад', true), th('Техник', true)],
        ...habea.byCompany.map((c): TableCell[] => [
          td(c.label), td(c.bagts ?? '—'), td(num(c.workers), true),
          td(num(c.mongol), true), td(num(c.gadaad), true), td(num(c.tehnik), true),
        ]),
        [td('Нийт', false, TOTAL), td('—', false, TOTAL), td(num(habea.workers), true, TOTAL),
          td(num(habea.mongol), true, TOTAL), td(num(habea.gadaad), true, TOTAL), td(num(habea.tehnik), true, TOTAL)],
      ] }, layout: tableLayout },
      note(`Бүртгэлийн эхнээс хойш нийт ${num(habea.incidents)} осол, зөрчил бүртгэгдсэн байна. Хүн хүчний тоо нь өдөр тутмын хуримтлагдсан үзүүлэлт биш, сүүлийн бүртгэлийн агшны байдлыг илэрхийлнэ.`),

      ...section('10', 'Дүгнэлт, анхаарах асуудал',
        'Дээрх өгөгдөлд тулгуурлан анхаарал шаардсан дараах асуудлыг тодруулав.'),
      { ul: d.findings.map((t) => T(t)), style: 'finding', margin: [0, 4, 0, 0] },

    ],
  };
}

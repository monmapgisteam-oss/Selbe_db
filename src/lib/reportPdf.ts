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
import { t as tr } from '@/lib/i18nCore';
import { buildFindings, type ReportExtra } from '@/lib/reportData';
import { num, pct } from '@/lib/format';

const bn = (v: number) => num(v / 1e9, 1);
/**
 * ⚠️ ЗӨВХӨН Cashflow-ийн `budget`/`contract` дүнд хэрэглэнэ: тэг нь «төсөвт
 * өртөг хараахан батлагдаагүй / гэрээ байгуулагдаагүй» гэсэн утгатай тул 0
 * гэж бичвэл «үнэгүй ажил» мэт уншигдана — «—» болгоно.
 */
const bnOrDash = (v: number) => (v > 0 ? bn(v) : '—');

const HEAD = '#eef1f5';
const TOTAL = '#eaf1fb';
const LINE = '#cbd2da';
const LEAD_BG = '#f4f6f9';

/** Roboto-д байхгүй тэмдэгтийг PDF-д орлуулна */
const T = (s: string) => s.replace(/₮/g, tr('төг'));

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
  ({ text: T(tr('Хүснэгт {0}. {1}', no, t)), style: 'caption' });

const note = (t: string): Content => ({ text: T(t), style: 'note' });

/** «Тайлан» хуудасны бүрэн агуулгыг pdfmake баримт болгоно */
export function buildReportDoc(
  rows: BagtsRow[], dateStr: string, extra: ReportExtra,
): TDocumentDefinitions {
  const { overall, land, social, progress, finance, infra, habea } = extra;
  const d = buildFindings(extra);

  /* ⚠️ Багцын төсөв нь `BagtsRow`-оос БИШ, `extra.finance.byBagts`-аас — дэлгэц
     (`Tailan.tsx`) ба PDF нэг эх сурвалжтай байна. Шалтгааныг `reportData.ts`. */
  const budgetOf = (k: string) => extra.finance.byBagts[k] ?? 0;
  const sorted = [...rows].sort((a, b) => budgetOf(b.key) - budgetOf(a.key));
  const blocks = rows.reduce((a, x) => a + x.blocks, 0);
  const ail = rows.reduce((a, x) => a + x.ail, 0);
  const budget = rows.reduce((a, x) => a + budgetOf(x.key), 0);
  const bagtsAvg = blocks
    ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks
    : null;
  const srcTotal = finance.sources.reduce((a, s) => a + s.value, 0);

  /* ── Товч танилцуулга — дэлгэцийн `.lead` блоктой ижил гурван догол ──
     ⚠️ Газар чөлөөлөлтийн хувьд «нэгж талбарын төлвөөр» шошго ЗААВАЛ: энэ хувь
     нь давхаргын Tuluv талбараас (шийдвэрлэгдсэн ÷ нийт) бодогддог бөгөөд бусад дашбоардын
     амьд кадастрын хувиас зөрдөг (land.ts-ийн тайлбар). */
  const lead = [
    tr('Сэлбэ 20 минутын хотын төслийн хэрэгжилт тайлан үүсгэх өдрийн байдлаар {0}-тай байна. Төслийн төсвийн {1}-ийг эзэлдэг барилга угсралтын ажил {2}-ийн гүйцэтгэлтэй{3}. Газар чөлөөлөлтийн гүйцэтгэл нэгж талбарын төлвөөр{4} байгаа ч {5} нэгж талбар шийдвэрлэгдээгүй үлдсэн байна.', pct(overall.pct, 2), pct(d.buildWeight, 1), pct(d.buildActual, 2), d.buildLag != null ? tr(' буюу төлөвлөгөөнөөс {0} нэгж хувиар хоцорч байна', num(d.buildLag, 1)) : '', land.pct != null ? ` ${pct(land.pct, 1)}` : '', num(d.landLeft)),
    tr('Санхүүгийн хувьд захирамжаар {0} тэрбум ₮ батлагдсанаас {1} тэрбум{2} нь гэрээгээр баталгаажиж, {3} тэрбум{4} нь бодитоор олгогдсон байна.', bn(finance.orderTotal), bn(finance.contractAmount), d.contractRate != null ? ` (${pct(d.contractRate, 1)})` : '', bn(finance.paid), d.paidRate != null ? ` (${pct(d.paidRate, 1)})` : ''),
    tr('Барилгын талбайд {0} ажилтан, {1} нэгж техник ажиллаж байгаа бөгөөд орон сууцны {2} блок, {3} өрхийн орон сууц баригдаж байна.', num(habea.workers), num(habea.tehnik), num(blocks), num(ail)),
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
      text: tr('Сэлбэ 20 минутын хот — Ерөнхий тайлан · {0} / {1}', page, count),
      style: 'foot', alignment: 'center', margin: [0, 0, 0, 0],
    }),
    content: [
      { text: tr('Сэлбэ 20 минутын хот — Ерөнхий тайлан'), style: 'h1' },
      { text: tr('Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт · Огноо: {0}', dateStr), style: 'sub' },
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

      ...section('1', tr('Үндсэн үзүүлэлт'),
        tr('Энэ хэсэгт төслийн цар хүрээ, гүйцэтгэл, санхүүжилтийн долоон гол үзүүлэлтийг нэгтгэв. Гүйцэтгэлийн хоёр өөр хэмжүүрийг ялган үзэх нь зүйтэй: төслийн нийт гүйцэтгэл нь багц бүрийг төсвийн жингээр нь тооцсон дүн бол барилга угсралтын гүйцэтгэл нь блокуудын энгийн дундаж.')),
      cap('1', tr('Төслийн нэгдсэн үзүүлэлт')),
      { table: { headerRows: 1, widths: ['*', 160], body: [
        [th(tr('Үзүүлэлт')), th(tr('Утга'), true)],
        [td(tr('Орон сууцны блок')), td(num(blocks), true)],
        [td(tr('Өрхийн орон сууц')), td(num(ail), true)],
        [td(tr('Төслийн нийт гүйцэтгэл')), td(pct(overall.pct, 2), true)],
        [td(tr('Барилга угсралтын гүйцэтгэл')), td(pct(progress.overall, 2), true)],
        [td(tr('Захирамжаар батлагдсан дүн')), td(tr('{0} тэрбум ₮', bn(finance.orderTotal)), true)],
        [td(tr('Гэрээгээр байгуулагдсан дүн')), td(tr('{0} тэрбум ₮', bn(finance.contractAmount)), true)],
        [td(tr('Бодитоор олгосон санхүүжилт'), false, TOTAL), td(tr('{0} тэрбум ₮', bn(finance.paid)), true, TOTAL)],
      ] }, layout: tableLayout },
      note(tr('Төслийн нийт гүйцэтгэл нь {0} блокийг багцынх нь төсвийн жингээр тооцсон дүн (3-р хэсэг); барилга угсралтын гүйцэтгэл нь хяналтын {1} блокийн энгийн дундаж (6-р хэсэг).', num(overall.rows), num(progress.blocks))),

      ...section('2', tr('Орон сууцны 7 багц'),
        tr('Орон сууцны барилгажилт долоон багцад хуваагдан хэрэгжиж байна. Нийт {0} блокт {1} өрхийн орон сууц төлөвлөгдсөн бөгөөд төсөвт өртөг {2} тэрбум ₮ байна. Багц хоорондын гүйцэтгэлийн зөрүү их байна: хамгийн өндөр нь {3} ({4}), хамгийн бага нь {5} ({6}).', num(blocks), num(ail), bn(budget), d.bestBagts?.bagts ?? '—', pct(d.bestBagts?.pct ?? null, 2), d.worstBagts?.bagts ?? '—', pct(d.worstBagts?.pct ?? null, 2))),
      cap('2', tr('Багц тус бүрийн блок, өрх, төсөв ба гүйцэтгэл (төсөвт өртгөөр буурах эрэмбээр)')),
      { table: { headerRows: 1, widths: ['*', 42, 42, 88, 58], body: [
        [th(tr('Багц')), th(tr('Блок'), true), th(tr('Өрх'), true), th(tr('Төсөв (тэрбум төг)'), true), th(tr('Гүйцэтгэл'), true)],
        ...sorted.map((x): TableCell[] => [
          td(tr(x.label)), td(num(x.blocks), true), td(num(x.ail), true),
          td(budgetOf(x.key) > 0 ? bn(budgetOf(x.key)) : '—', true), td(pct(x.progress, 2), true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(blocks), true, TOTAL), td(num(ail), true, TOTAL),
          td(bn(budget), true, TOTAL), td(pct(bagtsAvg, 2), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('3', tr('Багцын жигнэсэн гүйцэтгэл'),
        tr('Багц бүр төслийн төсөвт эзлэх өөрийн жинтэй тул нийт гүйцэтгэл нь энгийн дундаж биш, жин харгалзан тооцсон дүн болно.{0}', d.heavyStage ? tr(' Одоогийн байдлаар төслийн төсвийн {0}-ийг «{1}» багц эзэлж байгаа тул нийт гүйцэтгэл голчлон түүнээс хамаарч байна.', pct(d.heavyStage.weight, 1), tr(d.heavyStage.label)) : '')),
      cap('3', tr('Багцын эзлэх жин ба бодит гүйцэтгэл')),
      { table: { headerRows: 1, widths: ['*', 44, 66, 66, 66], body: [
        [th(tr('Багц')), th(tr('Блок'), true), th(tr('Эзлэх жин'), true), th(tr('Гүйцэтгэл'), true), th(tr('Төлөвлөгөө'), true)],
        ...overall.stages.map((s): TableCell[] => [
          td(tr(s.label)), td(num(s.rows), true), td(pct(s.weight, 2), true),
          td(pct(s.actual, 2), true), td(s.planned == null ? '—' : pct(s.planned, 1), true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(overall.rows), true, TOTAL), td(pct(overall.weightSum, 2), true, TOTAL),
          td(pct(overall.pct, 2), true, TOTAL), td('—', true, TOTAL)],
      ] }, layout: tableLayout },
      note(tr('Эзлэх жингийн нийлбэр {0} — гүйцэтгэл хараахан бүртгэгдээгүй багц байгаа тул нийт дүнг жингийн нийлбэрт харьцуулан тооцов. Багцын түвшинд төлөвлөгөөт хувь одоогоор байхгүй тул «—» тэмдгээр илэрхийлэв.', pct(overall.weightSum, 2))),

      ...section('4', tr('Газар чөлөөлөлт'),
        tr('Төслийн талбайд нийт {0} нэгж талбар ({1} м²) бүртгэгдсэн бөгөөд шийдвэрлэгдсэн нь {2} байна. Ажлын үндсэн хэсэг дууссан ч {3} нэгж талбар шийдвэрлэгдээгүй хэвээр байгаа нь барилга угсралтын хуваарьт нөлөөлөх эрсдэлтэй.', num(land.parcels), num(land.areaM2), land.pct != null ? pct(land.pct, 1) : '—', num(d.landLeft))),
      cap('4.1', tr('Нэгж талбарын төлөв')),
      { table: { headerRows: 1, widths: ['*', 90, 80], body: [
        [th(tr('Төлөв')), th(tr('Нэгж талбар'), true), th(tr('Эзлэх хувь'), true)],
        ...land.byStatus.map((s): TableCell[] => [
          td(tr(s.label)), td(num(s.n), true),
          td(land.parcels ? pct((s.n / land.parcels) * 100, 1) : '—', true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(land.parcels), true, TOTAL), td('100%', true, TOTAL)],
      ] }, layout: tableLayout },

      ...(land.byReason.length ? [
        cap('4.2', tr('Шийдвэрлэгдээгүй нэгж талбарын шалтгаан{0}', d.topReason ? tr(' — тэргүүлэх шалтгаан «{0}»', tr(d.topReason.label)) : '')),
        { table: { headerRows: 1, widths: ['*', 90], body: [
          [th(tr('Шалтгаан')), th(tr('Нэгж талбар'), true)],
          ...land.byReason.map((s): TableCell[] => [td(tr(s.label)), td(num(s.n), true)]),
        ] }, layout: tableLayout } as Content,
      ] : []),

      ...section('5', tr('Нийгмийн үйлчилгээний барилга'),
        tr('Орон сууцны хорооллыг дагалдан ерөнхий төлөвлөгөөнд {0} нийгмийн үйлчилгээний байгууламж, нийт барилгын талбай {1} м² тусгагдсан байна. Эдгээр нь сургууль, цэцэрлэг, төрийн үйлчилгээ, хүүхдийн хөгжлийн байгууламжийг хамарна.', num(social.n), num(social.areaM2))),
      cap('5', tr('Нийгмийн үйлчилгээний байгууламжийн жагсаалт')),
      { table: { headerRows: 1, widths: ['*', 60, 100], body: [
        [th(tr('Байгууламж')), th(tr('Тоо'), true), th(tr('Талбай (м²)'), true)],
        ...social.rows.map((s): TableCell[] => [
          td(s.title), td(num(s.n), true), td(s.areaM2 > 0 ? num(s.areaM2) : '—', true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(social.n), true, TOTAL), td(num(social.areaM2), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('6', tr('Барилга угсралтын гүйцэтгэл'),
        tr('Хяналтын {0} блокийн ажлын үе шат тус бүрийн гүйцэтгэлээс тооцсон дундаж {1} байна{2}.{3}{4}.', num(progress.blocks), pct(progress.overall, 2), progress.date ? tr(' (сүүлийн тайлагнал {0})', progress.date) : '', d.startedPhases.length ? tr(' Одоогоор «{0}» үе шат эхэлсэн', d.startedPhases.join('», «')) : '', d.notStartedPhases.length ? tr(' бөгөөд үлдсэн {0} үе шат хараахан эхлээгүй байна', num(d.notStartedPhases.length)) : '')),
      cap('6.1', tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')),
      { table: { headerRows: 1, widths: ['*', 60, 80], body: [
        [th(tr('Багц')), th(tr('Блок'), true), th(tr('Гүйцэтгэл'), true)],
        ...progress.byBagts.map((b): TableCell[] => [
          td(b.bagts), td(num(b.blocks), true), td(pct(b.pct, 2), true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(progress.blocks), true, TOTAL), td(pct(progress.overall, 2), true, TOTAL)],
      ] }, layout: tableLayout },

      cap('6.2', tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')),
      { table: { headerRows: 1, widths: ['*', 90], body: [
        [th(tr('Үе шат')), th(tr('Дундаж гүйцэтгэл'), true)],
        ...progress.phases.map((p): TableCell[] => [td(`${p.no}. ${p.name}`), td(pct(p.pct, 2), true)]),
      ] }, layout: tableLayout },

      cap('6.3', tr('Гүйцэтгэл хамгийн бага арван блок — анхаарал шаардсан ажлууд')),
      { table: { headerRows: 1, widths: ['*', 90, 80], body: [
        [th(tr('Багц')), th(tr('Блок')), th(tr('Гүйцэтгэл'), true)],
        ...progress.slowest.map((b): TableCell[] => [td(b.bagts), td(b.block), td(pct(b.pct, 2), true)]),
      ] }, layout: tableLayout },
      note(tr('Дундаж нь блок бүрийг тэнцүү жинтэйгээр тооцсон; 2-р хэсгийн багцын гүйцэтгэлтэй нэг эх сурвалжаас гарна.')),

      ...section('7', tr('Санхүүжилтийн явц'),
        tr('Захирамж, гэрээгээр баталгаажсан {0} ажлын санхүүжилт дөрвөн эх үүсвэрээс бүрдэж байна.{1}', num(finance.rows), d.topSource ? tr(' Санхүүжилтийн дийлэнх хэсгийг «{0}» эх үүсвэр бүрдүүлж, нийт дүнгийн {1}-ийг эзэлж байна.', tr(d.topSource.label), pct(d.topSource.share, 1)) : '')),
      cap('7.1', tr('Санхүүжилтийн эх үүсвэрийн бүтэц')),
      { table: { headerRows: 1, widths: ['*', 110, 70], body: [
        [th(tr('Эх үүсвэр')), th(tr('Дүн (тэрбум төг)'), true), th(tr('Хувь'), true)],
        ...finance.sources.map((s): TableCell[] => [
          td(tr(s.label)), td(bn(s.value), true), td(srcTotal ? pct((s.value / srcTotal) * 100, 1) : '—', true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(bn(srcTotal), true, TOTAL), td('100%', true, TOTAL)],
      ] }, layout: tableLayout },

      /* ⚠️ CASHFLOW2-ийн сарын цуваа нь санхүүжилтийн ХУВААРЬ (төлөвлөгөө) —
         «олгосон» гэж шошговол бодит олголтоос олон дахин их худал тоо
         хэвлэгдэнэ (reportData.ts). Дэлгэц (Tailan.tsx)-тэй ижил шошго. */
      cap('7.2', tr('Сар бүрийн санхүүжилтийн хуваарь (төлөвлөгөө) ба хуримтлагдсан дүн{0}', d.peakMonth ? tr(' — хамгийн их төлөвлөгөө {0} сард', tr(d.peakMonth.label)) : '')),
      { table: { headerRows: 1, widths: ['*', 120, 110], body: [
        [th(tr('Сар')), th(tr('Төлөвлөгөө (тэрбум төг)'), true), th(tr('Хуримтлагдсан'), true)],
        ...finance.months.map((m): TableCell[] => [
          td(tr(m.label)), td(m.amount > 0 ? bn(m.amount) : '—', true), td(bn(m.cum), true),
        ]),
      ] }, layout: tableLayout },
      note(tr('Хүснэгт нь гэрээ бүрийн санхүүжилтийн хуваарь буюу төлөвлөгөө; бодитоор олгосон санхүүжилтийг IPC актын дүнгээр 1-р хүснэгтэд харуулав.')),

      cap('7.3', tr('Ажлын төрлөөр — төсөв ба гэрээний дүн')),
      { table: { headerRows: 1, widths: ['*', 45, 78, 78], body: [
        [th(tr('Төрөл')), th(tr('Ажил'), true), th(tr('Төсөв'), true), th(tr('Гэрээ'), true)],
        ...finance.byType.map((t): TableCell[] => [
          td(t.type), td(num(t.n), true), td(bnOrDash(t.budget), true), td(bnOrDash(t.contract), true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(finance.rows), true, TOTAL),
          td(bn(finance.budget), true, TOTAL), td(bn(finance.contractAmount), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('8', tr('Дэд бүтцийн хэрэгжилт'),
        tr('Ерөнхий төлөвлөгөөний {0} давхаргад {1} объект бүртгэгдсэн бөгөөд шугам сүлжээний нийт урт {2} м, талбайн хэмжээ {3} м² байна.', num(infra.totals.layers), num(infra.totals.n), num(infra.totals.len), num(infra.totals.area))),
      cap('8', tr('Ажлын бүлэг тус бүрийн объект ба хэмжээ')),
      { table: { headerRows: 1, widths: ['*', 44, 52, 62, 72], body: [
        [th(tr('Ажлын бүлэг')), th(tr('Дав.'), true), th(tr('Объект'), true), th(tr('Урт (м)'), true), th(tr('Талбай (м²)'), true)],
        ...infra.groups.map((g): TableCell[] => [
          td(g.title), td(num(g.layers), true), td(num(g.n), true),
          td(g.len > 0 ? num(g.len) : '—', true), td(g.area > 0 ? num(g.area) : '—', true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(infra.totals.layers), true, TOTAL), td(num(infra.totals.n), true, TOTAL),
          td(num(infra.totals.len), true, TOTAL), td(num(infra.totals.area), true, TOTAL)],
      ] }, layout: tableLayout },

      ...section('9', tr('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'),
        tr('{0}барилгын талбайд {1} ажилтан (дотоодын {2}, гадаадын {3}), {4} нэгж техник ажиллаж байна. Дотоодын ажиллах хүч нийт ажиллагсдын {5}-ийг эзэлж байна.', habea.date ? tr('{0}-ны байдлаар ', habea.date) : '', num(habea.workers), num(habea.mongol), num(habea.gadaad), num(habea.tehnik), pct(d.mongolShare, 1))),
      cap('9', tr('Гүйцэтгэгч байгууллага тус бүрийн хүн хүч, техник')),
      { table: { headerRows: 1, widths: ['*', 62, 58, 52, 52, 52], body: [
        [th(tr('Гүйцэтгэгч')), th(tr('Багц')), th(tr('Ажилтан'), true), th(tr('Дотоод'), true), th(tr('Гадаад'), true), th(tr('Техник'), true)],
        ...habea.byCompany.map((c): TableCell[] => [
          td(tr(c.label)), td(tr(c.bagts ?? '—')), td(num(c.workers), true),
          td(num(c.mongol), true), td(num(c.gadaad), true), td(num(c.tehnik), true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td('—', false, TOTAL), td(num(habea.workers), true, TOTAL),
          td(num(habea.mongol), true, TOTAL), td(num(habea.gadaad), true, TOTAL), td(num(habea.tehnik), true, TOTAL)],
      ] }, layout: tableLayout },
      note(tr('Бүртгэлийн эхнээс хойш нийт {0} осол, зөрчил бүртгэгдсэн байна. Хүн хүчний тоо нь өдөр тутмын хуримтлагдсан үзүүлэлт биш, сүүлийн бүртгэлийн агшны байдлыг илэрхийлнэ.', num(habea.incidents))),

      ...section('10', tr('Дүгнэлт, анхаарах асуудал'),
        tr('Дээрх өгөгдөлд тулгуурлан анхаарал шаардсан дараах асуудлыг тодруулав.')),
      { ul: d.findings.map((t) => T(t)), style: 'finding', margin: [0, 4, 0, 0] },

    ],
  };
}

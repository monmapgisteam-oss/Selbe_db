/**
 * САР БҮРИЙН IPC БАРИМТ — PDF (pdfmake) (2026-09-29).
 *
 * ⚠️ ХЭЛБЭР = `docs/ipc barimt`-ийн скан баримтууд (хэрэглэгч: «яг ийм форматаар pdf
 *    татаж авна»): A4 хэвтээ, гурван хуудас —
 *      1. Хүснэгт 7   (санхүүжилтийн хүснэгт)
 *      2. Гүйцэтгэл-1 (зардлын төрлөөр)
 *      3. Хавсралт №12 (блокоор)
 *    Гарчиг, багана, мөрийн нэр, гарын үсгийн хэсэг скан баримтынхаар.
 * ⚠️ БАРИМТЫН ТЕКСТ МОНГОЛООР, `tr()`-ГҮЙ: энэ нь албан маягт — UI-ийн хэл англи байсан ч
 *    баримт монгол хэвээр (скан загвартай ижил). Цонхны текст нь `tr()`-ээр (IpcDocDialog).
 * ⚠️ ТОО: Хүснэгт 7 — 2 оронтой бутархай; Гүйцэтгэл-1 ба Хавсралт 12 — бүхэл төгрөг
 *    (скан баримтынхаар). Хоосон (`null`) нүд «-» — 0 гэж бичихгүй.
 * ⚠️ Roboto-д ₮ байхгүй — нэгж бичихгүй (скан баримтад ч бичигдээгүй).
 */
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import type { IpcDoc, IpcNote, G1Row, T7Row, H12Row } from '@/lib/ipcDoc';

/** Баримтын доорх тайлбар — монгол маягт (`tr()`-гүй, файлын толгойн ⚠️) */
const NOTE_MN: Record<IpcNote, string> = {
  noPrev: 'Системд өмнөх сарын агшин алга — тайлант үеийн гүйцэтгэл нь эхнээсээ хуримтлагдсан дүн.',
  noAdvance: 'ХО-д урьдчилгааны бүртгэл алга — урьдчилгаа ба эргэн төлөлт 0.',
  negative: 'Энэ сарын гүйцэтгэл өмнөх сараас буурсан (засвар) — сөрөг дүн.',
  over: 'Хуримтлагдсан гүйцэтгэл гэрээний дүнгээс давсан.',
};

/** Гарын үсэг зурах хүмүүс — хоосон бол цэгтэй зураас л */
export type IpcSigners = {
  approve: string;
  ceo: string;
  chiefAcc: string;
  hoSpec: string;
  pmoHead: string;
  pmoDept: string;
  pm: string;
  cDir: string;
  cAcc: string;
  cEng: string;
};
export const EMPTY_SIGNERS: IpcSigners = {
  approve: '', ceo: '', chiefAcc: '', hoSpec: '', pmoHead: '', pmoDept: '', pm: '', cDir: '', cAcc: '', cEng: '',
};

export type IpcMeta = {
  /** «71 айлын 9-н давхар барилга, 12 блок» — системд байхгүй, гараар */
  capacity: string;
  signers: IpcSigners;
};

const CUSTOMER = '"Сэлбэ хорин минутын хот корпорац" ХХК';
const APPROVER = 'НИЙСЛЭЛИЙН ЗАСАГ ДАРГЫН ТАМГЫН ГАЗРЫН ХӨРӨНГӨ ОРУУЛАЛТЫН ХЭЛТСИЙН ДАРГА';

/* ── Тоо, огноо ── */
/* ⚠️ Хүснэгт 7-д ЯГ 0 нь «-» (скан баримтын маягт: суутгаагүй/олгоогүй нүд зураастай).
   Энэ нь ЗӨВХӨН харуулалт — тооцоонд `null` ба 0 ялгаатай хэвээр (`ipcDoc`). */
const f2 = (x: number | null) => (x == null || Math.abs(x) < 0.005 ? '-' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const f0 = (x: number | null) => (x == null ? '-' : Math.round(x).toLocaleString('en-US'));
const pc = (x: number | null, of: number | null) =>
  x == null || of == null || of === 0 ? '-' : `${((x / of) * 100).toFixed(2)}%`;
const d = (ms: number | null) => (ms == null ? '-' : new Date(ms).toISOString().slice(0, 10).replace(/-/g, '.'));
const sig = (name: string) => (name.trim() ? `/${name.trim()}/` : '/................................/');

const TH = { bold: true, fontSize: 7, alignment: 'center' as const, fillColor: '#eeeeee' };
/* ⚠️ pdfmake-ийн төрлүүд colSpan/rowSpan-ийн хоосон нүд ба margin tuple-д хэт нарийн — нүдийг
   энгийн объектоор угсраад хүснэгт/агуулгын түвшинд нэг удаа хөрвүүлнэ. */
type Obj = Record<string, unknown>;
const cell = (text: string, o: Obj = {}): Obj => ({ text, fontSize: 7, ...o });
const numCell = (text: string, bold = false, shade = false): Obj =>
  cell(text, { alignment: 'right', bold, ...(shade ? { fillColor: '#f2e4d8' } : {}) });

/**
 * Төсөл арга хэмжээний нэр — ХО-ийн `tosol_ner` нь аль хэдийн бүтэн («"Сэлбэ … багц-3.2"
 * Барилга угсралтын ажил»); байхгүй бол багцын нэрээр.
 */
const projectName = (doc: IpcDoc) => {
  const p = doc.input.project.trim();
  return p && p !== doc.input.pkgName ? p : `${doc.input.pkgName} барилга угсралтын ажил`;
};

/* ── Толгой ── */
function approveBlock(meta: IpcMeta): Obj {
  return {
    stack: [
      { text: 'БАТЛАВ:', bold: true, fontSize: 8 },
      { columns: [
        { text: APPROVER, bold: true, fontSize: 8, width: 'auto' },
        { text: `  ......................  ${sig(meta.signers.approve)}`, fontSize: 8, width: '*' },
      ] },
    ],
    margin: [0, 0, 0, 6],
  };
}

function infoLines(lines: [string, string][], right: string[]): Obj {
  return {
    columns: [
      { width: '*', stack: lines.map(([k, v], i) => ({ text: [{ text: `${i + 1}. ${k}: ` }, { text: v, bold: true }], fontSize: 8, margin: [0, 1, 0, 1] })) },
      { width: 'auto', stack: right.map((t, i) => ({ text: t, fontSize: 8, bold: i > 0, alignment: 'right' })) },
    ],
    margin: [0, 0, 0, 6],
  };
}

/* ── Гарын үсэг — Гүйцэтгэл-1 ба Хавсралт 12 ── */
function perfSigners(doc: IpcDoc, meta: IpcMeta): Obj {
  const s = meta.signers;
  const row = (role: string, name: string) => ({ columns: [
    { text: role, fontSize: 7, width: 110 },
    { text: `......................  ${sig(name)}`, fontSize: 7, width: '*' },
  ], margin: [0, 3, 0, 0] });
  /* ⚠️ `unbreakable` (2026-09-29, хэрэглэгч: «гарын үсэг 2 хуудсанд салсан»): олон блоктой
     багцад (Багц 2 — 44 блок) Хавсралт 12 хуудасны төгсгөлд хүрч, гарын үсгийн гурван
     багана хоёр хуудсанд тасардаг байв. Бүтнээрээ багтахгүй бол ДАРААГИЙН хуудас руу. */
  return { unbreakable: true, stack: [{
    columns: [
      { width: '*', stack: [
        { text: 'Гүйцэтгэлийг хүлээн авч хянасан:', fontSize: 7 },
        { text: 'ЗАХИАЛАГЧ БАЙГУУЛЛАГА-ыг төлөөлж:', bold: true, fontSize: 7, margin: [0, 4, 0, 0] },
        { text: 'НЗДТГазар Санхүү, хөрөнгө оруулалтын газар', bold: true, fontSize: 7 },
        row('Хөрөнгө оруулалтын хэлтсийн мэргэжилтэн', s.hoSpec),
      ] },
      { width: '*', stack: [
        { text: ' ', fontSize: 7 },
        { text: 'ЗАХИАЛАГЧИЙН ХЯНАЛТЫН БАЙГУУЛЛАГА-ыг төлөөлж:', bold: true, fontSize: 7, margin: [0, 4, 0, 0] },
        { text: CUSTOMER, bold: true, fontSize: 7 },
        row('Төслийн удирдлагын газрын дарга', s.pmoHead),
        row('Төслийн удирдлагын хэлтсийн дарга', s.pmoDept),
        row('Төслийн менежер', s.pm),
      ] },
      { width: '*', stack: [
        { text: 'Гүйцэтгэлийг гаргаж, хүлээлгэн өгсөн:', fontSize: 7, alignment: 'right' },
        { text: 'ГҮЙЦЭТГЭГЧ-ийг төлөөлж:', bold: true, fontSize: 7, margin: [0, 4, 0, 0] },
        { text: doc.input.contractor || '-', bold: true, fontSize: 7 },
        row('Захирал', s.cDir),
        row('Нягтлан бодогч', s.cAcc),
        row('Инженер', s.cEng),
      ] },
    ],
    columnGap: 12,
    margin: [0, 8, 0, 0],
  }] };
}

/* ══════════════ 1. Хүснэгт 7 ══════════════ */
function page7(doc: IpcDoc, meta: IpcMeta): Obj[] {
  const inp = doc.input;
  const s = meta.signers;
  const body: Obj[][] = [[
    cell('Зардлын нэр төрөл', TH), cell('Гэрээний дүн', TH), cell('Тухайн онд батлагдсан санхүүжилт', TH),
    cell('Нийт гүйцэтгэл', TH), cell('Нийт санхүүжилт', TH), cell('Өмнөх санхүүжилт', TH),
    cell('Одоо санхүүжих', TH), cell('Үлдэгдэл санхүүжилт', TH),
  ]];
  doc.t7.forEach((r: T7Row, i) => {
    body.push([
      cell(r.label, { bold: r.bold, alignment: r.bold ? 'center' : 'left' }),
      numCell(f2(r.contract), r.bold),
      /* «Тухайн онд батлагдсан» — нэг нүд бүх мөрөөр (скан баримтынхаар) */
      i === 0
        ? ({ ...cell(f2(inp.annual), { alignment: 'center', bold: true }), rowSpan: doc.t7.length })
        : ({}),
      numCell(f2(r.perf), r.bold),
      numCell(f2(r.fin), r.bold),
      numCell(f2(r.prev), r.bold),
      numCell(f2(r.now), r.bold),
      numCell(f2(r.remain), r.bold),
    ]);
  });
  const signer = (role: string, name: string) => ({ columns: [
    { text: role, fontSize: 8, width: 190 },
    { text: `......................  ${sig(name)}`, fontSize: 8, width: '*' },
  ], margin: [0, 5, 0, 0] });
  return [
    { text: 'Хүснэгт 7', alignment: 'right', fontSize: 8 },
    approveBlock(meta),
    { text: 'УЛСЫН ТӨСВИЙН ХӨРӨНГӨ ОРУУЛАЛТААС САНХҮҮЖҮҮЛЭХ БАРИЛГА УГСРАЛТЫН АЖЛЫН САНХҮҮЖИЛТИЙН ХҮСНЭГТ', bold: true, fontSize: 10, alignment: 'center', margin: [0, 2, 0, 8] },
    infoLines(
      [['Төсөл арга хэмжээний нэр', projectName(doc)], ['Гэрээний дугаар', inp.contractNo || '-'], ['Огноо', d(doc.periodTo)]],
      ['Гүйцэтгэгч', inp.contractor || '-'],
    ),
    { table: { headerRows: 1, widths: [150, '*', 80, '*', '*', '*', '*', '*'], body }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5 } },
    /* ⚠️ Гарын үсгийн хэсэг ТАСРАХГҮЙ (`unbreakable`) — `perfSigners`-ийн ⚠️ */
    { unbreakable: true, stack: [
      { text: 'Боловсруулсан:', fontSize: 8, margin: [0, 10, 0, 0] },
      { text: 'Захиалагчийг төлөөлж:', fontSize: 8, margin: [0, 4, 0, 0] },
      { text: CUSTOMER, fontSize: 8, margin: [12, 0, 0, 0] },
      { stack: [signer('Гүйцэтгэх захирал:', s.ceo), signer('Ерөнхий нягтлан бодогч:', s.chiefAcc)], margin: [160, 0, 0, 0] },
      { text: 'НЗДТГазар Санхүү, хөрөнгө оруулалтын газрын', fontSize: 8, margin: [0, 8, 0, 0] },
      { stack: [signer('Хөрөнгө оруулалтын хэлтсийн мэргэжилтэн', s.hoSpec)], margin: [160, 0, 0, 0] },
    ] },
  ];
}

/* ══════════════ 2. Гүйцэтгэл-1 ══════════════ */
function pageG1(doc: IpcDoc, meta: IpcMeta): Obj[] {
  const inp = doc.input;
  const head1: Obj[] = [
    { ...cell('Зардлын нэр, төрөл', TH), rowSpan: 2 },
    { ...cell('Гэрээний дүн', TH), rowSpan: 2 },
    { ...cell('Ажил эхэлснээс хойших гүйцэтгэл', TH), colSpan: 2 }, {},
    { ...cell('Урьд авсан санхүүжилт', TH), colSpan: 2 }, {},
    { ...cell('Тайлант үеийн гүйцэтгэл', TH), colSpan: 2 }, {},
    { ...cell('Захиалагчийн хяналтын хянасан дүн', TH), rowSpan: 2 },
    { ...cell('Захиалагч хянасан дүн', TH), rowSpan: 2 },
    { ...cell('Үлдэгдэл санхүүжилт', TH), colSpan: 2 }, {},
  ];
  const head2: Obj[] = [
    {}, {},
    cell('Дүн', TH), cell('Хувь', TH), cell('Дүн', TH), cell('Хувь', TH), cell('Дүн', TH), cell('Хувь', TH),
    {}, {},
    cell('Дүн', TH), cell('Хувь', TH),
  ];
  const last = doc.g1[doc.g1.length - 1];
  const body: Obj[][] = [head1, head2, ...doc.g1.map((r: G1Row) => [
    cell(r.label, { bold: r.bold, alignment: r.bold ? 'center' : 'left', ...(r.shade ? { fillColor: '#f2e4d8' } : {}) }),
    numCell(f0(r.contract), r.bold, r.shade),
    numCell(f0(r.cum), r.bold, r.shade), numCell(pc(r.cum, r.contract), r.bold, r.shade),
    numCell(f0(r.prev), r.bold, r.shade), numCell(pc(r.prev, r.contract), r.bold, r.shade),
    numCell(f0(r.now), r.bold, r.shade), numCell(pc(r.now, r.contract), r.bold, r.shade),
    /* Захиалагчийн хяналтын хянасан дүн — БҮГД ДҮН мөрөнд л (скан баримтынхаар) */
    numCell(r === last ? f0(r.now) : '', r.bold, r.shade),
    numCell('', r.bold, r.shade),
    numCell(f0(r.remain), r.bold, r.shade), numCell(pc(r.remain, r.contract), r.bold, r.shade),
  ])];
  return [
    { text: `БАРИЛГА УГСРАЛТ, ИХ ЗАСВАРЫН АЖЛЫН ГҮЙЦЭТГЭЛ - 1   ${doc.docNo}`, bold: true, fontSize: 10, alignment: 'center', decoration: 'underline', margin: [0, 0, 0, 6] },
    approveBlock(meta),
    infoLines(
      [
        ['Төсөл, арга хэмжээний нэр', projectName(doc)],
        ['Хүчин чадал', meta.capacity || `${inp.blocks.length} блок`],
        ['Гэрээний дугаар', inp.contractNo || '-'],
        ['Эхлэх ба дуусах', `${d(inp.contractStart)} - ${d(inp.contractEnd)}`],
        ['Гүйцэтгэл гаргасан хугацаа', `${d(doc.periodFrom)} - ${d(doc.periodTo)}`],
      ],
      ['Гүйцэтгэгч', inp.contractor || '-'],
    ),
    {
      table: { headerRows: 2, widths: [130, '*', '*', 32, '*', 32, '*', 32, '*', '*', '*', 36], body },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    },
    perfSigners(doc, meta),
  ];
}

/* ══════════════ 3. Хавсралт №12 ══════════════ */
function pageH12(doc: IpcDoc, meta: IpcMeta): Obj[] {
  const inp = doc.input;
  const g = (t: string, span: number) => [{ ...cell(t, TH), colSpan: span }, ...Array.from({ length: span - 1 }, () => ({}))];
  const rs = (t: string) => ({ ...cell(t, TH), rowSpan: 2 });
  const head1: Obj[] = [
    rs('Ажлын нэр, төрөл'), ...g('Төлөвлөгөө', 4), rs('Ажил эхэлснээс хойших гүйцэтгэл'), rs('Урьд авсан санхүүжилт'),
    ...g('Бодит гүйцэтгэл', 4), rs('Захиалагчийн хяналтын хянасан дүн'), rs('Захиалагч хянасан дүн'), rs('Үлдэгдэл санхүүжилт'),
  ];
  const head2: Obj[] = [
    {},
    cell('Эхлэх', TH), cell('Дуусах', TH), cell('Өдөр', TH), cell('Нийт зардал', TH),
    {}, {},
    cell('Эхэлсэн', TH), cell('Дууссан', TH), cell('Өдөр', TH), cell('Нийт зардал', TH),
    {}, {}, {},
  ];
  const c = (t: string) => cell(t, { alignment: 'center' });
  const rows: Obj[][] = doc.h12.map((r: H12Row) => [
    cell(`${r.label} барилга`),
    c(d(r.planStart)), c(d(r.planEnd)), c(r.planDays == null ? '-' : String(r.planDays)), numCell(f0(r.planCost)),
    numCell(f0(r.cum)), numCell(f0(r.prev)),
    c(d(r.actStart)), c(d(r.actEnd)), c(r.actDays == null ? '-' : String(r.actDays)), numCell(f0(r.now)),
    numCell(''), numCell(''), numCell(f0(r.remain)),
  ]);
  const t = doc.h12Total;
  rows.push([
    { ...cell('Дүн', { bold: true, alignment: 'center' }), colSpan: 4 }, {}, {}, {},
    numCell(f0(t.planCost), true), numCell(f0(t.cum), true), numCell(f0(t.prev), true),
    numCell(''), numCell(''), numCell(''), numCell(f0(t.now), true),
    numCell(''), numCell(''), numCell(f0(t.remain), true),
  ]);
  return [
    { columns: [
      { text: `БАРИЛГА УГСРАЛТ, ИХ ЗАСВАРЫН АЖЛЫН ГҮЙЦЭТГЭЛ-1   ${doc.docNo}`, bold: true, fontSize: 10, decoration: 'underline', width: '*' },
      { stack: [{ text: 'Хавсралт №12', fontSize: 8, alignment: 'right' }, { text: `Гүйцэтгэгч: ${inp.contractor || '-'}`, fontSize: 8, bold: true, alignment: 'right' }], width: 'auto' },
    ], margin: [0, 0, 0, 6] },
    approveBlock(meta),
    infoLines(
      [
        ['Төсөл, арга хэмжээний нэр', projectName(doc)],
        ['Хүчин чадал', meta.capacity || `${inp.blocks.length} блок`],
        ['Гэрээний дугаар', inp.contractNo || '-'],
        ['Төслийн хугацаа', `${d(inp.contractStart)} - ${d(inp.contractEnd)}`],
        ['Гүйцэтгэл гаргасан хугацаа', `${d(doc.periodFrom)} - ${d(doc.periodTo)}`],
      ],
      [],
    ),
    {
      table: { headerRows: 2, widths: [60, 42, 42, 26, '*', '*', '*', 42, 42, 24, '*', '*', '*', '*'], body: [head1, head2, ...rows] },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    },
    perfSigners(doc, meta),
  ];
}

export function ipcPdfDoc(doc: IpcDoc, meta: IpcMeta): TDocumentDefinitions {
  const notes: Obj[] = doc.notes.length
    ? [{ text: doc.notes.map((n) => `* ${NOTE_MN[n]}`).join('\n'), fontSize: 6, color: '#777777', margin: [0, 6, 0, 0] }]
    : [];
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 22, 24, 22],
    defaultStyle: { fontSize: 8 },
    info: { title: doc.docNo },
    content: [
      ...page7(doc, meta), ...notes,
      { text: '', pageBreak: 'after' },
      ...pageG1(doc, meta), ...notes,
      { text: '', pageBreak: 'after' },
      ...pageH12(doc, meta), ...notes,
    ] as unknown as Content[],
  };
}

/** Файлын нэр — «IPC_P0302-001_2026-09.pdf» */
export const ipcFileName = (doc: IpcDoc) =>
  `IPC_${doc.input.pkgCode}-${String(doc.input.ipcNo).padStart(3, '0')}_${doc.month}.pdf`;

export async function downloadIpcPdf(doc: IpcDoc, meta: IpcMeta): Promise<void> {
  const { renderPdfBase64, download } = await import('@/lib/emailReport');
  const b64 = await renderPdfBase64(ipcPdfDoc(doc, meta));
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  download(ipcFileName(doc), new Blob([bytes], { type: 'application/pdf' }));
}

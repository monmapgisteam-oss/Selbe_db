/**
 * УДИРДЛАГЫН ТАЙЛАН — PDF (pdfmake). 2–4 хуудас:
 *   1. Инфографик (нэг хуудас зураг — `execInfographic.ts`)
 *   2. Гол дүгнэлт (AI байвал AI, эс бөгөөс дүрэмд суурилсан) + 01. KPI
 *   3. 05. Багцын гүйцэтгэл · 04. Багцын санхүү
 *   4. Зөвшөөрөл · ажлын төрөл
 *
 * ⚠️ Өгөгдөл нь ЗӨВХӨН `ExecReport` — дэлгэц (`ExecReport.tsx`)-тэй ижил тоо.
 * ⚠️ Roboto фонтод ₮ БАЙХГҮЙ — `reportPdf.ts`-тэй ижил дүрмээр «төг» болгоно.
 * ⚠️ Загвар (өнгө, зай, хүснэгтийн layout) нь `reportPdf.ts`-ийн ерөнхий
 *    тайлантай НЭГ гэр бүл — хоёр PDF нэг байгууллагаас гарсан мэт харагдана.
 */
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { execFindings, type ExecReport } from '@/lib/execReport';
import { TOLOV } from '@/lib/zovshoorol';
import { PARCEL_CLEARED } from '@/lib/services';
import { buildInfographic, toPng, money, INFO_W, INFO_H } from '@/lib/execInfographic';
import { renderPdfBase64, download } from '@/lib/emailReport';

const HEAD = '#eef1f5';
const TOTAL = '#eaf1fb';
const LINE = '#cbd2da';
const LEAD_BG = '#f4f6f9';
const WARN_BG = '#fdf3d7';
const BAD_BG = '#fde2e2';

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
const leadLayout = {
  hLineWidth: () => 0,
  vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
  vLineColor: () => '#2e7f8b',
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 8,
  paddingBottom: () => 8,
};

const th = (t: string, right = false): TableCell =>
  ({ text: t, style: 'th', alignment: right ? 'right' : 'left', fillColor: HEAD });
const td = (t: string | number, right = false, fill?: string): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', ...(fill ? { fillColor: fill } : {}) });

const h2 = (no: string, title: string): Content => ({ text: `${no}. ${title}`, style: 'h2' });
const cap = (t: string): Content => ({ text: T(t), style: 'caption' });
const note = (t: string): Content => ({ text: T(t), style: 'note' });

/** KPI хавтангийн мөр — 3 багана */
function kpiRow(items: { label: string; value: string; sub?: string }[]): Content {
  return {
    columns: items.map((k) => ({
      width: '*',
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: k.label, fontSize: 7.5, color: '#5a6a80' },
            { text: T(k.value), fontSize: 13, bold: true, margin: [0, 3, 0, 0] },
            ...(k.sub ? [{ text: T(k.sub), fontSize: 7.5, color: '#5a6a80', margin: [0, 2, 0, 0] } as Content] : []),
          ],
          fillColor: LEAD_BG,
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
    })),
    columnGap: 8,
    margin: [0, 6, 0, 8],
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

export async function buildExecDoc(
  x: ExecReport, dateStr: string, summary: string | null,
): Promise<TDocumentDefinitions> {
  const findings = execFindings(x);
  /* ⚠️ Canvas 2D-ээр ШУУД (SVG→<img> замгүй) — тайлбарыг `execInfographic.ts`-ээс */
  const infoPng = toPng(buildInfographic(x, dateStr, findings, summary), 1);
  const g = x.gdash;
  const p = x.prog;
  const f = x.fin;
  const z = x.zov;

  const gapText = p.gap == null ? '—' : `${p.gap >= 0 ? '−' : '+'}${num(Math.abs(p.gap), 1)}`;
  const buildPk = p.packs.filter((k) => k.kind === 'build');

  return {
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 48],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#14181c', lineHeight: 1.25 },
    styles: {
      h1: { fontSize: 18, bold: true },
      sub: { fontSize: 9, color: '#6b7280', margin: [0, 4, 0, 0] },
      h2: { fontSize: 12, bold: true, margin: [0, 15, 0, 4] },
      h3: { fontSize: 9.5, bold: true, margin: [0, 6, 0, 2] },
      th: { fontSize: 8, bold: true, color: '#4a5461' },
      note: { fontSize: 8, color: '#6b7280', margin: [0, 5, 0, 0] },
      caption: { fontSize: 8.5, bold: true, color: '#4a5461', margin: [0, 10, 0, 4] },
      lead: { fontSize: 9, color: '#2c333b', lineHeight: 1.45 },
      finding: { fontSize: 9, color: '#2c333b', margin: [0, 0, 0, 6] },
      foot: { fontSize: 7.5, color: '#6b7280' },
    },
    footer: (page: number, count: number) => ({
      text: tr('Сэлбэ ухаалаг хот — Удирдлагын тайлан · {0} / {1}', page, count),
      style: 'foot', alignment: 'center',
    }),
    content: [
      /* ── 1. Инфографик — бүтэн хуудас ── */
      { image: infoPng, width: 515, height: (515 * INFO_H) / INFO_W, alignment: 'center', margin: [0, -10, 0, 0] },
      { text: '', pageBreak: 'after' },

      /* ── 2. Дүгнэлт + KPI ── */
      { text: tr('Сэлбэ ухаалаг хот — Удирдлагын тайлан'), style: 'h1' },
      { text: tr('Шийдвэр гаргагчид зориулсан товч тайлан · Огноо: {0}', dateStr), style: 'sub' },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1.2, lineColor: '#14181c' }] },

      h2('1', summary ? tr('AI дүгнэлт') : tr('Гол дүгнэлт')),
      {
        margin: [0, 4, 0, 4],
        table: { widths: ['*'], body: [[{
          fillColor: LEAD_BG,
          stack: summary
            ? summaryBlocks(summary)
            : [{ ul: findings.map(T), style: 'finding' }],
        }]] },
        layout: leadLayout,
      },
      ...(summary ? [cap(tr('Дүрэмд суурилсан анхаарах асуудал')), { ul: findings.map(T), style: 'finding' } as Content] : []),
      note(summary
        ? tr('AI дүгнэлт нь зөвхөн энэ тайлангийн тоонд тулгуурлан үүссэн; шийдвэрийн эцсийн үндэслэл нь доорх хүснэгтүүд.')
        : tr('Дүгнэлт нь амьд тооноос дүрмээр үүснэ; AI дүгнэлт үүсгээгүй.')),

      h2('2', tr('Ерөнхий үзүүлэлт (01. Ерөнхий дашбоард)')),
      kpiRow([
        { label: tr('Нийт төсөв'), value: money(g.budget), sub: `${num(g.budget)} ₮` },
        { label: tr('Нийт гэрээлсэн дүн'), value: money(g.contract), sub: g.budget > 0 ? tr('төсвийн {0}', pct((g.contract / g.budget) * 100, 1)) : undefined },
        { label: tr('Төслийн гүйцэтгэл'), value: g.progress == null ? '—' : pct(g.progress, 1), sub: tr('6 шатны жигнэсэн хувь') },
      ]),
      kpiRow([
        { label: tr('Багц ажлын тоо'), value: num(g.packages), sub: tr('{0} төрөл', num(g.types)) },
        { label: tr('Газар чөлөөлөлт'), value: g.landPct == null ? '—' : pct(g.landPct, 1), sub: tr('{0} / {1} нэгж талбар чөлөөлсөн', num(g.land.cleared), num(g.land.total)) },
        { label: tr('Олгосон санхүүжилт'), value: money(f.given), sub: f.share == null ? undefined : tr('гэрээний {0}', pct(f.share, 1)) },
      ]),
      cap(tr('Ажлын төрлөөр — төсөв, гэрээлсэн дүн, гүйцэтгэл')),
      { table: { headerRows: 1, widths: ['*', 34, 34, 100, 100, 50], body: [
        [th(tr('Төрөл')), th(tr('Ажил'), true), th(tr('Гэрээт'), true), th(tr('Төсөв (төг)'), true), th(tr('Гэрээлсэн (төг)'), true), th(tr('Гүйц.'), true)],
        ...g.byType.map((t): TableCell[] => [
          td(t.label), td(num(t.n), true), td(num(t.contracted), true),
          td(num(t.cost), true), td(t.contract > 0 ? num(t.contract) : '—', true),
          td(t.perf == null ? '—' : pct(t.perf, 1), true),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(g.byType.reduce((a, t) => a + t.n, 0)), true, TOTAL),
          td(num(g.byType.reduce((a, t) => a + t.contracted, 0)), true, TOTAL),
          td(num(g.byType.reduce((a, t) => a + t.cost, 0)), true, TOTAL),
          td(num(g.byType.reduce((a, t) => a + t.contract, 0)), true, TOTAL), td('', true, TOTAL)],
      ] }, layout: tableLayout },
      note(tr('Нийт төсөв (KPI) нь Excel-ийн НИЙТ хамрах хүрээгээр; төрлийн хүснэгтийн нийлбэр нь бүх мөрөөр тул зөрж болно.')),

      /* ── Газар чөлөөлөлт ба ХАБ — 01-ийн хоёр карт ── */
      cap(tr('Газар чөлөөлөлт — нэгж талбарын төлөв')),
      { table: { headerRows: 1, widths: ['*', 60, 90, 55], body: [
        [th(tr('Төлөв')), th(tr('Талбар'), true), th(tr('Талбай (м²)'), true), th(tr('Хувь'), true)],
        ...g.land.byStatus.map((b): TableCell[] => [
          td(b.label), td(num(b.n), true), td(num(b.areaM2), true),
          td(g.land.total ? pct((b.n / g.land.total) * 100, 1) : '—', true, b.label === PARCEL_CLEARED ? undefined : WARN_BG),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(g.land.total), true, TOTAL), td(num(g.land.areaM2), true, TOTAL),
          td(g.landPct == null ? '—' : tr('чөлөөлсөн {0}', pct(g.landPct, 1)), true, TOTAL)],
      ] }, layout: tableLayout },
      ...(g.land.reasons.length ? [
        cap(tr('Чөлөөгдөөгүй шалтгаанаар ({0} нэгж талбар)', num(g.land.remaining))),
        { table: { headerRows: 1, widths: ['*', 60, 55], body: [
          [th(tr('Шалтгаан')), th(tr('Талбар'), true), th(tr('Хувь'), true)],
          ...g.land.reasons.map((r): TableCell[] => [
            td(r.label), td(num(r.n), true), td(g.land.remaining ? pct((r.n / g.land.remaining) * 100, 1) : '—', true),
          ]),
        ] }, layout: tableLayout } as Content,
      ] : [note(tr('Чөлөөгдөөгүй талбарын шалтгаан бүртгэгдээгүй.'))]),
      cap(tr('ХАБ — талбайн хүн хүч')),
      ...(g.hse ? [
        kpiRow([
          { label: tr('Ажиллаж буй хүн'), value: num(g.hse.workers), sub: g.hse.date ? tr('сүүлийн бүртгэл {0}', g.hse.date) : undefined },
          { label: tr('Техник хэрэгсэл'), value: num(g.hse.equipment) },
          { label: tr('Хүн цаг'), value: num(g.hse.manHours) },
        ]),
        note(tr('Тоо нь өдөр тутмын хуримтлал биш, сүүлийн бүртгэлийн агшны байдал.')),
      ] : [note(tr('ХАБ-ын бүртгэл алга — мэдээлэлгүй.'))]),

      /* ── 3. Гүйцэтгэл + санхүү ── */
      { text: '', pageBreak: 'after' },
      h2('3', tr('Багцын гүйцэтгэл (05)')),
      kpiRow([
        { label: tr('Бодит гүйцэтгэл'), value: p.actual == null ? '—' : pct(p.actual, 1), sub: p.asOf ? tr('хэмжилт {0}', p.asOf) : undefined },
        { label: tr('Төлөвлөсөн'), value: p.planned == null ? '—' : pct(p.planned, 1), sub: tr('хуваариас') },
        { label: tr('Зөрүү'), value: gapText, sub: p.gap == null ? undefined : p.gap >= 5 ? tr('хоцрогдол') : p.gap < 0 ? tr('түрүүлэлт') : tr('хуваарийн дагуу') },
      ]),
      cap(tr('Орон сууцны багц тус бүрийн биет гүйцэтгэл')),
      { table: { headerRows: 1, widths: ['*', 50, 50, 70], body: [
        [th(tr('Багц')), th(tr('Блок'), true), th(tr('Өрх'), true), th(tr('Гүйцэтгэл'), true)],
        ...buildPk.map((k): TableCell[] => [
          td(k.name), td(num(k.blocks), true), td(num(k.households), true),
          td(k.progress == null ? tr('мэдээлэлгүй') : pct(k.progress, 1), true,
            k.progress != null && k.progress < 5 ? WARN_BG : undefined),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(p.blocks), true, TOTAL), td(num(p.households), true, TOTAL),
          td(p.actual == null ? '—' : pct(p.actual, 1), true, TOTAL)],
      ] }, layout: tableLayout },
      cap(tr('Блокийн гүйцэтгэлийн түвшин')),
      { table: { headerRows: 1, widths: ['*', 80, 60], body: [
        [th(tr('Түвшин')), th(tr('Хувь')), th(tr('Блок'), true)],
        ...p.levels.map((l): TableCell[] => [td(l.label), td(l.range), td(num(l.n), true)]),
        [td(tr('Бөглөгдөөгүй'), false, WARN_BG), td('—', false, WARN_BG), td(num(p.noData), true, WARN_BG)],
      ] }, layout: tableLayout },

      h2('4', tr('Багцын санхүү (04)')),
      kpiRow([
        { label: tr('Гэрээний нийт дүн'), value: money(f.planTotal), sub: `${num(f.planTotal)} ₮` },
        { label: tr('Олгосон санхүүжилт'), value: money(f.given), sub: f.share == null ? undefined : pct(f.share, 1) },
        { label: tr('Олгогдоогүй үлдэгдэл'), value: money(f.remain), sub: `${num(f.remain)} ₮` },
      ]),
      cap(tr('Багц тус бүрийн санхүүжилт — олгосон ба гэрээний дүн')),
      { table: { headerRows: 1, widths: ['*', 110, 110, 50], body: [
        [th(tr('Багц')), th(tr('Гэрээ (төг)'), true), th(tr('Олгосон (төг)'), true), th(tr('Хувь'), true)],
        ...f.rows.map((r): TableCell[] => [
          td(r.label), td(r.plan > 0 ? num(r.plan) : '—', true), td(num(r.given), true),
          td(r.pct == null ? '—' : pct(r.pct, 1), true, r.pct != null && r.pct < 10 && r.plan > 0 ? WARN_BG : undefined),
        ]),
        [td(tr('Нийт'), false, TOTAL), td(num(f.planTotal), true, TOTAL), td(num(f.given), true, TOTAL),
          td(f.share == null ? '—' : pct(f.share, 1), true, TOTAL)],
      ] }, layout: tableLayout },
      note(tr('«Олгосон» нь урьдчилгаа ба гүйцэтгэлийн бүх төлбөрийн нийлбэр (HO_IPC); гэрээний дүн нь Cashflow-ийн 76 гэрээгээр.')),

      /* ── 5. Зөвшөөрөл ── */
      { text: '', pageBreak: 'after' },
      h2('5', tr('Зөвшөөрөл')),
      ...(!z ? [note(tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул энэ хэсэг мэдээлэлгүй.'))] : [
        kpiRow([
          { label: tr('Зөвшөөрсөн'), value: `${num(z.ok)} / ${num(z.total)}` },
          { label: tr('Хүлээгдэж буй'), value: num(z.wait) },
          { label: tr('Зөвшөөрөөгүй'), value: num(z.no), sub: z.unknown ? tr('танигдаагүй {0}', num(z.unknown)) : undefined },
        ]),
        cap(tr('Багц тус бүрийн зөвшөөрлийн төлөв')),
        { table: { headerRows: 1, widths: ['*', 55, 65, 65, 65], body: [
          [th(tr('Багц')), th(tr('Нийт'), true), th(tr('Зөвшөөрсөн'), true), th(tr('Хүлээгдэж'), true), th(tr('Зөвшөөрөөгүй'), true)],
          ...z.byBagts.map((b): TableCell[] => [
            td(b.bagts), td(num(b.total), true), td(num(b.ok), true), td(num(b.wait), true),
            td(num(b.no + b.unknown), true, b.no + b.unknown > 0 ? BAD_BG : undefined),
          ]),
          [td(tr('Нийт'), false, TOTAL), td(num(z.total), true, TOTAL), td(num(z.ok), true, TOTAL), td(num(z.wait), true, TOTAL), td(num(z.no + z.unknown), true, TOTAL)],
        ] }, layout: tableLayout } as Content,
        ...(z.issues.length ? [
          cap(tr('Анхаарал шаардах зөвшөөрлүүд')),
          { table: { headerRows: 1, widths: [70, 28, '*', 120, 75], body: [
            [th(tr('Багц')), th(tr('Шат'), true), th(tr('Зөвшөөрөл')), th(tr('Байгууллага')), th(tr('Төлөв'))],
            ...z.issues.slice(0, 40).map((i): TableCell[] => [
              td(i.bagts), td(num(i.shat), true), td(i.ner), td(i.baiguullaga || '—'),
              td(tr(i.tolov), false, i.tolov === TOLOV.no ? BAD_BG : WARN_BG),
            ]),
          ] }, layout: tableLayout } as Content,
          ...(z.issues.length > 40 ? [note(tr('Эхний 40 мөр; нийт {0}.', num(z.issues.length)))] : []),
        ] : [note(tr('Бүх зөвшөөрөл зөвшөөрөгдсөн.'))]),
      ]),

      note(tr('Эх сурвалж: Сэлбэ портал — 01. Ерөнхий дашбоард (KPI · Газар чөлөөлөлт · ХАБ) · 05. Багцын гүйцэтгэл · 04. Багцын санхүү · Зөвшөөрөл. Бүх тоо тайлан үүсгэх агшинд ArcGIS-ээс амьдаар татагдсан; дэлгэц дээрх дашбоардтай ижил.')),
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
  const png = toPng(buildInfographic(x, dateStr, execFindings(x), summary), 2);
  const bytes = Uint8Array.from(atob(png.split(',')[1]), (c) => c.charCodeAt(0));
  download(PNG_NAME, new Blob([bytes], { type: 'image/png' }));
}

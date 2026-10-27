/**
 * «Хуваарь» харагдацын ТАЙЛАН (.docx) — PDF-тэй ИЖИЛ бэлэн мөрөөс (`HvPdfRow`).
 *
 * ⚠️ 2026-10-19 (хэрэглэгч: «ХУВААРЬ ТАЙЛАН зас»): ерөнхий DOM цуглуулагч энэ хуудсаас хуанлийн
 *    шошго, чирэх зурвас, товчны бичвэрийг тасархай мөр болгон гаргадаг байв. Одоо `Huvaari`-ийн
 *    PDF-ийн `rowFor` (идэвхтэй таб · блок · шүүлт, хадгалаагүй ноорог орно) мөрүүдээс угсарна —
 *    тайлан, PDF, дэлгэц гурав нэг тоо харуулна.
 * ⚠️ Өөрөө тооцоо ХИЙХГҮЙ (төлөв, бүлгийн муж — дуудагч бэлдэнэ; `huvaariPdf.ts`-ийн ⚠️-тэй ижил).
 * ⚠️ Огноо нь UTC шөнө дунд (`plan.Span`) тул UTC-ээр уншина — орон нутгийн цагаар нэг өдөр гулсана.
 */

import { t as tr } from './i18nCore';
import type { DocBlock } from './docx';
import { spanDays, type Status } from './plan';
import type { HvPdfRow } from './huvaariPdf';

const day = (ms: number | null | undefined): string =>
  ms == null || !Number.isFinite(ms) ? '' : new Date(ms).toISOString().slice(0, 10);
const pctOf = (a: number | null): string => (a == null ? '' : `${Math.round(a * 100)}%`);

const ST_LABEL: Record<Status, () => string> = {
  done: () => tr('дууссан'),
  run: () => tr('явж байгаа'),
  todo: () => tr('эхлээгүй'),
  late: () => tr('хоцорсон'),
  none: () => tr('хэмжигдээгүй'),
};

export type HuvaariReportInput = {
  rows: HvPdfRow[];
  /** Бодит гүйцэтгэл бүртгэгдсэн эсэх — үгүй бол төлөвийн багана/тоо гарахгүй (бүгд «хэмжигдээгүй») */
  hasActual: boolean;
};

export function huvaariBlocks({ rows, hasActual }: HuvaariReportInput): DocBlock[] {
  const leaves = rows.filter((r) => !r.group);
  const planned = leaves.filter((r) => r.bar);
  const from = planned.reduce<number | null>((m, r) => (m == null || r.bar!.start < m ? r.bar!.start : m), null);
  const to = planned.reduce<number | null>((m, r) => (m == null || r.bar!.end > m ? r.bar!.end : m), null);
  const late = planned.filter((r) => r.st === 'late');
  const viol = planned.filter((r) => r.viol);

  const out: DocBlock[] = [{ kind: 'h', level: 2, text: tr('Нэгтгэл') }];
  out.push({ kind: 'p', text: tr('Нийт {0} ажил · хуваарьтай {1} · хуваарьгүй {2}',
    String(leaves.length), String(planned.length), String(leaves.length - planned.length)) });
  if (from != null && to != null) out.push({ kind: 'p', text: tr('Хугацаа: {0} эхэлж {1} дуусна', day(from), day(to)) });
  if (hasActual) {
    const order: Status[] = ['done', 'run', 'todo', 'late', 'none'];
    out.push({
      kind: 'table',
      head: [[tr('Төлөв'), tr('Ажлын тоо')]],
      rows: order.map((s) => [ST_LABEL[s](), String(planned.filter((r) => r.st === s).length)]),
    });
  }

  /* ── Ажлын хуваарь — модны бүтэц: гүнээр догол (NBSP — Word хоосон зайг шахдаг) ── */
  out.push({ kind: 'h', level: 1, text: tr('Ажлын хуваарь') });
  const head = [tr('Код'), '№', tr('Ажил'), tr('Эхлэх'), tr('Дуусах'), tr('Хоног')];
  if (hasActual) head.push(tr('Гүйцэтгэл'), tr('Төлөв'));
  if (!rows.length) out.push({ kind: 'p', text: tr('Ажил алга.'), italic: true, color: '777777' });
  else out.push({
    kind: 'table',
    head: [head],
    rows: rows.map((r) => {
      const c = [
        r.des == null ? '' : String(r.des),
        r.no,
        `${'  '.repeat(Math.max(0, r.depth))}${r.work}`,
        day(r.bar?.start),
        day(r.bar?.end),
        r.bar ? String(spanDays(r.bar)) : '',
      ];
      if (hasActual) c.push(pctOf(r.act), r.bar && !r.group ? ST_LABEL[r.st]() : '');
      return c;
    }),
  });

  /* ── Анхаарах ажил ── */
  if (hasActual) {
    out.push({ kind: 'h', level: 1, text: late.length ? `${tr('Хоцорсон ажил')}: ${late.length}` : tr('Хоцорсон ажил') });
    if (!late.length) out.push({ kind: 'p', text: tr('Ажил алга.'), italic: true, color: '777777' });
    else out.push({
      kind: 'table',
      head: [[tr('Код'), tr('Ажил'), tr('Дуусах ёстой'), tr('Гүйцэтгэл'), tr('Бодит эхэлсэн')]],
      rows: late.map((r) => [r.des == null ? '' : String(r.des), r.work, day(r.bar?.end), pctOf(r.act), day(r.aStart)]),
    });
  }
  if (viol.length) {
    out.push({ kind: 'h', level: 1, text: `${tr('Уялдааны зөрчилтэй ажил')}: ${viol.length}` });
    out.push({
      kind: 'table',
      head: [[tr('Код'), tr('Ажил'), tr('Эхлэх'), tr('Дуусах')]],
      rows: viol.map((r) => [r.des == null ? '' : String(r.des), r.work, day(r.bar?.start), day(r.bar?.end)]),
    });
  }
  return out;
}

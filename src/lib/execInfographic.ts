/**
 * PNG infographic: shared drawing operations for SVG and Canvas.
 * Values come from ExecReport / ExecDeltas; this module only lays them out.
 * A4 is the minimum height. Longer reports grow instead of clipping findings.
 */
import { LATE_GAP, householdsLabel, type ExecReport } from '@/lib/execReport';
import { progressSub } from '@/lib/gdash';
import { coverageNote, coverageOk } from '@/lib/planProgress';
import { t as tr } from '@/lib/i18nCore';
import { num, pct, PRINT_COLORS } from '@/lib/format';
import { PARCEL_CLEARED } from '@/lib/services';
import { TOLOV } from '@/lib/zovshoorol';
import { deltaText, packTrendOf, givenTrendOf, bandOf, type ExecDeltas, type Trend } from '@/lib/execPeriodCalc';

export const INFO_W = 1240;
export const INFO_H = 1754;
const { ink: INK, ink2: INK2, ink3: INK3, data: DATA, bad: BAD, warn: WARN, track: TRACK } = PRINT_COLORS;
const PAPER = '#fff';
const SURF = '#f4f6f9';
const FONT = "'Segoe UI', 'Noto Sans', Arial, sans-serif";
const firstOf = (shown: number, total: number) => total > shown ? tr('эхний {0} (+{1} бусад)', num(shown), num(total - shown)) : '';

type Anchor = 'start' | 'middle' | 'end';
type TextOp = { k: 'text'; x: number; y: number; s: string; size: number; weight: number; fill: string; anchor: Anchor };
type RectOp = { k: 'rect'; x: number; y: number; w: number; h: number; fill: string; r: number; stroke?: string };
type LineOp = { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number };
export type Op = TextOp | RectOp | LineOp;

/** Both renderers use the page background's final height, including the footer. */
export function infographicSize(ops: readonly Op[]) {
  const page = ops[0];
  return { width: INFO_W, height: page?.k === 'rect' && page.x === 0 && page.y === 0 ? Math.max(INFO_H, Math.ceil(page.h)) : INFO_H };
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function toSvg(ops: Op[]): string {
  const { width, height } = infographicSize(ops);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`];
  for (const o of ops) {
    if (o.k === 'text') out.push(`<text x="${o.x}" y="${o.y}" font-family="${FONT}" font-size="${o.size}" font-weight="${o.weight}" fill="${o.fill}" text-anchor="${o.anchor}">${esc(o.s)}</text>`);
    else if (o.k === 'rect') out.push(`<rect x="${o.x}" y="${o.y}" width="${Math.max(0, o.w)}" height="${o.h}" fill="${o.fill}" rx="${o.r}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="1"` : ''}/>`);
    else out.push(`<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.stroke}" stroke-width="${o.width}"/>`);
  }
  return [...out, '</svg>'].join('\n');
}
export function toPng(ops: Op[], scale = 1): string {
  const { width, height } = infographicSize(ops);
  const c = document.createElement('canvas');
  c.width = width * scale;
  c.height = height * scale;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error(tr('Инфографик зурахад алдаа гарлаа.'));
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  for (const o of ops) {
    if (o.k === 'text') {
      ctx.font = `${o.weight} ${o.size}px ${FONT}`;
      ctx.fillStyle = o.fill;
      ctx.textAlign = o.anchor === 'middle' ? 'center' : o.anchor === 'end' ? 'right' : 'left';
      ctx.fillText(o.s, o.x, o.y);
    } else if (o.k === 'rect') {
      if (o.w <= 0 || o.h <= 0) continue;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function' && o.r > 0) ctx.roundRect(o.x, o.y, o.w, o.h, o.r);
      else ctx.rect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = o.fill;
      ctx.fill();
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2);
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width; ctx.stroke();
    }
  }
  return c.toDataURL('image/png');
}

/** Full amounts: a recorded zero remains distinct from missing data. */
export const money = (v: number | null) => v == null || !Number.isFinite(v) ? '—' : `${num(v)} ₮`;
export function wrap(text: string, maxChars: number): string[] {
  return text.split(/\r?\n/).flatMap((para) => {
    const lines: string[] = [];
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = ''; }
      line += `${line ? ' ' : ''}${word}`;
    }
    return [...lines, line];
  });
}

/** Measure the same installed font used by Canvas; deterministic fallback for Node. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string, size: number, weight = 400): number {
  if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext?.('2d') ?? null;
  if (measureCtx) { measureCtx.font = `${weight} ${size}px ${FONT}`; return measureCtx.measureText(s).width; }
  return s.length * size * 0.59;
}
class Painter {
  ops: Op[] = [];
  text(x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: Anchor; maxW?: number } = {}) {
    const size = o.size ?? 13;
    const weight = o.weight ?? 400;
    const fitted = o.maxW ? Math.min(size, size * o.maxW / Math.max(1, textWidth(s, size, weight))) : size;
    this.ops.push({ k: 'text', x, y, s, size: fitted, weight, fill: o.fill ?? INK, anchor: o.anchor ?? 'start' });
  }
  rect(x: number, y: number, w: number, h: number, fill = PAPER, r = 0, stroke?: string): RectOp {
    const op: RectOp = { k: 'rect', x, y, w, h, fill, r, stroke }; this.ops.push(op); return op;
  }
  line(x: number, y: number, x2: number, y2: number, stroke: string = TRACK, width = 1) {
    this.ops.push({ k: 'line', x1: x, y1: y, x2, y2, stroke, width });
  }
  paragraph(x: number, y: number, w: number, s: string, size = 12, fill: string = INK3): number {
    for (const para of s.split(/\r?\n/)) {
      let line = '';
      const emit = () => { this.text(x, y + size, line, { size, fill }); y += size * 1.5; line = ''; };
      for (const word of para.split(/\s+/).filter(Boolean)) {
        if (line && textWidth(`${line} ${word}`, size) > w) emit();
        // Long identifiers/URLs must also stay within their card.
        for (const ch of `${line ? ' ' : ''}${word}`) {
          if (line && textWidth(line + ch, size) > w) emit();
          line += ch;
        }
      }
      emit();
    }
    return y;
  }
  label(x: number, y: number, w: number, s: string) {
    return this.paragraph(x, y, w, s, 12, INK3) + 8;
  }
  metric(x: number, y: number, w: number, label: string, value: string, sub?: string) {
    this.text(x, y + 14, label, { size: 12, fill: INK3, maxW: w });
    this.text(x, y + 47, value, { size: 28, weight: 700, maxW: w });
    return sub ? this.paragraph(x, y + 58, w, sub, 11.5) : y + 56;
  }
  bar(x: number, y: number, w: number, frac: number | null, color: string = DATA, h = 5) {
    this.rect(x, y, w, h, TRACK, h / 2);
    if (frac != null && Number.isFinite(frac)) this.rect(x, y, w * Math.max(0, Math.min(1, frac)), h, color, h / 2);
  }
  pair(x: number, y: number, w: number, label: string, value: string, color: string = INK): number {
    const bottom = this.paragraph(x, y + 2, w * 0.38, label, 12);
    this.text(x + w, y + 14, value, { size: 14, weight: 600, fill: color, anchor: 'end', maxW: w * 0.6 });
    return Math.max(y + 27, bottom + 8);
  }
  segments(x: number, y: number, w: number, segs: [number, string, string][]): number {
    const total = segs.reduce((s, [n]) => s + n, 0);
    let xx = x;
    this.rect(x, y, w, 12, TRACK, 3);
    for (const [n, color] of segs) {
      const sw = total ? w * n / total : 0;
      this.rect(xx, y, sw, 12, color); xx += sw;
    }
    y += 26;
    const half = (w - 18) / 2;
    for (let i = 0; i < segs.length; i += 2) {
      let bottom = y;
      for (const [j, [n, color, label]] of segs.slice(i, i + 2).entries()) {
        const cx = x + j * (half + 18);
        this.rect(cx, y + 5, 6, 6, color, 2);
        bottom = Math.max(bottom, this.paragraph(cx + 13, y, half - 13, `${label} · ${num(n)}`, 11.5));
      }
      y = bottom + 7;
    }
    return y;
  }
  monthTable(x: number, y: number, w: number, cols: string[], rows: { label: string; values: (number | null)[]; trend?: Trend | null; bold?: boolean }[], band: [number, number] | null): number {
    const nameW = 112, trendW = 94, cw = (w - nameW - trendW) / cols.length;
    this.rect(x, y, w, 28, SURF, 5);
    cols.forEach((m, i) => this.text(x + nameW + (i + 1) * cw - 7, y + 18, m.slice(2).replace('-', '.'), { size: 11, weight: 600, fill: INK3, anchor: 'end' }));
    this.text(x + w - 6, y + 18, tr('Өөрчлөлт'), { size: 11, fill: INK3, anchor: 'end', maxW: trendW - 10 });
    y += 28;
    for (const row of rows) {
      const start = y;
      // Names wrap; numbers never share the name column.
      const nameLines = Math.max(1, Math.ceil(textWidth(row.label, 12) / (nameW - 12)));
      const rh = Math.max(32, nameLines * 18 + 12);
      if (row.bold) this.rect(x, y, w, rh, SURF, 3);
      if (band) this.rect(x + nameW + band[0] * cw, y, (band[1] - band[0] + 1) * cw, rh, TRACK);
      const nameEnd = this.paragraph(x + 4, y + 8, nameW - 12, row.label, 12, row.bold ? INK : INK2);
      row.values.forEach((v, i) => this.text(x + nameW + (i + 1) * cw - 7, y + 21, v == null ? '—' : pct(v, 1), { size: 12, weight: row.bold ? 700 : 400, anchor: 'end', maxW: cw - 10 }));
      this.text(x + w - 6, y + 21, row.trend?.text ?? '—', { size: 12, weight: 600, fill: row.trend?.tone === 'bad' ? BAD : INK3, anchor: 'end', maxW: trendW - 10 });
      y = Math.max(start + rh, nameEnd + 8);
      this.line(x, y, x + w, y);
    }
    return y + 16;
  }
  /** Signed monthly amounts: refunds extend left of zero and keep their labels. */
  payments(x: number, y: number, w: number, months: string[], values: number[], band: [number, number] | null): number {
    const max = Math.max(1, ...values.map(Math.abs));
    const gx = x + 62, gw = w - 252;
    const negative = values.some((v) => v < 0);
    const zero = negative ? gx + gw / 2 : gx;
    const span = negative ? gw / 2 : gw;
    months.forEach((m, i) => {
      if (band && i >= band[0] && i <= band[1]) this.rect(x, y, w, 28, SURF, 4);
      const v = values[i] ?? 0;
      this.text(x + 5, y + 18, m.slice(2).replace('-', '.'), { size: 12, fill: INK3 });
      this.line(zero, y + 4, zero, y + 24);
      const length = span * Math.abs(v) / max;
      this.rect(v < 0 ? zero - length : zero, y + 8, length, 12, v < 0 ? BAD : DATA, 2);
      this.text(x + w - 5, y + 18, money(v), { size: 12, weight: 600, anchor: 'end', maxW: 180 });
      y += 29;
    });
    return y + 12;
  }
}

type Panel = { bottom: number; box: RectOp };
export function buildInfographic(x: ExecReport, dateStr: string, findings: string[], summary: string | null, deltas: ExecDeltas | null = null): Op[] {
  const P = new Painter();
  const M = 40, W = INFO_W - M * 2, GAP = 20, CW = (W - GAP) / 2;
  const page = P.rect(0, 0, INFO_W, INFO_H, SURF);
  const g = x.gdash, p = x.prog, f = x.fin, S = deltas?.series, per = deltas?.period;
  const panel = (left: number, top: number, width: number, index: string, title: string, sub: string, body: (cx: number, cy: number, cw: number) => number): Panel => {
    const box = P.rect(left, top, width, 100, PAPER, 12, TRACK);
    const cx = left + 22, cw = width - 44;
    P.text(cx, top + 32, index, { size: 12, weight: 700, fill: DATA });
    P.text(cx + 32, top + 32, title, { size: 18, weight: 700, maxW: cw - 32 });
    let cy = top + 46;
    if (sub) cy = P.paragraph(cx, cy, cw, sub) + 9;
    else cy += 7;
    P.line(cx, cy, cx + cw, cy);
    const bottom = body(cx, cy + 18, cw) + 20;
    box.h = bottom - top;
    return { bottom, box };
  };
  const align = (a: Panel, b: Panel) => {
    const bottom = Math.max(a.bottom, b.bottom);
    a.box.h = bottom - a.box.y; b.box.h = bottom - b.box.y;
    return bottom + GAP;
  };

  // One clear title, export timestamp, and selected comparison period.
  P.rect(0, 0, INFO_W, 142, INK);
  P.rect(M, 31, 4, 68, DATA, 2);
  P.text(M + 20, 63, tr('Сэлбэ ухаалаг хот'), { size: 34, weight: 700, fill: PAPER, maxW: 780 });
  P.text(M + 20, 90, tr('Удирдлагын товч тайлан, төслийн өнөөдрийн байдал'), { size: 14, fill: TRACK, maxW: 800 });
  P.text(M + W, 54, dateStr, { size: 13, fill: TRACK, anchor: 'end', maxW: 270 });
  P.text(M + 20, 119, per ? tr('өөрчлөлт {0} → {1}', per.from, per.to) : tr('Тайлан'), { size: 12, fill: TRACK });

  const tiles: [string, string, string?][] = [
    [tr('Нийт төсөв'), money(g.budget), tr('Excel-ийн нийт хамрах хүрээ')],
    [tr('Нийт гэрээлсэн дүн'), money(g.contract), g.budget > 0 ? tr('төсвийн {0}', pct(g.contract / g.budget * 100, 1)) : undefined],
    [tr('Төслийн гүйцэтгэл'), pct(g.progress, 1), [progressSub(g.progressSrc), g.progressPlan == null ? '' : tr('төлөвлөгөө {0}', pct(g.progressPlan, 1))].filter(Boolean).join(' · ')],
    [tr('Олгосон санхүүжилт'), money(f.given), f.share == null ? undefined : tr('гэрээлсэн багцад {0} ₮ — гэрээлсэн дүнгийн {1}', num(f.givenContracted), pct(f.share, 1))],
    [tr('Газар чөлөөлөлт'), pct(g.landPct, 1), tr('{0} нэгж талбар үлдсэн', num(g.land.remaining))],
    [tr('Багц ажил'), num(g.packages), tr('{0} төрөл · {1} блок · {2} өрх', num(g.types), num(p.blocks), householdsLabel(p))],
  ];
  const tw = (W - GAP * 2) / 3;
  let y = 162;
  for (let row = 0; row < 2; row++) {
    let bottom = y;
    const boxes: RectOp[] = [];
    tiles.slice(row * 3, row * 3 + 3).forEach(([label, val, sub], i) => {
      const left = M + i * (tw + GAP);
      boxes.push(P.rect(left, y, tw, 100, PAPER, 10, TRACK));
      bottom = Math.max(bottom, P.metric(left + 20, y + 13, tw - 40, label, val, sub) + 17);
    });
    boxes.forEach((box) => { box.h = bottom - y; });
    y = bottom + GAP;
  }

  const progress = panel(M, y, CW, '01', tr('Багцын гүйцэтгэл'), p.asOf ? tr('хэмжилт {0}', p.asOf) : '', (cx, cy, cw) => {
    cy = P.label(cx, cy, cw, tr('Орон сууцны барилга угсралт — төлөвлөгөө ба бодит'));
    const actual = p.planExcluded.length ? p.actualLag : p.actual;
    const judged = coverageOk(p.planCoverage), late = judged && p.gap != null && p.gap >= LATE_GAP;
    cy = P.pair(cx, cy, cw, tr('Төлөвлөгөө'), pct(p.planned, 1));
    P.bar(cx, cy - 4, cw, p.planned == null ? null : p.planned / 100, INK3);
    cy = P.pair(cx, cy + 10, cw, tr('Бодит'), pct(actual, 1), late ? BAD : DATA);
    P.bar(cx, cy - 4, cw, actual == null ? null : actual / 100, late ? BAD : DATA);
    cy += 12;
    const status = !judged ? coverageNote(p.planCoverage) : p.gap == null ? '' : late ? tr('Хоцрогдол {0} нэгж хувь', num(p.gap, 1)) : p.gap < 0 ? tr('Түрүүлэлт {0} нэгж хувь', num(-p.gap, 1)) : tr('хуваарийн дагуу');
    if (status) cy = P.paragraph(cx, cy, cw, status, 12, late ? BAD : INK3) + 14;
    const packs = p.packs.filter((k) => k.kind === 'build').sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
    // Four months keep 12px percentages legible alongside names and deltas.
    const measured = S ? S.months.map((m, i) => ({ m, i })).filter(({ i }) => S.housingActual[i] != null || S.packs.some((sp) => sp.values[i] != null)).slice(-4) : [];
    if (S && per && measured.length) {
      cy = P.label(cx, cy, cw, tr('Сараар — хэмжилттэй сарууд, багц бүр'));
      const pick = (vals: readonly (number | null)[]) => measured.map(({ i }) => vals[i] ?? null);
      cy = P.monthTable(cx, cy, cw, measured.map(({ m }) => m), [
        { label: tr('Төлөвлөгөө'), values: pick(S.housingPlan), bold: true },
        { label: tr('Бодит'), values: pick(S.housingActual), bold: true, trend: deltaText(deltas!.housing.delta, 'pp', { upGood: true }) },
        ...packs.map((k) => ({ label: k.name, values: pick(S.packs.find((sp) => sp.key === k.key)?.values ?? []), trend: packTrendOf(deltas, k.key) })),
      ], bandOf(measured.map(({ m }) => m), per));
    } else {
      cy = P.label(cx, cy, cw, tr('Багц тус бүрийн биет гүйцэтгэл'));
      for (const k of packs) {
        cy = P.pair(cx, cy, cw, k.name, `${pct(k.progress, 1)}${packTrendOf(deltas, k.key) ? `  ${packTrendOf(deltas, k.key)!.text}` : ''}`);
        P.bar(cx, cy - 4, cw, k.progress == null ? null : k.progress / 100); cy += 12;
      }
      if (!packs.length) cy = P.label(cx, cy, cw, tr('мэдээлэлгүй'));
    }
    cy = P.label(cx, cy + 6, cw, tr('Блокийн гүйцэтгэлийн түвшин ({0} блок, {1} бөглөгдөөгүй)', num(p.blocks), num(p.noData)));
    return P.segments(cx, cy, cw, p.levels.map((l) => [l.n, l.color, `${l.label} ${l.range}`]));
  });
  const finance = panel(M + CW + GAP, y, CW, '02', tr('Багцын санхүү'), tr('Гэрээний дүн ба олгосон санхүүжилт'), (cx, cy, cw) => {
    cy = P.pair(cx, cy, cw, tr('Гэрээ'), money(f.planTotal));
    cy = P.pair(cx, cy, cw, tr('Олгосон'), money(f.given));
    P.bar(cx, cy, cw, f.share == null ? null : f.share / 100); cy += 15;
    if (f.share != null) cy = P.label(cx, cy, cw, tr('{0} олгогдсон · үлдэгдэл {1}', pct(f.share, 1), money(f.remain)));
    if (deltas && per) {
      cy = P.pair(cx, cy, cw, tr('Хугацааны өөрчлөлт'), money(deltas.given.delta));
      if (deltas.given.undated) cy = P.label(cx, cy, cw, tr('огноогүй {0} төлбөр тоологдоогүй', num(deltas.given.undated)));
    }
    if (S && per && S.months.length) {
      const months = S.months.slice(-6), values = S.paidMonthly.slice(-6);
      cy = P.label(cx, cy + 8, cw, tr('Сар бүрийн олголт, ₮ — сүүлийн {0} сар', num(months.length)));
      cy = P.payments(cx, cy, cw, months, values, bandOf(months, per));
    }
    cy = P.label(cx, cy, cw, [tr('Багц тус бүр (олгосон / гэрээ)'), firstOf(10, f.rows.length)].filter(Boolean).join(' · '));
    for (const r of f.rows.slice(0, 10)) {
      cy = P.pair(cx, cy, cw, r.label, `${money(r.given)} · ${pct(r.pct, 1)}`);
      const gt = givenTrendOf(deltas, r.key);
      if (gt && deltas?.givenByKey[r.key]) {
        P.text(cx + cw, cy + 2, gt.text, { size: 11.5, fill: INK3, anchor: 'end', maxW: cw }); cy += 18;
      }
      P.bar(cx, cy - 4, cw, r.pct == null ? null : r.pct / 100); cy += 11;
    }
    if (!f.rows.length) cy = P.label(cx, cy, cw, tr('мэдээлэлгүй'));
    return cy;
  });
  y = align(progress, finance);

  const land = panel(M, y, CW, '03', tr('Газар чөлөөлөлт'), tr('{0} нэгж талбар · {1} м²', num(g.land.total), num(g.land.areaM2)), (cx, cy, cw) => {
    cy = P.segments(cx, cy, cw, g.land.byStatus.map((b) => [b.n, b.label === PARCEL_CLEARED ? DATA : BAD, tr(b.label)]));
    cy = P.label(cx, cy + 4, cw, [tr('Чөлөөгдөөгүй шалтгаанаар ({0} нэгж талбар)', num(g.land.remaining)), firstOf(5, g.land.reasons.length)].filter(Boolean).join(' · '));
    if (!g.land.reasons.length) return P.label(cx, cy, cw, tr('Шалтгаан бүртгэгдээгүй'));
    for (const r of g.land.reasons.slice(0, 5)) {
      const end = P.paragraph(cx, cy, cw - 65, tr(r.label), 12, INK2);
      P.text(cx + cw, cy + 13, num(r.n), { size: 13, weight: 600, fill: BAD, anchor: 'end' });
      cy = end + 9;
    }
    return cy;
  });
  const hse = panel(M + CW + GAP, y, CW, '04', tr('ХАБ-ын талбайн хүн хүч'), g.hse?.date ? tr('сүүлийн бүртгэл {0}', g.hse.date) : '', (cx, cy, cw) => {
    if (!g.hse) return P.label(cx, cy, cw, tr('ХАБ-ын бүртгэл алга, мэдээлэлгүй.'));
    const hw = (cw - 18) / 2;
    const h1 = P.metric(cx, cy, hw, tr('Ажиллаж буй хүн'), num(g.hse.workers));
    const h2 = P.metric(cx + hw + 18, cy, hw, tr('Техник хэрэгсэл'), num(g.hse.equipment));
    cy = Math.max(h1, h2) + 12;
    cy = P.pair(cx, cy, cw, tr('Хүн цаг'), num(g.hse.manHours));
    cy = P.label(cx, cy + 12, cw, tr('Тоо нь өдөр тутмын хуримтлал биш, сүүлийн бүртгэлийн агшны байдал.'));
    if (deltas) {
      cy = P.label(cx, cy + 8, cw, tr('Хугацааны өөрчлөлт'));
      cy = P.pair(cx, cy, cw, tr('Ажиллаж буй хүн'), deltaText(deltas.workers.delta, 'n')?.text ?? '—');
      cy = P.pair(cx, cy, cw, tr('Техник хэрэгсэл'), deltaText(deltas.technik.delta, 'n')?.text ?? '—');
    }
    return cy;
  });
  y = align(land, hse);

  const permits = panel(M, y, CW, '05', tr('Зөвшөөрөл'), x.zov ? tr('Нийт {0} зөвшөөрөл · {1} багц', num(x.zov.total), num(x.zov.byBagts.length)) : '', (cx, cy, cw) => {
    const z = x.zov;
    if (!z) return P.label(cx, cy, cw, tr('Зөвшөөрлийн бүртгэл холбогдоогүй, мэдээлэлгүй.'));
    cy = P.segments(cx, cy, cw, [[z.ok, DATA, tr('Зөвшөөрсөн')], [z.wait, WARN, tr('Хүлээгдэж буй')], [z.no, BAD, tr('Зөвшөөрөөгүй')], [z.unknown, INK3, tr('Танигдаагүй')]]);
    if (deltas?.zov) cy = P.label(cx, cy, cw, tr('зөвшөөрсөн {0} · татгалзсан {1}', num(deltas.zov.ok), num(deltas.zov.no)) + ` · ${tr('Хугацааны өөрчлөлт')}`);
    if (!z.issues.length) return P.label(cx, cy, cw, tr('Бүх зөвшөөрөл зөвшөөрөгдсөн.'));
    if (z.issues.length > 7) cy = P.label(cx, cy, cw, firstOf(7, z.issues.length));
    for (const it of z.issues.slice(0, 7)) {
      P.rect(cx, cy + 5, 6, 6, it.tolov === TOLOV.no ? BAD : WARN, 2);
      cy = P.paragraph(cx + 15, cy, cw - 15, `${it.bagts} · ${it.ner}`, 12.5, INK2);
      cy = P.paragraph(cx + 15, cy + 3, cw - 15, `${it.baiguullaga || '—'} · ${tr(it.tolov)}`, 11.5) + 12;
    }
    return cy;
  });
  const types = panel(M + CW + GAP, y, CW, '06', tr('Ажлын төрлөөр (төсөв, гэрээ, гүйцэтгэл)'), firstOf(7, g.byType.length), (cx, cy, cw) => {
    if (!g.byType.length) return P.label(cx, cy, cw, tr('мэдээлэлгүй'));
    for (const t of g.byType.slice(0, 7)) {
      cy = P.paragraph(cx, cy, cw - 70, tr(t.label), 13, INK2);
      P.text(cx + cw, cy - 5, pct(t.perf, 1), { size: 13, weight: 700, anchor: 'end', maxW: 65 });
      cy = P.pair(cx, cy + 3, cw, tr('Төсөв'), money(t.cost));
      cy = P.pair(cx, cy - 3, cw, tr('Гэрээ'), money(t.contract));
      P.bar(cx, cy - 2, cw, t.cost > 0 ? t.contract / t.cost : null); cy += 15;
    }
    return cy;
  });
  y = align(permits, types);

  // Findings keep their complete text and grow the page, including long AI summaries.
  const conclusion = panel(M, y, W, '07', summary ? tr('AI дүгнэлт') : tr('Анхаарах асуудал'), '', (cx, cy, cw) => {
    if (summary) return P.paragraph(cx, cy, cw, summary, 14, INK2);
    for (const [i, finding] of findings.entries()) {
      P.rect(cx, cy, 24, 24, SURF, 6);
      P.text(cx + 12, cy + 17, String(i + 1), { size: 12, weight: 700, fill: DATA, anchor: 'middle' });
      cy = Math.max(cy + 24, P.paragraph(cx + 38, cy + 2, cw - 38, finding, 13, INK2)) + 12;
    }
    return cy;
  });
  const height = Math.max(INFO_H, Math.ceil(conclusion.bottom + 98));
  page.h = height;
  P.line(M, height - 72, M + W, height - 72);
  P.paragraph(M, height - 57, W - 250, tr('Эх сурвалж: Сэлбэ порталын Ерөнхий дашбоард · Багцын гүйцэтгэл · Багцын санхүү · Зөвшөөрөл. Тайлан үүсгэсэн огнооны байдлаар.'), 10.5);
  P.text(M + W, height - 42, dateStr, { size: 11, fill: INK3, anchor: 'end', maxW: 230 });
  return P.ops;
}
export function infographicSvgUrl(ops: Op[]): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(ops))}`;
}

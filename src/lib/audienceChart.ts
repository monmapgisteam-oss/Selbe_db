/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАНГИЙН ГРАФИК — цэвэр SVG мөр (`chartSvg`), ЗӨВХӨН PDF-д (2026-11-05, хэрэглэгч: «дэлгэцэд харуулахгүй,
 * шууд PDF»). Өргөн = pdfmake-ийн агуулгын өргөн (515pt) тул 1 нэгж = 1pt; фонт 7–13pt.
 *   · мөнгө ТЭРБУМ ₮-өөр (`fmtUnit`), бүтэн дүн зөвхөн хавсралтын хүснэгтэд
 *   · тэнхлэг, тор, сарын шошго; утга тэмдэг дээрээ хэвлэгдэнэ (хар-цагаан хэвлэхэд ч уншигдана)
 *   · хэвлэлийн өнгө: бараан бичвэр, ялгагдах саарлууд, нэг онцлох өнгө (`PRINT_COLORS.data`); 10 хүртэл ялгаатай хэсэг
 *   · урт баганан график `splitSpec`-ээр хуудасны хэмжээнд хуваагдана (PDF-д хуудаснаас халихгүй)
 *   · хоосон өгөгдөл → «мэдээлэлгүй» орлуулагч
 * Сүлжээгүй, DOM-гүй — `audienceChart.check.mjs`.
 */
import { t as tr } from '@/lib/i18nCore';
import { num, pct, PRINT_COLORS } from '@/lib/format';
import type { ChartSpec, Unit, BarItem, KpiItem, ListItem, LineSeries } from '@/lib/audienceReport';

const { ink: INK, ink2: INK2, ink3: INK3, data: ACCENT, track: TRACK } = PRINT_COLORS;
const GREY = '#8d99a6';
const GREY2 = '#b9c2cb';
const GREY3 = '#dfe4e9';
const RULE = '#cfd6dd';
const PAPER = '#ffffff';
/** Үндсэн фонт (pt) */
const F = 8.5;
/** Хэвлэлийн A4 агуулгын өргөн (pt) — `audiencePdf.PDF_CONTENT_W`-тэй ижил */
export const CHART_W = 515;
/** Нэг баганан графикт багтах мөрийн дээд тоо — хуудасны өндөрт (≈746pt) гарчиг, өгүүлбэртэйгээ багтана */
export const BARS_PER_CHART = 24;

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Мөнгө — БҮТЭН дүн, мянгатын таслалтай (хэрэглэгчийн 2026-09-01 дүрэм, `format.check.mjs` товчлолыг хориглоно);
 * мэдээлэлгүй бол «мэдээлэлгүй» (0 биш).
 */
export function bn(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return tr('мэдээлэлгүй');
  return `${num(v)} ₮`;
}

/** Утгын бичвэр — нэгжээр */
export function fmtUnit(v: number | null | undefined, unit: Unit): string {
  if (v == null || !Number.isFinite(v)) return tr('мэдээлэлгүй');
  if (unit === 'pct') return pct(v, 1);
  if (unit === 'mnt') return bn(v);
  return num(v);
}

/** Тэнхлэгийн шошго — хувь бүхлээр, мөнгө бүтэн тоогоор (нэгжийг легенд/утга заана) */
function axisLabel(v: number, unit: Unit): string {
  if (unit === 'pct') return `${num(v, 0)}%`;
  return num(Math.round(v));
}

/** Тэмдэгтийн ойролцоо өргөн (pt) */
const CH = 0.56;
const textW = (s: string, size = F) => s.length * size * CH;
function clip(s: string, maxPt: number, size = F): string {
  const max = Math.max(3, Math.floor(maxPt / (size * CH)));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
/** Үгээр мөр таслана */
export function wrapText(s: string, maxPt: number, size = F): string[] {
  const max = Math.max(8, Math.floor(maxPt / (size * CH)));
  const out: string[] = [];
  let line = '';
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${w}`.length > max) { out.push(line); line = ''; }
    line += `${line ? ' ' : ''}${w}`;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: 'start' | 'middle' | 'end' } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${o.size ?? F}" fill="${o.fill ?? INK2}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 1.5, extra = '') =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(0, w))}" height="${r1(Math.max(0, h))}" fill="${fill}" rx="${rx}"${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1, dashed = false) =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${w}"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;

/** Хэвлэлд ялгагдах 10 хэсгийн дүүргэлт — өнгө + зураасан хээ (`<pattern>`) */
const PATTERNS = `<defs>
<pattern id="hA" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${GREY3}"/><line x1="0" y1="0" x2="0" y2="5" stroke="${INK3}" stroke-width="1.4"/></pattern>
<pattern id="hB" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" fill="${GREY3}"/><line x1="0" y1="0" x2="0" y2="5" stroke="${ACCENT}" stroke-width="1.4"/></pattern>
<pattern id="hC" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#ffffff"/><circle cx="2.5" cy="2.5" r="1.1" fill="${INK3}"/></pattern>
<pattern id="hD" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="5" height="5" fill="${GREY2}"/><line x1="0" y1="0" x2="0" y2="5" stroke="${INK}" stroke-width="1"/></pattern>
</defs>`;
export const FILLS: readonly string[] = [ACCENT, GREY, GREY2, INK3, 'url(#hA)', 'url(#hB)', 'url(#hC)', 'url(#hD)', GREY3, INK2];
/** Хэсгийн дүүргэлт дээр бичвэр цагаан байх ёстой юу */
const darkFill = (i: number) => [0, 3, 9].includes(i % FILLS.length);

function svg(w: number, h: number, body: string[], label: string, defs = false): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${r1(h)}" viewBox="0 0 ${w} ${r1(h)}" role="img" aria-label="${esc(label)}">`,
    ...(defs ? [PATTERNS] : []),
    rect(0, 0, w, h, PAPER, 0),
    ...body,
    '</svg>',
  ].join('\n');
}

/** Хоосон өгөгдөл — орлуулагч */
export function emptySvg(w: number): string {
  const h = 48;
  return svg(w, h, [
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${RULE}" stroke-dasharray="4 3" rx="4"/>`,
    text(w / 2, h / 2 + 3, tr('мэдээлэлгүй'), { fill: INK3, anchor: 'middle', size: 9.5 }),
  ], tr('мэдээлэлгүй'));
}

/* ══════════ Гол үзүүлэлтийн картууд — нэг мөр ══════════ */

function kpiSvg(items: KpiItem[], w: number): string {
  if (!items.length) return emptySvg(w);
  const cols = Math.min(items.length, 5);
  const gap = 6;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = 62;
  const rows = Math.ceil(items.length / cols);
  const h = rows * ch + (rows - 1) * gap;
  const body: string[] = [];
  items.forEach((k, idx) => {
    const x = (idx % cols) * (cw + gap);
    const y = Math.floor(idx / cols) * (ch + gap);
    body.push(`<rect x="${r1(x) + 0.5}" y="${r1(y) + 0.5}" width="${r1(cw) - 1}" height="${ch - 1}" fill="${TRACK}" stroke="${RULE}" rx="4"/>`);
    body.push(text(x + 8, y + 13, clip(k.label, cw - 16, 7.5), { size: 7.5, fill: INK3 }));
    /* Утгын фонт — картанд багтах хамгийн том (15 → 12 → 9.5) */
    const big = [15, 12, 9.5, 8].find((sz) => textW(k.value, sz) <= cw - 12) ?? 8;
    body.push(text(x + 6, y + 32, clip(k.value, cw - 12, big), { size: big, weight: 700, fill: INK }));
    /* Дэд мөр ба өөрчлөлт — тус тусдаа мөрөнд (нэг мөрөнд багтахгүй) */
    if (k.sub) body.push(text(x + 8, y + 44, clip(k.sub, cw - 16, 7.5), { size: 7.5, fill: INK3 }));
    if (k.trend) body.push(text(x + 8, y + 55, clip(k.trend, cw - 16, 7.5), { size: 7.5, fill: ACCENT, weight: 600 }));
  });
  return svg(w, h, body, tr('Гол үзүүлэлт'));
}

/* ══════════ Хэвтээ багана ══════════ */

function barsSvg(items: BarItem[], unit: Unit, w: number, max?: number): string {
  const valid = items.filter((b) => b.value != null && Number.isFinite(b.value));
  if (!items.length || !valid.length) return emptySvg(w);
  const marks = items.map((b) => b.mark).filter((m): m is number => m != null && Number.isFinite(m));
  const top = Math.max(max ?? 0, ...valid.map((b) => b.value as number), ...marks, 1);
  const rowH = 15;
  const labelW = Math.round(w * 0.34);
  const texts = items.map((b) => (b.value != null && Number.isFinite(b.value) ? (b.text ?? fmtUnit(b.value, unit)) : tr('мэдээлэлгүй')));
  const valW = Math.round(Math.min(w * 0.36, Math.max(...texts.map((s) => textW(s, 8))) + 10));
  const x0 = labelW + 6;
  const trackW = w - x0 - valW - 6;
  const anyHot = items.some((b) => b.hot);
  const axisH = 14;
  const h = axisH + items.length * rowH + (marks.length ? 14 : 4);
  const body: string[] = [];
  /* Тэнхлэг — 0 · ½ · дээд */
  for (const t of [0, 0.5, 1]) {
    const x = x0 + trackW * t;
    body.push(line(x, axisH - 2, x, axisH + items.length * rowH, RULE, 0.5, t > 0));
    body.push(text(x, 8, axisLabel(top * t, unit), { size: 7, fill: INK3, anchor: t === 0 ? 'start' : t === 1 ? 'end' : 'middle' }));
  }
  items.forEach((b, i) => {
    const y = axisH + i * rowH;
    body.push(text(0, y + 10.5, clip(b.label, labelW), { fill: INK2 }));
    body.push(rect(x0, y + 3.5, trackW, 8, TRACK, 1));
    const has = b.value != null && Number.isFinite(b.value);
    if (has) {
      const bw = (trackW * Math.min(Math.max(b.value as number, 0), top)) / top;
      body.push(rect(x0, y + 3.5, Math.max(bw, 1), 8, b.hot ? ACCENT : anyHot ? GREY2 : ACCENT, 1));
    }
    if (b.mark != null && Number.isFinite(b.mark)) {
      const mx = x0 + (trackW * Math.min(Math.max(b.mark, 0), top)) / top;
      body.push(line(mx, y + 1.5, mx, y + 13.5, INK, 1.6));
    }
    body.push(text(w, y + 10.5, texts[i], { size: 8, fill: has ? INK : INK3, anchor: 'end', weight: has ? 600 : undefined }));
  });
  if (marks.length) {
    const ly = axisH + items.length * rowH + 9;
    body.push(line(x0, ly - 5, x0, ly + 2, INK, 1.6));
    body.push(text(x0 + 5, ly + 1, tr('төлөвлөгөө (хуваарь)'), { size: 7.5, fill: INK3 }));
  }
  return svg(w, h, body, tr('Багана'));
}

/* ══════════ Хугацааны шугам (+ сарын багана) ══════════ */

const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const k = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return k * p;
};

function lineSvg(months: string[], series: LineSeries[], unit: Unit, w: number, bars?: { label: string; values: (number | null)[]; unit: Unit } | null): string {
  const n = months.length;
  const anyVal = series.some((s) => s.values.some((v) => v != null && Number.isFinite(v)));
  const anyBar = !!bars && bars.values.some((v) => v != null && Number.isFinite(v) && v !== 0);
  if (!n || (!anyVal && !anyBar)) return emptySvg(w);
  const vals = series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
  const maxV = unit === 'pct' ? Math.max(100, niceMax(Math.max(...vals, 1))) : niceMax(Math.max(...vals, 1));
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((t) => axisLabel(maxV * t, unit));
  const padL = Math.ceil(Math.max(...yLabels.map((s) => textW(s, 7))) + 6);
  const bmax = bars && anyBar ? niceMax(Math.max(...bars.values.map((v) => v ?? 0), 1)) : 0;
  const padR = bars && anyBar ? Math.ceil(textW(axisLabel(bmax, bars.unit), 7) + 6) : 6;
  const top = 26;
  const h = 190;
  const bottom = 22;
  const plotH = h - top - bottom;
  const plotW = w - padL - padR;
  const xs = (i: number) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const ys = (v: number) => top + plotH - (Math.min(v, maxV) / maxV) * plotH;
  const body: string[] = [];
  /* Тор ба зүүн тэнхлэг */
  [0, 0.25, 0.5, 0.75, 1].forEach((t, k) => {
    const y = top + plotH * (1 - t);
    body.push(line(padL, y, w - padR, y, RULE, t === 0 ? 0.8 : 0.5));
    body.push(text(padL - 4, y + 2.5, yLabels[k], { size: 7, fill: INK3, anchor: 'end' }));
  });
  /* Сарын багана — баруун тэнхлэг, шугамын ард */
  if (bars && anyBar) {
    const bw = Math.max(3, Math.min(16, (plotW / n) * 0.5));
    bars.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v) || v <= 0) return;
      const bh = (plotH * Math.min(v, bmax)) / bmax;
      body.push(rect(xs(i) - bw / 2, top + plotH - bh, bw, bh, GREY3, 1));
    });
    [0.5, 1].forEach((t) => {
      const y = top + plotH * (1 - t);
      body.push(text(w - padR + 4, y + 2.5, axisLabel(bmax * t, bars.unit), { size: 7, fill: GREY, anchor: 'start' }));
    });
  }
  /* Сарын шошго — багтахаар л */
  const step = Math.max(1, Math.ceil((n * 42) / plotW));
  months.forEach((m, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    if (i !== n - 1 && i % step === 0 && n - 1 - i < step / 2) return; // сүүлийнхтэй давхцахгүй
    body.push(text(xs(i), h - 8, m, { size: 7, fill: INK3, anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }));
    body.push(line(xs(i), top + plotH, xs(i), top + plotH + 3, RULE, 0.8));
  });
  /* Шугамууд — null цоорхойд тасарна; утга ЭХНИЙ · ДЭЭД · СҮҮЛИЙН цэгт (давхцахгүй) */
  const strokes = [ACCENT, INK2, GREY];
  series.forEach((s, si) => {
    const stroke = s.dashed ? INK2 : strokes[si % strokes.length];
    let seg: string[] = [];
    const flush = () => { if (seg.length > 1) body.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${s.dashed ? 1.2 : 1.8}"${s.dashed ? ' stroke-dasharray="4 3"' : ''}/>`); seg = []; };
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { flush(); return; }
      seg.push(`${r1(xs(i))},${r1(ys(v))}`);
    });
    flush();
    const idx = s.values.map((v, i) => (v != null && Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const first = idx[0];
    const last = idx[idx.length - 1];
    const flat = idx.every((i) => s.values[i] === s.values[first]);
    const peak = idx.reduce((p, i) => ((s.values[i] as number) > (s.values[p] as number) ? i : p), first);
    const show = new Set<number>(flat ? [last] : [first, last]);
    if (!flat && peak !== first && peak !== last) show.add(peak);
    let prevEnd = -Infinity;
    for (const i of idx) {
      const v = s.values[i] as number;
      if (!s.dashed) body.push(`<circle cx="${r1(xs(i))}" cy="${r1(ys(v))}" r="2" fill="${stroke}"/>`);
      if (!show.has(i)) continue;
      const label = fmtUnit(v, unit);
      const tw = textW(label, 7.5);
      const anchor = i === last ? 'end' : i === first ? 'start' : 'middle';
      const xStart = anchor === 'end' ? xs(i) - tw : anchor === 'start' ? xs(i) : xs(i) - tw / 2;
      if (xStart < prevEnd + 4) continue; // давхцвал алгасна
      prevEnd = xStart + tw;
      const yy = Math.max(top + 8, ys(v) - 5 - (si % 2) * 9);
      body.push(text(xs(i), yy, label, { size: 7.5, fill: stroke, anchor, weight: 600 }));
    }
  });
  /* Легенд — дээд мөр */
  let lx = padL;
  const legend = [...series.map((s, si) => ({ label: s.label, color: s.dashed ? INK2 : strokes[si % strokes.length], dashed: !!s.dashed, box: false })), ...(bars && anyBar ? [{ label: bars.label, color: GREY3, dashed: false, box: true }] : [])];
  for (const l of legend) {
    body.push(l.box ? rect(lx, 5, 10, 7, GREY3, 1) : line(lx, 8.5, lx + 12, 8.5, l.color, 1.8, l.dashed));
    body.push(text(lx + 15, 11.5, l.label, { size: 7.5, fill: INK2 }));
    lx += 15 + textW(l.label, 7.5) + 12;
  }
  return svg(w, h, body, tr('Хугацааны шугам'));
}

/* ══════════ Давхарласан нэг багана (төлөв, хувь) ══════════ */

function stackedSvg(items: { label: string; value: number }[], unit: Unit, w: number): string {
  const rows = items.filter((it) => Number.isFinite(it.value) && it.value > 0);
  const total = rows.reduce((s, it) => s + it.value, 0);
  if (!rows.length || total <= 0) return emptySvg(w);
  const barH = 20;
  const legendRow = 13;
  const cols = 2;
  const legendRows = Math.ceil(rows.length / cols);
  const h = barH + 8 + legendRows * legendRow + 2;
  const body: string[] = [];
  let x = 0;
  rows.forEach((it, i) => {
    const sw = (w * it.value) / total;
    body.push(rect(x, 0, sw, barH, FILLS[i % FILLS.length], 0));
    const share = pct((it.value / total) * 100, 0);
    if (sw > textW(share, 7.5) + 6) body.push(text(x + sw / 2, barH / 2 + 3, share, { size: 7.5, fill: darkFill(i) ? PAPER : INK, anchor: 'middle', weight: 600 }));
    x += sw;
  });
  const colW = w / cols;
  rows.forEach((it, i) => {
    const cx = (i % cols) * colW;
    const y = barH + 8 + Math.floor(i / cols) * legendRow;
    body.push(rect(cx, y + 2, 9, 9, FILLS[i % FILLS.length], 1.5, ` stroke="${RULE}" stroke-width="0.4"`));
    const val = `${fmtUnit(it.value, unit)} · ${pct((it.value / total) * 100, 1)}`;
    body.push(text(cx + 13, y + 9.5, clip(it.label, colW - 20 - textW(val, 7.5), 7.5), { size: 7.5, fill: INK2 }));
    body.push(text(cx + colW - 8, y + 9.5, val, { size: 7.5, fill: INK, anchor: 'end', weight: 600 }));
  });
  return svg(w, h, body, tr('Төлөвийн бүтэц'), true);
}

/* ══════════ Жагсаалт ══════════ */

function listSvg(items: ListItem[], w: number): string {
  if (!items.length) {
    return svg(w, 30, [text(0, 18, tr('Анхаарах асуудал алга.'), { fill: INK3 })], tr('Жагсаалт'));
  }
  const lh = 11.5;
  const body: string[] = [];
  let y = 2;
  for (const it of items) {
    const lines = wrapText(it.text, w - 18);
    const toneFill = it.tone === 'bad' ? PRINT_COLORS.bad : it.tone === 'warn' ? PRINT_COLORS.warn : GREY;
    body.push(rect(0, y + 3, 3, lines.length * lh - 3, toneFill, 1));
    lines.forEach((ln, k) => body.push(text(9, y + 9.5 + k * lh, ln, { fill: it.tone === 'info' ? INK3 : INK2 })));
    y += lines.length * lh + 5;
  }
  return svg(w, y + 1, body, tr('Жагсаалт'));
}

/* ══════════ Нэгтгэл ══════════ */

/**
 * Урт баганан графикийг хуудасны хэмжээнд хуваана (`BARS_PER_CHART` мөр тутамд нэг график). Бусад төрөл хэвээр.
 * PDF ба бусад хэрэглэгч ЭНЭ нэг хуваалтыг хэрэглэнэ.
 */
export function splitSpec(spec: ChartSpec, per = BARS_PER_CHART): ChartSpec[] {
  if (spec.kind !== 'bars' || spec.items.length <= per) return [spec];
  const out: ChartSpec[] = [];
  for (let i = 0; i < spec.items.length; i += per) out.push({ ...spec, items: spec.items.slice(i, i + per) });
  return out;
}

/** Графикийн SVG — `w` өргөн (pt); өндөр нь агуулгаасаа */
export function chartSvg(spec: ChartSpec, w = CHART_W): string {
  if (spec.kind === 'kpi') return kpiSvg(spec.items, w);
  if (spec.kind === 'bars') return barsSvg(spec.items, spec.unit, w, spec.max);
  if (spec.kind === 'line') return lineSvg(spec.months, spec.series, spec.unit, w, spec.bars);
  if (spec.kind === 'stacked') return stackedSvg(spec.items, spec.unit, w);
  return listSvg(spec.items, w);
}

/** SVG-ийн өндөр (pt) — `chartSvg`-ийн гаралтаас */
export function svgHeight(s: string): number {
  const m = /<svg[^>]*\sheight="([\d.]+)"/.exec(s);
  return m ? Number(m[1]) : 0;
}

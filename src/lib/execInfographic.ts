/**
 * УДИРДЛАГЫН ИНФОГРАФИК — нэг хуудас (A4 босоо, 1240×1754 px @150dpi).
 * Шийдвэр гаргагч нэг зураг харснаар төслийн байдлыг ойлгоно; мессенжер,
 * илтгэл, мэйлд шууд хавсаргана.
 *
 * ⚠️ Өгөгдөл нь ЗӨВХӨН `ExecReport` — дэлгэц, PDF, AI дүгнэлттэй ижил эх.
 *    Энд тоо бодохгүй, зөвхөн ЗУРНА.
 *
 * ⚠️ ЗУРААС ХОЁР ГАРЦТАЙ, НЭГ ЭХТЭЙ (2026-09-17, хоёр дахь хувилбар):
 *    зурах үйлдлүүд (`Op[]`) нэг удаа угсрагдаад
 *      · `toSvg()`   — дэлгэцийн урьдчилсан харагдац (`<img src=data:svg>`)
 *      · `toPng()`   — Canvas 2D-ээр ШУУД зурж PNG (PDF-ийн 1-р хуудас ба
 *                      PNG татах)
 *    Урьд нь PNG-г SVG→`<img>`→canvas замаар авдаг байсан бөгөөд хэрэглэгч
 *    PDF-д зураг ГАРААГҮЙ гэж мэдэгдэв: `<img>`-д ачаалсан SVG-г зарим хөтөч
 *    (фонт ачаалалт дуусаагүй, data: URL-ийн хэмжээ) ХООСОН цагаанаар зурдаг.
 *    Canvas 2D нь ийм завсрын алхамгүй — текст, тэгш өнцөгт, зураас бүр шууд
 *    пиксел болно.
 *
 * ⚠️ Текстийг canvas ч, SVG ч өөрөө таслахгүй тул `wrap()`-аар ГАРААР мөр
 *    таслана. Тэмдэгтийн өргөнийг ойролцоогоор тооцно — кирилл латинаас
 *    бага зэрэг өргөн тул хязгаарыг зориуд бага барина.
 *
 * ⚠️ Өнгө ХАТУУ бичигдсэн: экспортлогдсон зураг нь аппын харанхуй/цайвар
 *    горимоос үл хамааран ЦАГААН цаасан дээр уншигдах ёстой. Утгууд нь
 *    `globals.css`-ийн цайвар палитраас (ink #1e293b · data #2e7f8b ·
 *    good #16a34a · warn #ca8a04 · bad #dc2626).
 */

import type { ExecReport } from '@/lib/execReport';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { PARCEL_CLEARED } from '@/lib/services';
import { TOLOV } from '@/lib/zovshoorol';

export const INFO_W = 1240;
export const INFO_H = 1754;

const INK = '#1e293b';
const INK2 = '#475569';
const INK3 = '#5a6a80';
const LINE = '#d5dbe3';
const SURF = '#f4f6f9';
const DATA = '#2e7f8b';
const DATA_SOFT = '#bfe0e5';
/* ⚠️ НОГООН ХАСАГДСАН (2026-09-17): хэвийн байдлыг өнгөөр тэмдэглэхээ
   болив — зөвхөн АСУУДАЛ өнгөтэй (хэрэглэгчийн шүүмж). */
const WARN = '#ca8a04';
const BAD = '#dc2626';
const FONT = "'Segoe UI', 'Noto Sans', Arial, sans-serif";

/* ═══════════════ Зурах үйлдлүүд ═══════════════ */

type Anchor = 'start' | 'middle' | 'end';
type TextOp = { k: 'text'; x: number; y: number; s: string; size: number; weight: number; fill: string; anchor: Anchor };
type RectOp = { k: 'rect'; x: number; y: number; w: number; h: number; fill: string; r: number; stroke?: string };
type LineOp = { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number };
export type Op = TextOp | RectOp | LineOp;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** SVG мөр — дэлгэцийн урьдчилсан харагдац */
export function toSvg(ops: Op[]): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${INFO_W}" height="${INFO_H}" viewBox="0 0 ${INFO_W} ${INFO_H}">`,
  ];
  for (const o of ops) {
    if (o.k === 'text') {
      out.push(`<text x="${o.x}" y="${o.y}" font-family="${FONT}" font-size="${o.size}" font-weight="${o.weight}" fill="${o.fill}" text-anchor="${o.anchor}">${esc(o.s)}</text>`);
    } else if (o.k === 'rect') {
      out.push(`<rect x="${o.x}" y="${o.y}" width="${Math.max(0, o.w)}" height="${o.h}" fill="${o.fill}" rx="${o.r}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="1"` : ''}/>`);
    } else {
      out.push(`<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.stroke}" stroke-width="${o.width}"/>`);
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

/**
 * Canvas 2D → PNG data URL. `scale` 2 = 300dpi (PNG татахад), 1 = PDF-д.
 * ⚠️ `roundRect` нь 2023 оноос бүх хөтөчид байгаа ч хуучин хөтөчид байхгүй
 *    байж болно — тэр үед энгийн `fillRect` (булан л алдагдана, зураг биш).
 */
export function toPng(ops: Op[], scale = 1): string {
  const c = document.createElement('canvas');
  c.width = INFO_W * scale;
  c.height = INFO_H * scale;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error(tr('Инфографик зурахад алдаа гарлаа.'));
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function' && r > 0) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };
  for (const o of ops) {
    if (o.k === 'text') {
      ctx.font = `${o.weight >= 600 ? 'bold' : 'normal'} ${o.size}px ${FONT}`;
      ctx.fillStyle = o.fill;
      ctx.textAlign = o.anchor === 'middle' ? 'center' : o.anchor === 'end' ? 'right' : 'left';
      ctx.fillText(o.s, o.x, o.y);
    } else if (o.k === 'rect') {
      const w = Math.max(0, o.w);
      if (w <= 0 || o.h <= 0) continue;
      rr(o.x, o.y, w, o.h, o.r);
      ctx.fillStyle = o.fill;
      ctx.fill();
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    } else {
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.width;
      ctx.stroke();
    }
  }
  return c.toDataURL('image/png');
}

/* ═══════════════ Туслах ═══════════════ */

/** Тоймлосон мөнгө — инфографикт бүтэн 15 оронтой дүн багтахгүй */
/* ⚠️ МӨНГӨНИЙ ТОВЧЛОЛГҮЙ (2026-09-17, merge): «сая/тэрбум ₮» нь порталын дүрмээр
   хориотой (`format.check.mjs`, хэрэглэгчийн шаардлага — дүнг бүтнээр). Инфографикт
   ч бүтэн тоо: `1,234,567,890 ₮`. */
export const money = (v: number): string => (!Number.isFinite(v) || v === 0 ? '—' : `${num(v)} ₮`);

/** Мөр таслах — үгээр, ойролцоо өргөнөөр */
export function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (cand.length > maxChars && line) { out.push(line); line = w; }
      else line = cand;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Нэрийг өгсөн пикселд багтаах — 12px фонтод ~6.3px/тэмдэгт */
const clip = (s: string, px: number, size = 12): string => {
  const max = Math.max(6, Math.floor(px / (size * 0.53)));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

class Painter {
  ops: Op[] = [];
  text(x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: Anchor } = {}) {
    this.ops.push({ k: 'text', x, y, s, size: o.size ?? 14, weight: o.weight ?? 400, fill: o.fill ?? INK, anchor: o.anchor ?? 'start' });
  }
  rect(x: number, y: number, w: number, h: number, fill: string, r = 0, stroke?: string) {
    this.ops.push({ k: 'rect', x, y, w, h, fill, r, stroke });
  }
  line(x1: number, y1: number, x2: number, y2: number, stroke = LINE, width = 1) {
    this.ops.push({ k: 'line', x1, y1, x2, y2, stroke, width });
  }
  /** Хэсгийн гарчиг — дугаартай, доор нь зураас */
  head(x: number, y: number, w: number, no: string, title: string, sub?: string) {
    this.text(x, y, `${no ? `${no}  ` : ''}${title}`, { size: 15, weight: 700 });
    if (sub) this.text(x + w, y, sub, { size: 11, fill: INK3, anchor: 'end' });
    this.line(x, y + 8, x + w, y + 8, INK, 1.2);
  }
  /** Хэвтээ багана — нэр · зурвас · утга */
  hbar(
    x: number, y: number, w: number, label: string, frac: number, val: string,
    o: { color?: string; hot?: boolean; nameW?: number; valW?: number } = {},
  ) {
    const nameW = o.nameW ?? 170;
    const valW = o.valW ?? 150;
    const trackX = x + nameW;
    const trackW = w - nameW - valW - 8;
    const f = Math.max(0, Math.min(1, frac));
    this.text(x, y + 11, clip(label, nameW - 10), { size: 12, fill: INK2 });
    this.rect(trackX, y, trackW, 14, SURF, 3);
    this.rect(trackX, y, trackW * f, 14, o.color ?? (o.hot ? DATA : DATA_SOFT), 3);
    this.text(x + w, y + 11, val, { size: 12, weight: 600, anchor: 'end' });
  }
  /** KPI хавтан */
  tile(x: number, y: number, w: number, h: number, label: string, value: string, sub?: string) {
    this.rect(x, y, w, h, '#fff', 8, LINE);
    this.rect(x, y, 4, h, DATA, 2);
    this.text(x + 16, y + 24, label, { size: 11, fill: INK3 });
    this.text(x + 16, y + 56, value, { size: value.length > 16 ? 20 : 26, weight: 700 });
    if (sub) this.text(x + 16, y + h - 12, clip(sub, w - 28, 10.5), { size: 10.5, fill: INK3 });
  }
  /** Нэг зурвас, өнгөт хэсгүүд + домог */
  segments(x: number, y: number, w: number, segs: [number, string, string][], h = 18): number {
    const total = segs.reduce((a, s) => a + s[0], 0);
    let sx = x;
    for (const [n, c] of segs) {
      const sw = total ? (w * n) / total : 0;
      this.rect(sx, y, sw, h, c);
      if (sw > 28) this.text(sx + sw / 2, y + h - 5, String(n), { size: 11, weight: 700, fill: '#fff', anchor: 'middle' });
      sx += sw;
    }
    let gx = x;
    const ly = y + h + 16;
    for (const [n, c, lb] of segs) {
      this.rect(gx, ly - 9, 10, 10, c, 2);
      const s = `${lb} ${n}`;
      this.text(gx + 14, ly, s, { size: 10.5, fill: INK3 });
      gx += 14 + s.length * 6 + 14;
    }
    return ly + 20;
  }
}

/* ═══════════════ Угсрах ═══════════════ */

/**
 * Инфографикийн зурах үйлдлүүд.
 * @param summary AI дүгнэлт (байвал) — байхгүй бол дүрэмд суурилсан олдвор
 */
export function buildInfographic(
  x: ExecReport, dateStr: string, findings: string[], summary: string | null,
): Op[] {
  const P = new Painter();
  const M = 52;
  const W = INFO_W - M * 2;
  P.rect(0, 0, INFO_W, INFO_H, '#fff');

  /* ── Толгой ── */
  let y = 60;
  P.rect(0, 0, INFO_W, 8, DATA);
  P.text(M, y, tr('Сэлбэ ухаалаг хот'), { size: 30, weight: 800 });
  P.text(M + W, y, dateStr, { size: 13, fill: INK3, anchor: 'end' });
  y += 28;
  P.text(M, y, tr('Удирдлагын товч тайлан, төслийн өнөөдрийн байдал'), { size: 14, fill: INK2 });
  y += 20;

  /* ── KPI зургаан хавтан ── */
  const g = x.gdash;
  const tiles: [string, string, string?][] = [
    [tr('Нийт төсөв'), money(g.budget), tr('Excel-ийн нийт хамрах хүрээ')],
    [tr('Нийт гэрээлсэн дүн'), money(g.contract), g.budget > 0 ? tr('төсвийн {0}', pct((g.contract / g.budget) * 100, 1)) : undefined],
    [tr('Төслийн гүйцэтгэл'), g.progress == null ? '—' : pct(g.progress, 1), tr('6 шатны жигнэсэн хувь')],
    /* ⚠️ 2026-09-21: «гэрээлсэн» — §1-ийн «Нийт гэрээлсэн дүн»-тэй нэг нэр («гэрээний» биш) */
    [tr('Олгосон санхүүжилт'), money(x.fin.given), x.fin.share == null ? undefined : tr('гэрээлсэн дүнгийн {0}', pct(x.fin.share, 1))],
    [tr('Газар чөлөөлөлт'), g.landPct == null ? '—' : pct(g.landPct, 1), tr('{0} нэгж талбар үлдсэн', num(g.land.remaining))],
    [tr('Багц ажил'), num(g.packages), tr('{0} төрөл · {1} блок · {2} өрх', num(g.types), num(x.prog.blocks), num(x.prog.households))],
  ];
  const tw = (W - 14 * 2) / 3;
  const th = 84;
  tiles.forEach((t, i) => {
    P.tile(M + (i % 3) * (tw + 14), y + Math.floor(i / 3) * (th + 10), tw, th, t[0], t[1], t[2]);
  });
  y += th * 2 + 10 + 34;

  const colW = (W - 36) / 2;
  const L = M;
  const R = M + colW + 36;

  /* ═══ 1-р эгнээ: 05 гүйцэтгэл | 04 санхүү ═══ */
  const y1 = y;
  let yl = y1;
  P.head(L, yl, colW, '', tr('Багцын гүйцэтгэл'), x.prog.asOf ? tr('хэмжилт {0}', x.prog.asOf) : undefined);
  yl += 32;
  const p = x.prog;
  P.text(L, yl, tr('Орон сууцны барилга угсралт (төлөвлөгөө ба бодит)'), { size: 12, fill: INK2 });
  yl += 10;
  const late = p.gap != null && p.gap >= 5;
  P.hbar(L, yl, colW, tr('Төлөвлөгөө'), (p.planned ?? 0) / 100, p.planned == null ? '—' : pct(p.planned, 1), { color: DATA_SOFT, nameW: 100, valW: 80 });
  yl += 20;
  P.hbar(L, yl, colW, tr('Бодит'), (p.actual ?? 0) / 100, p.actual == null ? '—' : pct(p.actual, 1), { color: late ? WARN : DATA, nameW: 100, valW: 80 });
  yl += 20;
  if (p.gap != null) {
    const s = p.gap >= 0 ? tr('Хоцрогдол {0} нэгж хувь', num(p.gap, 1)) : tr('Түрүүлэлт {0} нэгж хувь', num(-p.gap, 1));
    /* ⚠️ Хоцрогдол бол УЛААН, бусад тохиолдолд өнгөгүй (хэвийн байдлыг
       өнгөөр тэмдэглэхээ больсон — зөвхөн асуудал өнгөтэй) */
    P.text(L + colW, yl + 6, s, { size: 11.5, weight: 600, fill: late ? BAD : INK2, anchor: 'end' });
  }
  yl += 26;
  P.text(L, yl, tr('Багц тус бүрийн биет гүйцэтгэл'), { size: 12, fill: INK2 });
  yl += 10;
  const buildPk = p.packs.filter((k) => k.kind === 'build').sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
  const best = buildPk.reduce((m, k) => Math.max(m, k.progress ?? 0), 0);
  for (const k of buildPk.slice(0, 8)) {
    const v = k.progress;
    P.hbar(L, yl, colW, k.name, v == null ? 0 : v / 100, v == null ? tr('мэдээлэлгүй') : pct(v, 1), { hot: v != null && v === best && v > 0, nameW: 120, valW: 80 });
    yl += 20;
  }
  yl += 14;
  P.text(L, yl, tr('Блокийн гүйцэтгэлийн түвшин ({0} блок, {1} бөглөгдөөгүй)', num(p.blocks), num(p.noData)), { size: 12, fill: INK2 });
  yl += 10;
  yl = P.segments(L, yl, colW, p.levels.map((l) => [l.n, l.color, `${l.label} ${l.range}`]), 16);

  let yr = y1;
  P.head(R, yr, colW, '', tr('Багцын санхүү'));
  yr += 32;
  const f = x.fin;
  P.text(R, yr, tr('Гэрээний дүн ба олгосон санхүүжилт'), { size: 12, fill: INK2 });
  yr += 10;
  P.hbar(R, yr, colW, tr('Гэрээ'), 1, money(f.planTotal), { color: DATA_SOFT, nameW: 100, valW: 140 });
  yr += 20;
  P.hbar(R, yr, colW, tr('Олгосон'), f.planTotal > 0 ? f.given / f.planTotal : 0, money(f.given), { color: DATA, nameW: 100, valW: 140 });
  yr += 20;
  if (f.share != null) P.text(R + colW, yr + 6, tr('{0} олгогдсон · үлдэгдэл {1}', pct(f.share, 1), money(f.remain)), { size: 11.5, weight: 600, fill: INK2, anchor: 'end' });
  yr += 26;
  P.text(R, yr, tr('Багц тус бүр (олгосон / гэрээ)'), { size: 12, fill: INK2 });
  yr += 10;
  for (const r of f.rows.slice(0, 10)) {
    P.hbar(R, yr, colW, r.label, (r.pct ?? 0) / 100, r.pct == null ? money(r.given) : `${pct(r.pct, 1)} · ${money(r.given)}`, { hot: r.pct != null && r.pct >= 50, nameW: 110, valW: 200 });
    yr += 20;
  }
  y = Math.max(yl, yr) + 30;

  /* ═══ 2-р эгнээ: Газар чөлөөлөлт | ХАБ ═══ */
  const y2 = y;
  yl = y2;
  P.head(L, yl, colW, '', tr('Газар чөлөөлөлт'), tr('{0} нэгж талбар · {1} м²', num(g.land.total), num(g.land.areaM2)));
  yl += 32;
  /**
   * ⚠️ ГУРВАН ӨНГӨ (2026-09-17, хэрэглэгчийн шүүмж: «хэт олон өнгө байгаад
   * байна», «асуудалтай хэсгүүдийг л улаанаар»). Урьд нь таван өнгөний
   * ээлжлэх палитр байсан тул өнгө нь УТГА хэлэхээ больж, зүгээр л ялгах
   * тэмдэг болж хувирсан байв.
   *   · DATA      — хэвийн (чөлөөлсөн)
   *   · BAD улаан — АСУУДАЛ (чөлөөлөгдөөгүй бүх төлөв)
   * ⚠️ Чөлөөлсөн төлөв ТҮҮХИЙ утгаар (`PARCEL_CLEARED`) — `land.ts`-тэй ижил.
   */
  const stSegs: [number, string, string][] = g.land.byStatus.map((b) => [
    b.n, b.label === PARCEL_CLEARED ? DATA : BAD, b.label,
  ]);
  if (stSegs.length) yl = P.segments(L, yl, colW, stSegs, 18);
  yl += 4;
  P.text(L, yl, tr('Чөлөөгдөөгүй шалтгаанаар ({0} нэгж талбар)', num(g.land.remaining)), { size: 12, fill: INK2 });
  yl += 10;
  const topReason = g.land.reasons[0]?.n ?? 0;
  if (!g.land.reasons.length) { P.text(L, yl + 11, tr('Шалтгаан бүртгэгдээгүй'), { size: 11.5, fill: INK3 }); yl += 20; }
  for (const r of g.land.reasons.slice(0, 5)) {
    /* ⚠️ Чөлөөлөгдөөгүй шалтгаан бүр АСУУДАЛ тул улаан */
    P.hbar(L, yl, colW, r.label, topReason ? r.n / topReason : 0, num(r.n), { color: BAD, nameW: 210, valW: 60 });
    yl += 20;
  }

  yr = y2;
  P.head(R, yr, colW, '', tr('ХАБ-ын талбайн хүн хүч'), g.hse?.date ? tr('сүүлийн бүртгэл {0}', g.hse.date) : undefined);
  yr += 32;
  if (!g.hse) {
    P.text(R, yr + 8, tr('ХАБ-ын бүртгэл алга, мэдээлэлгүй.'), { size: 12, fill: INK3 });
    yr += 28;
  } else {
    const hw = (colW - 12 * 2) / 3;
    const hs: [string, string][] = [
      [tr('Ажиллаж буй хүн'), num(g.hse.workers)],
      [tr('Техник хэрэгсэл'), num(g.hse.equipment)],
      [tr('Хүн цаг'), num(g.hse.manHours)],
    ];
    hs.forEach((t, i) => P.tile(R + i * (hw + 12), yr, hw, 76, t[0], t[1]));
    yr += 76 + 14;
    P.text(R, yr, tr('Тоо нь өдөр тутмын хуримтлал биш, сүүлийн бүртгэлийн агшны байдал.'), { size: 10.5, fill: INK3 });
    yr += 16;
  }
  y = Math.max(yl, yr) + 30;

  /* ═══ 3-р эгнээ: Зөвшөөрөл | 01 ажлын төрөл ═══ */
  const y3 = y;
  yl = y3;
  P.head(L, yl, colW, '', tr('Зөвшөөрөл'), x.zov ? tr('Нийт {0} зөвшөөрөл · {1} багц', num(x.zov.total), num(x.zov.byBagts.length)) : undefined);
  yl += 32;
  if (!x.zov) {
    P.text(L, yl + 4, tr('Зөвшөөрлийн бүртгэл холбогдоогүй, мэдээлэлгүй.'), { size: 12, fill: INK3 });
    yl += 24;
  } else {
    const z = x.zov;
    yl = P.segments(L, yl, colW, [
      [z.ok, DATA, tr('Зөвшөөрсөн')], [z.wait, WARN, tr('Хүлээгдэж буй')],
      [z.no, BAD, tr('Зөвшөөрөөгүй')], [z.unknown, INK3, tr('Танигдаагүй')],
    ], 20);
    yl += 4;
    /**
     * ⚠️ ХҮЛЭЭГДЭЖ БУЙ / ЗӨВШӨӨРӨӨГҮЙ нь ХААНА байгаа нь ил (2026-09-17,
     * хэрэглэгчийн шүүмж: «хүлээгдэж буй зөвшөөрлийн газар харагдмаар
     * байна»). Урьд нь багц бүрийн «2/3» гэсэн харьцаа л байсан тул
     * ЯМАР зөвшөөрөл, ХЭН дээр саатаж байгаа нь огт харагддаггүй байв.
     */
    if (!z.issues.length) {
      P.text(L, yl + 11, tr('Бүх зөвшөөрөл зөвшөөрөгдсөн.'), { size: 11.5, fill: INK3 });
      yl += 22;
    }
    for (const it of z.issues.slice(0, 7)) {
      const bad = it.tolov === TOLOV.no;
      P.rect(L, yl + 3, 8, 8, bad ? BAD : WARN, 2);
      P.text(L + 14, yl + 11, clip(`${it.bagts} · ${it.ner}`, colW - 150), { size: 11.5, fill: INK2 });
      P.text(L + colW, yl + 11, clip(`${it.baiguullaga || '—'} · ${tr(it.tolov)}`, 140, 11), { size: 11, fill: bad ? BAD : INK3, anchor: 'end' });
      yl += 19;
    }
  }

  yr = y3;
  P.head(R, yr, colW, '', tr('Ажлын төрлөөр (төсөв, гэрээ, гүйцэтгэл)'));
  yr += 32;
  const top = g.byType[0]?.cost ?? 0;
  const nameW = 170, valW = 215;
  for (const t of g.byType.slice(0, 7)) {
    P.hbar(R, yr, colW, t.label, top ? t.cost / top : 0, `${money(t.cost)} · ${t.perf == null ? '—' : pct(t.perf, 1)}`, { color: DATA_SOFT, nameW, valW });
    P.rect(R + nameW, yr, top ? ((colW - nameW - valW - 8) * t.contract) / top : 0, 14, DATA, 3);
    yr += 20;
  }
  yr += 4;
  P.rect(R, yr - 9, 10, 10, DATA, 2);
  P.text(R + 14, yr, tr('гэрээлсэн'), { size: 10.5, fill: INK3 });
  P.rect(R + 90, yr - 9, 10, 10, DATA_SOFT, 2);
  P.text(R + 104, yr, tr('төсөв · ард нь гүйцэтгэлийн хувь'), { size: 10.5, fill: INK3 });
  yr += 14;
  y = Math.max(yl, yr) + 30;

  /* ═══ Дүгнэлт ═══ */
  const bottom = INFO_H - 46;
  P.head(M, y, W, '', summary ? tr('AI дүгнэлт') : tr('Анхаарах асуудал'));
  y += 26;
  /**
   * ⚠️ ДУГААРЛАСАН, БАГЦАА НЭРЛЭСЭН (2026-09-17, хэрэглэгчийн шүүмж: «аль
   * багц дээр ямар ажил дээр гэдгийг дараалалтай харуулмаар байна»).
   * Урьд нь «•» гэсэн ялгаагүй цэгүүд байсан тул аль нь эхэнд, аль нь
   * чухал болох нь уншигдахгүй байв.
   */
  const body = summary ?? findings.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const lines = wrap(body, 140);
  const lh = 19;
  const maxLines = Math.max(0, Math.floor((bottom - y - 6) / lh));
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) shown[shown.length - 1] = `${shown[shown.length - 1].slice(0, 135)}…`;
  for (const ln of shown) {
    const isHead = /^[^•*·-][^:]{1,40}:$/.test(ln.trim());
    P.text(M, y + 13, ln, { size: 13, weight: isHead ? 700 : 400, fill: isHead ? INK : INK2 });
    y += lh;
  }

  /* ── Хөл ── */
  P.line(M, INFO_H - 32, M + W, INFO_H - 32, LINE);
  P.text(M, INFO_H - 14, tr('Эх сурвалж: Сэлбэ порталын Ерөнхий дашбоард · Багцын гүйцэтгэл · Багцын санхүү · Зөвшөөрөл. Тайлан үүсгэсэн огнооны байдлаар.'), { size: 10, fill: INK3 });
  P.text(M + W, INFO_H - 14, dateStr, { size: 10, fill: INK3, anchor: 'end' });
  return P.ops;
}

/** Дэлгэцийн урьдчилсан харагдацад — SVG data URL */
export function infographicSvgUrl(ops: Op[]): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(ops))}`;
}

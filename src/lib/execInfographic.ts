/**
 * УДИРДЛАГЫН ИНФОГРАФИК — нэг хуудас (A4 босоо, 1240×1754 px @150dpi) SVG →
 * PNG. Шийдвэр гаргагч нэг зураг харснаар төслийн байдлыг ойлгоно; мессенжер,
 * илтгэл, мэйлд шууд хавсаргана.
 *
 * ⚠️ Өгөгдөл нь ЗӨВХӨН `ExecReport` — дэлгэц, PDF, AI дүгнэлттэй ижил эх.
 *    Энд тоо бодохгүй, зөвхөн ЗУРНА.
 *
 * ⚠️ SVG-г canvas-аар PNG болгодог тул ГАДНЫ ФОНТ, CSS хувьсагч, `foreignObject`
 *    хэрэглэхгүй — Chrome нь `<img>`-д ачаалсан SVG дотроос гадаад нөөц
 *    (`@font-face`, `<image href>`) татдаггүй, зураг хоосон гардаг. Системийн
 *    фонт (Segoe UI / Arial) кириллийг бүрэн дэмждэг.
 *
 * ⚠️ Текстийг SVG өөрөө таслахгүй тул `wrap()`-аар ГАРААР мөр таслана.
 *    Тэмдэгтийн өргөнийг ойролцоогоор (0.52 × фонтын хэмжээ) тооцно —
 *    кирилл нь латинаас бага зэрэг өргөн тул хязгаарыг зориуд бага барина.
 *
 * ⚠️ Өнгө ХАТУУ бичигдсэн: экспортлогдсон зураг нь аппын харанхуй/цайвар
 *    горимоос үл хамааран ЦАГААН цаасан дээр уншигдах ёстой. Утгууд нь
 *    `globals.css`-ийн цайвар палитраас (ink #1e293b · data #2e7f8b ·
 *    good #16a34a · warn #ca8a04 · bad #dc2626).
 */

import type { ExecReport } from '@/lib/execReport';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';

export const INFO_W = 1240;
export const INFO_H = 1754;

const INK = '#1e293b';
const INK2 = '#475569';
const INK3 = '#5a6a80';
const LINE = '#d5dbe3';
const SURF = '#f4f6f9';
const DATA = '#2e7f8b';
const DATA_SOFT = '#bfe0e5';
const GOOD = '#16a34a';
const WARN = '#ca8a04';
const BAD = '#dc2626';
const FONT = "'Segoe UI', 'Noto Sans', Arial, sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

const text = (
  x: number, y: number, s: string,
  o: { size?: number; weight?: number | string; fill?: string; anchor?: 'start' | 'middle' | 'end'; family?: string } = {},
) =>
  `<text x="${x}" y="${y}" font-family="${o.family ?? FONT}" font-size="${o.size ?? 14}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'start'}">${esc(s)}</text>`;

const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0, extra = '') =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${h}" fill="${fill}" rx="${r}" ${extra}/>`;

/** Хэсгийн гарчиг — дугаартай, доор нь зураас */
function head(x: number, y: number, w: number, no: string, title: string, sub?: string): string {
  return [
    text(x, y, `${no ? `${no}  ` : ''}${title.toUpperCase()}`, { size: 15, weight: 700, fill: INK }),
    sub ? text(x + w, y, sub, { size: 11, fill: INK3, anchor: 'end' }) : '',
    `<line x1="${x}" y1="${y + 8}" x2="${x + w}" y2="${y + 8}" stroke="${INK}" stroke-width="1.2"/>`,
  ].join('');
}

/** Хэвтээ багана — нэр · зурвас · утга */
function hbar(
  x: number, y: number, w: number, label: string, frac: number, val: string,
  o: { color?: string; hot?: boolean; nameW?: number; valW?: number; maxChars?: number } = {},
): string {
  const nameW = o.nameW ?? 170;
  /* ⚠️ Нэрийн багана 12px фонтод ~6.3px/тэмдэгт — багтахгүй нэрийг таслана */
  o.maxChars = o.maxChars ?? Math.max(8, Math.floor((nameW - 10) / 6.3));
  const valW = o.valW ?? 150;
  const trackX = x + nameW;
  const trackW = w - nameW - valW - 8;
  const f = Math.max(0, Math.min(1, frac));
  return [
    text(x, y + 11, label.length > o.maxChars! ? `${label.slice(0, o.maxChars! - 1)}…` : label, { size: 12, fill: INK2 }),
    rect(trackX, y, trackW, 14, SURF, 3),
    rect(trackX, y, trackW * f, 14, o.color ?? (o.hot ? DATA : DATA_SOFT), 3),
    text(x + w, y + 11, val, { size: 12, weight: 600, fill: INK, anchor: 'end' }),
  ].join('');
}

/** KPI хавтан */
function tile(x: number, y: number, w: number, h: number, label: string, value: string, sub?: string): string {
  return [
    rect(x, y, w, h, '#fff', 8, `stroke="${LINE}" stroke-width="1"`),
    rect(x, y, 4, h, DATA, 2),
    text(x + 16, y + 24, label, { size: 11, fill: INK3 }),
    text(x + 16, y + 58, value, { size: value.length > 16 ? 20 : 26, weight: 700, fill: INK }),
    sub ? text(x + 16, y + h - 12, sub, { size: 10.5, fill: INK3 }) : '',
  ].join('');
}

/**
 * Инфографикийн SVG мөр.
 * @param summary AI дүгнэлт (байвал) — байхгүй бол дүрэмд суурилсан олдвор
 */
export function buildInfographicSvg(
  x: ExecReport, dateStr: string, findings: string[], summary: string | null,
): string {
  const M = 56;
  const W = INFO_W - M * 2;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${INFO_W}" height="${INFO_H}" viewBox="0 0 ${INFO_W} ${INFO_H}">`);
  parts.push(rect(0, 0, INFO_W, INFO_H, '#fff'));

  /* ── Толгой ── */
  let y = 64;
  parts.push(rect(0, 0, INFO_W, 8, DATA));
  parts.push(text(M, y, tr('Сэлбэ 20 минутын хот'), { size: 30, weight: 800 }));
  parts.push(text(M + W, y, dateStr, { size: 13, fill: INK3, anchor: 'end' }));
  y += 30;
  parts.push(text(M, y, tr('Удирдлагын товч тайлан — төслийн өнөөдрийн байдал нэг хуудсанд'), { size: 14, fill: INK2 }));
  y += 22;

  /* ── KPI зургаан хавтан ── */
  const g = x.gdash;
  const tiles: [string, string, string?][] = [
    [tr('Нийт төсөв'), money(g.budget), tr('Excel-ийн нийт хамрах хүрээ')],
    [tr('Нийт гэрээлсэн дүн'), money(g.contract), g.budget > 0 ? tr('төсвийн {0}', pct((g.contract / g.budget) * 100, 1)) : undefined],
    [tr('Төслийн гүйцэтгэл'), g.progress == null ? '—' : pct(g.progress, 1), tr('6 шатны жигнэсэн хувь')],
    [tr('Олгосон санхүүжилт'), money(x.fin.given), x.fin.share == null ? undefined : tr('гэрээний {0}', pct(x.fin.share, 1))],
    [tr('Газар чөлөөлөлт'), g.landPct == null ? '—' : pct(g.landPct, 1), tr('{0} нэгж талбар үлдсэн', num(g.land.remaining))],
    [tr('Багц ажил'), num(g.packages), tr('{0} төрөл · {1} блок · {2} өрх', num(g.types), num(x.prog.blocks), num(x.prog.households))],
  ];
  const tw = (W - 16 * 2) / 3;
  const th = 92;
  tiles.forEach((t, i) => {
    const cx = M + (i % 3) * (tw + 16);
    const cy = y + Math.floor(i / 3) * (th + 12);
    parts.push(tile(cx, cy, tw, th, t[0], t[1], t[2]));
  });
  y += th * 2 + 12 + 40;

  /* ── Хоёр багана: зүүн — гүйцэтгэл, баруун — санхүү ── */
  const colW = (W - 40) / 2;
  const L = M;
  const R = M + colW + 40;
  const yTop = y;

  /* Зүүн: 05. Багцын гүйцэтгэл */
  let yl = yTop;
  parts.push(head(L, yl, colW, '05', tr('Багцын гүйцэтгэл'), x.prog.asOf ? tr('хэмжилт {0}', x.prog.asOf) : undefined));
  yl += 34;
  const p = x.prog;
  /* Төлөвлөгөө vs бодит — хоёр зурвас */
  parts.push(text(L, yl, tr('Орон сууцны барилга угсралт — төлөвлөгөө ба бодит'), { size: 12, fill: INK2 }));
  yl += 12;
  const planF = p.planned == null ? 0 : p.planned / 100;
  const actF = p.actual == null ? 0 : p.actual / 100;
  const late = p.gap != null && p.gap >= 5;
  parts.push(hbar(L, yl, colW, tr('Төлөвлөгөө'), planF, p.planned == null ? '—' : pct(p.planned, 1), { color: DATA_SOFT, nameW: 110, valW: 90 }));
  yl += 22;
  parts.push(hbar(L, yl, colW, tr('Бодит'), actF, p.actual == null ? '—' : pct(p.actual, 1), { color: late ? WARN : DATA, nameW: 110, valW: 90 }));
  yl += 22;
  if (p.gap != null) {
    const s = p.gap >= 0 ? tr('Хоцрогдол {0} нэгж хувь', num(p.gap, 1)) : tr('Түрүүлэлт {0} нэгж хувь', num(-p.gap, 1));
    parts.push(text(L + colW, yl + 6, s, { size: 11.5, weight: 600, fill: late ? WARN : GOOD, anchor: 'end' }));
  }
  yl += 30;
  /* Багц бүрийн гүйцэтгэл — орон сууцны багцууд */
  parts.push(text(L, yl, tr('Багц тус бүрийн биет гүйцэтгэл'), { size: 12, fill: INK2 }));
  yl += 12;
  const buildPk = p.packs.filter((k) => k.kind === 'build').sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
  const best = buildPk.reduce((m, k) => Math.max(m, k.progress ?? 0), 0);
  for (const k of buildPk.slice(0, 10)) {
    const v = k.progress;
    parts.push(hbar(L, yl, colW, k.name, v == null ? 0 : v / 100,
      v == null ? tr('мэдээлэлгүй') : pct(v, 1), { hot: v != null && v === best && v > 0, nameW: 130, valW: 90 }));
    yl += 22;
  }
  /* Блокийн түвшин — нэг зурвас, өнгөт хэсгүүд */
  yl += 10;
  parts.push(text(L, yl, tr('Блокийн гүйцэтгэлийн түвшин ({0} блок, {1} бөглөгдөөгүй)', num(p.blocks), num(p.noData)), { size: 12, fill: INK2 }));
  yl += 12;
  const lvSum = p.levels.reduce((a, l) => a + l.n, 0);
  let lx = L;
  for (const l of p.levels) {
    const w = lvSum ? (colW * l.n) / lvSum : 0;
    parts.push(rect(lx, yl, w, 16, l.color));
    if (w > 28) parts.push(text(lx + w / 2, yl + 12, String(l.n), { size: 11, weight: 700, fill: '#fff', anchor: 'middle' }));
    lx += w;
  }
  yl += 24;
  let lgx = L;
  for (const l of p.levels) {
    parts.push(rect(lgx, yl - 9, 10, 10, l.color, 2));
    const s = `${l.label} ${l.range}`;
    parts.push(text(lgx + 14, yl, s, { size: 10.5, fill: INK3 }));
    lgx += 14 + s.length * 5.9 + 14;
  }
  yl += 16;

  /* Баруун: 04. Багцын санхүү */
  let yr = yTop;
  parts.push(head(R, yr, colW, '04', tr('Багцын санхүү')));
  yr += 34;
  const f = x.fin;
  parts.push(text(R, yr, tr('Гэрээний дүн ба олгосон санхүүжилт'), { size: 12, fill: INK2 }));
  yr += 12;
  parts.push(hbar(R, yr, colW, tr('Гэрээ'), 1, money(f.planTotal), { color: DATA_SOFT, nameW: 110, valW: 150 }));
  yr += 22;
  parts.push(hbar(R, yr, colW, tr('Олгосон'), f.planTotal > 0 ? f.given / f.planTotal : 0, money(f.given), { color: DATA, nameW: 110, valW: 150 }));
  yr += 22;
  parts.push(text(R + colW, yr + 6, f.share == null ? '' : tr('{0} олгогдсон · үлдэгдэл {1}', pct(f.share, 1), money(f.remain)), { size: 11.5, weight: 600, fill: INK2, anchor: 'end' }));
  yr += 30;
  parts.push(text(R, yr, tr('Багц тус бүр — олгосон / гэрээ'), { size: 12, fill: INK2 }));
  yr += 12;
  for (const r of f.rows.slice(0, 12)) {
    parts.push(hbar(R, yr, colW, r.label, r.pct == null ? 0 : r.pct / 100,
      r.pct == null ? money(r.given) : `${pct(r.pct, 1)} · ${money(r.given)}`, { hot: r.pct != null && r.pct >= 50, nameW: 130, valW: 190 }));
    yr += 22;
  }

  y = Math.max(yl, yr) + 34;

  /* ── Зөвшөөрөл ба ажлын төрөл — хоёр багана ── */
  const y2 = y;
  let yz = y2;
  parts.push(head(L, yz, colW, '', tr('Зөвшөөрөл')));
  yz += 34;
  if (!x.zov) {
    parts.push(text(L, yz + 4, tr('Зөвшөөрлийн бүртгэл холбогдоогүй — мэдээлэлгүй.'), { size: 12, fill: INK3 }));
    yz += 24;
  } else {
    const z = x.zov;
    const segs: [number, string, string][] = [
      [z.ok, GOOD, tr('Зөвшөөрсөн')], [z.wait, WARN, tr('Хүлээгдэж буй')],
      [z.no, BAD, tr('Зөвшөөрөөгүй')], [z.unknown, INK3, tr('Танигдаагүй')],
    ];
    let sx = L;
    for (const [n, c] of segs) {
      const w = z.total ? (colW * n) / z.total : 0;
      parts.push(rect(sx, yz, w, 22, c));
      if (w > 30) parts.push(text(sx + w / 2, yz + 16, String(n), { size: 12, weight: 700, fill: '#fff', anchor: 'middle' }));
      sx += w;
    }
    yz += 34;
    let gx = L;
    for (const [n, c, lb] of segs) {
      parts.push(rect(gx, yz - 9, 10, 10, c, 2));
      const s = `${lb} ${n}`;
      parts.push(text(gx + 14, yz, s, { size: 11, fill: INK2 }));
      gx += 14 + s.length * 6.2 + 16;
    }
    yz += 22;
    parts.push(text(L, yz, tr('Нийт {0} зөвшөөрөл · {1} багц', num(z.total), num(z.byBagts.length)), { size: 11.5, fill: INK3 }));
    yz += 20;
    /* Багц бүрийн зөвшөөрсөн хувь */
    for (const b of z.byBagts.slice(0, 8)) {
      const alert = b.no > 0 || b.unknown > 0;
      parts.push(hbar(L, yz, colW, b.bagts, b.total ? b.ok / b.total : 0,
        `${b.ok}/${b.total}${b.wait ? ` · ${tr('хүлээгдэж')} ${b.wait}` : ''}${b.no ? ` · ${tr('татгалзсан')} ${b.no}` : ''}`,
        { color: alert ? BAD : b.ok === b.total ? GOOD : DATA, nameW: 130, valW: 200 }));
      yz += 22;
    }
  }

  /* Ажлын төрөл — 01 */
  let yt = y2;
  parts.push(head(R, yt, colW, '01', tr('Ажлын төрлөөр — төсөв, гэрээ, гүйцэтгэл')));
  yt += 34;
  const top = g.byType[0]?.cost ?? 0;
  for (const t of g.byType.slice(0, 8)) {
    const perf = t.perf == null ? '—' : pct(t.perf, 1);
    parts.push(hbar(R, yt, colW, t.label, top ? t.cost / top : 0, `${money(t.cost)} · ${perf}`, {
      color: DATA_SOFT, nameW: 210, valW: 170,
    }));
    /* Гэрээлсэн хэсэг — багана дотор бараан */
    const trackX = R + 210;
    const trackW = colW - 210 - 170 - 8;
    parts.push(rect(trackX, yt, top ? (trackW * t.contract) / top : 0, 14, DATA, 3));
    yt += 22;
  }
  yt += 4;
  parts.push(rect(R, yt - 9, 10, 10, DATA, 2));
  parts.push(text(R + 14, yt, tr('гэрээлсэн'), { size: 10.5, fill: INK3 }));
  parts.push(rect(R + 90, yt - 9, 10, 10, DATA_SOFT, 2));
  parts.push(text(R + 104, yt, tr('төсөв · ард нь гүйцэтгэлийн хувь'), { size: 10.5, fill: INK3 }));
  yt += 16;

  y = Math.max(yz, yt) + 34;

  /* ── Дүгнэлт ── */
  const bottom = INFO_H - 48;
  parts.push(head(M, y, W, '', summary ? tr('AI дүгнэлт') : tr('Анхаарах асуудал')));
  y += 30;
  const body = summary ?? findings.map((s) => `• ${s}`).join('\n');
  const lines = wrap(body, 130);
  const lh = 21;
  const maxLines = Math.max(0, Math.floor((bottom - y - 8) / lh));
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) shown[shown.length - 1] = `${shown[shown.length - 1].slice(0, 125)}…`;
  for (const ln of shown) {
    /* Хэсгийн нэр («Гол дүгнэлт:») — тод; жагсаалтын мөр — энгийн */
    const isHead = /^[^•*·-][^:]{1,40}:$/.test(ln.trim());
    parts.push(text(M, y + 14, ln, { size: 14, weight: isHead ? 700 : 400, fill: isHead ? INK : INK2 }));
    y += lh;
  }

  /* ── Хөл ── */
  parts.push(`<line x1="${M}" y1="${INFO_H - 34}" x2="${M + W}" y2="${INFO_H - 34}" stroke="${LINE}"/>`);
  parts.push(text(M, INFO_H - 16, tr('Эх сурвалж: Сэлбэ портал — 01. Ерөнхий дашбоард · 05. Багцын гүйцэтгэл · 04. Багцын санхүү · Зөвшөөрөл. Бүх тоо ArcGIS-ээс амьдаар татагдсан.'), { size: 10, fill: INK3 }));
  parts.push(text(M + W, INFO_H - 16, dateStr, { size: 10, fill: INK3, anchor: 'end' }));
  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * SVG → PNG (data URL). Canvas-ын хэмжээ SVG-тэй ижил тул 150dpi A4.
 * ⚠️ `Image`-д data: URL өгнө (blob: биш) — зарим хөтөч blob SVG-г canvas-д
 *    «tainted» гэж үзээд `toDataURL` хориглодог.
 */
export function svgToPng(svg: string, scale = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = INFO_W * scale;
      c.height = INFO_H * scale;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL('image/png')); } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error(tr('Инфографик зурахад алдаа гарлаа.')));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

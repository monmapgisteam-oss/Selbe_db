/**
 * «ТАЙЛАН ТАТАХ» — ИДЭВХТЭЙ ХАРАГДАЦЫН ДЭЛГЭЦ ДЭЭР ХАРАГДАЖ БУЙ БҮХ ҮЗҮҮЛЭЛТИЙГ
 *.docx БОЛГОН ТАТНА (2026-10-15, хэрэглэгч: «Khorshoo_loan-ийн тайлан татахыг
 * ойлгоод зүүн самбарын 1–26 хэсэг тус бүрд нэм»).
 *
 * Khorshoo_loan-ийн `lib/report.ts`-ийн зарчим: «Дэлгэц дээр харагдаж буй бүх
 * үзүүлэлтийг идэвхтэй шүүлтүүрийн хамт.docx болгон татаж авна». Бүтэц нь мөн
 * адил: гарчиг → огноо → шүүлтийн нөхцөл → дугаарласан бүлгүүд (гарчиг, тайлбар,
 * хүснэгт) — дээр нь график ба газрын зургийг зураг болгон оруулна.
 */
import { NUMERIC, buildDocx, downloadDocx, type DocBlock } from './docx';
import { liveMapViews } from './mapShots';
import { reportSource } from './reportSource';
import type { DocChartSpec } from './docxChart';
import { t as tr } from '@/lib/i18nCore';

type Pending =
  | { kind: 'block'; block: DocBlock }
  | { kind: 'svg'; xml: string; w: number; h: number; caption?: string; fallback?: { xml: string; w: number; h: number } }
  | { kind: 'canvas'; el: HTMLCanvasElement; caption?: string }
  | { kind: 'map'; host: Element; caption?: string };

const MIN_CHART_W = 120;
const MIN_CHART_H = 60;
const MAX_TABLE_ROWS = 1500;
/* Дэлгэцийн удирдлагын хэсэг — тайланд хамааралгүй */
const SKIP_SEL = [
  'script', 'style', 'noscript', 'template', 'input', 'select', 'textarea', 'option', 'nav',
  '[role="navigation"]', '[role="tablist"]', '[role="toolbar"]', '[role="menu"]', '[role="tooltip"]', '[role="separator"]',
  '[data-report-skip]', '.esri-ui', '.esri-attribution',
].join(',');
const HIDE = 'data-rep-hide';
/* Графикийн тэнхлэгийн шошго — зөвхөн тоо/хувь/он/огноо */
const AXIS_ONLY = /^[−\-+]?[\d\s.,:/–-]+\s*(%|₮|к|м|т)?$/;
/* Үйлдлийн товчны үйл үг — «Үлдсэн 25-г харах», «+ Нэмэх» … */
const ACTION_RE = /(харах|харуулах|нэмэх|нээх|хаах|татах|сонгох|буцах|дэлгэрэнгүй|засах|устгах|хадгалах)\s*[›»▸▾→]?$/i;

const norm = (s: string) => s.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function visible(el: Element): boolean {
  const he = el as HTMLElement & { checkVisibility?: (o?: object) => boolean };
  if (getComputedStyle(el).display === 'contents') return true;
  if (typeof he.checkVisibility === 'function') {
    if (!he.checkVisibility({ checkVisibilityCSS: true })) return false;
  } else if (!el.getClientRects().length) return false;
  return true;
}

const isChartSvg = (el: Element): el is SVGSVGElement => {
  if (el.tagName.toLowerCase() !== 'svg' || el.parentElement?.closest('svg')) return false;
  const r = el.getBoundingClientRect();
  return r.width >= MIN_CHART_W && r.height >= MIN_CHART_H;
};
const isChartCanvas = (el: Element): el is HTMLCanvasElement => {
  if (el.tagName !== 'CANVAS' || el.closest('.esri-view')) return false;
  const r = el.getBoundingClientRect();
  return r.width >= MIN_CHART_W && r.height >= MIN_CHART_H;
};
const isMapHost = (el: Element) => el.hasAttribute('data-map-canvas') || el.classList.contains('esri-view');
const isTable = (el: Element) => el.tagName === 'TABLE' || el.getAttribute('role') === 'table' || el.getAttribute('role') === 'grid';
const HEAD_RE = /^H[1-4]$/;
const SPECIAL_SEL = 'table,[role="table"],[role="grid"],svg,canvas,h1,h2,h3,h4,[data-map-canvas],.esri-view';

/** Тусгай (хүснэгт · график · газрын зураг · гарчиг) удам байгаа эсэх */
function hasSpecial(el: Element): boolean {
  for (const d of el.querySelectorAll(SPECIAL_SEL)) {
    if (!visible(d)) continue;
    const t = d.tagName.toLowerCase();
    if (t === 'svg') { if (isChartSvg(d)) return true; continue; }
    if (t === 'canvas') { if (isChartCanvas(d)) return true; continue; }
    return true;
  }
  return false;
}

/**
 * График ШУУД хүүхдээр агуулсан хэсэг — ах дүү текст нь тэнхлэгийн шошго, хасна.
 */
const holdsChart = (el: Element) =>
  [...el.querySelectorAll(':scope > svg, :scope > canvas')].some((d) => isChartSvg(d) || isChartCanvas(d));

const CONTROL_ROLES = new Set(['button', 'tab', 'radio', 'switch', 'option', 'menuitem', 'menuitemradio', 'checkbox']);

/**
 * Удирдлага (шүүлтийн чип, таб, «харах/нэмэх» товч) эсэх.
 */
function isControl(el: Element): boolean {
  const role = el.getAttribute('role');
  if (el.tagName !== 'BUTTON' && el.tagName !== 'SUMMARY' && !(role && CONTROL_ROLES.has(role))) return false;
  const t = oneLine((el as HTMLElement).innerText || '');
  if (!t) return true;
  /* Дэлгэх товч (`aria-expanded`) / `<summary>` — доорх агуулгын НЭР, `walk` гарчиг болгоно
     (Хэсэгчилсэн ЕТ-ийн «Автозам», «Дугуйн зам» мөрүүд нэргүй үлдэж байв) */
  if (el.hasAttribute('aria-expanded') || el.tagName === 'SUMMARY') return false;
  if (t.length >= 28) return false;
  if (!/\d/.test(t) || ACTION_RE.test(t)) return true;
  /* Сегментлэсэн сонголт («24 цаг · 7 хоног · 30 хоног», «Бүгд 2024 2025 …») — ≥3 богино ах дүү
     товч, ЯГ НЭГ нь сонгогдсон. Ерөнхий дашбоардын шалтгааны жагсаалт («зөвшилцөх 93» …) ч
     ижил бүтэцтэй боловч аль нь ч сонгогдоогүй → өгөгдөл хэвээр. */
  const pressed = (k: Element) => ['aria-pressed', 'aria-selected', 'aria-checked'].some((a) => k.getAttribute(a) === 'true');
  const sib = el.parentElement ? [...el.parentElement.children].filter((k) => k.tagName === 'BUTTON' || k.getAttribute('role') === 'button') : [];
  if (sib.length >= 3 && sib.filter(pressed).length === 1 && sib.every((k) => oneLine((k as HTMLElement).innerText || '').length < 12)) return true;
  /* Үсэг + тоо = өгөгдлийн мөр — ҮЛДЭЭНЭ */
  if (/\p{L}/u.test(t)) return false;
  if (el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected') || el.hasAttribute('aria-checked')) return true;
  return sib.length >= 3 && sib.every((k) => oneLine((k as HTMLElement).innerText || '').length < 16);
}

/** Удирдлагыг түр нууна (синхрон хэсэгт; файлын толгой) — нуусан элементүүдийг буцаана */
function hideControls(roots: Element[]): Element[] {
  const hidden: Element[] = [];
  /* Зөвхөн УДИРДЛАГА гэж нуусан нь — доорх бүлгийн шалгалтад; чимэглэлийн aria-hidden («▸») орохгүй
     (орвол дэлгэх товч «▸ Автозам» бүхэлдээ «шошгын бүлэг» болж нуугдана) */
  const ctrl: Element[] = [];
  for (const r of roots) {
    for (const el of r.querySelectorAll(`${SKIP_SEL},button,summary,[role]`)) {
      if (el.closest(`[${HIDE}]`)) continue;
      const skip = el.matches(SKIP_SEL) || isControl(el);
      if (skip) { el.setAttribute(HIDE, ''); hidden.push(el); ctrl.push(el); }
    }
    /* Чимэглэлийн `aria-hidden` (дүрс, тууз) — график биш, график агуулаагүй бол */
    for (const el of r.querySelectorAll('[aria-hidden="true"]')) {
      if (el.closest(`[${HIDE}]`) || isChartSvg(el) || [...el.querySelectorAll('svg,canvas')].some((d) => isChartSvg(d) || isChartCanvas(d))) continue;
      el.setAttribute(HIDE, '');
      hidden.push(el);
    }
  }
  /* Бүх товч нь нуугдсан бүлгийн богино шошго («ЖИЛ», «САР») — бүлгийг бүхэлд нь нууна (2 түвшин) */
  const groups = new Set<Element>();
  for (let pass = 0; pass < 2; pass++) {
    const parents = new Set(ctrl.map((h) => h.parentElement).filter((p): p is HTMLElement => !!p && !p.hasAttribute(HIDE) && !roots.includes(p)));
    for (const p of parents) {
      const hid = [...p.children].filter((k) => k.hasAttribute(HIDE));
      const rest = [...p.children].filter((k) => !k.hasAttribute(HIDE));
      const restText = rest.map((k) => oneLine((k as HTMLElement).innerText || '')).join('');
      /* Ганц удирдлагатай бол зөвхөн тоогүй богино шошго («Багц», «Хувилбар» — сонголтын нэр) */
      if (hid.length < 2 && !hid.some((k) => groups.has(k)) && /\d/.test(restText)) continue;
      if (restText.length < 20 && !rest.some((k) => k.matches(SPECIAL_SEL) || k.querySelector(SPECIAL_SEL))) {
        p.setAttribute(HIDE, '');
        hidden.push(p);
        groups.add(p);
      }
    }
  }
  return hidden;
}

function declaredTotal(el: Element): number | null {
  const raw = el.getAttribute('data-rep-total');
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Хүснэгт — `<table>` эсвэл `role=table|grid`. colspan-ыг хоосон нүдээр дэлгэнэ.
 */
function readTable(el: Element): DocBlock[] {
  const head: string[][] = [];
  const rows: string[][] = [];
  /** `MAX_TABLE_ROWS`-оор зогссон (цааш мөр үлдсэн) эсэх */
  let capped = false;
  const txt = (c: Element) => oneLine((c as HTMLElement).innerText || c.textContent || '');
  if (el.tagName === 'TABLE') {
    for (const tr_ of (el as HTMLTableElement).rows) {
      if (!visible(tr_)) continue;
      const cells: string[] = [];
      for (const c of tr_.cells) {
        if (!visible(c)) continue;
        cells.push(txt(c));
        for (let k = 1; k < (c as HTMLTableCellElement).colSpan; k++) cells.push('');
      }
      if (!cells.some(Boolean)) continue;
      const inHead = tr_.parentElement?.tagName === 'THEAD' || (!rows.length && [...tr_.cells].every((c) => c.tagName === 'TH'));
      const dest = inHead && !rows.length ? head : rows;
      if (dest === rows && rows.length >= MAX_TABLE_ROWS) { capped = true; break; }
      dest.push(cells);
    }
  } else {
    for (const r of el.querySelectorAll('[role="row"]')) {
      if (!visible(r)) continue;
      const cs = [...r.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')].filter(visible);
      const cells = cs.map(txt);
      if (!cells.some(Boolean)) continue;
      const isHead = cs.every((c) => c.getAttribute('role') === 'columnheader');
      const dest = isHead && !rows.length ? head : rows;
      if (dest === rows && rows.length >= MAX_TABLE_ROWS) { capped = true; break; }
      dest.push(cells);
    }
  }
  if (!head.length && !rows.length) return [];
  const out: DocBlock[] = [{ kind: 'table', head, rows }];
  const total = declaredTotal(el);
  const note = tableNote(rows.length, total, capped);
  if (note) out.push({ kind: 'p', text: note, italic: true, size: 16, color: '666666' });
  return out;
}

/**
 * Тайрсан/виртуал хүснэгтийн тэмдэглэл (цэвэр — `viewReport.check`).
 * · нийт тоо мэдэгдэж, түүнээс цөөн мөр орсон → «… мөрөөс эхний N» / «дэлгэцэд харагдаж буй N мөр»;
 * · нийт тоо мэдэгдэхгүй ч хязгаарт хүрсэн → «эхний N мөр (хязгаар)».
 */
export function tableNote(got: number, total: number | null, capped: boolean): string | null {
  if (total != null && total > got) {
    return capped
      ? tr('⚠️ Нийт {0} мөрөөс эхний {1} мөр орсон — бүтнээр нь харагдацын Excel татах товчоор авна уу.', total.toLocaleString('en-US'), got.toLocaleString('en-US'))
      : tr('⚠️ Зөвхөн дэлгэцэд харагдаж буй мөрүүд ({1} / нийт {0}) — бүтнээр нь харагдацын Excel татах товчоор авна уу.', total.toLocaleString('en-US'), got.toLocaleString('en-US'));
  }
  if (capped) return tr('⚠️ Хүснэгтийн эхний {0} мөр орсон (тайлангийн хязгаар) — үлдсэнийг харагдацаас харна уу.', got.toLocaleString('en-US'));
  return null;
}

/* SVG-д дэлгэцийн тооцоолсон загварыг суулгана — CSS хувьсагч, класс нь тусдаа
   зурагт ажиллахгүй (зураг хуудасны CSS-ийг харахгүй) */
const SVG_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'visibility', 'display',
];

function serializeSvg(svg: SVGSVGElement): { xml: string; w: number; h: number } {
  const r = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((s, i) => {
    const cs = getComputedStyle(s);
    const d = dst[i] as SVGElement;
    d.setAttribute('style', SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    d.removeAttribute('class');
    d.removeAttribute(HIDE);
  });
  /* `currentColor`-ыг өнгө болгон тайлна */
  const color = getComputedStyle(svg).color;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.round(r.width)));
  clone.setAttribute('height', String(Math.round(r.height)));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${Math.round(r.width)} ${Math.round(r.height)}`);
  const xml = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, color);
  return { xml, w: r.width, h: r.height };
}

/**
 * ГРАФИКИЙН ХАЙРЦАГ — SVG + түүний HTML тэнхлэг/шошгыг НЭГ зураг болгоно.
 */
function chartBox(el: Element): SVGSVGElement | null {
  if (el.tagName.toLowerCase() === 'svg' || el.querySelector('table,[role="table"],h1,h2,h3,h4,[data-map-canvas],.esri-view,canvas')) return null;
  const charts = [...el.querySelectorAll('svg')].filter(isChartSvg);
  if (charts.length !== 1) return null;
  const c = charts[0].getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.height > c.height * 1.5 + 90 || r.width > c.width + 160) return null;
  if (oneLine((el as HTMLElement).innerText || '').length > 600) return null;
  return charts[0];
}

const SKIP_PROP = /^(-webkit-|transition|animation|will-change|cursor|pointer-events|user-select|scroll|view-transition)/;

function serializeHtml(box: Element): { xml: string; w: number; h: number } {
  const r = box.getBoundingClientRect();
  const clone = box.cloneNode(true) as Element;
  const pair = (s: Element, d: Element) => {
    if (s.hasAttribute(HIDE)) { d.remove(); return; }
    const cs = getComputedStyle(s);
    let style = '';
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      if (!SKIP_PROP.test(p)) style += `${p}:${cs.getPropertyValue(p)};`;
    }
    d.setAttribute('style', style);
    d.removeAttribute('class');
    const sk = [...s.children];
    const dk = [...d.children];
    sk.forEach((x, i) => dk[i] && pair(x, dk[i]));
  };
  pair(box, clone);
  (clone as HTMLElement).style.margin = '0';
  const inner = new XMLSerializer().serializeToString(clone);
  const w = Math.ceil(r.width);
  const h = Math.ceil(r.height);
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px">${inner}</div></foreignObject></svg>`;
  return { xml, w: r.width, h: r.height };
}

/** Графикийн тайлбар — `aria-label` эсвэл `<title>` */
const captionOf = (el: Element) => oneLine(el.getAttribute('aria-label') || el.querySelector(':scope > title')?.textContent || '') || undefined;

/** Карт (KPI · жагсаалтын мөр) — тусгай удамгүй, 2–5 богино мөр */
function cardLines(el: Element): string[] | null {
  if (el.tagName === 'P' || el.tagName === 'LI' && el.children.length === 0 || hasSpecial(el)) return null;
  const lines = norm((el as HTMLElement).innerText || '').split('\n').filter(Boolean);
  if (lines.length < 2 || lines.length > 5 || lines.some((l) => l.length > 80)) return null;
  return lines;
}

/** Нэр | утга — тоо эхэлсэн картад («2.49 их наяд ₮ / НИЙТ ТӨСӨВ») нэрийг урагшлуулна */
function cardRow(lines: string[]): string[] {
  const isName = (l: string) => !/^[−\-+]?\(?\d/.test(l) && !NUMERIC.test(l);
  /* ТОМ ҮСГЭЭР бичсэн мөр (CSS uppercase шошго — `innerText` хувиргалтыг хадгалдаг) давуу:
     «114,085 / объект / НИЙТ» → нэр = НИЙТ, нэгж биш */
  const upper = (l: string) => /\p{Lu}{3}/u.test(l) && l === l.toUpperCase();
  let k = lines.findIndex((l) => isName(l) && upper(l));
  if (k < 0) k = lines.findIndex(isName);
  if (k < 0) k = 0;
  return [lines[k], lines.filter((_, j) => j !== k).join(' · ')];
}

/* ── Word-ийн жинхэнэ график (2026-10-19, хэрэглэгч: «графикийг зургаар биш, аятайхан графикаар») ── */
const REP_CHART = '[data-report-chart]';
/** CSS өнгө (`var(--tone)` г.м.) → 6 оронтой HEX — ТЭР элемент дотор (хувьсагч нь удамшдаг), гэрэл горимд */
function resolveColor(el: Element, css: string | undefined): string | undefined {
  if (!css) return undefined;
  if (/^[0-9A-F]{6}$/i.test(css)) return css.toUpperCase();
  const probe = document.createElement('span');
  probe.style.color = css;
  el.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
  probe.remove();
  if (!m || m.length < 3 || (m.length > 3 && Number(m[3]) === 0)) return undefined;
  return m.slice(0, 3).map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function readChart(el: Element): DocBlock | null {
  let spec: DocChartSpec;
  try { spec = JSON.parse(el.getAttribute('data-report-chart') || '') as DocChartSpec; } catch { return null; }
  if (!spec?.cats?.length || !spec.series?.length || !spec.series.some((x) => x.values.some((v) => v != null))) return null;
  const col = (c: string | undefined) => resolveColor(el, c);
  return {
    kind: 'chart',
    spec: { ...spec, series: spec.series.map((x) => ({ ...x, color: col(x.color) })), pointColors: spec.pointColors?.map(col) },
  };
}

/** DOM-ыг дарааллаар нь алхаж блок цуглуулна (СИНХРОН) */
function collect(root: Element, out: Pending[]): void {
  let last = '';
  const push = (p: Pending) => { out.push(p); last = ''; };
  const text = (s: string, axis: boolean) => {
    for (const line of norm(s).split('\n')) {
      const t = line.trim();
      /* Зөвхөн тэмдэгтээс тогтсон мөр («▸», «✓», «·») — дүрс, утга агуулаагүй */
      if (!t || t === last || (axis && AXIS_ONLY.test(t)) || !/[\p{L}\p{N}]/u.test(t)) continue;
      last = t;
      out.push({ kind: 'block', block: { kind: 'p', text: t } });
    }
  };

  /** Хүүхдүүд — дараалсан картуудыг нэг хүснэгт болгоно */
  const children = (el: Element, axis: boolean) => {
    let run: string[][] = [];
    let runEls: Element[] = [];
    const flush = () => {
      if (run.length >= 2) push({ kind: 'block', block: { kind: 'table', head: [], rows: run.map(cardRow) } });
      /* Ганц «карт» — дотогш орно: 2 картаас тогтсон `dl` (4 мөр) өөрөө карт шиг харагддаг
         (Хэсэгчилсэн ЕТ-ийн «Ногоон байгууламж» мөр 4 салангид мөр болж байв) */
      else for (const e of runEls) walk(e, axis);
      run = []; runEls = [];
    };
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) { if ((n.textContent || '').trim()) { flush(); text(n.textContent || '', axis); } continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const c = n as Element;
      if (c.hasAttribute(HIDE) || !visible(c)) continue;
      const lines = !axis && !isMapHost(c) && !isTable(c) && !c.matches(REP_CHART) && !c.querySelector(REP_CHART) ? cardLines(c) : null;
      if (lines) { run.push(lines); runEls.push(c); continue; }
      flush();
      walk(c, axis);
    }
    flush();
  };

  const walk = (el: Element, axisIn: boolean) => {
    if (el.hasAttribute(HIDE) || !visible(el)) return;
    if (isMapHost(el)) { push({ kind: 'map', host: el, caption: tr('Газрын зураг') }); return; }
    if (isTable(el)) { for (const b of readTable(el)) push({ kind: 'block', block: b }); return; }
    if (el.matches(REP_CHART)) {
      const ch = readChart(el);
      if (ch) { push({ kind: 'block', block: ch }); return; }
    }
    /* Доор нь өгөгдөлтэй график байвал боодлыг бүхэлд нь зураг болгохгүй — дотогш орно */
    const box = el.querySelector(REP_CHART) ? null : chartBox(el);
    if (box) { push({ kind: 'svg', ...serializeHtml(el), fallback: serializeSvg(box), caption: captionOf(box) }); return; }
    if (isChartSvg(el)) { push({ kind: 'svg', ...serializeSvg(el), caption: captionOf(el) }); return; }
    if (isChartCanvas(el)) { push({ kind: 'canvas', el, caption: captionOf(el) }); return; }
    if (HEAD_RE.test(el.tagName)) {
      const t = oneLine((el as HTMLElement).innerText || '');
      if (t) push({ kind: 'block', block: { kind: 'h', level: el.tagName <= 'H2' ? 1 : el.tagName === 'H3' ? 2 : 3, text: t } });
      return;
    }
    /* Дэлгэх товч / summary — 3-р түвшний гарчиг (`isControl`-ийн тайлбар) */
    if ((el.tagName === 'BUTTON' && el.hasAttribute('aria-expanded')) || el.tagName === 'SUMMARY') {
      const t = oneLine((el as HTMLElement).innerText || '');
      if (t && t.length < 120 && /[\p{L}\p{N}]/u.test(t)) { push({ kind: 'block', block: { kind: 'h', level: 3, text: t } }); return; }
      if (!/[\p{L}\p{N}]/u.test(t)) return; // зөвхөн «▸» — сум
    }
    const axis = axisIn || holdsChart(el);
    /* Навч: хүүхэдгүй/ганц хүүхэдтэй, эсвэл зөвхөн inline хүүхэдтэй («8 <b>талбар</b>») — нэг мөр */
    if (!hasSpecial(el)) {
      const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim());
      /* Ганц хүүхэдтэй боодол — дотогш орно (KPI сүлжээ `div > div.statsGrid > карт…`) */
      if (el.children.length === 1 && !ownText) { walk(el.children[0], axis); return; }
      if (el.children.length < 2 || [...el.children].every((c) => getComputedStyle(c).display.startsWith('inline'))) {
        text((el as HTMLElement).innerText || '', axis);
        return;
      }
    }
    children(el, axis);
  };
  walk(root, false);
}

/* ── Асинхрон: зураг болгох ── */

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function svgToPng(xml: string, w: number, h: number): Promise<Uint8Array | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  try { await img.decode(); } catch { return null; }
  const k = 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  try { return dataUrlBytes(c.toDataURL('image/png')); } catch { return null; }
}

export async function mapShot(host: Element): Promise<{ png: Uint8Array; w: number; h: number } | null> {
  const v = liveMapViews(host)[0] ?? (host.classList.contains('esri-view') ? liveMapViews(host.parentElement ?? host)[0] : undefined);
  if (!v) return null;
  try {
    const width = Math.min(1800, Math.round((v.width || 1200) * 1.5));
    const shot = await v.takeScreenshot({ format: 'png', width });
    return { png: dataUrlBytes(shot.dataUrl), w: shot.data.width, h: shot.data.height };
  } catch { return null; }
}

async function resolve(p: Pending): Promise<DocBlock | null> {
  switch (p.kind) {
    case 'block': return p.block;
    case 'svg': {
      const png = await svgToPng(p.xml, p.w, p.h);
      if (png) return { kind: 'img', png, w: p.w, h: p.h, caption: p.caption };
      /* foreignObject зурагдаагүй (хөтөч taint) — зөвхөн SVG */
      const fb = p.fallback && await svgToPng(p.fallback.xml, p.fallback.w, p.fallback.h);
      return fb && p.fallback ? { kind: 'img', png: fb, w: p.fallback.w, h: p.fallback.h, caption: p.caption } : null;
    }
    case 'canvas': {
      try {
        const r = p.el.getBoundingClientRect();
        return { kind: 'img', png: dataUrlBytes(p.el.toDataURL('image/png')), w: r.width, h: r.height, caption: p.caption };
      } catch { return null; }
    }
    case 'map': {
      const s = await mapShot(p.host);
      return s ? { kind: 'img', ...s, caption: p.caption } : null;
    }
  }
}

/* ── Нийтийн API ── */

export type ViewReportMeta = {
  key: string;
  title: string;
  desc?: string;
  /** Идэвхтэй шүүлтийн тайлбар (бүс г.м.); хоосон бол «бүх өгөгдөл» */
  filters: string[];
};

/** Харагдацын үндэс — бүтэн харагдац `#main`, газрын зурагтай харагдац `#main` + `#panel` */
function roots(): Element[] {
  return ['main', 'panel'].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
}

/* Анхдагч («бүгд») сонголт — шүүлт биш */
const ALL_RE = /^(бүгд|бүх(\s|$)|all(\s|$)|—$)/i;

export function readFilters(rs: Element[] = roots()): string[] {
  const out: string[] = [];
  const add = (s: string) => { const t = oneLine(s); if (t && !out.includes(t)) out.push(t); };
  const labelOf = (el: Element): string => {
    const aria = el.getAttribute('aria-label') || el.getAttribute('title');
    if (aria) return oneLine(aria);
    const id = el.getAttribute('id');
    const lab = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : el.closest('label');
    return lab ? oneLine((lab as HTMLElement).innerText || '').replace(/:$/, '') : '';
  };
  for (const r of rs) {
    for (const el of r.querySelectorAll('[data-rep-filter]')) if (visible(el) && !el.closest('[data-report-skip]')) add(el.getAttribute('data-rep-filter') || '');
    for (const el of r.querySelectorAll('select')) {
      const sel = el as HTMLSelectElement;
      if (!visible(sel) || sel.selectedIndex < 0 || sel.closest('[data-rep-skip],[data-report-skip]')) continue;
      const v = oneLine(sel.selectedOptions[0]?.text || '');
      if (!v || sel.value === '' || /^all$/i.test(sel.value) || ALL_RE.test(v)) continue;
      const name = labelOf(sel);
      add(name ? `${name}: ${v}` : v);
    }
    const seen = new Set<Element>();
    const isRadio = (k: Element) => k.getAttribute('role') === 'radio' && k.hasAttribute('aria-checked');
    for (const el of r.querySelectorAll('[aria-pressed="true"],[aria-selected="true"],[role="radio"][aria-checked="true"]')) {
      const p = el.parentElement;
      if (!p || seen.has(p) || !visible(el) || el.closest('[data-rep-skip],[data-report-skip]')) continue;
      seen.add(p);
      const sib = [...p.children].filter((k) => k.hasAttribute('aria-pressed') || k.hasAttribute('aria-selected') || isRadio(k));
      const on = sib.filter((k) => k.getAttribute('aria-pressed') === 'true' || k.getAttribute('aria-selected') === 'true'
        || (isRadio(k) && k.getAttribute('aria-checked') === 'true'));
      /* ≥3: «График | Хүснэгт» зэрэг 2 товчтой ХАРАГДАХ ГОРИМ шүүлт биш */
      if (sib.length < 3 || on.length !== 1) continue;
      const v = oneLine((el as HTMLElement).innerText || '');
      if (!v || v.length > 40 || ALL_RE.test(v)) continue;
      /* Бүлгийн нэр — эцгийн aria-label, эсвэл бүлгийн ӨМНӨХ товч биш богино шошго («ЖИЛ») */
      let name = p.getAttribute('aria-label') || '';
      if (!name) {
        const prev = [...p.children].find((k) => !sib.includes(k) && k.tagName !== 'BUTTON');
        const t = prev ? oneLine((prev as HTMLElement).innerText || '') : '';
        if (t && t.length <= 24) name = t;
      }
      add(name ? `${sentence(name)}: ${v}` : v);
    }
  }
  return out;
}

export function pendingCount(rs: Element[] = roots()): number {
  let n = 0;
  for (const r of rs) {
    for (const el of r.querySelectorAll('[aria-busy="true"],[class*="spinner"],[class*="_spin_"]')) {
      if (visible(el)) n += 1;
    }
  }
  return n;
}

const p2 = (x: number) => String(x).padStart(2, '0');
/** YYYY-MM-DD HH:MM — `toLocaleString('mn-MN')` Chrome-д «10/15/2026, 5:27 PM» өгдөг */
const stamp = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

export async function buildViewReport(meta: ViewReportMeta): Promise<DocBlock[]> {
  const src = reportSource(meta.key);
  if (src) {
    const head = { ...meta, desc: undefined, filters: [...meta.filters, ...(src.filters?.() ?? [])] };
    const body = await src.blocks();
    const host = src.map ? roots().find((r) => liveMapViews(r).length) : undefined;
    const shot = host ? await mapShot(host) : null;
    return withHead(head, shot ? [{ kind: 'img', ...shot, caption: tr('Газрын зураг') }, ...body] : body);
  }
  const pending: Pending[] = [];
  const html = document.documentElement;
  const prevTheme = html.dataset.theme;
  const rs = roots();
  const filters = [...new Set([...meta.filters, ...readFilters(rs)])];
  const style = document.createElement('style');
  style.textContent = `[${HIDE}]{display:none!important}`;
  html.dataset.theme = 'light';
  const hidden = hideControls(rs);
  document.head.appendChild(style);
  try {
    for (const r of rs) collect(r, pending);
  } finally {
    style.remove();
    for (const el of hidden) el.removeAttribute(HIDE);
    if (prevTheme == null) delete html.dataset.theme;
    else html.dataset.theme = prevTheme;
  }

  const resolved = await Promise.all(pending.map(resolve));
  const body = resolved.filter((b): b is DocBlock => !!b);
  const dropped = resolved.filter((b, i) => !b && pending[i].kind !== 'block').length;
  return withHead({ ...meta, filters }, captionTables(mergeStatLines(body)), dropped);
}

/* ── «Нэр / тоо / нэгж» мөрүүдийг хүснэгт болгох (2026-10-19, хэрэглэгч: «page 1 сул зайг янзал») ── */
const VAL_LINE = /^[−\-+]?\(?[\d\s.,]+\)?\s*%?$/;
const UNIT_LINE = /^[\p{L}²³/.]{1,8}$/u;
const isPlain = (b: DocBlock | undefined): b is Extract<DocBlock, { kind: 'p' }> =>
  !!b && b.kind === 'p' && !b.bold && !b.italic;
export function mergeStatLines(body: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = [];
  let i = 0;
  while (i < body.length) {
    const rows: string[][] = [];
    let j = i;
    for (;;) {
      const a = body[j], v = body[j + 1], u = body[j + 2];
      if (!isPlain(a) || !isPlain(v) || a.text.length > 60 || !/\p{L}/u.test(a.text) || VAL_LINE.test(a.text) || !VAL_LINE.test(v.text)) break;
      const unit = isPlain(u) && UNIT_LINE.test(u.text) && !VAL_LINE.test(u.text) ? u.text : '';
      rows.push([a.text, unit ? `${v.text} ${unit}` : v.text]);
      j += unit ? 3 : 2;
    }
    if (rows.length >= 2) { out.push({ kind: 'table', head: [], rows }); i = j; continue; }
    out.push(body[i]);
    i += 1;
  }
  return out;
}

/* ── Хүснэгтийн нэр · тайлбар (2026-10-19, хэрэглэгч: «хүснэгт нэртэй байх — графикийн нэр байж болно;
      хүснэгтийн дээр түүнийг тайлбарласан тайлбар») ── */
/** Мөрийн нэр нь өөрөө нэгж («км», «га», «төрөл») — хамгийн их утгыг харьцуулах утгагүй */
const UNIT_LABEL = /^(төрөл|км|м|м²|м2|га|цэг|ш|объект|хүн|айл|%)$/i;
/** Хүснэгтийн шууд өмнөх богино шошго мөр («Зам», «Тээвэр») — картын нэр */
const isLabel = (b: DocBlock | undefined): b is Extract<DocBlock, { kind: 'p' }> =>
  !!b && b.kind === 'p' && !b.bold && !b.italic && b.text.length <= 40 && !/[.:]$/.test(b.text);
const isCaps = (s: string) => /\p{Lu}/u.test(s) && s === s.toUpperCase();
/** «ГАЗАР ЧӨЛӨӨЛӨЛТ» → «Газар чөлөөлөлт» (CSS `text-transform` нь `innerText`-д үлддэг) */
const sentence = (s: string) => (isCaps(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s);
/** «1,348,197,463,311 ₮» · «92.0%» · «0.4 га» → тоо; «3 / 3,780» гэх мэт нийлмэл утга → null */
const numOf = (s: string): number | null => {
  if (s.includes('/')) return null;
  const m = s.replace(/[\s,]/g, '').match(/^[−-]?\d+(\.\d+)?/);
  return m ? Number(m[0].replace('−', '-')) : null;
};

function describe(name: string, t: Extract<DocBlock, { kind: 'table' }>, unit: string): string {
  const parts = [tr('«{0}» хүснэгтэд {1} үзүүлэлтийг харуулав.', name, String(t.rows.length))];
  if (unit) parts.push(tr('Нэгж, ангилал: {0}.', unit));
  /* 2 баганат «нэр · утга» хүснэгтэд хамгийн их утгыг онцолно (дэлгэцийн графикийн гол мэдээлэл) */
  const unitOf = (v: string) => v.replace(/[−\-+\d\s.,()]/g, '');
  if (t.rows.length >= 3 && t.rows.every((r) => r.length === 2 && NUMERIC.test(r[1].trim()))
    && new Set(t.rows.map((r) => unitOf(r[1]))).size === 1 && !t.rows.some((r) => UNIT_LABEL.test(r[0].trim()))) {
    const vals = t.rows.map((r) => numOf(r[1]));
    if (vals.every((v) => v != null)) {
      let k = 0;
      vals.forEach((v, i) => { if (v! > vals[k]!) k = i; });
      parts.push(tr('Хамгийн их нь {0} ({1}).', t.rows[k][0], t.rows[k][1]));
    }
  }
  return parts.join(' ');
}

/* ── Графикийн тайлбар (2026-10-19, хэрэглэгч: «графикийн дээр нэрийн доор тухайн графикийг тайлбарласан хэсэг») ── */
const fmtN = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
function describeChart(name: string, c: DocChartSpec, unit: string): string {
  const parts: string[] = [];
  /* Богино нэгж («км», «%») утгын ард; урт дэд мөр («PM2.5 · мкг/м³») тусдаа өгүүлбэр */
  const short = !!unit && unit.length <= 8 && !unit.includes('·') && !unit.includes(',');
  const u = short ? ` ${unit}` : '';
  if (c.type === 'doughnut') {
    const vals = c.series[0]?.values ?? [];
    const tot = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
    /* Ring + `text` (AQI оноо г.м.) — хувь биш, утга нь гарчигт */
    if (c.hideLabels?.includes(0)) {
      parts.push(tr('«{0}» графикийн утга: {1}.', name, c.title ?? ''));
    } else if (c.pct && c.hideLabels?.includes(1)) {
      parts.push(tr('«{0}» графикт гүйцэтгэлийн хувийг харуулав: {1} {2}%.', name, c.cats[0] ?? '', fmtN(vals[0] ?? 0)));
    } else {
      parts.push(tr('«{0}» графикт {1} ангиллын бүтцийг харуулав, нийт {2}.', name, String(c.cats.length), fmtN(tot) + u));
      let k = 0;
      vals.forEach((v, i) => { if ((v ?? 0) > (vals[k] ?? 0)) k = i; });
      if (tot > 0 && c.cats.length > 1) parts.push(tr('Хамгийн их хэсэг нь {0}: {1} ({2}%).', c.cats[k], fmtN(vals[k] ?? 0) + u, fmtN(Math.round(((vals[k] ?? 0) / tot) * 1000) / 10)));
    }
    return parts.join(' ');
  }
  const pts = c.series.flatMap((x) => x.values.map((v, i) => ({ v, i, name: x.name }))).filter((p): p is { v: number; i: number; name: string } => p.v != null);
  parts.push(c.type === 'line'
    ? tr('«{0}» графикт {1} цэгийн өөрчлөлтийг харуулав (эхлэл {2}, төгсгөл {3}).', name, String(c.cats.length), c.cats[0] ?? '', c.cats[c.cats.length - 1] ?? '')
    : tr('«{0}» графикт {1} ангиллын утгыг харьцуулав.', name, String(c.cats.length)));
  if (c.series.length > 1) parts.push(tr('Цуваа: {0}.', c.series.map((x) => x.name).filter(Boolean).join(', ')));
  if (pts.length) {
    const hi = pts.reduce((a, b) => (b.v > a.v ? b : a));
    const lo = pts.reduce((a, b) => (b.v < a.v ? b : a));
    const who = (p: typeof hi) => (c.series.length > 1 && p.name ? `${c.cats[p.i]} (${p.name})` : c.cats[p.i]);
    parts.push(tr('Хамгийн их нь {0}: {1}, хамгийн бага нь {2}: {3}.', who(hi), fmtN(hi.v) + u, who(lo), fmtN(lo.v) + u));
    if (c.type === 'line' && c.series.length === 1) {
      const last = [...pts].reverse()[0];
      parts.push(tr('Сүүлийн утга {0}: {1}.', c.cats[last.i], fmtN(last.v) + u));
    }
  }
  const gaps = c.series.reduce((a, x) => a + x.values.filter((v) => v == null).length, 0);
  if (gaps) parts.push(tr('{0} цэг хэмжигдээгүй тул графикт цоорхой үлдсэн.', String(gaps)));
  if (unit && !short) parts.push(tr('Нэгж, ангилал: {0}.', unit));
  return parts.join(' ');
}

export function captionTables(body: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = [];
  let n = 0;
  let g = 0;
  /* Сүүлийн хүснэгтээс хойших гарчиг (out дахь индекс) ба түүний дараах богино мөрүүд */
  let head: { at: number; text: string; level: number } | null = null;
  let subs: number[] = [];
  for (const b of body) {
    if (b.kind === 'h') { head = { at: out.length, text: b.text, level: b.level }; subs = []; out.push(b); continue; }
    if (b.kind === 'p' && head && out.length - head.at - 1 === subs.length && b.text.length <= 60) {
      subs.push(out.length); out.push(b); continue;
    }
    if (b.kind === 'chart') {
      /* График: «График N. Нэр» + тайлбар — хүснэгттэй ижил нэрлэх дүрэм; нэр байхгүй бол графикийн
         өөрийн гарчиг (дотор нь давхардуулахгүйн тулд хасна) */
      g += 1;
      const adjacent = !!head && out.length - head.at - 1 === subs.length;
      const label = !adjacent && isLabel(out[out.length - 1]) ? (out.pop() as { text: string }).text : null;
      const own = b.spec.title?.trim() || '';
      const name = adjacent && head ? sentence(head.text) : label ? sentence(label)
        : own || (head ? sentence(head.text) : tr('График'));
      const unit = adjacent ? subs.map((i) => (out[i] as { text: string }).text).join(', ') : '';
      const chart: DocBlock = name === own ? { ...b, spec: { ...b.spec, title: undefined } } : b;
      const caption: DocBlock[] = [
        { kind: 'p', text: tr('График {0}. {1}', String(g), name), bold: true, keep: true },
        { kind: 'p', text: describeChart(name, b.spec, unit), italic: true, color: '555555', keep: true },
      ];
      if (adjacent && head) {
        const from = head.level === 1 ? head.at + 1 : head.at;
        out.splice(from, out.length - from, ...caption);
      } else out.push(...caption);
      out.push(chart);
      head = null;
      subs = [];
      continue;
    }
    if (b.kind !== 'table' || !b.rows.length) { if (b.kind !== 'p') { head = null; subs = []; } out.push(b); continue; }

    n += 1;
    const adjacent = !!head && out.length - head.at - 1 === subs.length;
    const label = !adjacent && isLabel(out[out.length - 1]) ? (out.pop() as { text: string }).text : null;
    const name = adjacent && head ? sentence(head.text)
      : label ? sentence(label)
        : head ? sentence(head.text) : n === 1 ? tr('Үндсэн үзүүлэлт') : tr('Нэгтгэл үзүүлэлт');
    const unit = adjacent ? subs.map((i) => (out[i] as { text: string }).text).join(', ') : '';
    const caption: DocBlock[] = [
      { kind: 'p', text: tr('Хүснэгт {0}. {1}', String(n), name), bold: true, keep: true },
      { kind: 'p', text: describe(name, b, unit), italic: true, color: '555555', keep: true },
    ];
    if (adjacent && head) {
      /* Гарчиг + дэд мөрийг нэр · тайлбараар солино (1-р түвшний гарчиг хэвээр) */
      const from = head.level === 1 ? head.at + 1 : head.at;
      out.splice(from, out.length - from, ...caption);
    } else out.push(...caption);
    out.push(b);
    head = null;
    subs = [];
  }
  return out;
}

/** Толгой (гарчиг · тайлбар · огноо · шүүлт) + 1-р түвшний гарчгийн дугаар */
function withHead(meta: ViewReportMeta, body: DocBlock[], dropped = 0): DocBlock[] {
  /* Khorshoo-гийн бүтэц: 1-р түвшний гарчгийг дугаарлана */
  let n = 0;
  /* Дэлгэц дээр аль хэдийн дугаарласан («1. Төслийн ерөнхий байдал» — Тайлан) бол дахин дугаарлахгүй */
  for (const b of body) if (b.kind === 'h' && b.level === 1 && !/^\d+[.)]\s/.test(b.text)) b.text = `${++n}. ${b.text}`;

  const head: DocBlock[] = [
    { kind: 'p', text: `${meta.title} ${tr('тайлан')}`.toUpperCase(), bold: true, size: 30, center: true },
  ];
  if (meta.desc) head.push({ kind: 'p', text: meta.desc, italic: true, center: true, color: '555555' });
  head.push(
    { kind: 'p', text: `${tr('Огноо')}: ${stamp(new Date())}` },
    { kind: 'p', text: `${tr('Шүүлтийн нөхцөл')}: ${meta.filters.length ? meta.filters.join(' | ') : tr('бүх өгөгдөл')}`, bold: true },
  );
  if (dropped) {
    head.push({ kind: 'p', text: tr('⚠️ {0} график/газрын зураг тайланд орж чадсангүй — дэлгэцээс харна уу.', dropped), italic: true, color: '666666' });
  }
  if (!body.length) body.push({ kind: 'p', text: tr('Дэлгэц дээр тайланд орох мэдээлэл олдсонгүй.') });
  return [...head, ...body].map(noDash);
}

const dash = (s: string): string => (s.includes('—') ? s.replace(/\s*—\s*/g, ' ').trim() : s);
function noDash(b: DocBlock): DocBlock {
  if (b.kind === 'h' || b.kind === 'p') return { ...b, text: dash(b.text) };
  if (b.kind === 'table') return { ...b, head: b.head.map((r) => r.map(dash)), rows: b.rows.map((r) => r.map(dash)) };
  if (b.kind === 'img' && b.caption) return { ...b, caption: dash(b.caption) };
  if (b.kind === 'chart') return { ...b, spec: { ...b.spec, title: b.spec.title && dash(b.spec.title), cats: b.spec.cats.map(dash) } };
  return b;
}

/** Файлын нэр: Selbe_<харагдац>_tailan_YYYYMMDD.docx (Khorshoo_tailan_YYYYMMDD.docx-тай ижил) */
export function reportFileName(key: string): string {
  const d = new Date();
  return `Selbe_${key}_tailan_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.docx`;
}

/** Тайланг угсарч татна */
export async function downloadViewReport(meta: ViewReportMeta): Promise<void> {
  const blocks = await buildViewReport(meta);
  downloadDocx(reportFileName(meta.key), buildDocx(blocks));
}

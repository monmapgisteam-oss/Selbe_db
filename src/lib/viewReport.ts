/**
 * «ТАЙЛАН ТАТАХ» — ИДЭВХТЭЙ ХАРАГДАЦЫН ДЭЛГЭЦ ДЭЭР ХАРАГДАЖ БУЙ БҮХ ҮЗҮҮЛЭЛТИЙГ
 * .docx БОЛГОН ТАТНА (2026-10-15, хэрэглэгч: «Khorshoo_loan-ийн тайлан татахыг
 * ойлгоод зүүн самбарын 1–26 хэсэг тус бүрд нэм»).
 *
 * Khorshoo_loan-ийн `lib/report.ts`-ийн зарчим: «Дэлгэц дээр харагдаж буй бүх
 * үзүүлэлтийг идэвхтэй шүүлтүүрийн хамт .docx болгон татаж авна». Бүтэц нь мөн
 * адил: гарчиг → огноо → шүүлтийн нөхцөл → дугаарласан бүлгүүд (гарчиг, тайлбар,
 * хүснэгт) — дээр нь график ба газрын зургийг зураг болгон оруулна.
 *
 * ⚠️ ЯАГААД DOM-ООС: 26 харагдац бүр өөр өгөгдөл, өөр сонголтын төлөвтэй (багц,
 *    огноо, таб …) бөгөөд тэр төлөв модуль дотроо `useState`-д байдаг тул порталаас
 *    уншигдахгүй. Дэлгэцийн DOM нь харин ЯГ идэвхтэй шүүлт, таб, сонголтын үр дүн —
 *    тайлан дэлгэцтэй үргэлж ТААРНА, харагдац нэмэгдэхэд тусдаа код бичихгүй.
 * ⚠️ СИНХРОН ХЭСЭГ ДЭЛГЭЦЭНД ХАРАГДАХГҮЙ: (1) `data-theme`-ийг түр 'light' болгоно —
 *    харанхуй горимын цайвар бичиг/график цагаан цаасан дээр уншигдахгүй; (2) удирдлагын
 *    элементүүдийг (шүүлтийн чип, таб, «харах» товч …) `data-rep-hide`-аар түр нууна —
 *    `innerText` тэднийг автоматаар алгасна. Хоёуланг нь ИЖИЛ task дотор буцаана —
 *    хөтөч хооронд нь зурдаггүй тул дэлгэц анивчихгүй.
 * ⚠️ Газрын зураг — `view.takeScreenshot` (`mapShots.ts`); WebGL canvas-ыг шууд
 *    уншвал хоосон гардаг.
 * ⚠️ 2026-10-15-ны амьд туршилтын засвар (Ерөнхий дашбоард · ХАБЭА):
 *    - он/сар/улирлын шүүлтийн чип («Бүгд 2024 2025 … 1 2 … 12») мөр мөрөөр орж байсан →
 *      ≥3 богино товчтой бүлэг = удирдлага;
 *    - графикийн тэнхлэгийн тоо («0.0% 13.9% … 2024») графикийн доор жагсаж байсан →
 *      график агуулсан хэсэгт зөвхөн тооноос тогтсон мөрийг хасна;
 *    - KPI карт («2.49 их наяд ₮ / НИЙТ ТӨСӨВ») салангид мөр болж байсан → дараалсан
 *      2–5 мөртэй элементүүд нэг хүснэгт (нэр | утга), тоо эхэлсэн бол нэрийг урагшлуулна.
 */
import { NUMERIC, buildDocx, downloadDocx, type DocBlock } from './docx';
import { liveMapViews } from './mapShots';
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
  /* ⚠️ `display: contents` хайрцаггүй → `checkVisibility` ХУДЛАА false өгдөг (Тайлан харагдацын
     бие бүхэлдээ алга болж байв) — хүүхдүүдийг нь тус тусад нь шалгана */
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
 * ⚠️ Урьд 2 түвшин гүн шалгадаг байсан → Газар чөлөөлөлтийн самбар бүхэлдээ «тэнхлэг» болж
 *    KPI-ийн тоо («2,088») алга болж, картууд хүснэгт болохгүй байв. Зөвхөн шууд хүүхэд.
 */
const holdsChart = (el: Element) =>
  [...el.querySelectorAll(':scope > svg, :scope > canvas')].some((d) => isChartSvg(d) || isChartCanvas(d));

const CONTROL_ROLES = new Set(['button', 'tab', 'radio', 'switch', 'option', 'menuitem', 'menuitemradio', 'checkbox']);

/**
 * Удирдлага (шүүлтийн чип, таб, «харах/нэмэх» товч) эсэх.
 * ⚠️ Урт (≥28 тэмдэгт) товчийг ҮЛДЭЭНЭ — жагсаалтын мөр бүхэлдээ товч байдаг
 *    (жиш. бүсийн эрэмбэ «1 Сэлбэ … 2.3 км 5 объект»), тэр нь өгөгдөл.
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
     товч, ЯГ НЭГ нь сонгогдсон. ⚠️ Ерөнхий дашбоардын шалтгааны жагсаалт («зөвшилцөх 93» …) ч
     ижил бүтэцтэй боловч аль нь ч сонгогдоогүй → өгөгдөл хэвээр. */
  const pressed = (k: Element) => ['aria-pressed', 'aria-selected', 'aria-checked'].some((a) => k.getAttribute(a) === 'true');
  const sib = el.parentElement ? [...el.parentElement.children].filter((k) => k.tagName === 'BUTTON' || k.getAttribute('role') === 'button') : [];
  if (sib.length >= 3 && sib.filter(pressed).length === 1 && sib.every((k) => oneLine((k as HTMLElement).innerText || '').length < 12)) return true;
  /* Үсэг + тоо = өгөгдлийн мөр — ҮЛДЭЭНЭ */
  if (/\p{L}/u.test(t)) return false;
  if (el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected') || el.hasAttribute('aria-checked')) return true;
  return sib.length >= 3 && sib.every((k) => oneLine((k as HTMLElement).innerText || '').length < 16);
}

/** Удирдлагыг түр нууна (синхрон хэсэгт; файлын толгойн ⚠️) — нуусан элементүүдийг буцаана */
function hideControls(roots: Element[]): Element[] {
  const hidden: Element[] = [];
  /* Зөвхөн УДИРДЛАГА гэж нуусан нь — доорх бүлгийн шалгалтад; чимэглэлийн aria-hidden («▸») орохгүй
     (⚠️ орвол дэлгэх товч «▸ Автозам» бүхэлдээ «шошгын бүлэг» болж нуугдана) */
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
  /* ⚠️ Зөвхөн ≥2 товч нуугдсан (эсвэл өмнөх давхарт бүлгээрээ нуугдсан) эцэг — ганц «ⓘ» товчтой
     KPI карт («92.0% ГАЗАР ЧӨЛӨӨЛӨЛТ») богино тул андуурч нуугдана */
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

/** Хүснэгт — `<table>` эсвэл `role=table|grid`. colspan-ыг хоосон нүдээр дэлгэнэ */
function readTable(el: Element): DocBlock | null {
  const head: string[][] = [];
  const rows: string[][] = [];
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
      (inHead && !rows.length ? head : rows).push(cells);
      if (rows.length >= MAX_TABLE_ROWS) break;
    }
  } else {
    for (const r of el.querySelectorAll('[role="row"]')) {
      if (!visible(r)) continue;
      const cs = [...r.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')].filter(visible);
      const cells = cs.map(txt);
      if (!cells.some(Boolean)) continue;
      const isHead = cs.every((c) => c.getAttribute('role') === 'columnheader');
      (isHead && !rows.length ? head : rows).push(cells);
      if (rows.length >= MAX_TABLE_ROWS) break;
    }
  }
  if (!head.length && !rows.length) return null;
  return { kind: 'table', head, rows };
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
 * ⚠️ 2026-10-15 амьд туршилт: Ерөнхий дашбоардын S-муруйн тэнхлэг («0.0% … 92.8%», он)
 *    HTML давхарга тул зөвхөн SVG-ийг зурахад тэнхлэггүй хоёр шугам л гарсан.
 *    `foreignObject` дотор тооцоолсон загвартай хуулбарыг зурна (dom-to-image-ийн арга).
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
  /* ⚠️ «2.49 их наяд ₮» нь NUMERIC-т таарахгүй (нэгж + ₮) — цифрээр эхлээгүй мөр = нэр.
     Хэд байвал ХАМГИЙН УРТЫГ нь авна: «2,088 / талбар / НИЙТ НЭГЖ ТАЛБАР»-д нэгж биш нэр. */
  const isName = (l: string) => !/^[−\-+]?\(?\d/.test(l) && !NUMERIC.test(l);
  /* ТОМ ҮСГЭЭР бичсэн мөр (CSS uppercase шошго — `innerText` хувиргалтыг хадгалдаг) давуу:
     «114,085 / объект / НИЙТ» → нэр = НИЙТ, нэгж биш */
  const upper = (l: string) => /\p{Lu}{3}/u.test(l) && l === l.toUpperCase();
  let k = lines.findIndex((l) => isName(l) && upper(l));
  if (k < 0) k = lines.findIndex(isName);
  if (k < 0) k = 0;
  return [lines[k], lines.filter((_, j) => j !== k).join(' · ')];
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
      const lines = !axis && !isMapHost(c) && !isTable(c) ? cardLines(c) : null;
      if (lines) { run.push(lines); runEls.push(c); continue; }
      flush();
      walk(c, axis);
    }
    flush();
  };

  const walk = (el: Element, axisIn: boolean) => {
    if (el.hasAttribute(HIDE) || !visible(el)) return;
    if (isMapHost(el)) { push({ kind: 'map', host: el, caption: tr('Газрын зураг') }); return; }
    if (isTable(el)) { const t = readTable(el); if (t) push({ kind: 'block', block: t }); return; }
    const box = chartBox(el);
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

async function mapShot(host: Element): Promise<{ png: Uint8Array; w: number; h: number } | null> {
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
  /** Идэвхтэй шүүлтийн тайлбар (бүс г.м.); хоосон бол «Шүүлтгүй — бүх өгөгдөл» */
  filters: string[];
};

/** Харагдацын үндэс — бүтэн харагдац `#main`, газрын зурагтай харагдац `#main` + `#panel` */
function roots(): Element[] {
  return ['main', 'panel'].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
}

const p2 = (x: number) => String(x).padStart(2, '0');
/** YYYY-MM-DD HH:MM — `toLocaleString('mn-MN')` Chrome-д «10/15/2026, 5:27 PM» өгдөг */
const stamp = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

export async function buildViewReport(meta: ViewReportMeta): Promise<DocBlock[]> {
  const pending: Pending[] = [];
  const html = document.documentElement;
  const prevTheme = html.dataset.theme;
  const rs = roots();
  /* ⚠️ Гэрэл горим + удирдлага нуух — зөвхөн синхрон хэсэгт (файлын толгойн ⚠️) */
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

  const body = (await Promise.all(pending.map(resolve))).filter((b): b is DocBlock => !!b);

  /* Khorshoo-гийн бүтэц: 1-р түвшний гарчгийг дугаарлана */
  let n = 0;
  /* Дэлгэц дээр аль хэдийн дугаарласан («1. Төслийн ерөнхий байдал» — Тайлан) бол дахин дугаарлахгүй */
  for (const b of body) if (b.kind === 'h' && b.level === 1 && !/^\d+[.)]\s/.test(b.text)) b.text = `${++n}. ${b.text}`;

  const head: DocBlock[] = [
    { kind: 'p', text: `${meta.title} — ${tr('тайлан')}`.toUpperCase(), bold: true, size: 30, center: true },
  ];
  if (meta.desc) head.push({ kind: 'p', text: meta.desc, italic: true, center: true, color: '555555' });
  head.push(
    { kind: 'p', text: `${tr('Огноо')}: ${stamp(new Date())}` },
    { kind: 'p', text: `${tr('Шүүлтийн нөхцөл')}: ${meta.filters.length ? meta.filters.join(' | ') : tr('Шүүлтгүй — бүх өгөгдөл')}`, bold: true },
  );
  if (!body.length) body.push({ kind: 'p', text: tr('Дэлгэц дээр тайланд орох мэдээлэл олдсонгүй.') });
  return [...head, ...body];
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

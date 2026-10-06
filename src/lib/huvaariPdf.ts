/**
 * ХУВААРИЙН PDF — «Хуваарь» харагдацыг хэвлэж уншихуйц вектор PDF болгоно.
 *
 *   1-р хуудас  ХУРААНГУЙ — үндсэн бүлгүүд, төслийн бүх хугацаа (сараар)
 *   дараагийнх  БҮЛЭГ БҮР ТУСДАА — өөрийн огнооны мужтай тэнхлэг, масштаб нь
 *               мужаас: ≤92 хоног → хоногоор · ≤400 → 7 хоногоор · бусад → сараар
 *
 *   ┌──────┬──────────────┬──────────── хуанли (бүлгийн мужаар) ────────────┐
 *   │ код  │ ажил (шатлал) │ ▓▓▓▓▓▓ зурвас ▓▓▓▓▓▓ огноо · хоног               │
 *
 * ⚠️ ЗАГВАРЫН ТҮҮХ (2026-09-30, хэрэглэгчтэй хамт) — БУЦААЖ БҮҮ ОРУУЛ:
 *    A3, огнооны 12 багана → хуанли жижиг; A2, сарын тэнхлэг → «бар-ууд маш
 *    богино ойлгомжгүй»; нэг аварга хуудас (4.4 × 4.5 м), хоногийн тэнхлэг →
 *    «хүн харахад маш хэцүү, бүхэлд нь хоногоор 2 хуудсанд багтаах нь буруу
 *    сонголт». Эцэст нь MS Project / Primavera-гийн хэвлэлийн ёсоор: ЕРДИЙН
 *    ЦААС (A3 хэвтээ) + БҮЛГЭЭР ХУУДАСЛАХ + бүлэг бүрийн ӨӨРИЙН тэнхлэг —
 *    15 хоногийн цутгалт хоног бүрээр, 3 жилийн төсөл сараар уншигдана.
 * ⚠️ ОГНООГҮЙ ДЭД АЖИЛ ОРНО — бүлгийнхээ хугацаагаар (`inh`, тасархай хүрээ).
 *    Анх огноогүй мөрийг бүгдийг хассан нь АЛДАА байв (2026-09-30, хэрэглэгч:
 *    «задаргаатай ажил бүрийг харах боломжгүй»): хуваарийн дүрмээр бүлгийн
 *    ӨӨРИЙН огноо давамгайлдаг (`bagtsSheet.computeAll`) тул «1.1 Суурь
 *    ухлага» огноотой, доторх 5 ажил огноогүй байх нь ЕРДИЙН — тэд бүлгийн
 *    хугацаанд хийгдэнэ. Хасахад задаргаа бүхэлдээ алга болж байв.
 *    Огноотой өвөг огтгүй мөр л (жинхэнэ хуваарьгүй) хасагдана.
 * ⚠️ Мөрүүд нь `Huvaari.visible` (эвхсэн · түвшин · хайлт шүүгдсэн), зурвас нь
 *    идэвхтэй таб (`kind`) ба блок (`blk`)-ийнх, «Зэрэг» асаалттай бол нөгөө
 *    төрлийн лавлагааны зурвас доод хагаст.
 * ⚠️ ӨНГӨ нь `huvaari.module.css`-ийн ГЭРЭЛТЭЙ сэдвийн утга — цаасан дээр
 *    харанхуй сэдэв утгагүй.
 * ⚠️ ТООЦОО ХИЙХГҮЙ: огноо, төлөв, зөрчил бүгд дуудагчаас (`HvPdfRow`) бэлэн
 *    ирнэ — `effSpan`/`statusOf`/`requiredStart`-ийг энд давтвал дэлгэцтэй
 *    зөрөх хоёр дахь эх үүснэ.
 * ⚠️ СОНГОЛТ (`HvPdfOpts`, 2026-09-30): хугацааны цонх (ирэх 1/3 сар) —
 *    талбайн 7 хоногийн хуралд; зөвхөн хоцорсон/явж буй ажил; A3/A4.
 * ⚠️ ГҮЙЦЭТГЭЛ (`act`) нь 0–1 БУТАРХАЙ — зурвасын тэр хэсгийг бараан
 *    дүүргэж, шошгонд `× 100` хувиар бичнэ (`pct()` 100-аар үржүүлдэггүй тул
 *    энд ашиглахгүй). `null` = хэмжээгүй → дүүргэлтгүй, хувь бичихгүй.
 * ⚠️ `null` ≠ 0: хуваарьгүй мөрд зурвас ОГТ зурахгүй.
 * ⚠️ Roboto-д «→» бий эсэх баталгаагүй тул огнооны мужийг «–»-ээр бичнэ.
 */
import type { TDocumentDefinitions, Content, TableCell, CanvasElement, Column } from 'pdfmake/interfaces';
import { t as tr } from '@/lib/i18nCore';
import { dayKey, num } from '@/lib/format';
import { spanDays, type Span, type Status } from '@/lib/plan';
import { stText } from '@/modules/huvaari/util';
import { renderPdfBase64, download } from '@/lib/emailReport';

/** Нэг мөр — дэлгэцийн `TaskRow` + хуанлийн зурвасын БЭЛЭН утгууд */
export type HvPdfRow = {
  des: number | null;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  /** Бодит муж — зөвхөн хуанлийн нарийн зурвасад (багана болж гарахгүй) */
  aStart: number | null;
  aEnd: number | null;
  /** Идэвхтэй таб · блокийн зурвас (бүлэгт `effSpan`) */
  bar: Span | null;
  st: Status;
  /** Уялдааны зөрчил — улаан тасархай хүрээ */
  viol: boolean;
  /** «Зэрэг» асаалттай үед нөгөө төрлийн зурвас (доод хагас) */
  ref: Span | null;
  /** Идэвхтэй блокийн гүйцэтгэл 0–1 (`PlanRow.act`), хэмжээгүй бол `null` */
  act: number | null;
  /**
   * ӨВЛӨСӨН МУЖ — өөрөө огноогүй мөрийн хамгийн ойрын огноотой эцэг бүлгийн
   * зурвас. ⚠️ `buildHuvaariDoc` ӨӨРӨӨ бөглөнө (дуудагч өгөхгүй).
   */
  inh?: Span | null;
};

/** Татахын өмнөх сонголт (Хуваарийн «PDF татах» цонх) */
export type HvPdfOpts = {
  /** Ирэх N сарын ажил (өнөөдрөөс); 0 = бүх хугацаа */
  months: 0 | 1 | 3;
  /** Зөвхөн хоцорсон ба явж буй ажил (бүлгүүд нь дагаж үлдэнэ) */
  active: boolean;
  paper: 'A3' | 'A4';
};
export const HV_PDF_DEFAULT: HvPdfOpts = { months: 0, active: false, paper: 'A3' };

export type HvPdfInput = {
  /** Багцын нэр (`pkg.label`) */
  pkg: string;
  /** «Гэрээ» / «Төлөвлөгөө» */
  kindLabel: string;
  /** «Зэрэг» асаалттай бол нөгөө төрлийн нэр, үгүй бол `null` */
  refLabel: string | null;
  /** Идэвхтэй блокийн нэр (`sc.bld[blk]`), нэг блоктой бол '' */
  block: string;
  from: number;
  to: number;
  now: number;
  rows: HvPdfRow[];
  hasActual: boolean;
  opts?: HvPdfOpts;
};

/* ── Гэрэлтэй сэдвийн өнгө (`globals.css :root`) ── */
const C = {
  ink: '#14181c',
  ink2: '#3b4656',
  ink3: '#5a6a80',
  line: '#d5dbe3',
  grid: '#e6eaef',
  gridBig: '#c3cad4',
  head: '#eef1f5',
  group: '#f3f5f8',
  good: '#16a34a',
  data: '#2e7f8b',
  bad: '#dc2626',
  overlap: '#a21caf',
  /* ⚠️ ТӨЛӨВЛӨСӨН (эхлээгүй · гүйцэтгэл хэмжигдээгүй) — ЦЭНХЭР, саарал БИШ
     (2026-09-30, хэрэглэгч: «хуваарьгүй ажил юу саарал вэ»). Цайвар саарал
     нь «идэвхгүй / хуваарьгүй» гэж уншигдаж байв. Дэлгэцийн `.tlTodo`/
     `.tlNone` саарал хэвээр — цаасан дээр л ялгана. */
  todo: '#3b6fd0',
  none: '#3b6fd0',
  plan: '#3b6fd0',
};
const ST_FILL: Record<Status, string> = {
  done: C.good, run: C.data, late: C.bad, todo: C.todo, none: C.none,
};
/** Цагаан бичвэр харагдах бараан дүүргэлт */
const ST_DARK: Record<Status, boolean> = {
  done: true, run: true, late: true, todo: true, none: true,
};


/* ── Хэмжээс (pt) — цаасаас үл хамаарах ── */
const MARGIN = 24;
/** Толгой: гарчиг · тайлбар — `pageMargins`-ийн дээд (бүлгийн нэр контентод) */
const TOP = 62;
/** Бүлгийн гарчгийн мөр ба бүлэг хоорондын зай */
const TITLE_H = 20;
const GAP = 14;
const BOTTOM = 26;
const HEAD_H = 30;       // хүснэгтийн толгой: сар/он · өдөр/7 хоног
const ROW_H = 14.5;
const ROW_LINE = 0.3;
const FS = 7.5;          // мөрийн үсэг
const LAB_FS = 6.5;      // зурвасын шошго
const PAD = 3;
const LINE_W = 0.4;
const DAY = 86_400_000;

type Col = { key: 'des' | 'work'; head: string; w: number; align?: 'left' | 'center' };

/**
 * ЦААСНААС ХАМААРАХ ХЭМЖЭЭС — A3/A4 хэвтээ.
 * ⚠️ ЗӨВХӨН КОД + АЖИЛ (2026-09-30, хэрэглэгч: «эне fieldүүдийг хидэлж татах
 *    ёстой»). Огноо, хоног, хүн · техник, хамаарлын баганууд PDF-д ОРОХГҮЙ.
 * ⚠️ A4 дээр ажлын нэрийн багана нарийсна — эс бөгөөс хуанли ~400pt болж
 *    7 хоногийн масштаб ч бүдгэрнэ.
 */
type Geo = { pageW: number; pageH: number; cols: Col[]; gw: number; avail: number; perPage: number; split: number };
function geo(paper: 'A3' | 'A4'): Geo {
  const [pageW, pageH] = paper === 'A4' ? [841.89, 595.28] : [1190.55, 841.89];
  const cols: Col[] = [
    { key: 'des', head: 'Ажлын код', w: 36, align: 'center' },
    { key: 'work', head: 'Ажил', w: paper === 'A4' ? 220 : 330 },
  ];
  const leftW = cols.reduce((a, c) => a + c.w + PAD * 2 + LINE_W, 0) + LINE_W;
  const avail = pageH - TOP - BOTTOM;
  const perPage = Math.floor((avail - TITLE_H - HEAD_H - 4) / (ROW_H + ROW_LINE));
  /**
   * Бүлгийг ХУВААХ босго — үүнээс олон мөртэй бүлэг дэд бүлгүүдэд задарна.
   * ⚠️ 2 хуудас: 10 хуудас дамжсан нэг тэнхлэг нь бүх төслийг хамарч
   *    хоногийн нарийвчлалыг алдагдуулна.
   */
  return { pageW, pageH, cols, gw: Math.floor(pageW - MARGIN * 2 - leftW - 2), avail, perPage, split: perPage * 2 };
}

const iso = (ms: number | null) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));
const short = (ms: number) => new Date(ms).toISOString().slice(5, 10);
/**
 * ⚠️ Урт нэрийг ГАРААР таслана: pdfmake-ийн `noWrap` нь нүднээс ХАЛЬЖ хажуугийн
 *    багана руу бичдэг, ороох нь мөрийн өндрийг сунгаж хуанлийн эгнээг эвддэг.
 *    Кирилл үсэг латинаас өргөн тул 0.56.
 */
const fit = (s: string, w: number, fs: number) => {
  const max = Math.max(1, Math.floor(w / (fs * 0.56)));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;
/**
 * ХУУЧИН ФОНТЫН ТЭМДЭГТ — «хєрс», «їе» → «хөрс», «үе».
 * ⚠️ Төсвийн Excel-ээс ирсэн нэрс нь Ө/Ү-г украин Є/Ї кодоор хадгалсан (хуучин
 *    монгол фонт тэдгээрийг Ө/Ү мэт зурдаг байв). Roboto жинхэнэ Є/Ї зурна —
 *    PDF дээр л засна, ӨГӨГДӨЛ ХӨНДӨХГҮЙ. Монгол бичвэрт Є/Ї жинхэнээрээ
 *    хэрэглэгддэггүй тул андуурах эрсдэлгүй.
 */
const norm = (s: string) => s.replace(/є/g, 'ө').replace(/Є/g, 'Ө').replace(/ї/g, 'ү').replace(/Ї/g, 'Ү');
const rowLabel = (r: HvPdfRow) => norm(`${r.no ? `${r.no} ` : ''}${r.work}`.trim());

/* ══════════════════ ТЭНХЛЭГ ══════════════════ */

type Scale = 'day' | 'week' | 'month';
type Axis = { from: number; days: number; scale: Scale; px: number };

/** Мөрүүдийн огнооны муж — зурвас · лавлагаа · бодит (дуусаагүй бол өнөөдөр) */
function rangeOf(rows: HvPdfRow[], now: number, hasActual: boolean): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const add = (a: number, b: number) => { lo = Math.min(lo, a); hi = Math.max(hi, b); };
  for (const r of rows) {
    if (r.bar) add(r.bar.start, r.bar.end);
    if (r.ref) add(r.ref.start, r.ref.end);
    if (hasActual && r.aStart != null) add(r.aStart, r.aEnd ?? Math.max(r.aStart, now));
    if (!r.bar && r.inh) add(r.inh.start, r.inh.end);
  }
  return Number.isFinite(lo) ? [dayStart(lo), dayStart(hi)] : null;
}

/**
 * Хоногийн масштабын ХАМГИЙН БАГА өргөн (pt/хоног) — 2 оронтой өдрийн дугаар
 * (6.2pt фонт, ~6.6–7pt) завсартайгаа багтах хэмжээ.
 */
const DAY_MIN_PT = 7.5;

/**
 * Мужаас масштаб сонгоно, ирмэгийг нь бүхэл нэгж рүү тэлнэ.
 * ⚠️ БОСГО: 92 хоног (≈3 сар) хүртэл хоног бүр ~8.5pt+ — дугаар багтана;
 *    400 хоног (≈13 сар) хүртэл 7 хоног бүр ~14pt+; түүнээс урт бол сараар.
 * ⚠️ 2026-09-30: ХОНОГООР нь ЗӨВХӨН хоног бүр `DAY_MIN_PT`-ээс өргөн үед. Дээрх
 *    ~8.5pt нь A3-ийнх (761pt хуанли); A4-т (522pt) «Ирэх 3 сар» (94 хоног) нь
 *    5.5pt/хоног болж өдрийн дугаарууд бие биен дээгүүр бичигдэн уншигдахаа
 *    больдог байв — тэр үед 7 хоногоор зурна (A4: ≤67 хоног л хоногоор).
 */
function makeAxis(lo: number, hi: number, gw: number, force?: Scale): Axis {
  const span = Math.round((hi - lo) / DAY) + 1;
  /* `+ 2` — хоногийн масштаб хоёр захдаа нэг нэг хоног нэмдэг (доор) */
  const dayOk = span <= 92 && gw / (span + 2) >= DAY_MIN_PT;
  const scale: Scale = force ?? (dayOk ? 'day' : span <= 400 ? 'week' : 'month');
  let a = lo;
  let b = hi;
  if (scale === 'day') { a -= DAY; b += DAY; }
  if (scale === 'week') {
    const dow = (new Date(a).getUTCDay() + 6) % 7; // даваа = 0
    a -= dow * DAY;
    const dowB = (new Date(b).getUTCDay() + 6) % 7;
    b += (6 - dowB) * DAY;
  }
  if (scale === 'month') {
    const da = new Date(a);
    a = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), 1);
    const db = new Date(b);
    b = Date.UTC(db.getUTCFullYear(), db.getUTCMonth() + 1, 1) - DAY;
  }
  const days = Math.round((b - a) / DAY) + 1;
  return { from: a, days, scale, px: gw / days };
}

const xOf = (ax: Axis, ms: number) => ((ms - ax.from) / DAY) * ax.px;
const wOf = (ax: Axis, s: Span) => Math.max(1.5, spanDays(s) * ax.px - 0.4);
/**
 * Тэнхлэгийн мужаар ТАЙРНА — хугацааны цонхтой үед зурвас цонхноос хальж
 * зүүн баганууд дээгүүр зурагдахгүйн тулд. Шошго нь БҮТЭН огноогоо хэвээр.
 */
const clip = (ax: Axis, s: Span): Span | null => {
  const a = Math.max(s.start, ax.from);
  const b = Math.min(s.end, ax.from + (ax.days - 1) * DAY);
  return a <= b ? { start: a, end: b } : null;
};

type Tick = { ms: number; x: number; kind: 'year' | 'month' | 'minor'; lab: string | null };

/** Тэнхлэгийн шугам ба доод шошго (өдрийн дугаар / 7 хоногийн огноо / сарын дугаар) */
function ticksOf(ax: Axis): Tick[] {
  const out: Tick[] = [];
  for (let i = 0; i < ax.days; i++) {
    const ms = ax.from + i * DAY;
    const d = new Date(ms);
    const dd = d.getUTCDate();
    const mon1 = dd === 1;
    const jan1 = mon1 && d.getUTCMonth() === 0;
    const x = i * ax.px;
    if (ax.scale === 'day') {
      out.push({ ms, x, kind: jan1 ? 'year' : mon1 ? 'month' : 'minor', lab: String(dd) });
    } else if (ax.scale === 'week') {
      const monday = d.getUTCDay() === 1;
      if (mon1) out.push({ ms, x, kind: jan1 ? 'year' : 'month', lab: monday ? String(dd) : null });
      else if (monday) out.push({ ms, x, kind: 'minor', lab: String(dd) });
    } else if (mon1) {
      /* ⚠️ Сар хэт нарийн бол (олон жилийн муж) дугаарыг алгасна — давхцана */
      const lab = 30 * ax.px >= 9 ? String(d.getUTCMonth() + 1) : null;
      out.push({ ms, x, kind: jan1 ? 'year' : 'month', lab });
    }
  }
  return out;
}

/** Дээд мөрийн шошго: хоног/7 хоногт «2026-09» сар бүр, сарын масштабт он */
function topLabels(ax: Axis): { x: number; lab: string }[] {
  const out: { x: number; lab: string }[] = [];
  for (let i = 0; i < ax.days; i++) {
    const ms = ax.from + i * DAY;
    const d = new Date(ms);
    const first = i === 0;
    if (ax.scale === 'month') {
      if (first || (d.getUTCDate() === 1 && d.getUTCMonth() === 0)) out.push({ x: i * ax.px, lab: String(d.getUTCFullYear()) });
    } else if (first || d.getUTCDate() === 1) {
      out.push({ x: i * ax.px, lab: iso(ms).slice(0, 7) });
    }
  }
  /* Эхний шошго дараагийнхтай давхцвал хасна */
  if (out.length > 1 && out[1].x - out[0].x < 34) out.shift();
  return out;
}

/* ══════════════════ БҮЛЭГЛЭЛТ ══════════════════ */

type Section = { title: string; rows: HvPdfRow[]; axis: Axis; summary?: boolean };

/** Хамгийн бага гүнтэй мөр бүрээс шинэ дэд мод эхэлнэ */
function subtrees(rows: HvPdfRow[]): HvPdfRow[][] {
  if (!rows.length) return [];
  const d0 = Math.min(...rows.map((r) => r.depth));
  const out: HvPdfRow[][] = [];
  let cur: HvPdfRow[] | null = null;
  for (const r of rows) {
    if (!cur || r.depth <= d0) { cur = [r]; out.push(cur); } else cur.push(r);
  }
  return out;
}

type Part = { path: string[]; rows: HvPdfRow[] };

/**
 * Бүлгүүдэд задлах: `Geo.split`-ээс том бүлэг дэд бүлгүүдэд хуваагдана.
 * ⚠️ Задарсан бүлгийн ӨӨРИЙН мөр PDF-ийн хэсэгт ОРОХГҮЙ — нэр нь зам (`path`)
 *    болж гарчигт, зурвас нь хураангуй хуудсанд гарна.
 * ⚠️ Дангаар байгаа ажлын мөрүүд (бүлэггүй) нэг хэсэгт цугларна — мөр бүр
 *    тусдаа хуудас болохгүй.
 */
function split(rows: HvPdfRow[], path: string[], out: Part[], max: number): void {
  let loose: HvPdfRow[] = [];
  const flush = () => { if (loose.length) { out.push({ path, rows: loose }); loose = []; } };
  for (const t of subtrees(rows)) {
    const root = t[0];
    if (t.length === 1 && !root.group) { loose.push(root); continue; }
    flush();
    if (t.length <= max || !root.group) out.push({ path: [...path, rowLabel(root)], rows: t });
    else split(t.slice(1), [...path, rowLabel(root)], out, max);
  }
  flush();
}

/**
 * ЖИЖИГ ХӨРШ БҮЛГҮҮДИЙГ НЭГ ХУУДСАНД — эцэг нь ижил, нийлбэр нь нэг хуудсанд
 * багтвал нийлүүлнэ. ⚠️ Үгүй бол 3 мөртэй бүлэг бүр бүтэн хуудас иднэ.
 */
function pack(parts: Part[], perPage: number): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    const parent = (q: Part) => q.path.slice(0, -1).join('\u0000');
    if (last && last.rows.length + p.rows.length <= perPage && parent(last) === parent(p)
      && last.path.length === p.path.length) {
      out[out.length - 1] = { path: last.path.slice(0, -1).concat(''), rows: [...last.rows, ...p.rows] };
    } else out.push(p);
  }
  return out;
}

/**
 * МӨР СОНГОХ — `keep`-д тэнцсэн ажил ба тэдгээрийн БҮХ эцэг бүлэг.
 * ⚠️ Жагсаалтад хүүхэдгүй бүлэг (дэлгэц дээр эвхсэн) нь ажил мэт шалгагдана.
 * ⚠️ Хүүхдүүд нь бүгд ОГНООГҮЙ бүлэг (жишээ нь «1.2 Суурь буцаан булалт» —
 *    бүлгийн өөрийн огноотой, дэд ажлууд хуваарьгүй) нь өөрөө шалгагдана —
 *    эс бөгөөс огноотой бүлэг «хүүхэд үлдсэнгүй» гээд алга болно.
 */
function select(rows: HvPdfRow[], keep: (r: HvPdfRow) => boolean, dated: (r: HvPdfRow) => boolean): HvPdfRow[] {
  const out: HvPdfRow[] = [];
  for (const t of subtrees(rows)) {
    const [root, ...kids] = t;
    if (!kids.length) { if (keep(root)) out.push(root); continue; }
    const inner = select(kids, keep, dated);
    if (inner.length) out.push(root, ...inner);
    else if (!kids.some(dated) && keep(root)) out.push(root);
  }
  return out;
}

/* ══════════════════ БАРИМТ ══════════════════ */

export function buildHuvaariDoc(x: HvPdfInput): TDocumentDefinitions {
  const opts = x.opts ?? HV_PDF_DEFAULT;
  const G = geo(opts.paper);
  const GW = G.gw;
  const cols = G.cols.map((c) => ({ ...c, head: tr(c.head) }));
  const nCols = cols.length + 1;
  const scaleName: Record<Scale, string> = {
    day: tr('хоногоор'), week: tr('7 хоногоор'), month: tr('сараар'),
  };

  /*
   * ӨВЛӨСӨН МУЖ — өөрөө огноогүй мөрт хамгийн ойрын огноотой ЭЦГИЙН зурвас
   * (толгойн ⚠️). Мөрүүд модны дарааллаар (эцэг нь хүүхдийнхээ өмнө) ирдэг
   * тул гүнээр нь стек барина.
   */
  const rowsIn: HvPdfRow[] = (() => {
    const stack: { depth: number; span: Span | null }[] = [];
    return x.rows.map((r) => {
      while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
      let inh: Span | null = null;
      if (!r.bar) {
        for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].span) { inh = stack[i].span; break; } }
      }
      stack.push({ depth: r.depth, span: r.bar ?? inh });
      return { ...r, inh };
    });
  })();
  /* ⚠️ Огноотой өвөг ч үгүй мөр (жинхэнэ хуваарьгүй) л хасагдана */
  const hasDate = (r: HvPdfRow) => !!(r.bar || r.inh || r.ref || (x.hasActual && r.aStart != null));
  /*
   * ⚠️ 2026-10-06: «ОДОО» ТЭНХЛЭГ ДЭЭР — ОРОН НУТГИЙН ханын цаг (UTC-шөнө-дундын тэнхлэгт).
   *    Тэнхлэг/зурвас нь UTC-шөнө-дундын огноо; урьд нь `dayStart(x.now)` (UTC өдөр) тул
   *    Улаанбаатарт 00:00–08:00 хооронд «Өнөөдөр» шугам, «ирэх N сар» цонх ӨЧИГДӨР дээр
   *    буудаг байв (хэвлэсэн огнооны `dayKey`-ийн ⚠️-тэй ижил дүрэм). Цагийн бутархай хадгалагдана.
   */
  const nowAx = x.now - new Date(x.now).getTimezoneOffset() * 60_000;
  /* Хугацааны цонх — өнөөдрөөс ирэх N сар (календарийн сар) */
  const today = dayStart(nowAx);
  const win: [number, number] | null = opts.months
    ? (() => {
      const d = new Date(today);
      return [today, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + opts.months, d.getUTCDate()) - DAY];
    })()
    : null;
  const inWin = (r: HvPdfRow) => {
    if (!win) return true;
    const rg = rangeOf([r], nowAx, x.hasActual);
    return !!rg && rg[0] <= win[1] && rg[1] >= win[0];
  };
  /* ⚠️ Өвлөсөн мужтай мөр өөрийн төлөвгүй — «зөвхөн идэвхтэй» шүүлтэд орохгүй */
  const isActive = (r: HvPdfRow) => !opts.active || (!!r.bar && (r.st === 'late' || r.st === 'run'));
  const dated = select(rowsIn, (r) => hasDate(r) && inWin(r) && isActive(r), hasDate);
  const all0 = rangeOf(dated, nowAx, x.hasActual);
  /* Цонхтой бол муж нь цонхоор хязгаарлагдана */
  const clampR = (rg: [number, number] | null): [number, number] | null =>
    rg && win ? [Math.max(rg[0], win[0]), Math.min(rg[1], win[1])] : rg;
  const all = clampR(all0);

  const sections: Section[] = [];
  if (all) {
    /* ХУРААНГУЙ — хамгийн дээд 2 түвшин, төслийн бүх муж. Цонхгүй бол сараар,
       цонхтой бол (1–3 сар) мужаасаа автоматаар — 1 сарыг сараар зурах утгагүй. */
    const d0 = Math.min(...dated.map((r) => r.depth));
    const top = dated.filter((r) => r.depth <= d0 + 1);
    sections.push({
      title: tr('Хураангуй — үндсэн бүлгүүд'),
      rows: top,
      axis: makeAxis(all[0], all[1], GW, win ? undefined : 'month'),
      summary: true,
    });
    const parts: Part[] = [];
    split(dated, [], parts, G.split);
    for (const p of pack(parts, G.perPage)) {
      const rg = clampR(rangeOf(p.rows, nowAx, x.hasActual));
      if (!rg) continue;
      sections.push({ title: p.path.filter(Boolean).join('  ›  ') || x.pkg, rows: p.rows, axis: makeAxis(rg[0], rg[1], GW) });
    }
  }

  const content: Content[] = [];

  const tableLayout = {
    hLineWidth: (i: number) => (i <= 1 ? 0.7 : ROW_LINE),
    vLineWidth: (i: number) => (i === nCols ? LINE_W : i === cols.length ? 0.7 : LINE_W),
    hLineColor: () => C.line,
    vLineColor: () => C.line,
    paddingLeft: (i: number) => (i === cols.length ? 0 : PAD),
    paddingRight: (i: number) => (i === cols.length ? 0 : PAD),
    paddingTop: () => 0,
    paddingBottom: () => 0,
    fillColor: (i: number, _n: unknown, col?: number) => (i === 0 && col !== cols.length ? C.head : null),
  };

  /** Хүснэгтийн толгой мөр — тэнхлэг бүрд шинээр (pdfmake зангилааг өөрчилдөг).
      `nRows` — ЭНЭ хүснэгтийн (хуудасны хэсгийн) мөрийн тоо: доорх сүлжээ түүгээр (2026-10-01). */
  const headRow = (ax: Axis, nRows: number): TableCell[] => {
    const left: TableCell[] = cols.map((c) => ({
      text: c.head, bold: true, fontSize: 8, color: C.ink2, alignment: c.align ?? 'left',
      margin: [0, 9, 0, 0],
    }));
    const cv: CanvasElement[] = [];
    const txt: Content[] = [];
    for (const t of ticksOf(ax)) {
      const big = t.kind !== 'minor';
      cv.push({
        type: 'line', x1: t.x, y1: big ? 0 : 16, x2: t.x, y2: HEAD_H,
        lineWidth: t.kind === 'year' ? 0.9 : big ? 0.6 : 0.3, lineColor: big ? C.gridBig : C.grid,
      });
      if (t.lab) {
        const w = t.lab.length * 3.3;
        /* Хоногийн масштабт нүдний голд, бусад нь шугамын баруун талд */
        const lx = ax.scale === 'day' ? t.x + Math.max(0.3, (ax.px - w) / 2) : t.x + 1.5;
        txt.push({
          text: t.lab, fontSize: 6.2, bold: big, color: big ? C.ink : C.ink3,
          relativePosition: { x: lx, y: -HEAD_H + 19 },
        });
      }
    }
    /* ⚠️ «Өнөөдөр» шошготой давхцах сар/оны шошгыг түүний АРД шилжүүлнэ —
       цонхтой PDF-д өнөөдөр нь тэнхлэгийн эхлэл тул эхний сартай яг давхцдаг. */
    const nowIn = nowAx >= ax.from && nowAx < ax.from + ax.days * DAY;
    const nowX = nowIn ? xOf(ax, nowAx) : -1e9;
    for (const l of topLabels(ax)) {
      const lx = l.x + 2 > nowX - 30 && l.x + 2 < nowX + 34 ? nowX + 34 : l.x + 2;
      txt.push({ text: l.lab, fontSize: 8, bold: true, color: C.ink, relativePosition: { x: lx, y: -HEAD_H + 3 } });
    }
    if (nowIn) {
      txt.push({
        text: tr('Өнөөдөр'), fontSize: 6.5, bold: true, color: C.bad,
        relativePosition: { x: xOf(ax, nowAx) + 2, y: -HEAD_H + 3 },
      });
    }
    return [...left, { stack: [{ canvas: cv }, ...txt, ...gridOf(ax, nRows)] }];
  };

  /**
   * БИЕИЙН СҮЛЖЭЭ — ХҮСНЭГТ (хуудасны хэсэг) БҮРД НЭГ УДАА, толгойн нүдэнд (2026-10-01,
   * хэрэглэгч: бүгдийг зас).
   *
   * ⚠️ ЯАГААД: урьд нь хоног/7 хоногийн шугам МӨР БҮРД давтагддаг байв (`bodyRow`-ийн
   *    `gridOf`) — 1,700 мөр × ~94 шугам ≈ 160 мянган вектор; A3 «Ирэх 3 сар» PDF хөтчид
   *    ~1 GB санах ой иддэг байв. Одоо хүснэгт бүрд шугам бүр НЭГ удаа, эхний мөрийн
   *    дээд захаас сүүлийн мөрийн доод зах хүртэл үргэлжилсэн — харагдах байдал ижил
   *    (мөр хоорондын 0.3pt хэвтээ шугам дээр нь л зурагдана; «Өнөөдөр»-ийн тасархай
   *    шугамын хэм мөр бүрд дахин эхлэхээ больсон).
   * ⚠️ СӨРӨГ КООРДИНАТ + `relativePosition` — САНААТАЙ: pdfmake канвасын өндрийг
   *    `max(y)`-аар хэмждэг тул эерэг урт шугам (а) толгой мөрийг сунгаж, (б) хуудасны
   *    үлдэгдлээс урт бол толгойг дараагийн хуудас руу түлхэнэ. Тиймээс канвасыг
   *    сүүлийн мөрийн ДООД зах руу `relativePosition`-оор (салангид блок, байрлалд
   *    нөлөөгүй) шилжүүлж, шугамыг ДЭЭШ (y ≤ 0) зурна → хэмжсэн өндөр 0.
   *    Байрлал: толгойн канвас (`HEAD_H`) → толгойн доод зураас 0.7 → мөр бүр
   *    `ROW_H` + 0.3; сүүлийн мөрийн доод зах = 0.7 + n·unit − 0.3.
   * ⚠️ Хүснэгт бүр ӨӨРИЙН мөрийн тоотой тул урт бүлэг ГАРААР хуудаслагдана (доорх
   *    `chunks`) — pdfmake-ийн автомат хуудаслалтад толгой давтагдахад ижил урт
   *    шугам сүүлийн (дутуу) хуудсанд хүснэгтээс хальна.
   */
  const gridOf = (ax: Axis, nRows: number): Content[] => {
    if (nRows <= 0) return [];
    const len = nRows * (ROW_H + ROW_LINE) - ROW_LINE;
    const g: CanvasElement[] = [];
    for (const t of ticksOf(ax)) {
      if (t.kind === 'minor' && ax.px < 4) continue;
      g.push({
        type: 'line', x1: t.x, y1: -len, x2: t.x, y2: 0,
        lineWidth: t.kind === 'year' ? 0.9 : t.kind === 'month' ? 0.6 : 0.25,
        lineColor: t.kind === 'minor' ? C.grid : C.gridBig,
      });
    }
    if (nowAx >= ax.from && nowAx < ax.from + ax.days * DAY) {
      const lx = xOf(ax, nowAx);
      g.push({ type: 'line', x1: lx, y1: -len, x2: lx, y2: 0, lineWidth: 0.9, lineColor: C.bad, dash: { length: 3, space: 2 } });
    }
    return g.length ? [{ canvas: g, relativePosition: { x: 0, y: 0.7 + len } }] : [];
  };

  const bodyRow = (r: HvPdfRow, ax: Axis, d0: number): TableCell[] => {
    const fill = r.group ? C.group : undefined;
    const ty = (ROW_H - FS * 1.2) / 2 + 0.5;
    const ind = Math.max(0, r.depth - d0) * 9;
    const left: TableCell[] = [
      { text: r.des != null ? String(r.des) : '—', fontSize: FS, bold: r.group, color: C.ink2, alignment: 'center', margin: [0, ty, 0, 0], fillColor: fill },
      { text: fit(rowLabel(r), cols[1].w - ind - PAD * 2, FS), fontSize: FS, bold: r.group, color: C.ink, margin: [ind, ty, 0, 0], fillColor: fill },
    ];
    /* ⚠️ Тунгалаг тэгш өнцөгт — хоосон мөрөнд ч canvas өндрийг барина.
       ⚠️ 2026-10-01: СҮЛЖЭЭ мөр бүрд БИШ — хүснэгтийн толгойд нэг удаа (`gridOf`-ийн ⚠️). */
    const cv: CanvasElement[] = [{ type: 'rect', x: 0, y: 0, w: 0.01, h: ROW_H, color: '#ffffff', fillOpacity: 0 }];
    const half = !!r.ref;
    const refC = r.ref ? clip(ax, r.ref) : null;
    if (refC) {
      cv.push({
        type: 'rect', x: xOf(ax, refC.start), y: ROW_H * 0.58, w: wOf(ax, refC), h: ROW_H * 0.26, r: 0.8,
        color: C.ink3, fillOpacity: 0.28, lineColor: C.ink3, lineWidth: 0.3,
      });
    }
    if (x.hasActual && r.aStart != null) {
      const s = clip(ax, { start: r.aStart, end: r.aEnd ?? Math.max(r.aStart, nowAx) }) ?? { start: ax.from, end: ax.from - DAY };
      if (s.end < s.start) { /* цонхноос гадуур — зурахгүй */ } else if (r.aEnd != null) {
        cv.push({ type: 'rect', x: xOf(ax, s.start), y: ROW_H - 1.6, w: wOf(ax, s), h: 1.6, color: C.data });
      } else {
        cv.push({
          type: 'line', x1: xOf(ax, s.start), y1: ROW_H - 0.8, x2: xOf(ax, s.start) + wOf(ax, s), y2: ROW_H - 0.8,
          lineWidth: 1.6, lineColor: C.data, dash: { length: 2, space: 1.4 },
        });
      }
    }
    let lab: Content | null = null;
    const barC = r.bar ? clip(ax, r.bar) : null;
    if (r.bar && barC) {
      const bx = xOf(ax, barC.start);
      const bw = wOf(ax, barC);
      const by = ROW_H * 0.14;
      const bh = half ? ROW_H * 0.4 : ROW_H * 0.68;
      /* ⚠️ Гүйцэтгэл 0–1; 0 < act < 1 үед л хэсэгчилсэн дүүргэлт */
      const act = r.act != null && Number.isFinite(r.act) ? Math.max(0, Math.min(1, r.act)) : null;
      const partial = !r.group && act != null && act > 0 && act < 1;
      if (r.group) {
        cv.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: 1, color: C.overlap, fillOpacity: 0.16, lineColor: C.overlap, lineWidth: 0.7 });
      } else if (partial) {
        /* ГҮЙЦЭТГЭЛ — зурвасын суурь цайвар, гүйцэтгэсэн хэсэг нь бүтэн өнгөөр.
           ⚠️ Хувь нь БҮТЭН ажлын (`r.bar`)-ынх — тайрсан хэсгийнх биш. */
        const full0 = xOf(ax, r.bar.start);
        const fullW = Math.max(1.5, spanDays(r.bar) * ax.px - 0.4);
        const doneEnd = Math.min(bx + bw, Math.max(bx, full0 + fullW * act));
        cv.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: 1, color: ST_FILL[r.st], fillOpacity: 0.3, lineColor: ST_FILL[r.st], lineWidth: 0.5 });
        if (doneEnd > bx) cv.push({ type: 'rect', x: bx, y: by, w: doneEnd - bx, h: bh, r: 1, color: ST_FILL[r.st] });
      } else {
        cv.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: 1, color: ST_FILL[r.st] });
      }
      if (r.viol) {
        cv.push({
          type: 'rect', x: bx - 0.8, y: by - 0.8, w: bw + 1.6, h: bh + 1.6, r: 1.2,
          lineColor: C.bad, lineWidth: 0.7, dash: { length: 1.6, space: 1.1 },
        });
      }
      /*
       * ШОШГО — огноо · хоног ҮРГЭЛЖ. Зурвас дотор багтвал дотор (өргөн бол
       * нэр ч), үгүй бол зурвасын ГАДНА баруун, зай үгүй бол зүүн талд.
       */
      const d = spanDays(r.bar);
      /* ⚠️ 2026-10-06: 0 < act < 1 бол 1..99 — урьд нь `Math.round` 0.996-г «100%», 0.004-ийг «0%» гэж
         харуулж, дуусаагүй ажлыг дууссан / эхэлсэн ажлыг эхлээгүй мэт харагдуулдаг байв. */
      const pv = act == null ? null : act > 0 && act < 1 ? Math.min(99, Math.max(1, Math.round(act * 100))) : Math.round(act * 100);
      const pc = pv != null ? ` · ${pv}%` : '';
      const full = `${iso(r.bar.start)} – ${iso(r.bar.end)} · ${d}${tr('х')}${pc}`;
      const cw = LAB_FS * 0.52;
      const fullW = full.length * cw;
      let txt = full;
      let lx = bx + 3;
      /* ⚠️ Хэсэгчилсэн дүүргэлттэй бол бичвэр цайвар хэсэгт ч орно — бараан */
      let color = !r.group && !partial && ST_DARK[r.st] ? '#ffffff' : C.ink;
      if (!half && bw > fullW + 8) {
        if (bw > fullW + 80) txt = `${fit(norm(r.work || r.no), bw - fullW - 18, LAB_FS)}   ${full}`;
      } else {
        color = C.ink2;
        if (bx + bw + 3 + fullW <= GW) lx = bx + bw + 3;
        else if (bx - 3 - fullW >= 0) lx = bx - 3 - fullW;
        else { txt = `${short(r.bar.start)} – ${short(r.bar.end)} · ${d}${tr('х')}${pc}`; lx = Math.max(0, bx - 3 - txt.length * cw); }
      }
      lab = {
        text: txt, fontSize: LAB_FS, color, bold: r.group,
        relativePosition: { x: lx, y: -ROW_H + (half ? 0.6 : (ROW_H - LAB_FS * 1.15) / 2) },
      };
    }
    /*
     * ӨВЛӨСӨН МУЖ — огноогүй дэд ажил: бүлгийн хугацаагаар ТАСАРХАЙ хүрээ,
     * дүүргэлтгүй. ⚠️ Өөрийн огноо биш гэдэг нь хэлбэрээр нь ялгарна —
     * бүтэн зурвас зурвал «энэ ажил яг энэ хугацаатай» гэж худал уншигдана.
     */
    const inhC = !r.bar && r.inh ? clip(ax, r.inh) : null;
    if (r.inh && inhC) {
      const bx = xOf(ax, inhC.start);
      const bw = wOf(ax, inhC);
      const by = ROW_H * 0.2;
      const bh = ROW_H * 0.56;
      cv.push({
        type: 'rect', x: bx, y: by, w: bw, h: bh, r: 1,
        color: C.plan, fillOpacity: 0.07, lineColor: C.plan, lineWidth: 0.7, dash: { length: 2.2, space: 1.6 },
      });
      const txt = `${iso(r.inh.start)} – ${iso(r.inh.end)} · ${tr('бүлгийн хугацаа')}`;
      const tw = txt.length * LAB_FS * 0.52;
      const lx = bw > tw + 8 ? bx + 3 : bx + bw + 3 + tw <= GW ? bx + bw + 3 : Math.max(0, bx - 3 - tw);
      lab = {
        text: txt, fontSize: LAB_FS, italics: true, color: C.ink3,
        relativePosition: { x: lx, y: -ROW_H + (ROW_H - LAB_FS * 1.15) / 2 },
      };
    }
    return [...left, { stack: lab ? [{ canvas: cv }, lab] : [{ canvas: cv }] }];
  };

  /*
   * БҮЛГҮҮДИЙГ ДАРААЛАН БАЙРЛУУЛНА — жижиг бүлгүүд нэг хуудсанд.
   * ⚠️ Хуудасны үлдэгдлийг ӨӨРӨӨ тооцож, гарчиг + толгой + 5 мөр багтахгүй
   *    бол бүлгийг шинэ хуудаснаас эхлүүлнэ — эс бөгөөс гарчиг хуудасны ёроолд
   *    ганцаараа үлдэж, хүснэгт нь дараагийн хуудсанд гарна. Мөрийн өндөр
   *    тогтмол (`heights`) тул тооцоо pdfmake-ийн бодит зохиомжтой таарна.
   * ⚠️ Урт бүлэг хуудас дамжвал хүснэгтийн толгой (тэнхлэг) давтагдана
   *    (`headerRows`).
   * ⚠️ ХУРААНГУЙ нь дангаараа 1-р хуудсанд (бүтэн PDF-д) — дараагийн бүлэг шинэ хуудаснаас.
   */
  const unit = ROW_H + ROW_LINE;
  const headH = HEAD_H + 1.4;
  let used = 0;
  sections.forEach((sec, si) => {
    const d0 = Math.min(...sec.rows.map((r) => r.depth));
    const n = sec.rows.length;
    const need = TITLE_H + headH + Math.min(n, 5) * unit;
    /* ⚠️ Хураангуй нь дангаараа 1-р хуудсанд ЗӨВХӨН бүтэн PDF-д — цонх/шүүлттэй
       үед хэдхэн мөр тул хуудас хоосон үлдэнэ. */
    const soloSummary = sections[si - 1]?.summary && !win && !opts.active;
    const breakBefore = si > 0 && (soloSummary || used + need > G.avail - 4);
    if (breakBefore) used = 0;
    /* Хуудас дамжсаны дараах `used`-ийг загварчилна.
       ⚠️ 2026-10-01: ХУУДАС БҮРИЙН мөрийн тоог (`chunks`) хадгална — хүснэгт бүр өөрийн
       сүлжээтэй тул бүлгийг ГАРААР хуудаслана (`gridOf`-ийн ⚠️). Загварчлал нь бодит
       зохиомжоос ИЛҮҮ өндөр тооцдог (гарчиг ~17pt < `TITLE_H`, `− 4` нөөц) тул хэсэг
       бүр хуудсандаа ЯГ багтана — pdfmake өөрөө дахин таслахгүй. */
    const chunks: number[] = [];
    let left = n;
    let y = used + TITLE_H + headH;
    while (left > 0) {
      const fit1 = Math.max(0, Math.floor((G.avail - 4 - y) / unit));
      if (left <= fit1) { chunks.push(left); y += left * unit; left = 0; } else {
        if (fit1 > 0) chunks.push(fit1);
        left -= fit1; y = headH;
      }
    }
    used = y + GAP;

    const ax = sec.axis;
    const range = `${iso(ax.from)} – ${iso(ax.from + (ax.days - 1) * DAY)} · ${scaleName[ax.scale]}`;
    content.push({
      ...(breakBefore ? { pageBreak: 'before' as const } : {}),
      columns: [
        { text: fit(sec.title, GW + 150, 10.5), bold: true, fontSize: 10.5, color: sec.summary ? C.overlap : C.ink, width: '*' },
        { text: range, fontSize: 8.5, color: C.ink2, alignment: 'right', width: 'auto', margin: [0, 1.5, 0, 0] },
      ],
      margin: [0, 0, 0, TITLE_H - 15],
    });
    /* ⚠️ 2026-10-01: хуудас бүрд ТУСДАА хүснэгт (толгой + сүлжээ + тэр хуудасны мөрүүд).
       Үргэлжлэлийн хүснэгт шинэ хуудаснаас — урьдын `headerRows` давталттай ИЖИЛ харагдана.
       `headerRows: 1` хэвээр: загварчлал алдвал (болох ёсгүй) толгой ч гэсэн давтагдана. */
    let at = 0;
    chunks.forEach((cnt, ci) => {
      const part = sec.rows.slice(at, at + cnt);
      at += cnt;
      const last = ci === chunks.length - 1;
      content.push({
        ...(ci > 0 ? { pageBreak: 'before' as const } : {}),
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [...cols.map((c) => c.w), GW],
          heights: (k: number) => (k === 0 ? HEAD_H : ROW_H),
          body: [headRow(ax, part.length), ...part.map((r) => bodyRow(r, ax, d0))],
        },
        layout: tableLayout,
        margin: [0, 0, 0, last ? GAP : 0],
      });
    });
  });
  if (!content.length) content.push({ text: tr('Хуваарьтай мөр алга.'), fontSize: 11, color: C.ink3 });

  /* ── Тайлбар (легенд) ── */
  const sw = (color: string, extra: Partial<CanvasElement> = {}): Column => ({
    canvas: [{ type: 'rect', x: 0, y: 1.5, w: 16, h: 7, r: 1, color, ...extra } as CanvasElement],
    width: 20,
  });
  const key = (c: Column, label: string): Column[] => [c, { text: label, width: 'auto', margin: [0, 0, 12, 0] }];
  const legend = () => ({
    columns: [
      ...key(sw(C.good), stText('done')),
      ...key(sw(C.data), stText('run')),
      ...key(sw(C.bad), stText('late')),
      /* ⚠️ «эхлээгүй» ба «хэмжигдээгүй» нэг өнгө (цэнхэр) — нэг тайлбар */
      ...key(sw(C.todo), tr('Төлөвлөсөн (эхлээгүй · хэмжигдээгүй)')),
      ...key(sw(C.plan, { color: C.plan, fillOpacity: 0.07, lineColor: C.plan, lineWidth: 0.7, dash: { length: 2.2, space: 1.6 } }), tr('Огноогүй — бүлгийн хугацаа')),
      ...key(sw(C.overlap, { fillOpacity: 0.16, lineColor: C.overlap, lineWidth: 0.7 }), tr('Бүлэг')),
      ...(x.refLabel ? key(sw(C.ink3, { fillOpacity: 0.28 }), x.refLabel) : []),
      ...(x.hasActual ? key(sw(C.data, { h: 1.8, y: 4.5 }), tr('Бодит')) : []),
      ...key({
        canvas: [{ type: 'line', x1: 8, y1: 0, x2: 8, y2: 10, lineWidth: 0.9, lineColor: C.bad, dash: { length: 2, space: 1.5 } }],
        width: 20,
      }, tr('Өнөөдөр')),
    ],
    columnGap: 2,
    fontSize: 8,
    color: C.ink2,
  });

  /* ⚠️ 2026-09-30: ХЭВЛЭСЭН ӨДӨР — ОРОН НУТГИЙН (`dayKey`), `iso` (UTC) БИШ. `iso` нь
     хуанлийн UTC-шөнө-дундын огноонд зориулагдсан; ЦАГТАЙ `Date.now()`-ийг UTC-ээр
     өдөр болгоход УБ-д 00:00–07:59-д хэвлэсэн PDF «өчигдөр» гэж гардаг байв
     (`format.dayKey`-ийн ⚠️ дүрэм). */
  const printed = dayKey(Date.now());
  const sub = [
    x.kindLabel,
    x.block,
    win ? tr('Ирэх {0} сар', opts.months) : '',
    opts.active ? tr('Зөвхөн хоцорсон ба явж буй') : '',
    all ? `${iso(all[0])} – ${iso(all[1])}` : '',
    tr('{0} мөр', num(dated.length)),
  ].filter(Boolean).join(' · ');

  return {
    pageSize: opts.paper,
    pageOrientation: 'landscape',
    pageMargins: [MARGIN, TOP, MARGIN, BOTTOM],
    info: { title: `${tr('Хуваарь')} — ${x.pkg}` },
    defaultStyle: { font: 'Roboto', fontSize: FS, color: C.ink },
    header: () => ({
      margin: [MARGIN, 14, MARGIN, 0],
      stack: [
        {
          columns: [
            { text: `${tr('Хуваарь')} — ${x.pkg}`, bold: true, fontSize: 13, width: 'auto' },
            { text: sub, fontSize: 9, color: C.ink3, margin: [12, 3, 0, 0], width: '*' },
          ],
        },
        { ...legend(), margin: [0, 8, 0, 0] } as Content,
      ],
    }),
    footer: (page: number, total: number) => ({
      margin: [MARGIN, 8, MARGIN, 0],
      columns: [
        { text: printed, fontSize: 8, color: C.ink3 },
        { text: tr('Хуудас {0} / {1}', page, total), fontSize: 8, color: C.ink3, alignment: 'right' },
      ],
    }),
    content,
  };
}

/** PDF-ийг үүсгээд татна */
export async function downloadHuvaariPdf(x: HvPdfInput, filename: string): Promise<void> {
  const b64 = await renderPdfBase64(buildHuvaariDoc(x));
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  download(filename, new Blob([bytes], { type: 'application/pdf' }));
}

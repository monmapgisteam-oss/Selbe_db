/**
 * ҮЛ НИЙЦЛИЙН АРИЛГАЛТ (HSE_Action) — ТАЙЛАН ТАТАХ (2026-11-02, хэрэглэгчийн хүсэлт).
 *
 * «Тайлан татах дээр action датаг татдаг болгоё — Excel болон PDF-ээр. PDF нь эхлээд НИЙТ нь, доор нь ТӨРЛӨӨР нь
 * чартаар, тэгээд бүх action-ыг дэлгэрэнгүй жагсаалтаар. Багц болон огноо (сүүлийн 7 хоног, сүүлийн сар, огноо
 * сонгох)-оор шүүж татна.»
 *
 *   PDF   — 1) Нийт: ажлын тоо · дууссан % · нээлттэй · хугацаа хэтэрсэн · ноцтой / бага зэргийн
 *           2) Төрлөөр (хэвтээ баганан чарт): төлөв · зэрэг · багц · хэсэг · асуумж
 *           3) Дэлгэрэнгүй — ажил бүр нэг блок (огноо · багц · компани · асуулт · зэрэг · төлөв · хариуцагч ·
 *              дуусах хугацаа · тайлбар · хянагчийн шийдвэр)
 *   Excel — «Тойм» (нийт + төрлөөр хүснэгтүүд) ба «Action» (бүх мөр, шүүлттэй толгой)
 *
 * ⚠️ Талбарын нэрс амьд метадатаас (`HSE_Action/FeatureServer/2`, 2026-10-26); төлөвийн код → нэр нь `esritask_status`
 *    домэйн (0–5) ЯГ. Асуултын текст Survey123-ын HTML-тэй («<b>8.</b> …») — `cleanLabel`-ээр цэвэрлэнэ.
 * ⚠️ `null ≠ 0`: огноо/төлөв хоосон бол «—», тоололд «тодорхойгүй» гэж тусад нь.
 */
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { arcgisPost, queryFeatures, type Row } from '@/lib/query';
import { HABEA } from '@/lib/services';
import {
  cleanLabel, fmtDate, fmtDateTime, guidKey, loadUzAttachments, attUrl, uzPhotoRef, type UzPhotoRef, type UzImg,
} from '@/lib/uzlegReport';
import { buildXlsx, type XlsxCell, type XlsxPic, type XlsxSheet } from '@/lib/xlsx';

/** `esritask_status` домэйн — нэр ба өнгө (ажлын урсгалын дараалал) */
export const ACTION_STATUS: { code: number; label: string; color: string }[] = [
  { code: 0, label: 'Хуваарилаагүй', color: '#94a3b8' },
  { code: 1, label: 'Хуваарилсан', color: '#f59e0b' },
  { code: 2, label: 'Гүйцэтгэж байна', color: '#3b82f6' },
  { code: 4, label: 'Шалгуулах', color: '#8b5cf6' },
  { code: 5, label: 'Засвар шаардлагатай', color: '#dc2626' },
  { code: 3, label: 'Дууссан', color: '#16a34a' },
];
const DONE = 3;
const statusOf = (c: number | null) => ACTION_STATUS.find((s) => s.code === c) ?? null;
const DECISION: Record<number, string> = { 3: 'Дууссан', 5: 'Засвар шаардлагатай' };

export type ActionItem = {
  oid: number;
  /** Үзлэгийн огноо (epoch ms) — байхгүй бол 0 */
  d: number;
  survey: string;
  site: string;
  company: string;
  inspector: string;
  area: string;
  section: string;
  question: string;
  /** 'major' | 'minor' | '' */
  sevCode: string;
  severity: string;
  status: number | null;
  assignee: string;
  due: number | null;
  comment: string;
  fixNote: string;
  decision: number | null;
  reviewComment: string;
  reviewBy: string;
  photos: number | null;
  /** Асуултын код (`q_code`, ж: «d02») ба эх үзлэгийн GlobalID — зургийг эх маягтаас олоход (2026-11-03) */
  qCode: string;
  srcGid: string;
};

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const numN = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const FIELDS = [
  'objectid', 'insp_datetime', 'survey', 'site', 'company', 'inspector', 'site_area', 'section', 'question',
  'severity_code', 'severity', 'esritask_status', 'esritask_assignee', 'esritask_duedate', 'comment',
  'үл_нийцэл_арилгасан_тайлбар', 'review_decision', 'review_comment', 'review_by', 'photo_count',
  'q_code', 'src_globalid',
];

export const toActionItem = (r: Row): ActionItem => ({
  oid: Number(r.objectid ?? 0),
  d: numN(r.insp_datetime) ?? 0,
  survey: str(r.survey),
  site: str(r.site),
  company: str(r.company),
  inspector: str(r.inspector),
  area: str(r.site_area),
  section: str(r.section),
  question: cleanLabel(str(r.question)),
  sevCode: str(r.severity_code),
  severity: str(r.severity),
  status: numN(r.esritask_status),
  assignee: str(r.esritask_assignee),
  due: numN(r.esritask_duedate),
  comment: str(r.comment),
  fixNote: str(r['үл_нийцэл_арилгасан_тайлбар']),
  decision: numN(r.review_decision),
  reviewComment: str(r.review_comment),
  reviewBy: str(r.review_by),
  photos: numN(r.photo_count),
  qCode: str(r.q_code),
  srcGid: str(r.src_globalid),
});

/** Бүх ажил — шинэ нь эхэнд. ⚠️ Дуудагч нэвтрэлтийг шалгана (`UzlegExport`). */
export async function loadActionItems(signal?: AbortSignal): Promise<ActionItem[]> {
  const rows = await queryFeatures(HABEA.action.url, { where: '1=1', outFields: FIELDS, orderBy: 'objectid', signal });
  return rows.map(toActionItem).sort((a, b) => b.d - a.d || b.oid - a.oid);
}

/* ═════════════════ Зураг (2026-11-03) ═════════════════ */

/** Хавсралтын түлхүүр үг асуултын кодтой таарах эсэх — «d02» ↔ «d02_photo» / «photo_d02» (харин «d021» БИШ) */
const kwMatches = (kw: string, q: string): boolean => {
  if (!kw || !q) return false;
  const e = q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${e}([^0-9]|$)`, 'i').test(kw.toLowerCase());
};

/** Үзлэгийн маягтуудын давхарга — нэр нь асуумжтай таарсныг эхэнд */
function sourceLayers(survey: string): string[] {
  const norm = (t: string) => t.toLowerCase().replace(/^хабэабо-(?:н|ны)\s+/, '').replace(/\s+\d{4}$/, '').replace(/\s+/g, ' ').trim();
  const sv = norm(survey);
  const forms = Object.values(HABEA.uzleg as Record<string, unknown>)
    .filter((v): v is { title: string; url: string } =>
      !!v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string' && typeof (v as { title?: unknown }).title === 'string');
  const hit = (t: string) => { const n = norm(t); return !!sv && !!n && (sv.startsWith(n) || n.startsWith(sv)); };
  return [...forms.filter((f) => hit(f.title)), ...forms.filter((f) => !hit(f.title))].map((f) => f.url);
}

/** Эх үзлэгийн GlobalID → objectid (нэг давхаргаас) */
async function oidsByGid(url: string, gids: string[], signal?: AbortSignal): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < gids.length; i += 100) {
    if (signal?.aborted) break;
    const chunk = gids.slice(i, i + 100);
    try {
      const j = await arcgisPost<{ features?: { attributes?: Row }[] }>(`${url}/query`, {
        f: 'json',
        where: `globalid IN (${chunk.map((g) => `'{${g}}'`).join(',')})`,
        outFields: 'objectid,globalid',
        returnGeometry: 'false',
      }, { token: 'org' });
      for (const ft of j.features ?? []) {
        const oid = Number(ft.attributes?.objectid);
        const g = guidKey(ft.attributes?.globalid);
        if (g && Number.isFinite(oid)) out.set(g, oid);
      }
    } catch { /* энэ давхаргад байхгүй / эрхгүй — дараагийнх */ }
  }
  return out;
}

/**
 * Ажил бүрийн ЗУРАГ (лавлагаа) — `objectid` → зургууд.
 *   1) HSE_Action-ий ӨӨРИЙН хавсралт (арилгасны зураг г.м.)
 *   2) Эх үзлэгийн хавсралт (`src_globalid` → эх маягтын мөр), түлхүүр үг нь асуултын кодтой (`q_code`) таарсан нь.
 * Эх маягтыг асуумжийн нэрээр эхэлж оролдоно; олдохгүй бол бусад маягтаас хайна. Алдаа гарвал зураггүй үлдэнэ.
 */
export async function loadActionPhotos(items: readonly ActionItem[], signal?: AbortSignal): Promise<Map<number, UzPhotoRef[]>> {
  const out = new Map<number, UzPhotoRef[]>();
  const push = (oid: number, refs: UzPhotoRef[]) => { if (refs.length) out.set(oid, [...(out.get(oid) ?? []), ...refs]); };
  const A = HABEA.action.url;
  try {
    const own = await loadUzAttachments(A, items.map((x) => x.oid).filter((o) => o > 0));
    for (const [oid, atts] of own) push(oid, atts.filter((a) => a.contentType.startsWith('image/')).map((a) => uzPhotoRef(a, attUrl(A, oid, a.id))));
  } catch { /* HSE_Action-д хавсралт идэвхгүй байж болно */ }

  /* Эх үзлэг — асуумжаар бүлэглэнэ */
  const bySurvey = new Map<string, ActionItem[]>();
  for (const x of items) {
    if (!x.srcGid || !x.qCode) continue;
    bySurvey.set(x.survey, [...(bySurvey.get(x.survey) ?? []), x]);
  }
  for (const [survey, group] of bySurvey) {
    if (signal?.aborted) break;
    let left = [...new Set(group.map((x) => guidKey(x.srcGid)))];
    for (const url of sourceLayers(survey)) {
      if (!left.length || signal?.aborted) break;
      const map = await oidsByGid(url, left, signal);
      if (!map.size) continue;
      left = left.filter((g) => !map.has(g));
      let atts: Map<number, { id: number; keywords: string; contentType: string }[]>;
      try { atts = await loadUzAttachments(url, [...new Set(map.values())]); } catch { continue; }
      for (const x of group) {
        const so = map.get(guidKey(x.srcGid));
        if (so == null) continue;
        push(x.oid, (atts.get(so) ?? [])
          .filter((a) => a.contentType.startsWith('image/') && kwMatches(a.keywords, x.qCode))
          .map((a) => uzPhotoRef(a, attUrl(url, so, a.id))));
      }
    }
  }
  return out;
}

/* ═════════════════ Нэгтгэл ═════════════════ */

export type ActionSummary = {
  total: number; done: number; open: number; overdue: number; unknown: number; major: number; minor: number;
};
export function summarize(items: readonly ActionItem[], now: number): ActionSummary {
  let done = 0; let open = 0; let overdue = 0; let unknown = 0; let major = 0; let minor = 0;
  for (const x of items) {
    if (x.status == null) unknown += 1;
    else if (x.status === DONE) done += 1;
    else { open += 1; if (x.due != null && x.due < now) overdue += 1; }
    if (x.sevCode === 'major') major += 1; else if (x.sevCode === 'minor') minor += 1;
  }
  return { total: items.length, done, open, overdue, unknown, major, minor };
}

export type Bucket = { label: string; value: number; color?: string };
/** Түлхүүрээр тоолж ихээс бага руу; хоосныг `none` нэрээр */
export function countBy(items: readonly ActionItem[], of: (x: ActionItem) => string, none: string): Bucket[] {
  const m = new Map<string, number>();
  for (const x of items) { const k = of(x) || none; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'mn'));
}
export function byStatus(items: readonly ActionItem[]): Bucket[] {
  const out: Bucket[] = ACTION_STATUS
    .map((s) => ({ label: s.label, value: items.filter((x) => x.status === s.code).length, color: s.color }))
    .filter((b) => b.value > 0);
  const unk = items.filter((x) => x.status == null).length;
  if (unk) out.push({ label: 'Төлөв тодорхойгүй', value: unk, color: '#cbd5e1' });
  return out;
}
export function bySeverity(items: readonly ActionItem[]): Bucket[] {
  return [
    { label: 'Ноцтой үл нийцэл', value: items.filter((x) => x.sevCode === 'major').length, color: '#d62839' },
    { label: 'Бага зэргийн үл нийцэл', value: items.filter((x) => x.sevCode === 'minor').length, color: '#ff7f0e' },
  ].filter((b) => b.value > 0);
}

export type ActionReportMeta = {
  /** «2026-10-03 – 2026-11-02» эсвэл «Бүх хугацаа» */
  period: string;
  /** Сонгосон багцууд — хоосон = бүгд */
  pkgs: string[];
  now: number;
};

/* ═════════════════ PDF ═════════════════ */

const INK = '#1f2a44';
const MUTED = '#6b7280';
const BAND = '#e8edf5';
const LINE = '#d7dce6';
const BAR_W = 230;
type Obj = Record<string, unknown>;

const pctTxt = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '—');

/** Хэвтээ баганан чарт — нэр · зурвас · тоо (хувь) */
function barChart(title: string, buckets: Bucket[], total: number, color = '#3b82f6'): Obj {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const body = buckets.map((b) => [
    { text: b.label, fontSize: 8.5, margin: [0, 2, 6, 2] },
    { canvas: [
      { type: 'rect', x: 0, y: 3, w: BAR_W, h: 9, r: 2, color: '#eef1f6' },
      { type: 'rect', x: 0, y: 3, w: Math.max(2, (b.value / max) * BAR_W), h: 9, r: 2, color: b.color ?? color },
    ] },
    { text: `${b.value}  (${pctTxt(b.value, total)})`, fontSize: 8.5, alignment: 'right', margin: [0, 2, 0, 2] },
  ]);
  return {
    unbreakable: buckets.length <= 14,
    stack: [
      { text: title, bold: true, fontSize: 10.5, color: INK, margin: [0, 10, 0, 4] },
      body.length
        ? { table: { widths: [150, BAR_W, '*'], body }, layout: 'noBorders' }
        : { text: 'Бүртгэл алга', fontSize: 9, color: MUTED },
    ],
  };
}

const badge = (text: string, bg: string, fg = '#ffffff'): Obj => ({
  table: { body: [[{ text, fontSize: 8, bold: true, color: fg, fillColor: bg, margin: [5, 2, 5, 2] }]] },
  layout: 'noBorders',
});

function itemBlock(x: ActionItem, i: number, now: number): Obj {
  const st = statusOf(x.status);
  const overdue = x.status != null && x.status !== DONE && x.due != null && x.due < now;
  const sevBg = x.sevCode === 'major' ? '#d62839' : x.sevCode === 'minor' ? '#ff7f0e' : '#9aa3b2';
  const kv = (k: string, v: string): Obj | null => (v ? { text: [{ text: `${k}: `, color: MUTED }, v], fontSize: 8.5, margin: [0, 1, 0, 1] } : null);
  const left = [
    kv('Багц', x.site),
    kv('Компани', x.company),
    kv('Талбай', x.area),
    kv('Хэсэг', x.section),
    kv('Шалгагч', x.inspector),
  ].filter(Boolean) as Obj[];
  const right = [
    kv('Хариуцагч', x.assignee),
    kv('Дуусах хугацаа', x.due != null ? `${fmtDate(x.due)}${overdue ? '  (хугацаа хэтэрсэн)' : ''}` : ''),
    kv('Асуумж', x.survey),
    kv('Зураг', x.photos != null ? String(x.photos) : ''),
    kv('Хянагчийн шийдвэр', x.decision != null ? (DECISION[x.decision] ?? String(x.decision)) : ''),
  ].filter(Boolean) as Obj[];
  const notes = [
    kv('Тайлбар, авах арга хэмжээ', x.comment),
    kv('Үл нийцэл арилгасан тайлбар', x.fixNote),
    kv(`Хянагчийн тайлбар${x.reviewBy ? ` (${x.reviewBy})` : ''}`, x.reviewComment),
  ].filter(Boolean) as Obj[];
  return {
    unbreakable: true,
    stack: [
      {
        columns: [
          { text: [{ text: `${i}. `, color: MUTED }, { text: x.d > 0 ? fmtDateTime(x.d) : 'огноогүй', bold: true }], fontSize: 9, width: '*', margin: [0, 3, 0, 0] },
          { width: 'auto', ...badge(x.severity || '—', sevBg) },
          { width: 'auto', ...badge(st?.label ?? 'Төлөв тодорхойгүй', st?.color ?? '#cbd5e1', st ? '#ffffff' : INK) },
        ],
        columnGap: 6,
      },
      { text: x.question || '—', bold: true, fontSize: 9.5, color: INK, margin: [0, 4, 0, 4] },
      { columns: [{ stack: left, width: '*' }, { stack: right, width: '*' }], columnGap: 12 },
      ...(notes.length ? [{ stack: notes, margin: [0, 3, 0, 0] }] : []),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: LINE }], margin: [0, 7, 0, 7] },
    ],
  };
}

export function buildActionPdf(items: readonly ActionItem[], meta: ActionReportMeta, logo: string | null): TDocumentDefinitions {
  const s = summarize(items, meta.now);
  const tile = (label: string, value: string, color = INK): Obj => ({
    stack: [
      { text: value, fontSize: 16, bold: true, color, alignment: 'center' },
      { text: label, fontSize: 8, color: MUTED, alignment: 'center', margin: [0, 2, 0, 0] },
    ],
    fillColor: BAND,
    margin: [4, 8, 4, 8],
  });
  const content: Obj[] = [
    ...(logo ? [{ svg: logo, width: 150, margin: [0, 0, 0, 10] }] : []),
    { text: 'HSE Non-Compliance Report', fontSize: 18, bold: true, color: INK, margin: [0, 4, 0, 4] },
    { text: `Хугацаа: ${meta.period}   ·   Багц: ${meta.pkgs.length ? meta.pkgs.join(', ') : 'Бүх багц'}`, fontSize: 9.5, color: MUTED, margin: [0, 0, 0, 2] },
    { text: `Татсан: ${fmtDateTime(meta.now)}`, fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 10] },
    /* 1. НИЙТ */
    { text: 'Нийт', bold: true, fontSize: 12, color: INK, margin: [0, 0, 0, 6] },
    {
      table: {
        widths: ['*', '*', '*'],
        body: [
          [tile('Нийт үл нийцэл', String(s.total)), tile('Дууссан', `${s.done} (${pctTxt(s.done, s.total)})`, '#16a34a'),
            tile('Нээлттэй', String(s.open), '#f59e0b')],
          [tile('Хугацаа хэтэрсэн', String(s.overdue), s.overdue ? '#d62839' : INK),
            tile('Ноцтой үл нийцэл', String(s.major), '#d62839'), tile('Бага зэргийн үл нийцэл', String(s.minor), '#ff7f0e')],
        ],
      },
      layout: { hLineWidth: () => 3, vLineWidth: () => 3, hLineColor: () => '#ffffff', vLineColor: () => '#ffffff' },
    },
    /* 2. ТӨРЛӨӨР — чарт */
    { text: 'Төрлөөр', bold: true, fontSize: 12, color: INK, margin: [0, 14, 0, 0] },
    barChart('Төлөвөөр', byStatus(items), s.total),
    barChart('Үл нийцлийн зэргээр', bySeverity(items), s.total),
    barChart('Багцаар', countBy(items, (x) => x.site, 'Багц заагаагүй'), s.total, '#2563eb'),
    barChart('Асуумжаар', countBy(items, (x) => x.survey, 'Асуумж заагаагүй'), s.total, '#7c3aed'),
    barChart('Хариуцагчаар', countBy(items, (x) => x.assignee, 'Хуваарилаагүй'), s.total, '#64748b'),
    /* 3. ДЭЛГЭРЭНГҮЙ */
    { text: `Дэлгэрэнгүй жагсаалт (${items.length})`, bold: true, fontSize: 12, color: INK, pageBreak: 'before', margin: [0, 0, 0, 8] },
    ...(items.length ? items.map((x, i) => itemBlock(x, i + 1, meta.now)) : [{ text: 'Сонгосон шүүлтэд ажил алга', fontSize: 9.5, color: MUTED }]),
  ];
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: INK },
    info: { title: `HSE Non-Compliance Report — ${meta.period}` },
    footer: (page: number, pages: number) => ({
      text: `HSE Non-Compliance Report  |  ${meta.period}  |  Хуудас ${page} / ${pages}`,
      alignment: 'right', fontSize: 7, color: MUTED, margin: [40, 18, 40, 0],
    }),
    content: content as unknown as Content[],
  };
}

/* ═════════════════ Excel ═════════════════ */

/** Excel-ийн зургийн мөрийн өндөр (pt) ба зургийн баганын өргөн */
const PHOTO_ROW_PT = 120;
const PHOTO_COL_W = 30;

/**
 * Excel — ЗӨВХӨН «Action» хуудас (2026-11-03, хэрэглэгч: «Тойм хэрэггүй, Action sheet л — гол нь зураг нь хамт»).
 * Ажил бүрийн зургийг мөрийнх нь баруун талд («Зураг 1», «Зураг 2» …) шигтгэнэ.
 * @param photos — `loadActionPhotos`; @param img — `loadPhotoImages(…, { mode: 'xlsx' })`
 */
export function buildActionXlsx(
  items: readonly ActionItem[],
  meta: ActionReportMeta,
  photos: ReadonlyMap<number, UzPhotoRef[]> = new Map(),
  img: ReadonlyMap<string, UzImg> = new Map(),
): Uint8Array {
  const H = { bold: true, fill: 'E8EDF5', border: true } as const;
  const COLS = ['№', 'Огноо', 'Асуумж', 'Багц', 'Компани', 'Шалгагч', 'Талбай', 'Хэсэг', 'Асуулт', 'Зэрэг', 'Төлөв',
    'Хариуцагч', 'Дуусах хугацаа', 'Хугацаа хэтэрсэн', 'Тайлбар, авах арга хэмжээ', 'Үл нийцэл арилгасан тайлбар',
    'Хянагчийн шийдвэр', 'Хянагчийн тайлбар', 'Хянасан', 'Зураг'];
  /* Ажил бүрийн шигтгэх зураг (татагдсан нь л) */
  const pics: XlsxPic[] = [];
  const heights: Record<number, number> = {};
  const got = items.map((x) => (photos.get(x.oid) ?? [])
    .map((p) => img.get(p.url))
    .filter((m): m is UzImg & { bytes: Uint8Array } => !!m?.bytes));
  const maxPh = Math.max(0, ...got.map((g) => g.length));
  const list: XlsxCell[][] = [[...COLS, ...Array.from({ length: maxPh }, (_, k) => `Зураг ${k + 1}`)]
    .map((c) => ({ v: c, s: { ...H, wrap: true, valign: 'center' } }))];
  items.forEach((x, i) => {
    const over = x.status != null && x.status !== DONE && x.due != null && x.due < meta.now;
    const row = list.length;
    got[i].forEach((m, k) => pics.push({ row, col: COLS.length + k, bytes: m.bytes, png: m.png, w: m.w, h: m.h, hPt: PHOTO_ROW_PT - 6 }));
    if (got[i].length) heights[row] = PHOTO_ROW_PT;
    list.push([
      i + 1, x.d > 0 ? fmtDateTime(x.d) : null, x.survey, x.site, x.company, x.inspector, x.area, x.section,
      { v: x.question, s: { wrap: true, valign: 'top' } },
      { v: x.severity || null, s: x.sevCode === 'major' ? { color: 'D62839', bold: true } : undefined },
      statusOf(x.status)?.label ?? null, x.assignee, x.due != null ? fmtDate(x.due) : null,
      over ? { v: 'Тийм', s: { color: 'D62839', bold: true } } : null,
      { v: x.comment || null, s: { wrap: true, valign: 'top' } },
      { v: x.fixNote || null, s: { wrap: true, valign: 'top' } },
      x.decision != null ? (DECISION[x.decision] ?? String(x.decision)) : null,
      { v: x.reviewComment || null, s: { wrap: true, valign: 'top' } },
      x.reviewBy, got[i].length || x.photos,
    ]);
  });
  const detail: XlsxSheet = {
    name: 'Action',
    rows: list,
    cols: [5, 17, 26, 11, 28, 26, 18, 20, 60, 20, 18, 18, 13, 10, 40, 34, 16, 34, 18, 7, ...Array.from({ length: maxPh }, () => PHOTO_COL_W)],
    frozen: { rows: 1, cols: 0 },
    heights,
    pics,
  };
  return buildXlsx([detail]);
}

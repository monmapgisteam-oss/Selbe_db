/**
 * АЖЛЫН БАЙРНЫ ҮЗЛЭГИЙН ТАЙЛАН — PDF (iAuditor маягийн) ба Excel (2026-10-06).
 *
 * Хэрэглэгчийн хүсэлт: «2026-09-29 Морин сувд.pdf шиг үзлэгийн тайлан татдаг товч —
 * асуумж · хугацаа · компани сонгоод, нэгийг PDF-ээр, олныг Excel-ээр». Excel нь
 * `…\03. HSE Inspection Data\Экспорт\Морин_сувд_2026-09-29\Морин сувд - Захиалагчийн
 * үзлэг 2026-09-29.xlsx`-ийн ЯГ бүтэцтэй:
 *   · «Хүснэгт» — нэг мөр = нэг үзлэг; асуулт бүр 4 багана (`g01 …`, `g01 блок`,
 *     `g01 тайлбар`, `g01 зураг` = зургийн тоо), дараа нь дүн, оноо, гарын үсэг,
 *     «Илгээсэн хэрэглэгч», «Илгээсэн огноо».
 *   · «ObjectID N» — үзлэг бүр тусдаа хуудас: Ерөнхий мэдээлэл → хэсгүүд (G01…) →
 *     Дүн / Summary → Баталгаажуулах хэсэг; хариулт өнгөтэй, зураг НҮДЭНД шигтгэсэн.
 *
 * ⚠️ СХЕМ ХАТУУ БИЧИГДЭЭГҮЙ — АЖИЛЛАХ ҮЕД ТАНИНА (маягтууд нэргүй хандалтад хаалттай
 *    тул хөгжүүлэлтийн үед талбарыг шалгах боломжгүй байв):
 *      · АСУУЛТ  = «Нийцсэн / Conformance …» хариулттай codedValue домэйнтэй талбар
 *                  (`g01`, `d02` …); текст нь alias, дараалал нь талбарын дараалал.
 *      · ДАГАЛДАХ = асуултын нэрээр эхэлсэн талбар (`g01_blk` → блок, бусад текст →
 *                  тайлбар); зураг = хавсралтын `keywords` асуултын нэрээр эхэлбэл.
 *      · ТОЛГОЙ  = эхний асуултаас ӨМНӨХ талбарууд; ГАРЫН ҮСЭГ = сүүлийн асуултаас
 *                  ХОЙШИХ (дүн/онооноос бусад) талбарууд — Survey123 маягтын дарааллаар.
 *      · ХЭСЭГ   = асуултын угтвар (`g`, `d`, `c` …); нэр ба оноо нь `sc_*_earned/appl`
 *                  талбаруудаас ДАРААЛЛААР (alias «1. Барилгын гадаа …: авсан оноо»).
 *    Нэрлэлт өөр байвал тайлан ЭВДРЭХГҮЙ — асуултууд нэг хэсэгт дарааллаараа гарна.
 *
 * ⚠️ ТАЙЛАНГИЙН ТЕКСТ МОНГОЛООР, `tr()`-ГҮЙ — албан маягт (`ipcPdf.ts`-ийн ижил дүрэм).
 * ⚠️ `null ≠ 0`: бөглөөгүй оноо «—», 0 гэж бичихгүй.
 */
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { arcgisPost, type Row } from '@/lib/query';
import { authToken, ensureFreshToken, refreshAfterTokenError } from '@/lib/authToken';

/* ═════════════════ Метадата ═════════════════ */

export type UzField = {
  name: string;
  alias: string;
  type: string;
  /** codedValue домэйн — код → нэр */
  dom: Map<string, string> | null;
};

/** Хариултын ангилал — өнгө ба тоололтод */
export type AnsCls = 'conf' | 'obs' | 'minor' | 'major' | 'na' | 'other';

type RawMeta = {
  fields?: {
    name?: string; alias?: string; type?: string;
    domain?: { type?: string; codedValues?: { code?: unknown; name?: string }[] } | null;
  }[];
};

const metaCache = new Map<string, Promise<UzField[]>>();

/** Давхаргын талбарууд (alias, домэйнтэй). ⚠️ Алдаа кэшлэгдэхгүй. */
export function loadUzFields(url: string): Promise<UzField[]> {
  let p = metaCache.get(url);
  if (!p) {
    p = arcgisPost<RawMeta>(url, { f: 'json' }, { timeoutMs: 30_000 }).then((j) => (j.fields ?? [])
      .filter((f) => f.name)
      .map((f) => ({
        name: String(f.name),
        alias: String(f.alias || f.name),
        type: String(f.type ?? ''),
        dom: f.domain?.type === 'codedValue' && f.domain.codedValues?.length
          ? new Map(f.domain.codedValues.map((c) => [String(c.code), String(c.name ?? c.code)]))
          : null,
      })));
    p.catch(() => metaCache.delete(url));
    metaCache.set(url, p);
  }
  return p;
}

/**
 * Хариултыг ангилна. ⚠️ ДАРААЛАЛ ЧУХАЛ: «Minor Non-Conformance» нь «conform»-ыг
 * агуулдаг тул ноцтой/бага/ажиглалтыг НИЙЦСЭНЭЭС өмнө шалгана.
 */
export function ansCls(code: unknown, label: unknown): AnsCls {
  const t = `${String(code ?? '')} ${String(label ?? '')}`.toLowerCase();
  if (/major|ноцтой/.test(t)) return 'major';
  if (/minor|бага зэрг/.test(t)) return 'minor';
  if (/observ|ажиглалт/.test(t)) return 'obs';
  if (/\bn\/?a\b|хамааралгүй|not applicable/.test(t)) return 'na';
  if (/conform|нийцсэн/.test(t)) return 'conf';
  return 'other';
}

/** Үзлэгийн хариултын домэйн мөн эсэх — нийцсэн + өөр нэг ангилал агуулна */
const isAnswerDomain = (dom: Map<string, string> | null): boolean => {
  if (!dom || dom.size < 3) return false;
  const cls = new Set([...dom.entries()].map(([c, n]) => ansCls(c, n)));
  return cls.has('conf') && (cls.has('minor') || cls.has('major') || cls.has('na'));
};

const SYSTEM_RE = /^(objectid|fid|globalid|creationdate|creator|editdate|editor|shape(__|_).*|shape)$/i;
const SUMMARY_RE = /^(cnt|sc)_/i;
const BLK_RE = /_blk$|_block$/i;
const NUM_RE = /double|integer|single|small/i;

/** Асуултын нэрийн угтвар — хэсэглэхэд (`g01` → `g`, `out_01` → `out`) */
const stemOf = (name: string) => name.replace(/_?\d+[a-z]?$/i, '').replace(/_+$/, '') || name;

/** «1. Барилгын гадаа …: авсан оноо» → «1. Барилгын гадаа …» */
const cleanScoreAlias = (s: string) => s.replace(/\s*[:：—-]?\s*(авсан|боломжит)\s*оноо.*$/i, '').trim();

/* ═════════════════ Тайлангийн загвар ═════════════════ */

/** ⚠️ 2026-10-09: `heic` — хавсралтын төрөл image/heic|heif (хөтөч ихэвчлэн задалж чаддаггүй) */
export type UzPhotoRef = { url: string; png: boolean; heic?: boolean };

export type UzItem = {
  /** Талбарын нэр (`g01`) — Excel-ийн «№» (`G01`) ба багануудын угтвар */
  code: string;
  q: string;
  ans: string;
  cls: AnsCls;
  block: string | null;
  notes: string[];
  photos: UzPhotoRef[];
  section: string;
};

export type UzSection = { key: string; title: string; score: { e: number; a: number } | null; items: UzItem[] };

/** Гарын үсгийн хэсгийн мөр — талбар (нэр, албан тушаал, огноо) эсвэл гарын үсгийн зураг */
export type UzSigRow = { label: string; value: string; photos: UzPhotoRef[] };

export type UzReport = {
  oid: number;
  form: string;
  /** «Захиалагчийн үзлэг» — Excel-ийн хуудасны гарчиг, файлын нэр */
  formShort: string;
  date: number;
  pkg: string;
  company: string;
  score: { e: number; a: number } | null;
  /** ⚠️ 2026-10-09: `null` = мэдэгдэхгүй (`cnt_*` талбаргүй БА асуулт танигдаагүй) — 0 БИШ */
  counts: Record<'major' | 'minor' | 'obs' | 'conf' | 'na', number | null>;
  header: [string, string][];
  sections: UzSection[];
  /** «Дүн / Summary» — `cnt_*` ба `sc_*` талбарууд дарааллаараа */
  summary: { label: string; value: number | null }[];
  signatures: UzSigRow[];
  extraPhotos: UzPhotoRef[];
  submitter: string;
  submitted: number;
};

export type UzAttachment = { id: number; keywords: string; contentType: string };

const two = (n: number) => String(n).padStart(2, '0');
/** Улаанбаатарын цагийн бүс (UTC+8, зуны цаггүй) — `ceo/workforce.ubDayKey`-ийн дүрэм */
const UB_OFFSET_MS = 8 * 3_600_000;
/**
 * ⚠️ 2026-10-09: УЛААНБААТАРЫН цагаар — урьд нь хөтчийн локал цагаар (`getHours`) тул
 *    гадаадаас (эсвэл UTC-тэй машинаас) татахад тайлангийн огноо/өдрийн хил гулсдаг байв
 *    (UB 00:00–07:59-ийн үзлэг өмнөх өдөрт). Хуудасны `ubDayKey`/`uzWeekKey`-тэй НЭГ.
 */
export const fmtDateTime = (ms: number): string => {
  const d = new Date(ms + UB_OFFSET_MS);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};
export const fmtDate = (ms: number): string => fmtDateTime(ms).slice(0, 10);

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Талбарын утгыг хүнд уншигдахаар — домэйн нэр, огноо, «Бусад» → `<нэр>_other` */
function fieldText(f: UzField, r: Row, byName: Map<string, UzField>): string {
  const v = r[f.name];
  if (v == null || v === '') return '';
  if (/date/i.test(f.type) && typeof v === 'number') return fmtDateTime(v);
  const raw = String(v);
  const parts = f.dom && raw.includes(',') ? raw.split(',') : [raw];
  return parts.map((code) => {
    const c = code.trim();
    if (c === 'other' && byName.has(`${f.name}_other`)) {
      const o = r[`${f.name}_other`];
      if (o != null && o !== '') return String(o);
    }
    return f.dom?.get(c) ?? c;
  }).join(', ');
}

/** Хоёр мөрийн нийтлэг угтварын урт (жижиг үсгээр) */
const prefixLen = (a: string, b: string) => {
  const x = a.toLowerCase(); const y = b.toLowerCase();
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i += 1;
  return i;
};

/**
 * Нэг мөр + хавсралтаас тайлангийн загвар угсарна (цэвэр функц — тестлэгдэнэ).
 * @param meta — `{ pkg, company, date }`: хуудасны хэвийн болголтоос (`UzlegRow`);
 *               `location` — «47.966205, 106.914493» (геометрээс, байхгүй бол хоосон)
 */
export function buildUzReport(
  form: string,
  fields: UzField[],
  r: Row,
  oid: number,
  atts: UzAttachment[],
  photoUrl: (attId: number) => string,
  meta: { pkg: string; company: string; date: number; formShort?: string; location?: string },
): UzReport {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const answers = fields.filter((f) => isAnswerDomain(f.dom));
  const answerNames = new Set(answers.map((f) => f.name));
  /* Асуултад хамаарах талбарууд — асуултын нэрээр эхэлсэн (хамгийн урт таарлыг сонгоно) */
  const ownerOf = (name: string): string | null => {
    let best: string | null = null;
    for (const a of answers) {
      if (name !== a.name && name.startsWith(`${a.name}_`) && (!best || a.name.length > best.length)) best = a.name;
    }
    return best;
  };
  const related = new Map<string, UzField[]>();
  for (const f of fields) {
    if (answerNames.has(f.name)) continue;
    const o = ownerOf(f.name);
    if (o) related.set(o, [...(related.get(o) ?? []), f]);
  }
  const relatedNames = new Set([...related.values()].flat().map((f) => f.name));
  const idx = new Map(fields.map((f, i) => [f.name, i]));
  const firstQ = answers.length ? Math.min(...answers.map((f) => idx.get(f.name) ?? 0)) : fields.length;
  const lastQ = answers.length
    ? Math.max(...[...answers, ...[...related.values()].flat()].map((f) => idx.get(f.name) ?? 0))
    : -1;

  /* Хавсралт → асуулт; таарахгүйг дараа нь гарын үсэг/бусад руу */
  const qPhotos = new Map<string, UzPhotoRef[]>();
  const loose = new Map<string, UzPhotoRef[]>();
  for (const a of atts) {
    if (!a.contentType.startsWith('image/')) continue;
    const ref: UzPhotoRef = { url: photoUrl(a.id), png: /png/i.test(a.contentType), ...(/hei[cf]/i.test(a.contentType) ? { heic: true } : {}) };
    const kw = a.keywords.trim();
    let best: string | null = null;
    for (const q of answers) {
      if (kw && (kw === q.name || kw.startsWith(`${q.name}_`) || kw.startsWith(q.name)) && (!best || q.name.length > best.length)) best = q.name;
    }
    if (best) qPhotos.set(best, [...(qPhotos.get(best) ?? []), ref]);
    else loose.set(kw, [...(loose.get(kw) ?? []), ref]);
  }

  /* Хэсэг — угтвараар. Нэр/оноо нь `sc_*_earned` талбаруудаас ДАРААЛЛААР. */
  const stems = [...new Set(answers.map((f) => stemOf(f.name)))];
  const grouped = stems.length > 1 && stems.length < answers.length;
  const scFields = fields.filter((f) => /^sc_.+_earned$/i.test(f.name) && !/^sc_all_earned$/i.test(f.name));
  const scoreFor = (earned: string) => {
    const e = numOrNull(r[earned]);
    const a = numOrNull(r[earned.replace(/_earned$/i, '_appl')]);
    return e != null && a != null ? { e, a } : null;
  };
  const sectionMeta = (key: string, i: number) => {
    /* Нэрээр таарвал (`sc_g_earned`), эс бөгөөс дарааллаар (i-р онооны талбар) */
    const byKey = scFields.find((f) => f.name.toLowerCase().startsWith(`sc_${key.toLowerCase()}_`));
    const f = byKey ?? (scFields.length === stems.length ? scFields[i] : undefined);
    const t = f ? cleanScoreAlias(f.alias) : '';
    const title = t ? (/^\d+[.)]/.test(t) ? t : `${i + 1}. ${t}`) : `${i + 1}. Хэсэг`;
    return { title, score: f ? scoreFor(f.name) : null };
  };
  const sectionMap = new Map<string, UzSection>();
  const sections: UzSection[] = [];
  for (const q of answers) {
    const key = grouped ? stemOf(q.name) : 'all';
    let sec = sectionMap.get(key);
    if (!sec) {
      const m = grouped ? sectionMeta(key, sections.length) : { title: 'Үзлэгийн асуултууд', score: null };
      sec = { key, title: m.title, score: m.score, items: [] };
      sectionMap.set(key, sec);
      sections.push(sec);
    }
    const code = r[q.name];
    if (code == null || code === '') continue;
    const ans = q.dom?.get(String(code)) ?? String(code);
    let block: string | null = null;
    const notes: string[] = [];
    for (const f of related.get(q.name) ?? []) {
      const t = fieldText(f, r, byName);
      if (!t) continue;
      if (BLK_RE.test(f.name) || /блок/i.test(f.alias)) block = t;
      else if (!NUM_RE.test(f.type)) notes.push(t);
    }
    sec.items.push({
      code: q.name, q: q.alias, ans, cls: ansCls(code, ans), block, notes,
      photos: qPhotos.get(q.name) ?? [], section: sec.title,
    });
  }

  /* Толгой (асуултаас өмнө) · гарын үсэг (асуултаас хойш) · дүн (`cnt_`/`sc_`) */
  const header: [string, string][] = [];
  const tail: { f: UzField; row: UzSigRow }[] = [];
  const summary: UzReport['summary'] = [];
  fields.forEach((f, i) => {
    if (answerNames.has(f.name) || relatedNames.has(f.name) || SYSTEM_RE.test(f.name)) return;
    if (SUMMARY_RE.test(f.name)) { summary.push({ label: f.alias, value: numOrNull(r[f.name]) }); return; }
    if (/_other$/i.test(f.name) && byName.has(f.name.replace(/_other$/i, ''))) return;
    const t = fieldText(f, r, byName);
    if (i > lastQ && lastQ >= 0) { tail.push({ f, row: { label: f.alias, value: t, photos: [] } }); return; }
    if (i < firstQ || lastQ < 0) { if (t) header.push([f.alias, t]); return; }
    if (t) header.push([f.alias, t]);
  });
  if (meta.location) header.push(['Байршил / Location', meta.location]);

  /* Гарын үсгийн зураг — түлхүүр үгтэй хамгийн урт нийтлэг угтвартай мөрийн ДАРАА */
  const signatures: UzSigRow[] = tail.map((x) => x.row);
  const extraPhotos: UzPhotoRef[] = [];
  for (const [kw, refs] of loose) {
    let at = -1; let best = 2;
    tail.forEach((x, i) => { const p = prefixLen(kw, x.f.name); if (p > best) { best = p; at = i; } });
    if (!kw || (at < 0 && !/sig|sign|гарын/i.test(kw))) { extraPhotos.push(...refs); continue; }
    /* Нэр нь өмнөх мөрийнхөөс: «…ахлах ажилтны нэр, албан тушаал 1 /заавал…/» → «…ахлах ажилтны гарын үсэг 1» */
    const prev = at < 0 ? '' : tail[at].row.label;
    const derived = prev
      .replace(/\s*\/[^/]*\/\s*$/, '')
      .replace(/нэр,?\s*албан\s*тушаал|албан\s*тушаал|овог\s*нэр|нэр/i, 'гарын үсэг')
      .trim();
    const label = derived && /гарын үсэг/i.test(derived) ? derived.charAt(0).toUpperCase() + derived.slice(1) : 'Гарын үсэг';
    const row: UzSigRow = { label, value: `${refs.length} файл`, photos: refs };
    const pos = at < 0 ? signatures.length : signatures.indexOf(tail[at].row) + 1;
    signatures.splice(pos, 0, row);
  }

  const cnt = (k: string) => numOrNull(r[`cnt_${k}`]);
  const all = sections.flatMap((s) => s.items);
  /* ⚠️ 2026-10-09: асуулт ОГТ танигдаагүй (`answers` хоосон — схем өөр) бол гараар тоолох
     боломжгүй тул `null` («—»). Урьд нь 0 болж PDF-д «Ноцтой 0» гэж ХУДАЛ бичигддэг байв. */
  const tally = (c: AnsCls): number | null => (answers.length ? all.filter((x) => x.cls === c).length : null);
  const e = numOrNull(r.sc_all_earned); const a = numOrNull(r.sc_all_appl);
  const creator = r.Creator ?? r.creator;
  const created = numOrNull(r.CreationDate ?? r.creationdate);
  return {
    oid,
    form,
    formShort: meta.formShort ?? form,
    date: meta.date,
    pkg: meta.pkg,
    company: meta.company,
    score: e != null && a != null ? { e, a } : null,
    counts: {
      major: cnt('major') ?? tally('major'),
      minor: cnt('minor') ?? tally('minor'),
      obs: cnt('obs') ?? tally('obs'),
      conf: cnt('conf') ?? tally('conf'),
      na: cnt('na') ?? tally('na'),
    },
    header,
    sections: sections.filter((s) => s.items.length),
    summary,
    signatures,
    extraPhotos,
    submitter: creator == null ? '' : String(creator),
    submitted: created ?? 0,
  };
}

/* ═════════════════ Хавсралт, байршил, зураг ═════════════════ */

/** Олон үзлэгийн хавсралт — 100-гаар багцалж (`loadUzPhotos`-ийн ижил шалтгаан) */
export async function loadUzAttachments(url: string, oids: number[]): Promise<Map<number, UzAttachment[]>> {
  const out = new Map<number, UzAttachment[]>();
  for (let i = 0; i < oids.length; i += 100) {
    const chunk = oids.slice(i, i + 100);
    const j = await arcgisPost<{
      attachmentGroups?: { parentObjectId: number; attachmentInfos?: { id: number; keywords?: string; contentType?: string }[] }[];
    }>(`${url}/queryAttachments`, {
      f: 'json',
      objectIds: chunk.join(','),
      returnMetadata: 'false',
    }, { token: 'org' });
    for (const g of j.attachmentGroups ?? []) {
      out.set(g.parentObjectId, (g.attachmentInfos ?? []).map((a) => ({
        id: a.id, keywords: String(a.keywords ?? ''), contentType: String(a.contentType ?? ''),
      })));
    }
  }
  return out;
}

/**
 * Үзлэгийн БАЙРШИЛ — «өргөрөг, уртраг» (WGS84). Хуудасны ачаалагч геометргүй
 * (`returnGeometry: false`) тул тайланд зориулж ТУСАД нь нэг хүсэлтээр.
 * ⚠️ Алдаа гарвал хоосон — байршилгүй тайлан ч ажиллана.
 */
export async function loadUzLocations(url: string, oids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    for (let i = 0; i < oids.length; i += 200) {
      const chunk = oids.slice(i, i + 200);
      /* ⚠️ 2026-10-09: `outFields` — зөвхөн OBJECTID (урьд нь `*`: 100+ талбарыг дэмий татдаг байв) */
      const j = await arcgisPost<{ objectIdFieldName?: string; features?: { attributes?: Row; geometry?: { x?: number; y?: number } }[] }>(
        `${url}/query`,
        { f: 'json', objectIds: chunk.join(','), outFields: 'objectid', returnGeometry: 'true', outSR: '4326' },
        { token: 'org' },
      );
      const oidF = j.objectIdFieldName ?? 'objectid';
      for (const ft of j.features ?? []) {
        const id = Number(ft.attributes?.[oidF] ?? ft.attributes?.OBJECTID ?? ft.attributes?.objectid);
        const { x, y } = ft.geometry ?? {};
        if (Number.isFinite(id) && typeof x === 'number' && typeof y === 'number') out.set(id, `${y.toFixed(6)}, ${x.toFixed(6)}`);
      }
    }
  } catch { /* байршилгүй тайлан */ }
  return out;
}

/**
 * Хавсралтын хаяг — ТОКЕНГҮЙ.
 * ⚠️ 2026-10-09 (аюулгүй байдал): урьд нь тайлан угсрах агшинд `?token=` залгаж, зургийг
 *    GET-ээр татдаг байв — токен ArcGIS/прокси/CDN-ийн access log-д бүтнээрээ үлдэж (CWE-598),
 *    олон зурагтай тайлан удаан татагдахад хугацаа нь дуусаж 498 авдаг. Одоо токен ЗӨВХӨН
 *    татах агшинд POST биеэр (`fetchAttachment`).
 */
export const attUrl = (layerUrl: string, oid: number, id: number): string =>
  `${layerUrl}/${oid}/attachments/${id}`;

/** Байгууллагын ArcGIS хост мөн үү — токеныг ЗӨВХӨН тийш (`query.isOrgUrl`-ийн ижил дүрэм) */
const ORG_BASE = (process.env.NEXT_PUBLIC_ARCGIS_HJ ?? '').trim().replace(/\/+$/, '');
const ARCGIS_COM_HOST = /^https?:\/\/[^/]*\.arcgis\.com(?::\d+)?\//i;
const ORG_SEG = ARCGIS_COM_HOST.test(`${ORG_BASE}/`) ? ORG_BASE.match(/^https?:\/\/[^/]+\/([^/]+)\//)?.[1] ?? '' : '';
/** ⚠️ 2026-10-09: экспортлогдсон — хуудасны зургийн слайдер ч (blob URL) энэ шалгуураар токен илгээнэ */
export const isOrgUrl = (url: string): boolean =>
  (!!ORG_BASE && url.startsWith(`${ORG_BASE}/`))
  || (!!ORG_SEG && ARCGIS_COM_HOST.test(url) && url.includes(`/${ORG_SEG}/`));

/** Нэг хавсралтын хугацааны дээд хязгаар — гацсан хүсэлт тайланг мөнхөд түгжихгүй */
export const ATT_TIMEOUT_MS = 30_000;

const abortErr = () => new DOMException('Aborted', 'AbortError');

/**
 * ХАВСРАЛТЫН БАЙТ — POST, токен БИЕЭР (2026-10-09).
 * ⚠️ Татахын ӨМНӨ `ensureFreshToken` — олон зурагтай тайлан минут гаруй татагдана.
 * ⚠️ ArcGIS алдааг HTTP 200-аар JSON биетэй буцаадаг тул `content-type`-ийг шалгана
 *    (токенгүй GET нь HTML нэвтрэх хуудас буцаадаг — амьдаар баталсан);
 *    498/499 бол `refreshAfterTokenError` → НЭГ удаа дахин. Бусад алдаа → `null`
 *    (дуудагч «татагдсангүй»-д тоолно).
 * ⚠️ `URLSearchParams` бие = энгийн CORS хүсэлт (preflight-гүй).
 * ⚠️ 2026-10-09: оролдлого бүр `ATT_TIMEOUT_MS` (30с) — урьд нь хугацаагүй тул нэг гацсан
 *    хавсралт тайлан татахыг МӨНХӨД «Зураг татаж байна… 41/42»-д түгжиж, цонх хаагдахгүй
 *    байв. Timeout → `null` (татагдсангүйд тоологдоно). `signal` (хэрэглэгч цуцлах) бол
 *    `AbortError` ШИДНЭ. `AbortSignal.any` бүх хөтөчид байхгүй (`query.ts`-ийн ⚠️) — гараар.
 * ⚠️ Токеныг ЗӨВХӨН байгууллагын хост руу (`isOrgUrl`).
 */
export async function fetchAttachment(url: string, signal?: AbortSignal): Promise<Blob | null> {
  await ensureFreshToken();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw abortErr();
    const sent = isOrgUrl(url) ? authToken() : null;
    const body = new URLSearchParams();
    if (sent) body.set('token', sent);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ATT_TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, { method: 'POST', body, signal: ctl.signal });
      let code = res.ok ? 0 : res.status;
      if (res.ok && /json|text\/(plain|html)/i.test(res.headers.get('content-type') ?? '')) {
        try {
          const j = (await res.json()) as { error?: { code?: unknown } };
          code = Number(j?.error?.code ?? 500) || 500;
        } catch { code = 500; }
      }
      if (!code) return await res.blob();
      if ((code === 498 || code === 499) && attempt === 0 && sent && await refreshAfterTokenError(sent)) continue;
      return null;
    } catch {
      if (signal?.aborted) throw abortErr();
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  return null;
}

/**
 * Татсан, жижигрүүлсэн зураг — PDF-д `data` (data URL), Excel-д `bytes` ба хэмжээ.
 * ⚠️ 2026-10-09 (санах ой): ЗӨВХӨН сонгосон форматын хэлбэр үүснэ — нөгөө нь `null`.
 *    Урьд нь зураг бүрд data URL + байт ХОЁУЛАА (≈2.3× санах ой) хадгалагддаг тул олон
 *    зурагтай тайлан хөтчийг унагадаг байв.
 */
export type UzImg = { data: string | null; bytes: Uint8Array | null; w: number; h: number; png: boolean };
/** Тайлангийн зургийн хэлбэр — `pdf` → data URL, `xlsx` → байт */
export type UzImgMode = 'pdf' | 'xlsx';

/** Үүнээс олон зураг бол цонх анхааруулна («Зураггүй» сонголт санал болгоно) */
export const UZ_IMG_WARN = 1500;

/** Бүх тайлангийн зургийн лавлагаа (давхардалгүй) — хэмжээний дээд хязгаартай */
function reportRefs(reports: UzReport[]): { ref: UzPhotoRef; max: number }[] {
  const refs: { ref: UzPhotoRef; max: number }[] = [];
  const seen = new Set<string>();
  const add = (r: UzPhotoRef, max: number) => { if (!seen.has(r.url)) { seen.add(r.url); refs.push({ ref: r, max }); } };
  for (const rep of reports) {
    rep.sections.forEach((s) => s.items.forEach((it) => it.photos.forEach((p) => add(p, 900))));
    rep.signatures.forEach((s) => s.photos.forEach((p) => add(p, 420)));
    rep.extraPhotos.forEach((p) => add(p, 900));
  }
  return refs;
}
/** Татагдах зургийн тоо (давхардалгүй) */
export const countReportImages = (reports: UzReport[]): number => reportRefs(reports).length;

/**
 * Зургийг татаж ЖИЖИГРҮҮЛНЭ — файлын хэмжээг барина.
 * ⚠️ Гарын үсэг PNG хэвээр (тунгалаг дэвсгэр); бусад нь JPEG 0.72.
 * ⚠️ 2026-10-09: `'heic'` — татагдсан ч хөтөч HEIC-ийг задалж чадсангүй (Chrome/Firefox-д
 *    `createImageBitmap` image/heic-д унадаг). «Татагдсангүй»-гээс ТУСАД нь тоологдоно —
 *    сүлжээ биш формат асуудал тул «дахин оролдох» нь тусалдаггүй.
 */
async function toImg(ref: UzPhotoRef, max: number, mode: UzImgMode, signal?: AbortSignal): Promise<UzImg | 'heic' | null> {
  const blob = await fetchAttachment(ref.url, signal);
  if (!blob) return null;
  try {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return ref.heic || /hei[cf]/i.test(blob.type) ? 'heic' : null;
    }
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k));
    cv.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = cv.getContext('2d');
    if (!ctx) { bmp.close(); return null; }
    if (!ref.png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close();
    const type = ref.png ? 'image/png' : 'image/jpeg';
    const base = { w: cv.width, h: cv.height, png: ref.png };
    if (mode === 'pdf') return { ...base, data: cv.toDataURL(type, 0.72), bytes: null };
    const out = await new Promise<Blob | null>((res) => cv.toBlob(res, type, 0.72));
    if (!out) return null;
    return { ...base, data: null, bytes: new Uint8Array(await out.arrayBuffer()) };
  } catch {
    return null;
  }
}

/**
 * Бүх тайлангийн зургийг 4 зэрэгцээгээр татна — явцыг мэдэгдэнэ.
 * ⚠️ 2026-10-09: `failed` — татагдаагүй зургийн хаягууд. Урьд нь чимээгүй хаягддаг тул
 *    PDF/Excel-д зураг дутуу атал Excel-ийн «зураг» тоо бүтнээрээ үлддэг байв. Цонх
 *    «N зураг татагдсангүй» гэж хэлж, Excel татагдсан (ба татагдаагүй) тоог бичнэ.
 * ⚠️ 2026-10-09: `heic` — задлах боломжгүй HEIC (тусдаа тоо, `failed`-д ОРОХГҮЙ — цонх хоёрыг
 *    тусад нь хэлнэ; Excel-ийн тоонд хоёулаа «татагдсангүй»). `signal` цуцлагдвал `AbortError`.
 */
export async function loadReportImages(
  reports: UzReport[],
  opts: { mode: UzImgMode; signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<{ images: Map<string, UzImg>; failed: string[]; heic: string[] }> {
  const { mode, signal, onProgress } = opts;
  const refs = reportRefs(reports);
  const out = new Map<string, UzImg>();
  const failed: string[] = [];
  const heic: string[] = [];
  let next = 0;
  let done = 0;
  onProgress?.(0, refs.length);
  const worker = async () => {
    while (next < refs.length) {
      if (signal?.aborted) throw abortErr();
      const { ref, max } = refs[next++];
      const d = await toImg(ref, max, mode, signal);
      if (d === 'heic') heic.push(ref.url);
      else if (d) out.set(ref.url, d);
      else failed.push(ref.url);
      done += 1;
      if (!signal?.aborted) onProgress?.(done, refs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, refs.length) }, worker));
  if (signal?.aborted) throw abortErr();
  return { images: out, failed, heic };
}

/* ═════════════════ PDF ═════════════════ */

const INK = '#1f2a44';
const MUTED = '#6b7280';
const BAND = '#e8edf5';
const LINE = '#d7dce6';
const BADGE: Record<AnsCls, { bg: string; fg: string }> = {
  conf: { bg: '#17875f', fg: '#ffffff' },
  obs: { bg: '#f2b705', fg: '#2b2b2b' },
  minor: { bg: '#ff7f0e', fg: '#ffffff' },
  major: { bg: '#d62839', fg: '#ffffff' },
  na: { bg: '#6e6e6e', fg: '#ffffff' },
  other: { bg: '#9aa3b2', fg: '#ffffff' },
};

type Obj = Record<string, unknown>;
const pctText = (s: { e: number; a: number } | null) =>
  (s && s.a > 0 ? `${s.e} / ${s.a} (${((s.e / s.a) * 100).toFixed(2)}%)` : '—');

/** Нэг тайлангийн агуулга (дараалсан тайлан бүр шинэ хуудаснаас) */
function reportContent(rep: UzReport, img: Map<string, UzImg>, logo: string | null, first: boolean): Content[] {
  let photoNo = 0;
  const photoRow = (refs: UzPhotoRef[]): Obj | null => {
    const ok = refs.map((r) => img.get(r.url)?.data).filter((x): x is string => !!x);
    if (!ok.length) return null;
    const cells: Obj[] = ok.map((d) => {
      photoNo += 1;
      return { stack: [{ image: d, fit: [118, 118] }, { text: `Зураг ${photoNo}`, fontSize: 7, color: MUTED, margin: [0, 2, 0, 0] }], width: 'auto' };
    });
    const rows: Obj[] = [];
    for (let i = 0; i < cells.length; i += 4) rows.push({ columns: cells.slice(i, i + 4), columnGap: 8, margin: [12, 4, 0, 4] });
    return { stack: rows };
  };
  const badge = (it: UzItem): Obj => ({
    table: { widths: ['*'], body: [[{ text: it.ans, color: BADGE[it.cls].fg, fillColor: BADGE[it.cls].bg, alignment: 'right', fontSize: 9, margin: [6, 7, 6, 7] }]] },
    layout: 'noBorders',
  });
  const rule = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: LINE }], margin: [0, 6, 0, 6] };
  const itemBlock = (it: UzItem, withSection: boolean): Obj => ({
    unbreakable: it.photos.length <= 4,
    stack: [
      ...(withSection ? [{ text: it.section, fontSize: 8, color: MUTED, margin: [0, 0, 0, 2] }] : []),
      { columns: [{ text: it.q, bold: true, fontSize: 9.5, width: '*', margin: [0, 4, 10, 0] }, { width: 180, ...badge(it) }] },
      ...(it.block ? [{ text: [{ text: 'Блок: ', color: MUTED }, it.block], fontSize: 9, margin: [12, 4, 0, 0] }] : []),
      ...it.notes.map((n) => ({ text: n, fontSize: 9, margin: [12, 2, 0, 0] })),
      ...[photoRow(it.photos)].filter(Boolean) as Obj[],
      rule,
    ],
  });
  const band = (left: string, right: string): Obj => ({
    table: { widths: ['*', 'auto'], body: [[{ text: left, bold: true, fontSize: 11 }, { text: right, fontSize: 9, alignment: 'right', margin: [0, 2, 0, 0] }]] },
    layout: { fillColor: () => BAND, hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
    margin: [0, 10, 0, 4],
  });

  const flagged = rep.sections.flatMap((s) => s.items).filter((x) => x.cls === 'major' || x.cls === 'minor');
  /** Гарчгийг эхний блоктой нь хамт (хуудас дамжихгүй), үлдсэнийг дараа нь */
  const pushWithBand = (head: Obj, blocks: Obj[]) => {
    if (!blocks.length) { out.push(head); return; }
    out.push({ unbreakable: true, stack: [head, blocks[0]] });
    out.push(...blocks.slice(1));
  };
  const c = rep.counts;
  /** ⚠️ 2026-10-09: мэдэгдэхгүй тоо «—» (0 БИШ) */
  const cn = (v: number | null) => (v == null ? '—' : String(v));
  const out: Obj[] = [
    ...(logo ? [{ svg: logo, width: 150, margin: [0, 0, 0, 10], ...(first ? {} : { pageBreak: 'before' }) }] : (first ? [] : [{ text: '', pageBreak: 'before' }])),
    { text: rep.form, fontSize: 18, bold: true, color: INK, margin: [0, 4, 0, 6] },
    { text: rep.date > 0 ? fmtDateTime(rep.date) : '—', fontSize: 11, margin: [0, 0, 0, 12] },
    {
      table: {
        widths: ['*', '*', '*'],
        body: [[
          { text: [{ text: 'Оноо  ', bold: true }, pctText(rep.score)], fillColor: BAND, fontSize: 9.5, margin: [4, 5, 4, 5] },
          { text: [{ text: 'Ноцтой  ', bold: true }, cn(c.major)], fillColor: BAND, fontSize: 9.5, margin: [4, 5, 4, 5] },
          { text: [{ text: 'Бага зэргийн  ', bold: true }, cn(c.minor)], fillColor: BAND, fontSize: 9.5, margin: [4, 5, 4, 5] },
        ]],
      },
      layout: 'noBorders',
    },
    {
      table: {
        widths: ['*', '*'],
        body: [
          ...rep.header.map(([k, v]) => [{ text: k, bold: true, fontSize: 9.5 }, { text: v, fontSize: 9.5, alignment: 'right', fillColor: '#f5f7fb' }]),
          [{ text: 'Ажиглалт, талбайд зассан / Нийцсэн / Хамааралгүй', bold: true, fontSize: 9.5 }, { text: `${cn(c.obs)} / ${cn(c.conf)} / ${cn(c.na)}`, fontSize: 9.5, alignment: 'right', fillColor: '#f5f7fb' }],
        ],
      },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 5, paddingBottom: () => 5 },
      margin: [0, 0, 0, 6],
    },
  ];

  if (flagged.length) {
    pushWithBand(band('Үл нийцэл (Flagged items)', `Ноцтой ${cn(c.major)}, Бага зэргийн ${cn(c.minor)}`), flagged.map((it) => itemBlock(it, true)));
  }
  /* Жишээ тайлангийн дагуу зургийн дугаар хэсгүүдэд дахин 1-ээс эхэлнэ */
  photoNo = 0;
  for (const s of rep.sections) {
    pushWithBand(band(s.title, s.score ? `Оноо: ${s.score.e} / ${s.score.a}` : ''), s.items.map((it) => itemBlock(it, false)));
  }
  if (rep.extraPhotos.length) {
    const row = photoRow(rep.extraPhotos);
    if (row) pushWithBand(band('Бусад зураг', ''), [row]);
  }
  const sigs = rep.signatures.filter((s) => s.value || s.photos.length);
  if (sigs.length) {
    const blocks: Obj[] = sigs.map((s) => {
      const sig = s.photos.map((p) => img.get(p.url)?.data).find(Boolean);
      return {
        unbreakable: true,
        stack: [
          { columns: [
            { text: s.label, bold: true, fontSize: 9.5, width: 220, margin: [0, 4, 10, 0] },
            sig ? { image: sig, fit: [150, 60], width: 170 } : { text: s.value, fontSize: 9.5, margin: [0, 4, 0, 0] },
          ] },
          rule,
        ],
      };
    });
    pushWithBand(band('Баталгаажуулах хэсэг', ''), blocks);
  }
  return out as unknown as Content[];
}

/** Олон тайлан → нэг PDF; хуудасны доод мөрөнд тухайн тайлангийн маягт · багц · огноо */
export function buildUzPdf(reports: UzReport[], img: Map<string, UzImg>, logo: string | null): TDocumentDefinitions {
  const content: Content[] = [];
  reports.forEach((rep, i) => content.push(...reportContent(rep, img, logo, i === 0)));
  const one = reports.length === 1 ? reports[0] : null;
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: INK },
    /* ⚠️ 2026-10-09: огноогүй (`date = 0`) бол «—» — урьд нь «1970-01-01» гэж бичигддэг байв */
    info: { title: one ? `${one.form} — ${one.pkg} — ${one.date > 0 ? fmtDate(one.date) : '—'}` : 'Ажлын байрны үзлэг' },
    footer: (page: number) => ({
      text: [
        one ? `${one.form}  |  ${one.pkg}  |  ${one.date > 0 ? fmtDate(one.date) : '—'}  |  Хуудас ` : 'Ажлын байрны үзлэг  |  Хуудас ',
        { text: String(page), fontSize: 10, color: INK },
      ],
      alignment: 'right',
      fontSize: 7,
      color: MUTED,
      margin: [40, 18, 40, 0],
    }),
    content,
  };
}

/* ═════════════════ Excel (.xlsx — нэмэлт сангүй) ═════════════════ */

/**
 * ⚠️ XLSX нь ZIP — сан нэмэхгүйн тулд ШАХАЛТГҮЙ («stored») ZIP-ийг энд угсарна.
 *    Excel, LibreOffice хоёулаа нээнэ. CRC32 л хэрэгтэй.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zipStore(files: { name: string; data: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
    loc.setUint16(8, 0, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true); loc.setUint16(26, name.length, true);
    parts.push(new Uint8Array(loc.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

const xmlEsc = (s: string) => s
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/**
 * Нүдний хэв (styles.xml-ийн `cellXfs` индекс) — жишээ файлын өнгөөр:
 * толгой ногоон (#31872E) цагаан тод · хэсгийн зурвас цайвар ногоон (#E2F0D9) ·
 * хариулт: нийцсэн #E2F0D9, ажиглалт #FFF2CC, бага #FCE4D6, ноцтой #FFC7CE, хамааралгүй #EDEDED.
 */
const ST = { plain: 0, head: 1, title: 2, band: 3, cell: 4, conf: 5, obs: 6, minor: 7, major: 8, na: 9, sub: 10 } as const;
const ANS_ST: Record<AnsCls, number> = { conf: ST.conf, obs: ST.obs, minor: ST.minor, major: ST.major, na: ST.na, other: ST.cell };

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="13"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + ['FF31872E', 'FFE2F0D9', 'FFFFF2CC', 'FFFCE4D6', 'FFFFC7CE', 'FFEDEDED']
    .map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')
  + '</fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right>'
  + '<top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="11">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + [3, 4, 5, 6, 7].map((fill) => `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`).join('')
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '</cellXfs></styleSheet>';

type XCell = { v: string | number | null; s?: number };
type XRow = { cells: XCell[]; ht?: number };
type XImg = UzImg & { bytes: Uint8Array };
type XPic = { col: number; row: number; img: XImg; hPt: number };
/** Excel-д шигтгэх боломжтой (байттай) зураг */
const xlsImg = (x: UzImg | undefined): x is XImg => !!x?.bytes;
type XSheet = { name: string; rows: XRow[]; widths: number[]; freezeRow?: boolean; pics: XPic[]; merges?: string[] };

const EMU_PER_PX = 9525;
const PX_PER_PT = 96 / 72;

function sheetXml(sh: XSheet, drawingRid: string | null): string {
  const body = sh.rows.map((r, ri) => {
    const ht = r.ht ? ` ht="${r.ht}" customHeight="1"` : '';
    const cells = r.cells.map((c, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      const st = c.s ? ` s="${c.s}"` : '';
      if (c.v == null || c.v === '') return `<c r="${ref}"${st}/>`;
      if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${st}><v>${c.v}</v></c>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(c.v))}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}"${ht}>${cells}</row>`;
  }).join('');
  const cols = sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const pane = sh.freezeRow
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `${pane}<cols>${cols}</cols><sheetData>${body}</sheetData>`
    + (sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + (drawingRid ? `<drawing r:id="${drawingRid}"/>` : '')
    + '</worksheet>';
}

function drawingXml(pics: XPic[], firstRid: number): string {
  const anchors = pics.map((p, i) => {
    const hPx = p.hPt * PX_PER_PT;
    const wPx = hPx * (p.img.w / p.img.h);
    const id = i + 1;
    return '<xdr:oneCellAnchor>'
      + `<xdr:from><xdr:col>${p.col}</xdr:col><xdr:colOff>${3 * EMU_PER_PX}</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>${3 * EMU_PER_PX}</xdr:rowOff></xdr:from>`
      + `<xdr:ext cx="${Math.round(wPx * EMU_PER_PX)}" cy="${Math.round(hPx * EMU_PER_PX)}"/>`
      + `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id + 1}" name="Image ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
      + `<xdr:blipFill><a:blip r:embed="rId${firstRid + i}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
      + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(wPx * EMU_PER_PX)}" cy="${Math.round(hPx * EMU_PER_PX)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`
      + '<xdr:clientData/></xdr:oneCellAnchor>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + anchors + '</xdr:wsDr>';
}

/** Хуудасны нэр — Excel 31 тэмдэгт, `[]:*?/\` хориотой, давхардахгүй */
const sheetName = (s: string, used: Set<string>) => {
  const base = s.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let n = base; let k = 2;
  while (used.has(n)) { const suf = ` (${k++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n);
  return n;
};

/** «Морин сувд - Захиалагчийн үзлэг 2026-09-29» */
/* ⚠️ 2026-10-09: компани/багц нь хэвийн болголтоос «—» (`habeaUzleg.clean`) ирж болно —
   `companyShort` түүнийг хоосон болгодог тул `||` нөөц одоо ажиллана (урьд нь «— - …»). */
export const reportTitle = (r: UzReport): string =>
  `${companyShort(r.company) || companyShort(r.pkg) || 'Үзлэг'} - ${r.formShort} ${r.date > 0 ? fmtDate(r.date) : ''}`.trim();

/**
 * Зургийн тоо — ТАТАГДСАН (эсвэл татаагүй) нь; татагдаагүй байвал «2 (1 татагдсангүй)».
 * ⚠️ 2026-10-09: урьд нь хавсралтын БҮХ тоог бичдэг тул зураг дутуу атал тоо бүтэн харагддаг байв.
 */
const photoCount = (photos: UzPhotoRef[], failed: ReadonlySet<string>): string | number | null => {
  const bad = photos.filter((p) => failed.has(p.url)).length;
  const ok = photos.length - bad;
  if (bad) return `${ok} (${bad} татагдсангүй)`;
  return ok || null;
};

/** Нэг үзлэгийн хуудас («ObjectID 20») */
function inspectionSheet(r: UzReport, img: Map<string, UzImg>, name: string, failed: ReadonlySet<string>): XSheet {
  const rows: XRow[] = [];
  const pics: XPic[] = [];
  const PHOTO_PT = 190;
  const SIG_PT = 66;
  let maxPhotos = 0;
  const kv = (label: string, value: string | number | null, s: number = ST.cell): XRow =>
    ({ cells: [{ v: '', s: ST.cell }, { v: label, s: ST.cell }, { v: value, s }, { v: '', s: ST.cell }, { v: '', s: ST.cell }, { v: '', s: ST.cell }] });
  /* ⚠️ Хэсгийн гарчиг A–G НЭГТГЭСЭН нүдэнд — нарийн A баганад ороож мөр 150pt өндөр болдог байв */
  const merges: string[] = [];
  const band = (t: string): XRow => {
    merges.push(`A${rows.length + 1}:G${rows.length + 1}`);
    return { cells: Array.from({ length: 7 }, (_, i) => ({ v: i === 0 ? t : '', s: ST.band })), ht: 20 };
  };
  rows.push({ cells: [{ v: reportTitle(r), s: ST.title }], ht: 20 });
  rows.push({ cells: [{ v: `Илгээсэн: ${r.submitter || '—'}, ${r.submitted > 0 ? fmtDateTime(r.submitted) : '—'}` }] });
  rows.push({ cells: ['№', 'Асуулт / талбар', 'Хариулт', 'Блок', 'Тайлбар', 'Зургийн тоо', 'Зураг'].map((v) => ({ v, s: ST.head })) });
  rows.push(band('Ерөнхий мэдээлэл'));
  for (const [k, v] of r.header) rows.push(kv(k, v));
  for (const s of r.sections) {
    rows.push(band(s.title));
    for (const it of s.items) {
      const ph = it.photos.map((p) => img.get(p.url)).filter(xlsImg);
      const row = rows.length;
      ph.forEach((im, k) => pics.push({ col: 6 + k, row, img: im, hPt: PHOTO_PT - 6 }));
      maxPhotos = Math.max(maxPhotos, ph.length);
      rows.push({
        cells: [
          { v: it.code.toUpperCase(), s: ST.cell }, { v: it.q, s: ST.cell }, { v: it.ans, s: ANS_ST[it.cls] },
          { v: it.block ?? '', s: ST.cell }, { v: it.notes.join('; '), s: ST.cell },
          { v: photoCount(it.photos, failed), s: ST.cell },
        ],
        ...(ph.length ? { ht: PHOTO_PT } : {}),
      });
    }
  }
  if (r.summary.length) {
    rows.push(band('Дүн / Summary'));
    for (const x of r.summary) rows.push(kv(x.label, x.value));
  }
  if (r.signatures.length) {
    rows.push(band('Баталгаажуулах хэсэг'));
    for (const s of r.signatures) {
      const ph = s.photos.map((p) => img.get(p.url)).filter(xlsImg);
      const row = rows.length;
      ph.forEach((im, k) => pics.push({ col: 6 + k, row, img: im, hPt: SIG_PT - 6 }));
      maxPhotos = Math.max(maxPhotos, ph.length);
      rows.push({ ...kv(s.label, s.value), ...(ph.length ? { ht: SIG_PT } : {}) });
    }
  }
  const widths = [6.29, 49.29, 21.29, 13.29, 31.29, 7.29, ...Array.from({ length: Math.max(1, maxPhotos) }, () => 47.29)];
  return { name, rows, widths, pics, merges };
}

/**
 * «Хүснэгт» — нэг мөр = нэг үзлэг (жишээ файлын 216 баганатай ижил дараалал):
 * ObjectID · толгой · асуулт бүр 4 багана · дүн · гарын үсэг · илгээсэн хэрэглэгч/огноо.
 */
function tableSheet(reports: UzReport[], name: string, failed: ReadonlySet<string>): XSheet {
  const head: string[] = ['ObjectID'];
  const headerKeys: string[] = [];
  for (const r of reports) for (const [k] of r.header) if (!headerKeys.includes(k)) headerKeys.push(k);
  head.push(...headerKeys);
  const qOrder: { code: string; q: string }[] = [];
  for (const r of reports) {
    for (const s of r.sections) for (const it of s.items) if (!qOrder.some((x) => x.code === it.code)) qOrder.push({ code: it.code, q: it.q });
  }
  for (const q of qOrder) head.push(`${q.code} ${q.q}`, `${q.code} блок`, `${q.code} тайлбар`, `${q.code} зураг`);
  const sumKeys: string[] = [];
  for (const r of reports) for (const x of r.summary) if (!sumKeys.includes(x.label)) sumKeys.push(x.label);
  head.push(...sumKeys);
  /* ⚠️ Гарын үсгийн хэсэгт ИЖИЛ нэр давтагдана («Огноо / Date» ×3) — байрлалаар түлхүүрлэнэ */
  const sigRowKeys = (r: UzReport) => {
    const seen = new Map<string, number>();
    return r.signatures.map((s) => { const n = (seen.get(s.label) ?? 0) + 1; seen.set(s.label, n); return `${s.label}#${n}`; });
  };
  const sigKeys: string[] = [];
  for (const r of reports) for (const k of sigRowKeys(r)) if (!sigKeys.includes(k)) sigKeys.push(k);
  head.push(...sigKeys.map((k) => k.split('#')[0]), 'Илгээсэн хэрэглэгч', 'Илгээсэн огноо');

  const rows: XRow[] = [{ cells: head.map((v) => ({ v, s: ST.head })), ht: 75 }];
  for (const r of reports) {
    const hm = new Map(r.header);
    const items = new Map(r.sections.flatMap((s) => s.items).map((it) => [it.code, it]));
    const sm = new Map(r.summary.map((x) => [x.label, x.value]));
    const rk = sigRowKeys(r);
    const sg = new Map(r.signatures.map((s, i) => [rk[i], s.photos.length ? photoCount(s.photos, failed) : s.value]));
    const v: (string | number | null)[] = [r.oid, ...headerKeys.map((k) => hm.get(k) ?? '')];
    for (const q of qOrder) {
      const it = items.get(q.code);
      v.push(it?.ans ?? '', it?.block ?? '', it ? it.notes.join('; ') : '', it ? photoCount(it.photos, failed) : null);
    }
    v.push(...sumKeys.map((k) => sm.get(k) ?? null));
    v.push(...sigKeys.map((k) => sg.get(k) ?? ''));
    v.push(r.submitter, r.submitted > 0 ? fmtDateTime(r.submitted) : '');
    rows.push({ cells: v.map((x) => ({ v: x, s: ST.cell })) });
  }
  return { name, rows, widths: head.map(() => 15.29), freezeRow: true, pics: [] };
}

/**
 * Жишээ файлын бүтэцтэй xlsx: «Хүснэгт» + үзлэг бүр «ObjectID N» (зураг шигтгэсэн).
 * @param failed — татагдаагүй зургийн хаягууд (`loadReportImages`) — тоонд ил бичигдэнэ
 */
export function buildUzXlsx(
  reports: UzReport[],
  img: Map<string, UzImg> = new Map(),
  failed: ReadonlySet<string> = new Set(),
): Uint8Array {
  const used = new Set<string>();
  const sheets: XSheet[] = [tableSheet(reports, sheetName('Хүснэгт', used), failed)];
  for (const r of reports) sheets.push(inspectionSheet(r, img, sheetName(`ObjectID ${r.oid}`, used), failed));

  const files: { name: string; data: string | Uint8Array }[] = [];
  const ctOver: string[] = [];
  let mediaNo = 0;
  let drawNo = 0;
  sheets.forEach((sh, si) => {
    const n = si + 1;
    let rid: string | null = null;
    if (sh.pics.length) {
      drawNo += 1;
      rid = 'rId1';
      files.push({ name: `xl/worksheets/_rels/sheet${n}.xml.rels`, data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawNo}.xml"/></Relationships>` });
      const rels = sh.pics.map((p, i) => {
        mediaNo += 1;
        const ext = p.img.png ? 'png' : 'jpeg';
        files.push({ name: `xl/media/image${mediaNo}.${ext}`, data: p.img.bytes });
        return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${mediaNo}.${ext}"/>`;
      }).join('');
      files.push({ name: `xl/drawings/drawing${drawNo}.xml`, data: drawingXml(sh.pics, 1) });
      files.push({ name: `xl/drawings/_rels/drawing${drawNo}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` });
      ctOver.push(`<Override PartName="/xl/drawings/drawing${drawNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    }
    files.push({ name: `xl/worksheets/sheet${n}.xml`, data: sheetXml(sh, rid) });
    ctOver.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  });

  const head = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + ctOver.join('') + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
  ];
  return zipStore([...head, ...files]);
}

/**
 * Файлын нэрэнд тохиромжгүй тэмдэгт ба «ХХК», хашилтыг арилгана — «"Морин сувд" ХХК» → «Морин сувд».
 * ⚠️ 2026-10-09: дан «—» (хоосон утгын орлуулга, `habeaUzleg.clean`) → '' — дуудагчийн `||`
 *    нөөц (багц, «Үзлэг») ажиллана. Урьд нь файлын нэр «2026-09-29 —» болдог байв.
 */
export const companyShort = (s: string): string => s
  .replace(/["“”«»']/g, '')
  .replace(/\s*(ХХК|LLC|ХК|ТӨХК)\s*$/i, '')
  .replace(/[\\/:*?<>|]+/g, ' ')
  .trim()
  .replace(/^[—–-]+$/, '');

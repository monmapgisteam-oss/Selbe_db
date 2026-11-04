'use client';

/**
 * ҮЛ НИЙЦЛИЙН АРИЛГАЛТ — `HSE_Action` (2026-10-26, хэрэглэгчийн хүсэлт: «Захиалагчийн ажлын байрны үзлэг»
 * фокусын БАРУУН талд HSE_Action-ий өгөгдлөөр чартууд; V1.1 энэ фокусаас хасагдав).
 *
 * `HSE_Action` (Enterprise `Hosted/HSE_Action/FeatureServer/2`) — үзлэгийн үл нийцэл бүр нэг ажил (Workforce-ийн
 * `esritask_*` талбартай): асуумж (`survey`) · багц (`site`) · хэсэг (`section`) · зэрэг (`severity_code`) ·
 * төлөв (`esritask_status`) · дуусах хугацаа (`esritask_duedate`). Амьд метадата 2026-10-26: 1041 мөр
 * (V1.1 866 · захиалагчийн 175).
 *
 * ⚠️ 2026-11-02 өгөгдлийн шалгалт (сүүлийн 30 хоног, 102 ажил): төлөв бүгд «Хуваарилсан», дуусах хугацаа хоосон,
 * хариуцагч = багц (`bagts1_HABEABO` …), хэсэг 36 мөрөнд хоосон → хариуцагчийн чартыг хасч ТӨРЛӨӨР (хэсэг) ·
 * асуултаар (давтагдсан үл нийцэл) · асуумжаар задаргаа нэмэв; төлөвийг ажлын урсгалын БҮХ шатаар (0-тэйг ч) харуулна.
 *
 * ⚠️ 2026-11-02 (хэрэглэгч: «бүгдийг динамик байдлаар ажиллуул»): чарт бүр дарж шүүнэ — төрөл · төлөв · асуулт ·
 * асуумж · өдөр · багц. Чарт бүр ӨӨРИЙН сонголтоор шүүгдэхгүй (ArcGIS Dashboard-ын зан, `habeaUzleg.uzPass`), бусад
 * бүх сонголтоор шүүгдэнэ. Газрын зураг мөн ижил мөрүүдийг харуулна (`actionWhere` → `Habea` `layerWhere`).
 * Сонголтын төлөв `Habea`-д (гурван хэсэг нэг төлөвтэй, шүүлтийн чип мөрөнд харагдана).
 */

import { useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures, arcgisPost, type Row } from '@/lib/query';
import { register } from '@/lib/dataBus';
import { getAuth } from '@/lib/draftRemote';
import { devToken } from '@/lib/authToken';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { HABEA } from '@/lib/services';
import { Section, Bars, Donut, Series, Loading, Empty, friendlyError } from '@/components/ui';
import { ubDayKey } from '@/lib/ceo/workforce';
import { cleanLabel, rasterTypeOf } from '@/lib/uzlegReport';
import h from './habea.module.css';
import { num, pct, date } from '@/lib/format';
import { habeaPkgKey, habeaPkgLabel, AttPhoto } from './habeaUzleg';

const A = HABEA.action;

/** `esritask_status` домэйн (амьд метадата) → нэр ба өнгө. Дараалал нь ажлын урсгалын дараалал. */
const STATUS: { code: number; label: () => string; color: string }[] = [
  { code: 0, label: () => tr('Хуваарилаагүй'), color: '#94a3b8' },
  { code: 1, label: () => tr('Хуваарилсан'), color: '#f59e0b' },
  { code: 2, label: () => tr('Гүйцэтгэж байна'), color: '#3b82f6' },
  { code: 4, label: () => tr('Шалгуулах'), color: '#8b5cf6' },
  { code: 5, label: () => tr('Засвар шаардлагатай'), color: '#dc2626' },
  { code: 3, label: () => tr('Дууссан'), color: '#16a34a' },
];
const DONE = 3;
const WINDOW_DAYS = 30;
/** Ноцтой үл нийцлийн өнгө (жагсаалтын цэг) */
const MAJOR = '#dc2626';
/** «Багцаар» · «Асуумжаар» баганын өнгө — донатын «Хуваарилсан»-тай ижил */
const BAR_HUE = '#f59e0b';

export type ActionRow = {
  oid: number;
  site: string; pkgK: string; section: string; status: number | null; due: number | null; major: boolean; d: number | null;
  /** Асуумж (`survey`) — 2026-11-02 «Action» фокусын чартуудад */
  survey: string;
  /** Асуулт (HTML цэвэрлэсэн) ба код — давтагдсан үл нийцэл */
  question: string; qCode: string;
  /** «Үл нийцлийн дэлгэрэнгүй мэдээлэл» жагсаалтад (2026-11-03) */
  severity: string; company: string; inspector: string; area: string; comment: string; fixNote: string; photoN: number;
  /** Эх үзлэгийн `globalid` — нэг үзлэгийн бүх үл нийцэл НЭГ цэг дээр (амьд 2026-11-03: 167 мөр · 28 цэг = 28 үзлэг) */
  srcGid: string;
  /** Гүйцэтгэгчийн код (`HABEA.labor.companies[].sfx`) — хуудасны «Компани» шүүлтүүрт (2026-11-03) */
  coSfx: string;
};

/**
 * HSE_Action-ий `company` нь БҮТЭН НЭР («"Хятадын 2 дахь металлурги груп корпорац" ХХК», амьд 2026-11-03) —
 * хуудасны «Компани» шүүлтүүрийн кодтой (`HABEA.labor.companies[].sfx`) түлхүүр үгээр тааруулна.
 */
const CO_RE: [RegExp, string][] = [
  [/металлург/i, 'HHDMGK'],
  [/6-р|зургаа/i, 'HBZIT'],
  [/5-р|тавдугаар/i, 'HBTIT'],
  [/морин\s*сувд/i, 'MSK'],
  [/нутгийн\s*буян/i, 'NBG'],
  [/монкон/i, 'MK'],
  [/професионал/i, 'P'],
  [/mmse|ммсе/i, 'MMSE'],
  [/smart\s*craft/i, 'SC'],
  [/оснааг/i, 'OSNAAG'],
];
const coSfxOf = (name: string): string => CO_RE.find(([re]) => re.test(name))?.[1] ?? '';

const toRow = (r: Row): ActionRow => {
  const site = String(r.site ?? '').trim();
  const st = r.esritask_status;
  const due = r.esritask_duedate;
  return {
    oid: Number(r.objectid) || 0,
    site,
    pkgK: site ? habeaPkgKey(site) : '',
    section: String(r.section ?? '').trim(),
    status: st == null || st === '' ? null : Number(st),
    due: typeof due === 'number' && due > 0 ? due : null,
    major: r.severity_code === 'major',
    d: typeof r.insp_datetime === 'number' && r.insp_datetime > 0 ? r.insp_datetime : null,
    survey: String(r.survey ?? '').trim(),
    question: cleanLabel(String(r.question ?? '')),
    qCode: String(r.q_code ?? '').trim(),
    severity: String(r.severity ?? '').trim(),
    company: String(r.company ?? '').trim(),
    inspector: String(r.inspector ?? '').trim(),
    area: String(r.site_area ?? '').trim(),
    comment: String(r.comment ?? '').trim(),
    fixNote: String(r['үл_нийцэл_арилгасан_тайлбар'] ?? '').trim(),
    photoN: Number(r.photo_count) || 0,
    srcGid: String(r.src_globalid ?? '').trim().toLowerCase(),
    coSfx: coSfxOf(String(r.company ?? '')),
  };
};

/** Асуумжийн нэрийг товчлох: «ХАБЭАБО-н … үзлэг - Барилгын талбай» → «… үзлэг»; «… 2026» → «…» */
const shortSurvey = (s: string): string => s
  .replace(/^ХАБЭАБО-(?:н|ны)\s+/i, '')
  .replace(/\s+-\s+.*$/, '')
  .replace(/\s+\d{4}$/, '')
  .trim();

export const loadActions = cached(async (): Promise<ActionRow[]> => {
  const auth = await getAuth();
  /* ⚠️ 2026-11-02: нэвтрэлт унтраалттай ЛОКАЛ dev-д dev токеноор уншина (`authToken.devToken` — production-д үргэлж null) */
  if (!auth && !devToken()) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
  /* ⚠️ 2026-11-02 (хэрэглэгч: «Action» тусдаа шүүлтүүр): БҮХ асуумжийн ажил (V1.1 · захиалагчийн) — урьд нь зөвхөн
     захиалагчийн маягтынх (`A.survey`) байв; асуумжаар задаргааг «Асуумжаар» чарт харуулна. */
  const rows = await queryFeatures(A.url, {
    where: '1=1',
    outFields: ['objectid', 'site', 'section', 'severity_code', 'esritask_status', 'esritask_duedate', 'insp_datetime', 'survey', 'question', 'q_code',
      'severity', 'company', 'inspector', 'site_area', 'comment', 'үл_нийцэл_арилгасан_тайлбар', 'photo_count', 'src_globalid'],
    orderBy: 'objectid',
  });
  return rows.map(toRow);
}, 5 * 60_000, ['HABEA']);

/* ── Хөндлөн шүүлт ── */

/** Чарт дарж сонгосон утгууд (хэмжээс бүрт олон сонголт; хоосон = бүгд) */
export type ActSel = { status: string[]; survey: string[]; day: string[]; stage: string[] };
export type ActDim = keyof ActSel;
export const NO_ACT_SEL: ActSel = { status: [], survey: [], day: [], stage: [] };
export const ACT_DIMS: ActDim[] = ['status', 'survey', 'day', 'stage'];
export const ACT_DIM_LABEL: Record<ActDim, () => string> = {
  status: () => tr('Төлөв'),
  survey: () => tr('Асуумж'),
  day: () => tr('Өдөр'),
  stage: () => tr('Шатлал'),
};
export const toggleActSel = (s: ActSel, dim: ActDim, key: string): ActSel => ({
  ...s, [dim]: s[dim].includes(key) ? s[dim].filter((v) => v !== key) : [...s[dim], key],
});

const statusKey = (r: ActionRow) => (r.status == null ? '' : String(r.status));
const surveyKey = (r: ActionRow) => shortSurvey(r.survey) || tr('Асуумж заагаагүй');
const dayKey = (r: ActionRow) => (r.d == null ? '' : ubDayKey(r.d));
/** Шатлал — зөвхөн НЭЭЛТТЭЙ мөрт (дууссан нь аль ч шатанд орохгүй); `now`-оос хамаарна */
const stageKey = (r: ActionRow, now: number) =>
  (r.d == null || r.d > now || r.status === DONE ? '' : ESCALATION[stageOf(r.d, now)].key);
const KEY_OF: Record<ActDim, (r: ActionRow, now: number) => string> = {
  status: statusKey, survey: surveyKey, day: dayKey, stage: stageKey,
};

/**
 * Зурагт дарсан цэгийн БҮХ үл нийцэл — нэг үзлэгийнх нэг цэг дээр давхацдаг тул ганц `objectid` биш,
 * тэр мөрийн эх үзлэгийн (`srcGid`) бүх мөр. Эх үзлэггүй бол ганц мөр.
 */
export function pickedRows(rows: readonly ActionRow[], oid: number): ActionRow[] {
  const r = rows.find((x) => x.oid === oid);
  if (!r) return [];
  return r.srcGid ? rows.filter((x) => x.srcGid === r.srcGid) : [r];
}

/** Зурагт дарсан цэгийн чипний утга — огноо · багц · үл нийцлийн тоо */
export function actPickLabel(rows: readonly ActionRow[] | null, oid: number): string {
  const hit = rows ? pickedRows(rows, oid) : [];
  const r = hit[0];
  if (!r) return `#${oid}`;
  return [r.d ? date(r.d) : '', r.site ? tr(habeaPkgLabel(r.site)) : '', tr('{0} үл нийцэл', num(hit.length))]
    .filter(Boolean).join(' · ');
}

/** Зурагт дарсан цэгийн картын мөрүүд (бүх мөр нь нэг үзлэгийнх) */
export function actPickRows(rows: readonly ActionRow[] | null, oid: number): [string, string][] {
  const hit = rows ? pickedRows(rows, oid) : [];
  const r = hit[0];
  if (!r) return [];
  const rowsOut: [string, string][] = [
    [tr('Огноо'), r.d ? date(r.d) : ''],
    [tr('Багц'), r.site ? tr(habeaPkgLabel(r.site)) : ''],
    [tr('Компани'), r.company],
    [tr('Асуумж'), shortSurvey(r.survey)],
    [tr('Үл нийцэл'), num(hit.length)],
  ];
  return rowsOut.filter(([, v]) => v);
}

/** Чипэнд харуулах утгын нэр — төлөвийн кодыг нэрээр */
export function actValueLabel(dim: ActDim, key: string): string {
  if (dim === 'status') return STATUS.find((s) => String(s.code) === key)?.label() ?? key;
  if (dim === 'day') return key.slice(5).replace('-', '.');
  if (dim === 'stage') return ESCALATION.find((x) => x.key === key)?.label() ?? key;
  return key;
}

/**
 * Цонхны (сүүлийн 30 хоног) мөрүүд. Шатлал сонгосон үед цонхгүй (бүх хугацаа) — 4-р шат нь 30 хоногоос хуучин
 * үлдэгдлийг ч агуулдаг тул тэр сонголт бусад чарт, газрын зурагт бүрэн тусна (2026-11-03).
 */
const inWindow = (rows: readonly ActionRow[], now: number, sel?: ActSel, sc?: ActScope) => {
  /* Хуудасны «Огноо» шүүлтүүр сонгосон бол 30 хоногийн оронд ТЭР МУЖ (2026-11-03) */
  if (sc?.days.length) {
    const set = new Set(sc.days);
    return rows.filter((r) => r.d != null && r.d <= now && set.has(ubDayKey(r.d)));
  }
  const from = sel?.stage.length ? -Infinity : now - WINDOW_DAYS * 86_400_000;
  return rows.filter((r) => r.d != null && r.d >= from && r.d <= now);
};

/** Хуудасны шүүлтүүр (зүүн баганын Огноо · Багц · Компани) — хоосон = бүгд */
export type ActScope = { pkgs: readonly string[]; cos: readonly string[]; days: readonly string[] };

/** Багц · компани + сонголтоор шүүх; `skip` — тухайн чартын ӨӨРИЙН хэмжээс (шүүлтэд оруулахгүй) */
const passes = (r: ActionRow, sc: ActScope, sel: ActSel, now: number, skip?: ActDim | 'pkg') =>
  (skip === 'pkg' || !sc.pkgs.length || sc.pkgs.includes(r.pkgK))
  && (!sc.cos.length || sc.cos.includes(r.coSfx))
  && ACT_DIMS.every((d) => d === skip || !sel[d].length || sel[d].includes(KEY_OF[d](r, now)));

/**
 * Газрын зургийн шүүлт — самбарт тоологдсон ЯГ тэр мөрүүд (цонх · багц · сонголт). Мөр ачаалагдаагүй бол `null`.
 */
export function actionWhere(rows: readonly ActionRow[] | null, sc: ActScope, sel: ActSel, now: number): string | null {
  if (!rows) return null;
  const ids = inWindow(rows, now, sel, sc).filter((r) => passes(r, sc, sel, now)).map((r) => r.oid).filter((o) => o > 0);
  return ids.length ? `objectid IN (${ids.join(',')})` : '1=0';
}

/**
 * ХАБЭА-ны шатлал (2026-11-03, хэрэглэгчийн дүрэм) — арилгаагүй үл нийцэл `insp_datetime`-аас хойш:
 * 1-р долоо хоног системд үүснэ · 2-рт талбайн зааварчилгаа · 3-рт сануулах хуудас · 4-рээс хариуцлага тооцно.
 */
const ESCALATION = [
  { key: 'w1', label: () => tr('1-р долоо хоног — системд үүссэн'), hint: () => tr('0–6 хоног'), color: '#3b82f6' },
  { key: 'w2', label: () => tr('2-р долоо хоног — талбайн зааварчилгаа'), hint: () => tr('7–13 хоног'), color: '#f59e0b' },
  { key: 'w3', label: () => tr('3-р долоо хоног — сануулах хуудас'), hint: () => tr('14–20 хоног'), color: '#f97316' },
  { key: 'w4', label: () => tr('4-р долоо хоног — хариуцлага тооцох'), hint: () => tr('21+ хоног'), color: '#dc2626' },
];
/** Үзлэгийн огнооноос өнгөрсөн бүтэн хоногоор шатны индекс (0–3) */
const stageOf = (d: number, now: number) => Math.min(3, Math.max(0, Math.floor((now - d) / 86_400_000 / 7)));

/** Түлхүүрээр бүлэглэж нийт · ноцтой · нээлттэйг тоолно (их нь эхэнд) */
function tally(rows: ActionRow[], keyOf: (r: ActionRow) => string) {
  const m = new Map<string, { total: number; major: number; open: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = m.get(k) ?? { total: 0, major: 0, open: 0 };
    cur.total += 1;
    if (r.major) cur.major += 1;
    if (r.status != null && r.status !== DONE) cur.open += 1;
    m.set(k, cur);
  }
  return [...m.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'mn', { numeric: true }));
}

/** Зөвхөн нийт тоо — зэрэглэл/төлөвөөр задлахгүй (2026-11-03, хэрэглэгч: «ямар ч төрөлгүй, нийтээр нь») */
const totalBar = (key: string, label: string, v: { total: number }) => ({ key, label, value: v.total, display: num(v.total) });

/* ── Дэлгэрэнгүй жагсаалт (2026-11-03; «Ослын дэлгэрэнгүй мэдээлэл»-ийн загвараар) ── */

type Photo = { id: number; name: string; type?: string };
const photoCache = new Map<number, Promise<Photo[]>>();
register(() => photoCache.clear(), ['HABEA']);
const loadPhotos = (oid: number): Promise<Photo[]> => {
  let p = photoCache.get(oid);
  if (!p) {
    p = arcgisPost<{ attachmentInfos?: { id: number; contentType?: string; name?: string }[] }>(`${A.url}/${oid}/attachments`, { f: 'json' })
      .then((j) => (j.attachmentInfos ?? [])
        .filter((a) => rasterTypeOf(a.contentType) != null)
        .map((a) => ({ id: a.id, name: a.name ?? tr('Зураг {0}', a.id), type: a.contentType })));
    p.catch(() => photoCache.delete(oid));
    photoCache.set(oid, p);
  }
  return p;
};

/** Үл нийцлийн хавсаргасан зургууд — задлахад л татна */
function ActPhotos({ oid }: { oid: number }) {
  const q = useAsync<Photo[]>(() => loadPhotos(oid), [oid]);
  if (q.state === 'loading') return <div className={h.photoNote}>{tr('Зураг шалгаж байна…')}</div>;
  if (q.state === 'error') return <div className={h.photoNote} role="alert">{tr('Зураг татагдсангүй')}</div>;
  if (!q.data.length) return null;
  return (
    <div className={h.photos}>
      {q.data.map((p) => (
        <AttPhoto key={p.id} url={`${A.url}/${oid}/attachments/${p.id}`} alt={p.name} title={p.name} name={p.name} type={p.type} />
      ))}
    </div>
  );
}

const LIST_N = 6;
/** Тогтмол хоосон массив — анхдагч проп нь рендер бүрд шинэ лавлагаа үүсгэж memo-г хөдөлгөхгүй */
const NONE: readonly string[] = [];

/** Шүүлтэд орсон үл нийцлүүд — шинэ нь эхэнд; мөр дарж задлана */
function ActionList({ rows, openOid = null }: { rows: ActionRow[]; openOid?: number | null }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(openOid);
  /** Эрэмбэ — шинэ нь эхэнд (анхдагч) / хуучин нь эхэнд */
  const [oldFirst, setOldFirst] = useState(false);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (oldFirst ? (a.d ?? 0) - (b.d ?? 0) : (b.d ?? 0) - (a.d ?? 0))),
    [rows, oldFirst],
  );
  const sortBtn = (
    <button type="button" className={h.linkBtn} onClick={() => setOldFirst((v) => !v)}
      title={oldFirst ? tr('Шинэ нь эхэндээ болгох') : tr('Хуучин нь эхэндээ болгох')}>
      {oldFirst ? tr('↑ хуучин нь эхэнд') : tr('↓ шинэ нь эхэнд')}
    </button>
  );
  const shown = all ? sorted : sorted.slice(0, LIST_N);
  return (
    <Section
      title={tr('Үл нийцлийн дэлгэрэнгүй мэдээлэл')}
      note={sorted.length > LIST_N
        ? (
          <>
            {sortBtn}{' · '}
            {tr('{0}/{1}', num(shown.length), num(sorted.length))}{' · '}
            <button type="button" className={h.linkBtn} onClick={() => setAll((v) => !v)}>
              {all ? tr('цөөнийг харах') : tr('бүгдийг харах')}
            </button>
          </>
        )
        : sorted.length > 1 ? sortBtn : tr('дарж дэлгэрэнгүй')}
    >
      {shown.length ? shown.map((x) => {
        const on = open === x.oid;
        const stS = STATUS.find((s) => s.code === x.status);
        return (
          <div key={x.oid} className={h.incident}>
            <button type="button" className={h.incHead} aria-expanded={on} onClick={() => setOpen(on ? null : x.oid)}>
              <i className={h.incDot} style={{ background: x.major ? MAJOR : '#f59e0b' }} />
              <span className={h.incType}>{x.question || x.qCode || '—'}</span>
              <span className={h.incDate}>{x.d ? date(x.d) : tr('огноогүй')}</span>
            </button>
            <div className={h.incSub}>
              {[x.site ? tr(habeaPkgLabel(x.site)) : '', shortSurvey(x.survey), stS ? stS.label() : tr('Төлөв тодорхойгүй')].filter(Boolean).join(' · ')}
            </div>
            {on && (
              <div className={h.incBody}>
                {x.severity && <p><b>{tr('Зэрэглэл:')}</b> {x.severity}</p>}
                {x.section && <p><b>{tr('Хэсэг:')}</b> {x.section}</p>}
                {x.area && <p><b>{tr('Байршил:')}</b> {x.area}</p>}
                {x.company && <p><b>{tr('Компани:')}</b> {x.company}</p>}
                {x.inspector && <p><b>{tr('Шалгагч:')}</b> {x.inspector}</p>}
                {x.due != null && <p><b>{tr('Дуусах хугацаа:')}</b> {date(x.due)}</p>}
                {x.comment && <p><b>{tr('Тайлбар:')}</b> {x.comment}</p>}
                {x.fixNote && <p><b>{tr('Арилгасан тайлбар:')}</b> {x.fixNote}</p>}
                <ActPhotos oid={x.oid} />
              </div>
            )}
          </div>
        );
      }) : <Empty label={tr('Бүртгэл алга')} />}
    </Section>
  );
}

/**
 * «Үл нийцлийн мэдээлэл» фокусын чартууд (2026-11-02). `part` — аль хэсэгт:
 *   left  → төлөвөөр (донат — ажлын урсгалын шат) · багцаар
 *   right → асуумжаар · дэлгэрэнгүй жагсаалт
 *   fin   → өдрөөр (цуваа)
 * Ачаалагч нэг (`loadActions` кэштэй) тул гурван хэсэг нэг л хүсэлт.
 */
export function HseActionPanel({ part, pkgs, cos = NONE, days = NONE, onPkg, sel, onSel, now, tick, pickOid = 0, scope = null }: {
  part: 'left' | 'right' | 'fin';
  /** Хуудасны «Багц» шүүлт (`habeaPkgKey`) — хоосон = бүгд */
  pkgs: string[];
  /** Хуудасны «Компани» шүүлт (`sfx`) — хоосон = бүгд */
  cos?: readonly string[];
  /** Хуудасны «Огноо» шүүлт — өдрийн түлхүүрүүд (`ubDayKey`); өгвөл 30 хоногийн цонхыг орлоно */
  days?: readonly string[];
  onPkg: (key: string) => void;
  /** Чартын хөндлөн шүүлт (`Habea`-ийн төлөв) */
  sel: ActSel;
  onSel: (dim: ActDim, key: string) => void;
  /** Хугацаа хэтэрсэн эсэхийн цаг — дуудагчийн `now` (render-ийн `Date.now()` биш) */
  now: number;
  /** Хуудасны давтан шинэчлэлийн тоолуур (`Habea`-ийн `tick`, HABEA_POLL_MS) */
  tick: number;
  /** Газрын зурагт дарсан цэгийн `objectid` (0 = сонголтгүй) — бүх чарт тэр цэгийн (эх үзлэгийн) бүх үл нийцлээр (`pickedRows`) */
  pickOid?: number;
  /** ХАБЭА харах хүрээ (`habeaScope`) — `null` = бүх багц. «Багцаар» чарт өөрийн сонголтоор шүүгддэггүй тул мөрийг эндээс хязгаарлана */
  scope?: readonly string[] | null;
}) {
  const st = useAsync(() => loadActions(), [tick], { keepOn: [tick] });

  const view = useMemo(() => {
    if (st.state !== 'ready') return null;
    const scoped = scope ? st.data.filter((r) => scope.includes(r.pkgK)) : st.data;
    const data = pickOid ? pickedRows(scoped, pickOid) : scoped;
    const sc: ActScope = { pkgs, cos, days };
    const all = inWindow(data, now, sel, sc);
    /** Тухайн чартын мөрүүд — өөрийн хэмжээсээс бусад бүх шүүлтээр */
    const rowsFor = (skip?: ActDim | 'pkg') => all.filter((r) => passes(r, sc, sel, now, skip));
    const rows = rowsFor();
    const major = rows.filter((r) => r.major).length;

    /* Төлөв (донат) — ажлын урсгалын бүх шат (0 ч гэсэн): хаана гацаж буйг харуулна; төлөвгүй мөр тусдаа */
    const stRows = rowsFor('status');
    const doneN = rows.filter((r) => r.status === DONE).length;
    const knownN = rows.filter((r) => r.status != null).length;
    const stItem = (key: string, label: string, color: string, n: number, mj: number) => ({
      key, label, value: n, color,
      display: mj > 0 ? `${num(n)} · ${tr('ноцтой {0}', num(mj))}` : num(n),
    });
    const status = STATUS.map((s) => {
      const hit = stRows.filter((r) => r.status === s.code);
      return stItem(String(s.code), s.label(), s.color, hit.length, hit.filter((r) => r.major).length);
    }).filter((it) => it.key !== '0' || it.value > 0); // «Хуваарилаагүй» — хэрэглэгддэггүй шат (амьд 2026-11-03: 0), байвал л харуулна
    const unk = stRows.filter((r) => r.status == null);
    if (unk.length) status.push(stItem('', tr('Төлөв тодорхойгүй'), '#cbd5e1', unk.length, unk.filter((r) => r.major).length));

    /* Багцаар — ӨӨРИЙН сонголтоор шүүгдэхгүй */
    const pkgLabel = new Map<string, string>();
    for (const r of all) if (r.pkgK && !pkgLabel.has(r.pkgK)) pkgLabel.set(r.pkgK, tr(habeaPkgLabel(r.site)));
    const pkgBars = tally(rowsFor('pkg').filter((r) => r.pkgK), (r) => r.pkgK)
      .map(([key, v]) => totalBar(key, pkgLabel.get(key) ?? key, v));

    const surveyBars = tally(rowsFor('survey'), surveyKey)
      .map(([key, v]) => totalBar(key, key, v));

    /* Өдрөөр — Улаанбаатарын хуанлиар (`ubDayKey`), зөвхөн ажилтай өдрүүд (`habeaUzleg.byDay`-ийн дүрэм) */
    const byDay = new Map<string, number>();
    for (const r of rowsFor('day')) { const k = dayKey(r); if (k) byDay.set(k, (byDay.get(k) ?? 0) + 1); }
    const daySeries = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ key, label: key.slice(5).replace('-', '.'), value, display: num(value) }));
    /* Шатлал — НЭЭЛТТЭЙ үл нийцэл үзлэгийн огнооноос хэд дэх долоо хоногтоо (30 хоногийн цонхоор БИШ — 4-р шат
       нь хуучин үлдэгдлийг ч хамарна; өдрийн сонголтыг үл тооно, өөрийн сонголтоор шүүгдэхгүй) */
    const noDay = { ...sel, day: [] };
    const daySet = days.length ? new Set(days) : null;
    const open = data.filter((r) => r.d != null && r.d <= now && r.status !== DONE
      && (!daySet || daySet.has(ubDayKey(r.d))) && passes(r, sc, noDay, now, 'stage'));
    const stageN = ESCALATION.map(() => 0);
    for (const r of open) stageN[stageOf(r.d ?? now, now)] += 1;
    const stageBars = ESCALATION.map((s, i) => ({
      key: s.key, label: s.label(), value: stageN[i], color: s.color,
      display: open.length ? `${num(stageN[i])} · ${pct((stageN[i] / open.length) * 100, 0)}` : num(stageN[i]),
      hint: s.hint(),
    }));
    return { rows, total: rows.length, major, known: knownN, done: doneN, status, pkgBars, surveyBars, daySeries, stageBars, openN: open.length };
  }, [st, pkgs, cos, days, sel, now, pickOid, scope]);

  if (st.state === 'loading') return <Section title={tr('Үл нийцлийн арилгалт')}><Loading /></Section>;
  if (st.state === 'error') {
    return (
      <Section title={tr('Үл нийцлийн арилгалт')}>
        <Empty label={tr('Татагдсангүй: {0}', friendlyError(st.error))} />
      </Section>
    );
  }
  if (!view) return null;

  const donePct = view.known > 0 ? (view.done / view.known) * 100 : null;
  /** Хамрах хугацааны тайлбар — «Огноо» шүүлтүүр сонгосон бол тэр муж, эс бөгөөс 30 хоногийн цонх */
  const span = days.length ? tr('сонгосон хугацаа') : tr('сүүлийн {0} хоног', num(WINDOW_DAYS));
  if (part === 'right') {
    return (
      <>
        <Section title={tr('Асуумжаар — үл нийцэл')}>
          {view.surveyBars.length
            ? <Bars items={view.surveyBars} color={BAR_HUE} selected={sel.survey} onSelect={(k) => onSel('survey', k)} />
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        <ActionList key={pickOid} rows={view.rows} openOid={pickOid && view.rows.length === 1 ? pickOid : null} />
      </>
    );
  }
  if (part === 'fin') {
    return (
      <>
        <Section title={tr('Үл нийцэл — өдрөөр')} note={span} fill>
          {view.daySeries.length
            ? (
              <div className={`${h.dayScroll} ${h.dayScrollFill}`}>
                <div>
                  <Series items={view.daySeries} color={BAR_HUE} height={110} unit={tr('ажил')} line showValues grow
                    selected={sel.day} onSelect={(k) => onSel('day', k)} />
                </div>
              </div>
            )
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        <Section title={tr('Нээлттэй үл нийцэл — шатлалаар')} note={tr('үзлэгийн огнооноос · нээлттэй {0}', num(view.openN))}>
          {view.openN
            ? <Bars items={view.stageBars} selected={sel.stage} onSelect={(k) => onSel('stage', k)} />
            : <Empty label={tr('Нээлттэй үл нийцэл алга')} />}
        </Section>
      </>
    );
  }
  return (
    <>
      <Section
        title={tr('Үл нийцэл — төрлөөр')}
        note={`${span} · ${donePct == null ? tr('ноцтой {0}', num(view.major)) : tr('{0} дууссан', pct(donePct, 0))}`}
        tone="primary"
      >
        {view.total > 0
          ? (
            <Donut items={view.status} size="md" center={num(view.total)} centerLabel={tr('үл нийцэл')}
              selected={sel.status} onSelect={(k) => onSel('status', k)} />
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section title={tr('Багцаар — үл нийцэл')} note={view.pkgBars.length ? tr('дарж шүүнэ') : undefined}>
        {view.pkgBars.length
          ? <Bars items={view.pkgBars} color={BAR_HUE} selected={pkgs} onSelect={onPkg} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
    </>
  );
}

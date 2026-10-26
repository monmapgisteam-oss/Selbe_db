'use client';

/**
 * НООРОГ — ЭХ ХУУДАСНЫ БҮТЦЭЭР, 191-д: ENTERPRISE ДЭЭРХ УНШИЛТ/БИЧИЛТ (2026-10-26).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн эцсийн шийдвэр): БҮХ ноорог (гүйцэтгэл · илгээлт · хуваарь) ОДОО БАЙГАА `GU_Selbe_Guitsetgel_Draft`
 *    (`Guitsetgel_talbe/191`) хүснэгтэд, эх хуудасны баганын нэрээр, ажил × блок бүрд нэг мөр (`draftRows.ts`-ийн толгой).
 *    Тусдаа `Huvaari_noorog` үйлчилгээ (3 хүснэгт) ХАСАГДСАН. Энэ модуль зөвхөн сүлжээ: багана бэлэн эсэх (`rowsReady`),
 *    хувилбар (`*ReadAt` — нэг статистикийн асуулга), зураг (бүтэн/өөрчлөлтийн уншилт), дифф бичилт (≤500, толгой СҮҮЛД),
 *    хуучин JSON-ыг шингээх, илгээлтийн мөр (MVCC), админы шилжүүлэлт/тулгалт/цэвэрлэлт.
 * ⚠️ БАГАНА НЭМЭХИЙГ КОД ХЭЗЭЭ Ч ХИЙХГҮЙ — хэрэглэгч notebook (`notebook_draft191.py`)-оор. Багана бүрэн биш бол ХУУЧИН JSON
 *    горим (`blob`) өнөөгийнхөөрөө; notebook ажилласнаас хойш ≤5 мин-д хуудас дахин ачаалалгүй шилжинэ (`rowsReady`).
 * ⚠️ ENTERPRISE-ИЙН ЗАНГА (CLAUDE.md): алдаа HTTP 200 + `{error}` (`arcgisPost` шиднэ; мөр бүрийн `success`-ийг ЭНД шалгана) ·
 *    2000 мөрийн хуудаслалт `orderByFields=objectid` · applyEdits ≤ 500 · `rollbackOnFailure` НЭГ хэсэг дотор · талбарын нэр
 *    Enterprise-ийн ЖИЖИГ үсгээр (кирилл ч) · `where`-д ЗӨВХӨН латин багана (`dkey` · `pkg` · `mur_turul` · `noorog_turul` ·
 *    `last_edited_date`) — кирилл баганаар ХЭЗЭЭ Ч шүүхгүй.
 * ⚠️ ХУВИЛБАР = СЕРВЕРИЙН ЦАГ: `max(last_edited_date)` (мс, клиентийн цагаас үл хамаарна) — хамтрагчийн аль ч бичилт (толгойг
 *    дарсан ч) хувилбарыг өөрчилнө, тиймээс CAS/бичсэний дараах баталгаа ХЭРЭГГҮЙ: бичилт зөвхөн ӨӨРИЙН өөрчилсөн бүлгийг
 *    илгээж, дараагийн мөчлөг бусдынхыг нийлүүлнэ.
 */

import { arcgisPost } from '@/lib/query';
import { draftWriteLocked, tableUrl, type RemoteDraftRead, type RemoteSaveResult } from '@/lib/draftRemote';
import { currentUser } from '@/lib/who';
import { t as tr } from '@/lib/i18nCore';
import {
  HD_DEL_TTL, merge as hdMerge, parse as hdParse, sig as hdSig, monthsVal, resVal, kA, kH, kM, kN, kR, kS, sameVal,
  type HDDraft, type HDEntries, type HDEntry, type HDKind, type HDRowKey,
} from '@/lib/huvaariDraft';
import { mergeDrafts, parseDraft, type Draft } from '@/modules/sheet/fill/draft';
import {
  absorbPerf, absorbPlan, buildFrame, COL, diffRows, KEY_MAX, groupsOf, seriesKey, gcCandidates, hsubDkey, perfDkey, perfFromRows, perfToRows,
  planDkeyOfLegacy, planFromRows, planToRows, ROW_FIELDS, ROW_TTL, ROW_VERSION, sameSubRow, stampRow, stampWant, subDkey, unitOf, viewOf,
  type Attrs, type Frame, type FrameRow, type NKind, type Op, type PlanCtx, type Stamps, type Want,
} from '@/lib/draftRows';
import type { PlanPayload } from '@/lib/huvaariBatlah';

/**
 * ⚠️ БУЦААХ ТУГ — `false` бол багана байсан ч ХУУЧИН JSON горим (схем өөрчлөхгүйгээр буцаах deploy). Шинэ GitHub Variable
 *    нэмэхгүй (CLAUDE.md — жагсаалт тогтмол).
 */
export const DRAFT_ROWS_ENABLED = true;

/** Нэг applyEdits хэсгийн дээд засвар (CLAUDE.md: 500) */
const CHUNK = 500;
/** Бүтэн уншилтын давтамж — устгагдсан мөрийг зургаас арилгана */
const FULL_EVERY = 5 * 60_000;
/** Өөрчлөлтийн курсорын нөөц — бичилтийн хоцрогдол/транзакц */
const DELTA_SLACK = 120_000;
/** Баганын шалгалтын кэш — «байхгүй» 5 мин (notebook-ийн дараа дахин ачаалалгүй шилжинэ) */
const PROBE_TTL = 5 * 60_000;
/** Хувилбарын кэш — `readAt` → `read` дараалалд дахин асуухгүй */
const VER_TTL = 1_500;
/** Илгээлтийн баталгаажаагүй (тасалдсан) үеийн мөр — GC-ийн хугацаа (`submission.ARCHIVING_TTL_MS`-тэй ижил) */
const ORPHAN_TTL = 15 * 60_000;

/* ══════════════ Тээвэр — тестэд солигдоно ══════════════ */
type Post = (url: string, params: Record<string, string>) => Promise<unknown>;
let post: Post = (url, params) => arcgisPost(url, params);
let urlOverride: string | null | undefined;
let meOverride: string | null | undefined;
/** Хуучин (`<багц>` · `plan:%`) JSON мөрийн уншигч — тестэд солигдоно */
type PendIO = (pkgKey: string) => Promise<{ plan: { oid: number; author: string; authorSent: number | null } | null; geree: { oid: number; author: string; authorSent: number | null } | null }>;
let pendingIO: PendIO | null = null;
type PayloadIO = (oid: number) => Promise<PlanPayload | null>;
let payloadIO: PayloadIO | null = null;
/** ⚠️ ЗӨВХӨН тест (`draftRows.check.mjs`): хуурамч тээвэр · хүснэгтийн хаяг · нэвтэрсэн хэрэглэгч · зургийн сан (хоёр «клиент») */
export function rowsTestHooks(p: {
  post?: Post; url?: string | null; me?: string | null; imgs?: Map<string, unknown>; reset?: boolean;
  pending?: PendIO | null; payload?: PayloadIO | null;
}): void {
  if (p.post) post = p.post;
  if (p.url !== undefined) urlOverride = p.url;
  if (p.me !== undefined) meOverride = p.me;
  if (p.imgs) imgs = p.imgs as Map<string, Img>;
  if (p.pending !== undefined) pendingIO = p.pending;
  if (p.payload !== undefined) payloadIO = p.payload;
  if (p.reset) { probe = null; syncSeen.clear(); }
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const tsSql = (ms: number) => `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;
const errText = (e: unknown): string => String((e as Error)?.message ?? e);
const me = (): string | null => (meOverride !== undefined ? meOverride : (currentUser() ?? '').trim().toLowerCase() || null);
const LOCKED = () => tr('систем хаалттай эсвэл эрх түгжигдсэн — ноорог зөвхөн энэ хөтчид, нээгдмэгц хуулагдана');

async function layerUrl(): Promise<string | null> {
  if (urlOverride !== undefined) return urlOverride;
  return tableUrl(false);
}

/* ══════════════ Багана бэлэн эсэх (fallback) ══════════════ */

export type RowsMode = 'rows' | 'blob' | 'wait';
let probe: { at: number; p: Promise<{ mode: RowsMode; why?: string }> } | null = null;

/**
 * 191-д notebook-ийн 42 багана БҮГД (нэр ЯГ — кирилл ч) байна уу — сешнд нэг удаа, «байхгүй» бол 5 мин тутам дахин.
 *   · бүгд бий → `rows`; аль нь ч алга → `blob` (өнөөгийн JSON зам ӨӨРЧЛӨГДӨХГҮЙ);
 *   · ХАГАС (зарим нь алга/нэр өөрчлөгдсөн) → `blob` + `console.error` (ХЭЗЭЭ Ч холихгүй);
 *   · сүлжээний алдаа → `wait` (локал хуулбар, дахин оролдоно).
 * ⚠️ Багана устдаггүй тул `rows` → `blob` буцах зам хамгаалах шаардлагагүй (`rows` сешн даяар кэшлэгдэнэ).
 */
export async function rowsReady(force = false): Promise<{ mode: RowsMode; why?: string }> {
  if (!DRAFT_ROWS_ENABLED) return { mode: 'blob' };
  /* Node (нэгж тест · `tools/`) — тестийн тээвэр (`rowsTestHooks`) тавиагүй бол ХЭЗЭЭ Ч сүлжээ рүү асуухгүй (хуучин зан) */
  if (typeof window === 'undefined' && urlOverride === undefined) return { mode: 'blob' };
  const now = Date.now();
  if (!force && probe) {
    const r = await probe.p;
    if (r.mode === 'rows' || (r.mode === 'blob' && now - probe.at < PROBE_TTL)) return r;
  }
  const p = (async (): Promise<{ mode: RowsMode; why?: string }> => {
    const url = await layerUrl().catch(() => null);
    if (!url) return { mode: 'wait', why: tr('ноорогийн хүснэгт олдсонгүй') };
    let meta: { fields?: { name?: string }[] };
    try {
      meta = (await post(url, {})) as typeof meta;
    } catch (e) {
      return { mode: 'wait', why: errText(e) };
    }
    const have = new Set((meta.fields ?? []).map((f) => String(f.name ?? '')));
    const miss = ROW_FIELDS.filter((f) => !have.has(f));
    if (!miss.length) return { mode: 'rows' };
    if (miss.length < ROW_FIELDS.length) {
      console.error('[selbe] 191-ийн ноорогийн багана ДУТУУ/нэр зөрсөн — JSON горимоор үргэлжилнэ:', miss.join(', '));
    }
    return { mode: 'blob', why: tr('ноорогийн багана нэмэгдээгүй ({0} дутуу)', String(miss.length)) };
  })();
  probe = { at: now, p };
  const r = await p;
  if (r.mode === 'wait') probe = null;
  return r;
}

/* ══════════════ Зураг (сервер дээрх мөрийн санах ойн хуулбар) — ноорог бүрд ══════════════ */
type Ver = { ver: number | null; edit: number; legacyAt: number | null; huuchin: number | null; created: number | null; rows: number };
type Img = {
  rows: Map<number, Attrs>;
  stamps: Map<string, Stamps>;
  /** Hook-д БУЦААСАН (эсвэл бидний бичсэн) түлхүүр — ЗӨВХӨН эдгээрийг цэвэрлэж/устгаж болно (уншаагүйг хөндөхгүй) */
  seen: Set<string>;
  loaded: boolean;
  fullAt: number;
  mark: number;
  needFull: boolean;
  ver: { at: number; v: Ver } | null;
  /** Сүүлийн уншилтад шингээсэн хуучин JSON-ы агшин — дараагийн бичилтэд толгойн `huuchin_at` */
  legacyAt: number;
  stale: Map<number, { id: string; des: number | null; no: string; work: string; path?: string; occ?: number; occN?: number }>;
};
let imgs = new Map<string, Img>();
const imgOf = (dkey: string): Img => {
  let x = imgs.get(dkey);
  if (!x) {
    x = { rows: new Map(), stamps: loadStamps(dkey), seen: new Set(), loaded: false, fullAt: 0, mark: 0, needFull: false, ver: null, legacyAt: 0, stale: new Map() };
    imgs.set(dkey, x);
  }
  return x;
};

/* ── Бүлгийн агшны localStorage хуулбар — офлайн хуулбар өдрийн дараа ч зөв нийлнэ (`stampRow`-ийн ⚠️) ── */
const ST_PREFIX = 'selbe-draftrows-st:';
function loadStamps(dkey: string): Map<string, Stamps> {
  try {
    if (typeof localStorage === 'undefined') return new Map();
    const raw = localStorage.getItem(ST_PREFIX + dkey);
    const o = raw ? JSON.parse(raw) as Record<string, Stamps> : null;
    return o && typeof o === 'object' ? new Map(Object.entries(o)) : new Map();
  } catch { return new Map(); }
}
function saveStamps(dkey: string, img: Img): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys = new Set([...img.rows.values()].map((a) => String(a[COL.key] ?? '')));
    const o: Record<string, Stamps> = {};
    let n = 0;
    for (const [k, v] of img.stamps) { if (keys.has(k) && n < 6000) { o[k] = v; n += 1; } }
    localStorage.setItem(ST_PREFIX + dkey, JSON.stringify(o));
  } catch { /* сан дүүрсэн — агшин санах ойд л */ }
}

/** `mur_key` → биет мөрүүд (OBJECTID өсөхөөр) */
function byKey(img: Img): Map<string, Attrs[]> {
  const m = new Map<string, Attrs[]>();
  for (const a of [...img.rows.values()].sort((x, y) => (num(x.objectid) ?? 0) - (num(y.objectid) ?? 0))) {
    const k = typeof a[COL.key] === 'string' ? a[COL.key] as string : '';
    if (!k) continue;
    const l = m.get(k);
    if (l) l.push(a); else m.set(k, [a]);
  }
  return m;
}

const READ_FIELDS = ['objectid', 'last_edited_date', 'created_date', COL.dkey, COL.usr, COL.pkg, COL.at, ...ROW_FIELDS];

/** Хуудаслалттай асуулга — `orderByFields=objectid` ЗААВАЛ (давхардсан/алдагдсан мөргүй) */
async function queryAll(url: string, where: string, fields: readonly string[]): Promise<Attrs[]> {
  const out: Attrs[] = [];
  let off = 0;
  for (;;) {
    const j = (await post(`${url}/query`, {
      where, outFields: fields.join(','), orderByFields: 'objectid ASC', returnGeometry: 'false',
      resultOffset: String(off), resultRecordCount: '2000',
    })) as { features?: { attributes?: Attrs }[]; exceededTransferLimit?: boolean };
    const fs = j.features ?? [];
    for (const f of fs) if (f.attributes) out.push(f.attributes);
    if (!fs.length || (fs.length < 2000 && !j.exceededTransferLimit)) break;
    off += fs.length;
    if (off > 400_000) throw new Error(tr('Ноорогийн мөр хэт олон'));
  }
  return out;
}

/**
 * ХУВИЛБАР — НЭГ статистикийн асуулга (`dkey`-ээр бүлэглэсэн): шинэ мөрүүдийн `max(last_edited_date)` (серверийн цаг) +
 * хуучин JSON мөрийн `at` + толгойн `huuchin_at` + анхны үүсгэсэн агшин (шилжүүлсэн агшин). Хуучин JSON шингээгдээгүй бол
 * хувилбарт бутархай нэмнэ — hook түүнийг «өөрчлөгдсөн» гэж уншина.
 */
async function readVer(url: string, dkey: string, legacyKey: string | null): Promise<Ver> {
  const keys = legacyKey ? [dkey, legacyKey] : [dkey];
  const j = (await post(`${url}/query`, {
    where: `${COL.dkey} IN (${keys.map(q).join(', ')})`,
    groupByFieldsForStatistics: COL.dkey,
    outStatistics: JSON.stringify([
      { statisticType: 'max', onStatisticField: 'last_edited_date', outStatisticFieldName: 'm_ed' },
      { statisticType: 'max', onStatisticField: COL.at, outStatisticFieldName: 'm_at' },
      { statisticType: 'max', onStatisticField: COL.legacy, outStatisticFieldName: 'm_hu' },
      { statisticType: 'min', onStatisticField: 'created_date', outStatisticFieldName: 'm_cr' },
      { statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'm_n' },
    ]),
    returnGeometry: 'false',
  })) as { features?: { attributes?: Attrs }[] };
  let edit = 0; let legacyAt: number | null = null; let huuchin: number | null = null; let created: number | null = null; let rows = 0;
  for (const f of j.features ?? []) {
    const a = f.attributes ?? {};
    if (a[COL.dkey] === dkey) {
      edit = num(a.m_ed) ?? 0; huuchin = num(a.m_hu); created = num(a.m_cr); rows = num(a.m_n) ?? 0;
    } else if (legacyKey && a[COL.dkey] === legacyKey) legacyAt = num(a.m_at);
  }
  const pend = legacyAt != null && legacyAt > (huuchin ?? 0);
  const ver = rows ? edit + (pend ? ((legacyAt as number) % 997 + 1) / 2000 : 0) : legacyAt;
  return { ver, edit, legacyAt, huuchin, created, rows };
}

async function verOf(url: string, dkey: string, legacyKey: string | null, fresh = false): Promise<Ver> {
  const img = imgOf(dkey);
  if (!fresh && img.ver && Date.now() - img.ver.at < VER_TTL) return img.ver.v;
  const v = await readVer(url, dkey, legacyKey);
  img.ver = { at: Date.now(), v };
  return v;
}

/** Зургийг ачаална — бүтэн эсвэл өөрчлөлтийн курсороор; бүлгийн агшныг (`stampRow`) шинэчилнэ */
async function loadImg(url: string, dkey: string, kind: NKind, full: boolean): Promise<Img> {
  const img = imgOf(dkey);
  const delta = !full && img.loaded && !img.needFull && img.mark > 0 && Date.now() - img.fullAt < FULL_EVERY;
  const base = `${COL.dkey} = ${q(dkey)}`;
  const where = delta ? `${base} AND last_edited_date >= ${tsSql(img.mark - DELTA_SLACK)}` : base;
  const got = await queryAll(url, where, READ_FIELDS);
  if (!delta) img.rows = new Map();
  let mark = delta ? img.mark : 0;
  for (const a of got) {
    const oid = num(a.objectid);
    if (oid == null) continue;
    const e = num(a.last_edited_date);
    if (e != null && e > mark) mark = e;
    img.rows.set(oid, a);
  }
  img.mark = mark;
  img.loaded = true;
  if (!delta) { img.fullAt = Date.now(); img.needFull = false; }
  /* Бүлгийн агшин — давхардлыг нийлүүлсэн харагдацаар */
  for (const [k, a] of viewOf(img.rows.values(), kind)) img.stamps.set(k, stampRow(img.stamps.get(k), a, groupsOf(kind, String(a[COL.turul] ?? ''), k)));
  saveStamps(dkey, img);
  return img;
}

/* ══════════════ Бичих — хэсэглэлт (≤500, нэгж бүтэн, толгой СҮҮЛД) ══════════════ */

type EditRes = { success?: boolean; objectId?: number; error?: { code?: number; description?: string } | null };
type ApplyRes = { addResults?: EditRes[]; updateResults?: EditRes[]; deleteResults?: EditRes[] };

function chunksOf(ops: Op[], tail: Op | null): Op[][] {
  const units = new Map<string, Op[]>();
  for (const o of ops) { const l = units.get(o.unit); if (l) l.push(o); else units.set(o.unit, [o]); }
  const out: Op[][] = [];
  let cur: Op[] = [];
  for (const u of units.values()) {
    if (cur.length && cur.length + u.length > CHUNK) { out.push(cur); cur = []; }
    /* ⚠️ Нэг нэгж (сарын цуваа) 500-аас их бол хуваагдана — ховор (22 блок × 24 сар) */
    for (let i = 0; i < u.length; i += CHUNK) {
      const part = u.slice(i, i + CHUNK);
      if (cur.length && cur.length + part.length > CHUNK) { out.push(cur); cur = []; }
      cur.push(...part);
    }
  }
  if (tail) { if (cur.length >= CHUNK) { out.push(cur); cur = []; } cur.push(tail); }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Нэг applyEdits хэсэг (давхаргын түвшин, `rollbackOnFailure`) — мөр БҮРИЙН `success`-ийг шалгана (алдаа 200-аар ирдэг);
 * амжилттай бол зургийг шинэчилнэ (нэмэлт → OBJECTID).
 */
async function sendChunk(url: string, img: Img | null, ops: Op[], rollback = true): Promise<{ ok: true; added: number[] } | { ok: false; error: string }> {
  const adds = ops.filter((o): o is Extract<Op, { op: 'add' }> => o.op === 'add');
  const ups = ops.filter((o): o is Extract<Op, { op: 'update' }> => o.op === 'update');
  const dels = ops.filter((o): o is Extract<Op, { op: 'delete' }> => o.op === 'delete');
  if (!adds.length && !ups.length && !dels.length) return { ok: true, added: [] };
  const params: Record<string, string> = { rollbackOnFailure: rollback ? 'true' : 'false' };
  if (adds.length) params.adds = JSON.stringify(adds.map((o) => ({ attributes: o.a })));
  if (ups.length) params.updates = JSON.stringify(ups.map((o) => ({ attributes: { objectid: o.oid, ...o.a } })));
  if (dels.length) params.deletes = dels.map((o) => o.oid).join(',');
  let r: ApplyRes;
  try {
    r = (await post(`${url}/applyEdits`, params)) as ApplyRes;
  } catch (e) {
    if (img) img.needFull = true;
    return { ok: false, error: errText(e) };
  }
  const ar = r.addResults ?? [];
  const ur = r.updateResults ?? [];
  const dr = r.deleteResults ?? [];
  if (ar.length !== adds.length || ur.length !== ups.length || dr.length !== dels.length) {
    if (img) img.needFull = true;
    return { ok: false, error: tr('ArcGIS бичилтийн үр дүн дутуу') };
  }
  const bad = [...ar, ...ur, ...dr].find((x) => !x.success);
  if (bad && rollback) {
    if (img) img.needFull = true;
    return { ok: false, error: tr('ArcGIS татгалзав: {0}', bad.error?.description ?? String(bad.error?.code ?? '')) };
  }
  const added: number[] = [];
  adds.forEach((o, i) => {
    const oid = ar[i]?.success ? num(ar[i]?.objectId) : null;
    if (oid == null) return;
    added.push(oid);
    if (img) { img.rows.set(oid, { ...o.a, objectid: oid }); img.seen.add(o.k); }
  });
  ups.forEach((o, i) => {
    if (!ur[i]?.success || !img) return;
    const cur = img.rows.get(o.oid);
    if (cur) img.rows.set(o.oid, { ...cur, ...o.a });
    img.seen.add(o.k);
  });
  /* Устгал — амжилттай эсвэл rollback-гүй (мөр аль хэдийн алга байж болно) бол зургаас хасна */
  dels.forEach((o, i) => { if ((dr[i]?.success || !rollback) && img) img.rows.delete(o.oid); });
  if (bad && img) img.needFull = true;
  return { ok: true, added };
}

/**
 * ДИФФ БИЧИЛТ — хүссэн мөр + толгой → хэсгүүд. Дифф хоосон, толгой өөрчлөгдөөгүй бол ЮУ Ч бичихгүй.
 * ⚠️ Толгой СҮҮЛИЙН хэсэгт: дунд хэсэг унавал толгой хөдлөхгүй ч бичигдсэн мөр бүр ӨӨРӨӨ хүчинтэй (мөр бүрийн нийлүүлэлт) —
 *    хагас бичилт аюулгүй, дараагийн бичилт үлдсэнийг гүйцээнэ.
 */
async function writeDiff(
  url: string, dkey: string, img: Img, want: Map<string, Want>, hdr: Attrs, kind: NKind, pkg: string, clearAt: number,
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const who = me();
  const base = { dkey, pkg, kind };
  const skipped: string[] = [];
  let ops = diffRows(byKey(img), want, kind, base, { clearAt, me: who, now: Date.now(), keep: (k) => !img.seen.has(k), skipped });
  /*
   * ⚠️ 2026-10-26: САРЫН ЦУВААГ хөндөх бол (мөрийн CAS байхгүй) серверийн ОДООГИЙН цувааны агшныг уншаад диффийг дахин гаргана —
   *    уншсанаас хойш хамтрагч шинэ үе бичсэн цувааг хуучин бичигч дарахгүй (`diffRows`-ийн ⚠️). Зургийг ХӨНДӨХГҮЙ (бусад бүлгийн
   *    «зөвхөн өөрчлөгдсөн» дүрэм уншсан зурагтай жишдэг). Цуваа хөндөөгүй бичилтэд нэмэлт асуулга ҮГҮЙ.
   */
  if (ops.some((o) => seriesKey(o.k) != null)) {
    const sa = new Map<string, number>();
    const got = await queryAll(url, `${COL.dkey} = ${q(dkey)} AND ${COL.turul} IN ('sar_obyem', 'sar_noots')`, ['objectid', COL.key, COL.at]);
    for (const a of got) {
      const sk = typeof a[COL.key] === 'string' ? seriesKey(a[COL.key] as string) : null;
      const t = num(a[COL.at]);
      if (sk && t != null && t > (sa.get(sk) ?? -Infinity)) sa.set(sk, t);
    }
    skipped.length = 0;
    ops = diffRows(byKey(img), want, kind, base, { clearAt, me: who, now: Date.now(), keep: (k) => !img.seen.has(k), skipped, seriesAt: sa });
  }
  if (skipped.length) console.warn('[selbe] ноорогийн мөрийн түлхүүр хэт урт — алсад бичигдсэнгүй (локалд үлдэв):', skipped.slice(0, 5).join(', '));
  const hk = byKey(img).get('h') ?? [];
  const h0 = hk[0];
  const hA: Attrs = {
    ...hdr, [COL.dkey]: dkey, [COL.pkg]: pkg, [COL.nturul]: kind, [COL.usr]: who,
    ...(img.legacyAt ? { [COL.legacy]: Math.max(img.legacyAt, num(h0?.[COL.legacy]) ?? 0) } : {}),
  };
  const hChanged = !h0 || Object.keys(hA).some((c) => c !== COL.at && c !== COL.usr && (h0[c] ?? null) !== (hA[c] ?? null));
  if (!ops.length && !hChanged) return { ok: true, wrote: false };
  const hOp: Op = h0
    ? { op: 'update', k: 'h', unit: 'h', oid: num(h0.objectid) ?? 0, a: hA }
    : { op: 'add', k: 'h', unit: 'h', a: hA };
  /* Толгойн давхардал (зэрэг анхны бичилт) — бага OBJECTID үлдэнэ */
  const hDup: Op[] = hk.slice(1).map((a) => ({ op: 'delete', k: 'h', unit: 'h', oid: num(a.objectid) ?? 0 }));
  /* ⚠️ Устгал (давхардал · GC · хугацаа дууссан tombstone) ТУСДАА, `rollbackOnFailure=false` — өөр клиент аль хэдийн устгасан
     мөр «олдсонгүй» гэж бичилтийг бүхэлд нь буцаахгүй; бичилтийн ДАРАА (толгой буусны дараа) */
  const writes = ops.filter((o) => o.op !== 'delete');
  const dels = [...ops.filter((o) => o.op === 'delete'), ...hDup];
  for (const c of chunksOf(writes, hOp)) {
    const r = await sendChunk(url, img, c);
    if (!r.ok) return r;
  }
  for (let i = 0; i < dels.length; i += CHUNK) await sendChunk(url, img, dels.slice(i, i + CHUNK), false);
  img.legacyAt = 0;
  img.ver = null;
  /* ⚠️ Бичигчийн зураг — бичсэн бүлэгт нүдний ЯГ агшин (`stampWant`), бусдад мөрийн дүрэм */
  for (const [k, a] of viewOf(img.rows.values(), kind)) {
    const g = groupsOf(kind, String(a[COL.turul] ?? ''), k);
    const w = want.get(k);
    img.stamps.set(k, w ? stampWant(img.stamps.get(k), a, w, g) : stampRow(img.stamps.get(k), a, g));
  }
  saveStamps(dkey, img);
  return { ok: true, wrote: true };
}

/* ══════════════ Хуучин JSON мөр (шингээх) ══════════════ */
async function readLegacy(url: string, legacyKey: string): Promise<{ at: number; payload: string } | null> {
  const rows = await queryAll(url, `${COL.dkey} = ${q(legacyKey)}`, ['objectid', COL.at, COL.payload]);
  const a = rows[rows.length - 1];
  if (!a || typeof a[COL.payload] !== 'string' || num(a[COL.at]) == null) return null;
  return { at: num(a[COL.at]) as number, payload: a[COL.payload] as string };
}

/* ══════════════ ХУВААРИЙН НООРОГ (`plan:<төрөл>:<багц>` → `n:plan:…`) ══════════════ */

const planMeta = (key: string): { kind: HDKind; pkg: string } => {
  const p = key.split(':');
  return { kind: p[1] === 'geree' ? 'geree' : 'plan', pkg: p.slice(2).join(':') };
};

/** Хувилбар (`useSharedDraft`-ийн 3 с-ийн мөчлөг) — `null` = ноорог алга, `undefined` = уншиж чадсангүй */
export async function planReadAt(key: string): Promise<number | null | undefined> {
  try {
    const url = await layerUrl();
    if (!url) return undefined;
    return (await verOf(url, planDkeyOfLegacy(key), key, true)).ver;
  } catch { return undefined; }
}

/**
 * Мөрүүд (+ шингээгдээгүй хуучин JSON) → HDDraft. Хуучин JSON-ыг `huuchin_at`-аас хойшхи хэсгээр нийлүүлнэ (шилжүүлснээс хойш
 * 7 хоногт бүгд); дараагийн бичилт толгойд `huuchin_at`-ыг урагшлуулна — тэр хүртэл JSON нь эх сурвалж хэвээр (хөндөхгүй).
 */
export async function planRead(key: string, opt: { full?: boolean; bld?: readonly string[] } = {}): Promise<{ ok: true; draft: HDDraft | null; at: number | null } | { ok: false; error: string }> {
  const dkey = planDkeyOfLegacy(key);
  const meta = planMeta(key);
  const img = imgOf(dkey);
  try {
    const url = await layerUrl();
    if (!url) return { ok: false, error: tr('ноорогийн хүснэгт олдсонгүй') };
    const v = await verOf(url, dkey, key);
    let d: HDDraft | null = null;
    if (v.rows) {
      await loadImg(url, dkey, meta.kind, !!opt.full);
      const view = viewOf(img.rows.values(), meta.kind);
      d = planFromRows(view.get('h') ?? null, view, img.stamps, meta, Date.now(), opt.bld);
      for (const k of view.keys()) img.seen.add(k);
    } else { img.loaded = true; img.rows = new Map(); }
    img.legacyAt = 0;
    if (v.legacyAt != null && v.legacyAt > (v.huuchin ?? 0)) {
      const L = await readLegacy(url, key);
      const b = L ? hdParse(L.payload) : null;
      if (b) {
        const part = v.rows && v.huuchin != null ? absorbPlan(b, v.huuchin, v.created ?? 0) : b;
        d = hdMerge(d, { ...part, kind: meta.kind, pkg: meta.pkg }) ?? d;
      }
      if (L) img.legacyAt = L.at;
    }
    if (d) d = { ...d, t: v.ver ?? d.t };
    return { ok: true, draft: d, at: v.ver };
  } catch (e) {
    img.needFull = true;
    return { ok: false, error: errText(e) };
  }
}

/**
 * ХУВААРИЙН НООРОГИЙГ БИЧНЭ — дифф (зөвхөн өөрчлөгдсөн бүлэг), толгой СҮҮЛД. Түгжээ (`expectAt`) ХЭРЭГГҮЙ (толгойн ⚠️).
 * Буцаах `at`: бичсэн бол `undefined` — hook дараагийн мөчлөгт серверийн хувилбарыг уншиж нийлүүлнэ (өөрийн бичилт ч орно);
 * дифф ХООСОН (юу ч бичээгүй) бол дуудагчийн `expectAt` — hook-ийн мэдлэг ХЭВЭЭР.
 * ⚠️ 2026-10-26: хоосон диффэд `expectAt`-ыг буцаахгүй бол мөрөнд илэрхийлэгдэхгүй (жиш. `val === bv`) нүдтэй локал ноорог
 *    «алс ≠ локал» → бичих → уншихын хязгааргүй тойрогт (3 с тутам) ордог байв.
 */
export async function planSave(
  key: string, d: HDDraft, opt: { ctx: PlanCtx; extra?: ReadonlyMap<number, HDRowKey>; expectAt?: number | null; cur?: ReadonlySet<number> },
): Promise<RemoteSaveResult & { at?: number }> {
  if (draftWriteLocked()) return { ok: false, error: LOCKED() };
  const dkey = planDkeyOfLegacy(key);
  const meta = planMeta(key);
  const img = imgOf(dkey);
  try {
    const url = await layerUrl();
    if (!url) return { ok: false, error: tr('ноорогийн хүснэгт олдсонгүй') };
    if (!img.loaded || img.needFull) await loadImg(url, dkey, meta.kind, true);
    const w = planToRows(d, opt.ctx, meta.kind, { extra: opt.extra, cur: opt.cur });
    const r = await writeDiff(url, dkey, img, w.rows, w.hdr, meta.kind, meta.pkg, d.t || Date.now());
    if (!r.ok) return { ok: false, error: r.error };
    return !r.wrote && opt.expectAt != null ? { ok: true, at: opt.expectAt } : { ok: true };
  } catch (e) {
    img.needFull = true;
    console.error('[selbe] хуваарийн ноорог (мөр) хадгалагдсангүй:', e);
    return { ok: false, error: errText(e) };
  }
}

/** Шилжүүлэлт шалгагдсан (мөртэй) түлхүүр — сешнд дахин асуухгүй */
const migratedKeys = new Set<string>();
/**
 * АНХНЫ НЭЭЛТЭЭР ШИЛЖҮҮЛНЭ (засагч) — мөр огт алга, хуучин JSON бий бол JSON-ыг ЯГ мөр болгож бичнэ (`huuchin_at` = JSON-ы
 * `at`); JSON ХӨНДӨГДӨХГҮЙ. Best effort — унавал засагчийн анхны бичилт мөн адил шилжүүлнэ.
 */
export async function planMigrate(key: string, ctx: PlanCtx): Promise<boolean> {
  const dkey = planDkeyOfLegacy(key);
  if (migratedKeys.has(dkey) || draftWriteLocked()) return false;
  const url = await layerUrl();
  if (!url) return false;
  const v = await verOf(url, dkey, key, true);
  if (v.rows) { migratedKeys.add(dkey); return false; }
  if (v.legacyAt == null) return false;
  const r = await planRead(key, { full: true, bld: ctx?.bld });
  if (!r.ok || !r.draft) return false;
  const s = await planSave(key, { ...r.draft, t: Math.max(Date.now(), r.draft.t + 1) }, { ctx });
  if (s.ok) migratedKeys.add(dkey);
  return s.ok;
}

/** Гүйцэтгэлийн ноорогийн анхны нээлтийн шилжүүлэлт (`planMigrate`-ийн ижил дүрэм) — жааз бүртгэгдсэн байх ёстой */
export async function perfMigrate(pkg: string): Promise<boolean> {
  const dkey = perfDkey(pkg);
  if (migratedKeys.has(dkey) || draftWriteLocked() || !frames.has(pkg)) return false;
  const url = await layerUrl();
  if (!url) return false;
  const v = await verOf(url, dkey, pkg, true);
  if (v.rows) { migratedKeys.add(dkey); return false; }
  if (v.legacyAt == null) return false;
  const r = await perfRead(pkg);
  if (!r.ok || !r.draft) return false;
  const s = await perfSave(pkg, r.draft.payload);
  if (s.ok) migratedKeys.add(dkey);
  return s.ok;
}

/** Мөрүүдийг НЭМНЭ (толгойгүй, БҮГД эсвэл ЮУ Ч ҮГҮЙ — унавал энэ дуудлагаар нэмсэнийг устгана) */
async function addAll(url: string, dkey: string, pkg: string, kind: NKind, want: Map<string, Want>): Promise<boolean> {
  const ops: Op[] = [...want.values()].filter((w) => w.k.length <= KEY_MAX).map((w) => ({
    op: 'add', k: w.k, unit: unitOf(w.k),
    a: {
      [COL.dkey]: dkey, [COL.pkg]: pkg, [COL.nturul]: kind, [COL.turul]: w.t, [COL.key]: w.k, [COL.suuri]: w.base ? 1 : null,
      ...w.a, [COL.empty]: w.e.size ? [...w.e].sort().join(',') : null, [COL.at]: w.at, [COL.usr]: w.u,
    },
  }));
  const done: number[] = [];
  for (const c of chunksOf(ops, null)) {
    const r = await sendChunk(url, null, c);
    if (!r.ok) {
      for (let i = 0; i < done.length; i += CHUNK) {
        await sendChunk(url, null, done.slice(i, i + CHUNK).map((oid): Op => ({ op: 'delete', k: '', unit: 'x', oid })), false).catch(() => undefined);
      }
      return false;
    }
    done.push(...r.added);
  }
  return true;
}

/**
 * ИЛГЭЭХ АГШНЫ ХУУЛБАР (`n:hsub:<Huvaari_Batlah OBJECTID>`, `noorog_turul='huvaari_ilgeelt'`) — цэвэрлэхээс ӨМНӨХ нүднүүд,
 * самбар батлагдаагүй хуваарийг үүгээр уншина. Best effort — унавал `planSyncSubmitted` илгээлтийн агуулгаас нөхнө.
 */
export async function planWriteSubmitted(key: string, d: HDDraft, ctx: PlanCtx, oid: number): Promise<boolean> {
  if (draftWriteLocked()) return false;
  try {
    const url = await layerUrl();
    if (!url) return false;
    const meta = planMeta(key);
    const w = planToRows({ ...d, del: new Map() }, ctx, meta.kind, { nkind: 'huvaari_ilgeelt' });
    return await addAll(url, hsubDkey(oid), meta.pkg, 'huvaari_ilgeelt', w.rows);
  } catch { return false; }
}

/** Хүлээгдэж буй илгээлтийн агуулгаас (`PlanPayload`) HDDraft — `payload.base`-тэй ЗӨРСӨН нүд л (суурьгүй хуучинд бүгд) */
export function payloadDraft(p: PlanPayload, pkg: string, at: number, author: string, n: number): HDDraft {
  const entries: HDEntries = new Map();
  const b = p.base;
  const nn = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const spanOf = (v: unknown) => { const s = v as { start?: unknown; end?: unknown } | null; return s && nn(s.start) != null && nn(s.end) != null ? { start: s.start as number, end: s.end as number } : null; };
  const put = (k: string, val: unknown, bv: unknown) => {
    if (bv !== undefined && sameVal(val, bv)) return;
    const e: HDEntry = { val, at, user: author.toLowerCase() };
    if (bv !== undefined) e.bv = bv;
    entries.set(k, e);
  };
  let pn = 0;
  for (const [ok, arr] of Object.entries(p.spans ?? {})) {
    const o = Number(ok);
    if (!Number.isInteger(o) || !Array.isArray(arr)) continue;
    pn = Math.max(pn, arr.length);
    arr.forEach((sp, i) => { const v = spanOf(sp); if (!b && !v) return; put(kS(o, i), v, b ? spanOf(b.spans?.[ok]?.[i]) : undefined); });
  }
  for (const [ok, txt] of Object.entries(p.deps ?? {})) {
    const o = Number(ok);
    if (Number.isInteger(o)) put(kH(o), txt ?? '', b ? (b.deps?.[ok] ?? '') : undefined);
  }
  for (const [ok, ad] of Object.entries(p.actual ?? {})) {
    const o = Number(ok);
    if (!Number.isInteger(o) || !ad) continue;
    const ba = b?.actual?.[ok];
    const len = Math.max(ad.start?.length ?? 0, ad.end?.length ?? 0);
    pn = Math.max(pn, len);
    for (let i = 0; i < len; i += 1) {
      const v = [nn(ad.start?.[i]), nn(ad.end?.[i])];
      if (!b?.actual && v[0] == null && v[1] == null) continue;
      put(kA(o, i), v, b?.actual ? [nn(ba?.start?.[i]), nn(ba?.end?.[i])] : undefined);
    }
  }
  for (const [ok, r] of Object.entries(p.res ?? {})) {
    const o = Number(ok);
    if (!Number.isInteger(o) || !r) continue;
    const br = b?.res?.[ok];
    put(kR(o), [nn(r.hun), nn(r.mashin)], b?.res ? [nn(br?.hun), nn(br?.mashin)] : undefined);
  }
  const mv = (rec: Record<string, number> | undefined) => monthsVal(new Map(Object.entries(rec ?? {}).filter(([, x]) => nn(x) != null) as [string, number][]));
  for (const [mk, rec] of Object.entries(p.obyem ?? {})) put(kM(mk), mv(rec), b ? mv(b.obyem?.[mk]) : undefined);
  for (const [mk, rec] of Object.entries(p.obres ?? {})) {
    put(kN(mk), resVal(new Map(Object.entries(rec ?? {}))), b?.obres ? resVal(new Map(Object.entries(b.obres?.[mk] ?? {}))) : undefined);
  }
  const rk = new Map<number, HDRowKey>();
  for (const [ok, des] of Object.entries(p.keys ?? {})) {
    const o = Number(ok);
    if (Number.isInteger(o) && typeof des === 'number') rk.set(o, { des, no: '', work: '' });
  }
  return {
    t: at, kind: p.kind === 'geree' ? 'geree' : 'plan', pkg, by: { user: author.toLowerCase(), at },
    entries, del: new Map(), base: { at, n: Math.max(n, pn) }, ...(rk.size ? { rk } : {}),
  };
}

/** Сүүлд тааруулсан хүлээгдэж буй илгээлт (багц бүрд) — ижил бол 5 мин дотор дахин тааруулахгүй */
const syncSeen = new Map<string, { sig: string; at: number }>();
/** Илгээлтээс хойш энэ хугацаанд агуулгаас нөхөхгүй (илгээгчийн ЯГ хуулбар бичигдэж байна) */
const SUBMIT_GRACE = 60_000;
type Pend = { oid: number; author: string; authorSent: number | null } | null;

/**
 * ИЛГЭЭЛТИЙН ХУУЛБАРЫГ ТААРУУЛНА (идемпотент) — батлах · буцаах · татах · нээлтийн дараа: хүлээгдэхээ больсон илгээлтийн
 * `n:hsub:*` мөрийг устгаж, хүлээгдэж буйнх нь хуулбаргүй бол агуулгаас нөхнө (ЗӨВХӨН ctx-тэй — блокийн нэр · танихуун).
 * ⚠️ Илгээснээс 60 с дотор нөхөхгүй (илгээгчийн ЯГ хуулбар бичигдэж байна); `known` хуучирсан байж болох тул устгахын өмнө
 *    хүлээгдэж буйг ДАХИН уншина.
 */
export async function planSyncSubmitted(
  pkgKey: string, opt: { ctx?: PlanCtx; ctxKind?: HDKind; known?: { plan: Pend; geree: Pend }; force?: boolean } = {},
): Promise<void> {
  if (draftWriteLocked()) return;
  const st = await rowsReady();
  if (st.mode !== 'rows') return;
  try {
    const url = await layerUrl();
    if (!url) return;
    const hb = await import('@/lib/huvaariBatlah');
    const loadPend: PendIO = pendingIO ?? (hb.loadPendingBoth as unknown as PendIO);
    let both = opt.known ?? await loadPend(pkgKey);
    let fresh = !opt.known;
    const sig = `${both.plan?.oid ?? '-'}|${both.geree?.oid ?? '-'}`;
    const seen = syncSeen.get(pkgKey);
    if (!opt.force && seen && seen.sig === sig && Date.now() - seen.at < PROBE_TTL) return;
    syncSeen.set(pkgKey, { sig, at: Date.now() });
    const rows = await queryAll(url, `${COL.pkg} = ${q(pkgKey)} AND ${COL.nturul} = 'huvaari_ilgeelt'`, ['objectid', COL.dkey, COL.key]);
    const oidOf = (a: Attrs) => Number(String(a[COL.dkey] ?? '').split(':')[2]);
    const staleOf = (b: { plan: Pend; geree: Pend }) => rows.filter((a) => oidOf(a) !== b.plan?.oid && oidOf(a) !== b.geree?.oid);
    let stale = staleOf(both);
    if (stale.length && !fresh) { both = await loadPend(pkgKey); fresh = true; stale = staleOf(both); }
    /* Хүлээгдэж буй хуулбарын давхардсан `mur_key` — бага OBJECTID үлдэнэ */
    const keep = new Map<string, number>();
    const dup: Attrs[] = [];
    for (const a of rows) {
      if (stale.includes(a)) continue;
      const k = `${String(a[COL.dkey])}|${String(a[COL.key])}`;
      const o = num(a.objectid) ?? 0;
      const k0 = keep.get(k);
      if (k0 == null) { keep.set(k, o); continue; }
      dup.push(o > k0 ? a : rows.find((x) => num(x.objectid) === k0)!);
      keep.set(k, Math.min(o, k0));
    }
    const del = [...stale, ...dup].map((a): Op => ({ op: 'delete', k: '', unit: 'x', oid: num(a.objectid) ?? 0 }));
    for (let i = 0; i < del.length; i += CHUNK) await sendChunk(url, null, del.slice(i, i + CHUNK), false);
    let deferred = false;
    for (const kind of ['plan', 'geree'] as const) {
      const p = both[kind];
      if (!p || rows.some((a) => oidOf(a) === p.oid) || opt.ctxKind !== kind) continue;
      if (!opt.ctx) { deferred = true; continue; }
      if (p.authorSent != null && Date.now() - p.authorSent < SUBMIT_GRACE) { deferred = true; continue; }
      const pay = await (payloadIO ?? hb.loadPayload)(p.oid);
      if (!pay || pay.kind !== kind) continue;
      const d = payloadDraft(pay, pkgKey, p.authorSent ?? Date.now(), p.author, opt.ctx.n);
      const w = planToRows(d, opt.ctx, kind, { nkind: 'huvaari_ilgeelt' });
      await addAll(url, hsubDkey(p.oid), pkgKey, 'huvaari_ilgeelt', w.rows);
    }
    if (deferred) syncSeen.delete(pkgKey);
  } catch (e) {
    syncSeen.delete(pkgKey);
    console.warn('[selbe] илгээлтийн хуулбар тааруулагдсангүй:', e);
  }
}

/* ══════════════ ГҮЙЦЭТГЭЛИЙН НООРОГ (`<багц>` → `n:<багц>`) ══════════════ */

/** Багц бүрийн ОДООГИЙН жааз — `useDraftSync` мөр ачаалагдмагц бүртгэнэ (oid ↔ код · № · нэр, блокийн нэр) */
const frames = new Map<string, Frame>();
export function setFillFrame(pkgKey: string, rows: readonly FrameRow[], bld: readonly string[]): void {
  if (!pkgKey || !rows.length) return;
  frames.set(pkgKey, buildFrame(rows, bld));
}
export const fillFrame = (pkgKey: string): Frame | null => frames.get(pkgKey) ?? null;

/** Хувилбар (`useDraftSync`-ийн 3 с-ийн мөчлөг · бичихийн өмнө) */
export async function perfReadAt(pkg: string): Promise<number | null | undefined> {
  try {
    const url = await layerUrl();
    if (!url) return null;
    return (await verOf(url, perfDkey(pkg), pkg, true)).ver;
  } catch { return undefined; }
}

/** Мөрүүд (+ шингээгдээгүй хуучин JSON) → `Draft` (`payload` = JSON — hook-ийн `parseDraft` хэвээр) */
export async function perfRead(pkg: string): Promise<RemoteDraftRead> {
  const dkey = perfDkey(pkg);
  const img = imgOf(dkey);
  try {
    const url = await layerUrl();
    if (!url) return { ok: true, draft: null };
    const v = await verOf(url, dkey, pkg);
    let d: Draft | null = null;
    if (v.rows) {
      await loadImg(url, dkey, 'guitsetgel', false);
      const view = viewOf(img.rows.values(), 'guitsetgel');
      img.stale = new Map();
      d = perfFromRows(view.get('h') ?? null, view, img.stamps, frames.get(pkg) ?? null, v.ver ?? Date.now(), img.stale);
      for (const k of view.keys()) img.seen.add(k);
    } else { img.loaded = true; img.rows = new Map(); }
    img.legacyAt = 0;
    if (v.legacyAt != null && v.legacyAt > (v.huuchin ?? 0)) {
      const L = await readLegacy(url, pkg);
      const b = L ? parseDraft(L.payload, 'remote') : null;
      if (b) d = mergeDrafts(d, v.rows && v.huuchin != null ? absorbPerf(b, v.huuchin, v.created ?? 0) : b);
      if (L) img.legacyAt = L.at;
    }
    if (!d || v.ver == null) return { ok: true, draft: null };
    return { ok: true, draft: { at: v.ver, payload: JSON.stringify({ ...d, t: v.ver }) } };
  } catch (e) {
    img.needFull = true;
    return { ok: false, error: errText(e) };
  }
}

/**
 * ГҮЙЦЭТГЭЛИЙН НООРОГИЙГ БИЧНЭ — `payload` (hook-ийн нийлүүлсэн `Draft`) → мөр, дифф. Жааз бүртгэгдээгүй бол бичихгүй
 * (код ↔ oid мэдэгдэхгүй — hook 3 с-ийн дараа дахин оролдоно). Задрахгүй (хог) нүд локалд үлдэнэ.
 */
export async function perfSave(pkg: string, payload: string, frameOverride?: Frame): Promise<RemoteSaveResult> {
  if (draftWriteLocked()) return { ok: false, error: LOCKED() };
  const dkey = perfDkey(pkg);
  const img = imgOf(dkey);
  /* ⚠️ 2026-10-26: админы шилжүүлэлтийн хэсэгчилсэн жааз (`lookupFrame`) ГЛОБАЛ `frames`-д орохгүй — дамжуулж л хэрэглэнэ */
  const frame = frameOverride ?? frames.get(pkg) ?? null;
  if (!frame) return { ok: false, error: tr('хуудасны мөр хараахан ачаалагдаагүй — дахин оролдоно') };
  const d = parseDraft(payload, 'remote');
  if (!d) return { ok: false, error: tr('ноорог задарсангүй') };
  try {
    const url = await layerUrl();
    if (!url) return { ok: false, error: tr('ноорогийн хүснэгт олдсонгүй') };
    if (!img.loaded || img.needFull) await loadImg(url, dkey, 'guitsetgel', true);
    const w = perfToRows(d, frame, img.stale);
    if (w.skipped.length) console.warn('[selbe] ноорогийн задрахгүй нүд алсад бичигдсэнгүй (локалд үлдэв):', w.skipped.slice(0, 10).join(', '));
    const r = await writeDiff(url, dkey, img, w.rows, w.hdr, 'guitsetgel', pkg, d.t || Date.now());
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    img.needFull = true;
    console.error('[selbe] ноорог (мөр) хадгалагдсангүй:', e);
    return { ok: false, error: errText(e) };
  }
}

/**
 * `clearRemoteDraft`-ийн мөрийн горим — ЮУ Ч УСТГАХГҮЙ (`true`). Hook үүнийг ЗӨВХӨН задрахгүй (эвдэрсэн) JSON ноорогт
 * («зомби») дууддаг; мөрөөс угсарсан ноорог үргэлж задардаг тул энд хүрвэл алдаа — багцын бүх оролцогчийн мөрийг арчих эрсдэлтэй
 * тул УСТГАЛГҮЙ анхааруулна. Ноорог цэвэрлэх ердийн зам нь хоосон ноорог бичих (`safeClearRemote` → дифф).
 */
export async function perfClear(pkg: string): Promise<boolean> {
  console.warn('[selbe] мөрийн горимд clearRemoteDraft — устгасангүй:', pkg);
  return true;
}

/* ══════════════ ИЛГЭЭЛТ (`n:sub:<OBJECTID>`, MVCC) ══════════════ */

/** Илгээлтүүдийн мөр — OBJECTID → мөрүүд (`dkey IN`, 40-өөр хуваана) */
export async function subRowsFor(oids: readonly number[]): Promise<Map<number, Attrs[]>> {
  const out = new Map<number, Attrs[]>();
  const want = [...new Set(oids.filter((o) => Number.isInteger(o) && o > 0))];
  if (!want.length) return out;
  const url = await layerUrl();
  if (!url) throw new Error(tr('ноорогийн хүснэгт олдсонгүй'));
  for (let i = 0; i < want.length; i += 40) {
    const part = want.slice(i, i + 40);
    const rows = await queryAll(url, `${COL.dkey} IN (${part.map((o) => q(subDkey(o))).join(', ')})`, READ_FIELDS);
    for (const a of rows) {
      const o = Number(String(a[COL.dkey] ?? '').slice(6));
      const l = out.get(o);
      if (l) l.push(a); else out.set(o, [a]);
    }
  }
  return out;
}

/**
 * ШИНЭ ҮЕИЙН МӨР БИЧНЭ (баталгаажуулалтгүй — толгойн `gens`-д нэмэгдтэл ҮЛ ҮЗЭГДЭНЭ): өөрчлөгдсөн түлхүүрт шинэ мөр,
 * хасагдсанд хоосон мөр (`at` = үе). ⚠️ Унавал энэ дуудлагаар нэмсэн мөрийг устгана (best effort) — үлдсэн нь баталгаажаагүй
 * тул хэзээ ч харагдахгүй, GC (15 мин) устгана.
 */
export async function subWriteGen(
  oid: number, pkg: string, want: ReadonlyMap<string, Attrs>, vis: ReadonlyMap<string, Attrs>, gen: number,
): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  if (draftWriteLocked()) return { ok: false, error: LOCKED() };
  const url = await layerUrl();
  if (!url) return { ok: false, error: tr('ноорогийн хүснэгт олдсонгүй') };
  const who = me();
  const ops: Op[] = [];
  const add = (k: string, a: Attrs) => ops.push({
    op: 'add', k, unit: k,
    a: { [COL.dkey]: subDkey(oid), [COL.pkg]: pkg, [COL.nturul]: 'ilgeelt', [COL.key]: k, ...a, [COL.at]: gen, [COL.usr]: who },
  });
  for (const [k, a] of want) if (!sameSubRow(vis.get(k), a)) add(k, a);
  for (const [k, a] of vis) if (!want.has(k)) add(k, { [COL.turul]: String(a[COL.turul] ?? 'ajil'), [COL.oid]: a[COL.oid] ?? null, [COL.empty]: null });
  const done: number[] = [];
  for (const c of chunksOf(ops, null)) {
    const r = await sendChunk(url, null, c);
    if (!r.ok) {
      for (let i = 0; i < done.length; i += CHUNK) {
        await sendChunk(url, null, done.slice(i, i + CHUNK).map((o): Op => ({ op: 'delete', k: '', unit: 'x', oid: o })), false).catch(() => undefined);
      }
      return { ok: false, error: r.error };
    }
    done.push(...r.added);
  }
  return { ok: true, n: ops.length };
}

/** Илгээлтийн БҮХ мөрийг устгана — уралдаанд ялагдаж толгойгоо устгасан бичигч (`saveSubmission`) — best effort */
export async function subDropAll(oid: number): Promise<void> {
  const url = await layerUrl();
  if (!url) return;
  const rows = await queryAll(url, `${COL.dkey} = ${q(subDkey(oid))}`, ['objectid']);
  const ops = rows.map((a): Op => ({ op: 'delete', k: '', unit: 'x', oid: num(a.objectid) ?? 0 }));
  for (let i = 0; i < ops.length; i += CHUNK) await sendChunk(url, null, ops.slice(i, i + CHUNK), false);
}

/**
 * Толгойн мөрийн ШИНЭ баганууд (`mur_turul` · `huvilbar` · `huuchin_at` …) — REST-ээр (JS API давхарга notebook-оос ӨМНӨ
 * ачаалагдсан бол шинэ талбарыг танихгүй байж болно). Самбарын шүүлтэд л; best effort.
 */
export async function setHeaderCols(oid: number, attrs: Attrs): Promise<boolean> {
  if (draftWriteLocked() || !Number.isInteger(oid) || oid <= 0) return false;
  const url = await layerUrl();
  if (!url) return false;
  const r = await sendChunk(url, null, [{ op: 'update', k: 'h', unit: 'h', oid, a: attrs }]);
  return r.ok;
}

/** Хуучирсан үе ба баталгаажаагүй (15 мин+) мөрийг устгана (`pins` — «архивлаж байна» тэмдгийн бэхэлсэн үе) — best effort */
export async function subGc(oid: number, gens: readonly number[], pins: readonly number[], rows?: readonly Attrs[]): Promise<number> {
  try {
    const url = await layerUrl();
    if (!url) return 0;
    const all = rows ?? (await subRowsFor([oid])).get(oid) ?? [];
    const dead = gcCandidates(all, gens, pins, Date.now(), ORPHAN_TTL).slice(0, 1000);
    for (let i = 0; i < dead.length; i += CHUNK) await sendChunk(url, null, dead.slice(i, i + CHUNK).map((o): Op => ({ op: 'delete', k: '', unit: 'x', oid: o })), false);
    return dead.length;
  } catch { return 0; }
}

/* ══════════════ АДМИН — бүгдийг шилжүүлэх · тулгах · хуучин JSON-ыг цэвэрлэх (Phase B) ══════════════ */

/** Хуудасны мөрийн танихуун oid-оор (код · № · нэр) — `rk`-гүй хуучин ноорогт; олдоогүй нь `o<oid>` */
async function lookupFrame(pkgKey: string, oids: readonly number[]): Promise<Frame | null> {
  if (!oids.length) return null;
  const { PKGS } = await import('@/modules/sheet/bagts.pkg');
  const pk = PKGS.find((p) => p.key === pkgKey);
  if (!pk) return null;
  const nk = (k: string) => k.replace(/[\s_]/g, '').toLowerCase();
  const rows: FrameRow[] = [];
  for (let i = 0; i < oids.length; i += CHUNK) {
    const j = (await post(`${pk.url}/query`, { objectIds: oids.slice(i, i + CHUNK).join(','), outFields: '*', returnGeometry: 'false' })) as { features?: { attributes?: Record<string, unknown> }[] };
    for (const f of j.features ?? []) {
      const a = f.attributes ?? {};
      const keys = Object.keys(a);
      const oidK = keys.find((k) => /^(objectid|fid)$/i.test(k));
      const desK = keys.find((k) => /^des_dugaar$/i.test(k));
      const noK = keys.find((k) => nk(k) === 'f');
      const workK = keys.find((k) => nk(k) === 'ажил');
      const oid = oidK ? num(a[oidK]) : null;
      if (oid == null) continue;
      rows.push({ oid, des: desK ? num(a[desK]) : null, no: noK && a[noK] != null ? String(a[noK]).trim() : '', work: workK && a[workK] != null ? String(a[workK]).trim() : '', depth: 0, group: false });
    }
  }
  /* ⚠️ 2026-10-26: хэсэгчилсэн — блокийн нэр/тоо мэдэгдэхгүй (`blok` NULL бичигдэнэ, `'Ажил'` биш) */
  return rows.length ? { ...buildFrame(rows, []), partial: true } : null;
}

export type MigrateResult = { total: number; migrated: number; failed: string[] };

/**
 * АДМИНЫ «БҮГДИЙГ ШИЛЖҮҮЛЭХ» — 191-ийн хуучин JSON ноорог (`<багц>` · `plan:<төрөл>:<багц>`) ба илгээлт (`sub|` · `done|`,
 * `huvilbar` хоосон) бүгдийг мөр рүү. JSON/payload ХӨНДӨГДӨХГҮЙ (Phase B хүртэл); давтахад шингээгдсэнийг дахин бичихгүй.
 */
export async function migrateAll(onProgress?: (done: number, total: number) => void): Promise<MigrateResult> {
  const url = await layerUrl();
  if (!url) throw new Error(tr('ноорогийн хүснэгт олдсонгүй'));
  if ((await rowsReady(true)).mode !== 'rows') throw new Error(tr('ноорогийн багана нэмэгдээгүй — notebook ажиллуулна уу'));
  const { PKGS } = await import('@/modules/sheet/bagts.pkg');
  const pk = new Set(PKGS.map((p) => p.key));
  const legacy = await queryAll(url, `${COL.turul} IS NULL`, ['objectid', COL.dkey, COL.at, COL.ver]);
  const keys = legacy.map((a) => String(a[COL.dkey] ?? '')).filter((k) => pk.has(k) || /^plan:(plan|geree):[^|]+$/.test(k) || /^(sub|done)\|/.test(k));
  let migrated = 0;
  const failed: string[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    onProgress?.(i, keys.length);
    const k = keys[i];
    try {
      if (k.startsWith('plan:')) {
        const r = await planRead(k, { full: true });
        if (!r.ok) throw new Error(r.error);
        const img = imgOf(planDkeyOfLegacy(k));
        if (!img.legacyAt) continue;
        if (!r.draft) continue;
        /* ⚠️ 2026-10-26: БҮХ oid-ыг хуудаснаас хайна — олдсон нь «одоогийн жааз» (`cur`): `planToRows` hook-ийн зөөлтийн
           tombstone-ыг (жаазад алга oid) нүдийг устгах шийдвэр гэж бичихгүй. Танихууныг `rk`-гүй oid-д л нэмнэ */
        const oids = [...r.draft.entries.keys(), ...r.draft.del.keys()].map((x) => Number(/^[shar]:(-?\d+)/.exec(x)?.[1])).filter((o) => Number.isInteger(o));
        const fr = await lookupFrame(planMeta(k).pkg, [...new Set(oids)]).catch(() => null);
        const extra = new Map<number, HDRowKey>();
        for (const [o, x] of fr?.byOid ?? []) if (!r.draft.rk?.has(o)) extra.set(o, { des: x.des, no: x.no, work: x.work });
        const s = await planSave(k, { ...r.draft, t: Date.now() }, { ctx: null, extra, cur: fr ? new Set(fr.byOid.keys()) : undefined });
        if (!s.ok) throw new Error(s.error);
        migrated += 1;
      } else if (pk.has(k)) {
        const r = await perfRead(k);
        if (!r.ok) throw new Error(r.error);
        const img = imgOf(perfDkey(k));
        if (!img.legacyAt || !r.draft) continue;
        const d = parseDraft(r.draft.payload, 'remote');
        if (!d) continue;
        /* ⚠️ 2026-10-26: хэсэгчилсэн жааз ЛОКАЛ — глобал `frames`-д хадгалбал тухайн сешний дараагийн илгээлт/ноорог блокийн
           нэргүй жаазаар бичигддэг байв */
        let fr: Frame | undefined;
        if (!frames.has(k)) {
          const oids = [...d.cells, ...(d.dates ?? [])].map(([x]) => Number(x.slice(0, x.indexOf(':')))).filter((o) => Number.isInteger(o) && o >= 0);
          fr = (await lookupFrame(k, [...new Set(oids)]).catch(() => null)) ?? { ...buildFrame([], []), partial: true };
        }
        const s = await perfSave(k, JSON.stringify({ ...d, t: Date.now() }), fr);
        if (!s.ok) throw new Error(s.error);
        migrated += 1;
      } else {
        const { migrateSubmissionRow } = await import('@/lib/submission');
        const oid = num(legacy[legacy.findIndex((a) => a[COL.dkey] === k)]?.objectid);
        if (oid == null) continue;
        const m = await migrateSubmissionRow(oid);
        if (!m.ok) throw new Error(m.error);
        if (m.migrated) migrated += 1;
      }
    } catch (e) {
      failed.push(`${k}: ${errText(e)}`);
    }
  }
  onProgress?.(keys.length, keys.length);
  return { total: keys.length, migrated, failed };
}

/** `edited` — `same`-д тооцогдсон боловч шилжүүлснээс хойш мөрөнд засагдсан (хуучин нүд бүр тооцогдсон) түлхүүр */
export type VerifyResult = { total: number; same: number; diff: string[]; pending: string[]; edited: string[] };

/**
 * Шилжүүлэлтийн агшны хил — `huuchin_at` (шингээсэн JSON-ы агшин) ба толгой үүссэн серверийн цаг + 60 с (шилжүүлэх бичилт
 * өөрөө `Date.now()` агшин тавьдаг тул түүнийг «хойшхи засвар» гэж андуурахгүй).
 */
const migCut = (v: Ver): number => Math.max(v.huuchin ?? 0, (v.created ?? 0) + 60_000);

/**
 * ТУЛГАЛТ (Phase A → B) — шилжсэн ноорог бүрийг мөрөөс сэргээж хуучин JSON-тэй харьцуулна (цэвэр, баримтжуулсан хасагдах
 * талбаргүйгээр): хуваарь — `sig`; гүйцэтгэл — нүд/огнооны олонлог; илгээлт — нүд/огноо. `pending` = мөр рүү ороогүй.
 */
export async function verifyAll(): Promise<VerifyResult> {
  const url = await layerUrl();
  if (!url) throw new Error(tr('ноорогийн хүснэгт олдсонгүй'));
  /* ⚠️ 2026-10-26: багана алга бол `mur_turul IS NULL` асуулга Enterprise-аас ойлгомжгүй алдаа авна — `migrateAll`-тай ижил хамгаалалт */
  if ((await rowsReady(true)).mode !== 'rows') throw new Error(tr('ноорогийн багана нэмэгдээгүй — notebook ажиллуулна уу'));
  const { PKGS } = await import('@/modules/sheet/bagts.pkg');
  const pk = new Set(PKGS.map((p) => p.key));
  const legacy = await queryAll(url, `${COL.turul} IS NULL`, ['objectid', COL.dkey, COL.at, COL.payload]);
  const out: VerifyResult = { total: 0, same: 0, diff: [], pending: [], edited: [] };
  for (const a of legacy) {
    const k = String(a[COL.dkey] ?? '');
    const raw = typeof a[COL.payload] === 'string' ? a[COL.payload] as string : '';
    if (k.startsWith('plan:')) {
      out.total += 1;
      const dkey = planDkeyOfLegacy(k);
      const img = imgOf(dkey);
      const v = await readVer(url, dkey, k);
      if (!v.rows || v.huuchin == null || v.huuchin < (num(a[COL.at]) ?? 0)) { out.pending.push(k); continue; }
      await loadImg(url, dkey, planMeta(k).kind, true);
      const view = viewOf(img.rows.values(), planMeta(k).kind);
      const fromRows = planFromRows(view.get('h') ?? null, view, img.stamps, planMeta(k));
      const b = hdParse(raw);
      const exp = b ? hdMerge(b, null) : null;
      const strip = (d: HDDraft) => hdSig({ ...d, entries: new Map([...d.entries].map(([kk, e]) => [kk, { ...e, at: 0, user: '' }])), del: new Map() });
      if (exp && strip(fromRows) === strip(exp)) { out.same += 1; continue; }
      /* ⚠️ 2026-10-26: шилжүүлснээс хойш хэрэглэгчид мөрөнд үргэлжлүүлэн засдаг тул ЯГ тэнцүү байх албагүй — хуучин нүд бүр
         мөрөнд ИЖИЛ утгаар байгаа, эсвэл шилжүүлэлтээс ХОЙШ (агшин > `cut`) засагдсан/хасагдсан бол «тооцогдсон» */
      const cut = migCut(v);
      const acc = !!exp && [...exp.entries].every(([kk, e]) => {
        const r = fromRows.entries.get(kk);
        return (r && sameVal(r.val, e.val)) || (r && r.at > cut) || (fromRows.del.get(kk) ?? -1) > cut || (fromRows.cleared ?? 0) > cut;
      }) && [...fromRows.entries].every(([kk, r]) => exp.entries.has(kk) || r.at > cut);
      if (acc) { out.same += 1; out.edited.push(k); } else out.diff.push(k);
    } else if (pk.has(k)) {
      out.total += 1;
      const dkey = perfDkey(k);
      const img = imgOf(dkey);
      const v = await readVer(url, dkey, k);
      if (!v.rows || v.huuchin == null || v.huuchin < (num(a[COL.at]) ?? 0)) { out.pending.push(k); continue; }
      await loadImg(url, dkey, 'guitsetgel', true);
      const view = viewOf(img.rows.values(), 'guitsetgel');
      const d = perfFromRows(view.get('h') ?? null, view, img.stamps, null, 0);
      const b = parseDraft(raw, 'remote');
      const set = (x: Draft) => JSON.stringify([...x.cells, ...(x.dates ?? [])].map(([kk, vv]) => `${kk}=${vv}`).sort());
      if (b && set(d) === set(b)) { out.same += 1; continue; }
      /* ⚠️ Хуваарийнхтай ижил «тооцогдсон» дүрэм (шилжүүлснээс хойшхи засвар зөрүү биш) */
      const cut = migCut(v);
      const rv = new Map([...d.cells, ...(d.dates ?? [])]);
      const rAt = new Map(d.byAt ?? []);
      const rDel = new Map(d.del ?? []);
      const later = (kk: string) => (rAt.get(kk) ?? -1) > cut || (rDel.get(kk) ?? -1) > cut;
      const bk = new Set(b ? [...b.cells, ...(b.dates ?? [])].map(([kk]) => kk) : []);
      const acc = !!b && [...b.cells, ...(b.dates ?? [])].every(([kk, vv]) => rv.get(kk) === vv || later(kk))
        && [...rv.keys()].every((kk) => bk.has(kk) || later(kk));
      if (acc) { out.same += 1; out.edited.push(k); } else out.diff.push(k);
    } else if (/^(sub|done)\|/.test(k)) {
      out.total += 1;
      const { compareSubmissionRow } = await import('@/lib/submission');
      const r = await compareSubmissionRow(num(a.objectid) ?? 0);
      if (r === 'pending') out.pending.push(k); else if (r === 'same') out.same += 1; else out.diff.push(k);
    }
  }
  return out;
}

/**
 * PHASE B — тулгалт ЗӨВ гарсны ДАРАА (хэрэглэгч баталсан): хуучин амьд ноорогийн JSON мөрийг (`<багц>` · `plan:%`, шинэ толгойн
 * `huuchin_at` ≥ тэдний `at`) УСТГАНА; илгээлтийн payload-аас нүдийг хасна (v3 мета). `bagtsHamaaral` ХЭЗЭЭ Ч хөндөгдөхгүй.
 * ⚠️ Буцаах боломжгүй — дуудагч ИЛ асууна; тулгалтад зөрсөн/ороогүй түлхүүрийг алгасна.
 */
export async function phaseB(verified: VerifyResult): Promise<{ deleted: number; stripped: number; failed: string[] }> {
  if (draftWriteLocked()) throw new Error(LOCKED());
  const url = await layerUrl();
  if (!url) throw new Error(tr('ноорогийн хүснэгт олдсонгүй'));
  if ((await rowsReady(true)).mode !== 'rows') throw new Error(tr('ноорогийн багана нэмэгдээгүй — notebook ажиллуулна уу'));
  const bad = new Set([...verified.diff, ...verified.pending]);
  const { PKGS } = await import('@/modules/sheet/bagts.pkg');
  const pk = new Set(PKGS.map((p) => p.key));
  const legacy = await queryAll(url, `${COL.turul} IS NULL`, ['objectid', COL.dkey, COL.at]);
  const del: Op[] = [];
  let stripped = 0;
  const failed: string[] = [];
  for (const a of legacy) {
    const k = String(a[COL.dkey] ?? '');
    if (!k || k === 'bagtsHamaaral' || bad.has(k)) continue;
    if (k.startsWith('plan:') || pk.has(k)) {
      /* ⚠️ 2026-10-26: тулгалтаас хойш хуучин таб JSON-д дахин бичсэн бол (`at` > `huuchin_at`) шингээгдтэл УСТГАХГҮЙ */
      const v = await readVer(url, k.startsWith('plan:') ? planDkeyOfLegacy(k) : perfDkey(k), k);
      if (!v.rows || v.huuchin == null || v.huuchin < (num(a[COL.at]) ?? 0)) { failed.push(`${k}: ${tr('тулгалтаас хойш хуучин JSON өөрчлөгдсөн — дахин тулгана уу')}`); continue; }
      del.push({ op: 'delete', k, unit: 'x', oid: num(a.objectid) ?? 0 });
    }
    /* ⚠️ 2026-10-26: ЗӨВХӨН `done|` (хөлдсөн) толгойн payload-ыг хасна — идэвхтэй `sub|` толгойг хамтрагчийн `saveSubmission`-тай
       уралдаж ХУУЧИН `gens`-ээр дарах эрсдэлтэй (ArcGIS-д нөхцөлт бичилт алга); `sub|` нь дараагийн илгээлтээр мета болно */
    else if (k.startsWith('done|')) {
      const { stripSubmissionPayload } = await import('@/lib/submission');
      const r = await stripSubmissionPayload(num(a.objectid) ?? 0);
      if (r.ok) stripped += 1; else failed.push(`${k}: ${r.error}`);
    }
  }
  let deleted = 0;
  for (let i = 0; i < del.length; i += CHUNK) {
    const r = await sendChunk(url, null, del.slice(i, i + CHUNK), false);
    if (r.ok) deleted += Math.min(CHUNK, del.length - i); else failed.push(r.error);
  }
  return { deleted, stripped, failed };
}

/** ⚠️ ЗӨВХӨН тест — зургийн сан ба кэшийг цэвэрлэнэ */
export const resetRowsCache = (): void => { imgs = new Map(); probe = null; frames.clear(); syncSeen.clear(); migratedKeys.clear(); };
/** Хуучин JSON-ын устгалын агшин (`HD_DEL_TTL`) — тест/баримт */
export const LEGACY_ABSORB_ALL_MS = HD_DEL_TTL;
export { ROW_TTL, ROW_VERSION };

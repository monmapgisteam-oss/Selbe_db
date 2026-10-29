'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТЫН ӨГӨГДЛИЙН ДАВХАРГА — амьд ArcGIS үйлчилгээ.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { t as tr } from './i18nCore';
import {
  addRows, addedOid, deleteRow, ensureUniqueId, fieldMaxLen, hasHistoryField, hasOkCellsField, queryAll, queryStatusSig,
  updateDecision, HyanaltConflict,
  DECISION, F, HYANALT, STATUS,
  REVIEW_STAGES, REVIEW_STATUS, RETURNED_STATUS, SF, nextReview, prevReview,
  type Attrs, type Decision, type ReviewStage, type Row, type Stage, type Status,
} from './hyanalt';
import type { Work } from './hyanaltGroup';

/**
 * `Zovshoorson_nud` (`F.okCells`) ТАЛБАРТ БИЧИХ PATCH — талбар үйлчилгээнд
 * БАЙВАЛ л (2026-09-23, аудитын #16).
 */
async function okCellsPatch(okCells: string[] | undefined, strict = true): Promise<{ patch: Attrs; warn?: string; error?: string }> {
  if (!okCells) return { patch: {} };
  const has = await hasOkCellsField();
  if (has === false) {
    console.warn(`[selbe] «${F.okCells}» талбар хяналтын үйлчилгээнд алга — зөвшөөрсөн нүд хадгалагдсангүй. AGOL дээр талбар нэмнэ үү.`);
    return {
      patch: {},
      warn: tr('«{0}» багана хяналтын үйлчилгээнд алга — зөвшөөрсөн нүдний жагсаалт хадгалагдсангүй тул гүйцэтгэгч аль нүд зөвшөөрөгдсөнийг харахгүй. Админд мэдэгдэнэ үү.', F.okCells),
    };
  }
  const enc = encodeOkCells(okCells);
  const max = await fieldMaxLen(F.okCells);
  if (max != null && enc.length > max) {
    if (!strict) {
      return {
        patch: {},
        warn: tr('Зөвшөөрсөн нүдний жагсаалт ({0} тэмдэгт) «{1}» баганын хэмжээнээс ({2}) хэтэрсэн тул хадгалагдсангүй — шийдвэр хэвээр явлаа. Баганын уртыг нэмүүлэхээр админд мэдэгдэнэ үү.', String(enc.length), F.okCells, String(max)),
      };
    }
    return {
      patch: {},
      error: tr('Зөвшөөрсөн нүдний жагсаалт ({0} тэмдэгт) «{1}» баганын хэмжээнээс ({2}) хэтэрлээ — шийдвэр хадгалагдсангүй. Баганын уртыг нэмүүлэхээр админд мэдэгдэнэ үү.', String(enc.length), F.okCells, String(max)),
    };
  }
  return { patch: { [F.okCells]: enc } };
}

export const REASON_MAX = 2000;
/** Тухайн шатны шалтгааны баганад багтах дээд урт (UI-ийн `maxLength` ба бичилтийн таслалт — нэг эх) */
export async function reasonMax(stage: ReviewStage): Promise<number> {
  const n = await fieldMaxLen(SF[stage].reason);
  return n != null && n > 0 ? Math.min(REASON_MAX, n) : REASON_MAX;
}
/** Уртаас хэтэрвэл таслаж «…» залгана — шалтгааны эхэнд хэрэглэгчийн бичвэр (`badText`) тул тэр хадгалагдана */
const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`);

/**
 * ШИЙДВЭРИЙН ЛОГ (`Shiidveriin_tuuh`) — талбар БАЙВАЛ л үйл явдал нэмнэ (2026-10-01).
 */
async function historyPatch(base: unknown, e: HistEntry, user?: string): Promise<Attrs> {
  const has = await hasHistoryField();
  if (has !== true) return {};
  return { [F.history]: withUsers(base, appendHistory(base, e), user) };
}

/** Логийн түүхий үйл явдал — `u` талбарыг уншихад (`parseHistory` үүнийг хаядаг) */
type RawHist = { stage?: unknown; at?: unknown; act?: unknown; u?: unknown; [k: string]: unknown };
function rawHist(raw: unknown): RawHist[] {
  try {
    const a: unknown = JSON.parse(String(raw ?? ''));
    return Array.isArray(a) ? a.filter((x): x is RawHist => !!x && typeof x === 'object') : [];
  } catch { return []; }
}

/**
 * ЛОГИЙН ҮЙЛ ЯВДАЛД ХЭРЭГЛЭГЧИЙН НЭР (`u`) НЭМНЭ (2026-10-06, аудит #6).
 */
function withUsers(base: unknown, out: string, user?: string): string {
  const key = (e: RawHist) => `${String(e.stage)}|${Number(e.at)}|${String(e.act)}`;
  const us = new Map<string, string>();
  for (const e of rawHist(base)) if (typeof e.u === 'string' && e.u) us.set(key(e), e.u);
  let list = rawHist(out).map((e) => {
    const u = us.get(key(e));
    return u ? { ...e, u } : e;
  });
  const u0 = (user ?? '').trim().toLowerCase();
  if (u0 && list.length) list[list.length - 1] = { ...list[list.length - 1], u: u0 };
  let s = JSON.stringify(list);
  while (s.length > 65_000 && list.length > 1) { list = list.slice(1); s = JSON.stringify(list); }
  return s;
}

/** Тухайн шатыг хамгийн сүүлд ЗӨВШӨӨРСӨН хүний ArcGIS нэр (`u`) — мэдэхгүй бол `''` */
function lastApprover(raw: unknown, stage: ReviewStage): string {
  let best = '';
  let bestAt = -Infinity;
  for (const e of rawHist(raw)) {
    if (e.stage !== stage || (e.act !== 'approve' && e.act !== 'recheck-ok')) continue;
    const at = Number(e.at);
    if (!Number.isFinite(at) || at < bestAt) continue;
    bestAt = at;
    best = typeof e.u === 'string' ? e.u.trim().toLowerCase() : '';
  }
  return best;
}

function lastApproverName(raw: unknown, stage: ReviewStage): string {
  let best = '';
  let bestAt = -Infinity;
  for (const e of rawHist(raw)) {
    if (e.stage !== stage || (e.act !== 'approve' && e.act !== 'recheck-ok')) continue;
    const at = Number(e.at);
    if (!Number.isFinite(at) || at < bestAt) continue;
    bestAt = at;
    best = typeof e.who === 'string' ? e.who.trim() : '';
  }
  return best;
}

/**
 * ЭРХИЙН ШАЛГУУРЫН ХЭРЭГЛЭГЧ (2026-10-06, аудит #2).
 */
function meOf(passed: string | undefined): string {
  return (typeof window !== 'undefined' ? currentUser() ?? '' : passed ?? '').trim().toLowerCase();
}
import {
  bagtsFor, flowAclReady, isViewOnly, stageOfUser,
} from './guitsetgelAcl';
import { appendHistory, type HistEntry } from './hyanaltHistory';
import { encodeOkCells } from './hyanaltOkCells';
import type { ArchivingMark, StagedSubmission, SubmissionPayload } from './submission';
import { AUTH, bagtsKey, roleForUser } from './services';
import { roleOf } from './permissions';
import { currentUser } from './who';
import { arcgisPost } from './query';
import { isLostWrite } from './lostWrite';
import { serverNow, syncServerClock } from './serverClock';
import { batchInvalidate, invalidate, register } from './dataBus';

const selfFullName = new Map<string, string>();
const EXPIRED = Symbol('expired');
async function loginFullName(u: string): Promise<string | null | typeof EXPIRED> {
  const hit = selfFullName.get(u);
  if (hit != null) return hit;
  try {
    const j = await arcgisPost<{ username?: string; fullName?: string }>(
      `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest/community/self`, {},
    );
    if (String(j?.username ?? '').trim().toLowerCase() !== u) return null;
    const n = String(j?.fullName || j?.username || '').trim();
    selfFullName.set(u, n);
    return n;
  } catch (e) {
    const x = e as { sessionExpired?: boolean; code?: number; cause?: { sessionExpired?: boolean; code?: number } } | null;
    if (x?.sessionExpired === true || x?.code === 498 || x?.cause?.sessionExpired === true || x?.cause?.code === 498) return EXPIRED;
    return null;
  }
}
async function whoDeny(who: string): Promise<string | null> {
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  const u = (currentUser() ?? '').trim().toLowerCase();
  if (!u) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  const w = who.trim().toLowerCase();
  if (w === u) return null;
  const full = await loginFullName(u);
  if (full === EXPIRED) return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  if (full != null && full.toLowerCase() === w) return null;
  return full == null
    ? tr('Нэвтэрсэн хэрэглэгчийн нэрийг порталаас баталгаажуулж чадсангүй — шийдвэр бүртгэгдсэнгүй, дахин оролдоно уу.')
    : tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.');
}

export const lostWrite = (e: unknown): boolean =>
  isLostWrite(e) || isLostWrite((e as { cause?: unknown } | null)?.cause);
async function lostResult(e: unknown): Promise<Result> {
  console.warn('[selbe] хяналтын бичилтийн хариу алдагдсан:', e);
  await refreshQuiet();
  emit();
  return {
    ok: false,
    error: tr('Хариу алдагдсан — шийдвэр хадгалагдсан эсэх тодорхойгүй. Жагсаалтыг дахин ачааллаа: төлөвийг шалгаад, өөрчлөгдөөгүй бол дахин оролдоно уу. ({0})', String((e as Error)?.message ?? e)),
  };
}

/**
 * ДОМЭЙН ТҮВШНИЙ ЭРХИЙН ХАМГААЛАЛТ (2026-09-16-ны аудит).
 */
function authz(
  stage: ReviewStage,
  me: string | undefined,
  bagts: string,
  bypass: boolean,
  hist?: unknown,
  /** R5 нөөц — хяналтын мөр ба энэ шийдвэрийн дэлгэцийн нэр (`hist`-тэй хамт л) */
  same?: { row: Row; who: string },
  submitters?: readonly string[],
): string | null {
  const u = meOf(me);
  let by = bypass;
  if (typeof window !== 'undefined') {
    const passed = (me ?? '').trim().toLowerCase();
    if (AUTH.appId && passed && passed !== u) {
      return tr('Дамжуулсан хэрэглэгч нэвтэрсэн хэрэглэгчтэй таарахгүй — шийдвэр бүртгэгдэхгүй.');
    }
    by = bypass && (!AUTH.appId || roleForUser(u) === 'super');
  }
  if (by) return null;
  if (!u) return tr('Нэвтрээгүй байна — шийдвэр бүртгэгдэхгүй.');
  if (isViewOnly(u)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — шийдвэр гаргах боломжгүй.');
  if (roleOf(u) === 'zahiral') return tr('Ерөнхий захирал гүйцэтгэлийг зөвхөн ХАРНА — шийдвэр гаргах боломжгүй.');
  if (stageOfUser(u) !== stage) {
    return tr('Та энэ шатны хянагчаар томилогдоогүй байна.');
  }
  const sc = bagtsFor(u, stage);
  if (sc !== null && !sc.includes(bagts)) {
    return tr('Энэ багц танд хуваарилагдаагүй байна.');
  }
  return selfApprovalDeny(stage, u, hist, same, submitters);
}

const SAME_ROUND_MSG = (): string =>
  tr('Энэ илгээлтийг та өөр шатанд аль хэдийн зөвшөөрсөн — нэг илгээлтийг нэг хүн хоёр шатанд шийдвэрлэх боломжгүй.');
const PREV_STAGE_MSG = (): string =>
  tr('Өмнөх шатыг та өөрөө зөвшөөрсөн — дараалсан хоёр шатыг нэг хүн шийдвэрлэх боломжгүй.');

/**
 * ӨӨРИЙГӨӨ БАТЛАХ ДҮРЭМ — ЦЭВЭР (`hyanaltAuthz.check.mjs`). `authz`-ийн томилгоо/хүрээний ДАРАА (2026-10-19, аудит).
 */
export function selfApprovalDeny(
  stage: ReviewStage,
  u: string,
  hist?: unknown,
  same?: { row: Row; who: string },
  submitters?: readonly string[],
): string | null {
  const sd = submitterDeny(stage, u, submitters);
  if (sd) return sd;
  if (hist === undefined) return null;
  const pv0 = prevReview(stage);
  const other = approvedStagesOf(hist, u).filter((st) => st !== stage);
  if (other.length) return pv0 && other.includes(pv0) ? PREV_STAGE_MSG() : SAME_ROUND_MSG();
  if (same) {
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const me = norm(same.who);
    for (let pv = pv0; pv; pv = prevReview(pv)) {
      if (lastApprover(hist, pv)) continue;
      const pw = norm((same.row as Record<string, unknown>)[SF[pv].who]);
      if (me && pw && pw === me) return pv === pv0 ? PREV_STAGE_MSG() : SAME_ROUND_MSG();
    }
  }
  return null;
}

/** Энэ тойргийн логт `u` ЗӨВШӨӨРСӨН (`approve`/`recheck-ok`) шатууд — давхардалгүй (2026-10-19) */
export function approvedStagesOf(raw: unknown, u: string): ReviewStage[] {
  const me = u.trim().toLowerCase();
  if (!me) return [];
  const out = new Set<ReviewStage>();
  for (const e of rawHist(raw)) {
    if (e.act !== 'approve' && e.act !== 'recheck-ok') continue;
    if (typeof e.u !== 'string' || e.u.trim().toLowerCase() !== me) continue;
    if ((REVIEW_STAGES as readonly unknown[]).includes(e.stage)) out.add(e.stage as ReviewStage);
  }
  return [...out];
}

export function submitterDeny(_stage: ReviewStage, u: string, submitters?: readonly string[]): string | null {
  if (submitters?.includes(u)) {
    return tr('Энэ гүйцэтгэлийг та өөрөө илгээсэн — өөрийн илгээлтийг хянах боломжгүй.');
  }
  return null;
}

async function submittersFor(
  _stage: ReviewStage, row: Row, me: string | undefined, _bypass: boolean,
): Promise<{ ok: true; list?: string[] } | { ok: false; error: string }> {
  if (typeof window === 'undefined' || !AUTH.appId || !meOf(me)) return { ok: true };
  if (_bypass && roleForUser(meOf(me)) === 'super') return { ok: true };
  const so = Number(row[F.sheetOid]);
  if (!Number.isInteger(so) || so <= 0) return { ok: true };
  return submittersOfRow(so, row[F.bagts]);
}

async function submittersOfRow(so: number, bagts: unknown): Promise<{ ok: true; list?: string[] } | { ok: false; error: string }> {
  const { readSubmissionByOid, submittersOf } = await import('./submission');
  const sr = await readSubmissionByOid(so);
  if (!sr.ok) return { ok: false, error: sr.error };
  if (!sr.sub) return { ok: true };
  const { PKGS } = await import('@/modules/sheet/bagts.pkg');
  const grp = PKGS.find((p) => p.key === sr.sub?.payload.pkgKey)?.group;
  if (grp == null || bagtsKey(grp) !== bagtsKey(String(bagts ?? ''))) return { ok: true };
  return { ok: true, list: submittersOf(sr.sub.payload) };
}

/* ── ArcGIS ↔ програмын хэлбэр ── */

/** ArcGIS огноог epoch ms-ээр өгдөг — ISO болгоно */
const toIso = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? new Date(v).toISOString() : null;

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toRow(a: Attrs): Row {
  return {
    __oid: num(a[HYANALT.oid]),
    [F.id]: str(a[F.id]),
    [F.sheetOid]: num(a[F.sheetOid]),
    [F.ergelt]: num(a[F.ergelt]),
    [F.bagts]: str(a[F.bagts]),
    [F.ajil]: str(a[F.ajil]),
    [F.company]: str(a[F.company]),
    [F.companySent]: toIso(a[F.companySent]),
    [F.engineer]: str(a[F.engineer]),
    [F.engineerDecision]: str(a[F.engineerDecision]) as Decision | '',
    [F.engineerReason]: str(a[F.engineerReason]),
    [F.engineerReturned]: toIso(a[F.engineerReturned]),
    [F.engineerSent]: toIso(a[F.engineerSent]),
    [F.manager]: str(a[F.manager]),
    [F.managerDecision]: str(a[F.managerDecision]) as Decision | '',
    [F.managerReason]: str(a[F.managerReason]),
    [F.managerReturned]: toIso(a[F.managerReturned]),
    [F.managerSent]: toIso(a[F.managerSent]),
    [F.planner]: str(a[F.planner]),
    [F.plannerDecision]: str(a[F.plannerDecision]) as Decision | '',
    [F.plannerReason]: str(a[F.plannerReason]),
    [F.plannerReturned]: toIso(a[F.plannerReturned]),
    [F.plannerSent]: toIso(a[F.plannerSent]),
    [F.director]: str(a[F.director]),
    [F.directorDecision]: str(a[F.directorDecision]) as Decision | '',
    [F.directorReason]: str(a[F.directorReason]),
    [F.directorReturned]: toIso(a[F.directorReturned]),
    [F.directorSent]: toIso(a[F.directorSent]),
    [F.head]: str(a[F.head]),
    [F.headDecision]: str(a[F.headDecision]) as Decision | '',
    [F.headReason]: str(a[F.headReason]),
    [F.headReturned]: toIso(a[F.headReturned]),
    [F.headSent]: toIso(a[F.headSent]),
    [F.chief]: str(a[F.chief]),
    [F.chiefDecision]: str(a[F.chiefDecision]) as Decision | '',
    [F.chiefReason]: str(a[F.chiefReason]),
    [F.chiefReturned]: toIso(a[F.chiefReturned]),
    [F.chiefSent]: toIso(a[F.chiefSent]),
    [F.okCells]: str(a[F.okCells]),
    [F.history]: str(a[F.history]),
    [F.status]: str(a[F.status]) as Status,
  };
}

export type ReturnInfo = {
  /** Буцаасан шалтгаан (хоосон байж болно — хуучин мөр) */
  reason: string;
  /** Буцаасан хянагчийн дэлгэцийн нэр (хоосон байж болно) */
  by: string;
  /** Буцаасан огноо — ISO мөр, эсвэл `null` */
  at: string | null;
  /** Үргэлж `'engineer'` (2-р шат) — шошгыг `STAGE_LABEL.engineer`-ээс */
  stage: 'engineer';
};
export function returnInfoOf(r: Row | null | undefined): ReturnInfo | null {
  if (!r || r[F.status] !== STATUS.engineerReturned) return null;
  return {
    reason: String(r[F.engineerReason] ?? '').trim(),
    by: String(r[F.engineer] ?? '').trim(),
    at: r[F.engineerReturned] || null,
    stage: 'engineer',
  };
}

/* ── Захиалагчид мэдэгдэх модулийн түвшний store ── */

let ROWS: Row[] = [];
let loaded = false;

/* ═══════════════ БАТЛАЛТ ХАРАГЧ (2026-10-13) ═══════════════
 */
const SEEN_DONE = new Set<number>();
let doneSeeded = false;
/** `[oid, төлөв]` — шинээр «Шилжүүлсэн» болсон мөр байвал гүйцэтгэлийн кэшийг хүчингүй болгоно */
function absorbDone(pairs: Iterable<readonly [number, string]>): void {
  let fresh = 0;
  for (const [oid, st] of pairs) {
    if (st !== STATUS.transferred || !Number.isFinite(oid) || SEEN_DONE.has(oid)) continue;
    SEEN_DONE.add(oid);
    fresh += 1;
  }
  if (!doneSeeded) { doneSeeded = true; return; }
  if (fresh > 0) invalidate('BAGTS_SHEET', 'BAGTS_NEGTGEL', 'HO_IPC', 'HYANALT');
}
const absorbRows = (rows: readonly Row[]): void =>
  absorbDone(rows.map((r) => [r.__oid, String(r[F.status] ?? '')] as const));
/** `queryStatusSig` («oid:төлөв,oid:төлөв») → хос */
const sigPairs = (sig: string): [number, string][] => (sig ? sig.split(',').map((p) => {
  const i = p.indexOf(':');
  return [Number(p.slice(0, i)), p.slice(i + 1)];
}) : []);
let watchUsers = 0;
let watchOff: (() => void) | null = null;
let watchBusy = false;
let watchWarned = false;
async function watchOnce(): Promise<void> {
  if (watchBusy || typeof document === 'undefined' || document.visibilityState === 'hidden') return;
  watchBusy = true;
  try {
    absorbDone(sigPairs(await queryStatusSig()));
  } catch (e) {
    if (!watchWarned) { watchWarned = true; console.warn('[selbe] батлалт харагч: төлөв уншигдсангүй', e); }
  } finally { watchBusy = false; }
}
/**
 * Порталын хэмжээнд БАТЛАЛТ ХАРАГЧ эхлүүлнэ (`Portal`) — тайлах функц буцаана. Олон дуудагч нэг таймер
 * хуваалцана (ref-count). Дээрх -ийг үз.
 */
export function startApprovalWatch(): () => void {
  if (typeof window === 'undefined') return () => {};
  watchUsers += 1;
  if (watchUsers === 1) {
    void watchOnce();
    const iv = setInterval(() => { void watchOnce(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void watchOnce(); };
    const onFocus = () => { void watchOnce(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    watchOff = () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    watchUsers -= 1;
    if (watchUsers === 0) { watchOff?.(); watchOff = null; }
  };
}
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function refresh(): Promise<void> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  absorbRows(ROWS);
  emit();
}

/**
 * БИЧИЛТИЙН ДАРААХ дахин ачаалалт — алдааг ШИДЭХГҮЙ (2026-09-30).
 */
async function refreshQuiet(): Promise<void> {
  try { await refresh(); } catch (e) { console.warn('[selbe] шийдвэрийн дараах дахин ачаалалт унав:', e); }
}

/**
 * ШИЙДВЭРИЙН АНХААРУУЛГА — илгээлтийн oid → шар мөр (2026-10-04).
 */
export type ApplyWarn = { text: string; ajil: string; bagts: string; at: number };
const WARNS = new Map<number, ApplyWarn>();
let warnSnap: [number, ApplyWarn][] = [];
const warnSubs = new Set<() => void>();
function putWarn(key: number, w: ApplyWarn): void {
  WARNS.set(key, w);
  warnSnap = [...WARNS.entries()].sort((x, y) => y[1].at - x[1].at);
  warnSubs.forEach((f) => f());
}
export function dismissApplyWarn(key: number): void {
  if (!WARNS.delete(key)) return;
  warnSnap = [...WARNS.entries()].sort((x, y) => y[1].at - x[1].at);
  warnSubs.forEach((f) => f());
}
/** Шинэ нь эхэндээ — `[илгээлтийн oid, анхааруулга]` */
export function useApplyWarns(): [number, ApplyWarn][] {
  return useSyncExternalStore(
    (f) => { warnSubs.add(f); return () => { warnSubs.delete(f); }; },
    () => warnSnap,
    () => warnSnap,
  );
}

/**
 * ШИЙДВЭРИЙН АЛДАА — ажлын түлхүүр (`Work.key`) → мессеж (2026-10-12, R2).
 */
const DECISION_ERRS = new Map<string, string>();
const errSubs = new Set<() => void>();
export function setDecisionErr(key: string, text: string): void {
  if (text) DECISION_ERRS.set(key, text);
  else if (!DECISION_ERRS.delete(key)) return;
  errSubs.forEach((f) => f());
}
/** Тухайн ажлын шийдвэрийн алдаа (`''` = алга) — жагсаалт хооронд шилжсэн ч хадгалагдана */
export function useDecisionErr(key: string): string {
  return useSyncExternalStore(
    (f) => { errSubs.add(f); return () => { errSubs.delete(f); }; },
    () => DECISION_ERRS.get(key) ?? '',
    () => DECISION_ERRS.get(key) ?? '',
  );
}

/**
 * Мөрийг ШИНЭЭР уншиж буцаана (захиалагчдад мэдэгдэхгүй — дуудагч шийднэ).
 */
async function liveRow(oid: number): Promise<Row | undefined> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  absorbRows(ROWS);
  return ROWS.find((r) => r.__oid === oid);
}

/**
 * Шат бүрд хүлээгдэх ЯГ тэр төлөв — өөр төлөвтэй мөрд шийдвэр бичихгүй.
 */

const STALE = () => tr('Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу');

/**
 * Бичихийн өмнөх мэдээллийн шалгалт; атом нөхцөлийг `updateDecision` сервер дээр шалгана.
 *
 * `apply`/`recheck` мөрийг эхэнд нэг удаа
 *    уншдаг ч түүнээс хойш эрх, илгээлтийн агуулга (`subAt`), `okCellsPatch`
 *    гэх мэт сүлжээний алхмууд явдаг тул нэг шатанд ХОЁР данс томилогдсон үед
 *    хоёулаа эхний шалгуурыг давж, сүүлд бичсэн нь өмнөхийн шийдвэрийг
 *    (шалтгаан, огноо, нэр) ЧИМЭЭГҮЙ дардаг байв. Эцсийн шатны
 *    `archiveSubmission`-ийн «бичихийн өмнө дахин шалгах»-тай ижил санаа:
 *    цонх атом биш ч секундээс мс болж нарийсна.
 */
async function movedSince(oid: number, prev: Row, stage: ReviewStage): Promise<string | null> {
  let now: Row | undefined;
  try { now = await liveRow(oid); } catch (e) {
    return tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e));
  }
  const f = SF[stage];
  const actor = (r: Row | undefined) => String((r as Record<string, unknown> | undefined)?.[f.who] ?? '').trim();
  const busy = (name: string) => (name
    ? tr('Энэ ажлыг {0} таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.', name)
    : tr('Энэ ажлыг өөр хэрэглэгч таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.'));
  if (!now) return tr('Бүртгэл олдсонгүй');
  const keys = [F.status, F.okCells, F.history, f.who, f.decision, f.reason, f.returned, f.sent];
  const val = (r: Row, k: string) => String((r as Record<string, unknown>)[k] ?? '');
  if (keys.some((k) => val(now as Row, k) !== val(prev, k))) return busy(actor(now));
  const so = Number(prev[F.sheetOid]);
  const twin = Number.isInteger(so) && so > 0 && ROWS.find((r) => r.__oid !== oid && Number(r[F.sheetOid]) === so
    && r[F.bagts] === prev[F.bagts] && Number(r[F.ergelt]) > Number(prev[F.ergelt]));
  if (twin) return busy(actor(twin));
  return null;
}

export function useHyanaltRows(): {
  rows: Row[];
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const [, tick] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    refresh().catch((e) => setError(String((e as Error)?.message ?? e)));
  }, []);

  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!loaded) refresh().catch((e) => setError(String((e as Error)?.message ?? e)));
    const offPoll = startPoll();
    return () => { subs.delete(f); offPoll(); };
  }, []);

  return { rows: ROWS, loading: !loaded && !error, error, reload: load };
}

/**
 * ДАРААЛЛЫН АВТОМАТ ШИНЭЧЛЭЛТ (2026-10-04).
 */
const POLL_MS = 60_000;
let pollUsers = 0;
let pollOff: (() => void) | null = null;
let polling = false;
const rowsSig = () => ROWS.slice().sort((x, y) => x.__oid - y.__oid)
  .map((r) => `${r.__oid}:${String(r[F.status] ?? '')}`).join(',');
async function pollOnce(): Promise<void> {
  if (polling || !loaded || typeof document === 'undefined' || document.visibilityState === 'hidden') return;
  polling = true;
  try {
    const sig = await queryStatusSig();
    absorbDone(sigPairs(sig));
    if (sig !== rowsSig()) await refresh();
  } catch (e) {
    console.warn('[selbe] хяналтын дарааллын шинэчлэлт унав:', e);
  } finally { polling = false; }
}
function startPoll(): () => void {
  pollUsers += 1;
  if (pollUsers === 1 && typeof window !== 'undefined') {
    const iv = setInterval(() => { void pollOnce(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void pollOnce(); };
    const onFocus = () => { void pollOnce(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    pollOff = () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pollUsers -= 1;
    if (pollUsers === 0) { pollOff?.(); pollOff = null; }
  };
}

/**
 * ТАНЫ ШАТАНД ХҮЛЭЭГДЭЖ БУЙ ХЯНАЛТЫН ТОО — цэсний тэмдэг (`navBadges`, 2026-10-04).
 */
let badgeRows: { at: number; rows: Row[] } | null = null;
register(() => { badgeRows = null; }, ['HYANALT']);
export async function countReviewPending(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (!me || !flowAclReady()) return null;
    const stage = stageOfUser(me);
    if (!stage) return null;
    if (isViewOnly(me)) return 0;
    const role = roleOf(me);
    if (role === 'zahiral') return 0;
    const sc = role === 'super' ? null : bagtsFor(me, stage);
    if (Array.isArray(sc) && sc.length === 0) return 0;
    let rows: Row[];
    if (loaded) rows = ROWS;
    else if (badgeRows && Date.now() - badgeRows.at < POLL_MS) rows = badgeRows.rows;
    else { rows = (await queryAll()).map(toRow); badgeRows = { at: Date.now(), rows }; }
    const { groupWorks } = await import('./hyanaltGroup');
    const ws = groupWorks(rows).filter((w) => w.owner === stage && w.status !== STATUS.transferred
      && (sc == null || sc.includes(w.bagts)));
    const blocked = await selfBlocks(ws, me, stage);
    return ws.filter((w) => !blocked.has(w.key)).length;
  } catch {
    return null;
  }
}
const badgeSubs = new Map<number, { at: number; list: string[] }>();

export async function selfBlocks(
  works: readonly Work[], username: string | null | undefined, stage: Stage,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const me = (username ?? '').trim().toLowerCase();
  if (!me || stage === 'company') return out;
  if (roleForUser(me) === 'super') return out;
  const st = stage as ReviewStage;
  const pv = prevReview(st);
  const rest: Work[] = [];
  for (const w of works) {
    const other = approvedStagesOf(w.current[F.history], me).filter((x) => x !== st);
    if (other.length) out.set(w.key, pv && other.includes(pv) ? PREV_STAGE_MSG() : SAME_ROUND_MSG());
    else rest.push(w);
  }
  if (!rest.length) return out;
  const lists = await Promise.all(rest.map(async (w): Promise<string[] | undefined> => {
    const so = Number(w.current[F.sheetOid]);
    if (!Number.isInteger(so) || so <= 0) return undefined;
    const hit = badgeSubs.get(so);
    if (hit && Date.now() - hit.at < POLL_MS) return hit.list;
    try {
      const sr = await submittersOfRow(so, w.current[F.bagts]);
      if (!sr.ok) return undefined;
      const list = sr.list ?? [];
      badgeSubs.set(so, { at: Date.now(), list });
      return list;
    } catch { return undefined; }
  }));
  rest.forEach((w, i) => {
    const d = submitterDeny(st, me, lists[i]);
    if (d) out.set(w.key, d);
  });
  return out;
}

/* ── Үйлдэл ── */

const nextId = () => {
  const max = ROWS.reduce((m, r) => {
    const n = Number(String(r[F.id]).replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `G-${String(max + 1).padStart(6, '0')}`;
};

export type Result = {
  ok: boolean;
  error?: string;
  warn?: string;
  contentChanged?: true;
};

const fail = (e: unknown): Result => ({ ok: false, error: String((e as Error)?.message ?? e) });

const ARCHIVED_NO_RETURN = () => tr('Архивт аль хэдийн бичигдсэн — дахин Батлах дарна уу, буцааж болохгүй');

/** Архивлалтын үр дүн — амжилттай бол нэгтгэлд бүртгэх АРХИВЫН OBJECTID. */
type Archived =
  | { ok: true; archiveOid: number; day?: string; pkgKey?: string; warn?: string; reopen?: { fillMs: number; sheetOid: number; sheet: string }; empty?: true }
  | { ok: false; error: string; contentChanged?: true };

/**
 * ХААГДААГҮЙ НЭМЭЛТИЙН ТЭМДЭГ (2026-10-09, R1) — `илгээлтийн oid → { at }` (localStorage).
 */
const UNCLOSED_LS = 'selbe-unclosed-inc';
function unclosedGet(subOid: number): { at: number } | undefined {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UNCLOSED_LS) : null;
    const o = raw ? (JSON.parse(raw) as Record<string, { at?: unknown }>) : null;
    const v = o && typeof o === 'object' ? o[String(subOid)] : undefined;
    return v && typeof v.at === 'number' && Number.isFinite(v.at) ? { at: v.at } : undefined;
  } catch { return undefined; }
}
function unclosedSet(subOid: number, v: { at: number } | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(UNCLOSED_LS);
    const o = (raw ? JSON.parse(raw) : {}) as Record<string, { at: number }>;
    const next = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    if (v) next[String(subOid)] = v; else delete next[String(subOid)];
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete next[k];
    localStorage.setItem(UNCLOSED_LS, JSON.stringify(next));
  } catch { /* хаалттай орчин */ }
}

/**
 * ЭНЭ СЕШНД АРХИВЛАГДСАН ИЛГЭЭЛТ — `илгээлтийн oid → архивын oid`.
 */
const ARCHIVED = new Map<string, { oid: number; day: string }>();
const ARCHIVED_LS = 'selbe-archived-subs';
function archivedGet(key: string): { oid: number; day: string } | undefined {
  const m = ARCHIVED.get(key);
  if (m) return m;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ARCHIVED_LS) : null;
    if (!raw) return undefined;
    const o = JSON.parse(raw) as Record<string, { oid?: unknown; day?: unknown }>;
    const v = o && typeof o === 'object' ? o[key] : undefined;
    if (v && Number.isInteger(v.oid) && typeof v.day === 'string') {
      const hit = { oid: v.oid as number, day: v.day };
      ARCHIVED.set(key, hit);
      return hit;
    }
  } catch { /* хаалттай орчин / эвдэрсэн JSON */ }
  return undefined;
}
function archivedSet(key: string, v: { oid: number; day: string }): void {
  ARCHIVED.set(key, v);
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(ARCHIVED_LS);
    const o = (raw ? JSON.parse(raw) : {}) as Record<string, { oid: number; day: string }>;
    const next = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    next[key] = v;
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete next[k];
    localStorage.setItem(ARCHIVED_LS, JSON.stringify(next));
  } catch { /* хаалттай орчин */ }
}

/**
 * IPC-ийн `skip` үр дүн АМЖИЛТ БИШ эсэх.
 */
function ipcSkipIsFailure(r: { ok: true; op: string; why?: string }): boolean {
  return r.op === 'skip' && r.why !== 'no-data';
}

/**
 * «АРХИВЛАЖ БАЙНА» ТЭМДГИЙН ЖААЗ АРХИВТ БУУСАН УУ (2026-10-09; урьд нь `archiveSubmission` дотор шууд байсныг
 * `FillNew.publish` ба эцсийн шатны буцаалт ч хэрэглэхээр гаргав — нэг дүрэм).
 *   · буусан жаазын эхний OID · `null` (буугаагүй) · `'ambiguous'` (`matchArchivedFrame` — ТАТГАЛЗ);
 *   · уншилт унавал / огнооны талбаргүй багц → THROW (шийдэх боломжгүй — дуудагч fail-closed).
 */
export async function probeArchivedFrame(pkgKey: string, mark: ArchivingMark): Promise<number | null | 'ambiguous'> {
  const [{ PKGS, fillSchema }, { agsFetch }, { msToDay, dayFilter }, { matchArchivedFrame }] = await Promise.all([
    import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags'), import('@/modules/sheet/bagtsSheet'), import('./submission'),
  ]);
  const pkg = PKGS.find((p) => p.key === pkgKey);
  if (!pkg) throw new Error(tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey));
  const sc = await fillSchema(pkg);
  if (!sc.f.fillDate) throw new Error(tr('Багцын хуудсанд бөглөсөн огнооны талбар алга — өмнөх архивлалтыг шалгах боломжгүй'));
  const outFields = [...new Set([sc.f.oid, sc.f.no, ...(mark.probe ?? []).map((p) => p[1])])].join(',');
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: `${sc.f.oid} > ${mark.maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(mark.fillMs))}`,
      outFields,
      orderByFields: `${sc.f.oid} ASC`,
      resultRecordCount: '2000',
      resultOffset: String(offset),
      returnGeometry: 'false',
    });
    const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
    rows.push(...fs.map((f) => f.attributes));
    if (!j?.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }
  const dateFields = [...sc.start, ...sc.end].filter((f): f is string => !!f);
  return matchArchivedFrame(rows, mark, sc.f.oid, sc.f.no, dateFields);
}

/**
 * ХУУЧИРСАН ТЭМДГИЙН ТАСАРСАН ЖААЗЫГ ЦЭВЭРЛЭНЭ (2026-10-11, аудит №7 — амьд: `Bagts_3_2_9f`, 2026-10-11:
 * газрын даргын батлалт 1-р багц (500 мөр) бичээд унасан, буцаалт ажилсангүй; `sub|` мөрөнд тэмдэг үлдсэн).
 */
export async function cleanupTruncatedFrame(pkgKey: string, mark: ArchivingMark): Promise<{ deleted: number } | { error: string }> {
  const [{ PKGS, fillSchema }, { agsFetch }, { msToDay, dayFilter, applyDeletes }, { truncatedFrameIds }] = await Promise.all([
    import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags'), import('@/modules/sheet/bagtsSheet'), import('./submission'),
  ]);
  const pkg = PKGS.find((p) => p.key === pkgKey);
  if (!pkg) return { error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey) };
  const sc = await fillSchema(pkg);
  if (!sc.f.fillDate) return { error: tr('Багцын хуудсанд бөглөсөн огнооны талбар алга — өмнөх архивлалтыг шалгах боломжгүй') };
  const outFields = [...new Set([sc.f.oid, sc.f.no, ...(mark.probe ?? []).map((p) => p[1])])].join(',');
  const rows: Record<string, unknown>[] = [];
  try {
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${pkg.url}/query`, {
        where: `${sc.f.oid} > ${mark.maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(mark.fillMs))}`,
        outFields,
        orderByFields: `${sc.f.oid} ASC`,
        resultRecordCount: '2000',
        resultOffset: String(offset),
        returnGeometry: 'false',
      });
      const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
      rows.push(...fs.map((f) => f.attributes));
      if (!j?.exceededTransferLimit || fs.length === 0) break;
      offset += fs.length;
    }
  } catch (e) {
    return { error: tr('тасарсан жаазыг шалгах уншилт унав ({0})', String((e as Error)?.message ?? e)) };
  }
  if (!rows.length) return { deleted: 0 };
  const dateFields = [...sc.start, ...sc.end].filter((f): f is string => !!f);
  const ids = truncatedFrameIds(rows, mark, sc.f.oid, sc.f.no, dateFields);
  if (!ids) return { error: tr('тэмдгийн өдөрт {0} мөр байна — тасарсан жааз гэж танигдсангүй, админд мэдэгдэнэ үү', String(rows.length)) };
  if (!ids.length) return { deleted: 0 };
  let gone = 0;
  try { gone = await applyDeletes(pkg, ids); } catch (e) {
    return { error: tr('тасарсан жаазыг устгаж чадсангүй ({0})', String((e as Error)?.message ?? e)) };
  }
  if (gone !== ids.length) return { error: tr('тасарсан {0} мөрийн {1}-ийг устгаж чадсангүй — админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай)', String(ids.length), String(ids.length - gone)) };
  console.warn(`[selbe] ${pkg.key}: хуучирсан тэмдгийн тасарсан ${gone} мөрийг архиваас цэвэрлэв (OID > ${mark.maxOid0}, ${msToDay(mark.fillMs)})`);
  return { deleted: gone };
}

const MARK_UNRESOLVED = (why: string) =>
  tr('Өмнөх архивлалт шалгагдаагүй — давхар тоолохоос сэргийлж юу ч бичсэнгүй. Хэдэн минутын дараа дахин оролдоно уу ({0}).', why);

/**
 * АРХИВЫН ЖААЗНЫ БОДИТ ӨДӨР — `archiveOid` мөрийн `fillDate`-ээс, уншиж чадахгүй бол илгээлтийн `fillMs`-ээр.
 */
async function archivedDayOf(pkgKey: string, aOid: number, fm: number | null | undefined): Promise<string | undefined> {
  let day: string | undefined = fm != null && Number.isFinite(fm)
    ? new Date(Math.round(fm / 86_400_000) * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  if (aOid > 0) {
    try {
      const [{ PKGS, fillSchema }, { agsFetch }, { msToDay: m2d, normDayMs: ndm }] = await Promise.all([import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags'), import('@/modules/sheet/bagtsSheet')]);
      const pkg = PKGS.find((p) => p.key === pkgKey);
      if (pkg) {
        const sc = await fillSchema(pkg);
        if (sc.f.fillDate) {
          const j = await agsFetch(`${pkg.url}/query`, { where: `${sc.f.oid} = ${aOid}`, outFields: sc.f.fillDate, returnGeometry: 'false' });
          const v = j.features?.[0]?.attributes?.[sc.f.fillDate];
          if (typeof v === 'number') day = m2d(ndm(v)) || day;
        }
      }
    } catch { /* нөөц `fillMs` хэвээр */ }
  }
  return day;
}

/**
 * СУУРЬ ЖААЗ (`rows` — ачаалсан, `sameFrame`-ээр батлагдсан) АЧААЛСНААС ХОЙШ ЗАСАГДСАН УУ (2026-10-12, A4).
 *   · `EditDate` (`edited`) байвал: жаазын OID-ийн мужийн `max(EditDate)` > бичихийн ӨМНӨ ижил хүсэлтээр авсан `mx0`
 *     (2026-10-12 гүйцэтгэлийн аудит — `frameEditMax`);
 *   · эс бөгөөс: мужийн мөрүүдийг дахин татаж ачаалсан талбар бүрийг (`raw`) тулгана.
 */
/** Суурь жаазын OID-ийн муж (`where`) — мөргүй бол `null` */
function frameOidWhere(oidF: string, rows: readonly { oid: number }[]): string | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) if (Number.isInteger(r.oid) && r.oid > 0) { lo = Math.min(lo, r.oid); hi = Math.max(hi, r.oid); }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return `${oidF} >= ${lo} AND ${oidF} <= ${hi}`;
}

async function frameEditMax(
  url: string,
  edited: string,
  where: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetcher: (url: string, params: Record<string, string>) => Promise<any>,
): Promise<number> {
  const j = await fetcher(`${url}/query`, {
    where,
    outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: edited, outStatisticFieldName: 'mx' }]),
    returnGeometry: 'false',
  });
  const mx = Number(j?.features?.[0]?.attributes?.mx);
  if (!Number.isFinite(mx)) throw new Error(tr('EditDate-ийн дээд утга уншигдсангүй'));
  return mx;
}

async function baseFrameEdited(
  url: string,
  oidF: string,
  edited: string | null | undefined,
  rows: readonly { oid: number; raw: Record<string, unknown> }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetcher: (url: string, params: Record<string, string>) => Promise<any>,
  mx0: number | null = null,
): Promise<boolean> {
  const where = frameOidWhere(oidF, rows);
  if (!where) return false;
  if (edited && mx0 != null) {
    const mx = await frameEditMax(url, edited, where, fetcher);
    return mx > mx0;
  }
  const want = new Map(rows.map((r) => [r.oid, r.raw] as const));
  const keys = Object.keys(rows[0]?.raw ?? {});
  if (!keys.length) return false;
  for (let off = 0; ; ) {
    const j = await fetcher(`${url}/query`, {
      where,
      outFields: [...new Set([oidF, ...keys])].join(','),
      orderByFields: `${oidF} ASC`,
      resultRecordCount: '2000',
      resultOffset: String(off),
      returnGeometry: 'false',
    });
    const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
    for (const f of fs) {
      const prev = want.get(Number(f.attributes[oidF]));
      if (!prev) continue;
      for (const k of keys) if (JSON.stringify(f.attributes[k] ?? null) !== JSON.stringify(prev[k] ?? null)) return true;
    }
    if (!j?.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return false;
}

async function cleanupOtherStale(pkgKey: string, exceptOid: number): Promise<{ deleted: number; blockers: string[] }> {
  const { listActiveSubmissions, markFresh } = await import('./submission');
  const { msToDay } = await import('@/modules/sheet/bagtsSheet');
  const out = { deleted: 0, blockers: [] as string[] };
  const subs = await listActiveSubmissions(pkgKey);
  for (const s of subs) {
    const am = s.payload.archiving;
    if (s.oid === exceptOid || !am) continue;
    const name = tr('илгээлт №{0} ({1}{2})', String(s.oid), msToDay(am.fillMs), am.by ? ` · ${am.by}` : '');
    if (markFresh(am)) { out.blockers.push(`${name} — ${tr('архивлаж байна')}`); continue; }
    let hit: number | null | 'ambiguous';
    try { hit = await probeArchivedFrame(pkgKey, am); } catch (e) {
      out.blockers.push(`${name} — ${String((e as Error)?.message ?? e)}`);
      continue;
    }
    /* буусан (бүтэн) / тодорхойгүй жааз нь ТАСАРСАН биш — энэ уналтын шалтгаан биш, хөндөхгүй */
    if (hit != null) continue;
    const cl = await cleanupTruncatedFrame(pkgKey, am);
    if ('error' in cl) out.blockers.push(`${name} — ${cl.error}`);
    else out.deleted += cl.deleted;
  }
  return out;
}

/**
 * ИЛГЭЭЛТИЙГ АРХИВТ БУУЛГАНА — төлөвлөлтийн ахлах инженер БАТЛАХАД л дуудагдана
 * (дизайны дүрэм 5a–5e).
 *
 * Гурван зам:
 *   · илгээлт олдохгүй  → LEGACY: `Эх_мөрийн_дугаар` нь архивын OBJECTID
 *     (энэ өөрчлөлтөөс өмнөх мөрүүд) — жааз аль хэдийн бичигдсэн;
 *   · илгээлт `done|…`  → аль хэдийн архивлагдсан (idempotent) — дахин бичихгүй;
 *   · идэвхтэй `sub|…`  → сүүлийн жааз + overlay → шинэ жааз `applyAdds`.
 */
async function archiveSubmission(
  cur: Row,
  /**
   * ХЯНАГЧИЙН ХАРСАН илгээлтийн `at` (`apply`-ийн `subAt`). 2026-10-09 (R3): `apply` өөрийн
   * уншилтаар тулгасны ДАРАА энд дахин уншдаг тул завсарт дахин илгээвэл хянагчийн ХАРААГҮЙ
   * агуулга архивлагддаг байв — энд ч тулгана (`contentChanged`).
   */
  subAt?: number,
): Promise<Archived> {
  const subOid = cur[F.sheetOid];
  if (!(Number.isInteger(subOid) && subOid > 0))
    return { ok: true, archiveOid: 0, empty: true, warn: tr('Хяналтын мөрд илгээлтийн дугаар алга (хуучин мөр) — архивт бичих, нэгтгэлд бүртгэх жааз байхгүй.') };
  const { readSubmissionByOid, closeSubmission, markArchiving, frameProbe, markFresh, resolveMark, ARCHIVING_TTL_MS, archivingBusy, lostFrameIds } = await import('./submission');
  const read = await readSubmissionByOid(subOid);
  if (!read.ok) return { ok: false, error: read.error };
  const staged = read.sub;
  if (!staged) return { ok: true, archiveOid: subOid };
  if (staged.done || staged.payload.archiveOid != null) {
    {
      const { PKGS } = await import('@/modules/sheet/bagts.pkg');
      const dp = PKGS.find((p) => p.key === staged.payload.pkgKey);
      if (!dp) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', staged.payload.pkgKey) };
      if (bagtsKey(dp.group) !== bagtsKey(cur[F.bagts]))
        return {
          ok: false,
          error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', dp.group, cur[F.bagts]),
        };
    }
    const aOid = staged.payload.archiveOid ?? 0;
    const day = await archivedDayOf(staged.payload.pkgKey, aOid, staged.payload.fillMs);
    unclosedSet(subOid, null);
    return { ok: true, archiveOid: aOid, day, pkgKey: staged.payload.pkgKey, ...(aOid === 0 && staged.payload.residual === true ? { empty: true as const } : {}) };
  }

  {
    const ro = staged.payload.residualOf;
    if (staged.payload.residual === true && ro && ro.row === cur.__oid) {
      const { PKGS } = await import('@/modules/sheet/bagts.pkg');
      const rp = PKGS.find((p) => p.key === staged.payload.pkgKey);
      if (!rp) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', staged.payload.pkgKey) };
      if (bagtsKey(rp.group) !== bagtsKey(cur[F.bagts]))
        return { ok: false, error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', rp.group, cur[F.bagts]) };
      return {
        ok: true,
        archiveOid: ro.archiveOid,
        day: ro.day,
        pkgKey: rp.key,
        warn: tr('Үндсэн агуулга өмнөх оролдлогоор архивт орсон; батлах явцад дахин илгээсэн үлдэгдэл нэмэлтийг архивлахгүй — шинэ хяналтын тойрогт шилжүүлнэ.'),
        reopen: { fillMs: staged.payload.fillMs, sheetOid: staged.oid, sheet: rp.name },
        ...(ro.archiveOid > 0 ? {} : { empty: true as const }),
      };
    }
  }

  if (subAt == null || staged.at !== subAt)
    return { ok: false, error: tr('Илгээлтийн агуулга өөрчлөгдсөн — дахин уншина уу'), contentChanged: true };

  const seenKey = `${subOid}:${staged.at}`;
  const seen = archivedGet(seenKey);
  if (seen != null) {
    const cl = await closeSubmission(staged.oid, seen.oid, serverNow(), true, staged.at);
    if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй (дахин оролдлого):', cl.error);
    else unclosedSet(subOid, null);
    return { ok: true, archiveOid: seen.oid, day: seen.day, pkgKey: staged.payload.pkgKey };
  }

  {
    const uc = staged.payload.mode === 'inc' && staged.payload.residual !== true ? unclosedGet(subOid) : undefined;
    if (uc && staged.at >= uc.at)
      return {
        ok: false,
        error: tr('Энэ илгээлтийн өмнөх нэмэлт архивт бичигдсэн боловч илгээлт хаагдаагүй хэвээр — дахин батлавал нэмэлт ДАВХАР орно. Архивт юу ч бичсэнгүй; админаар илгээлтийн мөрийг шалгуулна уу.'),
      };
  }

  let pl = staged.payload;
  const { PKGS, fillSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((p) => p.key === pl.pkgKey);
  if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pl.pkgKey) };
  if (bagtsKey(pkg.group) !== bagtsKey(cur[F.bagts]))
    return {
      ok: false,
      error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', pkg.group, cur[F.bagts]),
    };

  const [{ loadRows, applyAdds, applyDeletes, msToDay, dayFilter, addsLost }, { overlaySubmission, buildFrame, assertFrameLength, staleSubmissionKeys, withFrameOcc, needsFrameOcc, laterAsOf }, { sameFrame, fillMsFor }, { agsFetch }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
    import('./ajilApply'),
    import('@/modules/sheet/ags'),
  ]);
  const sc = await fillSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  if (pl.residual === true && !pl.cells.length && !(pl.dates ?? []).length && !pl.adds.length && pl.asOf == null) {
    const fin = await closeAfterArchive(subOid, staged, pl, 0, pkg.name, { row: cur.__oid, day: msToDay(pl.fillMs) });
    if (fin.hold) return { ok: false, error: fin.hold };
    const warns = [tr('Илгээлт агуулгагүй үлдэгдэл байсан тул архивт бичсэнгүй — илгээлтийг хаав.'), ...fin.warns];
    return { ok: true, archiveOid: 0, day: msToDay(pl.fillMs), pkgKey: pkg.key, warn: warns.join(' · '), empty: true, ...(fin.reopen ? { reopen: fin.reopen } : {}) };
  }
  let rebase = false;
  let cleanupWarn = '';
  {
    const am = staged.payload.archiving;
    const carried = !!am && am.at !== staged.at;
    if (am && (carried || sc.f.fillDate)) {
      let hitOid: number | null | 'ambiguous';
      try {
        hitOid = await probeArchivedFrame(pkg.key, am);
      } catch (e) {
        return { ok: false, error: MARK_UNRESOLVED(String((e as Error)?.message ?? e)) };
      }
      if (hitOid === 'ambiguous')
        return { ok: false, error: MARK_UNRESOLVED(tr('архивт ижил урттай жааз байгаа боловч утга нь бөөрөнхийллөөр зөрж байна — админаар шалгуулна уу')) };
      if (!carried && hitOid != null && hitOid > 0) {
        const day = msToDay(am.fillMs);
        archivedSet(seenKey, { oid: hitOid, day });
        const fin = await closeAfterArchive(subOid, staged, pl, hitOid, pkg.name, { row: cur.__oid, day });
        if (fin.hold) return { ok: false, error: fin.hold };
        const warns = [tr('Энэ илгээлт өмнө нь архивт бичигдсэн байсан — дахин бичсэнгүй, илгээлтийг хаав.'), ...fin.warns];
        return { ok: true, archiveOid: hitOid, day, pkgKey: pkg.key, warn: warns.join(' · '), ...(fin.reopen ? { reopen: fin.reopen } : {}) };
      }
      if (carried) {
        if (hitOid != null) rebase = true;
        else if (markFresh(am)) return { ok: false, error: MARK_UNRESOLVED(tr('өмнөх батлалт явж байж магадгүй')) };
      }
      if (hitOid == null && !markFresh(am) && sc.f.fillDate) {
        const cl = await cleanupTruncatedFrame(pkg.key, am);
        if ('error' in cl) return { ok: false, error: MARK_UNRESOLVED(cl.error) };
        if (cl.deleted > 0) cleanupWarn = tr('Өмнөх батлалтын тасарсан {0} мөрийг архиваас цэвэрлэв.', String(cl.deleted));
      }
    }
  }
  const maxOidOf = async (): Promise<number> => {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'mx' }]),
      returnGeometry: 'false',
    });
    const mx = Number(j?.features?.[0]?.attributes?.mx);
    if (!Number.isFinite(mx)) throw new Error(tr('Бүртгэлийн дугаарын дээд утга уншигдсангүй'));
    return mx;
  };
  let maxOid0: number;
  try { maxOid0 = await maxOidOf(); } catch (e) {
    return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) };
  }
  let loaded0: Awaited<ReturnType<typeof loadRows>> | undefined;
  let loadErr = '';
  let blockers: string[] = [];
  try {
    loaded0 = await loadRows(pkg, sc, undefined, undefined, { strict: true });
  } catch (e) {
    loadErr = String((e as Error)?.message ?? e);
    let fix: { deleted: number; blockers: string[] };
    try { fix = await cleanupOtherStale(pkg.key, staged.oid); } catch { fix = { deleted: 0, blockers: [] }; }
    blockers = fix.blockers;
    if (fix.deleted > 0) {
      try {
        loaded0 = await loadRows(pkg, sc, undefined, undefined, { strict: true });
        const w = tr('Өмнөх батлалтын тасарсан {0} мөрийг архиваас цэвэрлэв.', String(fix.deleted));
        cleanupWarn = cleanupWarn ? `${cleanupWarn} · ${w}` : w;
      } catch (e2) { loadErr = String((e2 as Error)?.message ?? e2); }
    }
  }
  if (!loaded0)
    return {
      ok: false,
      error: blockers.length ? `${loadErr} · ${tr('Хаагч илгээлт: {0}', blockers.join('; '))}` : loadErr,
    };
  const loaded = loaded0;
  let baseRows0: Awaited<ReturnType<typeof loadRows>>['rows'] | null = null;
  if (pl.base != null && needsFrameOcc(pl, loaded.rows)) {
    try {
      baseRows0 = (await loadRows(pkg, sc, msToDay(pl.base))).rows;
      pl = withFrameOcc(pl, baseRows0);
    } catch { baseRows0 = null; }
  }
  const plAll = pl;
  if (rebase) {
    const rb = resolveMark(pl, true);
    if (!rb)
      return { ok: false, error: MARK_UNRESOLVED(tr('өмнөх агуулга архивт бичигдсэн боловч шинэ илгээлтээс түүнийг хасаж чадсангүй')) };
    pl = rb;
  }
  /** Нүдний түлхүүрүүд → «№ ¦ Ажил · блок · эхлэх/дуусах» (эхний 10) — алдаа/анхааруулгад */
  const label = new Map(pl.rowKeys ?? []);
  const nameKeys = (keys: string[]): string => {
    const names = keys.slice(0, 10).map((k) => {
      const parts = k.split(':');
      const oid = Number(parts[0]);
      const b = Number(parts[1]);
      const blk = Number.isInteger(b) && sc.bld[b] ? sc.bld[b] : '—';
      const se = parts[2] === 's' ? tr('эхлэх') : parts[2] === 'e' ? tr('дуусах') : '';
      return `${label.get(oid) ?? `#${oid}`} · ${blk}${se ? ` · ${se}` : ''}`;
    });
    const more = keys.length > names.length ? ` … +${keys.length - names.length}` : '';
    return names.join('; ') + more;
  };
  const lastDay0 = loaded.snapshot != null ? msToDay(loaded.snapshot) : '';
  let skipped: string[] = [];
  let plEff = pl;
  const incPl = pl.mode === 'inc';
  const needStale = !incPl || (pl.dates ?? []).length > 0;
  if (needStale && lastDay0 && lastDay0 > msToDay(pl.fillMs) && loaded.snapshot !== pl.base) {
    if (pl.base == null)
      return {
        ok: false,
        error: tr('Архивт {0}-ны жааз аль хэдийн байгаа тул {1}-ны илгээлтийг суурьгүйгээр бичвэл хуримтлал буурна. Архивт юу ч бичсэнгүй — гүйцэтгэгчээр дахин илгээүүлнэ үү.', lastDay0, msToDay(pl.fillMs)),
      };
    let baseRows: Awaited<ReturnType<typeof loadRows>>['rows'];
    try {
      baseRows = baseRows0 ?? (await loadRows(pkg, sc, msToDay(pl.base))).rows;
    } catch (e) {
      return { ok: false, error: tr('Илгээлтийн суурь жаазыг уншиж чадсангүй — архивт юу ч бичсэнгүй: {0}', String((e as Error)?.message ?? e)) };
    }
    skipped = staleSubmissionKeys(baseRows, loaded.rows, pl, nBld);
    if (skipped.length) {
      const drop = new Set(skipped);
      plEff = {
        ...pl,
        cells: (pl.cells ?? []).filter(([k]) => !drop.has(k)),
        dates: (pl.dates ?? []).filter(([k]) => !drop.has(k)),
      };
    }
  }
  const ov = overlaySubmission(loaded.rows, plEff, sc, nBld);
  if (ov.unmoved > 0) {
    return {
      ok: false,
      error: tr('{0} нүдийг шинэ мөрүүдэд тулгаж чадсангүй — архивт бичсэнгүй. Гүйцэтгэгчээр дахин илгээүүлнэ үү. Тулгагдаагүй: {1}', String(ov.unmoved), nameKeys(ov.unmovedKeys)),
    };
  }
  if (ov.negative > 0) {
    return {
      ok: false,
      error: tr('{0} нүдний нэмэлт нийт дүнг сөрөг болгоно (суурь утгаас их хасалт) — архивт бичсэнгүй. Гүйцэтгэгчээр залруулуулж дахин илгээүүлнэ үү: {1}', String(ov.negative), nameKeys(ov.negKeys)),
    };
  }
  const asOf = laterAsOf(ov.asOf, loaded.asOf);

  /*
   * БӨГЛӨСӨН ӨДӨР — илгээсэн өдөр (`payload.fillMs`).
   */
  let fillMs = pl.fillMs;
  const lastDay = loaded.snapshot != null ? msToDay(loaded.snapshot) : '';
  if (lastDay && lastDay >= msToDay(fillMs)) fillMs = fillMsFor(serverNow(), loaded.snapshot);

  /* ── САРЫН ЗАДАРГАА — дэлгэцтэй ИЖИЛ томъёо ────────────────────────
   */
  const { loadPkgPlan, planPctFromMonths } = await import('@/lib/huvaariObyem');
  let obPlan: Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null = null;
  try {
    obPlan = (await loadPkgPlan(pkg.key)).plan;
  } catch {
    obPlan = null;
  }
  const frame = buildFrame(ov.rows, sc, nBld, asOf, hasObyem, fillMs, {}, {},
    (row, b) => {
      if (!obPlan || row.des == null || asOf == null) return null;
      const blok = sc.bld[b];
      const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
      return m ? planPctFromMonths(m, asOf, { start: row.start[b] ?? null, end: row.end[b] ?? null }) : null;
    });
  const added = ov.rows.length - loaded.rows.length;
  if (added < 0)
    return {
      ok: false,
      error: tr(
        '«{0}»: угсарсан жааз {1} мөр — ачаалсан {2} мөрөөс БОГИНО. Архивт ЮУ Ч бичсэнгүй.',
        pkg.label,
        String(frame.length),
        String(loaded.frameLen),
      ),
    };
  try {
    assertFrameLength(frame.length, loaded.frameLen + added, pkg.label);
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
  {
    const again = await readSubmissionByOid(subOid);
    if (!again.ok) return { ok: false, error: again.error };
    if (!again.sub) return { ok: false, error: tr('Илгээлт энэ хооронд устгагдлаа — архивт юу ч бичсэнгүй') };
    if (again.sub.done || again.sub.payload.archiveOid != null) {
      const aOid2 = again.sub.payload.archiveOid ?? 0;
      return { ok: true, archiveOid: aOid2, day: await archivedDayOf(pkg.key, aOid2, again.sub.payload.fillMs), pkgKey: pkg.key };
    }
    if (again.sub.at !== staged.at)
      return { ok: false, error: tr('Илгээлт энэ хооронд өөрчлөгдлөө — дахин нээж баталгаажуулна уу') };
  }
  /** Өөрийн тэмдгийг арилгана — ЗӨВХӨН архив өөрчлөгдөөгүй нь БАТАЛГААТАЙ үед (R2-b: үр дүнг шалгана) */
  const clearMark = async (): Promise<string> => {
    const r = await markArchiving(staged.oid, staged.at, null)
      .catch((x: unknown) => ({ ok: false as const, error: String((x as Error)?.message ?? x) }));
    return r.ok ? '' : ` · ${tr('«Архивлаж байна» тэмдгийг арилгаж чадсангүй ({0})', r.error ?? '')}`;
  };
  const prevByOid = new Map(loaded.rows.map((r) => [r.oid, r.raw]));
  const probeFields = [...sc.act, ...sc.obyem, ...sc.start, ...sc.end].filter((f): f is string => !!f);
  const probe = frameProbe(frame, (i) => prevByOid.get(ov.rows[i]?.oid ?? -1), probeFields);
  const rootNo = String(frame[0]?.[sc.f.no] ?? '').trim();
  const dateFields = [...sc.start, ...sc.end].filter((f): f is string => !!f);
  {
    const mr = await markArchiving(staged.oid, staged.at, {
      at: staged.at, startedAt: serverNow(), maxOid0, fillMs, n: frame.length,
      ...(rootNo && rootNo.length <= 64 ? { rootNo } : {}),
      ...(probe.length ? { probe } : {}),
    });
    if (!mr.ok)
      return mr.busy
        ? { ok: false, error: mr.error ?? '' }
        : mr.changed
          ? { ok: false, error: tr('Илгээлт энэ хооронд өөрчлөгдлөө — дахин нээж баталгаажуулна уу'), contentChanged: true }
          : { ok: false, error: tr('Архивлах тэмдэг бичигдсэнгүй — архивт юу ч бичсэнгүй, дахин оролдоно уу ({0})', mr.error ?? '') };
  }
  {
    let otherArch: { who: string; at: number } | null;
    try {
      otherArch = await archivingBusy(pkg.key, staged.oid);
    } catch (e) {
      return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) + (await clearMark()) };
    }
    if (otherArch)
      return { ok: false, error: tr('{0} энэ багцын өөр илгээлтийг яг одоо архивлаж байна — дуусахыг хүлээгээд дахин оролдоно уу. Юу ч бичсэнгүй.', otherArch.who || tr('Өөр хянагч')) + (await clearMark()) };
  }
  let editMax0: number | null = null;
  {
    let stop = '';
    try {
      const now2 = await loadRows(pkg, sc, undefined, undefined, { strict: true });
      if (!sameFrame(loaded, now2))
        stop = tr('Ачаалснаас хойш хуудасны мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — юу ч бичсэнгүй, дахин оролдоно уу.');
      else if ((await maxOidOf()) > maxOid0)
        stop = tr('Ачаалснаас хойш хуудсанд шинэ мөр орлоо (өөр батлалт зэрэг явсан) — юу ч бичсэнгүй, дахин оролдоно уу.');
      else if (sc.f.edited) {
        const where = frameOidWhere(sc.f.oid, loaded.rows);
        if (where) editMax0 = await frameEditMax(pkg.url, sc.f.edited, where, agsFetch);
      }
    } catch (e) {
      stop = tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e));
    }
    if (stop) return { ok: false, error: stop + (await clearMark()) };
  }
  let firstOid: number | null = null;
  const written: number[] = [];
  try {
    const r = await applyAdds(pkg, frame, written);
    firstOid = r.firstOid;
    if (r.added !== frame.length)
      throw new Error(tr('Архивт {0} мөр бичигдэх ёстой, {1} бичигдлээ', frame.length, r.added));
  } catch (e) {
    const why = String((e as Error)?.message ?? e);
    if (addsLost(e)) {
      const ids = new Set(written);
      let strayErr = '';
      let matched = false;
      let unknown = 0;
      try {
        const rows: Record<string, unknown>[] = [];
        const outFields = [...new Set([sc.f.oid, sc.f.no, ...probe.map((p) => p[1])])].join(',');
        for (let offset = 0; ; ) {
          const j = await agsFetch(`${pkg.url}/query`, {
            where: sc.f.fillDate ? `${sc.f.oid} > ${maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(fillMs))}` : `${sc.f.oid} > ${maxOid0}`,
            outFields,
            orderByFields: `${sc.f.oid} ASC`,
            resultRecordCount: '2000',
            resultOffset: String(offset),
            returnGeometry: 'false',
          });
          const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
          rows.push(...fs.map((f) => f.attributes));
          if (!j?.exceededTransferLimit || fs.length === 0) break;
          offset += fs.length;
        }
        const mine = lostFrameIds(rows, { n: frame.length, ...(rootNo && rootNo.length <= 64 ? { rootNo } : {}), ...(probe.length ? { probe } : {}) }, sc.f.oid, sc.f.no, dateFields, written);
        if (mine) { matched = true; for (const x of mine) ids.add(x); }
        unknown = rows.filter((r) => !ids.has(Number(r[sc.f.oid]))).length;
      } catch (x) { strayErr = String((x as Error)?.message ?? x); }
      const gone = ids.size ? await applyDeletes(pkg, [...ids]) : 0;
      const left = ids.size - gone;
      const maybeLeft = Math.max(left, 0) + (matched ? 0 : unknown);
      const tail = maybeLeft > 0 || strayErr
        ? ` (${tr('{0} мөр үлдсэн байж болзошгүй — админд мэдэгдэнэ үү', String(maybeLeft))}${strayErr ? `: ${strayErr}` : ''})`
        : unknown > 0 ? ` (${tr('тэр өдрийн өөр бичигчийн {0} мөрийг хөндөөгүй', String(unknown))})` : '';
      return {
        ok: false,
        error: `${why} · ${tr('Архивын бичилтийн хариу алдагдсан — үр дүн тодорхойгүй. Энэ жаазны {0} мөрийг архиваас устгав{1}; «Архивлаж байна» тэмдэг үлдлээ — {2} минутын дараа дахин «Батлах» дарахад архивыг шалгаж шийднэ.', String(gone), tail, String(Math.round(ARCHIVING_TTL_MS / 60_000)))}`,
      };
    }
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      const markMsg = left === 0 ? await clearMark() : '';
      return {
        ok: false,
        error: (left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай)', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`) + markMsg,
      };
    }
    return { ok: false, error: why + (await clearMark()) };
  }
  let postWarn = '';
  try {
    const j = await agsFetch(`${pkg.url}/query`, { where: `${sc.f.oid} > ${maxOid0}`, returnCountOnly: 'true' });
    const cnt = Number(j?.count);
    if (!Number.isFinite(cnt)) throw new Error(tr('мөрийн тоо уншигдсангүй'));
    if (cnt > written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      const markMsg = left === 0 ? await clearMark() : '';
      return {
        ok: false,
        error: (left > 0
          ? tr('Бичих зуур хуудсанд өөр мөр орлоо (зэрэгцээ бичилт) — манай жаазын {0} мөрийн {1}-ийг устгаж чадсангүй, админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай).', written.length, left)
          : tr('Бичих зуур хуудсанд өөр мөр орлоо (зэрэгцээ бичилт) — манай жаазыг архиваас буцааж устгав, дахин оролдоно уу.')) + markMsg,
      };
    }
  } catch (e) {
    postWarn = tr('Бичсэний дараах зэрэгцээ бичилтийн шалгалт унав ({0}) — архив бичигдсэн.', String((e as Error)?.message ?? e));
  }
  try {
    if (await baseFrameEdited(pkg.url, sc.f.oid, sc.f.edited, loaded.rows, agsFetch, editMax0)) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      const markMsg = left === 0 ? await clearMark() : '';
      return {
        ok: false,
        error: (left > 0
          ? tr('Бичих зуур үндсэн жаазын мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — манай жаазын {0} мөрийн {1}-ийг устгаж чадсангүй, админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай).', written.length, left)
          : tr('Бичих зуур үндсэн жаазын мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — манай жаазыг архиваас буцааж устгав, дахин оролдоно уу.')) + markMsg,
      };
    }
  } catch (e) {
    const w = tr('Бичсэний дараах зэрэгцээ бичилтийн шалгалт унав ({0}) — архив бичигдсэн.', String((e as Error)?.message ?? e));
    postWarn = postWarn ? `${postWarn} · ${w}` : w;
  }
  archivedSet(seenKey, { oid: firstOid ?? 0, day: msToDay(fillMs) });
  const fin = await closeAfterArchive(subOid, staged, plAll, firstOid ?? 0, pkg.name, { row: cur.__oid, day: msToDay(fillMs) });
  if (fin.hold) return { ok: false, error: fin.hold };
  const warns = fin.warns;
  if (postWarn) warns.push(postWarn);
  if (cleanupWarn) warns.push(cleanupWarn);
  const reopen = fin.reopen;
  if (skipped.length)
    warns.push(tr('Архивт илүү хожуу өдрийн жааз аль хэдийн байсан тул {0} нүдийг алгасав (хуримтлал буурахаас сэргийлэв): {1}', String(skipped.length), nameKeys(skipped)));

  return { ok: true, archiveOid: firstOid ?? 0, day: msToDay(fillMs), pkgKey: pkg.key, ...(warns.length ? { warn: warns.join(' · ') } : {}), ...(reopen ? { reopen } : {}) };
}

/**
 * АРХИВЫН ДАРААХ ХААЛТ — `archiveSubmission`-ийн үндсэн зам БА «аль хэдийн архивлагдсан» (R2)
 * зам хоёул ЭНЭ НЭГ дүрмээр хаана (2026-10-09-нд гаргасан; дүрэм нь доторх -үүд).
 */
async function closeAfterArchive(
  subOid: number,
  staged: StagedSubmission,
  /** Архивласан payload (`withFrameOcc`-ээр нөхсөн байж болно) */
  pl: SubmissionPayload,
  firstOid: number,
  sheetName: string,
  by: { row: number; day: string },
): Promise<{ warns: string[]; reopen?: { fillMs: number; sheetOid: number; sheet: string }; hold?: string }> {
  const { readSubmissionByOid, closeSubmission, saveResidualSubmission, residualAfterArchive } = await import('./submission');
  const saveRest = (rest: SubmissionPayload, at0: number, mark0: number | undefined) => {
    const body: SubmissionPayload = { ...rest, at: serverNow(), residual: true, residualOf: { row: by.row, archiveOid: firstOid, day: by.day } };
    delete body.archiving;
    return saveResidualSubmission(rest.pkgKey, body, { at: at0, ...(mark0 != null ? { dropMark: mark0 } : {}) });
  };
  const incPl = pl.mode === 'inc';
  const warns: string[] = [];
  const emptyRest = (r: SubmissionPayload): boolean =>
    !(r.cells ?? []).length && !(r.dates ?? []).length && !(r.adds ?? []).length && r.asOf == null;
  let cl = await closeSubmission(staged.oid, firstOid, serverNow(), firstOid > 0, staged.at);
  if (!cl.ok && !cl.changed) cl = await closeSubmission(staged.oid, firstOid, serverNow(), firstOid > 0, staged.at);
  if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй:', cl.error);
  else unclosedSet(subOid, null);
  if (!cl.ok && !cl.changed && incPl) {
    const rest = residualAfterArchive(staged.payload, pl);
    let why = rest ? '' : tr('түлхүүр тулгагдсангүй');
    if (rest && emptyRest(rest)) {
      why = tr('үлдэгдэл хоосон');
      console.warn('[selbe] илгээлтийг хааж чадсангүй, үлдэгдэл хоосон — агуулгагүй residual мөр бичсэнгүй:', cl.error);
    } else if (rest) {
      const cur1 = await readSubmissionByOid(staged.oid);
      const sv = await saveRest(rest, staged.at, cur1.ok ? cur1.sub?.payload.archiving?.startedAt : undefined);
      if (!sv.ok) why = sv.error;
    }
    if (!why) {
      unclosedSet(subOid, null);
      warns.push(tr('Архивт бичигдсэн боловч илгээлтийг хааж чадсангүй ({0}) — архивлагдсан нэмэлтийг илгээлтээс хасч тэглэв, давхар орохгүй.', cl.error ?? ''));
    } else {
      unclosedSet(subOid, { at: staged.at });
      warns.push(tr('Архивт бичигдсэн боловч илгээлтийг хааж чадсангүй ({0}) — энэ илгээлтийг ДАХИН БАТЛАХГҮЙ байна уу: нэмэлт давхар орно.', `${cl.error ?? ''} · ${why}`));
    }
  }
  /** Үлдэгдэл `sub|` мөр үлдсэн бол — `apply` шинэ тойрог нээнэ (`Archived.reopen`) */
  let reopen: { fillMs: number; sheetOid: number; sheet: string } | undefined;
  let hold: string | undefined;
  if (cl.changed && incPl) {
    const cur2 = await readSubmissionByOid(staged.oid);
    let why = '';
    let emptyW = false;
    if (!cur2.ok) why = cur2.error;
    else if (!cur2.sub || cur2.sub.done) why = '';
    else {
      const rest = residualAfterArchive(cur2.sub.payload, pl);
      if (!rest) why = tr('түлхүүр тулгагдсангүй');
      else if (emptyRest(rest)) {
        emptyW = true;
        console.warn('[selbe] дахин илгээлтийн үлдэгдэл хоосон — агуулгагүй residual мөр бичсэнгүй, илгээлт нээлттэй үлдэв');
      } else {
        const sv = await saveRest(rest, cur2.sub.at, cur2.sub.payload.archiving?.startedAt);
        if (!sv.ok) why = sv.error;
        else reopen = { fillMs: rest.fillMs, sheetOid: staged.oid, sheet: sheetName };
      }
    }
    if (why) {
      if (!(cur2.ok && cur2.sub?.payload.archiving)) unclosedSet(subOid, { at: staged.at });
      hold = tr('Архивт бичигдсэн, гэвч батлах явцад гүйцэтгэгч дахин илгээсэн тул шинэ илгээлтээс архивлагдсан нэмэлтийг хасаж хадгалж чадсангүй ({0}). Ажлыг «Шилжүүлсэн» болгосонгүй — эцсийн шатанд үлдлээ; агуулгыг дахин уншиж батална уу (буцааж болохгүй).', why);
    }
    if (emptyW) {
      unclosedSet(subOid, { at: staged.at });
      warns.push(tr('Батлах явцад гүйцэтгэгч дахин илгээсэн боловч агуулга нь архивласнаас ялгаагүй — илгээлтийг хааж чадсангүй, агуулгагүй үлдэгдэл бичсэнгүй; энэ илгээлтийг ДАХИН БАТЛАХГҮЙ байна уу (нэмэлт давхар орно).'));
    } else warns.push(why
      ? tr('Батлах явцад гүйцэтгэгч дахин илгээсэн — өмнөх агуулга архивт орлоо, гэвч шинэ илгээлтээс архивлагдсан нэмэлтийг хасч чадсангүй ({0}). ДАХИН БАТЛАХААС ӨМНӨ шалгана уу — нэмэлт давхар орох эрсдэлтэй.', why)
      : tr('Батлах явцад гүйцэтгэгч дахин илгээсэн — өмнөх агуулга архивт орлоо; архивлагдсан нэмэлтийг шинэ илгээлтээс хасч, зөвхөн шинэ нэмэлт хянагдахаар үлдлээ.'));
  } else if (cl.changed)
    warns.push(tr('Батлах явцад гүйцэтгэгч дахин илгээсэн — өмнөх агуулга архивт орлоо, шинэ агуулга илгээлтэд нээлттэй үлдлээ. Гүйцэтгэгчээр дахин илгээүүлж хянуулна уу.'));
  return { warns, ...(reopen ? { reopen } : {}), ...(hold ? { hold } : {}) };
}

/**
 * ХЯНАГЧИЙН ШИЙДВЭРИЙГ БҮРТГЭНЭ — гурван хянах шат тус бүрд.
 */
export async function apply(a: {
  oid: number;
  stage: ReviewStage;
  decision: Decision;
  reason?: string;
  /**
   * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮДНҮҮД — `"мөр:блок"` түлхүүрүүд.
   */
  okCells?: string[];
  /**
   * ХЯНАГЧИЙН ХАРСАН илгээлтийн агшин (`payload.at`, 2026-09-24).
   */
  subAt?: number;
  /** ArcGIS-д БИЧИГДЭХ дэлгэцийн нэр (өгөгдөл) */
  who: string;
  /**
   * ЭРХИЙН ШАЛГУУРТ хэрэглэгдэх ArcGIS-ийн ХЭРЭГЛЭГЧИЙН НЭР.
   */
  me?: string;
  /**
   * ЭРХИЙН ШАЛГУУРЫГ ТОЙРУУЛАХ — ЗӨВХӨН нэвтрэлт унтраалттай (хөгжүүлэлт)
   * эсвэл админ шатаа ил сонгосон үед (`resolveFlowStage.canPick`).
   */
  bypass?: boolean;
}): Promise<Result> {
  const returning = a.decision === DECISION.return;
  const reason = clip((a.reason ?? '').trim(), await reasonMax(a.stage));
  if (returning && !reason) return { ok: false, error: tr('Буцаах шалтгаанаа бичнэ үү') };

  await syncServerClock();
  const t = serverNow();
  const attrs: Attrs = { [HYANALT.oid]: a.oid };
  const okp = await okCellsPatch(a.okCells, returning);
  if (okp.error) return { ok: false, error: okp.error };
  Object.assign(attrs, okp.patch);
  const okWarn = okp.warn;
  let registerNow = false;

  const sf = SF[a.stage];
  attrs[sf.who] = a.who;
  attrs[sf.decision] = a.decision;
  if (returning) {
    attrs[sf.reason] = reason;
    attrs[sf.returned] = t;
    attrs[F.status] = RETURNED_STATUS[a.stage];
  } else {
    attrs[sf.sent] = t;
    const nx = nextReview(a.stage);
    if (nx) {
      attrs[F.status] = REVIEW_STATUS[nx];
    } else {
      // ЭЦСИЙН БАТАЛГАА — долоон шат бүгд өнгөрлөө (2026-10-23)
      attrs[F.status] = STATUS.transferred;
      registerNow = true;
      SEEN_DONE.add(a.oid);
    }
  }

  try {
    return await batchInvalidate(async (): Promise<Result> => {
    const cur = await liveRow(a.oid);
    if (!cur || cur[F.status] !== REVIEW_STATUS[a.stage]) {
      emit();
      return { ok: false, error: STALE() };
    }
    {
      const pre = authz(a.stage, a.me, String(cur[F.bagts] ?? ''), a.bypass === true, returning ? undefined : (cur[F.history] ?? ''), { row: cur, who: a.who });
      if (pre) { emit(); return { ok: false, error: pre }; }
      const wd = await whoDeny(a.who);
      if (wd) { emit(); return { ok: false, error: wd }; }
      const subr: Awaited<ReturnType<typeof submittersFor>> = returning ? { ok: true } : await submittersFor(a.stage, cur, a.me, a.bypass === true);
      if (!subr.ok) return { ok: false, error: subr.error };
      const deny = authz(a.stage, a.me, String(cur[F.bagts] ?? ''), a.bypass === true, returning ? undefined : (cur[F.history] ?? ''), { row: cur, who: a.who }, subr.list);
      if (deny) { emit(); return { ok: false, error: deny }; }
    }
    let retCleanWarn = '';
    if (returning && !nextReview(a.stage)) {
      const { readSubmissionByOid } = await import('./submission');
      const sr = await readSubmissionByOid(Number(cur[F.sheetOid]));
      if (!sr.ok) return { ok: false, error: sr.error };
      const s0 = sr.sub;
      if (s0 && (s0.done || s0.payload.archiveOid != null || archivedGet(`${cur[F.sheetOid]}:${s0.at}`) != null)) {
        emit();
        return { ok: false, error: ARCHIVED_NO_RETURN() };
      }
      if (s0 && !s0.done) {
        const am = s0.payload.archiving;
        const uc = s0.payload.mode === 'inc' && s0.payload.residual !== true ? unclosedGet(Number(cur[F.sheetOid])) : undefined;
        if (uc && s0.at >= uc.at) { emit(); return { ok: false, error: ARCHIVED_NO_RETURN() }; }
        if (am) {
          const { markFresh } = await import('./submission');
          if (markFresh(am)) { emit(); return { ok: false, error: ARCHIVED_NO_RETURN() }; }
          let hit: number | null | 'ambiguous';
          try { hit = await probeArchivedFrame(s0.payload.pkgKey, am); } catch (e) {
            return { ok: false, error: MARK_UNRESOLVED(String((e as Error)?.message ?? e)) };
          }
          if (hit != null) { emit(); return { ok: false, error: ARCHIVED_NO_RETURN() }; }
          const cl = await cleanupTruncatedFrame(s0.payload.pkgKey, am);
          if ('error' in cl) { emit(); return { ok: false, error: MARK_UNRESOLVED(cl.error) }; }
          if (cl.deleted > 0) retCleanWarn = tr('Өмнөх батлалтын тасарсан {0} мөрийг архиваас цэвэрлэв.', String(cl.deleted));
        }
      }
    }
    if (a.subAt != null || (!returning && typeof window !== 'undefined')) {
      const { readSubmissionByOid } = await import('./submission');
      const sr = await readSubmissionByOid(Number(cur[F.sheetOid]));
      if (!sr.ok) return { ok: false, error: sr.error };
      if (a.subAt == null) {
        if (sr.sub && !sr.sub.done && sr.sub.payload.archiveOid == null) {
          emit();
          return { ok: false, error: tr('Илгээлтийн агуулга татагдаагүй тул шийдвэр гаргах боломжгүй'), contentChanged: true };
        }
      } else if (!sr.sub || sr.sub.payload.at !== a.subAt) {
        emit();
        return { ok: false, error: tr('Илгээлтийн агуулга өөрчлөгдсөн — дахин уншина уу'), contentChanged: true };
      }
    }
    let archiveOid = cur[F.sheetOid];
    let archivedDay: string | undefined;
    let archivedPkg: string | undefined;
    let archWarn = '';
    let reopen: { fillMs: number; sheetOid: number; sheet: string } | undefined;
    let nothingArchived = false;
    let regSkipWarn = '';
    if (registerNow) {
      const ar = await archiveSubmission(cur, a.subAt);
      if (!ar.ok) {
        if (ar.contentChanged) { emit(); return { ok: false, error: ar.error, contentChanged: true }; }
        return { ok: false, error: ar.error };
      }
      archiveOid = ar.archiveOid;
      archivedDay = ar.day;
      archivedPkg = ar.pkgKey;
      if (ar.warn) archWarn = ar.warn;
      reopen = ar.reopen;
      nothingArchived = ar.empty === true || ar.archiveOid === 0;
      if (ar.archiveOid === 0 && ar.empty !== true)
        regSkipWarn = tr('Батлагдаж архивт бичигдлээ, гэхдээ нэгтгэлийн хүснэгтэд бүртгэгдсэнгүй ({0}). Дашбоардын багцын муруйд энэ өдөр харагдахгүй — админд мэдэгдэнэ үү.', 'archiveOid = 0');
    }

    let histBase: unknown = cur[F.history];
    let overrideWarn = '';
    let alreadyTransferred = false;
    let writeBase = cur;
    if (registerNow) {
      try {
        const fresh = await liveRow(a.oid);
        if (fresh) {
          writeBase = fresh;
          histBase = fresh[F.history];
          const fs0 = String(fresh[F.status] ?? '');
          if (fs0 === STATUS.transferred) {
            alreadyTransferred = true;
            overrideWarn = tr('Энэ ажлыг өөр таб эсвэл хэрэглэгч аль хэдийн «Шилжүүлсэн» болгосон байсан — хяналтын мөрийг дахин бичсэнгүй, нэгтгэлийн бүртгэлийг л шалгав.');
          } else if (fs0 !== REVIEW_STATUS[a.stage]) {
            const nm = String((fresh as Record<string, unknown>)[sf.who] ?? '').trim();
            overrideWarn = tr('Таныг батлах хооронд {0} энэ ажлыг буцаасан байсан — архив аль хэдийн бичигдсэн тул буцаалт дарагдаж, ажил «Шилжүүлсэн» боллоо.', nm || tr('өөр хянагч'));
          }
        }
      } catch (e) { console.warn('[selbe] эцсийн батлалтын өмнөх дахин уншилт унав:', e); }
      attrs[sf.reason] = '';
      attrs[sf.returned] = null;
    }
    Object.assign(attrs, await historyPatch(histBase, {
      stage: a.stage, who: a.who, at: t, act: returning ? 'return' : 'approve',
      ...(returning ? { reason } : {}),
    }, meOf(a.me)));

    if (!registerNow) {
      const moved = await movedSince(a.oid, cur, a.stage);
      if (moved) { emit(); return { ok: false, error: moved }; }
    }

    try {
      if (!alreadyTransferred) await updateDecision(writeBase, attrs);
    } catch (e) {
      if (!registerNow) {
        if (e instanceof HyanaltConflict) { await refreshQuiet(); return fail(e); }
        if (lostWrite(e)) return await lostResult(e);
        throw e;
      }
      let landed = false;
      try { landed = (await liveRow(a.oid))?.[F.status] === STATUS.transferred; } catch { landed = false; }
      if (!landed) {
        emit();
        return { ok: false, error: `${ARCHIVED_NO_RETURN()} (${String((e as Error)?.message ?? e)})` };
      }
    }
    /** Хагас амжилтын анхааруулгууд — нэгтгэл · IPC · `Zovshoorson_nud` */
    const warns: string[] = [];
    if (archWarn) warns.push(archWarn);
    if (retCleanWarn) warns.push(retCleanWarn);
    if (regSkipWarn) warns.push(regSkipWarn);
    if (overrideWarn) warns.push(overrideWarn);
    if (reopen) {
      try {
        const { submitForReview } = await import('./hyanaltSubmit');
        const rv = await submitForReview(String(cur[F.bagts] ?? ''), reopen.fillMs, reopen.sheetOid, reopen.sheet);
        if (rv.ok) warns.push(tr('Үлдэгдэл нэмэлт шинэ хяналтын тойрогт орлоо ({0}).', rv.id));
        else warns.push(tr('Үлдэгдэл нэмэлтэд шинэ хяналтын тойрог нээгдсэнгүй ({0}) — гүйцэтгэгчээр дахин илгээүүлнэ үү.', rv.error));
      } catch (e) {
        warns.push(tr('Үлдэгдэл нэмэлтэд шинэ хяналтын тойрог нээгдсэнгүй ({0}) — гүйцэтгэгчээр дахин илгээүүлнэ үү.', String((e as Error)?.message ?? e)));
      }
    }
    if (registerNow && !nothingArchived) {
      const { registerApproved } = await import('./negtgelWrite');
      let r = await registerApproved(cur[F.bagts], archiveOid, archivedPkg);
      for (let i = 0; i < 2 && !r.ok; i += 1) {
        await new Promise((res) => setTimeout(res, 800 * (i + 1)));
        r = await registerApproved(cur[F.bagts], archiveOid, archivedPkg);
      }
      if (!r.ok) {
        console.warn('[selbe] нэгтгэлд бүртгэж чадсангүй:', r.error);
        warns.push(tr('Батлагдаж архивт бичигдлээ, гэхдээ нэгтгэлийн хүснэгтэд бүртгэгдсэнгүй ({0}). Дашбоардын багцын муруйд энэ өдөр харагдахгүй — админд мэдэгдэнэ үү.', r.error ?? ''));
      }

      /*
       * ── ГҮЙЦЭТГЭЛЭЭС IPC МӨР ──────────────────────────────────────────
       */
      /** IPC мөр бичигдсэн эсэх — `markRegistered`-ийн нөхцөл (доор) */
      let ipcOk = false;
      if (archivedDay) {
        let ipcErr = '';
        try {
          const { syncIpcFromFill } = await import('./ipcAutoWrite');
          const ipc = await syncIpcFromFill(cur[F.bagts], archivedDay);
          if (!ipc.ok) {
            console.warn('[selbe] IPC мөр үүсгэж чадсангүй:', ipc.error);
            ipcErr = String(ipc.error ?? '');
          } else if (ipcSkipIsFailure(ipc)) {
            console.warn('[selbe] IPC мөр алгасагдлаа:', ipc.why);
            ipcErr = tr('IPC алгасагдлаа: {0}', String(ipc.why ?? ''));
          }
          if (ipc.ok && ipc.warn) warns.push(ipc.warn);
        } catch (e) {
          console.warn('[selbe] IPC мөр үүсгэх алдаа:', e);
          ipcErr = String((e as Error)?.message ?? e);
        }
        if (ipcErr) {
          warns.push(tr('Батлагдаж архивт бичигдлээ, гэхдээ гүйцэтгэлээс IPC мөр үүсгэж чадсангүй ({0}). Тухайн сарын IPC-г админд мэдэгдэж шалгуулна уу.', ipcErr));
        }
        ipcOk = !ipcErr;
      }
      /* ⚠️ 2026-10-29 (хэрэглэгч: «хүснэгт өөрөө шинэчлэгдэх ёстой»): «Төсөл төлөвлөгөө биелэлт»-ийн гүйцэтгэлийн хувийг
         CASHFLOW_NEW-ийн `guitsetgel_huvi`-д бичнэ (`projectPlanSync`-ийн ⚠️). Унавал батлалт хэвээр — шар мөрөөр хэлнэ;
         дараагийн батлалт зөрсөн мөрийг дахин тулгаж нөхнө. */
      try {
        const { syncPlanProgress } = await import('./projectPlanSync');
        const ps = await syncPlanProgress();
        if (!ps.ok) {
          console.warn('[selbe] төсөл төлөвлөгөөний гүйцэтгэл бичигдсэнгүй:', ps.error);
          warns.push(tr('Батлагдлаа, гэхдээ «Төсөл төлөвлөгөө биелэлт»-ийн гүйцэтгэлийн хувь хүснэгтэд бичигдсэнгүй ({0}). Дараагийн батлалтаар нөхөгдөнө.', ps.error));
        } else if ('skipped' in ps) {
          console.warn('[selbe] төсөл төлөвлөгөөний гүйцэтгэл алгасагдлаа:', ps.skipped);
        }
      } catch (e) {
        console.warn('[selbe] төсөл төлөвлөгөөний гүйцэтгэл бичих алдаа:', e);
      }
      if (r.ok && ipcOk && archivedPkg) {
        try {
          const { markRegistered } = await import('./submission');
          const mk = await markRegistered(Number(cur[F.sheetOid]));
          if (!mk.ok) console.warn('[selbe] «бүртгэл хүлээгдэж буй» тэмдгийг арилгаж чадсангүй:', mk.error);
        } catch (e) {
          console.warn('[selbe] «бүртгэл хүлээгдэж буй» тэмдгийг арилгаж чадсангүй:', e);
        }
      }
    }
    /* 2026-09-23 (#16): `Zovshoorson_nud` талбар алга байсан бол шар мөрөөр хэлнэ */
    if (okWarn) warns.push(okWarn);
    if (warns.length) {
      const so = Number(cur[F.sheetOid]);
      putWarn(Number.isInteger(so) && so > 0 ? so : a.oid, {
        text: warns.join(' · '),
        ajil: String(cur[F.ajil] ?? ''),
        bagts: String(cur[F.bagts] ?? ''),
        at: Date.now(),
      });
    }
    try { await refresh(); } catch (e) { console.warn('[selbe] шийдвэрийн дараах дахин ачаалалт унав:', e); }
    return warns.length ? { ok: true, warn: warns.join(' · ') } : { ok: true };
    });
  } catch (e) { return fail(e); }
}

/** Сешнд нэг л удаа оролдсон илгээлтүүд — давтан дуудлагад дахин ажиллуулахгүй */
const SWEPT = new Set<number>();
let sweeping = false;

export function resetRegSweep(): void {
  SWEPT.clear();
}

export const UPPER_SWEEP: readonly ReviewStage[] = ['director', 'head', 'chief'];

/**
 * БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ БАТЛАЛТУУДЫГ НӨХНӨ (2026-09-25 аудит).
 */
export async function retryPendingRegistrations(
  me: string | undefined,
  bypass: boolean,
  who?: string,
): Promise<{ done: number; failed: number }> {
  const out = { done: 0, failed: 0 };
  if (sweeping) return out;
  sweeping = true;
  let fixed = 0;
  try {
    const { listRegPending, markRegistered } = await import('./submission');
    const pend = (await listRegPending()).filter((p) => !SWEPT.has(p.oid));
    if (!pend.length) return out;
    await syncServerClock();
    if (!loaded) await refresh();
    const final = REVIEW_STAGES[REVIEW_STAGES.length - 1];
    for (const sub of pend) {
      const mine = ROWS.filter((r) => Number(r[F.sheetOid]) === sub.oid);
      let cur = mine.find((r) => r[F.status] === STATUS.transferred);
      const stuck = !cur;
      if (!cur) cur = mine.filter((r) => r[F.status] === REVIEW_STATUS[final]).sort((x, y) => y.__oid - x.__oid)[0];
      if (!cur) continue;
      const bagts = String(cur[F.bagts] ?? '');
      const canFinal = !authz(final, me, bagts, bypass);
      if (stuck ? !canFinal : UPPER_SWEEP.every((s) => authz(s, me, bagts, bypass))) continue;
      SWEPT.add(sub.oid);
      try {
        if (stuck) {
          const live = await liveRow(cur.__oid);
          if (!live) { out.failed += 1; continue; }
          const st = String(live[F.status] ?? '');
          if (st === STATUS.transferred) {
            cur = live;
          } else if (st !== REVIEW_STATUS[final]) {
            console.warn('[selbe] гацсан мөр өөр төлөвт шилжсэн — төлөв нөхөхгүй:', cur.__oid, st);
            out.failed += 1;
            continue;
          } else {
            const sf = SF[final];
            const at = Number.isFinite(sub.payload.approvedAt) ? Number(sub.payload.approvedAt) : serverNow();
            const logged = lastApproverName(live[F.history], final);
            const name = logged || (who ?? me ?? '').trim();
            SEEN_DONE.add(cur.__oid);
            const fix: Attrs = {
              [HYANALT.oid]: cur.__oid,
              [sf.who]: name,
              [sf.decision]: DECISION.approve,
              [sf.reason]: '',
              [sf.returned]: null,
              [sf.sent]: at,
              [F.status]: STATUS.transferred,
              ...(await historyPatch(live[F.history], {
                stage: final, who: name, at: serverNow(), act: 'approve',
                reason: tr('Нөхөлт: архив суусан батлалтын төлөв бичигдээгүй байсныг нөхөв'),
              }, meOf(me))),
            };
            await updateDecision(live, fix);
            fixed += 1;
            cur = { ...live, ...fix } as Row;
          }
        }
        const ar = await archiveSubmission(cur);
        if (!ar.ok || !ar.pkgKey || !(ar.archiveOid > 0)) { out.failed += 1; continue; }
        const { registerApproved } = await import('./negtgelWrite');
        const r = await registerApproved(cur[F.bagts], ar.archiveOid, ar.pkgKey);
        let ipcOk = false;
        if (ar.day) {
          const { syncIpcFromFill } = await import('./ipcAutoWrite');
          const ipc = await syncIpcFromFill(cur[F.bagts], ar.day);
          ipcOk = ipc.ok && !ipcSkipIsFailure(ipc);
          if (ipc.ok && !ipcOk) console.warn('[selbe] IPC нөхөлт алгасагдлаа:', ipc.why);
          if (!ipc.ok) console.warn('[selbe] IPC нөхөж чадсангүй:', ipc.error);
        }
        if (!r.ok) console.warn('[selbe] нэгтгэлд нөхөж бүртгэж чадсангүй:', r.error);
        if (r.ok && ipcOk) {
          const mk = await markRegistered(sub.oid);
          if (mk.ok) out.done += 1;
          else { out.failed += 1; console.warn('[selbe] «бүртгэл хүлээгдэж буй» тэмдэг арилсангүй:', mk.error); }
        } else {
          out.failed += 1;
        }
      } catch (e) {
        out.failed += 1;
        console.warn('[selbe] хүлээгдэж буй бүртгэлийг нөхөх алдаа:', e);
      }
    }
    if (fixed > 0) await refreshQuiet();
    return out;
  } catch (e) {
    console.warn('[selbe] хүлээгдэж буй бүртгэлийн жагсаалт:', e);
    return out;
  } finally {
    sweeping = false;
  }
}


/**
 * МЕНЕЖЕР БУЦААСНЫГ ИНЖЕНЕР ДАХИН ШАЛГАВ.
 */
export async function recheck(
  oid: number,
  verdict: 'ok' | 'back',
  reason: string,
  who: string,
  /**
   * ХЭН дахин шалгаж байна.
   */
  by: Exclude<ReviewStage, 'chief'> = 'engineer',
  /** ЭРХИЙН ШАЛГУУРЫН хэрэглэгчийн нэр — `who` (дэлгэцийн нэр) БИШ */
  me?: string,
  /** Шалгуурыг тойруулах — зөвхөн нэвтрэлтгүй/админы шат сонголт */
  bypass = false,
  /**
   * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮДНҮҮД — `apply`-ийнхтай ИЖИЛ утга
   * (`hyanalt.F.okCells`). Дахин шалгалтад ч гүйцэтгэгч рүү
   * буцаах бол «аль нүд ногоон» гэдгийг ЗААВАЛ дамжуулна.
   */
  okCells?: string[],
  /**
   * ХЯНАГЧИЙН ХАРСАН илгээлтийн агшин (`payload.at`) — `apply`-ийн `subAt`-тай
   * ИЖИЛ тулгалт (2026-09-24-ний аудит): дахин шалгалтын хооронд компани
   * илгээлтээ шинэчилсэн бол харагдаагүй агуулга дээш явахгүй (fail-closed).
   */
  subAt?: number,
): Promise<Result> {
  let prev: Row | undefined;
  try { prev = await liveRow(oid); } catch (e) { return fail(e); }
  if (!prev) { emit(); return { ok: false, error: tr('Бүртгэл олдсонгүй') }; }
  const upper = nextReview(by)!;
  const want = RETURNED_STATUS[upper];
  if (prev[F.status] !== want) { emit(); return { ok: false, error: STALE() }; }
  {
    const pre = authz(by, me, String(prev[F.bagts] ?? ''), bypass === true, verdict === 'ok' ? (prev[F.history] ?? '') : undefined, { row: prev, who });
    if (pre) { emit(); return { ok: false, error: pre }; }
    const wd = await whoDeny(who);
    if (wd) { emit(); return { ok: false, error: wd }; }
    const subr: Awaited<ReturnType<typeof submittersFor>> = verdict === 'ok' ? await submittersFor(by, prev, me, bypass === true) : { ok: true };
    if (!subr.ok) return { ok: false, error: subr.error };
    const deny = authz(by, me, String(prev[F.bagts] ?? ''), bypass === true, verdict === 'ok' ? (prev[F.history] ?? '') : undefined, { row: prev, who }, subr.list);
    if (deny) { emit(); return { ok: false, error: deny }; }
  }
  if (subAt != null || (verdict === 'ok' && typeof window !== 'undefined')) {
    const { readSubmissionByOid } = await import('./submission');
    const sr = await readSubmissionByOid(Number(prev[F.sheetOid]));
    if (!sr.ok) return { ok: false, error: sr.error };
    if (subAt == null) {
      if (sr.sub && !sr.sub.done && sr.sub.payload.archiveOid == null) {
        emit();
        return { ok: false, error: tr('Илгээлтийн агуулга татагдаагүй тул шийдвэр гаргах боломжгүй'), contentChanged: true };
      }
    } else if (!sr.sub || sr.sub.payload.at !== subAt) {
      emit();
      return { ok: false, error: tr('Илгээлтийн агуулга өөрчлөгдсөн — дахин уншина уу'), contentChanged: true };
    }
  }

  await syncServerClock();
  const t = serverNow();

  if (verdict === 'ok') {
    const base = prev;
    const ergelt = base[F.ergelt] + 1;
    const twin = ROWS.some((r) => r[F.sheetOid] === base[F.sheetOid]
      && r[F.bagts] === base[F.bagts] && r[F.ergelt] === ergelt);
    if (twin) { emit(); return { ok: false, error: STALE() }; }
    {
      const moved = await movedSince(oid, prev, by);
      if (moved) { emit(); return { ok: false, error: moved }; }
    }

    const sentAt = prev[F.companySent];
    /* Дахин шалгасны дараа ажил ХААШАА явах вэ — нэг алхам урагш. */
    const nextStatus = REVIEW_STATUS[upper];
    /* Инженерийн илгээсэн огноо — менежер дахин шалгахад ХЭВЭЭР үлдэнэ. */
    const engPrev = prev[F.engineerSent];
    const engSent = engPrev ? Date.parse(engPrev) : t;
    const fresh: Attrs = {
      [F.id]: nextId(),
      [F.sheetOid]: prev[F.sheetOid],
      [F.ergelt]: ergelt,
      [F.bagts]: prev[F.bagts],
      [F.ajil]: prev[F.ajil],
      [F.company]: prev[F.company],
      [F.companySent]: sentAt ? Date.parse(sentAt) : null,
      ...Object.fromEntries(REVIEW_STAGES.flatMap((s) => {
        const f = SF[s];
        const si = REVIEW_STAGES.indexOf(s);
        const bi = REVIEW_STAGES.indexOf(by);
        if (si < bi) {
          const sentPrev = prev[f.sent as keyof Row] as string | null;
          const sentMs = s === 'engineer' ? engSent : (sentPrev ? Date.parse(sentPrev) : null);
          return [
            [f.who, prev[f.who as keyof Row]], [f.decision, DECISION.approve], [f.reason, ''],
            [f.returned, null], [f.sent, sentMs],
          ];
        }
        if (si === bi) {
          return [[f.who, who], [f.decision, DECISION.approve], [f.reason, ''], [f.returned, null], [f.sent, t]];
        }
        return [[f.who, ''], [f.decision, ''], [f.reason, ''], [f.returned, null], [f.sent, null]];
      })),
      [F.status]: nextStatus,
      ...(await historyPatch('', { stage: by, who, at: t, act: 'recheck-ok' }, meOf(me))),
    };
    let twinWarn = '';
    try {
      const res = await addRows([fresh]);
      const mine = addedOid(res);
      if (mine > 0) {
        let lost: Row | undefined;
        try {
          const so = Number(fresh[F.sheetOid]);
          lost = (await queryAll()).map(toRow)
            .filter((r) => r.__oid > 0 && r.__oid < mine && Number(r[F.sheetOid]) === so
              && r[F.bagts] === base[F.bagts] && Number(r[F.ergelt]) === ergelt)
            .sort((x, y) => x.__oid - y.__oid)[0];
        } catch (e) {
          console.warn('[selbe] дахин шалгалтын давхар тойргийн шалгалт унав:', e);
        }
        if (lost) {
          const nm = String((lost as Record<string, unknown>)[SF[by].who] ?? '').trim();
          if (await deleteRow(mine)) {
            await refreshQuiet();
            emit();
            return {
              ok: false,
              error: nm
                ? tr('Энэ ажлыг {0} таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.', nm)
                : tr('Энэ ажлыг өөр хэрэглэгч таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.'),
            };
          }
          twinWarn = tr('Давхар тойрог үүслээ: {0} энэ ажлыг таныг шийдвэрлэж байх хооронд шийдвэрлэсэн (бүртгэл №{1}) — таны мөрийг (бүртгэл №{2}) устгаж чадсангүй, админаар нэгийг нь устгуулна уу.', nm || tr('өөр хянагч'), String(lost.__oid), String(mine));
        }
      }
      await ensureUniqueId(addedOid(res), String(fresh[F.id]));
    } catch (e) {
      if (lostWrite(e)) return lostResult(e);
      return fail(e);
    }
    await refreshQuiet();
    return twinWarn ? { ok: true, warn: twinWarn } : { ok: true };
  }

  // ── Асуудал БАЙНА — компанид буцаана. Мөрийн ЭЦСИЙН үйлдэл тул шинэ мөр
  //    хэрэггүй; компани засаад илгээхэд `resubmit` шинийг үүсгэнэ.
  const why = clip(reason.trim(), await reasonMax(by));
  if (!why) return { ok: false, error: tr('Буцаах шалтгаанаа бичнэ үү') };

  const okp = await okCellsPatch(okCells);
  if (okp.error) return { ok: false, error: okp.error };
  const okPatch: Attrs = okp.patch;

  const bf = SF[by];
  const back: Attrs = {
    [HYANALT.oid]: oid,
    [bf.who]: who,
    [bf.decision]: DECISION.return,
    [bf.reason]: why,
    [bf.returned]: t,
    [F.status]: RETURNED_STATUS[by],
    ...okPatch,
    ...(await historyPatch(prev[F.history], { stage: by, who, at: t, act: 'recheck-back', reason: why }, meOf(me))),
  };

  {
    const moved = await movedSince(oid, prev, by);
    if (moved) { emit(); return { ok: false, error: moved }; }
  }

  try {
    await updateDecision(prev, back);
  } catch (e) {
    if (e instanceof HyanaltConflict) { await refreshQuiet(); return fail(e); }
    if (lostWrite(e)) return lostResult(e);
    return fail(e);
  }
  await refreshQuiet();
  return okp.warn ? { ok: true, warn: okp.warn } : { ok: true };
}

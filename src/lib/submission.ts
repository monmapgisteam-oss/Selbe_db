'use client';

/**
 * ИЛГЭЭЛТИЙН ЗАВСРЫН ХАДГАЛАЛТ — «Нийтлэх» → хяналт → батлагдахад л архив.
 */

import { getAuth, tableUrl, layer, sqlStr } from './draftRemote';
import { rowsReady, subRowsFor, subWriteGen, subGc, subDropAll, fillFrame, setHeaderCols } from './draftRowsRemote';
import { cellToCols, colsToCell, pickGeneration, subFromRows, subToRows, ROW_VERSION, type Attrs, type Frame } from './draftRows';
import { t as tr } from '@/lib/i18nCore';
import { negInc, parseInc, sumInc } from '@/modules/sheet/bagtsSheet';
import { isLostWrite } from './lostWrite';
import { serverNow } from './serverClock';

/**
 * ЕРӨНХИЙ МЕНЕЖЕРИЙН НЭМСЭН, хараахан батлагдаагүй мөр.
 */
export type NewRow = {
  /** Түр ObjectID — САЛАНГИД сөрөг тоо, серверийн дугаартай хэзээ ч мөргөлдөхгүй */
  oid: number;
  parentNo: string;
  parentWork: string;
  /** Нэрээр олдохгүй үед нөхөх сүүлчийн арга */
  parentIdx: number;
  no: string;
  work: string;
  vol: number | null;
  unit: number | null;
};

/**
 * ИЛГЭЭЛТИЙН АГУУЛГА — архивын сүүлийн жааз дээрх diff.
 */
export type SubmissionPayload = {
  /**
   * Хэлбэрийн хувилбар. `2` = НЭМЭЛТИЙН (`mode: 'inc'`) илгээлт (2026-09-25).
   */
  v: 1 | 2;
  /**
   * НҮДНИЙ УТГЫН ДҮРЭМ (2026-09-25, `bagtsSheet.CellMode`).
   *   · `'inc'` — `cells` нь ӨМНӨХ бөглөлтөөс хойшх НЭМЭЛТ; батлахад СҮҮЛИЙН
   *     архивын утга дээр НЭМЭГДЭНЭ.
   *   · байхгүй — ХУУЧИН (2026-09-25-аас өмнөх) илгээлт: `cells` нь НИЙТ утга,
   *     архивын утгыг ОРЛОНО. Туггүй бүхнийг ингэж уншина (давхар нэмэхгүй).
   */
  mode?: 'inc';
  /** PKGS түлхүүр */
  pkgKey: string;
  /** Илгээсэн (компанийн) хэрэглэгч, жижиг үсгээр */
  user: string;
  users?: string[];
  /** Илгээсэн агшин (ms) */
  at: number;
  /** Бөглөсөн өдөр — Date.UTC(y,m,d); архивын жаазны buglusun_ognoo болно */
  fillMs: number;
  /** diff-ийг ямар архивын агшин (snapshot ms) дээр бичсэн бэ — мэдээлэл */
  base: number | null;
  /** «Шинэчлэгдсэн огноо» — өөрчилсөн бол; эс бөгөөс `null` (0 БИШ) */
  asOf: number | null;
  /** `${oid}:${b}` → утга (мөр) — FillNew-ийн `pending`-тэй ИЖИЛ */
  cells: [string, string][];
  /** `${oid}:${b}:s|e` → 'YYYY-MM-DD' эсвэл '' — `pendDate`-тэй ИЖИЛ */
  dates: [string, string][];
  /** Нэмсэн мөр — oid сөрөг */
  adds: NewRow[];
  /** oid → "№ ¦ Ажлын нэр" — ObjectID шилжилтэд */
  rowKeys: [number, string][];
  /**
   * МӨРИЙН ДАВТАМЖИЙН ДУГААР — `[oid, k, n]` (2026-10-04 аудит, #2; `sheetFrame.RowOcc`).
   */
  rowOcc?: [number, number, number][];
  /**
   * ИЛГЭЭЛТИЙН ТАНИГЧУУД — илгээх оролдлого бүрийн санамсаргүй `nonce` (сүүлийн 20),
   * 2026-10-04 аудит (#3).
   */
  nonces?: string[];
  /** Батлагдсаны дараа: архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID */
  archiveOid?: number;
  approvedAt?: number;
  /**
   * «БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ» — архивт буусан боловч нэгтгэл (`registerApproved`)
   * ба IPC (`syncIpcFromFill`) хараахан баталгаажаагүй (2026-09-25 аудит).
   */
  regPending?: boolean;
  /**
   * «ҮЛДЭГДЭЛ НЭМЭЛТ» (2026-09-25 аудит) — батлах явцад гүйцэтгэгч дахин илгээснээс
   * архивласан хэсгийг хассан үлдэгдэл (`residualAfterArchive`), `hyanaltStore` бичнэ.
   */
  residual?: true;
  /**
   * ҮЛДЭГДЛИЙГ ҮҮСГЭСЭН БАТЛАЛТ (2026-10-12, A9) — `hyanaltStore.closeAfterArchive` `residual`-тай хамт бичнэ:
   *   · `row` — тэр үеийн хяналтын мөрийн OBJECTID (эцсийн шатанд батлагдаж байсан);
   *   · `archiveOid`/`day` — тэр батлалтаар архивт бичигдсэн жаазны эхний OID ба өдөр (0 = бичээгүй).
   */
  residualOf?: { row: number; archiveOid: number; day: string };
  /**
   * «АРХИВЛАЖ БАЙНА» ТЭМДЭГ (2026-10-09, R2) — `hyanaltStore.archiveSubmission` `applyAdds`-ийн
   * ӨМНӨ `markArchiving`-аар (at-ийн CAS) бичнэ. `at` ӨӨРЧЛӨГДӨХГҮЙ (агуулгын хувилбар хэвээр).
   *   · `at` — архивлаж буй агуулгын `at`; одоогийн `at`-тай зөрвөл тэмдэг хүчингүй;
   *   · `startedAt` — эхэлсэн агшин (мэдээлэл);
   *   · `maxOid0` — бичихийн өмнөх архивын MAX OBJECTID;
   *   · `fillMs` — жаазны `buglusun_ognoo` (өнөөдөр рүү залруулсан байж болно);
   *   · `n` — жаазны мөрийн тоо.
   */
  archiving?: ArchivingMark;
};

/** «Архивлаж байна» тэмдэг — `SubmissionPayload.archiving` */
export type ArchivingMark = {
  at: number; startedAt: number; maxOid0: number; fillMs: number; n: number;
  rootNo?: string;
  probe?: [number, string, number | string | null][];
  by?: string;
  sid?: string;
  prev?: ArchSnap;
  prevGen?: number;
};
/** Архивлаж буй агуулгын хуулбар — `residualAfterArchive`-д хэрэгтэй хэсэг л (`ArchivingMark.prev`) */
export type ArchSnap = { cells: [string, string][]; rowKeys: [number, string][]; rowOcc?: [number, number, number][] };

/** `ArchivingMark.probe`-ийн дээд урт (payload-ыг дүүргэхгүй) */
export const PROBE_MAX = 8;

/**
 * «АРХИВЛАЖ БАЙНА» ТЭМДГИЙН ШИНЭ БАЙХ ХУГАЦАА (2026-10-09) — 15 мин. Жааз бичих (≈1–2 мин) ба хаах хугацаанаас
 * хангалттай урт. Энэ хугацаанд тэмдэг «явж буй/үр дүн тодорхойгүй» — өөр сешн дарахгүй (`markArchiving`),
 * гүйцэтгэгч дахин илгээхгүй (`FillNew.publish`), бусад бичигч хүлээнэ (`archivingBusy`). Хуучирсан тэмдгийг
 * архивын жаазаар шийднэ (`matchArchivedFrame`).
 */
export const ARCHIVING_TTL_MS = 15 * 60_000;
/** Тэмдэг ШИНЭ үү (`ARCHIVING_TTL_MS`). Цагийн зөрүүгээр ирээдүйд байвал ч шинэ гэж үзнэ (fail-closed). */
export const markFresh = (m: Pick<ArchivingMark, 'startedAt'>, now = serverNow()): boolean =>
  now - m.startedAt < ARCHIVING_TTL_MS;

/**
 * ЭНЭ ТАБЫН СЕШНИЙ ТАНИГЧ (2026-10-09) — `ArchivingMark.sid`. Модуль ачаалагдах бүрд шинэ (таб/F5 тутам).
 */
export const SESSION_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Огноо мэт тоо (epoch ms, 1973-аас хойш) эсвэл 'YYYY-MM-DD…' → UTC өдрийн дугаар (`normDayMs`-ийн дүрэм — ойрын шөнө дунд) */
function dayNo(v: unknown): number | null {
  const ms = typeof v === 'number' ? v
    : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ? Date.parse(`${v.trim().slice(0, 10)}T00:00:00Z`) : NaN;
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/**
 * Архивт бичсэн утга ба буцаж уншсан утгын харьцаа (2026-10-09 — урьдын `sameArchVal`-ийн 1e-6 тэнцэл):
 *   · `'eq'`   — тэнцүү: тоо харьцангуй 1e-9 дотор, огноо (`date`) UTC өдрөөр, мөр trim-ээр, хоосон = null;
 *   · `'near'` — зөвхөн хөвөгч таслалын бөөрөнхийллөөр ялгаатай (≤ 1e-6 харьцангуй) — ЭНЭ ЖААЗ мөн/биш нь
 *                ТОДОРХОЙГҮЙ (дуудагч fail-closed);
 *   · `'far'`  — өөр утга.
 */
function cmpArchVal(a: unknown, b: number | string | null, date = false): 'eq' | 'near' | 'far' {
  if (b == null || b === '') return a == null || a === '' ? 'eq' : 'far';
  if (date || (typeof b === 'number' && typeof a === 'number' && Math.abs(b) > 1e11 && Math.abs(a) > 1e11)) {
    const x = dayNo(a);
    const y = dayNo(b);
    if (x != null && y != null) return x === y ? 'eq' : 'far';
  }
  if (typeof b === 'number') {
    const x = typeof a === 'number' ? a : typeof a === 'string' && a.trim() ? Number(a) : NaN;
    if (!Number.isFinite(x)) return 'far';
    const d = Math.abs(x - b);
    const m = Math.max(1, Math.abs(b));
    return d <= 1e-9 * m ? 'eq' : d <= 1e-6 * m ? 'near' : 'far';
  }
  return String(a ?? '').trim() === b.trim() ? 'eq' : 'far';
}
/** Архивт бичсэн утга ба уншсан утга ижил үү (`cmpArchVal === 'eq'`) — `frameProbe`-ийн «өөрчлөгдсөн үү» */
function sameArchVal(a: unknown, b: number | string | null): boolean {
  return cmpArchVal(a, b) === 'eq';
}

/**
 * ТАНИХ ДЭЭЖ — бичих гэж буй жааз (`frame`) ӨМНӨХ жаазаас (`prev(i)`) ялгарах нүднүүдээс жигд
 * тархсан ≤ `max` ширхэг [индекс, талбар, утга] (2026-10-09, R2-c). Өөрчлөлтгүй бол хоосон —
 * тэр үед `matchArchivedFrame` зөвхөн урт + эхний №-ээр таньна.
 */
export function frameProbe(
  frame: Record<string, unknown>[],
  prev: (i: number) => Record<string, unknown> | undefined,
  fields: string[],
  max = PROBE_MAX,
): [number, string, number | string | null][] {
  const diffs: [number, string, number | string | null][] = [];
  for (let i = 0; i < frame.length; i += 1) {
    const p = prev(i);
    for (const f of fields) {
      const v = frame[i][f];
      if (v === undefined) continue;
      const val: number | string | null = typeof v === 'number' && Number.isFinite(v) ? v
        : typeof v === 'string' ? v.slice(0, 256) : v == null ? null : NaN;
      if (typeof val === 'number' && !Number.isFinite(val)) continue;
      if (p && sameArchVal(p[f], val)) continue;
      diffs.push([i, f, val]);
    }
  }
  if (diffs.length <= max) return diffs;
  const out: [number, string, number | string | null][] = [];
  for (let k = 0; k < max; k += 1) out.push(diffs[Math.round((k * (diffs.length - 1)) / (max - 1))]);
  return out;
}

/**
 * АРХИВТ ОЛДСОН МӨРҮҮДЭЭС (`OID > maxOid0`, тэмдгийн өдөр, OID-оор эрэмбэлсэн) ЭНЭ ТЭМДГИЙН жаазыг
 * таньж эхний OID-г буцаана; олдохгүй бол `null` (2026-10-09, R2-c).
 */
export function matchArchivedFrame(
  rows: Record<string, unknown>[],
  mark: Pick<ArchivingMark, 'n' | 'rootNo' | 'probe'>,
  oidField: string,
  noField: string,
  dateFields?: readonly string[],
): number | null | 'ambiguous' {
  if (!rows.length || mark.n <= 0) return null;
  const dates = new Set(dateFields ?? []);
  const noOf = (r: Record<string, unknown>) => String(r[noField] ?? '').trim();
  const root = mark.rootNo ?? noOf(rows[0]);
  const starts: number[] = [];
  if (root) rows.forEach((r, i) => { if (noOf(r) === root) starts.push(i); });
  else starts.push(0);
  let ambiguous = false;
  for (let k = 0; k < starts.length; k += 1) {
    const s = starts[k];
    const end = root ? (k + 1 < starts.length ? starts[k + 1] : rows.length) : rows.length;
    if (end - s !== mark.n) continue;
    let near = false;
    let far = false;
    for (const [i, f, v] of mark.probe ?? []) {
      const c = i < mark.n ? cmpArchVal(rows[s + i]?.[f], v, dates.has(f)) : 'far';
      if (c === 'far') { far = true; break; }
      if (c === 'near') near = true;
    }
    if (far) continue;
    if (near) { ambiguous = true; continue; }
    const oid = Number(rows[s][oidField]);
    if (Number.isInteger(oid) && oid > 0) return oid;
  }
  return ambiguous ? 'ambiguous' : null;
}

/**
 * ТАСАРСАН ЖААЗНЫ МӨРҮҮД (2026-10-11, аудит №7 — амьд тохиолдол: `Bagts_3_2_9f` 2026-10-11, 500/1471).
 *
 * «Архивлаж байна» тэмдгийн дараа (`OID > maxOid0`, тэмдгийн өдөр) бичигдсэн мөрүүд нь тэмдгийн жаазаас
 * БОГИНО, 500-ийн ҮРЖВЭР (`applyAdds` 500-аар бичдэг), эхний мөрийн № = `rootNo`, жаазны дотор буух дээж
 * бүр таарч байвал — тэр нь унасан батлалтын ХАГАС жааз: таб хаагдсан/сүлжээ тасарсан тул `archiveSubmission`-ийн
 * буцаалт (`applyDeletes`) ажиллаагүй. Тийм жааз `loadRows`-ийн F1 шалгуурыг унагааж багцыг (бөглөх · хянах ·
 * батлах) БҮХЭЛД НЬ хаадаг байв — батлагчийн дахин оролдлого ч `probeArchivedFrame` хүртэл хүрдэггүй.
 *   · бүтэн (≥ n) жааз → `[]` (өөр бичигчийн жинхэнэ жааз байж болно — хөндөхгүй; 2026-10-12 хүртэл `null`);
 *   · дээж «хол» зөрвөл / № таарахгүй / 500-ийн үржвэр биш → `null` (танигдсангүй — админ);
 *   · эс бөгөөс устгах OID-ууд.
 * Цэвэр функц — `hyanaltStore.cleanupTruncatedFrame` сүлжээг хариуцна.
 */
export function truncatedFrameIds(
  rows: Record<string, unknown>[],
  mark: Pick<ArchivingMark, 'n' | 'rootNo' | 'probe'>,
  oidField: string,
  noField: string,
  dateFields?: readonly string[],
): number[] | null {
  if (!rows.length || mark.n <= 0) return null;
  const noOf = (r: Record<string, unknown>) => String(r[noField] ?? '').trim();
  const root = mark.rootNo ?? noOf(rows[0]);
  if (!root || noOf(rows[0]) !== root) return null;
  /* Тэргүүн хэсгийн төгсгөл — дараагийн жаазын эхлэл (ижил эхний №) эсвэл төгсгөл */
  let len = 1;
  while (len < rows.length && noOf(rows[len]) !== root) len += 1;
  if (len >= mark.n) return [];
  if (len % 500 !== 0) return null;
  const dates = new Set(dateFields ?? []);
  for (const [i, f, v] of mark.probe ?? []) {
    if (i >= len) continue;
    if (cmpArchVal(rows[i]?.[f], v, dates.has(f)) === 'far') return null;
  }
  const ids: number[] = [];
  for (const r of rows.slice(0, len)) {
    const oid = Number(r[oidField]);
    if (!Number.isInteger(oid) || oid <= 0) return null;
    ids.push(oid);
  }
  return ids;
}

/**
 * ХАРИУ АЛДАГДСАН БИЧИЛТИЙН ЦЭВЭРЛЭГЭЭ — ЭНЭ ЖААЗЫН МӨРҮҮД (2026-10-21, аудит; `ulsiinKomiss`-ийн 2026-10-21-ний
 * «өдрөөр биш АГУУЛГААР таних» дүрмийн архивлалтын хувилбар).
 *
 * `hyanaltStore.archiveSubmission`-ийн `applyAdds` хариу алдагдсан (`addsLost`) үед тэмдгийн өдрийн `OID > maxOid0`
 * мөрүүдээс (OID-оор эрэмбэлсэн) МАНАЙ жаазыг таньж устгах OID-уудыг буцаана. Урьд нь тэр өдрийн тэр мужийн БҮХ
 * мөрийг устгадаг тул тэмдэг ба бичилтийн завсарт ижил өдрөөр бичигдсэн ӨӨР батлалтын (өөр `sub|` мөр) жааз ч
 * устдаг байв.
 *   · жааз = `rootNo`-оор эхэлж дараагийн тийм № (эсвэл төгсгөл) хүртэлх хэсэг (`matchArchivedFrame`-ийн дүрэм);
 *   · БҮТЭН (ЯГ `n` мөр) эсвэл ТАСАРСАН (`n`-ээс богино, 500-ийн үржвэр — `applyAdds` 500-аар бичдэг) бөгөөд дээж
 *     (`probe`) таарсан хэсэг л манайх; `written` (баталгаажсан OID) үргэлж орно;
 *   · таарах хэсэг ОЛОН (хоёрдмол), дээж зөвхөн бөөрөнхийллөөр зөрсөн (`'near'`), эсвэл баталгаажсан OID танигдсан
 *     хэсгийн ГАДНА (жааз холилдсон) → `null` (танигдсангүй — дуудагч зөвхөн `written`-ийг устгаж, үлдсэнийг ил
 *     хэлнэ; fail-closed);
 *   · таарах хэсэг алга → `[...written]`.
 * Цэвэр функц — сүлжээг `hyanaltStore` хариуцна.
 */
export function lostFrameIds(
  rows: Record<string, unknown>[],
  mark: Pick<ArchivingMark, 'n' | 'rootNo' | 'probe'>,
  oidField: string,
  noField: string,
  dateFields?: readonly string[],
  written?: readonly number[],
): number[] | null {
  const own = new Set((written ?? []).filter((x) => Number.isInteger(x) && x > 0));
  if (!rows.length || mark.n <= 0) return [...own];
  const dates = new Set(dateFields ?? []);
  const noOf = (r: Record<string, unknown>) => String(r[noField] ?? '').trim();
  const root = mark.rootNo ?? noOf(rows[0]);
  const starts: number[] = [];
  if (root) rows.forEach((r, i) => { if (noOf(r) === root) starts.push(i); });
  else starts.push(0);
  let hit: number[] | null = null;
  for (let k = 0; k < starts.length; k += 1) {
    const s = starts[k];
    const end = root ? (k + 1 < starts.length ? starts[k + 1] : rows.length) : rows.length;
    const len = end - s;
    if (len !== mark.n && !(len < mark.n && len % 500 === 0)) continue;
    let near = false;
    let far = false;
    for (const [i, f, v] of mark.probe ?? []) {
      if (i >= len) continue;
      const c = cmpArchVal(rows[s + i]?.[f], v, dates.has(f));
      if (c === 'far') { far = true; break; }
      if (c === 'near') near = true;
    }
    if (far) continue;
    if (near || hit) return null;
    hit = [];
    for (const r of rows.slice(s, end)) {
      const oid = Number(r[oidField]);
      if (!Number.isInteger(oid) || oid <= 0) return null;
      hit.push(oid);
    }
  }
  if (hit) {
    const hs = new Set(hit);
    for (const w of own) if (!hs.has(w) && rows.some((r) => Number(r[oidField]) === w)) return null;
  }
  return [...new Set([...(hit ?? []), ...own])];
}

/**
 * ТЭМДГИЙН АРХИВЛАЖ БУЙ АГУУЛГА (2026-10-09) — тэмдэг ЭНЭ агуулгынх (`at` тэнцүү) бол payload өөрөө; ДАМЖСАН
 * (`mergeSubmission`) бол түүний хуулбар (`prev`) payload-ын хэлбэрээр; аль нь ч биш бол `null` (хасах боломжгүй).
 */
export function archivedContent(p: SubmissionPayload): SubmissionPayload | null {
  const m = p.archiving;
  if (!m) return null;
  if (m.at === p.at) return p;
  if (!m.prev) return null;
  const out: SubmissionPayload = { ...p, cells: m.prev.cells, rowKeys: m.prev.rowKeys };
  if (m.prev.rowOcc) out.rowOcc = m.prev.rowOcc; else delete out.rowOcc;
  return out;
}

/**
 * ШИЙДСЭН ТЭМДГИЙГ ХЭРЭГЖҮҮЛНЭ (2026-10-09) — `archiveSubmission` ба `FillNew.publish`-ийн НЭГ дүрэм, ЦЭВЭР.
 *   · `landed` (жааз архивт БУУСАН) → архивласан хэсгийг хассан үлдэгдэл (`residualAfterArchive`), `residual: true`
 *     (архивт ороогүй агуулга — «Шилжүүлсэн» урсгалын дор ч давхарлагдана/нэгтгэгдэнэ);
 *     хасах боломжгүй (хуулбаргүй · түлхүүр тулгагдаагүй) → `null` (дуудагч ТАТГАЛЗАНА).
 *   · буугаагүй → агуулга хэвээр (тэр агуулга архивт ХЭЗЭЭ Ч ороогүй).
 *   Хоёуланд тэмдэг арилна. Оролтыг ӨӨРЧЛӨХГҮЙ.
 */
export function resolveMark(p: SubmissionPayload, landed: boolean): SubmissionPayload | null {
  let out: SubmissionPayload = { ...p };
  if (landed && p.mode === 'inc') {
    const arch = archivedContent(p);
    if (!arch) return null;
    if (p.adds.length) return null;
    const rest = residualAfterArchive(p, arch);
    if (!rest) return null;
    out = { ...rest, residual: true };
  }
  delete out.archiving;
  return out;
}

/**
 * «claim» ЗӨРЧИЛ (2026-10-09, `markArchiving`) — ЦЭВЭР. `existing` тэмдэг ижил `at`-тай, ШИНЭ, ӨӨР сешнийх бол
 * `{ sameUser }` (ижил хэрэглэгчийн өөр таб/хөтөч эсэх), эс бөгөөс `null` (дарж болно).
 */
export function claimConflict(
  existing: ArchivingMark | undefined, at: number, sid: string, me: string, now = serverNow(),
): { sameUser: boolean; by: string } | null {
  if (!existing || existing.at !== at || !markFresh(existing, now)) return null;
  if (existing.sid && existing.sid === sid) return null;
  const by = (existing.by ?? '').toLowerCase();
  return { sameUser: !!by && by === me.toLowerCase(), by };
}

/** Хүснэгтээс уншсан илгээлт — мөрийн дугаар ба төлөвтэй */
export type StagedSubmission = { oid: number; at: number; done: boolean; payload: SubmissionPayload };

/**
 * `rowKeys`-ийг ХУУДАСНЫ ДАРААЛЛААР (oid ӨСӨХӨӨР) эрэмбэлнэ — шинэ массив.
 */
const byPageOrder = (keys: Iterable<[number, string]>): [number, string][] =>
  [...keys]
    .map(([o, k]): [number, string] => [o, k])
    .sort((a, b) => (a[0] < 0 ? 1 : 0) - (b[0] < 0 ? 1 : 0) || a[0] - b[0]);

/**
 * ХАДГАЛАХ ДЭЭД ХЭМЖЭЭ (тэмдэгт) — `draftRemote.REMOTE_MAX`-тай ижил үндэслэл:
 * талбарын урт 100,000, үлдсэн зай нь JSON escape-ийн нөөц.
 */
export const SUBMISSION_MAX = 80_000;

const SUB_PREFIX = 'sub|';
const DONE_PREFIX = 'done|';
/**
 * ИДЭВХТЭЙ ИЛГЭЭЛТИЙН ТҮЛХҮҮР.
 */
export const subKey = (pkgKey: string, fillMs?: number | null) =>
  fillMs == null ? `${SUB_PREFIX}${pkgKey}` : `${SUB_PREFIX}${pkgKey}|${fillMs}`;
const doneKey = (pkgKey: string, oid: number) => `${DONE_PREFIX}${pkgKey}|${oid}`;
const isSubmissionKey = (dkey: string) => dkey.startsWith(SUB_PREFIX) || dkey.startsWith(DONE_PREFIX);

const isStr = (x: unknown): x is string => typeof x === 'string';
const isFin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** `[string, string]` хос — нүд/огнооны бичлэг */
const isPair = (x: unknown): x is [string, string] =>
  Array.isArray(x) && x.length >= 2 && isStr(x[0]) && isStr(x[1]);
/** `[number, string]` хос — мөрийн танигч */
const isRowKey = (x: unknown): x is [number, string] =>
  Array.isArray(x) && x.length >= 2 && Number.isInteger(x[0]) && isStr(x[1]);
/** `[oid, k, n]` — мөрийн давтамжийн дугаар (2026-10-04, `SubmissionPayload.rowOcc`) */
const isOcc = (x: unknown): x is [number, number, number] =>
  Array.isArray(x) && x.length >= 3 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && Number.isInteger(x[2])
  && (x[1] as number) >= 0 && (x[2] as number) > (x[1] as number);
/**
 * Хадгалах илгээлтийн танигчийн тоо (`SubmissionPayload.nonces`).
 */
const NONCE_KEEP = 200;
const USERS_KEEP = 50;
/** Илгээгчдийн нэгдэл (жижиг үсгээр, давхардалгүй, сүүлийн `USERS_KEEP`) — `mergeSubmission`/`saveSubmission` */
function mergeUsers(...lists: (readonly (string | undefined)[] | undefined)[]): string[] {
  const out = new Set<string>();
  for (const l of lists) for (const x of l ?? []) {
    const v = String(x ?? '').trim().toLowerCase();
    if (v) out.add(v);
  }
  return [...out].slice(-USERS_KEEP);
}
/**
 * Илгээлтийг илгээсэн БҮХ данс (`users` ∪ `user`) — `hyanaltStore.authz` инженерийн шатны «өөрийн
 * илгээлтийг өөрөө хянах»-ын шалгуурт (2026-10-09, аудит). Хуучин мөр → зөвхөн `user` (хоосон бол `[]`).
 */
export const submittersOf = (p: Pick<SubmissionPayload, 'user' | 'users'>): string[] => mergeUsers(p.users, [p.user]);

/**
 * `fillMs`-ИЙН БОДИТ МУЖ — 2020-01-01-ээс өнөөдөр + 2 хоног.
 */
const FILL_MIN = Date.UTC(2020, 0, 1);
const FILL_SLACK = 2 * 86_400_000;
const isFillMs = (x: unknown): x is number =>
  isFin(x) && Number.isInteger(x) && x >= FILL_MIN && x <= Date.now() + FILL_SLACK;

/**
 * Түүхий JSON → шалгагдсан `SubmissionPayload`; эвдэрсэн бол `null`.
 */
export function parseSubmission(raw: string): SubmissionPayload | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const inc = d.mode === 'inc';
    if (d.v !== 1 && d.v !== 2) return null;
    if (d.v === 2 && !inc) return null;
    if (!isStr(d.pkgKey) || !d.pkgKey) return null;
    if (!Array.isArray(d.cells)) return null;
    if (!isFin(d.at) || !isFillMs(d.fillMs)) return null;

    const cells = (d.cells as unknown[]).filter(isPair).map(([k, v]): [string, string] => [k, v]);
    const dates = (Array.isArray(d.dates) ? (d.dates as unknown[]) : [])
      .filter(isPair).map(([k, v]): [string, string] => [k, v]);
    const rowKeys = byPageOrder((Array.isArray(d.rowKeys) ? (d.rowKeys as unknown[]) : [])
      .filter(isRowKey));

    const seen = new Set<number>();
    const adds: NewRow[] = [];
    for (const a of Array.isArray(d.adds) ? (d.adds as unknown[]) : []) {
      if (!a || typeof a !== 'object') continue;
      const r = a as Record<string, unknown>;
      const o = Number(r.oid);
      if (!Number.isInteger(o) || o >= 0 || seen.has(o)) continue;
      seen.add(o);
      adds.push({
        oid: o,
        parentNo: isStr(r.parentNo) ? r.parentNo : '',
        parentWork: isStr(r.parentWork) ? r.parentWork : '',
        parentIdx: Number.isInteger(r.parentIdx) ? (r.parentIdx as number) : -1,
        no: isStr(r.no) ? r.no : '',
        work: isStr(r.work) ? r.work : '',
        vol: isFin(r.vol) ? r.vol : null,
        unit: isFin(r.unit) ? r.unit : null,
      });
    }

    const out: SubmissionPayload = {
      v: inc ? 2 : 1,
      ...(inc ? { mode: 'inc' as const } : {}),
      pkgKey: d.pkgKey,
      user: isStr(d.user) ? d.user.toLowerCase() : '',
      at: d.at,
      fillMs: d.fillMs,
      base: isFin(d.base) ? d.base : null,
      asOf: isFin(d.asOf) ? d.asOf : null,
      cells,
      dates,
      adds,
      rowKeys,
    };
    if (Number.isInteger(d.archiveOid) && (d.archiveOid as number) > 0) out.archiveOid = d.archiveOid as number;
    if (isFin(d.approvedAt)) out.approvedAt = d.approvedAt;
    const occ = Array.isArray(d.rowOcc) ? (d.rowOcc as unknown[]).filter(isOcc).map((e): [number, number, number] => [e[0], e[1], e[2]]) : [];
    if (occ.length) out.rowOcc = occ;
    const nonces = Array.isArray(d.nonces) ? (d.nonces as unknown[]).filter((x): x is string => isStr(x) && x.length > 0 && x.length <= 64) : [];
    if (nonces.length) out.nonces = nonces.slice(-NONCE_KEEP);
    const users = Array.isArray(d.users)
      ? [...new Set((d.users as unknown[]).filter((x): x is string => isStr(x) && x.trim().length > 0 && x.length <= 128)
        .map((x) => x.trim().toLowerCase()))].slice(-USERS_KEEP)
      : [];
    if (users.length) out.users = users;
    if (d.regPending === true) out.regPending = true;
    if (d.residual === true) out.residual = true;
    const ro = d.residualOf as Record<string, unknown> | undefined;
    if (out.residual && ro && typeof ro === 'object' && Number.isInteger(ro.row) && (ro.row as number) > 0
      && Number.isInteger(ro.archiveOid) && (ro.archiveOid as number) >= 0 && isStr(ro.day) && /^\d{4}-\d{2}-\d{2}$/.test(ro.day))
      out.residualOf = { row: ro.row as number, archiveOid: ro.archiveOid as number, day: ro.day as string };
    const ar = d.archiving as Record<string, unknown> | undefined;
    if (ar && typeof ar === 'object' && isFin(ar.at) && isFin(ar.startedAt) && Number.isInteger(ar.maxOid0)
      && (ar.maxOid0 as number) >= 0 && isFin(ar.fillMs) && Number.isInteger(ar.n) && (ar.n as number) > 0) {
      const mk: ArchivingMark = { at: ar.at, startedAt: ar.startedAt, maxOid0: ar.maxOid0 as number, fillMs: ar.fillMs, n: ar.n as number };
      if (isStr(ar.rootNo) && ar.rootNo.length <= 64) mk.rootNo = ar.rootNo;
      const pr = Array.isArray(ar.probe)
        ? (ar.probe as unknown[]).filter((e): e is [number, string, number | string | null] =>
          Array.isArray(e) && e.length === 3 && Number.isInteger(e[0]) && (e[0] as number) >= 0 && (e[0] as number) < (ar.n as number)
          && isStr(e[1]) && e[1].length > 0 && e[1].length <= 128
          && (e[2] === null || isFin(e[2]) || (isStr(e[2]) && e[2].length <= 256)))
        : [];
      if (pr.length) mk.probe = pr.slice(0, PROBE_MAX).map((e): [number, string, number | string | null] => [e[0], e[1], e[2]]);
      if (isStr(ar.by) && ar.by.length <= 128) mk.by = ar.by.toLowerCase();
      if (isStr(ar.sid) && ar.sid.length <= 64) mk.sid = ar.sid;
      if (isFin(ar.prevGen)) mk.prevGen = ar.prevGen;
      const pv = ar.prev as Record<string, unknown> | undefined;
      if (pv && typeof pv === 'object' && Array.isArray(pv.cells) && Array.isArray(pv.rowKeys)) {
        const snap: ArchSnap = {
          cells: (pv.cells as unknown[]).filter(isPair).map(([k, v]): [string, string] => [k, v]),
          rowKeys: byPageOrder((pv.rowKeys as unknown[]).filter(isRowKey)),
        };
        const so = Array.isArray(pv.rowOcc) ? (pv.rowOcc as unknown[]).filter(isOcc).map((e): [number, number, number] => [e[0], e[1], e[2]]) : [];
        if (so.length) snap.rowOcc = so;
        mk.prev = snap;
      }
      out.archiving = mk;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * ХУРИМТЛАГДСАН илгээлт: хуучин payload дээр шинэ diff-ийг НЭГТГЭНЭ.
 *
 * Дүрэм: cells/dates — түлхүүрээр, шинэ нь дарна (2026-09-25: `mode: 'inc'`
 * үед cells нь НИЙЛБЭР — `sumInc`; горим зөрвөл throw); adds — oid-оор, шинэ нь
 * дарна (хуучин байрлал хэвээр — эцэг/дүү дараалал хадгалагдана), ГЭХДЭЭ ижил
 * oid дээр ӨӨР мөр ирвэл дарахгүй, шинэ сул oid авна (доорх); rowKeys —
 * oid-оор нэгтгэж ХУУДАСНЫ ДАРААЛЛААР (oid өсөхөөр) буцаана (`byPageOrder`);
 * asOf — шинэ ?? хуучин ?? null; base — мөн адил (мэдээлэл);
 * pkgKey/user/at/fillMs — шинэ. `archiveOid`/`approvedAt` ОРОХГҮЙ: нэгтгэсэн
 * илгээлт нь идэвхтэй (батлагдаагүй) — хаах үед `closeSubmission` нэмнэ.
 *
 * Оролтыг ӨӨРЧЛӨХГҮЙ (шинэ объект/массив).
 */
export function mergeSubmission(
  prev: SubmissionPayload | null,
  next: Omit<SubmissionPayload, 'v'>,
): SubmissionPayload {
  const inc = next.mode === 'inc';
  if (prev && (prev.mode === 'inc') !== inc)
    throw new Error(tr('Илгээлтийн горим зөрсөн (нэмэлт ↔ нийт) — нэгтгэсэнгүй. Хуудсыг дахин ачаална уу.'));
  const adds = new Map<number, NewRow>();
  for (const a of prev?.adds ?? []) adds.set(a.oid, a);

  /*
   * Нэмсэн мөрийн түр `oid` нь дуудагчийн модуль дахь тоолуураас гардаг
   * бөгөөд ТЭР ТООЛУУР ХУУДАС АЧААЛАГДАХ БҮРД −1-ЭЭС ЭХЭЛНЭ. Тиймээс
   * өдөр 1-д мөр нэмж илгээгээд хуудсаа дахин нээж дахин мөр нэмэхэд шинэ
   * мөр өмнөх илгээлтийн мөртэй ИЖИЛ (−1) дугаар авч болно. Урьд нь энд
   * `adds.set(a.oid, a)` гэж ДАРДАГ байсан тул өмнөх өдрийн нэмсэн мөр
   * (нэр, обьём, эцэг) илгээлтээс чимээгүй АЛГА болж, түүний `oid:b`
   * нүднүүд ч шинэ мөрийн утгаар солигддог байв — хэрэглэгчид ямар ч
   * анхааруулга гардаггүй (`unmoved` нь зөвхөн эерэг oid-ийг барьдаг).
   *
   * Дуудагч талд тоолуурыг илгээлтээс нь түлхэх засвар хийгдсэн боловч энэ
   * давхарга ӨӨРӨӨ бас хамгаалагдсан байх ёстой: ижил oid дээр АГУУЛГА нь
   * зөрсөн (өөр № / өөр ажил / өөр эцэг) мөр ирвэл ДАРАХГҮЙ, харин `next`-
   * ийн мөрд шинэ, сул сөрөг oid оноож, түүний нүд/огнооны түлхүүрийг ХАМТ
   * зөөнө. Ингэснээр хоёр мөр хоёулаа хадгалагдана.
   */
  let freeOid = -1;
  for (const o of adds.keys()) if (o <= freeOid) freeOid = o - 1;
  for (const [o] of next.rowKeys) if (o <= freeOid) freeOid = o - 1;
  /** Мөргөлдсөн түр oid → шинээр олгосон сул oid */
  const remap = new Map<number, number>();
  /** Хоёр нэмсэн мөр НЭГ мөр мөн үү (нэр · № · эцэг таарвал ижил) */
  const sameRow = (a: NewRow, b: NewRow) =>
    a.no === b.no && a.work === b.work && a.parentNo === b.parentNo && a.parentWork === b.parentWork;
  for (const a of next.adds) {
    const old = adds.get(a.oid);
    if (old && !sameRow(old, a)) {
      const fresh = freeOid;
      freeOid -= 1;
      remap.set(a.oid, fresh);
      adds.set(fresh, { ...a, oid: fresh });
      continue;
    }
    adds.set(a.oid, a);
  }

  /** `${oid}:…` түлхүүрийн oid-г зөөнө (зөөх шаардлагагүй бол хэвээр) */
  const fixKey = (k: string): string => {
    if (!remap.size) return k;
    const at = k.indexOf(':');
    if (at < 0) return k;
    const to = remap.get(Number(k.slice(0, at)));
    return to == null ? k : `${to}${k.slice(at)}`;
  };

  const cells = new Map<string, string>(prev?.cells ?? []);
  for (const [k0, v] of next.cells) {
    const k = fixKey(k0);
    if (!inc) { cells.set(k, v); continue; }
    const s = cells.has(k) ? sumInc(cells.get(k), v) : v;
    const d = parseInc(s);
    if (!d || (d.n === 0 && d.p === 0)) cells.delete(k);
    else cells.set(k, s);
  }
  const dates = new Map<string, string>(prev?.dates ?? []);
  for (const [k, v] of next.dates) dates.set(fixKey(k), v);
  const rowKeys = new Map<number, string>(prev?.rowKeys ?? []);
  for (const [o, k] of next.rowKeys) rowKeys.set(remap.get(o) ?? o, k);
  const occ = new Map<number, [number, number, number]>();
  for (const e of prev?.rowOcc ?? []) occ.set(e[0], [e[0], e[1], e[2]]);
  for (const e of next.rowOcc ?? []) { const o = remap.get(e[0]) ?? e[0]; occ.set(o, [o, e[1], e[2]]); }
  const nonces = [...new Set([...(prev?.nonces ?? []), ...(next.nonces ?? [])])].slice(-NONCE_KEEP);
  let archiving: ArchivingMark | undefined;
  if (prev?.archiving) {
    const am = prev.archiving;
    archiving = am.prev || am.at !== prev.at
      ? { ...am }
      : {
        ...am,
        prev: {
          cells: prev.cells.map(([k, v]): [string, string] => [k, v]),
          rowKeys: prev.rowKeys.map(([o, l]): [number, string] => [o, l]),
          ...(prev.rowOcc?.length ? { rowOcc: prev.rowOcc.map((e): [number, number, number] => [e[0], e[1], e[2]]) } : {}),
        },
      };
  }
  return {
    v: inc ? 2 : 1,
    ...(inc ? { mode: 'inc' as const } : {}),
    pkgKey: next.pkgKey,
    user: next.user.toLowerCase(),
    at: next.at,
    fillMs: next.fillMs,
    base: next.base ?? prev?.base ?? null,
    asOf: next.asOf ?? prev?.asOf ?? null,
    cells: [...cells].map(([k, v]): [string, string] => [k, v]),
    dates: [...dates].map(([k, v]): [string, string] => [k, v]),
    adds: [...adds.values()].map((a) => ({ ...a })),
    rowKeys: byPageOrder(rowKeys),
    ...(occ.size ? { rowOcc: [...occ.values()].filter(([o]) => rowKeys.has(o)).sort((a, b) => a[0] - b[0]) } : {}),
    ...(nonces.length ? { nonces } : {}),
    ...(archiving ? { archiving } : {}),
    ...(() => {
      const users = mergeUsers(prev?.users, [prev?.user], next.users, [next.user]);
      return users.length ? { users } : {};
    })(),
  };
}

/**
 * АРХИВЛАГДСАН ХЭСГИЙГ ИДЭВХТЭЙ ИЛГЭЭЛТЭЭС ХАСНА — нэмэлтийн горимд л (2026-09-25).
 *
 * Түлхүүр: эхлээд ижил `${oid}:${b}`; олдохгүй бол (дахин илгээлт шинэ жааз
 * руу зөөгдсөн) хоёр payload-ын `rowKeys` шошгоор ДАРААЛЛААР хослуулна
 * (`sheetFrame.buildOidMap`-ийн дүрэм). Хослох аргагүй түлхүүр үлдвэл `null` —
 * дуудагч ил анхааруулна (таамаглаж хасвал буруу нүднээс хасна).
 */
export function residualAfterArchive(
  cur: SubmissionPayload,
  archived: SubmissionPayload,
): SubmissionPayload | null {
  if (cur.mode !== 'inc' || archived.mode !== 'inc') return null;
  const cells = new Map<string, string>(cur.cells);
  /* Шошго → oid-ууд (хуудасны дарааллаар) — давхардсан шошгыг дарааллаар хослуулна */
  const byLabel = (keys: [number, string][]) => {
    const m = new Map<string, number[]>();
    for (const [o, l] of byPageOrder(keys)) {
      const a = m.get(l);
      if (a) a.push(o); else m.set(l, [o]);
    }
    return m;
  };
  const aLab = byLabel(archived.rowKeys ?? []);
  const cLab = byLabel(cur.rowKeys ?? []);
  const aLabelOf = new Map<number, [string, number]>();
  for (const [l, os] of aLab) os.forEach((o, i) => aLabelOf.set(o, [l, i]));
  const curOids = new Set<number>((cur.rowKeys ?? []).map(([o]) => o));
  const aOcc = new Map<number, [number, number]>((archived.rowOcc ?? []).map((e): [number, [number, number]] => [e[0], [e[1], e[2]]]));
  const cByOcc = new Map<string, number>();
  const cLabel = new Map<number, string>(cur.rowKeys ?? []);
  for (const e of cur.rowOcc ?? []) {
    const l = cLabel.get(e[0]);
    if (l != null) cByOcc.set(`${l}\u0000${e[1]}\u0000${e[2]}`, e[0]);
  }
  const pairTo = (oid: number): number | undefined => {
    const hit = aLabelOf.get(oid);
    if (!hit) return undefined;
    const ao = aOcc.get(oid);
    if (ao) {
      const to = cByOcc.get(`${hit[0]}\u0000${ao[0]}\u0000${ao[1]}`);
      if (to != null) return to;
    }
    const cs = cLab.get(hit[0]);
    if (!cs || cs.length !== (aLab.get(hit[0])?.length ?? -1)) return undefined;
    return cs[hit[1]];
  };
  for (const [k, v] of archived.cells) {
    const at = k.indexOf(':');
    if (at <= 0) return null;
    const oid = Number(k.slice(0, at));
    let key = k;
    if (oid >= 0 && !curOids.has(oid) && !cells.has(k)) {
      const to = pairTo(oid);
      if (to == null) return null;
      key = `${to}${k.slice(at)}`;
    }
    const s = sumInc(cells.get(key), negInc(v));
    const d = parseInc(s);
    if (!d || (d.n === 0 && d.p === 0)) cells.delete(key);
    else cells.set(key, s);
  }
  return { ...cur, cells: [...cells].map(([k, v]): [string, string] => [k, v]) };
}

/* ───────────────────────── ArcGIS — хүснэгттэй харьцах ───────────────────────── */

/** Алдааны объектоос хүнд уншигдах мессеж */
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message || 'ArcGIS error';
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; description?: unknown };
    const m = o.message ?? o.description;
    if (m != null && String(m)) return String(m);
  }
  return String(e ?? 'ArcGIS error');
};

type RowAttrs = { objectid?: number; dkey?: string; at?: number; payload?: string };

/**
 * ХАРИУ — «олдсонгүй» ба «уншиж чадсангүй» хоёрыг ЯЛГАНА.
 *
 * Тиймээс БИЧИХ шийдвэр гаргадаг дуудагч (`archiveSubmission`, `publish`)
 * `read*` хувилбарыг ашиглана; зөвхөн ХАРУУЛАХ зам (`load*`) чимээгүй
 * `null`-аараа хэвээр.
 */
export type SubRead =
  | { ok: true; sub: StagedSubmission | null }
  | { ok: false; error: string };

/**
 * Хүснэгтийн мөр → уншилтын үр дүн.
 *   · мөр огт алга                        → `{ok:true, sub:null}` (legacy зам зөвшөөрөгдөнө)
 *   · `dkey` нь `sub|`/`done|` БИШ        → `{ok:true, sub:null}` (ноорогийн мөр — илгээлт биш)
 *   · илгээлтийн мөр атал payload задрахгүй → `{ok:false}` (ЭНЭ нь илгээлт мөн
 *     боловч уншигдсангүй — legacy гэж үзвэл гүйцэтгэл алга болно)
 */
async function readRow(a: RowAttrs | undefined, rowsOf?: ReadonlyMap<number, Attrs[]>): Promise<SubRead> {
  if (!a || typeof a.objectid !== 'number') return { ok: true, sub: null };
  const dkey = String(a.dkey ?? '');
  if (!isSubmissionKey(dkey)) return { ok: true, sub: null };
  const h = a.payload ? parseHead(String(a.payload)) : null;
  if (!h) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', a.objectid) };
  if (h.pending != null) {
    if (Date.now() - h.pending < PENDING_TTL) return { ok: false, error: tr('Илгээлт №{0} яг одоо бичигдэж байна — хэдэн секундын дараа дахин ачаална уу', a.objectid) };
    return { ok: true, sub: null };
  }
  let payload = h.p;
  if (h.gens) {
    try {
      payload = await assemble(a.objectid, h, rowsOf?.get(a.objectid));
    } catch (e) {
      return { ok: false, error: tr('Илгээлт №{0}-ийн мөрүүд уншигдсангүй: {1}', a.objectid, errMsg(e)) };
    }
  }
  /* Мөрийн `at` талбар нь payload.at-тай адил боловч хуучин/эвдэрсэн мөрд
     байхгүй байж болно — payload-оос нөхнө. */
  const at = isFin(a.at) ? Number(a.at) : payload.at;
  return { ok: true, sub: { oid: a.objectid, at, done: dkey.startsWith(DONE_PREFIX), payload } };
}

/**
 * ТОЛГОЙН PAYLOAD (2026-10-26) — v1/v2 (нүдтэй, хуучин эсвэл PHASE A-ийн давхар хуулбар) эсвэл v3 (ЗӨВХӨН мета, нүдгүй).
 * `gens` = баталгаажсан мөрийн үеүд (байвал мөр эх сурвалж); хуучин таб payload-ыг дахин бичихэд `gens` хаягдана — тэр
 * үед payload-ын нүд эх сурвалж (шинэ бичигч дахин мөр болгоно). `meta` — v3 (нүд нь энд ХООСОН, мөрөөс угсрагдана).
 */
/**
 * `pending` — ШИНЭ толгойн түр мета (`saveSubmissionInner`: v2 багтахгүй үед толгойг OBJECTID-ийн төлөө ЭХЛЭЭД нэмнэ) —
 * баталгаажуулалт (`gens` + жинхэнэ payload) хүртэл агуулгагүй; уншигч ХООСОН илгээлт гэж ХАРАХГҮЙ (`readRow`).
 */
export type SubHead = { p: SubmissionPayload; gens: number[] | null; meta: boolean; pending?: number | null };
/** Түр толгойн хугацаа — үүнээс хуучин бол бичигч унасан (баталгаажаагүй, агуулгагүй) гэж үзнэ */
const PENDING_TTL = 15 * 60_000;
export function parseHead(raw: string): SubHead | null {
  let d: Record<string, unknown> | null;
  try { d = JSON.parse(raw) as Record<string, unknown> | null; } catch { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const gens = Array.isArray(d.gens) ? (d.gens as unknown[]).filter(isFin) : null;
  if (d.v === 3) {
    if (!gens) return null;
    const inc = d.mode === 'inc';
    const p = parseSubmission(JSON.stringify({
      ...d, v: inc ? 2 : 1, cells: [], dates: [],
      rowKeys: Array.isArray(d.rowKeys) ? d.rowKeys : [], rowOcc: Array.isArray(d.rowOcc) ? d.rowOcc : [],
    }));
    return p ? { p, gens, meta: true, pending: isFin(d.pending) ? d.pending : null } : null;
  }
  const p = parseSubmission(raw);
  return p ? { p, gens, meta: false } : null;
}
/** PHASE A — payload-д v2 бүтэн хуулбар (шинэчлээгүй табд) багтвал; `false` = зөвхөн мета (тулгалтын дараа) */
export const SUB_DUAL = true;
/**
 * Толгойн payload-ыг бичих хэлбэр: `gens`-гүй → хуучин (v1/v2) ЯГ; `gens`-тэй — нүд гарт байвал (`!meta`) ба багтвал v2 +
 * `gens` (давхар хуулбар), эс бөгөөс v3 МЕТА (нүд · `rowKeys` · `rowOcc` · `archiving.prev` хасагдана; `prevGen` үлдэнэ).
 */
export function headRaw(p: SubmissionPayload, gens: readonly number[] | null, meta = false): string {
  const full: Record<string, unknown> = p.mode === 'inc' ? { ...p, v: 2, mode: 'inc' } : { ...p, v: 1 };
  if (!gens) return JSON.stringify(full);
  if (!meta && SUB_DUAL) {
    const s = JSON.stringify({ ...full, gens });
    if (s.length <= SUBMISSION_MAX) return s;
  }
  const rest: Record<string, unknown> = { ...full };
  for (const k of ['cells', 'dates', 'rowKeys', 'rowOcc']) delete rest[k];
  const used = usedOids(p);
  const xk = p.rowKeys.filter(([o]) => !used.has(o));
  const xo = (p.rowOcc ?? []).filter(([o]) => !used.has(o));
  if (xk.length) rest.rowKeys = xk;
  if (xo.length) rest.rowOcc = xo;
  const ar = p.archiving ? { ...p.archiving } : undefined;
  if (ar && ar.prevGen != null) delete ar.prev;
  return JSON.stringify({ ...rest, v: 3, ...(ar ? { archiving: ar } : {}), gens });
}

/**
 * МӨРИЙН КОДЛОГЧ АГУУЛГЫГ ЯГ СЭРГЭЭХ ҮҮ (2026-10-26, «өгөгдөл алдагдахгүй» — хэрэглэгчийн тэргүүн шаардлага). Нүд ·
 * огноо ЯГ ижил, ашиглагдаж буй oid-ийн `rowKeys`/`rowOcc` ижил байх ёстой. ЯАГААД: хуучин НИЙТ (v1) илгээлтэд `''` ба
 * `'%0'` нүд бий (амьд 191: `done|b1_9f|128` г.м.) — мөрийн баганад `'%0'` нь `'0'` болж (НИЙТ горимд хувь 0 ≠ обьём 0),
 * `''` алга болдог байв. Алдагдалтай бол мөр рүү БИЧИХГҮЙ — payload эх сурвалж хэвээр (`saveSubmissionInner` ·
 * `migrateSubmissionRow`).
 */
export function subRowsLossless(p: Pick<SubmissionPayload, 'cells' | 'dates' | 'rowKeys' | 'rowOcc'>, frame: Frame | null): boolean {
  const want = subToRows({ cells: p.cells, dates: p.dates, rowKeys: p.rowKeys, ...(p.rowOcc ? { rowOcc: p.rowOcc } : {}), asOf: null }, frame);
  const attrs: Attrs[] = [...want].map(([k, a], i): Attrs => ({ ...a, mur_key: k, at: 1, objectid: i + 1 }));
  const c = subFromRows(pickGeneration(attrs, [1]));
  if (cellSig(c) !== cellSig(p)) return false;
  const used = usedOids(p);
  const rk = (l: readonly [number, string][]) => JSON.stringify(l.filter(([o]) => used.has(o)).map(([o, s]) => `${o}=${s}`).sort());
  const ro = (l: readonly [number, number, number][] | undefined) => JSON.stringify((l ?? []).filter(([o]) => used.has(o)).map((e) => e.join(',')).sort());
  return rk(c.rowKeys) === rk(p.rowKeys) && ro(c.rowOcc) === ro(p.rowOcc);
}
/** Нүд/огноонд хэрэглэгдэж буй oid */
function usedOids(p: Pick<SubmissionPayload, 'cells' | 'dates'>): Set<number> {
  const s = new Set<number>();
  for (const [k] of [...p.cells, ...p.dates]) { const o = Number(k.slice(0, k.indexOf(':'))); if (Number.isInteger(o)) s.add(o); }
  return s;
}
/** Хоёр тоо бараг тэнцүү (мөрийн `Double` ↔ 12 оронтой бичлэг, `bagtsSheet.numStr`) */
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
/** Нэг нэмэлтийн нүдийг кодлогчийн хэлбэрт — утга (n, p) ИЖИЛ бол; тэг/хоосон нэмэлт → `null` (хасна) */
function normInc(v: string): string | null {
  const x = parseInc(v);
  if (!x || (x.n === 0 && x.p === 0)) return null;
  const c = cellToCols(v);
  const s = c ? colsToCell(c.ob, c.act, c.niit, c.blank) : null;
  const y = s != null ? parseInc(s) : null;
  return s != null && y && close(x.n, y.n) && close(x.p, y.p) ? s : v;
}
/**
 * НЭМЭЛТИЙН ГОРИМЫН НҮДИЙГ ХЭВШҮҮЛНЭ (2026-10-26) — УТГА (n, p) ӨӨРЧЛӨГДӨХГҮЙ: тэг/хоосон нэмэлтийг хасна
 * (`mergeSubmission`-ий «тэг болсон нүдийг хаяна» ЯГ дүрэм — нэмэлт 0 нь юу ч нэмэхгүй), бичлэгийг мөрийн кодлогчийн хэлбэрт
 * («15.50» → «15.5»). «Архивлаж буй» хуулбар (`archiving.prev`) ч адил. НИЙТ (v1) горимд ХӨНДӨХГҮЙ — тэнд `''`/`'%0'` нь утга.
 */
export function normIncCells(p: SubmissionPayload): SubmissionPayload {
  if (p.mode !== 'inc') return p;
  const norm = (l: readonly [string, string][]): [string, string][] => {
    const out: [string, string][] = [];
    for (const [k, v] of l) { const s = normInc(v); if (s != null) out.push([k, s]); }
    return out;
  };
  const out: SubmissionPayload = { ...p, cells: norm(p.cells) };
  if (p.archiving?.prev) out.archiving = { ...p.archiving, prev: { ...p.archiving.prev, cells: norm(p.archiving.prev.cells) } };
  return out;
}
/** Хоёр агуулга ИЖИЛ үү — ЯГ, эсвэл нэмэлтийн горимд хэвшүүлсний дараа (`normIncCells`) */
function sameContent(a: SubmissionPayload, b: SubmissionPayload): boolean {
  if (cellSig(a) === cellSig(b)) return true;
  return a.mode === 'inc' && b.mode === 'inc' && cellSig(normIncCells(a)) === cellSig(normIncCells(b));
}

/** `gens`-тэй толгойн бүтэн payload — мөрөөс (сүүлийн баталгаажсан үе), «архивлаж байна» тэмдгийн хуулбар `prevGen`-ээс */
async function assemble(oid: number, h: SubHead, rows?: Attrs[]): Promise<SubmissionPayload> {
  return assembleRows(h, rows ?? (await subRowsFor([oid])).get(oid) ?? []);
}
/** `assemble`-ийн цэвэр хэсэг (тест) */
export function assembleRows(h: SubHead, all: readonly Attrs[]): SubmissionPayload {
  const gens = h.gens ?? [];
  const c = subFromRows(pickGeneration(all, gens));
  const rk = new Map<number, string>(h.p.rowKeys);
  for (const [o, l] of c.rowKeys) rk.set(o, l);
  const occ = new Map<number, [number, number, number]>((h.p.rowOcc ?? []).map((e): [number, [number, number, number]] => [e[0], [e[0], e[1], e[2]]]));
  for (const e of c.rowOcc ?? []) occ.set(e[0], [e[0], e[1], e[2]]);
  const p: SubmissionPayload = { ...h.p, cells: c.cells, dates: c.dates, rowKeys: byPageOrder(rk) };
  if (occ.size) p.rowOcc = [...occ.values()].sort((x, y) => x[0] - y[0]); else delete p.rowOcc;
  const m = p.archiving;
  if (m && m.prevGen != null && !m.prev) {
    const pv = subFromRows(pickGeneration(all, gens, m.prevGen));
    p.archiving = { ...m, prev: { cells: pv.cells, rowKeys: pv.rowKeys, ...(pv.rowOcc ? { rowOcc: pv.rowOcc } : {}) } };
  }
  return p;
}

/** Толгойн МЕТА л (нүд угсрахгүй) — «архивлаж байна» тэмдгийн шалгалтад (`archivingBusy`) */
function headRow(a: RowAttrs | undefined): SubRead {
  if (!a || typeof a.objectid !== 'number') return { ok: true, sub: null };
  const dkey = String(a.dkey ?? '');
  if (!isSubmissionKey(dkey)) return { ok: true, sub: null };
  const h = a.payload ? parseHead(String(a.payload)) : null;
  if (!h) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', a.objectid) };
  return { ok: true, sub: { oid: a.objectid, at: isFin(a.at) ? Number(a.at) : h.p.at, done: dkey.startsWith(DONE_PREFIX), payload: h.p } };
}

/** Олон толгойн мөрийг НЭГ дор (`gens`-тэйг л) — жагсаалтын уншилтад */
async function rowsFor(as: readonly (RowAttrs | undefined)[]): Promise<Map<number, Attrs[]>> {
  const oids: number[] = [];
  for (const a of as) {
    if (!a || typeof a.objectid !== 'number' || !a.payload || !String(a.payload).includes('"gens"')) continue;
    oids.push(a.objectid);
  }
  return oids.length ? subRowsFor(oids) : new Map();
}


const OUT_FIELDS = ['objectid', 'dkey', 'at', 'payload'];

/**
 * Уншихад бэлэн хүснэгтийн URL — `SubRead`-ийн ёсоор.
 */
async function readUrl(): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: tr('Нэвтрээгүй тул илгээлтийг уншиж чадсангүй') };
  return { ok: true, url: await tableUrl(false) };
}


/**
 * Багцын ИДЭВХТЭЙ илгээлт — АЛДААГ ЯЛГАДАГ хувилбар.
 */
export async function readActiveSubmission(pkgKey: string, fillMs?: number | null): Promise<SubRead> {
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const dayK = subKey(pkgKey, fillMs);
    const legacyK = subKey(pkgKey);
    const keys = dayK === legacyK ? [legacyK] : [dayK, legacyK];
    const res = await fl.queryFeatures({
      where: `dkey IN (${keys.map(sqlStr).join(', ')})`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid DESC'],
    });
    const feats = res.features.map((f) => f.attributes as RowAttrs | undefined);
    /* Тэр ӨДРИЙН мөр байвал ТЭР нь ялна — хуучин мөр байсан ч. */
    const day = feats.find((a) => String(a?.dkey ?? '') === dayK);
    if (day) return readRow(day);
    const legacy = feats.find((a) => String(a?.dkey ?? '') === legacyK);
    if (!legacy) return { ok: true, sub: null };
    const r = await readRow(legacy);
    if (!r.ok || !r.sub) return r;
    if (fillMs != null && r.sub.payload.fillMs !== fillMs) return { ok: true, sub: null };
    return r;
  } catch (e) {
    return { ok: false, error: tr('Илгээлтийн төлөвийг шалгаж чадсангүй: {0}', errMsg(e)) };
  }
}

/**
 * БАГЦЫН БҮХ ИДЭВХТЭЙ (батлагдаагүй) илгээлт — өдөр бүрд нэг.
 */
export async function listActiveSubmissions(pkgKey: string): Promise<StagedSubmission[]> {
  try {
    const u = await readUrl();
    if (!u.ok || !u.url) return [];
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `pkg = ${sqlStr(pkgKey)} AND dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid DESC'],
    });
    const out: StagedSubmission[] = [];
    const rmap = await rowsFor(res.features.map((f) => f.attributes as RowAttrs | undefined)).catch(() => null);
    for (const f of res.features) {
      const a = f.attributes as RowAttrs | undefined;
      if (!String(a?.dkey ?? '').startsWith(SUB_PREFIX)) continue;
      if (!rmap && a?.payload && String(a.payload).includes('"gens"')) continue;
      const r = await readRow(a, rmap ?? undefined);
      if (r.ok && r.sub && !r.sub.done && r.sub.payload.pkgKey === pkgKey) out.push(r.sub);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * ИЛГЭЭХ ОРОЛДЛОГЫН ТАНИГЧ (`nonce`) АЛЬ НЭГ МӨРӨНД БУУСАН УУ — АЛДААГ ЯЛГАДАГ (`SubRead`),
 * 2026-10-04 дахин аудит (#5, MED).
 */
export async function findNonce(pkgKey: string, nonce: string, since: number): Promise<SubRead> {
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `pkg = ${sqlStr(pkgKey)} AND at >= ${Math.floor(since)} AND (dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)} OR dkey LIKE ${sqlStr(`${DONE_PREFIX}%`)})`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid DESC'],
    });
    let hit: StagedSubmission | null = null;
    for (const f of res.features) {
      const a = f.attributes as RowAttrs | undefined;
      const h = a?.payload ? parseHead(String(a.payload)) : null;
      if (!h || h.p.pkgKey !== pkgKey || !(h.p.nonces ?? []).includes(nonce)) continue;
      const r = await readRow(a);
      if (!r.ok) return r;
      if (!r.sub || r.sub.payload.pkgKey !== pkgKey) continue;
      if (!(r.sub.payload.nonces ?? []).includes(nonce)) continue;
      if (!r.sub.done) return { ok: true, sub: r.sub };
      hit ??= r.sub;
    }
    return { ok: true, sub: hit };
  } catch (e) {
    return { ok: false, error: tr('Илгээлтийн төлөвийг шалгаж чадсангүй: {0}', errMsg(e)) };
  }
}


/**
 * Илгээлт OBJECTID-оор — АЛДААГ ЯЛГАДАГ хувилбар (`SubRead`).
 */
export async function readSubmissionByOid(oid: number): Promise<SubRead> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: true, sub: null };
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `objectid = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    return readRow(res.features[0]?.attributes as RowAttrs | undefined);
  } catch (e) {
    return { ok: false, error: tr('Илгээлт №{0}-ийг уншиж чадсангүй: {1}', oid, errMsg(e)) };
  }
}

/**
 * ГҮЙЦЭТГЭЛ ИЛГЭЭХ ЭРХ — `company` шатанд тэр багцад томилогдсон эсэх (2026-10-06, аудит #2).
 */
async function isZahiralUser(me: string): Promise<boolean> {
  const { roleOf } = await import('./permissions');
  return roleOf(me) === 'zahiral';
}
const ZAHIRAL_DENY = () => tr('Ерөнхий захирал гүйцэтгэлийг зөвхөн ХАРНА — бөглөх, илгээх боломжгүй.');

export async function companyDeny(group: string, allowChief = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const [{ AUTH, roleForUser }, { currentUser }, { bagtsFor, isViewOnly }] = await Promise.all([
    import('./services'), import('./who'), import('./guitsetgelAcl'),
  ]);
  if (!AUTH.appId) return null;
  const me = currentUser();
  if (!me) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  if (roleForUser(me) === 'super') return null;
  if (isViewOnly(me)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — гүйцэтгэл илгээх боломжгүй.');
  if (await isZahiralUser(me)) return ZAHIRAL_DENY();
  const cb = bagtsFor(me, 'company');
  if (cb === null || cb.includes(group)) return null;
  if (allowChief) {
    const ch = bagtsFor(me, 'chief');
    if (ch === null || ch.includes(group)) return null;
  }
  return tr('Та «{0}» багцын гүйцэтгэгчээр томилогдоогүй тул гүйцэтгэл илгээх эрхгүй.', group);
}

/**
 * ҮЛДЭГДЭЛ БИЧИХ ЭРХ (2026-10-21, аудит) — `saveResidualSubmission`: тухайн багцад ЭЦСИЙН (`chief`) шатанд
 * томилогдсон эсэх. Чөлөөлөлт `companyDeny`-тэй ижил (Node · нэвтрэлт унтраалттай · `super`); «зөвхөн харна» хориотой.
 */
export async function chiefDeny(group: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const [{ AUTH, roleForUser }, { currentUser }, { bagtsFor, isViewOnly }] = await Promise.all([
    import('./services'), import('./who'), import('./guitsetgelAcl'),
  ]);
  if (!AUTH.appId) return null;
  const me = currentUser();
  if (!me) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  if (roleForUser(me) === 'super') return null;
  if (isViewOnly(me)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — гүйцэтгэл илгээх боломжгүй.');
  if (await isZahiralUser(me)) return ZAHIRAL_DENY();
  const ch = bagtsFor(me, 'chief');
  if (ch === null || ch.includes(group)) return null;
  return tr('Та «{0}» багцын эцсийн шатны батлагчаар томилогдоогүй тул үлдэгдэл илгээлт бичих эрхгүй.', group);
}

/**
 * ИЛГЭЭЛТИЙГ ХАДГАЛНА (upsert `sub|<pkgKey>|<payload.fillMs>`).
 */
export async function saveSubmission(
  pkgKey: string,
  payload: SubmissionPayload,
  expect?: { at: number; dropMark?: number } | null,
): Promise<SaveSubmissionResult> {
  if (payload.residual === true || payload.residualOf != null)
    return { ok: false, error: tr('Үлдэгдлийн (residual) тэмдэгтэй илгээлтийг зөвхөн архивлалтын хаалт бичнэ — энэ замаар хүлээн авахгүй.') };
  return saveSubmissionInner(pkgKey, payload, expect, false);
}

/** `saveSubmission` · `saveResidualSubmission`-ий үр дүн (`lost` — `saveSubmissionInner`) */
export type SaveSubmissionResult = { ok: true; oid: number } | { ok: false; error: string; lost?: true };

/**
 * ҮЛДЭГДЭЛ ИЛГЭЭЛТИЙГ ХАДГАЛНА (2026-10-21, аудит) — ЗӨВХӨН `hyanaltStore.closeAfterArchive` дуудна: батлах явцад
 * дахин илгээснээс архивласан хэсгийг хассан үлдэгдэл (`residual: true` · `residualOf`). Бичигч нь тухайн багцын ЭЦСИЙН
 * (`chief`) шатны томилгоотой байх ёстой (`chiefDeny`) — гүйцэтгэгчийн томилгоо хангалтгүй. Илгээгчийн шалгалт
 * (агуулга гүйцэтгэгчийнх — `user`/`users` хэвээр) ба хяналтын хориг (үлдэгдэл = шинэ тойрог) энд ҮЙЛЧЛЭХГҮЙ.
 */
export async function saveResidualSubmission(
  pkgKey: string,
  payload: SubmissionPayload,
  expect?: { at: number; dropMark?: number } | null,
): Promise<SaveSubmissionResult> {
  if (payload.residual !== true)
    return { ok: false, error: tr('Үлдэгдлийн тэмдэггүй илгээлт — энэ зам зөвхөн үлдэгдэлд.') };
  return saveSubmissionInner(pkgKey, payload, expect, true);
}

/** `saveSubmission`/`saveResidualSubmission`-ийн НЭГ бие — `residual` аргумент нь payload-ын тугийг ОРЛОНО (дуудагчид итгэхгүй) */
async function saveSubmissionInner(
  pkgKey: string,
  payload: SubmissionPayload,
  /**
   * ХҮЛЭЭГДЭЖ БУЙ СУУРЬ (optimistic concurrency) — заавал биш.
   *   · `undefined` → шалгахгүй (хуучин зан төлөв);
   *   · `null`      → мөр БАЙХГҮЙ байх ёстой;
   *   · `{at}`      → байгаа мөрийн `at` нь ЯГ энэ байх ёстой.
   */
  expect?: { at: number; dropMark?: number } | null,
  residual = false,
): Promise<SaveSubmissionResult> {
  if (payload.pkgKey !== pkgKey) {
    return { ok: false, error: tr('Багцын түлхүүр зөрсөн: {0} ≠ {1}', payload.pkgKey, pkgKey) };
  }
  let body: SubmissionPayload = payload;
  if (typeof window !== 'undefined' && !residual) {
    const [{ AUTH }, { currentUser }] = await Promise.all([import('./services'), import('./who')]);
    if (AUTH.appId) {
      const me = (currentUser() ?? '').trim().toLowerCase();
      if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
      if (String(payload.user ?? '').trim().toLowerCase() !== me)
        return { ok: false, error: tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.') };
      body = { ...payload, user: me, users: mergeUsers(payload.users, [me]) };
    }
  }
  const raw = JSON.stringify(body.mode === 'inc' ? { ...body, v: 2, mode: 'inc' } : { ...body, v: 1 });
  const rowsBig = raw.length > SUBMISSION_MAX ? (await rowsReady()).mode === 'rows' : false;
  if (raw.length > SUBMISSION_MAX && !rowsBig) {
    return {
      ok: false,
      error: tr('Илгээлт хэт том ({0} тэмдэгт, дээд {1}). Хэсэгчлэн илгээх нь ТУСЛАХГҮЙ — дараагийн илгээлт өмнөхтэйгээ нэгтгэгддэг тул хэмжээ буурахгүй. Одоо илгээсэн хэсгээ хянагчаар батлуулсны дараа шинэ илгээлт цэвэр эхэлнэ.', raw.length, SUBMISSION_MAX),
    };
  }
  if (typeof window !== 'undefined') {
    const { PKGS } = await import('@/modules/sheet/bagts.pkg');
    const grp = PKGS.find((p) => p.key === pkgKey)?.group;
    if (!grp) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey) };
    const deny = residual ? await chiefDeny(grp) : await companyDeny(grp);
    if (deny) return { ok: false, error: deny };
    if (!residual) {
      const pk = PKGS.find((p) => p.key === pkgKey);
      const others = PKGS.filter((p) => p.group === grp && p.key !== pkgKey).map((p) => p.name);
      const { reviewLockDeny } = await import('./hyanaltSubmit');
      const lock = await reviewLockDeny(grp, pk?.name ?? '', others, payload.fillMs);
      if (lock) return { ok: false, error: lock };
    }
  }
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: tr('Нэвтрээгүй тул илгээлт хадгалагдсангүй') };
    const url = await tableUrl(true);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const dkey = subKey(pkgKey, payload.fillMs);
    const legacyK = subKey(pkgKey);
    const found = await fl.queryFeatures({
      where: `dkey IN (${[dkey, legacyK].map(sqlStr).join(', ')})`,
      outFields: ['objectid', 'dkey', 'at', 'payload'],
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const all = found.features.filter((f) => typeof f.attributes?.objectid === 'number');
    const feats0 = all.filter((f) => {
      const k = String(f.attributes.dkey ?? '');
      if (k === dkey) return true;
      if (k !== legacyK) return false;
      /* Хуучин мөр — ЗӨВХӨН ижил өдрийнх бол энэ илгээлтийн мөр гэж үзнэ. */
      const p = parseHead(String(f.attributes.payload ?? ''))?.p;
      return !!p && p.fillMs === payload.fillMs;
    });
    const pendOf = (x: (typeof feats0)[number]): number | null => parseHead(String(x.attributes.payload ?? ''))?.pending ?? null;
    if (feats0.some((x) => { const pa = pendOf(x); return pa != null && Date.now() - pa < PENDING_TTL; })) {
      return { ok: false, error: tr('Энэ өдрийн илгээлтийг өөр хэрэглэгч яг одоо бичиж байна — хэдэн секундын дараа хуудсыг дахин ачаалж илгээнэ үү. Юу ч илгээсэнгүй.') };
    }
    const stalePend = feats0.filter((x) => pendOf(x) != null).map((x) => x.attributes.objectid as number);
    const feats = feats0.filter((x) => pendOf(x) == null);
    const oids = feats.map((f) => f.attributes.objectid as number);
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = [...oids.slice(0, -1), ...stalePend];
    for (const o of stalePend) void subDropAll(o).catch(() => undefined);
    if (expect !== undefined) {
      const curAt = target != null ? (feats[feats.length - 1].attributes.at as unknown) : null;
      const same = expect === null
        ? target == null
        : target != null && isFin(curAt) && Number(curAt) === expect.at;
      if (!same) {
        return {
          ok: false,
          error: tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.'),
        };
      }
    }
    const curH = target != null ? parseHead(String(feats[feats.length - 1].attributes.payload ?? '')) : null;
    if (target != null) {
      const curP = curH?.p;
      const cm = curP?.archiving;
      if (cm && payload.archiving?.startedAt !== cm.startedAt && expect?.dropMark !== cm.startedAt) {
        return {
          ok: false,
          error: markFresh(cm)
            ? tr('Энэ өдрийн илгээлтийг {0} яг одоо архивлаж байна — хэдэн минутын дараа хуудсыг дахин ачаалж илгээнэ үү. Юу ч илгээсэнгүй.', cm.by || tr('газрын дарга'))
            : tr('Энэ өдрийн илгээлтийн өмнөх архивлалт шалгагдаагүй — хуудсыг дахин ачаалж илгээнэ үү. Юу ч илгээсэнгүй.'),
        };
      }
    }
    let rowsOn = rowsBig || (await rowsReady()).mode === 'rows';
    let tgt = target;
    let created = false;
    /** Шинээр нэмсэн толгойн payload бүтэн (v2) эсэх — тэгвэл баталгаажуулалт унасан ч агуулга толгойд бүрэн */
    let createdFull = false;
    let raw2 = raw;
    let gens1: number[] | null = null;
    let pins: number[] = [];
    /** Шинээр нэмсэн толгойн payload — баталгаажуулалтын өмнөх тулгалтад */
    let createdRaw: string | null = null;
    const fr = rowsOn ? fillFrame(pkgKey) : null;
    const bodyR: SubmissionPayload = rowsOn ? normIncCells(body) : body;
    if (rowsOn) {
      const ap = bodyR.archiving?.prev;
      const okRows = subRowsLossless(bodyR, fr) && (!ap || subRowsLossless({ ...ap, dates: [] }, fr));
      if (!okRows) {
        console.warn('[selbe] илгээлтийн агуулга мөрийн бүтцэд ЯГ буухгүй — JSON payload-аар хадгална:', dkey);
        if (raw.length > SUBMISSION_MAX) {
          return {
            ok: false,
            error: tr('Илгээлт хэт том ({0} тэмдэгт, дээд {1}). Хэсэгчлэн илгээх нь ТУСЛАХГҮЙ — дараагийн илгээлт өмнөхтэйгээ нэгтгэгддэг тул хэмжээ буурахгүй. Одоо илгээсэн хэсгээ хянагчаар батлуулсны дараа шинэ илгээлт цэвэр эхэлнэ.', raw.length, SUBMISSION_MAX),
          };
        }
        rowsOn = false;
      }
    }
    if (rowsOn) {
      const gens0 = curH?.gens ?? [];
      let bodyW: SubmissionPayload = bodyR;
      if (tgt == null) {
        const v2 = headRaw(bodyW, null);
        createdFull = v2.length <= SUBMISSION_MAX;
        const first = createdFull ? v2 : JSON.stringify({ ...(JSON.parse(headRaw(bodyW, [], true)) as Record<string, unknown>), pending: Date.now() });
        createdRaw = first;
        let r0: Awaited<ReturnType<typeof fl.applyEdits>>;
        try {
          r0 = await fl.applyEdits({ addFeatures: [{ attributes: { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: payload.at, payload: first } }] } as Parameters<typeof fl.applyEdits>[0]);
        } catch (e) {
          return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)), ...(isLostWrite(e) ? { lost: true as const } : {}) };
        }
        const a0 = (r0.addFeatureResults ?? [])[0];
        if (!a0 || a0.error != null || typeof a0.objectId !== 'number') {
          return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(a0?.error ?? tr('серверээс хариу ирсэнгүй.'))) };
        }
        tgt = a0.objectId;
        created = true;
      }
      const tOid = tgt as number;
      const allRows = created ? [] : (await subRowsFor([tOid])).get(tOid) ?? [];
      const usedGen = new Set<number>([...gens0, ...allRows.map((a) => Number(a.at)).filter(Number.isFinite)]);
      /** Үеийн дугаар — толгойн `at`-аас БАГА (самбарын «`at ≤ толгойн at`» дүрэм), 2^-12-ын үржвэр (Double-д ЯГ) */
      const pickGen = (): number => {
        for (;;) {
          const g = payload.at - (1 + Math.floor(Math.random() * 3990)) / 4096;
          if (!usedGen.has(g)) { usedGen.add(g); return g; }
        }
      };
      let vis: ReadonlyMap<string, Attrs> = curH?.gens ? pickGeneration(allRows, gens0) : new Map<string, Attrs>();
      const mid: number[] = [];
      const am = bodyW.archiving;
      const fail = async (err: string): Promise<SaveSubmissionResult> => {
        if (created) {
          await fl.applyEdits({ deleteFeatures: [{ objectId: tOid }] } as Parameters<typeof fl.applyEdits>[0]).catch(() => undefined);
          void subDropAll(tOid).catch(() => undefined);
        }
        return { ok: false, error: tr('Илгээлтийн мөр хадгалагдсангүй: {0}', err) };
      };
      if (am?.prev && (am.prevGen == null || !gens0.includes(am.prevGen))) {
        if (gens0.length && am.at === curH?.p.at) {
          bodyW = { ...bodyW, archiving: { ...am, prevGen: gens0[gens0.length - 1] } };
        } else {
          const gp = pickGen();
          const snap = subToRows({ cells: am.prev.cells, dates: [], rowKeys: am.prev.rowKeys, ...(am.prev.rowOcc ? { rowOcc: am.prev.rowOcc } : {}), asOf: null }, fr);
          const wp = await subWriteGen(tOid, pkgKey, snap, vis, gp);
          if (!wp.ok) return fail(wp.error);
          vis = snap;
          mid.push(gp);
          bodyW = { ...bodyW, archiving: { ...am, prevGen: gp } };
        }
      }
      const gen = pickGen();
      const w = await subWriteGen(tOid, pkgKey, subToRows(bodyW, fr), vis, gen);
      if (!w.ok) return fail(w.error);
      gens1 = [...gens0, ...mid, gen];
      pins = bodyW.archiving?.prevGen != null ? [bodyW.archiving.prevGen] : [];
      raw2 = headRaw(bodyW, gens1);
    }
    if (rowsOn && tgt != null && (created ? createdRaw != null : target != null)) {
      const expRaw = created ? (createdRaw as string) : String(feats[feats.length - 1].attributes.payload ?? '');
      const expAt = created ? payload.at : Number(feats[feats.length - 1].attributes.at);
      let cur: { at?: unknown; payload?: unknown } | undefined;
      let readOk = true;
      try {
        const chk = await fl.queryFeatures({ where: `objectid = ${tgt}`, outFields: ['objectid', 'at', 'payload'], returnGeometry: false });
        cur = chk.features[0]?.attributes as { at?: unknown; payload?: unknown } | undefined;
      } catch (e) {
        /* Шинэ толгой — өөрөө нэмсэн тул уншилт унасан ч үргэлжилнэ (өмнөх зан); байгаа толгойд шалгаж чадаагүй бол бичихгүй */
        if (!created) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)) };
        readOk = false;
      }
      if (readOk && (!cur || String(cur.payload ?? '') !== expRaw || !isFin(cur.at) || Number(cur.at) !== expAt)) {
        return { ok: false, error: tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.') };
      }
    }
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: payload.at, payload: raw2 };
    const edit = {
      ...(tgt != null
        ? { updateFeatures: [{ attributes: { objectid: tgt, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    let r: Awaited<ReturnType<typeof fl.applyEdits>> | null = null;
    let commitErr: string | null = null;
    let commitLost = false;
    try {
      r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    } catch (e) {
      commitErr = errMsg(e);
      commitLost = isLostWrite(e);
    }
    let results = r ? [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])] : [];
    if (!commitErr && !results.length) commitErr = tr('серверээс хариу ирсэнгүй.');
    const bad0 = results.find((x) => x.error != null);
    if (!commitErr && bad0) commitErr = errMsg(bad0.error);
    if (commitErr && created) {
      if (createdFull) {
        console.warn('[selbe] илгээлтийн мөрийн баталгаажуулалт унав — толгойн бүтэн payload хүчинтэй:', commitErr);
        results = [{ objectId: tgt as number, error: null } as (typeof results)[number]];
        gens1 = null;
        commitErr = null;
      } else {
        await fl.applyEdits({ deleteFeatures: [{ objectId: tgt as number }] } as Parameters<typeof fl.applyEdits>[0]).catch(() => undefined);
        void subDropAll(tgt as number).catch(() => undefined);
      }
    }
    if (commitErr) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', commitErr), ...(commitLost && !created ? { lost: true as const } : {}) };
    const bad = results.find((x) => x.error != null);
    if (bad) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(bad.error)) };
    const oid = tgt ?? results[0]?.objectId;
    if (typeof oid !== 'number' || !(oid > 0)) {
      return { ok: false, error: tr('Илгээлт хадгалагдсангүй: серверээс мөрийн дугаар ирсэнгүй') };
    }
    const badDel = (r?.deleteFeatureResults ?? []).find((x) => x.error != null);
    if (badDel) console.warn('[selbe] илгээлтийн давхардсан мөр устсангүй:', errMsg(badDel.error));
    try {
      const back = await fl.queryFeatures({
        where: `dkey = ${sqlStr(dkey)}`,
        outFields: ['objectid', 'usr', 'at'],
        returnGeometry: false,
        orderByFields: ['objectid ASC'],
      });
      const rowsB = back.features.filter((f) => typeof f.attributes?.objectid === 'number');
      const mineB = rowsB.find((f) => f.attributes.objectid === oid);
      const lost = tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.');
      if (mineB && (target == null || created) && (rowsB[0].attributes.objectid as number) < oid) {
        const del = await fl.applyEdits({ deleteFeatures: [{ objectId: oid }] } as Parameters<typeof fl.applyEdits>[0]);
        const dr = del.deleteFeatureResults ?? [];
        if (rowsOn) void subDropAll(oid).catch(() => undefined);
        if (dr.length && dr.every((x) => x.error == null)) return { ok: false, error: lost };
      } else if (mineB && isFin(mineB.attributes.at) && (Number(mineB.attributes.at) !== payload.at
        || String(mineB.attributes.usr ?? '').toLowerCase() !== attrs.usr)) {
        return { ok: false, error: lost };
      }
    } catch { /* баталгааны уншилт унасан — бичилт батлагдсан хэвээр */ }
    if (rowsOn && gens1) {
      void setHeaderCols(oid, { mur_turul: 'tolgoi', mur_key: 'h', noorog_turul: 'ilgeelt', huvilbar: ROW_VERSION, huuchin_at: payload.at }).catch(() => undefined);
      void subGc(oid, gens1, pins).catch(() => 0);
    }
    return { ok: true, oid };
  } catch (e) {
    return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)) };
  }
}

/**
 * ИЛГЭЭЛТИЙГ ХААНА — төлөвлөлтийн ахлах инженер баталж архивт бичсэний ДАРАА.
 * `dkey` → `done|<pkgKey>|<oid>`, payload-д `archiveOid`/`approvedAt` нэмнэ.
 */
export async function closeSubmission(
  oid: number,
  archiveOid: number,
  approvedAt: number,
  /** `true` → payload-д `regPending` тавина (`SubmissionPayload.regPending`) */
  regPending?: boolean,
  /**
   * АРХИВЛАСАН АГУУЛГЫН `at` (compare-and-set, 2026-09-25-ны аудит, HIGH).
   */
  expectAt?: number,
): Promise<{ ok: boolean; error?: string; changed?: boolean }> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `objectid = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (dkey.startsWith(DONE_PREFIX)) return { ok: true };
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    const head = parseHead(String(a.payload ?? ''));
    const payload = head?.p ?? null;
    if (!head || !payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    if (expectAt !== undefined) {
      /* `readRow`-ийн дүрэм: мөрийн `at` талбар, байхгүй бол payload-ынх */
      const curAt = isFin(a.at) ? Number(a.at) : payload.at;
      if (curAt !== expectAt)
        return { ok: false, changed: true, error: tr('Илгээлт №{0} архивлах явцад дахин илгээгдсэн — хаасангүй', oid) };
    }
    const pkgKey = payload.pkgKey || dkey.slice(SUB_PREFIX.length).split('|')[0];
    const next: SubmissionPayload = { ...payload, archiveOid, approvedAt };
    delete next.archiving;
    if (regPending) next.regPending = true;
    const edit = {
      updateFeatures: [{
        attributes: { objectid: oid, dkey: doneKey(pkgKey, oid), payload: headRaw(next, head.gens, head.meta) },
      }],
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const ups = r.updateFeatureResults ?? [];
    if (!ups.length) {
      return { ok: false, error: tr('Илгээлт хаагдсангүй: серверээс хариу ирсэнгүй.') };
    }
    const bad = ups.find((x) => x.error != null || typeof x.objectId !== 'number');
    if (bad) return { ok: false, error: errMsg(bad.error) || tr('Илгээлт хаагдсангүй.') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * «АРХИВЛАЖ БАЙНА» ТЭМДЭГ ТАВИНА (2026-10-09, R2; `SubmissionPayload.archiving`).
 */
export async function markArchiving(
  oid: number,
  expectAt: number,
  /** `null` → тэмдгийг арилгана (бичилт унаж буцаагдсан үед) */
  mark: NonNullable<SubmissionPayload['archiving']> | null,
): Promise<{ ok: boolean; error?: string; changed?: boolean; busy?: true }> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
  try {
    const me = ((await getAuth())?.user ?? '').toLowerCase();
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({ where: `objectid = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, changed: true, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    const head = parseHead(String(a.payload ?? ''));
    const payload = head?.p ?? null;
    if (!head || !payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    const curAt = isFin(a.at) ? Number(a.at) : payload.at;
    if (curAt !== expectAt)
      return { ok: false, changed: true, error: tr('Илгээлт №{0} архивлах явцад дахин илгээгдсэн — хаасангүй', oid) };
    if (mark) {
      const cf = claimConflict(payload.archiving, expectAt, SESSION_ID, me);
      if (cf) {
        return {
          ok: false,
          busy: true,
          error: cf.sameUser
            ? tr('Та энэ ажлыг өөр цонх/хөтчөөс яг одоо батлаж (архивлаж) байна — тэр дуусахыг хүлээнэ үү. Юу ч бичсэнгүй.')
            : tr('{0} энэ ажлыг яг одоо батлаж (архивлаж) байна — дуусахыг хүлээгээд дахин оролдоно уу. Юу ч бичсэнгүй.', cf.by || tr('Өөр хянагч')),
        };
      }
    } else if (payload.archiving?.sid && payload.archiving.sid !== SESSION_ID) {
      return { ok: false, error: tr('«Архивлаж байна» тэмдэг өөр цонхных — арилгасангүй') };
    }
    const next: SubmissionPayload = { ...payload };
    const pg = head.gens?.length ? head.gens[head.gens.length - 1] : undefined;
    if (mark) next.archiving = { ...mark, by: mark.by ?? me, sid: SESSION_ID, ...(pg != null && mark.prevGen == null ? { prevGen: pg } : {}) };
    else delete next.archiving;
    const r = await fl.applyEdits({
      updateFeatures: [{ attributes: { objectid: oid, at: curAt, payload: headRaw(next, head.gens, head.meta) } }],
    } as Parameters<typeof fl.applyEdits>[0]);
    const err = updOk(r);
    if (err) return { ok: false, error: err };
    const res2 = await fl.queryFeatures({ where: `objectid = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
    const a2 = res2.features[0]?.attributes as RowAttrs | undefined;
    const p2 = a2 ? parseHead(String(a2.payload ?? ''))?.p ?? null : null;
    const at2 = a2 && isFin(a2.at) ? Number(a2.at) : p2?.at;
    if (!a2 || !p2 || !String(a2.dkey ?? '').startsWith(SUB_PREFIX) || at2 !== expectAt || p2.at !== expectAt
      || (mark ? p2.archiving?.at !== mark.at || p2.archiving?.startedAt !== mark.startedAt || p2.archiving?.sid !== SESSION_ID : p2.archiving != null))
      return { ok: false, changed: true, error: tr('Илгээлт №{0} архивлах явцад дахин илгээгдсэн — хаасангүй', oid) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * БАГЦЫН ГҮЙЦЭТГЭЛ ЯГ ОДОО АРХИВЛАГДАЖ БАЙНА УУ (2026-10-09, ГЭРЭЭ) — Ажил нэмэх · обьём · Хуваарийн бичигчид
 * `Bagts_*`-д бичихийн ӨМНӨ дуудна.
 *   · тухайн багцын нээлттэй `sub|` мөр(үүд)-ийн аль нэгэнд (өдрөөс үл хамааран) ШИНЭ (`ARCHIVING_TTL_MS`)
 *     «архивлаж байна» тэмдэг байвал `{ who, at }` (`at` = эхэлсэн агшин), эс бөгөөс `null`;
 *   · уншилт УНАВАЛ THROW — дуудагч ХААНА (fail-closed): «тэмдэг алга» гэж ҮЗЭХГҮЙ.
 */
export async function archivingBusy(
  pkgKey: string,
  exceptOid?: number,
): Promise<{ who: string; at: number } | null> {
  const u = await readUrl();
  if (!u.ok) throw new Error(u.error);
  if (!u.url) return null;
  const fl = await layer(u.url);
  const res = await fl.queryFeatures({
    where: `pkg = ${sqlStr(pkgKey)} AND dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)} AND payload LIKE '%"archiving"%'`,
    outFields: OUT_FIELDS,
    returnGeometry: false,
    orderByFields: ['objectid ASC'],
  });
  const now = serverNow();
  let best: { who: string; at: number } | null = null;
  for (const f of res.features) {
    const r = headRow(f.attributes as RowAttrs | undefined);
    if (!r.ok || !r.sub || r.sub.done || r.sub.payload.pkgKey !== pkgKey) continue;
    if (exceptOid != null && r.sub.oid === exceptOid) continue;
    const m = r.sub.payload.archiving;
    if (!m || !markFresh(m, now)) continue;
    if (!best || m.startedAt > best.at) best = { who: m.by ?? '', at: m.startedAt };
  }
  return best;
}

/** `applyEdits`-ийн шинэчлэлийн үр дүн — хоосон хариу ч алдаа (`closeSubmission`-ий) */
const updOk = (r: { updateFeatureResults?: { error?: unknown; objectId?: unknown }[] }): string | null => {
  const ups = r.updateFeatureResults ?? [];
  if (!ups.length) return tr('Серверээс хариу ирсэнгүй.');
  const bad = ups.find((x) => x.error != null || typeof x.objectId !== 'number');
  return bad ? errMsg(bad.error) || tr('Бичигдсэнгүй.') : null;
};

/**
 * «БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ» ТЭМДГИЙГ АРИЛГАНА — нэгтгэл ба IPC хоёулаа
 * амжилттай болсны дараа (`SubmissionPayload.regPending`).
 */
export async function markRegistered(sheetOid: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(sheetOid) || sheetOid <= 0) return { ok: true };
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `objectid = ${sheetOid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a || !String(a.dkey ?? '').startsWith(DONE_PREFIX)) return { ok: true };
    const head = parseHead(String(a.payload ?? ''));
    const payload = head?.p ?? null;
    if (!head || !payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', sheetOid) };
    if (payload.regPending !== true) return { ok: true };
    const next: SubmissionPayload = { ...payload };
    delete next.regPending;
    const r = await fl.applyEdits({
      updateFeatures: [{ attributes: { objectid: sheetOid, payload: headRaw(next, head.gens, head.meta) } }],
    } as Parameters<typeof fl.applyEdits>[0]);
    const err = updOk(r);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ `done|` илгээлтүүд — `retryPendingRegistrations`-д.
 */
export async function listRegPending(): Promise<StagedSubmission[]> {
  try {
    const u = await readUrl();
    if (!u.ok || !u.url) return [];
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `dkey LIKE 'done|%' AND payload LIKE '%"regPending":true%'`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const out: StagedSubmission[] = [];
    const rmap = await rowsFor(res.features.map((f) => f.attributes as RowAttrs | undefined));
    for (const f of res.features) {
      const r = await readRow(f.attributes as RowAttrs | undefined, rmap);
      if (r.ok && r.sub && r.sub.done && r.sub.payload.regPending === true) out.push(r.sub);
    }
    return out;
  } catch {
    return [];
  }
}

/* ══════════════ 2026-10-26: хуучин JSON илгээлтийг мөр рүү (админ) · тулгалт · Phase B ══════════════ */

/** Нүд/огнооны олонлогийн гарын үсэг — тулгалтад (дараалал хамаарахгүй) */
const cellSig = (p: Pick<SubmissionPayload, 'cells' | 'dates'>): string =>
  JSON.stringify([...p.cells.map(([k, v]) => `c${k}=${v}`), ...p.dates.map(([k, v]) => `d${k}=${v}`)].sort());

/** Толгойн мөр OBJECTID-оор (JS API давхарга) */
async function headAt(oid: number): Promise<{ fl: Awaited<ReturnType<typeof layer>>; a: RowAttrs } | null> {
  const url = await tableUrl(false);
  if (!url) return null;
  const fl = await layer(url);
  const res = await fl.queryFeatures({ where: `objectid = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
  const a = res.features[0]?.attributes as RowAttrs | undefined;
  return a ? { fl, a } : null;
}

/**
 * ХУУЧИН (v1/v2, `gens`-гүй) ИЛГЭЭЛТИЙГ МӨР РҮҮ — `n:sub:<OBJECTID>` үе бичээд payload-д ЗӨВХӨН `gens` (+ «архивлаж буй»
 * хуулбарын `prevGen`) нэмнэ (нүд ХЭВЭЭР — Phase B хүртэл; хуучин таб уншсаар). `at` · `dkey` · OBJECTID хөдлөхгүй. Давтахад юу
 * ч хийхгүй.
 */
export async function migrateSubmissionRow(oid: number): Promise<{ ok: true; migrated: boolean } | { ok: false; error: string }> {
  try {
    const h0 = await headAt(oid);
    if (!h0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const raw = String(h0.a.payload ?? '');
    const head = parseHead(raw);
    if (!head) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    if (head.gens) return { ok: true, migrated: false };
    const fr = fillFrame(head.p.pkgKey);
    const ok = (x: SubmissionPayload) => subRowsLossless(x, fr) && (!x.archiving?.prev || subRowsLossless({ ...x.archiving.prev, dates: [] }, fr));
    let p = head.p;
    if (!ok(p)) {
      p = normIncCells(head.p);
      if (p === head.p || !ok(p)) {
        return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга мөрийн бүтцэд ЯГ буухгүй — JSON хэвээр үлдэв (өгөгдөл хөндөгдөөгүй)', oid) };
      }
    }
    const old = (await subRowsFor([oid])).get(oid) ?? [];
    const used = new Set<number>(old.map((a) => Number(a.at)).filter(Number.isFinite));
    const pickGen = (): number => {
      for (;;) {
        const g = p.at - (1 + Math.floor(Math.random() * 3990)) / 4096;
        if (!used.has(g)) { used.add(g); return g; }
      }
    };
    const gens: number[] = [];
    let vis: ReadonlyMap<string, Attrs> = new Map();
    let prevGen: number | undefined;
    const ap = p.archiving?.prev;
    if (ap && p.archiving?.prevGen == null) {
      prevGen = pickGen();
      const snap = subToRows({ cells: ap.cells, dates: [], rowKeys: ap.rowKeys, ...(ap.rowOcc ? { rowOcc: ap.rowOcc } : {}), asOf: null }, fr);
      const wp = await subWriteGen(oid, p.pkgKey, snap, vis, prevGen);
      if (!wp.ok) return { ok: false, error: wp.error };
      vis = snap;
      gens.push(prevGen);
    }
    const gen = pickGen();
    const w = await subWriteGen(oid, p.pkgKey, subToRows(p, fr), vis, gen);
    if (!w.ok) return { ok: false, error: w.error };
    gens.push(gen);
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (prevGen != null && obj.archiving && typeof obj.archiving === 'object') obj.archiving = { ...(obj.archiving as Record<string, unknown>), prevGen };
    const next = JSON.stringify({ ...obj, gens });
    if (next.length > 100_000) return { ok: false, error: tr('Илгээлт №{0}-ийн payload хэт урт', oid) };
    const again = await headAt(oid);
    if (!again || String(again.a.payload ?? '') !== raw || Number(again.a.at) !== Number(h0.a.at)) return { ok: false, error: tr('Илгээлт №{0} шилжүүлэх явцад өөрчлөгдсөн — дахин оролдоно уу', oid) };
    const r = await h0.fl.applyEdits({ updateFeatures: [{ attributes: { objectid: oid, payload: next, ...(isFin(h0.a.at) ? { at: h0.a.at } : {}) } }] } as Parameters<typeof h0.fl.applyEdits>[0]);
    const err = updOk(r);
    if (err) return { ok: false, error: err };
    const after = await headAt(oid).catch(() => null);
    if (after && String(after.a.payload ?? '') !== next) return { ok: false, error: tr('Илгээлт №{0} шилжүүлэх явцад өөрчлөгдсөн — дахин оролдоно уу', oid) };
    await setHeaderCols(oid, { mur_turul: 'tolgoi', mur_key: 'h', noorog_turul: 'ilgeelt', huvilbar: ROW_VERSION, huuchin_at: p.at }).catch(() => undefined);
    void subGc(oid, gens, prevGen != null ? [prevGen] : []).catch(() => 0);
    return { ok: true, migrated: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Тулгалт — мөрөөс угсарсан нүд = payload-ын нүд? (`pending` = мөр рүү ороогүй; v3 мета = харьцуулах JSON алга → `same`) */
export async function compareSubmissionRow(oid: number): Promise<'same' | 'diff' | 'pending'> {
  const h0 = await headAt(oid);
  const head = h0 ? parseHead(String(h0.a.payload ?? '')) : null;
  if (!head || !head.gens) return 'pending';
  if (head.meta) return 'same';
  const p = await assemble(oid, head);
  return sameContent(p, head.p) ? 'same' : 'diff';
}

/** PHASE B — мөр тулгагдсан (`gens`-тэй, нүд нь ижил) толгойн payload-аас нүдийг хасна (v3 мета) */
export async function stripSubmissionPayload(oid: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const h0 = await headAt(oid);
    const head = h0 ? parseHead(String(h0.a.payload ?? '')) : null;
    if (!h0 || !head) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    if (!head.gens) return { ok: false, error: tr('Илгээлт №{0} мөр рүү шилжээгүй', oid) };
    if (head.meta) return { ok: true };
    /* «архивлаж байна» тэмдгийн хуулбар үегүй (`prevGen`) бол мета-д алдагдана — хасахгүй */
    if (head.p.archiving?.prev && head.p.archiving.prevGen == null) return { ok: false, error: tr('Илгээлт №{0} архивлагдаж буй — дараа хасна', oid) };
    const p = await assemble(oid, head);
    if (!sameContent(p, head.p)) return { ok: false, error: tr('Илгээлт №{0}-ийн мөр payload-аас зөрсөн — хасаагүй', oid) };
    const again = await headAt(oid);
    if (!again || String(again.a.payload ?? '') !== String(h0.a.payload ?? '') || Number(again.a.at) !== Number(h0.a.at)) {
      return { ok: false, error: tr('Илгээлт №{0} шилжүүлэх явцад өөрчлөгдсөн — дахин оролдоно уу', oid) };
    }
    const next = headRaw(p, head.gens, true);
    const r = await h0.fl.applyEdits({ updateFeatures: [{ attributes: { objectid: oid, payload: next, ...(isFin(h0.a.at) ? { at: h0.a.at } : {}) } }] } as Parameters<typeof h0.fl.applyEdits>[0]);
    const err = updOk(r);
    if (err) return { ok: false, error: err };
    const after = await headAt(oid).catch(() => null);
    if (after && String(after.a.payload ?? '') !== next) return { ok: false, error: tr('Илгээлт №{0} шилжүүлэх явцад өөрчлөгдсөн — дахин оролдоно уу', oid) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

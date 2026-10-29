import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { CHANAR_MIR_SVC } from '@/lib/services/env';
import { entSession, entStamp } from '@/lib/entDocs';
import { maAttachScopeDeny, requireAttachCap, splitMulti, type StageState, type Verdict } from '@/lib/ma';
import { addDoc, deleteDoc, docKey, listDocs, type AttMeta, type ChanarDoc } from '@/lib/chanarDocs';
import { AUTH } from '@/lib/services';

/**
 * MIR — МАТЕРИАЛЫН ҮЗЛЭГ ШАЛГАЛТ (2026-10-09). Чанарын 2-р шат. Survey123 → Enterprise hosted:
 *   `/0` form — MIR бичлэг (MA-тай `ma_no`-оор холбогдоно),
 *   `/1` photos — талбайн зураг (`parentrowid` → form.`uniquerowid || globalid`, зураг нь энэ хүснэгтийн attachment).
 */
export const MIR_URL = CHANAR_MIR_SVC ? `${CHANAR_MIR_SVC}/FeatureServer/0` : '';
export const MIR_PHOTOS_URL = CHANAR_MIR_SVC ? `${CHANAR_MIR_SVC}/FeatureServer/1` : '';

export type CheckMark = 'OK' | 'NA' | 'X' | null;
export type MirRow = {
  oid: number;
  rowId: string;
  docNo: string;
  date: number | null;
  pkg: string;
  pkgLabel: string;
  building: string;
  contractor: string;
  maNo: string;
  material: string;
  verdict: Verdict | null;
  xCount: number;
  qty: number | null;
  unit: string;
  remarks: string;
  /** 8 шалгалт — [гүйцэтгэгч, захиалагч] */
  checks: [CheckMark, CheckMark][];
  conQ: string;
  conQPos: string;
  cliSup: string;
  cliSupPos: string;
  cliQ: string;
  cliQPos: string;
  /** Хавсралтын чагт (lab · cert · photo · invoice · other) */
  attFlags: string[];
  attOther: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/**
 * GUID → Enterprise-ийн GUID талбарын БИЧИГЛЭЛ `{XXXXXXXX-…}` (хаалттай, том үсэг); хоосон бол ''.
 */
export const guidBraced = (v: unknown): string => {
  const k = str(v).replace(/[{}\s]/g, '').toUpperCase();
  return k ? `{${k}}` : '';
};
const mark = (v: unknown): CheckMark => { const s = str(v).toUpperCase(); return s === 'OK' || s === 'NA' || s === 'X' ? s : null; };

export function mirRowOf(a: Record<string, unknown>): MirRow {
  const v = str(a.verdict).toUpperCase();
  return {
    oid: Number(a.objectid),
    rowId: guidBraced(a.uniquerowid) || guidBraced(a.globalid),
    docNo: str(a.doc_no),
    date: num(a.insp_date),
    pkg: str(a.pkg),
    pkgLabel: str(a.pkg_label) || str(a.pkg),
    building: str(a.building),
    contractor: str(a.contractor_name),
    maNo: str(a.ma_no),
    material: str(a.material_name),
    verdict: v === 'A' || v === 'AN' || v === 'R' ? v : null,
    xCount: num(a.x_count) ?? 0,
    qty: num(a.qty),
    unit: str(a.qty_unit),
    remarks: str(a.remarks),
    checks: Array.from({ length: 8 }, (_, i) => [mark(a[`c${i + 1}_con`]), mark(a[`c${i + 1}_cli`])] as [CheckMark, CheckMark]),
    conQ: str(a.con_q_name),
    conQPos: str(a.con_q_pos),
    cliSup: str(a.cli_sup_name),
    cliSupPos: str(a.cli_sup_pos),
    cliQ: str(a.cli_q_name),
    cliQPos: str(a.cli_q_pos),
    attFlags: splitMulti(a.att_flags),
    attOther: str(a.att_other),
  };
}

/** Бүх MIR — сүүлд илгээсэн нь эхэнд. Үйлчилгээ тохируулаагүй бол хоосон (MA харагдац ажилласаар). */
export async function loadMir(): Promise<MirRow[]> {
  if (!MIR_URL) return [];
  const rows = await queryFeatures(MIR_URL, { where: '1=1', outFields: ['*'], orderBy: 'objectid DESC' });
  return rows.map((r) => mirRowOf(r as Record<string, unknown>));
}

/** MA дугаар → тэр MA-гийн MIR-үүд (сүүлийнх эхэнд) */
export function mirsByMa(rows: readonly MirRow[]): Map<string, MirRow[]> {
  const m = new Map<string, MirRow[]>();
  for (const r of rows) {
    if (!r.maNo) continue;
    const l = m.get(r.maNo);
    if (l) l.push(r); else m.set(r.maNo, [r]);
  }
  for (const l of m.values()) l.sort((a, b) => b.oid - a.oid);
  return m;
}

/**
 * MA-гийн MIR шат (гинжид, `chainOf`-ын `MIR` оролт):
 *   · MIR огт байхгүй → `undefined` (хүлээгдэж буй);
 *   · аль нэг ачаа A/AN → 'A' (материал талбайд хүлээн авагдсан — дараагийн R ачаа нь тэр ачааны асуудал);
 *   · бүгд R → 'R'.
 */
export function mirVerdictFor(mirs: readonly MirRow[] | undefined): Verdict | null | undefined {
  if (!mirs?.length) return undefined;
  if (mirs.some((r) => r.verdict === 'A' || r.verdict === 'AN')) return 'A';
  if (mirs.every((r) => r.verdict === 'R')) return 'R';
  return null;
}

export const markLabel = (m: CheckMark): string => (m === 'NA' ? 'N/A' : m ?? '—');
const MIR_CHECKS: (() => string)[] = [
  () => tr('Зураг төсөлтэй таарч буй эсэх'), () => tr('Материал баталгаажуулалт хийгдсэн эсэх'),
  () => tr('Баталгаажуулсан нийлүүлэгч байгууллага зөрөөгүй'), () => tr('Цэвэрхэн / хэвийн эсэх'),
  () => tr('Горимын дагуу хадгалсан болон хамгаалагдсан эсэх'), () => tr('Лабораторийн туршилтын дүн хавсаргасан эсэх'),
  () => tr('Стандартад заасан хэмжээ, хүлцэх хэмжээндээ байгаа эсэх'), () => tr('Гэмтэлгүй эсэх'),
];
export const mirCheckLabel = (i: number): string => MIR_CHECKS[i]?.() ?? String(i + 1);

/* ═══════════════ ЗУРАГ (`/1` photos) ═══════════════ */

export type MirPhoto = { rowOid: number; attId: number; name: string; note: string };

type ArcErr = { error?: { code?: number; message?: string; details?: string[] } };
const TIMEOUT = 120_000;
async function postJson<T>(url: string, body: URLSearchParams): Promise<T> {
  const s = entSession(); if (s) body.set('token', s.token);
  await entStamp(body);
  let r: Response;
  try { r = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT) }); } catch (e) {
    if ((e as Error)?.name === 'TimeoutError') throw new Error(tr('Enterprise хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.'));
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  let j: T & ArcErr;
  try { j = await r.json(); } catch { throw new Error(tr('Enterprise JSON биш хариу буцаав.')); }
  if (j?.error) {
    if (j.error.code === 498 || j.error.code === 499) throw new Error(tr('Enterprise-д нэвтрээгүй эсвэл сешн дууссан — дахин нэвтэрнэ үү.'));
    const det = j.error.details?.filter(Boolean).join(' · ');
    throw new Error(`${j.error.message || tr('Enterprise алдаа')}${det ? ` — ${det}` : ''}`);
  }
  return j;
}

/** MIR-ийн зургууд — photos хүснэгтийн мөр бүрийн attachment */
export async function loadMirPhotos(rowId: string): Promise<MirPhoto[]> {
  const id = guidBraced(rowId).replace(/'/g, '');
  if (!MIR_PHOTOS_URL || !id) return [];
  const rows = await queryFeatures(MIR_PHOTOS_URL, { where: `parentrowid='${id}'`, outFields: ['objectid', 'photo_note'], orderBy: 'objectid' });
  const out: MirPhoto[] = [];
  for (const r of rows) {
    const oid = Number(r.objectid);
    const j = await postJson<{ attachmentInfos?: { id: number; name: string }[] }>(`${MIR_PHOTOS_URL}/${oid}/attachments`, new URLSearchParams({ f: 'json' }));
    for (const a of j.attachmentInfos ?? []) out.push({ rowOid: oid, attId: a.id, name: a.name, note: str(r.photo_note) });
  }
  return out;
}

/** Зургийн файл — POST (токен URL-д орохгүй), Blob */
export async function mirPhotoBlob(p: MirPhoto): Promise<Blob> {
  const body = new URLSearchParams();
  const s = entSession(); if (s) body.set('token', s.token);
  await entStamp(body);
  const r = await fetch(`${MIR_PHOTOS_URL}/${p.rowOid}/attachments/${p.attId}`, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  if ((r.headers.get('content-type') ?? '').includes('json')) throw new Error(tr('Зураг татагдсангүй.'));
  return r.blob();
}

/** MIR-ийн шатны төлөв (картын жагсаалтад) */
export const mirState = (r: MirRow): StageState => (r.verdict === 'A' || r.verdict === 'AN' ? 'done' : r.verdict === 'R' ? 'rejected' : 'pending');

/* ═══════════════ БАРИМТ — геопорталын тусдаа item (`chanarDocs`, 2026-10-29) ═══════════════ */

export type MirAtt = ChanarDoc;
export const MIR_DOC_FOLDER = 'Survey-MIR';
/** Холбоосын таг — `uniquerowid` (хоосон бол objectid) */
export const mirDocKey = (m: Pick<MirRow, 'rowId' | 'oid'>): string => docKey('mir', m.rowId || `oid-${m.oid}`);

export const listMirAtts = (m: Pick<MirRow, 'rowId' | 'oid'>): Promise<MirAtt[]> => listDocs(mirDocKey(m));

/** Бичилтийн өмнө: MIR-ийн багцад чанарын баримтын эрхтэй эсэх (`maAttachScopeDeny` — MA-тай ижил дүрэм) */
async function requireMirScope(m: Pick<MirRow, 'pkg'>): Promise<void> {
  if (!(typeof window !== 'undefined' && !!AUTH.appId)) return;
  const deny = await maAttachScopeDeny(m.pkg);
  if (deny) throw new Error(deny);
}

export async function addMirAtt(m: Pick<MirRow, 'rowId' | 'oid' | 'pkg'>, file: File, meta: AttMeta): Promise<{ doc: MirAtt; warn?: string }> {
  requireAttachCap();
  await requireMirScope(m);
  return addDoc({ key: mirDocKey(m), folder: MIR_DOC_FOLDER }, file, meta);
}

export async function deleteMirAtt(m: Pick<MirRow, 'pkg'>, att: MirAtt): Promise<void> {
  requireAttachCap();
  await requireMirScope(m);
  await deleteDoc(att);
}

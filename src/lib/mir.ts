import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { CHANAR_MIR_SVC } from '@/lib/services/env';
import { entSession } from '@/lib/entDocs';
import { splitMulti, type StageState, type Verdict } from '@/lib/ma';

/**
 * MIR — МАТЕРИАЛЫН ҮЗЛЭГ ШАЛГАЛТ (2026-10-09). Чанарын 2-р шат. Survey123 → Enterprise hosted:
 *   `/0` form — MIR бичлэг (MA-тай `ma_no`-оор холбогдоно),
 *   `/1` photos — талбайн зураг (`parentrowid` → form.`uniquerowid`, зураг нь энэ хүснэгтийн attachment).
 *
 * ⚠️ ХЭРЭГЛЭГЧИЙН ШИЙДВЭР (`memory/chanar-redesign`): MA-гүй бол MIR-гүй. MIR нь талбайд ирсэн НЭГ
 *    АЧААНЫ үзлэг — нэг MA-д олон MIR (олон ачаа) байна.
 * ⚠️ MIR-ийн дүн (`verdict`) маягт өөрөө бодно: захиалагчийн 8 шалгалтын аль нэг нь «X» бол R, эс бөгөөс A.
 * ⚠️ Уншилт нэргүй (`queryFeatures`, AGOL токен Enterprise руу явахгүй); зураг татахад Enterprise
 *    токен байвал залгана (POST биеэр — `tools/tokenInUrl.check.mjs`).
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
const mark = (v: unknown): CheckMark => { const s = str(v).toUpperCase(); return s === 'OK' || s === 'NA' || s === 'X' ? s : null; };

export function mirRowOf(a: Record<string, unknown>): MirRow {
  const v = str(a.verdict).toUpperCase();
  return {
    oid: Number(a.objectid),
    rowId: str(a.uniquerowid),
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
    /* ⚠️ 2026-10-09 (аудит №6): `splitMulti` (ma.ts) — урьд нь `/[s,]+/` (`\s` биш `s` үсэг) тул «lab cert photo»
       нэг туг болж, «s» үсэгтэй утга («photos») тасардаг байв. Тест: `mir.check.mjs`. */
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
 * ⚠️ Олон ачаа (олон MIR) — НЭГ батлагдсан ачаа шатыг нээнэ; татгалзсан ачааг MA картад тусад нь харуулна.
 */
export function mirVerdictFor(mirs: readonly MirRow[] | undefined): Verdict | null | undefined {
  if (!mirs?.length) return undefined;
  if (mirs.some((r) => r.verdict === 'A' || r.verdict === 'AN')) return 'A';
  if (mirs.every((r) => r.verdict === 'R')) return 'R';
  return null;
}

export const markLabel = (m: CheckMark): string => (m === 'NA' ? 'N/A' : m ?? '—');
/* ⚠️ Шалгалтын нэрс — `tr()` ЛИТЕРАЛААР (i18n-extract динамик `tr(x)`-ийг танихгүй) */
const MIR_CHECKS: (() => string)[] = [
  () => tr('Зураг төсөлтэй таарч буй эсэх'), () => tr('Материал баталгаажуулалт хийгдсэн эсэх'),
  () => tr('Баталгаажуулсан нийлүүлэгч байгууллага зөрөөгүй'), () => tr('Цэвэрхэн / хэвийн эсэх'),
  () => tr('Горимын дагуу хадгалсан болон хамгаалагдсан эсэх'), () => tr('Лабораторийн туршилтын дүн хавсаргасан эсэх'),
  () => tr('Стандартад заасан хэмжээ, хүлцэх хэмжээндээ байгаа эсэх'), () => tr('Гэмтэлгүй эсэх'),
];
export const mirCheckLabel = (i: number): string => MIR_CHECKS[i]?.() ?? String(i + 1);

/* ═══════════════ ЗУРАГ (`/1` photos) ═══════════════ */

export type MirPhoto = { rowOid: number; attId: number; name: string; note: string };

type ArcErr = { error?: { code?: number; message?: string } };
async function postJson<T>(url: string, body: URLSearchParams): Promise<T> {
  const s = entSession(); if (s) body.set('token', s.token);
  const r = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  const j = (await r.json()) as T & ArcErr;
  if (j?.error) throw new Error(j.error.message || tr('Enterprise алдаа'));
  return j;
}

/** MIR-ийн зургууд — photos хүснэгтийн мөр бүрийн attachment */
export async function loadMirPhotos(rowId: string): Promise<MirPhoto[]> {
  if (!MIR_PHOTOS_URL || !rowId) return [];
  const safe = rowId.replace(/'/g, "''");
  const rows = await queryFeatures(MIR_PHOTOS_URL, { where: `parentrowid='${safe}'`, outFields: ['objectid', 'photo_note'], orderBy: 'objectid' });
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
  const r = await fetch(`${MIR_PHOTOS_URL}/${p.rowOid}/attachments/${p.attId}`, { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  if ((r.headers.get('content-type') ?? '').includes('json')) throw new Error(tr('Зураг татагдсангүй.'));
  return r.blob();
}

/** MIR-ийн шатны төлөв (картын жагсаалтад) */
export const mirState = (r: MirRow): StageState => (r.verdict === 'A' || r.verdict === 'AN' ? 'done' : r.verdict === 'R' ? 'rejected' : 'pending');

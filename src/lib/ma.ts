import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { CHANAR_MA_SVC } from '@/lib/services/env';
import { entSession } from '@/lib/entDocs';

/**
 * MA — МАТЕРИАЛ БАТАЛГААЖУУЛАЛТ (2026-10-09). Survey123 маягт → Enterprise hosted
 * feature service (`NEXT_PUBLIC_CHANAR_MA_SVC`, давхарга `/0`). Портал УНШИНА, бөглөхгүй.
 *
 * ⚠️ ХЭРЭГЛЭГЧИЙН ШИЙДВЭРҮҮД (2026-10-09, `memory/chanar-redesign`):
 *    · Чанарын 4 шат MA → MIR → FIC → М-акт; MA-гүй бол MIR-гүй … (гинж MA дээр тулгуурлана).
 *    · НЭГ MA = НЭГ материал, ОЛОН ажил. `works` = Survey123 select_multiple → зайгаар
 *      тусгаарласан `багц:des` түлхүүрүүд (`des` нь бөглөх хуудасны мөрийн тогтвортой дугаар,
 *      `oid` БИШ — нийтлэл бүрд солигддог; `bagts.pkg.ts`-ийн ⚠️).
 *    · MA · MIR батлагдаагүй бол ажил ЯВАГДАХГҮЙ; FIC · М-акт гараагүй бол IPC ОЛГОХГҮЙ.
 *    · Хавсралт (гэрчилгээ · лабораторийн дүн · зураг) Survey123-д ОРДОГГҮЙ — ПОРТАЛААС энэ
 *      бичлэгт attachment болгон нэмнэ; скан OCR-дохгүй, зөвхөн гэрчилгээний № · стандарт ·
 *      хүчинтэй хугацааг гараар бичнэ (`keywords`-д, доорх `AttMeta`).
 * ⚠️ Уншилт `queryFeatures` (token:'org' → Enterprise хост руу AGOL токен ЯВАХГҮЙ; давхарга
 *    нэргүй уншилт зөвшөөрдөг). Хавсралтын бичилт Enterprise токентой (`entSession`).
 * ⚠️ ArcGIS алдаа HTTP 200-аар `{error}` биед — бүх хариуг шалгана.
 * ⚠️ `CHANAR_MA_SVC` хоосон бол харагдац «тохируулаагүй» гэж хэлнэ (зөвхөн локал туршилт).
 */
export const MA_URL = CHANAR_MA_SVC ? `${CHANAR_MA_SVC}/FeatureServer/0` : '';

export type Verdict = 'A' | 'AN' | 'R';

export type MaRow = {
  oid: number;
  globalId: string;
  respNo: string;
  respDate: number | null;
  recvDate: number | null;
  subDocNo: string;
  pkg: string;
  pkgLabel: string;
  contractor: string;
  material: string;
  /** `багц:des` түлхүүрүүд — дараалал Survey123-ынх */
  works: string[];
  verdict: Verdict | null;
  anNote: string;
  rReason: string;
  docItems: string[];
  apprName: string;
  apprPos: string;
  revName: string;
  revPos: string;
  ackName: string;
  ackPos: string;
  prepName: string;
  prepPos: string;
  recvByName: string;
  recvByPos: string;
  created: number | null;
  edited: number | null;
};

const F = {
  oid: 'objectid', gid: 'globalid', pkg: 'pkg', pkgLabel: 'pkg_label', contractorName: 'contractor_name',
  materialName: 'material_name', subDocNo: 'sub_doc_no', recvDate: 'recv_date', respNo: 'resp_no', respDate: 'resp_date',
  works: 'works', docItems: 'doc_items', verdict: 'verdict', anNote: 'an_note', rReason: 'r_reason',
  apprName: 'appr_name', apprPos: 'appr_pos', revName: 'rev_name', revPos: 'rev_pos', ackName: 'ack_name', ackPos: 'ack_pos',
  prepName: 'prep_name', prepPos: 'prep_pos', recvByName: 'recv_by_name', recvByPos: 'recv_by_pos', created: 'created_date', edited: 'last_edited_date',
} as const;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Survey123 select_multiple → утгын жагсаалт. ⚠️ Survey123 ТАСЛАЛААР хадгалдаг (ODK нь зайгаар) — хоёуланг таслана; давхардал · хоосон хасна */
export function splitMulti(v: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of str(v).split(/[\s,]+/)) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function toVerdict(v: unknown): Verdict | null {
  const s = str(v).toUpperCase();
  return s === 'A' || s === 'AN' || s === 'R' ? s : null;
}

/** Нэг мөрийн атрибут → `MaRow` (тестлэгдэнэ) */
export function rowOf(a: Record<string, unknown>): MaRow {
  return {
    oid: Number(a[F.oid]),
    globalId: str(a[F.gid]),
    respNo: str(a[F.respNo]),
    respDate: num(a[F.respDate]),
    recvDate: num(a[F.recvDate]),
    subDocNo: str(a[F.subDocNo]),
    pkg: str(a[F.pkg]),
    pkgLabel: str(a[F.pkgLabel]) || str(a[F.pkg]),
    contractor: str(a[F.contractorName]),
    material: str(a[F.materialName]),
    works: splitMulti(a[F.works]),
    verdict: toVerdict(a[F.verdict]),
    anNote: str(a[F.anNote]),
    rReason: str(a[F.rReason]),
    docItems: splitMulti(a[F.docItems]),
    apprName: str(a[F.apprName]),
    apprPos: str(a[F.apprPos]),
    revName: str(a[F.revName]),
    revPos: str(a[F.revPos]),
    ackName: str(a[F.ackName]),
    ackPos: str(a[F.ackPos]),
    prepName: str(a[F.prepName]),
    prepPos: str(a[F.prepPos]),
    recvByName: str(a[F.recvByName]),
    recvByPos: str(a[F.recvByPos]),
    created: num(a[F.created]),
    edited: num(a[F.edited]),
  };
}

/** Бүх MA — сүүлд илгээсэн нь эхэнд */
export async function loadMa(): Promise<MaRow[]> {
  if (!MA_URL) throw new Error(tr('MA үйлчилгээ тохируулаагүй (NEXT_PUBLIC_CHANAR_MA_SVC).'));
  /* `queryFeatures` → хавтгай атрибут (`Row`), хуудаслалт · 200-аар ирсэн `{error}` дотроо */
  const rows = await queryFeatures(MA_URL, { where: '1=1', outFields: ['*'], orderBy: `${F.oid} DESC` });
  return rows.map((r) => rowOf(r as Record<string, unknown>));
}

export const verdictLabel = (v: Verdict | null): string =>
  v === 'A' ? tr('A — Татгалзаагүй') : v === 'AN' ? tr('AN — Саналтай татгалзаагүй') : v === 'R' ? tr('R — Татгалзсан') : tr('Шийдвэргүй');

/** Батлагдсан (ажил эхлэх хаалгыг нээдэг) шийдвэр — A эсвэл AN */
export const isApproved = (v: Verdict | null): boolean => v === 'A' || v === 'AN';

/**
 * АЖИЛ БҮРИЙН MA ХААЛГА. Тухайн ажлыг (`багц:des`) сонгосон MA-ууд дундаас:
 *   · нэг ч MA байхгүй → 'none' (материал баталгаажуулалт шаардагдаагүй гэж ҮЗЭХГҮЙ — тодорхойгүй);
 *   · бүгд A/AN → 'ok'; аль нэг нь R эсвэл шийдвэргүй → 'blocked'.
 * ⚠️ Нэг ажил ОЛОН MA-д (бетон + арматур) орж болно — бүгд нь батлагдсан байх ёстой
 *    («ажил эхлэх хаалга», хэрэглэгч 2026-10-09). Тестлэгдэнэ.
 */
export type MaGate = 'none' | 'ok' | 'blocked';
export function maGateOf(workKey: string, rows: readonly MaRow[]): { gate: MaGate; mas: MaRow[] } {
  const mas = latestPerRespNo(rows).filter((r) => r.works.includes(workKey));
  if (!mas.length) return { gate: 'none', mas };
  return { gate: mas.every((r) => isApproved(r.verdict)) ? 'ok' : 'blocked', mas };
}

/**
 * ЧАНАРЫН ГИНЖ — MA → MIR → FIC → М-акт (2026-10-09, хэрэглэгч: «MA үүсэх бүрд араас нь
 * уялдаанууд харагдана, тэдгээр дээр шатлалын уялдаа»). MA бүрийн картан дээр 4 шат.
 *
 * ⚠️ ХАТУУ ДАРААЛАЛ: өмнөх шат батлагдаагүй бол дараагийнх `locked` — MA-гүй бол MIR-гүй,
 *    MIR-гүй бол FIC-гүй, FIC-гүй бол М-акт-гүй (хэрэглэгчийн шийдвэр, `memory/chanar-redesign`).
 * ⚠️ MIR · FIC · М-акт-ын өгөгдөл ХАРААХАН холбогдоогүй (`undefined`) — тэр үед өмнөх шат
 *    батлагдсан бол `next` («хүлээгдэж буй»), эс бөгөөс `locked`. Холбогдмогц `done`/`rejected`.
 * ⚠️ IPC олгох нөхцөл = 4 шат бүгд `done` (`ipcReady`).
 */
export type StageKey = 'MA' | 'MIR' | 'FIC' | 'MAKT';
export type StageState = 'done' | 'rejected' | 'pending' | 'next' | 'locked';
export type ChainInput = { MIR?: Verdict | null; FIC?: Verdict | null; MAKT?: Verdict | null };
export type Stage = { key: StageKey; state: StageState };

const stageState = (v: Verdict | null | undefined): StageState =>
  v === undefined ? 'next' : v == null ? 'pending' : isApproved(v) ? 'done' : 'rejected';

export function chainOf(ma: Verdict | null, next: ChainInput = {}): Stage[] {
  const out: Stage[] = [{ key: 'MA', state: ma == null ? 'pending' : isApproved(ma) ? 'done' : 'rejected' }];
  for (const key of ['MIR', 'FIC', 'MAKT'] as const) {
    const prev = out[out.length - 1].state;
    out.push({ key, state: prev === 'done' ? stageState(next[key]) : 'locked' });
  }
  return out;
}
export const ipcReady = (chain: readonly Stage[]): boolean => chain.every((s) => s.state === 'done');
export const stageLabel = (k: StageKey): string =>
  k === 'MA' ? tr('MA · Материал') : k === 'MIR' ? tr('MIR · Үзлэг') : k === 'FIC' ? tr('FIC · Явцын үзлэг') : tr('М-акт · Дууссан');
export const stageStateLabel = (s: StageState): string =>
  s === 'done' ? tr('Батлагдсан') : s === 'rejected' ? tr('Татгалзсан') : s === 'pending' ? tr('Шийдвэр хүлээж буй')
    : s === 'next' ? tr('Хүлээгдэж буй') : tr('Хаалттай');

/**
 * Нэг хариу бичгийн дугаар (`resp_no`) олон удаа илгээгдсэн бол (засвар · давхар илгээлт)
 * ХАМГИЙН СҮҮЛИЙНХ (их objectid) л хүчинтэй. Дугааргүй мөр тус бүр өөрөө.
 */
export function latestPerRespNo(rows: readonly MaRow[]): MaRow[] {
  const best = new Map<string, MaRow>();
  const loose: MaRow[] = [];
  for (const r of rows) {
    if (!r.respNo) { loose.push(r); continue; }
    const cur = best.get(r.respNo);
    if (!cur || r.oid > cur.oid) best.set(r.respNo, r);
  }
  return [...best.values(), ...loose].sort((a, b) => b.oid - a.oid);
}

/* ═══════════════ ХАВСРАЛТ (Enterprise токентой) ═══════════════ */

export const ATT_TYPES = ['response', 'submittal', 'conf', 'lab', 'qual', 'spec', 'maker', 'photo', 'transl', 'other'] as const;
export type AttType = (typeof ATT_TYPES)[number];
export const attTypeLabel = (t: string): string => ({
  response: tr('Хариу бичгийн эх скан'), submittal: tr('Гүйцэтгэгчийн MA хүсэлт'), conf: tr('Тохирлын гэрчилгээ'),
  lab: tr('Лабораторийн дүн'), qual: tr('Чанарын гэрчилгээ'), spec: tr('Техникийн үзүүлэлт / каталог'),
  maker: tr('Үйлдвэрлэгчийн бүртгэл, зөвшөөрөл'), photo: tr('Зураг'), transl: tr('Орчуулга'), other: tr('Бусад'),
} as Record<string, string>)[t] ?? t;

/** Гэрчилгээний мета — `keywords` талбарт `k=v;…` хэлбэрээр (≤255 тэмдэгт; `;` `=` утгаас хасна) */
export type AttMeta = { type: AttType | string; no?: string; std?: string; valid?: string; title?: string };
const clean = (s: string | undefined, max: number) => (s ?? '').replace(/[;=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function formatKeywords(m: AttMeta): string {
  const parts = [`t=${clean(m.type, 16) || 'other'}`];
  if (m.no) parts.push(`no=${clean(m.no, 60)}`);
  if (m.std) parts.push(`std=${clean(m.std, 60)}`);
  if (m.valid && /^\d{4}-\d{2}-\d{2}$/.test(m.valid)) parts.push(`valid=${m.valid}`);
  if (m.title) parts.push(`ti=${clean(m.title, 80)}`);
  return parts.join(';').slice(0, 255);
}
export function parseKeywords(k: string | null | undefined): AttMeta {
  const m: AttMeta = { type: 'other' };
  for (const p of (k ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    const key = p.slice(0, i).trim(); const v = p.slice(i + 1).trim();
    if (key === 't' && v) m.type = v;
    else if (key === 'no') m.no = v;
    else if (key === 'std') m.std = v;
    else if (key === 'valid' && /^\d{4}-\d{2}-\d{2}$/.test(v)) m.valid = v;
    else if (key === 'ti') m.title = v;
  }
  /* Survey123-ын өөрийн хавсралт (keywords = асуултын нэр) → төрөл нь тэр нэр */
  if (m.type === 'other' && k && !k.includes('=')) m.type = k.trim();
  return m;
}
/** Хүчинтэй хугацаа дууссан эсэх (өнөөдрөөс өмнө) */
export const isExpired = (valid: string | undefined, now = Date.now()): boolean =>
  !!valid && new Date(`${valid}T23:59:59`).getTime() < now;

export type MaAtt = { id: number; name: string; size: number | null; contentType: string; meta: AttMeta };

type ArcErr = { error?: { code?: number; message?: string; details?: string[] } };
const TIMEOUT = 120_000;

function tok(): string {
  const s = entSession();
  if (!s) throw new Error(tr('Enterprise-д нэвтрээгүй эсвэл сешн дууссан — дахин нэвтэрнэ үү.'));
  return s.token;
}
async function arc<T>(url: string, body: FormData | URLSearchParams): Promise<T> {
  let r: Response;
  try { r = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT) }); } catch (e) {
    if ((e as Error)?.name === 'TimeoutError') throw new Error(tr('Enterprise хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.'));
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  let j: T & ArcErr;
  try { j = await r.json(); } catch { throw new Error(tr('Enterprise JSON биш хариу буцаав.')); }
  if (j?.error) throw new Error(`${j.error.message || tr('Enterprise алдаа')}${j.error.details?.length ? ` — ${j.error.details.join(' · ')}` : ''}`);
  return j;
}

/** Давхарга хавсралт зөвшөөрдөг эсэх (`hasAttachments`) — үгүй бол админ геопорталаас асаана */
export async function maHasAttachments(): Promise<boolean> {
  const j = await arc<{ hasAttachments?: boolean }>(MA_URL, new URLSearchParams({ f: 'json' }));
  return !!j.hasAttachments;
}

/** Нэргүй уншилт зөвшөөрөгдсөн тул токен шаардахгүй; байвал залгана */
export async function listMaAtts(oid: number): Promise<MaAtt[]> {
  const body = new URLSearchParams({ f: 'json' });
  const s = entSession(); if (s) body.set('token', s.token);
  const j = await arc<{ attachmentInfos?: { id: number; name: string; size?: number; contentType?: string; keywords?: string }[] }>(
    `${MA_URL}/${oid}/attachments`, body);
  return (j.attachmentInfos ?? []).map((x) => ({
    id: x.id, name: x.name, size: typeof x.size === 'number' ? x.size : null, contentType: x.contentType ?? '', meta: parseKeywords(x.keywords),
  }));
}

export async function addMaAtt(oid: number, file: File, meta: AttMeta): Promise<void> {
  const okType = /^(application\/pdf|image\/(jpeg|png))$/.test(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (!okType) throw new Error(tr('Зөвхөн PDF, JPG, PNG файл хавсаргана.'));
  const fd = new FormData();
  fd.append('f', 'json');
  fd.append('token', tok());
  fd.append('keywords', formatKeywords(meta));
  fd.append('attachment', file, file.name);
  const j = await arc<{ addAttachmentResult?: { success?: boolean; error?: { description?: string } } }>(`${MA_URL}/${oid}/addAttachment`, fd);
  if (!j.addAttachmentResult?.success) throw new Error(j.addAttachmentResult?.error?.description || tr('Хавсралт нэмэгдсэнгүй.'));
}

export async function deleteMaAtt(oid: number, attId: number): Promise<void> {
  const j = await arc<{ deleteAttachmentResults?: { success?: boolean; error?: { description?: string } }[] }>(
    `${MA_URL}/${oid}/deleteAttachments`, new URLSearchParams({ f: 'json', token: tok(), attachmentIds: String(attId) }));
  const r = j.deleteAttachmentResults?.[0];
  if (!r?.success) throw new Error(r?.error?.description || tr('Хавсралт устгагдсангүй.'));
}

/** Хавсралтын файл — токентой POST, Blob (objectURL-ээр нээнэ; токен URL-д орохгүй) */
export async function maAttBlob(oid: number, attId: number): Promise<Blob> {
  const body = new URLSearchParams();
  const s = entSession(); if (s) body.set('token', s.token);
  let r: Response;
  try { r = await fetch(`${MA_URL}/${oid}/attachments/${attId}`, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT) }); } catch {
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  if ((r.headers.get('content-type') ?? '').includes('json')) {
    let j: ArcErr = {}; try { j = await r.json(); } catch { /* доор */ }
    throw new Error(j.error?.message || tr('Хавсралт татагдсангүй.'));
  }
  return r.blob();
}

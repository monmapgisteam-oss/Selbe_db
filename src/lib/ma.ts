import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { CHANAR_MA_SVC } from '@/lib/services/env';
import { addDoc, deleteDoc, docKey, listDocs, type AttMeta, type ChanarDoc } from '@/lib/chanarDocs';
import { currentUser, requireCap } from '@/lib/who';
import { AUTH } from '@/lib/services';
import { hasCap } from '@/lib/caps';
import { capLabel } from '@/modules/capText';

/**
 * MA — МАТЕРИАЛ БАТАЛГААЖУУЛАЛТ (2026-10-09). Survey123 маягт → Enterprise hosted
 * feature service (`services/env.ts` CHANAR_MA_SVC — Enterprise, давхарга `/0`). Портал УНШИНА, бөглөхгүй.
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
  /* 2026-10-29: `works` (4000 тэмдэгт ≈ 300 ажил) → `works_all` (25000); хуучин `works` талбарыг 2026-10-30 устгасан */
  works: 'works_all', docItems: 'doc_items', verdict: 'verdict', anNote: 'an_note', rReason: 'r_reason',
  apprName: 'appr_name', apprPos: 'appr_pos', revName: 'rev_name', revPos: 'rev_pos', ackName: 'ack_name', ackPos: 'ack_pos',
  prepName: 'prep_name', prepPos: 'prep_pos', recvByName: 'recv_by_name', recvByPos: 'recv_by_pos', created: 'created_date', edited: 'last_edited_date',
} as const;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Survey123 select_multiple → утгын жагсаалт. Survey123 ТАСЛАЛААР хадгалдаг (ODK нь зайгаар) — хоёуланг таслана; давхардал · хоосон хасна */
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
  if (!MA_URL) throw new Error(tr('MA үйлчилгээ тохируулаагүй.'));
  /* `queryFeatures` → хавтгай атрибут (`Row`), хуудаслалт · 200-аар ирсэн `{error}` дотроо */
  const rows = await queryFeatures(MA_URL, { where: '1=1', outFields: ['*'], orderBy: `${F.oid} DESC` });
  return rows.map((r) => rowOf(r as Record<string, unknown>));
}

export const verdictLabel = (v: Verdict | null): string =>
  v === 'A' ? tr('A — Зөвшөөрсөн') : v === 'AN' ? tr('AN — Саналтай зөвшөөрсөн') : v === 'R' ? tr('R — Буцаасан') : tr('Шийдвэргүй');

/** Батлагдсан (ажил эхлэх хаалгыг нээдэг) шийдвэр — A эсвэл AN */
export const isApproved = (v: Verdict | null): boolean => v === 'A' || v === 'AN';

/**
 * АЖИЛ БҮРИЙН MA ХААЛГА. Тухайн ажлыг (`багц:des`) сонгосон MA-ууд дундаас:
 *   · нэг ч MA байхгүй → 'none' (материал баталгаажуулалт шаардагдаагүй гэж ҮЗЭХГҮЙ — тодорхойгүй);
 *   · бүгд A/AN → 'ok'; аль нэг нь R эсвэл шийдвэргүй → 'blocked'.
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
  s === 'done' ? tr('Батлагдсан') : s === 'rejected' ? tr('Буцаасан') : s === 'pending' ? tr('Хянагч шийднэ')
    : s === 'next' ? tr('Гүйцэтгэгч оруулна') : tr('Хаалттай');

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

/**
 * ДАХИН ИРҮҮЛСЭН MA-ГИЙН ХОЛБОО (2026-10-23, UX аудит Q10). Буцаасан (R) MA-г гүйцэтгэгч засаад ШИНЭ хариу
 * бичгийн дугаартай илгээвэл `latestPerRespNo` хоёуланг нь тусдаа карт болгодог тул «хоёр өөр материал» мэт
 * харагддаг байв. Нэг багц + нэг материалын нэр (том/жижиг үсэг · зай ялгахгүй) доторх R мөрийн ДАРААГИЙН
 * (их objectid) мөрийг түүний дахин ирүүлэлт гэж холбоно.
 */
export type ResubLink = { prev?: MaRow; next?: MaRow };
export function resubmitLinks(rows: readonly MaRow[]): Map<number, ResubLink> {
  const groups = new Map<string, MaRow[]>();
  for (const r of rows) {
    const mat = r.material.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!mat || !r.pkg) continue;
    const k = `${r.pkg}|${mat}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  const out = new Map<number, ResubLink>();
  for (const g of groups.values()) {
    g.sort((a, b) => a.oid - b.oid);
    for (let i = 0; i + 1 < g.length; i++) {
      if (g[i].verdict !== 'R') continue;
      out.set(g[i].oid, { ...out.get(g[i].oid), next: g[i + 1] });
      out.set(g[i + 1].oid, { ...out.get(g[i + 1].oid), prev: g[i] });
    }
  }
  return out;
}

/* ═══════════════ БАРИМТ — геопорталын тусдаа item (`chanarDocs`, 2026-10-29) ═══════════════ */

export { ATT_TYPES, attTypeLabel, formatKeywords, parseKeywords, isExpired, type AttType, type AttMeta } from '@/lib/chanarDocs';
export type MaAtt = ChanarDoc;

/** Оруулагчийн геопорталын хавтас — Survey123 Connect-ийн MA маягтын хавтастай ижил нэр */
export const MA_DOC_FOLDER = 'Survey-MA';
/** Холбоосын таг — хариу бичгийн дугаараар; дугааргүй MA-д objectid-оор */
export const maDocKey = (ma: Pick<MaRow, 'respNo' | 'oid'>): string => docKey('ma', ma.respNo || `oid-${ma.oid}`);

/** Нэвтэрсэн хэрэглэгчид харагдах, энэ MA-д холбогдсон item-ууд (Enterprise сешн шаардана) */
export const listMaAtts = (ma: Pick<MaRow, 'respNo' | 'oid'>): Promise<MaAtt[]> => listDocs(maDocKey(ma));

export function requireAttachCap(): void {
  try { requireCap('chanarAuthor'); } catch {
    try { requireCap('chanarReview'); } catch {
      throw new Error(tr('Энэ үйлдэлд эрхгүй — админаас «{0}» эсвэл «{1}» эрх авна уу.', capLabel('chanarAuthor'), capLabel('chanarReview')));
    }
  }
}

export async function maAttachScopeDeny(
  pkgKey: string,
  strict: boolean = typeof window !== 'undefined' && !!AUTH.appId,
): Promise<string | null> {
  if (!strict) return null;
  const me = currentUser();
  if (!me) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  const [{ PKGS }, { isAuthorFor, reviewerRolesFor }] = await Promise.all([
    import('@/modules/sheet/bagts.pkg'), import('@/lib/chanarAcl'),
  ]);
  const bagts = PKGS.find((p) => p.key === pkgKey)?.group ?? '';
  if (!bagts) return tr('MA-гийн багц ({0}) танигдсангүй — багцын хүрээг шалгах боломжгүй.', pkgKey || '—');
  const asAuthor = hasCap(me, 'chanarAuthor') && isAuthorFor(me, bagts);
  const asReviewer = hasCap(me, 'chanarReview') && reviewerRolesFor(me, bagts).length > 0;
  return asAuthor || asReviewer ? null : tr('«{0}» багцад чанарын баримтын эрхгүй — MA-гийн хавсралт нэмэх, устгах боломжгүй.', bagts);
}

/** Хавсралтын бичилтийн өмнө: MA мөрийг серверээс олж багцын хүрээг шалгана (`maAttachScopeDeny`) */
async function requireAttachScope(oid: number): Promise<void> {
  if (!(typeof window !== 'undefined' && !!AUTH.appId)) return;
  const ma = (await loadMa()).find((r) => r.oid === Number(oid));
  if (!ma) throw new Error(tr('MA олдсонгүй — устгагдсан байж магадгүй.'));
  const deny = await maAttachScopeDeny(ma.pkg);
  if (deny) throw new Error(deny);
}

/** Баримт нэмнэ — item оруулж байгууллагад хуваалцана; `warn` = хуваалцаж чадаагүй анхааруулга */
export async function addMaAtt(ma: Pick<MaRow, 'respNo' | 'oid'>, file: File, meta: AttMeta): Promise<{ doc: MaAtt; warn?: string }> {
  const oid = ma.oid;
  requireAttachCap();
  await requireAttachScope(oid);
  return addDoc({ key: maDocKey(ma), folder: MA_DOC_FOLDER }, file, meta);
}

export async function deleteMaAtt(ma: Pick<MaRow, 'respNo' | 'oid'>, att: MaAtt): Promise<void> {
  const oid = ma.oid;
  requireAttachCap();
  await requireAttachScope(oid);
  await deleteDoc(att);
}

export { docBlob as maAttBlob } from '@/lib/chanarDocs';

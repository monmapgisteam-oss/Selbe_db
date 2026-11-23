/**
 * ХЯНАЛТЫН ТҮҮХ БА ЗӨВШӨӨРСӨН НҮД — ТУСДАА ХҮСНЭГТЭД, НЭГ НҮДЭНД НЭГ УТГА (2026-11-23, хэрэглэгч: «нэг нүдэнд олон утга
 * бичиж болохгүй — өгөгдлийг дараа нь ашиглана»; `zovshoorson_nud` баганын 100 000 тэмдэгтийн хязгаарт 67% хүрсэн байв).
 *
 * Урьд нь хяналтын мөрийн (`Guitsetgel_talbe/183`) хоёр нүдэнд JSON байв: шийдвэрийн түүх (`shiidveriin_tuuh`) ба зөвшөөрсөн
 * нүдний жагсаалт (`zovshoorson_nud`). Одоо:
 *   · `Guitsetgel_talbe/236` «hyanalt_shiidver» — шийдвэр бүр НЭГ МӨР;
 *   · `Guitsetgel_talbe/237` «hyanalt_zovshoorson_nud» — зөвшөөрсөн нүд бүр НЭГ МӨР.
 *
 * ЗЭРЭГ БИЧИЛТИЙН ХАМГААЛАЛТ ХЭВЭЭР. Хяналтын мөрт хоёр ЗААГЧ багана бий (тус бүр нэг утга):
 *   · `tuuh_tulhuur` — түүхийн СҮҮЛИЙН мөрийн түлхүүр. Түүхийн мөр бүр өмнөх мөрийнхөө түлхүүрийг (`umnuh_tulhuur`) хадгална —
 *     заагчаас ухарч уншихад яг хүлээн авагдсан гинж гарна;
 *   · `nud_tulhuur` — одоо хүчинтэй зөвшөөрсөн нүдний БАГЦЫН түлхүүр.
 * Бичих дараалал: 1) шинэ мөрүүдийг ШИНЭ түлхүүрээр нэмнэ (заагч заагаагүй тул хэнд ч харагдахгүй), 2) хяналтын мөрийн төлөв ·
 * шийдвэр · заагчийг НЭГ нөхцөлт бичилтээр (`updateDecision`) солино. 2-р алхам унавал (өөр хүн түрүүлсэн) нэмсэн мөрүүд
 * заагчгүй үлдэж харагдахгүй, цэвэрлэгдэнэ. Иймээс шийдвэр, түүх, нүд гурав урьдын адил НЭГ агшинд хүчин төгөлдөр болно.
 *
 * Уншихад (`hydrateSplit`) мөрүүдээс урьдын JSON бичвэрийг САНАХ ОЙД сэргээнэ — дээд давхаргын бүх логик (эрхийн шалгалт,
 * зөрчил илрүүлэлт, дэлгэц) өөрчлөгдөөгүй. Заагчгүй (хуучин) мөр хуучин нүднээсээ уншигдана; дараагийн бичилтээр шилжинэ.
 */
import { arcgisPost } from '@/lib/query';
import { GUITS } from '@/lib/services';
import { encodeOkCells, parseOkRef } from './hyanaltOkCells';

type A = Record<string, unknown>;

export const SPLIT = {
  histUrl: `${GUITS}/236`,
  cellUrl: `${GUITS}/237`,
  /** Хяналтын мөрийн заагч баганууд */
  histToken: 'tuuh_tulhuur',
  okToken: 'nud_tulhuur',
} as const;

/** `hyanalt_shiidver` (236)-ийн баганууд */
export const HC = {
  parent: 'hyanalt_oid', idx: 'daraalal', stage: 'shat', act: 'uildel', who: 'hen', user: 'hereglegch', at: 'ognoo',
  reason: 'shaltgaan', token: 'tulhuur', prev: 'umnuh_tulhuur',
} as const;
/** `hyanalt_zovshoorson_nud` (237)-ийн баганууд */
export const CC = { parent: 'hyanalt_oid', row: 'mur_oid', sid: 'mur_sid', block: 'blok', token: 'nud_tulhuur' } as const;

export type RawEntry = { stage?: unknown; who?: unknown; at?: unknown; act?: unknown; reason?: unknown; u?: unknown };

const txt = (v: unknown): string => (v == null ? '' : String(v));

/**
 * ХУУЧИН КОДТОЙ ЦОНХНЫ БИЧИЛТ. Шинэчлэл гарсны дараа ч дахин ачаалаагүй цонх хуучин кодоор шийдвэр гаргаж, түүх / нүдийг ХУУЧИН
 * нүдэнд бичиж болно — заагчтай мөрт хуучин нүд утгатай байвал тэр. Ийм мөрийг уншихдаа заагчийн ард `DIRTY` тэмдэг залгана
 * (санах ойд л): түүхэнд гинж + хуучин нүдний үйл явдлыг нийлүүлж, зөвшөөрсөн нүдэнд хуучин нүдийг (сүүлд бичигдсэн) авна.
 * Дараагийн бичилт бүтэн түүхийг шинэ гинж болгож, хуучин нүдийг цэвэрлэнэ (`hyanalt.updateDecision`).
 */
const DIRTY = '|*';
export const splitToken = (v: unknown): { token: string; dirty: boolean } => {
  const s = txt(v);
  return s.endsWith(DIRTY) ? { token: s.slice(0, -DIRTY.length), dirty: true } : { token: s, dirty: false };
};
let seq = 0;
/** Давтагдашгүй түлхүүр (≤ 64 тэмдэгт) */
export const newToken = (): string => {
  const rnd = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}-${rnd}`.slice(0, 64);
};

/** Түүхийн JSON бичвэр → түүхий жагсаалт (эвдэрхий бол хоосон) */
export function rawList(raw: unknown): RawEntry[] {
  const s = txt(raw).trim();
  if (!s) return [];
  try {
    const a: unknown = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x): x is RawEntry => !!x && typeof x === 'object') : [];
  } catch { return []; }
}

const sameEntry = (a: RawEntry, b: RawEntry): boolean =>
  txt(a.stage) === txt(b.stage) && txt(a.act) === txt(b.act) && Number(a.at) === Number(b.at)
  && txt(a.who) === txt(b.who) && txt(a.reason) === txt(b.reason) && txt(a.u) === txt(b.u);

/**
 * ТҮҮХИЙН БИЧИЛТИЙН ТӨЛӨВЛӨГӨӨ (цэвэр). Шинэ жагсаалт нь хуучны ард нэмсэн хэлбэртэй, хуучин нь аль хэдийн мөр болсон
 * (`oldToken`) бол ЗӨВХӨН нэмэгдсэн үйл явдлыг гинжинд залгана. Бусад тохиолдолд (хуучин JSON нүднээс анх шилжих · жагсаалт
 * тайрагдсан · шинээр эхэлсэн) бүтэн жагсаалтыг шинэ гинж болгон бичнэ.
 */
export function histPlan(
  oldRaw: unknown, newRaw: unknown, oldToken: string | null, parentOid: number | null, mk: () => string = newToken,
): { rows: A[]; token: string | null } {
  const next = rawList(newRaw);
  const old = oldToken ? rawList(oldRaw) : [];
  /*
   * Нэмэлт үү: хуучин жагсаалтын СҮҮЛИЙН хэсэг (эхнээс `cut` үйл явдал тайрагдсан байж болно — `appendHistory`-ийн 60-ын
   * хязгаар) шинэ жагсаалтын эхэнд яг байвал зөвхөн ард нь нэмэгдсэнийг гинжинд залгана. Гинж өөрөө тайрагдахгүй — мөр
   * болсон түүх бүтнээрээ үлдэнэ. Юу ч давхцахгүй бол (шинээр эхэлсэн) бүтэн жагсаалт шинэ гинж.
   */
  let keep = -1;
  if (oldToken) {
    for (let cut = 0; cut <= old.length; cut += 1) {
      const tail = old.length - cut;
      if (tail === 0 && old.length > 0) break;
      if (next.length >= tail && old.slice(cut).every((e, i) => sameEntry(e, next[i]))) { keep = tail; break; }
    }
  }
  const append = keep >= 0;
  if (append && next.length === keep) return { rows: [], token: oldToken };
  let prev: string | null = append ? oldToken : null;
  const rows: A[] = [];
  const base = append ? old.length - keep : 0; // гинжид байгаа ч жагсаалтаас тайрагдсан үйл явдлын тоо — дарааллын дугаарт
  for (let i = append ? keep : 0; i < next.length; i += 1) {
    const e = next[i];
    const token = mk();
    const at = Number(e.at);
    rows.push({
      [HC.parent]: parentOid, [HC.idx]: base + i + 1, [HC.stage]: txt(e.stage) || null, [HC.act]: txt(e.act) || null,
      [HC.who]: txt(e.who) || null, [HC.user]: txt(e.u) || null, [HC.at]: Number.isFinite(at) ? at : null,
      [HC.reason]: txt(e.reason) || null, [HC.token]: token, [HC.prev]: prev,
    });
    prev = token;
  }
  return { rows, token: next.length ? prev : null };
}

/** Заагчаас ухарч гинжийг уншина → хуучнаас шинэ рүү жагсаалт (цэвэр). Тасарсан / эргэлдсэн гинж тэр хүртлээ. */
export function chainList(token: string | null, byToken: ReadonlyMap<string, A>): RawEntry[] {
  const out: RawEntry[] = [];
  const seen = new Set<string>();
  let cur = token;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const r = byToken.get(cur);
    if (!r) break;
    const e: RawEntry = { stage: txt(r[HC.stage]), who: txt(r[HC.who]), at: Number(r[HC.at]), act: txt(r[HC.act]) };
    if (txt(r[HC.reason])) e.reason = txt(r[HC.reason]);
    if (txt(r[HC.user])) e.u = txt(r[HC.user]);
    out.push(e);
    cur = txt(r[HC.prev]) || null;
  }
  return out.reverse();
}

/** Гинж → урьдын JSON бичвэр (үйл явдалгүй бол хоосон) */
export const histJson = (token: string | null, byToken: ReadonlyMap<string, A>): string => {
  const list = chainList(token, byToken);
  return list.length ? JSON.stringify(list) : '';
};

/**
 * ЗӨВШӨӨРСӨН НҮДНИЙ БИЧИЛТИЙН ТӨЛӨВЛӨГӨӨ (цэвэр): кодлогдсон жагсаалт → нүд бүр нэг мөр, бүгд нэг шинэ багцын түлхүүртэй.
 * `null` — шинэ (v2) хэлбэр биш тул задлахгүй (дуудагч хуучнаар нь үлдээнэ). Хоосон жагсаалт — мөргүй, заагч `null`.
 */
export function cellPlan(encoded: unknown, parentOid: number | null, mk: () => string = newToken): { rows: A[]; token: string | null } | null {
  const s = txt(encoded).trim();
  if (!s) return { rows: [], token: null };
  let c: unknown;
  try {
    const j = JSON.parse(s) as { v?: unknown; c?: unknown };
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.v !== 2 || !Array.isArray(j.c)) return null;
    c = j.c;
  } catch { return null; }
  const refs = [...new Set((c as unknown[]).map((x) => txt(x)))].map(parseOkRef).filter((x): x is NonNullable<typeof x> => !!x);
  if (!refs.length) return { rows: [], token: null };
  const token = mk();
  return {
    token,
    rows: refs.map((r) => ({ [CC.parent]: parentOid, [CC.row]: r.oid, [CC.sid]: r.sid, [CC.block]: r.block, [CC.token]: token })),
  };
}

/** Нүдний мөрүүд → урьдын кодлогдсон бичвэр (цэвэр; мөрийн дарааллаар) */
export const cellsJson = (rows: readonly A[]): string =>
  (rows.length ? encodeOkCells(rows.map((r) => `${Number(r[CC.row])}|${txt(r[CC.sid])}|${txt(r[CC.block])}`)) : '');

/* ───────────────────────────── сүлжээ ───────────────────────────── */

async function pageAll(url: string, where: string): Promise<A[]> {
  const out: A[] = [];
  let offset = 0;
  for (;;) {
    const j = await arcgisPost<{ features?: { attributes: A }[]; exceededTransferLimit?: boolean }>(`${url}/query`, {
      where, outFields: '*', returnGeometry: 'false', orderByFields: 'objectid ASC',
      resultOffset: String(offset), resultRecordCount: '2000',
    });
    const got = j.features ?? [];
    out.push(...got.map((f) => f.attributes));
    if (!j.exceededTransferLimit || got.length === 0) break;
    offset += got.length;
  }
  return out;
}

const quote = (v: string): string => `'${v.replace(/'/g, "''")}'`;

/**
 * УНШИЛТ: заагчтай хяналтын мөрүүдэд түүх ба зөвшөөрсөн нүдийг тусдаа хүснэгтээс уншиж, урьдын JSON бичвэрийг мөрийн
 * `histField` / `cellField`-д сэргээнэ (санах ойд л). Зөвшөөрсөн нүдийг `needCells` үнэн мөрт л татна (дууссан илгээлтэд хэрэггүй).
 * Уншилт унавал АЛДАА шиднэ — түүхгүй мөрөөр эрх шалгахаас сэргийлнэ.
 */
export async function hydrateSplit(rows: A[], histField: string, cellField: string, needCells: (a: A) => boolean): Promise<void> {
  const withHist = rows.filter((a) => txt(a[SPLIT.histToken]));
  if (withHist.length) {
    const byToken = new Map<string, A>();
    for (const r of await pageAll(SPLIT.histUrl, '1=1')) if (txt(r[HC.token])) byToken.set(txt(r[HC.token]), r);
    for (const a of withHist) {
      if (!txt(a[histField]).trim()) { a[histField] = histJson(txt(a[SPLIT.histToken]), byToken); continue; }
      /* Хуучин нүд утгатай (задлагдахгүй `[]` · эвдэрхий ч гэсэн) — тэмдэглэнэ: эс бөгөөс «хоосон байх ёстой» хамгаалалт хэзээ ч таарахгүй */
      const late = rawList(a[histField]);
      const list = [...chainList(txt(a[SPLIT.histToken]), byToken), ...late].sort((x, y) => Number(x.at) - Number(y.at));
      a[histField] = JSON.stringify(list);
      a[SPLIT.histToken] = `${txt(a[SPLIT.histToken])}${DIRTY}`;
    }
  }
  const withCells = rows.filter((a) => {
    if (!txt(a[SPLIT.okToken])) return false;
    if (!txt(a[cellField]).trim()) return true;
    a[SPLIT.okToken] = `${txt(a[SPLIT.okToken])}${DIRTY}`; // хуучин нүд сүүлд бичигдсэн — тэр хүчинтэй
    return false;
  });
  const want = withCells.filter(needCells);
  const byTok = new Map<string, A[]>();
  for (let i = 0; i < want.length; i += 40) {
    const toks = want.slice(i, i + 40).map((a) => quote(txt(a[SPLIT.okToken])));
    for (const r of await pageAll(SPLIT.cellUrl, `${CC.token} IN (${toks.join(',')})`)) {
      const k = txt(r[CC.token]);
      const list = byTok.get(k);
      if (list) list.push(r); else byTok.set(k, [r]);
    }
  }
  const wanted = new Set(want);
  for (const a of withCells) a[cellField] = wanted.has(a) ? cellsJson(byTok.get(txt(a[SPLIT.okToken])) ?? []) : '';
}

/** Мөрүүдийг нэмнэ (500-гаар). Нэг ч мөр унавал АЛДАА — дуудагч нэмэгдсэнийг цэвэрлэнэ. Буцаах: нэмэгдсэн OBJECTID-ууд. */
export async function addChildren(url: string, rows: readonly A[], done: number[] = []): Promise<number[]> {
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const j = await arcgisPost<{ addResults?: { success?: boolean; objectId?: number; error?: { description?: string } }[] }>(
      `${url}/applyEdits`, { adds: JSON.stringify(part.map((attributes) => ({ attributes }))), rollbackOnFailure: 'true' });
    const res = j.addResults ?? [];
    for (const r of res) if (r.success && typeof r.objectId === 'number') done.push(r.objectId);
    const bad = res.find((r) => !r.success);
    if (bad || res.length !== part.length) throw new Error(bad?.error?.description ?? 'серверээс үр дүн дутуу ирлээ');
  }
  return done;
}

/** Мөрүүдийг устгана — цэвэрлэгээ тул алдаа шидэхгүй (үлдсэн мөр заагчгүй тул харагдахгүй) */
export async function dropChildren(url: string, by: { oids?: readonly number[]; where?: string }): Promise<void> {
  try {
    if (by.oids?.length) {
      for (let i = 0; i < by.oids.length; i += 500) await arcgisPost(`${url}/deleteFeatures`, { objectIds: by.oids.slice(i, i + 500).join(',') });
    } else if (by.where) {
      await arcgisPost(`${url}/deleteFeatures`, { where: by.where });
    }
  } catch (e) {
    console.warn('[selbe] хяналтын туслах мөрийг цэвэрлэж чадсангүй (харагдахгүй үлдэнэ):', e);
  }
}

export const cellTokenWhere = (token: string): string => `${CC.token} = ${quote(token)}`;

/** Нэмэгдсэн туслах мөрүүдэд эцэг (хяналтын) мөрийн дугаарыг тавина — лавлагааны багана тул алдаа шидэхгүй */
export async function setParent(url: string, oids: readonly number[], parentOid: number): Promise<void> {
  try {
    for (let i = 0; i < oids.length; i += 500) {
      await arcgisPost(`${url}/applyEdits`, {
        updates: JSON.stringify(oids.slice(i, i + 500).map((objectid) => ({ attributes: { objectid, [HC.parent]: parentOid } }))),
      });
    }
  } catch (e) {
    console.warn('[selbe] хяналтын туслах мөрт эцэг мөрийн дугаар бичигдсэнгүй (заагчаар уншигдана):', e);
  }
}

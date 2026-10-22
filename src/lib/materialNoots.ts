import { t as tr } from '@/lib/i18nCore';
import { ENT_HOSTED } from '@/lib/services/env';
import { arcgisPost } from '@/lib/authToken';
import { queryFeatures } from '@/lib/query';
import { invalidate, register } from '@/lib/dataBus';
import { requireCap } from '@/lib/who';
import { capLabel } from '@/modules/capText';
import { isApproved, latestPerRespNo, type MaRow } from '@/lib/ma';
import type { MirRow } from '@/lib/mir';

/**
 * МАТЕРИАЛЫН НӨӨЦ (2026-10-21, хэрэглэгчийн шийдвэр) — Enterprise hosted хүснэгт `material_noots`.
 *
 *   · MA БАТЛАГДСАН (A/AN) + MIR БАТЛАГДСАН (A/AN) материал л нөөцөд орно — MIR бүр = нэг мөр (ачаа бүр доош нэмэгдэнэ).
 *   · Нэг материал олон MA/MIR-ээр орсон ч нөөцийг НЭРЭЭР нэгтгэж бодно (`nootsSummary`). Нэр нь MA-гийн сонголтоос
 *     (`material` домэйн) гардаг тул тогтвортой — гараар бичихгүй.
 *   · `tolov` — «Дууссан» / «Дуусаагүй»: НЭГ материалын бүх мөр нэг төлөвтэй; ашигласан нийлбэр ≥ ирсэн нийлбэр бол
 *     «Дууссан». Ашигласан хэмжээний тооцоо одоохондоо ХИЙГДЭХГҮЙ (хэрэглэгч хойшлуулсан) тул `ashiglasan_hemjee`
 *     хоосон → «Дуусаагүй».
 *   · Бүртгэл АВТОМАТ (`syncNoots`) — чанарын эрхтэй хүн MA хуудас нээхэд. Давхардлаас `mir_id`-аар (MIR-ийн
 *     `uniquerowid`) хамгаална; зэрэг бичигдсэн давхардлыг БАГА objectid үлдээж цэвэрлэнэ.
 *   · ⚠️ 2026-10-21 (аудит №2): `mir_id` талбар алга/тохирохгүй бол ШИДЭХГҮЙ — `SyncResult.disabled`-аар шалтгаанаа
 *     буцаана (MA хуудас · нөөцийн харагдац ажилласаар, зөвхөн автомат бүртгэл идэвхгүй). Шаардлага: String (урт ≥ 38)
 *     эсвэл GUID (`mirIdIssue`). Бичих эрх lib-д (`requireSyncCap`), хүчингүй болголт зөвхөн бичилт оролдсон үед.
 *   · MIR/MA хожим засагдвал (тоо хэмжээ · нэгж · R болсон) мөр нь дагаж шинэчлэгдэж/хасагдана. `mir_id`-гүй (гараар
 *     нэмсэн) мөрийг ХӨНДӨХГҮЙ.
 * ⚠️ Талбарын нэр Enterprise-д жижиг үсгээр — энэ хүснэгт entMap-ийн толинд байхгүй тул шууд жижиг үсгээр бичнэ.
 * ⚠️ ArcGIS алдаа HTTP 200-аар `{error}` — `arcgisPost` шиднэ; `applyEdits`-ийн мөр бүрийн `success`-ийг шалгана.
 */
export const NOOTS_SVC = `${ENT_HOSTED}/material_noots/FeatureServer`;

export const NF = {
  oid: 'objectid', name: 'material_ner', inQty: 'irsen_hemjee', usedQty: 'ashiglasan_hemjee',
  unit: 'negj', status: 'tolov', mirId: 'mir_id',
} as const;

/** Төлвийн утга — ӨГӨГДӨЛ тул орчуулагдахгүй */
export const TOLOV = { done: 'Дууссан', open: 'Дуусаагүй' } as const;

export type NootsRow = {
  oid: number;
  name: string;
  inQty: number | null;
  usedQty: number | null;
  unit: string;
  status: string;
  mirId: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** GUID-ийг харьцуулах хэлбэр — `{…}` хаалт ба том/жижиг үсгээс үл хамаарна */
export const guidKey = (v: unknown): string => str(v).replace(/[{}]/g, '').toLowerCase();

export function nootsRowOf(a: Record<string, unknown>): NootsRow {
  return {
    oid: Number(a[NF.oid] ?? a.OBJECTID),
    name: str(a[NF.name]),
    inQty: num(a[NF.inQty]),
    usedQty: num(a[NF.usedQty]),
    unit: str(a[NF.unit]),
    status: str(a[NF.status]),
    mirId: guidKey(a[NF.mirId]),
  };
}

/* ═══════════════ ЦЭВЭР ДҮРЭМ (тестлэгдэнэ — `materialNoots.check.mjs`) ═══════════════ */

/**
 * Нэг материалын төлөв — ашигласан нь мэдэгдэхгүй (null) бол «Дуусаагүй» (null ≠ 0).
 * ⚠️ 2026-10-21 (аудит №2): `partial` — аль нэг ачааны тоо хэмжээ мэдэгдэхгүй бол нийлбэр ДУТУУ тул «Дууссан» гэж дүгнэхгүй.
 */
export function tolovOf(inSum: number | null, usedSum: number | null, partial = false): string {
  return !partial && inSum != null && inSum > 0 && usedSum != null && usedSum >= inSum ? TOLOV.done : TOLOV.open;
}

/** Код `mir_id`-д `{UPPER-GUID}` бичнэ (`syncNoots`) — 38 тэмдэгт */
export const MIR_ID_LEN = 38;

/**
 * ⚠️ 2026-10-21 (аудит №2): `mir_id` ТАЛБАРЫН ШААРДЛАГА ИЛ — алга · богино · буруу төрөл бол шалтгааныг (хэрэглэгчид харуулах,
 *    админд шаардлагатай төрөл · уртыг нэрлэсэн) буцаана; тохирвол null. Урьд нь зөвхөн «талбар алга» гэж шиддэг байв.
 *    Нэр Enterprise-д жижиг үсгээр ч том үсгээр ирвэл мөн танина.
 */
export function mirIdIssue(fields: readonly { name?: string; type?: string; length?: number | null }[]): string | null {
  const f = fields.find((x) => String(x.name ?? '').toLowerCase() === NF.mirId);
  if (!f) return tr('Материалын нөөцийн хүснэгтэд «mir_id» талбар алга — админ String (урт ≥ {0}) эсвэл GUID төрлөөр нэмнэ үү.', MIR_ID_LEN);
  const type = String(f.type ?? '').replace(/^esriFieldType/, '');
  if (type === 'GUID') return null;
  if (type !== 'String') return tr('«mir_id» талбарын төрөл {0} — String (урт ≥ {1}) эсвэл GUID байх ёстой.', type, MIR_ID_LEN);
  const len = f.length ?? 0;
  return len >= MIR_ID_LEN ? null : tr('«mir_id» талбарын урт {0} — GUID багтахгүй; String (урт ≥ {1}) эсвэл GUID байх ёстой.', len, MIR_ID_LEN);
}

/** Нөөцөд орох ёстой нэг ачаа (MIR) */
export type Receipt = { mirId: string; name: string; qty: number | null; unit: string };

/**
 * НӨӨЦӨД ОРОХ АЧААНУУД — MIR батлагдсан (A/AN) БА түүний MA (хариу бичгийн сүүлийн хувилбар) батлагдсан.
 * Материалын нэр MA-гийнх (сонголтоос); MA-д нэр байхгүй бол MIR-ийнх.
 */
export function receiptsOf(mas: readonly MaRow[], mirs: readonly MirRow[]): Receipt[] {
  const maByNo = new Map(latestPerRespNo(mas).filter((m) => m.respNo).map((m) => [m.respNo, m] as const));
  const out: Receipt[] = [];
  const seen = new Set<string>();
  for (const m of mirs) {
    const id = guidKey(m.rowId);
    if (!id || seen.has(id) || !isApproved(m.verdict)) continue;
    const ma = maByNo.get(m.maNo);
    if (!ma || !isApproved(ma.verdict)) continue;
    const name = ma.material || m.material;
    if (!name) continue;
    seen.add(id);
    out.push({ mirId: id, name, qty: m.qty, unit: m.unit });
  }
  return out;
}

/**
 * Нэг материалын нэгтгэл (нэрээр). `inUnknown` · `usedUnknown` — тоо хэмжээгүй (null) ачааны ТОО: байвал нийлбэр
 * ДУТУУ (мэдэгдэх утгуудынх л), `rest` null, төлөв «Дуусаагүй».
 */
export type NootsSum = {
  name: string; units: string[]; inSum: number | null; usedSum: number | null; inUnknown: number; usedUnknown: number;
  rest: number | null; status: string; n: number;
};

export function nootsSummary(rows: readonly NootsRow[]): NootsSum[] {
  const m = new Map<string, NootsRow[]>();
  for (const r of rows) {
    if (!r.name) continue;
    const l = m.get(r.name);
    if (l) l.push(r); else m.set(r.name, [r]);
  }
  /* ⚠️ 2026-10-21 (аудит №2): null-ыг 0 гэж НЭМДЭГГҮЙ — мэдэгдэх утгуудын нийлбэр + мэдэгдэхгүй ачааны тоо тусдаа.
     Урьд нь [10, null] → 10 гэж чимээгүй гардаг тул «Ирсэн» дутуу, «Үлдэгдэл» · «Дууссан» буруу гарч, `statusFixes`
     тэр буруу төлвийг бүх мөрөнд бичих байв. */
  const sum = (xs: (number | null)[]): { sum: number | null; unknown: number } => {
    const known = xs.filter((x): x is number => x != null);
    return { sum: known.length ? known.reduce((s, x) => s + x, 0) : null, unknown: xs.length - known.length };
  };
  return [...m.entries()].map(([name, l]) => {
    const i = sum(l.map((r) => r.inQty));
    const u = sum(l.map((r) => r.usedQty));
    const partial = i.unknown > 0 || u.unknown > 0;
    return {
      name,
      units: [...new Set(l.map((r) => r.unit).filter(Boolean))],
      inSum: i.sum, usedSum: u.sum, inUnknown: i.unknown, usedUnknown: u.unknown,
      /* Үлдэгдэл — хоёр нийлбэр БҮРЭН мэдэгдэж байж л */
      rest: !partial && i.sum != null && u.sum != null ? i.sum - u.sum : null,
      status: tolovOf(i.sum, u.sum, partial),
      n: l.length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'mn'));
}

export type NootsPlan = {
  adds: Receipt[];
  updates: { oid: number; name: string; qty: number | null; unit: string }[];
  /** MIR/MA нь батлагдахаа больсон эсвэл ДАВХАРДСАН (`mir_id` ижил, их objectid) мөрүүд */
  deletes: number[];
};

/**
 * СИНКИЙН ТӨЛӨВЛӨГӨӨ — хүснэгтийн одоогийн мөрүүд ба нөөцөд орох ёстой ачаанаас: нэмэх · шинэчлэх · хасах.
 * ⚠️ `mir_id`-гүй мөр (гараар) — хөндөхгүй. Нэг `mir_id` олон мөртэй бол БАГА objectid үлдэнэ.
 */
export function planSync(rows: readonly NootsRow[], receipts: readonly Receipt[]): NootsPlan {
  const want = new Map(receipts.map((r) => [r.mirId, r] as const));
  const keep = new Map<string, NootsRow>();
  const deletes: number[] = [];
  for (const r of [...rows].sort((a, b) => a.oid - b.oid)) {
    if (!r.mirId) continue;
    if (!want.has(r.mirId) || keep.has(r.mirId)) { deletes.push(r.oid); continue; }
    keep.set(r.mirId, r);
  }
  const adds: Receipt[] = [];
  const updates: NootsPlan['updates'] = [];
  for (const w of receipts) {
    const r = keep.get(w.mirId);
    if (!r) { adds.push(w); continue; }
    if (r.name !== w.name || r.inQty !== w.qty || r.unit !== w.unit) updates.push({ oid: r.oid, name: w.name, qty: w.qty, unit: w.unit });
  }
  return { adds, updates, deletes };
}

/** Төлөв зөрсөн мөрүүд — материал бүрийн нэгтгэлийн төлвөөр */
export function statusFixes(rows: readonly NootsRow[]): { oid: number; status: string }[] {
  const st = new Map(nootsSummary(rows).map((s) => [s.name, s.status] as const));
  return rows.filter((r) => r.name && st.get(r.name) !== r.status).map((r) => ({ oid: r.oid, status: st.get(r.name) ?? TOLOV.open }));
}

/* ═══════════════ СЕРВЕР ═══════════════ */

/** `autoOff` — автомат бүртгэл идэвхгүй ШАЛТГААН (`mirIdIssue`); null бол бичиж болно */
type NootsTable = { url: string; autoOff: string | null };
let tableCache: NootsTable | null = null;
/* Хүснэгтийн хаяг · `mir_id` тохирох эсэх — админ талбар нэмсний дараа кэш хуучрахгүй (dataBus.invariant) */
register(() => { tableCache = null; }, ['MATERIAL_NOOTS']);

/** Үйлчилгээний (ганц) хүснэгтийн хаяг — дугаар нь нийтлэлээс хамаарна (CSV-ээс 242 г.м.), метанаас уншина */
async function nootsTable(): Promise<NootsTable> {
  if (tableCache) return tableCache;
  const svc = await arcgisPost(NOOTS_SVC, {}) as { tables?: { id: number }[]; layers?: { id: number }[] };
  const id = svc.tables?.[0]?.id ?? svc.layers?.[0]?.id;
  if (id == null) throw new Error(tr('Материалын нөөцийн хүснэгт олдсонгүй.'));
  const url = `${NOOTS_SVC}/${id}`;
  const meta = await arcgisPost(url, {}) as { fields?: { name?: string; type?: string; length?: number | null }[] };
  const fields = meta.fields ?? [];
  const have = new Set(fields.map((f) => String(f.name ?? '').toLowerCase()));
  const miss = [NF.name, NF.inQty, NF.usedQty, NF.unit, NF.status].filter((f) => !have.has(f));
  if (miss.length) throw new Error(tr('Материалын нөөцийн хүснэгтэд талбар дутуу: {0}', miss.join(', ')));
  tableCache = { url, autoOff: mirIdIssue(fields) };
  return tableCache;
}

/**
 * ⚠️ 2026-10-21 (аудит №2): БИЧИХ ЭРХ LIB-Д — UI-ийн `canSync` (`Ma.tsx`: `chanarAuthor` ЭСВЭЛ `chanarReview`)-тэй ИЖИЛ
 *    дүрэм, `ma.requireAttachCap`-ийн загвар. Урьд нь lib-д шалгалтгүй тул эрхгүй нэвтэрсэн хэрэглэгч консолоос нөөцийг
 *    бичиж/устгаж чаддаг байв. Хөтөчид л хаана (`who.requireCap` — Node тест/скрипт хаагдахгүй).
 *    Үйлчилгээний item өөрөө `public` хуваалцсан, засварын мөшгөлтгүй — тэр нь АДМИНЫ тохиргоо, кодоор засагдахгүй.
 */
function requireSyncCap(): void {
  try { requireCap('chanarAuthor'); } catch {
    try { requireCap('chanarReview'); } catch {
      throw new Error(tr('Энэ үйлдэлд эрхгүй — админаас «{0}» эсвэл «{1}» эрх авна уу.', capLabel('chanarAuthor'), capLabel('chanarReview')));
    }
  }
}

export async function loadNoots(): Promise<NootsRow[]> {
  const { url } = await nootsTable();
  const rows = await queryFeatures(url, { where: '1=1', outFields: ['*'], orderBy: NF.oid });
  return rows.map((r) => nootsRowOf(r as Record<string, unknown>));
}

type EditRes = { success?: boolean; error?: { description?: string } }[] | undefined;
const failed = (res: EditRes, n: number): string | null => {
  const arr = res ?? [];
  if (arr.length !== n) return tr('Серверээс {0} мөрийн хариу ирэх ёстой, {1} ирлээ', n, arr.length);
  const bad = arr.find((r) => r.success !== true);
  return bad ? bad.error?.description || tr('Нөөцийн хүснэгтэд бичигдсэнгүй.') : null;
};

/** 500-аар багцалж бичнэ; мөр бүрийн үр дүнг шалгана */
async function applyChunks(url: string, kind: 'adds' | 'updates' | 'deletes', items: unknown[]): Promise<void> {
  for (let i = 0; i < items.length; i += 500) {
    const part = items.slice(i, i + 500);
    const params: Record<string, string> = { rollbackOnFailure: 'true' };
    params[kind] = kind === 'deletes' ? part.join(',') : JSON.stringify(part);
    const j = await arcgisPost(`${url}/applyEdits`, params) as Record<string, EditRes>;
    const res = kind === 'adds' ? j.addResults : kind === 'updates' ? j.updateResults : j.deleteResults;
    const err = failed(res, part.length);
    if (err) throw new Error(err);
  }
}

export type SyncResult = {
  added: number; updated: number; removed: number; statusFixed: number;
  /** ⚠️ 2026-10-21 (аудит №2): автомат бүртгэл ИДЭВХГҮЙ — шалтгаан (`mir_id` алга/тохирохгүй, `mirIdIssue`); юу ч бичээгүй */
  disabled?: string;
};

let flight: Promise<SyncResult> | null = null;

/**
 * НӨӨЦИЙГ MA · MIR-ТЭЙ ТААРУУЛНА (автомат). Нэг табд зэрэг дуудалт нэг ажиллагаа болно.
 * ⚠️ `mir_id` талбаргүй/тохирохгүй бол давхардлаас хамгаалах түлхүүргүйгээр БИЧИХГҮЙ. 2026-10-21 (аудит №2): урьд нь ШИДДЭГ
 *    байсан тул MA хуудас нээх бүрд алдаа гарч нөөцийн боломж бүхэлдээ ажиллахгүй байв — одоо `disabled`-аар буцаана:
 *    MA харагдац · нөөцийн хүснэгт ажилласаар, зөвхөн автомат бүртгэл идэвхгүй (мэдэгдэл нэг удаа, `Ma.tsx`).
 * ⚠️ Бичсэний дараа ДАХИН уншиж (өөр таб/хэрэглэгчтэй зэрэг бичсэн) давхардлыг хасаж, төлвийг тааруулна.
 */
export function syncNoots(mas: readonly MaRow[], mirs: readonly MirRow[]): Promise<SyncResult> {
  if (flight) return flight;
  /* Бичилт ОРОЛДСОН эсэх — хүчингүй болголт зөвхөн тэр үед (доорх `finally`-ийн ⚠️) */
  let wrote = false;
  flight = (async () => {
    requireSyncCap();
    const { url, autoOff } = await nootsTable();
    if (autoOff) return { added: 0, updated: 0, removed: 0, statusFixed: 0, disabled: autoOff };
    const apply = (kind: 'adds' | 'updates' | 'deletes', items: unknown[]): Promise<void> => { wrote = true; return applyChunks(url, kind, items); };
    const plan = planSync(await loadNoots(), receiptsOf(mas, mirs));
    if (plan.deletes.length) await apply('deletes', plan.deletes);
    if (plan.updates.length) {
      await apply('updates', plan.updates.map((u) => ({ attributes: {
        [NF.oid]: u.oid, [NF.name]: u.name, [NF.inQty]: u.qty, [NF.unit]: u.unit || null,
      } })));
    }
    if (plan.adds.length) {
      await apply('adds', plan.adds.map((a) => ({ attributes: {
        [NF.name]: a.name, [NF.inQty]: a.qty, [NF.unit]: a.unit || null, [NF.status]: TOLOV.open, [NF.mirId]: `{${a.mirId.toUpperCase()}}`,
      } })));
    }
    /* Зэрэг бичигдсэн давхардал (хоёр хэрэглэгч ижил агшинд) — дахин уншиж БАГА objectid үлдээнэ */
    let rows = await loadNoots();
    const dup = planSync(rows, receiptsOf(mas, mirs)).deletes;
    if (dup.length) { await apply('deletes', dup); rows = await loadNoots(); }
    const fixes = statusFixes(rows);
    if (fixes.length) await apply('updates', fixes.map((f) => ({ attributes: { [NF.oid]: f.oid, [NF.status]: f.status } })));
    return { added: plan.adds.length, updated: plan.updates.length, removed: plan.deletes.length + dup.length, statusFixed: fixes.length };
  })().finally(() => {
    flight = null;
    /* Хагас бичилт ч байж болох тул амжилт/алдаанаас үл хамааран (`applyUpdates`-ийн ⚠️-тэй ижил) — гэхдээ ЗӨВХӨН бичилт
       оролдсон үед. ⚠️ 2026-10-21 (аудит №2): урьд нь юу ч бичээгүй ч хүчингүй болгодог тул MA хуудас нээх бүрд автобусын
       хувилбар өсч MA · MIR хүснэгт бүхэлдээ дахин татагдаж (`useAsync`), цэсний тэмдгүүд дахин тоологддог байв. */
    if (wrote) invalidate('MATERIAL_NOOTS');
  });
  return flight;
}

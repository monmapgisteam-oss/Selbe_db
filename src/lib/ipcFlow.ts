/**
 * IPC ҮҮСГЭХ ДАРААЛАЛ — цэвэр логик (2026-11-04, хэрэглэгч). Сүлжээ, React-гүй; тест: `ipcFlow.check.mjs`.
 *
 * Гүйцэтгэл ирсэн нь мөнгө олгосон гэсэн үг БИШ:
 *   1. «Гүйцэтгэл»         — бөглөлтөөс үүссэн AUTO мөр (`guits_une` нь ТУХАЙН ӨДРИЙН ажил, 2026-11-04);
 *   2. «IPC үүссэн»        — багц сонгож, гүйцэтгэлүүдийг чеклээд нэг IPC-д нэгтгэсэн (`IPC|…` мөр, дүн нь хөлдсөн);
 *   3. «Гарын үсэг зурсан» — PDF-д гарын үсэг зуруулж скан оруулсан (`ipc_barimt_id`);
 *   4. «Олгосон»           — баталгаажсан: IPC мөрийн `dun` бичигдэж `olgoson_dun`-д орно.
 * Батлаагүй баримтыг (1–3) устгаж болно, гүйцэтгэлүүд чөлөөлөгдөнө. Баталсан баримт устахгүй, засагдахгүй, цуцлахгүй (2026-11-06, хэрэглэгч).
 */
import { CASHFLOW_NEW, HO_IPC, num, pkgKeyOf } from '@/lib/services';
import { LINK_FIELDS } from '@/lib/ipcLink';
import { isAuto } from '@/lib/ipcAuto';
import { parseCell } from '@/lib/finEdit';

export type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;
const S = HO_IPC.status;
const CF = CASHFLOW_NEW.fields;

/** IPC баримтын мөрийн ID-ийн угтвар */
export const DOC_PREFIX = 'IPC|';

const txt = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const dayOf = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? new Date(v).toISOString().slice(0, 10) : '';
  const m = /^\d{4}-\d{2}-\d{2}/.exec(String(v));
  return m ? m[0] : '';
};

export const isDocRow = (r: Row): boolean => txt(r[P.id]).startsWith(DOC_PREFIX);

/**
 * Мөрийн төлөв. Хуучин мөр `ipc_tuluv`-гүй: `dun`-тэй бол «Олгосон», AUTO бол «Гүйцэтгэл».
 */
export function statusOf(r: Row): string {
  const s = txt(r[S.field]);
  if (s) return s;
  return num(r[P.amount]) != null ? S.paid : S.work;
}

export type PerfRow = {
  oid: number;
  id: string;
  pkg: string;
  day: string;
  /** Тухайн өдрийн ажил (`guits_une`) — IPC-ийн нийлбэрт энэ орно */
  une: number | null;
  /** `une`-тэй ижил (2026-11-04: жааз тухайн өдрийнхийг хадгалдаг тул өсөлт бодохгүй) */
  delta: number | null;
  status: string;
  ipcNo: number | null;
};

/**
 * Гэрээний гүйцэтгэлүүд, багц · өдрөөр. `delta` = `une` (тухайн өдрийн ажил).
 */
export function perfRows(pays: readonly Row[]): PerfRow[] {
  const rows = pays.filter(isAuto).map((r) => ({
    oid: num(r[HO_IPC.oid]) ?? 0,
    id: txt(r[P.id]),
    pkg: txt(r[C.pkg]),
    day: dayOf(r[P.payDate]),
    une: num(r[LINK_FIELDS.une]),
    status: statusOf(r),
    ipcNo: num(r[P.ipcNo]),
  }));
  rows.sort((a, b) => a.pkg.localeCompare(b.pkg, 'mn') || a.day.localeCompare(b.day) || a.oid - b.oid);
  return rows.map((r) => ({ ...r, delta: r.une }));
}

export type IpcDocRow = {
  oid: number;
  id: string;
  no: number;
  pkg: string;
  day: string;
  status: string;
  /** Баримтын дүн — үүсэх үед хөлдсөн (`guits_une`) */
  total: number | null;
  docItem: string;
  /** Урьдчилгааны баримт уу */
  advance: boolean;
};

/** Гэрээний IPC баримтууд, дугаараар */
export function docRows(pays: readonly Row[]): IpcDocRow[] {
  return pays.filter(isDocRow).map((r) => ({
    oid: num(r[HO_IPC.oid]) ?? 0,
    id: txt(r[P.id]),
    no: num(r[P.ipcNo]) ?? 0,
    pkg: txt(r[C.pkg]),
    day: dayOf(r[P.payDate]),
    status: statusOf(r),
    total: num(r[LINK_FIELDS.une]),
    docItem: txt(r[HO_IPC.docItem]),
    advance: r[P.kind] === HO_IPC.kinds.advance,
  })).sort((a, b) => a.no - b.no || a.oid - b.oid);
}

/** Дараагийн IPC дугаар — хамгийн их дугаар + 1 (устгасан сүүлийн дугаар дахин ашиглагдана) */
export function nextIpcNo(pays: readonly Row[]): number {
  let m = 0;
  for (const r of pays) { const n = num(r[P.ipcNo]); if (n != null && n > m) m = n; }
  return m + 1;
}

/** Хоёр хэрэглэгч зэрэг авсан IPC дугаарууд — нэг дугаартай нэгээс олон энгийн баримт */
export function dupDocNos(pays: readonly Row[]): number[] {
  const seen = new Map<number, number>();
  for (const d of docRows(pays)) seen.set(d.no, (seen.get(d.no) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([no]) => no);
}

const docId = (code: string, no: number): string => `${DOC_PREFIX}${code}|${no}`;

export type FlowEdit = { adds: Row[]; updates: Row[] };

/** IPC баримтын нийлбэр — сонгосон гүйцэтгэлийн дүн */
export const perfTotal = (rows: readonly PerfRow[]): number =>
  rows.reduce((a, r) => a + (r.delta ?? 0), 0);

/**
 * IPC ҮҮСГЭХ — баримтын мөр нэмж, сонгосон гүйцэтгэлийг түгжинэ. Алдаатай бол `string`.
 */
export function createIpc(
  code: string,
  pays: readonly Row[],
  selected: readonly PerfRow[],
  day: string,
): FlowEdit | string {
  if (!selected.length) return 'empty';
  if (selected.some((r) => r.status !== S.work)) return 'locked';
  /* Багцын түлхүүрээр: «Багц 1» ба «Багц-1» нэг багц */
  const pkgs = new Set(selected.map((r) => pkgKeyOf(r.pkg) || r.pkg));
  if (pkgs.size !== 1) return 'pkg';
  const no = nextIpcNo(pays);
  const pkg = selected[0].pkg;
  return {
    adds: [{
      [P.id]: docId(code, no),
      [C.code]: code,
      [C.pkg]: pkg,
      [P.kind]: HO_IPC.kinds.work,
      [P.ipcNo]: no,
      [P.payDate]: day,
      [LINK_FIELDS.une]: perfTotal(selected),
      [S.field]: S.created,
    }],
    updates: selected.map((r) => ({ [HO_IPC.oid]: r.oid, [P.ipcNo]: no, [S.field]: S.created })),
  };
}

/** Урьдчилгааны баримт — багц бүрт нэг, «Гэрээ үүсгэх»-ээс (2026-11-04) */
export function createAdvance(code: string, pkg: string, amount: number, no: number, day: string): Row {
  return {
    [P.id]: docId(code, no),
    [C.code]: code,
    [C.pkg]: pkg,
    [P.kind]: HO_IPC.kinds.advance,
    [P.ipcNo]: no,
    [P.payDate]: day,
    [LINK_FIELDS.une]: amount,
    [S.field]: S.created,
  };
}

/** Item-ийн нэр — `IPC_<geree_kod>_IPC-06_<огноо>` */
export function docTitle(code: string, d: Pick<IpcDocRow, 'no' | 'day'>): string {
  const safe = code.replace(/[|\\/:*?"<>,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `IPC_${safe}_IPC-${String(d.no).padStart(2, '0')}_${d.day}`;
}

/** Скан оруулсан — «Гарын үсэг зурсан» */
export const signIpc = (d: IpcDocRow, itemId: string): Row => ({
  [HO_IPC.oid]: d.oid,
  [HO_IPC.docItem]: itemId,
  [S.field]: S.signed,
});

/** Баталгаажуулах боломжгүй шалтгаан; `null` = болно. Нэг хүн үүсгэж баталж болно (2026-11-04: батлагчид цаасан дээр гарын үсэг зурдаг) */
export function approveWhy(d: IpcDocRow): 'status' | 'no-doc' | null {
  if (d.status !== S.signed) return 'status';
  if (!d.docItem) return 'no-doc';
  return null;
}

/**
 * БАТАЛГААЖУУЛАХ: `dun` = баримтын дүн, гүйцэтгэлүүд «Олгосон». Буцаах зам байхгүй.
 */
export function approveIpc(d: IpcDocRow, pays: readonly Row[], day?: string): Row[] {
  /* 2026-11-11 (аудит): олгосон огноо = БАТАЛСАН өдөр (үүсгэсэн өдөр биш) — сарын «олгосон» цуваа өмнөх сарыг буцааж өөрчилдөг байв */
  const paidOn = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { [P.payDate]: day, [P.year]: Number(day.slice(0, 4)) } : {};
  const out: Row[] = [{ [HO_IPC.oid]: d.oid, [P.amount]: d.total, [S.field]: S.paid, ...paidOn }];
  for (const r of pays) {
    /* 2026-11-09: зөвхөн «IPC үүссэн» мөр — ижил дугаартай (зэрэг үүссэн, `dupDocNos`) өөр баримтын баталсан эсвэл чөлөөлөгдсөн мөрийг хөндөхгүй */
    if (isAuto(r) && num(r[P.ipcNo]) === d.no && statusOf(r) === S.created) out.push({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [S.field]: S.paid });
  }
  return out;
}

/**
 * Устгах боломжгүй шалтгаан; `null` = болно. Баталсан баримт (мөнгө нь `dun`-д бичигдсэн) устахгүй. Мөр олдохгүй бол
 * төлөвөөр. Төлөв нь «Олгосон» боловч `dun` хоосон мөр бол мөнгөнд ороогүй: өмнөх цуцлалтын дарааллын үлдэгдэл, устгаж болно.
 */
export function deleteWhy(d: IpcDocRow, pays: readonly Row[]): 'paid' | null {
  const row = pays.find((r) => num(r[HO_IPC.oid]) === d.oid);
  if (!row) return d.status === S.paid ? 'paid' : null;
  return num(row[P.amount]) != null ? 'paid' : null;
}

/** УСТГАХ: баримтын мөр устаж, түүнд холбогдсон гүйцэтгэлүүд дахин сонгож болох болно */
export function deleteIpc(d: IpcDocRow, pays: readonly Row[]): { deletes: number[]; updates: Row[] } {
  const updates: Row[] = [];
  for (const r of pays) {
    /* 2026-11-09: «Олгосон» мөр чөлөөлөгдөхгүй — ижил дугаартай (зэрэг үүссэн, `dupDocNos`) баталсан баримтынх байж болно */
    if (isAuto(r) && num(r[P.ipcNo]) === d.no && statusOf(r) !== S.paid) updates.push({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [P.ipcNo]: null, [S.field]: S.work });
  }
  return { deletes: [d.oid], updates };
}

/**
 * Гэрээний дүнгээс хэтрэх үү — анхааруулга (нэмэлт гэрээ байж болох тул хориглохгүй). `pending` — үүссэн боловч батлагдаагүй
 * IPC-үүдийн дүн (2026-11-11 аудит: тоологддоггүй байсан тул 100-ийн гэрээнд 60 олгосон + 3×20 анхааруулгагүй үүсдэг байв).
 */
export const overContract = (paid: number | null, add: number | null, contract: number | null, pending = 0): boolean =>
  contract != null && contract > 0 && (paid ?? 0) + pending + (add ?? 0) > contract;

/* ─────────────────────── ГЭРЭЭ ҮҮСГЭХ · ЦУЦЛАХ ─────────────────────── */

const CONTRACTED = 'Гэрээлсэн дүн';

export type NewContract = {
  no: string;
  contractor: string;
  /** «YYYY-MM-DD» */
  date: string;
  /** Багц бүр: `Guitsetgel_talbe/182`-ийн мөр, гэрээний дүн, урьдчилгаа */
  items: { row: Row; amount: number; advance: number | null }[];
};

export type ContractWhy = 'no-number' | 'empty' | 'amount' | 'advance' | 'taken' | 'dup-number';

/** Дүнгийн бичвэр → тоо. Хоосон бол `null`, таних боломжгүй бол NaN. Таслалын дүрэм нь санхүүгийн хүснэгттэй ижил (`finEdit.parseCell`). */
export function parseMoney(t: string): number | null {
  try {
    return parseCell(t, 'esriFieldTypeDouble', '') as number | null;
  } catch {
    return Number.NaN;
  }
}

/**
 * Гэрээ үүсгэх боломжгүй шалтгаан; `null` = болно.
 * @param hoRows IPC-ийн мөрүүд — цуцлагдсан гэрээний дугаар ч орно: ийм дугаартай шинэ гэрээг `planHoSync` цуцлагдсан гэрээнийх гэж үзнэ
 */
export function contractWhy(c: NewContract, cfRows: readonly Row[], hoRows: readonly Row[] = []): ContractWhy | null {
  const no = txt(c.no);
  if (!no) return 'no-number';
  if (!c.items.length) return 'empty';
  if (c.items.some((i) => !(i.amount > 0))) return 'amount';
  /* «5 сая» мэт бичвэр NaN болно — `< 0` түүнийг барихгүй тул урвуугаар шалгана */
  if (c.items.some((i) => i.advance != null && !(i.advance >= 0))) return 'advance';
  if (c.items.some((i) => txt(i.row[CF.amountNote]) === CONTRACTED)) return 'taken';
  if (cfRows.some((r) => txt(r[CF.contractNo]) === no)) return 'dup-number';
  if (hoRows.some((r) => txt(r[C.contractNo]) === no)) return 'dup-number';
  return null;
}

/** `Guitsetgel_talbe/182`-ийн засвар — гэрээний дүн `geree_dun`-д; урьдчилсан төсөв (`ho_dun_geree`) хөндөгдөхгүй */
export function contractUpdates(c: NewContract): Row[] {
  return c.items.map(({ row, amount }) => ({
    [CASHFLOW_NEW.oid]: num(row[CASHFLOW_NEW.oid]),
    [CF.contractAmount]: amount,
    [CF.contractNo]: txt(c.no),
    [CF.contractor]: txt(c.contractor) || null,
    [CF.contractDate]: c.date ? Date.parse(`${c.date}T00:00:00Z`) : null,
    [CF.amountNote]: CONTRACTED,
  }));
}

/** Гэрээ цуцлах боломжтой юу — IPC үүссэн, олгосон мөргүй */
export function contractCancelWhy(pays: readonly Row[]): 'has-ipc' | null {
  /* «Цуцлагдсан» AUTO мөр зөвхөн гэрээ цуцлахаас үүснэ — хагас цуцлагдсан гэрээг дахин оролдох боломжтой */
  return pays.some((r) => num(r[P.amount]) != null || isDocRow(r) || (isAuto(r) && statusOf(r) !== S.work && statusOf(r) !== S.cancelled))
    ? 'has-ipc' : null;
}

/** Гэрээ цуцлах — HO мөрүүд «Цуцлагдсан», Cashflow-ийн гэрээний мэдээлэл арилна. Мөр устахгүй, урьдчилсан төсөв хөндөгдөхгүй. */
export function contractCancel(pays: readonly Row[], cfRows: readonly Row[]): { ho: Row[]; cf: Row[] } {
  return {
    ho: pays.map((r) => ({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [S.field]: S.cancelled })),
    cf: cfRows.map((r) => ({
      [CASHFLOW_NEW.oid]: num(r[CASHFLOW_NEW.oid]),
      [CF.contractAmount]: null,
      [CF.contractNo]: null,
      [CF.contractor]: null,
      [CF.contractDate]: null,
      [CF.amountNote]: null,
    })),
  };
}

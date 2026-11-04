/**
 * IPC ҮҮСГЭХ ДАРААЛАЛ — цэвэр логик (2026-11-04, хэрэглэгч). Сүлжээ, React-гүй; тест: `ipcFlow.check.mjs`.
 *
 * Гүйцэтгэл ирсэн нь мөнгө олгосон гэсэн үг БИШ:
 *   1. «Гүйцэтгэл»         — бөглөлтөөс үүссэн AUTO мөр (`guits_une` нь ТУХАЙН ӨДРИЙН ажил, 2026-11-04);
 *   2. «IPC үүссэн»        — багц сонгож, гүйцэтгэлүүдийг чеклээд нэг IPC-д нэгтгэсэн (`IPC|…` мөр, дүн нь хөлдсөн);
 *   3. «Гарын үсэг зурсан» — PDF-д гарын үсэг зуруулж скан оруулсан (`ipc_barimt_id`);
 *   4. «Олгосон»           — баталгаажсан: IPC мөрийн `dun` бичигдэж `olgoson_dun`-д орно.
 * IPC хэзээ ч устахгүй, засагдахгүй: цуцлах бол шинэ «Цуцлалт» баримт нээж мөн энэ дарааллаар явна.
 */
import { CASHFLOW_NEW, HO_IPC, num } from '@/lib/services';
import { LINK_FIELDS } from '@/lib/ipcLink';
import { isAuto } from '@/lib/ipcAuto';

export type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;
const S = HO_IPC.status;
const CF = CASHFLOW_NEW.fields;

/** IPC баримтын мөрийн ID-ийн угтвар */
export const DOC_PREFIX = 'IPC|';
const CANCEL_SUFFIX = '|C';

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
  createdBy: string;
  /** Урьдчилгааны баримт уу */
  advance: boolean;
  /** Цуцлалтын баримт уу */
  isCancel: boolean;
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
    createdBy: txt(r.created_user),
    advance: r[P.kind] === HO_IPC.kinds.advance,
    isCancel: txt(r[P.id]).endsWith(CANCEL_SUFFIX),
  })).sort((a, b) => a.no - b.no || a.oid - b.oid);
}

/** Дараагийн IPC дугаар — цуцлагдсан дугаар ч дахин ашиглагдахгүй */
export function nextIpcNo(pays: readonly Row[]): number {
  let m = 0;
  for (const r of pays) { const n = num(r[P.ipcNo]); if (n != null && n > m) m = n; }
  return m + 1;
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
  const pkgs = new Set(selected.map((r) => r.pkg));
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
export function docTitle(code: string, d: Pick<IpcDocRow, 'no' | 'day' | 'isCancel'>): string {
  const safe = code.replace(/[|\\/:*?"<>,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `IPC_${safe}_${d.isCancel ? 'Tsutslalt-' : ''}IPC-${String(d.no).padStart(2, '0')}_${d.day}`;
}

/** Скан оруулсан — «Гарын үсэг зурсан» */
export const signIpc = (d: IpcDocRow, itemId: string): Row => ({
  [HO_IPC.oid]: d.oid,
  [HO_IPC.docItem]: itemId,
  [S.field]: S.signed,
});

/** Баталгаажуулах боломжгүй шалтгаан; `null` = болно */
export function approveWhy(d: IpcDocRow, user: string | null | undefined): 'status' | 'no-doc' | 'same-user' | null {
  if (d.status !== S.signed) return 'status';
  if (!d.docItem) return 'no-doc';
  if (d.createdBy && user && d.createdBy.toLowerCase() === user.toLowerCase()) return 'same-user';
  return null;
}

/**
 * БАТАЛГААЖУУЛАХ. Энгийн баримт: `dun` = баримтын дүн, гүйцэтгэлүүд «Олгосон».
 * Цуцлалт: эх баримт «Цуцлагдсан», олгосон байсан бол сөрөг `dun`, гүйцэтгэлүүд чөлөөлөгдөнө.
 */
export function approveIpc(d: IpcDocRow, pays: readonly Row[]): Row[] {
  if (!d.isCancel) {
    const out: Row[] = [{ [HO_IPC.oid]: d.oid, [P.amount]: d.total, [S.field]: S.paid }];
    for (const r of pays) {
      if (isAuto(r) && num(r[P.ipcNo]) === d.no) out.push({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [S.field]: S.paid });
    }
    return out;
  }
  const origin = pays.find((r) => isDocRow(r) && num(r[P.ipcNo]) === d.no && !txt(r[P.id]).endsWith(CANCEL_SUFFIX));
  const paid = origin ? num(origin[P.amount]) : null;
  const out: Row[] = [{ [HO_IPC.oid]: d.oid, [P.amount]: paid == null ? null : -paid, [S.field]: S.paid }];
  if (origin) out.push({ [HO_IPC.oid]: num(origin[HO_IPC.oid]), [S.field]: S.cancelled });
  for (const r of pays) {
    if (isAuto(r) && num(r[P.ipcNo]) === d.no) out.push({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [P.ipcNo]: null, [S.field]: S.work });
  }
  return out;
}

/** Цуцлалтын баримт нээх боломжтой юу — энгийн, цуцлагдаагүй, цуцлалт нээгдээгүй */
export function canCancel(d: IpcDocRow, docs: readonly IpcDocRow[]): boolean {
  if (d.isCancel || d.status === S.cancelled) return false;
  return !docs.some((x) => x.isCancel && x.no === d.no);
}

/** Цуцлалтын баримт — эх баримтын дугаартай, дүн нь сөрөг */
export function createCancel(code: string, d: IpcDocRow, day: string): Row {
  return {
    [P.id]: `${docId(code, d.no)}${CANCEL_SUFFIX}`,
    [C.code]: code,
    [C.pkg]: d.pkg,
    [P.kind]: d.advance ? HO_IPC.kinds.advance : HO_IPC.kinds.work,
    [P.ipcNo]: d.no,
    [P.payDate]: day,
    [LINK_FIELDS.une]: d.total == null ? null : -d.total,
    [S.field]: S.created,
  };
}

/** Гэрээний дүнгээс хэтрэх үү — анхааруулга (нэмэлт гэрээ байж болох тул хориглохгүй) */
export const overContract = (paid: number | null, add: number | null, contract: number | null): boolean =>
  contract != null && contract > 0 && (paid ?? 0) + (add ?? 0) > contract;

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

export type ContractWhy = 'no-number' | 'empty' | 'amount' | 'taken' | 'dup-number';

/** Гэрээ үүсгэх боломжгүй шалтгаан; `null` = болно */
export function contractWhy(c: NewContract, cfRows: readonly Row[]): ContractWhy | null {
  const no = txt(c.no);
  if (!no) return 'no-number';
  if (!c.items.length) return 'empty';
  if (c.items.some((i) => !(i.amount > 0) || (i.advance != null && i.advance < 0))) return 'amount';
  if (c.items.some((i) => txt(i.row[CF.amountNote]) === CONTRACTED)) return 'taken';
  if (cfRows.some((r) => txt(r[CF.contractNo]) === no)) return 'dup-number';
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
  return pays.some((r) => num(r[P.amount]) != null || isDocRow(r) || (isAuto(r) && statusOf(r) !== S.work))
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

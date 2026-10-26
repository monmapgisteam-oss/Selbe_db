/** Cashflow publish inputs must come from the service, not the open table's props. */
import { t as tr } from './i18nCore';
type Row = Record<string, unknown>;
type Updates = Map<number, Row>;

export type FinanceInputScope = { parentOids: number[]; monthOids: number[]; ids: number[] };
export type FinanceInputRows = { parents: Row[]; months: Row[] };
export type FinancePublishInputs = FinanceInputRows & { recheck: () => Promise<void> };

const idOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const id = Number(v);
  return Number.isFinite(id) ? id : null;
};
const own = (row: Row, key: string) => Object.prototype.hasOwnProperty.call(row, key);
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
/* ⚠️ 2026-10-21 (аудит): `Cashflow_ID` (эцэг↔сарын холбоос) ч ОРОЛТ — дугаар солиход шинэ дугаарын сарууд энэ эцгийн
   ХО дүнгээр, хуучин дугаарынх шинэ эзнээрээ дахин бодогдох ёстой. Урьд нь энд байгаагүй тул уншилт ч, тооцоо ч явахгүй,
   сарын `Cashflow_dun` хуучин эцгийн дүнгээр үлдэж S-муруй худал болдог байв. */
const SOURCE_FIELDS = ['ho_dun_geree', 'ehleh_ognoo', 'duusah_ognoo', 'cashflow_huwi', 'cashflow_id'];
const PARENT_INPUTS = ['cashflow_id', 'ho_dun_geree', 'ehleh_ognoo', 'duusah_ognoo'];
const MONTH_INPUTS = ['cashflow_id', 'cashflow_start', 'cashflow_end', 'cashflow_huwi', 'cashflow_dun'];

export class FinancePublishConflict extends Error {
  constructor() {
    super(tr('Санхүүгийн тооцоонд ашиглах өгөгдөл өөрчлөгдсөн байна. Засвар хадгалагдаагүй — хүснэгтийг дахин ачаалж шалгана уу.'));
    this.name = 'FinancePublishConflict';
  }
}

/** ⚠️ 2026-10-21: ЭНЭ нийтлэлийн `Cashflow_ID` засвар өөр ажлын дугаартай давхцав — сарын дүнг аль эцгээр бодохоо мэдэхгүй тул нийтлэхгүй */
export class FinanceDuplicateId extends Error {
  constructor(id: number) {
    super(tr('Cashflow_ID {0} өөр ажилд аль хэдийн байна — давхардсан дугаараар сарын дүн бодогдохгүй тул нийтлэгдсэнгүй.', id));
    this.name = 'FinanceDuplicateId';
  }
}

/** Refresh every affected parent and its complete monthly set, including amount-only edits. */
export async function loadFinancePublishInputs(opts: {
  updates: Updates;
  parents: Row[];
  months: Row[];
  oidField: string;
  read: (scope: FinanceInputScope) => Promise<FinanceInputRows>;
}): Promise<FinancePublishInputs | undefined> {
  const { updates, parents, months, oidField, read } = opts;
  const parentByOid = new Map(parents.map((r) => [Number(r[oidField]), r]));
  const monthByOid = new Map(months.map((r) => [Number(r[oidField]), r]));
  const parentOids = new Set<number>();
  const monthOids = new Set<number>();
  const ids = new Set<number>();
  for (const [oid, change] of updates) {
    if (!SOURCE_FIELDS.some((field) => own(change, field))) continue;
    const parent = parentByOid.get(oid);
    const month = monthByOid.get(oid);
    if (parent) parentOids.add(oid);
    else if (month) monthOids.add(oid);
    else throw new FinancePublishConflict();
    const id = idOf((parent ?? month)?.cashflow_id);
    if (id != null) ids.add(id);
    /* ⚠️ 2026-10-21: ШИНЭ дугаарын эцэг ба сарууд ч хамрах хүрээнд — тэр дугаарын сар дахин бодогдоно, давхардал илэрнэ */
    const nextId = own(change, 'cashflow_id') ? idOf(change.cashflow_id) : null;
    if (nextId != null) ids.add(nextId);
  }
  if (!parentOids.size && !monthOids.size) return undefined;
  const scope = { parentOids: [...parentOids], monthOids: [...monthOids], ids: [...ids] };
  const fresh = await read(scope);
  const freshByOid = new Map([...fresh.parents, ...fresh.months].map((r) => [Number(r[oidField]), r]));
  const oldByOid = new Map([...parents, ...months].map((r) => [Number(r[oidField]), r]));
  for (const id of ids) {
    if (parents.some((r) => idOf(r.cashflow_id) === id)
      && !fresh.parents.some((r) => idOf(r.cashflow_id) === id)) throw new FinancePublishConflict();
  }

  // An intentional local edit may replace the old value, but must not erase a remote edit.
  for (const oid of [...parentOids, ...monthOids]) {
    const before = oldByOid.get(oid)!;
    const now = freshByOid.get(oid);
    if (!now || !same(before.cashflow_id, now.cashflow_id)) throw new FinancePublishConflict();
    for (const [field, value] of Object.entries(updates.get(oid)!)) {
      if (field === oidField || field === 'cashflow_dun') continue;
      if (!same(before[field], now[field]) && !same(value, now[field])) throw new FinancePublishConflict();
    }
  }

  const editedKeys = new Map([...updates].map(([oid, change]) => [oid, Object.keys(change)]));
  const fingerprint = (data: FinanceInputRows) => {
    const entries = (list: Row[], inputFields: string[]) => list.map((r) => {
      const oid = Number(r[oidField]);
      const keys = [...new Set([oidField, ...inputFields, ...(editedKeys.get(oid) ?? [])])].sort();
      return [oid, ...keys.map((key) => [key, r[key] ?? null])];
    }).sort((a, b) => Number(a[0]) - Number(b[0]));
    return JSON.stringify([entries(data.parents, PARENT_INPUTS), entries(data.months, MONTH_INPUTS)]);
  };
  const expected = fingerprint(fresh);
  return {
    ...fresh,
    async recheck() {
      if (fingerprint(await read(scope)) !== expected) throw new FinancePublishConflict();
    },
  };
}

/** Keep the final freshness check beside the actual batch write. This is not a server CAS. */
export async function publishFinanceBatch<T>(inputs: FinancePublishInputs | undefined, write: () => Promise<T>): Promise<T> {
  await inputs?.recheck();
  return write();
}

/** The publish calculation: fresh remote inputs, overlaid only with this user's pending edits. */
export function recomputeFinanceAmounts(opts: {
  updates: Updates;
  parents: Row[];
  months: Row[];
  oidField: string;
  deletes: number[];
}): void {
  const { updates, parents, months, oidField, deletes } = opts;
  const parentByOid = new Map(parents.map((r) => [Number(r[oidField]), r]));
  const monthByOid = new Map(months.map((r) => [Number(r[oidField]), r]));
  for (const [oid, change] of updates) {
    delete change.cashflow_dun;
    if (Object.keys(change).length <= 1) updates.delete(oid);
  }
  /* ⚠️ 2026-10-21 (аудит): холбоосыг ЗАСВАРТАЙ нь уншина (`linkIdOf`) — `Cashflow_ID` энэ нийтлэлд солигдож болно.
     Эцгийн толь ч, сарын эзэн ч ШИНЭ дугаараар. Засвараар үүссэн давхардал → `FinanceDuplicateId` (ил алдаа);
     өгөгдөлд урьдаас байсан давхардал → `FinancePublishConflict` (хуучин зан). */
  const linkIdOf = (row: Row | undefined): number | null => {
    if (!row) return null;
    const change = updates.get(Number(row[oidField]));
    return idOf(change && own(change, 'cashflow_id') ? change.cashflow_id : row.cashflow_id);
  };
  const editedIds = new Set<number>();
  for (const change of updates.values()) {
    const id = own(change, 'cashflow_id') ? idOf(change.cashflow_id) : null;
    if (id != null) editedIds.add(id);
  }
  const parentById = new Map<number, Row>();
  const duplicateIds = new Set<number>();
  for (const row of parents) {
    const id = linkIdOf(row);
    if (id == null) continue;
    if (parentById.has(id)) duplicateIds.add(id);
    parentById.set(id, row);
  }
  const rejectDuplicate = (id: number | null) => {
    if (id == null || !duplicateIds.has(id)) return;
    throw editedIds.has(id) ? new FinanceDuplicateId(id) : new FinancePublishConflict();
  };
  const costOf = (parent: Row | undefined): number | null => {
    if (!parent) return null;
    const change = updates.get(Number(parent[oidField]));
    const raw = change && own(change, 'ho_dun_geree') ? change.ho_dun_geree : parent.ho_dun_geree;
    const value = Number(raw);
    return raw != null && raw !== '' && Number.isFinite(value) && value > 0 ? value : null;
  };
  const amountOf = (percent: unknown, cost: number | null): number | null => {
    const value = Number(percent);
    return percent == null || String(percent).trim() === '' || !Number.isFinite(value) || cost == null
      ? null : cost * value / 100;
  };
  for (const [oid, change] of updates) {
    if (!own(change, 'cashflow_huwi')) continue;
    const id = linkIdOf(monthByOid.get(oid));
    rejectDuplicate(id);
    change.cashflow_dun = amountOf(change.cashflow_huwi, costOf(id == null ? undefined : parentById.get(id)));
  }
  /* ⚠️ 2026-10-21: ДАХИН БОДОХ сарууд — (а) ХО дүн нь засагдсан эцгийн (шинэ дугаартай) бүх сар; (б) дугаар нь солигдсон
     эцгийн ХУУЧИН ба ШИНЭ дугаарын бүх сар (хуучин дугаар эзэнгүй үлдвэл тэр саруудын дүн `null` — эцэггүй хувь дүн
     болохгүй, `amountOf`-ийн хуучин дүрэм); (в) өөрөө өөр дугаар руу шилжсэн сарын мөр. Энэ нийтлэлд хувь нь бичигдсэн
     сар дээрх давталтаар аль хэдийн бодогдсон тул давхар бодохгүй; устгагдах мөр хөндөгдөхгүй. */
  const touchedIds = new Set<number>();
  const touchedMonths = new Set<number>();
  for (const [oid, change] of updates) {
    const parent = parentByOid.get(oid);
    if (parent) {
      if (own(change, 'ho_dun_geree')) {
        const id = linkIdOf(parent);
        rejectDuplicate(id);
        if (id != null) touchedIds.add(id);
      }
      if (own(change, 'cashflow_id')) {
        for (const id of [idOf(parent.cashflow_id), idOf(change.cashflow_id)]) {
          rejectDuplicate(id);
          if (id != null) touchedIds.add(id);
        }
      }
    } else if (own(change, 'cashflow_id') && monthByOid.has(oid)) {
      touchedMonths.add(oid);
    }
  }
  for (const month of months) {
    const moid = Number(month[oidField]);
    const id = linkIdOf(month);
    if (!touchedMonths.has(moid) && (id == null || !touchedIds.has(id))) continue;
    if (!Number.isFinite(moid) || deletes.includes(moid)) continue;
    const pending = updates.get(moid) ?? { [oidField]: moid };
    if (own(pending, 'cashflow_huwi')) continue;
    rejectDuplicate(id);
    const next = amountOf(month.cashflow_huwi, costOf(id == null ? undefined : parentById.get(id)));
    const previous = month.cashflow_dun == null ? null : Number(month.cashflow_dun);
    if (next === previous) continue;
    pending.cashflow_dun = next;
    updates.set(moid, pending);
  }
}

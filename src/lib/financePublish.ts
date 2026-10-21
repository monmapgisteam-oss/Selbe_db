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
const SOURCE_FIELDS = ['ho_dun_geree', 'ehleh_ognoo', 'duusah_ognoo', 'Cashflow_huwi'];
const PARENT_INPUTS = ['Cashflow_ID', 'ho_dun_geree', 'ehleh_ognoo', 'duusah_ognoo'];
const MONTH_INPUTS = ['Cashflow_ID', 'Cashflow_start', 'Cashflow_end', 'Cashflow_huwi', 'Cashflow_dun'];

export class FinancePublishConflict extends Error {
  constructor() {
    super(tr('Санхүүгийн тооцоонд ашиглах өгөгдөл өөрчлөгдсөн байна. Засвар хадгалагдаагүй — хүснэгтийг дахин ачаалж шалгана уу.'));
    this.name = 'FinancePublishConflict';
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
    const id = idOf((parent ?? month)?.Cashflow_ID);
    if (id != null) ids.add(id);
  }
  if (!parentOids.size && !monthOids.size) return undefined;
  const scope = { parentOids: [...parentOids], monthOids: [...monthOids], ids: [...ids] };
  const fresh = await read(scope);
  const freshByOid = new Map([...fresh.parents, ...fresh.months].map((r) => [Number(r[oidField]), r]));
  const oldByOid = new Map([...parents, ...months].map((r) => [Number(r[oidField]), r]));
  for (const id of ids) {
    if (parents.some((r) => idOf(r.Cashflow_ID) === id)
      && !fresh.parents.some((r) => idOf(r.Cashflow_ID) === id)) throw new FinancePublishConflict();
  }

  // An intentional local edit may replace the old value, but must not erase a remote edit.
  for (const oid of [...parentOids, ...monthOids]) {
    const before = oldByOid.get(oid)!;
    const now = freshByOid.get(oid);
    if (!now || !same(before.Cashflow_ID, now.Cashflow_ID)) throw new FinancePublishConflict();
    for (const [field, value] of Object.entries(updates.get(oid)!)) {
      if (field === oidField || field === 'Cashflow_dun') continue;
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
  const parentById = new Map<number, Row>();
  const duplicateIds = new Set<number>();
  for (const row of parents) {
    const id = idOf(row.Cashflow_ID);
    if (id == null) continue;
    if (parentById.has(id)) duplicateIds.add(id);
    parentById.set(id, row);
  }
  for (const [oid, change] of updates) {
    delete change.Cashflow_dun;
    if (Object.keys(change).length <= 1) updates.delete(oid);
  }
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
    if (!own(change, 'Cashflow_huwi')) continue;
    const id = idOf(monthByOid.get(oid)?.Cashflow_ID);
    if (id != null && duplicateIds.has(id)) throw new FinancePublishConflict();
    change.Cashflow_dun = amountOf(change.Cashflow_huwi, costOf(id == null ? undefined : parentById.get(id)));
  }
  for (const [oid, change] of updates) {
    if (!own(change, 'ho_dun_geree')) continue;
    const parent = parentByOid.get(oid);
    const id = idOf(parent?.Cashflow_ID);
    if (id == null) continue;
    if (duplicateIds.has(id)) throw new FinancePublishConflict();
    for (const month of months) {
      if (idOf(month.Cashflow_ID) !== id) continue;
      const moid = Number(month[oidField]);
      if (!Number.isFinite(moid) || deletes.includes(moid)) continue;
      const pending = updates.get(moid) ?? { [oidField]: moid };
      if (own(pending, 'Cashflow_huwi')) continue;
      const next = amountOf(month.Cashflow_huwi, costOf(parent));
      const previous = month.Cashflow_dun == null ? null : Number(month.Cashflow_dun);
      if (next === previous) continue;
      pending.Cashflow_dun = next;
      updates.set(moid, pending);
    }
  }
}

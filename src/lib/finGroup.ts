/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛИЙГ БАГЦААР БҮТЭЦЛЭХ — цэвэр логик, React-гүй.
 */
import { CASHFLOW_NEW, HO_IPC, bagtsKey, isPkgRange } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';

export type Row = Record<string, unknown>;

const CF = CASHFLOW_NEW.fields;
const HO = HO_IPC.contractFields;

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Багцад хуваарилагдаагүй мөрүүдийн түлхүүр */
export const NO_PKG = ' nopkg';

export type GroupRow = { row: Row; oid: number | null };
export type PkgBlock = { key: string; pkg: string; rows: GroupRow[]; count: number };

/**
 * Аль үйлчилгээ вэ — багц ба оны талбар нь өөр.
 */
export type FinKind = 'ho' | 'flat';

/**
 * Мөрийн багц — дэд багц (навч) эхэлж.
 */
function pkgOf(r: Row, f2: string, f1: string): { key: string; label: string } {
  for (const fld of [f2, f1]) {
    const raw = r[fld];
    if (s(raw) === '') continue;
    if (isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (k && k !== '0') return { key: k, label: s(raw) };
  }
  return { key: NO_PKG, label: NO_PKG };
}

const oidOf = (r: Row, field: string): number | null => {
  const v = r[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Мөрүүдийг БАГЦААР бүтэцлэнэ.
 */
export function buildGroups(rows: Row[], kind: FinKind): PkgBlock[] {
  const oidField = kind === 'ho' ? HO_IPC.oid : CASHFLOW_NEW.oid;
  const f2 = kind === 'ho' ? HO.pkg : CF.pkg2;
  const f1 = kind === 'ho' ? HO.pkg : CF.pkg;

  const byPkg = new Map<string, { label: string; rows: GroupRow[] }>();
  for (const r of rows) {
    const p = pkgOf(r, f2, f1);
    let bucket = byPkg.get(p.key);
    if (!bucket) { bucket = { label: p.label, rows: [] }; byPkg.set(p.key, bucket); }
    bucket.rows.push({ row: r, oid: oidOf(r, oidField) });
  }

  const keys = [...byPkg.keys()].sort((a, b) => {
    const d = (a === NO_PKG ? 1 : 0) - (b === NO_PKG ? 1 : 0);
    if (d !== 0) return d;
    return (byPkg.get(a)?.label ?? '').localeCompare(byPkg.get(b)?.label ?? '', 'mn', { numeric: true });
  });

  return keys.map((k) => {
    const b = byPkg.get(k) as { label: string; rows: GroupRow[] };
    return {
      key: k,
      pkg: k === NO_PKG ? tr('Багцад хуваарилагдаагүй') : b.label,
      rows: b.rows,
      count: b.rows.length,
    };
  });
}

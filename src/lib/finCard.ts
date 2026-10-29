/**
 * САНХҮҮЖИЛТИЙН КАРТЫН ӨГӨГДӨЛ — цэвэр логик, React-гүй.
 */
import { HO_IPC } from '@/lib/services';
import type { Row } from '@/lib/finGroup';

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/* ─────────────────────────── НИЙЛБЭР ─────────────────────────── */

/**
 * Талбарын нийлбэр — БҮХ мөр хоосон бол `null`.
 */
export function sumOrNull(rows: Row[], field: string): number | null {
  let acc: number | null = null;
  for (const r of rows) {
    const v = r[field];
    if (v == null || v === '') continue;
    const x = Number(v);
    if (!Number.isFinite(x)) continue;
    acc = (acc ?? 0) + x;
  }
  return acc;
}

/* ─────────────────────────── ТӨЛБӨР ─────────────────────────── */

/**
 * Төлбөрийн хүснэгтийн ҮНДСЭН баганууд — гэрээ · багц · гүйцэтгэгч ·
 * төлбөрийн төрөл · IPC дугаар · олгосон дүн · гүйлгээний огноо.
 */
export const HO_MAIN_FIELDS: string[] = [
  C.code, C.pkg, C.contractor, P.kind, P.ipcNo, P.amount, P.payDate,
];

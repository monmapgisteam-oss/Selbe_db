/**
 * ӨӨРЧЛӨЛТИЙН ТҮҮХ (2026-11-20, хэрэглэгч: бодит ашиглалтад «хэн, хэзээ, юуг юу болгосон» харагдах ёстой).
 *
 * Системийн бүх бичилт (`tableWrite.applyAll`) амжилттай болсны дараа энд нэг мөр бүртгэгдэнэ: огноо, хэрэглэгч, хүснэгт,
 * мөр (objectid), үйлдэл (нэмсэн · зассан · устгасан), багана, тэр баганын утга (багана бүр нэг мөр). Хүснэгт: `Guitsetgel_talbe/235` «audit» (notebook-оор
 * үүсгэнэ). Бүртгэл унах нь ҮНДСЭН бичилтийг хэзээ ч зогсоохгүй — алдааг консолд л бичнэ. Хүснэгт байхгүй үед дахин
 * оролдохгүй (сешнд нэг удаа).
 */
import { SYS_AUDIT } from '@/lib/services/env';
import { arcgisPost } from './authToken';
import { currentUser } from './who';

export type AuditOp = 'add' | 'update' | 'delete';
export type AuditEntry = { table: string; oid: number | null; op: AuditOp; values: Record<string, unknown> | null };

/** Нэг утгын дээд урт — хүснэгтийн талбар 4000 тэмдэгт */
const MAX = 3900;
let broken = false;

/** Хүснэгтийн богино нэр: «…/Guitsetgel_talbe/FeatureServer/182» → «Guitsetgel_talbe/182» (цэвэр) */
export function tableName(url: string): string {
  const m = /\/([^/]+)\/(?:Feature|Map)Server\/(\d+)\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : url.slice(-60);
}

/** Нэг нүдний утга — бичвэр болгоно (урт бол тайрна) */
const cell = (v: unknown): string | null => {
  if (v == null) return null;
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return t.length > MAX ? `${t.slice(0, MAX)}…` : t;
};

/**
 * Бүртгэлийн мөрүүд (цэвэр). 2026-11-23 (хэрэглэгч: «нэг нүдэнд нэг утга»): бичигдсэн БАГАНА БҮР НЭГ МӨР — `bagana` (баганын
 * нэр), `utga` (тэр баганын шинэ утга). Мөрийн дугаарын багана (`objectid`) тусдаа `oid`-д байгаа тул давтахгүй. Утгагүй
 * үйлдэл (устгал) — баганагүй ганц мөр.
 */
export function auditRows(entries: readonly AuditEntry[], user: string | null, at: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const e of entries) {
    const head = { ognoo: at, hereglegch: user ?? null, husnegt: e.table, oid: e.oid, uildel: e.op };
    const cols = Object.entries(e.values ?? {}).filter(([k]) => !/^objectid$/i.test(k));
    if (!cols.length) { out.push({ attributes: { ...head, bagana: null, utga: null } }); continue; }
    for (const [k, v] of cols) out.push({ attributes: { ...head, bagana: k, utga: cell(v) } });
  }
  return out;
}

/** Бичилтийг бүртгэнэ — алдаа гаргахгүй, үндсэн урсгалыг хүлээлгэхгүй */
export function logAudit(entries: readonly AuditEntry[]): void {
  if (broken || !entries.length || !SYS_AUDIT || typeof window === 'undefined') return;
  const rows = auditRows(entries, currentUser(), Date.now());
  void (async () => {
    for (let i = 0; i < rows.length; i += 500) {
      await arcgisPost(`${SYS_AUDIT}/applyEdits`, { adds: JSON.stringify(rows.slice(i, i + 500)) });
    }
  })().catch((e) => {
    broken = /not found|does not exist|400|404|Invalid URL/i.test(String((e as Error)?.message ?? e));
    console.warn('[selbe] өөрчлөлтийн түүх бичигдсэнгүй', e);
  });
}

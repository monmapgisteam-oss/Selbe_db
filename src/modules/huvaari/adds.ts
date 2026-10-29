/**
 * НЭМЭЛТ АЖИЛ — түр ObjectID · localStorage ноорог · буцаалтын тэмдэг
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 */

import type { NewRow } from '@/modules/sheet/sheetFrame';

/* ══════════════════ НЭМЭЛТ АЖИЛ — түр ObjectID ба локал ноорог (2026-09-24) ══════════════════ */
export let tmpOid = -(Date.now() % 1e9) * 100 - 1;
/** Дараагийн түр ObjectID — дуудагч бүр ЭНЭ функцээр (шууд `tmpOid--` биш) */
export function nextTmpOid(): number { return tmpOid--; }
/** Тоолуурыг сэргээсэн/ирсэн мөрүүдээс ЦААШ түлхэнэ — эс бөгөөс дараа нэмсэн мөр ижил дугаар авна */
export function pushTmpOid(adds: readonly NewRow[]): void {
  for (const a of adds) if (a.oid <= tmpOid) tmpOid = a.oid - 1;
}
export const EMPTY_ADDS: NewRow[] = [];
export const ADDS_LS = (pkgKey: string) => `selbe-ajil-adds|${pkgKey}`;
/**
 * localStorage-оос сэргээх — `{ v: 1, adds }`. Эвдэрсэн БИЧЛЭГИЙГ л хаяна
 * (FillNew.parseDraft-ийн дүрэм): түр oid САЛАНГИД СӨРӨГ БҮХЭЛ, нэрс мөр,
 * `vol`/`unit` тоо эсвэл `null` (`null ≠ 0`).
 */
export function readAdds(pkgKey: string): NewRow[] {
  try {
    const raw = localStorage.getItem(ADDS_LS(pkgKey));
    if (!raw) return [];
    const j = JSON.parse(raw) as { v?: number; adds?: unknown };
    if (!j || j.v !== 1 || !Array.isArray(j.adds)) return [];
    const seen = new Set<number>();
    const out: NewRow[] = [];
    const isStr = (v: unknown): v is string => typeof v === 'string';
    const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    for (const a of j.adds as unknown[]) {
      if (!a || typeof a !== 'object') continue;
      const r = a as Record<string, unknown>;
      const o = Number(r.oid);
      if (!Number.isInteger(o) || o >= 0 || seen.has(o)) continue;
      if (!isStr(r.no) || !isStr(r.work) || !isStr(r.parentNo) || !isStr(r.parentWork)) continue;
      seen.add(o);
      out.push({
        oid: o, parentNo: r.parentNo, parentWork: r.parentWork,
        parentIdx: Number.isInteger(r.parentIdx) ? (r.parentIdx as number) : -1,
        no: r.no, work: r.work, vol: numOrNull(r.vol), unit: numOrNull(r.unit),
      });
    }
    return out;
  } catch { return []; }
}
export function writeAdds(pkgKey: string, adds: readonly NewRow[]): void {
  try {
    if (!adds.length) localStorage.removeItem(ADDS_LS(pkgKey));
    else localStorage.setItem(ADDS_LS(pkgKey), JSON.stringify({ v: 1, adds }));
  } catch { /* хаалттай орчин */ }
}
/**
 * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТИЙГ ЗАСАЖ БУЙ ТӨЛӨВ (2026-09-29) — `oid` = илгээлт, `rows` = түүнээс
 * `adds`-д буулгасан мөрийн түр oid-ууд («Болих» эдгээрийг л хасна).
 */
export type AjEdit = { oid: number; rows: number[] };
export const AJ_EDIT_LS = (pkgKey: string) => `selbe-ajil-edit|${pkgKey}`;
export function readAjEdit(pkgKey: string): AjEdit | null {
  try {
    const j = JSON.parse(localStorage.getItem(AJ_EDIT_LS(pkgKey)) ?? 'null') as Partial<AjEdit> | null;
    if (!j || !Number.isInteger(j.oid) || !Array.isArray(j.rows)) return null;
    return { oid: j.oid as number, rows: j.rows.filter((x) => Number.isInteger(x)) };
  } catch { return null; }
}
export function writeAjEdit(pkgKey: string, v: AjEdit | null): void {
  try {
    if (!v) localStorage.removeItem(AJ_EDIT_LS(pkgKey));
    else localStorage.setItem(AJ_EDIT_LS(pkgKey), JSON.stringify(v));
  } catch { /* хаалттай орчин */ }
}
/**
 * ТОДОРХОЙГҮЙ ТАТАЛТ (2026-10-22, аудит №6) — `withdrawAjil`-ийн хариу алдагдаж, дахин уншилт ч унасан үед (`unsure`)
 * тэр илгээлтийн мөрүүдийг энд хадгална. `useAjil.refreshAjil` серверийн төлвийг уншаад «Татсан» бол мөрүүдийг `adds`-д
 * буулгана (засварын горимд — `editing` — мөрүүд аль хэдийн `adds`-д тул засварын төлвийг л цэвэрлэнэ); хүлээгдсэн
 * хэвээр (татагдаагүй) эсвэл өөр төлөвт тэмдгийг зүгээр арилгана. Урьд нь энэ тохиолдолд «Татсан» илгээлтийн мөрүүд
 * хаанаас ч сэргэдэггүй (`refreshAjil` зөвхөн «Буцаагдсан»-ыг сэргээдэг) — ажил бүрмөсөн алга болдог байв.
 */
export type WdMark = { oid: number; adds: NewRow[]; editing: boolean };
export const AJ_WD_LS = (pkgKey: string) => `selbe-ajil-wd|${pkgKey}`;
export function readWdMark(pkgKey: string): WdMark | null {
  try {
    const j = JSON.parse(localStorage.getItem(AJ_WD_LS(pkgKey)) ?? 'null') as Partial<WdMark> | null;
    if (!j || !Number.isInteger(j.oid) || !Array.isArray(j.adds)) return null;
    return { oid: j.oid as number, adds: j.adds as NewRow[], editing: j.editing === true };
  } catch { return null; }
}
export function writeWdMark(pkgKey: string, v: WdMark | null): void {
  try {
    if (!v) localStorage.removeItem(AJ_WD_LS(pkgKey));
    else localStorage.setItem(AJ_WD_LS(pkgKey), JSON.stringify(v));
  } catch { /* хаалттай орчин */ }
}
/**
 * Ирсэн мөрүүдийг (татсан · буцаагдсан) `adds`-д НИЙЛҮҮЛНЭ — FillNew-ийн
 * `mergeIncomingAdds`-ийн хуулбар: ижил мөр байвал алгасна, oid мөргөлдвөл
 * шинэ сул дугаар, тоолуурыг түлхэнэ.
 */
export function mergeIncoming(prev: readonly NewRow[], incoming: readonly NewRow[]): NewRow[] {
  const used = new Set(prev.map((a) => a.oid));
  const fresh: NewRow[] = [];
  for (const a of incoming) {
    if (prev.some((x) => x.no === a.no && x.work === a.work && x.parentNo === a.parentNo && x.parentWork === a.parentWork && x.parentIdx === a.parentIdx)) continue;
    const oid = used.has(a.oid) ? nextTmpOid() : a.oid;
    used.add(oid);
    fresh.push({ ...a, oid });
  }
  if (!fresh.length) return prev.slice();
  pushTmpOid(fresh);
  return [...prev, ...fresh];
}
/**
 * ХУУЧИН OID → ШИНЭ OID зураглал — (№ ¦ нэр) түлхүүрээр, давхардсан түлхүүрт
 * ДАРААЛЛААР (n дэх хуучин ↔ n дэх шинэ). Нэмэлт ажил батлагдахад архивт
 * БҮТЭН ШИНЭ жааз орж бүх OID солигддог (2026-09-24 аудит #1) — хадгалаагүй
 * ноорогийг хаяхгүйн тулд шинэ мөр рүү нь зөөнө (`hyanaltStore`-ийн
 * `rowKeys`/`buildOidMap`-ийн ижил санаа). Олдохгүй мөр зураглалд ОРОХГҮЙ.
 */
/**
 * АВТОМАТААР НООРОГТ БУУЛГАСАН ИЛГЭЭЛТ (2026-09-29) — багц·төрөл бүрд сүүлийн `oid`.
 */
export const backSeenKey = (pkgKey: string, kind: string) => `selbe-huvaari-back:${kind}:${pkgKey}`;
export function backSeenGet(pkgKey: string, kind: string): number | null {
  try {
    const v = Number(localStorage.getItem(backSeenKey(pkgKey, kind)));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch { return null; }
}
export function backSeenSet(pkgKey: string, kind: string, oid: number): void {
  try { localStorage.setItem(backSeenKey(pkgKey, kind), String(oid)); } catch { /* хаалттай орчин */ }
}
/**
 * НЭМЭЛТ АЖЛЫН БУЦААЛТЫН МЭДЭГДЭЛ ХААСАН (2026-10-23, UX аудит P1) — багц бүрд хаасан илгээлтийн `oid`.
 */
export const AJ_BACK_HIDE_LS = (pkgKey: string) => `selbe-ajil-back-hide|${pkgKey}`;
export function ajBackHidden(pkgKey: string): number | null {
  try {
    const v = Number(localStorage.getItem(AJ_BACK_HIDE_LS(pkgKey)));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch { return null; }
}
export function hideAjBack(pkgKey: string, oid: number): void {
  try { localStorage.setItem(AJ_BACK_HIDE_LS(pkgKey), String(oid)); } catch { /* хаалттай орчин */ }
}
export type AddForm = { no: string; work: string; vol: string; unit: string };
export const EMPTY_FORM: AddForm = { no: '', work: '', vol: '', unit: '' };

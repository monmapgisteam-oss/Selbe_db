/**
 * НЭМЭЛТ АЖИЛ — түр ObjectID · localStorage ноорог · буцаалтын тэмдэг
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 */

import type { NewRow } from '@/modules/sheet/sheetFrame';

/* ══════════════════ НЭМЭЛТ АЖИЛ — түр ObjectID ба локал ноорог (2026-09-24) ══════════════════ */
/**
 * ⚠️ 2026-09-24 (хэрэглэгчийн шийдвэр): шинэ ажлын мөр НЭМЭХ нь «Гүйцэтгэл
 *    бөглөх»-өөс ЭНД шилжив. Бүлгийн мөрөн дээрх «+» → маягт (№ · Ажлын нэр ·
 *    Обьём · Нэгж өртөг) → `adds` → «Нэмэлт ажил батлуулах» (`submitAjil`) →
 *    батлагч `AjilBatlah`-д батлангуут `ajilApply.materializeAdds` үндсэн
 *    хүснэгтэд бүтэн жааз бичнэ → энэ хуудас `refetchServer`-ээр мөрийг
 *    серверээс авна. Батлагдтал мөр нь энд УЛААНААР, хуваарь тавигдахгүй.
 * ⚠️ `adds` нь ЗӨВХӨН энэ хөтчийн localStorage-д (`selbe-ajil-adds|<багц>`) —
 *    хуваалцсан ноорог (hd*) ба хуваарийн илгээлт (`PlanPayload`)-д ОРОХГҮЙ:
 *    тэд огноо/уялдааны тухай, энэ нь гэрээний хамрах хүрээний тухай (тусдаа
 *    2 шатат урсгал, `ajilBatlah.ts`-ийн ⚠️). Нийлүүлбэл «огноо батлагдсан»
 *    нь «шинэ ажил батлагдсан» гэж уншигдана.
 * ⚠️ `tmpOid`/`nextTmpOid`/`pushTmpOid` нь FillNew-ийн 2026-09-21-ний
 *    хувилбарын ХУУЛБАР (тэндхийнх хасагдсан): сөрөг, цагаас эхэлсэн тоолуур —
 *    ачаалалт бүр өөр цэгээс эхэлж, сэргээсэн мөрөөс доош түлхэгдэнэ; серверийн
 *    эерэг OID-тай хэзээ ч мөргөлдөхгүй (`ajilBatlah.parsePayload` сөрөг
 *    бүхэл тоог шаарддаг).
 */
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
 * ⚠️ localStorage-д: `adds` өөрөө тэнд хадгалагддаг тул хуудас дахин ачаалахад төлөв
 *    алдагдвал буулгасан мөрүүд «илгээгээгүй шинэ мөр» болж, илгээлт батлагдахад ДАВХАР
 *    мөр үүснэ.
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
 * Ирсэн мөрүүдийг (татсан · буцаагдсан) `adds`-д НИЙЛҮҮЛНЭ — FillNew-ийн
 * `mergeIncomingAdds`-ийн хуулбар: ижил мөр байвал алгасна, oid мөргөлдвөл
 * шинэ сул дугаар, тоолуурыг түлхэнэ.
 * ⚠️ `parentIdx`-ийг ч харьцуулна (2026-09-25 аудит): блок бүрд ижил нэртэй
 * эцэг бүлэг («10 · БУСАД АЖИЛ») байхад өөр бүлгийн доорх ижил №·нэртэй
 * хоёр мөрийн нэг нь татах/буцаахад чимээгүй алга болдог байв.
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
/*
 * ⚠️ ТҮЛХҮҮР = ӨВӨГ БҮЛГҮҮДИЙН ЗАМ + (№ ¦ нэр) (2026-09-25 аудит). Урьд нь зөвхөн
 *    (№ ¦ нэр) тул Bagts_1_9f-ийн ~60% давхардсан түлхүүрт А блокийн бүлэгт
 *    шинээр батлагдсан «3 · Хашаа» Б блокийн ижил нэртэй мөрийн ӨМНӨ орж, Б-гийн
 *    хадгалаагүй ноорог А-гийн шинэ мөр рүү зөөгддөг байв.
 * ⚠️ ИЖИЛ ЗАМ дотор шинэ мөр нэмэгдсэн бол (`insertAdds` бүлгийн ЭХЭНД оруулдаг)
 *    илүүдлийг ЭХНЭЭС нь алгасна — хуучин мөрүүд СҮҮЛИЙН хэсэгтэйгээ хосолно.
 */
/**
 * АВТОМАТААР НООРОГТ БУУЛГАСАН ИЛГЭЭЛТ (2026-09-29) — багц·төрөл бүрд сүүлийн `oid`.
 * ⚠️ Зөвхөн ЭНЭ хөтчид (localStorage): өөр төхөөрөмжид хаясан ноорог дахин нэг удаа
 *    бууж болно — хор багатай (хаяхад дахин тэмдэглэгдэнэ). Хаалттай орчинд чимээгүй.
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
export type AddForm = { no: string; work: string; vol: string; unit: string };
export const EMPTY_FORM: AddForm = { no: '', work: '', vol: '', unit: '' };

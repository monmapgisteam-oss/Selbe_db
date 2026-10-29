'use client';

import { subscribeLocale } from '@/lib/i18nCore';

/**
 * ӨГӨГДЛИЙН АВТОБУС — кэшлэгдсэн ачаалагчдыг ХҮСНЭГТЭЭР нь хүчингүй болгоно.
 *
 *   1. Хэрэглэгч «Гүйцэтгэл бөглөх» дээр нийтэлмэгц дашбоард дээрх тоо ХУУЧИН
 *      хэвээр үлддэг. Хуудсыг бүтнээр нь refresh хийж байж л шинэчлэгдэнэ.
 *   2. Ачаалагчдын TTL ЖИГД БИШ (`loadFinData` 5 мин, `loadBudget` хэзээ ч үгүй)
 *      тул нэг дэлгэц дээрх хоёр карт ӨӨР АГШНЫ тоо харуулж болно. Бүрэн
 *      хуучрахаас ДОР: аль нь үнэн болохыг хэрэглэгч мэдэхгүй.
 */

/**
 * Хүснэгтийн ТҮЛХҮҮР — `services.ts`-ийн экспортын нэртэй ИЖИЛ бичнэ.
 */
export type DataKey =
  | 'HO_IPC'
  | 'CASHFLOW_NEW'
  | 'BAGTS_SHEET'
  | 'BAGTS_NEGTGEL'
  | 'BUILDING'
  | 'PARCEL_LEFT'
  | 'SOURCE_FS'
  | 'HABEA'
  | 'HYANALT'
  | 'ZOVSHOOROL'
  | 'HUVAARI_BATLAH'  // Selbe_Huvaari_Batlah  — huvaariBatlah.ts
  | 'OBYEM_BATLAH'    // Selbe_Obyem_Batlah    — obyemBatlah.ts
  | 'AJIL_BATLAH'     // Selbe_Ajil_Batlah_csv — ajilBatlah.ts
  | 'HUVAARI_OBYEM'
  | 'TUSUL_NEGTGEL'
  | 'MATERIAL_NOOTS';

/** Бүртгэгдсэн кэш — `cached()` өөрийгөө энд нэмнэ */
type Slot = { drop: () => void; reads: readonly DataKey[] };
const SLOTS: Slot[] = [];

let version = 0;
const subs = new Set<() => void>();

let writes = 0;
/** Одоогийн бичилтийн үе — `query.shared` */
export function writeEpoch(): number {
  return writes;
}

/**
 * Кэшийг бүртгэнэ. `cached` дуудна — дуудагч кодод хэрэггүй.
 */
export function register(drop: () => void, reads: readonly DataKey[]): void {
  SLOTS.push({ drop, reads });
}

/**
 * Нэг буюу хэд хэдэн хүснэгтийг ХУУЧИРСАН гэж зарлана.
 *
 * Түүнээс уншдаг БҮХ кэш хаягдаж, дэлгэц дээрх дуудагчид дахин татна.
 * Бичих үйлдэл АМЖИЛТТАЙ болсны дараа л дуудна — амжилтгүй бичилтийн дараа
 * хүчингүй болговол сайн өгөгдлийг дэмий дахин татна.
 */
export function invalidate(...keys: DataKey[]): void {
  if (!keys.length) return;
  writes += 1;
  const want = new Set<string>(keys);
  let hit = 0;
  for (const s of SLOTS) {
    if (s.reads.some((k) => want.has(k))) { s.drop(); hit += 1; }
  }
  if (!hit) return;
  if (batchDepth > 0) { batchHit = true; return; }
  version += 1;
  for (const fn of subs) fn();
}

let batchDepth = 0;
let batchHit = false;
function endBatch(): void {
  batchDepth -= 1;
  if (batchDepth > 0 || !batchHit) return;
  batchHit = false;
  version += 1;
  for (const fn of subs) fn();
}
export function batchInvalidate<T>(fn: () => T): T {
  batchDepth += 1;
  let res: T;
  try {
    res = fn();
  } catch (e) {
    endBatch();
    throw e;
  }
  const thenable = res as unknown as { then?: unknown } | null;
  if (thenable && typeof thenable.then === 'function') {
    return (res as unknown as Promise<unknown>).then(
      (v) => { endBatch(); return v; },
      (e: unknown) => { endBatch(); throw e; },
    ) as unknown as T;
  }
  endBatch();
  return res;
}

let refreshedAt = Date.now();
export function dataRefreshedAt(): number {
  return refreshedAt;
}

let refreshSeq = 0;
export function refreshEpoch(): number {
  return refreshSeq;
}

/**
 * БҮХ кэшийг хаяна — нэвтрэлт/хэл солигдох, мөн (2026-10-05) хэрэглэгчийн «Шинэчлэх»
 * товч ба таб удаан нуугдаад буцаж ирэх үед (`Portal`).
 */
export function invalidateAll(): void {
  writes += 1;
  for (const s of SLOTS) s.drop();
  refreshedAt = Date.now();
  refreshSeq += 1;
  if (batchDepth > 0) { batchHit = true; return; }
  version += 1;
  for (const fn of subs) fn();
}

/**
 * Хэл солих нь 2026-09-30-наас хуудсыг ДАХИН АЧААЛАХГҮЙ — `LocaleProvider` аппыг
 * `key`-ээр remount хийдэг (`i18nCore.LOCALE_SWITCH_RELOADS`). Remount нь МОДУЛИЙН
 * кэшийг хөндөхгүй, гэтэл олон ачаалагч ОРЧУУЛСАН мөрийг үр дүндээ хадгалдаг
 * (`live.loadBudget`-ийн «Эх үүсвэр задраагүй» · «Төрөл тодорхойлоогүй»,
 * `ceo/*`-ийн KPI карт: `facts` · `unit` · хүснэгтийн гарчиг …). Тиймээс англи
 * руу шилжсэний дараа эдгээр нь TTL дуустал (зарим нь сешн дуустал) МОНГОЛООРОО
 * үлдэж, нэг дэлгэцэд хоёр хэл холилддог байв. Урьд reload бүх кэшийг устгадаг
 * байсантай ижил үр дүн: бүртгэлтэй кэш бүр хаягдаж дахин татагдана.
 */
subscribeLocale(invalidateAll);

/** Одоогийн хувилбар — `useAsync` үүнийг deps-дээ авна */
export function dataVersion(): number {
  return version;
}

/** Хувилбар өөрчлөгдөхөд дуудагдана; тайлах функц буцаана */
export function subscribeData(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

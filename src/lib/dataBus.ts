'use client';

import { subscribeLocale } from '@/lib/i18nCore';

/**
 * ӨГӨГДЛИЙН АВТОБУС — кэшлэгдсэн ачаалагчдыг ХҮСНЭГТЭЭР нь хүчингүй болгоно.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ. `cached()` нь амжилттай амлалтыг сесс дуустал
 * хадгалдаг (эсвэл TTL хүртэл). Тэр нь харагдац хооронд шилжихэд бүтэн
 * хүснэгтийг дахин татахгүйн тулд зориудаар хийгдсэн — гэвч ХОЁР зүйлийг
 * эвдсэн:
 *
 *   1. Хэрэглэгч «Гүйцэтгэл бөглөх» дээр нийтэлмэгц дашбоард дээрх тоо ХУУЧИН
 *      хэвээр үлддэг. Хуудсыг бүтнээр нь refresh хийж байж л шинэчлэгдэнэ.
 *   2. Ачаалагчдын TTL ЖИГД БИШ (`loadFinData` 5 мин, `loadBudget` хэзээ ч үгүй)
 *      тул нэг дэлгэц дээрх хоёр карт ӨӨР АГШНЫ тоо харуулж болно. Бүрэн
 *      хуучрахаас ДОР: аль нь үнэн болохыг хэрэглэгч мэдэхгүй.
 *
 * ⚠️ ЯАГААД ХҮСНЭГТЭЭР, АЧААЛАГЧААР БИШ ВЭ. «`loadBudget`-ыг хүчингүй болго»
 * гэж бичвэл шинэ ачаалагч нэмэгдэх бүрд бичих код тал бүрд хоцорно. Ачаалагч
 * өөрөө «би энэ хүснэгтээс уншина» гэж зарлаж, бичих тал «би энэ хүснэгтийг
 * өөрчиллөө» гэж хэлбэл зураглал өөрөө тэнцвэрээ хадгална.
 *
 * ⚠️ ЯАГААД ТУСДАА МОДУЛЬ ВЭ. `live.ts` (ачаалагчид) ба `useAsync.ts` (React)
 * хоёулаа үүнээс уншина. Аль нэгэнд нь тавибал модулийн мөчлөг үүснэ.
 */

/**
 * Хүснэгтийн ТҮЛХҮҮР — `services.ts`-ийн экспортын нэртэй ИЖИЛ бичнэ.
 *
 * ⚠️ Чөлөөт мөр биш нэгдмэл төрөл: буруу бичсэн нэр чимээгүй үл тоомсорлогдож,
 * «хүчингүй болголоо» гэж бодсон карт хуучин тоогоо барих нь хамгийн муу
 * төрлийн алдаа — дэлгэц дээр юу ч анзаарагдахгүй.
 */
export type DataKey =
  /* ⚠️ 2026-09-09: 'IPC_LOG' (ipc_0813/172) ХАСАГДАВ — хэрэглэгч тэр
     үйлчилгээг ТЕСТ ӨГӨГДӨЛ гэж тогтоов. Орлуулагч нь 'HO_IPC'
     (HO_guitsetgel_arcgis_csv/196) — services.ts-ийн экспортын нэртэй ИЖИЛ. */
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
  /* ⚠️ 2026-09-30: УРСГАЛЫН ХҮСНЭГТҮҮД — урьд нь автобусад ОГТ байгаагүй тул чанар ·
     хуваарь · обьём · нэмэлт ажил · QAQC-ийн нооргийн бичилт ямар ч кэшийг хүчингүй
     болгодоггүй байв (цэсний тэмдэг 3 мин хүртэл хуучин). Нэр нь хүснэгтийн item-ийн
     гарчигтай (`Selbe_*`) тохирно — `services.ts`-д экспорт байхгүй (өөрөө үүсгэдэг). */
  | 'HUVAARI_BATLAH'  // Selbe_Huvaari_Batlah  — huvaariBatlah.ts
  | 'OBYEM_BATLAH'    // Selbe_Obyem_Batlah    — obyemBatlah.ts
  | 'AJIL_BATLAH'     // Selbe_Ajil_Batlah_csv — ajilBatlah.ts
  | 'QAQC_DRAFT'      // Selbe_QAQC_Draft      — qaqcDraftRemote.ts
  /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ХУВААРИЙН САРЫН ОБЬЁМ (`huvaari_20260906/193`,
     `huvaariObyem.HUVAARI_OBYEM` — `services.ts`-д экспорт байхгүй). `applyPlanEdits`
     бичсэний дараа хүчингүй болгоно — төлөвлөгөөт муруй (`planProgress`) уншина. Урьд нь
     зөвхөн обьём өөрчилсөн батлалтын дараа муруй/дашбоард TTL дуустал хуучин байв. */
  | 'HUVAARI_OBYEM'
  /* ⚠️ 2026-10-15: НЭГТГЭЛ ГҮЙЦЭТГЭЛ (`Negtgel_guitsetgel_1013`) — табын «Нийтлэх»-ийн дараа
     (`negtgelEdit.publishNegEdits`); `loadNegtgelFull` (таб · дашбоард · тайлан) хүчингүй болно. */
  | 'TUSUL_NEGTGEL'
  /* ⚠️ 2026-10-21: МАТЕРИАЛЫН НӨӨЦ (`material_noots`) — `materialNoots.syncNoots` бичсэний дараа */
  | 'MATERIAL_NOOTS';
  /* ⚠️ 'SURVEY' 2026-09-17-нд хасагдсан — selbe_site_monitoring туршилт төслөөс гарсан */

/** Бүртгэгдсэн кэш — `cached()` өөрийгөө энд нэмнэ */
type Slot = { drop: () => void; reads: readonly DataKey[] };
const SLOTS: Slot[] = [];

let version = 0;
const subs = new Set<() => void>();

/**
 * ⚠️ 2026-10-06 (аудит): БИЧИЛТИЙН ҮЕ — `invalidate` (хүснэгт тааралгүй ч) ба `invalidateAll`
 *    бүрд өснө. `query.ts`-ийн явагдаж буй ижил хүсэлтийн нэгтгэл (`shared`) түлхүүртээ үүнийг
 *    оруулдаг: бичилтээс ӨМНӨ эхэлсэн уншилт (хуучин өгөгдөл) бичилтийн ДАРАА ирсэн дуудагчид
 *    хуваалцагдахгүй. `version`-оос ТУСДАА: тэр нь зөвхөн кэш хаягдсан үед өсөж React-ийг
 *    дахин зуруулдаг; энэ нь зөвхөн хүсэлтийн нэгтгэлд (мэдэгдэлгүй).
 */
let writes = 0;
/** Одоогийн бичилтийн үе — `query.shared` */
export function writeEpoch(): number {
  return writes;
}

/**
 * Кэшийг бүртгэнэ. `cached()` дуудна — дуудагч кодод хэрэггүй.
 *
 * ⚠️ `reads` хоосон бол тэр кэш ХЭЗЭЭ Ч хүчингүй болохгүй (жишээ нь давхаргын
 * каталог — бүтэц нь ажиллах үед өөрчлөгддөггүй). Санамсаргүй хоосон орхихоос
 * сэргийлж дуудагч талд ил бичнэ.
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
  /* ⚠️ 2026-10-12 (дарааллын аудит): бүлгийн дотор — мэдэгдлийг хойшлуулна (`batchInvalidate`-ийн ⚠️) */
  if (batchDepth > 0) { batchHit = true; return; }
  version += 1;
  for (const fn of subs) fn();
}

/**
 * ⚠️ 2026-10-12 (дарааллын аудит): ХҮЧИНГҮЙ БОЛГОЛТЫГ БҮЛЭГЛЭХ — `fn` дотор дуудагдсан `invalidate`-уудын
 *    ЗАХИАЛАГЧИЙН МЭДЭГДЛИЙГ (`version` +1 · `subs`) бүлэг дуустал хойшлуулж, төгсгөлд НЭГ удаа тараана.
 *    ЯАГААД: эцсийн батлалтын гинж (`hyanaltStore.apply`: архив → төлөв → нэгтгэл → IPC → markRegistered)
 *    `HYANALT` · `BAGTS_SHEET` · `BAGTS_NEGTGEL` · `HO_IPC` (×2–3) гэж 5–7 удаа хүчингүй болгодог тул
 *    `useAsync`-ийн бүх дуудагч тэр бүрд дахин зурагдаж, дахин татаж байв (нэг батлалтад дашбоардын
 *    картууд 5–7 удаа). Одоо нэг удаа.
 * ⚠️ СЛОТЫН ХАЯЛТ (`drop`) БА БИЧИЛТИЙН ҮЕ (`writes`) ХОЙШЛОХГҮЙ — ШУУД. Гинжний дотор дараагийн алхам
 *    өмнөх бичилтийн хүснэгтээс УНШДАГ (`registerApproved` → `summaryOf` архивын шинэ жаазыг;
 *    `syncIpcFromFill` → HO-гийн мөрүүдийг): кэшийг хойшлуулж хаявал тэр уншилт ХУУЧИН амлалтыг авч,
 *    `query.shared` нь бичилтээс өмнө эхэлсэн уншилтыг хуваалцана. Тиймээс зөвхөн React-ийн мэдэгдэл
 *    нэгтгэгдэнэ — өгөгдлийн зөв байдал бүлэггүй үеийнхтэй ЯГ ижил.
 * ⚠️ ҮҮРЛЭСЭН бүлэг дэмжинэ (`batchDepth`); хамгийн гадна талынх дуусахад л тараана. `fn` шидсэн / амлалт
 *    унасан ч `finally`-д тараана — эс бөгөөс хаягдсан кэш мэдэгдэлгүй үлдэж дэлгэц хуучин тоогоо барина.
 * ⚠️ `fn` амлалт буцаавал бүлэг амлалт шийдэгдтэл үргэлжилнэ; энэ хооронд ӨӨР газраас дуудагдсан
 *    `invalidate` ч мөн хойшлогдоно (модулийн нэг тоолуур) — хэдэн секундын саатал, алдагдахгүй.
 */
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

/**
 * ⚠️ 2026-10-05: БҮХ өгөгдөл сүүлд БҮТНЭЭР шинэчлэгдсэн агшин (epoch мс) — эхэндээ сешн
 *    эхэлсэн цаг. `Portal`-ын толгойн «Өгөгдөл: HH:MM» үүнийг харуулна; `invalidateAll` л өсгөнө
 *    (нэг хүснэгтийн `invalidate` нь бусад кэшийг хөндөхгүй тул «бүгд шинэ» гэж хэлэхгүй).
 */
let refreshedAt = Date.now();
export function dataRefreshedAt(): number {
  return refreshedAt;
}

/**
 * ⚠️ 2026-10-19 (review): БҮТЭН ШИНЭЧЛЭЛТИЙН ҮЕ — зөвхөн `invalidateAll` өсгөнө. `reads` хоосон (статик) кэштэй хүнд
 *    тооцоонууд (`hesegChange` · `hesegNeed` · `planOverlap`) зөвхөн тэр үед хаягддаг тул тэдний самбар `dataVersion`
 *    (хүснэгт бүрийн `invalidate`) биш үүнийг `useSyncExternalStore`-д авна — эс бөгөөс хамааралгүй бичилт бүрд дахин
 *    захиалж зурагддаг байв.
 */
let refreshSeq = 0;
export function refreshEpoch(): number {
  return refreshSeq;
}

/**
 * БҮХ кэшийг хаяна — нэвтрэлт/хэл солигдох, мөн (⚠️ 2026-10-05) хэрэглэгчийн «Шинэчлэх»
 * товч ба таб удаан нуугдаад буцаж ирэх үед (`Portal`).
 */
export function invalidateAll(): void {
  writes += 1;
  for (const s of SLOTS) s.drop();
  refreshedAt = Date.now();
  refreshSeq += 1;
  /* ⚠️ 2026-10-12 (дарааллын аудит): бүлгийн дотор — мэдэгдлийг хойшлуулна (`batchInvalidate`-ийн ⚠️) */
  if (batchDepth > 0) { batchHit = true; return; }
  version += 1;
  for (const fn of subs) fn();
}

/**
 * ⚠️ 2026-09-30: ХЭЛ СОЛИГДОХОД БҮХ КЭШ ХАЯГДАНА.
 *
 * Хэл солих нь 2026-09-30-наас хуудсыг ДАХИН АЧААЛАХГҮЙ — `LocaleProvider` аппыг
 * `key`-ээр remount хийдэг (`i18nCore.LOCALE_SWITCH_RELOADS`). Remount нь МОДУЛИЙН
 * кэшийг хөндөхгүй, гэтэл олон ачаалагч ОРЧУУЛСАН мөрийг үр дүндээ хадгалдаг
 * (`live.loadBudget`-ийн «Эх үүсвэр задраагүй» · «Төрөл тодорхойлоогүй»,
 * `ceo/*`-ийн KPI карт: `facts` · `unit` · хүснэгтийн гарчиг …). Тиймээс англи
 * руу шилжсэний дараа эдгээр нь TTL дуустал (зарим нь сешн дуустал) МОНГОЛООРОО
 * үлдэж, нэг дэлгэцэд хоёр хэл холилддог байв. Урьд reload бүх кэшийг устгадаг
 * байсантай ижил үр дүн: бүртгэлтэй кэш бүр хаягдаж дахин татагдана.
 * ⚠️ `live.cached()` `reads` хоосон кэшийг ч бүртгэдэг болсон (2026-09-30) — бүгд хамрагдана;
 *    `invalidate(key)` тэднийг хөндөхгүй (хоосон `reads`).
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

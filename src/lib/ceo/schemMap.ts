/**
 * CEO-ГИЙН ҮЗҮҮЛЭЛТ → ҮЙЛ АЖИЛЛАГААНЫ СХЕМИЙН ЗАНГИЛАА.
 */
import type { FineId } from '@/lib/schemFine';

/**
 * Үзүүлэлтийн түлхүүр (`registry.ts`-ийн `key`) → нарийн схемийн зангилаа.
 *
 * Байршуулалтын шалтгаанууд:
 *   variance     → `bar`      обьём хэтрэлт нь БӨГЛӨЛТӨӨС гардаг (хяналт нь
 *                             түүнийг барих ёстой шат, гэхдээ үүсэх газар нь
 *                             барилга угсралтын гүйцэтгэл)
 *   schedule     → `huv`      төлөвлөсөн ба бодит гүйцэтгэлийн зөрүү нь
 *                             ХУВААРИЙН эсрэг хэмжигддэг
 *   review       → `hyCo`     хяналтын гинжний ҮНДЭС (`GROUP_ROOT.hyanalt`)
 *                             — буцаагдсан ажил энд эргэж ирдэг
 *   qaqc         → `barOk`    баримт нь ТАЙЛАГНАСАН блокт бүрдэх ёстой
 *   land         → `gazLeft`  «үлдсэн талбар» — чөлөөлөгдөөгүй нь асуудал
 *   permits      → `zovWait`  хүлээгдэж буй ба татгалзсаныг НЭГ карт хэлнэ;
 *                             хүлээгдэж буй нь илүү түгээмэл тул тэнд
 *   safety       → `habInc`   осол, зөрчил
 *   workforce    → `hab`      хүн хүч, техник
 *   contractGap  → `finContract`  гэрээ ба төсвийн зөрүү
 *   uncontracted → `finContract`  гэрээ БАЙГУУЛАГДААГҮЙ ажил — мөн гэрээний карт
 *   ipc          → `finPaid`  олгосон санхүүжилт нь IPC актаар
 *   suitability  → `plan`     тохиромжтой байдал нь ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨНИЙ
 *                             нормын биелэлт — төслийн эхлэлд
 *   iot          → `ers`      IoT босго хэтрэлт нь эрсдэлийн дохио
 */
export const KPI_FINE: Record<string, FineId> = {
  suitability: 'plan',
  permits: 'zovWait',
  land: 'gazLeft',
  schedule: 'huv',
  variance: 'bar',
  iot: 'ers',
  workforce: 'hab',
  safety: 'habInc',
  review: 'hyCo',
  contractGap: 'finContract',
  uncontracted: 'finContract',
  ipc: 'finPaid',
};

/**
 * Зангилаа → түүн дээр гарах үзүүлэлтүүд, ДАРААЛЛААР.
 */
export function kpisAt(node: FineId): string[] {
  return Object.entries(KPI_FINE).filter(([, v]) => v === node).map(([k]) => k);
}

/** Тухайн үзүүлэлт схемийн аль зангилаанд байрлах вэ (байхгүй бол `undefined`) */
export const fineOf = (key: string): FineId | undefined => KPI_FINE[key];

/**
 * Харагдацын ӨӨРИЙН тайлангийн эх (2026-10-19).
 *
 * ⚠️ Ерөнхий тайлан (`viewReport`) нь дэлгэцийн DOM-оос уншдаг. Өгөгдөл нь жагсаалт/урсгал
 *    хэлбэртэй харагдац (Гүйцэтгэл) дээр DOM-оос гарсан мөрүүд тасархай, утгагүй болдог тул
 *    тухайн модуль энд өөрийн угсрагчийг бүртгэнэ — тайлан DOM-ын оронд үүнийг ашиглана.
 * ⚠️ Модуль unmount болоход бүртгэл ЗААВАЛ арилна (`setReportSource`-ийн буцаах функц) —
 *    эс бөгөөс өөр харагдацын тайланд хуучин өгөгдөл орно.
 */

import type { DocBlock } from './docx';

export type ReportSource = {
  /** Асинхрон байж болно — газрын зургийн агшин (Тохиромжтой байдал) */
  blocks: () => DocBlock[] | Promise<DocBlock[]>;
  /** Модулийн дотоод шүүлт (багц, компани, төлөв, хайлт) — толгойн «Шүүлтийн нөхцөл»-д нэмнэ */
  filters?: () => string[];
  /** Дэлгэцийн газрын зургийн агшин зургийг тайлангийн эхэнд оруулах (Тохиромжтой байдал — 2026-10-19, «зураг оруул») */
  map?: boolean;
};

const sources = new Map<string, ReportSource>();

export function setReportSource(key: string, src: ReportSource): () => void {
  sources.set(key, src);
  return () => { if (sources.get(key) === src) sources.delete(key); };
}

export const reportSource = (key: string): ReportSource | undefined => sources.get(key);

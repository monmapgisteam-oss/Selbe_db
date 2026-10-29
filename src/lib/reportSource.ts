/**
 * Харагдацын ӨӨРИЙН тайлангийн эх (2026-10-19).
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

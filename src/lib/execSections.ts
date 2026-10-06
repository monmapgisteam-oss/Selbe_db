/**
 * УДИРДЛАГЫН ТАЙЛАНГИЙН ХЭСГҮҮД — дэлгэц (`ExecReport.tsx`) ба PDF (`execPdf.ts`)-ийн ГАНЦ жагсаалт.
 *
 * ⚠️ 2026-10-06 (аудит): урьд нь дэлгэц 1–5 (Ерөнхий үзүүлэлт · Багцын гүйцэтгэл · Багцын
 *    санхүү · Зөвшөөрөл · Дүгнэлт), PDF 1–6 (газар чөлөөлөлт тусдаа хэсэг) өөр гарчигтай байсан
 *    тул «3-р хэсэг» гэж ярихад хоёр өөр зүйл заадаг байв. Одоо дугаар ба гарчиг ЭНДЭЭС —
 *    дараалал өөрчлөгдвөл хоёулаа дагана. Хавсралт дугааргүй (жагсаалтын ДАРАА).
 * ⚠️ Гарчгийг ЗУРАГДАХ агшинд (`tr`) — модулийн түвшинд дуудвал хэл солиход хоцорно.
 */
import { t as tr } from '@/lib/i18nCore';

export type ExecSectionKey = 'overview' | 'land' | 'prog' | 'fin' | 'zov' | 'summary';

const ORDER: readonly ExecSectionKey[] = ['overview', 'land', 'prog', 'fin', 'zov', 'summary'];

export function execSectionTitle(k: ExecSectionKey): string {
  if (k === 'overview') return tr('Төслийн ерөнхий байдал');
  if (k === 'land') return tr('Газар чөлөөлөлт ба талбайн бэлтгэл');
  if (k === 'prog') return tr('Орон сууцны багцуудын биет гүйцэтгэл');
  if (k === 'fin') return tr('Багцуудын санхүүжилт');
  if (k === 'zov') return tr('Зөвшөөрөл ба тусгай зөвшөөрлүүд');
  return tr('Дүгнэлт ба зөвлөмж');
}

/** Хэсгийн дугаар (1-ээс) */
export const execSectionNo = (k: ExecSectionKey): number => ORDER.indexOf(k) + 1;

/** Бүх хэсэг дарааллаар — агуулга (TOC) ба гарчигт */
export const execSections = (): { key: ExecSectionKey; no: number; title: string }[] =>
  ORDER.map((key, i) => ({ key, no: i + 1, title: execSectionTitle(key) }));

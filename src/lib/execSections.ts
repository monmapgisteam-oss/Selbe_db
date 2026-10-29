/**
 * УДИРДЛАГЫН ТАЙЛАНГИЙН ХЭСГҮҮД — дэлгэц (`ExecReport.tsx`) ба PDF (`execPdf.ts`)-ийн ГАНЦ жагсаалт.
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

/**
 * IPC БАРИМТЫН ХҮСНЭГТИЙН УНШИЛТ (2026-11-23) — `Guitsetgel_talbe/238` «ipc». Логик нь `ipcDocTable.ts`-д (цэвэр).
 */
import { IPC_DOC } from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { cached } from '@/lib/live';
import type { Row } from '@/lib/ipcDocTable';

/** Бүх мөр — кэш 60 с (`loadHoRows`-той ижил), бичилтийн дараа `invalidate('IPC_DOC')` */
export const loadIpcDocs = cached(
  () => queryFeatures(IPC_DOC.url, { outFields: ['*'], orderBy: `${IPC_DOC.oid} ASC` }) as Promise<Row[]>,
  60_000,
  ['IPC_DOC'],
);

/** Нэг гэрээний мөрүүдийг сервероос ШИНЭЭР — бичихийн өмнө, өөр хэрэглэгчийн өөрчлөлтийг харахын тулд */
export const freshDocs = (code: string): Promise<Row[]> => (code
  ? queryFeatures(IPC_DOC.url, {
    where: `${IPC_DOC.fields.code} = N'${code.replace(/'/g, "''")}'`,
    outFields: ['*'],
    orderBy: `${IPC_DOC.oid} ASC`,
  }) as Promise<Row[]>
  : Promise.resolve([]));

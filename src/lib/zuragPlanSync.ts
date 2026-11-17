/**
 * ЗУРГИЙН БҮРТГЭЛ → «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН ХҮСНЭГТ (2026-11-17).
 *
 * Хэрэглэгч: «бичих ёстой» — ТЭЗҮ · Ажлын зураг төслийн хэсгийн мөрүүд (бүлэг → дэд бүлэг → баримт) зөвхөн дэлгэцэд биш,
 * хүснэгтэд (`Guitsetgel_talbe/182`) БИЧИГДЭНЭ. Бүртгэл өөрчлөгдөх бүрд (төлөв, засвар, нэмэх) энэ дуудагдаж, хүснэгтийг
 * бүртгэлтэй тааруулна. Юу бичихийг `zuragPlan.registryPlanEdits` (цэвэр) шийднэ.
 */
import { applyAll } from './tableWrite';
import { invalidate } from './dataBus';
import { CASHFLOW_NEW } from './services';
import { fetchPlanRows } from './projectPlanInputs';
import { loadZuragBurtgel } from './zuragBurtgel';
import { registryPlanEdits } from './zuragPlan';

/** Хүснэгтийг бүртгэлтэй тааруулна; бичигдсэн мөрийн тоо (0 = таарч байсан) */
export async function syncZuragPlan(): Promise<number> {
  const [rows, z] = await Promise.all([fetchPlanRows(), loadZuragBurtgel()]);
  const e = registryPlanEdits(rows, z);
  const n = e.adds.length + e.updates.length + e.deletes.length;
  if (!n) return 0;
  await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, {
    adds: e.adds,
    updates: e.updates.map(({ objectid, ...a }) => ({ [CASHFLOW_NEW.oid]: objectid, ...a })),
    deletes: e.deletes,
  }, { cap: 'zuragEdit' });
  invalidate('CASHFLOW_NEW');
  return n;
}

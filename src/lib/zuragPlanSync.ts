/**
 * ЗУРГИЙН БҮРТГЭЛ → «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН ХҮСНЭГТ (2026-11-17).
 *
 * Хэрэглэгч: «бичих ёстой» — ТЭЗҮ · Ажлын зураг төслийн хэсгийн мөрүүд (бүлэг → дэд бүлэг → баримт) зөвхөн дэлгэцэд биш,
 * хүснэгтэд (`Guitsetgel_talbe/182`) БИЧИГДЭНЭ. Бүртгэл өөрчлөгдөх бүрд (төлөв, засвар, нэмэх) энэ дуудагдаж, хүснэгтийг
 * бүртгэлтэй тааруулна. Юу бичихийг `zuragPlan.registryPlanEdits` (цэвэр) шийднэ.
 */
import { useEffect } from 'react';
import { hasCap } from './caps';
import { currentUser } from './who';
import { withTabLock } from './tabLock';
import { applyAll } from './tableWrite';
import { invalidate } from './dataBus';
import { CASHFLOW_NEW } from './services';
import { fetchPlanRows } from './projectPlanInputs';
import { loadZuragBurtgel } from './zuragBurtgel';
import { registryDupDeletes, registryPlanEdits } from './zuragPlan';

/** Хүснэгтийг бүртгэлтэй тааруулна; `n` — бичигдсэн мөр (0 = таарч байсан), `held` — гэрээ/төлбөртэй тул устгаагүй мөр */
export function syncZuragPlan(): Promise<{ n: number; held: number }> {
  /* 2026-11-20 (аудит): хоёр таб зэрэг хадгалбал давхар мөр нэмэгддэг байв — ээлжлүүлнэ */
  return withTabLock('zuragPlan', syncZuragPlanNow);
}

/**
 * НЭЭГДЭХЭД НЭГ УДАА (2026-11-20, аудит: «Зургийн бүртгэл»-ийн синк зөвхөн зураг хадгалах үед ажилладаг тул бүртгэлийн
 * өөрчлөлт хэн нэг нь зураг хадгалах хүртэл «Төсөл төлөвлөгөө биелэлт»-д ордоггүй байв). «Зургийн бүртгэл» засах эрхтэй
 * хэрэглэгчийн хөтөч портал нээгдэхэд нэг удаа тааруулна; зөрүүгүй бол юу ч бичихгүй.
 */
export function useZuragPlanSync(on: boolean): void {
  useEffect(() => {
    if (!on || !hasCap(currentUser(), 'zuragEdit')) return;
    const t = setTimeout(() => { void syncZuragPlan().catch((e) => console.warn('[selbe] зургийн бүртгэлийн синк амжилтгүй', e)); }, 9_000);
    return () => clearTimeout(t);
  }, [on]);
}

async function syncZuragPlanNow(): Promise<{ n: number; held: number }> {
  const [rows, z] = await Promise.all([fetchPlanRows(), loadZuragBurtgel()]);
  const e = registryPlanEdits(rows, z);
  const n = e.adds.length + e.updates.length + e.deletes.length;
  const held = e.held.length;
  if (!n) return { n: 0, held };
  const made = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, {
    adds: e.adds,
    updates: e.updates.map(({ objectid, ...a }) => ({ [CASHFLOW_NEW.oid]: objectid, ...a })),
    deletes: e.deletes,
  }, { cap: 'zuragEdit' });
  let dup = 0;
  /* 2026-11-24 (аудит): таб түгжээ өөр компьютер / CI-ийн синкт үйлчлэхгүй — нэмсний ДАРАА дахин уншиж, зэрэг нэмэгдсэн ижил мөр
     (бага objectid) байвал өөрийнхөө мөрийг устгана. Уншилт унавал дараагийн синкээр */
  if (e.adds.length && made.oids.length) {
    try {
      const del = registryDupDeletes(await fetchPlanRows(), made.oids);
      if (del.length) { await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { deletes: del }, { cap: 'zuragEdit' }); dup = del.length; }
    } catch (err) {
      console.warn('[selbe] зургийн бүртгэлийн синк: давхардлын шалгалт унав', err);
    }
  }
  invalidate('CASHFLOW_NEW');
  return { n: n - dup, held };
}

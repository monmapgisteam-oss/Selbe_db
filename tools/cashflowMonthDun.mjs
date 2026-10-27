/**
 * `cashflow-import.mjs`-ийн ЦЭВЭР туслах — гэрээний `ho_dun_geree` өөрчлөгдөхөд ҮЛДЭХ сарын мөрийн `cashflow_dun`-ийг дахин
 * бодно (2026-10-26).
 *
 * ⚠️ ЯАГААД: импорт мөнгөний мөрд Excel-ийн өртгийг (`ho_dun_geree`) бичдэг ч сарын мөрийн `cashflow_dun`
 *    (= `cashflow_huwi` × ХО дүн ÷ 100) хөндөгддөггүй байв. Ерөнхий дашбоард · ТУХ-ын төлөвлөгөөт муруй (`cashflowCurve`)
 *    `cashflow_dun`-ийг шууд нийлүүлдэг тул импортын дараа ХУУЧИН ₮-ээр зурагдаж, бүртгэлд хувь ба дүн зөрдөг. Порталын
 *    нийтлэл энэ дүнг `financePublish.recomputeFinanceAmounts`-аар бодно — ЭНД ЯГ ТЭР дүрэм:
 *      · ХО дүн ≤ 0 / null / тоо биш → дүн `null` (`costOf`);
 *      · хувь null/хоосон → дүн `null` (0 БИШ — «мэдээлэлгүй» ≠ «тэг»);
 *      · дугуйлахгүй (порталынхтай ижил).
 */

/** `recomputeFinanceAmounts.costOf`-ийн дүрэм */
const costOf = (raw) => {
  const v = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(v) && v > 0 ? v : null;
};
/** `recomputeFinanceAmounts.amountOf`-ийн дүрэм */
const amountOf = (pct, cost) => {
  const v = Number(pct);
  return pct == null || String(pct).trim() === '' || !Number.isFinite(v) || cost == null ? null : (cost * v) / 100;
};
const same = (a, b) => (a == null || b == null ? a == null && b == null : Math.abs(Number(a) - Number(b)) < 1e-6);

/**
 * @param updates `[{ r: системийн мөнгөний мөр, a: бичих attrs }]` — `a.ho_dun_geree` нь шинэ өртөг
 * @param months  системийн сарын мөрүүд (`cashflow_start != null`)
 * @param skip    устгагдах сарын мөрийн OID (тэднийг хөндөхгүй)
 * @returns `[{ objectid, cashflow_dun, old, id }]` — зөвхөн дүн нь ӨӨРЧЛӨГДӨХ мөр
 */
export function monthDunFixes(updates, months, skip = new Set()) {
  const byId = new Map();
  for (const m of months) {
    if (m.cashflow_id == null || skip.has(m.objectid)) continue;
    const l = byId.get(m.cashflow_id);
    if (l) l.push(m); else byId.set(m.cashflow_id, [m]);
  }
  const out = [];
  for (const u of updates) {
    const id = u.r?.cashflow_id;
    if (id == null || !('ho_dun_geree' in u.a)) continue;
    const cost = costOf(u.a.ho_dun_geree);
    if (cost === costOf(u.r.ho_dun_geree)) continue;
    for (const m of byId.get(id) ?? []) {
      const dun = amountOf(m.cashflow_huwi, cost);
      if (same(dun, m.cashflow_dun)) continue;
      out.push({ objectid: m.objectid, cashflow_dun: dun, old: m.cashflow_dun ?? null, id });
    }
  }
  return out;
}

/**
 * `cashflow-import.mjs`-ийн ЦЭВЭР туслах — Excel-ийн «Төсөл төлөвлөгөө биелэлт сараар» хуудасны ХУРИМТЛАЛ (0–1)
 * → системийн САРЫН мөр (`cashflow_huwi` 0–100 · `cashflow_dun` ₮) (2026-10-27).
 *
 * ⚠️ ДҮРЭМ (хэрэглэгчийн шийдвэр «Excel-тэй яг адилхан»):
 *    · сарын хувь = (тэр сарын хуримтлал − өмнөх хамгийн их хуримтлал) × 100 — Excel хуримтлал, систем сар тутмын
 *      хувь (`cashflow_huwi`, гэрээ бүрд нийлбэр = Excel-ийн эцсийн хуримтлал × 100);
 *    · ЭХНИЙ сар (2026-08) = тэр сарын хуримтлал бүхэлдээ (0-ээс) — Excel-д 2026-08-аас өмнөх багана БАЙХГҮЙ тул өмнөх
 *      түүх тэр сард нийлнэ; 2026-08-аас өмнөх системийн сарын мөр Excel хамарсан гэрээнд УСТНА;
 *    · БУУРСАН хуримтлал (Excel-ийн алдаа, жиш. мөр 877: 2026-12 0.2 → 2027-01 0) → тэр сарын хувь 0, `clamps`-д
 *      жагсаана. Дараагийн саруудыг ӨМНӨХ ХАМГИЙН ИХ утгаас тооцно — эс бөгөөс буурсан хэсэг дахин нэмэгдэж нийлбэр
 *      100-аас давна (877: 20 + 10 + 20 … = 120%);
 *    · ХООСОН нүд → тэр сард мөр ҮҮСЭХГҮЙ (null ≠ 0 — «мэдээлэлгүй» сарыг 0% гэж бичихгүй); тоон 0 → 0 хувьтай мөр;
 *    · дүн = хувь × ХО дүн ÷ 100 — порталын `financePublish.recomputeFinanceAmounts`-ийн ЯГ дүрэм (ХО ≤ 0 / null →
 *      дүн null; дугуйлахгүй).
 * ⚠️ Сарын мөрийн огноо — порталын бичилтийн конвенц (`Finance.huvMonthRows`): эхлэл = сарын 1-ний UTC 12:00,
 *    төгсгөл = сарын сүүлийн өдрийн UTC 12:00 (`gdash.cfStartKeyOf` орон нутгийн сараар уншина).
 */

/** `recomputeFinanceAmounts.costOf`-ийн дүрэм */
export const costOf = (raw) => {
  const v = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(v) && v > 0 ? v : null;
};
/** `recomputeFinanceAmounts.amountOf`-ийн дүрэм */
export const amountOf = (pct, cost) => {
  const v = Number(pct);
  return pct == null || String(pct).trim() === '' || !Number.isFinite(v) || cost == null ? null : (cost * v) / 100;
};

/** «YYYY-MM» — `first`-ээс эхлэн `n` сар */
export function monthKeys(first, n) {
  const [y0, m0] = first.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const k = y0 * 12 + (m0 - 1) + i;
    out.push(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Толгой «2026 он 8-р сар» · «2028 оны 1-р сар» → «2026-08»; танигдахгүй бол null */
export function parseMonthHeader(text) {
  const m = String(text ?? '').match(/(\d{4})\s*он\S*\s*(\d{1,2})\s*-?\s*р?\s*сар/u);
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${m[1]}-${String(mo).padStart(2, '0')}` : null;
}

/**
 * Толгойн шалгалт — багана БАЙРЛАЛААРАА сар (`keys`); толгой нь өөр сар заавал жагсаана.
 * ⚠️ Excel 261007 V3-ийн Y5 «2027 он 12-р сар» нь байрлалаараа 2027-07 (хэрэглэгч баталсан) — `allowed`-д.
 * @returns `[{ col, header, expected, parsed }]` — `allowed`-д ороогүй зөрөлт
 */
export function headerMismatches(headers, keys, cols, allowed = new Set()) {
  const out = [];
  headers.forEach((h, i) => {
    const p = parseMonthHeader(h);
    if (p === keys[i] || allowed.has(cols[i])) return;
    out.push({ col: cols[i], header: h, expected: keys[i], parsed: p });
  });
  return out;
}

const r9 = (x) => Math.round(x * 1e9) / 1e9;

/**
 * Нэг мөрийн хуримтлал (0–1, хоосон = null/undefined) → сар бүрийн хувь (0–100).
 * @returns `{ months: [{ ym, huwi }], clamps: [{ ym, prev, cum }], final }` — `final` = хамгийн их хуримтлал × 100
 *          (хоосон мөрд null)
 */
export function monthPlanOf(cums, keys) {
  const months = [];
  const clamps = [];
  let top = 0;
  let last = 0;
  let any = false;
  cums.forEach((c, i) => {
    if (typeof c !== 'number' || !Number.isFinite(c)) return;
    any = true;
    /* жагсаалтад зөвхөн БУУРСАН агшин (өмнөх нүднээс бага) — дараагийн «дээдээс доош» сарууд биш */
    if (c < last - 1e-12) clamps.push({ ym: keys[i], prev: last, cum: c });
    last = c;
    const huwi = c > top ? r9((c - top) * 100) : 0;
    if (c > top) top = c;
    months.push({ ym: keys[i], huwi });
  });
  return { months, clamps, final: any ? r9(top * 100) : null };
}

/** Сарын мөрийн атрибут (`CF_MONTH`) */
export function monthRowAttrs(cfId, ym, huwi, cost) {
  const [y, mo] = ym.split('-').map(Number);
  return {
    cashflow_id: cfId,
    cashflow_start: Date.UTC(y, mo - 1, 1, 12),
    cashflow_end: Date.UTC(y, mo, 0, 12),
    cashflow_huwi: huwi,
    cashflow_dun: amountOf(huwi, costOf(cost)),
  };
}

/** `gdash.cfStartKeyOf`-ийн ЯГ дүрэм — UTC шөнө дунд бол UTC сар, бусад нь орон нутгийн сар */
export function ymOfStart(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  if (t % 86_400_000 === 0) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * «ОЛГОСОН САНХҮҮЖИЛТ ГЭРЭЭЛСЭН ДҮНД ЭЗЛЭХ ХУВЬ» — ПОРТАЛЫН ЦОРЫН ГАНЦ ТОДОРХОЙЛОЛТ.
 *
 * ⚠️ 2026-10-01 (ШИЙДВЭР, «хэрэглэгч: бүгдийг зас»): урьд нь хоёр өөр тоо гардаг байв —
 *    · «IPC» хуудас · ТУХ: 26.47% (HO-ийн БҮХ олголт 530.87 ÷ HO-ийн гэрээт дүн 2,005.71,
 *      `ipcTable.ipcTotals` / `ipc.hoTotals`);
 *    · Тайлан · удирдлагын тайлан · CEO карт: 26.01% (гэрээлсэн багцын олголт 522.71 ÷
 *      Cashflow-ийн гэрээлсэн дүн 2,009.77, `reportData.finance`).
 *    ДҮРЭМ: бүх газар ЭНЭ файлын `paidShareOf` (тоологч/хуваарь) ба `paidPctOf` (томьёо)-г
 *    хэрэглэнэ — Тайлан/CEO-гийн тодорхойлолт. Учир нь «гэрээлсэн нийт дүн» 2,009.77-д
 *    өөр 7 эх сурвалж санал нийлдэг; HO-ийн 2,005.71 нь зөвхөн 22 гэрээ хамарна.
 *    Хамрах хүрээнээс ГАДУУРХ олголт (`paidOther` — диапазон мөр, гэрээгүй багц) хувьд
 *    ОРОХГҮЙ, харин нуугдахгүй — дэлгэц тусад нь нэрлэнэ.
 *
 * ДҮРЭМ (2026-09-21-ний `reportData.loadFinanceRaw`-аас ЯГ шилжүүлсэн):
 *   · хуваарь `contract` = Cashflow-ийн `finXlInTotal` ∧ `ho_dungiin_tailbar === CONTRACTED`
 *     мөрийн `geree_dun` нийлбэр;
 *   · гэрээлсэн багцын түлхүүр = тэр мөрүүдийн `finPkgKey(pkgKeyOf(pkg2|pkg))` (2026-10-09: холбоостой);
 *   · тоологч `paidContracted` = HO төлбөрийн `finPkgKey(pkgKeyOf(bagts))` тэр түлхүүрт орох мөрийн `dun`;
 *   · `paid` = HO-ийн БҮХ мөрийн `dun` (хоосон `dun` АЛГАСНА — null ≠ 0).
 * ⚠️ Хувь 0–100 (`pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ). Хуваарь 0 / олголт уншигдаагүй бол `null`.
 */
import type { Row } from '@/lib/query';
import { CASHFLOW_NEW, HO_IPC, hoAmount, pkgKeyOf } from '@/lib/services';
import { finXlInTotal } from '@/lib/finExcelLayout';
import { finPkgKey } from '@/lib/pkgAlias';

/** `gdash.CONTRACTED`-тай ИЖИЛ утга — gdash-ийн хүнд импортоос зайлсхийж энд давтав (тест шалгана) */
export const PAID_SHARE_CONTRACTED = 'Гэрээлсэн дүн';

export type PaidShare = {
  /** Гэрээлсэн дүн (Cashflow, `inTotal` ∧ CONTRACTED), ₮ */
  contract: number;
  /** HO-ийн БҮХ олголт, ₮ */
  paid: number;
  /** Гэрээлсэн багцад олгосон — хувийн ТООЛОГЧ, ₮ */
  paidContracted: number;
  /** `paid − paidContracted` — хувьд ОРООГҮЙ (гэрээлсэн багцаас гадуурх) олголт, ₮ */
  paidOther: number;
  /** `paidPctOf(paidContracted, contract)` — 0–100, эсвэл `null` */
  pct: number | null;
};

/* ⚠️ `reportData`-ийн туслахуудтай ЯГ ижил — шилжүүлэхэд тоо өөрчлөгдөхгүй */
const str = (v: unknown): string => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ТОМЬЁО — `paidContracted / contract × 100`.
 * ⚠️ `null` = тодорхойгүй (хуваарь 0/хоосон, тоологч уншигдаагүй) — «0%» гэж БҮҮ зурна.
 */
export function paidPctOf(paidContracted: number | null | undefined, contract: number | null | undefined): number | null {
  if (paidContracted == null || contract == null || !Number.isFinite(contract) || contract <= 0) return null;
  return (paidContracted / contract) * 100;
}

/**
 * Cashflow-ийн АЖЛЫН мөрүүд (`CF_WORK_WHERE`) ба HO төлбөрийн мөрүүдээс НЭГ тодорхойлолтоор.
 * ⚠️ `cfRows`-д `finXlInTotal` шүүлтийг ЭНД хийнэ — дуудагч шүүсэн/шүүгээгүй аль нь ч ижил.
 */
export function paidShareOf(
  cfRows: ReadonlyArray<Record<string, unknown>>,
  hoRows: ReadonlyArray<Record<string, unknown>>,
): PaidShare {
  const F = CASHFLOW_NEW.fields;
  const contracted = cfRows.filter((r) => finXlInTotal(r) && str(r[F.amountNote]) === PAID_SHARE_CONTRACTED);
  const contract = contracted.reduce((a, r) => a + nn(r[F.contractAmount]), 0);
  /* ⚠️ 2026-10-09: хоёр талын түлхүүрийг `finPkgKey` (`pkgAlias.FIN_PKG_ALIAS` — «Багцын санхүү»-тэй
     НЭГ хүснэгт)-ээр нэгтгэж харьцуулна. Урьд нь түүхий `pkgKeyOf` тул HO «Багц-8.1» (→ «Багц 8»),
     HO «Багц-7» (Cashflow «БАГЦ-7.1» → «Багц 7») олголт багц бүрийн мөрд гэрээлсэн, төслийн хувьд
     `paidOther` болж хоёр түвшин зөрдөг байв. */
  const keys = new Set<string>();
  for (const r of contracted) {
    for (const k of [pkgKeyOf(r[F.pkg2]), pkgKeyOf(r[F.pkg])]) if (k && k !== '0') keys.add(finPkgKey(k));
  }
  let paid = 0;
  let paidContracted = 0;
  for (const r of hoRows) {
    const n = hoAmount(r as Row);
    if (n == null) continue;
    paid += n;
    const k = pkgKeyOf(r[HO_IPC.contractFields.pkg]);
    if (k && keys.has(finPkgKey(k))) paidContracted += n;
  }
  return {
    contract,
    paid,
    paidContracted,
    paidOther: paid - paidContracted,
    pct: hoRows.length ? paidPctOf(paidContracted, contract) : null,
  };
}

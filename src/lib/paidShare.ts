/**
 * «ОЛГОСОН САНХҮҮЖИЛТ ГЭРЭЭЛСЭН ДҮНД ЭЗЛЭХ ХУВЬ» — ПОРТАЛЫН ЦОРЫН ГАНЦ ТОДОРХОЙЛОЛТ.
 *
 * ДҮРЭМ (2026-09-21-ний `reportData.loadFinanceRaw`-аас ЯГ шилжүүлсэн):
 *   · хуваарь `contract` = Cashflow-ийн `finXlInTotal` ∧ `ho_dungiin_tailbar === CONTRACTED`
 *     мөрийн `geree_dun` нийлбэр;
 *   · гэрээлсэн багцын түлхүүр = тэр мөрүүдийн `finPkgKey(pkgKeyOf(pkg2|pkg))` (2026-10-09: холбоостой);
 *   · тоологч `paidContracted` = HO төлбөрийн `finPkgKey(pkgKeyOf(bagts))` тэр түлхүүрт орох мөрийн `dun`;
 *   · `paid` = HO-ийн БҮХ мөрийн `dun` (хоосон `dun` АЛГАСНА — null ≠ 0).
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
  paidKnown: number;
};

const str = (v: unknown): string => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ТОМЬЁО — `paidContracted / contract × 100`.
 */
export function paidPctOf(paidContracted: number | null | undefined, contract: number | null | undefined): number | null {
  if (paidContracted == null || contract == null || !Number.isFinite(contract) || contract <= 0) return null;
  return (paidContracted / contract) * 100;
}

/**
 * Cashflow-ийн АЖЛЫН мөрүүд (`CF_WORK_WHERE`) ба HO төлбөрийн мөрүүдээс НЭГ тодорхойлолтоор.
 */
export function paidShareOf(
  cfRows: ReadonlyArray<Record<string, unknown>>,
  hoRows: ReadonlyArray<Record<string, unknown>>,
): PaidShare {
  const F = CASHFLOW_NEW.fields;
  const contracted = cfRows.filter((r) => finXlInTotal(r) && str(r[F.amountNote]) === PAID_SHARE_CONTRACTED);
  const contract = contracted.reduce((a, r) => a + nn(r[F.contractAmount]), 0);
  const keys = new Set<string>();
  for (const r of contracted) {
    for (const k of [pkgKeyOf(r[F.pkg2]), pkgKeyOf(r[F.pkg])]) if (k && k !== '0') keys.add(finPkgKey(k));
  }
  let paid = 0;
  let paidContracted = 0;
  let paidKnown = 0;
  for (const r of hoRows) {
    const n = hoAmount(r as Row);
    if (n == null) continue;
    paidKnown += 1;
    paid += n;
    const k = pkgKeyOf(r[HO_IPC.contractFields.pkg]);
    if (k && keys.has(finPkgKey(k))) paidContracted += n;
  }
  return {
    contract,
    paid,
    paidContracted,
    paidOther: paid - paidContracted,
    pct: paidKnown ? paidPctOf(paidContracted, contract) : null,
    paidKnown,
  };
}

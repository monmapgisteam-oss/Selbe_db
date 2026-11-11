/**
 * «ОЛГОСОН САНХҮҮЖИЛТ ГЭРЭЭЛСЭН ДҮНД ЭЗЛЭХ ХУВЬ» — ПОРТАЛЫН ЦОРЫН ГАНЦ ТОДОРХОЙЛОЛТ.
 *
 * ДҮРЭМ (2026-09-21-ний `reportData.loadFinanceRaw`-аас ЯГ шилжүүлсэн):
 *   · хуваарь `contract` = Cashflow-ийн `finXlInTotal` ∧ `ho_dungiin_tailbar === CONTRACTED`
 *     мөрийн `geree_dun` нийлбэр;
 *   · тоологч `paidContracted` (2026-11-09) = HO-ийн мөрүүдээс (`paid`-тай НЭГ эх) гэрээлсэн багцад
 *     (`finPkgKey(pkgKeyOf(pkg2|pkg))`) хамаарах мөрийн `dun` — удирдлагын тайлангийн 04-ийн багцын мөрүүдийн нийлбэртэй
 *     ЯГ тэнцэнэ; олон багц хамарсан мөр («Багц-1-4») `paidOther`-д (04-т тусдаа мөр).
 *     Урьд нь 182-ын `olgoson_dun`-ийг уншдаг байсан тул синк хоцорвол «олгосон 665,426,302,067 ₮ — гэрээлсэн дүнгийн
 *     26.0%», «гадуур олгосон 134,553,506,676 ₮» гэж зөрдөг байв (амьд, 2026-11-09).
 *   · `paid` = HO-ийн БҮХ мөрийн `dun` (хоосон `dun` АЛГАСНА — null ≠ 0).
 */
import type { Row } from '@/lib/query';
import { CASHFLOW_NEW, HO_IPC, hoAmount, pkgKeyOf } from '@/lib/services';
import { finXlInTotal } from '@/lib/finExcelLayout';
import { finPkgKey } from '@/lib/pkgAlias';

/**
 * ГЭРЭЭЛСЭН ХУВЬ · ОЛГОСОН ХУВЬ (ТӨСӨЛД) — төслийн нийт дүнд (2026-11-04, хэрэглэгч).
 */
export const shareOfTotal = (v: number | null | undefined, total: number | null | undefined): number | null =>
  (v == null || total == null || !Number.isFinite(total) || total <= 0 ? null : (v / total) * 100);

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
  /* Олон багц хамарсан мөр («Багц-1-4») `pkgKeyOf`-оор хоосон — гадуурх (`execFinRanges`-ийн тусдаа мөр) */
  const inContracted = (raw: unknown): boolean => {
    const k = pkgKeyOf(raw);
    return !!k && keys.has(finPkgKey(k));
  };
  let paid = 0;
  let paidContracted = 0;
  let paidKnown = 0;
  for (const r of hoRows) {
    const n = hoAmount(r as Row);
    if (n == null) continue;
    paidKnown += 1;
    paid += n;
    if (inContracted(r[HO_IPC.contractFields.pkg])) paidContracted += n;
  }
  /* 2026-11-05: хөвөгч тооны үлдэгдэл (0.00006 ₮) «гадуур олголт» мэт гардаг байв — хагас төгрөгөөс бага бол 0 */
  const other = paid - paidContracted;
  return {
    contract,
    paid,
    paidContracted,
    paidOther: Math.abs(other) < 0.5 ? 0 : other,
    pct: paidKnown ? paidPctOf(paidContracted, contract) : null,
    paidKnown,
  };
}

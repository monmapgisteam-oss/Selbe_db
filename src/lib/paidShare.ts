/**
 * «ОЛГОСОН САНХҮҮЖИЛТ ГЭРЭЭЛСЭН ДҮНД ЭЗЛЭХ ХУВЬ» — ПОРТАЛЫН ЦОРЫН ГАНЦ ТОДОРХОЙЛОЛТ.
 *
 * ДҮРЭМ (2026-09-21-ний `reportData.loadFinanceRaw`-аас ЯГ шилжүүлсэн):
 *   · хуваарь `contract` = Cashflow-ийн `finXlInTotal` ∧ `ho_dungiin_tailbar === CONTRACTED`
 *     мөрийн `geree_dun` нийлбэр;
 *   · тоологч `paidContracted` (2026-11-09) = HO-ийн мөрүүдээс (`paid`-тай НЭГ эх) гэрээлсэн багцад
 *     (`finPkgKey(pkgKeyOf(pkg2|pkg))`) хамаарах мөрийн `dun` — удирдлагын тайлангийн 04-ийн багцын мөрүүдийн нийлбэртэй
 *     ЯГ тэнцэнэ; олон багц хамарсан мөр («Багц-1-4») — ГЭРЭЭЛСЭН мөр нь ижил мужтай («БАГЦ 1- 4») бол тоологчид
 *     орно (2026-11-16: хуваарьт орсон гэрээний төлбөр «гадуур олгосон» болж, хувь 32.5 ↔ ТТБ 32.6 зөрдөг байв).
 *     Урьд нь 182-ын `olgoson_dun`-ийг уншдаг байсан тул синк хоцорвол «олгосон 665,426,302,067 ₮ — гэрээлсэн дүнгийн
 *     26.0%», «гадуур олгосон 134,553,506,676 ₮» гэж зөрдөг байв (амьд, 2026-11-09).
 *   · `paid` = HO-ийн БҮХ мөрийн `dun` (хоосон `dun` АЛГАСНА — null ≠ 0).
 */
import type { Row } from '@/lib/query';
import { CASHFLOW_NEW, HO_IPC, hoAmount, pkgKeyOf } from '@/lib/services';
import { finXlInTotal } from '@/lib/finExcelLayout';
import { finPkgKey } from '@/lib/pkgAlias';
import { hoPkgParts } from '@/lib/hoSync/compute';

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
  /**
   * 2026-11-23 (аудит №3): гэрээлсэн багцад холбогдоогүй ТЭЗҮ · СУДАЛГААНЫ олголт (`ajliin_turul`), ₮ — `paidOther`-ийн нэг хэсэг.
   * Ажлын мөрийн гэрээ (`contract`) энэ гэрээг агуулдаггүй тул энд тоологчид ОРОХГҮЙ; ТТБ-ийн нийт гэрээлсэн дүнгээр
   * хуваах үед (`withProjectContract`) тоологчид нэмэгдэнэ — ТТБ-ийн гэрээлсэн нийт ТЭЗҮ/зураг төслийн гэрээг агуулдаг.
   */
  paidDesign: number;
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
  /* Олон багц хамарсан мөр («БАГЦ 1- 4» ↔ HO «Багц-1-4») `pkgKeyOf`-оор хоосон — мужийн бичвэрээр тулгана */
  const rangeKey = (raw: unknown): string => str(raw).toLowerCase().replace(/багц/g, '').replace(/\s+/g, '').replace(/^-+/, '');
  const ranges = new Set<string>();
  for (const r of contracted) {
    for (const v of [r[F.pkg2], r[F.pkg]]) if (!pkgKeyOf(v) && rangeKey(v)) ranges.add(rangeKey(v));
  }
  const inContracted = (raw: unknown): boolean => {
    const k = pkgKeyOf(raw);
    return k ? keys.has(finPkgKey(k)) : ranges.has(rangeKey(raw));
  };
  /*
   * 2026-11-27 (засвар): ОЛОН БАГЦЫН ЖАГСААЛТ («БАГЦ-10, 11, 13, 15») — `planPaidSync`-ийн дүрмээр: багц бүрийн «Гэрээлсэн дүн»
   * мөрүүдэд гэрээний дүнгийн жингээр хуваагдана; тоологчид хуваарьт (`contracted`) орсон мөрүүдийн хэсэг. Урьд нь `pkgKeyOf`
   * хоосон, мужийн бичвэр таарахгүй тул огт тоологддоггүй байв (ТТБ-д 4 багцад хуваагдаж ордог). Таарах мөр алга бол `null`.
   */
  const contractedSet = new Set(contracted);
  const noted = cfRows.filter((r) => str(r[F.amountNote]) === PAID_SHARE_CONTRACTED);
  const listShare = (raw: unknown): number | null => {
    const parts = hoPkgParts(raw);
    if (parts.length < 2) return null;
    const rows = noted.filter((r) => parts.includes(hoPkgParts(r[F.pkg])[0] ?? ''));
    if (!rows.length) return null;
    const w = rows.map((r) => Math.max(nn(r[F.contractAmount]), 0));
    const tw = w.reduce((a, x) => a + x, 0);
    const inW = rows.reduce((a, r, i) => a + (contractedSet.has(r) ? (tw > 0 ? w[i] : 1) : 0), 0);
    return inW / (tw > 0 ? tw : rows.length);
  };
  let paid = 0;
  let paidContracted = 0;
  let paidKnown = 0;
  let paidDesign = 0;
  for (const r of hoRows) {
    const n = hoAmount(r as Row);
    if (n == null) continue;
    paidKnown += 1;
    paid += n;
    const ls = listShare(r[HO_IPC.contractFields.pkg]);
    if (ls != null) {
      paidContracted += n * ls;
      if (ls < 1 && isDesignPay(r)) paidDesign += n * (1 - ls);
    } else if (inContracted(r[HO_IPC.contractFields.pkg])) paidContracted += n;
    else if (isDesignPay(r)) paidDesign += n;
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
    paidDesign: Math.abs(paidDesign) < 0.5 ? 0 : paidDesign,
  };
}

/** HO мөр ТЭЗҮ · судалгаа · зураг төслийн гэрээний олголт уу (`ajliin_turul` «ТЭЗҮ,Судалгаа» г.м.) */
export function isDesignPay(r: Readonly<Record<string, unknown>>): boolean {
  return /тэзү|судалгаа|зураг\s*төсөл/i.test(str(r[HO_IPC.contractFields.workType]));
}

/**
 * ТТБ-ИЙН НИЙТ ГЭРЭЭЛСЭН ДҮНГЭЭР (2,046.5 — ТЭЗҮ/зураг төсөл орсон) хуваах хувилбар (2026-11-23, аудит №3).
 * Хуваарь ТЭЗҮ/зураг төслийн гэрээг агуулдаг тул тэдгээрийн олголтыг (`paidDesign`) тоологчид нэмнэ — эс бөгөөс
 * 33.08% (зөв нь 33.3%) гэж бага гардаг байв. `projContract` алга бол хуучин (ажлын мөрийн) хувилбараар.
 * @param landComp 2026-11-27 (аудит): `projContract`-д ОРСОН газар чөлөөлөлтийн нөхөх олговор, ₮ (`projectMoneyOf.landComp` —
 *   «Газар чөлөөлөлт» үе шатны 3-р унтраалга «Мөнгөний нийлбэрт тооцох» асаалттай үед л > 0). Хуваарьт орсон тул тоологч
 *   (`paidContracted`) ба нийт олгосонд (`paid`) нэмэгдэнэ — «Төсөл төлөвлөгөө биелэлт»-ийн Төслийн нийт мөрийн «Олгосон хувь
 *   (гэрээнд)»-тэй нэг хүрээ (олговор = гэрээ = олгосон). Урьд нь хуваарьт л орж хувь бага гардаг байв (31.9% ↔ 36.7%).
 */
export function withProjectContract(share: PaidShare, projContract: number | null | undefined, landComp?: number | null): PaidShare {
  if (projContract == null || !(projContract > 0)) return share;
  const comp = landComp != null && Number.isFinite(landComp) && landComp > 0 ? landComp : 0;
  const paidContracted = share.paidContracted + share.paidDesign + comp;
  const paid = share.paid + comp;
  const other = paid - paidContracted;
  return {
    ...share,
    paid,
    contract: projContract,
    paidContracted,
    paidOther: Math.abs(other) < 0.5 ? 0 : other,
    paidDesign: 0,
    pct: share.paidKnown ? paidPctOf(paidContracted, projContract) : null,
  };
}

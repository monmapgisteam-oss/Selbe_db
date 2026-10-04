/**
 * БАГЦЫН ТҮЛХҮҮРИЙН ХОЛБООС ба ОЛОН БАГЦ ХАМАРСАН ТӨЛБӨР — «Багцын санхүү» (PkgFin) ба
 * «ТУХ» (`tuhData.assignHo`) хоёрын НЭГ эх (2026-10-04).
 *
 * ⚠️ ЯАГААД: HO-ийн «Багц-8.1» (зураг төслийн олголт 323,040,989 ₮) нь Cashflow-ийн «Багц 8»
 *    -ын зураг төслийн гэрээтэй ЯГ ижил дүн (2026-09-15-ны нотолгоо, PkgFin-ийн ⚠️). Урьд нь
 *    PkgFin «БАГЦ81 → БАГЦ82» гэж ӨӨРИЙН хүснэгтээр, ТУХ «эцэг код» таамгаар («Багц 8» ←
 *    «Багц-8.1») холбодог тул нэг гэрээ хоёр дэлгэцэд ӨӨР түлхүүрт очих эрсдэлтэй байв.
 *    Одоо: HO түлхүүр → Cashflow түлхүүр (`HO_PKG_ALIAS`) НЭГ хүснэгт; PkgFin нь үүн дээр
 *    Cashflow → газрын зургийн багц (`MAP_PKG_ALIAS`)-ыг давхарлана.
 *
 * ⚠️ Багц 7-ийн ХУВААРЬ (2026-10-04, нэг дүрэм — ГЭРЭЭНИЙ ТҮВШНИЙ таарал):
 *    HO «Багц-7» = Cashflow «БАГЦ-7.1» (барилга, 22.87 тэрбум) — гэрээ бүр ӨӨРИЙН дүнгээр
 *    (ТУХ-ийн мөр = нэг гэрээ → 1.87 ÷ 22.87). «Багцын санхүү» нь газрын зургийн БАГЦ (7)
 *    тул тэр багцын БҮХ гэрээлсэн гэрээ (барилга 22.87 + зураг төсөл «Багц 7.1» 0.51 =
 *    23.37) хуваарьт орно — порталын «олгосон ÷ гэрээлсэн» (`paidShare`)-ийн хүрээтэй нэг
 *    (зураг төслийн гэрээ олголтгүй ч гэрээлсэн дүнд бий). Хоёр тоо ЗӨРӨХ нь алдаа биш:
 *    нэг нь гэрээ, нөгөө нь багц. Гэрээний дүн хоёр эх сурвалжид ижил (22.868 = 22.868).
 */
import type { Row } from '@/lib/query';
import { HO_IPC, bagtsKey, hoAmount, isPkgRange, pkgKeyOf } from '@/lib/services';

/** HO гэрээний багцын түлхүүр → Cashflow-ийн багцын түлхүүр (санхүүгийн НЭГ гэрээ) */
export const HO_PKG_ALIAS: Readonly<Record<string, string>> = {
  'БАГЦ81': 'БАГЦ8',
};

/** HO түлхүүрийг Cashflow-ийн түлхүүр рүү (холбоосгүй бол өөрөө) */
export const hoPkgKey = (k: string): string => HO_PKG_ALIAS[k] ?? k;

/**
 * Cashflow-ийн багц → ГАЗРЫН ЗУРГИЙН багц (зөвхөн «Багцын санхүү» — газрын зургийн багцаар
 * жагсаадаг). Нотолгоо нь `PkgFin`-ийн `FIN_PKG_ALIAS`-ийн ⚠️.
 */
export const MAP_PKG_ALIAS: Readonly<Record<string, { key: string; label: string }>> = {
  'БАГЦ71': { key: 'БАГЦ7', label: 'Багц 7' },
  'БАГЦ8': { key: 'БАГЦ82', label: 'Багц 8.2' },
};

/**
 * ОЛОН БАГЦ ХАМАРСАН мөрийн гишүүн багцууд (`bagtsKey`) — «БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15»
 * → [БАГЦ10, БАГЦ11, БАГЦ13, БАГЦ15]; «Багц-1-4» → [БАГЦ1 … БАГЦ4]. Диапазон биш бол [].
 * ⚠️ ДҮНГ ХУВААХГҮЙ — зөвхөн «аль багцууд хамаарах вэ» гэдгийг хэлнэ (хуваарилах эх алга).
 */
export function rangeMembers(v: unknown): string[] {
  const s = String(v ?? '').trim();
  if (!isPkgRange(s)) return [];
  const out = new Set<string>();
  for (const part of s.split(/[\r\n,]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/(\d+)\s*[-–—]\s*(\d+)\s*$/u);
    if (m && Number(m[2]) > Number(m[1]) && Number(m[2]) - Number(m[1]) < 50) {
      for (let i = Number(m[1]); i <= Number(m[2]); i += 1) out.add(`БАГЦ${i}`);
      continue;
    }
    /* «6.2» мэт угтваргүй хэсэг — «БАГЦ»-аар нөхнө */
    const k = /^[\d.\s-]+$/.test(p) ? bagtsKey(`БАГЦ${p}`) : bagtsKey(p);
    if (k && k !== 'БАГЦ') out.add(k);
  }
  return [...out];
}

/** Олон багц хамарсан төлбөрийн бүлэг */
export type RangePay = {
  /** HO-ийн `bagts` түүхий утга (зайг нэгтгэсэн) — ХАРАГДАХ нэр */
  label: string;
  /** Σ олгосон, ₮ */
  amount: number;
  /** Хамаарах багцууд (`bagtsKey`) */
  members: string[];
};

/**
 * HO төлбөрийн мөрүүдээс ОЛОН БАГЦ ХАМАРСАН (`pkgKeyOf` хоосон) олголтыг бүлэглэнэ.
 * ⚠️ `dun` хоосон мөр алгасна (null ≠ 0); `bagts` огт хоосон мөр энд ОРОХГҮЙ (гишүүнгүй).
 */
export function rangePaysOf(pays: ReadonlyArray<Record<string, unknown>>): RangePay[] {
  const by = new Map<string, RangePay>();
  for (const r of pays) {
    const amt = hoAmount(r as Row);
    if (amt == null) continue;
    const raw = r[HO_IPC.contractFields.pkg];
    if (pkgKeyOf(raw)) continue;
    const members = rangeMembers(raw);
    if (!members.length) continue;
    const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
    const cur = by.get(label) ?? { label, amount: 0, members };
    cur.amount += amt;
    by.set(label, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

import { t as tr } from '@/lib/i18nCore';

/**
 * ТӨСЛИЙН ЧАНАРЫН МЕТА — зөвхөн ямар ч үйлчилгээнд БАЙХГҮЙ ангилал/нэршил.
 *
 * Энд үлдсэн нь ТОО БИШ мета:
 * Багцын гүйцэтгэгчийн гарал (Гадаад/Үндэсний) ба «Иргэдэд хүрэх үр өгөөж»-ийн мета.
 */

/**
 * Багцын гүйцэтгэгчийн ГАРАЛ — ямар ч хүснэгтэд байхгүй ангилал (тоо биш).
 * Гүйцэтгэгчийн нэр өөрөө building_GOL-ийн `BAR_COMP`-оос амьд гарна.
 */
export const BAGTS_ORIGIN: Record<string, "Гадаад" | "Үндэсний"> = {
  "Багц 1": 'Гадаад',
  "Багц 2": 'Гадаад',
  "Багц 3.1": 'Гадаад',
  "Багц 3.2": 'Үндэсний',
  "Багц 3.3": 'Үндэсний',
  "Багц 4.1": 'Үндэсний',
  "Багц 4.2": 'Үндэсний',
};

/* ══════════════════════════════════════════════════════════════════════
   «ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ» (Irged.tsx) — ӨМНӨ/ДАРАА infographic-ийн мета. */


/**
 * Нийгмийн үйлчилгээний мөрүүд — ӨМНӨ (одоо) / ДАРАА (төлөвлөсөн).
 */
const SOCIAL_ROWS: { label: string; now: string; add: string; total: number; live?: string }[] = [
  { get label() { return tr('Сургууль'); }, now: "2 (1,440)", add: "3 (3,780)", total: 5, live: 'school' },
  { get label() { return tr('Цэцэрлэг'); }, now: "3 (640)", add: "5 (1,200)", total: 8, live: 'kinder' },
  { get label() { return tr('Өрхийн эмнэлэг, хороо, цагдаа'); }, now: "3", add: "1", total: 4 },
  { get label() { return tr('Соёлын цогцолбор'); }, now: "—", add: "1", total: 1 },
  { get label() { return tr('Спортын цогцолбор'); }, now: "—", add: "1", total: 1 },
  { get label() { return tr('Гал унтраах, аврах анги'); }, now: "1", add: "—", total: 1 },
  { get label() { return tr('Бизнес инкубатор төв'); }, now: "—", add: "1", total: 1 },
];

/** «2 (1,440)» → 2 · «—» → 0. `Irged.headCount`-той ИЖИЛ дүрэм. */
const socCount = (s: string) => Number(/^\s*(\d+)/.exec(s)?.[1] ?? 0);

/** Нийгмийн үйлчилгээ — ӨМНӨ (одоо) / ДАРАА (төлөвлөсөн) харьцуулалт */
export const SOCIAL = {
  rows: SOCIAL_ROWS,
  totals: {
    now: String(SOCIAL_ROWS.reduce((a, r) => a + socCount(r.now), 0)),
    add: String(SOCIAL_ROWS.reduce((a, r) => a + socCount(r.add), 0)),
    total: SOCIAL_ROWS.reduce((a, r) => a + r.total, 0),
  },
} as const;


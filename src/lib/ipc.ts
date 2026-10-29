/**
 * ХӨРӨНГӨ ОРУУЛАЛТЫН ГҮЙЦЭТГЭЛ — ХОЁР ТҮВШНИЙ ачаалагч ба цэвэр тооцоо.
 * Эх сурвалж: `HO_IPC` (`HO_guitsetgel_arcgis_csv/196`, амьдаар 52 мөр).
 */
import { HO_IPC, hoAmount, num, pkgKeyOf } from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { cached } from '@/lib/live';

export type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/* ─────────────────────────── АЧААЛАГЧ ─────────────────────────── */

/** Кэшийн ТТЛ — Finance.tsx-ийн `LIVE_TTL`-тэй ижил */
const HO_TTL = 60_000;

/**
 * 45 мөрийг БҮТНЭЭР татна.
 */
export const loadHoRows = cached(
  () => queryFeatures(HO_IPC.url, {
    outFields: ['*'],
    orderBy: `${HO_IPC.oid} ASC`,
  }) as Promise<Row[]>,
  HO_TTL,
  ['HO_IPC'],
);

/* ─────────────────────────── НИЙЛБЭР ─────────────────────────── */

/**
 * Мөрүүдийн төлбөрийн нийлбэр — БҮГД хоосон бол `null`, `0` БИШ.
 */
export function sumPaid(rows: readonly Row[]): number | null {
  let acc: number | null = null;
  for (const r of rows) {
    const v = hoAmount(r);
    if (v == null) continue;
    acc = (acc ?? 0) + v;
  }
  return acc;
}

/** Тухайн ТӨРЛИЙН (урьдчилгаа/гүйцэтгэл) төлбөрийн нийлбэр */
export function sumPaidByKind(rows: readonly Row[], kind: string): number | null {
  return sumPaid(rows.filter((r) => r[P.kind] === kind));
}

/* ─────────────────────── ГЭРЭЭНИЙ ТҮВШИН ─────────────────────── */

/**
 * НЭГ ГЭРЭЭ — 45 төлбөрийн мөрөөс нурааж хураасан 22-ийн нэг.
 */
export type HoContract = {
  /** `geree_kod` «Багц-1». Кодгүй мөрд `''` (амьдаар ХО-0045 нэг ширхэг; 2026-10-21: кодгүй мөр БҮР тусдаа гэрээ) */
  code: string;
  /** `pkgKeyOf(bagts)` — багц↔гэрээ холбоосын түлхүүр. ДИАПАЗОН мөрд `''` */
  key: string;
  /** `bagts` түүхий утга — ХАРАГДАХ нэр */
  pkg: string;
  project: string;
  contractor: string;
  workType: string;
  contractNo: string;
  /** Нийт төсөвт өртөг /Захирамж/ — ГЭРЭЭНД НЭГ УДАА */
  budgetTotal: number | null;
  /** Гэрээ байгуулагдсан төсөв — ГЭРЭЭНД НЭГ УДАА */
  contractTotal: number | null;
  saving: number | null;
  /** Тухайн гэрээний төлбөрийн мөрүүд, OID дарааллаар */
  pays: Row[];
  /** Σ `dun`, `tulult_turul` = урьдчилгаа */
  advanceTotal: number | null;
  /** Σ `dun`, `tulult_turul` = гүйцэтгэл */
  workTotal: number | null;
  /** Σ `dun` БҮХ төлбөр — «ОЛГОСОН» (хэрэглэгчийн шийдвэр: урьдчилгаа ОРНО) */
  paidTotal: number | null;
  /** `paidTotal / contractTotal` × 100 — 0–100. `pct` 100-аар үржүүлдэггүй */
  paidPct: number | null;
};

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Утга «байгаа» эсэх — `null`, `undefined`, хоосон мөр гурав нь БАЙХГҮЙ. */
const has = (v: unknown): boolean => v != null && v !== '';

/**
 * НЭГ ГЭРЭЭНИЙ бүх мөрөөс тухайн гэрээний талбарын утгыг сонгоно.
 */
function pickField(pays: readonly Row[], field: string, warn: boolean): unknown {
  let out: unknown = null;
  let found = false;
  for (const r of pays) {
    const v = r[field];
    if (!has(v)) continue;
    if (!found) { out = v; found = true; continue; }
    if (warn && v !== out) {
      console.warn(
        `[ipc.groupHo] «${str(r[C.code])}» гэрээний «${field}» талбарт ХОЁР өөр утга: `
        + `${JSON.stringify(out)} ба ${JSON.stringify(v)}. Эхнийхийг авав — AGOL дээр залруул.`,
      );
    }
  }
  return out;
}

/**
 * Мөрүүдийг ГЭРЭЭ болгон нурааж хураана.
 */
/** Кодгүй бүлгийн дотоод түлхүүрийн угтвар — `geree_kod`-д хэзээ ч гарахгүй тэмдэгт */
const NO_CODE_KEY = '\u0000';

export function groupHo(rows: readonly Row[]): HoContract[] {
  const byCode = new Map<string, Row[]>();
  rows.forEach((r, i) => {
    const code = str(r[C.code]).trim();
    const cno = code ? '' : str(r[C.contractNo]).trim();
    const key = code || (cno ? `${NO_CODE_KEY}n:${cno}` : `${NO_CODE_KEY}${num(r[HO_IPC.oid]) ?? `i${i}`}`);
    const g = byCode.get(key);
    if (g) g.push(r); else byCode.set(key, [r]);
  });

  const out: HoContract[] = [];
  for (const [key, pays] of byCode) {
    const code = key.startsWith(NO_CODE_KEY) ? '' : key;
    const pick = (f: string, warn = true) => pickField(pays, f, warn);
    const pkg = pick(C.pkg, false);
    const budgetTotal = num(pick(C.budgetTotal));
    const contractTotal = num(pick(C.contractTotal));
    const paidTotal = sumPaid(pays);
    out.push({
      code,
      key: pkgKeyOf(pkg),
      pkg: str(pkg),
      project: str(pick(C.project)),
      contractor: str(pick(C.contractor)),
      workType: str(pick(C.workType)),
      contractNo: str(pick(C.contractNo)),
      budgetTotal,
      contractTotal,
      saving: budgetTotal == null || contractTotal == null
        ? null
        : budgetTotal - contractTotal,
      pays,
      advanceTotal: sumPaidByKind(pays, HO_IPC.kinds.advance),
      workTotal: sumPaidByKind(pays, HO_IPC.kinds.work),
      paidTotal,
      paidPct: paidTotal == null || contractTotal == null || contractTotal === 0
        ? null
        : (paidTotal / contractTotal) * 100,
    });
  }
  return out;
}

/* ─────────────────────── БАГЦААР ЗАДЛАХ ─────────────────────── */

/**
 * БАГЦЫН ТҮЛХҮҮР → олгосон нийт ₮.
 */
export function paidByPkg(rows: readonly Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = hoAmount(r);
    if (v == null) continue;
    const k = pkgKeyOf(r[C.pkg]);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + v);
  }
  return m;
}

/**
 * Багцад ХОЛБОГДООГҮЙ төлбөрийн мөрүүд — диапазон/хоосон `bagts`.
 */
export function unlinkedPays(rows: readonly Row[]): Row[] {
  return rows.filter((r) => hoAmount(r) != null && !pkgKeyOf(r[C.pkg]));
}

/* ─────────────────────── СУУРЬ ХЭМЖИЛТ ─────────────────────── */

export type HoTotals = {
  /** Гэрээний тоо (dedup хийсэн) */
  contracts: number;
  /**
   * Төлбөрийн тоо — ЗӨВХӨН `dun`-тай мөр (`ipcTable.payCount`-тай нэг дүрэм).
   */
  pays: number;
  /** Σ `tosov_niit` — ГЭРЭЭ БҮРД НЭГ УДАА */
  budget: number | null;
  /** Σ `gereet_tosov_niit` — ГЭРЭЭ БҮРД НЭГ УДАА */
  contract: number | null;
  /** Σ (төсөв − гэрээт) — БОДОГДСОН */
  saving: number | null;
  /** Σ `dun` БҮХ төлбөр — «олгосон нийт» */
  paid: number | null;
  advance: number | null;
  work: number | null;
  /**
   * (гэрээт дүн тодорхой гэрээнүүдийн олголт) / `contract` × 100 — 0–100.
   */
  paidPct: number | null;
};

/**
 * Төслийн НИЙТ хэмжилт.
 */
export function hoTotals(rows: readonly Row[]): HoTotals {
  const cs = groupHo(rows);
  const acc = (pick: (c: HoContract) => number | null): number | null => {
    let a: number | null = null;
    for (const c of cs) { const v = pick(c); if (v != null) a = (a ?? 0) + v; }
    return a;
  };
  const contract = acc((c) => c.contractTotal);
  const paid = sumPaid(rows);
  const paidC = acc((c) => (c.contractTotal != null ? c.paidTotal : null));
  return {
    contracts: cs.length,
    pays: rows.filter((r) => hoAmount(r) != null).length,
    budget: acc((c) => c.budgetTotal),
    contract,
    saving: acc((c) => c.saving),
    paid,
    advance: sumPaidByKind(rows, HO_IPC.kinds.advance),
    work: sumPaidByKind(rows, HO_IPC.kinds.work),
    paidPct: paidC == null || contract == null || contract === 0
      ? null
      : (paidC / contract) * 100,
  };
}

/* ─────────────────────── IPC ДУГААРЫН ЦУВАА ─────────────────────── */

/**
 * Гэрээний IPC дугаарууд — ӨСӨХ дарааллаар, давхардалгүй.
 */
export function ipcNumbers(pays: readonly Row[]): number[] {
  const s = new Set<number>();
  for (const r of pays) {
    const n = num(r[P.ipcNo]);
    if (n != null) s.add(n);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * IPC дугаар 1-ээс эхэлж ЦООРХОЙГҮЙ үргэлжилж байна уу?
 */
export function ipcSeqOk(pays: readonly Row[]): boolean {
  const ns = ipcNumbers(pays);
  return ns.every((n, i) => n === i + 1);
}

/** Дугаарын цоорхой — «1,2,4» → `[3]`. Цоорхойгүй бол хоосон массив. */
export function ipcGaps(pays: readonly Row[]): number[] {
  const ns = ipcNumbers(pays);
  if (!ns.length) return [];
  const have = new Set(ns);
  const gaps: number[] = [];
  for (let i = 1; i <= ns[ns.length - 1]; i++) if (!have.has(i)) gaps.push(i);
  return gaps;
}

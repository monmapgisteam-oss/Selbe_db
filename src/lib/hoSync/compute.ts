/**
 * HO (ХО ГҮЙЦЭТГЭЛ, 185) ← CASHFLOW (182) — ГЭРЭЭНИЙ ТҮВШНИЙ ТАЛБАРЫН ХОЛБОЛТ, цэвэр тооцоолол (2026-11-03).
 *
 * Хэрэглэгч: «HO-г Cashflow-оос update хийгддэг болгоё — Cashflow дээр өөрчлөхөд HO дээр өөрчлөгдөнө; нэг зүйл 2 газар
 * өөр утгаар бодогдож явахгүй». Cashflow = гэрээний мэдээллийн ГАНЦ эх; HO-д зөвхөн төлбөрийн мөр (IPC) өөрийн мэдээлэлтэй.
 *
 * Холболт (Cashflow → HO), гэрээ (`geree_kod`) бүрийн БҮХ мөрөнд давтаж бичнэ:
 *   zahiramj_niit_dun → tosov_niit ; zahiramj_unet_tsaas → tosov_unet_tsaas ; zahiramj_borluulalt_dun → tosov_borluulalt ;
 *   zahiramj_niislel_tusuv → tosov_niislel_tosov ; geree_dun → gereet_tosov_niit ; hemnelt_hetrelt = tosov_niit − gereet_tosov_niit ;
 *   guitsetgegch · geree_dugaar ; zahiramj_ognoo → zahiramj1_ognoo ; zahiramj_dugaar → zahiramj1_dugaar.
 *   (HO-д zahiramj_niit_dun · zahiramj_unet_tsaas_huvi · zahialagch_hynalt_baig талбар БАЙХГҮЙ — холбогдохгүй.)
 * Cashflow-д байхгүй талбар (gereet_* задаргаа, tosol_ner, ajliin_turul, geree_helber, huuliin_undeslel, zahiramj2/3, geree_nemelt) —
 * ХӨНДӨХГҮЙ. `bagts` (холболтын түлхүүр) — хөндөхгүй.
 *
 * Гэрээ ↔ Cashflow мөрийн тохироо: багцын код ижил (нэг гэрээ олон багц: «БАГЦ-10, 11, 13, 15» → 4 мөрийн НИЙЛБЭР),
 * `ho_dungiin_tailbar` = «Гэрээлсэн дүн», үе шат нь HO-ийн ажлын төрөлтэй таарна (ТЭЗҮ/Судалгаа → ТЭЗҮ · Ажлын зураг төсөл;
 * бусад → Барилга угсралт). Cashflow мөргүй гэрээ (ХО-0045) — хөндөхгүй.
 */
import { HO_IPC, CASHFLOW_NEW } from '@/lib/services';

export type Row = Record<string, unknown>;

const HC = HO_IPC.contractFields;
const CF = CASHFLOW_NEW.fields;
/** Cashflow-ийн «Гэрээлсэн дүн» тэмдэглэгээ (`ho_dungiin_tailbar`) */
export const CONTRACTED_NOTE = 'Гэрээлсэн дүн';

const txt = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** «Багц-1» · «БАГЦ 1- 4» · «БАГЦ-10,  БАГЦ-11» → ['1'] · ['1-4'] · ['10', '11'] — багцын кодууд (жижиг үсэг, зайгүй) */
export function hoPkgParts(v: unknown): string[] {
  return String(v ?? '').toLowerCase().split(',').map((p) => p.replace(/багц/g, '').replace(/\s+/g, '').replace(/^-+/, '').replace(/​/g, ''))
    .filter(Boolean);
}

/** HO ажлын төрөл → Cashflow үе шат */
export const phasesOf = (workType: unknown): readonly string[] => (
  /тэзү|судалгаа/i.test(txt(workType)) ? ['ТЭЗҮ', 'Ажлын зураг төсөл'] : ['Барилга угсралт']
);

/** Cashflow мөр гэрээнд тохирох уу */
export function cfMatches(r: Row, parts: readonly string[], phases: readonly string[]): boolean {
  if (txt(r[CF.amountNote]) !== CONTRACTED_NOTE) return false;
  if (!phases.includes(txt(r[CF.phase]))) return false;
  const k = hoPkgParts(r[CF.pkg])[0];
  return !!k && parts.includes(k);
}

/** Нэг гэрээний HO утгууд — Cashflow мөрүүдээс (олон мөр бол дүн нийлбэр, бичвэр эхний утгатайгаас) */
export function hoFromCf(cf: readonly Row[]): Row {
  const sum = (f: string): number | null => {
    let s: number | null = null;
    for (const r of cf) { const v = num(r[f]); if (v != null) s = (s ?? 0) + v; }
    return s;
  };
  const first = (f: string): unknown => {
    for (const r of cf) { const v = r[f]; if (v != null && txt(v) !== '') return typeof v === 'string' ? txt(v) : v; }
    return null;
  };
  const tosov = sum(CF.orderTotal);
  const geree = sum(CF.contractAmount);
  /* HO-ийн талбарын төрөл (амьд, 2026-11-03): tosov_niit · gereet_tosov_niit · hemnelt_hetrelt — BigInteger (бүхэл);
     tosov_niislel_tosov — Integer (32 бит, > 2.147 тэрбум багтахгүй → хөндөхгүй); zahiramj1_ognoo — DateOnly («YYYY-MM-DD») */
  const city = sum(CASHFLOW_NEW.sources[2].field);
  const out: Row = {
    [HC.budgetTotal]: intOf(tosov),
    [HC.budgetBond]: sum(CASHFLOW_NEW.sources[0].field),
    [HC.budgetSales]: sum(CASHFLOW_NEW.sources[1].field),
    [HC.contractTotal]: intOf(geree),
    [HC.saving]: tosov != null && geree != null ? intOf(tosov - geree) : null,
    [HC.contractor]: first(CF.contractor),
    [HC.contractNo]: first(CF.contractNo),
    [HC.order1Date]: dayOnly(first(CF.orderDate)),
    [HC.order1No]: first(CF.orderNo),
  };
  if (city == null || Math.abs(city) <= INT32_MAX) out[HC.budgetCity] = intOf(city);
  return out;
}

const INT32_MAX = 2_147_483_647;
const intOf = (v: number | null): number | null => (v == null ? null : Math.round(v));
/** ms (epoch) эсвэл «YYYY-MM-DD» → «YYYY-MM-DD» (UTC өдөр); хоосон → null */
export const dayOnly = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  const n = Number(v);
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : null;
};

const same = (a: unknown, b: unknown): boolean => {
  if (a == null || a === '') return b == null || b === '';
  if (b == null || b === '') return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a), y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
  }
  return txt(a) === txt(b);
};

export type HoSyncPlan = {
  /** HO мөрийн засвар — `objectid` + өөрчлөгдсөн талбар л */
  updates: Row[];
  /** Гэрээ (geree_kod) → тохирсон Cashflow мөрийн objectid-ууд */
  matched: Map<string, number[]>;
  /** Cashflow мөр олдоогүй гэрээнүүд (хөндөхгүй) */
  unmatched: string[];
};

/**
 * HO бүх мөр + Cashflow ажлын мөрүүд → засварын жагсаалт (цэвэр). `share` (үнэт цаасны хувь) олон мөртэй гэрээнд хөндөхгүй (null → алгасна).
 */
export function planHoSync(hoRows: readonly Row[], cfRows: readonly Row[]): HoSyncPlan {
  const byContract = new Map<string, Row[]>();
  for (const r of hoRows) {
    const code = txt(r[HC.code]);
    if (!code) continue;
    byContract.set(code, [...(byContract.get(code) ?? []), r]);
  }
  const updates: Row[] = [];
  const matched = new Map<string, number[]>();
  const unmatched: string[] = [];
  for (const [code, rows] of byContract) {
    const head = rows[0];
    const parts = hoPkgParts(head[HC.pkg]);
    const phases = phasesOf(head[HC.workType]);
    const cf = cfRows.filter((r) => cfMatches(r, parts, phases));
    if (!cf.length) { unmatched.push(code); continue; }
    matched.set(code, cf.map((r) => Number(r[CASHFLOW_NEW.oid])));
    const want = hoFromCf(cf);
    for (const r of rows) {
      const upd: Row = {};
      for (const [f, v] of Object.entries(want)) if (!same(r[f], v)) upd[f] = v;
      if (Object.keys(upd).length) updates.push({ [HO_IPC.oid]: r[HO_IPC.oid], ...upd });
    }
  }
  return { updates, matched, unmatched };
}

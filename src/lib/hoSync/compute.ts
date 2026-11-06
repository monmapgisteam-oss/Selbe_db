/**
 * HO (ХО ГҮЙЦЭТГЭЛ, 185) ← CASHFLOW (182) — ГЭРЭЭНИЙ ТҮВШНИЙ ТАЛБАРЫН ХОЛБОЛТ, цэвэр тооцоолол (2026-11-03).
 *
 * Хэрэглэгч: «HO-г Cashflow-оос update хийгддэг болгоё — Cashflow дээр өөрчлөхөд HO дээр өөрчлөгдөнө; нэг зүйл 2 газар
 * өөр утгаар бодогдож явахгүй». Cashflow = гэрээний мэдээллийн ГАНЦ эх; HO-д зөвхөн төлбөрийн мөр (IPC) өөрийн мэдээлэлтэй.
 *
 * Холболт (Cashflow → HO), гэрээ (`geree_kod`) бүрийн БҮХ мөрөнд давтаж бичнэ:
 *   ho_dun_zahiramj → tosov_niit ; zahiramj_unet_tsaas → tosov_unet_tsaas ; zahiramj_borluulalt_dun → tosov_borluulalt ;
 *   zahiramj_niislel_tusuv → tosov_niislel_tosov ; geree_dun → gereet_tosov_niit ; hemnelt_hetrelt = tosov_niit − gereet_tosov_niit ;
 *   guitsetgegch · geree_dugaar ; zahiramj_ognoo → zahiramj1_ognoo ; zahiramj_dugaar → zahiramj1_dugaar.
 *   (HO-д zahiramj_unet_tsaas_huvi · zahialagch_hynalt_baig талбар БАЙХГҮЙ — холбогдохгүй.)
 * Cashflow-д байхгүй талбар (gereet_* задаргаа, tosol_ner, ajliin_turul, geree_helber, huuliin_undeslel, zahiramj2/3, geree_nemelt) —
 * ХӨНДӨХГҮЙ. `bagts` (холболтын түлхүүр) — хөндөхгүй.
 *
 * Гэрээ ↔ Cashflow мөрийн тохироо: багцын код ижил (нэг гэрээ олон багц: «БАГЦ-10, 11, 13, 15» → 4 мөрийн НИЙЛБЭР),
 * `ho_dungiin_tailbar` = «Гэрээлсэн дүн», үе шат нь HO-ийн ажлын төрөлтэй таарна (ТЭЗҮ/Судалгаа → ТЭЗҮ · Ажлын зураг төсөл;
 * бусад → Барилга угсралт). Cashflow мөргүй гэрээ (ХО-0045) — хөндөхгүй.
 */
import { HO_IPC, CASHFLOW_NEW, orderTotalOf } from '@/lib/services';
import { contractCancelled } from '@/lib/ipc';
import { isSplitParent, type PlanTree } from '@/lib/projectPlan';

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

/**
 * «Багц-1» · «БАГЦ 1- 4» · «БАГЦ-10,  БАГЦ-11» → ['1'] · ['1-4'] · ['10', '11'] — багцын кодууд (жижиг үсэг, зайгүй).
 * 2026-11-05 (аудит №10): ДЭД багцын зураасыг цэг болгоно — хуудас/HO «Багц 4-1» ↔ Cashflow «Багц-4.1» нэг код ('4.1');
 * «1-4» шиг ӨСӨХ хос нь диапазон (`isPkgRange`-тай ижил дүрэм) тул хэвээр.
 */
export function hoPkgParts(v: unknown): string[] {
  return String(v ?? '').toLowerCase().split(',').map((p) => p.replace(/багц/g, '').replace(/\s+/g, '').replace(/^-+/, '').replace(/​/g, ''))
    .map((p) => p.replace(/^(\d+)-(\d+)$/, (m, a: string, b: string) => (Number(b) > Number(a) ? m : `${a}.${b}`)))
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
  let tosov: number | null = null;
  for (const r of cf) { const v = num(orderTotalOf(r)); if (v != null) tosov = (tosov ?? 0) + v; }
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
    /* 2026-11-04: мөнгө ₮-ийн нарийвчлалаар (өмнөх харьцангуй хүлцэл 4.9 тэрбумд 4,921 ₮-ийн зөрүүг алгасдаг байв) */
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.5;
  }
  return txt(a) === txt(b);
};

export type HoSyncPlan = {
  /** HO мөрийн засвар — `objectid` + өөрчлөгдсөн талбар л */
  updates: Row[];
  /** HO-д байхгүй гэрээний шинэ мөрүүд (2026-11-04) — төлбөргүй; дараагийн тооцоонд `matched`-д орж дахин нэмэгдэхгүй */
  adds: Row[];
  /** Гэрээ (geree_kod) → тохирсон Cashflow мөрийн objectid-ууд */
  matched: Map<string, number[]>;
  /** Cashflow мөр олдоогүй гэрээнүүд (хөндөхгүй) */
  unmatched: string[];
};

/**
 * HO бүх мөр + Cashflow ажлын мөрүүд → засварын жагсаалт (цэвэр). `share` (үнэт цаасны хувь) олон мөртэй гэрээнд хөндөхгүй (null → алгасна).
 */
/**
 * БАГЦЫН ДҮН → ДЭД МӨРҮҮД (2026-11-04, хэрэглэгч): багцын гэрээний дүн дэд мөрүүдийн нийлбэрээс 1 ₮-өөс илүү зөрвөл дэд мөр бүр
 * ижил хувиар өөрчлөгдөнө — барилгын төрлийн зөрүү, газар шорооны мөр хэвээр. Бүхэл ₮-ээр; бөөрөнхийллийн үлдэгдлийг сүүлийн мөр авна.
 */
export function planBlockBudgets(tree: PlanTree): Row[] {
  const out: Row[] = [];
  for (const n of tree.nodes) {
    if (!isSplitParent(n)) continue;
    const own = n.row!.ho_dun_geree as number;
    const kids = n.children.filter((c) => !c.outside && c.row?.objectid != null && (c.row.ho_dun_geree ?? 0) > 0);
    const sum = kids.reduce((a, c) => a + (c.row!.ho_dun_geree as number), 0);
    if (Math.abs(sum - own) < 1) continue;
    let left = own;
    kids.forEach((c, i) => {
      const v = i === kids.length - 1 ? left : Math.round(((c.row!.ho_dun_geree as number) * own) / sum);
      left -= v;
      out.push({ [CASHFLOW_NEW.oid]: c.row!.objectid, [CF.budget]: v });
    });
  }
  return out;
}

const SYNC_PHASES: readonly string[] = ['ТЭЗҮ', 'Ажлын зураг төсөл', 'Барилга угсралт'];

/**
 * HO-Д БАЙХГҮЙ ГЭРЭЭ (2026-11-04, хэрэглэгч): «Гэрээлсэн дүн» тэмдэгтэй, дүнтэй, ямар ч HO гэрээнд тохироогүй Cashflow мөр →
 * шинэ HO мөр. Нэг гэрээний дугаартай мөрүүд нэг гэрээ. Код нь тогтмол (`bagts`, давхцвал үе шат нэмнэ) тул хоёр хэрэглэгч зэрэг
 * нэмсэн ч нэг гэрээний мөр болж нэгтгэгдэнэ. `planHoSync`-ийн дүрмээр дараагийн удаа таарах тул дахин нэмэгдэхгүй.
 */
function missingContracts(
  hoRows: readonly Row[],
  cfRows: readonly Row[],
  byContract: ReadonlyMap<string, Row[]>,
  matched: ReadonlyMap<string, number[]>,
  /** Цуцлагдсан гэрээний Cashflow мөрүүд — эзэнтэй, шинэ гэрээ үүсгэхгүй (2026-11-05 аудит) */
  cancelledUsed: readonly number[] = [],
): Row[] {
  const used = new Set([...[...matched.values()].flat(), ...cancelledUsed]);
  const groups = new Map<string, Row[]>();
  for (const r of cfRows) {
    const oid = Number(r[CASHFLOW_NEW.oid]);
    if (txt(r[CF.amountNote]) !== CONTRACTED_NOTE || used.has(oid)) continue;
    if (!SYNC_PHASES.includes(txt(r[CF.phase])) || !((num(r[CF.contractAmount]) ?? 0) > 0)) continue;
    const k = txt(r[CF.contractNo]) || `oid:${oid}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const codes = new Set(byContract.keys());
  const P = HO_IPC.payFields;
  let id = 0;
  for (const r of hoRows) {
    const m = /^ХО-(\d+)$/.exec(txt(r[P.id]));
    if (m) id = Math.max(id, Number(m[1]));
  }
  const adds: Row[] = [];
  for (const [key, rows] of groups) {
    const pkg = [...new Set(rows.map((r) => txt(r[CF.pkg])).filter(Boolean))].join(', ');
    const part = hoPkgParts(pkg)[0];
    if (!part) continue;
    const phase = txt(rows[0][CF.phase]);
    /* Цуцлагдсан гэрээг дахин, дахин гэрээлэхэд код нь өмнөх гэрээнийхтэй нийлэхгүй — дугаар нэмнэ (тогтмол хэвээр) */
    const withPhase = `${pkg} · ${phase}`;
    const code = !codes.has(pkg) ? pkg : !codes.has(withPhase) ? withPhase : `${withPhase} · ${key}`;
    codes.add(code);
    id += 1;
    adds.push({
      [P.id]: `ХО-${String(id).padStart(4, '0')}`,
      [HC.code]: code,
      [HC.pkg]: pkg,
      [HC.workType]: phase !== 'Барилга угсралт' ? 'ТЭЗҮ,Судалгаа' : /^[1-4](\.|$)/.test(part) ? 'Барилга угсралт' : 'ГИШСүлжээ',
      [HC.project]: txt(rows[0][CF.detail]) || null,
      ...hoFromCf(rows),
    });
  }
  return adds;
}

export type PaidSyncPlan = {
  /** `Guitsetgel_talbe/182`-ийн засвар — зөрсөн `olgoson_dun`, `urdchilgaa_dun` л */
  updates: Row[];
  /** Гэрээний мөрт оноогдоогүй төлбөрийн `murun_id` — анхааруулгад */
  unassigned: string[];
};

/**
 * IPC → ТТБ (2026-11-04, хэрэглэгч): IPC-ийн `dun` бичигдсэн мөр бүрийг гэрээний мөрт оноож нийлбэрлэнэ. `dun` зөвхөн «Олгосон»
 * шатанд бичигддэг тул IPC үүссэн ч олгоогүй дүн тоологдохгүй. Олон багцтай гэрээнд мөр нь өөрийн `bagts`-ийн багцад очно.
 */
export function planPaidSync(hoRows: readonly Row[], cfRows: readonly Row[]): PaidSyncPlan {
  const { matched } = planHoSync(hoRows, cfRows);
  const byOid = new Map(cfRows.map((r) => [Number(r[CASHFLOW_NEW.oid]), r] as const));
  const paid = new Map<number, number>();
  const adv = new Map<number, number>();
  const unassigned: string[] = [];
  for (const r of hoRows) {
    const v = num(r[HO_IPC.payFields.amount]);
    if (v == null) continue;
    const ids = matched.get(txt(r[HC.code])) ?? [];
    if (!ids.length) { unassigned.push(txt(r[HO_IPC.payFields.id]) || String(r[HO_IPC.oid])); continue; }
    /* Олон мөрд таарвал мөрийн багцынхад, тэдгээрт гэрээний дүнгийн жингээр хуваана — төлбөр хасагдахгүй */
    const parts = hoPkgParts(r[HC.pkg]);
    const inPkg = ids.filter((i) => parts.includes(hoPkgParts(byOid.get(i)?.[CF.pkg])[0] ?? ''));
    const targets = inPkg.length ? inPkg : ids;
    const weights = targets.map((i) => Math.max(num(byOid.get(i)?.[CF.contractAmount]) ?? 0, 0));
    const tw = weights.reduce((a, w) => a + w, 0);
    let left = v;
    targets.forEach((oid, k) => {
      const share = k === targets.length - 1 ? left : Math.round((tw > 0 ? v * weights[k] / tw : v / targets.length) * 100) / 100;
      left -= share;
      paid.set(oid, (paid.get(oid) ?? 0) + share);
      if (r[HO_IPC.payFields.kind] === HO_IPC.kinds.advance) adv.set(oid, (adv.get(oid) ?? 0) + share);
    });
  }
  const updates: Row[] = [];
  for (const r of cfRows) {
    const oid = Number(r[CASHFLOW_NEW.oid]);
    const u: Row = {};
    const p = paid.get(oid) ?? null;
    const a = adv.get(oid) ?? null;
    if (!same(r[CF.paid], p)) u[CF.paid] = p;
    if (!same(r[CF.advance], a)) u[CF.advance] = a;
    if (Object.keys(u).length) updates.push({ [CASHFLOW_NEW.oid]: oid, ...u });
  }
  return { updates, unassigned };
}

/**
 * Багц · үе шатаар тохирсон мөрүүдээс ЭНЭ гэрээнийхийг сонгоно: дугаар нь ижил мөр (дугааргүй гэрээнд дугааргүй мөр). Ийм мөр огт
 * алга бол 182-т дугаар засагдсан гэж үзэж (`hoFromCf` шинэ дугаарыг HO-д бичнэ) өөр гэрээний дугааргүй мөрүүдийг авна.
 */
function ownCfRows(cf: readonly Row[], nos: ReadonlySet<string>, otherNos: ReadonlySet<string>): Row[] {
  const noOf = (r: Row): string => txt(r[CF.contractNo]);
  /* Нотолгоо нь дугаар: хамт байгаа дугааргүй мөр нь дугаар засагдсаныг нуухгүй */
  const exact = cf.some((r) => (nos.size ? nos.has(noOf(r)) : !noOf(r)));
  return cf.filter((r) => (exact ? !noOf(r) || nos.has(noOf(r)) : !otherNos.has(noOf(r))));
}

export function planHoSync(hoRows: readonly Row[], cfRows: readonly Row[]): HoSyncPlan {
  const byContract = new Map<string, Row[]>();
  for (const r of hoRows) {
    const code = txt(r[HC.code]);
    if (!code) continue;
    byContract.set(code, [...(byContract.get(code) ?? []), r]);
  }
  const nosOf = (rows: readonly Row[]): Set<string> => new Set(rows.map((r) => txt(r[HC.contractNo])).filter(Boolean));
  const updates: Row[] = [];
  const matched = new Map<string, number[]>();
  const unmatched: string[] = [];
  const cancelledUsed: number[] = [];
  for (const [code, rows] of byContract) {
    /* 2026-11-04: багц бүрийн мөртэй гэрээ — гэрээний БҮХ мөрийн багцыг нэгтгэнэ (эхний мөрийнх биш) */
    const parts = [...new Set(rows.flatMap((r) => hoPkgParts(r[HC.pkg])))];
    const phases = phasesOf(rows.map((r) => txt(r[HC.workType])).find(Boolean) ?? '');
    const fit = cfRows.filter((r) => cfMatches(r, parts, phases));
    const nos = nosOf(rows);
    /* Гэрээ бүхлээрээ цуцлагдсан бол хөндөхгүй — гэхдээ Cashflow мөрүүд нь «эзэнгүй» гэж ШИНЭ гэрээ үүсгэхгүй
       (2026-11-05 аудит: гаднаас цуцалсан гэрээнд давхар ХО мөр үүсдэг байв). Өөр дугаартай мөр бол цуцлагдсаны дараа байгуулсан ШИНЭ гэрээ — эзэмшихгүй */
    if (contractCancelled(rows)) {
      cancelledUsed.push(...fit.filter((r) => { const no = txt(r[CF.contractNo]); return nos.size ? nos.has(no) : !no; }).map((r) => Number(r[CASHFLOW_NEW.oid])));
      continue;
    }
    const otherNos = new Set<string>();
    for (const [c2, r2] of byContract) if (c2 !== code) for (const n of nosOf(r2)) otherNos.add(n);
    const cf = ownCfRows(fit, nos, otherNos);
    if (!cf.length) { unmatched.push(code); continue; }
    matched.set(code, cf.map((r) => Number(r[CASHFLOW_NEW.oid])));
    const want = hoFromCf(cf);
    for (const r of rows) {
      const upd: Row = {};
      for (const [f, v] of Object.entries(want)) if (!same(r[f], v)) upd[f] = v;
      if (Object.keys(upd).length) updates.push({ [HO_IPC.oid]: r[HO_IPC.oid], ...upd });
    }
  }
  return { updates, adds: missingContracts(hoRows, cfRows, byContract, matched, cancelledUsed), matched, unmatched };
}

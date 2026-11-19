/**
 * ЗУРАГ ТӨСЛИЙН БҮРТГЭЛ (2026-11-11, хэрэглэгч: «ЗУРАГ ТӨСӨЛ-LOG»-ийн загвараар, PDF системээр оруулдаг) — хүснэгт 234.
 * Харагдац: `src/modules/ZuragBurtgel.tsx` («ТЭЗҮ · Ажлын зураг төсөл» хуудасны «Зургийн бүртгэл» таб).
 * Цэвэр хэсэг (`toZRow`, `groupZ`, `zuragPkgStats`) тестлэгдэнэ (`zuragBurtgel.check.mjs`).
 */
import { CASHFLOW_NEW, ZURAG_BURTGEL, bagtsKey, canonPkg } from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { cached, SESSION_TTL_MS } from '@/lib/live';

type Row = Record<string, unknown>;

/** Огнооны талбарууд (ms) */
export const Z_DATES = ['batlagdsan_ognoo', 'magadlal_ognoo', 'davtan_magadlal_ognoo', 'huleej_avsan_ognoo', 'guitsetgegchid_ogson_ognoo'] as const;
export type ZDate = (typeof Z_DATES)[number];

/**
 * ТӨЛӨВ (2026-11-17, хэрэглэгч: «төлөв гэж багана нэмээд төлөв тогтоогоод хувь бодвол · мөнгөн дүн ашиглахгүй, төлөвөөр
 * гүйцэтгэлийн хувь холбоё»). Баримт бүр нэг төлөвтэй, төлөв бүр тогтсон хувьтай; гүйцэтгэл = хувиудын дундаж.
 * Хүснэгтийн `tolov` талбар хоосон бол огнооноос таамаглана (`deriveTolov`) — гараар 328 мөр бөглөх шаардлагагүй.
 */
export const Z_TOLOV = [
  { code: 'ehleegui', pct: 0 },
  { code: 'magadlal', pct: 80 },
  { code: 'huleej_avsan', pct: 100 },
] as const;
export type ZTolov = (typeof Z_TOLOV)[number]['code'];
const TOLOV_PCT = new Map<string, number>(Z_TOLOV.map((t) => [t.code, t.pct]));
export const tolovPct = (t: ZTolov): number => TOLOV_PCT.get(t) ?? 0;
/** Огнооноос: хүлээж авсан огноотой → хүлээж авсан; магадлал/давтан магадлал/ХБХСГ-аар батлагдсан → магадлалд орсон; эс бөгөөс эхлээгүй */
export function deriveTolov(d: Record<ZDate, number | null>): ZTolov {
  if (d.huleej_avsan_ognoo != null) return 'huleej_avsan';
  if (d.magadlal_ognoo != null || d.davtan_magadlal_ognoo != null || d.batlagdsan_ognoo != null) return 'magadlal';
  return 'ehleegui';
}
/** Баримтуудын гүйцэтгэл (0–100) — төлөвийн хувийн дундаж; хоосон бол null */
export function tolovAvg(rows: readonly Pick<ZRow, 'tolov'>[]): number | null {
  if (!rows.length) return null;
  return rows.reduce((a, r) => a + tolovPct(r.tolov), 0) / rows.length;
}

export type ZRow = {
  oid: number;
  /** Төлөв — хадгалсан (`tolov`) › огнооноос таамагласан */
  tolov: ZTolov;
  buleg: string;
  dedBuleg: string;
  dd: number | null;
  bagts: string;
  gereeDugaar: string;
  ner: string;
  shifr: string;
  hyanah: string;
  zohiogch: string;
  dates: Record<ZDate, number | null>;
  rev: string;
  burdel: string;
  helber: string;
  pdfHuudas: number | null;
  pdfNer: string;
  pdfItem: string;
  asuudal: string;
  tailbar: string;
  /* 2026-11-16 (хэрэглэгч: «бүгдийг ил гарга») — эх Excel-ийн үлдсэн баганууд */
  gereeNer: string;
  huleejAkt: string;
  ogsonAkt: string;
  davtanShaardlaga: string;
  zovshoorol: string;
  format: string;
  burdelDugaar: string;
  tsaasaarHuvi: string;
  /* 2026-11-16: нэг нүд = нэг утга — төрөл, дэд бүлгийн дугаар, мөнгөн дүн, холбоос тус тусдаа талбарт */
  /** Баримтын төрөл — `zurag` · `tosov` (эх Excel-ийн «Ажлын зураг төсөл» · «ТӨСӨВ» хуудас) */
  turul: 'zurag' | 'tosov';
  /** Дэд бүлгийн дугаар («300», «200.10») — нэрээс тусдаа */
  dedKod: string;
  /** Дэд бүлгийн нэр — дугааргүй */
  dedNer: string;
  /** Төсвийн баримтын төсөвт өртөг, ₮ */
  tosovtOrtog: number | null;
  /**
   * АЖЛЫН ҮНЭ, ₮ (2026-11-17, хэрэглэгч: «зургийн бүртгэлд мөнгөн дүнгийн field нэмээд … зураг нэг бүрийн … тэр нь ТТБ рүү
   * ордог») — энэ баримтыг хийлгэсний хөлс. Зургийн мэргэжилтэн бүртгэлээс оруулна; ТТБ-ийн мөрийн төсөвт өртөг болно.
   */
  ajliinUne: number | null;
  /** OneDrive холбоосууд: ажлын үр дүнгийн PDF · гэрээ · хүлээж авсан акт · гүйцэтгэгчид хүлээлгэж өгсөн акт */
  pdfUrl: string;
  gereeUrl: string;
  huleejAktUrl: string;
  ogsonAktUrl: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Хүснэгтийн мөр → `ZRow` (цэвэр) */
export function toZRow(a: Row): ZRow {
  /* Дэд бүлэг: дугаар `ded_buleg_kod`-д тусдаа; нэрэнд дугаар үлдсэн хуучин мөрөөс ч салгаж уншина. Харуулах/бүлэглэх
     түлхүүр = «дугаар. нэр» (ижил нэртэй «БАГЦ 1» дэд бүлгүүд 200.10 · 300.10 гэж ялгарна) */
  const dm = /^\s*(\d{3}(?:\.\d+)*)\.?\s*(.*)$/.exec(str(a.ded_buleg));
  const dedKod = str(a.ded_buleg_kod) || (dm ? dm[1] : '');
  const dedNer = dm ? dm[2].trim() : str(a.ded_buleg);
  const buleg = str(a.buleg);
  const url = (v: unknown): string => { const s = str(v); return /^https?:\/\//i.test(s) ? s : ''; };
  const dates = Object.fromEntries(Z_DATES.map((k) => [k, num(a[k])])) as Record<ZDate, number | null>;
  const stored = str(a.tolov);
  return {
    oid: Number(a.objectid),
    tolov: TOLOV_PCT.has(stored) ? stored as ZTolov : deriveTolov(dates),
    buleg,
    dedBuleg: dedKod && dedNer ? `${dedKod}. ${dedNer}` : dedNer,
    dedKod,
    dedNer,
    turul: str(a.turul) === 'tosov' || (!str(a.turul) && buleg.startsWith('005')) ? 'tosov' : 'zurag',
    tosovtOrtog: num(a.tosovt_ortog),
    ajliinUne: num(a.ajliin_une),
    pdfUrl: url(a.pdf_holboos),
    gereeUrl: url(a.geree_holboos),
    huleejAktUrl: url(a.huleej_avsan_akt_holboos),
    ogsonAktUrl: url(a.ogson_akt_holboos),
    dd: num(a.dd),
    bagts: str(a.bagts),
    gereeDugaar: str(a.geree_dugaar),
    ner: str(a.ner),
    shifr: str(a.shifr),
    hyanah: str(a.hyanah_ajiltan),
    zohiogch: str(a.zohiogch),
    dates,
    rev: str(a.rev),
    burdel: str(a.burdel),
    helber: str(a.helber),
    pdfHuudas: num(a.pdf_huudas),
    pdfNer: str(a.pdf_ner),
    pdfItem: str(a.pdf_item_id),
    asuudal: str(a.asuudal),
    tailbar: str(a.tailbar),
    gereeNer: str(a.geree_ner),
    huleejAkt: str(a.huleej_avsan_akt),
    ogsonAkt: str(a.guitsetgegchid_ogson_akt),
    davtanShaardlaga: str(a.davtan_magadlal_shaardlaga),
    zovshoorol: str(a.zovshoorol),
    format: str(a.format),
    burdelDugaar: str(a.burdel_dugaar),
    tsaasaarHuvi: str(a.tsaasaar_huvi),
  };
}

/* ══════════════════ ТӨСВИЙН БАГЦААР НЭГТГЭХ (2026-11-16) ══════════════════
 * Хэрэглэгч: «төсвийн багцын нэрээр нэгтгэнэ — төсөв "Багц 1,2" гэж байвал Багц 1, Багц 2-ыг оруулна». Төсвийн баримтын
 * багц (нэг эсвэл хэд хэдэн) = бүлэг; тэр багцуудын зураг бүлгийн доор. Төсвийн дүнг багцуудад ХУВААХГҮЙ (Багц 1,2-ын
 * төсвийн хэд нь аль багцынх нь мэдэгдэхгүй). Нэг зураг хэд хэдэн бүлэгт харагдаж болно.
 */

/** Багцын дугаарууд: «Багц 1,2» → [1, 2]; «Багц 3-1» · «Багц 3.1» → [3.1]; «17.1» → [17.1]; «Бүх багц» · «Байхгүй» · хоосон → [] */
export function pkgNums(v: string): string[] {
  const m = /(\d+(?:\s*[.,-]\s*\d+)*)/.exec(v.replace(/багц/gi, ' '));
  if (!m) return [];
  return m[1].split(',').map((x) => x.trim().replace(/\s*[-.]\s*/g, '.')).filter(Boolean);
}

/** Баримтын багц: зураг — дэд бүлгийн «… БАГЦ 3-2» (`zuragPkgStats`-тай нэг дүрэм) › «Багц» багана; төсөв — «Багц» багана › нэрийн эхний «Багц 1,2-ын …» */
export function docPkgs(r: Pick<ZRow, 'turul' | 'bagts' | 'dedBuleg' | 'ner'>): string[] {
  if (r.turul === 'zurag') {
    const sub = /багц\s*[\d.,\s-]+/i.exec(r.dedBuleg);
    if (sub) return pkgNums(sub[0]);
    return pkgNums(r.bagts);
  }
  const own = pkgNums(r.bagts);
  if (own.length) return own;
  const nm = /^\s*багц[\s-]*\d+(?:\s*[.,-]\s*\d+)*/i.exec(r.ner);
  return nm ? pkgNums(nm[0]) : [];
}

/** Зургийн багц `d` төсвийн багц `b`-д хамаарах уу: ижил, эсвэл дэд багц («3.1» ∈ «3»; «17.1» ∉ «1») */
const within = (d: string, b: string): boolean => d === b || d.startsWith(`${b}.`);
const pkgSort = (a: string, b: string): number => a.localeCompare(b, 'mn', { numeric: true });

/** `label` — багцын дугааргүй ч нэртэй бүлэг («Тухайлсан», «Бүх багц», «Байхгүй»); `key` = '@' + нэр */
export type BudgetGroup = { key: string; pkgs: string[]; label?: string; tosov: ZRow[]; zurag: ZRow[] };

/** Багцын дугааргүй «Багц» утга → бүлгийн нэр («Тухайлсан» …); хоосон бол null (2026-11-19) */
const textPkg = (r: Pick<ZRow, 'bagts'>): string | null => {
  const v = String(r.bagts ?? '').replace(/\s+/g, ' ').trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : null;
};

/**
 * Төсвийн багцаар бүлэглэнэ (цэвэр). Дараалал: багцын дугаараар; ганц багц нь хамтынхаас түрүүнд. Төсөвгүй багцын зураг
 * өөрийн багцаар бүлэг болно; багцгүй баримт `key` = '' бүлэгт (сүүлд).
 */
export function groupByBudget(rows: readonly ZRow[]): BudgetGroup[] {
  const by = new Map<string, BudgetGroup>();
  /* 2026-11-19 (хэрэглэгч: «тухайлсан барилгуудын зураг»): дугааргүй «Багц» утгатай баримт («Тухайлсан» …) «Багц заагаагүй»
     биш өөрийн нэрээр бүлэг болно */
  const at = (pkgs: string[], r?: ZRow): BudgetGroup => {
    const p = [...new Set(pkgs)].sort(pkgSort);
    const label = !p.length && r ? textPkg(r) : null;
    const key = label ? `@${label}` : p.join(',');
    let g = by.get(key);
    if (!g) { g = { key, pkgs: p, ...(label ? { label } : {}), tosov: [], zurag: [] }; by.set(key, g); }
    return g;
  };
  for (const r of rows) if (r.turul === 'tosov') at(docPkgs(r), r).tosov.push(r);
  const budget = [...by.values()].filter((g) => g.pkgs.length);
  for (const r of rows) {
    if (r.turul !== 'zurag') continue;
    const d = docPkgs(r);
    const hit = d.length ? budget.filter((g) => d.some((x) => g.pkgs.some((b) => within(x, b)))) : [];
    if (hit.length) for (const g of hit) g.zurag.push(r);
    else at(d, r).zurag.push(r);
  }
  /* дараалал: багцын дугаартай → нэртэй («Тухайлсан» …) → багц заагаагүй */
  const rank = (g: BudgetGroup): number => (!g.key ? 2 : g.label ? 1 : 0);
  return [...by.values()].sort((a, b) => (
    rank(a) - rank(b) || (rank(a) === 0
      ? pkgSort(a.pkgs[0], b.pkgs[0]) || a.pkgs.length - b.pkgs.length || pkgSort(a.key, b.key)
      : pkgSort(a.key, b.key))
  ));
}

/**
 * ДЭД БҮЛГИЙН ХАРАГДАХ НЭР (2026-11-17, хэрэглэгч: «дугаарлалт 200 300 ??») — эх Excel-ийн дугаар (100 · 200.10 · 200.20 …)
 * бүлэг бүрт өөр, давхардсан («200.20» таван дэд бүлэгт) тул харуулахгүй; систем бүлэг дотроо 1, 2, 3 … гэж дугаарлана.
 * Excel-ийн дугаар `ded_buleg_kod` талбарт хэвээр. `j` = бүлэг доторх дараалал (0-ээс).
 */
export const subLabel = (sub: { ded: string; rows: readonly Pick<ZRow, 'dedNer'>[] }, j: number): string => (
  sub.ded ? `${j + 1}. ${sub.rows[0]?.dedNer || sub.ded}` : ''
);

/**
 * БҮЛГИЙН ХАРАГДАХ НЭР (2026-11-17, хэрэглэгч: «одоо Excel хамаагүй») — Excel-ийн «003.» угтварыг харуулахгүй, систем
 * 1, 2, 3 … гэж дугаарлана. `i` = харагдаж буй жагсаалт доторх дараалал (0-ээс). Хүснэгтийн `buleg` утга хэвээр.
 */
export const bulegLabel = (buleg: string, i: number): string => `${i + 1}. ${buleg.replace(/^\s*\d{3}\.?\s*/, '')}`;

/** Бүлэг → дэд бүлэг → мөрүүд, хүснэгтийн дарааллаар (цэвэр) */
export function groupZ(rows: readonly ZRow[]): { buleg: string; subs: { ded: string; rows: ZRow[] }[] }[] {
  const out: { buleg: string; subs: { ded: string; rows: ZRow[] }[] }[] = [];
  for (const r of rows) {
    let g = out.find((x) => x.buleg === r.buleg);
    if (!g) { g = { buleg: r.buleg, subs: [] }; out.push(g); }
    let s = g.subs.find((x) => x.ded === r.dedBuleg);
    if (!s) { s = { ded: r.dedBuleg, rows: [] }; g.subs.push(s); }
    s.rows.push(r);
  }
  return out;
}

/**
 * Багц бүрийн тоо (цэвэр): нийт, магадлалд орсон, зохиогчоос хүлээж авсан, PDF-тэй. «Багц 1,2» шиг олон багцын мөр
 * багц бүрт тоологдоно. Төсөв (005) орохгүй. Дэд бүлэг нь «… БАГЦ 3-2» бол багцыг ТЭНДЭЭС авна (Excel-ийн «300.40. БАГЦ 3-2»
 * хэсгийн мөрүүдэд «Багц 3-1» гэж буруу бичигдсэн).
 */
export function zuragPkgStats(rows: readonly ZRow[]): Map<string, { total: number; magadlal: number; received: number; pdf: number; pct: number }> {
  const out = new Map<string, { total: number; magadlal: number; received: number; pdf: number; pct: number }>();
  for (const r of rows) {
    if (r.turul === 'tosov') continue;
    const fromSub = pkgKeysOf(r.dedBuleg);
    for (const k of fromSub.length ? fromSub : pkgKeysOf(r.bagts)) {
      const s = out.get(k) ?? { total: 0, magadlal: 0, received: 0, pdf: 0, pct: 0 };
      s.total += 1;
      s.pct += tolovPct(r.tolov);
      if (r.dates.magadlal_ognoo != null || r.dates.davtan_magadlal_ognoo != null) s.magadlal += 1;
      if (r.dates.huleej_avsan_ognoo != null) s.received += 1;
      if (r.pdfItem) s.pdf += 1;
      out.set(k, s);
    }
  }
  return out;
}

/** «Багц 1,2» → [БАГЦ1, БАГЦ2]; «Багц 3-1» → [БАГЦ31]; «Бүх багц»/«Байхгүй» → [] */
export function pkgKeysOf(v: string): string[] {
  const m = /багц\s*([\d.,\s-]+)/i.exec(v);
  if (!m) return [];
  const parts = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) return parts.map((p) => bagtsKey(`Багц ${p}`)).filter(Boolean);
  return [bagtsKey(`Багц ${parts[0] ?? ''}`)].filter(Boolean);
}

/** ЗУРАГ ТӨСЛИЙН ЯВЦ (2026-11-11, хэрэглэгч: «Магадлалд орсон»): багц → магадлалд орсон ÷ нийт × 100 (0–100) */
export function zuragPctMap(rows: readonly ZRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, s] of zuragPkgStats(rows)) if (s.total > 0) out.set(k, s.pct / s.total);
  return out;
}

/**
 * ГЭРЭЭГЭЭР ХОЛБОХ (2026-11-16, хэрэглэгч: «зураг төсөл 2 өөр газар 2 бүтэцтэй бүртгэгдчихээд байна · зургийн бүртгэл
 * зөв · ТТБ-д зөвхөн үр дүн орно»). Бүртгэлийн мөр бүр гэрээний дугаартай (эх Excel «ЗУРАГ ТӨСӨЛ-LOG», D багана); тэр
 * дугаар нь «Төсөл төлөвлөгөө биелэлт»-ийн ТЭЗҮ · Ажлын зураг төслийн мөрийн `geree_dugaar`-тай таарна. Түлхүүр — үсэг,
 * цифр л («№НХААГ202311392/01» = «НХААГ/202311392/01»).
 */
export const gereeKey = (v: unknown): string => String(v ?? '').toUpperCase().replace(/[^0-9A-ZА-ЯӨҮЁ]/g, '');

/** Гэрээ → төлөвийн хувийн дундаж (0–100). Гэрээгүй мөр орохгүй; бүх бүлэг (төсөв ч) тоологдоно */
export function zuragGereePct(rows: readonly ZRow[]): Map<string, number> {
  const cnt = new Map<string, [number, number]>();
  for (const r of rows) {
    const k = gereeKey(r.gereeDugaar);
    if (!k) continue;
    const c = cnt.get(k) ?? [0, 0];
    c[0] += tolovPct(r.tolov);
    c[1] += 1;
    cnt.set(k, c);
  }
  const out = new Map<string, number>();
  for (const [k, [a, b]] of cnt) out.set(k, a / b);
  return out;
}

type GNode = { phase: string; row: { geree_dugaar?: string | null } | null; parent: GNode | null };
/**
 * ТТБ-ийн мөрийг дарах утга: ТЭЗҮ · Ажлын зураг төслийн мөрийн гэрээ бүртгэлд байвал S = бүртгэлийн хувь; тийм мөрийн
 * ДООД мөрүүд хувьгүй (`null` — задаргаа нь бүртгэлд, ТТБ-д зөвхөн үр дүн). Бусад мөр `undefined` (хуучин дүрмээр).
 */
export function gereeOverride(pct: ReadonlyMap<string, number>): (n: GNode) => { S: number | null } | undefined {
  const own = (n: GNode): number | undefined => {
    if (n.phase !== 'tezu' && n.phase !== 'zurag') return undefined;
    const k = gereeKey(n.row?.geree_dugaar);
    return k ? pct.get(k) : undefined;
  };
  return (n) => {
    const v = own(n);
    if (v !== undefined) return { S: v };
    for (let p = n.parent; p && p.row; p = p.parent) if (own(p) !== undefined) return { S: null };
    return undefined;
  };
}

async function fetchZ(): Promise<ZRow[]> {
  const rows = await queryFeatures(ZURAG_BURTGEL.url, { outFields: ['*'], orderBy: `${ZURAG_BURTGEL.oid} ASC` });
  return rows.map(toZRow);
}
export const loadZuragBurtgel = cached(fetchZ, SESSION_TTL_MS, ['ZURAG_BURTGEL']);

/**
 * «+ Зураг нэмэх»-ийн БАГЦЫН ЖАГСААЛТ (хэрэглэгч 2026-11-17: «багцаа ТТБ-ийн нэрийн дагуу сонгох боломж алга, гараар бичвэл
 * алдах магадлалтай») — «Төсөл төлөвлөгөө биелэлт»-ийн «Барилга угсралт» үе шатын мөрүүдийн багцын нэр, давхардалгүй,
 * Д/Д-ийн дарааллаар. Олон багц нэг нүдэнд («БАГЦ-6.1, 6.2», «БАГЦ 1- 4») бичсэн нэгтгэсэн мөр ОРОХГҮЙ — нэг сонголт = нэг багц.
 */
export function planPkgNames(rows: readonly { dd_kod?: unknown; bagts?: unknown; ajil_uilchilgee?: unknown }[]): string[] {
  const t = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const top = rows.find((r) => /^\d+$/.test(t(r.dd_kod)) && t(r.ajil_uilchilgee).toLowerCase() === 'барилга угсралт');
  if (!top) return [];
  const pre = `${t(top.dd_kod)}.`;
  const num = (c: string) => c.split('.').map(Number);
  const cmp = (a: string, b: string) => { const x = num(a), y = num(b); for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...rows].filter((x) => t(x.dd_kod).startsWith(pre)).sort((a, b) => cmp(t(a.dd_kod), t(b.dd_kod)))) {
    const name = t(r.bagts);
    if (!name || /,/.test(name) || /\d\s*[-–]\s+\d/.test(name)) continue;
    const k = bagtsKey(name);
    if (seen.has(k)) continue;
    seen.add(k); out.push(canonPkg(name));
  }
  return out;
}
export const loadPlanPkgs = cached(async () => planPkgNames(await queryFeatures(CASHFLOW_NEW.url, {
  where: `${CASHFLOW_NEW.fields.ddKod} IS NOT NULL`,
  outFields: [CASHFLOW_NEW.fields.ddKod, CASHFLOW_NEW.fields.pkg, CASHFLOW_NEW.fields.detail],
})), SESSION_TTL_MS, ['CASHFLOW_NEW']);

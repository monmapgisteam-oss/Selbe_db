/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ · БИЕЛЭЛТ — Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудасны
 * (261007 V3) ТОМЬЁОНЫ ЦЭВЭР ХӨДӨЛГҮҮР. React-гүй, сүлжээгүй — тестлэгдэнэ.
 *
 * Оролт: `CASHFLOW_NEW` хүснэгтэд хадгалсан Excel-ийн мөрүүд (dd_kod · etseg_kod ·
 * тогтмол нүднүүд) + амьд утгууд (бөглөх хуудасны блокийн гүйцэтгэл, Хуваарийн
 * төлөвлөгөөт %, газар чөлөөлөлтийн %, өнөөдөр). Гаралт: мөр бүрийн E…W.
 *
 *   E  Урьдчилсан төсөвт өртөг   — хадгалсан, эс бөгөөс хүүхдүүдийн НИЙЛБЭР
 *   F  Хэсэгт эзлэх (0–100)      — хадгалсан › G/G_эцэг › E/E_эцэг › Барилга угсралтын хосын F
 *   G  Төсөлд эзлэх (0–100)      — хадгалсан › F × G_эцэг
 *   H/I · J/K · L/M огноо         — хадгалсан, эс бөгөөс үр удмын MIN эхлэх / MAX дуусах
 *   N/O/P/Q/R/S (0–100)          — навч: дүрмээр (доор), эцэг: Σ F_хүүхэд × X_хүүхэд
 *   T/U/V/W (0–100)              — S/N · S/O · S/P · S/R  (хуваарь 0 → 0)
 *
 * ⚠️ НЭГЖ (2026-10-26, тохирсон тодорхойлолт): ГАРАЛТ БҮХ ХУВЬ 0–100 (`pct()` 100-аар
 *    үржүүлдэггүй). Хувиргалт ЗӨВХӨН ирмэг дээр НЭГ удаа. ХАДГАЛСАН нэгж нь импорттой
 *    (`tools/cashflow-import.mjs`) тааруулсан: жин `heseg_ezleh_huvi`/`tusul_ezleh_huvi` нь
 *    Excel-ийнхээрээ БУТАРХАЙ (0–1), `guitsetgel_huvi` нь 0–100 (`STORED_WEIGHT`).
 *    Дотор нь бутархайгаар бодоод гаргахдаа ×100.
 * ⚠️ null ≠ 0. Мэдээлэлгүй нүд `null` хэвээр. Эцгийн нийлбэрт null хүүхэд НЭМЭГДЭХГҮЙ
 *    (Excel-ийн SUMPRODUCT хоосон нүдийг 0 гэж үздэгтэй ТООН ДҮНГЭЭРЭЭ адил), харин
 *    БҮХ хүүхэд null бол эцэг ч null — Excel тэнд 0 гаргадаг, бид «мэдэхгүй» гэнэ.
 * ⚠️ ЖИНГ ДАХИН ХЭВИЙН БОЛГОХГҮЙ: эцэг = Σ F·X, Σ F-д хуваахгүй — Excel ингэдэг.
 *    Мэдэгдэж буй хүүхдүүдээр хуваавал «хуваарьгүй» блок нийт хувийг хөөргөнө.
 *
 * ⚠️ ЭЦГИЙН ХОЛБООС = `etseg_kod`, outlineLevel БИШ. Excel-ийн outlineLevel 113 мөрөнд
 *    томьёоны бүтэцтэй ЗӨРДӨГ (жиш. «Багц 6» мөр 36 нь outline-аар 10-ын хүүхэд, гэтэл
 *    N35 = F36·N36+F48·N48+F56·N56). Импорт `etseg_kod`-ыг томьёоны лавлагаагаар гаргана.
 * ⚠️ «НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)» хэсэг ЭЦГИЙНХЭЭ НИЙЛБЭРТ ОРОХГҮЙ (`outside`):
 *    Excel-д E718 = SUM(E719,E842,E858), N718 = F719·N719+F842·N842+F858·N858 — 891-р мөр
 *    хасагдсан, ах дүүсийн F-ийн нийлбэр түүнгүйгээр = 1. Үе шат бүрийн (2·3·Зөвшөөрөл·4·
 *    Бэлтгэл) ижил хэсэг мөн адил. Мөр өөрөө харагдаж, дотроо бодогдоно.
 */
import { spanFrac } from './plan';
import { t as tr } from '@/lib/i18nCore';

/* ══════════════════ Төрлүүд ══════════════════ */

/** Хувийн 6 багана (Excel N…S) */
export type Metric = 'N' | 'O' | 'P' | 'Q' | 'R' | 'S';
export const METRICS: readonly Metric[] = ['N', 'O', 'P', 'Q', 'R', 'S'];

/** L0 үе шат — `uy_shat`-аас таньна */
export type PhaseKind =
  | 'tezu' | 'zurag' | 'gazar' | 'zovshoorol' | 'songon'
  | 'barilga' | 'huleelgeh' | 'zugshruulelt' | 'other';

/** Хүснэгтэд хадгалсан нэг Excel мөр (жижиг үсэгтэй талбар; огноо = ms epoch) */
export type PlanStoredRow = {
  objectid?: number | null;
  dd_kod: string | null;
  etseg_kod?: string | null;
  tuvshin?: number | null;
  uy_shat?: string | null;
  bagts?: string | null;
  blok?: string | null;
  ajil_uilchilgee?: string | null;
  /** E — Урьдчилсан төсөвт өртөг (₮) */
  ho_dun_geree?: number | null;
  /** F — БУТАРХАЙ 0–1 (Excel-ийнхээр; `STORED_WEIGHT`) */
  heseg_ezleh_huvi?: number | null;
  /** G — БУТАРХАЙ 0–1 (Excel-ийнхээр; `STORED_WEIGHT`) */
  tusul_ezleh_huvi?: number | null;
  geree_ehleh?: number | null;
  geree_duusah?: number | null;
  gazar_ehleh?: number | null;
  gazar_duusah?: number | null;
  guits_ehleh?: number | null;
  guits_duusah?: number | null;
  /** S — 0–100 (зөвхөн ТЭЗҮ · Зураг төсөл · Зөвшөөрөл · Сонгон шалгаруулалтын навчинд) */
  guitsetgel_huvi?: number | null;
  cashflow_id?: number | null;
};

export type PlanNode = {
  /** `dd_kod` (үндэс бол `''`) */
  code: string;
  /** Эх мөр — синтетик үндэст `null` */
  row: PlanStoredRow | null;
  parent: PlanNode | null;
  children: PlanNode[];
  depth: number;
  /** Оролтын дараалал — модны урьдчилсан (pre-order) байрлал */
  index: number;
  phase: PhaseKind;
  /**
   * Барилга угсралт үе шатын L1 хэсэг: «Бэлтгэл ажил» (`beltgel`) эсвэл
   * «Барилга угсралт ажил» (`barilga`). Бусад үе шатад `null`.
   */
  sub: 'beltgel' | 'barilga' | null;
  /** Багц — өөрийн `bagts`, блок мөрөнд өвөг мөрийнх */
  pkg: string | null;
  /** Блок («5/1») — блокийн мөрөнд л */
  blok: string | null;
  /** «Нийслэл төсөв» — эцгийн E ба N…S нийлбэрт ОРОХГҮЙ */
  outside: boolean;
  /**
   * F-ийн ХОС — Барилга угсралт ажлын (төсөвтэй) хэсгийн ижил багц/блокийн мөр.
   * Excel: F86 = F721. Төсөвгүй хэсгүүдийн (Газар чөлөөлөлт, Зөвшөөрөл, Сонгон, Бэлтгэл…)
   * мөр жингээ эндээс хуулна.
   */
  twin: PlanNode | null;
};

export type PlanTree = {
  root: PlanNode;
  /** Үндэсгүй, урьдчилсан дарааллаар */
  nodes: PlanNode[];
  byCode: Map<string, PlanNode>;
  /** Бүтцийн анхааруулга (давхардсан код, олдоогүй эцэг, хосгүй мөр) */
  issues: string[];
};

export type PlanValues = {
  E: number | null;
  /** 0–100 */
  F: number | null;
  /** 0–100 */
  G: number | null;
  H: number | null; I: number | null;
  J: number | null; K: number | null;
  L: number | null; M: number | null;
  N: number | null; O: number | null; P: number | null;
  Q: number | null; R: number | null; S: number | null;
  T: number | null; U: number | null; V: number | null; W: number | null;
  /** Блокийн төлөв (S-ээр) — зөвхөн блокийн мөрөнд */
  status: BlockStatus | null;
};

/** Блокийн төлөв — 0 → Эхлээгүй, (0,100) → Эхэлсэн, 100 → Дууссан */
export type BlockStatus = 'notStarted' | 'started' | 'done';

/**
 * Амьд оролтууд. Бүх хувь 0–100. Callback `undefined` буцаавал «мэдээлэл алга»
 * гэж үзээд дараагийн эх рүү (хадгалсан утга → шугаман) шилжинэ; `null` буцаавал
 * «мэдээлэлгүй» гэж ТОГТООНО.
 */
export type PlanInputs = {
  /** Барилга угсралт ажлын блокийн бодит гүйцэтгэл (бөглөх хуудас · blockProgress) */
  blockActual?: (pkg: string | null, blok: string, node: PlanNode) => number | null | undefined;
  /** Барилга угсралт ажлын блокгүй навчны (дэд бүтэц) бодит гүйцэтгэл */
  pkgActual?: (pkg: string | null, node: PlanNode) => number | null | undefined;
  /** Блокийн гүйцэтгэгчийн төлөвлөгөөт хувь `asOf` өдрөөр (Хуваарь · planProgress) */
  blockPlanned?: (pkg: string | null, blok: string, asOf: number, node: PlanNode) => number | null | undefined;
  /** Газар чөлөөлөлт үе шатын навчны % (нэгж талбарын ТООГООР), `blok` нь null байж болно */
  land?: (pkg: string | null, blok: string | null, node: PlanNode) => number | null | undefined;
  /**
   * ДАРАХ утга — мөрийн хэмжүүрийг шууд өгнө (Excel-тэй тулгах шалгалт, гар оруулга).
   * Объектод түлхүүр БАЙВАЛ (утга нь null ч) тэр нь ЭЦСИЙН — хүүхдээс бодохгүй.
   */
  override?: (node: PlanNode) => Partial<Record<Metric, number | null>> | undefined;
};

/* ══════════════════ Жижиг туслахууд ══════════════════ */

const DAY = 86_400_000;
/** Улаанбаатарын цагийн бүс (UTC+8, зуны цаггүй) */
const UB_OFFSET_MS = 8 * 3_600_000;

/**
 * ӨНӨӨДӨР — Улаанбаатарын ХУАНЛИЙН өдөр, тэр өдрийн UTC шөнө дунд (ms).
 * ⚠️ 2026-10-26: `plan.spanFrac` огноог UTC өдрөөр тасалдаг тул `Date.now()`-ийг шууд өгвөл УБ-ын
 *    00:00–08:00-д ӨЧИГДРИЙН хувь гарна. Анхдагч `today` бүгд (`computePlan` · `loadProjectPlan` …) үүгээр.
 */
export const ubToday = (now: number = Date.now()): number =>
  Math.floor((now + UB_OFFSET_MS) / DAY) * DAY;
const OK_LO = Date.UTC(2000, 0, 1);
const OK_HI = Date.UTC(2100, 0, 1);

/** Зөв огноо (2000–2100) эсвэл null — Excel-ийн 0 сериал, «11/30/207» зэргийг хаяна */
export const saneDate = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= OK_LO && v <= OK_HI ? v : null;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Хадгалсан жингийн (F, G) хуваагч — 1 = бутархай (0–1). Импорт 0–100 болговол 100 болгоно.
 * ⚠️ `guitsetgel_huvi` (S) нь 0–100 — энэ тогтмол түүнд ХАМААРАХГҮЙ.
 */
export const STORED_WEIGHT = 1;
const wt = (v: unknown): number | null => { const x = num(v); return x == null ? null : x / STORED_WEIGHT; };

/** 0–100 → 0–1 (null хэвээр) */
const frac = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : v / 100;
/** 0–1 → 0–100 */
const hund = (v: number | null): number | null => (v == null ? null : v * 100);

/**
 * ШУГАМАН ТӨЛӨВЛӨГӨӨТ ХУВЬ (0–100) — `start`…`end` хооронд жигд, `date` өдрийн
 * төгсгөлөөр. Хоёр захыг оруулсан муж (`plan.spanFrac`-ийн конвенц).
 * ⚠️ Огноо дутуу эсвэл урвуу (эхлэх > дуусах) бол `null` — «хуваарьгүй», 0 БИШ.
 */
export function linearPlanned(start: number | null | undefined, end: number | null | undefined, date: number): number | null {
  const s = saneDate(start);
  const e = saneDate(end);
  if (s == null || e == null || e < s) return null;
  return spanFrac({ start: s, end: e }, date) * 100;
}

/** Блокийн төлөв: 0 → Эхлээгүй, >0 → Эхэлсэн, 100 → Дууссан. null → null. */
export function blockStatus(pct: number | null | undefined): BlockStatus | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  /* ⚠️ Хөвөгч цэгийн 99.9999… нь «дууссан» — Excel 0.9999999999999998 хадгалдаг */
  if (pct >= 100 - 1e-9) return 'done';
  if (pct <= 1e-9) return 'notStarted';
  return 'started';
}

/** Биелэлт = гүйцэтгэл / төлөвлөгөө (0–100). Excel: IF(план=0, 0, S/план). */
const ratio = (s: number | null, plan: number | null): number | null =>
  s == null || plan == null ? null : plan === 0 ? 0 : (s / plan) * 100;

const PHASE_RX: [RegExp, PhaseKind][] = [
  [/ТЭЗҮ/i, 'tezu'],
  [/зураг/i, 'zurag'],
  [/газар\s*чөлөөл/i, 'gazar'],
  [/зөвшөөрөл/i, 'zovshoorol'],
  [/сонгон/i, 'songon'],
  [/барилга\s*угсралт/i, 'barilga'],
  [/хүлээлгэн/i, 'huleelgeh'],
  [/зүгшрүүл/i, 'zugshruulelt'],
];
/** `uy_shat` (эсвэл L0 мөрийн нэр) → үе шатын төрөл */
export function phaseKind(name: string | null | undefined): PhaseKind {
  const s = String(name ?? '');
  for (const [rx, k] of PHASE_RX) if (rx.test(s)) return k;
  return 'other';
}

/** Блокийн код мөн үү («5/1», «29/3», «6/8») */
export const isBlockCode = (v: unknown): boolean => /^\s*\d+\s*\/\s*\d+\s*$/.test(String(v ?? ''));

const OUTSIDE_RX = /нийслэл\s*төсөв/i;

/** Тааруулах түлхүүр — зай, зураас, цэгийг хаяж том үсгээр (`bagtsKey`-тэй ижил санаа) */
const keyC = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z/]/g, '');
const keyD = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ══════════════════ Мод ══════════════════ */

/**
 * Хадгалсан мөрүүдээс мод угсарна.
 *
 * ⚠️ ДАРААЛАЛ: ах дүүс ОРОЛТЫН дарааллаараа (Excel-ийн мөрийн дараалал). Дуудагч мөрийг
 *    Excel-ийн дарааллаар өгнө.
 * ⚠️ `dd_kod` ДАВХАРДВАЛ (Excel-ийн B баганад 35 код давхардсан — «3» хоёр үе шатад,
 *    «5.2.1.1.1» долоон багцад) `etseg_kod` хоёрдмол болно. Тэр үед ӨМНӨ ирсэн хамгийн
 *    ойрын ижил кодтой мөрийг эцэг гэж үзэж `issues`-д тэмдэглэнэ — импорт кодыг
 *    давтагдашгүй болгох ёстой.
 */
export function buildTree(rows: readonly PlanStoredRow[]): PlanTree {
  const issues: string[] = [];
  const root: PlanNode = {
    code: '', row: null, parent: null, children: [], depth: 0, index: -1,
    phase: 'other', sub: null, pkg: null, blok: null, outside: false, twin: null,
  };
  const byCode = new Map<string, PlanNode>();
  const all: PlanNode[] = [];
  const seen = new Map<string, PlanNode[]>();
  rows.forEach((row, i) => {
    const code = String(row.dd_kod ?? '').trim();
    if (!code) return;
    const n: PlanNode = {
      code, row, parent: null, children: [], depth: 0, index: i,
      phase: 'other', sub: null, pkg: null, blok: null, outside: false, twin: null,
    };
    all.push(n);
    const list = seen.get(code) ?? [];
    if (list.length) issues.push(tr('dd_kod давхардсан: {0}', code));
    list.push(n);
    seen.set(code, list);
    if (!byCode.has(code)) byCode.set(code, n);
  });

  /* Эцэг холбох */
  for (const n of all) {
    const pk = String(n.row?.etseg_kod ?? '').trim();
    let p: PlanNode = root;
    if (pk) {
      const cands = seen.get(pk);
      if (!cands?.length) issues.push(tr('эцэг олдсонгүй: {0} → {1}', n.code, pk));
      else if (cands.length === 1) p = cands[0];
      else {
        /* хамгийн ойрын ӨМНӨХ */
        const prev = cands.filter((c) => c.index < n.index && c !== n);
        p = prev.length ? prev[prev.length - 1] : cands[0];
      }
      if (p === n) { issues.push(tr('өөрөө өөрийнхөө эцэг: {0}', n.code)); p = root; }
    }
    n.parent = p;
    p.children.push(n);
  }
  /* Дугуй холбоос тасална (A→B→A): үндэснээс хүрэхгүй мөрийг үндэст залгана */
  const reach = new Set<PlanNode>();
  const walk = (n: PlanNode) => { reach.add(n); for (const c of n.children) if (!reach.has(c)) walk(c); };
  walk(root);
  for (const n of all) {
    if (reach.has(n)) continue;
    issues.push(tr('дугуй холбоос: {0}', n.code));
    n.parent!.children = n.parent!.children.filter((c) => c !== n);
    n.parent = root;
    root.children.push(n);
    walk(n);
  }

  /* Шинж — урьдчилсан дарааллаар */
  const nodes: PlanNode[] = [];
  const visit = (n: PlanNode, depth: number) => {
    for (const c of n.children) {
      c.depth = depth;
      const r = c.row!;
      if (depth === 1) c.phase = phaseKind(r.uy_shat || r.ajil_uilchilgee);
      else c.phase = r.uy_shat ? phaseKind(r.uy_shat) : n.phase;
      if (c.phase === 'other' && n !== root) c.phase = n.phase;
      if (c.phase === 'barilga') {
        c.sub = depth === 2 ? (/бэлтгэл/i.test(String(r.ajil_uilchilgee ?? '')) ? 'beltgel' : 'barilga') : n.sub;
      }
      const b = String(r.bagts ?? '').trim();
      const bl = String(r.blok ?? '').trim();
      c.blok = bl || (isBlockCode(b) ? b.replace(/\s/g, '') : null);
      c.pkg = b && !isBlockCode(b) ? b : n.pkg;
      c.outside = OUTSIDE_RX.test(String(r.ajil_uilchilgee ?? ''));
      nodes.push(c);
      visit(c, depth + 1);
    }
  };
  visit(root, 1);

  linkTwins(root, nodes, issues);
  return { root, nodes, byCode, issues };
}

/**
 * F-ийн ХОС холбоно (Excel: F86=F721, F11=F719, F254=F890).
 *
 * Эх = Барилга угсралт ажлын (`sub === 'barilga'`) хэсэг — тэнд жин нь E/E_эцэг-ээр
 * бодогддог. Хос хэрэгтэй мөр = F хадгалаагүй, E-гүй, үе шатын түвшин биш мөр.
 *
 * ⚠️ БҮТЦЭЭР тааруулна: мөрийн эцгийн хосын (эсвэл эцэг хосгүй бол «Барилга угсралт ажил»
 *    мөрийн) ХҮҮХДҮҮДЭЭС, дараа нь бүх ҮР УДМААС, эцэст нь бүх эх хэсгээс — тус бүрд
 *    (багц+нэр) → нэр → багц гэсэн дарааллаар ГАНЦ тохирлыг хайна. «5/1» долоон багцад
 *    давтагддаг тул эцгийн хосоор хүрээг нь хумихгүй бол буруу багцын блок тааралдана.
 *    Excel-ийн 649 хуулбар томьёо бүгд энэ дүрмээр давтагдана (`projectPlan.check`).
 */
function linkTwins(root: PlanNode, nodes: PlanNode[], issues: string[]) {
  const src = root.children.find((p) => p.phase === 'barilga')
    ?.children.find((c) => c.sub === 'barilga') ?? null;
  if (!src) return;
  const desc = (n: PlanNode): PlanNode[] => {
    const out: PlanNode[] = [];
    const go = (x: PlanNode) => { for (const c of x.children) { out.push(c); go(c); } };
    go(n);
    return out;
  };
  const srcAll = desc(src);
  const pick = (n: PlanNode, cands: PlanNode[]): PlanNode | null => {
    /* ⚠️ Блокийн мөрд «C» = блок («5/1»), багц биш — импорт блокийн мөрийн `bagts`-д багцыг
       бичсэн байж болно; тэгвэл 20 блок бүгд «Багц-1» болж тааралдахгүй */
    const cOf = (x: PlanNode) => keyC(x.blok ?? x.row?.bagts);
    const c = cOf(n), d = keyD(n.row?.ajil_uilchilgee);
    const tries: ((x: PlanNode) => boolean)[] = [
      (x) => cOf(x) === c && keyD(x.row?.ajil_uilchilgee) === d,
      (x) => !!d && keyD(x.row?.ajil_uilchilgee) === d,
      (x) => !!c && cOf(x) === c,
    ];
    for (const t of tries) {
      const hit = cands.filter(t);
      if (hit.length === 1) return hit[0];
    }
    return null;
  };
  /**
   * ⚠️ 2026-10-26 (хяналтын олдвор): СУЛ ТААРУУЛГА — дээрх ЯГ тааруулга бүтэлгүйтсэн үед л, ЗӨВХӨН эцгийн хосын
   *    хүүхдүүдээс. Импорт СИСТЕМИЙН урт нэрийг хадгалдаг (`--keep-names`) тул мөнгөний мөрийн нэр Excel-ийн
   *    давтагдсан мөрөөс сүүл залгаастай зөрдөг («…усан сангийн ажил -Оруулах тайлбарлана», «…ногоон зурвас-Хавсралт»,
   *    багц «Багц 18» ↔ «Багц 18.1») → 8 мөр F-гүй үлдэж байв. (1) нормчилсон нэрийн УГТВАР (аль нэг нь нөгөөгийнхөө
   *    эхлэл, ≥ 6 тэмдэгт) ГАНЦ тохирол; (2) эс бөгөөс ах дүүсийн тоо ижил бол ИЖИЛ БАЙРЛАЛ (Excel-ийн мөр бүр
   *    Барилга угсралтынхаа бүтцийг дарааллаар нь давтдаг).
   */
  const keyN = (v: unknown) => keyD(v).replace(/[^0-9a-zа-яөүё]/g, '');
  const loose = (n: PlanNode, scope: PlanNode): PlanNode | null => {
    const sib = n.parent?.children ?? [];
    const cands = scope.children;
    const d = keyN(n.row?.ajil_uilchilgee);
    if (d.length >= 6) {
      const hit = cands.filter((x) => {
        const xd = keyN(x.row?.ajil_uilchilgee);
        return xd.length >= 6 && (xd.startsWith(d) || d.startsWith(xd));
      });
      if (hit.length === 1) return hit[0];
    }
    const i = sib.indexOf(n);
    return i >= 0 && sib.length === cands.length ? cands[i] : null;
  };
  const inSrc = new Set<PlanNode>([src, ...srcAll]);
  for (const n of nodes) {
    if (n.depth < 2 || inSrc.has(n)) continue;
    const r = n.row!;
    /* ⚠️ F-ээ хадгалсан мөрд ч хос хайна — өөрт нь хэрэггүй ч ХҮҮХДҮҮДИЙН хайлтын хүрээ
       болно (Газар чөлөөлөлтийн «Багц-1» F-тэй, түүний «5/1» блокууд хосоо Багц-1-ийн
       хосын дотроос л олно). */
    const scope = n.parent?.twin ?? src;
    n.twin = pick(n, scope.children) ?? pick(n, desc(scope)) ?? pick(n, srcAll)
      ?? (n.parent?.twin ? loose(n, n.parent.twin) : null);
    if (!n.twin && wt(r.heseg_ezleh_huvi) == null && num(r.ho_dun_geree) == null && n.children.length === 0) {
      issues.push(tr('F-ийн хос олдсонгүй: {0}', [n.code, r.bagts, r.ajil_uilchilgee].filter((x) => String(x ?? '').trim()).join(' ')));
    }
  }
}

/* ══════════════════ Тооцоо ══════════════════ */

export type PlanResult = {
  tree: PlanTree;
  today: number;
  /** Мөр бүрийн утга (үндэс оролцоно — `tree.root`) */
  values: Map<PlanNode, PlanValues>;
  /** `dd_kod`-оор */
  get: (code: string) => PlanValues | undefined;
};

/** Навчны огноо — өөрийнх, эс бөгөөс хамгийн ойрын өвөг мөрийн (хоёулаа байгаа) */
function spanOf(n: PlanNode, a: 'geree' | 'gazar' | 'guits'): [number | null, number | null] {
  for (let x: PlanNode | null = n; x && x.row; x = x.parent) {
    const s = saneDate(x.row[`${a}_ehleh`]);
    const e = saneDate(x.row[`${a}_duusah`]);
    if (s != null && e != null) return [s, e];
  }
  return [null, null];
}

/**
 * O · P-ийн муж — өөрийн төрлийн (`gazar` / `guits`) огноо навч ба өвөгт алга бол ГЭРЭЭНИЙ (H/I) муж.
 * ⚠️ 2026-10-26 (хяналтын олдвор): ТЭЗҮ · Зураг төсөл · Газар чөлөөлөлт · Зөвшөөрөл · Сонгон шалгаруулалт үе шатад
 *    Excel-д J–M огноо БАЙХГҮЙ бөгөөд тэнд O = P = N (Excel-ийн томьёо гэрээний мужаар бодно). Энэ унахгүй бол
 *    ~465 навч O/P-гүй болж төслийн нийт P ~39.6 (Excel 59.4) болж байв. Гэрээний муж ч алга бол null (0 БИШ).
 */
function spanOrGeree(n: PlanNode, a: 'gazar' | 'guits'): [number | null, number | null] {
  const sp = spanOf(n, a);
  return sp[0] != null && sp[1] != null ? sp : spanOf(n, 'geree');
}

/** P-ийн навчны дүрэм `asOf` өдрөөр (Q = +7, R = −7, сарын цуваа) — 0–1 */
function plannedLeaf(n: PlanNode, asOf: number, inputs: PlanInputs): number | null {
  if (n.phase === 'barilga' && n.sub === 'barilga' && n.blok && inputs.blockPlanned) {
    const v = inputs.blockPlanned(n.pkg, n.blok, asOf, n);
    if (v !== undefined) return frac(v);
  }
  const [s, e] = spanOrGeree(n, 'guits');
  return frac(linearPlanned(s, e, asOf));
}

function leafValue(n: PlanNode, m: Metric, today: number, inputs: PlanInputs): number | null {
  const r = n.row!;
  switch (m) {
    case 'N': { const [s, e] = spanOf(n, 'geree'); return frac(linearPlanned(s, e, today)); }
    case 'O': { const [s, e] = spanOrGeree(n, 'gazar'); return frac(linearPlanned(s, e, today)); }
    case 'P': return plannedLeaf(n, today, inputs);
    case 'Q': return plannedLeaf(n, today + 7 * DAY, inputs);
    case 'R': return plannedLeaf(n, today - 7 * DAY, inputs);
    case 'S': {
      if (n.phase === 'barilga' && n.sub === 'barilga') {
        const v = n.blok ? inputs.blockActual?.(n.pkg, n.blok, n) : inputs.pkgActual?.(n.pkg, n);
        if (v !== undefined) return frac(v);
      } else if (n.phase === 'gazar') {
        const v = inputs.land?.(n.pkg, n.blok, n);
        if (v !== undefined) return frac(v);
      }
      return frac(num(r.guitsetgel_huvi));
    }
  }
}

/** Σ F·X — нийлбэрт орох (outside биш), утгатай хүүхдүүдээр; бүгд null бол null */
function rollup(n: PlanNode, val: (c: PlanNode) => number | null, F: Map<PlanNode, number | null>): number | null {
  let sum = 0;
  let any = false;
  for (const c of n.children) {
    if (c.outside) continue;
    const x = val(c);
    const f = F.get(c) ?? null;
    if (x == null || f == null) continue;
    sum += f * x;
    any = true;
  }
  return any ? sum : null;
}

/**
 * Бүх мөрийн E…W-г бодно. `today` — ms (UTC өдрөөр тасалж, өдрийн төгсгөлөөр үнэлнэ; анхдагч нь УБ-ын өнөөдөр
 * `ubToday()` — дуудагч цагтай `Date.now()` өгвөл УБ-ын 00:00–08:00-д өчигдөр болно).
 */
export function computePlan(tree: PlanTree, inputs: PlanInputs = {}, today: number = ubToday()): PlanResult {
  const { root, nodes } = tree;
  const post = [...nodes].reverse(); // хүүхэд эцгээсээ өмнө
  const ov = new Map<PlanNode, Partial<Record<Metric, number | null>>>();
  if (inputs.override) for (const n of nodes) { const o = inputs.override(n); if (o) ov.set(n, o); }

  /* ── E: хадгалсан › (нийлбэрт орох) хүүхдүүдийн нийлбэр ── */
  const E = new Map<PlanNode, number | null>();
  for (const n of [...post, root]) {
    const own = n.row ? num(n.row.ho_dun_geree) : null;
    if (own != null) { E.set(n, own); continue; }
    let s = 0, any = false;
    for (const c of n.children) {
      if (c.outside) continue;
      const v = E.get(c);
      if (v != null) { s += v; any = true; }
    }
    E.set(n, any ? s : null);
  }

  /* ── F (0–1): хадгалсан › G/G_эцэг (үе шат) › E/E_эцэг › хосын F ── */
  const F = new Map<PlanNode, number | null>();
  F.set(root, 1);
  const busy = new Set<PlanNode>();
  const fOf = (n: PlanNode): number | null => {
    if (F.has(n)) return F.get(n)!;
    if (busy.has(n)) return null;
    busy.add(n);
    const r = n.row!;
    let f = wt(r.heseg_ezleh_huvi);
    if (f == null) {
      const g = wt(r.tusul_ezleh_huvi);
      const gp = g == null ? null : gOf(n.parent!);
      const e = E.get(n) ?? null;
      const ep = n.parent ? E.get(n.parent) ?? null : null;
      if (g != null && gp) f = g / gp;
      /* ⚠️ E нь БОДОГДСОН утга (E719 = SUM(...) хадгалагдаагүй) — хадгалсан E-г шаардвал
         «Барилга угсралт ажил»-ын бүлгүүдийн жин алга болно */
      else if (e != null && ep) f = e / ep;
      else if (n.twin) f = fOf(n.twin);
    }
    busy.delete(n);
    F.set(n, f);
    return f;
  };
  /* ── G (0–1): хадгалсан › F × G_эцэг. F нь үе шатын мөрд G/G_эцэг тул хоёр нь харилцан
     дууддаг — чиглэл нь ҮРГЭЛЖ эцэг рүү тул дугуйрахгүй. ── */
  const G = new Map<PlanNode, number | null>();
  G.set(root, 1);
  function gOf(n: PlanNode): number | null {
    if (G.has(n)) return G.get(n)!;
    const own = wt(n.row!.tusul_ezleh_huvi);
    let g = own;
    if (g == null) {
      const f = fOf(n);
      const gp = gOf(n.parent!);
      g = f != null && gp != null ? f * gp : null;
    }
    G.set(n, g);
    return g;
  }
  for (const n of nodes) { fOf(n); gOf(n); }

  /* ── H…M: хадгалсан › үр удмын MIN эхлэх / MAX дуусах ── */
  const D = new Map<PlanNode, (number | null)[]>();
  const DF: [keyof PlanStoredRow, 'min' | 'max'][] = [
    ['geree_ehleh', 'min'], ['geree_duusah', 'max'],
    ['gazar_ehleh', 'min'], ['gazar_duusah', 'max'],
    ['guits_ehleh', 'min'], ['guits_duusah', 'max'],
  ];
  /* `agg` — үр удмын бүх утгын min/max (Excel MIN(H529:H903) нь бүх үр удмыг хамардаг) */
  const agg = new Map<PlanNode, (number | null)[]>();
  for (const n of [...post, root]) {
    const own = DF.map(([k]) => (n.row ? saneDate(n.row[k]) : null));
    const a: (number | null)[] = DF.map(() => null);
    for (const c of n.children) {
      const cv = D.get(c)!, ca = agg.get(c)!;
      DF.forEach(([, op], i) => {
        for (const v of [cv[i], ca[i]]) {
          if (v == null) continue;
          a[i] = a[i] == null ? v : op === 'min' ? Math.min(a[i]!, v) : Math.max(a[i]!, v);
        }
      });
    }
    agg.set(n, a);
    D.set(n, own.map((v, i) => v ?? a[i]));
  }

  /* ── N…S: навч — дүрэм/дарах утга, эцэг — Σ F·X ── */
  const X = new Map<PlanNode, Record<Metric, number | null>>();
  for (const n of [...post, root]) {
    const o = n.row ? ov.get(n) : undefined;
    const rec = {} as Record<Metric, number | null>;
    for (const m of METRICS) {
      if (o && m in o) { rec[m] = frac(o[m] ?? null); continue; }
      if (n.children.length) rec[m] = rollup(n, (c) => X.get(c)![m], F);
      else rec[m] = n.row ? leafValue(n, m, today, inputs) : null;
    }
    X.set(n, rec);
  }

  const values = new Map<PlanNode, PlanValues>();
  for (const n of [root, ...nodes]) {
    const x = X.get(n)!;
    const d = D.get(n)!;
    const S = hund(x.S), N = hund(x.N), O = hund(x.O), P = hund(x.P), R = hund(x.R);
    values.set(n, {
      E: E.get(n) ?? null,
      F: hund(F.get(n) ?? null),
      G: hund(G.get(n) ?? null),
      H: d[0], I: d[1], J: d[2], K: d[3], L: d[4], M: d[5],
      N, O, P, Q: hund(x.Q), R, S,
      T: ratio(S, N), U: ratio(S, O), V: ratio(S, P), W: ratio(S, R),
      status: n.blok ? blockStatus(S) : null,
    });
  }
  return { tree, today, values, get: (code) => { const n = tree.byCode.get(code); return n ? values.get(n) : undefined; } };
}

/* ══════════════════ Сарын хуримтлагдсан цуваа («…сараар») ══════════════════ */

/** `from`-ын сараас `to`-гийн сар хүртэл САР БҮРИЙН СҮҮЛИЙН ӨДӨР (UTC шөнө дунд, ms) */
export function monthEnds(from: number, to: number, max = 240): number[] {
  const a = new Date(from), b = new Date(to);
  const out: number[] = [];
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); out.length < max; m++) {
    const end = Date.UTC(y, m + 1, 0);
    out.push(end);
    if (Date.UTC(y, m, 1) >= Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1)) break;
  }
  return out;
}

/**
 * САРЫН ХУРИМТЛАГДСАН ТӨЛӨВЛӨГӨӨТ % (0–100) мөр бүрд — Excel «…сараар».
 * Навч: блок → Хуваарийн төлөвлөгөө (`blockPlanned`), бусад → шугаман L/M; эцэг → Σ F·X
 * (F нь `computePlan`-ынх). `override` нь навч/эцэгт бүтэн цуваа өгч болно (шалгалт).
 *
 * ⚠️ Хуримтлалыг ӨӨРӨӨ бодно — CASHFLOW-ийн `pctCum` жил бүр тэглэгддэг (CLAUDE.md).
 */
export function monthlySeries(
  res: PlanResult,
  months: readonly number[],
  inputs: PlanInputs & {
    /** Сар бүрийн дарах утга; массивын `undefined` элемент = тэр сарыг бодно */
    overrideMonthly?: (node: PlanNode) => readonly (number | null | undefined)[] | undefined;
  } = {},
): Map<PlanNode, (number | null)[]> {
  const { root, nodes } = res.tree;
  const F = new Map<PlanNode, number | null>();
  for (const n of nodes) F.set(n, frac(res.values.get(n)!.F));
  const out = new Map<PlanNode, (number | null)[]>();
  for (const n of [...[...nodes].reverse(), root]) {
    const o = n.row ? inputs.overrideMonthly?.(n) : undefined;
    const s = months.map((t, i) => {
      const ov = o?.[i];
      if (ov !== undefined) return frac(ov);
      if (n.children.length) return rollup(n, (c) => out.get(c)![i], F);
      return n.row ? plannedLeaf(n, t, inputs) : null;
    });
    out.set(n, s);
  }
  for (const [n, s] of out) out.set(n, s.map(hund));
  return out;
}

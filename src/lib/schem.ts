/**
 * ТӨСЛИЙН ҮЙЛ АЖИЛЛАГААНЫ СХЕМ — ЦЭВЭР ЗАГВАР.
 */

import { t as tr } from '@/lib/i18nCore';
import { bagtsKey, type ViewKey } from '@/lib/services';
import {
  HYANALT, OWNER, RETURNED_STATUS, STAGE_ORDER, STATUS, F as HF,
  type Row, type Stage, type Status,
} from '@/lib/hyanalt';
import { groupWorks } from '@/lib/hyanaltGroup';
import { TOLOV, type Zov } from '@/lib/zovshoorol';

/* ══════════════════ Төрөл ══════════════════ */

export type SchemId =
  | 'tolovlolt' | 'zovshoorol' | 'gazar' | 'huvaari'
  | 'barilga' | 'hyanalt' | 'habea' | 'ersdel' | 'sankhuu' | 'tailan';

/**
 * Зангилааны төлөв.
 */
export type Health = 'good' | 'warn' | 'bad' | 'none';

export type MetricKind = 'count' | 'pct' | 'mnt' | 'ha' | 'day';

export type Metric = {
  label: string;
  value: number | null;
  kind: MetricKind;
  /** `value` нь яагаад `null` вэ — tooltip/aria-д ил гарна, чимээгүй алга болохгүй */
  why?: string;
};

export type SchemNode = {
  id: SchemId;
  title: string;
  desc: string;
  /** Дарахад нээгдэх харагдац. `null` бол зангилаа дарагдахгүй. */
  view: ViewKey | null;
  /** `Icon.tsx`-ийн `P` объектын түлхүүр */
  icon: string;
  col: number;
  row: number;
};

export type EdgeKind = 'main' | 'feed' | 'back';

export type SchemEdge = {
  from: SchemId;
  to: SchemId;
  kind: EdgeKind;
  label?: string;
};

/* ══════════════════ Топологи ══════════════════ */

/**
 *   мөр 0 — ЗӨВШӨӨРӨХ / ХЯНАХ  (гадны шийдвэр хүлээх цэгүүд)
 *   мөр 1 — ҮНДСЭН УРСГАЛ       (төлөвлөх → барих → санхүүжүүлэх → тайлагнах)
 *   мөр 2 — НӨХЦӨЛ / АЮУЛГҮЙ БАЙДАЛ
 *   мөр 3 — ЭРСДЭЛ
 */
export const NODES: readonly SchemNode[] = [
  {
    id: 'tolovlolt', col: 0, row: 1, view: 'plan', icon: 'layers',
    get title() { return tr('Ерөнхий төлөвлөгөө'); },
    get desc() { return tr('Бүс, барилга, инженерийн дэд бүтэц — төслийн эхлэл'); },
  },
  {
    id: 'zovshoorol', col: 1, row: 0, view: 'zovshoorol', icon: 'shield',
    get title() { return tr('Зөвшөөрөл'); },
    get desc() { return tr('Багц бүрийн зөвшөөрлүүд — шатлал нь өгөгдлөөс тодорхойлогдоно'); },
  },
  {
    id: 'gazar', col: 1, row: 2, view: 'gazar', icon: 'frame',
    get title() { return tr('Газар чөлөөлөлт'); },
    get desc() { return tr('Нэгж талбарын төлөв — барилга эхлүүлэх нөхцөл'); },
  },
  {
    id: 'huvaari', col: 2, row: 1, view: 'huvaari', icon: 'calendar',
    get title() { return tr('Хуваарь'); },
    get desc() { return tr('Ажлын эхлэх, дуусах хугацаа — блокийн хэмнэлээр'); },
  },
  {
    id: 'barilga', col: 3, row: 1, view: 'pkgProg', icon: 'building',
    get title() { return tr('Барилга угсралт'); },
    get desc() { return tr('Блокийн биет гүйцэтгэл — «Гүйцэтгэл бөглөх» хуудсаас'); },
  },
  {
    id: 'ersdel', col: 4, row: 3, view: 'ersdel', icon: 'waves',
    get title() { return tr('Эрсдэл'); },
    get desc() { return tr('Эхлээгүй блок (<1%), байгалийн аюулын нөлөө'); },
  },
  {
    id: 'hyanalt', col: 4, row: 0, view: 'guitsetgel', icon: 'pen',
    get title() { return tr('Гүйцэтгэлийн хяналт'); },
    get desc() { return tr('Гүйцэтгэгч → инженер → багцын ахлах инженер → төлөвлөлтийн инженер → төлөвлөлтийн ахлах инженер → хэлтсийн дарга → газрын дарга'); },
  },
  {
    id: 'habea', col: 3, row: 2, view: 'habea', icon: 'flame',
    get title() { return tr('ХАБЭА'); },
    get desc() { return tr('Ажилтан, техник, осол зөрчил'); },
  },
  {
    id: 'sankhuu', col: 4, row: 1, view: 'pkgFin', icon: 'calc',
    get title() { return tr('Санхүүжилт'); },
    get desc() { return tr('Гэрээ, IPC акт, олгосон санхүүжилт'); },
  },
  {
    id: 'tailan', col: 5, row: 1, view: 'tailan', icon: 'chart',
    get title() { return tr('Тайлан'); },
    get desc() { return tr('Нэгтгэсэн үзүүлэлт — төслийн эцсийн баримт'); },
  },
];

export const EDGES: readonly SchemEdge[] = [
  /* Салаа — төлөвлөгөөнөөс зэрэг хоёр урсгал эхэлнэ */
  { from: 'tolovlolt', to: 'zovshoorol', kind: 'main' },
  { from: 'tolovlolt', to: 'gazar', kind: 'main' },
  /* Нийлэлт — хоёулаа бүрдсэний дараа хуваарь утгатай болно */
  { from: 'zovshoorol', to: 'huvaari', kind: 'main' },
  { from: 'gazar', to: 'huvaari', kind: 'main' },
  { from: 'huvaari', to: 'barilga', kind: 'main' },
  { from: 'barilga', to: 'hyanalt', kind: 'main' },
  { from: 'hyanalt', to: 'sankhuu', kind: 'main' },
  { from: 'sankhuu', to: 'tailan', kind: 'main' },
  { from: 'hyanalt', to: 'barilga', kind: 'back', get label() { return tr('Буцаасан'); } },
  /**
   * ХАЖУУГИЙН ХЭМЖҮҮР — дараалал БИШ, барилгаас САЛБАРЛАСАН хяналт.
   */
  { from: 'barilga', to: 'habea', kind: 'feed' },
  { from: 'barilga', to: 'ersdel', kind: 'feed' },
];

export const NODE_BY_ID: Record<SchemId, SchemNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
) as Record<SchemId, SchemNode>;

/**
 * Топологийн дараалал (`back` ирмэгийг үл тооно — тэр нь мөчлөг үүсгэнэ).
 */
export function topoOrder(): SchemId[] {
  const indeg = new Map<SchemId, number>(NODES.map((n) => [n.id, 0]));
  const next = new Map<SchemId, SchemId[]>(NODES.map((n) => [n.id, []]));
  for (const e of EDGES) {
    if (e.kind === 'back') continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    next.get(e.from)!.push(e.to);
  }
  /* Тэнцүү үед `col`, дараа нь `row`-оор — үр дүн ТОГТВОРТОЙ байна */
  const rank = (a: SchemId, b: SchemId) => {
    const x = NODE_BY_ID[a]; const y = NODE_BY_ID[b];
    return x.col - y.col || x.row - y.row;
  };
  const q = NODES.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).sort(rank);
  const out: SchemId[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const to of next.get(id)!) {
      const d = (indeg.get(to) ?? 0) - 1;
      indeg.set(to, d);
      if (d === 0) { q.push(to); q.sort(rank); }
    }
  }
  return out;
}

/* ══════════════════ Байрлал ══════════════════ */

/**
 * 10 зангилаанд layered (Sugiyama) алгоритм нь ~150 мөр код, огтлолцол
 * багасгах шат шаардана. Түүнээс гадна зангилаа нэмэх бүрд БҮХ зургийг дахин
 * байрлуулж, хэрэглэгчийн орон зайн ой санамжийг эвднэ («газар чөлөөлөлт
 * доод зүүн буланд байдаг» гэдэг нь суралцсан зүйл).
 *
 * Дараалал нь БИЗНЕСИЙН БАРИМТ — бодож олох зүйл биш. `col`/`row` тогтмол нь
 * diff-д уншигдана, шинэ хүн зургийг кодоос шууд харна.
 */
export const GEO = { w: 220, h: 140, gapX: 78, gapY: 44, pad: 34 } as const;

export type Box = { x: number; y: number; w: number; h: number };

export type Geo = { w: number; h: number; gapX: number; gapY: number; pad: number };

/** Байрлалд шаардлагатай ХАМГИЙН БАГА мэдээлэл — бүдүүн ба нарийн хоёр схем ижилхэн хэрэглэнэ */
export type Placed = { id: string; col: number; row: number };

/**
 * ЕРӨНХИЙ ТОРЫН БАЙРЛАЛ.
 */
export function layoutOf<T extends string>(
  nodes: readonly (Placed & { id: T })[],
  geo: Geo,
): { w: number; h: number; box: Record<T, Box> } {
  const box = {} as Record<T, Box>;
  let maxC = 0; let maxR = 0;
  for (const n of nodes) {
    if (n.col > maxC) maxC = n.col;
    if (n.row > maxR) maxR = n.row;
  }
  for (const n of nodes) {
    box[n.id] = {
      x: geo.pad + n.col * (geo.w + geo.gapX),
      y: geo.pad + n.row * (geo.h + geo.gapY),
      w: geo.w,
      h: geo.h,
    };
  }
  return {
    w: geo.pad * 2 + (maxC + 1) * geo.w + maxC * geo.gapX,
    h: geo.pad * 2 + (maxR + 1) * geo.h + maxR * geo.gapY,
    box,
  };
}

/** «Ерөнхий» схемийн байрлал — 10 карт, гараар зохиосон тор */
export function layout(nodes: readonly SchemNode[] = NODES): {
  w: number; h: number; box: Record<SchemId, Box>;
} {
  return layoutOf<SchemId>(nodes, GEO);
}


/**
 * Ирмэгийн SVG зам.
 *
 * `back` нь ДООГУУР нуман: урвуу чиглэлийг шулуунаар зурвал `main` ирмэгтэй
 * давхарлаж, хоёулаа уншигдахгүй болно.
 */
/**
 * ТОХОЙ ЗАМ — мөрийн ЗАЙГААР (`g`) явж хоёр картыг холбоно (2026-09-16).
 */
function elbow(x1: number, y1: number, x2: number, y2: number, g: number): string {
  const r = 12;
  const sy1 = g > y1 ? 1 : -1;
  const sx = x2 > x1 ? 1 : -1;
  const sy2 = y2 > g ? 1 : -1;
  return `M ${x1} ${y1} L ${x1} ${g - sy1 * r} Q ${x1} ${g} ${x1 + sx * r} ${g} `
    + `L ${x2 - sx * r} ${g} Q ${x2} ${g} ${x2} ${g + sy2 * r} L ${x2} ${y2}`;
}

export function edgePath(a: Box, b: Box, kind: EdgeKind): string {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;

  if (kind === 'back') {
    const x1 = a.x + a.w / 2;
    const x2 = b.x + b.w / 2;
    if (b.y + b.h < a.y) {
      return elbow(x1, a.y, x2, b.y + b.h, (b.y + b.h + a.y) / 2);
    }
    const up = Math.min(a.y, b.y) - 22;
    return `M ${x1} ${a.y} C ${x1} ${up}, ${x2} ${up}, ${x2} ${b.y}`;
  }

  if (b.x + b.w > a.x && a.x + a.w > b.x) {
    const cx1 = a.x + a.w / 2;
    const cx2 = b.x + b.w / 2;
    const down = b.y > a.y;
    const y1 = down ? a.y + a.h : a.y;
    const y2 = down ? b.y : b.y + b.h;
    const dy = Math.max(20, Math.abs(y2 - y1) * 0.55) * (down ? 1 : -1);
    return `M ${cx1} ${y1} C ${cx1} ${y1 + dy}, ${cx2} ${y2 - dy}, ${cx2} ${y2}`;
  }

  if (b.x + b.w <= a.x) {
    const cx1 = a.x + a.w / 2;
    const cx2 = b.x + b.w / 2;
    if (b.y >= a.y + a.h) return elbow(cx1, a.y + a.h, cx2, b.y, (a.y + a.h + b.y) / 2);
    if (b.y + b.h <= a.y) return elbow(cx1, a.y, cx2, b.y + b.h, (b.y + b.h + a.y) / 2);
    const up = Math.min(a.y, b.y) - 22;
    return `M ${cx1} ${a.y} C ${cx1} ${up}, ${cx2} ${up}, ${cx2} ${b.y}`;
  }

  const x1 = a.x + a.w;
  const x2 = b.x;
  const dx = Math.max(28, (x2 - x1) * 0.55);
  return `M ${x1} ${ay} C ${x1 + dx} ${ay}, ${x2 - dx} ${by}, ${x2} ${by}`;
}

/**
 * ИРМЭГИЙН ШОШГОНЫ БАЙРЛАЛ («Буцаасан») — `edgePath`-ийн ЯГ тэр салбараар.
 */
export function edgeLabelAt(
  a: Box, b: Box, kind: EdgeKind,
): { x: number; y: number; anchor: 'middle' | 'start' } {
  if (kind === 'back') {
    const x1 = a.x + a.w / 2;
    const x2 = b.x + b.w / 2;
    /* Тохой — мөр хоорондын зайн ДУНД (`g`) хэвтээ хэсэг */
    if (b.y + b.h < a.y) {
      const g = (b.y + b.h + a.y) / 2;
      if (Math.abs(x2 - x1) < 24) return { x: Math.max(x1, x2) + 8, y: g + 3.5, anchor: 'start' };
      return { x: (x1 + x2) / 2, y: g - 4, anchor: 'middle' };
    }
    /* Дээгүүр нуман — куб Безьегийн t=0.5 цэг, түүнээс 6px ДЭЭР */
    const up = Math.min(a.y, b.y) - 22;
    return { x: (x1 + x2) / 2, y: (a.y + b.y + 6 * up) / 8 - 6, anchor: 'middle' };
  }
  /* Босоо (нэг багана) — шугамын хажууд */
  if (b.x + b.w > a.x && a.x + a.w > b.x) {
    const down = b.y > a.y;
    const y1 = down ? a.y + a.h : a.y;
    const y2 = down ? b.y : b.y + b.h;
    return { x: (a.x + b.x + a.w) / 2 + 8, y: (y1 + y2) / 2 + 3.5, anchor: 'start' };
  }
  /* Хэвтээ — Безьегийн дунд цэгээс дээш */
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  const left = b.x + b.w <= a.x;
  return {
    x: left ? (a.x + b.x + b.w) / 2 : (a.x + a.w + b.x) / 2,
    y: (ay + by) / 2 - 6,
    anchor: 'middle',
  };
}

/* ══════════════════ Амьд төлөв ══════════════════ */

export type SchemState = {
  metrics: Metric[];
  health: Health;
  /** Тоог зөв уншихад ЗААВАЛ хэрэгтэй тайлбар (жингийн хамралт г.м.) */
  note?: string;
  /** Энэ тоо багцаар задардаггүй — «төслийн нийт» гэж тэмдэглэнэ */
  projectWide?: true;
};

export type SchemLive = Record<SchemId, SchemState>;

/**
 * БАГЦААР ЗАДАРДАГГҮЙ зангилаа — `buildSchem`-ийн `projectWide: true`, `nodeDetail`-ийн
 * pkg-г үл тоодог `PART`-тай ЯГ ИЖИЛ олонлог. Нэгийг өөрчилбөл бусдыг нь ч.
 */
export const PROJECT_WIDE: ReadonlySet<SchemId> = new Set<SchemId>([
  'tolovlolt', 'gazar', 'habea', 'ersdel', 'tailan',
]);

/**
 * Багцын мөрөөс схемд хэрэгтэй хэсэг.
 */
export type BagtsLite = {
  key: string;
  label: string;
  progress: number | null;
  missing: number;
  blocks: number;
  ail: number;
  contractor: string;
};

/**
 * ЭХ СУРВАЛЖИЙН НЭР — унасан үед хэрэглэгчид ЭНЭ нэрээр хэлнэ.
 */
export const SOURCE_NAME = {
  get headline() { return tr('ерөнхий үзүүлэлт'); },
  get clearance() { return tr('газар чөлөөлөлт'); },
  get overall() { return tr('нийт гүйцэтгэл'); },
  get progress() { return tr('блокийн гүйцэтгэл'); },
  get finance() { return tr('санхүү'); },
  get habea() { return tr('ХАБЭА'); },
  get zov() { return tr('зөвшөөрөл'); },
  get review() { return tr('гүйцэтгэлийн хяналт'); },
  get bagts() { return tr('багцын жагсаалт'); },
} as const;

export type SourceKey = keyof typeof SOURCE_NAME;

/** `live.ts` ба `reportData.ts`-ийн хэсгүүд — бүгд ТУСДАА унаж болно */
export type SchemSources = {
  headline: { areaHa: number; population: number; investTotal: number } | null;
  clearance: { cleared: number; remaining: number; remainingHa: number; total: number; pct: number | null } | null;
  overall: { pct: number | null; weightSum: number; rows: number } | null;
  progress: { blocks: number; reported?: number; overall: number | null; date: string; stalled: number } | null;
  finance: { budget: number; contractAmount: number; paid: number | null; paidPct?: number | null; byBagts: Record<string, number> } | null;
  habea: { workers: number; tehnik: number; incidents: number } | null;
  zov: Zov[] | null;
  review: Record<string, unknown>[] | null;
  bagts: BagtsLite[] | null;
  /** Унасан эх сурвалжийн НЭР — толгойн зурвасд ил бичигдэнэ */
  failed: string[];
};

/**
 * `loadHeadline` нь унасан эх сурвалжийнхаа талбарыг `null`-аар БИШ `NaN`-аар
 * тэмдэглэдэг (`live.ts` §Headline-ийн тайлбар). `NaN >= 60` нь `false` тул
 * шууд `grade`-д өгвөл сүлжээний түр доголдол «САНХҮҮ МУУ» гэсэн УЛААН тэмдэг
 * болж, байхгүй асуудлыг зарлана.
 */
export const fin = (v: number | null | undefined): number | null =>
  (v != null && Number.isFinite(v) ? v : null);

/**
 * Хувь → төлөв.
 */
export const grade = (v: number | null, good: number, warn: number): Health =>
  (v == null ? 'none' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad');

/** Босгууд НЭГ газар — тестээр яг тэр хилүүд бэхлэгдэнэ */
export const TH = {
  gazarPct: { good: 90, warn: 60 },
  barilgaPct: { good: 70, warn: 40 },
  paidPct: { good: 60, warn: 30 },
  /** Сүүлийн тайлангийн нас, хоногоор (их нь МУУ тул урвуу) */
  reportAgeD: { warn: 14, bad: 30 },
} as const;


/**
 * ТӨСВИЙН ЖИНГИЙН ХАМРАЛТ, 0–100 — гүйцэтгэл нь ХЭМЖИГДСЭН орон сууцны багцуудын
 * төсөв ÷ БҮХ орон сууцны багцын төсөв.
 */
export function housingWeight(src: Pick<SchemSources, 'bagts' | 'finance'>): number | null {
  const rows = src.bagts;
  if (!rows || !rows.length) return null;
  const cost = (b: BagtsLite) => fin(src.finance?.byBagts[b.key]) ?? 0;
  const byCost = rows.some((b) => cost(b) > 0);
  let all = 0;
  let got = 0;
  for (const b of rows) {
    const w = byCost ? cost(b) : b.blocks;
    if (!(w > 0)) continue;
    all += w;
    if (b.blocks > 0) got += w * (Math.max(0, b.blocks - b.missing) / b.blocks);
  }
  return all > 0 ? (got / all) * 100 : null;
}

/**
 * Сонгосон багцын мөр (`samePkg` — бичиглэлийн зөрүүг тэсвэрлэнэ).
 */
export const pkgRow = (bagts: readonly BagtsLite[] | null, pkg: string | null | undefined): BagtsLite | null =>
  (pkg && bagts ? bagts.find((b) => samePkg(b.label, pkg) || samePkg(b.key, pkg)) ?? null : null);

/**
 * Багцын шүүлт — ЗӨВХӨН `bagtsKey`-ээр.
 */
export const samePkg = (v: unknown, pkg: string) => bagtsKey(v) === bagtsKey(pkg);

/**
 * Түүхий ArcGIS мөрийг `groupWorks`-ийн хүлээх хэлбэрт оруулна.
 */
export const toWork = (r: Record<string, unknown>): Row => ({
  ...(r as unknown as Row),
  __oid: Number(r[HYANALT.oid] ?? 0),
  [HF.ergelt]: Number(r[HF.ergelt] ?? 0),
  [HF.bagts]: String(r[HF.bagts] ?? ''),
  [HF.ajil]: String(r[HF.ajil] ?? ''),
  [HF.company]: String(r[HF.company] ?? ''),
  [HF.status]: String(r[HF.status] ?? '') as Status,
});

/**
 * Хяналтыг «хэний гар дээр байна» гэж ангилна — АЖЛААР, мөрөөр БИШ.
 */
export function reviewCounts(rows: Record<string, unknown>[]): {
  byStage: Record<Stage, number>;
  returnedByStage: Record<Stage, number>;
  pending: number;
  returned: number;
  done: number;
} {
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>;
  const returnedByStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>;
  let pending = 0;
  let returned = 0;
  let done = 0;
  for (const w of groupWorks(rows.map(toWork))) {
    const st = w.status;
    const owner = OWNER[st];
    if (!owner) continue;
    if (st === STATUS.transferred) { done += 1; continue; }
    byStage[owner] += 1;
    pending += 1;
    if ((Object.values(RETURNED_STATUS) as Status[]).includes(st)) {
      returned += 1;
      returnedByStage[owner] += 1;
    }
  }
  return { byStage, returnedByStage, pending, returned, done };
}

/** `hyanalt` зангилааны дотоод долоон цэгийн зурвас (2026-10-23) — гадуур экспортлоно */
export function stageRail(src: SchemSources, pkg?: string | null): { stage: Stage; n: number }[] | null {
  if (!src.review) return null;
  const rows = pkg
    ? src.review.filter((r) => samePkg(r[HF.bagts], pkg))
    : src.review;
  const { byStage } = reviewCounts(rows);
  return STAGE_ORDER.map((s) => ({ stage: s, n: byStage[s] }));
}

/**
 * ЭХ СУРВАЛЖУУДЫГ ЗАНГИЛАА БОЛГОНО.
 *
 * @param pkg Багцын нэр («Багц 4-1»). `null` бол төслийн нийт.
 */
export function buildSchem(src: SchemSources, pkg: string | null = null): SchemLive {
  const bagtsRow = pkgRow(src.bagts, pkg);
  const lost = !!pkg && !bagtsRow;
  const lostWhy = lost ? tr('Энэ багцад мөр олдсонгүй.') : undefined;

  /* ── Төлөвлөгөө ── */
  const area = fin(src.headline?.areaHa);
  const tolovlolt: SchemState = {
    projectWide: true,
    health: 'none',
    metrics: [
      { label: tr('Төслийн талбай'), value: area, kind: 'ha' },
      { label: tr('Хүн ам'), value: fin(src.headline?.population), kind: 'count' },
      { label: tr('Төсөвт өртөг'), value: fin(src.headline?.investTotal), kind: 'mnt' },
    ],
  };

  /* ── Зөвшөөрөл ── */
  let zovList = src.zov;
  if (zovList && pkg) zovList = zovList.filter((z) => samePkg(z.bagts, pkg));
  let zovState: SchemState;
  if (!zovList) {
    zovState = {
      health: 'none',
      metrics: [
        { label: tr('Зөвшөөрсөн'), value: null, kind: 'count', why: tr('Үйлчилгээ татагдсангүй') },
        { label: tr('Хүлээгдэж буй'), value: null, kind: 'count' },
      ],
    };
  } else {
    const ok = zovList.filter((z) => z.tolov === TOLOV.ok).length;
    const wait = zovList.filter((z) => z.tolov === TOLOV.wait).length;
    const no = zovList.filter((z) => z.tolov === TOLOV.no).length;
    const unknown = zovList.filter((z) => z.tolov === 'unknown').length;
    zovState = {
      health: no > 0 || unknown > 0 ? 'bad' : wait > 0 ? 'warn' : zovList.length ? 'good' : 'none',
      metrics: [
        { label: tr('Зөвшөөрсөн'), value: ok, kind: 'count' },
        { label: tr('Хүлээгдэж буй'), value: wait, kind: 'count' },
        { label: tr('Татгалзсан'), value: no + unknown, kind: 'count' },
      ],
    };
  }

  /* ── Газар чөлөөлөлт ── */
  const clrPct = fin(src.clearance?.pct);
  const gazar: SchemState = {
    projectWide: true,
    health: grade(clrPct, TH.gazarPct.good, TH.gazarPct.warn),
    metrics: [
      { label: tr('Чөлөөлсөн'), value: clrPct, kind: 'pct' },
      { label: tr('Үлдсэн талбар'), value: fin(src.clearance?.remaining), kind: 'count' },
      { label: tr('Үлдсэн талбай'), value: fin(src.clearance?.remainingHa), kind: 'ha' },
    ],
  };

  /**
   * ── Хуваарь ──
   */
  const huvaari: SchemState = {
    health: 'none',
    metrics: [{
      label: tr('Хуваарийн хамралт'),
      value: null,
      kind: 'pct',
      why: tr('Хуваарь багц бүрээр ачаалагддаг — схемд амьд тоо гаргахгүй'),
    }],
  };

  /* ── Барилга угсралт ── */
  const bPct = bagtsRow ? fin(bagtsRow.progress) : lost ? null : fin(src.overall?.pct);
  const weightSum = housingWeight(src);
  const barilga: SchemState = {
    health: grade(bPct, TH.barilgaPct.good, TH.barilgaPct.warn),
    metrics: [
      { label: tr('Гүйцэтгэл'), value: bPct, kind: 'pct', why: lostWhy },
      {
        label: tr('Тайлагнасан блок'),
        value: bagtsRow ? bagtsRow.blocks - bagtsRow.missing : lost ? null
          : src.bagts ? src.bagts.reduce((a, b) => a + Math.max(0, b.blocks - b.missing), 0) : fin(src.progress?.reported),
        kind: 'count',
        why: lostWhy,
      },
      {
        label: tr('Тайлангүй блок'),
        value: bagtsRow ? bagtsRow.missing
          : lost || !src.bagts ? null : src.bagts.reduce((a, b) => a + b.missing, 0),
        kind: 'count',
        why: lostWhy,
      },
    ],
    note: !pkg && weightSum != null && weightSum < 100
      ? tr('Төсвийн жингийн {0}% л бүртгэгдсэн', weightSum.toFixed(0))
      : undefined,
  };

  /* ── Гүйцэтгэлийн хяналт ── */
  const rows = src.review
    ? (pkg ? src.review.filter((r) => samePkg(r[HF.bagts], pkg)) : src.review)
    : null;
  const rc = rows ? reviewCounts(rows) : null;
  const hyanalt: SchemState = {
    health: rc == null ? 'none' : rc.returned > 0 ? 'warn' : rc.pending > 0 ? 'warn' : 'good',
    metrics: [
      { label: tr('Хүлээгдэж буй'), value: rc ? rc.pending : null, kind: 'count' },
      { label: tr('Буцаасан'), value: rc ? rc.returned : null, kind: 'count' },
    ],
  };

  /* ── ХАБЭА ── */
  const inc = fin(src.habea?.incidents);
  const habea: SchemState = {
    projectWide: true,
    health: inc == null ? 'none' : inc > 0 ? 'bad' : 'good',
    metrics: [
      { label: tr('Ажилтан'), value: fin(src.habea?.workers), kind: 'count' },
      { label: tr('Техник'), value: fin(src.habea?.tehnik), kind: 'count' },
      { label: tr('Осол, зөрчил'), value: inc, kind: 'count' },
    ],
  };

  /* ── Эрсдэл ── */
  const stalled = fin(src.progress?.stalled);
  const ersdel: SchemState = {
    projectWide: true,
    health: stalled == null ? 'none' : stalled > 0 ? 'warn' : 'good',
    metrics: [
      { label: tr('Эхлээгүй блок (<1%)'), value: stalled, kind: 'count' },
    ],
  };

  /* ── Санхүүжилт ── */
  const budget = bagtsRow && src.finance
    ? fin(src.finance.byBagts[bagtsRow.key])
    : lost ? null : fin(src.finance?.budget);
  const paid = pkg ? null : fin(src.finance?.paid);
  const paidPct = pkg ? null : fin(src.finance?.paidPct);
  const sankhuu: SchemState = {
    health: grade(paidPct, TH.paidPct.good, TH.paidPct.warn),
    metrics: [
      { label: tr('Төсөвт өртөг'), value: budget, kind: 'mnt', why: lostWhy },
      {
        label: tr('Олгосон'),
        value: paid,
        kind: 'mnt',
        why: pkg ? tr('Олголт багцаар задардаггүй') : undefined,
      },
      { label: tr('Гэрээний дүн'), value: pkg ? null : fin(src.finance?.contractAmount), kind: 'mnt' },
    ],
  };

  /* ── Тайлан ── */
  const ageD = ageDays(src.progress?.date);
  const tailan: SchemState = {
    projectWide: true,
    health: ageD == null ? 'none'
      : ageD >= TH.reportAgeD.bad ? 'bad'
        : ageD >= TH.reportAgeD.warn ? 'warn' : 'good',
    metrics: [
      { label: tr('Сүүлийн тайлангийн нас'), value: ageD, kind: 'day' },
      { label: tr('Бүртгэгдсэн блок'), value: fin(src.overall?.rows), kind: 'count' },
    ],
  };

  return { tolovlolt, zovshoorol: zovState, gazar, huvaari, barilga, hyanalt, habea, ersdel, sankhuu, tailan };
}

/**
 * «YYYY-MM-DD» → өнөөдрөөс хойших хоног. Танигдахгүй бол `null`.
 */
export function ageDays(date: string | undefined, now: number = Date.now()): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const day = new Date(y, mo, d);
  if (day.getFullYear() !== y || day.getMonth() !== mo || day.getDate() !== d) return null;
  const n = new Date(now);
  if (!Number.isFinite(n.getTime())) return null;
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.max(0, Math.round((today.getTime() - day.getTime()) / 86_400_000));
}

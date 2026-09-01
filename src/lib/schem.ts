/**
 * ТӨСЛИЙН ҮЙЛ АЖИЛЛАГААНЫ СХЕМ — ЦЭВЭР ЗАГВАР.
 *
 * ⚠️ REACT Ч, СҮЛЖЭЭ Ч ЭНД ОРОХГҮЙ. Зөвхөн тогтмол топологи, байрлалын
 * тооцоо, амьд тоог зангилаанд суулгах цэвэр функц. Ингэснээр `schem.check.mjs`
 * түүнийг шууд импортлон шалгана — зурагдах кодыг ажиллуулах шаардлагагүй.
 *
 * ⚠️ ЯАГААД ЭНЭ ХАРАГДАЦ (2026-08-31, хэрэглэгчийн шийдвэр): порталд 15
 * харагдац бий ч тэдгээр нь хоорондоо ХЭРХЭН ХОЛБОГДОХЫГ хэлдэг газар байхгүй.
 * «Гүйцэтгэл хаанаас эхэлж хаана дуусдаг вэ» гэдгийг мэдэхийн тулд харагдац
 * бүрийг тус тусад нь нээж толгойдоо угсрах шаардлагатай байв.
 *
 * ⚠️ ХАМГИЙН ЧУХАЛ ДҮРЭМ — БАЙХГҮЙ ПРОЦЕССЫГ БАЙГАА МЭТ ЗУРАХГҮЙ.
 * Кодыг судалснаар: төсөлд ЖИНХЭНЭ төлөвийн машин ЕРДӨӨ НЭГ — гүйцэтгэлийн
 * дөрвөн шатны хяналт (`hyanalt.ts`: 7 төлөв, `OWNER`, `apply`/`recheck`).
 * Бусад нь:
 *   · Зөвшөөрөл — дараалал нь ӨГӨГДЛӨӨС (`shat` бүхэл тоо, багц бүрд өөр)
 *   · Газар чөлөөлөлт — шат БИШ, `Tuluv` талбарын АНГИЛАЛ
 *   · Санхүү (Гэрээ→IPC) — дараалал нь зөвхөн талбарын тайлбарт; кодод
 *     төлөвийн машин ч, төлөвийн enum ч БАЙХГҮЙ
 * Тиймээс ирмэг нь ГУРВАН төрөлтэй (`main`/`feed`/`back`) бөгөөд «хамаарал»-ыг
 * «төлөвийн шилжилт»-ээс ялгана. Нэг сумаар зурвал «газар чөлөөлөгдмөгц
 * барилга автоматаар эхэлдэг» гэсэн худал ойлголт төрнө.
 *
 * ⚠️ `null` ≠ 0. Эх сурвалж унавал метрик нь `null` хэвээр үлдэж «—» зурагдана.
 * Энэ репо тэр алдааг хоёр удаа гаргасан (тэг гүйцэтгэл ба мэдээлэлгүйг
 * нэгтгэсэн) тул `schem.check.mjs` нь «бүх эх сурвалж унасан үед аль ч метрик
 * 0 БАЙХГҮЙ» гэдгийг тусгайлан шалгана.
 */

import { t as tr } from '@/lib/i18nCore';
import { bagtsKey, type ViewKey } from '@/lib/services';
import {
  HYANALT, OWNER, STAGE_ORDER, STATUS, F as HF,
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
 * ⚠️ `none` нь «МЭДЭХГҮЙ» — «сайн» БИШ. Саарал өнгө ба «Мэдээлэлгүй» гэсэн
 *    ҮГ хоёулаа гарна: өнгө сохор хүн ба хар цагаан хэвлэлтэд ч уншигдана.
 *    Хэрэв `none` нь ногоонтой ойролцоо өнгөтэй байвал БҮРЭН тасалдал
 *    «эрүүл төсөл» мэт харагдана.
 */
export type Health = 'good' | 'warn' | 'bad' | 'none';

export type MetricKind = 'count' | 'pct' | 'mnt' | 'ha' | 'day';

export type Metric = {
  label: string;
  /** ⚠️ `null` = татагдаагүй/тооцоологдохгүй. ТЭГ-ээр ХЭЗЭЭ Ч орлуулахгүй. */
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
  /** ⚠️ ГАРААР зохиосон тор — доорх `layout` тайлбарыг үз */
  col: number;
  row: number;
};

/**
 * ⚠️ ГУРВАН ӨӨР ИРМЭГ:
 *   main — үе шатны ХАМААРАЛ (өмнөх нь дуусалгүйгээр дараагийнх утгагүй)
 *   feed — ТЭЖЭЭХ холбоо (өгөгдөл нь нөгөө рүү ордог ч дараалал биш)
 *   back — БУЦААХ шилжилт (кодод бичигдсэн жинхэнэ шилжилт)
 */
export type EdgeKind = 'main' | 'feed' | 'back';

export type SchemEdge = {
  from: SchemId;
  to: SchemId;
  kind: EdgeKind;
  label?: string;
};

/* ══════════════════ Топологи ══════════════════ */

/**
 * ⚠️ ГҮЙЦЭТГЭЛИЙН 4 ШАТ НЬ НЭГ ЗАНГИЛАА. Тэднийг дөрвөн тусдаа зангилаа
 * болговол схемийн 40%-ийг нэг дэд процесс эзэлж, «төслийн мөчлөг» гэдэг санаа
 * алдагдана. Оронд нь `hyanalt` зангилаа ДОТРОО дөрвөн цэгийн зурвас
 * харуулна (`Guitsetgel.tsx`-ийн `Track` загвар) — жинхэнэ төлөвийн машин ил
 * хэвээр, дэлгэрэнгүй нь тэр харагдацад.
 */
/**
 * ⚠️ МӨР БҮР УТГАТАЙ (2026-08-31-ний дахин зохиомж). Урьд нь зангилаанууд
 * зүгээр л сул нүд рүү тарсан байсан тул «яагаад энэ энд байгаа юм бэ» гэсэн
 * асуулт төрдөг байв. Одоо:
 *
 *   мөр 0 — ЗӨВШӨӨРӨХ / ХЯНАХ  (гадны шийдвэр хүлээх цэгүүд)
 *   мөр 1 — ҮНДСЭН УРСГАЛ       (төлөвлөх → барих → санхүүжүүлэх → тайлагнах)
 *   мөр 2 — НӨХЦӨЛ / АЮУЛГҮЙ БАЙДАЛ
 *   мөр 3 — ЭРСДЭЛ
 *
 * ⚠️ ХАБЭА ба Эрсдэл нь ГАРАХ ирмэггүй. Тэдгээр нь урсгалын шат БИШ, барилга
 * угсралтын ХАЖУУГИЙН ХЭМЖҮҮР — «ХАБЭА дуусмагц санхүүжилт олгогдоно» гэсэн
 * дараалал байхгүй. Урьд нь `habea → sankhuu` гэсэн ирмэг зурсан нь тийм
 * хамаарал байгаа мэт худал ойлголт төрүүлж байв.
 */
export const NODES: readonly SchemNode[] = [
  {
    id: 'tolovlolt', col: 0, row: 1, view: 'plan', icon: 'layers',
    title: tr('Ерөнхий төлөвлөгөө'),
    desc: tr('Бүс, барилга, инженерийн дэд бүтэц — төслийн эхлэл'),
  },
  {
    id: 'zovshoorol', col: 1, row: 0, view: 'zovshoorol', icon: 'shield',
    title: tr('Зөвшөөрөл'),
    desc: tr('Багц бүрийн зөвшөөрлүүд — шатлал нь өгөгдлөөс тодорхойлогдоно'),
  },
  {
    id: 'gazar', col: 1, row: 2, view: 'gazar', icon: 'frame',
    title: tr('Газар чөлөөлөлт'),
    desc: tr('Нэгж талбарын төлөв — барилга эхлүүлэх нөхцөл'),
  },
  {
    id: 'huvaari', col: 2, row: 1, view: 'huvaari', icon: 'calendar',
    title: tr('Хуваарь'),
    desc: tr('Ажлын эхлэх, дуусах хугацаа — блокийн хэмнэлээр'),
  },
  {
    id: 'barilga', col: 3, row: 1, view: 'pkgProg', icon: 'building',
    title: tr('Барилга угсралт'),
    desc: tr('Блокийн биет гүйцэтгэл — «Гүйцэтгэл бөглөх» хуудсаас'),
  },
  {
    id: 'ersdel', col: 4, row: 3, view: 'ersdel', icon: 'waves',
    title: tr('Эрсдэл'),
    desc: tr('Зогссон блок, байгалийн аюулын нөлөө'),
  },
  {
    id: 'hyanalt', col: 4, row: 0, view: 'guitsetgel', icon: 'pen',
    title: tr('Гүйцэтгэлийн хяналт'),
    desc: tr('Гүйцэтгэгч → инженер → багцын менежер → ерөнхий менежер'),
  },
  {
    id: 'habea', col: 3, row: 2, view: 'habea', icon: 'flame',
    title: tr('ХАБЭА'),
    desc: tr('Ажилтан, техник, осол зөрчил'),
  },
  {
    id: 'sankhuu', col: 4, row: 1, view: 'pkgFin', icon: 'calc',
    title: tr('Санхүүжилт'),
    desc: tr('Гэрээ, IPC акт, олгосон санхүүжилт'),
  },
  {
    id: 'tailan', col: 5, row: 1, view: 'tailan', icon: 'chart',
    title: tr('Тайлан'),
    desc: tr('Нэгтгэсэн үзүүлэлт — төслийн эцсийн баримт'),
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
  /**
   * ⚠️ ЦОРЫН ГАНЦ ЖИНХЭНЭ БУЦААЛТ. Хяналтын аль ч шат буцаавал ажил
   * гүйцэтгэгч рүү эргэж, дахин бөглөгдөнө (`hyanaltStore.apply`). Энэ ирмэг
   * байхгүй бол схем нь «нэг л удаа өгвөл болоо» гэсэн худал зураг болно.
   */
  { from: 'hyanalt', to: 'barilga', kind: 'back', label: tr('Буцаасан') },
  /**
   * ХАЖУУГИЙН ХЭМЖҮҮР — дараалал БИШ, барилгаас САЛБАРЛАСАН хяналт.
   * ⚠️ Хоёулаа `barilga`-аас ШУУД гарна. Урьд нь `gazar → ersdel` гэсэн ирмэг
   * байсан нь схемийг хөндлөн огтолж, ямар ч утга нэмээгүй.
   */
  { from: 'barilga', to: 'habea', kind: 'feed' },
  { from: 'barilga', to: 'ersdel', kind: 'feed' },
];

export const NODE_BY_ID: Record<SchemId, SchemNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
) as Record<SchemId, SchemNode>;

/**
 * Топологийн дараалал (`back` ирмэгийг үл тооно — тэр нь мөчлөг үүсгэнэ).
 * ⚠️ DOM-д зангилаануудыг ЭНЭ дарааллаар байрлуулна: Tab дарахад хэрэглэгч
 *    төслийн мөчлөгөөр алхана, зурган дээрх байрлалаар биш.
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
 * ⚠️ БАЙРЛАЛ ГАРААР ЗОХИОГДСОН, АЛГОРИТМААР БИШ.
 *
 * 10 зангилаанд layered (Sugiyama) алгоритм нь ~150 мөр код, огтлолцол
 * багасгах шат шаардана. Түүнээс гадна зангилаа нэмэх бүрд БҮХ зургийг дахин
 * байрлуулж, хэрэглэгчийн орон зайн ой санамжийг эвднэ («газар чөлөөлөлт
 * доод зүүн буланд байдаг» гэдэг нь суралцсан зүйл).
 *
 * Дараалал нь БИЗНЕСИЙН БАРИМТ — бодож олох зүйл биш. `col`/`row` тогтмол нь
 * diff-д уншигдана, шинэ хүн зургийг кодоос шууд харна.
 */
/**
 * ⚠️ ХЭМЖЭЭ 2026-08-31-нд ТОМСГОВ. Анхны 176×78 нь хэт нарийн байв: гурван
 * үзүүлэлт + төлвийн шошго + хяналтын дөрвөн цэг багтахгүй тул доод мөр нь
 * тасарч, «Буцаасан 5» гэсэн тоо нүднээс алга болж байлаа. Мөр бүрд ЯГ хэдэн
 * мөр багтахыг тооцов: гарчиг 18 + зурвас 15 + гурван үзүүлэлт 42 + тэмдэглэл
 * 12 + шошго 16 + доторх зай 17 ≈ 120.
 *
 * ⚠️ `pad` нь 34 — БУЦААХ ирмэг зангилаануудын ДЭЭГҮҮР эргэлддэг тул дээд
 * талд зай хэрэгтэй (доогуур явуулбал ХАБЭА, Эрсдэл хоёрыг огтолно).
 */
/**
 * ⚠️ ХЭМЖЭЭ нь ДЭЛГЭЦИЙН ХАРЬЦААНААС гарна. Схем нь өргөнөөрөө багтдаг тул
 * масштаб нь ӨРГӨНӨӨР хязгаарлагдана; хэрэв зураг хэт өргөн бол өндрийн
 * ихэнх нь хоосон үлдэнэ. Ердийн дэлгэц ≈2.1:1 тул зураг ч түүнд ойр байх
 * ёстой: 6 багана × 4 мөр нь ≈1882×760 = 2.5:1 — хамгийн ойр хослол.
 * (7 багана × 4 мөр нь 3.2:1 байсан тул өндрийн 53% нь хоосон байв.)
 */
export const GEO = { w: 220, h: 140, gapX: 78, gapY: 44, pad: 34 } as const;

export type Box = { x: number; y: number; w: number; h: number };

export type Geo = { w: number; h: number; gapX: number; gapY: number; pad: number };

/** Байрлалд шаардлагатай ХАМГИЙН БАГА мэдээлэл — бүдүүн ба нарийн хоёр схем ижилхэн хэрэглэнэ */
export type Placed = { id: string; col: number; row: number };

/**
 * ЕРӨНХИЙ ТОРЫН БАЙРЛАЛ.
 *
 * ⚠️ ХОЁР СХЕМ НЭГ ЛОГИКООР. «Ерөнхий» (10 карт) ба «Дэлгэрэнгүй» (24 карт)
 * хоёр өөр торон дээр зурагддаг ч тооцоо нь ГАНЦ функц — хоёр газар бичвэл
 * нэгийг нь зассан үед нөгөө нь чимээгүй зөрж, ирмэг зангилаанаасаа тасарна.
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
 * ⚠️ Хоёр цэгийн хооронд Catmull-Rom сплайн (`PkgProg.curve`) хэрэглэх нь
 * илүүц — хэвтээ шүргэгчтэй энгийн куб Безье нь ойлгомжтой ба хяналтын цэг нь
 * зайнаас хамаарч тохируулагдана.
 *
 * `back` нь ДООГУУР нуман: урвуу чиглэлийг шулуунаар зурвал `main` ирмэгтэй
 * давхарлаж, хоёулаа уншигдахгүй болно.
 */
export function edgePath(a: Box, b: Box, kind: EdgeKind): string {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;

  /**
   * ⚠️ БУЦААХ ирмэг ДЭЭГҮҮР эргэлдэнэ, доогуур БИШ. Доогуур явуулахад ХАБЭА
   * (row 2) ба Эрсдэл (row 3) зангилаануудыг огтолж, улаан шугам хоёр
   * хайрцгийн дундуур гарч уншигдахаа больдог байв.
   */
  if (kind === 'back') {
    const x1 = a.x + a.w / 2;
    const x2 = b.x + b.w / 2;
    const up = Math.min(a.y, b.y) - 22;
    return `M ${x1} ${a.y} C ${x1} ${up}, ${x2} ${up}, ${x2} ${b.y}`;
  }

  /**
   * ⚠️ БОСОО ирмэг (ижил багана — ж. Барилга → Эрсдэл). Хэвтээ шүргэгчтэй
   * Безье нь энд хажуу тийш цухуйж, хоосон зайд нуман зурдаг тул доод/дээд
   * ирмэгээс босоо шүргэгчтэйгээр холбоно.
   */
  if (b.x + b.w > a.x && a.x + a.w > b.x) {
    const cx1 = a.x + a.w / 2;
    const cx2 = b.x + b.w / 2;
    const down = b.y > a.y;
    const y1 = down ? a.y + a.h : a.y;
    const y2 = down ? b.y : b.y + b.h;
    const dy = Math.max(20, Math.abs(y2 - y1) * 0.55) * (down ? 1 : -1);
    return `M ${cx1} ${y1} C ${cx1} ${y1 + dy}, ${cx2} ${y2 - dy}, ${cx2} ${y2}`;
  }

  const x1 = a.x + a.w;
  const x2 = b.x;
  const dx = Math.max(28, (x2 - x1) * 0.55);
  return `M ${x1} ${ay} C ${x1 + dx} ${ay}, ${x2 - dx} ${by}, ${x2} ${by}`;
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
 * Багцын мөрөөс схемд хэрэгтэй хэсэг.
 *
 * ⚠️ `loadBagtsRows` (`execData.ts`) нь эдгээрээс ГАДНА `origin`, `keys` г.м.
 * буцаадаг — энд зөвхөн схем ба дэлгэрэнгүй самбарт ХЭРЭГЛЭГДДЭГ талбаруудыг
 * нэрлэнэ. Урьд нь дөрөв (`key`·`label`·`progress`·`missing`) байсан тул
 * дэлгэрэнгүй самбарт блокийн тоо, гүйцэтгэгчийг үзүүлэх боломжгүй байв —
 * өгөгдөл нь аль хэдийн ирсэн атлаа ТӨРӨЛ нь нуудаг байсан.
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
 *
 * ⚠️ `schemData.ts`-д БИШ ЭНД байрлана: `SchemSources.failed` нь ЭДГЭЭР мөрийг
 * агуулдаг тул дэлгэрэнгүй самбар «энэ зангилаа аль эх сурвалжаас гарав, тэр
 * нь татагдсан уу» гэдгийг тулгахын тулд ижил тольд хүрэх ёстой. Хоёр газар
 * бичвэл нэгийг нь засахад нөгөө нь чимээгүй зөрж, самбар «бүгд хэвийн» гэж
 * ХУДАЛ хэлнэ. `schemData.ts` нь сүлжээний модуль тул тэндээс импортлох
 * боломжгүй (цэвэр загварыг бохирдуулна).
 */
export const SOURCE_NAME = {
  headline: tr('ерөнхий үзүүлэлт'),
  clearance: tr('газар чөлөөлөлт'),
  overall: tr('нийт гүйцэтгэл'),
  progress: tr('блокийн гүйцэтгэл'),
  finance: tr('санхүү'),
  habea: tr('ХАБЭА'),
  zov: tr('зөвшөөрөл'),
  review: tr('гүйцэтгэлийн хяналт'),
  bagts: tr('багцын жагсаалт'),
} as const;

export type SourceKey = keyof typeof SOURCE_NAME;

/** `live.ts` ба `reportData.ts`-ийн хэсгүүд — бүгд ТУСДАА унаж болно */
export type SchemSources = {
  headline: { areaHa: number; population: number; investTotal: number } | null;
  clearance: { cleared: number; remaining: number; remainingHa: number; total: number; pct: number | null } | null;
  overall: { pct: number; weightSum: number; rows: number } | null;
  progress: { blocks: number; overall: number; date: string; stalled: number } | null;
  finance: { budget: number; contractAmount: number; paid: number; byBagts: Record<string, number> } | null;
  habea: { workers: number; tehnik: number; incidents: number } | null;
  /** ⚠️ `null` = үйлчилгээ унасан; `[]` = мөр байхгүй. ХОЁР ӨӨР УТГА. */
  zov: Zov[] | null;
  review: Record<string, unknown>[] | null;
  bagts: BagtsLite[] | null;
  /** Унасан эх сурвалжийн НЭР — толгойн зурвасд ил бичигдэнэ */
  failed: string[];
};

/**
 * ⚠️ NaN → null.
 *
 * `loadHeadline` нь унасан эх сурвалжийнхаа талбарыг `null`-аар БИШ `NaN`-аар
 * тэмдэглэдэг (`live.ts` §Headline-ийн тайлбар). `NaN >= 60` нь `false` тул
 * шууд `grade`-д өгвөл сүлжээний түр доголдол «САНХҮҮ МУУ» гэсэн УЛААН тэмдэг
 * болж, байхгүй асуудлыг зарлана.
 */
export const fin = (v: number | null | undefined): number | null =>
  (v != null && Number.isFinite(v) ? v : null);

/**
 * Хувь → төлөв.
 * ⚠️ Мэдэхгүй бол төлөв нь ч мэдэгдэхгүй (`none`) — ногоон болгож «зөв» гэж
 *    худлаа хэлэхгүй.
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

/** Хуваалт — хуваарь нь эерэг байж л утгатай, эс бөгөөс `null` (0 БИШ) */
const share = (a: number | null, b: number | null): number | null =>
  (a == null || b == null || b <= 0 ? null : (a / b) * 100);

/**
 * Багцын шүүлт — ЗӨВХӨН `bagtsKey()`-ээр.
 *
 * ⚠️ Багцын нэр эх сурвалж бүрд ӨӨР бичиглэлтэй: `building_GOL.BAGTS` нь
 * «Багц 4.1», хяналтын хүснэгтийн `Багц` нь «Багц 4-1». Түүхий мөр
 * харьцуулбал («===») тэр багцын мөрүүд БҮГД шүүгдэж, зангилаа «Хүлээгдэж
 * буй 0» гэж ХУДАЛ НОГООН болно — байхгүй ажлыг «цэвэр» гэж мэдээлнэ.
 * `execData.ts` энэ зангыг аль хэдийн баримтжуулсан, схем түүнийг дагана.
 */
export const samePkg = (v: unknown, pkg: string) => bagtsKey(v) === bagtsKey(pkg);

/**
 * Түүхий ArcGIS мөрийг `groupWorks`-ийн хүлээх хэлбэрт оруулна.
 *
 * ⚠️ `hyanaltStore.toRow`-ыг ЭНД импортлож БОЛОХГҮЙ — тэр модуль React-тай
 * (`'use client'`, хук) тул схемийн цэвэр загварыг бохирдуулж, `schem.check.mjs`
 * ажиллахаа болино. Бүлэглэлтэд ЗӨВХӨН эдгээр талбар хэрэгтэй; огноог
 * хөрвүүлэхгүй.
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
 *
 * ⚠️ Хяналтын хүснэгтэд мөр бүр НЭГ ТОЙРОГ: дахин илгээх, дахин шалгах бүрд
 * ШИНЭ мөр үүснэ (`hyanaltSubmit.submitForReview`, `hyanaltStore.recheck`).
 * Мөрөөр тоолвол 8 ажил 30 болж, удирдлагын самбар (`ExecKpi`) ба «Гүйцэтгэл»
 * харагдац ижил агшинд ӨӨР тоо харуулна — тэд хоёул `groupWorks()`-ээр
 * тойргуудыг нэг ажил болгож, ЗӨВХӨН сүүлийн тойргийг тоолдог. Тооллын дүрэм
 * НЭГ байх ёстой тул схем ч мөн `hyanaltGroup`-аас гарна.
 */
export function reviewCounts(rows: Record<string, unknown>[]): {
  byStage: Record<Stage, number>;
  /**
   * ⚠️ Шат бүрд БУЦААГДСАН байгаа ажил. «Дэлгэрэнгүй» схем үүнийг шатны
   * хайрцаг дээр ил бичнэ — нийт буцаалтын тоо ГАЦАЛ ХААНА байгааг хэлдэггүй.
   */
  returnedByStage: Record<Stage, number>;
  pending: number;
  returned: number;
  /** ⚠️ «Шилжүүлсэн» = ДУУССАН ажил. Хүлээгдэж буйд тоологдохгүй тул тусад нь. */
  done: number;
} {
  const byStage = { company: 0, engineer: 0, manager: 0, director: 0 } as Record<Stage, number>;
  const returnedByStage = { company: 0, engineer: 0, manager: 0, director: 0 } as Record<Stage, number>;
  let pending = 0;
  let returned = 0;
  let done = 0;
  for (const w of groupWorks(rows.map(toWork))) {
    const st = w.status;
    const owner = OWNER[st];
    if (!owner) continue;
    /* ⚠️ «Шилжүүлсэн» нь ДУУССАН ажил — хүлээгдэж буйд ч, аль ч шатны гар
       дээр ч тоологдохгүй. `OWNER[transferred]` нь `director` тул шүүхгүй
       бол дууссан ажлууд «ерөнхий менежерийн гар дээр» гэж хуримтлагдана. */
    if (st === STATUS.transferred) { done += 1; continue; }
    byStage[owner] += 1;
    pending += 1;
    if (st === STATUS.engineerReturned
      || st === STATUS.managerReturned
      || st === STATUS.directorReturned) {
      returned += 1;
      returnedByStage[owner] += 1;
    }
  }
  return { byStage, returnedByStage, pending, returned, done };
}

/** `hyanalt` зангилааны дотоод дөрвөн цэгийн зурвас — гадуур экспортлоно */
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
 *
 * ⚠️ Багцаар ЗАДАРДАГГҮЙ зангилаа (`tolovlolt`, `gazar`, `ersdel`, `tailan`)
 *    нь багц сонгосон ч төслийн нийт дүнгээ хэвээр үзүүлж, `projectWide`
 *    тэмдэгтэй болно. Багцын нэрийг гарчигт нь хавсаргаад төслийн тоог
 *    үзүүлэх нь ЧИМЭЭГҮЙ ХУДАЛ мэдээлэл болно.
 */
export function buildSchem(src: SchemSources, pkg: string | null = null): SchemLive {
  const bagtsRow = pkg && src.bagts ? src.bagts.find((b) => b.label === pkg || b.key === pkg) : null;

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
  /* ⚠️ Түүхий тэнцэл БИШ — `samePkg` (дээрх бичиглэлийн занга) */
  if (zovList && pkg) zovList = zovList.filter((z) => samePkg(z.bagts, pkg));
  let zovState: SchemState;
  if (!zovList) {
    /* ⚠️ `loadZov()` нь алдаагаа `null`-аар буцаадаг, throw хийдэггүй */
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
      /* ⚠️ Танигдаагүй төлөв ч анхаарал шаарддаг — `zovshoorol.summarize`-ийн
         `alert` дүрэмтэй ИЖИЛ. Хоёр газар өөр дүгнэвэл схем ба харагдац зөрнө. */
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
   * ⚠️ ЭНД АМЬД ТОО ГАРГАХГҮЙ. `coverageOf` нь багц бүрд `loadRows(pkg, schema)`
   * шаарддаг (10 багц × 1,400 мөр) — схем нээх бүрд хүсэлтийн үер болно.
   * Орлуулах тоо зохиох нь худал мэдээлэл тул зангилаа нь холбоос ба
   * тайлбартайгаа үлдэнэ. Хямд нэгтгэл (`loadPlanCoverage`) гарвал энд залгана.
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
  const bPct = bagtsRow ? fin(bagtsRow.progress) : fin(src.overall?.pct);
  const weightSum = fin(src.overall?.weightSum);
  const barilga: SchemState = {
    health: grade(bPct, TH.barilgaPct.good, TH.barilgaPct.warn),
    metrics: [
      { label: tr('Гүйцэтгэл'), value: bPct, kind: 'pct' },
      {
        label: tr('Блок'),
        value: bagtsRow ? null : fin(src.progress?.blocks),
        kind: 'count',
      },
      {
        label: tr('Тайлангүй блок'),
        value: bagtsRow ? bagtsRow.missing : null,
        kind: 'count',
      },
    ],
    /* ⚠️ Энэ тоо ЧИМЭЭГҮЙ хэтрэх гол шалтгаан: бөглөгдөөгүй багц дүнд ороогүй */
    note: !bagtsRow && weightSum != null && weightSum < 100
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
      { label: tr('Зогссон блок'), value: stalled, kind: 'count' },
    ],
  };

  /* ── Санхүүжилт ── */
  const budget = bagtsRow && src.finance
    ? fin(src.finance.byBagts[bagtsRow.key])
    : fin(src.finance?.budget);
  /* ⚠️ Олголт нь БАГЦААР задардаггүй — багц сонгосон үед харьцаа гаргахгүй */
  const paid = bagtsRow ? null : fin(src.finance?.paid);
  const sankhuu: SchemState = {
    health: grade(share(paid, budget), TH.paidPct.good, TH.paidPct.warn),
    metrics: [
      { label: tr('Төсөвт өртөг'), value: budget, kind: 'mnt' },
      {
        label: tr('Олгосон'),
        value: paid,
        kind: 'mnt',
        why: bagtsRow ? tr('Олголт багцаар задардаггүй') : undefined,
      },
      { label: tr('Гэрээний дүн'), value: bagtsRow ? null : fin(src.finance?.contractAmount), kind: 'mnt' },
    ],
  };

  /* ── Тайлан ── */
  const ageD = ageDays(src.progress?.date);
  const tailan: SchemState = {
    projectWide: true,
    /* ⚠️ Нас нь ИХ байх нь МУУ — `grade` урвуу тул гараар */
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

/** «YYYY-MM-DD» → өнөөдрөөс хойших хоног. Танигдахгүй бол `null`. */
export function ageDays(date: string | undefined, now: number = Date.now()): number | null {
  if (!date) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / 86_400_000));
}

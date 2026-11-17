/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН ТЭЗҮ · ЗУРАГ ТӨСЛИЙН ХЭСЭГ — ЖИНХЭНЭ «ЗУРГИЙН БҮРТГЭЛ»-ЭЭР (2026-11-17).
 *
 * Хэрэглэгч: «ТТБ-ийн зургийн хэсгийг жинхэнэ зургийн бүртгэл хэсгээр засна · зургийн бүртгэлд байхгүй юм бол ТТБ-д
 * оруулахгүй». А хувилбар — төрлөөр (эх Excel-ийн бүтэц), баримт бүр ЯГ НЭГ бүлэгт тул хувь давхардахгүй:
 *
 *   1 ТЭЗҮ                    ← бүртгэлийн «001. …» бүлгийн ДЭД БҮЛГҮҮД (100. ТЭЗҮ · 200. Барилгажилтын төсөл)
 *   2 Ажлын зураг төсөл       ← бусад БҮЛЭГ (002 · 003 · 004 · 005) → тэдгээрийн дэд бүлгүүд
 *
 *   · Үе шатын мөрийн ХАДГАЛСАН доод мөрүүд (гэрээ, багцаар гараар хөтөлдөг хуучин задаргаа) модонд ОРОХГҮЙ — хүснэгтээс
 *     устгахгүй. Оронд нь бүртгэлийн бүлэг · дэд бүлэг ЗОХИОМОЛ мөр (`virtual`, `objectid` = null).
 *   · Дэд бүлгийн доор БАРИМТ БҮР нэг мөр (хэрэглэгч: «зургууд нь байхгүй?») — хувь нь өөрийн төлөвийн хувь, жин тэнцүү.
 *   · МӨНГӨ: үе шатын БҮХ баримт «Ажлын үнэ»-тэй (> 0) болмогц баримтын мөрийн төсөвт өртөг = тэр үнэ, дээд мөрүүд
 *     нийлбэрээр, жин мөнгөөр (`computePlan`-ийн ердийн дүрэм). Нэг л баримт үнэгүй байвал хуучнаараа — баримтын тоогоор
 *     жигнэж, үе шатын хуучин нийт дүнг хадгална (дутуу бөглөсөн үед үнэгүй баримт жингүй болж хувь гажихаас сэргийлнэ).
 *   · Зохиомол мөрийн гүйцэтгэл = баримтуудын ТӨЛӨВИЙН хувийн дундаж (`tolovAvg`); жин = баримтын тооны хувь. Мөнгө
 *     ашиглахгүй. Үе шатын хувь = тэр үе шатны бүх баримтын дундаж.
 *   · Үе шатын мөрийн МӨНГӨН ДҮН ба ОГНОО хэвээр: хуучин доод мөрүүдийн нийлбэр / хамгийн эрт эхлэх – хамгийн орой дуусах
 *     нь үе шатын мөрд (санах ойд) бичигдэнэ — төслийн нийт төсөв, үе шатын жин, төлөвлөгөөт хувь өөрчлөгдөхгүй.
 *   · «Ажлын үнэ» бүрэн бөглөгдсөн бол баримтын мөрийн ГЭРЭЭНИЙ ДҮН ч тэр үнэ (нийлбэр нь үе шатын гэрээний дүн).
 *   · ОЛГОСОН ДҮН · УРЬДЧИЛГАА (IPC-ээс бичигддэг) ба бөглөгдөөгүй үеийн ГЭРЭЭНИЙ ДҮН хуучин гэрээний мөрүүд дээр хадгалагддаг. Тэд модноос
 *     хасагдахад төслийн нийт олгосон дүн буурахаас сэргийлж (хэрэглэгч 2026-11-17: «нийт төслийн олгосон дүн буруу бодогдох
 *     эрсдэлтэй») нийлбэрийг нь үе шатын мөрд (санах ойд) шилжүүлнэ — IPC хуучин мөрүүдтэйгээ хэвээр ажиллана.
 *   · Тэр үе шатанд бүртгэлийн баримт нэг ч байхгүй бол үе шат ХӨНДӨГДӨХГҮЙ (бүртгэл уншигдаагүй үед хуучнаараа).
 *
 * Цэвэр — `zuragPlan.check.mjs`.
 */
import { buildTree, moneySums, type PlanNode, type PlanStoredRow } from './projectPlan';
import { bulegLabel, groupZ, subLabel, tolovAvg, tolovPct, type ZRow } from './zuragBurtgel';

/** ТЭЗҮ-ийн бүлэг — эх Excel-ийн «001. ТЭЗҮ, БАРИЛГАЖИЛТЫН ТӨСӨЛ» */
export const isTezuBuleg = (buleg: string): boolean => buleg.trim().startsWith('001');

const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Мөнгөн дүн — өөрийнх › (нийлбэрт орох) хүүхдүүдийн нийлбэр (`computePlan`-ийн E-тэй ижил дүрэм) */
function budgetOf(n: PlanNode): number | null {
  const own = fin(n.row?.ho_dun_geree);
  if (own != null) return own;
  let s = 0, any = false;
  for (const c of n.children) {
    if (c.outside) continue;
    const v = budgetOf(c);
    if (v != null) { s += v; any = true; }
  }
  return any ? s : null;
}

/** Үр удмын (өөрийг оролцуулан) хамгийн эрт эхлэх / хамгийн орой дуусах */
function spanOf(n: PlanNode, a: 'guits' | 'gazar'): [number | null, number | null] {
  let lo: number | null = null, hi: number | null = null;
  const walk = (x: PlanNode) => {
    const s = fin(x.row?.[`${a}_ehleh`]), e = fin(x.row?.[`${a}_duusah`]);
    if (s != null) lo = lo == null ? s : Math.min(lo, s);
    if (e != null) hi = hi == null ? e : Math.max(hi, e);
    x.children.forEach(walk);
  };
  walk(n);
  return [lo, hi];
}

const virt = (code: string, parent: string, name: string, w: number, docs: readonly ZRow[], leaf: boolean): PlanStoredRow => ({
  objectid: null,
  virtual: true,
  dd_kod: code,
  etseg_kod: parent,
  ajil_uilchilgee: name,
  heseg_ezleh_huvi: w,
  ...(leaf ? { guitsetgel_huvi: tolovAvg(docs) } : {}),
});

/**
 * ТТБ-ийн мөрүүд + бүртгэл → модонд орох мөрүүд. Бүртгэл хоосон бол оролт хэвээр.
 */
export function withRegistryRows(rows: readonly PlanStoredRow[], z: readonly ZRow[]): PlanStoredRow[] {
  if (!z.length) return [...rows];
  const tezu = z.filter((r) => isTezuBuleg(r.buleg));
  const zurag = z.filter((r) => !isTezuBuleg(r.buleg));
  const tree = buildTree(rows);
  const money = moneySums(tree);
  const drop = new Set<PlanStoredRow>();
  const swap = new Map<PlanStoredRow, PlanStoredRow>();
  const add: PlanStoredRow[] = [];
  const dropAll = (x: PlanNode) => { for (const c of x.children) { if (c.row) drop.add(c.row); dropAll(c); } };
  for (const n of tree.root.children) {
    const docs = n.phase === 'tezu' ? tezu : n.phase === 'zurag' ? zurag : [];
    if (!docs.length || !n.row) continue;
    const priced = docs.every((d) => d.ajliinUne != null && d.ajliinUne > 0);
    const [gs, ge] = spanOf(n, 'guits');
    const [ls, le] = spanOf(n, 'gazar');
    const ms = money.get(n);
    swap.set(n.row, {
      ...n.row,
      olgoson_dun: ms?.paid ?? null,
      urdchilgaa_dun: ms?.advance ?? null,
      /* Гэрээний дүн: бүртгэлд «Ажлын үнэ» бүрэн бөглөгдсөн бол баримтуудаас (доор), эс бөгөөс хуучин мөрүүдийн нийлбэр */
      ...(!priced && ms?.contract != null ? { geree_dun: ms.contract, ho_dungiin_tailbar: 'Гэрээлсэн дүн' } : {}),
      ho_dun_geree: priced ? null : budgetOf(n),
      guits_ehleh: gs, guits_duusah: ge, geree_ehleh: gs, geree_duusah: ge, gazar_ehleh: ls, gazar_duusah: le,
    });
    dropAll(n);
    const groups = groupZ(docs);
    /* ТЭЗҮ — ганц бүлэг («001»): бүлгийн давхаргыг алгасаж дэд бүлгүүд шууд үе шатын доор */
    const flat = n.phase === 'tezu' && groups.length === 1 && groups[0].subs.some((s) => s.ded);
    /* Баримт бүр — навч мөр: нэр, өөрийн төлөвийн хувь, тэнцүү жин */
    const leaves = (parent: string, ds: readonly ZRow[]) => {
      ds.forEach((d, k) => add.push({
        objectid: null, virtual: true, dd_kod: `${parent}.${k + 1}`, etseg_kod: parent,
        ajil_uilchilgee: d.ner, bagts: d.bagts || null, heseg_ezleh_huvi: 1 / ds.length, guitsetgel_huvi: tolovPct(d.tolov),
        /* Хэрэглэгч 2026-11-17: гараар оруулсан дүн «урьдчилсан төсөвт өртөг болон IPC рүү хоёуланд нь» — төсөвт өртөг ба
           гэрээний дүн (IPC-ийн олгосон хувийн суурь). Олгосон дүн нь IPC-ээс хэвээр (үе шатын мөрд) */
        ...(priced ? { ho_dun_geree: d.ajliinUne, geree_dun: d.ajliinUne, ho_dungiin_tailbar: 'Гэрээлсэн дүн' } : {}),
      }));
    };
    const put = (parent: string, subs: { ded: string; rows: ZRow[] }[], total: number, fallback: string) => {
      subs.forEach((s, j) => {
        const sc = `${parent}.${j + 1}`;
        add.push(virt(sc, parent, subLabel(s, j) || fallback, s.rows.length / total, s.rows, false));
        leaves(sc, s.rows);
      });
    };
    if (flat) { put(n.code, groups[0].subs, docs.length, groups[0].buleg); continue; }
    groups.forEach((g, i) => {
      const gd = g.subs.flatMap((s) => s.rows);
      const gc = `${n.code}.${i + 1}`;
      const named = g.subs.some((s) => s.ded);
      const gl = bulegLabel(g.buleg, i);
      add.push(virt(gc, n.code, gl, gd.length / docs.length, gd, false));
      if (named) put(gc, g.subs, gd.length, gl); else leaves(gc, gd);
    });
  }
  if (!add.length) return [...rows];
  return [...rows.filter((r) => !drop.has(r)).map((r) => swap.get(r) ?? r), ...add];
}

/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН ТЭЗҮ · ЗУРАГ ТӨСЛИЙН ХЭСЭГ — ЖИНХЭНЭ «ЗУРГИЙН БҮРТГЭЛ»-ЭЭР (2026-11-17).
 *
 * Хэрэглэгч: «ТТБ-ийн зургийн хэсгийг жинхэнэ зургийн бүртгэл хэсгээр засна · зургийн бүртгэлд байхгүй юм бол ТТБ-д
 * оруулахгүй». А хувилбар — төрлөөр (эх Excel-ийн бүтэц), баримт бүр ЯГ НЭГ бүлэгт тул хувь давхардахгүй:
 *
 *   1 ТЭЗҮ                    ← бүртгэлийн «001. …» бүлгийн ДЭД БҮЛГҮҮД (100. ТЭЗҮ · 200. Барилгажилтын төсөл)
 *   2 Ажлын зураг төсөл       ← бусад БҮЛЭГ (002 · 003 · 004 · 005) → тэдгээрийн дэд бүлгүүд
 *
 *   · Үе шатын доод мөрүүд = бүртгэлээс ҮҮСГЭСЭН мөрүүд (`registry`). Хүснэгтэд ижил Д/Д-тэй мөр байвал түүний
 *     `objectid`-ийг авна; байхгүй бол ЗОХИОМОЛ (`virtual`, `objectid` = null). Хүснэгтэд бичих — `registryPlanEdits`
 *     (хэрэглэгч 2026-11-17: «хуучнуудыг устгаад шинийг оруул · бүртгэлд байхгүй утгыг хоосон үлдээ»).
 *   · Дэд бүлгийн доор БАРИМТ БҮР нэг мөр (хэрэглэгч: «зургууд нь байхгүй?») — хувь нь өөрийн төлөвийн хувь, жин тэнцүү.
 *   · МӨНГӨ (2026-11-18): үе шатанд «Ажлын үнэ»-тэй (> 0) баримт НЭГ Ч байвал үнэтэй баримтын мөрийн төсөвт өртөг = тэр
 *     үнэ, дээд мөрүүд нийлбэрээр, жин мөнгөөр (`computePlan`-ийн ердийн дүрэм); үнэгүй баримт төсөвгүй (жин 0) — бусдын
 *     төсөв хөндөгдөхгүй. Нэг ч баримт үнэгүй үед хуучнаараа — баримтын тоогоор жигнэж, үе шатын хуучин нийт дүнг хадгална.
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
function spanOf(n: PlanNode, a: 'guits'): [number | null, number | null] {
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
  registry: true,
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
  return build(rows, z).out;
}

/** Модонд орох мөрүүд (`out`), бүртгэлээс үүсгэсэн мөрүүд (`gen`), тэдгээрийн үе шатын хадгалсан доод мөрүүд (`old`) */
function build(rows: readonly PlanStoredRow[], z: readonly ZRow[]): { out: PlanStoredRow[]; gen: PlanStoredRow[]; old: PlanStoredRow[] } {
  const same = { out: [...rows], gen: [], old: [] };
  if (!z.length) return same;
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
    /* 2026-11-18 (хэрэглэгч: «1-ийг зас»): урьд нь БҮХ баримт үнэтэй үед л мөнгө ордог байсан — үнэгүй ганц баримт нэмэхэд
       үе шатын бүх баримтын төсөв хүснэгтээс арилж нийт төсөв буурдаг байв. Одоо НЭГ Ч баримт үнэтэй бол үнэтэй нь
       өөрийн үнээр, үнэгүй нь төсөвгүй (жин 0) — бусдынх хөндөгдөхгүй. Нэг ч үнэгүй үед л хуучин горим. */
    const priceOf = (d: ZRow): number | null => (d.ajliinUne != null && d.ajliinUne > 0 ? d.ajliinUne : null);
    const priced = docs.some((d) => priceOf(d) != null);
    const [gs, ge] = spanOf(n, 'guits');
    const ms = money.get(n);
    swap.set(n.row, {
      ...n.row,
      olgoson_dun: ms?.paid ?? null,
      urdchilgaa_dun: ms?.advance ?? null,
      /* Гэрээний дүн: бүртгэлд «Ажлын үнэ»-тэй баримт байвал баримтуудаас (доор), эс бөгөөс хуучин мөрүүдийн нийлбэр */
      ...(!priced && ms?.contract != null ? { geree_dun: ms.contract, ho_dungiin_tailbar: 'Гэрээлсэн дүн' } : {}),
      ho_dun_geree: priced ? null : budgetOf(n),
      guits_ehleh: gs, guits_duusah: ge, geree_ehleh: gs, geree_duusah: ge,
    });
    dropAll(n);
    const groups = groupZ(docs);
    /* ТЭЗҮ — ганц бүлэг («001»): бүлгийн давхаргыг алгасаж дэд бүлгүүд шууд үе шатын доор */
    const flat = n.phase === 'tezu' && groups.length === 1 && groups[0].subs.some((s) => s.ded);
    /* Баримт бүр — навч мөр: нэр, өөрийн төлөвийн хувь, тэнцүү жин */
    const leaves = (parent: string, ds: readonly ZRow[]) => {
      ds.forEach((d, k) => add.push({
        objectid: null, registry: true, dd_kod: `${parent}.${k + 1}`, etseg_kod: parent,
        ajil_uilchilgee: d.ner, bagts: d.bagts || null, heseg_ezleh_huvi: 1 / ds.length, guitsetgel_huvi: tolovPct(d.tolov),
        /* Хэрэглэгч 2026-11-17: гараар оруулсан дүн «урьдчилсан төсөвт өртөг болон IPC рүү хоёуланд нь» — төсөвт өртөг ба
           гэрээний дүн (IPC-ийн олгосон хувийн суурь). Олгосон дүн нь IPC-ээс хэвээр (үе шатын мөрд) */
        ...(priceOf(d) != null ? { ho_dun_geree: priceOf(d), geree_dun: priceOf(d), ho_dungiin_tailbar: 'Гэрээлсэн дүн' } : {}),
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
  if (!add.length) return same;
  /* Хүснэгтэд ижил Д/Д-тэй мөр байвал түүний objectid (эхнийх нь); байхгүй бол зохиомол */
  const oid = new Map<string, number>();
  for (const r of drop) if (r.dd_kod && typeof r.objectid === 'number' && !oid.has(r.dd_kod)) oid.set(r.dd_kod, r.objectid);
  const gen = add.map((r): PlanStoredRow => {
    const o = oid.get(r.dd_kod ?? '');
    return o == null ? { ...r, virtual: true } : { ...r, objectid: o };
  });
  return { out: [...rows.filter((r) => !drop.has(r)).map((r) => swap.get(r) ?? r), ...gen], gen, old: [...drop] };
}

/** Хүснэгтэд бичигддэг талбарууд — бүртгэлээс гардаг нь л; бусад нь хоосон */
export const REGISTRY_PLAN_KEYS = ['ajil_uilchilgee', 'bagts', 'heseg_ezleh_huvi', 'guitsetgel_huvi', 'ho_dun_geree', 'geree_dun', 'ho_dungiin_tailbar'] as const;
type RKey = (typeof REGISTRY_PLAN_KEYS)[number];
export type RegistryPlanEdits = {
  adds: ({ dd_kod: string } & Record<RKey, string | number | null>)[];
  updates: ({ objectid: number } & Partial<Record<RKey, string | number | null>>)[];
  deletes: number[];
};

const eq = (a: unknown, b: unknown): boolean => {
  const x = a ?? null, y = b ?? null;
  /* Хүснэгт жинг 8 оронгоор хадгална (0.33333333) — түүнээс нарийн зөрүү зөрүү биш */
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) <= 1e-7 * Math.max(1, Math.abs(x), Math.abs(y));
  return x === y;
};

/**
 * ТТБ-ийн хүснэгтийг бүртгэлтэй ТААРУУЛАХ засвар — Д/Д-ээр тулгана: байхгүйг нэмнэ, зөрснийг засна, бүртгэлд байхгүйг
 * (ба Д/Д давхардсаныг) устгана. Бүртгэлээс гардаггүй утгатай мөр (гэрээ, захирамж, мөнгө — `foreign`) нь бүртгэлийн мөр
 * биш тул засахгүй — устгаад цэвэр мөр нэмнэ. Бүртгэл хоосон / уншигдаагүй бол засваргүй (юу ч устгахгүй).
 */
export function registryPlanEdits(rows: readonly PlanStoredRow[], z: readonly ZRow[]): RegistryPlanEdits {
  const { gen, old } = build(rows, z);
  const out: RegistryPlanEdits = { adds: [], updates: [], deletes: [] };
  const foreign = (r: PlanStoredRow) => r.cashflow_id != null || r.geree_dugaar != null || r.guitsetgegch != null || r.olgoson_dun != null
    || r.urdchilgaa_dun != null || r.ho_dun_zahiramj != null || r.zahiramj_dugaar != null || r.guits_ehleh != null || r.guits_duusah != null;
  const byOid = new Map<number, PlanStoredRow>();
  for (const r of old) if (typeof r.objectid === 'number') byOid.set(r.objectid, r);
  const kept = new Set<number>();
  /* 2026-11-18: БҮЛГИЙН мөрийн хадгалах хувь = доод баримтуудын төлөвийн хувийн дундаж (урьд нь хоосолдог байсан тул
     гүйцэтгэл хадгалагч буцааж бичиж, хоёр бичилт ээлжилдэг байв). Модны бодолтод оролцохгүй — бүлгийн хувь хүүхдээс. */
  const leafPct = gen.filter((x) => typeof x.guitsetgel_huvi === 'number').map((x) => [String(x.dd_kod), x.guitsetgel_huvi as number] as const);
  const groupPct = (code: string): number | null => {
    let s = 0, n = 0;
    for (const [c, v] of leafPct) if (c.startsWith(`${code}.`)) { s += v; n += 1; }
    return n ? Math.round((s / n) * 1e6) / 1e6 : null;
  };
  for (const g of gen) {
    const want = Object.fromEntries(REGISTRY_PLAN_KEYS.map((k) => [k, (g[k] as string | number | null | undefined) ?? null])) as Record<RKey, string | number | null>;
    if (g.guitsetgel_huvi === undefined) want.guitsetgel_huvi = groupPct(String(g.dd_kod));
    const s = typeof g.objectid === 'number' ? byOid.get(g.objectid) : undefined;
    if (!s || foreign(s)) { out.adds.push({ dd_kod: g.dd_kod as string, ...want }); continue; }
    kept.add(g.objectid as number);
    const diff = REGISTRY_PLAN_KEYS.filter((k) => !eq(s[k], want[k]));
    if (diff.length) out.updates.push({ objectid: g.objectid as number, ...Object.fromEntries(diff.map((k) => [k, want[k]])) });
  }
  for (const o of byOid.keys()) if (!kept.has(o)) out.deletes.push(o);
  return out;
}

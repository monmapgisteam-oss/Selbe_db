/**
 * МАТЕРИАЛ БАТЛАГДААГҮЙ ХИЙГДСЭН АЖИЛ (2026-11-18, хэрэглэгч).
 *
 * Хэрэглэгчийн шийдвэр: «Гүйцэтгэл» бөглөх хуудсанд материалын түгжээ, тэмдэг БАЙХГҮЙ — ажиллагаа хэвийн явна. Оронд нь
 * «Багцын гүйцэтгэл» хуудсанд материал нь батлагдаагүй атлаа гүйцэтгэл бөглөгдсөн ажлыг багцаар харуулна.
 *
 * Дүрэм:
 *   · Ажилд (`багц:des`) холбогдсон материал баталгаажуулалтын (MA) ХҮЧИНТЭЙ хүсэлтүүдийн аль нэг нь батлагдаагүй
 *     (буцаасан R · шийдвэр хүлээж буй) БА тэр ажилд гүйцэтгэл бөглөгдсөн (> 0) бол жагсаалтад орно.
 *   · ХҮЧИНТЭЙ = хариу бичгийн дугаар бүрийн сүүлийн илгээлт (`latestPerRespNo`), үүнээс ШИНЭ дугаараар дахин ирүүлж
 *     солигдсон буцаалтыг (`resubmitLinks`) хасна — хуучин буцаалт ажлыг үүрд «батлагдаагүй» болгодог байсан алдааг арилгана.
 *   · MA-гүй ажил орохгүй.
 *   · «Нэгж хувь» = тэр ажлын багцын гүйцэтгэлд оруулж буй хувь нэмэр: Σ_блок жин_блок × ажлын «Б.» мөрд эзлэх жин ×
 *     ажлын гүйцэтгэл ÷ багцын бүх блокийн жин (`pkgProgressOf`-ийн жигнэлттэй ижил). Ажлын жин — бөглөх хуудасны
 *     нэгтгэлийн дүрмээр (`computeAll`: бүлэг = Σ D·гүйцэтгэл ÷ Σ D) «Б.» мөрөөс доош үржүүлж гаргана (`rootShares`).
 */
import { effectiveMas, isApproved, type MaRow } from './ma';

export { effectiveMas };

/** Ажил (`багц:des`) → батлагдаагүй хүчинтэй MA-ууд */
export function openMasByWork(rows: readonly MaRow[]): Map<string, MaRow[]> {
  const out = new Map<string, MaRow[]>();
  for (const r of effectiveMas(rows)) {
    if (isApproved(r.verdict)) continue;
    for (const w of r.works) {
      const l = out.get(w);
      if (l) l.push(r); else out.set(w, [r]);
    }
  }
  return out;
}

/**
 * Мөр бүрийн «үндэс» (`root`) мөрд эзлэх жин (0–1) — `computeAll`-ийн нэгтгэлтэй ижил: бүлгийн утга = Σ D_хүүхэд ·
 * утга ÷ Σ D_хүүхэд (D бүгд 0 бол тэнцүү). Үндсээс гадуурх мөр 0. Цэвэр.
 */
export function rootShares(kids: readonly (readonly number[])[], D: readonly (number | null)[], root: number): number[] {
  const out = new Array<number>(kids.length).fill(0);
  if (root < 0 || root >= kids.length) return out;
  out[root] = 1;
  const walk = (i: number) => {
    const ks = kids[i];
    if (!ks.length) return;
    const den = ks.reduce((s, k) => s + (D[k] ?? 0), 0);
    for (const k of ks) { out[k] = out[i] * (den > 0 ? (D[k] ?? 0) / den : 1 / ks.length); walk(k); }
  };
  walk(root);
  return out;
}

/** Бөглөх хуудасны нэг ажлын гүйцэтгэл (ачаалагчаас) */
export type DoneWork = {
  /** Хуудасны түлхүүр (`Pkg.key`) — MA-гийн ажлын түлхүүрийн эхний хэсэг */
  pkgKey: string;
  /** Багцын нэр (`Pkg.group`) — нэгтгэх түлхүүр */
  group: string;
  des: number;
  name: string;
  /** Хийгдсэн (хуримтлагдсан) обьём; обьёмгүй (хувиар хэмжсэн) бол null */
  done: number | null;
  /** Нийт обьём (блокуудын нийлбэр); мэдэгдэхгүй бол null */
  total: number | null;
  /** Ажлын гүйцэтгэл 0–100 (блокуудын дундаж) */
  pct: number | null;
  /** Багцын гүйцэтгэлд оруулж буй хувь нэмэр, нэгж хувь (0–100-ийн хуваарьт) */
  pp: number;
};

export type UnState = 'rejected' | 'pending';
export type UnWork = DoneWork & {
  state: UnState;
  /** Батлагдаагүй хүсэлтүүд — буцаасан нь эхэнд */
  mas: { oid: number; respNo: string; material: string; state: UnState }[];
};
export type UnPkg = { group: string; works: UnWork[]; rejected: number; pending: number; pp: number };
export type Unapproved = { pkgs: UnPkg[]; works: number; rejected: number; pending: number; pp: number };

const stateOf = (r: MaRow): UnState => (r.verdict === 'R' ? 'rejected' : 'pending');

/** Цэвэр нэгтгэл — гүйцэтгэл бөглөгдсөн (`done`/`pct` > 0) ажлуудаас батлагдаагүй MA-тайг багцаар */
export function unapprovedOf(works: readonly DoneWork[], mas: readonly MaRow[]): Unapproved {
  const open = openMasByWork(mas);
  const by = new Map<string, UnPkg>();
  for (const w of works) {
    const started = (w.done != null && w.done > 0) || (w.pct != null && w.pct > 0);
    if (!started) continue;
    const ms = open.get(`${w.pkgKey}:${w.des}`);
    if (!ms?.length) continue;
    const list = ms.map((m) => ({ oid: m.oid, respNo: m.respNo, material: m.material, state: stateOf(m) }))
      .sort((a, b) => Number(b.state === 'rejected') - Number(a.state === 'rejected') || b.oid - a.oid);
    const state: UnState = list.some((m) => m.state === 'rejected') ? 'rejected' : 'pending';
    const p = by.get(w.group) ?? { group: w.group, works: [], rejected: 0, pending: 0, pp: 0 };
    p.works.push({ ...w, state, mas: list });
    if (state === 'rejected') p.rejected += 1; else p.pending += 1;
    p.pp += w.pp;
    by.set(w.group, p);
  }
  const pkgs = [...by.values()].sort((a, b) => b.works.length - a.works.length || b.pp - a.pp || a.group.localeCompare(b.group, 'mn', { numeric: true }));
  for (const p of pkgs) p.works.sort((a, b) => Number(b.state === 'rejected') - Number(a.state === 'rejected') || b.pp - a.pp || a.des - b.des);
  return {
    pkgs,
    works: pkgs.reduce((a, p) => a + p.works.length, 0),
    rejected: pkgs.reduce((a, p) => a + p.rejected, 0),
    pending: pkgs.reduce((a, p) => a + p.pending, 0),
    pp: pkgs.reduce((a, p) => a + p.pp, 0),
  };
}

/**
 * Ачаалагч — батлагдаагүй MA-тай ажлуудын хуудсыг л уншина (MA-гүй багцын хуудас уншихгүй). `failed` = уншигдаагүй
 * хуудсууд (тэдгээрийн ажил жагсаалтад дутуу). MA үйлчилгээ унавал шидэнэ (дуудагч «уншигдсангүй» гэж харуулна).
 */
export async function loadUnapproved(): Promise<Unapproved & { failed: string[] }> {
  const [{ loadMa }, { PKGS, fillSchema }, { computeAll, loadRows, childIndexes }, BP, { bagtsKey, buildingKey, isConstructionNo, normalizeTaskNo }] = await Promise.all([
    import('./ma'), import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/bagtsSheet'), import('./blockProgress'), import('./services'),
  ]);
  const mas = await loadMa();
  const open = openMasByWork(mas);
  const need = new Set([...open.keys()].map((k) => k.slice(0, k.lastIndexOf(':'))));
  const sheets = PKGS.filter((p) => need.has(p.key));
  if (!sheets.length) return { ...unapprovedOf([], mas), failed: [] };
  const [uni, weights] = await Promise.all([BP.loadBlockUniverse().catch(() => null), BP.loadBlockWeights().catch(() => null)]);
  const failed: string[] = [];
  const got = await Promise.all(sheets.map(async (pkg): Promise<DoneWork[]> => {
    try {
      const sc = await fillSchema(pkg);
      const r = await loadRows(pkg, sc, undefined, undefined, { persist: true });
      const calc = computeAll(r.rows, sc.bld.length, r.asOf, {}, {}, sc.obyem.map((f) => !!f), undefined, 'abs', sc.synthetic);
      /* багцын бүх блок (хуваарь ∪ энэ хуудасны блок) ба тэдгээрийн жин — `pkgProgressOf`-тэй ижил */
      const pk = bagtsKey(pkg.group);
      const keys = new Set<string>(uni?.get(pk) ?? []);
      const mine = sc.bld.map((b) => buildingKey(pkg.group, b));
      for (const k of mine) keys.add(k);
      const wOf = BP.weightOf([...keys], weights);
      let wAll = 0;
      for (const k of keys) wAll += wOf(k);
      /* ажлын жин — барилга угсралтын («Б.») мөрд эзлэх; блокгүй хуудсанд эхний мөр */
      const rootAt = r.rows.findIndex((x) => isConstructionNo(normalizeTaskNo(x.no)));
      const share = rootShares(childIndexes(r.rows), calc.map((c) => c?.D ?? null), rootAt >= 0 ? rootAt : 0);
      const out: DoneWork[] = [];
      r.rows.forEach((row, i) => {
        if (row.group || row.des == null || !open.has(`${pkg.key}:${row.des}`)) return;
        const c = calc[i];
        const acts = (c?.actAgg ?? []).map((v) => (v != null && Number.isFinite(v) ? v : 0));
        const e = share[i] ?? 0;
        let pp = 0;
        if (wAll > 0 && sc.bld.length) acts.forEach((a, b) => { pp += wOf(mine[b]) * e * a; });
        const done = c?.obyemSum ?? row.obyem.reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
        const nB = Math.max(1, sc.bld.length);
        out.push({
          pkgKey: pkg.key, group: pkg.group, des: row.des,
          name: `${row.no ? `${row.no} · ` : ''}${row.work || ''}`.trim(),
          done, total: row.vol != null ? row.vol * (sc.synthetic ? 1 : nB) : null,
          pct: acts.length ? (acts.reduce((a, b) => a + b, 0) / acts.length) * 100 : null,
          pp: wAll > 0 ? (pp / wAll) * 100 : 0,
        });
      });
      return out;
    } catch (e) {
      console.warn('[selbe] материал батлагдаагүй ажил: хуудас уншигдсангүй', pkg.key, e);
      failed.push(pkg.key);
      return [];
    }
  }));
  return { ...unapprovedOf(got.flat(), mas), failed };
}

/**
 * «ТӨЛБӨРИЙН АКТ»-ЫН «ЗУРАГ» БҮЛГИЙН ДОТООД БҮЛЭГЛЭЛТ (2026-11-17, хэрэглэгч: «зураг дотроо бүлэглэхгүй юм уу») —
 * зургийн гэрээний мөр бүрийг Зургийн бүртгэлийн БҮЛЭГ → ДЭД БҮЛЭГТ нь оноо. Төлбөрийн актын мөрд бүртгэлийн дугаар
 * хадгалагддаггүй тул баримтын НЭР (ба ижил нэртэй бол БАГЦ)-аар тулгана; олдоогүй эсвэл хоёр өөр бүлэгт таарвал «Бусад».
 * Цэвэр — `ipcZurag.check.mjs`.
 */
import { bulegLabel, groupZ, subLabel, type ZRow } from './zuragBurtgel';

const nk = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
/** Багцын түлхүүр — «Багц-3.1» · «БАГЦ 3-1» · «3.1» нэг */
const pk = (v: unknown): string => nk(v).replace(/багц/g, '').replace(/[\s.\-–]/g, '');

export type ZGroupTree<T> = { key: string; label: string; items: T[]; subs: { key: string; label: string; items: T[] }[] }[];

/**
 * `items` → бүртгэлийн бүлэг · дэд бүлгээр (бүртгэлийн дараалал, нэр нь бүртгэлийн хуудастай ижил дугаарлалтаар).
 * `items` нь бүлэгт шууд (дэд бүлэг нэргүй / тодорхойгүй үед) эсвэл дэд бүлэгт орно. Төгсгөлд `rest` — оноогдоогүй.
 */
export function groupByRegistry<T>(items: readonly T[], z: readonly ZRow[], nameOf: (x: T) => string, pkgOf: (x: T) => string): { tree: ZGroupTree<T>; rest: T[] } {
  const groups = groupZ(z);
  const where = new Map<number, [number, number]>();
  groups.forEach((g, i) => g.subs.forEach((s, j) => s.rows.forEach((r) => where.set(r.oid, [i, j]))));
  const byName = new Map<string, ZRow[]>();
  for (const r of z) { const k = nk(r.ner); if (k) byName.set(k, [...(byName.get(k) ?? []), r]); }
  const tree: ZGroupTree<T> = groups.map((g, i) => ({
    key: `g${i}`, label: bulegLabel(g.buleg, i), items: [],
    subs: g.subs.map((s, j) => ({ key: `g${i}s${j}`, label: s.ded ? subLabel(s, j) : '', items: [] })),
  }));
  const rest: T[] = [];
  for (const x of items) {
    let c = byName.get(nk(nameOf(x))) ?? [];
    if (c.length > 1) { const p = pk(pkgOf(x)); const f = c.filter((r) => pk(r.bagts) === p); if (f.length) c = f; }
    const at = c.map((r) => where.get(r.oid)).filter((v): v is [number, number] => !!v);
    if (!at.length || at.some((v) => v[0] !== at[0][0])) { rest.push(x); continue; }
    const g = tree[at[0][0]];
    const sub = at.every((v) => v[1] === at[0][1]) ? g.subs[at[0][1]] : null;
    if (sub && sub.label) sub.items.push(x); else g.items.push(x);
  }
  return {
    tree: tree.map((g) => ({ ...g, subs: g.subs.filter((s) => s.items.length) })).filter((g) => g.items.length || g.subs.length),
    rest,
  };
}

/**
 * БӨГЛӨХ ХУУДАСНЫ МӨРИЙН ХУВААЛЦСАН УНШИЛТ — CEO самбарын уншигчид (обьёмын зөрүү · QAQC-ийн мод · оноон самбар).
 */
import { fillSchema, PKGS, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { register } from './dataBus';
import { SESSION_TTL_MS, cached } from './live';
import { bagtsKey } from './services';
import { constructionObyem, sumObyemParts, uniqueBlockCounts, type ObyemPair } from './blockProgress';

/** Уншилтын төрөл — `'tree'` (QAQC-ийн мод: 4 багана) ⊂ `'variance'` (зөрүү: + обьём · нэгж · огноо · блокийн обьём) */
export type SheetKind = 'tree' | 'variance';
const RANK: Record<SheetKind, number> = { tree: 0, variance: 1 };

/**
 * Төрөл бүрийн баганууд (цэвэр функц — `sheetShared.check` тулгана):
 *   · `tree` (`ceo/qaqc.loadTreeRows`): `oid` (эрэмбэ) · `no` (жаазны заагч) · `work` (зэрэгцүүлэлт) · `gun` (гүн);
 *   · `variance` (`execTriage.loadVariance`, 2026-08-21): дээрх + `vol` · `unit` · `asOf` · `fillDate` · `obyem[]`.
 */
export const sharedFields = (sc: Schema, kind: SheetKind): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun,
  ...(kind === 'variance' ? [sc.f.vol, sc.f.unit, sc.f.asOf, sc.f.fillDate, ...sc.obyem] : []),
].filter((x): x is string => !!x))];

/** Явж буй/дууссан уншилтын төрөл ба битүүмжлэл (`loadRows` руу орсон эсэх) */
export type Pending = { kind: SheetKind; sealed: boolean };

/**
 * Кэшийн шийдвэр (цэвэр): `reuse` — байгаа уншилт хүрэлцэнэ; `upgrade` — хараахан яваагүй уншилтын төрлийг өргөжүүлж
 * хуваалцана; `new` — шинэ татлага.
 */
export const decide = (hit: Pending | null, kind: SheetKind): 'reuse' | 'upgrade' | 'new' => {
  if (!hit) return 'new';
  if (RANK[hit.kind] >= RANK[kind]) return 'reuse';
  return hit.sealed ? 'new' : 'upgrade';
};

export type SharedSheet = { sc: Schema; rows: SheetRow[] };

type Entry = { p: Promise<SharedSheet>; at: number; want: Pending };
const sheetCache = new Map<string, Entry>();
register(() => { sheetCache.clear(); }, ['BAGTS_SHEET']);

/** Багцын сүүлийн жааз — сешнд нэг уншилт (`pkg.key`-ээр). Шиднэ (уншигч өөрөө `allSettled`/`catch`-аар шийднэ). */
export function loadSheetShared(pkg: Pkg, kind: SheetKind): Promise<SharedSheet> {
  const hit = sheetCache.get(pkg.key);
  const live = hit && Date.now() - hit.at <= SESSION_TTL_MS ? hit : null;
  const d = decide(live?.want ?? null, kind);
  if (live && d === 'reuse') return live.p;
  if (live && d === 'upgrade') { live.want.kind = kind; return live.p; }
  const want: Pending = { kind, sealed: false };
  const p = (async (): Promise<SharedSheet> => {
    const sc = await fillSchema(pkg);
    await Promise.resolve();
    want.sealed = true;
    const { rows } = await loadRows(pkg, sc, undefined, sharedFields(sc, want.kind), { persist: true });
    return { sc, rows };
  })();
  const entry: Entry = { p, at: Date.now(), want };
  sheetCache.set(pkg.key, entry);
  p.catch(() => { if (sheetCache.get(pkg.key) === entry) sheetCache.delete(pkg.key); });
  return p;
}

/** Багцын АМЬД обьём — `null` = багцын аль нэг хуудас уншигдсангүй (дуудагч нэгтгэлийн `/190` руу буцна) */
export type PkgObyem = { key: string; label: string } & ObyemPair;

/**
 * БАГЦ БҮРИЙН ОБЬЁМ — бөглөх хуудасны СҮҮЛИЙН жаазны навч мөрүүдээс (`blockProgress.constructionObyem` · `sumObyemParts`).
 */
export const loadPkgObyem = cached<Map<string, PkgObyem | null>>(async () => {
  const groups = new Map<string, { label: string; pkgs: Pkg[] }>();
  for (const p of PKGS) {
    const k = bagtsKey(p.group);
    const g = groups.get(k) ?? { label: p.group, pkgs: [] };
    g.pkgs.push(p);
    groups.set(k, g);
  }
  const out = new Map<string, PkgObyem | null>();
  await Promise.all([...groups].map(async ([key, g]) => {
    try {
      const sheets = (await Promise.all(g.pkgs.map((p) => loadSheetShared(p, 'variance'))))
        .filter((s) => !!s.sc.f.fillDate);
      if (!sheets.length) { out.set(key, { key, label: g.label, volume: null, volumePlan: null }); return; }
      const w = uniqueBlockCounts(sheets.map((s) => s.sc.bld));
      const sum = sumObyemParts(sheets.map((s, i) => ({ n: w[i], ...constructionObyem(s.rows, s.sc.obyem) })));
      out.set(key, { key, label: g.label, ...sum });
    } catch (e) {
      console.warn(`[selbe] багцын обьём: ${g.label} — бөглөх хуудас уншигдсангүй`, e);
      out.set(key, null);
    }
  }));
  return out;
}, SESSION_TTL_MS, ['BAGTS_SHEET'], (m) => ![...m.values()].some((v) => v == null));

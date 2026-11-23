/**
 * ХОЖУУ ЖААЗНУУДЫН ХАДГАЛСАН ХУВИЙГ ШИНЭЧЛЭХ (2026-11-11, хэрэглэгч: «анх бөглөснөөр бичих нь зөв»).
 *
 * Буцаагдаад хожим батлагдсан бөглөлт одоо БӨГЛӨСӨН өдрөөрөө архивлагдана (`hyanaltStore.archiveSubmission`). Тэр жаазны
 * дараах огноотой жаазнууд аль хэдийн байгаа тул тэдгээрийн мөрд хадгалсан ХУРИМТЛАГДСАН гүйцэтгэлийн хувь (блок бүрийн
 * `…_гүйцэтгэл`, мөрийн `гүйцэтгэл`, «одоо байгаа») шинэ ажлыг агуулаагүй үлдэнэ — газрын зураг, явцын тооцоо хамгийн сүүлийн
 * огнооны хадгалсан хувийг уншдаг (`blockProgress.winnerCells`). Энд `fromDay`-ээс ХОЙШХИ жааз бүрт дахин бодож, зөрсөн
 * хувийг бичнэ. Обьём, огноо, төлөвлөгөөт хувийг хөндөхгүй.
 *
 * ХҮРЭЭ (2026-11-11, амьд туршилт): ЗӨВХӨН `fromDay`-ийн жаазанд обьём бичигдсэн мөр (ажлын кодоор) ба тэдгээрийн ӨВӨГ
 * бүлгүүд. Жаазыг бүхэлд нь дахин бодож бичвэл огт хамаагүй нүднүүд (хуучин жаазны бутархайн зөрүү, обьёмгүйгээр хувиар
 * бөглөсөн нүд) мянга мянгаараа дарагдана — 13 багцын 96 жаазанд 33,553 мөр зөрж байв. Бусад мөр хэвээр.
 */
import { agsFetch } from '@/modules/sheet/ags';
import type { Pkg, Schema } from '@/modules/sheet/bagts.pkg';
import { applyUpdates, computeAll, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { invalidate } from '@/lib/dataBus';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/* Хадгалсан хувь 8 оронгоор тоймлогддог (`0.92820295`) — түүнээс бага зөрүүг бичихгүй */
const off = (a: number | null, b: number | null): boolean => (a == null || b == null ? a !== b : Math.abs(a - b) > 1e-6);

/** `fromDay` (YYYY-MM-DD)-ээс ХОЙШХИ жаазны өдрүүд, өсөх дарааллаар */
async function frameDaysAfter(pkg: Pkg, sc: Schema, fromDay: string): Promise<string[]> {
  const fd = sc.f.fillDate;
  if (!fd) return [];
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${fd} >= timestamp '${fromDay} 00:00:00'`,
    groupByFieldsForStatistics: fd,
    outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: fd, outStatisticFieldName: 'n' }]),
    returnGeometry: 'false',
  });
  const days = new Set<string>();
  for (const f of ((j?.features ?? []) as { attributes: Record<string, unknown> }[])) {
    const d = msToDay(num(f.attributes[fd]));
    if (d && d > fromDay) days.add(d);
  }
  return [...days].sort();
}

/** `day`-ээс ӨМНӨХ хамгийн сүүлийн жаазны өдөр (алга бол `null`) */
export async function frameDayBefore(pkg: Pkg, sc: Schema, day: string): Promise<string | null> {
  const fd = sc.f.fillDate;
  if (!fd) return null;
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${fd} < timestamp '${day} 00:00:00'`,
    outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: fd, outStatisticFieldName: 'mx' }]),
    returnGeometry: 'false',
  });
  const mx = num((j?.features?.[0]?.attributes as Record<string, unknown> | undefined)?.mx);
  return mx == null ? null : msToDay(mx);
}

/**
 * БӨГЛӨСӨН ӨДРИЙН ЖААЗНЫ ХАДГАЛАХ ХУВЬ (2026-11-16, аудит №8). Хожуу жаазтай үед бөглөсөн өдрийн (D) жааз хамгийн сүүлийн
 * жаазны (L) мөрүүд + илгээлтээр угсрагддаг тул хадгалах хувь нь «L-ийн хуримтлал + нэмэлт» болж, D-ээс ХОЙШ хийгдсэн бусад
 * ажил D-ийн хувьд шингэдэг байв (амьд: 10-30-ны жаазанд 43.278%, зөв нь 43.076%). Энд нүд бүрийг
 *     D = ӨМНӨХ жаазны (P) хадгалсан утга + (угсарсан утга − L-ийн хадгалсан утга)
 * болгоно — нэмэлт нь л P дээр нэмэгдэнэ; хөндөгдөөгүй нүд P-ийн утгаараа. Хадгалсан утгуудтай (түүхэн цуваа) залгаа үлдэхийн
 * тулд обьёмоос дахин бодохгүй. Мөрийг ажлын кодоор (`des`) тулгана; P-д байхгүй мөрийн суурь 0. Блокийн гүйцэтгэл, мөрийн
 * гүйцэтгэл, «одоо байгаа»-г л хөндөнө — обьём, огноо, төлөвлөгөөт хувь хэвээр. `frame[i]` ↔ `loaded[i]` (мөрийн тоо ижил).
 * @returns өөрчилсөн нүдний тоо
 */
export function rebaseBackdated(
  frame: Record<string, unknown>[],
  loaded: readonly Pick<SheetRow, 'des' | 'raw'>[],
  prev: readonly Pick<SheetRow, 'des' | 'raw'>[],
  sc: Pick<Schema, 'act' | 'f'>,
): number {
  const desF = sc.f.des;
  if (!desF || frame.length !== loaded.length) return 0;
  const fields = [...sc.act, sc.f.act, sc.f.wE].filter((f): f is string => !!f);
  const prevOf = new Map<number, Record<string, unknown>>();
  for (const r of prev) if (r.des != null && !prevOf.has(r.des)) prevOf.set(r.des, r.raw ?? {});
  let n = 0;
  frame.forEach((a, i) => {
    const des = loaded[i].des;
    if (des == null || num(a[desF]) !== des) return;
    const p = prevOf.get(des);
    const l = loaded[i].raw ?? {};
    for (const f of fields) {
      const built = num(a[f]);
      if (built == null) continue;
      const base = p ? num(p[f]) : null;
      const delta = built - (num(l[f]) ?? 0);
      const want = base == null && Math.abs(delta) < 1e-9 ? null : Math.max(0, Math.round(((base ?? 0) + delta) * 1e8) / 1e8);
      if (off(built, want)) { a[f] = want; n += 1; }
    }
  });
  return n;
}

/**
 * ИЛГЭЭЛТ ЗӨВХӨН ОБЬЁМЫН ЗАМААР ӨӨРЧИЛСӨН ҮҮ (2026-11-23, аудит) — бөглөсөн өдрөөр (хожуу жаазны өмнө) бичих нөхцөл.
 * Хожуу жаазнуудын хадгалсан хувийг `refreshStoredProgress` зөвхөн обьёмоос (`obyemDay`) дахин боддог тул обьёмгүй мөрд
 * ХУВИАР нэмсэн ахиц (`act` өөрчлөгдсөн, `obyem` хэвээр) хожуу жаазанд хэзээ ч хүрдэггүй байв — батлалт «амжилттай» боловч
 * дашбоард тэр ахицыг хардаггүй. Ийм нүд нэг ч байвал `false` → дуудагч батлах өдрийн (хуучин) дүрмээр бичнэ.
 * `before[i]` ↔ `after[i]` (мөрийн тоо ижил); бүлгийн мөр тооцохгүй.
 */
export function volumeOnlyChange(
  before: readonly Pick<SheetRow, 'group' | 'act' | 'obyem'>[],
  after: readonly Pick<SheetRow, 'group' | 'act' | 'obyem'>[],
): boolean {
  if (before.length !== after.length) return false;
  const diff = (a: number | null | undefined, b: number | null | undefined): boolean =>
    (a == null) !== (b == null) || (a != null && b != null && Math.abs(a - b) > 1e-9);
  for (let i = 0; i < after.length; i += 1) {
    if (after[i].group) continue;
    const n = Math.max(after[i].act.length, before[i].act.length);
    for (let b = 0; b < n; b += 1) {
      if (diff(before[i].act[b], after[i].act[b]) && !diff(before[i].obyem[b], after[i].obyem[b])) return false;
    }
  }
  return true;
}

/** Тэр өдрийн жаазанд обьём бичигдсэн НАВЧ мөр: ажлын код → обьём бичигдсэн БЛОКИЙН индексүүд (цэвэр — тест) */
export function touchedCodes(rows: readonly Pick<SheetRow, 'group' | 'des' | 'obyemDay'>[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const r of rows) {
    if (r.group || r.des == null) continue;
    (r.obyemDay ?? []).forEach((v, b) => {
      if (v == null || v === 0) return;
      const set = out.get(r.des!);
      if (set) set.add(b); else out.set(r.des!, new Set([b]));
    });
  }
  return out;
}

/**
 * Шинэчлэх хүрээ: мөрийн индекс → блокийн индексүүд. Хөндөгдсөн кодтой мөр өөрийн хөндөгдсөн блокоор; өвөг бүлэг бүр
 * удмынхаа хөндөгдсөн блокуудын нэгдлээр (цэвэр — тест). Бусад мөр, бусад блок орохгүй.
 */
export function scopeIdx(rows: readonly Pick<SheetRow, 'depth' | 'des'>[], codes: ReadonlyMap<number, ReadonlySet<number>>): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const add = (i: number, bs: ReadonlySet<number>) => {
    const set = out.get(i) ?? new Set<number>();
    for (const b of bs) set.add(b);
    out.set(i, set);
  };
  const stack: number[] = []; // гүн бүрийн сүүлийн мөрийн индекс
  rows.forEach((r, i) => {
    stack.length = Math.max(0, r.depth);
    const bs = r.des != null ? codes.get(r.des) : undefined;
    if (bs?.size) {
      add(i, bs);
      for (const k of stack) if (k != null) add(k, bs);
    }
    stack[r.depth] = i;
  });
  return out;
}

/** @returns шинэчилсэн мөрийн тоо */
export async function refreshStoredProgress(pkg: Pkg, sc: Schema, fromDay: string): Promise<number> {
  const days = await frameDaysAfter(pkg, sc, fromDay);
  if (!days.length) return 0;
  const base = await loadRows(pkg, sc, fromDay, undefined, { strict: true });
  const codes = touchedCodes(base.rows);
  if (!codes.size) return 0;
  let n = 0;
  for (const day of days) {
    const { rows, asOf } = await loadRows(pkg, sc, day, undefined, { strict: true });
    if (!rows.length || msToDay(num(rows[0].raw?.[sc.f.fillDate ?? ''])) !== day) continue;
    const scope = scopeIdx(rows, codes);
    if (!scope.size) continue;
    const c = computeAll(rows, sc.bld.length, asOf, {}, {}, sc.obyem.map((f) => !!f), undefined, 'abs', sc.synthetic);
    const updates: Record<string, unknown>[] = [];
    rows.forEach((r, i) => {
      const blocks = scope.get(i);
      if (!blocks) return;
      const u: Record<string, unknown> = {};
      sc.act.forEach((f, b) => {
        if (!f || !blocks.has(b)) return;
        const want = c[i].actAgg[b] ?? null;
        if (want != null && off(num(r.raw?.[f]), want)) u[f] = want;
      });
      if (sc.f.act && c[i].J != null && off(num(r.raw?.[sc.f.act]), c[i].J)) u[sc.f.act] = c[i].J;
      if (sc.f.wE && c[i].E != null && off(num(r.raw?.[sc.f.wE]), c[i].E)) u[sc.f.wE] = c[i].E;
      if (Object.keys(u).length) updates.push({ [sc.f.oid]: r.oid, ...u });
    });
    if (updates.length) { await applyUpdates(pkg, updates); n += updates.length; }
  }
  if (n) invalidate('BAGTS_SHEET');
  return n;
}

/**
 * Барилгын блок бүрийн БАРИЛГА УГСРАЛТЫН АЖЛЫН гүйцэтгэл — газрын зургийн
 * өнгө, tooltip болон баруун самбарын аль алинд ижил эх сурвалж.
 *
 * № баганын Б-ийн МӨРҮҮДИЙГ авна:
 *   «Б.»       → нийт гүйцэтгэл (Бэлтгэл ажил ОРОХГҮЙ)
 *   «Б1»…«Б5»  → дэд үе шатууд (барилгын · халаалт · ус · цахилгаан · холбоо)
 * Эх excel өөрөө дэд үе шатын жингээр бодсон дүн тул энд дахин жигнэхгүй.
 *
 * Нүд бүрээр ХАМГИЙН СҮҮЛИЙН огноог авна: бөглөх хуудас нь өөрчилсөн нүдээ
 * л шинэ огноогоор нэмдэг тул нэг барилгын нүднүүд өөр өөр огноотой байж болно.
 */
import { TASK_SHEET, PROGRESS_LEVELS, buildingKey, blockKey, normalizeTaskNo, isConstructionNo } from './services';
import { loadSheetRows, sheetBlockKeys, sheetBlocklessKeys } from '@/modules/sheet/sheetRows';
import { childIndexes, type SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import { register, type DataKey } from './dataBus';
import { dayKey } from './format';

const TS = TASK_SHEET.fields;

const t = (v: unknown) => (v == null ? '' : String(v));
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ИРЭЭДҮЙН ОГНООНЫ ТАСЛАЛТ — «өнөөдөр» (ОРОН НУТГИЙН «YYYY-MM-DD»).
 */
export const progressCutoff = (ms: number = Date.now()): string => dayKey(ms);
/** Хэмжилтийн огноо таслалтаас хойш уу (ирээдүйн) */
export const isFutureDay = (d: string, today: string): boolean => d > today;

/**
 * Бөглөх хуудсуудаас Б-ийн мөрүүдийг татаж УРТ хэлбэрт задална.
 */
async function fetchConstruction(blockless = false): Promise<Record<string, unknown>[]> {
  const rows = await loadSheetRows({ constructionOnly: true, blockless });
  return rows.map((r) => ({
    [TS.bagts]: r.bagts,
    [TS.no]: r.no,
    [TS.work]: r.work,
    [TS.date]: r.date,
    [TS.block]: r.block,
    [TS.progress]: r.progress,
    sheet: r.sheet,
  }));
}

/**
 * ХУУДСУУДЫН ДАВХАРДАЛГҮЙ БЛОКИЙН ТОО — багцын хуудас бүрд ӨМНӨХ хуудсуудад байхгүй блокийн
 * шошгын тоо (`blockKey`-ээр нормчилж жишнэ).
 */
export function uniqueBlockCounts(blds: readonly (readonly string[])[]): number[] {
  const seen = new Set<string>();
  return blds.map((bld) => {
    let n = 0;
    for (const b of bld) {
      const k = blockKey(b);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      n += 1;
    }
    return n;
  });
}

/** Багцын/хуудасны обьёмын хос — бодит (хуримтлагдсан) ба төлөвлөгөөт. `null` = мэдээлэлгүй (0 БИШ). */
export type ObyemPair = { volume: number | null; volumePlan: number | null };

/**
 * Обьёмын тооцоонд хэрэгтэй баганууд (`loadRows`-ийн `fields`) — `sheetShared.sharedFields(sc, 'variance')`-ийн дэд олонлог.
 */
export const obyemFields = (sc: Schema): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.fillDate, sc.f.vol, ...sc.obyem,
].filter((x): x is string => !!x))];

/**
 * ХУУДАСНЫ ОБЬЁМ — «Б.» (барилга угсралт) мөрийн доорх НАВЧ ажлуудаас (цэвэр функц, `negtgel.check` тулгана).
 */
export function constructionObyem(rows: readonly SheetRow[], hasObyem: readonly unknown[]): ObyemPair {
  const bi = rows.findIndex((r) => isConstructionNo(r.no));
  if (bi < 0) return { volume: null, volumePlan: null };
  const kids = childIndexes(rows as SheetRow[]);
  let volume: number | null = null;
  let volumePlan: number | null = null;
  const stack = [...kids[bi]];
  while (stack.length) {
    const i = stack.pop()!;
    if (kids[i].length) { stack.push(...kids[i]); continue; }
    const r = rows[i];
    if (r.group) continue;
    for (let b = 0; b < hasObyem.length; b += 1) {
      if (!hasObyem[b]) continue;
      const o = r.obyem[b];
      if (o != null && Number.isFinite(o)) volume = (volume ?? 0) + o;
      if (r.vol != null && r.vol > 0) volumePlan = (volumePlan ?? 0) + r.vol;
    }
  }
  return { volume, volumePlan };
}

/**
 * БАГЦЫН ОБЬЁМ — хуудсуудын нийлбэр (цэвэр). `n` = `uniqueBlockCounts`-ийн жин (PKGS-ийн дарааллаар).
 */
export function sumObyemParts(parts: readonly ({ n: number } & ObyemPair)[]): ObyemPair {
  const use = parts.some((x) => x.n > 0) ? parts.filter((x) => x.n > 0) : parts.slice(0, 1);
  const add = (pick: (x: ObyemPair) => number | null): number | null => {
    let s: number | null = null;
    for (const x of use) {
      const v = pick(x);
      if (v != null) s = (s ?? 0) + v;
    }
    return s;
  };
  return { volume: add((x) => x.volume), volumePlan: add((x) => x.volumePlan) };
}

/** Дэд үе шат — «Б1 · Барилгын ажил · 24%» */
export type SubPhase = { no: string; name: string; pct: number | null };
export type BlockProgress = {
  /** «Б.» мөрийн гүйцэтгэл, 0–100 */
  overall: number;
  /** Тухайн нүдний хамгийн сүүлийн огноо */
  date: string;
  /** Б1…Б5 — № дарааллаар. Бөглөгдөөгүй бол `pct: null`. */
  phases: SubPhase[];
};
/** `${БАГЦ}|${блок}` → гүйцэтгэл. (`MapCanvas`-д ArcGIS-ийн `Map`-ыг дарсан тул alias.) */
export type BlockProgressMap = Map<string, BlockProgress>;

/**
 * БАГЦ БҮРИЙН БЛОКИЙН ХУВААРЬ — `bagtsKey` («БАГЦ1») → `buildingKey`[] («БАГЦ1|29/1»).
 */
export type BlockUniverse = ReadonlyMap<string, readonly string[]>;

/* ─────────────────────── Нүдний ялагч — ГАНЦ дүрэм ─────────────────────── */

/** Нэг нүдний (барилга × №) НЭГ хуудасны сүүлийн мөр; `seq` — мөрийн дараалал (OID-ийн орлуулагч, ижил огноонд) */
type Cell = { pct: number | null; name: string; date: string; sheet: string; seq: number };
/** Хуудас (`''` = хуудасны түлхүүргүй, хуучин кэш) → тэр хуудасны сүүлийн нүд */
type CellState = Map<string, Cell>;

function pushCell(st: CellState, c: Cell): void {
  const later = (p: Cell | undefined): boolean => !p || p.date <= c.date;
  if (c.sheet === '') {
    for (const [s, p] of st) if (later(p)) st.set(s, c);
    if (!st.has('')) st.set('', c);
    return;
  }
  const p = st.get(c.sheet) ?? st.get('');
  if (later(p)) st.set(c.sheet, c);
  else if (p && !st.has(c.sheet)) st.set(c.sheet, p);
}

/** Хуудас хоорондын ялагч (дээрх 2-р дүрэм); нүдгүй бол `null` */
function winnerOf(st: CellState): Cell | null {
  const named: Cell[] = [];
  for (const [s, c] of st) if (s !== '') named.push(c);
  const cands = named.length ? named : [...st.values()];
  if (!cands.length) return null;
  const valued = cands.filter((c) => c.pct != null);
  const pool = valued.length ? valued : cands;
  let w = pool[0];
  for (const c of pool) if (c.date > w.date || (c.date === w.date && c.seq > w.seq)) w = c;
  return w;
}

/** Мөр → нүд; огноо хүчингүй/ирээдүйн (`progressCutoff` 2026-10-01) бол `null` */
function cellOf(r: Record<string, unknown>, seq: number, today: string): Cell | null {
  const d = t(r[TS.date]);
  if (!isValidDate(d) || isFutureDay(d, today)) return null;
  return {
    pct: r[TS.progress] == null ? null : Number(r[TS.progress]) * 100,
    name: t(r[TS.work]),
    date: d,
    sheet: typeof r.sheet === 'string' ? r.sheet : '',
    seq,
  };
}

/** Ялагч нүд — дуудагчид (`seq`-гүй) */
export type WinnerCell = { pct: number | null; name: string; date: string; sheet: string };

/**
 * Барилга → № → ялагч нүд (`compute`-ийн цөм; `history`-тэй НЭГ дүрэм — дээрх). Мөрийн ДАРААЛЛААС ХАМААРАХГҮЙ.
 */
export function winnerCells(
  rows: Record<string, unknown>[], today: string = progressCutoff(),
): Map<string, Map<string, WinnerCell>> {
  /** барилга → (№ → хуудас → сүүлийн нүд) */
  const st = new Map<string, Map<string, CellState>>();
  rows.forEach((r, seq) => {
    const c = cellOf(r, seq, today);
    if (!c) return;
    const no = normalizeTaskNo(r[TS.no]);
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const cells = st.get(k) ?? new Map<string, CellState>();
    const s = cells.get(no) ?? new Map<string, Cell>();
    pushCell(s, c);
    cells.set(no, s);
    st.set(k, cells);
  });
  const out = new Map<string, Map<string, WinnerCell>>();
  for (const [k, cells] of st) {
    const m = new Map<string, WinnerCell>();
    for (const [no, s] of cells) {
      const w = winnerOf(s);
      if (w) m.set(no, { pct: w.pct, name: w.name, date: w.date, sheet: w.sheet });
    }
    out.set(k, m);
  }
  return out;
}

/**
 * Блок бүрийн «Б.» мөрийн СҮҮЛИЙН утга — ЗӨВХӨН бөглөх хуудсаас.
 */
export function compute(rows: Record<string, unknown>[], today: string = progressCutoff()): BlockProgressMap {
  const out: BlockProgressMap = new Map();
  for (const [k, cells] of winnerCells(rows, today)) {
    const total = cells.get(TASK_SHEET.constructionNo);
    if (!total || total.pct == null) continue;
    out.set(k, {
      overall: total.pct,
      date: total.date,
      phases: TASK_SHEET.subPhaseNos.map((no) => ({
        no,
        name: cells.get(no)?.name ?? '',
        pct: cells.get(no)?.pct ?? null,
      })).filter((p) => p.name),
    });
  }
  return out;
}

/* ─────────────────────── Цаг хугацааны цуваа ─────────────────────── */

/** Нэг блокийн «Б.» мөрийн бүртгэл — огноо ӨСӨХ дарааллаар */
export type HistoryPoint = { date: string; pct: number | null };
/** `${БАГЦ}|блок` → бүртгэлийн түүх */
export type BlockHistory = Map<string, HistoryPoint[]>;

/**
 * Блок бүрийн «Б.» мөрийн бүх огноо.
 */
export function history(rows: Record<string, unknown>[], today: string = progressCutoff()): BlockHistory {
  /* барилга → нүднүүд (дараа нь огноо/дарааллаар эрэмбэлнэ) */
  const byKey = new Map<string, Cell[]>();
  rows.forEach((r, seq) => {
    if (!isConstructionNo(r[TS.no])) return;
    const c = cellOf(r, seq, today);
    if (!c) return;
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const arr = byKey.get(k) ?? [];
    arr.push(c);
    byKey.set(k, arr);
  });
  const out: BlockHistory = new Map();
  for (const [k, cells] of byKey) {
    cells.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
    const st: CellState = new Map();
    const pts: HistoryPoint[] = [];
    let prev: Cell | null = null;
    cells.forEach((c, i) => {
      pushCell(st, c);
      /* нэг өдрийн бүх мөрийг оруулсны ДАРАА л ялагчийг авна — «нэг өдөрт хоёр бичлэг — сүүлийнх ялна» */
      if (i + 1 < cells.length && cells[i + 1].date === c.date) return;
      const w = winnerOf(st);
      if (!w || w === prev) return;
      prev = w;
      pts.push({ date: c.date, pct: w.pct });
    });
    out.set(k, pts);
  }
  return out;
}

export type SeriesPoint = {
  /** Шошго — «2026-07-20» эсвэл «2026-07» */
  label: string;
  /** Тухайн үеийн бодит агшин (as-of огноо) */
  date: string;
  /**
   * Дундаж гүйцэтгэл, 0–100. Хуваарь нь ХОЁР горимд хамрах хүрээний БҮХ блок
   * (бөглөгдөөгүй = 0%).
   */
  overall: number;
  /** Тухайн үед бөглөгдсөн байсан блокийн тоо (хуваарь БИШ — хуваарь нь `keys`-ийн тоо) */
  blocks: number;
};

/**
 * Цувааны утгын тодорхойлолт.
 *   · `'peak'`   — блок бүрийн ӨССӨН дүн (running max), хуваарь ТОГТМОЛ (`keys`)
 *   · `'latest'` — блок бүрийн ТУХАЙН АГШИН ДАХЬ СҮҮЛИЙН бичлэг (`compute`-тэй
 *                  ижил дүрэм), хуваарь ТОГТМОЛ (`keys`, 2026-10-01-ээс — тайлагнаагүй = 0%)
 */
export type SeriesMode = 'peak' | 'latest';

/**
 * Блокуудын СҮҮЛИЙН хэмжигдсэн гүйцэтгэлийн дундаж — `progressSeries(…, 'latest')`-ийн
 * СҮҮЛИЙН цэгтэй ЯГ таарах «одоо»-гийн тоо.
 */
export function latestMean(
  pm: BlockProgressMap,
  keys: Iterable<string>,
): { pct: number | null; blocks: number; total: number } {
  let sum = 0, n = 0, total = 0;
  for (const k of new Set(keys)) {
    total += 1;
    const c = pm.get(k);
    if (c == null || !Number.isFinite(c.overall)) continue;
    sum += c.overall;
    n += 1;
  }
  return { pct: total ? sum / total : null, blocks: n, total };
}

/** Багцын гүйцэтгэл — `pkgProgressOf`-ийн мөр */
export type PkgProgress = {
  /** 0–100 — Σ хэмжигдсэн блок ÷ `total` (тайлагнаагүй блок 0%) */
  pct: number;
  /** Хэмжигдсэн (тайлагнасан) блокийн тоо */
  blocks: number;
  /** Хуваарь — багцын БҮХ блок (бөглөх хуудасны хуваарь ∪ хэмжигдсэн түлхүүр) */
  total: number;
};

/**
 * БАГЦ БҮРИЙН ГҮЙЦЭТГЭЛ — тухайн багцын БҮХ блокийн ЭНГИЙН дундаж, 0–100;
 * тайлагнаагүй блок 0%. Түлхүүр нь `bagtsKey` («БАГЦ1», «БАГЦ41»).
 */
export function pkgProgressOf(pm: BlockProgressMap, universe: BlockUniverse): Map<string, PkgProgress> {
  const pkgOf = (key: string) => { const cut = key.indexOf('|'); return cut < 0 ? key : key.slice(0, cut); };
  /* багц → хуваарийн түлхүүрүүд (давхардалгүй) */
  const keysOf = new Map<string, Set<string>>();
  const add = (pk: string, key: string) => {
    if (!pk) return;
    const s = keysOf.get(pk) ?? new Set<string>();
    s.add(key);
    keysOf.set(pk, s);
  };
  for (const [pk, keys] of universe) for (const key of keys) add(pk, key);
  for (const [key, cell] of pm) {
    if (cell != null && Number.isFinite(cell.overall)) add(pkgOf(key), key);
  }
  const out = new Map<string, PkgProgress>();
  for (const [pk, keys] of keysOf) {
    let sum = 0, n = 0;
    for (const key of keys) {
      const c = pm.get(key);
      if (c == null || !Number.isFinite(c.overall)) continue; // тайлагнаагүй — 0%
      sum += c.overall;
      n += 1;
    }
    if (keys.size > 0) out.set(pk, { pct: sum / keys.size, blocks: n, total: keys.size });
  }
  return out;
}

/**
 * БАГЦЫН ХУВААРИЙН ТҮЛХҮҮРҮҮД — `universe` ∪ хэмжигдсэн түлхүүр, багцаар шүүсэн.
 */
export function universeKeys(
  pm: BlockProgressMap | null,
  universe: BlockUniverse,
  only?: Iterable<string>,
): string[] {
  const want = only ? new Set(only) : null;
  const out = new Set<string>();
  for (const [pk, keys] of universe) if (!want || want.has(pk)) keys.forEach((k) => out.add(k));
  if (pm) {
    for (const key of pm.keys()) {
      const cut = key.indexOf('|');
      const pk = cut < 0 ? key : key.slice(0, cut);
      if (!want || want.has(pk)) out.add(key);
    }
  }
  return [...out];
}

/**
 * БЛОКИЙН ТҮВШНИЙ ТООЛОЛ (`PROGRESS_LEVELS`: 0–25 · 25–50 · …) — хуваарь нь `keys`
 * (бөглөх хуудасны блок) ∪ хэмжигдсэн түлхүүр; тайлагнаагүй блок 0%-ийн түвшинд.
 */
export function levelCounts(pm: BlockProgressMap, keys: Iterable<string>): number[] {
  const counts = PROGRESS_LEVELS.map(() => 0);
  const all = new Set<string>(keys);
  pm.forEach((_, k) => all.add(k));
  all.forEach((k) => {
    const v = pm.get(k)?.overall;
    const x = v != null && Number.isFinite(v) ? v : 0;
    counts[Math.max(0, Math.min(PROGRESS_LEVELS.length - 1, Math.floor(x / 25)))] += 1;
  });
  return counts;
}

/**
 * ГАЗРЫН ЗУРГИЙН БЛОКИЙН ТҮЛХҮҮРИЙН ЗӨРҮҮ — админд засуулах жагсаалт (2026-10-01,
 * «хэрэглэгч: бүгдийг зас»). ӨГӨГДЛИЙГ ЗАСАХГҮЙ, зөвхөн илрүүлнэ.
 *   · `dup`     — давхаргад ХОЁР+ feature-тэй түлхүүр (БАГЦ1|29/1, БАГЦ2|5/6)
 *   · `orphan`  — бөглөх хуудсанд хэмжилттэй атлаа давхаргад footprint-гүй (БАГЦ2|5/8)
 *   · `relabel` — footprint-гүй хэмжилтийн БЛОКИЙН нэр өөр багцын feature-т байгаа
 *                 (БАГЦ1|29/3 ↔ давхаргад «Багц 2» гэж бичигдсэн 29/3) — багцын нэр буруу
 */
export function mapKeyIssues(
  featureKeys: readonly string[],
  measured: Iterable<string>,
): { dup: string[]; orphan: string[]; relabel: { measured: string; feature: string }[] } {
  const count = new Map<string, number>();
  for (const k of featureKeys) count.set(k, (count.get(k) ?? 0) + 1);
  const dup = [...count].filter(([, n]) => n > 1).map(([k]) => k).sort();
  const orphan = [...new Set(measured)].filter((k) => !count.has(k)).sort();
  const blockOf = (k: string) => k.slice(k.indexOf('|') + 1);
  const relabel: { measured: string; feature: string }[] = [];
  for (const m of orphan) {
    for (const f of count.keys()) {
      if (f !== m && blockOf(f) === blockOf(m)) relabel.push({ measured: m, feature: f });
    }
  }
  return { dup, orphan, relabel };
}

/** «YYYY-MM-DD» → «YYYY-MM» */
const monthOf = (d: string) => d.slice(0, 7);

/**
 * As-of цуваа: огноо бүрд хамрах хүрээний БҮХ блокийн дундаж.
 *
 * `keys` — зөвхөн эдгээр блокоор (газрын зургийн давхаргад БАЙГАА блокууд).
 */
export function progressSeries(
  hist: BlockHistory,
  keys: Iterable<string>,
  grain: 'day' | 'month',
  mode: SeriesMode = 'peak',
): SeriesPoint[] {
  const keyList = [...new Set(keys)];
  const mine = keyList.map((k) => hist.get(k)).filter((h): h is HistoryPoint[] => h != null);
  const dates = [...new Set(mine.flatMap((h) => h.map((p) => p.date)))].sort();
  if (!dates.length) return [];

  /**
   * Нэг блокийн тухайн агшны гүйцэтгэл — бүртгэсэн утгуудын ХАМГИЙН ИХ нь.
   */
  const peak = (h: HistoryPoint[], asOf: string) => {
    let v: number | null = null;
    for (const p of h) {
      if (p.date > asOf) break;
      if (p.pct != null && (v == null || p.pct > v)) v = p.pct;
    }
    return v;
  };

  /**
   * Тухайн агшин дахь СҮҮЛИЙН бичлэг (`'latest'`). `pct: null` (нүд
   * цэвэрлэгдсэн) бол тэр блок «бөглөгдөөгүй» — `compute`-ийн дүрэм.
   */
  const latest = (h: HistoryPoint[], asOf: string) => {
    let v: number | null = null;
    for (const p of h) {
      if (p.date > asOf) break;
      v = p.pct;
    }
    return v;
  };

  const at = (asOf: string) => {
    let sum = 0, n = 0;
    for (const h of mine) {
      const v = mode === 'latest' ? latest(h, asOf) : peak(h, asOf);
      if (v != null && Number.isFinite(v)) { sum += v; n += 1; }
    }
    const den = keyList.length;
    return { date: asOf, overall: den ? sum / den : 0, blocks: n };
  };

  // Keep explicit clearing after measured history in latest mode (same as finPhys).
  // Null-only history stays unmeasured; peak mode remains unchanged.
  let firstMeasured: string | undefined;
  for (const h of mine) for (const p of h) {
    if (p.pct != null && Number.isFinite(p.pct) && (firstMeasured == null || p.date < firstMeasured)) firstMeasured = p.date;
  }
  const measured = (p: SeriesPoint) => p.blocks > 0 || (mode === 'latest' && firstMeasured != null && p.date >= firstMeasured);

  if (grain === 'day') return dates.map((d) => ({ label: d, ...at(d) })).filter(measured);

  /**
   * Сар бүрийн ЭЦСИЙН байдал — ГЭХДЭЭ бүртгэлгүй сарыг АЛГАСНА.
   */
  const out: SeriesPoint[] = [];
  const last = dates[dates.length - 1];
  let prevSnap = '';
  for (let m = monthOf(dates[0]); m <= monthOf(last); m = nextMonth(m)) {
    // Мөрийн харьцуулалт: «2026-03-99» нь тухайн сарын ямар ч өдрөөс их.
    const snap = [...dates].reverse().find((d) => d <= `${m}-99`);
    if (!snap || snap === prevSnap) continue;
    prevSnap = snap;
    const pt = { label: m, ...at(snap) };
    if (measured(pt)) out.push(pt);
  }
  return out;
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

/* ─────────────────────────── Cache ─────────────────────────── */

/**
 * Нэг удаа тооцоод хадгална; алдаа гарвал дараагийн дуудалт ДАХИН оролдоно.
 */
const MEMO_TTL_MS = 5 * 60_000;

function memo<T>(fn: () => Promise<T>, reads: readonly DataKey[] = [], ttlMs: number = MEMO_TTL_MS): () => Promise<T> {
  let p: Promise<T> | null = null;
  /** Хүсэлт ЭХЭЛСЭН агшин — явж буй хүсэлтийг TTL дуусахаас өмнө давхар татахгүй */
  let at = 0;
  if (reads.length) register(() => { p = null; }, reads);
  return () => {
    if (p && Date.now() - at < ttlMs) return p;
    at = Date.now();
    const mine = fn().catch((e) => { if (p === mine) p = null; throw e; });
    p = mine;
    return mine;
  };
}

/* ── localStorage кэш (stale-while-revalidate) ── */

/**
 * Амьд татаж дуустал (~7с, 2000+ мөр хуудаслана) газрын зургийн 113 блок
 * СААРАЛ харагддаг байв. Сүүлийн амжилттай ТООЦООЛСОН дүнг (113 бичлэг —
 * түүхий мөр биш, жижиг) localStorage-д хадгалж, дараагийн нээлтэд шууд будна;
 * амьд дүн ирмэгц дарж шинэчилнэ.
 */
const CACHE_KEY = 'selbe-blockprog-v2';
/** Кэшийн хүчинтэй хугацаа — долоо хоногоос хуучин бол огт хэрэглэхгүй */
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

function saveCache(m: BlockProgressMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), entries: [...m] }));
  } catch { /* private mode / дүүрсэн — кэшгүй ажиллана */ }
}

/** Сүүлийн амжилттай дүн — СИНХРОН уншина (амьд татаж дуустал түр будна) */
export function cachedBlockProgress(): BlockProgressMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { t?: number; entries?: [string, BlockProgress][] };
    if (!j.t || !Array.isArray(j.entries) || Date.now() - j.t > CACHE_TTL_MS) return null;
    return new Map(j.entries);
  } catch {
    return null;
  }
}

/** Түүхий мөрүүд — `loadBlockProgress` ба `loadBlockHistory` ХОЁУЛАА үүнээс. */
const loadRows = memo(fetchConstruction, ['BAGTS_SHEET']);

/**
 * Блок бүрийн барилга угсралтын гүйцэтгэл (0–100) — ЗӨВХӨН бөглөх хуудсаас.
 */
export const loadBlockProgress: () => Promise<BlockProgressMap> = memo(
  async () => {
    const m = compute(await loadRows());
    saveCache(m);
    return m;
  },
  ['BAGTS_SHEET'],
);

/**
 * КЭШГҮЙ хувилбар — ЗӨВХӨН хүснэгт рүү БИЧИХ зам (`negtgelAuto.syncNegtgel`).
 */
export async function loadBlockProgressFresh(): Promise<BlockProgressMap> {
  return compute(await fetchConstruction());
}

/**
 * БАГЦ БҮРИЙН БЛОКИЙН ХУВААРЬ (`BlockUniverse`) — бөглөх хуудсуудын бүдүүвчээс.
 */
export const loadBlockUniverse: () => Promise<BlockUniverse> = memo(sheetBlockKeys);

/**
 * Багц бүрийн гүйцэтгэл (`pkgProgressOf`) — хэмжилт + хуваарийг хамт ачаална.
 */
export async function loadPkgProgress(fresh = false): Promise<Map<string, PkgProgress>> {
  const [pm, uni] = await Promise.all([
    fresh ? loadBlockProgressFresh() : loadBlockProgress(),
    loadBlockUniverse(),
  ]);
  return pkgProgressOf(pm, uni);
}

/* ═══════════════ БЛОКГҮЙ БАГЦУУД (5.x · 6.x · 7.1 · 10) ═══════════════
 */
const loadInfraRows = memo(() => fetchConstruction(true), ['BAGTS_SHEET']);

/** Блокгүй багцын «Б.» мөрийн бүх огноо — `loadBlockHistory`-той ижил хэлбэр, тусдаа Map */
export const loadInfraHistory: () => Promise<BlockHistory> = memo(
  async () => history(await loadInfraRows()),
  ['BAGTS_SHEET'],
);

/** Блокгүй багцын хуваарь (`sheetBlocklessKeys`) — `loadBlockUniverse`-тэй ижил хэлбэр */
export const loadInfraUniverse: () => Promise<BlockUniverse> = memo(sheetBlocklessKeys);

/**
 * Блокгүй багц бүрийн гүйцэтгэл (0–100) — `loadPkgProgress`-тэй ижил хэлбэр (`bagtsKey` → `PkgProgress`).
 * @param fresh `true` = КЭШГҮЙ (зөвхөн хүснэгт рүү БИЧИХ зам — `loadBlockProgressFresh`)
 */
export async function loadInfraProgress(fresh = false): Promise<Map<string, PkgProgress>> {
  const [rows, uni] = await Promise.all([
    fresh ? fetchConstruction(true) : loadInfraRows(),
    loadInfraUniverse(),
  ]);
  return pkgProgressOf(compute(rows), uni);
}

/** Блок бүрийн «Б.» мөрийн бүх огноо — цаг хугацааны цувааны эх. */
export const loadBlockHistory: () => Promise<BlockHistory> = memo(
  async () => history(await loadRows()),
  ['BAGTS_SHEET'],
);

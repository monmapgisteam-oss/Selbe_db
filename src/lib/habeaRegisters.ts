/**
 * ХАБ-ЫН БҮРТГЭЛҮҮД — «Бусад үзүүлэлт» карт (2026-10-08, хэрэглэгчийн хүсэлт).
 *
 * Эх сурвалж: `Сэлбэ_ХАБ1007` FeatureServer (нийтэд нээлттэй, ГУРВАН хүснэгт):
 *   · 35 — Талбайн зааварчилгааны бүртгэл  (огноо: `Огноо`)
 *   · 38 — Сануулах хуудас өгсөн бүртгэл    (огноо: `Баримтын_он__сар__өдөр`)
 *   · 36 — Хариуцлага тооцох мэдэгдэх       (огноо: `Огноо`)
 * «Аюулыг мэдээлэх хуудас», «Сайжруулалт» — эх хүснэгт ОДООГООР БАЙХГҮЙ: «—»
 * (`null ≠ 0` — тэг гэж харуулбал «бүртгэл алга» гэж ХУДАЛ уншигдана).
 *
 * ⚠️ «7 ХОНОГ» = ӨМНӨХ БҮТЭН долоо хоног (Даваа 00:00 → дараагийн Даваа 00:00,
 *    орон нутгийн цаг) — хэрэглэгч: «сүүлийн долоо хоногийн нийт тоо, Даваа гараг
 *    шинэчлэгддэг». `habeaUzleg.prevWeek`-тэй ИЖИЛ дүрэм (үзлэгийн долоо хоногийн оноо).
 * ⚠️ Тоо нь серверийн `returnCountOnly` — мөр татахгүй.
 * ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — `arcgisPost` биеийг шалгаж шиднэ.
 */
import { arcgisPost } from '@/lib/query';
import { cached } from '@/lib/live';
import { HABEA } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { requireCap } from '@/lib/who';
import { invalidate } from '@/lib/dataBus';

export type RegisterRow = {
  key: string;
  label: string;
  /** Өмнөх бүтэн долоо хоногийн тоо — эх сурвалжгүй бол `null` */
  week: number | null;
};

export type RegisterData = { rows: RegisterRow[]; weekNo: number; start: Date; end: Date };

/** Өмнөх бүтэн долоо хоног — Даваа 00:00 (орон нутгийн) хилтэй */
export function lastFullWeek(now = new Date()): { start: Date; end: Date; no: number } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  /* ISO долоо хоногийн дугаар — Пүрэв гаригийн жилээр */
  const th = new Date(start);
  th.setDate(th.getDate() + 3);
  const y0 = new Date(th.getFullYear(), 0, 4);
  const no = 1 + Math.round(((th.getTime() - y0.getTime()) / 86400000 - 3 + ((y0.getDay() + 6) % 7)) / 7);
  return { start, end, no };
}

/** ArcGIS SQL-ийн огноо — сервер UTC-ээр хадгалдаг тул локал хилийг UTC болгоно */
const sqlTs = (d: Date) => `timestamp '${d.toISOString().slice(0, 19).replace('T', ' ')}'`;

const countOf = async (table: number, where: string): Promise<number> => {
  const j = await arcgisPost<{ count?: number }>(`${HABEA.registers.url}/${table}/query`, {
    f: 'json', where, returnCountOnly: 'true',
  });
  return typeof j.count === 'number' ? j.count : 0;
};

async function fetchRegisters(now: Date): Promise<RegisterData> {
  const w = lastFullWeek(now);
  const rows = await Promise.all(HABEA.registers.items.map(async (it): Promise<RegisterRow> => {
    /* ⚠️ 2026-10-08: «Нийт» багана ХАСАГДАВ (хэрэглэгч: «зөвхөн сүүлийн долоо хоногийн мэдээ») */
    if (it.table == null || !it.date) return { key: it.key, label: it.label, week: null };
    const week = await countOf(it.table, `${it.date} >= ${sqlTs(w.start)} AND ${it.date} < ${sqlTs(w.end)}`);
    return { key: it.key, label: it.label, week };
  }));
  return { rows, weekNo: w.no, start: w.start, end: w.end };
}

/* ⚠️ 5 минутын кэш (`HABEA` таг) — ХАБЭА-гийн бусад эх сурвалжтай ижил хэмнэл */
const cachedFetch = cached(() => fetchRegisters(new Date()), 5 * 60_000, ['HABEA']);

/** Карт ачаалагч. ⚠️ Долоо хоног солигдоход дуудагч `weekKey`-ээр дахин дуудна. */
export const loadHabeaRegisters = (): Promise<RegisterData> => cachedFetch();

/* ═════════════════ ХОГ ХАЯГДАЛ (2026-10-08) ═════════════════ */

/** Нэг мөр — хаягдлын төрөл, багц бүрийн рейс (бүх долоо хоногийн НИЙЛБЭР) */
export type WasteRow = { metric: string; byPkg: Record<string, number> };
export type WasteData = { rows: WasteRow[]; weeks: number[] };

async function fetchWaste(): Promise<WasteData> {
  const W = HABEA.waste;
  const j = await arcgisPost<{ features?: { attributes?: Record<string, unknown> }[] }>(`${W.url}/query`, {
    f: 'json', where: '1=1', outFields: '*', returnGeometry: 'false',
  });
  const by = new Map<string, Record<string, number>>();
  const weeks = new Set<number>();
  for (const ft of j.features ?? []) {
    const a = ft.attributes ?? {};
    const m = String(a[W.fields.metric] ?? '');
    const wk = Number(a[W.fields.week]);
    if (Number.isFinite(wk)) weeks.add(wk);
    const cur = by.get(m) ?? {};
    for (const [col, name] of W.pkgCols) {
      const v = Number(a[col]);
      if (Number.isFinite(v)) cur[name] = (cur[name] ?? 0) + v;
    }
    by.set(m, cur);
  }
  return { rows: [...by.entries()].map(([metric, byPkg]) => ({ metric, byPkg })), weeks: [...weeks].sort((x, y) => x - y) };
}

const cachedWaste = cached(fetchWaste, 5 * 60_000, ['HABEA']);
/** Хог хаягдлын карт ачаалагч */
export const loadHabeaWaste = (): Promise<WasteData> => cachedWaste();

/* ═════════════════ БИЧИЛТ — «habeaData» эрхтэй хэрэглэгч (2026-10-08) ═════════════════ */
/*
 * ⚠️ БАТЛАГЧГҮЙ — шууд ArcGIS-д (`tableWrite.applyAll`: HTTP-200 алдааг шалгана, атом).
 * ⚠️ `requireCap('habeaData')` — UI-ийн товч нуугдсан ч консолоос бичихийг хаана.
 * ⚠️ Хадгалсны дараа `invalidate('HABEA')` — карт шинэ тоог 5 минут хүлээлгүй харуулна.
 */

/** Хүснэгтийн бичих талбар — маягт угсрахад */
export type EntryField = { name: string; alias: string; type: 'date' | 'number' | 'text' | 'long' };

const SYS_FIELD = /^(objectid|fid|globalid|creationdate|creator|editdate|editor)$/i;
/** Урт текстийн талбар — `textarea` */
const LONG_RE = /агуулга|тайлбар/i;

/** Бүртгэлийн хүснэгтийн талбарууд (35 · 38 · 36) — метадатаас, дарааллаар */
export async function loadEntryFields(table: number): Promise<EntryField[]> {
  const j = await arcgisPost<{ fields?: { name?: string; alias?: string; type?: string; editable?: boolean }[] }>(
    `${HABEA.registers.url}/${table}`, { f: 'json' },
  );
  return (j.fields ?? [])
    .filter((f) => f.name && !SYS_FIELD.test(f.name) && f.editable !== false && !/OID|GlobalID/.test(f.type ?? ''))
    .map((f) => {
      const t = String(f.type ?? '');
      const type: EntryField['type'] = /Date/.test(t) ? 'date'
        : /Double|Integer|Single/.test(t) ? 'number'
          : LONG_RE.test(String(f.alias ?? f.name)) ? 'long' : 'text';
      return { name: String(f.name), alias: String(f.alias || f.name), type };
    });
}

/** Дугаарын (№ · д/д) дараагийн утга — хамгийн их + 1 */
export async function nextNumber(table: number, field: string): Promise<number> {
  const j = await arcgisPost<{ features?: { attributes?: { m?: number | null } }[] }>(
    `${HABEA.registers.url}/${table}/query`,
    { f: 'json', where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'm' }]) },
  );
  const m = Number(j.features?.[0]?.attributes?.m);
  return Number.isFinite(m) ? m + 1 : 1;
}

/** Бүртгэлийн мөр нэмэх */
export async function addRegister(table: number, attrs: Record<string, unknown>): Promise<void> {
  requireCap('habeaData');
  await applyAll(`${HABEA.registers.url}/${table}`, 'ObjectID', { adds: [attrs] });
  invalidate('HABEA');
}

/** Хог хаягдлын түүхий мөр (долоо хоног × төрөл) — засахад FID-тэй */
export type WasteRaw = { fid: number; week: number; metric: string; cols: Record<string, number> };

export async function loadWasteRaw(): Promise<{ rows: WasteRaw[]; metrics: string[] }> {
  const W = HABEA.waste;
  const [q, meta] = await Promise.all([
    arcgisPost<{ features?: { attributes?: Record<string, unknown> }[] }>(`${W.url}/query`, {
      f: 'json', where: '1=1', outFields: '*', returnGeometry: 'false',
    }),
    arcgisPost<{ fields?: { name?: string; domain?: { codedValues?: { code?: unknown }[] } | null }[] }>(W.url, { f: 'json' }),
  ]);
  const rows = (q.features ?? []).map((ft) => {
    const a = ft.attributes ?? {};
    const cols: Record<string, number> = {};
    for (const [c] of W.pkgCols) cols[c] = Number(a[c]) || 0;
    return { fid: Number(a.FID), week: Number(a[W.fields.week]), metric: String(a[W.fields.metric] ?? ''), cols };
  });
  const dom = meta.fields?.find((f) => f.name === W.fields.metric)?.domain?.codedValues ?? [];
  return { rows, metrics: dom.map((c) => String(c.code)) };
}

/** Тухайн (долоо хоног × төрөл)-ийн мөрийг ШИНЭЧЛЭХ, байхгүй бол НЭМЭХ */
export async function saveWaste(week: number, metric: string, cols: Record<string, number>, fid: number | null): Promise<void> {
  requireCap('habeaData');
  const W = HABEA.waste;
  if (fid != null) {
    await applyAll(W.url, 'FID', { updates: [{ FID: fid, ...cols }] });
  } else {
    await applyAll(W.url, 'FID', { adds: [{ [W.fields.week]: week, Category: 'Waste', [W.fields.metric]: metric, ...cols }] });
  }
  invalidate('HABEA');
}

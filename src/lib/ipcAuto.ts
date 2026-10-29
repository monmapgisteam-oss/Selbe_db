/**
 * ГҮЙЦЭТГЭЛЭЭС IPC МӨР ҮҮСГЭХ — цэвэр логик.
 *
 * ЗАРЧИМ (хэрэглэгчийн шийдвэр 2026-09-09): «ho гүйцэтгэлийн дата гүйцэтгэл
 * бөглөгдөхөд нэмэгдэх ёстой». Гүйцэтгэл 6 шатын (`REVIEW_STAGES`; 2026-10-09
 * аудит №6 — урьд «4 шат» гэж бичигдсэн байв) хяналт дамжиж архивт
 * ормогц `HO_guitsetgel` үйлчилгээнд IPC мөр АВТОМАТААР нэмэгдэнэ.
 */
import { HO_IPC, num, pkgKeyOf } from '@/lib/services';
import { LINK_FIELDS } from '@/lib/ipcLink';
import { t as tr } from '@/lib/i18nCore';

type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/** `YYYY-MM-DD` хэлбэрийг баталгаажуулна. Танихгүй бол `null`. */
export function dayOf(day: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(day).trim());
  return m ? m[1] : null;
}

/**
 * ТУХАЙН БАГЦ · ТУХАЙН АГШНЫ автоматаар үүсгэсэн мөрийг олно.
 */
export function findAutoRow(
  rows: readonly Row[],
  pkgKey: string,
  day: string,
): Row | null {
  if (!pkgKey || !day) return null;
  return rows.find((r) => {
    if (!isAuto(r)) return false;
    if (pkgKeyOf(r[C.pkg]) !== pkgKey) return false;
    return autoDay(r) === day;
  }) ?? null;
}

/** Мөрийн ID-гийн угтвар — автоматаар үүссэн мөрийг таних цорын ганц тэмдэг */
export const AUTO_PREFIX = 'AUTO|';

/** Автоматаар үүссэн мөр мөн үү */
export const isAuto = (r: Row): boolean =>
  String(r[P.id] ?? '').startsWith(AUTO_PREFIX);

/**
 * Автомат мөрийн АГШНЫ ОГНОО — `murun_id`-гаас (`AUTO|БАГЦ33|2026-09-09`).
 */
export function autoDay(r: Row): string | null {
  const parts = String(r[P.id] ?? '').split('|');
  return parts.length >= 3 ? parts[2] : null;
}

/**
 * ТУХАЙН БАГЦЫН гэрээний кодыг БАЙГАА мөрөөс олно.
 */
export function contractCodeOf(rows: readonly Row[], pkgKey: string): string {
  return contractFor(rows, pkgKey).code;
}

/** Барилга угсралтын гэрээний `ajliin_turul` (амьдаар «Барилга угсралт» 30 мөр) */
export const CONSTRUCTION_WORK = 'Барилга угсралт';

/** Гэрээ сонгох нэр дэвшигч — `geree_kod`, `ajliin_turul`, «Гүйцэтгэл» төлбөртэй эсэх */
export type ContractCand = { code: string; workType: string; hasWork: boolean };

const isBuildWork = (s: string): boolean =>
  s.replace(/\s+/g, ' ').trim().toLowerCase().includes(CONSTRUCTION_WORK.toLowerCase());

/**
 * НЭГ БАГЦАД ОЛОН ГЭРЭЭ таарвал AUTO гүйцэтгэлийг АЛЬ гэрээнд холбох вэ (2026-10-09).
 */
export function pickContract<T extends ContractCand>(
  cands: readonly T[],
  pkgKey: string,
): { pick: T | null; warn: string | null } {
  if (!cands.length) return { pick: null, warn: null };
  if (cands.length === 1) return { pick: cands[0], warn: null };
  let left = [...cands];
  const build = left.filter((c) => isBuildWork(c.workType));
  if (build.length) left = build;
  const work = left.filter((c) => c.hasWork);
  if (work.length) left = work;
  left.sort((a, b) => a.code.localeCompare(b.code, 'mn', { numeric: true }));
  const pick = left[0];
  return {
    pick,
    warn: left.length > 1
      ? tr('«{0}» багцад {1} гэрээ ялгагдахгүй таарсан ({2}) — гүйцэтгэлийг «{3}» гэрээнд холбов. HO хүснэгтийн гэрээний код/ажлын төрлийг шалгана уу.',
        pkgKey, left.length, left.map((c) => c.code || '—').join(', '), pick.code || '—')
      : null,
  };
}

/**
 * Багцын гэрээний код + анхааруулга — ГАРААР оруулсан, кодтой мөрүүдийг кодоор бүлэглэж
 * `pickContract`-аар сонгоно. Олдохгүй бол `code: ''`.
 */
export function contractFor(rows: readonly Row[], pkgKey: string): { code: string; warn: string | null } {
  if (!pkgKey) return { code: '', warn: null };
  const by = new Map<string, ContractCand>();
  for (const r of rows) {
    if (isAuto(r)) continue;
    if (pkgKeyOf(r[C.pkg]) !== pkgKey) continue;
    const code = String(r[C.code] ?? '').trim();
    if (!code) continue;
    const c = by.get(code) ?? { code, workType: '', hasWork: false };
    if (!c.workType) c.workType = String(r[C.workType] ?? '').trim();
    if (String(r[P.kind] ?? '').trim() === HO_IPC.kinds.work) c.hasWork = true;
    by.set(code, c);
  }
  const { pick, warn } = pickContract([...by.values()], pkgKey);
  return { code: pick?.code ?? '', warn };
}

/**
 * AUTO МӨРИЙН ГЭРЭЭ — `syncIpcFromFill` ба `ipcDocLoad`-ын НЭГ эх (2026-10-09, F6).
 */
export function autoContractFor(rows: readonly Row[], pkgKey: string): { code: string; warn: string | null } {
  const base = contractFor(rows, pkgKey);
  if (!pkgKey) return base;
  let prev: { code: string; day: string } | null = null;
  for (const r of rows) {
    if (!isAuto(r) || pkgKeyOf(r[C.pkg]) !== pkgKey) continue;
    const code = String(r[C.code] ?? '').trim();
    if (!code) continue;
    const day = autoDay(r) ?? '';
    if (!prev || day > prev.day) prev = { code, day };
  }
  if (!prev || prev.code === base.code) return base;
  const p = prev;
  const manual = rows.some((r) => !isAuto(r) && pkgKeyOf(r[C.pkg]) === pkgKey && String(r[C.code] ?? '').trim() === p.code);
  if (!manual) return base;
  return {
    code: p.code,
    warn: base.warn || base.code
      ? tr('«{0}» багцад гэрээний сонголт «{1}» болох байсан ч өмнөх AUTO мөрүүд «{2}» гэрээнд байгаа тул гүйцэтгэлийг тийш үргэлжлүүлэн холбов. HO хүснэгтийг шалгана уу.', pkgKey, base.code || '—', p.code)
      : null,
  };
}

/** Автомат мөрийн ID — багц ба АГШНААР ДАВТАГДАШГҮЙ */
export const autoId = (pkgKey: string, day: string): string =>
  `${AUTO_PREFIX}${pkgKey}|${day}`;

/* ─────────────────────── БИЧИХ ХЭЛБЭР ─────────────────────── */

export type AutoIpc = {
  /** Аль багц (харагдах нэр) */
  pkg: string;
  /** Бөглөлтийн агшны огноо `YYYY-MM-DD` */
  day: string;
  /**
   * `geree_kod` — тухайн багцын БАЙГАА гэрээний код.
   */
  code: string;
  /** Σ бөглөсөн обьём — нэгж холилдсон, лавлах */
  obyem: number | null;
  /** Σ (обьём × нэгж өртөг), ₮ */
  une: number | null;
};

/**
 * ArcGIS-д НЭМЭХ шинэ мөрийн талбарууд.
 */
export function autoInsert(a: AutoIpc): Record<string, unknown> {
  const key = pkgKeyOf(a.pkg);
  const year = Number(a.day.slice(0, 4));
  return {
    [P.id]: autoId(key, a.day),
    [C.code]: a.code,
    [C.pkg]: a.pkg,
    [P.kind]: HO_IPC.kinds.work,
    [P.year]: Number.isFinite(year) ? year : null,
    [P.payDate]: a.day,
    [LINK_FIELDS.obyem]: a.obyem,
    [LINK_FIELDS.une]: a.une,
    [LINK_FIELDS.zoruu]: null,
  };
}

/** Мөрийн гэрээний код (`geree_kod`) — `ipc.groupHo`-гийн бүлэглэлтэй ИЖИЛ түлхүүр */
const codeOf = (r: Row): string => String(r[C.code] ?? '').trim();

/**
 * Төлбөрийн огноо → эрэмбийн ms. `DateOnly` (`YYYY-MM-DD` мөр) ба epoch тоо
 * хоёуланг таньна; танихгүй бол ∞ (хамгийн АРД).
 */
const payMs = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
  const d = v == null ? null : dayOf(String(v));
  const t = d ? Date.parse(d) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/**
 * ГЭРЭЭНИЙ ГҮЙЦЭТГЭЛИЙН ТӨЛБӨРИЙН ХУРИМТЛАЛ — `cur` мөрийг ОРУУЛААД.
 */
export function cumPaidThrough(rows: readonly Row[], cur: Row): number | null {
  const code = codeOf(cur);
  const work = rows.filter((r) =>
    r === cur || (r[P.kind] === HO_IPC.kinds.work && codeOf(r) === code));
  if (!work.includes(cur)) work.push(cur);
  const ord = (r: Row): number => {
    const n = num(r[P.ipcNo]);
    return n == null ? Number.POSITIVE_INFINITY : n;
  };
  const sorted = work.slice().sort((a, b) => {
    const oa = ord(a);
    const ob = ord(b);
    if (oa !== ob) return oa < ob ? -1 : 1;
    const da = payMs(a[P.payDate]);
    const db = payMs(b[P.payDate]);
    if (da !== db) return da < db ? -1 : 1;
    return 0;
  });
  let acc: number | null = null;
  for (const r of sorted) {
    const v = num(r[P.amount]);
    if (v != null) acc = (acc ?? 0) + v;
    if (r === cur) return acc;
  }
  return null;
}

/**
 * AUTO МӨРИЙН ЗӨРҮҮ = олгосон ХУРИМТЛАЛ (энэ мөр хүртэл) − `une`.
 */
export function autoZoruu(rows: readonly Row[], cur: Row, une: number | null): number | null {
  if (une == null || num(cur[P.amount]) == null) return null;
  const paid = cumPaidThrough(rows, cur);
  return paid == null ? null : paid - une;
}

/**
 * БАЙГАА автомат мөрийг ШИНЭЧЛЭХ талбарууд.
 */
export function autoUpdate(
  cur: Row,
  a: AutoIpc,
  rows: readonly Row[] = [cur],
): Record<string, unknown> {
  return {
    [HO_IPC.oid]: num(cur[HO_IPC.oid]),
    [LINK_FIELDS.obyem]: a.obyem,
    [LINK_FIELDS.une]: a.une,
    [LINK_FIELDS.zoruu]: autoZoruu(rows, cur, a.une),
  };
}

/**
 * ШИЙДВЭР: нэмэх үү, шинэчлэх үү, огт хийхгүй юу.
 */
export type AutoPlan =
  | { op: 'insert'; attrs: Record<string, unknown> }
  | { op: 'update'; attrs: Record<string, unknown> }
  | { op: 'skip'; why: 'no-data' | 'no-pkg' | 'bad-day' | 'no-code' };

export function planAuto(rows: readonly Row[], a: AutoIpc): AutoPlan {
  const key = pkgKeyOf(a.pkg);
  if (!key) return { op: 'skip', why: 'no-pkg' };
  if (!a.code) return { op: 'skip', why: 'no-code' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day)) return { op: 'skip', why: 'bad-day' };
  if (a.obyem == null && a.une == null) return { op: 'skip', why: 'no-data' };

  const cur = findAutoRow(rows, key, a.day);
  return cur
    ? { op: 'update', attrs: autoUpdate(cur, a, rows) }
    : { op: 'insert', attrs: autoInsert(a) };
}

/**
 * `syncIpcFromFill`-ийн хуудас бүрийн уншилтын төлөв:
 *   · `read`        — жааз уншигдаж обьём/үнэ нийлбэрт орсон
 *   · `missing`     — бүдүүвч уншигдаагүй / жааз олдсон ч мөргүй (түр алдаа байж болно → дахин оролдоно)
 *   · `no-obyem`    — обьёмын баганагүй хуудас (IPC-д оролцох тоо байхгүй)
 *   · `unpublished` — тэр өдөр хүртэл ОГТ нийтлэгдээгүй хуудас (жааз байхгүй)
 */
export type SheetRead = 'read' | 'missing' | 'no-obyem' | 'unpublished';

export type SheetsVerdict =
  | { go: true; warn: string | null }
  | { go: false; result: { ok: true; op: 'skip'; why: 'no-data' } | { ok: false; error: string } };

/**
 * Хуудсуудын төлвөөс IPC бичих эсэхийг шийднэ — цэвэр функц (`ipcAuto.check.mjs`).
 */
export function sheetsVerdict(xs: readonly SheetRead[]): SheetsVerdict {
  const n = xs.length;
  const cnt = (k: SheetRead): number => xs.filter((x) => x === k).length;
  const read = cnt('read');
  const missing = cnt('missing');
  const noObyem = cnt('no-obyem');
  const unpub = cnt('unpublished');
  if (!read && !missing && noObyem === n) return { go: false, result: { ok: true, op: 'skip', why: 'no-data' } };
  if (!read) {
    return {
      go: false,
      result: {
        ok: false,
        error: unpub
          ? tr('«Гүйцэтгэл бөглөх» хуудаснаас батлагдсан гүйцэтгэл уншигдсангүй — {0} хуудаснаас {1} нь энэ өдөр хүртэл огт илгээгдээгүй.', n, unpub)
          : tr('«Гүйцэтгэл бөглөх» хуудаснаас батлагдсан гүйцэтгэл уншигдсангүй'),
      },
    };
  }
  if (missing) {
    return {
      go: false,
      result: {
        ok: false,
        error: tr('Багцын {0} хуудаснаас {1} нь тэр өдөр бөглөгдөөгүй — дутуу дүнгээр гүйцэтгэл бичихгүй.', n, missing),
      },
    };
  }
  return {
    go: true,
    warn: unpub
      ? tr('Багцын {0} хуудаснаас {1} нь энэ өдөр хүртэл огт илгээгдээгүй — нэгтгэлтэй нэг дүрмээр 0 оролцоотой (IPC-ийн обьём/үнэ зөвхөн илгээгдсэн хуудаснаас).', n, unpub)
      : null,
  };
}

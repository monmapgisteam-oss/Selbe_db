/**
 * Барилгын блок бүрийн БАРИЛГА УГСРАЛТЫН АЖЛЫН гүйцэтгэл — газрын зургийн
 * өнгө, tooltip болон баруун самбарын аль алинд ижил эх сурвалж.
 *
 * ⚠️ ЭХ СУРВАЛЖ (2026-08-25-нд СОЛИГДСОН): `Bagts_*` БӨГЛӨХ ХУУДСУУД.
 * Урьд нь `Selbe_guitsetgel_consolidated` нэгтгэсэн хүснэгтээс уншдаг байв —
 * тэр нь CSV-гээр гараар шинэчлэгддэг бөгөөд 2026-07-25-нд зогссон тул
 * гүйцэтгэгчийн өдөр бүр бөглөж буй өгөгдөл дэлгэцэд ОГТ хүрэхгүй байлаа.
 * Одоо бөглөх хуудсуудаас ШУУД уншина — завсрын хүснэгтгүй.
 *
 * ⚠️ ХУУДАС нь ӨРГӨН (ажил = мөр, блок = багана `F5_1_гүйцэтгэл`), энэ модуль
 * УРТ хэлбэр хүлээдэг тул блок бүрийг тусдаа мөр болгож задлана.
 *
 * № баганын Б-ийн МӨРҮҮДИЙГ авна:
 *   «Б.»       → нийт гүйцэтгэл (Бэлтгэл ажил ОРОХГҮЙ)
 *   «Б1»…«Б5»  → дэд үе шатууд (барилгын · халаалт · ус · цахилгаан · холбоо)
 * Эх excel өөрөө дэд үе шатын жингээр бодсон дүн тул энд дахин жигнэхгүй.
 *
 * ⚠️ `Tusliin_guitsetgel_master`-т Б-ийн мөр ОГТ БАЙХГҮЙ — тэнд зөвхөн
 * «A. Бэлтгэл ажил» ба навч ажлууд байдаг тул задаргааг тэндээс авч болохгүй.
 *
 * Нүд бүрээр ХАМГИЙН СҮҮЛИЙН огноог авна: бөглөх хуудас нь өөрчилсөн нүдээ
 * л шинэ огноогоор нэмдэг тул нэг барилгын нүднүүд өөр өөр огноотой байж болно.
 */
import { TASK_SHEET, buildingKey } from './services';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { msToDay } from '@/modules/sheet/bagtsSheet';

const TS = TASK_SHEET.fields;

const t = (v: unknown) => (v == null ? '' : String(v));
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Бөглөх хуудсуудаас Б-ийн мөрүүдийг татаж УРТ хэлбэрт задална.
 *
 * ⚠️ Хуудас бүр 6 мөр × агшин × блокийн тоо — нийтдээ хэдэн мянган цэг.
 *    Навч ажлуудыг ОГТ татахгүй (1,370 мөр × 20 блок = 27 мянга) тул хүсэлт
 *    хөнгөн: 10 хуудас × 1 схем + 1 асуулга.
 */
async function fetchConstruction(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  /*
   * ⚠️ БӨГЛӨХ ХУУДСАНД № ТАЛБАР НЬ ЯЛГААТАЙ: дэд үе шат нь «Б1»…«Б5» гэж
   *    цэвэр кодтой ч НИЙТ мөр нь «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» гэсэн БҮТЭН
   *    шошготой (мөн бүлгийн мөрүүдэд «Ажил» талбар ХООСОН — нэр нь № дотор).
   *    Тиймээс нийт мөрийг ТЭНЦҮҮГЭЭР биш, LIKE-ээр барина — эс бөгөөс
   *    гүйцэтгэлийн нийт дүн олдохгүй бөгөөд блок бүр «мэдээлэлгүй» болно.
   */
  const subList = TASK_SHEET.subPhaseNos.map((n) => `N'${n.replace(/'/g, "''")}'`).join(',');

  await Promise.all(PKGS.map(async (pkg) => {
    const sc = await loadSchema(pkg).catch(() => null);
    if (!sc?.f.fillDate) return;                 // архивын багана үүсээгүй хуудас

    const cols = [sc.f.no, sc.f.work, sc.f.fillDate, ...sc.act.filter(Boolean)];
    const rows: Record<string, unknown>[] = [];
    for (let off = 0; ; ) {
      const res = await fetch(`${pkg.url}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          f: 'json',
          where: `(${sc.f.no} IN (${subList}) OR ${sc.f.no} LIKE N'Б.%')`
            + ` AND ${sc.f.fillDate} IS NOT NULL`,
          outFields: [...new Set(cols)].join(','),
          returnGeometry: 'false',
          /* ⚠️ Эрэмбэгүй хуудаслалт ArcGIS-д ТОГТВОРГҮЙ — мөр давхардах/унах
             боломжтой бөгөөд алдаа нь чимээгүй. */
          orderByFields: `${sc.f.oid} ASC`,
          resultRecordCount: '2000',
          resultOffset: String(off),
        }),
      });
      if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'ArcGIS error');
      const fsx = ((j.features || []) as { attributes: Record<string, unknown> }[])
        .map((x) => x.attributes);
      rows.push(...fsx);
      if (!j.exceededTransferLimit || !fsx.length) break;
      off += fsx.length;
    }

    /* ӨРГӨН → УРТ: блок бүр өөрийн мөр болно */
    for (const a of rows) {
      const ms = a[sc.f.fillDate];
      if (typeof ms !== 'number') continue;
      const day = msToDay(ms);
      /* «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» → «Б.»; бүлгийн нэр нь № дотор байдаг */
      const rawNo = String(a[sc.f.no] ?? '').trim();
      const no = rawNo.startsWith(TASK_SHEET.constructionNo) ? TASK_SHEET.constructionNo : rawNo;
      const work = String(a[sc.f.work] ?? '').trim() || rawNo;
      sc.bld.forEach((blk, i) => {
        const fld = sc.act[i];
        if (!fld) return;                        // тэр блокт багана үүсээгүй
        const v = a[fld];
        out.push({
          [TS.bagts]: pkg.group,
          [TS.no]: no,
          [TS.work]: work,
          [TS.date]: day,
          [TS.block]: blk,
          [TS.progress]: typeof v === 'number' && Number.isFinite(v) ? v : null,
        });
      });
    }
  }));

  return out;
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

function compute(rows: Record<string, unknown>[]): BlockProgressMap {
  /** барилга → (№ → сүүлийн мөр) */
  const win = new Map<string, Map<string, { pct: number | null; name: string; date: string }>>();
  for (const r of rows) {
    const d = t(r[TS.date]);
    if (!isValidDate(d)) continue;
    const no = t(r[TS.no]);
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const cells = win.get(k) ?? new Map();
    const prev = cells.get(no);
    // ⚠️ Нүд бүрээр сүүлийн огноо ялна; ИЖИЛ огноонд сүүлийн (их OID-той) мөр
    //    ялна — history()-ийн «нэг өдөрт хоёр бичлэг — сүүлийнх ялна» дүрэмтэй
    //    ижил, эс бөгөөс зураг/самбар нэг тоо, муруй өөр тоо заана.
    if (prev && prev.date > d) continue;
    cells.set(no, {
      pct: r[TS.progress] == null ? null : Number(r[TS.progress]) * 100,
      name: t(r[TS.work]),
      date: d,
    });
    win.set(k, cells);
  }

  const out: BlockProgressMap = new Map();
  for (const [k, cells] of win) {
    const total = cells.get(TASK_SHEET.constructionNo);
    // ⚠️ Нийт гүйцэтгэл бөглөгдөөгүй барилгыг ОРУУЛАХГҮЙ — зурагт «мэдээлэлгүй»
    //    саарлаар үлдэх ёстой, 0% гэж будвал «эхлээгүй» гэсэн ХУДАЛ мэдээлэл өгнө.
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
 *
 * ⚠️ `compute`-аас ялгаатай нь энд хуучин огноог ХАЯХГҮЙ — цуваа нь тэдгээр
 * дээр л зурагдана. `pct: null` нь нүд ЦЭВЭРЛЭГДСЭН гэсэн үг (Pivot нь хоосон
 * нүдийг null мөрөөр бичдэг) тул тэр огнооноос хойш уг блок «бөглөгдөөгүй».
 */
function history(rows: Record<string, unknown>[]): BlockHistory {
  const out: BlockHistory = new Map();
  for (const r of rows) {
    if (t(r[TS.no]) !== TASK_SHEET.constructionNo) continue;
    const d = t(r[TS.date]);
    if (!isValidDate(d)) continue;
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const arr = out.get(k) ?? [];
    const pct = r[TS.progress] == null ? null : Number(r[TS.progress]) * 100;
    const prev = arr.find((p) => p.date === d);
    if (prev) prev.pct = pct; // нэг өдөрт хоёр бичлэг — сүүлийнх ялна
    else arr.push({ date: d, pct });
    out.set(k, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export type SeriesPoint = {
  /** Шошго — «2026-07-20» эсвэл «2026-07» */
  label: string;
  /** Тухайн үеийн бодит агшин (as-of огноо) */
  date: string;
  /** Хамрах хүрээний БҮХ блокийн дундаж гүйцэтгэл, 0–100 (бөглөгдөөгүй = 0%) */
  overall: number;
  /** Тухайн үед бөглөгдсөн байсан блокийн тоо (хуваарь нь БИШ — tooltip-д) */
  blocks: number;
};

/** «YYYY-MM-DD» → «YYYY-MM» */
const monthOf = (d: string) => d.slice(0, 7);

/**
 * As-of цуваа: огноо бүрд хамрах хүрээний БҮХ блокийн дундаж.
 *
 * ⚠️ ХУВААРЬ ТОГТМОЛ — `keys`-ийн тоо. Урьд нь зөвхөн бөглөгдсөн блокоор
 * дундажлаж байсан: шинэ багц бөглөгдөх бүрд хуваарь өсөж, муруй БУУДАГ байв
 * (11.2% → 7.9%, 32 → 88 блок). Барилга угсралт буудаггүй тул тэр хонхор нь
 * «ажил ухарсан» гэж уншигдана. Бөглөгдөөгүй блокийг 0% гэж тоолох нь БОДИТ:
 * тайлан ирээгүй барилга тэр үед үнэхээр ~0% байсан. Ингэснээр:
 *   · блок бүрийн утга өсөх (`peak`) + хуваарь тогтмол ⇒ муруй БУУХГҮЙ
 *   · сүүлийн цэг нь хуудасны нийт дундажтай ЯГ таарна (бүх блок бөглөгдсөн үед)
 *
 * `keys` — зөвхөн эдгээр блокоор (газрын зургийн давхаргад БАЙГАА блокууд).
 */
export function progressSeries(
  hist: BlockHistory,
  keys: Iterable<string>,
  grain: 'day' | 'month',
): SeriesPoint[] {
  const keyList = [...keys];
  const mine = keyList.map((k) => hist.get(k)).filter((h): h is HistoryPoint[] => h != null);
  const dates = [...new Set(mine.flatMap((h) => h.map((p) => p.date)))].sort();
  if (!dates.length) return [];

  /**
   * Нэг блокийн тухайн агшны гүйцэтгэл — бүртгэсэн утгуудын ХАМГИЙН ИХ нь.
   *
   * ⚠️ Барилга угсралт БУУДАГГҮЙ: «50 → 10 → 15» гэсэн цуваа нь ажил ухарсан
   * биш, тайлан дутуу/хоосон бөглөгдсөн (`pct: null` = нүд цэвэрлэгдсэн) эсвэл
   * бичлэгийн алдаа. Тиймээс хамгийн сүүлийн бичлэгийг АВАЛГҮЙ, өссөн дүнг
   * (running max) хэрэглэнэ — эс бөгөөс муруй хиймэл хонхор гаргана.
   */
  const peak = (h: HistoryPoint[], asOf: string) => {
    let v: number | null = null;
    for (const p of h) {
      if (p.date > asOf) break;
      if (p.pct != null && (v == null || p.pct > v)) v = p.pct;
    }
    return v;
  };

  const at = (asOf: string) => {
    let sum = 0, n = 0;
    for (const h of mine) {
      const v = peak(h, asOf);
      if (v != null) { sum += v; n += 1; }
    }
    return { date: asOf, overall: keyList.length ? sum / keyList.length : 0, blocks: n };
  };

  /** Бүртгэлгүй агшин — 0% гэж зурвал байхгүй хэмжилт «ухралт» мэт харагдана */
  const measured = (p: SeriesPoint) => p.blocks > 0;

  if (grain === 'day') return dates.map((d) => ({ label: d, ...at(d) })).filter(measured);

  /**
   * Сар бүрийн ЭЦСИЙН байдал — ГЭХДЭЭ бүртгэлгүй сарыг АЛГАСНА.
   *
   * ⚠️ Урьд нь тайлан ирээгүй сар өмнөх агшныг ДАВТАЖ цэг болдог байв: муруй
   * дээр 3-4 ижил цэг дараалж, «хэмжсэн» мэт харагдана. Одоо сар нь ШИНЭ
   * тайлантай (өмнөхөөсөө өөр agшин) байвал л цэг болно.
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

/** Нэг удаа тооцоод хадгална; алдаа гарвал дараагийн дуудалт ДАХИН оролдоно. */
function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn().catch((e) => { p = null; throw e; }));
}

/* ── localStorage кэш (stale-while-revalidate) ── */

/**
 * Амьд татаж дуустал (~7с, 2000+ мөр хуудаслана) газрын зургийн 113 блок
 * СААРАЛ харагддаг байв. Сүүлийн амжилттай ТООЦООЛСОН дүнг (113 бичлэг —
 * түүхий мөр биш, жижиг) localStorage-д хадгалж, дараагийн нээлтэд шууд будна;
 * амьд дүн ирмэгц дарж шинэчилнэ.
 *
 * ⚠️ «Хуучин тоо дэлгэцэд үлдэхгүй» зарчимтай нийцүүлнэ: кэш нь зөвхөн амьд
 * хүсэлт ЯВЖ БАЙХ хооронд харагдана. Хүсэлт АЛДВАЛ дуудагч (MapCanvas) кэшийг
 * хаяж, саарал «мэдээлэлгүй» төлөвт буцаана — TTL-ээр давхар хамгаална.
 */
const CACHE_KEY = 'selbe-blockprog-v1';
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
const loadRows = memo(fetchConstruction);

/** Блок бүрийн барилга угсралтын гүйцэтгэл (0–100). */
export const loadBlockProgress: () => Promise<BlockProgressMap> = memo(() =>
  loadRows().then(compute).then((m) => { saveCache(m); return m; }));

/** Блок бүрийн «Б.» мөрийн бүх огноо — цаг хугацааны цувааны эх. */
export const loadBlockHistory: () => Promise<BlockHistory> = memo(() =>
  loadRows().then(history));

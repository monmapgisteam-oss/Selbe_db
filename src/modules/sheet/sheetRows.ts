/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» ХУУДСУУДЫН НЭГДСЭН УНШИГЧ — өргөн хэлбэрийг УРТ болгоно.
 */
import { PKGS, loadSchema, SYNTHETIC_BLOCK, type Pkg, type Schema } from './bagts.pkg';
import { msToDay, normDayMs } from './bagtsSheet';
import { levelFromNo } from './ags';
import { TREES } from './bagts.trees';
import { TASK_SHEET, bagtsKey, buildingKey, normalizeTaskNo, constructionWhere } from '@/lib/services';
import { arcgisPost, isRateLimit } from '@/lib/query';

/** Урт хэлбэрийн НЭГ мөр — нэг ажлын, нэг блокийн, нэг агшны бүртгэл. */
export type SheetRow = {
  /** Багцын нэр — `Pkg.group` («Багц 4-1») */
  bagts: string;
  /** Блокийн код — «5/1». «5/1 барилга» гэсэн үг ЗАЛГАХГҮЙ */
  block: string;
  /** Агшны огноо, `YYYY-MM-DD` */
  date: string;
  /** № — «Б.», «Б1», «3.2», «7» */
  no: string;
  /** Ажлын нэр. Бүлгийн мөрд хоосон байвал №-ийг нь тавина */
  work: string;
  /** Шатлал 1–5 (5 = навч). №-ээс гаргасан тул `null` байж болно */
  level: number | null;
  /** Хувийн жин — түвшин гаргахад ба жигнэхэд */
  weight: number | null;
  /** Гүйцэтгэл 0–1 (ХУВЬ БИШ). Бөглөөгүй нүд `null` */
  progress: number | null;
  /**
   * ХУВААРЬ — тухайн блокийн эхлэх/дуусах (ms epoch). `withDates` сонголттой
   * үед л дүүрнэ, эс бөгөөс `null`.
   */
  start: number | null;
  end: number | null;
  /**
   * Хуудсан дахь МӨРИЙН ДАРААЛАЛ (ObjectID). Толгой↔навч харьцааг зөвхөн
   * дараалал заадаг тул хэсэг/үе шат стампалахад ЗААВАЛ хэрэгтэй.
   */
  ord: number;
  /** Эх хуудасны түлхүүр (`Pkg.key`) — «b1_9f». Багц бүр 1–2 хуудастай. */
  sheet: string;
  /**
   * НИЙТЛЭЛТИЙН ХУУЛБАРЫН дугаар (0-оос эхэлнэ).
   *
   * Хуулбарын зааг: жаазны ЭХНИЙ № дахин тааралдах мөр.
   */
  snap: number;
};

export type SheetRowOpts = {
  /** Зөвхөн энэ багцын хуудсуудыг татна («Багц 1»). `bagtsKey`-ээр жишнэ. */
  group?: string | null;
  /** Зөвхөн энэ блокийн БАГАНЫГ татна («5/1») — хүсэлт хамаагүй хөнгөн болно. */
  block?: string | null;
  /**
   * Зөвхөн `Б.` ба `Б1…Б5` мөр. Газрын зургийн гүйцэтгэлд ЭНЭ хэрэгтэй:
   * навч ажлууд (1,370 мөр × 20 блок = 27 мянган цэг) огт татагдахгүй.
   */
  constructionOnly?: boolean;
  /** Энэ түвшнээс ДЭЭШ мөрийг хаяна (`useBagtsWorks` нь 1–4-ийг хүсдэг) */
  maxLevel?: number;
  /**
   * Блокийн ХУВААРИЙН огноог (эхлэх/дуусах) ч татна.
   */
  withDates?: boolean;
  /**
   * БЛОКГҮЙ БАГЦУУД (5.x · 6.x · 7.1 · 10) — ЗӨВХӨН эдгээрийг, «Гүйцэтгэл бөглөх»-ийн бүдүүвчээр
   * (`loadSchema(pkg, { fill: true })` — синтетик НЭГ блок `SYNTHETIC_BLOCK`, гүйцэтгэл =
   * `Ажил_гүйцэтгэл`) уншина.
   */
  blockless?: boolean;
};

/** `'` тэмдэгтийг SQL-д аюулгүй болгоно */
const esc = (v: string) => v.replace(/'/g, "''");

const nOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Нэг хуудасны хүсэлт — хязгаарлагчийн ДОТОР, rate-limit дээр дахин оролдоно. */
function onePage(url: string, params: Record<string, string>) {
  return arcgisPost<{
    features?: { attributes: Record<string, unknown> }[];
    exceededTransferLimit?: boolean;
  }>(`${url}/query`, params);
}

/**
 * Дахин оролдвол арилж болох (ТҮР) алдаа мөн үү — rate-limit, HTTP 429/5xx,
 * биеийн `{error:{code:5xx}}`, сүлжээний тасалдал (`fetch`-ийн TypeError),
 * JSON биш (proxy/CDN-ийн HTML) хариу.
 */
const isTransient = (e: unknown): boolean => {
  if (e instanceof TypeError) return true;
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'number' && (code === 429 || code >= 500)) return true;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return isRateLimit(msg) || /(?:ArcGIS )?HTTP (429|5\d\d)/.test(msg) || /JSON/.test(msg);
};

/**
 * Хуудасны СХЕМ — хязгаарлагчийн ДОТОР, түр алдаанд ДАХИН ОРОЛДОНО (`onePage`-тэй ижил).
 *
 * Дүрэм:
 *   · ТҮР алдаа (`isTransient`) → хүлээгээд дахин; RETRIES-ийн дараа ч унавал
 *     ШИДНЭ — дуудагчийн memo/кэш дутуу үр дүнг хадгалахгүй (алдааг кэшлэдэггүй),
 *     дараагийн ачаалалт дахин оролдоно;
 *   · ТОГТВОРТОЙ алдаа (эрхгүй, токен, үйлчилгээ алга) → `null`, өмнөх шигээ
 *     алгасна: тэр хэрэглэгчид ҮРГЭЛЖ ижил хариу тул нэг хаалттай хуудас
 *     БҮХ дашбоардыг унагах ёсгүй.
 */
async function schemaOf(pkg: Pkg, fill = false): Promise<Schema | null> {
  const RETRIES = 4;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await loadSchema(pkg, fill ? { fill: true } : {});
    } catch (e) {
      if (!isTransient(e)) return null;
      if (attempt >= RETRIES) throw e;
    }
    await sleep(400 * 2 ** attempt + Math.random() * 200);
  }
}

/**
 * Нэг хуудсыг БҮРЭН татна (2000 мөрийн хязгаарыг хуудаслаж давна).
 */
async function fetchPage(
  url: string,
  where: string,
  outFields: string[],
  orderBy: string,
  /** ЗӨВХӨН ялгаатай утгууд — огнооны жагсаалт мэт нэгдмэл асуулгад. */
  distinct = false,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let off = 0; ; ) {
    const j = await onePage(url, {
      where,
      outFields: [...new Set(outFields)].join(','),
      returnGeometry: 'false',
      orderByFields: orderBy,
      resultRecordCount: '2000',
      resultOffset: String(off),
      ...(distinct ? { returnDistinctValues: 'true' } : {}),
    });
    const rows = (j.features || []).map((x) => x.attributes);
    out.push(...rows);
    if (!j.exceededTransferLimit || !rows.length) break;
    off += rows.length;
  }
  return out;
}

/**
 * ТАСАРСАН ХУУЛБАРУУД (2026-10-12, A8) — цэвэр. `lens[k]` = k-р хуулбарын (хоосон биш) мөрийн тоо, хуудасны дарааллаар.
 * Өмнөх ҮЛДСЭН хуулбараас БОГИНО хуулбар = тасарсан/бичигдэж буй (`bagtsSheet.lastFrame`: мөр зөвхөн нэмэгддэг) —
 * ГЭХДЭЭ зөвхөн СҮҮЛИЙН хуулбар эсвэл ДАРААГИЙН хуулбар нь өөрөөсөө урт (бүтэн жааз дахин бичигдсэн) үед.
 */
export function truncatedSnaps(lens: readonly number[]): Set<number> {
  const drop = new Set<number>();
  let prev = 0;
  let last = -1;
  lens.forEach((n, k) => { if (n > 0) last = k; });
  lens.forEach((n, k) => {
    if (n <= 0) return;
    let next = 0;
    for (let j = k + 1; j < lens.length && !next; j += 1) next = lens[j] > 0 ? lens[j] : 0;
    if (n < prev && (k === last || next > n)) drop.add(k);
    else prev = n;
  });
  return drop;
}

/**
 * Бөглөх хуудсуудаас УРТ хэлбэрийн мөрүүд.
 *
 * Буцаах дараалал: хуудас бүрийн дотор ObjectID ӨСӨХ (`ord`). Дуудагч тал
 * огноогоор эрэмбэлэх шаардлагатай бол өөрөө хийнэ — хуудасны дараалал нь
 * толгой↔навч харьцааг үүрдэг тул ЭНД алдагдуулж болохгүй.
 */
export async function loadSheetRows(opts: SheetRowOpts = {}): Promise<SheetRow[]> {
  const {
    group = null, block = null, constructionOnly = false, maxLevel, withDates = false, blockless = false,
  } = opts;

  const wanted: Pkg[] = (group
    ? PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(group))
    : PKGS)
    .filter((p) => !blockless || p.floors == null);
  if (!wanted.length) return [];

  const subList = TASK_SHEET.subPhaseNos.map((n) => `N'${esc(n)}'`).join(',');
  const out: SheetRow[] = [];

  await Promise.all(wanted.map(async (pkg) => {
    const sc = await schemaOf(pkg, blockless);
    if (blockless && !sc?.synthetic) return;
    // Архивын багана үүсээгүй хуудсыг алгасна — агшин ялгах түлхүүргүй тул
    // түүх байгуулах боломжгүй (одоогийн утгыг ч огноогүйгээр хэрэглэхгүй).
    if (!sc?.f.fillDate) return;

    /* ── Аль блокийн багануудыг татах вэ ── */
    let idx: number[] = sc.bld.map((_, i) => i);
    if (block) {
      const want = String(block).trim();
      idx = idx.filter((i) => sc.bld[i] === want);
      if (!idx.length) return;               // энэ хуудсанд тэр блок алга
    }
    const actCols = idx.map((i) => sc.act[i]).filter(Boolean);
    if (!actCols.length) return;
    /* Хуваарийн багана — зөвхөн хүссэн үед (`withDates`) */
    const dateCols: string[] = withDates
      ? [...idx.map((i) => sc.start[i]), ...idx.map((i) => sc.end[i])]
        .filter((x): x is string => !!x)
      : [];

    const where = constructionOnly
      ? `(${sc.f.no} IN (${subList}) OR ${constructionWhere(sc.f.no)})`
        + ` AND ${sc.f.fillDate} IS NOT NULL`
      : `${sc.f.fillDate} IS NOT NULL`;

    const gunF = !constructionOnly && sc.f.gun ? sc.f.gun : null;
    const rows = await fetchPage(
      pkg.url,
      where,
      [sc.f.no, sc.f.work, sc.f.wC, sc.f.fillDate, sc.f.oid, ...actCols, ...dateCols, ...(gunF ? [gunF] : [])],
      `${sc.f.oid} ASC`,
    );

    /* ── ӨРГӨН → УРТ ── */
    /* 1-р алхам: хуулбарын дугаар ба нормчилсон № — хуудасны дарааллаар. */
    type Rec = {
      a: Record<string, unknown>; date: string; rawNo: string; no: string;
      snap: number; weight: number | null; gun: number | null; level: number | null;
    };
    const recs: Rec[] = [];
    let snapN = 0;
    let firstNo: string | null = null;
    for (const a of rows) {
      const ms = a[sc.f.fillDate];
      if (typeof ms !== 'number') continue;
      const date = msToDay(normDayMs(ms));

      const rawNo = String(a[sc.f.no] ?? '').trim();
      /* «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» → «Б.»; бүлгийн нэр нь № дотор байдаг.
       */
      const no = normalizeTaskNo(rawNo);
      if (firstNo == null) firstNo = rawNo;
      else if (rawNo === firstNo) snapN += 1;

      recs.push({
        a, date, rawNo, no, snap: snapN,
        weight: nOrNull(a[sc.f.wC]),
        gun: gunF ? nOrNull(a[gunF]) : null,
        level: null,
      });
    }

    {
      const lens: number[] = new Array(snapN + 1).fill(0);
      for (const r of recs) if (r.rawNo || String(r.a[sc.f.work] ?? '').trim()) lens[r.snap] += 1;
      const drop = truncatedSnaps(lens);
      if (drop.size) {
        console.warn(`[selbe] ${pkg.key}: тасарсан ${drop.size} хуулбарыг гүйцэтгэлийн уншилтаас хасав (${[...drop].map((k) => lens[k]).join(', ')} мөр)`);
        let w = 0;
        for (const r of recs) if (!drop.has(r.snap)) recs[w++] = r;
        recs.length = w;
      }
    }

    /*
     * 2-р алхам: ТҮВШИН — АРААС НЬ (дараагийн мөрийн ШИЙДСЭН түвшин хэрэгтэй).
     */
    const tree = TREES[pkg.key] ?? '';
    const depth: (number | null)[] = new Array(recs.length).fill(null);
    for (let s0 = 0; s0 < recs.length; ) {
      let s1 = s0 + 1;
      while (s1 < recs.length && recs[s1].snap === recs[s0].snap) s1 += 1;
      const seg = recs.slice(s0, s1);
      if (gunF && seg.every((r) => r.gun != null)) {
        seg.forEach((r, j) => { depth[s0 + j] = r.gun; });
      } else if (tree.length === seg.length) {
        for (let j = 0; j < seg.length; j += 1) {
          const ch = tree[j];
          depth[s0 + j] = ch >= 'A' && ch <= 'E' ? ch.charCodeAt(0) - 65 : Number(ch);
        }
      }
      s0 = s1;
    }
    for (let k = recs.length - 1; k >= 0; k -= 1) {
      const r = recs[k];
      const nx = k + 1 < recs.length && recs[k + 1].snap === r.snap ? recs[k + 1] : null;
      const d0 = depth[k];
      const d1 = nx ? depth[k + 1] : null;
      const deeper = nx == null
        ? false
        : d0 != null && d1 != null
          ? d1 > d0
          : (nx.level ?? 0) > 3;
      /* `constructionOnly` үед дараагийн татсан мөр жинхэнэ дараагийн мөр БИШ */
      r.level = levelFromNo(r.no, r.weight, constructionOnly ? undefined : deeper);
    }

    /* 3-р алхам: мөр бүрийг блокоор задална. */
    for (const { a, date, rawNo, no, snap, weight, level } of recs) {
      if (maxLevel != null && (level == null || level > maxLevel)) continue;

      const work = String(a[sc.f.work] ?? '').trim() || rawNo;
      const ord = Number(a[sc.f.oid]) || 0;

      for (const i of idx) {
        const fld = sc.act[i];
        if (!fld) continue;                  // тэр блокт багана үүсээгүй
        out.push({
          bagts: pkg.group,
          block: sc.bld[i],
          date,
          sheet: pkg.key,
          snap,
          no,
          work,
          level,
          weight,
          progress: (() => { const v = nOrNull(a[fld]); return v == null ? null : Math.min(1, v); })(),
          start: withDates && sc.start[i] ? normDayMs(nOrNull(a[sc.start[i] as string])) : null,
          end: withDates && sc.end[i] ? normDayMs(nOrNull(a[sc.end[i] as string])) : null,
          ord,
        });
      }
    }
  }));

  return out;
}

/**
 * БАГЦ БҮРИЙН БЛОКИЙН ХУВААРЬ (universe) — бөглөх хуудсуудын бүдүүвчид (`sc.bld`)
 * бүртгэлтэй блокууд: `bagtsKey(pkg.group)` → `buildingKey(pkg.group, блок)`[].
 */
export async function sheetBlockKeys(): Promise<Map<string, string[]>> {
  const acc = new Map<string, Set<string>>();
  const found = await Promise.all(PKGS.map(async (pkg) => {
    const sc = await schemaOf(pkg);
    if (!sc?.f.fillDate) return null;
    const keys = sc.bld.filter((_, i) => !!sc.act[i]).map((b) => buildingKey(pkg.group, b));
    return keys.length ? { k: bagtsKey(pkg.group), keys } : null;
  }));
  for (const x of found) {
    if (!x) continue;
    const s = acc.get(x.k) ?? new Set<string>();
    x.keys.forEach((k) => s.add(k));
    acc.set(x.k, s);
  }
  return new Map([...acc].map(([k, s]) => [k, [...s]]));
}

/**
 * БЛОКГҮЙ БАГЦЫН ХУВААРЬ — `bagtsKey` → [`buildingKey(group, SYNTHETIC_BLOCK)`].
 */
export async function sheetBlocklessKeys(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  await Promise.all(PKGS.filter((p) => p.floors == null).map(async (pkg) => {
    const sc = await schemaOf(pkg, true);
    if (!sc?.synthetic || !sc.f.fillDate || !sc.act[0]) return;
    out.set(bagtsKey(pkg.group), [buildingKey(pkg.group, SYNTHETIC_BLOCK)]);
  }));
  return out;
}

/**
 * Хуудсуудад бүртгэгдсэн БҮХ АГШНЫ ОГНОО (`YYYY-MM-DD`, өсөх дараалал).
 */
export async function sheetDates(): Promise<string[]> {
  const days = new Set<string>();
  await Promise.all(PKGS.map(async (pkg) => {
    const sc = await loadSchema(pkg).catch(() => null);
    if (!sc?.f.fillDate) return;
    const rows = await fetchPage(
      pkg.url,
      `${sc.f.fillDate} IS NOT NULL`,
      [sc.f.fillDate],
      `${sc.f.fillDate} ASC`,
      true,
    ).catch(() => []);
    for (const a of rows) {
      const ms = a[sc.f.fillDate as string];
      if (typeof ms === 'number') days.add(msToDay(normDayMs(ms)));
    }
  }));
  return [...days].sort();
}

/**
 * Хуудсуудад бүртгэлтэй БАГЦЫН НЭРС.
 */
export const sheetBagtsNames = (): string[] => [...new Set(PKGS.map((p) => p.group))];

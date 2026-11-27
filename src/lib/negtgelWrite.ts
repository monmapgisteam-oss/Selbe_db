'use client';

/**
 * БАТЛАГДСАН ГҮЙЦЭТГЭЛИЙГ НЭГТГЭЛД БҮРТГЭХ.
 *
 * Зургаан шатны хяналт (гүйцэтгэгч → инженер → багцын ахлах инженер → ерөнхий
 * менежер → хэлтсийн дарга → газрын дарга; `REVIEW_STAGES`, 2026-10-09 аудит №6 —
 * урьд «дөрвөн шат» гэж бичигдсэн байв) БҮГД өнгөрсний ДАРАА л энэ бүртгэл үүснэ. Өөрөөр хэлбэл
 * `selbe_bagts_guitsetgel_negtgel` нь «хэн нэгний бөглөсөн зүйл» биш,
 * БАТЛАГДСАН баримт.
 */

import { requireWriter } from './writeGuard';
import { t as tr } from './i18nCore';
import { agsFetch } from '@/modules/sheet/ags';
import { BAGTS_NEGTGEL, bagtsKey, buildingKey, canonPkg, constructionWhere } from './services';
import { invalidate } from './dataBus';
import { PKGS, loadSchema, fillSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows, msToDay } from '@/modules/sheet/bagtsSheet';
import {
  uniqueBlockCounts, constructionObyem, sumObyemParts, obyemFields, weightedBlockMean, loadBlockWeights, cachedBlockWeights, type ObyemPair,
} from './blockProgress';

const F = BAGTS_NEGTGEL.fields;

/**
 * ArcGIS алдааг HTTP 200-аар буцаадаг — биен доторх `error`-ыг ЗААВАЛ шалгана.
 */
async function post(url: string, body: Record<string, string>) {
  return (await agsFetch(url, body)) as Record<string, unknown>;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Бөглөх хуудасны 0–1 бутархайг нэгтгэлийн 0–100 хувь болгоно.
 */
const toPct = (v: number | null): number | null => (v == null ? null : v * 100);

/** Огноог ArcGIS-ийн SQL хэлбэрт — түүхий epoch тоо энэ үйлчилгээнд унадаг */
const ts = (ms: number) =>
  `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

const DAY = 86_400_000;

/**
 * Агшны ӨДРИЙН МУЖ `[эхлэл, төгсгөл)` — ms.
 */
export const dayRange = (ms: number): [number, number] => {
  const d = Math.round(ms / DAY) * DAY;
  return [d - DAY / 2, d + DAY / 2];
};
const dayWhere = (fld: string, ms: number) => {
  const [a, b] = dayRange(ms);
  return `${fld} >= ${ts(a)} AND ${fld} < ${ts(b)}`;
};

/**
 * Хуудсуудын «Б.» гүйцэтгэлийн БЛОКИЙН ТООГООР жигнэсэн дундаж (0–1).
 */
export const blendBlocks = (xs: { n: number; v: number | null }[]): number | null => {
  let s = 0;
  let d = 0;
  for (const x of xs) {
    if (x.v == null) return null;
    const w = x.n > 0 ? x.n : 1;
    s += x.v * w;
    d += w;
  }
  return d > 0 ? s / d : null;
};

/**
 * ХУУДСУУДЫН «Б.»-г ДАВХАРДАЛГҮЙ блокийн жингээр нийлүүлнэ (0–1) — `summaryOf` ·
 * `comparablePct`-ийн ЦЭВЭР хэсэг (сүлжээгүй, `negtgel.check` тулгана).
 */
export const blendSheets = (xs: { bld: readonly string[]; v: number | null }[]): number | null => {
  if (!xs.length) return null;
  const w = uniqueBlockCounts(xs.map((x) => x.bld));
  const kept = xs.map((x, i) => ({ n: w[i], v: x.v })).filter((x) => x.n > 0);
  if (kept.length < 2) return (kept[0] ?? xs[0]).v;
  return blendBlocks(kept);
};

/**
 * БЛОКГҮЙ БАГЦ уу (5.x · 6.x · 10 — бүх хуудас нь `floors: null`)?
 */
export const isBlocklessBagts = (bagts: string): boolean => {
  const g = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
  return g.length > 0 && g.every((p) => p.floors == null);
};

type Pkg = (typeof PKGS)[number];
type Schema = NonNullable<Awaited<ReturnType<typeof loadSchema>>>;
/**
 * Нэг `sheetOid`-д таарсан хуудас — `fill` нь тухайн хуудасны огнооны багана,
 * `no` нь тэр мөрийн «№» (жаазны эхлэлийг танихад).
 */
type Hit = { p: Pkg; sc: Schema; at: number; fill: string; no: string };

/**
 * Хэд хэдэн хуудас нэг `sheetOid`-д таарвал ЖИНХЭНЭ эхийг ялгана.
 */
async function frameHead(h: Hit, sheetOid: number): Promise<boolean> {
  const q = (await post(`${h.p.url}/query`, {
    where: `${h.fill} = ${ts(h.at)}`,
    outFields: `${h.sc.f.oid},${h.sc.f.no}`,
    returnGeometry: 'false',
    orderByFields: `${h.sc.f.oid} ASC`,
    resultRecordCount: '1',
  })) as { features?: { attributes: Record<string, unknown> }[] };
  const first = q.features?.[0]?.attributes;
  if (!first) return false;
  if (num(first[h.sc.f.oid]) === sheetOid) return true;
  const headNo = String(first[h.sc.f.no] ?? '').trim();
  return headNo !== '' && headNo === h.no;
}

/**
 * «Б.» мөрийн нэгдсэн утгууд — хуудасны өөрийн хэмжээсээр (гүйцэтгэл 0–1).
 */
export type BRow = {
  act: number | null; plan: number | null; at: number | null;
  /** 2026-11-27 (аудит №23): «Б.» мөрийн БЛОК бүрийн гүйцэтгэл/төлөвлөгөө (0–1, `sc.bld`-ийн индексээр; талбаргүй = `null`) */
  acts?: (number | null)[]; plans?: (number | null)[];
  /** 2026-11-27 (аудит №2, №3): «Б.» мөрийн OBJECTID — тэр жаазыг агшнаас хасахад (`summaryAtDate`-ийн `skip`) */
  oid?: number | null;
};

/** Хуудасны нэг хэсэг — `blendBudget`-ийн оролт: блокийн шошго, `act` талбартай эсэх, блок бүрийн утга, жаазны огноо */
export type BudgetPart = { bld: readonly string[]; has: readonly boolean[]; v: readonly (number | null)[] | null; at: number | null };

/**
 * ХУУДСУУДЫН «Б.» МӨРИЙН БЛОКУУДЫГ ТӨСВӨӨР ЖИГНЭНЭ (0–1, цэвэр, 2026-11-27 аудит №23) — `blockProgress.pkgProgressOf`-ийн
 * дүрэм (`weightedBlockMean`): түлхүүр = `buildingKey(group, блок)` (`act` талбартай блок л — `sheetBlockKeys`), давхардсан
 * блок (4-2: 6/x) — утгатай хуудсуудаас хамгийн сүүлийн огнооных (`winnerOf`), тайлагнаагүй = 0, жин = блокийн төсөв.
 * Урьд нь хуудсын «Б.» (блокуудын энгийн дундаж)-ийг блокийн тоогоор жигнэдэг байв (`blendSheets`). Түлхүүргүй бол `null`.
 */
export function blendBudget(
  group: string,
  xs: readonly BudgetPart[],
  weights: ReadonlyMap<string, number> | null,
): number | null {
  const win = new Map<string, { v: number | null; at: number }>();
  for (const x of xs) {
    x.bld.forEach((b, i) => {
      if (!x.has[i] || !b) return;
      const k = buildingKey(group, b);
      const raw = x.v?.[i];
      const v = raw != null && Number.isFinite(raw) ? raw : null;
      const at = x.at ?? -Infinity;
      const p = win.get(k);
      if (!p || (p.v == null && v != null) || (v != null && at > p.at) || (p.v == null && v == null && at > p.at)) win.set(k, { v, at });
    });
  }
  if (!win.size) return null;
  return weightedBlockMean(new Map([...win].map(([k, w]) => [k, w.v])), weights);
}

/**
 * Нэг хуудасны обьём — `at` агшны (өдрийн сүүлийн бүтэн жааз, `loadRows`-ийн `dayFilter` · `lastFrame` — хянагчийн
 * харагдацтай нэг зам) навч мөрүүдээс (`constructionObyem`). `at == null` (тэр хүртэл нийтлэгдээгүй хуудас) бол
 * одоогийн (суурь) жааз — төлөвлөгөөт обьём нь багцын дүнд орно, бодит нь `null`.
 * `beforeOid` (2026-11-27, аудит №3) — тэр өдрийн OBJECTID < энэ мөрүүдээс (ижил өдрийн хасагдсан жаазаас ӨМНӨХ жааз).
 */
export async function sheetObyem(p: Pkg, at: number | null, beforeOid?: number | null): Promise<ObyemPair | null> {
  try {
    const fsc = await fillSchema(p);
    const { rows } = await loadRows(p, fsc, at == null ? undefined : msToDay(at), obyemFields(fsc),
      at != null && beforeOid != null ? { beforeOid } : undefined);
    return constructionObyem(rows, fsc.obyem);
  } catch (e) {
    console.warn(`[selbe] нэгтгэлийн обьём: ${p.label} — бөглөх хуудас уншигдсангүй, обьём бичихгүй`, e);
    return null;
  }
}

/**
 * Нэг хуудасны «Б.» мөр — `dateWhere`-д таарах ХАМГИЙН СҮҮЛИЙН жаазнаас.
 */
export async function bRowOf(p: Pkg, sc: Schema, fill: string, dateWhere: string): Promise<BRow | null> {
  const cols = [sc.f.oid, sc.f.no, sc.f.act, sc.f.plan, fill, ...sc.act, ...sc.plan]
    .filter(Boolean) as string[];
  const q = (await post(`${p.url}/query`, {
    where: `${dateWhere} AND ${constructionWhere(sc.f.no)}`,
    outFields: [...new Set(cols)].join(','),
    returnGeometry: 'false',
    orderByFields: `${fill} DESC,${sc.f.oid} DESC`,
    resultRecordCount: '1',
  })) as { features?: { attributes: Record<string, unknown> }[] };
  const a = q.features?.[0]?.attributes;
  if (!a) return null;
  return {
    act: num(a[sc.f.act]),
    plan: num(a[sc.f.plan]),
    at: num(a[fill]),
    acts: sc.bld.map((_, i) => (sc.act[i] ? num(a[sc.act[i]]) : null)),
    plans: sc.bld.map((_, i) => (sc.plan[i] ? num(a[sc.plan[i]]) : null)),
    oid: num(a[sc.f.oid]),
  };
}

/** Багцын хуудсуудын «Б.»-г нэг дүнд — блоктой багцад төсвөөр (`blendBudget`), блокгүйд урьдын блокийн тоогоор (`blendSheets`) */
function blendParts(
  parts: readonly { r: BRow; sc: Schema; p: Pkg }[],
  pick: 'act' | 'plan',
  weights: ReadonlyMap<string, number> | null,
): number | null {
  if (!parts.length) return null;
  const v = (r: BRow) => (pick === 'act' ? r.act : r.plan);
  if (parts.every((x) => x.sc.synthetic || !x.sc.bld.length))
    return parts.length === 1 ? v(parts[0].r) : blendSheets(parts.map((x) => ({ bld: x.sc.bld, v: v(x.r) })));
  const group = parts[0].p.group;
  const keysOf = (x: { sc: Schema }) => x.sc.bld.filter((b, i) => !!b && !!x.sc.act[i]).map((b) => buildingKey(group, b));
  /* урьдын дүрэм: «Б.»-ийн дүн нь мэдэгдэхгүй (null) хуудас өөрийн (бусад хуудсанд утгагүй) блоктой бол нийт дүн мэдэгдэхгүй
     (0 БИШ); блок нь бүгд өөр хуудсанд утгатай бол (4-2-ийн 12F) нөлөөлөхгүй */
  const okKeys = new Set(parts.filter((x) => v(x.r) != null).flatMap(keysOf));
  if (parts.some((x) => v(x.r) == null && keysOf(x).some((k) => !okKeys.has(k)))) return null;
  return blendBudget(group, parts.map((x) => ({
    bld: x.sc.bld,
    has: x.sc.bld.map((_, i) => !!x.sc.act[i]),
    v: v(x.r) == null ? null : (pick === 'act' ? x.r.acts : x.r.plans) ?? null,
    at: x.r.at,
  })), weights);
}

/** Блокийн төсвийн жин — уншигдахгүй бол `null` (тэнцүү жин) */
async function budgetWeights(): Promise<ReadonlyMap<string, number> | null> {
  try { return await loadBlockWeights(); } catch { return cachedBlockWeights(); }
}

/**
 * Нэг багцын НЭГ АГШНЫ нэгдсэн дүнг бөглөх хуудаснаас гаргана.
 *
 * @param bagts    «Багц 4-1» — хяналтын бүртгэл дэх нэр
 * @param sheetOid Архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID (агшныг үүгээр олно)
 * @param pkgKey   Архивласан ХУУДАСНЫ түлхүүр («b1_12f») — мэдэгдэж байвал
 *                 OBJECTID-гаар хуудас ТААМАГЛАХГҮЙ (`registerApproved`)
 */
/**
 * Багцын дүнд орсон НЭГ хуудас. `real: false` = хэзээ ч нийтлэгдээгүй / «Б.» мөр нь
 * хэмжигдээгүй хуудас — блокууд нь 0% гэж орсон (`summaryOf` 2026-10-09).
 */
type Part = {
  n: number; r: BRow; p: Pkg; sc: Schema; real: boolean;
  /** 2026-11-27 (аудит №3): обьёмыг тэр өдрийн OBJECTID < энэ мөрүүдээс (`summaryAtDate`-ийн `skip` — ижил өдрийн өмнөх жааз) */
  volBefore?: number;
};

async function summaryOf(bagts: string, sheetOid: number, pkgKey?: string) {
  const group = PKGS.filter((x) => bagtsKey(x.group) === bagtsKey(bagts));
  /*
   * Нэг багцад 9F ба 12F хоёр хуудас байж болно — эх мөр аль нь болохыг олно.
   */
  const hits: Hit[] = [];
  let schemaErr = null as unknown;
  for (const p of group.filter((x) => !pkgKey || x.key === pkgKey)) {
    const sc = await loadSchema(p).catch((e: unknown) => { schemaErr = e; return null; });
    if (!sc?.f.fillDate) continue;

    const head = (await post(`${p.url}/query`, {
      where: `objectid = ${sheetOid}`,
      outFields: [sc.f.fillDate, sc.f.no].join(','),
      returnGeometry: 'false',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const ha = head.features?.[0]?.attributes;
    const at = ha?.[sc.f.fillDate];
    if (typeof at !== 'number') continue;      // энэ хуудсанд тэр мөр алга
    hits.push({ p, sc, at, fill: sc.f.fillDate, no: String(ha?.[sc.f.no] ?? '').trim() });
  }
  if (!hits.length && schemaErr != null)
    throw new Error(tr('Бөглөх хуудасны бүдүүвч уншигдсангүй: {0}', String((schemaErr as Error)?.message ?? schemaErr)));
  if (!hits.length) return null;

  let one = hits[0];
  if (hits.length > 1) {
    const flags = await Promise.all(hits.map((h) => frameHead(h, sheetOid).catch(() => false)));
    const heads = hits.filter((_, i) => flags[i]);
    if (heads.length !== 1) {
      throw new Error(
        tr('{0}: мөрийн дугаар {1} нь {2} хуудсанд зэрэг таарч байна — аль нь болох нь тодорхойгүй', bagts, sheetOid, hits.map((h) => h.p.label).join(tr(' ба '))),
      );
    }
    one = heads[0];
  }

  /*
   * «Б.» мөр = БАРИЛГА УГСРАЛТЫН АЖИЛ — багцын нэгдсэн гүйцэтгэл. Эх excel
   * өөрөө дэд үе шатуудыг жингээр нэгтгэсэн байдаг тул ЭНЭ мөрийг шууд авна
   * (хайлт ба эрэмб — `bRowOf`).
   */
  const at = one.at;
  const own = await bRowOf(one.p, one.sc, one.fill, `${one.fill} = ${ts(at)}`);
  if (!own) return null;

  /*
   * ДҮРЭМ: бусад хуудас бүрийн ТЭР ӨДӨР БУЮУ ӨМНӨХ хамгийн сүүлийн жаазны
   *    «Б.» мөрийг авч (2026-11-27-ноос блок бүрийн нүдийг блокийн ТӨСВӨӨР — `blendParts`) жигнэнэ. Энэ нь «ХУВИЙГ ДАХИН
   *    БОДОХГҮЙ» (толгой) дүрмийг зөрчихгүй: «Б.» мөрийн гүйцэтгэл нь
   *    өөрөө блокуудын ДУНДАЖ (`computeAll`-ийн J, хоосон = 0) тул блокоор
   *    жигнэсэн дундаж нь хоёр хуудасны БҮХ блокийн дундажтай ЯГ тэнцүү —
   *    ижил томьёог багц руу өргөтгөсөн нь (`planProgress`-ийн хуудас
   *    хоорондын жин ч мөн блокийн тоо).
   */
  const parts: Part[] = [{ n: one.sc.bld.length, r: own, p: one.p, sc: one.sc, real: true }];
  if (own.act != null) {
    for (const p of group) {
      if (p.key === one.p.key) continue;
      const sc = await loadSchema(p);
      if (!sc.f.fillDate) continue;              // архивын талбаргүй — дашбоардын хуваарьт ч ороогүй
      const r = await bRowOf(p, sc, sc.f.fillDate, `${sc.f.fillDate} <= ${ts(at)}`);
      if (r && r.act != null) parts.push({ n: sc.bld.length, r, p, sc, real: true });
      else if (sc.act.some(Boolean)) {
        parts.push({
          n: sc.bld.length,
          r: { act: 0, plan: r?.plan ?? null, at: r?.at ?? null, plans: r?.plans },
          p, sc, real: false,
        });
      }
    }
  }
  const f = await finishParts(parts);
  /* `src` — энэ жаазны «Б.» мөр (`registerApproved`-ийн ±20 хамгаалалт өмнөх агшныг энэ жаазгүйгээр дахин бодоход) */
  const src: SkipBRow | null = own.oid != null ? { pkgKey: one.p.key, oid: own.oid, firstOid: sheetOid, at } : null;
  return { at, ...f, progress: own.act == null ? null : f.progress, parts, src };
}

/**
 * Хуудсуудын хэсгээс багцын нэгдсэн дүн (`summaryOf` ба `summaryAtDate`-ийн НЭГ дүрэм): 2026-11-27 (аудит №23) блокийн
 * ТӨСВӨӨР жигнэнэ (`blendParts` → `blendBudget`, самбарын `pkgProgressOf`-тэй нэг дүрэм; урьд нь блокийн тоогоор),
 * обьём нь хуудас бүрийн тэр жаазнаас (`x.r.at` — эх хуудасны хувьд архивын агшин өөрөө).
 * `withVolume: false` (2026-11-27, аудит №2) — зөвхөн хувь (±20-ийн хамгаалалт): обьёмын бүтэн жааз татахгүй, обьём `null`.
 */
async function finishParts(parts: Part[], withVolume = true) {
  const pkgOrder = new Map(PKGS.map((x, i) => [x.key, i]));
  parts.sort((a, b) => (pkgOrder.get(a.p.key) ?? 0) - (pkgOrder.get(b.p.key) ?? 0));
  uniqueBlockCounts(parts.map((x) => x.sc.bld)).forEach((w, i) => { parts[i].n = w; });
  const weights = await budgetWeights();
  const mean = (pick: 'act' | 'plan'): number | null => blendParts(parts, pick, weights);
  const volParts = parts.some((x) => x.n > 0) ? parts.filter((x) => x.n > 0) : parts.slice(0, 1);
  const vols = withVolume ? await Promise.all(volParts.map((x) => sheetObyem(x.p, x.r.at, x.volBefore))) : [null];
  const vol: ObyemPair = vols.some((v) => v == null)
    ? { volume: null, volumePlan: null }
    : sumObyemParts(volParts.map((x, i) => ({ n: x.n, ...(vols[i] as ObyemPair) })));
  return {
    progress: toPct(mean('act')),
    planned: toPct(mean('plan')),
    volume: vol.volume,
    volumePlan: vol.volumePlan,
  };
}

/**
 * Агшнаас хасах НЭГ жаазны «Б.» мөр — хуудасны түлхүүр ба мөрийн OBJECTID (2026-11-27, аудит №2, №3).
 * `firstOid` — жаазны ЭХНИЙ мөрийн OBJECTID, `at` — жаазны огноо (бөглөсөн өдөр): ижил өдөр өмнөх жааз байвал обьёмыг
 * түүнээс (`skipVolBefore`). Өгөөгүй бол обьём урьдын адил тэр өдрийн сүүлийн жаазнаас.
 */
export type SkipBRow = { pkgKey: string; oid: number; firstOid?: number; at?: number };

/**
 * Хасагдсан жааз ба үлдсэн «Б.» мөр (`r`) ИЖИЛ ӨДӨР, `r` нь түүнээс ӨМНӨ бичигдсэн бол обьёмыг тэр өдрийн OBJECTID < жаазны
 * эхний мөр хүртэлх мөрүүдээс авах хил (цэвэр, 2026-11-27 аудит №3); эс бөгөөс `undefined` (энгийн `sheetObyem`).
 * Урьд нь `sheetObyem(p, r.at)` тэр өдрийн СҮҮЛИЙН жаазыг — хасах ёстой шинэ жаазыг — уншдаг тул «өмнөх» обьёмд шинэ жааз орж,
 * обьёмын өөрчлөлт D ба дараагийн жаазны хоорондох мөрөнд хэзээ ч хүрдэггүй байв.
 */
export function skipVolBefore(skip: SkipBRow | null | undefined, pkgKey: string, r: { at: number | null; oid?: number | null }): number | undefined {
  if (!skip || skip.pkgKey !== pkgKey || skip.at == null || r.at == null) return undefined;
  const lim = skip.firstOid != null && Number.isInteger(skip.firstOid) && skip.firstOid > 0 ? skip.firstOid : skip.oid;
  if (!Number.isInteger(lim) || r.oid == null || r.oid >= lim) return undefined;
  return dayRange(r.at)[0] === dayRange(skip.at)[0] ? lim : undefined;
}

/**
 * НЭГ ӨДРИЙН багцын дүн — хуудас БҮРИЙН тэр агшин хүртэлх хамгийн сүүлийн жаазаар (`summaryOf`-ийн «бусад хуудас»-ны
 * дүрэм бүх хуудсанд). Хэмжилттэй хуудас огт байхгүй бол `null`.
 * `skip` (2026-11-27) — тэр хуудасны энэ «Б.» мөрийг (нэг жааз) тооцохгүй: тэр жааз бичигдэхээс ӨМНӨХ агшин (хуудасны
 * өмнөх жааз — ижил өдрийн өмнөх жааз эсвэл өмнөх өдрийнх; обьём ч мөн тэр жаазнаас — `skipVolBefore`).
 * `progressOnly` — обьём бодохгүй (`finishParts`-ийн `withVolume: false`).
 */
async function summaryAtDate(bagts: string, at: number, skip?: SkipBRow | null, progressOnly = false) {
  const group = PKGS.filter((x) => bagtsKey(x.group) === bagtsKey(bagts));
  const parts: Part[] = [];
  for (const p of group) {
    const sc = await loadSchema(p);
    if (!sc.f.fillDate) continue;
    const not = skip && skip.pkgKey === p.key && Number.isInteger(skip.oid) ? ` AND ${sc.f.oid} <> ${skip.oid}` : '';
    const r = await bRowOf(p, sc, sc.f.fillDate, `${sc.f.fillDate} <= ${ts(at)}${not}`);
    const volBefore = r ? skipVolBefore(skip, p.key, r) : undefined;
    if (r && r.act != null) parts.push({ n: sc.bld.length, r, p, sc, real: true, volBefore });
    else if (sc.act.some(Boolean)) parts.push({ n: sc.bld.length, r: { act: 0, plan: r?.plan ?? null, at: r?.at ?? null, plans: r?.plans }, p, sc, real: false, volBefore });
  }
  if (!parts.some((x) => x.real)) return null;
  return finishParts(parts, !progressOnly);
}


/** Нэгтгэлийн нэг өдрийн дүн (`summaryAtDate`) */
export type NegtgelSum = { progress: number | null; planned: number | null; volume: number | null; volumePlan: number | null };

const SUM_FIELDS = [
  ['progress', F.progress, 100],
  ['planned', F.planned, 100],
  ['volume', F.volume, Infinity],
  ['volumePlan', F.volumePlan, Infinity],
] as const;

/** ±20 — нэг удаагийн хойш огноотой батлалтаар нэг өдрийн гүйцэтгэл үүнээс их хөдлөхгүй (`registerApproved`-ийн хамгаалалт) */
export const RESYNC_MAX_JUMP = 20;

/**
 * ХАДГАЛСАН МӨРӨНД ЗӨВХӨН ЭНЭ БАТЛАЛТЫН НӨЛӨӨГ НЭМНЭ (цэвэр, 2026-11-23 хяналт). `after − before`-ийг хадгалсан утга дээр нэмнэ —
 * мөрийн бусад (түүхэн, өөр дүрмээр бичигдсэн) зөрүүг ХӨНДӨХГҮЙ. Хувь 0–100, обьём ≥ 0. Гүйцэтгэлийн өөрчлөлт
 * `RESYNC_MAX_JUMP`-аас их бол `'jump'` (бичихгүй, анхааруулна); өөрчлөлтгүй бол `null`.
 */
export function negtgelDelta(
  stored: Readonly<Record<string, unknown>>,
  before: NegtgelSum | null,
  after: NegtgelSum | null,
): Record<string, number> | 'jump' | null {
  if (!before || !after) return null;
  const dp = before.progress != null && after.progress != null ? after.progress - before.progress : 0;
  if (Math.abs(dp) > RESYNC_MAX_JUMP) return 'jump';
  const out: Record<string, number> = {};
  for (const [k, f, max] of SUM_FIELDS) {
    const b = before[k];
    const a = after[k];
    const had = num(stored[f]);
    if (b == null || a == null || had == null) continue;
    const d = a - b;
    if (Math.abs(d) < 0.01) continue;
    const v = Math.min(max, Math.max(0, had + d));
    if (Math.abs(v - had) >= 0.01) out[f] = Math.round(v * 1e6) / 1e6;
  }
  return Object.keys(out).length ? out : null;
}

/** Хадгалсан мөр шинэ дүнтэй зөрүүтэй юу — `null` шинэ утга нь «мэдэгдэхгүй» (дарахгүй) (цэвэр) */
export function negtgelDiffers(
  row: Readonly<Record<string, unknown>>,
  s: NegtgelSum,
): boolean {
  const diff = (f: string, v: number | null) => {
    if (v == null) return false;
    const had = num(row[f]);
    return had == null || Math.abs(had - v) >= 0.01;
  };
  return diff(F.progress, s.progress) || diff(F.planned, s.planned) || diff(F.volume, s.volume) || diff(F.volumePlan, s.volumePlan);
}

const SNAP_OUT = [BAGTS_NEGTGEL.oid, F.bagts, F.date, F.progress, F.planned, F.volume, F.volumePlan];

/** SQL мөрийн литерал (`'` давхарлана; Кирилл тул N-угтвар) */
const sqlLit = (v: string) => `N'${v.replace(/'/g, "''")}'`;

/** Тухайн багцын (бичлэгийн бүх хувилбар нэрээр) `fromMs`-ээс хойшх мөрүүд — серверийн шүүлттэй, хуудаслан */
async function negtgelRowsFrom(bagts: string, fromMs: number, extra?: string): Promise<Record<string, unknown>[]> {
  const key = bagtsKey(bagts);
  const d = (await post(`${BAGTS_NEGTGEL.url}/query`, {
    where: '1=1', outFields: F.bagts, returnDistinctValues: 'true', returnGeometry: 'false',
  })) as { features?: { attributes: Record<string, unknown> }[] };
  const names = [...new Set((d.features ?? []).map((x) => x.attributes[F.bagts]).filter((v): v is string => typeof v === 'string' && bagtsKey(v) === key))];
  if (!names.length) return [];
  const where = `${F.bagts} IN (${names.map(sqlLit).join(',')}) AND ${F.date} >= ${ts(fromMs)}${extra ? ` AND (${extra})` : ''}`;
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const q = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where, outFields: SNAP_OUT.join(','), returnGeometry: 'false',
      orderByFields: `${F.date} ASC, ${BAGTS_NEGTGEL.oid} ASC`, resultOffset: String(offset), resultRecordCount: '1000',
    })) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean };
    const f = q.features ?? [];
    out.push(...f.map((x) => x.attributes));
    if (!q.exceededTransferLimit || !f.length) break;
  }
  return out;
}

/** `snapshotNegtgelFrom`-ийн үр дүн — хадгалсан мөр ба тэр агшны дүн */
export type NegtgelSnap = { bagts: string; rows: { oid: number; at: number; stored: Record<string, unknown>; before: NegtgelSum | null }[] };

/**
 * Бөглөсөн өдрөөр (D) бичсэн жааз — `snapshotNegtgelFrom`-ийн «өмнөх» агшнаас хасна (2026-11-27, аудит №3).
 *   · `firstOid` — жаазны ЭХНИЙ мөрийн OBJECTID (`applyAdds`-ийн `firstOid` / илгээлтийн `archiveOid`);
 *   · `onlyIfStored` — давтагдах замд (`healLaterFrames`): хадгалсан мөр тэр жаазгүй агшинтай ЯГ таарвал л (тэр жааз хараахан
 *     нэмэгдээгүй) хасна — эс бөгөөс одоогийн агшин (давтахад давхар нэмэхгүй).
 */
export type FrameSkip = { pkgKey: string; firstOid: number; onlyIfStored?: boolean };

/**
 * Хадгалсан мөрийн «өмнөх» агшинд тэр жаазгүй дүнг (`skipped`) авах уу (цэвэр, 2026-11-27 аудит №3): `onlyIfStored` үгүй бол
 * үргэлж; байвал хадгалсан утга түүнтэй зөрөөгүй (`negtgelDiffers` = false) үед л — тэгвэл жаазны нөлөө хараахан ороогүй.
 */
export function takeSkipped(
  stored: Readonly<Record<string, unknown>>,
  skipped: NegtgelSum | null,
  onlyIfStored: boolean,
): boolean {
  if (!skipped) return false;
  return !onlyIfStored || !negtgelDiffers(stored, skipped);
}

/** Жаазны «Б.» мөрийн OBJECTID — D өдрийн, `firstOid`-оос хойшх хамгийн эхнийх (олдохгүй бол `null`) */
async function frameBRowOid(skip: FrameSkip, from: number): Promise<number | null> {
  const p = PKGS.find((x) => x.key === skip.pkgKey);
  if (!p || !Number.isInteger(skip.firstOid) || skip.firstOid <= 0) return null;
  const sc = await loadSchema(p);
  if (!sc.f.fillDate) return null;
  const q = (await post(`${p.url}/query`, {
    where: `${dayWhere(sc.f.fillDate, from)} AND ${sc.f.oid} >= ${skip.firstOid} AND ${constructionWhere(sc.f.no)}`,
    outFields: sc.f.oid,
    returnGeometry: 'false',
    orderByFields: `${sc.f.oid} ASC`,
    resultRecordCount: '1',
  })) as { features?: { attributes: Record<string, unknown> }[] };
  const v = num(q.features?.[0]?.attributes?.[sc.f.oid]);
  return v != null && Number.isInteger(v) ? v : null;
}

/**
 * ХОЖУУ ӨДРҮҮДИЙН НЭГТГЭЛ — ӨМНӨХ АГШИН (2026-11-23, хяналт). `refreshStoredProgress`-ийн ӨМНӨ дуудна: `day`-ээс хойшх
 * мөр бүрийн хадгалсан утга ба тэр агшны `summaryAtDate`. Уншиж чадахгүй бол `null` (дараагийн алхам юу ч бичихгүй).
 *
 * 2026-11-27 (аудит №3) — `skip` (бөглөсөн өдрийн жааз): D-ээс ХОЙШХ (D-ийн мөрийг `registerApproved` бүтэн утгаар бичдэг)
 * мөр бүрийн «өмнөх» агшинг ТЭР ЖААЗГҮЙГЭЭР бодно. Урьд нь шинэ жааз аль хэдийн бичигдсэн тул D ба энэ хуудасны дараагийн
 * жаазны ХООРОНДХ мөр (нөгөө хуудасны батлалтаар үүссэн) өмнө/дараа хоёуланд нь шинэ жаазыг уншиж, зөрүү 0 гарч хэзээ ч
 * засагдахгүй байв.
 */
export async function snapshotNegtgelFrom(bagts: string, day: string, skip?: FrameSkip | null): Promise<NegtgelSnap | null> {
  const from = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(from)) return null;
  try {
    const rows: NegtgelSnap['rows'] = [];
    let bOid: number | null | undefined;
    for (const a of await negtgelRowsFrom(bagts, dayRange(from)[skip ? 1 : 0])) {
      const oid = num(a[BAGTS_NEGTGEL.oid]);
      const at = num(a[F.date]);
      if (oid == null || at == null) continue;
      if (skip && bOid === undefined) bOid = await frameBRowOid(skip, from);
      const sk = skip && bOid != null ? await summaryAtDate(bagts, at, { pkgKey: skip.pkgKey, oid: bOid, firstOid: skip.firstOid, at: from }) : null;
      const before = takeSkipped(a, sk, !!skip?.onlyIfStored) ? sk : await summaryAtDate(bagts, at);
      rows.push({ oid, at, stored: a, before });
    }
    return { bagts, rows };
  } catch {
    return null;
  }
}

/**
 * ХОЖУУ ӨДРҮҮДИЙН НЭГТГЭЛИЙГ ДАХИН БОДОХ (2026-11-23, аудит №10 · хяналтаар засварласан). Хойш огноогоор батлах (`backDated`)
 * ба `healLaterFrames` нь хожуу жаазнуудын хадгалсан «Б.» хувийг (`frameRepair.refreshStoredProgress`) шинэчилдэг ч хүснэгт 190
 * зөвхөн архивласан өдрийн мөрөө бичдэг байв. Одоо `snapshotNegtgelFrom`-оор (засварын ӨМНӨ) авсан агшинтай засварын ДАРААХ
 * дүнг жишиж, зөвхөн ЭНЭ засварын нөлөөг (`negtgelDelta`) хадгалсан утга дээр нэмнэ — түүхэн мөрийг бүхэлд нь дахин бичихгүй.
 * Бичихийн яг өмнө мөрийг дахин уншиж, агшнаас хойш өөрчлөгдсөн бол алгасна. ±`RESYNC_MAX_JUMP`-аас их үсрэлтийг бичихгүй
 * (`skipped`). Давтахад аюулгүй: засвар юу ч өөрчлөөгүй бол before = after → бичихгүй.
 */
export async function resyncNegtgelFrom(snap: NegtgelSnap | null): Promise<{ ok: true; n: number; skipped: string[] } | { ok: false; error: string }> {
  if (!snap) return { ok: false, error: tr('Нэгтгэлийн өмнөх агшин уншигдсангүй') };
  if (!snap.rows.length) return { ok: true, n: 0, skipped: [] };
  await requireWriter();
  let wrote = false;
  try {
    const plan: { oid: number; stored: Record<string, unknown>; u: Record<string, number> }[] = [];
    const skipped: string[] = [];
    for (const r of snap.rows) {
      const d = negtgelDelta(r.stored, r.before, await summaryAtDate(snap.bagts, r.at));
      if (d == null) continue;
      if (d === 'jump') { skipped.push(new Date(r.at).toISOString().slice(0, 10)); continue; }
      plan.push({ oid: r.oid, stored: r.stored, u: d });
    }
    if (!plan.length) return { ok: true, n: 0, skipped };
    /* Бичихийн өмнө дахин уншина — агшнаас хойш өөр бичигч (`registerApproved`) хөндсөн мөрийг дарахгүй */
    const now = new Map((await negtgelRowsFrom(snap.bagts, 0, `${BAGTS_NEGTGEL.oid} IN (${plan.map((x) => x.oid).join(',')})`))
      .map((a) => [num(a[BAGTS_NEGTGEL.oid]), a] as const));
    const same = (a: Record<string, unknown> | undefined, b: Record<string, unknown>) =>
      !!a && SUM_FIELDS.every(([, f]) => num(a[f]) === num(b[f]));
    const updates = plan.filter((x) => same(now.get(x.oid), x.stored)).map((x) => ({ [BAGTS_NEGTGEL.oid]: x.oid, ...x.u }));
    if (!updates.length) return { ok: true, n: 0, skipped };
    wrote = true;
    const res = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
      updates: JSON.stringify(updates.map((attributes) => ({ attributes }))),
      rollbackOnFailure: 'true',
    })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
    const ur = res.updateResults ?? [];
    if (ur.length !== updates.length || ur.some((x) => x.success !== true))
      return { ok: false, error: ur.find((x) => x.success !== true)?.error?.description ?? tr('Нэгтгэлийн мөр шинэчлэгдсэнгүй') };
    return { ok: true, n: updates.length, skipped };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (wrote) invalidate('BAGTS_NEGTGEL');
  }
}

/**
 * ±20-ийн ХАМГААЛАЛТАД ЖИШИГДЭХҮЙЦ гүйцэтгэл (0–100).
 *
 * ДҮРЭМ: сүүлийн мөрийн ӨДРӨӨС ӨМНӨ аль хэдийн «Б.» хэмжилттэй (`real`) байсан
 *    хуудсуудын ОДООГИЙН утгаар л жишнэ. Олонлог өөрчлөгдөөгүй → `'same'` (бүтэн
 *    дүнгээр, урьдын адил); жишигдэх хуудас байхгүй → `null` (хамгаалалт алгасна).
 *    Хэмжээсийн алдаа (0–1 бичигдсэн) хуудас бүрийг 100 дахин багасгадаг тул
 *    дэд олонлогоор ч баригдана — хамгаалалтын гол зорилго хэвээр.
 */
async function comparablePct(parts: Part[], lastAt: number | null): Promise<number | null | 'same' | { scale: string }> {
  if (parts.length < 2 || lastAt == null) return 'same';
  const [dayStart] = dayRange(lastAt);
  const kept: Part[] = [];
  for (const x of parts) {
    if (!x.real || !x.sc.f.fillDate) continue;
    const r = await bRowOf(x.p, x.sc, x.sc.f.fillDate, `${x.sc.f.fillDate} < ${ts(dayStart)}`);
    if (r && r.act != null) {
      const cur = x.r.act == null ? null : x.r.act * 100;
      if (cur != null && cur <= 1 && r.act * 100 > 1) return { scale: x.p.label };
      kept.push(x);
    }
  }
  if (kept.length === parts.length) return 'same';
  if (!kept.length) return null;
  /* 2026-11-27 (аудит №23): `finishParts`-тэй нэг (төсвийн) жин */
  const v = blendParts(kept, 'act', await budgetWeights());
  return v == null ? null : v * 100;
}

/**
 * ±20-ийн хамгаалалтын ӨМНӨХ утга (цэвэр, 2026-11-27 аудит №2): өмнөх мөрийн агшныг одоогийн дүрмээр дахин бодсон утга
 * (`recomputed`) байвал түүнийг, бодогдоогүй бол хадгалсан утгыг (`stored`) — хоёр талыг нэг томьёогоор жишихийн тулд.
 */
export function guardBaseline(stored: number | null, recomputed: number | null): number | null {
  return recomputed != null && Number.isFinite(recomputed) ? recomputed : stored;
}

export type NegtgelResult = { ok: true; skipped?: 'blockless' } | { ok: false; error: string };

/**
 * БАТЛАГДСАН гүйцэтгэлийг нэгтгэлд нэмнэ.
 *
 * @param bagts    багцын нэр — хяналтын бүртгэл дэх бичлэгээр
 * @param sheetOid ЗААВАЛ `Bagts_*` АРХИВЫН мөрийн OBJECTID. 2026-09-04-ээс
 *    хойш хяналтын мөрийн `Эх_мөрийн_дугаар` нь ИЛГЭЭЛТИЙН (өөр үйлчилгээний)
 *    дугаар болсон тул түүнийг ШУУД дамжуулж БОЛОХГҮЙ — `summaryOf` тэр
 *    дугаарыг архиваас хайж олохгүй, «Бөглөх хуудаснаас агшин олдсонгүй» гэж
 *    чимээгүй унана. `hyanaltStore.archiveSubmission` нь `applyAdds`-ийн
 *    буцаасан `firstOid`-ыг (legacy мөрд хуучин `sheetOid`-ыг) өгнө.
 * @param pkgKey СОНГОЛТТОЙ (2026-09-25): архивласан хуудасны `Pkg.key`.
 *    Өгвөл хуудсыг OBJECTID-гаар ТААМАГЛАХГҮЙ — хоёр хуудасны OID муж
 *    давхцсан багцад (1 · 2 · 4-2) `frameHead`-ийн ялгалт огт хэрэггүй болно.
 *    Өгөөгүй бол (хуучин дуудагч) урьдын адил `frameHead`-ээр ялгана.
 */
export async function registerApproved(
  bagts: string,
  sheetOid: number,
  pkgKey?: string,
): Promise<NegtgelResult> {
  await requireWriter();
  let wrote = false;
  /**
   * БИЧСНИЙ ДАРААХ ДАХИН БОДОЛТ (2026-11-23, аудит №14). Нэг багцын 9F/12F хуудсыг секундын зайтай батлахад нэг нь нөгөөгийн
   * жааз үүсэхээс өмнө уншиж, хожуу бичсэнээрээ нөгөөгийн ажлыг хольцоос хасдаг байв (урьд нь зөвхөн хадгалсан утга ӨӨРИЙН
   * утгаас зөрсөн үед л засдаг байсан). Одоо бичсэн бүрд нэг удаа ШИНЭЭР бодож, зөрвөл дахин бичнэ. Унавал зөвхөн лог.
   */
  const settle = async (oid: number, s: { progress: number | null; planned: number | null; volume: number | null; volumePlan: number | null }) => {
    try {
      const s2 = await summaryOf(bagts, sheetOid, pkgKey);
      if (!s2 || s2.progress == null) return;
      const written: Record<string, unknown> = { [F.progress]: s.progress, [F.planned]: s.planned, [F.volume]: s.volume, [F.volumePlan]: s.volumePlan };
      if (!negtgelDiffers(written, s2)) return;
      const a2: Record<string, unknown> = { [BAGTS_NEGTGEL.oid]: oid, [F.progress]: s2.progress };
      if (s2.planned != null) a2[F.planned] = s2.planned;
      if (s2.volume != null) a2[F.volume] = s2.volume;
      if (s2.volumePlan != null) a2[F.volumePlan] = s2.volumePlan;
      wrote = true;
      const upd = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: a2 }]),
        rollbackOnFailure: 'true',
      })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
      if (upd.updateResults?.[0]?.success !== true) console.warn('[selbe] нэгтгэлийн дахин бодолт бичигдсэнгүй:', upd.updateResults?.[0]?.error?.description);
    } catch (e) {
      console.warn('[selbe] нэгтгэлийн бичсэний дараах шалгалт унав (бичилт батлагдсан):', e);
    }
  };
  try {
    const s = await summaryOf(bagts, sheetOid, pkgKey);
    if (s && s.progress == null && isBlocklessBagts(bagts)) return { ok: true, skipped: 'blockless' };
    if (!s) return { ok: false, error: tr('Бөглөх хуудасны хадгалсан хувилбар олдсонгүй') };
    for (const x of s.parts) {
      const v = x.real && x.r.act != null ? x.r.act * 100 : null;
      if (v != null && (v < -0.5 || v > 100.5))
        return { ok: false, error: tr('«{0}» хуудасны «Б.» гүйцэтгэл {1}% — 0–100-гийн гадна тул нэгтгэлд бичсэнгүй. Хуудасны хэмжээсийг (0–1 эсэх) шалгана уу.', x.p.label, v.toFixed(2)) };
    }

    /* Стандарт нэрээр бичнэ; хайлтад хуучин бичлэгийг ч (шилжээгүй мөр) хамруулна */
    const canon = canonPkg(bagts);
    const bagtsIn = `${F.bagts} IN (${[...new Set([canon, bagts])].map((v) => `N'${v.replace(/'/g, "''")}'`).join(', ')})`;

    const now = new Date();
    const todayCut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
    const prev = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${bagtsIn} AND ${F.date} <= ${ts(Math.min(s.at, todayCut))}`,
      outFields: `${F.date},${F.progress}`,
      returnGeometry: 'false',
      orderByFields: `${F.date} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const prevA = prev.features?.[0]?.attributes;
    let last = num(prevA?.[F.progress]);

    if (s.progress == null)
      return {
        ok: false,
        error: tr('Бөглөх хуудасны «Б.» мөрийн гүйцэтгэл хэмжигдээгүй тул нэгтгэлд бичсэнгүй — хуудсаа шалгаад дахин баталгаажуулна уу.'),
      };
    /*
     * 2026-11-27 (аудит №2): ИЖИЛ ДҮРМЭЭР ЖИШНЭ — хадгалсан өмнөх мөр хуучин (блокийн энгийн дундаж) томьёогоор бичигдсэн байж
     * болох тул өмнөх мөрийн огнооны агшныг ҮРГЭЛЖ ОДООГИЙН (блокийн төсвийн) дүрмээр, энэ жаазгүйгээр (`s.src` — ижил өдрийн
     * өмнөх мөр энэ жаазаас өмнө бодогдсон) дахин бодож түүнтэй жишнэ (`guardBaseline`; бодогдохгүй бол хадгалсан утга).
     * Урьд нь хадгалсан утгатай жишсэн хамгаалалт өдөөгдсөн үед л дахин боддог байсан тул хуучин утга шинэ дүрмийнхээс БАГА
     * үед (төсөв 8/1/1, гүйцэтгэл 95/40/40: хадгалсан 58.33, дахин бодсон 84.00) ижил дүрмээр 20-иос их уналт (→ 60.00)
     * шалгагдалгүй бичигддэг байв. Зөвхөн хувь бодно (`progressOnly`) — обьёмын жааз татахгүй.
     */
    if (last != null) {
      const lastAt = num(prevA?.[F.date]);
      let re: number | null = null;
      if (lastAt != null) {
        try { re = (await summaryAtDate(bagts, lastAt, s.src, true))?.progress ?? null; } catch { re = null; }
      }
      last = guardBaseline(last, re);
    }
    if (last != null && s.progress < last - 20) {
      const cmp = await comparablePct(s.parts, num(prevA?.[F.date]));
      if (cmp != null && typeof cmp === 'object')
        return { ok: false, error: tr('«{0}» хуудасны «Б.» гүйцэтгэл өмнө 1%-иас их байсан бол одоо ≤1% — хэмжээсийн алдаа (0–1 ↔ 0–100) байж болзошгүй тул нэгтгэлд бичсэнгүй.', cmp.scale) };
      const shown = cmp === 'same' ? s.progress : cmp;
      if (shown != null && shown < last - 20)
        return {
          ok: false,
          error: tr('Нэгтгэлийн сүүлийн гүйцэтгэл {0}%, бөглөх хуудаснаас гарсан нь {1}% — хэт зөрүүтэй тул бичсэнгүй. Хуудасны хэмжээс (0–1 эсэх) ба «Б.» мөрийг шалгана уу.', last.toFixed(2), shown.toFixed(2)),
        };
    }

    const dupQ = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${bagtsIn} AND ${dayWhere(F.date, s.at)}`,
      outFields: `${BAGTS_NEGTGEL.oid},${F.progress}`,
      returnGeometry: 'false',
      orderByFields: `${BAGTS_NEGTGEL.oid} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const dupRow = dupQ.features?.[0]?.attributes;
    if (dupRow) {
      const had = num(dupRow[F.progress]);
      /* Ижил тоо — үнэхээр давхар дуудалт, чимээгүй өнгөрнө. */
      const sameAux = (f: string, v: number | null) => v == null || (num(dupRow[f]) != null && Math.abs((num(dupRow[f]) as number) - v) < 0.01);
      if (had != null && Math.abs(had - s.progress) < 0.01
        && sameAux(F.planned, s.planned) && sameAux(F.volume, s.volume) && sameAux(F.volumePlan, s.volumePlan)) return { ok: true };
      const oid = num(dupRow[BAGTS_NEGTGEL.oid]);
      if (oid == null)
        return { ok: false, error: tr('Нэгтгэлийн мөрийн дугаар уншигдсангүй — дахин оролдоно уу.') };
      const attrs: Record<string, unknown> = {
        [BAGTS_NEGTGEL.oid]: oid,
        [F.progress]: s.progress,
      };
      if (s.planned != null) attrs[F.planned] = s.planned;
      if (s.volume != null) attrs[F.volume] = s.volume;
      if (s.volumePlan != null) attrs[F.volumePlan] = s.volumePlan;
      wrote = true;
      const update = async (a: Record<string, unknown>) => {
        const upd = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: a }]),
          rollbackOnFailure: 'true',
        })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
        const ur = upd.updateResults?.[0];
        if (!ur || ur.success !== true)
          throw new Error(ur?.error?.description ?? tr('Нэгтгэлийн мөр шинэчлэгдсэнгүй'));
      };
      await update(attrs);
      await settle(oid, s);
      return { ok: true };
    }

    wrote = true;
    const res = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
      adds: JSON.stringify([{
        attributes: {
          [F.date]: s.at,
          [F.bagts]: canon,
          [F.progress]: s.progress,
          [F.planned]: s.planned,
          [F.volume]: s.volume,
          [F.volumePlan]: s.volumePlan,
        },
      }]),
      rollbackOnFailure: 'true',
    })) as { addResults?: { success?: boolean; error?: { description?: string } }[] };
    const r = res.addResults?.[0] as { success?: boolean; objectId?: number; error?: { description?: string } } | undefined;
    if (!r || r.success !== true) {
      throw new Error(r?.error?.description ?? tr('Нэгтгэлд мөр нэмэгдсэнгүй'));
    }
    const newOid = num(r.objectId);
    if (newOid != null) {
      const tw = (await post(`${BAGTS_NEGTGEL.url}/query`, {
        where: `${bagtsIn} AND ${dayWhere(F.date, s.at)}`,
        outFields: `${BAGTS_NEGTGEL.oid}`,
        returnGeometry: 'false',
        orderByFields: `${BAGTS_NEGTGEL.oid} ASC`,
      })) as { features?: { attributes: Record<string, unknown> }[] };
      const keepOid = num(tw.features?.[0]?.attributes?.[BAGTS_NEGTGEL.oid]);
      if (keepOid != null && keepOid < newOid) {
        const attrs: Record<string, unknown> = { [BAGTS_NEGTGEL.oid]: keepOid, [F.progress]: s.progress };
        if (s.planned != null) attrs[F.planned] = s.planned;
        if (s.volume != null) attrs[F.volume] = s.volume;
        if (s.volumePlan != null) attrs[F.volumePlan] = s.volumePlan;
        wrote = true;
        const u = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: attrs }]),
          rollbackOnFailure: 'true',
        })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
        const ur = u.updateResults?.[0];
        if (!ur || ur.success !== true)
          throw new Error(ur?.error?.description ?? tr('Нэгтгэлийн мөр шинэчлэгдсэнгүй'));
        const d = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
          deletes: String(newOid),
          rollbackOnFailure: 'true',
        })) as { deleteResults?: { success?: boolean; error?: { description?: string } }[] };
        const dr = d.deleteResults?.[0];
        if (!dr || dr.success !== true)
          return {
            ok: false,
            error: tr('Давхар нэгтгэлийн мөр (бүртгэл №{0}) үлдлээ — админд мэдэгдэнэ үү (гараар устгах шаардлагатай): {1}', newOid, dr?.error?.description ?? ''),
          };
        await settle(keepOid, s);
        return { ok: true };
      }
      await settle(newOid, s);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (wrote) invalidate('BAGTS_NEGTGEL');
  }
}

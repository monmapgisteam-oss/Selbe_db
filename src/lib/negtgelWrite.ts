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

import { t as tr } from './i18nCore';
import { agsFetch } from '@/modules/sheet/ags';
import { BAGTS_NEGTGEL, bagtsKey, constructionWhere } from './services';
import { invalidate } from './dataBus';
import { PKGS, loadSchema, fillSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows, msToDay } from '@/modules/sheet/bagtsSheet';
import { uniqueBlockCounts, constructionObyem, sumObyemParts, obyemFields, type ObyemPair } from './blockProgress';

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
type BRow = { act: number | null; plan: number | null; at: number | null };

/**
 * Нэг хуудасны обьём — `at` агшны (өдрийн сүүлийн бүтэн жааз, `loadRows`-ийн `dayFilter` · `lastFrame` — хянагчийн
 * харагдацтай нэг зам) навч мөрүүдээс (`constructionObyem`). `at == null` (тэр хүртэл нийтлэгдээгүй хуудас) бол
 * одоогийн (суурь) жааз — төлөвлөгөөт обьём нь багцын дүнд орно, бодит нь `null`.
 */
async function sheetObyem(p: Pkg, at: number | null): Promise<ObyemPair | null> {
  try {
    const fsc = await fillSchema(p);
    const { rows } = await loadRows(p, fsc, at == null ? undefined : msToDay(at), obyemFields(fsc));
    return constructionObyem(rows, fsc.obyem);
  } catch (e) {
    console.warn(`[selbe] нэгтгэлийн обьём: ${p.label} — бөглөх хуудас уншигдсангүй, обьём бичихгүй`, e);
    return null;
  }
}

/**
 * Нэг хуудасны «Б.» мөр — `dateWhere`-д таарах ХАМГИЙН СҮҮЛИЙН жаазнаас.
 */
async function bRowOf(p: Pkg, sc: Schema, fill: string, dateWhere: string): Promise<BRow | null> {
  const cols = [sc.f.no, sc.f.act, sc.f.plan, fill]
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
  };
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
type Part = { n: number; r: BRow; p: Pkg; sc: Schema; real: boolean };

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
   *    «Б.» мөрийг авч БЛОКИЙН ТООГООР жигнэнэ. Энэ нь «ХУВИЙГ ДАХИН
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
          r: { act: 0, plan: r?.plan ?? null, at: r?.at ?? null },
          p, sc, real: false,
        });
      }
    }
  }
  const pkgOrder = new Map(PKGS.map((x, i) => [x.key, i]));
  parts.sort((a, b) => (pkgOrder.get(a.p.key) ?? 0) - (pkgOrder.get(b.p.key) ?? 0));
  uniqueBlockCounts(parts.map((x) => x.sc.bld)).forEach((w, i) => { parts[i].n = w; });
  const mean = (pick: (r: BRow) => number | null): number | null =>
    parts.length === 1 ? pick(own) : blendSheets(parts.map((x) => ({ bld: x.sc.bld, v: pick(x.r) })));
  const volParts = parts.some((x) => x.n > 0) ? parts.filter((x) => x.n > 0) : parts.slice(0, 1);
  const vols = await Promise.all(volParts.map((x) => sheetObyem(x.p, x.p.key === one.p.key ? at : x.r.at)));
  const vol: ObyemPair = vols.some((v) => v == null)
    ? { volume: null, volumePlan: null }
    : sumObyemParts(volParts.map((x, i) => ({ n: x.n, ...(vols[i] as ObyemPair) })));

  return {
    at,
    progress: toPct(own.act == null ? null : mean((r) => r.act)),
    planned: toPct(mean((r) => r.plan)),
    volume: vol.volume,
    volumePlan: vol.volumePlan,
    parts,
  };
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
  const v = blendSheets(kept.map((x) => ({ bld: x.sc.bld, v: x.r.act })));
  return v == null ? null : v * 100;
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
  let wrote = false;
  try {
    const s = await summaryOf(bagts, sheetOid, pkgKey);
    if (s && s.progress == null && isBlocklessBagts(bagts)) return { ok: true, skipped: 'blockless' };
    if (!s) return { ok: false, error: tr('Бөглөх хуудасны хадгалсан хувилбар олдсонгүй') };
    for (const x of s.parts) {
      const v = x.real && x.r.act != null ? x.r.act * 100 : null;
      if (v != null && (v < -0.5 || v > 100.5))
        return { ok: false, error: tr('«{0}» хуудасны «Б.» гүйцэтгэл {1}% — 0–100-гийн гадна тул нэгтгэлд бичсэнгүй. Хуудасны хэмжээсийг (0–1 эсэх) шалгана уу.', x.p.label, v.toFixed(2)) };
    }

    const nameSql = bagts.replace(/'/g, "''");

    const now = new Date();
    const todayCut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
    const prev = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${nameSql}' AND ${F.date} <= ${ts(Math.min(s.at, todayCut))}`,
      outFields: `${F.date},${F.progress}`,
      returnGeometry: 'false',
      orderByFields: `${F.date} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const prevA = prev.features?.[0]?.attributes;
    const last = num(prevA?.[F.progress]);

    if (s.progress == null)
      return {
        ok: false,
        error: tr('Бөглөх хуудасны «Б.» мөрийн гүйцэтгэл хэмжигдээгүй тул нэгтгэлд бичсэнгүй — хуудсаа шалгаад дахин баталгаажуулна уу.'),
      };
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
      where: `${F.bagts} = N'${nameSql}' AND ${dayWhere(F.date, s.at)}`,
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
      try {
        const back = (await post(`${BAGTS_NEGTGEL.url}/query`, {
          where: `${BAGTS_NEGTGEL.oid} = ${oid}`,
          outFields: F.progress,
          returnGeometry: 'false',
        })) as { features?: { attributes: Record<string, unknown> }[] };
        const got = num(back.features?.[0]?.attributes?.[F.progress]);
        if (got != null && Math.abs(got - s.progress) > 0.01) {
          const s2 = await summaryOf(bagts, sheetOid, pkgKey);
          if (s2 && s2.progress != null) {
            const a2: Record<string, unknown> = { [BAGTS_NEGTGEL.oid]: oid, [F.progress]: s2.progress };
            if (s2.planned != null) a2[F.planned] = s2.planned;
            if (s2.volume != null) a2[F.volume] = s2.volume;
            if (s2.volumePlan != null) a2[F.volumePlan] = s2.volumePlan;
            await update(a2);
          }
        }
      } catch (e) {
        console.warn('[selbe] нэгтгэлийн бичсэний дараах шалгалт унав (бичилт батлагдсан):', e);
      }
      return { ok: true };
    }

    wrote = true;
    const res = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
      adds: JSON.stringify([{
        attributes: {
          [F.date]: s.at,
          [F.bagts]: bagts,
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
        where: `${F.bagts} = N'${nameSql}' AND ${dayWhere(F.date, s.at)}`,
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
        return { ok: true };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (wrote) invalidate('BAGTS_NEGTGEL');
  }
}

/**
 * ТУХ — «ХУВААРЬ»-ИЙН БӨГЛӨХ ХУУДСААС (Bagts_*) УНШИХ ЗАМ.
 *
 * ⚠️ ЯАГААД ТУСДАА: «Хуваарь» нь 18 бөглөх хуудсыг бүтнээр (~1,400 мөр × архивын
 *    агшин) уншдаг. ТУХ-ын ТОЙМ нь зөвхөн «Улсын комисс» мөрийн огноо хэрэгтэй
 *    тул хуудас бүрээс ЗӨВХӨН тэр мөрийг асууна (`loadCommissionDates`); бүтэн
 *    мөрүүд нь зөвхөн багц СОНГОХОД, тэр багцын 1–2 хуудсаар (`loadPkgSchedule`).
 *
 * ⚠️ АРХИВ: нийтлэх бүрд хуудас доор нь хуулбарлагддаг (`buglusun_ognoo`) тул
 *    «Улсын комисс» мөр агшин бүрд давтагдана. ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас):
 *    урьд нь ХАМГИЙН ИХ ObjectID-тай мөрийг авдаг байв; одоо «Хуваарь»-тай ЯГ ижил —
 *    СҮҮЛИЙН агшны (`latestWhere`-ийн өдөр) № «УК» · «Улсын комисс» мөр
 *    (`tuhData.pickCommission`-ийн ⚠️). Батлагдаагүй санал хуудсанд ордоггүй тул энэ нь
 *    батлагдсан хуваарь.
 *
 * ⚠️ Огноо нь «Хуваарь»-ийн ТӨЛӨВЛӨГӨӨТ (`start`/`end`) — гэрээний (`gStart`/`gEnd`)
 *    эсвэл бодит биш. Хоосон бол `null` (хэрэглэгч «Хуваарь»-т оруулна).
 */
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { agsFetch } from '@/modules/sheet/ags';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { cached } from '@/lib/live';
import { register } from '@/lib/dataBus';
import { bagtsKey } from '@/lib/services';
import { KOMISS_NO, KOMISS_WORK } from '@/lib/ulsiinKomiss';
import {
  isCommissionWork, keyedCache, mergeCommission, pickCommission,
  type CommissionCand, type CommissionPartial, type PlanLikeRow,
} from '@/lib/tuhData';

const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** Нэг хуудасны «Улсын комисс» мөрийн хамгийн хожуу төлөвлөгөөт дуусгалт */
async function commissionOfSheet(pkg: Pkg): Promise<number | null> {
  const sc = await loadSchema(pkg, { synthetic: true });
  const ends = sc.end.filter((x): x is string => !!x);
  if (!ends.length || !sc.f.work) return null;
  const fill = sc.f.fillDate;
  const [j, mx] = await Promise.all([
    agsFetch(`${pkg.url}/query`, {
      where: `${sc.f.work} LIKE N'%комисс%'`,
      outFields: [sc.f.oid, sc.f.no, sc.f.work, fill, ...ends].filter(Boolean).join(','),
      orderByFields: `${sc.f.oid} DESC`,
      returnGeometry: 'false',
      f: 'json',
    }),
    /* ⚠️ Сүүлийн агшны өдөр — `bagtsSheet.latestWhere`-ийн ЯГ тэр статистик */
    fill
      ? agsFetch(`${pkg.url}/query`, {
        where: `${fill} IS NOT NULL`,
        outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: fill, outStatisticFieldName: 'mx' }]),
        returnGeometry: 'false',
      })
      : Promise.resolve(null),
  ]);
  const feats = (j.features ?? []) as { attributes: Record<string, unknown> }[];
  const cands: CommissionCand[] = [];
  for (const f of feats) {
    const a = f.attributes;
    const work = String(a[sc.f.work] ?? '').trim();
    if (!isCommissionWork(work)) continue;
    let end: number | null = null;
    for (const e of ends) {
      const v = toMs(a[e]);
      if (v != null && (end == null || v > end)) end = v;
    }
    cands.push({
      oid: Number(a[sc.f.oid]),
      fill: fill ? toMs(a[fill]) : null,
      /* ⚠️ `ulsiinKomiss.findKomissRow`-ийн таних дүрэм — «Хуваарь» ЭНЭ мөрийг харуулдаг */
      exact: String(a[sc.f.no] ?? '').trim() === KOMISS_NO && work.toLowerCase() === KOMISS_WORK.toLowerCase(),
      end,
    });
  }
  const latest = mx == null ? undefined : ((mx.features?.[0]?.attributes?.mx as number | null | undefined) ?? null);
  return pickCommission(cands, latest);
}

/**
 * Багц бүрийн УЛСЫН КОМИССЫН ОГНОО — `bagtsKey(Pkg.group)` → мс.
 * ⚠️ Нэг багц хоёр хуудастай (9F/12F) бол ХАМГИЙН ХОЖУУ нь (бүх блок дууссан агшин).
 * ⚠️ Уншигдаагүй хуудас `failed`-д — огноо нь «—» болж, «хоцролтгүй» гэж ХУДАЛ уншигдахгүй.
 * ⚠️ 2026-09-30: нэгтгэл нь `tuhData.mergeCommission` (шалгагдсан цэвэр функц) — урьд нь
 *    хоёр хуудасны НЭГ нь унахад нөгөөгийн (дутуу) огноо «—»-гийн оронд үлддэг байв.
 */
/* ⚠️ 2026-10-09: `partial` — олон хуудасны зарим нь огноогүй (`mergeCommission`-ийн ⚠️); огноо нь `null` */
export type CommissionDates = { dates: Map<string, number | null>; failed: string[]; partial: Map<string, CommissionPartial> };
export const loadCommissionDates = cached<CommissionDates>(async () => {
  const res = await Promise.all(PKGS.map(async (pkg) => {
    const key = bagtsKey(pkg.group);
    try {
      return { key, at: await commissionOfSheet(pkg), ok: true };
    } catch (e) {
      console.warn(`[selbe] ТУХ: ${pkg.key} улсын комиссын мөр уншигдсангүй`, e);
      return { key, at: null, ok: false };
    }
  }));
  return mergeCommission(res);
  /* ⚠️ 2026-10-07: ХАГАС үр дүн (`failed.length`) КЭШЛЭГДЭХГҮЙ — урьд нь `keep` байхгүй тул
     «Дахин оролдох» 5 минутын турш тэр л дутуу хуулбарыг буцаадаг байв. */
}, 5 * 60_000, ['BAGTS_SHEET'], (v) => v.failed.length === 0);

/** Сонгосон багцын хуваарийн хуудсууд (9F/12F) */
export const sheetsOf = (pkgKey: string): Pkg[] => PKGS.filter((p) => bagtsKey(p.group) === pkgKey);

/**
 * ХУУДАС ТУС БҮРИЙН МӨРИЙН КЭШ (2026-10-01, хэрэглэгч: бүгдийг зас).
 * ⚠️ Урьд нь багц нээх БҮРД тэр багцын 1–2 бүтэн хуудсыг (`outFields: *`) дахин татдаг
 *    байв — тойм ↔ багц хооронд Back/Forward хийхэд ч. Одоо хуудасны түлхүүрээр 5 мин
 *    кэшлэнэ; бөглөх хуудсанд бичилт болмогц (`bagtsSheet` → `invalidate('BAGTS_SHEET')`)
 *    шууд хаягдана — `loadCommissionDates`-тэй ижил таг, ижил TTL (өөр хэрэглэгчийн бичилт).
 */
const SHEET_TTL = 5 * 60_000;
const sheetRows = keyedCache<PlanLikeRow[]>(SHEET_TTL);
register(() => sheetRows.clear(), ['BAGTS_SHEET']);

/**
 * Дэлгэрэнгүйд хэрэгтэй БАГАНУУД л — гүн/жааз (`oid`, №, ажил, `gun`, тамга) ба
 * төлөвлөгөөт огноо, гүйцэтгэл, нөөц. ⚠️ 2026-10-01: урьд нь `*` (~60+ багана); дутуу
 * талбар `loadRows`-д `null` болж уншигдана (`loadRows`-ийн `fields` ⚠️) — энд хэрэглэдэггүй.
 */
const schedFields = (sc: Schema): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.fillDate, sc.f.asOf, sc.f.hunHuch, sc.f.mashin,
  ...sc.start, ...sc.end, ...sc.act,
].filter((x): x is string => !!x))];

async function readSheet(sheet: Pkg): Promise<PlanLikeRow[]> {
  const sc = await loadSchema(sheet, { synthetic: true });
  const r = await loadRows(sheet, sc, undefined, schedFields(sc));
  return r.rows.map((x) => ({
    work: x.work, depth: x.depth, group: x.group,
    start: x.start, end: x.end, act: x.act, hun: x.hun, mashin: x.mashin,
  }));
}

/**
 * Сонгосон багцын ХУВААРИЙН МӨРҮҮД — хуудас бүрээр.
 * ⚠️ `synthetic: true` — блокгүй багцын (5.x · 6.x · 10) мөрийн огноо нэг блок
 *    болж орно («Хуваарь» модультай ижил).
 */
export async function loadPkgSchedule(pkgKey: string): Promise<{ sheet: Pkg; rows: PlanLikeRow[] }[]> {
  return Promise.all(sheetsOf(pkgKey).map(async (sheet) => ({
    sheet,
    rows: await sheetRows.get(sheet.key, () => readSheet(sheet)),
  })));
}

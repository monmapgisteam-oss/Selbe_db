/**
 * ТУХ — «ХУВААРЬ»-ИЙН БӨГЛӨХ ХУУДСААС (Bagts_*) УНШИХ ЗАМ.
 *
 * ⚠️ ЯАГААД ТУСДАА: «Хуваарь» нь 18 бөглөх хуудсыг бүтнээр (~1,400 мөр × архивын
 *    агшин) уншдаг. ТУХ-ын ТОЙМ нь зөвхөн «Улсын комисс» мөрийн огноо хэрэгтэй
 *    тул хуудас бүрээс ЗӨВХӨН тэр мөрийг асууна (`loadCommissionDates`); бүтэн
 *    мөрүүд нь зөвхөн багц СОНГОХОД, тэр багцын 1–2 хуудсаар (`loadPkgSchedule`).
 *
 * ⚠️ АРХИВ: нийтлэх бүрд хуудас доор нь хуулбарлагддаг (`buglusun_ognoo`) тул
 *    «Улсын комисс» мөр агшин бүрд давтагдана — ХАМГИЙН ИХ ObjectID-тай (сүүлийн
 *    агшин; «Хуваарь» тэнд л бичдэг) мөрийг авна.
 *
 * ⚠️ Огноо нь «Хуваарь»-ийн ТӨЛӨВЛӨГӨӨТ (`start`/`end`) — гэрээний (`gStart`/`gEnd`)
 *    эсвэл бодит биш. Хоосон бол `null` (хэрэглэгч «Хуваарь»-т оруулна).
 */
import { PKGS, loadSchema, type Pkg } from '@/modules/sheet/bagts.pkg';
import { agsFetch } from '@/modules/sheet/ags';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { cached } from '@/lib/live';
import { bagtsKey } from '@/lib/services';
import { isCommissionWork, type PlanLikeRow } from '@/lib/tuhData';

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
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${sc.f.work} LIKE N'%комисс%'`,
    outFields: [sc.f.oid, sc.f.work, ...ends].join(','),
    orderByFields: `${sc.f.oid} DESC`,
    returnGeometry: 'false',
    f: 'json',
  });
  const feats = (j.features ?? []) as { attributes: Record<string, unknown> }[];
  /* ⚠️ Сүүлийн агшны мөр(үүд) — ObjectID хамгийн их нь эхэнд (orderBy DESC) */
  const hit = feats.find((f) => isCommissionWork(String(f.attributes[sc.f.work] ?? '')));
  if (!hit) return null;
  let out: number | null = null;
  for (const e of ends) {
    const v = toMs(hit.attributes[e]);
    if (v != null && (out == null || v > out)) out = v;
  }
  return out;
}

/**
 * Багц бүрийн УЛСЫН КОМИССЫН ОГНОО — `bagtsKey(Pkg.group)` → мс.
 * ⚠️ Нэг багц хоёр хуудастай (9F/12F) бол ХАМГИЙН ХОЖУУ нь (бүх блок дууссан агшин).
 * ⚠️ Уншигдаагүй хуудас `failed`-д — огноо нь «—» болж, «хоцролтгүй» гэж ХУДАЛ уншигдахгүй.
 */
export type CommissionDates = { dates: Map<string, number | null>; failed: string[] };
export const loadCommissionDates = cached<CommissionDates>(async () => {
  const dates = new Map<string, number | null>();
  const failed: string[] = [];
  await Promise.all(PKGS.map(async (pkg) => {
    const k = bagtsKey(pkg.group);
    try {
      const v = await commissionOfSheet(pkg);
      const cur = dates.get(k) ?? null;
      dates.set(k, v == null ? cur : cur == null || v > cur ? v : cur);
    } catch (e) {
      console.warn(`[selbe] ТУХ: ${pkg.key} улсын комиссын мөр уншигдсангүй`, e);
      failed.push(k);
      if (!dates.has(k)) dates.set(k, null);
    }
  }));
  return { dates, failed };
}, 5 * 60_000, ['BAGTS_SHEET']);

/** Сонгосон багцын хуваарийн хуудсууд (9F/12F) */
export const sheetsOf = (pkgKey: string): Pkg[] => PKGS.filter((p) => bagtsKey(p.group) === pkgKey);

/**
 * Сонгосон багцын ХУВААРИЙН МӨРҮҮД — хуудас бүрээр.
 * ⚠️ `synthetic: true` — блокгүй багцын (5.x · 6.x · 10) мөрийн огноо нэг блок
 *    болж орно («Хуваарь» модультай ижил).
 */
export async function loadPkgSchedule(pkgKey: string): Promise<{ sheet: Pkg; rows: PlanLikeRow[] }[]> {
  const sheets = sheetsOf(pkgKey);
  return Promise.all(sheets.map(async (sheet) => {
    const sc = await loadSchema(sheet, { synthetic: true });
    const r = await loadRows(sheet, sc);
    return {
      sheet,
      rows: r.rows.map((x) => ({
        work: x.work, depth: x.depth, group: x.group,
        start: x.start, end: x.end, act: x.act, hun: x.hun, mashin: x.mashin,
      })),
    };
  }));
}

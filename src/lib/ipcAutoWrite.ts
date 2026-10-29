/**
 * ГҮЙЦЭТГЭЛЭЭС IPC МӨР БИЧИХ — сүлжээний тал. Цэвэр логик нь `ipcAuto.ts`-д.
 */
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { bagtsKey, pkgKeyOf, HO_IPC, num } from '@/lib/services';
import { agsFetch } from '@/modules/sheet/ags';
import { invalidate } from '@/lib/dataBus';
import { queryFeatures } from '@/lib/query';
import { snapshotOf, LINK_FIELDS } from '@/lib/ipcLink';
import { dayOf, planAuto, autoContractFor, isAuto, autoZoruu, sheetsVerdict, type AutoPlan, type SheetRead } from '@/lib/ipcAuto';
import { isBlocklessBagts } from '@/lib/negtgelWrite';
import { uniqueBlockCounts } from '@/lib/blockProgress';
import { t as tr } from '@/lib/i18nCore';

type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

export type AutoResult =
  | { ok: true; op: AutoPlan['op']; why?: string; warn?: string }
  | { ok: false; error: string };

/**
 * НЭГ БАГЦ · НЭГ ӨДРИЙН бөглөлтөөс IPC мөр үүсгэх/шинэчлэх.
 *
 * @param bagts тухайн багцын нэр (`Pkg.group` — «Багц 3.3»)
 * @param day   архивт орсон агшны огноо `YYYY-MM-DD`
 */
export async function syncIpcFromFill(bagts: string, day: string): Promise<AutoResult> {
  const at = dayOf(day);
  if (!at) return { ok: false, error: tr('Огноо танигдсангүй: {0}', day) };

  let tried = false;
  try {
    /* ── 1. Тухайн багцын БҮХ хуудасны тэр өдрийн дүнг нийлүүлнэ ── */
    const wanted: Pkg[] = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
    if (!wanted.length) return { ok: false, error: tr('Багц олдсонгүй: {0}', bagts) };
    if (isBlocklessBagts(bagts)) return { ok: true, op: 'skip', why: 'no-data' };

    let obyem: number | null = null;
    let une: number | null = null;
    const reads: SheetRead[] = [];
    const schemas: (Schema | null)[] = await Promise.all(wanted.map((p) => loadSchema(p).catch(() => null)));
    const weights = uniqueBlockCounts(schemas.map((x) => x?.bld ?? []));

    for (const [i, pkg] of wanted.entries()) {
      const sc = schemas[i];
      if (sc && sc.bld.length > 0 && weights[i] === 0) continue;
      if (!sc?.f.fillDate) { reads.push('missing'); continue; }
      const cols = sc.obyem.filter((x): x is string => !!x);
      if (!cols.length) { reads.push('no-obyem'); continue; }
      const need = [sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.wC, sc.f.vol, sc.f.unit, ...cols]
        .filter((x): x is string => !!x);
      const upTo = await latestDayUpTo(pkg.url, sc.f.fillDate, at);
      if (!upTo) { reads.push('unpublished'); continue; }
      const { rows } = await loadRows(pkg, sc, upTo, need, { strict: true });
      if (!rows.length) { reads.push('missing'); continue; }
      reads.push('read');
      const s = snapshotOf(rows, day);
      if (s.obyem != null) obyem = (obyem ?? 0) + s.obyem;
      if (s.une != null) une = (une ?? 0) + s.une;
    }

    const verdict = sheetsVerdict(reads);
    if (!verdict.go) return verdict.result;

    /* ── 2. HO-гийн одоогийн мөрүүд ── */
    const rows = (await queryFeatures(HO_IPC.url, {
      outFields: ['*'],
      orderBy: `${HO_IPC.oid} ASC`,
    })) as Row[];

    /* ── 3. Шийдвэр ── */
    const { code, warn: cw } = autoContractFor(rows, pkgKeyOf(bagts));
    const warns = [cw, verdict.warn].filter((x): x is string => !!x);
    const wx = warns.length ? { warn: warns.join(' · ') } : {};
    const plan = planAuto(rows, { pkg: bagts, day: at, code, obyem, une });
    if (plan.op === 'skip') {
      if (plan.why === 'no-data') return { ok: true, op: 'skip', why: plan.why, ...wx };
      const error = plan.why === 'no-code'
        ? tr('IPC мөр бичсэнгүй: {0} багцын гэрээний код HO хүснэгтэд олдсонгүй', bagts)
        : plan.why === 'no-pkg'
          ? tr('IPC мөр бичсэнгүй: багцын түлхүүр танигдсангүй: {0}', bagts)
          : tr('Огноо танигдсангүй: {0}', day);
      return { ok: false, error };
    }

    /* ── 4. Бичих ── */
    const key = plan.op === 'insert' ? 'adds' : 'updates';
    tried = true;
    const j = await agsFetch(`${HO_IPC.url}/applyEdits`, {
      [key]: JSON.stringify([{ attributes: plan.attrs }]),
      rollbackOnFailure: 'true',
    });
    const res = (j[plan.op === 'insert' ? 'addResults' : 'updateResults'] ?? []) as EditRes[];
    if (res.length !== 1) return { ok: false, error: tr('Сервер үр дүн буцаасангүй — IPC мөр бичигдээгүй гэж үзнэ') };
    const bad = res.find((r) => r.success !== true);
    if (bad) return { ok: false, error: bad.error?.description || tr('Бичих амжилтгүй') };

    invalidate('HO_IPC');

    /* ── 5. Зэрэг батлалтын ДАВХАР мөр (2026-09-25-ны аудит) ── */
    if (plan.op === 'insert') {
      const newOid = Number(res[0].objectId);
      const dd = await dedupeAuto(rows, String(plan.attrs[P.id] ?? ''), newOid, { pkg: bagts, day: at, code, obyem, une });
      if (!dd.ok) return dd;
      if (dd.why === 'dedup') return { ...dd, ...wx };
    }

    /* ── 6. Гэрээний AUTO мөрүүдийн зөрүүг шинэчилнэ (`refreshAutoZoruu`) ── */
    const rz = await refreshAutoZoruu(code);
    if (!rz.ok) {
      console.warn('[selbe] IPC зөрүүг дахин бодож чадсангүй:', rz.error);
      return { ok: true, op: plan.op, why: rz.error, ...wx };
    }
    return { ok: true, op: plan.op, ...wx };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (tried) invalidate('HO_IPC');
  }
}

/**
 * Хуудасны `day`-ээс ХОЙШГҮЙ хамгийн сүүлийн жаазны огноо (`YYYY-MM-DD`,
 * UTC — `bagtsSheet.dayFilter`/`msToDay`-тай ижил). Жааз байхгүй бол `null`.
 */
async function latestDayUpTo(url: string, fld: string, day: string): Promise<string | null> {
  const j = await agsFetch(`${url}/query`, {
    where: `${fld} <= timestamp '${day} 23:59:59'`,
    outStatistics: JSON.stringify([
      { statisticType: 'max', onStatisticField: fld, outStatisticFieldName: 'mx' },
    ]),
    returnGeometry: 'false',
  });
  const mx = num(j.features?.[0]?.attributes?.mx);
  return mx == null ? null : new Date(mx).toISOString().slice(0, 10);
}

/** `applyEdits`-ийн мөр бүрийн үр дүн */
type EditRes = { success?: boolean; objectId?: number; error?: { description?: string } };

/**
 * ЗЭРЭГ БАТЛАЛТЫН ДАВХАР AUTO МӨРИЙГ ЦЭВЭРЛЭНЭ — ЗӨВХӨН ӨӨРИЙН нэмсэн мөрийг.
 *
 * ДҮРЭМ: нэмсний ДАРАА тэр ID-тай мөрүүдийг сервероос ДАХИН уншина (`agsFetch`
 *    — `queryFeatures`-ийн in-flight хуваалцалт нэмэхээс ӨМНӨХ хариуг өгч
 *    болно). ХАМГИЙН БАГА OID-той нь үлдэнэ (`findAutoRow`-той ижил сонголт).
 *    Манайх түүнээс их бол: үлдэх мөрийг МАНАЙ утгаар шинэчилж, манайхыг
 *    устгана. Хоёр тал ижил дүрмээр явдаг тул үргэлж НЭГ мөр үлдэнэ.
 */
async function dedupeAuto(
  before: Row[],
  id: string,
  newOid: number,
  a: { pkg: string; day: string; code: string; obyem: number | null; une: number | null },
): Promise<AutoResult> {
  if (!id || !Number.isFinite(newOid)) return { ok: true, op: 'insert' };
  const j = await agsFetch(`${HO_IPC.url}/query`, {
    where: `${P.id} = N'${id.replace(/'/g, "''")}'`,
    outFields: '*',
    returnGeometry: 'false',
    orderByFields: `${HO_IPC.oid} ASC`,
  });
  const twins = ((j.features ?? []) as { attributes: Row }[]).map((f) => f.attributes);
  const keep = twins[0];
  const keepOid = keep ? num(keep[HO_IPC.oid]) : null;
  if (!keep || keepOid == null || keepOid >= newOid) return { ok: true, op: 'insert' };

  /* Манайх хожимдсон — үлдэх мөрийг манай утгаар шинэчилнэ (зөрүү нь
     гэрээний хуримтлалаар, `planAuto` → `autoUpdate`). */
  const plan = planAuto([...before, keep], a);
  if (plan.op === 'update') {
    const u = await agsFetch(`${HO_IPC.url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: plan.attrs }]),
      rollbackOnFailure: 'true',
    });
    const ur = (u.updateResults ?? []) as EditRes[];
    if (ur.length !== 1 || ur[0].success !== true)
      return { ok: false, error: ur[0]?.error?.description || tr('Давхар IPC мөрийг нэгтгэж чадсангүй') };
  }
  const d = await agsFetch(`${HO_IPC.url}/applyEdits`, {
    deletes: String(newOid),
    rollbackOnFailure: 'true',
  });
  const dr = (d.deleteResults ?? []) as EditRes[];
  invalidate('HO_IPC');
  if (dr.length !== 1 || dr[0].success !== true)
    return {
      ok: false,
      error: tr('Давхар IPC мөр (бүртгэл №{0}) үлдлээ — админд мэдэгдэнэ үү (гараар устгах шаардлагатай): {1}', newOid, dr[0]?.error?.description ?? ''),
    };
  return { ok: true, op: 'update', why: 'dedup' };
}

/**
 * ГЭРЭЭНИЙ AUTO МӨРҮҮДИЙН ЗӨРҮҮГ ДАХИН БОДНО (`guits_zoruu`).
 *
 * ДҮРЭМ: `ipcAuto.autoZoruu` (олгосон ХУРИМТЛАЛ − хадгалсан `guits_une`).
 *    ЗӨВХӨН AUTO мөр — гараар оруулсан мөрийн `une` бодогдоогүй (агшингүй)
 *    тул тэдгээрийг ХӨНДӨХГҮЙ. Утга нь ӨӨРЧЛӨГДСӨН мөрийг л бичнэ.
 *
 * @param code гэрээний код (`geree_kod`). `undefined` бол БҮХ гэрээний AUTO
 *   мөр (санхүүгийн хүснэгтийг хадгалсны дараа — аль гэрээ засагдсаныг
 *   мэдэхгүй); хоосон мөр бол юу ч хийхгүй.
 */
export async function refreshAutoZoruu(
  code?: string,
): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const want = code === undefined ? null : String(code).trim();
  if (want === '') return { ok: true, n: 0 };
  let n = 0;
  let tried = false;
  try {
    const rows: Row[] = [];
    for (let offset = 0; ; ) {
      const q = await agsFetch(`${HO_IPC.url}/query`, {
        where: '1=1',
        outFields: '*',
        returnGeometry: 'false',
        orderByFields: `${HO_IPC.oid} ASC`,
        resultRecordCount: '2000',
        resultOffset: String(offset),
      });
      const fs = ((q.features ?? []) as { attributes: Row }[]).map((x) => x.attributes);
      rows.push(...fs);
      if (!q.exceededTransferLimit || fs.length === 0) break;
      offset += fs.length;
    }
    const Z = LINK_FIELDS.zoruu;
    const same = (x: number | null, y: number | null) =>
      x == null || y == null ? x === y : Math.abs(x - y) < 0.5;
    const upd: Row[] = [];
    for (const r of rows) {
      if (!isAuto(r) || (want != null && String(r[C.code] ?? '').trim() !== want)) continue;
      const oid = num(r[HO_IPC.oid]);
      if (oid == null) continue;
      const z = autoZoruu(rows, r, num(r[LINK_FIELDS.une]));
      if (same(z, num(r[Z]))) continue;
      upd.push({ [HO_IPC.oid]: oid, [Z]: z });
    }
    for (let i = 0; i < upd.length; i += 500) {
      const part = upd.slice(i, i + 500);
      tried = true;
      const j = await agsFetch(`${HO_IPC.url}/applyEdits`, {
        updates: JSON.stringify(part.map((attributes) => ({ attributes }))),
        rollbackOnFailure: 'true',
      });
      const res = (j.updateResults ?? []) as EditRes[];
      const okN = res.filter((x) => x.success === true).length;
      n += okN;
      if (res.length !== part.length || okN !== part.length) {
        const bad = res.find((x) => x.success !== true);
        return { ok: false, error: bad?.error?.description || tr('IPC зөрүү {0}/{1} мөрд бичигдсэнгүй', part.length - okN, part.length) };
      }
    }
    return { ok: true, n };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (tried) invalidate('HO_IPC');
  }
}

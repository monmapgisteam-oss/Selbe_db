/**
 * ГҮЙЦЭТГЭЛЭЭС IPC МӨР БИЧИХ — сүлжээний тал. Цэвэр логик нь `ipcAuto.ts`-д.
 */
import { requireWriter } from './writeGuard';
import { requireCap } from './who';
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { bagtsKey, pkgKeyOf, HO_IPC, num } from '@/lib/services';
import { agsFetch } from '@/modules/sheet/ags';
import { invalidate } from '@/lib/dataBus';
import { queryFeatures } from '@/lib/query';
import { snapshotDayOf, LINK_FIELDS } from '@/lib/ipcLink';
import { dayOf, planAuto, autoContractFor, planAutoZoruu, sheetsVerdict, autoDay, isAuto, isCancelledRow, isLockedRow, type AutoPlan, type SheetRead } from '@/lib/ipcAuto';
import { uniqueBlockCounts } from '@/lib/blockProgress';
import { t as tr } from '@/lib/i18nCore';

type Row = Record<string, unknown>;

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
/**
 * НЭГЖ ҮНИЙГ ХОЖИМ ТАВЬСАН АЖЛЫН МӨНГИЙГ НӨХӨХ (2026-11-11, хэрэглэгч зөвшөөрсөн). Жааз бүр тэр өдрийн нэгж үнийг хадгалдаг тул
 * батлах үед үнэгүй байсан ажил IPC дүнд ороогүй, хожим үнэ тавьсан ч тэр өдрийн мөр дахин бодогддоггүй байв.
 * Гэрээний IPC-д ОРООГҮЙ («Гүйцэтгэл») AUTO мөр бүрийг: тэр өдрийн обьём × (тэр өдрийн үнэ, хоосон бол ОДООГИЙН үнэ) гэж дахин
 * бодож, зөрсөн бол `guits_une`-г шинэчилнэ. IPC-д орсон мөр, нэг өдөрт олон мөртэй өдөр, уншигдаагүй хуудастай өдрийг хөндөхгүй.
 * @returns шинэчилсэн мөрийн тоо
 */
/** Одоо ч чөлөөт («Гүйцэтгэл», IPC дугааргүй) мөрийн objectid-ууд — бичихийн өмнөх дахин шалгалт (цэвэр) */
export function stillFree(rows: readonly Row[]): Set<number> {
  const out = new Set<number>();
  for (const r of rows) {
    const oid = Number(r[HO_IPC.oid]);
    const st = String(r[HO_IPC.status.field] ?? '').trim();
    if (Number.isFinite(oid) && (st === HO_IPC.status.work || st === '') && r[P.ipcNo] == null) out.add(oid);
  }
  return out;
}

/**
 * ИЖИЛ БАГЦ · ИЖИЛ ӨДРИЙН БУСАД (цуцлагдаагүй) AUTO мөр (2026-11-23, аудит №11) — `AUTO|P|D` ба `AUTO|P|D|2` ялгаатай
 * `murun_id`-тай тул урьд нь «давхар биш» гэж үзэж, хоёуланд нь өдрийн БҮТЭН дүнг бичдэг байв (IPC-д орсон хэсэг дахин
 * төлөгдөнө). `planAuto`-гийн адил эдгээрийн дүнг хасна (цэвэр).
 */
export function sameDayOthers(rows: readonly Row[], r: Row): Row[] {
  const C = HO_IPC.contractFields;
  const key = pkgKeyOf(r[C.pkg]);
  const day = autoDay(r);
  return rows.filter((x) => x !== r && isAuto(x) && !isCancelledRow(x) && autoDay(x) === day && pkgKeyOf(x[C.pkg]) === key);
}

/**
 * ДАХИН ҮНЭЛЭХ МӨР (2026-11-23, хяналт) — `r`-ийн (багц, өдөр)-т `planAuto`-гийн шинэчлэх мөр (`isLockedRow` биш ЭХНИЙХ, OID-ийн
 * дарааллаар). Бусад сул мөр дахин үнэлэгдэхгүй (цэвэр).
 */
export function repricePick(rows: readonly Row[], r: Row): Row | undefined {
  const C = HO_IPC.contractFields;
  const key = pkgKeyOf(r[C.pkg]);
  const day = autoDay(r);
  return rows.find((x) => isAuto(x) && autoDay(x) === day && pkgKeyOf(x[C.pkg]) === key && !isLockedRow(x));
}

/** `planAuto`-гийн шинэчлэлт хадгалсан утгаас ялгаагүй юу (давталтын зогсоох нөхцөл, цэвэр) */
export function autoUnchanged(rows: readonly Row[], attrs: Record<string, unknown>): boolean {
  const oid = Number(attrs[HO_IPC.oid]);
  const cur = rows.find((r) => Number(r[HO_IPC.oid]) === oid);
  if (!cur) return false;
  const same = (f: string, eps: number) => {
    const x = num(attrs[f]);
    const y = num(cur[f]);
    return x == null ? y == null : y != null && Math.abs(x - y) < eps;
  };
  return same(LINK_FIELDS.obyem, 1e-6) && same(LINK_FIELDS.une, 0.5);
}

/** HO мөрүүдийг СЕРВЕРООС ШУУД (хуваалцсан/кэшлэсэн хариугүй) — зэрэг бичилтийн дараах дахин уншилт */
async function loadHoFresh(where = '1=1', outFields = '*'): Promise<Row[]> {
  const out: Row[] = [];
  for (let off = 0; ; ) {
    const j = await agsFetch(`${HO_IPC.url}/query`, {
      where, outFields, orderByFields: `${HO_IPC.oid} ASC`, resultOffset: String(off), resultRecordCount: '2000', returnGeometry: 'false',
    });
    const f = ((j.features ?? []) as { attributes: Row }[]).map((x) => x.attributes);
    out.push(...f);
    if (!f.length || (!j.exceededTransferLimit && f.length < 2000)) break;
    off += f.length;
  }
  return out;
}

export async function repriceFreeRows(code: string): Promise<number> {
  /* «IPC үүсгэх» эрхтэй хүн л — урьд нь зөвхөн дэлгэцийн нөхцөлөөр (`IpcFlow` `canCreate`) хамгаалагддаг байв */
  requireCap('ipcCreate');
  const rows = (await queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` })) as Row[];
  const C = HO_IPC.contractFields;
  const mine = rows.filter((r) => String(r[P.id] ?? '').startsWith('AUTO|') && String(r[C.code] ?? '').trim() === code);
  const dayOfRow = (r: Row) => String(r[P.id]).split('|')[2] ?? '';
  const free = mine.filter((r) => String(r[HO_IPC.status.field] ?? '').trim() === HO_IPC.status.work);
  const updates: Record<string, unknown>[] = [];
  const latestUnits = new Map<string, Map<number, number>>(); // pkg.key → des → одоогийн нэгж үнэ
  for (const r of free) {
    const day = dayOf(dayOfRow(r));
    const bagts = String(r[C.pkg] ?? '');
    if (!day || !bagts) continue;
    /* 2026-11-23 (засвар): ижил БАГЦ · ижил өдрийн мөр л давхардал. Урьд нь зөвхөн өдрөөр тулгадаг байсан тул олон багцтай
       гэрээний (БАГЦ-10,11) нэг өдрийн хоёр багцын мөр хоёулаа алгасагдаж, хожим оруулсан нэгж үнэ хэзээ ч бичигддэггүй байв. */
    if (mine.filter((x) => String(x[P.id]) === String(r[P.id])).length !== 1) continue;
    /* 2026-11-23 (хяналт): нэг (багц, өдөр)-т хоёр СУЛ мөр байвал хоёуланг нь «нийт − нөгөөгийн ХУУЧИН дүн»-ээр бичдэг байсан тул
       нийлбэр нь 2T′ − T болж нэмэгдлийг давхар төлдөг байв — `planAuto`-гийн сонгох мөрийг (түгжээгүй ЭХНИЙХ) л дахин үнэлнэ */
    if (repricePick(rows, r) !== r) continue;
    const others = sameDayOthers(mine, r);
    const wanted: Pkg[] = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
    const schemas: (Schema | null)[] = await Promise.all(wanted.map((p) => loadSchema(p, p.floors == null ? { fill: true } : {}).catch(() => null)));
    const weights = uniqueBlockCounts(schemas.map((x) => x?.bld ?? []));
    let une: number | null = null;
    let ok = true;
    let filled = 0;
    for (const [i, pkg] of wanted.entries()) {
      const sc = schemas[i];
      if (sc && sc.bld.length > 0 && weights[i] === 0) continue;
      if (!sc?.f.fillDate) { ok = false; break; }
      const cols = sc.obyem.filter((x): x is string => !!x);
      if (!cols.length) continue;
      const need = [sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.wC, sc.f.vol, sc.f.unit, sc.f.des, ...cols].filter((x): x is string => !!x);
      const upTo = await latestDayUpTo(pkg.url, sc.f.fillDate, day);
      if (upTo !== day) continue;
      const dayRows = (await loadRows(pkg, sc, day, need, { strict: true })).rows;
      if (!dayRows.length) { ok = false; break; }
      if (dayRows.some((x) => !x.group && x.unit == null)) {
        let units = latestUnits.get(pkg.key);
        if (!units) {
          units = new Map();
          for (const x of (await loadRows(pkg, sc, undefined, need, { strict: true })).rows) if (x.des != null && x.unit != null) units.set(x.des, x.unit);
          latestUnits.set(pkg.key, units);
        }
        for (const x of dayRows) if (!x.group && x.unit == null && x.des != null && units.has(x.des)) { x.unit = units.get(x.des)!; filled += 1; }
      }
      const s = snapshotDayOf(dayRows, day);
      if (s.une != null) une = (une ?? 0) + s.une;
    }
    if (!ok || !filled || une == null) continue;
    /* Өдрийн жааз өдрийн НИЙТ ажлыг хадгалдаг — тэр өдрийн бусад мөрийн (IPC-д орсон ч) дүнг хасна (аудит №11) */
    if (others.length) une = Math.round((une - others.reduce((a, x) => a + (num(x[LINK_FIELDS.une]) ?? 0), 0)) * 1e6) / 1e6;
    if (une < 0) continue;
    const was = num(r[LINK_FIELDS.une]);
    if (was != null && Math.abs(was - une) < 0.5) continue;
    updates.push({ [HO_IPC.oid]: num(r[HO_IPC.oid]), [LINK_FIELDS.une]: une });
  }
  if (!updates.length) return 0;
  /* 2026-11-23 (аудит): хуудас уншиж байх хооронд (секундүүд) IPC-д түгжигдсэн мөрийн дүнг дардаг байв — бичихийн ӨМНӨ дахин уншиж,
     «Гүйцэтгэл» төлөвт үлдсэн мөрийг л бичнэ */
  const now = (await queryFeatures(HO_IPC.url, { where: `${HO_IPC.oid} IN (${updates.map((u) => Number(u[HO_IPC.oid])).join(',')})`, outFields: [HO_IPC.oid, HO_IPC.status.field, P.ipcNo] })) as Row[];
  const keep = stillFree(now);
  for (let i = updates.length - 1; i >= 0; i -= 1) if (!keep.has(Number(updates[i][HO_IPC.oid]))) updates.splice(i, 1);
  if (!updates.length) return 0;
  const j = await agsFetch(`${HO_IPC.url}/applyEdits`, { updates: JSON.stringify(updates.map((attributes) => ({ attributes }))), rollbackOnFailure: 'true' });
  const res = (j.updateResults ?? []) as EditRes[];
  if (res.length !== updates.length || res.some((x) => x.success !== true)) throw new Error(tr('Бичих амжилтгүй'));
  invalidate('HO_IPC');
  await refreshAutoZoruu(code).catch(() => undefined);
  return updates.length;
}

export async function syncIpcFromFill(bagts: string, day: string): Promise<AutoResult> {
  await requireWriter();
  const at = dayOf(day);
  if (!at) return { ok: false, error: tr('Огноо танигдсангүй: {0}', day) };

  let tried = false;
  try {
    /* ── 1. Тухайн багцын БҮХ хуудасны тэр өдрийн дүнг нийлүүлнэ ── */
    const wanted: Pkg[] = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
    if (!wanted.length) return { ok: false, error: tr('Багц олдсонгүй: {0}', bagts) };

    /* Блокгүй хуудас: `obyem_sum` зөвхөн бөглөх бүдүүвчид (`fill`) орно; `synthetic` бол IPC мөр чимээгүй алга болдог */
    const schemas: (Schema | null)[] = await Promise.all(wanted.map((p) => loadSchema(p, p.floors == null ? { fill: true } : {}).catch(() => null)));
    const weights = uniqueBlockCounts(schemas.map((x) => x?.bld ?? []));

    /** Тухайн өдрийн БҮХ хуудасны дүн — давталт бүрд ШИНЭЭР уншина (зэрэг батлалт өөр хуудсыг энэ хооронд бичсэн байж болно) */
    const readDay = async () => {
      let obyem: number | null = null;
      let une: number | null = null;
      const reads: SheetRead[] = [];
      let noUnit = 0;
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
        /* 2026-11-04: жааз бүр ТУХАЙН ӨДРИЙН ажил — тэр өдөр жаазгүй хуудас 0 оролцоотой (өмнөх өдрийн жаазны ажил дахин тоологдохгүй) */
        if (upTo !== at) { reads.push('no-frame'); continue; }
        const { rows } = await loadRows(pkg, sc, at, need, { strict: true });
        if (!rows.length) { reads.push('missing'); continue; }
        reads.push('read');
        /* 2026-11-04: тухайн өдрийн ажил (хуримтлал биш) — жааз бүр IPC-ийн дүн */
        const s = snapshotDayOf(rows, day);
        if (s.obyem != null) obyem = (obyem ?? 0) + s.obyem;
        if (s.une != null) une = (une ?? 0) + s.une;
        noUnit += s.noUnit ?? 0;
      }
      return { obyem, une, reads, noUnit };
    };

    /*
     * 2026-11-23 (аудит №13): ЗЭРЭГ БАТЛАЛТ — нэг багцын 9F/12F хуудсыг секундын зайтай батлахад нэг нь нөгөөгийн жааз
     * үүсэхээс өмнө уншиж, хожуу бичсэнээрээ нөгөө хуудасны ажлыг IPC-ээс хасдаг байв (хоёулаа «бүртгэгдсэн» тул дахин
     * ажиллахгүй). Одоо бичсний дараа хуудас ба HO-г ШИНЭЭР уншиж дахин төлөвлөнө — бичих зүйлгүй болтол (дээд тал 3 удаа).
     * Шинэчлэхийн өмнө зорилтот мөр одоо ч чөлөөт эсэхийг шалгана (IPC-д түгжигдсэн мөрийн дүнг дарахгүй).
     */
    let wrote: 'insert' | 'update' | null = null;
    let wx: { warn?: string } = {};
    let code = '';
    let dedup = false;
    for (let pass = 0; pass < 3; pass += 1) {
      const { obyem, une, reads, noUnit } = await readDay();
      const verdict = sheetsVerdict(reads);
      if (pass === 0) {
        if (!verdict.go) return verdict.result;
      } else if (!verdict.go) break;

      /* ── 2. HO-гийн одоогийн мөрүүд (давталтад сервероос шууд — `queryFeatures`-ийн хуваалцсан хариу хуучин байж болно) ── */
      const rows = (pass === 0
        ? await queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` })
        : await loadHoFresh()) as Row[];

      /* ── 3. Шийдвэр ── */
      const { code: c, warn: cw } = autoContractFor(rows, pkgKeyOf(bagts));
      code = c;
      const unitWarn = noUnit ? tr('{0} мөр нэгж үнэгүй тул IPC дүнд ороогүй — нэгж үнийг бөглөнө үү.', noUnit) : null;
      const warns = [cw, verdict.warn, unitWarn].filter((x): x is string => !!x);
      wx = warns.length ? { warn: warns.join(' · ') } : {};
      const plan = planAuto(rows, { pkg: bagts, day: at, code, obyem, une });
      if (plan.op === 'skip') {
        if (pass > 0) break;
        if (plan.why === 'no-data') return { ok: true, op: 'skip', why: plan.why, ...wx };
        /* Блокгүй багцад гэрээ хараахан алга (шинэ 40 хүснэгт г.м.): актлах гэрээ байхгүй — батлалтыг гацаахгүй. Өмнөх мөнгө хэвээр */
        if (plan.why === 'no-code' && wanted.every((p) => p.floors == null)) {
          return { ok: true, op: 'skip', why: 'no-data', warn: [...warns, tr('{0} багцад гэрээ бүртгэгдээгүй тул IPC мөр үүссэнгүй.', bagts)].join(' · ') };
        }
        const error = plan.why === 'no-code'
          ? tr('IPC мөр бичсэнгүй: {0} багцын гэрээний код HO хүснэгтэд олдсонгүй', bagts)
          : plan.why === 'no-pkg'
            ? tr('IPC мөр бичсэнгүй: багцын түлхүүр танигдсангүй: {0}', bagts)
            : tr('Огноо танигдсангүй: {0}', day);
        return { ok: false, error };
      }
      /* Давталтад: хадгалсан утга аль хэдийн зөв — тогтворжсон */
      if (pass > 0 && plan.op === 'update' && autoUnchanged(rows, plan.attrs)) break;
      if (plan.op === 'update') {
        const oid = Number(plan.attrs[HO_IPC.oid]);
        const now = await loadHoFresh(`${HO_IPC.oid} = ${oid}`, [HO_IPC.oid, HO_IPC.status.field, P.ipcNo].join(','));
        /* Энэ хооронд IPC-д түгжигдсэн — дараагийн давталт шинэ мөр болгож төлөвлөнө */
        if (!stillFree(now).has(oid)) continue;
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
      wrote = wrote ?? plan.op;

      invalidate('HO_IPC');

      /* ── 5. Зэрэг батлалтын ДАВХАР мөр (2026-09-25-ны аудит) — үлдэх мөрийн утгыг дараагийн давталт ШИНЭ уншилтаар засна ── */
      if (plan.op === 'insert') {
        const newOid = Number(res[0].objectId);
        const dd = await dedupeAuto(rows, String(plan.attrs[P.id] ?? ''), newOid, { pkg: bagts, day: at, code, obyem, une });
        if (!dd.ok) return dd;
        if (dd.why === 'dedup') { dedup = true; wrote = 'update'; }
      }
    }
    if (dedup) return { ok: true, op: 'update', why: 'dedup', ...wx };
    if (!wrote) return { ok: true, op: 'skip', why: 'no-data', ...wx };

    /* ── 6. Гэрээний AUTO мөрүүдийн зөрүүг шинэчилнэ (`refreshAutoZoruu`) ── */
    const rz = await refreshAutoZoruu(code);
    if (!rz.ok) {
      console.warn('[selbe] IPC зөрүүг дахин бодож чадсангүй:', rz.error);
      return { ok: true, op: wrote, why: rz.error, ...wx };
    }
    return { ok: true, op: wrote, ...wx };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (tried) invalidate('HO_IPC');
  }
}

/**
 * Хуудасны `day`-ээс ХОЙШГҮЙ хамгийн сүүлийн жаазны огноо (`YYYY-MM-DD`,
 * UTC — `bagtsSheet.dayFilter`/`msToDay`-тай ижил). Жааз байхгүй бол `null`.
 * `day`-тэй тэнцвэл тэр өдөр жааз БИЙ (`syncIpcFromFill` зөвхөн тэр үед уншина).
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
    /* Цэвэр тооцоо — `ipcAuto.planAutoZoruu` (2026-11-04: data-audit зөвхөн уншихдаа ч ижил дүрэм) */
    const Z = LINK_FIELDS.zoruu;
    const upd: Row[] = planAutoZoruu(rows, code).map(({ oid, to }) => ({ [HO_IPC.oid]: oid, [Z]: to }));
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

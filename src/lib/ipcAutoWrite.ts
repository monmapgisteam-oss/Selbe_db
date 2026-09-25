/**
 * ГҮЙЦЭТГЭЛЭЭС IPC МӨР БИЧИХ — сүлжээний тал. Цэвэр логик нь `ipcAuto.ts`-д.
 *
 * ⚠️ ДУУДАГДАХ ЦОРЫН ГАНЦ ГАЗАР: `hyanaltStore`-ийн батлах зам, 4 шатын
 * хяналт дуусаж архивт бичигдсэний ДАРАА (`registerApproved`-ийн хажууд).
 * Батлагдаагүй бөглөлтөөс IPC үүсгэвэл хянагч буцаахад ХУДАЛ IPC үлдэнэ.
 *
 * ⚠️ АЛДАА ГАРВАЛ БАТАЛГААГ УНАГААХГҮЙ. `registerApproved`-ийн ЯГ ижил
 * зарчим: хяналтын шийдвэр аль хэдийн хадгалагдсан байхад «болсонгүй» гэж
 * харуулбал менежер дахин дарж давхардал үүсгэнэ. Алдааг буцааж, дуудагч
 * тал зөвхөн бүртгэнэ.
 */
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { bagtsKey, pkgKeyOf, HO_IPC, num } from '@/lib/services';
import { agsFetch } from '@/modules/sheet/ags';
import { invalidate } from '@/lib/dataBus';
import { queryFeatures } from '@/lib/query';
import { snapshotOf, LINK_FIELDS } from '@/lib/ipcLink';
import { dayOf, planAuto, contractCodeOf, isAuto, autoZoruu, type AutoPlan } from '@/lib/ipcAuto';
import { t as tr } from '@/lib/i18nCore';

type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

export type AutoResult =
  | { ok: true; op: AutoPlan['op']; why?: string }
  | { ok: false; error: string };

/**
 * НЭГ БАГЦ · НЭГ ӨДРИЙН бөглөлтөөс IPC мөр үүсгэх/шинэчлэх.
 *
 * @param bagts тухайн багцын нэр (`Pkg.group` — «Багц 3.3»)
 * @param day   архивт орсон агшны огноо `YYYY-MM-DD`
 *
 * ⚠️ ТЭР АГШНЫ дүнг бодно. Бөглөх хуудасны обьём нь ХУРИМТЛАГДСАН (өссөн
 * дүн) тул агшин бүр өөрөө тухайн үеийн НИЙТ байдлыг илэрхийлнэ — агшнуудыг
 * нэмэх нь ДАВХАРДУУЛНА.
 */
export async function syncIpcFromFill(bagts: string, day: string): Promise<AutoResult> {
  const at = dayOf(day);
  if (!at) return { ok: false, error: tr('Огноо танигдсангүй: {0}', day) };

  try {
    /* ── 1. Тухайн багцын БҮХ хуудасны тэр өдрийн дүнг нийлүүлнэ ──
       ⚠️ Багц бүр 1–2 хуудастай (9F + 12F) бөгөөд гэрээ нь НЭГ. */
    const wanted: Pkg[] = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
    if (!wanted.length) return { ok: false, error: tr('Багц олдсонгүй: {0}', bagts) };

    let obyem: number | null = null;
    let une: number | null = null;
    let read = 0;
    /* ⚠️ ХУУДАС ДУТУУ эсэхийг ТУСАД НЬ тоолно (2026-09-15-ны аудит) */
    let missing = 0;

    for (const pkg of wanted) {
      const sc: Schema | null = await loadSchema(pkg).catch(() => null);
      if (!sc?.f.fillDate) { missing += 1; continue; }
      const cols = sc.obyem.filter((x): x is string => !!x);
      if (!cols.length) { missing += 1; continue; }
      /*
       * ⚠️ `work` ба `gun` ЗААВАЛ (2026-09-25-ны аудит). Урьд нь орхигдсон тул
       *    `loadRows` дотор мөр бүрийн түлхүүр «№ ¦ » болж суурь агшны «№ ¦ Ажил»-тай
       *    хэзээ ч таардаггүй (`alignInsertions` → null), `hasGun` үргэлж худал,
       *    № хоосон мөр ч `!work && !no`-оор хасагддаг байв. Мөр нэмэгдсэн багцад
       *    (Багц 2·9F: 1,388 ↔ TREES 1,386) энэ нь «… мөр ирлээ» гэж унаж IPC
       *    хэзээ ч бичигдэхгүй, тоо санамсаргүй тэнцвэл гүн гулсаж бүлэг/навч
       *    солигдон `guits_une` ХУДАЛ бичигддэг. `ceo/qaqc.loadTreeRows`-той ижил
       *    шатлалын талбарууд.
       */
      const need = [sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.wC, sc.f.vol, sc.f.unit, ...cols]
        .filter((x): x is string => !!x);
      const { rows } = await loadRows(pkg, sc, day, need);
      if (!rows.length) { missing += 1; continue; }
      read += 1;
      const s = snapshotOf(rows, day);
      if (s.obyem != null) obyem = (obyem ?? 0) + s.obyem;
      if (s.une != null) une = (une ?? 0) + s.une;
    }

    /* ⚠️ НЭГ Ч ХУУДАС УНШИГДААГҮЙ бол «гүйцэтгэл 0» ГЭЖ БҮҮ БИЧ — энэ нь
       сүлжээний/бүдүүвчийн асуудал байж болно. Алдаа буцаана. */
    if (!read) return { ok: false, error: tr('Бөглөх хуудаснаас агшин уншигдсангүй') };
    /*
     * ⚠️ БАГЦЫН ХУУДАС ДУТУУ бол ч БИЧИХГҮЙ (2026-09-15-ны аудит). Урьд нь
     *    `read >= 1` хангалттай гэж үздэг байсан тул хоёр хуудастай багцын
     *    (9F + 12F) нэг нь тэр өдөр бөглөгдөөгүй бол `guits_une` нь зөвхөн
     *    нөгөөгийнх болж, `guits_zoruu` тэр багцад тогтмол эерэг («илүү
     *    олгосон») гардаг байв. Тэр зөрүү ArcGIS руу БУЦААЖ БИЧИГДДЭГ тул
     *    худал тоо эх өгөгдөлд үлдэнэ.
     */
    if (missing) {
      return {
        ok: false,
        error: tr('Багцын {0} хуудаснаас {1} нь тэр өдөр бөглөгдөөгүй — дутуу дүнгээр гүйцэтгэл бичихгүй.', wanted.length, missing),
      };
    }

    /* ── 2. HO-гийн одоогийн мөрүүд ── */
    const rows = (await queryFeatures(HO_IPC.url, {
      outFields: ['*'],
      orderBy: `${HO_IPC.oid} ASC`,
    })) as Row[];

    /* ── 3. Шийдвэр ── */
    /* ⚠️ Гэрээний кодыг БАЙГАА мөрөөс авна — таамаглавал мөр буруу
       бүлэгт очно (2026-09-10-ний бодит алдаа). */
    const code = contractCodeOf(rows, pkgKeyOf(bagts));
    const plan = planAuto(rows, { pkg: bagts, day: at, code, obyem, une });
    /* ⚠️ 2026-09-25: ЗӨВХӨН `no-data` (хэмжилтгүй бөглөлт — хэвийн) нь амжилт.
       Бусад шалтгаан (гэрээний код олдоогүй, багц/огноо танигдаагүй) нь IPC мөр
       ҮҮСЭЭГҮЙ гэсэн үг — урьд нь `ok: true` буцааж, дуудагч «бүртгэгдсэн» гэж
       тэмдэглэдэг тул мөр нь хэзээ ч нөхөгдөхгүй, алдаа ч харагддаггүй байв. */
    if (plan.op === 'skip') {
      if (plan.why === 'no-data') return { ok: true, op: 'skip', why: plan.why };
      const error = plan.why === 'no-code'
        ? tr('IPC мөр бичсэнгүй: {0} багцын гэрээний код HO хүснэгтэд олдсонгүй', bagts)
        : plan.why === 'no-pkg'
          ? tr('IPC мөр бичсэнгүй: багцын түлхүүр танигдсангүй: {0}', bagts)
          : tr('Огноо танигдсангүй: {0}', day);
      return { ok: false, error };
    }

    /* ── 4. Бичих ──
       ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — мөр БҮРИЙН үр дүнг шалгана. */
    const key = plan.op === 'insert' ? 'adds' : 'updates';
    const j = await agsFetch(`${HO_IPC.url}/applyEdits`, {
      [key]: JSON.stringify([{ attributes: plan.attrs }]),
      rollbackOnFailure: 'true',
    });
    const res = (j[plan.op === 'insert' ? 'addResults' : 'updateResults'] ?? []) as EditRes[];
    /* ⚠️ ХООСОН ХАРИУГ АМЖИЛТ ГЭЖ ҮЗЭХГҮЙ (2026-09-17) — `submission.ts`,
       `zovshoorol.deleteZov`-той ижил: нэг мөр илгээсэн тул яг нэг үр дүн ирнэ. */
    if (res.length !== 1) return { ok: false, error: tr('Сервер үр дүн буцаасангүй — IPC мөр бичигдээгүй гэж үзнэ') };
    const bad = res.find((r) => r.success === false);
    if (bad) return { ok: false, error: bad.error?.description || tr('Бичих амжилтгүй') };

    /* ⚠️ Кэшийг хүчингүй болгоно — эс бөгөөс «Санхүүжилт» хуудас шинэ
       мөрийг харахгүй (dataBus.invariant.check.mjs энэ дүрмийг барина). */
    invalidate('HO_IPC');

    /* ── 5. Зэрэг батлалтын ДАВХАР мөр (2026-09-25-ны аудит) ── */
    if (plan.op === 'insert') {
      const newOid = Number(res[0].objectId);
      const dd = await dedupeAuto(rows, String(plan.attrs[P.id] ?? ''), newOid, { pkg: bagts, day: at, code, obyem, une });
      if (!dd.ok) return dd;
    }

    /* ── 6. Гэрээний AUTO мөрүүдийн зөрүүг шинэчилнэ (`refreshAutoZoruu`) ──
       ⚠️ Унавал IPC мөр аль хэдийн бичигдсэн тул `ok` хэвээр — зөвхөн бүртгэнэ. */
    const rz = await refreshAutoZoruu(code);
    if (!rz.ok) {
      console.warn('[selbe] IPC зөрүүг дахин бодож чадсангүй:', rz.error);
      return { ok: true, op: plan.op, why: rz.error };
    }
    return { ok: true, op: plan.op };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** `applyEdits`-ийн мөр бүрийн үр дүн */
type EditRes = { success?: boolean; objectId?: number; error?: { description?: string } };

/**
 * ЗЭРЭГ БАТЛАЛТЫН ДАВХАР AUTO МӨРИЙГ ЦЭВЭРЛЭНЭ — ЗӨВХӨН ӨӨРИЙН нэмсэн мөрийг.
 *
 * ⚠️ ЯАГААД (2026-09-25-ны аудит): `planAuto` нь унших → `findAutoRow` →
 *    нэмэх гэсэн дараалалтай, ArcGIS-д давтагдашгүй хязгаар (`murun_id`)
 *    байхгүй. Нэг багцын 9F ба 12F-ийг секундын зайтай батлавал (хоёр таб)
 *    хоёулаа мөр олохгүй өнгөрч ХОЁР `AUTO|…|D` мөр үүснэ; дараагийн
 *    шинэчлэлт зөвхөн эхнийхийг (`rows.find`, OID өсөхөөр) засаж, хоёр дахь
 *    нь хуучирсан `une`-тэй үлдэн IpcTable нэг өдөрт хоёр карт харуулна.
 *
 * ДҮРЭМ: нэмсний ДАРАА тэр ID-тай мөрүүдийг сервероос ДАХИН уншина (`agsFetch`
 *    — `queryFeatures`-ийн in-flight хуваалцалт нэмэхээс ӨМНӨХ хариуг өгч
 *    болно). ХАМГИЙН БАГА OID-той нь үлдэнэ (`findAutoRow`-той ижил сонголт).
 *    Манайх түүнээс их бол: үлдэх мөрийг МАНАЙ утгаар шинэчилж, манайхыг
 *    устгана. Хоёр тал ижил дүрмээр явдаг тул үргэлж НЭГ мөр үлдэнэ.
 *
 * ⚠️ БУСДЫН мөрийг ХЭЗЭЭ Ч УСТГАХГҮЙ: хуучин давхардсан мөрд санхүүгийн газар
 *    `dun` бичсэн байж болно — тэр нь бодит гүйлгээний баримт. Зөвхөн сая
 *    ӨӨРСДИЙН нэмсэн (`dun`-гүй) мөр л устгагдана.
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
      error: tr('Давхар IPC мөр (OID {0}) үлдлээ — AGOL дээр гараар устгана уу: {1}', newOid, dr[0]?.error?.description ?? ''),
    };
  return { ok: true, op: 'update', why: 'dedup' };
}

/**
 * ГЭРЭЭНИЙ AUTO МӨРҮҮДИЙН ЗӨРҮҮГ ДАХИН БОДНО (`guits_zoruu`).
 *
 * ⚠️ ЯАГААД (2026-09-25-ны аудит): `autoInsert` нь зөрүүг `null` бичээд
 *    «санхүүгийн газар `dun` бичихэд `ipcLink` дахин боддог» гэж амласан атлаа
 *    `linkContract`/`linkUpdates`-ийн production дуудагч БАЙГААГҮЙ — `dun`
 *    нөхөгдсөн AUTO мөр бүр «Зөрүү —» хэвээр мөнхөрдөг байв.
 *
 * ДҮРЭМ: `ipcAuto.autoZoruu` (олгосон ХУРИМТЛАЛ − хадгалсан `guits_une`).
 *    ЗӨВХӨН AUTO мөр — гараар оруулсан мөрийн `une` бодогдоогүй (агшингүй)
 *    тул тэдгээрийг ХӨНДӨХГҮЙ. Утга нь ӨӨРЧЛӨГДСӨН мөрийг л бичнэ.
 *
 * ⚠️ `dun` засах UI энэ функцийг засварын дараа дуудвал зөрүү ШУУД шинэчлэгдэнэ;
 *    эс бөгөөс тухайн багцын дараагийн батлалтаар (`syncIpcFromFill`).
 * ⚠️ 500 мөрийн багцаар, мөр бүрийн үр дүнг шалгана (HTTP 200 алдаа).
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
  try {
    /* ⚠️ `queryFeatures` БИШ: түүний in-flight хуваалцалт нь бидний бичилтээс
       ӨМНӨ эхэлсэн ижил асуулгын хариуг өгч болох ба тэр хуучин `une`-ээр
       сая бичсэн зөв зөрүүг ДАРЖ бичнэ. Шууд, OID-оор эрэмбэлж хуудаслана. */
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
    let n = 0;
    for (let i = 0; i < upd.length; i += 500) {
      const part = upd.slice(i, i + 500);
      const j = await agsFetch(`${HO_IPC.url}/applyEdits`, {
        updates: JSON.stringify(part.map((attributes) => ({ attributes }))),
        rollbackOnFailure: 'true',
      });
      const res = (j.updateResults ?? []) as EditRes[];
      const okN = res.filter((x) => x.success === true).length;
      n += okN;
      if (res.length !== part.length || okN !== part.length) {
        if (n) invalidate('HO_IPC');
        const bad = res.find((x) => x.success !== true);
        return { ok: false, error: bad?.error?.description || tr('IPC зөрүү {0}/{1} мөрд бичигдсэнгүй', part.length - okN, part.length) };
      }
    }
    if (n) invalidate('HO_IPC');
    return { ok: true, n };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

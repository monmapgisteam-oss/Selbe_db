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
import { bagtsKey, pkgKeyOf, HO_IPC } from '@/lib/services';
import { agsFetch } from '@/modules/sheet/ags';
import { invalidate } from '@/lib/dataBus';
import { queryFeatures } from '@/lib/query';
import { snapshotOf } from '@/lib/ipcLink';
import { dayOf, planAuto, contractCodeOf, type AutoPlan } from '@/lib/ipcAuto';

type Row = Record<string, unknown>;

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
  if (!at) return { ok: false, error: `Огноо танигдсангүй: ${day}` };

  try {
    /* ── 1. Тухайн багцын БҮХ хуудасны тэр өдрийн дүнг нийлүүлнэ ──
       ⚠️ Багц бүр 1–2 хуудастай (9F + 12F) бөгөөд гэрээ нь НЭГ. */
    const wanted: Pkg[] = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
    if (!wanted.length) return { ok: false, error: `Багц олдсонгүй: ${bagts}` };

    let obyem: number | null = null;
    let une: number | null = null;
    let read = 0;

    for (const pkg of wanted) {
      const sc: Schema | null = await loadSchema(pkg).catch(() => null);
      if (!sc?.f.fillDate) continue;
      const cols = sc.obyem.filter((x): x is string => !!x);
      if (!cols.length) continue;
      const need = [sc.f.oid, sc.f.no, sc.f.wC, sc.f.vol, sc.f.unit, ...cols];
      const { rows } = await loadRows(pkg, sc, day, need);
      if (!rows.length) continue;
      read += 1;
      const s = snapshotOf(rows, day);
      if (s.obyem != null) obyem = (obyem ?? 0) + s.obyem;
      if (s.une != null) une = (une ?? 0) + s.une;
    }

    /* ⚠️ НЭГ Ч ХУУДАС УНШИГДААГҮЙ бол «гүйцэтгэл 0» ГЭЖ БҮҮ БИЧ — энэ нь
       сүлжээний/бүдүүвчийн асуудал байж болно. Алдаа буцаана. */
    if (!read) return { ok: false, error: 'Бөглөх хуудаснаас агшин уншигдсангүй' };

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
    if (plan.op === 'skip') return { ok: true, op: 'skip', why: plan.why };

    /* ── 4. Бичих ──
       ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — мөр БҮРИЙН үр дүнг шалгана. */
    const key = plan.op === 'insert' ? 'adds' : 'updates';
    const j = await agsFetch(`${HO_IPC.url}/applyEdits`, {
      [key]: JSON.stringify([{ attributes: plan.attrs }]),
      rollbackOnFailure: 'true',
    });
    const res = (j[plan.op === 'insert' ? 'addResults' : 'updateResults'] ?? []) as {
      success?: boolean; error?: { description?: string };
    }[];
    const bad = res.find((r) => r.success === false);
    if (bad) return { ok: false, error: bad.error?.description || 'Бичих амжилтгүй' };

    /* ⚠️ Кэшийг хүчингүй болгоно — эс бөгөөс «Санхүүжилт» хуудас шинэ
       мөрийг харахгүй (dataBus.invariant.check.mjs энэ дүрмийг барина). */
    invalidate('HO_IPC');
    return { ok: true, op: plan.op };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

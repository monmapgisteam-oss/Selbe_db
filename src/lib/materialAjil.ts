import { t as tr } from '@/lib/i18nCore';
import { AUTH } from '@/lib/services/env';
import { currentUser } from '@/lib/who';
import { huvaariScope } from '@/lib/huvaariAcl';
import { archivingBusy } from '@/lib/submission';
import { ajilApplyBusyFor } from '@/lib/ajilBatlah';
import type { Pkg, Schema } from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { invalidate } from '@/lib/dataBus';

/**
 * АЖЛЫН МАТЕРИАЛ (2026-10-21, хэрэглэгчийн шийдвэр) — гүйцэтгэлийн 24 хүснэгтийн `ashiglah_material_ner` талбар.
 *
 *   · Ажил бүрд НЭГ УДАА тусад нь тохируулна (хэрэглэгч: «тусдаа нэг л удаа тохируулна») — бөглөх/илгээх/хяналтын
 *     6 шатаар ДАМЖИХГҮЙ, «Хуваарь» шиг ОДООГИЙН жаазад шууд бичнэ (`applyUpdates`). Нийтлэл бүр мөрийн БҮХ
 *     талбарыг (`raw`) хуулдаг тул дараагийн жаазад ч үлдэнэ.
 *   · Нэг нүдэнд ОЛОН материал — нөөцийн хүснэгтэд (`material_noots`) байгаа нэрсээс СОНГОНО (гараар бичихгүй).
 *   · Мөрийн түлхүүр — ажлын код `des` (жааз солигдоход хадгалагддаг; `oid` нийтлэл бүрд солигддог).
 * ⚠️ Тусгаарлагч «; » — материалын нэрэнд таслал байдаг («Цахилгааны самбар (айлын, давхарын, …)»).
 * ⚠️ Бичих эрх = «Хуваарь»-ийн зохиогчийн хүрээ (`huvaariScope(…, 'author')`) — төлөвлөлтийн шинж чанар.
 */
export const MAT_FIELD = 'ashiglah_material_ner';
export const MAT_SEP = '; ';
export const MAT_MAX = 1000;

/** Нүдний текст → нэрсийн жагсаалт (давхардал · хоосон хасна) */
export function parseMats(v: unknown): string[] {
  const out: string[] = [];
  for (const t of (v == null ? '' : String(v)).split(';')) {
    const s = t.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Нэрсийн жагсаалт → нүдний текст (`null` = хоосон). Талбарын уртаас хэтэрвэл ШИДНЭ (тайрахгүй). */
export function formatMats(names: readonly string[]): string | null {
  const s = parseMats(names.join(';')).join(MAT_SEP);
  if (s.length > MAT_MAX) throw new Error(tr('Сонгосон материалын нэрс хэт урт ({0}/{1} тэмдэгт) — цөөлнө үү.', s.length, MAT_MAX));
  return s || null;
}

/** Мөрийн одоогийн материал (`raw`-аас; Enterprise-д талбарын нэр жижиг үсгээр) */
export const matsOf = (r: SheetRow): string[] => parseMats(r.raw[MAT_FIELD]);

/** Багцад засах эрхтэй эсэх — UI ба lib НЭГ дүрэм. Нэвтрэлт унтраалттай (дев) бол чөлөөтэй. */
export function canEditMats(user: string | null | undefined, group: string): boolean {
  if (!AUTH.appId) return true;
  const sc = huvaariScope(user, 'author');
  return sc == null || sc.includes(group);
}

/**
 * ГУРВАН ТАЛЫН НИЙЛҮҮЛЭЛТ (⚠️ 2026-10-22, аудит №8) — хуудас ачаалсан үеийн (`base`) жагсаалтаас ЭНЭ хэрэглэгчийн
 * нэмсэн/хассан нэрсийг серверийн ОДООГИЙН (`fresh`) жагсаалт дээр давхарлана. Нэг ажилд нэг нэр нэг л удаа байх
 * ОЛОНЛОГ тул хоёр тал ялгаатай нэр нэмэх/хасахад зөрчил үүсэхгүй — нийлүүлэлт үргэлж тодорхой (эсрэг утгагүй):
 * миний хассан нь хасагдана, бусдын нэмсэн/хассан нь хэвээр, хоёулаа нэмсэн нь нэг удаа. Дараалал — серверийнх, дараа нь
 * миний шинэ нэрс. Оролтыг өөрчлөхгүй (цэвэр — `materialAjil.check.mjs`).
 */
export function mergeMats(base: readonly string[], mine: readonly string[], fresh: readonly string[]): string[] {
  const b = new Set(base);
  const m = new Set(mine);
  const removed = new Set(base.filter((x) => !m.has(x)));
  const out = parseMats(fresh.join(';')).filter((x) => !removed.has(x));
  for (const x of mine) if (!b.has(x) && !out.includes(x)) out.push(x);
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * ХАДГАЛАХ — зөвхөн ӨӨРЧЛӨГДСӨН ажлууд (`des` → нэрс). Хуваарийн хадгалалттай ИЖИЛ хамгаалалт:
 *   1) гүйцэтгэлийн архивлалт / нэмэлт ажлын буулгалт явж байвал бичихгүй (fail-closed);
 *   2) СҮҮЛИЙН жаазыг `strict`-ээр дахин татаж `des`-ээр шинэ `oid` руу зурна;
 *   3) бичихийн яг өмнө (1)-ийг ДАХИН шалгана (дахин татах хэдэн секунд үргэлжилдэг).
 * @param base ⚠️ 2026-10-22 (аудит №8): хуудас АЧААЛСАН үеийн утга (`des` → нэрс). Урьд нь бүх жагсаалтыг уншилтгүй
 *   ДАРЖ бичдэг тул хоёр хүн нэг ажлын материалыг зэрэг тохируулахад СҮҮЛД хадгалсан нь эхнийхийн нэрсийг чимээгүй
 *   устгадаг байв (last save wins). Одоо (2)-ын шинэ мөрийн утга `base`-ээс зөрвөл (энэ хооронд өөр хүн хадгалсан)
 *   `mergeMats`-аар нийлүүлж, тэр ажлыг `merged`-д нэрлэнэ — дуудагч хэрэглэгчид ил хэлнэ. `base`-д байхгүй ажил =
 *   хуучин зан (шууд бичнэ). Серверийн утга нийлүүлэлттэй аль хэдийн ижил бол бичихгүй.
 * @returns бичигдсэн мөрийн тоо; шинэ жаазад олдоогүй ажлууд (`lost`) — тэдгээр бичигдээгүй; `merged` — нийлүүлсэн ажлууд.
 */
export async function saveWorkMats(
  pkg: Pkg,
  sc: Schema,
  changes: ReadonlyMap<number, readonly string[]>,
  base: ReadonlyMap<number, readonly string[]>,
): Promise<{ written: number; lost: number[]; merged: number[] }> {
  if (typeof window !== 'undefined' && AUTH.appId) {
    const me = currentUser();
    if (!me) throw new Error(tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.'));
    if (!canEditMats(me, pkg.group)) throw new Error(tr('«{0}» багцад материал тохируулах эрхгүй (Хуваарийн зохиогчийн эрх шаардлагатай).', pkg.group));
  }
  if (!changes.size) return { written: 0, lost: [], merged: [] };
  /* ⚠️ 2026-10-22 (аудит №8): уртын шалгалт (`formatMats` шиднэ) СҮЛЖЭЭНЭЭС ӨМНӨ ч — урьдын адил эрт хэлнэ */
  for (const names of changes.values()) formatMats(names);

  const gate = async (): Promise<void> => {
    const arch = await archivingBusy(pkg.key);
    if (arch) throw new Error(tr('{0} энэ багцын гүйцэтгэлийг архивлаж байна — дуусахыг хүлээгээд дахин хадгална уу. Юу ч бичигдсэнгүй.', arch.who || '—'));
    const aj = await ajilApplyBusyFor(pkg.key);
    if (aj) throw new Error(tr('{0} энэ багцад нэмэлт ажлыг яг одоо хуудсанд буулгаж байна — дуусахыг хүлээнэ үү. Юу ч бичсэнгүй.', aj.who || '—'));
  };
  await gate();
  const fresh = await loadRows(pkg, sc, undefined, undefined, { strict: true });
  const rowByDes = new Map<number, SheetRow>();
  for (const r of fresh.rows) if (!r.group && r.des != null && !rowByDes.has(r.des)) rowByDes.set(r.des, r);
  const updates: Record<string, unknown>[] = [];
  const lost: number[] = [];
  const merged: number[] = [];
  for (const [des, names] of changes) {
    const r = rowByDes.get(des);
    if (!r) { lost.push(des); continue; }
    /* ⚠️ 2026-10-22 (аудит №8): ачаалснаас хойш серверийн утга өөрчлөгдсөн бол нийлүүлнэ (`base`-ийн ⚠️) */
    const now = matsOf(r);
    const was = base.get(des);
    let want: readonly string[] = names;
    if (was && !sameList(was, now)) {
      want = mergeMats(was, names, now);
      merged.push(des);
    }
    if (sameList(want, now)) continue;
    updates.push({ [sc.f.oid]: r.oid, [MAT_FIELD]: formatMats(want) });
  }
  if (!updates.length) return { written: 0, lost, merged };
  await gate();
  await applyUpdates(pkg, updates);
  /* dataBus.invariant: бичигч бүр өөрөө хүчингүй болгоно (`applyUpdates`-ийнхтэй давхардсан ч хор хөнөөлгүй) */
  invalidate('BAGTS_SHEET');
  return { written: updates.length, lost, merged };
}

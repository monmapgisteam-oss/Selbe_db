/**
 * ХУУЧИН БАГЦ ХООРОНДЫН ХАМААРАЛ (2026-10-04) — ЗӨВХӨН ШИЛЖҮҮЛЭЛТЭД.
 *
 * ⚠️ 2026-10-22 (хэрэглэгчийн шийдвэр): «Багцын хамаарал» нь АЖИЛ ↔ АЖИЛ болов (`workDeps.ts` ·
 *    `workDepsRemote.ts`, хадгалалт нь бөглөх хуудасны `bagts_hamaaral` талбар). Энэ файл ЗӨВХӨН хуучин
 *    багц ↔ багц холбоосыг уншиж («ажлыг нь сонгож шилжүүлнэ үү») ба ажлын түвшинд шилжсэн хосыг УСТГАНА.
 *    Шинэ холбоо ЭНД НЭМЭГДЭХГҮЙ; ТУХ г.м. уншигчид ажлын графаас (`loadPkgDeps`) уншина.
 *
 * ⚠️ УТГА: `{ from: A, to: B }` = «Б багц А багцаас хамаарна» (А урд, Б ард). Түлхүүр нь `TuhPkg.key`
 *    (орон сууц «БАГЦ1», бусад «energy:БАГЦ61»; `workDeps.legacyPkgKey`).
 * ⚠️ ХАДГАЛАЛТ: `Selbe_Guitsetgel_Draft` (`draftRemote.ts`)-ийн НЭГ мөр (`dkey = HAMAARAL_KEY`), `payload` = JSON
 *    массив. Түлхүүрт `|` ОРУУЛАХГҮЙ (`draftRemote.legacyLike`). Устгал нь optimistic lock-той (`expectAt`) —
 *    зөрвөл дахин уншаад давтана.
 * ⚠️ Энэ файл React-гүй; алсын IO нь ДИНАМИК import — `bagtsHamaaral.check.mjs` ArcGIS-гүйгээр шалгана.
 */
import { t as tr } from '@/lib/i18nCore';

export type Dep = { from: string; to: string };

/** `Selbe_Guitsetgel_Draft.dkey` — ⚠️ `|` оруулахгүй (дээрх ⚠️) */
export const HAMAARAL_KEY = 'bagtsHamaaral';

const isDep = (x: unknown): x is Dep =>
  !!x && typeof (x as Dep).from === 'string' && typeof (x as Dep).to === 'string'
  && !!(x as Dep).from && !!(x as Dep).to;

export const sameDep = (a: Dep, b: Dep): boolean => a.from === b.from && a.to === b.to;

/** JSON → холбоос. Эвдэрсэн бичлэгийг ЧИМЭЭГҮЙ хаяхгүй — шидэнэ (дарж бичихээс сэргийлнэ) */
export function parseDeps(payload: string | null | undefined): Dep[] {
  if (!payload) return [];
  const raw: unknown = JSON.parse(payload);
  if (!Array.isArray(raw)) throw new Error(tr('Багцын хамаарлын бичлэг эвдэрсэн байна'));
  const out: Dep[] = [];
  for (const x of raw) if (isDep(x) && !out.some((d) => sameDep(d, x))) out.push({ from: x.from, to: x.to });
  return out;
}

export const depsJson = (deps: readonly Dep[]): string => JSON.stringify(deps.map((d) => ({ from: d.from, to: d.to })));

export type DepState = { deps: Dep[]; at: number | null };

/** Хуучин холбоосууд. ⚠️ Уншилт унавал ШИДНЭ (хоосон гэж худал харуулахгүй) */
export async function loadLegacyDeps(): Promise<DepState> {
  const { readRemoteDraft, getAuth, tableUrl } = await import('./draftRemote');
  /* ⚠️ 2026-10-06: `readRemoteDraft` нь нэвтрээгүй · хүснэгт олдоогүй үед `{ ok: true, draft: null }` буцаадаг —
     энд «холбоо БАЙХГҮЙ» гэж ХУДАЛ харагдах тул АЛДАА болгоно. `tableUrl(false)` — уншилт хүснэгт ҮҮСГЭХГҮЙ. */
  if (!(await getAuth())) throw new Error(tr('нэвтрээгүй эсвэл токен дууссан'));
  if (!(await tableUrl(false))) {
    throw new Error(tr('«{0}» хүснэгт олдсонгүй эсвэл эзэн нь танигдсангүй — багцын хамаарлыг уншиж чадсангүй', 'Selbe_Guitsetgel_Draft'));
  }
  const r = await readRemoteDraft(HAMAARAL_KEY);
  if (!r.ok) throw new Error(r.error);
  return { deps: parseDeps(r.draft?.payload), at: r.draft?.at ?? null };
}

/**
 * Хуучин хосуудыг УСТГАНА (ажлын түвшинд шилжсэн, эсвэл шилжих хуудасгүй) — ШИНЭЭР уншина → хасна →
 * `expectAt`-тай бичнэ; завсарт өөр хүн бичсэн бол дахин уншиж давтана (3 удаа).
 * ⚠️ `requireCap('hamaaral')` — `who.ts`-ийн ⚠️.
 */
export async function removeLegacyDeps(rm: readonly Dep[]): Promise<{ ok: true; state: DepState } | { ok: false; error: string }> {
  const { requireCap } = await import('./who');
  try { requireCap('hamaaral'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const { saveRemoteDraft } = await import('./draftRemote');
  for (let i = 0; i < 3; i++) {
    let cur: DepState;
    try { cur = await loadLegacyDeps(); } catch (e) { return { ok: false, error: (e as Error).message }; }
    const next = cur.deps.filter((d) => !rm.some((x) => sameDep(x, d)));
    /* ⚠️ Өөрчлөлтгүй (өөр хүн аль хэдийн устгасан) — бичихгүй (дэмий conflict үүсгэхгүй) */
    if (next.length === cur.deps.length) return { ok: true, state: cur };
    const at = Math.max(Date.now(), (cur.at ?? 0) + 1);
    const res = await saveRemoteDraft(HAMAARAL_KEY, at, depsJson(next), { expectAt: cur.at });
    if (res.ok) return { ok: true, state: { deps: next, at } };
    if (!res.conflict) return { ok: false, error: res.error };
    if (res.written) {
      try {
        const again = await loadLegacyDeps();
        if (!again.deps.some((d) => rm.some((x) => sameDep(x, d)))) return { ok: true, state: again };
      } catch { /* дахин оролдоно */ }
    }
  }
  return { ok: false, error: tr('Өөр хүн зэрэг засаж байна — дахин оролдоно уу') };
}

/**
 * БАГЦ ХООРОНДЫН ХАМААРАЛ (2026-10-04) — «Багцын хамаарал» харагдацын өгөгдөл.
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шийдвэр, 2026-10-04): ТУХ-ын 55 орчим багцыг ХООРОНД НЬ
 *    холбож харуулна — багц доторх ажлууд (`deps.ts`-ийн «18FS3» уялдаа) ХАМААГҮЙ.
 *    · Засах эрхтэй (`hamaaral` cap) хүн ЗӨВХӨН холбоо нэмж/устгана — багцын жагсаалт
 *      системээс (`tuhData.buildTuhPkgs`) тул багц нэмэх/хасах боломжгүй.
 *    · Батлагч, батлах урсгал БАЙХГҮЙ — бичсэн нь шууд үйлчилнэ.
 *
 * ⚠️ УТГА: `{ from: A, to: B }` = «Б багц А багцаас хамаарна» (А урд, Б ард; сум А → Б).
 * ⚠️ ДУГУЙ ХАМААРАЛ ХОРИОТОЙ (А → Б → А) — «юуг эхэлж дуусгах вэ» гэсэн асуулт
 *    хариултгүй болно. Бусад нь (өөртөө, давхардал) мөн хориотой.
 *
 * ⚠️ ХАДГАЛАЛТ: шинэ хүснэгт ҮҮСГЭХГҮЙ — `Selbe_Guitsetgel_Draft` (`draftRemote.ts`)
 *    хүснэгтийн НЭГ мөр (`dkey = HAMAARAL_KEY`), `payload` = JSON массив. Тэр хүснэгт
 *    `dkey`-ээр нэрийн орон зай хуваалцдаг (ноорог · `sub:` · `plan:`); түлхүүрт `|`
 *    ОРУУЛАХГҮЙ (`draftRemote.legacyLike` нь `LIKE '%|…'`). Бичилт бүр optimistic
 *    lock-той (`expectAt`) — зэрэгцээ хоёр засварлагч бие биенийхээ холбоог дарахгүй:
 *    зөрвөл дахин уншаад ӨӨРИЙН өөрчлөлтөө (нэмэх/устгах) шинэ жагсаалт дээр давтана.
 * ⚠️ Түлхүүр нь `TuhPkg.key` (орон сууц «БАГЦ1», бусад «energy:БАГЦ61»). Зураг төсөл
 *    (`d:`) ба диапазон мөр (`cf:`) нь OBJECTID-оос хамаарна — мөр дахин үүсвэл тэр
 *    холбоо «өнчин» болж харагдахгүй (устгагдахгүй, хадгалагдсан хэвээр).
 * ⚠️ Энэ файл React-гүй; алсын IO нь ДИНАМИК import — `bagtsHamaaral.check.mjs` нь
 *    ArcGIS-гүйгээр цэвэр логикийг шалгана.
 */
import { t as tr } from '@/lib/i18nCore';

export type Dep = { from: string; to: string };

/** `Selbe_Guitsetgel_Draft.dkey` — ⚠️ `|` оруулахгүй (дээрх ⚠️) */
export const HAMAARAL_KEY = 'bagtsHamaaral';

const isDep = (x: unknown): x is Dep =>
  !!x && typeof (x as Dep).from === 'string' && typeof (x as Dep).to === 'string'
  && !!(x as Dep).from && !!(x as Dep).to;

/** JSON → холбоос. Эвдэрсэн/хуучин бичлэгийг ЧИМЭЭГҮЙ хаяхгүй — шидэнэ (дарж бичихээс сэргийлнэ) */
export function parseDeps(payload: string | null | undefined): Dep[] {
  if (!payload) return [];
  const raw: unknown = JSON.parse(payload);
  if (!Array.isArray(raw)) throw new Error(tr('Багцын хамаарлын бичлэг эвдэрсэн байна'));
  const out: Dep[] = [];
  for (const x of raw) if (isDep(x) && !out.some((d) => sameDep(d, x))) out.push({ from: x.from, to: x.to });
  return out;
}

export const depsJson = (deps: readonly Dep[]): string => JSON.stringify(deps.map((d) => ({ from: d.from, to: d.to })));

export const sameDep = (a: Dep, b: Dep): boolean => a.from === b.from && a.to === b.to;

/** Хоёр жагсаалт ИЖИЛ холбоосуудтай юу (дараалал хамаагүй; `parseDeps` давхардлыг арилгасан) */
export const sameDeps = (a: readonly Dep[], b: readonly Dep[]): boolean =>
  a.length === b.length && a.every((d) => b.some((x) => sameDep(d, x)));

/** `a`-аас сумаар явж `b`-д хүрэх үү (a → … → b) */
export function reaches(deps: readonly Dep[], a: string, b: string): boolean {
  const seen = new Set<string>([a]);
  const stack = [a];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === b) return true;
    for (const d of deps) {
      if (d.from === cur && !seen.has(d.to)) { seen.add(d.to); stack.push(d.to); }
    }
  }
  return false;
}

/** Холбоо нэмж болох уу — болохгүй бол шалтгаан */
export function linkError(deps: readonly Dep[], from: string, to: string): string | null {
  if (from === to) return tr('Багцыг өөртэй нь холбох боломжгүй');
  if (deps.some((d) => d.from === from && d.to === to)) return tr('Энэ холбоо аль хэдийн байна');
  /* ⚠️ to → … → from зам байвал from → to нь дугуй үүсгэнэ */
  if (reaches(deps, to, from)) return tr('Дугуй хамаарал үүснэ — эсрэг чиглэлд аль хэдийн хамааралтай');
  return null;
}

/** Энэ багц ХАМААРДАГ (урд талын) багцууд */
export const upstreamOf = (deps: readonly Dep[], key: string): string[] =>
  deps.filter((d) => d.to === key).map((d) => d.from);

/** Энэ багцаас ХАМААРДАГ (ард талын) багцууд */
export const downstreamOf = (deps: readonly Dep[], key: string): string[] =>
  deps.filter((d) => d.from === key).map((d) => d.to);

/** Энэ багцтай шууд ба ДАМЖУУЛАН холбогдсон бүх багц (тодруулгад) */
export function chainOf(deps: readonly Dep[], key: string): Set<string> {
  const out = new Set<string>([key]);
  for (const dir of ['up', 'down'] as const) {
    const stack = [key];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const d of deps) {
        const nxt = dir === 'up' ? (d.to === cur ? d.from : null) : (d.from === cur ? d.to : null);
        if (nxt && !out.has(nxt)) { out.add(nxt); stack.push(nxt); }
      }
    }
  }
  return out;
}

export type DepChange = { op: 'add' | 'remove'; dep: Dep };

/** Өөрчлөлтийг жагсаалтад хэрэглэнэ — нэмэх боломжгүй бол шалтгаан (`linkError`) */
export function applyChange(deps: readonly Dep[], c: DepChange): Dep[] | string {
  if (c.op === 'remove') return deps.filter((d) => !sameDep(d, c.dep));
  const err = linkError(deps, c.dep.from, c.dep.to);
  return err ?? [...deps, { from: c.dep.from, to: c.dep.to }];
}

/* ══════════════ Алсын хадгалалт ══════════════ */

export type DepState = { deps: Dep[]; at: number | null };

/** Сүүлийн хадгалсан холбоосууд. ⚠️ Уншилт унавал ШИДНЭ (хоосон гэж худал харуулахгүй) */
export async function loadDeps(): Promise<DepState> {
  const { readRemoteDraft, getAuth, tableUrl } = await import('./draftRemote');
  /* ⚠️ 2026-10-06: `readRemoteDraft` нь нэвтрээгүй · хүснэгт олдоогүй · эзэн танигдаагүй
     үед `{ ok: true, draft: null }` буцаадаг (ноорогт «зөвхөн локалд» гэсэн утгатай).
     Энд тэр нь «хамаарал БАЙХГҮЙ» гэж ХУДАЛ харагдаж байв — хамаарал зөвхөн алсад
     хадгалагддаг тул эдгээрийг АЛДАА болгож шиднэ. `tableUrl(false)` — уншилт хүснэгт
     ҮҮСГЭХГҮЙ (`readRemoteDraftRaw`-тай ижил); олдсон URL кэшлэгдэх тул дахин хайхгүй. */
  if (!(await getAuth())) throw new Error(tr('нэвтрээгүй эсвэл токен дууссан'));
  if (!(await tableUrl(false))) {
    throw new Error(tr('«{0}» хүснэгт олдсонгүй эсвэл эзэн нь танигдсангүй — багцын хамаарлыг уншиж чадсангүй', 'Selbe_Guitsetgel_Draft'));
  }
  const r = await readRemoteDraft(HAMAARAL_KEY);
  if (!r.ok) throw new Error(r.error);
  return { deps: parseDeps(r.draft?.payload), at: r.draft?.at ?? null };
}

/**
 * Нэг өөрчлөлтийг бичнэ: ШИНЭЭР уншина → хэрэглэнэ → `expectAt`-тай бичнэ.
 * Завсарт өөр хүн бичсэн бол (conflict) дахин уншиж давтана (3 удаа).
 * ⚠️ `requireCap` — консолоос дуудсан ч эрхгүй бол бичихгүй (`who.ts`-ийн ⚠️).
 */
export async function saveChange(c: DepChange): Promise<{ ok: true; state: DepState } | { ok: false; error: string }> {
  const { requireCap } = await import('./who');
  try { requireCap('hamaaral'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const { saveRemoteDraft } = await import('./draftRemote');
  for (let i = 0; i < 3; i++) {
    let cur: DepState;
    try { cur = await loadDeps(); } catch (e) { return { ok: false, error: (e as Error).message }; }
    const next = applyChange(cur.deps, c);
    if (typeof next === 'string') return { ok: false, error: next };
    /* ⚠️ 2026-10-09: ӨӨРЧЛӨЛТГҮЙ (жиш. өөр хүн аль хэдийн устгасан холбоог «устгах») — урьд нь
       ижил жагсаалтыг шинэ `at`-тай дахин бичиж, бусдын нээлттэй цонхонд дэмий conflict
       үүсгэдэг байв. Сервер аль хэдийн хүссэн төлөвт тул бичихгүй. */
    if (sameDeps(next, cur.deps)) return { ok: true, state: cur };
    const at =Math.max(Date.now(), (cur.at ?? 0) + 1);
    const res = await saveRemoteDraft(HAMAARAL_KEY, at, depsJson(next), { expectAt: cur.at });
    if (res.ok) return { ok: true, state: { deps: next, at } };
    if (!res.conflict) return { ok: false, error: res.error };
    /* ⚠️ `written` + conflict: бидний бичилт буусан ч дараа нь өөр хүн дарсан — дахин
       уншиж ӨӨРИЙН өөрчлөлтөө давтана (нэмэх нь idempotent: давхардвал «байна» гэж зогсоно) */
    if (res.written) {
      try {
        const again = await loadDeps();
        const has = again.deps.some((d) => sameDep(d, c.dep));
        if ((c.op === 'add') === has) return { ok: true, state: again };
      } catch { /* дахин оролдоно */ }
    }
  }
  return { ok: false, error: tr('Өөр хүн зэрэг засаж байна — дахин оролдоно уу') };
}

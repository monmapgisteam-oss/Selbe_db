/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН ГҮЙЦЭТГЭЛИЙН ХУВИЙГ ХҮСНЭГТЭД БИЧНЭ (2026-10-29).
 *
 * ⚠️ ЯАГААД (хэрэглэгч: «хүснэгт өөрөө шинэчлэгдэх ёстой»): «Төсөл төлөвлөгөө биелэлт» нь S (гүйцэтгэлийн хувь)-ийг
 *    амьдаар бодож ДЭЛГЭЦЭНД харуулдаг ч `CASHFLOW_NEW`-ийн `guitsetgel_huvi` нь Excel-ээс оруулсан утгаараа үлддэг байв —
 *    хүснэгтийг шууд (Excel татах, өөр программ) харахад хуучин тоо гарна.
 * ⚠️ ЗӨВХӨН `guitsetgel_huvi` (хэрэглэгчийн сонголт: «Зөвхөн гүйцэтгэлийн хувь») — үе шатны хувийн баганууд (`tezu` …),
 *    өртөг, жин, огноо ХӨНДӨГДӨХГҮЙ.
 * ⚠️ ХЭЗЭЭ: гүйцэтгэл БАТЛАГДАХАД (`hyanaltStore.apply`, газрын даргын шат — хэрэглэгчийн сонголт). Хуудас нээхэд бичихгүй.
 * ⚠️ ДҮРЭМ (`planProgressUpdates`, цэвэр):
 *    · `computePlan`-ийн S (0–100) хадгалсан утгаас ЗӨРСӨН мөр л бичигдэнэ — хадгалсан утга руу шилжсэн мөр (амьд эхгүй)
 *      ижил тул бичигдэхгүй;
 *    · S `null` (мэдээлэлгүй) бол бичихгүй — null ≠ 0, хадгалсан утгыг арилгахгүй;
 *    · эх НЭГ Ч уншигдаагүй (`plan.failed` хоосон биш) бол ЮУ Ч бичихгүй — дутуу эхээр бодсон эцгийн нийлбэр хүснэгтийг
 *      бохирдуулна.
 * ⚠️ `applyEdits` 500 мөрийн багцаар — `rollbackOnFailure` нэг багц дотор л үйлчилнэ; унавал өмнөх багцууд бичигдсэн
 *    хэвээр (дараагийн батлалт дахин тулгаж нөхнө — зөрсөн мөр л бичигддэг тул давхар бичилт хор хөнөөлгүй).
 */
import { t as tr } from '@/lib/i18nCore';
import { CASHFLOW_NEW } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import type { ProjectPlan } from '@/lib/projectPlanInputs';

const F = CASHFLOW_NEW.fields;
/** Зөрүүгийн хүлцэл (хувийн нэгж) — хөвөгч таслалын шуугианаар дахин бичихгүй */
const EPS = 1e-4;
/** Нэг `applyEdits`-ийн дээд мөр */
const CHUNK = 500;

/** Хадгалах утга — 6 оронгоор (`zuragTosol.textOf`-той ижил нарийвчлал) */
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * ⚠️ 2026-10-29: ХОЛБОСОН ОГНОО (`projectPlanInputs.linkPlanDates` — газар хоосон, барилга угсралт = Хуваарь) — хүснэгтийн
 *    утгаас зөрвөл бичнэ (хоосон ч — `null`). Өдрөөр жишнэ (цагийн бүсийн шуугиан).
 */
const DATE_KEYS = [
  ['geree_ehleh', F.contractStart], ['geree_duusah', F.contractEnd],
  ['guits_ehleh', F.contractorStart], ['guits_duusah', F.contractorEnd],
  ['gazar_ehleh', F.landStart], ['gazar_duusah', F.landEnd],
] as const;
const DAY = 86_400_000;
const sameDay = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null ? b == null : b != null && Math.floor(a / DAY) === Math.floor(b / DAY));

/** Бичих мөрүүд (цэвэр — тестлэгдэнэ): `[{ objectid, guitsetgel_huvi?, <огноо>? }]` — зөрсөн талбар л */
export function planProgressUpdates(plan: ProjectPlan): Record<string, unknown>[] {
  if (plan.empty || plan.failed.length) return [];
  const stored = new Map((plan.stored ?? []).map((r) => [r.objectid, r]));
  const out: Record<string, unknown>[] = [];
  for (const n of plan.tree.nodes) {
    const r = n.row;
    if (!r || r.objectid == null) continue;
    const was = stored.get(r.objectid) ?? r;
    const u: Record<string, unknown> = {};
    const s = plan.result.values.get(n)?.S;
    if (s != null && Number.isFinite(s)) {
      const w = was.guitsetgel_huvi;
      if (!(w != null && Number.isFinite(w) && Math.abs(w - s) < EPS)) u[F.progressPct] = round6(s);
    }
    for (const [k, f] of DATE_KEYS) if (!sameDay(was[k], r[k])) u[f] = r[k] ?? null;
    if (Object.keys(u).length) out.push({ [CASHFLOW_NEW.oid]: r.objectid, ...u });
  }
  return out;
}

export type PlanSyncResult =
  | { ok: true; n: number }
  | { ok: true; n: 0; skipped: string }
  | { ok: false; error: string };

/**
 * Амьд эхээр дахин бодоод зөрсөн мөрийн `guitsetgel_huvi`-г бичнэ. ХЭЗЭЭ Ч шидэхгүй — батлалтыг саатуулахгүй.
 */
export async function syncPlanProgress(): Promise<PlanSyncResult> {
  try {
    /* Батлалт сая бичигдсэн — кэшлэгдсэн хуудас/хүснэгтийн утгаар биш, шинээр уншина */
    invalidate('BAGTS_SHEET', 'CASHFLOW_NEW');
    const { loadProjectPlan } = await import('@/lib/projectPlanInputs');
    const plan = await loadProjectPlan();
    if (plan.empty) return { ok: true, n: 0, skipped: tr('Төсөл төлөвлөгөөний мөр алга') };
    if (plan.failed.length) {
      return { ok: true, n: 0, skipped: tr('Зарим эх уншигдсангүй ({0})', plan.failed.join(', ')) };
    }
    const ups = planProgressUpdates(plan);
    let n = 0;
    for (let i = 0; i < ups.length; i += CHUNK) {
      const r = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: ups.slice(i, i + CHUNK) });
      n += r.n;
    }
    if (n > 0) invalidate('CASHFLOW_NEW');
    return { ok: true, n };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

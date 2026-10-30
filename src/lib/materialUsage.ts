import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { computeAll, loadRows } from '@/modules/sheet/bagtsSheet';
import { parseEntry, matsOf } from '@/lib/materialAjil';

/**
 * МАТЕРИАЛЫН ЗАРЦУУЛАЛТ (2026-10-30, хэрэглэгчийн шийдвэр) — гүйцэтгэлийн хүснэгтийн ажлын обьёмоос:
 *   ажил бүрийн ГҮЙЦЭТГЭСЭН (хуримтлагдсан) обьём × норм; олон материалтай ажилд материал тус бүрээр тусдаа.
 *   Норм — ажлын тусгай норм («Арматур=0.15»), эс бөгөөс материалын ҮНДСЭН норм (`material_noots.norm`).
 * ⚠️ null ≠ 0: обьём эсвэл норм мэдэгдэхгүй ажил ТООЦООНД ОРОХГҮЙ — тэр материал «дутуу» (`partial`) болж «Дууссан»
 *    төлөвт ОРОХГҮЙ. Хүснэгт уншигдаагүй бол бүх материал «дутуу» (аль материал тэнд байсныг мэдэхгүй).
 */

/** Нэг ажил — материалын бичлэгүүд ба гүйцэтгэсэн обьём */
export type WorkUse = { mats: readonly string[]; vol: number | null };
/** Материал бүрийн зарцуулалт — `used` нь мэдэгдэх ажлуудын нийлбэр (байхгүй бол null) */
export type MatUse = { used: number | null; partial: boolean };

/** Цэвэр тооцоо (тестлэгдэнэ — `materialUsage.check.mjs`) */
export function computeUsage(
  works: readonly WorkUse[],
  defaults: ReadonlyMap<string, number | null>,
  failed = false,
): Map<string, MatUse> {
  const out = new Map<string, MatUse>();
  const get = (name: string): MatUse => {
    let u = out.get(name);
    if (!u) { u = { used: null, partial: failed }; out.set(name, u); }
    return u;
  };
  for (const w of works) {
    for (const s of w.mats) {
      const e = parseEntry(s);
      const u = get(e.name);
      const norm = e.norm ?? defaults.get(e.name) ?? null;
      if (w.vol == null || norm == null) { u.partial = true; continue; }
      u.used = (u.used ?? 0) + w.vol * norm;
    }
  }
  /* Нөөцөд байгаа ч ямар ч ажилд оноогоогүй материал — зарцуулалт 0 (мэдэгдэж буй тэг: ажилгүй) */
  for (const name of defaults.keys()) if (!out.has(name)) out.set(name, { used: failed ? null : 0, partial: failed });
  return out;
}

/** Бүх гүйцэтгэлийн хүснэгтийн материалтай ажлууд — `failed` нь уншигдаагүй хүснэгтүүд */
export async function loadWorkUses(): Promise<{ works: WorkUse[]; failed: string[] }> {
  const failed: string[] = [];
  const got = await Promise.all(PKGS.map(async (pkg) => {
    try {
      const sc = await loadSchema(pkg);
      const r = await loadRows(pkg, sc, undefined, undefined, { persist: true });
      const calc = computeAll(r.rows, sc.bld.length, r.asOf);
      const out: WorkUse[] = [];
      r.rows.forEach((row, i) => {
        if (row.group) return;
        const mats = matsOf(row);
        if (!mats.length) return;
        /* Гүйцэтгэсэн обьём — блокуудын хуримтлагдсан нийлбэр; блокгүй хүснэгтэд `obyem_sum` талбар */
        const fromCalc = calc[i]?.obyemSum ?? null;
        const raw = sc.f.obyemSum ? row.raw[sc.f.obyemSum] : null;
        const vol = fromCalc ?? (typeof raw === 'number' && Number.isFinite(raw) ? raw : null);
        out.push({ mats, vol });
      });
      return out;
    } catch {
      failed.push(pkg.key);
      return [];
    }
  }));
  return { works: got.flat(), failed };
}

'use client';

/**
 * «УЛСЫН КОМИСС» — багц бүрийн хуваарийн ТӨГСГӨЛД тусдаа ажилбар (2026-09-28).
 *
 * ⚠️ ЯАГААД ЖИНХЭНЭ МӨР ВЭ: хуваарийн ноорог · батлалт · хамаарал · Gantt
 *    бүгд бөглөх хуудасны серверийн oid / ажлын кодоор түлхүүрлэгддэг.
 *    Дэлгэцийн виртуал мөр бол тэр бүх замд тусгай зохицуулалт хэрэгтэй.
 *    Тиймээс улсын комиссыг эх хуудсанд (`Bagts_*`) үндсэн түвшний навч
 *    мөрөөр, хамгийн сүүлд, обьём/нэгж өртөггүй, жин 0-ээр НЭГ УДАА бичнэ.
 *    Багцын хувь зөвхөн «Б.» мөрөөс уншигддаг тул нөлөөгүй.
 *
 * ⚠️ АВТОМАТ (хэрэглэгчийн сонголт, 2026-09-28): хуваарь төлөвлөх эрхтэй хүн
 *    багцын хуваарийг нээхэд мөр байхгүй бол `ensureKomissRow` дуудагдана.
 *    Бичилт нь `ajilApply.materializeAdds`-тай ИЖИЛ хэлбэр (шинэ жааз, уралдааны
 *    шалгалт, хагас жааз буцаах) — тэндхийн туслахуудыг дахин ашиглана.
 *
 * ⚠️ НЭР «Улсын комисс» — `negtgel.ts`-ийн «Улсын комисс, хүлээлгэн өгөх» (1%)
 *    түлхүүртэй ЗӨРҮҮТЭЙ санаатай: нэгтгэлийн тоонд санамсаргүй орохгүй.
 * ⚠️ № «УК» — үсэг+цэг биш: `ags.levelFromNo` «X.» хэлбэрийг үе шатны толгой
 *    гэж уншдаг тул навч мөрд тийм № өгөхгүй.
 */

import { t as tr } from '@/lib/i18nCore';
import { AUTH } from './services';
import { currentUser, requireCap } from './who';
import { huvaariScope } from './huvaariAcl';
import { fillMsFor, sameFrame } from './ajilApply';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';

export const KOMISS_WORK = 'Улсын комисс';
export const KOMISS_NO = 'УК';

type RowLike = Pick<SheetRow, 'depth' | 'group' | 'work' | 'no'>;

/**
 * Багцын хуудсанд улсын комиссын мөр байгаа юу — № «УК» + нэрээр (цэвэр), навч мөр.
 * ⚠️ 2026-09-25 аудит: ГҮНЭЭС ҮЛ ХАМААРНА. Урьд нь `depth === 0` шаарддаг тул
 *    `loadRows`-ын мод (TREES fallback · `levelFromNo`) мөрийг гүн 1-д тавьбал «алга»
 *    гэж үзэн багц бүрийн нээлт бүрд ШИНЭ жааз + давхар мөр бичих байв. Гүн ≠ 0
 *    бол `ensureInner` console-д тэмдэглэнэ (мөр байгаа — бичихгүй).
 */
export function findKomissRow<T extends RowLike>(rows: readonly T[]): T | null {
  const key = KOMISS_WORK.toLowerCase();
  return rows.find((r) => !r.group && String(r.no ?? '').trim() === KOMISS_NO && String(r.work ?? '').trim().toLowerCase() === key) ?? null;
}

/**
 * Хамаарлын эх — барилгын багцад «Б.» (сүүлийн үндсэн бүлэг), дэд бүтцийн
 * багцад цорын ганц үндсэн бүлэг. Кодгүй бол `null` (хамааралгүй нэмнэ).
 * ⚠️ Ах дүү үндсэн мөрүүд хооронд тул `deps.hierRelated` хаахгүй.
 */
export function komissDepSource(rows: readonly SheetRow[]): number | null {
  const roots = rows.filter((r) => r.depth === 0 && r.group);
  const last = roots[roots.length - 1];
  return last?.des ?? null;
}

export type EnsureResult = { ok: true; added: boolean } | { ok: false; error: string };

/* ⚠️ Нэг сешнд багц тутам давхар бичихгүй (эффект дахин ажиллах, хоёр таб) */
const inFlight = new Map<string, Promise<EnsureResult>>();

/** Багцын хуудсанд «Улсын комисс» мөр байхгүй бол нэмнэ (нэг удаа). */
export function ensureKomissRow(pkgKey: string): Promise<EnsureResult> {
  const cur = inFlight.get(pkgKey);
  if (cur) return cur;
  const p = (async (): Promise<EnsureResult> => {
    try {
      return await ensureInner(pkgKey);
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    } finally {
      inFlight.delete(pkgKey);
    }
  })();
  inFlight.set(pkgKey, p);
  return p;
}

async function ensureInner(pkgKey: string): Promise<EnsureResult> {
  /* ⚠️ Эрх СҮЛЖЭЭНЭЭС ӨМНӨ — хуваарь төлөвлөх эрх + тухайн багцын зохиогчийн хүрээ */
  requireCap('plan');
  const { PKGS, loadSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((x) => x.key === pkgKey);
  if (!pkg) return { ok: false, error: tr('Багц олдсонгүй: {0}', pkgKey) };
  if (AUTH.appId) {
    const me = currentUser();
    if (typeof window !== 'undefined' && !me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc0 = huvaariScope(me, 'author');
    if (sc0 !== null && !sc0.includes(pkg.group)) return { ok: false, error: tr('Энэ багцын хуваарийг төлөвлөх эрхгүй.') };
  }

  const [{ loadRows, applyAdds, applyDeletes }, { appendRootLeaf, buildFrame }, { agsFetch }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
    import('@/modules/sheet/ags'),
  ]);
  /* ⚠️ `synthetic` БИШ — архивын схем FillNew/hyanaltStore-той ИЖИЛ (materializeAdds-ийн ⚠️) */
  const sc = await loadSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);

  const maxOidOf = async (): Promise<number> => {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'mx' }]),
      returnGeometry: 'false',
    });
    const mx = Number(j?.features?.[0]?.attributes?.mx);
    if (!Number.isFinite(mx)) throw new Error(tr('OBJECTID-ийн дээд утга уншигдсангүй'));
    return mx;
  };
  const maxOid0 = await maxOidOf();
  const loaded = await loadRows(pkg, sc);
  {
    const have = findKomissRow(loaded.rows);
    if (have) {
      /* ⚠️ 2026-09-25: гүн ≠ 0 — мод үүсгэлт өөрөөр уншсан; мөр байгаа тул бичихгүй, зөвхөн тэмдэглэнэ */
      if (have.depth !== 0) console.warn('[selbe] «Улсын комисс» мөр гүн', have.depth, 'дээр байна (үндсэн түвшин хүлээсэн):', pkg.key);
      return { ok: true, added: false };
    }
  }
  if (!loaded.rows.length) return { ok: false, error: tr('{0}: хуудсанд мөр алга — эх хүснэгтийг эхлээд ачаална уу.', pkg.label) };

  const src = komissDepSource(loaded.rows);
  const rows = appendRootLeaf(
    loaded.rows,
    { oid: -1, no: KOMISS_NO, work: KOMISS_WORK, ham: src != null ? `${src}FS0` : null },
    sc, nBld,
  );

  const fillMs = fillMsFor(Date.now(), loaded.snapshot);
  const { loadPkgPlan, planPctFromMonths } = await import('@/lib/huvaariObyem');
  let obPlan: Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null = null;
  try { obPlan = (await loadPkgPlan(pkg.key)).plan; } catch { obPlan = null; }
  const asOf = loaded.asOf;
  const frame = buildFrame(rows, sc, nBld, asOf, hasObyem, fillMs, {}, {}, (row, b) => {
    if (!obPlan || row.des == null || asOf == null) return null;
    const blok = sc.bld[b];
    const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
    return m ? planPctFromMonths(m, asOf) : null;
  });

  /* Уралдаа — materializeAdds A.8/A.8а */
  const now = await loadRows(pkg, sc);
  if (findKomissRow(now.rows)) return { ok: true, added: false };
  if (!sameFrame(loaded, now)) return { ok: false, error: tr('Ачаалснаас хойш хуудасны мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
  if ((await maxOidOf()) > maxOid0) return { ok: false, error: tr('Ачаалснаас хойш хуудсанд шинэ мөр орлоо (өөр батлалт зэрэг явсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };

  const written: number[] = [];
  try {
    await applyAdds(pkg, frame, written);
  } catch (e) {
    const why = String((e as Error)?.message ?? e);
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      return {
        ok: false,
        error: left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — AGOL дээр гараар цэвэрлэнэ үү', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`,
      };
    }
    return { ok: false, error: why };
  }

  /* Бичсэний дараа мөр байгааг батална */
  const again = await loadRows(pkg, sc);
  if (!findKomissRow(again.rows)) return { ok: false, error: tr('Бичсэний дараа «Улсын комисс» мөр хуудсанд олдсонгүй — дахин оролдоно уу.') };
  return { ok: true, added: true };
}

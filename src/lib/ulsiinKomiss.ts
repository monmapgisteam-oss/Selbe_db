'use client';

/**
 * «УЛСЫН КОМИСС» — багц бүрийн хуваарийн ТӨГСГӨЛД тусдаа ажилбар (2026-09-28).
 */

import { t as tr } from '@/lib/i18nCore';
import { AUTH } from './services';
import { currentUser } from './who';
import { huvaariScope } from './huvaariAcl';
import { fillMsFor, sameFrame } from './ajilApply';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';

export const KOMISS_WORK = 'Улсын комисс';
export const KOMISS_NO = 'УК';

type RowLike = Pick<SheetRow, 'depth' | 'group' | 'work' | 'no'>;

/**
 * Багцын хуудсанд улсын комиссын мөр байгаа юу — № «УК» + нэрээр (цэвэр), навч мөр.
 */
export function findKomissRow<T extends RowLike>(rows: readonly T[]): T | null {
  const key = KOMISS_WORK.toLowerCase();
  return rows.find((r) => !r.group && String(r.no ?? '').trim() === KOMISS_NO && String(r.work ?? '').trim().toLowerCase() === key) ?? null;
}

/**
 * Хамаарлын эх — барилгын багцад «Б.» (сүүлийн үндсэн бүлэг), дэд бүтцийн
 * багцад цорын ганц үндсэн бүлэг. Кодгүй бол `null` (хамааралгүй нэмнэ).
 */
export function komissDepSource(rows: readonly SheetRow[]): number | null {
  const roots = rows.filter((r) => r.depth === 0 && r.group);
  const last = roots[roots.length - 1];
  return last?.des ?? null;
}

export type EnsureResult = { ok: true; added: boolean } | { ok: false; error: string };

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
  const { PKGS, fillSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((x) => x.key === pkgKey);
  if (!pkg) return { ok: false, error: tr('Багц олдсонгүй: {0}', pkgKey) };
  if (AUTH.appId) {
    const me = currentUser();
    if (typeof window !== 'undefined' && !me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc0 = huvaariScope(me, 'author');
    if (sc0 !== null && !sc0.includes(pkg.group)) return { ok: false, error: tr('Энэ багцын хуваарийг төлөвлөх эрхгүй.') };
  }
  try {
    const { loadPending } = await import('./huvaariBatlah');
    if (await loadPending(pkgKey)) return { ok: true, added: false };
  } catch {
    return { ok: false, error: tr('Батлах урсгал уншигдсангүй — сүлжээгээ шалгана уу.') };
  }

  const [{ loadRows, applyAdds, applyDeletes }, { appendRootLeaf, buildFrame }, { agsFetch }, { archivingBusy }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
    import('@/modules/sheet/ags'),
    import('./submission'),
  ]);
  const archGate = async (): Promise<string | null> => {
    try {
      const b = await archivingBusy(pkg.key);
      return b
        ? tr('{0} энэ багцын гүйцэтгэлийг архивлаж байна ({1}-аас) — дуустал хуваарь бичихгүй. Эх хуудсанд юу ч бичигдсэнгүй; хэдэн минутын дараа дахин оролдоно уу.',
          b.who || '—', new Date(b.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
        : null;
    } catch (e) {
      return tr('Гүйцэтгэлийн архивлалтын төлөв шалгагдсангүй ({0}) — эх хуудсанд юу ч бичигдсэнгүй; дахин оролдоно уу.', String((e as Error)?.message ?? e));
    }
  };
  {
    const why = await archGate();
    if (why) return { ok: false, error: why };
  }
  const sc = await fillSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);

  const maxOidOf = async (): Promise<number> => {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'mx' }]),
      returnGeometry: 'false',
    });
    const mx = Number(j?.features?.[0]?.attributes?.mx);
    if (!Number.isFinite(mx)) throw new Error(tr('Бүртгэлийн дугаарын дээд утга уншигдсангүй'));
    return mx;
  };
  const maxOid0 = await maxOidOf();
  const loaded = await loadRows(pkg, sc, undefined, undefined, { strict: true });
  {
    const have = findKomissRow(loaded.rows);
    if (have) {
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
    return m ? planPctFromMonths(m, asOf, { start: row.start[b] ?? null, end: row.end[b] ?? null }) : null;
  });

  /* Уралдаа — materializeAdds A.8/A.8а */
  const now = await loadRows(pkg, sc);
  if (findKomissRow(now.rows)) return { ok: true, added: false };
  if (!sameFrame(loaded, now)) return { ok: false, error: tr('Ачаалснаас хойш хуудасны мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
  if ((await maxOidOf()) > maxOid0) return { ok: false, error: tr('Ачаалснаас хойш хуудсанд шинэ мөр орлоо (өөр батлалт зэрэг явсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
  {
    const why = await archGate();
    if (why) return { ok: false, error: why };
  }

  const written: number[] = [];
  try {
    for (let i = 0; i < frame.length; i += 500) await applyAdds(pkg, frame.slice(i, i + 500), written);
  } catch (e) {
    const why = String((e as Error)?.message ?? e);
    const ids = new Set(written);
    let foreign = false;
    const { isLostResponse } = await import('./butetsEdit');
    if (isLostResponse(e) && sc.f.fillDate) {
      try {
        const extra: number[] = [];
        const writtenSet = new Set(written);
        const tail: { oid: number; no: string; work: string }[] = [];
        const s2 = (v: unknown) => String(v ?? '').trim();
        for (let off = 0; off <= frame.length; off += 2000) {
          const j = await agsFetch(`${pkg.url}/query`, {
            where: `${sc.f.oid} > ${maxOid0}`,
            outFields: [sc.f.oid, sc.f.fillDate, sc.f.no, sc.f.work].filter(Boolean).join(','),
            orderByFields: `${sc.f.oid} ASC`,
            resultOffset: String(off),
            resultRecordCount: '2000',
            returnGeometry: 'false',
          });
          const feats = (j?.features ?? []) as { attributes?: Record<string, unknown> }[];
          for (const f of feats) {
            const oid = Number(f.attributes?.[sc.f.oid]);
            if (!Number.isInteger(oid)) continue;
            if (Number(f.attributes?.[sc.f.fillDate]) === fillMs) {
              extra.push(oid);
              if (!writtenSet.has(oid)) tail.push({ oid, no: s2(sc.f.no ? f.attributes?.[sc.f.no] : ''), work: s2(sc.f.work ? f.attributes?.[sc.f.work] : '') });
            } else foreign = true;
          }
          if (feats.length < 2000) break;
        }
        if (extra.length > frame.length) foreign = true;
        /* баталгаагүй мөрүүд манай жаазын `written.length`-ээс хойших хэсэгтэй дарааллаараа таарах ёстой */
        tail.sort((a, b) => a.oid - b.oid);
        const base = written.length;
        if (base + tail.length > frame.length) foreign = true;
        else for (let k = 0; k < tail.length && !foreign; k++) {
          const exp = frame[base + k] ?? {};
          if (tail[k].no !== s2(sc.f.no ? exp[sc.f.no] : '') || tail[k].work !== s2(sc.f.work ? exp[sc.f.work] : '')) foreign = true;
        }
        if (!foreign) for (const x of extra) ids.add(x);
      } catch {
        foreign = true;
      }
    }
    if (ids.size) {
      const gone = await applyDeletes(pkg, [...ids]);
      const left = ids.size - gone;
      return {
        ok: false,
        error: left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай)', ids.size, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', ids.size)}`
            + (foreign ? ` · ${tr('Хариу алдагдсан тул бусад шинэ мөрийг шалгаж чадсангүй — админд мэдэгдэнэ үү')}` : ''),
      };
    }
    if (foreign) return { ok: false, error: `${why} · ${tr('Хариу алдагдсан тул бусад шинэ мөрийг шалгаж чадсангүй — админд мэдэгдэнэ үү')}` };
    return { ok: false, error: why };
  }

  /* Бичсэний дараа мөр байгааг батална */
  const again = await loadRows(pkg, sc);
  if (!findKomissRow(again.rows)) return { ok: false, error: tr('Бичсэний дараа «Улсын комисс» мөр хуудсанд олдсонгүй — дахин оролдоно уу.') };
  return { ok: true, added: true };
}

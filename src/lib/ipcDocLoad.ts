'use client';

/**
 * САР БҮРИЙН IPC БАРИМТЫН ӨГӨГДӨЛ — сүлжээ (2026-09-29). Тооцоо нь `ipcDoc.ts`-д.
 *
 * ЭХ СУРВАЛЖ:
 *   · Бөглөх хуудас (`Bagts_*`) — батлагдсан архивын агшин бүр (`buglusun_ognoo`).
 *     Блок бүрийн хуримтлагдсан БУА = Σ навч мөрийн (обьём × нэгж өртөг).
 *     Төлөвлөсөн огноо (хуваарь) ба гэрээний огноо ч эндээс.
 *   · ХО гүйцэтгэл (`HO_guitsetgel`) — гэрээний дүн · дугаар · гүйцэтгэгч · урьдчилгаа.
 *
 * ⚠️ НЭГ БАГЦ — ОЛОН ХУУДАС: 9 ба 12 давхрын хуудас (Багц 1, 2, 4.2) нэг гэрээнд. Блокууд
 *    нийлж нэг баримт болно; блокийн нэрэнд давхрыг угтвар болгоно («12F 5/1»).
 * ⚠️ «Сард нэг бөглөнө» (хэрэглэгч) — хуудас бүрд тухайн сарын СҮҮЛИЙН агшин. Нэг сард
 *    бөглөөгүй хуудас өмнөх агшнаараа үлдэнэ (тайлант гүйцэтгэл нь 0).
 * ⚠️ Архив нь зөвхөн системд бөглөж эхэлснээс хойш (2026-09-03) — түүнээс өмнөх цаасан
 *    IPC-ийг дахин гаргахгүй; эхний сарын «өмнөх» нь 0 (`ipcDoc`-ийн анхааруулга).
 */

import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows, msToDay, normDayMs, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { agsFetch } from '@/modules/sheet/ags';
import { bagtsKey } from '@/lib/services';
import { loadHoRows, groupHo } from '@/lib/ipc';
import { autoContractFor, pickContract } from '@/lib/ipcAuto';
import { monthEnds, pkgCodeOf, type IpcBlock, type IpcMonth, type IpcSheetStart } from '@/lib/ipcDoc';
import { register } from '@/lib/dataBus';

export type IpcSource = {
  pkgName: string;
  pkgCode: string;
  project: string;
  contractor: string;
  contractNo: string;
  contract: number | null;
  advance: number | null;
  contractStart: number | null;
  contractEnd: number | null;
  blocks: IpcBlock[];
  months: IpcMonth[];
  /**
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): хуудас бүрийн ЭХНИЙ агшин — `buildIpcDoc`
   * (`...src`-ээр дамжина) орой эхэлсэн хуудсыг (`lateSheetsOf`) анхааруулна.
   */
  sheets: IpcSheetStart[];
  /**
   * ⚠️ 2026-10-09: багцад олон гэрээ ялгагдахгүй таарсан үед (`ipcAuto.pickContract`) — аль гэрээг
   * сонгосныг хэлэх өгүүлбэр; дуудагч ил харуулна. Ганц/тодорхой бол `null`.
   */
  warn?: string | null;
};

/** Хуудасны шошго — олон хуудастай багцад давхраар («12F»), эс бөгөөс хуудасны нэр */
const sheetLabel = (pkg: Pkg): string => (pkg.floors ? `${pkg.floors}F` : pkg.label);

/** Багцын түлхүүр (`bagtsKey`, «БАГЦ32») → бөглөх хуудсууд */
export const sheetsOf = (packKey: string): Pkg[] => PKGS.filter((p) => bagtsKey(p.group) === packKey);

/** Нормчилсон өдөр → `dayFilter`-т олдох түүхий өдөр (зөвхөн зөрсөн үед) — `fillDays`-ийн ⚠️ */
const rawDay = new Map<string, string>();
const rawOf = (pkg: Pkg, day: string): string => rawDay.get(`${pkg.key}|${day}`) ?? day;

/**
 * Хуудасны архивын өдрүүд — `returnDistinctValues` (нэг хүсэлт).
 * ⚠️ 2026-10-09: өдрийг `msToDay(normDayMs(v))`-ээр бүлэглэнэ/шошголно — ЛОКАЛ шөнө дундаар (16:00Z)
 *    тамгалсан хуучин жааз урьд нь ӨМНӨХ өдөр (сарын эхэнд бол өмнөх САР) болж бүлэглэгддэг байв.
 *    Харин жаазыг `loadRows(pkg, sc, day)`-ийн ХАТУУ `dayFilter` (00:00–23:59 UTC)-ээр татдаг тул 16:00Z
 *    тамгатай жааз нормчилсон өдрийн мужид ОРОХГҮЙ — тийм өдөрт түүхий өдрийг (`rawOf`) хадгалж татахдаа
 *    түүгээр асууна. Тэр өдөр ЯГ (00:00Z) тамгатай жааз ч байвал нормчилсон өдрөөрөө (шинэ дүрэм).
 */
async function fillDays(pkg: Pkg, sc: Schema): Promise<string[]> {
  const f = sc.f.fillDate;
  if (!f) return [];
  const days = new Set<string>();
  const exact = new Set<string>();
  const shifted = new Map<string, string>();
  /* ⚠️ Хуудаслалт + `orderByFields` (CLAUDE.md-ийн ArcGIS занга)
     ⚠️ 2026-10-09 (аудит №6): `exceededTransferLimit`-ээр таслана, `fs.length < 2000`-оор БИШ
     (`hyanalt.queryAll`-ийн загвар) — үйлчилгээний `maxRecordCount` 2000-аас бага (1000) бол эхний
     хуудсаар зогсож, сүүлийн өдрүүд чимээгүй алга болдог байв; offset-ийг ирсэн мөрийн тоогоор нэмнэ. */
  for (let off = 0; ; ) {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: `${f} IS NOT NULL`, outFields: f, returnDistinctValues: 'true', returnGeometry: 'false',
      orderByFields: `${f} ASC`, resultOffset: String(off), resultRecordCount: '2000',
    });
    const fs = (j.features ?? []) as { attributes: Record<string, unknown> }[];
    for (const x of fs) {
      const v = x.attributes[f];
      if (typeof v !== 'number') continue;
      const d = msToDay(normDayMs(v));
      days.add(d);
      /* түүхий өдөр нь өөр бол (16:00Z) хатуу шүүлтэд олдох өдрийг тэмдэглэнэ; тэр өдөр ЯГ (00:00Z)
         тамгатай жааз бас байвал түүнийг (шинэ дүрмийн) хэвээр */
      const raw = msToDay(v);
      if (raw === d) exact.add(d);
      else if (!shifted.has(d)) shifted.set(d, raw);
    }
    if (!j.exceededTransferLimit || !fs.length) break;
    off += fs.length;
  }
  for (const [d, raw] of shifted) {
    if (exact.has(d)) rawDay.delete(`${pkg.key}|${d}`);
    else rawDay.set(`${pkg.key}|${d}`, raw);
  }
  return [...days].sort();
}

/** Блок бүрийн хуримтлагдсан БУА — `null` = тэр блокт хэмжилт огт алга */
function cumByBlock(rows: readonly SheetRow[], n: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: n }, () => null);
  for (const r of rows) {
    if (r.group || r.unit == null) continue;
    for (let b = 0; b < n; b += 1) {
      const o = r.obyem[b];
      if (o == null) continue;
      out[b] = (out[b] ?? 0) + o * r.unit;
    }
  }
  return out;
}

const minN = (xs: (number | null)[]) => xs.reduce<number | null>((m, x) => (x == null ? m : m == null || x < m ? x : m), null);
const maxN = (xs: (number | null)[]) => xs.reduce<number | null>((m, x) => (x == null ? m : m == null || x > m ? x : m), null);

export async function loadIpcSource(packKey: string): Promise<IpcSource> {
  const sheets = sheetsOf(packKey);
  if (!sheets.length) throw new Error(`«${packKey}» багцад бөглөх хуудас алга.`);
  const multi = sheets.length > 1;
  const [hoRows, parts] = await Promise.all([
    loadHoRows(),
    Promise.all(sheets.map(async (pkg) => {
      const sc = await loadSchema(pkg);
      const days = await fillDays(pkg, sc);
      return { pkg, sc, days };
    })),
  ]);
  /* ⚠️ 2026-10-09: багцад ОЛОН гэрээ таарвал ЭХНИЙХ биш — `ipcAuto.pickContract` (барилга угсралт →
     «Гүйцэтгэл» төлбөртэй → кодоор); ялгагдахгүй үлдвэл `warn` (баримтын цонх ил харуулна). */
  /* ⚠️ 2026-10-09 (F6): AUTO мөр бичигддэг гэрээтэй (`ipcAutoWrite.syncIpcFromFill` → `autoContractFor`) ЯГ
     ижил гэрээг сонгоно. Урьд нь `groupHo`-ийн бүлгүүдээс (кодгүй '' бүлэг эрэмбээр ЭХЭНД, `hasWork` нь
     төлсөн дүнгээр — `contractFor`-оос өөр) сонгодог тул баримт ӨӨР гэрээний толгойтой гарч болдог байв.
     Код олдохгүй бол хуучин сонголт (`pickContract`). */
  const cands = groupHo(hoRows).filter((c) => c.key === packKey);
  const cf = autoContractFor(hoRows, packKey);
  const byCode = cf.code ? cands.find((c) => c.code === cf.code) ?? null : null;
  const picked = byCode
    ? { pick: { c: byCode }, warn: cf.warn }
    : pickContract(
      cands.map((c) => ({ c, code: c.code, workType: c.workType, hasWork: c.workTotal != null && c.workTotal > 0 })),
      packKey,
    );
  const ho = picked.pick?.c ?? null;

  /* Сарууд — аль нэг хуудсанд агшинтай сар бүр */
  const allMonths = [...new Set(parts.flatMap((p) => [...monthEnds(p.days).keys()]))].sort();

  /* Хуудас бүрийн агшин бүрийг НЭГ удаа татна */
  const cache = new Map<string, Promise<SheetRow[]>>();
  const rowsAt = (pkg: Pkg, sc: Schema, day: string) => {
    const k = `${pkg.key}|${day}`;
    let p = cache.get(k);
    /* ⚠️ 2026-10-09: хатуу `dayFilter`-т ТҮҮХИЙ өдрөөр (`fillDays`-ийн ⚠️) */
    if (!p) { p = loadRows(pkg, sc, rawOf(pkg, day)).then((r) => r.rows); cache.set(k, p); }
    return p;
  };

  const blocks: IpcBlock[] = [];
  const offsets: number[] = [];
  let cStart: (number | null)[] = [];
  let cEnd: (number | null)[] = [];
  for (const { pkg, sc, days } of parts) {
    offsets.push(blocks.length);
    const last = days[days.length - 1];
    const rows = last ? await rowsAt(pkg, sc, last) : (await loadRows(pkg, sc)).rows;
    const leaves = rows.filter((r) => !r.group);
    /* Нэг блокийн гэрээний жин — `Обьём` нь НЭГ блокийнх (Σ обьём×нэгж өртөг × блокийн тоо ≈ гэрээний БУА) */
    const weight = leaves.reduce((s, r) => s + (r.vol != null && r.unit != null ? r.vol * r.unit : 0), 0);
    sc.bld.forEach((b, i) => {
      blocks.push({
        label: multi && pkg.floors ? `${pkg.floors}F ${b}` : b,
        weight,
        planStart: minN(leaves.map((r) => r.start[i] ?? null)),
        planEnd: maxN(leaves.map((r) => r.end[i] ?? null)),
      });
    });
    cStart = cStart.concat(leaves.flatMap((r) => r.gStart));
    cEnd = cEnd.concat(leaves.flatMap((r) => r.gEnd));
  }

  const months: IpcMonth[] = [];
  for (const m of allMonths) {
    const cum: (number | null)[] = Array.from({ length: blocks.length }, () => null);
    let dayMax = '';
    await Promise.all(parts.map(async ({ pkg, sc, days }, k) => {
      /* тухайн сарын төгсгөл хүртэлх сүүлийн агшин */
      const upto = days.filter((d) => d.slice(0, 7) <= m);
      const d = upto[upto.length - 1];
      if (!d) return;
      if (d > dayMax) dayMax = d;
      const c = cumByBlock(await rowsAt(pkg, sc, d), sc.bld.length);
      c.forEach((v, i) => { cum[offsets[k] + i] = v; });
    }));
    months.push({ month: m, day: dayMax, cum });
  }

  const group = sheets[0].group;
  return {
    pkgName: group,
    pkgCode: pkgCodeOf(group),
    project: ho?.project || group,
    contractor: ho?.contractor ?? '',
    contractNo: ho?.contractNo ?? '',
    contract: ho?.contractTotal ?? null,
    advance: ho?.advanceTotal ?? null,
    /* ⚠️ Гэрээний огноо (`geree_ehleh/duusah`) бөглөгдөөгүй хуудас олон — тэр үед блокуудын
       ТӨЛӨВЛӨСӨН мужаар (скан баримтын «Эхлэх ба дуусах» хоосон үлдэхгүй). */
    contractStart: minN(cStart) ?? minN(blocks.map((b) => b.planStart)),
    contractEnd: maxN(cEnd) ?? maxN(blocks.map((b) => b.planEnd)),
    blocks,
    months,
    sheets: multi ? parts.map(({ pkg, days }) => ({ label: sheetLabel(pkg), first: days[0] ?? null })) : [],
    warn: picked.warn,
  };
}

/**
 * ОЛОН ХУУДАСТАЙ БАГЦЫН хуудас бүрийн ЭХНИЙ агшин — ХӨНГӨН (хуудас бүрд нэг
 * `returnDistinctValues` асуулга, мөр татахгүй). IPC карт (`IpcTable`) орой эхэлсэн
 * хуудсыг (`ipcDoc.lateSheetsOf`) баримт нээхээс ӨМНӨ анхааруулахад (2026-10-01,
 * «хэрэглэгч: бүгдийг зас»).
 * ⚠️ Нэг хуудастай багц → `[]` (асуулга явахгүй — орой эхлэх хуудас байхгүй).
 * ⚠️ Кэш: бөглөх хуудас руу бичихэд (`BAGTS_SHEET`) хаягдана; алдааг кэшлэхгүй.
 */
const startsCache = new Map<string, Promise<IpcSheetStart[]>>();
register(() => startsCache.clear(), ['BAGTS_SHEET']);
export function loadSheetStarts(packKey: string): Promise<IpcSheetStart[]> {
  const sheets = sheetsOf(packKey);
  if (sheets.length < 2) return Promise.resolve([]);
  const hit = startsCache.get(packKey);
  if (hit) return hit;
  const mine = Promise.all(sheets.map(async (pkg) => {
    const sc = await loadSchema(pkg);
    const days = await fillDays(pkg, sc);
    return { label: sheetLabel(pkg), first: days[0] ?? null };
  }));
  startsCache.set(packKey, mine);
  mine.catch(() => { if (startsCache.get(packKey) === mine) startsCache.delete(packKey); });
  return mine;
}

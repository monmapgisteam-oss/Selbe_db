/**
 * БАГЦ ХООРОНДЫН АЖЛЫН ХАМААРАЛ — АЛСЫН УНШИЛТ / БИЧИЛТ (2026-10-22). Цэвэр логик нь `workDeps.ts`.
 *
 * ⚠️ УНШИЛТ: 24 бөглөх хуудасны СҮҮЛИЙН жааз (`bagtsSheet.loadRows` — жааз сонгох, гүн, тасарсан жаазын
 *    хамгаалалт бүгд тэндээс) ЗӨВХӨН 6 баганаар (`oid` · № · Ажил · `gun` · `Des_dugaar` · `bagts_hamaaral`),
 *    `persist` (хөтчийн кэш, тандалтаар шинэлэг эсэхийг батална). Талбар нь давхаргын МЕТАД (`fillSchema` →
 *    `f.bham`) байвал л асууна — байхгүй баганыг `outFields`-д оруулбал асуулга бүхэлдээ унана.
 * ⚠️ БИЧИЛТ: ЗӨВХӨН хамаарах ажлын мөрийн `bagts_hamaaral` (`applyEdits` updates, `applyUpdates` — 200+{error} ·
 *    мөр бүрийн `success` · хариу алдагдсан эсэх тэнд). Бичихийн ӨМНӨ сүүлийн жаазыг серверээс ДАХИН уншиж
 *    (`strict`), одоогийн утга дээр хэрэглэгчийн өөрчлөлтийг (нэмэх/хасах) давтана — зэрэг засварлагчид бие
 *    биенийхээ холбоог дарахгүй. Бичихийн өмнө/дараа хүснэгтийн max(OBJECTID)-ийг жишнэ: хооронд нь архивт ШИНЭ
 *    жааз орсон бол бидний бичилт хуучин жаазад буусан тул шинэ жааз дээр давтана (нэмэх/хасах idempotent).
 *    Эсрэг тал (архивын бичигч бидний бичилтээс ӨМНӨ уншсан) — `hyanaltStore` · `ajilApply` · `ulsiinKomiss` нь
 *    суурь жаазын засварыг (`sameFrame` · `frameEditMax`) аль хэдийн илрүүлж өөрийн жаазыг буцаадаг.
 * ⚠️ 2026-10-22 (аудит): `ajilApply` ба `ulsiinKomiss` нь `sameFrame`-ээ БИЧИХИЙН ӨМНӨ л шалгадаг (бичсэний дараа суурийн
 *    засварыг хардаггүй) — тэр завсарт буусан бидний бичилт шинэ жаазад ХУУЧИН утгаараа хуулагдаж, max(OBJECTID) нь бидний
 *    дараах уншилтаас хожуу өсвөл ЧИМЭЭГҮЙ алга болно. Тиймээс бусад `applyUpdates` бичигчийн (`Huvaari.archGate` ·
 *    `materialAjil`) ЯГ гэрээ: архивлалт (`archivingBusy`) ба нэмэлт ажлын буулгалт (`ajilApplyBusyFor`) явж байвал
 *    БИЧИХГҮЙ — уншихаас өмнө ба бичихийн ЯГ өмнө; шалгаж чадахгүй бол ч бичихгүй (fail-closed).
 * ⚠️ 2026-10-22 (аудит): ДУГУЙН ШАЛГАЛТ СҮҮЛИЙН ӨГӨГДӨЛ ДЭЭР — харагдацын граф хэдэн цагаар хуучирч болно (өөр хүн
 *    эсрэг холбоо нэмсэн); бичихийн өмнө бусад 23 хуудсыг САНАХ ОЙН кэшгүй (хөтчийн кэш нь тандалтаар шинэлэг) дахин
 *    уншиж, энэ хуудасны `strict` мөрүүдтэй нийлүүлсэн графаар шалгана (`rebaseChange` · `checkNext`).
 * ⚠️ `requireCap('hamaaral')` — консолоос дуудсан ч эрхгүй бол бичихгүй (`who.ts`-ийн ⚠️).
 * ⚠️ ArcGIS/Enterprise руу ЗӨВХӨН `saveWorkLinks` бичнэ — уншигч функцүүд бичихгүй.
 */
import { t as tr } from '@/lib/i18nCore';
import { PKGS, fillSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows } from '@/modules/sheet/bagtsSheet';
import { agsFetch } from '@/modules/sheet/ags';
import { register } from './dataBus';
import { SESSION_TTL_MS } from './live';
import { bagtsKey } from './services';
import { isLostWrite } from './lostWrite';
import {
  applyRefChange, buildGraph, checkNext, locateRow, parseRefs, pkgDeps, pkgPairs, rebaseChange, refsJson, sameRefs,
  type PkgDep, type RefChange, type SheetIn, type WorkGraph, type WorkRef, type WorkRow,
} from './workDeps';

/** Нэг хуудасны уншилт — `rows: null` бол уншигдаагүй (`error`) */
export type SheetLoad = { pkg: Pkg; field: string | null; rows: WorkRow[] | null; error: string | null };

/** Уншилтын баганууд — байхгүй (`null`) талбар ОРОХГҮЙ */
const fieldsFor = (sc: Schema): string[] => [...new Set([
  sc.f.oid, sc.f.no, sc.f.work, sc.f.gun, sc.f.des, sc.f.bham,
].filter((x): x is string => !!x))];

const toWork = (sc: Schema, r: { oid: number; no: string; work: string; depth: number; group: boolean; des: number | null; raw: Record<string, unknown> }): WorkRow => ({
  oid: r.oid, no: r.no, work: r.work, depth: r.depth, group: r.group, des: r.des,
  val: sc.f.bham ? r.raw[sc.f.bham] ?? null : undefined,
});

/* ── Кэш (багц тутамд, 5 мин) ──
   ⚠️ `BAGTS_SHEET` бичилт бүрд БҮХЭЛД НЬ хаягдана. ⚠️ 2026-10-22 (аудит): урьд нь өөрийн бичилтэд (`ownWrite` туг)
   зөвхөн тэр хуудсыг хаядаг байв — туг `await applyUpdates`-ийн БҮХ хугацаанд (сүлжээ) тавигддаг тул тэр зуур өөр
   бичигчийн зарлал ч зөвхөн манай хуудсыг хаяж, бусад нь TTL хүртэл хуучин үлддэг байв. Дахин уншилт нь хөтчийн
   кэшээр (`persist` — тандалт таарвал сүлжээгүй, зөвхөн өөрчлөгдсөн хуудас татагдана) тул бүтэн хаялт хямд. */
type Entry = { p: Promise<SheetLoad>; at: number };
const cache = new Map<string, Entry>();
register(() => cache.clear(), ['BAGTS_SHEET']);

/** `fresh` — санах ойн кэшийг алгасна (бичихийн өмнөх дугуйн шалгалт); хөтчийн кэш тандалтаар шалгагдсан хэвээр */
function loadSheet(pkg: Pkg, fresh = false): Promise<SheetLoad> {
  const hit = cache.get(pkg.key);
  if (!fresh && hit && Date.now() - hit.at <= SESSION_TTL_MS) return hit.p;
  const p = (async (): Promise<SheetLoad> => {
    let sc: Schema;
    try {
      sc = await fillSchema(pkg);
    } catch (e) {
      return { pkg, field: null, rows: null, error: String((e as Error)?.message ?? e) };
    }
    try {
      const { rows } = await loadRows(pkg, sc, undefined, fieldsFor(sc), { persist: true });
      return { pkg, field: sc.f.bham ?? null, rows: rows.map((r) => toWork(sc, r)), error: null };
    } catch (e) {
      return { pkg, field: sc.f.bham ?? null, rows: null, error: String((e as Error)?.message ?? e) };
    }
  })();
  const entry: Entry = { p, at: Date.now() };
  cache.set(pkg.key, entry);
  /* ⚠️ Уналт КЭШЛЭГДЭХГҮЙ (дараагийн дуудалт дахин оролдоно) — зөвхөн өөрөө идэвхтэй бол */
  void p.then((r) => { if (!r.rows && cache.get(pkg.key) === entry) cache.delete(pkg.key); });
  return p;
}

/** «Дахин ачаалах» — санах ойн кэшийг хаяна (хөтчийн `persist` кэш тандалтаар өөрөө шалгагдана) */
export function dropWorkCache(): void {
  cache.clear();
}

export type WorkData = { sheets: SheetLoad[]; graph: WorkGraph };

/** 24 хуудас + граф. Хуудас бүрийн уналт `SheetLoad.error`-т (бүхэлдээ шидэхгүй) */
export async function loadWorkData(): Promise<WorkData> {
  const sheets = await Promise.all(PKGS.map((p) => loadSheet(p)));
  const ins: SheetIn[] = sheets.map((s) => ({ p: s.pkg.key, rows: s.rows, field: !!s.field }));
  return { sheets, graph: buildGraph(ins) };
}

/** Багцын түлхүүр (`bagtsKey`, ТУХ-ын `pkgKey`) → хуудсууд (9F/12F) */
export const sheetsOfPkgKey = (k: string): string[] => (k ? PKGS.filter((p) => bagtsKey(p.group) === k).map((p) => p.key) : []);
/** Хуудас → багцын түлхүүр */
export const pkgKeyOfSheet = (p: string): string => {
  const x = PKGS.find((q) => q.key === p);
  return x ? bagtsKey(x.group) : '';
};

/**
 * ТУХ-ын БАГЦЫН ТҮВШНИЙ ХАМААРАЛ — ажлын графаас (`pkgDeps`, түлхүүр нь `bagtsKey`).
 * ⚠️ Талбар НЭГ Ч хуудсанд алга бол хуудас ОГТ уншихгүй (`[]`) — мета нь кэштэй.
 * ⚠️ Талбартай хуудас уншигдаагүй бол ШИДНЭ — ТУХ «Багцын хамаарал»-ыг уналтад нэрлэнэ («—» = холбоогүй
 *    гэж худал харуулахгүй).
 */
export async function loadPkgDeps(): Promise<{ deps: PkgDep[] }> {
  const scs = await Promise.allSettled(PKGS.map((p) => fillSchema(p)));
  if (!scs.some((r) => r.status === 'fulfilled' && r.value.f.bham)) {
    if (scs.some((r) => r.status === 'rejected')) throw new Error(tr('Бөглөх хуудасны мета уншигдсангүй'));
    return { deps: [] };
  }
  const { sheets, graph } = await loadWorkData();
  /* ⚠️ 2026-10-22 (аудит): мета нь уншигдаагүй хуудас (`field: null`, `rows: null`) ч УНАЛТ — урьд нь `s.field &&` нөхцөлөөр
     алгасагдаж тэр багцын холбоо ТУХ-д «—» (холбоогүй) гэж ХУДАЛ харагддаг байв. Талбаргүй хуудас `rows`-тэй тул орохгүй. */
  const bad = sheets.filter((s) => !s.rows).map((s) => s.pkg.label);
  if (bad.length) throw new Error(tr('Уншигдаагүй хуудас: {0}', bad.join(', ')));
  return { deps: pkgDeps(pkgPairs(graph), pkgKeyOfSheet) };
}

/* ══════════════ Бичилт ══════════════ */

/** Хүснэгтийн max(OBJECTID) — архивт шинэ жааз орсныг илрүүлнэ (жааз бүр шинэ OBJECTID-тай) */
async function maxOid(pkg: Pkg, sc: Schema): Promise<number> {
  const j = await agsFetch(`${pkg.url}/query`, {
    where: '1=1',
    outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'hi' }]),
    returnGeometry: 'false',
  });
  const v = Number(j?.features?.[0]?.attributes?.hi);
  if (!Number.isFinite(v)) throw new Error(tr('OBJECTID-ийн дээд утга уншигдсангүй'));
  return v;
}

/** Нэг мөрийн талбарын одоогийн утга (хариу алдагдсаны дараах баталгаа) — мөр алга бол `undefined` */
async function readVal(pkg: Pkg, sc: Schema, field: string, oid: number): Promise<unknown> {
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${sc.f.oid} = ${Math.trunc(oid)}`,
    outFields: `${sc.f.oid},${field}`,
    returnGeometry: 'false',
  });
  const f = (j?.features ?? [])[0] as { attributes?: Record<string, unknown> } | undefined;
  return f?.attributes ? (f.attributes[field] ?? null) : undefined;
}

const norm = (v: unknown): string => (v == null ? '' : String(v).trim());

export type SaveRes = { ok: true; refs: WorkRef[]; wrote: boolean } | { ok: false; error: string };

/** Архивлалт · нэмэлт ажлын буулгалт явж байна уу — бол шалтгаан (толгойн ⚠️; уншиж чадахгүй бол ч шалтгаан) */
async function busyWhy(pkg: Pkg): Promise<string | null> {
  try {
    const [{ archivingBusy }, { ajilApplyBusyFor }] = await Promise.all([import('./submission'), import('./ajilBatlah')]);
    const arch = await archivingBusy(pkg.key);
    if (arch) return tr('{0} энэ багцын гүйцэтгэлийг архивлаж байна — дуусахыг хүлээгээд дахин хадгална уу. Юу ч бичигдсэнгүй.', arch.who || '—');
    const aj = await ajilApplyBusyFor(pkg.key);
    if (aj) return tr('{0} энэ багцад нэмэлт ажлыг яг одоо хуудсанд буулгаж байна — дуусахыг хүлээнэ үү. Юу ч бичсэнгүй.', aj.who || '—');
    return null;
  } catch (e) {
    return tr('Архивлалтын төлөв шалгагдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', String((e as Error)?.message ?? e));
  }
}

/**
 * `dep` ажлын (харагдацын графын холбоос) урьдчилагчдыг өөрчилнэ — толгойн ⚠️-ийн урсгал. Дугуйн шалгалт нь
 * бичихийн өмнө дахин уншсан СҮҮЛИЙН өгөгдөл дээр (харагдацын граф биш); нэмэлттэй үед бусад хуудас уншигдаагүй бол
 * бичихгүй.
 */
export async function saveWorkLinks(dep: WorkRef, change: RefChange): Promise<SaveRes> {
  const { requireCap } = await import('./who');
  try { requireCap('hamaaral'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const pkg = PKGS.find((x) => x.key === dep.p);
  if (!pkg) return { ok: false, error: tr('Хуудас олдсонгүй') };
  let sc: Schema;
  try { sc = await fillSchema(pkg); } catch (e) { return { ok: false, error: String((e as Error)?.message ?? e) }; }
  const fld = sc.f.bham;
  if (!fld) return { ok: false, error: tr('«{0}» хуудсанд «{1}» талбар алга — админ нэмэх хүртэл хадгалах боломжгүй', pkg.label, 'bagts_hamaaral') };
  /* ⚠️ Бусад хуудас — НЭГ удаа (давталт нь зөвхөн энэ хуудасны жааз солигдсоноос) */
  const others = await Promise.all(PKGS.filter((x) => x.key !== pkg.key).map((x) => loadSheet(x, true)));
  const down = others.filter((x) => !x.rows).map((x) => x.pkg.label);
  if (change.add.length && down.length)
    return { ok: false, error: tr('Уншигдаагүй хуудас ({0}) — дугуй хамаарлыг шалгах боломжгүй тул хадгалсангүй: {1}', String(down.length), down.join(', ')) };
  let why = tr('Хуудас зэрэг шинэчлэгдэж байна — дахин оролдоно уу');
  for (let i = 0; i < 3; i += 1) {
    const busy0 = await busyWhy(pkg);
    if (busy0) return { ok: false, error: busy0 };
    let hi0: number;
    let rows: WorkRow[];
    try {
      hi0 = await maxOid(pkg, sc);
      /* ⚠️ `strict` — бичих зам: тасарсан жаазыг хүлээж авахгүй (`loadRows`-ийн ⚠️); кэшгүй (серверээс) */
      rows = (await loadRows(pkg, sc, undefined, fieldsFor(sc), { strict: true })).rows.map((r) => toWork(sc, r));
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
    const row = locateRow(rows, dep);
    if (!row) return { ok: false, error: tr('Ажил хуудасны сүүлийн агшинд олдсонгүй (хуудас шинэчлэгдсэн) — дахин ачаална уу') };
    let cur: WorkRef[];
    try {
      cur = parseRefs(row.val);
    } catch (e) {
      /* ⚠️ Эвдэрсэн бичлэгийг ДАРЖ БИЧИХГҮЙ — админ засна */
      return { ok: false, error: `${(e as Error).message} — ${tr('бичлэгийг дарахгүйн тулд хадгалсангүй')}` };
    }
    /* ⚠️ Сүүлийн граф: бусад хуудас (дээр шинээр уншсан) + энэ хуудасны `strict` мөрүүд */
    const g = buildGraph([
      ...others.map((x): SheetIn => ({ p: x.pkg.key, rows: x.rows, field: !!x.field })),
      { p: pkg.key, rows, field: true },
    ]);
    const depId = (g.bySheet.get(pkg.key) ?? []).find((id) => g.nodes.get(id)?.oid === row.oid);
    if (!depId) return { ok: false, error: tr('Ажил хуудасны сүүлийн агшинд олдсонгүй (хуудас шинэчлэгдсэн) — дахин ачаална уу') };
    const next = applyRefChange(cur, rebaseChange(g, cur, change));
    if (sameRefs(cur, next)) return { ok: true, refs: cur, wrote: false };
    const err = checkNext(g, depId, cur, next);
    if (err) return { ok: false, error: err };
    const json = refsJson(next);
    /* ⚠️ Бичихийн ЯГ өмнө дахин (толгойн ⚠️ — `Huvaari.archGate`-ийн ижил) */
    const busy1 = await busyWhy(pkg);
    if (busy1) return { ok: false, error: busy1 };
    try {
      await applyUpdates(pkg, [{ [sc.f.oid]: row.oid, [fld]: json }]);
    } catch (e) {
      if (!isLostWrite(e)) return { ok: false, error: String((e as Error)?.message ?? e) };
      /* ⚠️ Хариу алдагдсан — бичигдсэн эсэхийг ДАХИН уншиж батална (худал «амжилтгүй»/«амжилттай» хэлэхгүй) */
      let v: unknown;
      try { v = await readVal(pkg, sc, fld, row.oid); } catch { v = undefined; }
      if (v === undefined) return { ok: false, error: tr('Хадгалагдсан эсэх тодорхойгүй (хариу алдагдсан) — хуудсыг дахин ачаалж шалгана уу') };
      /* ⚠️ 2026-10-22 (аудит): бичигдээгүй — дахин оролдоно; гурвуулаа ингэж унавал «зэрэг шинэчлэгдэж байна» биш ЖИНХЭНЭ шалтгаан */
      if (norm(v) !== norm(json)) { why = tr('Серверийн хариу алдагдаж, хадгалагдсангүй — дахин оролдоно уу'); continue; }
    }
    let hi1 = hi0;
    try { hi1 = await maxOid(pkg, sc); } catch { /* бичигдсэн — жааз солигдсон эсэхийг шалгаж чадсангүй */ }
    if (hi1 === hi0) return { ok: true, refs: next, wrote: true };
    /* ⚠️ Хооронд нь архивт шинэ жааз орсон — бичилт хуучин жаазад буусан байж болно; шинэ жааз дээр давтана */
    why = tr('Хуудас зэрэг шинэчлэгдэж байна — дахин оролдоно уу');
  }
  return { ok: false, error: why };
}

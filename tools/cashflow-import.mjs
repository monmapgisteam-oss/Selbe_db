/**
 * САНХҮҮЖИЛТ ← EXCEL — `Cashflow_0909/0` (Enterprise `Guitsetgel_talbe/182`, кодын `CASHFLOW_NEW`) хүснэгтийг
 * «Төсөл төлөвлөгөө биелэлт» хуудасны (261007 V3) шатлалаар шинэчлэх хэрэгсэл (2026-10-26).
 *
 * Ажиллуулах (анхдагч нь DRY-RUN — юу ч бичихгүй):
 *     node tools/cashflow-import.mjs "<xlsx>" --exceljs=<exceljs агуулсан node_modules> --token-file=<токен>
 *          [--out=<тайлан.md>] [--plan=<төлөвлөгөө.json>] [--kod=excel|tree] [--keep-names] [--target=<…/FeatureServer/182>]
 *   Бичих:  … --write --i-know-this-is-production --confirm-deletes=<тоо>:<хэш> [--backup=<нөөц.json>]
 *   Сэргээх: node tools/cashflow-import.mjs --restore=<нөөц.json> --token-file=<токен> [--write --i-know-this-is-production]
 *
 * ⚠️ 2026-10-26: НӨӨЦ анхдагчаар `os.tmpdir()`-д (репогийн үндэс git-ignored БИШ, өгөгдөл нууц) — `--backup=`-ээр өөр зам.
 *    Нөөц нь сэтгүүл: бичихээс ӨМНӨХ бүх мөр + багц бүрийн дараа нэмэгдсэн OID-ууд. Олон алхмын бичилт дундаа
 *    унавал (`rollbackOnFailure` ЗӨВХӨН нэг багц дотор) `--restore=` нь нэмэгдсэнийг устгаж, устгагдсаныг дахин нэмж,
 *    өөрчлөгдсөнийг нөөцийн утгаар буцаана (dry-run анхдагч; бичихэд `--write --i-know-this-is-production`).
 * ⚠️ 2026-10-26: `--confirm-deletes` = устгах OID-уудын ТОО:ХЭШ (dry-run хэвлэнэ) — зөвхөн тоо таарах нь өөр мөр
 *    устгахаас хамгаалдаггүй.
 * ⚠️ exceljs нь репогийн хамаарал БИШ — `--exceljs=` эсвэл `EXCELJS_DIR` env-ээр өгнө (`createRequire`).
 * ⚠️ Токен ЗӨВХӨН POST биед (`tokenInUrl.check.mjs`); файлаас уншина, хэзээ ч хэвлэхгүй.
 *
 * МӨРИЙН ГУРВАН ТӨРӨЛ (`services/fields.CF_WORK_WHERE`-ийн ⚠️):
 *   САРЫН    — `cashflow_start IS NOT NULL` — ХӨНДӨХГҮЙ (устгах мөнгөний мөрийнх л устна);
 *   МӨНГӨНИЙ — `cashflow_start IS NULL AND cashflow_id IS NOT NULL` — Excel-ийн тохирох мөрөөр шинэчлэгдэнэ, Excel-д
 *              байхгүй талбар (захирамж, гэрээ, гүйцэтгэгч, эх үүсвэр…) ХАДГАЛАГДАНА; тохирохгүй бол сарын мөрийнхөө
 *              хамт УСТНА; Excel-д л байгаа нь `cashflow_id` = max + 1-тэй нэмэгдэнэ;
 *   БҮТЦИЙН  — `cashflow_start IS NULL AND cashflow_id IS NULL` — Excel-ийн бусад бүх мөр (дахин ажиллуулахад бүгд
 *              устаж шинээр үүснэ).
 *
 * ⚠️ МОД нь Excel-ийн ТОМЬЁОНООС (`src/lib/negtgelTree.ts` → `NEG_TREE.depth`, хэш шалгана) — outlineLevel БИШ:
 *    outline 325 мөрөнд модноос зөрдөг (жиш. 36 «Багц 6» нь 35-ын хүүхэд боловч outline ижил түвшин). `tuvshin` =
 *    модны гүн − 1 (үе шат = 0).
 *    ⚠️ 2026-10-26: E-ийн ЦЭВЭР нийлбэр томьёо (`E858 = …+E889`) эцгийг `NEG_TREE`-ээс ДАВАМГАЙЛНА (`treeFixes`).
 * ⚠️ `dd_kod` = Excel B (анхдагч `--kod=excel`) нь ДАВХАРДДАГ («3» хоёр үе шатанд, «5.2.1.1.1» багц бүрд) тул
 *    `etseg_kod`-оор модыг ганцаар нь сэргээх боломжгүй — `--kod=tree` нь модны дарааллаар өвөрмөц код үүсгэнэ.
 *    Аль нь болохыг хэрэглэгч шийднэ (тайлангийн «Шийдвэр шаардлагатай»).
 * ⚠️ ТОГТМОЛ нүдийг л хадгална (томьёотой → null). Үл хамаарал: МӨНГӨНИЙ мөрийн E томьёотой бол (блокуудын нийлбэр
 *    болох багц) тооцоолсон үр дүнг `ho_dun_geree`-д бичнэ — 33 хэрэглэгч гэрээний дүнг эндээс уншдаг.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NEG_TREE, negTreeHash } from '../src/lib/negtgelTree.ts';
import { loadPublicEnv } from './liveEnv.mjs';

/* ═══════════ Аргумент ═══════════ */
const argv = process.argv.slice(2);
const opt = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const XLSX = argv.find((a) => !a.startsWith('--'));
const WRITE = opt('write') === true;
const RESTORE = opt('restore');
const KOD = opt('kod') === 'tree' ? 'tree' : 'excel';
const KEEP_NAMES = opt('keep-names') === true;
const SHEET = 'Төсөл төлөвлөгөө биелэлт';
const FIRST = 6; // ТӨСЛИЙН НИЙТ
const LAST = 911;
const TOTAL_E6 = 2495841880529.33; // хяналтын тоо — Excel E6

if (RESTORE === true) { console.error('⛔ --restore=<нөөц.json>'); process.exit(1); }
if (!XLSX && !RESTORE) {
  console.error('⛔ Excel файлын замыг өг: node tools/cashflow-import.mjs "<xlsx>" --exceljs=… --token-file=…');
  process.exit(1);
}
const exceljsDir = opt('exceljs') || process.env.EXCELJS_DIR;
if (!RESTORE && (!exceljsDir || exceljsDir === true)) {
  console.error('⛔ exceljs-ийн байршил: --exceljs=<…/node_modules> эсвэл EXCELJS_DIR (репод суулгахгүй)');
  process.exit(1);
}
const tokenFile = opt('token-file');
if (!tokenFile || tokenFile === true) {
  console.error('⛔ Токены файл: --token-file=<зам> (токен POST биеэр л явна)');
  process.exit(1);
}
const TOKEN = readFileSync(tokenFile, 'utf8').trim();

loadPublicEnv(process.env);
const ENT = (process.env.NEXT_PUBLIC_ENT_DATA ?? '').replace(/\/+$/, '');
const TARGET = String(opt('target') || (ENT ? `${ENT}/Guitsetgel_talbe/FeatureServer/182` : '')).replace(/\/+$/, '');
if (!/^https?:\/\/\S+\/FeatureServer\/\d+$/i.test(TARGET)) {
  console.error('⛔ Давхаргын хаяг тодорхойгүй — `.env`-ийн NEXT_PUBLIC_ENT_DATA эсвэл --target=…/FeatureServer/<№>');
  process.exit(1);
}

/* ═══════════ Туслах ═══════════ */
const s = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const bn = (n) => (n == null ? '—' : `${(n / 1e9).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} тэрбум`);
const md = (v) => s(v).replace(/\|/g, '\\|');

/** `services/fields.bagtsKey` · `isPkgRange` · `pkgKeyOf`-ийн ЯГ хуулбар (tools нь TS-ийн alias-гүй) */
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const isPkgRange = (v) => {
  const t = String(v ?? '').trim();
  if (/[\r\n]/.test(t)) return true;
  if (t.includes(',')) return true;
  const m = t.match(/(\d+)\s*[-–—]\s*(\d+)\s*$/u);
  return m != null && Number(m[2]) > Number(m[1]);
};
const pkgKeyOf = (v) => (isPkgRange(v) ? '' : bagtsKey(v));

/** Тааруулах код: «БАГЦ - 19.1» → «19.1», «БАГЦ 1- 4» → «1-4», «БАГЦ-6.1, 6.2» → «6.1,6.2» */
const normCode = (v) => String(v ?? '').toUpperCase().replace(/БАГЦ/g, '').replace(/[–—]/g, '-')
  .replace(/\s+/g, '').replace(/^[-.]+/, '');
/**
 * ⚠️ МЭДЭГДСЭН НЭР ЗӨРӨЛТ — систем → Excel (үе шат 5). Хэрэглэгчтэй тохирсон (2026-10-26):
 *    «Багц 18.1 Авто зам» = Excel «Багц 18 — Хороолол доторх гол…»; «БАГЦ-6.1, 6.2 Нэмэлт ажил» = «БАГЦ-6.1, 6.2 зам сүвлэх».
 */
const ALIAS = new Map([['18.1', '18'], ['6.1,6.2НЭМЭЛТАЖИЛ', '6.1,6.2']]);

/** Нэрийн төстэй байдал — тэмдэгтийн хос (bigram) Dice, 0–1 */
const bigrams = (t) => {
  const x = ` ${String(t ?? '').toLowerCase().replace(/[^0-9a-zа-яөүё]+/g, ' ').trim()} `;
  const out = new Map();
  for (let i = 0; i < x.length - 1; i += 1) { const g = x.slice(i, i + 2); out.set(g, (out.get(g) ?? 0) + 1); }
  return out;
};
const dice = (a, b) => {
  const A = bigrams(a); const B = bigrams(b);
  let inter = 0; let na = 0; let nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [g, v] of A) inter += Math.min(v, B.get(g) ?? 0);
  return na + nb ? (2 * inter) / (na + nb) : 0;
};

/* ═══════════ ArcGIS ═══════════ */
const post = async (path, body) => {
  const res = await fetch(`${TARGET}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', token: TOKEN, ...body }),
  });
  const j = await res.json();
  /* ⚠️ ArcGIS алдаа 200-аар ирнэ — биеийг шалгана */
  if (j.error) throw new Error(`ArcGIS ${j.error.code}: ${j.error.message} ${(j.error.details ?? []).join('; ')}`);
  return j;
};
/** Бүх мөр — ⚠️ хуудаслалт `orderByFields`-тэй (үгүй бол давхардал/алдагдал) */
const readAll = async () => {
  const rows = [];
  for (let off = 0; ; ) {
    const j = await post('/query', {
      where: '1=1', outFields: '*', returnGeometry: 'false', orderByFields: 'objectid ASC',
      resultOffset: String(off), resultRecordCount: '1000',
    });
    rows.push(...j.features.map((f) => f.attributes));
    if (!j.features.length || (!j.exceededTransferLimit && j.features.length < 1000)) break;
    off += j.features.length;
  }
  return rows;
};
/**
 * ⚠️ `rollbackOnFailure` нь ЗӨВХӨН нэг багц дотор — 500-аар, багц бүрийн үр дүнг шалгана.
 * ⚠️ 2026-10-26: `onBatch(part, res)` — багц амжилттай болсны ДАРАА (сэтгүүлд нэмэгдсэн OID бичих).
 */
const apply = async (kind, list, onBatch) => {
  for (let k = 0; k < list.length; k += 500) {
    const part = list.slice(k, k + 500);
    const body = { rollbackOnFailure: 'true' };
    if (kind === 'deletes') body.deletes = part.join(',');
    else body[kind] = JSON.stringify(part.map((attributes) => ({ attributes })));
    const j = await post('/applyEdits', body);
    const res = j[`${kind.slice(0, -1)}Results`] ?? [];
    const bad = res.filter((x) => !x.success);
    if (res.length !== part.length || bad.length) {
      throw new Error(`${kind} багц ${k / 500 + 1}: ${bad.length} алдаа ${JSON.stringify(bad.slice(0, 3))}`);
    }
    onBatch?.(part, res);
    console.log(`${kind}: ${k + part.length}/${list.length}`);
  }
};

/**
 * ⚠️ 2026-10-26: fetch-ийн дараа шууд `process.exit` Windows дээр санамсаргүйгээр libuv-ийн
 *    «Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)»-оор 127 кодтой унадаг (keep-alive сокет хаагдаж байхад).
 *    Богино хүлээгээд гарна.
 */
const quit = async (code) => { await new Promise((r) => { setTimeout(r, 150); }); process.exit(code); };

/* ═══════════ 0. Сэргээх (--restore=<нөөц.json>) ═══════════ */
/**
 * ⚠️ 2026-10-26: Олон алхмын бичилт (шинэчлэх → нэмэх → устгах…) дундаа унавал хүснэгт ХОЛИМОГ төлөвт үлдэнэ.
 *    Нөөцөөс: (1) сэтгүүлд бичигдсэн НЭМЭГДСЭН мөрийг устгана; (2) нөөцөд байгаа ч одоо алга мөрийг дахин нэмнэ
 *    (OID шинэ — сарын мөр `cashflow_id`-аар холбогддог тул эвдрэхгүй); (3) засагдах талбар нь зөрсөн мөрийг
 *    нөөцийн утгаар буцаана. Засагдахгүй талбар (objectid, globalid, created_user/date, last_edited_user/date) — давхаргын метаас.
 *    Дахин нэмсэн OID-ыг сэтгүүлд (`readded`) бичдэг тул сэргээлт дундаа унавал ДАХИН ажиллуулахад давхардахгүй.
 *    Нөөцөд ч, сэтгүүлд ч байхгүй шинэ мөрийг (бусдын нэмсэн байж болно) ХӨНДӨХГҮЙ — жагсааж хэлнэ.
 */
if (RESTORE) {
  const bk = JSON.parse(readFileSync(RESTORE, 'utf8'));
  if (Array.isArray(bk)) { console.error('⛔ Хуучин хэлбэрийн нөөц (зөвхөн мөрүүд, сэтгүүлгүй) — нэмэгдсэн мөрийг ялгах боломжгүй; гараар сэргээ.'); process.exit(1); }
  if (bk.kind !== 'cashflow-import-backup' || !Array.isArray(bk.rows)) { console.error('⛔ Нөөцийн файл танигдсангүй'); process.exit(1); }
  if (bk.target !== TARGET) { console.error(`⛔ Нөөцийн давхарга (…${bk.target?.slice(-40)}) ≠ одоогийн (…${TARGET.slice(-40)}) — --target=`); process.exit(1); }
  bk.readded = bk.readded ?? {};
  const saveBk = () => writeFileSync(RESTORE, JSON.stringify(bk), 'utf8');
  const meta = await post('', {});
  const editable = meta.fields
    .filter((f) => f.editable !== false && f.type !== 'esriFieldTypeOID' && f.type !== 'esriFieldTypeGlobalID')
    .map((f) => f.name);
  const cur = await readAll();
  const curBy = new Map(cur.map((r) => [r.objectid, r]));
  const bkOids = new Set(bk.rows.map((r) => r.objectid));
  const added = new Set(bk.added ?? []);
  const readdedNew = new Set(Object.values(bk.readded));
  const same = (a, b) => (a == null && b == null) || a === b
    || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
  const pick = (r) => Object.fromEntries(editable.map((f) => [f, r[f] ?? null]));
  const toDelete = cur.filter((r) => !bkOids.has(r.objectid) && added.has(r.objectid)).map((r) => r.objectid);
  const unknown = cur.filter((r) => !bkOids.has(r.objectid) && !added.has(r.objectid) && !readdedNew.has(r.objectid));
  const toAdd = bk.rows.filter((r) => !curBy.has(r.objectid) && !curBy.has(bk.readded[r.objectid]));
  /* дахин нэмсэн мөр — шинэ OID-оор нь харьцуулна */
  const curOf = (r) => curBy.get(r.objectid) ?? curBy.get(bk.readded[r.objectid]);
  const toUpdate = bk.rows.filter((r) => curOf(r) && editable.some((f) => !same(r[f], curOf(r)[f])))
    .map((r) => ({ ...pick(r), objectid: curOf(r).objectid }));
  console.log(`СЭРГЭЭХ (${WRITE ? 'БИЧИЛТ' : 'DRY-RUN'}) — нөөц ${bk.at} · ${bk.rows.length} мөр · одоо ${cur.length}: `
    + `нэмэгдсэнийг устгах ${toDelete.length} · дахин нэмэх ${toAdd.length} · буцаах ${toUpdate.length}`);
  if (unknown.length) {
    console.log(`⚠️ Нөөц/сэтгүүлд байхгүй ${unknown.length} мөр ХӨНДӨХГҮЙ (гараар шалга): OID ${unknown.map((r) => r.objectid).join(',')}`);
  }
  if (!WRITE) await quit(0);
  if (opt('i-know-this-is-production') !== true) { console.error('⛔ Production хүснэгт — --i-know-this-is-production'); process.exit(1); }
  await apply('deletes', toDelete, (part) => { const d = new Set(part); bk.added = (bk.added ?? []).filter((o) => !d.has(o)); saveBk(); });
  let done = 0;
  await apply('adds', toAdd.map(pick), (part, res) => {
    res.forEach((x, n) => { bk.readded[toAdd[done + n].objectid] = x.objectId; });
    done += part.length;
    saveBk();
  });
  await apply('updates', toUpdate);
  console.log('✅ сэргээлт дууслаа');
  await quit(0);
}

/* ═══════════ 1. Excel ═══════════ */
const req = createRequire(`${resolve(exceljsDir)}/`);
const ExcelJS = req('exceljs');
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.getWorksheet(SHEET);
if (!ws) { console.error(`⛔ «${SHEET}» хуудас алга`); process.exit(1); }

/** Нүд → { c: тогтмол утга | undefined, f: томьёо | undefined, r: томьёоны үр дүн } */
const cellOf = (row, col) => {
  const cell = row.getCell(col);
  const v = cell.value;
  if (v == null) return { c: undefined };
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (v.formula != null || v.sharedFormula != null) return { f: cell.formula ?? v.formula ?? '', r: v.result };
    if (v.richText) return { c: v.richText.map((t) => t.text).join('') };
    if (v.error) return { c: undefined, err: v.error };
    return { c: undefined, err: JSON.stringify(v) };
  }
  return { c: v };
};
const xl = [];
for (let r = FIRST; r <= LAST; r += 1) {
  const row = ws.getRow(r);
  const o = { r, ol: row.outlineLevel || 0 };
  for (const col of 'BCDEFGHIJKLMS') o[col] = cellOf(row, col);
  xl.push(o);
}
if (xl.length !== NEG_TREE.n) { console.error(`⛔ Мөрийн тоо ${xl.length} ≠ NEG_TREE.n ${NEG_TREE.n}`); process.exit(1); }
const hash = negTreeHash(xl.map((o, i) => (i === 0 ? '0' : s(o.B.c))));
if (hash !== NEG_TREE.hash) {
  console.error('⛔ Excel-ийн Д/Д-ийн хэш `negtgelTree.ts`-тэй таарахгүй — Excel өөрчлөгдсөн, модыг дахин үүсгэ.');
  process.exit(1);
}

/* Мод — `depth` (тэмдэгт = 48 + гүн), эцэг = өмнөх хамгийн ойр (гүн − 1) */
const warns = [];
const parentIdx = [];
{
  const stack = [];
  for (let i = 0; i < xl.length; i += 1) {
    const d = NEG_TREE.depth.charCodeAt(i) - 48;
    stack.length = d;
    const p = d > 0 ? stack[d - 1] : -1;
    parentIdx.push(p ?? -1);
    stack[d] = i;
  }
}
/**
 * ⚠️ 2026-10-26: E-ийн НИЙЛБЭР томьёо эцгийг ДАВАМГАЙЛНА. `NEG_TREE` нь N («Төлөвлөгөөт хувь Гэрээ») томьёоноос —
 *    N нь мөрийг орхисон газар (N858 = $F859*N859+…+$F885*N885 — N889 АЛГА) мөр буруу эцэгт очдог: мөр 889 «Авто зам,
 *    дугуйн зам, явган зам» 5.2-ын хүүхэд болж байсан, харин Excel E858 = …+E885+E889, F889 = E889/$E$858 → 858-ын
 *    хүүхэд (`projectPlan.fixture.json`-тэй ижил). Дүрэм: мөрийн E-г ЦЭВЭР нийлбэр томьёо (зөвхөн E-лавлагаа · SUM ·
 *    `+` · `,` — жиш. E532 = E718/19 нийлбэр БИШ) лавлавал тэр мөр эцэг (хэд хэдэн бол хамгийн ойр); үгүй бол
 *    `NEG_TREE`. Дарааллын хязгаар: эцэг нь өмнөх мөрийн өвөг (эсвэл өөрөө) байх ёстой (дэд мод тасралтгүй) —
 *    эвдэх солилтыг (жиш. өөр үе шатын мөрийг лавласан) хэрэгжүүлэхгүй, анхааруулна.
 */
const treeFixes = [];
{
  const isSumF = (f) => s(f).replace(/\$/g, '').replace(/E\d+(?::E\d+)?/gi, '').replace(/SUM/gi, '')
    .replace(/[\s=+,()]/g, '') === '';
  const eParent = new Map(); // хүүхдийн idx → эцгийн idx (хамгийн ойр)
  for (let i = 0; i < xl.length; i += 1) {
    const f = xl[i].E.f;
    if (!f || !isSumF(f)) continue;
    for (const m of String(f).replace(/\$/g, '').matchAll(/E(\d+)(?::E(\d+))?/gi)) {
      const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
      for (let r = a; r <= b; r += 1) {
        const j = r - FIRST;
        if (j <= i || j >= xl.length) continue;
        if (!eParent.has(j) || eParent.get(j) < i) eParent.set(j, i);
      }
    }
  }
  /* Дараалал хүчинтэй эсэх: j бүрийн эцэг нь (j−1)-ийн өвгийн гинжинд */
  const valid = (par) => {
    const chain = [0];
    for (let j = 1; j < par.length; j += 1) {
      const at = chain.lastIndexOf(par[j]);
      if (at < 0) return false;
      chain.length = at + 1;
      chain.push(j);
    }
    return true;
  };
  for (const [j, p] of [...eParent].sort((x, y) => x[0] - y[0])) {
    if (parentIdx[j] === p) continue;
    const old = parentIdx[j];
    parentIdx[j] = p;
    if (valid(parentIdx)) treeFixes.push({ j, from: old, to: p });
    else {
      parentIdx[j] = old;
      warns.push(`мөр ${xl[j].r}: E${xl[p].r}-ийн нийлбэрт орсон ч дарааллыг эвдэх тул эцэг хэвээр (мөр ${xl[old]?.r ?? '—'})`);
    }
  }
}
const children = xl.map(() => []);
for (let i = 0; i < xl.length; i += 1) {
  const p = parentIdx[i];
  xl[i].depth = p >= 0 ? xl[p].depth + 1 : 0;
  if (p >= 0) children[p].push(i);
}
const isBlockCode = (c) => /^\s*\d+\s*\/\s*\d+\s*$/.test(s(c)) || s(c) === 'Бүгд';
/* Үе шат — 1-р гүний мөр; дугаар нь Excel-ийн дарааллаар (1 ТЭЗҮ · 2 Ажлын зураг төсөл · 3 Газар · 3 Зөвшөөрөл · 4 · 5 · 6 · 7) */
const phaseOf = (i) => { let k = i; while (k >= 0 && xl[k].depth > 1) k = parentIdx[k]; return k; };
const MONEY_PHASE = (name) => /^ТЭЗҮ$/i.test(name) || /^Ажлын зураг төсөл$/i.test(name) || /^Барилга угсралт$/i.test(name);
const S_PHASE = (name) => /^ТЭЗҮ$/i.test(name) || /^Ажлын зураг төсөл$/i.test(name) || /^Зөвшөөрөл$/i.test(name)
  || /^Сонгон шалгаруулалт$/i.test(name);
const phaseNo = (name) => (/^ТЭЗҮ$/i.test(name) ? 1 : /^Ажлын зураг төсөл$/i.test(name) ? 2 : /^Барилга угсралт$/i.test(name) ? 5 : 0);

/* ⚠️ `--kod=tree`: модны дарааллаар өвөрмөц код (үе шат 1…8, хүүхэд «эцэг.n») */
const treeKod = [];
{
  const cnt = new Map();
  for (let i = 1; i < xl.length; i += 1) {
    const p = parentIdx[i];
    const n = (cnt.get(p) ?? 0) + 1;
    cnt.set(p, n);
    treeKod[i] = p <= 0 ? String(n) : `${treeKod[p]}.${n}`;
  }
}
const kodOf = (i) => (KOD === 'tree' ? treeKod[i] : s(xl[i].B.c));

/* ⚠️ БАГАНЫН ЗУРАГЛАЛ (2026-10-26, засварласан): Excel-ийн толгойн дагуу J/K = «Гүйцэтгэгч» → guits_*,
   L/M = «ОСНАУГ/Газар чөлөөлөлт/Бодит» → gazar_* (`services/fields.TUSUL_NEGTGEL`-тэй ижил). */
const DATE_COLS = { H: 'geree_ehleh', I: 'geree_duusah', J: 'guits_ehleh', K: 'guits_duusah', L: 'gazar_ehleh', M: 'gazar_duusah' };

const items = []; // Excel мөр бүр (7…911) → бичих атрибут
for (let i = 1; i < xl.length; i += 1) {
  const o = xl[i];
  const ph = phaseOf(i);
  const phName = s(xl[ph].D.c);
  const block = o.depth > 1 && isBlockCode(o.C.c);
  let pkgC = s(o.C.c) || null;
  if (block) {
    let k = parentIdx[i];
    while (k > 0 && (isBlockCode(xl[k].C.c) || !s(xl[k].C.c))) k = parentIdx[k];
    pkgC = k > 0 ? s(xl[k].C.c) : null;
  }
  const num = (cell, col) => {
    if (cell.c === undefined) return null;
    if (typeof cell.c === 'number') return cell.c;
    warns.push(`мөр ${o.r} ${col}: тоо биш тогтмол «${s(cell.c)}» — алгасав`);
    return null;
  };
  const attrs = {
    dd_kod: kodOf(i) || null,
    etseg_kod: parentIdx[i] > 0 ? kodOf(parentIdx[i]) || null : null,
    tuvshin: o.depth - 1,
    uy_shat: phName || null,
    blok: block ? s(o.C.c) : null,
    bagts: pkgC,
    ajil_uilchilgee: s(o.D.c) || null,
    ho_dun_geree: num(o.E, 'E'),
    heseg_ezleh_huvi: num(o.F, 'F'),
    tusul_ezleh_huvi: num(o.G, 'G'),
  };
  for (const [col, f] of Object.entries(DATE_COLS)) {
    const c = o[col];
    if (c.c === undefined) attrs[f] = null;
    else if (c.c instanceof Date) attrs[f] = c.c.getTime();
    else { attrs[f] = null; warns.push(`мөр ${o.r} ${col}: огноо биш тогтмол «${s(c.c)}» — алгасав`); }
  }
  /* S — ТЭЗҮ/Зураг төсөл/Зөвшөөрөл/Сонгон үе шатын НАВЧ мөрийн тогтмол утга, 0–100 */
  const sLeaf = S_PHASE(phName) && children[i].length === 0 && typeof o.S.c === 'number';
  const item = {
    i, r: o.r, phName, phNo: phaseNo(phName), block, attrs,
    sPct: sLeaf ? o.S.c * 100 : undefined,
    eConst: typeof o.E.c === 'number' ? o.E.c : null,
    eFormula: o.E.f != null ? { f: o.E.f, r: typeof o.E.r === 'number' ? o.E.r : null } : null,
  };
  items.push(item);
}
const itemByIdx = new Map(items.map((t) => [t.i, t]));

/* Мөнгөний мөрийн НЭР ДЭВШИГЧ — үе шат 1·2·5, блок биш, E-тэй: тогтмол E, эсвэл томьёотой E + блок хүүхэдтэй багц */
for (const t of items) {
  if (!MONEY_PHASE(t.phName) || t.block) continue;
  const blockKids = children[t.i].filter((k) => itemByIdx.get(k)?.block);
  if (t.eConst != null) t.money = { cost: t.eConst, src: 'const' };
  else if (t.eFormula && blockKids.length && blockKids.length === children[t.i].length) {
    t.money = { cost: t.eFormula.r, src: 'formula' };
    const sum = blockKids.reduce((a, k) => a + (itemByIdx.get(k).eConst ?? 0), 0);
    if (t.eFormula.r == null || Math.abs(sum - t.eFormula.r) > 1) warns.push(`мөр ${t.r}: E томьёо ${fmt(t.eFormula.r)} ≠ блокуудын нийлбэр ${fmt(sum)}`);
  }
}
const cands = items.filter((t) => t.money);

/* E6-ийн хүрээ — E томьёоны лавлагаагаар (E7+E9+E528 → …) хүрэх мөрүүд */
const rowIdx = (r) => r - FIRST;
const eCovered = new Set();
{
  const visit = (i) => {
    if (eCovered.has(i)) return;
    eCovered.add(i);
    const f = xl[i].E.f;
    if (!f) return;
    for (const m of f.matchAll(/\$?E\$?(\d+)(?::\$?E\$?(\d+))?/g)) {
      const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
      for (let r = a; r <= b; r += 1) visit(rowIdx(r));
    }
  };
  visit(0);
}

/* ═══════════ 2. Систем ═══════════ */
const sys = await readAll();
const months = sys.filter((r) => r.cashflow_start != null);
const money = sys.filter((r) => r.cashflow_start == null && r.cashflow_id != null);
const structOld = sys.filter((r) => r.cashflow_start == null && r.cashflow_id == null);
/**
 * ⚠️ 2026-10-26: «ТЭЗҮ · Ажлын зураг төсөл» харагдац (`ZuragTosol`) БҮТЦИЙН мөрөнд бичдэг — навчны огноо/явц,
 *    нэмсэн дэд шатны мөр. Бичилт хуучин бүтцийн мөрийг БҮГДИЙГ устгаж Excel-ээс дахин үүсгэдэг тул тэдгээр
 *    засвар чимээгүй алга болж, OID солигдсон тул нээлттэй табын засвар «мөр олдсонгүй» болно. Тайланд тоолж,
 *    бичихэд `--drop-view-edits`-ээр ИЛ зөвшөөрүүлнэ.
 */
const viewOnlyOld = (() => {
  const xlCodes = new Set(items.map((t) => t.attrs.dd_kod).filter(Boolean));
  return structOld.filter((r) => r.dd_kod && !xlCodes.has(String(r.dd_kod).trim()));
})();
const monthsBy = new Map();
for (const m of months) {
  const a = monthsBy.get(m.cashflow_id) ?? { n: 0, sum: 0, oids: [] };
  a.n += 1; a.sum += m.cashflow_dun ?? 0; a.oids.push(m.objectid);
  monthsBy.set(m.cashflow_id, a);
}

/* ═══════════ 3. Тааруулах ═══════════ */
const sysPhases = (r) => {
  const t = s(r.ajil_tuvshin1).toUpperCase();
  if (t === 'ТЭЗҮ, ЗУРАГ ТӨСӨЛ') return [1, 2];
  if (t === 'БАРИЛГА УГСРАЛТ' || t === 'НИЙГМИЙН ДЭД БҮТЭЦ') return [5];
  return [];
};
const sysCode = (r, phs) => {
  const c = normCode(r.bagts);
  return phs.includes(5) && ALIAS.has(c) ? ALIAS.get(c) : c;
};
const match = new Map(); // oid → { t, how, score }
const ambiguous = [];
const claimed = new Map(); // item.i → oid
const costEq = (a, b) => a != null && b != null && Math.abs(a - b) < 1;
const scoreOf = (r, t) => dice(r.ajil_uilchilgee, t.attrs.ajil_uilchilgee) + (costEq(r.ho_dun_geree, t.money.cost) ? 0.3 : 0);

/* Шат 1 — код + үе шат */
const pending = [];
for (const r of money) {
  const phs = sysPhases(r);
  const pool = cands.filter((t) => phs.includes(t.phNo));
  const code = sysCode(r, phs);
  const hits = code ? pool.filter((t) => normCode(t.attrs.bagts) === code) : [];
  if (hits.length === 1) { match.set(r.objectid, { t: hits[0], how: 'код' }); continue; }
  if (hits.length > 1) {
    const sc = hits.map((t) => ({ t, v: scoreOf(r, t) })).sort((a, b) => b.v - a.v);
    if (sc[0].v - sc[1].v >= 0.15) { match.set(r.objectid, { t: sc[0].t, how: 'код+нэр' }); continue; }
    ambiguous.push({ r, why: `код «${code}» ${hits.length} Excel мөрд`, opts: sc.slice(0, 3) });
    continue;
  }
  pending.push(r);
}
/* Шат 1-ийн давхцал — нэг Excel мөрийг хэд хэдэн систем мөр кодоор авбал (жиш. «БАГЦ 1-6 БАГЦ 8-17» нэртэй ТЭЗҮ-ийн
   хоёр гэрээ — Excel-д нэг нь «…10-17») хамгийн өндөр оноотой нь үлдэж (зөрүү ≥ 0.15), бусад нь шат 2 руу (нэрээр) */
{
  const byT = new Map();
  for (const [oid, m] of match) byT.set(m.t.i, [...(byT.get(m.t.i) ?? []), oid]);
  for (const oids of byT.values()) {
    if (oids.length < 2) continue;
    const sc = oids.map((oid) => ({ oid, v: scoreOf(money.find((x) => x.objectid === oid), match.get(oids[0]).t) }))
      .sort((a, b) => b.v - a.v);
    const keep = sc[0].v - sc[1].v >= 0.15 ? sc[0].oid : null;
    for (const { oid } of sc) {
      if (oid === keep) continue;
      match.delete(oid);
      pending.push(money.find((x) => x.objectid === oid));
    }
  }
}
for (const [oid, m] of match) claimed.set(m.t.i, oid);
/* Шат 2 — кодгүй / код таарахгүй → нэрээр (нэхэмжилээгүй дэвшигчдээс) */
for (const r of pending) {
  const phs = sysPhases(r);
  if (!phs.length || !s(r.ajil_uilchilgee)) continue; // үе шатгүй (газар, бонд) эсвэл нэргүй → устгана
  const pool = cands.filter((t) => phs.includes(t.phNo) && !claimed.has(t.i));
  const sc = pool.map((t) => ({ t, v: scoreOf(r, t) })).sort((a, b) => b.v - a.v);
  if (!sc.length) continue;
  const margin = sc[0].v - (sc[1]?.v ?? 0);
  if (sc[0].v >= 0.55 && margin >= 0.15) { match.set(r.objectid, { t: sc[0].t, how: `нэр (${sc[0].v.toFixed(2)})` }); claimed.set(sc[0].t.i, r.objectid); }
  else if (sc[0].v >= 0.35) ambiguous.push({ r, why: `нэрээр тодорхойгүй (хамгийн ойр ${sc[0].v.toFixed(2)}, зөрүү ${margin.toFixed(2)})`, opts: sc.slice(0, 3) });
}
/* Нэг Excel мөрд хоёр систем мөр → хоёулаа тодорхойгүй */
{
  const byT = new Map();
  for (const [oid, m] of match) byT.set(m.t.i, [...(byT.get(m.t.i) ?? []), oid]);
  for (const oids of byT.values()) {
    if (oids.length < 2) continue;
    for (const oid of oids) {
      ambiguous.push({ r: money.find((x) => x.objectid === oid), why: `нэг Excel мөрд ${oids.length} систем мөр`, opts: [{ t: match.get(oid).t, v: 0 }] });
      match.delete(oid);
    }
  }
}
const ambOids = new Set(ambiguous.map((a) => a.r.objectid));
const matchedIdx = new Set([...match.values()].map((m) => m.t.i));
/* ⚠️ 2026-10-26: тодорхойгүй мөрийн Excel СОНГОЛТ нь «шинэ» БИШ — систем мөр хэвээр (ambSum) үлдэх тул шинэ гэж
   тоолбол нэг ажил хоёр удаа (хуучин + шинэ) «дараа»-д ордог байв. Хүн шийдтэл аль алинд нь тоолохгүй. */
const ambOptIdx = new Set(ambiguous.flatMap((a) => a.opts.map((o) => o.t.i)).filter((i) => !matchedIdx.has(i)));

/* ═══════════ 4. Ангилал ═══════════ */
const updates = [];
const keptBagts = [];
const renamed = [];
for (const r of money) {
  const m = match.get(r.objectid);
  if (!m) continue;
  const t = m.t;
  const a = { objectid: r.objectid, ...t.attrs, ho_dun_geree: t.money.cost, sar_mongo_eh: r.sar_mongo_eh ?? 'garaar' };
  /* ⚠️ 2026-10-26: системийн `bagts` ХООСОН бол хадгалахгүй — Excel-ийнх бичигдэнэ (oid 8: «» → «Багц-9.1») */
  if (s(r.bagts) && pkgKeyOf(r.bagts) !== pkgKeyOf(t.attrs.bagts)) { a.bagts = r.bagts; keptBagts.push({ r, t }); }
  if (KEEP_NAMES) a.ajil_uilchilgee = r.ajil_uilchilgee;
  else if (s(r.ajil_uilchilgee) !== s(t.attrs.ajil_uilchilgee)) renamed.push({ r, t });
  if (t.sPct !== undefined) a.guitsetgel_huvi = t.sPct;
  updates.push({ r, t, m, a });
}
const deletes = money.filter((r) => !match.has(r.objectid) && !ambOids.has(r.objectid));
const newMoney = cands.filter((t) => !matchedIdx.has(t.i) && !ambOptIdx.has(t.i) && (t.money.cost ?? 0) > 0);
const zeroUnmatched = cands.filter((t) => !matchedIdx.has(t.i) && !ambOptIdx.has(t.i) && !((t.money.cost ?? 0) > 0));
let nextId = 1 + Math.max(0, ...sys.map((r) => r.cashflow_id ?? 0));
/* Шинэ мөнгөний мөр — ангиллын (ajil_tuvshin*, bagts_tuvshin*) талбарыг Excel-ийн ИЖИЛ эцэгтэй тааруулсан мөрөөс хуулна */
const LEGACY = ['bagts_tuvshin1', 'ajil_tuvshin1', 'bagts_tuvshin2', 'ajil_tuvshin2', 'bagts_tuvshin3', 'ajil_tuvshin3'];
const adds = newMoney.map((t) => {
  const sib = updates.find((u) => parentIdx[u.t.i] === parentIdx[t.i]) ?? updates.find((u) => u.t.phNo === t.phNo);
  const legacy = Object.fromEntries(LEGACY.map((f) => [f, sib ? sib.r[f] ?? null : null]));
  const a = { ...legacy, ...t.attrs, ho_dun_geree: t.money.cost, cashflow_id: nextId, sar_mongo_eh: 'garaar' };
  if (t.sPct !== undefined) a.guitsetgel_huvi = t.sPct;
  nextId += 1;
  return { t, a, sib };
});
const moneyIdx = new Set([...matchedIdx, ...newMoney.map((t) => t.i)]);
const structure = items.filter((t) => !moneyIdx.has(t.i)).map((t) => {
  const a = { ...t.attrs, cashflow_id: null, sar_mongo_eh: null };
  if (t.sPct !== undefined) a.guitsetgel_huvi = t.sPct;
  return { t, a };
});
const delMonths = deletes.reduce((acc, r) => { const x = monthsBy.get(r.cashflow_id); return { n: acc.n + (x?.n ?? 0), sum: acc.sum + (x?.sum ?? 0) }; }, { n: 0, sum: 0 });

/* Нийт */
const sumOf = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
const before = sumOf(money, (r) => r.ho_dun_geree);
const ambSum = sumOf(ambiguous, (x) => x.r.ho_dun_geree);
const after = sumOf(updates, (u) => u.a.ho_dun_geree) + sumOf(adds, (x) => x.a.ho_dun_geree) + ambSum;
const xlMoney = sumOf(cands, (t) => t.money.cost);
const inE6 = cands.filter((t) => eCovered.has(t.i));
const outE6 = cands.filter((t) => !eCovered.has(t.i));
const dupCodes = (() => {
  const c = new Map();
  for (const t of items) if (t.attrs.dd_kod) c.set(t.attrs.dd_kod, (c.get(t.attrs.dd_kod) ?? 0) + 1);
  return [...c.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
})();
const olDiff = items.filter((t) => xl[t.i].ol !== t.attrs.tuvshin).length;
/* ⚠️ 2026-10-26: `--kod=tree` — dd_kod-ийн НАТУРАЛ эрэмбэ (хэсэг бүр тоогоор) Excel-ийн мөрийн дарааллыг ЯГ сэргээх ёстой */
const natCmp = (a, b) => {
  const A = String(a).split('.').map(Number); const B = String(b).split('.').map(Number);
  for (let k = 0; k < Math.min(A.length, B.length); k += 1) if (A[k] !== B[k]) return A[k] - B[k];
  return A.length - B.length;
};
const sortOk = KOD !== 'tree' || items.every((t, k) => k === 0 || natCmp(items[k - 1].attrs.dd_kod, t.attrs.dd_kod) < 0);
const e6Sum = sumOf(inE6, (t) => t.money.cost);
const e6Ok = Math.abs(e6Sum - TOTAL_E6) < 0.01;
/* ⚠️ 2026-10-26: устгах OID-уудын ТОО:ХЭШ — `--confirm-deletes`-д яг энийг шаардана (зөвхөн тоо хангалтгүй) */
const delMoneyOids = deletes.map((r) => r.objectid);
const delMonthOids = deletes.flatMap((r) => monthsBy.get(r.cashflow_id)?.oids ?? []);
const delStructOids = structOld.map((r) => r.objectid);
const delAll = [...delMoneyOids, ...delMonthOids, ...delStructOids].sort((a, b) => a - b);
const delToken = `${delAll.length}:${createHash('sha256').update(delAll.join(',')).digest('hex').slice(0, 12)}`;
const fixTxt = (x) => `мөр ${xl[x.j].r} «${s(xl[x.j].D.c).slice(0, 40)}» → ${kodOf(x.j)} (эцэг мөр ${xl[x.from]?.r ?? '—'} → ${xl[x.to].r}, ${kodOf(x.to) || '—'})`;

/* ═══════════ 5. Тайлан ═══════════ */
const L = [];
const P = (x = '') => L.push(x);
const xlRef = (t) => `мөр ${t.r} · ${md(t.attrs.dd_kod)}`;
P(`# Санхүүжилт ← Excel — ${WRITE ? 'БИЧИЛТ' : 'DRY-RUN'} (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`);
P();
P(`Excel: \`${md(XLSX)}\` → «${SHEET}» мөр 7–${LAST} (${items.length}). Хүснэгт: \`…${md(TARGET.slice(-40))}\` — одоо ${sys.length} мөр`
  + ` (мөнгөний ${money.length} · сарын ${months.length} · бүтцийн ${structOld.length}). Код: \`--kod=${KOD}\`${KEEP_NAMES ? ' · `--keep-names`' : ''}.`);
P();
P('## Тоо');
P();
P('| Ангилал | Тоо | Дүн |');
P('|---|---:|---:|');
P(`| Мөнгөний мөр — шинэчлэх | ${updates.length} | ${bn(sumOf(updates, (u) => u.a.ho_dun_geree))} |`);
P(`| Мөнгөний мөр — шинэ | ${adds.length} | ${bn(sumOf(adds, (x) => x.a.ho_dun_geree))} |`);
P(`| Мөнгөний мөр — устгах | ${deletes.length} | ${bn(sumOf(deletes, (r) => r.ho_dun_geree))} |`);
P(`| ↳ тэдгээрийн сарын мөр — устгах | ${delMonths.n} | ${bn(delMonths.sum)} |`);
P(`| Мөнгөний мөр — ТОДОРХОЙГҮЙ (хөндөхгүй) | ${ambiguous.length} | ${bn(ambSum)} |`);
P(`| Бүтцийн мөр — нэмэх | ${structure.length} | — |`);
P(`| Бүтцийн мөр — хуучин (бичихэд устгаж дахин үүсгэнэ) | ${structOld.length} | — |`);
P(`| ↳ Excel-д БАЙХГҮЙ (харагдацаар нэмсэн, жиш. дэд шат) — алга болно | ${viewOnlyOld.length} | — |`);
P(`| Сарын мөр — хэвээр | ${months.length - delMonths.n} | — |`);
P();
P('## Нийт төсөв');
P();
P(`- Өмнө (мөнгөний ${money.length} мөрийн \`ho_dun_geree\`): **${fmt(before)}** (${bn(before)})`);
P(`- Дараа (шинэчилсэн + шинэ${ambiguous.length ? ' + тодорхойгүй хэвээр' : ''}): **${fmt(after)}** (${bn(after)}) · зөрүү ${bn(after - before)}`);
P(`- Excel-ийн мөнгөний мөр (үе шат 1·2·5, ${cands.length}): ${fmt(xlMoney)}`);
P(`  - E6-ийн томьёонд хүрэх (${inE6.length}): **${fmt(e6Sum)}** — Excel E6 = ${fmt(TOTAL_E6)}`
  + ` → ${e6Ok ? '✅ ТААРСАН' : '❌ ЗӨРСӨН (бичихийг хориглоно)'}`);
P(`  - E6-д ОРООГҮЙ (${outE6.length}): ${fmt(sumOf(outE6, (t) => t.money.cost))} — ${outE6.length ? `${[...new Set(outE6.map((t) => {
  let k = t.i; while (parentIdx[k] > 0 && !eCovered.has(parentIdx[k])) k = parentIdx[k];
  return `${s(xl[k].B.c)} ${s(xl[k].D.c)} (мөр ${xl[k].r})`;
}))].join('; ')}` : '—'}`);
P();
P('## Мод');
P();
P(`- E-ийн нийлбэр томьёогоор эцэг солигдсон (${treeFixes.length}): ${treeFixes.map(fixTxt).join('; ') || '—'}`);
P(`- \`dd_kod\` давхардал: ${dupCodes} мөр${KOD === 'tree' ? ` · натурал эрэмбэ = Excel-ийн дараалал: ${sortOk ? '✅' : '❌'}` : ''}`);
P();
P('## Шийдвэр шаардлагатай');
P();
if (structOld.length) {
  const lost = viewOnlyOld.slice(0, 8).map((r) => `${md(r.dd_kod)} «${md(r.ajil_uilchilgee).slice(0, 30)}»`).join(', ');
  P(`0. **«ТЭЗҮ · Ажлын зураг төсөл» харагдацын засвар УСТНА.** Хуучин ${structOld.length} бүтцийн мөр устаж Excel-ээс дахин `
    + `үүснэ — харагдацаар оруулсан огноо/явц Excel-ийн утгаар солигдож, Excel-д байхгүй ${viewOnlyOld.length} мөр `
    + `(${lost || '—'}${viewOnlyOld.length > 8 ? ' …' : ''}) бүр мөсөн алга болно. Мөнгөний мөрийн \`geree_*\`/\`guitsetgel_huvi\` `
    + 'мөн Excel-ээр дарагдана. Бичихэд `--drop-view-edits` шаардлагатай.');
}
P('1. **J/K ба L/M баганын утга.** J/K «Гүйцэтгэгч» → `guits_*`, L/M «ОСНАУГ/Газар чөлөөлөлт/Бодит» → `gazar_*` (`DATE_COLS`).');
P(`2. **\`dd_kod\` давхардал.** Excel B-ийн ${dupCodes} мөр давхардсан кодтой («3» = Газар чөлөөлөлт ба Зөвшөөрөл, «5.2.1.1.1» багц бүрд г.м.)`
  + ' — `etseg_kod`-оор мод/дарааллыг сэргээх боломжгүй (мөнгөний хуучин мөр бага objectid-тай тул objectid-оор эрэмбэлэх ч болохгүй). '
  + 'Сонголт: (а) `--kod=tree` — модны өвөрмөц код (үе шат 1…8, «5.2.1.1.1» → «6.2.1.2.1» г.м.; Excel-ийн харагдах Д/Д өөр), '
  + '(б) Excel B-г хадгалж, дараалал/түлхүүрийн шинэ талбар (жиш. Excel-ийн мөрийн дугаар) нэмэх.');
P(`3. **\`tuvshin\` = томьёоны модны гүн**, outlineLevel БИШ (outline ${olDiff}/${items.length} мөрөнд модноос зөрдөг — жиш. мөр 36 «Багц 6» нь 35-ын хүүхэд).`);
P(`4. **Нэр (\`ajil_uilchilgee\`) дарагдана** — ${renamed.length} мөнгөний мөрийн системийн дэлгэрэнгүй нэр Excel-ийн товч нэрээр солигдоно `
  + '(«9-н Давхар бүхий 71 айлын орон сууц 12 блок…» → «Орон сууцны хороолол барилга угсралт» г.м.). Хадгалах бол `--keep-names`.');
P(`5. **\`bagts\` хадгалав** — багцын түлхүүр (\`pkgKeyOf\`) өөрчлөгдөх ${keptBagts.length} мөрөнд системийн утга үлдэнэ (IPC/газрын зургийн холбоос эвдрэхгүй):`);
for (const { r, t } of keptBagts) P(`   - oid ${r.objectid}: «${md(r.bagts)}» (Excel «${md(t.attrs.bagts)}»)`);
P('6. **Блокийн мөрийн `bagts`** = эцэг багцын код («Багц-1»), `blok` = «5/1» (тодорхойлолтод «bagts (C)» — блокийн мөрд C нь «5/1»).');
P('7. **Нийслэл төсөв (5.2.4, 176.06 тэрбум)** — Excel-ийн E718 = SUM(E719,E842,E858) тул E6-д ОРДОГГҮЙ; систем «E эцэг = хүүхдүүдийн нийлбэр» '
  + 'гэж бодвол 5.2 ба нийт нь Excel-ээс 176.06 тэрбумаар их гарна. Мөн E532 «Талбайн бэлтгэл ажил» = E718/19 (томьёо, мөнгөний мөр биш).');
P(`8. **Excel-ийн өртөг 0 мөр** (мөнгөний мөртэй тааралдсан) — систем дүн 0 болно: ${updates.filter((u) => !(u.a.ho_dun_geree > 0)).map((u) => `oid ${u.r.objectid} «${md(u.r.bagts)}» ${bn(u.r.ho_dun_geree)} → 0`).join('; ') || '—'}.`);
P(`9. **\`guitsetgel_huvi\` дарагдана** — ТЭЗҮ/Зураг төслийн навч мөнгөний мөрд Excel S × 100: ${updates.filter((u) => u.a.guitsetgel_huvi !== undefined && u.a.guitsetgel_huvi !== u.r.guitsetgel_huvi).map((u) => `oid ${u.r.objectid} ${u.r.guitsetgel_huvi ?? 'null'}→${fmt(u.a.guitsetgel_huvi)}`).join(', ') || '—'}.`);
P();
P('## Тодорхойгүй / тааралдаагүй (хүн шийднэ)');
P();
if (!ambiguous.length) P('- Тодорхойгүй тааралт: байхгүй.');
if (ambOptIdx.size) P(`- Тодорхойгүйн Excel сонголт (${ambOptIdx.size}) — шинэ гэж ТООЛООГҮЙ, шийдтэл бүтцийн мөр`);
for (const x of ambiguous) {
  P(`- oid ${x.r.objectid} «${md(x.r.bagts)}» ${md(x.r.ajil_uilchilgee).slice(0, 60)} (${bn(x.r.ho_dun_geree)}) — ${x.why}; сонголт: `
    + x.opts.map((o) => `${xlRef(o.t)} «${md(o.t.attrs.bagts)}» ${md(o.t.attrs.ajil_uilchilgee).slice(0, 40)} ${bn(o.t.money.cost)} (${o.v.toFixed(2)})`).join(' / '));
}
P(`- Тааруулсан нэр/алиасаар (шалгана уу): ${[...match.entries()].filter(([, m]) => m.how !== 'код').map(([oid, m]) => `oid ${oid} → ${xlRef(m.t)} [${m.how}]`).join('; ') || '—'}`);
P(`- Excel-ийн өртөг 0/хоосон, системд тааралдаагүй (мөнгөний мөр болохгүй, бүтцийн мөр): ${zeroUnmatched.map((t) => `${xlRef(t)} «${md(t.attrs.bagts)}» ${md(t.attrs.ajil_uilchilgee).slice(0, 40)}`).join('; ') || '—'}`);
if (warns.length) { P('- Анхааруулга:'); for (const w of warns) P(`  - ${md(w)}`); }
P();
P('## Мөнгөний мөрийн тааралт (бүгд)');
P();
P('| oid | Систем: bagts · нэр | Систем ho_dun_geree | → Excel | Excel: bagts · нэр | Excel өртөг | Өөрчлөлт | Арга |');
P('|---:|---|---:|---|---|---:|---:|---|');
for (const r of money) {
  const u = updates.find((x) => x.r.objectid === r.objectid);
  const amb = ambiguous.find((x) => x.r.objectid === r.objectid);
  if (u) {
    const d = (u.a.ho_dun_geree ?? 0) - (r.ho_dun_geree ?? 0);
    P(`| ${r.objectid} | ${md(r.bagts)} · ${md(r.ajil_uilchilgee).slice(0, 50)} | ${fmt(r.ho_dun_geree)} | ${xlRef(u.t)} | ${md(u.t.attrs.bagts)} · ${md(u.t.attrs.ajil_uilchilgee).slice(0, 45)} | ${fmt(u.a.ho_dun_geree)}${u.t.money.src === 'formula' ? ' ƒ' : ''} | ${Math.abs(d) < 0.01 ? '=' : fmt(d)} | ${u.m.how} |`);
  } else {
    const x = monthsBy.get(r.cashflow_id);
    P(`| ${r.objectid} | ${md(r.bagts)} · ${md(r.ajil_uilchilgee).slice(0, 50)} | ${fmt(r.ho_dun_geree)} | ${amb ? '**ТОДОРХОЙГҮЙ**' : '**УСТГАХ**'} | — | — | ${amb ? '' : fmt(-(r.ho_dun_geree ?? 0))} | ${amb ? amb.why : `сарын ${x?.n ?? 0} мөр`} |`);
  }
}
P();
P('ƒ — Excel-д томьёо (блокуудын нийлбэр); мөнгөний мөр тул тооцоолсон дүнг бичнэ.');
P();
P('## Шинэ мөнгөний мөр');
P();
if (!adds.length) P('- байхгүй');
for (const x of adds) {
  P(`- ${xlRef(x.t)} «${md(x.t.attrs.bagts)}» ${md(x.t.attrs.ajil_uilchilgee)} — ${fmt(x.a.ho_dun_geree)} · cashflow_id ${x.a.cashflow_id}`
    + ` · ангилал oid ${x.sib?.r.objectid ?? '—'}-оос (${md(x.a.ajil_tuvshin1)} / ${md(x.a.ajil_tuvshin2)})`);
}
P();
P('## Устгах мөнгөний мөр');
P();
P(`Бичихэд: \`--confirm-deletes=${delToken}\` (мөнгөний ${delMoneyOids.length} + сарын ${delMonthOids.length} + хуучин бүтцийн ${delStructOids.length} OID-ийн тоо:sha256)`);
P();
P('| oid | cashflow_id | ajil_tuvshin1 | bagts · нэр | ho_dun_geree | Сарын мөр | Сарын дүн |');
P('|---:|---:|---|---|---:|---:|---:|');
for (const r of deletes) {
  const x = monthsBy.get(r.cashflow_id);
  P(`| ${r.objectid} | ${r.cashflow_id} | ${md(r.ajil_tuvshin1)} | ${md(r.bagts)} · ${md(r.ajil_uilchilgee).slice(0, 60)} | ${fmt(r.ho_dun_geree)} | ${x?.n ?? 0} | ${fmt(x?.sum ?? 0)} |`);
}
P();
P('## Бүтцийн мөр — үе шатаар');
P();
{
  const c = new Map();
  for (const x of structure) c.set(x.t.phName, (c.get(x.t.phName) ?? 0) + 1);
  for (const [k, v] of c) P(`- ${md(k)}: ${v}`);
  P(`- блок мөр: ${structure.filter((x) => x.t.block).length} · \`guitsetgel_huvi\` (S) бичих: ${structure.filter((x) => x.a.guitsetgel_huvi !== undefined).length}`);
}
const report = L.join('\n');
const out = opt('out');
if (out && out !== true) writeFileSync(out, report, 'utf8');
const planFile = opt('plan');
if (planFile && planFile !== true) {
  writeFileSync(planFile, JSON.stringify({
    updates: updates.map((u) => u.a), adds: adds.map((x) => x.a), structure: structure.map((x) => x.a),
    deleteMoney: delMoneyOids, deleteMonths: delMonthOids, deleteStructureOld: delStructOids, confirmDeletes: delToken,
  }, null, 1), 'utf8');
}
console.log(`шинэчлэх ${updates.length} · шинэ ${adds.length} · устгах ${deletes.length} (+сарын ${delMonths.n}) · тодорхойгүй ${ambiguous.length}`
  + ` · бүтэц ${structure.length} · өмнө ${bn(before)} → дараа ${bn(after)} · E6 ${e6Ok ? 'OK' : 'ЗӨРСӨН'}`
  + ` · dd_kod давхардал ${dupCodes}${KOD === 'tree' ? ` · эрэмбэ ${sortOk ? 'OK' : 'ЗӨРСӨН'}` : ''}`);
for (const x of treeFixes) console.log(`мод (E томьёо): ${fixTxt(x)}`);
console.log(`устгах OID: --confirm-deletes=${delToken}`);
if (out && out !== true) console.log(`тайлан: ${out}`);

/* ═══════════ 6. Бичих (зөвхөн --write) ═══════════ */
if (!WRITE) await quit(0);
if (opt('i-know-this-is-production') !== true) { console.error('⛔ Production хүснэгт — --i-know-this-is-production'); process.exit(1); }
if (ambiguous.length) { console.error(`⛔ ${ambiguous.length} тодорхойгүй тааралт — эхлээд шийд (бичихгүй).`); process.exit(1); }
/* ⚠️ 2026-10-26: E6 зөрвөл (Excel өөрчлөгдсөн / мөнгөний мөрийн сонголт буруу) БИЧИХГҮЙ */
if (!e6Ok) { console.error(`⛔ E6 зөрсөн: ${fmt(e6Sum)} ≠ ${fmt(TOTAL_E6)} — бичихгүй.`); process.exit(1); }
if (KOD === 'tree' && (dupCodes || !sortOk)) { console.error(`⛔ dd_kod: давхардал ${dupCodes}${sortOk ? '' : ' · натурал эрэмбэ Excel-ийн дараалалтай зөрсөн'} — бичихгүй.`); process.exit(1); }
if (structOld.length && opt('drop-view-edits') !== true) {
  console.error(`⛔ --drop-view-edits — хуучин ${structOld.length} бүтцийн мөр (Excel-д байхгүй ${viewOnlyOld.length}) устаж, «ТЭЗҮ · Ажлын зураг төсөл»-ийн засвар алга болно (тайлангийн «Шийдвэр» 0)`);
  process.exit(1);
}
if (opt('confirm-deletes') !== delToken) {
  console.error(`⛔ --confirm-deletes=${delToken} (мөнгөний ${delMoneyOids.length} + сарын ${delMonthOids.length} + хуучин бүтцийн ${delStructOids.length} OID-ийн тоо:хэш — dry-run-ий тайлантай тулга)`);
  process.exit(1);
}
/* Нөөц-сэтгүүл — бичихээс ӨМНӨ бүх мөр; багц бүрийн дараа нэмэгдсэн OID (⚠️ 2026-10-26: репод БИШ, os.tmpdir()) */
const backupOpt = opt('backup');
const backup = resolve(backupOpt && backupOpt !== true ? backupOpt : join(tmpdir(), `cashflow-backup-${Date.now()}.json`));
const journal = { kind: 'cashflow-import-backup', target: TARGET, at: new Date().toISOString(), rows: sys, added: [], step: null };
const saveJournal = () => writeFileSync(backup, JSON.stringify(journal), 'utf8');
saveJournal();
console.log(`нөөц: ${backup}`);
const onAdds = (_part, res) => { journal.added.push(...res.map((x) => x.objectId)); saveJournal(); };
const steps = [
  ['мөнгөний мөр шинэчлэх', 'updates', updates.map((u) => u.a)],
  ['мөнгөний мөр нэмэх', 'adds', adds.map((x) => x.a)],
  ['хуучин бүтцийн мөр устгах', 'deletes', delStructOids],
  ['бүтцийн мөр нэмэх', 'adds', structure.map((x) => x.a)],
  ['сарын мөр устгах', 'deletes', delMonthOids],
  ['мөнгөний мөр устгах', 'deletes', delMoneyOids],
];
try {
  for (const [name, kind, list] of steps) {
    if (!list.length) continue;
    journal.step = name; saveJournal();
    await apply(kind, list, kind === 'adds' ? onAdds : undefined);
  }
  journal.step = 'дууссан'; saveJournal();
} catch (e) {
  saveJournal();
  console.error(`⛔ «${journal.step}» алхамд унав: ${e.message}`);
  console.error('   Хүснэгт ХОЛИМОГ төлөвт байж болно (өмнөх алхмууд бичигдсэн). Эхлээд харах (dry-run):');
  console.error(`     node tools/cashflow-import.mjs --restore="${backup}" --token-file=<токен>`);
  console.error('   Сэргээх: дээрх тушаалд --write --i-know-this-is-production нэм.');
  process.exit(1);
}
console.log('✅ дууслаа');

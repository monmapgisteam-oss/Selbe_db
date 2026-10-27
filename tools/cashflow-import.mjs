/**
 * САНХҮҮЖИЛТ ← EXCEL — `Cashflow_0909/0` (Enterprise `Guitsetgel_talbe/182`, кодын `CASHFLOW_NEW`) хүснэгтийг
 * «Төсөл төлөвлөгөө биелэлт» хуудасны (261007 V3) шатлалаар шинэчлэх хэрэгсэл (2026-10-26).
 *
 * Ажиллуулах (анхдагч нь DRY-RUN — юу ч бичихгүй):
 *     node tools/cashflow-import.mjs "<xlsx>" --exceljs=<exceljs агуулсан node_modules> --token-file=<токен>
 *          [--out=<тайлан.md>] [--plan=<төлөвлөгөө.json>] [--kod=excel|tree] [--keep-names] [--excel-bagts]
 *          [--target=<…/FeatureServer/182>]
 *   Бичих:  … --write --i-know-this-is-production --confirm-deletes=<тоо>:<хэш> --backup=<нөөц.json>
 *   Шалгах (бичилтийн дараа, юу ч бичихгүй): … --verify [--out=<тайлан.md>]
 *   Сэргээх: node tools/cashflow-import.mjs --restore=<нөөц.json> --token-file=<токен> [--write --i-know-this-is-production]
 *
 * ⚠️⚠️ 2026-10-27: БҮРЭН ДАХИН ҮҮСГЭЛТ (хэрэглэгч: «182 нь Excel-тэй мөр мөрөөрөө ЯГ адилхан», `--kod=excel`).
 *    Excel-ийн Д/Д (B) ДАВХАРДДАГ (35 код 145 мөрд: «3» хоёр үе шатанд, «5.2.3» дөрвөн мөрд, «2.3.3.1» таван ах
 *    дүүст) тул мод/дарааллыг `dd_kod`+`etseg_kod`-оор ганцаар нь сэргээх боломжгүй (жиш. мөр 886 «5.2.3.1»-ийн эцэг нь
 *    гурван «5.2.3»-ын аль нь вэ). Тиймээс ХҮСНЭГТИЙН objectid-ИЙН ДАРААЛАЛ = EXCEL-ИЙН МӨРИЙН ДАРААЛАЛ байхаар бичнэ:
 *    хуучин БҮХ мөр (мөнгөний · сарын · бүтцийн) устаж, Excel-ийн 905 мөр Excel-ийн дарааллаар, дараа нь сарын мөрүүд
 *    шинээр нэмэгдэнэ (`projectPlan.orderPlanRows` давхардсан кодтой үед objectid-оор эрэмбэлнэ).
 *      · МӨНГӨНИЙ мөр Excel-д тааралдсан бол хуучин мөрийн Excel-д байхгүй БҮХ талбар (захирамж, гэрээ, гүйцэтгэгч,
 *        эх үүсвэр, ангилал `bagts_tuvshin*`, `cashflow_id` …) ХУУЛАГДАНА — objectid л солигдоно (сарын мөр, IPC,
 *        дашбоард `cashflow_id`/багцын түлхүүрээр холбогддог; хүснэгт хавсралт, холбоосгүй).
 *      · Бичих дараалал: Excel мөр нэмэх → сарын мөр нэмэх → хуучин бүх мөр устгах (нэмэлт унавал хуучин бүтэн
 *        үлдэнэ; `--restore=` нэмэгдсэнийг устгана).
 *    САРЫН ТӨЛӨВЛӨГӨӨ — «Төсөл төлөвлөгөө биелэлт сараар» хуудасны хуримтлалаас (`cashflowMonthPlan.mjs`-ийн дүрэм):
 *    Excel хамарсан гэрээний 2026-08-аас өмнөх сар УСТНА (эхний сарт нийлнэ), хоосон нүд → мөргүй.
 *    Бичсний ДАРАА хүснэгтийг дахин уншиж Excel-тэй мөр мөрөөр тулгана (`--verify`-тэй ижил).
 * ⚠️ 2026-10-26: НӨӨЦ — `--backup=` ЗААВАЛ (2026-10-27; репогийн гадна, жиш. scratchpad — өгөгдөл нууц).
 *    Нөөц нь сэтгүүл: бичихээс ӨМНӨХ бүх мөр + багц бүрийн дараа нэмэгдсэн OID-ууд. Олон алхмын бичилт дундаа
 *    унавал (`rollbackOnFailure` ЗӨВХӨН нэг багц дотор) `--restore=` нь нэмэгдсэнийг устгаж, устгагдсаныг дахин нэмж,
 *    өөрчлөгдсөнийг нөөцийн утгаар буцаана (dry-run анхдагч; бичихэд `--write --i-know-this-is-production`).
 * ⚠️ 2026-10-26: `--confirm-deletes` = устгах OID-уудын ТОО:ХЭШ (dry-run хэвлэнэ) — зөвхөн тоо таарах нь өөр мөр
 *    устгахаас хамгаалдаггүй.
 * ⚠️ exceljs нь репогийн хамаарал БИШ — `--exceljs=` эсвэл `EXCELJS_DIR` env-ээр өгнө (`createRequire`).
 * ⚠️ Токен ЗӨВХӨН POST биед (`tokenInUrl.check.mjs`); файлаас уншина, хэзээ ч хэвлэхгүй.
 *
 * МӨРИЙН ГУРВАН ТӨРӨЛ (`services/fields.CF_WORK_WHERE`-ийн ⚠️):
 *   САРЫН    — `cashflow_start IS NOT NULL` — Excel-ийн «сараар» хуудаснаас мөнгөний мөр бүрд дахин үүснэ;
 *   МӨНГӨНИЙ — `cashflow_start IS NULL AND cashflow_id IS NOT NULL` — Excel-ийн тохирох мөрийн утгатай, Excel-д
 *              байхгүй талбар (захирамж, гэрээ, гүйцэтгэгч, эх үүсвэр…) хуучнаасаа ХУУЛАГДАНА; тохирохгүй бол сарын
 *              мөрийнхөө хамт УСТНА; Excel-д л байгаа нь `cashflow_id` = max + 1-тэй нэмэгдэнэ; явц (`guitsetgel_huvi`)
 *              = Excel S × 100 (томьёотой ч үр дүнгээр — хэрэглэгч «Excel-ийн S давамгайлна»);
 *   БҮТЦИЙН  — `cashflow_start IS NULL AND cashflow_id IS NULL` — Excel-ийн бусад бүх мөр.
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
import { headerMismatches, monthKeys, monthPlanOf, monthRowAttrs, ymOfStart } from './cashflowMonthPlan.mjs';
import { resolve } from 'node:path';
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
/* ⚠️ 2026-10-27: багцын түлхүүр (`pkgKeyOf`) өөрчлөгдөх мөнгөний мөрд системийн `bagts`-ыг хадгалдаг (IPC/газрын
   зургийн холбоос) — `--excel-bagts` бол Excel-ийнхийг бичнэ (тайлангийн «Шийдвэр») */
const EXCEL_BAGTS = opt('excel-bagts') === true;
const VERIFY = opt('verify') === true;
const SHEET = 'Төсөл төлөвлөгөө биелэлт';
/* «Сараар» хуудас — мөр бүр үндсэн хуудасны ИЖИЛ мөр (B · D-ээр шалгана); N…AP = 2026-08 … 2028-12 (БАЙРЛАЛААР) */
const MONTH_SHEET = 'Төсөл төлөвлөгөө биелэлт сараар';
const MONTH_FIRST = '2026-08';
const MONTH_COL0 = 14; // N
const MONTH_N = 29;
/* ⚠️ Y5 «2027 он 12-р сар» — байрлалаараа 2027-07 (хэрэглэгч баталсан, толгойн алдаа) */
const MONTH_HDR_OK = new Set(['Y']);
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

/* «Сараар» хуудас — хуримтлал (0–1) мөр бүрээр; ⚠️ мөрийн тэгшитгэл ба баганын толгойг шалгаж, зөрвөл ЗОГСОНО */
const wsM = wb.getWorksheet(MONTH_SHEET);
if (!wsM) { console.error(`⛔ «${MONTH_SHEET}» хуудас алга`); process.exit(1); }
const mKeys = monthKeys(MONTH_FIRST, MONTH_N);
const mCols = mKeys.map((_, k) => wsM.getColumn(MONTH_COL0 + k).letter);
{
  const hdrs = mCols.map((c) => s(cellOf(wsM.getRow(5), c).c));
  const bad = headerMismatches(hdrs, mKeys, mCols, MONTH_HDR_OK);
  if (bad.length) {
    console.error(`⛔ «${MONTH_SHEET}» толгой байрлалаас зөрсөн: ${bad.map((b) => `${b.col}5 «${b.header}» ≠ ${b.expected}`).join('; ')}`);
    process.exit(1);
  }
  const misaligned = xl.filter((o) => {
    const row = wsM.getRow(o.r);
    return s(cellOf(row, 'B').c ?? cellOf(row, 'B').r) !== s(o.B.c ?? o.B.r) || s(cellOf(row, 'D').c ?? cellOf(row, 'D').r) !== s(o.D.c ?? o.D.r);
  });
  if (misaligned.length) {
    console.error(`⛔ «${MONTH_SHEET}»-ийн мөр үндсэн хуудастай таарахгүй (B/D): мөр ${misaligned.slice(0, 10).map((o) => o.r).join(', ')}`);
    process.exit(1);
  }
}
let monthErrCells = 0;
for (const o of xl) {
  const row = wsM.getRow(o.r);
  o.cum = mCols.map((c) => {
    const x = cellOf(row, c);
    if (x.err) monthErrCells += 1;
    if (typeof x.c === 'number') return x.c;
    if (x.f !== undefined && typeof x.r === 'number') return x.r;
    if (x.f !== undefined && x.r != null) monthErrCells += 1; // томьёоны алдаа (#REF! г.м.) — хоосон гэж үзнэ
    return null;
  });
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
  /* ⚠️ 2026-10-27: МӨНГӨНИЙ мөрийн явц — S-ийн тогтмол ЭСВЭЛ томьёоны үр дүн (хэрэглэгч «Excel-ийн S давамгайлна»);
     хоосон → null. ×100 хөвөгч цэгийг 1e-9 хүртэл (0.2823 × 100 = 28.229999…) */
  const sNum = typeof o.S.c === 'number' ? o.S.c : (o.S.f !== undefined && typeof o.S.r === 'number' ? o.S.r : null);
  const item = {
    i, r: o.r, phName, phNo: phaseNo(phName), block, attrs,
    sPct: sLeaf ? Math.round(o.S.c * 1e11) / 1e9 : undefined,
    sMoney: sNum == null ? null : Math.round(sNum * 1e11) / 1e9,
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
/* Засагдах талбар (давхаргын метаас) — хуучин мөнгөний мөрийн Excel-д байхгүй утгыг шинэ мөрд хуулахад */
const layerMeta = await post('', {});
const EDITABLE = layerMeta.fields
  .filter((f) => f.editable !== false && f.type !== 'esriFieldTypeOID' && f.type !== 'esriFieldTypeGlobalID')
  .map((f) => f.name);
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

/* ═══════════ 4. Ангилал → Excel-ийн дарааллаар бичих мөрүүд ═══════════ */
/** Сарын мөрийн талбар — мөнгөний мөрд хуулахгүй */
const MONTH_ONLY = new Set(['cashflow_start', 'cashflow_end', 'cashflow_huwi', 'cashflow_dun']);
/** Хуучин мөнгөний мөрийн засагдах бүх талбар (Excel-ийнх дараа нь дарна) */
const carry = (r) => Object.fromEntries(EDITABLE.filter((f) => !MONTH_ONLY.has(f)).map((f) => [f, r[f] ?? null]));
const updates = [];
const keptBagts = [];
const renamed = [];
for (const r of money) {
  const m = match.get(r.objectid);
  if (!m) continue;
  const t = m.t;
  const a = {
    ...carry(r), ...t.attrs, ho_dun_geree: t.money.cost, cashflow_id: r.cashflow_id,
    /* ⚠️ Excel-ийн сарын төлөвлөгөө ЗӨВХӨН 'garaar'-д харагдана ('huvaari' бол Хуваариас тооцоолно — `monthlyMoney`) */
    sar_mongo_eh: 'garaar',
    guitsetgel_huvi: t.sMoney,
  };
  /* ⚠️ 2026-10-26: системийн `bagts` ХООСОН бол хадгалахгүй — Excel-ийнх бичигдэнэ (oid 8: «» → «Багц-9.1») */
  if (!EXCEL_BAGTS && s(r.bagts) && pkgKeyOf(r.bagts) !== pkgKeyOf(t.attrs.bagts)) { a.bagts = r.bagts; keptBagts.push({ r, t }); }
  if (KEEP_NAMES) a.ajil_uilchilgee = r.ajil_uilchilgee;
  else if (s(r.ajil_uilchilgee) !== s(t.attrs.ajil_uilchilgee)) renamed.push({ r, t });
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
  const a = { ...legacy, ...t.attrs, ho_dun_geree: t.money.cost, cashflow_id: nextId, sar_mongo_eh: 'garaar', guitsetgel_huvi: t.sMoney };
  nextId += 1;
  return { t, a, sib };
});
const moneyIdx = new Set([...matchedIdx, ...newMoney.map((t) => t.i)]);
const structure = items.filter((t) => !moneyIdx.has(t.i)).map((t) => ({
  t, a: { ...t.attrs, cashflow_id: null, sar_mongo_eh: null, guitsetgel_huvi: t.sPct ?? null },
}));
/* Excel-ийн 905 мөр — ⚠️ ДАРААЛАЛ = Excel-ийн мөрийн дараалал (objectid нь энэ дарааллаар өснө; толгойн ⚠️⚠️) */
const planByIdx = new Map([
  ...updates.map((u) => [u.t.i, { kind: 'money', a: u.a, old: u.r }]),
  ...adds.map((x) => [x.t.i, { kind: 'new', a: x.a }]),
  ...structure.map((x) => [x.t.i, { kind: 'struct', a: x.a }]),
]);
const excelAdds = items.map((t) => planByIdx.get(t.i)?.a).filter(Boolean);

/* Сарын төлөвлөгөө — мөнгөний мөр бүрд «сараар» хуудаснаас */
const monthAdds = [];
const monthNotes = { clamps: [], partial: [], none: [] };
for (const t of items) {
  const p = planByIdx.get(t.i);
  if (!p || p.kind === 'struct') continue;
  const plan = monthPlanOf(xl[t.i].cum, mKeys);
  const lab = `мөр ${t.r} «${md(t.attrs.bagts)}» ${md(t.attrs.ajil_uilchilgee).slice(0, 40)}`;
  if (!plan.months.length) { monthNotes.none.push(lab); continue; }
  for (const c of plan.clamps) monthNotes.clamps.push(`${lab}: ${c.ym} хуримтлал ${fmt(c.prev)} → ${fmt(c.cum)} (сарын хувь 0)`);
  if (plan.final != null && Math.abs(plan.final - 100) > 1e-6) monthNotes.partial.push(`${lab}: эцсийн хуримтлал ${fmt(plan.final)}%`);
  for (const m of plan.months) monthAdds.push(monthRowAttrs(p.a.cashflow_id, m.ym, m.huwi, p.a.ho_dun_geree));
}

/* Сарын мөрийн УТГЫН өөрчлөлт (түлхүүр = cashflow_id|сар) — механикаар бүгд дахин үүсэх ч хэрэглэгчид утгын зөрүүг хэлнэ */
const monthDiff = (() => {
  const key = (id, ym) => `${id}|${ym}`;
  const oldBy = new Map();
  for (const m of months) {
    const k = key(m.cashflow_id, ymOfStart(m.cashflow_start));
    oldBy.set(k, [...(oldBy.get(k) ?? []), m]);
  }
  const newBy = new Map(monthAdds.map((m) => [key(m.cashflow_id, ymOfStart(m.cashflow_start)), m]));
  const eq = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)));
  let same = 0; let changed = 0; let added = 0; let removed = 0; let dup = 0;
  for (const [k, n] of newBy) {
    const o = oldBy.get(k);
    if (!o) { added += 1; continue; }
    if (o.length > 1) dup += o.length - 1;
    if (eq(o[0].cashflow_huwi, n.cashflow_huwi) && eq(o[0].cashflow_dun, n.cashflow_dun)) same += 1; else changed += 1;
  }
  for (const [k, o] of oldBy) if (!newBy.has(k)) removed += o.length;
  const before08 = months.filter((m) => ymOfStart(m.cashflow_start) < MONTH_FIRST).length;
  return { same, changed, added, removed, dup, before08 };
})();

/* Нийт */
const sumOf = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
const before = sumOf(money, (r) => r.ho_dun_geree);
const ambSum = sumOf(ambiguous, (x) => x.r.ho_dun_geree);
const after = sumOf(updates, (u) => u.a.ho_dun_geree) + sumOf(adds, (x) => x.a.ho_dun_geree) + ambSum;
/** Дашбоардын «Нийт төсөв» (`gdash.cfTotal`) — `bagts_tuvshin1` ∉ {5 Нийгмийн, 6 Газар, 7 Бонд} (`FIN_XL_TOTAL_SKIP`) */
const TOTAL_SKIP = new Set(['5', '6', '7']);
const inTot = (a) => !TOTAL_SKIP.has(s(a.bagts_tuvshin1));
const cfTotBefore = sumOf(money.filter(inTot), (r) => r.ho_dun_geree);
const plannedMoney = [...updates.map((u) => u.a), ...adds.map((x) => x.a)];
const cfTotAfter = sumOf(plannedMoney.filter(inTot), (a) => a.ho_dun_geree);
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
const cfTotOk = Math.abs(cfTotAfter - TOTAL_E6) < 0.01;
/* ⚠️ 2026-10-27: БҮРЭН дахин үүсгэлт — ХУУЧИН БҮХ мөр устна. `--confirm-deletes` = тэдгээрийн ТОО:ХЭШ (хэн нэг нь
   dry-run-ий дараа мөр нэмж/устгавал хэш өөрчлөгдөж бичихгүй) */
const delAll = sys.map((r) => r.objectid).sort((a, b) => a - b);
const delToken = `${delAll.length}:${createHash('sha256').update(delAll.join(',')).digest('hex').slice(0, 12)}`;
const delMonthsOfDeleted = deletes.reduce((acc, r) => { const x = monthsBy.get(r.cashflow_id); return { n: acc.n + (x?.n ?? 0), sum: acc.sum + (x?.sum ?? 0) }; }, { n: 0, sum: 0 });
const fixTxt = (x) => `мөр ${xl[x.j].r} «${s(xl[x.j].D.c).slice(0, 40)}» → ${kodOf(x.j)} (эцэг мөр ${xl[x.from]?.r ?? '—'} → ${xl[x.to].r}, ${kodOf(x.to) || '—'})`;

/** Төслийн S-муруй (хуримтлал, «Нийт төсөв»-ийн хүрээ) — сарын мөрөөс (`gdash.cashflowCurve`-ийн дүрэм: Σ дүн ÷ cfTotal) */
const curveOf = (rows, moneyRows) => {
  const ids = new Set(moneyRows.filter(inTot).map((a) => a.cashflow_id));
  const tot = sumOf(moneyRows.filter(inTot), (a) => a.ho_dun_geree);
  const per = new Map();
  for (const m of rows) {
    if (!ids.has(m.cashflow_id) || m.cashflow_dun == null) continue;
    const k = ymOfStart(m.cashflow_start);
    per.set(k, (per.get(k) ?? 0) + m.cashflow_dun);
  }
  let cum = 0;
  const out = new Map();
  for (const k of [...per.keys()].sort()) { cum += per.get(k); out.set(k, cum); }
  return { out, tot };
};

/* ═══════════ 5. Тулгалт: хүснэгт ↔ Excel (бичилтийн ДАРАА · `--verify` · dry-run-д одоогийн байдал) ═══════════ */
const VERIFY_FIELDS = [
  'dd_kod', 'etseg_kod', 'tuvshin', 'uy_shat', 'blok', 'bagts', 'ajil_uilchilgee', 'ho_dun_geree',
  'heseg_ezleh_huvi', 'tusul_ezleh_huvi', 'geree_ehleh', 'geree_duusah', 'guits_ehleh', 'guits_duusah',
  'gazar_ehleh', 'gazar_duusah', 'guitsetgel_huvi', 'sar_mongo_eh',
];
/** Excel мөр бүрийн хүлээгдэх утга — `moneyIdx` (тааралдсан + шинэ мөнгөний мөр) */
const expectedRows = items.map((t) => {
  const isMoney = moneyIdx.has(t.i);
  return {
    t, isMoney,
    a: {
      ...t.attrs,
      ho_dun_geree: isMoney ? t.money.cost : t.attrs.ho_dun_geree,
      guitsetgel_huvi: isMoney ? t.sMoney : t.sPct ?? null,
      sar_mongo_eh: isMoney ? 'garaar' : null,
    },
  };
});
const keptIdx = new Set(keptBagts.map((x) => x.t.i));
function verifyTable(rows) {
  const same = (a, b) => (a == null || a === '' ? b == null || b === '' : b != null && (typeof a === 'number'
    ? Math.abs(a - Number(b)) <= 1e-6 * Math.max(1, Math.abs(a)) : s(a) === s(b)));
  const diffs = [];
  const known = [];
  const xlRows = rows.filter((r) => r.cashflow_start == null).sort((a, b) => a.objectid - b.objectid);
  const monthRows = rows.filter((r) => r.cashflow_start != null);
  if (xlRows.length !== expectedRows.length) diffs.push(`Excel-ийн мөрийн тоо: хүснэгтэд ${xlRows.length} ≠ Excel ${expectedRows.length}`);
  const moneyIds = new Map();
  const n = Math.min(xlRows.length, expectedRows.length);
  for (let k = 0; k < n; k += 1) {
    const r = xlRows[k];
    const e = expectedRows[k];
    const at = `мөр ${e.t.r} (oid ${r.objectid})`;
    for (const f of VERIFY_FIELDS) {
      if (same(e.a[f] ?? null, r[f] ?? null)) continue;
      const txt = `${at} ${f}: хүснэгт «${md(r[f] ?? '∅')}» ≠ Excel «${md(e.a[f] ?? '∅')}»`;
      if (f === 'bagts' && keptIdx.has(e.t.i)) known.push(`${txt} — багцын түлхүүр хадгалсан (\`--excel-bagts\`-гүй)`);
      else diffs.push(txt);
    }
    if (e.isMoney !== (r.cashflow_id != null)) diffs.push(`${at}: ${e.isMoney ? 'мөнгөний мөр байх ёстой (cashflow_id алга)' : 'бүтцийн мөр байх ёстой (cashflow_id байна)'}`);
    if (r.cashflow_id != null) {
      if (moneyIds.has(r.cashflow_id)) diffs.push(`${at}: cashflow_id ${r.cashflow_id} давхардсан`);
      moneyIds.set(r.cashflow_id, { e, r });
    }
  }
  for (const r of xlRows.slice(n)) diffs.push(`илүү мөр oid ${r.objectid} «${md(r.dd_kod ?? '')}» ${md(r.ajil_uilchilgee ?? '').slice(0, 40)}`);
  /* Сарын мөр */
  const byId = new Map();
  for (const m of monthRows) byId.set(m.cashflow_id, [...(byId.get(m.cashflow_id) ?? []), m]);
  let monthOk = 0;
  for (const [id, { e, r }] of moneyIds) {
    const want = new Map(monthPlanOf(xl[e.t.i].cum, mKeys).months
      .map((m) => [m.ym, monthRowAttrs(id, m.ym, m.huwi, e.isMoney ? e.a.ho_dun_geree : r.ho_dun_geree)]));
    const got = new Map();
    for (const m of byId.get(id) ?? []) {
      const ym = ymOfStart(m.cashflow_start);
      if (got.has(ym)) diffs.push(`мөр ${e.t.r} (cashflow_id ${id}) ${ym}: сарын мөр давхардсан (oid ${m.objectid})`);
      else got.set(ym, m);
    }
    for (const [ym, w] of want) {
      const g = got.get(ym);
      if (!g) { diffs.push(`мөр ${e.t.r} (cashflow_id ${id}) ${ym}: сарын мөр алга (Excel ${fmt(w.cashflow_huwi)}%)`); continue; }
      const bad = ['cashflow_huwi', 'cashflow_dun', 'cashflow_end'].filter((f) => !same(w[f], g[f]));
      if (bad.length) diffs.push(`мөр ${e.t.r} (cashflow_id ${id}) ${ym}: ${bad.map((f) => `${f} ${fmt(g[f])} ≠ ${fmt(w[f])}`).join(', ')}`);
      else monthOk += 1;
    }
    for (const [ym, g] of got) if (!want.has(ym)) diffs.push(`мөр ${e.t.r} (cashflow_id ${id}) ${ym}: Excel-д байхгүй сарын мөр (oid ${g.objectid}, ${fmt(g.cashflow_huwi)}%)`);
  }
  for (const [id, ms] of byId) if (!moneyIds.has(id)) diffs.push(`эзэнгүй сарын мөр: cashflow_id ${id} (${ms.length} мөр)`);
  /* Нийт — дашбоардын хуваагч = E6 */
  const moneyNow = xlRows.filter((r) => r.cashflow_id != null);
  const tot = sumOf(moneyNow.filter(inTot), (r) => r.ho_dun_geree);
  if (Math.abs(tot - TOTAL_E6) >= 0.01) diffs.push(`«Нийт төсөв» (bagts_tuvshin1 ∉ 5·6·7): ${fmt(tot)} ≠ Excel E6 ${fmt(TOTAL_E6)}`);
  return { diffs, known, monthOk, tot, nRows: rows.length };
}

/* ═══════════ 6. Тайлан ═══════════ */
const L = [];
const P = (x = '') => L.push(x);
const xlRef = (t) => `мөр ${t.r} · ${md(t.attrs.dd_kod)}`;
const now = verifyTable(sys);
/* Бичилтийн ҮР ДҮНГ урьдчилан тулгана — төлөвлөсөн мөрүүдийг (Excel-ийн дарааллаар өсөх хуурамч objectid) хүснэгт гэж үзээд */
const sim = verifyTable([
  ...excelAdds.map((a, k) => ({ objectid: 1e7 + k, cashflow_start: null, ...a })),
  ...monthAdds.map((a, k) => ({ objectid: 2e7 + k, ...a })),
]);
const cBefore = curveOf(months, money);
const cAfter = curveOf(monthAdds, plannedMoney);
P(`# Санхүүжилт ← Excel — ${VERIFY ? 'ШАЛГАЛТ' : WRITE ? 'БИЧИЛТ' : 'DRY-RUN'} (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`);
P();
P(`Excel: \`${md(XLSX)}\` → «${SHEET}» мөр 7–${LAST} (${items.length}) + «${MONTH_SHEET}» ${mCols[0]}…${mCols[mCols.length - 1]} `
  + `(${mKeys[0]}…${mKeys[mKeys.length - 1]}, байрлалаар; Y5-ын толгойн алдааг зөвшөөрсөн). Хүснэгт: \`…${md(TARGET.slice(-40))}\` — одоо ${sys.length} мөр`
  + ` (мөнгөний ${money.length} · сарын ${months.length} · бүтцийн ${structOld.length}). Код: \`--kod=${KOD}\`${KEEP_NAMES ? ' · `--keep-names`' : ''}${EXCEL_BAGTS ? ' · `--excel-bagts`' : ''}.`);
P();
P('## Тоо');
P();
P('Бичилт нь БҮРЭН дахин үүсгэлт (толгойн ⚠️⚠️): хуучин бүх мөр устаж, Excel-ийн мөрүүд Excel-ийн дарааллаар шинээр нэмэгдэнэ. '
  + 'Доорх «утгаар» багана нь хэрэглэгчид харагдах өөрчлөлт (objectid-оос бусад).');
P();
P('| Ангилал | Одоо | Дараа | Утгаар | Дүн |');
P('|---|---:|---:|---|---:|');
P(`| Мөнгөний мөр | ${money.length} | ${updates.length + adds.length + ambiguous.length} | тааралдсан (шинэчлэх) ${updates.length} · шинэ ${adds.length} · устах ${deletes.length} · тодорхойгүй ${ambiguous.length} | ${bn(before)} → ${bn(after)} |`);
P(`| Сарын мөр | ${months.length} | ${monthAdds.length} | ижил ${monthDiff.same} · өөрчлөгдөх ${monthDiff.changed} · шинэ ${monthDiff.added} · устах ${monthDiff.removed}${monthDiff.dup ? ` (давхардал ${monthDiff.dup})` : ''} | ${bn(sumOf(months, (m) => m.cashflow_dun))} → ${bn(sumOf(monthAdds, (m) => m.cashflow_dun))} |`);
P(`| ↳ устах мөнгөний мөрийн сарын мөр | ${delMonthsOfDeleted.n} | 0 | | ${bn(delMonthsOfDeleted.sum)} |`);
P(`| ↳ ${MONTH_FIRST}-аас өмнөх сарын мөр (Excel-д багана алга) | ${monthDiff.before08} | 0 | | — |`);
P(`| Бүтцийн мөр | ${structOld.length} | ${structure.length} | ${structOld.length ? `хуучин ${structOld.length} (Excel-д байхгүй ${viewOnlyOld.length}) устна` : 'шинэ'} | — |`);
P(`| **Нийт мөр** | ${sys.length} | ${excelAdds.length + monthAdds.length} | нэмэх ${excelAdds.length} + ${monthAdds.length} · устгах ${delAll.length} | |`);
P();
P('## Нийт төсөв');
P();
P(`- Мөнгөний бүх мөрийн \`ho_dun_geree\`: ${fmt(before)} → **${fmt(after)}** (зөрүү ${bn(after - before)})`);
P(`- Дашбоардын «Нийт төсөв» / S-муруйн хуваагч (\`bagts_tuvshin1\` ∉ 5·6·7, \`gdash.cfTotal\`): ${fmt(cfTotBefore)} → **${fmt(cfTotAfter)}** `
  + `— Excel E6 = ${fmt(TOTAL_E6)} → ${cfTotOk ? '✅ ТААРСАН' : '❌ ЗӨРСӨН'}`);
P(`- Excel-ийн мөнгөний мөр (үе шат 1·2·5, ${cands.length}): ${fmt(xlMoney)}; E6-ийн томьёонд хүрэх (${inE6.length}): **${fmt(e6Sum)}** `
  + `→ ${e6Ok ? '✅' : '❌ ЗӨРСӨН (бичихийг хориглоно)'}; E6-д ОРООГҮЙ (${outE6.length}): ${fmt(sumOf(outE6, (t) => t.money.cost))} — `
  + `${outE6.length ? [...new Set(outE6.map((t) => {
    let k = t.i; while (parentIdx[k] > 0 && !eCovered.has(parentIdx[k])) k = parentIdx[k];
    return `${s(xl[k].B.c)} ${s(xl[k].D.c)} (мөр ${xl[k].r})`;
  }))].join('; ') : '—'} (мөр нь харагдана, нийлбэрт орохгүй — \`bagts_tuvshin1\` = 5, төлөвлөгөөний мод \`outside\`)`);
P();
P('## Төслийн S-муруй (сарын мөрөөс, «Нийт төсөв»-ийн хүрээ)');
P();
P('| Сар | Одоо ₮ тэрбум | Одоо % | Дараа ₮ тэрбум | Дараа % | Excel Σ E×хуримтлал ÷ E6 % |');
P('|---|---:|---:|---:|---:|---:|');
{
  const xlPct = (ym) => {
    const k = mKeys.indexOf(ym);
    let top = 0;
    for (const t of inE6) {
      const cum = xl[t.i].cum.slice(0, k + 1).filter((v) => typeof v === 'number');
      top += (t.money.cost ?? 0) * (cum.length ? Math.max(0, ...cum) : 0);
    }
    return (top / TOTAL_E6) * 100;
  };
  const at = (c, ym) => { let v = null; for (const [k, x] of c.out) if (k <= ym) v = x; return v; };
  for (const ym of mKeys) {
    const a = at(cBefore, ym); const b = at(cAfter, ym);
    P(`| ${ym} | ${a == null ? '—' : (a / 1e9).toFixed(1)} | ${a == null ? '—' : ((a / cBefore.tot) * 100).toFixed(1)} | `
      + `${b == null ? '—' : (b / 1e9).toFixed(1)} | ${b == null ? '—' : ((b / cAfter.tot) * 100).toFixed(2)} | ${xlPct(ym).toFixed(2)} |`);
  }
}
P();
P('«Дараа %» ба Excel-ийн багана ЯГ тэнцүү байх ёстой (буурсан хуримтлалыг тэгшилсэн мөр л ялгаатай байж болно). '
  + 'Excel-ийн муруй 100%-д хүрдэггүй (Нийгмийн дэд бүтэц E6-д ороогүй; Багц-3.1 0.7%; хоосон сар).');
P();
P('## Сарын төлөвлөгөөний анхааруулга');
P();
P(`- Буурсан хуримтлал → сарын хувь 0 (${monthNotes.clamps.length}): ${monthNotes.clamps.join('; ') || '—'}`);
P(`- 100%-д хүрдэггүй (${monthNotes.partial.length}): ${monthNotes.partial.join('; ') || '—'}`);
P(`- «Сараар» хуудсанд бүх сар хоосон — сарын мөргүй (${monthNotes.none.length}): ${monthNotes.none.join('; ') || '—'}`);
if (monthErrCells) P(`- «Сараар» хуудасны алдаатай нүд (хоосон гэж үзэв): ${monthErrCells}`);
P();
P('## Мод');
P();
P(`- E-ийн нийлбэр томьёогоор эцэг солигдсон (${treeFixes.length}): ${treeFixes.map(fixTxt).join('; ') || '—'}`);
P(`- \`dd_kod\` давхардал: ${dupCodes} мөр${KOD === 'tree' ? ` · натурал эрэмбэ = Excel-ийн дараалал: ${sortOk ? '✅' : '❌'}` : ' — мод/дараалал objectid-оор (Excel-ийн дараалал), `projectPlan.orderPlanRows`'}`);
P(`- \`tuvshin\` = томьёоны модны гүн, outlineLevel БИШ (outline ${olDiff}/${items.length} мөрөнд зөрдөг).`);
P();
P('## Шийдвэр / анхааруулга');
P();
P(`- **objectid солигдоно** — мөнгөний ${updates.length} мөр Excel-ийн байрлалдаа шинээр нэмэгдэж, хуучин талбаруудаа (захирамж, гэрээ, эх үүсвэр, ангилал, \`cashflow_id\`) авч явна. `
  + '`created_*`/`last_edited_*` нь бичилтийн агшин болно (сервер өөрөө бичдэг).');
if (structOld.length) {
  const lost = viewOnlyOld.slice(0, 8).map((r) => `${md(r.dd_kod)} «${md(r.ajil_uilchilgee).slice(0, 30)}»`).join(', ');
  P(`- **«ТЭЗҮ · Ажлын зураг төсөл» харагдацын засвар УСТНА** — хуучин ${structOld.length} бүтцийн мөр (Excel-д байхгүй ${viewOnlyOld.length}: ${lost || '—'}). Бичихэд \`--drop-view-edits\`.`);
}
P(`- **Нэр** — ${renamed.length} мөнгөний мөрийн нэр Excel-ийнхээр солигдоно${KEEP_NAMES ? ' (`--keep-names` — ХАДГАЛНА)' : ''}.`);
P(`- **Явц** — мөнгөний мөрийн \`guitsetgel_huvi\` = Excel S × 100 (томьёоных ч): ${updates.filter((u) => !(u.a.guitsetgel_huvi == null && u.r.guitsetgel_huvi == null)
  && !(u.a.guitsetgel_huvi != null && u.r.guitsetgel_huvi != null && Math.abs(u.a.guitsetgel_huvi - Number(u.r.guitsetgel_huvi)) < 1e-6))
  .map((u) => `oid ${u.r.objectid} ${u.r.guitsetgel_huvi ?? '∅'}→${u.a.guitsetgel_huvi == null ? '∅' : fmt(u.a.guitsetgel_huvi)}`).join(', ') || '—'}.`);
P(`- **\`bagts\`** — ${EXCEL_BAGTS ? '`--excel-bagts`: Excel-ийнх бичигдэнэ.' : `багцын түлхүүр өөрчлөгдөх ${keptBagts.length} мөрөнд СИСТЕМИЙН утга үлдэнэ (IPC/газрын зургийн холбоос; Excel-ийнхээр бол \`--excel-bagts\`):`}`);
for (const { r, t } of keptBagts) P(`   - oid ${r.objectid}: «${md(r.bagts)}» (Excel «${md(t.attrs.bagts)}», мөр ${t.r})`);
P(`- **Excel-ийн өртөг 0** (мөнгөний мөр) — систем дүн 0: ${updates.filter((u) => !(u.a.ho_dun_geree > 0)).map((u) => `oid ${u.r.objectid} «${md(u.r.bagts)}» ${bn(u.r.ho_dun_geree)} → 0`).join('; ') || '—'}.`);
P('- **Огноо** — Excel H/I → `geree_*`, J/K → `guits_*`, L/M → `gazar_*` (тогтмол нүд; томьёотой нь null — систем үр удмаас бодно). '
  + 'Хуучин `ehleh_ognoo`/`duusah_ognoo` (Excel-д багана байхгүй) ХУУЛАГДАНА.');
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
P(`- Excel-ийн өртөг 0/хоосон, системд тааралдаагүй (бүтцийн мөр болно): ${zeroUnmatched.map((t) => `${xlRef(t)} «${md(t.attrs.bagts)}» ${md(t.attrs.ajil_uilchilgee).slice(0, 40)}`).join('; ') || '—'}`);
if (warns.length) { P('- Анхааруулга:'); for (const w of warns) P(`  - ${md(w)}`); }
P();
P('## Мөнгөний мөрийн тааралт (бүгд)');
P();
P('| oid | cashflow_id | Систем: bagts · нэр | Систем ho_dun_geree | → Excel | Excel: bagts · нэр | Excel өртөг | Өөрчлөлт | Сарын мөр (одоо → дараа) | Арга |');
P('|---:|---:|---|---:|---|---|---:|---:|---:|---|');
for (const r of money) {
  const u = updates.find((x) => x.r.objectid === r.objectid);
  const amb = ambiguous.find((x) => x.r.objectid === r.objectid);
  const nOld = monthsBy.get(r.cashflow_id)?.n ?? 0;
  if (u) {
    const d = (u.a.ho_dun_geree ?? 0) - (r.ho_dun_geree ?? 0);
    const nNew = monthAdds.filter((m) => m.cashflow_id === r.cashflow_id).length;
    P(`| ${r.objectid} | ${r.cashflow_id} | ${md(r.bagts)} · ${md(r.ajil_uilchilgee).slice(0, 50)} | ${fmt(r.ho_dun_geree)} | ${xlRef(u.t)} | ${md(u.t.attrs.bagts)} · ${md(u.t.attrs.ajil_uilchilgee).slice(0, 45)} | ${fmt(u.a.ho_dun_geree)}${u.t.money.src === 'formula' ? ' ƒ' : ''} | ${Math.abs(d) < 0.01 ? '=' : fmt(d)} | ${nOld} → ${nNew} | ${u.m.how} |`);
  } else {
    P(`| ${r.objectid} | ${r.cashflow_id} | ${md(r.bagts)} · ${md(r.ajil_uilchilgee).slice(0, 50)} | ${fmt(r.ho_dun_geree)} | ${amb ? '**ТОДОРХОЙГҮЙ**' : '**УСТГАХ**'} | — | — | ${amb ? '' : fmt(-(r.ho_dun_geree ?? 0))} | ${nOld} → ${amb ? nOld : 0} | ${amb ? amb.why : ''} |`);
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
    + ` · сарын мөр ${monthAdds.filter((m) => m.cashflow_id === x.a.cashflow_id).length}`
    + ` · ангилал oid ${x.sib?.r.objectid ?? '—'}-оос (${md(x.a.bagts_tuvshin1)} ${md(x.a.ajil_tuvshin1)} / ${md(x.a.ajil_tuvshin2)})`);
}
P();
P('## Устгах (Excel-д байхгүй) мөнгөний мөр');
P();
P('| oid | cashflow_id | ajil_tuvshin1 | bagts · нэр | ho_dun_geree | Сарын мөр | Сарын дүн |');
P('|---:|---:|---|---|---:|---:|---:|');
for (const r of deletes) {
  const x = monthsBy.get(r.cashflow_id);
  P(`| ${r.objectid} | ${r.cashflow_id} | ${md(r.ajil_tuvshin1)} | ${md(r.bagts)} · ${md(r.ajil_uilchilgee).slice(0, 60)} | ${fmt(r.ho_dun_geree)} | ${x?.n ?? 0} | ${fmt(x?.sum ?? 0)} |`);
}
P();
P(`Бичихэд: \`--confirm-deletes=${delToken}\` (хуучин БҮХ ${delAll.length} OID-ийн тоо:sha256 — мөнгөний ${money.length} + сарын ${months.length} + бүтцийн ${structOld.length})`);
P();
P('## Бүтцийн мөр — үе шатаар');
P();
{
  const c = new Map();
  for (const x of structure) c.set(x.t.phName, (c.get(x.t.phName) ?? 0) + 1);
  for (const [k, v] of c) P(`- ${md(k)}: ${v}`);
  P(`- блок мөр: ${structure.filter((x) => x.t.block).length} · \`guitsetgel_huvi\` (S) бичих: ${structure.filter((x) => x.a.guitsetgel_huvi != null).length}`);
}
P();
P(`## Хүснэгт ↔ Excel тулгалт (${VERIFY ? 'одоогийн хүснэгт' : 'ОДООГИЙН хүснэгт — импортоос өмнө'})`);
P();
if (!VERIFY) {
  P(`- **Бичсний дараах хүлээгдэх байдал** (төлөвлөсөн ${excelAdds.length + monthAdds.length} мөрийг тулгав): зөрүү **${sim.diffs.length}**`
    + `${sim.known.length ? ` · санаатай ${sim.known.length}` : ''} · тохирсон сарын мөр ${sim.monthOk} · «Нийт төсөв» ${fmt(sim.tot)}`);
  for (const d of sim.diffs.slice(0, 50)) P(`  - ${d}`);
  for (const d of sim.known) P(`  - (санаатай) ${d}`);
  P('- Одоогийн хүснэгт (импортоос өмнө):');
}
P(`- Зөрүү: **${now.diffs.length}**${now.known.length ? ` · санаатай (bagts хадгалсан): ${now.known.length}` : ''} · тохирсон сарын мөр: ${now.monthOk}`);
for (const d of now.diffs.slice(0, VERIFY ? 500 : 30)) P(`  - ${d}`);
if (now.diffs.length > (VERIFY ? 500 : 30)) P(`  - … (${now.diffs.length - (VERIFY ? 500 : 30)} илүү)`);
for (const d of now.known) P(`  - (санаатай) ${d}`);

const out = opt('out');
const flush = () => { if (out && out !== true) writeFileSync(out, L.join('\n'), 'utf8'); };
flush();
const planFile = opt('plan');
if (planFile && planFile !== true) {
  writeFileSync(planFile, JSON.stringify({
    excelRows: excelAdds, monthRows: monthAdds, deleteAll: delAll, confirmDeletes: delToken,
  }, null, 1), 'utf8');
}
if (VERIFY) {
  console.log(`ШАЛГАЛТ: ${sys.length} мөр · зөрүү ${now.diffs.length}${now.known.length ? ` (+ санаатай ${now.known.length})` : ''} · тохирсон сарын мөр ${now.monthOk} · «Нийт төсөв» ${fmt(now.tot)}`);
  for (const d of now.diffs.slice(0, 40)) console.log(`  ${d}`);
  if (out && out !== true) console.log(`тайлан: ${out}`);
  await quit(now.diffs.length ? 2 : 0);
}
console.log(`мөнгөний: шинэчлэх ${updates.length} · шинэ ${adds.length} · устгах ${deletes.length} · тодорхойгүй ${ambiguous.length}`
  + ` | сарын: ${months.length} → ${monthAdds.length} (ижил ${monthDiff.same} · өөрчлөгдөх ${monthDiff.changed} · шинэ ${monthDiff.added} · устах ${monthDiff.removed})`
  + ` | бүтэц ${structOld.length} → ${structure.length} | «Нийт төсөв» ${bn(cfTotBefore)} → ${bn(cfTotAfter)} (E6 ${cfTotOk && e6Ok ? 'OK' : 'ЗӨРСӨН'})`
  + ` | dd_kod давхардал ${dupCodes}${KOD === 'tree' ? ` · эрэмбэ ${sortOk ? 'OK' : 'ЗӨРСӨН'}` : ''}`);
for (const x of treeFixes) console.log(`мод (E томьёо): ${fixTxt(x)}`);
console.log(`бичсний дараах хүлээгдэх тулгалт: зөрүү ${sim.diffs.length}${sim.known.length ? ` (+ санаатай ${sim.known.length})` : ''} · сарын мөр ${sim.monthOk}/${monthAdds.length}`);
console.log(`устгах OID: --confirm-deletes=${delToken}`);
if (out && out !== true) console.log(`тайлан: ${out}`);

/* ═══════════ 7. Бичих (зөвхөн --write) ═══════════ */
if (!WRITE) await quit(0);
if (opt('i-know-this-is-production') !== true) { console.error('⛔ Production хүснэгт — --i-know-this-is-production'); process.exit(1); }
if (ambiguous.length) { console.error(`⛔ ${ambiguous.length} тодорхойгүй тааралт — эхлээд шийд (бичихгүй).`); process.exit(1); }
/* ⚠️ 2026-10-26: E6 зөрвөл (Excel өөрчлөгдсөн / мөнгөний мөрийн сонголт буруу) БИЧИХГҮЙ */
if (!e6Ok || !cfTotOk) { console.error(`⛔ E6 зөрсөн: Excel ${fmt(e6Sum)} · дашбоард ${fmt(cfTotAfter)} ≠ ${fmt(TOTAL_E6)} — бичихгүй.`); process.exit(1); }
if (KOD === 'tree' && (dupCodes || !sortOk)) { console.error(`⛔ dd_kod: давхардал ${dupCodes}${sortOk ? '' : ' · натурал эрэмбэ Excel-ийн дараалалтай зөрсөн'} — бичихгүй.`); process.exit(1); }
if (structOld.length && opt('drop-view-edits') !== true) {
  console.error(`⛔ --drop-view-edits — хуучин ${structOld.length} бүтцийн мөр (Excel-д байхгүй ${viewOnlyOld.length}) устаж, «ТЭЗҮ · Ажлын зураг төсөл»-ийн засвар алга болно (тайлангийн «Шийдвэр»)`);
  process.exit(1);
}
if (opt('confirm-deletes') !== delToken) {
  console.error(`⛔ --confirm-deletes=${delToken} (хуучин бүх ${delAll.length} OID-ийн тоо:хэш — dry-run-ий тайлантай тулга)`);
  process.exit(1);
}
const backupOpt = opt('backup');
if (!backupOpt || backupOpt === true) { console.error('⛔ --backup=<нөөц.json> (репогийн гадна, жиш. scratchpad) — бичихээс өмнөх бүх мөрийн нөөц'); process.exit(1); }
/* Нөөц-сэтгүүл — бичихээс ӨМНӨ бүх мөр; багц бүрийн дараа нэмэгдсэн OID */
const backup = resolve(backupOpt);
const journal = { kind: 'cashflow-import-backup', target: TARGET, at: new Date().toISOString(), rows: sys, added: [], step: null };
const saveJournal = () => writeFileSync(backup, JSON.stringify(journal), 'utf8');
saveJournal();
console.log(`нөөц: ${backup} (${sys.length} мөр)`);
const onAdds = (_part, res) => { journal.added.push(...res.map((x) => x.objectId)); saveJournal(); };
/* ⚠️ Дараалал: НЭМЭХ эхлээд (унавал хуучин бүтэн), УСТГАХ сүүлд. Excel мөрүүд НЭГ дарааллаар — objectid өснө. */
const steps = [
  ['Excel-ийн мөр нэмэх (Excel-ийн дарааллаар)', 'adds', excelAdds],
  ['сарын мөр нэмэх', 'adds', monthAdds],
  ['хуучин бүх мөр устгах', 'deletes', delAll],
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
/* Бичсний ДАРАА — хүснэгтийг дахин уншиж Excel-тэй мөр мөрөөр тулгана */
const fresh = await readAll();
const v = verifyTable(fresh);
console.log(`✅ бичигдлээ · ДАХИН УНШСАН ${fresh.length} мөр: зөрүү ${v.diffs.length}${v.known.length ? ` (+ санаатай ${v.known.length})` : ''} · тохирсон сарын мөр ${v.monthOk} · «Нийт төсөв» ${fmt(v.tot)}`);
for (const d of v.diffs.slice(0, 100)) console.log(`  ${d}`);
for (const d of v.known) console.log(`  (санаатай) ${d}`);
if (out && out !== true) {
  P();
  P(`## Бичсний дараах тулгалт (${fresh.length} мөр)`);
  P();
  P(`- Зөрүү: **${v.diffs.length}** · санаатай ${v.known.length} · тохирсон сарын мөр ${v.monthOk}`);
  for (const d of v.diffs) P(`  - ${d}`);
  flush();
}
await quit(v.diffs.length ? 2 : 0);

/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» ХҮСНЭГТ → EXCEL (.xlsx) — ОДООГИЙН ХАРАГДАЦААР (2026-10-12).
 */
import type { SheetRow, Calc } from "../bagtsSheet";
import type { Band } from "../bagts.bands";
import { negjOf, unitLabel } from "../negj";
import { extraVal, type ExtraCol } from "./extraCols";
import { t as tr } from "@/lib/i18nCore";
import { buildXlsx, downloadXlsx, type XlsxCell, type XlsxMerge, type XlsxSheet, type XlsxStyle } from "@/lib/xlsx";

/** Бүдүүвчийн хэрэгтэй хэсэг (`Schema` бүтцээрээ нийцнэ) */
export type XlsxSchema = { bld: string[]; synthetic: boolean; f: { plannedVol: string | null } };

export type FillXlsxInput = {
  /** Дэлгэцийн (орчуулагдсан) нэр · давхрын хувилбар · багцын бүлэг */
  pkg: { label: string; group: string; floors: 9 | 12 | null };
  sc: XlsxSchema;
  bands: Band[];
  rowsAll: readonly SheetRow[];
  calc: readonly Calc[];
  /** Харагдаж буй мөрийн индексүүд (`useRowFilter.vis`) — бүгд, цонх биш */
  vis: readonly number[];
  fillMode: "obyem" | "pct";
  asOf: number | null;
  asOfOrig: number | null;
  /** «Бусад талбар» — харагдаж байгаа бол `SheetHead`/`FillRows`-тэй ИЖИЛ массив, нуусан бол `[]` */
  extra: ExtraCol[];
  /** Инж. төлөвлөсөн обьёмын ноорог (`PvCell.draft`) ба илгээгдсэн урьдчилсан утга (`PvCell.preview`) */
  pvPend: Record<number, string>;
  pvPreview: Map<number, number | null> | null;
  /** Илгээгээгүй ноорог — нүд (`${oid}:${bi}`) ба огноо (`${oid}:${bi}:s|e`) */
  pending: Record<string, string>;
  pendDate: Record<string, string>;
  /** Гүйцэтгэгчийн тал: буцаагдсан илгээлтийн өөрчлөгдсөн/зөвшөөрсөн нүд (`${oid}:${шошго}`), огноо (`${oid}:${bi}:s|e`) */
  backChg: ReadonlySet<string>;
  backOk: ReadonlySet<string>;
  backChgDates: ReadonlySet<string>;
  /** Хянагчийн харагдац: `view.changed` / `view.ok` (`${i}:${шошго}`) */
  viewChanged?: ReadonlySet<string>;
  viewOk?: ReadonlySet<string>;
  /** «Мэдээлэл» хуудас */
  info: {
    /** Бөглөх өдөр — `view.day` эсвэл өнөөдрийн бөглөх өдөр (`YYYY-MM-DD`) */
    day: string;
    /** Хүснэгтэд харагдаж буй өгөгдлийн агшин (`snapDay`), хоосон бол мэдэгдэхгүй */
    snapDay: string;
    /** Шүүлтийн бичвэр — дуудагч угсарна (бүлэг · дэд бүлэг · хуваарийн дагуу · бусад талбар) */
    filters: string;
    user: string;
    /** Хяналтын харагдац (`view`) уу */
    locked: boolean;
    /** Татсан агшин — шалгуурт тогтмол өгнө */
    now?: Date;
  };
};

/* ── Өнгө (hex, `#`-гүй) — дэлгэцийн цайвар сэдэвт ойролцоо ── */
const C_HEAD = "E7ECF2";
const C_BAND = "D9E3EE";
const C_GROUP = "EEF2F6";
/** Илгээгээгүй ноорог (`dirty`) — дэлгэцийн `--sheet-dirty` (hue 40%) */
const C_DIRTY = "D5ECF0";
/** Буцаагдсан, засах (`chg`) */
const C_CHG = "FBE0DF";
/** Зөвшөөрсөн (`chgOk`) */
const C_OK = "DCF3E3";

/* ── Загварууд — объект нэг л удаа (нүд бүрд шинэ үүсгэхгүй) ── */
const S_HEAD: XlsxStyle = { bold: true, fill: C_HEAD, border: true, align: "center", valign: "center", wrap: true };
const S_BAND: XlsxStyle = { bold: true, fill: C_BAND, border: true, align: "center", valign: "center", wrap: true };
const S_HEAD_L: XlsxStyle = { bold: true, fill: C_HEAD, border: true, align: "left", valign: "center", wrap: true };

/** Загварын кэш — `(bold · fill · numFmt · indent · align)` хослол бүрт нэг объект */
const CACHE = new Map<string, XlsxStyle>();
function sty(o: { bold?: boolean; fill?: string; numFmt?: string; indent?: number; align?: XlsxStyle["align"] }): XlsxStyle {
  const k = `${o.bold ? 1 : 0}|${o.fill ?? ""}|${o.numFmt ?? ""}|${o.indent ?? 0}|${o.align ?? ""}`;
  let s = CACHE.get(k);
  if (!s) {
    s = { border: true, ...(o.bold ? { bold: true } : {}), ...(o.fill ? { fill: o.fill } : {}), ...(o.numFmt ? { numFmt: o.numFmt } : {}),
      ...(o.indent ? { indent: o.indent } : {}), ...(o.align ? { align: o.align } : {}) };
    CACHE.set(k, s);
  }
  return s;
}

/** UTC өдөр (`YYYY-MM-DD`) — `fill/util.dt`-тэй ЯГ ижил (util нь CSS импортолдог тул энд давтав) */
export const day = (ms: number | null | undefined): string => (ms == null ? "" : new Date(ms).toISOString().slice(0, 10));

/**
 * Тоо хэмжээний формат — дэлгэцийн `qty` (3 орон хүртэл, илүүдэл 0-гүй, мянгатын таслал)-тай ойролцоо.
 */
export function qtyFmt(v: number, unit: string | null): string {
  const base = Number.isInteger(Number(v.toFixed(3))) ? "#,##0" : "#,##0.###";
  return unit ? `${base} "${unit}"` : base;
}

/** Тоон нүд — `null`/`NaN` → хоосон (null ≠ 0); нэгж нь форматад */
function qtyCell(v: number | null | undefined, opts: { unit?: string | null; bold?: boolean; fill?: string } = {}): XlsxCell {
  if (v == null || !Number.isFinite(v)) return { v: null, s: sty({ bold: opts.bold, fill: opts.fill, align: "right" }) };
  return { v, s: sty({ bold: opts.bold, fill: opts.fill, numFmt: qtyFmt(v, opts.unit ?? null), align: "right" }) };
}

/** Хувийн нүд — 0–1 бутархай хэвээр, `0.0%` (жинд `0.00%`) форматтай */
function wtFmt(v: number | null | undefined): "0.0%" | "0.00%" | "0.0000%" {
  const p = Math.abs((v ?? 0) * 100);
  return p >= 10 ? "0.0%" : p >= 1 || p === 0 ? "0.00%" : "0.0000%";
}

function pctCell(v: number | null | undefined, fmt: "0.0%" | "0.00%" | "0.0000%", opts: { bold?: boolean; fill?: string } = {}): XlsxCell {
  if (v == null || !Number.isFinite(v)) return { v: null, s: sty({ bold: opts.bold, fill: opts.fill, align: "right" }) };
  return { v, s: sty({ bold: opts.bold, fill: opts.fill, numFmt: fmt, align: "right" }) };
}

function txtCell(v: string, opts: { bold?: boolean; fill?: string; indent?: number; align?: XlsxStyle["align"] } = {}): XlsxCell {
  return { v: v || null, s: sty(opts) };
}

/** `ExtraCol.kind` → баганын өргөн (тэмдэгт) — `sheet.module.css` `.b32 { --w-x* }`-тэй ойролцоо (px ÷ 7.5) */
const extraW = (k: ExtraCol["kind"]): number =>
  k === "text" ? 20 : k === "user" ? 17 : k === "int" ? 11 : 13;

/**
 * Толгой — `SheetHead`-ийн ЯГ тэр бүтэц:
 *   · блоктой (`tall`): 4 мөр — бүлэг → цуваа (`bands`) → блокийн код → Эхлэх/Дуусах
 *   · синтетик (`syn`, блокгүй багцын нэг блок): 2 мөр — бүлэг → баганын нэр + Эхлэх/Дуусах
 *   · блокгүй, синтетик ч биш: 1 мөр (+ «Бусад талбар» байвал 2-р мөр)
 * Буцаана: мөрүүд · нэгдсэн нүднүүд · толгойн мөрийн тоо.
 */
export function buildHeader(sc: XlsxSchema, bands: Band[], extra: ExtraCol[]): { rows: XlsxCell[][]; merges: XlsxMerge[]; nHead: number } {
  const nBld = sc.bld.length;
  const syn = sc.synthetic && nBld === 1;
  const tall = nBld > 0 && !syn;
  const nHead = tall ? 4 : syn || extra.length > 0 ? 2 : 1;
  const nCols = 14 + nBld * 4 + extra.length;
  const rows: XlsxCell[][] = Array.from({ length: nHead }, () => new Array<XlsxCell>(nCols).fill({ v: null, s: S_HEAD }));
  const merges: XlsxMerge[] = [];
  const put = (r: number, c: number, v: string, s: XlsxStyle, rowSpan = 1, colSpan = 1) => {
    rows[r][c] = { v, s };
    if (rowSpan > 1 || colSpan > 1) merges.push({ r1: r, c1: c, r2: r + rowSpan - 1, c2: c + colSpan - 1 });
  };
  /* 1-р мөр — тогтмол баганууд (бүх толгойн мөрийг хамарна) */
  const fixed: [string, XlsxStyle][] = [
    ["№", S_HEAD], [tr('Ажил'), S_HEAD_L], [tr('Хувийн жин'), S_HEAD], [tr('Хувийн жин (нийт)'), S_HEAD],
    [tr('Одоо байгаа хувийн жин'), S_HEAD], [tr('Обьём'), S_HEAD], [tr('Инж. төлөвлөсөн обьём'), S_HEAD],
    [tr('Обьёмын нийлбэр'), S_HEAD], [tr('Нэгж өртөг'), S_HEAD], [tr('Мөнгөн дүн'), S_HEAD],
    [tr('Төлөвлөгөөт гүйцэтгэл'), S_HEAD], [tr('Бодит гүйцэтгэл'), S_HEAD], [tr('Төлөвлөгөө биелэлт'), S_HEAD],
  ];
  fixed.forEach(([v, s], c) => put(0, c, v, s, nHead));
  let c = 13;
  const cAct = c, cPlan = c + nBld, cDate = c + nBld * 2;
  if (syn) {
    put(0, cAct, tr('Ажил гүйцэтгэл'), S_BAND);
    put(0, cPlan, tr('Төлөвлөгөөт гүйцэтгэл'), S_BAND);
    put(0, cDate, tr('Төлөвлөгөөт хуваарь'), S_BAND, 1, 2);
    put(1, cAct, tr('Обьём (нийт · +энэ удаа)'), S_HEAD);
    put(1, cPlan, "%", S_HEAD);
    put(1, cDate, tr('Эхлэх'), S_HEAD);
    put(1, cDate + 1, tr('Дуусах'), S_HEAD);
  } else if (tall) {
    put(0, cAct, tr('Ажил гүйцэтгэл — обьём / хувь ({0} барилга)', nBld), S_BAND, 1, nBld);
    put(0, cPlan, tr('Төлөвлөгөөт гүйцэтгэл ({0} барилга)', nBld), S_BAND, 1, nBld);
    put(0, cDate, tr('Төлөвлөгөөт хуваарь ({0} барилга)', nBld), S_BAND, 1, nBld * 2);
    /* 2-р мөр — цуваа (барилгын төрөл) гурван бүлэгт */
    let o = 0;
    for (const g of bands) { put(1, cAct + o, g.label, S_BAND, 1, g.count); put(1, cPlan + o, g.label, S_BAND, 1, g.count); put(1, cDate + o * 2, g.label, S_BAND, 1, g.count * 2); o += g.count; }
    /* 3-р мөр — блокийн код (act · plan 3–4-р мөрийг хамарна; огноо 2 баганыг) · 4-р мөр — Эхлэх/Дуусах */
    sc.bld.forEach((b, bi) => {
      put(2, cAct + bi, b, S_HEAD, 2);
      put(2, cPlan + bi, `${b} ${tr('барилга')}`, S_HEAD, 2);
      put(2, cDate + bi * 2, `${b} ${tr('барилга')}`, S_HEAD, 1, 2);
      put(3, cDate + bi * 2, tr('Эхлэх'), S_HEAD);
      put(3, cDate + bi * 2 + 1, tr('Дуусах'), S_HEAD);
    });
  }
  c += nBld * 4;
  put(0, c, tr('Шинэчлэгдсэн огноо'), S_HEAD, nHead);
  c++;
  if (extra.length) {
    put(0, c, tr('Бусад талбар'), S_BAND, 1, extra.length);
    extra.forEach((x, xi) => put(1, c + xi, x.label(), S_HEAD, nHead - 1));
  }
  return { rows, merges, nHead };
}

/** Нэг харагдах мөр → Excel мөр (`FillRows`-ийн нүд бүртэй нэг нэгээр) */
export function buildRow(inp: FillXlsxInput, i: number): XlsxCell[] | null {
  const { sc, rowsAll, calc, fillMode, extra, pvPend, pvPreview, pending, pendDate, backChg, backOk, backChgDates, viewChanged, viewOk } = inp;
  const r = rowsAll[i];
  const c = calc[i];
  if (!r || !c) return null;
  const g = r.group;
  const gf = g ? C_GROUP : undefined;
  const negj = g ? null : unitLabel(negjOf(r.work)) || null;
  const noTitle = /\s/.test(r.no);
  const workTxt = r.work || (noTitle ? r.no : "");
  const out: XlsxCell[] = [
    txtCell(r.no, { bold: g, fill: gf, align: "right" }),
    txtCell(workTxt, { bold: g, fill: gf, indent: r.depth }),
    pctCell(c.C, wtFmt(c.C), { bold: g, fill: gf }),
    pctCell(c.D, wtFmt(c.D), { bold: g, fill: gf }),
    pctCell(c.E, wtFmt(c.E), { bold: g, fill: gf }),
    qtyCell(r.vol, { unit: r.vol != null ? negj : null, bold: g, fill: gf }),
  ];
  /* Инж. төлөвлөсөн обьём — `PvCell.shown`: ноорог → илгээгдсэн урьдчилсан → хадгалсан */
  {
    const draft = pvPend[r.oid];
    const saved = r.plannedVol;
    const draftNum = draft !== undefined ? (draft.trim() === "" ? null : Number(draft)) : undefined;
    const preview = pvPreview?.get(r.oid);
    const shown: number | null = draft !== undefined
      ? (draftNum != null && !Number.isFinite(draftNum) ? saved : draftNum ?? null)
      : preview !== undefined ? preview : saved;
    const dirtyPv = draft !== undefined;
    out.push(qtyCell(shown, { unit: shown != null ? negj : null, bold: g, fill: dirtyPv ? C_DIRTY : gf }));
  }
  out.push(
    qtyCell(c.obyemSum, { unit: c.obyemSum != null ? negj : null, bold: g, fill: gf }),
    qtyCell(r.unit, { bold: g, fill: gf }),
    qtyCell(r.money, { bold: g, fill: gf }),
    pctCell(c.I, "0.0%", { bold: g, fill: gf }),
    pctCell(c.J, "0.0%", { bold: g, fill: gf }),
    pctCell(c.K, "0.0%", { bold: g, fill: gf }),
  );
  /* Гүйцэтгэлийн нүд — горимын ТОМ тоо; өнгө `FillRows`-ийн `chg` · `chgOk` · `dirty` дүрмээр */
  sc.bld.forEach((b, bi) => {
    const dirty = `${r.oid}:${bi}` in pending;
    const ck = `${i}:${b}`;
    const bk = `${r.oid}:${b}`;
    const changed = !!viewChanged?.has(ck) || backChg.has(bk);
    const okd = !!viewOk?.has(ck) || (backChg.has(bk) && backOk.has(bk));
    const fill = changed ? (okd ? C_OK : C_CHG) : dirty ? C_DIRTY : gf;
    out.push(fillMode === "pct"
      ? pctCell(c.act[bi], "0.0%", { bold: g, fill })
      : qtyCell(c.obyem[bi], { unit: c.obyem[bi] != null ? negj : null, bold: g, fill }));
  });
  sc.bld.forEach((_b, bi) => out.push(pctCell(c.plan[bi], "0.0%", { bold: g, fill: gf })));
  sc.bld.forEach((_b, bi) => {
    for (const k of ["s", "e"] as const) {
      const key = `${r.oid}:${bi}:${k}`;
      const ms = k === "s" ? c.start[bi] : c.end[bi];
      const fill = backChgDates.has(key) ? C_CHG : key in pendDate ? C_DIRTY : gf;
      out.push(txtCell(day(ms), { bold: g, fill, align: "right" }));
    }
  });
  /* Шинэчлэгдсэн огноо — зөвхөн ЭХНИЙ мөрд (`i === 0`), өөрчилсөн бол ноорогийн өнгө */
  out.push(txtCell(i === 0 ? day(inp.asOf) : "", { bold: g, fill: i === 0 && inp.asOf !== inp.asOfOrig ? C_DIRTY : gf, align: "right" }));
  for (const x of extra) {
    const v = extraVal(x, r);
    out.push(txtCell(v.text, { bold: g, fill: gf, align: x.kind === "int" || x.kind === "pct" ? "right" : undefined }));
  }
  return out;
}

/** Баганын өргөн — дэлгэцийн анхдагч px (`sheet.module.css` `.b32`) ÷ 7.5 */
export function colWidths(nBld: number, extra: ExtraCol[]): number[] {
  const w = [7, 40, 10, 10, 13, 13, 13, 13, 13, 14, 12, 12, 12];
  for (let k = 0; k < nBld; k++) w.push(11);
  for (let k = 0; k < nBld; k++) w.push(11);
  for (let k = 0; k < nBld * 2; k++) w.push(12);
  w.push(14);
  for (const x of extra) w.push(extraW(x.kind));
  return w;
}

/** Файлын нэр — `Гүйцэтгэл_<багц>_<хувилбар>_<YYYY-MM-DD>.xlsx` (хувилбаргүй багцад тэр хэсэг алга) */
export function fillXlsxName(pkg: { group: string; floors: 9 | 12 | null }, dayStr: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").trim().replace(/\s+/g, "_");
  return `Гүйцэтгэл_${safe(pkg.group)}${pkg.floors ? `_${pkg.floors}F` : ""}_${dayStr || day(Date.now())}.xlsx`;
}

/** Workbook — «Гүйцэтгэл» (хүснэгт) + «Мэдээлэл» (багц · хувилбар · огноо · шүүлт · татсан агшин · хэрэглэгч) */
export function buildFillWorkbook(inp: FillXlsxInput): XlsxSheet[] {
  const nBld = inp.sc.bld.length;
  const head = buildHeader(inp.sc, inp.bands, inp.extra);
  const rows: XlsxCell[][] = [...head.rows];
  for (const i of inp.vis) {
    const r = buildRow(inp, i);
    if (r) rows.push(r);
  }
  const main: XlsxSheet = {
    name: tr('Гүйцэтгэл'),
    rows,
    merges: head.merges,
    cols: colWidths(nBld, inp.extra),
    /* Толгойн мөрүүд + № · Ажил баганууд хөлдөнө (дэлгэцийн царцсан толгой/баганатай ижил) */
    frozen: { rows: head.nHead, cols: 2 },
  };
  const now = inp.info.now ?? new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
  const L = (s: string): XlsxCell => ({ v: s, s: S_HEAD_L });
  const V = (s: string): XlsxCell => ({ v: s || "—", s: sty({}) });
  const infoRows: XlsxCell[][] = [
    [L(tr('Багц')), V(inp.pkg.label)],
    [L(tr('Хувилбар')), V(inp.pkg.floors ? `${inp.pkg.floors}F` : "—")],
    [L(tr('Огноо')), V(inp.info.day)],
    [L(tr('Шинэчлэгдсэн огноо')), V(day(inp.asOf))],
    [L(tr('Өгөгдлийн огноо')), V(inp.info.snapDay)],
    [L(tr('Горим')), V(inp.info.locked ? tr('Хяналтын харагдац') : inp.fillMode === "pct" ? tr('Хувь') : tr('Обьём'))],
    [L(tr('Шүүлт')), V(inp.info.filters)],
    [L(tr('Мөр')), V(String(inp.vis.length))],
    [L(tr('Татсан огноо-цаг')), V(stamp)],
    [L(tr('Хэрэглэгч')), V(inp.info.user)],
  ];
  const info: XlsxSheet = { name: tr('Мэдээлэл'), rows: infoRows, cols: [22, 60] };
  return [main, info];
}

/** Татах — хөтөчид л (`downloadXlsx`) */
export function downloadFillXlsx(inp: FillXlsxInput): void {
  downloadXlsx(fillXlsxName(inp.pkg, inp.info.day), buildXlsx(buildFillWorkbook(inp)));
}

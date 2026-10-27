/**
 * МИНИМАЛ XLSX БИЧИГЧ — хамааралгүй, цэвэр (хөтөч ба Node хоёуланд ажиллана).
 *
 * ⚠️ 2026-10-12: «Гүйцэтгэл бөглөх» хүснэгтийг дэлгэц дээрх хэлбэрээр нь Excel болгож татах
 *    хэрэгцээнд зориулж бичив. `xlsx`/`exceljs` зэрэг багц НЭМЭХГҮЙ (хэрэглэгчийн шийдвэр —
 *    хэдэн зуун КБ хамаарал, аюулгүй байдлын зарлал) тул OOXML-ийн шаардлагатай хэсгийг
 *    өөрсдөө угсарна:
 *      `[Content_Types].xml` · `_rels/.rels` · `xl/workbook.xml` · `xl/_rels/workbook.xml.rels`
 *      · `xl/styles.xml` · `xl/worksheets/sheetN.xml`
 *    Мөр нь `sharedStrings` БИШ, `t="inlineStr"` (хуудас бүр өөрөө бүтэн — нэг хэсэг бага).
 * ⚠️ ZIP нь STORE (шахалтгүй) — `zlib`/`CompressionStream` хэрэггүй, Node-ийн шалгуур
 *    (`xlsx.check.mjs`) local header-ийн offset-оор шууд задалж уншина. Файлын нэр UTF-8
 *    (flag 0x0800). CRC32 нь ЗААВАЛ зөв — Excel буруу CRC-тэй файлыг «эвдэрсэн» гэнэ.
 * ⚠️ Дэмжих зүйл: нүдний утга (мөр · тоо · хоосон) · нэгдсэн нүд · баганын өргөн · хөлдөөсөн
 *    мөр/багана · загвар (тод · арын өнгө · нимгэн хүрээ · тоон формат · догол · зэрэгцүүлэлт ·
 *    нугалах). Томьёо, огнооны серийн тоо, зураг — ЗОРИУД байхгүй.
 * ⚠️ XML-д `& < > "` ЗААВАЛ escape (`esc`) — ажлын нэрэнд `&`, `<` тааралддаг.
 * ⚠️ Хуудасны нэр: Excel 31 тэмдэгт, `[]:*?/\` хориотой — `sheetName` тааруулна, давхардвал
 *    дугаар залгана (давхардсан нэртэй файлыг Excel нээдэггүй).
 */

/* ── Төрлүүд ── */

export type XlsxStyle = {
  bold?: boolean;
  /** Арын өнгө — `RRGGBB` (hex, `#`-гүй) */
  fill?: string;
  /** Үсгийн өнгө — `RRGGBB` */
  color?: string;
  /** Нимгэн хүрээ дөрвөн талд */
  border?: boolean;
  /** Excel-ийн тоон формат — жиш. `0.0%` · `#,##0.00` · `#,##0` · `#,##0.### "м³"` */
  numFmt?: string;
  /** Зүүн догол (Excel-ийн indent нэгж — ~3 тэмдэгт) */
  indent?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "center" | "bottom";
  wrap?: boolean;
};

/** Нүд: шууд утга эсвэл `{ v, s }`. `null`/`undefined` = хоосон (0 БИШ — null ≠ 0). */
export type XlsxCell = string | number | null | undefined | { v?: string | number | null; s?: XlsxStyle };

/** Нэгдсэн муж — 0-суурьтай, хоёр зах ОРНО */
export type XlsxMerge = { r1: number; c1: number; r2: number; c2: number };

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  merges?: XlsxMerge[];
  /** Баганын өргөн (Excel-ийн тэмдэгтийн нэгжээр); `undefined` = анхдагч */
  cols?: (number | undefined)[];
  /** Хөлдөөх: дээд `rows` мөр ба зүүн `cols` багана */
  frozen?: { rows: number; cols: number };
};

/* ── XML туслахууд ── */

/**
 * ⚠️ 2026-10-19: XML 1.0-д ХОРИОТОЙ удирдлагын тэмдэгтийг (`\u0000-\u0008`, `\u000B`, `\u000C`,
 *    `\u000E-\u001F`, `￾`/`￿`) ХАСНА — `docx.ts`-ийн `clean`-тэй ижил дүрэм. ArcGIS-ийн чөлөөт текстэд
 *    (хуулж буулгасан тайлбар) тийм тэмдэгт байвал Excel файлыг «эвдэрсэн» гэж нээдэггүй байв.
 *    Таб (`\t`), мөр таслал (`\n`, `\r`) — хүчинтэй, хэвээр.
 */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const esc = (s: string): string =>
  s.replace(XML_ILLEGAL, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 0-суурьтай баганын индекс → `A` · `Z` · `AA` … */
export function colLetter(c: number): string {
  let n = c + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Нүдний хаяг — `cellRef(0, 0)` = `A1` */
export const cellRef = (r: number, c: number): string => `${colLetter(c)}${r + 1}`;

/** Excel-ийн хуудасны нэрийн дүрэм: хориотой тэмдэгт → зай, 31 тэмдэгт, хоосон бол `Sheet` */
export function sheetName(raw: string): string {
  const s = raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31).trim();
  return s || "Sheet";
}

/* ── Загварын бүртгэл (styles.xml) ── */

type StyleReg = {
  fonts: string[];
  fills: string[];
  numFmts: Map<string, number>;
  xfs: string[];
  byKey: Map<string, number>;
};

function newStyleReg(): StyleReg {
  return {
    /* ⚠️ Excel: fonts[0] анхдагч; fills[0] = none, fills[1] = gray125 ЗААВАЛ (специйн шаардлага) */
    fonts: ['<font><sz val="10"/><name val="Arial"/></font>'],
    fills: ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
    numFmts: new Map(),
    xfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'],
    byKey: new Map([["", 0]]),
  };
}

/** Загвар → `cellXfs` индекс (ижил загвар нэг л удаа бүртгэгдэнэ) */
function styleId(reg: StyleReg, s: XlsxStyle | undefined): number {
  if (!s) return 0;
  const key = JSON.stringify([s.bold ?? false, s.fill ?? "", s.color ?? "", s.border ?? false, s.numFmt ?? "", s.indent ?? 0, s.align ?? "", s.valign ?? "", s.wrap ?? false]);
  if (key === JSON.stringify([false, "", "", false, "", 0, "", "", false])) return 0;
  const have = reg.byKey.get(key);
  if (have != null) return have;

  /* Фонт */
  const fontXml = `<font>${s.bold ? "<b/>" : ""}<sz val="10"/>${s.color ? `<color rgb="FF${s.color.toUpperCase()}"/>` : ""}<name val="Arial"/></font>`;
  let fontId = reg.fonts.indexOf(fontXml);
  if (fontId < 0) { fontId = reg.fonts.length; reg.fonts.push(fontXml); }

  /* Дүүргэлт */
  let fillId = 0;
  if (s.fill) {
    const fillXml = `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`;
    fillId = reg.fills.indexOf(fillXml);
    if (fillId < 0) { fillId = reg.fills.length; reg.fills.push(fillXml); }
  }

  /* Тоон формат — Excel-ийн суулгасан дугаарууд хэрэглэхгүй, бүгдийг 164+ дугаартай custom гэж бүртгэнэ */
  let numFmtId = 0;
  if (s.numFmt) {
    const have2 = reg.numFmts.get(s.numFmt);
    if (have2 != null) numFmtId = have2;
    else { numFmtId = 164 + reg.numFmts.size; reg.numFmts.set(s.numFmt, numFmtId); }
  }

  const borderId = s.border ? 1 : 0;
  const alignAttrs: string[] = [];
  if (s.align) alignAttrs.push(`horizontal="${s.align}"`);
  if (s.valign) alignAttrs.push(`vertical="${s.valign}"`);
  if (s.wrap) alignAttrs.push('wrapText="1"');
  if (s.indent) alignAttrs.push(`indent="${Math.max(0, Math.min(250, Math.round(s.indent)))}"`);
  const align = alignAttrs.length ? `<alignment ${alignAttrs.join(" ")}/>` : "";
  const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
    + `${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}`
    + `${borderId ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1"' : ""}${align ? `>${align}</xf>` : "/>"}`;
  const id = reg.xfs.length;
  reg.xfs.push(xf);
  reg.byKey.set(key, id);
  return id;
}

function stylesXml(reg: StyleReg): string {
  const numFmts = reg.numFmts.size
    ? `<numFmts count="${reg.numFmts.size}">${[...reg.numFmts].map(([f, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(f)}"/>`).join("")}</numFmts>`
    : "";
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + numFmts
    + `<fonts count="${reg.fonts.length}">${reg.fonts.join("")}</fonts>`
    + `<fills count="${reg.fills.length}">${reg.fills.join("")}</fills>`
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>'
    + '<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${reg.xfs.length}">${reg.xfs.join("")}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + "</styleSheet>";
}

/* ── Хуудас (sheetN.xml) ── */

function cellXml(r: number, c: number, cell: XlsxCell, reg: StyleReg): string {
  const obj = cell != null && typeof cell === "object" ? cell : { v: cell as string | number | null | undefined };
  const v = obj.v;
  const s = styleId(reg, obj.s);
  const sAttr = s ? ` s="${s}"` : "";
  const ref = cellRef(r, c);
  if (v == null || v === "") return s ? `<c r="${ref}"${sAttr}/>` : "";
  if (typeof v === "number") {
    /* ⚠️ NaN/Infinity нь XML-д хүчингүй — хоосон нүд (null ≠ 0 дүрэм хэвээр: тоо биш бол утгагүй) */
    if (!Number.isFinite(v)) return s ? `<c r="${ref}"${sAttr}/>` : "";
    return `<c r="${ref}"${sAttr}><v>${String(v)}</v></c>`;
  }
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function sheetXml(sh: XlsxSheet, reg: StyleReg): string {
  const nCols = Math.max(sh.cols?.length ?? 0, ...sh.rows.map((r) => r.length), 1);
  const nRows = Math.max(sh.rows.length, 1);
  let out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<dimension ref="A1:${cellRef(nRows - 1, nCols - 1)}"/>`;
  /* Хөлдөөлт — `sheetViews` нь `sheetFormatPr`/`cols`/`sheetData`-аас ӨМНӨ (элементийн дараалал спецээр хатуу) */
  const fr = sh.frozen;
  if (fr && (fr.rows > 0 || fr.cols > 0)) {
    const pane = fr.rows > 0 && fr.cols > 0 ? "bottomRight" : fr.rows > 0 ? "bottomLeft" : "topRight";
    out += '<sheetViews><sheetView workbookViewId="0">'
      + `<pane${fr.cols > 0 ? ` xSplit="${fr.cols}"` : ""}${fr.rows > 0 ? ` ySplit="${fr.rows}"` : ""}`
      + ` topLeftCell="${cellRef(fr.rows, fr.cols)}" activePane="${pane}" state="frozen"/>`
      + `<selection pane="${pane}" activeCell="${cellRef(fr.rows, fr.cols)}" sqref="${cellRef(fr.rows, fr.cols)}"/>`
      + "</sheetView></sheetViews>";
  } else {
    out += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  }
  out += '<sheetFormatPr defaultRowHeight="15"/>';
  if (sh.cols?.some((w) => w != null)) {
    out += "<cols>";
    sh.cols.forEach((w, i) => {
      if (w != null && w > 0) out += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    });
    out += "</cols>";
  }
  out += "<sheetData>";
  sh.rows.forEach((row, r) => {
    let cells = "";
    row.forEach((cell, c) => { cells += cellXml(r, c, cell, reg); });
    if (cells) out += `<row r="${r + 1}">${cells}</row>`;
  });
  out += "</sheetData>";
  if (sh.merges?.length) {
    out += `<mergeCells count="${sh.merges.length}">`;
    for (const m of sh.merges) out += `<mergeCell ref="${cellRef(m.r1, m.c1)}:${cellRef(m.r2, m.c2)}"/>`;
    out += "</mergeCells>";
  }
  out += "</worksheet>";
  return out;
}

/* ── ZIP (STORE) ── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

type ZipEntry = { name: string; data: Uint8Array };

/** ZIP архив — STORE арга, UTF-8 нэр, local header + central directory + EOCD */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  /* ⚠️ Тогтмол огноо (1980-01-01 00:00) — гаралт детерминистик, шалгуур байт тулгаж болно */
  const dosTime = 0;
  const dosDate = (1 << 5) | 1;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);        // хувилбар 2.0
    dv.setUint16(6, 0x0800, true);    // UTF-8 нэр
    dv.setUint16(8, 0, true);         // STORE
    dv.setUint16(10, dosTime, true);
    dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, e.data.length, true);
    dv.setUint32(22, e.data.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, e.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);        // made by
    cv.setUint16(6, 20, true);        // needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);        // extra
    cv.setUint16(32, 0, true);        // comment
    cv.setUint16(34, 0, true);        // disk
    cv.setUint16(36, 0, true);        // int attr
    cv.setUint32(38, 0, true);        // ext attr
    cv.setUint32(42, offset, true);   // local header offset
    cd.set(name, 46);
    central.push(cd);
    offset += lh.length + e.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of [...parts, ...central, eocd]) { out.set(b, p); p += b.length; }
  return out;
}

/* ── Workbook ── */

/** Хуудсуудыг .xlsx (ZIP) байт болгоно */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (!sheets.length) throw new Error("xlsx: хуудас алга");
  const reg = newStyleReg();
  /* Нэр давхардахгүй, Excel-ийн дүрэмд нийцнэ */
  const names: string[] = [];
  for (const sh of sheets) {
    const base = sheetName(sh.name);
    let n = base;
    let i = 2;
    while (names.some((x) => x.toLowerCase() === n.toLowerCase())) {
      const suf = ` (${i++})`;
      n = base.slice(0, 31 - suf.length) + suf;
    }
    names.push(n);
  }
  const sheetXmls = sheets.map((sh) => sheetXml(sh, reg));

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
    + "</Types>";
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + "</Relationships>";
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + "<sheets>"
    + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
    + "</sheets></workbook>";
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + "</Relationships>";

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    /* ⚠️ styles.xml нь хуудсуудыг угсарсны ДАРАА — загварын бүртгэл тэр үед л бүрэн */
    { name: "xl/styles.xml", data: enc.encode(stylesXml(reg)) },
    ...sheetXmls.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(x) })),
  ];
  return zipStore(entries);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Байтыг файл болгон татна (хөтөчид л) — `csvFile.downloadText`-ийн загвар, зөвхөн Blob нь хоёртын.
 * ⚠️ `Uint8Array` → `Blob`: TS 5.7-ийн `ArrayBufferLike` төрлөөс болж `.buffer`-ийг шууд өгөхгүй,
 *    `slice()`-аар шинэ `ArrayBuffer` авна.
 * ⚠️ 2026-10-15: `mime` параметртэй болов — .docx (`lib/agent/reportDocx.ts`) ч ижил ZIP
 *    бичигчээр үүсдэг тул татах кодыг хуулахгүй. Анхдагч нь ХУУЧНААР .xlsx.
 */
export function downloadXlsx(filename: string, bytes: Uint8Array, mime: string = XLSX_MIME): void {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([ab], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

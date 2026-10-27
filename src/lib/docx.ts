/**
 * ХАМГИЙН БАГА .docx (WordprocessingML) БИЧИГЧ — гадаад санг ашиглахгүй.
 *
 * ⚠️ `xlsx.ts`-ийн толгойд тэмдэглэсэн шийдвэр: баримтын npm сан (docx, jszip …)
 *    НЭМЭХГҮЙ, OOXML-ийг гараар угсарна. .docx нь ZIP тул `zipStore`-ыг дахин ашиглана.
 * ⚠️ Бүтэц нь Khorshoo_loan-ийн `lib/report.ts`-ийн Word тайлантай ижил:
 *    гарчиг → огноо → шүүлтийн нөхцөл → дугаарласан бүлэг (гарчиг · тайлбар · хүснэгт).
 *    Хүснэгтийн толгой `E2EAEE` дэвсгэртэй, Times New Roman.
 * ⚠️ XML-д хориотой удирдлагын тэмдэгтийг (`\u0000-\u0008` г.м.) ХАСНА — дэлгэцийн
 *    текстэд тааралдвал Word файлыг «эвдэрсэн» гэж нээхгүй.
 */
import { esc, zipStore } from './xlsx';
import { chartDrawing, chartXml, type DocChartSpec } from './docxChart';

export type DocCell = string;

export type DocBlock =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  /** `keep` — дараагийн блоктой нэг хуудсанд (графикийн/хүснэгтийн нэр · тайлбар салахгүй) */
  | { kind: 'p'; text: string; bold?: boolean; italic?: boolean; size?: number; color?: string; center?: boolean; keep?: boolean }
  | { kind: 'table'; head: DocCell[][]; rows: DocCell[][] }
  | { kind: 'img'; png: Uint8Array; w: number; h: number; caption?: string }
  /** Word-ийн жинхэнэ график (`docxChart`) — өнгө нь 6 оронтой HEX */
  | { kind: 'chart'; spec: DocChartSpec; caption?: string };

/* A4 босоо · 1.76 см захын зай (twip) */
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1000;
const CONTENT_W = PAGE_W - 2 * MARGIN;
/* twip → EMU (1 twip = 635 EMU) */
const MAX_IMG_W = CONTENT_W * 635;
/* ⚠️ 2026-10-19 (хэрэглэгч: «page 1 сул зайг янзал»): 0.62 → 0.42 — өндөр зураг (газрын зураг) хуудасны
   үлдсэн зайд багтахгүй бол Word дараагийн хуудас руу түлхэж, өмнөх хуудсанд том хоосон зай үлддэг байв */
const MAX_IMG_H = (PAGE_H - 2 * MARGIN) * 635 * 0.42;
const HDR_FILL = 'E2EAEE';
const FONT = 'Times New Roman';

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

/** Тоо шиг харагдах нүд баруун тийш тэгшилнэ (Khorshoo-гийн `rightCols`-ийн оронд) */
export const NUMERIC = /^[−\-+]?\(?[\d\s.,]+\)?\s*(%|₮|төг|сая|тэрбум|их наяд|км|м²|м2|м|га|ш|хүн|кВт|т)?\.?$/;

function run(text: string, o: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {}): string {
  const rPr = [
    o.bold ? '<w:b/>' : '',
    o.italic ? '<w:i/>' : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '',
  ].join('');
  /* Мөр таслалт → `<w:br/>` */
  return clean(text).split('\n').map((line, i) =>
    `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`,
  ).join('');
}

function para(text: string, o: { bold?: boolean; italic?: boolean; size?: number; color?: string; center?: boolean; style?: string; right?: boolean; after?: number; keep?: boolean } = {}): string {
  const pPr = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
    o.keep ? '<w:keepNext/>' : '',
    o.after != null ? `<w:spacing w:before="0" w:after="${o.after}"/>` : '',
    o.center ? '<w:jc w:val="center"/>' : o.right ? '<w:jc w:val="right"/>' : '',
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${run(text, o)}</w:p>`;
}

function table(head: DocCell[][], rows: DocCell[][]): string {
  const cols = Math.max(1, ...head.map((r) => r.length), ...rows.map((r) => r.length));
  /* Олон баганатай хүснэгтэд үсгийг жижигрүүлнэ — A4 босоо хуудсанд багтаана */
  const size = cols > 9 ? 13 : cols > 6 ? 15 : 18;
  const colW = Math.floor(CONTENT_W / cols);
  const cell = (t: string, hdr: boolean) => {
    const v = t.trim();
    return '<w:tc><w:tcPr>'
      + `<w:tcW w:w="${colW}" w:type="dxa"/>`
      + (hdr ? `<w:shd w:val="clear" w:color="auto" w:fill="${HDR_FILL}"/>` : '')
      + '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tcMar>'
      + '</w:tcPr>'
      + para(v, { bold: hdr, size, after: 0, right: !hdr && NUMERIC.test(v) })
      + '</w:tc>';
  };
  const pad = (r: DocCell[]) => [...r, ...Array(Math.max(0, cols - r.length)).fill('')];
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="A6B0B6"/>`;
  return '<w:tbl><w:tblPr>'
    + '<w:tblW w:w="5000" w:type="pct"/>'
    + `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + '<w:tblLayout w:type="autofit"/>'
    + '</w:tblPr>'
    + `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`
    + head.map((r) => `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${pad(r).map((c) => cell(c, true)).join('')}</w:tr>`).join('')
    + rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${pad(r).map((c) => cell(c, false)).join('')}</w:tr>`).join('')
    + '</w:tbl>'
    /* Хүснэгтийн дараах зай (дараалсан хоёр хүснэгт нийлэхгүй) */
    + para('', { after: 120 });
}

function image(rid: string, id: number, wPx: number, hPx: number, keep = false): string {
  /* px → EMU (96 dpi), хуудсанд багтаана */
  let cx = Math.round(wPx * 9525);
  let cy = Math.round(hPx * 9525);
  const k = Math.min(1, MAX_IMG_W / cx, MAX_IMG_H / cy);
  cx = Math.round(cx * k);
  cy = Math.round(cy * k);
  /* `keep` — доорх тайлбартайгаа нэг хуудсанд (2026-10-19) */
  return `<w:p><w:pPr>${keep ? '<w:keepNext/>' : ''}<w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:docPr id="${id}" name="Зураг ${id}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="mn-MN"/></w:rPr></w:rPrDefault>`
  + '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  /* `outlineLvl` — Word-ийн «Navigation pane» ба агуулгын жагсаалтад гарна */
  + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
  + '<w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="111111"/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
  + '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="222222"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
  + '<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="333333"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>'
  + '</w:styles>';

/** Графикийн хэмжээ (EMU) — дугуй нь нарийн, багана/муруй бүтэн өргөн, хэвтээ багана мөрийн тоогоор */
function chartSize(c: DocChartSpec): [number, number] {
  const IN = 914400;
  const w = Math.min(MAX_IMG_W, Math.round(6.4 * IN));
  if (c.small) {
    if (c.type === 'doughnut') return [Math.round(4.0 * IN), Math.round(2.2 * IN)];
    if (c.type === 'bar') return [Math.round(4.8 * IN), Math.round(Math.min(3.6, Math.max(1.6, 0.5 + c.cats.length * 0.22)) * IN)];
    return [Math.round(4.8 * IN), Math.round(2.4 * IN)];
  }
  if (c.type === 'doughnut') return [Math.round(5.2 * IN), Math.round(2.9 * IN)];
  if (c.type === 'bar') return [w, Math.round(Math.min(7, Math.max(2.2, 0.75 + c.cats.length * 0.32)) * IN)];
  return [w, Math.round(3.2 * IN)];
}

const enc = new TextEncoder();

/** Блокуудыг .docx байт болгоно */
export function buildDocx(blocks: DocBlock[]): Uint8Array {
  const media: { name: string; rid: string; data: Uint8Array }[] = [];
  const charts: { name: string; rid: string; xml: string }[] = [];
  const body = blocks.map((b) => {
    switch (b.kind) {
      case 'h': return para(b.text, { style: `Heading${b.level}` });
      case 'p': return para(b.text, b);
      case 'table': return b.head.length || b.rows.length ? table(b.head, b.rows) : '';
      case 'img': {
        const n = media.length + 1;
        const rid = `rIdImg${n}`;
        media.push({ name: `image${n}.png`, rid, data: b.png });
        return image(rid, n, b.w, b.h, !!b.caption) + (b.caption ? para(b.caption, { italic: true, size: 17, center: true, color: '555555' }) : '');
      }
      case 'chart': {
        if (!b.spec.cats.length || !b.spec.series.length) return '';
        const n = charts.length + 1;
        const rid = `rIdChart${n}`;
        charts.push({ name: `chart${n}.xml`, rid, xml: chartXml(b.spec) });
        const [cx, cy] = chartSize(b.spec);
        /* ⚠️ docPr id нь зурагтай давхцахгүй (зураг 1…N, график 1000+) */
        return chartDrawing(rid, 1000 + n, cx, cy) + (b.caption ? para(b.caption, { italic: true, size: 17, center: true, color: '555555' }) : '');
      }
    }
  }).join('');

  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<w:body>${body}<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>`
    + `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="500" w:footer="500" w:gutter="0"/>`
    + '</w:sectPr></w:body></w:document>';

  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + charts.map((c) => `<Override PartName="/word/charts/${c.name}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')
    + charts.map((c) => `<Relationship Id="${c.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/${c.name}"/>`).join('')
    + '</Relationships>';

  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(doc) },
    { name: 'word/styles.xml', data: enc.encode(STYLES) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
    ...charts.map((c) => ({ name: `word/charts/${c.name}`, data: enc.encode(c.xml) })),
  ]);
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function downloadDocx(filename: string, bytes: Uint8Array): void {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([ab], { type: DOCX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

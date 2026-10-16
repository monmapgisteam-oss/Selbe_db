/**
 * AI ТУСЛАХЫН ТАЙЛАН — Word (.docx).
 *
 * ⚠️ ШИНЭ САН НЭМЭХГҮЙ (төслийн дүрэм — `xlsx.ts`-ийн ⚠️): WordprocessingML-ийг
 * гараар угсарч, `xlsx.ts`-ийн ZIP бичигчээр (`zipStore`, STORE арга) багцална.
 * `docx`/`docxtemplater` зэрэг сан нь хэдэн зуун КБ + аюулгүй байдлын гадаргуу.
 *
 * ⚠️ ХАМГИЙН БАГА БҮРЭЛДЭХҮҮН: Word нээхийн тулд `[Content_Types].xml`,
 * `_rels/.rels`, `word/document.xml` ба `word/styles.xml` (+ түүний холбоос)
 * ХАНГАЛТТАЙ. Нэмэх бүрд Word-ийн «агуулга уншигдахгүй байна» эрсдэл өснө.
 *
 * ⚠️ ЖАГСААЛТЫГ `numbering.xml`-ГҮЙ бичнэ — тэмдэг (•) ба догол мөрийн зайгаар.
 *    Жинхэнэ дугаарлалт нь бүхэл нэг XML хэсэг нэмдэг бөгөөд уншигчид ялгаа
 *    өгөхгүй; оронд нь файлын эвдрэх эрсдэл буурна.
 *
 * ⚠️ ₮ тэмдэг Word-д ХЭВЭЭР (PDF-ийн Roboto-гийн асуудал энд байхгүй).
 */

import { t as tr } from '@/lib/i18nCore';
import { esc, zipStore } from '@/lib/xlsx';
import { headingOf, type MdBlock } from './blocks';
import type { ReportDoc } from './report';

const enc = new TextEncoder();
const file = (name: string, xml: string) => ({ name, data: enc.encode(xml) });

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Тэмдэглэгээг арилгасан цэвэр текст */
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

/** Нэг гүйлт (run) — `xml:space` ЗААВАЛ, эс бөгөөс Word захын зайг иднэ */
const run = (t: string, bold = false) =>
  `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;

/** `**тод**` ба кодын тэмдэглэгээг гүйлт болгоно */
function runs(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((p) => {
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return run(p.slice(2, -2), true);
      if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return run(p.slice(1, -1));
      return run(p);
    })
    .join('');
}

type ParaOpt = { style?: string; indent?: number };

const para = (inner: string, o: ParaOpt = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}`
  + `${o.indent ? `<w:ind w:left="${o.indent}"/>` : ''}</w:pPr>${inner}</w:p>`;

/** Нүд — толгой мөр нь саарал дэвсгэртэй, тод */
function cell(text: string, headRow: boolean): string {
  return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>'
    + (headRow ? '<w:shd w:val="clear" w:color="auto" w:fill="F0EFEC"/>' : '')
    + '</w:tcPr>'
    + para(run(plain(text), headRow), { style: 'Cell' })
    + '</w:tc>';
}

function table(head: string[], rows: string[][]): string {
  const cols = Math.max(head.length, ...rows.map((r) => r.length));
  const line = (cs: string[], headRow: boolean) =>
    `<w:tr>${Array.from({ length: cols }, (_, i) => cell(cs[i] ?? '', headRow)).join('')}</w:tr>`;
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="C3C2B7"/>`)
    .join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
    + `<w:tblBorders>${border}</w:tblBorders>`
    + '<w:tblLayout w:type="autofit"/></w:tblPr>'
    + line(head, true)
    + rows.map((r) => line(r, false)).join('')
    + '</w:tbl>'
    /* ⚠️ Хүснэгтийн ДАРАА хоосон догол мөр — хоёр хүснэгт зэрэгцвэл Word нэгтгэчихдэг */
    + '<w:p/>';
}

function blockXml(b: MdBlock): string {
  const h = headingOf(b);
  if (h) return para(run(h, true), { style: 'Heading3' });

  if (b.kind === 'para') return para(runs(b.text));

  if (b.kind === 'list') {
    return b.items
      .map((it, i) => para(run(b.ordered ? `${i + 1}. ` : '• ') + runs(it), { indent: 283 }))
      .join('');
  }

  if (b.kind === 'table') return table(b.head, b.rows);

  if (b.kind === 'chart' && b.spec) {
    const s = b.spec;
    /* ⚠️ Word-д диаграм зурахгүй — ӨГӨГДЛИЙН ХҮСНЭГТ (хэрэглэгч өөрөө диаграм
       хийх боломжтой). PDF-д график зурагддаг. */
    return (s.title ? para(run(s.title, true), { style: 'Heading3' }) : '')
      + table(
        [tr('Шошго'), s.unit ? `${tr('Утга')}, ${s.unit}` : tr('Утга')],
        s.data.map((d) => [d.label, d.value == null ? '' : String(d.value)]),
      )
      + (s.note ? para(run(s.note), { style: 'Note' }) : '');
  }

  return '';
}

const STYLES = `${XML}
<w:styles xmlns:w="${W_NS}">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>
<w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="898781"/><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Cell"><w:name w:val="Cell"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/>
<w:rPr><w:color w:val="898781"/><w:sz w:val="16"/></w:rPr></w:style>
</w:styles>`;

const CONTENT_TYPES = `${XML}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** A4, 2 см захтай хуудас */
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
  + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/></w:sectPr>';

export function buildChatDocx(doc: ReportDoc): Uint8Array {
  const body = [
    para(run(doc.title, true), { style: 'Title' }),
    para(run(`${tr('Сэлбэ 20 минутын хот · AI туслах')} · ${doc.date}`), { style: 'Subtitle' }),
    ...doc.blocks.map(blockXml),
  ].join('');

  const document = `${XML}\n<w:document xmlns:w="${W_NS}"><w:body>${body}${SECT}</w:body></w:document>`;

  return zipStore([
    file('[Content_Types].xml', CONTENT_TYPES),
    file('_rels/.rels', RELS),
    file('word/_rels/document.xml.rels', DOC_RELS),
    file('word/document.xml', document),
    file('word/styles.xml', STYLES),
  ]);
}

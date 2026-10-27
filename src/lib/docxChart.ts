/**
 * Word-ийн ЖИНХЭНЭ график (DrawingML chart) — `word/charts/chartN.xml`.
 *
 * ⚠️ 2026-10-19 (хэрэглэгч: «тэр графикийг зургаар биш, аятайхан графикаар оруул»): дэлгэцийн
 *    Ring · Donut · Series · Trend нь өмнө нь PNG зураг болж ордог байв. Одоо компонент бүр өөрийн
 *    өгөгдлийг `data-report-chart` (энэ төрөл, JSON) атрибутаар өгч, тайлан Word-ийн график угсарна —
 *    Word дотор томруулахад бүдгэрэхгүй, өнгө, шошго, тайлбар нь засагдана.
 * ⚠️ Хүснэгтийн ӨГӨГДӨЛ (embedded xlsx) ХАВСАРГАХГҮЙ — утга нь `strCache`/`numCache`-д. Word график
 *    зурна; «Edit Data» дарвал өгөгдлийн файл алга гэж хэлнэ (санаатай: xlsx үүсгэвэл файл хоёр дахин томорно).
 * ⚠️ `null` утга ЦООРХОЙ — `numCache`-д тэр цэгийг бичихгүй (`dispBlanksAs gap`), 0 гэж зурахгүй.
 * ⚠️ OOXML-ийн элементийн ДАРААЛАЛ хатуу (CT_PieSer · CT_BarSer · CT_LineSer · CT_ValAx) — буруу бол
 *    Word файлыг «уншигдахгүй агуулгатай» гэж нээхгүй. Доорх дараалал схемийнх.
 */
import { esc } from './xlsx';

export type ChartType = 'doughnut' | 'column' | 'bar' | 'line';

export type DocChartSpec = {
  type: ChartType;
  title?: string;
  cats: string[];
  series: { name: string; values: (number | null)[]; color?: string }[];
  /** doughnut · ганц цуваат column/bar: цэг бүрийн өнгө */
  pointColors?: (string | undefined)[];
  /** doughnut: шошгонд хувь (Ring — нийлбэр нь 100) · эс бөгөөс утга */
  pct?: boolean;
  /** doughnut: эдгээр цэгийн шошгыг нуух («Үлдсэн» зүсмэг) */
  hideLabels?: number[];
  /** Жижиг хэмжээ (`docx.chartSize`) — 2026-10-19, Тохиромжтой байдлын тайлан («графикийн хэмжээг багасга») */
  small?: boolean;
};

/** XML-д хориотой удирдлагын тэмдэгтийг хасаад escape (`docx.clean`-тэй ижил) */
const txt = (x: string) => esc(x.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''));
const FALLBACK = ['2F6FB0', 'E08A2C', '3E9B5B', 'C8463D', '7C5CC4', '2A9BA8', 'B5893A', '6B7280'];
const hex = (c: string | undefined, i: number) => (c && /^[0-9A-F]{6}$/i.test(c) ? c.toUpperCase() : FALLBACK[i % FALLBACK.length]);
const fill = (c: string) => `<c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></c:spPr>`;
const col = (i: number) => String.fromCharCode(66 + (i % 24)); // B, C, …

function strCache(f: string, xs: string[]): string {
  return `<c:strRef><c:f>${f}</c:f><c:strCache><c:ptCount val="${xs.length}"/>`
    + xs.map((x, i) => `<c:pt idx="${i}"><c:v>${txt(x)}</c:v></c:pt>`).join('')
    + '</c:strCache></c:strRef>';
}
function numCache(f: string, xs: (number | null)[]): string {
  return `<c:numRef><c:f>${f}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${xs.length}"/>`
    + xs.map((x, i) => (x == null || !Number.isFinite(x) ? '' : `<c:pt idx="${i}"><c:v>${x}</c:v></c:pt>`)).join('')
    + '</c:numCache></c:numRef>';
}
const txPr = (sz: number, bold = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="333333"/></a:solidFill>`
  + '<a:latin typeface="Times New Roman"/><a:cs typeface="Times New Roman"/></a:defRPr></a:pPr><a:endParaRPr lang="mn-MN"/></a:p></c:txPr>';

function dLbls(o: { val?: boolean; pct?: boolean; pos?: string; hide?: number[] }): string {
  return '<c:dLbls>'
    + (o.hide ?? []).map((i) => `<c:dLbl><c:idx val="${i}"/><c:delete val="1"/></c:dLbl>`).join('')
    + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(900, true)
    + (o.pos ? `<c:dLblPos val="${o.pos}"/>` : '')
    + `<c:showLegendKey val="0"/><c:showVal val="${o.val ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/>`
    + `<c:showPercent val="${o.pct ? 1 : 0}"/><c:showBubbleSize val="0"/>`
    + (o.pct !== undefined ? '<c:showLeaderLines val="0"/>' : '')
    + '</c:dLbls>';
}

function ser(s: DocChartSpec, i: number, kind: 'pie' | 'bar' | 'line'): string {
  const x = s.series[i];
  const n = s.cats.length;
  const c = hex(x.color, i);
  const tx = `<c:tx>${strCache(`Sheet1!$${col(i)}$1`, [x.name])}</c:tx>`;
  const cat = `<c:cat>${strCache(`Sheet1!$A$2:$A$${n + 1}`, s.cats)}</c:cat>`;
  const val = `<c:val>${numCache(`Sheet1!$${col(i)}$2:$${col(i)}$${n + 1}`, x.values)}</c:val>`;
  const pts = (inv: boolean) => (s.pointColors && s.series.length === 1
    ? s.cats.map((_, k) => `<c:dPt><c:idx val="${k}"/>${inv ? '<c:invertIfNegative val="0"/>' : ''}<c:bubble3D val="0"/>${fill(hex(s.pointColors![k], k))}</c:dPt>`).join('')
    : '');
  const head = `<c:idx val="${i}"/><c:order val="${i}"/>${tx}`;
  if (kind === 'pie') {
    return `<c:ser>${head}<c:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>${pts(false)}`
      + `${dLbls({ val: !s.pct, pct: !!s.pct, hide: s.hideLabels })}${cat}${val}</c:ser>`;
  }
  if (kind === 'bar') {
    return `<c:ser>${head}${fill(c)}<c:invertIfNegative val="0"/>${pts(true)}${dLbls({ val: true, pos: 'outEnd' })}${cat}${val}</c:ser>`;
  }
  return `<c:ser>${head}<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:round/></a:ln></c:spPr>`
    + `<c:marker><c:symbol val="circle"/><c:size val="5"/>${fill(c)}</c:marker>`
    + `${dLbls({ val: n <= 14, pos: 't' })}${cat}${val}<c:smooth val="0"/></c:ser>`;
}

const AX_CAT = 50010;
const AX_VAL = 50020;
function axes(horizontal: boolean, fmt: string): string {
  const line = '<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="BFC5CA"/></a:solidFill></a:ln></c:spPr>';
  return `<c:catAx><c:axId val="${AX_CAT}"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling>`
    + `<c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/>`
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${line}${txPr(900)}`
    + `<c:crossAx val="${AX_VAL}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="${AX_VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>`
    + `<c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E7EA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`
    + `<c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
    + `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}<c:crossAx val="${AX_CAT}"/><c:crosses val="autoZero"/>`
    + `<c:crossBetween val="between"/></c:valAx>`;
}

/** Нэг графикийн бүтэн `chartSpace` XML */
export function chartXml(s: DocChartSpec): string {
  const idx = s.series.map((_, i) => i);
  /* ⚠️ Тэнхлэгийн тоо: «#,##0.##» нь бүхэл утганд «35.» гэж цэг үлдээдэг (Word) — бүхэл/бутархайгаар сонгоно */
  const fmt = s.series.every((x) => x.values.every((v) => v == null || Number.isInteger(v))) ? '#,##0' : '#,##0.0';
  let plot: string;
  if (s.type === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${idx.map((i) => ser(s, i, 'pie')).join('')}`
      + '<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>';
  } else if (s.type === 'line') {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${idx.map((i) => ser(s, i, 'line')).join('')}`
      + `<c:marker val="1"/><c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/></c:lineChart>${axes(false, fmt)}`;
  } else {
    const h = s.type === 'bar';
    plot = `<c:barChart><c:barDir val="${h ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>`
      + `${idx.map((i) => ser(s, i, 'bar')).join('')}<c:gapWidth val="70"/>`
      + `<c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/></c:barChart>${axes(h, fmt)}`;
  }
  const title = s.title
    ? '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr>'
      + `<a:r><a:rPr lang="mn-MN" sz="1100" b="1"><a:latin typeface="Times New Roman"/><a:cs typeface="Times New Roman"/></a:rPr><a:t>${txt(s.title)}</a:t></a:r></a:p></c:rich></c:tx>`
      + '<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>'
    : '<c:autoTitleDeleted val="1"/>';
  /* Тайлбар: олон цуваа эсвэл дугуй графикт л (ганц цуваат баганад нэр нь гарчигтай давхардана) */
  const legend = s.type === 'doughnut' || s.series.length > 1
    ? `<c:legend><c:legendPos val="${s.type === 'doughnut' ? 'r' : 'b'}"/><c:overlay val="0"/>${txPr(900)}</c:legend>`
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:roundedCorners val="0"/>'
    + `<c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}`
    + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
    + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>'
    + txPr(1000)
    + '</c:chartSpace>';
}

/** Баримт доторх байрлал (`<w:drawing>` inline) — өргөн EMU-гээр */
export function chartDrawing(rid: string, id: number, cx: number, cy: number): string {
  return '<w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="График ${id}"/><wp:cNvGraphicFramePr/>`
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
    + `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/>`
    + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

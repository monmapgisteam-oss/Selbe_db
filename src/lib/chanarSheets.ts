import type { MaRow } from '@/lib/ma';
import type { MirRow, CheckMark } from '@/lib/mir';

/**
 * ЧАНАРЫН БАРИМТЫН ЦААСАН ХЭЛБЭР (2026-10-09, хэрэглэгч: «шат бүр дээр дарж popup-д мэдээлэл, PDF руу
 * switch хийх товч — жинхэнэ баримтын дагуу яг ижил харагдана, хэвлэх боломжтой, гарын үсэг зурах хэсэгтэй»).
 *
 * Survey123-аар бөглөгдсөн MA · MIR-ийг `docs/chanar/{MA,MIR}/*.pdf` дахь цаасан маягтын ЗАГВАРААР
 * A4 HTML болгоно. Нэг HTML-ийг цонхонд (`<iframe srcdoc>`) харуулж, ЯГ ТЭРИЙГ хэвлэнэ — харсан =
 * хэвлэсэн. Гарын үсгийн нүд ХООСОН (цаасан дээр зурна).
 *
 * ⚠️ Бүх утга `esc()`-ээр — Survey123-ийн чөлөөт текст HTML-д шууд орохгүй (XSS).
 * ⚠️ Хэвлэлтийн CSS энэ баримтын ДОТОР (CSS module биш) — `next build`-ийн pure дүрэм хамаарахгүй.
 */
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const day = (ms: number | null) => (ms == null ? '' : new Date(ms).toLocaleDateString('sv-SE'));
const dot = (ms: number | null) => (ms == null ? '' : day(ms).replace(/-/g, '.'));

const CSS = `
@page { size: A4; margin: 14mm 14mm 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #e9e9e9; color: #111; font-family: Arial, 'Segoe UI', sans-serif; font-size: 10.5pt; }
.page { width: 210mm; min-height: 297mm; margin: 10px auto; padding: 14mm 14mm 12mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); position: relative; }
.page + .page { page-break-before: always; }
@media print { html, body { background: #fff; } .page { margin: 0; box-shadow: none; width: auto; min-height: auto; padding: 0; } }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.top img { height: 46px; }
.org { text-align: right; font-weight: 700; font-size: 10pt; }
.org small { display: block; font-weight: 400; color: #1f4e79; margin-top: 6px; }
.title { display: flex; align-items: flex-end; gap: 14px; border-bottom: 2px solid #333; padding-bottom: 6px; margin-bottom: 10px; }
.title h1 { margin: 0; font-size: 15pt; letter-spacing: .3px; }
.title h1 small { display: block; font-size: 11pt; font-weight: 400; color: #8a9bb0; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #555; padding: 4px 6px; vertical-align: middle; }
th { font-weight: 700; }
.navy th, .navy td.h { background: #1f3864; color: #fff; font-weight: 700; }
.band td { background: #1f3864; color: #fff; font-weight: 700; padding: 3px 6px; }
.lbl { width: 32%; }
.c { text-align: center; }
.A { background: #ddebf7; font-weight: 700; text-align: center; width: 22%; }
.AN { background: #c6e0b4; font-weight: 700; text-align: center; }
.R { background: #f4b183; font-weight: 700; text-align: center; }
.anBand td { background: #c6e0b4; font-weight: 700; }
.rBand td { background: #f4b183; font-weight: 700; }
.box { height: 30mm; vertical-align: top; white-space: pre-wrap; }
.sig td { height: 15mm; }
.sig .who small { display: block; margin-top: 8px; }
.mark { font-size: 13pt; font-weight: 700; text-align: center; }
.hdr td { border: 0; padding: 3px 4px; vertical-align: top; }
.hdr b { display: block; }
.hdr small { color: #8a9bb0; }
.sec { background: #e7e9ee; font-weight: 700; padding: 3px 6px; margin: 8px 0 4px; }
.sec small { color: #8a9bb0; font-weight: 400; }
.chk th { background: #f3f4f6; font-size: 9pt; }
.chk td.k { text-align: center; width: 11mm; font-weight: 700; }
.remarks { border: 1px solid #555; min-height: 40mm; padding: 6px; white-space: pre-wrap; }
.att { margin: 8px 0; }
.att span { display: inline-block; margin-right: 16px; }
.sig3 { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #555; margin-top: 10px; }
.sig3 > div { border-right: 1px solid #555; }
.sig3 > div:last-child { border-right: 0; }
.sig3 h4 { margin: 0; padding: 4px 6px; background: #e7e9ee; font-size: 9pt; }
.sig3 p { margin: 0; padding: 4px 6px; border-top: 1px solid #ccc; min-height: 9mm; font-size: 9pt; }
.sig3 p small { display: block; color: #8a9bb0; }
.foot { position: absolute; right: 14mm; bottom: 8mm; font-size: 8.5pt; color: #555; }
@media print { .foot { position: static; text-align: right; margin-top: 10px; } }
.photos { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; border: 1px solid #555; padding: 6mm; }
.photos figure { margin: 0; }
.photos img { width: 100%; height: 70mm; object-fit: cover; border: 1px solid #ccc; }
.photos figcaption { font-size: 9pt; color: #333; margin-top: 2px; }
`;

const wrap = (title: string, pages: string) =>
  `<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${pages}</body></html>`;

/* ═══════════════ MA — материал баталгаажуулалтын ХАРИУ ═══════════════ */
export function maSheetHtml(r: MaRow, logo: string): string {
  const tick = (v: string) => (r.verdict === v ? '+' : '');
  const page = `
<div class="page">
  <div class="top"><img src="${esc(logo)}" alt=""><div class="org">"СЭЛБЭ ХОРИН МИНУТЫН ХОТ КОРПОРАЦ" ХХК<small>Сэлбэ дэд төв орон сууцжуулах төсөл</small></div></div>
  <table>
    <tr class="navy"><th>Хариу бичгийн дугаар</th><td class="h c">${esc(r.respNo)}</td><th class="c">Он сар өдөр</th><td class="h c">${esc(day(r.respDate))}</td></tr>
    <tr><td>Гүйцэтгэгч:</td><td colspan="3" class="c">${esc(r.contractor)}</td></tr>
    <tr><td>Баримт бичгийн дугаар:</td><td colspan="3" class="c">${esc(r.subDocNo)}</td></tr>
    <tr><td>Баримт бичгийн нэр:</td><td colspan="3" class="c">${esc(r.material)}</td></tr>
    <tr><td>Захиалагчид ирсэн огноо:</td><td colspan="3" class="c">${esc(dot(r.recvDate))}</td></tr>
    <tr class="band"><td colspan="4">ЗАХИАЛАГЧИЙН ХАРИУ</td></tr>
    <tr><td colspan="2">Татгалзаагүй мэдэгдэл</td><td class="mark">${tick('A')}</td><td class="A">A</td></tr>
    <tr><td colspan="2">Санал бүхий татгалзаагүй мэдэгдэл</td><td class="mark">${tick('AN')}</td><td class="AN">AN</td></tr>
    <tr><td colspan="2">Татгалзсан мэдэгдэл</td><td class="mark">${tick('R')}</td><td class="R">R</td></tr>
    <tr class="anBand"><td colspan="4">[AN] САНАЛ БҮХИЙ ТАТГАЛЗААГҮЙ МЭДЭГДЛИЙН САНАЛ</td></tr>
    <tr><td colspan="4" class="box">${esc(r.anNote)}</td></tr>
    <tr class="rBand"><td colspan="4">[R] ТАТГАЛЗСАН МЭДЭГДЛИЙН ШАЛТГААН</td></tr>
    <tr><td colspan="4" class="box">${esc(r.rReason)}</td></tr>
    <tr class="band"><td colspan="4">ХАРИУ ХҮРГҮҮЛСЭН ЗАХИАЛАГЧИЙН ТӨЛӨӨЛӨГЧ</td></tr>
    <tr><td></td><th class="c">Албан тушаал, нэр</th><th class="c">Гарын үсэг</th><td></td></tr>
    <tr class="sig"><td>Зөвшөөрсөн:</td><td class="who">${esc(r.apprPos || 'Чанарын хэлтсийн менежер')}:<small>${esc(r.apprName)}</small></td><td></td><td></td></tr>
    <tr class="sig"><td>Хянасан:</td><td class="who">${esc(r.revPos)}<small>${esc(r.revName)}</small></td><td></td><td></td></tr>
    <tr class="sig"><td>Танилцсан:</td><td class="who">${esc(r.ackPos || 'Төслийн удирдлагын хэлтсийн менежер')}:<small>${esc(r.ackName)}</small></td><td></td><td></td></tr>
    <tr class="sig"><td>Боловсруулсан:</td><td class="who">${esc(r.prepPos || 'Чанарын хэлтсийн хяналтын инженер')}:<small>${esc(r.prepName)}</small></td><td></td><td></td></tr>
    <tr class="band"><td colspan="4">ХАРИУ ХҮЛЭЭН АВСАН ГҮЙЦЭТГЭГЧИЙН АЖИЛТАН</td></tr>
    <tr><td></td><th class="c">Албан тушаал, нэр</th><th class="c">Гарын үсэг</th><td></td></tr>
    <tr class="sig"><td>Хүлээн авсан:</td><td class="who">${esc(r.recvByPos)}<small>${esc(r.recvByName)}</small></td><td></td><td></td></tr>
  </table>
</div>`;
  return wrap(r.respNo || 'MA', page);
}

/* ═══════════════ MIR — материалын үзлэг шалгалтын хуудас ═══════════════ */
const MIR_CHECKS = [
  'Зураг төсөлтэй таарч буй эсэх', 'Материал баталгаажуулалт хийгдсэн эсэх', 'Баталгаажуулсан нийлүүлэгч байгууллага зөрөөгүй',
  'Цэвэрхэн/ хэвийн эсэх', 'Горимын дагуу хадгалсан болон хамгаалагдсан эсэх', 'Лабораторийн туршилтын дүн хавсаргасан эсэх',
  'Стандартад заасан хэмжээ, хүлцэх хэмжээндээ байгаа эсэх', 'Гэмтэлгүй эсэх',
];
const ok = (m: CheckMark, want: 'OK' | 'NA') => (m === want ? '✓' : m === 'X' && want === 'OK' ? 'X' : '');

export function mirSheetHtml(m: MirRow, logo: string, photos: { url: string; note: string }[] = []): string {
  const head = (n: number, total: number) => `<div class="foot">Хуудас ${n} Нийт хуудас ${total}</div>`;
  const total = photos.length ? 2 : 1;
  const att = (k: string, l: string) => `<span>${m.attFlags.includes(k) ? '☑' : '☐'} ${l}</span>`;
  const p1 = `
<div class="page">
  <div class="title"><img src="${esc(logo)}" alt="" style="height:46px"><h1>МАТЕРИАЛЫН ҮЗЛЭГ ШАЛГАЛТЫН ХУУДАС<small>Material inspection checklist</small></h1></div>
  <table class="hdr">
    <tr><td><b>Төслийн нэр</b><small>/Project Name:</small></td><td>Сэлбэ дэд төвийн орон сууцны иж бүрэн цогцолбор хорооллын төсөл</td>
        <td><b>Баримт бичгийн дугаар</b><small>/FIC No:</small></td><td>${esc(m.docNo)}</td></tr>
    <tr><td><b>Захиалагч</b><small>/Client:</small></td><td>"Сэлбэ хорин минутын хот корпорац" ХХК</td>
        <td><b>Багц №</b><small>/packageNo:</small></td><td>${esc(m.pkgLabel)}</td></tr>
    <tr><td><b>Гүйцэтгэгч</b><small>/Contractor:</small></td><td>${esc(m.contractor)}</td>
        <td><b>Барилгын дугаар</b><small>/Building number:</small></td><td>${esc(m.building)}</td></tr>
    <tr><td><b>Огноо</b><small>/Date:</small></td><td>${esc(day(m.date).replace(/-/g, '/'))}</td>
        <td><b>Материалын нэр</b><small>/Material name:</small></td><td>${esc(m.material)}</td></tr>
  </table>
  <div class="sec">1. МАТЕРИАЛЫН ҮЗЛЭГ ШАЛГАЛТ <small>/FIELD CHECK</small></div>
  <div style="font-size:9pt;margin-bottom:4px">“OK” эсвэл “N/A” хэсэгт нэрийнхээ эхний үсгээ тавина уу. Хэрвээ зөвшөөрөгдөхөөргүй бол “X” тэмдэглэгээ хийнэ үү. Хэрвээ нэмэлт тайлбар гарвал, 3-р хэсэгт бичнэ үү.</div>
  <table class="chk">
    <tr><th rowspan="2" style="width:8mm">№</th><th rowspan="2">Шалгах</th><th colspan="2">Гүйцэтгэгч</th><th colspan="2">Захиалагч</th></tr>
    <tr><th>OK</th><th>N/A</th><th>OK</th><th>N/A</th></tr>
    ${MIR_CHECKS.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${esc(c)}</td>
      <td class="k">${ok(m.checks[i]?.[0] ?? null, 'OK')}</td><td class="k">${ok(m.checks[i]?.[0] ?? null, 'NA')}</td>
      <td class="k">${ok(m.checks[i]?.[1] ?? null, 'OK')}</td><td class="k">${ok(m.checks[i]?.[1] ?? null, 'NA')}</td></tr>`).join('')}
  </table>
  <div class="sec">2. ГҮЙЦЭТГЭЛ <small>/COMPLETION</small></div>
  <table>
    <tr><th style="width:8mm">№</th><th>Материалын нэр</th><th>Хэмжих нэгж</th><th>Нийт тоо хэмжээ</th></tr>
    <tr><td class="c">1</td><td class="c">${esc(m.material)}</td><td class="c">${esc(m.unit)}</td><td class="c">${m.qty == null ? '' : esc(m.qty)}</td></tr>
  </table>
  <div class="sec">3. НЭМЭЛТ ТАЙЛБАР, ШААРДЛАГАТАЙ ЗАЛРУУЛАХ АРГА ХЭМЖЭЭ <small>/Additional remark, remedial required action</small></div>
  <div class="remarks">${esc(m.remarks)}</div>
  <div class="att">Хавсралт/<small>Attachments</small>: ${att('lab', 'Лабораторын туршилтын дүн')} ${att('cert', 'Чанарын гэрчилгээ')} ${att('photo', 'Зурган тайлан')} ${att('other', `Бусад ${esc(m.attOther)}`)}</div>
  <div class="sig3">
    ${[['Гүйцэтгэгчийн чанарын инженер', '/Contractor Engineer/ QAQC', m.conQ, m.conQPos],
       ['Захиалагчийн хяналтын инженер', '/Client Engineer', m.cliSup, m.cliSupPos],
       ['Захиалагчийн чанарын инженер', '/Client Engineer/ QAQC', m.cliQ, m.cliQPos]].map(([t, en, n, pos]) => `
    <div><h4>${esc(t)} <small style="color:#8a9bb0;font-weight:400">${esc(en)}</small></h4>
      <p><small>Нэр /Name:</small>${esc(n)}</p><p><small>Албан тушаал /Position:</small>${esc(pos)}</p>
      <p><small>Гарын үсэг /Signature:</small></p><p><small>Огноо /Date:</small></p></div>`).join('')}
  </div>
  ${head(1, total)}
</div>`;
  const p2 = !photos.length ? '' : `
<div class="page">
  <div class="title"><img src="${esc(logo)}" alt="" style="height:46px"><h1>МАТЕРИАЛЫН ФОТО ЗУРАГ<small>Material photo</small></h1></div>
  <div class="sec">Материалын нэр <small>/Material name:</small> ${esc(m.material)}</div>
  <div class="photos">${photos.map((p) => `<figure><img src="${esc(p.url)}" alt=""><figcaption>${esc(p.note)}</figcaption></figure>`).join('')}</div>
  ${head(2, total)}
</div>`;
  return wrap(m.docNo || 'MIR', p1 + p2);
}

/** Шинэ цонхонд нээгээд хэвлэх цонх гаргана (харсан HTML-тэй ЯГ ижил) */
export function printHtml(html: string): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  /* ⚠️ Зураг (лого · фото) ачаалагдсаны дараа хэвлэнэ — эс бөгөөс хоосон дөрвөлжин хэвлэгдэнэ */
  w.addEventListener('load', () => { w.focus(); w.print(); });
}

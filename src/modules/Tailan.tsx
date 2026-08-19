'use client';

/**
 * ТАЙЛАН — «Ерөнхий мэдээлэл» дашбоардын өгөгдлийг БАРИМТ (тайлан) хэлбэрээр.
 *
 * Бүтэц нь захиалагчийн Word жишээ тайлантай ижил: гарчиг · товч танилцуулга ·
 * дугаарласан бүлэг · шинжилгээний өгүүлбэр · дугаартай хүснэгт · дүгнэлт.
 * Ингэснээр энэ хуудсыг шууд ХЭВЛЭХ / PDF болгож, мэйлд хавсаргах боломжтой.
 *
 * ⚠️ ЭНЭ ТАЙЛАНД БЭХЛЭГДСЭН ТОО БАЙХГҮЙ. Үзүүлэлт БҮРЭН ArcGIS-ээс ажиллах
 * үедээ татагдана (`@/lib/reportData`). Урьд нь илтгэлээс гараар хуулсан дүнг
 * ◆ тэмдэгтэй үзүүлдэг байсныг 2026.08.13-нд БҮРМӨСӨН хассан: тайлан уншигч
 * тэр тэмдгийг ойлгохгүй байсан ба эх баримт нь энэ репод байхгүй тул
 * баталгаажуулах боломжгүй байв. Амьд эх сурвалжгүй үзүүлэлтийг (хамрагдах
 * хүн ам, иргэдэд хүрэх үр өгөөж) ХАРУУЛАХГҮЙ — таамаг тоо албан ёсны тайланд
 * орохоос сэргийлнэ.
 *
 * ⚠️ Товч танилцуулга ба дүгнэлтийн ӨГҮҮЛБЭР нь бичигдсэн текст БИШ — амьд
 * тооноос үүснэ. Тиймээс өгөгдөл өөрчлөгдөхөд дүгнэлт нь автоматаар дагаж
 * шинэчлэгдэнэ; гараар засах шаардлагагүй бөгөөд засах ч ёсгүй.
 *
 * ⚠️ Дэлгэц ба PDF (`@/lib/reportPdf`) хоёулаа ЯГ ЭНЭ өгөгдлийг хэрэглэнэ.
 * Хэсэг нэмэх/хасахдаа ХОЁУЛАНГ нь заавал хамт засна.
 */

import { useCallback, useEffect, useState } from 'react';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct } from '@/lib/format';
import { useBagtsTable, type BagtsRow } from '@/modules/Dashboard';
import { emailViaEml, emailViaMailto, downloadReportPdf } from '@/lib/emailReport';
import { useReportExtra, buildFindings, type ReportExtra } from '@/lib/reportData';
import r from './report.module.css';

/** ₮ → тэрбум */
const bn = (v: number) => num(v / 1e9, 1);
/** Тэг өртөг = «нэгж үнэ загварт ороогүй» — 0 гэж бичвэл «үнэгүй» мэт уншигдана */
const bnOrDash = (v: number) => (v > 0 ? bn(v) : '—');

/** Хүснэгтийн дугаартай тайлбар — ХҮСНЭГТИЙН ДЭЭД талд байрлана */
function Cap({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={r.caption}>Хүснэгт {no}. <span>{children}</span></p>;
}

export function Tailan() {
  /** Огноо — ЗӨВХӨН клиент дээр (сервертэй зөрж hydration эвдэхээс сэргийлнэ). */
  const [date, setDate] = useState('');
  useEffect(() => {
    setDate(new Date().toLocaleString('mn-MN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }, []);

  const bagts = useBagtsTable();
  const ex = useReportExtra();
  const rows = bagts.state === 'ready' ? bagts.data : null;
  const extra: ReportExtra | null = ex.state === 'ready' ? ex.data : null;

  /** Мэйл үүсгэх явц — pdfmake динамик ачаалалт хормын зуур авна */
  const [busy, setBusy] = useState(false);

  /**
   * ГУРВАН ГАРЦ — нэг ажил, гурван орчинд.
   *
   * ⚠️ Урьд нь (энэ салбарт) ЗӨВХӨН `emailViaEml` холбогдсон байв. `emailReport.ts`
   * нь толгойдоо «New Outlook / вэб (OWA) нь X-Unsent .eml-ийг бичих цонхоор
   * НЭЭЖ ЧАДАХГҮЙ» гэж бичээд `emailViaMailto` ба `downloadReportPdf` хоёрыг
   * fallback болгож бэлдсэн атлаа тэдгээрийг ХААНА Ч дуудаагүй (үхмэл код).
   * Windows 11 дээр New Outlook нь 2024 оны сүүлээс АНХДАГЧ мэйл програм тул
   * тэдгээр машин дээр татсан .eml нь зөвхөн уншигдах хэлбэрээр нээгдэж, бичих
   * цонх гарахгүй — өөрөөр хэлбэл тайланг илгээх ямар ч арга үлддэггүй байлаа.
   */
  const run = useCallback(
    async (fn: (r: BagtsRow[], d: string, x: ReportExtra) => Promise<void>, what: string) => {
      if (!rows || !extra || busy) return;
      setBusy(true);
      try {
        await fn(rows, date || new Date().toLocaleString('mn-MN'), extra);
      } catch (e) {
        console.error('[selbe] тайлан:', e);
        alert(`${what} үүсгэхэд алдаа гарлаа: ` + (e instanceof Error ? e.message : String(e)));
      } finally {
        setBusy(false);
      }
    },
    [rows, extra, busy, date],
  );

  const send = useCallback(() => run(emailViaEml, 'Тайлан'), [run]);
  const sendWeb = useCallback(() => run(emailViaMailto, 'Мэйл'), [run]);
  const savePdf = useCallback(() => run(downloadReportPdf, 'PDF'), [run]);

  // ⚠️ PDF нь дэлгэцтэй ИЖИЛ байх ёстой тул БҮХ өгөгдөл ачаалагдтал илгээхгүй
  const ready = !!rows && !!extra;

  return (
    <div className={r.wrap}>
      <div className={r.toolbar}>
        <div className={r.tools}>
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={send}
            title="Outlook нээгдэж, мэйл бичигдсэн, PDF хавсаргагдсан, Send дарахад бэлэн (юу ч чирэх шаардлагагүй)"
          >
            <Icon name="chart" size={15} />
            {busy ? 'Бэлтгэж байна…' : 'Outlook-оор илгээх'}
          </button>
          {/* ⚠️ Хоёр дахь зам — New Outlook / вэб OWA. Тэнд .eml нь бичих цонх
              нээдэггүй тул `mailto:` (хавсралтгүй, PDF нь тусад нь татагдана). */}
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={sendWeb}
            title="New Outlook эсвэл вэб хувилбар (OWA) ашигладаг бол — мэйл бичих цонх нээгдэж, PDF нь тусад нь татагдана"
          >
            <Icon name="chart" size={15} />
            Шинэ Outlook / вэб
          </button>
          {/* Мэйлгүй зам — файлыг өөрөө хадгалаад хүссэн сувгаараа илгээнэ */}
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={savePdf}
            title="Зөвхөн PDF файлыг татах — мэйл програм нээхгүй"
          >
            <Icon name="chart" size={15} />
            PDF татах
          </button>
        </div>
      </div>

      <article className={r.paper}>
        <header className={r.docHead}>
          <h1 className={r.title}>Сэлбэ 20 минутын хот — Ерөнхий тайлан</h1>
          <p className={r.sub}>
            Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт{date && <> · Огноо: {date}</>}
          </p>
        </header>

        <Data q={bagts} loading="Багцын өгөгдөл нэгтгэж байна…">
          {(rows) => (
            <Data q={ex} loading="Гүйцэтгэл, санхүү, газар, дэд бүтэц, ХАБЭА-гийн өгөгдөл нэгтгэж байна…">
              {(x) => {
                const blocks = rows.reduce((a, b) => a + b.blocks, 0);
                const ail = rows.reduce((a, b) => a + b.ail, 0);
                /* ⚠️ Багцын төсөв нь `BagtsRow`-оос БИШ, `x.finance.byBagts`-аас.
                   Хуучин `BagtsRow.budget` нь BUS_cashflow-оос ирдэг байсныг
                   2026-08-13-нд хассан (`reportData.ts`-ийн тайлбарыг үз). */
                const budgetOf = (k: string) => x.finance.byBagts[k] ?? 0;
                const budget = rows.reduce((a, b) => a + budgetOf(b.key), 0);
                const sorted = [...rows].sort((a, b) => budgetOf(b.key) - budgetOf(a.key));
                const bagtsAvg = blocks
                  ? rows.reduce((a, b) => a + (b.progress ?? 0) * b.blocks, 0) / blocks
                  : null;
                const srcTotal = x.finance.sources.reduce((a, s) => a + s.value, 0);
                const d = buildFindings(x);

                return (
                  <>
                    {/* ── Товч танилцуулга ── */}
                    <div className={r.lead}>
                      <p>
                        Сэлбэ 20 минутын хотын төслийн хэрэгжилт тайлан үүсгэх өдрийн
                        байдлаар <strong>{pct(x.overall.pct, 2)}</strong>-тай байна. Төслийн
                        жингийн <strong>{pct(d.buildWeight, 1)}</strong>-ийг эзэлдэг барилга
                        угсралтын ажил <strong>{pct(d.buildActual, 2)}</strong>-ийн
                        гүйцэтгэлтэй
                        {d.buildLag != null && (
                          <> буюу төлөвлөгөөнөөс <strong>{num(d.buildLag, 1)} нэгж хувиар</strong> хоцорч байна</>
                        )}.
                        Газар чөлөөлөлтийн гүйцэтгэл
                        {x.land.pct != null && <> <strong>{pct(x.land.pct, 1)}</strong></>} байгаа ч
                        {' '}{num(d.landLeft)} нэгж талбар шийдвэрлэгдээгүй үлдсэн байна.
                      </p>
                      <p>
                        Санхүүгийн хувьд захирамжаар <strong>{bn(x.finance.orderTotal)} тэрбум ₮</strong>
                        {' '}батлагдсанаас <strong>{bn(x.finance.contractAmount)} тэрбум</strong>
                        {d.contractRate != null && <> ({pct(d.contractRate, 1)})</>} нь гэрээгээр баталгаажиж,
                        {' '}<strong>{bn(x.finance.paid)} тэрбум</strong>
                        {d.paidRate != null && <> ({pct(d.paidRate, 1)})</>} нь бодитоор олгогдсон байна.
                      </p>
                      <p>
                        Барилгын талбайд <strong>{num(x.habea.workers)} ажилтан</strong>,
                        {' '}{num(x.habea.tehnik)} нэгж техник ажиллаж байгаа бөгөөд орон сууцны
                        {' '}{num(blocks)} блок, {num(ail)} өрхийн орон сууц баригдаж байна.
                      </p>
                    </div>

                    {/* ── 1. Үндсэн үзүүлэлт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>1. Үндсэн үзүүлэлт</h2>
                      <p className={r.intro}>
                        Энэ хэсэгт төслийн цар хүрээ, гүйцэтгэл, санхүүжилтийн долоон гол
                        үзүүлэлтийг нэгтгэв. Гүйцэтгэлийн хоёр өөр хэмжүүрийг ялган үзэх нь
                        зүйтэй: төслийн нийт гүйцэтгэл нь бүх үе шатыг жин харгалзан
                        тооцсон дүн бол барилга угсралтын гүйцэтгэл нь зөвхөн орон сууцны
                        блокуудыг хамарна.
                      </p>
                      <Cap no="1">Төслийн нэгдсэн үзүүлэлт</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Үзүүлэлт</th><th className={r.num}>Утга</th></tr></thead>
                        <tbody>
                          <tr><td>Орон сууцны блок</td><td className={r.num}>{num(blocks)}</td></tr>
                          <tr><td>Өрхийн орон сууц</td><td className={r.num}>{num(ail)}</td></tr>
                          <tr>
                            <td>Төслийн нийт гүйцэтгэл</td>
                            <td className={r.num}>{pct(x.overall.pct, 2)}</td>
                          </tr>
                          <tr>
                            <td>Барилга угсралтын гүйцэтгэл</td>
                            <td className={r.num}>{pct(x.progress.overall, 2)}</td>
                          </tr>
                          <tr>
                            <td>Захирамжаар батлагдсан дүн</td>
                            <td className={r.num}>{bn(x.finance.orderTotal)} тэрбум ₮</td>
                          </tr>
                          <tr>
                            <td>Гэрээгээр байгуулагдсан дүн</td>
                            <td className={r.num}>{bn(x.finance.contractAmount)} тэрбум ₮</td>
                          </tr>
                          <tr className={r.total}>
                            <td>Бодитоор олгосон санхүүжилт</td>
                            <td className={r.num}>{bn(x.finance.paid)} тэрбум ₮</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className={r.note}>
                        Төслийн нийт гүйцэтгэл нь хэрэгжилтийн {num(x.overall.rows)} ажлыг
                        жин харгалзан тооцсон дүн (3-р хэсэг); барилга угсралтын гүйцэтгэл нь
                        хяналтын {num(x.progress.blocks)} блокийн дундаж (6-р хэсэг).
                      </p>
                    </section>

                    {/* ── 2. Орон сууцны 7 багц ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>2. Орон сууцны 7 багц</h2>
                      <p className={r.intro}>
                        Орон сууцны барилгажилт долоон багцад хуваагдан хэрэгжиж байна.
                        Нийт {num(blocks)} блокт {num(ail)} өрхийн орон сууц төлөвлөгдсөн
                        бөгөөд төсөвт өртөг {bn(budget)} тэрбум ₮ байна. Багц хоорондын
                        гүйцэтгэлийн зөрүү их байна: хамгийн өндөр нь {d.bestBagts?.bagts}
                        ({pct(d.bestBagts?.pct ?? null, 2)}), хамгийн бага нь
                        {' '}{d.worstBagts?.bagts} ({pct(d.worstBagts?.pct ?? null, 2)}).
                      </p>
                      <Cap no="2">Багц тус бүрийн блок, өрх, төсөв ба гүйцэтгэл (төсөвт өртгөөр буурах эрэмбээр)</Cap>
                      <table className={r.table}>
                        <thead>
                          <tr>
                            <th>Багц</th>
                            <th className={r.num}>Блок</th>
                            <th className={r.num}>Өрх</th>
                            <th className={r.num}>Төсөв (тэрбум ₮)</th>
                            <th className={r.num}>Гүйцэтгэл</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((b) => (
                            <tr key={b.key}>
                              <td>{b.label}</td>
                              <td className={r.num}>{num(b.blocks)}</td>
                              <td className={r.num}>{num(b.ail)}</td>
                              <td className={r.num}>{budgetOf(b.key) > 0 ? bn(budgetOf(b.key)) : '—'}</td>
                              <td className={r.num}>{pct(b.progress, 2)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(blocks)}</td>
                            <td className={r.num}>{num(ail)}</td>
                            <td className={r.num}>{bn(budget)}</td>
                            <td className={r.num}>{pct(bagtsAvg, 2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </section>

                    {/* ── 3. Хэрэгжилтийн үе шат ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>3. Хэрэгжилтийн үе шат</h2>
                      <p className={r.intro}>
                        Төсөл нь бэлтгэлээс барилга угсралт хүртэл зургаан үе шаттай. Үе шат
                        бүр төсөлд эзлэх өөрийн жинтэй тул нийт гүйцэтгэл нь энгийн дундаж
                        биш, жин харгалзан тооцсон дүн болно. Одоогийн байдлаар төслийн
                        жингийн {pct(d.heavyStage?.weight ?? null, 1)}-ийг «{d.heavyStage?.label}»
                        үе шат эзэлж байгаа тул нийт гүйцэтгэл голчлон түүнээс хамаарч байна.
                      </p>
                      <Cap no="3">Үе шатны эзлэх жин, бодит гүйцэтгэл ба төлөвлөгөө</Cap>
                      <table className={r.table}>
                        <thead>
                          <tr>
                            <th>Үе шат</th>
                            <th className={r.num}>Ажил</th>
                            <th className={r.num}>Эзлэх жин</th>
                            <th className={r.num}>Гүйцэтгэл</th>
                            <th className={r.num}>Төлөвлөгөө</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.overall.stages.map((s) => (
                            <tr key={s.label}>
                              <td>{s.label}</td>
                              <td className={r.num}>{num(s.rows)}</td>
                              <td className={r.num}>{pct(s.weight, 2)}</td>
                              <td className={r.num}>{pct(s.actual, 2)}</td>
                              <td className={r.num}>{s.planned == null ? '—' : pct(s.planned, 1)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(x.overall.rows)}</td>
                            <td className={r.num}>{pct(x.overall.weightSum, 2)}</td>
                            <td className={r.num}>{pct(x.overall.pct, 2)}</td>
                            <td className={r.num}>—</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className={r.note}>
                        Эзлэх жингийн нийлбэр {pct(x.overall.weightSum, 2)} — эх хүснэгтэд
                        бүх ажил бүртгэгдээгүй тул нийт гүйцэтгэлийг жингийн нийлбэрээр
                        харьцуулан тооцов. Төлөвлөгөө бөглөөгүй үе шатыг «—» тэмдгээр
                        илэрхийлэв.
                      </p>
                    </section>

                    {/* ── 4. Газар чөлөөлөлт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>4. Газар чөлөөлөлт</h2>
                      <p className={r.intro}>
                        Төслийн талбайд нийт {num(x.land.parcels)} нэгж талбар
                        ({num(x.land.areaM2)} м²) бүртгэгдсэн бөгөөд үе шатны гүйцэтгэл
                        {' '}{x.land.pct != null ? pct(x.land.pct, 1) : '—'} байна. Ажлын
                        үндсэн хэсэг дууссан ч {num(d.landLeft)} нэгж талбар шийдвэрлэгдээгүй
                        хэвээр байгаа нь барилга угсралтын хуваарьт нөлөөлөх эрсдэлтэй.
                      </p>
                      <Cap no="4.1">Нэгж талбарын төлөв</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Төлөв</th><th className={r.num}>Нэгж талбар</th><th className={r.num}>Эзлэх хувь</th></tr></thead>
                        <tbody>
                          {x.land.byStatus.map((s) => (
                            <tr key={s.label}>
                              <td>{s.label}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>
                                {x.land.parcels ? pct((s.n / x.land.parcels) * 100, 1) : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(x.land.parcels)}</td>
                            <td className={r.num}>100%</td>
                          </tr>
                        </tbody>
                      </table>

                      {x.land.byReason.length > 0 && (
                        <>
                          <Cap no="4.2">
                            Шийдвэрлэгдээгүй нэгж талбарын шалтгаан
                            {d.topReason && ` — тэргүүлэх шалтгаан «${d.topReason.label}»`}
                          </Cap>
                          <table className={r.table}>
                            <thead><tr><th>Шалтгаан</th><th className={r.num}>Нэгж талбар</th></tr></thead>
                            <tbody>
                              {x.land.byReason.map((s) => (
                                <tr key={s.label}>
                                  <td>{s.label}</td>
                                  <td className={r.num}>{num(s.n)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </section>

                    {/* ── 5. Нийгмийн үйлчилгээний барилга ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>5. Нийгмийн үйлчилгээний барилга</h2>
                      <p className={r.intro}>
                        Орон сууцны хорооллыг дагалдан ерөнхий төлөвлөгөөнд
                        {' '}{num(x.social.n)} нийгмийн үйлчилгээний байгууламж, нийт
                        {' '}барилгын талбай {num(x.social.areaM2)} м² тусгагдсан байна. Эдгээр нь
                        сургууль, цэцэрлэг, төрийн үйлчилгээ, хүүхдийн хөгжлийн байгууламжийг
                        хамарна.
                      </p>
                      <Cap no="5">Нийгмийн үйлчилгээний байгууламжийн жагсаалт</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Байгууламж</th><th className={r.num}>Тоо</th><th className={r.num}>Талбай (м²)</th></tr></thead>
                        <tbody>
                          {x.social.rows.map((s) => (
                            <tr key={s.title}>
                              <td>{s.title}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>{s.areaM2 > 0 ? num(s.areaM2) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(x.social.n)}</td>
                            <td className={r.num}>{num(x.social.areaM2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </section>

                    {/* ── 6. Барилга угсралтын гүйцэтгэл ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>6. Барилга угсралтын гүйцэтгэл</h2>
                      <p className={r.intro}>
                        Хяналтын {num(x.progress.blocks)} блокийн ажлын үе шат тус бүрийн
                        гүйцэтгэлээс тооцсон дундаж {pct(x.progress.overall, 2)} байна
                        {x.progress.date && <> (сүүлийн тайлагнал {x.progress.date})</>}.
                        {d.startedPhases.length > 0 && (
                          <> Одоогоор «{d.startedPhases.join('», «')}» үе шат эхэлсэн</>
                        )}
                        {d.notStartedPhases.length > 0 && (
                          <> бөгөөд үлдсэн {num(d.notStartedPhases.length)} үе шат хараахан
                          эхлээгүй байна</>
                        )}.
                      </p>
                      <Cap no="6.1">Багц тус бүрийн барилга угсралтын гүйцэтгэл</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Багц</th><th className={r.num}>Блок</th><th className={r.num}>Гүйцэтгэл</th></tr></thead>
                        <tbody>
                          {x.progress.byBagts.map((b) => (
                            <tr key={b.bagts}>
                              <td>{b.bagts}</td>
                              <td className={r.num}>{num(b.blocks)}</td>
                              <td className={r.num}>{pct(b.pct, 2)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(x.progress.blocks)}</td>
                            <td className={r.num}>{pct(x.progress.overall, 2)}</td>
                          </tr>
                        </tbody>
                      </table>

                      <Cap no="6.2">Ажлын үе шат тус бүрийн дундаж гүйцэтгэл</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Үе шат</th><th className={r.num}>Дундаж гүйцэтгэл</th></tr></thead>
                        <tbody>
                          {x.progress.phases.map((p) => (
                            <tr key={p.no}>
                              <td>{p.no}. {p.name}</td>
                              <td className={r.num}>{pct(p.pct, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <Cap no="6.3">
                        Гүйцэтгэл хамгийн бага арван блок — анхаарал шаардсан ажлууд
                      </Cap>
                      <table className={r.table}>
                        <thead><tr><th>Багц</th><th>Блок</th><th className={r.num}>Гүйцэтгэл</th></tr></thead>
                        <tbody>
                          {x.progress.slowest.map((b) => (
                            <tr key={`${b.bagts}|${b.block}`}>
                              <td>{b.bagts}</td>
                              <td>{b.block}</td>
                              <td className={r.num}>{pct(b.pct, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className={r.note}>
                        Дундаж нь блок бүрийг тэнцүү жинтэйгээр тооцсон; 2-р хэсгийн багцын
                        гүйцэтгэлтэй нэг эх сурвалжаас гарна.
                      </p>
                    </section>

                    {/* ── 7. Санхүүжилтийн явц ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>7. Санхүүжилтийн явц</h2>
                      <p className={r.intro}>
                        Захирамж, гэрээгээр баталгаажсан {num(x.finance.rows)} ажлын
                        санхүүжилт дөрвөн эх үүсвэрээс бүрдэж байна.
                        {d.topSource && (
                          <> Санхүүжилтийн дийлэнх хэсгийг «{d.topSource.label}» эх үүсвэр
                          бүрдүүлж, нийт дүнгийн {pct(d.topSource.share, 1)}-ийг эзэлж байна.</>
                        )}
                      </p>
                      <Cap no="7.1">Санхүүжилтийн эх үүсвэрийн бүтэц</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Эх үүсвэр</th><th className={r.num}>Дүн (тэрбум ₮)</th><th className={r.num}>Хувь</th></tr></thead>
                        <tbody>
                          {x.finance.sources.map((s) => (
                            <tr key={s.label}>
                              <td>{s.label}</td>
                              <td className={r.num}>{bn(s.value)}</td>
                              <td className={r.num}>{srcTotal ? pct((s.value / srcTotal) * 100, 1) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{bn(srcTotal)}</td>
                            <td className={r.num}>100%</td>
                          </tr>
                        </tbody>
                      </table>

                      <Cap no="7.2">
                        Сар бүрийн олголт ба хуримтлагдсан дүн
                        {d.peakMonth && ` — хамгийн их олголт ${d.peakMonth.label} сард`}
                      </Cap>
                      <table className={r.table}>
                        <thead><tr><th>Сар</th><th className={r.num}>Олгосон (тэрбум ₮)</th><th className={r.num}>Хуримтлагдсан</th></tr></thead>
                        <tbody>
                          {x.finance.months.map((m) => (
                            <tr key={m.label}>
                              <td>{m.label}</td>
                              <td className={r.num}>{m.amount > 0 ? bn(m.amount) : '—'}</td>
                              <td className={r.num}>{bn(m.cum)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <Cap no="7.3">Ажлын төрлөөр — төсөв ба гэрээний дүн</Cap>
                      <table className={r.table}>
                        <thead><tr><th>Төрөл</th><th className={r.num}>Ажил</th><th className={r.num}>Төсөв</th><th className={r.num}>Гэрээ</th></tr></thead>
                        <tbody>
                          {x.finance.byType.map((t) => (
                            <tr key={t.type}>
                              <td>{t.type}</td>
                              <td className={r.num}>{num(t.n)}</td>
                              <td className={r.num}>{bnOrDash(t.budget)}</td>
                              <td className={r.num}>{bnOrDash(t.contract)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(x.finance.rows)}</td>
                            <td className={r.num}>{bn(x.finance.budget)}</td>
                            <td className={r.num}>{bn(x.finance.contractAmount)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </section>

                    {/* ── 8. Дэд бүтцийн хэрэгжилт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>8. Дэд бүтцийн хэрэгжилт</h2>
                      <p className={r.intro}>
                        Ерөнхий төлөвлөгөөний {num(x.infra.totals.layers)} давхаргад
                        {' '}{num(x.infra.totals.n)} объект бүртгэгдсэн бөгөөд шугам сүлжээний
                        нийт урт {num(x.infra.totals.len)} м, талбайн хэмжээ
                        {' '}{num(x.infra.totals.area)} м² байна. Өртгийн загвараар тооцсон
                        дүн {bn(x.infra.totals.cost)} тэрбум ₮ байна.
                      </p>
                      <Cap no="8">Ажлын бүлэг тус бүрийн объект, хэмжээ ба төсөвт өртөг</Cap>
                      <table className={r.table}>
                        <thead>
                          <tr>
                            <th>Ажлын бүлэг</th>
                            <th className={r.num}>Давхарга</th>
                            <th className={r.num}>Объект</th>
                            <th className={r.num}>Урт (м)</th>
                            <th className={r.num}>Талбай (м²)</th>
                            <th className={r.num}>Өртөг (тэрбум ₮)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.infra.groups.map((g) => (
                            <tr key={g.key}>
                              <td>{g.title}</td>
                              <td className={r.num}>{num(g.layers)}</td>
                              <td className={r.num}>{num(g.n)}</td>
                              <td className={r.num}>{g.len > 0 ? num(g.len) : '—'}</td>
                              <td className={r.num}>{g.area > 0 ? num(g.area) : '—'}</td>
                              <td className={r.num}>{bnOrDash(g.cost)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td className={r.num}>{num(x.infra.totals.layers)}</td>
                            <td className={r.num}>{num(x.infra.totals.n)}</td>
                            <td className={r.num}>{num(x.infra.totals.len)}</td>
                            <td className={r.num}>{num(x.infra.totals.area)}</td>
                            <td className={r.num}>{bnOrDash(x.infra.totals.cost)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className={r.note}>
                        Өртгийн загвар нь нэгж үнэ батлагдсан бүлгүүдийг л хамарна — «—»
                        тэмдэглэгээ нь өртөг тэг гэсэн үг биш, тухайн бүлэгт нэгж үнэ
                        тогтоогоогүйг илэрхийлнэ.
                      </p>
                    </section>

                    {/* ── 9. ХАБЭА ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>9. Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй</h2>
                      <p className={r.intro}>
                        {x.habea.date && <>{x.habea.date}-ны байдлаар </>}
                        барилгын талбайд {num(x.habea.workers)} ажилтан (дотоодын
                        {' '}{num(x.habea.mongol)}, гадаадын {num(x.habea.gadaad)}),
                        {' '}{num(x.habea.tehnik)} нэгж техник ажиллаж байна. Дотоодын
                        ажиллах хүч нийт ажиллагсдын {pct(d.mongolShare, 1)}-ийг эзэлж байна.
                      </p>
                      <Cap no="9">Гүйцэтгэгч байгууллага тус бүрийн хүн хүч, техник</Cap>
                      <table className={r.table}>
                        <thead>
                          <tr>
                            <th>Гүйцэтгэгч</th>
                            <th>Багц</th>
                            <th className={r.num}>Ажилтан</th>
                            <th className={r.num}>Дотоод</th>
                            <th className={r.num}>Гадаад</th>
                            <th className={r.num}>Техник</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.habea.byCompany.map((c) => (
                            <tr key={c.label}>
                              <td>{c.label}</td>
                              <td>{c.bagts ?? '—'}</td>
                              <td className={r.num}>{num(c.workers)}</td>
                              <td className={r.num}>{num(c.mongol)}</td>
                              <td className={r.num}>{num(c.gadaad)}</td>
                              <td className={r.num}>{num(c.tehnik)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>Нийт</td>
                            <td>—</td>
                            <td className={r.num}>{num(x.habea.workers)}</td>
                            <td className={r.num}>{num(x.habea.mongol)}</td>
                            <td className={r.num}>{num(x.habea.gadaad)}</td>
                            <td className={r.num}>{num(x.habea.tehnik)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className={r.note}>
                        Бүртгэлийн эхнээс хойш нийт {num(x.habea.incidents)} осол, зөрчил
                        бүртгэгдсэн байна. Хүн хүчний тоо нь өдөр тутмын хуримтлагдсан
                        үзүүлэлт биш, сүүлийн бүртгэлийн агшны байдлыг илэрхийлнэ.
                      </p>
                    </section>

                    {/* ── 10. Дүгнэлт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>10. Дүгнэлт, анхаарах асуудал</h2>
                      <p className={r.intro}>
                        Дээрх өгөгдөлд тулгуурлан анхаарал шаардсан дараах асуудлыг
                        тодруулав.
                      </p>
                      <ul className={r.findings}>
                        {d.findings.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </section>
                  </>
                );
              }}
            </Data>
          )}
        </Data>

      </article>
    </div>
  );
}

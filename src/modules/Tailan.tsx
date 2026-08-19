'use client';

/**
 * ТАЙЛАН — «Ерөнхий мэдээлэл» дашбоардын өгөгдлийг БАРИМТ (тайлан) хэлбэрээр.
 *
 * Бүтэц нь захиалагчийн Word жишээ тайлантай (гарчиг · огноо · дугаарласан
 * хэсэг · тайлбар өгүүлбэр · 2–4 баганат хүснэгт) ижил. Ингэснээр энэ хуудсыг
 * шууд ХЭВЛЭХ / PDF болгож, дараа нь мэйлд хавсаргах боломжтой.
 *
 * ⚠️ 2026-08-13: илтгэлээс бэхлэгдсэн ◆ тоонууд БҮРЭН УСТСАН — тоон үзүүлэлт
 * бүр дашбоардтай НЭГ амьд эх сурвалжаас (`@/lib/live` · `@/lib/land` ·
 * `useBagtsTable`) бодогдоно. Төсөв нь Cashflow /106-оос. Эх сурвалжгүй үе
 * шат «—».
 */

import { useCallback, useEffect, useState } from 'react';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct } from '@/lib/format';
import { useBagtsTable, type BagtsRow } from '@/modules/Dashboard';
import { useAsync } from '@/lib/useAsync';
import { loadLandStatus, type LandStatus } from '@/lib/land';
import {
  loadHeadline, loadSocial, loadProjectProgress, loadBudget, liveStage,
  type Headline, type SocialLive, type ProjectProgress, type Budget,
} from '@/lib/live';
import { SCHEDULE } from '@/lib/brief';
import { emailViaEml, emailViaMailto, downloadReportPdf, type ReportLive } from '@/lib/emailReport';
import r from './report.module.css';

export function Tailan() {
  /** Огноо — ЗӨВХӨН клиент дээр (сервертэй зөрж hydration эвдэхээс сэргийлнэ). */
  const [date, setDate] = useState('');
  useEffect(() => {
    setDate(new Date().toLocaleString('mn-MN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }, []);

  const bagts = useBagtsTable();
  const rows: BagtsRow[] | null = bagts.state === 'ready' ? bagts.data : null;
  /* Бүх амьд эх сурвалж — дашбоардтай ИЖИЛ кэштэй loader-ууд */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headlineQ = useAsync<Headline>(loadHeadline, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectQ = useAsync<ProjectProgress>(loadProjectProgress, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const landQ = useAsync<LandStatus>(loadLandStatus, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const socialQ = useAsync<SocialLive>(loadSocial, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const budgetQ = useAsync<Budget>(loadBudget, []);

  const headline = headlineQ.state === 'ready' ? headlineQ.data : null;
  const project = projectQ.state === 'ready' ? projectQ.data : null;
  const land = landQ.state === 'ready' ? landQ.data : null;
  const social = socialQ.state === 'ready' ? socialQ.data : null;
  const budget = budgetQ.state === 'ready' ? budgetQ.data : null;

  /** PDF/мэйлд дамжих амьд багц — бүгд бэлэн үед л илгээнэ */
  const live: ReportLive | null =
    headline && project && land && social && budget
      ? { headline, project, land, social, budget }
      : null;

  /** Мэйл үүсгэх явц — pdfmake динамик ачаалалт хормын зуур авна */
  const [busy, setBusy] = useState(false);

  /**
   * ГУРВАН ГАРЦ — нэг ажил, гурван орчинд.
   *
   * ⚠️ 2026-08-19: Урьд нь ЗӨВХӨН `emailViaEml` холбогдсон байв. `emailReport.ts`
   * нь толгойдоо «New Outlook / вэб (OWA) нь X-Unsent .eml-ийг бичих цонхоор
   * НЭЭЖ ЧАДАХГҮЙ» гэж бичээд `emailViaMailto` ба `downloadReportPdf` хоёрыг
   * fallback болгож бэлдсэн атлаа тэдгээрийг ХААНА Ч дуудаагүй (үхмэл код).
   * Windows 11 дээр New Outlook нь 2024 оны сүүлээс АНХДАГЧ мэйл програм тул
   * тэдгээр машин дээр татсан .eml нь зөвхөн уншигдах хэлбэрээр нээгдэж, бичих
   * цонх гарахгүй — өөрөөр хэлбэл тайланг илгээх ямар ч арга үлддэггүй байлаа.
   */
  const run = useCallback(
    async (fn: (r: BagtsRow[], d: string, l: ReportLive) => Promise<void>, what: string) => {
      if (!rows || !live || busy) return;
      setBusy(true);
      try {
        await fn(rows, date || new Date().toLocaleString('mn-MN'), live);
      } catch (e) {
        console.error('[selbe] тайлан:', e);
        alert(`${what} үүсгэхэд алдаа гарлаа: ` + (e instanceof Error ? e.message : String(e)));
      } finally {
        setBusy(false);
      }
    },
    [rows, live, busy, date],
  );

  const send = useCallback(() => run(emailViaEml, 'Тайлан'), [run]);
  const sendWeb = useCallback(() => run(emailViaMailto, 'Мэйл'), [run]);
  const savePdf = useCallback(() => run(downloadReportPdf, 'PDF'), [run]);

  const ready = !!rows && !!live;
  /** Төсөв — Cashflow /106 (олон нийтийн бүсгүй) */
  const split = budget ? budget.sources : null;
  const investTotal = budget ? budget.orderTotal : null;

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
          <p className={r.sub}>Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт{date && <> · Огноо: {date}</>}</p>
        </header>

        {/* ── 1. Үндсэн үзүүлэлт (БҮГД АМЬД) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>1. Үндсэн үзүүлэлт</h2>
          <p className={r.intro}>
            Төслийн цар хүрээ ба нэгдсэн гүйцэтгэлийн гол үзүүлэлтүүд — ArcGIS
            үйлчилгээнээс ажиллах үедээ бодогдсон.
          </p>
          <table className={r.table}>
            <thead><tr><th>Үзүүлэлт</th><th className={r.num}>Утга</th></tr></thead>
            <tbody>
              <tr><td>Төслийн талбай</td><td className={r.num}>{headline ? `${num(headline.areaHa, 1)} га` : '…'}</td></tr>
              <tr><td>Орон сууцны блок</td><td className={r.num}>{rows ? num(rows.reduce((a, x) => a + x.blocks, 0)) : '…'}</td></tr>
              <tr><td>Өрхийн орон сууц</td><td className={r.num}>{rows ? num(rows.reduce((a, x) => a + x.ail, 0)) : '…'}</td></tr>
              <tr><td>Хамрагдах хүн ам</td><td className={r.num}>{headline ? num(headline.population) : '…'}</td></tr>
              <tr><td>Төслийн нийт гүйцэтгэл</td><td className={r.num}>{project ? pct(project.actual, 2) : '…'}</td></tr>
              <tr><td>Нийт хөрөнгө оруулалт</td><td className={r.num}>{headline ? `${num(headline.investTotal / 1e12, 2)} их наяд ₮` : '…'}</td></tr>
            </tbody>
          </table>
        </section>

        {/* ── 2. Орон сууцны 7 багц (АМЬД) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>2. Орон сууцны 7 багц</h2>
          <p className={r.intro}>
            Багц тус бүрийн блок, өрх, гүйцэтгэгч ба барилга угсралтын гүйцэтгэл —
            гүйцэтгэлээр буурах эрэмбээр. Тоо нь ArcGIS-ээс ажиллах үедээ татагдана.
          </p>
          <Data q={bagts} loading="Багцын өгөгдөл нэгтгэж байна…">
            {(brows) => {
              const sorted = [...brows].sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
              const blocks = brows.reduce((a, x) => a + x.blocks, 0);
              const ail = brows.reduce((a, x) => a + x.ail, 0);
              const avg = blocks
                ? brows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks
                : null;
              return (
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th>Багц</th>
                      <th className={r.num}>Блок</th>
                      <th className={r.num}>Өрх</th>
                      <th>Гүйцэтгэгч</th>
                      <th className={r.num}>Гүйцэтгэл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((x) => (
                      <tr key={x.key}>
                        <td>{x.label}</td>
                        <td className={r.num}>{num(x.blocks)}</td>
                        <td className={r.num}>{num(x.ail)}</td>
                        <td>{x.contractor}</td>
                        <td className={r.num}>{pct(x.progress, 2)}</td>
                      </tr>
                    ))}
                    <tr className={r.total}>
                      <td>Нийт</td>
                      <td className={r.num}>{num(blocks)}</td>
                      <td className={r.num}>{num(ail)}</td>
                      <td />
                      <td className={r.num}>{pct(avg, 2)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            }}
          </Data>
        </section>

        {/* ── 3. Хэрэгжилтийн үе шат (АМЬД — Төсөл_Гүйцэтгэл) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>3. Хэрэгжилтийн үе шат</h2>
          <p className={r.intro}>
            Төслийн үндсэн зургаан үе шат — гүйцэтгэл нь «Төсөл Гүйцэтгэл» хүснэгтийн
            жигнэсэн дүн. Амьд бүртгэлгүй үе шат «—» гэж гарна.
          </p>
          <table className={r.table}>
            <thead><tr><th>Үе шат</th><th>Төлөв</th><th className={r.num}>Гүйцэтгэл</th></tr></thead>
            <tbody>
              {SCHEDULE.map((st) => {
                const v = liveStage(project, st.stages);
                return (
                  <tr key={st.no}>
                    <td>{st.no}. {st.label}</td>
                    <td>{st.status}</td>
                    <td className={r.num}>{v == null ? '—' : pct(v, v >= 1 ? 1 : 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── 4. Газар чөлөөлөлт (АМЬД — дашбоардтай нэг томьёо) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>4. Газар чөлөөлөлт</h2>
          {land ? (
            <>
              <p className={r.intro}>
                Нийт {num(land.total)} нэгж талбараас {num(land.resolved)} чөлөөлөгдсөн
                (бүрэн {num(land.cleared)} + цэвэрлэсэн {num(land.cleaned)}),
                {' '}{num(land.remaining)} үлдсэн — гүйцэтгэл {pct(land.pct, 1)}.
                Үлдсэн нэгж талбарын шалтгааны задаргаа:
              </p>
              <table className={r.table}>
                <thead><tr><th>Шалтгаан</th><th className={r.num}>Тоо</th></tr></thead>
                <tbody>
                  {land.reasons.map((b) => (
                    <tr key={b.label}><td>{b.label}</td><td className={r.num}>{num(b.n)}</td></tr>
                  ))}
                  <tr className={r.total}>
                    <td>Үлдсэн нийт</td>
                    <td className={r.num}>{num(land.remaining)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : <p className={r.intro}>Татаж байна…</p>}
        </section>

        {/* ── 5. Хөрөнгө оруулалтын бүтэц (АМЬД — Cashflow /106) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>5. Хөрөнгө оруулалтын бүтэц</h2>
          <p className={r.intro}>Санхүүжилтийн эх үүсвэр тус бүрийн дүн — Cashflow /106 (захирамжаар).</p>
          {split && investTotal != null ? (
            <table className={r.table}>
              <thead><tr><th>Эх үүсвэр</th><th className={r.num}>Хувь</th><th className={r.num}>Дүн (тэрбум ₮)</th></tr></thead>
              <tbody>
                {split.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td className={r.num}>{investTotal ? `${num((s.value / investTotal) * 100, 1)}%` : '—'}</td>
                    <td className={r.num}>{num(s.value / 1e9, 1)}</td>
                  </tr>
                ))}
                <tr className={r.total}>
                  <td>Нийт</td>
                  <td className={r.num}>100%</td>
                  <td className={r.num}>{num(investTotal / 1e9, 1)}</td>
                </tr>
              </tbody>
            </table>
          ) : <p className={r.intro}>Татаж байна…</p>}
        </section>

        {/* ── 6. Нийгмийн үйлчилгээний барилга (АМЬД — test_data) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>6. Нийгмийн үйлчилгээний барилга</h2>
          <p className={r.intro}>Төслөөр шинээр баригдах нийгмийн үйлчилгээний байгууламж.</p>
          {social ? (
            <table className={r.table}>
              <thead><tr><th>Байгууламж</th><th className={r.num}>Тоо</th><th className={r.num}>Хүчин чадал</th></tr></thead>
              <tbody>
                {social.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td className={r.num}>{num(row.n)}</td>
                    <td className={r.num}>{row.capacity == null ? '—' : num(row.capacity)}</td>
                  </tr>
                ))}
                <tr className={r.total}>
                  <td>Нийт</td>
                  <td className={r.num}>{num(social.totalN)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          ) : <p className={r.intro}>Татаж байна…</p>}
        </section>

        {/* ── 7. Иргэдэд хүрэх үр өгөөж (АМЬД) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>7. Иргэдэд хүрэх үр өгөөж</h2>
          <p className={r.intro}>Төслийн иргэдэд үзүүлэх нийгэм, эдийн засгийн гол үр өгөөж.</p>
          <table className={r.table}>
            <thead><tr><th className={r.num}>Үзүүлэлт</th><th>Тайлбар</th></tr></thead>
            <tbody>
              <tr>
                <td className={r.num}>{headline ? num(headline.population) : '…'}</td>
                <td>иргэн шинэ, дэд бүтэц бүхий орон сууцанд амьдарна</td>
              </tr>
              <tr>
                <td className={r.num}>{rows ? `${num(rows.reduce((a, x) => a + x.ail, 0))} өрх` : '…'}</td>
                <td>айл өрх шинэ орон сууцтай болно</td>
              </tr>
              <tr>
                <td className={r.num}>{social ? num(social.totalN) : '…'}</td>
                <td>нийгмийн үйлчилгээний барилга шинээр баригдана</td>
              </tr>
              {headline?.greenHa != null && (
                <tr>
                  <td className={r.num}>{num(headline.greenHa, 1)} га</td>
                  <td>ногоон байгууламж шинээр байгуулагдана</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <p className={r.footNote}>
          Бүх үзүүлэлт ArcGIS үйлчилгээнээс ажиллах үедээ татагдсан амьд өгөгдөл.
          Тайланг үүсгэсэн: {date || '…'}.
        </p>
      </article>
    </div>
  );
}

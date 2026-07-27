'use client';

/**
 * ТАЙЛАН — «Ерөнхий мэдээлэл» дашбоардын өгөгдлийг БАРИМТ (тайлан) хэлбэрээр.
 *
 * Бүтэц нь захиалагчийн Word жишээ тайлантай (гарчиг · огноо · дугаарласан
 * хэсэг · тайлбар өгүүлбэр · 2–4 баганат хүснэгт) ижил. Ингэснээр энэ хуудсыг
 * шууд ХЭВЛЭХ / PDF болгож, дараа нь мэйлд хавсаргах боломжтой.
 *
 * ⚠️ Тоонууд нь дашбоардтай НЭГ эх сурвалжаас: багцын хүснэгт АМЬД
 * (`useBagtsTable` — ArcGIS-ээс), бусад нь `@/lib/brief`-ийн бэхлэгдсэн
 * илтгэлийн дүн (◆ тэмдэгтэй). Хоёр газар хуулбарлахгүйн тулд дашбоардын hook-ыг
 * дахин ашиглана.
 */

import { useCallback, useEffect, useState } from 'react';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct } from '@/lib/format';
import { useBagtsTable, type BagtsRow } from '@/modules/Dashboard';
import { emailViaEml } from '@/lib/emailReport';
import {
  BRIEF_SOURCE, HEADLINE, OVERALL, SCHEDULE, LAND, INVEST_SPLIT, SOCIAL, BENEFITS,
} from '@/lib/brief';
import r from './report.module.css';

/** ₮ → тэрбум */
const bn = (v: number) => num(v / 1e9, 1);

/** ◆ — «бэхлэгдсэн (амьд бус) үзүүлэлт» тэмдэг */
function Pin() {
  return <abbr className={r.pin} title={`Бэхлэгдсэн үзүүлэлт · ${BRIEF_SOURCE}`}>◆</abbr>;
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
  const rows: BagtsRow[] | null = bagts.state === 'ready' ? bagts.data : null;

  /** Мэйл үүсгэх явц — pdfmake динамик ачаалалт хормын зуур авна */
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    if (!rows || busy) return;
    setBusy(true);
    try {
      await emailViaEml(rows, date || new Date().toLocaleString('mn-MN'));
    } catch (e) {
      console.error('[selbe] тайлан:', e);
      alert('Тайлан үүсгэхэд алдаа гарлаа: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }, [rows, busy, date]);

  const ready = !!rows;

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
        </div>
      </div>

      <article className={r.paper}>
        <header className={r.docHead}>
          <h1 className={r.title}>Сэлбэ 20 минутын хот — Ерөнхий тайлан</h1>
          <p className={r.sub}>Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт{date && <> · Огноо: {date}</>}</p>
        </header>

        {/* ── 1. Үндсэн үзүүлэлт ── */}
        <section className={r.section}>
          <h2 className={r.h2}>1. Үндсэн үзүүлэлт</h2>
          <p className={r.intro}>
            Төслийн цар хүрээ ба нэгдсэн гүйцэтгэлийн гол үзүүлэлтүүд.
          </p>
          <table className={r.table}>
            <thead><tr><th>Үзүүлэлт</th><th className={r.num}>Утга</th></tr></thead>
            <tbody>
              <tr><td>Төслийн талбай</td><td className={r.num}>{num(HEADLINE.areaHa)} га <Pin /></td></tr>
              <tr><td>Орон сууцны блок</td><td className={r.num}>{num(HEADLINE.blocks)}</td></tr>
              <tr><td>Өрхийн орон сууц</td><td className={r.num}>{num(HEADLINE.households)}</td></tr>
              <tr><td>Хамрагдах хүн ам</td><td className={r.num}>{num(HEADLINE.population)} <Pin /></td></tr>
              <tr><td>Төслийн нийт гүйцэтгэл</td><td className={r.num}>{pct(OVERALL.reported, 2)} <Pin /></td></tr>
              <tr><td>Нийт хөрөнгө оруулалт</td><td className={r.num}>{num(HEADLINE.investBn, 1)} тэрбум ₮ <Pin /></td></tr>
            </tbody>
          </table>
        </section>

        {/* ── 2. Орон сууцны 7 багц (АМЬД) ── */}
        <section className={r.section}>
          <h2 className={r.h2}>2. Орон сууцны 7 багц</h2>
          <p className={r.intro}>
            Багц тус бүрийн блок, өрх, төсөвт өртөг ба барилга угсралтын гүйцэтгэл —
            төсөвт өртгөөр буурах эрэмбээр. Тоо нь ArcGIS-ээс ажиллах үедээ татагдана.
          </p>
          <Data q={bagts} loading="Багцын өгөгдөл нэгтгэж байна…">
            {(rows) => {
              const sorted = [...rows].sort((a, b) => b.budget - a.budget);
              const blocks = rows.reduce((a, x) => a + x.blocks, 0);
              const ail = rows.reduce((a, x) => a + x.ail, 0);
              const budget = rows.reduce((a, x) => a + x.budget, 0);
              const avg = blocks
                ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks
                : null;
              return (
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
                    {sorted.map((x) => (
                      <tr key={x.key}>
                        <td>{x.label}</td>
                        <td className={r.num}>{num(x.blocks)}</td>
                        <td className={r.num}>{num(x.ail)}</td>
                        <td className={r.num}>{x.budget > 0 ? bn(x.budget) : '—'}</td>
                        <td className={r.num}>{pct(x.progress, 2)}</td>
                      </tr>
                    ))}
                    <tr className={r.total}>
                      <td>Нийт</td>
                      <td className={r.num}>{num(blocks)}</td>
                      <td className={r.num}>{num(ail)}</td>
                      <td className={r.num}>{bn(budget)}</td>
                      <td className={r.num}>{pct(avg, 2)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            }}
          </Data>
        </section>

        {/* ── 3. Хэрэгжилтийн үе шат ── */}
        <section className={r.section}>
          <h2 className={r.h2}>3. Хэрэгжилтийн үе шат</h2>
          <p className={r.intro}>
            Төслийн үндсэн зургаан үе шат ба тайлагдсан гүйцэтгэл.
          </p>
          <table className={r.table}>
            <thead><tr><th>Үе шат</th><th>Төлөв</th><th className={r.num}>Гүйцэтгэл</th></tr></thead>
            <tbody>
              {SCHEDULE.map((st) => (
                <tr key={st.no}>
                  <td>{st.no}. {st.label}</td>
                  <td>{st.status}</td>
                  <td className={r.num}>{pct(st.pct, st.pct >= 1 ? 1 : 0)} <Pin /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── 4. Газар чөлөөлөлт ── */}
        <section className={r.section}>
          <h2 className={r.h2}>4. Газар чөлөөлөлт</h2>
          <p className={r.intro}>
            Нийт {num(LAND.total)} нэгж талбараас {num(LAND.contracted)} гэрээлэгдэж,
            {' '}{num(LAND.left)} үлдсэн (гүйцэтгэл {pct(LAND.pct, 1)}). Үлдсэн нэгж талбарын задаргаа:
          </p>
          <table className={r.table}>
            <thead><tr><th>Ангилал</th><th className={r.num}>Тоо</th></tr></thead>
            <tbody>
              {[...LAND.breakdown].sort((a, b) => b.n - a.n).map((b) => (
                <tr key={b.label}><td>{b.label}</td><td className={r.num}>{num(b.n)}</td></tr>
              ))}
              <tr className={r.total}>
                <td>Үлдсэн нийт</td>
                <td className={r.num}>{num(LAND.left)}</td>
              </tr>
            </tbody>
          </table>
          <p className={r.note}>{LAND.note}</p>
        </section>

        {/* ── 5. Хөрөнгө оруулалтын бүтэц ── */}
        <section className={r.section}>
          <h2 className={r.h2}>5. Хөрөнгө оруулалтын бүтэц</h2>
          <p className={r.intro}>
            Санхүүжилтийн эх үүсвэр тус бүрийн эзлэх хувь ба дүн. <Pin />
          </p>
          <table className={r.table}>
            <thead><tr><th>Эх үүсвэр</th><th className={r.num}>Хувь</th><th className={r.num}>Дүн (тэрбум ₮)</th></tr></thead>
            <tbody>
              {INVEST_SPLIT.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td className={r.num}>{num(s.pct, 1)}%</td>
                  <td className={r.num}>{num(s.bn, 1)}</td>
                </tr>
              ))}
              <tr className={r.total}>
                <td>Нийт</td>
                <td className={r.num}>100%</td>
                <td className={r.num}>{num(INVEST_SPLIT.reduce((a, s) => a + s.bn, 0), 1)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ── 6. Нийгмийн үйлчилгээний барилга ── */}
        <section className={r.section}>
          <h2 className={r.h2}>6. Нийгмийн үйлчилгээний барилга</h2>
          <p className={r.intro}>Одоо байгаа ба шинээр баригдах нийгмийн үйлчилгээний байгууламж. <Pin /></p>
          <table className={r.table}>
            <thead><tr><th>Байгууламж</th><th className={r.num}>Одоо</th><th className={r.num}>Шинэ</th><th className={r.num}>Нийт</th></tr></thead>
            <tbody>
              {SOCIAL.rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className={r.num}>{row.now}</td>
                  <td className={r.num}>{row.add}</td>
                  <td className={r.num}>{num(row.total)}</td>
                </tr>
              ))}
              <tr className={r.total}>
                <td>Нийт</td>
                <td className={r.num}>{SOCIAL.totals.now}</td>
                <td className={r.num}>{SOCIAL.totals.add}</td>
                <td className={r.num}>{num(SOCIAL.totals.total)}</td>
              </tr>
            </tbody>
          </table>
          <p className={r.note}>{SOCIAL.note}</p>
        </section>

        {/* ── 7. Иргэдэд хүрэх үр өгөөж ── */}
        <section className={r.section}>
          <h2 className={r.h2}>7. Иргэдэд хүрэх үр өгөөж</h2>
          <p className={r.intro}>Төслийн иргэдэд үзүүлэх нийгэм, эдийн засгийн гол үр өгөөж.</p>
          <table className={r.table}>
            <thead><tr><th className={r.num}>Үзүүлэлт</th><th>Тайлбар</th></tr></thead>
            <tbody>
              {BENEFITS.map((b, i) => (
                <tr key={i}>
                  <td className={r.num}>{b.value}{b.unit ? ` ${b.unit}` : ''}</td>
                  <td>{b.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className={r.footNote}>
          <Pin /> тэмдэгтэй үзүүлэлт нь илтгэлээс бэхлэгдсэн ({BRIEF_SOURCE});
          бусад нь ArcGIS-ээс ажиллах үедээ татагдсан амьд өгөгдөл. Тайланг үүсгэсэн: {date || '…'}.
        </p>
      </article>
    </div>
  );
}

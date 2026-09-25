'use client';

/**
 * УДИРДЛАГЫН ТАЙЛАН — «Тайлан» харагдацын ХОЁР ДАХЬ горим (2026-09-17).
 *
 * Шийдвэр гаргагчид зориулсан ТОВЧ тайлан: 01. Ерөнхий дашбоард · 05. Багцын
 * гүйцэтгэл · 04. Багцын санхүү · Зөвшөөрөл — дөрвөн эхийн дэлгэцийн тоог
 * нэг хуудсанд. Хоёр гарц:
 *   · PDF (инфографик хуудас + 2–3 хуудас хүснэгт)
 *   · Инфографик PNG (нэг зураг — мессенжер, илтгэлд)
 * мөн AI дүгнэлт (реле асаалттай үед) — тайлангийн тоонд л тулгуурлана.
 *
 * ⚠️ Өгөгдөл `@/lib/execReport`-оос — энд тооцоо ХИЙХГҮЙ. Дэлгэц, PDF,
 *    инфографик, AI дөрвүүлээ нэг объект уншина.
 * ⚠️ Ерөнхий (10 хэсэгтэй) тайлан ХЭВЭЭР — `Tailan.tsx`-ийн горим сэлгэгчээр
 *    солигдоно. Энэ модуль түүнийг ОРЛОХГҮЙ, харин удирдлагад зориулсан
 *    богино хувилбар.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Fig, KpiRow, RankBars, Meter } from '@/modules/tailanChart';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct, dateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { loadExecReport, execFindings, askExecSummary, execFinSplit, execAppendix, execAppendixNo, LATE_GAP } from '@/lib/execReport';
/* ⚠️ `buildInfographic`/`infographicSvgUrl` ЭНД ХЭРЭГГҮЙ БОЛОВ: зураг нь
   зөвхөн татагдах файлд үлдсэн (`execPdf`) — тайлангийн хуудсанд байхгүй. */
import { money } from '@/lib/execInfographic';
import { PARCEL_CLEARED } from '@/lib/services';
import { downloadExecPdf, downloadInfographic } from '@/lib/execPdf';
import { relayAlive } from '@/lib/agent/client';
import { TOLOV } from '@/lib/zovshoorol';
import r from './report.module.css';
import e from './execReport.module.css';

/** Хүснэгтийн дугаартай тайлбар */
function Cap({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={r.caption}>{tr('Хүснэгт')} {no}. <span>{children}</span></p>;
}

/**
 * ДҮГНЭЛТИЙН НЭРСИЙН ЖАГСААЛТ — багц, талбарын нэрс (2026-09-17).
 *
 * ⚠️ БҮГДИЙГ ҮРГЭЛЖ ХАРУУЛНА. Хэрэглэгчийн заавар: «ерөөсөө тайлан дээр
 * хураах, нээх гэсэн зүйл байхгүй — тайлан гэдгээ сайн ойлго». Тайлан нь
 * хэвлэгдэж, PDF болж, мэйлээр явдаг баримт: нуусан мөр нь цаасан дээр
 * ОГТ гарахгүй бөгөөд уншигч түүнийг байсан ч гэж мэдэхгүй. Дэлгэц дээр
 * хураангуйлах нь ДАШБОАРДЫН арга, тайлангийнх БИШ.
 */
function FindingItems({ items }: { items: string[] }) {
  return (
    <ul className={e.findingItems}>
      {items.map((s) => <li key={s}>{tr(s)}</li>)}
    </ul>
  );
}

export function ExecReport() {
  /** Огноо — ЗӨВХӨН клиент дээр (`Tailan`-тай ижил: hydration зөрөхөөс сэргийлнэ) */
  const [date, setDate] = useState('');
  useEffect(() => { setDate(dateTime(Date.now())); }, []);
  const q = useAsync(loadExecReport, []);
  const [busy, setBusy] = useState<'' | 'pdf' | 'png' | 'ai'>('');
  const [fail, setFail] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  /** Реле амьд эсэх — AI товчийг зөвхөн боломжтой үед идэвхжүүлнэ */
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    relayAlive(ac.signal).then(setAi, () => setAi(false));
    return () => ac.abort();
  }, []);

  const x = q.state === 'ready' ? q.data : null;
  /* ⚠️ Өгөгдөл шинэчлэгдвэл (кэш хаягдах, дахин татах) хуучин AI дүгнэлт
     ХУУЧИН тоог тайлбарлаж үлддэг байв — цэвэрлэнэ (2026-09-23). */
  useEffect(() => { setSummary(null); }, [x]);
  /* ⚠️ 2026-09-24: AI хүсэлтийн AbortController — unmount-д цуцална, эс тэгвээс
     хариу ирэхэд хаагдсан компонентын state-ийг бичих байв. */
  const aiAc = useRef<AbortController | null>(null);
  useEffect(() => () => aiAc.current?.abort(), []);
  const findings = useMemo(() => (x ? execFindings(x) : []), [x]);
  /**
   * ХАВСРАЛТ — нэрсийн жагсаалттай дүгнэлтүүд (2026-09-17).
   * ⚠️ Дараалал нь дүгнэлтийнхтэй ИЖИЛ байх ёстой: дүгнэлт дэх «хавсралт
   * N» гэсэн заалт нь энэ массивын индексээр тодорхойлогдоно.
   */
  /**
   * ЭХЛЭЭГҮЙ АЖИЛ — олголт огт хийгдээгүй багцууд (2026-09-17).
   * ⚠️ `given === 0` нь «олголт хийгдээгүй»; `pct == null` нь «гэрээгүй тул
   * хувь бодогдохгүй» — ХОЁР ӨӨР утга, хольж болохгүй.
   */
  /* ⚠️ 2026-09-21: гурван ангилал (эхэлсэн · гэрээт-эхлээгүй · гэрээгүй) ба
     хавсралтын дугаар ХОЁУЛАА `execReport.ts`-ээс — PDF-тэй НЭГ дүрэм. Урьд нь
     энд «Эхлээгүй ажил» хавсралт СҮҮЛД, PDF-д ЭХЭНД дугаарлагдаж зөрдөг байв. */
  const finSplit = useMemo(
    () => (x ? execFinSplit(x) : { started: [], zero: [], none: [] }),
    [x],
  );
  const { started: finStarted, zero: finZero, none: finNone } = finSplit;
  const appendix = useMemo(() => (x ? execAppendix(x, findings) : []), [x, findings]);

  const run = useCallback(async (what: 'pdf' | 'png' | 'ai') => {
    if (!x || busy) return;
    setFail('');
    setBusy(what);
    try {
      const d = date || dateTime(Date.now());
      if (what === 'pdf') await downloadExecPdf(x, d, summary);
      else if (what === 'png') await downloadInfographic(x, d, summary);
      else {
        const ac = new AbortController();
        aiAc.current = ac;
        const s = await askExecSummary(x, ac.signal);
        if (!ac.signal.aborted) setSummary(s);
      }
    } catch (err) {
      if (aiAc.current?.signal.aborted) return;
      console.error('[selbe] удирдлагын тайлан:', err);
      const label = what === 'pdf' ? 'PDF' : what === 'png' ? tr('Инфографик') : tr('AI дүгнэлт');
      /* ⚠️ AI-ийн алдаа (хугацаа хэтэрсэн, реле) нь өөрөө ойлгомжтой мөртэй — түүнийг л харуулна */
      const msg = what === 'ai' && err instanceof Error && err.message ? err.message : '';
      setFail(msg
        ? tr('{0}: {1}', label, msg)
        : tr('{0} үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.', label));
    } finally {
      setBusy('');
    }
  }, [x, busy, date, summary]);

  return (
    <>
      <div className={`${r.toolbar} ${e.narrow}`}>
        <div className={r.tools}>
          <button type="button" className={r.btn} disabled={!x || !!busy} onClick={() => run('pdf')}
            title={tr('Тайланг PDF хэлбэрээр татах')}>
            <Icon name="file" size={15} />
            {busy === 'pdf' ? tr('Бэлтгэж байна…') : tr('PDF татах')}
          </button>
          <button type="button" className={r.btn} disabled={!x || !!busy} onClick={() => run('png')}
            title={tr('Инфографик зураг (PNG), мессенжер болон илтгэлд')}>
            <Icon name="chart" size={15} />
            {busy === 'png' ? tr('Бэлтгэж байна…') : tr('Инфографик (PNG)')}
          </button>
          <button type="button" className={e.btn2} disabled={!x || !!busy || ai !== true} onClick={() => run('ai')}
            title={ai === false ? tr('AI реле (agent-proxy) асаагүй байна') : tr('Тайлангийн тоонд тулгуурлан AI товч дүгнэлт бичнэ')}>
            <Icon name="target" size={15} />
            {busy === 'ai' ? tr('Бодож байна…') : summary ? tr('AI дүгнэлт дахин үүсгэх') : tr('AI дүгнэлт үүсгэх')}
          </button>
          {summary && (
            <button type="button" className={r.btn} disabled={!!busy} onClick={() => setSummary(null)}
              title={tr('AI дүгнэлтийг тайлангаас (PDF/PNG-ээс ч) хасна')}>
              <Icon name="target" size={15} />
              {tr('AI дүгнэлт арилгах')}
            </button>
          )}
        </div>
        {fail && <p className={r.fail} role="alert">{fail}</p>}
      </div>

      <article className={`${r.paper} ${e.paperA4}`}>
        {/* ⚠️ Толгойн хэлбэр ЗӨВХӨН энэ тайланд (2026-09-17, хэрэглэгчийн
            заавар): том үсэг, голлосон, арай жижиг фонт. `report.module.css`
            нь ерөнхий тайлантай ХУВААЛЦДАГ тул тэнд биш, энд дарж бичив. */}
        <header className={`${r.docHead} ${e.docHeadMid}`}>
          {/* ⚠️ Төслийн нэр мэйлийн гарчиг, ерөнхий тайлантай НЭГ: «Сэлбэ 20 минутын хот» */}
          <h1 className={`${r.title} ${e.titleUp}`}>{tr('Сэлбэ 20 минутын хотын удирдлагын тайлан')}</h1>
          {date && <p className={`${r.sub} ${e.subMid}`}>{tr('Огноо:')} {date}</p>}
        </header>

        <Data q={q} loading={tr('Дөрвөн дашбоардын өгөгдлийг нэгтгэж байна…')}>
          {(x) => (
            <>

              {/* ── 1. Ерөнхий үзүүлэлт ── */}
              <section id="exec-1" tabIndex={-1} className={r.section}>
                <h2 className={r.h2}>{tr('1. Ерөнхий үзүүлэлт')}</h2>
                {(() => {
                  /* ⚠️ НЭГ МАССИВ — карт ба хүснэгт хоёулаа эндээс (§тайлбар) */
                  const kpis = [
                    {
                      label: tr('Нийт төсөв'),
                      value: money(x.gdash.budget),
                      sub: undefined as string | undefined,
                      desc: tr('Орон сууцны хороолол ба ГИШС-ийн хүрээнд батлагдсан төсөвт өртөг.'),
                    },
                    {
                      label: tr('Нийт гэрээлсэн дүн'),
                      value: money(x.gdash.contract),
                      sub: x.gdash.budget > 0 ? tr('төсвийн {0}', pct((x.gdash.contract / x.gdash.budget) * 100, 1)) : undefined,
                      desc: tr('Гүйцэтгэгчтэй байгуулсан гэрээгээр баталгаажсан дүн. Төсөвтэй харьцуулсан зөрүү нь хараахан гэрээлээгүй ажил.'),
                    },
                    {
                      label: tr('Төслийн гүйцэтгэл'),
                      value: x.gdash.progress == null ? '—' : pct(x.gdash.progress, 1),
                      sub: tr('Нэгтгэл гүйцэтгэлээр'),
                      desc: tr('Нэгтгэл гүйцэтгэлийн хүснэгтэд ТЭЗҮ-гээс төсөл хүлээлгэн өгөх хүртэлх үе шатыг төсөлд эзлэх хувиар нь нэгтгэсэн дүн.'),
                    },
                    {
                      label: tr('Багц ажлын тоо'),
                      value: num(x.gdash.packages),
                      sub: tr('{0} төрөл', num(x.gdash.types)),
                      desc: tr('Гүйцэтгэгчтэй байгуулах ажлын багцын тоо; газар чөлөөлөлт, нөхөн олговрын мөр тоологдохгүй.'),
                    },
                    {
                      label: tr('Газар чөлөөлөлт'),
                      value: x.gdash.landPct == null ? '—' : pct(x.gdash.landPct, 1),
                      sub: tr('{0} нэгж талбар үлдсэн', num(x.gdash.land.remaining)),
                      desc: tr('Шийдвэрлэгдсэн нэгж талбарын эзлэх хувь. Үлдсэн талбар нь холбогдох ажлыг эхлүүлэхэд саад болно.'),
                    },
                    {
                      label: tr('Олгосон санхүүжилт'),
                      value: money(x.fin.given),
                      sub: x.fin.share == null ? undefined : tr('гэрээний {0}', pct(x.fin.share, 1)),
                      desc: tr('Гүйцэтгэгчид бодитоор олгосон урьдчилгаа ба гүйцэтгэлийн төлбөрийн нийлбэр.'),
                    },
                  ];
                  return (
                    <>
                      <KpiRow items={kpis} />
                      <Cap no="1.1">{tr('Үндсэн үзүүлэлт ба тайлбар')}</Cap>
                      <table className={r.table}>
                        <thead><tr>
                          <th>{tr('Үзүүлэлт')}</th><th className={r.num}>{tr('Утга')}</th><th>{tr('Тайлбар')}</th>
                        </tr></thead>
                        <tbody>
                          {kpis.map((kp) => (
                            <tr key={kp.label}>
                              <td>{kp.label}</td>
                              <td className={r.num}>{kp.value}{kp.sub ? <span className={e.kpiSub}> {kp.sub}</span> : null}</td>
                              <td>{kp.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  );
                })()}
                <Fig no="1.1">{tr('Ажлын төрлөөр төсөвт өртөг')}</Fig>
                <RankBars
                  title={tr('Ажлын төрөл бүрийн төсөв')}
                  fmt={money}
                  items={x.gdash.byType.map((t, i) => ({
                    label: t.label, value: t.cost, hot: i === 0,
                    text: `${money(t.cost)}${t.perf == null ? '' : ` · ${pct(t.perf, 1)}`}`,
                  }))}
                />
                <Cap no="1.2">{tr('Ажлын төрлөөр (төсөв, гэрээлсэн дүн, гүйцэтгэл)')}</Cap>
                <div className={r.tableScroll} tabIndex={0} role="region" aria-label={tr('Тайлангийн хүснэгт')}><table className={r.table}>
                  <thead><tr><th>{tr('Төрөл')}</th><th className={r.num}>{tr('Ажил')}</th><th className={r.num}>{tr('Гэрээт')}</th><th className={r.num}>{tr('Төсөв (₮)')}</th><th className={r.num}>{tr('Гэрээлсэн (₮)')}</th><th className={r.num}>{tr('Гүйц.')}</th></tr></thead>
                  <tbody>
                    {x.gdash.byType.map((t) => (
                      <tr key={t.label}>
                        <td>{t.label}</td><td className={r.num}>{num(t.n)}</td><td className={r.num}>{num(t.contracted)}</td>
                        <td className={r.num}>{num(t.cost)}</td><td className={r.num}>{t.contract > 0 ? num(t.contract) : '—'}</td>
                        <td className={r.num}>{t.perf == null ? '—' : pct(t.perf, 1)}</td>
                      </tr>
                    ))}
                    <tr className={r.total}>
                      <td>{tr('Нийт')}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.n, 0))}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.contracted, 0))}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.cost, 0))}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.contract, 0))}</td>
                      <td className={r.num} />
                    </tr>
                  </tbody>
                </table></div>
                {/* ⚠️ ЭНЭ МӨР ҮЛДЭНЭ: нэг хуудсан дээр ХОЁР өөр «нийт» тоо
                    байгаа тул тайлбаргүй бол тайлан өөртэйгөө зөрчилдсөн
                    мэт уншигдана. Гэхдээ албан ёсны, богино хэлбэрээр. */}
                <p className={r.note}>{tr('Нийт төсөв нь орон сууцны хороолол ба ГИШС-ийн хүрээгээр; доорх хүснэгт нь гэрээний бүх мөрийг хамарна.')}</p>

                {/* ⚠️ ЗАХИРАМЖИЙН ЭХ ҮҮСВЭР (2026-09-17, хэрэглэгчийн заавар):
                    ерөнхий дашбоард дээр байдаг чарт удирдлагын тайланд
                    байхгүй байв. Мөнгө хаанаас гарч байгаа нь шийдвэрийн
                    үндэслэл. */}
                {x.gdash.bySource.length > 0 && (() => {
                  const srcTotal = x.gdash.bySource.reduce((a, s) => a + s.amount, 0);
                  return (
                    <>
                      {/* ⚠️ KPI КАРТААР (2026-09-17, хэрэглэгчийн заавар).
                          Эх үүсвэр цөөн (4) бөгөөд тус бүр нь БИЕ ДААСАН
                          шийдвэрийн тоо тул зурвасаар харьцуулахаас илүү
                          карт болгож дүнг нь бүтнээр харуулах нь зөв.
                          ⚠️ Тоо нь `x.gdash.bySource`-оос шууд — эх өгөгдөл
                          шинэчлэгдэхэд өөрөө дагаж өөрчлөгдөнө. */}
                      <Fig no="1.2">{tr('Захирамжийн эх үүсвэр')}</Fig>
                      {/* ⚠️ 2 багана × 2 мөр (2026-09-17, хэрэглэгчийн заавар):
                          эх үүсвэрийн нэр урт тул нэг мөрөнд дөрвүүлэнг
                          хавчуулбал таслагдана. */}
                      <KpiRow cols={2} items={x.gdash.bySource.map((s) => ({
                        label: tr(s.label),
                        value: money(s.amount),
                        sub: tr('{0} · {1} ажил', pct(srcTotal ? (s.amount / srcTotal) * 100 : 0, 1), num(s.n)),
                      }))} />
                      <Cap no="1.3">{tr('Захирамжийн эх үүсвэр')}</Cap>
                      <table className={r.table}>
                        <thead><tr><th>{tr('Эх үүсвэр')}</th><th className={r.num}>{tr('Ажил')}</th><th className={r.num}>{tr('Гэрээт')}</th><th className={r.num}>{tr('Дүн (₮)')}</th><th className={r.num}>{tr('Хувь')}</th></tr></thead>
                        <tbody>
                          {x.gdash.bySource.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>{num(s.contracted)}</td>
                              <td className={r.num}>{num(s.amount)}</td>
                              <td className={r.num}>{srcTotal ? pct((s.amount / srcTotal) * 100, 1) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}><td>{tr('Нийт')}</td><td className={r.num}>{num(x.gdash.bySource.reduce((a, s) => a + s.n, 0))}</td><td className={r.num}>{num(x.gdash.bySource.reduce((a, s) => a + s.contracted, 0))}</td><td className={r.num}>{num(srcTotal)}</td><td className={r.num}>100.0%</td></tr>
                        </tbody>
                      </table>
                      {/* ⚠️ Хувь нь НИЙТ ТӨСӨВТ эзлэх БИШ гэдгийг ил хэлнэ */}
                      <p className={r.note}>{tr('Хувь нь захирамжийн нийт дүнд эзлэх жин; захирамжийн дүн бүх ажилд бүрэн бүртгэгдээгүй тул нийт төсвөөс бага.')}</p>
                    </>
                  );
                })()}

                <div className={e.one}>
                  {/* ── Газар чөлөөлөлт — 01-ийн карт ── */}
                  <div>
                    <Cap no="1.4">{tr('Газар чөлөөлөлтийн нэгж талбарын төлөв')}</Cap>
                    <div className={r.tableScroll} tabIndex={0} role="region" aria-label={tr('Тайлангийн хүснэгт')}><table className={r.table}>
                      <thead><tr><th>{tr('Төлөв')}</th><th className={r.num}>{tr('Талбар')}</th><th className={r.num}>{tr('Хувь')}</th></tr></thead>
                      <tbody>
                        {x.gdash.land.byStatus.map((b) => (
                          <tr key={b.label}>
                            <td className={b.label === PARCEL_CLEARED ? '' : e.warn}>{b.label}</td>
                            <td className={r.num}>{num(b.n)}</td>
                            <td className={r.num}>{x.gdash.land.total ? pct((b.n / x.gdash.land.total) * 100, 1) : '—'}</td>
                          </tr>
                        ))}
                        <tr className={r.total}><td>{tr('Нийт')}</td><td className={r.num}>{num(x.gdash.land.total)}</td><td className={r.num}>{x.gdash.landPct == null ? '—' : tr('чөлөөлсөн {0}', pct(x.gdash.landPct, 1))}</td></tr>
                      </tbody>
                    </table></div>
                    {x.gdash.land.reasons.length > 0 && (
                      <>
                        <Fig no="1.3">{tr('Чөлөөгдөөгүй шалтгаанаар ({0} нэгж талбар)', num(x.gdash.land.remaining))}</Fig>
                        <RankBars
                          title={tr('Чөлөөгдөөгүй талбарын шалтгаан')}
                          items={x.gdash.land.reasons.map((rs, i) => ({ label: rs.label, value: rs.n, hot: i === 0 }))}
                        />
                      </>
                    )}
                  </div>
                  {/* ── ХАБ — 01-ийн карт ── */}
                  <div>
                    <Cap no="1.5">{tr('ХАБ-ын талбайн хүн хүч')}{x.gdash.hse?.date ? ` · ${x.gdash.hse.date}` : ''}</Cap>
                    {x.gdash.hse ? (
                      <>
                        <KpiRow items={[
                          { label: tr('Ажиллаж буй хүн'), value: num(x.gdash.hse.workers) },
                          { label: tr('Техник хэрэгсэл'), value: num(x.gdash.hse.equipment) },
                          { label: tr('Хүн цаг'), value: num(x.gdash.hse.manHours) },
                        ]} />
                        <p className={r.note}>{tr('Тоо нь өдөр тутмын хуримтлал биш, сүүлийн бүртгэлийн агшны байдал.')}</p>
                      </>
                    ) : <p className={r.note}>{tr('ХАБ-ын бүртгэл алга, мэдээлэлгүй.')}</p>}
                  </div>
                </div>
              </section>

              {/*
                * ⚠️ 2 ба 3-Р ХЭСГИЙГ ЗЭРЭГЦҮҮЛЭХГҮЙ (2026-09-17, хэрэглэгчийн
                * шүүмж: «Багцын гүйцэтгэл эхлээд ямар замбараагүй болоод
                * байна вэ»).
                *
                * Урьд нь хоёр ДУГААРЛАСАН хэсэг `.two` торонд хоёр багана
                * болж байрладаг байв: 3-р хэсгийн 52 багцын жагсаалт хэдэн
                * мянган пиксел урсахад 2-р хэсэг эрт дуусаж зүүн тал хоосон
                * үлддэг, уншлагын дараалал ч эвдэрнэ (2-ын дунд 3 эхэлнэ).
                * ⚠️ PDF нь ХЭЗЭЭ Ч хоёр баганагүй — дараалсан хэсгүүд. Дэлгэц
                * зэрэгцүүлбэл «дэлгэц = PDF» дүрэм эвдэрнэ (`execPdf.ts`).
                * Зэрэгцүүлэлт нь ЗӨВХӨН нэг хэсэг доторх хоёр ЖИЖИГ картад
                * зөв (1-р хэсгийн газар чөлөөлөлт ↔ ХАБ).
                */}
              {/* ── 2. Багцын гүйцэтгэл ── */}
                <section id="exec-2" tabIndex={-1} className={r.section}>
                  <h2 className={r.h2}>{tr('2. Багцын гүйцэтгэл')}</h2>
                  <KpiRow items={[
                    { label: tr('Бодит'), value: x.prog.actual == null ? '—' : pct(x.prog.actual, 1), sub: x.prog.asOf ? tr('хэмжилт {0}', x.prog.asOf) : undefined },
                    { label: tr('Төлөвлөсөн'), value: x.prog.planned == null ? '—' : pct(x.prog.planned, 1) },
                    { label: tr('Зөрүү (нэгж хувь)'), value: x.prog.gap == null ? '—' : `${x.prog.gap > 0 ? '−' : x.prog.gap < 0 ? '+' : ''}${num(Math.abs(x.prog.gap), 1)}`, sub: x.prog.gap == null ? undefined : x.prog.gap >= LATE_GAP ? tr('хоцрогдол') : x.prog.gap < 0 ? tr('түрүүлэлт') : tr('хуваарийн дагуу') },
                  ]} />
                  <Meter value={x.prog.actual} plan={x.prog.planned} label={tr('Орон сууцны барилга угсралт')} />
                  <Fig no="2">{tr('Багц тус бүрийн биет гүйцэтгэл')}</Fig>
                  <RankBars
                    title={tr('Багц тус бүрийн биет гүйцэтгэл')}
                    max={100}
                    fmt={(v) => pct(v, 1)}
                    items={x.prog.packs.filter((p) => p.kind === 'build').sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1))
                      .map((p, i) => ({ label: p.name, value: p.progress, hot: i === 0 && p.progress != null }))}
                  />
                  <Cap no="2">{tr('Блокийн гүйцэтгэлийн түвшин')}</Cap>
                  <div className={r.tableScroll} tabIndex={0} role="region" aria-label={tr('Тайлангийн хүснэгт')}><table className={r.table}>
                    <thead><tr><th>{tr('Түвшин')}</th><th>{tr('Хувь')}</th><th className={r.num}>{tr('Блок')}</th></tr></thead>
                    <tbody>
                      {x.prog.levels.map((l) => <tr key={l.label}><td>{l.label}</td><td>{l.range}</td><td className={r.num}>{num(l.n)}</td></tr>)}
                      <tr><td className={e.warn}>{tr('Бөглөгдөөгүй')}</td><td className={e.warn}>—</td><td className={`${r.num} ${e.warn}`}>{num(x.prog.noData)}</td></tr>
                      <tr className={r.total}><td>{tr('Нийт')}</td><td>{num(x.prog.households)} {tr('өрх')}</td><td className={r.num}>{num(x.prog.blocks)}</td></tr>
                    </tbody>
                  </table></div>
                </section>

                {/* ── 3. Багцын санхүү ── */}
                <section id="exec-3" tabIndex={-1} className={r.section}>
                  <h2 className={r.h2}>{tr('3. Багцын санхүү')}</h2>
                  {/* ⚠️ 2026-09-21: `planTotal` = 1-р хэсгийн «Нийт гэрээлсэн дүн»-тэй ЯГ ИЖИЛ
                      (зөвхөн «Гэрээлсэн дүн» мөр); `given` = HO-ийн бүх төлбөр (`execReport.fin` ⚠️). */}
                  <KpiRow items={[
                    { label: tr('Гэрээлсэн нийт дүн'), value: money(x.fin.planTotal), sub: tr('1-р хэсэгтэй ижил') },
                    { label: tr('Олгосон'), value: money(x.fin.given), sub: x.fin.share == null ? undefined : pct(x.fin.share, 1) },
                    { label: tr('Үлдэгдэл'), value: money(x.fin.remain) },
                  ]} />
                  <Fig no="3">{tr('Санхүүжилт эхэлсэн {0} багц (олгосон дүн гэрээлсэн дүнд эзлэх хувиар)', num(finStarted.length))}</Fig>
                  <RankBars
                    title={tr('Багц тус бүрийн санхүүжилтийн хувь')}
                    fmt={(v) => pct(v, 1)}
                    max={100}
                    items={finStarted.map((f) => ({
                      label: f.label, value: f.pct, hot: f.pct != null && f.pct >= 50,
                      text: f.pct == null ? '—' : pct(f.pct, 1),
                    }))}
                  />
                  <Cap no="3">{tr('Багц тус бүрийн санхүүжилт (олгосон ба гэрээлсэн дүн)')}</Cap>
                  <div className={r.tableScroll} tabIndex={0} role="region" aria-label={tr('Тайлангийн хүснэгт')}><table className={r.table}>
                    <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Гэрээлсэн (₮)')}</th><th className={r.num}>{tr('Олгосон (₮)')}</th><th className={r.num}>{tr('Хувь')}</th></tr></thead>
                    <tbody>
                      {finStarted.map((f) => (
                        <tr key={f.key}>
                          {/* ⚠️ Гэрээгүй атлаа олголттой багц — ил тэмдэглэнэ (2026-09-21) */}
                          <td className={f.contracted ? '' : e.warn}>{f.label}{f.contracted ? '' : ` (${tr('гэрээгүй')})`}</td>
                          <td className={r.num}>{f.plan > 0 ? num(f.plan) : '—'}</td><td className={r.num}>{num(f.given)}</td>
                          <td className={`${r.num} ${f.pct != null && f.pct < 10 && f.plan > 0 ? e.warn : ''}`}>{f.pct == null ? '—' : pct(f.pct, 1)}</td>
                        </tr>
                      ))}
                      {/* ⚠️ ЭХЛЭЭГҮЙ АЖЛУУД НЭГ МӨРӨНД (2026-09-17, хэрэглэгчийн
                          заавар). Нэрс нь хавсралтад бүтнээрээ гарна — тайлан
                          бүгдийг харуулна гэсэн дүрэм хэвээр. */}
                      {finZero.length > 0 && (
                        <tr>
                          <td className={e.warn}>{tr('Эхлээгүй ажил ({0} гэрээт багц)', num(finZero.length))}</td>
                          <td className={`${r.num} ${e.warn}`}>{num(finZero.reduce((a, f) => a + f.plan, 0))}</td>
                          <td className={`${r.num} ${e.warn}`}>{num(0)}</td>
                          <td className={`${r.num} ${e.warn}`}>{pct(0, 1)}</td>
                        </tr>
                      )}
                      {/* ⚠️ ГЭРЭЭ БАЙГУУЛААГҮЙ (зөвхөн төсөвтэй) багц — ТУСДАА мөр (2026-09-21):
                          гэрээлсэн дүнд ОРОХГҮЙ, хувь бодогдохгүй; төсөв нь хавсралтад. */}
                      {finNone.length > 0 && (
                        <tr>
                          <td className={e.warn}>{tr('Гэрээ байгуулаагүй ажил ({0} багц)', num(finNone.length))}</td>
                          <td className={`${r.num} ${e.warn}`}>—</td>
                          <td className={`${r.num} ${e.warn}`}>{num(0)}</td>
                          <td className={`${r.num} ${e.warn}`}>—</td>
                        </tr>
                      )}
                      <tr className={r.total}><td>{tr('Нийт')}</td><td className={r.num}>{num(x.fin.planTotal)}</td><td className={r.num}>{num(x.fin.given)}</td><td className={r.num}>{x.fin.share == null ? '—' : pct(x.fin.share, 1)}</td></tr>
                    </tbody>
                  </table></div>
                  {finZero.length > 0 && (
                    <p className={r.note}>
                      {tr('«Эхлээгүй ажил» гэдэг нь гэрээ байгуулагдсан боловч олголт хараахан хийгдээгүй багцууд; нэрсийг хавсралтаас үзнэ үү.')}
                    </p>
                  )}
                  {finNone.length > 0 && (
                    <p className={r.note}>
                      {tr('«Гэрээ байгуулаагүй ажил» гэдэг нь зөвхөн төсөвт өртөгтэй, гэрээ хараахан байгуулагдаагүй багцууд; гэрээлсэн дүнд орохгүй, нэрс ба төсвийг хавсралтаас үзнэ үү.')}
                    </p>
                  )}
                  {x.fin.givenUnassigned > 0 && (
                    <p className={r.note}>
                      {tr('Нийт олгосон дүнд аль нэг багцад холбогдоогүй (хэд хэдэн багц хамарсан) {0} ₮ олголт орсон тул багцуудын нийлбэрээс их байна.', num(x.fin.givenUnassigned))}
                    </p>
                  )}
                </section>

              {/* ── 4. Зөвшөөрөл ── */}
              <section id="exec-4" tabIndex={-1} className={r.section}>
                <h2 className={r.h2}>{tr('4. Зөвшөөрөл')}</h2>
                {!x.zov ? (
                  <p className={r.note}>{tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул энэ хэсэг мэдээлэлгүй.')}</p>
                ) : (
                  <>
                    <KpiRow items={[
                      { label: tr('Зөвшөөрсөн'), value: `${num(x.zov.ok)} / ${num(x.zov.total)}` },
                      { label: tr('Хүлээгдэж буй'), value: num(x.zov.wait) },
                      { label: tr('Зөвшөөрөөгүй'), value: num(x.zov.no), sub: x.zov.unknown ? tr('танигдаагүй {0}', num(x.zov.unknown)) : undefined },
                    ]} />
                    <Cap no="4.1">{tr('Багц тус бүрийн зөвшөөрлийн төлөв')}</Cap>
                    <div className={r.tableScroll} tabIndex={0} role="region" aria-label={tr('Тайлангийн хүснэгт')}><table className={r.table}>
                      <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Нийт')}</th><th className={r.num}>{tr('Зөвшөөрсөн')}</th><th className={r.num}>{tr('Хүлээгдэж')}</th><th className={r.num}>{tr('Зөвшөөрөөгүй')}</th></tr></thead>
                      <tbody>
                        {x.zov.byBagts.map((b) => (
                          <tr key={b.bagts}>
                            <td>{b.bagts}</td><td className={r.num}>{num(b.total)}</td>
                            <td className={`${r.num} ${b.ok === b.total && b.total > 0 ? e.good : ''}`}>{num(b.ok)}</td>
                            <td className={r.num}>{num(b.wait)}</td>
                            <td className={`${r.num} ${b.no + b.unknown > 0 ? e.bad : ''}`}>{num(b.no + b.unknown)}</td>
                          </tr>
                        ))}
                        <tr className={r.total}><td>{tr('Нийт')}</td><td className={r.num}>{num(x.zov.total)}</td><td className={r.num}>{num(x.zov.ok)}</td><td className={r.num}>{num(x.zov.wait)}</td><td className={r.num}>{num(x.zov.no + x.zov.unknown)}</td></tr>
                      </tbody>
                    </table></div>
                    {x.zov.issues.length > 0 && (
                      <>
                        <Cap no="4.2">{tr('Анхаарал шаардах зөвшөөрлүүд')}</Cap>
                        <div className={r.tableScroll} tabIndex={0} role="region" aria-label={tr('Тайлангийн хүснэгт')}><table className={r.table}>
                          <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Шат')}</th><th>{tr('Зөвшөөрөл')}</th><th>{tr('Байгууллага')}</th><th>{tr('Төлөв')}</th></tr></thead>
                          <tbody>
                            {x.zov.issues.map((i, k) => (
                              <tr key={`${i.bagts}-${i.shat}-${k}`}>
                                <td>{i.bagts}</td><td className={r.num}>{num(i.shat)}</td><td>{i.ner}</td><td>{i.baiguullaga || '—'}</td>
                                <td className={i.tolov === TOLOV.no ? e.bad : e.warn}>{tr(i.tolov)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table></div>
                      </>
                    )}
                  </>
                )}
              </section>

              {/*
                * ── ДҮГНЭЛТ (2026-09-17, хэрэглэгчийн заавар) ──
                *
                * ⚠️ ТАЙЛАН ХЭЗЭЭ Ч ДҮГНЭЛТЭЭС ЭХЭЛДЭГГҮЙ. Урьд нь энэ блок
                * хамгийн ДЭЭР байсан: уншигч баримтыг хараагүй байж дүгнэлт
                * уншина гэдэг нь албан ёсны баримтын логик эсрэг. Одоо
                * дөрвөн хэсгийн ДАРАА, хавсралтын ӨМНӨ.
                * ⚠️ Урт нэрсийн жагсаалт ЭНД БИШ, ХАВСРАЛТАД — доорх
                * `appendix`-ийг үз.
                */}
              <section id="exec-5" tabIndex={-1} className={r.section}>
                <h2 className={r.h2}>{tr('5. Дүгнэлт')}</h2>
                <div className={e.ai}>
                  <div className={e.aiHead}>
                    <span>{summary ? tr('AI дүгнэлт') : tr('Гол дүгнэлт')}</span>
                  </div>
                  {summary ? <p className={e.aiText}>{summary}</p> : (
                    <ul className={e.findings}>
                      {findings.map((f, i) => (
                        <li key={`${f.area}-${i}`} className={`${e.finding} ${e[`sev_${f.sev}`]}`}>
                          <p className={e.findingTop}>
                            <span className={e.findingArea}>{f.area}</span>
                            <span className={e.findingText}>
                              {f.text}
                              {/* ⚠️ Нэрсийг ЭНД цувуулахгүй — хавсралт руу заана */}
                              {execAppendixNo(appendix, f) != null && (
                                <span className={e.findingRef}>
                                  {' '}{tr('Дэлгэрэнгүйг хавсралт {0}-аас үзнэ үү.', num(execAppendixNo(appendix, f) ?? 0))}
                                </span>
                              )}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {/*
                * ── ХАВСРАЛТ (2026-09-17, хэрэглэгчийн заавар: «хамгийн ард
                * хавсралт гэж гаргаад үүнд хэт сунжирсан мэдээллүүд ормоор
                * байна») ──
                * ⚠️ Мэдээлэл ХАСАГДААГҮЙ, ЗӨӨГДСӨН: нэр бүр хэвээр гарна
                * (тайлан бүгдийг харуулна). Зөвхөн байрлал нь өөрчлөгдсөн.
                */}
              {appendix.length > 0 && (
                <section id="exec-6" tabIndex={-1} className={r.section}>
                  <h2 className={r.h2}>{tr('Хавсралт')}</h2>
                  {/* ⚠️ Дараалал ба дугаар `execAppendix`-ээс — PDF-тэй ижил (2026-09-21) */}
                  {appendix.map((a) => (
                    <div key={`${a.kind}-${a.no}`}>
                      <p className={e.appHead}>
                        {tr('Хавсралт {0}. {1}', num(a.no), a.title)}
                        <span className={e.appN}>{tr('{0} мөр', num(a.items.length))}</span>
                      </p>
                      <FindingItems items={a.items} />
                    </div>
                  ))}
                </section>
              )}

              <p className={r.note} style={{ marginTop: 22 }}>
                {tr('Эх сурвалж: Сэлбэ порталын Ерөнхий дашбоард · Багцын гүйцэтгэл · Багцын санхүү · Зөвшөөрөл. Тайлан үүсгэсэн огнооны байдлаар.')}
              </p>
            </>
          )}
        </Data>
      </article>
    </>
  );
}

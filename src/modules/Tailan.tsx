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
import { t as tr } from '@/lib/i18nCore';
import { Fig, KpiRow, RankBars, TrendArea } from '@/modules/tailanChart';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct } from '@/lib/format';
import { useBagtsTable, type BagtsRow } from '@/modules/Dashboard';
import { emailViaEml, emailViaMailto, downloadReportPdf } from '@/lib/emailReport';
import {
  useReportExtra, buildFindings, type ReportExtra,
  /* ⚠️ 2026-09-04: эдгээр нь ХҮЛЭЭЛТИЙН ЯВЦЫГ хэмжихэд л хэрэглэгдэнэ — тоог нь
     хаана ч ХАРУУЛАХГҮЙ (доорх `ReportWaiting`-ийн тайлбарыг үз). Бүгд
     `cached()`-ээр ороосон тул энд дуудахад ШИНЭ HTTP хүсэлт ҮҮСЭХГҮЙ:
     `loadReportExtra` өөрөө яг эдгээр амлалтыг хуваалцаж байгаа. */
  loadOverall, loadProgress, loadFinance, loadLand, loadHabeaSummary,
} from '@/lib/reportData';
import { ResizableTable } from '@/components/ResizableTable';
import r from './report.module.css';

/** ₮ — БҮТЭН дүн, мянгатын таслалтай (2026-09-01, товчлолыг бүрэн хассан) */
const bn = (v: number) => num(v);
/**
 * ⚠️ ЗӨВХӨН Cashflow-ийн `budget`/`contract` дүнд хэрэглэнэ: тэг нь «төсөвт
 * өртөг хараахан батлагдаагүй / гэрээ байгуулагдаагүй» гэсэн утгатай тул 0
 * гэж бичвэл «үнэгүй» мэт уншигдана — «—» болгоно.
 */
const bnOrDash = (v: number) => (v > 0 ? bn(v) : '—');

/** Хүснэгтийн дугаартай тайлбар — ХҮСНЭГТИЙН ДЭЭД талд байрлана */
function Cap({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={r.caption}>{tr('Хүснэгт')} {no}. <span>{children}</span></p>;
}

/* ═══════════════ ХҮЛЭЭЛТИЙН ТӨЛӨВ ═══════════════ */

/**
 * ⚠️ 2026-09-04 (гүйцэтгэлийн аудит, LOW): «Тайлан» харагдац нээгдээд эхний
 * ~15–20 секундэд бараг ХООСОН байв. Хэмжсэн үзүүлэлт: t=8с үед хуудсанд ердөө
 * 194 тэмдэгт (3 товч ба «Багцын өгөгдөл нэгтгэж байна…» гэсэн ганц мөр),
 * t=20с үед л 12,532 тэмдэгт · 38 товч · 133 хүснэгтийн мөр гарч ирдэг байсан.
 * Явцын ямар ч заалт байхгүй тул хэрэглэгч «эвдэрсэн» гэж бодоод дахин дарах
 * эсвэл гарч явах эрсдэлтэй байлаа. Одоо ЯВЦ (аль эх сурвалж ирсэн) ба
 * тайлангийн АРАГ ЯС харагдана.
 *
 * ⚠️ ХЭСЭГЧИЛСЭН ТООГ ЭНД ГАРГАХГҮЙ. `reportData.ts` нь «дутуу тоогоор тайлан
 * гаргахгүй» гэсэн ил шийдвэртэй (хагас үнэн баримт нь худал баримттай ижил
 * эрсдэлтэй — албан ёсны PDF/мэйлд хэвлэгддэг). Тиймээс энэ хүлээлтийн төлөв
 * нь ЗӨВХӨН явцыг зурна: араг яс нь бүтцийг л харуулах бөгөөд «хараахан
 * ирээгүй» гэж ил тэмдэглэгдэнэ — `null ≠ 0`-ийн сүнс: «ирээгүй» ≠ «хоосон».
 * Хэрэв ирээдүйд §1-ийг эрт гаргах шаардлага гарвал `loadReportExtra`-ийн
 * бүх-эсвэл-юу-ч-үгүй гэрээг ТЭНД өөрчлөх ёстой, энд БИШ.
 */
const PROBES: { key: string; label: () => string; load: () => Promise<unknown> }[] = [
  { key: 'overall', label: () => tr('Нийт гүйцэтгэл (багцын жингээр)'), load: loadOverall },
  { key: 'progress', label: () => tr('Барилга угсралтын гүйцэтгэл'), load: loadProgress },
  { key: 'finance', label: () => tr('Санхүүжилт — захирамж, гэрээ, олголт'), load: loadFinance },
  { key: 'land', label: () => tr('Газар чөлөөлөлт'), load: loadLand },
  { key: 'habea', label: () => tr('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'), load: loadHabeaSummary },
];

/**
 * Аль эх сурвалж БЭЛЭН БОЛСНЫГ хянана.
 *
 * ⚠️ Алдааг энд ЗАЛГИНА (`() => {}`) — эх сурвалж унасныг `useReportExtra`
 * өөрөө барьж, нэрлэсэн алдаа ба «Дахин оролдох» товчийг гаргана. Энд дахин
 * мэдээлбэл нэг алдаа хоёр газар харагдана.
 */
function useSourceProgress(active: boolean): Record<string, boolean> {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    for (const p of PROBES) {
      p.load().then(
        () => { if (alive) setDone((d) => (d[p.key] ? d : { ...d, [p.key]: true })); },
        () => {},
      );
    }
    return () => { alive = false; };
  }, [active]);
  return done;
}

/** Хүлээсэн хугацаа (сек) — «зогссон уу?» гэсэн эргэлзээг арилгах цорын ганц хөдөлгөөн */
function useElapsed(active: boolean): number {
  /* ⚠️ Тоолуурыг ЗӨВХӨН таймерын callback-аас шинэчилнэ. Хоёр өөр хувилбар
     eslint-д унасан: (1) эффектийн биед `setSecs(0)` гэж тэглэх нь
     `react-hooks/set-state-in-effect`; (2) `useRef` + render дотор `Date.now()`
     нь `react-hooks/refs` ба «impure function during render» (ЭНЭ нь warning
     биш АЛДАА). Тиймээс тэглэлтийг ч 0мс-ийн `setTimeout`-оор — кэш хүчингүй
     болж дахин ачаалахад тоолуур хуучин секундээ барихгүй. */
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const upd = () => setSecs(Math.round((Date.now() - t0) / 1000));
    const first = setTimeout(upd, 0);
    const id = setInterval(upd, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active]);
  return secs;
}

/** Араг ясны саарал мөр — өргөнийг өөр өөр өгснөөр текст мэт уншигдана */
function SkelBar({ w }: { w: string }) {
  return (
    <div
      aria-hidden
      style={{
        height: 9, width: w, marginBottom: 7, borderRadius: 4,
        background: 'var(--surface-2)',
      }}
    />
  );
}

/**
 * Хүлээлтийн харагдац — явцын самбар + тайлангийн араг яс.
 *
 * ⚠️ Хэсгийн ГАРЧГУУД нь бодит тайлангийнхтай ЯГ ижил мөр (нэг `tr()`
 * түлхүүр) — уншигч «энэ юу ирэх гэж байна» гэдгийг таньж, ирснийхээ дараа
 * байрлал үсрэхгүй.
 */
function ReportWaiting({ steps, secs }: { steps: { label: string; done: boolean }[]; secs: number }) {
  const ready = steps.filter((s) => s.done).length;
  const sections = [
    tr('1. Үндсэн үзүүлэлт'),
    tr('2. Орон сууцны 7 багц'),
    tr('3. Багцын жигнэсэн гүйцэтгэл'),
    tr('4. Газар чөлөөлөлт'),
    tr('5. Нийгмийн үйлчилгээний барилга'),
    tr('6. Барилга угсралтын гүйцэтгэл'),
    tr('7. Санхүүжилтийн явц'),
    tr('8. Дэд бүтцийн хэрэгжилт'),
    tr('9. Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'),
    tr('10. Дүгнэлт, анхаарах асуудал'),
  ];
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{
          border: '1px solid var(--line)', borderRadius: 'var(--r, 6px)',
          padding: '14px 16px', marginBottom: 22, background: 'var(--surface-2)',
        }}
      >
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {tr('Тайлан бэлтгэгдэж байна — {0} эх сурвалжаас {1} нь ирлээ', num(steps.length), num(ready))}
        </p>
        {/* Явцын зурвас — тоо ба урт нь ИЖИЛ эх сурвалжаас, зөрөх боломжгүй */}
        <div
          aria-hidden
          style={{
            height: 5, marginTop: 10, borderRadius: 3, overflow: 'hidden',
            background: 'color-mix(in srgb, var(--ink-3) 22%, transparent)',
          }}
        >
          <div
            style={{
              height: '100%', width: `${(ready / steps.length) * 100}%`,
              background: 'var(--accent)', transition: 'width .25s ease',
            }}
          />
        </div>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, fontSize: 11.5 }}>
          {steps.map((s) => (
            <li
              key={s.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                color: s.done ? 'var(--ink-2)' : 'var(--ink-3)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7, height: 7, borderRadius: '50%', flex: 'none',
                  background: s.done ? 'var(--accent)' : 'transparent',
                  border: s.done ? 'none' : '1px solid var(--ink-3)',
                }}
              />
              <span>{s.label}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {s.done ? tr('бэлэн') : tr('татагдаж байна…')}
              </span>
            </li>
          ))}
        </ul>
        <p className={r.note} style={{ marginTop: 10 }}>
          {tr('Ихэвчлэн 15–25 секунд үргэлжилнэ. Одоогоор {0} секунд болов.', num(secs))}
          {' '}
          {/* ⚠️ Дэд бүтэц ба нийгмийн барилгын ачаалагч нь `reportData.ts`-ээс
              экспортлогдоогүй тул тусад нь хэмжигдэхгүй — «бэлэн» гэж ХУДАЛ
              тоолохын оронд ил хэлнэ. Экспортлогдвол `PROBES`-д нэмнэ. */}
          {tr('Дэд бүтэц ба нийгмийн үйлчилгээний давхаргууд мөн зэрэг татагдаж байгаа ч явцыг нь тусад нь хэмждэггүй.')}
        </p>
      </div>

      {sections.map((title, i) => (
        <section key={title} className={r.section}>
          <h2 className={r.h2} style={{ color: 'var(--ink-3)' }}>
            {title}
            <span style={{ float: 'right', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {tr('хараахан ирээгүй')}
            </span>
          </h2>
          <SkelBar w="92%" />
          <SkelBar w="78%" />
          {/* Хүснэгттэй хэсгүүд ӨНДӨР тул араг яс нь ч өндөр — өгөгдөл ирэхэд
              хуудас бага үсэрнэ */}
          {i !== 9 && <><SkelBar w="60%" /><SkelBar w="86%" /><SkelBar w="45%" /></>}
        </section>
      ))}
    </>
  );
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
        alert(tr('{0} үүсгэхэд алдаа гарлаа: ', what) + (e instanceof Error ? e.message : String(e)));
      } finally {
        setBusy(false);
      }
    },
    [rows, extra, busy, date],
  );

  const send = useCallback(() => run(emailViaEml, tr('Тайлан')), [run]);
  const sendWeb = useCallback(() => run(emailViaMailto, tr('Мэйл')), [run]);
  const savePdf = useCallback(() => run(downloadReportPdf, 'PDF'), [run]);

  // ⚠️ PDF нь дэлгэцтэй ИЖИЛ байх ёстой тул БҮХ өгөгдөл ачаалагдтал илгээхгүй
  const ready = !!rows && !!extra;

  /* ⚠️ Алдаа гарсан бол хүлээлтийн араг ясыг ХАРУУЛАХГҮЙ — `Data` нь нэрлэсэн
     алдаа ба «Дахин оролдох» товчийг гаргах ёстой. Эс бөгөөс унасан эх
     сурвалж «ачаалж байна» мэт мөнхөд харагдана. */
  const failed = bagts.state === 'error' || ex.state === 'error';
  const waiting = !failed && (bagts.state === 'loading' || ex.state === 'loading');
  const doneMap = useSourceProgress(waiting);
  const secs = useElapsed(waiting);
  const steps = [
    { label: tr('Багцын нэгдсэн хүснэгт'), done: bagts.state === 'ready' },
    ...PROBES.map((p) => ({ label: p.label(), done: !!doneMap[p.key] })),
  ];

  return (
    <div className={r.wrap}>
      <div className={r.toolbar}>
        <div className={r.tools}>
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={send}
            title={tr('Outlook нээгдэж, мэйл бичигдсэн, PDF хавсаргагдсан, Send дарахад бэлэн (юу ч чирэх шаардлагагүй)')}
          >
            <Icon name="chart" size={15} />
            {busy ? tr('Бэлтгэж байна…') : tr('Outlook-оор илгээх')}
          </button>
          {/* ⚠️ Хоёр дахь зам — New Outlook / вэб OWA. Тэнд .eml нь бичих цонх
              нээдэггүй тул `mailto:` (хавсралтгүй, PDF нь тусад нь татагдана). */}
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={sendWeb}
            title={tr('New Outlook эсвэл вэб хувилбар (OWA) ашигладаг бол — мэйл бичих цонх нээгдэж, PDF нь тусад нь татагдана')}
          >
            <Icon name="chart" size={15} />
            {tr('Шинэ Outlook / вэб')}
          </button>
          {/* Мэйлгүй зам — файлыг өөрөө хадгалаад хүссэн сувгаараа илгээнэ */}
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={savePdf}
            title={tr('Зөвхөн PDF файлыг татах — мэйл програм нээхгүй')}
          >
            <Icon name="chart" size={15} />
            {tr('PDF татах')}
          </button>
        </div>
      </div>

      <article className={r.paper}>
        <header className={r.docHead}>
          <h1 className={r.title}>{tr('Сэлбэ 20 минутын хот — Ерөнхий тайлан')}</h1>
          <p className={r.sub}>
            {tr('Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт')}{date && <> {tr('· Огноо:')} {date}</>}
          </p>
        </header>

        {waiting ? <ReportWaiting steps={steps} secs={secs} /> : (
        <Data q={bagts} loading={tr('Багцын өгөгдөл нэгтгэж байна…')}>
          {(rows) => (
            <Data q={ex} loading={tr('Гүйцэтгэл, санхүү, газар, дэд бүтэц, ХАБЭА-гийн өгөгдөл нэгтгэж байна…')}>
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
                        {tr('Сэлбэ 20 минутын хотын төслийн хэрэгжилт тайлан үүсгэх өдрийн байдлаар')} <strong>{pct(x.overall.pct, 2)}</strong>{tr('-тай байна. Төслийн төсвийн')} <strong>{pct(d.buildWeight, 1)}</strong>{tr('-ийг эзэлдэг барилга угсралтын ажил')} <strong>{pct(d.buildActual, 2)}</strong>{tr('-ийн гүйцэтгэлтэй')}
                        {d.buildLag != null && (
                          <> {tr('буюу төлөвлөгөөнөөс')} <strong>{num(d.buildLag, 1)} {tr('нэгж хувиар')}</strong> {tr('хоцорч байна')}</>
                        )}
                        {/* ⚠️ ЭХ СУРВАЛЖИЙН ШОШГО ЗААВАЛ: энэ хувь нь нэгж
                            талбарын ТӨЛВӨӨС (шийдвэрлэгдсэн ÷ нийт) бодогддог
                            бөгөөд «Газар чөлөөлөлт» дашбоардын үе шатны
                            хувиас зөрж болно (land.ts-ийн тайлбар). */}
                        {tr('. Газар чөлөөлөлтийн гүйцэтгэл нэгж талбарын төлвөөр')}
                        {x.land.pct != null && <> <strong>{pct(x.land.pct, 1)}</strong></>} {tr('байгаа ч')}
                        {' '}{num(d.landLeft)} {tr('нэгж талбар шийдвэрлэгдээгүй үлдсэн байна.')}
                      </p>
                      <p>
                        {tr('Санхүүгийн хувьд захирамжаар')} <strong>{bn(x.finance.orderTotal)} {tr('₮')}</strong>
                        {' '}{tr('батлагдсанаас')} <strong>{bn(x.finance.contractAmount)} {tr('₮')}</strong>
                        {d.contractRate != null && <> ({pct(d.contractRate, 1)})</>} {tr('нь гэрээгээр баталгаажиж,')}
                        {' '}<strong>{bn(x.finance.paid)} {tr('₮')}</strong>
                        {d.paidRate != null && <> ({pct(d.paidRate, 1)})</>} {tr('нь бодитоор олгогдсон байна.')}
                      </p>
                      <p>
                        {tr('Барилгын талбайд')} <strong>{num(x.habea.workers)} {tr('ажилтан')}</strong>,
                        {' '}{num(x.habea.tehnik)} {tr('нэгж техник ажиллаж байгаа бөгөөд орон сууцны')}
                        {' '}{num(blocks)} {tr('блок,')} {num(ail)} {tr('өрхийн орон сууц баригдаж байна.')}
                      </p>
                    </div>

                    {/* ── 1. Үндсэн үзүүлэлт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('1. Үндсэн үзүүлэлт')}</h2>
                      <p className={r.intro}>
                        {tr('Энэ хэсэгт төслийн цар хүрээ, гүйцэтгэл, санхүүжилтийн долоон гол үзүүлэлтийг нэгтгэв. Гүйцэтгэлийн хоёр өөр хэмжүүрийг ялган үзэх нь зүйтэй: төслийн нийт гүйцэтгэл нь багц бүрийг төсвийн жингээр нь тооцсон дүн бол барилга угсралтын гүйцэтгэл нь блокуудын энгийн дундаж.')}
                      </p>
                      {/* ⚠️ ТОЛГОЙ ТООГ ГРАФИК БОЛГОХГҮЙ: нэг утгыг багана болгон
                          зурах нь мэдээлэл нэмэхгүй, зөвхөн зай иднэ. Тоо нь өөрөө
                          «график» — тиймээс үзүүлэлтийн эгнээ. */}
                      <KpiRow items={[
                        { label: tr('Орон сууцны блок'), value: num(blocks) },
                        { label: tr('Өрхийн орон сууц'), value: num(ail) },
                        { label: tr('Төслийн нийт гүйцэтгэл'), value: pct(x.overall.pct, 2) },
                        { label: tr('Барилга угсралтын гүйцэтгэл'), value: pct(x.progress.overall, 2) },
                        { label: tr('Захирамжаар батлагдсан'), value: `${bn(x.finance.orderTotal)} ₮` },
                        { label: tr('Гэрээгээр байгуулагдсан'), value: `${bn(x.finance.contractAmount)} ₮` },
                        { label: tr('Бодитоор олгосон'), value: `${bn(x.finance.paid)} ₮` },
                      ]} />
                      {/* Санхүүжилтийн гурван шат нь ХООРОНДОО хамаарна:
                          захирамж ⊇ гэрээ ⊇ олголт. Тиймээс хэсэг-бүтэн БИШ,
                          нэг тэнхлэг дээрх харьцуулалт. */}
                      <Fig no="1">{tr('Санхүүжилтийн гурван шат — захирамжаас олголт хүртэл')}</Fig>
                      <RankBars
                        title={tr('Санхүүжилтийн гурван шатны харьцуулалт')}
                        items={[
                          { label: tr('Захирамжаар батлагдсан'), value: x.finance.orderTotal, text: `${bn(x.finance.orderTotal)} ₮` },
                          { label: tr('Гэрээгээр байгуулагдсан'), value: x.finance.contractAmount, text: `${bn(x.finance.contractAmount)} ₮` },
                          { label: tr('Бодитоор олгосон'), value: x.finance.paid, text: `${bn(x.finance.paid)} ₮`, hot: true },
                        ]}
                      />
                      <Cap no="1">{tr('Төслийн нэгдсэн үзүүлэлт')}</Cap>
                      <ResizableTable storeKey="tailan.tovch" className={r.table}>
                        <thead><tr><th>{tr('Үзүүлэлт')}</th><th className={r.num}>{tr('Утга')}</th></tr></thead>
                        <tbody>
                          <tr><td>{tr('Орон сууцны блок')}</td><td className={r.num}>{num(blocks)}</td></tr>
                          <tr><td>{tr('Өрхийн орон сууц')}</td><td className={r.num}>{num(ail)}</td></tr>
                          <tr>
                            <td>{tr('Төслийн нийт гүйцэтгэл')}</td>
                            <td className={r.num}>{pct(x.overall.pct, 2)}</td>
                          </tr>
                          <tr>
                            <td>{tr('Барилга угсралтын гүйцэтгэл')}</td>
                            <td className={r.num}>{pct(x.progress.overall, 2)}</td>
                          </tr>
                          <tr>
                            <td>{tr('Захирамжаар батлагдсан дүн')}</td>
                            <td className={r.num}>{bn(x.finance.orderTotal)} {tr('₮')}</td>
                          </tr>
                          <tr>
                            <td>{tr('Гэрээгээр байгуулагдсан дүн')}</td>
                            <td className={r.num}>{bn(x.finance.contractAmount)} {tr('₮')}</td>
                          </tr>
                          <tr className={r.total}>
                            <td>{tr('Бодитоор олгосон санхүүжилт')}</td>
                            <td className={r.num}>{bn(x.finance.paid)} {tr('₮')}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Төслийн нийт гүйцэтгэл нь')} {num(x.overall.rows)} {tr('блокийг багцынх нь төсвийн жингээр тооцсон дүн (3-р хэсэг); барилга угсралтын гүйцэтгэл нь хяналтын')} {num(x.progress.blocks)} {tr('блокийн энгийн дундаж (6-р хэсэг).')}
                      </p>
                    </section>

                    {/* ── 2. Орон сууцны 7 багц ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('2. Орон сууцны 7 багц')}</h2>
                      <p className={r.intro}>
                        {tr('Орон сууцны барилгажилт долоон багцад хуваагдан хэрэгжиж байна. Нийт')} {num(blocks)} {tr('блокт')} {num(ail)} {tr('өрхийн орон сууц төлөвлөгдсөн бөгөөд төсөвт өртөг')} {bn(budget)} {tr('₮ байна. Багц хоорондын гүйцэтгэлийн зөрүү их байна: хамгийн өндөр нь')} {tr(d.bestBagts?.bagts ?? '')}
                        ({pct(d.bestBagts?.pct ?? null, 2)}{tr('), хамгийн бага нь')}
                        {' '}{tr(d.worstBagts?.bagts ?? '')} ({pct(d.worstBagts?.pct ?? null, 2)}).
                      </p>
                      {/* ⚠️ ТӨСӨВ (₮) ба ГҮЙЦЭТГЭЛ (%) нь өөр хэмжигдэхүүн тул
                          НЭГ зурагт давхарлахгүй — хоёр тэнхлэгтэй график нь
                          масштабын дурын харьцаагаар байхгүй хамаарлыг зохионо. */}
                      <Fig no="2.1">{tr('Багц тус бүрийн төсөвт өртөг')}</Fig>
                      <RankBars
                        title={tr('Багц тус бүрийн төсөвт өртөг')}
                        items={sorted.map((b) => ({
                          label: tr(b.label),
                          value: budgetOf(b.key) > 0 ? budgetOf(b.key) : null,
                          text: `${bn(budgetOf(b.key))} ₮`,
                        }))}
                      />
                      <Fig no="2.2">{tr('Багц тус бүрийн гүйцэтгэл — хамгийн өндөр нь тодруулсан')}</Fig>
                      <RankBars
                        title={tr('Багц тус бүрийн гүйцэтгэлийн хувь')}
                        max={100}
                        items={[...sorted]
                          .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
                          .map((b) => ({
                            label: tr(b.label),
                            value: b.progress,
                            text: pct(b.progress, 2),
                            hot: b.label === d.bestBagts?.bagts,
                          }))}
                      />
                      <Cap no="2">{tr('Багц тус бүрийн блок, өрх, төсөв ба гүйцэтгэл (төсөвт өртгөөр буурах эрэмбээр)')}</Cap>
                      <ResizableTable storeKey="tailan.bagts" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Багц')}</th>
                            <th className={r.num}>{tr('Блок')}</th>
                            <th className={r.num}>{tr('Өрх')}</th>
                            <th className={r.num}>{tr('Төсөв (₮)')}</th>
                            <th className={r.num}>{tr('Гүйцэтгэл')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((b) => (
                            <tr key={b.key}>
                              <td>{tr(b.label)}</td>
                              <td className={r.num}>{num(b.blocks)}</td>
                              <td className={r.num}>{num(b.ail)}</td>
                              <td className={r.num}>{budgetOf(b.key) > 0 ? bn(budgetOf(b.key)) : '—'}</td>
                              <td className={r.num}>{pct(b.progress, 2)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(blocks)}</td>
                            <td className={r.num}>{num(ail)}</td>
                            <td className={r.num}>{bn(budget)}</td>
                            <td className={r.num}>{pct(bagtsAvg, 2)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                    </section>

                    {/* ── 3. Багцын жигнэсэн гүйцэтгэл ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('3. Багцын жигнэсэн гүйцэтгэл')}</h2>
                      <p className={r.intro}>
                        {tr('Багц бүр төслийн төсөвт эзлэх өөрийн жинтэй тул нийт гүйцэтгэл нь энгийн дундаж биш, жин харгалзан тооцсон дүн болно. Одоогийн байдлаар төслийн төсвийн')} {pct(d.heavyStage?.weight ?? null, 1)}{tr('-ийг «')}{tr(d.heavyStage?.label ?? "")}{tr('» багц эзэлж байгаа тул нийт гүйцэтгэл голчлон түүнээс хамаарч байна.')}
                      </p>
                      {/* ⚠️ ДАВХАРЛАСАН НЭГ ЗУРВАС ХЭРЭГЛЭХГҮЙ (2026-09-03,
                          хэрэглэгчийн заавар). Ойролцоо утгуудыг нэг мөрөнд
                          хэрчимлэхэд аль нь аль нээсээ том болох нь нүдээр
                          харьцуулагдахгүй — хэрчим бүр өөр цэгээс эхэлдэг.
                          Хэвтээ багана нь бүгд НЭГ суурьтай тул урт нь шууд
                          харьцуулагдана. */}
                      <Fig no="3">{tr('Багц бүрийн төсөвт эзлэх жин — нийт гүйцэтгэл голчлон эндээс хамаарна')}</Fig>
                      <RankBars
                        title={tr('Багц бүрийн төсөвт эзлэх жин')}
                        items={[...x.overall.stages]
                          .filter((s) => s.weight != null && s.weight > 0)
                          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
                          .map((s, i) => ({
                            label: tr(s.label),
                            value: s.weight ?? 0,
                            text: pct(s.weight, 1),
                            hot: i === 0,
                          }))}
                      />
                      <Cap no="3">{tr('Багцын эзлэх жин ба бодит гүйцэтгэл')}</Cap>
                      <ResizableTable storeKey="tailan.uyeshat" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Багц')}</th>
                            <th className={r.num}>{tr('Блок')}</th>
                            <th className={r.num}>{tr('Эзлэх жин')}</th>
                            <th className={r.num}>{tr('Гүйцэтгэл')}</th>
                            <th className={r.num}>{tr('Төлөвлөгөө')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.overall.stages.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{num(s.rows)}</td>
                              <td className={r.num}>{pct(s.weight, 2)}</td>
                              <td className={r.num}>{pct(s.actual, 2)}</td>
                              <td className={r.num}>{s.planned == null ? '—' : pct(s.planned, 1)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.overall.rows)}</td>
                            <td className={r.num}>{pct(x.overall.weightSum, 2)}</td>
                            <td className={r.num}>{pct(x.overall.pct, 2)}</td>
                            <td className={r.num}>—</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Эзлэх жингийн нийлбэр')} {pct(x.overall.weightSum, 2)} {tr('— гүйцэтгэл хараахан бүртгэгдээгүй багц байгаа тул нийт дүнг жингийн нийлбэрт харьцуулан тооцов. Багцын түвшинд төлөвлөгөөт хувь одоогоор байхгүй тул «—» тэмдгээр илэрхийлэв.')}
                      </p>
                    </section>

                    {/* ── 4. Газар чөлөөлөлт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('4. Газар чөлөөлөлт')}</h2>
                      <p className={r.intro}>
                        {tr('Төслийн талбайд нийт')} {num(x.land.parcels)} {tr('нэгж талбар (')}{num(x.land.areaM2)} {tr('м²) бүртгэгдсэн бөгөөд шийдвэрлэгдсэн нь')}
                        {' '}{x.land.pct != null ? pct(x.land.pct, 1) : '—'} {tr('байна. Ажлын үндсэн хэсэг дууссан ч')} {num(d.landLeft)} {tr('нэгж талбар шийдвэрлэгдээгүй хэвээр байгаа нь барилга угсралтын хуваарьт нөлөөлөх эрсдэлтэй.')}
                      </p>
                      {/* ⚠️ Нийт 2,117-гийн доторх хуваарилалт ч давхарласан зурвас
                          БИШ: «Бүрэн чөлөөлсөн» 80%-ийг эзлэхэд үлдсэн дөрөв нь
                          нимгэн хэрчим болж, хооронд нь харьцуулах боломжгүй.
                          Тусдаа багана нь 1,703 ↔ 201 ↔ 171-ийг ил харуулна. */}
                      <Fig no="4">{tr('Нэгж талбарын төлөв — шийдвэрлэсэн ба үлдсэн')}</Fig>
                      <RankBars
                        title={tr('Нэгж талбарын төлөв')}
                        items={[...x.land.byStatus]
                          .sort((a, b) => b.n - a.n)
                          .map((s) => ({
                            label: tr(s.label),
                            value: s.n,
                            text: `${num(s.n)} · ${x.land.parcels ? pct((s.n / x.land.parcels) * 100, 1) : '—'}`,
                          }))}
                      />
                      <Cap no="4.1">{tr('Нэгж талбарын төлөв')}</Cap>
                      <ResizableTable storeKey="tailan.gazar" className={r.table}>
                        <thead><tr><th>{tr('Төлөв')}</th><th className={r.num}>{tr('Нэгж талбар')}</th><th className={r.num}>{tr('Эзлэх хувь')}</th></tr></thead>
                        <tbody>
                          {x.land.byStatus.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>
                                {x.land.parcels ? pct((s.n / x.land.parcels) * 100, 1) : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.land.parcels)}</td>
                            <td className={r.num}>100%</td>
                          </tr>
                        </tbody>
                      </ResizableTable>

                      {x.land.byReason.length > 0 && (
                        <>
                          <Cap no="4.2">
                            {tr('Шийдвэрлэгдээгүй нэгж талбарын шалтгаан')}
                            {d.topReason && tr(' — тэргүүлэх шалтгаан «{0}»', tr(d.topReason.label))}
                          </Cap>
                          <ResizableTable storeKey="tailan.shaltgaan" className={r.table}>
                            <thead><tr><th>{tr('Шалтгаан')}</th><th className={r.num}>{tr('Нэгж талбар')}</th></tr></thead>
                            <tbody>
                              {x.land.byReason.map((s) => (
                                <tr key={s.label}>
                                  <td>{tr(s.label)}</td>
                                  <td className={r.num}>{num(s.n)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </ResizableTable>
                        </>
                      )}
                    </section>

                    {/* ── 5. Нийгмийн үйлчилгээний барилга ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('5. Нийгмийн үйлчилгээний барилга')}</h2>
                      <p className={r.intro}>
                        {tr('Орон сууцны хорооллыг дагалдан ерөнхий төлөвлөгөөнд')}
                        {' '}{num(x.social.n)} {tr('нийгмийн үйлчилгээний байгууламж, нийт')}
                        {' '}{tr('барилгын талбай')} {num(x.social.areaM2)} {tr('м² тусгагдсан байна. Эдгээр нь сургууль, цэцэрлэг, төрийн үйлчилгээ, хүүхдийн хөгжлийн байгууламжийг хамарна.')}
                      </p>
                      <Cap no="5">{tr('Нийгмийн үйлчилгээний байгууламжийн жагсаалт')}</Cap>
                      <ResizableTable storeKey="tailan.niitiin" className={r.table}>
                        <thead><tr><th>{tr('Байгууламж')}</th><th className={r.num}>{tr('Тоо')}</th><th className={r.num}>{tr('Талбай (м²)')}</th></tr></thead>
                        <tbody>
                          {x.social.rows.map((s) => (
                            <tr key={s.title}>
                              <td>{tr(s.title)}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>{s.areaM2 > 0 ? num(s.areaM2) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.social.n)}</td>
                            <td className={r.num}>{num(x.social.areaM2)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                    </section>

                    {/* ── 6. Барилга угсралтын гүйцэтгэл ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('6. Барилга угсралтын гүйцэтгэл')}</h2>
                      <p className={r.intro}>
                        {tr('Хяналтын')} {num(x.progress.blocks)} {tr('блокийн ажлын үе шат тус бүрийн гүйцэтгэлээс тооцсон дундаж')} {pct(x.progress.overall, 2)} {tr('байна')}
                        {x.progress.date && <> {tr('(сүүлийн тайлагнал')} {x.progress.date})</>}.
                        {d.startedPhases.length > 0 && (
                          <> {tr('Одоогоор «')}{d.startedPhases.map((x: string) => tr(x)).join('», «')}{tr('» үе шат эхэлсэн')}</>
                        )}
                        {d.notStartedPhases.length > 0 && (
                          <> {tr('бөгөөд үлдсэн')} {num(d.notStartedPhases.length)} {tr('үе шат хараахан эхлээгүй байна')}</>
                        )}.
                      </p>
                      <Fig no="6.1">{tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')}</Fig>
                      <RankBars
                        title={tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')}
                        max={100}
                        items={[...x.progress.byBagts]
                          .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
                          .map((b) => ({ label: tr(b.bagts), value: b.pct, text: pct(b.pct, 2) }))}
                      />
                      <Cap no="6.1">{tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')}</Cap>
                      <ResizableTable storeKey="tailan.guits-bagts" className={r.table}>
                        <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Блок')}</th><th className={r.num}>{tr('Гүйцэтгэл')}</th></tr></thead>
                        <tbody>
                          {x.progress.byBagts.map((b) => (
                            <tr key={b.bagts}>
                              <td>{tr(b.bagts)}</td>
                              <td className={r.num}>{num(b.blocks)}</td>
                              <td className={r.num}>{pct(b.pct, 2)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.progress.blocks)}</td>
                            <td className={r.num}>{pct(x.progress.overall, 2)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>

                      <Fig no="6.2">{tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')}</Fig>
                      <RankBars
                        title={tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')}
                        max={100}
                        items={x.progress.phases.map((p) => ({ label: tr(p.name), value: p.pct, text: pct(p.pct, 2) }))}
                      />
                      <Cap no="6.2">{tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')}</Cap>
                      <ResizableTable storeKey="tailan.guits-shat" className={r.table}>
                        <thead><tr><th>{tr('Үе шат')}</th><th className={r.num}>{tr('Дундаж гүйцэтгэл')}</th></tr></thead>
                        <tbody>
                          {x.progress.phases.map((p) => (
                            <tr key={p.no}>
                              <td>{tr(p.no)}. {tr(p.name)}</td>
                              <td className={r.num}>{pct(p.pct, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </ResizableTable>

                      <Cap no="6.3">
                        {tr('Гүйцэтгэл хамгийн бага арван блок — анхаарал шаардсан ажлууд')}
                      </Cap>
                      <ResizableTable storeKey="tailan.udaan" className={r.table}>
                        <thead><tr><th>{tr('Багц')}</th><th>{tr('Блок')}</th><th className={r.num}>{tr('Гүйцэтгэл')}</th></tr></thead>
                        <tbody>
                          {x.progress.slowest.map((b) => (
                            <tr key={`${b.bagts}|${b.block}`}>
                              <td>{tr(b.bagts)}</td>
                              <td>{tr(b.block)}</td>
                              <td className={r.num}>{pct(b.pct, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Дундаж нь блок бүрийг тэнцүү жинтэйгээр тооцсон; 2-р хэсгийн багцын гүйцэтгэлтэй нэг эх сурвалжаас гарна.')}
                      </p>
                    </section>

                    {/* ── 7. Санхүүжилтийн явц ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('7. Санхүүжилтийн явц')}</h2>
                      <p className={r.intro}>
                        {tr('Захирамж, гэрээгээр баталгаажсан')} {num(x.finance.rows)} {tr('ажлын санхүүжилт дөрвөн эх үүсвэрээс бүрдэж байна.')}
                        {d.topSource && (
                          <> {tr('Санхүүжилтийн дийлэнх хэсгийг «')}{tr(d.topSource.label)}{tr('» эх үүсвэр бүрдүүлж, нийт дүнгийн')} {pct(d.topSource.share, 1)}{tr('-ийг эзэлж байна.')}</>
                        )}
                      </p>
                      {/* ⚠️ Эх үүсвэрийн 0.2% ба 0.0% нь давхарласан зурваст 2px-ийн
                          үл үзэгдэх хэрчим болдог байв. Тусдаа багана нь бага утгыг ч
                          нэртэй нь харуулна. */}
                      <Fig no="7.1">{tr('Санхүүжилтийн эх үүсвэрийн бүтэц')}</Fig>
                      <RankBars
                        title={tr('Санхүүжилтийн эх үүсвэрийн бүтэц')}
                        items={[...x.finance.sources]
                          .sort((a, b) => b.value - a.value)
                          .map((s, i) => ({
                            label: tr(s.label),
                            value: s.value,
                            text: `${bn(s.value)} ₮ · ${srcTotal ? pct((s.value / srcTotal) * 100, 1) : '—'}`,
                            hot: i === 0,
                          }))}
                      />
                      <Cap no="7.1">{tr('Санхүүжилтийн эх үүсвэрийн бүтэц')}</Cap>
                      <ResizableTable storeKey="tailan.eh-uusver" className={r.table}>
                        <thead><tr><th>{tr('Эх үүсвэр')}</th><th className={r.num}>{tr('Дүн (₮)')}</th><th className={r.num}>{tr('Хувь')}</th></tr></thead>
                        <tbody>
                          {x.finance.sources.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{bn(s.value)}</td>
                              <td className={r.num}>{srcTotal ? pct((s.value / srcTotal) * 100, 1) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{bn(srcTotal)}</td>
                            <td className={r.num}>100%</td>
                          </tr>
                        </tbody>
                      </ResizableTable>

                      {/* ⚠️ CASHFLOW2-ийн сарын цуваа нь санхүүжилтийн ХУВААРЬ
                          (төлөвлөгөө) — «олгосон» гэж шошговол бодит олголтоос
                          олон дахин их худал тоо хэвлэгдэнэ (reportData.ts). */}
                      {/* ⚠️ НЭГ цуваа тул домог хэрэггүй — талбай нь өөрөө цувааг заана.
                          Хэмжилтгүй сарыг 0 гэж ЗУРАХГҮЙ: `TrendArea` цоорхойг таслана. */}
                      <Fig no="7.2">{tr('Сар бүрийн санхүүжилтийн хуваарь (төлөвлөгөө)')}</Fig>
                      <TrendArea
                        title={tr('Сар бүрийн санхүүжилтийн хуваарь')}
                        fmt={(v) => `${bn(v)} ₮`}
                        points={x.finance.months.map((m) => ({ label: m.label, value: m.amount || null }))}
                      />
                      <Cap no="7.2">
                        {tr('Сар бүрийн санхүүжилтийн хуваарь (төлөвлөгөө) ба хуримтлагдсан дүн')}
                        {d.peakMonth && tr(' — хамгийн их төлөвлөгөө {0} сард', tr(d.peakMonth.label))}
                      </Cap>
                      <ResizableTable storeKey="tailan.saraar" className={r.table}>
                        <thead><tr><th>{tr('Сар')}</th><th className={r.num}>{tr('Төлөвлөгөө (₮)')}</th><th className={r.num}>{tr('Хуримтлагдсан')}</th></tr></thead>
                        <tbody>
                          {x.finance.months.map((m) => (
                            <tr key={m.label}>
                              <td>{tr(m.label)}</td>
                              <td className={r.num}>{m.amount > 0 ? bn(m.amount) : '—'}</td>
                              <td className={r.num}>{bn(m.cum)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Хүснэгт нь гэрээ бүрийн санхүүжилтийн хуваарь буюу төлөвлөгөө; бодитоор олгосон санхүүжилтийг IPC актын дүнгээр 1-р хүснэгтэд харуулав.')}
                      </p>

                      <Cap no="7.3">{tr('Ажлын төрлөөр — төсөв ба гэрээний дүн')}</Cap>
                      <ResizableTable storeKey="tailan.torol" className={r.table}>
                        <thead><tr><th>{tr('Төрөл')}</th><th className={r.num}>{tr('Ажил')}</th><th className={r.num}>{tr('Төсөв')}</th><th className={r.num}>{tr('Гэрээ')}</th></tr></thead>
                        <tbody>
                          {x.finance.byType.map((t) => (
                            <tr key={t.type}>
                              <td>{tr(t.type)}</td>
                              <td className={r.num}>{num(t.n)}</td>
                              <td className={r.num}>{bnOrDash(t.budget)}</td>
                              <td className={r.num}>{bnOrDash(t.contract)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.finance.rows)}</td>
                            <td className={r.num}>{bn(x.finance.budget)}</td>
                            <td className={r.num}>{bn(x.finance.contractAmount)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                    </section>

                    {/* ── 8. Дэд бүтцийн хэрэгжилт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('8. Дэд бүтцийн хэрэгжилт')}</h2>
                      <p className={r.intro}>
                        {tr('Ерөнхий төлөвлөгөөний')} {num(x.infra.totals.layers)} {tr('давхаргад')}
                        {' '}{num(x.infra.totals.n)} {tr('объект бүртгэгдсэн бөгөөд шугам сүлжээний нийт урт')} {num(x.infra.totals.len)} {tr('м, талбайн хэмжээ')}
                        {' '}{num(x.infra.totals.area)} {tr('м² байна.')}
                      </p>
                      <Fig no="8">{tr('Ажлын бүлэг тус бүрийн объектын тоо')}</Fig>
                      <RankBars
                        title={tr('Ажлын бүлэг тус бүрийн объектын тоо')}
                        items={[...x.infra.groups]
                          .sort((a, b) => b.n - a.n)
                          .map((g) => ({ label: tr(g.title), value: g.n, text: num(g.n) }))}
                      />
                      <Cap no="8">{tr('Ажлын бүлэг тус бүрийн объект ба хэмжээ')}</Cap>
                      <ResizableTable storeKey="tailan.ajliin-buleg" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Ажлын бүлэг')}</th>
                            <th className={r.num}>{tr('Давхарга')}</th>
                            <th className={r.num}>{tr('Объект')}</th>
                            <th className={r.num}>{tr('Урт (м)')}</th>
                            <th className={r.num}>{tr('Талбай (м²)')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.infra.groups.map((g) => (
                            <tr key={g.key}>
                              <td>{tr(g.title)}</td>
                              <td className={r.num}>{num(g.layers)}</td>
                              <td className={r.num}>{num(g.n)}</td>
                              <td className={r.num}>{g.len > 0 ? num(g.len) : '—'}</td>
                              <td className={r.num}>{g.area > 0 ? num(g.area) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.infra.totals.layers)}</td>
                            <td className={r.num}>{num(x.infra.totals.n)}</td>
                            <td className={r.num}>{num(x.infra.totals.len)}</td>
                            <td className={r.num}>{num(x.infra.totals.area)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('«—» тэмдэглэгээ нь тухайн бүлэгт өгөгдсөн хэмжигдэхүүн хамаарахгүйг илэрхийлнэ (жишээ нь цэгэн объектод урт, талбай байхгүй).')}
                      </p>
                    </section>

                    {/* ── 9. ХАБЭА ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('9. Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй')}</h2>
                      <p className={r.intro}>
                        {x.habea.date && <>{x.habea.date}{tr('-ны байдлаар')} </>}
                        {tr('барилгын талбайд')} {num(x.habea.workers)} {tr('ажилтан (дотоодын')}
                        {' '}{num(x.habea.mongol)}{tr(', гадаадын')} {num(x.habea.gadaad)}),
                        {' '}{num(x.habea.tehnik)} {tr('нэгж техник ажиллаж байна. Дотоодын ажиллах хүч нийт ажиллагсдын')} {pct(d.mongolShare, 1)}{tr('-ийг эзэлж байна.')}
                      </p>
                      {/* ⚠️ Ажилтан ба техник нь өөр нэгжтэй тул НЭГ зурагт давхарлахгүй —
                          ажиллах хүч нь гол үзүүлэлт учир түүнийг зурав. */}
                      <Fig no="9">{tr('Гүйцэтгэгч байгууллага тус бүрийн ажиллах хүч')}</Fig>
                      <RankBars
                        title={tr('Гүйцэтгэгч байгууллага тус бүрийн ажилтны тоо')}
                        items={[...x.habea.byCompany]
                          .sort((a, b) => b.workers - a.workers)
                          .map((co) => ({ label: tr(co.label), value: co.workers, text: num(co.workers) }))}
                      />
                      <Cap no="9">{tr('Гүйцэтгэгч байгууллага тус бүрийн хүн хүч, техник')}</Cap>
                      <ResizableTable storeKey="tailan.guitsetgegch" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Гүйцэтгэгч')}</th>
                            <th>{tr('Багц')}</th>
                            <th className={r.num}>{tr('Ажилтан')}</th>
                            <th className={r.num}>{tr('Дотоод')}</th>
                            <th className={r.num}>{tr('Гадаад')}</th>
                            <th className={r.num}>{tr('Техник')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.habea.byCompany.map((c) => (
                            <tr key={c.label}>
                              <td>{tr(c.label)}</td>
                              <td>{tr(c.bagts ?? '—')}</td>
                              <td className={r.num}>{num(c.workers)}</td>
                              <td className={r.num}>{num(c.mongol)}</td>
                              <td className={r.num}>{num(c.gadaad)}</td>
                              <td className={r.num}>{num(c.tehnik)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td>—</td>
                            <td className={r.num}>{num(x.habea.workers)}</td>
                            <td className={r.num}>{num(x.habea.mongol)}</td>
                            <td className={r.num}>{num(x.habea.gadaad)}</td>
                            <td className={r.num}>{num(x.habea.tehnik)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Бүртгэлийн эхнээс хойш нийт')} {num(x.habea.incidents)} {tr('осол, зөрчил бүртгэгдсэн байна. Хүн хүчний тоо нь өдөр тутмын хуримтлагдсан үзүүлэлт биш, сүүлийн бүртгэлийн агшны байдлыг илэрхийлнэ.')}
                      </p>
                    </section>

                    {/* ── 10. Дүгнэлт ── */}
                    <section className={r.section}>
                      <h2 className={r.h2}>{tr('10. Дүгнэлт, анхаарах асуудал')}</h2>
                      <p className={r.intro}>
                        {tr('Дээрх өгөгдөлд тулгуурлан анхаарал шаардсан дараах асуудлыг тодруулав.')}
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
        )}

      </article>
    </div>
  );
}

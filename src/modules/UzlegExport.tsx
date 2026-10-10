'use client';

/**
 * ҮЗЛЭГИЙН ТАЙЛАН ТАТАХ — товч ба цонх (2026-10-06, хэрэглэгчийн хүсэлт).
 *
 * «Асуумжаа сонгоод, хугацаагаа сонгоод, компаниа сонгоод татах — нэгийг PDF-ээр
 * (`2026-09-29 Морин сувд.pdf` шиг), олныг Excel-ээр, iAuditor шиг».
 *
 * ⚠️ ДӨРВӨН АЛХАМ (2026-10-06 загвар сайжруулалт): Асуумж → Хугацаа → Компани → Үзлэг.
 *    Дугаар нь бодит дараалал — өмнөх алхам дараагийнх нь жагсаалтыг шүүнэ.
 * ⚠️ ФОРМАТ АВТОМАТААР: нэг үзлэг сонгосон бол PDF, олон бол Excel. Хэрэглэгч гараар
 *    сольж болно — олон үзлэгийг ч НЭГ PDF-д (тайлан бүр шинэ хуудаснаас) гаргана.
 * ⚠️ PDF-д зураг ОРНО тул олон үзлэгийн PDF удаан (зураг бүр татагдана) — анхааруулна.
 * ⚠️ Өгөгдөл нь ХАБЭА хуудастай НЭГ ачаалагчаас (`loadUzlegBoth`) — кэш хуваалцана.
 * ⚠️ 2026-10-09: «Цуцлах» — татаж байхад цонх түгжигддэг атал гацсан хавсралт (хугацаагүй
 *    fetch) цонхыг МӨНХӨД хаагдахгүй үлдээдэг байв. Одоо хавсралт бүр 30с (`ATT_TIMEOUT_MS`),
 *    «Цуцлах» нь `AbortController`-оор бүх татлагыг зогсооно; цонх хаагдахад мөн цуцална.
 * ⚠️ 2026-10-09: «Зураггүй» сонголт ба `UZ_IMG_WARN`-ээс олон зурагт баталгаажуулалт —
 *    мянга мянган зураг хөтчийн санах ойг дүүргэдэг.
 * ⚠️ 2026-10-09: фокусын урхи (`useFocusTrap`) — нээхэд фокус цонхонд, хаахад буцна.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { ubDayKey } from '@/lib/ceo/workforce';
import { HABEA, HABEA_UZLEG_LAYER_ID, LAYER_BY_ID } from '@/lib/services';
import { num } from '@/lib/format';
import { friendlyError } from '@/components/ui';
import { renderPdfBase64, download } from '@/lib/emailReport';
import {
  loadUzFields, loadUzAttachments, loadUzLocations, attUrl, buildUzReport, loadReportImages,
  buildUzPdf, buildUzXlsx, companyShort, countReportImages, fmtDate, reportTitle, UZ_IMG_WARN,
  type UzImg, type UzReport,
} from '@/lib/uzlegReport';
import { loadUzlegBoth, uzScoreLevel, type UzlegKind, type UzlegRow } from './habeaUzleg';
import type { Row } from '@/lib/query';
import x from './uzlegExport.module.css';

const KINDS: UzlegKind[] = ['zahialagch', 'v11', 'guitsetgegch'];
/** Файлын нэр ба Excel-ийн хуудасны гарчигт — «Морин сувд - Захиалагчийн үзлэг 2026-09-29» */
const FORM_SHORT: Record<UzlegKind, string> = {
  zahialagch: 'Захиалагчийн үзлэг',
  v11: 'Ажлын байрны үзлэг V1.1',
  guitsetgegch: 'Гүйцэтгэгчийн үзлэг',
};
const PDF_MANY_WARN = 15;

/**
 * ⚠️ 2026-10-09: ӨДРИЙН ХИЛ УЛААНБААТАРЫН цагаар (UTC+8, `ubDayKey`) — урьд нь хөтчийн
 *    локал цагаар тул өөр бүсээс татахад өдрийн хил гулсаж, хуудасны өдрийн цуваанд
 *    (`ubDayKey`) байгаа үзлэг тайланд орохгүй/өөр өдөрт орж болдог байв.
 */
const dayStr = (d: Date | number) => ubDayKey(typeof d === 'number' ? d : d.getTime());
/** «YYYY-MM-DD» → Улаанбаатарын өдрийн эхлэл/төгсгөл (ms) */
const dayStart = (v: string) => Date.parse(`${v}T00:00:00+08:00`);
const dayEnd = (v: string) => Date.parse(`${v}T23:59:59.999+08:00`);

/** Хугацааны бэлэн сонголт — эхлэх огноог өнөөдрөөс тооцно */
/* ⚠️ 2026-10-06: «Нэг өдөр» — хэрэглэгчийн хүсэлт («нэг өдрийн дата зааж татах»).
   Эхлэх = дуусах = сонгосон өдөр; огнооны ГАНЦ талбар гарна. */
type Preset = 'day' | 'w' | 'm30' | 'month' | 'all';
const presetFrom = (p: Preset, today: Date): string => {
  if (p === 'day') return dayStr(today);
  if (p === 'w') return dayStr(new Date(today.getTime() - 6 * 86400000));
  if (p === 'm30') return dayStr(new Date(today.getTime() - 29 * 86400000));
  if (p === 'month') return `${dayStr(today).slice(0, 8)}01`;
  return '2020-01-01';
};
const presetLabel = (p: Preset) => (p === 'day' ? tr('Өдрөөр') : p === 'w' ? tr('7 хоног') : p === 'm30' ? tr('30 хоног') : p === 'month' ? tr('Энэ сар') : tr('Бүгд'));

/**
 * Онооны өнгө — оноогүй бол саарал.
 * ⚠️ 2026-10-09 (аудит №6): босго `habeaUzleg.uzScoreLevel` (90 · 70, дүгнэсэн)-ээс — урьд нь энд
 *    ≥90/≥75 ХАТУУ бичигдсэн тул 70–74 оноо самбарт улбар шар, экспортод улаан гарч зөрдөг байв
 *    (docs 04: «<70 улаан · 70–90 улбар шар»).
 */
const scoreTone = (p: number | null) => {
  if (p == null) return '';
  const lv = uzScoreLevel(p);
  return lv === 'good' ? x.good : lv === 'warn' ? x.warn : x.bad;
};

/** `domFail` — 2026-10-09: кодын тайлбар (domain) уншигдсангүй (`loadUzlegBoth`) */
type Loaded = { kind: UzlegKind; raw: Row[]; rows: UzlegRow[]; domFail?: boolean };

export function UzlegExportButton({ kind }: { kind?: UzlegKind | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={x.trigger} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v1.5h10V12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {tr('Үзлэгийн тайлан татах')}
      </button>
      {open && <UzlegExportDialog initialKind={kind ?? 'zahialagch'} onClose={() => setOpen(false)} />}
    </>
  );
}

function UzlegExportDialog({ initialKind, onClose }: { initialKind: UzlegKind; onClose: () => void }) {
  const [kind, setKind] = useState<UzlegKind>(initialKind);
  const [data, setData] = useState<Loaded | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset | null>('w');
  const [from, setFrom] = useState(() => presetFrom('w', today));
  const [to, setTo] = useState(() => dayStr(today));
  const [cos, setCos] = useState<string[]>([]);
  /* Сонгосон үзлэгүүд — `null` = шүүлтэд орсон БҮГД */
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [fmt, setFmt] = useState<'auto' | 'pdf' | 'xlsx'>('auto');
  const [busy, setBusy] = useState('');
  /** Явцын хувь (0–1) — зураг татах үед; `null` = тодорхойгүй */
  const [prog, setProg] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  /** ⚠️ 2026-10-09: татагдаагүй зургийн анхааруулга — файл үүссэн ч ИЛ (чимээгүй хаягддаг байв) */
  const [warn, setWarn] = useState('');
  /** ⚠️ 2026-10-09: «Зураггүй» — зураг татахгүй (хурдан, санах ой бага) */
  const [noPhotos, setNoPhotos] = useState(false);
  /** Явж буй татлагын цуцлагч — «Цуцлах», Escape, цонх хаагдахад */
  const ctlRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef, true);
  /* Цонх хаагдахад (unmount) явж буй татлагыг зогсооно — хаагдсан цонхонд setState хийхгүй */
  useEffect(() => () => { ctlRef.current?.abort(); }, []);

  useEffect(() => {
    let alive = true;
    loadUzlegBoth(kind)
      .then((d) => { if (alive) { setData({ kind, ...d }); setLoadErr(''); } })
      .catch((e: unknown) => { if (alive) setLoadErr(friendlyError(e)); });
    return () => { alive = false; };
  }, [kind]);

  /** ⚠️ 2026-10-09: татлагыг цуцална — дараа нь цонх хаагдаж болно */
  const cancel = () => {
    ctlRef.current?.abort();
    ctlRef.current = null;
    setBusy(''); setProg(null); setErr(''); setWarn('');
    setDone(tr('Татах цуцлагдлаа'));
  };

  useEffect(() => {
    /* ⚠️ 2026-10-09: татаж байхад Escape = «Цуцлах» (урьд нь юу ч хийдэггүй — гацахад гарцгүй) */
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!busy) { onClose(); return; }
      ctlRef.current?.abort();
      ctlRef.current = null;
      setBusy(''); setProg(null); setErr(''); setWarn('');
      setDone(tr('Татах цуцлагдлаа'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const ready = data && data.kind === kind ? data : null;
  /* ⚠️ 2026-10-09: ОГНООГҮЙ үзлэг (`d = 0`) «Бүгд» хугацаанд ОРНО — урьд нь ямар ч хугацаанд
     орохгүй тул хэзээ ч татагдах боломжгүй байв. Бусад хугацаанд огноогүйг аль өдөрт
     хамааруулахаа мэдэхгүй тул хасна; «Бүгд»-д тоог нь ил хэлнэ («N огноогүй»). */
  const withUndated = preset === 'all';
  const inRange = useMemo(() => {
    if (!ready) return [] as number[];
    const a = dayStart(from); const b = dayEnd(to);
    return ready.rows.map((r, i) => ({ r, i }))
      .filter(({ r }) => (r.d > 0 ? r.d >= a && r.d <= b : withUndated))
      .map(({ i }) => i);
  }, [ready, from, to, withUndated]);
  const undated = useMemo(() => (ready && withUndated ? ready.rows.filter((r) => !(r.d > 0)).length : 0), [ready, withUndated]);
  const companies = useMemo(() => {
    if (!ready) return [] as { key: string; n: number }[];
    const m = new Map<string, number>();
    for (const i of inRange) {
      const c = ready.rows[i].company || '—';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, n]) => ({ key, n })).sort((p, q) => q.n - p.n || p.key.localeCompare(q.key, 'mn'));
  }, [ready, inRange]);
  const list = useMemo(() => {
    if (!ready) return [] as number[];
    return inRange
      .filter((i) => !cos.length || cos.includes(ready.rows[i].company || '—'))
      .sort((p, q) => ready.rows[q].d - ready.rows[p].d);
  }, [ready, inRange, cos]);
  const chosen = useMemo(() => (picked ? list.filter((i) => picked.has(i)) : list), [list, picked]);
  const effFmt = fmt === 'auto' ? (chosen.length === 1 ? 'pdf' : 'xlsx') : fmt;
  const allOn = chosen.length === list.length && list.length > 0;

  const resetPick = () => { setPicked(null); setDone(''); setWarn(''); };
  const pickPreset = (p: Preset) => { setPreset(p); setFrom(presetFrom(p, today)); setTo(dayStr(today)); resetPick(); };
  const togglePick = (i: number) => {
    const next = new Set(picked ?? list);
    if (next.has(i)) next.delete(i); else next.add(i);
    setPicked(next);
    setDone('');
  };
  const toggleCo = (c: string) => {
    setCos((cur) => (cur.includes(c) ? cur.filter((v) => v !== c) : [...cur, c]));
    resetPick();
  };

  const run = async () => {
    if (!ready || !chosen.length) return;
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    /* ⚠️ Цуцлагдсан/хаагдсан бол дараагийн await-ийн дараа ЮУ Ч хийхгүй (setState, татах) */
    const live = () => !ctl.signal.aborted;
    setErr(''); setDone(''); setWarn(''); setProg(null);
    try {
      const url = HABEA.uzleg[kind].url;
      const form = HABEA.uzleg[kind].title;
      setBusy(tr('Маягтын бүтцийг уншиж байна…'));
      const fields = await loadUzFields(url);
      if (!live()) return;
      const oids = chosen.map((i) => ready.rows[i].oid);
      /* ⚠️ Excel ч ЗУРАГТАЙ (жишээ файлын «ObjectID N» хуудсанд нүдэнд шигтгэсэн) тул хавсралт,
         байршлыг хоёр форматад хоёуланд нь татна. */
      setBusy(tr('Хавсралтын жагсаалтыг уншиж байна…'));
      const [atts, locs] = await Promise.all([loadUzAttachments(url, oids), loadUzLocations(url, oids)]);
      if (!live()) return;
      const reports: UzReport[] = chosen.map((i) => {
        const r = ready.rows[i];
        return buildUzReport(form, fields, ready.raw[i], r.oid, atts.get(r.oid) ?? [], (id) => attUrl(url, r.oid, id), {
          pkg: r.site, company: r.company, date: r.d, formShort: FORM_SHORT[kind], location: locs.get(r.oid) ?? '',
        });
      });
      const one = reports.length === 1 ? reports[0] : null;
      /* Файлын нэр: PDF — «2026-09-29 Морин сувд», Excel — «Морин сувд - Захиалагчийн үзлэг 2026-09-29».
         Олон компани/өдөр бол «Олон компани - … 2026-09-22–2026-09-29». */
      const coSet = [...new Set(reports.map((r) => companyShort(r.company)).filter(Boolean))];
      const days = [...new Set(reports.map((r) => (r.date > 0 ? fmtDate(r.date) : '')).filter(Boolean))].sort();
      const span = days.length <= 1 ? (days[0] ?? from) : `${days[0]}–${days[days.length - 1]}`;
      const xlsBase = one ? reportTitle(one) : `${coSet.length === 1 ? coSet[0] : 'Олон компани'} - ${FORM_SHORT[kind]} ${span}`;
      /* ⚠️ 2026-10-09: `companyShort` «—»-г хоосон болгодог тул нөөц (багц → «Үзлэг») ажиллана */
      const base = one
        ? `${one.date > 0 ? fmtDate(one.date) : 'огноогүй'} ${companyShort(one.company) || companyShort(one.pkg) || 'Үзлэг'}`
        : xlsBase;
      /* ⚠️ 2026-10-09: олон зураг — санах ой/хугацааны анхааруулга, «Зураггүй»-г санал болгоно */
      const nImg = noPhotos ? 0 : countReportImages(reports);
      if (nImg > UZ_IMG_WARN
        && !window.confirm(tr('{0} зураг татагдана — удаан бөгөөд хөтчийн санах ойг дүүргэж болзошгүй. Үргэлжлүүлэх үү? («Зураггүй» сонголтоор хурдан)', num(nImg)))) {
        ctlRef.current = null;
        setBusy(''); setProg(null);
        return;
      }
      const { images: img, failed, heic } = noPhotos
        ? { images: new Map<string, UzImg>(), failed: [] as string[], heic: [] as string[] }
        : await loadReportImages(reports, {
          mode: effFmt,
          signal: ctl.signal,
          onProgress: (d, t) => {
            if (!live()) return;
            setBusy(tr('Зураг татаж байна… {0}/{1}', num(d), num(t)));
            setProg(t > 0 ? d / t : null);
          },
        });
      if (!live()) return;
      setProg(null);
      let file: string;
      if (effFmt === 'pdf') {
        setBusy(tr('PDF үүсгэж байна…'));
        let logo: string | null = null;
        try { const res = await fetch('/logo.svg'); if (res.ok) logo = await res.text(); } catch { logo = null; }
        const b64 = await renderPdfBase64(buildUzPdf(reports, img, logo));
        if (!live()) return;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        file = `${base}.pdf`;
        download(file, new Blob([bytes], { type: 'application/pdf' }));
      } else {
        setBusy(tr('Excel үүсгэж байна…'));
        /* HEIC ч Excel-ийн тоонд «татагдсангүй» гэж ил */
        const bytes = buildUzXlsx(reports, img, new Set([...failed, ...heic]));
        file = `${xlsBase}.xlsx`;
        download(file, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      }
      ctlRef.current = null;
      setBusy(''); setProg(null);
      setDone(tr('Татагдлаа: {0}', file));
      /* ⚠️ 2026-10-09: HEIC (формат) ба татагдаагүй (сүлжээ) ТУСДАА — шалтгаан нь өөр */
      setWarn([
        failed.length ? tr('{0} зураг татагдсангүй', num(failed.length)) : '',
        heic.length ? tr('{0} зураг HEIC — хөрвүүлэх боломжгүй', num(heic.length)) : '',
      ].filter(Boolean).join(' · '));
    } catch (e) {
      /* Цуцлагдсан — `cancel`/unmount төлвийг аль хэдийн цэвэрлэсэн */
      if (!live()) return;
      ctlRef.current = null;
      setBusy(''); setProg(null);
      setErr(friendlyError(e));
    }
  };

  const lock = !!busy;
  return (
    <div className={x.back} role="presentation" onClick={() => { if (!lock) onClose(); }}>
      <div ref={boxRef} className={x.box} role="dialog" aria-modal="true" aria-labelledby="uz-exp-title" onClick={(e) => e.stopPropagation()}>
        <header className={x.head}>
          <div>
            <h2 id="uz-exp-title" className={x.title}>{tr('Үзлэгийн тайлан татах')}</h2>
          </div>
          {/* ⚠️ 2026-10-09: татаж байхад ч хаана — unmount нь татлагыг цуцална */}
          <button type="button" className={x.close} onClick={onClose} aria-label={tr('Хаах')}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className={x.body}>
          {/* ── 1. Асуумж ── */}
          <section className={x.step}>
            <h3 className={x.stepHead}><i>1</i>{tr('Асуумж')}</h3>
            <div className={x.forms} role="radiogroup" aria-label={tr('Асуумж')}>
              {KINDS.map((k) => {
                const on = kind === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} disabled={lock}
                    className={`${x.form} ${on ? x.formOn : ''}`}
                    onClick={() => { if (!on) { setKind(k); setCos([]); resetPick(); } }}>
                    <span className={x.formDot} style={{ background: LAYER_BY_ID[HABEA_UZLEG_LAYER_ID[k]]?.hue ?? 'var(--data)' }} aria-hidden />
                    <span className={x.formName}>{HABEA.uzleg[k].title}</span>
                    {on && ready && <span className={`${x.formCount} num`}>{tr('{0} үзлэг', num(ready.rows.length))}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 2. Хугацаа ── */}
          <section className={x.step}>
            <h3 className={x.stepHead}><i>2</i>{tr('Хугацаа')}</h3>
            <div className={x.presets}>
              {(['day', 'w', 'm30', 'month', 'all'] as Preset[]).map((p) => (
                <button key={p} type="button" aria-pressed={preset === p} disabled={lock}
                  className={`${x.chip} ${preset === p ? x.chipOn : ''}`} onClick={() => pickPreset(p)}>
                  {presetLabel(p)}
                </button>
              ))}
            </div>
            {preset === 'day' ? (
            <div className={x.dates}>
              <label className={x.field}>
                <span>{tr('Огноо')}</span>
                <input type="date" value={from} max={dayStr(today)} disabled={lock}
                  onChange={(e) => { if (e.target.value) { setFrom(e.target.value); setTo(e.target.value); resetPick(); } }} />
              </label>
              {/* Өмнөх · дараагийн өдөр — нэг товшилтоор өдөр гүйлгэнэ */}
              <div className={x.dayNav}>
                <button type="button" className={x.chip} disabled={lock} aria-label={tr('Өмнөх өдөр')}
                  onClick={() => { const d = dayStr(new Date(dayStart(from) - 86400000)); setFrom(d); setTo(d); resetPick(); }}>‹</button>
                <button type="button" className={x.chip} disabled={lock || from >= dayStr(today)} aria-label={tr('Дараагийн өдөр')}
                  onClick={() => { const d = dayStr(new Date(dayStart(from) + 86400000)); setFrom(d); setTo(d); resetPick(); }}>›</button>
              </div>
            </div>
            ) : (
            <div className={x.dates}>
              <label className={x.field}>
                <span>{tr('Эхлэх огноо')}</span>
                <input type="date" value={from} max={to} disabled={lock}
                  onChange={(e) => { setFrom(e.target.value); setPreset(null); resetPick(); }} />
              </label>
              <span className={x.dash} aria-hidden>—</span>
              <label className={x.field}>
                <span>{tr('Дуусах огноо')}</span>
                <input type="date" value={to} min={from} disabled={lock}
                  onChange={(e) => { setTo(e.target.value); setPreset(null); resetPick(); }} />
              </label>
            </div>
            )}
            {undated > 0 && <p className={x.note}>{tr('{0} огноогүй', num(undated))}</p>}
          </section>

          {ready?.domFail && (
            <p className={x.note} role="status">⚠ {tr('Кодын тайлбар уншигдсангүй — зарим утга кодоор харагдана.')}</p>
          )}
          {loadErr && <p className={x.err} role="alert">{tr('Татагдсангүй: {0}', loadErr)}</p>}
          {!ready && !loadErr && <div className={x.skeleton} aria-busy="true">{tr('Үзлэгүүдийг уншиж байна…')}</div>}

          {ready && (
            <>
              {/* ── 3. Компани ── */}
              <section className={x.step}>
                <h3 className={x.stepHead}>
                  <i>3</i>{tr('Компани')}
                  {cos.length > 0 && (
                    <button type="button" className={x.link} onClick={() => { setCos([]); resetPick(); }} disabled={lock}>{tr('Бүгд')}</button>
                  )}
                </h3>
                {companies.length
                  ? (
                    <div className={x.chips}>
                      {companies.map((c) => {
                        const on = cos.includes(c.key);
                        return (
                          <button key={c.key} type="button" aria-pressed={on} disabled={lock}
                            className={`${x.chip} ${on ? x.chipOn : ''}`} onClick={() => toggleCo(c.key)} title={c.key}>
                            <span className={x.chipText}>{c.key}</span>
                            <b className="num">{num(c.n)}</b>
                          </button>
                        );
                      })}
                    </div>
                  )
                  : <p className={x.empty}>{tr('Энэ хугацаанд үзлэг алга')}</p>}
              </section>

              {/* ── 4. Үзлэг ── */}
              <section className={x.step}>
                <h3 className={x.stepHead}>
                  <i>4</i>{tr('Үзлэг')}
                  <span className={`${x.meta} num`}>{tr('{0}/{1} сонгосон', num(chosen.length), num(list.length))}</span>
                  {list.length > 0 && (
                    <button type="button" className={x.link} disabled={lock}
                      onClick={() => { setPicked(allOn ? new Set() : null); setDone(''); }}>
                      {allOn ? tr('Бүгдийг болих') : tr('Бүгдийг сонгох')}
                    </button>
                  )}
                </h3>
                {list.length
                  ? (
                    <div className={x.list} role="list">
                      {list.map((i) => {
                        const r = ready.rows[i];
                        const on = !picked || picked.has(i);
                        const p = r.scA != null && r.scA > 0 && r.scE != null ? (r.scE / r.scA) * 100 : null;
                        const nc = r.major + r.minor;
                        return (
                          <label key={r.oid} className={`${x.row} ${on ? x.rowOn : ''}`} role="listitem">
                            <input type="checkbox" checked={on} onChange={() => togglePick(i)} disabled={lock} />
                            <span className={x.rowMain}>
                              <span className={x.rowTop}>
                                <b className="num">{r.d > 0 ? fmtDate(r.d) : '—'}</b>
                                <span className={x.pkg}>{r.site || '—'}</span>
                              </span>
                              <span className={x.rowCo} title={r.company}>{r.company || '—'}</span>
                            </span>
                            {nc > 0 && (
                              <span className={`${x.flag} ${r.major > 0 ? x.flagMajor : ''} num`} title={tr('Ноцтой {0} · Бага зэргийн {1}', num(r.major), num(r.minor))}>
                                {tr('{0} үл нийцэл', num(nc))}
                              </span>
                            )}
                            <span className={`${x.score} ${scoreTone(p)} num`}>{p == null ? '—' : `${p.toFixed(1)}%`}</span>
                          </label>
                        );
                      })}
                    </div>
                  )
                  : <p className={x.empty}>{tr('Сонгосон шүүлтэд үзлэг алга')}</p>}
              </section>
            </>
          )}
        </div>

        <footer className={x.foot}>
          {ready && (
            <div className={x.fmt} role="radiogroup" aria-label={tr('Формат')}>
              {(['pdf', 'xlsx'] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={effFmt === f} disabled={lock}
                  className={`${x.fmtOpt} ${effFmt === f ? x.fmtOn : ''}`} onClick={() => setFmt(f)}>
                  <b>{f === 'pdf' ? 'PDF' : 'Excel'}</b>
                </button>
              ))}
            </div>
          )}
          {ready && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={noPhotos} disabled={lock} onChange={(e) => setNoPhotos(e.target.checked)} />
              {tr('Зураггүй')}
            </label>
          )}
          {chosen.length > PDF_MANY_WARN && !noPhotos && (
            <p className={x.note}>{tr('{0} үзлэгийн зургийг татах тул файл удаан үүснэ.', num(chosen.length))}</p>
          )}
          {err && <p className={x.err} role="alert">{err}</p>}
          {busy && (
            <div className={x.progress} aria-live="polite">
              <span>{busy}</span>
              <div className={x.bar}><i style={prog == null ? undefined : { width: `${Math.round(prog * 100)}%` }} className={prog == null ? x.barIndet : ''} /></div>
            </div>
          )}
          {done && !busy && <p className={x.done} role="status">{done}</p>}
          {warn && !busy && <p className={x.err} role="alert">⚠ {warn}</p>}
          <div className={x.actions}>
            {lock
              ? <button type="button" className={x.btn} onClick={cancel}>{tr('Цуцлах')}</button>
              : <button type="button" className={x.btn} onClick={onClose}>{tr('Болих')}</button>}
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void run(); }}
              disabled={lock || !ready || !chosen.length}>
              {effFmt === 'pdf' ? tr('PDF татах') : tr('Excel татах')}
              {chosen.length > 0 && <span className={`${x.btnCount} num`}>{num(chosen.length)}</span>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

'use client';

/**
 * ТУХ — ТӨСЛИЙН БҮХ АЖЛЫГ БАГЦ БҮРЭЭР ХЯНАХ (2026-11-23, хэрэглэгч: «ТУХ-ийн гол санаа — төслийн бүх ажлыг багц
 * бүрээр хянах; одоо байгааг бүрэн орхиод шинээр хий»).
 *
 * 2026-11-23 (2): «багц сонгож дэлгэхгүй — бүгд дэлгээтэй, жагсаалтаас дарахад тэр рүү гүйлгэж очно; ажилтан дээрээс нь
 * нэг бүрчлэн гүйлгэж шалгадаг», «сэдвээр шүүж харах». Өгөгдөл нь `model.buildModel` (систем) + `extra.loadTuhExtra`.
 *
 *   ┌ Багцын жагсаалт ┐┌ Тойм: үзүүлэлт · анхааруулга · сэдэв/төлөв/ангиллын шүүлт          ┐
 *   │ (дарвал гүйлгэж ││ Багц 1 — явц · хугацаа · санхүүжилт · газар · зөвшөөрөл · ХАБЭА …   │
 *   │  очно, идэвхтэй ││ Багц 2 — …                                                           │
 *   │  нь тодорно)    ││ …                                                                    │
 *   └─────────────────┘└──────────────────────────────────────────────────────────────────────┘
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct, mnt, date } from '@/lib/format';
import { TUH_GROUPS, TUH_STATUS, groupLabel, statusMeta, elapsedPct, TUH_STALE_DAYS, heatWinterYear, type TuhStatus, type TuhGroup } from '@/lib/tuhData';
import { lz, linkedRows, commissionText, jointNote, usesHandover, type TuhModel, type TuhRow } from './model';
import { coverageNote, coverageOk } from '@/lib/planProgress';
import { ProgChart } from '@/modules/PkgProg';
import { ComboChart, lagLevelOf, planScopeNote } from '@/modules/Finance';
import { useAsync } from '@/lib/useAsync';
import { loadHeatBlocks } from '@/modules/DulaanOgnoo';
import type { TuhExtra } from './extra';
import b from './board.module.css';

const DAY = 86_400_000;
/** Зөрүүгийн тэмдэг: + урд, − хоцорсон */
const gapText = (g: number | null) => (g == null ? '—' : `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(g).toFixed(1)}`);
const gapTone = (g: number | null) => (g == null ? '' : g <= -5 ? b.bad : g < 0 ? b.warn : b.good);
const toneCls = (st: TuhStatus) => {
  const t = statusMeta(st).tone;
  return t === 'good' ? b.good : t === 'warn' ? b.warn : t === 'bad' ? b.bad : b.mute;
};
/**
 * Зөрүү ба төлөвлөгөө — төлвийг тогтоосон суурьтай НЭГ (`statusBasis`): хуваарь хангалттай хамарсан бол гүйцэтгэгчийн,
 * эс бөгөөс гэрээний төлөвлөгөө. Дутуу хуваарийн зөрүүгөөр дүгнэхгүй.
 */
/* 2026-11-24: багцын мөр — багцын гүйцэтгэлийн эхийн төлөвлөгөө (P) ба зөрүү (S − P) */
const gapOf = (r: TuhRow) => (r.statusBasis === 'package' ? r.gapPackage : r.statusBasis === 'contractor' ? r.gapContractor : r.gapContract);
const planOf = (r: TuhRow) => (r.statusBasis === 'package' || r.byPackage ? r.planPackage
  : r.statusBasis === 'contractor' ? r.planContractor : r.planContract ?? r.planContractor);
export const anchorId = (key: string) => `tuh-${key.replace(/[^\p{L}\p{N}_-]+/gu, '_')}`;

/**
 * Гэрээт хугацааны ҮЛДСЭН хоног — өнөөдрийн ОГНОО (`m.today`) ба дуусах өдрөөр (UTC шөнө дунд). Цагаар тооцвол
 * Улаанбаатарын 08:00-аас хойш сүүлийн өдөр «хэтэрсэн» болдог байв. 0 = өнөөдөр сүүлийн өдөр; сөрөг = хэтэрсэн.
 */
export function daysLeft(end: number | null, today: string): number | null {
  const t = Date.parse(`${today}T00:00:00Z`);
  return end == null || !Number.isFinite(t) ? null : Math.round((end - t) / DAY);
}

/** Ажлын олголтын хувь — урьдчилгааг хассан (урьдчилгаа нь гүйцэтгэлгүй олгогддог тул гүйцэтгэлтэй жиших боломжгүй) */
export function workPaidPct(ipc: TuhRow['ipc']): number | null {
  if (ipc?.paidPct == null || !ipc.contractTotal) return null;
  return Math.max(0, ipc.paidPct - ((ipc.advance ?? 0) / ipc.contractTotal) * 100);
}

/** Дуусах ТААМАГ — сүүлийн 7 хоногийн ахицаар (pp/7 хоног); ахицгүй бол тооцохгүй */
export function forecastEnd(r: Pick<TuhRow, 'progress' | 'week'>, now: number): number | null {
  if (r.progress == null || r.progress >= 100) return null;
  if (r.week == null || r.week <= 0) return null;
  return now + ((100 - r.progress) / r.week) * 7 * DAY;
}

/* ══════════════════════ СЭДВҮҮД ══════════════════════ */

export type Theme = 'progress' | 'time' | 'money' | 'land' | 'permit' | 'safety' | 'quality' | 'ajil' | 'blocks' | 'deps';
const THEMES: { key: Theme; label: () => string }[] = [
  { key: 'progress', label: () => tr('Явц') },
  { key: 'time', label: () => tr('Хугацаа') },
  { key: 'money', label: () => tr('Санхүүжилт') },
  { key: 'land', label: () => tr('Газар чөлөөлөлт') },
  { key: 'permit', label: () => tr('Зөвшөөрөл') },
  { key: 'safety', label: () => tr('ХАБЭА') },
  { key: 'quality', label: () => tr('Чанар') },
  { key: 'ajil', label: () => tr('Нэмэлт ажил') },
  { key: 'blocks', label: () => tr('Блок · дулаан') },
  { key: 'deps', label: () => tr('Хамаарал') },
];

function StatusPill({ st }: { st: TuhStatus }) {
  const m = statusMeta(st);
  return <span className={`${b.pill} ${toneCls(st)}`}><i aria-hidden>{m.icon}</i>{m.label()}</span>;
}

function Bar({ v, plan }: { v: number | null; plan?: number | null }) {
  const w = v == null ? 0 : Math.max(0, Math.min(100, v));
  const p = plan == null ? null : Math.max(0, Math.min(100, plan));
  return (
    <span className={b.bar} aria-hidden>
      <i style={{ width: `${w}%` }} />
      {p != null && <em style={{ left: `${p}%` }} />}
    </span>
  );
}

function Kpi({ label, value, note, tone, stale }: { label: string; value: ReactNode; note?: ReactNode; tone?: string; stale?: boolean }) {
  return (
    <div className={b.kpi} data-stale={stale ? 'true' : undefined}>
      <span className={b.kpiLabel}>{label}</span>
      <b className={`${b.kpiValue} ${tone ?? ''}`}>{value}</b>
      {note != null && note !== '' && <span className={b.kpiNote}>{note}</span>}
    </div>
  );
}

function Card({ title, note, children, wide }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`${b.card} ${wide ? b.wide : ''}`}>
      <header className={b.cardHead}><h3>{title}</h3>{note != null && <span>{note}</span>}</header>
      <div className={b.cardBody}>{children}</div>
    </section>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={b.facts}>
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** Харагдах үед л зурна (61 багцын график нэг дор зурагдахгүй) — SSR/IntersectionObserver-гүй орчинд шууд зурна */
function Lazy({ children, minH }: { children: () => ReactNode; minH: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (on || !ref.current) return undefined;
    /* root — жинхэнэ гүйлгэгч (`.content`): цонхоор бол `.content` тайрсны дараа rootMargin үйлчлэхгүй, урьдчилан зурахгүй байв */
    const sp = scrollParentOf(ref.current);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } },
      { root: sp instanceof HTMLElement ? sp : null, rootMargin: '600px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [on]);
  return <div ref={ref} style={on ? undefined : { minHeight: minH }}>{on ? children() : null}</div>;
}

/* ══════════════════════ Зүүн: багцын жагсаалт ══════════════════════ */

export function PkgList({ m, sel, onOpen }: { m: TuhModel; sel: string | null; onOpen: (k: string | null) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TUH_GROUPS.map((g) => ({
      g: g.key,
      rows: m.rows.filter((r) => r.p.group === g.key
        && (!needle || `${r.p.code} ${r.p.name} ${r.p.contractor}`.toLowerCase().includes(needle))),
    })).filter((x) => x.rows.length);
  }, [m.rows, q]);
  /* Идэвхтэй мөр жагсаалтын харагдах хэсэгт байх */
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sel || !bodyRef.current) return;
    /* Зөвхөн жагсаалтын хайрцгийг гүйлгэнэ — `scrollIntoView` нь `.content`-ийг ч гүйлгэж, нарийн дэлгэцэнд (жагсаалт дээр
       байрлах үед) хуудсыг буцаан дээш үсрүүлдэг байв */
    const box = bodyRef.current;
    const it = box.querySelector<HTMLElement>(`[data-k="${CSS.escape(sel)}"]`);
    if (!it) return;
    const bt = box.getBoundingClientRect();
    const r = it.getBoundingClientRect();
    if (r.top < bt.top) box.scrollTop -= bt.top - r.top + 4;
    else if (r.bottom > bt.bottom) box.scrollTop += r.bottom - bt.bottom + 4;
  }, [sel]);
  return (
    <nav className={b.list} aria-label={tr('Багцууд')}>
      <button type="button" className={`${b.allBtn} ${sel == null ? b.on : ''}`} onClick={() => onOpen(null)}>
        {tr('Тойм')}<span>{num(m.rows.length)}</span>
      </button>
      <input
        className={b.search}
        type="search"
        value={q}
        placeholder={tr('Багц, гүйцэтгэгчээр хайх')}
        aria-label={tr('Багц, гүйцэтгэгчээр хайх')}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={b.listBody} ref={bodyRef}>
        {groups.map(({ g, rows }) => (
          <section key={g} className={b.grp}>
            <h3>{groupLabel(g)}<span>{num(rows.length)}</span></h3>
            {rows.map((r) => (
              <button
                key={r.p.key}
                type="button"
                data-k={r.p.key}
                className={`${b.item} ${sel === r.p.key ? b.on : ''}`}
                aria-current={sel === r.p.key ? 'true' : undefined}
                onClick={() => onOpen(r.p.key)}
                title={`${r.p.code} · ${r.p.name}`}
              >
                <i className={`${b.dot} ${toneCls(r.status)}`} aria-hidden />
                <span className={b.itemName}><b>{r.p.code}</b>{r.p.name}</span>
                <span className={b.itemPct}>{r.progress == null ? '—' : pct(r.progress, 0)}</span>
              </button>
            ))}
          </section>
        ))}
        {!groups.length && <p className={b.empty}>{tr('Тохирох багц алга.')}</p>}
      </div>
    </nav>
  );
}

/* ══════════════════════ Анхааруулга ══════════════════════ */

type Alert = { key: string; code: string; text: string; tone: string };

function alertsOf(m: TuhModel): Alert[] {
  const out: Alert[] = [];
  for (const r of m.rows) {
    const k = r.p.key;
    const code = r.p.code;
    const finished = r.status === 'done' || (r.progress != null && r.progress >= 100);
    const left = daysLeft(r.p.end, m.today);
    if (r.status === 'late') out.push({ key: k, code, text: tr('хоцорсон {0}', gapText(gapOf(r))), tone: b.warn });
    /* Гэрээгүй / хэмжигдээгүй багцыг «хэтэрсэн» гэхгүй — гүйцэтгэл мэдэгдэхгүй */
    if (r.p.contracted && r.progress != null && !finished && left != null && left < 0) out.push({ key: k, code, text: tr('гэрээт хугацаа хэтэрсэн'), tone: b.bad });
    /* 2026-11-24: таамаг биет хэмжилтээр (`phys`) — 7 хоногийн ахиц нь биет */
    const fc = forecastEnd({ progress: r.phys, week: r.week }, m.now);
    if (fc != null && r.p.end != null && fc > r.p.end + 30 * DAY && left != null && left >= 0) out.push({ key: k, code, text: tr('одоогийн хурдаар {0}-нд дуусна', date(fc)), tone: b.warn });
    if (!finished && r.reportAge != null && r.reportAge > TUH_STALE_DAYS) out.push({ key: k, code, text: tr('{0} хоног тайлангүй', num(r.reportAge)), tone: b.mute });
    const paid = workPaidPct(r.ipc);
    if (paid != null && r.progress != null && paid - r.progress > 15) out.push({ key: k, code, text: tr('ажлын олголт {0} · гүйцэтгэл {1}', pct(paid, 0), pct(r.progress, 0)), tone: b.warn });
  }
  return out;
}

/* ══════════════════════ Тойм + бүх багц (дэлгээтэй) ══════════════════════ */

/** Ойрын БОСОО гүйлгэгч эцэг (ТУХ-д `.content`); олдохгүй бол цонх */
function scrollParentOf(el: HTMLElement): HTMLElement | Window {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return window;
}

/** Тухайн сэдвээр багцад ХАРУУЛАХ мэдээлэл байгаа эсэх — сэдвээр шүүхэд хоосон багцыг нууна. Нэмэлт өгөгдөл ачаалагдаагүй бол бүгдийг үлдээнэ */
function hasTheme(r: TuhRow, t: Theme, m: TuhModel, extra: TuhExtra | null): boolean {
  const own = r.own && !!r.p.pkgKey;
  const k = r.p.pkgKey;
  switch (t) {
    case 'progress': return r.progress != null || r.prog != null;
    case 'time': return r.p.start != null || r.p.end != null;
    case 'money': return r.ipc != null || r.p.cost != null || r.p.contractAmount != null;
    case 'quality': return (r.ma == null && r.mir == null) || (r.ma?.total ?? 0) > 0 || (r.mir?.total ?? 0) > 0;
    case 'blocks': return r.p.group === 'housing';
    case 'deps': { const l = linkedRows(m, r.p.key); return l == null || l.length > 0; }
    case 'land': return extra?.land == null || (own && extra.land.has(k));
    case 'permit': return extra?.permits == null || (own && (extra.permits.get(k)?.length ?? 0) > 0);
    case 'safety': return extra?.safety == null || r.workers != null || (own && (extra.safety.get(k)?.total ?? 0) > 0);
    case 'ajil': return extra?.ajilPending == null || (own && (extra.ajilPending.get(k) ?? 0) > 0);
    default: return true;
  }
}

export function Portfolio({ m, extra = null, contractTotal = null, sel = null, jump = 0, onOpen, onRetry, onActive, onOpenDeps }: {
  m: TuhModel;
  extra?: TuhExtra | null;
  /** Сонгосон (дарсан) багц ба сонголтын тоолуур — нуугдсан багц руу очвол шүүлтийг цэвэрлэнэ */
  sel?: string | null;
  jump?: number;
  /** Гэрээний нийт дүн — `live.loadBudget().contract` (Ерөнхий дашбоард · Тайлантай НЭГ эх); мөрийн нийлбэр БИШ */
  contractTotal?: number | null;
  onOpen: (k: string) => void;
  onRetry?: () => void;
  /** Гүйлгэхэд дэлгэцийн дээд хэсэгт байгаа багц (жагсаалт · газрын зургийн тодруулга) */
  onActive?: (k: string | null) => void;
  onOpenDeps?: () => void;
}) {
  const [grp, setGrp] = useState<TuhGroup | null>(null);
  const [st, setSt] = useState<TuhStatus | null>(null);
  const [themes, setThemes] = useState<ReadonlySet<Theme>>(() => new Set());
  const heatYear = heatWinterYear(m.today);
  const heatQ = useAsync(() => (heatYear == null ? Promise.resolve(null) : loadHeatBlocks(heatYear)), [heatYear]);
  const heat = heatQ.state === 'ready' ? heatQ.data : null;

  const contracted = m.rows.filter((r) => r.p.contracted);
  const late = m.statusCount.get('late') ?? 0;
  const alerts = useMemo(() => alertsOf(m), [m]);
  const [allAlerts, setAllAlerts] = useState(false);

  /* Сэдэв сонгосон бол тэр сэдвээр мэдээлэлтэй багцууд л (хоосон хайрцагтай багц үлдээхгүй) */
  const rows = useMemo(
    () => m.rows.filter((r) => (grp == null || r.p.group === grp) && (st == null || r.status === st)
      && (themes.size === 0 || [...themes].some((t) => hasTheme(r, t, m, extra)))),
    [m, grp, st, themes, extra],
  );

  /*
   * Нуугдсан багц руу очих (жагсаалт · анхааруулга · хамаарал · газрын зураг) — шүүлтийг цэвэрлэж тэр багцыг харуулна.
   * Зөвхөн ШИНЭ сонголтоор (`jump`) — сонгосны дараа хэрэглэгч өөрөө шүүвэл буцааж цэвэрлэхгүй.
   */
  const hidden = sel != null && m.rows.some((r) => r.p.key === sel) && !rows.some((r) => r.p.key === sel);
  const [seenJump, setSeenJump] = useState(jump);
  if (jump !== seenJump) {
    /* Render үеийн тохируулга (effect биш) — шүүлт нэг дамжлагаар цэвэрлэгдэнэ */
    setSeenJump(jump);
    if (hidden) { setGrp(null); setSt(null); setThemes(new Set()); }
  }

  /*
   * Шүүлтийн мөрийн өндөр → `--tuh-bar`: багц руу гүйлгэхэд гарчиг нь наалттай мөрийн ДООР гарна (урьд нь 64px тогтмол
   * зай мөрөөс (~115px) бага тул гарчиг далд ордог байв). Мөр наалтгүй (жижиг өргөн) бол 0.
   */
  const mainRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const main = mainRef.current;
    if (!bar || !main || typeof ResizeObserver === 'undefined') return undefined;
    const set = () => {
      const h = getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().height : 0;
      main.style.setProperty('--tuh-bar', `${Math.round(h)}px`);
    };
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    set();
    return () => ro.disconnect();
  }, []);

  /*
   * Гүйлгэх үед идэвхтэй багц — шүүлтийн мөрийн ЯГ ДООРХ шугамыг дайрч буй багц. Урьд нь IntersectionObserver-ийн
   * хуучирсан `top`-оор эрэмбэлдэг тул өмнөх багц тодордог байв; цонх биш, жинхэнэ гүйлгэгч (`.content`)-ийг сонсоно.
   */
  const listRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(sel);
  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => {
    const list = listRef.current;
    if (!onActive || !list) return undefined;
    const scroller = scrollParentOf(list);
    let raf = 0;
    const calc = () => {
      raf = 0;
      const bar = barRef.current?.getBoundingClientRect();
      const top = scroller instanceof HTMLElement ? scroller.getBoundingClientRect().top : 0;
      /* Мөр хараахан наалдаагүй (тойм харагдаж буй) — идэвхтэй багц алга */
      if (!bar || bar.top > top + 8) { onActive(null); return; }
      /* Наалтгүй мөр (жижиг өргөн) гүйлгэгдэж алга болсон бол гүйлгэгчийн дээд ирмэгээр */
      const y = Math.max(bar.bottom, top) + 16;
      let hit: string | null = null;
      for (const el of list.children) {
        if (!(el instanceof HTMLElement) || !el.dataset.k) continue;
        const r = el.getBoundingClientRect();
        if (r.top > y) break;
        /* Багц хоорондын зайд — өмнөх багц хэвээр (анивчихгүй) */
        hit = el.dataset.k;
        if (r.bottom > y) break;
      }
      /* Гүйлгэлтийн ТӨГСГӨЛ — сүүлийн багцууд шугамд хүрэхгүй: дарсан багц харагдаж байвал түүнийг */
      if (scroller instanceof HTMLElement && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2 && selRef.current) {
        const se = list.querySelector<HTMLElement>(`[data-k="${CSS.escape(selRef.current)}"]`);
        const sr = se?.getBoundingClientRect();
        const vb = scroller.getBoundingClientRect().bottom;
        if (sr && sr.top < vb && sr.bottom > y) hit = selRef.current;
      }
      onActive(hit);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    scroller.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    on();
    return () => {
      scroller.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [onActive, rows]);

  const toggleTheme = (t: Theme) => setThemes((cur) => {
    const nx = new Set(cur);
    if (nx.has(t)) nx.delete(t); else nx.add(t);
    return nx;
  });

  return (
    <div className={b.main} ref={mainRef}>
      <header className={b.head} id="tuh-top">
        <div>
          <p className={b.eyebrow}>{tr('Төслийн удирдлагын хяналт')}</p>
          <h1 className={b.h1}>{tr('Бүх багцын хяналт')}</h1>
          <p className={b.sub}>{m.lastReport ? tr('Сүүлд тайлагнасан {0}', m.lastReport) : tr('Тайлан ирээгүй')}</p>
        </div>
      </header>

      {(m.failed.length > 0 || (extra?.failed.length ?? 0) > 0) && (
        <p className={b.warnLine} role="alert">
          {tr('Дутуу эх сурвалж: {0}', [...m.failed, ...(extra?.failed ?? [])].join(', '))}
          {onRetry && <button type="button" onClick={onRetry}>{tr('Дахин оролдох')}</button>}
        </p>
      )}

      <div className={b.kpis}>
        {/* 2026-11-24 (аудит): Төслийн нийт мөрийн S ба түүний P (удирдлагын тайлантай нэг); орон сууц тусдаа нэртэй */}
        <Kpi label={tr('Төслийн бодит гүйцэтгэл')} value={lz(m, 'project')(m.hero.actual == null ? '—' : pct(m.hero.actual, 2))}
          note={tr('төлөвлөгөө {0}', lz(m, 'project')(m.hero.plan == null ? '—' : pct(m.hero.plan, 2)))} />
        <Kpi label={tr('Орон сууцны блокийн явц')} value={m.hero.housing == null ? '—' : pct(m.hero.housing, 2)}
          note={[tr('төлөвлөгөө {0}', planText(m)), planScopeNote(m.hero.planExcluded)].filter(Boolean).join(' · ')} />
        <Kpi label={tr('Багц')} value={num(m.rows.length)} note={tr('{0} / {1} багц гэрээлсэн', num(contracted.length), num(m.rows.length))} />
        <Kpi label={tr('Гэрээний нийт дүн')} value={lz(m, 'budget')(mnt(contractTotal))} />
        <Kpi label={tr('Олгосон санхүүжилт')} value={mnt(m.paid.total)} note={[
          m.paid.pct == null ? null : tr('гэрээний {0}', pct(m.paid.pct, 2)),
          m.paid.other ? tr('гэрээлсэн багцаас гадуур олгосон {0} (хувьд ороогүй)', mnt(m.paid.other)) : null,
        ].filter(Boolean).join(' · ') || undefined} />
        <Kpi label={tr('Хоцорсон багц')} value={num(late)} tone={late ? b.warn : undefined} />
        <Kpi label={tr('{0} оны өвөл дулаан авах', heatYear == null ? '—' : String(heatYear))}
          value={heatQ.state === 'loading' ? '…' : heat?.planned == null ? '—' : num(heat.planned)}
          note={heatQ.state === 'loading' ? undefined : heatQ.state === 'error' ? tr('ачаалж чадсангүй')
            : heat?.planned == null ? tr('огноо бөглөгдөөгүй') : tr('блок · {0} авсан', num(heat.done))} />
      </div>

      {alerts.length > 0 && (
        <section className={b.alerts} aria-label={tr('Анхааруулга')}>
          <h2>{tr('Анхааруулга')}<span>{num(alerts.length)}</span></h2>
          <ul>
            {(allAlerts ? alerts : alerts.slice(0, 12)).map((a, i) => (
              <li key={`${a.key}-${i}`}>
                <button type="button" onClick={() => onOpen(a.key)}>
                  <b>{a.code}</b><span className={a.tone}>{a.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {alerts.length > 12 && (
            <button type="button" className={b.link} onClick={() => setAllAlerts((v) => !v)}>
              {allAlerts ? tr('Хумих') : tr('Бүгдийг харах ({0})', num(alerts.length))}
            </button>
          )}
        </section>
      )}

      <div className={b.filterBar} ref={barRef}>
        <div className={b.chips} role="group" aria-label={tr('Сэдэв')}>
          <span className={b.filterLbl}>{tr('Сэдэв')}</span>
          <button type="button" aria-pressed={themes.size === 0} className={`${b.chip} ${themes.size === 0 ? b.on : ''}`} onClick={() => setThemes(new Set())}>
            {tr('Бүгд')}
          </button>
          {THEMES.map((t) => (
            <button key={t.key} type="button" aria-pressed={themes.has(t.key)}
              className={`${b.chip} ${themes.has(t.key) ? b.on : ''}`} onClick={() => toggleTheme(t.key)}>
              {t.label()}
            </button>
          ))}
        </div>
        <div className={b.chips} role="group" aria-label={tr('Төлөв')}>
          <span className={b.filterLbl}>{tr('Төлөв')}</span>
          {TUH_STATUS.filter((s) => (m.statusCount.get(s.key) ?? 0) > 0).map((s) => (
            <button key={s.key} type="button" aria-pressed={st === s.key}
              className={`${b.chip} ${toneCls(s.key)} ${st === s.key ? b.on : ''}`}
              onClick={() => setSt((c) => (c === s.key ? null : s.key))}>
              {s.icon} {s.label()} <b>{num(m.statusCount.get(s.key) ?? 0)}</b>
            </button>
          ))}
          <select className={b.select} value={grp ?? ''} aria-label={tr('Ангилал')}
            onChange={(e) => setGrp((e.target.value || null) as TuhGroup | null)}>
            <option value="">{tr('Бүх ангилал')}</option>
            {TUH_GROUPS.filter((g) => m.rows.some((r) => r.p.group === g.key)).map((g) => <option key={g.key} value={g.key}>{g.label()}</option>)}
          </select>
        </div>
      </div>

      <div className={b.pkgs} ref={listRef}>
        {rows.map((r) => (
          <PkgBoard key={r.p.key} r={r} m={m} extra={extra} themes={themes} onOpen={onOpen} onOpenDeps={onOpenDeps} />
        ))}
        {!rows.length && <p className={b.empty}>{tr('Тохирох багц алга.')}</p>}
      </div>
      {m.cfGaps && <p className={b.note}>{m.cfGaps}</p>}
    </div>
  );
}

const planText = (m: TuhModel) => {
  const p = m.hero.planContractor ?? m.hero.planContract;
  const cov = m.hero.planContractor != null ? coverageNote(m.hero.planCoverage) : '';
  return (p == null ? '—' : pct(p, 2)) + (cov ? ` · ${cov}` : '');
};

/* ══════════════════════ Нэг багц (дэлгээтэй) ══════════════════════ */

const PERMIT_LABEL = { ok: () => tr('Зөвшөөрсөн'), wait: () => tr('Хүлээгдэж буй'), no: () => tr('Зөвшөөрөөгүй'), unknown: () => tr('Тодорхойгүй') };

export function PkgBoard({ r, m, extra = null, themes = new Set(), onOpen, onOpenDeps }: {
  r: TuhRow;
  m: TuhModel;
  extra?: TuhExtra | null;
  /** Харуулах сэдвүүд — хоосон бол бүгд */
  themes?: ReadonlySet<Theme>;
  onOpen: (k: string) => void;
  /** Хуучин API — хэрэглэгдэхгүй (тест нийцэл) */
  onBack?: () => void;
  onOpenDeps?: () => void;
}) {
  const p = r.p;
  const show = (t: Theme) => themes.size === 0 || themes.has(t);
  const gap = gapOf(r);
  const plan = planOf(r);
  const elapsed = elapsedPct(p.start, p.end, m.now);
  const left = daysLeft(p.end, m.today);
  const fc = forecastEnd({ progress: r.phys, week: r.week }, m.now);
  const ipc = r.ipc;
  const docs = (d: TuhRow['ma']) => (d == null ? '—' : tr('{0} · батлагдсан {1} · хянагдаж буй {2} · буцаагдсан {3}', num(d.total), num(d.approved), num(d.review), num(d.returned)));
  /*
   * Нэмэлт сэдэв (газар · зөвшөөрөл · ХАБЭА · нэмэлт ажил · блок) — зөвхөн багцын ЭЗЭН мөрөнд (`own`, model.ts-ийн хүн хүч,
   * MA/MIR-тэй нэг дүрэм). Зураг төслийн / ижил кодтой бусад мөрөнд давхар харуулахгүй, түлхүүргүй мөрөнд «—».
   */
  const x = r.own && p.pkgKey ? extra : null;
  const k = p.pkgKey;
  const na = extra ? '—' : '…';
  const land = x?.land?.get(k);
  const permits = x?.permits?.get(k) ?? [];
  const safety = x?.safety?.get(k);
  const ajil = x?.ajilPending?.get(k);
  const blocks = p.group === 'housing' ? x?.blocks?.get(k) ?? null : null;

  return (
    <article className={b.pkg} id={anchorId(p.key)} data-k={p.key}>
      <header className={b.pkgHead}>
        <div>
          <p className={b.eyebrow}>{groupLabel(p.group)}</p>
          <h2 className={b.h2}>{p.code}<span>{p.name}</span></h2>
          <p className={b.sub}>
            {[p.contractor || tr('Гүйцэтгэгч тодорхойгүй'), p.contractNo ? tr('гэрээ {0}', p.contractNo) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <StatusPill st={r.status} />
      </header>

      <div className={b.kpis}>
        {/* 2026-11-24: багцын мөр — «Багцын гүйцэтгэл» (Төсөл төлөвлөгөө биелэлт, 2-р унтраалга); 7 хоногийн ахиц нь биет хэмжилтийнх */}
        <Kpi label={r.byPackage ? tr('Багцын гүйцэтгэл') : tr('Бодит гүйцэтгэл')}
          value={lz(m, ...(r.byPackage ? ['pkg'] as const : ['plan', 'hist', 'live'] as const))(r.progress == null ? '—' : pct(r.progress, 2))}
          note={r.week == null ? undefined : r.byPackage ? tr('биет гүйцэтгэл 7 хоногт {0}', gapText(r.week)) : tr('7 хоногт {0}', gapText(r.week))} />
        <Kpi label={tr('Төлөвлөгөө')} value={lz(m, ...(r.byPackage ? ['pkg'] as const : ['plan', 'cfPlan'] as const))(plan == null ? '—' : pct(plan, 2))}
          note={r.byPackage ? tr('багцын төлөвлөгөө') : r.statusBasis === 'contractor' ? tr('гүйцэтгэгчийн хуваарь')
            : r.planContractor != null && !coverageOk(r.planCoverage)
              /* Хуваарь дутуу — гэрээний төлөвлөгөө байвал түүгээр дүгнэнэ, үгүй бол дүгнэхгүй */
              ? `${coverageNote(r.planCoverage) || tr('хуваарь дутуу')} · ${r.planContract != null ? tr('гэрээний төлөвлөгөөгөөр дүгнэв') : tr('дүгнэхгүй')}`
              : r.planContract != null ? tr('гэрээний төлөвлөгөө') : undefined} />
        <Kpi label={tr('Зөрүү')} value={gapText(gap)} tone={gapTone(gap)} />
        <Kpi label={tr('Олгосон санхүүжилт')} value={ipc?.paid == null ? '—' : mnt(ipc.paid)}
          note={ipc?.paidPct == null ? undefined : tr('гэрээний {0}', pct(ipc.paidPct, 2))} />
        <Kpi label={tr('Хугацаа')} value={elapsed == null ? '—' : pct(elapsed, 0)}
          note={left == null ? undefined : left >= 0 ? tr('{0} хоног үлдсэн', num(left)) : tr('{0} хоног хэтэрсэн', num(-left))}
          tone={left != null && left < 0 ? b.bad : undefined} />
        <Kpi label={tr('Сүүлийн тайлан')} value={r.lastReport ?? '—'}
          note={r.reportAge == null ? undefined : tr('{0} хоногийн өмнө', num(r.reportAge))}
          tone={r.reportAge != null && r.reportAge > TUH_STALE_DAYS ? b.warn : undefined}
          stale={r.reportAge != null && r.reportAge > TUH_STALE_DAYS} />
      </div>

      <div className={b.grid}>
        {show('progress') && (
          <Card title={tr('Гүйцэтгэлийн явц')} note={tr('төлөвлөгөө ба бодит гүйцэтгэл, сараар')} wide>
            {r.prog
              ? <Lazy minH={260}>{() => <ProgChart months={r.prog!} title="" loading={m.loading.has('plan')} planFailed={r.planFailed} />}</Lazy>
              : <p className={b.empty}>{r.progress == null ? tr('Гүйцэтгэл хэмжигдээгүй.')
                : r.byPackage ? tr('Багцын гүйцэтгэл {0} — хуваарийн муруй алга.', pct(r.progress, 2))
                  : tr('Бодит гүйцэтгэл {0} — хуваарийн муруй алга.', pct(r.progress, 2))}</p>}
          </Card>
        )}

        {show('time') && (
          <Card title={tr('Хугацаа ба үе шат')}>
            <Facts items={[
              [tr('Гэрээт хугацаа'), `${date(p.start)} – ${date(p.end)}`],
              [tr('Дуусах таамаг'), fc == null ? tr('тооцох боломжгүй') : date(fc)],
              [tr('Захирамж'), p.orders.length ? p.orders.map((o) => `${o.no}${o.date ? ` (${date(o.date)})` : ''}`).join(', ') : '—'],
              [usesHandover(m, r) ? tr('Төлөвлөсөн ашиглалтад оруулах огноо') : tr('Улсын комисс'), commissionText(m, r)],
              [tr('Хоцролт'), r.delay == null ? '—' : r.delay > 0 ? tr('{0} хоног', num(r.delay)) : tr('хугацаандаа')],
            ]} />
            {usesHandover(m, r) && <p className={b.hint}>{tr('Хуваарьт огноо алга — Төсөл төлөвлөгөө биелэлт — төлөвлөсөн огноо')}</p>}
            <Bar v={elapsed} plan={r.progress} />
            <p className={b.hint}>{r.byPackage
              ? tr('Өнгөрсөн хугацаа {0} · багцын гүйцэтгэл {1}', elapsed == null ? '—' : pct(elapsed, 0), r.progress == null ? '—' : pct(r.progress, 0))
              : tr('Өнгөрсөн хугацаа {0} · бодит гүйцэтгэл {1}', elapsed == null ? '—' : pct(elapsed, 0), r.progress == null ? '—' : pct(r.progress, 0))}</p>
            {fc != null && <p className={b.hint}>{tr('Таамаг: сүүлийн 7 хоногийн ахицаар ({0}) үлдсэн ажил дуусах огноо', gapText(r.week))}</p>}
          </Card>
        )}

        {show('money') && (
          <Card title={tr('Санхүүжилт')}>
            <Facts items={[
              [tr('Урьдчилсан төсөвт өртөг'), mnt(p.cost)],
              [tr('Гэрээний дүн'), p.contractAmount != null ? mnt(p.contractAmount) : tr('Гэрээгүй')],
              [tr('Олгосон'), ipc?.paid == null ? '—' : `${mnt(ipc.paid)}${ipc.paidPct == null ? '' : ` · ${pct(ipc.paidPct, 2)}`}`],
              [tr('Олгосон IPC'), ipc ? num(ipc.ipcNos.length) : '—'],
              [tr('Сүүлд олгосон'), ipc?.lastPaidDate ?? '—'],
              [tr('Хянагдаж буй'), ipc?.review ? tr('{0} акт · {1}', num(ipc.review.count), mnt(ipc.review.une)) : '—'],
              [tr('Урьдчилгаа'), ipc?.advance == null ? '—' : mnt(ipc.advance)],
            ]} />
            {ipc && jointNote(ipc) && <p className={b.hint}>{jointNote(ipc)}</p>}
          </Card>
        )}

        {show('money') && r.months && r.months.length > 0 && (
          <Card title={tr('Санхүүжилтийн явц')} note={tr('сараар')} wide>
            <Lazy minH={240}>{() => (
              <ComboChart items={r.months!} height={240} lagMonth={r.lag?.month} lagLvl={lagLevelOf(r.lag)}
                contract={p.cost != null && p.cost > 0 ? p.cost : null} />
            )}</Lazy>
          </Card>
        )}

        {show('land') && (
          <Card title={tr('Газар чөлөөлөлт')}>
            {x?.land == null ? <p className={b.empty}>{na}</p> : (
              <Facts items={[[tr('Чөлөөлөгдөөгүй нэгж талбар'),
                land === undefined ? tr('давхцал алга') : land === null ? tr('ачаалж чадсангүй') : num(land)]]} />
            )}
            {land != null && land > 0 && <p className={`${b.hint} ${b.warn}`}>{tr('Багцын талбайд {0} нэгж талбар чөлөөлөгдөөгүй байна.', num(land))}</p>}
          </Card>
        )}

        {show('permit') && (
          <Card title={tr('Зөвшөөрөл')} note={permits.length ? tr('{0} / {1} зөвшөөрсөн', num(permits.filter((x) => x.status === 'ok').length), num(permits.length)) : undefined}>
            {x?.permits == null ? <p className={b.empty}>{na}</p> : !permits.length ? <p className={b.empty}>{tr('Зөвшөөрөл бүртгэгдээгүй.')}</p> : (
              <ul className={b.tags}>
                {permits.map((z, i) => (
                  <li key={i} className={z.status === 'ok' ? b.good : z.status === 'no' ? b.bad : z.status === 'wait' ? b.warn : b.mute}>
                    <span>{z.name}</span><em>{PERMIT_LABEL[z.status]()}{z.date ? ` · ${date(z.date)}` : ''}</em>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {show('safety') && (
          <Card title={tr('ХАБЭА')}>
            <Facts items={[
              [tr('Ажилтан'), lz(m, 'workforce')(r.workers == null ? '—' : num(r.workers))],
              [tr('Техник'), lz(m, 'workforce')(r.technik == null ? '—' : num(r.technik))],
              [tr('Осол, зөрчил (нийт)'), x?.safety == null ? na : num(safety?.total ?? 0)],
              [tr('Сүүлийн 30 хоногт'), x?.safety == null ? na : num(safety?.recent ?? 0)],
              ...(safety?.last ? [[tr('Сүүлд бүртгэгдсэн'), date(safety.last)] as [string, string]] : []),
            ]} />
            {safety && safety.byType.length > 0 && (
              <p className={b.hint}>{[...safety.byType].sort((u, v) => v.n - u.n).map((u) => `${u.type} ${num(u.n)}`).join(' · ')}</p>
            )}
          </Card>
        )}

        {show('quality') && (
          <Card title={tr('Чанар')}>
            <Facts items={[
              [tr('Материал (MA)'), lz(m, 'docs')(docs(r.ma))],
              [tr('Үзлэг (MIR)'), lz(m, 'docs')(docs(r.mir))],
            ]} />
          </Card>
        )}

        {show('ajil') && (
          <Card title={tr('Нэмэлт ажил')}>
            <Facts items={[[tr('Батлагдахыг хүлээж буй'), x?.ajilPending == null ? na : num(ajil ?? 0)]]} />
          </Card>
        )}

        {show('blocks') && p.group === 'housing' && (
          <Card title={tr('Блок · дулаан')} note={blocks ? tr('{0} блок', num(blocks.length)) : undefined} wide>
            {blocks == null ? <p className={b.empty}>{na}</p> : !blocks.length ? <p className={b.empty}>{tr('Блок алга.')}</p> : (
              <div className={b.blockGrid}>
                {blocks.map((z) => (
                  <div key={z.block} className={b.block} title={`${z.block}${z.households != null ? ` · ${z.households} ${tr('айл')}` : ''}`}>
                    <b>{z.block}</b>
                    <span>{z.pct == null ? '—' : pct(z.pct, 0)}</span>
                    <Bar v={z.pct} />
                    <small className={z.heatDone ? b.heatDone : z.heatPlan ? b.heatPlan : b.heatNone}>
                      {z.heatDone ? tr('дулаан авсан {0}', z.heatDone) : z.heatPlan ? tr('дулаан {0}', z.heatPlan) : tr('дулааны огноогүй')}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {show('blocks') && p.group === 'housing' && (
          <Card title={tr('Хүн хүч, хамрах хүрээ')}>
            <Facts items={[
              [tr('Блок'), lz(m, 'packs')(r.blocks == null ? '—' : num(r.blocks))],
              [tr('Айл'), lz(m, 'packs')(r.households == null ? '—' : num(r.households))],
            ]} />
          </Card>
        )}

        {show('deps') && (
          <Card title={tr('Хамаарал')} note={onOpenDeps ? <button type="button" className={b.link} onClick={onOpenDeps}>{tr('6 түвшний хуваарь →')}</button> : undefined}>
            <DepList label={tr('Холбоотой багцууд')} rows={linkedRows(m, p.key)} onOpen={onOpen} />
          </Card>
        )}
      </div>
    </article>
  );
}

function DepList({ label, rows, onOpen }: { label: string; rows: TuhRow[] | null; onOpen: (k: string) => void }) {
  return (
    <div className={b.dep}>
      <h4>{label}</h4>
      {rows == null ? <p className={b.empty}>…</p> : !rows.length ? <p className={b.empty}>{tr('холбоо бүртгэгдээгүй')}</p> : (
        <ul>
          {rows.map((x) => (
            <li key={x.p.key}>
              <button type="button" onClick={() => onOpen(x.p.key)}>
                <i className={`${b.dot} ${toneCls(x.status)}`} aria-hidden /><b>{x.p.code}</b>
                <span>{x.progress == null ? '—' : pct(x.progress, 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

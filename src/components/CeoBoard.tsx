'use client';

/**
 * CEO-ГИЙН САМБАР — ҮЙЛ АЖИЛЛАГААНЫ СХЕМ ӨӨРӨӨ ДАШБОАРД.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { Loading } from '@/components/ui';
import { dataVersion, subscribeData } from '@/lib/dataBus';
import { useAsync, type Async } from '@/lib/useAsync';
import { CEO_KPIS, type CeoKpiDef } from '@/lib/ceo/registry';
import { kpisAt, fineOf } from '@/lib/ceo/schemMap';
import { ALL_PKG, filterResult, pkgOptions } from '@/lib/ceo/filter';
import type { Cell, DetailTable, KpiResult } from '@/lib/ceo/kpi';
import { LEVEL_MARK, LEVEL_TONE, levelLabel, type Level } from '@/lib/kpiLevels';
import {
  FINE_NODES, FINE_EDGES, FINE_BY_ID, fineOrder, type FineId,
} from '@/lib/schemFine';
import { edgePath, layoutOf, type Box } from '@/lib/schem';
import { nodeDetail } from '@/lib/schemDetail';
import { loadSchemSources } from '@/lib/schemData';
import { num, pct, mnt, date } from '@/lib/format';
import { shortError } from '@/lib/ceo/review';
import type { ViewKey } from '@/lib/services';
import s from './ceoBoard.module.css';

/* ══════════════ Ачаалалт ══════════════ */

export type Slot = Async<KpiResult>;
const LOADING: Slot = { state: 'loading', data: null, error: null };

/**
 * 13 ачаалагчийг НЭГ эффектээр удирдана.
 */
function useKpis(): { slots: Record<string, Slot>; retry: (key: string) => void } {
  const [slots, setSlots] = useState<Record<string, Slot>>(() => (
    Object.fromEntries(CEO_KPIS.map((d) => [d.key, LOADING]))
  ));
  const bus = useSyncExternalStore(subscribeData, dataVersion, () => 0);
  const gen = useRef<Record<string, number>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    let idle: number | null = null;

    const run = (d: CeoKpiDef) => {
      d.load().then(
        (data) => { if (alive) setSlots((r) => ({ ...r, [d.key]: { state: 'ready', data, error: null } })); },
        (e: unknown) => {
          if (!alive) return;
          const error = e instanceof Error ? e : new Error(String(e));
          setSlots((r) => ({ ...r, [d.key]: { state: 'error', data: null, error } }));
        },
      );
    };

    CEO_KPIS.filter((d) => !d.heavy).forEach(run);
    const heavy = CEO_KPIS.filter((d) => d.heavy);
    const startHeavy = () => {
      heavy.forEach((d, i) => {
        timers.push(window.setTimeout(() => { if (alive) run(d); }, i * 400));
      });
    };
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(startHeavy, { timeout: 2500 });
    } else {
      timers.push(window.setTimeout(startHeavy, 1200));
    }
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
      if (idle != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    };
  }, [bus]);

  /**
   * Нэг үзүүлэлтийг дахин татна.
   */
  const retry = useCallback((key: string) => {
    const d = CEO_KPIS.find((x) => x.key === key);
    if (!d) return;
    const g = (gen.current[key] ?? 0) + 1;
    gen.current[key] = g;
    setSlots((r) => ({ ...r, [key]: LOADING }));
    d.load().then(
      (data) => {
        if (mounted.current && gen.current[key] === g) setSlots((r) => ({ ...r, [key]: { state: 'ready', data, error: null } }));
      },
      (e: unknown) => {
        if (!mounted.current || gen.current[key] !== g) return;
        const error = e instanceof Error ? e : new Error(String(e));
        setSlots((r) => ({ ...r, [key]: { state: 'error', data: null, error } }));
      },
    );
  }, []);
  return { slots, retry };
}

/* ══════════════ Туслах ══════════════ */

const levelOf = (x: Slot | undefined): Level => (
  !x ? 'loading' : x.state === 'ready' ? x.data.level : x.state === 'error' ? 'unknown' : 'loading'
);

/**
 * Хэд хэдэн үзүүлэлтийн ХАМГИЙН МУУ түвшин — зангилааны дохио.
 */
function worstLevel(list: readonly Level[]): Level | null {
  if (list.includes('bad')) return 'bad';
  if (list.includes('warn')) return 'warn';
  if (list.includes('good')) return 'good';
  return null;
}

/**
 * Хүснэгтийн нүд → текст.
 */
function cellText(c: Cell): string {
  if (c.v == null || c.v === '') return '—';
  if (typeof c.v !== 'number') return String(c.v);
  switch (c.kind) {
    case 'pct': return pct(c.v, 1);
    case 'mnt': return mnt(c.v);
    case 'ha': return `${num(c.v, 1)} ${tr('га')}`;
    case 'day': return tr('{0} хоног', num(c.v));
    default: return num(c.v, Number.isInteger(c.v) ? 0 : 1);
  }
}

/**
 * ЗАДАРГААНЫ ХҮСНЭГТ.
 */
/**
 * ТАСАЛСАН ТООНЫ МӨР мөн үү — `ceo/kpi.capRows` · `schemDetail`-ийн «… бас N мөр/ажил»:
 * эхний нүд «…»-ээр эхэлсэн текст, бусад нь хоосон.
 */
const isCapRow = (r: readonly Cell[] | undefined): boolean => {
  const head = r?.[0]?.v;
  return !!r && typeof head === 'string' && head.startsWith('…') && r.slice(1).every((c) => c.v === '' || c.v == null);
};

function Table({ t }: { t: DetailTable }) {
  if (t.rows.length === 0) return null;
  const count = t.rowsFull?.length ?? (isCapRow(t.rows[t.rows.length - 1]) ? t.rows.length - 1 : t.rows.length);
  return (
    <div className={s.tBox}>
      <div className={s.tTitle}>
        {t.title}
        <span className={`${s.tCount} num`}>{num(count)}</span>
      </div>
      <div className={s.tWrap}>
        <table className={s.tbl}>
          <thead>
            <tr>{t.cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={typeof c.v === 'number' ? `num ${s.tNum}` : undefined}>
                    {cellText(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ Схемийн зангилаа ══════════════ */

/** Зангилаан дээр гарах нэг мөр — үзүүлэлтийн гол тоо */
type NodeLine = { key: string; title: string; value: string; unit: string; level: Level };

function NodeCard({
  id, box, lines, on, onClick,
}: {
  id: FineId; box: Box; lines: NodeLine[]; on: boolean; onClick: () => void;
}) {
  const n = FINE_BY_ID[id];
  const lv = worstLevel(lines.map((l) => l.level));
  /* Ачаалж буй/алдаатай ч гэсэн зангилаа нь үзүүлэлттэйгээ мэдэгдэнэ */
  const pending = lines.length > 0 && lv == null;
  const tip = [
    n.desc,
    ...lines.map((l) => `${l.title}: ${l.value} ${l.unit}`),
    tr('Дарж дэлгэрэнгүйг харна'),
  ].join('\n');

  return (
    <button
      type="button"
      className={`${s.node} ${lines.length ? s.nodeKpi : ''} ${on ? s.nodeOn : ''}`}
      style={{
        left: box.x, top: box.y, width: box.w, minHeight: box.h,
        ['--h']: lv ? LEVEL_TONE[lv] : 'var(--line-strong)',
      } as CSSProperties}
      aria-expanded={on}
      title={tip}
      onClick={onClick}
    >
      <span className={s.nHead}>
        <span className={s.nIcon} aria-hidden><Icon name={n.icon} size={11} /></span>
        <span className={s.nTitle}>{n.title}</span>
        {lv && (
          <span className={s.nMark} title={levelLabel(lv)}>
            <b aria-hidden>{LEVEL_MARK[lv]}</b>
            <em className={s.sr}>{levelLabel(lv)}</em>
          </span>
        )}
      </span>

      {lines.length === 0
        ? <span className={s.nDesc}>{n.desc}</span>
        : (
          <span className={s.nLines}>
            {lines.map((l) => (
              <span key={l.key} className={s.nLine} style={{ ['--h']: LEVEL_TONE[l.level] } as CSSProperties}>
                <b className={`${s.nVal} num ${l.value ? '' : s.skel}`}>{l.value}</b>
                <i className={s.nUnit}>{l.unit}</i>
              </span>
            ))}
          </span>
        )}
      {pending && <span className={s.sr}>{tr('Ачаалж байна…')}</span>}
    </button>
  );
}

/* ══════════════ Дэлгэрэнгүй ══════════════ */

/**
 * Нэг үзүүлэлтийн бүрэн задаргаа.
 */
export function KpiDetail({
  def, slot, pkg, onView, onRetry, projectLabel = false,
}: {
  def: CeoKpiDef; slot: Slot; pkg: string;
  onView: (k: ViewKey) => void; onRetry: () => void;
  projectLabel?: boolean;
}) {
  const lv = levelOf(slot);
  const raw = slot.state === 'ready' ? slot.data : null;
  const d = raw && pkg ? filterResult(raw, pkg) : raw;
  /* Бүтэн алдаа консолд; дэлгэцэнд богино мөр (`shortError`) */
  useEffect(() => {
    if (slot.state === 'error') console.warn('[selbe] CEO KPI:', def.key, slot.error);
  }, [slot, def.key]);
  return (
    <section className={s.kpi} style={{ ['--h']: LEVEL_TONE[lv] } as CSSProperties}>
      <header className={s.kHead}>
        <span className={s.nIcon} aria-hidden><Icon name={def.icon} size={13} /></span>
        <b className={s.kTitle}>{def.title}</b>
        <span className={s.kTag}>{LEVEL_MARK[lv]} {levelLabel(lv)}</span>
        {d && (
          <span className={s.kValue}>
            {projectLabel && <i>{tr('Төслийн нийт:')}</i>}
            <b className="num">{d.value}</b>
            {d.unit && <i>{d.unit}</i>}
          </span>
        )}
        <button type="button" className={s.kGo} onClick={() => onView(def.view)}>
          {tr('Харагдац руу орох')}
          <span aria-hidden>→</span>
        </button>
      </header>

      {pkg && d && (
        <p className={s.dScope}>
          {tr('Жагсаалт: {0} · дээрх тоо нь төслийн нийт', pkg)}
        </p>
      )}

      {pkg && d && d.tables.length === 0 && raw && raw.tables.length > 0 && (
        <p className={s.dNote}>{tr('{0}-д энэ үзүүлэлтээр асуудалтай мөр алга.', pkg)}</p>
      )}

      {slot.state === 'error' ? (
        <p className={s.dNote}>
          {tr('Татагдсангүй.')}{' '}
          <button type="button" className={s.dRetry} onClick={onRetry}>{tr('Дахин оролдох')}</button>
          <span className={s.dErr}> {shortError(slot.error)}</span>
        </p>
      ) : !d ? (
        <Loading />
      ) : (
        <>
          {d.facts.length > 0 && (
            <ul className={s.dFacts}>
              {d.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}

          {/* АСУУДЛУУД — «юу нь болохгүй байна» гэдгийг НЭР ЗААЖ */}
          {d.issues.length > 0 && (
            <ul className={s.dIssues}>
              {d.issues.map((is, i) => (
                <li key={i} className={s.dIssue} style={{ ['--h']: LEVEL_TONE[is.tone] } as CSSProperties}>
                  {is.text}
                </li>
              ))}
            </ul>
          )}

          {/* ЗАДАРГАА — асуудалтай мөр БҮР нэрээрээ */}
          {d.tables.map((t) => <Table key={t.title} t={t} />)}

          {/*
            * ЭХ СУРВАЛЖ — «—» нь ҮЙЛЧИЛГЭЭ УНАСНААС уу, үнэхээр байхгүйгээс үү
            * гэдгийг хэрэглэгч ТААХГҮЙ. Хэсэгчилсэн уналтыг ил хэлнэ.
            */}
          {(d.failedSources.length > 0 || d.asOf != null) && (
            <p className={s.dSrc}>
              {d.asOf != null && <span>{tr('Өгөгдөл: {0}', date(d.asOf))}</span>}
              {d.failedSources.length > 0 && (
                <span className={s.dSrcBad}>
                  {d.asOf != null && ' · '}
                  {tr('Татагдсангүй: {0}', d.failedSources.join(', '))}
                </span>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ══════════════ Самбар ══════════════ */

/** Схемийн байрлал — модулийн түвшинд НЭГ удаа (тор нь тогтмол) */
const ORDER = fineOrder();

/**
 * НҮҮРИЙН ТОР — «Үйл ажиллагааны схем» харагдацынхаас НЯГТ.
 */
/**
 * ЗҮҮН ТАЛЫН ЖАГСААЛТЫН ДАРААЛАЛ — ЧУХЛЫН ЭРЭМБЭ (2026-09-07, хэрэглэгч:
 * «нэмэлтээр зүүн талд KPI-уудын лист харуулъя — 1. газар чөлөөлөлт
 * 2. багцын гүйцэтгэл 3. багцын санхүү, цаашаа rank хамаагүй»).
 */
const LIST_ORDER: string[] = [
  /* 1 · Газар чөлөөлөлт — барилга эхлэх урьдчилсан нөхцөл */
  'land',
  /* 2 · Багцын гүйцэтгэл — хуваарь, обьём, хяналт, чанар */
  'schedule', 'variance', 'review',
  /* 3 · Багцын санхүү — акт, гэрээ, төсөв */
  'ipc', 'contractGap', 'uncontracted',
  /* Цаашид: нөхцөл ба аюулгүй байдал */
  'permits', 'suitability', 'safety', 'workforce', 'iot',
];

const GEO_HOME = { w: 158, h: 102, gapX: 20, gapY: 30, pad: 16 };
const L = layoutOf<FineId>(FINE_NODES, GEO_HOME);

export function CeoBoard({ onView }: { onView: (key: ViewKey) => void }) {
  const { slots, retry } = useKpis();
  /* Схемийн ӨӨРИЙН задаргаа — үзүүлэлтгүй зангилаанд (өмнөх схемтэй нэг эх) */
  const srcQ = useAsync(loadSchemSources, []);
  /**
   * СОНГОСОН БАГЦ — задаргааны жагсаалтыг шүүнэ.
   */
  const [pkg, setPkg] = useState<string>(ALL_PKG);
  /**
   * «ЯАРАЛТАЙ» ЖАГСААЛТ нээлттэй эсэх.
   */
  const [alertsOpen, setAlertsOpen] = useState(false);
  /**
   * Багцын сонголтууд — АМЬД өгөгдлөөс.
   */
  const pkgs = useMemo(() => pkgOptions(
    CEO_KPIS.map((d) => slots[d.key]).filter((x) => x?.state === 'ready').map((x) => x.data),
  ), [slots]);

  /* Зангилаа бүрийн мөрүүд */
  const linesOf = useMemo(() => {
    const m = new Map<FineId, NodeLine[]>();
    for (const n of FINE_NODES) {
      const keys = kpisAt(n.id);
      if (!keys.length) continue;
      m.set(n.id, keys.map((k) => {
        const def = CEO_KPIS.find((d) => d.key === k)!;
        const slot = slots[k];
        const d = slot?.state === 'ready' ? slot.data : null;
        return {
          key: k,
          title: def.title,
          value: slot?.state === 'error' ? '—' : d ? d.value : '',
          unit: d ? d.unit : '',
          level: levelOf(slot),
        };
      }));
    }
    return m;
  }, [slots]);

  /**
   * Нээлттэй зангилаа — НЭГ зэрэг ганц.
   */
  const [openId, setOpenId] = useState<FineId | null>(null);
  const [touched, setTouched] = useState(false);
  const worstNode = useMemo<FineId | null>(() => {
    for (const lv of ['bad', 'warn'] as const) {
      const hit = ORDER.find((id) => (linesOf.get(id) ?? []).some((l) => l.level === lv));
      if (hit) return hit;
    }
    return null;
  }, [linesOf]);
  const shownId = touched ? openId : openId ?? worstNode;
  const open = shownId ? FINE_BY_ID[shownId] : null;
  const openKpis = shownId ? kpisAt(shownId) : [];

  /**
   * СХЕМИЙН ӨӨРИЙН ЗАДАРГАА — үзүүлэлтгүй зангилаанд.
   */
  const schemDetail = useMemo(
    () => (open && !openKpis.length && srcQ.state === 'ready'
      ? nodeDetail(srcQ.data, open.group, null) : null),
    [open, openKpis.length, srcQ],
  );

  /* Толгойн тоолуур — дохиотой үзүүлэлтүүд */
  const counts = useMemo(() => {
    const c = { bad: 0, warn: 0, good: 0, loading: 0, unknown: 0 };
    for (const d of CEO_KPIS) {
      const lv = levelOf(slots[d.key]);
      if (lv === 'bad' || lv === 'warn' || lv === 'good' || lv === 'loading' || lv === 'unknown') c[lv] += 1;
    }
    return c;
  }, [slots]);

  /**
   * ЯАРАЛТАЙ/АНХААРАХ ҮЗҮҮЛЭЛТҮҮД — нэр, тоо, схемийн байрлалтайгаа.
   */
  const alertRows = useMemo(() => {
    const rank = { bad: 0, warn: 1 } as const;
    return CEO_KPIS
      .map((def) => {
        const slot = slots[def.key];
        const lv = levelOf(slot);
        if (lv !== 'bad' && lv !== 'warn') return null;
        const d = slot?.state === 'ready' ? slot.data : null;
        const node = fineOf(def.key);
        return {
          key: def.key,
          title: def.title,
          value: d ? d.value : '—',
          unit: d ? d.unit : '',
          level: lv,
          node: node ?? null,
          at: node ? FINE_BY_ID[node].title : '',
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => rank[a.level] - rank[b.level]);
  }, [slots]);

  /**
   * ЗҮҮН ТАЛЫН ЖАГСААЛТ — БҮХ үзүүлэлт (зөвхөн дохиотой нь БИШ).
   */
  const listRows = useMemo(() => {
    const rank = new Map(LIST_ORDER.map((k, i) => [k, i]));
    return CEO_KPIS
      .map((def) => {
        const slot = slots[def.key];
        const d = slot?.state === 'ready' ? slot.data : null;
        const node = fineOf(def.key);
        return {
          key: def.key,
          title: def.title,
          icon: def.icon,
          level: levelOf(slot),
          value: slot?.state === 'error' ? '—' : d ? d.value : '…',
          unit: d ? d.unit : '',
          node: node ?? null,
        };
      })
      .sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
  }, [slots]);

  const toggle = (id: FineId) => {
    setTouched(true);
    const opening = shownId !== id;
    setOpenId(opening ? id : null);
    if (opening) for (const k of kpisAt(id)) if (slots[k]?.state === 'error') retry(k);
  };

  return (
    <section className={s.board} aria-label={tr('Удирдлагын үзүүлэлт')}>
      <header className={s.head}>
        <h2 className={s.title}>{tr('Удирдлагын үзүүлэлт')}</h2>
        <span className={s.counts} aria-live="polite">
          {counts.bad + counts.warn > 0 ? (
            <button
              type="button"
              className={s.cntBtn}
              aria-expanded={alertsOpen}
              onClick={() => setAlertsOpen((v) => !v)}
            >
              {counts.bad > 0 && <b className={s.cntBad}><span aria-hidden>{LEVEL_MARK.bad}</span> {num(counts.bad)} {tr('яаралтай')}</b>}
              {counts.warn > 0 && <b className={s.cntWarn}><span aria-hidden>{LEVEL_MARK.warn}</span> {num(counts.warn)} {tr('анхаарах')}</b>}
              <span className={s.cntCaret} aria-hidden>{alertsOpen ? '▴' : '▾'}</span>
            </button>
          ) : null}
          {counts.good > 0 && <b className={s.cntGood}><span aria-hidden>{LEVEL_MARK.good}</span> {num(counts.good)} {tr('хэвийн')}</b>}
          {counts.unknown > 0 && <b className={s.cntNone}>{num(counts.unknown)} {tr('татагдсангүй')}</b>}
          {counts.loading > 0 && <b className={s.cntNone}>{num(counts.loading)} {tr('ачаалж байна')}</b>}
        </span>

        {/*
          * БАГЦЫН ШҮҮЛТ — задаргааны жагсаалтад л үйлчилнэ.
          */}
        {pkgs.length > 0 && (
          <label className={s.pkgPick}>
            <span className={s.sr}>{tr('Багц')}</span>
            <select
              className={s.pkgSel}
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
            >
              <option value={ALL_PKG}>{tr('Бүх багц')}</option>
              {pkgs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
      </header>

      {/*
        * ЯАРАЛТАЙ ҮЗҮҮЛЭЛТИЙН ЖАГСААЛТ — нэрээрээ.
        */}
      {alertsOpen && alertRows.length > 0 && (
        <ul className={s.alerts}>
          {alertRows.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                className={s.alertRow}
                style={{ ['--h']: LEVEL_TONE[a.level] } as CSSProperties}
                onClick={() => { if (a.node) { setTouched(true); setOpenId(a.node); } }}
              >
                <span className={s.alertMark} aria-hidden>{LEVEL_MARK[a.level]}</span>
                <b className={s.alertTitle}>{a.title}</b>
                <span className={`${s.alertVal} num`}>{a.value}</span>
                <i className={s.alertUnit}>{a.unit}</i>
                {a.at && <span className={s.alertAt}>{a.at}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        * СХЕМ — хэвтээ гүйлт нь ЗӨВХӨН энд (хуудас өөрөө хэвтээ гүйхгүй).
        */}
      <div className={s.stage}>
        {/*
          * ЗҮҮН ТАЛЫН ЖАГСААЛТ — 13 үзүүлэлт нэг баганад.
          */}
        <aside className={s.side} aria-label={tr('Үзүүлэлтүүд')}>
          <h3 className={s.sideHead}>{tr('Үзүүлэлтүүд')}</h3>
          <ul className={s.sideList}>
            {listRows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  className={`${s.sideRow} ${r.node && shownId === r.node ? s.sideOn : ''}`}
                  style={{ ['--h']: LEVEL_TONE[r.level] } as CSSProperties}
                  disabled={!r.node}
                  aria-current={r.node && shownId === r.node ? 'true' : undefined}
                  title={`${r.title}${r.unit ? ` — ${r.value} ${r.unit}` : ''}`}
                  onClick={() => { if (r.node) { setTouched(true); setOpenId(r.node); } }}
                >
                  <span className={s.sideIcon} aria-hidden><Icon name={r.icon} size={13} /></span>
                  <span className={s.sideBody}>
                    <b className={s.sideTitle}>{r.title}</b>
                    <span className={s.sideNums}>
                      <span className={`${s.sideVal} num`}>{r.value}</span>
                      {r.unit && <i className={s.sideUnit}>{r.unit}</i>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

      <div className={s.canvasWrap}>
        <div className={s.canvas} style={{ width: L.w, height: L.h }}>
          <svg className={s.edges} width={L.w} height={L.h} aria-hidden focusable="false">
            <defs>
              <marker id="ceo-a" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L7 3.5 L0 7 z" fill="var(--line-strong)" />
              </marker>
              <marker id="ceo-b" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L7 3.5 L0 7 z" fill="var(--bad)" />
              </marker>
            </defs>
            {FINE_EDGES.map((e) => (
              <path
                key={`${e.from}-${e.to}-${e.kind}`}
                d={edgePath(L.box[e.from], L.box[e.to], e.kind)}
                className={e.kind === 'back' ? s.edgeBack : e.kind === 'feed' ? s.edgeFeed : s.edgeMain}
                markerEnd={`url(#${e.kind === 'back' ? 'ceo-b' : 'ceo-a'})`}
              />
            ))}
          </svg>

          {ORDER.map((id) => (
            <NodeCard
              key={id}
              id={id}
              box={L.box[id]}
              lines={linesOf.get(id) ?? []}
              on={shownId === id}
              onClick={() => toggle(id)}
            />
          ))}
        </div>
      </div>
      </div>

      {/*
        * ДЭЛГЭРЭНГҮЙ — схемийн ДООР, тусдаа самбарт.
        */}
      {open && (
        <div className={s.detail} aria-label={open.title}>
          <header className={s.dHead}>
            <span className={s.nIcon} aria-hidden><Icon name={open.icon} size={15} /></span>
            <span className={s.dText}>
              <b className={s.dTitle}>{open.title}</b>
              <span className={s.dDesc}>{open.desc}</span>
            </span>
            {open.view && !openKpis.length && (
              <button type="button" className={s.kGo} onClick={() => onView(open.view as ViewKey)}>
                {tr('Харагдац руу орох')}
                <span aria-hidden>→</span>
              </button>
            )}
            <button
              type="button"
              className={s.dClose}
              onClick={() => { setTouched(true); setOpenId(null); }}
              aria-label={tr('Хаах')}
            >
              ✕
            </button>
          </header>

          {openKpis.length > 0
            ? openKpis.map((k) => {
              const def = CEO_KPIS.find((d) => d.key === k)!;
              return (
                <KpiDetail
                  key={k}
                  def={def}
                  slot={slots[k]}
                  pkg={pkg}
                  onView={onView}
                  onRetry={() => retry(k)}
                />
              );
            })
            : (
              /*
               * ҮЗҮҮЛЭЛТГҮЙ ЗАНГИЛАА — схемийн өөрийн задаргаа.
               */
              srcQ.state === 'error' ? <p className={s.dNote}>{tr('Татагдсангүй.')}</p>
                : !schemDetail ? <Loading />
                  : (
                    <>
                      {schemDetail.metrics.length > 0 && (
                        <ul className={s.dFacts}>
                          {schemDetail.metrics.map((m) => (
                            <li key={m.label}>
                              {m.label}: {m.value == null ? '—' : cellText({ v: m.value, kind: m.kind })}
                            </li>
                          ))}
                        </ul>
                      )}
                      {schemDetail.issues.length > 0 && (
                        <ul className={s.dIssues}>
                          {schemDetail.issues.map((is, i) => (
                            <li key={i} className={s.dIssue}
                              style={{ ['--h']: is.tone === 'none' ? 'var(--ink-3)' : `var(--${is.tone})` } as CSSProperties}>
                              {is.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      {schemDetail.tables.map((t) => <Table key={t.title} t={t} />)}
                    </>
                  )
            )}
        </div>
      )}
    </section>
  );
}

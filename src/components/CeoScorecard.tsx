'use client';

/**
 * БАГЦ АЖЛЫН ОНОО — нүүрний удирдлагын самбар (2026-09-17, CEO схем самбарыг сольсон).
 *
 * ⚠️ Хэрэглэгчийн шаардлага: Cashflow-ийн 74 багц ажлыг «Төсөв, гэрээлсэн дүн»
 *    чартын ажлын төрлөөр бүлэглэж, багц бүрд 6 бүлгийн оноо —
 *    Гүйцэтгэл · Санхүүжилт · Газар чөлөөлөлт · Ерөнхий төлөвлөгөө · ХАБЭА · Чанар.
 *
 * ⚠️ ТООЦОО ЭНД БАЙХГҮЙ: оноо `src/lib/ceo/scorecard.ts` (цэвэр), өгөгдөл
 *    `scorecardLoad.ts`. Дэлгэрэнгүйн доорх үзүүлэлтүүд нь хуучин 13 CEO
 *    үзүүлэлт (`registry.ts`) — 6 бүлэгт хуваарилагдан, сонгосон багцаар
 *    шүүгдэнэ (`CeoBoard.KpiDetail`).
 *
 * ⚠️ ХҮНД бүлгүүд (газар · төлөвлөгөө · чанар) суурь оноо гарсны ДАРАА шатлан
 *    ачаална — ArcGIS «Too many requests»-ээс сэргийлнэ (`useKpis`-ийн дүрэм).
 *    Ирээгүй бүлэг «…», өгөгдөлгүй бүлэг «—»; аль нь ч нийт дунджид ордоггүй.
 */
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { useAsync, type Async } from '@/lib/useAsync';
import { num, mnt } from '@/lib/format';
import { LEVEL_TONE, levelLabel } from '@/lib/kpiLevels';
import type { ViewKey } from '@/lib/services';
import { CEO_KPIS } from '@/lib/ceo/registry';
import type { KpiResult } from '@/lib/ceo/kpi';
import {
  DIMS, dimDefs, groupByType, projectDims, dimLevel, SCORE_GOOD, SCORE_WARN, HSE_GOOD, HSE_WARN,
  workIssues, type Dim, type WorkScore, type IssueTone,
  STATUSES, DIM_STATUSES, statusCounts, dimStatusCounts, workStatus, passFilter, filterActive, NO_FILTER,
  type WorkStatus, type DimStatus, type ScoreFilter,
} from '@/lib/ceo/scorecard';
import {
  loadScoreBase, loadScoreLand, loadScoreQual, loadScorePlan, assemble, type Extras,
} from '@/lib/ceo/scorecardLoad';
import { KpiDetail, type Slot } from './CeoBoard';
import { shortError } from '@/lib/ceo/review';
import s from './ceoScorecard.module.css';

/** Асуудлын зэргийн нэр — `tr()` render үед */
const TONE_LABEL = (t: IssueTone): string => (
  t === 'bad' ? tr('Заавал') : t === 'warn' ? tr('Анхаарах') : tr('Дата оруулах')
);

/** Төлөвийн нэр — `tr()` render үед */
const STATUS_LABEL = (st: DimStatus): string => ({
  bad: tr('Эрсдэлтэй'), warn: tr('Анхааруулга'), good: tr('Хэвийн'),
  pending: tr('Хүлээгдэж'), none: tr('Өгөгдөлгүй'),
})[st];
const STATUS_TONE: Record<DimStatus, string> = {
  bad: LEVEL_TONE.bad, warn: LEVEL_TONE.warn, good: LEVEL_TONE.good,
  pending: 'var(--ink-3)', none: 'color-mix(in srgb, var(--ink-3) 45%, transparent)',
};

/** Төлөв бүрийн босгын тайлбар — нийт оноогоор */
const STATUS_RULE = (st: WorkStatus): string => ({
  bad: tr('нийт оноо {0}-аас доош', SCORE_WARN),
  warn: tr('нийт оноо {0}–{1}', SCORE_WARN, SCORE_GOOD - 1),
  good: tr('нийт оноо {0} ба түүнээс дээш', SCORE_GOOD),
  none: tr('оноо бодогдоогүй'),
})[st];

/**
 * ТӨЛӨВИЙН ХЭСЭГ — 4 төлөвийн нягт карт (2026-09-17, гурав дахь хувилбар).
 *
 * ⚠️ Ажлын төрөл бүрийн тархалт ЭНДЭЭС «Багц ажил» жагсаалтын бүлгийн мөр рүү
 *    ШИЛЖСЭН (хэрэглэгч): бүлгийн нэрийн ард нь тархалт байвал аль төрөлд
 *    асуудал төвлөрсөн нь жагсаалттайгаа шууд холбогдоно. Карт нь бага
 *    өндөртэй — өмнө нь хажуугийн жагсаалтын өндрөөр сунаж хоосон зай үүсгэдэг байв.
 *
 * ⚠️ Дарахад шүүнэ, ДАХИН дарахад цуцална; сонгосон нь ✓ + өнгөт дэвсгэр.
 */
function StatusPanel({
  counts, selected, onStatus,
}: {
  counts: Record<WorkStatus, number>;
  selected: readonly WorkStatus[];
  onStatus: (st: WorkStatus) => void;
}) {
  const total = STATUSES.reduce((acc, st) => acc + counts[st], 0);
  const stOn = (st: WorkStatus) => selected.includes(st);
  const faded = (st: WorkStatus) => selected.length > 0 && !stOn(st);
  return (
    <section className={s.status} aria-label={tr('Багц ажлын төлөв')}>
      <div className={s.statusHead}>
        <b>{tr('Багц ажлын төлөв')}</b>
        <span>{tr('Нийт {0} багц ажил · дарж шүүнэ, дахин дарж цуцална', num(total))}</span>
        {/* Нийт тархалт — нэг нимгэн зурвас */}
        <span className={s.statusMini} aria-hidden>
          {STATUSES.filter((st) => counts[st] > 0).map((st) => (
            <i key={st} style={{ flexGrow: counts[st], ['--h']: STATUS_TONE[st] } as CSSProperties} className={faded(st) ? s.segDim : ''} />
          ))}
        </span>
      </div>
      <div className={s.statusCards}>
        {STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            className={`${s.stCard} ${stOn(st) ? s.stOn : ''} ${faded(st) ? s.segDim : ''}`}
            style={{ ['--h']: STATUS_TONE[st] } as CSSProperties}
            aria-pressed={stOn(st)}
            disabled={counts[st] === 0 && !stOn(st)}
            onClick={() => onStatus(st)}
          >
            <span className={s.stDot} aria-hidden>{stOn(st) ? '✓' : ''}</span>
            <span className={s.stBody}>
              <span className={s.stName}>{STATUS_LABEL(st)}</span>
              <span className={s.stRule}>{STATUS_RULE(st)}</span>
            </span>
            <span className={s.stNums}>
              <b className={`${s.stNum} num`}>{num(counts[st])}</b>
              <span className={`${s.stPct} num`}>{total ? `${num((counts[st] / total) * 100)}%` : '—'}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Бүлгийн мөрийн төлөвийн тархалт — «Багц ажил» жагсаалтад.
 * ⚠️ Хэсэг дарвал «тэр төрлийн тэр төлөв»-өөр шүүнэ; дахин дарвал цуцална.
 *    Мөрийн дарлага (бүлэг задлах) руу ДАМЖИХГҮЙ (`stopPropagation`).
 */
function GroupStatusBar({
  type, counts, filter, onCell,
}: {
  type: string;
  counts: Record<WorkStatus, number>;
  filter: ScoreFilter;
  onCell: (type: string, st: WorkStatus) => void;
}) {
  const typeOn = filter.types.includes(type);
  return (
    <span className={s.gBar}>
      {STATUSES.filter((st) => counts[st] > 0).map((st) => {
        const on = typeOn && filter.status.includes(st);
        const faded = filter.status.length > 0 && !filter.status.includes(st);
        return (
          <button
            key={st}
            type="button"
            className={`${s.gSeg} ${faded ? s.segDim : ''} ${on ? s.gSegOn : ''}`}
            style={{ flexGrow: counts[st], ['--h']: STATUS_TONE[st] } as CSSProperties}
            aria-pressed={on}
            onClick={(e) => { e.stopPropagation(); onCell(type, st); }}
            title={`${type} · ${STATUS_LABEL(st)}: ${num(counts[st])}`}
          >
            {counts[st]}
          </button>
        );
      })}
    </span>
  );
}

/** Бүлгийн жижиг тархалт — хавтан дотор */
function DimBar({ counts }: { counts: Record<DimStatus, number> }) {
  const shown = DIM_STATUSES.filter((st) => counts[st] > 0);
  return (
    <span className={s.dimBar} aria-hidden>
      {shown.map((st) => (
        <i key={st} style={{ flexGrow: counts[st], ['--h']: STATUS_TONE[st] } as CSSProperties} className={st === 'pending' ? s.segPending : ''} />
      ))}
    </span>
  );
}

/** Хүнд бүлгийг идэвхжих хүртэл ХҮЛЭЭЛГЭНЭ — deps солигдоход л эхэлнэ */
const never = <T,>() => new Promise<T>(() => {});


/**
 * Нэг оноо — өнгөт хавтан.
 *   · `loading` → «…» (татагдаж байна)
 *   · `pending` → «хүлээгдэж» (бүртгэл бий, дата хараахан ороогүй — 0 БИШ)
 *   · null → «—» (энэ багцад хамаарах өгөгдөл алга)
 */
function Score({ v, loading, pending, big, dim }: { v: number | null; loading?: boolean; pending?: boolean; big?: boolean; dim?: Dim }) {
  /* ⚠️ ХАБЭА өөрийн босготой (90/70) — `dimLevel` */
  const lv = loading ? 'loading' : dimLevel(dim, v);
  if (!loading && v == null && pending) {
    return (
      <span className={`${s.score} ${s.pending} ${big ? s.scoreBig : ''}`} title={tr('Бүртгэл бий, дата хараахан оруулаагүй')}>
        {tr('хүлээгдэж')}
      </span>
    );
  }
  return (
    <span
      className={`${s.score} ${big ? s.scoreBig : ''} num`}
      style={{ ['--h']: LEVEL_TONE[lv] } as CSSProperties}
      title={loading ? tr('Ачаалж байна…') : v == null ? tr('Энэ багцад хамаарах өгөгдөл алга') : levelLabel(lv)}
    >
      {loading ? '…' : v == null ? '—' : num(v)}
    </span>
  );
}

/** Сонгосон бүлгийн CEO үзүүлэлтүүдийг ачаална (кэштэй — дахин сонгоход шууд) */
function useDimKpis(dim: Dim | null): { slots: Record<string, Slot>; retry: (key: string) => void } {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!dim) return;
    let alive = true;
    for (const key of dimDefs()[dim].kpis) {
      const def = CEO_KPIS.find((d) => d.key === key);
      if (!def) continue;
      def.load().then(
        (data: KpiResult) => { if (alive) setSlots((r) => ({ ...r, [key]: { state: 'ready', data, error: null } })); },
        (e: unknown) => {
          if (alive) setSlots((r) => ({ ...r, [key]: { state: 'error', data: null, error: e instanceof Error ? e : new Error(String(e)) } }));
        },
      );
    }
    return () => { alive = false; };
  }, [dim, nonce]);
  const retry = (key: string) => {
    setSlots((r) => ({ ...r, [key]: { state: 'loading', data: null, error: null } }));
    setNonce((n) => n + 1);
  };
  return { slots, retry };
}

export function CeoScorecard({ onView }: { onView: (key: ViewKey) => void }) {
  const defs = dimDefs();
  const baseQ = useAsync(loadScoreBase, []);
  const baseReady = baseQ.state === 'ready';
  /* ⚠️ Хүнд бүлгүүд суурийн ДАРАА, нэг нэгээр шатлана */
  const landQ = useAsync(() => (baseReady ? loadScoreLand() : never<Awaited<ReturnType<typeof loadScoreLand>>>()), [baseReady]);
  const qualQ = useAsync(() => (landQ.state !== 'loading' ? loadScoreQual() : never<Awaited<ReturnType<typeof loadScoreQual>>>()), [landQ.state]);
  const planQ = useAsync(() => (qualQ.state !== 'loading' ? loadScorePlan() : never<Awaited<ReturnType<typeof loadScorePlan>>>()), [qualQ.state]);

  const loadingDims = useMemo(() => new Set<Dim>(
    ([['land', landQ], ['qual', qualQ], ['plan', planQ]] as [Dim, Async<unknown>][])
      .filter(([, q]) => q.state === 'loading').map(([d]) => d),
  ), [landQ, qualQ, planQ]);
  const failedDims = ([['land', landQ], ['qual', qualQ], ['plan', planQ]] as [Dim, Async<unknown>][])
    .filter(([, q]) => q.state === 'error').map(([d]) => defs[d].title);

  const allWorks = useMemo<WorkScore[] | null>(() => {
    if (!baseReady) return null;
    const x: Extras = {
      land: landQ.state === 'ready' ? landQ.data : null,
      qual: qualQ.state === 'ready' ? qualQ.data : null,
      plan: planQ.state === 'ready' ? planQ.data : null,
    };
    return assemble(baseQ.data, x);
  }, [baseReady, baseQ, landQ, qualQ, planQ]);
  const partFailed = [
    ...(baseQ.data?.failed ?? []),
    ...(qualQ.state === 'ready' ? qualQ.data.failed : []),
    ...(landQ.state === 'ready' && landQ.data.failed ? [tr('Газрын давхцал (хэсэгчлэн)')] : []),
  ];
  /**
   * ⚠️ 2026-09-21: ЖАГСААЛТ · ТООЛОЛ · ШҮҮЛТ = ЗӨВХӨН «багц ажил» (74). Газар
   * чөлөөлөлтийн 4 мөр (`isLandWork`, 6-р хэсэг) «78 биш 74» дүрмээр багц ажил
   * биш тул «Нийт N багц ажил», `statusCounts`, бүлгийн жагсаалтад ОРОХГҮЙ —
   * урьд нь 78 гарч, санхүүжилтийн тоололд «Өгөгдөлгүй» 4 мөр нэмэгддэг байв.
   * Төслийн нийт (`projectDims`) нь `allWorks` — газрын мөрийн `land` оноо
   * (газар чөлөөлөлтийн явц) тэнд л хэрэглэгдэнэ.
   */
  const works = useMemo(() => (allWorks ? allWorks.filter((w) => !w.isLandWork) : null), [allWorks]);

  const groups = useMemo(() => (works ? groupByType(works) : []), [works]);
  const project = useMemo(() => (allWorks ? projectDims(allWorks) : null), [allWorks]);

  /**
   * ⚠️ 2026-09-17 (хэрэглэгч): ажлын төрлийн бүлгүүд АНХДАГЧААР ХУМИГДСАН —
   *    «Орон сууц», «Инженерийн дэд бүтэц» мэт бүлгийн оноо л харагдаж,
   *    сонгоход доторх багц ажлууд задарна.
   */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleGroup = (type: string) => setOpen((c) => {
    const n = new Set(c);
    if (n.has(type)) n.delete(type); else n.add(type);
    return n;
  });
  const [pick, setPick] = useState<number | null>(null);
  const [dim, setDim] = useState<Dim>('perf');
  /**
   * ШҮҮЛТ (2026-09-17, хэрэглэгч): төлөвөөр (графикаас) ба «үнэлгээний дагуу
   * асуудалтай» бүлгээр (хавтангаас). Шүүлт солигдоход тэнцсэн ажилтай
   * бүлгүүд АВТОМАТААР задарна — хумигдсан хэвээр байвал үр дүн харагдахгүй.
   */
  const [filter, setFilter] = useState<ScoreFilter>(NO_FILTER);
  const applyFilter = (next: ScoreFilter) => {
    setFilter(next);
    if (!filterActive(next) || !works) { setOpen(new Set()); return; }
    setOpen(new Set(groupByType(works).filter((g) => g.works.some((w) => passFilter(w, next))).map((g) => g.type)));
  };
  const toggleStatus = (st: WorkStatus) => applyFilter({
    ...filter,
    status: filter.status.includes(st) ? filter.status.filter((x) => x !== st) : [...filter.status, st],
  });
  const toggleType = (type: string) => applyFilter({
    ...filter,
    types: filter.types.includes(type) ? filter.types.filter((x) => x !== type) : [...filter.types, type],
  });
  /** Төрөл × төлөв нүд — яг тэр хосыг сонгоно; ДАХИН дарвал хоёуланг цуцална */
  const toggleCell = (type: string, st: WorkStatus) => {
    const same = filter.types.length === 1 && filter.types[0] === type && filter.status.length === 1 && filter.status[0] === st;
    applyFilter(same ? { ...filter, types: [], status: [] } : { ...filter, types: [type], status: [st] });
  };
  const toggleProblemDim = (d: Dim) => {
    setDim(d);
    applyFilter({ ...filter, problemDim: filter.problemDim === d ? null : d });
  };
  const active = filterActive(filter);
  /* ⚠️ Анхдагч сонголт БАЙХГҮЙ — «Сонгосон багц ажил» хэсэг зөвхөн сонгосон үед гарна */
  const sel = pick == null ? null : (works ?? []).find((w) => w.oid === pick) ?? null;
  /** Сонгосон ажлыг ДАХИН дарвал сонголт цуцлагдана (2026-09-17, «deselect») */
  const togglePick = (oid: number) => setPick((p) => (p === oid ? null : oid));
  /* Esc — сонголт цуцлах. ⚠️ Зөвхөн сонголттой үед сонсоно; setState нь callback-д (эффектийн биед биш) */
  useEffect(() => {
    if (pick == null) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);
  const issues = useMemo(() => (sel ? workIssues(sel) : []), [sel]);
  const { slots, retry } = useDimKpis(sel ? dim : null);

  const counts = useMemo(() => statusCounts(works ?? []), [works]);
  const dimCounts = useMemo(
    () => Object.fromEntries(DIMS.map((d) => [d, dimStatusCounts(works ?? [], d)])) as Record<Dim, Record<DimStatus, number>>,
    [works],
  );
  const matched = useMemo(() => (works ?? []).filter((w) => passFilter(w, filter)).length, [works, filter]);
  /* Бүтэн алдаа консолд; дэлгэцэнд богино мөр (`shortError`) */
  useEffect(() => {
    if (baseQ.state === 'error') console.warn('[selbe] CEO scorecard:', baseQ.error);
  }, [baseQ]);

  if (baseQ.state === 'error') {
    return (
      <section className={s.board}>
        <p className={s.err}>
          {tr('Багц ажлын оноо татагдсангүй.')}{' '}
          <button type="button" className={s.retry} onClick={() => baseQ.retry?.()}>{tr('Дахин оролдох')}</button>
          <span className={s.errMsg}> {shortError(baseQ.error)}</span>
        </p>
      </section>
    );
  }

  return (
    <section className={s.board} aria-label={tr('Багц ажлын оноо')}>
      <header className={s.head}>
        <h2 className={s.title}>{tr('Багц ажлын оноо')}</h2>
        <span className={s.legend}>
          {tr('≥{0} хэвийн · {1}–{2} анхааруулга · <{1} эрсдэлтэй (ХАБЭА: ≥{3} · {4}–{5} · <{4}) · «хүлээгдэж» дата ороогүй · «—» хамааралгүй', SCORE_GOOD, SCORE_WARN, SCORE_GOOD - 1, HSE_GOOD, HSE_WARN, HSE_GOOD - 1)}
        </span>
      </header>

      {works && (
        <StatusPanel counts={counts} selected={filter.status} onStatus={toggleStatus} />
      )}

      {/* ── Төслийн нийт — 6 бүлэг + нийт; хавтан дарахад тухайн бүлэгт АСУУДАЛТАЙ ажлууд шүүгдэнэ ── */}
      <div className={s.summary}>
        <div className={`${s.sumTile} ${s.sumTotal}`}>
          <span className={s.sumLabel}>{tr('Нийт оноо')}</span>
          <Score v={project?.total ?? null} loading={!project} big />
          <span className={s.sumSub}>{works ? tr('{0} багц ажил', num(works.filter((w) => !w.cancelled).length)) : '…'}</span>
        </div>
        {DIMS.map((d) => (
          <button
            key={d}
            type="button"
            className={`${s.sumTile} ${filter.problemDim === d ? s.sumOn : ''}`}
            onClick={() => toggleProblemDim(d)}
            aria-pressed={filter.problemDim === d}
            title={`${defs[d].rule}\n${tr('Дарж энэ бүлэгт асуудалтай багц ажлуудыг шүүнэ')}`}
          >
            <span className={s.sumLabel}><Icon name={defs[d].icon} size={12} /> {defs[d].title}</span>
            <Score v={project?.dims[d] ?? null} pending={project?.pending[d]} loading={!project || loadingDims.has(d)} big dim={d} />
            {works && !loadingDims.has(d) && (
              <>
                <DimBar counts={dimCounts[d]} />
                <span className={s.sumProblem}>
                  <b className="num">{num(dimCounts[d].bad + dimCounts[d].warn)}</b> {tr('асуудалтай')}
                  {dimCounts[d].pending > 0 && <> · <span className="num">{num(dimCounts[d].pending)}</span> {tr('хүлээгдэж')}</>}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      {/* ⚠️ 2026-09-25: хэсэгчилсэн уналтыг ч ил — QAQC хуудас ба газрын давхцал (`scorecardLoad`-ийн `failed`) */}
      {(partFailed.length || failedDims.length) ? (
        <p className={s.warnLine}>
          {tr('Татагдсангүй: {0}', [...partFailed, ...failedDims].join(', '))}
        </p>
      ) : null}

      {active && works && (
        <div className={s.filterBar} role="status">
          <span className={s.filterLabel}>{tr('Шүүлт:')}</span>
          {filter.status.map((st) => (
            <button key={st} type="button" className={s.filterChip} style={{ ['--h']: STATUS_TONE[st] } as CSSProperties} onClick={() => toggleStatus(st)}>
              {STATUS_LABEL(st)} <span aria-hidden>×</span>
            </button>
          ))}
          {filter.types.map((t) => (
            <button key={t} type="button" className={s.filterChip} style={{ ['--h']: 'var(--data)' } as CSSProperties} onClick={() => toggleType(t)}>
              {t} <span aria-hidden>×</span>
            </button>
          ))}
          {filter.problemDim && (
            <button type="button" className={s.filterChip} style={{ ['--h']: LEVEL_TONE.bad } as CSSProperties} onClick={() => toggleProblemDim(filter.problemDim!)}>
              {tr('{0}-д асуудалтай', defs[filter.problemDim].title)} <span aria-hidden>×</span>
            </button>
          )}
          <span className={`${s.filterCount} num`}>{tr('{0} / {1} багц ажил', num(matched), num(works.filter((w) => !w.cancelled).length))}</span>
          <button type="button" className={s.filterClear} onClick={() => applyFilter(NO_FILTER)}>{tr('Шүүлт цэвэрлэх')}</button>
        </div>
      )}

      <div className={`${s.stage} ${sel ? '' : s.stageFull}`}>
        {/* ── Зүүн: төрлөөр бүлэглэсэн жагсаалт ── */}
        <div className={s.tableWrap}>
          <table className={s.tbl}>
            <thead>
              <tr>
                <th className={s.thName}>{tr('Багц ажил')}</th>
                <th className={s.thStatus}>{tr('Төлөв')}</th>
                {DIMS.map((d) => (
                  <th key={d} className={`${s.thDim} ${dim === d || filter.problemDim === d ? s.thOn : ''}`} title={defs[d].title}>
                    <button type="button" className={s.thBtn} onClick={() => setDim(d)}>{defs[d].short}</button>
                  </th>
                ))}
                <th className={s.thDim}>{tr('Нийт')}</th>
              </tr>
            </thead>
            <tbody>
              {!works && (
                <tr><td colSpan={DIMS.length + 3} className={s.loadingRow}>{tr('Багц ажлын өгөгдлийг нэгтгэж байна…')}</td></tr>
              )}
              {active && matched === 0 && (
                <tr><td colSpan={DIMS.length + 3} className={s.loadingRow}>{tr('Шүүлтэд тэнцэх багц ажил алга.')}</td></tr>
              )}
              {groups.map((g) => {
                const shown = active ? g.works.filter((w) => passFilter(w, filter)) : g.works;
                /* ⚠️ Шүүлт идэвхтэй үед тэнцэх ажилгүй бүлэг НУУГДАНА */
                if (active && shown.length === 0) return null;
                /* ⚠️ 2026-09-21: бүлгийн «N» = `statusCounts`-тай НЭГ дүрэм — ХАСАГДСАН ажил
                   ТООЛОГДОХГҮЙ. Урьд нь `g.works.length` хасагдсаныг ч тоолдог тул
                   бүлгүүдийн нийлбэр дээрх «Нийт N багц ажил» (`statusCounts`-ийн
                   нийлбэр)-тэй зөрдөг байв. Хасагдсан мөр жагсаалтад ХЭВЭЭР харагдана. */
                const liveN = g.works.filter((w) => !w.cancelled).length;
                const shownN = shown.filter((w) => !w.cancelled).length;
                const cancelledN = g.works.length - liveN;
                const isClosed = !open.has(g.type);
                return (
                  <Fragment key={g.type}>
                    <tr className={`${s.groupRow} ${isClosed ? '' : s.groupOpen}`} onClick={() => toggleGroup(g.type)}>
                      <th scope="rowgroup" className={s.groupName}>
                        <button
                          type="button"
                          className={s.groupBtn}
                          aria-expanded={!isClosed}
                          onClick={(e) => { e.stopPropagation(); toggleGroup(g.type); }}
                        >
                          <span className={s.caret} aria-hidden>{isClosed ? '▸' : '▾'}</span>
                          {g.type}
                          <span
                            className={s.groupCount}
                            title={cancelledN ? tr('{0} хасагдсан ажил тоонд ороогүй', num(cancelledN)) : undefined}
                          >{active ? `${num(shownN)} / ${num(liveN)}` : num(liveN)}</span>
                        </button>
                      </th>
                      <td className={s.statusCell}>
                        <GroupStatusBar type={g.type} counts={statusCounts(g.works)} filter={filter} onCell={toggleCell} />
                      </td>
                      {DIMS.map((d) => <td key={d} className={s.cell}><Score v={g.dims[d]} pending={g.pending[d]} loading={loadingDims.has(d)} dim={d} /></td>)}
                      {/* ⚠️ Хүнд хэмжээсүүд ирээгүй байхад НИЙТ оноог бэлэн мэт харуулахгүй */}
                      <td className={s.cell}><Score v={g.total} loading={loadingDims.size > 0} /></td>
                    </tr>
                    {!isClosed && shown.map((w) => (
                      <tr
                        key={w.oid}
                        className={`${s.workRow} ${sel?.oid === w.oid ? s.workOn : ''} ${w.cancelled ? s.cancelled : ''}`}
                        onClick={() => togglePick(w.oid)}
                        aria-selected={sel?.oid === w.oid}
                      >
                        <td className={s.workName}>
                          <button
                            type="button"
                            className={s.workBtn}
                            onClick={(e) => { e.stopPropagation(); togglePick(w.oid); }}
                            aria-pressed={sel?.oid === w.oid}
                            title={sel?.oid === w.oid ? tr('Дахин дарж сонголтыг цуцална (Esc)') : w.name}
                          >
                            <span className={s.wName}>{w.name}</span>
                            <span className={s.wPkg}>{w.pkgLabel || '—'}{w.cancelled ? ` · ${tr('хасагдсан')}` : ''}</span>
                          </button>
                        </td>
                        <td className={s.statusCell}>
                          {!w.cancelled && (
                            <span className={s.stPill} style={{ ['--h']: STATUS_TONE[workStatus(w)] } as CSSProperties}>
                              {STATUS_LABEL(workStatus(w))}
                            </span>
                          )}
                        </td>
                        {DIMS.map((d) => (
                          <td key={d} className={s.cell}>
                            <Score v={w.dims[d].score} pending={w.dims[d].pending} loading={!w.cancelled && loadingDims.has(d)} dim={d} />
                          </td>
                        ))}
                        <td className={s.cell}><Score v={w.total} loading={!w.cancelled && loadingDims.size > 0} /></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Баруун: сонгосон ажлын задаргаа — ЗӨВХӨН сонгосон үед ── */}
        {sel && (
        <aside className={s.detail}>
            <>
              <header className={s.dHead}>
                <div className={s.dTitleBox}>
                  <span className={s.dEyebrow}>{tr('Сонгосон багц ажил')}</span>
                  <b className={s.dTitle}>{sel.name}</b>
                </div>
                <div className={s.dTotal}>
                  <Score v={sel.total} big />
                  <span>{tr('Нийт оноо')}</span>
                </div>
                <button type="button" className={s.dClose} onClick={() => setPick(null)} aria-label={tr('Сонголт цуцлах')} title={tr('Сонголт цуцлах (Esc)')}>×</button>
              </header>

              {/* ⚠️ Мөнгөн дүн бүр НЭРТЭЙ — нэргүй «313,688,227,084 ₮» ойлгомжгүй байв */}
              <dl className={s.meta}>
                <div><dt>{tr('Ажлын төрөл')}</dt><dd>{sel.type || '—'}</dd></div>
                <div><dt>{tr('Багц')}</dt><dd>{sel.pkgLabel || '—'}</dd></div>
                <div><dt>{tr('Урьдчилсан төсөвт өртөг')}</dt><dd className="num">{mnt(sel.cost)}</dd></div>
                <div><dt>{tr('Гэрээний дүн')}</dt><dd className="num">{sel.contract == null ? tr('гэрээгүй') : mnt(sel.contract)}</dd></div>
              </dl>
              <p className={s.hint}>{tr('Нийт оноо = доорх 6 бүлгийн оноотой хэсгүүдийн дундаж. «хүлээгдэж» ба «—» бүлэг дунджид орохгүй.')}</p>

              {/* ── ЗААВАЛ ШИЙДВЭРЛЭХ АСУУДАЛ — эрэмбээр (`workIssues`) ── */}
              <section className={s.issues} aria-label={tr('Заавал шийдвэрлэх асуудал')}>
                <h3 className={s.issuesHead}>
                  {tr('Заавал шийдвэрлэх асуудал')}
                  <span className={`${s.issuesCount} num`}>{num(issues.filter((i) => i.tone !== 'info').length)}</span>
                </h3>
                {issues.length === 0 ? (
                  <p className={s.issuesNone}>{loadingDims.size ? tr('Бүх бүлэг ачаалагдтал хүлээнэ үү…') : tr('Шийдвэрлэх асуудал алга.')}</p>
                ) : (
                  <ol className={s.issueList}>
                    {issues.map((it, n) => (
                      <li key={`${it.dim}-${n}`}>
                        <button
                          type="button"
                          className={`${s.issue} ${s[`tone_${it.tone}` as const] ?? ''}`}
                          onClick={() => setDim(it.dim)}
                          title={tr('Дарж «{0}» бүлгийн задаргааг харна', defs[it.dim].title)}
                        >
                          <span className={`${s.issueNo} num`}>{n + 1}</span>
                          <span className={s.issueBody}>
                            <span className={s.issueMeta}>
                              <b>{TONE_LABEL(it.tone)}</b> · {defs[it.dim].title}
                            </span>
                            <span className={s.issueText}>{it.text}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <ul className={s.dims}>
                {DIMS.map((d) => {
                  const sc = sel.dims[d];
                  const loading = !sel.cancelled && loadingDims.has(d);
                  const lv = loading ? 'loading' : dimLevel(d, sc.score);
                  return (
                    <li key={d}>
                      <button
                        type="button"
                        className={`${s.dim} ${dim === d ? s.dimOn : ''} ${sc.pending ? s.dimPending : ''}`}
                        style={{ ['--h']: LEVEL_TONE[lv] } as CSSProperties}
                        onClick={() => setDim(d)}
                        aria-pressed={dim === d}
                      >
                        <span className={s.dimHead}>
                          <Icon name={defs[d].icon} size={12} />
                          <b>{defs[d].title}</b>
                          <Score v={sc.score} pending={sc.pending} loading={loading} dim={d} />
                        </span>
                        {sc.score != null && (
                          <span className={s.bar} aria-hidden><i style={{ width: `${sc.score}%` }} /></span>
                        )}
                        <span className={s.measure}>{defs[d].rule}</span>
                        {loading ? (
                          <span className={s.facts}>{tr('Ачаалж байна…')}</span>
                        ) : sc.pending ? (
                          <span className={s.pendingNote}>{tr('Дата хүлээгдэж буй — бүртгэл нээгдсэн ч мэдээлэл оруулаагүй.')}</span>
                        ) : sc.facts.length === 0 ? (
                          <span className={s.facts}>{tr('Энэ багцад хамаарах өгөгдөл алга')}</span>
                        ) : null}
                        {!loading && sc.facts.length > 0 && (
                          <dl className={s.factList}>
                            {sc.facts.map((f) => (
                              <div key={f.label}><dt>{f.label}</dt><dd className="num">{f.value}</dd></div>
                            ))}
                          </dl>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <h3 className={s.kpiHead}>
                <span>{tr('{0} — эх үзүүлэлтүүд', defs[dim].title)}</span>
                <span className={s.kpiRule}>
                  {tr('Карт бүрийн гол тоо нь ТӨСЛИЙН НИЙТ; доорх жагсаалт нь «{0}»-ээр шүүгдсэн. Дэлгэрэнгүйг «Харагдац руу орох»-оор.', sel.pkgLabel || tr('бүх багц'))}
                </span>
              </h3>
              {defs[dim].kpis.length === 0 && (
                <div className={s.srcBox}>
                  <p>{dim === 'hse'
                    ? tr('Эх сурвалж: «Ажлын байрны үзлэг V1.1» ба «Гүйцэтгэгчийн ажлын байрны үзлэг» маягт — талбайгаар нь «{0}»-д хамааруулсан. Осол ба хүн-цаг тооцоонд ороогүй.', sel.pkgLabel || tr('бүх багц'))
                    : defs[dim].rule}</p>
                  <button type="button" className={s.srcGo} onClick={() => onView(defs[dim].view as ViewKey)}>
                    {tr('Харагдац руу орох')} <span aria-hidden>→</span>
                  </button>
                </div>
              )}
              {defs[dim].kpis.map((key) => {
                const def = CEO_KPIS.find((k) => k.key === key);
                if (!def) return null;
                return (
                  <KpiDetail
                    key={key}
                    def={def}
                    slot={slots[key] ?? { state: 'loading', data: null, error: null }}
                    pkg={sel.pkgLabel}
                    onView={onView}
                    onRetry={() => retry(key)}
                    projectLabel
                  />
                );
              })}
            </>
        </aside>
        )}
      </div>
    </section>
  );
}

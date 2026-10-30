'use client';

/**
 * 6 ТҮВШНИЙ ХУВААРЬ (L1–L6) — `docs/Level planning_261021 1.pdf`-ийн бүтэц, «Миний ажил» бүлэг (2026-10-26, cf-spec «Бусад»).
 *
 *   L1 Мастер · L2 Үе шат/milestone · L3 Хяналтын хуваарь — гант (Environment: зам `--chart-track`, гүйцэтгэл `--data`,
 *   хоцорсон `--bad`, дууссан `--good`, мэдээлэлгүй — зураас); L4 сарын · L5 7 хоногийн · L6 өдрийн heatmap.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { pct } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Data, userError } from '@/components/ui';
import { buildXlsx, downloadXlsx } from '@/lib/xlsx';
import {
  BAR_TEXT, DAY, MS_TEXT, activeRange, buildL1, buildL2, buildL3, buildL4, buildLook, dayCols, dayOfLocal, failLabel, fmtDay,
  fmtMD, fmtMonth, ganttAxis, gParents, hBlockParents, heatLevel, levelWorkbook, loadLevelData, loadSheetDetail, monthIdx,
  notDone, packagesOf, visibleGantt, visibleHeat, weekCols, xMonths,
  type Axis, type BarStatus, type BlockDetail, type Col, type GFilter, type GRow, type HRow, type HSection, type LevelData,
  type MsStatus, type PkgInfo,
} from '@/lib/levelPlan';
import s from './levelPlan.module.css';

export type Level = 1 | 2 | 3 | 4 | 5 | 6;
const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

/** Табын нэр — i18n-extract статик `tr()`-ийг л олдог тул нэг бүрчлэн */
const LEVEL_TEXT: Record<Level, () => string> = {
  1: () => tr('Мастер хуваарь'),
  2: () => tr('Үе шат · milestone'),
  3: () => tr('Хяналтын хуваарь'),
  4: () => tr('Сарын төлөвлөгөө'),
  5: () => tr('7 хоногийн төлөвлөгөө'),
  6: () => tr('Өдөр тутмын төлөвлөгөө'),
};
const LEVEL_SUB: Record<Level, () => string> = {
  1: () => tr('Төслийн нийт ба барилга угсралтын чиглэл — гүйцэтгэл ба гэрээний дуусах огноо.'),
  2: () => tr('Төслийн ерөнхий milestone ба багц бүрийн үе шат: захирамж, зураг төсөл, сонгон шалгаруулалт, зөвшөөрөл, барилга, гэрээ дуусах, ашиглалт.'),
  3: () => tr('Багц бүрийн зураг төслийн дэд шат ба барилга угсралтын дэд үе шат (бөглөх хуудасны жинтэй).'),
  4: () => tr('Багц × блок — сар бүрт төлөвлөсөн гүйцэтгэл (Хуваарийн сарын төлөвлөгөө).'),
  5: () => tr('Бүх багц — блок ба дэд бүлэг, ойрын 12 долоо хоногийн төлөвлөсөн гүйцэтгэл. Багцыг дарж дэлгэнэ.'),
  6: () => tr('Бүх багц — блок ба дэд бүлэг, ойрын 14 хоногийн өдөр тутмын төлөвлөгөө. Багцыг дарж дэлгэнэ.'),
};

/**
 * ГАНТЫН ХУГАЦААНЫ ХУВААРЬ (2026-10-30) — нэг сарын өргөн (px): жил · улирал · сар. Тэнхлэг сар-жигд хэвээр.
 */
type Scale = 'year' | 'quarter' | 'month';
const SCALE_MW: Record<Scale, number> = { year: 7, quarter: 13, month: 22 };
const SCALE_TEXT: Record<Scale, () => string> = { year: () => tr('Жил'), quarter: () => tr('Улирал'), month: () => tr('Сар') };
const SCALES: Scale[] = ['year', 'quarter', 'month'];

/**
 * СОНГОЛТ ХАЯГТ (2026-10-30) — `?lvl=` (1–6) ба `?bagts=` — холбоос хуваалцахад түвшин/багц хадгалагдана.
 * Хаягийн бусад параметрт (`?v=` г.м.) хүрэхгүй.
 */
function readUrl(): { lvl: Level | null; pkg: string } {
  if (typeof window === 'undefined') return { lvl: null, pkg: '' };
  const q = new URLSearchParams(window.location.search);
  const n = Number(q.get('lvl'));
  return { lvl: LEVELS.includes(n as Level) ? (n as Level) : null, pkg: q.get('bagts') ?? '' };
}
function writeUrl(lvl: Level, pkg: string): void {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.set('lvl', String(lvl));
  if (pkg) u.searchParams.set('bagts', pkg); else u.searchParams.delete('bagts');
  if (u.href !== window.location.href) window.history.replaceState(window.history.state, '', u.href);
}

/**
 * БҮЛГИЙН ТҮВШНЭЭР ХУРААХ (2026-10-29, хэрэглэгч: «Хуваарь шиг 0…N») — «Хуваарь»-ын түвшний зурвастай ИЖИЛ утга:
 *   0 = бүгдийг хураах (зөвхөн дээд түвшин) · N = N-р түвшин хүртэл дэлгэх (гүн ≤ N мөр) · хамгийн гүн = бүх мөр.
 *   `level` нь тэр N; `null` = бүгд дэлгэсэн (анхдагч).
 * `ids` — тэр түвшнээс ГАДНА мөр бүрийг сумаар сэлгэсэн (түвшин сонгоход арилна). Мөрийн хамаарах түвшин: гант —
 * `GRow.depth`; heatmap — багц 0 · блок 1 · дэд бүлэг 2. Түлхүүр: гантын мөрийн ID · `p:`+багц · `b:`+блокийн мөр.
 */
type Fold = { level: number | null; ids: ReadonlySet<string> };
const FOLD0: Fold = { level: null, ids: new Set() };
/** L5/L6-ийн анхдагч — бүх багц хураасан (багцын нийт л харагдана) */
const LOOK_FOLD: Fold = { level: 0, ids: new Set() };
/** `depth` гүнтэй мөр (хүүхэд нь `depth + 1`) хураагдсан эсэх */
const isFolded = (f: Fold, id: string, depth: number): boolean => (f.level != null && depth >= f.level) !== f.ids.has(id);
const toggleFold = (f: Fold, id: string): Fold => {
  const ids = new Set(f.ids);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  return { level: f.level, ids };
};
/** Харагдацын шүүлт ба хураалт — гант ба heatmap-д дамжина */
type ViewOpts = { fold: Fold; onToggle: (id: string) => void; onLevel: (n: number | null) => void; q: string; gf: GFilter };

/**
 * «1 2 … N» — «Хуваарь»-ын түвшний зурвас (дугаар 1-ээс): `deep` = хамгийн гүн мөрийн гүн (тэр товч = бүх мөр).
 * Шүүлт идэвхтэй үед идэвхгүй (тохирсон бүгд харагдана).
 */
function LevelButtons({ deep, vo, off }: { deep: number; vo: ViewOpts; off: boolean }) {
  if (deep < 1) return null;
  const cur = vo.fold.ids.size === 0 ? (vo.fold.level ?? deep) : undefined;
  return (
    <div className={s.outline}>
      <span>{tr('Түвшин')}</span>
      <div className={s.tabs} role="group" aria-label={tr('Түвшин')}>
        {Array.from({ length: deep + 1 }, (_, i) => {
          /* Дугаар 1-ээс (хэрэглэгч: «0 гэж байхгүй») — товч N = гүн ≤ N−1 мөр; сүүлийнх = бүх мөр */
          const n = i + 1;
          const on = cur === i;
          const label = i === 0 ? tr('Бүгдийг хураах — зөвхөн дээд түвшний бүлгүүд')
            : i === deep ? tr('Бүх ажлын мөрийг дэлгэнэ') : tr('{0}-р түвшин хүртэл дэлгэх', n);
          return (
            <button
              key={i}
              type="button"
              disabled={off}
              aria-pressed={on}
              className={`${s.tab} ${on ? s.tabOn : ''}`}
              title={label}
              aria-label={label}
              onClick={() => vo.onLevel(i === deep ? null : i)}
            >
              {String(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const GF_OPTS: { v: GFilter; label: () => string }[] = [
  { v: 'all', label: () => tr('Бүх төлөв') },
  { v: 'problem', label: () => tr('Хоцорсон · хугацаа хэтэрсэн') },
  { v: 'run', label: () => tr('Явж байна') },
  { v: 'todo', label: () => tr('Эхлээгүй') },
  { v: 'done', label: () => tr('Дууссан') },
  { v: 'none', label: () => tr('Мэдээлэл байхгүй') },
];

export function LevelPlan() {
  const q = useAsync(loadLevelData, []);
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <h1 className={s.h1}>{tr('6 түвшний хуваарь')}</h1>
        <p className={s.sub}>
          {tr('Төслийн төлөвлөгөөг мастер хуваариас өдөр тутмын төлөвлөгөө хүртэл 6 түвшинд задална. Тоо нь Excel-ийн төлөвлөгөө, Хуваарь ба бөглөх хуудаснаас автоматаар бодогдоно.')}
        </p>
      </header>
      <Data q={q} loading={tr('Ачаалж байна…')} minH={320}>
        {(d) => { const u = readUrl(); return <LevelPlanBody d={d} initial={u.lvl ?? 1} initialPkg={u.pkg} />; }}
      </Data>
    </div>
  );
}

/** Ачаалагдсан өгөгдлийн харагдац — `initial` нь эхлэх түвшин (шалгуурт) */
export function LevelPlanBody({ d, initial = 1, initialPkg = '' }: { d: LevelData; initial?: Level; initialPkg?: string }) {
  const [lvl, setLvl] = useState<Level>(initial);
  const [pk, setPk] = useState(initialPkg);
  const [groups, setGroups] = useState(true);
  const [q, setQ] = useState('');
  const [gf, setGf] = useState<GFilter>('all');
  const [fold, setFold] = useState<Fold>(initial === 5 || initial === 6 ? LOOK_FOLD : FOLD0);
  const [scale, setScale] = useState<Scale>('month');
  const [xlsBusy, setXlsBusy] = useState(false);
  const [xlsErr, setXlsErr] = useState<string | null>(null);
  const pkgs = useMemo(() => packagesOf(d.plan.tree), [d.plan.tree]);
  const today = dayOfLocal(d.at);
  useEffect(() => { writeUrl(lvl, pk); }, [lvl, pk]);

  if (d.plan.empty) {
    return (
      <div className={s.notice}>
        <strong>{tr('Төслийн төлөвлөгөө импортлогдоогүй байна')}</strong>
        <p>{tr('Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг санхүүжилтийн хүснэгтэд импортлосны дараа 6 түвшний хуваарь энд харагдана.')}</p>
      </div>
    );
  }

  const look = lvl === 5 || lvl === 6;
  /* ⚠️ 2026-10-30 (загвар): L5/L6 ч БҮХ багц нэг дор — анхдагчаар багцын нийт л (хураасан, `LOOK_FOLD`) */
  const shown: PkgInfo[] = pk ? pkgs.filter((p) => p.key === pk) : pkgs;
  /* Түвшин солиход хураалт эхлээс — мөрийн ID-ууд түвшин бүрд өөр */
  const pickLvl = (l: Level) => { setLvl(l); setFold(l === 5 || l === 6 ? LOOK_FOLD : FOLD0); };
  const vo: ViewOpts = {
    fold, onToggle: (id) => setFold((f) => toggleFold(f, id)), onLevel: (n) => setFold({ level: n, ids: new Set() }),
    q, gf: lvl <= 3 ? gf : 'all',
  };
  const filtering = !!q.trim() || (lvl <= 3 && gf !== 'all');

  /** Excel — сонгосон багцын 6 түвшин, түвшин бүр тусдаа хуудас (дэд бүлэг уншигдахгүй бол түүнгүйгээр) */
  const exportXlsx = async () => {
    setXlsBusy(true);
    setXlsErr(null);
    try {
      const det = await loadSheetDetail().then((x) => x.blocks).catch(() => null);
      const day = fmtDay(today).replace(/\./g, '-');
      downloadXlsx(`6-tuvshnii-huvaari-${day}.xlsx`, buildXlsx(levelWorkbook(d, shown, det)));
    } catch (e) {
      setXlsErr(userError(e));
    } finally {
      setXlsBusy(false);
    }
  };

  return (
    <div className={`${s.lvBody} ${LV_CLS[lvl]}`}>
      {d.failed.length > 0 && (
        <div className={s.warn} role="status">
          {tr('Зарим эх уншигдсангүй — холбогдох нүд «—» (мэдээлэлгүй) харагдана: {0}', d.failed.map(failLabel).join(', '))}
        </div>
      )}
      <div className={s.bar}>
        <div className={s.tabs} role="group" aria-label={tr('Түвшин')}>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lvl === l}
              aria-label={`L${l} ${LEVEL_TEXT[l]()}`}
              title={LEVEL_TEXT[l]()}
              className={`${s.tab} ${lvl === l ? s.tabOn : ''}`}
              onClick={() => pickLvl(l)}
            >
              <span className={s.tabL}>L{l}</span>
              <span className={s.tabN}>{LEVEL_TEXT[l]()}</span>
            </button>
          ))}
        </div>
        {lvl !== 1 && (
          <label className={s.field}>
            <span>{tr('Багц')}</span>
            <select
              className={s.select}
              value={pk}
              onChange={(e) => setPk(e.target.value)}
            >
              <option value="">{tr('Бүх багц')}</option>
              {pkgs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        )}
        {look && (
          <label className={s.check}>
            <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} />
            <span>{tr('Дэд бүлэг')}</span>
          </label>
        )}
      </div>
      <div className={s.bar}>
        <input
          className={s.search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('Ажил, блок, багцаар хайх')}
          aria-label={tr('Хайх')}
        />
        {lvl <= 3 && (
          <label className={s.field}>
            <span>{tr('Төлөв')}</span>
            <select className={s.select} value={gf} onChange={(e) => setGf(e.target.value as GFilter)}>
              {GF_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label()}</option>)}
            </select>
          </label>
        )}
        {filtering && (
          <button type="button" className={s.btn} onClick={() => { setQ(''); setGf('all'); }}>{tr('Шүүлт арилгах')}</button>
        )}
        {lvl <= 3 && (
          <div className={s.tabs} role="group" aria-label={tr('Хугацааны хуваарь')}>
            {SCALES.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={scale === k}
                className={`${s.tab} ${scale === k ? s.tabOn : ''}`}
                onClick={() => setScale(k)}
              >{SCALE_TEXT[k]()}</button>
            ))}
          </div>
        )}
        <span className={s.grow} />
        <button type="button" className={s.btn} disabled={xlsBusy} onClick={() => void exportXlsx()}>
          {xlsBusy ? tr('Бэлдэж байна…') : tr('Excel татах')}
        </button>
        <button type="button" className={s.btn} onClick={() => window.print()} title={tr('Харагдаж буй түвшинг хэвлэх эсвэл PDF болгон хадгалах')}>
          {tr('PDF / хэвлэх')}
        </button>
      </div>
      {xlsErr && <div className={s.warn} role="alert">{xlsErr}</div>}
      <p className={s.lvlSub}>{LEVEL_SUB[lvl]()}</p>

      {lvl === 1 && <Gantt rows={buildL1(d.plan, today)} today={today} vo={vo} mw={SCALE_MW[scale]} />}
      {lvl === 2 && <Gantt rows={buildL2(d.plan, shown, d.marks, today)} today={today} vo={vo} mw={SCALE_MW[scale]} />}
      {lvl === 3 && (
        <WithSheet>
          {(det) => <Gantt rows={buildL3(d.plan, shown, det, today)} today={today} vo={vo} mw={SCALE_MW[scale]} />}
        </WithSheet>
      )}
      {lvl === 4 && (
        <WithSheet>
          {(det) => <MonthHeat d={d} pkgs={shown} det={det} today={today} vo={vo} />}
        </WithSheet>
      )}
      {look && groups && (
        <WithSheet>
          {(det) => <LookHeat d={d} pkgs={shown} det={det} groups daily={lvl === 6} today={today} vo={vo} />}
        </WithSheet>
      )}
      {look && !groups && <LookHeat d={d} pkgs={shown} det={null} groups={false} daily={lvl === 6} today={today} vo={vo} />}

      <Legend lvl={lvl} />
    </div>
  );
}

/** Түвшин бүрийн өнгө (`Level planning_261021` загвар: L1 хар хөх · L2 ногоон · L3 улбар шар · L4 улаан · L5 цэнхэр · L6 нил ягаан) */
const LV_CLS: Record<Level, string> = { 1: s.lv1, 2: s.lv2, 3: s.lv3, 4: s.lv4, 5: s.lv5, 6: s.lv6 };

/* ══════════════════ Бөглөх хуудасны дэд бүлэг (L3 · L5 · L6) ══════════════════ */

/**
 * Дэд бүлгийг ачаалж хүүхдэд өгнө. Ачаалж байх/унасан үед ч хүснэгт зурагдана (дэд бүлэггүйгээр) — блокийн мөр
 * ба багцын нийт нь тэр эхээс хамаардаггүй тул дэлгэц хоосон хүлээхгүй.
 */
function WithSheet({ children }: { children: (det: ReadonlyMap<string, BlockDetail> | null) => ReactNode }) {
  const q = useAsync(loadSheetDetail, []);
  const det = q.state === 'ready' ? q.data.blocks : null;
  return (
    <>
      {q.state === 'loading' && <div className={s.info}>{tr('Бөглөх хуудасны дэд бүлгийг ачаалж байна…')}</div>}
      {q.state === 'error' && (
        <div className={s.warn} role="alert">
          {tr('Бөглөх хуудас уншигдсангүй — дэд бүлэггүйгээр харуулав: {0}', userError(q.error))}
        </div>
      )}
      {q.state === 'ready' && q.data.failed.length > 0 && (
        <div className={s.warn} role="status">
          {tr('Зарим бөглөх хуудас уншигдсангүй — тэдгээр багцад дэд бүлэг алга: {0}', q.data.failed.map(failLabel).join(', '))}
        </div>
      )}
      {children(det)}
    </>
  );
}

/* ══════════════════ Гант (L1–L3) ══════════════════ */

const BAR_CLS: Record<BarStatus, string> = {
  done: s.stDone, late: s.stLate, behind: s.stBehind, run: s.stRun, todo: s.stTodo, none: s.stNone,
};
const MS_CLS: Record<MsStatus, string> = {
  done: s.msDone, late: s.msLate, upcoming: s.msUp, missing: s.msMissing, none: s.msNone,
};
function Gantt({ rows, today, vo, mw: MW = SCALE_MW.month }: { rows: GRow[]; today: number; vo: ViewOpts; mw?: number }) {
  /* Тэнхлэг БҮТЭН мөрөөр — шүүх/хураахад огнооны хүрээ үсрэхгүй */
  const ax = useMemo(() => ganttAxis(rows, today), [rows, today]);
  const parents = useMemo(() => gParents(rows), [rows]);
  const depthOf = useMemo(() => new Map(rows.map((r) => [r.id, r.depth] as const)), [rows]);
  if (!rows.length || !ax) return <div className={s.hint}>{tr('Харуулах мөр алга')}</div>;
  const filtering = !!vo.q.trim() || vo.gf !== 'all';
  const folded = (id: string) => isFolded(vo.fold, id, depthOf.get(id) ?? 0);
  const vis = visibleGantt(rows, new Set([...parents].filter(folded)), vo.q, vo.gf);
  const deep = rows.reduce((m, r) => Math.max(m, r.depth), 0);
  const W = ax.n * MW;
  const nowX = xMonths(ax, today) * MW;
  if (!vis.length) {
    return (
      <>
        <LevelButtons deep={deep} vo={vo} off={filtering} />
        <div className={s.hint}>{tr('Шүүлтэд тохирох мөр алга')}</div>
      </>
    );
  }
  return (
    <>
    <LevelButtons deep={deep} vo={vo} off={filtering} />
    <div className={s.card}>
      <div className={s.scroll}>
        <table className={s.gt}>
          <colgroup>
            <col style={{ width: 72 }} />
            <col style={{ width: 280 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: W }} />
          </colgroup>
          <thead>
            <tr>
              <th className={s.cId}>{tr('ID')}</th>
              <th className={s.cName}>{tr('Ажил, үе шат')}</th>
              <th>{tr('Эхлэх')}</th>
              <th>{tr('Дуусах')}</th>
              <th className={s.r}>{tr('Гүйцэтгэл')}</th>
              <th title={tr('Одоогийн хурдаар үргэлжилбэл дуусах огноо')}>{tr('Таамаг дуусах')}</th>
              <th className={s.cTl}><AxisHead ax={ax} nowX={nowX} today={today} mw={MW} /></th>
            </tr>
          </thead>
          <tbody>
            {vis.map((r) => (
              <GanttRow
                key={r.id} r={r} ax={ax} nowX={nowX} W={W} MW={MW}
                fold={!filtering && parents.has(r.id) ? { open: !folded(r.id), onToggle: () => vo.onToggle(r.id) } : null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function AxisHead({ ax, nowX, today, mw: MW }: { ax: Axis; nowX: number; today: number; mw: number }) {
  const cells: ReactNode[] = [];
  for (let i = 0; i < ax.n; i += 1) {
    const m = ax.m0 + i;
    const mon = m % 12;
    /* Нарийн хуваарьт сарын дугаар багтахгүй — улирлынх: улирлын эхний сар, жилийнх: сарын дугааргүй */
    const label = MW >= 18 || (MW >= 12 && mon % 3 === 0) ? String(mon + 1).padStart(2, '0') : '';
    cells.push(
      <span key={i} className={s.axM} style={{ left: i * MW, width: MW >= 12 && MW < 18 ? MW * 3 : MW }}>{label}</span>,
    );
    if (mon === 0 || i === 0) {
      cells.push(<span key={`y${i}`} className={s.axY} style={{ left: i * MW }}>{Math.floor(m / 12)}</span>);
    }
  }
  return (
    <div className={s.axis} style={{ width: ax.n * MW }}>
      {cells}
      <span className={s.axNow} style={{ left: nowX }}>{tr('Өнөөдөр {0}', fmtDay(today))}</span>
    </div>
  );
}

/** Хураах/дэлгэх сум — хүүхэдтэй мөрд; хүүхэдгүй мөрд ижил зай (нэр зэрэгцэнэ) */
function Caret({ fold }: { fold: { open: boolean; onToggle: () => void } | null }) {
  if (!fold) return <span className={s.caretPad} aria-hidden />;
  return (
    <button
      type="button"
      className={s.caret}
      aria-expanded={fold.open}
      aria-label={fold.open ? tr('Хураах') : tr('Дэлгэх')}
      onClick={fold.onToggle}
    >
      {fold.open ? '▾' : '▸'}
    </button>
  );
}

function GanttRow({ r, ax, nowX, W, MW, fold }: {
  r: GRow; ax: Axis; nowX: number; W: number; MW: number; fold: { open: boolean; onToggle: () => void } | null;
}) {
  const ind = { paddingLeft: 8 + r.depth * 14 };
  const tl = (body: ReactNode) => (
    <td className={s.cTl}>
      <div className={s.tl} style={{ width: W, backgroundSize: `${MW}px 100%` }}>
        {body}
        <span className={s.now} style={{ left: nowX }} aria-hidden />
      </div>
    </td>
  );
  if (r.t === 'section') {
    return (
      <tr className={r.depth === 0 ? s.secRow : s.subRow}>
        <td className={s.cId}>{r.id}</td>
        <td className={s.cName} style={ind} title={r.name}><Caret fold={fold} />{r.name}</td>
        <td /><td /><td /><td />
        {tl(null)}
      </tr>
    );
  }
  if (r.t === 'note') {
    return (
      <tr className={s.noteRow}>
        <td className={s.cId}>{r.id}</td>
        <td className={s.cName} style={ind}><Caret fold={fold} />{r.name}</td>
        <td /><td /><td /><td />
        {tl(null)}
      </tr>
    );
  }
  if (r.t === 'ms') {
    const x = r.at != null ? xMonths(ax, r.at) * MW : null;
    return (
      <tr className={s.row}>
        <td className={s.cId}>{r.id}</td>
        <td className={s.cName} style={ind} title={r.name}><Caret fold={fold} />{r.name}</td>
        <td className={s.num}>{fmtDay(r.at)}</td>
        <td />
        <td className={`${s.r} ${r.status === 'done' ? s.okInk : r.status === 'late' || r.status === 'missing' ? s.badInk : ''}`}>
          {r.status === 'done' ? '✓' : r.status === 'upcoming' ? '' : MS_TEXT[r.status]()}
        </td>
        <td />
        {tl(x != null ? (
          <>
            <span className={`${s.ms} ${MS_CLS[r.status]}`} style={{ left: x }} title={`${r.name} · ${fmtDay(r.at)} · ${MS_TEXT[r.status]()}`} />
            <span className={s.msLbl} style={{ left: x + 9 }}>{fmtDay(r.at)}</span>
          </>
        ) : r.status === 'none'
          ? <span className={s.tlNA}>{tr('Мэдээлэл байхгүй')}</span>
          : <span className={`${s.tlNA} ${s.badInk}`}>{tr('Хийгдээгүй')}</span>)}
      </tr>
    );
  }
  const has = r.start != null && r.end != null;
  const x0 = has ? xMonths(ax, r.start!) * MW : 0;
  const x1 = has ? xMonths(ax, r.end! + DAY) * MW : 0;
  const fill = r.actual == null ? null : Math.max(0, Math.min(100, r.actual));
  const tip = [
    r.name,
    `${fmtDay(r.start)} – ${fmtDay(r.end)}${r.inh ? ` (${tr('өвөг мөрийн огноо')})` : r.alt ? ` (${tr('өөр хуваарийн огноо — төлөвлөгөөт хувийн суурь биш')})` : ''}`,
    `${tr('Гүйцэтгэл')}: ${pct(r.actual, 1)}`,
    r.planned != null ? `${tr('Төлөвлөгөө')}: ${pct(r.planned, 1)}` : null,
    r.fc != null ? `${tr('Таамаг дуусах')}: ${fmtDay(r.fc)}` : null,
    BAR_TEXT[r.status](),
  ].filter(Boolean).join(' · ');
  /* Таамаг гэрээний/төлөвлөсөн дуусахаас хойш бол улаан */
  const fcLate = r.fc != null && r.end != null && r.fc > r.end;
  const fx = r.fc != null ? xMonths(ax, r.fc) * MW : null;
  return (
    <tr className={`${s.row} ${r.strong ? s.strongRow : ''}`}>
      <td className={s.cId}>{r.id}</td>
      <td className={s.cName} style={ind} title={r.name}>
        <Caret fold={fold} />{r.name}{r.w != null && <span className={s.w}> ({pct(r.w, 1)})</span>}
      </td>
      <td className={s.num}>{fmtDay(r.start)}</td>
      <td className={s.num}>{fmtDay(r.end)}</td>
      <td className={`${s.r} ${r.status === 'done' ? s.okInk : r.status === 'late' || r.status === 'behind' ? s.badInk : ''}`}>
        {r.status === 'done' ? `✓ ${pct(100, 0)}` : notDone(r) ? tr('хийгдээгүй') : pct(r.actual, 0)}
      </td>
      <td className={`${s.num} ${fcLate ? s.badInk : ''}`}>{r.fc == null ? '' : fmtDay(r.fc)}</td>
      {tl(has ? (
        <>
          <span
            className={`${s.gBar} ${BAR_CLS[r.status]} ${r.inh || r.alt ? s.inh : ''}`}
            style={{ left: x0, width: Math.max(3, x1 - x0) }}
            title={tip}
          >
            {fill != null && <span className={s.gFill} style={{ width: `${fill}%` }} />}
          </span>
          {fx != null && fx <= W && (
            <span className={`${s.fc} ${fcLate ? s.fcLate : ''}`} style={{ left: fx }} title={`${tr('Таамаг дуусах')}: ${fmtDay(r.fc)}`} aria-hidden />
          )}
        </>
      ) : <span className={s.tlNA}>{tr('Мэдээлэл байхгүй')}</span>)}
    </tr>
  );
}

/* ══════════════════ Heatmap (L4 · L5 · L6) ══════════════════ */

type HeatCol = { key: string; label: string; now: boolean };

function MonthHeat({ d, pkgs, det, today, vo }: {
  d: LevelData; pkgs: PkgInfo[]; det: ReadonlyMap<string, BlockDetail> | null; today: number; vo: ViewOpts;
}) {
  const secs = useMemo(() => buildL4(d.plan, pkgs, det), [d.plan, pkgs, det]);
  const months = d.plan.months;
  /* Ажилтай сарууд л (бүх багцын бүх мөрөөр) — төслийн бүтэн тэнхлэг ТЭЗҮ-гээс эхэлдэг тул хэт өргөн */
  const rng = activeRange(secs.flatMap((x) => x.rows.filter((r) => r.kind !== 'cum').map((r) => r.cells)));
  if (!months.length || !rng) {
    return <div className={s.hint}>{tr('Сарын төлөвлөгөө алга — Хуваарь эсвэл гүйцэтгэгчийн огноо бөглөгдөөгүй')}</div>;
  }
  const [lo, hi] = rng;
  const tm = monthIdx(today);
  const cols: HeatCol[] = months.slice(lo, hi + 1).map((m) => ({ key: String(m), label: fmtMonth(m), now: monthIdx(m) === tm }));
  const cut = secs.map((x) => ({ ...x, rows: x.rows.map((r) => ({ ...r, cells: r.cells.slice(lo, hi + 1) })) }));
  return <Heat secs={cut} cols={cols} dec={1} sum={false} vo={vo} />;
}

function LookHeat({
  d, pkgs, det, groups, daily, today, vo,
}: {
  d: LevelData; pkgs: PkgInfo[]; det: ReadonlyMap<string, BlockDetail> | null; groups: boolean; daily: boolean; today: number;
  vo: ViewOpts;
}) {
  const colsDef: Col[] = useMemo(() => (daily ? dayCols(today, 14) : weekCols(today, 12)), [daily, today]);
  const secs = useMemo(() => buildLook(d.plan, pkgs, det, colsDef, groups), [d.plan, pkgs, det, colsDef, groups]);
  if (!pkgs.length) return <div className={s.hint}>{tr('Харуулах мөр алга')}</div>;
  const cols: HeatCol[] = colsDef.map((c, i) => ({
    key: String(c.from),
    label: c.days === 1 ? fmtMD(c.from) : `${fmtMD(c.from)}–${fmtMD(c.from + (c.days - 1) * DAY)}`,
    now: i === 0,
  }));
  return <Heat secs={secs} cols={cols} dec={daily ? 3 : 2} sum vo={vo} />;
}

const KIND_CLS: Record<HRow['kind'], string> = { total: s.hTotal, cum: s.hCum, block: s.hBlock, group: s.hGroup };

function Heat({ secs, cols, dec, sum, vo }: { secs: HSection[]; cols: HeatCol[]; dec: number; sum: boolean; vo: ViewOpts }) {
  const filtering = !!vo.q.trim();
  /* Хураасан багц · блок — `Fold` (`p:` · `b:` угтвартай түлхүүр) → `visibleHeat`-ийн олонлог */
  const pkgSet = new Set(secs.filter((x) => isFolded(vo.fold, `p:${x.pkg.key}`, 0)).map((x) => x.pkg.key));
  const blockSet = new Set(secs.flatMap((x) => [...hBlockParents(x)]).filter((id) => isFolded(vo.fold, `b:${id}`, 1)));
  const vis = visibleHeat(secs, pkgSet, blockSet, vo.q);
  /* Гүн: 0 — багц · 1 — блок/нийт · 2 — дэд бүлэг (байвал) */
  const deep = secs.some((x) => x.rows.some((r) => r.kind === 'group')) ? 2 : 1;
  if (!vis.length) {
    return (
      <>
        <LevelButtons deep={deep} vo={vo} off={filtering} />
        <div className={s.hint}>{tr('Шүүлтэд тохирох мөр алга')}</div>
      </>
    );
  }
  return (
    <>
    <LevelButtons deep={deep} vo={vo} off={filtering} />
    <div className={s.card}>
      <div className={s.scroll}>
        <table className={s.ht}>
          <thead>
            <tr>
              <th className={s.hName}>{tr('Багц / блок / бүлэг')}</th>
              <th className={s.r}>{tr('Жин %')}</th>
              <th>{tr('Эхлэх')}</th>
              <th>{tr('Дуусах')}</th>
              <th className={s.r}>{tr('Бодит %')}</th>
              {sum && <th className={s.r}>{tr('Нийлбэр')}</th>}
              {cols.map((c) => <th key={c.key} className={`${s.hc} ${c.now ? s.hNow : ''}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {vis.map((sec) => (
              <HeatSection
                key={sec.pkg.key} sec={sec} cols={cols} dec={dec} sum={sum}
                parents={filtering ? null : hBlockParents(secs.find((x) => x.pkg.key === sec.pkg.key) ?? sec)}
                vo={vo}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function HeatSection({ sec, cols, dec, sum, parents, vo }: {
  sec: HSection; cols: HeatCol[]; dec: number; sum: boolean;
  /** Дэд бүлэгтэй блокууд (хураах сум) — шүүлт идэвхтэй үед `null` (сумгүй) */
  parents: ReadonlySet<string> | null; vo: ViewOpts;
}) {
  const span = 5 + (sum ? 1 : 0) + cols.length;
  const pid = `p:${sec.pkg.key}`;
  return (
    <>
      <tr className={s.hSec}>
        <td className={s.hName} title={sec.pkg.label}>
          <Caret fold={parents ? { open: !isFolded(vo.fold, pid, 0), onToggle: () => vo.onToggle(pid) } : null} />
          {sec.pkg.label}
          {sec.pkg.blocks.length > 0 && <span className={s.w}> · {tr('{0} блок', sec.pkg.blocks.length)}</span>}
        </td>
        <td colSpan={span - 1} className={s.hNote}>{sec.note}</td>
      </tr>
      {sec.rows.map((r) => (
        <HeatRowView
          key={r.id} r={r} cols={cols} dec={dec} sum={sum}
          fold={parents?.has(r.id) ? { open: !isFolded(vo.fold, `b:${r.id}`, 1), onToggle: () => vo.onToggle(`b:${r.id}`) } : null}
        />
      ))}
    </>
  );
}

function HeatRowView({ r, cols, dec, sum, fold }: {
  r: HRow; cols: HeatCol[]; dec: number; sum: boolean; fold: { open: boolean; onToggle: () => void } | null;
}) {
  const cum = r.kind === 'cum';
  const max = cum ? 0 : Math.max(0, ...r.cells.map((v) => (v == null ? 0 : v)));
  return (
    <tr className={`${s.hRow} ${KIND_CLS[r.kind]}`}>
      <td className={s.hName} title={r.name}><Caret fold={fold} />{r.name}</td>
      <td className={s.r}>{r.w == null ? '' : pct(r.w, 1)}</td>
      <td className={s.num}>{r.start == null ? '' : fmtDay(r.start)}</td>
      <td className={s.num}>{r.end == null ? '' : fmtDay(r.end)}</td>
      <td className={s.r}>{cum ? '' : pct(r.actual, 1)}</td>
      {sum && <td className={`${s.r} ${s.sum}`}>{pct(r.sum ?? null, dec)}</td>}
      {r.note && r.cells.every((v) => v == null) ? (
        <td colSpan={r.cells.length} className={s.hRowNote}>{r.note}</td>
      ) : r.cells.map((v, i) => {
        const now = cols[i]?.now ? s.hNow : '';
        if (v == null) return <td key={i} className={`${s.hc} ${s.na} ${now}`}>—</td>;
        if (Math.abs(v) < 1e-9) return <td key={i} className={`${s.hc} ${now}`} />;
        if (cum) return <td key={i} className={`${s.hc} ${s.cumC} ${now}`}>{pct(v, 0)}</td>;
        const a = heatLevel(v, max);
        return (
          <td
            key={i}
            className={`${s.hc} ${a > 0.55 ? s.hotInk : ''} ${now}`}
            style={{ background: `color-mix(in oklab, var(--lv, var(--data)) ${Math.round(12 + a * 73)}%, transparent)` }}
          >
            {pct(v, dec)}
          </td>
        );
      })}
    </tr>
  );
}

/* ══════════════════ Тайлбар ══════════════════ */

function Legend({ lvl }: { lvl: Level }) {
  if (lvl <= 3) {
    return (
      <div className={s.legend}>
        <span className={s.lgItem}><span className={`${s.lgBar} ${s.stRun}`}><span className={s.gFill} style={{ width: '45%' }} /></span>{tr('Бүдэг = төлөвлөсөн хугацаа, тод = бодит гүйцэтгэл')}</span>
        <span className={s.lgItem}><span className={`${s.lgBar} ${s.stDone}`}><span className={s.gFill} style={{ width: '100%' }} /></span>{tr('✓ Дууссан (100%)')}</span>
        <span className={s.lgItem}><span className={`${s.lgBar} ${s.stLate}`}><span className={s.gFill} style={{ width: '45%' }} /></span>{tr('Улаан = хоцорсон эсвэл хийгдээгүй — удирдлагын шийдвэр шаардлагатай')}</span>
        <span className={s.lgItem}><span className={`${s.lgBar} ${s.stNone}`} />{tr('Мэдээлэл байхгүй')}</span>
        <span className={s.lgItem}><span className={`${s.lgBar} ${s.stTodo} ${s.inh}`} />{tr('Тасархай = өвөг мөрийн огноо (өөрийн хуваарьгүй)')}</span>
        <span className={s.lgItem}><span className={`${s.lgMs} ${s.msUp}`} />{tr('Milestone')}</span>
        <span className={s.lgItem}><span className={s.lgNow} />{tr('Өнөөдөр')}</span>
        <p className={s.foot}>
          {tr('Барилгын ажлын эхлэх огноо = гүйцэтгэгчийн бодит төлөвлөгөөт эхлэх (багцын хамгийн эрт блок). «Хоцорсон» = төлөвлөгөөт хувиас {0}-аас дээш пунктээр доогуур.', 10)}
        </p>
      </div>
    );
  }
  return (
    <div className={s.legend}>
      <span className={s.lgItem}>
        <span className={s.lgRamp} aria-hidden>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((a) => (
            <span key={a} style={{ background: `color-mix(in oklab, var(--lv, var(--data)) ${Math.round(12 + a * 73)}%, transparent)` }} />
          ))}
        </span>
        {tr('Бага → их (мөр доторх хамгийн их утгатай харьцуулсан)')}
      </span>
      <span className={s.lgItem}><span className={s.na}>—</span>&nbsp;{tr('мэдээлэлгүй (хуваарь алга)')}</span>
      <span className={s.lgItem}>{tr('Хоосон нүд = тухайн хугацаанд ажилгүй')}</span>
      <p className={s.foot}>
        {lvl === 4 && tr('Нүд = тухайн сард төлөвлөсөн гүйцэтгэл (мөрийн нийт ажлын %). Блок — Хуваарийн сарын төлөвлөгөө; багцын нийт — блокуудын жигнэсэн нийлбэр; «Өсөх дүн» — хуримтлагдсан.')}
        {lvl === 5 && tr('Блокийн мөр: L4-ийн сарын хувийг өдөрт тэнцүү хувааж 7 хоногоор (Да–Ня) нэгтгэсэн. Дэд бүлэг: блокийн нийт ажлын хэдэн хувь тухайн хугацаанд хийгдэхээр төлөвлөгдсөн (бөглөх хуудасны төлөвлөгөөт эхлэх/дуусах, шугаман).')}
        {lvl === 6 && tr('Блокийн мөр: L4-ийн сарын хувийг тухайн сарын өдрийн тоонд тэнцүү хуваасан. Дэд бүлэг: блокийн нийт ажлын хэдэн хувь тухайн өдөр хийгдэхээр төлөвлөгдсөн (бөглөх хуудасны төлөвлөгөөт эхлэх/дуусах, шугаман).')}
      </p>
    </div>
  );
}


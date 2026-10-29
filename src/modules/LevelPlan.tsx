'use client';

/**
 * 6 ТҮВШНИЙ ХУВААРЬ (L1–L6) — `docs/Level planning_261021 1.pdf`-ийн бүтэц, «Миний ажил» бүлэг (2026-10-26, cf-spec «Бусад»).
 *
 *   L1 Мастер · L2 Үе шат/milestone · L3 Хяналтын хуваарь — гант (Environment: зам `--chart-track`, гүйцэтгэл `--data`,
 *   хоцорсон `--bad`, дууссан `--good`, мэдээлэлгүй — зураас); L4 сарын · L5 7 хоногийн · L6 өдрийн heatmap.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { pct } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Data, userError } from '@/components/ui';
import {
  DAY, activeRange, buildL1, buildL2, buildL3, buildL4, buildLook, dayCols, dayOfLocal, failLabel, fmtDay, fmtMD, fmtMonth,
  ganttAxis, gParents, hBlockParents, heatLevel, loadLevelData, loadSheetDetail, monthIdx, packagesOf, visibleGantt,
  visibleHeat, weekCols, xMonths,
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
  1: () => tr('Төслийн нийт, үе шат ба барилга угсралтын чиглэл — гүйцэтгэл ба гэрээний дуусах огноо.'),
  2: () => tr('Багц бүрийн үе шат ба milestone: зураг төсөл, газар чөлөөлөлт, сонгон шалгаруулалт, зөвшөөрөл, барилга, гэрээ дуусах, ашиглалт.'),
  3: () => tr('Багц бүрийн зураг төслийн дэд шат ба барилга угсралтын дэд үе шат (бөглөх хуудасны жинтэй).'),
  4: () => tr('Багц × блок — сар бүрт төлөвлөсөн гүйцэтгэл (Хуваарийн сарын төлөвлөгөө).'),
  5: () => tr('Блок × дэд бүлэг — ойрын 12 долоо хоногийн төлөвлөсөн гүйцэтгэл.'),
  6: () => tr('Блок × дэд бүлэг — ойрын 14 хоногийн өдөр тутмын төлөвлөгөө.'),
};

/** Сарын өргөн (px) — гантын тэнхлэг сар-жигд */
const MW = 22;

/**
 * БҮЛГИЙН ТҮВШНЭЭР ХУРААХ (2026-10-29, хэрэглэгч: «Хуваарь шиг 0…N») — «Хуваарь»-ын түвшний зурвастай ИЖИЛ утга:
 *   0 = бүгдийг хураах (зөвхөн дээд түвшин) · N = N-р түвшин хүртэл дэлгэх (гүн ≤ N мөр) · хамгийн гүн = бүх мөр.
 *   `level` нь тэр N; `null` = бүгд дэлгэсэн (анхдагч).
 * `ids` — тэр түвшнээс ГАДНА мөр бүрийг сумаар сэлгэсэн (түвшин сонгоход арилна). Мөрийн хамаарах түвшин: гант —
 * `GRow.depth`; heatmap — багц 0 · блок 1 · дэд бүлэг 2. Түлхүүр: гантын мөрийн ID · `p:`+багц · `b:`+блокийн мөр.
 */
type Fold = { level: number | null; ids: ReadonlySet<string> };
const FOLD0: Fold = { level: null, ids: new Set() };
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
        {(d) => <LevelPlanBody d={d} />}
      </Data>
    </div>
  );
}

/** Ачаалагдсан өгөгдлийн харагдац — `initial` нь эхлэх түвшин (шалгуурт) */
export function LevelPlanBody({ d, initial = 1 }: { d: LevelData; initial?: Level }) {
  const [lvl, setLvl] = useState<Level>(initial);
  const [pk, setPk] = useState('');
  const [groups, setGroups] = useState(true);
  const [q, setQ] = useState('');
  const [gf, setGf] = useState<GFilter>('all');
  const [fold, setFold] = useState<Fold>(FOLD0);
  const pkgs = useMemo(() => packagesOf(d.plan.tree), [d.plan.tree]);
  const blockPkgs = useMemo(() => pkgs.filter((p) => p.blocks.length), [pkgs]);
  const today = dayOfLocal(d.at);

  if (d.plan.empty) {
    return (
      <div className={s.notice}>
        <strong>{tr('Төслийн төлөвлөгөө импортлогдоогүй байна')}</strong>
        <p>{tr('Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг санхүүжилтийн хүснэгтэд импортлосны дараа 6 түвшний хуваарь энд харагдана.')}</p>
      </div>
    );
  }

  const look = lvl === 5 || lvl === 6;
  /* L5/L6 нэг багцаар (блок × 16 мөр — бүх багцыг нэг дор зурах нь хэт их) */
  const lookPkg = blockPkgs.find((p) => p.key === pk) ?? blockPkgs[0] ?? null;
  const shown: PkgInfo[] = look ? (lookPkg ? [lookPkg] : []) : pk ? pkgs.filter((p) => p.key === pk) : pkgs;
  const opts = look ? blockPkgs : pkgs;
  /* Түвшин солиход хураалт эхлээс — мөрийн ID-ууд түвшин бүрд өөр */
  const pickLvl = (l: Level) => { setLvl(l); setFold(FOLD0); };
  const vo: ViewOpts = {
    fold, onToggle: (id) => setFold((f) => toggleFold(f, id)), onLevel: (n) => setFold({ level: n, ids: new Set() }),
    q, gf: lvl <= 3 ? gf : 'all',
  };
  const filtering = !!q.trim() || (lvl <= 3 && gf !== 'all');

  return (
    <>
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
              value={look ? lookPkg?.key ?? '' : pk}
              onChange={(e) => setPk(e.target.value)}
            >
              {!look && <option value="">{tr('Бүх багц')}</option>}
              {opts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
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
      </div>
      <p className={s.lvlSub}>{LEVEL_SUB[lvl]()}</p>

      {lvl === 1 && <Gantt rows={buildL1(d.plan, today)} today={today} vo={vo} />}
      {lvl === 2 && <Gantt rows={buildL2(d.plan, shown, d.marks, today)} today={today} vo={vo} />}
      {lvl === 3 && (
        <WithSheet>
          {(det) => <Gantt rows={buildL3(d.plan, shown, det, today)} today={today} vo={vo} />}
        </WithSheet>
      )}
      {lvl === 4 && <MonthHeat d={d} pkgs={shown} today={today} vo={vo} />}
      {look && groups && (
        <WithSheet>
          {(det) => <LookHeat d={d} pkgs={shown} det={det} groups daily={lvl === 6} today={today} vo={vo} />}
        </WithSheet>
      )}
      {look && !groups && <LookHeat d={d} pkgs={shown} det={null} groups={false} daily={lvl === 6} today={today} vo={vo} />}

      <Legend lvl={lvl} />
    </>
  );
}

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
const BAR_TEXT: Record<BarStatus, () => string> = {
  done: () => tr('Дууссан'),
  late: () => tr('Хугацаа хэтэрсэн'),
  behind: () => tr('Хоцорсон'),
  run: () => tr('Явж байна'),
  todo: () => tr('Эхлээгүй'),
  none: () => tr('Мэдээлэл байхгүй'),
};
const MS_TEXT: Record<MsStatus, () => string> = {
  done: () => tr('Биелсэн'),
  late: () => tr('Хугацаа хэтэрсэн'),
  upcoming: () => tr('Хүлээгдэж буй'),
  missing: () => tr('Огноо алга'),
  none: () => tr('Мэдээлэл байхгүй'),
};

function Gantt({ rows, today, vo }: { rows: GRow[]; today: number; vo: ViewOpts }) {
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
            <col style={{ width: W }} />
          </colgroup>
          <thead>
            <tr>
              <th className={s.cId}>{tr('ID')}</th>
              <th className={s.cName}>{tr('Ажил, үе шат')}</th>
              <th>{tr('Эхлэх')}</th>
              <th>{tr('Дуусах')}</th>
              <th className={s.r}>{tr('Гүйцэтгэл')}</th>
              <th className={s.cTl}><AxisHead ax={ax} nowX={nowX} today={today} /></th>
            </tr>
          </thead>
          <tbody>
            {vis.map((r) => (
              <GanttRow
                key={r.id} r={r} ax={ax} nowX={nowX} W={W}
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

function AxisHead({ ax, nowX, today }: { ax: Axis; nowX: number; today: number }) {
  const cells: ReactNode[] = [];
  for (let i = 0; i < ax.n; i += 1) {
    const m = ax.m0 + i;
    const mon = m % 12;
    cells.push(
      <span key={i} className={s.axM} style={{ left: i * MW, width: MW }}>{String(mon + 1).padStart(2, '0')}</span>,
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

function GanttRow({ r, ax, nowX, W, fold }: {
  r: GRow; ax: Axis; nowX: number; W: number; fold: { open: boolean; onToggle: () => void } | null;
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
        <td /><td /><td />
        {tl(null)}
      </tr>
    );
  }
  if (r.t === 'note') {
    return (
      <tr className={s.noteRow}>
        <td className={s.cId}>{r.id}</td>
        <td className={s.cName} style={ind}><Caret fold={fold} />{r.name}</td>
        <td /><td /><td />
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
        {tl(x != null ? (
          <>
            <span className={`${s.ms} ${MS_CLS[r.status]}`} style={{ left: x }} title={`${r.name} · ${fmtDay(r.at)} · ${MS_TEXT[r.status]()}`} />
            <span className={s.msLbl} style={{ left: x + 9 }}>{fmtDay(r.at)}</span>
          </>
        ) : r.status === 'none'
          ? <span className={s.tlNA}>{tr('Мэдээлэл байхгүй')}</span>
          : <span className={`${s.tlNA} ${s.badInk}`}>{tr('Огноо алга')}</span>)}
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
    BAR_TEXT[r.status](),
  ].filter(Boolean).join(' · ');
  return (
    <tr className={`${s.row} ${r.strong ? s.strongRow : ''}`}>
      <td className={s.cId}>{r.id}</td>
      <td className={s.cName} style={ind} title={r.name}>
        <Caret fold={fold} />{r.name}{r.w != null && <span className={s.w}> ({pct(r.w, 1)})</span>}
      </td>
      <td className={s.num}>{fmtDay(r.start)}</td>
      <td className={s.num}>{fmtDay(r.end)}</td>
      <td className={`${s.r} ${r.status === 'done' ? s.okInk : r.status === 'late' || r.status === 'behind' ? s.badInk : ''}`}>
        {r.status === 'done' ? `✓ ${pct(100, 0)}` : pct(r.actual, 0)}
      </td>
      {tl(has ? (
        <span
          className={`${s.gBar} ${BAR_CLS[r.status]} ${r.inh || r.alt ? s.inh : ''}`}
          style={{ left: x0, width: Math.max(3, x1 - x0) }}
          title={tip}
        >
          {fill != null && <span className={s.gFill} style={{ width: `${fill}%` }} />}
        </span>
      ) : <span className={s.tlNA}>{tr('Мэдээлэл байхгүй')}</span>)}
    </tr>
  );
}

/* ══════════════════ Heatmap (L4 · L5 · L6) ══════════════════ */

type HeatCol = { key: string; label: string; now: boolean };

function MonthHeat({ d, pkgs, today, vo }: { d: LevelData; pkgs: PkgInfo[]; today: number; vo: ViewOpts }) {
  const secs = useMemo(() => buildL4(d.plan, pkgs), [d.plan, pkgs]);
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
  if (!pkgs.length) return <div className={s.hint}>{tr('Блоктой багц алга')}</div>;
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
        <td colSpan={span - 1} />
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
      {r.cells.map((v, i) => {
        const now = cols[i]?.now ? s.hNow : '';
        if (v == null) return <td key={i} className={`${s.hc} ${s.na} ${now}`}>—</td>;
        if (Math.abs(v) < 1e-9) return <td key={i} className={`${s.hc} ${now}`} />;
        if (cum) return <td key={i} className={`${s.hc} ${s.cumC} ${now}`}>{pct(v, 0)}</td>;
        const a = heatLevel(v, max);
        return (
          <td
            key={i}
            className={`${s.hc} ${a > 0.55 ? s.hotInk : ''} ${now}`}
            style={{ background: `color-mix(in oklab, var(--data) ${Math.round(12 + a * 73)}%, transparent)` }}
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
        <span className={s.lgItem}><span className={`${s.lgBar} ${s.stLate}`}><span className={s.gFill} style={{ width: '45%' }} /></span>{tr('Улаан = хоцорсон эсвэл огноо алга — шийдвэр шаардлагатай')}</span>
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
            <span key={a} style={{ background: `color-mix(in oklab, var(--data) ${Math.round(12 + a * 73)}%, transparent)` }} />
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


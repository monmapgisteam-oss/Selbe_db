'use client';

/**
 * 6 ТҮВШНИЙ ХУВААРЬ — «ХОЛБООС ЗАСАХ» (2026-11-24, хэрэглэгч: «Багцын хамаарал»-ыг 6 түвшний хуваарь дээр шууд холбож/салгана;
 * тусдаа «Багцын хамаарал» хуудас хасагдсан). Мөр дарж ажлаа сонгоод нөгөө мөрийг дарж холбоно; зураас (эсвэл сонгосон ажлын
 * жагсаалтын «Салгах») дарж салгана. Нэг мөр олон ажилтай бол жижиг цонхоор аль нэгийг сонгоно. Өөрчлөлт «Хадгалах» хүртэл
 * зөвхөн энд; хадгалалт `saveWorkLinks`-оор (хадгалдаг мөр тутамд нэг удаа). 6 түвшний мөр · зураасны тооцоонд хүрэхгүй.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { bagtsKey } from '@/lib/services';
import { legacyCovered, legacyPkgKey, linkError, nodeMatches, pkgPairs, refOf, type Edge, type NodeId, type WNode } from '@/lib/workDeps';
import { dropWorkCache, loadWorkData, pkgKeyOfSheet, saveWorkLinks, sheetsOfPkgKey } from '@/lib/workDepsRemote';
import { loadLegacyDeps, removeLegacyDeps, type Dep } from '@/lib/bagtsHamaaral';
import {
  editIndex, groupChanges, linePairs, orphanLines, pairOf, refKeyOf, rowWorks, savedLines, stagedLinks, xIdOf,
  type Line,
} from '@/lib/levelLinkEdit';
import type { PkgInfo, WorkLink } from '@/lib/levelPlan';
import { friendlyError, userError } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { setNavDirty } from '@/lib/navGuard';
import s from './levelPlan.module.css';

/** Гант/heatmap-д дамжих засах горимын холбоо — `undefined` бол хуудас өөрчлөгдөхгүй (зөвхөн харах) */
export type RowEdit = {
  onRow: (lk: string, x: number, y: number) => void;
  /** Мөрийн нэмэлт класс — сонгосон · холбоотой · дарж болох */
  rowCls: (lk: string | undefined) => string | undefined;
  onLine: (ids: readonly string[], x: number, y: number) => void;
  /** Чиглэлгүй зураасны класс — нэмэх · устгах · сонгосонтой холбоотой */
  lineCls: (ids: readonly string[]) => string | undefined;
};

const NONE: WorkLink[] = [];

/** Хуучин холбооны түлхүүрийн дэлгэцийн нэр — бөглөх хуудасны багцын бүлэг (`PKGS.group`), орчуулсан */
const legacyLabel = (k: string): string => {
  const key = legacyPkgKey(k);
  const p = key ? PKGS.find((x) => bagtsKey(x.group) === key) : undefined;
  return p ? tr(p.group) : (key || k);
};
const pkgLabel = (p: string): string => PKGS.find((x) => x.key === p)?.label ?? p;
const nodeLabel = (n: Pick<WNode, 'path' | 'work'> & { group?: boolean }): string =>
  `${n.path.map((x) => x.trim() || tr('(нэргүй бүлэг)')).join(' → ')} «${n.work.trim() || (n.group ? tr('(нэргүй бүлэг)') : tr('(нэргүй ажил)'))}»`;
const shortLabel = (n: WNode): string => `${n.no.trim() ? `${n.no.trim()} · ` : ''}${n.work.trim() || tr('(нэргүй бүлэг)')}`;
const whyText = (e: Edge): string => (e.why === 'unloaded'
  ? tr('хуудас уншигдаагүй')
  : e.why === 'ambiguous'
    ? tr('ижил нэртэй мөр нэмэгдсэн/хасагдсан — аль нь болохыг тодорхойлж чадсангүй')
    : tr('ажил олдсонгүй (устсан эсвэл нэр нь өөрчлөгдсөн)'));

type Pop =
  | { kind: 'row'; x: number; y: number; ids: NodeId[]; lk: string }
  | { kind: 'line'; x: number; y: number; pairs: [NodeId, NodeId][] };

/**
 * Засах горимын төлөв. `on` — эрхтэй хэрэглэгч «Холбоос засах»-ыг асаасан; `onExit` — горимоос гарах (эцэг унтраана);
 * `onSaved` — хадгалсны дараа 6 түвшний холбоосыг дахин ачаална.
 */
export function useLinkEdit(on: boolean, pkgs: readonly PkgInfo[], onExit: () => void, onSaved: () => void): {
  rowEdit: RowEdit | undefined; staged: WorkLink[]; ui: ReactNode; exit: () => Promise<void>;
} {
  const dataQ = useAsync(() => (on ? loadWorkData() : Promise.resolve(null)), [on]);
  const legacyQ = useAsync(() => (on ? loadLegacyDeps() : Promise.resolve(null)), [on]);
  const data = on && dataQ.state === 'ready' ? dataQ.data : null;
  const g = data?.graph ?? null;
  const [sel, setSel] = useState<NodeId | null>(null);
  const [selLk, setSelLk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [adds, setAdds] = useState<Line[]>([]);
  const [dels, setDels] = useState<Map<string, NodeId>>(() => new Map());
  const [hist, setHist] = useState<{ adds: Line[]; dels: Map<string, NodeId> }[]>([]);
  const [pop, setPop] = useState<Pop | null>(null);

  const ix = useMemo(() => (g && data
    ? editIndex(g, data.sheets.map((x) => ({ p: x.pkg.key, rows: x.rows })), pkgKeyOfSheet, pkgs)
    : null), [g, data, pkgs]);
  const worksOf = useCallback((lk: string): NodeId[] => (ix ? rowWorks(lk, ix) : []), [ix]);
  const sheetOf = useMemo(() => new Map((data?.sheets ?? []).map((x) => [x.pkg.key, x] as const)), [data]);
  const canWriteSheet = useCallback((p: string) => !!sheetOf.get(p)?.field, [sheetOf]);
  const selNode = g && sel ? g.nodes.get(sel) ?? null : null;

  const saved = useMemo<Line[]>(() => (g ? savedLines(g) : []), [g]);
  const orphans = useMemo(() => (g ? orphanLines(g, dels) : []), [g, dels]);
  const lines = useMemo<Line[]>(() => [
    ...saved.map((l) => (dels.has(l.key) ? { ...l, kind: 'del' as const } : l)),
    ...adds,
  ], [saved, adds, dels]);
  const dirty = adds.length + dels.size;

  /* Граф шинэчлэгдэхэд — хадгалагдсан нэмэлт, алга болсон холбоосын устгалтыг хүлээгдэж буйгаас хасна (хуучин «Багцын хамаарал»-ын дүрэм) */
  const [seenG, setSeenG] = useState(g);
  if (g !== seenG) {
    setSeenG(g);
    if (g) {
      const alive = new Set([...g.pre].flatMap(([host, es]) => es.map((e) => `${host}#${refKeyOf(e.ref)}`)));
      const savedPairs = new Set(saved.map((l) => l.pair));
      if ([...dels.keys()].some((k) => !alive.has(k))) setDels(new Map([...dels].filter(([k]) => alive.has(k))));
      if (adds.some((l) => savedPairs.has(l.pair))) setAdds(adds.filter((l) => !savedPairs.has(l.pair)));
      if (hist.length) setHist([]);
    }
  }
  useEffect(() => { setNavDirty('hamaaral-edit', on && dirty > 0, tr('Хадгалаагүй холбоо')); }, [on, dirty]);
  useEffect(() => () => setNavDirty('hamaaral-edit', false), []);

  /* ── Хуучин багц ↔ багц холбоос: бүлгээр шилжсэн бол автоматаар устгана ── */
  const legacy = useMemo<Dep[]>(() => (on && legacyQ.state === 'ready' && legacyQ.data ? legacyQ.data.deps : []), [on, legacyQ]);
  const pairs = useMemo(() => (g ? pkgPairs(g) : []), [g]);
  const retryLegacy = legacyQ.retry;
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!on || !g || !legacy.length) return;
    const cov = legacy.filter((d) => (legacyCovered(pairs, d, sheetsOfPkgKey) || legacyCovered(pairs, { ...d, from: d.to, to: d.from }, sheetsOfPkgKey)) && !tried.current.has(`${d.from}>${d.to}`));
    if (!cov.length) return;
    for (const d of cov) tried.current.add(`${d.from}>${d.to}`);
    void removeLegacyDeps(cov).then((r) => {
      if (r.ok) retryLegacy?.();
      else setErr(userError(r.error));
    });
  }, [on, g, legacy, pairs, retryLegacy]);
  const removeLegacy = useCallback(async (d: Dep) => {
    if (!(await askConfirm(tr('Хуучин «{0}» → «{1}» холбоог устгах уу?', d.from, d.to), { danger: true, ok: tr('Устгах') }))) return;
    setBusy(true);
    setErr('');
    try {
      const r = await removeLegacyDeps([d]);
      if (!r.ok) setErr(userError(r.error));
      else retryLegacy?.();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [retryLegacy]);

  const reload = useCallback(() => { dropWorkCache(); dataQ.retry?.(); onSaved(); }, [dataQ, onSaved]);

  /** `a` ↔ `b`-г СЭЛГЭНЭ: шинэ нэмэлт бол буцаана, хадгалсан бол устгахаар тэмдэглэнэ/буцаана, эс бөгөөс нэмнэ */
  const toggle = useCallback((a: WNode, b: WNode) => {
    setErr('');
    setMsg('');
    const pk = pairOf(a.id, b.id);
    const snap = { adds, dels };
    if (adds.some((l) => l.pair === pk)) { setHist((h) => [...h, snap]); setAdds(adds.filter((l) => l.pair !== pk)); return; }
    const had = saved.filter((l) => l.pair === pk);
    if (had.length) {
      const allDel = had.every((l) => dels.has(l.key));
      const nx = new Map(dels);
      for (const l of had) { if (allDel) nx.delete(l.key); else nx.set(l.key, l.host); }
      setHist((h) => [...h, snap]);
      setDels(nx);
      return;
    }
    const [host, other] = canWriteSheet(a.p) ? [a, b] : canWriteSheet(b.p) ? [b, a] : [null, null];
    if (!host || !other) { setErr(tr('«{0}» ба «{1}» хуудсанд холбоо хадгалах боломжгүй (талбаргүй эсвэл эрхгүй).', pkgLabel(a.p), pkgLabel(b.p))); return; }
    if (g) {
      const why = linkError(g, host.id, other.id);
      if (why) { setErr(why); return; }
    }
    const ref = refOf(other);
    setHist((h) => [...h, snap]);
    setAdds([...adds, { key: `+${host.id}#${refKeyOf(ref)}`, pair: pk, a: a.id, b: b.id, host: host.id, ref, kind: 'add' }]);
  }, [g, adds, saved, dels, canWriteSheet]);
  const toggleIds = useCallback((a: NodeId, b: NodeId) => {
    const na = g?.nodes.get(a);
    const nb = g?.nodes.get(b);
    if (na && nb) toggle(na, nb);
  }, [g, toggle]);
  const toggleOrphan = useCallback((key: string, host: NodeId) => {
    const nx = new Map(dels);
    if (nx.has(key)) nx.delete(key); else nx.set(key, host);
    setHist((h) => [...h, { adds, dels }]);
    setDels(nx);
  }, [adds, dels]);
  const undo = useCallback(() => {
    const last = hist[hist.length - 1];
    if (!last) return;
    setAdds(last.adds);
    setDels(last.dels);
    setHist(hist.slice(0, -1));
  }, [hist]);
  const pick = useCallback((id: NodeId, lk: string) => { setSel(id); setSelLk(lk); }, []);
  const unpick = useCallback(() => { setSel(null); setSelLk(null); }, []);

  /** ХАДГАЛАХ — хадгалдаг мөрөөр бүлэглэж мөр бүрд нэг удаа (`saveWorkLinks` — бичихийн өмнө дахин уншина) */
  const saveAll = useCallback(async () => {
    if (!g || busy || !dirty) return;
    const byHost = groupChanges(adds, saved, dels, orphans);
    setBusy(true);
    setErr('');
    setMsg('');
    const bad = new Set<NodeId>();
    const errs: string[] = [];
    let wrote = 0;
    try {
      for (const [h, change] of byHost) {
        const n = g.nodes.get(h);
        if (!n) continue;
        try {
          const r = await saveWorkLinks(refOf(n), change);
          if (!r.ok) { bad.add(h); errs.push(`${pkgLabel(n.p)} · ${shortLabel(n)}: ${userError(r.error)}`); } else wrote += 1;
        } catch (e) {
          bad.add(h);
          errs.push(`${pkgLabel(n.p)} · ${shortLabel(n)}: ${userError(e)}`);
        }
      }
    } finally {
      setBusy(false);
    }
    setAdds((cur) => cur.filter((l) => bad.has(l.host)));
    setHist([]);
    setDels((cur) => new Map([...cur].filter(([, h]) => bad.has(h))));
    if (errs.length) setErr(tr('Хадгалагдаагүй ({0}): {1}', num(errs.length), errs.join(' · ')));
    else setMsg(tr('Хадгалагдлаа ({0} бүлэг)', num(wrote)));
    if (wrote) reload();
  }, [g, busy, dirty, adds, saved, dels, orphans, reload]);

  const exit = useCallback(async () => {
    if (dirty && !(await askConfirm(tr('Хадгалаагүй {0} өөрчлөлт хаягдана. Үргэлжлүүлэх үү?', num(dirty)), { danger: true, ok: tr('Хаях') }))) return;
    setAdds([]);
    setDels(new Map());
    setHist([]);
    setSel(null);
    setSelLk(null);
    setPop(null);
    setErr('');
    setMsg('');
    onExit();
  }, [dirty, onExit]);

  /* Esc — эхлээд жижиг цонх, дараа нь сонголт */
  useEffect(() => {
    if (!on || (!pop && !sel)) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pop) setPop(null); else unpick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, pop, sel, unpick]);

  /* ── Мөр · зураас дарах ── */
  const linked = useMemo(() => (sel
    ? new Set(lines.filter((l) => l.kind !== 'del' && (l.a === sel || l.b === sel)).map((l) => (l.a === sel ? l.b : l.a)))
    : new Set<NodeId>()), [lines, sel]);
  const addX = useMemo(() => new Set(adds.map((l) => xIdOf(l.a, l.b))), [adds]);
  const delX = useMemo(() => {
    const live = new Set(lines.filter((l) => l.kind !== 'del').map((l) => l.pair));
    return new Set(lines.filter((l) => l.kind === 'del' && !live.has(l.pair)).map((l) => xIdOf(l.a, l.b)));
  }, [lines]);

  const onRow = useCallback((lk: string, x: number, y: number) => {
    if (busy || !g) return;
    setErr('');
    setMsg('');
    const ws = worksOf(lk);
    if (!ws.length) { setErr(tr('Энэ мөрд холбох бүлэг алга — багц, дэд үе шат эсвэл дэд бүлгийн мөрийг дарна уу.')); return; }
    if (!selNode) {
      if (ws.length === 1) pick(ws[0], lk); else setPop({ kind: 'row', x, y, ids: ws, lk });
      return;
    }
    if (lk === selLk) { unpick(); return; }
    const others = ws.filter((id) => id !== selNode.id);
    if (!others.length) { unpick(); return; }
    if (others.length === 1) { const n = g.nodes.get(others[0]); if (n) toggle(selNode, n); return; }
    setPop({ kind: 'row', x, y, ids: others, lk });
  }, [busy, g, worksOf, selNode, selLk, pick, unpick, toggle]);
  const onLine = useCallback((ids: readonly string[], x: number, y: number) => {
    if (busy || !g) return;
    const seen = new Set<string>();
    const ps = linePairs(ids).filter(([a, b]) => {
      const k = pairOf(a, b);
      if (seen.has(k) || !g.nodes.has(a) || !g.nodes.has(b)) return false;
      seen.add(k);
      return true;
    });
    if (!ps.length) return;
    if (ps.length === 1) toggleIds(ps[0][0], ps[0][1]);
    else setPop({ kind: 'line', x, y, pairs: ps });
  }, [busy, g, toggleIds]);
  const rowCls = useCallback((lk: string | undefined): string | undefined => {
    if (!lk) return undefined;
    const ws = worksOf(lk);
    if (!ws.length) return undefined;
    if (sel && (lk === selLk || ws.includes(sel))) return s.lkSel;
    if (linked.size && ws.some((id) => linked.has(id))) return s.lkLinked;
    return s.lkPick;
  }, [worksOf, sel, selLk, linked]);
  const lineCls = useCallback((ids: readonly string[]): string | undefined => {
    const xs = ids.filter((id) => id.startsWith('x:'));
    if (!xs.length) return undefined;
    if (xs.some((id) => addX.has(id))) return s.lkAdd;
    if (xs.every((id) => delX.has(id))) return s.lkDel;
    if (sel && linePairs(xs).some(([a, b]) => a === sel || b === sel)) return s.lkOn;
    return undefined;
  }, [addX, delX, sel]);

  const rowEdit = useMemo<RowEdit | undefined>(() => (on && g ? { onRow, rowCls, onLine, lineCls } : undefined), [on, g, onRow, rowCls, onLine, lineCls]);
  const staged = useMemo(() => (on && ix && adds.length ? stagedLinks(adds, ix.ends) : NONE), [on, ix, adds]);

  if (!on) return { rowEdit: undefined, staged: NONE, ui: null, exit };

  const kindOf = (a: NodeId, b: NodeId): Line['kind'] | null => {
    const k = pairOf(a, b);
    const ls = lines.filter((l) => l.pair === k);
    if (!ls.length) return null;
    return ls.some((l) => l.kind === 'add') ? 'add' : ls.some((l) => l.kind === 'saved') ? 'saved' : 'del';
  };
  const missing = (data?.sheets ?? []).filter((x) => !x.error && !x.field);
  const failed = (data?.sheets ?? []).filter((x) => x.error);

  const ui = (
    <div className={s.lkPanel} role="region" aria-label={tr('Холбоос засах')}>
      <div className={s.lkPanelHead}>
        <p className={s.lkHelp}>
          {selNode
            ? tr('«{0}»-тэй холбох мөрийг дарна уу. Салгахдаа зураас дээр эсвэл доорх «Салгах» дарна. Дуусаад «Хадгалах».', shortLabel(selNode))
            : tr('Холбоос засах: эхлээд ажлын мөрийг дарж сонгоод, түүнтэй холбох мөрийг дарна уу. Зураас дээр дарж салгана.')}
        </p>
        <span className={s.grow} />
        <button type="button" className={s.btn} disabled={busy || !dirty || !g} onClick={() => { void saveAll(); }}>
          {busy ? tr('Хадгалж байна…') : tr('Хадгалах (+{0} / −{1})', num(adds.length), num(dels.size))}
        </button>
        <button type="button" className={s.btn} disabled={busy || !hist.length} onClick={undo} title={tr('Сүүлийн өөрчлөлтийг цуцлах')}>{tr('↶ Буцаах')}</button>
        <button type="button" className={s.btn} disabled={busy} onClick={() => { void exit(); }}>{tr('Болих')}</button>
      </div>
      {on && dataQ.state === 'loading' && <div className={s.info}>{tr('Багцын хамаарлыг ачаалж байна…')}</div>}
      {on && dataQ.state === 'error' && (
        <div className={s.warn} role="alert">
          {tr('Бөглөх хуудсууд уншигдсангүй')}: {friendlyError(dataQ.error)}{' '}
          <button type="button" className={s.btn} onClick={reload}>{tr('Дахин оролдох')}</button>
        </div>
      )}
      {err && (
        <div className={s.warn} role="alert">
          {err}{' '}<button type="button" className={s.btn} disabled={busy} onClick={() => { setErr(''); reload(); }}>{tr('Дахин ачаалах')}</button>
        </div>
      )}
      {msg && !err && <div className={s.info} role="status">{msg}</div>}
      {missing.length > 0 && (
        <div className={s.warn} role="note">
          {tr('«{0}» талбаргүй хуудас ({1}) — тэдгээрийн ажилд хамаарал хадгалах боломжгүй (зөвхөн харах): {2}', 'bagts_hamaaral', num(missing.length), missing.map((x) => x.pkg.label).join(', '))}
        </div>
      )}
      {failed.length > 0 && (
        <div className={s.warn} role="alert">
          {tr('Уншигдаагүй хуудас ({0}) — тэдгээрийн бүлгүүд харагдахгүй, холбох боломжгүй: {1}', num(failed.length), failed.map((x) => x.pkg.label).join(', '))}
        </div>
      )}
      {g && g.bad.length > 0 && (
        <div className={s.warn} role="alert">
          {tr('Эвдэрсэн бичлэгтэй ажил ({0}) — тэдгээрийн хамаарлыг уншиж/засах боломжгүй, админд хандана уу: {1}', num(g.bad.length),
            g.bad.slice(0, 5).map((b) => { const n = g.nodes.get(b.id); return n ? `${pkgLabel(n.p)} · ${nodeLabel(n)}` : b.id; }).join('; '))}
        </div>
      )}
      {g && orphans.length > 0 && (
        <div className={s.warn} role="note">
          <strong>{tr('Өнчин холбоо ({0}) — холбосон бүлэг нь олдохгүй байна', num(orphans.length))}</strong>
          <ul className={s.lkList}>
            {orphans.slice(0, 30).map((o) => {
              const d = g.nodes.get(o.host);
              return (
                <li key={o.key} className={o.del ? s.lkIsDel : undefined}>
                  <span>{d ? `${pkgLabel(d.p)} · ${shortLabel(d)}` : o.host} ↔ {pkgLabel(o.e.ref.p)} · {o.e.ref.k} <small>({whyText(o.e)})</small></span>
                  <button type="button" className={s.btn} disabled={busy} onClick={() => toggleOrphan(o.key, o.host)}>{o.del ? tr('Буцаах') : tr('Салгах')}</button>
                </li>
              );
            })}
          </ul>
          {orphans.length > 30 && <span>… +{num(orphans.length - 30)}</span>}
        </div>
      )}
      {legacy.length > 0 && (
        <div className={s.warn} role="note">
          <strong>{tr('Хуучин багц хоорондын холбоо — бүлгээр нь холбож шилжүүлнэ үү')}</strong>{' '}
          {tr('Бүлгийн холбоо хадгалагдмагц тухайн хуучин холбоо автоматаар устна.')}
          <ul className={s.lkList}>
            {legacy.map((d) => {
              const ok = sheetsOfPkgKey(legacyPkgKey(d.from)).length > 0 && sheetsOfPkgKey(legacyPkgKey(d.to)).length > 0;
              return (
                <li key={`${d.from}>${d.to}`}>
                  <span><b>{legacyLabel(d.from)}</b> → <b>{legacyLabel(d.to)}</b></span>
                  {!ok && <small>{tr('бөглөх хуудасгүй багц — шилжүүлэх боломжгүй')}</small>}
                  {!ok && <button type="button" className={s.btn} disabled={busy} onClick={() => { void removeLegacy(d); }}>{tr('Устгах')}</button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {g && selNode && (
        <SelBox g={g} n={selNode} lines={lines} busy={busy} orphans={orphans.filter((o) => o.host === selNode.id)}
          onToggle={(o) => toggle(selNode, o)} onToggleOrphan={toggleOrphan} onClose={unpick} />
      )}
      {g && pop && (
        <PopList pop={pop} g={g} sel={selNode} busy={busy} kindOf={kindOf} onClose={() => setPop(null)}
          onPickRow={(id) => {
            const lk = pop.kind === 'row' ? pop.lk : '';
            setPop(null);
            const n = g.nodes.get(id);
            if (!n) return;
            if (selNode) toggle(selNode, n); else pick(id, lk);
          }}
          onToggle={toggleIds} />
      )}
    </div>
  );
  return { rowEdit, staged, ui, exit };
}

/* ══════════════ Сонгосон ажил — холбоотой ажлууд ══════════════ */

function SelBox({ g, n, lines, busy, orphans, onToggle, onToggleOrphan, onClose }: {
  g: { nodes: Map<NodeId, WNode> }; n: WNode; lines: Line[]; busy: boolean;
  orphans: { key: string; host: NodeId; e: Edge; del: boolean }[];
  onToggle: (other: WNode) => void; onToggleOrphan: (key: string, host: NodeId) => void; onClose: () => void;
}) {
  const mine = new Map<NodeId, Line['kind']>();
  for (const l of lines) {
    if (l.a !== n.id && l.b !== n.id) continue;
    const o = l.a === n.id ? l.b : l.a;
    const cur = mine.get(o);
    if (!cur || cur === 'del') mine.set(o, l.kind);
  }
  const list = [...mine].map(([id, kind]) => ({ other: g.nodes.get(id), kind })).filter((x): x is { other: WNode; kind: Line['kind'] } => !!x.other);
  return (
    <div className={s.lkSelBox} aria-label={tr('Сонгосон бүлэг')}>
      <div className={s.lkPanelHead}>
        <strong>{pkgLabel(n.p)} · {nodeLabel(n)}</strong>
        <span className={s.grow} />
        <button type="button" className={s.btn} onClick={onClose}>{tr('Сонголтоо болих (Esc)')}</button>
      </div>
      <p className={s.lkHelp}>{tr('Холбоотой бүлгүүд')} ({num(list.filter((x) => x.kind !== 'del').length)})</p>
      {list.length === 0 && orphans.length === 0 ? <p className={s.lkHelp}>—</p> : (
        <ul className={s.lkList}>
          {list.map(({ other, kind }) => (
            <li key={other.id} className={kind === 'add' ? s.lkIsAdd : kind === 'del' ? s.lkIsDel : undefined}>
              <span><b>{pkgLabel(other.p)}</b> {shortLabel(other)}</span>
              {kind !== 'saved' && <small>{kind === 'add' ? tr('нэмэх') : tr('устгах')}</small>}
              <button type="button" className={s.btn} disabled={busy} onClick={() => onToggle(other)}>
                {kind === 'saved' ? tr('Салгах') : tr('Буцаах')}
              </button>
            </li>
          ))}
          {orphans.map((o) => (
            <li key={o.key} className={o.del ? s.lkIsDel : undefined}>
              <span>{pkgLabel(o.e.ref.p)} · {o.e.ref.k} <small>({whyText(o.e)})</small></span>
              <button type="button" className={s.btn} disabled={busy} onClick={() => onToggleOrphan(o.key, o.host)}>
                {o.del ? tr('Буцаах') : tr('Салгах')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ══════════════ Жижиг цонх — нэг мөр олон ажилтай · нэг зураас олон холбоотой ══════════════ */

const POP_MAX = 200;

function PopList({ pop, g, sel, busy, kindOf, onClose, onPickRow, onToggle }: {
  pop: Pop; g: { nodes: Map<NodeId, WNode> }; sel: WNode | null; busy: boolean;
  kindOf: (a: NodeId, b: NodeId) => Line['kind'] | null;
  onClose: () => void; onPickRow: (id: NodeId) => void; onToggle: (a: NodeId, b: NodeId) => void;
}) {
  const [q, setQ] = useState('');
  const W = 380;
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const style = { left: Math.max(8, Math.min(pop.x, vw - W - 8)), top: Math.max(8, Math.min(pop.y + 8, vh - 380)), width: W };
  const kindText = (k: Line['kind'] | null): string => (k === 'saved' ? tr('холбоотой') : k === 'add' ? tr('нэмэх') : k === 'del' ? tr('устгах') : '');
  let body: ReactNode;
  if (pop.kind === 'row') {
    const all = pop.ids.map((id) => g.nodes.get(id)).filter((x): x is WNode => !!x);
    const hit = all.filter((n) => nodeMatches(n, q) || pkgLabel(n.p).toLowerCase().includes(q.trim().toLowerCase()));
    body = (
      <>
        <p className={s.lkHelp}>
          {sel ? tr('Энэ мөрд {0} бүлэг байна — «{1}»-тэй холбох бүлгийг сонгоно уу.', num(all.length), shortLabel(sel))
            : tr('Энэ мөрд {0} бүлэг байна — аль нэгийг сонгоно уу.', num(all.length))}
        </p>
        {all.length > 8 && (
          <input className={s.search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Бүлэг хайх')} aria-label={tr('Бүлэг хайх')} autoFocus />
        )}
        <ul className={s.lkList}>
          {hit.slice(0, POP_MAX).map((n) => {
            const k = sel ? kindOf(sel.id, n.id) : null;
            return (
              <li key={n.id} className={k === 'add' ? s.lkIsAdd : k === 'del' ? s.lkIsDel : undefined}>
                <button type="button" className={s.lkPick} disabled={busy} title={`${pkgLabel(n.p)} · ${nodeLabel(n)}`} onClick={() => onPickRow(n.id)}>
                  <b>{pkgLabel(n.p)}</b> {shortLabel(n)}
                </button>
                {k && <small>{kindText(k)}</small>}
              </li>
            );
          })}
        </ul>
        {hit.length > POP_MAX && <p className={s.lkHelp}>… +{num(hit.length - POP_MAX)}</p>}
        {!hit.length && <p className={s.lkHelp}>{tr('Хайлтад тохирох бүлэг алга')}</p>}
      </>
    );
  } else {
    body = (
      <>
        <p className={s.lkHelp}>{tr('Энэ зураас {0} холбоог нэгтгэсэн — салгах холбоогоо сонгоно уу.', num(pop.pairs.length))}</p>
        <ul className={s.lkList}>
          {pop.pairs.map(([a, b]) => {
            const na = g.nodes.get(a)!;
            const nb = g.nodes.get(b)!;
            const k = kindOf(a, b);
            return (
              <li key={pairOf(a, b)} className={k === 'add' ? s.lkIsAdd : k === 'del' ? s.lkIsDel : undefined}>
                <span><b>{pkgLabel(na.p)}</b> {shortLabel(na)} ↔ <b>{pkgLabel(nb.p)}</b> {shortLabel(nb)}</span>
                <button type="button" className={s.btn} disabled={busy} onClick={() => onToggle(a, b)}>
                  {k === 'saved' ? tr('Салгах') : tr('Буцаах')}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  return (
    <>
      <button type="button" className={s.lkBackdrop} aria-label={tr('Хаах')} onClick={onClose} />
      <div className={s.lkPop} style={style} role="dialog" aria-label={tr('Холбоос засах')}>
        {body}
        <div className={s.lkPanelHead}>
          <span className={s.grow} />
          <button type="button" className={s.btn} onClick={onClose}>{tr('Хаах')}</button>
        </div>
      </div>
    </>
  );
}

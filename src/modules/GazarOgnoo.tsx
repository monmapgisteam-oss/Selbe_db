'use client';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ОГНОО (2026-11-04, хэрэглэгч; «ТЭЗҮ · Ажлын зураг төсөл»-ийн загвараар) — «Газар чөлөөлөлт» үе шатын
 * навч мөрийн `gazar_ehleh`/`gazar_duusah`. ТТБ-ийн «ОСНАУГ / Газар чөлөөлөлт» багана эндээс бөглөгдөнө.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { schedulePlanSync } from '@/lib/projectPlanSync';
import { awaitingReload } from '@/lib/finEdit';
import { hasCap, subscribeCaps, type CapKey } from '@/lib/caps';
import { setNavDirty } from '@/lib/navGuard';
import { askConfirm } from '@/lib/confirm';
import { useAuth } from '@/components/AuthGate';
import { Data, userError } from '@/components/ui';
import { buildTree, computePlan, type PlanNode } from '@/lib/projectPlan';
import { dayOf, displayCodes, rowKey, toStored, type Names } from '@/lib/zuragTosol';
import {
  badText, buildEdits, conflicts, effectiveRows, inSection, isEditable, pendingCount, setEdit, textOf,
  type DateIssue, type DateKey, type DatePending,
} from '@/lib/gazarOgnoo';
import s from './zuragTosol.module.css';

type Row = Record<string, unknown>;

/** Засах эрх — «ТЭЗҮ · Ажлын зураг төсөл»-тэй нэг */
const EDIT_CAP: CapKey = 'zuragEdit';

const F = CASHFLOW_NEW.fields;
const NAMES: Names = { oid: CASHFLOW_NEW.oid, cfId: CF_MONTH.id };
const OUT = [
  CASHFLOW_NEW.oid, F.ddKod, F.parentKod, F.level, F.phase, F.pkg, F.block, F.detail, F.budget, F.wSection,
  F.wProject, F.landStart, F.landEnd, F.contractorStart, F.contractorEnd, F.progressPct, CF_MONTH.id,
];
const WHERE = `${F.ddKod} IS NOT NULL AND ${CF_MONTH.start} IS NULL`;

const loadRows = cached(async () => ({
  rows: await queryFeatures(CASHFLOW_NEW.url, { where: WHERE, outFields: OUT, orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  at: Date.now(),
}), 5 * 60_000, ['CASHFLOW_NEW']);

const nameOf = (n: PlanNode): string => String(n.row?.ajil_uilchilgee ?? '');

const ISSUE_TEXT: Record<DateIssue['kind'], () => string> = {
  date: () => tr('огноо буруу (YYYY-MM-DD)'),
  order: () => tr('эхлэх огноо дуусахаас хойш'),
  pair: () => tr('эхлэх, дуусах огноог хоёуланг нь оруулна уу'),
  missing: () => tr('мөр олдсонгүй — дахин ачаална уу'),
};

export function GazarOgnoo() {
  const q = useAsync(loadRows, []);
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <h1 className={s.h1}>{tr('Газар чөлөөлөлтийн огноо')}</h1>
        <p className={s.sub}>
          {tr('Газар чөлөөлөлт үе шатын мөр бүрийн эхлэх, дуусах огноог оруулна. Дээд мөрүүдийн огноо автоматаар бодогдож, «Төсөл төлөвлөгөө биелэлт» хүснэгтэд харагдана.')}
        </p>
      </header>
      <Data q={q} loading={tr('Ачаалж байна…')} minH={240}>
        {(d) => <Body rows={d.rows} at={d.at} />}
      </Data>
    </div>
  );
}

function Body({ rows, at }: { rows: Row[]; at: number }) {
  const base = useMemo(() => rows.map((r) => toStored(r, NAMES)).filter((r) => r.dd_kod), [rows]);
  const [pend, setPend] = useState<DatePending>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());

  const [pubFrom, setPubFrom] = useState<Row[] | null>(null);
  const reloading = awaitingReload(pubFrom, rows);
  if (pubFrom != null && !reloading) {
    setPubFrom(null);
    setPend({});
  }
  const locked = busy || reloading;

  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const canEdit = useMemo(
    () => hasCap(user?.username, EDIT_CAP),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN],
  );

  const tree = useMemo(() => buildTree(effectiveRows(base, pend)), [base, pend]);
  const res = useMemo(() => computePlan(tree, {}, at), [tree, at]);
  const dcode = useMemo(() => displayCodes(tree), [tree]);
  const origByKey = useMemo(() => new Map(base.map((r) => [rowKey(r), r] as const)), [base]);

  const dirty = reloading ? 0 : pendingCount(pend);
  useEffect(() => {
    setNavDirty('gazarOgnoo', dirty > 0, tr('Хадгалаагүй газар чөлөөлөлтийн огноо'));
    if (!dirty) return undefined;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => () => setNavDirty('gazarOgnoo', false), []);

  const visible = useMemo(() => {
    const needle = find.trim().toLowerCase();
    if (needle) {
      const hit = new Set<PlanNode>();
      for (const n of tree.nodes) {
        if (!inSection(n)) continue;
        const hay = `${dcode.get(n) ?? ''} ${n.row?.bagts ?? ''} ${n.blok ?? ''} ${nameOf(n)}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        for (let x: PlanNode | null = n; x && x.row; x = x.parent) hit.add(x);
      }
      return tree.nodes.filter((n) => hit.has(n));
    }
    const out: PlanNode[] = [];
    const walk = (p: PlanNode) => {
      for (const c of p.children) {
        if (!inSection(c)) continue;
        out.push(c);
        if (!shut.has(c.code)) walk(c);
      }
    };
    walk(tree.root);
    return out;
  }, [tree, dcode, find, shut]);

  const label = (code: string | null) => {
    const n = code ? tree.byCode.get(code) : undefined;
    return (n && dcode.get(n)) || code || '—';
  };

  const toggle = (code: string) => setShut((sh) => {
    const nx = new Set(sh);
    if (nx.has(code)) nx.delete(code); else nx.add(code);
    return nx;
  });

  const discard = async () => {
    if (locked || !dirty) return;
    if (!(await askConfirm(tr('Хадгалаагүй {0} мөрийн засварыг буцаах уу?', dirty), { ok: tr('Буцаах') }))) return;
    setPend({});
    setErr(null);
    setMsg(null);
  };

  const save = async () => {
    if (locked || !dirty || !canEdit) return;
    setErr(null);
    setMsg(null);
    const e = buildEdits(base, pend, NAMES);
    if (e.issues.length) {
      const list = e.issues.slice(0, 5).map((i) => `${label(i.code)} — ${ISSUE_TEXT[i.kind]()}`);
      if (e.issues.length > list.length) list.push('…');
      setErr(tr('Хадгалах боломжгүй: {0}', list.join('; ')));
      return;
    }
    if (!e.updates.length) { setPend({}); return; }
    setBusy(true);
    try {
      const oids = e.updates.map((u) => Number(u[NAMES.oid]));
      const fresh = (await queryFeatures(CASHFLOW_NEW.url, {
        where: `${CASHFLOW_NEW.oid} IN (${oids.join(',')})`,
        outFields: OUT,
      })).map((r) => toStored(r, NAMES));
      const clash = conflicts(base, fresh, e.updates, NAMES);
      if (clash.length) {
        setErr(tr('Өөр хэрэглэгч энэ хооронд өөрчилсөн байна ({0}). Дахин ачаалж шинэ утгаар засна уу.', clash.slice(0, 5).map(label).join(', ')));
        return;
      }
      const { n } = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: e.updates }, { cap: EDIT_CAP });
      invalidate('CASHFLOW_NEW');
      /* ТТБ-ийн `guitsetgel_huvi` системийн тооцоог дагана — 2026-11-05 */
      schedulePlanSync();
      setPubFrom(rows);
      setMsg(tr('{0} мөр хадгалагдав', n));
    } catch (x) {
      setErr(userError(x));
    } finally {
      setBusy(false);
    }
  };

  const input = (n: PlanNode, f: DateKey) => {
    const o = origByKey.get(rowKey(n.row!))!;
    const v = textOf(pend, o, f);
    const bad = badText(v);
    return (
      <input
        className={`${s.inp} ${s.inpDate} ${pend[rowKey(o)]?.[f] != null ? s.inpDirty : ''} ${bad ? s.inpBad : ''}`}
        value={v}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        readOnly={locked}
        aria-invalid={bad || undefined}
        aria-label={`${dcode.get(n) ?? ''} ${f === 'start' ? tr('Эхлэх') : tr('Дуусах')}`}
        onChange={(e) => {
          if (!canEdit || locked) return;
          const t = e.target.value;
          setMsg(null);
          setPend((p) => setEdit(p, o, f, t));
        }}
      />
    );
  };

  return (
    <div className={s.card}>
      <div className={s.tools}>
        <input
          className={s.search}
          type="search"
          value={find}
          placeholder={tr('Багц, ажлын нэрээр хайх')}
          aria-label={tr('Багц, ажлын нэрээр хайх')}
          onChange={(e) => setFind(e.target.value)}
        />
        <span className={s.spacer} />
        {!canEdit && <span className={s.ro}>{tr('Зөвхөн харах')}</span>}
        <button
          type="button"
          className={s.ghost}
          disabled={locked}
          onClick={() => invalidate('CASHFLOW_NEW')}
          title={tr('Дахин ачаалах')}
          aria-label={tr('Дахин ачаалах')}
        >↻</button>
      </div>

      <div className={s.scroll}>
        <table className={s.tbl}>
          <thead>
            <tr>
              <th>{tr('Д/Д')}</th>
              <th>{tr('Багц')}</th>
              <th>{tr('Ажлын нэр')}</th>
              <th>{tr('Эхлэх')}</th>
              <th>{tr('Дуусах')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const v = res.values.get(n)!;
              const r = n.row!;
              const ed = canEdit && isEditable(n);
              const open = !shut.has(n.code);
              return (
                <tr key={rowKey(r)} className={n.depth === 1 ? s.phaseRow : n.children.length ? s.grpRow : s.leafRow}>
                  <td className={s.code} style={{ paddingLeft: 6 + (n.depth - 1) * 14 }}>
                    {n.children.length > 0 && !find.trim() ? (
                      <button
                        type="button"
                        className={s.tog}
                        aria-expanded={open}
                        aria-label={open ? tr('Хураах') : tr('Дэлгэх')}
                        onClick={() => toggle(n.code)}
                      >{open ? '▾' : '▸'}</button>
                    ) : <span className={s.togSp} aria-hidden />}
                    {dcode.get(n)}
                  </td>
                  <td className={s.pkg}>{[r.bagts, n.blok && n.blok !== r.bagts ? n.blok : null].filter(Boolean).join(' · ')}</td>
                  <td className={s.nm} title={nameOf(n)}>{nameOf(n)}</td>
                  <td>{ed ? input(n, 'start') : (dayOf(v.J) || '—')}</td>
                  <td>{ed ? input(n, 'end') : (dayOf(v.K) || '—')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className={s.hint}>{tr('Тохирох мөр алга.')}</p>}
      </div>

      {canEdit && (
        <div className={s.bar}>
          {err && <span className={s.err} role="alert">{err}</span>}
          {msg && <span className={s.ok} role="status">{msg}</span>}
          <span className={s.spacer} />
          <button type="button" className={s.ghost} disabled={locked || !dirty} onClick={discard}>
            {tr('Буцаах')}
          </button>
          <button type="button" className={s.save} disabled={locked || !dirty} onClick={save}>
            {locked ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', dirty)}
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * ҮЕ ШАТНЫ МЭДЭЭЛЭЛ ОРУУЛАХ 4 ХУУДАС (2026-11-04, хэрэглэгч) — нэг бүрэлдэхүүн, `uyShat.PAGES`-ийн тохиргоогоор:
 * «Захирамж» · «Сонгон шалгаруулалт» · «Зөвшөөрөл (ТТБ)» · «Ашиглалтад оруулах». Бүгд `Guitsetgel_talbe/182`-д
 * хадгалагдана; «Төсөл төлөвлөгөө биелэлт» ба 6 түвшний хуваарь эндээс уншина. Загвар: `GazarOgnoo.tsx` · `ZuragTosol.tsx`.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { pct } from '@/lib/format';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { schedulePlanSync } from '@/lib/projectPlanSync';
import { awaitingReload } from '@/lib/finEdit';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { setNavDirty } from '@/lib/navGuard';
import { askConfirm } from '@/lib/confirm';
import { useAuth } from '@/components/AuthGate';
import { Data, userError } from '@/components/ui';
import { buildTree, computePlan, ubToday, type PlanNode } from '@/lib/projectPlan';
import { EMPTY_PENDING, dayOf, displayCodes, dropAdd, rowKey, toStored, toggleDelete, type Names, type Pending } from '@/lib/zuragTosol';
import {
  PAGES, badText, buildEdits, canAddRow, canDeleteRow, conflicts, editableFields, effectiveRows, fieldLockWhy, pendingCount, rowAdd, rowsOf,
  setEdit, textOf, workNameWhy, type FieldDef, type Issue, type PageKey,
} from '@/lib/uyShat';
import s from './zuragTosol.module.css';

type Row = Record<string, unknown>;

const F = CASHFLOW_NEW.fields;
const NAMES: Names = { oid: CASHFLOW_NEW.oid, cfId: CF_MONTH.id };
const OUT = [
  CASHFLOW_NEW.oid, F.ddKod, F.parentKod, F.level, F.phase, F.pkg, F.block, F.detail, F.budget, F.wSection,
  F.wProject, F.landStart, F.landEnd, F.contractorStart, F.contractorEnd, F.progressPct, CF_MONTH.id,
  F.orderDate, F.orderNo, F.tenderDate, F.contractDate, F.handoverDate,
  /* 2026-11-09: ихрийн «Гэрээлсэн дүн» — `tenderSigned` уншина; алга бол Багц-5.3 · 5.4-ийн явц энд засагдаж үндсэн хүснэгт 100-гаар дардаг байв */
  F.amountNote,
];
const WHERE = `${F.ddKod} IS NOT NULL AND ${CF_MONTH.start} IS NULL`;

const loadRows = cached(async () => ({
  rows: await queryFeatures(CASHFLOW_NEW.url, { where: WHERE, outFields: OUT, orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  at: ubToday(), // 2026-11-05: УБ-ын өдөр — `Date.now()` UTC-ээр таслагдаж 00:00–08:00-д төлөвлөгөө 1 өдөр хоцорч байв
}), 5 * 60_000, ['CASHFLOW_NEW']);

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;
const nameOf = (n: PlanNode): string => String(n.row?.ajil_uilchilgee ?? '');

const TITLE: Record<PageKey, () => string> = {
  zahiramj: () => tr('Захирамж'),
  songon: () => tr('Сонгон шалгаруулалт'),
  zovshoorolTtb: () => tr('Зөвшөөрөл (төлөвлөгөө)'),
  ashiglalt: () => tr('Ашиглалтад оруулах'),
};
const SUB: Record<PageKey, () => string> = {
  zahiramj: () => tr('Багц бүрийн захирамжийн огноо, дугаарыг оруулна. «Төсөл төлөвлөгөө биелэлт» ба 6 түвшний хуваарийн «Захирамж» milestone эндээс бөглөгдөнө.'),
  songon: () => tr('Багц бүрийн сонгон шалгаруулалтын огноо, гэрээ байгуулсан огноо, доод мөрийн явцыг оруулна. Дээд мөрүүдийн явц автоматаар бодогдоно.'),
  zovshoorolTtb: () => tr('Багцын зөвшөөрлийн мөрийн доор зөвшөөрөл бүрийг мөрөөр нэмж, эхлэх, дуусах огноо, явцыг оруулна. Багцын явц зөвшөөрлүүдээс автоматаар бодогдож «Төсөл төлөвлөгөө биелэлт»-д хадгалагдана.'),
  ashiglalt: () => tr('Багц бүрийн ашиглалтад оруулах огноог оруулна.'),
};
const FIELD_LABEL: Record<FieldDef['key'], () => string> = {
  zahiramj_ognoo: () => tr('Захирамжийн огноо'),
  zahiramj_dugaar: () => tr('Захирамжийн дугаар'),
  songon_ognoo: () => tr('Сонгон шалгаруулалтын огноо'),
  geree_ognoo: () => tr('Гэрээ байгуулсан огноо'),
  ashiglalt_ognoo: () => tr('Ашиглалтад оруулах огноо'),
  guits_ehleh: () => tr('Эхлэх'),
  guits_duusah: () => tr('Дуусах'),
  guitsetgel_huvi: () => tr('Явц, %'),
};
const ISSUE_TEXT: Record<Issue['kind'], () => string> = {
  date: () => tr('огноо буруу (YYYY-MM-DD)'),
  pct: () => tr('явц 0–100 биш'),
  order: () => tr('эхлэх огноо дуусахаас хойш'),
  pair: () => tr('эхлэх, дуусах огноог хоёуланг нь оруулна уу'),
  missing: () => tr('мөр олдсонгүй — дахин ачаална уу'),
};

export function UyShatOruulah({ page }: { page: PageKey }) {
  const q = useAsync(loadRows, []);
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <h1 className={s.h1}>{TITLE[page]()}</h1>
        <p className={s.sub}>{SUB[page]()}</p>
      </header>
      <Data q={q} loading={tr('Ачаалж байна…')} minH={240}>
        {(d) => <Body page={page} rows={d.rows} at={d.at} />}
      </Data>
    </div>
  );
}

function Body({ page, rows, at }: { page: PageKey; rows: Row[]; at: number }) {
  const P = PAGES[page];
  const base = useMemo(() => rows.map((r) => toStored(r, NAMES)).filter((r) => r.dd_kod), [rows]);
  const [pend, setPend] = useState<Pending>(EMPTY_PENDING);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);

  const [pubFrom, setPubFrom] = useState<Row[] | null>(null);
  const reloading = awaitingReload(pubFrom, rows);
  if (pubFrom != null && !reloading) {
    setPubFrom(null);
    setPend(EMPTY_PENDING);
  }
  const locked = busy || reloading;

  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const canEdit = useMemo(
    () => hasCap(user?.username, P.cap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN, P.cap],
  );

  const tree = useMemo(() => buildTree(effectiveRows(P, base, pend)), [P, base, pend]);
  const res = useMemo(() => computePlan(tree, {}, at), [tree, at]);
  const dcode = useMemo(() => displayCodes(tree), [tree]);
  const origByKey = useMemo(() => new Map([...base, ...pend.adds].map((r) => [rowKey(r), r] as const)), [base, pend.adds]);
  const addKeys = useMemo(() => new Set(pend.adds.map(rowKey)), [pend.adds]);
  const delSet = useMemo(() => new Set(pend.deletes ?? []), [pend.deletes]);
  const delNames = useMemo(() => (pend.deletes ?? []).map((o) => {
    const r = base.find((x) => x.objectid === o);
    return r ? `${r.bagts ?? ''} · ${r.ajil_uilchilgee ?? ''}`.trim() : String(o);
  }), [base, pend.deletes]);

  const dirty = reloading ? 0 : pendingCount(pend);
  useEffect(() => {
    setNavDirty(page, dirty > 0, tr('Хадгалаагүй засвар: {0}', TITLE[page]()));
    if (!dirty) return undefined;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [page, dirty]);
  useEffect(() => () => setNavDirty(page, false), [page]);

  const all = useMemo(() => rowsOf(P, tree), [P, tree]);
  const visible = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const inPage = new Set(all);
    if (needle) {
      const hit = new Set<PlanNode>();
      for (const n of all) {
        const hay = `${dcode.get(n) ?? ''} ${n.row?.bagts ?? ''} ${n.blok ?? ''} ${nameOf(n)}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        for (let x: PlanNode | null = n; x && x.row && inPage.has(x); x = x.parent) hit.add(x);
      }
      return all.filter((n) => hit.has(n));
    }
    if (!P.phase) return all;
    const out: PlanNode[] = [];
    /* Үе шатны мод — хураасан мөрийн доорхи орохгүй; бусад үе шатны мөр алгасна */
    const walk = (p: PlanNode) => {
      for (const c of p.children) {
        if (!inPage.has(c)) continue;
        out.push(c);
        if (!shut.has(c.code)) walk(c);
      }
    };
    walk(tree.root);
    return out;
  }, [P.phase, all, tree, dcode, find, shut]);

  const label = (code: string | null) => {
    const n = code ? tree.byCode.get(code) : undefined;
    return (n && dcode.get(n)) || code || '—';
  };

  const edit = (n: PlanNode, f: FieldDef, text: string) => {
    if (!canEdit || locked || !n.row) return;
    const o = origByKey.get(rowKey(n.row));
    if (!o) return;
    setMsg(null);
    setPend((p) => setEdit(p, o, f, text));
  };

  const addRow = (n: PlanNode) => {
    if (!canEdit || locked) return;
    const why = workNameWhy(n, newName);
    if (why) {
      setNameErr(why === 'empty' ? tr('Зөвшөөрлийн нэрийг бичнэ үү.') : tr('Энэ мөрийн доор ийм нэртэй мөр байна.'));
      return;
    }
    const add = rowAdd(P, n, tree, newName);
    if (!add) return;
    setMsg(null);
    setNameErr(null);
    setNewName('');
    setPend((p) => ({ ...p, adds: [...p.adds, add] }));
    setShut((sh) => { if (!sh.has(n.code)) return sh; const nx = new Set(sh); nx.delete(n.code); return nx; });
  };

  const toggle = (code: string) => setShut((sh) => {
    const nx = new Set(sh);
    if (nx.has(code)) nx.delete(code); else nx.add(code);
    return nx;
  });

  const discard = async () => {
    if (locked || !dirty) return;
    if (!(await askConfirm(tr('Хадгалаагүй {0} мөрийн засварыг буцаах уу?', dirty), { ok: tr('Буцаах') }))) return;
    setPend(EMPTY_PENDING);
    setErr(null);
    setMsg(null);
  };

  const save = async () => {
    if (locked || !dirty || !canEdit) return;
    setErr(null);
    setMsg(null);
    const e = buildEdits(P, base, pend, NAMES);
    if (e.issues.length) {
      const list = e.issues.slice(0, 5).map((i) => `${label(i.code)} — ${ISSUE_TEXT[i.kind]()}`);
      if (e.issues.length > list.length) list.push('…');
      setErr(tr('Хадгалах боломжгүй: {0}', list.join('; ')));
      return;
    }
    if (!e.updates.length && !e.adds.length && !e.deletes.length) { setPend(EMPTY_PENDING); return; }
    if (e.deletes.length && !(await askConfirm(tr('{0} мөр УСТГАГДАНА (буцаах боломжгүй); үлдсэн мөрүүдийн жин тэнцүү хуваагдана. Хадгалах уу?', e.deletes.length), { ok: tr('Хадгалах'), danger: true }))) return;
    setBusy(true);
    try {
      const oids = [...new Set([...e.updates.map((u) => Number(u[NAMES.oid])), ...e.deletes])];
      const codes = e.adds.map((a) => String(a.dd_kod));
      const parts = [
        ...(oids.length ? [`${CASHFLOW_NEW.oid} IN (${oids.join(',')})`] : []),
        ...(codes.length ? [`${F.ddKod} IN (${codes.map(sqlStr).join(',')})`] : []),
      ];
      const fresh = (await queryFeatures(CASHFLOW_NEW.url, {
        where: `${CF_MONTH.start} IS NULL AND (${parts.join(' OR ')})`,
        outFields: OUT,
        orderBy: `${CASHFLOW_NEW.oid} ASC`,
      })).map((r) => toStored(r, NAMES));
      const clash = conflicts(P, base, fresh.filter((r) => r.objectid != null && oids.includes(r.objectid)), e.updates, NAMES);
      const taken = codes.filter((c) => fresh.some((r) => r.dd_kod === c));
      const gone = e.deletes.filter((o) => !fresh.some((r) => r.objectid === o)).map((o) => base.find((r) => r.objectid === o)?.dd_kod ?? String(o));
      if (clash.length || taken.length || gone.length) {
        setErr(tr('Өөр хэрэглэгч энэ хооронд өөрчилсөн байна ({0}). Дахин ачаалж шинэ утгаар засна уу.',
          [...clash, ...taken, ...gone].slice(0, 5).map(label).join(', ')));
        return;
      }
      const { n } = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: e.updates, adds: e.adds, deletes: e.deletes }, { cap: P.cap });
      invalidate('CASHFLOW_NEW');
      /* ТТБ-ийн `guitsetgel_huvi` (эцэг мөрүүд ч) системийн тооцоог дагана — 2026-11-05 */
      schedulePlanSync();
      setPubFrom(rows);
      setMsg(tr('{0} мөр хадгалагдав', n));
    } catch (x) {
      setErr(userError(x));
    } finally {
      setBusy(false);
    }
  };

  if (!base.length || !all.length) {
    return (
      <div className={s.notice}>
        <b>{tr('Мөр хараахан алга байна.')}</b>
        <p>{tr('Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг санхүүжилтийн хүснэгтэд оруулсны дараа энд харагдана.')}</p>
      </div>
    );
  }

  const input = (n: PlanNode, f: FieldDef) => {
    const o = origByKey.get(rowKey(n.row!))!;
    const v = textOf(pend, o, f);
    const changed = (pend.edits[rowKey(o)] as Record<string, string> | undefined)?.[f.key] != null;
    const bad = badText(f, v);
    return (
      <input
        className={`${s.inp} ${f.kind === 'date' ? s.inpDate : f.kind === 'pct' ? s.inpPct : s.inpName} ${changed ? s.inpDirty : ''} ${bad ? s.inpBad : ''}`}
        value={v}
        placeholder={f.kind === 'date' ? 'YYYY-MM-DD' : f.kind === 'pct' ? '0–100' : ''}
        inputMode={f.kind === 'pct' ? 'decimal' : f.kind === 'date' ? 'numeric' : 'text'}
        readOnly={locked}
        aria-invalid={bad || undefined}
        aria-label={`${dcode.get(n) ?? ''} ${FIELD_LABEL[f.key]()}`}
        onChange={(e) => edit(n, f, e.target.value)}
      />
    );
  };

  const cols = P.fields;
  const showPct = !!P.phase;

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
              {cols.map((f) => <th key={f.key} className={f.kind === 'pct' ? s.r : undefined}>{FIELD_LABEL[f.key]()}</th>)}
              {showPct && <th className={s.r}>{tr('Явц')}</th>}
              {canEdit && P.addRows && <th aria-label={tr('Үйлдэл')} />}
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const r = n.row!;
              const k = rowKey(r);
              const v = res.values.get(n)!;
              const isNew = addKeys.has(k);
              const open = !shut.has(n.code);
              const fields = canEdit ? editableFields(P, n) : [];
              const canAdd = canEdit && canAddRow(P, n);
              const formOpen = canAdd && adding === k;
              const depth = P.phase ? n.depth : 1;
              return (
                <Fragment key={k}>
                  <tr className={`${depth === 1 && P.phase ? s.phaseRow : n.children.length && P.phase ? s.grpRow : s.leafRow} ${isNew ? s.newRow : ''}`}>
                    <td className={s.code} style={{ paddingLeft: 6 + (depth - 1) * 14 }}>
                      {P.phase && n.children.length > 0 && !find.trim() ? (
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
                    <td className={s.nm} title={nameOf(n)}>
                      {nameOf(n)}
                      {isNew && <span className={s.badge}>{tr('шинэ')}</span>}
                    </td>
                    {cols.map((f) => {
                      /* Оруулсан утгатай нүд түгжигдсэн ч нээлттэй үлдэнэ — алдаатай оруулга харагдахгүй болж хадгалалтыг хааж болохгүй */
                      const ed = fields.includes(f) || (pend.edits[k] as Record<string, string> | undefined)?.[f.key] != null;
                      const raw = r[f.key];
                      const shown = f.kind === 'date' ? (dayOf(raw as number | null) || '—')
                        : f.kind === 'pct' ? pct(v.S, 1) : (raw == null || raw === '' ? '—' : String(raw));
                      return <td key={f.key} className={f.kind === 'pct' ? s.r : undefined} title={ed ? undefined : fieldLockWhy(n, f) ?? undefined}>{ed ? input(n, f) : shown}</td>;
                    })}
                    {showPct && <td className={s.r}>{pct(v.S, 1)}</td>}
                    {canEdit && P.addRows && (
                      <td className={s.act}>
                        {canAdd && (
                          <button
                            type="button"
                            className={s.add}
                            disabled={locked}
                            aria-expanded={formOpen}
                            title={tr('Энэ багцын доор зөвшөөрлийн мөр нэмнэ — багцын явц зөвшөөрлүүдээс бодогдоно')}
                            onClick={() => { setNameErr(null); setNewName(''); setAdding(formOpen ? null : k); }}
                          >{tr('+ Зөвшөөрөл нэмэх')}</button>
                        )}
                        {isNew && (
                          <button
                            type="button"
                            className={s.rm}
                            disabled={locked}
                            title={tr('Нэмэхээ болих')}
                            aria-label={tr('Нэмэхээ болих')}
                            onClick={() => setPend((p) => dropAdd(p, origByKey.get(k)!))}
                          >✕</button>
                        )}
                        {!isNew && canDeleteRow(P, n) && (
                          <button
                            type="button"
                            className={s.rm}
                            disabled={locked}
                            title={tr('Энэ зөвшөөрлийн мөрийг устгах (хадгалахад)')}
                            aria-label={tr('Устгах')}
                            onClick={() => { setMsg(null); setPend((p) => toggleDelete(p, origByKey.get(k)!)); }}
                          >{tr('Устгах')}</button>
                        )}
                      </td>
                    )}
                  </tr>
                  {formOpen && (
                    <tr className={s.addForm}>
                      <td colSpan={4 + cols.length + (showPct ? 1 : 0)}>
                        <div className={s.addFormIn} role="group" aria-label={tr('Зөвшөөрөл нэмэх')}>
                          <input
                            className={`${s.inp} ${s.inpName}`}
                            value={newName}
                            autoFocus
                            placeholder={tr('Зөвшөөрлийн нэр')}
                            aria-label={tr('Зөвшөөрлийн нэр')}
                            readOnly={locked}
                            onChange={(e) => { setNameErr(null); setNewName(e.target.value); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); addRow(n); }
                              else if (e.key === 'Escape') { e.preventDefault(); setAdding(null); }
                            }}
                          />
                          <button type="button" className={s.add} disabled={locked} onClick={() => addRow(n)}>{tr('Нэмэх')}</button>
                          <button type="button" className={s.rm} disabled={locked} onClick={() => setAdding(null)}>{tr('Болих')}</button>
                          {nameErr && <span className={s.err} role="alert">{nameErr}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className={s.hint}>{tr('Тохирох мөр алга.')}</p>}
        {delSet.size > 0 && (
          <p className={s.warnNote} role="status">
            {tr('Устгахаар тэмдэглэсэн {0} мөр: {1} — «Хадгалах» дарахад устгагдана, «Буцаах» дарвал сэргэнэ.', delSet.size, delNames.join('; '))}
          </p>
        )}
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

export const Zahiramj = () => <UyShatOruulah page="zahiramj" />;
export const Songon = () => <UyShatOruulah page="songon" />;
export const ZovshoorolTtb = () => <UyShatOruulah page="zovshoorolTtb" />;
export const Ashiglalt = () => <UyShatOruulah page="ashiglalt" />;

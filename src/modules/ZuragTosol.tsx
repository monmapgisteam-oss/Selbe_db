'use client';

/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ — Excel-ийн шатлалаар (`CASHFLOW_NEW`, `dd_kod`) хоёр үе шатын навч мөрийн
 * төлөвлөгөөт огноо (Гэрээ/Хавсралт 5 — `geree_ehleh`/`geree_duusah`) ба явцыг (`guitsetgel_huvi`, 0–100)
 * шинэчлэх хэсэг (2026-10-26, cf-spec «Бусад»).
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { pct } from '@/lib/format';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { awaitingReload } from '@/lib/finEdit';
import { hasCap, subscribeCaps, type CapKey } from '@/lib/caps';
import { setNavDirty } from '@/lib/navGuard';
import { askConfirm } from '@/lib/confirm';
import { useAuth } from '@/components/AuthGate';
import { Data, userError } from '@/components/ui';
import { buildTree, computePlan, saneDate, type PlanNode } from '@/lib/projectPlan';
import {
  EMPTY_PENDING, badText, buildEdits, conflicts, dayOf, displayCodes, dropAdd, effectiveRows, inSection,
  isEditable, isSubstage, pendingCount, rowKey, setEdit, substageAdds, substageInfo, textOf, toStored,
  zeroWeight, type EditIssue, type FieldKey, type Names, type Pending,
} from '@/lib/zuragTosol';
import s from './zuragTosol.module.css';

type Row = Record<string, unknown>;

/**
 * ЗАСАХ ЭРХ. 2026-10-26: `CapKey`-д `zuragEdit` төвд (caps.ts) нэмэгдэх хүртэл төрлийн хувиргалт —
 *    бүртгэгдээгүй түлхүүрийг `hasCap`/`requireCap` ОЛГООГҮЙ гэж үзнэ (fail-closed), тиймээс аюулгүй.
 */
const ZURAG_CAP: CapKey = 'zuragEdit';

const F = CASHFLOW_NEW.fields;
const NAMES: Names = { oid: CASHFLOW_NEW.oid, cfId: CF_MONTH.id };
/** Уншиж/дахин шалгах талбарууд — `zuragTosol.toStored`-ийн түлхүүрүүд */
const OUT = [
  CASHFLOW_NEW.oid, F.ddKod, F.parentKod, F.level, F.phase, F.pkg, F.block, F.detail, F.budget, F.wSection,
  F.wProject, F.contractStart, F.contractEnd, F.landStart, F.landEnd, F.contractorStart, F.contractorEnd,
  F.progressPct, CF_MONTH.id,
];
/** Excel-ийн мөр (мөнгөний + бүтцийн); сарын мөр хасагдана */
const WHERE = `${F.ddKod} IS NOT NULL AND ${CF_MONTH.start} IS NULL`;

const loadRows = cached(async () => ({
  rows: await queryFeatures(CASHFLOW_NEW.url, { where: WHERE, outFields: OUT, orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  at: Date.now(),
}), 5 * 60_000, ['CASHFLOW_NEW']);

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

/**
 * Дэд шатны нэрийн орчуулга — хадгалсан нэр монгол (`DESIGN_SUBSTAGES`); i18n-extract статик `tr()`-ийг
 * л олдог тул нэг бүрчлэн бичнэ.
 */
const SUB_TEXT: Record<string, () => string> = {
  'А-даалгавар': () => tr('А-даалгавар'),
  'Загвар зураг': () => tr('Загвар зураг'),
  'Техникийн нөхцөл': () => tr('Техникийн нөхцөл'),
  'Магадлал': () => tr('Магадлал'),
};
const nameOf = (n: PlanNode): string => {
  const raw = String(n.row?.ajil_uilchilgee ?? '');
  return isSubstage(n) ? (SUB_TEXT[raw]?.() ?? raw) : raw;
};

const ISSUE_TEXT: Record<EditIssue['kind'], () => string> = {
  date: () => tr('огноо буруу (YYYY-MM-DD)'),
  pct: () => tr('явц 0–100 биш'),
  order: () => tr('эхлэх огноо дуусахаас хойш'),
  pair: () => tr('эхлэх, дуусах огноог хоёуланг нь оруулна уу'),
  missing: () => tr('мөр олдсонгүй — дахин ачаална уу'),
};

type PhaseFilter = 'all' | 'tezu' | 'zurag';

/** Навчны огноо хоосон бол төлөвлөгөөт % хамгийн ойрын өвөг мөрийн огноогоор бодогддог — placeholder-т харуулна */
function inherited(n: PlanNode): [number | null, number | null] {
  for (let x = n.parent; x && x.row; x = x.parent) {
    const a = saneDate(x.row.geree_ehleh);
    const b = saneDate(x.row.geree_duusah);
    if (a != null && b != null) return [a, b];
  }
  return [null, null];
}

export function ZuragTosol() {
  const q = useAsync(loadRows, []);
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <h1 className={s.h1}>{tr('ТЭЗҮ · Ажлын зураг төсөл')}</h1>
        <p className={s.sub}>
          {tr('Үе шатын навч мөрийн төлөвлөгөөт хугацаа ба гүйцэтгэлийн хувийг шинэчилнэ. Дээд мөрүүд Excel-ийн томьёогоор автоматаар бодогдоно.')}
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
  const [pend, setPend] = useState<Pending>(EMPTY_PENDING);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [find, setFind] = useState('');
  /** Хураасан мөрүүд (`dd_kod`) */
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());

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
    () => hasCap(user?.username, ZURAG_CAP),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN],
  );

  /* Урьдчилсан мод — засвар + шинэ дэд шат оролцсон; эцгийн утга шууд дахин бодогдоно */
  const tree = useMemo(() => buildTree(effectiveRows(base, pend)), [base, pend]);
  const res = useMemo(() => computePlan(tree, {}, at), [tree, at]);
  const dcode = useMemo(() => displayCodes(tree), [tree]);
  /** Анхны мөр (засваргүй) — `setEdit`/`textOf` анхны утгатай харьцуулна */
  const origByKey = useMemo(
    () => new Map([...base, ...pend.adds].map((r) => [rowKey(r), r] as const)),
    [base, pend.adds],
  );
  const addKeys = useMemo(() => new Set(pend.adds.map(rowKey)), [pend.adds]);
  const phases = tree.root.children.filter(inSection);

  const dirty = reloading ? 0 : pendingCount(pend);
  useEffect(() => {
    setNavDirty('zuragTosol', dirty > 0, tr('Хадгалаагүй ТЭЗҮ, зураг төслийн засвар'));
    if (!dirty) return undefined;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => () => setNavDirty('zuragTosol', false), []);

  /** Харагдах мөрүүд — үе шатын шүүлт, хайлт (тааралдсан мөр + өвгүүд), хураалт */
  const visible = useMemo(() => {
    const want = (n: PlanNode) => (phase === 'all' ? inSection(n) : n.phase === phase);
    const needle = find.trim().toLowerCase();
    if (needle) {
      const hit = new Set<PlanNode>();
      for (const n of tree.nodes) {
        if (!want(n)) continue;
        const hay = `${dcode.get(n) ?? ''} ${n.row?.bagts ?? ''} ${n.blok ?? ''} ${nameOf(n)}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        for (let x: PlanNode | null = n; x && x.row; x = x.parent) hit.add(x);
      }
      return tree.nodes.filter((n) => hit.has(n));
    }
    const out: PlanNode[] = [];
    const walk = (p: PlanNode) => {
      for (const c of p.children) {
        if (!want(c)) continue;
        out.push(c);
        if (!shut.has(c.code)) walk(c);
      }
    };
    walk(tree.root);
    return out;
  }, [tree, dcode, phase, find, shut]);

  const label = (code: string | null) => {
    const n = code ? tree.byCode.get(code) : undefined;
    return (n && dcode.get(n)) || code || '—';
  };

  const edit = (n: PlanNode, f: FieldKey, text: string) => {
    if (!canEdit || locked || !n.row) return;
    const o = origByKey.get(rowKey(n.row));
    if (!o) return;
    setMsg(null);
    setPend((p) => setEdit(p, o, f, text));
  };

  const addSubs = (n: PlanNode) => {
    if (!canEdit || locked) return;
    const adds = substageAdds(n, tree);
    if (!adds.length) return;
    setMsg(null);
    setPend((p) => ({ ...p, adds: [...p.adds, ...adds] }));
    /* Нэмсэн мөрүүд харагдана — хураасан бол дэлгэнэ */
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
    const e = buildEdits(base, pend, NAMES);
    if (e.issues.length) {
      const list = e.issues.slice(0, 5).map((i) => `${label(i.code)} — ${ISSUE_TEXT[i.kind]()}`);
      if (e.issues.length > list.length) list.push('…');
      setErr(tr('Хадгалах боломжгүй: {0}', list.join('; ')));
      return;
    }
    if (!e.updates.length && !e.adds.length) { setPend(EMPTY_PENDING); return; }
    const zero = e.adds.filter((a) => zeroWeight(a as { heseg_ezleh_huvi: number | null })).length;
    if (e.adds.length && !(await askConfirm(
      [
        tr('{0} шинэ дэд шатны мөр нэмэгдэнэ. Нэмсний дараа эцэг мөрийн явц дэд шатуудаас бодогдоно. Хадгалах уу?', e.adds.length),
        ...(zero ? [tr('Анхааруулга: {0} дэд шатны жин 0% — бусад дэд шат 100%-ийг эзэлсэн тул тэдгээрийн явц эцэг мөрөнд нөлөөлөхгүй. Жинг Excel-ээр засна уу.', zero)] : []),
      ].join(' '),
      { ok: tr('Хадгалах') },
    ))) return;
    setBusy(true);
    try {
      const oids = e.updates.map((u) => Number(u[NAMES.oid]));
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
      const clash = conflicts(base, fresh.filter((r) => r.objectid != null && oids.includes(r.objectid)), e.updates, NAMES);
      const taken = codes.filter((c) => fresh.some((r) => r.dd_kod === c));
      if (clash.length || taken.length) {
        setErr(tr('Өөр хэрэглэгч энэ хооронд өөрчилсөн байна ({0}). Дахин ачаалж шинэ утгаар засна уу.',
          [...clash, ...taken].slice(0, 5).map(label).join(', ')));
        return;
      }
      const { n } = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: e.updates, adds: e.adds }, { cap: ZURAG_CAP });
      invalidate('CASHFLOW_NEW');
      setPubFrom(rows);
      setMsg(tr('{0} мөр хадгалагдав', n));
    } catch (x) {
      setErr(userError(x));
    } finally {
      setBusy(false);
    }
  };

  if (!base.length || !phases.length) {
    return (
      <div className={s.notice}>
        <b>{tr('ТЭЗҮ, ажлын зураг төслийн мөр хараахан алга байна.')}</b>
        <p>{tr('Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг санхүүжилтийн хүснэгтэд оруулсны дараа энд харагдана.')}</p>
      </div>
    );
  }

  const input = (n: PlanNode, f: FieldKey, cls: string, ph?: string) => {
    const o = origByKey.get(rowKey(n.row!))!;
    const v = textOf(pend, o, f);
    const pe = pend.edits[rowKey(o)];
    const changed = pe?.[f] != null;
    const r = n.row!;
    const lonely = f !== 'pct' && (pe?.start != null || pe?.end != null)
      && (saneDate(r.geree_ehleh) == null) !== (saneDate(r.geree_duusah) == null)
      && saneDate(f === 'start' ? r.geree_ehleh : r.geree_duusah) == null;
    const bad = badText(f, v) || lonely;
    return (
      <input
        className={`${s.inp} ${cls} ${changed ? s.inpDirty : ''} ${bad ? s.inpBad : ''}`}
        value={v}
        placeholder={ph}
        inputMode={f === 'pct' ? 'decimal' : 'numeric'}
        readOnly={locked}
        aria-invalid={bad || undefined}
        aria-label={`${dcode.get(n) ?? ''} ${f === 'start' ? tr('Эхлэх') : f === 'end' ? tr('Дуусах') : tr('Гүйцэтгэл, %')}`}
        onChange={(e) => edit(n, f, e.target.value)}
      />
    );
  };

  return (
    <>
      {/* Үе шат бүрийн нийт — Excel-ийн үе шатын мөр */}
      <div className={s.stats}>
        {phases.map((p) => {
          const v = res.values.get(p)!;
          return (
            <div key={p.code} className={s.stat}>
              <span className={s.statK}>{nameOf(p)}</span>
              <span className={s.statV}>{pct(v.S, 1)}</span>
              <span className={s.statS}>
                {tr('Төлөвлөгөө {0} · Биелэлт {1}', pct(v.N, 1), pct(v.T, 1))}
              </span>
            </div>
          );
        })}
      </div>

      <div className={s.card}>
        <div className={s.tools}>
          <div className={s.seg} role="tablist" aria-label={tr('Үе шат')}>
            {([['all', tr('Бүгд')], ['tezu', tr('ТЭЗҮ')], ['zurag', tr('Ажлын зураг төсөл')]] as [PhaseFilter, string][]).map(([k, t]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={phase === k}
                className={`${s.segB} ${phase === k ? s.segOn : ''}`}
                onClick={() => setPhase(k)}
              >{t}</button>
            ))}
          </div>
          <input
            className={s.search}
            type="search"
            value={find}
            placeholder={tr('Багц, ажлын нэрээр хайх')}
            aria-label={tr('Багц, ажлын нэрээр хайх')}
            onChange={(e) => setFind(e.target.value)}
          />
          <span className={s.spacer} />
          {tree.issues.length > 0 && (
            <span className={s.warnNote} title={tree.issues.slice(0, 20).join('\n')}>
              {tr('Бүтцийн анхааруулга: {0}', tree.issues.length)}
            </span>
          )}
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
                <th className={s.r} title={tr('Хэсэгт эзлэх хувь')}>{tr('Жин')}</th>
                <th>{tr('Эхлэх')}</th>
                <th>{tr('Дуусах')}</th>
                <th className={s.r}>{tr('Төлөвлөгөө')}</th>
                <th className={s.r}>{tr('Гүйцэтгэл')}</th>
                <th className={s.r}>{tr('Биелэлт')}</th>
                {canEdit && <th aria-label={tr('Үйлдэл')} />}
              </tr>
            </thead>
            <tbody>
              {visible.map((n) => {
                const v = res.values.get(n)!;
                const r = n.row!;
                const k = rowKey(r);
                const isNew = addKeys.has(k);
                const leaf = isEditable(n);
                const ed = canEdit && leaf;
                const open = !shut.has(n.code);
                const sub = canEdit ? substageInfo(n) : null;
                const [ia, ib] = ed && (saneDate(r.geree_ehleh) == null || saneDate(r.geree_duusah) == null) ? inherited(n) : [null, null];
                return (
                  <tr
                    key={k}
                    className={`${n.depth === 1 ? s.phaseRow : n.children.length ? s.grpRow : s.leafRow} ${isNew ? s.newRow : ''}`}
                  >
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
                    <td className={s.nm} title={nameOf(n)}>
                      {nameOf(n)}
                      {isNew && <span className={s.badge}>{tr('шинэ')}</span>}
                    </td>
                    <td className={s.r}>
                      {isNew && zeroWeight(r) ? (
                        <span className={s.warnNote} title={tr('Жин 0% — бусад дэд шат 100%-ийг эзэлсэн тул энэ дэд шатны явц эцэг мөрөнд нөлөөлөхгүй. Жинг Excel-ээр засна уу.')}>
                          ⚠ {pct(v.F, 1)}
                        </span>
                      ) : pct(v.F, 1)}
                    </td>
                    <td>{ed ? input(n, 'start', s.inpDate, dayOf(ia) || 'YYYY-MM-DD') : (dayOf(v.H) || '—')}</td>
                    <td>{ed ? input(n, 'end', s.inpDate, dayOf(ib) || 'YYYY-MM-DD') : (dayOf(v.I) || '—')}</td>
                    <td className={s.r}>{pct(v.N, 1)}</td>
                    <td className={s.r}>{ed ? input(n, 'pct', s.inpPct) : pct(v.S, 1)}</td>
                    <td className={s.r}>{pct(v.T, 1)}</td>
                    {canEdit && (
                      <td className={s.act}>
                        {sub?.can && (
                          <button
                            type="button"
                            className={s.add}
                            disabled={locked}
                            title={sub.missing.map((m) => SUB_TEXT[m]?.() ?? m).join(' · ')}
                            onClick={() => addSubs(n)}
                          >{tr('+ Дэд шат ({0})', sub.missing.length)}</button>
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
                      </td>
                    )}
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
    </>
  );
}

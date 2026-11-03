'use client';

/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ — Excel-ийн шатлалаар (`CASHFLOW_NEW`, `dd_kod`) хоёр үе шатын навч мөрийн
 * төлөвлөгөөт огноо (Гэрээ/Хавсралт 5 — `geree_ehleh`/`geree_duusah`) ба явцыг (`guitsetgel_huvi`, 0–100)
 * шинэчлэх хэсэг (2026-10-26, cf-spec «Бусад»).
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { awaitingReload, parseCell } from '@/lib/finEdit';
import { hasCap, subscribeCaps, type CapKey } from '@/lib/caps';
import { setNavDirty } from '@/lib/navGuard';
import { askConfirm } from '@/lib/confirm';
import { useAuth } from '@/components/AuthGate';
import { Data, userError } from '@/components/ui';
import { buildTree, computePlan, saneDate, type PlanNode } from '@/lib/projectPlan';
import {
  EMPTY_PENDING, badText, buildEdits, canAddWork, canDelete, conflicts, dayOf, displayCodes, dropAdd, effectiveRows,
  inSection, isAddedWork, isEditable, origText, pctOfAmount, pendingCount, rowKey, setEdit, textOf, toStored, toggleDelete,
  workAdd, workNameWhy, worksWeightSum, type EditIssue, type FieldKey, type Names, type Pending,
} from '@/lib/zuragTosol';
import { PARSE_MSG } from './PlanEntry';
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

const nameOf = (n: PlanNode): string => String(n.row?.ajil_uilchilgee ?? '');

/** Нэмсэн ажлуудын жингийн нийлбэр 100%-аас зөрөх хүлцэл (%) */
const SUM_TOL = 0.01;

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
  const delSet = useMemo(() => new Set(pend.deletes ?? []), [pend.deletes]);
  /** «+ Ажил нэмэх» нээлттэй эцэг мөр (`dd_kod`) ба бичиж буй нэр; дүнгийн оролтын ноорог (мөрийн түлхүүрээр) */
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [amt, setAmt] = useState<Record<string, string>>({});
  /** Нэмсэн ажлуудын жингийн нийлбэр 100% биш эцэг мөрүүд */
  const badSums = useMemo(() => tree.nodes.filter((n) => {
    const sm = worksWeightSum(n, (c) => res.values.get(c)?.F);
    return sm != null && Math.abs(sm - 100) > SUM_TOL;
  }), [tree, res]);
  /** Устгахаар тэмдэглэсэн мөрүүд — урьдчилсан модноос хасагдсан тул жагсаалтын доор нэрээр */
  const delNames = useMemo(() => (pend.deletes ?? []).map((o) => {
    const r = base.find((x) => x.objectid === o);
    return r ? `${r.bagts ?? ''} · ${r.ajil_uilchilgee ?? ''}`.trim() : String(o);
  }), [base, pend.deletes]);
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

  /** Шинэ ажил нэмэх — нэрээр; жин нь эцгийн доорх бүх нэмсэн ажилд тэнцүү хуваагдана */
  const addWork = (n: PlanNode) => {
    if (!canEdit || locked) return;
    const why = workNameWhy(n, newName);
    if (why) {
      setNameErr(why === 'empty' ? tr('Ажлын нэрийг бичнэ үү.') : tr('Энэ мөрийн доор ийм нэртэй ажил байна.'));
      return;
    }
    const add = workAdd(n, tree, newName);
    if (!add) return;
    setMsg(null);
    setNameErr(null);
    setNewName('');
    setPend((p) => ({ ...p, adds: [...p.adds, add] }));
    /* Нэмсэн мөр харагдана — хураасан бол дэлгэнэ */
    setShut((sh) => { if (!sh.has(n.code)) return sh; const nx = new Set(sh); nx.delete(n.code); return nx; });
  };

  /** Нэмсэн ажлын төсвийг ДҮНГЭЭР бичих — эцгийн оноосон төсвийн хувь болгож жинд бичнэ */
  const commitAmount = (n: PlanNode) => {
    const k = rowKey(n.row!);
    const text = amt[k];
    if (text == null) return;
    setAmt((a) => { const nx = { ...a }; delete nx[k]; return nx; });
    if (!text.trim()) return;
    let v: number | null;
    try {
      v = parseCell(text, 'esriFieldTypeDouble', tr('Төсөвт өртөг'), PARSE_MSG) as number | null;
    } catch (e) {
      setErr(userError(e));
      return;
    }
    if (v == null) return;
    const p = pctOfAmount(v, n.parent ? res.values.get(n.parent)?.EA : null);
    if (p == null) { setErr(tr('Эцэг мөрийн төсөвт өртөг алга — жинг хувиар оруулна уу.')); return; }
    if (p > 100) { setErr(tr('Дүн эцэг мөрийн төсөвт өртгөөс их байна.')); return; }
    setErr(null);
    edit(n, 'weight', String(p));
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
    if (!e.updates.length && !e.adds.length && !e.deletes.length) { setPend(EMPTY_PENDING); return; }
    const ask = [
      ...(e.adds.length ? [tr('{0} шинэ ажил нэмэгдэнэ. Нэмсний дараа эцэг мөрийн явц ажлуудаас бодогдоно.', e.adds.length)] : []),
      ...(e.deletes.length ? [tr('{0} нэмсэн ажлын мөр УСТГАГДАНА (буцаах боломжгүй); үлдсэн ажлуудын жин тэнцүү хуваагдана.', e.deletes.length)] : []),
      ...(badSums.length ? [tr('Анхааруулга: {0} мөрийн доорх ажлуудын жингийн нийлбэр 100% биш — ажлуудын төсвийн нийлбэр эцэг мөрийн төсөвтэй тэнцэхгүй.', badSums.map((n) => dcode.get(n) ?? n.code).join(', '))] : []),
    ];
    if (ask.length && !(await askConfirm(`${ask.join(' ')} ${tr('Хадгалах уу?')}`, { ok: tr('Хадгалах'), danger: e.deletes.length > 0 }))) return;
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
      const clash = conflicts(base, fresh.filter((r) => r.objectid != null && oids.includes(r.objectid)), e.updates, NAMES);
      const taken = codes.filter((c) => fresh.some((r) => r.dd_kod === c));
      /* Устгах мөр серверт байхгүй / мөнгөтэй болсон (өөр хүн) бол устгахгүй */
      const goneOrMoney = e.deletes.filter((o) => { const f = fresh.find((r) => r.objectid === o); return !f || f.cashflow_id != null; })
        .map((o) => base.find((r) => r.objectid === o)?.dd_kod ?? String(o));
      if (clash.length || taken.length || goneOrMoney.length) {
        setErr(tr('Өөр хэрэглэгч энэ хооронд өөрчилсөн байна ({0}). Дахин ачаалж шинэ утгаар засна уу.',
          [...clash, ...taken, ...goneOrMoney].slice(0, 5).map(label).join(', ')));
        return;
      }
      const { n } = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: e.updates, adds: e.adds, deletes: e.deletes }, { cap: ZURAG_CAP });
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
    const pe = pend.edits[rowKey(o)];
    /* Жин бичээгүй бол урьдчилсан модны (тэнцүү хуваасан) жин */
    const v = f === 'weight' && pe?.weight == null ? origText(n.row!, 'weight') : textOf(pend, o, f);
    const changed = pe?.[f] != null;
    const r = n.row!;
    const lonely = (f === 'start' || f === 'end') && (pe?.start != null || pe?.end != null)
      && (saneDate(r.geree_ehleh) == null) !== (saneDate(r.geree_duusah) == null)
      && saneDate(f === 'start' ? r.geree_ehleh : r.geree_duusah) == null;
    const bad = badText(f, v) || lonely;
    return (
      <input
        className={`${s.inp} ${cls} ${changed ? s.inpDirty : ''} ${bad ? s.inpBad : ''}`}
        value={v}
        placeholder={ph}
        inputMode={f === 'pct' || f === 'weight' ? 'decimal' : 'numeric'}
        readOnly={locked}
        aria-invalid={bad || undefined}
        aria-label={`${dcode.get(n) ?? ''} ${f === 'start' ? tr('Эхлэх') : f === 'end' ? tr('Дуусах') : f === 'weight' ? tr('Жин, %') : tr('Гүйцэтгэл, %')}`}
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
                <th className={s.r} title={tr('Урьдчилсан төсөвт өртөг — бүдэг налуу нь эцэг мөрийн төсвөөс жингээр оноосон дүн')}>{tr('Төсөвт өртөг')}</th>
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
                const work = isAddedWork(n);
                const canAdd = canEdit && canAddWork(n);
                const formOpen = canAdd && adding === k;
                const wsum = worksWeightSum(n, (c) => res.values.get(c)?.F);
                const sumBad = wsum != null && Math.abs(wsum - 100) > SUM_TOL;
                const money = v.E ?? v.EA;
                const [ia, ib] = ed && (saneDate(r.geree_ehleh) == null || saneDate(r.geree_duusah) == null) ? inherited(n) : [null, null];
                return (
                  <Fragment key={k}>
                  <tr
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
                      {sumBad && (
                        <span className={s.warnNote} title={tr('Доорх ажлуудын жингийн нийлбэр 100% байх ёстой — эс бөгөөс ажлуудын төсвийн нийлбэр энэ мөрийн төсөвтэй тэнцэхгүй.')}>
                          ⚠ {tr('Ажлуудын жин {0}', pct(wsum, 1))}
                        </span>
                      )}
                    </td>
                    <td className={s.r}>{ed && work ? input(n, 'weight', s.inpPct) : pct(v.F, 1)}</td>
                    <td className={s.r}>
                      {ed && work ? (
                        <input
                          className={`${s.inp} ${s.inpAmt} ${pend.edits[k]?.weight != null ? s.inpDirty : ''}`}
                          value={amt[k] ?? (money == null ? '' : String(Math.round(money)))}
                          placeholder="—"
                          inputMode="decimal"
                          readOnly={locked}
                          aria-label={`${dcode.get(n) ?? ''} ${tr('Төсөвт өртөг')}`}
                          title={tr('Дүн бичвэл эцэг мөрийн төсвийн хувь болж жинд бичигдэнэ')}
                          onChange={(e) => { const t = e.target.value; setAmt((a) => ({ ...a, [k]: t })); }}
                          onBlur={() => commitAmount(n)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitAmount(n); }
                            else if (e.key === 'Escape') { e.preventDefault(); setAmt((a) => { const nx = { ...a }; delete nx[k]; return nx; }); }
                          }}
                        />
                      ) : money == null ? '—' : (
                        <span className={v.E == null ? s.alloc : undefined} title={v.E == null ? tr('Эцэг мөрийн төсвөөс жингээр оноосон') : undefined}>
                          {num(money)}
                        </span>
                      )}
                    </td>
                    <td>{ed ? input(n, 'start', s.inpDate, dayOf(ia) || 'YYYY-MM-DD') : (dayOf(v.H) || '—')}</td>
                    <td>{ed ? input(n, 'end', s.inpDate, dayOf(ib) || 'YYYY-MM-DD') : (dayOf(v.I) || '—')}</td>
                    <td className={s.r}>{pct(v.N, 1)}</td>
                    <td className={s.r}>{ed ? input(n, 'pct', s.inpPct) : pct(v.S, 1)}</td>
                    <td className={s.r}>{pct(v.T, 1)}</td>
                    {canEdit && (
                      <td className={s.act}>
                        {canAdd && (
                          <button
                            type="button"
                            className={s.add}
                            disabled={locked}
                            aria-expanded={formOpen}
                            title={tr('Энэ мөрийн доор нэр бичиж ажил нэмнэ — жин нь ажлуудад тэнцүү хуваагдана')}
                            onClick={() => { setNameErr(null); setNewName(''); setAdding(formOpen ? null : k); }}
                          >{tr('+ Ажил нэмэх')}</button>
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
                        {!isNew && canDelete(n) && (
                          <button
                            type="button"
                            className={s.rm}
                            disabled={locked}
                            title={tr('Энэ нэмсэн ажлын мөрийг устгах (хадгалахад)')}
                            aria-label={tr('Устгах')}
                            onClick={() => { setMsg(null); setPend((p) => toggleDelete(p, origByKey.get(k)!)); }}
                          >{tr('Устгах')}</button>
                        )}
                      </td>
                    )}
                  </tr>
                  {formOpen && (
                    <tr className={s.addForm}>
                      <td colSpan={11}>
                        <div className={s.addFormIn} role="group" aria-label={tr('Ажил нэмэх')}>
                          <input
                            className={`${s.inp} ${s.inpName}`}
                            value={newName}
                            autoFocus
                            placeholder={tr('Ажлын нэр')}
                            aria-label={tr('Ажлын нэр')}
                            readOnly={locked}
                            onChange={(e) => { setNameErr(null); setNewName(e.target.value); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); addWork(n); }
                              else if (e.key === 'Escape') { e.preventDefault(); setAdding(null); }
                            }}
                          />
                          <button type="button" className={s.add} disabled={locked} onClick={() => addWork(n)}>{tr('Нэмэх')}</button>
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
          <p className={s.hint}>
            {tr('«+ Ажил нэмэх» — багцын зураг төслийн мөрийн доор нэрээр ажил нэмнэ; «Төсөл төлөвлөгөө биелэлт» хүснэгтэд хадгалагдаж тэр хуудсанд ч харагдана. Жин нь ажлуудад тэнцүү хуваагдана, хувь эсвэл дүнгээр өөрчилж болно. Ажлын төсөвт өртөг = эцэг мөрийн төсөв × жин; эцэг мөрийн төсөв өөрчлөгдөхгүй.')}
          </p>
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

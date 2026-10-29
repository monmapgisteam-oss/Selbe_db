'use client';

/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) модны хүснэгт.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { t as tr } from '@/lib/i18nCore';
import { useAsync, type Async } from '@/lib/useAsync';
import { useSyncRef } from '@/lib/useSyncRef';
import { setNavDirty } from '@/lib/navGuard';
import { Data, userError } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { pct as fmtPct, num } from '@/lib/format';
import { loadNegtgelFull, dropNegtgelFull, negDisplay, negtgelTree, type NegtgelFull, type NegtgelRow, type NegtgelCalc } from '@/lib/negtgel';
import { computeNegAuto, syncNegtgel, type NegRaw, type NegSyncState } from '@/lib/negtgelAuto';
import {
  applyNegEdits, negDiffers, negEditable, negForm, negServiceCanUpdate, negTotals, parseNegInput, publishNegEdits, type NegEditKey,
} from '@/lib/negtgelEdit';
import { useAuth } from '@/components/AuthGate';
import { roleForUser } from '@/lib/services';
import n from './negtgel.module.css';
/* Баруун товшилтын цэс ба сонголтын тэмдэг — Санхүүжилтийн хүснэгттэй НЭГ загвар */
import f from './finance.module.css';

/** Гүн бүрийн нэмэлт догол (px) */
const INDENT = 12;
const indentOf = (depth: number) => Math.max(0, Math.min(depth, 6) - 1) * INDENT;
/** ArcGIS огноо (ms) → «YYYY-MM-DD» — UTC өдөр (Excel-ээс 00:00Z-ээр хадгалагдсан) */
const ymd = (ms: number | null | undefined) => (ms == null || !Number.isFinite(ms) ? '' : new Date(ms).toISOString().slice(0, 10));

/**
 * Outline товчнууд — Excel-ийн задаргаа 6 түвшинтэй.
 */
const LEVELS = [1, 2, 3, 4, 5, 6];
const ALL_DEPTH = 99;
const depthOf = (btn: number) => (btn === LEVELS[LEVELS.length - 1] ? ALL_DEPTH : btn);

/** Нэрийн харьцуулалт — зай, цэг, хаалтын ялгааг үл тоомсорлоно */
const nk = (v: string) => v.toLowerCase().replace(/[\s.,()/"'«»-]/g, '');

/**
 * АНХДАГЧ ХААЛТТАЙ БҮЛГҮҮД — эх Excel-ийн хадгалсан байдал: ТЭЗҮ, Зөвшөөрөл,
 * Сонгон шалгаруулалт, «5.1 Бэлтгэл ажил» хураалттай; бусад нь нээлттэй.
 */
const CLOSED_BY_DEFAULT = new Set(['ТЭЗҮ', 'Зөвшөөрөл', 'Сонгон шалгаруулалт', 'Бэлтгэл ажил'].map(nk));

/**
 * МӨРИЙН ӨНГӨ — эх Excel-ийн дүүргэлт (цайвар горимд бүдэг хувилбар нь,
 * `negtgel.module.css`):
 *   · үе шат (1-р түвшин), нийт мөр ........................ #215F9A
 *   · 2-р түвшин ............................................ #A6CAEC
 *   · «Барилга угсралт» → 5.1-ийн дэд хэсэг (5.1.1 …) ....... #C1E5F5
 *   · «Барилга угсралт» → 5.2-ын дэд хэсэг (5.2.1 …) ........ #0B3041
 *   · түүний доторх бүлэг (5.2.3.1 …) ....................... #D1D1D1
 *   · бусад бүлэг (3-аас доош) .............................. #DCEAF7
 *   · навч ................................................... цагаан
 */
type Tone = 'stage' | 'l2' | 'prep' | 'work' | 'workSub' | 'grp' | '';
function toneOf(
  i: number,
  rows: NegtgelRow[],
  parent: number[],
  isGroup: boolean,
): Tone {
  const d = rows[i].depth;
  if (d <= 1) return 'stage';
  if (d === 2) return 'l2';
  /* Үе шат ба 2-р түвшний өвөг */
  let k = i;
  const chain: number[] = [];
  while (k >= 0) { chain.push(k); k = parent[k]; }
  const stage = rows[chain[chain.length - 1]];
  const l2 = chain.length >= 2 ? rows[chain[chain.length - 2]] : null;
  if (nk(stage.name) === nk('Барилга угсралт') && l2) {
    if (nk(l2.name) === nk('Бэлтгэл ажил') && d === 3) return 'prep';
    if (nk(l2.name) === nk('Барилга угсралт ажил')) {
      if (d === 3) return 'work';
      if (d === 4 && isGroup) return 'workSub';
    }
  }
  return isGroup ? 'grp' : '';
}

/* ═══════════════ БАГАНА — нуух / өргөсгөх (2026-09-25) ═══════════════ */

type ColKey = 'code' | 'bagts' | 'name' | 'budget' | 'inSection' | 'inProject'
  | 'ctStart' | 'ctEnd' | 'exStart' | 'exEnd' | 'actStart' | 'actEnd'
  | 'planG' | 'planGch' | 'planGu' | 'planNw' | 'planPw' | 'act' | 'perfG' | 'perfGch' | 'perfGu' | 'perfWk';

/**
 * ТОЛГОЙН БҮЛЭГ — Excel-ийн 4-р мөрөнд ХЭВТЭЭ нэгтгэсэн нүд (H4:I4 · J4:K4 · L4:M4), 5-р мөрөнд дэд толгой.
 */
type GrpKey = 'ct' | 'ex' | 'act';
const GROUPS: { key: GrpKey; label: () => string }[] = [
  { key: 'ct', label: () => tr('Гэрээ/Хавсралт 5') },
  { key: 'ex', label: () => tr('Гүйцэтгэгч') },
  { key: 'act', label: () => tr('ОСНАУГ/Газар чөлөөлөлт/ хуулийн маргаан/Өндөржилт нөлөөлөл') },
];
const GROUP = new Map(GROUPS.map((g) => [g.key, g]));

/**
 * БАГАНУУД — эх Excel-ийн B…W дарааллаар (2026-10-13: огноо H…M, Q · R · W нэмэгдэв).
 */
const COLS: { key: ColKey; label: () => string; w: number; grp?: GrpKey }[] = [
  { key: 'code', label: () => tr('Д/Д'), w: 92 },
  { key: 'bagts', label: () => tr('Багцын дугаар'), w: 104 },
  { key: 'name', label: () => tr('Ажлын нэр'), w: 320 },
  { key: 'budget', label: () => tr('Урьдчилсан төсөвт өртөг'), w: 140 },
  { key: 'inSection', label: () => tr('Хэсэгт эзлэх'), w: 104 },
  { key: 'inProject', label: () => tr('Төсөлд эзлэх хувь'), w: 130 },
  { key: 'ctStart', label: () => tr('Төлөвлөгөөт эхлэх'), w: 110, grp: 'ct' },
  { key: 'ctEnd', label: () => tr('Төлөвлөгөөт дуусах'), w: 110, grp: 'ct' },
  { key: 'exStart', label: () => tr('Төлөвлөгөөт эхлэх'), w: 110, grp: 'ex' },
  { key: 'exEnd', label: () => tr('Төлөвлөгөөт дуусах'), w: 110, grp: 'ex' },
  { key: 'actStart', label: () => tr('Бодит Эхлэх'), w: 110, grp: 'act' },
  { key: 'actEnd', label: () => tr('Бодит дуусах'), w: 110, grp: 'act' },
  { key: 'planG', label: () => tr('Төлөвлөгөөт хувь Гэрээ Хавсралт 5'), w: 260 },
  { key: 'planGch', label: () => tr('Төлөвлөгөөт хувь Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан Хавсралт 5'), w: 220 },
  { key: 'planGu', label: () => tr('Төлөвлөгөөт хувь Гүйцэтгэгч'), w: 160 },
  { key: 'planNw', label: () => tr('Төлөвлөгөөт хувь Next week'), w: 150 },
  { key: 'planPw', label: () => tr('Төлөвлөгөөт хувь Өмнө долоо хоног'), w: 170 },
  { key: 'act', label: () => tr('Гүйцэтгэлийн хувь'), w: 150 },
  { key: 'perfG', label: () => tr('Төлөвлөгөө биелэлт Гэрээ'), w: 170 },
  { key: 'perfGch', label: () => tr('Төлөвлөгөө биелэлт Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан'), w: 220 },
  { key: 'perfGu', label: () => tr('Төлөвлөгөө биелэлт- Гүйцэтгэгч'), w: 170 },
  { key: 'perfWk', label: () => tr('Төлөвлөгөө биелэлт Weekly'), w: 150 },
];
const COL = new Map(COLS.map((c) => [c.key, c]));
/** Бүтэн нэр — «Бүлэг · дэд» (цэсний толгой, title) */
const fullLabel = (k: ColKey): string => {
  const c = COL.get(k)!;
  return c.grp ? `${GROUP.get(c.grp)!.label()} · ${c.label()}` : c.label();
};
const LOCKED: ColKey = 'name';
const MIN_W = 40;
const LEAD: ColKey[] = ['code', 'bagts', 'name'];

const LS_KEY = 'selbe.negtgel.cols.v1';
/**
 * `freeze` — энэ багана ХҮРТЭЛ (өөрийг нь оруулаад) царцаана; `''` = царцаахгүй.
 */
type ColPrefs = {
  hidden: ColKey[];
  w: Partial<Record<ColKey, number>>;
  freeze?: ColKey | '';
  /** Бичвэр мөр шилжүүлэх баганууд (Санхүүжилтийн «Wrap text») */
  wrap?: ColKey[];
};
const DEFAULT_FREEZE: ColKey = 'inProject';
function readPrefs(): ColPrefs {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as ColPrefs | null;
    if (j && Array.isArray(j.hidden) && j.w && typeof j.w === 'object') {
      const freeze = j.freeze === '' || (j.freeze && COL.has(j.freeze)) ? j.freeze : DEFAULT_FREEZE;
      const wrap = Array.isArray(j.wrap) ? j.wrap.filter((k) => COL.has(k)) : [];
      const w: Partial<Record<ColKey, number>> = {};
      for (const [k, v] of Object.entries(j.w)) {
        if (COL.has(k as ColKey) && typeof v === 'number' && Number.isFinite(v) && v >= MIN_W) w[k as ColKey] = v;
      }
      return { hidden: j.hidden.filter((k) => COL.has(k) && k !== LOCKED), w, freeze, wrap };
    }
  } catch { /* хадгалалт хаалттай — анхдагч */ }
  return { hidden: [], w: {}, freeze: DEFAULT_FREEZE };
}

export function TusulNegtgel() {
  const q = useAsync(loadNegtgelFull, []);
  const [dirty, setDirty] = useState(false);
  const [last, setLast] = useState<NegtgelFull | null>(null);
  if (q.state === 'ready' && q.data !== last) setLast(q.data);
  const held = q.state !== 'ready' && dirty && last ? last : null;
  const qq: Async<NegtgelFull> = held ? { state: 'ready', data: held, error: null, retry: q.retry } : q;
  return (
    <Data q={qq} minH={320}>
      {(d) => (
        <>
          <SyncNotice
            live={d.live}
            failed={d.failed}
            sync={d.sync}
            onDone={() => { dropNegtgelFull(); q.retry?.(); }}
          />
          {d.tree === 'code' && (
            <p className={n.syncNote} role="status">
              {tr('Хүснэгтийн мөрүүд Excel-ийн модтой таарахгүй байна — модыг кодоор угсарлаа; эцэг-хүүхдийн холбоо Excel-ээс зөрж болно.')}
            </p>
          )}
          <NegBody d={d} onDirty={setDirty} reloadFailed={held != null && q.state === 'error'} />
        </>
      )}
    </Data>
  );
}

/* ═══════════════ ЗАСАХ · НИЙТЛЭХ (2026-10-15) ═══════════════
 */

/** Багана → засварын түлхүүр (огноо, биелэлт — засагдахгүй) */
const EDIT_COL: Partial<Record<ColKey, NegEditKey>> = {
  budget: 'budget', inSection: 'w', inProject: 'p',
  planG: 'planG', planGch: 'planGch', planGu: 'planGu', planNw: 'planNw', planPw: 'planPw', act: 'act',
};
/** Багана → загварын талбар (томьёогоор өөрчлөгдсөнийг цэнхэрлэхэд) */
const MODEL_COL: Partial<Record<ColKey, keyof NegRaw>> = {
  ...EDIT_COL, perfG: 'perfG', perfGch: 'perfGch', perfGu: 'perfGu', perfWk: 'perfWk',
};

export type NegEditApi = {
  /** Энэ нүд засагдах уу (Excel-ийн оролт) */
  can: (oid: number, k: ColKey) => boolean;
  /** Загварын утга — хувь 0–1, төсөв ₮ */
  value: (oid: number, k: ColKey) => number | null;
  /** Оруулсан бичвэрийг хэрэгжүүлнэ — татгалзвал шалтгаан (2026-10-19: нүд буцааж тэмдэглэнэ), эс бөгөөс `null` */
  set: (oid: number, k: ColKey, text: string) => string | null;
  /** Гараар зассан нүд */
  edited: (oid: number, k: ColKey) => boolean;
  /** Томьёогоор өөрчлөгдсөн нүд */
  derived: (oid: number, k: ColKey) => boolean;
};

/**
 * ЗАСАХ ГОРИМЫН ЦАРЦААСАН СУУРЬ (2026-10-19, аудит).
 */
function NegBody({ d: live, onDirty, reloadFailed }: {
  d: NegtgelFull;
  /** Нийтлээгүй засвартай эсэх — эцэг `NegBody`-г уналтад салгахгүй (`TusulNegtgel`) */
  onDirty: (v: boolean) => void;
  /** Засвартай үед арын дахин уншилт унасан */
  reloadFailed: boolean;
}) {
  const { role, user, status } = useAuth();
  const canEdit = status === 'off' ? role === 'super' : roleForUser(user?.username) === 'super';
  const [edit, setEdit] = useState(false);
  const [edits, setEdits] = useState<Map<number, Partial<Record<NegEditKey, number | null>>>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [frozen, setFrozen] = useState<NegtgelFull | null>(null);
  /** Нийтэлсэн агшны `live` — түүнээс ӨӨР уншилт ирэх хүртэл загварыг (засвартай) барина */
  const [posted, setPosted] = useState<NegtgelFull | null>(null);
  const liveRef = useRef(live);
  useSyncRef(liveRef, live);
  /* Зурах үеийн тохируулга (effect биш — нэг кадр ч хуучин суурь харагдахгүй) */
  if (posted) {
    if (posted !== live) { setFrozen(null); setEdits(new Map()); setPosted(null); }
  } else if (frozen && frozen !== live && !edits.size) {
    setFrozen(live);
  }
  const d = frozen ?? live;
  const dirty = edits.size > 0 && !posted;
  const newer = frozen != null && frozen !== live && !posted;

  useEffect(() => {
    setNavDirty('negtgel', dirty, tr('Нэгтгэл гүйцэтгэлийн засвар'));
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => () => setNavDirty('negtgel', false), []);

  const [svcCan, setSvcCan] = useState<boolean | null>(null);
  useEffect(() => {
    if (!canEdit) return undefined;
    let alive = true;
    void negServiceCanUpdate().then((v) => { if (alive) setSvcCan(v); });
    return () => { alive = false; };
  }, [canEdit]);
  const svcOff = svcCan === false;

  const form = useMemo(() => negForm(d.stored), [d.stored]);
  const at = useMemo(() => new Map(d.stored.map((r, i) => [r.oid, i])), [d.stored]);
  const model = useMemo(() => (edits.size ? applyNegEdits(d.stored, form, edits) : d.stored), [d.stored, form, edits]);
  /* Дэлгэц — засвартай бол загвар → системийн давхарга (`computeNegAuto`) → табын хэлбэр */
  const view = useMemo(() => {
    if (!edits.size) return { rows: d.rows, calc: d.calc };
    return negDisplay(d.src ? computeNegAuto(model, d.src) : model);
  }, [edits.size, d.rows, d.calc, d.src, model]);
  const count = useMemo(() => [...edits.values()].reduce((a, e) => a + Object.keys(e).length, 0), [edits]);

  const api = useMemo<NegEditApi>(() => ({
    can: (oid, k) => {
      const key = EDIT_COL[k];
      const i = at.get(oid);
      if (!key || i == null) return false;
      return negEditable(d.stored, form, i, key, d.calc.get(oid)?.auto === true);
    },
    value: (oid, k) => {
      const key = MODEL_COL[k];
      const i = at.get(oid);
      return key == null || i == null ? null : (model[i][key] as number | null);
    },
    set: (oid, k, text) => {
      const key = EDIT_COL[k];
      const i = at.get(oid);
      if (!key || i == null) return null;
      const budget = key === 'budget';
      const r = parseNegInput(text, key);
      if (!r.ok) { setMsg({ ok: false, text: r.err }); return r.err; }
      const v = r.v;
      setMsg(null);
      setEdits((prev) => {
        const next = new Map(prev);
        const cur = { ...(next.get(oid) ?? {}) };
        /* Анхны утга руугаа буцсан бол засвар биш */
        if (negDiffers(v, d.stored[i][key] as number | null, budget)) cur[key] = v; else delete cur[key];
        if (Object.keys(cur).length) next.set(oid, cur); else next.delete(oid);
        return next;
      });
      return null;
    },
    edited: (oid, k) => {
      const key = EDIT_COL[k];
      return key != null && edits.get(oid)?.[key] !== undefined;
    },
    derived: (oid, k) => {
      const key = MODEL_COL[k];
      const i = at.get(oid);
      if (!edits.size || key == null || i == null) return false;
      return negDiffers(model[i][key] as number | null, d.stored[i][key] as number | null, key === 'budget');
    },
  }), [at, d.stored, d.calc, form, model, edits]);

  const awaiting = posted != null;
  const toggleEdit = async () => {
    if (awaiting) return;
    if (edit && count > 0 && !(await askConfirm(tr('Хадгалаагүй {0} засвар устах уу?', count), { danger: true, ok: tr('Засвар хаях') }))) return;
    if (edit) { setEdits(new Map()); setFrozen(null); } else { setEdits(new Map()); setFrozen(live); setPosted(null); }
    setMsg(null);
    setEdit((v) => !v);
  };
  const publish = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await publishNegEdits(d.stored, model);
      setEdit(false);
      if (r.n > 0) setPosted(liveRef.current); else { setEdits(new Map()); setFrozen(null); }
      setMsg({ ok: true, text: r.warn ? `${tr('Хадгалагдлаа — {0} мөр', r.n)} · ${r.warn}` : tr('Хадгалагдлаа — {0} мөр', r.n) });
    } catch (e) {
      setMsg({ ok: false, text: userError(e) });
    } finally {
      setSaving(false);
    }
  };

  const toolbar = canEdit ? (
    <span className={n.edBar}>
      {svcOff && !edit && (
        <span className={n.edWhy} title="Negtgel_guitsetgel_1013 · Settings → Enable editing (Update)">{tr('Засах боломжгүй: энэ хүснэгтэд засвар хаалттай байна — админд мэдэгдэнэ үү.')}</span>
      )}
      {edit && (
        <button type="button" className={`${f.editBtn} ${f.pubBtn}`} disabled={!count || saving} onClick={() => { void publish(); }}>
          {saving ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', count)}
        </button>
      )}
      <button
        type="button"
        className={`${f.editBtn} ${edit ? f.editBtnOn : ''}`}
        disabled={saving || awaiting || (svcOff && !edit)}
        aria-pressed={edit}
        title={awaiting ? tr('Хадгалсан өгөгдлийг дахин уншиж байна…') : svcOff && !edit ? tr('Энэ хүснэгтэд засвар хаалттай') : undefined}
        onClick={() => { void toggleEdit(); }}
      >
        {tr('Засах')}
      </button>
    </span>
  ) : null;

  return (
    <>
      {edit && (
        <p className={n.syncNote} role="status">
          {tr('Засах горим: тодруулсан нүд л засагдана (Excel-ийн томьёогүй нүд). Засварласан нүд НОГООН, томьёогоор дахин бодогдсон нүд ЦЭНХЭР. «Хадгалах» дарах хүртэл хадгалагдахгүй.')}
        </p>
      )}
      {newer && (
        <p className={n.syncNote} role="status">
          {tr('Шинэ өгөгдөл бий — хадгалсны/болисны дараа шинэчлэгдэнэ. Хадгалахад хүснэгтийг шинээр уншиж зөрчлийг шалгана.')}
        </p>
      )}
      {reloadFailed && (
        <p className={`${n.syncNote} ${n.msgErr}`} role="alert">
          {tr('Өгөгдлийг дахин уншиж чадсангүй — засвар тань хэвээр байна; хадгалахад хүснэгтийг шинээр уншиж шалгана.')}
        </p>
      )}
      {msg && <p className={`${n.syncNote} ${msg.ok ? n.msgOk : n.msgErr}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <Tree rows={view.rows} calc={view.calc} edit={edit ? api : undefined} toolbar={toolbar} />
    </>
  );
}

/**
 * Засварын нүдний оролт — Enter/blur хэрэгжүүлнэ, Esc буцаана.
 */
function EditInput({ v, budget, onCommit }: { v: number | null; budget: boolean; onCommit: (text: string) => string | null }) {
  const shown = v == null ? '' : budget ? String(Math.round(v)) : String(Number((v * 100).toFixed(4)));
  const [bad, setBad] = useState<string | null>(null);
  return (
    <input
      key={shown}
      className={bad ? `${n.edIn} ${n.edBad}` : n.edIn}
      defaultValue={shown}
      inputMode="decimal"
      aria-label={tr('Утга засах')}
      aria-invalid={bad ? true : undefined}
      title={bad ?? undefined}
      onChange={() => { if (bad) setBad(null); }}
      onBlur={(e) => {
        const el = e.target;
        if (el.value === shown) return;
        const err = onCommit(el.value);
        if (err) { el.value = shown; setBad(err); }
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter') el.blur();
        if (e.key === 'Escape') { el.value = shown; setBad(null); el.blur(); }
      }}
    />
  );
}

/**
 * СИНКИЙН МЭДЭГДЭЛ (2026-09-25).
 */
function SyncNotice({ live, failed, sync, onDone }: {
  live: boolean;
  failed: string[];
  sync: Promise<NegSyncState> | null;
  onDone: () => void;
}) {
  const [st, setSt] = useState<NegSyncState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void sync?.then((v) => { if (alive) setSt(v); });
    return () => { alive = false; };
  }, [sync]);

  if (!live) {
    return (
      <p className={n.syncNote} role="status">
        {failed.length
          ? tr('Системийн эх уншигдсангүй ({0}) — хүснэгтийн хадгалсан утгыг харуулж байна. Дараагийн нээлтэд дахин уншина.', failed.join(', '))
          : tr('Системийн эх уншигдсангүй — хүснэгтийн хадгалсан утгыг харуулж байна.')}
      </p>
    );
  }
  const partialNote = failed.length
    ? <p className={n.syncNote} role="status">{tr('Хэсэгчлэн уншигдсан: {0} — зарим төлөвлөгөөт хувь дутуу байж болно. Дараагийн нээлтэд дахин уншина.', failed.join(', '))}</p>
    : null;
  if (!st || st.kind === 'off' || st.kind === 'ok') return partialNote;
  const force = async () => {
    setBusy(true);
    const r = await syncNegtgel({ force: st.kind === 'guard' });
    setBusy(false);
    if (r.kind === 'ok') onDone();
    else setSt(r);
  };
  const p1 = (v: number) => fmtPct(v * 100, 2);
  return (
    <>
    {partialNote}
    <div className={n.syncNote} role="status">
      {st.kind === 'error' ? (
        <span>{tr('Хүснэгтэд бичигдсэнгүй — {0}', st.reason)}</span>
      ) : st.totalBlocked && st.total ? (
        <span>{tr('Хүснэгтэд бичигдсэнгүй — төслийн нийт {0} → {1} болж 20-оос илүү нэгжээр өөрчлөгдөх байсан тул бичсэнгүй.', p1(st.total.from), p1(st.total.to))}</span>
      ) : (
        <span>{tr('Хүснэгтэд хэсэгчлэн бичигдсэнгүй — {0} мөр нэг дор 20-оос илүү нэгжээр өөрчлөгдөх байсан тул алгасав (бусад {1} мөр бичигдсэн).', num(new Set(st.blocked.map((b) => b.oid)).size), num(st.n))}</span>
      )}
      {st.kind === 'guard' && st.blocked.length > 0 && (
        <span className={n.syncRows}>
          {st.blocked.slice(0, 5).map((b) => `${b.code} ${b.name}: ${p1(b.from)} → ${p1(b.to)}`).join(' · ')}
          {st.blocked.length > 5 ? ` · +${st.blocked.length - 5}` : ''}
        </span>
      )}
      <button type="button" disabled={busy} onClick={() => { void force(); }}>
        {busy ? tr('Бичиж байна…') : st.kind === 'error' ? tr('Дахин оролдох') : tr('Системийн утгаар шинэчлэх')}
      </button>
    </div>
    </>
  );
}

export function Tree({ rows, calc, edit, toolbar }: {
  rows: NegtgelRow[];
  calc: Map<number, NegtgelCalc>;
  edit?: NegEditApi;
  /** «Засах» · «Нийтлэх» товчнууд — хэрэгслийн мөрийн баруун талд */
  toolbar?: ReactNode;
}) {
  const { parent, kids } = useMemo(() => negtgelTree(rows), [rows]);

  /** Хураалттай бүлгүүд (oid) */
  const [closed, setClosed] = useState<Set<number>>(() => new Set(
    rows.filter((r, i) => kids[i].length > 0 && r.depth <= 2 && CLOSED_BY_DEFAULT.has(nk(r.name))).map((r) => r.oid),
  ));
  const [q1, setQ1] = useState('');
  const [level, setLevel] = useState<number | null>(null);

  /** Outline товч — тэр түвшнээс доош БҮХ бүлгийг хураана, дээшхийг нээнэ */
  const pickLevel = (btn: number) => {
    const lim = depthOf(btn);
    setLevel(lim);
    setClosed(new Set(rows.filter((r, i) => kids[i].length > 0 && r.depth >= lim).map((r) => r.oid)));
  };
  const toggle = (oid: number) => {
    setLevel(null);
    setClosed((prev) => {
      const s = new Set(prev);
      if (s.has(oid)) s.delete(oid); else s.add(oid);
      return s;
    });
  };

  /* ── Багана: нуух / өргөн ── */
  const [prefs, setPrefs] = useState<ColPrefs>(readPrefs);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch { /* алгасна */ }
  }, [prefs]);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const W = (k: ColKey) => prefs.w[k] ?? COL.get(k)!.w;
  const WV = (k: ColKey) => `var(--nw-${k}, ${W(k)}px)`;
  const tblRef = useRef<HTMLTableElement | null>(null);
  const vis = COLS.filter((c) => !hidden.has(c.key));
  const hdRef = useRef<HTMLTableSectionElement | null>(null);
  useLayoutEffect(() => {
    const head = hdRef.current;
    const tbl = tblRef.current;
    if (!head || !tbl) return undefined;
    const apply = () => {
      const trs = Array.from(head.rows);
      const h = (i: number) => trs[i]?.getBoundingClientRect().height ?? 0;
      tbl.style.setProperty('--nh0', `${h(0)}px`);
      tbl.style.setProperty('--nh1', `${h(0) + h(1)}px`);
      tbl.style.setProperty('--nhh', `${head.getBoundingClientRect().height}px`);
    };
    const ro = new ResizeObserver(apply);
    for (const trEl of Array.from(head.rows)) ro.observe(trEl);
    ro.observe(head);
    return () => ro.disconnect();
  }, [vis.length]);
  /** Харагдах бүлгүүд — дэд багануудаараа (хоосон бүлэг зурагдахгүй) */
  const grpCols = GROUPS.map((g) => ({ g, cols: vis.filter((c) => c.grp === g.key) })).filter((x) => x.cols.length > 0);

  /**
   * ЦАРЦСАН БАГАНЫН `left` — ХАРАГДАЖ БУЙ царцсан баганууд, одоогийн өргөнөөр.
   */
  const freeze = prefs.freeze ?? DEFAULT_FREEZE;
  /** Царцсан баганууд — дарааллаар `freeze` хүртэл (хэрэглэгчийн сонголт) */
  const frozen = useMemo(() => {
    const out = new Set<ColKey>();
    if (!freeze) return out;
    for (const c of COLS) {
      out.add(c.key);
      if (c.key === freeze) break;
    }
    return out;
  }, [freeze]);
  const left: Partial<Record<ColKey, string>> = {};
  let edge: ColKey | null = null;
  {
    const acc: string[] = [];
    for (const c of vis) {
      if (!frozen.has(c.key)) continue;
      left[c.key] = acc.length ? `calc(${acc.join(' + ')})` : '0px';
      acc.push(WV(c.key));
      edge = c.key;
    }
  }
  const wrapSet = useMemo(() => new Set(prefs.wrap ?? []), [prefs.wrap]);
  const sty = (k: ColKey) => ({
    width: WV(k), minWidth: WV(k), maxWidth: WV(k), left: left[k],
    ...(wrapSet.has(k) ? { whiteSpace: 'normal' as const, wordBreak: 'break-word' as const } : {}),
  });

  /*
   * ── БАГАНЫН СОНГОЛТ ба БАРУУН ТОВШИЛТЫН ЦЭС — «Санхүүжилт» хүснэгттэй ИЖИЛ
   *    (2026-09-25, хэрэглэгчийн заавар: «mouse 2 click гээд санхүүжилттай
   *    ижилхэн ажиллагаатай болго»; `Finance.headMenu`-г үз).
   *    · толгой дарах  → ЗӨВХӨН энэ багана; Ctrl/⌘ → нэмж/хасах; Shift → муж
   *    · баруун товшилт → Hide column · Freeze up to here · Wrap text …
   */
  const [pick, setPick] = useState<ColKey[]>([]);
  const lastPick = useRef<ColKey | null>(null);
  const [hMenu, setHMenu] = useState<{ k: ColKey; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hMenu) return;
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setHMenu(null); };
    const scroll = (ev: Event) => {
      if (menuRef.current && ev.target instanceof Node && menuRef.current.contains(ev.target)) return;
      setHMenu(null);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [hMenu]);
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!hMenu || !el) return;
    const b = el.getBoundingClientRect();
    if (b.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, window.innerHeight - b.height - 8)}px`;
    if (b.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - b.width - 8)}px`;
  }, [hMenu]);
  const clickTh = (k: ColKey, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const names = vis.map((c) => c.key);
    if (ev.shiftKey && lastPick.current) {
      const a = names.indexOf(lastPick.current);
      const b = names.indexOf(k);
      if (a >= 0 && b >= 0) {
        setPick(names.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    lastPick.current = k;
    if (ev.ctrlKey || ev.metaKey) {
      setPick((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
      return;
    }
    setPick((v) => (v.length === 1 && v[0] === k ? [] : [k]));
  };
  const hideKeys = (ks: ColKey[]) => setPrefs((pp) => ({
    ...pp,
    hidden: [...new Set([...pp.hidden, ...ks.filter((k) => k !== LOCKED)])],
  }));
  const toggleWrap = (k: ColKey) => setPrefs((pp) => {
    const w = pp.wrap ?? [];
    return { ...pp, wrap: w.includes(k) ? w.filter((x) => x !== k) : [...w, k] };
  });
  const fzc = (k: ColKey) => (frozen.has(k) ? `${n.fz} ${k === edge ? n.fzEdge : ''}` : '');

  /**
   * ӨРГӨСГӨХ — толгойн баруун ирмэгийг чирнэ; давхар дарвал анхдагч өргөн.
   */
  const startResize = (k: ColKey) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const w0 = W(k);
    const prop = `--nw-${k}`;
    let cur = w0;
    let raf = 0;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      cur = Math.max(MIN_W, Math.round(w0 + ev.clientX - x0));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tblRef.current?.style.setProperty(prop, `${cur}px`);
      });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      const keep = ev.type === 'pointerup' && cur !== w0;
      if (keep) flushSync(() => setPrefs((pp) => ({ ...pp, w: { ...pp.w, [k]: cur } })));
      tblRef.current?.style.removeProperty(prop);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const resetW = (k: ColKey) => setPrefs((pp) => {
    const w = { ...pp.w };
    delete w[k];
    return { ...pp, w };
  });


  /**
   * ХАРАГДАХ МӨРҮҮД.
   */
  const list = useMemo(() => {
    const s = q1.trim().toLowerCase();
    if (s === '') {
      const out: number[] = [];
      rows.forEach((_, i) => {
        for (let k = parent[i]; k >= 0; k = parent[k]) if (closed.has(rows[k].oid)) return;
        out.push(i);
      });
      return out;
    }
    const keep = new Set<number>();
    rows.forEach((r, i) => {
      const hit = r.name.toLowerCase().includes(s)
        || r.code.toLowerCase().includes(s)
        || (r.bagts ?? '').toLowerCase().includes(s);
      if (!hit) return;
      for (let k = i; k >= 0 && !keep.has(k); k = parent[k]) keep.add(k);
    });
    return rows.map((_, i) => i).filter((i) => keep.has(i));
  }, [rows, parent, q1, closed]);

  /**
   * «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөр — Excel-ийн 6-р мөр:
   *   G = Σ үе шатны жин; H…K = Σ жин × утга; L…N = K ÷ H…J (0 бол 0).
   */
  const head = useMemo(() => {
    const fr = (v: number | null | undefined) => (v == null ? null : v / 100);
    const top = rows.filter((r) => r.depth === 1).flatMap((r) => {
      const c = calc.get(r.oid);
      return c ? [{
        p: fr(c.inProject), planG: fr(c.planPct), planGch: fr(c.planGch), planGu: fr(c.planGuits),
        planNw: fr(c.planNextWk), planPw: fr(c.planPrevWk), act: fr(c.actPct),
      }] : [];
    });
    const T = negTotals(top);
    const pc = (v: number | null) => (v == null ? null : v * 100);
    return {
      p: T.p == null ? null : T.p * 100,
      planG: pc(T.planG), planGch: pc(T.planGch), planGu: pc(T.planGu), planNw: pc(T.planNw), planPw: pc(T.planPw),
      act: pc(T.act),
      perfG: pc(T.perfG),
      perfGch: pc(T.perfGch),
      perfGu: pc(T.perfGu),
      perfWk: pc(T.perfWk),
    };
  }, [rows, calc]);

  /**
   * ТООНЫ ХЭЛБЭР — Excel-ийн форматаар: гүйцэтгэл үргэлж 2 орон; үе шат ба
   * бүлгийн мөр 2 орон; навчны төлөвлөгөө/биелэлт бүхэл; төсөлд эзлэх хувь
   * навчинд 3 орон (0.002% мэт жижиг жин).
   */
  const p = (v: number | null | undefined, d: number) => (
    v == null ? '' : fmtPct(v, d)
  );

  /* «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөрийн нүднүүд — эхний харагдах Д/Д · Багц ·
     Нэр баганыг нэгтгэнэ. */
  const lead = vis.filter((c) => LEAD.includes(c.key));
  const leadFz = lead.filter((c) => frozen.has(c.key));
  const leadRest = lead.filter((c) => !frozen.has(c.key));
  const sumW = (cs: typeof lead) => (cs.length ? `calc(${cs.map((c) => WV(c.key)).join(' + ')})` : '0px');
  const total: Partial<Record<ColKey, string>> = {
    inProject: p(head.p, 1),
    planG: p(head.planG, 2),
    planGch: p(head.planGch, 2),
    planGu: p(head.planGu, 2),
    planNw: p(head.planNw, 2),
    planPw: p(head.planPw, 2),
    act: p(head.act, 2),
    perfG: p(head.perfG, 2),
    perfGch: p(head.perfGch, 2),
    perfGu: p(head.perfGu, 2),
    perfWk: p(head.perfWk, 2),
  };

  return (
    <div className={n.wrap}>

      <div className={n.bar}>
        <input
          className={n.search}
          placeholder={tr('Ажил, кодоор хайх…')}
          value={q1}
          onChange={(e) => setQ1(e.target.value)}
        />
        {/* Excel-ийн outline товчтой ижил — тэр түвшнээс доош хураана */}
        <span className={n.levels}>
          {LEVELS.map((d) => (
            <button
              key={d}
              type="button"
              className={level === depthOf(d) ? n.lvOn : ''}
              title={depthOf(d) === ALL_DEPTH ? tr('Бүх түвшинг харуулах') : tr('{0}-р түвшин хүртэл харуулах', d)}
              onClick={() => pickLevel(d)}
            >{d}</button>
          ))}
        </span>
        {toolbar}
      </div>

      {/* БАРУУН ТОВШИЛТЫН ЦЭС — `Finance.headMenu`-тэй ижил үйлдэл, ижил загвар */}
      {hMenu && (() => {
        const k = hMenu.k;
        const keys = pick.length > 0 ? pick : [k];
        const order = COLS.map((c) => c.key);
        const target = keys.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), keys[0]);
        const isEdge = freeze === target;
        const close = () => setHMenu(null);
        return (
          <>
            <div
              className={f.thMenuVeil}
              onClick={close}
              onContextMenu={(ev) => {
                ev.preventDefault();
                const th = document.elementsFromPoint(ev.clientX, ev.clientY)
                  .find((el) => el instanceof HTMLElement && el.dataset.negCol) as HTMLElement | undefined;
                const nk2 = th?.dataset.negCol as ColKey | undefined;
                setHMenu(nk2 && COL.has(nk2) ? { k: nk2, x: ev.clientX, y: ev.clientY } : null);
              }}
            />
            <div
              ref={menuRef}
              className={f.thMenu}
              style={{ left: Math.max(8, Math.min(hMenu.x, window.innerWidth - 280)), top: Math.max(8, hMenu.y) }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className={f.thMenuHead}>{fullLabel(k)}</div>
              <div className={f.thMenuCols}>
                {keys.some((x) => x !== LOCKED) && (
                  <button type="button" onClick={() => { hideKeys(keys); setPick([]); close(); }}>
                    {keys.length > 1 ? `Hide ${keys.length} columns` : 'Hide column'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPrefs((pp) => ({ ...pp, freeze: (pp.freeze ?? DEFAULT_FREEZE) === target ? '' : target }));
                    close();
                  }}
                >
                  {isEdge
                    ? 'Unfreeze'
                    : keys.length > 1 ? `Freeze ${keys.length} columns` : 'Freeze up to here'}
                </button>
                <button type="button" onClick={() => toggleWrap(k)}>
                  {wrapSet.has(k) ? 'No wrap' : 'Wrap text'}
                </button>
                {prefs.w[k] != null && (
                  <button type="button" onClick={() => { resetW(k); close(); }}>Reset width</button>
                )}
                {pick.length > 0 && (
                  <button type="button" onClick={() => { setPick([]); close(); }}>Clear selection</button>
                )}
                {hidden.size > 0 && (
                  <button type="button" onClick={() => { setPrefs((pp) => ({ ...pp, hidden: [] })); close(); }}>
                    {`Show ${hidden.size} hidden columns`}
                  </button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      <div className={n.scroll}>
        <table className={n.tbl} ref={tblRef}>
          <thead ref={hdRef}>
            <tr>
              <th colSpan={vis.length} className={n.thTitle}><span className={n.thTitleTxt}>{tr('ТӨСЛИЙН ГҮЙЦЭТГЭЛ')}</span></th>
            </tr>
            <tr>
              {vis.map((c) => {
                if (c.grp) {
                  /* Бүлгийн нүд — бүлгийн ЭХНИЙ харагдах дэд баганад; бусад нь алгасна */
                  const gx = grpCols.find((x) => x.g.key === c.grp)!;
                  if (gx.cols[0].key !== c.key) return null;
                  const fzAll = gx.cols.every((x) => frozen.has(x.key));
                  return (
                    <th
                      key={`grp-${c.grp}`}
                      colSpan={gx.cols.length}
                      className={`${n.thGrp} ${fzAll ? n.fz : ''} ${fzAll && gx.cols.some((x) => x.key === edge) ? n.fzEdge : ''}`}
                      style={{ top: 'var(--nh0, 0px)', ...(fzAll ? { left: left[c.key] } : {}), width: sumW(gx.cols), minWidth: sumW(gx.cols), maxWidth: sumW(gx.cols) }}
                    >
                      {gx.g.label()}
                    </th>
                  );
                }
                return (
                  <th
                    key={c.key}
                    rowSpan={2}
                    className={`${fzc(c.key)} ${n.thSel} ${pick.includes(c.key) ? f.thPick : ''}`}
                    style={{ ...sty(c.key), top: 'var(--nh0, 0px)' }}
                    onClick={(ev) => clickTh(c.key, ev)}
                    data-neg-col={c.key}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      setHMenu((m) => (m?.k === c.key ? null : { k: c.key, x: ev.clientX, y: ev.clientY }));
                    }}
                  >
                    {c.label()}
                    {/* Өргөсгөх бариул — чирнэ; давхар дарвал анхдагч. */}
                    <span
                      className={n.rsz}
                      onPointerDown={startResize(c.key)}
                      onClick={(ev) => ev.stopPropagation()}
                      onDoubleClick={() => resetW(c.key)}
                      title={tr('Чирж өргөсгөнө · давхар дарвал анхдагч')}
                    />
                  </th>
                );
              })}
            </tr>
            <tr>
              {vis.filter((c) => c.grp).map((c) => (
                <th
                  key={c.key}
                  className={`${fzc(c.key)} ${n.thSel} ${n.thSub} ${pick.includes(c.key) ? f.thPick : ''}`}
                  style={{ ...sty(c.key), top: 'var(--nh1, 0px)' }}
                  onClick={(ev) => clickTh(c.key, ev)}
                  data-neg-col={c.key}
                  title={fullLabel(c.key)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setHMenu((m) => (m?.k === c.key ? null : { k: c.key, x: ev.clientX, y: ev.clientY }));
                  }}
                >
                  {c.label()}
                  <span
                    className={n.rsz}
                    onPointerDown={startResize(c.key)}
                    onClick={(ev) => ev.stopPropagation()}
                    onDoubleClick={() => resetW(c.key)}
                    title={tr('Чирж өргөсгөнө · давхар дарвал анхдагч')}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ — Excel-ийн 6-р мөр; 2026-10-14: ЦАРЦСАН (Excel ySplit=6), `--nhh` */}
            <tr className={`${n.stage} ${n.totalRow}`}>
              {leadFz.length > 0 && (
                <td
                  colSpan={leadFz.length}
                  className={`${n.fz} ${leadFz.some((c) => c.key === edge) ? n.fzEdge : ''}`}
                  style={{ width: sumW(leadFz), minWidth: sumW(leadFz), maxWidth: sumW(leadFz), left: left[leadFz[0].key] }}
                >
                  {leadRest.length === 0 ? tr('ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ') : ''}
                </td>
              )}
              {leadRest.length > 0 && (
                <td
                  colSpan={leadRest.length}
                  style={{ width: sumW(leadRest), minWidth: sumW(leadRest), maxWidth: sumW(leadRest) }}
                >
                  {tr('ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ')}
                </td>
              )}
              {vis.filter((c) => !LEAD.includes(c.key)).map((c) => (
                <td key={c.key} className={`${fzc(c.key)} ${n.num}`} style={sty(c.key)}>
                  {total[c.key] ?? ''}
                </td>
              ))}
            </tr>
            {list.map((i) => {
              const r = rows[i];
              const c = calc.get(r.oid);
              const isGroup = kids[i].length > 0;
              const tone = toneOf(i, rows, parent, isGroup);
              const leafDeep = !isGroup && r.depth >= 3;
              /* Төлөвлөгөө/биелэлтийн орон — навч бүхэл, бусад 2 */
              const dp = leafDeep ? 0 : 2;
              const body = (k: ColKey) => {
                switch (k) {
                  case 'code': return r.code;
                  case 'bagts': return r.bagts ?? '';
                  case 'name': return r.name;
                  case 'budget': return c?.budget ? num(c.budget) : '';
                  case 'inSection': return p(c?.inSection, 2);
                  case 'inProject': return p(c?.inProject, r.depth <= 1 ? 0 : leafDeep ? 3 : 2);
                  case 'planG': return p(c?.planPct, dp);
                  case 'planGch': return p(c?.planGch, dp);
                  case 'planGu': return p(c?.planGuits, dp);
                  case 'planNw': return p(c?.planNextWk, dp);
                  case 'planPw': return p(c?.planPrevWk, dp);
                  case 'act': return p(c?.actPct, 2);
                  case 'perfG': return p(c?.perf, dp);
                  case 'perfGch': return p(c?.perfGch, dp);
                  case 'perfGu': return p(c?.perfGuits, dp);
                  case 'perfWk': return p(c?.perfWk, dp);
                  case 'ctStart': return ymd(c?.ctStart);
                  case 'ctEnd': return ymd(c?.ctEnd);
                  case 'exStart': return c?.exStart ?? '';
                  case 'exEnd': return c?.exEnd ?? '';
                  case 'actStart': return c?.actStart ?? '';
                  case 'actEnd': return c?.actEnd ?? '';
                }
              };
              return (
                <tr
                  key={r.oid}
                  className={tone ? n[tone] : ''}
                  /* Тоо хаанаас гарсныг хулганаар */
                  title={[c?.how, c?.outside ? tr('Excel-ийн томьёонд эцгийнхээ нийлбэрт ороогүй мөр') : '']
                    .filter(Boolean).join(' · ')}
                >
                  {vis.map((col) => {
                    const k = col.key;
                    if (k === 'name') {
                      return (
                        <td
                          key={k}
                          className={`${fzc(k)} ${n.name} ${isGroup ? n.nameTog : ''}`}
                          style={{ ...sty(k), paddingLeft: 6 + indentOf(r.depth) }}
                          onClick={isGroup ? () => toggle(r.oid) : undefined}
                          aria-expanded={isGroup ? !closed.has(r.oid) : undefined}
                        >
                          {r.name}
                        </td>
                      );
                    }
                    if (k === 'code' && isGroup) {
                      const isOpen = !closed.has(r.oid);
                      return (
                        <td key={k} className={`${fzc(k)} ${n.code}`} style={sty(k)}>
                          {r.code}
                          <button
                            type="button"
                            className={n.tog}
                            onClick={() => toggle(r.oid)}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? tr('Хураах') : tr('Задлах')}
                            title={isOpen ? tr('Хураах') : tr('Задлах')}
                          >
                            {isOpen ? '−' : '+'}
                          </button>
                        </td>
                      );
                    }
                    const cls = k === 'code' || k === 'bagts' ? n.code : n.num;
                    if (edit) {
                      const mark = edit.edited(r.oid, k) ? `${f.cellDirty} ${n.dirty}` : edit.derived(r.oid, k) ? n.cellCalc : '';
                      if (edit.can(r.oid, k)) {
                        return (
                          <td key={k} className={`${fzc(k)} ${cls} ${n.edCell} ${mark}`} style={sty(k)}>
                            <EditInput v={edit.value(r.oid, k)} budget={k === 'budget'} onCommit={(t) => edit.set(r.oid, k, t)} />
                          </td>
                        );
                      }
                      return (
                        <td key={k} className={`${fzc(k)} ${cls} ${mark}`} style={sty(k)}>{body(k)}</td>
                      );
                    }
                    return (
                      <td key={k} className={`${fzc(k)} ${cls}`} style={sty(k)}>{body(k)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

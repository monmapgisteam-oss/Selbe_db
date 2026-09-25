'use client';

/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) модны хүснэгт.
 *
 * ⚠️⚠️ 2026-09-25: ХАРАГДАЦ нь эх Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг
 * ДУУРАЙНА (хэрэглэгч `docs/Төсөл Гүйцэтгэл_…_260924 - V2_backup.xlsx`-ийг
 * загвар болгож өгсөн): ижил 13 багана, «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөр, мөрийн
 * өнгө (үе шат · бүлэг · барилга угсралтын дэд хэсэг), бүлэг бүрийг нээх/хаах
 * (Excel-ийн outline), зүүн 6 багана ба толгой царцсан (Excel-ийн freeze).
 * Баганыг нууж, чирж өргөсгөж болно (хэрэглэгчийн заавар, 2026-09-25).
 *
 * ⚠️ ЭХ: мод ба жин `Negtgel_guitsetgel/0`-оос; гүйцэтгэл/төлөвлөгөө нь
 * СИСТЕМЭЭС АВТОМАТААР бодогдож, хүснэгт рүү ч буцаж бичигдэнэ
 * (`negtgelAuto.ts`). Эх унавал хадгалсан утгаа харуулна.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { Data } from '@/components/ui';
import { pct as fmtPct, num } from '@/lib/format';
import { loadNegtgelFull, dropNegtgelFull, negtgelTree, type NegtgelRow, type NegtgelCalc } from '@/lib/negtgel';
import { syncNegtgel, type NegSyncState } from '@/lib/negtgelAuto';
import n from './negtgel.module.css';
/* Баруун товшилтын цэс ба сонголтын тэмдэг — Санхүүжилтийн хүснэгттэй НЭГ загвар */
import f from './finance.module.css';

/** Гүн бүрийн нэмэлт догол (px) */
const INDENT = 12;
const indentOf = (depth: number) => Math.max(0, Math.min(depth, 5) - 1) * INDENT;

/**
 * Outline товчнууд — шинэ эх 6 түвшинтэй.
 * ⚠️ 5 ба 6 НЭГТГЭГДСЭН (2026-09-25, хэрэглэгчийн заавар): 6-р түвшин нь
 * ердөө 20 мөр (5.1.3.2-ын багцууд) нэмдэг. Сүүлийн товч = БҮХ түвшин.
 */
const LEVELS = [1, 2, 3, 4, 5];
const ALL_DEPTH = 99;
const depthOf = (btn: number) => (btn === LEVELS[LEVELS.length - 1] ? ALL_DEPTH : btn);

/** Нэрийн харьцуулалт — зай, цэг, хаалтын ялгааг үл тоомсорлоно */
const nk = (v: string) => v.toLowerCase().replace(/[\s.,()/"'«»-]/g, '');

/**
 * АНХДАГЧ ХААЛТТАЙ БҮЛГҮҮД — эх Excel-ийн хадгалсан байдал: ТЭЗҮ, Зөвшөөрөл,
 * Сонгон шалгаруулалт, «5.1 Бэлтгэл ажил» хураалттай; бусад нь нээлттэй.
 * ⚠️ Нэрээр — «3» код хоёр мөрд давхардсан.
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
  | 'planG' | 'planGch' | 'planGu' | 'act' | 'perfG' | 'perfGch' | 'perfGu';

/**
 * БАГАНУУД — эх Excel-ийн B…N дарааллаар.
 * ⚠️ Царцаалт нь хэрэглэгчийн сонголт (`ColPrefs.freeze`), анхдагч нь Excel-ийн A…G.
 * ⚠️ Нэр нь функц: хэл солиход дахин орчуулагдана.
 */
const COLS: { key: ColKey; label: () => string; w: number }[] = [
  { key: 'code', label: () => tr('Д/Д'), w: 92 },
  { key: 'bagts', label: () => tr('Багцын дугаар'), w: 104 },
  { key: 'name', label: () => tr('Ажлын нэр'), w: 320 },
  { key: 'budget', label: () => tr('Урьдчилсан төсөвт өртөг'), w: 140 },
  { key: 'inSection', label: () => tr('Хэсэгт эзлэх'), w: 104 },
  { key: 'inProject', label: () => tr('Төсөлд эзлэх хувь'), w: 130 },
  { key: 'planG', label: () => tr('Төлөвлөгөөт хувь Гэрээ Хавсралт 5'), w: 260 },
  { key: 'planGch', label: () => tr('Төлөвлөгөөт хувь Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан Хавсралт 5'), w: 220 },
  { key: 'planGu', label: () => tr('Төлөвлөгөөт хувь Гүйцэтгэгч'), w: 160 },
  { key: 'act', label: () => tr('Гүйцэтгэлийн хувь'), w: 150 },
  { key: 'perfG', label: () => tr('Төлөвлөгөө биелэлт Гэрээ'), w: 170 },
  { key: 'perfGch', label: () => tr('Төлөвлөгөө биелэлт Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан'), w: 220 },
  { key: 'perfGu', label: () => tr('Төлөвлөгөө биелэлт- Гүйцэтгэгч'), w: 170 },
];
const COL = new Map(COLS.map((c) => [c.key, c]));
/** ⚠️ «Ажлын нэр»-ийг нуухгүй — бүлгийг нээх/хаах нь тэр нүдэн дээр */
const LOCKED: ColKey = 'name';
const MIN_W = 40;
const LEAD: ColKey[] = ['code', 'bagts', 'name'];

/**
 * ⚠️ Тохиргоо нь ЗӨВХӨН тухайн хөтөчид (localStorage) — хүн бүр өөрийн
 * харагдацтай. Хувийн хөтөч/хаалттай хадгалалтад ч хуудас эвдрэхгүй (try).
 */
const LS_KEY = 'selbe.negtgel.cols.v1';
/**
 * `freeze` — энэ багана ХҮРТЭЛ (өөрийг нь оруулаад) царцаана; `''` = царцаахгүй.
 * ⚠️ Анхдагч нь Excel-ийнх: «Төсөлд эзлэх хувь» хүртэл (A…G).
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
      /* ⚠️ 2026-09-25: ЗӨВХӨН мэдэгдэх баганын хязгаартай тоон өргөн — эвдэрсэн
         (`null`, `"abc"`, 0, Infinity) утга багана алга болгож/хүснэгт тэлдэг байв. */
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
  return (
    <Data q={q} minH={320}>
      {(d) => (
        <>
          <SyncNotice
            live={d.live}
            sync={d.sync}
            onDone={() => { dropNegtgelFull(); q.retry?.(); }}
          />
          <Tree rows={d.rows} calc={d.calc} />
        </>
      )}
    </Data>
  );
}

/**
 * СИНКИЙН МЭДЭГДЭЛ (2026-09-25).
 *
 * ⚠️ Хамгаалалт (`negtgelAuto.planNegSync`) бичилтийг зогсоовол ЧИМЭЭГҮЙ
 *    үлдэхгүй: шалтгаан ба мөрүүдийг харуулж, super хэрэглэгч нэг удаа
 *    «Системийн утгаар шинэчлэх»-ээр баталгаажуулна (Excel-ээс тарьсан
 *    хүснэгтийн анхны синк г.м.). `guard` төлөв нь ЗӨВХӨН super-д ирнэ.
 */
function SyncNotice({ live, sync, onDone }: {
  live: boolean;
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
    return <p className={n.syncNote}>{tr('Системийн эх уншигдсангүй — хүснэгтийн хадгалсан утгыг харуулж байна.')}</p>;
  }
  if (!st || st.kind === 'off' || st.kind === 'ok') return null;
  const force = async () => {
    setBusy(true);
    const r = await syncNegtgel({ force: true });
    setBusy(false);
    if (r.kind === 'ok') onDone();
    else setSt(r);
  };
  const p1 = (v: number) => fmtPct(v * 100, 2);
  return (
    <div className={n.syncNote} role="status">
      {st.kind === 'error' ? (
        <span>{tr('Синк хийгдсэнгүй — {0}', st.reason)}</span>
      ) : st.totalBlocked && st.total ? (
        <span>{tr('Синк хийгдсэнгүй — төслийн нийт {0} → {1} болж 20-оос илүү нэгжээр өөрчлөгдөх байсан тул хүснэгтэд бичсэнгүй.', p1(st.total.from), p1(st.total.to))}</span>
      ) : (
        <span>{tr('Синк хэсэгчлэн хийгдсэнгүй — {0} мөр нэг дор 20-оос илүү нэгжээр өөрчлөгдөх байсан тул алгасав (бусад {1} мөр бичигдсэн).', num(new Set(st.blocked.map((b) => b.oid)).size), num(st.n))}</span>
      )}
      {st.kind === 'guard' && st.blocked.length > 0 && (
        <span className={n.syncRows}>
          {st.blocked.slice(0, 5).map((b) => `${b.code} ${b.name}: ${p1(b.from)} → ${p1(b.to)}`).join(' · ')}
          {st.blocked.length > 5 ? ` · +${st.blocked.length - 5}` : ''}
        </span>
      )}
      <button type="button" disabled={busy} onClick={() => { void force(); }}>
        {busy ? tr('Бичиж байна…') : tr('Системийн утгаар шинэчлэх')}
      </button>
    </div>
  );
}

function Tree({ rows, calc }: { rows: NegtgelRow[]; calc: Map<number, NegtgelCalc> }) {
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
  /**
   * ⚠️ 2026-09-25: өргөн нь CSS хувьсагчаар (`--nw-<key>`) — чирэх явцад
   *    ЗӨВХӨН хүснэгтийн элементийн style солигдоно (React дахин зурахгүй,
   *    localStorage бичихгүй). Урьд нь pointermove бүрд `setPrefs` → 352 мөр
   *    дахин зурагдаж, localStorage-д бичигддэг байв. Суллахад л хадгална.
   */
  const WV = (k: ColKey) => `var(--nw-${k}, ${W(k)}px)`;
  const tblRef = useRef<HTMLTableElement | null>(null);
  const vis = COLS.filter((c) => !hidden.has(c.key));

  /**
   * ЦАРЦСАН БАГАНЫН `left` — ХАРАГДАЖ БУЙ царцсан баганууд, одоогийн өргөнөөр.
   * ⚠️ Өргөн өөрчлөгдөх, багана нуугдах бүрд дахин бодно — эс бөгөөс баганууд
   * бие биенийхээ дээр давхцана.
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
   *    ⚠️ Шошго нь АНГЛИАР, `tr()`-гүй — Санхүүжилтийн цэстэй ижил (тэнд
   *    хэрэглэгч Excel/ArcGIS-ийн англи нэрээр таньдаг гэж шийдсэн).
   */
  const [pick, setPick] = useState<ColKey[]>([]);
  const lastPick = useRef<ColKey | null>(null);
  const [hMenu, setHMenu] = useState<{ k: ColKey; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /* ⚠️ 2026-09-25: Esc ба гүйлгэлтээр хаагдана — урьд нь цэс хүснэгтийг
     гүйлгэсэн ч хуучин байрандаа хөвж үлддэг байв. */
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
  /* ⚠️ Дэлгэцийн доод/баруун ирмэгээс ГАРАХГҮЙ — хэмжээг зурсны дараа хэмжиж шахна */
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
   * ⚠️ Pointer capture — хулгана нүднээс гарсан ч чирэлт тасрахгүй.
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
      /* ⚠️ Цуцалсан чирэлт (pointercancel) хадгалахгүй — анхны өргөндөө */
      const keep = ev.type === 'pointerup' && cur !== w0;
      /* ⚠️ `flushSync` — шинэ өргөн зурагдсаны ДАРАА хувьсагчийг авна, эс
         бөгөөс нэг кадр хуучин өргөнөөр анивчина. */
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
   * ⚠️ ХАЙЛТ нь хураалтыг ДАВЖ, тохирсон мөрийг БҮХ өвөг дээдэстэй нь гаргана
   * (модоор — код давхардсан тул кодоор өгсөхгүй).
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
    const t = { p: 0, planG: 0, planGch: 0, planGu: 0, act: 0 };
    /* ⚠️ 2026-09-25: жинтэй үе шатны гүйцэтгэл хэмжигдээгүй бол НИЙТ гүйцэтгэл
       ХООСОН (`negtgelProjectPct`-тэй ижил, null ≠ 0) — 0 гэж нэмбэл доошилно */
    let actNull = false;
    /* ⚠️ 2026-09-25: ТӨЛӨВЛӨГӨӨНД мөн адил дүрэм — жинтэй үе шатны төлөвлөгөө
       хоосон бол тэр баганын нийт ХООСОН. Урьд нь `?? 0` тул «0.00%» гарч,
       биелэлт нь «0 бол 0» дүрмээр 0% болдог байв (null ≠ 0). */
    const planNull = { planG: false, planGch: false, planGu: false };
    rows.forEach((r) => {
      if (r.depth !== 1) return;
      const c = calc.get(r.oid);
      if (!c || c.inProject == null) return;
      const ip = c.inProject;
      const w = ip / 100;
      const add = (k: keyof typeof planNull, v: number | null | undefined) => {
        if (v == null) { if (ip > 0) planNull[k] = true; } else t[k] += w * v;
      };
      t.p += ip;
      add('planG', c.planPct);
      add('planGch', c.planGch);
      add('planGu', c.planGuits);
      if (c.actPct == null) { if (c.inProject > 0) actNull = true; } else t.act += w * c.actPct;
    });
    const act = actNull ? null : t.act;
    const planG = planNull.planG ? null : t.planG;
    const planGch = planNull.planGch ? null : t.planGch;
    const planGu = planNull.planGu ? null : t.planGu;
    const perf = (plan: number | null) => (act == null || plan == null ? null : plan ? (act / plan) * 100 : 0);
    return {
      ...t,
      planG, planGch, planGu,
      act,
      perfG: perf(planG),
      perfGch: perf(planGch),
      perfGu: perf(planGu),
    };
  }, [rows, calc]);

  /**
   * ТООНЫ ХЭЛБЭР — Excel-ийн форматаар: гүйцэтгэл үргэлж 2 орон; үе шат ба
   * бүлгийн мөр 2 орон; навчны төлөвлөгөө/биелэлт бүхэл; төсөлд эзлэх хувь
   * навчинд 3 орон (0.002% мэт жижиг жин).
   */
  const p = (v: number | null | undefined, d: number) => (
    /* ⚠️ Хоосон нүд ХООСОН — «—» тэмдэг хасагдсан (2026-09-25, хэрэглэгчийн
       заавар). 0 гэж бичихгүй: «мэдээлэлгүй» ба «тэг» ялгаатай хэвээр. */
    v == null ? '' : fmtPct(v, d)
  );

  /* «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөрийн нүднүүд — эхний харагдах Д/Д · Багц ·
     Нэр баганыг нэгтгэнэ.
     ⚠️ 2026-09-25: ЦАРЦСАН ба ЦАРЦААГҮЙ хэсэг нь ТУСДАА нүд — урьд нь нэгтгэсэн
     нүд үргэлж sticky байсан тул зөвхөн «Д/Д» царцаахад бүтэн өргөнөөрөө
     хөдлөлгүй үлдэж, доорх «Ажлын нэр» баганыг дардаг байв. */
  const lead = vis.filter((c) => LEAD.includes(c.key));
  const leadFz = lead.filter((c) => frozen.has(c.key));
  const leadRest = lead.filter((c) => !frozen.has(c.key));
  const sumW = (cs: typeof lead) => (cs.length ? `calc(${cs.map((c) => WV(c.key)).join(' + ')})` : '0px');
  const total: Partial<Record<ColKey, string>> = {
    inProject: fmtPct(head.p, 0),
    planG: p(head.planG, 2),
    planGch: p(head.planGch, 2),
    planGu: p(head.planGu, 2),
    act: p(head.act, 2),
    perfG: p(head.perfG, 2),
    perfGch: p(head.perfGch, 2),
    perfGu: p(head.perfGu, 2),
  };

  return (
    <div className={n.wrap}>
      {/* ⚠️ «ТӨСЛИЙН ГҮЙЦЭТГЭЛ» гарчиг, «ТЭЗҮ, зураг төсөл» ба «Барилга
          угсралт» хоёр үзүүлэлт ХАСАГДСАН (2026-09-25, хэрэглэгчийн заавар:
          «delete», «ТӨСЛИЙН ГҮЙЦЭТГЭЛ del»). */}

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
        {/* ⚠️ «N / 352 мөр системээс автоматаар» бичиг ХАСАГДСАН (2026-09-25,
            хэрэглэгчийн заавар). Эх сурвалж нь мөрийн `title`-д хэвээр. */}
        {/* ⚠️ «Царцаах» сонголт ба «Багана ▾» цэс ХАСАГДСАН (2026-09-25,
            хэрэглэгчийн заавар: «del») — нуух, царцаах, өргөн сэргээх нь
            толгойн БАРУУН ТОВШИЛТЫН цэснээс (Санхүүжилттэй ижил). */}
      </div>

      {/* БАРУУН ТОВШИЛТЫН ЦЭС — `Finance.headMenu`-тэй ижил үйлдэл, ижил загвар */}
      {hMenu && (() => {
        const k = hMenu.k;
        const keys = pick.length > 0 ? pick : [k];
        const order = COLS.map((c) => c.key);
        const target = keys.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), keys[0]);
        /* ⚠️ 2026-09-25: товч нь ТОГГЛ — зорилтот багана аль хэдийн царцаалтын
           ирмэг бол «Unfreeze» гэж ИЛ бичнэ (урьд нь олон сонголтод «Freeze N
           columns» гэж бичээд чимээгүй царцаалтыг болиулдаг байв). */
        const isEdge = freeze === target;
        const close = () => setHMenu(null);
        return (
          <>
            <div
              className={f.thMenuVeil}
              onClick={close}
              onContextMenu={(ev) => {
                /* ⚠️ Нээлттэй үед өөр толгой дээр баруун товшвол ТЭНД дахин нээнэ —
                   хөшиг бүх хуудсыг бүрхдэг тул доорх элементийг цэгээр олно. */
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
              <div className={f.thMenuHead}>{COL.get(k)!.label()}</div>
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
          {/* ⚠️ БАГАНА нь эх Excel-ийнхээр (B…N) — нэр, дараалал хөндөхгүй */}
          <thead>
            <tr>
              {vis.map((c) => (
                <th
                  key={c.key}
                  className={`${fzc(c.key)} ${n.thSel} ${pick.includes(c.key) ? f.thPick : ''}`}
                  style={sty(c.key)}
                  onClick={(ev) => clickTh(c.key, ev)}
                  data-neg-col={c.key}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setHMenu((m) => (m?.k === c.key ? null : { k: c.key, x: ev.clientX, y: ev.clientY }));
                  }}
                >
                  {c.label()}
                  {/* Өргөсгөх бариул — чирнэ; давхар дарвал анхдагч.
                      ⚠️ Товшилт нь толгойн СОНГОЛТ руу хүрэхгүй. */}
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
            {/* ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ — Excel-ийн 6-р мөр */}
            <tr className={n.stage}>
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
                  {/* ⚠️ Бичиг нь «Ажлын нэр» (`LOCKED`, үргэлж харагдана) агуулсан нүдэнд */}
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
                  case 'act': return p(c?.actPct, 2);
                  case 'perfG': return p(c?.perf, dp);
                  case 'perfGch': return p(c?.perfGch, dp);
                  case 'perfGu': return p(c?.perfGuits, dp);
                }
              };
              return (
                <tr
                  key={r.oid}
                  className={tone ? n[tone] : ''}
                  /* Тоо хаанаас гарсныг хулганаар */
                  title={[c?.how, c?.outside ? tr('Эцгийнхээ нийлбэрт орохгүй (Нийслэл төсөв)') : '']
                    .filter(Boolean).join(' · ')}
                >
                  {vis.map((col) => {
                    const k = col.key;
                    if (k === 'name') {
                      /* ⚠️ «+/−» тэмдэг ХАСАГДСАН (2026-09-25) — бүлгийг НЭР
                         дээр нь дарж нээж/хаана, эсвэл 1–5 товчоор. */
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
                    const cls = k === 'code' || k === 'bagts' ? n.code : n.num;
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

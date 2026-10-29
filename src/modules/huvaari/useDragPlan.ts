import { type PointerEvent as PEvt, useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { DAY, endOf, spanDays, type PlanRow, type Span } from '@/lib/plan';
import { propagate } from '@/lib/deps';
import { remapMonths, type MonthRes, type PkgPlan, type PkgRes } from '@/lib/huvaariObyem';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import { kM, kN, kS } from '@/lib/huvaariDraft';
import { MAX_DAYS, type Drag, type DragMode } from './types';
import { directWorks, obKey, sameMonths, sameRes, sameSpan } from './util';

/**
 * ЗУРВАС ЧИРЭХ ХӨДӨЛГҮҮР — pointer down/move/up · `commit` (гинжтэй) · цуцлах агшин
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 */
const TAP_PX = 8;
const DRAG_PX = 4;

export function useDragPlan({
  plan, blk, n, applyChanges, canEdit, locked, busy, sc, obOf, obResOf, obDraft, obResDraft,
  setObDraft, setObResDraft, obPlan, obRes, drag, setDrag, setSel, setModal, dayAt, msAt, hdMeta, meRef, chain, scrollEl, onGroupRange,
}: {
  /** Бүлгийн хоосон хэсэгт чирж тавьсан шинэ муж — цонхыг тэр мужаар нээнэ (бүлгээр төлөвлөх, 2026-10-29) */
  onGroupRange?: (oid: number, span: Span) => void;
  scrollEl?: () => HTMLDivElement | null;
  plan: PlanRow[];
  blk: number;
  n: number;
  applyChanges: (ch: Map<number, (Span | null)[]>) => void;
  canEdit: boolean;
  locked: boolean;
  busy: boolean;
  sc: Schema | null;
  obOf: (des: number | null, blok: string) => Map<string, number>;
  obResOf: (des: number | null, blok: string) => Map<string, MonthRes>;
  obDraft: Map<string, Map<string, number>>;
  obResDraft: Map<string, Map<string, MonthRes>>;
  setObDraft: React.Dispatch<React.SetStateAction<Map<string, Map<string, number>>>>;
  setObResDraft: React.Dispatch<React.SetStateAction<Map<string, Map<string, MonthRes>>>>;
  obPlan: PkgPlan;
  obRes: PkgRes;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  setSel: (oid: number | null) => void;
  setModal: (oid: number | null) => void;
  dayAt: (clientX: number) => number;
  msAt: (k: number) => number;
  /** Хуваалцсан нооргийн нүд → хэн бичсэн (бусдын нүдийг агшнаар дарахгүй) */
  hdMeta: React.RefObject<Map<string, { at: number; user: string }>>;
  meRef: React.RefObject<string>;
  chain: boolean;
}) {
  /**
   * ЧИРЭЛТИЙГ БУЦААХ мэдээлэл — popup-ыг ЦУЦЛАХАД сэргээнэ.
   */
  const undoRef = useRef<{
    oid: number; blk: number; span: Span | null; months: Map<string, number> | null; snap: Map<number, Span | null> | null;
    /** чирэлтээс өмнөх сарын нөөц (2026-09-24) */
    res: Map<string, MonthRes> | null;
    /** ЭНЭ чирэлтийн хөдөлгөсөн мөрүүд — зөвхөн тэднийг буцаана (2026-09-24) */
    touched: Set<number> | null;
    /** Чирэлтээс өмнөх obDraft/obResDraft — гинжээр хөдөлсөн мөрийн задаргааг буцаана (2026-09-24 аудит) */
    obSnap: Map<string, Map<string, number>> | null;
    obResSnap: Map<string, Map<string, MonthRes>> | null;
    snapAll: Map<number, (Span | null)[]> | null;
  } | null>(null);
  const snapAll = useRef<Map<number, (Span | null)[]> | null>(null);
  /**
   * Чирэлт хамгийн сүүлд ЯМАР ХОНОГ дээр байсан.
   */
  const lastDay = useRef(-1);
  /** Товшилт vs чирэлт */
  const moved = useRef(false);
  const down = useRef<{ x: number; y: number; touch: boolean }>({ x: 0, y: 0, touch: false });
  const far = useRef(false);
  const scroll = useRef(false);
  const press = useRef<{ oid: number; x: number; y: number; ev: Event } | null>(null);
  /**
   * ЭНЭ ЧИРЭЛТИЙН ХӨДӨЛГӨСӨН мөрүүд (oid) — цуцлахад ЗӨВХӨН эдгээрийг буцаана
   * (2026-09-24). Урьд нь агшин (`snap`)-аас зөрсөн БҮХ мөрийг буцаадаг тул
   * чирэлт/цонхны хооронд хамт ажиллагчийн алсаас нийлсэн нүд ч «цуцлагдаж»
   * байв. `commit` бүрд `propagate`-ийн үр дүнгээс цуглуулна.
   */
  const dragTouched = useRef(new Set<number>());
  const [dragOpen, setDragOpen] = useState<number | null>(null);
  /**
   * БҮЛГИЙГ ЧИРЭХ (2026-10-29, хэрэглэгч: «бүлгийг чирж төлөвлөж болохгүй байна»; голоос — бүгдийг зөөнө, ирмэгээс — доторх
   * ажлууд пропорционалиар сунана/агшина). Чирэлт эхлэх агшны бүлгийн муж (`g`), идэвхтэй блок дахь мужтай навч ажлууд
   * (`kids` — муж · сарын задаргаа), сүүлийн тавьсан муж (`last`). Сарын обьём тавихад нэг удаа `remapMonths`-оор.
   * Буцаалт: `applyChanges`-ийн чирэлтийн БҮТЭН агшин (ноорог сар ч) — нэг Ctrl+Z.
   */
  const grp = useRef<{
    g: Span;
    kids: { i: number; oid: number; des: number | null; sp: Span; months: Map<string, number> | null }[];
    last: Map<number, Span>;
  } | null>(null);
  const auto = useRef<{ raf: number; x: number }>({ raf: 0, x: 0 });
  const stopAuto = () => {
    if (auto.current.raf) cancelAnimationFrame(auto.current.raf);
    auto.current.raf = 0;
  };
  useEffect(() => {
    const a = auto.current; // объект нь солигдохгүй (талбар нь л) — цэвэрлэгээнд ижил
    return () => { if (a.raf) cancelAnimationFrame(a.raf); };
  }, []);
  /**
   * Мужийг мөрд бичнэ. Дээд бүлэгт муж байвал хүүхдийг ТҮҮН РҮҮ ХАВЧУУЛНА —
   * «бүлгийн цонхны дотор» гэсэн дүрмийг чирэлтийн үедээ шууд сахина.
   */
  const commit = useCallback((oid: number, span0: Span | null, edge?: 'start' | 'end') => {
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    const span = span0 && edge && spanDays(span0) > MAX_DAYS
      ? (edge === 'start'
        ? { start: span0.end - (MAX_DAYS - 1) * DAY, end: span0.end }
        : { start: span0.start, end: endOf(span0.start, MAX_DAYS) })
      : span0;
    const r = plan[at];
    const next = r.spans.slice();
    next[blk] = span;
    const ov = new Map([[at, next]]);
    const ch = chain ? propagate(plan, n, ov) : ov;
    for (const i of ch.keys()) if (plan[i]) dragTouched.current.add(plan[i].oid);
    applyChanges(ch);
  }, [plan, blk, n, applyChanges, chain]);

  const onDown = (e: PEvt<HTMLElement>, r: PlanRow, mode: DragMode) => {
    const openBar = () => {
      if (mode === 'new' || r.oid < 0) return;
      press.current = { oid: r.oid, x: e.clientX, y: e.clientY, ev: e.nativeEvent };
    };
    if (press.current?.ev !== e.nativeEvent) press.current = null;
    if (!canEdit || locked || busy) { openBar(); return; }
    if (r.oid < 0) return;
    grp.current = null;
    if (r.group) {
      const g = r.spans[blk];
      if (chain && mode === 'new' && onGroupRange && directWorks(plan, plan.findIndex((x) => x.oid === r.oid)).length > 0) {
        /* Огноогүй (эсвэл хоосон хэсэг) — сүүдэр муж чирнэ; өгөгдөл хөндөхгүй, тавихад цонх тэр мужаар нээгдэнэ */
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const k0 = dayAt(e.clientX);
        lastDay.current = k0;
        moved.current = false;
        down.current = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
        far.current = false;
        scroll.current = false;
        setDrag({ oid: r.oid, mode, anchor: k0, orig: null, ghost: null });
        setSel(r.oid);
        return;
      }
      if (!chain || mode === 'new' || !g) { setSel(r.oid); openBar(); return; }
      const blokName = sc?.bld[blk] ?? '';
      const at = plan.findIndex((x) => x.oid === r.oid);
      const kids: { i: number; oid: number; des: number | null; sp: Span; months: Map<string, number> | null }[] = [];
      for (let i = at + 1; at >= 0 && i < plan.length && plan[i].depth > r.depth; i++) {
        const x = plan[i];
        const sp = x.spans[blk];
        if (x.group || x.oid < 0 || !sp) continue;
        kids.push({ i, oid: x.oid, des: x.des, sp, months: x.des != null && blokName ? new Map(obOf(x.des, blokName)) : null });
      }
      if (!kids.length) { setSel(r.oid); openBar(); return; }
      grp.current = { g, kids, last: new Map() };
    }
    if (mode === 'new' && r.spans[blk] && !e.altKey) { setSel(r.oid); return; }
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = dayAt(e.clientX);
    lastDay.current = k;
    moved.current = false;
    down.current = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    far.current = false;
    scroll.current = false;
    const blokName = sc?.bld[blk] ?? '';
    const origMonths = r.des != null && blokName ? new Map(obOf(r.des, blokName)) : null;
    const origRes = r.des != null && blokName ? new Map(obResOf(r.des, blokName)) : null;
    dragTouched.current = new Set([r.oid]);
    snapAll.current = new Map(plan.map((x) => [x.oid, x.spans] as const));
    setDrag({
      oid: r.oid, mode, anchor: k, orig: r.spans[blk], origMonths, origRes,
      snap: new Map(plan.map((x) => [x.oid, x.spans[blk]] as const)),
      obSnap: new Map(obDraft), obResSnap: new Map(obResDraft),
    });
    setSel(r.oid);
  };

  /** Хэвтээ ирмэгийн хурд (px/кадр) — хуанлийн харагдах хэсгийн зүүн (наалдмал самбарын ард) / баруун ирмэгээс 40px дотор */
  const edgeV = (x: number): number => {
    const el = scrollEl?.();
    if (!el) return 0;
    const b = el.getBoundingClientRect();
    const side = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    const lo = b.left + side;
    const EDGE = 40;
    if (x < lo + EDGE) return -Math.ceil(((lo + EDGE - x) / EDGE) * 16);
    if (x > b.right - EDGE) return Math.ceil(((x - (b.right - EDGE)) / EDGE) * 16);
    return 0;
  };
  /** Заагчийн X → хоног → муж (2026-10-09: `onMove`-оос салгав — автомат гүйлгээ ч дуудна; логик ХЭВЭЭР) */
  function moveTo(clientX: number) {
    if (!drag) return;
    const k = dayAt(clientX);
    if (k === lastDay.current) return;
    lastDay.current = k;
    moved.current = true;
    const o = drag.orig;
    if (drag.ghost !== undefined && drag.mode === 'new') {
      const a = Math.min(drag.anchor, k);
      const b = Math.max(drag.anchor, k);
      setDrag({ ...drag, ghost: { start: msAt(a), end: msAt(b) } });
      return;
    }
    if (grp.current && drag.mode !== 'new' && o) {
      const G = grp.current;
      const d = (k - drag.anchor) * DAY;
      const ng: Span = drag.mode === 'move' ? { start: o.start + d, end: o.end + d }
        : drag.mode === 'l' ? { start: Math.min(o.start + d, o.end), end: o.end }
        : { start: o.start, end: Math.max(o.end + d, o.start) };
      if (spanDays(ng) > MAX_DAYS) return;
      const gl = spanDays(G.g) - 1;
      const nl = spanDays(ng) - 1;
      const at = (t: number) => (drag.mode === 'move' ? t + d
        : ng.start + Math.round(gl > 0 ? (((t - G.g.start) / DAY) * nl) / gl : 0) * DAY);
      const ov = new Map<number, (Span | null)[]>();
      G.last = new Map();
      for (const c of G.kids) {
        const a = at(c.sp.start);
        const ns = { start: a, end: Math.max(at(c.sp.end), a) };
        const next = plan[c.i].spans.slice();
        next[blk] = ns;
        ov.set(c.i, next);
        G.last.set(c.i, ns);
      }
      const ch = chain ? propagate(plan, n, ov) : ov;
      for (const i of ch.keys()) if (plan[i]) dragTouched.current.add(plan[i].oid);
      applyChanges(ch);
      return;
    }
    if (drag.mode === 'new') {
      const a = Math.min(drag.anchor, k);
      const b = Math.max(drag.anchor, k);
      commit(drag.oid, { start: msAt(a), end: msAt(b) }, k < drag.anchor ? 'start' : 'end');
    } else if (o) {
      const d = (k - drag.anchor) * DAY;
      if (drag.mode === 'move') commit(drag.oid, { start: o.start + d, end: o.end + d });
      else if (drag.mode === 'l') commit(drag.oid, { start: Math.min(o.start + d, o.end), end: o.end }, 'start');
      else commit(drag.oid, { start: o.start, end: Math.max(o.end + d, o.start) }, 'end');
    }
  }
  const moveRef = useLatest((x: number) => moveTo(x));
  function autoTick() {
    auto.current.raf = 0;
    const el = scrollEl?.();
    const v = edgeV(auto.current.x);
    if (!el || !v) return;
    const before = el.scrollLeft;
    el.scrollLeft += v;
    if (el.scrollLeft === before) return; // хуанлийн зах — цааш гүйхгүй
    moveRef.current(auto.current.x);
    auto.current.raf = requestAnimationFrame(autoTick);
  }

  const onMove = (e: PEvt<HTMLElement>) => {
    if (!drag) return;
    if (scroll.current) return;
    if (!moved.current) {
      const dx = Math.abs(e.clientX - down.current.x);
      const dy = Math.abs(e.clientY - down.current.y);
      if (down.current.touch) {
        if (Math.max(dx, dy) > TAP_PX) far.current = true;
        if (dy > TAP_PX && dy > dx) { scroll.current = true; return; }
      }
      if (Math.max(dx, dy) <= (down.current.touch ? TAP_PX : DRAG_PX)) return;
    }
    moveTo(e.clientX);
    auto.current.x = e.clientX;
    const real = moved.current || far.current
      || Math.max(Math.abs(e.clientX - down.current.x), Math.abs(e.clientY - down.current.y)) > TAP_PX;
    if (real && !auto.current.raf && edgeV(e.clientX)) auto.current.raf = requestAnimationFrame(autoTick);
  };

  const onUp = (e?: PEvt<HTMLElement>) => {
    stopAuto();
    const p = press.current;
    press.current = null;
    if (p && e && Math.max(Math.abs(e.clientX - p.x), Math.abs(e.clientY - p.y)) <= TAP_PX) {
      undoRef.current = null;
      setDragOpen(null);
      setSel(p.oid);
      setModal(p.oid);
    }
    /* Хөдөлгөөнгүй товшилт: хоосон мөрд 1 хоногийн муж, эсрэг тохиолдолд
       зөвхөн сонголт (дээрх тайлбар). */
    /* Бүлгийн шинэ муж (сүүдэр) — тавихад цонхыг тэр мужаар нээнэ; хөдөлгөөгүй товшилт зөвхөн сонголт */
    if (drag && drag.ghost !== undefined && drag.mode === 'new') {
      if (moved.current && drag.ghost) onGroupRange?.(drag.oid, drag.ghost);
      setDrag(null);
      moved.current = false;
      return;
    }
    /* Бүлгийн чирэлт — доторх ажлын сарын обьёмыг шинэ мужид буулгаад цонхыг нээнэ: «Хаах» чирэлтийг буцаана,
       «Огноог үлдээх» хадгална (ганц ажлын чирэлттэй ижил — `undoRef`) */
    const G = grp.current;
    grp.current = null;
    if (drag && G && moved.current) {
      const blok = sc?.bld[blk];
      const upd: { key: string; des: number; months: Map<string, number> }[] = [];
      for (const c of G.kids) {
        const ns = G.last.get(c.i);
        if (!blok || !ns || c.des == null || !c.months?.size) continue;
        upd.push({ key: obKey(c.des, blok), des: c.des, months: remapMonths(c.months, c.sp, ns) });
      }
      if (blok && upd.length) {
        setObDraft((m) => {
          const next = new Map(m);
          for (const u of upd) {
            if (sameMonths(u.months, obPlan.get(u.des)?.get(blok))) next.delete(u.key);
            else next.set(u.key, u.months);
          }
          return next;
        });
      }
      undoRef.current = {
        oid: drag.oid, blk, span: drag.orig, months: null, res: null, snap: drag.snap ?? null,
        touched: new Set(dragTouched.current),
        obSnap: drag.obSnap ?? null, obResSnap: drag.obResSnap ?? null,
        snapAll: snapAll.current,
      };
      setDragOpen(drag.oid);
      setModal(drag.oid);
      setDrag(null);
      moved.current = false;
      return;
    }
    const blank = !!drag && !moved.current && !far.current && !scroll.current && drag.mode === 'new' && !drag.orig;
    if (drag && blank) {
      commit(drag.oid, { start: msAt(drag.anchor), end: msAt(drag.anchor) });
    }
    const barTap = !!drag && !moved.current && !far.current && !scroll.current && drag.mode !== 'new';
    if (drag && barTap) {
      undoRef.current = null;
      setDragOpen(null);
      setModal(drag.oid);
    }
    /**
     * ЧИРЭЛТЭЭР ТӨЛӨВЛӨСНИЙ ДАРАА САРЫН ЗАДАРГААГ ИЛ ГАРГАНА (2026-09-06,
     * хэрэглэгч: «зураасаар төлөвлөхөд мөн адил гарах ёстой»).
     */
    if (drag && (moved.current || blank)) {
      const r = plan.find((x) => x.oid === drag.oid);
      if (r) {
        setModal(r.oid);
        /*
         * Чирэлт нь `commit`-оор хуваарийг НООРОГТ АЛЬ ХЭДИЙН бичсэн байдаг
         * бөгөөд цонх нь түүний ДАРАА нээгддэг. Гэтэл цонх нь «Тавих /
         * Хаах» гэсэн баталгааны хэлбэртэй тул хэрэглэгч «Хаах» дарахад
         * чирэлт нь ч цуцлагдана гэж ойлгоно. Одоо яг тэгнэ.
         */
        undoRef.current = {
          oid: drag.oid, blk, span: drag.orig, months: drag.origMonths ?? null, res: drag.origRes ?? null, snap: drag.snap ?? null,
          touched: new Set(dragTouched.current),
          obSnap: drag.obSnap ?? null, obResSnap: drag.obResSnap ?? null,
          snapAll: snapAll.current,
        };
        setDragOpen(r.oid);
      }
    }
    setDrag(null);
    moved.current = false;
  };

  const onCancel = () => {
    stopAuto();
    press.current = null;
    grp.current = null;
    if (drag && moved.current && !busy && !locked) {
      rollback({
        oid: drag.oid, blk, span: drag.orig, months: drag.origMonths ?? null, res: drag.origRes ?? null, snap: drag.snap ?? null,
        touched: new Set(dragTouched.current),
        obSnap: drag.obSnap ?? null, obResSnap: drag.obResSnap ?? null,
        snapAll: snapAll.current,
      });
    }
    setDrag(null);
    moved.current = false;
    far.current = false;
    scroll.current = false;
  };

  /**
   * POPUP ХААГДАХАД ЧИРЭЛТИЙГ БУЦААНА (2026-09-30: `PlanModal`-ын `onClose`-оос
   * механикаар салгав — логик · тайлбар ХЭВЭЭР). Цонхыг хааж (`setModal(null)`),
   * чирэлтээр нээгдсэн бол `undoRef`-ийн агшнаар сэргээнэ.
   */
  const undoDragOnClose = () => {
    const u = undoRef.current;
    undoRef.current = null;
    setDragOpen(null);
    setModal(null);
    if (u && !busy && !locked) rollback(u);
  };
  const keepDrag = () => {
    undoRef.current = null;
    setDragOpen(null);
    setModal(null);
  };
  const forgetDrag = () => {
    undoRef.current = null;
    setDragOpen(null);
  };

  /**
   * ЧИРЭЛТЭЭС ӨМНӨХ АГШНААР БУЦААХ (2026-10-01: `undoDragOnClose`-оос салгав —
   * `onCancel` ч ашиглана; логик · тайлбар ХЭВЭЭР).
   */
  function rollback(u: NonNullable<typeof undoRef.current>) {
    const ch = new Map<number, (Span | null)[]>();
    const put = (i: number, sp: Span | null) => {
      const next = plan[i].spans.slice();
      next[u.blk] = sp;
      ch.set(i, next);
    };
    const at = plan.findIndex((x) => x.oid === u.oid);
    if (at >= 0) put(at, u.span);
    if (u.snap) {
      plan.forEach((x, i) => {
        if (i === at) return;
        if (u.touched && !u.touched.has(x.oid)) return;
        const all = u.snapAll?.get(x.oid);
        if (all) {
          const next = x.spans.slice();
          let diff = false;
          for (let b = 0; b < next.length; b++) {
            const s0 = all[b] ?? null;
            if (sameSpan(next[b], s0)) continue;
            const mu = hdMeta.current.get(kS(x.oid, b))?.user;
            if (mu && mu !== meRef.current) continue;
            next[b] = s0; diff = true;
          }
          if (diff) ch.set(i, next);
          return;
        }
        const sp = u.snap!.get(x.oid);
        if (sp === undefined || sameSpan(x.spans[u.blk], sp)) return;
        put(i, sp);
      });
    }
    applyChanges(ch);
    const des = at >= 0 ? plan[at].des : null;
    const blok = sc?.bld[u.blk];
    if (u.months && des != null && blok) {
      const key = obKey(des, blok);
      const months = u.months;
      setObDraft((m) => {
        const next = new Map(m);
        if (sameMonths(months, obPlan.get(des)?.get(blok))) next.delete(key);
        else next.set(key, months);
        return next;
      });
    }
    /* Сарын нөөц ч чирэлтээс өмнөх хуулбараар (2026-09-24) */
    if (u.res && des != null && blok) {
      const key = obKey(des, blok);
      const res = u.res;
      setObResDraft((m) => {
        const next = new Map(m);
        if (sameRes(res, obRes.get(des)?.get(blok))) next.delete(key);
        else next.set(key, res);
        return next;
      });
    }
    if (blok && (u.obSnap || u.obResSnap)) {
      const keys: string[] = [];
      plan.forEach((x, i) => {
        if (i === at || x.des == null) return;
        if (u.touched && !u.touched.has(x.oid)) return;
        keys.push(obKey(x.des, blok));
      });
      const other = (hk: string) => {
        const mu = hdMeta.current.get(hk)?.user;
        return !!mu && mu !== meRef.current;
      };
      if (keys.length && u.obSnap) {
        const snap = u.obSnap;
        setObDraft((m) => {
          const next = new Map(m);
          for (const k of keys) {
            if (other(kM(k))) continue;
            const v = snap.get(k); if (v) next.set(k, v); else next.delete(k);
          }
          return next;
        });
      }
      if (keys.length && u.obResSnap) {
        const snap = u.obResSnap;
        setObResDraft((m) => {
          const next = new Map(m);
          for (const k of keys) {
            if (other(kN(k))) continue;
            const v = snap.get(k); if (v) next.set(k, v); else next.delete(k);
          }
          return next;
        });
      }
    }
  }

  return { undoRef, onDown, onMove, onUp, onCancel, undoDragOnClose, dragOpen, keepDrag, forgetDrag };
}

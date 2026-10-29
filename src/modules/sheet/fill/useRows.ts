import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSchema, pkgFloors, type Pkg, type Schema } from "../bagts.pkg";
import { computeAll, parentIndexes, type SheetRow } from "../bagtsSheet";
import { loadAddedKeys as loadAjilAddedKeys, addedKeyOf, type AddedKey } from '@/lib/ajilBatlah';
import { loadBlockProgress, loadBlockUniverse, pkgProgressOf } from "@/lib/blockProgress";
import { useAsync } from "@/lib/useAsync";
import { bagtsKey, buildingKey, isConstructionNo } from "@/lib/services";
import { inputToMs, type Calc, type SheetView } from "./util";

const NO_KEYS: AddedKey[] = [];

/** oid → «сүүлд нэмэгдсэн» (нэмэлт ажлын хүснэгтээр тулгасан) */
export function useAddedOids(pkg: Pkg, rowsAll: SheetRow[]) {
  /**
   * СҮҮЛД НЭМЭГДСЭН (батлагдаж нийтлэгдсэн) АЖЛЫН МӨРҮҮД — УЛААНААР ХЭВЭЭР
   * (2026-09-22, хэрэглэгч: «шинэ ажил текст нь улаан байх … батлагдсан ч улаан»).
   * Нийтлэгдсэн мөр серверийн oid-той тул `oid < 0` шалгуур хүрэхгүй — нэмэлт
   * ажлын батлах хүснэгтээс (`loadAddedKeys`) эцэг+№+нэрээр тулгана.
   */
  const [addedSt, setAddedSt] = useState<{ pkgKey: string; keys: AddedKey[] }>({ pkgKey: '', keys: [] });
  useEffect(() => {
    let alive = true;
    void loadAjilAddedKeys(pkg.key).then((k) => { if (alive) setAddedSt({ pkgKey: pkg.key, keys: k }); });
    return () => { alive = false; };
  }, [pkg.key]);
  const addedKeys = addedSt.pkgKey === pkg.key ? addedSt.keys : NO_KEYS;
  /**
   * oid → «сүүлд нэмэгдсэн» (нэмэлт ажлын хүснэгтээр тулгасан).
   */
  const addedOids = useMemo(() => {
    const out = new Set<number>();
    if (!addedKeys.length) return out;
    /* түлхүүр → нэрийдлүүд (мөрийн oid, эцгийн индекс) */
    const cands = new Map<string, { oid: number; p: number }[]>();
    for (let i = 0; i < rowsAll.length; i += 1) {
      const r = rowsAll[i];
      if (r.group) continue;
      /* эцэг = дээшээ хайхад өөрөөс гүехэн ЭХНИЙ бүлэг */
      let p = -1;
      for (let k = i - 1; k >= 0; k -= 1) if (rowsAll[k].depth < r.depth) { p = k; break; }
      if (p < 0) continue;
      const key = addedKeyOf(rowsAll[p].no, rowsAll[p].work, r.no, r.work);
      const l = cands.get(key);
      if (l) l.push({ oid: r.oid, p });
      else cands.set(key, [{ oid: r.oid, p }]);
    }
    for (const e of addedKeys) {
      const l = cands.get(e.key);
      if (!l?.length) continue;
      let best = 0;
      for (let j = 1; j < l.length; j += 1) {
        if (Math.abs(l[j].p - e.parentIdx) < Math.abs(l[best].p - e.parentIdx)) best = j;
      }
      out.add(l[best].oid);
      l.splice(best, 1);
    }
    return out;
  }, [rowsAll, addedKeys]);
  return addedOids;
}

/** Бүлгийн ХОЁР ШАТЛАЛТ шүүлт · хуваарийн дагуу шүүлт · эвхэлт → зурагдах мөрийн индекс. */
export function useRowFilter({ rowsAll, calc, nBld, today, grpA, grpB, collapsed, byPlan, asOf }: {
  rowsAll: SheetRow[]; calc: Calc; nBld: number; today: string;
  grpA: number; grpB: number; collapsed: Set<number>; byPlan: boolean;
  asOf?: number | null;
}) {
  /**
   * ӨНӨӨДӨР (UTC шөнө дунд) — хуваарийн шүүлтийн лавлах цэг.
   */
  const todayMs = useMemo(() => inputToMs(today) ?? 0, [today]);

  /**
   * ХУВААРИЙН ДАГУУ — мөр бүр ӨНӨӨДРИЙН (`todayMs`) огноонд ИДЭВХТЭЙ эсэх.
   */
  const planKeep = useMemo(() => {
    const keep = new Array<boolean>(rowsAll.length).fill(false);
    if (!calc.length) return keep.fill(true);
    for (let i = 0; i < rowsAll.length; i++) {
      if (rowsAll[i].group) continue;
      const c = calc[i];
      if (!c) continue;
      for (let b = 0; b < nBld; b++) {
        const s = c.start[b];
        const e = c.end[b];
        /* Хоёр зах ОРНО — эхэлж буй ба дуусч буй өдрийн ажлыг ч бөглөнө. */
        if (s != null && e != null && s <= todayMs && todayMs <= e) { keep[i] = true; break; }
      }
    }
    const par = parentIndexes(rowsAll);
    for (let i = rowsAll.length - 1; i >= 0; i--) {
      if (!keep[i]) continue;
      for (let p = par[i]; p >= 0; p = par[p]) {
        if (keep[p]) break;
        keep[p] = true;
      }
    }
    return keep;
  }, [rowsAll, calc, nBld, todayMs]);

  /** Хуваарьтай (идэвхтэй) НАВЧ мөрийн тоо — товч дээрх заалт */
  const planCount = useMemo(() => {
    let on = 0;
    let all = 0;
    for (let i = 0; i < rowsAll.length; i++) {
      if (rowsAll[i].group) continue;
      all += 1;
      if (planKeep[i]) on += 1;
    }
    return { on, all };
  }, [rowsAll, planKeep]);

  const planOff = false;
  void asOf;

  // Хаагдсан бүлгийн доорх мөрүүд. Гүн буурах хүртэл нуугдана.
  /**
   * Бүлгийн МУЖ — тэр мөрөөс эхлээд, өөрөөсөө ижил буюу дээгүүр гүнтэй
   * дараагийн мөр хүртэл. Мод нь ЗҮРЭГТЭЙ (бүлэг доороо шууд навч агуулж
   * болно) тул тоогоор нь биш, ГҮНЭЭР нь заагийг олно.
   */
  const rangeOf = useCallback(
    (oid: number) => {
      if (!oid) return null;
      const from = rowsAll.findIndex((r) => r.oid === oid);
      if (from < 0) return null;
      let to = rowsAll.length;
      for (let i = from + 1; i < rowsAll.length; i++)
        if (rowsAll[i].depth <= rowsAll[from].depth) {
          to = i;
          break;
        }
      return { from, to };
    },
    [rowsAll],
  );

  const labelOf = (r: SheetRow, pad = 0) =>
    "\u00A0".repeat(pad) + (r.no ? `${r.no} ` : "") + r.work;

  /**
   * ЭЦЭГ бүлгүүд — үе шат (А./Б.), дэд үе шат (Б1…Б5) ба ангилал (1, 2, 3…).
   * Гүнээр нь догол мөрлөнө: сонгогч дотор шатлал нь харагдана.
   */
  const grpAOpts = useMemo(
    () =>
      rowsAll
        .filter((r) => r.group && r.depth <= 2)
        .map((r) => ({ oid: r.oid, label: labelOf(r, r.depth * 3) })),
    [rowsAll],
  );

  /**
   * ДЭД бүлгүүд — «3.2 1F цутгалт» маягийн доод шатны бүлгүүд. Эцэг сонгосон
   * бол ЗӨВХӨН түүний дотоод, эс бөгөөс бүгд.
   */
  const grpBOpts = useMemo(() => {
    const rg = rangeOf(grpA);
    return rowsAll
      .map((r, i) => ({ r, i }))
      .filter(
        (x) =>
          x.r.group &&
          x.r.depth > 2 &&
          (!rg || (x.i > rg.from && x.i < rg.to)),
      )
      .map((x) => ({ oid: x.r.oid, label: labelOf(x.r) }));
  }, [rowsAll, grpA, rangeOf]);

  /**
   * Эцэг солигдоход түүнд харьяалагдахгүй дэд сонголт хүчингүй болно.
   */
  const grpBEff = grpBOpts.some((o) => o.oid === grpB) ? grpB : 0;

  // Дэд бүлэг сонгогдсон бол тэр нь давамгайлна (эцгийнхээ дотор л байдаг).
  const grpRange = useMemo(
    () => rangeOf(grpBEff) ?? rangeOf(grpA),
    [rangeOf, grpA, grpBEff],
  );

  const hidden = useMemo(() => {
    const h = new Array(rowsAll.length).fill(false);
    let depth = -1;
    for (let i = 0; i < rowsAll.length; i++) {
      const r = rowsAll[i];
      // Бүлгийн шүүлтүүр — мужаас гадуурх бүхнийг нууна.
      if (grpRange && (i < grpRange.from || i >= grpRange.to)) {
        h[i] = true;
        continue;
      }

      if (depth >= 0 && r.depth > depth) {
        h[i] = true;
        continue;
      }
      depth = -1;
      if (r.group && collapsed.has(r.oid)) depth = r.depth;
    }
    if (byPlan && !planOff) {
      for (let i = 0; i < h.length; i++) if (!planKeep[i]) h[i] = true;
    }
    return h;
  }, [rowsAll, collapsed, grpRange, byPlan, planOff, planKeep]);

  /** Зурагдах мөрүүдийн ИНДЕКС (нуугдсаныг хассан). */
  const vis = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rowsAll.length; i++) if (!hidden[i] && calc[i]) out.push(i);
    return out;
  }, [rowsAll, hidden, calc]);
  return { planCount, planOff, grpAOpts, grpBOpts, grpBEff, hidden, vis };
}

/** Виртуаль гүйлгээний цонх ба «өөрчлөгдсөн нүд рүү үсрэх». */
export function useVirtualWindow({ vis, edit, view, jump: ownJump }: {
  vis: number[]; edit: { i: number } | null; view?: SheetView;
  jump?: SheetView['jump'];
}) {
  const jumpReq = view?.jump ?? ownJump ?? null;
  /* ── ВИРТУАЛЬ ГҮЙЛГЭЭ ──────────────────────────────────────────────────
   * 1,400 мөр × 60–100 багана = 137 мянган нүд. Бүгдийг DOM-д барьвал төлөв
   * өөрчлөгдөх бүрд (нүд нээх, бөглөх) React тэр бүхнийг харьцуулж, хөтөч
   * дахин байрлуулна — нэг нүд нээхэд 4.5 секунд болж хэмжигдсэн.
   *
   * Тиймээс ЗӨВХӨН харагдах мөрүүдийг (+ дээш/доош 25 мөрийн нөөц) зурж,
   * үлдсэнийг нь өндөртэй ХООСОН мөрөөр орлуулна. Гүйлгэх зурвасны урт ба
   * байрлал яг хэвээр үлдэнэ.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowHRef = useRef(34);
  const [win, setWin] = useState({ from: 0, to: 80 });
  const OVER = 20;

  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!el || !tb) return;
    const first = tb.querySelector("tr[data-r]") as HTMLElement | null;
    if (first?.offsetHeight) rowHRef.current = first.offsetHeight;
    const h = rowHRef.current;
    // Толгойн өндрийг хасна — tbody нь түүнээс доош эхэлдэг.
    const top = Math.max(0, el.scrollTop - tb.offsetTop);
    const from = Math.max(0, Math.floor(top / h) - OVER);
    const to = Math.ceil((top + el.clientHeight) / h) + OVER;
    setWin((w) => (w.from === from && w.to === to ? w : { from, to }));
  }, []);

  // Гүйлгэх бүрд биш, зурагдах хүрээнд НЭГ удаа (rAF) — гүйлгээ жигд байна.
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
    });
  }, [recalcWin]);

  // Мөр/шүүлтүүр солигдоход цонхыг шинэчилнэ.
  useEffect(() => {
    recalcWin();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => recalcWin());
    ro.observe(el);
    return () => ro.disconnect();
  }, [vis, recalcWin]);

  /**
   * Засварлаж буй мөр цонхны ГАДНА үлдэж болохгүй — Enter-ээр доошлоход
   * оролт нь DOM-д байхгүй бол фокус алдагдаж, бичсэн зүйл үрэгдэнэ.
   */
  /**
   * ӨӨРЧЛӨГДСӨН НҮД РҮҮ ҮСРЭХ — жагсаалтаас дарахад.
   */
  const [hitKey, setHitKey] = useState<string | null>(null);
  const jumpN = jumpReq?.n ?? -1;
  /**
   * СҮҮЛД БИЕЛСЭН үсрэлтийн дугаар.
   */
  const doneJumpRef = useRef(-1);
  const hitT = useRef<number | null>(null);
  const jumpTopRef = useRef<number | null>(null);
  useEffect(() => {
    const j = jumpReq;
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!j || !el || !tb || !vis.length) return;
    if (doneJumpRef.current === jumpN) return;
    const at = vis.indexOf(j.row);
    if (at < 0) return;
    doneJumpRef.current = jumpN;
    el.scrollIntoView({ block: "nearest" });
    const top = Math.max(0, tb.offsetTop + at * rowHRef.current - el.clientHeight / 2);
    jumpTopRef.current = top;
    el.scrollTo({ top, behavior: "smooth" });
    const key = `${j.row}:${j.block}:${jumpN}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHitKey(key);
    if (hitT.current) window.clearTimeout(hitT.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpN, vis]);
  // Анивчилтын таймерыг зөвхөн салахад цэвэрлэнэ (эффект бүрд БИШ — эс бөгөөс
  // жагсаалт хөдлөхөд тэмдэглэгээ мөнхөрнө).
  useEffect(() => () => {
    if (hitT.current) window.clearTimeout(hitT.current);
  }, []);
  /**
   * ХӨНДЛӨН ГҮЙЛГЭЛТ — үссэн нүд рүү (2026-10-06, хэрэглэгч: «өөрчлөгдсөн нүд дээр дарахад
   * zoom to хийхгүй»). Дээрх эффект зөвхөн БОСОО гүйлгэдэг байв: 14 блоктой хуудсанд 5/8-аас
   * хойших багана дэлгэцийн гадна тул мөр нь харагдаад нүд нь харагдахгүй, анивчилт ч алга.
   */
  useEffect(() => {
    if (!hitKey) return;
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!el || !tb) return;
    let tries = 0;
    let t: number | null = null;
    const armClear = () => {
      if (hitT.current) window.clearTimeout(hitT.current);
      hitT.current = window.setTimeout(() => setHitKey((h) => (h === hitKey ? null : h)), 1800);
    };
    const go = () => {
      const td = tb.querySelector<HTMLElement>("td.chgHit");
      if (!td) { if (tries++ < 40) t = window.setTimeout(go, 50); else armClear(); return; }
      armClear();
      let fzL = 0;
      let fzR = 0;
      td.parentElement?.querySelectorAll<HTMLElement>("td.fz").forEach((c) => {
        const st = getComputedStyle(c);
        if (st.position !== "sticky") return;
        if (st.left !== "auto") fzL += c.offsetWidth;
        else if (st.right !== "auto") fzR += c.offsetWidth;
      });
      const er = el.getBoundingClientRect();
      const tr = td.getBoundingClientRect();
      const bandL = er.left + fzL;
      const bandR = er.right - fzR;
      if (tr.left >= bandL && tr.right <= bandR) return;
      const target = bandL + (bandR - bandL) / 2 - tr.width / 2;
      el.scrollTo({
        top: jumpTopRef.current ?? el.scrollTop,
        left: Math.max(0, el.scrollLeft + (tr.left - target)),
        behavior: "smooth",
      });
    };
    go();
    return () => { if (t) window.clearTimeout(t); };
  }, [hitKey]);

  const editVis = edit ? vis.indexOf(edit.i) : -1;
  const winFrom = editVis >= 0 ? Math.min(win.from, editVis) : win.from;
  const winTo = editVis >= 0 ? Math.max(win.to, editVis + 1) : win.to;
  return { scrollRef, tbodyRef, rowHRef, onScroll, hitKey, winFrom, winTo };
}

/** Багцын бодит гүйцэтгэл (батлагдсан · ноорогтой) ба нөгөө хувилбарынх. */
export function usePkgPct({ pkg, sc, nBld, rowsAll, calc, asOf, hasObyem, planPct, dirtyCount, ovBase }: {
  pkg: Pkg; sc: Schema | null; nBld: number; rowsAll: SheetRow[]; calc: Calc; asOf: number | null;
  hasObyem: boolean[]; planPct: (row: SheetRow, b: number) => number | null; dirtyCount: number;
  ovBase?: Map<number, SheetRow>;
}) {
  /**
   * БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — ХОЁР тоо (2026-09-09, хэрэглэгчийн хүсэлт).
   *
   *   `saved`   — БАТЛАГДСАН: одоо үндсэн өгөгдөлд байгаа хувь.
   *   `draft`   — ноорог/илгээлтээ НЭМСЭН үеийн хувь.
   */
  /**
   * НӨГӨӨ ХУВИЛБАРЫН (9F ↔ 12F) БАТЛАГДСАН ГҮЙЦЭТГЭЛ.
   */
  const bpQ = useAsync(loadBlockProgress, []);
  const bp = bpQ.state === 'ready' ? bpQ.data : null;
  const uniQ = useAsync(loadBlockUniverse, []);
  const uni = uniQ.state === 'ready' ? uniQ.data : null;

  const otherPkg = useMemo(() => pkgFloors(pkg.group).find((x) => x.key !== pkg.key) ?? null, [pkg.group, pkg.key]);
  const otherScQ = useAsync(
    () => (otherPkg ? loadSchema(otherPkg) : Promise.resolve(null)),
    [otherPkg?.key],
  );
  const otherBld = otherScQ.state === 'ready' ? otherScQ.data?.bld ?? null : null;

  const otherPct = useMemo(() => {
    const others = pkgFloors(pkg.group).filter((x) => x.key !== pkg.key);
    if (!others.length || !bp || !otherBld) return null;
    const g = bagtsKey(pkg.group);
    /* нөгөө хувилбарын ӨӨРИЙН блокууд — давхардсан шошго (4-2: 6/x) ч ОРНО */
    const theirs = new Set(otherBld.map((x) => buildingKey(pkg.group, x)));
    /* ЗӨВХӨН ЭНЭ хуудсанд байгаа блокууд — нөгөөгийнхөөс хасна */
    const onlyMine = new Set((sc?.bld ?? []).map((x) => buildingKey(pkg.group, x)).filter((k) => !theirs.has(k)));
    const keys = new Set<string>(theirs);
    for (const k of uni?.get(g) ?? []) if (k.startsWith(`${g}|`)) keys.add(k);
    for (const key of bp.keys()) if (key.startsWith(`${g}|`)) keys.add(key);
    let sum = 0;
    let n = 0;
    let all = 0;
    for (const key of keys) {
      if (onlyMine.has(key)) continue;
      all += 1;
      const cell = bp.get(key);
      if (cell == null || !Number.isFinite(cell.overall)) continue;
      sum += cell.overall; n += 1;
    }
    if (!all) return null;
    return { pct: sum / all, blocks: n, total: all, floors: others[0].floors, label: `${others[0].floors}F` };
  }, [bp, uni, pkg.group, pkg.key, sc, otherBld]);

  const pkgAll = useMemo((): number | null | undefined => {
    if (!otherPkg) return undefined;
    if (!bp || uniQ.state === 'loading') return null;
    return pkgProgressOf(bp, uni ?? new Map()).get(bagtsKey(pkg.group))?.pct ?? null;
  }, [otherPkg, bp, uni, uniQ.state, pkg.group]);

  const pkgPct = useMemo(() => {
    if (!nBld || !rowsAll.length) return null;
    const bi = rowsAll.findIndex((r) => isConstructionNo(r.no));
    if (bi < 0) return null;
    const avg = (c: ReturnType<typeof computeAll>) => {
      let s = 0;
      for (let b = 0; b < nBld; b += 1) {
        const v = c[bi]?.act[b];
        if (v != null) s += v;
      }
      return (s / nBld) * 100;
    };
    /** Хэмжигдсэн блокийн тоо — шошгонд «12 блок» гэж бичнэ */
    let blocks = 0;
    for (let b = 0; b < nBld; b += 1) if (calc[bi]?.act[b] != null) blocks += 1;
    const draft = avg(calc);
    const base = ovBase && ovBase.size ? rowsAll.map((r) => ovBase.get(r.oid) ?? r) : null;
    const saved = dirtyCount > 0 || base
      ? avg(computeAll(base ?? rowsAll, nBld, asOf, {}, {}, hasObyem, planPct, "abs", !!sc?.synthetic))
      : draft;
    return { saved, draft, blocks, total: nBld };
  }, [calc, rowsAll, nBld, asOf, hasObyem, planPct, dirtyCount, ovBase, sc]);
  const otherPending = !bp && pkgFloors(pkg.group).some((x) => x.key !== pkg.key);
  return { otherPct, pkgPct, otherPending, pkgAll };
}

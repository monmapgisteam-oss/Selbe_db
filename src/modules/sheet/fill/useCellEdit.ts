import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Schema } from "../bagts.pkg";
import { fmtInc, incCell, parseInc, type SheetRow } from "../bagtsSheet";
import { isAmbiguousComma, normCell, parseGrid, planPaste } from "../paste";
import { t as tr } from "@/lib/i18nCore";
import { RO, cellKey, pc, qty, qtyRaw, synNoVol, type EditCell, type EditCol } from "./util";
import { remainOf } from "./remain";
import { askConfirm, hasConfirmHost } from "@/lib/confirm";

/**
 * НҮДНИЙ АСУУЛТ — АПП ДОТОРХ (2026-10-23, UX аудит X1).
 */
let asking: string | null = null;
const NO_ACC: ReadonlySet<string> = new Set();
/** «Тийм» гэж хариулсан асуултууд — ЗӨВХӨН дахин бичих синхрон дуудлагад (`commitInner` эхэндээ уншаад тэглэнэ) */
let accNext: ReadonlySet<string> = NO_ACC;

/**
 * «ХЭТЭРСЭН ҮҮ» — хөвөгч цэгийн хүлцэлтэй (2026-09-30).
 */
const EPS = 1e-9;
const overVol = (x: number, vol: number) => x > vol * (1 + EPS);
const overPct = (x: number) => x > 1 + EPS;

export type PastePrev = {
  startI: number; startB: number; grid: string[][]; rows: SheetRow[];
  ok: Set<string>; rej: Map<string, string>;
};

export function useCellEdit(p: {
  sc: Schema | null;
  fillMode: "obyem" | "pct";
  pending: Record<string, string>;
  setPending: Dispatch<SetStateAction<Record<string, string>>>;
  edit: EditCell | null;
  setEdit: Dispatch<SetStateAction<EditCell | null>>;
  setErr: Dispatch<SetStateAction<string>>;
  warn: (msg: string) => void;
  done: (msg: string) => void;
  /** `${oid}:${b}` → хяналтад байгаа нэмэлт (`useReviewInc`) */
  reviewInc: Map<string, { n: number | null; a: number | null }>;
  revert: (key: string, wasPending: boolean) => void;
  mineRef: RefObject<Set<string>>;
  touchMine: (key: string) => void;
  locked: boolean;
  noEdit: boolean;
  canPerf: boolean;
  perfWhy?: string | null;
  busy: boolean;
  editing: boolean;
  rowsAll: SheetRow[];
  vis: number[];
  hidden: boolean[];
  nBld: number;
  restoring?: boolean;
  pastePrev?: PastePrev | null;
  setPastePrev?: (v: PastePrev | null) => void;
  okLock?: (oid: number, b: number) => boolean;
}) {
  const {
    sc, fillMode, pending, setPending, edit, setEdit, setErr, warn, done, reviewInc, revert, mineRef, touchMine,
    locked, noEdit, canPerf, perfWhy, busy, editing, rowsAll, vis, hidden, nBld, restoring,
    pastePrev = null, setPastePrev, okLock,
  } = p;
  /**
   * БУУЛГАЛТЫН УРЬДЧИЛСАН ХАРАГДАЦ (2026-10-01, хэрэглэгч: бүгдийг зас).
   */

  /**
   * ҮЛДЭГДЭЛ-ИЙН ТАЙЛБАР — «үлдэгдэл = Обьём − архив − хяналтад − ноорог» (2026-10-01).
   * @param base давхарлалтын СУУРЬ (архивын) мөр — `ovBase`; байхгүй бол `r` нь өөрөө архив.
   */
  const remainHint = (r: SheetRow, b: number, base?: SheetRow): string => {
    if (r.group || !volMode(r, b)) return "";
    const vol = r.vol != null && r.vol > 0 ? r.vol : null;
    if (vol == null) return "";
    const volOf = (x: SheetRow) => x.obyem[b] ?? (x.act[b] != null ? (x.act[b] as number) * vol : null);
    const arch = volOf(base ?? r);
    const now = volOf(r);
    const staged = base ? (now ?? 0) - (arch ?? 0) : 0;
    const ri = reviewInc.get(cellKey(r.oid, b));
    const other = ri?.n != null ? ri.n : ri?.a != null ? ri.a * vol : 0;
    const d = parseInc(pending[cellKey(r.oid, b)]);
    const draft = d ? d.n + d.p * vol : 0;
    const rem = remainOf(vol, arch, staged + other, draft);
    if (rem == null) return "";
    const f = (x: number) => (fillMode === "pct" ? pc(x / vol, 1) : qty(x));
    return tr('үлдэгдэл = Обьём − архив − хяналтад − ноорог = {0} − {1} − {2} − {3} = {4}',
      f(vol), f(arch ?? 0), f(staged + other), f(draft), f(rem));
  };
  /**
   * ОБЬЁМЫН нүд бичигдэх үү — талбар нь байгаа БҮХ ажлын мөрд ТИЙМ.
   * Хуудсан дээрх ЦОРЫН ГАНЦ бөглөх цэг (мөрийн Обьёмоос гадна).
   */
  const volMode = (r: { group: boolean; vol?: number | null }, b: number) =>
    !r.group && (fillMode === "pct" || !!sc?.obyem[b]) && !synNoVol(sc, r);
  const isOkLocked = (r: { oid: number }, b: number) => !!okLock?.(r.oid, b);
  const writable = (r: SheetRow, b: number) => volMode(r, b) && !isOkLocked(r, b);

  /**
   * ХУВЬ ГОРИМД БИЧИХ БОЛОМЖТОЙ ЮУ.
   */
  const pctOnly = (r: { group: boolean }, b: number) =>
    fillMode === "pct" && !r.group && !sc?.obyem[b];

  /**
   * НҮД НЭЭХЭД ОРОЛТОД ТАВИХ ТОО — ОДООГИЙН горимын нэгжээр.
   */
  const cellSeed = (r: SheetRow, b: number): string => {
    const d = parseInc(pending[cellKey(r.oid, b)]);
    if (!d) return "";
    const vol = r.vol != null && r.vol > 0 ? r.vol : null;
    if (fillMode === "pct") {
      /* Обьёмын нэмэлтийг хувь руу — мөрийн Обьёмгүй бол илэрхийлэх аргагүй */
      if (vol == null) return d.p !== 0 ? String(Math.round(d.p * 1e6) / 1e4) : "";
      const p = d.p + (d.n !== 0 ? d.n / vol : 0);
      return String(Math.round(p * 1e6) / 1e4);
    }
    /* Хувийн нэмэлтийг обьём руу — мөрийн Обьёмгүй бол хоосон (бодох аргагүй) */
    if (vol == null) return d.n !== 0 ? qtyRaw(d.n) : "";
    return qtyRaw(d.n + (d.p !== 0 ? d.p * vol : 0));
  };
  /**
   * ОДООГИЙН ГОРИМД ИЛЭРХИЙЛЭГДЭХГҮЙ НӨГӨӨ ХЭСЭГ (2026-09-30) — мөрийн Обьёмгүй ажилд обьём
   * ба хувь ТУСДАА багана тул нэг нүдэнд хоёулаа хуримтлагдаж болно («15 %10»,
   * `bagtsSheet.parseInc`). Обьём горимд хувийн, Хувь горимд обьёмын хэсэг.
   */
  const otherPart = (r: SheetRow, key: string): { n: number; p: number } => {
    const vol = r.vol != null && r.vol > 0 ? r.vol : null;
    const d = parseInc(pending[key]);
    if (vol != null || !d) return { n: 0, p: 0 };
    return fillMode === "pct" ? { n: d.n, p: 0 } : { n: 0, p: d.p };
  };
  /** Оролтын `placeholder` — ӨМНӨХ нийт (одоогийн горимын нэгжээр). `null` бол «—» (0 БИШ). */
  const prevHint = (r: SheetRow, b: number): string => {
    const storedPct = r.vol != null && r.vol > 0 && r.obyem[b] != null
      ? r.obyem[b]! / r.vol
      : sc?.synthetic && r.obyem[b] == null ? null : r.act[b];
    const v = fillMode === "pct" ? (storedPct == null ? "" : pc(storedPct, 1)) : qty(r.obyem[b]);
    const ri = reviewInc.get(cellKey(r.oid, b));
    const rv = ri ? (fillMode === "pct" ? (ri.a == null ? "" : pc(ri.a, 1)) : (ri.n == null ? "" : qty(ri.n))) : "";
    return rv
      ? tr('өмнөх: {0} · + хяналтад: {1}', v || '—', rv)
      : tr('өмнөх: {0}', v || '—');
  };


  /**
   * Нүдний засвар — блокийн ОБЬЁМ эсвэл мөрийн Обьём. Гүйцэтгэлийн хувь
   * энд ОРОХГҮЙ: тэр нь обьёмоос бодогдоно.
   */

  const commitInner = (r: SheetRow, b: number, raw: string): boolean => {
    const key = cellKey(r.oid, b);
    const acc = accNext;
    accNext = NO_ACC;
    /** Асуулт (`asking`) — үргэлж `false` буцаана; «Тийм» бол `id`-г зөвшөөрөөд дахин бичнэ */
    const ask = (id: string, msg: string): false => {
      const tag = `${key}|${raw}`;
      const host = hasConfirmHost();
      if (host && asking === tag) return false;
      if (host) asking = tag;
      void askConfirm(msg).then((yes) => {
        if (asking === tag) asking = null;
        if (!yes) return;
        const next = new Set(acc);
        next.add(id);
        accNext = next;
        /* `commit` — зөвшөөрөгдсөн нүдний түгжээг ДАХИН шалгаж, амжилттай бол нүдийг хаана */
        commit(r, b, raw);
      });
      return false;
    };
    if (fillMode === "obyem" && /%\s*$/.test(raw.trim())) {
      warn(`${sc?.bld[b] ?? ""} · ${r.work}: ${tr('Хувь бичихдээ «Хувь» горимд оруулна уу')}`);
      return false;
    }
    const t0 = raw.trim() === "" ? "" : normCell(raw);
    if (r.group) return false;
    if (t0 === null && isAmbiguousComma(raw)) {
      warn(tr('{0} · {1}: «{2}» — таслал мянгатын эсвэл аравтын тэмдэг болох нь тодорхойгүй. 1250 эсвэл 1.25 гэж бичнэ үү.', sc?.bld[b] ?? "", r.work, raw.trim()));
      return false;
    }
    const t = t0 ?? "";
    if (t0 === null) {
      warn(tr('{0} · {1}: тоон утга оруулна уу.', sc?.bld[b] ?? "", r.work));
      return false;
    }

    /* ══ ХУВИАР БӨГЛӨХ ГОРИМ (2026-09-06) ══════════════════════════════
     * Утга нь `pending`-д `"%50"` гэж хадгалагдана — `bagtsSheet.cellObyem`
     * ба `cellPct` хоёулаа энэ угтварыг таьна. Ингэснээр ноорог, илгээлт,
     * overlay гэсэн доод сувгууд огт хөндөгдөхгүй (бүгд мөр зөөдөг).
     */
    /* ══ НЭМЭЛТИЙН ГОРИМ (2026-09-25, хэрэглэгчийн шийдвэр) ══════════════
     * Бичсэн тоо = ӨМНӨХ бөглөлтөөс хойш хийсэн обьём (хувь горимд — хувь).
     * `pending`-д НЭМЭЛТ хадгалагдана (`"15"` · `"%10"`); нүдэнд суурь + нэмэлт
     * харагдана (`computeAll(…, "inc")`), батлахад архивын СҮҮЛИЙН утга дээр
     * нэмэгдэнэ. Урьд нь (2026-08-20 — 2026-09-25) энд «НИЙТ хуримтлал»
     * бичигддэг байв; тэр шийдвэрийг хэрэглэгч 2026-09-25-нд БУЦААВ.
     */
    const isPct = fillMode === "pct";
    const incN = t === "" ? 0 : Number(t);
    if (t === "") {
      const d0 = parseInc(pending[key]);
      if (d0 && (d0.n !== 0 || d0.p !== 0) && cellSeed(r, b) === "") return true;
    }
    const keep = otherPart(r, key);
    const hasKeep = keep.n !== 0 || keep.p !== 0;
    if (incN === 0 && hasKeep) {
      /* Зөвхөн ОДООГИЙН горимын хэсгийг буцаана — нөгөө хэсэг үлдэнэ */
      setErr("");
      setPending((pv) => ({ ...pv, [key]: fmtInc(keep) }));
      mineRef.current.add(key);
      touchMine(key);
      return true;
    }
    if (incN === 0) {
      /* Засвараа буцаасан — «нийтлээгүй» тэмдэглэгээ арилна. `revert`-ийн дүрэм:
         pending-д байгаагүй нүдэнд буцаалт нь tombstone биш (2026-09-21). */
      setErr("");
      setPending((pv) => {
        if (!(key in pv)) return pv;
        const n = { ...pv };
        delete n[key];
        return n;
      });
      revert(key, key in pending);
      return true;
    }
    const nv = hasKeep
      ? fmtInc({ n: (isPct ? 0 : incN) + keep.n, p: (isPct ? incN / 100 : 0) + keep.p })
      : isPct ? `%${incN}` : String(incN);
    const res = incCell(r, b, nv, !!sc?.obyem[b]);
    const vol = r.vol;
    const storedPct = vol != null && vol > 0 && r.obyem[b] != null ? r.obyem[b]! / vol : r.act[b];
    /** Өмнөх ба шинэ НИЙТ — одоогийн горимын нэгжээр (баталгаажуулалтад) */
    const before = isPct ? storedPct : r.obyem[b];
    const after = isPct ? (res ? res.act : storedPct) : (res ? res.obyem : r.obyem[b]);
    const fmt = (x: number | null) => (isPct ? pc(x, 1) : qty(x));
    if (incN < 0 && !acc.has('neg'))
      return ask('neg',
        tr(
          '{0} · {1}:\nөмнө нь {2} бүртгэгдсэн — {3} болж БУУРНА.\nБуруу бичсэнээ засаж байна уу?',
          sc?.bld[b] ?? "",
          r.work,
          fmt(before ?? 0),
          fmt(after ?? 0),
        ),
      );
    const pctAfter = res ? res.act : storedPct;
    if (
      incN > 0 &&
      pctAfter != null &&
      storedPct != null &&
      pctAfter < storedPct &&
      !acc.has('down')
    )
      return ask('down',
        tr(
          '{0} · {1}:\nөмнө нь {2} бүртгэгдсэн (хувиар) — нэмэлт бичихэд обьём 0-ээс эхэлж {3} болж БУУРНА.\nҮргэлжлүүлэх үү?',
          sc?.bld[b] ?? "",
          r.work,
          pc(storedPct, 1),
          pc(pctAfter, 1),
        ),
      );
    const revN = reviewInc.get(key)?.n ?? null;
    const afterAll = after != null && revN != null && revN > 0 ? after + revN : after;
    if (
      !isPct &&
      incN > 0 &&
      afterAll != null &&
      vol != null &&
      vol > 0 &&
      overVol(afterAll, vol) &&
      !acc.has('vol')
    )
      return ask('vol',
        revN != null && revN > 0
          ? tr(
            '{0} · {1}:\n{2} + хяналтад байгаа {3} = {4} нь мөрийн Обьём {5}-оос ХЭТЭРЧ байна ({6}).\nҮргэлжлүүлэх үү?',
            sc?.bld[b] ?? "",
            r.work,
            qty(after),
            qty(revN),
            qty(afterAll),
            qty(vol),
            pc(afterAll / vol, 1),
          )
          : tr(
            '{0} · {1}:\n{2} нь мөрийн Обьём {3}-оос ХЭТЭРЧ байна ({4}).\nҮргэлжлүүлэх үү?',
            sc?.bld[b] ?? "",
            r.work,
            qty(afterAll),
            qty(vol),
            pc(afterAll / vol, 1),
          ),
      );
    const revA = reviewInc.get(key)?.a ?? null;
    const pctAll = isPct && after != null ? after + (revA != null && revA > 0 ? revA : 0) : null;
    if (
      isPct &&
      incN > 0 &&
      pctAll != null &&
      overPct(pctAll) &&
      !acc.has('pct')
    )
      return ask('pct',
        tr(
          '{0} · {1}:\nнийт {2} болж 100%-иас ХЭТЭРЧ байна.\nҮргэлжлүүлэх үү?',
          sc?.bld[b] ?? "",
          r.work,
          pc(pctAll, 1),
        ),
      );
    setErr("");
    if (isPct && incN > 0 && incN < 1) {
      warn(tr('{0} · {1}: {2}% гэж бичигдлээ. {3}% гэх гэсэн бол засна уу — хувийг 0–100-аар бичнэ.',
        sc?.bld[b] ?? "", r.work, String(incN), String(parseFloat((incN * 100).toPrecision(12)))));
    }
    setPending((pv) => ({ ...pv, [key]: nv }));
    /* 2026-09-21: буцаасан бол tombstone, бичсэн бол агшин (`Draft.byAt`/`del`).
       Дахин аудит: pending-д байгаагүй нүдэнд ижил утга бичих нь буцаалт БИШ
       (`revert`-ийн тайлбар) — нөгөө талын ирээгүй бичилтийг устгахгүй. */
    mineRef.current.add(key);
    touchMine(key);
    return true;
  };
  const clearLocked = (r: SheetRow, b: number): boolean => {
    const key = cellKey(r.oid, b);
    if (!isOkLocked(r, b) || !(key in pending)) return false;
    setPending((pv) => {
      if (!(key in pv)) return pv;
      const n = { ...pv };
      delete n[key];
      return n;
    });
    revert(key, true);
    return true;
  };
  const commit = (r: SheetRow, b: number, raw: string): boolean => {
    if (isOkLocked(r, b)) { warn(RO.okLocked); setEdit(null); return false; }
    const ok = commitInner(r, b, raw);
    if (ok || r.group) setEdit(null);
    return ok;
  };

  /** Enter/Tab — дараагийн засварлаж болох мөр рүү (баганадаа доошоо). */
  /**
   * Enter/Tab дарахад дараагийн БИЧИГДЭХ нүд. Багана бүр өөрийн дүрэмтэй
   * тул `col`-оор шүүнэ — эс тэгвэл бичиж болохгүй нүд нээгдэж, бөглөсөн
   * тоо чимээгүй алдагдана.
   */
  /**
   * ОЛОН НҮДЭНД БУУЛГАХ — Excel-ээс хуулсан БЛОКИЙГ нэг дор бичнэ.
   */
  const pasteBlock = (startI: number, startB: number, text: string): boolean => {
    if (!sc) return false;
    if (locked || noEdit || !canPerf) {
      warn(locked ? RO.viewOnly : (perfWhy ?? RO.noPerf));
      return true;
    }
    if (busy) { warn(RO.busy); return true; }
    if (restoring) { warn(RO.restoring); return true; }
    if (!editing) { warn(RO.notEditing); return true; }
    const grid = parseGrid(text);
    /* Нэг нүдний энгийн буулгалт бол ердийн замаар нь явуулна */
    if (grid.length === 1 && grid[0].length === 1) {
      const one = grid[0][0];
      if (edit || one === '') return false;
      const r0 = rowsAll[startI];
      if (!r0 || !volMode(r0, startB)) return false;
      if (isOkLocked(r0, startB)) { warn(RO.okLocked); return true; }
      commit(r0, startB, one);
      return true;
    }

    return runPaste(startI, startB, grid, false);
  };

  /** Урьдчилсан харагдацын «Бичих» — ОДООГИЙН мөр/шүүлтээр дахин төлөвлөж бичнэ */
  const confirmPaste = () => {
    const pv = pastePrev;
    setPastePrev?.(null);
    if (!pv) return;
    if (locked || noEdit || !canPerf) { warn(locked ? RO.viewOnly : (perfWhy ?? RO.noPerf)); return; }
    if (busy) { warn(RO.busy); return; }
    if (restoring) { warn(RO.restoring); return; }
    if (!editing) { warn(RO.notEditing); return; }
    if (pv.rows !== rowsAll) { warn(tr('Хүснэгт шинэчлэгдсэн тул буулгалт цуцлагдлаа — дахин буулгана уу.')); return; }
    runPaste(pv.startI, pv.startB, pv.grid, true);
  };
  const cancelPaste = () => setPastePrev?.(null);

  const runPaste = (startI: number, startB: number, grid: string[][], confirmed: boolean): boolean => {
    if (!sc) return false;
    /* Шинэ буулгалт өмнөх урьдчилсан харагдацыг орлоно */
    if (!confirmed && pastePrev) setPastePrev?.(null);
    const from = vis.indexOf(startI);
    if (from < 0) return false;

    const { hits: raw, skipped, bad, badAt, rejAt } = planPaste(
      grid, vis, sc.bld.length, from, startB,
      (row, b) => writable(rowsAll[row], b),
      { noPct: fillMode === "obyem" },
    );
    if (!confirmed && setPastePrev && rejAt.length > 0 && raw.length > 0) {
      const why = (w: 'bad' | 'neg' | 'noWrite' | 'pct', row: number, b: number) =>
        w === 'neg'
          ? tr('сөрөг утга — буулгалтаар бууруулахгүй (нүд тус бүрээр залруулна)')
          : w === 'pct'
            ? tr('Хувь бичихдээ «Хувь» горимд оруулна уу')
          : w === 'noWrite'
            ? (rowsAll[row]?.group ? RO.groupAct : rowsAll[row] && synNoVol(sc, rowsAll[row]) ? RO.synNoVol
              : rowsAll[row] && isOkLocked(rowsAll[row], b) ? RO.okLocked : RO.noObyemField)
            : tr('тоо гэж уншиж чадсангүй (тодорхойгүй таслал «1,250» эсвэл тоо биш)');
      setPastePrev({
        startI, startB, grid, rows: rowsAll,
        ok: new Set(raw.map((x) => cellKey(rowsAll[x.row].oid, x.b))),
        rej: new Map(rejAt.map((x) => [cellKey(rowsAll[x.row].oid, x.b), `«${x.raw}» — ${why(x.why, x.row, x.b)}`] as const)),
      });
      warn(tr('Буулгалт: {0} нүд бичигдэнэ, {1} нүд татгалзагдана (улаан ✕). Хүснэгтийн дээрх «Бичих» эсвэл «Болих»-ийг сонгоно уу.', String(raw.length), String(rejAt.length)));
      return true;
    }
    const isPct = fillMode === "pct";
    const hits = raw.map((x) => {
      const r = rowsAll[x.row];
      const keep = otherPart(r, cellKey(r.oid, x.b));
      const hasKeep = keep.n !== 0 || keep.p !== 0;
      const v = hasKeep
        ? fmtInc({ n: (isPct ? 0 : Number(x.v)) + keep.n, p: (isPct ? Number(x.v) / 100 : 0) + keep.p })
        : isPct ? `%${Number(x.v)}` : x.v;
      const res = incCell(r, x.b, v, !!sc.obyem[x.b]);
      return {
        /** Тэг нэмэлт үед үлдэх нөгөө хэсэг (`""` = байхгүй) */
        keepStr: hasKeep ? fmtInc(keep) : "",
        key: cellKey(r.oid, x.b),
        /** `pending`-д бичигдэх ТҮҮХИЙ мөр (горимын дүрмээр) — НЭМЭЛТ */
        v,
        /** Нэмэлтийн ТОО (горимын нэгжээр); 0 = өөрчлөлтгүй */
        n: isPct ? Number(x.v) / 100 : Number(x.v),
        raw: Number(x.v),
        r,
        b: x.b,
        /** Шинэ НИЙТ (горимын нэгжээр) */
        after: isPct ? (res ? res.act : null) : (res ? res.obyem : null),
        /** Өмнөх ба шинэ ХУВЬ (0–1) — «БУУРНА» асуулт хоёр горимд ХУВИАР (`commit`-ийн
            2026-09-30: Обьём горимд `obyem = null` хуучин хувийн нүд асуултгүй буурдаг байв) */
        pBefore: r.vol != null && r.vol > 0 && r.obyem[x.b] != null ? r.obyem[x.b]! / r.vol : r.act[x.b],
        pAfter: res ? res.act : null,
      };
    });

    if (!hits.length) {
      warn(bad
        ? tr("Буулгасан утгууд тоо биш байна — юу ч бичигдсэнгүй.")
        : tr("Буулгах боломжтой нүд таарсангүй."));
      return true;
    }

    /* ── НЭГ УДААГИЙН БАТАЛГААЖУУЛАЛТ ── */
    const down = hits.filter((x) => x.pAfter != null && x.pBefore != null && x.pAfter < x.pBefore);
    const revOf = (x: { key: string }) => {
      const ri = reviewInc.get(x.key);
      const v = isPct ? ri?.a : ri?.n;
      return v != null && v > 0 ? v : 0;
    };
    const over = isPct
      ? hits.filter((x) => x.after != null && overPct(x.after + revOf(x)))
      : hits.filter((x) => x.after != null && x.r.vol != null && (x.r.vol as number) > 0 && overVol(x.after + revOf(x), x.r.vol as number));
    const small = isPct ? hits.filter((x) => x.raw > 0 && x.raw < 1) : [];
    if (down.length || over.length || small.length) {
      const parts: string[] = [];
      if (down.length) parts.push(tr("{0} нүдэнд утга БУУРНА", String(down.length)));
      if (over.length) {
        parts.push(isPct
          ? tr("{0} нүдэнд 100%-иас ХЭТЭРНЭ", String(over.length))
          : tr("{0} нүдэнд мөрийн Обьёмоос ХЭТЭРНЭ", String(over.length)));
      }
      if (small.length) {
        const ex = small[0].raw;
        parts.push(tr("{0} нүдэнд 1%-иас бага утга (жиш. {1}% — {2}% гэх гэсэн бол Excel-ийн бутархайг 100-аар үржүүлж дахин буулгана уу; хувийг 0–100-аар бичнэ)",
          String(small.length), String(ex), String(parseFloat((ex * 100).toPrecision(12)))));
      }
      void askConfirm(tr("{0} нүд бичих гэж байна.\n{1}.\nҮргэлжлүүлэх үү?", String(hits.length), parts.join("; ")))
        .then((yes) => { if (yes) apply(); });
      return true;
    }
    apply();
    return true;

    function apply() {
    if (!sc) return;
    setErr("");
    {
      const pv = pending;
      const upd = (prev: Record<string, string>) => {
        const n = { ...prev };
        for (const x of hits) {
          const same = x.n === 0;
          if (same && x.keepStr) n[x.key] = x.keepStr;
          else if (same) delete n[x.key];
          else n[x.key] = x.v;
        }
        return n;
      };
      for (const x of hits) {
        /* Тэг нэмэлт = өөрчлөлтгүй → «нийтлээгүй» тэмдэглэгээг арилгана (2026-09-25). */
        const same = x.n === 0;
        /* 2026-09-21: буцаасан бол tombstone, бичсэн бол агшин (`Draft.byAt`/`del`).
           Дахин аудит: pending-д (`pv`) байгаагүй нүдэнд ижил утга бичих нь
           буцаалт БИШ — `revert`-ийн тайлбар (Б-гийн ирээгүй бичилтийг хамгаална). */
        if (same && !x.keepStr) revert(x.key, x.key in pv);
        else { mineRef.current.add(x.key); touchMine(x.key); }
      }
      setPending(upd);
    }
    setEdit(null);
    if (bad) {
      const ex = badAt
        .map((x) => `${sc.bld[x.b] ?? ""} · ${rowsAll[x.row]?.work ?? ""}: «${x.raw}»`)
        .join("; ");
      warn(tr('{0} нүд бичигдлээ · {1} утгыг тоо гэж уншиж чадсангүй (тодорхойгүй таслал «1,250», сөрөг эсвэл тоо биш) — бичигдсэнгүй: {2}', String(hits.length), String(bad), ex + (bad > badAt.length ? ' …' : '')));
    } else {
      done(skipped
        ? tr("{0} нүд бичигдлээ · {1} алгасав", String(hits.length), String(skipped))
        : tr("{0} нүд бичигдлээ", String(hits.length)));
    }
    }
  };

  const nextEditable = (i: number, b: number, step: number, col: EditCol) => {
    const ok = (r: SheetRow) => writable(r, b);
    for (let k = i + step; k >= 0 && k < rowsAll.length; k += step)
      if (!hidden[k] && ok(rowsAll[k])) return { i: k, b, col };
    return null;
  };
  /**
   * ХАЖУУ ТИЙШ — нэг мөрөнд дараагийн бөглөгдөх блок (Tab). Мөрийн төгсгөлд
   * дараагийн (Shift: өмнөх) мөрийн эхний (сүүлийн) блок руу ороолдоно.
   */
  const nextBlockEditable = (i: number, b: number, step: number) => {
    let k = i;
    let bb = b + step;
    while (k >= 0 && k < rowsAll.length) {
      if (!hidden[k]) {
        for (; bb >= 0 && bb < nBld; bb += step)
          if (writable(rowsAll[k], bb)) return { i: k, b: bb, col: "obyem" as EditCol };
      }
      k += step;
      bb = step > 0 ? 0 : nBld - 1;
    }
    return null;
  };
  return {
    volMode, pctOnly, cellSeed, prevHint, commit, pasteBlock, nextEditable, nextBlockEditable,
    /* 2026-10-01 */
    remainHint, confirmPaste, cancelPaste,
    /* 2026-10-09 (аудит №3) */
    clearLocked,
  };
}

/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — МӨРИЙН харагдац — нэмэлт мөрийн улаан тэмдэг · бүлэг/хуваарийн шүүлт · виртуаль гүйлгээ · багцын хувь.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pkgFloors, type Pkg, type Schema } from "../bagts.pkg";
import { computeAll, parentIndexes, type SheetRow } from "../bagtsSheet";
/*
 * ⚠️ НЭМЭЛТ АЖИЛ ЭНД НЭМЭГДЭХГҮЙ (2026-09-24, хэрэглэгчийн шийдвэр): бүлэгт «+»
 *    мөр нэмэх, «Нэмэлт ажил батлуулах», илгээлтээ татах — бүгд «Хуваарь»
 *    (`Huvaari.tsx`) руу шилжсэн; батлагдсан мөр `ajilApply.materializeAdds`-аар
 *    ШУУД үндсэн хүснэгтэд бичигдэж, энд ердийн (эерэг oid) мөр болж ирнэ.
 *    Энд зөвхөн батлагдсан нэмэлт мөрийн УЛААН тэмдэглэгээ (`loadAddedKeys`/
 *    `addedKeyOf`) үлдэнэ. `submitAjil`/`withdrawAjil`/`decideAjil` импортлохгүй.
 */
import { loadAddedKeys as loadAjilAddedKeys, addedKeyOf, type AddedKey } from '@/lib/ajilBatlah';
import { loadBlockProgress, loadBlockUniverse } from "@/lib/blockProgress";
import { useAsync } from "@/lib/useAsync";
import { bagtsKey, isConstructionNo } from "@/lib/services";
import { inputToMs, type Calc, type SheetView } from "./util";

const NO_KEYS: AddedKey[] = [];

/** oid → «сүүлд нэмэгдсэн» (нэмэлт ажлын хүснэгтээр тулгасан) */
export function useAddedOids(pkg: Pkg, rowsAll: SheetRow[]) {
  /**
   * СҮҮЛД НЭМЭГДСЭН (батлагдаж нийтлэгдсэн) АЖЛЫН МӨРҮҮД — УЛААНААР ХЭВЭЭР
   * (2026-09-22, хэрэглэгч: «шинэ ажил текст нь улаан байх … батлагдсан ч улаан»).
   * Нийтлэгдсэн мөр серверийн oid-той тул `oid < 0` шалгуур хүрэхгүй — нэмэлт
   * ажлын батлах хүснэгтээс (`loadAddedKeys`) эцэг+№+нэрээр тулгана.
   * ⚠️ Бүх хэрэглэгчид (эрх шаардахгүй) — тэмдэглэгээ л; уншигдахгүй бол хоосон.
   */
  /* ⚠️ 2026-09-30: БАГЦААР ТҮЛХҮҮРЛЭСЭН төлөв — багц солиход шууд хоосон, эффект доторх
     `setAddedKeys([])` хасагдав (setState зөвхөн уншилт буусны дараа). Утга ижил. */
  const [addedSt, setAddedSt] = useState<{ pkgKey: string; keys: AddedKey[] }>({ pkgKey: '', keys: [] });
  useEffect(() => {
    let alive = true;
    void loadAjilAddedKeys(pkg.key).then((k) => { if (alive) setAddedSt({ pkgKey: pkg.key, keys: k }); });
    return () => { alive = false; };
  }, [pkg.key]);
  const addedKeys = addedSt.pkgKey === pkg.key ? addedSt.keys : NO_KEYS;
  /**
   * oid → «сүүлд нэмэгдсэн» (нэмэлт ажлын хүснэгтээр тулгасан).
   *
   * ⚠️ НЭР + ОЙРХНЫ ДҮРЭМ (2026-09-23, аудитын #17): (эцгийн № + нэр) хос
   *    ДАВХАРДДАГ — Багц 1-д «10 · БУСАД АЖИЛ» блок бүрт нэг. Зөвхөн нэрээр
   *    тулгавал ӨӨР БЛОКИЙН ижил нэртэй мөр ч улаан болдог байв. Одоо
   *    `sheetFrame.parentOf`-той ИЖИЛ дүрэм: нэрээр таарах бүх нэрийдлээс
   *    нэмсэн үеийн эцгийн байрлалд (`parentIdx`) ХАМГИЙН ОЙРХОНЫГ нэг л
   *    удаа сонгоно (сонгогдсон нэрийдэл дараагийн тэмдэглэгээнд дахин
   *    орохгүй).
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
export function useRowFilter({ rowsAll, calc, nBld, today, grpA, grpB, collapsed, byPlan }: {
  rowsAll: SheetRow[]; calc: Calc; nBld: number; today: string;
  grpA: number; grpB: number; collapsed: Set<number>; byPlan: boolean;
}) {
  /**
   * ӨНӨӨДӨР (UTC шөнө дунд) — хуваарийн шүүлтийн лавлах цэг.
   *
   * ⚠️ `asOf` БИШ. `asOf` нь ТАЙЛАНГИЙН огноо — тухайн хуудсыг сүүлд хэзээ
   * бөглөснийг заана (Багц 1-д 2026-07-20, зургаан долоо хоногийн өмнөх).
   * Түүгээр шүүвэл «өнөөдөр юу бөглөх вэ» гэдэгт биш «сүүлийн тайлангийн
   * өдөр юу явж байсан бэ» гэдэгт хариулна — хэрэглэгч 2026-07-20 гэсэн
   * тоог хараад эргэлзсэн (2026-09-01). Тайлангийн огноог хөндөхгүй:
   * тэр нь хадгалагддаг утга, шүүлт нь зөвхөн ХАРАГДАЦ.
   */
  const todayMs = useMemo(() => inputToMs(today) ?? 0, [today]);

  /**
   * ХУВААРИЙН ДАГУУ — мөр бүр ӨНӨӨДРИЙН (`todayMs`) огноонд ИДЭВХТЭЙ эсэх.
   *
   * ⚠️ ЗӨВХӨН НАВЧ мөрийг шалгана, бүлгийг ДАГУУЛНА. `calc[i].start` нь
   * бүлэгт хүүхдүүдийнхээ MIN/MAX (`startSrc: "agg"`) тул хоёр хүүхдийн
   * ХООРОНДОХ ЦООРХОЙД огноо таарвал бүлэг «идэвхтэй» болж, доор нь нэг ч
   * ажилгүй ХООСОН бүлэг гарна. Тиймээс навчаар шийдээд эцгүүдийг нь дээш
   * нь тэмдэглэнэ — ингэснээр үлдсэн ажлын бүх эцэг харагдаж, мод бүтэн үлдэнэ.
   *
   * ⚠️ Блокоор нэгтгэхдээ АЛЬ НЭГ блокт идэвхтэй бол хангалттай: энэ хуудас
   * блок бүрийг ЗЭРЭГ (багана болгож) харуулдаг тул нэг блокт явж байгаа
   * ажлыг нуувал тэр багана бөглөгдөх газаргүй болно.
   *
   * ⚠️ `asOf` алга бол шүүлт ОГТ ажиллахгүй — огноогүй үед бүх мөрийг нуувал
   * хуудас шалтгаангүй хоосон харагдана.
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
   * ⚠️ Үүнийг эффектээр «цэвэрлэвэл» нэмэлт render давалгаа үүсгэнэ —
   *    жагсаалтад байхгүй бол ЗҮГЭЭР Л «Бүгд» гэж үзнэ.
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
    /**
     * ⚠️ ХУВААРИЙН ШҮҮЛТ нь дээрх гогцооны ДАРАА, ТУСДАА дамжилтаар.
     * Гогцоо дотор нөхцөл нэмбэл `continue` нь эвхэлтийн ГҮНИЙ СТЕКийг
     * алгасаж, эвхээстэй бүлгийн доорх мөрүүд гэнэт гарч ирнэ.
     */
    if (byPlan) {
      for (let i = 0; i < h.length; i++) if (!planKeep[i]) h[i] = true;
    }
    return h;
  }, [rowsAll, collapsed, grpRange, byPlan, planKeep]);

  /** Зурагдах мөрүүдийн ИНДЕКС (нуугдсаныг хассан). */
  const vis = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rowsAll.length; i++) if (!hidden[i] && calc[i]) out.push(i);
    return out;
  }, [rowsAll, hidden, calc]);
  return { planCount, grpAOpts, grpBOpts, grpBEff, hidden, vis };
}

/** Виртуаль гүйлгээний цонх ба «өөрчлөгдсөн нүд рүү үсрэх». */
export function useVirtualWindow({ vis, edit, view }: { vis: number[]; edit: { i: number } | null; view?: SheetView }) {
  /* ── ВИРТУАЛЬ ГҮЙЛГЭЭ ──────────────────────────────────────────────────
   * 1,400 мөр × 60–100 багана = 137 мянган нүд. Бүгдийг DOM-д барьвал төлөв
   * өөрчлөгдөх бүрд (нүд нээх, бөглөх) React тэр бүхнийг харьцуулж, хөтөч
   * дахин байрлуулна — нэг нүд нээхэд 4.5 секунд болж хэмжигдсэн.
   *
   * Тиймээс ЗӨВХӨН харагдах мөрүүдийг (+ дээш/доош 25 мөрийн нөөц) зурж,
   * үлдсэнийг нь өндөртэй ХООСОН мөрөөр орлуулна. Гүйлгэх зурвасны урт ба
   * байрлал яг хэвээр үлдэнэ.
   *
   * ⚠️ Багана бүр CSS-д ТОГТМОЛ өргөнтэй (`--w-*`) тул хэсэг мөр зурсан ч
   *    багана нарийсаж/өргөсөхгүй. Хэрэв ямар нэг баганад тогтмол өргөн
   *    өгөхгүй бол гүйлгэх үед багана үсэрч эхэлнэ.
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
  }, [vis, recalcWin]);

  /**
   * Засварлаж буй мөр цонхны ГАДНА үлдэж болохгүй — Enter-ээр доошлоход
   * оролт нь DOM-д байхгүй бол фокус алдагдаж, бичсэн зүйл үрэгдэнэ.
   */
  /**
   * ӨӨРЧЛӨГДСӨН НҮД РҮҮ ҮСРЭХ — жагсаалтаас дарахад.
   * ⚠️ 1,370 мөрийн ЗӨВХӨН харагдах хэсэг л DOM-д байдаг тул `scrollIntoView`
   *    ажиллахгүй: мөр нь хараахан зурагдаагүй байна. Тиймээс мөрийн
   *    ИНДЕКСЭЭР байрлалыг тооцож гүйлгэнэ.
   */
  const [hitKey, setHitKey] = useState<string | null>(null);
  const jumpN = view?.jump?.n ?? -1;
  /**
   * СҮҮЛД БИЕЛСЭН үсрэлтийн дугаар.
   *
   * ⚠️ Хамаарлын жагсаалтад `vis` байх ЁСТОЙ: үсрэх мөр хараахан зурагдаагүй
   *    (эвхээстэй бүлэг, шүүлтүүрийн гадна) байвал жагсаалт шинэчлэгдэхэд л
   *    байрлалыг олно. Гэвч тэр нь `collapsed`/`grpRange`/`pending` хөдлөх
   *    БҮРД ХУУЧИН үсрэлтийг дахин биелүүлж, хэрэглэгчийн явсан газраас
   *    хуудсыг буцааж гүйлгэдэг байв. Тиймээс биелсэн үсрэлтийг тэмдэглэж,
   *    нэг хүсэлтийг НЭГ л удаа биелүүлнэ.
   */
  const doneJumpRef = useRef(-1);
  const hitT = useRef<number | null>(null);
  useEffect(() => {
    const j = view?.jump;
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!j || !el || !tb || !vis.length) return;
    if (doneJumpRef.current === jumpN) return;
    const at = vis.indexOf(j.row);
    // ⚠️ Олдоогүй бол ТЭМДЭГЛЭХГҮЙ — мөр зурагдмагц үсрэлт биелэх ёстой.
    if (at < 0) return;
    doneJumpRef.current = jumpN;
    el.scrollTo({
      top: Math.max(0, tb.offsetTop + at * rowHRef.current - el.clientHeight / 2),
      behavior: "smooth",
    });
    const key = `${j.row}:${j.block}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: `view.jump` нь ГАДНЫ нэг удаагийн хүсэлт (үйл явдал) — гүйлгээд анивчих тэмдэглэгээг ЭНД л асаана; төлөв болгож задлах нь зан төлөв өөрчилнө
    setHitKey(key);
    if (hitT.current) window.clearTimeout(hitT.current);
    hitT.current = window.setTimeout(() => setHitKey((h) => (h === key ? null : h)), 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpN, vis]);
  // Анивчилтын таймерыг зөвхөн салахад цэвэрлэнэ (эффект бүрд БИШ — эс бөгөөс
  // жагсаалт хөдлөхөд тэмдэглэгээ мөнхөрнө).
  useEffect(() => () => {
    if (hitT.current) window.clearTimeout(hitT.current);
  }, []);
  /**
   * ХӨНДЛӨН ГҮЙЛГЭЛТ — үссэн нүд рүү (⚠️ 2026-10-06, хэрэглэгч: «өөрчлөгдсөн нүд дээр дарахад
   * zoom to хийхгүй»). Дээрх эффект зөвхөн БОСОО гүйлгэдэг байв: 14 блоктой хуудсанд 5/8-аас
   * хойших багана дэлгэцийн гадна тул мөр нь харагдаад нүд нь харагдахгүй, анивчилт ч алга.
   * ⚠️ Нүд нь цонхлолтоор (`winFrom/winTo`) ЗУРАГДСАНЫ дараа л DOM-д байна — зөөлөн гүйлгэлт
   *    дуустал `onScroll` цонхыг шинэчлэхгүй тул `td.chgHit`-ийг богино давтамжаар хүлээнэ.
   * ⚠️ Царцаасан (`.fz`) баганууд зүүн/баруун талд дарж байдаг тул «харагдах зурвас» нь
   *    тэдгээрийн өргөнөөр нарийсна — нүдийг тэр зурвасын ДУНД тавина. Аль хэдийн зурваст
   *    бүтэн байвал хөдөлгөхгүй (хэрэглэгчийн хөндлөн байрлалыг дэмий алдахгүй).
   */
  useEffect(() => {
    if (!hitKey) return;
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!el || !tb) return;
    let tries = 0;
    let t: number | null = null;
    const go = () => {
      const td = tb.querySelector<HTMLElement>("td.chgHit");
      if (!td) { if (tries++ < 40) t = window.setTimeout(go, 50); return; }
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
      el.scrollTo({ left: Math.max(0, el.scrollLeft + (tr.left - target)), behavior: "smooth" });
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
  /** ⚠️ 2026-09-30: илгээлтийг давхарлахаас ӨМНӨХ архивын мөрүүд (FillNew-ийн `ovBase`) — `saved`-ийн эх */
  ovBase?: Map<number, SheetRow>;
}) {
  /**
   * БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — ХОЁР тоо (2026-09-09, хэрэглэгчийн хүсэлт).
   *
   *   `saved`   — БАТЛАГДСАН: одоо үндсэн өгөгдөлд байгаа хувь.
   *   `draft`   — ноорог/илгээлтээ НЭМСЭН үеийн хувь.
   *
   * ⚠️ ЯАГААД ХОЁУЛАА: бөглөгч «би өнөөдөр хэдэн хувь нэмэв» гэдгээ
   *    мэдэх ёстой. Ганц тоо харуулбал (ямар нь ч бай) нөгөө нь алга
   *    болж, «миний бичсэн зүйл тоологдсон уу» гэсэн эргэлзээ үлдэнэ.
   *
   * ⚠️ `saved` нь ноорог, огнооны засвар ХОЁУЛАНГ хассан цэвэр тооцоо
   *    (`computeAll`-д хоосон засвар өгнө) — хадгалагдсан баганыг шууд
   *    уншвал бүлгийн нүд нь excel-ийн `#REF!`-ээс болж эвдэрсэн байдаг
   *    (файлын толгойн ⚠️).
   *
   * ⚠️ БЛОКУУДЫН ДУНДАЖ — «Багцын гүйцэтгэл» дэлгэцийн дүрэмтэй ИЖИЛ
   *    (`blockProgress`), тиймээс хоёр дэлгэц нэг тоо харуулна.
   * ⚠️ 2026-10-04 (2026-10-01-ний «тайлагнаагүй блок = 0%» шийдвэр): ХУВААРЬ = хуудасны
   *    БҮХ блок (`nBld`), хэмжигдээгүй блок 0%. Урьд нь «Хэмжигдээгүй блок тоологдохгүй» байсан
   *    тул 12 блокийн 1-д 100% бөглөхөд хуудас «100%» гэж харагдаж, «Багцын гүйцэтгэл»
   *    (`pkgProgressOf` — бүх блокоор) дэлгэцээс зөрдөг байв. `blocks` нь шошгонд хэмжигдсэн тоо.
   */
  /**
   * НӨГӨӨ ХУВИЛБАРЫН (9F ↔ 12F) БАТЛАГДСАН ГҮЙЦЭТГЭЛ.
   *
   * ⚠️ ЯАГААД (2026-09-09, хэрэглэгч: «9F 12F гүйцэтгэлийн бодит хувь
   *    тусад нь харагдахгүй юм уу»): багц бүр 9 ба 12 давхрын ТУСДАА
   *    хуудастай (Багц 1: 9F=12 блок, 12F=8 блок). Нээлттэй хуудасны тоо
   *    ганцаараа харагдвал «Багцын гүйцэтгэл» дэлгэцийн багцын тоотой
   *    (бүх блокийн дундаж) зөрж, шалтгаан нь ойлгогдохгүй.
   *
   * ⚠️ НӨГӨӨ ХУУДСЫГ ДАХИН ТАТАХГҮЙ: `blockProgress` нь БҮХ багцын бүх
   *    блокийг аль хэдийн уншсан (газрын зураг, дашбоард түүнийг
   *    хуваалцдаг) тул тэндээс блокийн нэрээр нь шүүнэ. Бүтэн хуудас
   *    (13MB) татах шаардлагагүй.
   *
   * ⚠️ Зөвхөн БАТЛАГДСАН тоо: нөгөө хуудасны ноорог энэ хуудсанд
   *    байхгүй тул «батлагдаагүй» гэж харуулах зүйл ч байхгүй.
   */
  /* ⚠️ Кэшлэгдсэн: газрын зураг, дашбоард ижил дуудлагыг хуваалцана. */
  const bpQ = useAsync(loadBlockProgress, []);
  const bp = bpQ.state === 'ready' ? bpQ.data : null;
  /* ⚠️ 2026-10-04: нөгөө хувилбарын БҮХ блок (тайлангүй 0%) — `pkgProgressOf`-ийн хуваарь */
  const uniQ = useAsync(loadBlockUniverse, []);
  const uni = uniQ.state === 'ready' ? uniQ.data : null;

  const otherPct = useMemo(() => {
    const others = pkgFloors(pkg.group).filter((x) => x.key !== pkg.key);
    if (!others.length || !bp) return null;
    const g = bagtsKey(pkg.group);
    /* ЭНЭ хуудасны блокууд — нөгөөгийнхийг ялгахад хэрэгтэй */
    const mine = new Set((sc?.bld ?? []).map((x) => String(x).trim()));
    /* ⚠️ 2026-10-04: хуваарь = нөгөө хувилбарын БҮХ блок (бүдүүвч ∪ хэмжилт), тайлангүй 0% */
    const keys = new Set<string>((uni?.get(g) ?? []).filter((k) => k.startsWith(`${g}|`)));
    for (const key of bp.keys()) if (key.startsWith(`${g}|`)) keys.add(key);
    let sum = 0;
    let n = 0;
    let all = 0;
    for (const key of keys) {
      const blok = key.slice(g.length + 1);
      if (mine.has(blok)) continue;
      all += 1;
      const cell = bp.get(key);
      if (cell == null || !Number.isFinite(cell.overall)) continue;
      sum += cell.overall; n += 1;
    }
    if (!all) return null;
    return { pct: sum / all, blocks: n, label: `${others[0].floors}F` };
  }, [bp, uni, pkg.group, pkg.key, sc]);

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
      /* ⚠️ 2026-10-04: хуваарь = БҮХ блок (`nBld`) — тайлангүй блок 0% (дээрх ⚠️) */
      return (s / nBld) * 100;
    };
    /** Хэмжигдсэн блокийн тоо — шошгонд «12 блок» гэж бичнэ */
    let blocks = 0;
    for (let b = 0; b < nBld; b += 1) if (calc[bi]?.act[b] != null) blocks += 1;
    const draft = avg(calc);
    /* ⚠️ 2026-09-30: «БАТЛАГДСАН» нь ИЛГЭЭЛТГҮЙ архивын мөрөөс (`ovBase`) — `saved`-ийн
       тодорхойлолт («одоо үндсэн өгөгдөлд байгаа»). Урьд нь `rowsAll` нь архив + ИЛГЭЭСЭН
       (хяналтад буй) нэмэлтийн давхарлалт тул «Илгээх» дармагц хараахан батлагдаагүй хувь
       «батлагдсан гүйцэтгэл» гэсэн тайлбартай гол тоо болж харагддаг байв. */
    const base = ovBase && ovBase.size ? rowsAll.map((r) => ovBase.get(r.oid) ?? r) : null;
    /* ⚠️ Ноороггүй тооцоо — ЗӨВХӨН ноорог (эсвэл илгээлтийн давхарлалт) байгаа үед бодно (хүнд). */
    const saved = dirtyCount > 0 || base
      ? avg(computeAll(base ?? rowsAll, nBld, asOf, {}, {}, hasObyem, planPct))
      : draft;
    return { saved, draft, blocks };
  }, [calc, rowsAll, nBld, asOf, hasObyem, planPct, dirtyCount, ovBase]);
  return { otherPct, pkgPct };
}

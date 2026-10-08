/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хүснэгтийн МӨРҮҮД (зурагдах цонх) — гүйцэтгэлийн нүд · төлөвлөгөөт хувь · огноо · шинэчлэгдсэн огноо.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { Fragment, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Schema } from "../bagts.pkg";
import { parseInc, type SheetRow } from "../bagtsSheet";
import { negjOf } from "../negj";
import { t as tr } from "@/lib/i18nCore";
import { PvCell } from "./PvCell";
import type { useObyem } from "./useObyem";
import type { useCellEdit, PastePrev } from "./useCellEdit";
import { RO, cellKey, cls, dt, full, pc, qty, synNoVol, wt, type Calc, type EditCell, type PickState, type SheetView } from "./util";
import st from "../sheet.module.css";
import { extraCls, extraVal, type ExtraCol } from "./extraCols";

type ObyemT = ReturnType<typeof useObyem>;
type CellT = ReturnType<typeof useCellEdit>;

export function FillRows({
  vis, winFrom, winTo, rowsAll, calc, addedOids, collapsed, toggle, ro, editing, canObyemEdit, pvSub, sc,
  pvPend, pvPreview, setPvPend, pending, byMap, fillMode, ovBase, meKey, volMode, edit, view, backChg, backOk,
  locked, noEdit, say, canPerf, busy, pctOnly, pctHintRef, setVal, cellSeed, setEdit, hitKey, noPerf, pasteBlock,
  inputRef, prevHint, val, commit, nextEditable, nextBlockEditable, pendDate, setPick, asOf, asOfOrig, warn,
  restoring = false, remainHint, pastePrev = null, extra = [],
}: {
  vis: number[]; winFrom: number; winTo: number; rowsAll: SheetRow[]; calc: Calc; addedOids: Set<number>;
  collapsed: Set<number>; toggle: (oid: number) => void;
  ro: (msg: string) => { title: string; onClick: () => void };
  editing: boolean; canObyemEdit: boolean; pvSub: ObyemT['pvSub']; sc: Schema;
  pvPend: ObyemT['pvPend']; pvPreview: ObyemT['pvPreview']; setPvPend: ObyemT['setPvPend'];
  pending: Record<string, string>; byMap: Map<string, string>; fillMode: "obyem" | "pct";
  ovBase: Map<number, SheetRow>; meKey: string;
  volMode: CellT['volMode']; edit: EditCell | null; view?: SheetView; backChg: Set<string>; backOk: Set<string>;
  locked: boolean; noEdit: boolean; say: (msg: string) => void; canPerf: boolean; busy: boolean;
  pctOnly: CellT['pctOnly']; pctHintRef: RefObject<boolean>; setVal: Dispatch<SetStateAction<string>>;
  cellSeed: CellT['cellSeed']; setEdit: Dispatch<SetStateAction<EditCell | null>>; hitKey: string | null; noPerf: boolean;
  pasteBlock: CellT['pasteBlock']; inputRef: RefObject<HTMLInputElement | null>; prevHint: CellT['prevHint']; val: string;
  commit: CellT['commit']; nextEditable: CellT['nextEditable']; nextBlockEditable: CellT['nextBlockEditable'];
  pendDate: Record<string, string>; setPick: Dispatch<SetStateAction<PickState | null>>;
  asOf: number | null; asOfOrig: number | null;
  /** ⚠️ 2026-09-30: хөвөгч шар анхааруулга — төлөвлөсөн обьёмын буруу утгад (`PvCell.onBad`) */
  warn?: (msg: string) => void;
  /** ⚠️ 2026-10-01: ноорог сэргэж дуустал нүд нээгдэхгүй (`RO.restoring`) */
  restoring?: boolean;
  /** ⚠️ 2026-10-01: «үлдэгдэл = Обьём − архив − хяналтад − ноорог» тайлбар */
  remainHint?: CellT['remainHint'];
  /** ⚠️ 2026-10-01: буулгалтын урьдчилсан харагдац — бичигдэх (цэнхэр) / татгалзсан (улаан ✕) */
  pastePrev?: PastePrev | null;
  /** ⚠️ 2026-10-09: «Бусад талбар» — зөвхөн унших төгсгөлийн баганууд (`extraCols.ts`); `SheetHead`-тэй ИЖИЛ массив */
  extra?: ExtraCol[];
}) {
  return (
    <>
              {vis.slice(winFrom, winTo).map((i) => {
                const r = rowsAll[i];
                const c = calc[i];
                if (!c) return null;
                /* ⚠️ Нийтлэгдээгүй (oid < 0) ЭСВЭЛ батлагдаж нийтлэгдсэн нэмэлт (addedOids) — хоёулаа улаан. */
                const isNew = r.oid < 0 || addedOids.has(r.oid);
                /* ⚠️ 2026-10-09: № нь бүтэн гарчиг (зайтай) бөгөөд Ажил хоосон бол нэрийг «Ажил» нүдэнд (доорх ⚠️) */
                const noTitle = /\s/.test(r.no);
                const workTxt = r.work || (noTitle ? r.no : "");
                return (
                  <Fragment key={r.oid}>
                  <tr
                    data-r={i}
                    className={`${r.group ? st.cat : ""}${isNew ? ` ${st.newRow}` : ""}`.trim() || undefined}
                  >
                    {/* ⚠️ 2026-10-09 (хөтөч дээрх хэмжилт): барилгын 8 багцын дээд бүлгийн № нь бүтэн гарчиг
                        («A. Бэлтгэл ажил», «Б. Барилга угсралтын ажил»), Ажил нь ХООСОН — 40px-ийн № нүднээс
                        халиж царцсан «Ажил» нүдний доор тайрагдаж («A. Бэлтг») уншигдахгүй байв. № нүд «…»-аар
                        тайрна (`.b32 td.c-no`, бүтэн нь `title`-д), нэр нь «Ажил» нүдэнд (`workTxt` — № зайтай үед л; «1.1» зэрэг код давхардахгүй). */}
                    <td className={cls("num fz c-no")} {...ro(RO.no)} title={noTitle ? r.no : RO.no}>{r.no}</td>
                    <td
                      className={cls("fz c-ajil")}
                      style={{ paddingLeft: `${r.depth * 14 + 6}px` }}
                      {...ro(RO.no)}
                      title={workTxt}
                    >
                      {r.group && (
                        /* button — гараар (Enter/Space) эвхэж дэлгэх боломжтой;
                           globals-ийн button reset .caret-ийн хэвийг хадгална. */
                        <button
                          type="button"
                          className={st.caret}
                          aria-expanded={!collapsed.has(r.oid)}
                          aria-label={collapsed.has(r.oid) ? tr('Дэлгэх') : tr('Эвхэх')}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.oid);
                          }}
                        >
                          {collapsed.has(r.oid) ? "▸" : "▾"}
                        </button>
                      )}
                      {workTxt}
                      {/* ⚠️ Бүлгийн «+» ба шинэ мөрийн «×» ХАСАГДАВ (2026-09-24) — «Хуваарь»-д. */}
                    </td>
                    <td className={cls("right c-w")} {...ro(RO.wC)} title={full(c.C)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} {...ro(RO.wD)} title={full(c.D)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td className={cls("right c-w calc")} {...ro(RO.wE)} title={full(c.E)}>
                      {wt(c.E)}
                    </td>
                    {/* ОБЬЁМ — ЭХ ӨГӨГДЛИЙН тоо хэмжээ. Эх хүснэгтэд
                        оруулагдана; энэ хуудас зөвхөн уншина. Түүнээс Мөнгөн
                        дүн, тэндээс хуудсын БҮХ хувийн жин бодогддог тул энд
                        засах эрх нээвэл нэг тоо солиход бүх мөрийн жин
                        чимээгүй шилжинэ. */}
                    {/* ОБЬЁМ — тоо ба ХЭМЖИХ НЭГЖ нэг нүдэнд, «1300 м³» хэлбэрээр.
                        ⚠️ Бүлгийн мөрд нэгж БИЧИХГҮЙ: бүлэг нь өөр өөр нэгжтэй
                        ажлуудыг агуулдаг тул нэг нэгж оноох нь худал болно.
                        ⚠️ Нэгж нь `negj.ts`-ийн дүрмээр ажлын нэрнээс гарна
                        (хамралт 95.5%); тодорхойлогдоогүй бол зөвхөн тоо. */}
                    <td className={cls("right c-vol")} {...ro(RO.vol)}>
                      {qty(r.vol)}
                      {!r.group && r.vol != null && negjOf(r.work) && (
                        <span className={st.negj}>{negjOf(r.work)}</span>
                      )}
                    </td>
                    {/* ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — засагдах цорын ганц
                        нүд (гүйцэтгэлийн блокоос гадна). ⚠️ Гүйцэтгэлийн
                        `pending`-ээс ТУСДАА `pvPend`-д хадгалагдана. */}
                    <PvCell
                      r={r}
                      /* ⚠️ `r.oid >= 0` — түр (сөрөг) дугаартай НЭМСЭН мөрд
                         засахыг ХААНА (`RO.plannedVolNewRow`-ийн ⚠️). */
                      canEdit={editing && canObyemEdit && !pvSub && !!sc?.f.plannedVol && !r.group && r.oid >= 0}
                      draft={pvPend[r.oid]}
                      preview={pvPreview?.get(r.oid)}
                      hasField={!!sc?.f.plannedVol}
                      locked={!!pvSub}
                      onSet={(v) => setPvPend((m) => {
                        const nx = { ...m };
                        if (v == null) delete nx[r.oid]; else nx[r.oid] = v;
                        return nx;
                      })}
                      cls={cls}
                      ro={ro}
                      negj={negjOf(r.work)}
                      onBad={warn}
                      /* ⚠️ 2026-10-07: засах эрхтэй ч «Бөглөх» дараагүй — PvCell шалтгааныг нэрлэнэ */
                      notEditing={!locked && canObyemEdit && !editing}
                    />
                    {/* ОБЬЁМЫН НИЙЛБЭР — блокуудын нийлбэр тул мөрийн Обьёмтой
                        ИЖИЛ нэгжтэй. */}
                    <td className={cls("right c-vol calc")} {...ro(RO.obyemSum)}>
                      {qty(c.obyemSum)}
                      {!r.group && c.obyemSum != null && negjOf(r.work) && (
                        <span className={st.negj}>{negjOf(r.work)}</span>
                      )}
                    </td>
                    <td className={cls("right c-vol")} {...ro(RO.unit)}>{qty(r.unit)}</td>
                    <td className={cls("right c-money")} {...ro(RO.money)}>{qty(r.money)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.I)}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.J)}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.K)}>{pc(c.K, 1)}</td>

                    {/* ГҮЙЦЭТГЭЛИЙН НҮД — обьём ба хувь НЭГ нүдэнд.
                          дээд мөр (том тоо) = бөглөсөн ОБЬЁМ — ЭНЭ Л бичигдэнэ
                          доод мөр (жижиг %) = обьём ÷ мөрийн Обьём — зөвхөн үр дүн

                        ⚠️ Хувийг гараар засах зам БАЙХГҮЙ. Хоёр эх сурвалжтай
                        болбол (гараар бичсэн хувь vs обьёмоос бодогдсон) аль нь
                        үнэн болох нь тодорхойгүй болж, тайлан зөрнө. */}
                    {sc.bld.map((b, bi) => {
                      const key = cellKey(r.oid, bi);
                      const dirty = key in pending;
                      /*
                       * ӨӨР ХҮНИЙ бөглөсөн нүд үү (2026-09-10, хэрэглэгч:
                       * «2 акаунт нэг ноорог хуваалцдаг нь санаа зовоож бн»).
                       *
                       * ⚠️ ЯАГААД: `byMap` нь нүд бүрийн эзнийг аль хэдийн
                       *    хадгалдаг байсан ч ЗӨВХӨН оролцогчийн жагсаалт ба
                       *    «Илгээх» түгжээнд ашиглагдаж, хүснэгт дээр огт
                       *    харагддаггүй байв. Тиймээс бөглөгч нөгөөгийнхөө
                       *    ажлыг өөрийнх гэж андуурч давхар бичих эрсдэлтэй.
                       *
                       * ⚠️ Зөвхөн ИЛГЭЭГЭЭГҮЙ (`dirty`) нүдэнд утгатай:
                       *    илгээгдсэн тоо нь хэний ч биш, багцынх.
                       *
                       * ⚠️ `meKey` хоосон (нэвтрэлт унтраалттай) үед бүх нүд
                       *    «бусдынх» болж шарлахаас сэргийлж түүнийг шаардана.
                       */
                      const cellBy = dirty ? byMap.get(key) : undefined;
                      /*
                       * ⚠️ ЭНЭ УДААГИЙН НЭМЭЛТ ба «өмнөх · энэ удаа · нийт» (2026-09-25).
                       *    Илгээгээгүй нүдэнд суурь = энэ мөр (`r`), нэмэлт = `pending`;
                       *    буцаагдсан/хянагдаж буй өөрчлөгдсөн нүдэнд суурь = давхарлалтын
                       *    өмнөх архив (`ovBase`), нэмэлт = нийт − суурь. Нэгж нь горимын.
                       */
                      const volR = r.vol != null && r.vol > 0 ? r.vol : null;
                      /* ⚠️ 2026-10-09: блокгүй багцын (`sc.synthetic`) обьёмгүй нүд — хувь null; `act` нь
                         Excel загварын 0 тул «өмнөх: 0%» гэж худал харуулдаг байв (null ≠ 0) */
                      const pctOf = (x: SheetRow) =>
                        volR != null && x.obyem[bi] != null
                          ? x.obyem[bi]! / volR
                          : sc?.synthetic && x.obyem[bi] == null ? null : x.act[bi];
                      const incD = dirty ? parseInc(pending[key]) : null;
                      /** Нэмэлт (горимын нэгжээр); илэрхийлэх аргагүй бол `null` */
                      const incAmt = incD
                        ? fillMode === "pct"
                          ? (incD.n !== 0 && volR == null ? null : incD.p + (incD.n !== 0 ? incD.n / (volR as number) : 0))
                          : (incD.p !== 0 && volR == null ? null : incD.n + (incD.p !== 0 ? incD.p * (volR as number) : 0))
                        : null;
                      const fmtU = (x: number | null) => (fillMode === "pct" ? pc(x, 1) : qty(x));
                      const signed = (x: number) => `${x < 0 ? "−" : "+"}${fmtU(Math.abs(x))}`;
                      const baseRow = !dirty ? ovBase.get(r.oid) : undefined;
                      const totNow = fillMode === "pct" ? c.act[bi] : c.obyem[bi];
                      const prevV = dirty
                        ? (fillMode === "pct" ? pctOf(r) : r.obyem[bi])
                        : baseRow
                          ? (fillMode === "pct" ? pctOf(baseRow) : baseRow.obyem[bi])
                          : null;
                      const incLine = dirty && incAmt != null
                        ? tr('өмнөх: {0} · энэ удаа: {1} · нийт: {2}', fmtU(prevV) || '—', signed(incAmt), fmtU(totNow) || '—')
                        : !dirty && baseRow && totNow != null
                          ? tr('өмнөх: {0} · энэ удаа: {1} · нийт: {2}', fmtU(prevV) || '—', signed(totNow - (prevV ?? 0)), fmtU(totNow))
                          : '';
                      const byOther = !!cellBy && !!meKey && cellBy !== meKey;
                      const canVol = volMode(r, bi);
                      /* ⚠️ ЭНЭ нүд НЭЭЛТТЭЙ эсэх. Урьд нь `editing` гэж
                         нэрлэгдсэн байсан нь ГАДААД `editing` (бөглөх
                         горим) -ыг СҮҮДЭРЛЭЖ, «Бөглөх» дараагүй байхад ч
                         нүд нээгддэг байсан шалтгаан. */
                      const cellOpen =
                        edit && edit.i === i && edit.b === bi && edit.col === "obyem";
                      /*
                       * ⚠️ ХОЁР ЭХ СУРВАЛЖ (2026-09-22): хянагчийн харагдацад
                       *    `view.changed`/`view.ok`, ГҮЙЦЭТГЭГЧИЙН талд
                       *    буцаагдсан илгээлтийн `backChg`/`backOk`.
                       *    Хоёр горим хэзээ ч зэрэг идэвхтэй байхгүй
                       *    (`view` байвал `backChg` хоосон) тул `||` аюулгүй.
                       */
                      /* ⚠️ 2026-09-23 (#15): `backChg`/`backOk` нь `${oid}:${шошго}`
                         (индекс биш — локал нэмсэн мөрөөс индекс гулсдаг);
                         хянагчийн `view.changed`/`view.ok` индексээрээ хэвээр. */
                      const ck = `${i}:${b}`;
                      const bk = `${r.oid}:${b}`;
                      /** 2026-10-01: «үлдэгдэл = Обьём − архив − хяналтад − ноорог» — засварлагдах нүдэнд */
                      const remLine = canVol && !view && remainHint ? remainHint(r, bi, ovBase.get(r.oid)) : '';
                      const changed = !!view?.changed?.has(ck) || backChg.has(bk);
                      const okd = !!view?.ok?.has(ck) || (backChg.has(bk) && backOk.has(bk));
                      const open = () => {
                        // Хяналтын горим: өөрчлөгдсөн нүд нь ЗӨВШӨӨРӨХ товч
                        if (locked) return changed && view?.onCell?.(i, b);
                        if (noEdit)
                          return say(
                            /* ⚠️ 2026-09-07: «өнөөдрийн гүйцэтгэл аль хэдийн
                               илгээгдсэн» гэсэн ХУУЧИН текст солигдов — өдөрт
                               нэг удаа гэсэн хязгаар байхгүй болсон. `noEdit`
                               нь одоо ЗӨВХӨН `locked` (хяналтын харагдац). */
                            tr('Хяналтын харагдацад гүйцэтгэл засах боломжгүй — бөглөх горимоор нээнэ үү.'),
                          );
                        if (!canPerf) return say(RO.noPerf);
                        /* ⚠️ «БӨГЛӨХ» ДАРААГҮЙ бол нүд НЭЭГДЭХГҮЙ
                           (2026-09-09). Дээрх `canPerf` нь ЭРХ, энэ нь
                           САНААТАЙ үйлдлийн хаалт — хоёр өөр зүйл. */
                        if (!editing) return say(RO.notEditing);
                        /* ⚠️ Илгээлт явж байхад нүд нээхгүй — `RO.busy`-ийн ⚠️ (2026-09-25) */
                        if (busy) return say(RO.busy);
                        /* ⚠️ 2026-10-01: ноорог сэргэж дуустал нээхгүй — бичсэн утга сэргээлтэд дарагдахгүй */
                        if (restoring) return say(RO.restoring);
                        /* ⚠️ 2026-10-09: блокгүй багцын Обьёмгүй мөр — тусдаа шалтгаан (`synNoVol`) */
                        if (!canVol) return say(r.group ? RO.groupAct : synNoVol(sc, r) ? RO.synNoVol : RO.noObyemField);
                        /* ⚠️ Обьёмын багана дутуу блокт ХУВЬ горим нээгдэнэ —
                           хувь нь `sc.act[b]`-д хадгалагдана (107/107 блокт
                           бий). Хэрэглэгчид яагаад зөвхөн хувиар болохыг
                           нэг удаа хэлнэ; дараа нь дуугүй ажиллана. */
                        if (pctOnly(r, bi) && !pctHintRef.current) {
                          pctHintRef.current = true;
                          say(RO.pctOnlyHint);
                        }
                        /* ⚠️ Горимын дагуу: хувь горимд ХУВИЙГ, эс бөгөөс
                           обьёмыг урьдчилан тавина. `pending`-д хадгалагдсан
                           нь ӨӨР горимынх байж болно (жиш. хувиар бичсэн нүдийг
                           обьём горимд нээх) — тэр үед хадгалагдсан мөрийг
                           шууд тавихгүй, ОДООГИЙН горимын тоо руу хөрвүүлнэ. */
                        setVal(cellSeed(r, bi));
                        setEdit({ i, b: bi, col: "obyem" });
                      };
                      return (
                        <td
                          key={`a${b}`}
                          data-bi={bi}
                          /* ⚠️ `view` нь `editable`-ийн ЗАСАГДАХГҮЙ хувилбар:
                             хайрцаг, курсор алга — гэхдээ обьём ба хувь
                             ХОЁУЛАА харагдана (бөглөгчийн харж буй тоо). */
                          /* ⚠️ ХОЁР ТӨЛӨВ, НЭГ ТЭМДЭГ (2026-09-06, хэрэглэгч:
                             «илгээсэн, илгээгээгүй ноорог гэсэн 2 ялгаа
                             байхад л болно»):
                               · `dirty` — НООРОГ, хараахан ИЛГЭЭГЭЭГҮЙ
                               · тэмдэггүй — ИЛГЭЭГДСЭН (хянагдаж байгаа ч,
                                 батлагдсан ч — бөглөгчийн хувьд «явсан» нэг
                                 л утгатай)
                             ⚠️ Гурав дахь («хянагдаж байна») тэмдгийг богино
                             хугацаанд туршаад ХАСАВ: бөглөгчид нэмэлт ялгаа
                             хэрэггүй, зөвхөн чимээ болсон. */
                          className={cls(
                            "num bld" +
                              (canVol ? (noPerf ? " view" : " editable") : " calc") +
                              (dirty ? " dirty" : "") +
                              (byOther ? " byOther" : "") +
                              (changed ? (okd ? " chgOk" : " chg") : "") +
                              /* ⚠️ 2026-10-07: `${мөр}:${блок}:${үсрэлтийн №}` — угтвараар (`useVirtualWindow`-ийн ⚠️) */
                              (hitKey?.startsWith(`${i}:${b}:`) ? " chgHit" : "") +
                              /* 2026-10-01: буулгалтын урьдчилсан харагдац
                                 ⚠️ 2026-10-07: түлхүүр нь `key` (`cellKey(oid, ИНДЕКС)`) — урьд нь `bk` (`oid:ШОШГО`)
                                    хайдаг тул цэнхэр/улаан тодруулга ХЭЗЭЭ Ч гардаггүй байв. */
                              (pastePrev?.rej.has(key) ? " pasteBad" : pastePrev?.ok.has(key) ? " pasteOk" : ""),
                          )}
                          /* Нүдний АЛЬ Ч цэгт дарахад нээгдэнэ — хоёр мөрийн
                             хооронд/ирмэг дээр таарсан товшилт үрэгдэхгүй
                             (хэрэглэгч үүнийг «хоёр дарж байж нээгддэг» гэж
                             мэдэрдэг байв). */
                          tabIndex={canVol && !noPerf ? 0 : changed ? 0 : undefined}
                          /* ⚠️ Нүдийг НЭЭЛГҮЙГЭЭР (зөвхөн фокуслаад) буулгаж болно —
                             Excel-ийн зуршил: нүд сонгоод шууд Ctrl+V. */
                          onPaste={(e) => {
                            const t = e.clipboardData.getData("text/plain");
                            if (pasteBlock(i, bi, t)) e.preventDefault();
                          }}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (locked) {
                              if (changed && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                view?.onCell?.(i, b);
                              }
                              return;
                            }
                            if (!cellOpen && (e.key === "Enter" || e.key === "F2")) {
                              e.preventDefault();
                              open();
                            }
                          }}
                          title={
                            /* 2026-10-01: татгалзсан буулгалтын шалтгаан — ЭХЭНД */
                            (pastePrev?.rej.has(key) ? tr('Буулгахгүй: {0}', pastePrev.rej.get(key) ?? '') + '\n' : '') +
                            /* ⚠️ Эзний нэрийг ЭХЭНД — өнгө нь «өөр хүн»
                               гэдгийг л хэлнэ, ХЭН гэдгийг энэ мөр хэлнэ. */
                            (byOther ? tr('{0} бөглөсөн — хараахан илгээгээгүй.', cellBy ?? '') + '\n' : '') +
                            /* 2026-10-01: үлдэгдэл (`remainHint`) */
                            (remLine ? remLine + '\n' : '') +
                            /* ⚠️ 2026-09-25: нэмэлтийн мөр — илгээгээгүй ба өөрчлөгдсөн нүдэнд */
                            (incLine && (dirty || changed) ? incLine + '\n' : '') +
                            (changed
                              ? okd
                                ? tr('ЗӨВШӨӨРСӨН — дахин дарвал буцаана')
                                : tr('Өмнөх агшнаас ӨӨРЧЛӨГДСӨН — дарж зөвшөөрнө үү')
                              : r.group
                              ? RO.groupAct
                              : !canVol
                                /* ⚠️ 2026-10-09: блокгүй багцын Обьёмгүй мөр (`synNoVol`) */
                                ? (synNoVol(sc, r) ? RO.synNoVol : RO.noObyemField)
                                : r.vol
                                  /* ⚠️ Блок буулгах боломжийг ЭНД сануулна —
                                     эс тэгвээс хэн ч мэдэхгүй далд шинж болно. */
                                  ? tr('Мөрийн Обьём {0} · бөглөсөн {1} = {2}\nExcel-ээс олон нүдийг хуулж Ctrl+V дарж болно.', qty(r.vol), qty(c.obyem[bi]), pc(c.act[bi], 2))
                                    /* ⚠️ 2026-10-09: блокгүй багцад «энэ удаагийн обьём → нийлбэр → хувь»-г нэмж хэлнэ */
                                    + (sc.synthetic ? '\n' + RO.synCell : '')
                                  : RO.noRowVol)
                          }
                        >
                          {cellOpen ? (
                            <input
                              {...{
                                autoFocus: true,
                                ref: inputRef,
                                type: "text" as const,
                                inputMode: "decimal" as const,
                                className: st.cellInputLine,
                                /**
                                 * ⚠️ ЛАВЛАХ ТОО НҮДЭНДЭЭ (2026-09-03-ны аудит):
                                 * бичих утга нь мөрийн «Обьём»-оос хэтрэх ёсгүй,
                                 * хувь нь түүгээр бодогдоно. Гэтэл тэр багана
                                 * царцаагүй тул 10-р блок дээр ажиллахад
                                 * дэлгэцээс гүйлгэгдэн алга болж, ганц зам нь
                                 * `title`-ийг хулганаар хүлээх байв.
                                 */
                                /* ⚠️ 2026-09-25 — НЭМЭЛТИЙН ГОРИМ: оролт ХООСОН нээгдэж
                                   ӨМНӨХ нийт нь энд харагдана («өмнөх: 40») — бичих тоо
                                   нь түүн дээр НЭМЭГДЭНЭ. Мөрийн «Обьём» нь `title`-д. */
                                placeholder: prevHint(r, bi),
                                title: tr('Өмнөх бөглөлтөөс хойш хийсэн хэмжээгээ бичнэ — нийт нь автоматаар нэмэгдэнэ. Залруулахдаа сөрөг тоо бичнэ.')
                                  + (remLine ? '\n' + remLine : ''),
                                // Удирдлагагүй: бичихэд re-render гарахгүй.
                                defaultValue: val,
                                onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                                  const el = e.target;
                                  /* ⚠️ 2026-10-07: blur-ийн commit НЯЦААГДВАЛ (асуултад «Цуцлах» · тоо биш) нүд
                                     нээлттэй үлддэг (`commit`-ийн 2026-10-06 ⚠️) ч фокус нь алга болж, дараагийн
                                     товшилт бичсэн текстийг арчдаг байв — оролтод буцааж фокуслана. */
                                  if (!commit(r, bi, el.value) && el.isConnected) el.focus();
                                },
                                /* ⚠️ Нүд НЭЭЛТТЭЙ байхад буулгасан блок — оролт
                                   нь нэг мөр текст л авдаг тул таслан авна. */
                                onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
                                  /* ⚠️ 2026-09-29 (аудит 10): `<td>`-ийн onPaste ч `pasteBlock`
                                     дууддаг тул дамжуулбал ХОЁР удаа асууж/мэдэгддэг байв */
                                  e.stopPropagation();
                                  const t = e.clipboardData.getData("text/plain");
                                  if (pasteBlock(i, bi, t)) e.preventDefault();
                                },
                                onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                  /* ⚠️ 2026-10-07: оролт унтрахад фокус `body` руу унадаг байв (Escape · сүүлийн
                                     мөрийн Enter/Tab) — эзэн `<td>`-д буцаана. Оролт АЛГА БОЛСНЫ ДАРАА (rAF):
                                     өмнө нь фокусолбол blur → commit дуудагдаж Escape утгыг бичих болно. */
                                  const td = e.currentTarget.closest("td");
                                  const back = () => requestAnimationFrame(() => td?.focus());
                                  if (e.key === "Escape") { setEdit(null); back(); return; }
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    /* ⚠️ Утга хүлээн аваагүй бол ШИЛЖИХГҮЙ (`commit`-ийн ⚠️, 2026-09-24) */
                                    if (!commit(r, bi, e.currentTarget.value)) return;
                                    /* ⚠️ Enter = ДООШ (нэг блок дотор дараагийн мөр), Tab =
                                       ХАЖУУ (нэг мөрөнд дараагийн блок) — хүснэгтийн хэвшил
                                       (2026-09-23). Урьд нь хоёулаа доош гүйдэг байв. */
                                    const dir = e.shiftKey ? -1 : 1;
                                    const t = e.key === "Enter"
                                      ? nextEditable(i, bi, dir, "obyem")
                                      : nextBlockEditable(i, bi, dir);
                                    if (t) {
                                      const nr = rowsAll[t.i];
                                      setVal(cellSeed(nr, t.b));
                                      setEdit(t);
                                    } else back();
                                  }
                                },
                              }}
                            />
                          ) : (
                            <span className={st.cellVol}>
                              {/* ⚠️ 2026-09-06: ГОРИМООР солигдоно. Обьём
                                  горимд ТОМООР обьём (хуучин зан төлөв), хувь
                                  горимд ТОМООР хувь гарна — доорх жижиг мөр нь
                                  эсрэгээрээ. Хоёулаа ҮРГЭЛЖ харагдана: горим нь
                                  зөвхөн ДАРААЛЛЫГ солино, мэдээллийг нуухгүй.
                                  Хоосон бол ХООСОН — хайрцгийн хүрээ нь
                                  «энд бичнэ» гэдгийг хэлчихнэ. */}
                              {fillMode === "pct" ? pc(c.act[bi], 1) : qty(c.obyem[bi])}
                              {/* ⚠️ Нэгж нь ЗӨВХӨН утга байгаа үед. Хоосон
                                  нүдэнд ганцаар «м³» гарвал «бөглөсөн» мэт
                                  харагдаж, бөглөх ёстой нүд нүднээс мултарна. */}
                              {fillMode === "obyem" && c.obyem[bi] != null && negjOf(r.work) && (
                                <span className={st.negj}>{negjOf(r.work)}</span>
                              )}
                              {/* ⚠️ ЭНЭ УДААГИЙН НЭМЭЛТ — жижиг «+15» (2026-09-25). Нүдний
                                  том тоо нь НИЙТ (суурь + нэмэлт); нэмэлт нь ил харагдахгүй
                                  бол хэрэглэгч «55» нь өөрийн бичсэн тоо уу гэж эргэлзэнэ. */}
                              {incAmt != null && incAmt !== 0 && (
                                <small style={{ marginLeft: 3, fontSize: "0.72em", opacity: 0.8, fontWeight: 600 }}>
                                  {signed(incAmt)}
                                </small>
                              )}
                            </span>
                          )}
                          {/* Хувь — ЗӨВХӨН үр дүн. Товшилт нь дээрх нүдний
                              обьёмын оролтыг нээнэ (td-ийн onClick). */}
                          {/* ⚠️ 2026-09-04 (аудит): `c.actOver[bi]` тугийг ЭНД
                              хэрэглэнэ. Урьд нь `bagtsSheet.computeAll` тугийг
                              бөглөдөг ч кодын хаана ч УНШИХГҮЙ байв — тиймээс
                              Багц 1·9F oid 31534 «5/3» нүд 309.9% гэж
                              харагдаж, эцэг бүлэг ба J нь 100%-иар таслагдсан
                              (`actAgg`) тоо үзүүлдэг ба ЯАГААД зөрснийг
                              хэрэглэгчид хэлэх зүйл байсангүй — «бүлгийн дүн
                              эвдэрсэн» гэж уншигдана. Одоо түүхий утга
                              анхааруулгын өнгөтэй + `title`-д шалтгаантай.
                              ⚠️ Нүдний УТГЫГ таслахгүй хэвээр (`c.act`) —
                              өгөгдлийн алдааг нуухгүй гэсэн дүрэм. */}
                          <span
                            className={cls("cellPct calcPct" + (c.actOver[bi] ? " pctOver" : ""))}
                            title={c.actOver[bi]
                              ? tr('100%-иас их — нэгтгэлд 100% гэж тооцов. Мөрийн Обьём эсвэл хуримтлалыг шалгана уу.')
                              : undefined}
                          >
                            {fillMode === "pct"
                              /* ⚠️ Хувь горимд доор ОБЬЁМ. Мөрийн Обьёмгүй үед
                                 обьём бодогдохгүй тул «—» гарна — тэр нь
                                 «мэдээлэлгүй», 0 БИШ. */
                              ? qty(c.obyem[bi])
                              : pc(c.act[bi], 1)}
                          </span>
                        </td>
                      );
                    })}

                    {/* Барилга-төлөвлөгөөт — огноо + шинэчлэгдсэн огноогоор бодогдоно. */}
                    {sc.bld.map((b, bi) => (
                      <td
                        key={`p${b}`}
                        className={cls("num bld calc")}
                        {...ro(RO.blockPlan)}
                      >
                        {pc(c.plan[bi], 1)}
                      </td>
                    ))}

                    {/* Эхлэх/Дуусах огноо — календараар засагдана (ажлын мөрд).
                        Бүлгийн мөрд дэд мөрүүдийн MIN/MAX тул зөвхөн харагдана. */}
                    {sc.bld.map((b, bi) =>
                      (["s", "e"] as const).map((k) => {
                        const key = `${r.oid}:${bi}:${k}`;
                        const fld = k === "s" ? sc.start[bi] : sc.end[bi];
                        const ms = k === "s" ? c.start[bi] : c.end[bi];
                        // ⚠️ Хаанаас ирсэн огноо вэ: `agg` = дэд мөрүүдийн
                        // MIN/MAX (бодогдоно, засагдахгүй), `own`/`none` = энэ
                        // мөрийнх (хоосон байсан ч засагдана).
                        const src = k === "s" ? c.startSrc[bi] : c.endSrc[bi];
                        // Талбар нь үйлчилгээнд байхгүй блок бий (толгой нь
                        // эвдэрсэн) — тэнд хадгалах газаргүй тул засагдахгүй.
                        const editable = !noPerf && src !== "agg" && !!fld;
                        /* ⚠️ 2026-10-07: ЗАСАГДАХГҮЙ ШАЛТГААН — гүйцэтгэлийн нүдний `open()`-той ИЖИЛ
                           дараалал. Урьд нь `editable` худал бол бүгдийг «огнооны багана байхгүй» гэж
                           хэлдэг тул «Бөглөх» дараагүй / эрхгүй хүн худал шалтгаан уншдаг байв. */
                        const dateWhy = editable
                          ? ""
                          : noEdit
                            ? RO.viewOnly
                            : !canPerf
                              ? RO.noPerf
                              : !editing
                                ? RO.notEditing
                                : src === "agg"
                                  ? RO.groupDate
                                  : RO.noDateField;
                        const pickHere = (el: HTMLElement) => {
                          if (!editable) return say(dateWhy);
                          if (busy) return say(RO.busy);
                          setPick({
                            kind: k,
                            row: r,
                            b: bi,
                            value: pendDate[key] ?? dt(ms),
                            rect: el.getBoundingClientRect(),
                            days: "",
                          });
                        };
                        return (
                          <td
                            key={`${k}${b}`}
                            className={cls(
                              "num c-date" +
                                (editable ? " cursor-cell" : "") +
                                (key in pendDate ? " dirty" : ""),
                            )}
                            title={editable ? tr('Дарж календараар сонгоно') : dateWhy}
                            /* ⚠️ 2026-10-07: гараас (Tab → Enter) ч нээгдэнэ — урьд нь `tabIndex`-гүй тул
                               огнооны нүдэнд гараар хүрэх зам огт байгаагүй */
                            tabIndex={editable ? 0 : undefined}
                            onClick={(e) => pickHere(e.currentTarget)}
                            onKeyDown={editable ? (e) => {
                              if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); pickHere(e.currentTarget); }
                            } : undefined}
                          >
                            {dt(ms)}
                          </td>
                        );
                      }),
                    )}
                    {/* Шинэчлэгдсэн огноо — зөвхөн эхний мөрд бичигддэг.
                        Хэрэгслийн мөрний сонгогчтой нэг утга. */}
                    {
                      <td
                        className={cls(
                          "num c-date" +
                            (i === 0 && !noPerf ? " cursor-cell" : "") +
                            (i === 0 && asOf !== asOfOrig ? " dirty" : ""),
                        )}
                        /* ⚠️ 2026-10-07: засагдахгүй үед `title` «Дарж календараар сонгоно» гэж худал хэлж,
                           товшилт ЧИМЭЭГҮЙ өнгөрдөг байв — шалтгааныг огнооны нүдтэй ижил дарааллаар. */
                        title={i !== 0
                          ? RO.asOfRow
                          : !noPerf
                            ? tr('Дарж календараар сонгоно')
                            : noEdit ? RO.viewOnly : !canPerf ? RO.noPerf : RO.notEditing}
                        onClick={(e) => {
                          if (noPerf) return i === 0 ? say(noEdit ? RO.viewOnly : !canPerf ? RO.noPerf : RO.notEditing) : undefined;
                          if (i !== 0) return say(RO.asOfRow);
                          if (busy) return say(RO.busy);
                          setPick({
                            kind: "asOf",
                            row: r,
                            b: -1,
                            value: dt(asOf),
                            rect: e.currentTarget.getBoundingClientRect(),
                            days: "",
                          });
                        }}
                      >
                        {i === 0 ? dt(asOf) : ""}
                      </td>
                    }
                    {/* ⚠️ 2026-10-09: «БУСАД ТАЛБАР» — ЗӨВХӨН УНШИХ (засах зам ҮГҮЙ), сүүлийн жаазны ЭНЭ мөрийн
                        хадгалсан утга (`r.raw`). Хоосон бол хоосон (null ≠ 0). Товшвол шалтгааныг хэлнэ. */}
                    {extra.map((x, xi) => {
                      const v = extraVal(x, r);
                      return (
                        <td
                          key={`x${x.key}`}
                          className={cls(`${x.kind === "int" || x.kind === "pct" ? "num " : ""}${extraCls(x.kind)}${xi === 0 ? " xFirst" : ""}`)}
                          /* ⚠️ 2026-10-09: багана тус бүрийн өргөн (`ExtraCol.wStyle`) — толгойтой ИЖИЛ объект */
                          style={x.wStyle}
                          {...ro(RO.extra)}
                          title={v.title ?? RO.extra}
                        >
                          {v.text}
                        </td>
                      );
                    })}
                  </tr>
                  </Fragment>
                );
              })}
    </>
  );
}

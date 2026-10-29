import { Fragment, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Schema } from "../bagts.pkg";
import { fmtInc, parseInc, type SheetRow } from "../bagtsSheet";
import { negFixOf, negFixText, negTotalAt } from "../sheetFrame";
import { negjOf, unitLabel } from "../negj";
import { t as tr } from "@/lib/i18nCore";
import { fixCyr } from "@/lib/format";
import { askConfirm, getConfirmSnapshot } from "@/lib/confirm";
import { PvCell } from "./PvCell";
import type { useObyem } from "./useObyem";
import type { useCellEdit, PastePrev } from "./useCellEdit";
import { RO, cellKey, cls, dt, full, pc, qty, synNoVol, wt, type Calc, type EditCell, type PickState, type SheetView } from "./util";
import st from "../sheet.module.css";
import { extraCls, extraVal, type ExtraCol } from "./extraCols";
import { cw } from "../colWidths";

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

type ObyemT = ReturnType<typeof useObyem>;
type CellT = ReturnType<typeof useCellEdit>;

export function FillRows({
  vis, winFrom, winTo, rowsAll, calc, addedOids, collapsed, toggle, ro, editing, canObyemEdit, pvSub, sc,
  pvPend, pvPreview, setPvPend, pending, byMap, fillMode, ovBase, meKey, volMode, edit, view, backChg, backOk,
  backChgDates = EMPTY_KEYS,
  locked, noEdit, say, canPerf, perfWhy, busy, pctOnly, pctHintRef, setVal, cellSeed, setEdit, hitKey, noPerf, pasteBlock,
  inputRef, prevHint, val, commit, nextEditable, nextBlockEditable, pendDate, setPick, asOf, asOfOrig, warn,
  restoring = false, remainHint, pastePrev = null, extra = [], compact = false, clearLocked, maBlock,
}: {
  vis: number[]; winFrom: number; winTo: number; rowsAll: SheetRow[]; calc: Calc; addedOids: Set<number>;
  collapsed: Set<number>; toggle: (oid: number) => void;
  ro: (msg: string) => { title: string; onClick: () => void };
  editing: boolean; canObyemEdit: boolean; pvSub: ObyemT['pvSub']; sc: Schema;
  pvPend: ObyemT['pvPend']; pvPreview: ObyemT['pvPreview']; setPvPend: ObyemT['setPvPend'];
  pending: Record<string, string>; byMap: Map<string, string>; fillMode: "obyem" | "pct";
  ovBase: Map<number, SheetRow>; meKey: string;
  volMode: CellT['volMode']; edit: EditCell | null; view?: SheetView; backChg: Set<string>; backOk: Set<string>;
  backChgDates?: ReadonlySet<string>;
  locked: boolean; noEdit: boolean; say: (msg: string) => void; canPerf: boolean;
  perfWhy?: string | null; busy: boolean;
  pctOnly: CellT['pctOnly']; pctHintRef: RefObject<boolean>; setVal: Dispatch<SetStateAction<string>>;
  cellSeed: CellT['cellSeed']; setEdit: Dispatch<SetStateAction<EditCell | null>>; hitKey: string | null; noPerf: boolean;
  pasteBlock: CellT['pasteBlock']; inputRef: RefObject<HTMLInputElement | null>; prevHint: CellT['prevHint']; val: string;
  commit: CellT['commit']; nextEditable: CellT['nextEditable']; nextBlockEditable: CellT['nextBlockEditable'];
  pendDate: Record<string, string>; setPick: Dispatch<SetStateAction<PickState | null>>;
  asOf: number | null; asOfOrig: number | null;
  warn?: (msg: string) => void;
  restoring?: boolean;
  remainHint?: CellT['remainHint'];
  pastePrev?: PastePrev | null;
  extra?: ExtraCol[];
  compact?: boolean;
  clearLocked?: CellT['clearLocked'];
  /** Буцаасан (R) MA-тай ажлууд (`des` → шалтгаан) — тэр мөрд гүйцэтгэл бичихгүй (`lib/ma.maGateOf`) */
  maBlock?: ReadonlyMap<number, string>;
}) {
  return (
    <>
              {vis.slice(winFrom, winTo).map((i) => {
                const r = rowsAll[i];
                const c = calc[i];
                if (!c) return null;
                const isNew = r.oid < 0 || addedOids.has(r.oid);
                const noTitle = /\s/.test(r.no);
                const workTxt = fixCyr(r.work || (noTitle ? r.no : ""));
                return (
                  <Fragment key={r.oid}>
                  <tr
                    data-r={i}
                    className={`${r.group ? st.cat : ""}${isNew ? ` ${st.newRow}` : ""}`.trim() || undefined}
                  >
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
                    </td>
                    {!compact && (<>
                    <td className={cls("right c-w")} style={cw("wc", "w")} {...ro(RO.wC)} title={full(c.C)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} style={cw("wd", "w")} {...ro(RO.wD)} title={full(c.D)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td className={cls("right c-w calc")} style={cw("now", "now")} {...ro(RO.wE)} title={full(c.E)}>
                      {wt(c.E)}
                    </td>
                    </>)}
                    {/* ОБЬЁМ — ЭХ ӨГӨГДЛИЙН тоо хэмжээ. Эх хүснэгтэд
                        оруулагдана; энэ хуудас зөвхөн уншина. Түүнээс Мөнгөн
                        дүн, тэндээс хуудсын БҮХ хувийн жин бодогддог тул энд
                        засах эрх нээвэл нэг тоо солиход бүх мөрийн жин
                        чимээгүй шилжинэ. */}
                    {/* ОБЬЁМ — тоо ба ХЭМЖИХ НЭГЖ нэг нүдэнд, «1300 м³» хэлбэрээр. */}
                    <td className={cls("right c-vol")} style={cw("ob", "vol")} {...ro(RO.vol)}>
                      {qty(r.vol)}
                      {!r.group && r.vol != null && negjOf(r.work) && (
                        <span className={st.negj}>{unitLabel(negjOf(r.work))}</span>
                      )}
                    </td>
                    {/* ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — засагдах цорын ганц
                        нүд (гүйцэтгэлийн блокоос гадна). Гүйцэтгэлийн
                        `pending`-ээс ТУСДАА `pvPend`-д хадгалагдана. */}
                    <PvCell
                      r={r}
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
                      negj={unitLabel(negjOf(r.work)) || null}
                      onBad={warn}
                      notEditing={!locked && canObyemEdit && !editing}
                    />
                    {/* ОБЬЁМЫН НИЙЛБЭР — блокуудын нийлбэр тул мөрийн Обьёмтой
                        ИЖИЛ нэгжтэй. */}
                    {!compact && (<>
                    <td className={cls("right c-vol calc")} style={cw("vsum", "vol")} {...ro(RO.obyemSum)}>
                      {qty(c.obyemSum)}
                      {!r.group && c.obyemSum != null && negjOf(r.work) && (
                        <span className={st.negj}>{unitLabel(negjOf(r.work))}</span>
                      )}
                    </td>
                    <td className={cls("right c-vol")} style={cw("unit", "vol")} {...ro(RO.unit)}>{qty(r.unit)}</td>
                    <td className={cls("right c-money")} style={cw("money", "money")} {...ro(RO.money)}>{qty(r.money)}</td>
                    <td className={cls("num c-calc calc")} style={cw("ci", "calc")} {...ro(RO.I)}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc calc")} style={cw("cj", "calc")} {...ro(RO.J)}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc calc")} style={cw("ck", "calc")} {...ro(RO.K)}>{pc(c.K, 1)}</td>
                    </>)}

                    {/* ГҮЙЦЭТГЭЛИЙН НҮД — обьём ба хувь НЭГ нүдэнд.
                          дээд мөр (том тоо) = бөглөсөн ОБЬЁМ — ЭНЭ Л бичигдэнэ
                          доод мөр (жижиг %) = обьём ÷ мөрийн Обьём — зөвхөн үр дүн */}
                    {sc.bld.map((b, bi) => {
                      const key = cellKey(r.oid, bi);
                      const dirty = key in pending;
                      /*
                       * ӨӨР ХҮНИЙ бөглөсөн нүд үү (2026-09-10, хэрэглэгч:
                       * «2 акаунт нэг ноорог хуваалцдаг нь санаа зовоож бн»).
                       */
                      const cellBy = dirty ? byMap.get(key) : undefined;
                      const volR = r.vol != null && r.vol > 0 ? r.vol : null;
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
                      const negTot = incAmt != null ? (prevV ?? 0) + incAmt : null;
                      const negNow = dirty && negTot != null && incAmt != null
                        && negTot < -1e-9 * Math.max(1, Math.abs(prevV ?? 0), Math.abs(incAmt));
                      const negSent = !dirty && negTotalAt(r, bi);
                      const hasF = !!sc.obyem[bi];
                      const negFix = negNow
                        ? hasF && (fillMode === "obyem" || volR != null)
                          ? negFixText(fillMode === "pct" ? (r.obyem[bi] ?? 0) / (volR as number) : (r.obyem[bi] ?? 0), fillMode === "pct")
                          : null
                        : negSent ? negFixOf(r, bi, hasF, undefined, fillMode) : null;
                      /** Сөрөг нийт — БҮТЭН нарийвчлалаар (обьём, эсвэл хувийн хэсэг сөрөг бол хувиар) */
                      const negShow = negNow && negTot != null
                        ? fillMode === "pct" ? `${fmtInc({ n: negTot * 100, p: 0 }) || "0"}%` : fmtInc({ n: negTot, p: 0 }) || "0"
                        : (r.obyem[bi] ?? 0) < 0
                          ? fmtInc({ n: r.obyem[bi] as number, p: 0 }) || "0"
                          : `${fmtInc({ n: (r.act[bi] ?? 0) * 100, p: 0 }) || "0"}%`;
                      const negTip = !(negNow || negSent)
                        ? ''
                        : view
                          ? tr('Нийт сөрөг ({0}) — ийм нүдийг зөвшөөрөх боломжгүй; гүйцэтгэгчээр залруулуулж дахин илгээүүлнэ үү.', negShow)
                          : negFix == null
                            ? tr('Нийт сөрөг ({0}) — хуудсанд байгаагаас их хасах боломжгүй, ийм нүдтэй бол илгээгдэхгүй. Хасалтаа нийт 0-ээс доош орохгүй болтол багасгана уу.', negShow)
                            : negFix === ''
                              ? tr('Нийт сөрөг ({0}) — хуудсанд байгаагаас их хасах боломжгүй, ийм нүдтэй бол илгээгдэхгүй. Энэ нүдийг хоосон болгоно уу.', negShow)
                              : tr('Нийт сөрөг ({0}) — хуудсанд байгаагаас их хасах боломжгүй, ийм нүдтэй бол илгээгдэхгүй. Нийтийг 0 болгохын тулд энэ нүдэнд «{1}» гэж бичнэ үү.', negShow, negFix);
                      const byOther = !!cellBy && !!meKey && cellBy !== meKey;
                      const canVol = volMode(r, bi);
                      const cellOpen =
                        edit && edit.i === i && edit.b === bi && edit.col === "obyem";
                      const ck = `${i}:${b}`;
                      const bk = `${r.oid}:${b}`;
                      /** 2026-10-01: «үлдэгдэл = Обьём − архив − хяналтад − ноорог» — засварлагдах нүдэнд */
                      const remLine = canVol && !view && remainHint ? remainHint(r, bi, ovBase.get(r.oid)) : '';
                      const changed = !!view?.changed?.has(ck) || backChg.has(bk);
                      const okd = !!view?.ok?.has(ck) || (backChg.has(bk) && backOk.has(bk));
                      const okLock = !view && backChg.has(bk) && backOk.has(bk);
                      const open = () => {
                        // Хяналтын горим: өөрчлөгдсөн нүд нь ЗӨВШӨӨРӨХ товч
                        if (locked) {
                          const why = changed ? view?.onCell?.(i, b) : undefined;
                          if (why) say(why);
                          return;
                        }
                        if (noEdit)
                          return say(
                            tr('Хяналтын харагдацад гүйцэтгэл засах боломжгүй — бөглөх горимоор нээнэ үү.'),
                          );
                        if (!canPerf) return say((perfWhy ?? RO.noPerf));
                        const mb = r.des != null ? maBlock?.get(r.des) : undefined;
                        if (mb) return say(mb);
                        if (okLock) {
                          if (dirty && clearLocked && editing && !busy && !restoring) {
                            void askConfirm(tr('Хянагч энэ нүдийг ЗӨВШӨӨРСӨН (ногоон ✓) — илгээгээгүй утгыг буцаах уу?'), { ok: tr('Утгыг арилгах') })
                              .then((yes) => { if (yes) clearLocked(r, bi); else say(RO.okLocked); });
                            return;
                          }
                          return say(RO.okLocked);
                        }
                        if (!editing) return say(RO.notEditing);
                        if (busy) return say(RO.busy);
                        if (restoring) return say(RO.restoring);
                        if (!canVol) return say(r.group ? RO.groupAct : synNoVol(sc, r) ? RO.synNoVol : RO.noObyemField);
                        if (pctOnly(r, bi) && !pctHintRef.current) {
                          pctHintRef.current = true;
                          say(RO.pctOnlyHint);
                        }
                        setVal(cellSeed(r, bi));
                        setEdit({ i, b: bi, col: "obyem" });
                      };
                      return (
                        <td
                          key={`a${b}`}
                          data-bi={bi}
                          style={cw(`a${bi}`, "bld")}
                          className={cls(
                            "num bld" +
                              (canVol ? (noPerf || okLock ? " view" : " editable") : " calc") +
                              (dirty ? " dirty" : "") +
                              (byOther ? " byOther" : "") +
                              (changed ? (okd ? " chgOk" : " chg") : "") +
                              (hitKey?.startsWith(`${i}:${b}:`) ? " chgHit" : "") +
                              /* 2026-10-01: буулгалтын урьдчилсан харагдац */
                              (pastePrev?.rej.has(key) ? " pasteBad" : pastePrev?.ok.has(key) ? " pasteOk" : "") +
                              (negNow || negSent ? " negTot" : ""),
                          )}
                          /* Нүдний АЛЬ Ч цэгт дарахад нээгдэнэ — хоёр мөрийн
                             хооронд/ирмэг дээр таарсан товшилт үрэгдэхгүй
                             (хэрэглэгч үүнийг «хоёр дарж байж нээгддэг» гэж
                             мэдэрдэг байв). */
                          tabIndex={canVol && !noPerf ? 0 : changed ? 0 : undefined}
                          onPaste={(e) => {
                            const t = e.clipboardData.getData("text/plain");
                            if (pasteBlock(i, bi, t)) e.preventDefault();
                          }}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (locked) {
                              if (changed && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                const why = view?.onCell?.(i, b);
                                if (why) say(why);
                              }
                              return;
                            }
                            if (!cellOpen && (e.key === "Enter" || e.key === "F2")) {
                              e.preventDefault();
                              open();
                            }
                          }}
                          title={
                            (negTip ? negTip + '\n' : '') +
                            /* 2026-10-01: татгалзсан буулгалтын шалтгаан — ЭХЭНД */
                            (pastePrev?.rej.has(key) ? tr('Буулгахгүй: {0}', pastePrev.rej.get(key) ?? '') + '\n' : '') +
                            (byOther ? tr('{0} бөглөсөн — хараахан илгээгээгүй.', cellBy ?? '') + '\n' : '') +
                            /* 2026-10-01: үлдэгдэл (`remainHint`) */
                            (remLine ? remLine + '\n' : '') +
                            (incLine && (dirty || changed) ? incLine + '\n' : '') +
                            (okLock
                              ? RO.okLocked
                              : changed
                              ? okd
                                ? tr('ЗӨВШӨӨРСӨН — дахин дарвал буцаана')
                                : negSent && view
                                  ? ''
                                  : tr('Өмнөх батлагдсан утгаас ӨӨРЧЛӨГДСӨН — дарж зөвшөөрнө үү')
                              : r.group
                              ? RO.groupAct
                              : !canVol
                                ? (synNoVol(sc, r) ? RO.synNoVol : RO.noObyemField)
                                : r.vol
                                  ? tr('Мөрийн Обьём {0} · бөглөсөн {1} = {2}\nExcel-ээс олон нүдийг хуулж Ctrl+V дарж болно.', qty(r.vol), qty(c.obyem[bi]), pc(c.act[bi], 2))
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
                                placeholder: prevHint(r, bi),
                                title: tr('Өмнөх бөглөлтөөс хойш хийсэн хэмжээгээ бичнэ — нийт нь автоматаар нэмэгдэнэ. Залруулахдаа сөрөг тоо бичнэ.')
                                  + (remLine ? '\n' + remLine : ''),
                                // Удирдлагагүй: бичихэд re-render гарахгүй.
                                defaultValue: val,
                                onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                                  const el = e.target;
                                  if (!commit(r, bi, el.value) && el.isConnected && !getConfirmSnapshot().req) el.focus();
                                },
                                onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
                                  e.stopPropagation();
                                  const t = e.clipboardData.getData("text/plain");
                                  if (pasteBlock(i, bi, t)) e.preventDefault();
                                },
                                onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                  const td = e.currentTarget.closest("td");
                                  const back = () => requestAnimationFrame(() => td?.focus());
                                  if (e.key === "Escape") { setEdit(null); back(); return; }
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    if (!commit(r, bi, e.currentTarget.value)) return;
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
                              {fillMode === "pct" ? pc(c.act[bi], 1) : qty(c.obyem[bi])}
                              {fillMode === "obyem" && c.obyem[bi] != null && negjOf(r.work) && (
                                <span className={st.negj}>{unitLabel(negjOf(r.work))}</span>
                              )}
                              {incAmt != null && incAmt !== 0 && (
                                <small style={{ marginLeft: 3, fontSize: "0.72em", opacity: 0.8, fontWeight: 600 }}>
                                  {signed(incAmt)}
                                </small>
                              )}
                            </span>
                          )}
                          {/* Хувь — ЗӨВХӨН үр дүн. Товшилт нь дээрх нүдний
                              обьёмын оролтыг нээнэ (td-ийн onClick). */}
                          <span
                            className={cls("cellPct calcPct" + (c.actOver[bi] ? " pctOver" : ""))}
                            title={c.actOver[bi]
                              ? tr('100%-иас их — нэгтгэлд 100% гэж тооцов. Мөрийн Обьём эсвэл хуримтлалыг шалгана уу.')
                              : undefined}
                          >
                            {fillMode === "pct"
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
                        style={cw(`p${bi}`, "bld")}
                        {...ro(RO.blockPlan)}
                      >
                        {pc(c.plan[bi], 1)}
                      </td>
                    ))}

                    {/* Эхлэх/Дуусах огноо — календараар засагдана (ажлын мөрд).
                        Бүлгийн мөрд дэд мөрүүдийн MIN/MAX тул зөвхөн харагдана. */}
                    {!compact && sc.bld.map((b, bi) =>
                      (["s", "e"] as const).map((k) => {
                        const key = `${r.oid}:${bi}:${k}`;
                        const fld = k === "s" ? sc.start[bi] : sc.end[bi];
                        const ms = k === "s" ? c.start[bi] : c.end[bi];
                        const src = k === "s" ? c.startSrc[bi] : c.endSrc[bi];
                        // Талбар нь үйлчилгээнд байхгүй блок бий (толгой нь
                        // эвдэрсэн) — тэнд хадгалах газаргүй тул засагдахгүй.
                        const editable = !noPerf && src !== "agg" && !!fld;
                        const dateWhy = editable
                          ? ""
                          : noEdit
                            ? RO.viewOnly
                            : !canPerf
                              ? (perfWhy ?? RO.noPerf)
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
                            style={cw(`${k}${bi}`, "date")}
                            className={cls(
                              "num c-date" +
                                (editable ? " cursor-cell" : "") +
                                (backChgDates.has(key) ? " chg" : "") +
                                (key in pendDate ? " dirty" : ""),
                            )}
                            title={editable ? tr('Дарж календараар сонгоно') : dateWhy}
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
                    {!compact && (
                      <td
                        style={cw("asof", "date")}
                        className={cls(
                          "num c-date" +
                            (i === 0 && !noPerf ? " cursor-cell" : "") +
                            (i === 0 && asOf !== asOfOrig ? " dirty" : ""),
                        )}
                        title={i !== 0
                          ? RO.asOfRow
                          : !noPerf
                            ? tr('Дарж календараар сонгоно')
                            : noEdit ? RO.viewOnly : !canPerf ? (perfWhy ?? RO.noPerf) : RO.notEditing}
                        onClick={(e) => {
                          if (noPerf) return i === 0 ? say(noEdit ? RO.viewOnly : !canPerf ? (perfWhy ?? RO.noPerf) : RO.notEditing) : undefined;
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
                    )}
                    {extra.map((x, xi) => {
                      const v = extraVal(x, r);
                      return (
                        <td
                          key={`x${x.key}`}
                          className={cls(`${x.kind === "int" || x.kind === "pct" ? "num " : ""}${extraCls(x.kind)}${xi === 0 ? " xFirst" : ""}`)}
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

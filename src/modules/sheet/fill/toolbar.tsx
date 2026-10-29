import { Switch, Toggle } from "@/components/Switch";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { PKGS, pkgFloors, type Pkg } from "../bagts.pkg";
import { date as fmtDate, dateLocale, num, pct } from "@/lib/format";
import { REASON_MAX } from "@/lib/huvaariBatlah";
import { displayObyemReason } from "@/lib/obyemBatlah";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { askConfirm } from "@/lib/confirm";
import { LOCAL_DRAFT_TTL_MS } from "./draft";
import { t as tr } from "@/lib/i18nCore";
import type { useObyem } from "./useObyem";
import type { useDraftSync } from "./useDraftSync";
import type { useRowFilter, usePkgPct } from "./useRows";
import { cls, dt, inputToMs, type RemoteState } from "./util";
import st from "../sheet.module.css";

type ObyemT = ReturnType<typeof useObyem>;
type DraftT = ReturnType<typeof useDraftSync>;
type RowsT = ReturnType<typeof useRowFilter> & ReturnType<typeof usePkgPct>;

/** Багц · хувилбар · огноо · бүлэг · дэд бүлэг · хуваарийн дагуу · өргөн сэргээх */
export function FilterBar({
  locked, busy, noPerf, pkg, setPkg, confirmSwitch, groupOpts, floorOpts,
  asOf, setAsOf, dateOpts, grpA, setGrpA, grpAOpts, grpBEff, setGrpB, grpBOpts, byPlan, setByPlan,
  today, planCount, resized, resetAll, fullView = true, setFullView, restoring = false,
}: {
  locked: boolean; busy: boolean; noPerf: boolean;
  pkg: Pkg; setPkg: Dispatch<SetStateAction<Pkg>>;
  confirmSwitch: () => Promise<boolean>;
  groupOpts: string[]; floorOpts: Pkg[];
  asOf: number | null; setAsOf: Dispatch<SetStateAction<number | null>>; dateOpts: string[];
  grpA: number; setGrpA: Dispatch<SetStateAction<number>>; grpAOpts: RowsT['grpAOpts'];
  grpBEff: number; setGrpB: Dispatch<SetStateAction<number>>; grpBOpts: RowsT['grpBOpts'];
  byPlan: boolean; setByPlan: Dispatch<SetStateAction<boolean>>;
  today: string; planCount: RowsT['planCount'];
  resized: boolean; resetAll: () => void;
  fullView?: boolean; setFullView?: (on: boolean) => void;
  restoring?: boolean;
}) {
  return (
    <>
        {!locked && (<>
        <label className={st.field}>
          {tr('Багц')}{" "}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={async (e) => {
              const g = e.target.value;
              if (!(await confirmSwitch())) return;
              setPkg(pkgFloors(g)[0]);
            }}
          >
            {groupOpts.map((g) => (
              <option key={g} value={g}>{tr(g)}</option>
            ))}
          </select>
        </label>
        {/* Хувилбар — зөвхөн 9F ба 12F ХОЁУЛАА хуудастай багцад (1, 2, 4-2).
            Бусад багцад ганц хувилбартай тул сонгогч ч харагдахгүй. */}
        {floorOpts.length > 1 && (
          <label className={st.field}>
            {tr('Хувилбар')}{" "}
            <select
              className={st.select}
              value={pkg.key}
              disabled={busy}
              onChange={async (e) => {
                const k = e.target.value;
                if (!(await confirmSwitch())) return;
                setPkg((cur) => PKGS.find((p) => p.key === k) ?? cur);
              }}
            >
              {floorOpts.map((p) => (
                <option key={p.key} value={p.key}>{p.floors}F</option>
              ))}
            </select>
          </label>
        )}
        <label className={st.field}>
          {tr('Огноо')}{" "}
          <select
            className={st.select}
            value={dt(asOf)}
            disabled={busy || noPerf || restoring}
            onChange={(e) => {
              const ms = inputToMs(e.target.value);
              if (ms != null) setAsOf(ms);
            }}
            title={tr('Төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогдоно (excel-ийн «Шинэчлэгдсэн огноо»)')}
          >
            {asOf == null && (
              <option value="">{tr('— тохируулаагүй —')}</option>
            )}
            {dateOpts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <span className={st.tbSep} aria-hidden />
        </>
        )}
        {/* ЭЦЭГ БҮЛЭГ — «Б1 БАРИЛГЫН АЖИЛ», «3 ТӨМӨР БЕТОН РАМЫН АЖИЛ»… */}
        <label className={st.field}>
          {tr('Бүлэг')}{" "}
          <select
            className={cls("select selectWide")}
            value={grpA}
            disabled={busy}
            onChange={(e) => setGrpA(Number(e.target.value))}
            title={tr('Зөвхөн сонгосон бүлэг ба түүний доод ажлууд харагдана')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpAOpts.map((g) => (
              <option key={g.oid} value={g.oid}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {/* ДЭД БҮЛЭГ — «3.2 1F цутгалт», «4.3 2F хана»… Эцэг сонгогдсон бол
            зөвхөн түүний доторхи, эс бөгөөс бүх дэд бүлэг жагсаана. */}
        <label className={st.field}>
          {tr('Дэд бүлэг')}{" "}
          <select
            className={cls("select selectWide")}
            value={grpBEff}
            disabled={busy}
            onChange={(e) => setGrpB(Number(e.target.value))}
            title={tr('Тухайн бүлгийн доторх нэг дэд бүлгийг сонгоно')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpBOpts.map((g) => (
              <option key={g.oid} value={g.oid}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <span className={st.tbSep} aria-hidden />

        {/* ХУВААРИЙН ДАГУУ — тухайн огноонд явах ёстой ажлууд. Тоо нь ИЛ:
            «18 / 1,370» гэж харуулахгүй бол цөөн мөр гарахад хүснэгт
            эвдэрсэн мэт уншигдана. */}
        <Toggle
          checked={byPlan}
          onChange={setByPlan}
          disabled={busy}
          label={tr("Хуваарийн дагуу")}
          extra={`${planCount.on.toLocaleString()} / ${planCount.all.toLocaleString()}`}
          title={tr("Өнөөдөр ({0}) хуваарь нь явж байгаа ажлуудыг л харуулна. Хуваарьгүй ажил нуугдана. Дээрх «Огноо» нь ТАЙЛАНГИЙН огноо — үүнд нөлөөлөхгүй.", today)}
        />

        {setFullView && (
          <Switch
            checked={fullView}
            onChange={setFullView}
            off={tr('Хураангуй')}
            on={tr('Дэлгэрэнгүй')}
            title={tr('Хураангуй — дэс дугаар, ажил, обьём, инженерийн төлөвлөсөн обьём, бөглөх нүд ба төлөвлөгөөт хувь. Дэлгэрэнгүй — бүх багана ба үйлчилгээний мөрийн түвшний бусад бүх талбар.')}
          />
        )}

        {resized && (
          <button
            className={st.layerBtn}
            onClick={resetAll}
            title={tr('Чирж өөрчилсөн бүх баганы өргөнийг анхны хэмжээнд нь буцаана')}
          >
            {tr('Өргөн сэргээх')}
          </button>
        )}
    </>
  );
}

/** «Илгээх» / «Дуусгасан» / «Дахин засах» — нэг байрлалд нэг товч */
export function SubmitControls({ locked, canSubmitNow, publish, busy, noEdit, dirtyCount, iAmDone, toggleDone, waitingOn, waitingLast, resendAsIs, sendReady = true }: {
  locked: boolean; canSubmitNow: boolean; publish: () => Promise<void>; busy: boolean; noEdit: boolean;
  dirtyCount: number; iAmDone: boolean; toggleDone: () => Promise<void>; waitingOn: string[];
  waitingLast?: Map<string, number>;
  resendAsIs?: () => void;
  sendReady?: boolean;
}) {
  return (
    <>
        {/* ══════ НЭГ ТОВЧ — ГУРВАН ТӨЛӨВ (2026-09-08) ══════

              · бусад хүлээгдэж байна → «Дуусгасан»  (өөрийгөө хасна)
              · өөрөө дуусгасан      → «Дахин засах» (буцаана)
              · хүлээх хүнгүй        → «Илгээх»      (хуучин зан ХЭВЭЭР) */}
        {!locked && (
          canSubmitNow ? (
        <button
          className={st.publishBtn}
          onClick={dirtyCount === 0 && resendAsIs ? resendAsIs : publish}
          disabled={busy || noEdit || (dirtyCount === 0 && !resendAsIs) || !sendReady}
          title={sendReady
            ? tr('Хянагчид илгээнэ — газрын дарга баталсны дараа л үндсэн өгөгдөлд орно')
            : tr('Эхлээд «Дуусгах» товчийг дарна уу — илгээхэд бүх зүйл бэлэн эсэхийг шалгасны дараа «Илгээх» идэвхжинэ.')}
        >
          {dirtyCount === 0 && resendAsIs ? tr('Өөрчлөлтгүй дахин илгээх') : <>{tr('Илгээх')}{dirtyCount ? ` (${dirtyCount})` : ""}</>}
        </button>
          ) : (
        <button
          className={iAmDone ? st.layerBtn : st.publishBtn}
          onClick={() => void toggleDone()}
          disabled={busy || noEdit}
          title={iAmDone
            ? tr('Бөглөлтөө үргэлжлүүлнэ — бусад оролцогчийн «Илгээх» товч дахин түгжигдэнэ')
            : tr('«Би энэ багц дээр цаашид бөглөхгүй» гэж тэмдэглэнэ. Илгээхгүй — хамгийн сүүлд үлдсэн хүн илгээнэ.')}
        >
          {iAmDone ? tr('Дахин засах') : tr('Дуусгасан')}
        </button>
          )
        )}
        {!locked && !canSubmitNow && (
          <span className={st.muted} role="status">
            {tr('«Илгээх» түгжээтэй: {0} «Дуусгасан» товч дартал хүлээнэ — тэдэнд мэдэгдэнэ үү.', waitingOn.map((u) => {
              const a = waitingLast?.get(u);
              return a != null ? tr('{0} (сүүлд {1})', u, fmtDate(a)) : u;
            }).join(', '))}
            {!iAmDone && <>{' '}{tr('Таны хэсэг дууссан бол та ч «Дуусгасан» дарна уу — хамгийн сүүлд үлдсэн хүн илгээнэ.')}</>}
            {' · '}
            {tr('{0} хоног идэвхгүй бол автоматаар чөлөөлөгдөнө', String(Math.round(LOCAL_DRAFT_TTL_MS / 86_400_000)))}
          </span>
        )}
    </>
  );
}

/** Хуваалцсан ноорогийн оролцогчид */
export function Participants({ participants, byCount, doneBy }: {
  participants: Set<string>; byCount: Map<string, number>; doneBy: DraftT['doneBy'];
}) {
  return (
    <>
        {/* ══════ ХУВААЛЦСАН БӨГЛӨЛТ — хэн ажиллаж байна ══════ */}
        {participants.size > 1 && (
          <span className={st.muted} title={tr('Энэ багцын нооргийг хуваалцаж бөглөж байгаа аккаунтууд')}>
            {'👥 '}
            {[...participants].sort().map((u) => {
              const n = byCount.get(u) ?? 0;
              const mark = doneBy.some(([d]) => d === u) ? `✓ ${u}` : u;
              return n ? `${mark} (${num(n)})` : mark;
            }).join(' · ')}
          </span>
        )}
    </>
  );
}

/** Инженерийн төлөвлөсөн обьёмын товчнууд ба мэдэгдэл */
export function ObyemToolbar({ canObyemEdit, pvSub, pvCells, sendObyem, pvBusy, canObyemApprove, locked, decideObyemHere, pvErr, pvNote, pvReturned = null, withdrawObyemHere, me = '', partial = null, returnStuck, note = null }: {
  canObyemEdit: boolean; pvSub: ObyemT['pvSub']; pvCells: ObyemT['pvCells']; sendObyem: ObyemT['sendObyem'];
  pvBusy: boolean; canObyemApprove: boolean; locked: boolean; decideObyemHere: ObyemT['decideObyemHere'];
  pvErr: string; pvNote: string;
  pvReturned?: ObyemT['pvReturned'];
  withdrawObyemHere?: ObyemT['withdrawObyemHere'];
  /** Нэвтэрсэн хэрэглэгч — «Татаж авах» товчийг зөвхөн зохиогчид */
  me?: string;
  partial?: string | null;
  returnStuck?: (reason: string) => Promise<void>;
  note?: string | null;
}) {
  const [rej, setRej] = useState<string | null>(null);
  const [stuck, setStuck] = useState<string | null>(null);
  /** Гацсан (хэсэгчлэн бичигдсэн) — батлагчид «Обьём буцаах»-ын оронд «Гацсаныг буцаах» */
  const isStuck = partial != null && !!returnStuck;
  return (
    <>
        {canObyemEdit && !pvSub && pvReturned && (
          <span className={st.lockNote} role="status">
            {tr('Обьёмын илгээлт буцаасан ({0} нүд · {1}): {2} — засаад дахин «Обьём батлуулах» дарна уу.',
              num(pvReturned.cellCount),
              [pvReturned.approver ?? '', pvReturned.approverAt ? fmtDate(pvReturned.approverAt) : ''].filter(Boolean).join(' · ') || '—',
              displayObyemReason(pvReturned.reason) || '—')}
          </span>
        )}
        {/* ══════ ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — тусдаа урсгал ══════ */}
        {canObyemEdit && !pvSub && pvCells.length > 0 && (
          <button
            className={st.publishBtn}
            onClick={() => void sendObyem()}
            disabled={pvBusy}
            title={tr('Инженерийн төлөвлөсөн обьёмын засварыг батлуулахаар илгээнэ — батлагдтал үндсэн өгөгдөлд бичигдэхгүй')}
          >
            {tr('Обьём батлуулах')} ({pvCells.length})
          </button>
        )}

        {/* Хүлээгдэж буй илгээлт — БҮХ хүнд харагдана (ил тод байдал) */}
        {pvSub && (
          <span className={st.muted}>
            {tr('Обьём батлуулахаар илгээгдсэн: {0} нүд · {1}', num(pvSub.cellCount), pvSub.author)}
          </span>
        )}
        {pvSub && withdrawObyemHere && canObyemEdit && !locked && me && pvSub.author.trim().toLowerCase() === me.trim().toLowerCase() && (
          <button className={st.layerBtn} onClick={() => void withdrawObyemHere()} disabled={pvBusy}>
            {tr('Илгээлтээ татаж авах')}
          </button>
        )}

        {/* Батлагчийн шийдвэр — зөвхөн эрхтэй хүнд. */}
        {pvSub && canObyemApprove && !locked && (
          <>
            <button
              className={st.publishBtn}
              onClick={async () => {
                if (!(await askConfirm(tr('Инженерийн обьёмын {0} нүдийг батлах уу? Утгууд шууд үндсэн өгөгдөлд бичигдэж, гүйцэтгэлийн хувь дахин бодогдоно.', num(pvSub.cellCount)), { ok: tr('Обьём батлах') }))) return;
                void decideObyemHere(true);
              }}
              disabled={pvBusy}
              title={tr('Батлаад үндсэн өгөгдөлд бичнэ')}
            >
              {tr('Обьём батлах')}
            </button>
            {isStuck && (
              <span className={st.lockNote} role="status">
                {tr('{0} хагас бичсэн — Батлах-аар гүйцээнэ, эсвэл шалтгаан бичээд «Гацсаныг буцаах»', partial || '—')}
              </span>
            )}
            {isStuck && (
              <button className={st.layerBtn} onClick={() => setStuck('')} disabled={pvBusy}>
                {tr('Гацсаныг буцаах')}
              </button>
            )}
            {!isStuck && (
            <button
              className={st.layerBtn}
              onClick={() => {
                setRej('');
              }}
              disabled={pvBusy}
            >
              {tr('Обьём буцаах')}
            </button>
            )}
          </>
        )}
        {stuck !== null && pvSub && canObyemApprove && !locked && returnStuck && (
          <RejectDialog
            text={stuck}
            onText={setStuck}
            busy={pvBusy}
            onClose={() => setStuck(null)}
            onOk={(why) => { setStuck(null); void returnStuck(why); }}
            title={tr('Гацсаныг буцаах шалтгаан (заавал)')}
            okLabel={tr('Гацсаныг буцаах')}
          />
        )}
        {rej !== null && pvSub && canObyemApprove && !locked && (
          <RejectDialog
            text={rej}
            onText={setRej}
            busy={pvBusy}
            onClose={() => setRej(null)}
            onOk={(why) => { setRej(null); void decideObyemHere(false, why); }}
          />
        )}
        {pvErr && <span className={st.error}>{pvErr}</span>}
        {pvNote && <span className={st.muted}>{pvNote}</span>}
        {note && <span className={st.muted} role="status">{note}</span>}
    </>
  );
}

/**
 * ОБЬЁМ БУЦААХ ШАЛТГААНЫ ЦОНХ (2026-10-06 аудит) — `window.prompt`-ийн оронд.
 */
function RejectDialog({ text, onText, busy, onClose, onOk, title, okLabel }: {
  text: string; onText: (v: string) => void; busy: boolean;
  onClose: () => void; onOk: (why: string) => void;
  title?: string; okLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { taRef.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className={st.overlay} role="presentation" onClick={onClose}>
      <div ref={ref} className={st.modal} role="dialog" aria-modal="true" aria-label={okLabel ?? tr('Обьём буцаах')}
        style={{ maxWidth: '32rem' }} onClick={(e) => e.stopPropagation()}>
        <div className={st.modalHead}>
          <b className={st.modalTitle}>{title ?? tr('Буцаах шалтгаанаа бичнэ үү:')}</b>
          <button type="button" className={st.closeBtn} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </div>
        <textarea
          rows={4}
          ref={taRef}
          value={text}
          onChange={(e) => onText(e.target.value)}
          disabled={busy}
          maxLength={REASON_MAX}
          style={{ width: '100%', resize: 'vertical', font: 'inherit' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={st.layerBtn} onClick={onClose} disabled={busy}>{tr('Болих')}</button>
          <button type="button" className={st.publishBtn} onClick={() => onOk(text)} disabled={busy || !text.trim()}>
            {okLabel ?? tr('Обьём буцаах')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Багцын бодит гүйцэтгэл — батлагдсан · батлагдаагүй · нөгөө хувилбар */
export function PkgPctBadge({ pkgPct, pkg, otherPct, otherPending = false, pkgAll: pkgAllLive }: {
  pkgPct: RowsT['pkgPct']; pkg: Pkg; otherPct: RowsT['otherPct']; otherPending?: boolean;
  pkgAll?: number | null;
}) {
  if (pkgPct?.saved == null) return null;
  type V = { key: string; floors: number; pct: number; blocks: number; total: number; mine: boolean };
  const variants: V[] = [];
  if (pkg.floors != null) {
    variants.push({ key: 'me', floors: pkg.floors, pct: pkgPct.saved, blocks: pkgPct.blocks, total: pkgPct.total, mine: true });
    if (otherPct && otherPct.floors != null) variants.push({ key: 'other', floors: otherPct.floors, pct: otherPct.pct, blocks: otherPct.blocks, total: otherPct.total, mine: false });
    variants.sort((x, y) => y.floors - x.floors);
  }
  const pkgAll = pkgAllLive !== undefined ? pkgAllLive : otherPending ? null : pkgPct.saved;
  return (
    <>
      {variants.length > 1 && variants.map((v) => (
        <span
          key={v.key}
          className={`${st.pctStat} ${v.mine ? '' : st.pctStatOther}`}
          title={v.mine
            ? tr('Энэ ХУУДСЫН ({0}) батлагдсан гүйцэтгэл — блокуудынх нь дундаж.', pkg.label)
            : tr('Энэ багцын НӨГӨӨ хувилбарын ({0}) батлагдсан гүйцэтгэл. Хувилбар сонгогчоор шилжиж бөглөнө.', `${v.floors}F`)}
        >
          <span className={st.pctStatLab}>{tr('{0} гүйцэтгэл', `${v.floors}F`)}</span>
          <b className={st.pctStatVal}>{pct(v.pct, 2)}</b>
        </span>
      ))}
      <span
        className={`${st.pctStat} ${st.pctStatMain}`}
        title={tr('Багцын батлагдсан гүйцэтгэл — бүх хувилбарын бүх блокийн дундаж («Багцын гүйцэтгэл» дэлгэцтэй ижил).')}
      >
        <span className={st.pctStatLab}>{tr('Багцын гүйцэтгэл')}</span>
        <b className={st.pctStatVal}>{pct(pkgAll, 2)}</b>
      </span>
    </>
  );
}

/** Нооргийн байдал — ногоон тоолуур · устгах · хадгалсан агшин · ArcGIS */
export function DraftStatus({ locked, dirtyCount, noPerf, dropDraft, savedAt, remoteState, restoring = false, offline = false, localFail = false, canDrop = false }: {
  locked: boolean; dirtyCount: number; noPerf: boolean; dropDraft: () => void; savedAt: number | null; remoteState: RemoteState;
  canDrop?: boolean;
  restoring?: boolean;
  offline?: boolean;
  localFail?: boolean;
}) {
  return (
    <>
        {!locked && restoring && (
          <span className={st.restoringBadge} role="status">{tr('Ноорог сэргээж байна…')}</span>
        )}
        {!locked && offline && (
          <span className={st.offlineBadge} role="status"
            title={tr('Сүлжээ тасарсан — засвар энэ төхөөрөмжид хадгалагдаж байна; сүлжээ сэргэмэгц ArcGIS руу автоматаар хуулагдана. Илгээх боломжгүй.')}>
            {tr('Офлайн')}
          </span>
        )}
        {!locked && dirtyCount > 0 && (
          <span className={st.hint}>
            <span className={st.legDirty} title={tr('Ногоон хүрээтэй нүд — та зассан, хараахан ИЛГЭЭГЭЭГҮЙ. «Илгээх» дарж хянагчид хүргэнэ. Тэмдэггүй нүд нь илгээгдсэн тоо.')}>
              {tr('ногоон: илгээгээгүй ({0})', dirtyCount)}
            </span>
            {(!noPerf || canDrop) && (
              <>
                {' · '}
                <button type="button" className={st.linkBtn} onClick={dropDraft}
                  title={tr('Илгээгээгүй бүх засварыг хаяна — локал ба ArcGIS хоёуланд. Буцаах зам байхгүй.')}>
                  {tr('ноорог устгах')}
                </button>
              </>
            )}
          </span>
        )}
        {!locked && localFail && dirtyCount > 0 && (
          <span className={st.autosaveWarn} role="alert">
            {tr('Ноорог энэ хөтчид хадгалагдсангүй (сан дүүрсэн эсвэл хаалттай) — зөвхөн ArcGIS-д хуулагдана. Таб хаахаас өмнө «Илгээх» дарах эсвэл хөтчийн сан чөлөөлнө үү.')}
          </span>
        )}
        {!locked && savedAt != null && dirtyCount > 0 && !localFail && (
          <span
            className={st.autosave}
            title={tr('Ноорог энэ хөтчид, мөн ArcGIS-д хадгалагдана — өөр компьютероос нэвтэрсэн ч сэргээх боломжтой. Хянагчид хүргэхийн тулд «Илгээх» дарна.')}
          >
            {tr('ноорог хадгалагдав {0}', new Date(savedAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
        {remoteState?.kind === 'big' && (
          <span className={st.autosaveWarn} role="status">
            {tr('Ноорог хэт том тул зөвхөн энэ компьютерт хадгалагдлаа.')}
          </span>
        )}
        {remoteState?.kind === 'fail' && (
          <span className={st.autosaveWarn} role="status" title={remoteState.why + '\n' + tr('3 секунд тутам автоматаар дахин оролдоно. Өөр компьютероос үргэлжлүүлэх бол энэ асуудлыг засаж хуулагдсаны дараа шилжинэ үү.')}>
            {tr('⚠ ArcGIS-д хуулагдсангүй ({0}) — ноорог зөвхөн энэ компьютерт байна.', remoteState.why)}
          </span>
        )}
        {remoteState?.kind === 'ok' && !locked && dirtyCount > 0 && (
          <span className={st.autosave} title={tr('Энэ цагийн байдлаар ArcGIS-д хуулагдсан — өөр компьютероос нэвтэрч үргэлжлүүлж болно.')}>
            {tr('ArcGIS {0}', new Date(remoteState.at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
    </>
  );
}

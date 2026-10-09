/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хэрэгслийн мөрийн хэсгүүд — шүүлтүүр · илгээх товч · оролцогч · обьёмын урсгал · багцын хувь · нооргийн байдал.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { PKGS, pkgFloors, type Pkg } from "../bagts.pkg";
import { date as fmtDate, dateLocale, num, pct } from "@/lib/format";
import { REASON_MAX } from "@/lib/huvaariBatlah";
import { useFocusTrap } from "@/lib/useFocusTrap";
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
  locked, busy, noPerf, fillMode, toggleFill, pkg, setPkg, confirmSwitch, groupOpts, floorOpts,
  asOf, setAsOf, dateOpts, grpA, setGrpA, grpAOpts, grpBEff, setGrpB, grpBOpts, byPlan, setByPlan,
  today, planCount, resized, resetAll, extraN = 0, showExtra = true, toggleExtra, restoring = false,
}: {
  locked: boolean; busy: boolean; noPerf: boolean;
  fillMode: "obyem" | "pct"; toggleFill: () => void;
  pkg: Pkg; setPkg: Dispatch<SetStateAction<Pkg>>; confirmSwitch: () => boolean;
  groupOpts: string[]; floorOpts: Pkg[];
  asOf: number | null; setAsOf: Dispatch<SetStateAction<number | null>>; dateOpts: string[];
  grpA: number; setGrpA: Dispatch<SetStateAction<number>>; grpAOpts: RowsT['grpAOpts'];
  grpBEff: number; setGrpB: Dispatch<SetStateAction<number>>; grpBOpts: RowsT['grpBOpts'];
  byPlan: boolean; setByPlan: Dispatch<SetStateAction<boolean>>;
  today: string; planCount: RowsT['planCount'];
  resized: boolean; resetAll: () => void;
  /** ⚠️ 2026-10-09: «Бусад талбар» — энэ үйлчилгээнд байгаа баганын тоо · харагдах эсэх · солих (`extraCols.ts`) */
  extraN?: number; showExtra?: boolean; toggleExtra?: () => void;
  /** ⚠️ 2026-10-09 (аудит №3): ноорог сэргэж дуустал «Огноо» түгжээтэй (`restoringUi`) — сэргээлтийн `asOf`-той уралдахгүй */
  restoring?: boolean;
}) {
  return (
    <>
        {/* ⚠️ Багц, хувилбар, огноо нь ХЯНАЛТАД тогтмол: илгээсэн агшныг
            хардаг тул сонгуулбал өөр өгөгдөл гарч, хянаж буй зүйл нь
            баталж буй зүйлээсээ зөрнө. Шүүлтүүр (Бүлэг/Дэд бүлэг) хэвээр —
            тэдгээр нь өгөгдлийг биш, харагдацыг л хумина. */}
        {!locked && (<>
        {/* ⚠️ ГОРИМ СОЛИХ — обьём ↔ хувь. Хяналтын горимд (`locked`) харагдахгүй:
            тэнд юу ч бичигдэхгүй тул сонголт утгагүй. */}
        <button
          type="button"
          className={st.modeBtn}
          onClick={toggleFill}
          disabled={busy || noPerf}
          aria-pressed={fillMode === "pct"}
          title={fillMode === "obyem"
            ? tr('Одоо ОБЬЁМоор бөглөж байна — дарж ХУВИАР бөглөх горимд шилжинэ.')
            : tr('Одоо ХУВИАР бөглөж байна — дарж ОБЬЁМоор бөглөх горимд шилжинэ.')}
        >
          <span className={fillMode === "obyem" ? st.modeOn : st.modeOff}>{tr('Обьём')}</span>
          <span className={st.modeSep}>↔</span>
          <span className={fillMode === "pct" ? st.modeOn : st.modeOff}>{tr('Хувь')}</span>
        </button>
        <label className={st.field}>
          {tr('Багц')}{" "}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={(e) => {
              if (!confirmSwitch()) return;
              setPkg(pkgFloors(e.target.value)[0]);
            }}
          >
            {groupOpts.map((g) => (
              <option key={g} value={g}>{tr(g)}</option>
            ))}
          </select>
        </label>
        {/* Хувилбар — зөвхөн 9F ба 12F ХОЁУЛАА хуудастай багцад (1, 2, 4-2).
            Бусад багцад ганц хувилбартай тул сонгогч ч харагдахгүй.
            ⚠️ «Хувилбар» гэдэг нь БАРИЛГЫН давхрын тоо (9F/12F) — модны гүнтэй
            андуурч «Давхар» гэж нэрлэхээс зайлсхийсэн. */}
        {floorOpts.length > 1 && (
          <label className={st.field}>
            {tr('Хувилбар')}{" "}
            <select
              className={st.select}
              value={pkg.key}
              disabled={busy}
              onChange={(e) => {
                if (!confirmSwitch()) return;
                setPkg(PKGS.find((p) => p.key === e.target.value) ?? pkg);
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
              /* ⚠️ Хоосон утга нь «тохируулаагүй» хэсгийг сонгосон гэсэн үг —
                 огноог БУЦААЖ null болгохгүй (санамсаргүй товшилтоор бүх
                 төлөвлөгөөт хувь алга болохоос сэргийлнэ). Огноог арилгах
                 шаардлагатай бол «Хуваарь» харагдацаас хийнэ. */
              const ms = inputToMs(e.target.value);
              if (ms != null) setAsOf(ms);
            }}
            title={tr('Төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогдоно (excel-ийн «Шинэчлэгдсэн огноо»)')}
          >
            {/*
              * ⚠️ ОГНОО ТОХИРУУЛААГҮЙГ ИЛ ХЭЛНЭ (2026-09-06). `value` нь
              * жагсаалтад байхгүй үед хөтөч ЭХНИЙ мөрийг харуулдаг тул урьд
              * нь огноогүй хуудас өөр өдрийг «тохируулсан» мэт үзүүлдэг байв.
              * Энэ мөр нь `value=""`-тэй тул тэр үед ЯГ өөрөө сонгогдоно.
              */}
            {asOf == null && (
              <option value="">{tr('— тохируулаагүй —')}</option>
            )}
            {dateOpts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
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

        {/* ХУВААРИЙН ДАГУУ — тухайн огноонд явах ёстой ажлууд. Тоо нь ИЛ:
            «18 / 1,370» гэж харуулахгүй бол цөөн мөр гарахад хүснэгт
            эвдэрсэн мэт уншигдана. */}
        <button
          className={cls(byPlan ? "layerBtn layerBtnOn" : "layerBtn")}
          disabled={busy}
          onClick={() => setByPlan((v) => !v)}
          title={tr("Өнөөдөр ({0}) хуваарь нь явж байгаа ажлуудыг л харуулна. Хуваарьгүй ажил нуугдана. Дээрх «Огноо» нь ТАЙЛАНГИЙН огноо — үүнд нөлөөлөхгүй.", today)}
        >
          {tr("Хуваарийн дагуу")}{" "}
          <span className={st.layerBtnN}>
            {planCount.on.toLocaleString()} / {planCount.all.toLocaleString()}
          </span>
        </button>

        {/* ⚠️ 2026-10-09: «БУСАД ТАЛБАР» нуух/харуулах — барилгын өргөн хүснэгтэд (60+ багана) төгсгөлийн
            зөвхөн унших бүлгийг хураана. Хяналтын горимд (`locked`) ч ажиллана — зөвхөн харагдац.
            Энэ үйлчилгээнд нэг ч ийм талбар байхгүй бол товч гарахгүй. */}
        {extraN > 0 && toggleExtra && (
          <button
            type="button"
            className={cls(showExtra ? "layerBtn layerBtnOn" : "layerBtn")}
            aria-pressed={showExtra}
            onClick={toggleExtra}
            title={tr('Хүснэгтийн төгсгөлд үйлчилгээний бусад талбарыг (дэс дугаар, хамаарал, нөөц, огноо, засварласан хүн…) зөвхөн унших баганаар харуулна/нууна.')}
          >
            {tr('Бусад талбар')}{" "}
            <span className={st.layerBtnN}>{extraN}</span>
          </button>
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
export function SubmitControls({ locked, canSubmitNow, publish, busy, noEdit, dirtyCount, iAmDone, toggleDone, waitingOn, waitingLast, resendAsIs }: {
  locked: boolean; canSubmitNow: boolean; publish: () => Promise<void>; busy: boolean; noEdit: boolean;
  dirtyCount: number; iAmDone: boolean; toggleDone: () => Promise<void>; waitingOn: string[];
  /** ⚠️ 2026-10-06 аудит: түгжиж буй хүн бүрийн сүүлийн идэвх (мс) — `useDraftSync.waitingLast` */
  waitingLast?: Map<string, number>;
  /** ⚠️ 2026-10-04: буцаагдсан илгээлтийг ӨӨРЧЛӨЛТГҮЙ дахин илгээх (`FillNew.resendAsIs`) — засваргүй үед л */
  resendAsIs?: () => void;
}) {
  return (
    <>
        {/* ══════ НЭГ ТОВЧ — ГУРВАН ТӨЛӨВ (2026-09-08) ══════
            ⚠️ Хэрэглэгчийн шийдвэр: «хамгийн сүүлд үлдсэн хүн илгээх эрхтэй
            болно», нэг байрлалд НЭГ товч. Хоёр товч зэрэг идэвхтэй байвал
            сүүлийн хүн аль нь зөвийг мэдэхгүй — «Дуусгасан» дарах нь тэр
            үед утгагүй (илгээх нь өөрөө батламж).

              · бусад хүлээгдэж байна → «Дуусгасан»  (өөрийгөө хасна)
              · өөрөө дуусгасан      → «Дахин засах» (буцаана)
              · хүлээх хүнгүй        → «Илгээх»      (хуучин зан ХЭВЭЭР)

            ⚠️ ГАНЦААРАА бөглөж байвал `waitingOn` хоосон тул ШУУД «Илгээх» —
            багцын дийлэнхийг нэг хүн бөглөдөг бөгөөд тэдэнд шинэ алхам
            нэмэгдэх ЁСГҮЙ. */}
        {!locked && (
          canSubmitNow ? (
        <button
          className={st.publishBtn}
          /* ⚠️ 2026-10-04: засваргүй (`dirtyCount === 0`) ч БУЦААГДСАН илгээлтийг хэвээр нь дахин
             илгээж болно (хянагч алдаатай буцаасан г.м.) — урьд нь товч саарал тул гацдаг байв. */
          onClick={dirtyCount === 0 && resendAsIs ? resendAsIs : publish}
          /* ⚠️ `inReview` НЬ ЭНД БАЙХАА БОЛИВ (2026-09-07, хэрэглэгч: «хэдэн ч
             удаа илгээх боломжтой болго»). Хянагдаж байгаа нь товчийг
             ХААХГҮЙ; өдөр бүр тусдаа `sub|<pkg>|<fillMs>` мөртэй тул өөр
             өдрийн агуулга хөндөгдөх боломжгүй, ЯГ энэ өдрийнхийг дахин
             илгээх нь харин САНААТАЙ зөвшөөрөгдсөн (тэр мөр update хийгдэнэ).
             Мэдэгдэл нь доорх `lockNote`-оор гарна. */
          disabled={busy || noEdit || (dirtyCount === 0 && !resendAsIs)}
          title={tr('Илгээлтийг завсрын хадгалалтад хадгалж хяналтад оруулна — үндсэн өгөгдөлд газрын дарга баталсны дараа л орно (Ctrl+S)')}
        >
          {/* ⚠️ «Нийтлэх» → «Илгээх» (2026-09-06, хэрэглэгчийн заавар).
              2026-09-04-нөөс энэ товч ҮНДСЭН ӨГӨГДӨЛД ОГТ БИЧИХГҮЙ — зөвхөн
              илгээлт үүсгэж хяналтад оруулна; архивт газрын дарга (6-р шат)
              баталсны дараа л бичигдэнэ. «Нийтлэх» гэсэн нэр нь «тоо маань
              одоо албан ёсоор орлоо» гэж ойлгогдож, бөглөгч хяналтыг
              хүлээхгүй өнгөрөх төөрөгдөл үүсгэж байв. */}
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
        {/* ⚠️ ЯАГААД ТҮГЖЭЭТЭЙГ ИЛ ХЭЛНЭ: шалтгаангүй саарал товч нь
            «эвдэрсэн» гэж ойлгогдоно. Хэнийг хүлээж байгааг нэрээр нь. */}
        {/* ⚠️ 2026-10-06 аудит: ХЭЗЭЭНЭЭС хойш хүлээж буйг ба АВТОМАТ чөлөөлөлтийг хэлнэ —
            урьд нь сүүлийн хүн 3 хоног хүртэл шалтгаангүй гацдаг байв (`waitingOn`-ийн ⚠️).
            Агшингүй (хуучин ноорог) хүний нэрийг огноогүй бичнэ — «мэдээлэлгүй» ≠ «идэвхгүй». */}
        {!locked && !canSubmitNow && (
          <span className={st.muted} role="status">
            {tr('Илгээх — {0} дуусгаагүй байна', waitingOn.map((u) => {
              const a = waitingLast?.get(u);
              return a != null ? tr('{0} (сүүлд {1})', u, fmtDate(a)) : u;
            }).join(', '))}
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
        {/* ══════ ХУВААЛЦСАН БӨГЛӨЛТ — хэн ажиллаж байна ══════
            ⚠️ ЗӨВХӨН олон хүн оролцсон үед гарна: ганцаараа бөглөж байхад
            «👥 өөрийн нэр» гэж харуулах нь дэмий чимээ. */}
        {participants.size > 1 && (
          <span className={st.muted} title={tr('Энэ багцын нооргийг хуваалцаж бөглөж байгаа аккаунтууд')}>
            {'👥 '}
            {/* ⚠️ Нүдний тоог хажууд нь — өнгөт нүдтэй уялдана. 0 бол
                бичихгүй: тэр хүн энэ тойрогт юу ч бөглөөгүй гэсэн үг. */}
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
  /** ⚠️ 2026-10-01: сүүлийн шийдвэр нь БУЦААЛТ бол тэр илгээлт (`useObyem.pvReturned`) */
  pvReturned?: ObyemT['pvReturned'];
  /** ⚠️ 2026-10-04: зохиогч өөрийн хүлээгдэж буй илгээлтийг татаж авна (`useObyem.withdrawObyemHere`) */
  withdrawObyemHere?: ObyemT['withdrawObyemHere'];
  /** Нэвтэрсэн хэрэглэгч — «Татаж авах» товчийг зөвхөн зохиогчид */
  me?: string;
  /**
   * ⚠️ 2026-10-09: хүлээгдэж буй илгээлтийг ХЭСЭГЧЛЭН бичсэн батлагч (`useObyem.partial`, `''` = нэргүй) — `null`
   *    бол тэмдэггүй. Тэмдэгтэй илгээлтийг жирийн «Обьём буцаах» lib-д татгалздаг тул батлагчид «Гацсаныг буцаах».
   */
  partial?: string | null;
  /** ⚠️ 2026-10-09: гацсан илгээлтийг шалтгаантай буцаана (`useObyem.returnStuck`) */
  returnStuck?: (reason: string) => Promise<void>;
  /** ⚠️ 2026-10-09: сүүлийн БАТЛАГДСАН илгээлтийн тайлбар — «Алгассан нүд (N): …» (`useObyem.note`) */
  note?: string | null;
}) {
  /** ⚠️ 2026-10-06 аудит: буцаах шалтгааны цонх — `null` = хаалттай */
  const [rej, setRej] = useState<string | null>(null);
  /** ⚠️ 2026-10-09: «Гацсаныг буцаах» шалтгааны цонх — `null` = хаалттай */
  const [stuck, setStuck] = useState<string | null>(null);
  /** Гацсан (хэсэгчлэн бичигдсэн) — батлагчид «Обьём буцаах»-ын оронд «Гацсаныг буцаах» */
  const isStuck = partial != null && !!returnStuck;
  return (
    <>
        {/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БУЦААГДСАН обьёмын илгээлт ба ШАЛТГААН —
            инженер (обьём засах эрхтэй хүн) хуудсандаа харна; дахин илгээмэгц алга болно. */}
        {canObyemEdit && !pvSub && pvReturned && (
          <span className={st.lockNote} role="status">
            {tr('Обьёмын илгээлт буцаагдсан ({0} нүд · {1}): {2} — засаад дахин «Обьём батлуулах» дарна уу.',
              String(pvReturned.cellCount),
              /* ⚠️ 2026-10-06 аудит: `'mn-MN'` хатуу байсан — англи горимд ч монгол огноо гардаг байв */
              [pvReturned.approver ?? '', pvReturned.approverAt ? fmtDate(pvReturned.approverAt) : ''].filter(Boolean).join(' · ') || '—',
              pvReturned.reason ?? '—')}
          </span>
        )}
        {/* ══════ ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — тусдаа урсгал ══════
            ⚠️ «Илгээх»-ЭЭС ТУСДАА товч: тэр нь ГҮЙЦЭТГЭЛИЙГ 6 шатат
            хяналтад оруулдаг, энэ нь ТӨЛӨВЛӨСӨН ОБЬЁМЫГ 2 шатат батлах
            урсгалд. Нэг товчинд нийлүүлбэл хоёр өөр шийдвэр нэг
            батламжид уягдана. */}
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
            {tr('Обьём батлуулахаар илгээгдсэн: {0} нүд · {1}', String(pvSub.cellCount), pvSub.author)}
          </span>
        )}
        {/* ⚠️ 2026-10-04: ӨӨРИЙН хүлээгдэж буй илгээлтээ татаж авах — батлагч ирэхгүй бол гацдаг байв.
            Дүрэм (зөвхөн зохиогч · зөвхөн pending) lib-д дахин шалгагдана. */}
        {pvSub && withdrawObyemHere && canObyemEdit && !locked && me && pvSub.author.trim().toLowerCase() === me.trim().toLowerCase() && (
          <button className={st.layerBtn} onClick={() => void withdrawObyemHere()} disabled={pvBusy}>
            {tr('Илгээлтээ татаж авах')}
          </button>
        )}

        {/* Батлагчийн шийдвэр — зөвхөн эрхтэй хүнд.
            ⚠️ ХЯНАЛТЫН ХАРАГДАЦАД (`locked`) ХАРАГДАХГҮЙ (2026-09-25-ны аудит):
            тэр харагдац «зөвхөн харах» гэж зарлагдсан (`RO.viewOnly`) атлаа
            эндээс үндсэн өгөгдөлд (`applyUpdates`) бичих зам нээлттэй байв.
            `decideObyemHere` ч мөн шалгана. */}
        {pvSub && canObyemApprove && !locked && (
          <>
            <button
              className={st.publishBtn}
              onClick={() => {
                /* ⚠️ 2026-10-04: баталгаажуулалт — батлахад утга ШУУД үндсэн өгөгдөлд бичигдэнэ */
                if (!window.confirm(tr('Инженерийн обьёмын {0} нүдийг батлах уу? Утгууд шууд үндсэн өгөгдөлд бичигдэж, гүйцэтгэлийн хувь дахин бодогдоно.', String(pvSub.cellCount)))) return;
                void decideObyemHere(true);
              }}
              disabled={pvBusy}
              title={tr('Батлаад үндсэн өгөгдөлд бичнэ')}
            >
              {tr('Обьём батлах')}
            </button>
            {/* ⚠️ 2026-10-09: ХЭСЭГЧЛЭН бичигдсэн илгээлт — жирийн буцаалт lib-д татгалзагдана; гүйцээх
                («Обьём батлах») эсвэл шалтгаантай «Гацсаныг буцаах». Тэмдэггүй бол урьдын «Обьём буцаах». */}
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
                /* ⚠️ Шалтгаан ЗААВАЛ — `decideObyem` ч мөн шалгана.
                   ⚠️ 2026-10-06 аудит: `window.prompt` → өөрийн цонх (`RejectDialog`) — prompt нь уртын
                   хязгааргүй тул 2048-аас урт шалтгаан `applyEdits`-ийг бүхэлд нь унагадаг байв.
                   «Болих»/Esc = чимээгүй гарна (2026-10-05-ны зан хэвээр); ХООСОН шалтгаанд цонхны
                   товч идэвхгүй, `decideObyem` ч СҮЛЖЭЭНЭЭС ӨМНӨ татгалзана (мессеж нь `pvErr`-д). */
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
        {/* ⚠️ 2026-10-09: сүүлийн батлагдсан илгээлтэд батлагчийн АЛГАССАН нүд (хадгалагдсан тайлбар — өгөгдөл, орчуулахгүй) */}
        {note && <span className={st.muted} role="status">{note}</span>}
    </>
  );
}

/**
 * ОБЬЁМ БУЦААХ ШАЛТГААНЫ ЦОНХ (2026-10-06 аудит) — `window.prompt`-ийн оронд.
 * ⚠️ `maxLength={REASON_MAX}` — талбар 2048; хэтэрвэл `applyEdits` бүхэлдээ унана
 *    (`huvaari/FlowBox`-той ижил хязгаар). Esc / арын дэвсгэр / «Болих» = чимээгүй хаана.
 */
function RejectDialog({ text, onText, busy, onClose, onOk, title, okLabel }: {
  text: string; onText: (v: string) => void; busy: boolean;
  onClose: () => void; onOk: (why: string) => void;
  /** ⚠️ 2026-10-09: «Гацсаныг буцаах»-д гарчиг/товчны бичвэр (байхгүй бол «Обьём буцаах») */
  title?: string; okLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  /* ⚠️ `autoFocus` биш — `useFocusTrap` эхний товч (×) руу фокуслодог (`huvaari/LinkModal`-ийн ⚠️) */
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
export function PkgPctBadge({ pkgPct, pkg, dirtyCount, otherPct }: {
  pkgPct: RowsT['pkgPct']; pkg: Pkg; dirtyCount: number; otherPct: RowsT['otherPct'];
}) {
  return (
    <>
        {/*
          * БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — багц бүрд, хэрэгслийн мөрөнд.
          * ⚠️ Хоёр дахь тоо (батлагдаагүй) нь ЗӨВХӨН ноорогтой үед гарна:
          *    ноороггүй бол хоёр тоо ижил байх тул давхардал болно.
          */}
        {pkgPct?.saved != null && (
          <span className={st.pkgPct}>
            {/*
              * ⚠️ ХУВИЛБАРЫГ ИЛ БИЧНЭ (2026-09-09, хэрэглэгч: «9F 12F
              *    гүйцэтгэл бөглөлтөд тусад нь гүйцэтгэлийг харуул»).
              *
              *    Багц 1 нь ХОЁР хуудастай: 9F (12 блок) ба 12F (8 блок).
              *    Энэ тоо нь ЗӨВХӨН нээлттэй хуудсынх — «Багцын гүйцэтгэл»
              *    дэлгэц харин БҮХ 20 блокийн дунджийг (26.9%) харуулдаг
              *    тул хоёр тоо ЗӨРНӨ. Блок бүрийн утга нь яг таарч байгаа
              *    (5/1=29.8 …) — ялгаа нь зөвхөн ХАМРАХ ХҮРЭЭ. Шошгонд
              *    хувилбар ба блокийн тоог бичсэнээр тэр зөрүү
              *    тайлбартай болно.
              */}
            <span className={st.pkgPctLab}>
              {/* ⚠️ 2026-10-09: блокгүй багцад (`floors: null`, синтетик НЭГ блок) «nullF · 1 блок» утгагүй —
                  «Б» мөрийн гүйцэтгэл л харагдана */}
              {pkg.floors == null
                ? tr('Бодит гүйцэтгэл')
                : tr('Бодит гүйцэтгэл · {0} · {1} блок', `${pkg.floors}F`, num(pkgPct.blocks))}
            </span>
            <b className={st.pkgPctNow} title={tr('Энэ ХУУДСЫН ({0}) батлагдсан гүйцэтгэл — блокуудынх нь дундаж. «Багцын гүйцэтгэл» дэлгэц дээрх багцын тоо нь бүх хувилбарын блокуудыг нийлүүлдэг тул арай өөр байж болно.', pkg.label)}>
              {pct(pkgPct.saved, 2)}
            </b>
            {/* ⚠️ 2026-09-30: илгээсэн (хяналтад буй) нэмэлт ч «батлагдаагүй» — ноорог хоосон ч
                (`usePkgPct.saved` нь одоо илгээлтгүй архиваас) ялгаатай бол харуулна */}
            {pkgPct.draft != null && (dirtyCount > 0 || Math.abs(pkgPct.draft - pkgPct.saved) > 1e-9) && (
              <b
                className={st.pkgPctNew}
                title={tr('Таны бөглөсөн, хараахан БАТЛАГДААГҮЙ гүйцэтгэл. «Илгээх» дараад 6 шатны хяналт дамжсаны дараа энэ тоо батлагдсан болно.')}
              >
                {tr('батлагдаагүй')} {pct(pkgPct.draft, 2)}
                <i className={st.pkgPctGap}>
                  {` (${pkgPct.draft - pkgPct.saved >= 0 ? '+' : '−'}${pct(Math.abs(pkgPct.draft - pkgPct.saved), 2)})`}
                </i>
              </b>
            )}
            {/*
              * НӨГӨӨ ХУВИЛБАР — хуудас солихгүйгээр хоёулаа харагдана.
              * ⚠️ Бүдэг: нээлттэй хуудасны тоо нь ГОЛ, энэ нь лавлах.
              */}
            {otherPct && (
              <span
                className={st.pkgPctOther}
                title={tr('Энэ багцын НӨГӨӨ хувилбарын ({0}) батлагдсан гүйцэтгэл. Хувилбар сонгогчоор шилжиж бөглөнө.', otherPct.label)}
              >
                {tr('{0} · {1} блок', otherPct.label, num(otherPct.blocks))}{' '}
                <b>{pct(otherPct.pct, 2)}</b>
              </span>
            )}
          </span>
        )}
    </>
  );
}

/** Нооргийн байдал — ногоон тоолуур · устгах · хадгалсан агшин · ArcGIS */
export function DraftStatus({ locked, dirtyCount, noPerf, dropDraft, savedAt, remoteState, restoring = false, offline = false, localFail = false, canDrop = false }: {
  locked: boolean; dirtyCount: number; noPerf: boolean; dropDraft: () => void; savedAt: number | null; remoteState: RemoteState;
  /**
   * ⚠️ 2026-10-09 (аудит №3): бөглөх нь ТҮР хоригтой (`FillNew.reviewLock`) ч «ноорог устгах» НЭЭЛТТЭЙ — урьд нь хориг
   *    асах агшинд `pending` дүүрэн байсан гүйцэтгэгч «Илгээх» ч, «ноорог устгах» ч үгүй, `resumeReturned` нь «эхлээд
   *    илгээ/устга» гэдэг тул ГАЦДАГ байв.
   */
  canDrop?: boolean;
  /** ⚠️ 2026-10-01: ноорог сэргээж байна — нүд түгжээтэй (`useDraftSync.restoringUi`) */
  restoring?: boolean;
  /** ⚠️ 2026-10-01: хөтөч сүлжээгүй — ноорог зөвхөн энэ төхөөрөмжид */
  offline?: boolean;
  /**
   * ⚠️ 2026-10-04 аудит (#9): ЛОКАЛ хадгалалт УНАСАН (сан дүүрсэн/хаалттай, `useDraftSync.localFail`) —
   * урьд нь алдааг залгиж «ноорог хадгалагдав» гэж ХУДАЛ баталдаг байв.
   */
  localFail?: boolean;
}) {
  return (
    <>
        {/* ⚠️ 2026-10-01: СЭРГЭЭЛТИЙН түгжээг ИЛ хэлнэ — нүд яагаад нээгдэхгүйг ойлгоно */}
        {!locked && restoring && (
          <span className={st.restoringBadge} role="status">{tr('Ноорог сэргээж байна…')}</span>
        )}
        {/* ⚠️ 2026-10-01: ОФЛАЙН — бөглөлт зогсохгүй (локалд хадгалагдана), ArcGIS руу дараа нь */}
        {!locked && offline && (
          <span className={st.offlineBadge} role="status"
            title={tr('Сүлжээ тасарсан — засвар энэ төхөөрөмжид хадгалагдаж байна; сүлжээ сэргэмэгц ArcGIS руу автоматаар хуулагдана. Илгээх боломжгүй.')}>
            {tr('Офлайн')}
          </span>
        )}
        {/* ⚠️ ТАЙЛБАР — ХОЁР төлөвийн ялгааг ҮГЭЭР хэлнэ (2026-09-06).
            Өнгө ганцаараа мэдээлэл дамжуулах ёсгүй (төслийн дүрэм).
            Зөвхөн ноорогтой үед гарна — юу ч бөглөөгүй бол чимээ болно. */}
        {!locked && dirtyCount > 0 && (
          <span className={st.hint}>
            <span className={st.legDirty} title={tr('Ногоон хүрээтэй нүд — та зассан, хараахан ИЛГЭЭГЭЭГҮЙ. «Илгээх» дарж хянагчид хүргэнэ. Тэмдэггүй нүд нь илгээгдсэн тоо.')}>
              {tr('ногоон: илгээгээгүй ({0})', dirtyCount)}
            </span>
            {/* ⚠️ «БОЛИХ» ЦОРЫН ГАНЦ ЗАМ (2026-09-06). Сэргээх цонх хасагдаж
                ноорог ШУУД буудаг болсон тул түүний «Устгах» гарц ч алга
                болов. Энэ товчгүй бол хэрэглэгч 40 нүдийг ГАРААР цэвэрлэнэ. */}
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
        {/* ⚠️ АВТОМАТ ХАДГАЛАЛТЫН БАТАЛГАА. Ноорог нь зөвхөн ЭНЭ хөтөч дээр
            байдгийг ил хэлнэ — «хадгалагдсан» гэдгийг «илгээгдсэн» гэж
            ойлговол хэрэглэгч Нийтлэх дарахгүй өнгөрч, ажил нь хянагчид
            хүрэхгүй үлдэнэ. */}
        {!locked && localFail && dirtyCount > 0 && (
          <span className={st.autosaveWarn} role="alert">
            {tr('Ноорог энэ хөтчид хадгалагдсангүй (сан дүүрсэн эсвэл хаалттай) — зөвхөн ArcGIS-д хуулагдана. Таб хаахаас өмнө «Илгээх» дарах эсвэл хөтчийн сан чөлөөлнө үү.')}
          </span>
        )}
        {!locked && savedAt != null && dirtyCount > 0 && !localFail && (
          <span
            className={st.autosave}
            /* ⚠️ Тайлбар нь ҮНЭН байх ёстой: ноорог одоо ArcGIS руу ч
               хуулагддаг тул «зөвхөн энэ компьютерт» гэдэг нь худал болов. */
            title={tr('Ноорог энэ хөтөчид, мөн ArcGIS-д хадгалагдана — өөр компьютероос нэвтэрсэн ч сэргээх боломжтой. Хянагчид хүргэхийн тулд «Илгээх» дарна.')}
          >
            {tr('ноорог хадгалагдав {0}', new Date(savedAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
        {/* ⚠️ ХЭТ ТОМ ноорог алсад ЯВААГҮЙГ ил хэлнэ — «хадгалагдсан» гэж
            бодоод өөр машин дээр хоосон хуудас хүлээж авах нь хамгийн муу. */}
        {remoteState?.kind === 'big' && (
          <span className={st.autosaveWarn} role="status">
            {tr('Ноорог хэт том тул зөвхөн энэ компьютерт хадгалагдлаа.')}
          </span>
        )}
        {/* ⚠️ АЛСЫН ХУУЛБАР УНАСАН (2026-09-06) — сүлжээ, токен, эрх, хүснэгт
            аль нь ч болсон үр дүн НЭГ: ноорог ЗӨВХӨН энэ компьютерт байна.
            Бөглөлт зогсохгүй тул алдаа биш, харин БАЙДЛЫН мэдээлэл. */}
        {remoteState?.kind === 'fail' && (
          /* ⚠️ ШАЛТГААНЫГ ХАМТ ХЭЛНЭ (2026-09-08). Урьд нь ямар ч шалтгаангүй
             «хуулагдсангүй» гэж л гардаг тул хэрэглэгч сүлжээ гэж бодоод
             хүлээдэг байв — харин жинхэнэ шалтгаан нь хүснэгт үүсээгүй,
             эзэн зөрсөн, эрхгүй зэрэг ХҮЛЭЭГЭЭД засрахгүй зүйлс байж болно. */
          <span className={st.autosaveWarn} role="status" title={remoteState.why + '\n' + tr('3 секунд тутам автоматаар дахин оролдоно. Өөр компьютероос үргэлжлүүлэх бол энэ асуудлыг засаж хуулагдсаны дараа шилжинэ үү.')}>
            {tr('⚠ ArcGIS-д хуулагдсангүй ({0}) — ноорог зөвхөн энэ компьютерт байна.', remoteState.why)}
          </span>
        )}
        {/* ⚠️ АМЖИЛТТАЙГ ч ил хэлнэ: «хадгалагдав» гэдэг нь локалыг хэлдэг тул
            алсын хуулбар ХЭЗЭЭ хуулагдсаныг тусад нь харуулж байж л бөглөгч
            «өөр компьютероос үргэлжлүүлж болно» гэдэгт итгэнэ. */}
        {remoteState?.kind === 'ok' && !locked && dirtyCount > 0 && (
          <span className={st.autosave} title={tr('Энэ агшны байдлаар ArcGIS-д хуулагдсан — өөр компьютероос нэвтэрч үргэлжлүүлж болно.')}>
            {tr('ArcGIS {0}', new Date(remoteState.at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
    </>
  );
}

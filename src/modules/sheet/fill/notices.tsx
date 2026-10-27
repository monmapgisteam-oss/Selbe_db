/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хүснэгтийн дээрх мэдэгдлүүд (илгээлт · тулгагдаагүй нүд · хяналт · буцаалт) ба хөвөгч мэдэгдэл.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { STAGE_LABEL } from "@/lib/hyanaltGroup";
import { t as tr } from "@/lib/i18nCore";
import { date as fmtDate } from "@/lib/format";
import type { ReturnInfo } from "@/lib/hyanaltStore";
import type { useFlow } from "./useFlow";
import type { NoticeKind } from "./util";
import st from "../sheet.module.css";

type FlowT = ReturnType<typeof useFlow>;

/**
 * ⚠️ 2026-10-23 (UX аудит F2): БУЦААЛТЫН ШАЛТГААН · ХЭН · ХЭЗЭЭ — нэг мөрөөр. Шалтгаан хоосон (хуучин мөр) бол
 *    «шалтгаан бичигдээгүй» гэж ИЛ хэлнэ (хоосон зай үлдээхгүй). Нэр/огноо байхгүй бол тэр хэсгийг л орхино.
 */
function returnLine(info: ReturnInfo | null | undefined): string {
  if (!info) return '';
  const who = [info.by, info.at ? fmtDate(info.at) : ''].filter(Boolean).join(' · ');
  const why = info.reason || tr('шалтгаан бичигдээгүй');
  return who ? tr('Шалтгаан: {0} ({1})', why, who) : tr('Шалтгаан: {0}', why);
}

export function FillNotices({
  locked, submitFailed, resend, resending, unmovedWarn, subReadErr, inReview, reviewStage,
  otherDaysInReview, otherDaysReturned, noEdit, busy, resumedOid, resumeReturned, returned,
  canAct = true, reviewLockDays = [], hyErr = null, frameTrunc = null, returnInfo = null,
}: {
  locked: boolean; submitFailed: boolean; resend: () => Promise<void>; resending: boolean;
  unmovedWarn: string[]; subReadErr: string | null; inReview: boolean; reviewStage: FlowT['reviewStage'];
  otherDaysInReview: string[]; otherDaysReturned: FlowT['otherDaysReturned']; noEdit: boolean; busy: boolean;
  resumedOid: number | null; resumeReturned: (soid: number) => Promise<void>; returned: boolean;
  /**
   * ⚠️ 2026-10-09 (аудит №3): гүйцэтгэгчийн товч («Хяналтад илгээх» · «засаж дахин илгээх») гарах эсэх — томилогдсон
   *    гүйцэтгэгч, батлагчийн харагдац БИШ (`FillNew.permPerf && !reviewerOnly`). Урьд нь зөвхөн `!locked`/`!noEdit`-ээр
   *    шүүгддэг тул батлагчид харагдаж, газрын дарга хяналтын тойрог нээж чаддаг байв.
   */
  canAct?: boolean;
  /** ⚠️ 2026-10-09 (аудит №3): ИДЭВХТЭЙ хоригийн өдрүүд (`FillNew.reviewLockDays`) — буцаалтын засвар хийж байхад хоосон */
  reviewLockDays?: string[];
  /**
   * ⚠️ 2026-10-12 (аудит №8): хяналтын жагсаалтын (`useHyanaltRows`) уншилтын алдаа (цэвэрлэсэн текст). Урьд нь
   *    `useFlow.hyErr` ХААНА Ч зурагддаггүй тул жагсаалт уншигдаагүй үед буцаалт/ногоон ✓ түгжээ/хориг чимээгүй
   *    алга болдог байв (`FillNew.publish` түүнийг идэвхтэй илгээлттэй үед хаадаг). `null` = алдаагүй.
   */
  hyErr?: string | null;
  /** ⚠️ 2026-10-12 (аудит №8): сүүлийн архивын жааз тасарсан — хуудас өмнөх өдрийн жаазыг харуулж байна (`FillNew.frameTrunc`) */
  frameTrunc?: { day: string; rows: number; need: number; shownDay: string } | null;
  /** ⚠️ 2026-10-23 (UX аудит F2): ЭНЭ илгээлтийн буцаалтын шалтгаан · хянагч · огноо (`useFlow.returnInfo`) */
  returnInfo?: ReturnInfo | null;
}) {
  return (
    <>
      {/* ⚠️ 2026-10-12 (аудит №8): ТАСАРСАН ЖААЗ — хуучин (өмнөх өдрийн) тоо харагдаж буйг ИЛ хэлнэ; «Илгээх» хаалттай */}
      {frameTrunc && (
        <p className={st.lockNote} role="alert">
          {tr('Архивын сүүлийн жааз ({0}) дундаа тасарсан ({1}/{2} мөр) — доорх тоо {3}-ны бүтэн жаазаас. Тасарсан жааз цэвэрлэгдтэл «Илгээх» хаалттай; газрын дарга дахин «Батлах» дарж эсвэл админ цэвэрлэнэ.', frameTrunc.day, frameTrunc.rows, frameTrunc.need, frameTrunc.shownDay)}
        </p>
      )}
      {/* ⚠️ 2026-10-12 (аудит №8): хяналтын жагсаалт уншигдаагүй — буцаалт/зөвшөөрлийн тэмдэглэгээ дутуу байж болзошгүй */}
      {hyErr && (
        <p className={st.lockNote} role="alert">
          {tr('Хяналтын жагсаалтыг татаж чадсангүй ({0}) — буцаалт ба хянагчийн зөвшөөрсөн (ногоон ✓) нүдний тэмдэглэгээ дутуу байж болзошгүй; идэвхтэй илгээлттэй бол «Илгээх» түр хаалттай. Хуудсыг дахин ачаална уу.', hyErr)}
        </p>
      )}
      {/*
        * ⚠️ ХОЁР МЭДЭГДЭЛ, ХОЁР ӨӨР ЭХ СУРВАЛЖ:
        *   · унасан бүртгэл → ЗӨВХӨН энэ сешний илгээлтээс (`submitFailed`);
        *   · «хяналтад байна» → хяналтын УРСГАЛЫН мөрөөс (`inReview`).
        * ⚠️ 2026-09-04: хоёр дахь нь урьд нь `submittedToday` буюу «өнөөдөр
        *   архивт агшин үүссэн үү» гэсэн ТААМАГ байв. Илгээлт архивт
        *   бичигдэхээ больсон тул одоо урсгалын мөр ШУУД хэлнэ.
        */}
      {!locked && submitFailed && (
        <p className={st.lockNote}>
          {tr('Илгээлт хадгалагдсан ч хяналтын бүртгэл ҮҮССЭНГҮЙ — хянагч үүнийг харахгүй.')}
          {/* ⚠️ 2026-10-09 (аудит №3): зөвхөн гүйцэтгэгчид (`canAct`-ийн ⚠️) */}
          {canAct && (
            <button type="button" className={st.resend} onClick={resend} disabled={resending}>
              {resending ? tr('Илгээж байна…') : tr('Хяналтад илгээх')}
            </button>
          )}
        </p>
      )}
      {/* ⚠️ ТУЛГАГДААГҮЙ НҮД — батлах шатанд багц гацахаас ӨМНӨ хэлнэ
          (`unmovedWarn`-ийн ⚠️ тайлбар). ⚠️ 2026-10-22 (аудит №4): ХОЁР шалтгаан — тулгагдаагүй мөр ЭСВЭЛ тоо биш нэмэлт
          (`sheetFrame` хоёуланг нь `unmovedKeys`-д оруулдаг); урьд нь зөвхөн тулгалтыг нэрлэж буруу зүйл засуулдаг байв. */}
      {unmovedWarn.length > 0 && (
        <p className={st.lockNote} role="alert">
          {tr('Илгээсэн зарим нүдийг хуудсанд буулгаж чадсангүй — мөр нь шинэ мөрүүдэд тулгагдаагүй, эсвэл нэмэлтийн утга нь тоо биш («1,250» · «abc» мэт). Эдгээрийг ДАХИН бөглөж (тоог зөв бичиж) илгээнэ үү, эс бөгөөс газрын дарга батлах үед багц бүхэлдээ гацна: {0}', unmovedWarn.join('; '))}
        </p>
      )}
      {/*
        * ⚠️ ИЛГЭЭЛТ УНШИГДААГҮЙ (2026-09-07-ны аудит, CRITICAL).
        *
        * Уншилт унавал overlay хийгдэхгүй тул дэлгэц дээр архивын суурь жааз
        * (голдуу БҮХ НҮД 0%) харагдана. Урьд нь энэ нь ЧИМЭЭГҮЙ болдог тул
        * гүйцэтгэгч «илгээсэн ажил минь алга болжээ» гэж дүгнэн дахин
        * бөглөдөг байв. Одоо 0% нь ҮНЭН үү, эсвэл зүгээр л УНШИГДААГҮЙ юу
        * гэдгийг хэрэглэгч ялгаж чадна.
        */}
      {subReadErr && (
        <p className={st.lockNote} role="alert">
          {tr('Илгээсэн ажлыг татаж чадсангүй ({0}) — доорх тоо ДУТУУ байж болзошгүй. Хуудсыг дахин ачаална уу; ажил алдагдаагүй, зөвхөн харагдаагүй байна.', subReadErr)}
        </p>
      )}
      {/* ⚠️ 2026-10-09 (аудит №3): ДООРХ 2026-09-07-НЫ ТАЙЛБАР ХУУЧИРСАН — хянагдаж буй илгээлт байхад шинэ бөглөлт/илгээлт
          ХААЛТТАЙ (`FillNew.reviewLock` · домэйн `reviewLockDeny`): дахин илгээх нь хянагдаж буй мөрийг шинэчлэхгүй, өөр
          өдрийнх ч өнөөдрийнхөд саад болно. Хоёр мэдэгдлийн текст хоригийн дүрмээр солигдов (урьд нь «саад болохгүй»,
          «тэр илгээлт шинэчлэгдэнэ» гэж хоригтой зөрдөг байв). Буцаагдсан илгээлтийн засвар хийж байхад (`reviewLockDays`
          хоосон) өөр өдрийн хянагдаж буйг саад гэж хэлэхгүй.
          ⚠️ ХОЁР ӨӨР МЭДЭГДЭЛ (2026-09-07) — ХОЁУЛАА САНУУЛГА, ХОРИГ БИШ:
          · ЭНЭ ӨДРИЙН илгээлт хянагдаж байна → дахин илгээвэл ТЭР мөр
            ШИНЭЧЛЭГДЭНЭ (шинэ тойрог үүсэхгүй), хянагч доор нь солигдсоныг
            мэдэхгүй байж болзошгүй — тиймээс гүйцэтгэгчид ил хэлнэ;
          · ӨӨР ӨДРИЙН илгээлт хянагдаж байна → өнөөдрийнхөд ОГТ саадгүй,
            зөвхөн «хариу хүлээж буй өдрүүд» гэдгийг санууллаа.
          Хуучин «хянагч шийдвэрлэсний дараа дахин илгээж болно» гэсэн текст
          ХАСАГДСАН — тэр нь одоо ХУДАЛ (хүлээх шаардлагагүй). */}
      {!locked && !submitFailed && inReview && (
        <p className={st.lockNote}>
          {tr('Энэ өдрийн илгээлт хяналтад байна — {0}. 7 шат бүрэн батлагдаж архивлагдтал шинээр бөглөх, дахин илгээх боломжгүй; хянагч буцаавал засаж дахин илгээнэ.', reviewStage ? STAGE_LABEL[reviewStage] : '')}
        </p>
      )}
      {!locked && otherDaysInReview.length > 0 && (
        <p className={st.lockNote}>
          {reviewLockDays.length > 0
            ? tr('Өмнөх өдрийн илгээлт хяналтад байна ({0}) — 7 шат бүрэн батлагдаж архивлагдтал өнөөдрийн шинэ бөглөлт, илгээлт хаалттай. Буцаасан илгээлтийг засаж дахин илгээх боломжтой.', otherDaysInReview.join(', '))
            : tr('Өмнөх өдрийн илгээлт хяналтад байна ({0}) — одоо зөвхөн буцаасан илгээлтийн засварыг илгээнэ; шинэ бөглөлт тэр илгээлт батлагдаж архивлагдсаны дараа.', otherDaysInReview.join(', '))}
        </p>
      )}
      {/* 2026-09-21 (дахин аудит): өнөөдрийн мөр байхад өмнөх өдрийн буцаалт
          `flow` болдоггүй тул тусад нь мэдэгдэнэ (`otherDaysReturned`). */}
      {!locked && otherDaysReturned.length > 0 && (
        <p className={st.backNote}>
          {tr('Өмнөх өдрийн илгээлт хяналтаас БУЦААСАН ({0}) — засвар шаардлагатай.', otherDaysReturned.map((x) => x.day).join(', '))}
          {/* ⚠️ 2026-10-23 (UX аудит F2): өдөр бүрийн шалтгаан — сонгохоос ӨМНӨ юу засахаа мэднэ */}
          {otherDaysReturned.filter((x) => x.info).map((x) => (
            <span key={`r${x.soid}`} className={st.returnWhy}>{x.day}: {returnLine(x.info)}</span>
          ))}
          {/* ⚠️ Буцаагдсан илгээлтийг сонгож давхарлана — `resumedOid`-ийн ⚠️ (2026-09-24) */}
          {/* ⚠️ 2026-10-09 (аудит №3): зөвхөн гүйцэтгэгчид (`canAct`-ийн ⚠️) */}
          {!noEdit && canAct && otherDaysReturned.filter((x) => Number.isInteger(x.soid) && x.soid > 0).map((x) => (
            <button key={x.soid} type="button" className={st.linkBtn} disabled={busy || resumedOid === x.soid}
              onClick={() => void resumeReturned(x.soid)}>
              {tr('{0}: энэ илгээлтийг засаж дахин илгээх', x.day)}
            </button>
          ))}
        </p>
      )}
      {!locked && returned && (
        <p className={st.backNote}>
          {tr('Хяналтаас БУЦААСАН — засвар оруулаад дахин илгээнэ үү.')}
          {/* ⚠️ 2026-10-23 (UX аудит F2): шалтгаан · хянагч · огноо — засах үед ЭНД харагдана */}
          {returnInfo && <span className={st.returnWhy}>{returnLine(returnInfo)}</span>}
        </p>
      )}
    </>
  );
}

/**
 * НААЛДСАН АНХААРУУЛГА (⚠️ 2026-10-23, UX аудит F4 · F3) — «Илгээх» хориглогдсон шалтгаан, засах нүдний жагсаалт.
 *    Хугацаагүй; ✕-ээр хаана (`useNotice.stick`-ийн ⚠️). `role="alert"` — гарч ирэхэд дэлгэц уншигч хэлнэ.
 */
export function StickyNotice({ msg, onClose }: { msg: string | null; onClose: () => void }) {
  if (!msg) return null;
  return (
    <p className={st.lockNote} role="alert">
      <span aria-hidden>{'⚠ '}</span>{msg}
      <button type="button" className={st.resend} onClick={onClose} aria-label={tr('Анхааруулгыг хаах')}>
        {'✕ '}{tr('Хаах')}
      </button>
    </p>
  );
}

/** Хөвөгч мэдэгдэл — «яагаад засагдахгүй» ба «юу амжилттай болов» */
export function NoticeToast({ notice, onClose }: { notice: { kind: NoticeKind; msg: string } | null; onClose: () => void }) {
  return (
    <>
      {/* ⚠️ ГАРЧИГ нь ТӨРЛӨӨС хамаарна. Урьд нь «Энэ нүд засагдахгүй.» гэж
          ХАТУУ бичигддэг байсан тул нийтлэлийн амжилт ба буулгалтын үр дүн
          хүртэл тэр гарчигтай гарч, ажил бүтсэнийг «алдаа» гэж уншуулж байв.
          ⚠️ Тэмдэг нь өнгөнөөс ГАДНА — өнгө ганцаараа мэдээлэл дамжуулахгүй. */}
      {notice && (
        <div
          className={`${st.notice} ${notice.kind === 'ok' ? st.noticeOk : notice.kind === 'warn' ? st.noticeWarn : ''}`}
          role={notice.kind === 'ro' ? 'status' : 'alert'}
          onClick={onClose}
        >
          <b>
            {notice.kind === 'ok' ? '✓ ' : notice.kind === 'warn' ? '⚠ ' : ''}
            {notice.kind === 'ro' ? tr('Энэ нүд засагдахгүй.') : ''}
          </b>
          {' '}{notice.msg}
        </div>
      )}
    </>
  );
}

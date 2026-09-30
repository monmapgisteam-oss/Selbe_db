/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хүснэгтийн дээрх мэдэгдлүүд (илгээлт · тулгагдаагүй нүд · хяналт · буцаалт) ба хөвөгч мэдэгдэл.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { STAGE_LABEL } from "@/lib/hyanaltGroup";
import { t as tr } from "@/lib/i18nCore";
import type { useFlow } from "./useFlow";
import type { NoticeKind } from "./util";
import st from "../sheet.module.css";

type FlowT = ReturnType<typeof useFlow>;

export function FillNotices({
  locked, submitFailed, resend, resending, unmovedWarn, subReadErr, inReview, reviewStage,
  otherDaysInReview, otherDaysReturned, noEdit, busy, resumedOid, resumeReturned, returned,
}: {
  locked: boolean; submitFailed: boolean; resend: () => Promise<void>; resending: boolean;
  unmovedWarn: string[]; subReadErr: string | null; inReview: boolean; reviewStage: FlowT['reviewStage'];
  otherDaysInReview: string[]; otherDaysReturned: FlowT['otherDaysReturned']; noEdit: boolean; busy: boolean;
  resumedOid: number | null; resumeReturned: (soid: number) => Promise<void>; returned: boolean;
}) {
  return (
    <>
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
          <button type="button" className={st.resend} onClick={resend} disabled={resending}>
            {resending ? tr('Илгээж байна…') : tr('Хяналтад илгээх')}
          </button>
        </p>
      )}
      {/* ⚠️ ТУЛГАГДААГҮЙ НҮД — батлах шатанд багц гацахаас ӨМНӨ хэлнэ
          (`unmovedWarn`-ийн ⚠️ тайлбар). */}
      {unmovedWarn.length > 0 && (
        <p className={st.lockNote} role="alert">
          {tr('Илгээсэн зарим нүд шинэ мөрүүдэд тулгагдсангүй — эдгээрийг ДАХИН бөглөж илгээнэ үү, эс бөгөөс газрын дарга батлах үед багц бүхэлдээ гацна: {0}', unmovedWarn.join('; '))}
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
      {/* ⚠️ ХОЁР ӨӨР МЭДЭГДЭЛ (2026-09-07) — ХОЁУЛАА САНУУЛГА, ХОРИГ БИШ:
          · ЭНЭ ӨДРИЙН илгээлт хянагдаж байна → дахин илгээвэл ТЭР мөр
            ШИНЭЧЛЭГДЭНЭ (шинэ тойрог үүсэхгүй), хянагч доор нь солигдсоныг
            мэдэхгүй байж болзошгүй — тиймээс гүйцэтгэгчид ил хэлнэ;
          · ӨӨР ӨДРИЙН илгээлт хянагдаж байна → өнөөдрийнхөд ОГТ саадгүй,
            зөвхөн «хариу хүлээж буй өдрүүд» гэдгийг санууллаа.
          Хуучин «хянагч шийдвэрлэсний дараа дахин илгээж болно» гэсэн текст
          ХАСАГДСАН — тэр нь одоо ХУДАЛ (хүлээх шаардлагагүй). */}
      {!locked && !submitFailed && inReview && (
        <p className={st.lockNote}>
          {tr('Энэ өдрийн илгээлт хяналтад байна — {0}. Дахин илгээвэл ШИНЭ тойрог үүсэхгүй, тэр илгээлт шинэчлэгдэнэ (хянагчийн харж буй агуулга солигдоно).', reviewStage ? STAGE_LABEL[reviewStage] : '')}
        </p>
      )}
      {!locked && otherDaysInReview.length > 0 && (
        <p className={st.lockNote}>
          {tr('Өмнөх өдрийн илгээлт хяналтад байна ({0}) — өнөөдрийн илгээлтэд саад болохгүй, тус тусдаа хянагдана.', otherDaysInReview.join(', '))}
        </p>
      )}
      {/* 2026-09-21 (дахин аудит): өнөөдрийн мөр байхад өмнөх өдрийн буцаалт
          `flow` болдоггүй тул тусад нь мэдэгдэнэ (`otherDaysReturned`). */}
      {!locked && otherDaysReturned.length > 0 && (
        <p className={st.backNote}>
          {tr('Өмнөх өдрийн илгээлт хяналтаас БУЦААГДСАН ({0}) — засвар шаардлагатай.', otherDaysReturned.map((x) => x.day).join(', '))}
          {/* ⚠️ Буцаагдсан илгээлтийг сонгож давхарлана — `resumedOid`-ийн ⚠️ (2026-09-24) */}
          {!noEdit && otherDaysReturned.filter((x) => Number.isInteger(x.soid) && x.soid > 0).map((x) => (
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
        </p>
      )}
    </>
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

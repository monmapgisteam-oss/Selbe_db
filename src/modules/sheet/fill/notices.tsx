import { STAGE_LABEL } from "@/lib/hyanaltGroup";
import { t as tr } from "@/lib/i18nCore";
import { date as fmtDate } from "@/lib/format";
import type { ReturnInfo } from "@/lib/hyanaltStore";
import type { useFlow } from "./useFlow";
import type { NoticeKind } from "./util";
import st from "../sheet.module.css";

type FlowT = ReturnType<typeof useFlow>;

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
  canAct?: boolean;
  reviewLockDays?: string[];
  hyErr?: string | null;
  frameTrunc?: { day: string; rows: number; need: number; shownDay: string } | null;
  returnInfo?: ReturnInfo | null;
}) {
  return (
    <>
      {frameTrunc && (
        <p className={st.lockNote} role="alert">
          {tr('Архивын сүүлийн жааз ({0}) дундаа тасарсан ({1}/{2} мөр) — доорх тоо {3}-ны бүтэн жаазаас. Тасарсан жааз цэвэрлэгдтэл «Илгээх» хаалттай; газрын дарга дахин «Батлах» дарж эсвэл админ цэвэрлэнэ.', frameTrunc.day, frameTrunc.rows, frameTrunc.need, frameTrunc.shownDay)}
        </p>
      )}
      {hyErr && (
        <p className={st.lockNote} role="alert">
          {tr('Хяналтын жагсаалтыг татаж чадсангүй ({0}) — буцаалт ба хянагчийн зөвшөөрсөн (ногоон ✓) нүдний тэмдэглэгээ дутуу байж болзошгүй; идэвхтэй илгээлттэй бол «Илгээх» түр хаалттай. Хуудсыг дахин ачаална уу.', hyErr)}
        </p>
      )}
      {!locked && submitFailed && (
        <p className={st.lockNote}>
          {tr('Илгээлт хадгалагдсан ч хяналтын бүртгэл ҮҮССЭНГҮЙ — хянагч үүнийг харахгүй.')}
          {canAct && (
            <button type="button" className={st.resend} onClick={resend} disabled={resending}>
              {resending ? tr('Илгээж байна…') : tr('Хяналтад илгээх')}
            </button>
          )}
        </p>
      )}
      {unmovedWarn.length > 0 && (
        <p className={st.lockNote} role="alert">
          {tr('Илгээсэн зарим нүдийг хуудсанд буулгаж чадсангүй — мөр нь шинэ мөрүүдэд тулгагдаагүй, эсвэл нэмэлтийн утга нь тоо биш («1,250» · «abc» мэт). Эдгээрийг ДАХИН бөглөж (тоог зөв бичиж) илгээнэ үү, эс бөгөөс газрын дарга батлах үед багц бүхэлдээ гацна: {0}', unmovedWarn.join('; '))}
        </p>
      )}
      {/*
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
          {otherDaysReturned.filter((x) => x.info).map((x) => (
            <span key={`r${x.soid}`} className={st.returnWhy}>{x.day}: {returnLine(x.info)}</span>
          ))}
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
          {returnInfo && <span className={st.returnWhy}>{returnLine(returnInfo)}</span>}
        </p>
      )}
    </>
  );
}

/**
 * НААЛДСАН АНХААРУУЛГА (2026-10-23, UX аудит F4 · F3) — «Илгээх» хориглогдсон шалтгаан, засах нүдний жагсаалт.
 *    Хугацаагүй; ✕-ээр хаана (`useNotice.stick`). `role="alert"` — гарч ирэхэд дэлгэц уншигч хэлнэ.
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

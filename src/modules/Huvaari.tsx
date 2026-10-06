'use client';

/**
 * ХУВААРЬ — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог ТӨЛӨВЛӨХ хэсэг.
 *
 * ⚠️ ЯАГААД ТУСДАА ХАРАГДАЦ (2026-08-28, хэрэглэгчийн шийдвэр): бөглөх хуудас
 * нь 1,400 мөр × 60 багана. Тэнд нэг ажлыг 12–22 блокт хуваарилахын тулд
 * 24–44 удаа календар нээж дарна. Амьд өгөгдөл үүнийг баталсан — 10 багцын
 * 6-д хуваарийн хамралт 6%-иас доогуур байв.
 *
 * ⚠️ НЭГ БҮТЭН ХҮСНЭГТ (2026-09-01, хэрэглэгчийн заавар). Урьд нь дээд талд
 * ЖАГСААЛТ, доод талд тусдаа ХУАНЛИ байсан: дээрээс бүлгээ сонгоод доор нь
 * төлөвлөнө. Хоёр тусдаа хэсэг байсан тул сонгосон мөр доод хуанлиас олдохгүй,
 * харц дээш доош үсэрдэг байв. Одоо ХОЁУЛАА НЭГ ХҮСНЭГТ: зүүн талд ажлын мод,
 * мөр БҮРИЙН АРД өөрийнх нь хуваарийн зурвас. Мөр нэгээс нэг эгнэнэ.
 *
 * ⚠️ ХОЁР ЗАМААР ТОХИРУУЛНА:
 *   1. ЗУРВАС ЧИРЭХ — хурдан, харьцангуй (мужийг нүдээр тааруулна).
 *   2. POPUP ХУАНЛИ — ажлын нэр дээр дарахад нээгдэнэ; огноог ТООГООР
 *      нарийн оруулна, бүх блокт нэг дор тараана. Чирэлт нь 1 пиксель = 1
 *      хоног тул яг тодорхой огноо тавихад тохиромжгүй.
 *
 * ⚠️ ХАДГАЛАЛТ нь БАЙГАА хуудсанд буцаж бичигдэнэ (`applyUpdates`) — шинэ
 * үйлчилгээ үүсгэхгүй тул төлөвлөгөөт хувь, график, тайлан бүгд өөрчлөлтгүй.
 * АРХИВТ ШИНЭ АГШИН ҮҮСГЭХГҮЙ: хуваарь нь хэмжилт биш, төлөвлөгөө.
 */

import { type PointerEvent as PEvt, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Empty, Loading, Data, friendlyError, userError } from '@/components/ui';
import { useAuth } from '@/components/AuthGate';
import { hasPlanRole, huvaariScope, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { ensureKomissRow, findKomissRow } from '@/lib/ulsiinKomiss';
import { roleForUser } from '@/lib/services';
import { dayKey, num } from '@/lib/format';
import {
  loadSchema, pkgFloors, PKG_GROUPS, PKGS, type Pkg, type Schema,
} from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { insertAdds, type NewRow } from '@/modules/sheet/sheetFrame';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { ajilScope, subscribeAjilAcl } from '@/lib/ajilAcl';
import {
  DAY, endOf, spanDays, statusOf,
  type PlanRow, type Span, type Status,
} from '@/lib/plan';
import {
  codeIndex, downstreamCodes, effSpan, formatDeps, hierRelated, parseDeps,
  propagate, reaches, requiredStart, residualDeps, rollUpGroups, sameDep,
  type Dep,
} from '@/lib/deps';
import {
  balanced, loadPkgPlan, applyPlanEdits, keepMonths, keepRes,
  obyemResFields, type MonthRes, type PkgPlan, type PkgRes,
} from '@/lib/huvaariObyem';
import {
  approveGuard, claimPlan, decidePlan, loadHistory, loadPayload, loadPending, loadSubmissionHead, planTableState, PLAN_STATUS,
  clearPlanPartial, markPlanPartial, releasePlanClaim, setPlanNavBusy, submitPlan, withdrawPlan,
  type PlanPayload, type PlanSubmission,
} from '@/lib/huvaariBatlah';
import { setNavDirty } from '@/lib/navGuard';
import { hdKey } from '@/lib/huvaariDraft';
import h from './huvaari.module.css';
/* ⚠️ 2026-09-30: 8.2k мөрийн нэг файлыг `src/modules/huvaari/`-д хуваав — туслах ·
   төрөл · дэд бүрэлдэхүүн · цэвэр функц · тусдаа hook. Логик · ⚠️ тайлбар бүр
   тэндээ ХЭВЭЭР; энэ файл нь төлөв · урсгал · зурагдалтын ЭХ хэвээр. */
import {
  PL_ROW, type ADraft, type Draft, type Drag, type HuvaariReview, type PlanKind, type ResDraft, type Zoom,
} from './huvaari/types';
import {
  aggExtra, dayToMs, groupSplits, hasDatedLeaf, inScope, obKey, obyemOutsideSpan, remapOids, rowSpan, sameMonths, sameRes, sameSpan, short, stText, toPlanRows,
  unbalancedBlocks, unbalancedObyem,
} from './huvaari/util';
import { backSeenGet, backSeenSet, EMPTY_ADDS, EMPTY_FORM, writeAdds } from './huvaari/adds';
import { useLatest } from './huvaari/useLatest';
import { actUnion, allBlockRows, blockSpan, plainRows, unionSpans, type DispRow } from './huvaari/allBlocks';
import { useCalendar } from './huvaari/useCalendar';
import { lazyCache } from '@/lib/lazyCache';
import { useSideExtra } from './huvaari/useSideExtra';
import { downloadHuvaariPdf, HV_PDF_DEFAULT, type HvPdfOpts, type HvPdfRow } from '@/lib/huvaariPdf';
import { useDragPlan } from './huvaari/useDragPlan';
import { useSharedDraft } from './huvaari/useSharedDraft';
import { useAjil } from './huvaari/useAjil';
import {
  backMarkMapOf, buildPayloadOf, conflictMsg, partialMsg, payloadToDrafts, reviewOidsOf, unknownMsg,
} from './huvaari/payload';
import { HAM_MAX, prepareSave } from './huvaari/savePrep';
import { FlowBox } from './huvaari/FlowBox';
import { AddBox, BlockRow, TaskRow } from './huvaari/TaskRow';
import { PlanModal } from './huvaari/PlanModal';
import { LinkModal } from './huvaari/LinkModal';

export type { HuvaariReview } from './huvaari/types';

/**
 * ⚠️ ӨНГӨ нь ТӨЛӨВЛӨГӨӨ биш ГҮЙЦЭТГЭЛийг илэрхийлнэ: дууссан ногоон, явж
 * буй цэнхэр, хоцорсон улаан, эхлээгүй саарал, хэмжигдээгүй нь ЦАЙВАР
 * ЗУРААСТАЙ — «мэдэхгүй»-г «тэг»-ээс ялгана.
 */
const ST_CLASS: Record<Status, string> = {
  done: h.tlDone, run: h.tlRun, todo: h.tlTodo, late: h.tlLate, none: h.tlNone,
};

export function Huvaari({
  jump, onJumpDone, review,
}: {
  /** Батлагчийн хяналтын горим — байвал засвар хаалттай, бүтэн дэлгэц */
  review?: HuvaariReview;
  /**
   * «ХУВААРЬ БАТЛАХ» ДАРААЛАЛААС ШИЛЖИЖ ИРСЭН БАТЛАХ ХҮСЭЛТ (2026-09-16).
   *
   * ⚠️ Дараалал нь эх өгөгдөлд БИЧИХГҮЙ (`HuvaariBatlah.tsx`-ийн толгой):
   *    батлах гинж (`save` → `applyUpdates` → `decidePlan`) ЗӨВХӨН энд
   *    байдаг тул товч дарахад тэр багцаар энэ хуудас нээгдэж, шийдвэрлэх
   *    цонх өөрөө гарна.
   * ⚠️ `Portal`-ийн САНАХ ОЙН төлөв — URL ч, `sessionStorage` ч БИШ: тэр
   *    хоёр нь F5-ыг давж, шийдвэрлэгдсэн саналын цонхыг дахин нээх байлаа.
   */
  jump?: { pkgKey: string; oid: number } | null;
  /** Хүсэлтийг НЭГ л удаа хэрэглэсний дараа цэвэрлэнэ */
  onJumpDone?: () => void;
} = {}) {
  const { user, status } = useAuth();
  /* ⚠️ Хуваарийн хуваарилалт ӨӨРИЙН хадгалалттай — түүнд захиалахгүй бол
     админы өөрчлөлт энэ хуудсанд хүрэхгүй. */
  const [hvN, setHvN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setHvN((x) => x + 1)), []);
  const [pkg, setPkg] = useState<Pkg>(
    () => (review ? PKGS.find((p) => p.key === review.pkgKey) : undefined) ?? PKGS[0],
  );
  /* ⚠️ ОДООГИЙН багц (2026-09-21): батлах гинжний сүүлийн алхам ХУУЧИН
     closure-ийн `refreshFlow`-ыг дууддаг тул багц солигдсоны ДАРАА ч дугаар
     нь хамгийн сүүлийнх болж, өмнөх багцын pending шинэ багцад наалддаг байв.
     Дугаараас гадна түлхүүрийг ч тулгана. (2026-09-30: `useLatest`, эрт зарлав —
     хуваалцсан ноорог · нэмэлт ажлын hook-ууд ч уншина.) */
  const pkgKeyRef = useLatest(pkg.key);
  /**
   * БҮХ БАГЦ ХАРАГДАНА — ХАРАХ нь ЗАСАХААС ТУСДАА (2026-09-09).
   *
   * ⚠️ ХАРАГДАЦЫН ЭРХ (`views`) нь «юуг ХАРАХ», ACL хуваарилалт нь «юуг
   *    ЗАСАХ» гэсэн ХОЁР ӨӨР асуулт. Порталын бусад бүх модуль (Газар ·
   *    Санхүү · Дэд бүтэц · Зөвшөөрөл) яг ийм: `hasCap` нь ЗӨВХӨН товч
   *    идэвхжүүлэхэд хэрэглэгддэг, өгөгдөл нь бүгд харагдана.
   *
   * ⚠️ УРЬД НЬ багцын сонгогчийг хуваарилалтаар ШҮҮДЭГ байв. 2026-09-07-нд
   *    би `guitsetgelAcl.bagtsScope` → `huvaariScope` болгож зассан — тэр нь
   *    зөв (урсгалын томилгоо хуваарийн эрх өгөх ёсгүй) ГЭВЧ хажуугийн үр
   *    дагаврыг анзаараагүй: хуучин `bagtsScope` нь томилогдоогүй хүнд `null`
   *    (=бүх багц) буцаадаг байсан бол `huvaariScope` нь fail-closed `[]`.
   *    Үр дүнд хуваарилагдаагүй хүнд сонгогч ХООСОН болж, доорх «зөвхөн
   *    харна» гэсэн баннер ХУДАЛ амлалт болов — харах зүйл үлдээгүй.
   *
   * ⚠️ Хүрээ нь `canEdit`/`canApprove` дээр ХЭВЭЭР үйлчилнэ (доор) — өөрийн
   *    багцаас гадуур зөвхөн УНШИНА. Аюулгүй байдал сулраагүй: бичих зам
   *    бүр (`onDown` · `applyModal` · `save` · `decidePlan`) тэдгээрээр
   *    хаагдсан хэвээр.
   *
   * ⚠️ 2026-09-15 (хэрэглэгчийн шууд шаардлага): ЭНЭ ШИЙДВЭР ХУМИГДАВ.
   *    «Багц хуваарилсан аккаунт өөрийн багцаас БУСДЫГ харж байна» — тэр нь
   *    буруу. Дээрх 2026-09-09-ний засвар нь `huvaariScope` fail-closed
   *    болсноос үүдсэн ХАЖУУГИЙН үр дагаврыг (хуваарилагдаагүй хүнд сонгогч
   *    хоосон болох) нөхөх түр шийдэл байсан бөгөөд хэт өргөн болсон байв.
   *
   *    ОДООГИЙН ДҮРЭМ:
   *      · хуваарилалт БАЙХГҮЙ (`[]`, аль ч үүрэгт)  → БҮХ багц (харах эрх
   *        нь `views`-ээр аль хэдийн шийдэгдсэн; сонгогч хоосон болохгүй)
   *      · хуваарилалт БАЙГАА                        → ЗӨВХӨН өөрийн багц
   *      · `null` (хязгааргүй)                       → БҮХ багц
   *
   *    Хоёр үүргийн НЭГДЭЛ: зохиогч Багц 3-т, батлагч Багц 5-д томилогдсон
   *    хүн хоёуланг нь харна — эс бөгөөс батлах ажлаа хийж чадахгүй.
   */
  const groupOpts = useMemo(() => {
    if (status === 'off') return PKG_GROUPS;
    const a = huvaariScope(user?.username, 'author');
    const b = huvaariScope(user?.username, 'approver');
    /* ⚠️ `null` нь ХЯЗГААРГҮЙ — аль нэг үүрэг нь хязгааргүй бол бүгд */
    if (a == null || b == null) return PKG_GROUPS;
    const mine = new Set([...a, ...b]);
    /* ⚠️ Хоёр үүрэгт ч томилогдоогүй бол ХУМИХГҮЙ (дээрх ⚠️) */
    if (mine.size === 0) return PKG_GROUPS;
    const list = PKG_GROUPS.filter((g) => mine.has(g));
    /* ⚠️ Томилгоо нь одоо байхгүй багцыг заасан (нэр солигдсон) бол сонгогч
       хоосорно — тэр үед бүгдийг үзүүлнэ, эс бөгөөс хуудас ашиглагдахгүй. */
    return list.length ? list : PKG_GROUPS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, hvN]);
  /**
   * ЗАСАХ ЭРХ — тусад нь олгодог (`caps`) + багцын хүрээ.
   * ⚠️ Нэг огноо солиход БҮХ багцын төлөвлөгөөт хувь, тайлан, хоцрогдлын
   *    дохио дахин бодогдоно. Бөглөх эрхэд дагалдуулж болохгүй: бөглөгч
   *    өөрийн хоцрогдлыг арилгахын тулд хуваарийг хойш чирэх боломжтой болно.
   */
  /**
   * ⚠️ `pending` нь ЭНД ОРОХГҮЙ — түгжээ нь `canEdit`-д БИШ (доорх `locked`).
   *    Учир нь БАТЛАХ явцад агуулгыг ноорогт буулгаад `save`-ээр бичдэг тул
   *    тэр агшинд түгжээ асуулаа бол батлагдсан хуваарь өөрөө бичигдэхгүй.
   */
  /* ⚠️ ХЯНАЛТЫН ГОРИМД (`review`) ЗАСВАР ХААЛТТАЙ — батлагч саналыг ХАРНА,
     өөрчлөхгүй. `save()` нь `canEdit`-ийг шалгадаггүй тул батлах гинж хэвээр
     ажиллана (агуулга ноорогт буугаад бичигдэнэ). */
  const canEdit = useMemo(
    () => !review && (status === 'off' || inScope(huvaariScope(user?.username, 'author'), pkg.group)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group, review],
  );

  /**
   * БАТЛАХ ЭРХ — `plan`-аас ТУСДАА (2026-09-07).
   * ⚠️ Зохиогч өөрийгөө батлахаас хамгаалах ганц шалгуур нь UI БИШ,
   *    `decidePlan` дотор — хоёр эрхийг нэг хүнд олговол товч идэвхтэй болно.
   */
  const canApprove = useMemo(
    () => status === 'off' || inScope(huvaariScope(user?.username, 'approver'), pkg.group),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group],
  );

  /**
   * МӨР НЭМЭХ ЭРХ (2026-09-24, FillNew-ээс шилжсэн) — `addRow` эрх + нэмэлт
   * ажлын ЗАСВАРЛАГЧИЙН хүрээ (`ajilAcl`, `null` = хязгааргүй).
   * ⚠️ Хуваарийн `canEdit`-ээс ТУСДАА: огноо тавих ба гэрээнд ажил нэмэх нь
   *    өөр өөр хариуцлага. Админ (`super`) ч `addRow` эрхээ панелаас ил асаана
   *    (FillNew-ийн 2026-09 дүрэм) — хүрээ л түүнд үл хамаарна.
   */
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const [ajN, setAjN] = useState(0);
  useEffect(() => subscribeAjilAcl(() => setAjN((x) => x + 1)), []);
  const canAddRow = useMemo(() => {
    if (review) return false;
    if (!hasCap(user?.username, 'addRow')) return false;
    if (status === 'off' || roleForUser(user?.username) === 'super') return true;
    const sc0 = ajilScope(user?.username, 'editor');
    return sc0 === null || sc0.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, capN, ajN, pkg.group, review]);

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — байвал хуваарь ТҮГЖИГДЭНЭ.
   * ⚠️ Хоёр санал зэрэг хүлээвэл батлагч алийг нь батлахаа мэдэхгүй, мөн
   *    хоёулаа батлагдвал сүүлийнх нь өмнөхийг чимээгүй дарна.
   */
  const [pending, setPending] = useState<PlanSubmission | null>(null);
  /** Батлах хүснэгт бэлэн эсэх — үгүй бол шалтгааныг ИЛ хэлнэ, чимээгүй нуухгүй */
  const [flowReady, setFlowReady] = useState<boolean | null>(null);
  /**
   * БЭЛЭН БИШ БОЛ ЯАГААД — баннерт ЯГ энэ шалтгааныг бичнэ (2026-09-11).
   * ⚠️ Урьд нь гурван огт өөр шалтгаан нэг мессеж болж нийлдэг байсан тул
   *    админ юу засахаа мэдэхгүй байв.
   */
  const [flowWhy, setFlowWhy] = useState<string>('');
  /**
   * СҮҮЛИЙН ШИЙДВЭР — хүлээгдэж буй илгээлт байхгүй үед харуулна.
   *
   * ⚠️ БУЦААСАН ШАЛТГААНЫГ гүйцэтгэгчид ХҮРГЭХ цорын ганц зам. Үүнгүй бол
   *    буцаалт нь чимээгүй алга болж, гүйцэтгэгч юуг засахаа мэдэхгүй хэвээр
   *    дахин ижил хуваарь илгээнэ — «шалтгаан заавал» гэсэн дүрэм утгагүй
   *    болно (2026-09-07-ны шалгалтаар илэрсэн).
   */
  const [lastDecision, setLastDecision] = useState<PlanSubmission | null>(null);
  /**
   * «Улсын комисс» ШИНЭ ЖААЗ бичигдсэний дараа хуваалцсан ноорогийг (hd) ШИНЭ oid руу
   * зөөх зураглал (`remapOids`, хадгалахтай ижил дүрэм) — сэргээх эффект нэг удаа
   * хэрэглээд тэглэнэ. `pkg` — өөр багцад хэрэглэхгүй. (2026-09-25 аудит)
   * ⚠️ 2026-09-30: ЭНД (эрт) зарлана — доорх `[pkg]` эффект бичдэг, `useSharedDraft` уншина.
   */
  const hdRemapRef = useRef<{ pkg: string; map: Map<number, number> } | null>(null);
  /**
   * БАТЛАХ УРСГАЛЫН АЛХАМЫН ТЭМДЭГ — `save` дуудагдсан уу (батлах эффект доор).
   * ⚠️ 2026-09-30: эффектүүдээс ӨМНӨ зарлана (react-hooks/immutability: хожим зарлагдсан
   *    ref-ийг эффектэд бичихийг хориглодог); утга · дүрэм батлах эффектийн ⚠️-д.
   */
  const savedRef = useRef(false);
  /**
   * ХАГАС БИЧИГДСЭН БАТЛАЛТ — `oid` (2026-10-01).
   * ⚠️ Батлах `save` нь эхлээд огноог (`applyUpdates`), ДАРАА нь сарын обьёмыг
   *    (`applyPlanEdits`) бичдэг — хоёр тусдаа үйлчилгээ, нийтлэг транзакц алга.
   *    Хоёр дахь нь унахад урьд нь түгжээ ТАЙЛАГДАЖ, санал `pending` хэвээр үлддэг
   *    тул: зохиогч татах, эсвэл батлагч БУЦААХ боломжтой болж, татагдсан/буцаагдсан
   *    саналын огноо эх хуудсанд үлддэг байв (эх хуваарь батлагдалгүй хөдөлсөн).
   *    Одоо: түгжээ ҮЛДЭНЭ (`CLAIM_TTL` хүртэл татах/өөр батлагч хаалттай), энэ
   *    сешнд буцаах хаагдана, «Батлах»-ыг дахин дарахад зөвхөн үлдсэн хэсэг
   *    бичигдэнэ (огноо серверт таарсан тул диффд орохгүй).
   */
  const partialRef = useRef<number | null>(null);
  /**
   * ОЛОН БЛОК — ЕРӨНХИЙ СОНГОЛТ (2026-09-29, хэрэглэгч: «өмнө нь нэг ажил дээр блок сонгож
   * төлөвлөж болдог байсан бол төлөвлөгөөг бүхэлд нь олон блок сонгож төлөвлөх боломжтой
   * болгох; нэг ажил олон блок сонгох хэвээр үлдэнэ»).
   *
   * ⚠️ Идэвхтэй блок (`blk`) ҮРГЭЛЖ сонгогдсон — энэ Set нь НЭМЭЛТ блокууд.
   * ⚠️ ХЭРЭГЖИЛТ: ажил бүрийн цонх (`PlanModal`) эдгээр блокийг УРЬДЧИЛАН сонгосон
   *    нээгдэнэ — чирэлт/товшилтын дараа «Тавих» дарахад огноо · сарын обьём · нөөц
   *    сонгосон бүх блокт ИЖИЛ тавигдана (`applyModal`-ийн `blks`, 2026-09-24-ний
   *    шалгагдсан зам). Чирэлт өөрөө идэвхтэй блокт л зурагдана: цуцлах (`undoRef`),
   *    гинж, сарын тайралт бүгд нэг блокоор бичигдсэн — олон блокт шууд бичвэл цуцлалт
   *    бусад блокийг сэргээхгүй.
   * ⚠️ Багц · төрөл солигдоход цэвэрлэгдэнэ (блокийн жагсаалт өөр).
   */
  const [gBlks, setGBlks] = useState<Set<number>>(() => new Set());
  /** Илгээх/шийдвэрлэх цонх */
  /* `reject` — хяналтын горимын буцаах цонх (2026-09-25) */
  const [flowBox, setFlowBox] = useState<'send' | 'decide' | 'reject' | null>(null);
  /**
   * Цонхны ТАЙЛБАР/ШАЛТГААНЫ текст — ЭЦЭГТ (2026-09-23). ⚠️ `FlowBox` дотор
   *    байсан тул ард нь дарж/Esc-ээр хаахад бичсэн шалтгаан устдаг байв.
   *    Зөвхөн илгээлт/шийдвэр АМЖИЛТТАЙ болоход л цэвэрлэнэ.
   */
  const [flowTxt, setFlowTxt] = useState('');
  /**
   * БАТЛАХ ЯВЦАД — батлагдаж буй илгээлтийн `oid`.
   * ⚠️ `save` нь ноорогийг React төлөвөөс уншдаг тул агуулгыг буулгасны ДАРАА,
   *    дараагийн зурагдалтад бичилтийг гүйцэтгэнэ (`useEffect` доор).
   */
  const [approving, setApproving] = useState<number | null>(null);
  /**
   * УРЬДЧИЛАН ХАРАХ — илгээгдсэн хуваарийг хуанли дээр НООРОГ болгон буулгав уу.
   *
   * ⚠️ Үүнгүй бол батлагч «14 мөр» гэсэн тоо л хараад ХАРААГҮЙ зүйлээ батлана.
   *    Санал нь ноорог болж буусан үед хуанли дээр өөрчлөлт нь ЯГ адилхан
   *    (`h.rowDirty`) тодорно — батлагч юуг зөвшөөрч буйгаа нүдээр харна.
   *
   * ⚠️ Урьдчилан харах нь ЭХ ХУУДСАНД ЮУ Ч БИЧИХГҮЙ: ноорог нь зөвхөн санах
   *    ойд. Батлахгүйгээр хуудсаа сэргээвэл ул мөргүй арилна.
   */
  const [previewing, setPreviewing] = useState(false);

  /**
   * «Улсын комисс» автомат нэмэлтийн хаалга — ачаалалтын эффект ref-ээр уншина (`canEdit`-ийн ⚠️).
   * ⚠️ 2026-09-25 аудит: ИЛГЭЭЛТ ХҮЛЭЭГДЭЖ (`pending`) · батлагдаж · урьдчилан харагдаж
   *    байхад БИЧИХГҮЙ — шинэ жааз нь батлалтын жаазыг булж, батлалт `sameFrame`-ээр
   *    унана. Багц солиход `pending` асинхрон ирдэг тул энэ нь зөвхөн МЭДЭГДЭЖ БУЙ
   *    төлөвийн хаалт; сервер талын `sameFrame`/MAX OID шалгалт үлдсэнийг барина.
   */
  /* ⚠️ 2026-09-30: `useLatest` — commit-ийн дараа, эффектээс өмнө бичигдэнэ; уншигч нь `[pkg]` эффект тул утга ижил */
  const komissGateRef = useLatest(() => canEdit && status !== 'off' && kind === 'plan' && pending == null && approving == null && !previewing);
  /** `previewing`-ийн одоогийн утга — async урсгалд уншихад (2026-09-25) */
  const previewingRef = useRef(previewing);
  useEffect(() => { previewingRef.current = previewing; }, [previewing]);
  /**
   * ЗЭРЭГЦЭЭ ӨӨРЧЛӨЛТӨӨР урьдчилан харалт УНАСАН илгээлтийн `oid` (2026-09-25 аудит #1).
   * ⚠️ Тэр үед `previewing` худал хэвээр тул хяналтын «Буцаах» ч хаалттай болж
   *    илгээлт мөнхөд гацдаг байв — ийм илгээлтийг БУЦААХ ёстой (`conflictMsg`).
   */
  const [previewBad, setPreviewBad] = useState<number | null>(null);
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРСӨН мөр (хяналтын горим) — `Guitsetgel.okKeys`-ийн загвар.
   * ⚠️ Бүгд ногоон болтол «Батлах» ХААЛТТАЙ (гүйцэтгэлийн дүрэм); буцаахад
   *    энэ жагсаалт хадгалагдаж гүйцэтгэгчид улаан/ногоон болж харагдана.
   */
  const [okRows, setOkRows] = useState<Set<number>>(new Set());
  /**
   * ГҮЙЦЭТГЭГЧИЙН ТАЛ — буцаагдсан саналыг ноорогт буулгасны дараах тэмдэглэгээ.
   * `oid` = тэр илгээлт; `ok` = батлагчийн зөвшөөрсөн мөрүүд. Бусад өөрчлөгдсөн
   * мөр улаан (засах ёстой). Дахин илгээх, багц/төрөл солиход арилна.
   */
  /* ⚠️ `pay` — БУЦААГДСАН САНАЛЫН агуулга (2026-09-25 аудит #3): тэмдгийг зөвхөн
     саналд байсан мөрд, утга нь саналтайгаа ИЖИЛ хэвээр байхад л тавина.
     Гүйцэтгэгч засмагц (эсвэл шинэ мөр хөндмөгц) мөр саармаг болно. */
  const [backMarks, setBackMarks] = useState<{ oid: number; ok: Set<number>; pay: PlanPayload } | null>(null);

  /**
   * ЗАСВАР ТҮГЖИГДСЭН ҮҮ — хүлээгдэж буй илгээлт байхад ГАРААР засахгүй.
   *
   * ⚠️ ЯАГААД ЗААВАЛ ТҮГЖИХ ЁСТОЙ ВЭ: түгжихгүй бол гүйцэтгэгч чирж засаад
   *    ноорог хуримтлуулна, гэтэл «Батлуулах» товч нь `!pending` нөхцөлтэй
   *    тул ХАРАГДАХГҮЙ — хийсэн ажил нь ГАРАХ ЗАМГҮЙ үлдэж, багц солиход
   *    чимээгүй устана. Мөн батлагдсан агшинд серверийн хуваарь солигдох тул
   *    тэр ноорог хуучин мөрийн дугаарт наалдана.
   *
   * ⚠️ БАТЛАХ ЯВЦАД (`approving`) түгжээг ТАВИНА — тэр үед агуулгыг ноорогт
   *    буулгаж `save`-ээр бичих ёстой.
   */
  const locked = pending != null && approving == null;

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ нь ӨӨРИЙНХ ҮҮ (2026-09-08).
   * ⚠️ Зөвхөн ХАРАГДАЦЫН тэмдэглэгээ — жинхэнэ хаалт нь `decide`-д (бичихээс
   *    өмнө) ба `decidePlan`-д. Гурвуулаа НЭГ дүрэм: нэр нь жижиг үсгээр,
   *    цэвэрлэгдсэн байдлаар харьцуулагдана.
   */
  const isOwnSubmission = useMemo(() => {
    const me = (user?.username ?? '').trim().toLowerCase();
    return !!pending && !!me && me === pending.author.trim().toLowerCase();
  }, [pending, user]);

  const [sc, setSc] = useState<Schema | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);

  /* ── НЭМЭЛТ АЖИЛ (2026-09-24; `huvaari/adds.ts`-ийн `tmpOid`-ийн ⚠️) ── */
  /**
   * Нэмсэн мөр — БАГЦЫН ТҮЛХҮҮРТЭЙ ХАМТ хадгална.
   * ⚠️ ЯАГААД: `[adds, pkg.key]`-д хадгалах эффект нь багц солигдох агшинд
   *    ӨМНӨХ багцын мөрийг ШИНЭ багцын LS түлхүүрт бичих байсан (эффектүүд нэг
   *    commit-д, төлөв хоцорно). Түлхүүр нь мөртэй хамт явбал тэр зөрүү үүсэхгүй.
   * ⚠️ 2026-09-30: жагсаалт нь ЭЦЭГТ (`rowsAll`-д хэрэгтэй), урсгал нь `useAjil`-д.
   */
  const [addsSt, setAddsSt] = useState<{ key: string; list: NewRow[] }>({ key: '', list: [] });
  const adds = addsSt.key === pkg.key ? addsSt.list : EMPTY_ADDS;
  const setAdds = useCallback((fn: (prev: NewRow[]) => NewRow[]) => {
    setAddsSt((st) => ({ key: pkg.key, list: fn(st.key === pkg.key ? st.list : []) }));
  }, [pkg.key, setAddsSt]);
  useEffect(() => { if (addsSt.key === pkg.key) writeAdds(pkg.key, addsSt.list); }, [addsSt, pkg.key]);
  /** `adds`-ын одоогийн утга — async урсгалд синхрон уншихад (LS-д шууд бичих) */
  const addsStRef = useRef(addsSt);
  useEffect(() => { addsStRef.current = addsSt; }, [addsSt]);
  /**
   * БҮТЭН ДЭЛГЭЦ — ЗӨВХӨН хуваарийн хүснэгт (2026-09-17, хэрэглэгч: «Гүйцэтгэл
   * бөглөх»-ийнхтэй адил). `FillNew`-ийн `wide`-тай ИЖИЛ загвар: хөтчийн
   * `requestFullscreen` БИШ, `position: fixed` давхарга — дотоод цонх (popup
   * хуанли, батлах асуулт) хэвээр ажиллана. Сешн хооронд санагдана.
   */
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-wide') === '1'; } catch { return false; }
  });
  /*
   * ОГНОО · НӨӨЦИЙН БАГАНЫГ ХУРААХ (2026-09-23, хэрэглэгч: «энэ хэсгийг хурааж
   * нээдэг байж болох уу»). Хураахад «Гэрээ эхлэх … Техник» 10 багана нуугдаж,
   * зүүн самбар нарийсч хуанлид зай өгнө; код · нэр · хамаарал үлдэнэ.
   * ⚠️ Анхдагч нь НЭЭЛТТЭЙ — хэрэглэгч багануудыг шаардаж нэмүүлсэн тул
   *    анх удаа нээхэд нуугдсан байж болохгүй. Сешн хооронд санагдана.
   */
  const [cols, setCols] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-cols') !== '0'; } catch { return true; }
  });
  /** Зүүн жагсаалтыг чирж өргөсгөх нэмэлт пиксел (2026-10-04, `useSideExtra`) */
  const { elRef: sideRef, style: sideStyle, grip: sideGrip } = useSideExtra();
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-cols', cols ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [cols]);
  /*
   * «БҮХ БЛОК» ХАРАГДАЦ (2026-10-04, хэрэглэгч: «бүх блокийн хуваарийг зэрэг харах
   * боломжтой болго»). Ажил бүрийн доор хуваарьтай блок бүрийн дэд мөр (`allBlocks.ts`).
   * ⚠️ ЗӨВХӨН ХАРАХ: чирэлт · холбоос · popup · мөр нэмэх хаалттай, сум нуугдана;
   *    ноорог/хадгалалт/батлалтад хүрэхгүй. Засах нь дэд мөр дээр дарж тэр блок руу.
   * ⚠️ Бодит асаалт нь `allOn` (доор) — синтетик/ганц блоктой багц ба хяналтын
   *    горимд хүчингүй.
   * ⚠️ 2026-10-04 (шүүлт): САНАХГҮЙ — зөвхөн энэ нээлтэд. Урьд нь localStorage-д хадгалагдаж,
   *    дараагийн сешн «зөвхөн харах» горимоор нээгдэн хэрэглэгч яагаад чирж болохгүйг ойлгодоггүй
   *    байв (`selbe-huvaari-cols`-ийн ёсноос санаатай гажив).
   */
  const [allBlk, setAllBlk] = useState(false);
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-wide', wide ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [wide]);
  /* ⚠️ ХЯНАЛТЫН ГОРИМ ҮРГЭЛЖ БҮТЭН ДЭЛГЭЦ (хэрэглэгчийн сонголт) — хэрэглэгчийн
     `wide` тохиргоог ХӨНДӨХГҮЙ (LS-д бичихгүй), зөвхөн зурагдалтад. */
  const isWide = !!review || wide;
  const isReview = !!review;
  const reviewCloseRef = useLatest(review?.onClose);
  /* ⚠️ БАТЛАХ ЯВЦАД Esc ХААХГҮЙ (2026-09-25 аудит): «Хаах» товч `busy`/`approving`
     үед хаалттай ч Esc нь хаадаг байсан — `save()` эх хуудсанд бичиж дуусаад
     `decidePlan` дуудах эффект салгагдсан бүрэлдэхүүнд ажиллахгүй тул хуваарь
     бичигдсэн атлаа илгээлт `pending` хэвээр үлдэнэ. Ref-ээр — эс бөгөөс
     сонсогч `busy` хөдлөх бүрд дахин бүртгэгдэж диалогийнхаас ХОЙНО орно. */
  const escBlockRef = useLatest(busy || approving != null);
  useEffect(() => {
    if (!isWide) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      if (isReview) { if (!escBlockRef.current) reviewCloseRef.current?.(); } else setWide(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [isWide, isReview, escBlockRef, reviewCloseRef]);
  const [err, setErr] = useState('');
  /**
   * ХУВААРЬ АЧААЛАХ АЛДАА — `err`-ээс ТУСДАА (⚠️ 2026-10-01, «хэрэглэгч: бүгдийг зас»).
   * ⚠️ Урьд нь ачаалах алдааг `setErr(e.message)`-ээр түүхийгээр нь («Token Required»)
   *    улаан баннерт тавьж, доор нь «мөр олдсонгүй» гэсэн худал хоосон төлөв гардаг байв.
   *    Одоо `Data`-гийн алдааны блок (ойлгомжтой тайлбар · эвхмэл техникийн мөр ·
   *    «Дахин оролдох») ГАНЦ удаа гарна.
   */
  const [loadErr, setLoadErr] = useState<Error | null>(null);
  /** «Дахин оролдох» — ачаалах эффектийг дахин ажиллуулах тоолуур */
  const [reloadN, setReloadN] = useState(0);
  const [note, setNote] = useState('');
  /** «Улсын комисс» автомат нэмэлтийн мэдэгдэл — `note`-оос ТУСДАА: ноорог сэргээх эффект `note`-ыг дардаг (2026-09-25 аудит) */
  const [komissNote, setKomissNote] = useState('');

  const [draft, setDraft] = useState<Draft>(new Map());
  /**
   * УЯЛДААНЫ НООРОГ: `oid` → «18FS3,…» текст. Огнооны ноорогтой (`draft`)
   * ЗЭРЭГЦЭЭ тусдаа — уялдаа нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   * Хадгалахад хоёулаа нэг `applyUpdates`-д нийлнэ.
   */
  const [ham, setHam] = useState<Map<number, string>>(new Map());
  /**
   * БОДИТ ОГНОО ба НӨӨЦИЙН ноорог (2026-09-23) — `draft`/`ham`-тай ЗЭРЭГЦЭЭ,
   * тусдаа. Хадгалахад бүгд нэг `applyUpdates`-д, батлуулахад нэг payload-д
   * нийлнэ (`actual`/`res`). Popup-аас л засагдана (зүүн багана зөвхөн харуулна).
   */
  const [aDraft, setADraft] = useState<ADraft>(new Map());
  const [resDraft, setResDraft] = useState<ResDraft>(new Map());
  /* ⚠️ Сонгосон мөрийн OID (2026-09-25 аудит) — `PlanRow.i` БИШ: нэмэлт мөр орох/гарах,
     шинэ жааз татагдахад индекс шилжиж өөр мөр тодордог байв. */
  const [sel, setSel] = useState<number | null>(null);

  /* ══════ САРЫН ОБЬЁМ (тусдаа үйлчилгээ, `huvaariObyem.ts`) ══════ */
  /** Хадгалагдсан задаргаа — ажлын код → блок → сар → обьём */
  const [obPlan, setObPlan] = useState<PkgPlan>(new Map());
  /**
   * Задаргааны АЧААЛЛЫН ТӨЛӨВ (2026-09-24) — хуваалцсан ноорогийн суурьт.
   * ⚠️ `loadPkgPlan` нь мөрүүдээс ТУСДАА promise тул `rows` ирсэн атлаа
   *    `obPlan` хоосон агшин бий; тэр үед сарын нүдийг тулгавал бүгд
   *    «хуучирсан» болно. `loading` үед ноорогийн сэргээлт ба дифф зогсоно;
   *    `fail` = задаргаагүй үргэлжилнэ (сарын суурь мэдэгдэхгүй).
   */
  const [obState, setObState] = useState<'loading' | 'ok' | 'fail'>('loading');
  /** `dkey → ObjectID` — бичихэд аль мөрийг шинэчлэхийг мэдэхэд */
  const [obOids, setObOids] = useState<Map<string, number>>(new Map());
  /**
   * ДАВХАРДСАН мөрийн ИЛҮҮДЭЛ OID-ууд (2026-09-08).
   * ⚠️ `dkey`-д сангийн unique индекс АЛГА тул зэрэг хадгалалт ижил
   *    түлхүүртэй хоёр мөр үүсгэж чадна. Апп дотор нь ганц утга харагддаг
   *    учир нүдээр илрэхгүй ч Excel/ArcGIS Pro-д обьём давхар тоологдоно.
   *    Дараагийн бичилтэд `deletes`-т нийлүүлж чимээгүй арилгана.
   */
  const [obDups, setObDups] = useState<number[]>([]);
  /**
   * ХАДГАЛААГҮЙ задаргаа — `${ажлын код}|${блок}` → сар → обьём.
   * ⚠️ Огнооны ноорог (`draft`) ба уялдааны ноорог (`ham`)-той ЗЭРЭГЦЭЭ,
   *    тусдаа: обьём нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   *    Гурвуулаа нэг «Хадгалах»-д нийлнэ.
   */
  const [obDraft, setObDraft] = useState<Map<string, Map<string, number>>>(new Map());
  /**
   * САРЫН НӨӨЦ — хүн хүч · машин механизм (2026-09-24, хэрэглэгч: «сар бүрд
   * обьём · хүн хүч · машин механизм»). `obPlan`/`obDraft`-тай ЗЭРЭГЦЭЭ, тусдаа
   * Map (`${код}|${блок}` → сар → {hun, mashin}) — обьёмын утгын хэлбэр
   * хөндөгдөхгүй (`huvaariObyem.ts`-ийн `MonthRes` тайлбар). Хадгалахад
   * мөрийн `hun_huch`/`mashin_mehanizm` = бүх блок · сарын НИЙЛБЭР.
   */
  const [obRes, setObRes] = useState<PkgRes>(new Map());
  const [obResDraft, setObResDraft] = useState<Map<string, Map<string, MonthRes>>>(new Map());
  /** Сарын хүснэгтэд нөөцийн талбар БАЙНА УУ — `null` = мэдэхгүй (бичихийг оролдоно) */
  const [obResFields, setObResFields] = useState<{ hun: boolean | null; mashin: boolean | null }>({ hun: null, mashin: null });
  useEffect(() => { void obyemResFields().then(setObResFields); }, []);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  /**
   * ХАРАГДАХ ТҮВШИН — «Түвшин 1 2 3 4 5» зурвасын идэвхтэй товч.
   *
   * ⚠️ `Finance`-ийн «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар (хэрэглэгчийн
   *    шаардлага, 2026-09-15): нэг порталд нэг үүрэгтэй хоёр өөр хэлбэр
   *    байх ёсгүй. Тэнд `lvl` нь 1–5, `setLevel` нь эвхэлтийг бөөнөөр тавьдаг.
   *
   * ⚠️ `0` = «холимог»: хэрэглэгч ГАРААР нэг бүлэг эвхсэн бол аль ч товч
   *    тодрохгүй — дэлгэц дээрх байдалтай зөрчилдсөн тодруулга үлдэх ёсгүй
   *    (`Finance.lvOn`-ийн ижил ⚠️).
   *
   * ⚠️ АНХДАГЧ нь ХАМГИЙН ГҮН (бүх мөр дэлгээтэй) — хуваарь нь ажил тус бүрийн
   *    огноог ЗАСАХ хуудас тул хаалттай эхлэх нь ажлыг нэмэгдүүлнэ.
   */
  const [lvl, setLvl] = useState(0);
  /**
   * Popup хуанли нээгдсэн мөрийн OID.
   * ⚠️ 2026-09-25 аудит: урьд нь `PlanRow.i` (индекс) байсан тул 30 с-ийн мөчлөг
   *    батлагдсан нэмэлт мөрийг оруулахад индекс шилжиж, «Тавих» ӨӨР ажилд бичдэг байв.
   */
  const [modal, setModal] = useState<number | null>(null);

  /**
   * ШҮҮЛТҮҮР. `filter` нь түргэн таб, бусад нь сонголт.
   * ⚠️ Тусдаа талбар болгосон шалтгаан: хэрэглэгч «хоцорсон, урт, 2026 онд
   *    эхлэх» гэж ХОСЛУУЛЖ шүүнэ. Нэг радио жагсаалт байсан бол зөвхөн нэгийг.
   */
  const [filter, setFilter] = useState<'all' | 'has' | 'none' | 'partial'>('all');
  const [fYear, setFYear] = useState('all');
  /**
   * БҮЛГЭЭР ШҮҮХ — сонгосон бүлэг ба ДОТОРХ бүх ажлыг л үлдээнэ.
   * ⚠️ Утга нь `PlanRow.i` (эх массивын индекс), `oid` БИШ: ижил нэртэй
   *    бүлэг олон байж болох ба индекс нь модны байрлалыг ч заана.
   * ⚠️ 2026-09-25-нд ЭРГҮҮЛСЭН — утга нь бүлгийн OID. OID ч мөр бүрд давтагдашгүй
   *    (ижил нэртэй бүлгийг ялгана), харин индекс нь нэмэлт мөр бүлгийн эхэнд
   *    орох/хасагдахад шилжиж, багц солиход ч үлдэж ӨӨР салбарыг шүүдэг байв.
   */
  const [fGrp, setFGrp] = useState<'all' | number>('all');

  /* ── Хуанлийн төлөв ── */
  /* ⚠️ АНХДАГЧ нь «сар» (2026-09-02, хэрэглэгч). Хуваарь 2025–2028 оныг
     дамждаг тул «7 хоног» (7px/хоног) дээр нээхэд ~1,035 хоног нь 7,000px
     болж, нэг дэлгэцэнд ердөө 3–4 сар багтана — хүн эхлээд БҮТЭН зургийг
     хармаар байдаг. «сар» (2.6px/хоног) дээр бүхэл төсөл нэг дэлгэцэнд
     ойролцоогоор багтана; нарийвчлах бол товчоор томруулна. */
  /**
   * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» эсвэл «Гэрээ» (2026-09-11).
   *
   * ⚠️ Солиход НООРОГ ЦЭВЭРЛЭГДЭНЭ (доорх эффект): ноорог нь `oid` →
   *    блокийн муж гэсэн хэлбэртэй бөгөөд аль төрлийнх болох нь тэмдэглэгдэх
   *    газаргүй. Цэвэрлэхгүй бол төлөвлөгөөнд зассан огноо гэрээний талбарт
   *    бичигдэнэ — чимээгүй, эргүүлэх аргагүй.
   */
  const [kind, setKind] = useState<PlanKind>(review?.kind ?? 'plan');

  /**
   * ЛАВЛАГАА ХАРАГДАХ ЭСЭХ — нөгөө төрлийн зурвас (2026-09-11, хэрэглэгч:
   * «дангаар нь харах бол гэрээ төлөвлөгөө дээр дарж идэвхжүүлдэг болго»).
   *
   * ⚠️ `kind` нь ЗАСАХ төрөл, энэ нь ХАРАХ асаалт — хоёр өөр зүйл. Засвар,
   *    ноорог, хадгалалт, батлалт бүгд `kind`-ээс л хамаарна; энэ асаалт
   *    юу ч бичдэггүй. Эс бөгөөс нэг ноорогт хоёр төрөл холилдоно.
   * ⚠️ Анхдагчаар УНТРААЛТТАЙ: дангаар нь харах нь үндсэн байдал, зэрэг
   *    харахыг «Зэрэг» товчоор ил асаана.
   */
  const [showRef, setShowRef] = useState(false);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [blk, setBlk] = useState(0);
  /* ⚠️ АНХДАГЧ 0 (2026-09-24): олон блок сонгоход бүгдэд ИЖИЛ огноо тавина —
     хэрэглэгчийн сонголт; >0 бол блок бүр алхмаар хойшилно (хуучин зан). */
  const [takt, setTakt] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  /**
   * ХАМААРЛЫГ ШУГАМААР ХОЛБОХ (2026-09-22, хэрэглэгч: «бар хооронд шугам чирж
   * хамаарал шууд холбоно»). Зурвасын баруун захын бариулаас чирж эхлээд нөгөө
   * АЖЛЫН мөр дээр тавихад тэр мөр энэ ажлаас FS (лаг 0) хамаардаг болно.
   * ⚠️ Шалгуур (дугуй, өвөг/удам, түгжээ) — `applyModal`-д ганц газар; энд
   *    зөвхөн зорилтыг олж дамжуулна. `i` = урд ажлын `plan` индекс, `x/y` =
   *    `.plLanes`-ийн дотоод координат (түр шугамын үзүүр).
   */
  const [link, setLink] = useState<{ i: number; x: number; y: number } | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  /** Холбосны дараах цонх — төрөл (FS/SS) ба хоног асууна (2026-09-22, хэрэглэгч). `si` урд, `ti` хамаарагч. */
  /**
   * ⚠️ `dblks` (2026-09-24 → 2026-10-01) — уялдааны БЛОКУУД: `number[]` = зөвхөн тэдгээр
   *    блок (тус бүрд `@N`), `null` = бүх блок (блокгүй бичиглэл). Чирж холбоход
   *    ИДЭВХТЭЙ блок + «олон блокт зэрэг төлөвлөх» сонголт (`gBlks`) (синтетик ганц
   *    блоктой багцад `null` — `@` гарахгүй); сум дээр дарахад тэр сумны уялдааных.
   * ⚠️ 2026-10-01 (хэрэглэгч: «олон блок дээр зэрэг төлөвлөхөд холбоос олон блок
   *    тавигдахгүй байна»): урьд нь ганц `dblk` (идэвхтэй блок) байсан тул `gBlks`-ийн
   *    огноо олон блокт ордог атлаа уялдаа нь ганц блокт л тавигддаг байв.
   * ⚠️ `collapse` — БҮХ блок сонгогдсон тул блокгүй НЭГ уялдаа бичнэ; тэр кодын
   *    `@N` уялдааг хасна (эс бөгөөс тэр блокт давхар шилжилт, 2026-09-25 аудит).
   */
  /* ⚠️ `so`/`to` — урд · хамаарагч мөрийн OID (2026-09-25 аудит, индекс шилжихээс) */
  const [linkAsk, setLinkAsk] = useState<{ so: number; to: number; dblks: number[] | null; collapse?: true } | null>(null);
  /** Popup/холбох цонх нээлттэй эсэх — async урсгалд (`refreshAjil`, 2026-09-25) */
  const uiOpenRef = useRef(false);
  useEffect(() => { uiOpenRef.current = modal != null || linkAsk != null; }, [modal, linkAsk]);
  /** Эхний «өнөөдөр» рүү гүйлгэлт хийгдсэн үү — `[pkg]` эффект тэглэнэ, `useCalendar` уншина */
  const jumpedRef = useRef(false);

  /*
   * ⚠️ Сонгосон багц хүрээнээс ГАДУУР бол зөвшөөрөгдсөн эхнийх рүү шилжинэ
   *    — эс бөгөөс хэрэглэгч засах эрхгүй хуудас ширтэнэ. Хадгалаагүй
   *    ноорогтой үед хөндөхгүй (`askSwitch`-ийн дүрэм).
   */
  useEffect(() => {
    /* ⚠️ `obDraft` ч ноорог (2026-09-24) — түүнгүйгээр сарын задаргаа л зассан үед асуулгүй солигдож байв */
    /* ⚠️ Хяналтын горимд багц ТОГТМОЛ — дарааллаас сонгосон илгээлтийнх. */
    if (review) return;
    if (groupOpts.includes(pkg.group) || draft.size || ham.size || aDraft.size || resDraft.size || obDraft.size || obResDraft.size || !groupOpts.length) return;
    const first = pkgFloors(groupOpts[0])[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: эрхийн хүрээ (гадаад ACL захиалга) өөрчлөгдөхөд сонгосон багцыг зөвшөөрөгдсөн руу шилжүүлэх — санаатай синк, зурагдалтад дериваци болгох боломжгүй (pkg нь хэрэглэгчийн сонголт)
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: багц солигдоход ArcGIS-ээс дахин ачаалах эффект — ачаалахын өмнө төлөвийг тэглэх нь энэ файлын ⚠️-уудаар бэхлэгдсэн дараалал; дериваци/key-ээр солих нь бүх төлөвийг дахин зохион байгуулах том өөрчлөлт
    setBusy(true); setErr(''); setLoadErr(null); setRows([]); setSc(null);
    setDraft(new Map()); setHam(new Map()); setSel(null); setCollapsed(new Set()); setModal(null);
    /* ⚠️ Бүлгийн шүүлт · холбох цонх ч багцынх (2026-09-25 аудит) */
    setFGrp('all'); setLinkAsk(null);
    setADraft(new Map()); setResDraft(new Map());
    /* ⚠️ Түвшний товчийг ч тэглэнэ — багц бүр ӨӨР гүнтэй тул өмнөх багцын
       сонголт шинэ модонд утгагүй (эвхэлт нь дээр цэвэрлэгдсэн). */
    setLvl(0);
    setObPlan(new Map()); setObOids(new Map()); setObDraft(new Map()); setObDups([]);
    setObRes(new Map()); setObResDraft(new Map());
    setObState('loading');
    /* ⚠️ Урьдчилан харах ба батлах урсгалын төлөв нь БАГЦЫНХ — ноорог
       цэвэрлэгдэхэд эдгээр ч дагаж тэглэгдэхгүй бол өмнөх багцын санал
       харагдсаар байгаа мэт товч, баннер үлдэнэ. */
    setPreviewing(false); setApproving(null); setFlowBox(null); setFlowTxt('');
    setOkRows(new Set()); setBackMarks(null);
    /* ⚠️ Батлах урсгалын АЛХАМЫН тэмдэглэгээг ч тэглэнэ (2026-09-15-ны
       аудит): savedRef нь useRef тул багц/төрөл солиход үлддэг байв. Бичилт
       унаад true үлдсэн бол дараагийн батлалтад save() ОГТ дуудагдалгүй
       шууд decidePlan руу орж, хуваарь эх хуудсанд бичигдэлгүй «батлагдсан»
       болж, гүйцэтгэгчийн санал ул мөргүй алга болно. */
    savedRef.current = false;
    setBlk(0); jumpedRef.current = false; setGBlks(new Set());
    /* Нэмэлт ажил (2026-09-24): маягт хаана, баннер тэглэнэ, локал ноорогийг сэргээнэ — `useAjil`-ийн
       `[pkg.key]` эффект (энэ эффектийн ДАРАА, нэг commit-д). */
    /* ⚠️ Сарын обьёмыг ТУСАД НЬ татна: тэр үйлчилгээ унасан ч хуваарийн
       хуудас нээгдэх ЁСТОЙ. Алдааг `setErr` рүү хийхгүй — улаан баннер нь
       огноо төлөвлөхөд саад болно; задаргаа нь зүгээр л хоосон харагдана. */
    loadPkgPlan(pkg.key)
      .then((r) => { if (alive) { setObPlan(r.plan); setObRes(r.res); setObOids(r.oids); setObDups(r.dups); setObState('ok'); } })
      .catch(() => { if (alive) setObState('fail'); /* задаргаагүйгээр үргэлжилнэ */ });
    /* ⚠️ СИНТЕТИК БЛОК (2026-09-23): блокгүй 8 багцад (5.x · 6.x · 10) мөрийн
       түвшний огноо (`Төлөвлөгөөт_хуваарь__Эхлэх/Дуусах` · `geree_*` · `bodit_*`)
       нэг блок болж орно — хуваарь барилгын багцтай ИЖИЛ ажиллана, доорх
       `save` нь `sc.start[b]`/`sc.gStart[b]`/`sc.aStart[b]` нэрээр бичдэг тул
       мөрийн баганад шууд бичигдэнэ. ЗӨВХӨН ЭНД опт-ин — FillNew/дашбоард/
       нэгтгэл `loadSchema(pkg)`-ээр хоосон блок хэвээр (`Schema.synthetic`). */
    setKomissNote('');
    hdRemapRef.current = null;
    loadSchema(pkg, { synthetic: true })
      .then(async (schema) => {
        let r = await loadRows(pkg, schema);
        if (!alive) return;
        /*
         * «УЛСЫН КОМИСС» АВТОМАТ (2026-09-28, хэрэглэгчийн сонголт): төлөвлөгөөт
         * хуваарийг төлөвлөх эрхтэй хүн нээхэд багцын төгсгөлд тэр мөр байхгүй
         * бол `ensureKomissRow` НЭГ УДАА нэмж (шинэ жааз), дараа нь мөрүүдийг
         * дахин татна. ⚠️ Алдаа нь улаан баннер БИШ — хуваарь нээгдэх ёстой;
         * зөвхөн тэмдэглэл. ⚠️ Эрхийг ref-ээр уншина — эффектийн deps `[pkg]`
         * хэвээр (эрх ирэх бүрд дахин ачаалахгүй; lib түвшинд давхар шалгана).
         *
         * ⚠️ 2026-09-25 аудит: `setRows` ГАНЦ УДАА — ensure-ийн ӨМНӨ биш, ДАРАА.
         *    Урьд нь хуучин мөрүүд эхлээд тавигдаж, хуваалцсан ноорогийн сэргээх
         *    эффект тэдгээр дээр ажиллаад, дараа нь шинэ жааз (`r2`, бүх OID шинэ)
         *    ирэхэд бүх нүд «мөр алга» болж ноорог өнчирдөг байв. Одоо шинэ жааз
         *    бичигдсэн бол хуучин→шинэ oid зураглалыг (`remapOids`, хадгалахтай ижил
         *    дүрэм) `hdRemapRef`-д тавьж, сэргээх эффект нооргийг зөөж хэрэглэнэ.
         *    `busy` бичилт дуустал үлдэнэ — мөр хоосон харагдахаас дээр.
         */
        if (!review && komissGateRef.current() && !findKomissRow(r.rows)) {
          const res = await ensureKomissRow(pkg.key);
          if (!alive) return;
          if (res.ok && res.added) {
            const r2 = await loadRows(pkg, schema);
            if (!alive) return;
            hdRemapRef.current = { pkg: pkg.key, map: remapOids(r.rows, r2.rows) };
            r = r2;
            setKomissNote(tr('«Улсын комисс» ажилбар багцын төгсгөлд нэмэгдлээ.'));
          } else if (!res.ok) {
            console.error('[selbe] улсын комиссын мөр нэмэгдсэнгүй:', res.error);
            setKomissNote(tr('«Улсын комисс» ажилбар нэмэгдсэнгүй: {0}', res.error));
          }
        }
        setSc(schema);
        setRows(r.rows);
      })
      /* ⚠️ 2026-10-01: түүхий мессежийг `err` баннерт БИШ — `loadErr`-д (дээрх ⚠️) */
      .catch((e) => alive && setLoadErr(e instanceof Error ? e : new Error(String(e))))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
    /* ⚠️ `review` санаатай ОРУУЛААГҮЙ — хянах горим солиход мөрийг дахин
       татахгүй; зөвхөн багц солигдоход ачаална. `reloadN` — «Дахин оролдох». */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, reloadN]);

  /**
   * ТӨРӨЛ СОЛИГДОХОД НООРОГ ЦЭВЭРЛЭГДЭНЭ (2026-09-11).
   *
   * ⚠️ ЗААВАЛ: ноорог нь `oid → блокийн муж` хэлбэртэй бөгөөд аль төрлийнх
   *    болохыг тэмдэглэх газаргүй. Цэвэрлэхгүй бол ТӨЛӨВЛӨГӨӨНД зассан
   *    огноо ГЭРЭЭНИЙ талбарт бичигдэнэ — чимээгүй, эргүүлэх аргагүй.
   * ⚠️ Уялдаа (`ham`) ба сарын обьём (`obDraft`) нь ЗӨВХӨН төлөвлөгөөнд
   *    хамаарах тул тэднийг ч цэвэрлэнэ.
   * ⚠️ Солихоос ӨМНӨ ноорог (төрөл · багцын) хуваалцсан мөрөнд бичигдэнэ (`askSwitch`,
   *    2026-10-01) — буцаж ирэхэд сэргэнэ. Энэ эффект нь зөвхөн санах ойн цэвэрлэгээ.
   * ⚠️ БАТЛАХ УРСГАЛЫН төлвийг Ч цэвэрлэнэ (2026-09-11-ний аудитын S1).
   *    Урьд нь `previewing`/`approving`/`pending`/`flowBox` үлддэг байсан тул:
   *    батлагч урьдчилан хараад таб солиход ноорог цэвэрлэгдэн `dirtyN` 0
   *    болж, «бичих зүйлгүй» салаа ажиллан илгээлтийг `approved` болгоно —
   *    гүйцэтгэгчийн санал УЛ МӨРГҮЙ алга болж «батлагдлаа» гэж мэдээлнэ.
   *    Багц солих эффект (`[pkg]`) яг ижил шалтгаанаар эдгээрийг тэглэдэг.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: төрөл (plan/geree) солигдоход ноорог · батлах урсгалын төлөвийг ЦЭВЭРЛЭХ — дээрх ⚠️-ийн дагуу санаатай; ноорог нь төрлөө тэмдэглэдэггүй тул дериваци боломжгүй
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
    /* ⚠️ Бодит огноо · нөөц (2026-09-23) нь `kind`-ээс хамаардаггүй ч ЦЭВЭРЛЭНЭ:
       нэг илгээлт нэг `kind` авч явдаг тул таб солиход хагас ноорог үлдвэл
       дараагийн илгээлт хоёр төрлийн хольц болно. `askSwitch` урьдчилан хадгалдаг. */
    setADraft(new Map()); setResDraft(new Map());
    setSel(null); setModal(null); setNote(''); setKomissNote(''); setErr('');
    setPreviewing(false); setApproving(null); setFlowBox(null); setFlowTxt('');
    setOkRows(new Set()); setBackMarks(null);
    /* ⚠️ Батлах урсгалын АЛХАМЫН тэмдэглэгээг ч тэглэнэ (2026-09-15-ны
       аудит): savedRef нь useRef тул багц/төрөл солиход үлддэг байв. Бичилт
       унаад true үлдсэн бол дараагийн батлалтад save() ОГТ дуудагдалгүй
       шууд decidePlan руу орж, хуваарь эх хуудсанд бичигдэлгүй «батлагдсан»
       болж, гүйцэтгэгчийн санал ул мөргүй алга болно. */
    savedRef.current = false;
  }, [kind]);

  const n = sc?.bld.length ?? 0;
  /**
   * Бодит огноо · нөөцийн багана ХАРАГДАХ ЭСЭХ (2026-09-23) — талбар байгаа
   * үйлчилгээнд л. Блокгүй 8 багцад `aStart` хоосон тул бодит огноо нуугдана;
   * `hun_huch`/`mashin_mehanizm` 18/18-д бий ч схемээс шалгана (null = нуух).
   * ⚠️ 2026-09-23: блокгүй багцад синтетик блок (`Schema.synthetic`) мөрийн
   *    `bodit_ehleh/duusah`-ыг `aStart[0]`-д авчирдаг тул тэнд ч бодит огноо
   *    харагдана (багана байвал).
   */
  const hasActual = !!sc && sc.aStart.some(Boolean);
  const hasRes = !!sc && !!(sc.f.hunHuch || sc.f.mashin);
  /** Олон блоктой (синтетик биш) багц — «Бүх блок» товч зөвхөн тэнд (2026-10-04) */
  const multiBlk = !!sc && !sc.synthetic && n > 1;
  /* ⚠️ Хяналтын горимд УНТРААЛТТАЙ: батлагчийн тэмдэглэгээ (`onMark`) · «дараагийн
     зөрүү» гүйлгэлт нь идэвхтэй блокоор ажилладаг (2026-10-04). */
  const allOn = allBlk && multiBlk && !isReview;

  /**
   * ХУУДАСНЫ БҮХ МӨР — серверийнх + хараахан батлагдаагүй нэмэлт (2026-09-24).
   * ⚠️ ЗӨВХӨН `base`/`refBase` (харагдац) үүнээс; `rows` нь `save`/`byOid`/
   *    `hdCtx`/`refetchServer`-ийн эх ХЭВЭЭР — нэмсэн мөр сөрөг oid-тай тул
   *    ноорог/илгээлтэд орж болохгүй (`onDown` · `TaskRow` · холбоос суллах
   *    гурвуулаа `oid < 0`-г хаана). `insertAdds` нь `sheetFrame`-ийн ЦОРЫН
   *    ГАНЦ хэрэгжилт — батлахад `ajilApply` ЯГ үүгээр оруулна, байрлал ижил.
   */
  /* ⚠️ ХЯНАЛТЫН ГОРИМД (`review`) НЭМЭЛТ МӨР ОРУУЛАХГҮЙ (2026-09-25 аудит #7):
     `adds` нь БАТЛАГЧИЙН ӨӨРИЙН хөтчийн localStorage — зохиогчийн саналд хамааралгүй
     мөр хяналтын хуанлид гарч, мөрийн индекс/гүйлгэлтийг хөдөлгөдөг байв. */
  const rowsAll = useMemo(
    () => (sc && !isReview ? insertAdds(rows, adds, sc, n) : rows),
    [rows, adds, sc, n, isReview],
  );
  /** Ноорогийг эх мөрүүд дээр давхарлана — харагдац үргэлж ХАМГИЙН СҮҮЛИЙНХ */
  const base = useMemo(() => toPlanRows(rowsAll, n, kind), [rowsAll, n, kind]);

  /**
   * ЛАВЛАГААНЫ хуваарь — НӨГӨӨ төрлийн огноо (2026-09-11, хэрэглэгчийн хүсэлт:
   * «төлөвлөгөө гэрээ 2-ийг зэрэг харах»).
   *
   * ⚠️ Засах боломжгүй, зөвхөн ХАРУУЛНА: зурвасын ард нимгэн судлаар гарч,
   *    «гэрээнээс хэр хазайсан» гэдгийг НЭГ дэлгэцээс уншина. Хоёр төрлийг
   *    зэрэг ЗАСВАЛ аль нь ноорогт хамаарахыг ялгах газаргүй болно.
   * ⚠️ НООРОГ давхарлахгүй (`rows`-оос шууд): лавлагаа нь ХАДГАЛАГДСАН
   *    утга байх ёстой — эс бөгөөс өөрийн зассан зурвасаа өөртэйгөө жишнэ.
   * ⚠️ Бүлгийн мөрд ХҮҮХДЭЭСЭЭ бодогдоно (`effSpan`) — зурах үед хийгдэнэ.
   */
  /*
   * ⚠️ 2026-09-15: `showRef`-ЭЭС САЛГАВ. Урьд нь «Зэрэг» унтраалттай үед огт
   *    бодохгүй байсан (2026-09-11-ний аудит, ачаалал хэмнэх) — гэвч одоо
   *    зүүн самбарын ДӨРВӨН ШИНЭ БАГАНА (гэрээний ба инженерийн огноо) нь
   *    үүнийг ҮРГЭЛЖ шаардана. Нэг хөрвүүлэлт нэмэгдэх нь тэр багануудыг
   *    хоосон үлдээхээс дээр: хоёр төрлийн огноог зэрэгцүүлж харах нь
   *    хуудасны ГОЛ зорилго.
   */
  const refBase = useMemo(
    () => toPlanRows(rowsAll, n, kind === 'geree' ? 'plan' : 'geree'),
    [rowsAll, n, kind],
  );
  const refByOid = useMemo(() => {
    const m = new Map<number, PlanRow>();
    for (const r of refBase) m.set(r.oid, r);
    return m;
  }, [refBase]);
  const plan = useMemo(() => {
    if (!draft.size && !ham.size && !aDraft.size && !resDraft.size) return base;
    return base.map((r) => {
      const s = draft.get(r.oid);
      const t = ham.get(r.oid);
      const ad = aDraft.get(r.oid);
      const rd = resDraft.get(r.oid);
      if (s === undefined && t === undefined && ad === undefined && rd === undefined) return r;
      return {
        ...r,
        spans: s ?? r.spans,
        deps: t !== undefined ? parseDeps(t) : r.deps,
        /* Бодит огноо · нөөцийн ноорог давхарлана (2026-09-23) */
        aStart: ad ? ad.start : r.aStart,
        aEnd: ad ? ad.end : r.aEnd,
        hun: rd ? rd.hun : r.hun,
        mashin: rd ? rd.mashin : r.mashin,
      };
    });
  }, [base, draft, ham, aDraft, resDraft]);

  /** Ажлын код → мөрийн индекс — уялдааны бодолт, сум, зөрчилд нэг эх сурвалж */
  const byCode = useMemo(() => codeIndex(plan), [plan]);

  /**
   * Нийт ноорог — огноо · уялдаа · сарын обьёмын аль нэгийг нь хөндсөн.
   * ⚠️ Обьёмын ноорог нь `${код}|${блок}` түлхүүртэй тул мөрийн тоотой
   *    шууд нийлэхгүй; хоёрын НИЙЛБЭРийг «хадгалах зүйл байна уу» гэсэн
   *    ганц тоо болгож харуулна.
   */
  /* ⚠️ `dirtyN`-ийг async урсгалд (`refreshAjil`) ref-ээр уншина — deps-д
     оруулбал чирэлт бүрд урсгал дахин татагдана. */
  const dirtyNRef = useRef(0);
  const dirtyN = useMemo(
    () => new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()]).size
      + new Set([...obDraft.keys(), ...obResDraft.keys()]).size,
    [draft, ham, aDraft, resDraft, obDraft, obResDraft],
  );
  /**
   * ӨӨРЧЛӨГДСӨН ЯЛГААТАЙ МӨРИЙН тоо — илгээлтийн `rowCount` (2026-09-23).
   * ⚠️ `dirtyN` нь сарын нүд бүрийг тоолдог тул «14 мөр» гэж харуулбал
   *    батлагчийн дарааллын тоо мөрийн тоотой зөрдөг байв. Обьёмын ноорог
   *    (`${код}|${блок}`) нь код → мөр болж нэгтгэгдэнэ.
   */
  const dirtyOids = useMemo(() => {
    const s = new Set<number>([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()]);
    for (const k of new Set([...obDraft.keys(), ...obResDraft.keys()])) {
      const code = Number(k.split('|')[0]);
      const i = Number.isFinite(code) ? byCode.get(code) : undefined;
      if (i != null && plan[i]) s.add(plan[i].oid);
    }
    return s;
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, byCode, plan]);
  const dirtyRows = dirtyOids.size;

  /**
   * ЗӨВШӨӨРӨЛ ШААРДАХ МӨРҮҮД — өөрчлөгдсөн АЖЛЫН мөр + бүлгийн ЖИНХЭНЭ өөрчлөлт.
   * ⚠️ Хүүхдээс БОДОГДСОН бүлгийн муж (`rollUpGroups`) хасагдана — хүүхдүүд нь
   *    ногоон бол тэр нь ч зөв.
   */
  /* ⚠️ БҮЛГИЙН ЖИНХЭНЭ ӨӨРЧЛӨЛТ ОРНО (2026-09-25 аудит): бүлгийн УЯЛДАА (`ham`)
     ба НАВЧГҮЙ блокийн өөрийн муж (`applyPayloadToDraft`-ийн `gOwn`) нь хүүхдээс
     бодогддоггүй, санал өөрөө агуулдаг — хасвал зөвшөөрөлгүйгээр батлагдана.
     Хүүхдээс бодогдсон (`rollUpGroups`) бүлгийн муж л хасагдана. */
  /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ / ХАРАГДАХ ЯЛГААГҮЙ МӨР ОРОХГҮЙ (2026-09-25 аудит #8):
     `applyPayloadToDraft` нь зохиогч хөндөөгүй блокт серверийн ОДООГИЙН утгыг
     ноорогт тавьдаг, хуваалцсан ноорог ч серверт хүрсэн утгыг агуулж болно —
     тэр мөрүүд «өөрчлөгдсөн» гэж тоологдож, батлагч ЯЛГААГҮЙ мөрийг хайж
     ногоон болгох шаардлагатай болдог байв. Одоо мөр бүрийг суурьтай (`base`)
     тал бүрээр нь тулгана: огноо · уялдаа · бодит огноо (багана байвал) · нөөц
     (багана байвал) · сарын обьём/нөөц. Ялгаагүй мөр тэмдэггүй (саармаг). */
  const reviewOids = useMemo(
    () => reviewOidsOf({ dirtyOids, plan, base, ham, draft, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, hasActual, hasRes, n }),
    [dirtyOids, plan, base, ham, draft, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, hasActual, hasRes, n],
  );
  /* ⚠️ 2026-09-25 аудит #2: буцаасан тэмдэглэгээг ноорог хоосроход АРЧИХГҮЙ —
     `lastDecision`-оос дахин үүсдэг (`backMarks`-ийн эффект); ноороггүй үед
     `backOn` худал тул харагдахгүй. Урьд нь энд арчдаг байсан тул «Цуцлах»/
     дахин ачаалсны дараа тэмдэг мөнхөд алга болдог байв. */
  const reviewOk = reviewOids.filter((o) => okRows.has(o)).length;
  const allOk = reviewOids.length > 0 && reviewOk === reviewOids.length;
  /** Сарын обьём/нөөцийн ноорогтой ажлын КОДУУД — мөрийн «хадгалаагүй» тэмдэгт (2026-09-24 аудит) */
  useEffect(() => { dirtyNRef.current = dirtyN; }, [dirtyN]);
  const obDirtyDes = useMemo(() => {
    const s = new Set<number>();
    for (const k of [...obDraft.keys(), ...obResDraft.keys()]) s.add(Number(k.slice(0, k.indexOf('|'))));
    return s;
  }, [obDraft, obResDraft]);

  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): ЭНД ЗӨВХӨН `tasks` · `planned` · `reversed` уншигдана.
     `coverageOf` нь навч бүрд 22 блокийн огноог мөр болгон нийлүүлж (`patterns`-ийн Set) чирэлтийн
     кадр бүрд ~1,400 мөр үүсгэдэг байв — профайлын 2-р хүнд мөр. Гурван талбарыг ЯГ ИЖИЛ дүрмээр
     (`plan.coverageOf`-ийн давталт) бодно; `patterns`/`from`/`to` хэрэгтэй бол `coverageOf`-ийг
     дуудна уу. */
  const cov = useMemo(() => {
    let tasks = 0, planned = 0, reversed = 0, partial = 0;
    for (const r of plan) {
      if (r.group) continue;
      tasks += 1;
      let filled = 0, rev = false;
      for (const s of r.spans) {
        if (!s) continue;
        filled += 1;
        if (s.end < s.start) rev = true;
      }
      if (filled > 0) planned += 1;
      if (rev) reversed += 1;
      /* «Дутуу» шүүлтийн тоо — урьд нь toolbar-т зурагдалт БҮРД `plan.filter`-ээр (2026-10-04) */
      if (filled > 0 && filled < r.spans.length) partial += 1;
    }
    return { tasks, planned, reversed, partial };
  }, [plan]);

  /**
   * САРЫН ХУВАARЬ ХУВЬ — тэр сард төлөвлөсөн обьём нь БАГЦЫН НИЙТ обьёмын
   * хэдэн хувь (2026-09-22, хэрэглэгчийн хүсэлт: «дээд талын огнооны нүдэнд
   * огнооны доод тал хуваарьт төлөвлөсөн обьём нийт багц обьёмын хэдэн хувь»).
   *
   * ⚠️ ЗӨВХӨН НАВЧ МӨР (`r.group` биш). Бүлгийн мөрд `vol` уншигддаг
   *    (`bagtsSheet.ts:752`) тул шүүхгүй бол хүүхдүүдээ ДАХИН тоолж хоёр
   *    дахин хөөрөгдөнө — `ipcLink.ts:81-83`-ийн ижил ⚠️. Хуваарь ба хуваагч
   *    ХОЁУЛАА ижил шүүлттэй байх ёстой, эс бөгөөс харьцаа гажна.
   *
   * ⚠️ `plannedVol` ба `unit` ХЭРЭГЛЭХГҮЙ — `bagtsSheet.ts:44-52` нь
   *    хоёуланг «ЯМАР Ч ТООЦООНД ОРОХГҮЙ, зөвхөн харуулна» гэж бэхэлсэн.
   *    Мөнгөн жин (`vol × unit`) ч хориотой (`bagtsSheet.ts:1075-1077`:
   *    «үнэ өндөртэй ажил руу хазайлгадаг»).
   *
   * ⚠️ Энэ нь БИЕТ ГҮЙЦЭТГЭЛИЙН ЖИН БИШ — нэгж хольсон нийлбэр (м³+м²+ш)
   *    тул зөвхөн төлөвлөгөөний ЦАГ ХУГАЦААНЫ хуваарилалтыг илэрхийлнэ.
   *
   * ⚠️ Ноорог ЗААВАЛ орно (`obDraft` нь `obPlan`-ыг дарна — `obOf`-ийн
   *    дүрэм) — эс бөгөөс зурвасыг чирэхэд тоо хөдөлдөггүй.
   *
   * ⚠️ ХУУРАМЧ ХУВЬ ХЭЗЭЭ Ч ГАРГАХГҮЙ (2026-09-22, хэрэглэгчийн шаардлага:
   *    «сарын задаргаа байхгүй байхад хуурамч хувь битгий гаргаад бай»).
   *    Урьд нь задаргаагүй зурваст мөрийн обьёмыг ХОНОГООР шугаман хуваадаг
   *    байв — тэр нь ТААМАГЛАЛ бөгөөд төлөвлөгчийн хийгээгүй шийдвэрийг
   *    түүний хийсэн юм шиг харуулна. Одоо ЗӨВХӨН бодит задаргаа: задаргаа
   *    нэг ч мөрд байхгүй бол сарын нүдэнд ЮУ Ч гарахгүй.
   *
   * ⚠️ ХУВААГЧ нь БАГЦЫН НИЙТ ОБЬЁМ (2026-09-22, хэрэглэгч: «тухайн сард
   *    төлөвлөсөн бүх ажил багц нийт обьём эзлэх хувь»). Задаргаа оруулсан
   *    хүрээ БИШ — багцын БҮХ навч ажлын `vol` бүх блокоор.
   *
   *    Тиймээс тоо нь «БАГЦЫН хэдэн хувийг тэр сард төлөвлөсөн» гэсэн утга
   *    өгнө: сар бүрийн нийлбэр = төлөвлөлтийн ХАМРАЛТ. Задаргаа хагас
   *    бөглөгдсөн бол нийлбэр 100%-д хүрэхгүй — тэр нь ЗӨВ дохио, дутууг
   *    нуухгүй.
   *
   *    `vol` нь БЛОК ТУС БҮРИЙН нийт обьём — блокуудын нийлбэр БИШ. Үүнийг
   *    цонх өөрөө баталдаг: `balanced(mv, total)`, `total = r.vol` буюу НЭГ
   *    блокийн сарын задаргаа `r.vol`-тай тэнцэхийг шаардана
   *    (`PlanModal`). Тиймээс хуваагч нь `Σ r.vol × (хуваарьтай блокийн тоо)`.
   *
   * ⚠️ ХУВААРЬГҮЙ блок хуваагчид ОРОХГҮЙ: 22 блокоос 3-д л хуваарь байхад
   *    22-оор үржүүлбэл хувь 7 дахин багасч, бүрэн төлөвлөсөн багц ч 14%
   *    гэж харагдана. Хуваарьтай блок нь «төлөвлөх ёстой хүрээ».
   */
  const monPct = useMemo(() => {
    const per = new Map<string, number>();
    let tot = 0;
    for (const r of plan) {
      if (r.group || r.des == null) continue;
      if (r.vol == null || !(r.vol > 0)) continue;
      /* ⚠️ 2026-10-04 (гүйцэтгэл): мөрийн задаргааг блокийн давталтаас ӨМНӨ нэг удаа; ноорог
         хоосон бол түлхүүрийн мөр (`${des}|${блок}`) огт үүсгэхгүй — чирэлтийн кадр бүрд
         ~1,400 × 22 мөр үүсгэдэг байв. Дүрэм ХЭВЭЭР: ноорог нь хадгалагдсаныг дарна. */
      const pm = obPlan.get(r.des);
      const hasDraft = obDraft.size > 0;
      for (let b = 0; b < n; b += 1) {
        const blok = sc?.bld[b];
        if (!blok) continue;
        /* ⚠️ ХУВААГЧ нь БҮХ хуваарьтай блокоор — задаргаатай эсэхээс
           ҮЛ ХАМААРНА. Эс бөгөөс бөглөөгүй ажил хуваагчаас ч хасагдаж,
           нэг ажил бөглөхөд шууд 100% болж, дутуу нь нуугдана. */
        if (!r.spans[b]) continue;
        tot += r.vol;
        const md = (hasDraft ? obDraft.get(`${r.des}|${blok}`) : undefined) ?? pm?.get(blok);
        if (!md || !md.size) continue;
        for (const [k, v] of md) {
          if (v == null) continue;
          per.set(k, (per.get(k) ?? 0) + v);
        }
      }
    }
    return { per, tot };
  }, [plan, n, sc, obDraft, obPlan]);

  /**
   * Сарын шошгын доорх хувийн ТЕКСТ. `null` = ОГТ зурахгүй.
   * ⚠️ `null ≠ 0`: багцад обьём бүртгэгдээгүй (`tot === 0`, ж: `4.2·12F`
   *    мэт `bld` хоосон багц) эсвэл тэр сард хуваарь байхгүй бол хоосон —
   *    «0» гэж зурвал 30px-ийн зурвас бүхэлдээ тэгээр дүүрч шуугиан болно.
   * ⚠️ `pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ тул энд хэрэглэхгүй; 73px-д «12.4%»
   *    багтахгүй учир БҮХЭЛ хувь, % тэмдэггүй. Бүтэн утга `title`-д.
   */
  const monLab = useCallback((mk: string): { txt: string; tip: string } | null => {
    /* ⚠️ (2026-09-23) ГЭРЭЭ табд ЗУРАХГҮЙ: `monPct` нь `plan`-ын (төлөвлөгөөний)
       мужаар бодогддог тул гэрээний огнооны толгой дор тавибал хоёр эх холилдоно.
       Сарын обьём нь зөвхөн төлөвлөгөөнд хамаарна (`PlanKind` тайлбар). */
    if (kind !== 'plan') return null;
    if (!(monPct.tot > 0)) return null;
    const v = monPct.per.get(mk);
    if (v == null || !(v > 0)) return null;
    const p = (v / monPct.tot) * 100;
    return {
      txt: p < 0.5 ? '·' : String(Math.round(p)),
      tip: tr('{0} — багцын нийт обьёмын {1}%', mk, num(p, 1)),
    };
  }, [monPct, kind]);

  /**
   * Мөр шүүлтүүрт нийцэж байна уу.
   *
   * ⚠️ БҮЛГИЙН мөр ҮРГЭЛЖ гарна: хамралт, огноо бүгд түүний ХҮҮХДҮҮДИЙН
   *    шинж болохоос бүлгийн өөрийнх биш. Бүлгийг шүүж хаявал доорх ажлууд
   *    эцэггүй үлдэж, чирэлтийн хавчилт («хүүхэд эцгийнхээ дотор») суурьгүй
   *    болно.
   *
   * ⚠️ «Түвшин» ба «Хугацаа» сонголт ХАСАГДСАН (2026-09-02, хэрэглэгч).
   */
  const match = useCallback((r: PlanRow) => {
    if (r.group) return true;
    const filled = r.spans.filter(Boolean).length;
    if (filter === 'has' && !filled) return false;
    if (filter === 'none' && filled) return false;
    if (filter === 'partial' && (!filled || filled === r.spans.length)) return false;
    const sp = rowSpan(r);
    /* ⚠️ 2026-10-01: жил нь мужтай ДАВХЦВАЛ таарна — урьд нь зөвхөн ЭХЛЭХ жил
       шалгагдаж, 2025-12 → 2026-03 ажил «2026» шүүлтэд гардаггүй байв. */
    if (fYear !== 'all') {
      if (!sp) return false;
      const y = Number(fYear);
      if (Number(msToDay(sp.start).slice(0, 4)) > y || Number(msToDay(sp.end).slice(0, 4)) < y) return false;
    }
    return true;
  }, [filter, fYear]);

  /** Бүлгийн сонголт — модны дарааллаар, гүнээр нь догол мөртэй */
  const groups = useMemo(
    () => plan.filter((r) => r.group).map((r) => ({
      oid: r.oid,
      label: `${'  '.repeat(r.depth)}${r.no} ${r.work}`.trimEnd(),
    })),
    [plan],
  );

  /**
   * Сонгосон бүлгийн ДЭД МОД (бүлэг өөрөө + доторх бүх мөр).
   * ⚠️ Гүнээр таслана, дараагийн ижил гүнтэй мөр хүртэл — модны дараалал нь
   *    хавтгай массив тул эцэг/хүүхдийн холбоо зөвхөн ЭНЭ дүрмээр гарна.
   */
  const scoped = useMemo(() => {
    if (fGrp === 'all') return plan;
    const at = plan.findIndex((r) => r.oid === fGrp);
    if (at < 0) return plan;
    const out = [plan[at]];
    for (let k = at + 1; k < plan.length; k++) {
      if (plan[k].depth <= plan[at].depth) break;
      out.push(plan[k]);
    }
    return out;
  }, [plan, fGrp]);

  /**
   * ХАРАГДАХ МӨРҮҮД — эвхэлт · шүүлт. Зүүн мод ба баруун хуанли ЯГ ЭНЭ
   * жагсаалтаар эгнэнэ.
   *
   * ⚠️ ТЕКСТ ХАЙЛТ ХАСАГДСАН (2026-09-02, хэрэглэгч). Хайлт нь модыг ХАВТГАЙ
   *    жагсаалт болгож, бүлгийн мөрүүдийг хасдаг тул эцгийн муж алдагдаж,
   *    чирэлтийн хавчилт («хүүхэд эцгийнхээ дотор») ажиллах суурьгүй болдог
   *    байв. «Бүлэг» сонголт нь модыг бүтнээр нь үлдээж, тэр үүргийг гүйцэтгэнэ.
   */
  const visible = useMemo(() => {
    const out: PlanRow[] = [];
    let hideBelow = -1;
    for (const r of scoped) {
      if (hideBelow >= 0 && r.depth > hideBelow) continue;
      hideBelow = -1;
      if (r.group && collapsed.has(r.oid)) hideBelow = r.depth;
      if (!match(r)) continue;
      out.push(r);
    }
    return out;
  }, [scoped, collapsed, match]);

  /**
   * ХҮСНЭГТЭД БОДИТООР БАЙГАА ТҮВШНҮҮД — товчийг өгөгдлөөс угсарна.
   *
   * ⚠️ Хатуу 1·2·3·4·5 гэж бичихгүй (`Finance`-ээс ЭНД ЯЛГААТАЙ): санхүүгийн
   *    бүртгэл нь ТОГТМОЛ таван түвшинтэй Excel загвар, харин хуваарийн модны
   *    гүн БАГЦ БҮРД өөр. Багц 1 нь дөрвөн түвшинтэй, зарим багц хоёр л
   *    түвшинтэй — байхгүй түвшний товч гарвал дарахад юу ч болохгүй.
   *
   * ⚠️ Гүн 0-ээс эхэлдэг тул товчны дугаар нь `depth + 1`.
   */
  const lvls = useMemo(() => {
    const s = new Set<number>();
    for (const r of scoped) if (r.group) s.add(r.depth);
    return [...s].sort((a, b) => a - b);
  }, [scoped]);

  /**
   * ТҮВШИН СОНГОХ — `Finance.setLevel`-ийн ижил үүрэг.
   *
   * ⚠️ `n` нь ТОВЧНЫ дугаар (1-ээс эхэлнэ), гүн нь `n - 1`. «N-р түвшин ХҮРТЭЛ
   *    дэлгэх» — N-р түвшний бүлгүүд ДЭЛГЭГДЭЖ доторх ажилбар харагдана, гүн ≥ `n`
   *    бүлгүүдийг `collapsed`-д хийнэ (2026-10-04 засвар — доорх ⚠️).
   *
   * ⚠️ ХАМГИЙН ГҮН түвшин нь бүх мөрийг ДЭЛГЭНЭ (`Finance`-ийн 4·5-тай ижил
   *    зарчим): тэр түвшний бүлгүүд нь навчтай тул эвхэх юм үлдэхгүй.
   *
   * ⚠️ Зөвхөн БҮЛЭГ мөрийг (`r.group`) хийнэ — навч мөрийг эвхэх утгагүй
   *    бөгөөд `visible`-ийн `hideBelow` логик нь тэднийг хардаггүй.
   */
  /* ⚠️ 2026-09-30: useState-ийн setter-үүд deps-д — React Compiler-ийн шалгуур (preserve-manual-memoization)
   энэ том бүрэлдэхүүнд setter-ийн тогтвортой байдлыг батлаж чадахгүй тул «inferred ≠ source» гэж
   унадаг байв; setter-ийн identity ТОГТМОЛ тул deps-д нэмэх нь дахин үүсгэлт нэмэхгүй (React-ийн
   баримт: «safe to include»). Утга · зан төлөв өөрчлөгдөхгүй. */
  const setLevel = useCallback((n: number) => {
    setLvl(n);
    const deepest = lvls.length ? lvls[lvls.length - 1] : 0;
    /* Хамгийн гүн түвшин = бүгдийг дэлгэх */
    if (n - 1 >= deepest) { setCollapsed(new Set()); return; }
    /* ⚠️ 2026-10-04 (хэрэглэгч: «Level 3 руу хураахад ажилбарууд харагдах байтал зарим дэд
       бүлгүүд бүтэн хураагдаж байна»): урьд нь гүн ≥ `n - 1` бүлгийг эвхдэг байв — N-р
       түвшний бүлэг ӨӨРӨӨ эвхэгдэж, доторх ажилбар нуугддаг атлаа тэр түвшинд шууд байгаа
       ажилбар (өөр салбарт) ил харагдаж зөрдөг байв; товчны тайлбар «N-р түвшин ХҮРТЭЛ
       ДЭЛГЭХ»-тэй ч зөрчилдөж байв. Одоо N-р түвшний бүлгүүд ДЭЛГЭГДЭНЭ (доторх ажилбар
       харагдана), зөвхөн түүнээс ДООШХ (гүн ≥ `n`) бүлгүүд эвхэгдэнэ. */
    /* ⚠️ 2026-10-04: `n = -1` («0» товч) → гүн ≥ 0 буюу БҮХ бүлэг хураагдана */
    const s = new Set<number>();
    for (const r of scoped) if (r.group && r.depth >= Math.max(0, n)) s.add(r.oid);
    setCollapsed(s);
  }, [scoped, lvls, setLvl, setCollapsed]);

  /** Хуваарьт тааралдсан ЖИЛҮҮД — сонголтыг өгөгдлөөс угсарна */
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of plan) {
      const sp = rowSpan(r);
      if (!sp) continue;
      /* ⚠️ 2026-10-01: мужийн ДАМЖСАН бүх жил (шүүлтийн давхцлын дүрэмтэй ижил) */
      /* ⚠️ 2026-10-04 (гүйцэтгэл): `getUTCFullYear` ≡ `msToDay(..).slice(0, 4)` (ISO нь UTC) —
         мөр бүрд 2 `toISOString` мөр үүсгэхгүй; чирэлтийн кадр бүрд ~1,400 мөрөөр гүйдэг. */
      const y0 = new Date(sp.start).getUTCFullYear();
      const y1 = new Date(sp.end).getUTCFullYear();
      for (let y = y0; y <= y1; y++) s.add(String(y));
    }
    return [...s].sort();
  }, [plan]);

  /** Блок бүрд хуваарьтай АЖЛЫН тоо — сонголтын жагсаалтад харуулна */
  const blockFill = useMemo(() => {
    const c = new Array<number>(n).fill(0);
    for (const r of plan) {
      if (r.group) continue;
      r.spans.forEach((sp, b) => { if (sp) c[b] += 1; });
    }
    return c;
  }, [plan, n]);

  /**
   * ДЭЛГЭЦИЙН МӨРҮҮД — цонхлолт · зүүн жагсаалт · баруун эгнээ ЭНЭ жагсаалтаар (2026-10-04).
   * ⚠️ Энгийн горимд `visible`-тэй 1:1 (`plainRows`, дэд мөргүй) — зан төлөв ХЭВЭЭР.
   *    «Бүх блок» горимд эх мөр бүрийн ард хуваарьтай блокийн дэд мөрүүд (`allBlockRows`).
   * ⚠️ Индекс `k` (Y = k·PL_ROW) нь ЭНЭ жагсаалтынх — `visible`-ийнх биш; энгийн горимд
   *    хоёр нь ижил тул `startLink`-ийн Y→мөр нөөц зам хэвээр зөв.
   */
  const disp = useMemo(
    () => (allOn ? allBlockRows(visible, plan, n) : plainRows(visible)),
    [allOn, visible, plan, n],
  );
  /* ── ХУАНЛИЙН ГЕОМЕТР — «өнөөдөр» · хүрээ · хоног↔px · цонхлолт · шошго (`useCalendar`) ── */
  const {
    now, from, to, px, total, W, xOf, dayAt, msAt, trackRef, scrollRef, onScroll, winFrom, winTo, slice, ticks, months,
  } = useCalendar({ plan, drag: !!drag, zoom, visible: disp, sel, jumpedRef });

  /* ── Ноорог ── */

  /**
   * ГИНЖНИЙ ҮР ДҮНГ НООРОГТ БУУЛГАНА — `propagate` олон мөрийг зэрэг
   * өөрчилдөг тул НЭГ setState дотор бөөнөөр нь бичнэ; мөр бүрд тусдаа
   * бичвэл чирэлтийн кадр бүрд олон рендер гарна.
   * ⚠️ Түлхүүр нь `plan`-ы индекс — `PlanRow.i` нь эх массивын индекстэй
   *    тэнцүү тул `plan[i].oid` үргэлж зөв мөрийг заана.
   */
  /* (`obKey` — ажил+блокийн ноорогийн түлхүүр — `huvaari/util.ts`-д, 2026-09-30) */

  /**
   * Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ задаргаа — ноорог нь хадгалагдсаныг
   * дарна. Задаргаагүй бол хоосон Map.
   */
  const obOf = useCallback((des: number | null, blok: string): Map<string, number> => {
    if (des == null) return new Map();
    const d = obDraft.get(obKey(des, blok));
    if (d) return d;
    return obPlan.get(des)?.get(blok) ?? new Map();
  }, [obDraft, obPlan]);
  /** Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ сарын нөөц — `obOf`-ийн адил (2026-09-24) */
  const obResOf = useCallback((des: number | null, blok: string): Map<string, MonthRes> => {
    if (des == null) return new Map();
    const d = obResDraft.get(obKey(des, blok));
    if (d) return d;
    return obRes.get(des)?.get(blok) ?? new Map();
  }, [obResDraft, obRes]);

  /**
   * МУЖААС ГАДУУРХ САРЫН ОБЬЁМ — батлахын өмнөх хаалт (2026-10-01, хэрэглэгч: бүгдийг зас).
   * ⚠️ Дүрэм · тайлбар `huvaari/util.obyemOutsideSpan`-д. Зөвхөн ЭНЭ саналаар өөрчлөгдсөн
   *    мөр (`dirtyOids`) — урьдчилан харах/батлах үед ноорог = илгээлт. Гэрээ табд сарын
   *    обьём хамаарахгүй (төлөвлөгөөний мужтай тулгадаг).
   */
  const obOut = useMemo(
    () => (kind === 'plan' && sc ? obyemOutsideSpan(plan, sc.bld, obOf, dirtyOids) : { bad: 0, names: [] as string[] }),
    [kind, sc, plan, obOf, dirtyOids],
  );
  /** `obOut`-ийн хэрэглэгчид харуулах мөр — эхний 5 нэр (+N) */
  const obOutMsg = obOut.bad
    ? tr('Обьёмтой сар ажлын эхлэх–дуусах мужаас гадуур байна — {0} ажил·блок: {1}. Тэр сарын обьёмыг мужид оруулах эсвэл хасаж засуулна уу (буцаана уу).',
      num(obOut.bad), obOut.names.slice(0, 5).join('; ') + (obOut.names.length > 5 ? ` (+${num(obOut.names.length - 5)})` : ''))
    : '';
  /**
   * БҮЛГИЙН КОДООР ХАДГАЛАГДСАН САРЫН ЗАДАРГАА (2026-10-01) — тэнцлийн шалгалтад ОРОХГҮЙ
   * («Сарын обьём бүлэгт биш», `util.unbalancedBlocks`-ийн ⚠️), тиймээс ил мэдээлнэ.
   */
  const grpSplit = useMemo(
    () => (kind === 'plan' && sc ? groupSplits(plan, sc.bld, obPlan) : []),
    [kind, sc, plan, obPlan],
  );

  const applyChanges = useCallback((ch0: Map<number, (Span | null)[]>) => {
    if (!ch0.size) return;
    /**
     * ⚠️ БҮЛЭГ НЬ АЖЛААСАА ХАМААРНА (2026-09-06, хэрэглэгчийн заавар).
     *    Ажлын муж өөрчлөгдмөгц өвөг бүлгүүд нь хүүхдүүдийнхээ MIN/MAX-аар
     *    ӨӨРСДӨӨ шинэчлэгдэж, ноорогт орж, хадгалахад бичигдэнэ. Урьд нь
     *    эсрэгээр — бүлгийн муж хүүхдийг хавчдаг байв.
     */
    const ch = rollUpGroups(plan, n, ch0);
    setDraft((d) => {
      const m = new Map(d);
      for (const [i, spans] of ch) {
        /* ⚠️ Батлагдаагүй НЭМЭЛТ мөр (сөрөг oid) ноорогт ОРОХГҮЙ (2026-09-25 аудит) —
           `save` серверээс олохгүй тул илгээлт батлахад `staleN`-д мөнхөд гацна. */
        if (plan[i].oid < 0) continue;
        /* ⚠️ СЕРВЕРИЙН УТГАТАЙ ИЖИЛ бол ноорогт ОРУУЛАХГҮЙ, байсан бол ХАСНА
           (2026-09-21): урьд нь 1px гулссан товшилт (`onMove` d=0) мөрийг ижил
           утгаар ноорогт оруулж «хадгалаагүй 1» гэж худал тэмдэглэдэг байв;
           мөн чирээд буцаахад ч ноорог үлддэг байв. */
        const orig = base[i]?.spans;
        const same = !!orig && spans.length === orig.length
          && spans.every((sp, b) => sameSpan(sp, orig[b]));
        if (same) m.delete(plan[i].oid);
        else m.set(plan[i].oid, spans);
      }
      /* ⚠️ БҮЛГИЙН МӨР ХҮҮХЭДГҮЙ ҮЛДЭХГҮЙ (2026-09-21). Бүлэг ноорогт ЗӨВХӨН
         `rollUpGroups`-оор ордог (гараар чирэгдэхгүй, popup нь бүлэгт огноо
         тавьдаггүй). Хүүхдээ буцаахад серверийн бүлгийн ӨӨРИЙН огноо
         MIN/MAX-аас зөрдөг бол `rollUpGroups` `moved=false` болж дээрх
         `same` салбарт хүрэхгүй — бүлэг ноорогт «хадгалаагүй 1» гэж үлддэг
         байв. Навч хүүхэд нь нэг ч ноорогт үлдээгүй бүлгийг хасна. */
      for (const [i] of ch) {
        const g = plan[i];
        if (!g.group || !m.has(g.oid)) continue;
        let kid = false;
        for (let k = i + 1; k < plan.length && plan[k].depth > g.depth; k += 1) {
          if (!plan[k].group && m.has(plan[k].oid)) { kid = true; break; }
        }
        if (kid) continue;
        /* ⚠️ ӨӨРИЙН МУЖ НЬ ШИЛЖСЭН БҮЛЭГ ҮЛДЭНЭ (2026-09-25 аудит). Бүлэг ноорогт
           `rollUpGroups`-оос ГАДНА `propagate`-оор ч ордог: уялдаатай бүлгийн тухайн
           блокт огноотой навч байхгүй бол `effSpan` нь ӨӨРИЙН мужийг ашигладаг тул
           гинж ТЭР мужийг шилжүүлнэ. Урьд нь энд хасагдаж, хамаарагчид нь шинэ
           огноогоор хөдөлсөн атлаа бүлэг өөрөө хуучиндаа үлддэг байв. Навчгүй
           блокт серверээс зөрсөн утга = өөрийн шилжилт → үлдээнэ; навчтай блокийн
           зөрүү нь дээрх нэгтгэлийн дагавар тул хэвээр хасна. Навч нь ноорогт
           байхгүй (`kid` худал) тул тэдний утга = `base`. */
        const gs = m.get(g.oid)!;
        const bs = base[i]?.spans ?? [];
        const ownShift = gs.some((sp, b) => !sameSpan(sp, bs[b])
          && !hasDatedLeaf(plan, i, b, (k) => base[k]?.spans ?? []));
        if (!ownShift) m.delete(g.oid);
      }
      return m;
    });
    /**
     * ⚠️ ХУВААРЬ ХӨДӨЛБӨЛ САРЫН БҮРДЭЛ ДАГАНА. ЭНЭ нь огноо өөрчлөгдөх
     * ЦОРЫН ГАНЦ цэг — чирэлт, popup, уялдааны гинж гурвуулаа эндүүр
     * дамждаг тул өөр газарт давтах шаардлагагүй.
     *
     * ⚠️ АВТОМАТ ТАРААЛТ БАЙХГҮЙ (2026-09-06, хэрэглэгч: «автомат обьём
     * тараалт хийж болохгүй, бүгд хоосон байх ёстой»). Шинэ сарууд ХООСОН
     * үлдэж, хүн өөрөө бөглөнө; хэвээр үлдсэн сарын гарын утга хадгалагдана.
     *
     * ⚠️ Обьёмгүй эсвэл кодгүй мөрд юу ч хийхгүй: хадгалах холбоос байхгүй.
     */
    /* ⚠️ 2026-09-29 аудит: сарын обьём/нөөц ЗӨВХӨН төлөвлөгөөнд — гэрээний зурвас
       чирэхэд `obDraft` (kind-гүй түлхүүр) гэрээний мужаар тайрагдаж, `save` тэр
       сарын мөрийг устгадаг байв (`null ≠ 0`). */
    if (kind === 'plan') setObDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БҮЛЭГ АЛГАСНА — «Сарын обьём бүлэгт биш».
           Урьд нь хүүхдийг чирэхэд бүлгийн муж (`rollUpGroups`) дагаж хөдөлж, серверт
           БҮЛГИЙН кодоор хадгалагдсан задаргаа `keepMonths`-оор тайрагдан «тэнцэхгүй» болж,
           бүлэгт сарын нүд гардаггүй тул засах замгүйгээр илгээх/батлах хаагддаг байв
           (`util.unbalancedBlocks`-ийн ⚠️). */
        if (r.group || r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          const same = (!sp && !was)
            || (!!sp && !!was && sp.start === was.start && sp.end === was.end);
          if (same) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obPlan.get(r.des!)?.get(blok);
          /* Ноорог > хадгалагдсан — хамгийн шинийг суурь болгоно */
          const cur = next.get(key) ?? srv ?? new Map<string, number>();
          /* ⚠️ СЕРВЕРИЙН МУЖ РУУ БУЦСАН БОЛ ЧИРЭЛТИЙН ӨМНӨХ ЗАДАРГААГ СЭРГЭЭНЭ
             (2026-09-21). Урьд нь чирээд буцаахад огнооны ноорог устдаг ч
             (дээрх `same` салбар) `keepMonths`-оор ТАЙРАГДСАН задаргаа
             obDraft-д үлдэж «хадгалаагүй 1» + тэнцээгүй нийлбэр гардаг байв.
             Чирж буй мөр·блок бол `Drag.origMonths` (чирэлтээс өмнөх бүтэн
             хуулбар) — гинжээр буцсан бусад мөрд `keepMonths` хэвээр. */
          /* ⚠️ 2026-10-01: ГИНЖЭЭР хөдөлсөн мөр·блок ч чирэлтийн ӨМНӨХ агшнаас
             (`drag.obSnap` → сервер). Урьд нь зөвхөн чирж буй мөр `origMonths`-тэй,
             хамаарагчид `cur` (өмнөх алхмаар аль хэдийн тайрагдсан ноорог)-оос
             `keepMonths` авдаг тул өмнөх ажлыг урагш чираад буцаахад хамаарагчийн
             эрт сарууд алга болж задаргаа «тэнцэхгүй» үлддэг байв. Чирэлтээс
             өмнөх муждаа (`drag.snap`) буцсан бол агшныг БҮТНЭЭР сэргээнэ. */
          const inDrag = !!drag && b === blk;
          const pre = inDrag ? drag!.snap?.get(r.oid) : undefined;
          const back = sameSpan(sp, base[i]?.spans[b])
            || (inDrag && pre !== undefined && sameSpan(sp, pre));
          const orig = !inDrag ? null
            : drag!.oid === r.oid ? drag!.origMonths ?? null
            : drag!.obSnap?.get(key) ?? srv ?? null;
          /* ⚠️ 2026-09-29 аудит: чирж буй мөр·блокт `keepMonths`-ыг чирэлтийн ӨМНӨХ
             бүтэн хуулбараас — `cur` нь аль хэдийн тайрагдсан ноорог тул зурвасыг
             богиносгоод буцаан сунгахад мужаас гарсан сарын утга сэргэдэггүй байв. */
          const val = sp
            ? (back && orig ? new Map(orig) : keepMonths(sp, orig ?? cur))
            : new Map<string, number>();
          /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ (эсвэл хоёулаа хоосон) задаргааг НООРОГТ
             ҮЛДЭЭХГҮЙ (2026-09-21): задаргаагүй ажлыг чирэхэд
             `keepMonths(sp, ∅) = ∅` obDraft-д орж, «Батлуулах» нь «задаргаа
             тэнцэхгүй» гэж илгээх замыг ТҮГЖДЭГ байв. Бичих зүйлгүй бол
             ноорог ч биш. */
          if (sameMonths(val, srv)) next.delete(key);
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
    /* САРЫН НӨӨЦ — обьёмын ИЖИЛ дүрмээр дагана (2026-09-24): `keepRes`, чирэлт
       буцахад `Drag.origRes`, сервертэй ижил бол ноорогоос хасна. */
    if (kind === 'plan') setObResDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        /* ⚠️ 2026-10-01: бүлэг алгасна — дээрх обьёмын дүрэмтэй ижил */
        if (r.group || r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          if (sameSpan(sp, was)) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obRes.get(r.des!)?.get(blok);
          const cur = next.get(key) ?? srv ?? new Map<string, MonthRes>();
          /* ⚠️ 2026-10-01: гинжээр хөдөлсөн мөр ч чирэлтийн өмнөх агшнаас — обьёмын дүрэмтэй ижил */
          const inDrag = !!drag && b === blk;
          const pre = inDrag ? drag!.snap?.get(r.oid) : undefined;
          const back = sameSpan(sp, base[i]?.spans[b])
            || (inDrag && pre !== undefined && sameSpan(sp, pre));
          const orig = !inDrag ? null
            : drag!.oid === r.oid ? drag!.origRes ?? null
            : drag!.obResSnap?.get(key) ?? srv ?? null;
          const val = sp
            ? (back && orig ? new Map(orig) : keepRes(sp, orig ?? cur))
            : new Map<string, MonthRes>();
          if (sameRes(val, srv)) next.delete(key);
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
  }, [plan, base, n, sc, obPlan, obRes, drag, blk, kind, setDraft, setObDraft, setObResDraft]);

  /**
   * Popup-ын «Тавих» — огноо ба/эсвэл уялдааг НЭГ алхамд.
   *
   * ⚠️ Хоёр тусдаа setState хийвэл хоёр дахь нь ХУУЧИН `plan`-ыг харна
   * (React нэг тик дотор batch хийдэг) — уялдаа нь шинэ огноог, огноо нь
   * шинэ уялдааг үл мэдэлцэнэ. Тиймээс нэг газар: уялдааг түр давхарлаад
   * `propagate`-д өгч, огноог ЭНЭ мөрөөс (шинэ уялдаагаар нь дахин бодуулж)
   * гинжээр нь тархаана.
   */
  const applyModal = useCallback((
    oid: number,
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    /** Сарын обьём + нөөц (2026-09-24) — `null` = хөндөхгүй; дотоод `null` = тэр хэсгийг хөндөхгүй */
    ob: { months: Map<string, number> | null; res: Map<string, MonthRes> | null } | null,
    /**
     * ⚠️ САРЫН ЗАДАРГААГ АЛЬ БЛОКТ тавих (2026-09-21). Урьд нь үргэлж ОДООГИЙН
     *    `blk` байсан тул чирэлтийг цуцлахад (`onClose` → `u.months`) цонх
     *    нээлттэй байхад блок сольсон бол задаргаа БУРУУ блокт сэргээгддэг
     *    байв. Дуудагч заагаагүй бол одоогийнх — popup-ын «Тавих» хэвээр.
     * ⚠️ ОЛОН БЛОК (2026-09-24, хэрэглэгч: «блокийг олноор сонгож нэг төлөвлөлтийг
     *    зэрэг тавина»): popup сонгосон блок бүрд ИЖИЛ задаргаа/нөөцийн ХУУЛБАР.
     */
    blks: number[] = [blk],
  ) => {
    /* ⚠️ `locked` — popup-ийн товчнууд аль хэдийн идэвхгүй ч ЭНЭ нь огноо
       өөрчлөгдөх ЦОРЫН ГАНЦ юүлүүр тул түгжээг энд ч барина. */
    if (busy || locked) return;
    /* ⚠️ Батлагдаагүй НЭМЭЛТ мөр (сөрөг oid, 2026-09-25 аудит) — огноо · уялдаа
       ТАВИХГҮЙ: ноорогт орвол «Батлуулах» түүнийг илгээж, батлахад `save`
       мөрийг олохгүй (`staleN`) тул илгээлт хэзээ ч батлагдахгүй. */
    if (oid < 0) return;
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    let deps2 = deps;
    if (deps2) {
      /* ⚠️ БЛОКИЙН ТООНООС ДАВСАН `@N` (2026-09-24 аудит): багц цөөн блоктой
         болсон эсвэл гараар «@9» бичсэн бол тэр уялдаа ХЭЗЭЭ Ч үйлчлэхгүй —
         чимээгүй хадгалахгүй, хасаж ил хэлнэ. Бусад уялдаа хэвээр. */
      const over = deps2.filter((d) => d.blk != null && d.blk >= n);
      if (over.length) {
        setErr(tr('{0}-р блок алга — уялдаа хадгалагдсангүй', over.map((d) => String(d.blk! + 1)).join(', ')));
        deps2 = deps2.filter((d) => d.blk == null || d.blk < n);
      }
    }
    if (deps2) {
      /* ⚠️ Дугуй/шатлалын хамаарлын СҮҮЛЧИЙН хаалт: нэр дэвшигчдийг UI шүүдэг
         ч энд дахин шалгана — modal нээлттэй байх зуур өөр мөрөнд уялдаа
         нэмэгдсэн байж болно. Няцаах нь: (1) дугуй (reaches), (2) өвөг/удам
         бүлэг (hierRelated) — сүүлийнх нь гинжин эргэлт үүсгэдэг байсныг
         2026-09-03-ны review илрүүлсэн. Чимээгүй хасахгүй, бүхэлд нь няцаана. */
      const me = plan[at].des;
      /* ⚠️ Зөвхөн ШИНЭ уялдааг шалгана (2026-09-25 review): `reaches` нь бүлгийн
         гишүүнчлэлээр консерватив (`affectedCodes`-ийн ⚠️) тул хуучин, аль
         хэдийн хадгалагдсан уялдаа ч «дугуй» гэж унаж, тэр мөрийн уялдааг
         ХАСАХ/өөрчлөх засвар бүр няцаагддаг байв. Байгаа уялдааг үлдээх/хасах нь
         шинэ эргэлт үүсгэхгүй. Төрөл/хоцрогдол солих нь ирмэгийг өөрчлөхгүй тул
         зөвхөн КОДООР тулгана.
         ⚠️ Блокийг (@N) харгалзахгүй (2026-09-25): `reaches`/`hierRelated` нь
         блок үл тоодог тул X@1-ийг X@2 болгож зөөхөд шинэ эргэлт үүсэхгүй —
         (код, блок)-оор тулгавал хуучин уялдааг блокийг нь солиход л няцаадаг
         байв. */
      const had = new Set(plan[at].deps.map((d) => d.code));
      const badDep = deps2.filter((d) => !had.has(d.code)).some((d) => {
        const pi = byCode.get(d.code);
        if (pi != null && hierRelated(plan, at, pi)) return true;
        return me != null && reaches(plan, byCode, me, d.code);
      });
      if (badDep) {
        setErr(tr('Дугуй хамаарал үүсэх тул уялдаа хадгалагдсангүй.'));
        deps2 = null;
      } else {
        /* ⚠️ Танигдаагүй токеныг (гараар зассан «5FF2» г.м.) хэвээр угтуулж
           залгана — харагдахгүй ч ХАДГАЛАЛТАД УСТАХГҮЙ (review-ийн олдвор). */
        /* ⚠️ `rowsAll` (2026-09-24): `at` нь `plan`-ы индекс = `rowsAll`-ынх, `rows`-ынх БИШ */
        const keep = residualDeps(ham.get(oid) ?? rowsAll[at]?.ham ?? null);
        const text = [...keep, formatDeps(deps2)].filter(Boolean).join(',');
        /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ БОЛ НООРГООС ХАСНА (2026-10-01): уялдаа нэмээд буцааж устгахад
           (эсвэл өөрчлөөд буцаахад) ноорогт серверийн утга үлдэж «хадгалаагүй» тоологдож,
           илгээлтэд орж байв — тэр хооронд серверт өөр уялдаа батлагдвал батлахад худал
           «зэрэгцээ өөрчлөлт» гарч, буцаах/татах замд хуучин утга серверийнхийг дарна.
           Харьцуулалт `savePrep`-ийн бичих дүрэмтэй ижил (`trim() || null`). */
        const same = (text.trim() || null) === (rowsAll[at]?.ham ?? null);
        setHam((m) => {
          const next = new Map(m);
          if (same) next.delete(oid); else next.set(oid, text);
          return next;
        });
      }
    }
    const rows2 = deps2 ? plan.map((r, i) => (i === at ? { ...r, deps: deps2! } : r)) : plan;
    const overrides = new Map<number, (Span | null)[]>();
    if (spans) overrides.set(at, spans);
    applyChanges(propagate(rows2, n, overrides, deps2 ? [at] : []));
    /**
     * ⚠️ САРЫН ЗАДАРГАА нь `applyChanges`-ийн ДАРАА — тэр нь огноо
     * өөрчлөгдсөн блокуудыг АВТОМАТААР дахин тараадаг тул урьд нь тавьбал
     * гараар оруулсан утга шууд дарагдана. «Бүх блокт» тохиолдолд бусад
     * блок автомат тараалтаа авч, ЭНЭ блок нь гарын утгаа хадгална.
     */
    const des = plan[at].des;
    /* ⚠️ 2026-09-29 (аудит 10): сарын обьём/нөөц ЗӨВХӨН төлөвлөгөөнд (`applyChanges`-ийн
       ижил хаалт) — гэрээ табын «Тавих»/«Арилгах» нь төлөвлөгөөний сарын задаргаа ·
       хүн/машиныг (kind-гүй түлхүүр) хөндөж болохгүй. */
    if (ob && des != null && kind === 'plan') {
      const { months, res } = ob;
      for (const bAt of blks) {
        const blok = sc?.bld[bAt];
        if (!blok) continue;
        const key = obKey(des, blok);
        /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ задаргааг ноорогт ҮЛДЭЭХГҮЙ (2026-09-21): чирэлтийг
           цуцлахад (`onClose` → `u.months`) задаргаагүй ажилд ХООСОН Map буцаж
           ирдэг байсан нь obDraft-д үлдэж, «Батлуулах»-ыг «1 ажлын задаргаа
           тэнцэхгүй» гэж түгждэг байв. Ижил бол хасна — бичих зүйлгүй.
           ⚠️ Блок бүрд ШИНЭ Map (хуулбар) — нэг Map-ыг хуваалцвал нэг блокийн
              засвар нөгөөд «чимээгүй» орно. */
        if (months) {
          const mine = new Map(months);
          setObDraft((m) => {
            const next = new Map(m);
            if (sameMonths(mine, obPlan.get(des)?.get(blok))) next.delete(key);
            else next.set(key, mine);
            return next;
          });
        }
        if (res) {
          const mine = new Map(res);
          setObResDraft((m) => {
            const next = new Map(m);
            if (sameRes(mine, obRes.get(des)?.get(blok))) next.delete(key);
            else next.set(key, mine);
            return next;
          });
        }
      }
    }
  }, [plan, byCode, n, busy, locked, ham, rowsAll, applyChanges, sc, blk, obPlan, obRes, kind, setErr, setHam, setObDraft, setObResDraft]);

  /**
   * POPUP-ЫН «Тавих» — БОДИТ ОГНОО (энэ блок) ба НӨӨЦ (мөр) (2026-09-23).
   *
   * ⚠️ `applyModal`-аас ТУСДАА: тэр нь `propagate` (гинж) ба `rollUpGroups`
   *    (бүлэг) руу явдаг; бодит огноо/нөөц тэдгээрт ОРОХГҮЙ — зөвхөн ноорог.
   * ⚠️ СЕРВЕРТЭЙ ИЖИЛ болвол ноорогоос ХАСНА (`applyChanges`-ийн 2026-09-21-ний
   *    дүрэм) — эс бөгөөс буцаасан засвар «хадгалаагүй 1» гэж үлдэнэ.
   * ⚠️ Бүлгийн мөрд ХЭЗЭЭ Ч бичихгүй (`aggExtra`-аар бодогддог); popup нь
   *    бүлэгт талбарыг хаадаг ч энд давхар хаана.
   */
  const applyExtra = useCallback((
    oid: number,
    /** Бодит огноог тавих блокууд (2026-09-24 — popup олон блок сонгодог болсон) */
    blks: number[],
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
  ) => {
    if (busy || locked) return;
    const orig = rows.find((r) => r.oid === oid);
    if (!orig || orig.group) return;
    const ok = blks.filter((b) => b >= 0 && b < n);
    if (actual && ok.length) {
      setADraft((m) => {
        const next = new Map(m);
        const cur = next.get(oid);
        const start = (cur ? cur.start : orig.aStart).slice();
        const end = (cur ? cur.end : orig.aEnd).slice();
        for (const bAt of ok) { start[bAt] = actual.start; end[bAt] = actual.end; }
        const same = start.every((v, b) => v === (orig.aStart[b] ?? null))
          && end.every((v, b) => v === (orig.aEnd[b] ?? null));
        if (same) next.delete(oid); else next.set(oid, { start, end });
        return next;
      });
    }
    if (res) {
      setResDraft((m) => {
        const next = new Map(m);
        if ((res.hun ?? null) === (orig.hun ?? null) && (res.mashin ?? null) === (orig.mashin ?? null)) next.delete(oid);
        else next.set(oid, { hun: res.hun, mashin: res.mashin });
        return next;
      });
    }
  }, [busy, locked, rows, n, setADraft, setResDraft]);

  /**
   * ХАМААРЛЫГ НҮДЭНД ШУУД БИЧИХ (2026-09-15, хэрэглэгчийн хүсэлт:
   * «11FS14 гэж шууд бичиж холбоос хийх боломжтой болгох»).
   *
   * ⚠️ POPUP-ЫГ ОРЛОХГҮЙ, ХАЖУУД НЬ. Popup нь ажлын НЭРЭЭР сонгуулдаг тул
   *    кодоо мэдэхгүй хүнд зайлшгүй; энэ нь кодоо мэддэг хүнд ХУРДАН зам.
   *    MS Project-ийн Predecessors нүд яг ийм ажилладаг.
   *
   * ⚠️ БҮХ ШАЛГУУР `applyModal`-д (дугуй хамаарал, шатлалын зөрчил, танигдаагүй
   *    токен хадгалах) — энд ДАВХАРДУУЛАХГҮЙ. Зөвхөн текстийг `Dep[]` болгож
   *    дамжуулна; буруу бичсэн токеныг `parseDeps` өөрөө алгасана.
   *
   * ⚠️ Хоосон болговол уялдааг ЦЭВЭРЛЭНЭ (`[]`) — `null` нь «бүү хөндөөрэй»
   *    гэсэн утгатай тул ялгах ёстой.
   */
  /**
   * ШУГАМААР ХОЛБОХ ЧИРЭЛТ — бариулаас эхлээд `window` дээр дуусна (2026-09-22).
   *
   * ⚠️ Pointer capture АВАХГҮЙ: зорилтыг `elementFromPoint`-оор олдог тул хулгана
   *    доорх элемент нь ЖИНХЭНЭ мөр байх ёстой (capture авбал үргэлж бариул).
   * ⚠️ Хамаарал нь ЗОРИЛТ мөрд бичигдэнэ (зорилт нь урд ажлаас хамаарна) — сумны
   *    чиглэлтэй ижил: урд ажлын баруун зах → хамаарагчийн зүүн зах.
   * ⚠️ Урд ажилд код (`des`) алга бол холбож болохгүй — уялдаа кодоор бичигддэг.
   * ⚠️ БҮЛЭГ ↔ БҮЛЭГ, БҮЛЭГ ↔ АЖИЛ БҮГД ХОЛБОГДОНО (2026-09-22, хэрэглэгч:
   *    «бүлэг хооронд уялдаа хийх боломжтой, бүгд өөр хоорондоо холбогдох
   *    ёстой»). Хөдөлгүүр аль хэдийн дэмждэг: бүлэг урд ажил бол `effSpan`
   *    (хүүхдийн MIN/MAX), бүлэг хамаарагч бол `propagate` дэд модыг бүхэлд нь
   *    шилжүүлнэ. ЗӨВХӨН өвөг ↔ удам (өөрийн дотоод) холбоос хориотой хэвээр —
   *    `applyModal`-ын `hierRelated` шалгуур (гинжин эргэлт).
   */
  const startLink = (e: PEvt<HTMLElement>, r: PlanRow) => {
    /* ⚠️ (2026-09-23) Уялдаа ЗӨВХӨН төлөвлөгөөнд — гэрээ табд (`kind !== 'plan'`)
       холбохгүй (дээрх `PlanKind` тайлбар: «гэрээ нь гинжээр хөдөлдөггүй»). */
    if (!canEdit || locked || busy || kind !== 'plan') return;
    e.preventDefault();
    e.stopPropagation();
    if (r.des == null) {
      setErr(tr('Энэ ажилд код алга — хамаарлын урд ажил болж чадахгүй.'));
      return;
    }
    const lanes = lanesRef.current;
    if (!lanes) return;
    const pos = (ev: { clientX: number; clientY: number }) => {
      const b = lanes.getBoundingClientRect();
      return { x: ev.clientX - b.left, y: ev.clientY - b.top };
    };
    setSel(r.oid);
    setErr('');
    setLink({ i: r.i, ...pos(e) });
    const mv = (ev: PointerEvent) => setLink({ i: r.i, ...pos(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setLink(null);
      if (ev.type === 'pointercancel') return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-row]') as HTMLElement | null;
      let ti = el ? Number(el.dataset.row) : NaN;
      /* ⚠️ (2026-09-23) `elementFromPoint` нь сум (`depHit`), түр шугам, огнооны
         толгой мэт `[data-row]`-гүй элемент дээр тусвал `null` болж чимээгүй
         унадаг байв. Нөөц зам: мөрийн өндөр ТОГТМОЛ (`PL_ROW`) тул Y координатаас
         `visible[k]`-г шууд олно — зурвасын эгнээний дотор л байхад хангалттай. */
      if (!Number.isInteger(ti)) {
        const b = lanes.getBoundingClientRect();
        const x = ev.clientX - b.left;
        const k = Math.floor((ev.clientY - b.top) / PL_ROW);
        if (x >= 0 && x <= b.width && k >= 0 && k < visible.length) ti = visible[k].i;
      }
      /* ⚠️ (2026-09-23) Өөр дээрээ тавибал ЧИМЭЭГҮЙ (санамсаргүй суллалт);
         мөр олдохгүй бол дохио — урьд нь юу ч болоогүй мэт байв. */
      if (ti === r.i) return;
      const t = Number.isInteger(ti) ? plan[ti] : undefined;
      if (!t) { setErr(tr('Хамаарал холбогдсонгүй — хуанлийн мөр (зурвасын эгнээ) дээр тавина уу.')); return; }
      /* ⚠️ Батлагдаагүй нэмэлт мөр (2026-09-24) — кодгүй, серверт байхгүй; уялдаа тавихгүй */
      if (t.oid < 0) { setErr(tr('Энэ мөр батлагдаагүй нэмэлт ажил — батлагдсаны дараа уялдаа тавина.')); return; }
      if (hierRelated(plan, ti, r.i)) { setErr(tr('Өөрийн бүлэг/дэд ажилтайгаа холбож болохгүй — гинжин эргэлт үүснэ.')); return; }
      /* ⚠️ ДУГУЙ ХАМААРЛЫГ ЭНД (2026-09-23): урьд нь зөвхөн `applyModal`-д
         шалгагддаг тул хэрэглэгч цонхонд төрөл/хоногоо бөглөж «Тавих» дарсны
         ДАРАА л «дугуй» гэж няцаагддаг байв. Одоо суллахад шууд — цонх нээгдэхгүй.
         Чиглэл `applyModal`-тай ижил: хамаарагч (`t`) → урд ажил (`r`). */
      if (t.des != null && reaches(plan, byCode, t.des, r.des as number /* дээр `r.des == null` таслагдсан */)) {
        setErr(tr('Дугуй хамаарал үүсэх тул холбож болохгүй.'));
        return;
      }
      /* ⚠️ Шууд тавихгүй — цонх нээж төрөл (дуусаад / зэрэг эхлэх) ба хоногийг
         асууна (2026-09-22, хэрэглэгч: «чирээд холбосны дараа … цонх гарах ёстой»).
         Аль хэдийн холбогдсон бол цонх нь тэр уялдааг ЗАСНА (давхардуулахгүй). */
      /* ⚠️ БЛОК ТУС БҮРИЙН уялдаа (2026-09-24): чирж холбосон хамаарал зөвхөн
         ИДЭВХТЭЙ блокт (`@N`). Синтетик ганц блоктой багцад блокгүй — `@` гарахгүй. */
      /* ⚠️ 2026-09-25 аудит: энэ хосод БЛОКГҮЙ (бүх блок) уялдаа аль хэдийн байгаа
         бөгөөд `@N` уялдаа байхгүй бол ТЭРИЙГ засна — урьд нь `@N` нэмэгдэж, тэр
         блокт хоёр уялдаа (давхар шилжилт) үүсдэг байв. */
      /* ⚠️ ОЛОН БЛОК (2026-10-01): «олон блокт зэрэг төлөвлөх» асаалттай бол
         идэвхтэй блок + `gBlks` бүгдэд — огноо (`PlanModal.initSel`)-той ижил хүрээ.
         БҮХ блок сонгогдвол блокгүй НЭГ уялдаа (`collapse`) — 22 ширхэг `@N` биш. */
      const tb = sc?.synthetic || n === 1
        ? null
        : [...new Set([blk, ...gBlks])].filter((k) => k >= 0 && k < n).sort((a, b) => a - b);
      const all = tb != null && tb.length >= n;
      const dblks0 = tb == null || all ? null : tb;
      const rd = r.des as number;
      const hasExact = dblks0 != null && dblks0.some((b) => t.deps.some((d) => sameDep(d, { code: rd, blk: b })));
      const hasAll = t.deps.some((d) => sameDep(d, { code: rd, blk: undefined }));
      setLinkAsk({
        so: r.oid,
        to: t.oid,
        dblks: dblks0 != null && !hasExact && hasAll ? null : dblks0,
        ...(all ? { collapse: true as const } : {}),
      });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * Мөрийн ИДЭВХТЭЙ БЛОКИЙН муж — бүлэгт хүүхдээс (`effSpan`), ажилд өөрийнх.
   * ⚠️ (2026-09-23) Урьд нь бүх блокийн MIN/MAX (`rowSpan`) байсан тул зүүн
   *    самбарын огноо нь зурвас ба «Бодит» баганаас (идэвхтэй `blk`) зөрдөг байв.
   *    Хуваарьгүй блок → `null` → «—» (0 БИШ) хэвээр.
   */
  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): ИДЭВХТЭЙ БЛОКИЙН `effSpan`-ыг `plan`×`blk`-д КЭШЛЭНЭ.
     Нэг зурагдалтад ижил бүлгийн муж зүүн мөр (`rowSpanAt`) · баруун зурвас · уялдааны сум
     (урд ба хамаарагч) гэж 3–4 удаа, тус бүр бүх дэд модоор бодогддог байв. Утга ЯГ ИЖИЛ
     (`effSpan`-ийн цэвэр үр дүн), `plan`/`blk` солигдоход кэш шинээр. */
  const effAt = useMemo(() => lazyCache((i: number): Span | null => effSpan(plan, i, blk)), [plan, blk]);
  const rowSpanAt = useCallback((r: PlanRow): Span | null => (
    r.group ? effAt(r.i) : (r.spans[blk] ?? null)
  ), [effAt, blk]);
  /** Нөгөө төрлийн (гэрээ ↔ төлөвлөгөө) мөрийн идэвхтэй блокийн муж — дээрхтэй ижил дүрэм */
  const refSpanAt = useCallback((oid: number): Span | null => {
    const rr = refByOid.get(oid);
    if (!rr) return null;
    return rr.group ? effSpan(refBase, rr.i, blk) : (rr.spans[blk] ?? null);
  }, [refByOid, refBase, blk]);
  /**
   * «Бүх блок» горимын нөгөө төрлийн муж (2026-10-04): `b ≥ 0` — тэр блокийнх
   * (`refSpanAt`-ийн дүрэм), `b < 0` — бүх блокийн НЭГДЭЛ (эх мөрд).
   */
  const refSpanOf = useCallback((oid: number, b: number): Span | null => {
    const rr = refByOid.get(oid);
    if (!rr) return null;
    if (b >= 0) return blockSpan(refBase, rr, b);
    return unionSpans(rr.spans.map((_, k) => blockSpan(refBase, rr, k)));
  }, [refByOid, refBase]);

  const applyHamText = useCallback((oid: number, text: string) => {
    /* ⚠️ Хадгалалт явж байхад бичсэн уялдаа чимээгүй алга болдог байв (2026-09-23
       аудит) — одоо мэдэгдэнэ; нүд нь хадгалсан утга руугаа буцна. */
    if (busy) { setErr(tr('Хадгалж байна — түр хүлээгээд уялдааг дахин оруулна уу.')); return; }
    /* ⚠️ 2026-09-29 аудит: уялдаа ЗӨВХӨН төлөвлөгөөнд — гэрээний огноо гинжээр хөдөлдөггүй */
    if (locked || !canEdit || kind !== 'plan') return;
    const cur = plan.find((x) => x.oid === oid);
    if (!cur) return;
    const next = parseDeps(text);
    /* Өөрчлөгдөөгүй бол дэмий тархалт хийхгүй — 1,400 мөрийн `propagate`
       нь хямд биш, мөн «хадгалаагүй» тэмдэг худал асахгүй. */
    if (formatDeps(next) === formatDeps(cur.deps)) return;
    setErr('');
    applyModal(oid, null, next, null);
  }, [busy, locked, canEdit, kind, plan, applyModal, setErr]);

  /**
   * ОГНООГ НҮДЭНД ШУУД БИЧИХ (2026-10-05, хэрэглэгч: «огноо дээр дарж бичиж
   * төлөвлөх»). Идэвхтэй табын (`kind`) ИДЭВХТЭЙ блокийн (`blk`) эхлэх/дуусах.
   *
   * ⚠️ Дүрэм нь popup-ын `onStart`-тай ИЖИЛ: эхлэхийг бичихэд үргэлжлэх хоног
   *    ХАДГАЛАГДАЖ дуусах дагаж шилжинэ; дуусахыг бичихэд эхлэх хэвээр. Хуваарьгүй
   *    блокт аль нэгийг бичвэл 1 хоногийн муж (start = end).
   * ⚠️ БҮХ үр дагавар `applyModal`-аар (гинж `propagate` · бүлгийн нэгтгэл · сарын
   *    задаргаа · ноорог) — энд ДАВХАРДУУЛАХГҮЙ. Бүлэг/нэмэлт мөр тэнд ч хаалттай.
   * ⚠️ Дуусах < эхлэх бол ТАВИХГҮЙ — чимээгүй солихгүй, мэдэгдэнэ.
   * ⚠️ 2026-10-06: `which === 'days'` — ҮРГЭЛЖЛЭХ ХОНОГ бичих (`day` = тоо): эхлэх
   *    хэвээр, дуусах = эхлэх + N − 1 (`endOf`). Хуваарьгүй блокт эхлэх огноо байхгүй
   *    тул тавихгүй, мэдэгдэнэ.
   */
  /**
   * ОГНОО ТАВИСНЫ ДАРАА ЗАСВАРЫН ЦОНХ ӨӨРӨӨ НЭЭГДЭНЭ (2026-10-06, хэрэглэгч: «start end
   * тавихад обьём болон хүн хүч бөглөх цонх автоматаар нээгддэг болго»). Чирэлтийн
   * дараа цонх аль хэдийн нээгддэг (`useDragPlan`); энэ нь нүдэнд бичих замынх.
   * ⚠️ ХОЁР табд — гэрээний табд ч нээнэ (хэрэглэгч: «Enter дархад цонх автоматаар
   *    нээгдэх ёстой»); тэнд сарын обьём байхгүй ч огноо · блок · үргэлжлэх хоногоо тэндээ
   *    шалгаж, «Тавих»-аар баталгаажуулна.
   * ⚠️ `undoRef` хөндөхгүй — бичсэн огноо ноорогт аль хэдийн орсон; цонхыг хаахад
   *    (`undoDragOnClose`) буцаах агшин байхгүй тул огноо ХЭВЭЭР үлдэнэ (чирэлтээс ялгаатай).
   */
  const openAfterDate = useCallback((oid: number) => {
    setSel(oid);
    setModal(oid);
  }, []);

  const applyDate = useCallback((oid: number, which: 'start' | 'end' | 'days', day: string) => {
    if (busy) { setErr(tr('Хадгалж байна — түр хүлээгээд огноог дахин оруулна уу.')); return; }
    if (locked || !canEdit) return;
    const cur = plan.find((x) => x.oid === oid);
    if (!cur || cur.group || oid < 0) return;
    const old = cur.spans[blk] ?? null;
    let next: Span;
    if (which === 'days') {
      const d = Number(day);
      if (!Number.isInteger(d) || d < 1) return;
      if (!old) { setErr(tr('Эхлэх огноо байхгүй — эхлээд эхлэх огноог бичнэ үү.')); return; }
      next = { start: old.start, end: endOf(old.start, d) };
      if (sameSpan(next, old)) return;
      setErr('');
      const sp = cur.spans.slice();
      while (sp.length < n) sp.push(null);
      sp[blk] = next;
      applyModal(oid, sp, null, null);
      openAfterDate(oid);
      return;
    }
    const ms = dayToMs(day);
    if (ms == null) return;
    if (!old) next = { start: ms, end: ms };
    else if (which === 'start') next = { start: ms, end: endOf(ms, spanDays(old)) };
    else {
      if (ms < old.start) { setErr(tr('Дуусах огноо эхлэх огнооноос өмнө байна — тавигдсангүй.')); return; }
      next = { start: old.start, end: ms };
    }
    if (sameSpan(next, old)) return;
    setErr('');
    const spans = cur.spans.slice();
    while (spans.length < n) spans.push(null);
    spans[blk] = next;
    applyModal(oid, spans, null, null);
    openAfterDate(oid);
  }, [busy, locked, canEdit, plan, blk, n, applyModal, setErr, openAfterDate]);

  /* ── Чирэлт ── */

  /* ══════════════ ХУВААЛЦСАН НООРОГ — ArcGIS дээр (2026-09-23; `useSharedDraft`) ══════════════
     ⚠️ Эндээс (чирэлт · хадгалалт · батлах урсгалаас ӨМНӨ) дуудна: тэдгээр нь
        энэ hook-ийн ref/функцүүдийг уншдаг. */
  const {
    hdSt, hdUsers, hdLabel, hdReadyKey, hdTimerRef, hdFlushRef, hdClearRef, hdSkipUnlockOnceRef,
    hdMapsRef, hdMeta, meRef, askSwitch, hdResetRestore, hdSubmitBegin, hdSubmitEnd, hdDiscard, hdUnsynced,
  } = useSharedDraft({
    kind, pkgKey: pkg.key, user, status, canEdit, locked, previewing, approving, pending,
    sc, rows, base, n, obPlan, obRes, obState, flowReady, dirtyN, dragging: drag != null,
    draft, ham, aDraft, resDraft, obDraft, obResDraft,
    setDraft, setHam, setADraft, setResDraft, setObDraft, setObResDraft, setNote, pkgKeyRef, hdRemapRef,
  });

  /* ── Чирэлтийн хөдөлгүүр (`useDragPlan`) ── */
  const { undoRef, onDown, onMove, onUp, onCancel, undoDragOnClose } = useDragPlan({
    plan, blk, n, applyChanges, canEdit, locked, busy, sc, obOf, obResOf, obDraft, obResDraft,
    setObDraft, setObResDraft, obPlan, obRes, drag, setDrag, setSel, setModal, dayAt, msAt, hdMeta, meRef,
  });

  /*
   * ⚠️ «Мужид жигд хуваарилах» ба «Хуваарь арилгах» товчнууд 2026-09-01-нд
   * ХАСАГДСАН (хэрэглэгчийн шийдвэр). Хоёулаа СОНГОСОН мөр дээр ажилладаг
   * байсан тул «аль мөр сонгогдсон бэ» гэдгийг санах шаардлагатай далд төлөв
   * үүсгэдэг байв. Арилгах нь одоо popup цонхонд («Арилгах») — тэнд ямар ажил,
   * ямар блокийг арилгаж байгаа нь ил харагдана.
   *
   * ⚠️ «Бүх блокт алхмаар тараах» товч 2026-09-02-нд ХАСАГДСАН (хэрэглэгч).
   * Тэр нь ХАРАГДАЖ БУЙ БҮХ мөрийн бүх блокийг нэг товшилтоор дарж бичдэг
   * байсан — шүүлт буруу тавьсан үед 264+ нүд чимээгүй устдаг эрсдэлтэй.
   * Тархаалт нь одоо popup хуанлид ҮЛДСЭН: тэнд НЭГ ажлын хүрээнд, ямар блок,
   * ямар алхмаар тархаж байгаа нь ил бөгөөд баталгаажуулалттай.
   */

  /* ── Хадгалах ── */

  /* ⚠️ БУЦААХ УТГА (2026-09-25 аудит): `true` = бичих алхам дууслаа (ноорог
     цэвэрлэгдсэн/тэнцээгүйг үлдээсэн), `false` = ЭХЛЭЭГҮЙ эсвэл УНАСАН (ноорог
     бүтнээрээ үлдэв). Батлах эффект `busy`-ийн хөдөлгөөнөөс биш, үүнээс мэднэ. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!sc || !dirtyN || busy) return false;
    setBusy(true); setErr(''); setNote('');
    /* ⚠️ Ноорогоо ОДОО барьж авна: async явцад орсон (онолын хувьд —
       оролтууд busy-д хаалттай ч) шинэ засварыг төгсгөлд нь УСТГАХГҮЙН тулд
       зөвхөн эдгээр түлхүүрийг цэвэрлэнэ. */
    const tookD = [...draft.keys()];
    const tookH = [...ham.keys()];
    const tookA = [...aDraft.keys()];
    const tookR = [...resDraft.keys()];
    try {
      /* ⚠️ Бэлтгэл (`upd` · `obEdits` · тоолуурууд) — `huvaari/savePrep.ts`, ЮУ Ч БИЧИХГҮЙ */
      const prep = await prepareSave({ sc, kind, pkg, rows, base, draft, ham, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, obOids });
      if (!prep.ok && prep.hamLong) {
        /* ⚠️ 2026-10-04 (шүүлт): уялдааны текст `Hamaaral`-д багтахгүй — тайрахгүй, бичихгүй */
        setErr(tr('{0} мөрийн уялдааны бичиглэл {1} тэмдэгтээс урт тул хадгалагдсангүй. Блок тус бүрийн уялдааг цөөлөх эсвэл бүх блокт нэг уялдаа болгоно уу.', num(prep.hamLong), String(HAM_MAX)));
        return false;
      }
      if (!prep.ok) {
        setErr(tr('{0} мөр энэ хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Хуваарь бичигдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(prep.stale)));
        return false;
      }
      const { upd, obEdits, unbal, unbalKeys, resSkipped, resSkippedKeys, resDropped, rfUnknown, obLost, grpSkipped } = prep;
      let obN = 0;
      /*
       * ⚠️ БАТЛАХ ГОРИМД БҮХ ШАЛГУУР БИЧИХЭЭС ӨМНӨ (2026-09-25 аудит). Урьд нь огноо
       *    (`applyUpdates`) бичигдсэний ДАРАА л тэнцээгүй задаргаа (`unbal`) ба
       *    талбаргүй нөөц (`resSkipped`/`rfUnknown`) илэрч, санал ХАГАС бичигдээд
       *    `pending` хэвээр үлддэг байв — дараагийн оролдлого «зэрэгцээ өөрчлөлт»-д
       *    унана. Батлалт = бүгд эсвэл юу ч үгүй; энгийн хадгалалт хуучин зан төлөвтэй.
       */
      const approvalMode = approving != null;
      /* ⚠️ 2026-10-01: `obLost` (ажил хуудсанд олдоогүй сарын задаргаа) ч мөн — урьд нь
         задаргаа нь чимээгүй хаягдаж батлалт АМЖИЛТТАЙ болдог байв. `grpSkipped` БИШ:
         бүлгийн мөр санаатай хөндөгдөхгүй (`savePrep`-ийн ⚠️). */
      if (approvalMode && (unbal || resSkipped || obLost || (rfUnknown && obResDraft.size > 0))) {
        const why: string[] = [];
        if (unbal) why.push(tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй', num(unbal)));
        if (resSkipped || rfUnknown) why.push(tr('сарын хүн хүч/машины талбар шалгагдсангүй эсвэл алга'));
        if (obLost) why.push(tr('{0} ажил·блокийн сарын задаргааны ажил хуудсанд олдсонгүй', num(obLost)));
        setErr(tr('Батлах боломжгүй — {0}. Эх хуудсанд юу ч бичигдсэнгүй; илгээлт хүлээгдэж буй хэвээр.', why.join(' · ')));
        return false;
      }
      if (!upd.length && !obDraft.size && !obResDraft.size) {
        setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
        setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
        setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
        setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
        setNote(tr('Өөрчлөлт олдсонгүй — хуваарь хэвээрээ.'));
        return true;
      }
      /*
       * ⚠️ АГШИН СОЛИГДСОН ЭСЭХ (2026-08-29). «Гүйцэтгэл бөглөх» нийтлэх бүрд
       * хуудсыг БҮТНЭЭР шинэ хуулбар болгож нэмдэг тул энд ачаалсан OBJECTID-ууд
       * ХУУЧИН хуулбарынх болж болно. Тэр OID руу бичвэл огноо нь хаягдсан
       * хуулбарт чимээгүй үлдэж, дараагийн нийтлэлд ч алга болно — төлөвлөлтийн
       * бүхэл сесс алдагдана. Тиймээс хадгалахын өмнө СҮҮЛИЙН агшныг дахин
       * татаж, мөр бүрийг (№ + ажлын нэр)-ээр шинэ OID руу зөөнө.
       */
      const fresh = await loadRows(pkg, sc);
      let remapped = 0;
      let lost = 0;
      /* ⚠️ Жааз солигдсоныг ЭХНИЙ мөрөөр ЭСВЭЛ бичих oid-ын аль нэг нь шинэ агшинд
         алга болсноор мэднэ (2026-09-25 аудит). */
      const freshOids = new Set(fresh.rows.map((r) => r.oid));
      if (fresh.rows[0]?.oid !== rows[0]?.oid || upd.some((a) => !freshOids.has(a[sc.f.oid] as number))) {
        /* ⚠️ `remapOids` (эцэг бүлгийн зам › № ¦ нэр, давхардлыг дарааллаар) — 2026-09-25
           аудит: урьд нь (№ ¦ нэр) + ОЙРЫН ИНДЕКС гэсэн сул түлхүүр ижил нэртэй өөр
           блокийн мөр рүү огноо зөөдөг байв. «Шинэчлэх» замтай НЭГ дүрэм. */
        const map = remapOids(rows, fresh.rows);
        const moved2: Record<string, unknown>[] = [];
        for (const a of upd) {
          const nk = map.get(a[sc.f.oid] as number);
          if (nk == null) { lost += 1; continue; }
          moved2.push({ ...a, [sc.f.oid]: nk });
          remapped += 1;
        }
        /* ⚠️ БАТЛАХ ГОРИМД алдагдсан мөртэй бол ЮУ Ч БИЧИХГҮЙ (2026-09-25 аудит) — урьд нь
           үлдсэнийг бичээд «батлагдлаа» гэж үргэлжилж, алдагдсан мөрийн санал ор мөргүй
           алга болдог байв. */
        if (lost && approvalMode) {
          setErr(tr('{0} мөр шинэ агшинд олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Эх хуудсанд юу ч бичигдсэнгүй; буцааж, зохиогч дахин илгээнэ.', num(lost)));
          return false;
        }
        upd.length = 0;
        upd.push(...moved2);
      }
      /*
       * ⚠️ БИЧИХИЙН ЯГ ӨМНӨ ИЛГЭЭЛТИЙН ТӨЛВИЙГ ДАХИН УНШИНА (2026-10-01, хэрэглэгч: бүгдийг
       *    зас). `decide` түгжсэнээс хойш (бэлтгэл · агшин дахин татах · сүлжээ удаан,
       *    түгжээ 10 мин) зохиогч ТАТАХ эсвэл өөр батлагч ШИЙДЭХ боломжтой байсан — тэр
       *    үед «татсан/буцаагдсан» санал эх хуудсанд суудаг байв. `approveGuard` нь
       *    шалтгааныг ИЛ хэлнэ; эх хуудас ба сарын обьём ХОЁУЛАА бичигдэхгүй (батлах
       *    эффект түгжээг тайлж, урьдчилан харалт руу буцаана).
       */
      if (approvalMode) {
        const head = await loadSubmissionHead(approving);
        const why = approveGuard(head, approving, user?.username ?? '');
        if (why) { setErr(why); return false; }
        /* ⚠️ ХАГАС БИЧИЛТИЙН ТЭМДЭГ — АНХНЫ бичилтээс ӨМНӨ (2026-10-01). Урьд нь `partialRef`
           зөвхөн «огноо + сарын обьём» хоёулаа бичигдэх үед, огноо бичигдсэний ДАРАА тавигдаж,
           `decidePlan`-аас ӨМНӨ арилдаг байв: бүгд бичигдээд `decidePlan` унавал (эсвэл зөвхөн
           огноотой санал) батлагч «Буцаах» дарж, эх хуудсанд суусан саналыг буцаадаг байв.
           Одоо: сервер дээрх тэмдэг (`markPlanPartial`, хуудас сэргээсэн ч, `CLAIM_TTL`-ийн
           дараа ч хэвээр) + `partialRef` хоёулаа ЭНД тавигдаж, ЗӨВХӨН `decidePlan(approve)`
           амжилттай болоход арилна. Тэмдэг бичигдээгүй бол ЮУ Ч бичихгүй (fail-closed). */
        if (upd.length || obEdits) {
          const mk = await markPlanPartial({ oid: approving, approver: user?.username ?? '' });
          if (!mk.ok) {
            setErr(tr('Хагас бичилтийн хамгаалалтын тэмдэг хадгалагдсангүй ({0}) — эх хуудсанд юу ч бичигдсэнгүй; дахин оролдоно уу.', mk.error ?? ''));
            return false;
          }
          partialRef.current = approving;
        }
      }
      if (upd.length) {
        try {
          await applyUpdates(pkg, upd);
        } catch (e) {
          /* ⚠️ НЭГ Ч мөр бичигдээгүй (эхний 500-ийн багц бүтнээрээ буцсан) бол хагас бичилт
             БИШ — тэмдгийг арилгана (2026-10-01): эс бөгөөс бичилт дахин дахин унахад санал
             буцаах/татах боломжгүй мөнхөд түгжигддэг байв. Нэг ч мөр бичигдсэн бол тэмдэг ҮЛДЭНЭ. */
          if (approvalMode && (e as { written?: number })?.written === 0 && partialRef.current === approving) {
            if (await clearPlanPartial(approving)) partialRef.current = null;
          }
          throw e;
        }
      }

      /*
       * ── САРЫН ОБЬЁМ — ТУСДАА ҮЙЛЧИЛГЭЭ (бичилт; бэлтгэл нь дээр) ─────
       * ⚠️ Хуваарийн огноо бичигдсэний ДАРАА: задаргаа нь огноон дээр
       *    тогтдог тул огноо нь бичигдээгүй байхад задаргаа үлдвэл хоёр
       *    эх сурвалж зөрнө.
       */
      if (obEdits) {
        /* ⚠️ ДАВХАРДСАН мөрийн ИЛҮҮДЛИЙГ хамт арилгана (2026-09-08): `dkey`-д
           сангийн unique индекс байхгүй тул зэрэг хадгалалт ижил түлхүүртэй
           хоёр мөр үлдээж чадна. `buildEdits` нь `obOids`-оос ЗӨВХӨН нэг OID
           авдаг тул илүүдэл нь өөрөө хэзээ ч устахгүй. */
        for (const d of obDups) if (!obEdits.deletes.includes(d)) obEdits.deletes.push(d);
        let r2: [number, number, number];
        try {
          r2 = await applyPlanEdits(obEdits);
        } catch (e) {
          /* ⚠️ 2026-09-29 аудит: огноо БИЧИГДСЭН, задаргаа ДУНДАА унасан (жиш. 2 дахь
             500-ийн багц) — `rows`/`obOids` сэргээгээгүй бол дахин «Хадгалах»-д амжсан
             `adds` ДАХИН нэмэгдэж `dkey` давхардана (сангийн unique индекс алга).
             Эх мөр ба задаргааг серверээс дахин татаад л алдааг дамжуулна. */
          /* ⚠️ 2026-10-05: огнооны замын (дээрх) ижил дүрэм — огноо БИЧИГДЭЭГҮЙ (`upd` хоосон) ба
             сарын обьёмоос НЭГ Ч мөр бичигдээгүй (`written === 0`) бол хагас бичилт БИШ: тэмдгийг
             арилгана, эс бөгөөс санал буцаах/татах боломжгүй түгжигддэг байв. */
          if (approvalMode && !upd.length && (e as { written?: number })?.written === 0 && partialRef.current === approving) {
            if (await clearPlanPartial(approving)) partialRef.current = null;
          }
          try {
            const r0 = await loadRows(pkg, sc);
            setRows(r0.rows);
            const fr = await loadPkgPlan(pkg.key);
            setObPlan(fr.plan); setObRes(fr.res); setObOids(fr.oids); setObDups(fr.dups); setObState('ok');
          } catch { setObState('fail'); }
          throw e;
        }
        obN = r2[0] + r2[1] + r2[2];
      }
      /* ⚠️ 2026-10-01: `partialRef`-ийг ЭНД АРИЛГАХГҮЙ — бүх хэсэг бичигдсэн ч `decidePlan`
         унавал санал эх хуудсанд суусан атлаа `pending` хэвээр; батлах эффект `decidePlan`
         амжилттай болсны ДАРАА л арилгана. */

      const r = await loadRows(pkg, sc);
      setRows(r.rows);
      setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
      setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
      setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
      setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
      /* ⚠️ Обьёмын ноорогийг ЦЭВЭРЛЭЖ, задаргааг СЕРВЕРЭЭС дахин татна —
         бичилтийн дараа ObjectID шинээр үүссэн тул хуучин `obOids` хуучирсан.
         ⚠️ ТЭНЦЭЭГҮЙ задаргааг ҮЛДЭЭНЭ (2026-09-08): бичигдээгүй атлаа
            ноорогоос устгавал хүн юуг дахин бөглөхөө мэдэхгүй үлдэнэ. */
      if (unbal) {
        setObDraft((m0) => {
          const m = new Map<string, Map<string, number>>();
          const byDes = new Map(base.map((r) => [r.des, r]));
          for (const [k, months] of m0) {
            const des = Number(k.slice(0, k.indexOf('|')));
            const v = byDes.get(des)?.vol;
            if (months.size && v != null && v > 0 && !balanced(months, v)) m.set(k, months);
          }
          return m;
        });
      } else {
        setObDraft(new Map());
      }
      /* Сарын нөөцийн ноорог — тэнцээгүй (бичигдээгүй) ба талбаргүй тул алгассан
         блокийнхыг үлдээнэ (2026-09-24) — батлалт `dirtyN > 0`-д зогсоно. */
      setObResDraft((m0) => {
        const m = new Map<string, Map<string, MonthRes>>();
        for (const [k, v] of m0) if (unbalKeys.has(k) || resSkippedKeys.has(k)) m.set(k, v);
        return m;
      });
      try {
        const fresh2 = await loadPkgPlan(pkg.key);
        setObPlan(fresh2.plan);
        setObRes(fresh2.res);
        setObOids(fresh2.oids);
        setObDups(fresh2.dups);
        setObState('ok');
      } catch { /* задаргаагүйгээр үргэлжилнэ */ }
      setNote(remapped
        ? tr('{0} ажлын хуваарь хадгалагдлаа — хуудас хооронд нь шинэчлэгдсэн тул шинэ агшинд зөөв', num(upd.length))
        : obN
          ? tr('{0} ажлын хуваарь · {1} сарын обьём хадгалагдлаа', num(upd.length), num(obN))
          : tr('{0} ажлын хуваарь хадгалагдлаа', num(upd.length)));
      /* ⚠️ Алдаануудыг НЭГТГЭЖ нэг удаа (2026-09-24 аудит) — дараалсан `setErr`-д
         сүүлийнх л үлдэж, өмнөх (алдагдсан мөр, тэнцээгүй задаргаа) далдлагддаг байв. */
      const errs: string[] = [];
      if (lost) errs.push(tr('{0} мөр шинэ агшинд олдсонгүй — тэдгээрийн хуваарь хадгалагдсангүй.', num(lost)));
      /* ⚠️ Тэнцээгүй задаргааг ИЛ хэлнэ — эс бөгөөс «хадгалагдлаа» гэсэн
         мэдэгдэл нь бичигдээгүй обьёмыг далдална. */
      if (unbal) {
        errs.push(tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй тул хадгалагдсангүй — хуваарь шилжихэд мужаас гарсан сарууд хасагдсан байна. Тухайн ажлын цонхыг нээж дахин бөглөнө үү.', num(unbal)));
      }
      /* ⚠️ Талбар байхгүй бол ЧИМЭЭГҮЙ алгасахгүй — админ AGOL дээр нэмнэ (2026-09-24) */
      if (resSkipped && rfUnknown) {
        errs.push(tr('Сарын хүснэгтийн хүн хүч/машин талбарыг шалгаж чадсангүй — {0} ажил·блокийн сарын нөөц хадгалагдсангүй. Дахин оролдоно уу.', num(resSkipped)));
      } else if (resSkipped) {
        errs.push(tr('{0} ажил·блокийн сарын хүн хүч/машин механизм хадгалагдсангүй — сарын хүснэгтэд «hun_huch»/«mashin_mehanizm» талбар алга. Админ AGOL дээр нэмнэ үү.', num(resSkipped)));
      }
      /* ⚠️ Мужаас гадуурх сарын нөөц хаягдсаныг ил хэлнэ (2026-09-24 аудит) */
      if (resDropped) {
        errs.push(tr('{0} ажил·блокийн мужаас гадуурх сарын хүн хүч/машин хаягдлаа — обьёмгүй сард мөр байхгүй.', num(resDropped)));
      }
      if (obLost) {
        errs.push(tr('{0} ажил·блокийн сарын задаргааны ажил хуудсанд олдсонгүй — тэр задаргаа хадгалагдсангүй, дахин бөглөнө үү.', num(obLost)));
      }
      /* ⚠️ 2026-10-01: бүлгийн сарын ноорог алгасагдсаныг ил хэлнэ (`savePrep`-ийн ⚠️) */
      if (grpSkipped) {
        errs.push(tr('{0} бүлгийн сарын задаргаа бичигдсэнгүй — сарын обьём бүлэгт биш, доторх ажил тус бүрт хуваана.', num(grpSkipped)));
      }
      if (errs.length) setErr(errs.join(' · '));
      return true;
    } catch (e) {
      setErr(userError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [sc, draft, ham, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, obOids, obDups, base, dirtyN, busy, pkg, rows, kind, approving, user,
    setBusy, setErr, setNote, setDraft, setHam, setADraft, setResDraft, setRows, setObPlan, setObRes, setObOids, setObDups, setObState, setObDraft, setObResDraft]);

  /* ══════════════ БАТЛАХ УРСГАЛ ══════════════
   * ⚠️ Гүйцэтгэгч ЗОХИОНО → «Батлуулах» → батлагч БАТАЛНА → тэр үед л эх
   *    хуудсанд бичигдэнэ. Батлагдтал эх хуваарь ХӨДЛӨХГҮЙ тул тайлан,
   *    хоцрогдлын дохио тогтвортой (2026-09-07, хэрэглэгчийн шийдвэр).
   */

  /**
   * ⚠️ ХОЦОРСОН ХАРИУГ ХАЯНА (2026-09-16 аудит). Урьд нь багц солигдоход
   *    хуучин багцын хүсэлт `pending`-ийг ДАРЖ бичдэг байв: дараалалаас
   *    үсрэхэд эхний багцын хариу зорилтот багцынхыг түрүүлж ирж, jump
   *    эффект «аль хэдийн шийдвэрлэгдсэн» гэсэн ХУДАЛ алдаа өгдөг байлаа.
   *    Одоо хүсэлт бүр дугаартай — сүүлийнхээс бусдын хариу үл тоомсорлогдоно.
   *    Мөн эхлэхэд `flowReady`/`pending`-ийг ЦЭВЭРЛЭНЭ — jump эффект `null`-ийг
   *    «хараахан ачаалаагүй» гэж уншдаг тул зөв хүлээнэ.
   *
   * ⚠️ tezu-bonu салбар ЯГ ИЖИЛ согогийг зэрэг зассан (багцын түлхүүрээр
   *    хаах). Тэндхийн нэмэлт ойлголт: хоцорсон хариу нь зөвхөн худал алдаа
   *    биш — хуанли Б-г, шийдвэрлэх цонх А-г харуулж, «Батлах» дарахад БУРУУ
   *    илгээлт батлагддаг байв. Дугаараар хаах нь түлхүүрээс өргөн (ижил
   *    багцын давхар дуудлагыг ч барина) тул ганц механизм үлдээв.
   */
  const flowSeq = useRef(0);
  /** Сүүлд ачаалсан хүлээгдэж буй илгээлт (багцын түлхүүртэй) — алга болсныг илрүүлэхэд (2026-09-25) */
  const flowPendRef = useRef<{ key: string; oid: number | null }>({ key: '', oid: null });
  /* ⚠️ `refetchServer` нь `rows`-оос хамаардаг тул шууд deps-д оруулбал мөр
     солигдох бүрд урсгал дахин татагдана — ref-ээр уншина. (2026-09-30: `refetchServer`-ээс
     ӨМНӨ зарлав — `refreshFlow` ч уншдаг; жинхэнэ утга нь `refetchServer`-ийн доорх
     эффектээр тавигдана. Анхны утга нь зөвхөн mount-ын эффект ажиллах хүртэлх орлуулагч —
     `refetchRef.current()` ямар ч зам дээр `await`-ийн ДАРАА л дуудагддаг.) */
  const refetchRef = useRef<() => Promise<{ rows: SheetRow[]; plan: PkgPlan; res: PkgRes }>>(
    async () => ({ rows: [], plan: new Map(), res: new Map() }),
  );
  /** Хүлээгдэж буй илгээлт ба хүснэгтийн бэлэн байдлыг татна */
  /* ⚠️ `noRefetch` — дуудагч мөрийг дөнгөж серверээс татсан/татах бол (батлах гинж,
     татах) давхар ачаалахгүй (2026-09-25). */
  const refreshFlow = useCallback(async (opt?: { noRefetch?: boolean }) => {
    const my = ++flowSeq.current;
    const key = pkg.key;
    const live = () => my === flowSeq.current && key === pkgKeyRef.current;
    /* ⚠️ 2026-09-25 аудит: ИЖИЛ багцын `pending`-ийг ачаалалт дуустал ҮЛДЭЭНЭ —
       урьд нь `null` болгож, завсарт `locked`/хуваалцсан нооргийн хаалт түр
       тайлагдаж (засвар · сэргээлт · «Батлуулах» идэвхждэг) байв. Өөр багцынхыг арилгана. */
    setFlowReady(null); setPending((p0) => (p0 && p0.pkgKey === key ? p0 : null)); setLastDecision(null);
    try {
      const st = await planTableState(status === 'off' || roleForUser(user?.username) === 'super');
      if (!live()) return;
      const ready = st.ok;
      /* ⚠️ `flowReady=true`-г `pending`-тэй НЭГ зурагдалтад тавина (2026-09-25,
         хөтчийн туршилтаар илэрсэн): урьд нь `loadPending`-ээс ӨМНӨ тавьдаг тул
         `flowReady=true, pending=null` гэсэн завсрын зурагдалт гарч, хяналтын
         горим (ба `jump`) хүлээгдэж буй илгээлтийг «аль хэдийн шийдвэрлэгдсэн»
         гэж андуурдаг байв. Бэлэн бус үед л шууд. */
      if (!ready) setFlowReady(false);
      setFlowWhy(ready ? '' : (
        st.why === 'auth'
          ? tr('ArcGIS-д нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
          : st.why === 'owner'
            ? tr('Батлах хүснэгт БАЙНА, гэвч түүнийг үүсгэсэн хэрэглэгч танигдахгүй байна. AGOL дээр item-ийн эзнийг super админ руу шилжүүлнэ үү.')
            /* ⚠️ 2026-10-01: түүхий дэлгэрэнгүйг («Token Required») ойлгомжтой болгоно */
            : st.why === 'error'
              ? tr('Порталын хайлт амжилтгүй: {0}', friendlyError({ message: st.detail ?? '' }))
              : tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')
      ));
      const p = ready ? await loadPending(pkg.key) : null;
      if (!live()) return;
      setPending(p);
      if (ready) setFlowReady(true);
      /*
       * ⚠️ ХҮЛЭЭГДЭЖ БАЙСАН ИЛГЭЭЛТ АЛГА БОЛОВ (2026-09-25 аудит) — өөр хүн
       *    шийдсэн/татсан. Урьд нь зөвхөн урсгалын төлөв шинэчлэгддэг байв:
       *    (1) батлагчийн УРЬДЧИЛАН ХАРСАН агуулга «хадгалаагүй N» болж үлдэж,
       *    «Батлуулах» идэвхжин БУЦААГДСАН саналыг өөрийн нэрээр дахин илгээх
       *    боломжтой байв — харалтыг цэвэрлэнэ; (2) зохиогчийн хуудсанд
       *    «батлагдсан» гарсан атлаа хуанли хуучин огноотой үлддэг байв —
       *    серверээс мөр · задаргааг дахин татна.
       */
      if (ready) {
        const was = flowPendRef.current;
        flowPendRef.current = { key, oid: p?.oid ?? null };
        if (was.key === key && was.oid != null && was.oid !== (p?.oid ?? null)) {
          if (previewingRef.current) {
            setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
            setADraft(new Map()); setResDraft(new Map());
            setPreviewing(false);
          }
          /* ⚠️ 2026-09-29 аудит: ӨМНӨХ илгээлтийн ногоон/улаан тэмдэг ШИНЭ илгээлтэд
             үлдэхгүй — `markOf` шууд ногоон болгож, хараагүй мөр батлагдах байв. */
          setOkRows(new Set());
          if (!opt?.noRefetch) void refetchRef.current().catch(() => { /* дараагийн ачаалалтаар */ });
        }
      }
      /* ⚠️ Хүлээгдэж буй илгээлт БАЙХГҮЙ үед л сүүлийн шийдвэрийг үзүүлнэ —
         хоёуланг зэрэг харуулбал аль нь одоогийн байдал болох нь ойлгомжгүй. */
      const last = ready && !p ? ((await loadHistory(pkg.key, 1))[0] ?? null) : null;
      if (!live()) return;
      setLastDecision(last);
    } catch (e) {
      if (!live()) return;
      setFlowReady(false);
      /* ⚠️ 2026-10-01: шалтгааныг АНГИЛНА (эрх · нэвтрэлт · сүлжээ · хугацаа) — урьд нь ямар ч
         алдааг «сүлжээгээ шалгана уу» гэдэг тул 499/403-д хэрэглэгч буруу зүйл шалгадаг байв. */
      setFlowWhy(tr('Батлах урсгал уншигдсангүй: {0}', friendlyError(e)));
      /* ⚠️ 2026-09-29 аудит: ИЖИЛ багцын `pending`-ийг ҮЛДЭЭНЭ (дээрх эхлэлийн дүрэмтэй
         ижил) — урьд нь түр сүлжээний алдаанд `null` болгож `locked` тайлагдаж, засвар ·
         хуваалцсан ноорог нээгдээд, урсгал сэргэхэд гарах замгүй ноорог үлддэг байв. */
      setPending((p0) => (p0 && p0.pkgKey === key ? p0 : null));
      setLastDecision(null);
    }
  }, [pkg.key, user, status, pkgKeyRef, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setOkRows]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: `refreshFlow` нь ArcGIS-ээс уншихын өмнө `flowReady=null` (ачаалж байна) тавьдаг — гадаад эх сурвалжтай синк, санаатай
  useEffect(() => { void refreshFlow(); }, [refreshFlow]);

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТИЙГ 30 с ТУТАМ ШАЛГАНА (2026-09-29, хэрэглэгч: «буцаасан шалтгаан
   * зохиогчид харагдахгүй байна»). Урьд нь урсгал зөвхөн хуудас нээхэд уншигддаг тул
   * батлагч буцаасан/баталсан ч зохиогчийн нээлттэй хуудас «хүлээгдэж буй» хэвээр үлдэж,
   * шалтгаан ба буцсан ноорог хуудсаа дахин ачаалах хүртэл харагддаггүй байв.
   * ⚠️ ХӨНГӨН: зөвхөн `loadPending` (толгой). Төлөв өөрчлөгдсөн үед л `refreshFlow` —
   *    тэр нь `flowReady`-г түр `null` болгодог тул тогтмол дуудвал дэлгэц анивчина.
   * ⚠️ Батлах/урьдчилан харах/бичих явцад ба хяналтын горимд шалгахгүй.
   * ⚠️ 2026-09-29 (аудит 10): ЗОХИОГЧ өөрийн «Илгээсэн хуваарь»-ийг харж байхад (`viewSent`,
   *    зөвхөн харах) шалгалт ҮРГЭЛЖИЛНЭ — урьд нь `previewing` мөчлөгийг зогсоож, батлагчийн
   *    шийдвэр · буцаасан шалтгаан «Батлагдсан хуваарь» руу буцтал харагддаггүй байв.
   *    Өөрчлөгдвөл `refreshFlow` харалтыг өөрөө цэвэрлэнэ. Батлагчийн харалтад хэвээр үгүй.
   */
  const pollOkRef = useLatest(!review && pending != null && approving == null && (!previewing || isOwnSubmission) && !busy && flowReady === true);
  useEffect(() => {
    if (status === 'off') return undefined;
    const key = pkg.key;
    const id = window.setInterval(() => {
      if (document.hidden || !pollOkRef.current || pkgKeyRef.current !== key) return;
      const was = flowPendRef.current.oid;
      void loadPending(key).then((p) => {
        if (!pollOkRef.current || pkgKeyRef.current !== key) return;
        if ((p?.oid ?? null) !== was) {
          /* ⚠️ 2026-09-29 (аудит 10): харалт цэвэрлэгдэх тул «илгээсэн хуваарь харагдаж байна» мэдэгдэл худал болно */
          if (previewingRef.current) setNote('');
          void refreshFlow();
        }
      }).catch(() => { /* дараагийн мөчлөгт */ });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [pkg.key, status, refreshFlow, pkgKeyRef, pollOkRef]);

  /**
   * БАТЛАХ ДАРААЛААЛААС ШИЛЖИЖ ИРСЭН ХҮСЭЛТИЙГ ХЭРЭГЛЭНЭ (2026-09-16).
   *
   * ⚠️ ХОЁР ШАТТАЙ: эхлээд БАГЦЫГ солино, `refreshFlow` (дээрх эффект)
   *    `pending`-ийг хүргэтэл ХҮЛЭЭНЭ, дараа л цонхыг нээнэ. Шууд нээвэл
   *    зурагдалтын `flowBox === 'decide' && pending` хамгаалалт юу ч
   *    зурахгүй — товч дарсан атлаа ЮУ Ч болоогүй мэт харагдана.
   *
   * ⚠️ ХОЦОРСОН ШИЙДВЭР ӨӨРӨӨ ИЛЭРНЭ: `pending` нь өөр `oid`-тай (эсвэл
   *    `null`) бол зуур өөр батлагч шийдсэн гэсэн үг. Дуугүй өнгөрвөл
   *    батлагч хоосон хуудас хараад гайхна.
   *
   * ⚠️ `kind` (Төлөвлөгөө ↔ Гэрээ) табыг АВТОМАТААР СОЛИХГҮЙ — доорх
   *    `decide`-ийн дүрэм: «батлагч юу батлахаа ӨӨРӨӨ мэдэж байх ёстой».
   *    Табын зөрүүний алдаа зориулалтаараа гарна; дараалал нь `kind`-ыг
   *    мөр ба товчны `title`-д бичсэнээр түүнийг гайхалтай биш болгоно.
   */
  useEffect(() => {
    if (!jump) return;
    const target = PKGS.find((p) => p.key === jump.pkgKey);
    /* 1-р шат: багц соль — дараагийн тойрогт `pending` ирнэ */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: дарааллаас ирсэн `jump` хүсэлтийг хоёр шатаар (багц → pending) хэрэгжүүлэх — дээрх ⚠️-ийн дагуу санаатай эффект
    if (target && target.key !== pkg.key) { setPkg(target); return; }
    /* ⚠️ Багц СОЛИГДОЖ амжаагүй байж болно (`loadedPkg` биш, `pkg.key`-ээр
       шалгав) — `refreshFlow` ажиллаж дуустал `flowReady` нь `null` хэвээр. */
    if (flowReady === null) return;
    if (pending?.oid === jump.oid) {
      setFlowBox('decide');
      onJumpDone?.();
      return;
    }
    if (!target) {
      setErr(tr('Багцын түлхүүр бүртгэлд алга — «{0}».', jump.pkgKey));
      onJumpDone?.();
      return;
    }
    setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
    onJumpDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, pkg.key, pending, flowReady]);

  /** Ноорогийг илгээлтийн агуулга болгоно — гурван ноорог нэг дор */
  const buildPayload = useCallback(
    (): PlanPayload => buildPayloadOf({ draft, ham, aDraft, resDraft, obDraft, obResDraft, kind, base, rows, obPlan, obRes }),
    [draft, ham, aDraft, resDraft, obDraft, obResDraft, kind, base, rows, obPlan, obRes],
  );

  /** «Батлуулах» — эх хуудсанд ЮУ Ч бичихгүй, зөвхөн хүснэгтэд хүлээнэ */
  const sendForApproval = useCallback(async (userNote: string) => {
    /* ⚠️ Урьдчилан харж байхад ИЛГЭЭХГҮЙ (2026-09-25 аудит) — ноорог нь бусдын санал */
    if (!dirtyN || busy || previewing) return;
    /* ⚠️ ТЭНЦЭЭГҮЙ сарын задаргаатай илгээхийг ХОРИГЛОНО (2026-09-17) — дүрэм ба
       ⚠️ тайлбарууд `huvaari/util.unbalancedObyem`-д (2026-09-30: цэвэр функц,
       `obyemGate.check.mjs`-ээр тестлэгдэнэ). Цонх автоматаар нээхгүй — гинж олон
       мөр хөндөж болно; алдаанд тоо ба нэрийг нэрлэнэ. */
    {
      const { bad, names: list } = unbalancedObyem(plan, sc?.bld ?? [], obDraft, obPlan);
      if (bad > 0) {
        const shown = list.slice(0, 3).join(', ') + (list.length > 3 ? ` (+${num(list.length - 3)})` : '');
        setErr(tr('{0} ажлын сарын задаргаа обьёмтойгоо тэнцэхгүй байна (хоосон задаргаа = 0): {1}. Тухайн ажлын цонхыг нээж сараар тэнцүүлнэ үү.', num(bad), shown));
        return;
      }
    }
    /* ⚠️ ОДООГИЙН ХУУДАСТ БАЙХГҮЙ мөрийн ноороготой ИЛГЭЭХГҮЙ (2026-09-25 аудит):
       хуучин жаазын oid-той санал батлахад `save`-ийн `staleN`-д мөнхөд гацна.
       Нэмэлт ажлын түр мөр (`oid < 0`) ноорогт ордоггүй. */
    {
      const have = new Set(rows.map((r) => r.oid));
      const stale = new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()].filter((o) => !have.has(o)));
      if (stale.size) {
        setErr(tr('{0} мөрийн ноорог одоогийн хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Илгээгдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(stale.size)));
        return;
      }
    }
    setBusy(true); setErr(''); setNote('');
    /* ⚠️ 2026-10-04 аудит (HIGH): хуваалцсан ноорогийн мөчлөг · бичилтийг ЗОГСООЖ, илгээлтэд
       ОРОХ нүдний тэмдгийг `buildPayload`-тай НЭГ агшинд авна — цэвэрлэлт зөвхөн тэдгээрийг
       хаана; илгээх завсарт хамтрагчийн нэмсэн нүд алсад хэвээр (`useSharedDraft.hdClear`). */
    const hdMark = hdSubmitBegin();
    try {
      const r = await submitPlan({
        pkgKey: pkg.key,
        pkgGroup: pkg.group,
        author: user?.username ?? '',
        /* ⚠️ ЯЛГААТАЙ МӨР (`dirtyRows`), `dirtyN` БИШ — дараалал «N мөр» гэж
           харуулдаг тул сарын нүд тоолсон тоо түүнтэй зөрдөг байв (2026-09-23). */
        rowCount: dirtyRows,
        note: userNote,
        payload: buildPayload(),
      });
      /* ⚠️ Унасан ч урсгалыг сэргээнэ (2026-10-01) — өөр хүн түрүүлж илгээсэн бол түгжээ харагдана */
      if (!r.ok) { setErr(r.error ?? tr('Илгээгдсэнгүй.')); await refreshFlow(); return; }
      /* ⚠️ Ноорогийг ЦЭВЭРЛЭНЭ: агуулга нь одоо серверт хадгалагдсан тул
         локалд үлдээвэл гүйцэтгэгч дахин илгээх, эсвэл батлагдсаны дараа
         хуучин ноорог дахин бичигдэх эрсдэлтэй. */
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setFlowBox(null); setFlowTxt('');
      setBackMarks(null);
      setNote(tr('Хуваарь батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      /* ⚠️ ХУВААЛЦСАН НООРОГИЙГ ШУУД ЦЭВЭРЛЭНЭ (2026-09-24) — `refreshFlow`-оос
         ӨМНӨ: тэр `pending`-ийг тавьмагц бичих боломж хаагдаж, дифф→flush
         зам «цэвэрлэсэн» тэмдгийг хэзээ ч бичихгүй байв. */
      await hdClearRef.current(hdKey(kind, pkg.key), hdMark);
      await refreshFlow();
    } catch (e) {
      setErr(userError(e));
    } finally {
      /* `refreshFlow`-ийн ДАРАА — `pending` тавигдсан тул зогсоосон бичилт түгжээнд буцна */
      hdSubmitEnd();
      setBusy(false);
    }
  }, [dirtyN, dirtyRows, busy, previewing, pkg, user, buildPayload, refreshFlow, plan, sc, obDraft, obPlan, rows, draft, ham, aDraft, resDraft, kind, hdClearRef,
    hdSubmitBegin, hdSubmitEnd, setErr, setBusy, setNote, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setBackMarks]);

  /**
   * ИЛГЭЭГДСЭН АГУУЛГЫГ НООРОГТ БУУЛГАХ — урьдчилан харах ба батлах ХОЁУЛАА
   * үүнийг хэрэглэнэ (нэг зам — хоёр салаа бичвэл нэг нь чимээгүй хоцорно).
   */
  /**
   * Илгээлтийн агуулгыг ноорогт буулгана — БАТЛАХЫН ӨМНӨХ алхам.
   *
   * ⚠️ ТӨРӨЛ ЗӨРВӨЛ ТАТГАЛЗАНА (2026-09-11-ний аудитын S1). Илгээлт нь
   *    `kind`-ээ өөртөө агуулдаг; батлагчийн ХАРЖ БУЙ таб түүнээс өөр бол
   *    буулгахгүй, `false` буцаана. Эс бөгөөс `save` нь батлагчийн табаар
   *    талбар сонгодог тул ТӨЛӨВЛӨГӨӨНИЙ санал `…_geree_*` талбарт бичигдэж,
   *    гэрээний лавлагаа чимээгүй эвдэрнэ (эргүүлэх аргагүй).
   * ⚠️ Автоматаар таб СОЛИХГҮЙ: батлагч юу батлахаа ӨӨРӨӨ мэдэж байх ёстой.
   *    Дуудагч тал алдааг ил хэлж, зөв табыг нэрлэнэ.
   */
  /**
   * ⚠️ СУУРЬТАЙ ХАРЬЦУУЛНА (2026-09-21). Илгээлтэд `base` (илгээх үеийн
   *    серверийн утга) байвал:
   *      · зохиогчийн ХӨНДӨӨГҮЙ блок (`spans[b] === base[b]`) → ноорогт
   *        `curRows`-ын ОДООГИЙН утгыг тавина → `save` диффд орохгүй, хооронд
   *        нь батлагдсан бусдын өөрчлөлт хэвээр үлдэнэ;
   *      · зохиогчийн ЗАССАН блок дээр `base[b] !== сервер` → ЗЭРЭГЦЭЭ
   *        ӨӨРЧЛӨЛТ. Сонголт: ЗОГСООНО (`strict`), алгасахгүй — уялдаа ба
   *        сарын обьём нь тэр блокийн огноонд уягдсан тул хагас батлалт нь
   *        задаргааг огноогүй үлдээж, `planPctFromMonths` худал болно.
   *        Батлагч буцааж, зохиогч шинэ суурин дээр дахин илгээнэ.
   *    Суурьгүй (2026-09-21-ээс өмнөх) илгээлт → бүх блок «зассан», хуучин
   *    зан үйл. `strict: false` (зохиогч илгээлтээ ТАТАЖ ноорогт буулгах) —
   *    зөрчилтэй ч буулгана, тоог нь буцаана.
   * ⚠️ `curRows` параметрээр — дуудагч (`decide`) серверээс дөнгөж татсан
   *    мөрийг өгнө; state-ийн `rows` энэ тикт хуучин хэвээр.
   */
  /**
   * ⚠️ `curPlan` параметрээр (2026-09-21) — сарын задаргааны тулгалт ч мөн
   *    СЕРВЕРЭЭС дөнгөж татсан `loadPkgPlan`-тай; state-ийн `obPlan` энэ тикт
   *    хуучин. Дуудагч өгөөгүй бол state-ийнх (татах зам).
   */
  const applyPayloadToDraft = useCallback((
    p0: PlanPayload,
    curRows: SheetRow[],
    strict = true,
    curPlan: PkgPlan = obPlan,
    curRes: PkgRes = obRes,
  ): { ok: true; conflicts: number; unknown: number } | { ok: false; why: 'kind' | 'conflict' | 'unknown'; conflicts: number; unknown: number } => {
    const ap = payloadToDrafts(p0, curRows, strict, curPlan, curRes, { kind, n });
    if (!ap.ok) return ap;
    const { maps } = ap;
    setDraft(maps.draft); setHam(maps.ham); setObDraft(maps.obDraft); setObResDraft(maps.obResDraft);
    setADraft(maps.aDraft); setResDraft(maps.resDraft);
    return { ok: true, conflicts: ap.conflicts, unknown: ap.unknown };
  }, [kind, n, obPlan, obRes, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft]);

  /**
   * СЕРВЕРИЙН ОДООГИЙН мөр ба сарын задаргааг татаж state-д тавина (2026-09-21).
   *
   * ⚠️ Урьдчилан харах · батлах · татах ГУРВУУЛАА үүгээр: илгээлтийг state-ийн
   *    ХУУЧИРСАН `rows`/`obPlan`-той биш, дөнгөж татсантай тулгана. Урьд нь
   *    зөвхөн батлах (урьдчилан ХАРААГҮЙ үед) шинээр татдаг байсан тул
   *    `preview` → `decide` замд тулгалт бүхэлдээ АЛГАСАГДАЖ, харснаас
   *    батлах хүртэлх завсрын зэрэгцээ өөрчлөлт чимээгүй дарагддаг байв.
   * ⚠️ Задаргаа татагдахгүй бол state-ийнхаар үргэлжилнэ (мөр нь заавал).
   */
  const refetchServer = useCallback(async (): Promise<{ rows: SheetRow[]; plan: PkgPlan; res: PkgRes }> => {
    const freshRows = sc ? (await loadRows(pkg, sc)).rows : rows;
    /* ⚠️ `loading`-ийг мөртэй НЭГ багцад тавина (2026-09-24): шинэ мөр + хуучин
       задаргаа гэсэн завсрын зурагдалтад хуваалцсан ноорогийн дифф ажиллаж
       сарын нүдийг tombstone болгож байв. Задаргаа ирмэгц `ok`. */
    if (sc) { setObState('loading'); setRows(freshRows); }
    try {
      const fp = await loadPkgPlan(pkg.key);
      setObPlan(fp.plan); setObRes(fp.res); setObOids(fp.oids); setObDups(fp.dups); setObState('ok');
      return { rows: freshRows, plan: fp.plan, res: fp.res };
    } catch {
      setObState('ok');
      return { rows: freshRows, plan: obPlan, res: obRes };
    }
  }, [sc, pkg, rows, obPlan, obRes, setObState, setRows, setObPlan, setObRes, setObOids, setObDups]);

  /** Урьдчилан харах — саналыг хуанли дээр НООРОГ болгон буулгана */
  const preview = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setPreviewBad(null);
    try {
      const p = await loadPayload(pending.oid);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      /* ⚠️ СЕРВЕРЭЭС ШИНЭЭР (2026-09-21) — `decide`-тэй нэг зам. */
      const srv = await refetchServer();
      /* ⚠️ ТӨРӨЛ ЗӨРВӨЛ буулгахгүй — батлагч өөр табаар харж байна. */
      const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan, srv.res);
      if (!ap.ok) {
        /* ⚠️ Мэдэгдэхгүй мөр ч зөрчилтэй адил — зөвхөн «Буцаах» (2026-09-25 аудит) */
        if (ap.why === 'conflict' || ap.why === 'unknown') setPreviewBad(pending.oid);
        setErr(ap.why === 'conflict'
          ? conflictMsg(ap.conflicts)
          : ap.why === 'unknown'
            ? unknownMsg(ap.unknown)
            : p.kind === 'geree'
            ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
            : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      setPreviewing(true);
      setFlowBox(null);
      setNote(tr('Санал хуанли дээр урьдчилан харагдаж байна — батлах хүртэл эх хуудсанд бичигдэхгүй.'));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, applyPayloadToDraft, refetchServer, setBusy, setErr, setPreviewBad, setNote]);

  useEffect(() => { refetchRef.current = refetchServer; }, [refetchServer]);

  /* ══════════════════ НЭМЭЛТ АЖИЛ — урсгал (2026-09-24; `useAjil`) ══════════════════ */
  const {
    addFor, setAddFor, addForm, setAddForm, ajSub, ajEdit, editAdd, setEditAdd,
    ajBusy, ajErr, setAjErr, ajNote, setAjNote, ajBack, setAjBack, ajStuck, ajApplied,
    refreshAfterApplied, sendAjil, editAjilHere, saveAjilEdit, cancelAjilEdit,
    withdrawAjilHere, saveEditAdd, addRow, dropAdd,
  } = useAjil({
    pkg, user, status, canAddRow, rows, busy, setBusy, setErr, pkgKeyRef, refetchRef, dirtyNRef, uiOpenRef,
    adds, setAdds, setAddsSt, addsStRef,
    hdResetRestore, hdMapsRef, setDraft, setHam, setADraft, setResDraft,
    setSel, setFGrp, setCollapsed, setModal, setLinkAsk, undoRef,
  });

  /**
   * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч өөрийн хүлээгдэж буй илгээлтийг буцааж авна
   * (2026-09-21). Урьд нь зохиогчид зам байгаагүй: `decidePlan` зохиогч=батлагч
   * буцаалтыг татгалздаг тул алдаатай илгээлт өөр батлагч буцаатал багцыг
   * түгжинэ.
   *
   * ⚠️ Эх хуудсанд ЮУ Ч бичихгүй (`withdrawPlan` зөвхөн төлөв хөдөлгөнө).
   * ⚠️ АГУУЛГЫГ НООРОГТ БУЦААНА: илгээхэд ноорог цэвэрлэгддэг тул татаад
   *    хоосон үлдвэл зохиогч бүх ажлаа дахин хийнэ. Зэрэгцээ өөрчлөлттэй ч
   *    буулгана (`strict: false`) — зохиогч засаж, ШИНЭ суурьтай дахин илгээнэ;
   *    тоог нь мэдэгдэнэ. Төрөл зөрвөл буулгахгүй, зөвхөн хэлнэ.
   */
  const withdraw = useCallback(async () => {
    if (!pending || busy || !isOwnSubmission) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; агуулга нь ноорог болж буцна.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const oid = pending.oid;
      /* ⚠️ ДАРААЛАЛ (2026-09-21): ЭХЛЭЭД агуулгыг уншиж, төрлийг тулгана, ДАРАА
         нь татна. Урьд нь эхлээд татаад дараа нь уншдаг байсан тул агуулга
         уншигдахгүй эсвэл төрөл зөрвөл илгээлт ТАТАГДЧИХСАН атлаа ноорог хоосон
         үлдэж — зохиогчийн ажил серверээс ч, дэлгэцээс ч алга болдог байв.
         Одоо уншигдахгүй/зөрвөл ТАТАХГҮЙ, илгээлт хүлээгдсэн хэвээр. */
      const p = await loadPayload(oid).catch(() => null);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй — татсангүй, дахин оролдоно уу.')); return; }
      if (p.kind !== kind) {
        setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд татна уу.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд татна уу.'));
        return;
      }
      const r = await withdrawPlan({ oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ?? tr('Илгээлт татагдсангүй.')); return; }
      /* ⚠️ УРСГАЛЫГ ЭХЛЭЭД шинэчилнэ (2026-09-24): `pending` → null болоход
         хуваалцсан ноорогийн «түгжээ тайлагдав» зам Map-уудыг хоосолдог тул
         буулгасны ДАРАА дуудвал буцаасан агуулга тэр даруй арчигдаж байв.
         Мөн энэ нэг удаад хоослохгүй (`hdSkipUnlockOnce`) — агуулга нь
         зохиогчийн буцааж авсан ажил. */
      hdSkipUnlockOnceRef.current = true;
      /* ⚠️ 2026-09-29: энэ илгээлтийг ЭНД буулгана — автомат буулгалт давхардахгүй,
         дараа нь нооргоо хаявал дахин тулгахгүй */
      backSeenSet(pkg.key, kind, pending.oid);
      await refreshFlow({ noRefetch: true });
      /* Серверийн одоогийн мөртэй тулгаж буулгана — зөрчлийн тоо бодит байна */
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan, srv.res);
      /* Буулгасан нүд «миний» болж (дифф мета тавина) алсад нэг удаа бичигдэнэ */
      if (ap.ok) {
        if (hdTimerRef.current) clearTimeout(hdTimerRef.current);
        hdTimerRef.current = setTimeout(() => { hdTimerRef.current = null; void hdFlushRef.current(); }, 1500);
      }
      const restored = ap.ok;
      const conflicts = ap.conflicts;
      setPreviewing(false);
      /* ⚠️ Шинэ жаазад олдоогүй мөрийг НУУХГҮЙ (2026-09-25 аудит) — ноорогт буугаагүй */
      const lostTxt = ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : '';
      setNote((restored
        ? (conflicts
          ? tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(conflicts))
          : tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа, засаад дахин илгээж болно.'))
        : tr('Илгээлт татагдлаа. Агуулга нь ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).')) + lostTxt);
      await refreshFlow();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, isOwnSubmission, user, kind, pkg.key, applyPayloadToDraft, refetchServer, refreshFlow, hdFlushRef, hdSkipUnlockOnceRef, hdTimerRef, setBusy, setErr, setNote]);

  /**
   * ТАТСАН ИЛГЭЭЛТИЙГ НООРОГТ БУЦААХ (2026-09-23) — сүүлийн шийдвэр `withdrawn`
   * бөгөөд ноорог хоосон үед. «Хуваарь батлах» дарааллаас татахад агуулга
   * зөвхөн серверт үлддэг; энд `withdraw`-тай ИЖИЛ замаар (`strict: false`)
   * буулгана. Эх хуудсанд ЮУ Ч бичихгүй.
   */
  /**
   * @param auto — АВТОМАТ сэргээлт (2026-09-29, доорх эффект): төрөл зөрсөн бол
   *   алдаа харуулахгүй чимээгүй алгасна (өөр табд нээхэд тэнд сэргэнэ).
   */
  const restoreWithdrawn = useCallback(async (auto = false) => {
    /* ⚠️ БУЦААГДСАН саналыг ч (2026-09-25): гүйцэтгэгч батлагчийн зөвшөөрөөгүй
       мөрүүдийг (улаан) засаад дахин илгээнэ — гүйцэтгэлийн «буцаагдсан илгээлт
       ноорог болж ачаалагдана» загвар. */
    const back = lastDecision?.status === PLAN_STATUS.returned;
    if (!lastDecision || (lastDecision.status !== PLAN_STATUS.withdrawn && !back) || busy || dirtyN > 0 || !canEdit) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const p = await loadPayload(lastDecision.oid).catch(() => null);
      if (!p) { if (!auto) setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      if (p.kind !== kind) {
        if (!auto) setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan, srv.res);
      /* ⚠️ Сэргээсэн илгээлтийг тэмдэглэнэ (2026-09-29) — зохиогч нооргоо «Цуцлах»-аар
         хаясны дараа хуудас нээх бүрд автоматаар дахин буухгүй (товч хэвээр). */
      if (ap.ok) backSeenSet(pkg.key, kind, lastDecision.oid);
      setPreviewing(false);
      /* ⚠️ Шинэ жаазад олдоогүй мөрийг НУУХГҮЙ (2026-09-25 аудит) — ноорогт буугаагүй */
      const lostTxt = ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : '';
      /* Батлагчийн тэмдэглэгээ — зөвхөн тэмдэглэсэн (талбартай) буцаалтад.
         ⚠️ Эффект ч (`lastDecision`-оос) ижлийг тавина — энд шууд тавих нь
         дахин татахгүйн тулд л (2026-09-25 аудит #2). */
      if (back && ap.ok && lastDecision.okRows) {
        setBackMarks({ oid: lastDecision.oid, ok: new Set(lastDecision.okRows), pay: p });
      }
      if (back && ap.ok) {
        setNote((lastDecision.okRows
          ? tr('Буцаагдсан санал ноорог болж буцлаа — УЛААН мөрүүдийг засаад дахин илгээнэ үү (ногоон нь зөвшөөрөгдсөн).')
          : tr('Буцаагдсан санал ноорог болж буцлаа — засаад дахин илгээнэ үү.'))
          /* ⚠️ Зэрэгцээ өөрчлөлтийн тоог НУУХГҮЙ (татсан замтай ижил) */
          + (ap.conflicts ? ` ${tr('{0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгана уу.', num(ap.conflicts))}` : '') + lostTxt);
        return;
      }
      setNote((ap.ok
        ? (ap.conflicts
          ? tr('Татсан илгээлтийн агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(ap.conflicts))
          : tr('Татсан илгээлтийн агуулга ноорог болж буцлаа — засаад дахин илгээж болно.'))
        : tr('Агуулга ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).')) + lostTxt);
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [lastDecision, busy, dirtyN, canEdit, kind, pkg.key, applyPayloadToDraft, refetchServer, setBusy, setErr, setNote, setBackMarks]);

  /**
   * БУЦААГДСАН/ТАТСАН САНАЛЫГ АВТОМАТААР НООРОГТ БУУЛГАНА (2026-09-29, хэрэглэгч:
   * «хуваарь төлөвлөөд явуулаад буцаасан тохиолдолд төлөвлөсөн хуваарь алга болж байна»).
   *
   * ⚠️ ЯАГААД: илгээхэд ноорог цэвэрлэгддэг (агуулга илгээлтэд хадгалагдана). Татахад
   *    (`withdraw`) агуулга шууд ноорогт буцдаг атал БУЦААГДАХАД зөвхөн улаан мэдэгдлийн
   *    доторх жижиг товчоор л буцдаг байв — дараагүй бол хуанли хуучин хуваарийг харуулж,
   *    төлөвлөсөн ажил «алга болсон» мэт. Амьд өгөгдөл (b31_9f #6): 133 мөр серверт бүтэн,
   *    хуваалцсан ноорог илгээснээс хойш хоосон.
   * ⚠️ НӨХЦӨЛ: зөвхөн ЗОХИОГЧИД · засах эрхтэй · ноорог ХООСОН · хуваалцсан нооргийн
   *    сэргээлт ДУУССАН (`hdReadyKey` — эс бөгөөс хамт ажиллагчийн ноорог ирэхээс өмнө
   *    буулгаж давхарлана) · илгээлт хүлээгдээгүй · хяналтын горим биш.
   * ⚠️ НЭГ УДАА: илгээлт·төрөл бүрд (`autoBackRef` + localStorage `backSeen`) — зохиогч
   *    нооргоо хаясан бол дахин тулгахгүй; «Ноорогт буцааж засах» товч хэвээр.
   */
  const autoBackRef = useRef('');
  useEffect(() => {
    const d = lastDecision;
    if (review || !d || pending || busy || dirtyN > 0 || !canEdit || flowReady !== true) return;
    if (d.status !== PLAN_STATUS.returned && d.status !== PLAN_STATUS.withdrawn) return;
    if (d.pkgKey !== pkg.key || hdReadyKey !== hdKey(kind, pkg.key) || obState !== 'ok' || !rows.length) return;
    const me = (user?.username ?? '').trim().toLowerCase();
    if (!me || (d.author ?? '').trim().toLowerCase() !== me) return;
    const tag = `${pkg.key}:${kind}:${d.oid}`;
    if (autoBackRef.current === tag || backSeenGet(pkg.key, kind) === d.oid) return;
    autoBackRef.current = tag;
    void restoreWithdrawn(true);
  }, [review, lastDecision, pending, busy, dirtyN, canEdit, flowReady, hdReadyKey, obState, rows.length, kind, pkg.key, user, restoreWithdrawn]);

  /** Урьдчилан харахыг болих — ноорог зүгээр л хаягдана */
  const clearPreview = useCallback(() => {
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
    setADraft(new Map()); setResDraft(new Map());
    /* Мөрийн ногоон тэмдэглэгээ нь харсан саналынх — харалттай хамт арилна (2026-09-25) */
    setOkRows(new Set());
    setPreviewing(false); setNote('');
    /* ⚠️ Хуваалцсан нооргийг ДАХИН сэргээнэ (2026-09-24): харалт Map-уудыг
       дарсан тул алсад шинэ бичилт ирэх хүртэл ноорог харагдахгүй байв. */
    hdResetRestore();
  }, [hdResetRestore, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setOkRows, setNote]);

  /**
   * ИЛГЭЭСЭН (БАТЛАГДААГҮЙ) ХУВААРИЙГ ХАРАХ (2026-09-29, хэрэглэгч: «одоо байгаа батлагдсан
   * хуваарь болон илгээсэн батлагдаагүй хуваарийг сольж харах товч нэмэх»).
   *
   * ⚠️ ЗӨВХӨН ХАРНА: илгээлт хүлээгдэж байхад засвар түгжээтэй (`locked`), «Хадгалах»/
   *    «Батлуулах» гарахгүй тул ноорогт буусан агуулга хаашаа ч бичигдэхгүй. «Батлагдсан
   *    хуваарь» товч (`clearPreview`) нооргийг хаяж серверийн хуваарийг буцаана.
   * ⚠️ `strict = false`: зохиогч өөрийн илгээснээ ХАРАХ гэсэн — зэрэгцээ өөрчлөлт/олдоогүй
   *    мөр нь харахад саад биш, тоог нь хэлнэ. Батлагчийн `preview` (strict) хэвээр.
   * ⚠️ ШИЙДВЭР ГАРГАЖ ЧАДАХ ХҮНД ЭНЭ ТОВЧ ГАРАХГҮЙ (доорх JSX): `decide` нь `previewing`
   *    үед харж буй ноорогийг ДАХИН ТУЛГАЛГҮЙ бичдэг тул strict бус харалтаас батлах зам
   *    нээгдэж болохгүй — батлагч «Урьдчилан харах»-аар (strict) харна.
   */
  const viewSent = useCallback(async () => {
    if (!pending || busy || previewing) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const p0 = await loadPayload(pending.oid);
      if (!p0) { setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      if (p0.kind !== kind) {
        setErr(p0.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p0, srv.rows, false, srv.plan, srv.res);
      if (!ap.ok) { setErr(tr('Илгээсэн хуваарь хуанли дээр буусангүй.')); return; }
      setPreviewing(true);
      setNote(tr('Илгээсэн (батлагдаагүй) хуваарь харагдаж байна — зөвхөн харах.')
        + (ap.conflicts ? ` ${tr('{0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгана уу.', num(ap.conflicts))}` : '')
        + (ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : ''));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, previewing, kind, applyPayloadToDraft, refetchServer, setBusy, setErr, setNote]);

  /**
   * ШИЙДВЭР — батлах эсвэл буцаах.
   *
   * ⚠️ ДАРААЛАЛ ЧУХАЛ: батлахад эхлээд агуулгыг ноорог болгон буулгаж эх
   *    хуудсанд бичнэ, ЗӨВХӨН амжилттай бичигдсэний дараа мөрийг
   *    `approved` болгоно. Эсрэгээр хийвэл бичилт унасан үед «батлагдсан»
   *    гэж харагдах атлаа хуваарь хуучин хэвээр үлдэнэ.
   */
  const decide = useCallback(async (approve: boolean, reason: string, okList?: number[]) => {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      if (approve) {
        /*
         * ⚠️ БАТЛАХААС ӨМНӨ илгээлт ХЭВЭЭР ХҮЛЭЭГДЭЖ БАЙГААГ баталгаажуулна.
         *    Батлах зам нь эх хуудсанд ЭХЛЭЭД бичээд ДАРАА нь төлөвийг
         *    шинэчилдэг тул `decidePlan`-ийн хамгаалалт хэтэрхий оройтоно:
         *    хоёр дахь батлагч хуваарийг бичсэний ДАРАА л татгалзах байлаа.
         */
        /* ⚠️ ЭРХИЙГ ЭХ ХУУДСАНД БИЧИХЭЭС ӨМНӨ (2026-09-17): батлах зам нь `save()`
           → `applyUpdates`-ыг `decidePlan`-ийн хүрээний шалгуураас ӨМНӨ ажиллуулдаг
           тул эрхгүй хүн (товч нуугдсан ч консолоос) эх хуудсанд бичиж чадах байв. */
        if (!canApprove) { setErr(tr('Энэ багцын хуваарийг батлах эрхгүй.')); return; }
        const fresh = await loadPending(pkg.key);
        if (!fresh || fresh.oid !== pending.oid) {
          setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        /*
         * ⚠️ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ — ЭНД, бичихээс ӨМНӨ (2026-09-08).
         *    `decidePlan` дотор ижил дүрэм бий ч тэр нь БИЧИЛТИЙН ДАРАА л
         *    ажилладаг: `setApproving` → `useEffect` → `save()` нь огноо,
         *    уялдаа, сарын обьёмыг эх хуудсанд аль хэдийн бичсэн байна.
         *    Тэгвэл хуваарь батлагдалгүйгээр хөдөлж, илгээлт нь `pending`
         *    хэвээр үлдэж хуудас мөнхөд түгжигдэнэ. `plan` + `planApprove`
         *    хоёр эрхийг нэг хүнд олгосон үед энэ нь цорын ганц хаалт.
         * ⚠️ Харьцуулалт нь СЕРВЕРИЙН `fresh.author`-оор — локал `pending`
         *    хуучирсан байж болно.
         */
        const me = (user?.username ?? '').trim().toLowerCase();
        if (me && me === fresh.author.trim().toLowerCase()) {
          setErr(tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.'));
          setFlowBox(null);
          return;
        }
        /* ⚠️ МӨР БҮР НОГООН (2026-09-25 аудит): хяналтын горимоос гадуурх «Шийдвэрлэх»
           цонх ч `Guitsetgel.allOk` дүрмийг дагана — урьдчилан харсан саналын
           өөрчлөгдсөн мөр бүрийг батлагч ногоон болгосон байх ёстой. Хараагүй бол
           доор буулгаад батлах эффект улаан мөрөнд зогсоож харалт руу буцаана. */
        if (reviewOids.some((o) => !okRows.has(o))) {
          setErr(tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.'));
          setFlowBox(null);
          return;
        }
        /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ОБЬЁМТОЙ САР МУЖААС ГАДУУР бол батлахгүй —
           урьдчилан харж байгаа (ноорог = санал) үед ТҮГЖИХЭЭС ӨМНӨ хэлнэ; харалгүй
           «Шийдвэрлэх» замд батлах эффект буулгасны дараа шалгана. */
        if (previewing && obOut.bad > 0) {
          setErr(obOutMsg);
          setFlowBox(null);
          return;
        }
        /*
         * ⚠️ ТҮГЖЭЭ (claim) — ЭХ ХУУДСАНД БИЧИХЭЭС ӨМНӨ (2026-09-25 аудит). Урьд нь
         *    бичих явцад зохиогч татах, эсвэл хоёр дахь батлагч буцаах/батлах
         *    боломжтой байсан тул «татсан/буцаагдсан» санал хуваарьт суудаг байв.
         *    Түгжсэний дараа `withdrawPlan`/бусдын `decidePlan` татгалзана. Доорх
         *    бүх эрт буцалт (агуулга уншигдсангүй, зөрчил) түгжээг ТАЙЛНА; батлах
         *    эффект руу шилжвэл тэр нь бичилт унасан үед тайлна.
         */
        const cl = await claimPlan({ oid: pending.oid, approver: user?.username ?? '', author: fresh.author });
        if (!cl.ok) {
          setErr(cl.error ?? tr('Шийдвэр хадгалагдсангүй.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        /* ⚠️ 2026-10-01: ХАГАС бичигдсэн илгээлтийн түгжээг ТАЙЛАХГҮЙ (`partialRef`-ийн ⚠️) —
           дахин «Батлах» дарж агуулга уншигдаагүй/зөрчил гарсан эрт буцалт ч түгжээг алдуулдаг байв. */
        const oid0 = pending.oid;
        const release = () => (partialRef.current === oid0 ? Promise.resolve() : releasePlanClaim({ oid: oid0, approver: user?.username ?? '' }));
        let handed = false;
        try {
        /* ⚠️ Урьдчилан харж байгаа бол агуулга аль хэдийн ноорогт байна —
           дахин татвал сүлжээний дэмий дуудлага, мөн батлагчийн харсан
           зурагтай зөрөх (хооронд нь илгээлт солигдвол) эрсдэлтэй. */
        /* ⚠️ 2026-09-21-нд ЭРГҮҮЛСЭН — урьдчилан харсан ч ДАХИН ТАТАЖ ТУЛГАНА.
           Дээрх айдас (илгээлт солигдох) нь `fresh.oid !== pending.oid`-оор
           аль хэдийн баригдсан. Харин `preview` нь ТЭР ҮЕИЙН мөртэй тулгасан
           тул харснаас батлах хүртэлх завсарт өөр замаар орсон өөрчлөлт
           (зэрэгцээ өөрчлөлт, зохиогч хөндөөгүй блокийн шинэ утга) тулгалтыг
           бүхэлд нь АЛГАСДАГ байв — `previewing` нь тулгалтыг тойрох хаалга
           болж байсан. Одоо хоёр зам нэг: сервер → тулгах → зөрвөл зогсох. */
        {
          const p = await loadPayload(pending.oid);
          if (!p) {
            setErr(tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй.'));
            return;
          }
          /* ⚠️ СЕРВЕРИЙН ОДООГИЙН мөрөөр (2026-09-21): зэрэгцээ өөрчлөлтийг
             state-ийн хуучирсан `rows`-той биш, дөнгөж татсантай тулгана.
             Сарын задаргаа ч мөн адил (`refetchServer`). */
          const srv = await refetchServer();
          /* ⚠️ ТӨРӨЛ ЗӨРВӨЛ ЭНД ЗОГСОНО (2026-09-11-ний аудитын S1).
             Ноорогт буулгахгүй тул `save` нь буруу талбарт бичих зам
             бүрмөсөн хаагдана; илгээлт `pending` хэвээр үлдэнэ.
             ⚠️ ЗЭРЭГЦЭЭ ӨӨРЧЛӨЛТ ч мөн ЭНД зогсоно (2026-09-21). */
          const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan, srv.res);
          if (!ap.ok) {
            /* ⚠️ Мэдэгдэхгүй мөр (шинэ жааз) — хагас батлалт хийхгүй (2026-09-25 аудит) */
            setErr(ap.why === 'conflict'
              ? conflictMsg(ap.conflicts)
              : ap.why === 'unknown'
                ? unknownMsg(ap.unknown)
                : p.kind === 'geree'
                  ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд батална уу.')
                  : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд батална уу.'));
            return;
          }
        }
        /* ⚠️ `save` нь ноорогийг state-ээс уншдаг тул ЭНД шууд дуудаж
           болохгүй — React төлөв энэ дуудлагын дараа шинэчлэгдэнэ. Батлах
           тэмдгийг тавьж, доорх `useEffect` бичилтийг гүйцэтгэнэ. */
        setApproving(pending.oid);
        handed = true;
        setFlowBox(null); setFlowTxt('');
        return;
        } finally {
          if (!handed) void release();
        }
      }
      /* ⚠️ ХАГАС БИЧИГДСЭН саналыг БУЦААХГҮЙ (2026-10-01, `partialRef`-ийн ⚠️) — огноо нь
         эх хуудсанд аль хэдийн орсон тул буцаавал «буцаагдсан» санал хуваарьт үлдэнэ. */
      if (partialRef.current === pending.oid) {
        setErr(partialMsg(''));
        return;
      }
      const r = await decidePlan({
        oid: pending.oid, approve: false,
        approver: user?.username ?? '', author: pending.author, reason,
        /* ⚠️ Зөвшөөрсөн мөрүүд (2026-09-25) — гүйцэтгэгч улаан/ногоон харна */
        okRows: okList,
      });
      if (!r.ok) { setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      /* ⚠️ Урьдчилан харсан ноорогийг ЗААВАЛ цэвэрлэнэ: буцаасан саналын
         агуулга дэлгэц дээр үлдвэл дараагийн «Хадгалах» түүнийг эх хуудсанд
         бичиж, БУЦААСАН хуваарь батлагдсан мэт болно. */
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setPreviewing(false);
      /* ⚠️ 2026-09-29 аудит: тэмдэглэгээ дараагийн илгээлтэд үлдэхгүй */
      setOkRows(new Set());
      setFlowBox(null); setFlowTxt('');
      /* ⚠️ Талбаргүй үед тэмдэглэгээ хадгалагдаагүйг НУУХГҮЙ — хяналтын горимд
         цонх хаагдаж мессеж нь дараалал руу дамждаг тул `note`-д нийлүүлнэ. */
      setNote(tr('Хуваарь буцаагдлаа — гүйцэтгэгч засаад дахин илгээнэ.') + (r.warn ? ` ${r.warn}` : ''));
      await refreshFlow({ noRefetch: true });
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, pkg, user, canApprove, applyPayloadToDraft, refetchServer, refreshFlow, reviewOids, okRows, previewing, obOut, obOutMsg]);

  /**
   * БАТЛАХЫГ ГҮЙЦЭЭХ — агуулга ноорогт буусны ДАРААХ зурагдалт.
   *
   * ⚠️ Эх хуудсанд бичих ажлыг `save` хийнэ: тэр нь схем, өөрчлөгдсөн блокийг
   *    ялгах, агшин солигдвол мөрийг дахин зураглах бүх нарийн ширийнийг
   *    мэднэ. Энд давхардуулбал хоёр зам салж, нэг нь чимээгүй хоцорно.
   *
   * ⚠️ `save` амжилттай болсныг `dirtyN === 0` -оор мэднэ. Бичилт уначихвал
   *    ноорог үлдэх тул мөрийг `approved` болгохгүй — «батлагдсан» гэж
   *    харагдаад хуваарь нь хуучин хэвээр үлдэхээс сэргийлнэ.
   */
  /* (`savedRef` — дээр, эрт зарлагдсан) */
  useEffect(() => {
    if (approving == null || busy) return;
    if (!savedRef.current) {
      /*
       * ⚠️ ШИНЭЭР БУУЛГАСАН САНАЛЫГ ДАХИН ТУЛГАНА (2026-09-25 аудит #8). `decide(true)`
       *    нь серверээс дахин татаж ноорогт буулгадаг — хооронд нь серверт орсон
       *    өөрчлөлтөөр хяналтын мөрийн жагсаалт (`reviewOids`) өөрчлөгдөж, батлагчийн
       *    ХАРААГҮЙ мөр ногоонгүйгээр батлагдах байв. Энэ зурагдалт шинэ ноорогтой.
       */
      /* ⚠️ 2026-09-25 аудит: хяналтын горимоос ГАДУУР ч (урьдчилан хараагүй
         «Шийдвэрлэх») мөр бүрийн ногоон дүрэм — харалт руу буцааж тэмдэглүүлнэ.
         Түгжээг ТАЙЛНА: эх хуудсанд юу ч бичигдээгүй. */
      if (reviewOids.some((o) => !okRows.has(o))) {
        /* ⚠️ 2026-10-01: ХАГАС бичигдсэн бол ТАЙЛАХГҮЙ (`partialRef`-ийн ⚠️) */
        if (partialRef.current !== approving) void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
        // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: батлах гинж САНААТАЙ эффектээр — `save` ноорогийг state-ээс уншдаг тул агуулга буусны ДАРААХ зурагдалтад бичнэ (дээрх ⚠️); хариулагч руу шилжүүлбэл тэр дараалал алдагдана
        setApproving(null);
        setPreviewing(true);
        setErr(review
          ? tr('Санал хооронд нь дахин буулгахад өөрчлөгдсөн мөр нэмэгдсэн — шинэ улаан мөрүүдийг шалгаж ногоон болгоод дахин батална уу.')
          : tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.'));
        return;
      }
      /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ОБЬЁМТОЙ САР ажлын мужаас ГАДУУР — эх
         хуудсанд бичихгүй (`util.obyemOutsideSpan`-ийн ⚠️). Энэ зурагдалт саналыг
         буулгасан ноорогтой тул «Шийдвэрлэх» (урьдчилан хараагүй) зам ч баригдана.
         Түгжээг ТАЙЛНА: эх хуудсанд юу ч бичигдээгүй. */
      if (obOut.bad > 0) {
        if (partialRef.current !== approving) void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
        setApproving(null);
        setPreviewing(true);
        setErr(obOutMsg);
        return;
      }
      /*
       * ⚠️ БИЧИХ ЗҮЙЛГҮЙ ИЛГЭЭЛТ — БАТЛАГДСАН гэж хаана (2026-09-08-ны аудит).
       *
       * Урьд нь энд ЗҮГЭЭР Л ГАРДАГ байсан: `save` дуудагдахгүй, `decidePlan`
       * ч дуудагдахгүй, ямар ч мессеж гарахгүй — батлагч товч дарсан атлаа
       * ЮУ Ч болоогүй мэт харагдаж, илгээлт МӨНХӨД «хүлээгдэж буй» хэвээр
       * үлдэнэ. Тэр багцын хуваарь бүхэлдээ түгжигдэнэ (`locked`).
       *
       * Ноорог хоосон байх нь ХҮЧИНТЭЙ тохиолдол: илгээснээс хойш эх хуваарь
       * өөр замаар (өөр батлагдсан илгээлт) ижил утгад хүрсэн бол ялгаа
       * үлдэхгүй. Бичих зүйл байхгүй ч ШИЙДВЭР нь бүртгэгдэх ёстой.
       */
      if (!dirtyN) {
        setApproving(null);
        /* ⚠️ 2026-09-29 аудит: `previewing`-ийг АМЖИЛТТАЙ болсны дараа л тайлна —
           унавал хяналтын горимд «Батлах» дахин идэвхтэй үлдэж давтан оролдоно. */
        /* ⚠️ `busy` гинж ДУУСТАЛ (2026-09-21): урьд нь энэ алхам busy-гүй тул
           `decidePlan` явж байхад багц солиход өөр багцын pending/шийдвэр
           наалддаг байв. Сонгогчууд `busy`-д түгжигдэнэ. */
        setBusy(true);
        void (async () => {
          try {
            const r = await decidePlan({
              oid: approving, approve: true,
              approver: user?.username ?? '', author: pending?.author ?? '',
            });
            if (r.ok) {
              setPreviewing(false); setOkRows(new Set());
              /* ⚠️ 2026-10-01: өмнөх хагас бичилтийг энэ батлалт гүйцээв (сервер тэмдгийг `decidePlan` арилгасан) */
              if (partialRef.current === approving) partialRef.current = null;
            }
            setNote(r.ok
              ? tr('Хуваарь батлагдлаа — эх хуудас аль хэдийн ижил байсан тул өөрчлөлт бичигдсэнгүй.')
              : '');
            if (!r.ok) setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.'));
            await refreshFlow({ noRefetch: true });
          } finally {
            setBusy(false);
          }
        })();
        return;
      }
      savedRef.current = true;
      /*
       * ⚠️ УНАЛТЫГ `save`-ИЙН БУЦААХ УТГААР (2026-09-25 аудит). Урьд нь энэ эффект
       *    `busy` хөдлөхөд дахин ажиллана гэж найддаг байв. Гэтэл `staleN` зам
       *    `setBusy(true)` → `false`-ийг НЭГ синхрон тикт хийдэг тул React нэгтгэж
       *    `busy` өөрчлөгдөөгүй мэт болно: эффект дахин ажиллахгүй, `approving` ба
       *    `savedRef` гацаж, `locked` тайлагдана. Дараа нь «Харахыг болих»/«Цуцлах»
       *    дарахад `dirtyN` 0 болж энэ эффект `savedRef = true`-гээр `decidePlan`
       *    руу орж, ЮУ Ч бичигдээгүй илгээлтийг «батлагдсан» болгодог байв.
       *    Одоо унавал доорх «БИЧИЛТ УНАСАН» салаатай ИЖИЛ төлөвт шууд оруулна;
       *    эффект өөрөө тэр салаанд түрүүлж орсон бол (`savedRef` худал) алгасна.
       */
      const claimOid = approving;
      void save().then((ok) => {
        if (ok || !savedRef.current) return;
        savedRef.current = false;
        /* ⚠️ Бичилт эхлээгүй/унасан — түгжээг тайлна (2026-09-25 аудит).
           ⚠️ ХАГАС бичигдсэн бол ТАЙЛАХГҮЙ (2026-10-01, `partialRef`-ийн ⚠️). */
        const partial = partialRef.current === claimOid;
        if (!partial) void releasePlanClaim({ oid: claimOid, approver: user?.username ?? '' });
        setApproving(null);
        setPreviewing(true);
        setErr((cur) => (partial ? partialMsg(cur) : cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.')));
      });
      return;
    }
    savedRef.current = false;
    const oid = approving;
    setApproving(null);
    if (dirtyN) {
      /*
       * ⚠️ БИЧИЛТ УНАСАН. Ноорог хэвээр үлдсэн тул `previewing`-ийг
       *    ТАВИХГҮЙ: тавьчихвал энэ агуулга батлагчийн ӨӨРИЙН засвар мэт
       *    болж, `locked` тайлагдаж, дараа нь батлалгүйгээр эх хуудсанд
       *    бичигдэх зам нээгдэнэ. Урьдчилан харах төлөвт үлдээж, «Харахыг
       *    болих»-оор л цэвэрлүүлнэ.
       *
       * ⚠️ 2026-09-21-нд ЭРГҮҮЛСЭН — `previewing`-ийг ТАВИНА. Дээрх айдас
       *    үндэсгүй: `locked` нь `pending && !approving`-оос л хамаардаг,
       *    `previewing`-ээс биш; «Батлуулах» ч `!pending`-д нуугддаг тул
       *    батлалгүй бичих зам нээгдэхгүй. Харин урьдчилан ХАРАЛГҮЙ баталсан
       *    үед `previewing = false` тул «Цуцлах» (`!locked`) ч, «Харахыг
       *    болих» (`previewing`) ч гарахгүй — ноорог ГАЦДАГ байв. Одоо
       *    «Харахыг болих» гарна; дахин «Шийдвэрлэх» дарвал `decide` нь
       *    `previewing` тул агуулгыг дахин татахгүй, энэ ноорогоо бичнэ.
       */
      setPreviewing(true);
      /* ⚠️ Түгжээг тайлна (2026-09-25 аудит) — зохиогч татах/өөр батлагч шийдэх боломжтой болно.
         ⚠️ ХАГАС бичигдсэн бол ТАЙЛАХГҮЙ (2026-10-01, `partialRef`-ийн ⚠️). */
      const partial = partialRef.current === oid;
      if (!partial) void releasePlanClaim({ oid, approver: user?.username ?? '' });
      /* ⚠️ `save()` өөрөө тодорхой шалтгаан (staleN г.м.) бичсэн бол ДАРАХГҮЙ (2026-09-17) */
      setErr((cur) => (partial ? partialMsg(cur) : cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.')));
      return;
    }
    /* ⚠️ 2026-09-29 аудит: `previewing`-ийг `decidePlan` АМЖИЛТТАЙ болсны ДАРАА л
       тайлна — урьд нь өмнө тайлдаг тул сүлжээний уналтад `reviewLive` худал болж
       хяналтын горимд «Батлах»/«Буцаах» хоёулаа идэвхгүй, зөвхөн «Хаах» үлддэг байв.
       Одоо дахин «Батлах» дарвал ноорог хоосон тул «бичих зүйлгүй» салаагаар
       `decidePlan` дахин дуудагдана. */
    /* ⚠️ `busy` гинж ДУУСТАЛ (2026-09-21) — дээрх салаатай ижил шалтгаан. */
    setBusy(true);
    void (async () => {
      try {
        const r = await decidePlan({
          oid, approve: true,
          approver: user?.username ?? '', author: pending?.author ?? '',
        });
        if (!r.ok) {
          /* ⚠️ 2026-10-01: `partialRef` (ба сервер тэмдэг) ҮЛДЭНЭ — санал эх хуудсанд суусан тул
             буцаах/татах хаалттай; «Батлах»-ыг дахин дарахад «бичих зүйлгүй» салаагаар гүйцнэ. */
          setErr((r.error ?? tr('Хуваарь бичигдсэн ч төлөв шинэчлэгдсэнгүй — дахин оролдоно уу.'))
            + ` ${tr('Хуваарь эх хуудсанд бичигдсэн тул буцаах боломжгүй — «Батлах»-ыг дахин дарж дуусгана уу.')}`);
        } else {
          if (partialRef.current === oid) partialRef.current = null;
          setPreviewing(false);
          setOkRows(new Set());
          setNote(tr('Хуваарь батлагдаж эх хуудсанд бичигдлээ.'));
        }
        await refreshFlow({ noRefetch: true });
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approving, busy, dirtyN]);

  /* ══════════════════ ХЯНАЛТЫН ГОРИМ (`review`, 2026-09-25) ══════════════════ */
  /**
   * НЭЭГДЭНГҮҮТ САНАЛЫГ ХУАНЛИ ДЭЭР БУУЛГАНА — `preview`-ийн ЯГ ижил замаар
   * (сервер → тулгах → зөрвөл зогсох).
   * ⚠️ Мөр · задаргаа ачаалагдаж дуустал ХҮЛЭЭНЭ: `refetchServer` нь `sc`-гүй
   *    үед хоосон `rows`-оор тулгаж санал огт буухгүй байх байв.
   * ⚠️ НЭГ Л УДАА: алдаа гарвал (зэрэгцээ өөрчлөлт г.м.) давтан оролдохгүй —
   *    мессеж нь батлагчид үлдэнэ.
   * ⚠️ Энэ эффект `preview`-ийн ДАРАА зарлагдах ёстой — deps массив зурагдалтын
   *    үед уншигддаг тул өмнө нь бол TDZ (`Cannot access before initialization`).
   */
  const reviewStarted = useRef(false);
  /** Эхлэлийн эффект «аль хэдийн шийдвэрлэгдсэн» алдаа тавьсан (#5) — `onDone`-ийг алгасна */
  const reviewStartErr = useRef(false);
  useEffect(() => {
    if (!review || reviewStarted.current) return;
    if (pkg.key !== review.pkgKey || flowReady === null || busy || !sc || !rows.length || obState === 'loading') return;
    reviewStarted.current = true;
    /* ⚠️ Урсгал уншигдаагүй (сүлжээ/эрх) ≠ «шийдвэрлэгдсэн» — шалтгааныг ЯГ хэлнэ */
    if (flowReady === false) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: хяналтын горим нээгдэнгүүт нэг удаа саналыг буулгах эффект — алдааг ЯГ энд хэлнэ (⚠️ дээр); async ачаалалт дууссаны дараа л ажиллах тул хариулагч болгох боломжгүй
      setErr(flowWhy || tr('Батлах урсгал уншигдсангүй — сүлжээгээ шалгана уу.'));
      return;
    }
    if (pending?.oid !== review.oid) {
      /* ⚠️ Доорх «шийдвэр хадгалагдсан» эффект ИЖИЛ commit-д `lastDecision`-ийг
         (өөр хүний шийдвэр) хараад цонхыг ХООСОН мессежтэй хаадаг байв —
         `err` дараагийн зурагдалтад л `noteRef`-д ордог (2026-09-25 аудит #5).
         Цонх нээлттэй үлдэж алдаагаа харуулна; «Хаах»-аар гарна. */
      reviewStartErr.current = true;
      setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
      return;
    }
    void preview();
  }, [review, pkg.key, flowReady, flowWhy, busy, sc, rows.length, obState, pending, preview]);
  /** Хяналтын ИЛГЭЭЛТ ЯГ ЭНЭ ҮҮ — өөр/шинэ илгээлт дээр шийдвэр гаргуулахгүй */
  const reviewLive = !!review && pending?.oid === review.oid && previewing;
  /* ⚠️ ЗӨРЧЛӨӨР УНАСАН хяналт (2026-09-25 аудит #1) — зөвхөн «Буцаах» нээлттэй,
     тэмдэглэгээгүй (`okRows` undefined): мөр харагдаагүй тул «зөвшөөрсөн» гэх зүйлгүй. */
  const reviewConflict = !!review && pending?.oid === review.oid && !previewing && previewBad === review.oid;

  /**
   * ШИЙДВЭР ХАДГАЛАГДСАН — дараалал руу буцна.
   * ⚠️ `lastDecision` нь `refreshFlow` хүлээгдэж буй илгээлт АЛГА үед л тавьдаг
   *    тул ЭНЭ илгээлт шийдэгдсэн гэдгийн найдвартай дохио (батлах гинжний
   *    «бичилт унасан» салаанд илгээлт хүлээгдсэн хэвээр → цонх хаагдахгүй).
   */
  /* ⚠️ АЛДААГ ч дамжуулна (2026-09-25 аудит): өөр батлагч зуур шийдсэн үед
     `decidePlan` алдаа өгч, `lastDecision` нь энэ илгээлт болж цонх хаагдана —
     зөвхөн `note` дамжуулбал тэр алдаа ор мөргүй алга болно. */
  /* ⚠️ АЛДАА/МЭДЭЭГ ЯЛГАЖ дамжуулна (2026-09-25 аудит #5) — дараалал алдааг
     `note` (ногоон) болгож харуулдаг байв. */
  const noteRef = useLatest<{ msg: string; isErr: boolean }>(err ? { msg: err, isErr: true } : { msg: note, isErr: false });
  const reviewDoneRef = useLatest(review?.onDone);
  const reviewOid = review?.oid;
  useEffect(() => {
    if (reviewOid == null || !lastDecision || lastDecision.oid !== reviewOid) return;
    if (lastDecision.status === PLAN_STATUS.pending) return;
    if (reviewStartErr.current) return;
    reviewDoneRef.current?.(noteRef.current);
  }, [reviewOid, lastDecision, noteRef, reviewDoneRef]);

  /**
   * БУЦААХ (хяналтын горим) — зөвшөөрөөгүй мөрүүдийг шалтгаанд ЖАГСААНА
   * (`Guitsetgel.badText`-ийн загвар), зөвшөөрсөнийг `okRows`-оор хадгална.
   * ⚠️ `butsaasan_shaltgaan` нь 2048 тэмдэгт — эхний 12 мөр, нийт 2000-аар тасална.
   */
  const rejectReview = (txt: string) => {
    if (!txt.trim()) { setErr(tr('Буцаах шалтгааныг бичнэ үү.')); return; }
    const byOid = new Map(plan.map((r) => [r.oid, r]));
    const bad = !reviewLive ? [] : reviewOids.filter((o) => !okRows.has(o))
      .map((o) => byOid.get(o)).filter((r): r is PlanRow => !!r);
    const list = bad.slice(0, 12).map((r) => `${r.no} ${r.work}`.trim()).join('; ')
      + (bad.length > 12 ? ` … (+${bad.length - 12})` : '');
    const why = bad.length
      ? `${txt.trim()}\n${tr('Зөвшөөрөгдөөгүй {0} мөр: {1}', num(bad.length), list)}`
      : txt.trim();
    /* ⚠️ Зөрчлөөр унасан үед (`reviewConflict`) тэмдэглэгээ ИЛГЭЭХГҮЙ — `[]` бол
       гүйцэтгэгчид бүх мөр «зөвшөөрөөгүй» улаан болж ХУДАЛ харагдана. */
    void decide(false, why.slice(0, 2000), reviewLive ? reviewOids.filter((o) => okRows.has(o)) : undefined);
  };
  /**
   * ДАРААГИЙН ЗӨВШӨӨРӨӨГҮЙ МӨР (2026-09-25 аудит, UX): ~1,400 мөрийн виртуал
   * жагсаалтад улаан мөрийг гүйлгэж хайх шаардлагагүй — сонгоод гүйлгэнэ.
   * ⚠️ Өөрчлөлт нь ИДЭВХГҮЙ блокт байвал тэр блок руу шилжинэ — эс бөгөөс
   *    одоогийн блок дээр ялгаа харагдахгүй.
   * ⚠️ Шүүлт/эвхэлтэд нуугдсан бол шүүлтийг цэвэрлэж модыг дэлгэнэ.
   */
  const scrollToOid = useRef<number | null>(null);
  const jumpNextBad = () => {
    const idxs = reviewOids.filter((o) => !okRows.has(o))
      .map((o) => plan.findIndex((r) => r.oid === o)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    const cur = sel != null ? plan.findIndex((r) => r.oid === sel) : -1;
    const i = idxs.find((x) => x > cur) ?? idxs[0];
    const r = plan[i];
    const b0 = base[i];
    const bch = r.spans.findIndex((sp, b) => !sameSpan(sp, b0?.spans[b]));
    if (bch >= 0 && bch !== blk) setBlk(bch);
    if (!visible.some((v) => v.oid === r.oid)) {
      setFilter('all'); setFYear('all'); setFGrp('all'); setCollapsed(new Set()); setLvl(0);
    }
    setSel(r.oid);
    scrollToOid.current = r.oid;
  };
  /**
   * «БҮХ БЛОК»-ийн ДЭД МӨР ДЭЭР ДАРАХ (2026-10-04): тэр блок идэвхжиж горим унтарна —
   * хэрэглэгч шууд засах боломжтой. Мөр сонгогдож, доорх эффект түүн рүү гүйлгэнэ
   * (энгийн горимын индексээр, блокийн зурвасын эхлэл рүү).
   */
  const pickBlk = (oid: number, b: number) => {
    setBlk(b);
    setAllBlk(false);
    setSel(oid);
    scrollToOid.current = oid;
  };
  /* Хяналт нээгдмэгц ЭХНИЙ өөрчлөлт рүү гүйлгэнэ — эхний гүйлгэлт «өнөөдөр» рүү
     явдаг тул өөрчлөгдсөн зурвас дэлгэцээс гадуур үлдэж, «юу өөрчлөгдсөн бэ» гэж
     хайлгадаг байв (хөтчийн туршилт, 2026-09-25). */
  const reviewJumped = useRef(false);
  useEffect(() => {
    if (!review || !previewing || !reviewOids.length || reviewJumped.current) return;
    reviewJumped.current = true;
    jumpNextBad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, previewing, reviewOids.length]);
  useEffect(() => {
    const o = scrollToOid.current;
    const el = scrollRef.current;
    if (o == null || !el) return;
    /* ⚠️ 2026-10-04: индекс ДЭЛГЭЦИЙН жагсаалтаас (`disp`) — «Бүх блок» горимд дэд мөрүүд
       Y-г шилжүүлдэг; энгийн горимд `visible`-тэй ижил. Эх мөр (`b < 0`). */
    const k = disp.findIndex((v) => v.oid === o && v.b < 0);
    if (k < 0) return;
    scrollToOid.current = null;
    el.scrollTop = Math.max(0, (k - 3) * PL_ROW);
    const sp = disp[k].r.spans[blk];
    if (sp) el.scrollLeft = Math.max(0, xOf(sp.start) - 240);
  }, [disp, sel, blk, xOf, scrollRef]);
  /** Мөрийн зөвшөөрлийг сэлгэнэ — зөвхөн өөрчлөгдсөн ажлын мөрд */
  const toggleOk = (oid: number) => {
    if (busy || approving != null) return;
    setOkRows((s0) => {
      const m = new Set(s0);
      if (m.has(oid)) m.delete(oid); else m.add(oid);
      return m;
    });
  };
  /** Мөрийн тэмдэг: хяналтад — батлагчийн сонголт; гүйцэтгэгчид — буцаасан шийдвэр */
  const reviewSet = useMemo(() => new Set(reviewOids), [reviewOids]);

  /*
   * ⚠️ БУЦААСАН ТЭМДЭГЛЭГЭЭГ `lastDecision`-ООС ҮҮСГЭНЭ (2026-09-25 аудит #2).
   *    Урьд нь зөвхөн «Ноорогт буцааж засах» дарсан агшинд санах ойд тавьдаг тул
   *    хуудас дахин ачаалах, хамт ажиллагч өөр компьютерээс (хуваалцсан ноорог)
   *    нээхэд улаан/ногоон тэмдэг огт харагддаггүй байв. Одоо сүүлийн шийдвэр
   *    «буцаасан» бөгөөд тэмдэглэгээтэй (`okRows != null`) бол саналыг нэг удаа
   *    татаж хадгална; харагдах эсэхийг `backOn` шийднэ (ноорогтой үед л).
   * ⚠️ `refreshFlow` нь `lastDecision`-ийг түр `null` болгодог тул энд АРЧИХГҮЙ —
   *    ижил илгээлт/төрөлд дахин татахгүй (`backRef`).
   */
  const backRef = useLatest(backMarks);
  useEffect(() => {
    const d = lastDecision;
    if (review || !d || d.status !== PLAN_STATUS.returned || !d.okRows) return undefined;
    const cur = backRef.current;
    if (cur && cur.oid === d.oid && cur.pay.kind === kind) return undefined;
    let dead = false;
    const ok = new Set(d.okRows);
    void loadPayload(d.oid).then((p) => {
      if (dead || !p || p.kind !== kind) return;
      setBackMarks({ oid: d.oid, ok, pay: p });
    }).catch(() => { /* тэмдэглэгээ нэмэлт — уншигдахгүй бол тэмдэггүй */ });
    return () => { dead = true; };
  }, [review, lastDecision, kind, backRef]);
  /** Буцаасан тэмдэг ИДЭВХТЭЙ юу — яг тэр шийдвэр сүүлийнх, ноорог байгаа */
  const backOn = !review && !!backMarks && dirtyN > 0 && lastDecision?.oid === backMarks.oid;
  /*
   * ⚠️ ТЭМДЭГ ЗӨВХӨН САНАЛД БАЙСАН, УТГА НЬ ХЭВЭЭР МӨРД (2026-09-25 аудит #3).
   *    Урьд нь гүйцэтгэгчийн ОДООГИЙН ноорогтой тулгадаг тул засаж эхэлсэн
   *    улаан мөр улаан хэвээр, саналд огт байгаагүй ШИНЭ засвар «зөвшөөрөөгүй»
   *    улаан болж харагддаг байв. Одоо: мөр саналд байх + утга нь саналынхтай
   *    ИЖИЛ (зохиогч хөндөөгүй блок/талбар — `base`-тэй ижил — тооцохгүй) бол
   *    л тэмдэглэнэ; өөрчлөгдмөгц саармаг.
   */
  const backMarkMap = useMemo(
    () => backMarkMapOf({ backOn, backMarks, rows, plan, byCode, reviewSet, n, obDraft, obPlan, obResDraft, obRes }),
    [backOn, backMarks, rows, plan, byCode, reviewSet, n, obDraft, obPlan, obResDraft, obRes],
  );
  /* ⚠️ 2026-09-25 аудит: батлагч ЭНГИЙН хуудсанд урьдчилан харж байхад ч мөр бүрийг
     ногоон болгоно — «Шийдвэрлэх»-ийн батлалт тэр дүрмээр хаалттай (`decide`). */
  const marking = !!review || (previewing && pending != null && canApprove && !isOwnSubmission);
  const markOf = (r: PlanRow): 'ok' | 'bad' | undefined => {
    if (!reviewSet.has(r.oid)) return undefined;
    if (marking) return okRows.has(r.oid) ? 'ok' : 'bad';
    if (backOn) return backMarkMap.get(r.oid);
    return undefined;
  };

  /**
   * ⚠️ ХАДГАЛААГҮЙ НООРОГ нь зөвхөн санах ойд байна. Таб хаах, дахин ачаалах,
   * багц солих гурвуулаа түүнийг чимээгүй устгана.
   */
  /* ⚠️ ТАБ ХААХАД анхааруулахгүй: урьдчилан харалтын агуулга нь серверт
     аюулгүй хадгалагдсан илгээлт бөгөөд хуанли дээр зөвхөн үзүүлж байгаа —
     хуудсыг хаахад алдагдах зүйлгүй.
     ⚠️ БАГЦ/ТӨРӨЛ СОЛИХ нь ӨӨР зүйл: тэнд `askSwitch` асуудаг (2026-09-11).
     Хаах нь урьдчилан харалтыг үлдээнэ, солих нь ТАСАЛНА — батлагч юу харж
     байснаа алдаж, илгээлт нь хүлээгдсэн хэвээр үлдэнэ. */
  /*
   * ⚠️ 2026-10-04 аудит: `dirtyN > 0` БИШ — АЛСАД ХҮРЭЭГҮЙ засвар (`hdUnsynced`: товлогдсон/явж
   *    буй/унасан бичилт; бичих боломжгүй үед урьдын `dirtyN`). Урьд нь ноорог бүрэн
   *    хадгалагдсан ч анхааруулдаг байв. `navGuard`-аар — харагдац солих · лого · «Гарах»
   *    (`Portal.confirmLeave`) ба F5/таб хаах (`beforeunload`) НЭГ газраас асууна; урьд нь
   *    «Хуваарь» `navGuard`-д бүртгэлгүй байв. Unmount-д заавал `false` (`navGuard`-ийн ⚠️).
   * ⚠️ 2026-09-29 аудит: зөвхөн ХАРАХ эрхтэйд бусдын хуваалцсан ноорог Map-д орж
   *    `dirtyN > 0` болдог — түүнд «хадгалаагүй» анхааруулга худал (`hdUnsynced` `canEdit`-ээр).
   */
  useEffect(() => {
    setNavDirty('huvaari', hdUnsynced && !previewing, tr('Хуваарь'));
    return () => setNavDirty('huvaari', false);
  }, [hdUnsynced, previewing]);
  /*
   * ⚠️ ГИНЖ ЯВЖ БАЙХАД ГАРАХГҮЙ (2026-09-25 аудит #4): батлах явцад (`approving`)
   *    эсвэл бичилт/шийдвэр явж байхад (`busy`) өөр харагдац руу шилжих, таб
   *    хаах нь гинжийг `save`-ийн ДАРАА, `decidePlan`-ийн ӨМНӨ тасалж болно.
   *    `Portal.setView` нь `planNavBusy()`-г асууж баталгаажуулна; таб хаахад
   *    хөтчийн анхааруулга. Дээрх «урьдчилан харалтад анхааруулахгүй» дүрэмтэй
   *    зөрчилдөхгүй — энэ нь зөвхөн гинж ЯВЖ БАЙХ хооронд.
   */
  const [navId] = useState(() => Symbol('huvaari'));
  const chainBusy = approving != null || busy;
  useEffect(() => {
    if (!chainBusy) return undefined;
    setPlanNavBusy(navId, true);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => {
      setPlanNavBusy(navId, false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [chainBusy, navId]);

  const floors = pkgFloors(pkg.group);

  /**
   * ⚠️ БҮЛГИЙН МӨРИЙГ БОДОГДСОН мужаар нь өгнө (2026-09-06). Цонх нь
   *    «Эхлэх/Дуусах» талбар ба «Бүлгийн муж» мөрөндөө `spans`-ыг шууд
   *    уншдаг тул хадгалагдсан ХУУЧИН огноог үзүүлбэл зурвас ба цонх хоёр
   *    өөр тоо хэлнэ. Бичихгүй — бүлэгт огноо засах хаалттай.
   */
  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): БҮЛЭГ БҮРИЙН ҮР ДҮНГ `plan`-д КЭШЛЭНЭ. `effRow` нь
     зүүн мөр (`TaskRow`) ба баруун эгнээ (бодит зурвас) ХОЁУЛАНГААС цонхны бүлэг бүрд, зурагдалт
     БҮРД дуудагддаг; бүлэг бүр `n` блок × бүх дэд мод (`effSpan` + `aggExtra`) гүйдэг тул дээд
     бүлэг ганцаараа ~1,400 мөр × 22 блок. Гүйлгэх/сонгох/чирэх зурагдалтын профайлд хамгийн
     хүнд мөр байв. Кэш нь `plan`/`n` солигдоход шинээр (useMemo) — утга ЯГ ИЖИЛ, зөвхөн
     ижил `plan`-д дахин бодохгүй. Мөрийн ОБЪЕКТООР түлхүүрлэнэ (индекс биш) — өөр массивын мөр
     орж ирсэн ч андуурахгүй. */
  const effRow = useMemo(() => {
    const grp = lazyCache((r: PlanRow): PlanRow => {
      /* ⚠️ `r.spans.map((_, b) => effSpan(plan, r.i, b))`-тэй ЯГ ИЖИЛ, гэхдээ дэд модыг НЭГ
         удаа гүйнэ (блок бүрд `leafChildren` дахин үүсгэхгүй): навч хүүхдийн блок бүрийн MIN
         эхлэх / MAX дуусах; хуваарьтай хүүхэдгүй блокт бүлгийн ӨӨРИЙН муж (`effSpan`-ийн дүрэм). */
      const own = plan[r.i].spans;
      const lo: (number | null)[] = own.map(() => null);
      const hi: (number | null)[] = own.map(() => null);
      const d0 = plan[r.i].depth;
      for (let k = r.i + 1; k < plan.length && plan[k].depth > d0; k++) {
        const c = plan[k];
        if (c.group) continue;
        for (let b = 0; b < own.length; b++) {
          const s = c.spans[b];
          if (!s) continue;
          if (lo[b] == null || s.start < (lo[b] as number)) lo[b] = s.start;
          if (hi[b] == null || s.end > (hi[b] as number)) hi[b] = s.end;
        }
      }
      const spans = r.spans.map((_, b) => {
        const a = lo[b] ?? null;
        const z = hi[b] ?? null;
        return a == null || z == null ? own[b] ?? null : { start: a, end: z };
      });
      return { ...r, spans, ...aggExtra(plan, r.i, n) };
    });
    /* ⚠️ Бодит огноо · нөөц ч хүүхдээс (2026-09-23, `aggExtra`) — бичигдэхгүй. */
    return (r: PlanRow): PlanRow => (r.group ? grp(r) : r);
  }, [plan, n]);

  /**
   * PDF ТАТАХ — дэлгэц дээрх хуваарийг ЯГ ЭНЭ загвараар (2026-09-30, хэрэглэгч).
   *
   * ⚠️ Огноо · нөөц · хамаарлын багана PDF-д ОРОХГҮЙ (`huvaariPdf.LEFT_COLS`).
   * ⚠️ `visible` мөрүүдийг авна — эвхсэн бүлэг · түвшин · хайлт дэлгэцтэй
   *    ижил. Цонхлолтын `slice` БИШ: тэр нь зөвхөн харагдах хэсэг.
   * ⚠️ Мөр бүрийн утгыг хуанлийн зурвастай НЭГ ЭХЭЭС бодно (`rowSpanAt` ·
   *    `refSpanAt` · `effRow` · `statusOf` · `requiredStart`) — PDF нь өөрөө
   *    тооцоо хийхгүй (`huvaariPdf.ts`-ийн ⚠️).
   * ⚠️ Хадгалаагүй ноорог ОРНО — дэлгэц дээр харагдаж буй зүйл л хэвлэгдэнэ.
   */
  const [pdfBusy, setPdfBusy] = useState(false);
  /**
   * ТАТАХЫН ӨМНӨХ СОНГОЛТ (2026-09-30) — хугацааны цонх · зөвхөн идэвхтэй · цаас.
   * ⚠️ Сешн дотор санагдана (state), хадгалагдахгүй — дараагийн удаа дахин
   *    сонгоход «бүх хугацаа» гэсэн анхдагч нь гэнэтийн жижиг PDF-ээс сэргийлнэ.
   */
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfOpts, setPdfOpts] = useState<HvPdfOpts>(HV_PDF_DEFAULT);
  const savePdf = useCallback(async () => {
    if (!sc || pdfBusy) return;
    setPdfBusy(true);
    setPdfOpen(false);
    try {
      const out: HvPdfRow[] = visible.map((r) => {
        const x = r.group ? effRow(r) : r;
        const sp = rowSpanAt(r);
        const need = sp && r.deps.length && kind === 'plan'
          ? requiredStart(plan, byCode, r.i, blk) : null;
        const other = refSpanAt(r.oid);
        return {
          des: r.des,
          no: r.no,
          work: r.work,
          depth: r.depth,
          group: r.group,
          aStart: x.aStart?.[blk] ?? null,
          aEnd: x.aEnd?.[blk] ?? null,
          bar: sp,
          st: sp ? statusOf(sp, r.act?.[blk], now) : 'none',
          viol: !!(sp && need != null && sp.start < need),
          ref: showRef ? other : null,
          /* ⚠️ 0–1 бутархай (хувь биш) — `huvaariPdf` × 100 хийнэ */
          act: r.act?.[blk] ?? null,
        };
      });
      const kindLabel = kind === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө');
      await downloadHuvaariPdf({
        pkg: pkg.label,
        kindLabel,
        refLabel: showRef ? (kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ')) : null,
        block: n > 1 ? (sc.bld[blk] ?? '') : '',
        from, to, now,
        rows: out,
        hasActual,
        opts: pdfOpts,
      /* ⚠️ 2026-09-30: файлын нэрийн өдөр ОРОН НУТГИЙН (`dayKey`) — `msToDay` (UTC) нь
         УБ-д 00:00–07:59-д өчигдрийн огноо өгдөг байв (`format.dayKey`-ийн ⚠️). */
      }, `Huvaari_${pkg.key}_${kind}${pdfOpts.months ? `_${pdfOpts.months}sar` : ''}_${dayKey(Date.now())}.pdf`);
    } catch (e) {
      setErr(tr('PDF үүсгэж чадсангүй: {0}', e instanceof Error ? e.message : String(e)));
    } finally {
      setPdfBusy(false);
    }
  }, [sc, pdfBusy, visible, effRow, rowSpanAt, refSpanAt, kind, plan, byCode, blk, now, showRef,
    pkg, n, from, to, hasActual, pdfOpts, setErr, setPdfOpen]);

  /** Холбох цонхны хоёр мөр — OID-оор (2026-09-25); аль нэг нь алга бол цонх гарахгүй */
  const linkRows = useMemo(() => {
    if (!linkAsk) return null;
    const s = plan.find((x) => x.oid === linkAsk.so);
    const t = plan.find((x) => x.oid === linkAsk.to);
    return s && t ? { s, t } : null;
  }, [linkAsk, plan]);
  const modalRow = useMemo(() => {
    if (modal == null) return null;
    const r = plan.find((x) => x.oid === modal);
    return r ? effRow(r) : null;
  }, [modal, plan, effRow]);
  /**
   * ЦОНХНЫ ТЭНЦЭЭГҮЙ БЛОКУУД — блокийн чип улаан (2026-10-01, хэрэглэгч: бүгдийг зас:
   * «асуудалтай блокийг шууд олох»). ⚠️ `util.unbalancedBlocks` — илгээх хаалттай нэг
   * дүрэм (үр дүнтэй задаргаа: ноорог ?? сервер). Гэрээ табд сарын обьём алга.
   */
  const modalBad = useMemo(
    () => new Set(modalRow && sc && kind === 'plan' ? unbalancedBlocks(modalRow, sc.bld, obDraft, obPlan) : []),
    [modalRow, sc, kind, obDraft, obPlan],
  );
  /**
   * Popup-д зориулсан ЭЦЭГ БҮЛЭГ — хамгийн ойрын ДЭЭД бүлгийн мөр.
   *
   * ⚠️ Чирэлт нь `commit`-доо мужийг эцэгт нь ХАВЧУУЛДАГ байсан ч popup нь
   *    ШУУД бичдэг байв (2026-09-01-нд хэрэглэгч мэдэгдсэн: «том бүлэгт
   *    тавьсан хугацаанаас хамаарахгүй байна»). Нэг ажлыг хоёр өөр замаар
   *    оруулахад ӨӨР ӨӨР дүрэм үйлчлэх нь эвдрэл — одоо хоёулаа ижил.
   */
  /* ⚠️ 2026-09-30: `useMemo`-г ХАСАВ — React Compiler энэ (for-loop + эрт return) memo-г хадгалж чадахгүй
     гэж унадаг байв; тооцоолол нь модны гүнээр шугаман (хэдхэн алхам) тул зурагдалт бүрд бодоход хямд.
     `PlanModal` эцгийг `par?.oid`-оор л тулгадаг тул объектын identity өөрчлөгдөх нь нөлөөгүй. */
  const modalPar = (() => {
    if (!modalRow) return null;
    const at = plan.findIndex((x) => x.i === modalRow.i);
    for (let k = at - 1; k >= 0; k--) {
      if (plan[k].depth < modalRow.depth && plan[k].group) return effRow(plan[k]);
    }
    return null;
  })();

  /**
   * УРЬДЧИЛАГЧИЙН НЭР ДЭВШИГЧИД — кодтой бүх мөр, ХАСАХ нь: (1) өөрөө,
   * (2) энэ ажлаас дам хамаардаг бүх ажил — тэднийг сонговол дугуй хамаарал
   * үүснэ. Урьдчилан шүүснээр хэрэглэгч буруу сонголт хийх БОЛОМЖГҮЙ.
   */
  const depCands = useMemo(() => {
    if (!modalRow) return [];
    const blocked = modalRow.des != null
      ? downstreamCodes(plan, modalRow.des)
      : new Set<number>();
    const out: { code: number; label: string }[] = [];
    for (const r of plan) {
      /* ⚠️ hierRelated нь өөрийг нь БА өвөг/удам бүлгийг хоёуланг таслана —
         тэднээс «хамаарвал» бүлгийн муж өөрөөсөө бодогдож гинжин эргэлт үүснэ */
      if (r.des == null || blocked.has(r.des) || hierRelated(plan, modalRow.i, r.i)) continue;
      out.push({
        code: r.des,
        label: `${r.des} · ${'· '.repeat(r.depth)}${r.work || r.no}`,
      });
    }
    return out;
  }, [plan, modalRow]);

  /**
   * «БҮХ БЛОК» ГОРИМЫН ЭГНЭЭ (2026-10-04) — ЗӨВХӨН ХАРАХ.
   * ⚠️ Эх мөр: бүх блокийн НЭГДЭЛ (`d.sp`) — ажилд саарал `plBarAll` (төлөв нь блок
   *    тус бүрийнх тул нэгдэлд өнгөлөхгүй), бүлэгт урьдын `plBarG`.
   * ⚠️ Дэд мөр: тэр блокийн муж — төлөвийн өнгө `statusOf(sp, act[b])` (энгийн зурвастай
   *    ИЖИЛ дүрэм), бүлэгт `plBarG`. Бодит муж (`plAct`) мөн тэр блокийнх.
   * ⚠️ `onDown`/`startLink`/бариул ОГТ ХОЛБОГДОХГҮЙ — чирэлт/холбоос/popup үүсэхгүй.
   *    Дэд мөр дээр дарахад тэр блок руу орж засна (`pickBlk`), эх мөрд зөвхөн сонголт.
   * ⚠️ Хуучин (батлагдсан) зурвас · «Зэрэг» лавлагаа ЭНД ЗУРАГДАХГҮЙ — хяналтын горимд
   *    энэ горим унтардаг; лавлагаа нь зүүн самбарын огноонд (нэгдэл/блокийнх) бий.
   */
  const allLane = (d: DispRow, k: number) => {
    const { r, b, sp } = d;
    const sub = b >= 0;
    const who = sub ? (sc?.bld[b] ?? '') : tr('Бүх блок');
    const st: Status = sub && sp && !r.group ? statusOf(sp, r.act?.[b], now) : 'none';
    const cls = r.group ? h.plBarG : sub ? ST_CLASS[st] : h.plBarAll;
    let act: { start: number | null; end: number | null } | null = null;
    if (hasActual) {
      const x = r.group ? effRow(r) : r;
      act = sub ? { start: x.aStart?.[b] ?? null, end: x.aEnd?.[b] ?? null } : actUnion(x.aStart, x.aEnd);
    }
    const w = sp ? spanDays(sp) * px : 0;
    return (
      <div key={sub ? `${r.oid}@${b}` : r.oid}
        className={`${h.plLane} ${h.plLaneView} ${sub ? h.plLaneSub : ''} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.oid && (!sub || b === blk) ? h.plLaneOn : ''}`}
        style={{ top: k * PL_ROW, height: PL_ROW }}
        title={sub ? tr('Дарж «{0}» блок руу орж засна', who) : undefined}
        onClick={sub ? () => pickBlk(r.oid, b) : () => setSel(r.oid)}
      >
        {act?.start != null && (() => {
          const as0 = act.start;
          const ae0 = act.end;
          const to2 = ae0 ?? Math.max(as0, now);
          return (
            <div
              className={`${h.plAct} ${ae0 == null ? h.plActOpen : ''}`}
              style={{ left: xOf(as0), width: Math.max(4, spanDays({ start: as0, end: to2 }) * px - 1) }}
            />
          );
        })()}
        {sp && (
          <div
            className={`${h.plBar} ${sub ? h.plBarSub : ''} ${cls} ${sel === r.oid && (!sub || b === blk) ? h.tlBarOn : ''}`}
            style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
            aria-label={`${r.work || r.no} · ${who} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
            title={`${r.work}
${who} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))})${sub && !r.group ? ` · ${stText(st)}` : ''}`}
          >
            {w > 250 ? (
              <span className={h.plBarLab}>
                <span className={h.plBarName}>{who}</span>
                <span className={h.plBarWhen}>
                  {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                </span>
              </span>
            ) : w > 178 ? (
              <span className={h.plBarLab}>
                {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
              </span>
            ) : w > 118 ? (
              <span className={h.plBarLab}>
                {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
              </span>
            ) : w > 40 ? (
              <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): ХУАНЛИЙН ТОЛГОЙ (сар · хоногийн шошго) ба ТОР (сар/хоногийн
     зураас · «өнөөдөр») — элементийг MEMO-д. Босоо гүйлгээний цонх солигдох, мөр сонгох бүрд Huvaari
     бүтнээрээ зурагддаг ч эдгээр нь зөвхөн хуанлийн хүрээ/томруулалт (`months`·`ticks`·`xOf`)
     ба сарын хувиас (`monLab`) хамаарна — ижил элемент буцахад React ~200 шошгыг дахин тулгахгүй.
     Тэмдэглэгээ · зан төлөв ЯГ ИЖИЛ (доорх JSX-ээс механикаар зөөв). */
  const calHead = useMemo(() => (
    <div className={h.plHead}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = scrollRef.current; if (!el) return;
        const x0 = e.clientX, s0 = el.scrollLeft;
        const t = e.currentTarget;
        t.setPointerCapture?.(e.pointerId);
        const mv = (ev: PointerEvent) => { el.scrollLeft = s0 - (ev.clientX - x0); };
        const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); };
        t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
      }}>
      {months.map((m) => {
        const pc = monLab(m.lab);
        return (
          <span key={m.at} className={h.plMonth} style={{ left: xOf(m.at) }}
            title={pc?.tip}>
            {m.lab}
            {pc && <b className={h.plMonPct}>{pc.txt}</b>}
          </span>
        );
      })}
      {ticks.map((tk) => (
        <span key={tk.at} className={`${h.plDay} ${tk.big ? h.plDayBig : ''}`}
          style={{ left: xOf(tk.at) }}>
          {tk.lab}
        </span>
      ))}
    </div>
  ), [months, ticks, monLab, xOf, scrollRef]);
  const calGrid = useMemo(() => (
    <>
      {months.map((m) => (
        <span key={m.at} className={`${h.tlGrid} ${h.tlGridBig}`} style={{ left: xOf(m.at) }} />
      ))}
      {zoom !== 'month' && ticks.filter((t2) => !t2.big).map((tk) => (
        <span key={tk.at} className={h.tlGrid} style={{ left: xOf(tk.at) }} />
      ))}
      {now >= from && now <= to && (
        <span className={h.tlNow} style={{ left: xOf(now) }} title={msToDay(now)} />
      )}
    </>
  ), [months, ticks, zoom, xOf, now, from, to]);

  /* ── УЯЛДААНЫ СУМУУД — идэвхтэй блок дээр, харагдаж буй мөрүүдийн хооронд ──
     ⚠️ Memo БИШ: `visible`, `sel`, `blk`, `xOf` дөрвүүл байнга хөдөлдөг тул
     кэш бараг онохгүй; тооцоо нь уялдаатай мөрийн тоогоор шугаман — хямд. */
  const arrows: { d: string; cls: string; mk: string; key: string; si: number; ti: number; dblk: number | null }[] = [];
  /* ⚠️ (2026-09-23) Сум ЗӨВХӨН төлөвлөгөө табд — уялдаа гэрээнд хамаарахгүй
     (`startLink`-ийн ижил дүрэм), гэрээ табд сум/зөрчил зурвал төөрөгдүүлнэ. */
  /* ⚠️ «Бүх блок» горимд сум НУУГДАНА (2026-10-04): уялдаа нь блок тус бүрийнх, мөрийн
     Y нь дэд мөрөөр шилжсэн тул идэвхтэй блокийн сум буруу мөр рүү заана. */
  if (kind === 'plan' && !allOn) {
    const visK = new Map<number, number>();
    visible.forEach((r, k) => visK.set(r.i, k));
    for (let k = 0; k < visible.length; k++) {
      const r = visible[k];
      if (!r.deps.length) continue;
      const ts = effAt(r.i);
      if (!ts) continue;
      const ty = k * PL_ROW + PL_ROW / 2;
      const tx = xOf(ts.start);
      r.deps.forEach((dep, j) => {
        /* ⚠️ Зөвхөн ИДЭВХТЭЙ блокийн (эсвэл блокгүй) уялдааны сум (2026-09-24) */
        if (dep.blk != null && dep.blk !== blk) return;
        const pi = byCode.get(dep.code);
        if (pi == null || pi === r.i) return;
        const pk = visK.get(pi);
        if (pk == null) return;
        const ps = effAt(pi);
        if (!ps) return;
        const sy = pk * PL_ROW + PL_ROW / 2;
        let d: string;
        if (dep.type === 'FS') {
          /* Урд ажлын БАРУУН захаас гарч хамаарагчийн ЗҮҮН зах руу — ортогональ.
             Хамаарагч нь урд ажлаасаа ЗҮҮНД байвал (зөрчил/сөрөг хоцролт)
             буцах замаар тойруулна, эс бөгөөс сум зурвасын дундуур шургана. */
          const sx = xOf(ps.end + DAY);
          d = tx >= sx + 10
            ? `M ${sx} ${sy} h 6 V ${ty} H ${tx}`
            : `M ${sx} ${sy} h 8 v ${ty > sy ? 12 : -12} H ${tx - 8} V ${ty} H ${tx}`;
        } else {
          /* SS: хоёулангийн ЗҮҮН захыг холбоно */
          const sx = xOf(ps.start);
          d = `M ${sx} ${sy} H ${Math.min(sx, tx) - 8} V ${ty} H ${tx}`;
        }
        /* ⚠️ ЗӨРЧИЛ = хамаарагч шаардлагаас ӨМНӨ эхэлсэн. ХОЖУУ эхлэх нь
           зөрчил БИШ — хэрэглэгч санаатай хойшлуулсан байж болно (дүрэм биш,
           чадвар). Зөрчлийг ХОРИГЛОХГҮЙ, зөвхөн улаанаар тэмдэглэнэ. */
        const need = dep.type === 'FS' ? ps.end + (1 + dep.lag) * DAY : ps.start + dep.lag * DAY;
        const viol = ts.start < need;
        const hot = sel === r.oid || sel === plan[pi]?.oid;
        /* ⚠️ Хошууны marker нь шугамын `stroke`-оос өнгө АВДАГГҮЙ (SVG-ийн
           marker нь referencing path-аас currentColor өвлөдөггүй) тул ангилал
           бүрд ТУСДАА marker хэрэглэнэ. */
        /* ⚠️ Нэр нь `arrKind` — гадна талын `kind` (хуваарийн ТӨРӨЛ) нь
           огт өөр зүйл; ижил нэр нь уншигчийг төөрөгдүүлнэ. */
        const arrKind = viol ? 2 : hot ? 1 : 0;
        arrows.push({
          d,
          cls: viol ? h.depBad : hot ? h.depHot : h.depLine,
          mk: `url(#hvDepArr${arrKind})`,
          key: `${r.oid}·${j}`,
          si: pi,
          ti: r.i,
          dblk: dep.blk ?? null,
        });
      });
    }
  }

  return (
    <div className={`${h.frame} ${isWide ? h.frameWide : ''}`}>
      {/* ── БҮХ ХЭРЭГСЭЛ НЭГ МӨРӨНД ──
          ⚠️ 2026-09-02 (хэрэглэгч): урьд нь ГУРВАН зурвас байв — (1) багц
          сонгох толгой, (2) `Section`-ийн «Ажлын хуваарь» гарчиг, (3) шүүлт ба
          хуанлийн хэрэгсэл. Гурвуулаа хүснэгтээс дээш зай иддэг байсан тул
          нэгтгэв. `Section`-д `title`/`note` өгөхөө больсноор түүний толгойн
          мөр огт зурагдахгүй болно.

          ⚠️ Багц сонголт нь `Section`-ЭЭС ГАДНА байх ЁСТОЙ: ачаалж байх ба мөр
          олдоогүй үед `Section` огт зурагддаггүй тул дотор нь байрлуулбал
          хэрэглэгч өөр багц руу шилжих ЗАМГҮЙ гацна. Тиймээс өгөгдлөөс
          хамаарах хэсгүүд нь `sc && rows.length` хамгаалалттай. */}
      <header className={h.head}>
        <label className={h.field}>
          {tr('Багц')}{' '}
          {/* ⚠️ Хяналтын горимд багц ТОГТМОЛ (дарааллаас сонгосон илгээлтийнх) */}
          <select className={h.select} value={pkg.group} disabled={busy || !!review}
            onChange={(e) => { const v = e.target.value; void askSwitch().then((ok) => { if (ok) setPkg(pkgFloors(v)[0]); }); }}>
            {groupOpts.map((g) => <option key={g} value={g}>{tr(g)}</option>)}
          </select>
        </label>
        {floors.length > 1 && (
          <label className={h.field}>
            {tr('Хувилбар')}{' '}
            <select className={h.select} value={pkg.key} disabled={busy || !!review}
              onChange={(e) => {
                const v = e.target.value;
                void askSwitch().then((ok) => { if (ok) setPkg(PKGS.find((x) => x.key === v) ?? pkg); });
              }}>
              {floors.map((p) => <option key={p.key} value={p.key}>{p.floors}F</option>)}
            </select>
          </label>
        )}

        {sc && rows.length > 0 && (
          <>
            <span className={h.tbSep} aria-hidden />

            {/*
              * ТҮВШНИЙ ЗУРВАС — «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар
              * (2026-09-15, хэрэглэгчийн шаардлага). Товч нь «энэ түвшин
              * хүртэл дэлгэ» гэсэн утгатай: 1 дарвал зөвхөн дээд бүлгүүд,
              * хамгийн гүн нь дарвал бүх ажлын мөр харагдана.
              *
              * ⚠️ Товчны ТОО нь БАГЦААС хамаарна (`lvls`) — санхүүгийн
              *    бүртгэл нь тогтмол таван түвшинтэй Excel загвар, харин
              *    хуваарийн мод багц бүрд өөр гүнтэй.
              * ⚠️ Бүлэг огт байхгүй (бүгд навч) бол зурвас гарахгүй.
              */}
            {lvls.length > 1 && (
              <span className={h.lvBar}>
                <span className={h.lvLbl}>{tr('Түвшин')}</span>
                {/* ⚠️ 2026-10-04 (шүүлт, хэрэглэгчийн шийдвэр: сэргээх): N товч нь N-р түвшний бүлгийг
                    ДЭЛГЭДЭГ болсны дараа «зөвхөн дээд түвшин» харах товч үлдээгүй байв. «0» = БҮХ
                    бүлгийг хураана (гүн ≥ 0); `lvl` нь -1 — 0 нь «сонголтгүй» анхдагч төлөв. */}
                <button
                  type="button"
                  className={lvl === -1 ? h.lvOn : ''}
                  title={tr('Бүгдийг хураах — зөвхөн дээд түвшний бүлгүүд')}
                  onClick={() => setLevel(-1)}
                >0</button>
                {lvls.map((d) => {
                  const nn = d + 1;
                  const deepest = d === lvls[lvls.length - 1];
                  return (
                    <button
                      key={d}
                      type="button"
                      className={lvl === nn ? h.lvOn : ''}
                      title={deepest
                        ? tr('Бүх ажлын мөрийг дэлгэнэ')
                        : tr('{0}-р түвшин хүртэл дэлгэх', nn)}
                      onClick={() => setLevel(nn)}
                    >{nn}</button>
                  );
                })}
              </span>
            )}

            <span className={h.tbSep} aria-hidden />

            {([
              ['all', tr('Бүгд'), plan.filter((r) => !r.group).length],
              ['has', tr('Хуваарьтай'), cov.planned],
              ['none', tr('Хуваарьгүй'), cov.tasks - cov.planned],
              ['partial', tr('Дутуу'), cov.partial],
            ] as const).map(([k, label, cnt]) => (
              <button key={k} type="button"
                className={`${h.tab} ${filter === k ? h.tabOn : ''}`}
                onClick={() => setFilter(k)}>
                {label} <b>{num(cnt)}</b>
              </button>
            ))}

            {/* ⚠️ 2026-10-04: огноо УРВУУ ажил — төлөвлөгөөт хувь, муруйд хуваарьгүй гэж тооцогдоно
                (`bagtsSheet.planAt`); урьд нь чимээгүй «100%» алхам болдог байв */}
            {cov.reversed > 0 && (
              <span role="status" style={{ color: 'var(--bad-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}
                title={tr('Эдгээр мужийг төлөвлөгөөт хувь ба муруйд хуваарьгүй гэж тооцно — огноог засна уу')}>
                ⚠ {tr('{0} ажлын огноо урвуу (дуусах < эхлэх)', num(cov.reversed))}
              </span>
            )}

            {/* ⚠️ Сонголтууд ХОСЛОНО — «бүлэг · 2026» гэж давхарлаж шүүнэ.
                Тиймээс таб биш, тус тусдаа талбар. */}
            {/* ⚠️ БҮЛГЭЭР ШҮҮХ нь бусад шүүлтээс ӨМНӨ ажиллана: эхлээд модны
                салбарыг таслаад, дараа нь түүн дотор жилээр нарийсгана.
                Тиймээс жагсаалтын эхэнд, өргөн талбартай. */}
            <select className={`${h.sel} ${h.selWide}`} value={String(fGrp)} aria-label={tr('Бүлэг')}
              onChange={(e) => setFGrp(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{tr('Бүлэг: бүгд')}</option>
              {groups.map((g) => <option key={g.oid} value={g.oid}>{g.label}</option>)}
            </select>

            <select className={h.sel} value={fYear} aria-label={tr('Эхлэх жил')}
              onChange={(e) => setFYear(e.target.value)}>
              <option value="all">{tr('Жил: бүгд')}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {(filter !== 'all' || fYear !== 'all' || fGrp !== 'all') && (
              <button type="button" className={h.tab}
                onClick={() => { setFilter('all'); setFYear('all'); setFGrp('all'); }}>
                {tr('Цэвэрлэх')}
              </button>
            )}

            {/* ⚠️ `tbSep`-ийн ЗҮҮН тал нь ЖАГСААЛТЫГ (аль мөр гарах вэ), БАРУУН
                тал нь ХАРАГДАЦЫГ (аль блок, ямар масштаб) өөрчилнө. */}
            <span className={h.tbSep} aria-hidden />

            <label className={h.plField}>
              {tr('Блок')}{' '}
              {/* ⚠️ Блокийн нэрний хажууд ХУВААРЬТАЙ мөрийн тоо. Үүнгүй бол аль
                  блок дээр ажил хийгдсэн, аль нь хоосныг мэдэхийн тулд 22 блокийг
                  нэг бүрчлэн сонгож үзэхээс өөр арга байхгүй. */}
              {/* ⚠️ «Бүх блок» горимд блок сонгох = тэр блок руу орж засах (дэд мөрийн
                  товшилттой ижил) — горим унтарна (2026-10-04). */}
              {/* ⚠️ 2026-10-04 (шүүлт): хяналтын горимд (`isReview`) «Бүх блок» хүчингүй — сонголтыг ХӨНДӨХГҮЙ */}
              <select className={h.select} value={blk} onChange={(e) => { setBlk(Number(e.target.value)); if (!isReview) setAllBlk(false); }}>
                {sc.bld.map((b, k) => (
                  <option key={b} value={k}>{b} · {num(blockFill[k])}</option>
                ))}
              </select>
            </label>
            {/*
              * «БҮХ БЛОК» (2026-10-04) — бүх блокийн хуваарийг ажил бүрийн доор зэрэг харуулна.
              * ⚠️ ЗӨВХӨН ХАРАХ (`tlZoomRef` — «Зэрэг»-ийн ижил «харах» өнгө, засах `tlZoomOn` биш).
              * ⚠️ Синтетик/ганц блоктой багц ба хяналтын горимд товч ГАРАХГҮЙ (`allOn`-ийн ⚠️).
              */}
            {multiBlk && !isReview && (
              <button type="button"
                className={`${h.tlZoomB} ${allOn ? h.tlZoomRef : ''}`}
                aria-pressed={allOn}
                title={allOn
                  ? tr('Блок бүрээр харах · засах горим руу буцна.')
                  : tr('Бүх блокийн хуваарийг ажил бүрийн доор зэрэг харуулна (зөвхөн харах).')}
                onClick={() => setAllBlk((v) => !v)}>
                {tr('Бүх блок')}
              </button>
            )}

            {/*
              * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» / «Гэрээ» (2026-09-11).
              *
              * ⚠️ ЗӨВХӨН ШИЛЖИНЭ (хэрэглэгчийн хүсэлт): эдгээр хоёр товч нь
              *    аль огноог ЗАСАХ вэ гэдгийг л сонгоно — нэг нь идэвхтэй.
              *    Хоёуланг зэрэг харах нь ТУСДАА товч (`Зэрэг`, доор).
              * ⚠️ Ноорогтой үед эхлээд хадгална (`askSwitch`) — санах ой цэвэрлэгдэх ч
              *    хуваалцсан ноорог үлдэж, буцаж ирэхэд сэргэнэ (2026-10-01).
              */}
            <div className={h.tlZoom}>
              {([
                ['plan', tr('Төлөвлөгөө')],
                ['geree', tr('Гэрээ')],
              ] as [PlanKind, string][]).map(([k, label]) => (
                <button key={k} type="button"
                  className={`${h.tlZoomB} ${kind === k ? h.tlZoomOn : ''}`}
                  aria-pressed={kind === k}
                  title={k === 'geree'
                    ? tr('Гэрээнд заасан огноог засна.')
                    : tr('Ажлын төлөвлөсөн огноог засна.')}
                  /* ⚠️ `busy` үед ТҮГЖИНЭ (2026-09-11-ний аудит): `save`-ийн
                     таван await-ийн зуур төрөл солигдвол `[kind]` эффект
                     ноорогийг цэвэрлэж, «хадгалагдлаа» гэсэн мэдэгдэл ӨӨР
                     төрлийн хуанли дээр гарна. Багцын сонгогч аль хэдийн
                     ингэж түгжигддэг. */
                  /* ⚠️ Хяналтын горимд төрөл нь илгээлтийнх — солиход санал цэвэрлэгдэнэ */
                  disabled={busy || !!review}
                  onClick={() => { if (kind !== k) void askSwitch().then((ok) => { if (ok) setKind(k); }); }}>
                  {label}
                </button>
              ))}
            </div>

            {/*
              * ЗЭРЭГ ХАРАХ — нөгөө төрлийн огноог мөр бүрийн ДООД зурвасаар
              * нэмж харуулна (2026-09-11, хэрэглэгч: «тусдаа зэрэг харах гэдэг
              * button нэм»).
              *
              * ⚠️ ЗӨВХӨН ХАРУУЛНА — ноорог, хадгалалт, батлалтад ОГТ хүрэхгүй.
              *    Засагдах нь ҮРГЭЛЖ дээрх сонголт (`kind`). Эс бөгөөс нэг
              *    ноорогт хоёр төрөл холилдоно (2026-09-11-ний аудитын S1).
              * ⚠️ Анхдагчаар УНТРААЛТТАЙ: дангаар нь харах нь үндсэн байдал.
              */}
            <button type="button"
              className={`${h.tlZoomB} ${showRef ? h.tlZoomRef : ''}`}
              aria-pressed={showRef}
              title={showRef
                ? tr('Нөгөө огноог нуана.')
                : (kind === 'geree'
                  ? tr('Төлөвлөсөн огноог мөр бүрийн доор нэмж харуулна.')
                  : tr('Гэрээний огноог мөр бүрийн доор нэмж харуулна.'))}
              onClick={() => setShowRef((v) => !v)}>
              {tr('Зэрэг')}
            </button>

            {/*
              * ТАЙЛБАР — зөвхөн лавлагаа АСААЛТТАЙ үед.
              *
              * ⚠️ Унтраалттай үед тайлбар үлдвэл байхгүй зурвасыг тайлбарлана.
              */}
            {showRef && (
              <span className={h.plRefKey}
                title={kind === 'geree'
                  ? tr('Мөр бүрийн ДООД зурвас нь ТӨЛӨВЛӨСӨН огноо — зөвхөн харуулна, засагдахгүй.')
                  : tr('Мөр бүрийн ДООД зурвас нь ГЭРЭЭНИЙ огноо — зөвхөн харуулна, засагдахгүй.')}>
                <span className={h.plRefSwatch} />
                {kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ')}
              </span>
            )}
            {/* Бодит мужийн тайлбар (2026-09-23) — талбартай багцад л */}
            {hasActual && (
              <span className={h.plRefKey}
                title={tr('Мөр бүрийн доод захын нарийн зурвас нь БОДИТ эхэлсэн → дууссан огноо (дуусаагүй бол өнөөдөр хүртэл, тасархай). Popup-аас бүртгэнэ; гинж, төлөвлөгөөнд нөлөөлөхгүй.')}>
                <span className={h.plActSwatch} />
                {tr('Бодит')}
              </span>
            )}

            <div className={h.tlZoom}>
              {(['day', 'week', 'month'] as Zoom[]).map((z) => (
                <button key={z} type="button"
                  className={`${h.tlZoomB} ${zoom === z ? h.tlZoomOn : ''}`}
                  onClick={() => setZoom(z)}>
                  {z === 'day' ? tr('хоног') : z === 'week' ? tr('7 хоног') : tr('сар')}
                </button>
              ))}
            </div>
          </>
        )}

        <span className={h.spacer} />

        {sc && rows.length > 0 && (
          <span className={h.flowNote}>
            {msToDay(from)} → {msToDay(to)} · {num(total)} {tr('хоног')}
            {/* ⚠️ 2026-09-29 аудит: `dirtyRows` (ялгаатай мөр) — `dirtyN` нь `rollUpGroups`-оор
                автоматаар орсон бүлгийн мөр · сарын нүд бүрийг тоолдог тул хэрэглэгчийн
                засварын тооноос их гардаг байв (илгээлтийн `rowCount`-тай ижил). */}
            {dirtyN ? <> · <b className={h.dirtyTag}>{tr('хадгалаагүй')} {num(dirtyRows)}</b></> : null}
          </span>
        )}
        {/* PDF ТАТАХ (2026-09-30) — дэлгэц дээрх хуваарийг ижил загвараар (`savePdf`) */}
        {sc && visible.length > 0 && (
          <span className={h.pdfWrap}>
            <button type="button" className={h.discard} disabled={pdfBusy}
              aria-expanded={pdfOpen}
              title={tr('Дэлгэц дээрх хуваарийг (нээлттэй мөр · таб · блок · багана) PDF болгож татна')}
              onClick={() => setPdfOpen((v) => !v)}>
              {pdfBusy ? tr('Бэлтгэж байна…') : tr('PDF татах')}
            </button>
            {pdfOpen && (
              <span className={h.pdfPop} role="dialog" aria-label={tr('PDF татах')}
                onKeyDown={(e) => { if (e.key === 'Escape') setPdfOpen(false); }}>
                {/* ⚠️ 2026-10-04 (шүүлт): PDF нь блок тус бүрийн загвар (`savePdf` — `blk`) — «Бүх блок»
                    горимд ч ЗӨВХӨН идэвхтэй блок орно; хэрэглэгчид ил хэлнэ */}
                {allOn && (
                  <span className={h.pdfRow}>{tr('«Бүх блок» горимд ч PDF зөвхөн идэвхтэй блокийг ({0}) агуулна.', sc.bld[blk] ?? '')}</span>
                )}
                <label className={h.pdfRow}>
                  <span>{tr('Хугацаа')}</span>
                  <select className={h.select} value={pdfOpts.months}
                    onChange={(e) => setPdfOpts((o) => ({ ...o, months: Number(e.target.value) as HvPdfOpts['months'] }))}>
                    <option value={0}>{tr('Бүх хугацаа')}</option>
                    <option value={1}>{tr('Ирэх 1 сар')}</option>
                    <option value={3}>{tr('Ирэх 3 сар')}</option>
                  </select>
                </label>
                <label className={h.pdfRow}>
                  <input type="checkbox" checked={pdfOpts.active}
                    onChange={(e) => setPdfOpts((o) => ({ ...o, active: e.target.checked }))} />
                  <span>{tr('Зөвхөн хоцорсон ба явж буй')}</span>
                </label>
                <label className={h.pdfRow}>
                  <span>{tr('Цаас')}</span>
                  <select className={h.select} value={pdfOpts.paper}
                    onChange={(e) => setPdfOpts((o) => ({ ...o, paper: e.target.value as HvPdfOpts['paper'] }))}>
                    <option value="A3">A3</option>
                    <option value="A4">A4</option>
                  </select>
                </label>
                <span className={h.pdfBtns}>
                  <button type="button" className={h.discard} onClick={() => setPdfOpen(false)}>{tr('Болих')}</button>
                  <button type="button" className={h.save} disabled={pdfBusy} onClick={() => void savePdf()}>{tr('Татах')}</button>
                </span>
              </span>
            )}
          </span>
        )}
        {/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БҮЛГИЙН кодоор хадгалагдсан сарын задаргаа —
            тэнцлийн шалгалтад ОРОХГҮЙ («Сарын обьём бүлэгт биш», `util.unbalancedBlocks`) тул
            чимээгүй алгасахгүй, ил хэлнэ. Устгах/засах нь админы шийдвэр. */}
        {grpSplit.length > 0 && (canEdit || canApprove) && (
          <span className={h.muted} role="status" title={grpSplit.join('; ')}>
            {tr('{0} бүлгийн мөрд сарын обьём хадгалагдсан байна — бүлэгт задаргаа тооцогдохгүй, тэнцлийн шалгалтад орохгүй: {1}',
              num(grpSplit.length), grpSplit.slice(0, 3).join('; ') + (grpSplit.length > 3 ? ` (+${num(grpSplit.length - 3)})` : ''))}
          </span>
        )}
        {/* Хуваалцсан ноорогийн төлөв (2026-09-23) — хадгалагдсан цаг · алдаа · хамт бичигчид */}
        {(hdLabel || hdUsers.length > 0) && (
          <span className={`${h.flowNote} ${hdSt.st === 'err' || hdSt.st === 'big' ? h.hdWarn : ''}`} role="status">
            {hdLabel}
            {hdLabel && hdUsers.length > 0 ? ' · ' : ''}
            {hdUsers.length > 0 ? tr('ноорогт: {0}', hdUsers.join(', ')) : ''}
          </span>
        )}

        {/* ⚠️ Урьдчилан харж байхад ЭНЭ товч гарахгүй — ноорог нь батлагчийн
            ӨӨРИЙН засвар БИШ, илгээгдсэн санал. Түүнийг «Харахыг болих»-оор
            хаяна, эс бөгөөс хоёр товч ижил зүйл хийж будлиантана. */}
        {canEdit && !previewing && !locked && dirtyN > 0 && (
          /* ⚠️ БУЦААХ ЗАМ. Хуанли дээр чирэх нь маш хурдан үйлдэл тул санамсаргүй
             өөрчлөлт гарна — хадгалахаас өмнө бүгдийг нэг товчоор цуцлах
             боломжгүй бол хэрэглэгч хуудсаа дахин ачаалахаас өөр аргагүй. */
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хадгалаагүй бүх өөрчлөлтийг хаяна — хуваалцсан ноорог БҮХ оролцогчид устна')}
            onClick={() => {
              /* ⚠️ Олон өөрчлөлтийг нэг товшилтоор алдахгүй (2026-09-23): 3-аас
                 дээш бол баталгаажуулна; цөөнд нь асуулт саад болно. */
              /* ⚠️ Хуваалцсан ноорог (2026-09-24): хоосорсныг дифф → `hdFlush` алсыг
                 нийлүүлээд цэвэрлэнэ — зөвхөн бичих эрхтэй үед (энэ товч `canEdit`). */
              /* ⚠️ 2026-09-30: «3-аас дээш» босгыг ХАСАВ — цөөн засвар ч гэсэн
                 хуваалцсан ноорогоор дамжин БУСАД оролцогчийнх устна (`hdFlush`).
                 Товч зөвхөн `dirtyN > 0` үед гардаг тул үргэлж асууна; алдах зүйлгүй
                 (dirtyN = 0) үед товч өөрөө харагдахгүй. */
              const others = hdUsers.length > 0 ? ` (${hdUsers.join(', ')})` : '';
              /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): асуултын тоо = ТОВЧНЫ тоо (`dirtyRows`,
                 өөрчлөгдсөн мөр). Урьд нь `dirtyN` (сарын нүд бүрийг тоолдог) байсан тул
                 товч «(3)» гэж байхад асуулт «12 өөрчлөлт» гэж зөрдөг байв. */
              if (!window.confirm(tr('Хадгалаагүй {0} өөрчлөлтийг хаях уу? Хуваалцсан ноорог бүх оролцогчид{1} устна.', num(dirtyRows), others))) return;
              /* ⚠️ 2026-10-04 аудит: Map-уудыг хоослохоос ӨМНӨ — дэлгэц дээрх нүдийг локалд СИНХРОН
                 tombstone болгож (шууд F5 дарвал амилахгүй), алсад read-merge-write-аар хаана. */
              hdDiscard();
              setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map()); setADraft(new Map()); setResDraft(new Map()); setNote('');
              /* ⚠️ Буцаасан тэмдэглэгээ ноорогтой хамт (2026-09-25 аудит) — үлдвэл дараагийн
                 ШИНЭ засвар бүр «батлагч зөвшөөрөөгүй» улаан болж ХУДАЛ харагдана.
                 2026-09-25 #2/#3: шинэ засвар одоо саармаг (`backMarkMap`); «Ноорогт
                 буцааж засах» эсвэл дахин ачаалалт тэмдгийг дахин тавина. */
              setBackMarks(null);
            }}>
            {tr('Ноорог хаях')} ({num(dirtyRows)})
          </button>
        )}
        {/* ⚠️ «Хадгалах» → «Батлуулах» (2026-09-07). Гүйцэтгэгч эх хуудсанд
            ШУУД бичихээ болив: огноо нь батлагдтал хяналтын хүснэгтэд
            хүлээнэ. Батлагдаагүй санал тайлан, хоцрогдлын дохиог хөндөхгүй. */}
        {/* ⚠️ ИЛГЭЭЛТЭЭ ТАТАХ (2026-09-21) — зөвхөн ЗОХИОГЧ, зөвхөн `pending`.
            «Батлуулах» товчны байранд: тэр товч `pending` үед нуугддаг тул
            зохиогч энд өөрийн илгээлтийн хувь заяаг удирдана. */}
        {canEdit && pending && isOwnSubmission && approving == null && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хүлээгдэж буй илгээлтээ буцааж авна — агуулга нь ноорог болж буцна')}
            onClick={() => void withdraw()}>
            {tr('Илгээлтээ татах')}
          </button>
        )}
        {/* ⚠️ НЭМЭЛТ АЖИЛ БАТЛУУЛАХ (2026-09-24) — хуваарийн «Батлуулах»-аас ТУСДАА
            товч: тэр нь огноог, энэ нь ШИНЭ АЖЛЫГ гэрээнд оруулах эсэхийг 2 шатат
            урсгалд. Хүлээгдэж буй илгээлт байхад (`ajSub`) гарахгүй — `submitAjil`
            хоёр дахийг татгалзана. */}
        {canAddRow && !ajSub && adds.length > 0 && (
          <button type="button" className={h.save} disabled={ajBusy}
            title={tr('Нэмсэн шинэ ажлын мөрийг батлуулахаар илгээнэ — батлагдтал үндсэн өгөгдөлд бичигдэхгүй')}
            onClick={() => void sendAjil()}>
            {tr('Нэмэлт ажил батлуулах')} ({num(adds.length)})
          </button>
        )}
        {canEdit && !pending && (
          <button
            type="button"
            className={h.save}
            disabled={busy || dirtyN === 0 || flowReady === false}
            title={flowReady === false
              ? (flowWhy || tr('Батлах хүснэгт бэлэн болоогүй — админ нэг удаа нэвтэрч үүсгэнэ.'))
              : tr('Өөрчлөлтийг батлуулахаар илгээнэ — батлагдтал эх хуваарь хөдлөхгүй')}
            /* ⚠️ Цонх нээхэд `err` ЦЭВЭРЛЭНЭ (2026-09-21): FlowBox нь `err`-ийг
               зурдаг тул өмнөх (өөр үйлдлийн) алдаа цонхны дотор «энэ илгээлтийн
               алдаа» мэт гарч байв. */
            onClick={() => { setErr(''); setFlowBox('send'); }}
          >
            {/* ⚠️ 2026-09-29 (аудит 10): `dirtyRows` — толгойн «хадгалаагүй N», илгээлтийн `rowCount`-тай НЭГ тоо */}
            {tr('Батлуулах')}{dirtyN ? ` (${num(dirtyRows)})` : ''}
          </button>
        )}
        {/* ⚠️ УРЬДЧИЛАН ХАРАХ — батлагч саналыг ХУАНЛИ ДЭЭР харна. Үүнгүй бол
            «14 мөр» гэсэн тоо л хараад хараагүй зүйлээ баталж байна гэсэн үг. */}
        {!review && pending && canApprove && !previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Саналыг хуанли дээр буулгаж харна — эх хуудсанд бичигдэхгүй')}
            onClick={() => void preview()}>
            {tr('Урьдчилан харах')}
          </button>
        )}
        {!review && pending && canApprove && previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Урьдчилан харахыг болино')}
            onClick={clearPreview}>
            {tr('Харахыг болих')}
          </button>
        )}
        {/* ⚠️ ЗОХИОГЧИД ТОВЧ ИДЭВХГҮЙ (2026-09-08). Дүрэм нь `decide`-д
            (бичихээс өмнө) баригдана; энд идэвхгүй болгох нь ЯАГААД гэдгийг
            ИЛ болгож, батлагдахгүй мэдэж байж дарахаас сэргийлнэ. */}
        {!review && pending && canApprove && (
          <button type="button" className={h.save} disabled={busy || isOwnSubmission}
            title={isOwnSubmission
              ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
              : undefined}
            /* ⚠️ Нээхэд `err` цэвэрлэнэ (2026-09-21) — «Батлуулах»-тай ижил шалтгаан. */
            onClick={() => { setErr(''); setFlowBox('decide'); }}>
            {tr('Шийдвэрлэх')} ({num(pending.rowCount)})
          </button>
        )}
        {/*
          * ⚠️ ӨӨРИЙН ИЛГЭЭЛТ — товч идэвхгүй болсон ШАЛТГААНЫГ ил хэлнэ
          *    (2026-09-15). Урьд нь зөвхөн `title` (hover) байсан тул
          *    мэдрэгч дэлгэцэд ОГТ хүрэхгүй, хулганатай ч гэсэн саарал
          *    товч ширтсэн хүн «эвдэрсэн» гэж үзнэ. Багц гацсан гэдгийг
          *    ба гарцыг нь хамт хэлнэ.
          */}
        {pending && canApprove && isOwnSubmission && (
          <span className={h.muted} role="status">
            {tr('Энэ илгээлтийг та өөрөө хийсэн тул өөрөө батлах боломжгүй. Өөр батлагч шийдвэрлэнэ — багцад батлагч томилоогүй бол админ «Хуваарийн эрх» хэсгээс нэмнэ.')}
          </span>
        )}
        {/*
          * ⚠️ БАТЛАХ ЭРХГҮЙ бол ШАЛТГААНЫГ ил хэлнэ (2026-09-15, хэрэглэгч:
          *    «төлөвлөөд батлахад батлах идэвхжихгүй байна»).
          *
          *    Урьд нь `canApprove` худал үед «Шийдвэрлэх» товч ОГТ
          *    зурагддаггүй байв — хэрэглэгч «товч идэвхгүй» гэж хардаг ч
          *    үнэндээ товч байхгүй, шалтгаан нь хаана ч бичигдэхгүй.
          *    Одоо хэнд хандахыг нэрлэнэ.
          *
          * ⚠️ `locked` үед «Батлуулах» товч ч алга болдог (дээрх `!pending`)
          *    тул энэ мөр нь тэр хоосон зайг ч тайлбарлана.
          */}
        {!review && pending && !canApprove && (
          <span className={h.muted} role="status">
            {/* ⚠️ ХОЁР ӨӨР шалтгааныг ЯЛГАНА (2026-09-15): «эрх огт байхгүй»
                ба «эрх бий ч ЭНЭ багцад биш» хоёр нь өөр гарцтай. Хоёуланг
                нь «эрхгүй» гэж нэгтгэвэл тусдаа эрх тохируулсан хүн юу дутуу
                байгааг олохгүй. `hasPlanRole` нь багцаас ҮЛ ХАМААРНА. */}
            {hasPlanRole(user?.username, 'approver')
              ? tr('Танд батлах эрх бий, гэхдээ ЭНЭ багцад томилогдоогүй байна. Админ «Хуваарийн эрх» → {0} → «Батлагч» хэсэгт таныг нэмнэ.', pkg.group)
              : tr('Батлах эрхгүй — энэ багцад батлагчаар томилогдсон хүн шийдвэрлэнэ. Админ «Хуваарийн эрх» хэсгээс томилно.')}
          </span>
        )}
        {/*
          * ХЯНАЛТЫН ЗУРВАС (2026-09-25) — зөвшөөрлийн тоолуур · батлах · буцаах · хаах.
          * ⚠️ «Батлах» нь БҮХ өөрчлөгдсөн мөр ногоон болтол ХААЛТТАЙ — гүйцэтгэлийн
          *    дүрэм (`Guitsetgel.allOk`): батлагч мөр бүрийг харсан байх ёстой.
          * ⚠️ Өөрийн илгээлтийг батлахгүй — `decide` ба `decidePlan` ч татгалзана,
          *    энд товч дарахаас ӨМНӨ хэлнэ.
          */}
        {review && (
          <>
            <span className={`${h.flowNote} ${allOk ? h.revAllOk : ''}`} role="status">
              {pending ? `${pending.author} · ` : ''}
              {tr('Зөвшөөрсөн {0}/{1} мөр', num(reviewOk), num(reviewOids.length))}
            </span>
            <button type="button" className={h.discard}
              disabled={!reviewLive || allOk || !reviewOids.length}
              title={tr('Дараагийн зөвшөөрөөгүй мөр рүү гүйлгэнэ (өөрчлөгдсөн блокийг нь сонгоно)')}
              onClick={jumpNextBad}>
              {tr('Дараагийн ✕')}
            </button>
            {/* ⚠️ ЗӨВХӨН super (`Guitsetgel`-ийн «✓ бүгдийг ногоон» дүрэм): батлагч мөр
                бүрийг харах ёстой — нэг товчоор бүгдийг ногоон болговол хяналт утгаа алдана. */}
            {(status === 'off' || roleForUser(user?.username) === 'super') && (
              <button type="button" className={h.discard}
                disabled={busy || approving != null || !reviewLive || !reviewOids.length}
                title={tr('Өөрчлөгдсөн бүх мөрийг ногоон/улаан болгоно')}
                onClick={() => setOkRows(allOk ? new Set() : new Set(reviewOids))}>
                {allOk ? tr('Бүгдийг болих') : tr('Бүгдийг зөвшөөрөх')}
              </button>
            )}
            <button type="button" className={h.discard}
              /* ⚠️ ЯГ ЭНЭ илгээлт, урьдчилан харсны ДАРАА л (2026-09-25 аудит): урьд нь
                 зуур солигдсон ШИНЭ илгээлтийг хараагүй байж буцааж, `okRows=[]` бичдэг байв. */
              disabled={busy || approving != null || !(reviewLive || reviewConflict) || !canApprove || isOwnSubmission}
              onClick={() => { setErr(''); setFlowBox('reject'); }}>
              {tr('Буцаах')}
            </button>
            <button type="button" className={h.save}
              /* ⚠️ 2026-10-01: мужаас гадуурх сарын обьёмтой санал батлагдахгүй (`obOut`) */
              disabled={busy || approving != null || !reviewLive || !canApprove || isOwnSubmission || (reviewOids.length > 0 && !allOk) || obOut.bad > 0}
              title={isOwnSubmission
                ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
                : !canApprove
                  ? tr('Энэ багцын хуваарийг батлах эрхгүй.')
                  : reviewOids.length > 0 && !allOk
                    ? tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.')
                    : obOut.bad > 0
                      ? obOutMsg
                      : tr('Батлахад хуваарь эх хуудсанд бичигдэнэ.')}
              onClick={() => { if (window.confirm(tr('Хуваарийг батлах уу? Эх хуудсанд бичигдэнэ.'))) void decide(true, ''); }}>
              {tr('Батлах')}
            </button>
            <button type="button" className={h.discard} disabled={busy || approving != null}
              title={tr('Шийдвэргүй хаана (Esc)')}
              onClick={() => review.onClose()}>
              ✕ {tr('Хаах')}
            </button>
            {/* ⚠️ 2026-09-30: «Батлах»/«Буцаах» хаалттай ШАЛТГААН ИЛ мөрөөр (5784-ийн
                сургамж) — `title` мэдрэгч дэлгэцэд гарахгүй. `busy`/`approving` үед
                түр хаалт тул бичихгүй. Өөрийн илгээлтийн шалтгааныг дээрх span хэлдэг. */}
            {(() => {
              if (busy || approving != null || isOwnSubmission) return null;
              const why = !canApprove
                ? tr('Энэ багцын хуваарийг батлах эрхгүй.')
                : reviewConflict
                  ? tr('Санал одоогийн хуваарьтай зөрчилдсөн тул зөвхөн буцаах боломжтой.')
                  : !reviewLive
                    ? tr('Санал хуанли дээр буулгагдаагүй байна — буулгагдсаны дараа шийдвэрлэнэ.')
                    : reviewOids.length > 0 && !allOk
                      ? tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.')
                      /* ⚠️ 2026-10-01: мужаас гадуурх обьём — аль ажил/блок/сар гэдгийг нэрлэнэ */
                      : reviewLive && obOut.bad > 0
                        ? obOutMsg
                        : '';
              return why ? <span className={h.muted} role="status">{why}</span> : null;
            })()}
          </>
        )}
      </header>

      {/* ⚠️ ХААХ товч (2026-09-23): алдааны баннер хаагдахгүй, тэмдэглэлийнх нь
          «дарахад хаагдана» гэдэг нь харагддаггүй байв. */}
      {err && (
        <p className={h.err} role="alert">
          {err}
          <button type="button" className={h.noteX} onClick={() => setErr('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {note && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setNote('')}>
          {note}
          <button type="button" className={h.noteX} onClick={() => setNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {komissNote && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setKomissNote('')}>
          {komissNote}
          <button type="button" className={h.noteX} onClick={() => setKomissNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {/* ── НЭМЭЛТ АЖЛЫН баннерууд (2026-09-24) — хуваарийн урсгалынхаас тусдаа ── */}
      {ajErr && (
        <p className={h.err} role="alert">
          {ajErr}
          <button type="button" className={h.noteX} onClick={() => setAjErr('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {ajNote && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setAjNote('')}>
          {ajNote}
          <button type="button" className={h.noteX} onClick={() => setAjNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {/* Хүлээгдэж буй илгээлт — БҮХ хүнд (ил тод); «татах» ЗӨВХӨН зохиогчид
          (`decideAjil` зохиогч=батлагчийг татгалздаг тул үүнгүйгээр багц түгжинэ) */}
      {ajSub && (
        <p className={h.note} role="status">
          {tr('Нэмэлт ажил батлуулахаар илгээгдсэн: {0} мөр · {1}', String(ajSub.rowCount), ajSub.author)}
          {ajEdit && ajEdit.oid === ajSub.oid && (
            <>
              {' · '}<b>{tr('засаж байна')}</b>
              <button type="button" className={h.noteBtn} disabled={ajBusy || adds.length === 0}
                title={tr('Зассан мөрүүдийг ИЖИЛ илгээлтэд хадгална — батлагч шинэ хувилбарыг харна')}
                onClick={() => void saveAjilEdit()}>
                {tr('Засварыг хадгалах')} ({num(adds.length)})
              </button>
              <button type="button" className={h.noteBtn} disabled={ajBusy}
                title={tr('Засварыг хаяна — илгээлт өмнөх хэвээрээ үлдэнэ')}
                onClick={cancelAjilEdit}>
                {tr('Болих')}
              </button>
            </>
          )}
          {canAddRow && !ajEdit && (status === 'off' || (user?.username ?? '').trim().toLowerCase() === ajSub.author) && (
            <button type="button" className={h.noteBtn} disabled={ajBusy}
              title={tr('Батлагч шийдээгүй байхад илгээсэн мөрүүдээ засна — илгээлт хүлээгдсэн хэвээр')}
              onClick={() => void editAjilHere()}>
              {tr('Засах')}
            </button>
          )}
          {(status === 'off' || (user?.username ?? '').trim().toLowerCase() === ajSub.author) && (
            <button type="button" className={h.noteBtn} disabled={ajBusy}
              title={tr('Илгээлтээ буцааж авна — мөрүүд хуудсанд эргэж орно')}
              onClick={() => void withdrawAjilHere()}>
              {tr('Илгээлтээ татах')}
            </button>
          )}
        </p>
      )}
      {ajBack && (
        <p className={h.err} role="alert">
          {tr('Нэмэлт ажил буцаагдсан ({0} мөр, {1}): {2} — мөрүүд хуудсанд буцаж орлоо, засаад дахин батлуулна уу.', String(ajBack.n), ajBack.by || '—', ajBack.reason || '—')}
          <button type="button" className={h.noteX} onClick={() => setAjBack(null)} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {!review && ajApplied && (
        <p className={h.note} role="status">
          {tr('Нэмэлт ажил батлагдлаа — хадгалаагүй өөрчлөлтөө хадгалаад/илгээгээд хуудсыг шинэчилнэ үү.')}
          <button type="button" className={h.noteBtn} disabled={busy}
            title={tr('Хуудсыг серверээс татна; хадгалаагүй ноорог шинэ мөрүүд рүү (№ · нэрээр) зөөгдөнө')}
            onClick={() => void refreshAfterApplied()}>
            {tr('Шинэчлэх')}
          </button>
        </p>
      )}
      {ajStuck > 0 && (
        <p className={h.note} role="status">
          {tr('Батлагдсан нэмэлт ажлын {0} илгээлт үндсэн хүснэгтэд хараахан буугаагүй — батлагч «Нэмэлт ажил батлах» хуудаснаас «Дахин буулгах» дарна.', num(ajStuck))}
        </p>
      )}
      {!review && !canEdit && !canApprove && (
        <p className={h.note}>
          {tr('Танд хуваарь засах эрх алга — зөвхөн харна. Эрхийг админ «Хуваарь төлөвлөх» гэж тусад нь олгоно.')}
        </p>
      )}
      {/* ⚠️ Зөвхөн БАТЛАГЧ эрхтэй хүн шийдвэрлэх зүйлгүй үед ХООСОН хуудас
          хараад «эвдэрсэн юм болов уу» гэж бодохоос сэргийлнэ. */}
      {!review && !canEdit && canApprove && !pending && (
        <p className={h.note}>
          {tr('Танд батлах хуваарь алга — гүйцэтгэгч илгээмэгц энд гарч ирнэ. Хуваарийг та зөвхөн харна, засахгүй.')}
        </p>
      )}
      {/* ⚠️ ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — засварыг ТҮГЖИНЭ. Хоёр санал зэрэг
          хүлээвэл батлагч алийг нь батлахаа мэдэхгүй болно. */}
      {!review && pending && (
        <p className={h.note} role="status">
          {tr('{0} мөрийн хуваарь батлагдахыг хүлээж байна ({1} илгээв). Шийдвэр гартал эх хуваарь хөдлөхгүй.',
            num(pending.rowCount), pending.author)}
          {!canApprove && ` ${tr('Батлагч шийдвэрлэсний дараа энэ хуудас дахин нээгдэнэ.')}`}
          {/* ⚠️ Хоёр эрхтэй хүнд ЯАГААД товч идэвхгүйг тайлбарлана (2026-09-08) */}
          {canApprove && isOwnSubmission
            && ` ${tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')}`}
          {/* ⚠️ ШИНЭЧЛЭХ (2026-09-23): батлагч шийдсэнийг мэдэхийн тулд хуудсаа
              бүхэлд нь дахин ачаалах шаардлагагүй — зөвхөн урсгалыг татна. */}
          {' '}
          <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void refreshFlow()}>
            {tr('Шинэчлэх')}
          </button>
          {/* ⚠️ СОЛЬЖ ХАРАХ (2026-09-29) — шийдвэр гаргаж чадах батлагчид ГАРАХГҮЙ
              (`viewSent`-ийн ⚠️): тэр «Урьдчилан харах»-аар харна. */}
          {(!canApprove || isOwnSubmission) && approving == null && (
            <span className={h.tlZoom} role="group" aria-label={tr('Хуваарийн хувилбар')} style={{ marginLeft: 8 }}>
              <button type="button" className={`${h.tlZoomB} ${!previewing ? h.tlZoomOn : ''}`}
                aria-pressed={!previewing} disabled={busy}
                title={tr('Одоо хүчинтэй, батлагдсан хуваарь')}
                onClick={() => { if (previewing) clearPreview(); }}>
                {tr('Батлагдсан хуваарь')}
              </button>
              <button type="button" className={`${h.tlZoomB} ${previewing ? h.tlZoomOn : ''}`}
                aria-pressed={previewing} disabled={busy}
                title={tr('Илгээсэн, хараахан батлагдаагүй хуваарь — зөвхөн харах')}
                onClick={() => { if (!previewing) void viewSent(); }}>
                {tr('Илгээсэн хуваарь')}
              </button>
            </span>
          )}
        </p>
      )}
      {/* ⚠️ БУЦААСАН ШАЛТГААН — гүйцэтгэгчид хүрэх цорын ганц зам. Үүнгүй бол
          «шалтгаан заавал» гэсэн дүрэм утгагүй болно. */}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.returned && (
        /* `pre-line` — шалтгааны «Зөвшөөрөгдөөгүй N мөр: …» жагсаалт тусдаа мөрөнд */
        <p className={h.err} role="status" style={{ whiteSpace: 'pre-line' }}>
          {/* ⚠️ 2026-09-29 (хэрэглэгч: «буцаасан шалтгаан зохиогчид харагдахгүй байна»):
              шалтгааныг ТУСДАА мөрөнд, шошготой, тодоор — урт мэдэгдлийн дунд уусдаг байв. */}
          <b>{tr('Хуваарь буцаагдсан')}</b>
          {` · ${lastDecision.approver ?? '—'} · ${lastDecision.approverAt == null ? '—' : dayKey(lastDecision.approverAt)}`}
          {'\n'}
          <b>{tr('Буцаасан шалтгаан')}: </b>
          {lastDecision.reason?.trim() || tr('шалтгаан бичигдээгүй')}
          {'\n'}
          {tr('Засаад дахин илгээнэ үү.')}
          {/* ⚠️ БАТЛАГЧИЙН ТЭМДЭГЛЭГЭЭ (2026-09-25) — гүйцэтгэлийн «буцаагдсан
              илгээлт ноорог болж ачаалагдана, улаан/ногоон нүдтэй» загвар.
              Ноорог ХООСОН үед л — байгаа ажлын дээр давхарлахгүй. */}
          {lastDecision.okRows && ` ${tr('Батлагч {0} мөрийг зөвшөөрсөн.', num(lastDecision.okRows.length))}`}
          {canEdit && dirtyN === 0 && (
            <>
              {' '}
              <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void restoreWithdrawn()}
                title={tr('Буцаагдсан саналыг ноорогт буулгана — зөвшөөрөгдөөгүй мөр УЛААН, зөвшөөрсөн нь НОГООН')}>
                {tr('Ноорогт буцааж засах')}
              </button>
            </>
          )}
        </p>
      )}
      {backOn && (
        <p className={h.note} role="status">
          {tr('Улаан тэмдэгтэй мөрийг батлагч зөвшөөрөөгүй — засаад дахин илгээнэ үү. Ногоон нь зөвшөөрөгдсөн.')}
        </p>
      )}
      {/* ⚠️ Зохиогч өөрөө татсан (2026-09-21) — буцаалтаас ялгаатай, шалтгаангүй. */}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.withdrawn && (
        <p className={h.note} role="status">
          {tr('Өмнөх илгээлтийг зохиогч ({0}) өөрөө татсан — засаад дахин илгээнэ.', lastDecision.author)}
          {/* ⚠️ НООРОГТ БУЦААХ (2026-09-23): «Хуваарь батлах» дарааллаас татахад
              зөвхөн төлөв хөдөлдөг (хуанли тэнд байхгүй) тул агуулга энд
              сэргээгдэнэ. Ноорог ХООСОН үед л — байгаа ажлын дээр давхарлахгүй. */}
          {canEdit && dirtyN === 0 && (
            <>
              {' '}
              <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void restoreWithdrawn()}>
                {tr('Ноорогт буцаах')}
              </button>
            </>
          )}
        </p>
      )}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.approved && (
        <p className={h.note} role="status">
          {tr('Сүүлийн хуваарь батлагдсан ({0}, {1} мөр).',
            lastDecision.approver ?? '', num(lastDecision.rowCount))}
        </p>
      )}
      {/* ⚠️ ЯГ ШАЛТГААНЫГ бичнэ (2026-09-11). Урьд нь гурван огт өөр
          шалтгаан (нэвтрээгүй · эзэн танигдахгүй · порталын алдаа) нэг л
          «олдсонгүй» мессеж болж нийлдэг тул админ юу засахаа мэдэхгүй байв. */}
      {/* ⚠️ 2026-10-01: хуваарь өөрөө ачаалагдаагүй бол (`loadErr`) урсгалын баннер ДАВХАР
          алдаа болж (ихэвчлэн ижил шалтгаан — эрх/токен) хоёр удаа гардаг байв — нэг л удаа. */}
      {flowReady === false && canEdit && !loadErr && (
        <p className={h.err} role="alert">
          {flowWhy || tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')}
          {' '}
          {tr('Түүнийг хүртэл хуваарь илгээх боломжгүй.')}
        </p>
      )}

      {busy && !rows.length ? (
        <Loading label={tr('Хуваарь ачаалж байна…')} />
      ) : loadErr ? (
        /* ⚠️ 2026-10-01: ачаалах алдаа — `Data`-гийн нэг загвар (тайлбар · техникийн мөр · дахин оролдох) */
        <Data q={{ state: 'error', data: null, error: loadErr, retry: () => setReloadN((n) => n + 1) }}>{() => null}</Data>
      ) : !sc || !rows.length ? (
        <Empty label={tr('Энэ багцад мөр олдсонгүй.')} />
      ) : (
        /* ⚠️ `title`/`note` ӨГӨХГҮЙ — толгойн мөр нь дээрх нэгтгэсэн зурваст
           уусав. `Section` нь `title`-гүй үед header-ээ огт зурдаггүй. */
        <Section fill>
          <div className={h.fullBar}>
            {!review && (
            <button
              type="button"
              className={wide ? h.fullBtnOn : h.fullBtn}
              onClick={() => setWide((v) => !v)}
              aria-pressed={wide}
              title={wide ? tr('Бүтэн дэлгэцээс гарах (Esc)') : tr('Хуваарийг бүтэн дэлгэцээр')}
            >
              <span aria-hidden>{wide ? '✕' : '⛶'}</span>
              {wide ? tr('Багасгах') : tr('Бүтэн дэлгэц')}
            </button>
            )}
            {isWide && (
              <span className={h.fullBarNote}>
                {review
                  ? `${tr('Хуваарь шийдвэрлэх')} · ${pkg.label} · ${kind === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө')}`
                  /* ⚠️ 2026-09-29 (аудит 10): `dirtyRows` — толгойн «хадгалаагүй N»-тэй ижил тоо */
                  : `${pkg.label}${dirtyN ? ` · ${tr('өөрчлөлт')} ${num(dirtyRows)}` : ''}`}
              </span>
            )}
          </div>
          {/* ⚠️ Хяналтын заавар — «Батлах» яагаад хаалттайг ИЛ хэлнэ */}
          {review && (
            <p className={h.plHint}>
              {tr('Өөрчлөгдсөн мөр улаан хүрээтэй · хуучин огноо нь зурвасын доор бүдгээр · ажлын кодын ✕ дээр дарж зөвшөөрнө (ногоон ✓) · нэр дээр дарж дэлгэрэнгүйг харна · бүгд ногоон болсны дараа «Батлах» идэвхжинэ')}
            </p>
          )}
          {canEdit && !locked && sc.bld.length > 1 && (
            <div className={h.gBlks} role="group" aria-label={tr('Олон блок сонгох')}>
              <span className={h.gBlksLabel}>{tr('Олон блок сонгох')}</span>
              {sc.bld.map((b, k) => {
                const on = k === blk || gBlks.has(k);
                return (
                  <button type="button" key={b}
                    className={`${h.gChip} ${on ? h.gChipOn : ''} ${k === blk ? h.gChipAct : ''}`}
                    aria-pressed={on}
                    title={k === blk
                      ? tr('Идэвхтэй блок — хуанли дээр энэ блок харагдана (дээрх «Блок» сонгогчоор солино)')
                      : tr('Энэ блокт зэрэг төлөвлөх')}
                    onClick={() => {
                      if (k === blk) return;
                      setGBlks((s0) => { const m = new Set(s0); if (m.has(k)) m.delete(k); else m.add(k); return m; });
                    }}>
                    {b}
                  </button>
                );
              })}
              <button type="button" className={h.tlZoomB}
                onClick={() => setGBlks(new Set(sc.bld.map((_, k) => k)))}>{tr('Бүгд')}</button>
              <button type="button" className={h.tlZoomB} disabled={gBlks.size === 0 || (gBlks.size === 1 && gBlks.has(blk))}
                onClick={() => setGBlks(new Set())}>{tr('Цэвэрлэх')}</button>
              {new Set([blk, ...gBlks]).size > 1 && (
                <span className={h.gBlksNote}>
                  {tr('{0} блокт зэрэг төлөвлөнө — ажлын цонхонд «Тавих» дарахад сонгосон бүх блокт ижил огноо тавигдана', num(new Set([blk, ...gBlks]).size))}
                </span>
              )}
            </div>
          )}
          {allOn ? (
            /* ⚠️ «Бүх блок» горим — зөвхөн харах; засах зам нь блокийн мөр (2026-10-04) */
            <p className={h.plHint}>
              {tr('Бүх блок — зөвхөн харах. Ажлын зурвас нь бүх блокийн нийт муж; доорх мөрүүд блок бүрийнх. Блокийн мөр дээр дарж тэр блок руу орж засна.')}
            </p>
          ) : canEdit && (
            <p className={h.plHint}>
              {tr('Ажлын нэр дээр дарж хуанлиар оруулна · мөрийн ард чирж муж татна · зурвасын голоос чирж зөөнө · ирмэгээс татаж уртасгана')}
              {kind === 'plan' && ` · ${tr('баруун цэгээс чирж холбоно · сум дээр дарж засна')}`}
            </p>
          )}

          {/* ── НЭГ БҮТЭН ХҮСНЭГТ: зүүн мод + баруун хуанли ── */}
          {visible.length === 0 ? (
            <Empty label={tr('Мөр алга.')} />
          ) : (
            <div className={h.gWrap} ref={scrollRef} onScroll={onScroll}>
              <div ref={sideRef} style={sideStyle} className={`${h.gSide} ${cols ? '' : h.gSideNarrow}`}>
                {/* ⚠️ 2026-10-04: баруун ирмэгийг чирж жагсаалтыг томруулна (`useSideExtra`) */}
                <button type="button" className={`${h.sideGrip}${sideGrip.dragging ? ` ${h.sideGripOn}` : ''}`}
                  role="separator" aria-orientation="vertical"
                  aria-label={tr('Жагсаалтын өргөн')} aria-valuenow={sideGrip.extra}
                  title={tr('Чирж жагсаалтыг өргөсгөнө · давхар дарвал анхны өргөн')}
                  onPointerDown={sideGrip.onPointerDown} onKeyDown={sideGrip.onKeyDown}
                  onDoubleClick={sideGrip.onDoubleClick} />
                <div className={h.gSideHead} style={{ height: PL_ROW }}>
                  <span className={h.gHeadDes}>{tr('Ажлын код')}</span>
                  <span className={h.gHeadWork}>
                    {tr('Ажил')}
                    {/* ⚠️ Хураах товч нь НЭРИЙН толгойд — нуугдах багануудын өмнө,
                        тэдгээр нуугдсан ч товч байрандаа үлдэнэ (нуугдсан
                        багана дотор байсан бол буцааж нээх аргагүй болно). */}
                    <button type="button" className={h.colsBtn}
                      onClick={() => setCols((v) => !v)}
                      title={cols ? tr('Огноо · нөөцийн баганыг хураах') : tr('Огноо · нөөцийн баганыг нээх')}
                      aria-label={tr('Огноо · нөөцийн багана')}
                      aria-expanded={cols}>
                      {cols ? '◂' : '▸'}
                    </button>
                  </span>
                  {/*
                    * ДӨРВӨН ОГНООНЫ БАГАНА (2026-09-15, хэрэглэгчийн хүсэлт:
                    * «ажилбар бүрийн ард 4 багана нэмнэ — гэрээний эхлэх,
                    * дуусах, инженерийн эхлэх, дуусах огноо»).
                    *
                    * ⚠️ ХОЁР ТӨРЛИЙГ ЗЭРЭГ: хуанли нь ЗӨВХӨН идэвхтэй табын
                    *    огноог зурдаг тул гэрээ ба төлөвлөгөөг зэрэгцүүлж
                    *    харахын тулд табаа солих шаардлагатай байв. Эдгээр
                    *    багана нь хоёуланг нь НЭГ мөрөнд гаргана.
                    *
                    * ⚠️ ЗАСАГДАХГҮЙ — зөвхөн УНШИНА. Огноо засах цорын ганц
                    *    зам нь хуанли дээр чирэх (`onDown`) ба popup хэвээр:
                    *    хоёр өөр засварын зам үүсвэл аль нь үнэн болох нь
                    *    бүрхэг болно.
                    */}
                  <span className={h.gHeadDate}>{tr('Гэрээ эхлэх')}</span>
                  <span className={h.gHeadDate}>{tr('Гэрээ дуусах')}</span>
                  {/* ⚠️ ХОНОГ нь ТУСДАА БАГАНА (2026-09-15, хэрэглэгч).
                      Огнооны нүдэнд шигтгэвэл тэр нүд хоёр утга агуулж,
                      эрэмбэлэх · хуулах · нүдээр гүйлгэх бүгд хүндэрнэ. */}
                  <span className={h.gHeadDays}>{tr('Хоног')}</span>
                  {/* ⚠️ «Төлөвлөгөөт» (2026-09-23, хэрэглэгч) — хажууд «Бодит» багана
                      нэмэгдсэн тул «Төлөвлөгөө эхлэх» гэвэл аль нь төлөвлөгөө, аль нь
                      баримт болох нь бүрхэг. */}
                  <span className={h.gHeadDate}>{tr('Төлөвлөгөөт эхлэх')}</span>
                  <span className={h.gHeadDate}>{tr('Төлөвлөгөөт дуусах')}</span>
                  <span className={h.gHeadDays}>{tr('Хоног')}</span>
                  {/*
                    * БОДИТ ЭХЭЛСЭН / ДУУССАН (2026-09-23) — идэвхтэй блокийн (`blk`)
                    * утга; popup-аас засагдана, энд зөвхөн харуулна (дээрх ⚠️-тэй
                    * ижил: засварын нэг л зам). Бүлгийн мөрд хүүхдийн MIN/MAX.
                    * ⚠️ Талбар байхгүй багцад багана ОГТ гарахгүй (`hasActual`).
                    */}
                  {hasActual && <span className={h.gHeadDate}>{tr('Бодит эхэлсэн')}</span>}
                  {hasActual && <span className={h.gHeadDate}>{tr('Бодит дууссан')}</span>}
                  {/* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — мөрийн нөөц; бүлэгт нийлбэр. */}
                  {hasRes && <span className={h.gHeadRes} title={tr('Хүн хүч')}>{tr('Хүн')}</span>}
                  {hasRes && <span className={h.gHeadRes} title={tr('Машин механизм')}>{tr('Техник')}</span>}
                  {/* ⚠️ ЖИШЭЭГ ТОЛГОЙД (2026-09-15): нүдний `placeholder`-т
                      тавьбал 1,400 хоосон мөр бүгд «11FS14» гэж харагдаж,
                      бодит утга мэт уншигдана. Толгойд нэг удаа бичих нь
                      бичиглэлийг заах ба хүснэгтийг цэвэр үлдээнэ. */}
                  <span className={h.gHeadHam} title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5. @2 = зөвхөн 2-р блок (@-гүй = бүх блок)')}>
                    {tr('Хамаарал')} <i className={h.gHeadHint}>11FS14</i>
                  </span>
                </div>
                {/* ⚠️ ЗАЙ БАРИГЧ: зүүн мөрүүд УРСГАЛД байдаг тул зурагдаагүй
                    мөрүүдийн өндрийг орлуулахгүй бол гүйлтийн урт агшиж, зүүн
                    жагсаалт ба баруун зурвас хоорондоо гулсана. */}
                {winFrom > 0 && <div aria-hidden style={{ height: winFrom * PL_ROW }} />}
                {slice.map(({ r: d }) => {
                  const r = d.r;
                  /* «БҮХ БЛОК» — блокийн ДЭД МӨР (2026-10-04): зөвхөн харах; дарахад тэр блок руу */
                  if (d.b >= 0) {
                    const xb = r.group ? effRow(r) : r;
                    return (
                      <BlockRow
                        key={`${r.oid}@${d.b}`}
                        r={r}
                        name={sc.bld[d.b] ?? ''}
                        on={sel === r.oid && blk === d.b}
                        hasActual={hasActual}
                        hasRes={hasRes}
                        aStart={xb.aStart?.[d.b] ?? null}
                        aEnd={xb.aEnd?.[d.b] ?? null}
                        geree={kind === 'geree' ? d.sp : refSpanOf(r.oid, d.b)}
                        tolov={kind === 'geree' ? refSpanOf(r.oid, d.b) : d.sp}
                        onPick={() => pickBlk(r.oid, d.b)}
                      />
                    );
                  }
                  /* Бүлгийн бодит огноо · нөөц хүүхдээс (2026-09-23, `aggExtra`) */
                  const x = r.group ? effRow(r) : r;
                  /* ⚠️ «Бүх блок» горимд эх мөрийн бодит огноо — бүх блокийн нэгдэл (`actUnion`) */
                  const xa = allOn ? actUnion(x.aStart, x.aEnd) : null;
                  return (
                  <TaskRow
                    key={r.oid}
                    r={r}
                    on={sel === r.oid}
                    /* ⚠️ УЯЛДААНЫ ноорог ч «хадгалаагүй» тэмдэг авна — эс
                       бөгөөс зөвхөн уялдаа нь өөрчлөгдсөн мөр цэвэр мэт
                       харагдаж, юу хадгалагдахыг тоолж болохгүй байв.
                       Бодит огноо · нөөцийн ноорог мөн адил (2026-09-23).
                       Сарын обьём/нөөцийн ноорог (`des|блок`) ч мөн (2026-09-24 аудит). */
                    dirty={draft.has(r.oid) || ham.has(r.oid) || aDraft.has(r.oid) || resDraft.has(r.oid)
                      || (r.des != null && obDirtyDes.has(r.des))}
                    hasActual={hasActual}
                    hasRes={hasRes}
                    aStart={xa ? xa.start : x.aStart?.[blk] ?? null}
                    aEnd={xa ? xa.end : x.aEnd?.[blk] ?? null}
                    hun={x.hun ?? null}
                    mashin={x.mashin ?? null}
                    collapsed={collapsed.has(r.oid)}
                    onToggle={() => {
                      /* ⚠️ ГАРААР эвхэхэд түвшний товч ТОДРОХГҮЙ болно
                         (`lvl = 0`) — дэлгэц дээрх байдалтай зөрчилдсөн
                         тодруулга үлдэх ёсгүй (`Finance.lvOn`-ийн ижил дүрэм). */
                      setLvl(0);
                      setCollapsed((s) => {
                        const m = new Set(s);
                        if (m.has(r.oid)) m.delete(r.oid); else m.add(r.oid);
                        return m;
                      });
                    }}
                    /* ⚠️ «Бүх блок» горимд popup НЭЭГДЭХГҮЙ — зөвхөн сонгоно (2026-10-04) */
                    onPick={allOn ? () => setSel(r.oid) : () => { setSel(r.oid); setModal(r.oid); }}
                    /* ⚠️ ХОЁР ТӨРЛИЙН огноог зэрэг өгнө. `r` нь ИДЭВХТЭЙ
                       табынх, `refByOid` нь НӨГӨӨ табынх — аль нь гэрээ, аль
                       нь төлөвлөгөө болохыг `kind`-ээр шийднэ. */
                    /* ⚠️ БҮЛГИЙН мөрд `effSpan` (хүүхдийн MIN/MAX) — зурвас ба popup-тай
                       ИЖИЛ эх (2026-09-23 аудит). Урьд нь `rowSpan` (өөрийн хадгалсан
                       муж) байсан тул блокгүй багцын бүлэгт «—», хажууд нь бүтэн
                       зурвас гардаг байв. */
                    /* ⚠️ «Бүх блок» горимд — бүх блокийн НЭГДЭЛ (`d.sp` · `refSpanOf(…, -1)`), 2026-10-04 */
                    geree={allOn ? (kind === 'geree' ? d.sp : refSpanOf(r.oid, -1)) : kind === 'geree' ? rowSpanAt(r) : refSpanAt(r.oid)}
                    tolov={allOn ? (kind === 'geree' ? refSpanOf(r.oid, -1) : d.sp) : kind === 'geree' ? refSpanAt(r.oid) : rowSpanAt(r)}
                    /* ⚠️ Уялдааг нүдэнд ШУУД бичих зам (`HamCell`). Түгжээтэй
                       (батлагдахыг хүлээж буй илгээлт) үед ч засагдахгүй —
                       `applyHamText` дотор `locked` шалгагдана. */
                    /* ⚠️ 2026-09-29 аудит: уялдааны нүд ЗӨВХӨН төлөвлөгөө табд засагдана */
                    canEdit={canEdit && !locked && kind === 'plan' && !allOn}
                    onHamText={applyHamText}
                    /* ⚠️ ОГНОО ШУУД БИЧИХ (2026-10-05) — ажлын мөр л; бүлэг (хүүхдээс
                       MIN/MAX), нэмэлт мөр, «Бүх блок» горимд засагдахгүй */
                    onDate={!r.group && r.oid >= 0 && !allOn && canEdit && !locked
                      ? (w, dd) => applyDate(r.oid, w, dd) : undefined}
                    /* ⚠️ ҮРГЭЛЖЛЭХ ХОНОГ бичих (2026-10-06) — огноотой ижил нөхцөл */
                    onDays={!r.group && r.oid >= 0 && !allOn && canEdit && !locked
                      ? (d) => applyDate(r.oid, 'days', String(d)) : undefined}
                    edKind={kind}
                    /* НЭМЭЛТ АЖИЛ (2026-09-24): бүлэгт «+», батлагдаагүй мөрд улаан + «×» */
                    added={r.oid < 0}
                    /* ⚠️ «Бүх блок» горимд мөр нэмэх/засах/хасах хаалттай (зөвхөн харах, 2026-10-04) */
                    onAdd={r.group && canAddRow && !locked && !allOn
                      ? () => { setAddFor((x) => (x === r.oid ? null : r.oid)); setEditAdd(null); setAddForm(EMPTY_FORM); setAjErr(''); }
                      : undefined}
                    onDrop={r.oid < 0 && !allOn ? () => dropAdd(r.oid) : undefined}
                    /* НЭМЭЛТ МӨР ЗАСАХ (2026-09-29) — илгээгээгүй ба засварт нээсэн мөрд */
                    onEditAdd={r.oid < 0 && canAddRow && !allOn ? () => {
                      const a0 = adds.find((x) => x.oid === r.oid);
                      if (!a0) return;
                      setAddFor(null); setAjErr('');
                      setEditAdd((x) => (x === r.oid ? null : r.oid));
                      setAddForm({ no: a0.no, work: a0.work, vol: a0.vol == null ? '' : String(a0.vol), unit: a0.unit == null ? '' : String(a0.unit) });
                    } : undefined}
                    /* ЗӨВШӨӨРӨЛ (2026-09-25): хяналтад — батлагч сэлгэнэ; гүйцэтгэгчид —
                       буцаасан шийдвэрийн улаан/ногоон (зөвхөн харуулна). */
                    mark={markOf(r)}
                    onMark={marking && markOf(r) ? () => toggleOk(r.oid) : undefined}
                  >
                    {addFor === r.oid && !allOn && (
                      <AddBox parent={r} form={addForm} onForm={setAddForm}
                        onOk={() => addRow(r)} onCancel={() => setAddFor(null)} />
                    )}
                    {editAdd === r.oid && r.oid < 0 && !allOn && (
                      <AddBox parent={r} form={addForm} onForm={setAddForm} edit
                        onOk={() => saveEditAdd(r.oid)} onCancel={() => setEditAdd(null)} />
                    )}
                  </TaskRow>
                  );
                })}
                {winTo < disp.length && (
                  <div aria-hidden style={{ height: (disp.length - winTo) * PL_ROW }} />
                )}
              </div>

              <div className={h.gRight}>
                <div className={h.gTrack} style={{ width: W }} ref={trackRef}>
                  {/* ⚠️ ЧИРЖ ГҮЙЛГЭХ (2026-09-17, хэрэглэгч: «зүүн баруун гүйлт ажиллахгүй»):
                      сарын толгойн зурвас дээр чирвэл хуанли хэвтээ гүйнэ — гүйлтийн
                      зурвас нарийн, харагдахгүй байсан. Ажлын мөр дээр чирэх нь
                      урьдын адил зурвас үүсгэнэ/зөөнө. */}
                  {calHead}

                  {/* ⚠️ 2026-10-01: `plLanesEdit` (touch-action: none) ЗӨВХӨН засах эрхтэй
                      үед — бусдад мэдрэгч дэлгэц дээр хуанли ердийнхөөрөө гүйнэ.
                      `pointercancel` нь `onCancel`: хагас чирэлтийг буцааж, popup нээхгүй. */}
                  {/* ⚠️ «Бүх блок» горимд засахгүй тул `plLanesEdit` үгүй — мэдрэгчид ердийн гүйлгээ (2026-10-04) */}
                  <div className={`${h.plLanes} ${canEdit && !locked && !allOn ? h.plLanesEdit : ''}`}
                    ref={lanesRef}
                    style={{ height: disp.length * PL_ROW }}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                  >
                    {calGrid}

                    {slice.map(({ r: d, k }) => {
                      /* «БҮХ БЛОК» — зөвхөн харах эгнээ (`allLane`, 2026-10-04); энгийн горим ХЭВЭЭР доор */
                      if (allOn) return allLane(d, k);
                      const r = d.r;
                      /* ⚠️ БҮЛГИЙН ЗУРВАС нь ХҮҮХДҮҮДЭЭСЭЭ бодогдоно
                         (`effSpan`) — хадгалагдсан хуучин огноо нь
                         тэдэнтэй зөрж байсан ч ЗӨВ мужийг харуулна. */
                      const sp = r.group ? effAt(r.i) : r.spans[blk];
                      const st = sp ? statusOf(sp, r.act?.[blk], now) : 'none';
                      /* Уялдааны зөрчил — шаардлагаас ӨМНӨ эхэлсэн зурвасыг
                         улаан хүрээгээр тэмдэглэнэ (хориглохгүй) */
                      /* ⚠️ Гэрээ табд зөрчил ТООЦОХГҮЙ (2026-09-23) — сумтай ижил. */
                      const need = sp && r.deps.length && kind === 'plan'
                        ? requiredStart(plan, byCode, r.i, blk) : null;
                      const viol = !!(sp && need != null && sp.start < need);
                      /*
                       * ХУУЧИН (СЕРВЕРИЙН) ЗУРВАС (2026-09-25) — батлагчийн хяналтад
                       * ба буцаасан саналыг засахад: өөрчлөгдсөн мөрийн ОДООГИЙН
                       * батлагдсан огноо доод хагаст бүдгээр («юу байсан → юу болох»).
                       * ⚠️ `base` нь серверийн мөр, `plan`-тай ИЖИЛ индекстэй.
                       * ⚠️ Огноо ижил бол ЗУРАХГҮЙ — зөвхөн уялдаа/обьём өөрчлөгдсөн мөрд
                       *    давхар зурвас «огноо өөрчлөгдсөн» мэт андуурагдана.
                       * ⚠️ Хуучин огноогүй бол зурахгүй (`null ≠ 0`) — шинэ муж л харагдана.
                       */
                      const oldSp = (review || backOn) && !r.group && reviewSet.has(r.oid)
                        ? base[r.i]?.spans[blk] ?? null : null;
                      const showOld = !!(oldSp && !showRef && (!sp || oldSp.start !== sp.start || oldSp.end !== sp.end));
                      const half = showRef || showOld;
                      return (
                        <div key={r.oid}
                          className={`${h.plLane} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.oid ? h.plLaneOn : ''} ${link && !hierRelated(plan, r.i, link.i) ? h.plLaneDrop : ''}`}
                          style={{ top: k * PL_ROW, height: PL_ROW }}
                          data-row={r.i}
                          onPointerDown={(e) => onDown(e, r, 'new')}
                        >
                          {/*
                            * ЛАВЛАГААНЫ ЗУРВАС — нөгөө төрлийн огноо (2026-09-11).
                            *
                            * ⚠️ Мөрийн ДООД хагаст, сонгосон төрлийн зурвасын ДООР
                            *    зэрэгцэнэ (ард нь биш) — хэрэглэгчийн хүсэлт. Хоёр
                            *    огнооны зөрүү нь хэвтээ шилжилтээр шууд уншигдана.
                            * ⚠️ Огноо ИЖИЛ байсан ч ЗУРНА: зэрэгцсэн хоёр зурвас нь
                            *    давхцахгүй тул «ижил байна» гэдэг нь өөрөө мэдээлэл.
                            * ⚠️ Зөвхөн нөгөө төрөлд огноо БАЙГАА үед — байхгүйг
                            *    «тэг» гэж зурахгүй (`null ≠ 0`).
                            */}
                          {(() => {
                            if (!showRef) return null;
                            const rr = refByOid.get(r.oid);
                            if (!rr) return null;
                            const rsp = r.group ? effSpan(refBase, rr.i, blk) : rr.spans[blk];
                            if (!rsp) return null;
                            const other = kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ');
                            return (
                              <div
                                className={h.plRef}
                                style={{ left: xOf(rsp.start), width: Math.max(6, spanDays(rsp) * px - 1) }}
                                title={`${other}: ${msToDay(rsp.start)} → ${msToDay(rsp.end)} (${tr('{0} хоног', spanDays(rsp))})`}
                              />
                            );
                          })()}
                          {/*
                            * БОДИТ МУЖ (2026-09-23) — мөрийн ХАМГИЙН ДООД захад 3px нарийн
                            * зурвас: бодит эхэлсэн → бодит дууссан (дуусаагүй бол → өнөөдөр,
                            * тасархай хэлбэрээр — «үргэлжилж байна»). `plRef`-ийн ижил ёс:
                            * `pointer-events: none`, чирэгдэхгүй, засагдахгүй (popup-аас).
                            * ⚠️ Төлөвлөгөөт зурвастай ЗЭРЭГЦЭНЭ — зөрүү нь хэвтээ шилжилтээр
                            *    уншигдана. Бодит огноогүй бол ЮУ Ч зурахгүй (`null ≠ 0`).
                            * ⚠️ Бүлгийн мөрд хүүхдийн MIN/MAX (`aggExtra`).
                            */}
                          {hasActual && (() => {
                            const x = r.group ? effRow(r) : r;
                            const as0 = x.aStart?.[blk] ?? null;
                            if (as0 == null) return null;
                            const ae0 = x.aEnd?.[blk] ?? null;
                            const to2 = ae0 ?? Math.max(as0, now);
                            return (
                              <div
                                className={`${h.plAct} ${ae0 == null ? h.plActOpen : ''}`}
                                style={{ left: xOf(as0), width: Math.max(4, spanDays({ start: as0, end: to2 }) * px - 1) }}
                                title={`${tr('Бодит')}: ${msToDay(as0)} → ${ae0 != null ? msToDay(ae0) : tr('үргэлжилж байна')}`}
                              />
                            );
                          })()}
                          {showOld && oldSp && (
                            <div
                              className={`${h.plRef} ${h.plOld}`}
                              style={{ left: xOf(oldSp.start), width: Math.max(6, spanDays(oldSp) * px - 1) }}
                              title={`${tr('Одоогийн (батлагдсан)')}: ${msToDay(oldSp.start)} → ${msToDay(oldSp.end)} (${tr('{0} хоног', spanDays(oldSp))})`}
                            />
                          )}
                          {sp && (
                            <div
                              className={`${h.plBar} ${half ? h.plBarHalf : ''} ${r.group ? h.plBarG : ST_CLASS[st]} ${sel === r.oid ? h.tlBarOn : ''} ${viol ? h.plBarViol : ''}`}
                              style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
                              onPointerDown={(e) => onDown(e, r, 'move')}
                              aria-label={`${r.work || r.no} · ${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
                              title={`${r.work}\n${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))}) · ${stText(st)}`}
                            >
                              {/* ⚠️ Бариул нь зөвхөн АЖЛЫН зурваст: бүлгийнх
                                  бодогдох тул сунгах утгагүй. */}
                              {!r.group && (
                                <span className={h.plGrip} onPointerDown={(e) => onDown(e, r, 'l')} />
                              )}
                              {/* ⚠️ БҮТЭН ОГНОО (2026-09-01, хэрэглэгч): урьд нь «09-12→11-13»
                                  гэж жилгүй байв. Хуанли 2025–2028 оныг дамждаг тул жилгүй
                                  огноо аль жилийнх нь нь тодорхойгүй байсан. Дөрвөн шат:
                                  нэр+бүтэн огноо → бүтэн огноо → он-сар → хоног → юу ч үгүй.

                                  ⚠️ АЖЛЫН НЭР зөвхөн ХАМГИЙН ӨРГӨН зурваст (2026-09-02,
                                  хэрэглэгч). Огноо нь ~120px эзэлдэг тул нэрийг доогуур
                                  шатанд нэмбэл гурав дөрвөн үсэг + «…» л үлдэж, мэдээлэл
                                  өгөхийн оронд огноог л түлхэж гаргана. Нэр нь агшиж
                                  (`plBarName` ellipsis), огноо нь агшихгүй. */}
                              {/*
                                * ⚠️ ОГНОО ДЭЭР ДООР (2026-09-11, хэрэглэгч): эхлэх огноо
                                *    ДЭЭД мөрөнд, дуусах огноо ба хоног ДООД мөрөнд. Зурвас
                                *    22px тул 9.5px үсэг хоёр мөр багтана; нэг мөрт «→»-өөр
                                *    бичихэд 178px шаарддаг байсныг богиносгож, дунд урттай
                                *    зурвас ч бүтэн огноотой болов. Чирэхэд `sp` шинэчлэгдэх
                                *    тул огноо шууд дагана.
                                * ⚠️ «Зэрэг» асаалттай (`showRef`) үед зурвас 11px — хоёр
                                *    мөр багтахгүй тул хуучин нэг мөрийн шатлал үлдэнэ.
                                *
                                * ⚠️ БОСГО 100px (2026-09-15-ны аудит). Урьд нь 66px байсан
                                *    нь ДООД мөрийн бодит өргөнөөс бага: «2026-04-18 · 187х»
                                *    нь 9.5px tabular-nums дээр ~94px, дээр нь `.plBar`-ын
                                *    хоёр `plGrip` ба хүрээ ~6px иднэ. `white-space: nowrap`
                                *    + `overflow: hidden` тул илүү нь ellipsis-гүй ТАСАРЧ,
                                *    «2026-04-1» гэж хагас огноо гардаг байв. Доод шат
                                *    (118px `short()`) -аас бага байх ёстой тул 100px.
                                */}
                              {!half && spanDays(sp) * px > 100 ? (
                                <span className={`${h.plBarLab} ${h.plBarTwo}`}>
                                  {spanDays(sp) * px > 250 && (
                                    <span className={h.plBarName}>{r.work || r.no}</span>
                                  )}
                                  <span className={h.plBarWhen}>
                                    <span>{msToDay(sp.start)}</span>
                                    <span>{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}</span>
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 250 ? (
                                <span className={h.plBarLab}>
                                  <span className={h.plBarName}>{r.work || r.no}</span>
                                  <span className={h.plBarWhen}>
                                    {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 178 ? (
                                <span className={h.plBarLab}>
                                  {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 118 ? (
                                <span className={h.plBarLab}>
                                  {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 40 ? (
                                <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
                              ) : null}
                              {!r.group && (
                                <span className={`${h.plGrip} ${h.plGripR}`}
                                  onPointerDown={(e) => onDown(e, r, 'r')} />
                              )}
                              {/* ХОЛБОХ БАРИУЛ — баруун захын дугуй; чирээд нөгөө мөр дээр тавина (2026-09-22).
                                  ⚠️ Бүлгийн зурваст ч бий — бүлэг урд ажил болж чадна (`effSpan`).
                                  ⚠️ (2026-09-23) ЗӨВХӨН төлөвлөгөө табд — гэрээ гинжээр хөдөлдөггүй. */}
                              {canEdit && !locked && kind === 'plan' && (
                                <span className={h.plLink}
                                  onPointerDown={(e) => startLink(e, r)}
                                  title={tr('Хамаарал холбох — чирээд дараагийн ажлын мөр дээр тавина (FS)')} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── УЯЛДААНЫ СУМУУД ──
                        ⚠️ Зурвасуудын ДЭЭР давхарласан SVG, `pointer-events:
                        none` — чирэлт, товшилтод огт саад болохгүй. Сум нь
                        зөвхөн ХОЁУЛАА харагдаж буй мөрүүдийн хооронд зурагдана:
                        шүүлт/эвхэлтэд нуугдсан үзүүр рүү зурвал агаарт дүүжлэгдэнэ. */}
                    {(arrows.length > 0 || link) && (
                      /* ⚠️ (2026-09-23) `depSvgLink` — холбох чирэлтийн үед `depHit`-ийн
                         pointer-events унтарна: эс бөгөөс сумны зурвас дээр суллахад
                         `elementFromPoint` сумыг онож, мөр олдохгүй. */
                      <svg className={`${h.depSvg} ${link ? h.depSvgLink : ''}`} width={W} height={disp.length * PL_ROW} aria-hidden>
                        <defs>
                          {[h.depArrN, h.depArrH, h.depArrB].map((c, k) => (
                            <marker key={c} id={`hvDepArr${k}`} viewBox="0 0 6 6" refX="5" refY="3"
                              markerWidth="5.5" markerHeight="5.5" orient="auto">
                              <path d="M0 0 L6 3 L0 6 z" className={c} />
                            </marker>
                          ))}
                        </defs>
                        {arrows.map((a2) => (
                          <g key={a2.key}>
                            <path d={a2.d} className={a2.cls} markerEnd={a2.mk} />
                            {/* ⚠️ ХОЛБООС ДЭЭР ДАРЖ ЗАСАХ/УСТГАХ (2026-09-22, хэрэглэгч: «хамаарлыг
                                устгаж чадахгүй байна»). SVG нь pointer-events: none (чирэлтэд саад
                                болохгүй) тул ЗӨВХӨН энэ тунгалаг өргөн зурвас (`depHit`) дарагдана —
                                нарийн шугамыг онох шаардлагагүй. Цонх нь ижил LinkModal, «Уялдаа
                                устгах» товчтой.
                                ⚠️ (2026-09-23) ЗӨВХӨН төлөвлөгөө табд (`kind === 'plan'`) — гэрээнд
                                уялдаа засахгүй. Зурвас (`.plBar`) нь CSS-ээр SVG-ээс ДЭЭШ тул
                                зурвасын дээрх даралт зурвасд очно; сум зөвхөн хоосон талбайд дарагдана. */}
                            {canEdit && !locked && kind === 'plan' && (
                              <path d={a2.d} className={h.depHit}
                                onClick={(e) => { e.stopPropagation(); setLinkAsk({ so: plan[a2.si].oid, to: plan[a2.ti].oid, dblks: a2.dblk == null ? null : [a2.dblk] }); }}>
                                <title>{tr('Дарж засах / устгах')}</title>
                              </path>
                            )}
                          </g>
                        ))}
                        {/* ТҮР ШУГАМ — холбох чирэлтийн үед урд ажлын баруун захаас курсор хүртэл */}
                        {link && (() => {
                          const k = visible.findIndex((v) => v.i === link.i);
                          const ps = k >= 0 ? effAt(link.i) : null;
                          if (!ps) return null;
                          const sx = xOf(ps.end + DAY);
                          const sy = k * PL_ROW + PL_ROW / 2;
                          return <path d={`M ${sx} ${sy} L ${link.x} ${link.y}`} className={h.depDraft} markerEnd="url(#hvDepArr1)" />;
                        })()}
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {linkAsk && linkRows && (
        <LinkModal
          src={linkRows.s}
          dst={linkRows.t}
          blks={linkAsk.dblks}
          blocks={sc?.bld ?? []}
          onClose={() => setLinkAsk(null)}
          onRemove={() => {
            const { s, t } = linkRows;
            setLinkAsk(null);
            if (s.des == null) return;
            const code = s.des;
            /* ⚠️ Ялгах тэмдэг (код, блок) — 2026-09-24: ижил кодын СОНГООГҮЙ блокийн уялдаа хэвээр.
               Олон блок (2026-10-01) — сонгосон блок бүрийнхийг хасна.
               Хоосон болвол `[]` — «цэвэрлэ» гэсэн утга (`null` = хөндөхгүй). */
            const ids = linkAsk.dblks ?? [undefined];
            applyModal(t.oid, null, t.deps.filter((d) => !ids.some((b) => sameDep(d, { code, blk: b }))), null);
          }}
          onApply={(type, lag) => {
            const { s, t } = linkRows;
            setLinkAsk(null);
            if (s.des == null) return;
            const code = s.des;
            /* Ижил (код, блок)-ийн хуучин уялдааг сольж бичнэ — нэг хос нэг удаа.
               ⚠️ ОЛОН БЛОК (2026-10-01): сонгосон блок бүрд тусдаа `@N` уялдаа.
               `collapse` (бүх блок) — тэр кодын бүх `@N`-ийг хасаад блокгүй нэгийг. */
            const ids = linkAsk.dblks ?? [undefined];
            const keep = t.deps.filter((d) => (linkAsk.collapse
              ? d.code !== code
              : !ids.some((b) => sameDep(d, { code, blk: b }))));
            const add: Dep[] = ids.map((b) => ({ code, type, lag, ...(b != null ? { blk: b } : {}) }));
            applyModal(t.oid, null, [...keep, ...add], null);
          }}
        />
      )}

      {modalRow && sc && (
        <PlanModal
          r={modalRow}
          par={modalPar}
          blocks={sc.bld}
          blk={blk}
          initSel={gBlks}
          takt={takt}
          /* ⚠️ `locked` — хүлээгдэж буй илгээлт байхад popup-аас ч засахгүй.
             Зөвхөн `onDown`-г түгжвэл хуанлийн цонх нээлттэй хэвээр үлдэнэ. */
          canEdit={canEdit && !locked}
          onBlk={setBlk}
          onTakt={setTakt}
          cands={depCands}
          /* ⚠️ 2026-09-29 аудит: уялдаа · сарын обьём/нөөц ЗӨВХӨН төлөвлөгөө табд —
             гэрээний огноонд `mvOk` (төлөвлөгөөний сарын нийлбэр) шаардаж, гинжээр
             гэрээг хөдөлгөдөг байв. */
          hasHam={!!sc.f.ham && kind === 'plan'}
          /* ⚠️ 2026-10-04: `applyModal`-тай ижил эх (ноорог → сервер) — popup талбарын уртыг шалгана */
          hamKeep={residualDeps(ham.get(modalRow.oid) ?? rowsAll.find((x) => x.oid === modalRow.oid)?.ham ?? null)}
          hasActual={hasActual}
          hasRes={hasRes}
          obyem={kind === 'plan'}
          months={obOf(modalRow.des, sc.bld[blk] ?? "")}
          badBlks={modalBad}
          /* ⚠️ 2026-10-05: гэрээний муж (аль хэдийн ачаалсан `refBase`) — popup зөөлөн анхааруулна; хаахгүй */
          geree={kind === 'plan' ? refSpanOf(modalRow.oid, blk) : null}
          res={obResOf(modalRow.des, sc.bld[blk] ?? "")}
          resFields={obResFields}
          /*
           * ⚠️ ЦУЦЛАХАД ЧИРЭЛТ БУЦНА (2026-09-08). Цонх нь чирэлтийн ДАРАА
           *    нээгддэг тул хуваарь аль хэдийн ноорогт бичигдсэн байдаг;
           *    «Хаах»/X/Esc/дэвсгэр дарахад түүнийг сэргээнэ. Эс бөгөөс
           *    хэрэглэгч цуцалсан гэж бодоод хуваарь нь үлдэнэ.
           */
          onClose={undoDragOnClose}
          onApply={(spans, deps, ob, actual, res, blks, actBlks) => {
            /* ⚠️ ЗӨВШӨӨРӨГДСӨН өөрчлөлт — буцаах мэдээллийг цэвэрлэнэ,
               эс бөгөөс дараагийн `onClose` түүнийг эргүүлж хаяна. */
            undoRef.current = null;
            applyModal(modalRow.oid, spans, deps, ob, blks);
            /* Бодит огноо · нөөц — гинжээс гадуур, ноорогт л (2026-09-23).
               ⚠️ 2026-09-29 (хэрэглэгчийн шийдвэр: «бодит эхлэх дуусахыг нэг ажил дээр
                  тохируулахад олон блокт орохгүй байна»): бодит огноо popup-д СОНГОСОН БҮХ
                  блокт орно (`actBlks`). 2026-09-24-ний «зөвхөн идэвхтэй блок» дүрмийг
                  хэрэглэгч ЦУЦАЛСАН — блокоо өөрөө сонгодог тул «эхлээгүй блок эхэлсэн
                  болно» гэсэн эрсдэл нь хэрэглэгчийн ил сонголт. Алхам (takt)-аас үл хамаарна:
                  бодит огноо шилждэггүй. */
            applyExtra(modalRow.oid, actBlks, actual, res);
          }}
        />
      )}

      {flowBox === 'send' && (
        <FlowBox
          title={tr('Хуваарь батлуулах')}
          desc={tr('{0} мөрийн өөрчлөлт батлагчид илгээгдэнэ. Батлагдтал эх хуваарь хөдлөхгүй.', num(dirtyRows))}
          label={tr('Тайлбар (сонголтоор)')}
          okText={tr('Илгээх')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onClose={() => setFlowBox(null)}
          onOk={(txt) => void sendForApproval(txt)}
        />
      )}
      {flowBox === 'decide' && pending && (
        <FlowBox
          title={tr('Хуваарь шийдвэрлэх')}
          desc={tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)
            + (pending.note ? ` — «${pending.note}»` : '')
            + (previewing
              ? ` ${tr('Санал хуанли дээр харагдаж байна.')}`
                /* ⚠️ Мөр бүрийн ногоон дүрэм (2026-09-25 аудит) — тоог харуулна */
                + (reviewOids.length ? ` ${tr('Зөвшөөрсөн {0}/{1} мөр', num(reviewOk), num(reviewOids.length))}` : '')
              : ` ${tr('⚠️ Хараахан урьдчилан хараагүй байна — «Урьдчилан харах»-аар шалгаж болно.')}`)}
          label={tr('Буцаах шалтгаан (буцаахад заавал)')}
          okText={tr('Батлах')}
          /* ⚠️ Буцаахад шалтгаан ЗААВАЛ — `decidePlan` ч мөн шалгана. Шалтгаангүй
             буцаалт нь гүйцэтгэгчид юуг засахыг хэлэхгүй тул давталт үүсгэнэ. */
          rejectText={tr('Буцаах')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          /* ⚠️ Цонхон дотроос УРЬДЧИЛАН ХАРАХ (2026-09-23): «хараагүй» гэж
             сануулаад цонхыг хааж товч хайлгадаг байв. `preview` амжилттай бол
             цонхыг өөрөө хаана. */
          onPreview={previewing ? undefined : () => void preview()}
          onClose={() => setFlowBox(null)}
          onOk={() => void decide(true, '')}
          /* ⚠️ 2026-09-29 аудит: урьдчилан харж тэмдэглэсэн бол ногоон/улаан `rejectReview`-тэй
             ИЖИЛ дамжина — урьд нь хаягдаж гүйцэтгэгч тэмдэггүй хардаг байв. */
          onReject={(txt) => void decide(false, txt, previewing ? reviewOids.filter((o) => okRows.has(o)) : undefined)}
        />
      )}
      {flowBox === 'reject' && pending && (
        <FlowBox
          title={tr('Хуваарь буцаах')}
          desc={reviewOids.length
            ? tr('Зөвшөөрсөн {0}/{1} мөр. Зөвшөөрөөгүй мөрүүд шалтгаанд автоматаар жагсагдаж, гүйцэтгэгчид УЛААН болж харагдана.', num(reviewOk), num(reviewOids.length))
            : tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)}
          label={tr('Буцаах шалтгаан (заавал)')}
          okText={tr('Буцаах')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onClose={() => setFlowBox(null)}
          onOk={(txt) => rejectReview(txt)}
        />
      )}
    </div>
  );
}

/* ⚠️ «ХУВААРИЙН ХАМРАЛТ» самбар 2026-09-02-нд ХАСАГДСАН (хэрэглэгч).
   `coverageOf()`-ийн дүрэм ХЭВЭЭР (2026-10-04-нөөс `cov` дотор хөнгөн давталтаар) — шүүлтийн «Хуваарьтай / Хуваарьгүй» табууд
   түүний тоог уншсаар байна, зөвхөн толгойн үзүүлэлт л алга болов. */


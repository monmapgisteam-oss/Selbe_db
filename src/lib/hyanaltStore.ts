'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТЫН ӨГӨГДЛИЙН ДАВХАРГА — амьд ArcGIS үйлчилгээ.
 *
 * ⚠️ ОГНООГ СИСТЕМ ТАВЬНА, хэрэглэгч гараар оруулахгүй. Бүх огноо энд
 * `Date.now()`-ээр бичигдэнэ. Дээр нь ArcGIS-ийн Editor Tracking нэмэлт
 * баталгаа болно — тэдгээрийг програм БИЧИХГҮЙ.
 *
 * ⚠️ БУЦААХ ЗАМ ЯВСАН ЗАМААРАА: менежер буцаавал ажил ШУУД компанид очихгүй,
 * инженер рүү очно. Инженер нь ДАМЖУУЛАГЧ БИШ — дахин шалгаад өөрөө шийднэ
 * (`recheck`): асуудалгүй бол менежерт эргүүлж илгээх, асуудалтай бол компанид
 * буцаах.
 *
 * ⚠️ ДАХИН ИЛГЭЭХЭД ХУУЧИН МӨРИЙГ ЗАСАХГҮЙ — ШИНЭ мөр үүснэ. Засвал өмнөх
 * буцаалтын шалтгаан дарагдаж алга болно; хяналтын гол утга нь тэр түүхэнд.
 *
 * ⚠️ ЭНЭ МОДУЛЬ (`archiveSubmission`) нь `Bagts_*` АРХИВТ (ҮНДСЭН ДАТА) жааз
 * бичдэг ЦОРЫН ГАНЦ ГАЗАР болов (2026-09-04). Хэрэглэгчийн шаардлага:
 * «ноорог ҮНДСЭН ДАТАНД хадгалагдаж болохгүй — 4 шат дамжсаны дараа л дата
 * хүснэгт буюу үндсэн сервис рүү орно». Урьд нь «Нийтлэх» дармагц
 * `FillNew.publish` өөрөө `applyAdds` дуудаж бүтэн жаазыг архивт бичдэг байв:
 * хянагч буцаасан ч, огт хараагүй ч тоо нь үндсэн өгөгдөлд аль хэдийн сууж
 * байлаа. Одоо «Нийтлэх» нь зөвхөн ИЛГЭЭЛТ (`Selbe_Guitsetgel_Draft`-ийн
 * `sub|<pkgKey>` мөр, diff) үүсгэнэ; архив руу энд, ерөнхий менежерийн
 * зөвшөөрлийн үед л бичигдэнэ. `applyAdds`-ыг өөр газраас БҮҮ дууд.
 *
 * ⚠️ ХОЁР ДАХЬ ДУУДАГЧ (2026-09-24): `ajilApply.materializeAdds` — НЭМЭЛТ АЖЛЫН
 * батлагдсан мөрийг батлангуут бүтэн жаазаар бичнэ (гүйцэтгэлийн тоо ОРОХГҮЙ,
 * зөвхөн шинэ мөр). Тэр нь энэ файлын A.6–A.9 дүрмийг (өдрийн залруулга ·
 * жаазны урт · уралдааны шалгалт · хагас жаазыг буцаах) ЯГ давтана. Гурав дахь
 * дуудагч БҮҮ нэм.
 */

import { dayKey } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import { t as tr } from './i18nCore';
import {
  addRows, hasOkCellsField, queryAll, updateRows,
  DECISION, F, HYANALT, STATUS,
  REVIEW_STAGES, REVIEW_STATUS, RETURNED_STATUS, SF, nextReview,
  type Attrs, type Decision, type ReviewStage, type Row, type Status,
} from './hyanalt';

/**
 * `Zovshoorson_nud` (`F.okCells`) ТАЛБАРТ БИЧИХ PATCH — талбар үйлчилгээнд
 * БАЙВАЛ л (2026-09-23, аудитын #16).
 *
 * ⚠️ Урьд нь `apply` (632) ба `recheck` (919) шалгалгүй бичдэг байв: талбар
 *    AGOL дээр нэмэгдээгүй үйлчилгээнд `applyEdits` танихгүй талбарыг
 *    чимээгүй алгасах (эсвэл бүх шинэчлэлийг унагах) тул зөвшөөрсөн нүдний
 *    жагсаалт хэнд ч мэдэгдэлгүй алга болдог байв.
 *    · `false` (алга) → бичихгүй, `warn`-аар ИЛ хэлнэ (`Result.warn` — дэлгэцэд
 *      шар мөр);
 *    · `null` (мэдэхгүй — сүлжээ) → бичнэ: нэг удаагийн саатаар хянагчийн
 *      зөвшөөрлийг хаяхаас танигдахгүй талбар руу бичих нь дор эрсдэлтэй.
 *    Уншихад хамгаалалт хэрэггүй: `toRow` нь байхгүй талбарыг `''` гэж уншина.
 */
async function okCellsPatch(okCells: string[] | undefined): Promise<{ patch: Attrs; warn?: string }> {
  if (!okCells) return { patch: {} };
  const has = await hasOkCellsField();
  if (has === false) {
    console.warn(`[selbe] «${F.okCells}» талбар хяналтын үйлчилгээнд алга — зөвшөөрсөн нүд хадгалагдсангүй. AGOL дээр талбар нэмнэ үү.`);
    return {
      patch: {},
      warn: tr('«{0}» багана хяналтын үйлчилгээнд алга — зөвшөөрсөн нүдний жагсаалт хадгалагдсангүй тул гүйцэтгэгч аль нүд зөвшөөрөгдсөнийг харахгүй. AGOL дээр багана нэмнэ үү.', F.okCells),
    };
  }
  return { patch: { [F.okCells]: JSON.stringify(okCells) } };
}
import {
  bagtsFor, isViewOnly, stageOfUser,
} from './guitsetgelAcl';

/**
 * ДОМЭЙН ТҮВШНИЙ ЭРХИЙН ХАМГААЛАЛТ (2026-09-16-ны аудит).
 *
 * ⚠️ ЯАГААД ЗААВАЛ ЭНД: урьд нь `apply`/`recheck` нь ЗӨВХӨН
 *    (а) буцаахад шалтгаан бий эсэх, (б) серверийн төлөв claim-тай
 *    таарах эсэхийг шалгадаг байв. `who` нь хэн болохыг НЭГ Ч удаа
 *    шалгадаггүй байсан тул эрхийн БҮХ шийдвэр зөвхөн `Guitsetgel.tsx`-ийн
 *    зурагдалтад (`readOnly` prop, `mine` тооцоолол, жагсаалтын шүүлт)
 *    байлаа — тэдгээр нь зурагдах агшны шийдвэр.
 *
 * ⚠️ НӨЛӨӨ: «Гүйцэтгэл» харагдац руу орох ЭРХТЭЙ ямар ч аккаунт (урсгалын
 *    гишүүд + `addRow`/`obyemEdit`/`obyemApprove` эрхтэй хүн бүр) консолоос
 *    `apply({ oid, stage: 'director', decision: approve, who })` дуудаж,
 *    `registerNow` → `archiveSubmission` → `applyAdds` гэсэн БУЦААШГҮЙ
 *    архивын бичилтийг өдөөж чаддаг байв — өөрийн багцаас ГАДУУР ч,
 *    `viewOnly` (зөвхөн харах) тэмдэгтэй ч, өөрийн бөглөсөн хуудсаа ч.
 *
 * ⚠️ ЭНЭ ФАЙЛ бол цорын ганц архив бичигч тул шалгуур ЭНД байх ёстой —
 *    төслийн бусад гурван урсгал ЯГ ИЙМ зарчимтай, ил бичигдсэн:
 *      · `caps.ts`      «UID-д биш, домэйн функцэд»
 *      · `huvaariBatlah` «Энэ шалгуур UI-д БИШ, ЭНД байх ёстой»
 *      · `chanarMs`     «ДҮРМҮҮД ЭНД, UI-Д БИШ … Консолоос дуудсан ч энэ л барина»
 *
 * ⚠️ `me` нь ArcGIS-ийн ХЭРЭГЛЭГЧИЙН НЭР байх ёстой — `who` (дэлгэцийн
 *    бүтэн нэр) БИШ. `who` нь ArcGIS-д хадгалагдах өгөгдөл, `me` нь
 *    эрхийн шалгуур: хоёр өөр зорилго, хоёр өөр параметр.
 *
 * ⚠️ FAIL-CLOSED: `me` хоосон бол ТАТГАЛЗАНА. Нэвтрэлт унтраалттай
 *    (хөгжүүлэлт) үед `stageOfUser` нь `null` буцаах тул тэр орчинд
 *    шалгуурыг ТОЙРУУЛАХ ёстой — дуудагч `bypass` тугийг ил өгнө
 *    (`authStatus === 'off'` эсвэл админы шат сонголт).
 *
 * ⚠️ `null` = ХЯЗГААРГҮЙ хүрээ, `[]` = ЮУ Ч БИШ (`bagtsFor`-ийн гэрээ).
 *    Хоёрыг андуурвал эрх гоожих эсвэл бүх хүн түгжигдэнэ.
 */
function authz(
  stage: ReviewStage,
  me: string | undefined,
  bagts: string,
  bypass: boolean,
): string | null {
  if (bypass) return null;
  const u = (me ?? '').trim();
  if (!u) return tr('Нэвтрээгүй байна — шийдвэр бүртгэгдэхгүй.');
  if (isViewOnly(u)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — шийдвэр гаргах боломжгүй.');
  if (stageOfUser(u) !== stage) {
    return tr('Та энэ шатны хянагчаар томилогдоогүй байна.');
  }
  const sc = bagtsFor(u, stage);
  if (sc !== null && !sc.includes(bagts)) {
    return tr('Энэ багц танд хуваарилагдаагүй байна.');
  }
  return null;
}

/* ── ArcGIS ↔ програмын хэлбэр ── */

/** ArcGIS огноог epoch ms-ээр өгдөг — ISO болгоно */
const toIso = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? new Date(v).toISOString() : null;

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * ⚠️ ЭКСПОРТ (2026-08-24): удирдлагын самбар (`ExecKpi`) нь `queryAll()`-ыг
 * шууд дуудаж, хүлээгдлийн насыг боддог. Хөрвүүлэлт нь ГАНЦ газар байх ёстой —
 * тэнд дахин бичвэл огнооны хэлбэр (epoch ms ↔ ISO) хоёр тайлбартай болно.
 */
export function toRow(a: Attrs): Row {
  return {
    __oid: num(a[HYANALT.oid]),
    [F.id]: str(a[F.id]),
    [F.sheetOid]: num(a[F.sheetOid]),
    [F.ergelt]: num(a[F.ergelt]),
    [F.bagts]: str(a[F.bagts]),
    [F.ajil]: str(a[F.ajil]),
    [F.company]: str(a[F.company]),
    [F.companySent]: toIso(a[F.companySent]),
    [F.engineer]: str(a[F.engineer]),
    [F.engineerDecision]: str(a[F.engineerDecision]) as Decision | '',
    [F.engineerReason]: str(a[F.engineerReason]),
    [F.engineerReturned]: toIso(a[F.engineerReturned]),
    [F.engineerSent]: toIso(a[F.engineerSent]),
    [F.manager]: str(a[F.manager]),
    [F.managerDecision]: str(a[F.managerDecision]) as Decision | '',
    [F.managerReason]: str(a[F.managerReason]),
    [F.managerReturned]: toIso(a[F.managerReturned]),
    [F.managerSent]: toIso(a[F.managerSent]),
    [F.director]: str(a[F.director]),
    [F.directorDecision]: str(a[F.directorDecision]) as Decision | '',
    [F.directorReason]: str(a[F.directorReason]),
    [F.directorReturned]: toIso(a[F.directorReturned]),
    [F.directorSent]: toIso(a[F.directorSent]),
    [F.head]: str(a[F.head]),
    [F.headDecision]: str(a[F.headDecision]) as Decision | '',
    [F.headReason]: str(a[F.headReason]),
    [F.headReturned]: toIso(a[F.headReturned]),
    [F.headSent]: toIso(a[F.headSent]),
    [F.chief]: str(a[F.chief]),
    [F.chiefDecision]: str(a[F.chiefDecision]) as Decision | '',
    [F.chiefReason]: str(a[F.chiefReason]),
    [F.chiefReturned]: toIso(a[F.chiefReturned]),
    [F.chiefSent]: toIso(a[F.chiefSent]),
    /* ⚠️ Зөвшөөрсөн нүдний JSON — хоосон бол `''` (`hyanalt.F.okCells`) */
    [F.okCells]: str(a[F.okCells]),
    [F.status]: str(a[F.status]) as Status,
  };
}

/* ── Захиалагчид мэдэгдэх модулийн түвшний store ── */

let ROWS: Row[] = [];
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function refresh(): Promise<void> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  emit();
}

/**
 * Мөрийг ШИНЭЭР уншиж буцаана (захиалагчдад мэдэгдэхгүй — дуудагч шийднэ).
 * ⚠️ 2026-08-29: хянагчийн шийдвэрийг хуучирсан `ROWS`-оос бичдэг байсан тул нэг
 *    багцад хоёр инженер томилогдсон үед А-гийн буцаалтыг Б-гийн «зөвшөөрөх»
 *    чимээгүй дарж бичиж, эсвэл дахин шалгалт давхар мөр үүсгэж болдог байв.
 *    Хуудас нэг л удаа ачаалдаг тул мөрийг бичихийн ӨМНӨ заавал дахин уншина.
 */
async function liveRow(oid: number): Promise<Row | undefined> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  return ROWS.find((r) => r.__oid === oid);
}

/**
 * Шат бүрд хүлээгдэх ЯГ тэр төлөв — өөр төлөвтэй мөрд шийдвэр бичихгүй.
 * ⚠️ `OWNER`-оор шалгавал «Менежер буцаасан» мөрд инженерийн зөвшөөрөл,
 *    «Шилжүүлсэн» мөрд ерөнхий менежерийн давхар баталгаа (нэгтгэлд давхар
 *    бүртгэл) нэвтэрнэ. Дахин шалгалт `recheck`-ээр ШИНЭ мөр үүсгэнэ.
 */
/* ⚠️ `REVIEW_STATUS` нь `hyanalt.ts`-д (2026-09-23) — 6 шатны нэг эх сурвалж. */

const STALE = tr('Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу');

export function useHyanaltRows(): {
  rows: Row[];
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const [, tick] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    refresh().catch((e) => setError(String((e as Error)?.message ?? e)));
  }, []);

  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!loaded) load();
    return () => { subs.delete(f); };
  }, [load]);

  return { rows: ROWS, loading: !loaded && !error, error, reload: load };
}

/* ── Үйлдэл ── */

const nextId = () => {
  /*
   * ⚠️ Дугаарыг МӨРИЙН ТООГООР биш, ХАМГИЙН ИХ дугаараар үүсгэнэ. Мөр
   * устгагдсан тохиолдолд тоогоор бодвол давхардсан дугаар гарна.
   */
  const max = ROWS.reduce((m, r) => {
    const n = Number(String(r[F.id]).replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `G-${String(max + 1).padStart(6, '0')}`;
};

export type Result = {
  ok: boolean;
  error?: string;
  /**
   * ⚠️ ХАГАС АМЖИЛТ (2026-09-06): шийдвэр ба архивлалт БҮТСЭН боловч
   * нэгтгэлд бүртгэх алхам унасан. `ok: true` хэвээр — батлалтыг буцаах
   * ёсгүй (буцаавал менежер дахин дарж архивт ДАВХАР жааз үүснэ), гэхдээ
   * урьд нь энэ нь ЗӨВХӨН `console.warn` байсан тул батлагдсан гүйцэтгэл
   * нэгтгэл/дашбоардад орохгүй үлдсэнийг ХЭН Ч мэддэггүй байв.
   */
  warn?: string;
  /**
   * ⚠️ `subAt` тулгалтаар ЗОГССОН — илгээлтийн агуулга хянагч уншсанаас хойш
   *    шинэчлэгдсэн (2026-09-25-ны аудит). Дуудагч (`Guitsetgel.Item`) үүгээр
   *    агуулгыг ДАХИН АЧААЛНА: урьд нь зөвхөн алдааны бичвэр гардаг байсан тул
   *    хянагч хуучин агуулга, хуучин ногоон тэмдэглэгээтэйгээ үлддэг байв.
   */
  contentChanged?: true;
};

const fail = (e: unknown): Result => ({ ok: false, error: String((e as Error)?.message ?? e) });

/** Архивлалтын үр дүн — амжилттай бол нэгтгэлд бүртгэх АРХИВЫН OBJECTID. */
/**
 * ⚠️ `day` нь АРХИВТ БИЧИГДСЭН агшны огноо (`YYYY-MM-DD`) — гүйцэтгэлээс
 * IPC мөр үүсгэхэд ЯГ ЭНЭ огноо хэрэгтэй. `archiveSubmission` нь `fillMs`-ийг
 * өөрөө залруулдаг (сүүлийн агшинтай мөргөлдвөл ӨНӨӨДӨР болгоно) тул гаднаас
 * таамаглавал IPC өөр сард бичигдэж болзошгүй. Аль хэдийн архивлагдсан
 * (idempotent) замд `undefined` — тэнд дахин бичих зүйлгүй.
 */
type Archived =
  /* ⚠️ `pkgKey` (2026-09-25 аудит) — зөвхөн илгээлттэй (`sub|`/`done|`) замд.
     `registerApproved`-д дамжуулж хоёр хуудастай багцын OID-оор хуудас
     таах алхмыг алгасна; legacy замд `undefined` (хуучин таамаглал). */
  | { ok: true; archiveOid: number; day?: string; pkgKey?: string }
  | { ok: false; error: string };

/**
 * ЭНЭ СЕШНД АРХИВЛАГДСАН ИЛГЭЭЛТ — `илгээлтийн oid → архивын oid`.
 *
 * ⚠️ ЯАГААД (2026-09-04-ний аудит): idempotency нь ЗӨВХӨН `closeSubmission`
 *    амжилттай болсон үед тавигддаг (`done|` угтвар эсвэл `payload.archiveOid`).
 *    Хэрэв `applyAdds` амжилттай болсон АТЛАА `closeSubmission` БА `updateRows`
 *    хоёул унавал (сүлжээ) `apply` нь `{ok:false}` буцааж, хяналтын мөр
 *    «Ерөнхий менежер хянаж байна» хэвээр үлдэнэ — менежер дахин дарахад
 *    БҮТЭН ЖААЗ ХОЁР ДАХЬ УДАА бичигдэнэ. Архивт тийм давхардлын бодит ул мөр
 *    бий (Bagts_1_9f 2026-08-29 = 16 хуулбар, 21,920 мөр).
 *
 * ⚠️ Энэ нь ЗӨВХӨН тухайн хуудасны амьдралын хугацаанд хамгаална (хуудас
 *    дахин ачаалагдвал алга). Бүрэн шийдэл нь илгээлтийн мөрд `archiveOid`-ыг
 *    хаахаас ӨМНӨ тэмдэглэх боловч тэр бичилт нь мөн ижил сүлжээгээр явдаг тул
 *    хамт унана; тиймээс энд сешний хамгаалалт + `closeSubmission`-ийн дахин
 *    оролдлого хоёулаа тавигдав.
 *
 * ⚠️ ТҮЛХҮҮР НЬ ИЛГЭЭЛТИЙН ОID БИШ, `oid:агуулгын-хувилбар` (2026-09-04-ний
 *    аудитын олдвор): `sub|` мөр нь ДАРААГИЙН илгээлтэд ЯГ ТЭР OBJECTID дээрээ
 *    дахин бичигддэг. Сүлжээ тасарч `closeSubmission` унасны дараа гүйцэтгэгч
 *    дутуу тоогоо нэмж ДАХИН илгээвэл ижил oid дээр ӨӨР агуулга тогтоно;
 *    зөвхөн oid-оор түлхүүрлэсэн үед ерөнхий менежер ТЭР Ж хөтчийн сешнд
 *    батлахад `{ok:true}` буцаж, ШИНЭ нүднүүд архивт ОГТ бичигдэлгүй хяналтын
 *    мөр «Шилжүүлсэн» болдог байв — хаана ч алдаа гарахгүй. `staged.at` нь
 *    илгээлт бүрд шинэчлэгддэг тул агуулгын хувилбарын үүрэг гүйцэтгэнэ.
 *
 * ⚠️ УТГА НЬ `{ oid, day }` (2026-09-25-ны аудит): урьд нь зөвхөн архивын oid
 *    хадгалдаг байсан тул энэ замаар дахин оролдоход `day` undefined буцаж
 *    IPC мөр ЧИМЭЭГҮЙ алгасагддаг байв — доорх `done|` замд 2026-09-17-нд
 *    зассан ЯГ тэр алдаа. Жаазны өдрийг бичсэн агшинд нь хадгална.
 */
const ARCHIVED = new Map<string, { oid: number; day: string }>();

/**
 * ИЛГЭЭЛТИЙГ АРХИВТ БУУЛГАНА — ерөнхий менежер БАТЛАХАД л дуудагдана
 * (дизайны дүрэм 5a–5e).
 *
 * Гурван зам:
 *   · илгээлт олдохгүй  → LEGACY: `Эх_мөрийн_дугаар` нь архивын OBJECTID
 *     (энэ өөрчлөлтөөс өмнөх мөрүүд) — жааз аль хэдийн бичигдсэн;
 *   · илгээлт `done|…`  → аль хэдийн архивлагдсан (idempotent) — дахин бичихгүй;
 *   · идэвхтэй `sub|…`  → сүүлийн жааз + overlay → шинэ жааз `applyAdds`.
 *
 * ⚠️ Модулиудыг ДИНАМИКААР импортолно. `hyanaltStore`-ыг удирдлагын самбар
 *    (`ExecKpi`) зөвхөн `toRow`-ын төлөө импортолдог тул `bagtsSheet` ·
 *    `sheetFrame` · `bagts.pkg`-ийг СТАТИКААР оруулбал дашбоардын багц
 *    бөглөх хуудсыг бүхэлд нь чирнэ.
 */
async function archiveSubmission(cur: Row): Promise<Archived> {
  const subOid = cur[F.sheetOid];
  /* ⚠️ `ARCHIVED`-ийн шалгуур нь ЭНД БИШ, илгээлтийг УНШСАНЫ ДАРАА (доор) —
     түлхүүрт `staged.at` (агуулгын хувилбар) орох ёстой. */
  const { readSubmissionByOid, closeSubmission } = await import('./submission');
  /*
   * ⚠️ АЛДААГ ЯЛГАДАГ ХУВИЛБАР (2026-09-04-ний аудитын CRITICAL олдвор).
   *    Урьд нь энд `loadSubmissionByOid` дуудагддаг байсан бөгөөд тэр нь
   *    «мөр байхгүй» ба «уншиж чадсангүй» хоёрыг ялгалгүй `null` буцаадаг:
   *    сүлжээ түр тасрах, токен дуусах, `tableUrl` null буцаах агшинд
   *    БАТЛАГДСАН илгээлт архивт ОГТ БИЧИГДЭЛГҮЙ хяналтын мөр «Шилжүүлсэн»
   *    болж, дахин батлах зам ХААГДДАГ байлаа — компанийн бүтэн өдрийн
   *    гүйцэтгэл ул мөргүй алга, дэлгэц дээр алдаа ч гарахгүй.
   *    Одоо «мэдэхгүй» бол ЮУ Ч ХИЙХГҮЙ ЗОГСОНО: менежер дахин дарж болно.
   */
  const read = await readSubmissionByOid(subOid);
  if (!read.ok) return { ok: false, error: read.error };
  const staged = read.sub;
  /*
   * ⚠️ ХУУЧИН МӨРД ИЛГЭЭЛТ БАЙХГҮЙ (дүрэм 6). Тэдгээрт `Эх_мөрийн_дугаар` нь
   *    архивын ЭХНИЙ мөрийн OBJECTID — жааз нь «Нийтлэх» дээр аль хэдийн
   *    бичигдсэн. Шинэ логикоор дахин бичвэл нэг гүйцэтгэл архивт хоёр
   *    агшинтай болно. Тиймээс зөвхөн нэгтгэлд бүртгээд өнгөрнө.
   * ⚠️ Энэ салбар руу ЗӨВХӨН `{ok:true, sub:null}` — «мөр байхгүй нь
   *    БАТАЛГААЖСАН» — үед л унана (дээрх шалгуур).
   */
  if (!staged) return { ok: true, archiveOid: subOid };
  /*
   * ⚠️ IDEMPOTENT: илгээлт `done|…` бол (эсвэл `archiveOid` тэмдэглэгдсэн)
   *    архивт аль хэдийн буусан. Сүлжээ тасарч товч дахин дарагдвал ижил
   *    жааз ХОЁР удаа бичигдэх байлаа.
   */
  /* ⚠️ `day`-г ЭНД Ч буцаана (2026-09-17): урьд нь дахин оролдох замд
     `archivedDay` undefined болж IPC мөр (доорх `ipcAuto`) алгасагддаг байв.
     Өдрийг АРХИВЫН ЖААЗНААС уншина (`fillDate`): илгээсэн өдөр (`fillMs`) нь
     нийтлэхэд өнөөдөр рүү залруулагдаж болдог, `approvedAt` нь баталсан агшин —
     аль нь ч жаазны өдөр биш. Уншиж чадахгүй бол `fillMs`-ээр нөөцлөнө. */
  if (staged.done || staged.payload.archiveOid != null) {
    const aOid = staged.payload.archiveOid ?? 0;
    /* ⚠️ `dayKey` (ЛОКАЛ өдөр) — `toISOString` нь UTC тул +08-д 00:00–07:59-ийн
       илгээлт ӨМНӨХ өдөрт (сарын хил давбал өмнөх сард) архивлагдаж байв (2026-09-23 аудит). */
    let day: string | undefined = staged.payload.fillMs != null ? dayKey(staged.payload.fillMs) : undefined;
    if (aOid > 0) {
      try {
        const [{ PKGS, loadSchema }, { agsFetch }] = await Promise.all([import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags')]);
        const pkg = PKGS.find((p) => p.key === staged.payload.pkgKey);
        if (pkg) {
          const sc = await loadSchema(pkg);
          if (sc.f.fillDate) {
            const j = await agsFetch(`${pkg.url}/query`, { where: `${sc.f.oid} = ${aOid}`, outFields: sc.f.fillDate, returnGeometry: 'false' });
            const v = j.features?.[0]?.attributes?.[sc.f.fillDate];
            if (typeof v === 'number') day = new Date(v).toISOString().slice(0, 10);
          }
        }
      } catch { /* нөөц `fillMs` хэвээр */ }
    }
    return { ok: true, archiveOid: aOid, day, pkgKey: staged.payload.pkgKey };
  }

  /* ⚠️ Энэ сешнд ЯГ ЭНЭ АГУУЛГА аль хэдийн архивлагдсан бол ДАХИН БИЧИХГҮЙ
     (дээрх `ARCHIVED`-ийн ⚠️). Агуулга шинэчлэгдсэн бол түлхүүр өөрчлөгдөх
     тул шинэ илгээлт ЖИНХЭНЭЭР архивлагдана. */
  const seenKey = `${subOid}:${staged.at}`;
  const seen = ARCHIVED.get(seenKey);
  if (seen != null) {
    /* ⚠️ ХААЛТЫГ ДАХИН ОРОЛДОНО (2026-09-25): энэ салбарт хүрсэн нь `sub|` мөр
       нээлттэй хэвээр буюу өмнөх `closeSubmission` хоёулаа унасан гэсэн үг —
       хаалт нь idempotency-ийн ЦОРЫН ГАНЦ байнгын тэмдэг (`done|`). Унавал
       батлалтыг зогсоохгүй (доорх үндсэн замын дүрэмтэй ижил). */
    const cl = await closeSubmission(staged.oid, seen.oid, Date.now(), true);
    if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй (дахин оролдлого):', cl.error);
    return { ok: true, archiveOid: seen.oid, day: seen.day, pkgKey: staged.payload.pkgKey };
  }

  const pl = staged.payload;
  const { PKGS, loadSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((p) => p.key === pl.pkgKey);
  if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pl.pkgKey) };
  /*
   * ⚠️ БАГЦЫН ТҮЛХҮҮР ЗААВАЛ ТААРНА (2026-09-04-ний аудит): `Эх_мөрийн_дугаар`
   *    нь ХОЁР өөр үйлчилгээний OBJECTID-г (илгээлтийн мөр ба архивын мөр) НЭГ
   *    талбарт хадгалдаг тул хуучин (архивын дугаартай) бүртгэлийн дугаар
   *    санамсаргүйгээр өөр багцын `sub|` мөр рүү таарч болно. Тэгвэл огт өөр
   *    багцын гүйцэтгэл ЭНЭ хяналтын мөрөөр архивт бичигдэнэ. Ил зогсооно.
   */
  if (pkg.group !== cur[F.bagts])
    return {
      ok: false,
      error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', pkg.group, cur[F.bagts]),
    };

  const [{ loadRows, applyAdds, applyDeletes, msToDay }, { overlaySubmission, buildFrame, assertFrameLength }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
  ]);
  const sc = await loadSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  /*
   * ⚠️ СҮҮЛИЙН жаазыг татна (өдөр зааж ӨГӨХГҮЙ). Илгээлт нь diff тул суурь нь
   *    БАТЛАХ агшны хамгийн сүүлийн архив байх ёстой: хооронд нь өөр илгээлт
   *    батлагдсан бол түүний тоог дарж бичихгүй.
   */
  const loaded = await loadRows(pkg, sc);
  const ov = overlaySubmission(loaded.rows, pl, sc, nBld);
  /*
   * ⚠️ Тулгагдаагүй нүд байвал ЗОГСОНО (дүрэм 5b). Хагас буусан diff-ийг
   *    архивт бичвэл гүйцэтгэгчийн бичсэн тоо ЧИМЭЭГҮЙ алга болж, батлагдсан
   *    баримт нь илгээснээсээ зөрнө.
   */
  if (ov.unmoved > 0) {
    /*
     * ⚠️ ЗӨВХӨН ТООГООР ХАНГАЛТГҮЙ (2026-09-04-ний аудит): «3 нүдийг тулгаж
     *    чадсангүй» гэсэн мессеж нь АЛЬ мөр, АЛЬ блок болохыг хэлдэггүй тул
     *    гүйцэтгэгчид засах зам байхгүй, багцын илгээлт бүрмөсөн гацдаг байв.
     *    Түлхүүрийн oid нь ШИНЭ жаазанд байхгүй (тиймдээ л тулгагдаагүй) тул
     *    нэрийг илгээлтийн ӨӨРИЙНХ нь `rowKeys` толиос авна.
     */
    const label = new Map(pl.rowKeys ?? []);
    const names = ov.unmovedKeys.slice(0, 10).map((k) => {
      const parts = k.split(':');
      const oid = Number(parts[0]);
      const b = Number(parts[1]);
      const blk = Number.isInteger(b) && sc.bld[b] ? sc.bld[b] : '—';
      const se = parts[2] === 's' ? tr('эхлэх') : parts[2] === 'e' ? tr('дуусах') : '';
      return `${label.get(oid) ?? `#${oid}`} · ${blk}${se ? ` · ${se}` : ''}`;
    });
    const more = ov.unmovedKeys.length > names.length ? ` … +${ov.unmovedKeys.length - names.length}` : '';
    return {
      ok: false,
      error: tr('{0} нүдийг шинэ мөрүүдэд тулгаж чадсангүй — архивт бичсэнгүй. Гүйцэтгэгчээр дахин илгээүүлнэ үү. Тулгагдаагүй: {1}', String(ov.unmoved), names.join('; ') + more),
    };
  }
  /*
   * ⚠️ `asOf` нь `computeAll`-ийн ЛАВЛАХ огноо. БАЙХГҮЙ БАЙЖ БОЛНО
   *    (2026-09-06): хэзээ ч нийтлэгдээгүй хуудсанд огноо тохируулаагүй
   *    бөгөөд бөглөгч түүнийг «Хуваарь» харагдацаар дараа тавина. Тэр үед
   *    төлөвлөгөөт хувь `null` («мэдээлэлгүй») болж бичигдэнэ — 0 гэж
   *    таамаглахгүй (`null ≠ 0`), ӨӨР БАГЦЫН огноогоор ч орлуулахгүй.
   *
   * ⚠️ Урьд нь энд `asOf == null` бол архивлалтыг ЗОГСоодог байв: огноогоо
   *    хараахан тавиагүй багцын батлагдсан гүйцэтгэл үндсэн өгөгдөлд ХЭЗЭЭ Ч
   *    орж чадахгүй, ерөнхий менежер шалтгааныг нь ойлгомжгүй алдаанаас л
   *    мэддэг байлаа.
   */
  const asOf = ov.asOf ?? loaded.asOf;

  /*
   * БӨГЛӨСӨН ӨДӨР — илгээсэн өдөр (`payload.fillMs`).
   *
   * ⚠️ Гэхдээ илгээснээс хойш архивт ШИНЭ жааз нэмэгдсэн бол (өөр илгээлт
   *    эрт батлагдсан, эсвэл хуучин урсгалаар нийтлэгдсэн) тэр өдрөөр бичсэн
   *    жааз `latestWhere`-ийн «хамгийн сүүлийн өдөр» шүүлтэд ХАРАГДАХГҮЙ:
   *    батлагдсан гүйцэтгэл архивт орсон мөртөө хуудсанд хэзээ ч гарч ирэхгүй
   *    алга болно. Тиймээс тийм үед ӨНӨӨДРИЙН өдрөөр бичнэ.
   */
  let fillMs = pl.fillMs;
  const now = new Date();
  const lastDay = loaded.snapshot != null ? msToDay(loaded.snapshot) : '';
  if (lastDay && lastDay >= msToDay(fillMs))
    fillMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  /* ── САРЫН ЗАДАРГАА — дэлгэцтэй ИЖИЛ томъёо ────────────────────────
   * ⚠️ `FillNew` төлөвлөгөөт хувийг задаргаанаас (S-муруй) харуулдаг тул
   *    архивт мөн түүгээр бичнэ; эс бөгөөс батлагдсаны дараа тоо гулсана.
   * ⚠️ Уншилт УНАВАЛ чимээгүй — задаргаагүйгээр хуучин (шугаман) зам.
   */
  const { loadPkgPlan, planPctFromMonths } = await import('@/lib/huvaariObyem');
  let obPlan: Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null = null;
  try {
    obPlan = (await loadPkgPlan(pkg.key)).plan;
  } catch {
    obPlan = null;
  }
  const frame = buildFrame(ov.rows, sc, nBld, asOf, hasObyem, fillMs, {}, {},
    (row, b) => {
      // ⚠️ main (2026-09-06): `asOf` null байж болно — тэр үед задаргааны хувь ч null
      if (!obPlan || row.des == null || asOf == null) return null;
      const blok = sc.bld[b];
      const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
      return m ? planPctFromMonths(m, asOf) : null;
    });
  /*
   * ⚠️ ЖААЗНЫ УРТЫГ БИЧИХИЙН ӨМНӨ ТУЛГАНА (2026-09-04-ний аудитын CRITICAL
   *    олдвор — Багц 3.1 · 9 давхар). `loadRows` нь № ба Ажил хоёул хоосон
   *    мөрийг алгасдаг тул `rows` нь лавлах зураглалаас нэгээр БОГИНО гарч,
   *    архивт 1,470-мөрт жааз бичигдээд дараагийн ачаалалт «1470 мөр ирлээ,
   *    1471 байх ёстой» гэж унаж, тэр багцын бөглөх хуудас БА хянагчийн
   *    харагдац хоёулаа бүрмөсөн хаагдсан. Богино жааз БИЧИГДСЭНИЙ ДАРАА
   *    илрэхээс өмнө нь зогсоох нь хамаагүй дээр.
   * ⚠️ ЛАВЛАХ НЬ `TREES[pkg.key].length` БАЙЖ БОЛОХГҮЙ (энэ хамгаалалтыг
   *    нэмсэн 2026-09-04-ний эхний хувилбарын алдаа): зураглал нь ХООСОН
   *    мөрийг ч тоолдог («Багц 3.1 · 9 давхар» = 1471) атлаа `loadRows` № ба
   *    Ажил хоёул хоосон мөрийг алгасдаг тул жааз ҮРГЭЛЖ 1,470 мөр байна —
   *    зураглалтай шууд жишсэн шалгуур тэр багцын батлалтыг МӨНХӨД хаана
   *    («…1470 мөр боловч лавлах 1471…», архивт юу ч бичигдэхгүй). Мөн ерөнхий
   *    менежер нэг удаа мөр нэмж батлуулсны ДАРАА `loaded.rows.length` нь
   *    зураглалаас урт болох тул ДАРААГИЙН энгийн батлалт бүр ижил дүрмээр
   *    хаагдана.
   * ⚠️ Тиймээс лавлах нь ЭНЭ АЧААЛАЛТЫН мөрийн тоо (`loadRows(...).frameLen`)
   *    + ЭНЭ илгээлтээр ШИНЭЭР орсон мөр. `bagtsSheet.ts` дахь `frameLen` яг
   *    үүний тулд нэмэгдсэн.
   */
  const added = ov.rows.length - loaded.rows.length;
  /*
   * ⚠️ ЖИНХЭНЭ ХАМГААЛАЛТ НЬ «ЖААЗ БОГИНОСОХГҮЙ»: `frame` нь `ov.rows`-ын
   *    зураглал тул уртын тэнцэл нь бараг үргэлж биелнэ — тиймээс уртын
   *    шалгуур ГАНЦААРАА хоосон. Архивт ХАГАС/БОГИНО жааз бичигдэхээс
   *    сэргийлэх цорын ганц утга бүхий нөхцөл нь: шинэ жааз нь ачаалсан
   *    жаазаасаа БОГИНО байж болохгүй (мөр устгах зам энэ урсгалд БАЙХГҮЙ).
   *    Богино жааз бичигдвэл дараагийн ачаалалт багцын хуудсыг бүрмөсөн хаана.
   */
  if (added < 0)
    return {
      ok: false,
      error: tr(
        '«{0}»: угсарсан жааз {1} мөр — ачаалсан {2} мөрөөс БОГИНО. Архивт ЮУ Ч бичсэнгүй.',
        pkg.label,
        String(frame.length),
        String(loaded.frameLen),
      ),
    };
  try {
    assertFrameLength(frame.length, loaded.frameLen + added, pkg.label);
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
  /*
   * ⚠️ БИЧИХИЙН ӨМНӨ ДАХИН ШАЛГАНА (2026-09-17): ArcGIS-д compare-and-set
   *    байхгүй тул хоёр таб/хоёр захирал зэрэг «Батлах» дарвал хоёул
   *    дээрх уншилтыг давж ирнэ. Жааз угсрах (loadRows + buildFrame) нь
   *    секундүүд үргэлжилдэг тул нөгөө таб энэ хооронд `done|` болгосон
   *    байж болно — бичихийн яг өмнө сервер дээрх төлөвийг дахин үзнэ.
   *    Цонх бүрэн хаагдахгүй (атом биш), харин секундээс мс болж нарийсна.
   */
  {
    const again = await readSubmissionByOid(subOid);
    if (!again.ok) return { ok: false, error: again.error };
    if (!again.sub) return { ok: false, error: tr('Илгээлт энэ хооронд устгагдлаа — архивт юу ч бичсэнгүй') };
    if (again.sub.done || again.sub.payload.archiveOid != null)
      return { ok: true, archiveOid: again.sub.payload.archiveOid ?? 0, day: msToDay(fillMs) };
    if (again.sub.at !== staged.at)
      return { ok: false, error: tr('Илгээлт энэ хооронд өөрчлөгдлөө — дахин нээж баталгаажуулна уу') };
  }
  let firstOid: number | null = null;
  /* ⚠️ БИЧИГДСЭН МӨРИЙН ДУГААР — унасан үед буцааж устгахад ЗААВАЛ хэрэгтэй. */
  const written: number[] = [];
  try {
    const r = await applyAdds(pkg, frame, written);
    firstOid = r.firstOid;
  } catch (e) {
    /*
     * ⚠️ ХАГАС ЖААЗЫГ БУЦААНА. `rollbackOnFailure` нь зөвхөн нэг 500-мөрийн
     *    багц дотор үйлчилдэг тул унатал бичигдсэн мөрүүд архивт ҮЛДЭНЭ. Тэр
     *    хагас жааз нь `loadRows`-ын мөрийн тооны шалгуурыг унагааж багцын
     *    бөглөх хуудсыг БҮХЭЛД НЬ хаадаг (Багц 2·9F дээр бодитоор тохиолдсон:
     *    1,000 мөрийн үлдэгдэл, бүтэн нь 1,386).
     * ⚠️ Хяналтын мөр ӨӨРЧЛӨГДӨХГҮЙ — менежер дахин дарж болно.
     */
    const why = String((e as Error)?.message ?? e);
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      return {
        ok: false,
        error: left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — AGOL дээр гараар цэвэрлэнэ үү', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`,
      };
    }
    return { ok: false, error: why };
  }
  /*
   * ⚠️ Мөр бичигдсэн ч дугаар ирээгүй бол ЗОГСОХГҮЙ. `{ok:false}` буцаавал
   *    менежер дахин дарж архивт ХОЁР ижил жааз үүснэ. Нэгтгэлийн бүртгэл нь
   *    `archiveOid = 0`-д унаж, зөвхөн `console.warn`-оор мэдэгдэнэ.
   */
  /*
   * ⚠️ ЖААЗ БИЧИГДСЭНИЙГ ТЭР ДОР НЬ ТЭМДЭГЛЭНЭ (дээрх `ARCHIVED`-ийн ⚠️):
   *    доорх алхмуудын аль нэг унаад менежер дахин дарвал ДАВХАР жааз
   *    бичигдэхгүй.
   */
  ARCHIVED.set(seenKey, { oid: firstOid ?? 0, day: msToDay(fillMs) });
  /*
   * ⚠️ Илгээлтийг ХААХ алхам унавал батлалт УНАХГҮЙ — жааз аль хэдийн архивт
   *    бичигдсэн. Нээлттэй үлдсэн `sub|` мөр дараагийн ачаалалтад давхарлагдах
   *    боловч `overlaySubmission`-ийн давхардал шалгалт (alias) түүнийг барина.
   * ⚠️ НЭГ УДАА ДАХИН ОРОЛДОНО: хаалт нь idempotency-ийн ЦОРЫН ГАНЦ БАЙНГЫН
   *    тэмдэг (`done|`) тул түр зуурын сүлжээний саатал нь дараагийн сешнд
   *    давхар жааз үүсгэх эрсдэл болдог.
   */
  /* ⚠️ `regPending` (2026-09-25 аудит) — нэгтгэл/IPC баталгаажтал `done|`
     payload-д «бүртгэл хүлээгдэж буй» тэмдэг үлдэнэ (`apply` → `markRegistered`,
     таб хаагдвал `retryPendingRegistrations`). */
  let cl = await closeSubmission(staged.oid, firstOid ?? 0, Date.now(), true);
  if (!cl.ok) cl = await closeSubmission(staged.oid, firstOid ?? 0, Date.now(), true);
  if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй:', cl.error);

  return { ok: true, archiveOid: firstOid ?? 0, day: msToDay(fillMs), pkgKey: pkg.key };
}

/**
 * ХЯНАГЧИЙН ШИЙДВЭРИЙГ БҮРТГЭНЭ — гурван хянах шат тус бүрд.
 *
 * ⚠️ ЗӨВШӨӨРӨЛ нь ДАРААГИЙН шат руу, БУЦААЛТ нь ӨМНӨХ шат руу — нэг алхмаар.
 *    Эцсийн `Шилжүүлсэн` төлөвт ЗӨВХӨН ерөнхий менежер зөвшөөрснөөр хүрнэ:
 *    гурав дахь шатанд «шилжүүлсэн» гэж тэмдэглэвэл дөрөв дэх хяналт
 *    хийгдээгүй атлаа бүртгэгдсэн болно.
 */
export async function apply(a: {
  oid: number;
  stage: ReviewStage;
  decision: Decision;
  /** ⚠️ Буцаах үед ХООСОН БАЙЖ БОЛОХГҮЙ */
  reason?: string;
  /**
   * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮДНҮҮД — `"мөр:блок"` түлхүүрүүд.
   *
   * ⚠️ БУЦААХ ҮЕД чухал: гүйцэтгэгч энэ жагсаалтаар нүдээ ялгана —
   *    доторх нь НОГООН (зөвшөөрөгдсөн), гадна талынх нь УЛААН (засах
   *    шаардлагатай). Урьд нь хадгалагддаггүй байсан тул буцаагдсан
   *    гүйцэтгэгч аль нүдээ засахаа мэдэхгүй байв.
   *
   * ⚠️ ЗӨВШӨӨРӨХ үед ч бичигдэнэ — дараагийн шат «өмнөх хянагч юуг
   *    зөвшөөрсөн бэ» гэдгийг харна.
   * ⚠️ `undefined` бол талбарыг ОГТ ХӨНДӨХГҮЙ (хуучин утга хэвээр);
   *    хоосон массив нь «нэг ч нүд зөвшөөрөөгүй» гэсэн ИЛ утга.
   */
  okCells?: string[];
  /**
   * ХЯНАГЧИЙН ХАРСАН илгээлтийн агшин (`payload.at`, 2026-09-24).
   * ⚠️ Дунд шатны батламж илгээлтийн АГУУЛГАТАЙ холбогдоогүй байв: хянагч
   *    уншсанаас хойш гүйцэтгэгч дахин илгээвэл (нэг `sub|` мөр update)
   *    ХАРААГҮЙ агуулга батлагдана. Өгвөл одоогийн илгээлтийн `at` зөрөх үед
   *    STALE-маягийн алдаагаар зогсоно; `undefined` = шалгахгүй (хуучин
   *    архивын зам — илгээлт байхгүй).
   */
  subAt?: number;
  /** ArcGIS-д БИЧИГДЭХ дэлгэцийн нэр (өгөгдөл) */
  who: string;
  /**
   * ЭРХИЙН ШАЛГУУРТ хэрэглэгдэх ArcGIS-ийн ХЭРЭГЛЭГЧИЙН НЭР.
   * ⚠️ `who`-гоос ТУСДАА: тэр нь бүтэн нэр (давхардаж, солигдож болно),
   *    энэ нь ACL-ийн түлхүүр. Хоёрыг хольвол эрх нэрээр гоожино.
   */
  me?: string;
  /**
   * ЭРХИЙН ШАЛГУУРЫГ ТОЙРУУЛАХ — ЗӨВХӨН нэвтрэлт унтраалттай (хөгжүүлэлт)
   * эсвэл админ шатаа ил сонгосон үед (`resolveFlowStage.canPick`).
   * ⚠️ Анхдагч нь `false` (fail-closed): дуудагч ил хүсэх ёстой.
   */
  bypass?: boolean;
}): Promise<Result> {
  const returning = a.decision === DECISION.return;
  const reason = (a.reason ?? '').trim();
  // ⚠️ Шалтгаангүй буцаалт нь хяналтын бүртгэлийг утгагүй болгоно
  if (returning && !reason) return { ok: false, error: tr('Буцаах шалтгаанаа бичнэ үү') };

  const t = Date.now();
  const attrs: Attrs = { [HYANALT.oid]: a.oid };
  /*
   * ⚠️ ЗӨВШӨӨРСӨН НҮДНИЙ ЖАГСААЛТ — шатнаас ҮЛ ХАМААРАН нэг талбарт.
   *    Буцаагдсан гүйцэтгэгч «аль нүд ногоон, аль нь улаан» гэдгийг
   *    ЗӨВХӨН эндээс мэднэ (`hyanalt.F.okCells`-ийн ⚠️).
   * ⚠️ `undefined` бол хөндөхгүй — хуучин шатны зөвшөөрөл алдагдахгүй.
   * ⚠️ 2026-09-23 (#16): талбар үйлчилгээнд байхгүй бол БИЧИХГҮЙ, `okWarn`-аар
   *    ил хэлнэ (`okCellsPatch`).
   */
  const okp = await okCellsPatch(a.okCells);
  Object.assign(attrs, okp.patch);
  const okWarn = okp.warn;
  /*
   * ⚠️ НЭГТГЭЛД ЗӨВХӨН ЭЦСИЙН БАТАЛГААНЫ ДАРАА бичнэ. Дунд шатанд бичвэл
   *    хараахан батлагдаагүй тоо албан ёсны бүртгэлд орж, дараа нь буцаагдвал
   *    устгах шаардлагатай болно.
   */
  let registerNow = false;

  /*
   * ⚠️ ШАТ БҮРД if/else БИШ — `SF` хүснэгтээс (2026-09-23, 6 шат). Буцаалт нь
   *    ЯВСАН ЗАМААРАА нэг алхам (`RETURNED_STATUS` → `OWNER`), зөвшөөрөл нь
   *    ДАРААГИЙН хянах шат руу; сүүлийн шат (газрын дарга) л «Шилжүүлсэн»
   *    болгож архив · нэгтгэлд бүртгэнэ (`registerNow`).
   */
  const sf = SF[a.stage];
  attrs[sf.who] = a.who;
  attrs[sf.decision] = a.decision;
  if (returning) {
    attrs[sf.reason] = reason;
    attrs[sf.returned] = t;
    attrs[F.status] = RETURNED_STATUS[a.stage];
  } else {
    attrs[sf.sent] = t;
    const nx = nextReview(a.stage);
    if (nx) {
      attrs[F.status] = REVIEW_STATUS[nx];
    } else {
      // ЭЦСИЙН БАТАЛГАА — зургаан шат бүгд өнгөрлөө
      attrs[F.status] = STATUS.transferred;
      registerNow = true;
    }
  }

  try {
    const cur = await liveRow(a.oid);
    if (!cur || cur[F.status] !== REVIEW_STATUS[a.stage]) {
      emit();
      return { ok: false, error: STALE };
    }
    /*
     * ⚠️ ЭРХИЙГ СЕРВЕРИЙН МӨРӨӨС ШАЛГАНА (2026-09-16-ны аудит): багцын
     *    нэр нь ЗӨВХӨН тэнд байгаа тул хүрээний шалгуур `cur`-аас ХОЙШ
     *    байх ЁСТОЙ. Дуудагчийн өгсөн ямар ч утгад итгэхгүй.
     * ⚠️ БИЧИЛТЭЭС ӨМНӨ: доорх `archiveSubmission` → `applyAdds` нь
     *    БУЦААШГҮЙ архивын бичилт тул нэг ч талбар хөндөгдөхөөс өмнө
     *    таслах ёстой.
     */
    {
      const deny = authz(a.stage, a.me, String(cur[F.bagts] ?? ''), a.bypass === true);
      if (deny) { emit(); return { ok: false, error: deny }; }
    }
    /* ⚠️ ИЛГЭЭЛТИЙН АГУУЛГЫН ТУЛГАЛТ (дээрх `subAt`-ийн ⚠️) — нэг хямд
       уншилт; илгээлт олдохгүй/уншигдахгүй бол ХАДГАЛАХГҮЙ (fail-closed). */
    if (a.subAt != null) {
      const { readSubmissionByOid } = await import('./submission');
      const sr = await readSubmissionByOid(Number(cur[F.sheetOid]));
      if (!sr.ok) return { ok: false, error: sr.error };
      if (!sr.sub || sr.sub.payload.at !== a.subAt) {
        emit();
        return { ok: false, error: tr('Илгээлтийн агуулга өөрчлөгдсөн — дахин уншина уу'), contentChanged: true };
      }
    }
    /*
     * ⚠️ АРХИВЛАЛТ нь хяналтын мөрийг засахаас ӨМНӨ (дизайны дүрэм 5d).
     *    Урвуу дарааллаар хийвэл архив унахад мөр «Шилжүүлсэн» болчихсон
     *    байх ба дахин батлах зам ХААГДАНА — батлагдсан гүйцэтгэл үндсэн
     *    дататай хэзээ ч уулзахгүй, хаана ч алдаа үлдэхгүй.
     */
    let archiveOid = cur[F.sheetOid];
    /** ⚠️ Архивласан агшны огноо — IPC мөр үүсгэхэд (доор) */
    let archivedDay: string | undefined;
    /** ⚠️ Архивласан багцын түлхүүр — legacy замд `undefined` (`Archived`-ийн ⚠️) */
    let archivedPkg: string | undefined;
    if (registerNow) {
      const ar = await archiveSubmission(cur);
      if (!ar.ok) return { ok: false, error: ar.error };
      archiveOid = ar.archiveOid;
      archivedDay = ar.day;
      archivedPkg = ar.pkgKey;
      /* ⚠️ Архивласны ДАРАА мөрийн төлөвийг ДАХИН ШАЛГАХГҮЙ (2026-09-17-ны
         аудит): «буцаах» ба «батлах» зэрэг дарагдсан үед жааз архивт
         бичигдчихсэн байхад STALE-ээр зогсвол өнчин жааз үлдэж, нэгтгэл/IPC
         хэзээ ч ажиллахгүй. Архив бичигдсэн бол хяналтын мөр ЗААВАЛ түүнийг
         дагана — «шилжүүлсэн» нь өгөгдөлтэйгээ нийцнэ. Давхар-батлах уралдаанд
         `archiveSubmission` `done|`-оор idempotent тул хоёр дахь жааз үүсэхгүй. */
    }

    try {
      await updateRows([attrs]);
    } catch (e) {
      /*
       * ⚠️ ХАРИУ АЛДАГДСАН Ч СЕРВЕР ДЭЭР СУУСАН БАЙЖ БОЛНО (2026-09-25-ны
       *    аудит). `applyEdits` серверт бичигдээд HTTP хариу нь тасарвал энд
       *    алдаа гарч доорх нэгтгэл/IPC ОГТ ажиллахгүй; дахин дарахад
       *    `liveRow` «Шилжүүлсэн»-ийг хараад STALE буцаах тул тэр батлагдсан
       *    өдөр нэгтгэл/IPC-гүй МӨНХӨД үлддэг байв. Эцсийн батлалтад мөрийг
       *    ДАХИН уншаад «Шилжүүлсэн» болсон бол бичилт суусан гэж үзэж
       *    үргэлжлүүлнэ (`registerApproved`, `syncIpcFromFill` хоёулаа
       *    idempotent). Уншиж чадахгүй эсвэл суугаагүй бол анхны алдааг шиднэ.
       * ⚠️ Таб энэ хооронд ХААГДВАЛ: `done|` payload-ын `regPending` тэмдэг
       *    үлдэж, `retryPendingRegistrations` дараа нь нэгтгэл/IPC-г нөхнө
       *    (2026-09-25).
       */
      if (!registerNow) throw e;
      let landed = false;
      try { landed = (await liveRow(a.oid))?.[F.status] === STATUS.transferred; } catch { landed = false; }
      if (!landed) throw e;
    }
    /** Хагас амжилтын анхааруулгууд — нэгтгэл · IPC · `Zovshoorson_nud` */
    const warns: string[] = [];
    if (registerNow) {
      /*
       * ⚠️ БҮРТГЭЛ УНАВАЛ БАТАЛГАА УНАХГҮЙ. Хяналтын шийдвэр аль хэдийн
       *    хадгалагдсан байхад «болсонгүй» гэж харуулбал менежер дахин дарж,
       *    давхардсан бүртгэл үүсгэнэ. Алдааг зөвхөн бүртгэнэ.
       *
       * ⚠️ `registerApproved`-д АРХИВЫН OBJECTID өгнө — илгээлтийн мөрийн
       *    дугаар БИШ (тэр нь өөр үйлчилгээний дугаар; тэгвэл нэгтгэл
       *    «агшин олдсонгүй» гэж чимээгүй унана).
       */
      const { registerApproved } = await import('./negtgelWrite');
      /* ⚠️ ДАХИН ОРОЛДОНО (2026-09-06): нэг удаагийн сүлжээний саат нь
         батлагдсан гүйцэтгэлийг нэгтгэлээс МӨНХӨД хасах ёсгүй. Гурван
         оролдлого, өсөх завсартай. `registerApproved` нь давхардлаас
         өөрөө хамгаалдаг (багц·огноогоор шалгана) тул давтахад аюулгүй. */
      let r = await registerApproved(cur[F.bagts], archiveOid, archivedPkg);
      for (let i = 0; i < 2 && !r.ok; i += 1) {
        await new Promise((res) => setTimeout(res, 800 * (i + 1)));
        r = await registerApproved(cur[F.bagts], archiveOid, archivedPkg);
      }
      if (!r.ok) {
        console.warn('[selbe] нэгтгэлд бүртгэж чадсангүй:', r.error);
        /* ⚠️ Дуудагчид ИЛ буцаана — дэлгэц дээр шар мөр болж гарна.
           Батлалт ӨӨРӨӨ бүтсэн тул `ok: true` хэвээр.
           ⚠️ ЭНД БУЦАХГҮЙ (2026-09-25-ны аудит): урьд нь энд `return` хийдэг
           байсан тул IPC мөр (доор) ОГТ бичигдэхгүй, анхааруулга нь зөвхөн
           нэгтгэлийг нэрлэдэг байв — мөр «Шилжүүлсэн» болсон тул дахин батлах
           зам ч хаалттай, тэр сарын IPC мөнхөд дутуу. IPC нь нэгтгэлээс
           ХАМААРАЛГҮЙ тул үргэлжлүүлж, хоёр үр дүнг нэг `warn`-д нийлүүлнэ. */
        warns.push(tr('Батлагдаж архивт бичигдлээ, гэхдээ нэгтгэлийн хүснэгтэд бүртгэгдсэнгүй ({0}). Дашбоардын багцын муруйд энэ өдөр харагдахгүй — админд мэдэгдэнэ үү.', r.error ?? ''));
      }

      /*
       * ── ГҮЙЦЭТГЭЛЭЭС IPC МӨР ──────────────────────────────────────────
       * ⚠️ Хэрэглэгчийн шийдвэр (2026-09-09): «ho гүйцэтгэлийн дата
       * гүйцэтгэл бөглөгдөхөд нэмэгдэх ёстой». ЗӨВХӨН энд — 4 шатын
       * хяналт дуусаж архивт бичигдсэний ДАРАА. Батлагдаагүй бөглөлтөөс
       * IPC үүсгэвэл хянагч буцаахад ХУДАЛ IPC үлдэнэ.
       *
       * ⚠️ НЭГ БАГЦ · НЭГ САР = НЭГ МӨР. Сард дахин батлагдвал тэр мөр
       * ШИНЭЧЛЭГДЭНЭ (`ipcAuto.planAuto`), шинэ мөр үүсэхгүй.
       *
       * ⚠️ АЛДАА ГАРВАЛ БАТАЛГААГ УНАГААХГҮЙ — `registerApproved`-ийн ЯГ
       * ижил шалтгаан: шийдвэр аль хэдийн хадгалагдсан байхад «болсонгүй»
       * гэвэл менежер дахин дарж давхардал үүсгэнэ. Зөвхөн бүртгэнэ.
       *
       * ⚠️ `archivedDay` нь `archiveSubmission`-аас — тэр нь `fillMs`-ийг
       * өөрөө залруулдаг тул гаднаас таамаглавал IPC өөр сард бичигдэнэ.
       */
      /** IPC мөр бичигдсэн эсэх — `markRegistered`-ийн нөхцөл (доор) */
      let ipcOk = false;
      if (archivedDay) {
        /* ⚠️ IPC-ийн алдааг ч ИЛ хэлнэ (2026-09-25) — урьд нь зөвхөн
           `console.warn` байсан тул тэр сарын IPC дутуу үлдсэнийг хэн ч мэдэхгүй. */
        let ipcErr = '';
        try {
          const { syncIpcFromFill } = await import('./ipcAutoWrite');
          const ipc = await syncIpcFromFill(cur[F.bagts], archivedDay);
          if (!ipc.ok) {
            console.warn('[selbe] IPC мөр үүсгэж чадсангүй:', ipc.error);
            ipcErr = String(ipc.error ?? '');
          }
        } catch (e) {
          console.warn('[selbe] IPC мөр үүсгэх алдаа:', e);
          ipcErr = String((e as Error)?.message ?? e);
        }
        if (ipcErr) {
          warns.push(tr('Батлагдаж архивт бичигдлээ, гэхдээ гүйцэтгэлээс IPC мөр үүсгэж чадсангүй ({0}). Тухайн сарын IPC-г админд мэдэгдэж шалгуулна уу.', ipcErr));
        }
        ipcOk = !ipcErr;
      }
      /*
       * ⚠️ «БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ» ТЭМДГИЙГ АРИЛГАНА (2026-09-25 аудит) — зөвхөн
       *    нэгтгэл БА IPC хоёулаа бүтсэн бол. Аль нэг нь унавал тэмдэг үлдэж
       *    `retryPendingRegistrations` дараа нь дахин ажиллуулна. `archivedPkg`
       *    байхгүй (legacy — `Эх_мөрийн_дугаар` нь АРХИВЫН oid) бол дуудахгүй:
       *    тэр дугаар илгээлтийн хүснэгтийн өөр мөртэй санамсаргүй давхцаж болно.
       *    Унавал зөвхөн анхааруулга — батлалт бүтсэн.
       */
      if (r.ok && ipcOk && archivedPkg) {
        try {
          const { markRegistered } = await import('./submission');
          const mk = await markRegistered(Number(cur[F.sheetOid]));
          if (!mk.ok) console.warn('[selbe] «бүртгэл хүлээгдэж буй» тэмдгийг арилгаж чадсангүй:', mk.error);
        } catch (e) {
          console.warn('[selbe] «бүртгэл хүлээгдэж буй» тэмдгийг арилгаж чадсангүй:', e);
        }
      }
    }
    await refresh();
    /* 2026-09-23 (#16): `Zovshoorson_nud` талбар алга байсан бол шар мөрөөр хэлнэ */
    if (okWarn) warns.push(okWarn);
    return warns.length ? { ok: true, warn: warns.join(' · ') } : { ok: true };
  } catch (e) { return fail(e); }
}

/** Сешнд нэг л удаа оролдсон илгээлтүүд — давтан дуудлагад дахин ажиллуулахгүй */
const SWEPT = new Set<number>();
let sweeping = false;

/**
 * БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ БАТЛАЛТУУДЫГ НӨХНӨ (2026-09-25 аудит).
 *
 * ⚠️ ЯАГААД: эцсийн батлалтад `updateRows` → `registerApproved` →
 *    `syncIpcFromFill` дараалан явдаг; таб энэ хооронд хаагдвал мөр
 *    «Шилжүүлсэн» болсон тул дахин батлах зам хаалттай, тэр өдөр нэгтгэл/IPC-гүй
 *    МӨНХӨД үлддэг байв. `done|` payload-ын `regPending` тэмдэг үүнийг барина.
 * ⚠️ ЗӨВХӨН «Шилжүүлсэн» мөр, ЗӨВХӨН эцсийн шатны эрхтэй хүн (`authz`) —
 *    бусдын бичилт эрхгүйгээр унах байсан. `archiveSubmission` нь `done|`
 *    замаар ЮУ Ч бичихгүй (idempotent), `registerApproved` (багц·огноо) ба
 *    `syncIpcFromFill` (багц·сар) хоёулаа idempotent.
 * ⚠️ Алдаа нь чимээгүй (`console.warn`) — энэ нь нөхөх зам, хуудсыг унагахгүй.
 */
export async function retryPendingRegistrations(
  me: string | undefined,
  bypass: boolean,
): Promise<{ done: number; failed: number }> {
  const out = { done: 0, failed: 0 };
  if (sweeping) return out;
  sweeping = true;
  try {
    const { listRegPending, markRegistered } = await import('./submission');
    const pend = (await listRegPending()).filter((p) => !SWEPT.has(p.oid));
    if (!pend.length) return out;
    if (!loaded) await refresh();
    const final = REVIEW_STAGES[REVIEW_STAGES.length - 1];
    for (const sub of pend) {
      const cur = ROWS.find((r) => Number(r[F.sheetOid]) === sub.oid && r[F.status] === STATUS.transferred);
      if (!cur) continue;
      if (authz(final, me, String(cur[F.bagts] ?? ''), bypass)) continue;
      SWEPT.add(sub.oid);
      try {
        const ar = await archiveSubmission(cur);
        if (!ar.ok || !ar.pkgKey || !(ar.archiveOid > 0)) { out.failed += 1; continue; }
        const { registerApproved } = await import('./negtgelWrite');
        const r = await registerApproved(cur[F.bagts], ar.archiveOid, ar.pkgKey);
        let ipcOk = false;
        if (ar.day) {
          const { syncIpcFromFill } = await import('./ipcAutoWrite');
          const ipc = await syncIpcFromFill(cur[F.bagts], ar.day);
          ipcOk = ipc.ok;
          if (!ipc.ok) console.warn('[selbe] IPC нөхөж чадсангүй:', ipc.error);
        }
        if (!r.ok) console.warn('[selbe] нэгтгэлд нөхөж бүртгэж чадсангүй:', r.error);
        if (r.ok && ipcOk) {
          const mk = await markRegistered(sub.oid);
          if (mk.ok) out.done += 1;
          else { out.failed += 1; console.warn('[selbe] «бүртгэл хүлээгдэж буй» тэмдэг арилсангүй:', mk.error); }
        } else {
          out.failed += 1;
        }
      } catch (e) {
        out.failed += 1;
        console.warn('[selbe] хүлээгдэж буй бүртгэлийг нөхөх алдаа:', e);
      }
    }
    return out;
  } catch (e) {
    console.warn('[selbe] хүлээгдэж буй бүртгэлийн жагсаалт:', e);
    return out;
  } finally {
    sweeping = false;
  }
}

/*
 * ⚠️ `resubmit` УСТГАГДСАН (2026.08.21). Компани буцаалт хүлээж авбал
 * «Гүйцэтгэл бөглөх» хуудас руу шилжиж, тэндээ засаад «Нийтлэх» дарна —
 * тэр үед `hyanaltSubmit.submitForReview` шинэ хянуулалт үүсгэнэ. Энд бас
 * мөр үүсгэвэл НЭГ засварт ХОЁР бүртгэл орно.
 */

/**
 * МЕНЕЖЕР БУЦААСНЫГ ИНЖЕНЕР ДАХИН ШАЛГАВ.
 *
 * ⚠️ Инженер бол ДАМЖУУЛАГЧ БИШ, ДАХИН ШАЛГАГЧ:
 *   ok    → асуудал үнэхээр байхгүй тул менежерт ЭРГҮҮЛЖ илгээнэ (ШИНЭ мөр)
 *   back  → дахин шалгахад асуудал ГАРСАН тул компанид буцаана (мөн мөр)
 *
 * ⚠️ Компанид буцаах үед шалтгааныг ИНЖЕНЕР ӨӨРӨӨ бичнэ. Менежерийн бичвэрийг
 * хуулж дамжуулахгүй — тэр нь дотоод хяналтын мэдээлэл.
 */
export async function recheck(
  oid: number,
  verdict: 'ok' | 'back',
  reason: string,
  who: string,
  /**
   * ХЭН дахин шалгаж байна.
   * ⚠️ Хоёр газар давтагдана: менежер буцаахад ИНЖЕНЕР, ерөнхий менежер
   *    буцаахад БАГЦЫН МЕНЕЖЕР. Логик нь ижил, зөвхөн талбар ба шат өөр.
   */
  by: Exclude<ReviewStage, 'chief'> = 'engineer',
  /** ЭРХИЙН ШАЛГУУРЫН хэрэглэгчийн нэр — `who` (дэлгэцийн нэр) БИШ */
  me?: string,
  /** Шалгуурыг тойруулах — зөвхөн нэвтрэлтгүй/админы шат сонголт */
  bypass = false,
  /**
   * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮДНҮҮД — `apply`-ийнхтай ИЖИЛ утга
   * (`hyanalt.F.okCells`-ийн ⚠️). Дахин шалгалтад ч гүйцэтгэгч рүү
   * буцаах бол «аль нүд ногоон» гэдгийг ЗААВАЛ дамжуулна.
   */
  okCells?: string[],
  /**
   * ХЯНАГЧИЙН ХАРСАН илгээлтийн агшин (`payload.at`) — `apply`-ийн `subAt`-тай
   * ИЖИЛ тулгалт (2026-09-24-ний аудит): дахин шалгалтын хооронд компани
   * илгээлтээ шинэчилсэн бол харагдаагүй агуулга дээш явахгүй (fail-closed).
   */
  subAt?: number,
): Promise<Result> {
  let prev: Row | undefined;
  try { prev = await liveRow(oid); } catch (e) { return fail(e); }
  if (!prev) { emit(); return { ok: false, error: tr('Бүртгэл олдсонгүй') }; }
  // ⚠️ Зөвхөн ДЭЭД шатнаас буцсан мөрийг дахин шалгана — хуучирсан дэлгэцээс
  //    давхар дахин шалгалт (давхар мөр) эсвэл өөр төлөвт бичихээс сэргийлнэ.
  /* ⚠️ Дахин шалгагч нь ДАРААГИЙН шатны буцаалтыг л авна (2026-09-23, 6 шат) */
  const upper = nextReview(by)!;
  const want = RETURNED_STATUS[upper];
  if (prev[F.status] !== want) { emit(); return { ok: false, error: STALE }; }
  /* ⚠️ `apply`-тай ИЖИЛ шалгуур — дахин шалгалт нь мөрийг дээд шат руу
     дахин илгээдэг тул эрхийн ижил жинтэй (`hyanaltStore`-ийн authz). */
  {
    const deny = authz(by, me, String(prev[F.bagts] ?? ''), bypass === true);
    if (deny) { emit(); return { ok: false, error: deny }; }
  }
  /* ⚠️ ИЛГЭЭЛТИЙН АГУУЛГЫН ТУЛГАЛТ — `apply`-тай ИЖИЛ (дээрх `subAt`) */
  if (subAt != null) {
    const { readSubmissionByOid } = await import('./submission');
    const sr = await readSubmissionByOid(Number(prev[F.sheetOid]));
    if (!sr.ok) return { ok: false, error: sr.error };
    if (!sr.sub || sr.sub.payload.at !== subAt) {
      emit();
      return { ok: false, error: tr('Илгээлтийн агуулга өөрчлөгдсөн — дахин уншина уу'), contentChanged: true };
    }
  }

  const t = Date.now();

  if (verdict === 'ok') {
    const base = prev;
    /*
     * ⚠️ ДАВХАР МӨРӨӨС ХАМГААЛАХ ХОЁР ДАХЬ ШАЛГУУР — төлөвийн шалгуур
     *    ГАНЦААРАА хангалтгүй. Дахин шалгалт ХУУЧИН мөрийг ЗАСДАГГҮЙ (энэ нь
     *    санаатай: буцаалтын шалтгаан ба цаг дарагдахгүй), тиймээс эх мөр
     *    «Менежер буцаасан» ТӨЛӨВТЭЙГЭЭ үлдэж, дараагийн дуудлага дээрх
     *    `prev[F.status] !== want` шалгуурыг мөн ДАВНА. Нэг багцад хоёр
     *    инженер томилогдоод хоёул «менежерт илгээх» дарвал ижил
     *    `Хэддэх_удаа`-тай ХОЁР шинэ мөр үүсдэг байв; `groupWorks` зөвхөн
     *    хамгийн их OID-тайг «одоогийн» болгодог тул нөгөө нь мөнхөд
     *    «Менежер хянаж байна» төлөвт үлдэж, тойргийн тоолуурыг гажуудуулна.
     *    `ROWS` нь дээрх `liveRow`-оос ДӨНГӨЖ ирсэн — хуучирсан биш.
     */
    const ergelt = base[F.ergelt] + 1;
    const twin = ROWS.some((r) => r[F.sheetOid] === base[F.sheetOid]
      && r[F.bagts] === base[F.bagts] && r[F.ergelt] === ergelt);
    if (twin) { emit(); return { ok: false, error: STALE }; }

    const sentAt = prev[F.companySent];
    /*
     * ⚠️ ХУУЧИН МӨРИЙГ ЗАСАХГҮЙ — ДАХИН ШАЛГАЛТ БҮРТ ШИНЭ МӨР. Хуучныг засвал
     * менежерийн буцаалт болон инженерийн анхны зөвшөөрлийн цаг дарагдаж,
     * инженер↔менежер хооронд хэдэн удаа ярвал бүгд алга болно.
     */
    /* Дахин шалгасны дараа ажил ХААШАА явах вэ — нэг алхам урагш. */
    const nextStatus = REVIEW_STATUS[upper];
    /* Инженерийн илгээсэн огноо — менежер дахин шалгахад ХЭВЭЭР үлдэнэ. */
    const engPrev = prev[F.engineerSent];
    const engSent = engPrev ? Date.parse(engPrev) : t;
    const fresh: Attrs = {
      [F.id]: nextId(),
      [F.sheetOid]: prev[F.sheetOid],
      [F.ergelt]: ergelt,
      [F.bagts]: prev[F.bagts],
      [F.ajil]: prev[F.ajil],
      [F.company]: prev[F.company],
      /*
       * ⚠️ ОДООГИЙН ЦАГ ТАВИХГҮЙ — компани дахин илгээгээгүй. Хуучин огноог
       * хэвээр авч явна; эс бөгөөс компани илгээгээгүй атлаа илгээсэн мэт
       * ХУДАЛ бүртгэл үүснэ. Дэлгэц дээр давхардсан огноогоор нь тухайн
       * тойргийг «дахин шалгалт» гэж таньдаг.
       */
      [F.companySent]: sentAt ? Date.parse(sentAt) : null,
      /*
       * ⚠️ ДАХИН ШАЛГАСАН ШАТ хүртэлх бүх түүх ХЭВЭЭР, дараагийн шатнуудынх
       *    ХООСОН — шинэ хяналт тэднээс эхэлж байна. Хуучин зөвшөөрлийг
       *    үлдээвэл дараагийн шат «би аль хэдийн баталсан» гэж харагдана.
       */
      /* ⚠️ 2026-09-23 (6 шат): `by`-аас ДООД шатнууд — өмнөх мөрийн зөвшөөрөл
         хэвээр (нэр · илгээсэн огноо), `by` өөрөө — одоо зөвшөөрөв, ДЭЭД
         шатнууд — хоосон. Инженерийн илгээсэн огноо `engSent` дүрэм хэвээр. */
      ...Object.fromEntries(REVIEW_STAGES.flatMap((s) => {
        const f = SF[s];
        const si = REVIEW_STAGES.indexOf(s);
        const bi = REVIEW_STAGES.indexOf(by);
        if (si < bi) {
          const sentPrev = prev[f.sent as keyof Row] as string | null;
          const sentMs = s === 'engineer' ? engSent : (sentPrev ? Date.parse(sentPrev) : null);
          return [
            [f.who, prev[f.who as keyof Row]], [f.decision, DECISION.approve], [f.reason, ''],
            [f.returned, null], [f.sent, sentMs],
          ];
        }
        if (si === bi) {
          return [[f.who, who], [f.decision, DECISION.approve], [f.reason, ''], [f.returned, null], [f.sent, t]];
        }
        return [[f.who, ''], [f.decision, ''], [f.reason, ''], [f.returned, null], [f.sent, null]];
      })),
      [F.status]: nextStatus,
    };
    try {
      await addRows([fresh]);
      await refresh();
      return { ok: true };
    } catch (e) { return fail(e); }
  }

  // ── Асуудал БАЙНА — компанид буцаана. Мөрийн ЭЦСИЙН үйлдэл тул шинэ мөр
  //    хэрэггүй; компани засаад илгээхэд `resubmit` шинийг үүсгэнэ.
  const why = reason.trim();
  // ⚠️ Шалтгаангүй буцаалт нь хүлээн авагчийг юу засахаа мэдэхгүй болгоно
  if (!why) return { ok: false, error: tr('Буцаах шалтгаанаа бичнэ үү') };

  /*
   * ⚠️ ЗӨВШӨӨРСӨН НҮДНИЙ ЖАГСААЛТ — `apply`-тай ИЖИЛ дүрэм. Энэ бол
   *    гүйцэтгэгч рүү буцах зам тул нүдний ялгаа ХАМГИЙН чухал нь энд.
   */
  /* ⚠️ 2026-09-23 (#16): талбар байхгүй бол бичихгүй, `warn`-аар ил хэлнэ. */
  const okp = await okCellsPatch(okCells);
  const okPatch: Attrs = okp.patch;

  /* ⚠️ Буцаалт нь `by` шатны ӨӨРИЙН буцаалт — нэг алхам доош (`OWNER`) */
  const bf = SF[by];
  const back: Attrs = {
    [HYANALT.oid]: oid,
    [bf.who]: who,
    [bf.decision]: DECISION.return,
    [bf.reason]: why,
    [bf.returned]: t,
    [F.status]: RETURNED_STATUS[by],
    ...okPatch,
  };

  try {
    await updateRows([back]);
    await refresh();
    return okp.warn ? { ok: true, warn: okp.warn } : { ok: true };
  } catch (e) { return fail(e); }
}

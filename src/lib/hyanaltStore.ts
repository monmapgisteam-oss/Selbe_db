'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТЫН ӨГӨГДЛИЙН ДАВХАРГА — амьд ArcGIS үйлчилгээ.
 *
 * ⚠️ ОГНООГ СИСТЕМ ТАВЬНА, хэрэглэгч гараар оруулахгүй. Бүх огноо энд
 * СЕРВЕРИЙН цагаар (`serverClock.serverNow` — 2026-10-12-ны дарааллын аудит; урьд нь хөтчийн
 * `Date.now()`) бичигдэнэ. Дээр нь ArcGIS-ийн Editor Tracking нэмэлт
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
 * хүснэгт буюу үндсэн сервис рүү орно» (хэрэглэгчийн тухайн үеийн үг; одоо 6 шат —
 * `REVIEW_STAGES`, 2026-10-09 аудит №6). Урьд нь «Нийтлэх» дармагц
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

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { t as tr } from './i18nCore';
import {
  addRows, addedOid, deleteRow, ensureUniqueId, fieldMaxLen, hasHistoryField, hasOkCellsField, queryAll, queryStatusSig,
  updateDecision, HyanaltConflict,
  DECISION, F, HYANALT, STATUS,
  REVIEW_STAGES, REVIEW_STATUS, RETURNED_STATUS, SF, nextReview, prevReview,
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
/* ⚠️ 2026-10-12 (R1): `error` — кодлосон жагсаалт баганын уртаас (`fieldMaxLen`) хэтэрсэн: бичилт ЗААВАЛ
   унах тул шийдвэрийг ИЛГЭЭХГҮЙ, дуудагч ил мессежээр зогсоно. Богино кодчилол (`hyanaltOkCells`) байхгүй —
   таслах нь «аль нүд зөвшөөрөгдсөн» мэдээллийг чимээгүй гажуудуулна. */
/* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `strict: false` (ЗӨВШӨӨРӨХ зам) — уртаас хэтэрвэл `error` биш `warn`: талбарыг
   хөндөхгүй (`patch: {}`) орхиж шийдвэр явна. Зөвшөөрөлд бичигдсэн `Zovshoorson_nud`-ийг хэн ч уншдаггүй (дараагийн шат
   хоосноос эхэлж, буцаагч өөрийнхөөрөө дардаг, гүйцэтгэгч зөвхөн БУЦААГДСАН мөрийнхийг уншина) тул хатуу зогсолт нь
   256 тэмдэгтийн баганатай үйлчилгээнд ~11-ээс олон нүдтэй илгээлтийг АЛЬ Ч шат батлахгүй болгож байв.
   Буцаалтад (`strict: true`, анхдагч) хатуу зогсолт хэвээр — тэнд жагсаалт гүйцэтгэгчийн цорын ганц мэдээлэл. */
async function okCellsPatch(okCells: string[] | undefined, strict = true): Promise<{ patch: Attrs; warn?: string; error?: string }> {
  if (!okCells) return { patch: {} };
  const has = await hasOkCellsField();
  if (has === false) {
    console.warn(`[selbe] «${F.okCells}» талбар хяналтын үйлчилгээнд алга — зөвшөөрсөн нүд хадгалагдсангүй. AGOL дээр талбар нэмнэ үү.`);
    return {
      patch: {},
      warn: tr('«{0}» багана хяналтын үйлчилгээнд алга — зөвшөөрсөн нүдний жагсаалт хадгалагдсангүй тул гүйцэтгэгч аль нүд зөвшөөрөгдсөнийг харахгүй. AGOL дээр багана нэмнэ үү.', F.okCells),
    };
  }
  /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ЗӨВХӨН ШИНЭ хэлбэр (`{v:2,c:[…]}` — мөрийн
     тогтвортой түлхүүрээр, `hyanaltOkCells.ts`). Хуучин индексийн массив бичигдэхгүй. */
  const enc = encodeOkCells(okCells);
  const max = await fieldMaxLen(F.okCells);
  if (max != null && enc.length > max) {
    if (!strict) {
      return {
        patch: {},
        warn: tr('Зөвшөөрсөн нүдний жагсаалт ({0} тэмдэгт) «{1}» баганын хэмжээнээс ({2}) хэтэрсэн тул хадгалагдсангүй — шийдвэр хэвээр явлаа. AGOL дээр баганын уртыг нэмүүлнэ үү.', String(enc.length), F.okCells, String(max)),
      };
    }
    return {
      patch: {},
      error: tr('Зөвшөөрсөн нүдний жагсаалт ({0} тэмдэгт) «{1}» баганын хэмжээнээс ({2}) хэтэрлээ — шийдвэр хадгалагдсангүй. AGOL дээр баганын уртыг нэмүүлнэ үү.', String(enc.length), F.okCells, String(max)),
    };
  }
  return { patch: { [F.okCells]: enc } };
}

/**
 * ⚠️ 2026-10-12 (R1): ШАЛТГААНЫ ДЭЭД УРТ — `huvaariBatlah.REASON_MAX`-тай ижил 2000 (статик импортолбол
 *    дашбоардын багц хуваарийн модулийг чирнэ — `archiveSubmission`-ий динамик импортын ⚠️).
 *    Бодит хязгаар = min(2000, баганын урт) — `reasonMax`.
 */
export const REASON_MAX = 2000;
/** Тухайн шатны шалтгааны баганад багтах дээд урт (UI-ийн `maxLength` ба бичилтийн таслалт — нэг эх) */
export async function reasonMax(stage: ReviewStage): Promise<number> {
  const n = await fieldMaxLen(SF[stage].reason);
  return n != null && n > 0 ? Math.min(REASON_MAX, n) : REASON_MAX;
}
/** Уртаас хэтэрвэл таслаж «…» залгана — шалтгааны эхэнд хэрэглэгчийн бичвэр (`badText`) тул тэр хадгалагдана */
const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`);

/**
 * ШИЙДВЭРИЙН ЛОГ (`Shiidveriin_tuuh`) — талбар БАЙВАЛ л үйл явдал нэмнэ (2026-10-01).
 * ⚠️ `base` нь БИЧИХИЙН ӨМНӨ уншсан мөрийн лог — `movedSince` тэр талбарыг ч
 *    тулгадаг тул завсарт өөр хүн нэмсэн бол бичилт зогсож, лог дарагдахгүй.
 * ⚠️ `false`/`null` (алга/мэдэхгүй) → `{}` — шийдвэр урьдын адил, логгүй.
 */
/* ⚠️ 2026-10-06 (аудит #6): `user` — ArcGIS ХЭРЭГЛЭГЧИЙН НЭР (`u`) логийн үйл явдалд
   хадгалагдана; дараалсан хоёр шатыг нэг хүн шийдэхээс сэргийлэх (`authz`) түлхүүр. */
async function historyPatch(base: unknown, e: HistEntry, user?: string): Promise<Attrs> {
  const has = await hasHistoryField();
  if (has !== true) return {};
  return { [F.history]: withUsers(base, appendHistory(base, e), user) };
}

/** Логийн түүхий үйл явдал — `u` талбарыг уншихад (`parseHistory` үүнийг хаядаг) */
type RawHist = { stage?: unknown; at?: unknown; act?: unknown; u?: unknown; [k: string]: unknown };
function rawHist(raw: unknown): RawHist[] {
  try {
    const a: unknown = JSON.parse(String(raw ?? ''));
    return Array.isArray(a) ? a.filter((x): x is RawHist => !!x && typeof x === 'object') : [];
  } catch { return []; }
}

/**
 * ЛОГИЙН ҮЙЛ ЯВДАЛД ХЭРЭГЛЭГЧИЙН НЭР (`u`) НЭМНЭ (2026-10-06, аудит #6).
 * ⚠️ `hyanaltHistory.appendHistory` нь танихгүй талбарыг ХАЯДАГ (цэвэр модуль, өөрчлөхгүй) —
 *    тиймээс өмнөх үйл явдлын `u`-г `base`-аас (шат·агшин·үйлдлээр) сэргээж, ШИНЭ (сүүлийн)
 *    үйл явдалд `user`-ийг тавина. Хуучин уншигч (`parseHistory`) `u`-г үл тоомсорлоно.
 * ⚠️ Хэмжээний нөөц (65536): `u` нэмэгдсэн тул хэтэрвэл хамгийн хуучнаас хасна.
 */
function withUsers(base: unknown, out: string, user?: string): string {
  const key = (e: RawHist) => `${String(e.stage)}|${Number(e.at)}|${String(e.act)}`;
  const us = new Map<string, string>();
  for (const e of rawHist(base)) if (typeof e.u === 'string' && e.u) us.set(key(e), e.u);
  let list = rawHist(out).map((e) => {
    const u = us.get(key(e));
    return u ? { ...e, u } : e;
  });
  const u0 = (user ?? '').trim().toLowerCase();
  if (u0 && list.length) list[list.length - 1] = { ...list[list.length - 1], u: u0 };
  let s = JSON.stringify(list);
  while (s.length > 65_000 && list.length > 1) { list = list.slice(1); s = JSON.stringify(list); }
  return s;
}

/** Тухайн шатыг хамгийн сүүлд ЗӨВШӨӨРСӨН хүний ArcGIS нэр (`u`) — мэдэхгүй бол `''` */
function lastApprover(raw: unknown, stage: ReviewStage): string {
  let best = '';
  let bestAt = -Infinity;
  for (const e of rawHist(raw)) {
    if (e.stage !== stage || (e.act !== 'approve' && e.act !== 'recheck-ok')) continue;
    const at = Number(e.at);
    if (!Number.isFinite(at) || at < bestAt) continue;
    bestAt = at;
    best = typeof e.u === 'string' ? e.u.trim().toLowerCase() : '';
  }
  return best;
}

/** ⚠️ 2026-10-12 (дарааллын аудит, №1): тухайн шатыг сүүлд ЗӨВШӨӨРСӨН хүний ДЭЛГЭЦИЙН нэр (`who`) — `retryPendingRegistrations` */
function lastApproverName(raw: unknown, stage: ReviewStage): string {
  let best = '';
  let bestAt = -Infinity;
  for (const e of rawHist(raw)) {
    if (e.stage !== stage || (e.act !== 'approve' && e.act !== 'recheck-ok')) continue;
    const at = Number(e.at);
    if (!Number.isFinite(at) || at < bestAt) continue;
    bestAt = at;
    best = typeof e.who === 'string' ? e.who.trim() : '';
  }
  return best;
}

/**
 * ЭРХИЙН ШАЛГУУРЫН ХЭРЭГЛЭГЧ (2026-10-06, аудит #2).
 * ⚠️ ХӨТӨЧИД дуудагчийн `me`-д ИТГЭХГҮЙ — `currentUser()` (AuthGate бичнэ). Node (тест,
 *    `tools/`) нь хөтчийн сешн биш тул дамжуулсан утга (`who.requireCap`-ийн загвар).
 */
function meOf(passed: string | undefined): string {
  return (typeof window !== 'undefined' ? currentUser() ?? '' : passed ?? '').trim().toLowerCase();
}
import {
  bagtsFor, flowAclReady, isViewOnly, stageOfUser,
} from './guitsetgelAcl';
import { appendHistory, type HistEntry } from './hyanaltHistory';
import { encodeOkCells } from './hyanaltOkCells';
/* ⚠️ 2026-10-09: ЗӨВХӨН төрөл — `submission` модуль динамикаар (`archiveSubmission`-ийн ⚠️) */
import type { ArchivingMark, StagedSubmission, SubmissionPayload } from './submission';
/* ⚠️ 2026-10-09 (аудит №6): `bagtsKey` — багцын нэрийг нормчилж жишнэ (`negtgelWrite.summaryOf`-той нэг дүрэм) */
import { AUTH, bagtsKey, roleForUser } from './services';
import { currentUser } from './who';
import { arcgisPost } from './query';
import { isLostWrite } from './lostWrite';
/* ⚠️ 2026-10-12 (дарааллын аудит): серверийн цаг — шатны огноо · лог · тэмдэг · `approvedAt` (`serverClock`-ийн ⚠️) */
import { serverNow, syncServerClock } from './serverClock';
/* ⚠️ 2026-10-12 (дарааллын аудит): эцсийн батлалтын гинжний кэш-мэдэгдлийг нэгтгэнэ (`batchInvalidate`-ийн ⚠️) */
import { batchInvalidate, invalidate } from './dataBus';

/**
 * ⚠️ 2026-10-09 (аудит): ХАДГАЛАГДАХ ДЭЛГЭЦИЙН НЭР (`who`) — нэвтэрсэн хэрэглэгчийнх мөн эсэх.
 *    Урьд нь `apply`/`recheck` нь дуудагчийн өгсөн `who`-г ШАЛГАЛТГҮЙ `SF[шат].who` ба логт бичдэг,
 *    R5 нөөц шалгалт (`authz` → `same`) ч ЯГ ТЭР `who`-тэй харьцуулдаг байв — консолоос өөр нэр
 *    дамжуулж хүний нэрээр шийдвэр бичих, дараалсан хоёр шатны хоригийг тойрох боломжтой.
 *    `ajilBatlah`/`obyemBatlah`/`huvaariBatlah`-ийн `sameAsLogin`-ийн загвар: зөрвөл ТАТГАЛЗАНА.
 *    Ялгаа: энд `who` нь портал хэрэглэгчийн БҮТЭН НЭР (`Guitsetgel` — `fullName || username`) тул
 *    нэвтэрсэн хэрэглэгчийн нэр (username) ЭСВЭЛ порталын `community/self`-ийн `fullName`-тэй тулгана.
 *    Node (тест) ба нэвтрэлт унтраалттай (дев) үед шалгахгүй (`sameAsLogin`-тэй ижил).
 */
const selfFullName = new Map<string, string>();
/**
 * ⚠️ 2026-10-09 (аудит №2): `EXPIRED` = `community/self` нэвтрэлтийн хугацаа дууссанаас (токен шинэчлэгдээгүй
 *    `sessionExpired` эсвэл 498) унасан. Урьд нь бүх уналт `null` → «баталгаажуулж чадсангүй — дахин оролдоно уу»
 *    гардаг тул хэрэглэгч дахин дарсаар байв (дахин оролдлого хэзээ ч бүтэхгүй). Одоо `friendlyError`/
 *    `huvaariBatlah.errText`-тэй ИЖИЛ «дахин нэвтэрнэ үү» мессеж (`whoDeny`).
 */
const EXPIRED = Symbol('expired');
async function loginFullName(u: string): Promise<string | null | typeof EXPIRED> {
  const hit = selfFullName.get(u);
  if (hit != null) return hit;
  try {
    const j = await arcgisPost<{ username?: string; fullName?: string }>(
      `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest/community/self`, {},
    );
    if (String(j?.username ?? '').trim().toLowerCase() !== u) return null;
    const n = String(j?.fullName || j?.username || '').trim();
    selfFullName.set(u, n);
    return n;
  } catch (e) {
    const x = e as { sessionExpired?: boolean; code?: number; cause?: { sessionExpired?: boolean; code?: number } } | null;
    if (x?.sessionExpired === true || x?.code === 498 || x?.cause?.sessionExpired === true || x?.cause?.code === 498) return EXPIRED;
    return null;
  }
}
async function whoDeny(who: string): Promise<string | null> {
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  const u = (currentUser() ?? '').trim().toLowerCase();
  if (!u) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  const w = who.trim().toLowerCase();
  if (w === u) return null;
  const full = await loginFullName(u);
  /* ⚠️ 2026-10-09 (аудит №2): нэвтрэлт дууссан — ерөнхий «баталгаажуулж чадсангүй» биш (`EXPIRED`-ийн ⚠️) */
  if (full === EXPIRED) return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  if (full != null && full.toLowerCase() === w) return null;
  return full == null
    ? tr('Нэвтэрсэн хэрэглэгчийн нэрийг порталаас баталгаажуулж чадсангүй — шийдвэр бүртгэгдсэнгүй, дахин оролдоно уу.')
    : tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.');
}

/**
 * ⚠️ 2026-10-09 (аудит): ДУНД ШАТНЫ БИЧИЛТИЙН ХАРИУ АЛДАГДСАН (timeout · сүлжээ · 5xx — `isLostWrite`).
 *    Урьд нь `apply` (`if (!registerNow) throw e` → `fail`) ба `recheck` (`addRows`/`updateRows`-ийн
 *    `catch` → `fail`) энгийн улаан алдаа буцааж, жагсаалтыг ШИНЭЧЛЭХГҮЙ байв — бичилт серверт суусан
 *    байж болох тул хянагч «болсонгүй» гэж ойлгоод дахин дарж STALE/давхар тойрог авдаг байлаа.
 *    `hyanalt.post` нь `ArcGISError`-ийг `HyanaltError` болгодог тул `cause`-ыг ч шалгана.
 *    Одоо «үр дүн тодорхойгүй — дахин ачаалж байна» + `refreshQuiet` (дэлгэц бодит төлөвийг харуулна).
 */
/* ⚠️ 2026-10-09 (аудит №2): ЭКСПОРТ — зөвхөн Node шалгуурт (`hyanaltAuthz.check.mjs`); дүрэм өөрчлөгдөөгүй */
export const lostWrite = (e: unknown): boolean =>
  isLostWrite(e) || isLostWrite((e as { cause?: unknown } | null)?.cause);
async function lostResult(e: unknown): Promise<Result> {
  console.warn('[selbe] хяналтын бичилтийн хариу алдагдсан:', e);
  await refreshQuiet();
  emit();
  return {
    ok: false,
    error: tr('Хариу алдагдсан — шийдвэр хадгалагдсан эсэх тодорхойгүй. Жагсаалтыг дахин ачааллаа: төлөвийг шалгаад, өөрчлөгдөөгүй бол дахин оролдоно уу. ({0})', String((e as Error)?.message ?? e)),
  };
}

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
 *
 * ⚠️ 2026-10-06 (аудит #2): `me` ба `bypass` нь ДУУДАГЧААС ирдэг байсан тул консолоос
 *    super-ийн нэр эсвэл `bypass: true` дамжуулж шалгуурыг бүхэлд нь тойрч болдог байв.
 *    Одоо хөтөчид: хэрэглэгч = `currentUser()` (дамжуулсан `me` зөрвөл ТАТГАЛЗАНА),
 *    `bypass` = хүссэн БӨГӨӨД зөвшөөрөгдсөн (нэвтрэлт унтраалттай эсвэл кодын хатуу
 *    `super` — `resolveFlowStage.canPick`-тэй ижил дүрэм). Node-д хуучин гэрээ (`meOf`).
 * ⚠️ 2026-10-06 (аудит #6): `hist` өгвөл ӨМНӨХ шатыг хамгийн сүүлд зөвшөөрсөн хүн
 *    (логийн `u`) энэ хэрэглэгч бол ТАТГАЛЗАНА — нэг хүн дараалсан хоёр шат. Хатуу
 *    super / дев нь `bypass`-аар чөлөөлөгдөнө (бүх урсгалыг турших — одоогийн бодлого,
 *    `Guitsetgel` «шат солигдоно» ⚠️). `u`-гүй (хуучин) лог → шалгахгүй.
 * ⚠️ 2026-10-09 (R5): `u`-гүй (лог талбар алга — `historyPatch` `{}` буцаадаг, эсвэл хуучин
 *    лог) үед шалгуур ЧИМЭЭГҮЙ унтардаг байв. Одоо `same` өгвөл НӨӨЦ: өмнөх шатны
 *    `SF[prev].who` (дэлгэцийн нэр) = энэ шийдвэрийн `who` бол татгалзана. `u` байвал урьдын
 *    адил ЗӨВХӨН `u`-гаар (нэр давхцах эрсдэлгүй).
 */
function authz(
  stage: ReviewStage,
  me: string | undefined,
  bagts: string,
  bypass: boolean,
  hist?: unknown,
  /** R5 нөөц — хяналтын мөр ба энэ шийдвэрийн дэлгэцийн нэр (`hist`-тэй хамт л) */
  same?: { row: Row; who: string },
  /**
   * ⚠️ 2026-10-09 (аудит): илгээлтийг илгээсэн данснууд (`submission.submittersOf`) — ЗӨВХӨН инженер шатанд.
   *    Урьд нь илгээгчийн данс бүртгэгддэггүй тул компаниас инженер шат руу шилжүүлсэн данс ӨӨРИЙН
   *    илгээлтийг батлах боломжтой байв. `undefined`/хоосон (хуучин мөр, илгээлтгүй legacy зам) → шалгахгүй.
   */
  submitters?: readonly string[],
): string | null {
  const u = meOf(me);
  let by = bypass;
  if (typeof window !== 'undefined') {
    const passed = (me ?? '').trim().toLowerCase();
    if (AUTH.appId && passed && passed !== u) {
      return tr('Дамжуулсан хэрэглэгч нэвтэрсэн хэрэглэгчтэй таарахгүй — шийдвэр бүртгэгдэхгүй.');
    }
    by = bypass && (!AUTH.appId || roleForUser(u) === 'super');
  }
  /* ⚠️ 2026-10-19 (ХЭРЭГЛЭГЧИЙН ШИЙДВЭР): `bypass` (хатуу super / нэвтрэлтгүй дев) нь БҮХ шалгуурыг — томилгоо · шат ·
     багцын хүрээ БА ӨӨРИЙГӨӨ БАТЛАХ дүрмийг (`selfApprovalDeny`) — ЧӨЛӨӨЛНӨ: «super admin гүйцэтгэлийн бүх хэсгийг
     турших боломжтой байх ёстой» (нэг данс компани болж илгээгээд зургаан шатыг дараалан турших). Энэ нь бусад урсгалаас
     (`decidePlan` · `decideObyem` · `decideAjil` · `chanarMs.review`) САНААТАЙ ялгаа. Энгийн хэрэглэгчид (`by` худал)
     `selfApprovalDeny` бүрэн хэвээр — тэр цэвэр функц өөрөө super-ийг ялгадаггүй (дуудагч алгасна). */
  if (by) return null;
  if (!u) return tr('Нэвтрээгүй байна — шийдвэр бүртгэгдэхгүй.');
  if (isViewOnly(u)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — шийдвэр гаргах боломжгүй.');
  if (stageOfUser(u) !== stage) {
    return tr('Та энэ шатны хянагчаар томилогдоогүй байна.');
  }
  const sc = bagtsFor(u, stage);
  if (sc !== null && !sc.includes(bagts)) {
    return tr('Энэ багц танд хуваарилагдаагүй байна.');
  }
  /* ⚠️ 2026-10-09 (аудит): өөрийн илгээсэн гүйцэтгэлийг өөрөө хянахгүй; 2026-10-19: аль ч шатанд, өөр шатанд
     зөвшөөрсөн бол ч (`selfApprovalDeny`) */
  return selfApprovalDeny(stage, u, hist, same, submitters);
}

const SAME_ROUND_MSG = (): string =>
  tr('Энэ илгээлтийг та өөр шатанд аль хэдийн зөвшөөрсөн — нэг илгээлтийг нэг хүн хоёр шатанд шийдвэрлэх боломжгүй.');
const PREV_STAGE_MSG = (): string =>
  tr('Өмнөх шатыг та өөрөө зөвшөөрсөн — дараалсан хоёр шатыг нэг хүн шийдвэрлэх боломжгүй.');

/**
 * ӨӨРИЙГӨӨ БАТЛАХ ДҮРЭМ — ЦЭВЭР (`hyanaltAuthz.check.mjs`). `authz`-ийн томилгоо/хүрээний ДАРАА (2026-10-19, аудит).
 * ⚠️ Хатуу super (`authz`-ийн `bypass`) ЧӨЛӨӨТЭЙ — `authz` энэ функцийг огт дууддаггүй (хэрэглэгчийн шийдвэр
 *    2026-10-19: бүх шатыг турших). Энэ функц өөрөө хэн болохыг ялгадаггүй — дуудвал super-т ч татгалзана.
 *   1. Илгээгч (`submitters`) аль ч шатанд батлахгүй (`submitterDeny`).
 *   2. `hist` өгвөл (зөвшөөрөх чиглэл): энэ тойргийн логт ӨӨР шатанд ЗӨВШӨӨРСӨН (`approve`/`recheck-ok`, `u`) бол
 *      татгалзана — урьд нь зөвхөн ӨМНӨХ шатыг шалгадаг тул шат шилжүүлсэн хүн (инженерээр баталсны дараа
 *      ерөнхий менежер болсон) нэг илгээлтийг хоёр удаа баталж чаддаг байв. Тойрог = хяналтын мөр (`ergelt` бүр
 *      тусдаа мөр, лог нь мөрийнх). Ижил шатыг ДАХИН (дээд шат буцаасны дараа) батлах нь хэвийн.
 *   3. Логт `u` алга (талбаргүй үйлчилгээ / хуучин лог — R5): ДООД шатуудын дэлгэцийн нэр (`SF[шат].who`) = энэ
 *      шийдвэрийн `who` бол татгалзана. Зөвхөн доод шатууд — мөр тэдгээрийг давсан тул тэнд ЗӨВШӨӨРСӨН нэр л байна.
 * ⚠️ `u` нь жижиг үсгээр (`meOf`). Буцаах чиглэлд дуудагч `hist`-ийг өгдөггүй (буцаалт ажлыг батлалтаас холдуулна).
 */
export function selfApprovalDeny(
  stage: ReviewStage,
  u: string,
  hist?: unknown,
  same?: { row: Row; who: string },
  submitters?: readonly string[],
): string | null {
  const sd = submitterDeny(stage, u, submitters);
  if (sd) return sd;
  if (hist === undefined) return null;
  const pv0 = prevReview(stage);
  const other = approvedStagesOf(hist, u).filter((st) => st !== stage);
  if (other.length) return pv0 && other.includes(pv0) ? PREV_STAGE_MSG() : SAME_ROUND_MSG();
  /* ⚠️ 2026-10-09 (R5): логт `u` алга — доод шатуудын дэлгэцийн нэрээр нөөц (тэр шатанд `u`-тай зөвшөөрөл байхгүй үед л) */
  if (same) {
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const me = norm(same.who);
    for (let pv = pv0; pv; pv = prevReview(pv)) {
      if (lastApprover(hist, pv)) continue;
      const pw = norm((same.row as Record<string, unknown>)[SF[pv].who]);
      if (me && pw && pw === me) return pv === pv0 ? PREV_STAGE_MSG() : SAME_ROUND_MSG();
    }
  }
  return null;
}

/** Энэ тойргийн логт `u` ЗӨВШӨӨРСӨН (`approve`/`recheck-ok`) шатууд — давхардалгүй (2026-10-19) */
export function approvedStagesOf(raw: unknown, u: string): ReviewStage[] {
  const me = u.trim().toLowerCase();
  if (!me) return [];
  const out = new Set<ReviewStage>();
  for (const e of rawHist(raw)) {
    if (e.act !== 'approve' && e.act !== 'recheck-ok') continue;
    if (typeof e.u !== 'string' || e.u.trim().toLowerCase() !== me) continue;
    if ((REVIEW_STAGES as readonly unknown[]).includes(e.stage)) out.add(e.stage as ReviewStage);
  }
  return [...out];
}

/**
 * ⚠️ 2026-10-09 (аудит №2): `authz`-ийн илгээгчийн дүрмийг ЦЭВЭР функц болгон гаргав (Node шалгуур —
 *    `hyanaltAuthz.check.mjs`). `submitters` `undefined`/хоосон (хуучин мөр, илгээлтгүй legacy зам) → шалгахгүй.
 *    `u` нь жижиг үсгээр (`meOf`).
 * ⚠️ 2026-10-19 (аудит): АЛЬ Ч ШАТАНД — урьд нь зөвхөн инженер шатанд шалгадаг тул компаниас дээд шат руу шилжсэн
 *    (эсвэл super-ээр компани болж илгээсэн) данс өөрийн илгээлтийг менежер/дарга шатанд баталж чаддаг байв.
 *    `stage` параметр гарын үсгийн нийцэлд хэвээр.
 */
export function submitterDeny(_stage: ReviewStage, u: string, submitters?: readonly string[]): string | null {
  if (submitters?.includes(u)) {
    return tr('Энэ гүйцэтгэлийг та өөрөө илгээсэн — өөрийн илгээлтийг хянах боломжгүй.');
  }
  return null;
}

/**
 * ⚠️ 2026-10-09 (аудит): инженер шатны ЗӨВШӨӨРЛИЙН өмнө илгээлтийн илгээгчдийг уншина (`authz.submitters`).
 *    Зөвхөн хөтөчид (Node-д `companyDeny`-тэй ижил — шалгахгүй) ба `bypass` үйлчлэхгүй үед (super/дев).
 *    Уншиж чадахгүй бол ТАТГАЛЗАНА (fail-closed, `subAt`-ийн уншилттай ижил); илгээлт алга (legacy) → шалгахгүй.
 */
async function submittersFor(
  _stage: ReviewStage, row: Row, me: string | undefined, _bypass: boolean,
): Promise<{ ok: true; list?: string[] } | { ok: false; error: string }> {
  /* ⚠️ 2026-10-19 (аудит): БҮХ шатанд уншина (`selfApprovalDeny`-ийн ⚠️) — урьд нь зөвхөн инженер шатанд. Хатуу super
     ЧӨЛӨӨТЭЙ (доорх ⚠️). Нэвтрэлт унтраалттай дев (`!AUTH.appId`) — хэн болох нь тодорхойгүй тул алгасна. */
  if (typeof window === 'undefined' || !AUTH.appId || !meOf(me)) return { ok: true };
  /* ⚠️ 2026-10-19 (хэрэглэгчийн шийдвэр): хатуу super турших эрхтэй (`authz`-ийн ⚠️) — илгээгчийг уншихгүй,
     уншилтын алдаа ч түүнийг зогсоохгүй */
  /* ⚠️ 2026-10-19 (аудит): чөлөөлөлт ЗӨВХӨН хатуу super-т (эсвэл нэвтрэлтгүй дев) — `_bypass` нь өөр замаар
     (номын сангийн туг, дев туршилт) үнэн болсон ЭНГИЙН хэрэглэгчийг өөрийн илгээлтийг батлахаас хамгаалалтгүй
     үлдээдэг байв. Super-ийн турших эрх (хэрэглэгчийн шийдвэр) хэвээр. */
  if (_bypass && (!AUTH.appId || roleForUser(meOf(me)) === 'super')) return { ok: true };
  const so = Number(row[F.sheetOid]);
  if (!Number.isInteger(so) || so <= 0) return { ok: true };
  return submittersOfRow(so, row[F.bagts]);
}

/**
 * ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): ХЯНАЛТЫН МӨРИЙН ИЛГЭЭГЧИД — `submittersFor` ба `countReviewPending` хоёрын НЭГ
 *    уншилт. `Эх_мөрийн_дугаар` нь ХОЁР үйлчилгээний OBJECTID-г нэг талбарт хадгалдаг (`archiveSubmission`-ий ⚠️):
 *    legacy мөрийн АРХИВЫН дугаар өөр багцын `sub|`/`done|` мөртэй давхцвал тэр багцын илгээгчид «та өөрөө илгээсэн»
 *    гэж худал татгалзал/тэмдэг өгдөг байв. Илгээлтийн багцыг (`PKGS[pkgKey].group`) хяналтын мөрийн багцтай
 *    `bagtsKey`-ээр тулгана (`archiveSubmission`-ий ижил шалгуур) — таарахгүй бол legacy гэж үзэж `list` өгөхгүй.
 *    Уншилт унавал `{ok:false}` — дуудагч бүр өөрийн дүрмээр (fail-closed / тоолсоор).
 */
async function submittersOfRow(so: number, bagts: unknown): Promise<{ ok: true; list?: string[] } | { ok: false; error: string }> {
  const { readSubmissionByOid, submittersOf } = await import('./submission');
  const sr = await readSubmissionByOid(so);
  if (!sr.ok) return { ok: false, error: sr.error };
  if (!sr.sub) return { ok: true };
  const { PKGS } = await import('@/modules/sheet/bagts.pkg');
  const grp = PKGS.find((p) => p.key === sr.sub?.payload.pkgKey)?.group;
  if (grp == null || bagtsKey(grp) !== bagtsKey(String(bagts ?? ''))) return { ok: true };
  return { ok: true, list: submittersOf(sr.sub.payload) };
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
    /* ⚠️ 2026-10-01: шийдвэрийн лог — талбаргүй үйлчилгээнд `''` (`hyanalt.F.history`) */
    [F.history]: str(a[F.history]),
    [F.status]: str(a[F.status]) as Status,
  };
}

/* ── Захиалагчид мэдэгдэх модулийн түвшний store ── */

let ROWS: Row[] = [];
let loaded = false;

/* ═══════════════ БАТЛАЛТ ХАРАГЧ (2026-10-13) ═══════════════
 *
 * ⚠️ ЯАГААД (хэрэглэгч: «гүйцэтгэл бөглөх батлагдсан тохиолдолд шууд багцын гүйцэтгэлийн зүүн панел
 *    өөрчлөгдөх ёстой, автомат болох ёстой»): ЭНЭ табд баталсан бол эцсийн гинж (`apply` → архив)
 *    `BAGTS_SHEET`-ийг шууд хүчингүй болгодог. Харин ӨӨР хэрэглэгч (газрын дарга өөр компьютерээс) эсвэл
 *    ӨӨР таб баталсныг энэ таб мэдэх зам БАЙГААГҮЙ — «Багцын гүйцэтгэл» · Ерөнхий дашбоард · «Багцын
 *    мэдээлэл» «Шинэчлэх» товч / табаа удаан нуугаад буцаах хүртэл хуучин тоогоо барьдаг байв.
 * ⚠️ ДҮРЭМ: «Шилжүүлсэн» (`STATUS.transferred` — зургаан шат бүгд өнгөрч архивт суусан) төлөвт ШИНЭЭР
 *    хүрсэн мөр илэрвэл гүйцэтгэлийн эх хүснэгтүүдийг хүчингүй болгоно → `useAsync`-ийн бүх дуудагч
 *    (12-ын зүүн самбар г.м.) өөрөө дахин татна. Эх: хямд `queryStatusSig` (oid:төлөв) — 60 с тутам,
 *    таб харагдаж байхад + таб/цонх идэвхжихэд (`startApprovalWatch`), мөн дарааллын `ROWS` уншилт бүр.
 * ⚠️ АНХНЫ уншилт = СУУРЬ (хүчингүй болголтгүй) — нээгдэх үед аль хэдийн батлагдсан мөр «шинэ» биш.
 * ⚠️ ЭНЭ табын батлалт (`apply` · нөхөлт) мөрөө `SEEN_DONE`-д ӨӨРӨӨ нэмнэ — гинж аль хэдийн хүчингүй
 *    болгосон тул харагч ДАВХАР дахин ачаалуулахгүй.
 */
const SEEN_DONE = new Set<number>();
let doneSeeded = false;
/** `[oid, төлөв]` — шинээр «Шилжүүлсэн» болсон мөр байвал гүйцэтгэлийн кэшийг хүчингүй болгоно */
function absorbDone(pairs: Iterable<readonly [number, string]>): void {
  let fresh = 0;
  for (const [oid, st] of pairs) {
    if (st !== STATUS.transferred || !Number.isFinite(oid) || SEEN_DONE.has(oid)) continue;
    SEEN_DONE.add(oid);
    fresh += 1;
  }
  if (!doneSeeded) { doneSeeded = true; return; }
  /* ⚠️ Эцсийн гинжийн бичдэг хүснэгтүүд (`apply`-ийн `batchInvalidate` бүлэгтэй ижил) */
  if (fresh > 0) invalidate('BAGTS_SHEET', 'BAGTS_NEGTGEL', 'HO_IPC', 'HYANALT');
}
const absorbRows = (rows: readonly Row[]): void =>
  absorbDone(rows.map((r) => [r.__oid, String(r[F.status] ?? '')] as const));
/** `queryStatusSig` («oid:төлөв,oid:төлөв») → хос */
const sigPairs = (sig: string): [number, string][] => (sig ? sig.split(',').map((p) => {
  const i = p.indexOf(':');
  return [Number(p.slice(0, i)), p.slice(i + 1)];
}) : []);
let watchUsers = 0;
let watchOff: (() => void) | null = null;
let watchBusy = false;
let watchWarned = false;
async function watchOnce(): Promise<void> {
  if (watchBusy || typeof document === 'undefined' || document.visibilityState === 'hidden') return;
  watchBusy = true;
  try {
    absorbDone(sigPairs(await queryStatusSig()));
  } catch (e) {
    /* ⚠️ Чимээгүй (нэг удаа анхааруулна) — туслах шинэчлэлт; хяналтын хүснэгт рүү эрхгүй хэрэглэгч ч бий */
    if (!watchWarned) { watchWarned = true; console.warn('[selbe] батлалт харагч: төлөв уншигдсангүй', e); }
  } finally { watchBusy = false; }
}
/**
 * Порталын хэмжээнд БАТЛАЛТ ХАРАГЧ эхлүүлнэ (`Portal`) — тайлах функц буцаана. Олон дуудагч нэг таймер
 * хуваалцана (ref-count). Дээрх ⚠️-ийг үз.
 */
export function startApprovalWatch(): () => void {
  if (typeof window === 'undefined') return () => {};
  watchUsers += 1;
  if (watchUsers === 1) {
    void watchOnce();
    const iv = setInterval(() => { void watchOnce(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void watchOnce(); };
    const onFocus = () => { void watchOnce(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    watchOff = () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    watchUsers -= 1;
    if (watchUsers === 0) { watchOff?.(); watchOff = null; }
  };
}
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function refresh(): Promise<void> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  /* ⚠️ 2026-10-13: батлалт харагч (дээрх ⚠️) — өөр хэрэглэгчийн эцсийн батлалт */
  absorbRows(ROWS);
  emit();
}

/**
 * БИЧИЛТИЙН ДАРААХ дахин ачаалалт — алдааг ШИДЭХГҮЙ (2026-09-30).
 * ⚠️ Шийдвэр ArcGIS-д аль хэдийн суусан бол уншилтын алдаа (429, сүлжээ) түүнийг
 *    «амжилтгүй» болгох ёсгүй — `apply`-ийн 2026-09-29-ний (аудит 10) дүрэм.
 */
async function refreshQuiet(): Promise<void> {
  try { await refresh(); } catch (e) { console.warn('[selbe] шийдвэрийн дараах дахин ачаалалт унав:', e); }
}

/**
 * ШИЙДВЭРИЙН АНХААРУУЛГА — илгээлтийн oid → шар мөр (2026-10-04).
 * ⚠️ `Item`-ийн локал state-д БИШ: батлалтын дараах `refresh` мөрийг «минийх»-ээс
 *    «бусад» руу зөөж бүрэлдэхүүнийг дахин mount хийдэг тул анхааруулга (алгассан
 *    нүд · «ДАХИН БАТЛАХГҮЙ» · нэгтгэл/IPC · үлдэгдлийн тойрог · `okWarn`) нэг ч
 *    удаа харагддаггүй байв. Модулийн түвшинд — хэрэглэгч өөрөө хаах хүртэл үлдэнэ.
 */
export type ApplyWarn = { text: string; ajil: string; bagts: string; at: number };
const WARNS = new Map<number, ApplyWarn>();
let warnSnap: [number, ApplyWarn][] = [];
const warnSubs = new Set<() => void>();
function putWarn(key: number, w: ApplyWarn): void {
  WARNS.set(key, w);
  warnSnap = [...WARNS.entries()].sort((x, y) => y[1].at - x[1].at);
  warnSubs.forEach((f) => f());
}
export function dismissApplyWarn(key: number): void {
  if (!WARNS.delete(key)) return;
  warnSnap = [...WARNS.entries()].sort((x, y) => y[1].at - x[1].at);
  warnSubs.forEach((f) => f());
}
/** Шинэ нь эхэндээ — `[илгээлтийн oid, анхааруулга]` */
export function useApplyWarns(): [number, ApplyWarn][] {
  return useSyncExternalStore(
    (f) => { warnSubs.add(f); return () => { warnSubs.delete(f); }; },
    () => warnSnap,
    () => warnSnap,
  );
}

/**
 * ШИЙДВЭРИЙН АЛДАА — ажлын түлхүүр (`Work.key`) → мессеж (2026-10-12, R2).
 * ⚠️ `ApplyWarn`-ийн ижил шалтгаан: STALE · `movedSince` үед `apply`/`recheck` `emit()` дуудаж жагсаалтыг
 *    шинэчилдэг тул ажил «минийх»-ээс «бусад» руу шилжиж `Item` дахин mount болдог — түүний локал `err`
 *    алга болж, хэрэглэгч «юу ч болсонгүй» гэж хардаг байв. Түлхүүр нь ажлынх (OID биш): дахин шалгалтын
 *    «ok» шинэ мөр (шинэ OID) үүсгэсэн ч ижил ажилд харагдана. Дараагийн шийдвэр эсвэл «Хаах» арилгана.
 */
const DECISION_ERRS = new Map<string, string>();
const errSubs = new Set<() => void>();
export function setDecisionErr(key: string, text: string): void {
  if (text) DECISION_ERRS.set(key, text);
  else if (!DECISION_ERRS.delete(key)) return;
  errSubs.forEach((f) => f());
}
/** Тухайн ажлын шийдвэрийн алдаа (`''` = алга) — жагсаалт хооронд шилжсэн ч хадгалагдана */
export function useDecisionErr(key: string): string {
  return useSyncExternalStore(
    (f) => { errSubs.add(f); return () => { errSubs.delete(f); }; },
    () => DECISION_ERRS.get(key) ?? '',
    () => DECISION_ERRS.get(key) ?? '',
  );
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
  /* ⚠️ 2026-10-13: батлалт харагч — `refresh`-тэй ижил */
  absorbRows(ROWS);
  return ROWS.find((r) => r.__oid === oid);
}

/**
 * Шат бүрд хүлээгдэх ЯГ тэр төлөв — өөр төлөвтэй мөрд шийдвэр бичихгүй.
 * ⚠️ `OWNER`-оор шалгавал «Менежер буцаасан» мөрд инженерийн зөвшөөрөл,
 *    «Шилжүүлсэн» мөрд ерөнхий менежерийн давхар баталгаа (нэгтгэлд давхар
 *    бүртгэл) нэвтэрнэ. Дахин шалгалт `recheck`-ээр ШИНЭ мөр үүсгэнэ.
 */
/* ⚠️ `REVIEW_STATUS` нь `hyanalt.ts`-д (2026-09-23) — 6 шатны нэг эх сурвалж. */

const STALE = () => tr('Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу');

/**
 * Бичихийн өмнөх мэдээллийн шалгалт; атом нөхцөлийг `updateDecision` сервер дээр шалгана.
 *
 * `apply`/`recheck` мөрийг эхэнд нэг удаа
 *    уншдаг ч түүнээс хойш эрх, илгээлтийн агуулга (`subAt`), `okCellsPatch`
 *    гэх мэт сүлжээний алхмууд явдаг тул нэг шатанд ХОЁР данс томилогдсон үед
 *    хоёулаа эхний шалгуурыг давж, сүүлд бичсэн нь өмнөхийн шийдвэрийг
 *    (шалтгаан, огноо, нэр) ЧИМЭЭГҮЙ дардаг байв. Эцсийн шатны
 *    `archiveSubmission`-ийн «бичихийн өмнө дахин шалгах»-тай ижил санаа:
 *    цонх атом биш ч секундээс мс болж нарийсна.
 * ⚠️ Төлөв + ТЭР ШАТНЫ өөрийн талбарууд + `Zovshoorson_nud` өөрчлөгдсөн эсэхийг
 *    харьцуулна; `twin` бол дахин шалгалтын «ok» ижил илгээлтэд шинэ тойрог
 *    (`Хэддэх_удаа` + 1) аль хэдийн үүсгэсэн эсэх (хуучин мөр хөндөгддөггүй).
 * ⚠️ Уншиж чадаагүй бол БИЧИХГҮЙ (fail-closed).
 * @returns `null` = өөрчлөгдөөгүй, эс бөгөөс хэрэглэгчид харуулах мессеж
 */
async function movedSince(oid: number, prev: Row, stage: ReviewStage): Promise<string | null> {
  let now: Row | undefined;
  try { now = await liveRow(oid); } catch (e) {
    return tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e));
  }
  const f = SF[stage];
  const actor = (r: Row | undefined) => String((r as Record<string, unknown> | undefined)?.[f.who] ?? '').trim();
  const busy = (name: string) => (name
    ? tr('Энэ ажлыг {0} таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.', name)
    : tr('Энэ ажлыг өөр хэрэглэгч таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.'));
  if (!now) return tr('Бүртгэл олдсонгүй');
  /* ⚠️ 2026-10-01: `F.history` ч — лог нь `prev`-ээс бодогдож нэмэгддэг тул завсарт
     өөр хүн нэмсэн бол дарж бичихгүй (талбаргүй үед хоёр тал `''` — нөлөөгүй). */
  const keys = [F.status, F.okCells, F.history, f.who, f.decision, f.reason, f.returned, f.sent];
  const val = (r: Row, k: string) => String((r as Record<string, unknown>)[k] ?? '');
  if (keys.some((k) => val(now as Row, k) !== val(prev, k))) return busy(actor(now));
  const so = Number(prev[F.sheetOid]);
  const twin = Number.isInteger(so) && so > 0 && ROWS.find((r) => r.__oid !== oid && Number(r[F.sheetOid]) === so
    && r[F.bagts] === prev[F.bagts] && Number(r[F.ergelt]) > Number(prev[F.ergelt]));
  if (twin) return busy(actor(twin));
  return null;
}

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
    /* ⚠️ 2026-09-30 (eslint `set-state-in-effect`): анхны ачаалалтад `load()` БИШ —
       тэр `setError('')`-ийг эффект дотор синхроноор дууддаг байв. `error` анхнаасаа
       хоосон тул утга ижил; алдаа нь урьдын адил async `catch`-д. */
    if (!loaded) refresh().catch((e) => setError(String((e as Error)?.message ?? e)));
    const offPoll = startPoll();
    return () => { subs.delete(f); offPoll(); };
  }, []);

  return { rows: ROWS, loading: !loaded && !error, error, reload: load };
}

/**
 * ДАРААЛЛЫН АВТОМАТ ШИНЭЧЛЭЛТ (2026-10-04).
 * ⚠️ Урьд нь `ROWS` хуудас нээгдэхэд НЭГ л удаа ачаалагддаг тул өөр хянагчийн
 *    шийдвэр, шинэ илгээлт гараар «Дахин оролдох» дарах хүртэл харагддаггүй байв.
 *    Одоо: харагдаж байх үед 60 с тутам · таб/цонх идэвхжихэд. Эхлээд хямд
 *    `queryStatusSig` (oid:төлөв) — зөрвөл л бүтэн `refresh`.
 * ⚠️ Олон захиалагч (Guitsetgel + useFlow) нэг л таймер хуваалцана (ref-count).
 * ⚠️ Алдаа ЧИМЭЭГҮЙ — энэ бол туслах шинэчлэлт; ачаалалтын алдааг `load` хэлнэ.
 */
const POLL_MS = 60_000;
let pollUsers = 0;
let pollOff: (() => void) | null = null;
let polling = false;
const rowsSig = () => ROWS.slice().sort((x, y) => x.__oid - y.__oid)
  .map((r) => `${r.__oid}:${String(r[F.status] ?? '')}`).join(',');
async function pollOnce(): Promise<void> {
  if (polling || !loaded || typeof document === 'undefined' || document.visibilityState === 'hidden') return;
  polling = true;
  try {
    const sig = await queryStatusSig();
    /* ⚠️ 2026-10-13: батлалт харагч — гарын үсгийг шууд шингээнэ (`refresh` дахин шингээхэд давхардахгүй) */
    absorbDone(sigPairs(sig));
    if (sig !== rowsSig()) await refresh();
  } catch (e) {
    console.warn('[selbe] хяналтын дарааллын шинэчлэлт унав:', e);
  } finally { polling = false; }
}
function startPoll(): () => void {
  pollUsers += 1;
  if (pollUsers === 1 && typeof window !== 'undefined') {
    const iv = setInterval(() => { void pollOnce(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void pollOnce(); };
    const onFocus = () => { void pollOnce(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    pollOff = () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pollUsers -= 1;
    if (pollUsers === 0) { pollOff?.(); pollOff = null; }
  };
}

/**
 * ТАНЫ ШАТАНД ХҮЛЭЭГДЭЖ БУЙ ХЯНАЛТЫН ТОО — цэсний тэмдэг (`navBadges`, 2026-10-04).
 * ⚠️ `Guitsetgel`-ийн «минийх»-тэй ижил дүрэм: ажлын СҮҮЛИЙН тойрог (`groupWorks`)
 *    энэ шатны эзэмшилд (`OWNER`) · «Шилжүүлсэн» биш · хэрэглэгчийн багцын хүрээнд.
 * ⚠️ `null` ≠ 0: нэвтрээгүй · урсгалын ACL уншигдаагүй · томилгоогүй (админ гэх мэт) ·
 *    сүлжээ унасан → `null` (тэмдэг гарахгүй). Зөвхөн харах томилгоо → 0.
 * ⚠️ `ROWS` ачаалагдсан бол түүнийг (60 с-ийн шинэчлэлттэй), эс бөгөөс нэг `queryAll`
 *    (22 орчим мөр, 60 с кэш).
 */
let badgeRows: { at: number; rows: Row[] } | null = null;
export async function countReviewPending(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (!me || !flowAclReady()) return null;
    const stage = stageOfUser(me);
    if (!stage) return null;
    if (isViewOnly(me)) return 0;
    const sc = bagtsFor(me, stage);
    if (Array.isArray(sc) && sc.length === 0) return 0;
    let rows: Row[];
    if (loaded) rows = ROWS;
    else if (badgeRows && Date.now() - badgeRows.at < POLL_MS) rows = badgeRows.rows;
    else { rows = (await queryAll()).map(toRow); badgeRows = { at: Date.now(), rows }; }
    const { groupWorks } = await import('./hyanaltGroup');
    let ws = groupWorks(rows).filter((w) => w.owner === stage && w.status !== STATUS.transferred
      && (sc == null || sc.includes(w.bagts)));
    /*
     * ⚠️ 2026-10-12 (R9): ЭНЭ ХЭРЭГЛЭГЧ ЗӨВШӨӨРЧ ЧАДАХГҮЙ ажлыг тоолохгүй — `authz`-ийн ЯГ тэр хоёр дүрэм:
     *    (1) өмнөх шатыг өөрөө хамгийн сүүлд зөвшөөрсөн (логийн `u` — `lastApprover`);
     *    (2) инженер шатанд өөрийн илгээлт (`submitterDeny` · `submission.submittersOf`).
     *    Урьд нь тэмдэг ийм ажлыг «хүлээгдэж буй» гэж тоолдог тул хэрэглэгч орж ирээд «Батлах» дарахад
     *    татгалзал авдаг байв (тэдгээр нь шатны ӨӨР хянагчийнх). Илгээлт уншигдахгүй бол тоолсоор
     *    (тэмдэг нь зөвлөмж; шийдвэрийн хамгаалалт `authz`-д хэвээр). Илгээгчдийн уншилт 60 с кэштэй.
     */
    /* ⚠️ `company` нь хяналтын шат биш — өмнөх хянагч байхгүй */
    /* ⚠️ 2026-10-19 (аудит): `authz`-ийн шинэ дүрэм (`selfApprovalDeny`) — ӨӨР АЛЬ Ч шатанд зөвшөөрсөн, аль ч шатанд
       өөрийн илгээлт. Урьд нь өмнөх шат ба инженер шатны илгээгч л. */
    /* ⚠️ 2026-10-19 (хэрэглэгчийн шийдвэр): хатуу super турших эрхтэй (`authz`-ийн ⚠️) — тэмдэг ч шүүхгүй */
    const tester = roleForUser(me) === 'super';
    if (stage !== 'company' && !tester) {
      ws = ws.filter((w) => !approvedStagesOf(w.current[F.history], me).some((st) => st !== stage));
    }
    if (stage !== 'company' && !tester && ws.length) {
      const lists = await Promise.all(ws.map(async (w): Promise<string[] | undefined> => {
        const so = Number(w.current[F.sheetOid]);
        if (!Number.isInteger(so) || so <= 0) return undefined;
        const hit = badgeSubs.get(so);
        if (hit && Date.now() - hit.at < POLL_MS) return hit.list;
        try {
          /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `submittersOfRow` — илгээлтийн багцыг мөрийн багцтай тулгана (legacy OID давхцал) */
          const sr = await submittersOfRow(so, w.current[F.bagts]);
          if (!sr.ok) return undefined;
          const list = sr.list ?? [];
          badgeSubs.set(so, { at: Date.now(), list });
          return list;
        } catch { return undefined; }
      }));
      ws = ws.filter((_, i) => !submitterDeny(stage, me, lists[i]));
    }
    return ws.length;
  } catch {
    return null;
  }
}
/** ⚠️ 2026-10-12 (R9): тэмдгийн илгээгчдийн кэш — `илгээлтийн oid → { at, данснууд }` */
const badgeSubs = new Map<number, { at: number; list: string[] }>();

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

/** ⚠️ 2026-10-06 (аудит #1): эцсийн шатанд архив бичигдсэний дараах мессеж — буцаалтыг хориглоно */
const ARCHIVED_NO_RETURN = () => tr('Архивт аль хэдийн бичигдсэн — дахин Батлах дарна уу, буцааж болохгүй');

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
  /* ⚠️ `warn` (2026-09-25) — архивлалт бүтсэн ч хэрэглэгчид ИЛ хэлэх зүйл
     (алгассан нүд · хаалтын үеийн дахин илгээлт); `apply` шар мөр болгоно. */
  /* ⚠️ `reopen` (2026-09-25 аудит) — нэмэлтийн горимд батлах явцад дахин илгээсний
     ҮЛДЭГДЭЛ (`residual`) `sub|` мөрөнд үлдсэн: `apply` хяналтын мөрийг «Шилжүүлсэн»
     болгосны ДАРАА `submitForReview`-ээр шинэ тойрог нээж, тэр +N хянагдана. */
  /* ⚠️ 2026-10-12 (A5): `empty` — архивт юу ч бичигдээгүй (агуулгагүй үлдэгдэл, `archiveOid` 0): `apply` нэгтгэл ·
     IPC-д бүртгэхгүй. Урьд нь `registerApproved(багц, 0)` 3 удаа унаж худал анхааруулга, `regPending` тэмдэг
     үлдэж `retryPendingRegistrations` мөнхөд «нөхөж чадсангүй» шар мөр гаргадаг байв. */
  | { ok: true; archiveOid: number; day?: string; pkgKey?: string; warn?: string; reopen?: { fillMs: number; sheetOid: number; sheet: string }; empty?: true }
  /* ⚠️ 2026-10-09 (R3): `contentChanged` — хянагчийн харсан `subAt`-аас агуулга өөрчлөгдсөн */
  | { ok: false; error: string; contentChanged?: true };

/**
 * ХААГДААГҮЙ НЭМЭЛТИЙН ТЭМДЭГ (2026-10-09, R1) — `илгээлтийн oid → { at }` (localStorage).
 * ⚠️ Нэмэлтийн горимд архив бичигдээд хаалт ХОЁР удаа, үлдэгдлийн (тэглэх) бичилт ч унавал
 *    `sub|` мөр архивласан нэмэлтээ агуулсаар нээлттэй үлдэнэ. Гүйцэтгэгч дахин илгээхэд `at`
 *    солигдож `seenKey` таарахгүй тул дараагийн батлалт +N-ийг ДАХИН нэмдэг байв. Тэмдэг байхад
 *    `at >= тэмдэг.at` бөгөөд `residual` биш мөрийг архивлахгүй — хаагдах (`done|`) эсвэл
 *    үлдэгдэл бичигдэх хүртэл. Хөтөч тутмын хамгаалалт (`ARCHIVED_LS`-тэй ижил хязгаар).
 */
const UNCLOSED_LS = 'selbe-unclosed-inc';
function unclosedGet(subOid: number): { at: number } | undefined {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UNCLOSED_LS) : null;
    const o = raw ? (JSON.parse(raw) as Record<string, { at?: unknown }>) : null;
    const v = o && typeof o === 'object' ? o[String(subOid)] : undefined;
    return v && typeof v.at === 'number' && Number.isFinite(v.at) ? { at: v.at } : undefined;
  } catch { return undefined; }
}
function unclosedSet(subOid: number, v: { at: number } | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(UNCLOSED_LS);
    const o = (raw ? JSON.parse(raw) : {}) as Record<string, { at: number }>;
    const next = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    if (v) next[String(subOid)] = v; else delete next[String(subOid)];
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete next[k];
    localStorage.setItem(UNCLOSED_LS, JSON.stringify(next));
  } catch { /* хаалттай орчин */ }
}

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
/*
 * ⚠️ 2026-09-25 аудит: СЕШН ХООРОНД Ч ХАДГАЛНА (localStorage). `closeSubmission`
 *    хоёр удаа унасан (сүлжээ) илгээлтийг менежер таб/хөтчөө дахин нээгээд
 *    батлавал санах ойн Map хоосон тул ижил `staged.at`-тай агуулга ХОЁР ДАХЬ
 *    жааз болж бичигддэг байв. Түлхүүр = `${subOid}:${at}` — агуулга солигдвол
 *    хамгаалалт зориудаар тайлагдана. Сүүлийн 300 бичлэг; хаалттай орчинд чимээгүй.
 */
const ARCHIVED_LS = 'selbe-archived-subs';
function archivedGet(key: string): { oid: number; day: string } | undefined {
  const m = ARCHIVED.get(key);
  if (m) return m;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ARCHIVED_LS) : null;
    if (!raw) return undefined;
    const o = JSON.parse(raw) as Record<string, { oid?: unknown; day?: unknown }>;
    const v = o && typeof o === 'object' ? o[key] : undefined;
    if (v && Number.isInteger(v.oid) && typeof v.day === 'string') {
      const hit = { oid: v.oid as number, day: v.day };
      ARCHIVED.set(key, hit);
      return hit;
    }
  } catch { /* хаалттай орчин / эвдэрсэн JSON */ }
  return undefined;
}
function archivedSet(key: string, v: { oid: number; day: string }): void {
  ARCHIVED.set(key, v);
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(ARCHIVED_LS);
    const o = (raw ? JSON.parse(raw) : {}) as Record<string, { oid: number; day: string }>;
    const next = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    next[key] = v;
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete next[k];
    localStorage.setItem(ARCHIVED_LS, JSON.stringify(next));
  } catch { /* хаалттай орчин */ }
}

/**
 * IPC-ийн `skip` үр дүн АМЖИЛТ БИШ эсэх.
 * ⚠️ 2026-09-25: `syncIpcFromFill` нь алгасалтыг `{ok:true, op:'skip', why}`-аар
 *    буцаадаг. Зөвхөн `no-data` (тухайн өдөр обьём/үнэ огт байхгүй) нь хүлээн
 *    зөвшөөрөгдөх алгасалт; `no-pkg` · `no-code` · `bad-day` нь тохиргооны
 *    алдаа тул «бүртгэл хүлээгдэж буй» тэмдгийг үлдээж дахин оролдуулна.
 */
function ipcSkipIsFailure(r: { ok: true; op: string; why?: string }): boolean {
  return r.op === 'skip' && r.why !== 'no-data';
}

/**
 * «АРХИВЛАЖ БАЙНА» ТЭМДГИЙН ЖААЗ АРХИВТ БУУСАН УУ (2026-10-09; урьд нь `archiveSubmission` дотор шууд байсныг
 * `FillNew.publish` ба эцсийн шатны буцаалт ч хэрэглэхээр гаргав — нэг дүрэм).
 *   · буусан жаазын эхний OID · `null` (буугаагүй) · `'ambiguous'` (`matchArchivedFrame`-ийн ⚠️ — ТАТГАЛЗ);
 *   · уншилт унавал / огнооны талбаргүй багц → THROW (шийдэх боломжгүй — дуудагч fail-closed).
 * ⚠️ `OID > maxOid0 AND өдөр = тэмдгийн fillMs`, OID-оор эрэмбэлж 2000-аар хуудаслана (`orderByFields` заавал).
 */
export async function probeArchivedFrame(pkgKey: string, mark: ArchivingMark): Promise<number | null | 'ambiguous'> {
  const [{ PKGS, fillSchema }, { agsFetch }, { msToDay, dayFilter }, { matchArchivedFrame }] = await Promise.all([
    import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags'), import('@/modules/sheet/bagtsSheet'), import('./submission'),
  ]);
  const pkg = PKGS.find((p) => p.key === pkgKey);
  if (!pkg) throw new Error(tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey));
  const sc = await fillSchema(pkg);
  if (!sc.f.fillDate) throw new Error(tr('Багцын хуудсанд бөглөсөн огнооны талбар алга — өмнөх архивлалтыг шалгах боломжгүй'));
  const outFields = [...new Set([sc.f.oid, sc.f.no, ...(mark.probe ?? []).map((p) => p[1])])].join(',');
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: `${sc.f.oid} > ${mark.maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(mark.fillMs))}`,
      outFields,
      orderByFields: `${sc.f.oid} ASC`,
      resultRecordCount: '2000',
      resultOffset: String(offset),
      returnGeometry: 'false',
    });
    const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
    rows.push(...fs.map((f) => f.attributes));
    if (!j?.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }
  const dateFields = [...sc.start, ...sc.end].filter((f): f is string => !!f);
  return matchArchivedFrame(rows, mark, sc.f.oid, sc.f.no, dateFields);
}

/**
 * ХУУЧИРСАН ТЭМДГИЙН ТАСАРСАН ЖААЗЫГ ЦЭВЭРЛЭНЭ (2026-10-11, аудит №7 — амьд: `Bagts_3_2_9f`, 2026-10-11:
 * газрын даргын батлалт 1-р багц (500 мөр) бичээд унасан, буцаалт ажилсангүй; `sub|` мөрөнд тэмдэг үлдсэн).
 *
 * ⚠️ Урьд нь ийм жааз `loadRows`-ийн F1 шалгуурыг («500 мөр ирлээ, 1470 байх ёстой») унагааж, хянагчийн
 *    харагдац ачаалагдахгүй → «Батлах» идэвхгүй → `archiveSubmission`-ийн `probeArchivedFrame` хүртэл ХЭЗЭЭ Ч
 *    хүрдэггүй байв (гүйцэтгэгчийн бөглөх хуудас ч хаагддаг). Одоо `archiveSubmission` тэмдэг ХУУЧИРСАН
 *    (`!markFresh`) бөгөөд жааз БУУГААГҮЙ (`probeArchivedFrame === null`) үед энэ функцээр тэмдгийн өдрийн,
 *    `maxOid0`-ээс хойших мөрүүдийг татаж `submission.truncatedFrameIds`-ээр таньж устгана.
 *   · `{ deleted: 0 }` — тасарсан мөр алга (юу ч хөндөөгүй);
 *   · `{ error }` — танигдсангүй / устгал дутуу (fail-closed — дуудагч бичихгүй, админ шалгана).
 */
export async function cleanupTruncatedFrame(pkgKey: string, mark: ArchivingMark): Promise<{ deleted: number } | { error: string }> {
  const [{ PKGS, fillSchema }, { agsFetch }, { msToDay, dayFilter, applyDeletes }, { truncatedFrameIds }] = await Promise.all([
    import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags'), import('@/modules/sheet/bagtsSheet'), import('./submission'),
  ]);
  const pkg = PKGS.find((p) => p.key === pkgKey);
  if (!pkg) return { error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey) };
  const sc = await fillSchema(pkg);
  if (!sc.f.fillDate) return { error: tr('Багцын хуудсанд бөглөсөн огнооны талбар алга — өмнөх архивлалтыг шалгах боломжгүй') };
  const outFields = [...new Set([sc.f.oid, sc.f.no, ...(mark.probe ?? []).map((p) => p[1])])].join(',');
  const rows: Record<string, unknown>[] = [];
  try {
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${pkg.url}/query`, {
        where: `${sc.f.oid} > ${mark.maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(mark.fillMs))}`,
        outFields,
        orderByFields: `${sc.f.oid} ASC`,
        resultRecordCount: '2000',
        resultOffset: String(offset),
        returnGeometry: 'false',
      });
      const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
      rows.push(...fs.map((f) => f.attributes));
      if (!j?.exceededTransferLimit || fs.length === 0) break;
      offset += fs.length;
    }
  } catch (e) {
    return { error: tr('тасарсан жаазыг шалгах уншилт унав ({0})', String((e as Error)?.message ?? e)) };
  }
  if (!rows.length) return { deleted: 0 };
  const dateFields = [...sc.start, ...sc.end].filter((f): f is string => !!f);
  const ids = truncatedFrameIds(rows, mark, sc.f.oid, sc.f.no, dateFields);
  if (!ids) return { error: tr('тэмдгийн өдөрт {0} мөр байна — тасарсан жааз гэж танигдсангүй, AGOL дээр админ шалгана уу', String(rows.length)) };
  /* ⚠️ 2026-10-12 (A2): тэргүүн хэсэг бүтэн жааз — тасарсан мөр алга (`truncatedFrameIds`-ийн `[]`) */
  if (!ids.length) return { deleted: 0 };
  let gone = 0;
  try { gone = await applyDeletes(pkg, ids); } catch (e) {
    return { error: tr('тасарсан жаазыг устгаж чадсангүй ({0})', String((e as Error)?.message ?? e)) };
  }
  if (gone !== ids.length) return { error: tr('тасарсан {0} мөрийн {1}-ийг устгаж чадсангүй — AGOL дээр гараар цэвэрлэнэ үү', String(ids.length), String(ids.length - gone)) };
  console.warn(`[selbe] ${pkg.key}: хуучирсан тэмдгийн тасарсан ${gone} мөрийг архиваас цэвэрлэв (OID > ${mark.maxOid0}, ${msToDay(mark.fillMs)})`);
  return { deleted: gone };
}

/** ⚠️ 2026-10-09: өмнөх архивлалт шийдэгдээгүй — бичихгүй/буцаахгүй үеийн НЭГ мессеж */
const MARK_UNRESOLVED = (why: string) =>
  tr('Өмнөх архивлалт шалгагдаагүй — давхар тоолохоос сэргийлж юу ч бичсэнгүй. Хэдэн минутын дараа дахин оролдоно уу ({0}).', why);

/**
 * АРХИВЫН ЖААЗНЫ БОДИТ ӨДӨР — `archiveOid` мөрийн `fillDate`-ээс, уншиж чадахгүй бол илгээлтийн `fillMs`-ээр.
 * ⚠️ 2026-10-12 (A7): урьд нь `done|` замд л байв; уралдааны зам (`again.sub.done` — өөр таб энэ хооронд
 *    архивлаж хаасан) ЭНЭ сешний залруулсан `fillMs`-ийг буцаадаг тул тэр таб өөр өдрөөр (өнөөдөр рүү)
 *    бичсэн бол IPC өөр өдөр/сард бичигдэх байв. Одоо хоёр зам НЭГ дүрэм.
 * ⚠️ `dayKey` (ЛОКАЛ өдөр) — `toISOString` нь UTC тул +08-д 00:00–07:59-ийн
 *    илгээлт ӨМНӨХ өдөрт (сарын хил давбал өмнөх сард) архивлагдаж байв (2026-09-23 аудит).
 * ⚠️ 2026-10-09 (R7): үндсэн замтай (`msToDay`, UTC) НЭГ дүрэм — хамгийн ойрын UTC шөнө
 *    дунд руу тэгшитгээд (`bagtsSheet.normDayMs`-ийн дүрэм) UTC өдөр. `Date.UTC(y,m,d)` →
 *    тэр өдөр (`msToDay`-тэй ижил); ЛОКАЛ шөнө дундаар хадгалагдсан хуучин утга (+08: өмнөх
 *    өдрийн 16:00Z) ч өмнөх өдөрт гулсахгүй — дээрх ⚠️-ийн зорилго хадгалагдана.
 */
async function archivedDayOf(pkgKey: string, aOid: number, fm: number | null | undefined): Promise<string | undefined> {
  let day: string | undefined = fm != null && Number.isFinite(fm)
    ? new Date(Math.round(fm / 86_400_000) * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  if (aOid > 0) {
    try {
      const [{ PKGS, fillSchema }, { agsFetch }, { msToDay: m2d, normDayMs: ndm }] = await Promise.all([import('@/modules/sheet/bagts.pkg'), import('@/modules/sheet/ags'), import('@/modules/sheet/bagtsSheet')]);
      const pkg = PKGS.find((p) => p.key === pkgKey);
      if (pkg) {
        /* ⚠️ 2026-10-09: бөглөх урсгалын бүдүүвч (`fillSchema`) — архивлалттай нэг */
        const sc = await fillSchema(pkg);
        if (sc.f.fillDate) {
          const j = await agsFetch(`${pkg.url}/query`, { where: `${sc.f.oid} = ${aOid}`, outFields: sc.f.fillDate, returnGeometry: 'false' });
          const v = j.features?.[0]?.attributes?.[sc.f.fillDate];
          /* ⚠️ 2026-10-09: `normDayMs` — ЛОКАЛ шөнө дундаар (16:00Z) тамгалсан хуучин жааз өмнөх өдөрт
             гулсахгүй (нөөц `fillMs`-ийн дээрх R7 дүрэмтэй НЭГ) */
          if (typeof v === 'number') day = m2d(ndm(v)) || day;
        }
      }
    } catch { /* нөөц `fillMs` хэвээр */ }
  }
  return day;
}

/**
 * СУУРЬ ЖААЗ (`rows` — ачаалсан, `sameFrame`-ээр батлагдсан) АЧААЛСНААС ХОЙШ ЗАСАГДСАН УУ (2026-10-12, A4).
 *   · `EditDate` (`edited`) байвал: жаазын OID-ийн мужийн `max(EditDate)` > бичихийн ӨМНӨ ижил хүсэлтээр авсан `mx0`
 *     (2026-10-12 гүйцэтгэлийн аудит — `frameEditMax`-ийн ⚠️);
 *   · эс бөгөөс: мужийн мөрүүдийг дахин татаж ачаалсан талбар бүрийг (`raw`) тулгана.
 * ⚠️ Мужид өөр жаазын мөр орсон бол илүү болгоомжтой (худал «засагдсан» → буцааж дахин оролдуулна) — аюулгүй тал.
 * ⚠️ Уншилт унавал THROW — дуудагч устгахгүй, анхааруулна.
 */
/** Суурь жаазын OID-ийн муж (`where`) — мөргүй бол `null` */
function frameOidWhere(oidF: string, rows: readonly { oid: number }[]): string | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) if (Number.isInteger(r.oid) && r.oid > 0) { lo = Math.min(lo, r.oid); hi = Math.max(hi, r.oid); }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return `${oidF} >= ${lo} AND ${oidF} <= ${hi}`;
}

/**
 * ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): СУУРЬ ЖААЗЫН МУЖИЙН `max(EditDate)` — серверээс, НЭГ хүсэлтээр. Бичихийн ӨМНӨ
 *    (A.8 блок, `sameFrame`-ийн дараа) ба бичсэний ДАРАА (`baseFrameEdited`) ЯГ ИЖИЛ хүсэлтээр авч жишнэ.
 *    Урьд нь суурь утга (`mx0`) ачаалсан мөрүүдийн `raw`-аас бодогддог байсан атал `loadRows` ХООСОН мөрийг хаядаг,
 *    сервер нь мужийн БҮХ мөрийг тоолдог: хоосон мөрийн EditDate хожуу бол `mx > mx0` ҮРГЭЛЖ үнэн → жааз бичигдэх
 *    бүрт буцааж устгагдаж, эцсийн батлалт мөнхөд унадаг байв. Мөргүй муж → `null`. Уншигдахгүй бол THROW.
 */
async function frameEditMax(
  url: string,
  edited: string,
  where: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetcher: (url: string, params: Record<string, string>) => Promise<any>,
): Promise<number> {
  const j = await fetcher(`${url}/query`, {
    where,
    outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: edited, outStatisticFieldName: 'mx' }]),
    returnGeometry: 'false',
  });
  const mx = Number(j?.features?.[0]?.attributes?.mx);
  if (!Number.isFinite(mx)) throw new Error(tr('EditDate-ийн дээд утга уншигдсангүй'));
  return mx;
}

/* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `mx0` — бичихийн ӨМНӨ `frameEditMax`-аар авсан суурь (`raw`-аас БИШ, дээрх ⚠️);
   `edited` байхад `mx0` өгөөгүй бол талбар бүрийн тулгалт руу унана. */
async function baseFrameEdited(
  url: string,
  oidF: string,
  edited: string | null | undefined,
  rows: readonly { oid: number; raw: Record<string, unknown> }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetcher: (url: string, params: Record<string, string>) => Promise<any>,
  mx0: number | null = null,
): Promise<boolean> {
  const where = frameOidWhere(oidF, rows);
  if (!where) return false;
  if (edited && mx0 != null) {
    const mx = await frameEditMax(url, edited, where, fetcher);
    return mx > mx0;
  }
  const want = new Map(rows.map((r) => [r.oid, r.raw] as const));
  const keys = Object.keys(rows[0]?.raw ?? {});
  if (!keys.length) return false;
  for (let off = 0; ; ) {
    const j = await fetcher(`${url}/query`, {
      where,
      outFields: [...new Set([oidF, ...keys])].join(','),
      orderByFields: `${oidF} ASC`,
      resultRecordCount: '2000',
      resultOffset: String(off),
      returnGeometry: 'false',
    });
    const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
    for (const f of fs) {
      const prev = want.get(Number(f.attributes[oidF]));
      if (!prev) continue;
      for (const k of keys) if (JSON.stringify(f.attributes[k] ?? null) !== JSON.stringify(prev[k] ?? null)) return true;
    }
    if (!j?.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return false;
}

/**
 * ⚠️ 2026-10-12 (A3): БАГЦЫН БУСАД ИЛГЭЭЛТИЙН ХУУЧИРСАН «АРХИВЛАЖ БАЙНА» ТЭМДГИЙН ТАСАРСАН ЖААЗЫГ ЦЭВЭРЛЭНЭ.
 *    Урьд нь нэг илгээлтийн унасан батлалтын хагас жааз (`loadRows` strict → «Нийтлэл дундаа тасарсан…»)
 *    ӨӨР илгээлтүүдийн батлалтыг ч ерөнхий алдаагаар мөнхөд хаадаг байв — `cleanupTruncatedFrame` зөвхөн
 *    тэр илгээлтийг өөрийг нь батлахад ажилладаг. Одоо багцын нээлттэй `sub|` мөрүүдийн тэмдгийг шалгана:
 *      · ШИНЭ тэмдэг → хөндөхгүй, «хаагч» гэж нэрлэнэ (тэр батлалт явж байна);
 *      · хуучирсан, жааз БУУГААГҮЙ → `cleanupTruncatedFrame`; алдаа бол «хаагч»;
 *      · шалгаж чадсангүй → «хаагч»; буусан/тодорхойгүй (бүтэн жааз) → алгасна.
 * @returns устгасан мөрийн тоо ба хүнд харуулах «хаагч» илгээлтүүд (№ · өдөр · хэн)
 */
async function cleanupOtherStale(pkgKey: string, exceptOid: number): Promise<{ deleted: number; blockers: string[] }> {
  const { listActiveSubmissions, markFresh } = await import('./submission');
  const { msToDay } = await import('@/modules/sheet/bagtsSheet');
  const out = { deleted: 0, blockers: [] as string[] };
  const subs = await listActiveSubmissions(pkgKey);
  for (const s of subs) {
    const am = s.payload.archiving;
    if (s.oid === exceptOid || !am) continue;
    const name = tr('илгээлт №{0} ({1}{2})', String(s.oid), msToDay(am.fillMs), am.by ? ` · ${am.by}` : '');
    if (markFresh(am)) { out.blockers.push(`${name} — ${tr('архивлаж байна')}`); continue; }
    let hit: number | null | 'ambiguous';
    try { hit = await probeArchivedFrame(pkgKey, am); } catch (e) {
      out.blockers.push(`${name} — ${String((e as Error)?.message ?? e)}`);
      continue;
    }
    /* буусан (бүтэн) / тодорхойгүй жааз нь ТАСАРСАН биш — энэ уналтын шалтгаан биш, хөндөхгүй */
    if (hit != null) continue;
    const cl = await cleanupTruncatedFrame(pkgKey, am);
    if ('error' in cl) out.blockers.push(`${name} — ${cl.error}`);
    else out.deleted += cl.deleted;
  }
  return out;
}

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
async function archiveSubmission(
  cur: Row,
  /**
   * ХЯНАГЧИЙН ХАРСАН илгээлтийн `at` (`apply`-ийн `subAt`). ⚠️ 2026-10-09 (R3): `apply` өөрийн
   * уншилтаар тулгасны ДАРАА энд дахин уншдаг тул завсарт дахин илгээвэл хянагчийн ХАРААГҮЙ
   * агуулга архивлагддаг байв — энд ч тулгана (`contentChanged`).
   */
  subAt?: number,
): Promise<Archived> {
  const subOid = cur[F.sheetOid];
  /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `Эх_мөрийн_дугаар` 0/хоосон (хамгийн хуучин мөр) — урьд нь
     `readSubmissionByOid(0)` → legacy салбар `{archiveOid: 0}` → `apply` худал «нэгтгэлд бүртгэгдсэнгүй (archiveOid = 0)»
     анхааруулдаг байв. Архивт бичих ч, бүртгэх ч жааз байхгүй → `empty` (A5-ийн ижил утга), ил хэлнэ. */
  if (!(Number.isInteger(subOid) && subOid > 0))
    return { ok: true, archiveOid: 0, empty: true, warn: tr('Хяналтын мөрд илгээлтийн дугаар алга (хуучин мөр) — архивт бичих, нэгтгэлд бүртгэх жааз байхгүй.') };
  /* ⚠️ `ARCHIVED`-ийн шалгуур нь ЭНД БИШ, илгээлтийг УНШСАНЫ ДАРАА (доор) —
     түлхүүрт `staged.at` (агуулгын хувилбар) орох ёстой. */
  const { readSubmissionByOid, closeSubmission, markArchiving, frameProbe, markFresh, resolveMark, ARCHIVING_TTL_MS } = await import('./submission');
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
    /* ⚠️ БАГЦЫН ТААРЦ ЭНД Ч ШАЛГАНА (2026-09-25 аудит): доорх `sub|` замын
       шалгуурын ЯГ ижил шалтгаан — `Эх_мөрийн_дугаар` нь хоёр үйлчилгээний
       OBJECTID-г нэг талбарт хадгалдаг тул өөр багцын `done|` мөртэй давхцаж,
       тэр багцын `pkgKey`/огноогоор нэгтгэл · IPC бүртгэгдэх байв. */
    {
      const { PKGS } = await import('@/modules/sheet/bagts.pkg');
      const dp = PKGS.find((p) => p.key === staged.payload.pkgKey);
      if (!dp) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', staged.payload.pkgKey) };
      /* ⚠️ 2026-10-09 (аудит №6): `bagtsKey`-ээр — «Багц 4.1» / «Багц 4-1» нэг багц (урьд ЯГ тэнцүү) */
      if (bagtsKey(dp.group) !== bagtsKey(cur[F.bagts]))
        return {
          ok: false,
          error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', dp.group, cur[F.bagts]),
        };
    }
    const aOid = staged.payload.archiveOid ?? 0;
    /* ⚠️ 2026-10-12 (A7): өдрийн тодорхойлолт `archivedDayOf`-д гарав — уралдааны (`again.sub.done`) зам ч хэрэглэнэ */
    const day = await archivedDayOf(staged.payload.pkgKey, aOid, staged.payload.fillMs);
    /* ⚠️ 2026-10-09 (R1): хаагдсан — «хаагдаагүй нэмэлт» тэмдэг утгагүй */
    unclosedSet(subOid, null);
    /* ⚠️ 2026-10-12 (A5): агуулгагүй үлдэгдлийн хаалт (`archiveOid` 0) — бүртгэх жааз алга */
    return { ok: true, archiveOid: aOid, day, pkgKey: staged.payload.pkgKey, ...(aOid === 0 && staged.payload.residual === true ? { empty: true as const } : {}) };
  }

  /*
   * ⚠️ 2026-10-12 (A9): ЭНЭ ТОЙРГИЙН БАТЛАЛТААР ҮҮССЭН ҮЛДЭГДЭЛ (`residualOf.row === cur.__oid`) — өмнөх оролдлого
   *    архив бичиж, батлах явцад дахин илгээсний үлдэгдлийг хадгалсан (`closeAfterArchive` → `reopen`) боловч
   *    хяналтын мөрийн `updateRows` унасан тул мөр эцсийн шатанд үлдсэн. Урьд нь дахин «Батлах» нь энэ үлдэгдлийг
   *    (доод шатнууд ХАРААГҮЙ агуулга) шууд архивлаж байв. Одоо архивлахгүй: өмнө нь бичигдсэн жаазаар
   *    (`residualOf.archiveOid`/`day`) бүртгэж, `reopen`-оор үлдэгдлийг ШИНЭ хяналтын тойрогт оруулна.
   *    `subAt` тулгалтаас ӨМНӨ — хянагч үлдэгдлийг батлахгүй, өмнө архивласан агуулгаа л баталж байна.
   */
  {
    const ro = staged.payload.residualOf;
    if (staged.payload.residual === true && ro && ro.row === cur.__oid) {
      const { PKGS } = await import('@/modules/sheet/bagts.pkg');
      const rp = PKGS.find((p) => p.key === staged.payload.pkgKey);
      if (!rp) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', staged.payload.pkgKey) };
      if (bagtsKey(rp.group) !== bagtsKey(cur[F.bagts]))
        return { ok: false, error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', rp.group, cur[F.bagts]) };
      return {
        ok: true,
        archiveOid: ro.archiveOid,
        day: ro.day,
        pkgKey: rp.key,
        warn: tr('Үндсэн агуулга өмнөх оролдлогоор архивт орсон; батлах явцад дахин илгээсэн үлдэгдэл нэмэлтийг архивлахгүй — шинэ хяналтын тойрогт шилжүүлнэ.'),
        reopen: { fillMs: staged.payload.fillMs, sheetOid: staged.oid, sheet: rp.name },
        ...(ro.archiveOid > 0 ? {} : { empty: true as const }),
      };
    }
  }

  /* ⚠️ 2026-10-09 (R3): хянагчийн харсан агуулга мөн эсэх — `apply`-ийн тулгалттай ижил мессеж */
  if (subAt != null && staged.at !== subAt)
    return { ok: false, error: tr('Илгээлтийн агуулга өөрчлөгдсөн — дахин уншина уу'), contentChanged: true };

  /* ⚠️ Энэ сешнд ЯГ ЭНЭ АГУУЛГА аль хэдийн архивлагдсан бол ДАХИН БИЧИХГҮЙ
     (дээрх `ARCHIVED`-ийн ⚠️). Агуулга шинэчлэгдсэн бол түлхүүр өөрчлөгдөх
     тул шинэ илгээлт ЖИНХЭНЭЭР архивлагдана. */
  const seenKey = `${subOid}:${staged.at}`;
  const seen = archivedGet(seenKey);
  if (seen != null) {
    /* ⚠️ ХААЛТЫГ ДАХИН ОРОЛДОНО (2026-09-25): энэ салбарт хүрсэн нь `sub|` мөр
       нээлттэй хэвээр буюу өмнөх `closeSubmission` хоёулаа унасан гэсэн үг —
       хаалт нь idempotency-ийн ЦОРЫН ГАНЦ байнгын тэмдэг (`done|`). Унавал
       батлалтыг зогсоохгүй (доорх үндсэн замын дүрэмтэй ижил). */
    /* ⚠️ 2026-10-12 (дарааллын аудит): `approvedAt` серверийн цагаар (`serverClock`-ийн ⚠️) */
    const cl = await closeSubmission(staged.oid, seen.oid, serverNow(), true, staged.at);
    if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй (дахин оролдлого):', cl.error);
    else unclosedSet(subOid, null);
    return { ok: true, archiveOid: seen.oid, day: seen.day, pkgKey: staged.payload.pkgKey };
  }

  /* ⚠️ 2026-10-09 (R1): архивласан нэмэлтээ агуулсан ХААГДААГҮЙ мөр (`UNCLOSED_LS`-ийн ⚠️) —
     `residual` биш дараагийн агуулгыг архивлахгүй, +N давхар орно. */
  {
    const uc = staged.payload.mode === 'inc' && staged.payload.residual !== true ? unclosedGet(subOid) : undefined;
    if (uc && staged.at >= uc.at)
      return {
        ok: false,
        error: tr('Энэ илгээлтийн өмнөх нэмэлт архивт бичигдсэн боловч илгээлт хаагдаагүй хэвээр — дахин батлавал нэмэлт ДАВХАР орно. Архивт юу ч бичсэнгүй; админаар илгээлтийн мөрийг шалгуулна уу.'),
      };
  }

  /* ⚠️ `let` (2026-10-04 дахин аудит #1): хуучин (`rowOcc`-гүй) payload-ын давтамжийг суурь жаазаас
     нөхсөн хувилбараар доор СОЛИГДОНО (`withFrameOcc`) — агуулга (нүд/огноо) хөндөгдөхгүй. */
  let pl = staged.payload;
  const { PKGS, fillSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((p) => p.key === pl.pkgKey);
  if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pl.pkgKey) };
  /*
   * ⚠️ БАГЦЫН ТҮЛХҮҮР ЗААВАЛ ТААРНА (2026-09-04-ний аудит): `Эх_мөрийн_дугаар`
   *    нь ХОЁР өөр үйлчилгээний OBJECTID-г (илгээлтийн мөр ба архивын мөр) НЭГ
   *    талбарт хадгалдаг тул хуучин (архивын дугаартай) бүртгэлийн дугаар
   *    санамсаргүйгээр өөр багцын `sub|` мөр рүү таарч болно. Тэгвэл огт өөр
   *    багцын гүйцэтгэл ЭНЭ хяналтын мөрөөр архивт бичигдэнэ. Ил зогсооно.
   * ⚠️ 2026-10-09 (аудит №6): `bagtsKey`-ээр — «Багц 4.1» / «Багц 4-1» нэг багц (урьд ЯГ тэнцүү).
   */
  if (bagtsKey(pkg.group) !== bagtsKey(cur[F.bagts]))
    return {
      ok: false,
      error: tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}». Архивт юу ч бичсэнгүй.', pkg.group, cur[F.bagts]),
    };

  const [{ loadRows, applyAdds, applyDeletes, msToDay, dayFilter, addsLost }, { overlaySubmission, buildFrame, assertFrameLength, staleSubmissionKeys, withFrameOcc, needsFrameOcc }, { sameFrame, fillMsFor }, { agsFetch }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
    import('./ajilApply'),
    import('@/modules/sheet/ags'),
  ]);
  /* ⚠️ 2026-10-09: `fillSchema` — бөглөгч (FillNew) ба хянагчийн (hyanaltDetail) бүдүүвчтэй НЭГ. Блокгүй
     багцад синтетик НЭГ блок (обьём `obyem_sum`, гүйцэтгэл `Ажил_гүйцэтгэл`) — анхдагч бүдүүвчээр
     архивлавал илгээлтийн `${oid}:0` нүд `unmoved` болж батлалт зогсоно. */
  const sc = await fillSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  /*
   * ⚠️ 2026-10-11 (аудит №7): АГУУЛГАГҮЙ ҮЛДЭГДЭЛ (`residual: true`, нүд · огноо · мөр алга, `asOf` хөндөөгүй —
   *    хуучин `closeAfterArchive` ийм мөр бичдэг байсан) — архивт бичих зүйлгүй: `applyAdds`-аар ИЖИЛ жаазыг
   *    дахин хуулахгүй, шууд хаана (`closeAfterArchive`). Өдөр нь `fillMs`-ээр; `archiveOid` 0 — бүртгэх
   *    гүйцэтгэл байхгүй.
   */
  if (pl.residual === true && !pl.cells.length && !(pl.dates ?? []).length && !pl.adds.length && pl.asOf == null) {
    const fin = await closeAfterArchive(subOid, staged, pl, 0, pkg.name, { row: cur.__oid, day: msToDay(pl.fillMs) });
    if (fin.hold) return { ok: false, error: fin.hold };
    const warns = [tr('Илгээлт агуулгагүй үлдэгдэл байсан тул архивт бичсэнгүй — илгээлтийг хаав.'), ...fin.warns];
    /* ⚠️ 2026-10-12 (A5): `empty` — нэгтгэл/IPC-д бүртгэх жааз алга (`Archived.empty`-ийн ⚠️) */
    return { ok: true, archiveOid: 0, day: msToDay(pl.fillMs), pkgKey: pkg.key, warn: warns.join(' · '), empty: true, ...(fin.reopen ? { reopen: fin.reopen } : {}) };
  }
  /*
   * ⚠️ 2026-10-09 (R2): АЛЬ ХЭДИЙН АРХИВЛАГДСАН УУ — «архивлаж байна» тэмдэг (`SubmissionPayload.archiving`)
   *    ЭНЭ агуулгынх (`at`) бол тэр үеийн MAX OID-оос хойш, тэр өдрийн жааз архивт БҮТЭН (≥ n мөр)
   *    байгаа эсэхийг шалгана. Байвал `applyAdds`-ийг АЛГАСАЖ шууд хаана — өөр хөтчийн дахин
   *    батлалт (`archivedGet` харагдахгүй) бүтэн жаазыг ДАХИН бичдэг байв. Бүтэн биш (буцаагдсан
   *    хагас жааз) бол урьдын адил бичнэ. Шалгаж ЧАДАХГҮЙ бол бичихгүй (fail-closed).
   */
  /* ⚠️ 2026-10-09 (R2-c): урьд нь «OID > maxOid0, тэр өдөр ≥ n мөр» л шалгадаг байв — тэмдэг тавигдаад
     бичилт ТОДОРХОЙ татгалзагдсан (юу ч бичигдээгүй) ч тэр өдөр ӨӨР жааз (ажил нэмэх · Улсын комисс)
     бичигдсэн бол «аль хэдийн архивлагдсан» гэж андуурч, батлагдсан гүйцэтгэл архивт ОГТ орохгүйгээр
     илгээлт хаагддаг байв. Одоо ОЛДСОН ЖААЗ НЬ ЭНЭ ИЛГЭЭЛТИЙНХ болохыг батална (`submission.matchArchivedFrame`):
     ЯГ `n` мөр, эхний мөрийн № = `rootNo`, илгээлтээр өөрчлөгдсөн нүднүүдийн дээж (`probe`) архивтай
     тэнцүү. Шалгаж ЧАДАХГҮЙ бол бичихгүй (fail-closed) — хуучин дүрэм хэвээр. */
  /*
   * ⚠️ 2026-10-09: ДАМЖСАН ТЭМДЭГ (`am.at ≠ staged.at` — архивлах явцад/дараа дахин илгээгдэж `mergeSubmission`
   *    тэмдгийг дамжуулсан) ч ШИЙДНЭ. Урьд нь зөвхөн `am.at === staged.at`-ийг шалгадаг тул шинэ агуулга (архивласан
   *    +15 ба шинэ +5) БҮТНЭЭРЭЭ дахин бичигдэж base+15 → base+35 болдог байв.
   *      · жааз БУУСАН → доор (`withFrameOcc`-ийн дараа) архивласан хэсгийг хасна (`resolveMark`), хасаж чадахгүй → ТАТГАЛЗ;
   *      · БУУГААГҮЙ + тэмдэг ШИНЭ (явж буй/үр дүн тодорхойгүй) → ТАТГАЛЗ;
   *      · БУУГААГҮЙ + хуучирсан → тэр агуулга архивт ороогүй — бүтнээр нь бичнэ (тэмдэг шинээр тавигдана);
   *      · шалгаж чадахгүй / `'ambiguous'` → ТАТГАЛЗ («өмнөх архивлалт шалгагдаагүй»).
   *    Ижил `at`-тай тэмдэг — урьдын дүрэм (огнооны талбаргүй багцад шалгахгүй бичнэ; шинэ, өөр сешнийх бол
   *    `markArchiving` «claim»-аар татгалзана).
   */
  let rebase = false;
  let cleanupWarn = '';
  {
    const am = staged.payload.archiving;
    const carried = !!am && am.at !== staged.at;
    if (am && (carried || sc.f.fillDate)) {
      let hitOid: number | null | 'ambiguous';
      try {
        hitOid = await probeArchivedFrame(pkg.key, am);
      } catch (e) {
        return { ok: false, error: MARK_UNRESOLVED(String((e as Error)?.message ?? e)) };
      }
      if (hitOid === 'ambiguous')
        return { ok: false, error: MARK_UNRESOLVED(tr('архивт ижил урттай жааз байгаа боловч утга нь бөөрөнхийллөөр зөрж байна — админаар шалгуулна уу')) };
      if (!carried && hitOid != null && hitOid > 0) {
        const day = msToDay(am.fillMs);
        archivedSet(seenKey, { oid: hitOid, day });
        const fin = await closeAfterArchive(subOid, staged, pl, hitOid, pkg.name, { row: cur.__oid, day });
        if (fin.hold) return { ok: false, error: fin.hold };
        const warns = [tr('Энэ илгээлт өмнө нь архивт бичигдсэн байсан — дахин бичсэнгүй, илгээлтийг хаав.'), ...fin.warns];
        return { ok: true, archiveOid: hitOid, day, pkgKey: pkg.key, warn: warns.join(' · '), ...(fin.reopen ? { reopen: fin.reopen } : {}) };
      }
      if (carried) {
        if (hitOid != null) rebase = true;
        else if (markFresh(am)) return { ok: false, error: MARK_UNRESOLVED(tr('өмнөх батлалт явж байж магадгүй')) };
      }
      /* ⚠️ 2026-10-11 (аудит №7): жааз БУУГААГҮЙ, тэмдэг ХУУЧИРСАН — өмнөх батлалтын тасарсан хагас жааз
         (таб хаагдсан, буцаалт ажиллаагүй) архивт үлдсэн байж болно; түүнийг цэвэрлээгүй бол доорх `strict`
         `loadRows` «сүүлийн агшин дутуу» гэж унаж, батлалт мөнхөд гацна (`cleanupTruncatedFrame`-ийн ⚠️).
         Танигдахгүй/устгагдахгүй бол ТАТГАЛЗ (fail-closed). */
      if (hitOid == null && !markFresh(am) && sc.f.fillDate) {
        const cl = await cleanupTruncatedFrame(pkg.key, am);
        if ('error' in cl) return { ok: false, error: MARK_UNRESOLVED(cl.error) };
        if (cl.deleted > 0) cleanupWarn = tr('Өмнөх батлалтын тасарсан {0} мөрийг архиваас цэвэрлэв.', String(cl.deleted));
      }
    }
  }
  /*
   * ⚠️ УРАЛДААНЫ ХЭМЖҮҮР — `ajilApply.materializeAdds` A.8/A.8а-тай ИЖИЛ (2026-09-25
   *    аудит). Урьд нь энд ямар ч шалгалт байгаагүй: ачаалснаас хойш өөр жааз орсон
   *    («Улсын комисс» автомат мөр, нэмэлт ажлын буулгалт, зэрэгцээ батлалт) эсвэл
   *    байгаа жааз руу «Хуваарь» хадгалагдсан бол манай жааз ХУУЧИН мөрүүдээс
   *    угсрагдаж тэдгээрийг булдаг байв. MAX OID-ийг ачаалахаас ӨМНӨ авна.
   */
  const maxOidOf = async (): Promise<number> => {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'mx' }]),
      returnGeometry: 'false',
    });
    const mx = Number(j?.features?.[0]?.attributes?.mx);
    if (!Number.isFinite(mx)) throw new Error(tr('OBJECTID-ийн дээд утга уншигдсангүй'));
    return mx;
  };
  let maxOid0: number;
  try { maxOid0 = await maxOidOf(); } catch (e) {
    return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) };
  }
  /*
   * ⚠️ СҮҮЛИЙН жаазыг татна (өдөр зааж ӨГӨХГҮЙ). Илгээлт нь diff тул суурь нь
   *    БАТЛАХ агшны хамгийн сүүлийн архив байх ёстой: хооронд нь өөр илгээлт
   *    батлагдсан бол түүний тоог дарж бичихгүй.
   */
  /* ⚠️ 2026-10-09 (F4): `strict` — жаазны бүтэн эсэхийг шалгаж ЧАДАХГҮЙ бол бичихгүй (дутуу жааз дээр угсрахгүй) */
  let loaded0: Awaited<ReturnType<typeof loadRows>> | undefined;
  let loadErr = '';
  let blockers: string[] = [];
  try {
    loaded0 = await loadRows(pkg, sc, undefined, undefined, { strict: true });
  } catch (e) {
    /* ⚠️ 2026-10-12 (A3): ӨӨР илгээлтийн унасан батлалтын хагас жааз сүүлийн агшныг «дутуу» болгосон байж болно —
       тэдгээрийн хуучирсан тэмдгээр цэвэрлээд НЭГ удаа дахин уншина; бүтэхгүй бол хаагч илгээлтийг НЭРЛЭНЭ
       (урьд нь ерөнхий «Нийтлэл дундаа тасарсан…» л гардаг тул аль илгээлт хаасныг хэн ч мэддэггүй байв). */
    loadErr = String((e as Error)?.message ?? e);
    let fix: { deleted: number; blockers: string[] };
    try { fix = await cleanupOtherStale(pkg.key, staged.oid); } catch { fix = { deleted: 0, blockers: [] }; }
    blockers = fix.blockers;
    if (fix.deleted > 0) {
      try {
        loaded0 = await loadRows(pkg, sc, undefined, undefined, { strict: true });
        const w = tr('Өмнөх батлалтын тасарсан {0} мөрийг архиваас цэвэрлэв.', String(fix.deleted));
        cleanupWarn = cleanupWarn ? `${cleanupWarn} · ${w}` : w;
      } catch (e2) { loadErr = String((e2 as Error)?.message ?? e2); }
    }
  }
  if (!loaded0)
    return {
      ok: false,
      error: blockers.length ? `${loadErr} · ${tr('Хаагч илгээлт: {0}', blockers.join('; '))}` : loadErr,
    };
  const loaded = loaded0;
  /*
   * ⚠️ 2026-10-04 дахин аудит (#1, HIGH): ХУУЧИН (`rowOcc`-гүй) илгээлт ӨМНӨХ жааз дээр — давхардсан
   *    шошготой мөрийг шинэ жаазад зөөж чадахгүй (`mapOldOids` хоёрдмол) тул батлалт МӨНХӨД
   *    `unmoved`-оор зогсдог байв. Илгээлтийн СУУРЬ жаазыг (`pl.base`) уншиж давтамжийг ЯГ нөхнө
   *    (`withFrameOcc`); доорх `staleSubmissionKeys` ч энэ жаазыг дахин ашиглана. Уншилт унавал
   *    нөхөхгүй — хуучин дүрэм (хоёрдмол → ил зогсолт, хүн шалгана) хэвээр.
   */
  let baseRows0: Awaited<ReturnType<typeof loadRows>>['rows'] | null = null;
  if (pl.base != null && needsFrameOcc(pl, loaded.rows)) {
    try {
      baseRows0 = (await loadRows(pkg, sc, msToDay(pl.base))).rows;
      pl = withFrameOcc(pl, baseRows0);
    } catch { baseRows0 = null; }
  }
  /*
   * ⚠️ 2026-10-09: МӨРИЙН БҮТЭН АГУУЛГА (`plAll`) ба БИЧИХ агуулга (`pl`) — дамжсан тэмдгийн жааз буусан бол
   *    (`rebase`) архивласан хэсгийг ХАСАЖ зөвхөн үлдэгдлийг бичнэ (`resolveMark`). Хаалтын үлдэгдлийн тооцоо
   *    (`closeAfterArchive`) БҮТЭН агуулгаар — бичсэний дараа мөрийн бүх агуулга архивт орсон.
   */
  const plAll = pl;
  if (rebase) {
    const rb = resolveMark(pl, true);
    if (!rb)
      return { ok: false, error: MARK_UNRESOLVED(tr('өмнөх агуулга архивт бичигдсэн боловч шинэ илгээлтээс түүнийг хасаж чадсангүй')) };
    pl = rb;
  }
  /*
   * ⚠️ ДАРААЛАЛ АЛДАГДСАН БАТЛАЛТ ХУРИМТЛАЛЫГ БУЦААХГҮЙ (2026-09-25-ны аудит,
   *    HIGH). Өдөр бүр тусдаа `sub|` мөртэй тул Даваа, Мягмарын илгээлт хоёулаа
   *    ижил суурь дээр бичигдэж зэрэг хянагдана. Мягмар ЭХЭЛЖ батлагдсаны дараа
   *    Даваа батлагдвал Даваагийн (бага, ХУУЧИН хуримтлал) утга Мягмарын
   *    жаазан дээр дарж бичигдэж гүйцэтгэл ЧИМЭЭГҮЙ буурдаг байв.
   * ⚠️ СОНГОСОН ШИЙДЭЛ — «суурийнхаас хойш өөрчлөгдсөн нүдийг АЛГАСАЖ ил
   *    мэдэгдэх», «хуучин өдрийг бүхэлд нь татгалзах» БИШ: татгалзвал тэр
   *    өдрийн илгээлт МӨНХӨД гацна (дахин илгээхэд ч өдрийн түлхүүр нь
   *    хуучин хэвээр), харин хожуу өдрийн хуримтлагдсан утга нь хуучин өдрийн
   *    ахицыг аль хэдийн агуулдаг тул түүнийг үлдээх нь утгын хувьд зөв.
   *    Зөрчилгүй нүднүүд хэвийн буна; алгассан нүдийг `warn`-аар нэрлэнэ.
   * ⚠️ ЗӨВХӨН архивт ИЛГЭЭЛТИЙН ӨДРӨӨС ХОЖУУ өдрийн жааз байвал шалгана:
   *    дараалсан батлалтад (Даваа → Мягмар) Мягмарын утга ЗӨВ дарах ёстой.
   *    Ижил өдрийн (эсвэл ӨНӨӨДӨР рүү залруулсан) жааз өдрөөрөө ялгагдахгүй тул
   *    энэ хамгаалалтын гадна — хуучин зан төлөв хэвээр.
   * ⚠️ Суурь (`payload.base`) байхгүй бол харьцуулах боломжгүй → ЗОГСОНО
   *    (буцаах эрсдэлтэй бичихээс ил алдаа дээр).
   */
  /** Нүдний түлхүүрүүд → «№ ¦ Ажил · блок · эхлэх/дуусах» (эхний 10) — алдаа/анхааруулгад */
  const label = new Map(pl.rowKeys ?? []);
  const nameKeys = (keys: string[]): string => {
    const names = keys.slice(0, 10).map((k) => {
      const parts = k.split(':');
      const oid = Number(parts[0]);
      const b = Number(parts[1]);
      const blk = Number.isInteger(b) && sc.bld[b] ? sc.bld[b] : '—';
      const se = parts[2] === 's' ? tr('эхлэх') : parts[2] === 'e' ? tr('дуусах') : '';
      return `${label.get(oid) ?? `#${oid}`} · ${blk}${se ? ` · ${se}` : ''}`;
    });
    const more = keys.length > names.length ? ` … +${keys.length - names.length}` : '';
    return names.join('; ') + more;
  };
  const lastDay0 = loaded.snapshot != null ? msToDay(loaded.snapshot) : '';
  let skipped: string[] = [];
  let plEff = pl;
  /*
   * ⚠️ НЭМЭЛТИЙН ИЛГЭЭЛТ (2026-09-25, `SubmissionPayload.mode`): нүд нь СҮҮЛИЙН
   *    жааз дээр НЭМЭГДДЭГ тул дараалал алдагдсан батлалт хуримтлалыг буцаадаггүй
   *    — Даваа (+10) ба Мягмар (+5) ямар ч дарааллаар батлагдсан ч 40 → 55.
   *    Тиймээс нүдийг `staleSubmissionKeys`-ээр АЛГАСАХГҮЙ (тэр функц inc үед
   *    нүдийг өөрөө орхино); огноо нь ҮНЭМЛЭХҮЙ хэвээр тул огноотой бол л шалгана.
   *    Туггүй (хуучин, НИЙТ) payload нь доорх хамгаалалтаараа ХЭВЭЭР.
   */
  const incPl = pl.mode === 'inc';
  const needStale = !incPl || (pl.dates ?? []).length > 0;
  if (needStale && lastDay0 && lastDay0 > msToDay(pl.fillMs) && loaded.snapshot !== pl.base) {
    if (pl.base == null)
      return {
        ok: false,
        error: tr('Архивт {0}-ны жааз аль хэдийн байгаа тул {1}-ны илгээлтийг суурьгүйгээр бичвэл хуримтлал буурна. Архивт юу ч бичсэнгүй — гүйцэтгэгчээр дахин илгээүүлнэ үү.', lastDay0, msToDay(pl.fillMs)),
      };
    let baseRows: Awaited<ReturnType<typeof loadRows>>['rows'];
    try {
      baseRows = baseRows0 ?? (await loadRows(pkg, sc, msToDay(pl.base))).rows;
    } catch (e) {
      return { ok: false, error: tr('Илгээлтийн суурь жаазыг уншиж чадсангүй — архивт юу ч бичсэнгүй: {0}', String((e as Error)?.message ?? e)) };
    }
    skipped = staleSubmissionKeys(baseRows, loaded.rows, pl, nBld);
    if (skipped.length) {
      const drop = new Set(skipped);
      plEff = {
        ...pl,
        cells: (pl.cells ?? []).filter(([k]) => !drop.has(k)),
        dates: (pl.dates ?? []).filter(([k]) => !drop.has(k)),
      };
    }
  }
  const ov = overlaySubmission(loaded.rows, plEff, sc, nBld);
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
    return {
      ok: false,
      error: tr('{0} нүдийг шинэ мөрүүдэд тулгаж чадсангүй — архивт бичсэнгүй. Гүйцэтгэгчээр дахин илгээүүлнэ үү. Тулгагдаагүй: {1}', String(ov.unmoved), nameKeys(ov.unmovedKeys)),
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
  /* ⚠️ 2026-10-11 (аудит №7): залруулга нь `ajilApply.fillMsFor` = max(өнөөдөр, сүүлийн жаазны өдөр). Урьд нь
     ҮРГЭЛЖ өнөөдөр гэж бичдэг тул сүүлийн жааз ИРЭЭДҮЙН өдөртэй бол (цаг зөрсөн машинаас бичигдсэн) шинэ жааз
     түүнээс хуучин өдөрт унаж, яг дээрх ⚠️-ийн алдаа (хуудсанд хэзээ ч гарахгүй) давтагдах байв. Нөхцөл хэвээр. */
  let fillMs = pl.fillMs;
  const lastDay = loaded.snapshot != null ? msToDay(loaded.snapshot) : '';
  /* ⚠️ 2026-10-12 (дарааллын аудит): «өнөөдөр» СЕРВЕРИЙН өдрөөр (`serverClock`-ийн ⚠️) — хөтчийн цаг хоцорсон
     машинаас сүүлийн жаазнаас хуучин өдөрт бичигдэхээс сэргийлнэ */
  if (lastDay && lastDay >= msToDay(fillMs)) fillMs = fillMsFor(serverNow(), loaded.snapshot);

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
      /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр, «бүгдийг зас»): сар доторх төлөвлөгөөт хувь
         АЖЛЫН жинхэнэ эхлэх–дуусах өдрөөр (`planPctFromMonths`-ийн 3 дахь аргумент) —
         `bagtsSheet.planAt`-тай нэг томъёо; сарын эхэнд ХУДАЛ «хоцорсон» арилна. Огноо
         хоосон/эвдэрсэн бол функц өөрөө бүтэн сараар (хуучин зам). */
      return m ? planPctFromMonths(m, asOf, { start: row.start[b] ?? null, end: row.end[b] ?? null }) : null;
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
    /* ⚠️ `pkgKey` ЭНД Ч (2026-09-25): урьд нь орхигдсон тул нэгтгэл хуудас
       таах legacy зам руу унаж, `markRegistered` огт дуудагддаггүй байв. */
    /* ⚠️ 2026-10-12 (A7): өдрийг ТЭР табын бичсэн жаазнаас (`archivedDayOf`) — ЭНЭ сешний залруулсан `fillMs` биш */
    if (again.sub.done || again.sub.payload.archiveOid != null) {
      const aOid2 = again.sub.payload.archiveOid ?? 0;
      return { ok: true, archiveOid: aOid2, day: await archivedDayOf(pkg.key, aOid2, again.sub.payload.fillMs), pkgKey: pkg.key };
    }
    if (again.sub.at !== staged.at)
      return { ok: false, error: tr('Илгээлт энэ хооронд өөрчлөгдлөө — дахин нээж баталгаажуулна уу') };
  }
  /* ⚠️ 2026-10-09 (R2): «АРХИВЛАЖ БАЙНА» тэмдгийг `sub|` мөрөнд (`at`-ийн CAS) бичихийн ӨМНӨ
     тавина — архив бичигдээд хаалт · хяналтын мөр хоёулаа унавал ӨӨР хөтчийн дахин батлалт
     энэ тэмдгээр бичигдсэн жаазыг олж, БҮТЭН жаазыг дахин бичихгүй (дээрх `probeArchivedFrame`).
     Тэмдэг бичигдээгүй бол юу ч бичихгүй зогсоно — архивт өөрчлөлтгүй, менежер дахин дарна.
     ⚠️ 2026-10-09 (ДАРААЛАЛ ӨӨРЧЛӨГДСӨН): тэмдэг одоо доорх A.8/A.8а (`sameFrame`/MAX OID) шалгалтын ӨМНӨ —
     урьд нь шалгалт → тэмдэг → `applyAdds` байсан тул шалгалтын ДАРАА тэмдэг бичигдэх завсарт өөр бичигч
     (Ажил нэмэх · обьём · Хуваарь) `archivingBusy`-гаар тэмдгийг ХАРАХГҮЙ бичиж, манай жааз түүнийг булдаг
     байв. Одоо тэмдэг → шалгалт → `applyAdds` (шалгалт бичилтэд хамгийн ойр) → бичсэний дараах шалгалт. */
  /** Өөрийн тэмдгийг арилгана — ЗӨВХӨН архив өөрчлөгдөөгүй нь БАТАЛГААТАЙ үед (R2-b: үр дүнг шалгана) */
  const clearMark = async (): Promise<string> => {
    const r = await markArchiving(staged.oid, staged.at, null)
      .catch((x: unknown) => ({ ok: false as const, error: String((x as Error)?.message ?? x) }));
    return r.ok ? '' : ` · ${tr('«Архивлаж байна» тэмдгийг арилгаж чадсангүй ({0})', r.error ?? '')}`;
  };
  {
    /* ⚠️ 2026-10-09 (R2-c): жаазыг ДАРАА нь ЯГ таних дээж — эхний мөрийн № ба илгээлтээр өөрчлөгдсөн
       нүднүүд (`frameProbe`, ачаалсан жаазтай OID-оор тулгана; шинэ мөр бүхэлдээ «өөрчлөгдсөн»). */
    const prevByOid = new Map(loaded.rows.map((r) => [r.oid, r.raw]));
    const probeFields = [...sc.act, ...sc.obyem, ...sc.start, ...sc.end].filter((f): f is string => !!f);
    const probe = frameProbe(frame, (i) => prevByOid.get(ov.rows[i]?.oid ?? -1), probeFields);
    const rootNo = String(frame[0]?.[sc.f.no] ?? '').trim();
    const mr = await markArchiving(staged.oid, staged.at, {
      /* ⚠️ 2026-10-12 (дарааллын аудит): `startedAt` серверийн цагаар — `markFresh` өөр хөтчид мөн серверийн цагаар жишнэ */
      at: staged.at, startedAt: serverNow(), maxOid0, fillMs, n: frame.length,
      /* ⚠️ 2026-10-09 (аудит): 64-өөс УРТ бол ОГТ бичихгүй (урьд нь `slice(0, 64)` — таслагдсан утга
         `matchArchivedFrame`-ийн ЯГ тулгалтад хэзээ ч таарахгүй тул бичигдсэн жаазыг «олдсонгүй» гэж
         үзэж нэмэлтийг ДАВХАР тоолох эрсдэлтэй байв). `parseSubmission` урт утгыг аль хэдийн хаядаг;
         тэмдэггүй үед `noOf(rows[0])` нөөц ажиллана. */
      ...(rootNo && rootNo.length <= 64 ? { rootNo } : {}),
      ...(probe.length ? { probe } : {}),
    });
    if (!mr.ok)
      /* ⚠️ 2026-10-09 (claim): өөр сешн ЯГ ОДОО архивлаж байна — тэр мессежийг шууд */
      return mr.busy
        ? { ok: false, error: mr.error ?? '' }
        : mr.changed
          ? { ok: false, error: tr('Илгээлт энэ хооронд өөрчлөгдлөө — дахин нээж баталгаажуулна уу'), contentChanged: true }
          : { ok: false, error: tr('Архивлах тэмдэг бичигдсэнгүй — архивт юу ч бичсэнгүй, дахин оролдоно уу ({0})', mr.error ?? '') };
  }
  /* ⚠️ A.8/A.8а — жааз ба MAX OID-ийн уралдаа (дээрх `maxOidOf`-ийн ⚠️, 2026-09-25 аудит).
     Шалгаж ЧАДААГҮЙ нь «уралдаагүй» гэсэн үг биш — бичихгүй. Менежер дахин дарна.
     ⚠️ 2026-10-09: тэмдгийн ДАРАА (дээрх ⚠️) — зогсвол архив хөндөгдөөгүй тул өөрийн тэмдгийг арилгана. */
  /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): суурь жаазын мужийн `max(EditDate)` — бичихийн ӨМНӨХ суурь (A4-ийн `mx0`,
     `frameEditMax`-ийн ⚠️). `EditDate`-гүй үйлчилгээнд `null` — бичсэний дараа талбар бүрээр тулгана. */
  let editMax0: number | null = null;
  {
    let stop = '';
    try {
      const now2 = await loadRows(pkg, sc, undefined, undefined, { strict: true });
      if (!sameFrame(loaded, now2))
        stop = tr('Ачаалснаас хойш хуудасны мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — юу ч бичсэнгүй, дахин оролдоно уу.');
      else if ((await maxOidOf()) > maxOid0)
        stop = tr('Ачаалснаас хойш хуудсанд шинэ мөр орлоо (өөр батлалт зэрэг явсан) — юу ч бичсэнгүй, дахин оролдоно уу.');
      else if (sc.f.edited) {
        const where = frameOidWhere(sc.f.oid, loaded.rows);
        if (where) editMax0 = await frameEditMax(pkg.url, sc.f.edited, where, agsFetch);
      }
    } catch (e) {
      stop = tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e));
    }
    if (stop) return { ok: false, error: stop + (await clearMark()) };
  }
  let firstOid: number | null = null;
  /* ⚠️ БИЧИГДСЭН МӨРИЙН ДУГААР — унасан үед буцааж устгахад ЗААВАЛ хэрэгтэй. */
  const written: number[] = [];
  try {
    const r = await applyAdds(pkg, frame, written);
    firstOid = r.firstOid;
    /* ⚠️ БИЧИГДСЭН ТОО = ЖААЗНЫ УРТ (2026-09-25-ны аудит): дутуу жааз
       архивт үлдвэл дараагийн ачаалалт багцын хуудсыг хаана — доорх
       `catch` хагас жаазыг буцааж устгана. */
    if (r.added !== frame.length)
      throw new Error(tr('Архивт {0} мөр бичигдэх ёстой, {1} бичигдлээ', frame.length, r.added));
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
    /*
     * ⚠️ 2026-10-09: ХАРИУ АЛДАГДСАН (`addsLost` — `applyAdds`-ийн `lost` туг, урьд нь `added > 0` үед энгийн
     *    `Error`-оор ороогдож алдагддаг байв) — тэр багц серверт суусан эсэх ТОДОРХОЙГҮЙ, `written`-д ороогүй мөр
     *    архивт байж болно. Урьд нь «Хагас бичигдсэн N мөрийг буцаав» гэж ХУДАЛ тайлагнаж, тэмдгийг ч арилгадаг байв.
     *    Одоо: ЭНЭ ЖААЗНЫ мөрүүдийг (`OID > maxOid0 AND өдөр = fillMs` — тэмдэг тавьсны дараа өөр бичигч энэ өдөрт
     *    бичихгүй) хайж устгана; тэмдэг ҮЛДЭНЭ (алдагдсан хүсэлт хожуу суух боломжтой — дахин батлалт архивыг
     *    `probeArchivedFrame`-ээр шийднэ); мессеж «үр дүн тодорхойгүй». Автоматаар дахин бичихгүй.
     */
    if (addsLost(e)) {
      const ids = new Set(written);
      let strayErr = '';
      if (sc.f.fillDate) {
        try {
          const j = await agsFetch(`${pkg.url}/query`, {
            where: `${sc.f.oid} > ${maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(fillMs))}`,
            returnIdsOnly: 'true',
          });
          for (const x of (j?.objectIds ?? []) as unknown[]) if (Number.isInteger(x) && (x as number) > maxOid0) ids.add(x as number);
        } catch (x) { strayErr = String((x as Error)?.message ?? x); }
      }
      const gone = ids.size ? await applyDeletes(pkg, [...ids]) : 0;
      const left = ids.size - gone;
      return {
        ok: false,
        error: `${why} · ${tr('Архивын бичилтийн хариу алдагдсан — үр дүн тодорхойгүй. Энэ жаазны {0} мөрийг архиваас устгав{1}; «Архивлаж байна» тэмдэг үлдлээ — {2} минутын дараа дахин «Батлах» дарахад архивыг шалгаж шийднэ.', String(gone), left > 0 || strayErr ? ` (${tr('{0} мөр үлдсэн байж болзошгүй — AGOL дээр шалгана уу', String(Math.max(left, 0)))}${strayErr ? `: ${strayErr}` : ''})` : '', String(Math.round(ARCHIVING_TTL_MS / 60_000)))}`,
      };
    }
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      /* ⚠️ 2026-10-09 (R2): БҮРЭН буцаагдсан нь баталгаатай үед л «архивлаж байна» тэмдгийг арилгана
         (чадвал) — үлдвэл тэр өдөр өөр жааз бичигдсэний дараа дахин батлахад «аль хэдийн архивлагдсан»
         гэж андуурах эрсдэлтэй. Хариу алдагдсан тохиолдол дээр (`addsLost`) тусдаа. */
      const markMsg = left === 0 ? await clearMark() : '';
      return {
        ok: false,
        error: (left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — AGOL дээр гараар цэвэрлэнэ үү', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`) + markMsg,
      };
    }
    /* ⚠️ 2026-10-09 (R2-a): ЭХНИЙ багц ТОДОРХОЙ татгалзагдсан (серверийн `error.code` / `success:false` —
       `rollbackOnFailure` буцаасан) бөгөөд нэг ч мөр бичигдээгүй бол архив өөрчлөгдөөгүй нь баталгаатай —
       тэмдгийг арилгана (хариу алдагдсан бол дээрх салбар). */
    return { ok: false, error: why + (await clearMark()) };
  }
  /*
   * ⚠️ 2026-10-09: БИЧСЭНИЙ ДАРААХ ШАЛГАЛТ (`ajilApply` A.10б-ийн загвар). Дээрх A.8 шалгалт ба `applyAdds`-ийн
   *    завсарт өөр бичигч (тэмдгийг шалгахаас ӨМНӨ шийдсэн) мөр нэмсэн бол манай жааз түүнийг булж болно:
   *    `OID > maxOid0` мөрийн тоо манай бичсэнээс ИХ бол манайхыг БУЦААЖ устгаад дахин оролдуулна (тэр бичигч
   *    өөрийнхөөрөө шалгана). Шалгалт ӨӨРӨӨ унавал устгахгүй (жааз зөв байж болно) — анхааруулна.
   */
  let postWarn = '';
  try {
    const j = await agsFetch(`${pkg.url}/query`, { where: `${sc.f.oid} > ${maxOid0}`, returnCountOnly: 'true' });
    const cnt = Number(j?.count);
    if (!Number.isFinite(cnt)) throw new Error(tr('мөрийн тоо уншигдсангүй'));
    if (cnt > written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      const markMsg = left === 0 ? await clearMark() : '';
      return {
        ok: false,
        error: (left > 0
          ? tr('Бичих зуур хуудсанд өөр мөр орлоо (зэрэгцээ бичилт) — манай жаазын {0} мөрийн {1}-ийг устгаж чадсангүй, AGOL дээр гараар цэвэрлэнэ үү.', written.length, left)
          : tr('Бичих зуур хуудсанд өөр мөр орлоо (зэрэгцээ бичилт) — манай жаазыг архиваас буцааж устгав, дахин оролдоно уу.')) + markMsg,
      };
    }
  } catch (e) {
    postWarn = tr('Бичсэний дараах зэрэгцээ бичилтийн шалгалт унав ({0}) — архив бичигдсэн.', String((e as Error)?.message ?? e));
  }
  /*
   * ⚠️ 2026-10-12 (A4): СУУРЬ ЖААЗ ЗАСАГДСАН ЭСЭХ — дээрх тоо нь зөвхөн ШИНЭ OID-г барина. «Хуваарь»-ийн хадгалалт
   *    (`applyUpdates`) БАЙГАА жааз руу бичдэг тул A.8 шалгалт ба `applyAdds`-ийн завсарт орсон огноо манай жаазад
   *    ХУУЧИН утгаараа хуулагдаж, шинэ хамгийн сүүлийн жааз болсноор чимээгүй алга болдог байв. Суурь жаазын OID-ийн
   *    мужид `EditDate`-ийн дээд утга ачаалсан үеийнхээс өссөн (эсвэл `EditDate`-гүй бол утга бүр зөрсөн) бол
   *    манай жаазыг БУЦААЖ устгана (дээрх тооны салбарын ижил дүрэм). Шалгалт унавал устгахгүй — анхааруулна.
   */
  /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `editMax0` — бичихийн өмнө ИЖИЛ хүсэлтээр авсан суурь (`frameEditMax`-ийн ⚠️) */
  try {
    if (await baseFrameEdited(pkg.url, sc.f.oid, sc.f.edited, loaded.rows, agsFetch, editMax0)) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      const markMsg = left === 0 ? await clearMark() : '';
      return {
        ok: false,
        error: (left > 0
          ? tr('Бичих зуур үндсэн жаазын мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — манай жаазын {0} мөрийн {1}-ийг устгаж чадсангүй, AGOL дээр гараар цэвэрлэнэ үү.', written.length, left)
          : tr('Бичих зуур үндсэн жаазын мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — манай жаазыг архиваас буцааж устгав, дахин оролдоно уу.')) + markMsg,
      };
    }
  } catch (e) {
    const w = tr('Бичсэний дараах зэрэгцээ бичилтийн шалгалт унав ({0}) — архив бичигдсэн.', String((e as Error)?.message ?? e));
    postWarn = postWarn ? `${postWarn} · ${w}` : w;
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
  archivedSet(seenKey, { oid: firstOid ?? 0, day: msToDay(fillMs) });
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
  /* ⚠️ COMPARE-AND-SET `at` (2026-09-25-ны аудит, HIGH): жааз бичих хооронд
     гүйцэтгэгч ДАХИН илгээвэл (нэг `sub|` мөр update) шинэ агуулга архивт
     ОРООГҮЙ атлаа `done|` болж хөлдөж ул мөргүй алга болдог байв. Одоо
     `closeSubmission` мөрийн `at` зөрвөл хаахгүй (`changed`): илгээлт нээлттэй
     үлдэж шинэ агуулга дараагийн батлалтаар орно (утга нь хуримтлагдсан тул
     дахин давхарлахад аюулгүй). Дахин оролдохгүй — зөрсөн `at` засрахгүй.
     ⚠️ 2026-09-25: «дахин давхарлахад аюулгүй» нь ЗӨВХӨН хуучин (НИЙТ) payload-д
     үнэн — нэмэлтийн горимд доор архивласан хэсгийг ХАСНА. */
  /* ⚠️ 2026-10-09: БҮТЭН агуулгаар (`plAll` — дамжсан тэмдгийн хасалтын өмнөх) — мөрийн бүх агуулга одоо архивт */
  const fin = await closeAfterArchive(subOid, staged, plAll, firstOid ?? 0, pkg.name, { row: cur.__oid, day: msToDay(fillMs) });
  /* ⚠️ 2026-10-09 (засвар 5): үлдэгдэл хадгалагдаагүй — «Шилжүүлсэн» болгохгүй, эцсийн шатанд үлдээнэ */
  if (fin.hold) return { ok: false, error: fin.hold };
  const warns = fin.warns;
  if (postWarn) warns.push(postWarn);
  if (cleanupWarn) warns.push(cleanupWarn);
  const reopen = fin.reopen;
  if (skipped.length)
    warns.push(tr('Архивт илүү хожуу өдрийн жааз аль хэдийн байсан тул {0} нүдийг алгасав (хуримтлал буурахаас сэргийлэв): {1}', String(skipped.length), nameKeys(skipped)));

  return { ok: true, archiveOid: firstOid ?? 0, day: msToDay(fillMs), pkgKey: pkg.key, ...(warns.length ? { warn: warns.join(' · ') } : {}), ...(reopen ? { reopen } : {}) };
}

/**
 * АРХИВЫН ДАРААХ ХААЛТ — `archiveSubmission`-ийн үндсэн зам БА «аль хэдийн архивлагдсан» (R2)
 * зам хоёул ЭНЭ НЭГ дүрмээр хаана (2026-10-09-нд гаргасан; дүрэм нь доторх ⚠️-үүд).
 */
async function closeAfterArchive(
  subOid: number,
  staged: StagedSubmission,
  /** Архивласан payload (`withFrameOcc`-ээр нөхсөн байж болно) */
  pl: SubmissionPayload,
  firstOid: number,
  sheetName: string,
  /**
   * ⚠️ 2026-10-12 (A9): энэ батлалтын хяналтын мөр (`cur.__oid`) ба архивласан жаазны өдөр — үлдэгдэлд
   *    `residualOf`-оор тэмдэглэнэ (`SubmissionPayload.residualOf`-ийн ⚠️).
   */
  by: { row: number; day: string },
): Promise<{ warns: string[]; reopen?: { fillMs: number; sheetOid: number; sheet: string }; hold?: string }> {
  const { readSubmissionByOid, closeSubmission, saveSubmission, residualAfterArchive } = await import('./submission');
  /** ⚠️ 2026-10-09: үлдэгдлийн бичилт — архив шийдэгдсэн тул «архивлаж байна» тэмдгийг АРИЛГАЖ (`dropMark` —
      `saveSubmission`-ий тэмдгийн хамгаалалт) бичнэ; урьд нь `residualAfterArchive` тэмдгийг дамжуулж үлдээдэг байв. */
  /* ⚠️ 2026-10-12 (A9): `residualOf` — хяналтын мөрийн `updateRows` унаж мөр эцсийн шатанд үлдвэл дахин «Батлах»
     энэ үлдэгдлийг архивлахгүй, шинэ тойрог нээнэ (`archiveSubmission`-ий A9 салбар). */
  const saveRest = (rest: SubmissionPayload, at0: number, mark0: number | undefined) => {
    /* ⚠️ 2026-10-12 (дарааллын аудит): `at` серверийн цагаар — `apply`-ийн `s0.at >= uc.at` жишилт өөр хөтчид явдаг */
    const body: SubmissionPayload = { ...rest, at: serverNow(), residual: true, residualOf: { row: by.row, archiveOid: firstOid, day: by.day } };
    delete body.archiving;
    return saveSubmission(rest.pkgKey, body, { at: at0, ...(mark0 != null ? { dropMark: mark0 } : {}) });
  };
  const incPl = pl.mode === 'inc';
  const warns: string[] = [];
  /* ⚠️ 2026-10-11 (аудит №7): ХООСОН үлдэгдэл (нүд · огноо · нэмсэн мөр алга, `asOf` хөндөөгүй) — `sub|` мөрөнд
     бичихгүй: агуулгагүй `residual` мөр нь дараагийн ачаалалтад давхарлагдаж (`useSub`), өнчин тойрог (`reopen`)
     нээж, FillNew-ийн «хяналтад бүртгэгдсэнгүй» анхааруулгыг дэмий асаадаг байв. Оронд нь хаалт унасан гэдгийг
     тэмдэглэж (`unclosedSet` — урьдын нөөц зам) анхааруулна. */
  const emptyRest = (r: SubmissionPayload): boolean =>
    !(r.cells ?? []).length && !(r.dates ?? []).length && !(r.adds ?? []).length && r.asOf == null;
  /* ⚠️ 2026-10-12 (A5): `regPending` ЗӨВХӨН бүртгэх жааз байвал (`firstOid > 0`) — 0 үед `registerApproved` хэзээ ч
     бүтэхгүй тул тэмдэг мөнхөд үлдэж `retryPendingRegistrations` шар мөрийг арилгадаггүй байв. */
  /* ⚠️ 2026-10-12 (дарааллын аудит): `approvedAt` серверийн цагаар (`serverClock`-ийн ⚠️) */
  let cl = await closeSubmission(staged.oid, firstOid, serverNow(), firstOid > 0, staged.at);
  if (!cl.ok && !cl.changed) cl = await closeSubmission(staged.oid, firstOid, serverNow(), firstOid > 0, staged.at);
  if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй:', cl.error);
  else unclosedSet(subOid, null);
  /*
   * ⚠️ НЭМЭЛТИЙН ГОРИМД ДАВХАРДАЛ (2026-09-25, `residualAfterArchive`-ийн ⚠️):
   *    дахин илгээсэн мөр нь архивласан нэмэлтийг ӨӨРТӨӨ АГУУЛДАГ тул тэр
   *    чигээр нь дахин батлавал 40 → 55 → 70 болно. Архивласан хэсгийг хасаж,
   *    зөвхөн ШИНЭ нэмэлтийг нээлттэй үлдээнэ (`at`-аар тулгаж бичнэ). Хасаж
   *    чадаагүй бол ИЛ анхааруулна — дахин батлахаас өмнө хүн шалгах ёстой.
   */
  /* ⚠️ Хаалт унасан (агуулга өөрчлөгдөөгүй) бол нээлттэй `sub|` мөрийг ДАХИН
     архивлавал нэмэлт давхар орно (хуучин горимд alias барьдаг байв) — ил хэлнэ. */
  /* ⚠️ 2026-10-09 (R1): хаалт хоёр удаа унасан — ХОЁР ДАХЬ бие даасан оролдлого: архивласан
     нэмэлтийг хасч (нүд → 0) `residual` болгон бичнэ (`at`-аар тулгана). Ингэснээр дараагийн
     дахин илгээлт/батлалт +N-ийг дахин нэмэхгүй. Энэ ч унавал хөтөчид тэмдэг (`UNCLOSED_LS`)
     үлдээж, тэр мөрийг дахин архивлахаас татгалзана. */
  if (!cl.ok && !cl.changed && incPl) {
    const rest = residualAfterArchive(staged.payload, pl);
    let why = rest ? '' : tr('түлхүүр тулгагдсангүй');
    if (rest && emptyRest(rest)) {
      /* ⚠️ 2026-10-11 (аудит №7): хоосон үлдэгдэл бичихгүй — хаагдаагүй тэмдэг л (дээрх `emptyRest`-ийн ⚠️) */
      why = tr('үлдэгдэл хоосон');
      console.warn('[selbe] илгээлтийг хааж чадсангүй, үлдэгдэл хоосон — агуулгагүй residual мөр бичсэнгүй:', cl.error);
    } else if (rest) {
      /* ⚠️ 2026-10-09: серверийн мөрийн ОДООГИЙН тэмдэг (энэ батлалтын `markArchiving`) — `dropMark` */
      const cur1 = await readSubmissionByOid(staged.oid);
      const sv = await saveRest(rest, staged.at, cur1.ok ? cur1.sub?.payload.archiving?.startedAt : undefined);
      if (!sv.ok) why = sv.error;
    }
    if (!why) {
      unclosedSet(subOid, null);
      warns.push(tr('Архивт бичигдсэн боловч илгээлтийг хааж чадсангүй ({0}) — архивлагдсан нэмэлтийг илгээлтээс хасч тэглэв, давхар орохгүй.', cl.error ?? ''));
    } else {
      unclosedSet(subOid, { at: staged.at });
      warns.push(tr('Архивт бичигдсэн боловч илгээлтийг хааж чадсангүй ({0}) — энэ илгээлтийг ДАХИН БАТЛАХГҮЙ байна уу: нэмэлт давхар орно.', `${cl.error ?? ''} · ${why}`));
    }
  }
  /** Үлдэгдэл `sub|` мөр үлдсэн бол — `apply` шинэ тойрог нээнэ (`Archived.reopen`-ийн ⚠️) */
  let reopen: { fillMs: number; sheetOid: number; sheet: string } | undefined;
  let hold: string | undefined;
  if (cl.changed && incPl) {
    const cur2 = await readSubmissionByOid(staged.oid);
    let why = '';
    /** ⚠️ 2026-10-11 (аудит №7): үлдэгдэл хоосон — бичихгүй, зөвхөн тэмдэг + анхааруулга */
    let emptyW = false;
    if (!cur2.ok) why = cur2.error;
    else if (!cur2.sub || cur2.sub.done) why = '';
    else {
      const rest = residualAfterArchive(cur2.sub.payload, pl);
      if (!rest) why = tr('түлхүүр тулгагдсангүй');
      else if (emptyRest(rest)) {
        /* ⚠️ 2026-10-11 (аудит №7): дахин илгээлт нь архивласан агуулгаас ЯЛГААГҮЙ (үлдэгдэл хоосон) — агуулгагүй
           `residual` мөр бичихгүй, шинэ тойрог ч нээхгүй, `hold` ч биш (бүх агуулга архивт орсон); хаагдаагүй
           тэмдэг + анхааруулга (`emptyRest`-ийн ⚠️) */
        emptyW = true;
        console.warn('[selbe] дахин илгээлтийн үлдэгдэл хоосон — агуулгагүй residual мөр бичсэнгүй, илгээлт нээлттэй үлдэв');
      } else {
        /* ⚠️ `residual: true` (2026-09-25 аудит) — энэ мөрийн агуулга архивт ОРООГҮЙ гэдгийг
           FillNew (давхарлах/нэгтгэх) ба доорх шинэ тойрог мэднэ; урьд нь урсгал
           «Шилжүүлсэн» тул мөр харагдахгүй, дараагийн илгээлтэд дарагдаж алга болдог байв. */
        const sv = await saveRest(rest, cur2.sub.at, cur2.sub.payload.archiving?.startedAt);
        if (!sv.ok) why = sv.error;
        else reopen = { fillMs: rest.fillMs, sheetOid: staged.oid, sheet: sheetName };
      }
    }
    /*
     * ⚠️ 2026-10-09 (засвар 5): ҮЛДЭГДЭЛ ХАДГАЛАГДААГҮЙ бол «Шилжүүлсэн» БОЛГОХГҮЙ (`hold` → `archiveSubmission`
     *    `ok:false` → `apply` хяналтын мөрийг ЭЦСИЙН шатанд үлдээнэ). Урьд нь зөвхөн анхааруулаад шилжүүлдэг тул
     *    гүйцэтгэгчийн шинэ нэмэлт ямар ч хяналтын тойрогт ороогүй, хэн ч батлахгүй үлддэг байв. Мөр тэмдгээ
     *    дамжуулаагүй (хуучин таб) бол энэ хөтчид «хаагдаагүй нэмэлт» тэмдэг (`UNCLOSED_LS`) — дахин батлалт
     *    архивласан хэсгийг дахин нэмэхгүй. Буцаалт ч хаалттай (`apply`-ийн эцсийн шатны шалгуур).
     */
    if (why) {
      if (!(cur2.ok && cur2.sub?.payload.archiving)) unclosedSet(subOid, { at: staged.at });
      hold = tr('Архивт бичигдсэн, гэвч батлах явцад гүйцэтгэгч дахин илгээсэн тул шинэ илгээлтээс архивлагдсан нэмэлтийг хасаж хадгалж чадсангүй ({0}). Ажлыг «Шилжүүлсэн» болгосонгүй — эцсийн шатанд үлдлээ; агуулгыг дахин уншиж батална уу (буцааж болохгүй).', why);
    }
    if (emptyW) {
      /* ⚠️ 2026-10-11 (аудит №7): хаагдаагүй тэмдэг (дахин батлалт архивласан хэсгийг давхар нэмэхгүй) */
      unclosedSet(subOid, { at: staged.at });
      warns.push(tr('Батлах явцад гүйцэтгэгч дахин илгээсэн боловч агуулга нь архивласнаас ялгаагүй — илгээлтийг хааж чадсангүй, агуулгагүй үлдэгдэл бичсэнгүй; энэ илгээлтийг ДАХИН БАТЛАХГҮЙ байна уу (нэмэлт давхар орно).'));
    } else warns.push(why
      ? tr('Батлах явцад гүйцэтгэгч дахин илгээсэн — өмнөх агуулга архивт орлоо, гэвч шинэ илгээлтээс архивлагдсан нэмэлтийг хасч чадсангүй ({0}). ДАХИН БАТЛАХААС ӨМНӨ шалгана уу — нэмэлт давхар орох эрсдэлтэй.', why)
      : tr('Батлах явцад гүйцэтгэгч дахин илгээсэн — өмнөх агуулга архивт орлоо; архивлагдсан нэмэлтийг шинэ илгээлтээс хасч, зөвхөн шинэ нэмэлт хянагдахаар үлдлээ.'));
  } else if (cl.changed)
    warns.push(tr('Батлах явцад гүйцэтгэгч дахин илгээсэн — өмнөх агуулга архивт орлоо, шинэ агуулга илгээлтэд нээлттэй үлдлээ. Гүйцэтгэгчээр дахин илгээүүлж хянуулна уу.'));
  return { warns, ...(reopen ? { reopen } : {}), ...(hold ? { hold } : {}) };
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
   * ⚠️ 2026-10-01: одоо `"<oid>|<sid>|<блок>"` (`hyanaltOkCells.toOkRefs`) — мөрийн
   *    тогтвортой түлхүүр; `okCellsPatch` `{v:2,c:[…]}` болгож бичнэ.
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
   * ⚠️ 2026-10-06: хөтөчид `currentUser()`-тэй ЗӨРВӨЛ татгалзана (`authz`-ийн ⚠️).
   */
  me?: string;
  /**
   * ЭРХИЙН ШАЛГУУРЫГ ТОЙРУУЛАХ — ЗӨВХӨН нэвтрэлт унтраалттай (хөгжүүлэлт)
   * эсвэл админ шатаа ил сонгосон үед (`resolveFlowStage.canPick`).
   * ⚠️ Анхдагч нь `false` (fail-closed): дуудагч ил хүсэх ёстой.
   * ⚠️ 2026-10-06: хүссэн ч хөтөчид ЗӨВХӨН нэвтрэлт унтраалттай / хатуу `super` үед
   *    үйлчилнэ (`authz` өөрөө тооцно).
   */
  bypass?: boolean;
}): Promise<Result> {
  const returning = a.decision === DECISION.return;
  /* ⚠️ 2026-10-12 (R1): баганын уртаар ТАСЛАНА (`reasonMax`) — урт шалтгаан (`badText` 12 нүд залгадаг)
     256 тэмдэгтийн баганаас хэтэрч `applyEdits` бүх шийдвэрийг унагадаг байв. */
  const reason = clip((a.reason ?? '').trim(), await reasonMax(a.stage));
  // ⚠️ Шалтгаангүй буцаалт нь хяналтын бүртгэлийг утгагүй болгоно
  if (returning && !reason) return { ok: false, error: tr('Буцаах шалтгаанаа бичнэ үү') };

  /* ⚠️ 2026-10-12 (дарааллын аудит): шатны огноо · лог · `approvedAt` · тэмдэг бүгд СЕРВЕРИЙН цагаар
     (`serverClock`-ийн ⚠️) — синк кэштэй (10 мин), унавал `Date.now()` (хуучин зан). */
  await syncServerClock();
  const t = serverNow();
  const attrs: Attrs = { [HYANALT.oid]: a.oid };
  /*
   * ⚠️ ЗӨВШӨӨРСӨН НҮДНИЙ ЖАГСААЛТ — шатнаас ҮЛ ХАМААРАН нэг талбарт.
   *    Буцаагдсан гүйцэтгэгч «аль нүд ногоон, аль нь улаан» гэдгийг
   *    ЗӨВХӨН эндээс мэднэ (`hyanalt.F.okCells`-ийн ⚠️).
   * ⚠️ `undefined` бол хөндөхгүй — хуучин шатны зөвшөөрөл алдагдахгүй.
   * ⚠️ 2026-09-23 (#16): талбар үйлчилгээнд байхгүй бол БИЧИХГҮЙ, `okWarn`-аар
   *    ил хэлнэ (`okCellsPatch`).
   */
  /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): ЗӨВШӨӨРӨХ замд `strict: false` — уртаас хэтэрвэл талбарыг орхиж `warn`
     (`okCellsPatch`-ийн ⚠️); буцаалтад хатуу зогсолт хэвээр. */
  const okp = await okCellsPatch(a.okCells, returning);
  /* ⚠️ 2026-10-12 (R1): жагсаалт баганад багтахгүй — унах бичилт илгээхгүй (буцаалт) */
  if (okp.error) return { ok: false, error: okp.error };
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
      /* ⚠️ 2026-10-13: ЭНЭ табын батлалт — гинж өөрөө хүчингүй болгоно; харагч давхар ачаалахгүй (`SEEN_DONE`) */
      SEEN_DONE.add(a.oid);
    }
  }

  /* ⚠️ 2026-10-12 (дарааллын аудит): ЭЦСИЙН ШАТНЫ ГИНЖ (архив → төлөв → нэгтгэл → IPC → markRegistered) нэг
     `batchInvalidate` бүлэгт — `HYANALT` · `BAGTS_*` · `BAGTS_NEGTGEL` · `HO_IPC`-ийн 5–7 хүчингүй болголт
     React-д НЭГ удаа мэдэгдэнэ (кэш өөрөө ШУУД хаягдана — `dataBus.batchInvalidate`-ийн ⚠️). Дунд шатанд
     нэг л хүчингүй болголт тул нөлөөгүй. Доторх `return`-ууд бүлгээс гарч `apply`-ийн үр дүн болно. */
  try {
    return await batchInvalidate(async (): Promise<Result> => {
    const cur = await liveRow(a.oid);
    if (!cur || cur[F.status] !== REVIEW_STATUS[a.stage]) {
      emit();
      return { ok: false, error: STALE() };
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
      /* ⚠️ 2026-10-06 (аудит #6): зөвхөн ЗӨВШӨӨРӨХ чиглэлд өмнөх шатны хүнийг тулгана —
         буцаалт ажлыг батлалтаас ХОЛДУУЛДАГ тул давхар үүргийн эрсдэлгүй. */
      /* ⚠️ 2026-10-09 (R5): лог талбар алга бол `''` — `authz` нэрээр нөөц шалгалт хийнэ */
      /* ⚠️ 2026-10-09 (аудит): `who` нь нэвтэрсэн хэрэглэгчийнх байх ёстой (`whoDeny`-ийн ⚠️) — R5 нөөц
         шалгалт ба `SF[шат].who` хоёулаа энэ утгад тулгуурладаг тул `authz`-ээс ӨМНӨ. Супер/дев ч шалгагдана:
         `bypass` нь шат/багцын хүрээг чөлөөлдөг, хүний нэрийг биш. */
      /* ⚠️ 2026-10-09 (аудит №2): ДАРААЛАЛ — эхлээд ЛОКАЛ `authz` (томилгоо · шат · зөвхөн харах · хүрээ),
         ДАРАА НЬ сүлжээний хоёр уншилт (`whoDeny` → `community/self`, `submittersFor` → илгээлт). Урьд нь
         томилогдоогүй/зөвхөн харах хэрэглэгч хоёр дэмий хүсэлт илгээж, уншилт унавал «эрхгүй»-н оронд
         төөрөгдүүлэх уншилтын алдаа авдаг байв. Эцсийн шийдвэр fail-closed хэвээр: сүлжээний шалгалтын
         дараа `authz`-ийг илгээгчдийн жагсаалттай БҮТЭН дахин дуудна (локал хэсэг нь хямд, идемпотент). */
      const pre = authz(a.stage, a.me, String(cur[F.bagts] ?? ''), a.bypass === true, returning ? undefined : (cur[F.history] ?? ''), { row: cur, who: a.who });
      if (pre) { emit(); return { ok: false, error: pre }; }
      const wd = await whoDeny(a.who);
      if (wd) { emit(); return { ok: false, error: wd }; }
      /* ⚠️ 2026-10-09 (аудит): инженер шатанд ЗӨВШӨӨРӨХ үед илгээгчийг тулгана (`authz.submitters`) —
         буцаалтад биш (аудит #6-ийн дүрэмтэй ижил: буцаалт ажлыг батлалтаас холдуулдаг). */
      const subr: Awaited<ReturnType<typeof submittersFor>> = returning ? { ok: true } : await submittersFor(a.stage, cur, a.me, a.bypass === true);
      if (!subr.ok) return { ok: false, error: subr.error };
      const deny = authz(a.stage, a.me, String(cur[F.bagts] ?? ''), a.bypass === true, returning ? undefined : (cur[F.history] ?? ''), { row: cur, who: a.who }, subr.list);
      if (deny) { emit(); return { ok: false, error: deny }; }
    }
    /*
     * ⚠️ 2026-10-06 (аудит #1): ЭЦСИЙН ШАТНЫ БУЦААЛТ — АРХИВ АЛЬ ХЭДИЙН БИЧИГДСЭН БОЛ ХОРИГЛОНО.
     *    Батлалтад архив (`archiveSubmission`) → илгээлт `done|` хаагдсаны ДАРАА хяналтын
     *    мөрийн `updateRows` унавал мөр «Газрын дарга хянаж байна» хэвээр үлдэж, дарга
     *    «Буцаах» дарвал ажил хэлтсийн даргад буцдаг атлаа тоо нь `Bagts_*` архивт сууж
     *    үлддэг байв (`retryPendingRegistrations` зөвхөн «Шилжүүлсэн»-ийг хардаг). Одоо
     *    илгээлт `done|` / `archiveOid`-тай эсвэл энэ хөтчид архивлагдсан бол БУЦААХГҮЙ —
     *    дахин «Батлах» нь `done|` замаар idempotent тул зөвхөн мөрийг «Шилжүүлсэн» болгоно.
     * ⚠️ Уншиж чадаагүй бол буцаахгүй (fail-closed) — дахин оролдоно.
     */
    /** ⚠️ 2026-10-12 (A1): буцаалтын өмнө тасарсан жааз цэвэрлэгдсэн бол — доорх `warns`-д */
    let retCleanWarn = '';
    if (returning && !nextReview(a.stage)) {
      const { readSubmissionByOid } = await import('./submission');
      const sr = await readSubmissionByOid(Number(cur[F.sheetOid]));
      if (!sr.ok) return { ok: false, error: sr.error };
      const s0 = sr.sub;
      if (s0 && (s0.done || s0.payload.archiveOid != null || archivedGet(`${cur[F.sheetOid]}:${s0.at}`) != null)) {
        emit();
        return { ok: false, error: ARCHIVED_NO_RETURN() };
      }
      /*
       * ⚠️ 2026-10-09: ШИЙДЭГДЭЭГҮЙ «АРХИВЛАЖ БАЙНА» ТЭМДЭГ / ХААГДААГҮЙ НЭМЭЛТ байхад ч БУЦААХГҮЙ (ARCHIVED_NO_RETURN).
       *    Урьд нь зөвхөн `done|`/`archiveOid`/энэ хөтчийн `archivedGet`-ийг шалгадаг тул ӨӨР хөтчид архив бичигдээд
       *    хаалт унасан бол дарга буцааж, гүйцэтгэгч дахин илгээхэд архивласан нэмэлт ДАХИН нэмэгддэг байв.
       *    Тэмдэг ШИНЭ (явж буй) → татгалзана; хуучирсан → архивыг шалгана: буусан/тодорхойгүй → татгалзана,
       *    буугаагүй → буцааж болно. Шалгаж чадахгүй → татгалзана (fail-closed).
       */
      if (s0 && !s0.done) {
        const am = s0.payload.archiving;
        const uc = s0.payload.mode === 'inc' && s0.payload.residual !== true ? unclosedGet(Number(cur[F.sheetOid])) : undefined;
        if (uc && s0.at >= uc.at) { emit(); return { ok: false, error: ARCHIVED_NO_RETURN() }; }
        if (am) {
          const { markFresh } = await import('./submission');
          if (markFresh(am)) { emit(); return { ok: false, error: ARCHIVED_NO_RETURN() }; }
          let hit: number | null | 'ambiguous';
          try { hit = await probeArchivedFrame(s0.payload.pkgKey, am); } catch (e) {
            return { ok: false, error: MARK_UNRESOLVED(String((e as Error)?.message ?? e)) };
          }
          if (hit != null) { emit(); return { ok: false, error: ARCHIVED_NO_RETURN() }; }
          /* ⚠️ 2026-10-12 (A1): хуучирсан тэмдэг, жааз БУУГААГҮЙ — гэвч тасарсан ХАГАС жааз архивт үлдсэн байж
             болно. Урьд нь шууд буцаадаг тул хагас жааз `loadRows`-ийн F1 шалгуурыг унагааж багцыг (бөглөх ·
             хянах · батлах) мөнхөд хаадаг байв — `cleanupTruncatedFrame` зөвхөн `archiveSubmission` дотор
             (тэмдэг байхад) ажилладаг, буцаалтын дараа тэр зам хэзээ ч хүрэхгүй. Одоо буцаахаас ӨМНӨ
             цэвэрлэнэ; танигдахгүй/устгагдахгүй бол БУЦААХГҮЙ (fail-closed, админ шалгана). */
          const cl = await cleanupTruncatedFrame(s0.payload.pkgKey, am);
          if ('error' in cl) { emit(); return { ok: false, error: MARK_UNRESOLVED(cl.error) }; }
          if (cl.deleted > 0) retCleanWarn = tr('Өмнөх батлалтын тасарсан {0} мөрийг архиваас цэвэрлэв.', String(cl.deleted));
        }
      }
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
    /** ⚠️ Архивлалтын анхааруулга (алгассан нүд · хаалтын CAS) — доор `warns`-д */
    let archWarn = '';
    /** ⚠️ Үлдэгдэл нэмэлтийн шинэ тойрог — мөр «Шилжүүлсэн» болсны ДАРАА (`Archived.reopen`) */
    let reopen: { fillMs: number; sheetOid: number; sheet: string } | undefined;
    /** ⚠️ 2026-10-12 (A5): архивт юу ч бичигдээгүй (`Archived.empty`) — нэгтгэл/IPC-д бүртгэхгүй */
    let nothingArchived = false;
    let regSkipWarn = '';
    if (registerNow) {
      /* ⚠️ 2026-10-09 (R3): `subAt`-ийг архивлалт руу ДАМЖУУЛНА — тэнд дахин уншсан агуулгыг тулгана */
      const ar = await archiveSubmission(cur, a.subAt);
      if (!ar.ok) {
        if (ar.contentChanged) { emit(); return { ok: false, error: ar.error, contentChanged: true }; }
        return { ok: false, error: ar.error };
      }
      archiveOid = ar.archiveOid;
      archivedDay = ar.day;
      archivedPkg = ar.pkgKey;
      if (ar.warn) archWarn = ar.warn;
      reopen = ar.reopen;
      nothingArchived = ar.empty === true || ar.archiveOid === 0;
      /* ⚠️ 2026-10-12 (A5): жааз бичигдсэн атлаа дугаар нь ирээгүй (`firstOid` null) — бүртгэх боломжгүйг ИЛ хэлнэ
         (агуулгагүй үлдэгдэлд биш — тэнд бүртгэх зүйл үнэхээр алга) */
      if (ar.archiveOid === 0 && ar.empty !== true)
        regSkipWarn = tr('Батлагдаж архивт бичигдлээ, гэхдээ нэгтгэлийн хүснэгтэд бүртгэгдсэнгүй ({0}). Дашбоардын багцын муруйд энэ өдөр харагдахгүй — админд мэдэгдэнэ үү.', 'archiveOid = 0');
      /* ⚠️ Архивласны ДАРАА мөрийн төлөвийг ДАХИН ШАЛГАХГҮЙ (2026-09-17-ны
         аудит): «буцаах» ба «батлах» зэрэг дарагдсан үед жааз архивт
         бичигдчихсэн байхад STALE-ээр зогсвол өнчин жааз үлдэж, нэгтгэл/IPC
         хэзээ ч ажиллахгүй. Архив бичигдсэн бол хяналтын мөр ЗААВАЛ түүнийг
         дагана — «шилжүүлсэн» нь өгөгдөлтэйгээ нийцнэ. Давхар-батлах уралдаанд
         `archiveSubmission` `done|`-оор idempotent тул хоёр дахь жааз үүсэхгүй. */
    }

    /* ⚠️ 2026-10-01: ШИЙДВЭРИЙН ЛОГ — талбар байвал энэ шийдвэрийг `cur`-ийн лог дээр
       НЭМНЭ (`historyPatch`). Агшин нь шатны огнооны талбартай ЯГ ижил `t` — түүх
       тэр хоёрыг тулгаж дарагдсан нэрийг сэргээнэ (`Guitsetgel.stepsOf`). */
    /*
     * ⚠️ 2026-10-06 (аудит #5): ЭЦСИЙН ШАТАНД мөрийг `updateRows`-ийн ЯГ ӨМНӨ ДАХИН уншина.
     *    Урьд нь лог архивлалтаас ӨМНӨХ `cur`-аас бодогддог тул архив бичигдэх хооронд өөр
     *    дарга «Буцаах» дарсан бол түүний буцаалт (лог · шалтгаан · огноо) ЧИМЭЭГҮЙ дарагддаг
     *    байв. Архив бичигдсэн тул мөр түүнийг ЗААВАЛ дагана (дээрх ⚠️) — гэхдээ логийг шинэ
     *    хуулбараас бодож, шатны буцаалтын шалтгаан/огноог цэвэрлэж, ИЛ анхааруулна.
     *    Уншилт унавал `cur` (хуучин зан төлөв).
     */
    let histBase: unknown = cur[F.history];
    let overrideWarn = '';
    /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): хоёр газрын дарга ЗЭРЭГ батлахад хоёр дахь нь `fresh` аль хэдийн
       «Шилжүүлсэн» байхад ч `updateRows` хийж түрүүлсний нэр · огноо · `Zovshoorson_nud`-ийг дардаг байв. Одоо
       `updateRows`-ийг алгасаж ил хэлнэ; нэгтгэл/IPC-ийн алхам хэвээр (idempotent). */
    let alreadyTransferred = false;
    let writeBase = cur;
    if (registerNow) {
      try {
        const fresh = await liveRow(a.oid);
        if (fresh) {
          writeBase = fresh;
          histBase = fresh[F.history];
          const fs0 = String(fresh[F.status] ?? '');
          if (fs0 === STATUS.transferred) {
            alreadyTransferred = true;
            overrideWarn = tr('Энэ ажлыг өөр таб эсвэл хэрэглэгч аль хэдийн «Шилжүүлсэн» болгосон байсан — хяналтын мөрийг дахин бичсэнгүй, нэгтгэлийн бүртгэлийг л шалгав.');
          } else if (fs0 !== REVIEW_STATUS[a.stage]) {
            const nm = String((fresh as Record<string, unknown>)[sf.who] ?? '').trim();
            overrideWarn = tr('Таныг батлах хооронд {0} энэ ажлыг буцаасан байсан — архив аль хэдийн бичигдсэн тул буцаалт дарагдаж, ажил «Шилжүүлсэн» боллоо.', nm || tr('өөр хянагч'));
          }
        }
      } catch (e) { console.warn('[selbe] эцсийн батлалтын өмнөх дахин уншилт унав:', e); }
      attrs[sf.reason] = '';
      attrs[sf.returned] = null;
    }
    Object.assign(attrs, await historyPatch(histBase, {
      stage: a.stage, who: a.who, at: t, act: returning ? 'return' : 'approve',
      ...(returning ? { reason } : {}),
    }, meOf(a.me)));

    /* ⚠️ 2026-09-30: ДУНД ШАТАНД бичихийн ЯГ ӨМНӨ дахин шалгана (`movedSince`-ийн ⚠️).
       Эцсийн шатанд ХИЙХГҮЙ — архив аль хэдийн бичигдсэн бол мөр түүнийг ЗААВАЛ
       дагана (дээрх «Архивласны ДАРАА … ДАХИН ШАЛГАХГҮЙ» ⚠️); тэнд
       `archiveSubmission` өөрөө бичихийн өмнө шалгадаг. */
    if (!registerNow) {
      const moved = await movedSince(a.oid, cur, a.stage);
      if (moved) { emit(); return { ok: false, error: moved }; }
    }

    try {
      /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): өөр таб аль хэдийн шилжүүлсэн бол дарж бичихгүй (дээрх `alreadyTransferred`) */
      if (!alreadyTransferred) await updateDecision(writeBase, attrs);
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
      /* ⚠️ 2026-10-09 (аудит): дунд шатанд хариу АЛДАГДСАН бол энгийн алдаа биш — үр дүн тодорхойгүй,
         жагсаалтыг дахин ачаална (`lostResult`-ийн ⚠️). Тодорхой татгалзал бол урьдын адил. */
      if (!registerNow) {
        if (e instanceof HyanaltConflict) { await refreshQuiet(); return fail(e); }
        if (lostWrite(e)) return await lostResult(e);
        throw e;
      }
      let landed = false;
      try { landed = (await liveRow(a.oid))?.[F.status] === STATUS.transferred; } catch { landed = false; }
      /* ⚠️ 2026-10-06 (аудит #1): архив бичигдсэн тул ерөнхий алдаа БИШ — «дахин Батлах,
         буцаахгүй» гэж ил хэлнэ (буцаалт нь дээрх шалгуураар хаалттай). */
      if (!landed) {
        emit();
        return { ok: false, error: `${ARCHIVED_NO_RETURN()} (${String((e as Error)?.message ?? e)})` };
      }
    }
    /** Хагас амжилтын анхааруулгууд — нэгтгэл · IPC · `Zovshoorson_nud` */
    const warns: string[] = [];
    if (archWarn) warns.push(archWarn);
    if (retCleanWarn) warns.push(retCleanWarn);
    if (regSkipWarn) warns.push(regSkipWarn);
    /* ⚠️ 2026-10-06 (аудит #5): өөр хянагчийн буцаалт дарагдсан бол ил хэлнэ */
    if (overrideWarn) warns.push(overrideWarn);
    /*
     * ⚠️ ҮЛДЭГДЭЛ НЭМЭЛТИЙН ШИНЭ ТОЙРОГ (2026-09-25 аудит). Мөр «Шилжүүлсэн» болсны
     *    ДАРАА л — `openReviewRow` тэр `sheetOid`-ийн нээлттэй мөрийг олохгүй тул
     *    ergelt+1 шинэ мөр үүсгэнэ; урьд нь `residual` мөр хяналтын мөргүй өнчирч,
     *    хэн ч батлахгүй, FillNew ч харуулахгүй байв. Унавал батлалт унахгүй — ил хэлнэ
     *    (гүйцэтгэгч дахин илгээхэд `submitForReview` өөрөө тойрог нээнэ).
     */
    if (reopen) {
      try {
        const { submitForReview } = await import('./hyanaltSubmit');
        const rv = await submitForReview(String(cur[F.bagts] ?? ''), reopen.fillMs, reopen.sheetOid, reopen.sheet);
        if (rv.ok) warns.push(tr('Үлдэгдэл нэмэлт шинэ хяналтын тойрогт орлоо ({0}).', rv.id));
        else warns.push(tr('Үлдэгдэл нэмэлтэд шинэ хяналтын тойрог нээгдсэнгүй ({0}) — гүйцэтгэгчээр дахин илгээүүлнэ үү.', rv.error));
      } catch (e) {
        warns.push(tr('Үлдэгдэл нэмэлтэд шинэ хяналтын тойрог нээгдсэнгүй ({0}) — гүйцэтгэгчээр дахин илгээүүлнэ үү.', String((e as Error)?.message ?? e)));
      }
    }
    /* ⚠️ 2026-10-12 (A5): `archiveOid` 0 (бичсэн жааз алга) бол нэгтгэл · IPC алгасна — `registerApproved(багц, 0)`
       хэзээ ч бүтэхгүй (3 оролдлого + худал анхааруулга). Архивын анхааруулга (`archWarn`) шалтгааныг хэлнэ. */
    if (registerNow && !nothingArchived) {
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
       * гүйцэтгэл бөглөгдөхөд нэмэгдэх ёстой». ЗӨВХӨН энд — 6 шатын
       * (`REVIEW_STAGES`; 2026-10-09 аудит №6 — урьд «4 шат» гэж бичигдсэн байв)
       * хяналт дуусаж архивт бичигдсэний ДАРАА. Батлагдаагүй бөглөлтөөс
       * IPC үүсгэвэл хянагч буцаахад ХУДАЛ IPC үлдэнэ.
       *
       * ⚠️ НЭГ БАГЦ · НЭГ АГШИН (ӨДӨР) = НЭГ МӨР — `ipcAuto.ts`-ийн толгойн ⚠️ (хэрэглэгчийн 2026-09-10-ны
       * засвар: «гүйцэтгэл орсон болгоор ipc», сард нэгтгэхгүй). Ижил өдөр дахин батлагдвал тэр мөр
       * ШИНЭЧЛЭГДЭНЭ (`ipcAuto.planAuto`), шинэ мөр үүсэхгүй.
       * ⚠️ 2026-10-12 (дарааллын аудит): урьд нь энд «нэг багц · нэг сар» гэж ХУУЧИРСАН тайлбар байв —
       *    `ipcAuto`-гийн санаатай шийдвэртэй (өдрийн грейн) зөрж байсан тул ЗӨВХӨН тайлбарыг зассан;
       *    түлхүүрийг сар болгох нь тэр шийдвэрийг эргүүлэх тул хийгээгүй.
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
          } else if (ipcSkipIsFailure(ipc)) {
            /* ⚠️ 2026-09-25: `skip` нь `ok:true`-гаар ирдэг ч `no-data`-гаас бусад
               шалтгаан (`no-pkg` · `no-code` · `bad-day`) нь IPC мөр ҮҮСЭЭГҮЙ
               тохиргооны алдаа — амжилт гэж үзвэл `markRegistered` тэмдгийг
               арилгаж, тэр сарын IPC мөнхөд дутуу үлдэнэ. */
            console.warn('[selbe] IPC мөр алгасагдлаа:', ipc.why);
            ipcErr = tr('IPC алгасагдлаа: {0}', String(ipc.why ?? ''));
          }
          /* ⚠️ 2026-10-09 (F6): олон гэрээ ялгагдахгүй таарсан — аль гэрээнд холбосныг ИЛ хэлнэ */
          if (ipc.ok && ipc.warn) warns.push(ipc.warn);
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
    /* ⚠️ 2026-09-29 (аудит 10): шийдвэр · архив · нэгтгэл · IPC бүгд бүтсэний ДАРААХ
       дахин ачаалалт унавал `{ok:false}` буцаж хянагч улаан алдаа хараад дахин
       оролдож STALE авдаг байв — уншилтын алдаа батлалтыг унагахгүй. */
    /* 2026-09-23 (#16): `Zovshoorson_nud` талбар алга байсан бол шар мөрөөр хэлнэ */
    if (okWarn) warns.push(okWarn);
    /* ⚠️ 2026-10-04: анхааруулгыг `refresh`-ээс ӨМНӨ store-д тавина — `refresh` мөрийг
       «минийх»-ээс «бусад» руу зөөж `Item`-ийг дахин mount хийдэг тул түүний локал
       `warn` state алга болж, алгассан нүд · «ДАХИН БАТЛАХГҮЙ» · нэгтгэл/IPC-ийн
       алдаа ХЭЗЭЭ Ч харагддаггүй байв. Одоо `useApplyWarns` хуудасны дээд хэсэгт. */
    if (warns.length) {
      const so = Number(cur[F.sheetOid]);
      putWarn(Number.isInteger(so) && so > 0 ? so : a.oid, {
        text: warns.join(' · '),
        ajil: String(cur[F.ajil] ?? ''),
        bagts: String(cur[F.bagts] ?? ''),
        at: Date.now(),
      });
    }
    try { await refresh(); } catch (e) { console.warn('[selbe] шийдвэрийн дараах дахин ачаалалт унав:', e); }
    return warns.length ? { ok: true, warn: warns.join(' · ') } : { ok: true };
    });
  } catch (e) { return fail(e); }
}

/** Сешнд нэг л удаа оролдсон илгээлтүүд — давтан дуудлагад дахин ажиллуулахгүй */
const SWEPT = new Set<number>();
let sweeping = false;

/**
 * ⚠️ 2026-10-06 аудит: «Дахин оролдох» — сешний нэг удаагийн хамгаалалтыг (`SWEPT`) цэвэрлэнэ.
 * Урьд нь `failed` тоог дуудагч хаядаг, дахин оролдох зам ч байхгүй тул нэгтгэл/IPC-гүй өдөр
 * F5 хүртэл чимээгүй үлддэг байв. Амжилттай нөхөгдсөн нь `markRegistered`-ээр жагсаалтаас
 * гарсан тул дахин ажиллахгүй — зөвхөн хүлээгдэж буй (унасан) нь дахин оролдогдоно.
 */
export function resetRegSweep(): void {
  SWEPT.clear();
}

/** ⚠️ 2026-10-12 (дарааллын аудит, №5): хүлээгдэж буй бүртгэлийг нөхөж болох ДЭЭД шатнууд — `Guitsetgel`-ийн sweep-тэй нэг эх */
export const UPPER_SWEEP: readonly ReviewStage[] = ['director', 'head', 'chief'];

/**
 * БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ БАТЛАЛТУУДЫГ НӨХНӨ (2026-09-25 аудит).
 *
 * ⚠️ ЯАГААД: эцсийн батлалтад `updateRows` → `registerApproved` →
 *    `syncIpcFromFill` дараалан явдаг; таб энэ хооронд хаагдвал мөр
 *    «Шилжүүлсэн» болсон тул дахин батлах зам хаалттай, тэр өдөр нэгтгэл/IPC-гүй
 *    МӨНХӨД үлддэг байв. `done|` payload-ын `regPending` тэмдэг үүнийг барина.
 * ⚠️ «Шилжүүлсэн» мөр — ДЭЭД шатны (`director` · `head` · `chief`) эрхтэй хүн (`authz`); бусдын бичилт
 *    эрхгүйгээр унах байсан. `archiveSubmission` нь `done|` замаар ЮУ Ч бичихгүй (idempotent),
 *    `registerApproved` (багц·огноо) ба `syncIpcFromFill` (багц·өдөр — `ipcAuto`-гийн ⚠️) хоёулаа idempotent.
 * ⚠️ 2026-10-12 (дарааллын аудит, №5): урьд нь ЗӨВХӨН эцсийн шат (газрын дарга) / супер нөхдөг байв —
 *    хэлтсийн дарга · ерөнхий менежер хуудас нээхэд хүлээгдэж буй бүртгэл хэвтсээр, шар мөр ч тэдэнд
 *    харагддаггүй. Нэгтгэл/IPC нь ШИЙДВЭР биш (архив аль хэдийн суусан) тул дээд гурван шатны аль нэгэнд
 *    томилогдсон хүн нөхөж болно (`Guitsetgel`-ийн `UPPER_SWEEP` ижил жагсаалт).
 * ⚠️ 2026-10-12 (дарааллын аудит, №1): АРХИВ СУУСАН Ч ТӨЛӨВ БИЧИГДЭЭГҮЙ МӨР. `apply`-д архив → `done|`
 *    (`regPending`) хаагдсаны ДАРАА хяналтын мөрийн `updateRows` ТОДОРХОЙ татгалзвал мөр «Газрын дарга
 *    хянаж байна» хэвээр үлддэг; урьд нь энэ функц зөвхөн «Шилжүүлсэн»-ийг хайдаг тул тийм илгээлт
 *    `regPending`-тэйгээ мөнхөд үлдэж, дарга «Буцаах» ч (ARCHIVED_NO_RETURN) чадахгүй, дахин «Батлах»-аас
 *    өөр зам байгаагүй. Одоо `done|` илгээлттэй атлаа ЭЦСИЙН хянах шатанд (`REVIEW_STATUS.chief`) байгаа
 *    мөрийг ч хамруулна: ЭХЛЭЭД төлөвийг «Шилжүүлсэн» + газрын даргын шийдвэр/нэр/огноо (`approvedAt` нь
 *    `done|` payload-аас; нэр нь логийн сүүлийн `chief`-ийн зөвшөөрөл, байхгүй бол нөхөж буй хүн —
 *    `who`, лог дээр «нөхөлт» шалтгаантай) нөхөж бичээд, ДАРАА нь нэгтгэл/IPC. Төлөв нөхөх нь ЭЦСИЙН
 *    ШАТНЫ шийдвэр тул зөвхөн `chief`-ийн эрхтэй (эсвэл `bypass`) хүн хийнэ; бусад дээд шат зөвхөн
 *    «Шилжүүлсэн» мөрийг нөхнө. CAS: бичихийн ЯГ өмнө `liveRow` — өөр таб аль хэдийн «Шилжүүлсэн»
 *    болгосон бол бичихгүй, өөр төлөвт шилжсэн бол орхино (`apply`/`movedSince`-ийн дүрэм).
 * ⚠️ Алдаа нь чимээгүй (`console.warn`) — энэ нь нөхөх зам, хуудсыг унагахгүй.
 */
export async function retryPendingRegistrations(
  me: string | undefined,
  bypass: boolean,
  /** ⚠️ 2026-10-12 (№1): төлөв нөхөхөд бичигдэх дэлгэцийн нэр (лог · `SF.chief.who`) — өгөөгүй бол `me` */
  who?: string,
): Promise<{ done: number; failed: number }> {
  const out = { done: 0, failed: 0 };
  if (sweeping) return out;
  sweeping = true;
  /** ⚠️ 2026-10-12 (№1): төлөв нөхөгдсөн мөр байвал төгсгөлд жагсаалтыг дахин уншина */
  let fixed = 0;
  try {
    const { listRegPending, markRegistered } = await import('./submission');
    const pend = (await listRegPending()).filter((p) => !SWEPT.has(p.oid));
    if (!pend.length) return out;
    await syncServerClock();
    if (!loaded) await refresh();
    const final = REVIEW_STAGES[REVIEW_STAGES.length - 1];
    for (const sub of pend) {
      /* ⚠️ 2026-10-12 (№1): эхлээд «Шилжүүлсэн», үгүй бол эцсийн шатанд ГАЦСАН (хамгийн сүүлийн OID) мөр */
      const mine = ROWS.filter((r) => Number(r[F.sheetOid]) === sub.oid);
      let cur = mine.find((r) => r[F.status] === STATUS.transferred);
      const stuck = !cur;
      if (!cur) cur = mine.filter((r) => r[F.status] === REVIEW_STATUS[final]).sort((x, y) => y.__oid - x.__oid)[0];
      if (!cur) continue;
      const bagts = String(cur[F.bagts] ?? '');
      /* ⚠️ 2026-10-06 (аудит #2): `me`/`bypass` нь `authz` дотор `currentUser()`-ээр тулгагдана */
      /* ⚠️ 2026-10-12 (№5): дээд гурван шатны аль нэгэнд эрхтэй бол нөхнө; (№1) гацсан мөрийн төлөв нөхөх нь
         зөвхөн эцсийн шатны эрхээр */
      const canFinal = !authz(final, me, bagts, bypass);
      if (stuck ? !canFinal : UPPER_SWEEP.every((s) => authz(s, me, bagts, bypass))) continue;
      SWEPT.add(sub.oid);
      try {
        if (stuck) {
          /* ⚠️ 2026-10-12 (№1): CAS — бичихийн яг өмнө дахин уншина */
          const live = await liveRow(cur.__oid);
          if (!live) { out.failed += 1; continue; }
          const st = String(live[F.status] ?? '');
          if (st === STATUS.transferred) {
            cur = live;
          } else if (st !== REVIEW_STATUS[final]) {
            console.warn('[selbe] гацсан мөр өөр төлөвт шилжсэн — төлөв нөхөхгүй:', cur.__oid, st);
            out.failed += 1;
            continue;
          } else {
            const sf = SF[final];
            const at = Number.isFinite(sub.payload.approvedAt) ? Number(sub.payload.approvedAt) : serverNow();
            const logged = lastApproverName(live[F.history], final);
            const name = logged || (who ?? me ?? '').trim();
            /* ⚠️ 2026-10-13: ЭНЭ табын нөхөлт — харагч давхар ачаалахгүй (`SEEN_DONE`) */
            SEEN_DONE.add(cur.__oid);
            const fix: Attrs = {
              [HYANALT.oid]: cur.__oid,
              [sf.who]: name,
              [sf.decision]: DECISION.approve,
              [sf.reason]: '',
              [sf.returned]: null,
              [sf.sent]: at,
              [F.status]: STATUS.transferred,
              ...(await historyPatch(live[F.history], {
                stage: final, who: name, at: serverNow(), act: 'approve',
                reason: tr('Нөхөлт: архив суусан батлалтын төлөв бичигдээгүй байсныг нөхөв'),
              }, meOf(me))),
            };
            await updateDecision(live, fix);
            fixed += 1;
            cur = { ...live, ...fix } as Row;
          }
        }
        const ar = await archiveSubmission(cur);
        if (!ar.ok || !ar.pkgKey || !(ar.archiveOid > 0)) { out.failed += 1; continue; }
        const { registerApproved } = await import('./negtgelWrite');
        const r = await registerApproved(cur[F.bagts], ar.archiveOid, ar.pkgKey);
        let ipcOk = false;
        if (ar.day) {
          const { syncIpcFromFill } = await import('./ipcAutoWrite');
          const ipc = await syncIpcFromFill(cur[F.bagts], ar.day);
          /* ⚠️ 2026-09-25: `no-data`-гаас бусад `skip` нь амжилт БИШ (`ipcSkipIsFailure`) */
          ipcOk = ipc.ok && !ipcSkipIsFailure(ipc);
          if (ipc.ok && !ipcOk) console.warn('[selbe] IPC нөхөлт алгасагдлаа:', ipc.why);
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
    /* ⚠️ 2026-10-12 (№1): төлөв нөхөгдсөн бол жагсаалт шинэчлэгдэнэ (нэгтгэл/IPC унасан ч мөр «Шилжүүлсэн») */
    if (fixed > 0) await refreshQuiet();
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
  if (prev[F.status] !== want) { emit(); return { ok: false, error: STALE() }; }
  /* ⚠️ `apply`-тай ИЖИЛ шалгуур — дахин шалгалт нь мөрийг дээд шат руу
     дахин илгээдэг тул эрхийн ижил жинтэй (`hyanaltStore`-ийн authz). */
  {
    /* ⚠️ 2026-10-06 (аудит #6): «ok» (дээш илгээх) үед л өмнөх шатны хүнийг тулгана — `apply`-тай ижил */
    /* ⚠️ 2026-10-09 (R5): лог талбар алга бол `''` — `authz` нэрээр нөөц шалгалт хийнэ */
    /* ⚠️ 2026-10-09 (аудит): `apply`-тай ИЖИЛ — `who` нэвтэрсэн хэрэглэгчийнх (`whoDeny`-ийн ⚠️) */
    /* ⚠️ 2026-10-09 (аудит №2): `apply`-тай ИЖИЛ дараалал — локал `authz` эхэлж, сүлжээний уншилт дараа нь,
       эцэст нь илгээгчидтэй БҮТЭН `authz` (fail-closed) */
    const pre = authz(by, me, String(prev[F.bagts] ?? ''), bypass === true, verdict === 'ok' ? (prev[F.history] ?? '') : undefined, { row: prev, who });
    if (pre) { emit(); return { ok: false, error: pre }; }
    const wd = await whoDeny(who);
    if (wd) { emit(); return { ok: false, error: wd }; }
    /* ⚠️ 2026-10-09 (аудит): «ok» үед инженер шатанд илгээгчийг тулгана — `apply`-тай ижил */
    const subr: Awaited<ReturnType<typeof submittersFor>> = verdict === 'ok' ? await submittersFor(by, prev, me, bypass === true) : { ok: true };
    if (!subr.ok) return { ok: false, error: subr.error };
    const deny = authz(by, me, String(prev[F.bagts] ?? ''), bypass === true, verdict === 'ok' ? (prev[F.history] ?? '') : undefined, { row: prev, who }, subr.list);
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

  /* ⚠️ 2026-10-12 (дарааллын аудит): лог `at` · шатны огноо серверийн цагаар (`serverClock`-ийн ⚠️) */
  await syncServerClock();
  const t = serverNow();

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
    if (twin) { emit(); return { ok: false, error: STALE() }; }
    /* ⚠️ 2026-09-30: «ok» ЗАМД Ч бичихийн ЯГ ӨМНӨ дахин шалгана (`movedSince`-ийн ⚠️).
       Урьд нь зөвхөн «back» зам ба `apply`-д байсан: эхний `liveRow`-оос хойш
       (`subAt` уншилт г.м.) нөгөө данс «back» хийвэл хуучин мөр «Инженер буцаасан»
       болсон атлаа энэ зам ergelt+1 мөрийг «Менежер хянаж байна»-аар нэмж,
       гүйцэтгэгчид очсон буцаалт ЧИМЭЭГҮЙ дарагддаг (`groupWorks` шинэ мөрийг
       «одоогийн» болгоно); хоёулаа «ok» бол ижил тойрогтой ХОЁР мөр үүсдэг байв.
       `nextId()` ч ЭНЭ уншилтын шинэ `ROWS`-оос бодогдоно (доор). */
    {
      const moved = await movedSince(oid, prev, by);
      if (moved) { emit(); return { ok: false, error: moved }; }
    }

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
      /* ⚠️ 2026-10-01: ШИНЭ тойргийн лог нь ЭНЭ дахин шалгалтаас эхэлнэ — өмнөх
         үйл явдлууд хуучин мөрийн логт хэвээр (түүх тойрог бүрээр харуулдаг). */
      ...(await historyPatch('', { stage: by, who, at: t, act: 'recheck-ok' }, meOf(me))),
    };
    /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): ихэр олдсон ч устгал унасан — `ok:true` + ил анхааруулга (доорх R3) */
    let twinWarn = '';
    try {
      const res = await addRows([fresh]);
      /*
       * ⚠️ 2026-10-12 (R3): ДАВХАР ТОЙРОГ АРИЛГАХ (`hyanaltSubmit.submitForReview`-ийн 2026-10-05-ны загвар). Дээрх
       *    `twin`/`movedSince` шалгалт ба `adds` хоёрын завсарт хоёр хянагч ЗЭРЭГ «ok» дарвал хоёулаа давж ижил
       *    (илгээлт · багц · тойрог)-той ХОЁР мөр үүсч, бага OID-тай нь мөнхөд «… хянаж байна» төлөвт өнчирдөг байв.
       *    Бичсэний ДАРАА дахин уншиж БАГА OBJECTID-тай ихэр байвал ӨӨРИЙНХӨӨ мөрийг устгана — хоёр тал ижил
       *    дүрмээр шийддэг тул яг нэг нь (түрүүлж бичигдсэн) үлдэнэ. Шалгалт/устгал унавал шийдвэрийг унагахгүй.
       */
      const mine = addedOid(res);
      if (mine > 0) {
        let lost: Row | undefined;
        try {
          const so = Number(fresh[F.sheetOid]);
          lost = (await queryAll()).map(toRow)
            .filter((r) => r.__oid > 0 && r.__oid < mine && Number(r[F.sheetOid]) === so
              && r[F.bagts] === base[F.bagts] && Number(r[F.ergelt]) === ergelt)
            .sort((x, y) => x.__oid - y.__oid)[0];
        } catch (e) {
          console.warn('[selbe] дахин шалгалтын давхар тойргийн шалгалт унав:', e);
        }
        if (lost) {
          const nm = String((lost as Record<string, unknown>)[SF[by].who] ?? '').trim();
          if (await deleteRow(mine)) {
            await refreshQuiet();
            emit();
            return {
              ok: false,
              error: nm
                ? tr('Энэ ажлыг {0} таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.', nm)
                : tr('Энэ ажлыг өөр хэрэглэгч таныг шийдвэрлэж байх хооронд аль хэдийн шийдвэрлэсэн — таны шийдвэр хадгалагдсангүй, жагсаалт шинэчлэгдлээ.'),
            };
          }
          /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): ихэр олдсон ч ӨӨРИЙН мөрийг устгаж ЧАДААГҮЙ — урьд нь чимээгүй `ok:true`
             буцаж ижил тойргийн ХОЁР мөр үлддэг байв. Шийдвэр суусан тул унагахгүй, ихэр OID-ийг нэрлэж `warn`. */
          twinWarn = tr('Давхар тойрог үүслээ: {0} энэ ажлыг таныг шийдвэрлэж байх хооронд шийдвэрлэсэн (OBJECTID {1}) — таны мөрийг (OBJECTID {2}) устгаж чадсангүй, админаар нэгийг нь устгуулна уу.', nm || tr('өөр хянагч'), String(lost.__oid), String(mine));
        }
      }
      /* ⚠️ 2026-10-04: `nextId` max+1 уралдаан — бичсэний дараа давхардлыг засна (алдаа нь чимээгүй) */
      await ensureUniqueId(addedOid(res), String(fresh[F.id]));
    } catch (e) {
      /* ⚠️ 2026-10-09 (аудит): хариу алдагдсан бол шинэ тойрог суусан байж болно — тодорхойгүй + дахин ачаална */
      if (lostWrite(e)) return lostResult(e);
      return fail(e);
    }
    /* ⚠️ 2026-09-30: бичилт БҮТСЭНИЙ ДАРААХ дахин ачаалалтын алдаа шийдвэрийг
       унагахгүй — `apply`-ийн 2026-09-29-ний (аудит 10) ижил засвар. Урьд нь энд
       `{ok:false}` буцаж, хянагч улаан алдаа хараад дахин дарахад STALE авдаг
       (мөр аль хэдийн үүссэн) байв. */
    await refreshQuiet();
    return twinWarn ? { ok: true, warn: twinWarn } : { ok: true };
  }

  // ── Асуудал БАЙНА — компанид буцаана. Мөрийн ЭЦСИЙН үйлдэл тул шинэ мөр
  //    хэрэггүй; компани засаад илгээхэд `resubmit` шинийг үүсгэнэ.
  /* ⚠️ 2026-10-12 (R1): баганын уртаар таслана (`apply`-тай ижил — `reasonMax`) */
  const why = clip(reason.trim(), await reasonMax(by));
  // ⚠️ Шалтгаангүй буцаалт нь хүлээн авагчийг юу засахаа мэдэхгүй болгоно
  if (!why) return { ok: false, error: tr('Буцаах шалтгаанаа бичнэ үү') };

  /*
   * ⚠️ ЗӨВШӨӨРСӨН НҮДНИЙ ЖАГСААЛТ — `apply`-тай ИЖИЛ дүрэм. Энэ бол
   *    гүйцэтгэгч рүү буцах зам тул нүдний ялгаа ХАМГИЙН чухал нь энд.
   */
  /* ⚠️ 2026-09-23 (#16): талбар байхгүй бол бичихгүй, `warn`-аар ил хэлнэ. */
  /* ⚠️ 2026-10-12 (дарааллын аудит, №4): ДЭЭД ШАТНЫ `Zovshoorson_nud` нь АНХДАГЧ (seed). `okCells` `undefined`
     бол талбарыг ХӨНДӨХГҮЙ — дээд шатны буцаалтаар бичигдсэн зөвшөөрөл (`Guitsetgel.recheckSeed`-ээр дахин
     шалгагчид ногооноор харагдсан) гүйцэтгэгчид ЯГ ТЭР хэвээр очно. Урьд нь UI ҮРГЭЛЖ жагсаалт дамжуулдаг тул
     дахин шалгагч нэг ч нүд хөндөөгүй атлаа `seed` хуучирсан/мэдэхгүй (`resolveOk` → `unknown`) үед `[]`
     бичигдэж дээд шатны зөвшөөрөл дарагддаг байв. Дахин шалгагч ИЛ өөрчилсөн (`okOv`) бол л тэр жагсаалт;
     агуулга татагдаагүй бол R4-ийн дагуу `[]` хэвээр (UI шийднэ — `Guitsetgel`-ийн `recheckOkArg`). */
  const okp = await okCellsPatch(okCells);
  /* ⚠️ 2026-10-12 (R1): жагсаалт баганад багтахгүй — унах бичилт илгээхгүй */
  if (okp.error) return { ok: false, error: okp.error };
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
    /* ⚠️ 2026-10-01: ЭНЭ мөрөнд `by` шат 2 дахь удаагаа шийдэж байна (нэр дарагдана) —
       лог нь өмнөх нэрийг хадгална. */
    ...(await historyPatch(prev[F.history], { stage: by, who, at: t, act: 'recheck-back', reason: why }, meOf(me))),
  };

  /* ⚠️ 2026-09-30: бичихийн ЯГ ӨМНӨ дахин шалгана (`movedSince`-ийн ⚠️) — нөгөө данс
     энэ хооронд «ok» (шинэ тойрог) эсвэл «back» хийсэн бол дарж бичихгүй. */
  {
    const moved = await movedSince(oid, prev, by);
    if (moved) { emit(); return { ok: false, error: moved }; }
  }

  try {
    await updateDecision(prev, back);
  } catch (e) {
    /* ⚠️ 2026-10-09 (аудит): хариу алдагдсан бол буцаалт суусан байж болно — тодорхойгүй + дахин ачаална */
    if (e instanceof HyanaltConflict) { await refreshQuiet(); return fail(e); }
    if (lostWrite(e)) return lostResult(e);
    return fail(e);
  }
  /* ⚠️ 2026-09-30: дахин ачаалалтын алдаа бүтсэн буцаалтыг «амжилтгүй» болгохгүй (дээрх «ok»-ийн ⚠️) */
  await refreshQuiet();
  return okp.warn ? { ok: true, warn: okp.warn } : { ok: true };
}

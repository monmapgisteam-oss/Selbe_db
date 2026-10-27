'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — компани → талбайн инженер → менежер зөвшөөрлийн урсгал.
 *
 * ⚠️ НЭГ АЖИЛ = НЭГ МӨР. Хяналтын хүснэгтэд мөр бүр нэг ХЯНУУЛАЛТ тул нэг ажил
 * олон мөртэй байдаг. Тэдгээрийг тус тусад нь үзүүлбэл олон компанитай үед
 * жагсаалт уншигдахаа болино — `groupWorks()`-ээр бүлэглэж, хянуулалтууд нь дотор
 * нь түүх болж харагдана.
 *
 * ⚠️ КОМПАНИ МЕНЕЖЕРИЙГ ХАРАХГҮЙ. Компанийн хувьд урсгал нь «компани ↔ талбайн
 * инженер» хоёрхон шаттай. Менежерийн шийдвэр, нэр, буцаасан шалтгаан нь дотоод
 * хяналтын мэдээлэл.
 *
 * ⚠️ ШАТ = АДМИНЫ ТОМИЛГОО (`resolveFlowStage`, 2026-08-29). Урьд нь үүргээс
 * (`ROLE_STAGE[role]`) гаргадаг байсан тул урсгалын бус үүрэгтэй (beginner —
 * `selbe_et`, панелаас нэмсэн `tolovlolt`) хүнийг томилсон ч хуудас инженерийн
 * шат руу унаж «нэг ч багц хуваарилагдаагүй» гэдэг байв. Үүрэг нь зөвхөн кодын
 * хатуу super-ийг (сонгогч, бүх багц) ялгана.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { dateTime, fixCyr } from '@/lib/format';
import {
  DECISION, F, SF, missingDirectorFields, OWNER, STAGE_ORDER, STATUS,
  REVIEW_STAGES, REVIEW_STATUS, RETURNED_STATUS, nextReview,
  type ReviewStage, type Row, type Stage, type Status,
} from '@/lib/hyanalt';
import { useAuth } from '@/components/AuthGate';
import { flowAclReady, isViewOnly, resolveFlowStage, subscribeAcl } from '@/lib/guitsetgelAcl';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { obyemScope, subscribeObyemAcl } from '@/lib/obyemAcl';
import { initRemote } from '@/lib/permissions';
import { roleForUser } from '@/lib/services';
import { Sheet } from '@/modules/sheet/Sheet';
import { requestFillOpen } from '@/modules/sheet/FillNew';
import { navDirtyLabels, setNavDirty } from '@/lib/navGuard';
import { groupWorks, optionsOf, STAGE_LABEL, type Work } from '@/lib/hyanaltGroup';
import { apply, dismissApplyWarn, reasonMax, REASON_MAX, recheck, resetRegSweep, retryPendingRegistrations, selfBlocks, setDecisionErr, UPPER_SWEEP, useApplyWarns, useDecisionErr, useHyanaltRows } from '@/lib/hyanaltStore';
import { askConfirm } from '@/lib/confirm';
import { loadSubmission, type Change, type Submission } from '@/lib/hyanaltDetail';
import { attachHistory, isApproveAct, parseHistory } from '@/lib/hyanaltHistory';
import { parseOkCells, resolveOk, toOkRefs } from '@/lib/hyanaltOkCells';
import { TusulNegtgel } from '@/modules/TusulNegtgel';
import { Loading, userError } from '@/components/ui';
import s from './guitsetgel.module.css';

/* ⚠️ `STAGE_ORDER`-оос (2026-09-23, 6 шат; 2026-10-23-наас 7) — энд давхар жагсаавал зөрнө */
const STAGES: Stage[] = STAGE_ORDER;
/** ⚠️ 2026-10-06: буцаалт хүрэх ДООД шатны нэр (баталгаажуулах асуултад) — `STAGE_ORDER`-оос */
const lowerLabel = (x: Stage): string => STAGE_LABEL[STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(x) - 1)]];

/** Буцаасан төлөв → буцаасан ШАТ (компанид буцаасан = инженер) */
const RETURNER: Partial<Record<Status, ReviewStage>> = Object.fromEntries(
  (Object.keys(RETURNED_STATUS) as ReviewStage[]).map((s) => [RETURNED_STATUS[s], s]),
);

/*
 * ⚠️ ШАТНЫ НЭР ЭНД ТОДОРХОЙЛОГДОХГҮЙ — `lib/hyanaltGroup.ts`-д. Урьд нь
 * хоёр газар бичигдээд ЗӨРДӨГ байсан («Талбайн» ↔ «Хяналтын инженер»).
 * Дахин экспортлож байгаа нь ЗӨВХӨН хуучин импортуудыг эвдэхгүйн тулд.
 */
export { STAGE_LABEL };

/**
 * ⚠️ Төлөвийн УТГА нь өгөгдөл (ArcGIS-д монголоор хадгалагдана) — дэлгэцэд
 * гаргахдаа л орчуулна. Түлхүүр нь шууд бичигдсэн байх ёстой, эс бөгөөс
 * `i18n-extract` олохгүй.
 * ⚠️ 2026-10-23 (UX аудит R6): дэлгэцэд «Менежер» БИШ «Багцын ахлах инженер» — «Төлөвлөлтийн ахлах инженер»-тэй андуурагддаг байв.
 *    Өгөгдлийн утга (`STATUS.managerReview` = «Менежер хянаж байна») ХЭВЭЭР, зөвхөн шошго.
 */
const STATUS_LABEL: Record<Status, string> = {
  get [STATUS.engineerReview]() { return tr('Инженер хянаж байна'); },
  get [STATUS.engineerReturned]() { return tr('Инженер буцаасан'); },
  get [STATUS.managerReview]() { return tr('Багцын ахлах инженер хянаж байна'); },
  get [STATUS.managerReturned]() { return tr('Багцын ахлах инженер буцаасан'); },
  /* ⚠️ 2026-10-23: долоон шат — төлөвлөлтийн инженер */
  get [STATUS.plannerReview]() { return tr('Төлөвлөлтийн инженер хянаж байна'); },
  get [STATUS.plannerReturned]() { return tr('Төлөвлөлтийн инженер буцаасан'); },
  get [STATUS.directorReview]() { return tr('Төлөвлөлтийн ахлах инженер хянаж байна'); },
  get [STATUS.directorReturned]() { return tr('Төлөвлөлтийн ахлах инженер буцаасан'); },
  get [STATUS.headReview]() { return tr('Хэлтсийн дарга хянаж байна'); },
  get [STATUS.headReturned]() { return tr('Хэлтсийн дарга буцаасан'); },
  get [STATUS.chiefReview]() { return tr('Газрын дарга хянаж байна'); },
  get [STATUS.chiefReturned]() { return tr('Газрын дарга буцаасан'); },
  get [STATUS.transferred]() { return tr('Шилжүүлсэн'); },
};

/** Шатны ХЭНД илгээх үйл үг — зөвшөөрөх товч ба түүхийн мөрөнд */
const APPROVE_LABEL: Record<ReviewStage, string> = {
  get engineer() { return tr('Зөвшөөрч багцын ахлах инженерт илгээх'); },
  /* ⚠️ 2026-10-23: багцын ахлах инженерийн дараа төлөвлөлтийн инженер */
  get manager() { return tr('Зөвшөөрч төлөвлөлтийн инженерт илгээх'); },
  get planner() { return tr('Зөвшөөрч төлөвлөлтийн ахлах инженерт илгээх'); },
  get director() { return tr('Зөвшөөрч хэлтсийн даргад илгээх'); },
  get head() { return tr('Зөвшөөрч газрын даргад илгээх'); },
  get chief() { return tr('Баталж архивт бүртгэх'); },
};
const SENT_VERB: Record<ReviewStage, string> = {
  get engineer() { return tr('шалгаж багцын ахлах инженерт илгээв'); },
  get manager() { return tr('зөвшөөрч төлөвлөлтийн инженерт илгээв'); },
  get planner() { return tr('зөвшөөрч төлөвлөлтийн ахлах инженерт илгээв'); },
  get director() { return tr('зөвшөөрч хэлтсийн даргад илгээв'); },
  get head() { return tr('зөвшөөрч газрын даргад илгээв'); },
  get chief() { return tr('баталж бүртгэв'); },
};
const RETURN_VERB: Record<ReviewStage, string> = {
  get engineer() { return tr('компанид буцаав'); },
  get manager() { return tr('инженерт буцаав'); },
  get planner() { return tr('багцын ахлах инженерт буцаав'); },
  /* ⚠️ 2026-10-23: төлөвлөлтийн ахлах инженер буцаавал ТӨЛӨВЛӨЛТИЙН ИНЖЕНЕРТ (`OWNER`) */
  get director() { return tr('төлөвлөлтийн инженерт буцаав'); },
  get head() { return tr('төлөвлөлтийн ахлах инженерт буцаав'); },
  get chief() { return tr('хэлтсийн даргад буцаав'); },
};
/** Дахин шалгагчийн товч · placeholder — «дээшээ» ба «доошоо» */
const RECHECK_UP: Record<Exclude<ReviewStage, 'chief'>, string> = {
  get engineer() { return tr('Дахин шалгасан — асуудалгүй, багцын ахлах инженерт илгээх'); },
  get manager() { return tr('Дахин шалгасан — асуудалгүй, төлөвлөлтийн инженерт илгээх'); },
  get planner() { return tr('Дахин шалгасан — асуудалгүй, төлөвлөлтийн ахлах инженерт илгээх'); },
  get director() { return tr('Дахин шалгасан — асуудалгүй, хэлтсийн даргад илгээх'); },
  get head() { return tr('Дахин шалгасан — асуудалгүй, газрын даргад илгээх'); },
};
const RECHECK_DOWN: Record<Exclude<ReviewStage, 'chief'>, string> = {
  get engineer() { return tr('Асуудал байна — компанид буцаах'); },
  get manager() { return tr('Асуудал байна — инженерт буцаах'); },
  get planner() { return tr('Асуудал байна — багцын ахлах инженерт буцаах'); },
  get director() { return tr('Асуудал байна — төлөвлөлтийн инженерт буцаах'); },
  get head() { return tr('Асуудал байна — төлөвлөлтийн ахлах инженерт буцаах'); },
};
const RECHECK_HINT: Record<Exclude<ReviewStage, 'chief'>, string> = {
  get engineer() { return tr('Компанид буцаах бол шалтгаанаа бичнэ үү (багцын ахлах инженерийн бичвэр компанид харагдахгүй)'); },
  get manager() { return tr('Инженерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'); },
  get planner() { return tr('Багцын ахлах инженерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'); },
  get director() { return tr('Төлөвлөлтийн инженерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'); },
  get head() { return tr('Төлөвлөлтийн ахлах инженерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'); },
};

/* ⚠️ 2026-10-23 (UX аудит E11): гүйцэтгэлийн илгээлтийн мөрийн нэр «Гүйцэтгэл · 2026.10.14 · …» (`hyanaltSubmit.dayTagOf`)
   ArcGIS-д МОНГОЛООР хадгалагддаг (түлхүүр — өөрчлөхгүй) тул англи горимд угтварыг зөвхөн ДЭЛГЭЦЭНД орчуулна. */
/* ⚠️ 2026-10-26 (аудит): хуудасны нэрийг ч («Багц 1 · 9 давхар» — `hyanaltSubmit`: «Гүйцэтгэл · огноо · хуудас») орчуулна —
   урьд нь зөвхөн угтвар орчуулагдаж «Performance · 2026.10.26 · Багц 1 · 9 давхар» гардаг байв. Хадгалах утга монголоор хэвээр. */
const ajilLabel = (a: string): string => {
  if (!a.startsWith('Гүйцэтгэл · ')) return a;
  const rest = a.slice('Гүйцэтгэл · '.length);
  const i = rest.indexOf(' · ');
  return i < 0
    ? `${tr('Гүйцэтгэл')} · ${rest}`
    : `${tr('Гүйцэтгэл')} · ${rest.slice(0, i)} · ${tr(rest.slice(i + 3))}`;
};
/* ⚠️ 2026-10-27 (хэрэглэгч: «огноог нэрнээс тусдаа, баруун талд»): мөрийн нэрээс огноог салгана — нэр «Гүйцэтгэл · Багц 1 ·
   12 давхар», огноо (`workDay`) нь Track-ийн өмнө тусдаа баганад. Огноогүй нэр (хуучин бүртгэл) бол `ajilLabel` хэвээр. */
const DAY_RE = /^\d{4}\.\d{2}\.\d{2}$/;
const ajilName = (a: string): string => {
  if (!a.startsWith('Гүйцэтгэл · ')) return a;
  const rest = a.slice('Гүйцэтгэл · '.length);
  const i = rest.indexOf(' · ');
  const head = i < 0 ? rest : rest.slice(0, i);
  if (!DAY_RE.test(head)) return ajilLabel(a);
  return i < 0 ? tr('Гүйцэтгэл') : `${tr('Гүйцэтгэл')} · ${tr(rest.slice(i + 3))}`;
};
/** Ажлын өдөр «YYYY.MM.DD» — нэрээс (`dayTagOf`), эс бөгөөс компанийн илгээсэн огнооноос; аль нь ч алга бол '' */
const workDay = (w: Work): string => {
  const rest = w.ajil.startsWith('Гүйцэтгэл · ') ? w.ajil.slice('Гүйцэтгэл · '.length) : '';
  const head = rest.split(' · ')[0];
  if (DAY_RE.test(head)) return head;
  const t = Date.parse(String(w.current?.[F.companySent] ?? ''));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
/**
 * БАГЦААР БҮЛЭГЛЭНЭ (⚠️ 2026-10-27, хэрэглэгч: «багцаар бүлэглэ, хамгийн сүүлийн огноотой нь дээд талд»).
 * Багц бүрийн дотор шинэ өдөр дээр; багцуудыг хамгийн сүүлийн өдрөөр нь эрэмбэлнэ. Өдөр ижил бол `groupWorks`-ийн
 * дараалал (буцаалт ихтэй нь дээр) хэвээр — `sort` тогтвортой.
 */
const byBagts = (list: Work[]): { bagts: string; items: Work[] }[] => {
  const m = new Map<string, Work[]>();
  for (const w of list) {
    const a = m.get(w.bagts) ?? [];
    a.push(w);
    m.set(w.bagts, a);
  }
  const groups = [...m].map(([bagts, items]) => {
    const sorted = items.slice().sort((a, b) => workDay(b).localeCompare(workDay(a)));
    return { bagts, items: sorted, last: workDay(sorted[0]) };
  });
  groups.sort((a, b) => b.last.localeCompare(a.last) || a.bagts.localeCompare(b.bagts, 'mn', { numeric: true }));
  return groups.map(({ bagts, items }) => ({ bagts, items }));
};
/* ⚠️ 2026-10-26 (G7): шатны цаг нь нийтлэг `format.dateTime` («YYYY-MM-DD HH:mm», хоёр хэлэнд ижил). Урьд нь
   `toLocaleString('mn-MN')` — англи горимд монгол хэлбэр, `mn` ICU-гүй хөтөчид «10/14/2026, 02:30 PM» (MM/DD) гардаг байв. */
const fmt = (iso: string | null) => dateTime(iso);

/** Компани менежерийн шатыг ОГТ харахгүй */
const seesManager = (stage: Stage) => stage !== 'company';

const badgeClass = (st: Status, stage: Stage) => {
  if (st === STATUS.transferred) return s.bDone;
  // ⚠️ Компанид «Менежер буцаасан» улаанаар ч харагдах ёсгүй — тэр ажил
  //    хараахан компанид ирээгүй, инженер дээр байгаа.
  /* ⚠️ 2026-10-12 (R6): «Менежер буцаасан»-ы тусгай салбар ХАСАГДАВ — тэр нь компаниас бусад БҮХ шатанд
     (төлөвлөлтийн ахлах инженер · хэлтсийн · газрын дарга) улаан гаргаж доорх «зөвхөн буцаасан ба хүлээн авсан шат» дүрэмтэй
     зөрдөг байв. Ерөнхий дүрэм (RETURNER/OWNER) нь менежер (буцаасан) ба инженер (хүлээн авсан)-д улаан,
     компани ба бусад шатанд «хүлээгдэж буй» — дээрх ⚠️ хадгалагдана. */
  // ⚠️ Дээд шатны буцаалт нь НЭГ АЛХАМ доош очно — зөвхөн буцаасан ба хүлээн
  //    авсан шат «буцсан» гэж харна; бусдын гар дээр ирээгүй (2026-09-23, 6 шат).
  const ret = RETURNER[st];
  if (ret && st !== STATUS.engineerReturned)
    return stage === OWNER[st] || stage === ret ? s.bBack : s.bWait;
  return st === STATUS.engineerReturned ? s.bBack : s.bWait;
};

/** Төлөвийн шошго — компанид менежерийн шат харагдахгүй */
function statusLabel(st: Status, stage: Stage): string {
  if (seesManager(stage)) return STATUS_LABEL[st] ?? st;
  if (st === STATUS.transferred) return tr('Хүлээн авсан');
  if (st === STATUS.engineerReturned) return tr('Буцаасан');
  return tr('Хянагдаж байна');
}

/**
 * ⚠️ КОМПАНИД МЕНЕЖЕРИЙН ТЕКСТИЙГ ХАРУУЛАХГҮЙ. Ажил компанид зөвхөн ИНЖЕНЕРЭЭР
 * дамжин буцдаг бөгөөд инженер шалтгааныг ӨӨРӨӨ бичдэг тул компанид үргэлж
 * инженерийн бичвэр очно.
 */
const companyReason = (r: Row) => r[F.engineerReason];

/* ══════════ Түүх ══════════ */

/**
 * Хоёр огнооны ЗАЙГ хүний хэлээр. Ажил хэдэн хоног хэн нэгний гар дээр
 * хэвтснийг харуулна — хяналтын гол утга нь ихэвчлэн энэ хугацаанд оршино.
 */
function gapOf(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const min = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  if (min < 0) return '';               // ⚠️ Цагийн зөрүү — үзүүлэхгүй нь дээр
  if (min < 60) return tr('{0} мин', String(min));
  if (min < 60 * 24) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? tr('{0} ц {1} мин', String(h), String(m)) : tr('{0} ц', String(h));
  }
  const d = Math.floor(min / (60 * 24));
  const h = Math.floor((min % (60 * 24)) / 60);
  return h ? tr('{0} хоног {1} ц', String(d), String(h)) : tr('{0} хоног', String(d));
}

type Step = {
  who: string;
  verb: string;
  at: string | null;
  reason: string;
  /** Цэгийн өнгө — илгээсэн / зөвшөөрсөн / буцаасан */
  kind: 'sent' | 'ok' | 'bad';
  /** ⚠️ Нэрийн хажуугийн тэмдэглэл — «өмнөх шийдвэрийн нэр дарагдсан» (доорх `overwritten`) */
  note?: string;
  /** ⚠️ 2026-10-01: аль хянах шатны алхам — шийдвэрийн логтой тулгахад (`attachHistory`) */
  stage?: ReviewStage;
};

/** ⚠️ 2026-10-01: логийн үйл явдлын нэрийн өмнөх шатны шошго (`stepsOf`-той ижил) */
const STAGE_WHO: Record<ReviewStage, string> = {
  get engineer() { return tr('Инженер'); },
  get manager() { return tr('Багцын ахлах инженер'); },
  get planner() { return tr('Төлөвлөлтийн инженер'); },
  get director() { return tr('Төлөвлөлтийн ахлах инженер'); },
  get head() { return tr('Хэлтсийн дарга'); },
  get chief() { return tr('Газрын дарга'); },
};

/**
 * ⚠️ 2026-09-30: НЭГ МӨРӨНД НЭГ ШАТ ХОЁР УДАА ШИЙДСЭН — нэр дарагдсан.
 *
 * Хяналтын хүснэгтэд шат бүр ГАНЦ `who` талбартай (`hyanalt.SF`). А зөвшөөрөөд
 * (`sent`), дээд шат буцаасны дараа Б дахин шалгаж компанид буцаавал (`recheck
 * 'back'` — ИЖИЛ мөр, `returned`) `who` = Б болж, А-гийн нэр АЛГА болно; түүх
 * хоёр алхмыг хоёуланг нь Б-гийн нэрээр харуулдаг байв. Хүснэгтэд түүхийн
 * (лог) талбар БАЙХГҮЙ тул нэрийг сэргээх боломжгүй — ядаж ДАРАГДСАН гэдгийг
 * ил хэлнэ.
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): `Shiidveriin_tuuh` лог талбар нэмэгдсэн
 *    бол (`hyanalt.F.history`) `stepsOf` нэрийг логоос сэргээж энэ тэмдэглэгээг
 *    арилгана; логгүй (хуучин) мөрд энэ дүрэм хэвээр. Илрүүлэх нөхцөл нь яг: нэг шатанд `sent` ба `returned` ХОЁУЛАА
 * байх (нэг мөрөнд өөр замаар үүсэх боломжгүй — `recheck 'ok'` шинэ мөр
 * үүсгэдэг, `apply` төлөвөөр хаагддаг). Хоёрын ЭРТ нь дарагдсан.
 * @returns аль алхмын нэр найдваргүй: `'sent'` · `'ret'` · `null`
 */
function overwritten(sent: string | null, ret: string | null): 'sent' | 'ret' | null {
  if (!sent || !ret) return null;
  /* ISO мөр — үсгээр харьцуулахад цагийн дараалал хадгалагдана */
  return sent <= ret ? 'sent' : 'ret';
}
const OVERWRITTEN = () => tr('(өмнөх шийдвэрийн нэр дарагдсан)');

/**
 * Нэг тойргийн алхмууд.
 *
 * ⚠️ Алхмуудыг ШИЙДВЭРИЙН баганаас БИШ, ОГНООНООС гаргана. Нэг мөрөнд инженер
 * эхлээд зөвшөөрөөд, менежер буцаасны дараа дахин шалгаад компанид буцаасан
 * байж болно — энэ үед шийдвэрийн багана ЗӨВХӨН сүүлийн үйлдлийг хадгална.
 */
function stepsOf(r: Row, stage: Stage, showSent: boolean): Step[] {
  // ⚠️ Дахин шалгалтын тойрогт компани ДАХИН ИЛГЭЭГЭЭГҮЙ — давтвал компани
  //    хоёр удаа илгээсэн мэт харагдана.
  const out: Step[] = showSent
    ? [{
      who: r[F.company] || tr('Компани'),
      verb: tr('гүйцэтгэл илгээв'),
      at: r[F.companySent],
      reason: '',
      kind: 'sent',
    }]
    : [];

  const eng = `${tr('Инженер')} ${r[F.engineer]}`.trim();
  const engOv = overwritten(r[F.engineerSent], r[F.engineerReturned]);

  if (r[F.engineerSent]) {
    out.push({
      who: eng,
      // Компани менежерийн тухай сонсох ёсгүй тул үйл үгийг нь өөрчилнө
      verb: seesManager(stage) ? tr('шалгаж багцын ахлах инженерт илгээв') : tr('хүлээн авав'),
      at: r[F.engineerSent],
      reason: '',
      kind: 'ok',
      note: engOv === 'sent' ? OVERWRITTEN() : '',
      stage: 'engineer',
    });
  }
  if (r[F.engineerReturned]) {
    out.push({
      who: eng,
      verb: tr('компанид буцаав'),
      at: r[F.engineerReturned],
      reason: r[F.engineerReason],
      kind: 'bad',
      note: engOv === 'ret' ? OVERWRITTEN() : '',
      stage: 'engineer',
    });
  }

  if (seesManager(stage)) {
    const mgr = `${tr('Багцын ахлах инженер')} ${r[F.manager]}`.trim();
    const mgrOv = overwritten(r[F.managerSent], r[F.managerReturned]);
    if (r[F.managerSent]) {
      /* ⚠️ 2026-10-23: үйл үг `SENT_VERB`-ээс — дараагийн шат нь төлөвлөлтийн инженер */
      out.push({ who: mgr, verb: SENT_VERB.manager, at: r[F.managerSent], reason: '', kind: 'ok', note: mgrOv === 'sent' ? OVERWRITTEN() : '', stage: 'manager' });
    }
    if (r[F.managerReturned]) {
      out.push({
        who: mgr,
        verb: tr('инженерт буцаав'),
        at: r[F.managerReturned],
        reason: r[F.managerReason],
        kind: 'bad',
        note: mgrOv === 'ret' ? OVERWRITTEN() : '',
        stage: 'manager',
      });
    }

    /* ⚠️ 4·5·6·7-р шат — нэг загвараар (2026-09-23; 2026-10-23-нд төлөвлөлтийн инженер нэмэгдэв) */
    const upper: { st: ReviewStage; label: string; who: string; sent: string | null; ret: string | null; why: string }[] = [
      { st: 'planner', label: tr('Төлөвлөлтийн инженер'), who: r[F.planner], sent: r[F.plannerSent], ret: r[F.plannerReturned], why: r[F.plannerReason] },
      { st: 'director', label: tr('Төлөвлөлтийн ахлах инженер'), who: r[F.director], sent: r[F.directorSent], ret: r[F.directorReturned], why: r[F.directorReason] },
      { st: 'head', label: tr('Хэлтсийн дарга'), who: r[F.head], sent: r[F.headSent], ret: r[F.headReturned], why: r[F.headReason] },
      { st: 'chief', label: tr('Газрын дарга'), who: r[F.chief], sent: r[F.chiefSent], ret: r[F.chiefReturned], why: r[F.chiefReason] },
    ];
    for (const u of upper) {
      const nm = `${u.label} ${u.who}`.trim();
      const ov = overwritten(u.sent, u.ret);
      if (u.sent) out.push({ who: nm, verb: SENT_VERB[u.st], at: u.sent, reason: '', kind: 'ok', note: ov === 'sent' ? OVERWRITTEN() : '', stage: u.st });
      if (u.ret) out.push({ who: nm, verb: RETURN_VERB[u.st], at: u.ret, reason: u.why, kind: 'bad', note: ov === 'ret' ? OVERWRITTEN() : '', stage: u.st });
    }
  }

  /*
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ШИЙДВЭРИЙН ЛОГ (`Shiidveriin_tuuh`) байвал
   *    алхам бүрийн НЭРИЙГ логоос авна — талбарын ганц нэр дарагдсан ч лог шийдвэр
   *    бүрийг хадгалсан. Тулгагдсан алхмын «нэр дарагдсан» тэмдэглэгээ арилна;
   *    талбарт үлдээгүй (тулгагдаагүй) үйл явдал нь ТУСДАА алхам болж нэмэгдэнэ.
   *    Лог хоосон (талбаргүй үйлчилгээ, хуучин мөр) бол урьдын зан хэвээр.
   * ⚠️ Компанид зөвхөн инженерийн алхам (`seesManager`-ийн дүрэм).
   */
  const log = parseHistory(r[F.history]);
  if (log.length) {
    const vis = (x: ReviewStage) => seesManager(stage) || x === 'engineer';
    const { matched, extra } = attachHistory(out, log, vis);
    for (const [st, e] of matched) {
      st.who = `${STAGE_WHO[e.stage]} ${e.who}`.trim();
      st.note = '';
    }
    for (const e of extra) {
      const ok = isApproveAct(e.act);
      out.push({
        who: `${STAGE_WHO[e.stage]} ${e.who}`.trim(),
        verb: ok
          ? (!seesManager(stage) && e.stage === 'engineer' ? tr('хүлээн авав') : SENT_VERB[e.stage])
          : RETURN_VERB[e.stage],
        at: new Date(e.at).toISOString(),
        reason: ok ? '' : (e.reason ?? ''),
        kind: ok ? 'ok' : 'bad',
        stage: e.stage,
      });
    }
  }

  // ⚠️ ОГНООГООР эрэмбэлнэ — инженер менежерийн дараа дахин үйлдэл хийж болно
  return out.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
}

/**
 * Тухайн тойрог ЯАЖ дууссан бэ.
 * ⚠️ `Төлөв`-өөс тооцно — шийдвэрийн багана нь дахин шалгалтын дараа хуучирч
 * болох ба тэр үед «Менежер буцаасан» гэж буруу харагдана.
 */
function outcomeOf(r: Row, stage: Stage): { text: string; cls: string } {
  const st = r[F.status];
  if (st === STATUS.transferred) {
    return { text: seesManager(stage) ? tr('Шилжүүлсэн') : tr('Хүлээн авсан'), cls: s.bDone };
  }
  if (st === STATUS.engineerReturned) {
    return { text: seesManager(stage) ? tr('Инженер буцаасан') : tr('Буцаасан'), cls: s.bBack };
  }
  if (!seesManager(stage)) return { text: tr('Хянагдаж байна'), cls: s.bWait };
  const back = !!RETURNER[st];
  return { text: STATUS_LABEL[st] ?? st, cls: back ? s.bBack : s.bWait };
}

const DOT: Record<Step['kind'], string> = { sent: '↑', ok: '✓', bad: '✕' };

function History({ cycles, stage }: { cycles: Row[]; stage: Stage }) {
  /*
   * ДАХИН ШАЛГАЛТЫН ТОЙРОГ уу? Инженер менежерийн буцаалтыг дахин
   * шалгаад менежерт илгээхэд ШИНЭ мөр үүсдэг боловч компани дахин
   * илгээгээгүй тул `Компани_илгээсэн_огноо` нь өмнөхтэйгээ ИЖИЛ үлдэнэ.
   *
   * ⚠️ 2026-10-12 (R7): КОМПАНИД дахин шалгалтын тойргийг ТУСДАА «N-р хянуулалт · дахин шалгалт» гэж
   *    харуулахгүй — тэр нь дотоод (менежер ↔ инженер) мөчлөгийг ил гаргаж файлын толгойн «КОМПАНИ МЕНЕЖЕРИЙГ
   *    ХАРАХГҮЙ» дүрмийг зөрчдөг байв. Компанид өмнөх (жинхэнэ илгээлтийн) тойрогт НИЙЛҮҮЛНЭ: алхмуудаас зөвхөн
   *    КОМПАНИД ХАМААРАХ буцаалт (`bad` — инженерийн «компанид буцаав») нэмэгдэнэ, үр дүн нь гинжний СҮҮЛИЙН
   *    мөрөөс. Дотоод дахин илгээлтийн «хүлээн авав» алхмууд нэмэгдэхгүй.
   */
  const shown: { r: Row; again: boolean; steps: Step[]; out: { text: string; cls: string } }[] = [];
  cycles.forEach((r, i) => {
    const again = i > 0 && !!r[F.companySent] && r[F.companySent] === cycles[i - 1][F.companySent];
    const last = shown[shown.length - 1];
    if (stage === 'company' && again && last) {
      const seen = new Set(last.steps.map((x) => `${x.kind}|${x.at}|${x.verb}`));
      for (const x of stepsOf(r, stage, false)) {
        if (x.kind !== 'bad' || seen.has(`${x.kind}|${x.at}|${x.verb}`)) continue;
        last.steps.push(x);
      }
      last.steps.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
      last.out = outcomeOf(r, stage);
      return;
    }
    shown.push({ r, again, steps: stepsOf(r, stage, !again), out: outcomeOf(r, stage) });
  });
  return (
    <div className={s.hist}>
      <div className={s.histHead}>{tr('Түүх')}</div>

      {shown.map(({ r, again, steps, out }, i) => {
        return (
          <div key={r[F.id]} className={s.cyc}>
            <div className={s.cycHead}>
              <span className={s.cycNo}>{i + 1}</span>
              <span className={s.cycTitle}>{tr('{0}-р хянуулалт', String(i + 1))}</span>
              {again && stage !== 'company' && <span className={s.cycTag}>{tr('дахин шалгалт')}</span>}
              <span className={s.cycId}>{r[F.id]}</span>
              <span className={s.spacer} />
              <span className={`${s.badge} ${out.cls}`}>{out.text}</span>
            </div>

            <ol className={s.rail}>
              {steps.map((st, k) => (
                <li key={k} className={s.stepLi}>
                  <span className={`${s.dot} ${s[st.kind]}`}>{DOT[st.kind]}</span>
                  <div className={s.stepBody}>
                    <div className={s.stepTop}>
                      <span className={s.stepWho}>{st.who}</span>
                      {st.note && (
                        <span className={s.stepNote} title={tr('Нэг шат энэ мөрөнд хоёр удаа шийдсэн тул хүснэгтийн ганц нэрийн талбар сүүлийн шийдвэрийн нэрээр дарагдсан — энэ алхмыг хэн хийснийг баттай хэлэх боломжгүй.')}>
                          {st.note}
                        </span>
                      )}
                      <span className={`${s.verb} ${st.kind === 'bad' ? s.verbBad : ''}`}>
                        {st.verb}
                      </span>
                      <span className={s.spacer} />
                      {k > 0 && gapOf(steps[k - 1].at, st.at) && (
                        <span className={s.gap}>+{gapOf(steps[k - 1].at, st.at)}</span>
                      )}
                      <span className={s.time}>{fmt(st.at)}</span>
                    </div>
                    {st.reason && (
                      <div className={s.why}>
                        <span className={s.whyLabel}>{tr('Шалтгаан')}</span>
                        {st.reason}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════ Нийтэлсэн гүйцэтгэл ══════════ */

/** Он.сар.өдөр цаг:минут — нутгийн цагаар */
const stamp = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Тоо — мянгатын тусгаарлагчтай, хоосныг зураасаар */
const qty = (v: number | null) =>
  v == null ? '—' : Number(v.toFixed(3)).toLocaleString('en-US');
/** ⚠️ Хувь нь үйлчилгээнд 0–1 хооронд — 100-аар үржүүлж харуулна */
const pcs = (v: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : `${Number((v * 100).toFixed(1))}%`;
/**
 * ЭНЭ УДААГИЙН НЭМЭЛТИЙН ЖИЖИГ ТЭМДЭГ — « (+15)» / « (−5)» (2026-09-25).
 * ⚠️ `null`/0 бол юу ч зурахгүй: «мэдээлэлгүй» нүдэнд «+0» гэж бичвэл худал.
 */
const incTag = (d: number | null | undefined, f: (v: number | null) => string) =>
  d == null || !Number.isFinite(d) || Math.abs(d) < 1e-12
    ? null
    : <small style={{ opacity: 0.75, marginLeft: 4 }}>({d > 0 ? '+' : '−'}{f(Math.abs(d))})</small>;

/**
 * ⚠️ ХЯНАГЧ ЮУГ ЗӨВШӨӨРЧ БАЙГААГАА ХАРАХ ЁСТОЙ. Хяналтын бүртгэл нь зөвхөн
 * хэн, хэзээ илгээснийг хэлдэг — компани ЮУ бөглөснийг хэлдэггүй. Түүнгүйгээр
 * зөвшөөрөх товч нь ёсорхуу дарах үйлдэл болно.
 */
function Submitted({
  bagts,
  sheetOid,
  sentAt,
  approvedAt,
  ok,
  onCell,
  onChanges,
  onSubAt,
  onRemapped,
  onUnmoved,
  onNegative,
  onOkAll,
  reloadKey = 0,
}: {
  bagts: string;
  sheetOid: number;
  sentAt: string | null;
  /**
   * ЭНЭ МӨРИЙН ХАМГИЙН СҮҮЛИЙН ЗӨВШӨӨРЛИЙН агшин (шатуудын `…_илгээсэн_огноо`-ны хамгийн их, ms).
   * ⚠️ 2026-10-05: гүйцэтгэгч дээд шатанд байхад дахин илгээвэл (`reused`) мөр тэр шатандаа
   *    доод шатны зөвшөөрөлтэй хэвээр үлддэг — тэр зөвшөөрөл шинэ агуулгыг ХАРААГҮЙ. Үүгээр
   *    `subAt`-ийг тулгаж 15 минутын хүлцлээс ҮЛ ХАМААРАН анхааруулна.
   */
  approvedAt?: number | null;
  /**
   * ЭЦГЭЭС ДАХИН АЧААЛУУЛАХ тоолуур (2026-09-25-ны аудит).
   * ⚠️ Нэг `sub|` мөр дээр гүйцэтгэгч дахин илгээхэд `bagts`·`sheetOid`
   *    өөрчлөгддөггүй тул энэ компонент хуучин агуулгаа барьсаар байв;
   *    `apply`/`recheck` «агуулга өөрчлөгдсөн» гэж зогсоход эцэг үүнийг
   *    ахиулж ШИНЭ агуулгыг татуулна.
   */
  reloadKey?: number;
  /** Зөвшөөрсөн нүднүүд — эцэг (`Item`) эзэмшинэ: товч түүнд байна. */
  ok?: Set<string>;
  /** ⚠️ 2026-10-22 (аудит): мөр буцаавал татгалзлын ШАЛТГААН (сөрөг нийт — `Item.toggleOk`); хүснэгт түүнийг харуулна */
  onCell?: (row: number, block: string) => string | void;
  /** Өөрчлөлтийн жагсаалтыг эцэгт мэдэгдэнэ — «бүгд зөвшөөрөгдсөн үү» гэж бодоход. */
  onChanges?: (c: Change[] | null) => void;
  /** Илгээлтийн агшин (`payload.at`) — эцэг `apply`-д `subAt` болгон дамжуулна (2026-09-24). */
  onSubAt?: (at: number | undefined) => void;
  /** ⚠️ 2026-10-01: илгээлтийн мөрүүд шинэ жааз руу зөөгдсөн эсэх (`Submission.remapped`) — хуучин
      индексийн зөвшөөрөлд итгэх эсэхэд (`hyanaltOkCells.resolveOk`) */
  onRemapped?: (v: boolean | undefined) => void;
  /**
   * ⚠️ 2026-10-12 (R5): одоогийн жаазад ТУЛГАГДААГҮЙ нүдний тоо (`Submission.unmoved`) — эцэг батлах товчийг хаана.
   *    Тэдгээр нүд `changes`-д ОРДОГГҮЙ тул урьд нь `allOk` үнэн болж дунд шатны батлалт хараагүй нүдтэй
   *    нээлттэй байв (эцсийн шатны архивлалт л зогсдог). `undefined` = уншиж байна / унасан.
   */
  onUnmoved?: (n: number | undefined) => void;
  /**
   * ⚠️ 2026-10-22 (аудит): НИЙТ дүнг СӨРӨГ болгох нэмэлтийн нүдний тоо (`Submission.negative`) — `onUnmoved`-той ЯГ
   *    ижил: эцэг батлах (дээш илгээх) товчийг БҮХ шатанд хаана. Урьд нь энэ тоог юу ч уншдаггүй тул жагсаалтад 0-оор
   *    хаасан утга энгийн өөрчлөлт мэт харагдаж, инженер→дарга батлаад зөвхөн 6-р шатны архивлалт л татгалздаг байв
   *    (хэн нэгэн гараар буцаатал гацна). `undefined` = уншиж байна / унасан.
   */
  /* ⚠️ 2026-10-22 (хэрэглэгч): `cells` — сөрөг нүдний НЭР (`Submission.negCells`), батлах товчны шалтгаанд хаана гэдгийг хэлнэ */
  onNegative?: (n: number | undefined, cells?: string[]) => void;
  /**
   * «БҮГДИЙГ ЗӨВШӨӨРӨХ» — ЗӨВХӨН системийн админд. Эцэг (`Item`) шийднэ;
   * өгөгдөөгүй бол товч ОГТ зурагдахгүй.
   *
   * ⚠️ Товчийг ЭНД — өөрчлөгдсөн нүдний тоолуурын хажууд — байрлуулав,
   * шийдвэрийн товчнуудаас ТУСДАА (2026-09-06, хэрэглэгчийн заавар: «тусдаа
   * button байх ёстой»). Тэдэнтэй нэг эгнээнд байхад «Зөвшөөрч илгээх»-тэй
   * нэг төрлийн үйлдэл мэт уншигдаж, аль нь ЖИНХЭНЭ шийдвэр болохыг ялгахад
   * төвөгтэй байв. Энэ товч нь ЗӨВХӨН тэмдэглэгээ тавина.
   */
  onOkAll?: () => void;
}) {
  /** «Дахин оролдох» тоолуур — уншилтын effect-ийг дахин асаана. */
  const [tryN, setTryN] = useState(0);
  /*
   * ⚠️ 2026-09-30 (eslint `set-state-in-effect`): `busy`/`err`/`data` гурван state-ийг
   *    эффектийн эхэнд синхроноор тэглэдэг байв. Одоо НЭГ state, уншилтын ТҮЛХҮҮРТЭЙ:
   *    түлхүүр (багц · илгээлт · дахин оролдох · дахин ачаалах) солигдмогц `busy` нь
   *    ӨӨРӨӨ үнэн болно (`res.key !== reqKey`) — эффектэд юу ч тэглэх шаардлагагүй.
   *    Зан төлөв ижил: уншилт дуустал «татаж байна», унавал улаан, олдоогүй бол `null`.
   */
  const reqKey = `${bagts}|${sheetOid}|${tryN}|${reloadKey}`;
  const [res, setRes] = useState<{ key: string; data: Submission | null; err: string }>({ key: '', data: null, err: '' });
  const busy = res.key !== reqKey;
  const data = busy ? null : res.data;
  const err = busy ? '' : res.err;
  /**
   * ӨӨРЧЛӨГДСӨН НҮД РҮҮ ҮСРЭХ хүсэлт — жагсаалтаас дарахад бөглөх хуудас
   * тэр мөр рүү гүйж, нүдийг богино анивчилтаар онцолно.
   * ⚠️ 1,370 мөрөөс өөрчлөгдсөн хэдэн нүдийг гараар олох боломжгүй.
   */
  const [jump, setJump] = useState<{ row: number; block: string; n: number } | null>(null);
  /** ⚠️ 2026-10-07: хүснэгтийн хайрцаг — өөрчлөгдсөн нүд дээр дарахад ЭНЭ ч дэлгэцэд орно (доорх ⚠️) */
  const subSheetRef = useRef<HTMLDivElement>(null);
  /** Өөрчлөгдсөн нүд: `${мөр}:${блок}` — бөглөх хуудсанд улаанаар тэмдэглэнэ. */
  /** Хэдийг нь зөвшөөрсөн — толгойд харуулна. */
  const okCount = (data?.changes ?? []).filter((c) => ok?.has(`${c.row}:${c.block}`)).length;
  /** ⚠️ 2026-10-22 (аудит): ЗӨВШӨӨРЧ БОЛОХ нүд — нийт сөрөг (`Change.neg`) нь хэзээ ч ногоон болохгүй тул «бүгдийг ногоон»
      товч тэднийг тоолж үүрд харагдахгүй (`Item.onOkAll` тэднийг алгасна) */
  const okable = (data?.changes ?? []).filter((c) => !c.neg).length;
  const changedKeys = useMemo(
    () => new Set((data?.changes ?? []).map((c) => `${c.row}:${c.block}`)),
    [data],
  );

  useEffect(() => {
    let alive = true;
    /* ⚠️ Уншилт дуустал ба УНАСАН үед `null` (2026-09-06): урьд нь унахад
       `changes` `[]` хэвээр үлдэж, дээд талын батлах товч «өөрчлөлтгүй» мэт
       ИДЭВХТЭЙ байв — хянагч агуулгыг харалгүй батлах зам. `lack`-ийн гурван
       төлөвтэй ижил дүрэм. */
    onChanges?.(null);
    onSubAt?.(undefined);
    onRemapped?.(undefined);
    onUnmoved?.(undefined);
    onNegative?.(undefined);
    loadSubmission(bagts, sheetOid)
      /* ⚠️ Агшин ОЛДООГҮЙ (`null`) бол `[]` БИШ `null` — эс бөгөөс батлах товч
         «өөрчлөлтгүй» гэж нээгддэг байв (2026-09-23). */
      /* ⚠️ `prevError` үед `null` (2026-09-25-ны аудит): өмнөх агшин
         уншигдаагүй бол `changes: []` нь «өөрчлөлтгүй» гэсэн баталгаа БИШ
         (`Submission.prevError`-ийн ⚠️) — урьд нь `[]` дамжиж «Батлах» нүд
         харалгүй идэвхтэй болдог байв. */
      .then((d) => { if (alive) { setRes({ key: reqKey, data: d, err: '' }); onChanges?.(d && !d.prevError ? d.changes : null); onSubAt?.(d?.subAt); onRemapped?.(d ? d.remapped === true : undefined); onUnmoved?.(d ? (d.unmoved ?? 0) : undefined); onNegative?.(d ? (d.negative ?? 0) : undefined, d?.negCells); } })
      .catch((e) => { if (alive) { setRes({ key: reqKey, data: null, err: userError(e) }); onChanges?.(null); } });
    // ⚠️ Задлах бүрд БИШ, нэг л удаа — хамаарал нь зөвхөн бүртгэлийн түлхүүр
    //    (ба «Дахин оролдох» тоолуур) — бүгд `reqKey`-д
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  /* ⚠️ 2026-10-23 (UX аудит X7): «Нийтэлсэн/нийтлэл» → «Илгээсэн/илгээлт» — гүйцэтгэгчийн товч «Илгээх» тул нэг нэр томьёо */
  if (busy) return <div className={s.subMuted}>{tr('Илгээсэн гүйцэтгэлийг татаж байна…')}</div>;
  /* ⚠️ Унасныг бүдэг биш УЛААНААР, дахин оролдох товчтой (2026-09-23) —
     бүдэг мөр нь «хоосон» мэт харагдаж, хянагч дахин ачаалах замгүй байв. */
  if (err) {
    return (
      <div className={s.error} role="alert">
        {tr('Гүйцэтгэлийг татаж чадсангүй: {0}', err)}{' '}
        <button type="button" className={s.btn} onClick={() => setTryN((n) => n + 1)}>{tr('Дахин оролдох')}</button>
      </div>
    );
  }
  if (!data) return <div className={s.subMuted}>{tr('Энэ илгээлтийн хадгалсан агуулга олдсонгүй (устгагдсан эсвэл хуучин бүртгэл) — гүйцэтгэгчээр дахин илгээлгэнэ үү.')}</div>;

  return (
    <div className={s.sub}>
      <div className={s.subHead}>
        <span>{tr('Илгээсэн гүйцэтгэл')}</span>
        <span className={s.subMeta}>
          {/*
            * ⚠️ Хараахан АРХИВЛААГҮЙ илгээлтийг «архивлав» гэж ХЭЛЭХГҮЙ
            *    (2026-09-04). Гүйцэтгэл нь төлөвлөлтийн ахлах инженер баталтал үндсэн
            *    өгөгдөлд ОРООГҮЙ; «архивлав» гэвэл хянагч аль хэдийн
            *    бүртгэгдсэн баримт хараад байна гэж эндүүрнэ.
            */}
          {data.pkgLabel} · {data.subOid
            ? tr('илгээлт · {0} мөр', String(data.rows))
            : tr('{0} мөр архивлав', String(data.rows))}
        </span>
      </div>

      {/*
        * ⚠️ Энэ нь ЧУХАЛ дохио: юу ч бөглөөгүй нийтлэлийг зөвшөөрөх ёсгүй.
        * ⚠️ ГЭХДЭЭ ЖАГСААЛТЫГ НУУХГҮЙ (2026-09-04-ний аудит): урьд нь
        *   `filledCount === 0` үед өөрчлөлтийн жагсаалт БА хүснэгт хоёулаа
        *   нуугддаг байв. Гүйцэтгэгч өмнө бөглөсөн обьёмоо ЦЭВЭРЛЭЖ илгээвэл
        *   (нүд "" → null) өөрчлөлт бий атлаа `filledCount = 0` болох тул
        *   зөвшөөрөх товч «нүд бүр дээр дарж зөвшөөрнө үү» гэж түгжигдэж,
        *   тэмдэглэх ганц зам (жагсаалтын товчнууд) нь зурагдаагүй байлаа —
        *   хянагчид зөвхөн «Буцаах» үлддэг байв.
        */}
      {data.filledCount === 0 && (
        <div className={s.subWarn}>{tr('Энэ илгээлтэд обьём огт бөглөгдөөгүй байна.')}</div>
      )}
      <>
          <div className={s.subMuted}>
            {/*
              * ⚠️ «Анхны нийтлэл» гэхийн оронд НИЙТЭЛСЭН ЯГ АГШНЫГ бичнэ —
              * хянагчид «хэзээ ирсэн бэ» гэдэг нь илүү хэрэгтэй мэдээлэл.
              */}
            {tr('Илгээсэн: {0}', stamp(sentAt))}
            {' · '}
            {tr('Обьём бөглөсөн ажил: {0}', String(data.filledCount))}
            {' · '}
            {/* ⚠️ Жишиж чадаагүй бол «0» БИШ «—» (null ≠ 0) */}
            {tr('өөрчлөгдсөн нүд: {0}', data.prevError ? '—' : String(data.changes.length))}
            {ok && data.changes.length > 0 && (
              <>
                {' · '}
                <span className={okCount === data.changes.length ? s.okAll : s.okSome}>
                  {tr('зөвшөөрсөн {0}/{1}', String(okCount), String(data.changes.length))}
                </span>
              </>
            )}
            {/* ⚠️ ТУСДАА ТОВЧ (2026-09-06) — өөрчлөгдсөн нүдний тоолуурын
                ХАЖУУД, шийдвэрийн товчнуудаас ТУСГААРЛАСАН. Зөвхөн
                тэмдэглэгээ тавина: аль ч шатны шийдвэрийг ГАРГАХГҮЙ. */}
            {onOkAll && okCount < okable && (
              <>
                {' · '}
                <button
                  type="button"
                  className={s.okAllBtn}
                  onClick={onOkAll}
                  title={tr('Зөвхөн системийн админд. Өөрчлөгдсөн {0} нүдийг бүгдийг нь ногоон болгож тэмдэглэнэ — шийдвэрийг доод талын товч гаргана.', String(okable - okCount))}
                >
                  {tr('✓ бүгдийг ногоон болгох ({0})', String(okable - okCount))}
                </button>
              </>
            )}
            {data.compared && (
              <>
                {' · '}
                <span className={s.subLegend}>
                  {tr('улаан хүрээ — энэ илгээлтэд өөрчлөгдсөн')}
                </span>
              </>
            )}
          </div>
          {/*
            * ⚠️ ОГНОО БА «ШИНЭЧЛЭГДСЭН ОГНОО»-ны ЗАСВАР (2026-09-04-ний аудит).
            *   Урьд нь `changes` нь ЗӨВХӨН обьёмын нүднээс бүтдэг байсан тул
            *   хуваарийн огнооны засвар ба `asOf` нь хянагчид ОГТ харагдахгүй,
            *   «өөрчлөгдсөн нүд: 0» гэж бичээд зөвшөөрөх товч ямар ч
            *   тэмдэглэлгүй нээлттэй байв. Төлөвлөлтийн ахлах инженер батлахад тэр `asOf`
            *   нь БҮХ мөрийн төлөвлөгөөт хувийг дахин бодуулна — хэн ч
            *   хараагүй өөрчлөлт.
            * ⚠️ Зөвшөөрлийн ГАРЦ болгохгүй (`allOk`-д ордоггүй): огнооны нүд
            *   дээр дарж ногоон болгох зам байхгүй тул түгжвэл багц гацна.
            */}
          {data.prevError && (
            <div className={s.error} role="alert">
              {tr('Өмнөх хувилбарыг уншиж чадсангүй — аль нүд өөрчлөгдсөнийг тодорхойлж чадаагүй тул батлах товч түр хаалттай.')}{' '}
              <button type="button" className={s.btn} onClick={() => setTryN((n) => n + 1)}>{tr('Дахин оролдох')}</button>
            </div>
          )}
          {/* ⚠️ 2026-10-04: одоогийн жаазад тулгагдаагүй нүд — жагсаалтад харагдахгүй (`Submission.unmoved`) */}
          {/* ⚠️ 2026-10-22 (аудит): `unmoved` ХОЁР шалтгаантай — мөр нь тулгагдаагүй, ЭСВЭЛ нэмэлтийн утга нь тоо биш
              («1,250» · «abc» — `sheetFrame.overlaySubmission`-ийн 2026-10-21 ⚠️). Урьд нь зөвхөн «тулгагдсангүй» гэдэг тул
              гүйцэтгэгч мөрөө хайж буруу зүйлийг засдаг байв — хоёуланг нэрлэнэ. Батлах товч `Item`-д хаагдана. */}
          {(data.unmoved ?? 0) > 0 && (
            <div className={s.subWarn} role="alert">
              {tr('Илгээлтийн {0} нүдийг хуудсанд буулгаж чадсангүй — мөр нь одоогийн хуудсанд тулгагдаагүй, эсвэл нэмэлтийн утга нь тоо биш («1,250» · «abc» мэт). Доорх жагсаалтад харагдахгүй бөгөөд батлах боломжгүй — гүйцэтгэгчээр шалгуулж (тоог зөв бичээд) дахин илгээлгэнэ үү.', String(data.unmoved))}
            </div>
          )}
          {/* ⚠️ 2026-10-22 (аудит): НИЙТ СӨРӨГ болох нэмэлт (`Submission.negative`) — жагсаалтад 0-оор хаасан утга энгийн
              өөрчлөлт мэт харагддаг тул ИЛ хэлнэ; шалтгаан нь архивлалтын татгалзалтын (`hyanaltStore.archiveSubmission`)
              бичвэртэй ижил. Батлах товч `Item`-д хаагдана (`negBlocks`). */}
          {(data.negative ?? 0) > 0 && (
            <div className={s.subWarn} role="alert">
              {tr('{0} нүдний нэмэлт нийт дүнг сөрөг болгоно (суурь утгаас их хасалт) тул батлах боломжгүй — доорх нүд(ийг) гүйцэтгэгчээр залруулуулж дахин илгээүүлнэ үү:', String(data.negative))}
              {/* ⚠️ 2026-10-22 (хэрэглэгч: «хэддүгээр мөр вэ»): АЛЬ нүд — эцэг бүлгүүдийн №-ээр зам + илгээсэн утга */}
              {(data.negCells?.length ?? 0) > 0 && <div>{data.negCells!.join('; ')}</div>}
            </div>
          )}
          {/* ⚠️ 2026-10-22 (аудит): «хуучин → шинэ» — архивт БИЧИГДЭХ огноо (`laterAsOf`: хуучин өдрийн илгээлт ухраахгүй) */}
          {data.asOfChanged && (
            <div className={s.subWarn}>
              {tr('«Шинэчлэгдсэн огноо» өөрчлөгдөнө ({0} → {1}) — батлахад БҮХ мөрийн төлөвлөгөөт гүйцэтгэл дахин бодогдоно.', data.asOfFrom ?? '—', data.asOfTo ?? '—')}
            </div>
          )}
          {data.dateChanges.length > 0 && (
            <div className={s.subMuted}>
              {tr('Хуваарийн огноо засагдсан: {0}', String(data.dateChanges.length))}
              {' — '}
              {data.dateChanges.slice(0, 8).map((d, i) => (
                <span key={`${d.no}:${d.block}:${d.se}:${i}`}>
                  {i > 0 ? '; ' : ''}
                  {`${d.block} · ${fixCyr(d.work)} · ${d.se === 's' ? tr('эхлэх') : tr('дуусах')}: ${d.from ?? '—'} → ${d.to ?? '—'}`}
                </span>
              ))}
              {data.dateChanges.length > 8 && ` … +${data.dateChanges.length - 8}`}
            </div>
          )}
          {/*
            * ⚠️ БУЦААГДСАН ХУУЧИН ТОЙРГИЙГ НЭЭХЭД ШИНЭ АГУУЛГА ХАРАГДАНА
            *   (2026-09-04-ний аудит): багц бүрд ГАНЦ `sub|` мөр байдаг бөгөөд
            *   дахин илгээхэд ЯГ ТЭР мөр дээр нэгтгэгддэг (OBJECTID зориуд
            *   хэвээр — хяналтын бүртгэл түүгээр холбогддог). Тиймээс инженер
            *   «би юуг буцаасан юм бэ» гэдгээ эргэж харах боломжгүй. Ядаж
            *   агуулга нь ШИНЭЧЛЭГДСЭНИЙГ ил хэлнэ.
            */}
          {/*
            * ⚠️ ХҮЛЦЭЛ 15 МИНУТ (2026-09-04-ний аудит): `subAt` ба `sentAt` нь
            *   ХОЁР ӨӨР МАШИНЫ клиент цаг — 60 секундын хүлцэл нь ердийн цагийн
            *   зөрүүг «дахин шинэчлэгдсэн» гэж уншиж, хянагч бүрд байнга улаан
            *   анхааруулга гаргаж, ЖИНХЭНЭ давхар шинэчлэлтийн дохиог утгагүй
            *   болгодог байв. Сервер талын нэгдсэн тамга (`EditDate`) энэ
            *   хэлбэрт ирдэггүй тул хүлцлээр далдална: зөвхөн ИЛТ хожуу
            *   шинэчлэлтийг зааж байна.
            */}
          {/*
            * ⚠️ 2026-10-05: ЗӨВШӨӨРЛИЙН ДАРААХ ШИНЭЧЛЭЛТ — хүлцэлгүй. Шатны зөвшөөрөл нь
            *   хянагч агуулгыг уншсаны ДАРАА бичигддэг (`apply` → `subAt` тулгалт) тул
            *   `subAt` түүнээс хожуу бол тэр зөвшөөрөл ЭНЭ агуулгыг хараагүй нь баттай;
            *   15 минутын доторх дахин илгээлт урьд нь ямар ч дохиогүй өнгөрдөг байв.
            *   Мөрийг инженерт буцааж тэглэхгүй (2026-09-07-ны «шинэ тойрог үүсгэхгүй»
            *   шийдвэр · «хуучин мөрийг засахгүй» дүрэм) — зөвхөн ил хэлнэ. Дээрх 15
            *   минутын дүрэм зөвшөөрөлгүй (эхний шатны) мөрд хэвээр.
            */}
          {data.subAt != null && approvedAt != null && approvedAt > 0 && data.subAt > approvedAt ? (
            <div className={s.subWarn} role="alert">
              {tr('Энэ илгээлт өмнөх шатны зөвшөөрлөөс ХОЙШ ({0}) дахин шинэчлэгдсэн — өмнөх зөвшөөрөл энэ агуулгыг ХАРААГҮЙ. Өөрчлөгдсөн нүд бүрийг шинээр хянана уу.', stamp(new Date(data.subAt).toISOString()))}
            </div>
          ) : data.subAt != null && sentAt != null && data.subAt > Date.parse(sentAt) + 15 * 60_000 && (
            <div className={s.subWarn}>
              {tr('Энэ илгээлт {0}-нд ДАХИН шинэчлэгдсэн — доор харагдаж буй нь ХАМГИЙН СҮҮЛИЙН агуулга, энэ мөрөнд илгээгдсэн үеийнх БИШ.', stamp(new Date(data.subAt).toISOString()))}
            </div>
          )}
          {/* ӨӨРЧЛӨГДСӨН НҮДНҮҮД — дарж хүснэгт рүү үсэрнэ.
              ⚠️ Бүтэн хуудсанд 1,370 мөр бий; өөрчлөлт нь ихэвчлэн хэдхэн нүд.
              Жагсаалтгүй бол хянагч тэднийг олох гэж бүх хуудсыг гүйлгэнэ. */}
          {data.changes.length > 0 && (
            <div className={s.chList}>
              <div className={s.chHead}>
                {tr('Өөрчлөгдсөн нүд')}
                <span className={s.chCount}>{data.changes.length}</span>
              </div>
              <div className={s.chWrap}>
                {data.changes.map((c, ci) => (
                  <button
                    key={`${ci}:${c.row}:${c.col}`}
                    type="button"
                    className={`${s.chItem} ${ok?.has(`${c.row}:${c.block}`) ? s.chOk : ''}`}
                    title={`${c.no} · ${fixCyr(c.work)}`}
                    onClick={() => {
                      setJump((j) => ({ row: c.row, block: c.block, n: (j?.n ?? 0) + 1 }));
                      /* ⚠️ 2026-10-07: хүснэгт (`.subSheet`) урт жагсаалтын ДООР — дотоод гүйлгээ биелсэн ч
                         хайрцаг нь дэлгэцийн гадна үлдэж, хянагч «юу ч болсонгүй» гэж хардаг байв. */
                      subSheetRef.current?.scrollIntoView({ block: "nearest" });
                    }}
                  >
                    <span className={s.chBlk}>{c.block}</span>
                    <span className={s.chWork}>{fixCyr(c.work)}</span>
                    <span className={s.chVal}>
                      {/* ⚠️ Обьём өөрчлөгдөөгүй (хувиар бөглөсөн) бол ХУВИЙГ харуулна (2026-09-24) */}
                      {/* ⚠️ 2026-09-25: НЭМЭЛТ («+15») нь нийтийн ард — «өмнөх → нийт (+энэ удаа)».
                          Бөглөгч одоо ӨМНӨХӨӨС ХОЙШ хийснээ бичдэг тул хянагч тэр тоог шууд харна. */}
                      {c.from === c.to && c.toPct !== undefined
                        ? <>{c.fromPct == null ? '—' : pcs(c.fromPct)} → <b>{c.toPct == null ? '—' : pcs(c.toPct)}</b>{incTag(c.incPct, pcs)}</>
                        : <>{c.from == null ? '—' : qty(c.from)} → <b>{qty(c.to)}</b>{incTag(c.inc, qty)}</>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ⚠️ Хүснэгт нь ӨӨРИЙН хүрээндээ хөндлөн гүйнэ — карт өргөсгөхгүй */}
          {/*
            * ⚠️ ЭНЭ НЬ «Гүйцэтгэл бөглөх»-ийн ЯГ ТЭР компонент — хуулбар БИШ.
            *    Гүйцэтгэгч, талбайн инженер, менежер гурвуулаа нэг хүснэгт,
            *    нэг томъёо, нэг толгойг хардаг. Ялгаа нь ЗӨВХӨН нэг нөхцөл:
            *    `view` өгөгдсөн бол нүд засагдахгүй.
            */}
          <div className={s.subSheet} ref={subSheetRef}>
            <Sheet
              view={{
                pkgKey: data.pkgKey,
                day: data.day,
                /*
                 * ⚠️ Илгээлт архивт БАЙХГҮЙ тул `day`-гаар нээвэл хуудас
                 *    хоосон (эсвэл огт өөр агшин) харагдана. `subOid` өгөгдвөл
                 *    бөглөх хуудас архивын сүүлийн жааз дээр ЯГ энэ илгээлтийг
                 *    давхарлаж, хянагч ба бөглөгч НЭГ хүснэгт харна.
                 */
                subOid: data.subOid,
                changed: changedKeys,
                jump,
                ok,
                onCell,
              }}
            />
          </div>

      </>
    </div>
  );
}

/**
 * АЖИЛ ХААНА ЯВААГ 4 ЦЭГЭЭР.
 *
 * ⚠️ Гүйцэтгэгчид энэ нь ХАМГИЙН чухал мэдээлэл: «илгээчихсэн, гэхдээ
 *    хаана байгаа юм бол» гэсэн асуулт нь утасны дуудлага болж хувирдаг.
 *    Төлөвийн шошго ганцаараа «Менежер хянаж байна» гэж хэлдэг ч ХЭДДЭХ
 *    түвшин, хэд үлдсэнийг хэлдэггүй.
 *
 * ⚠️ Гүйцэтгэгчид дээд шатны НЭР харагдахгүй — «2-р шат», «3-р шат» гэж
 *    дугаараар л үзүүлнэ. Дотоод бүтэц нь гадагш задрах ёсгүй.
 */
function Track({ status, stage }: { status: Status; stage: Stage }) {
  const done = status === STATUS.transferred;
  const at = STAGE_ORDER.indexOf(OWNER[status] ?? 'company');
  return (
    <div className={s.track} title={statusLabel(status, stage)}>
      {STAGE_ORDER.map((x, i) => {
        const state = done || i < at ? s.tkDone : i === at ? s.tkNow : s.tkWait;
        return (
          <span
            key={x}
            className={`${s.tk} ${state}`}
            title={seesManager(stage) ? STAGE_LABEL[x] : tr('{0}-р шат', String(i + 1))}
          >
            {done || i < at ? '✓' : i + 1}
          </span>
        );
      })}
    </div>
  );
}

/* ══════════ Нэг ажил ══════════ */

/*
 * ⚠️ 2026-10-23 (UX аудит R2): ХЯНАГЧИЙН ДУТУУ АЖИЛ — ногоон нүд · бичсэн шалтгаан — МОДУЛИЙН түвшинд.
 *    Урьд нь `Item`-ийн локал state байсан тул таб · шүүлт · харагдац солиход (`Item` unmount) 50 ногоон нүд, бичсэн
 *    шалтгаан АСУУЛТГҮЙ устдаг байв. Одоо сешний туршид хадгалагдаж буцаж ирэхэд сэргэнэ — тиймээс тэр үед асуух
 *    шаардлагагүй. Зөвхөн F5 / таб хаахад алдагдана → хөтчийн `beforeunload` асууна (`syncDraftGuard`).
 * ⚠️ `navGuard` БИШ: тэр нь харагдац/таб солиход «Гарвал алдагдана» гэж асуудаг — энд алдагдахгүй тул худал асуулт болно.
 * ⚠️ Ногоон нүд нь `seedKey` (тойрог · дахин шалгалт · мөрийн зөвшөөрөл) ба `subAt` (агуулга)-тай уягдана — агуулга
 *    солигдсон бол хуучин тэмдэг ШИНЭ утгад суухгүй (`seenAt`-ийн 2026-09-25 ⚠️ хэвээр: сэргээсэн `subAt`-аас эхэлнэ).
 * ⚠️ Түлхүүр = `хэрэглэгч|ажил` — нэг табд өөр хэрэглэгч нэвтэрвэл өмнөхийн тэмдэг харагдахгүй.
 */
type ReviewDraft = { seedKey: string; keys: Set<string> | null; reason: string; subAt?: number };
const REVIEW_DRAFTS = new Map<string, ReviewDraft>();
const draftLive = (d: ReviewDraft): boolean => !!d.reason.trim() || (d.keys?.size ?? 0) > 0;
/*
 * ⚠️ 2026-10-23 (засвар): ЗӨВХӨН хөтчийн жинхэнэ (`isTrusted`) unload-д асууна. `LocaleToggle.hasUnsavedWork` нь
 *    хиймэл `beforeunload` шидэж `defaultPrevented`-ийг уншдаг — энд хариулбал харагдац солих · ↻ · хэл солих ·
 *    сешн дуусахад «Хадгалаагүй өөрчлөлт… алдагдана» гэж ХУДЛАА асууна (ноорог модулийн түвшинд хадгалагддаг тул
 *    алдагдахгүй). Сонсогч Guitsetgel-ээс гарсны дараа ч үлдэнэ — зөв: ноорог F5-д л алдагдана.
 */
function onDraftUnload(e: BeforeUnloadEvent): void {
  if (!e.isTrusted) return;
  e.preventDefault();
  e.returnValue = '';
}
let draftGuardOn = false;
function syncDraftGuard(): void {
  if (typeof window === 'undefined') return;
  const on = [...REVIEW_DRAFTS.values()].some(draftLive);
  if (on === draftGuardOn) return;
  draftGuardOn = on;
  if (on) window.addEventListener('beforeunload', onDraftUnload);
  else window.removeEventListener('beforeunload', onDraftUnload);
}
/** Одоо шийдвэрлэх боломжтой ажлуудад хамааралгүй (өөр хүн шийдсэн · хэрэглэгч солигдсон) ноорогуудыг хаяна */
function pruneDrafts(live: ReadonlySet<string>): void {
  let hit = false;
  for (const k of REVIEW_DRAFTS.keys()) if (!live.has(k)) { REVIEW_DRAFTS.delete(k); hit = true; }
  if (hit) syncDraftGuard();
}

function Item({ work, stage, who, me, bypass, onFix, readOnly, isSuper, blockedWhy, onDone }: {
  work: Work; stage: Stage; who: string;
  /**
   * ⚠️ 2026-10-23 (UX аудит R1): энэ хэрэглэгч ЗӨВШӨӨРЧ ЧАДАХГҮЙ шалтгаан (`hyanaltStore.selfBlocks` — өөрийн илгээлт /
   *    өөр шатанд зөвшөөрсөн). Өгөгдвөл зөвшөөрөх · дээш илгээх товч УРЬДЧИЛАН хаагдаж шалтгаан ил бичигдэнэ — урьд нь
   *    дарсны ДАРАА л татгалзал гардаг байв. Буцаах зам нээлттэй (`authz` буцаалтад эдгээрийг шалгадаггүй).
   */
  blockedWhy?: string;
  /** ⚠️ 2026-10-23 (UX аудит R3): шийдвэр амжилттай — ажил жагсаалтаас шилжихээс өмнө эцэгт «хаашаа явсан»-ыг хэлнэ */
  onDone?: (msg: string) => void;
  /** ⚠️ 2026-09-30: буцаагдсан ажлын багц/илгээлтийг дамжуулна (`goFix`-ийн ⚠️) */
  onFix: (w: Work) => void;
  /**
   * ЭРХИЙН ШАЛГУУРЫН ХЭРЭГЛЭГЧИЙН НЭР (ArcGIS username).
   *
   * ⚠️ `who`-ГООС ТУСДАА (2026-09-16-ны аудит): `who` нь ArcGIS-д
   *    БИЧИГДЭХ дэлгэцийн бүтэн нэр (давхардаж, солигдож болно), энэ нь
   *    ACL-ийн ТҮЛХҮҮР. `hyanaltStore.authz` нь домэйн түвшинд түүгээр
   *    шат ба багцын хүрээг шалгана — UI-ийн `readOnly`/`mine` нь
   *    зурагдалтын шийдвэр тул консолын дуудлагыг барьдаггүй байв.
   */
  me?: string;
  /**
   * Домэйн шалгуурыг ТОЙРУУЛАХ — нэвтрэлт унтраалттай (дев) эсвэл админ
   * шатаа ил сонгосон үед. ⚠️ Эс бөгөөс тэр хоёр орчинд хяналт ажиллахгүй.
   */
  bypass?: boolean;
  /**
   * Системийн админ уу (`resolveFlowStage().canPick`).
   *
   * ⚠️ ЗӨВХӨН «Бүгдийг зөвшөөрөх» товчийг нээхэд хэрэглэнэ. Жинхэнэ хянагчид
   * нүд бүрийг ГАРААР зөвшөөрсөн хэвээр байх ЁСТОЙ (2026-08-27-ны шийдвэр:
   * «нэг товчоор бүгдийг батлах зам байвал хяналт нь ёсорхуу дарах үйлдэл
   * болно»). Super нь системийн тохируулагч тул тэр дүрмээс чөлөөлөгдөнө.
   */
  isSuper?: boolean;
  /**
   * ⚠️ ЗӨВХӨН ХАРАХ. Урсгалын шатанд томилогдоогүй үүрэг (жиш. `beginner`)
   * энэ хуудсыг үзэж чадах ч зөвшөөрөх/буцаах ЁСГҮЙ — эс бөгөөс шат сонгох
   * товчоор дамжуулан хэн ч хянагч болж чадна.
   */
  readOnly?: boolean;
}) {
  /* ⚠️ 2026-10-23 (UX аудит R2): дутуу ажлын ноорог (`REVIEW_DRAFTS`) — байвал нээлттэй, шалтгаан сэргэнэ */
  const dk = `${(me ?? '').trim().toLowerCase()}|${work.key}`;
  const [open, setOpen] = useState(() => REVIEW_DRAFTS.has(dk));
  const [reason, setReason] = useState(() => REVIEW_DRAFTS.get(dk)?.reason ?? '');
  /* ⚠️ 2026-10-12 (R2): шийдвэрийн алдаа модулийн store-д (`hyanaltStore.useDecisionErr`) — STALE/`movedSince`
     үед жагсаалт шинэчлэгдэж ажил «минийх» ↔ «бусад» хооронд шилжихэд `Item` дахин mount болж локал state
     алга болдог тул хэрэглэгч ямар ч мессеж хардаггүй байв. */
  const err = useDecisionErr(work.key);
  const setErr = useCallback((t: string) => setDecisionErr(work.key, t), [work.key]);
  /* ⚠️ 2026-10-12 (R1): шалтгааны талбарын дээд урт — баганын урт (`reasonMax`), уншигдтал 2000 */
  const [reasonLim, setReasonLim] = useState(REASON_MAX);
  /** Хагас амжилтын анхааруулга — алдаанаас ТУСДАА (шар) */
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);

  const cur = work.current;
  const st = work.status;

  /**
   * НҮД БҮРИЙГ ГАРААР ЗӨВШӨӨРНӨ.
   *
   * ⚠️ Урьд нь «Зөвшөөрөх» товч нь өөрчлөлтийг ХАРААГҮЙ ч дарагддаг байв —
   *    тэгвэл хяналт нь ёсорхуу тамга болно. Одоо өөрчлөгдсөн нүд бүр дээр
   *    дарж ногоон болгосны дараа л цаашаа шилжинэ. Ногоон болоогүй нүд нь
   *    АСУУДАЛТАЙ гэсэн үг — тэдгээр нь улаанаараа үлдэж, буцаах шалтгаанд
   *    өөрсдөө жагсаагдана.
   */
  /* ⚠️ `null` = илгээлтийн агуулга хараахан татагдаагүй/унасан → батлах ХААЛТТАЙ
     (`lack`-тэй ижил гурван төлөв, 2026-09-06). */
  const [changes, setChanges] = useState<Change[] | null>(null);
  /** Хянагчийн ХАРСАН илгээлтийн агшин — `apply`-ийн `subAt` (2026-09-24) */
  const [subAt, setSubAt] = useState<number | undefined>(undefined);
  /**
   * Үйлчилгээнд 4-р шатны талбар байгаа эсэх.
   * ⚠️ Байхгүй үед «Батлах» дарвал ArcGIS алдаа буцааж, менежер баталсан
   *    гэж бодох боловч юу ч хадгалагдахгүй. Тиймээс ӨМНӨӨС нь хаана.
   */
  /**
   * ⚠️ ГУРВАН ТӨЛӨВ (2026-09-04-ний аудит): `[]` = бүгд бэлэн, `[…]` = дутуу,
   *    `null` = ШАЛГАЖ ЧАДСАНГҮЙ. Урьд нь уншилтын алдаа `[]` болж буцдаг
   *    байсан тул метадата татагдаагүй үед «бүгд бэлэн» гэж уншигдаж, товч
   *    ИДЭВХТЭЙ үлддэг байв — талбар үнэхээр дутуу бол `applyEdits` танихгүй
   *    талбарыг чимээгүй алгасах тул хэн батласан нь бүртгэлгүй үлдэнэ.
   *    Тодорхойгүй үед ч товчийг ХААНА.
   */
  /* ⚠️ ЭХНИЙ УТГА `null` (2026-09-04-ний аудит): урьд нь `[]` (= «бүгд бэлэн»)
     байсан тул метадата татагдах хүртэлх завсарт (эсвэл сүлжээ удаан үед) товч
     ИДЭВХТЭЙ үлдэж, талбар үнэхээр дутуу бол `applyEdits` танихгүй талбарыг
     чимээгүй алгасаж «хэн батласан» бүртгэлгүй үлддэг байв. Уншилт дуустал
     ХААЛТТАЙ; төлөвлөлтийн ахлах инженерийн шат биш бол ил `[]` тавина. */
  /** «Дахин шалгах» — тоолуур ахих бүрд эффект дахин ажиллана. */
  const [lackTry, setLackTry] = useState(0);
  /* ⚠️ 4·5·6·7-р шат — үйлчилгээнд гараар нэмсэн талбарууд (`DIRECTOR_FIELDS`).
     ⚠️ 2026-10-23: төлөвлөлтийн инженер (`planner`) ч — түүний 5 талбарыг notebook-оор нэмнэ. */
  const lackNeeded = stage === 'planner' || stage === 'director' || stage === 'head' || stage === 'chief';
  /*
   * ⚠️ 2026-09-30 (eslint `set-state-in-effect`): урьд нь эффект эхэндээ `setLack([])`/
   *    `setLack(null)` синхроноор дууддаг байв. Одоо уншилтын үр дүнг ТҮЛХҮҮРТЭЙ
   *    хадгална (`stage` · «Дахин шалгах» тоолуур): түлхүүр зөрвөл `null` (= уншиж
   *    байна, товч ХААЛТТАЙ), дээд шат биш бол ил `[]`. Утга урьдын ижил.
   */
  const lackKey = `${stage}|${lackTry}`;
  const [lackRes, setLackRes] = useState<{ key: string; m: string[] } | null>(null);
  const lack: string[] | null = !lackNeeded ? [] : (lackRes && lackRes.key === lackKey ? lackRes.m : null);
  useEffect(() => {
    if (!lackNeeded) return;
    let alive = true;
    /*
     * ⚠️ ТҮР ЗУУРЫН АЛДААНД ДАХИН ОРОЛДОНО (2026-09-04-ний аудит):
     *    `missingDirectorFields` нэг л удаа дуудагддаг байсан тул хуудас нээх
     *    агшны нэг 429/таймаут нь БҮХ ажил дээрх батлах товчийг хуудас дахин
     *    ачаалах хүртэл хаадаг байв. Богино завсарлагатай 3 оролдлого, дараа
     *    нь хэрэглэгчид «Дахин шалгах» товч үлдэнэ.
     */
    (async () => {
      for (let i = 0; i < 3; i += 1) {
        const m = await missingDirectorFields();
        if (!alive) return;
        if (m != null) { setLackRes({ key: lackKey, m }); return; }
        if (i < 2) await new Promise((r) => { setTimeout(r, 400 * (i + 1)); });
      }
    })();
    return () => { alive = false; };
  }, [lackNeeded, lackKey]);
  /** Товчийг хаах уу — дутуу ЭСВЭЛ тодорхойгүй бол ХАА. */
  const lackBlocks = lack == null || lack.length > 0;
  /**
   * ДЭЭД ШАТНААС БУЦСАНЫГ ДАХИН ШАЛГАХ — хоёр газарт давтагдана.
   * ⚠️ Буцаалт нэг алхам л ухардаг тул дахин шалгагч нь ДАМЖУУЛАГЧ БИШ:
   *    асуудалгүй бол дээшээ эргүүлж илгээнэ, асуудалтай бол доошоо буцаана.
   */
  const upperOfMe = stage !== 'company' ? nextReview(stage) : null;
  /* ⚠️ 2026-10-12 (R1): аль шатны шалтгааны багана руу бичигдэх вэ — ердийн хяналт (`apply`) ба дахин шалгалт
     (`recheck`, `reBy` = энэ шат) хоёулаа ӨӨРИЙН шатных (`SF[stage].reason`) */
  const reasonStage: ReviewStage | null = stage === 'company' ? null : (stage as ReviewStage);
  useEffect(() => {
    if (!reasonStage) return;
    let alive = true;
    void reasonMax(reasonStage).then((n) => { if (alive) setReasonLim(n); });
    return () => { alive = false; };
  }, [reasonStage]);
  /*
   * ⚠️ ТОЙРОГ СОЛИГДОХОД ЗӨВШӨӨРЛИЙГ ТЭГЛЭНЭ (2026-09-15-ны аудит).
   *
   * `work.key` нь `багц|ажил|компани` тул буцаагдаад ДАХИН илгээгдсэн ажил
   * дээр `Item` unmount БОЛОХГҮЙ: `changes` нь шинэ `sheetOid`-оор дахин
   * ачаалагдахад ӨМНӨХ тойргийн зөвшөөрлүүд хэвээр үлдэж, хянагч нэг ч нүд
   * харалгүйгээр «Батлах» товч идэвхтэй болдог байв — «нүд бүрийг гараар
   * зөвшөөрнө» гэсэн үндсэн дүрмийн шууд зөрчил.
   */
  const curSheetOid = cur?.[F.sheetOid];
  /*
   * ⚠️ ДАХИН ШАЛГАЛТАД мөрийн `Zovshoorson_nud`-аас ЭХЛҮҮЛНЭ (2026-09-24):
   *    урьд нь recheck горимд нүд тэмдэглэгддэггүй тул `badText()` БҮХ
   *    өөрчлөлтийг «зөвшөөрөгдөөгүй» гэж жагсаадаг байв. Ердийн хяналтад
   *    (`reviewing`) урьдын адил ХООСНООС — нүд бүрийг гараар зөвшөөрнө.
   */
  const curOkRaw = cur?.[F.okCells];
  const recheckSeed = !!upperOfMe && st === RETURNED_STATUS[upperOfMe];
  /** ⚠️ 2026-10-01: илгээлтийн мөрүүд шинэ жааз руу зөөгдсөн эсэх — `Submitted`-ээс */
  const [remapped, setRemapped] = useState<boolean | undefined>(undefined);
  /** ⚠️ 2026-10-12 (R5): тулгагдаагүй нүдний тоо — `Submitted.onUnmoved`; > 0 бол батлах (дээш илгээх) ХААЛТТАЙ */
  const [unmoved, setUnmoved] = useState<number | undefined>(undefined);
  /** ⚠️ 2026-10-22 (аудит): НИЙТ СӨРӨГ болох нэмэлтийн нүдний тоо — `Submitted.onNegative`; > 0 бол батлах (дээш илгээх) ХААЛТТАЙ */
  const [negative, setNegative] = useState<number | undefined>(undefined);
  /** ⚠️ 2026-10-22 (хэрэглэгч): сөрөг нүдний НЭР — батлах товчны шалтгаанд (`approveWhy`) хаана гэдгийг хэлнэ */
  const [negCells, setNegCells] = useState<string[]>([]);
  /**
   * ӨӨРЧЛӨГДСӨН НҮДНИЙ МӨРҮҮДИЙН ТОГТВОРТОЙ ТАНИГЧ — индексээр (`Change.row` → `{oid, sid}`).
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): зөвшөөрлийг индексээр БИШ үүгээр бичиж/уншина
   *    (`hyanaltOkCells`). Сийрэг массив — зөвхөн өөрчлөгдсөн мөрүүд.
   */
  const okRows = useMemo(() => {
    const arr: ({ oid: number; sid: string } | undefined)[] = [];
    for (const c of changes ?? []) {
      const cut = c.rid ? c.rid.indexOf('|') : -1;
      if (!c.rid || cut <= 0) continue;
      const oid = Number(c.rid.slice(0, cut));
      if (Number.isFinite(oid)) arr[c.row] = { oid, sid: c.rid.slice(cut + 1) };
    }
    return arr;
  }, [changes]);
  /** Хуучин (индексийн) зөвшөөрөл бичигдсэн агшин — дээд шатны буцаалтын огноо */
  const okWrittenAt = upperOfMe ? Date.parse(String((cur as Record<string, unknown> | undefined)?.[SF[upperOfMe].returned] ?? '')) : NaN;
  /*
   * ⚠️ 2026-09-30 (eslint `set-state-in-effect`): урьд нь эффект `[curSheetOid,
   *    recheckSeed, curOkRaw]` солигдоход `setOkKeys(seed)` дууддаг байв. Одоо
   *    ЭХЛЭЛ (`seed`) нь зурагдалтаас гарна, хэрэглэгчийн товшилт нь тэр ЭХЛЭЛИЙН
   *    ТҮЛХҮҮРТЭЙ давхарга (`okOv`) — түлхүүр солигдмогц давхарга хүчингүй, ЭХЛЭЛ
   *    рүү буцна. Дээрх гурван ⚠️-ийн зан төлөв (тойрог/агуулга солигдоход тэглэх,
   *    дахин шалгалтад мөрийн `Zovshoorson_nud`-аас эхлэх) ижил хэвээр.
   */
  const seedKey = `${curSheetOid}|${recheckSeed}|${curOkRaw}`;
  /*
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): мөрийн ТОГТВОРТОЙ түлхүүрээр тулгана
   *    (`resolveOk`). Хуучин индексийн хэлбэрт ЗӨВХӨН мөрийн дараалал бичигдсэн
   *    агшныхтай ижил нь баттай үед итгэнэ: илгээлт шинэ жааз руу зөөгдөөгүй
   *    (`remapped === false`) БӨГӨӨД агуулга нь зөвшөөрөл бичигдсэнээс хойш
   *    шинэчлэгдээгүй (`subAt ≤ okWrittenAt`). Эс бөгөөс «мэдэхгүй» (`unknown`) —
   *    буруу нүдийг ногоон болгохгүй, доор «дахин хянана уу» гэж хэлнэ.
   *    Агуулга татагдтал (`changes == null`) хоосон.
   */
  /*
   * ⚠️ 2026-10-06 (аудит #4): ХУУЧИРСАН ЭСЭХ (`subAt ≤ okWrittenAt`) ШИНЭ (v2) хэлбэрт Ч
   *    үйлчилнэ. Урьд нь зөвхөн хуучин индексийн хэлбэрт шалгагддаг тул мөрийн ID-аар
   *    бичигдсэн зөвшөөрөл агуулга дахин илгээгдсэний ДАРАА ч ногоон суудаг байв — доорх
   *    «Дахин шалгалтад ч ХООСНООС … ХУУЧИН агуулгын зөвшөөрөл» ⚠️-тэй зөрчилтэй. Одоо
   *    агуулга зөвшөөрөл бичигдсэнээс хойш шинэчлэгдсэн (эсвэл мэдэхгүй) бол ХООСНООС.
   */
  /* ⚠️ 2026-10-12 (дарааллын аудит, №4): `fresh` ч буцаана — доорх `recheckOkArg` «дээд шатны жагсаалтыг хэвээр
     үлдээх үү» гэдгийг үүгээр шийднэ */
  const seedRes = useMemo(() => {
    if (!recheckSeed || changes == null) return { keys: new Set<string>(), unknown: 0, fresh: false };
    /* ⚠️ 2026-10-12 (R10): агуулга ачаалагдсан (`changes != null`) атлаа `subAt` алга = ӨӨРЧЛӨГДӨХГҮЙ зам (архивласан
       `done|` эсвэл хуучин legacy агшин — `hyanaltDetail.loadArchived`): тэр агуулга зөвшөөрөл бичигдсэнээс хойш
       шинэчлэгдэх боломжгүй тул «шинэ» гэж үзнэ. Урьд нь `subAt == null` → үргэлж хоосноос эхэлдэг байв. */
    const fresh = subAt == null || (Number.isFinite(okWrittenAt) && subAt <= okWrittenAt);
    if (!fresh) return { keys: new Set<string>(), unknown: 0, fresh: false };
    const trusted = remapped === false && fresh;
    return { ...resolveOk(parseOkCells(curOkRaw), okRows, trusted), fresh: true };
  }, [recheckSeed, curOkRaw, changes, okRows, remapped, subAt, okWrittenAt]);
  const seed = seedRes.keys;
  /* ⚠️ 2026-10-23 (UX аудит R2): ноорогоос сэргэнэ — `seedKey` зөрвөл (шинэ тойрог) доорх `okKeys0` түүнийг үл тоомсорлоно */
  const [okOv, setOkOv] = useState<{ key: string; keys: Set<string> } | null>(() => {
    const d = REVIEW_DRAFTS.get(dk);
    return d?.keys ? { key: d.seedKey, keys: d.keys } : null;
  });
  /**
   * ⚠️ 2026-10-22 (аудит): НИЙТ СӨРӨГ НҮД (`Change.neg`) ХЭЗЭЭ Ч ЗӨВШӨӨРӨГДӨХГҮЙ — ногоон тэмдэг (товшилт · «бүгдийг
   *    ногоон» · дээд шатны буцаалтын жагсаалт) тэдэнд суухгүй, `okCells`-д ч бичигдэхгүй. Урьд нь хянагч сөрөг нүдийг
   *    ногоон болгож буцаахад гүйцэтгэгчийн талд тэр нүд түгжигдэж (`FillNew.okLockAt`), харин «Илгээх» сөрөг нүдээр
   *    хаагддаг тул гүйцэтгэгч засах ч, илгээх ч боломжгүй гацдаг байв.
   */
  const negSet = useMemo(
    () => new Set((changes ?? []).filter((c) => c.neg).map((c) => `${c.row}:${c.block}`)),
    [changes],
  );
  const okKeys0 = okOv && okOv.key === seedKey ? okOv.keys : seed;
  const okKeys = useMemo(
    () => (negSet.size ? new Set([...okKeys0].filter((k) => !negSet.has(k))) : okKeys0),
    [okKeys0, negSet],
  );
  /**
   * ⚠️ 2026-10-12 (дарааллын аудит, №4): ДООШ БУЦААХ (`recheck('back')`) үед `Zovshoorson_nud`-д юу дамжуулах вэ.
   *    Дээд шатны буцаалтаар бичигдсэн жагсаалт нь АНХДАГЧ (seed): дахин шалгагч нэг ч нүд хөндөөгүй
   *    (`okOv` алга / хуучирсан түлхүүр) бөгөөд агуулга зөвшөөрөл бичигдсэнээс хойш шинэчлэгдээгүй (`fresh`)
   *    бол `undefined` — талбар ХӨНДӨГДӨХГҮЙ, дээд шатны жагсаалт гүйцэтгэгчид хэвээр очно (урьд нь `seed`
   *    «мэдэхгүй» (`unknown`) үед `[]` бичигдэж дээд шатны зөвшөөрөл дарагддаг байв). Дахин шалгагч ИЛ өөрчилсөн
   *    бол түүний жагсаалт; агуулга ШИНЭЧЛЭГДСЭН (`fresh` худал — 2026-10-06 аудит #4: хуучин агуулгын зөвшөөрөл
   *    хүчингүй) эсвэл татагдаагүй (`changes == null` — R4) бол урьдын адил ил жагсаалт / `[]`.
   */
  const recheckOkArg = (): string[] | undefined => {
    if (changes == null) return [];
    const untouched = !okOv || okOv.key !== seedKey;
    /* ⚠️ 2026-10-22 (аудит): дээд шатны жагсаалтад СӨРӨГ нүд (`negSet`) байвал ХЭВЭЭР дамжуулахгүй — сөрөггүй жагсаалтыг
       ил бичнэ (`okKeys` шүүгдсэн); эс бөгөөс тэр нүд гүйцэтгэгчид «зөвшөөрөгдсөн» (түгжээтэй) болж очдог байв. */
    const seedNeg = [...seed].some((k) => negSet.has(k));
    if (untouched && seedRes.fresh && !seedNeg) return undefined;
    return toOkRefs(okKeys, okRows);
  };
  const setOkKeys = useCallback((upd: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setOkOv((prev) => {
      const base = prev && prev.key === seedKey ? prev.keys : seed;
      return { key: seedKey, keys: typeof upd === 'function' ? upd(base) : upd };
    });
  }, [seedKey, seed]);
  /*
   * ⚠️ АГУУЛГА СОЛИГДОХОД ЗӨВШӨӨРЛИЙГ ТЭГЛЭНЭ (2026-09-25-ны аудит).
   *    Гүйцэтгэгч ИЖИЛ `sub|` мөр дээр дахин илгээхэд (`reused`) `sheetOid`,
   *    төлөв, `Zovshoorson_nud` гурав өөрчлөгддөггүй тул дээрх effect
   *    ажилладаггүй: хуучин агуулгад тавьсан ногоон тэмдэг ШИНЭ утгатай
   *    нүдэн дээр үлдэж, `allOk` үнэн болон ХАРААГҮЙ утга батлагддаг байв.
   *    Ачаалагдсан `subAt` (`payload.at`) ӨӨР утга болоход тэглэнэ.
   * ⚠️ `undefined`-ыг алгасна: `Submitted` дахин нээгдэх бүрд эхлээд
   *    `undefined` илгээдэг — хураагаад дэлгэхэд тэмдэглэгээ арилах ёсгүй.
   * ⚠️ Дахин шалгалтад ч ХООСНООС (мөрийн `Zovshoorson_nud` биш): тэр нь
   *    ХУУЧИН агуулгын зөвшөөрөл.
   */
  /* ⚠️ 2026-10-23 (UX аудит R2): ноорогийн агуулгын агшнаас эхэлнэ — буцаж ирэхэд агуулга шинэчлэгдсэн бол тэглэгдэнэ */
  const seenAt = useRef<number | undefined>(REVIEW_DRAFTS.get(dk)?.subAt);
  useEffect(() => {
    if (subAt == null) return;
    const was = seenAt.current;
    seenAt.current = subAt;
    if (was != null && was !== subAt) setOkKeys(new Set());
    /* ⚠️ `setOkKeys` нь эхлэлийн түлхүүртэй (2026-09-30) — солигдоход дахин ажиллана; `was === subAt` тул тэглэхгүй */
  }, [subAt, setOkKeys]);
  /* ⚠️ 2026-10-23 (UX аудит R2): ногоон нүд · шалтгааныг модулийн ноорогт бичнэ (`REVIEW_DRAFTS`-ийн ⚠️). Хэрэглэгч
     хөндөөгүй (`okOv` алга / хуучирсан) бол нүд ноорог БИШ. Хоосон бол устгана. */
  useEffect(() => {
    const keys = okOv && okOv.key === seedKey ? okOv.keys : null;
    const d: ReviewDraft = { seedKey, keys, reason, subAt: subAt ?? seenAt.current };
    if (draftLive(d)) REVIEW_DRAFTS.set(dk, d);
    else REVIEW_DRAFTS.delete(dk);
    syncDraftGuard();
  }, [dk, okOv, seedKey, reason, subAt]);
  /** `Submitted`-ийг дахин ачаалуулах тоолуур — «агуулга өөрчлөгдсөн» үед */
  const [subReload, setSubReload] = useState(0);
  /* ⚠️ 2026-10-22 (аудит): сөрөг нийттэй нүдийг (`negSet`) ногоон болгохгүй — татгалзлын шалтгааныг буцаана, хүснэгт
     (`FillRows`) түүнийг харуулна. Батлах товч `negBlocks`-оор аль хэдийн хаалттай; энэ нь «Буцаах»-ын `okCells`-ийг хамгаална. */
  const toggleOk = useCallback((row: number, block: string): string | undefined => {
    const k = `${row}:${block}`;
    if (negSet.has(k))
      return tr('Энэ нүдний нийт сөрөг (суурь утгаас их хасалт) — зөвшөөрөх боломжгүй. Гүйцэтгэгчээр залруулуулж дахин илгээүүлнэ үү (буцааж болно).');
    setOkKeys((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
    return undefined;
  }, [setOkKeys, negSet]);
  /** Хараахан зөвшөөрөөгүй = асуудалтай гэж үзэх өөрчлөлтүүд */
  const bad = (changes ?? []).filter((c) => !okKeys.has(`${c.row}:${c.block}`));
  const allOk = changes != null && changes.length > 0 && bad.length === 0;

  /**
   * Буцаах шалтгаанд асуудалтай нүднүүд ӨӨРСДӨӨ орно.
   * ⚠️ «Зөв биш байна» гэсэн ганц өгүүлбэр нь гүйцэтгэгчид юу засахыг
   *    хэлдэггүй — аль блокийн аль ажил нь болохыг нэрлэж өгнө.
   */
  const badText = () => {
    if (!bad.length) return reason.trim();
    const list = bad
      .slice(0, 12)
      /* ⚠️ Обьём өөрчлөгдөөгүй (хувиар бөглөсөн) бол хувийг нэрлэнэ (2026-09-24) */
      /* ⚠️ 2026-09-25: обьёмыг `qty`-ээр (мянгатын тусгаарлагч, 3 орон) — түүхий тоо `1234.56789` буцаалтын шалтгаанд ордог байв */
      .map((c) => `${c.block} · ${fixCyr(c.work)} → ${c.from === c.to && c.toPct !== undefined ? (c.toPct == null ? '—' : pcs(c.toPct)) : qty(c.to)}`)
      .join("; ");
    const more = bad.length > 12 ? ` … +${bad.length - 12}` : "";
    const head = tr("Зөвшөөрөгдөөгүй {0} нүд: ", String(bad.length));
    return [reason.trim(), head + list + more].filter(Boolean).join(" | ");
  };
  const mine = !readOnly && work.owner === stage && st !== STATUS.transferred;

  /*
   * ⚠️ ХАГАС АМЖИЛТЫГ ч ХАРУУЛНА (2026-09-06). Батлалт бүтсэн атлаа
   * нэгтгэлд бүртгэгдээгүй тохиолдол урьд нь ЗӨВХӨН `console.warn` байсан
   * тул батлагдсан гүйцэтгэл дашбоардад хэзээ ч гарахгүйг менежер ч, админ
   * ч мэддэггүй байв. `ok: true` тул шийдвэрийг буцаахгүй — гагцхүү
   * анхааруулгыг ил гаргана.
   */
  /* ⚠️ 2026-10-23 (UX аудит R3): `okMsg` — амжилтын дараа эцэгт (`onDone`) «→ дараагийн шат руу илгээгдлээ»; ажил
     жагсаалтаас ЧИМЭЭГҮЙ алга болдог байв. Ноорог (R2) мөн цэвэрлэгдэнэ. */
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; warn?: string; contentChanged?: true }>, okMsg?: string) => {
    if (busy) return;
    setBusy(true);
    /* ⚠️ 2026-10-06 аудит: (1) ЭЦСИЙН батлалт архивт БҮТЭН ЖААЗ бичдэг (≈1,400 мөр, 500-аар
       багцлан `applyAdds`) — бичилт явж байхад F5/таб хаах/харагдац солихыг АСУУНА (`navGuard` →
       `beforeunload` · Portal), FillNew-ийн 'fillnew-send'-ийн ижил; урьд нь хамгаалалтгүй тул
       тасарвал хагас жааз үлдэж багцыг түгжинэ. Бусад шийдвэр (буцаах · дахин шалгах) мөн бичилт
       тул бүгдийг хамгаална. (2) `fn()` шидвэл урьд нь `busy` үүрд үнэн үлдэж, алдаа огт
       харагддаггүй байв — `catch`-д харуулж `finally`-д ЗААВАЛ суллана. */
    /* ⚠️ 2026-10-23: түлхүүр АЖИЛ БҮРД (`work.key`) — урьд нь бүх `Item` НЭГ 'hyanalt-apply' түлхүүр хуваалцдаг тул
       хоёр ажлын шийдвэр зэрэг явж байхад эхэлж дууссаных нь `finally` тугийг унтрааж, нөгөөгийн бичилт хамгаалалтгүй
       (F5/таб хаах асуулгүй) үлддэг байв. Нэр (label) нь ижил — Portal-ын `navBusyLabels` нэрээр шүүнэ. */
    const guardKey = `hyanalt-apply:${work.key}`;
    setNavDirty(guardKey, true, tr('Гүйцэтгэлийн шийдвэр хадгалж байна'));
    let r: Awaited<ReturnType<typeof fn>>;
    try {
      r = await fn();
    } catch (e) {
      setErr(userError(e));
      setWarn('');
      return;
    } finally {
      setNavDirty(guardKey, false);
      setBusy(false);
    }
    /* ⚠️ Агуулга өөрчлөгдсөн бол ШИНЭЭР татна (дээрх `reloadKey`-ийн ⚠️) */
    if (r.contentChanged) setSubReload((n) => n + 1);
    /* ⚠️ Анхааруулга (`warn`) нь АЛДАА БИШ — тусдаа шар мөрөөр (2026-09-23);
       урьд нь улаан `error` ангилалд орж «бүтсэнгүй» гэж уншигддаг байв. */
    /* ⚠️ 2026-10-06 аудит: түүхий серверийн мөрийг `userError`-оор */
    setErr(r.ok ? '' : (r.error ? userError(r.error) : tr('Алдаа гарлаа')));
    setWarn(r.ok ? (r.warn ?? '') : '');
    if (r.ok) {
      setReason('');
      setOkOv(null);
      REVIEW_DRAFTS.delete(dk);
      syncDraftGuard();
      if (okMsg) onDone?.(okMsg);
    }
  };
  /** ⚠️ 2026-10-23 (UX аудит R3): амжилтын мессеж — ажил хаашаа явсныг нэрлэнэ */
  const sentTo = (x: ReviewStage | null): string => (x
    ? tr('«{0}» — {1} руу илгээгдлээ.', ajilLabel(work.ajil), STAGE_LABEL[x])
    : tr('«{0}» — батлагдаж архивт бүртгэгдлээ.', ajilLabel(work.ajil)));
  const backTo = (x: Stage): string => tr('«{0}» — {1} руу буцаалаа.', ajilLabel(work.ajil), lowerLabel(x));

  /* ⚠️ 2026-10-04: `apply`-ийн `warn`-ыг store (`useApplyWarns`) хуудасны дээд хэсэгт
     харуулна — энд давхар гаргахгүй (мөр «бусад» руу шилжвэл энэ state алга болдог байв). */
  const review = (decision: (typeof DECISION)[keyof typeof DECISION]) =>
    run(async () => ({ ...(await apply({
      oid: cur.__oid,
      /* ⚠️ `mine` (owner === stage) ба `reviewing` тул энд компани байхгүй */
      stage: stage as ReviewStage,
      decision,
      reason: decision === DECISION.return ? badText() : reason,
      who,
      /* ⚠️ `me` нь ЭРХИЙН түлхүүр (ArcGIS username), `who` нь БИЧИГДЭХ
         дэлгэцийн нэр — хоёр өөр зорилго (`hyanaltStore.authz`). */
      me,
      /* ⚠️ Нэвтрэлт унтраалттай (дев) эсвэл админ шатаа ил сонгосон үед л
         домэйн шалгуурыг тойруулна — эс бөгөөс тэр хоёр орчинд ажиллахгүй. */
      bypass,
      /*
       * ⚠️ ЗӨВШӨӨРСӨН НҮДНҮҮД (2026-09-22). Урьд нь `okKeys` нь ЗӨВХӨН
       *    React state байсан тул хуудас хаагдмагц алга болж, буцаагдсан
       *    гүйцэтгэгч аль нүдээ засахаа мэдэхгүй байв — бүх өөрчилсөн нүд
       *    ижил харагдана. Одоо ArcGIS-д хадгалагдаж, гүйцэтгэгчийн талд
       *    НОГООН (зөвшөөрсөн) ↔ УЛААН (зөвшөөрөөгүй) гэж ялгарна.
       */
      /* ⚠️ 2026-10-01: мөрийн ТОГТВОРТОЙ түлхүүрээр (`toOkRefs`). Агуулга татагдаагүй
         үед буцаалт «нэг ч нүд зөвшөөрөөгүй» (`[]`) — урьдын адил. */
      okCells: changes != null ? toOkRefs(okKeys, okRows) : [],
      /* ⚠️ Илгээлтийн агуулгын тулгалт (2026-09-24) — `hyanaltStore.apply`-ийн `subAt` */
      subAt,
    })), warn: undefined }), decision === DECISION.approve ? sentTo(nextReview(stage as ReviewStage)) : backTo(stage));

  const reviewing = stage !== 'company' && st === REVIEW_STATUS[stage];
  /** ⚠️ 2026-09-30: батлах товч ХААЛТТАЙ байгаа шалтгаан — tooltip ба ил бичвэрт нэг эх */
  /* ⚠️ 2026-10-12 (R5): тулгагдаагүй нүдтэй илгээлтийг дунд шатанд ч батлахгүй (`prevError`-ийн ижил хаалт) */
  const unmovedBlocks = (unmoved ?? 0) > 0;
  /* ⚠️ 2026-10-22 (аудит): НИЙТ СӨРӨГ болох нэмэлттэй илгээлтийг ч (`Submitted.onNegative`) — `unmovedBlocks`-ийн ижил хаалт
     БҮХ шатанд. Урьд нь зөвхөн 6-р шатны архивлалт татгалздаг тул доод шатнууд 0-оор хаасан утгыг харж баталдаг байв.
     Шалтгааны бичвэр нь архивлалтын алдаатай ижил. `unmoved`-ийн бичвэр одоо хоёр шалтгааныг (тулгалт · тоо биш) нэрлэнэ. */
  const negBlocks = (negative ?? 0) > 0;
  /* ⚠️ 2026-10-23 (UX аудит R1): өөрийн илгээлт / өөр шатанд зөвшөөрсөн (`blockedWhy` — `selfBlocks`) ЭХЭНД — нүд ногоон
     болгохоос ӨМНӨ хэлнэ (урьд нь бүгдийг ногоон болгож «Зөвшөөрөх» дарсны дараа л татгалздаг байв) */
  const approveWhy: string | undefined = blockedWhy ?? (changes == null
    ? tr('Илгээлтийн агуулга татагдаагүй тул батлах боломжгүй')
    : unmovedBlocks
      ? tr('Илгээлтийн {0} нүдийг хуудсанд буулгаж чадаагүй (мөр нь тулгагдаагүй эсвэл нэмэлтийн утга нь тоо биш) тул батлах боломжгүй — гүйцэтгэгчээр шалгуулж дахин илгээлгэнэ үү (буцааж болно).', String(unmoved))
      : negBlocks
        ? tr('{0} нүдний нэмэлт нийт дүнг сөрөг болгоно (суурь утгаас их хасалт) тул батлах боломжгүй — гүйцэтгэгчээр залруулуулж дахин илгээүүлнэ үү (буцааж болно).', String(negative))
          + (negCells.length ? ` ${negCells.join('; ')}` : '')
        : changes.length > 0 && !allOk
          ? tr('Эхлээд өөрчлөгдсөн нүд бүр дээр дарж зөвшөөрнө үү — үлдсэн {0}', String(bad.length))
          : undefined);
  /** ⚠️ 2026-10-23 (UX аудит R1): `blockedWhy` нь БҮХ зөвшөөрөх (дээш илгээх) товчийг хаана — нүд ногоон байсан ч */
  const selfBlocked = !!blockedWhy;
  const rechecking = recheckSeed;
  const reBy = (stage === 'company' || stage === 'chief' ? 'engineer' : stage) as Exclude<ReviewStage, 'chief'>;

  return (
    <div className={s.item}>
      <button className={s.itemHead} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
        <span className={s.who}>
          {/* ⚠️ 2026-10-26 (аудит): button дотор зөвхөн phrasing агуулга — span (CSS нь -webkit-box тул блок хэвээр); багц орчуулна */}
          <span className={s.ajil} title={ajilLabel(work.ajil)}>{ajilName(work.ajil)}</span>
          <span className={s.meta} title={`${tr(work.bagts)} · ${work.company}`}>{tr(work.bagts)} · {work.company}</span>
        </span>
        {/* ⚠️ 2026-10-27: огноо нэрнээс тусдаа, баруун талд (`ajilName`/`workDay`-ийн ⚠️) */}
        <span className={s.day}>{workDay(work)}</span>
        <Track status={st} stage={stage} />
        <span className={`${s.badge} ${badgeClass(st, stage)}`}>{statusLabel(st, stage)}</span>
      </button>
      {/* ⚠️ 2026-10-12 (R2): шийдвэрийн алдаа ажил «бусад» руу шилжсэн (шийдвэрийн хэсэг алга) эсвэл хураасан үед ч
          харагдана — урьд нь зөвхөн `mine && open` хэсэгт байсан тул STALE мессеж хэзээ ч харагддаггүй байв. */}
      {err && !(mine && open) && (
        <div className={s.error} role="alert">
          {err}{' '}
          <button type="button" className={s.btn} onClick={() => setErr('')}>{tr('Хаах')}</button>
        </div>
      )}

      {open && (
        <div className={s.open}>
          {mine && (
            <div className={s.actions}>
              {/* ── Инженер / менежер хянана ── */}
              {reviewing && (
                <>
                  <textarea
                    className={s.field}
                    rows={2}
                    /* ⚠️ Зөвшөөрөхөд энэ текст ХАЯГДАНА (`run` → `setReason('')`) —
                       тиймээс «зөвхөн буцаахад» гэж шууд хэлнэ (2026-09-23). */
                    placeholder={tr('Зөвхөн буцаахад бичнэ — буцаах шалтгаан (зөвшөөрөхөд хаягдана)')}
                    /* ⚠️ 2026-10-12 (R1): баганын уртаар (`reasonMax`) — нүдний жагсаалт залгагдвал `apply` таслана */
                    maxLength={reasonLim}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className={s.row}>
                    {lack != null && lack.length > 0 && (
                      <div className={s.error}>
                        {tr('Үйлчилгээнд дараах талбарууд алга тул баталгаажуулалт хадгалагдахгүй: {0}', lack.join(', '))}
                      </div>
                    )}
                    {/* ⚠️ «Мэдэхгүй»-г «бэлэн» гэж үзэхгүй — дээрх `lack`-ийн ⚠️ */}
                    {lack == null && (
                      <div className={s.error}>
                        {tr('Хяналтын үйлчилгээний талбаруудыг шалгаж чадсангүй — баталгаажуулалт хадгалагдах эсэх тодорхойгүй тул түр хаалттай.')}
                        {' '}
                        <button type="button" className={s.btn} onClick={() => setLackTry((n) => n + 1)}>
                          {tr('Дахин шалгах')}
                        </button>
                      </div>
                    )}
                    {/* ⚠️ Бүх өөрчлөлт ногоон болтол ШИЛЖҮҮЛЭХ БОЛОМЖГҮЙ. */}
                    <button
                      className={`${s.btn} ${s.ok}`}
                      disabled={busy || selfBlocked || lackBlocks || changes == null || unmovedBlocks || negBlocks || (changes.length > 0 && !allOk)}
                      title={approveWhy
                          /*
                           * ⚠️ ЕРӨНХИЙ МЕНЕЖЕРИЙН товч нь одоо ЖИНХЭНЭ бичилт
                           *    хийдэг: түүнийг дарж байж л гүйцэтгэл үндсэн
                           *    өгөгдөлд (архив + нэгтгэл) орно. Хэрэглэгч
                           *    үүнийг МЭДЭЖ дарах ёстой.
                           */
                          ?? (stage === 'chief'
                            ? tr('Баталсны дараа гүйцэтгэл архивт бичигдэж, нэгтгэлд бүртгэгдэнэ — үүнээс өмнө үндсэн өгөгдөлд ОРООГҮЙ')
                            : undefined)
                      }
                      /* ⚠️ 2026-09-30: ЭЦСИЙН (газрын даргын) батлалт архив + нэгтгэлд
                         ЖИНХЭНЭ бичилт хийдэг тул `Huvaari`-ийн «Хуваарийг батлах»-тай
                         адил баталгаажуулах асуулт тавина — урьд нь анхааруулга нь
                         зөвхөн tooltip байсан тул нэг санамсаргүй товшилтоор архивт
                         орж байв. */
                      /* ⚠️ 2026-10-23 (UX аудит X1): апп доторх асуулт (`askConfirm`) — `window.confirm`-ыг хөтөч «дахин бүү
                         харуул»-аар чимээгүй `false` болгодог тул товч юу ч хийхгүй мэт байв */
                      onClick={async () => {
                        if (stage === 'chief' && !(await askConfirm(tr('Гүйцэтгэлийг баталж архивт бүртгэх үү? Архив болон нэгтгэлд бичигдэж, үндсэн өгөгдөлд орно.'), { ok: tr('Баталж бүртгэх') }))) return;
                        void review(DECISION.approve);
                      }}>
                      {APPROVE_LABEL[stage]}
                      {changes != null && changes.length > 0 && !allOk && ` (${bad.length})`}
                    </button>
                    {/*
                      * ⚠️ БУЦААХ ТОВЧ Ч `lackBlocks`-ААР ХААГДАНА (2026-09-08-ны аудит).
                      *
                      *    Урьд нь зөвхөн батлах товч хаагддаг байв. Гэтэл ерөнхий
                      *    менежерийн буцаалт нь `Ерөнхий_менежер` · `…_шийдвэр` ·
                      *    `…_буцаасан_шалтгаан` · `…_буцаасан_огноо` ГЭСЭН ЯГ ТЭР
                      *    дутуу талбаруудад бичдэг. `applyEdits` танихгүй талбарыг
                      *    ЧИМЭЭГҮЙ алгасаад `success:true` буцаадаг тул зөвхөн
                      *    `Төлөв` сууж, дэлгэц «амжилттай» гэж харагдана — атал
                      *    менежерт очиход шалтгаан ХООСОН, `stepsOf`-д ерөнхий
                      *    менежерийн алхам ОГТ гарахгүй, хэн буцаасан нь
                      *    бүртгэлгүй үлдэнэ. Шийдвэрийн ХОЁР ЧИГЛЭЛ ижилхэн
                      *    бүртгэл шаарддаг тул хоёулаа ижил хамгаалалттай.
                      */}
                    <button className={`${s.btn} ${s.bad}`} disabled={busy || lackBlocks}
                      title={
                        lackBlocks
                          ? tr('Хяналтын үйлчилгээнд талбар дутуу тул буцаалтын шалтгаан хадгалагдахгүй')
                          : bad.length
                            ? tr('Зөвшөөрөгдөөгүй нүднүүд шалтгаанд өөрсдөө жагсаана')
                            : undefined
                      }
                      onClick={async () => {
                        /* ⚠️ 2026-10-06 аудит: БАТАЛГААЖУУЛНА — AjilBatlah/HuvaariBatlah-ийн буцаалтын
                           асуулттай (2026-09-30) ижил; буцаалт нь буцаах замгүй, шат нэрлэнэ. */
                        /* ⚠️ 2026-10-23 (UX аудит X1): `askConfirm` (апп доторх) */
                        if (!(await askConfirm(tr('Гүйцэтгэлийг «{0}» руу буцаах уу? Шалтгаан тэдэнд харагдана — засаад дахин илгээнэ.', lowerLabel(stage)), { danger: true, ok: tr('Буцаах') }))) return;
                        void review(DECISION.return);
                      }}>
                      {tr('Буцаах')}
                      {bad.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
                  {/* ⚠️ 2026-09-30: хаалттай товчны ШАЛТГААН ил бичвэрээр — урьд нь зөвхөн
                      tooltip байсан тул хүрэлцэх дэлгэц дээр огт харагддаггүй, хянагч
                      «товч яагаад дарагдахгүй байна» гэж гацдаг байв. `lack`-ийн
                      алдааны мөр дээр аль хэдийн хэлсэн бол давтахгүй. */}
                  {!busy && !lackBlocks && approveWhy && (
                    <div className={s.blockedWhy} role="note">{approveWhy}</div>
                  )}
                </>
              )}

              {/* ── Инженер: менежер буцаасныг ДАХИН ШАЛГАНА ── */}
              {rechecking && (
                <>
                  <div className={s.reasonBox}>
                    <span className={s.reasonLabel}>
                      {upperOfMe ? STATUS_LABEL[RETURNED_STATUS[upperOfMe]] : ''}:{' '}
                    </span>
                    <span className={s.reasonText}>
                      {/* ⚠️ 2026-10-23: шат бүрд гараар салаалахгүй — `SF`-ээс (төлөвлөлтийн инженер ч орно) */}
                      {upperOfMe ? String((cur as Record<string, unknown>)[SF[upperOfMe].reason] ?? '') : ''}
                    </span>
                  </div>
                  <textarea
                    className={s.field}
                    rows={2}
                    placeholder={RECHECK_HINT[reBy]}
                    /* ⚠️ 2026-10-12 (R1): баганын уртаар (`reasonMax`) */
                    maxLength={reasonLim}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className={s.row}>
                    {/*
                      * ⚠️ ДАХИН ШАЛГАЛТЫН `okCells` (2026-09-23 → 2026-09-24). Урьд нь
                      *    нүд зөвхөн `reviewing` үед тэмдэглэгддэг тул `okKeys` үргэлж
                      *    хоосон байсан — `[]` өгвөл өмнөх тойргийн ногоон нүд бүр
                      *    компанид улаан болдог тул `undefined` дамжуулдаг байв. Одоо
                      *    recheck горимд ч нүд тэмдэглэгдэж, мөрийн `Zovshoorson_nud`-аас
                      *    эхэлдэг тул ДООШ буцаахад тэмдэглэсэн олонлогийг бичнэ;
                      *    ДЭЭШ илгээхэд `undefined` хэвээр (талбар хөндөгдөхгүй).
                      *    Буцаах шалтгаан нь ердийн буцаалттай ижил `badText()`.
                      * ⚠️ `lackBlocks` ЭНД Ч (2026-09-24): захирал/газрын даргын дахин
                      *    шалгалт `DIRECTOR_FIELDS`-д бичдэг — талбар дутуу бол
                      *    `applyEdits` чимээгүй алгасна (буцаах товчны ⚠️-тэй ижил).
                      */}
                    {/*
                      * ⚠️ ДЭЭШ ИЛГЭЭХ нь АГУУЛГА ТАТАГДААГҮЙ БОЛ ХААЛТТАЙ (2026-09-25-ны аудит):
                      *    `changes == null` үед `subAt` ч `undefined` тул `recheck`
                      *    агуулгын тулгалтыг АЛГАСАЖ, хэн ч хараагүй агуулга дээш
                      *    явдаг байв (`hyanaltStore.recheck`-ийн fail-closed зорилгын
                      *    эсрэг). Батлах товчны `changes == null` дүрэмтэй ижил.
                      */}
                    {/* ⚠️ 2026-10-06 (аудит #3): ДЭЭШ ИЛГЭЭХ нь ердийн батлалттай ИЖИЛ «нүд бүрийг
                        гараар» дүрэмтэй — урьд нь `allOk` шалгагддаггүй тул дахин илгээгдсэн
                        (хараагүй) агуулга нэг ч нүд тэмдэглэлгүй дээш явдаг байв. */}
                    {/* ⚠️ 2026-10-22 (аудит): `negBlocks` — батлах товчтой ИЖИЛ (дээрх `negBlocks`-ийн ⚠️) */}
                    <button className={`${s.btn} ${s.ok}`} disabled={busy || selfBlocked || lackBlocks || changes == null || unmovedBlocks || negBlocks || (changes.length > 0 && !allOk)}
                      title={changes == null ? tr('Илгээлтийн агуулга татагдаагүй тул шийдвэр гаргах боломжгүй') : approveWhy}
                      onClick={() => void run(() => recheck(cur.__oid, 'ok', '', who, reBy, me, bypass, undefined, subAt), sentTo(nextReview(reBy)))}>
                      {RECHECK_UP[reBy]}
                      {changes != null && changes.length > 0 && !allOk && ` (${bad.length})`}
                    </button>
                    {/* ⚠️ ДООШ БУЦААХ нь `changes == null`-ээр ХААГДАХГҮЙ — ердийн
                        «Буцаах» товчтой ижил: агуулга олдохгүй (хуучин мөр, архивын
                        агшин алга) үед ч ажлыг гүйцэтгэгч рүү буцаах зам үлдэнэ;
                        доошоо явах нь хараагүй агуулгыг БАТЛАХГҮЙ. */}
                    <button className={`${s.btn} ${s.bad}`} disabled={busy || lackBlocks}
                      title={bad.length ? tr('Зөвшөөрөгдөөгүй нүднүүд шалтгаанд өөрсдөө жагсаана') : undefined}
                      onClick={async () => {
                        /* ⚠️ 2026-10-06 аудит: доош буцаалтыг баталгаажуулна (дээрх «Буцаах»-ын ⚠️) */
                        /* ⚠️ 2026-10-23 (UX аудит X1): `askConfirm` (апп доторх) */
                        if (!(await askConfirm(tr('Гүйцэтгэлийг «{0}» руу буцаах уу? Шалтгаан тэдэнд харагдана — засаад дахин илгээнэ.', lowerLabel(reBy)), { danger: true, ok: tr('Буцаах') }))) return;
                        /* ⚠️ 2026-10-12 (R4): агуулга татагдаагүй үед `undefined` БИШ `[]` — `review()`-тэй ижил. `undefined` нь
                           талбарыг хөндөхгүй тул дээд шатны зөвшөөрөл үлдэж гүйцэтгэгчид «зөвшөөрөгдсөн» (түгжигдсэн
                           ногоон) нүд болж харагддаг байв. */
                        /* ⚠️ 2026-10-12 (дарааллын аудит, №4): агуулга татагдсан, дахин шалгагч нүд хөндөөгүй, seed шинэ бол
                           `undefined` — дээд шатны жагсаалт хэвээр (`recheckOkArg`-ийн ⚠️) */
                        void run(() => recheck(cur.__oid, 'back', badText(), who, reBy, me, bypass, recheckOkArg(), subAt), backTo(reBy));
                      }}>
                      {RECHECK_DOWN[reBy]}
                      {bad.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
                  {/* ⚠️ 2026-09-30: хаалттай «дээш илгээх»-ийн шалтгаан ил (батлах товчтой ижил) */}
                  {!busy && !lackBlocks && changes == null && (
                    <div className={s.blockedWhy} role="note">
                      {tr('Илгээлтийн агуулга татагдаагүй тул шийдвэр гаргах боломжгүй')}
                    </div>
                  )}
                  {/* ⚠️ 2026-10-06 (аудит #3): нүд дутуу тул хаалттай шалтгаан ил */}
                  {!busy && !lackBlocks && changes != null && approveWhy && (
                    <div className={s.blockedWhy} role="note">{approveWhy}</div>
                  )}
                  {/* ⚠️ 2026-10-01: өмнөх зөвшөөрлийг мөртэй тулгаж чадаагүй — ногоон болгохгүй,
                      ил «дахин хянах» (`hyanaltOkCells.resolveOk`) */}
                  {seedRes.unknown > 0 && (
                    <div className={s.blockedWhy} role="note">
                      {tr('Өмнөх шатны {0} зөвшөөрлийг энэ илгээлтийн мөрүүдтэй тулгаж чадсангүй (хуучин хэлбэр эсвэл хүснэгт өөрчлөгдсөн) — тэдгээр нүдийг дахин хянана уу.', String(seedRes.unknown))}
                    </div>
                  )}
                </>
              )}

              {/* ── Компани: «Гүйцэтгэл бөглөх» рүү очиж засна ── */}
              {stage === 'company' && st === STATUS.engineerReturned && (
                <>
                  <div className={s.reasonBox}>
                    <span className={s.reasonLabel}>{tr('Буцаасан шалтгаан')}: </span>
                    <span className={s.reasonText}>{companyReason(cur)}</span>
                  </div>
                  <div className={s.row}>
                    {/*
                      * ⚠️ ЭНД ШИНЭ БҮРТГЭЛ ҮҮСГЭХГҮЙ — зөвхөн «Гүйцэтгэл бөглөх»
                      * рүү шилжинэ. Компани тэнд засаад «Нийтлэх» дармагц
                      * `submitForReview` шинэ хянуулалт үүсгэнэ. Хоёуланг нь
                      * хийвэл нэг засварт ХОЁР бүртгэл орж, хянуулалтын тоо
                      * хоёр дахин их харагдана.
                      */}
                    <button className={`${s.btn} ${s.ok}`} onClick={() => onFix(work)}>
                      {tr('Засаад дахин илгээх')}
                    </button>
                  </div>
                </>
              )}

              {/* ⚠️ 2026-10-23 (UX аудит R3): бичилт явж буйг ил хэлнэ — эцсийн батлалт (архив) хэдэн арван секунд үргэлжилдэг */}
              {busy && <div className={s.saving} role="status">{tr('Хадгалж байна…')}</div>}
              {err && <div className={s.error} role="alert">{err}</div>}
              {warn && <div className={s.warn} role="status">{warn}</div>}
            </div>
          )}

          <Submitted
            bagts={work.bagts}
            sheetOid={cur[F.sheetOid]}
            sentAt={cur[F.companySent]}
            /* ⚠️ 2026-10-05: сүүлийн зөвшөөрлийн агшин — дахин илгээлтийн анхааруулгад (`Submitted.approvedAt`) */
            approvedAt={Math.max(0, ...REVIEW_STAGES.map((rs) => Date.parse(String((cur as Record<string, unknown>)[SF[rs].sent] ?? ''))).filter(Number.isFinite)) || null}
            /* ⚠️ Дахин шалгалтад ч нүд тэмдэглэнэ (2026-09-24, дээрх `recheckSeed`-ийн ⚠️)
               ⚠️ 2026-10-09: ЗӨВХӨН шийдвэрийн эрхтэй (`mine`) үед — урьд нь зөвхөн харах эрхтэй
               хүн нүд бүрийг ногоон болгож чаддаг атлаа батлах товч нь `mine`-аар нуугддаг тул
               «бүгдийг ногоон болгосон ч батлах хэсэг алга» гэж гацдаг байв. */
            ok={mine && (reviewing || rechecking) ? okKeys : undefined}
            onCell={mine && (reviewing || rechecking) ? toggleOk : undefined}
            onChanges={setChanges}
            onSubAt={setSubAt}
            onRemapped={setRemapped}
            onUnmoved={setUnmoved}
            onNegative={(n, cells) => { setNegative(n); setNegCells(cells ?? []); }}
            reloadKey={subReload}
            /* ⚠️ ЗӨВХӨН super БА зөвшөөрөх шатанд — эс бөгөөс жинхэнэ хянагч
               нэг товчоор бүгдийг батлах зам нээгдэнэ (2026-08-27-ны дүрэм). */
            onOkAll={isSuper && mine && reviewing
              /* ⚠️ 2026-10-22 (аудит): сөрөг нийттэй нүдийг (`Change.neg`) алгасна — `negSet`-ийн ⚠️ */
              ? () => setOkKeys(new Set((changes ?? []).filter((c) => !c.neg).map((c) => `${c.row}:${c.block}`)))
              : undefined}
          />
          <History cycles={work.cycles} stage={stage} />
        </div>
      )}
    </div>
  );
}

/* ══════════ Үндсэн харагдац ══════════ */

const ALL = '';
/** ⚠️ 2026-10-23 (R1): `selfBlocks` уншигдтал — тогтвортой хоосон (шинэ `Map` рендер бүрд үүсгэхгүй) */
const NO_BLOCKS: ReadonlyMap<string, string> = new Map();

/**
 * Төлөвийн шүүлт — ШАТААС хамаарна.
 * ⚠️ Компанид «Менежер хянаж байна», «Менежер буцаасан» гэсэн сонголт харагдвал
 * менежерийн шат илчлэгдэнэ. Тиймээс гурвыг НЭГТГЭЖ үзүүлнэ.
 */
type StatusOpt = { value: string; label: string; match: Status[] };

const statusOptions = (stage: Stage): StatusOpt[] =>
  stage === 'company'
    ? [
      { value: 'w', label: tr('Хянагдаж байна'), match: Object.values(STATUS).filter((x) => x !== STATUS.engineerReturned && x !== STATUS.transferred) },
      { value: 'b', label: tr('Буцаасан'), match: [STATUS.engineerReturned] },
      { value: 'd', label: tr('Хүлээн авсан'), match: [STATUS.transferred] },
    ]
    : Object.values(STATUS).map((x) => ({ value: x, label: STATUS_LABEL[x], match: [x] }));

/**
 * УРСГАЛЫН ЗУРАГЛАЛ — гурван шат, тус бүрд хүлээгдэж буй ажлын тоо.
 *
 * ⚠️ Энэ бол зөвхөн чимэг БИШ: «миний ажил хаана явааг» хэлдэг ЦОРЫН ГАНЦ
 *    газар. Урьд нь хэрэглэгч үүргээ гараар сольж, тоог нь тааварлаж байв.
 *    Одоо гурван шат ЗЭРЭГ харагдана — ажил хаана гацсан нь нэг харцаар ойлгомжтой.
 */
function Flow({
  counts,
  stage,
  pick,
}: {
  counts: Record<Stage, number>;
  stage: Stage;
  /** Үүрэгтэй хэрэглэгчид шат СОЛИГДОХГҮЙ — зөвхөн харна. */
  pick?: (x: Stage) => void;
}) {
  return (
    <div className={s.flow}>
      {STAGES.map((x, i) => (
        <Fragment key={x}>
          {i > 0 && <span className={s.flowArrow} aria-hidden="true">→</span>}
          <button
            type="button"
            className={`${s.flowStep} ${x === stage ? s.flowOn : ''}`}
            disabled={!pick}
            onClick={() => pick?.(x)}
          >
            {/* ⚠️ Гүйцэтгэгчид дээд шатны нэр биш дугаар (`Track`-тай ижил) */}
            <span className={s.flowName}>
              {seesManager(stage) || i === 0 ? STAGE_LABEL[x] : tr('{0}-р шат', String(i + 1))}
            </span>
            <span className={s.flowNum}>{counts[x]}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function Guitsetgel() {
  /**
   * ШАТЫГ АДМИНЫ ТОМИЛГООНООС авна — гараар сонгохгүй.
   *
   * ⚠️ Урьд нь гурван товчоор өөрийгөө «инженер» гэж зарлаж болдог байсан нь
   *    хяналтын утгыг үгүй хийдэг: зөвшөөрлийг хэн дарсан нь батлагдахгүй.
   *    Дараа нь үүргээс (`ROLE_STAGE[role]`) гаргадаг болсон ч томилгоо нь
   *    урсгалын бус үүргийг санаатай хэвээр үлдээдэг тул `beginner`/`tolovlolt`
   *    томилогдсон хүн хуудсаа огт харж чаддаггүй байв (2026-08-29). Одоо
   *    `resolveFlowStage`: томилгоо (`stageOfUser`) ДАВАМГАЙЛНА.
   *
   * ⚠️ Нэвтрэлт унтраалттай (дев) эсвэл КОДЫН хатуу `super` үед л шат солигдоно —
   *    бүх урсгалыг турших шаардлагатай тул. Панелийн «Супер» preset энд
   *    хамаарахгүй: хянах эрх зөвхөн томилгооноос.
   */
  const { role, user, status: authStatus, recheckPerms } = useAuth();
  /**
   * Хяналтын бүртгэлд бичигдэх НЭР — нэвтэрсэн хэрэглэгчээс.
   *
   * ⚠️ Урьд нь «Б.Болд» гэх мэт туршилтын хатуу нэрс амьд хүснэгтэд бичигдэж,
   *    зөвшөөрлийн түүх зохиомол хүний нэрээр «баталгаажиж» байв.
   * ⚠️ tr() ХЭРЭГЛЭХГҮЙ — энэ нь дэлгэцийн бичвэр биш, ArcGIS-д хадгалагдах
   *    ӨГӨГДӨЛ (төлөвийн утгуудтай ижил дүрэм). Нэвтрэлт унтраалттай (дев)
   *    үед user байхгүй тул худал хүний нэрийн оронд ерөнхий «Хянагч» орно.
   */
  const who = user?.fullName || user?.username || tr('Хянагч');
  /** Томилгоо өөрчлөгдөхөд (5 мин poll, өөр таб) дахин бодно */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  /** Админы сонгогчоор сонгосон шат — зөвхөн `canPick` үед утгатай */
  /* ⚠️ 2026-10-23: анхдагч `null` — super-т урсгалын томилгоо байвал ТЭР шат (`resolveFlowStage`), үгүй бол инженер.
     Урьд нь үргэлж 'engineer' тул «Төлөвлөлтийн ахлах инженер» шатанд томилогдсон super инженерийн шатнаас эхэлдэг байв. */
  const [picked, setPicked] = useState<Stage | null>(null);
  const flow = useMemo(
    () => resolveFlowStage(user?.username, role, picked, authStatus === 'off'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, picked, authStatus, aclN],
  );
  const stage: Stage = flow.stage ?? 'engineer';
  /** Түгжигдсэн шат (толгойн тэмдэг) — сонгогчтой админд байхгүй */
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» (`flow.viewAll`) — шат сонгогчтой (зөвхөн харах), тогтмол шатны шошгогүй */
  const fixed = flow.canPick || flow.viewAll ? undefined : flow.stage;
  /**
   * ХЯНАХ ЭРХ — урсгалын шатанд томилогдсон, эсвэл системийн админ.
   *
   * ⚠️ `sheet` ба `guitsetgel` НЭГ болсноор урьд нь зөвхөн хүснэгт үздэг байсан
   * үүрэг (`beginner`) энэ хуудсанд орох боллоо. Шат сонгох товч нь тэдэнд ч
   * нээлттэй байсан тул зөвшөөрөх/буцаах товч гарч, ХЯНАГЧ БОЛЖ чадах байв.
   * Одоо томилгоогүй хүнд зөвхөн ХАРАГДАНА (fail-closed).
   */
  const canReview = flow.canReview;

  /**
   * БӨГЛӨХ ТАБ ХЭНД ГАРАХ ВЭ.
   *
   * ⚠️ Гүйцэтгэгчээс гадна «Мөр нэмэх» эрх авсан хүнд ЗААВАЛ нээгдэнэ. Эс
   * бөгөөс тэр эрх УТГАГҮЙ болно: Төлөвлөлтийн ахлах инженер мөр нэмэх эрхтэй атлаа
   * хуудас руу орох замгүй байв.
   *
   * ⚠️ 2026-09-03: урьд нь `qaqc` (Inspection Test Plan) эрх ч энэ табыг
   *    нээдэг байсныг чанарын хэсэгтэй хамт хассан.
   *
   * ⚠️ Бөглөх ХУУДАС нь өөрөө багцаар шүүгддэг (`FillNew` дэх `bagtsScope`)
   * тул энэ нь «аль багц» гэдгийг нээхгүй — зөвхөн «энэ таб байна уу».
   */
  /* ⚠️ 2026-10-09 (аудит): «Зөвхөн харна» (`viewOnly`) тугтай ГҮЙЦЭТГЭГЧ урьд нь бөглөх табтай
     байж, илгээж ч чаддаг байв (`companyDeny` тугийг шалгадаггүй байсан — одоо lib-д хаагдсан).
     Туг нь эрхийг ХАСДАГ тул company шатны бөглөх орцыг нууна; «Мөр нэмэх» (`addRow`) эрх нь
     тусдаа олголт тул хэвээр. `aclN`-ээр дахин зурагдана (томилгоо өөрчлөгдөхөд). */
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» (`viewAll`) company шатыг сонгосон ч бөглөхгүй — зөвхөн харна */
  const companyViewOnly = stage === 'company' && !flow.canPick && authStatus !== 'off' && (isViewOnly(user?.username) || !!flow.viewAll);
  /**
   * ⚠️ 2026-10-09 (хэрэглэгч: «гүйцэтгэл батлах хэсгийн бүх батлагчид гүйцэтгэлийн хүснэгт рүү засвар
   *    хийх эрхгүйгээр орж харах боломжтой болго, гэхдээ батлах шатлал хэвээр»): хянагчийн шатанд
   *    томилогдсон (эсвэл админ шат сонгосон) хүнд «Гүйцэтгэл бөглөх» таб ЗӨВХӨН ХАРАХ горимоор нээгдэнэ.
   *    Бичих эрх нь `FillNew.canPerf` (company шатны томилгоо) дээр хэвээр тул хянагч нүд засаж, илгээж
   *    чадахгүй; багцын хүрээ нь `bagtsScope` (өөрийн хариуцсан багцууд). Батлах урсгал огт хөндөгдөхгүй —
   *    анхдагч таб нь хяналтын жагсаалт хэвээр.
   */
  const reviewerView = stage !== 'company' && (flow.stage != null || flow.canPick);
  /*
   * ⚠️ 2026-10-19 (аудит): ИНЖЕНЕРИЙН ОБЬЁМЫН засварлагч/батлагч (`obyemEdit`/`obyemApprove` + `obyemScope`) ч таб
   *    авна — тэдгээрийн багана ЗӨВХӨН энэ хуудсанд. Урьд нь таб нь урсгалын шат/`addRow`-оор л нээгддэг тул
   *    урсгалд томилогдоогүй обьёмын инженер «Гүйцэтгэл» харагдацтай атлаа засах газаргүй байв (цэсний тэмдэг
   *    `obyemBatlah.countObyemPending` хүлээгдэж буйг тоолсоор). Обьём засах/батлахаас өөр бичих эрх НЭМЭГДЭХГҮЙ —
   *    гүйцэтгэлийн нүд `FillNew.canPerf` (company томилгоо) дээр хэвээр.
   * ⚠️ `addRow` ХАСАГДСАН: мөр нэмэх UI 2026-09-24-нөөс «Хуваарь»-д (`caps.CAP_HOST_VIEW.addRow`).
   */
  const [obN, setObN] = useState(0);
  useEffect(() => subscribeCaps(() => setObN((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => setObN((n) => n + 1)), []);
  const obyemRole = useMemo(
    () => (['obyemEdit', 'obyemApprove'] as const).some((c) => {
      if (!hasCap(user?.username, c)) return false;
      const sc = obyemScope(user?.username, c === 'obyemEdit' ? 'editor' : 'approver');
      return sc === null || sc.length > 0;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `obN` нь эрх/хуваарилалт өөрчлөгдсөн дохио
    [user, obN],
  );
  const canFill = (stage === 'company' && !companyViewOnly) || obyemRole || reviewerView;
  /** Гүйцэтгэгчийн хуудас хоёр талтай: бөглөх ба илгээснээ хянах. */
  /**
   * ⚠️ АНХНЫ ТАБ нь «Илгээсэн ажил» — бөглөх нь БИШ. Хуудсанд ороход эхлээд
   * «миний илгээсэн ажил хаана явж байна» гэдэг харагдах ёстой; бөглөх нь
   * тэндээс сонгож ордог үйлдэл. Урьд нь шууд бөглөх хуудас нээгддэг тул
   * гүйцэтгэгч өөрийн илгээлтийн явцыг хардаггүй байв.
   */
  const [tab, setTab] = useState<'fill' | 'sent' | 'negtgel'>('sent');
  /** Хэрэглэгч табаа ӨӨРӨӨ сонгосон уу — обьёмын анхдагч таб нэг л удаа (доорх `obyemOnly`, ⚠️ 2026-10-19) */
  const [tabPicked, setTabPicked] = useState(false);
  /**
   * «Гүйцэтгэл бөглөх» табаас ГАРАХ хамгаалалт (2026-10-04 аудит, #7) — таб солиход FillNew
   * unmount болж ноорогт ХАДГАЛАГДДАГГҮЙ засвар (инженерийн обьём · илгээлт явж буй) асуултгүй
   * устдаг байв. `navGuard`-ийн туг (FillNew тавьдаг) — Portal-ийн `confirmLeave`-тэй ИЖИЛ асуулт.
   */
  /* ⚠️ 2026-10-12 (R8): ЯМАР Ч табаас гарахад асууна — «Батлах ажил» таб дээр шийдвэр бичигдэж байхад
     (`run` → 'hyanalt-apply' туг) бөглөх таб руу шилжвэл `Item` unmount болж үр дүн/алдаа алга болдог,
     архивын бичилт явж байхад хэрэглэгч анхааруулгагүй гардаг байв (бөглөх табын товч `setTab`-ийг шууд
     дууддаг байсан). Туг тавигдаагүй үед асуулт гарахгүй — урьдын зан. */
  /* ⚠️ 2026-10-23 (UX аудит X1): `askConfirm` (апп доторх) — тиймээс async; дуудагч `void goTab(…)` */
  const goTab = async (t: 'fill' | 'sent' | 'negtgel') => {
    if (t !== tab) {
      const labels = navDirtyLabels();
      if (labels.length
        && !(await askConfirm(tr('{0}: хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?', labels.join(' · ')), { danger: true, ok: tr('Хаяад гарах') }))) return;
    }
    setTabPicked(true);
    setTab(t);
  };
  /* ⚠️ 2026-10-09 (аудит №2): бөглөх таб дээр байхад эрх буурвал (томилгоо «зөвхөн харах» болсон —
     `companyViewOnly`, эсвэл `addRow` хасагдсан) `canFill` false болж `Sheet` ШУУД unmount болдог тул
     `goTab`-ийн «хадгалаагүй засвар» асуулт алгасагдаж засвар чимээгүй устдаг байв. Одоо тэр агшинд
     бөглөх табыг БАРЬЖ (`fillHeld`) mount хэвээр үлдээнэ — бичих эрхийг `FillNew` дотор `canPerf`
     (`viewOnlyAcl`) хаадаг. Табаас `goTab`-аар (асуулттай) гармагц барилт суларч, таб нуугдана.
     Рендерийн үеийн засвар (React «adjusting state» — доорх `negtgel`-ийн загвар). */
  const [fillHeld, setFillHeld] = useState(false);
  const [prevCanFill, setPrevCanFill] = useState(canFill);
  if (prevCanFill !== canFill) {
    setPrevCanFill(canFill);
    setFillHeld(!canFill && tab === 'fill');
  }
  if (fillHeld && tab !== 'fill') setFillHeld(false);
  const showFill = canFill || fillHeld;
  /*
   * ⚠️ 2026-10-19 (аудит): ЗӨВХӨН ОБЬЁМЫН эрхтэй (урсгалын шат/хянагчгүй, company бөглөгч биш) хүний анхдагч таб
   *    «Гүйцэтгэл бөглөх». «Батлах ажил» нь тэдэнд үргэлж ХООСОН (урсгалд томилогдоогүй) — обьёмын багана зөвхөн
   *    бөглөх табад. `obyemRole` нь caps/хуваарилалт уншигдсаны дараа үнэн болдог тул хэрэглэгч таб ӨӨРӨӨ
   *    сонгоогүй (`tabPicked`) үед л нэг удаа шилжүүлнэ (рендерийн үеийн засвар — дээрх `fillHeld`-ийн загвар).
   */
  const obyemOnly = obyemRole && !(stage === 'company' && !companyViewOnly) && !reviewerView;
  if (obyemOnly && !tabPicked && tab === 'sent') {
    setTabPicked(true);
    setTab('fill');
  }
  /** «Нэгтгэл гүйцэтгэл» таб — зөвхөн super (доорх табын тайлбарыг үз) */
  /* ⚠️ 2026-10-19 (аудит): КОДЫН хатуу super (`roleForUser`) — `roleOf` БИШ. Панелийн super олгогдохоо больсон
     (2026-10-15) тул хуучин `role:'super'` override мөртэй аккаунт Нэгтгэлийн табыг (нийтлэх эрх — `negtgelEdit`)
     авдаг байв. Тийм мөр одоо энгийн хэрэглэгч шиг. Дев (`authStatus === 'off'`) урьдын адил `role`-оор. */
  const isSuperRole = authStatus === 'off' ? role === 'super' : roleForUser(user?.username) === 'super';
  /* ⚠️ 2026-09-25: эрх буурсан (эрх дахин ачаалагдсан, хэрэглэгч солигдсон)
     үед «negtgel» таб дээр үлдвэл товч нь алга ч хуудас нь хоосон/зөрүүтэй
     горимд гацна — «Илгээсэн ажил» руу буцаана. Рендерийн үеийн засвар
     (React-ийн «adjusting state» загвар) — эффект + setState-ийн анивчилтгүй. */
  if (!isSuperRole && tab === 'negtgel') setTab('sent');
  const [q, setQ] = useState('');
  const [bagts, setBagts] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const { rows, loading, error, reload } = useHyanaltRows();
  /* ⚠️ 2026-10-04: АЧААЛАЛ УНАСАН, нэг ч мөр алга — `useHyanaltRows` нь алдаанд `rows=[]`,
     `loading=false` өгдөг тул доор «хүлээгдэж буй 0», «Хүлээгдэж буй ажил алга», «0 ажил»
     гэж алдааны ДООР худал хэлдэг байв. Тоо/хоосон төлөвийг нууж зөвхөн алдаа үлдэнэ.
     Өмнө нь ачаалагдсан мөр байвал (давтан шинэчлэлт унасан) хуучин жагсаалт хэвээр. */
  const loadFailed = !!error && rows.length === 0;
  /* ⚠️ 2026-10-04: шийдвэрийн анхааруулга store-оос — `Item` дахин mount болоход алдагддаг байв */
  const applyWarns = useApplyWarns();
  /* ⚠️ ХҮЛЭЭГДЭЖ БУЙ БҮРТГЭЛИЙГ НӨХНӨ (2026-09-25 аудит): эцсийн батлалтын
     дараа таб хаагдаж нэгтгэл/IPC бичигдээгүй үлдсэн өдрүүдийг эцсийн шатны
     хянагч (эсвэл админ) хуудас нээхэд дахин ажиллуулна — бусдад эрх нь
     хүрэхгүй тул дуудахгүй. Сешнд илгээлт бүрийг нэг л удаа оролдоно. */
  const sweepBypass = authStatus === 'off' || flow.canPick;
  /* ⚠️ 2026-10-06 аудит: `r.failed`-ийг урьд нь ХАЯДАГ байв — нөхөлт унасан өдөр нэгтгэл/IPC-гүй
     үлдсэнийг хэн ч мэддэггүй. Одоо шар мөр + «Дахин оролдох» (`resetRegSweep` → `sweepTick`).
     ⚠️ Зөвхөн `failed > 0` эсвэл ДАХИН оролдлогын үр дүнгээр шинэчилнэ: дараагийн ердийн дуудлага
     `SWEPT`-ээр бүгдийг алгасаж `failed: 0` буцаадаг тул түүгээр шар мөрийг худал арилгахгүй. */
  const [sweepFailed, setSweepFailed] = useState(0);
  const [sweepTick, setSweepTick] = useState(0);
  /** «Дахин оролдох» дарагдсан — дараагийн НЭГ дуудлагын үр дүн шар мөрийг шинэчилнэ (тэг ч) */
  const sweepRetryRef = useRef(false);
  /* ⚠️ 2026-10-12 (дарааллын аудит, №5): ДЭЭД гурван шат (`UPPER_SWEEP` — хэлтсийн дарга · төлөвлөлтийн ахлах инженер ·
     газрын дарга) бүгд нөхнө; урьд нь зөвхөн `chief`/супер тул бусдад шар мөр ч харагддаггүй байв. Эрхийн
     жинхэнэ шалгуур store дотор (`authz` — томилогдсон багцаар). `who` — гацсан мөрийн төлөв нөхөхөд (№1). */
  useEffect(() => {
    if (loading || !canReview) return;
    if (!(UPPER_SWEEP as readonly string[]).includes(stage) && !sweepBypass) return;
    let alive = true;
    const isRetry = sweepRetryRef.current;
    sweepRetryRef.current = false;
    void retryPendingRegistrations(user?.username, sweepBypass, who).then((r) => {
      if (!alive) return;
      if (r.failed > 0 || isRetry) setSweepFailed(r.failed);
      if (r.done > 0) reload();
    });
    return () => { alive = false; };
  }, [loading, canReview, stage, sweepBypass, user?.username, who, reload, sweepTick]);
  /**
   * БАГЦААР ХУВААРИЛАХ — хэн юуг хариуцахыг эрхийн панелаас (`flow.scope`).
   *
   * ⚠️ АДМИН (кодын хатуу `super`) нь томилгооноос ҮЛ ХАМААРНА — эс бөгөөс шинэ
   * систем дээр эсвэл бүх томилгоо санамсаргүй устсан үед тохируулах хүн өөрөө
   * юу ч харахгүй болж, эрхээ сэргээх аргагүй түгжигдэнэ.
   *
   * ⚠️ Бусад бүх үүрэгт томилгоо нь ЗААВАЛ: томилогдоогүй хүнд `[]` тул
   * жагсаалт хоосон болно (fail-closed).
   */
  const myBagts = flow.scope;

  const works = useMemo(() => {
    const all = groupWorks(rows);
    return myBagts ? all.filter((w) => myBagts.includes(w.bagts)) : all;
  }, [rows, myBagts]);

  /** Нэг ч багц хуваарилагдаагүй — жагсаалт хоосон байгаагийн ШАЛТГААН. */
  const noScope = Array.isArray(myBagts) && myBagts.length === 0;
  /* ⚠️ 2026-10-09 (аудит): урсгалын томилгоо (remote) УНШИГДААГҮЙ үед (`flowAclReady()` false —
     ачаалж байгаа эсвэл уншилт унасан) `resolveFlowStage` нь fail-closed `scope: []` өгдөг тул
     доор «Танд нэг ч багц хуваарилагдаагүй» гэж ХУДАЛ хэлдэг байв — хүн админ руу залгадаг.
     Одоо ялгаж: уншиж байхад «ачаалж байна», эс бөгөөс алдаа + «Дахин оролдох»
     (`recheckPerms` → `initRemote` → `subscribeAcl`-аар дахин зурна). Супер/дев (`canPick`,
     нэвтрэлт унтраалттай) томилгооноос үл хамаарна. */
  const aclPending = !flowAclReady() && !flow.canPick && authStatus !== 'off';
  const [aclRetrying, setAclRetrying] = useState(false);
  /* ⚠️ 2026-10-09 (аудит №2): `recheckPerms` нь AuthGate-ийн `checkRef` хоосон үед (байгууллага таарахгүй,
     статус signed-in/denied биш, эффект дахин холбогдож буй агшин) эсвэл `check` дотроо чимээгүй унавал
     ЮУ Ч ХИЙХГҮЙ — «Дахин оролдох» зөвхөн ачаалж анивчаад алдаа буцаж гардаг байв. Одоо томилгоо
     уншигдаагүй хэвээр бол `initRemote`-ийг ШУУД дуудна (AuthGate-ийн `check`-тэй ижил аргумент:
     canCreate=false, trusted=хатуу super); тэр ч бүтэхгүй бол ШАЛТГААНЫГ хэлнэ (`aclRetryNote`). */
  const [aclRetryNote, setAclRetryNote] = useState<string | null>(null);
  const retryAcl = () => {
    setAclRetrying(true);
    setAclRetryNote(null);
    void (async () => {
      try {
        await recheckPerms();
        if (flowAclReady()) return;
        const u = user?.username;
        if (!u) { setAclRetryNote(tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.')); return; }
        const ok = await initRemote(false, roleForUser(u) === 'super');
        if (!ok || !flowAclReady()) {
          setAclRetryNote(tr('Эрхийн хүснэгтийг дахин уншиж чадсангүй — сүлжээгээ шалгаад хэсэг хүлээгээд дахин оролдоно уу, давтагдвал админд мэдэгдэнэ үү.'));
        }
      } catch (e) {
        setAclRetryNote(userError(e));
      } finally {
        setAclRetrying(false);
        setAclN((n) => n + 1);
      }
    })();
  };

  const bagtsList = useMemo(() => optionsOf(works, (w) => w.bagts), [works]);
  const companyList = useMemo(() => optionsOf(works, (w) => w.company), [works]);
  const statusList = useMemo(() => statusOptions(stage), [stage]);

  /** Хайлт нь ажил, багц, компани гурвыг хамарна */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // ⚠️ Төлөвийн шүүлт нь ОЛОН төлөвийг нэгтгэж болно (компанийн харагдац)
    const want = statusList.find((o) => o.value === status)?.match;
    /* ⚠️ 2026-10-26 (аудит): дэлгэцэд харагдах (орчуулсан) бичвэрээр ч хайна — англи горимд «Package 1» олдохгүй байв */
    return works.filter((w) =>
      (!needle
        || w.ajil.toLowerCase().includes(needle)
        || ajilLabel(w.ajil).toLowerCase().includes(needle)
        || w.bagts.toLowerCase().includes(needle)
        || tr(w.bagts).toLowerCase().includes(needle)
        || w.company.toLowerCase().includes(needle))
      && (!bagts || w.bagts === bagts)
      && (!company || w.company === company)
      && (!want || want.includes(w.status)));
  }, [works, q, bagts, company, status, statusList]);

  const mine = filtered.filter((w) => w.owner === stage && w.status !== STATUS.transferred);
  const others = filtered.filter((w) => !(w.owner === stage && w.status !== STATUS.transferred));

  /*
   * ⚠️ 2026-10-23 (UX аудит R1): ЗӨВШӨӨРЧ ЧАДАХГҮЙ ажил (өөрийн илгээлт · өөр шатанд зөвшөөрсөн) — цэсний тэмдэгтэй
   *    (`countReviewPending`) НЭГ функц `hyanaltStore.selfBlocks`. Урьд нь тэмдэг «2», таб «3» гэж зөрж, ийм ажил
   *    «хүлээгдэж буй» жагсаалтад орж, татгалзал зөвхөн «Зөвшөөрөх» дарсны дараа гардаг байв. Одоо тусдаа бүлэгт,
   *    зөвшөөрөх товч урьдчилан хаалттай (`Item.blockedWhy`). Шүүлтгүй `works`-оор (тэмдэг шүүлтгүй тоолдог).
   *    Уншиж дуустал (`sig` зөрүү) хоосон = урьдын зан; жинхэнэ хамгаалалт `authz`-д хэвээр.
   */
  const myQueue = useMemo(() => works.filter((w) => w.owner === stage && w.status !== STATUS.transferred), [works, stage]);
  const blockSig = `${(user?.username ?? '').toLowerCase()}|${stage}|${myQueue.map((w) => `${w.key}#${w.current.__oid}`).join(',')}`;
  const [blockRes, setBlockRes] = useState<{ sig: string; m: Map<string, string> }>({ sig: '', m: new Map() });
  useEffect(() => {
    let alive = true;
    void selfBlocks(myQueue, user?.username, stage)
      .then((m) => { if (alive) setBlockRes({ sig: blockSig, m }); })
      .catch(() => { /* зөвлөмж — унавал хаалтгүй (хамгаалалт `authz`-д) */ });
    return () => { alive = false; };
  }, [myQueue, user?.username, stage, blockSig]);
  const blocked = blockRes.sig === blockSig ? blockRes.m : NO_BLOCKS;
  const mineOk = mine.filter((w) => !blocked.has(w.key));
  const mineBlocked = mine.filter((w) => blocked.has(w.key));
  /* ⚠️ Табын тоо = цэсний тэмдэг (`countReviewPending`): зөвхөн харах томилгоо → 0, өөрийгөө батлах хоригтой нь хасагдана */
  const tabCount = !flow.canPick && authStatus !== 'off' && (isViewOnly(user?.username) || !!flow.viewAll)
    ? 0 : myQueue.filter((w) => !blocked.has(w.key)).length;
  /* ⚠️ 2026-10-23 (UX аудит R2): шийдвэрлэх боломжгүй болсон ажлын ноорог (`REVIEW_DRAFTS`) хаягдана — эс бөгөөс F5 дээр
     хөтөч дэмий асууна */
  useEffect(() => {
    if (loading || loadFailed) return;
    const me = (user?.username ?? '').trim().toLowerCase();
    pruneDrafts(new Set(myQueue.map((w) => `${me}|${w.key}`)));
  }, [loading, loadFailed, myQueue, user?.username]);
  /* ⚠️ 2026-10-23 (UX аудит R3): шийдвэрийн дараах ногоон мөр — ажил жагсаалтаас шилжсэн ч хаашаа явсныг хэлнэ */
  const [doneMsg, setDoneMsg] = useState('');
  useEffect(() => {
    if (!doneMsg) return;
    const t = setTimeout(() => setDoneMsg(''), 10_000);
    return () => clearTimeout(t);
  }, [doneMsg]);

  /*
   * ГҮЙЦЭТГЭГЧИЙН ХАРАГДАЦ — «миний илгээсэн ажил хаана явж байна вэ».
   *
   * ⚠️ Урьд нь илгээсэн ажил нь «Бусад ажил» гэсэн нэг овоонд ордог байв —
   * тэр нь ӨӨР ХҮНИЙ ажил гэж уншигдах бөгөөд гүйцэтгэгч өөрийн илгээлт ямар
   * шатанд байгааг хаанаас ч харж чаддаггүй байлаа. Одоо гурав салгав:
   *   1. `mine`      — буцаагдсан, ЗАСАХ шаардлагатай (дээд талд)
   *   2. `inReview`  — илгээгдсэн, ХЯНАГДАЖ байна (мөр бүр дээр `Track` нь
   *                    яг аль шатанд байгааг харуулна)
   *   3. `done`      — долоон шат (инженер → … → газрын дарга) өнгөрч ШИЛЖҮҮЛСЭН
   *
   * ⚠️ Зөвхөн гүйцэтгэгчид хамаарна: хянагчийн хувьд «бусад» нь үнэхээр
   * бусдын ажил тул хуучин бүлэглэлт хэвээр.
   */
  const inReview = others.filter((w) => w.status !== STATUS.transferred);
  const done = others.filter((w) => w.status === STATUS.transferred);

  const countFor = (x: Stage) =>
    works.filter((w) => w.owner === x && w.status !== STATUS.transferred).length;

  const dirty = q || bagts || company || status;

  /*
   * ⚠️ `onView` дамжуулагдаагүй бол (тусад нь ашиглах үед) товч ажиллахгүй
   * байхын оронд ЮУ Ч ХИЙХГҮЙ — унахаас сэргийлнэ.
   */
  /*
   * «ЗАСАХ» — ДОТОГШОО таб солино, гадагш үсрэхгүй.
   *
   * ⚠️ Урьд нь тусдаа «Гүйцэтгэл бөглөх» харагдац руу гаргадаг байв. Тэр нь
   * хоёр хаалга, хоёр эрх шаарддаг байсан бөгөөд буцаж ирэх зам нь ойлгомжгүй
   * байлаа. Одоо бөглөх нь энэ хуудасны нэг таб тул шилжилт нь газар дээрээ.
   */
  /*
   * ⚠️ 2026-09-30: БУЦААГДСАН ИЛГЭЭЛТИЙН БАГЦЫГ НЭЭНЭ. Урьд нь зөвхөн таб
   *    солигддог тул бөглөх хуудас анхдагч багц (`PKGS[0]`) дээр нээгдэж,
   *    гүйцэтгэгч буцаагдсан багцаа гараар хайдаг байв. Одоо багц + хуудас +
   *    илгээлтийн OBJECTID-г `requestFillOpen`-оор дамжуулна — FillNew тэр
   *    хуудсыг сонгож, өөр өдрийн буцаалт бол `resumeReturned`-ээр ТҮҮНИЙ
   *    өдрөөр давхарлана. `Sheet.tsx`-ийг хөндөхгүйн тулд пропс биш модулийн
   *    нэг удаагийн хүсэлт (FillNew зөвхөн `fill` табд mount болдог).
   */
  const goFix = (w: Work) => {
    const r = w.current;
    const so = Number(r?.[F.sheetOid]);
    requestFillOpen({
      bagts: w.bagts,
      ajil: String(r?.[F.ajil] ?? w.ajil ?? ''),
      sheetOid: Number.isInteger(so) && so > 0 ? so : null,
    });
    setTab('fill');
  };

  /* ⚠️ 2026-10-27: «Бусад ажил» · «Илгээсэн» · «Батлагдсан» жагсаалт багцаар бүлэглэгдэнэ (`byBagts`-ийн ⚠️) */
  const grouped = (list: Work[]) => byBagts(list).map((g) => (
    <Fragment key={g.bagts}>
      <div className={s.bagtsHead}>
        <span>{tr(g.bagts)}</span>
        <span className={s.groupCount}>{g.items.length}</span>
      </div>
      {g.items.map((w) => (
        <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} />
      ))}
    </Fragment>
  ));

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          {/* ⚠️ 2026-10-23 (хэрэглэгч: «давхар толгой хэрэггүй»): гарчиг «Гүйцэтгэл бөглөх» — доод порталын толгой хасагдсан */}
          <div className={s.title}>{tr('Гүйцэтгэл бөглөх')}</div>
          {/* ⚠️ 2026-10-23 (хэрэглэгчийн шийдвэр): гарчгийн доорх шатны хэлхээний тайлбар текст БҮРЭН ХАСАГДСАН —
              буцааж нэмэхгүй. Шат нь баруун талын `Flow`-д харагдана. */}
        </div>
        <span className={s.spacer} />
        {/* Хэн болох нь — үүргээс. Солих товч ЗӨВХӨН үүрэггүй (дев/super) үед. */}
        {fixed && <span className={s.roleBadge}>{STAGE_LABEL[fixed]}</span>}
        {flow.viewAll && <span className={s.roleBadge}>{tr('Ерөнхий захирал · зөвхөн харна')}</span>}
        <Flow
          counts={Object.fromEntries(STAGE_ORDER.map((x) => [x, countFor(x)])) as Record<Stage, number>}
          stage={stage}
          pick={flow.canPick || flow.viewAll ? (x) => { setPicked(x); setStatus(ALL); } : undefined}
        />
      </header>

      {/* ГҮЙЦЭТГЭГЧИЙН ХОЁР ТАЛ — бөглөх ба илгээснээ хянах. Урьд нь эдгээр
          ХОЁР ТУСДАА харагдац байсан тул компани хуудас хооронд үсэрч,
          «би юу илгээснээ» хаанаас харахаа мэддэггүй байв. */}
      <div className={s.tabs}>
        {showFill && (
          <>
            <button
              type="button"
              className={`${s.tab} ${tab === 'fill' ? s.tabOn : ''}`}
              onClick={() => void goTab('fill')}
            >
              {stage === 'company' ? tr('Гүйцэтгэл бөглөх') : tr('Гүйцэтгэлийн хүснэгт')}
            </button>
            {/* ⚠️ 2026-10-09: хянагчид энэ таб нь ӨӨРИЙН хяналтын жагсаалт («Батлах ажил», өөрийн шатны тоо) */}
            <button
              type="button"
              className={`${s.tab} ${tab === 'sent' ? s.tabOn : ''}`}
              onClick={() => void goTab('sent')}
            >
              {stage === 'company' ? tr('Илгээсэн ажил') : tr('Батлах ажил')}
              {/* ⚠️ 2026-10-23 (UX аудит R1): цэсний тэмдэгтэй ижил тоо (`tabCount`) */}
              {tabCount > 0 && <span className={s.count}>{tabCount}</span>}
            </button>
          </>
        )}
        {/*
          * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — төслийн ажлын задаргааны (WBS) мод.
          *
          * ⚠️ 2026-09-25: ЗӨВХӨН «super» үүрэгтэй хүнд (хэрэглэгчийн заавар:
          * «Хэрэглэгчдийн эрх удирдах дотроос super гэсэн эрхтэй хүнд л
          * харагдана, өөр тохиолдолд харагдахгүй»). `role` нь панелийн
          * томилгоог тооцсон ГАНЦ эх (`permissions.roleOf` → `useAuth`).
          * ⚠️ Нэвтрэлт унтраалттай (дев) үед ч харагдахгүй — «өөр тохиолдол».
          */}
        {/* ⚠️ 2026-10-15 (хэрэглэгч: «manager_3-аар ороход нэгтгэл гүйцэтгэлийн товч сонин үг л харагдана,
            товч болго»): урсгалын шатгүй super (`showFill` = false) хүнд энэ таб ГАНЦААРАА — сонгоогүй табын
            хэлбэр нь хүрээгүй бичиг тул ТОВЧ (`tabSolo`) болгоно; дахин дарвал жагсаалт руу буцна (өөр таб алга). */}
        {isSuperRole && (
          <button
            type="button"
            className={showFill
              ? `${s.tab} ${tab === 'negtgel' ? s.tabOn : ''}`
              : `${s.tabSolo} ${tab === 'negtgel' ? s.tabSoloOn : ''}`}
            aria-pressed={showFill ? undefined : tab === 'negtgel'}
            onClick={() => void goTab(!showFill && tab === 'negtgel' ? 'sent' : 'negtgel')}
          >
            {tr('Нэгтгэл гүйцэтгэл')}
          </button>
        )}
        {/* ⚠️ «Эрх тохируулах» ЭНДЭЭС ХАСАГДСАН — Админ портал дотор
            тусдаа бүлэг болов. Ажлын хуудсанд тохиргооны товч байвал
            хянагч санамсаргүй дараад хуваарилалт өөрчилнө. */}
      </div>

      {tab === 'negtgel' && isSuperRole ? (
        <div className={s.fill}>
          <TusulNegtgel />
        </div>
      ) : showFill && tab === 'fill' ? (
        <div className={s.fill}>
          <Sheet />
        </div>
      ) : (
      <>
      <div className={s.bar}>
        {/* ⚠️ 2026-10-26 (аудит): хандалтын нэр (aria-label) — сонгогч «combo box» гэж л зарлагддаг байв */}
        <input className={s.search} placeholder={tr('Ажил, багц, компаниар хайх…')} aria-label={tr('Ажил, багц, компаниар хайх…')}
          value={q} onChange={(e) => setQ(e.target.value)} />

        <select className={s.select} value={bagts} onChange={(e) => setBagts(e.target.value)} aria-label={tr('Багц')}>
          <option value={ALL}>{tr('Бүх багц')}</option>
          {bagtsList.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
        </select>

        <select className={s.select} value={company} onChange={(e) => setCompany(e.target.value)} aria-label={tr('Компани')}>
          <option value={ALL}>{tr('Бүх компани')}</option>
          {companyList.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>

        <select className={s.select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tr('Төлөв')}>
          <option value={ALL}>{tr('Бүх төлөв')}</option>
          {statusList.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {dirty && (
          <button className={s.clear}
            onClick={() => { setQ(''); setBagts(ALL); setCompany(ALL); setStatus(ALL); }}>
            {tr('Цэвэрлэх')}
          </button>
        )}
        <span className={s.spacer} />
        {!loadFailed && <span className={s.total}>{tr('{0} ажил', String(filtered.length))}</span>}
      </div>

      <div className={s.body}>
        {error && (
          <div className={s.note} role="alert">
            {tr('Үйлчилгээнээс өгөгдөл татаж чадсангүй: {0}', userError(error))}
            <button className={s.clear} onClick={reload}>{tr('Дахин оролдох')}</button>
          </div>
        )}

        {/* ⚠️ 2026-10-06 аудит: хүлээгдэж буй бүртгэлийн нөхөлт унасан — шар мөр, дахин оролдох */}
        {sweepFailed > 0 && (
          <div className={s.warnBanner} role="status">
            <div>
              {tr('Батлагдсан {0} илгээлтийг нэгтгэл/IPC-д нөхөж бүртгэж чадсангүй — тэдгээр өдөр нэгтгэлд ороогүй байна.', String(sweepFailed))}
            </div>
            <button className={s.clear} onClick={() => { resetRegSweep(); sweepRetryRef.current = true; setSweepTick((n) => n + 1); }}>{tr('Дахин оролдох')}</button>
          </div>
        )}

        {/* ⚠️ 2026-10-04: батлалт БҮТСЭН ч дагалдах алхам унасан — хаах хүртэл дээр үлдэнэ */}
        {applyWarns.map(([key, w]) => (
          <div key={key} className={s.warnBanner} role="status">
            <div>
              <b>{tr('Шийдвэр хадгалагдсан, гэхдээ анхаарах зүйл байна')}{w.ajil || w.bagts ? ` — ${[w.ajil, w.bagts].filter(Boolean).join(' · ')}` : ''}</b>
              {w.text}
            </div>
            <button className={s.clear} onClick={() => dismissApplyWarn(key)}>{tr('Хаах')}</button>
          </div>
        ))}

        {/* ⚠️ 2026-10-23 (UX аудит R3): шийдвэрийн дараа ажил хаашаа явсныг хэлнэ (10 с, эсвэл «Хаах») */}
        {doneMsg && (
          <div className={s.okBanner} role="status">
            <div>✓ {doneMsg}</div>
            <button className={s.clear} onClick={() => setDoneMsg('')}>{tr('Хаах')}</button>
          </div>
        )}

        {/* ⚠️ 2026-10-23 (UX аудит X5): эргэлдэгчтэй ачаалал (`Loading`) — хоосон мэт бичвэр биш */}
        {loading ? (
          <Loading />
        ) : loadFailed ? null : (
          <>
            <div className={s.list}>
              {/* ⚠️ Нэр ЗҮҮН, тоо БАРУУН — зураасаар холбохгүй */}
              <div className={s.groupHead}>
                <span>{stage === 'company' ? tr('Засах шаардлагатай — буцаасан') : STAGE_LABEL[stage]}</span>
                <span className={s.groupCount}>
                  {/* ⚠️ 2026-10-23 (UX аудит R1): зөвхөн ӨӨРӨӨ шийдэх боломжтой (`mineOk`) — тэмдэг/табтай ижил */}
                  {tr('хүлээгдэж буй {0}', String(mineOk.length))}
                </span>
              </div>
              {/* ⚠️ 2026-10-09 (хэрэглэгч: «бүгдийг ногоон болгосон ч батлах хэсэг алга»): шийдвэрийн
                  эрхгүй (`canReview: false` — `viewOnly` томилгоо г.м.) үед батлах/буцаах товч
                  `Item.mine`-аар НУУГДДАГ ч ямар ч тайлбаргүй байв. Шат бүрд ижил тул энд нэг удаа. */}
              {/* ⚠️ 2026-10-23: «Ерөнхий захирал» — бүх шат/багцыг зөвхөн харна (томилгооны зааврын оронд) */}
              {flow.viewAll && (
                <div className={s.blockedWhy} role="note">
                  {tr('Ерөнхий захирал — бүх багц, бүх шатны гүйцэтгэлийг зөвхөн ХАРНА; батлах/буцаах товч гарахгүй. Дээрх шатыг сонгож бусад шатыг харна.')}
                </div>
              )}
              {!canReview && !flow.viewAll && stage !== 'company' && mine.length > 0 && (
                <div className={s.blockedWhy} role="note">
                  {tr('Танд «{0}» шатанд зөвхөн ХАРАХ эрх байна — батлах/буцаах товч гарахгүй. Шийдвэр гаргах бол админаар «Гүйцэтгэлийн урсгал» хэсэгт энэ шатанд (зөвхөн харах тэмдэггүй) томилуулна уу.', STAGE_LABEL[stage])}
                </div>
              )}
              {/* ⚠️ 2026-10-09 (аудит): гүйцэтгэгчийн шатанд ч «Зөвхөн харна» тайлбар — урьд нь
                  `stage !== 'company'`-оор алгасдаг тул бөглөх таб алга болсны шалтгаан харагддаггүй.
                  Бөглөх таб байхгүй тул `mine.length`-ээс үл хамааран үргэлж. */}
              {companyViewOnly && (
                <div className={s.blockedWhy} role="note">
                  {tr('Танд «{0}» шатанд зөвхөн ХАРАХ эрх байна — гүйцэтгэл бөглөх, илгээх, засах боломжгүй. Илгээх бол админаар «Гүйцэтгэлийн урсгал» хэсэгт энэ шатанд (зөвхөн харах тэмдэггүй) томилуулна уу.', STAGE_LABEL[stage])}
                </div>
              )}
              {mine.length === 0 ? (
                <div className={s.empty}>
                  {/* ⚠️ Томилгоогүй бол жагсаалт ХООСОН байх нь ХЭВИЙН биш —
                      шалтгааныг нь ялгаж хэлнэ, эс бөгөөс «ажил алга» гэж
                      ойлгоод хүлээсээр байна. */}
                  {/* ⚠️ 2026-10-09 (аудит): томилгоо уншигдаагүй ≠ хуваарилагдаагүй (`aclPending`-ийн ⚠️) */}
                  {aclPending
                    ? (aclRetrying
                      ? tr('Урсгалын томилгоог ачаалж байна…')
                      : (
                        <span role="alert">
                          {tr('Урсгалын томилгоо (багцын хуваарилалт) уншигдаагүй байна — сүлжээ эсвэл эрхийн хүснэгтийн уншилт унасан байж магадгүй.')}
                          {aclRetryNote && <>{' '}{aclRetryNote}</>}
                          {' '}
                          <button className={s.clear} onClick={retryAcl}>{tr('Дахин оролдох')}</button>
                        </span>
                      ))
                    : noScope
                    ? tr('Танд нэг ч багц хуваарилагдаагүй байна. Админ «Гүйцэтгэлийн урсгал» хэсэгт багц зааж өгсний дараа ажлууд харагдана.')
                    /* ⚠️ 2026-10-23 (UX аудит X6): шүүлтээс болж хоосон бол тэрийгээ хэлж цэвэрлэх товчтой */
                    : dirty && myQueue.length > 0
                      ? (
                        <>
                          {tr('Шүүлтэд тохирох ажил алга — шүүлтийг цэвэрлэвэл {0} ажил харагдана.', String(myQueue.length))}
                          {' '}
                          <button className={s.clear} onClick={() => { setQ(''); setBagts(ALL); setCompany(ALL); setStatus(ALL); }}>{tr('Цэвэрлэх')}</button>
                        </>
                      )
                    /* ⚠️ 2026-10-23 (UX аудит R4): анх удаа орж буй гүйцэтгэгчид «бүх илгээлт хэвийн» гэх нь ХУДАЛ (илгээлт алга) —
                       илгээгээгүйг хэлж бөглөх таб руу шууд оруулна */
                    : stage === 'company' && works.length === 0
                      ? (
                        <>
                          {tr('Та одоогоор гүйцэтгэл илгээгээгүй байна. «Гүйцэтгэл бөглөх» табд бөглөөд «Илгээх» дарна уу.')}
                          {showFill && (
                            <>
                              {' '}
                              <button className={s.clear} onClick={() => void goTab('fill')}>{tr('Гүйцэтгэл бөглөх')}</button>
                            </>
                          )}
                        </>
                      )
                    : stage === 'company'
                      ? tr('Буцаасан ажил алга — бүх илгээлт хэвийн явж байна.')
                      : tr('Хүлээгдэж буй ажил алга — шинэ илгээлт ирэхэд энд автоматаар гарна.')}
                </div>
              ) : (
                <>
                  {mineOk.map((w) => <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} onDone={setDoneMsg} />)}
                  {/* ⚠️ 2026-10-23 (UX аудит R1): өөрийн илгээлт / өөр шатанд зөвшөөрсөн — тусдаа, шалтгаантай */}
                  {mineBlocked.length > 0 && (
                    <>
                      <div className={s.groupHead}>
                        <span>{tr('Та зөвшөөрөх боломжгүй — энэ шатны өөр хянагч шийднэ')}</span>
                        <span className={s.groupCount}>{mineBlocked.length}</span>
                      </div>
                      {mineBlocked.map((w) => <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} onDone={setDoneMsg} blockedWhy={blocked.get(w.key)} />)}
                    </>
                  )}
                </>
              )}
            </div>

            {/* ── ГҮЙЦЭТГЭГЧ: илгээсэн ажил хаана явж байна ── */}
            {stage === 'company' ? (
              <>
                {inReview.length > 0 && (
                  <div className={s.list} style={{ marginTop: 18 }}>
                    <div className={s.groupHead}>
                      <span>{tr('Илгээсэн — хянагдаж байна')}</span>
                      <span className={s.groupCount}>{inReview.length}</span>
                    </div>
                    {grouped(inReview)}
                  </div>
                )}
                {done.length > 0 && (
                  <div className={s.list} style={{ marginTop: 18 }}>
                    <div className={s.groupHead}>
                      <span>{tr('Батлагдсан — эх хүснэгтэд шилжсэн')}</span>
                      <span className={s.groupCount}>{done.length}</span>
                    </div>
                    {grouped(done)}
                  </div>
                )}
              </>
            ) : (
              others.length > 0 && (
                <div className={s.list} style={{ marginTop: 18 }}>
                  <div className={s.groupHead}>
                    <span>{tr('Бусад ажил')}</span>
                    <span className={s.groupCount}>{others.length}</span>
                  </div>
                  {grouped(others)}
                </div>
              )
            )}
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}

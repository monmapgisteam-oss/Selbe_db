'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — компани → талбайн инженер → менежер зөвшөөрлийн урсгал.
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
import { setReportSource } from '@/lib/reportSource';
import { guitsetgelBlocks } from '@/lib/guitsetgelReport';
import { Loading, userError } from '@/components/ui';
import s from './guitsetgel.module.css';

const STAGES: Stage[] = STAGE_ORDER;
const lowerLabel = (x: Stage): string => STAGE_LABEL[STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(x) - 1)]];

/** Буцаасан төлөв → буцаасан ШАТ (компанид буцаасан = инженер) */
const RETURNER: Partial<Record<Status, ReviewStage>> = Object.fromEntries(
  (Object.keys(RETURNED_STATUS) as ReviewStage[]).map((s) => [RETURNED_STATUS[s], s]),
);

export { STAGE_LABEL };

const STATUS_LABEL: Record<Status, string> = {
  get [STATUS.engineerReview]() { return tr('Инженер хянаж байна'); },
  get [STATUS.engineerReturned]() { return tr('Инженер буцаасан'); },
  get [STATUS.managerReview]() { return tr('Багцын ахлах инженер хянаж байна'); },
  get [STATUS.managerReturned]() { return tr('Багцын ахлах инженер буцаасан'); },
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

const ajilLabel = (a: string): string => {
  if (!a.startsWith('Гүйцэтгэл · ')) return a;
  const rest = a.slice('Гүйцэтгэл · '.length);
  const i = rest.indexOf(' · ');
  return i < 0
    ? `${tr('Гүйцэтгэл')} · ${rest}`
    : `${tr('Гүйцэтгэл')} · ${rest.slice(0, i)} · ${tr(rest.slice(i + 3))}`;
};
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
 * БАГЦААР БҮЛЭГЛЭНЭ (2026-10-27, хэрэглэгч: «багцаар бүлэглэ, хамгийн сүүлийн огноотой нь дээд талд»).
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
const fmt = (iso: string | null) => dateTime(iso);

/** Компани менежерийн шатыг ОГТ харахгүй */
const seesManager = (stage: Stage) => stage !== 'company';

const badgeClass = (st: Status, stage: Stage) => {
  if (st === STATUS.transferred) return s.bDone;
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

const companyReason = (r: Row) => r[F.engineerReason];

/* ══════════ Түүх ══════════ */

/**
 * Хоёр огнооны ЗАЙГ хүний хэлээр. Ажил хэдэн хоног хэн нэгний гар дээр
 * хэвтснийг харуулна — хяналтын гол утга нь ихэвчлэн энэ хугацаанд оршино.
 */
function gapOf(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const min = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  if (min < 0) return '';
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
  note?: string;
  stage?: ReviewStage;
};

const STAGE_WHO: Record<ReviewStage, string> = {
  get engineer() { return tr('Инженер'); },
  get manager() { return tr('Багцын ахлах инженер'); },
  get planner() { return tr('Төлөвлөлтийн инженер'); },
  get director() { return tr('Төлөвлөлтийн ахлах инженер'); },
  get head() { return tr('Хэлтсийн дарга'); },
  get chief() { return tr('Газрын дарга'); },
};

/**
 * Хяналтын хүснэгтэд шат бүр ГАНЦ `who` талбартай (`hyanalt.SF`). А зөвшөөрөөд
 * (`sent`), дээд шат буцаасны дараа Б дахин шалгаж компанид буцаавал (`recheck
 * 'back'` — ИЖИЛ мөр, `returned`) `who` = Б болж, А-гийн нэр АЛГА болно; түүх
 * хоёр алхмыг хоёуланг нь Б-гийн нэрээр харуулдаг байв. Хүснэгтэд түүхийн
 * (лог) талбар БАЙХГҮЙ тул нэрийг сэргээх боломжгүй — ядаж ДАРАГДСАН гэдгийг
 * ил хэлнэ.
 */
function overwritten(sent: string | null, ret: string | null): 'sent' | 'ret' | null {
  if (!sent || !ret) return null;
  /* ISO мөр — үсгээр харьцуулахад цагийн дараалал хадгалагдана */
  return sent <= ret ? 'sent' : 'ret';
}
const OVERWRITTEN = () => tr('(өмнөх шийдвэрийн нэр дарагдсан)');

/**
 * Нэг тойргийн алхмууд.
 */
function stepsOf(r: Row, stage: Stage, showSent: boolean): Step[] {
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

  return out.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
}

/**
 * Тухайн тойрог ЯАЖ дууссан бэ.
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
const pcs = (v: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : `${Number((v * 100).toFixed(1))}%`;
/**
 * ЭНЭ УДААГИЙН НЭМЭЛТИЙН ЖИЖИГ ТЭМДЭГ — « (+15)» / « (−5)» (2026-09-25).
 */
const incTag = (d: number | null | undefined, f: (v: number | null) => string) =>
  d == null || !Number.isFinite(d) || Math.abs(d) < 1e-12
    ? null
    : <small style={{ opacity: 0.75, marginLeft: 4 }}>({d > 0 ? '+' : '−'}{f(Math.abs(d))})</small>;

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
   */
  approvedAt?: number | null;
  /**
   * ЭЦГЭЭС ДАХИН АЧААЛУУЛАХ тоолуур (2026-09-25-ны аудит).
   */
  reloadKey?: number;
  /** Зөвшөөрсөн нүднүүд — эцэг (`Item`) эзэмшинэ: товч түүнд байна. */
  ok?: Set<string>;
  onCell?: (row: number, block: string) => string | void;
  /** Өөрчлөлтийн жагсаалтыг эцэгт мэдэгдэнэ — «бүгд зөвшөөрөгдсөн үү» гэж бодоход. */
  onChanges?: (c: Change[] | null) => void;
  /** Илгээлтийн агшин (`payload.at`) — эцэг `apply`-д `subAt` болгон дамжуулна (2026-09-24). */
  onSubAt?: (at: number | undefined) => void;
  onRemapped?: (v: boolean | undefined) => void;
  onUnmoved?: (n: number | undefined) => void;
  onNegative?: (n: number | undefined, cells?: string[]) => void;
  /**
   * «БҮГДИЙГ ЗӨВШӨӨРӨХ» — ЗӨВХӨН системийн админд. Эцэг (`Item`) шийднэ;
   * өгөгдөөгүй бол товч ОГТ зурагдахгүй.
   */
  onOkAll?: () => void;
}) {
  /** «Дахин оролдох» тоолуур — уншилтын effect-ийг дахин асаана. */
  const [tryN, setTryN] = useState(0);
  const reqKey = `${bagts}|${sheetOid}|${tryN}|${reloadKey}`;
  const [res, setRes] = useState<{ key: string; data: Submission | null; err: string }>({ key: '', data: null, err: '' });
  const busy = res.key !== reqKey;
  const data = busy ? null : res.data;
  const err = busy ? '' : res.err;
  /**
   * ӨӨРЧЛӨГДСӨН НҮД РҮҮ ҮСРЭХ хүсэлт — жагсаалтаас дарахад бөглөх хуудас
   * тэр мөр рүү гүйж, нүдийг богино анивчилтаар онцолно.
   */
  const [jump, setJump] = useState<{ row: number; block: string; n: number } | null>(null);
  const subSheetRef = useRef<HTMLDivElement>(null);
  /** Өөрчлөгдсөн нүд: `${мөр}:${блок}` — бөглөх хуудсанд улаанаар тэмдэглэнэ. */
  /** Хэдийг нь зөвшөөрсөн — толгойд харуулна. */
  const okCount = (data?.changes ?? []).filter((c) => ok?.has(`${c.row}:${c.block}`)).length;
  const okable = (data?.changes ?? []).filter((c) => !c.neg).length;
  const changedKeys = useMemo(
    () => new Set((data?.changes ?? []).map((c) => `${c.row}:${c.block}`)),
    [data],
  );

  useEffect(() => {
    let alive = true;
    onChanges?.(null);
    onSubAt?.(undefined);
    onRemapped?.(undefined);
    onUnmoved?.(undefined);
    onNegative?.(undefined);
    loadSubmission(bagts, sheetOid)
      .then((d) => { if (alive) { setRes({ key: reqKey, data: d, err: '' }); onChanges?.(d && !d.prevError ? d.changes : null); onSubAt?.(d?.subAt); onRemapped?.(d ? d.remapped === true : undefined); onUnmoved?.(d ? (d.unmoved ?? 0) : undefined); onNegative?.(d ? (d.negative ?? 0) : undefined, d?.negCells); } })
      .catch((e) => { if (alive) { setRes({ key: reqKey, data: null, err: userError(e) }); onChanges?.(null); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  if (busy) return <div className={s.subMuted}>{tr('Илгээсэн гүйцэтгэлийг татаж байна…')}</div>;
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
          {data.pkgLabel} · {data.subOid
            ? tr('илгээлт · {0} мөр', String(data.rows))
            : tr('{0} мөр архивлав', String(data.rows))}
        </span>
      </div>

      {data.filledCount === 0 && (
        <div className={s.subWarn}>{tr('Энэ илгээлтэд обьём огт бөглөгдөөгүй байна.')}</div>
      )}
      <>
          <div className={s.subMuted}>
            {tr('Илгээсэн: {0}', stamp(sentAt))}
            {' · '}
            {tr('Обьём бөглөсөн ажил: {0}', String(data.filledCount))}
            {' · '}
            {tr('өөрчлөгдсөн нүд: {0}', data.prevError ? '—' : String(data.changes.length))}
            {ok && data.changes.length > 0 && (
              <>
                {' · '}
                <span className={okCount === data.changes.length ? s.okAll : s.okSome}>
                  {tr('зөвшөөрсөн {0}/{1}', String(okCount), String(data.changes.length))}
                </span>
              </>
            )}
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
          {data.prevError && (
            <div className={s.error} role="alert">
              {tr('Өмнөх хувилбарыг уншиж чадсангүй — аль нүд өөрчлөгдсөнийг тодорхойлж чадаагүй тул батлах товч түр хаалттай.')}{' '}
              <button type="button" className={s.btn} onClick={() => setTryN((n) => n + 1)}>{tr('Дахин оролдох')}</button>
            </div>
          )}
          {(data.unmoved ?? 0) > 0 && (
            <div className={s.subWarn} role="alert">
              {tr('Илгээлтийн {0} нүдийг хуудсанд буулгаж чадсангүй — мөр нь одоогийн хуудсанд тулгагдаагүй, эсвэл нэмэлтийн утга нь тоо биш («1,250» · «abc» мэт). Доорх жагсаалтад харагдахгүй бөгөөд батлах боломжгүй — гүйцэтгэгчээр шалгуулж (тоог зөв бичээд) дахин илгээлгэнэ үү.', String(data.unmoved))}
            </div>
          )}
          {(data.negative ?? 0) > 0 && (
            <div className={s.subWarn} role="alert">
              {tr('{0} нүдний нэмэлт нийт дүнг сөрөг болгоно (суурь утгаас их хасалт) тул батлах боломжгүй — доорх нүд(ийг) гүйцэтгэгчээр залруулуулж дахин илгээүүлнэ үү:', String(data.negative))}
              {(data.negCells?.length ?? 0) > 0 && <div>{data.negCells!.join('; ')}</div>}
            </div>
          )}
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
          {data.subAt != null && approvedAt != null && approvedAt > 0 && data.subAt > approvedAt ? (
            <div className={s.subWarn} role="alert">
              {tr('Энэ илгээлт өмнөх шатны зөвшөөрлөөс ХОЙШ ({0}) дахин шинэчлэгдсэн — өмнөх зөвшөөрөл энэ агуулгыг ХАРААГҮЙ. Өөрчлөгдсөн нүд бүрийг шинээр хянана уу.', stamp(new Date(data.subAt).toISOString()))}
            </div>
          ) : data.subAt != null && sentAt != null && data.subAt > Date.parse(sentAt) + 15 * 60_000 && (
            <div className={s.subWarn}>
              {tr('Энэ илгээлт {0}-нд ДАХИН шинэчлэгдсэн — доор харагдаж буй нь ХАМГИЙН СҮҮЛИЙН агуулга, энэ мөрөнд илгээгдсэн үеийнх БИШ.', stamp(new Date(data.subAt).toISOString()))}
            </div>
          )}
          {/* ӨӨРЧЛӨГДСӨН НҮДНҮҮД — дарж хүснэгт рүү үсэрнэ. */}
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
                      subSheetRef.current?.scrollIntoView({ block: "nearest" });
                    }}
                  >
                    <span className={s.chBlk}>{c.block}</span>
                    <span className={s.chWork}>{fixCyr(c.work)}</span>
                    <span className={s.chVal}>
                      {c.from === c.to && c.toPct !== undefined
                        ? <>{c.fromPct == null ? '—' : pcs(c.fromPct)} → <b>{c.toPct == null ? '—' : pcs(c.toPct)}</b>{incTag(c.incPct, pcs)}</>
                        : <>{c.from == null ? '—' : qty(c.from)} → <b>{qty(c.to)}</b>{incTag(c.inc, qty)}</>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={s.subSheet} ref={subSheetRef}>
            <Sheet
              view={{
                pkgKey: data.pkgKey,
                day: data.day,
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

type ReviewDraft = { seedKey: string; keys: Set<string> | null; reason: string; subAt?: number };
const REVIEW_DRAFTS = new Map<string, ReviewDraft>();
const draftLive = (d: ReviewDraft): boolean => !!d.reason.trim() || (d.keys?.size ?? 0) > 0;
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

/** Өөрчлөгдсөн нүдний мөрийн тогтвортой танигч (`Change.rid` → `{oid, sid}`), индексээр — `Item.okRows` ба «Бүгдийг зөвшөөрөх» */
function okRowsOf(changes: Change[] | null): ({ oid: number; sid: string } | undefined)[] {
  const arr: ({ oid: number; sid: string } | undefined)[] = [];
  for (const c of changes ?? []) {
    const cut = c.rid ? c.rid.indexOf('|') : -1;
    if (!c.rid || cut <= 0) continue;
    const oid = Number(c.rid.slice(0, cut));
    if (Number.isFinite(oid)) arr[c.row] = { oid, sid: c.rid.slice(cut + 1) };
  }
  return arr;
}

const BULK_STAGES: readonly Stage[] = ['planner', 'director', 'head', 'chief'];

function Item({ work, stage, who, me, bypass, onFix, readOnly, isSuper, blockedWhy, onDone }: {
  work: Work; stage: Stage; who: string;
  blockedWhy?: string;
  onDone?: (msg: string) => void;
  onFix: (w: Work) => void;
  /**
   * ЭРХИЙН ШАЛГУУРЫН ХЭРЭГЛЭГЧИЙН НЭР (ArcGIS username).
   */
  me?: string;
  /**
   * Домэйн шалгуурыг ТОЙРУУЛАХ — нэвтрэлт унтраалттай (дев) эсвэл админ
   * шатаа ил сонгосон үед. Эс бөгөөс тэр хоёр орчинд хяналт ажиллахгүй.
   */
  bypass?: boolean;
  /**
   * Системийн админ уу (`resolveFlowStage.canPick`).
   */
  isSuper?: boolean;
  readOnly?: boolean;
}) {
  const dk = `${(me ?? '').trim().toLowerCase()}|${work.key}`;
  const [open, setOpen] = useState(() => REVIEW_DRAFTS.has(dk));
  const [reason, setReason] = useState(() => REVIEW_DRAFTS.get(dk)?.reason ?? '');
  const err = useDecisionErr(work.key);
  const setErr = useCallback((t: string) => setDecisionErr(work.key, t), [work.key]);
  const [reasonLim, setReasonLim] = useState(REASON_MAX);
  /** Хагас амжилтын анхааруулга — алдаанаас ТУСДАА (шар) */
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);

  const cur = work.current;
  const st = work.status;

  /**
   * НҮД БҮРИЙГ ГАРААР ЗӨВШӨӨРНӨ.
   */
  const [changes, setChanges] = useState<Change[] | null>(null);
  /** Хянагчийн ХАРСАН илгээлтийн агшин — `apply`-ийн `subAt` (2026-09-24) */
  const [subAt, setSubAt] = useState<number | undefined>(undefined);
  /**
   * Үйлчилгээнд 4-р шатны талбар байгаа эсэх.
   */
  /** «Дахин шалгах» — тоолуур ахих бүрд эффект дахин ажиллана. */
  const [lackTry, setLackTry] = useState(0);
  const lackNeeded = stage === 'planner' || stage === 'director' || stage === 'head' || stage === 'chief';
  const lackKey = `${stage}|${lackTry}`;
  const [lackRes, setLackRes] = useState<{ key: string; m: string[] } | null>(null);
  const lack: string[] | null = !lackNeeded ? [] : (lackRes && lackRes.key === lackKey ? lackRes.m : null);
  useEffect(() => {
    if (!lackNeeded) return;
    let alive = true;
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
   */
  const upperOfMe = stage !== 'company' ? nextReview(stage) : null;
  const reasonStage: ReviewStage | null = stage === 'company' ? null : (stage as ReviewStage);
  useEffect(() => {
    if (!reasonStage) return;
    let alive = true;
    void reasonMax(reasonStage).then((n) => { if (alive) setReasonLim(n); });
    return () => { alive = false; };
  }, [reasonStage]);
  /*
   * `work.key` нь `багц|ажил|компани` тул буцаагдаад ДАХИН илгээгдсэн ажил
   * дээр `Item` unmount БОЛОХГҮЙ: `changes` нь шинэ `sheetOid`-оор дахин
   * ачаалагдахад ӨМНӨХ тойргийн зөвшөөрлүүд хэвээр үлдэж, хянагч нэг ч нүд
   * харалгүйгээр «Батлах» товч идэвхтэй болдог байв — «нүд бүрийг гараар
   * зөвшөөрнө» гэсэн үндсэн дүрмийн шууд зөрчил.
   */
  const curSheetOid = cur?.[F.sheetOid];
  const curOkRaw = cur?.[F.okCells];
  const recheckSeed = !!upperOfMe && st === RETURNED_STATUS[upperOfMe];
  const [remapped, setRemapped] = useState<boolean | undefined>(undefined);
  const [unmoved, setUnmoved] = useState<number | undefined>(undefined);
  const [negative, setNegative] = useState<number | undefined>(undefined);
  const [negCells, setNegCells] = useState<string[]>([]);
  /**
   * ӨӨРЧЛӨГДСӨН НҮДНИЙ МӨРҮҮДИЙН ТОГТВОРТОЙ ТАНИГЧ — индексээр (`Change.row` → `{oid, sid}`).
   */
  const okRows = useMemo(() => okRowsOf(changes), [changes]);
  /** Хуучин (индексийн) зөвшөөрөл бичигдсэн агшин — дээд шатны буцаалтын огноо */
  const okWrittenAt = upperOfMe ? Date.parse(String((cur as Record<string, unknown> | undefined)?.[SF[upperOfMe].returned] ?? '')) : NaN;
  const seedKey = `${curSheetOid}|${recheckSeed}|${curOkRaw}`;
  const seedRes = useMemo(() => {
    if (!recheckSeed || changes == null) return { keys: new Set<string>(), unknown: 0, fresh: false };
    const fresh = subAt == null || (Number.isFinite(okWrittenAt) && subAt <= okWrittenAt);
    if (!fresh) return { keys: new Set<string>(), unknown: 0, fresh: false };
    const trusted = remapped === false && fresh;
    return { ...resolveOk(parseOkCells(curOkRaw), okRows, trusted), fresh: true };
  }, [recheckSeed, curOkRaw, changes, okRows, remapped, subAt, okWrittenAt]);
  const seed = seedRes.keys;
  const [okOv, setOkOv] = useState<{ key: string; keys: Set<string> } | null>(() => {
    const d = REVIEW_DRAFTS.get(dk);
    return d?.keys ? { key: d.seedKey, keys: d.keys } : null;
  });
  const negSet = useMemo(
    () => new Set((changes ?? []).filter((c) => c.neg).map((c) => `${c.row}:${c.block}`)),
    [changes],
  );
  const okKeys0 = okOv && okOv.key === seedKey ? okOv.keys : seed;
  const okKeys = useMemo(
    () => (negSet.size ? new Set([...okKeys0].filter((k) => !negSet.has(k))) : okKeys0),
    [okKeys0, negSet],
  );
  const recheckOkArg = (): string[] | undefined => {
    if (changes == null) return [];
    const untouched = !okOv || okOv.key !== seedKey;
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
  const seenAt = useRef<number | undefined>(REVIEW_DRAFTS.get(dk)?.subAt);
  useEffect(() => {
    if (subAt == null) return;
    const was = seenAt.current;
    seenAt.current = subAt;
    if (was != null && was !== subAt) setOkKeys(new Set());
  }, [subAt, setOkKeys]);
  useEffect(() => {
    const keys = okOv && okOv.key === seedKey ? okOv.keys : null;
    const d: ReviewDraft = { seedKey, keys, reason, subAt: subAt ?? seenAt.current };
    if (draftLive(d)) REVIEW_DRAFTS.set(dk, d);
    else REVIEW_DRAFTS.delete(dk);
    syncDraftGuard();
  }, [dk, okOv, seedKey, reason, subAt]);
  /** `Submitted`-ийг дахин ачаалуулах тоолуур — «агуулга өөрчлөгдсөн» үед */
  const [subReload, setSubReload] = useState(0);
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
   */
  const badText = () => {
    if (!bad.length) return reason.trim();
    const list = bad
      .slice(0, 12)
      .map((c) => `${c.block} · ${fixCyr(c.work)} → ${c.from === c.to && c.toPct !== undefined ? (c.toPct == null ? '—' : pcs(c.toPct)) : qty(c.to)}`)
      .join("; ");
    const more = bad.length > 12 ? ` … +${bad.length - 12}` : "";
    const head = tr("Зөвшөөрөгдөөгүй {0} нүд: ", String(bad.length));
    return [reason.trim(), head + list + more].filter(Boolean).join(" | ");
  };
  const mine = !readOnly && work.owner === stage && st !== STATUS.transferred;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; warn?: string; contentChanged?: true }>, okMsg?: string) => {
    if (busy) return;
    setBusy(true);
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
    if (r.contentChanged) setSubReload((n) => n + 1);
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
  const sentTo = (x: ReviewStage | null): string => (x
    ? tr('«{0}» — {1} руу илгээгдлээ.', ajilLabel(work.ajil), STAGE_LABEL[x])
    : tr('«{0}» — батлагдаж архивт бүртгэгдлээ.', ajilLabel(work.ajil)));
  const backTo = (x: Stage): string => tr('«{0}» — {1} руу буцаалаа.', ajilLabel(work.ajil), lowerLabel(x));

  const review = (decision: (typeof DECISION)[keyof typeof DECISION]) =>
    run(async () => ({ ...(await apply({
      oid: cur.__oid,
      stage: stage as ReviewStage,
      decision,
      reason: decision === DECISION.return ? badText() : reason,
      who,
      me,
      bypass,
      okCells: changes != null ? toOkRefs(okKeys, okRows) : [],
      subAt,
    })), warn: undefined }), decision === DECISION.approve ? sentTo(nextReview(stage as ReviewStage)) : backTo(stage));

  const reviewing = stage !== 'company' && st === REVIEW_STATUS[stage];
  const unmovedBlocks = (unmoved ?? 0) > 0;
  const negBlocks = (negative ?? 0) > 0;
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
  const selfBlocked = !!blockedWhy;
  const rechecking = recheckSeed;
  const reBy = (stage === 'company' || stage === 'chief' ? 'engineer' : stage) as Exclude<ReviewStage, 'chief'>;

  return (
    <div className={s.item}>
      <button className={s.itemHead} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
        <span className={s.who}>
          <span className={s.ajil} title={ajilLabel(work.ajil)}>{ajilName(work.ajil)}</span>
          <span className={s.meta} title={`${tr(work.bagts)} · ${work.company}`}>{tr(work.bagts)} · {work.company}</span>
        </span>
        <span className={s.day}>{workDay(work)}</span>
        <Track status={st} stage={stage} />
        <span className={`${s.badge} ${badgeClass(st, stage)}`}>{statusLabel(st, stage)}</span>
      </button>
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
                    placeholder={tr('Зөвхөн буцаахад бичнэ — буцаах шалтгаан (зөвшөөрөхөд хаягдана)')}
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
                    {lack == null && (
                      <div className={s.error}>
                        {tr('Хяналтын үйлчилгээний талбаруудыг шалгаж чадсангүй — баталгаажуулалт хадгалагдах эсэх тодорхойгүй тул түр хаалттай.')}
                        {' '}
                        <button type="button" className={s.btn} onClick={() => setLackTry((n) => n + 1)}>
                          {tr('Дахин шалгах')}
                        </button>
                      </div>
                    )}
                    <button
                      className={`${s.btn} ${s.ok}`}
                      disabled={busy || selfBlocked || lackBlocks || changes == null || unmovedBlocks || negBlocks || (changes.length > 0 && !allOk)}
                      title={approveWhy
                          ?? (stage === 'chief'
                            ? tr('Баталсны дараа гүйцэтгэл архивт бичигдэж, нэгтгэлд бүртгэгдэнэ — үүнээс өмнө үндсэн өгөгдөлд ОРООГҮЙ')
                            : undefined)
                      }
                      onClick={async () => {
                        if (stage === 'chief' && !(await askConfirm(tr('Гүйцэтгэлийг баталж архивт бүртгэх үү? Архив болон нэгтгэлд бичигдэж, үндсэн өгөгдөлд орно.'), { ok: tr('Баталж бүртгэх') }))) return;
                        void review(DECISION.approve);
                      }}>
                      {APPROVE_LABEL[stage]}
                      {changes != null && changes.length > 0 && !allOk && ` (${bad.length})`}
                    </button>
                    {/*
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
                        if (!(await askConfirm(tr('Гүйцэтгэлийг «{0}» руу буцаах уу? Шалтгаан тэдэнд харагдана — засаад дахин илгээнэ.', lowerLabel(stage)), { danger: true, ok: tr('Буцаах') }))) return;
                        void review(DECISION.return);
                      }}>
                      {tr('Буцаах')}
                      {bad.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
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
                      {upperOfMe ? String((cur as Record<string, unknown>)[SF[upperOfMe].reason] ?? '') : ''}
                    </span>
                  </div>
                  <textarea
                    className={s.field}
                    rows={2}
                    placeholder={RECHECK_HINT[reBy]}
                    maxLength={reasonLim}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className={s.row}>
                    <button className={`${s.btn} ${s.ok}`} disabled={busy || selfBlocked || lackBlocks || changes == null || unmovedBlocks || negBlocks || (changes.length > 0 && !allOk)}
                      title={changes == null ? tr('Илгээлтийн агуулга татагдаагүй тул шийдвэр гаргах боломжгүй') : approveWhy}
                      onClick={() => void run(() => recheck(cur.__oid, 'ok', '', who, reBy, me, bypass, undefined, subAt), sentTo(nextReview(reBy)))}>
                      {RECHECK_UP[reBy]}
                      {changes != null && changes.length > 0 && !allOk && ` (${bad.length})`}
                    </button>
                    <button className={`${s.btn} ${s.bad}`} disabled={busy || lackBlocks}
                      title={bad.length ? tr('Зөвшөөрөгдөөгүй нүднүүд шалтгаанд өөрсдөө жагсаана') : undefined}
                      onClick={async () => {
                        if (!(await askConfirm(tr('Гүйцэтгэлийг «{0}» руу буцаах уу? Шалтгаан тэдэнд харагдана — засаад дахин илгээнэ.', lowerLabel(reBy)), { danger: true, ok: tr('Буцаах') }))) return;
                        void run(() => recheck(cur.__oid, 'back', badText(), who, reBy, me, bypass, recheckOkArg(), subAt), backTo(reBy));
                      }}>
                      {RECHECK_DOWN[reBy]}
                      {bad.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
                  {!busy && !lackBlocks && changes == null && (
                    <div className={s.blockedWhy} role="note">
                      {tr('Илгээлтийн агуулга татагдаагүй тул шийдвэр гаргах боломжгүй')}
                    </div>
                  )}
                  {!busy && !lackBlocks && changes != null && approveWhy && (
                    <div className={s.blockedWhy} role="note">{approveWhy}</div>
                  )}
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
                    <button className={`${s.btn} ${s.ok}`} onClick={() => onFix(work)}>
                      {tr('Засаад дахин илгээх')}
                    </button>
                  </div>
                </>
              )}

              {busy && <div className={s.saving} role="status">{tr('Хадгалж байна…')}</div>}
              {err && <div className={s.error} role="alert">{err}</div>}
              {warn && <div className={s.warn} role="status">{warn}</div>}
            </div>
          )}

          <Submitted
            bagts={work.bagts}
            sheetOid={cur[F.sheetOid]}
            sentAt={cur[F.companySent]}
            approvedAt={Math.max(0, ...REVIEW_STAGES.map((rs) => Date.parse(String((cur as Record<string, unknown>)[SF[rs].sent] ?? ''))).filter(Number.isFinite)) || null}
            ok={mine && (reviewing || rechecking) ? okKeys : undefined}
            onCell={mine && (reviewing || rechecking) ? toggleOk : undefined}
            onChanges={setChanges}
            onSubAt={setSubAt}
            onRemapped={setRemapped}
            onUnmoved={setUnmoved}
            onNegative={(n, cells) => { setNegative(n); setNegCells(cells ?? []); }}
            reloadKey={subReload}
            onOkAll={isSuper && mine && reviewing
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
const NO_BLOCKS: ReadonlyMap<string, string> = new Map();

/**
 * Төлөвийн шүүлт — ШАТААС хамаарна.
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
   */
  const { role, user, status: authStatus, recheckPerms } = useAuth();
  /**
   * Хяналтын бүртгэлд бичигдэх НЭР — нэвтэрсэн хэрэглэгчээс.
   */
  const who = user?.fullName || user?.username || tr('Хянагч');
  /** Томилгоо өөрчлөгдөхөд (5 мин poll, өөр таб) дахин бодно */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  /** Админы сонгогчоор сонгосон шат — зөвхөн `canPick` үед утгатай */
  const [picked, setPicked] = useState<Stage | null>(null);
  const flow = useMemo(
    () => resolveFlowStage(user?.username, role, picked, authStatus === 'off'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, picked, authStatus, aclN],
  );
  const stage: Stage = flow.stage ?? 'engineer';
  /** Түгжигдсэн шат (толгойн тэмдэг) — сонгогчтой админд байхгүй */
  const fixed = flow.canPick || flow.viewAll ? undefined : flow.stage;
  /**
   * ХЯНАХ ЭРХ — урсгалын шатанд томилогдсон, эсвэл системийн админ.
   */
  const canReview = flow.canReview;

  /**
   * БӨГЛӨХ ТАБ ХЭНД ГАРАХ ВЭ.
   */
  const companyViewOnly = stage === 'company' && !flow.canPick && authStatus !== 'off' && (isViewOnly(user?.username) || !!flow.viewAll);
  const reviewerView = stage !== 'company' && (flow.stage != null || flow.canPick);
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
  const [tab, setTab] = useState<'fill' | 'sent' | 'negtgel'>('sent');
  /** Хэрэглэгч табаа ӨӨРӨӨ сонгосон уу — обьёмын анхдагч таб нэг л удаа (доорх `obyemOnly`, 2026-10-19) */
  const [tabPicked, setTabPicked] = useState(false);
  /**
   * «Гүйцэтгэл бөглөх» табаас ГАРАХ хамгаалалт (2026-10-04 аудит, #7) — таб солиход FillNew
   * unmount болж ноорогт ХАДГАЛАГДДАГГҮЙ засвар (инженерийн обьём · илгээлт явж буй) асуултгүй
   * устдаг байв. `navGuard`-ийн туг (FillNew тавьдаг) — Portal-ийн `confirmLeave`-тэй ИЖИЛ асуулт.
   */
  const goTab = async (t: 'fill' | 'sent' | 'negtgel') => {
    if (t !== tab) {
      const labels = navDirtyLabels();
      if (labels.length
        && !(await askConfirm(tr('{0}: хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?', labels.join(' · ')), { danger: true, ok: tr('Хаяад гарах') }))) return;
    }
    setTabPicked(true);
    setTab(t);
  };
  const [fillHeld, setFillHeld] = useState(false);
  const [prevCanFill, setPrevCanFill] = useState(canFill);
  if (prevCanFill !== canFill) {
    setPrevCanFill(canFill);
    setFillHeld(!canFill && tab === 'fill');
  }
  if (fillHeld && tab !== 'fill') setFillHeld(false);
  const showFill = canFill || fillHeld;
  const obyemOnly = obyemRole && !(stage === 'company' && !companyViewOnly) && !reviewerView;
  if (obyemOnly && !tabPicked && tab === 'sent') {
    setTabPicked(true);
    setTab('fill');
  }
  /** «Нэгтгэл гүйцэтгэл» таб — зөвхөн super (доорх табын тайлбарыг үз) */
  const isSuperRole = authStatus === 'off' ? role === 'super' : roleForUser(user?.username) === 'super';
  if (!isSuperRole && tab === 'negtgel') setTab('sent');
  const [q, setQ] = useState('');
  const [bagts, setBagts] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const { rows, loading, error, reload } = useHyanaltRows();
  const loadFailed = !!error && rows.length === 0;
  const applyWarns = useApplyWarns();
  const sweepBypass = authStatus === 'off' || flow.canPick;
  const [sweepFailed, setSweepFailed] = useState(0);
  const [sweepTick, setSweepTick] = useState(0);
  /** «Дахин оролдох» дарагдсан — дараагийн НЭГ дуудлагын үр дүн шар мөрийг шинэчилнэ (тэг ч) */
  const sweepRetryRef = useRef(false);
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
   */
  const myBagts = flow.scope;

  const works = useMemo(() => {
    const all = groupWorks(rows);
    return myBagts ? all.filter((w) => myBagts.includes(w.bagts)) : all;
  }, [rows, myBagts]);

  /** Нэг ч багц хуваарилагдаагүй — жагсаалт хоосон байгаагийн ШАЛТГААН. */
  const noScope = Array.isArray(myBagts) && myBagts.length === 0;
  const aclPending = !flowAclReady() && !flow.canPick && authStatus !== 'off';
  const [aclRetrying, setAclRetrying] = useState(false);
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
    const want = statusList.find((o) => o.value === status)?.match;
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
  const tabCount = !flow.canPick && authStatus !== 'off' && (isViewOnly(user?.username) || !!flow.viewAll)
    ? 0 : myQueue.filter((w) => !blocked.has(w.key)).length;
  useEffect(() => {
    if (loading || loadFailed) return;
    const me = (user?.username ?? '').trim().toLowerCase();
    pruneDrafts(new Set(myQueue.map((w) => `${me}|${w.key}`)));
  }, [loading, loadFailed, myQueue, user?.username]);
  const [doneMsg, setDoneMsg] = useState('');
  useEffect(() => {
    if (!doneMsg) return;
    const t = setTimeout(() => setDoneMsg(''), 10_000);
    return () => clearTimeout(t);
  }, [doneMsg]);

  const bulkList = BULK_STAGES.includes(stage) && canReview && !flow.viewAll && tabCount > 0
    ? mineOk.filter((w) => w.status === REVIEW_STATUS[stage as ReviewStage])
    : [];
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkFails, setBulkFails] = useState<string[]>([]);
  const approveAll = async () => {
    if (bulk || !bulkList.length) return;
    const rs = stage as ReviewStage;
    const list = bulkList;
    const ask = rs === 'chief'
      ? tr('«{0}» шатны {1} ажлыг бүгдийг баталж архивт бүртгэх үү? Архив болон нэгтгэлд бичигдэж, үндсэн өгөгдөлд орно.', STAGE_LABEL[rs], String(list.length))
      : tr('«{0}» шатны {1} ажлыг бүгдийг зөвшөөрч дараагийн шат руу илгээх үү?', STAGE_LABEL[rs], String(list.length));
    if (!(await askConfirm(ask, { ok: tr('Бүгдийг зөвшөөрөх') }))) return;
    const guardKey = 'hyanalt-apply:bulk';
    setNavDirty(guardKey, true, tr('Гүйцэтгэлийн шийдвэр хадгалж байна'));
    setBulk({ done: 0, total: list.length });
    setBulkFails([]);
    const fails: string[] = [];
    let ok = 0;
    try {
      const lack = await missingDirectorFields();
      if (lack == null || lack.length > 0) {
        setBulkFails([lack == null
          ? tr('Хяналтын үйлчилгээний талбаруудыг шалгаж чадсангүй — баталгаажуулалт хадгалагдах эсэх тодорхойгүй тул түр хаалттай.')
          : tr('Үйлчилгээнд дараах талбарууд алга тул баталгаажуулалт хадгалагдахгүй: {0}', lack.join(', '))]);
        return;
      }
      for (const [i, w] of list.entries()) {
        let why: string | null;
        try {
          const d = await loadSubmission(w.bagts, w.current[F.sheetOid]);
          if (!d || d.prevError) why = tr('Илгээлтийн агуулга татагдаагүй тул батлах боломжгүй');
          else if ((d.unmoved ?? 0) > 0) why = tr('{0} нүдийг хуудсанд буулгаж чадаагүй — гараар шалгана уу', String(d.unmoved));
          else if ((d.negative ?? 0) > 0) why = tr('{0} нүдний нэмэлт нийт дүнг сөрөг болгоно — гараар шалгана уу', String(d.negative));
          else {
            const r = await apply({
              oid: w.current.__oid,
              stage: rs,
              decision: DECISION.approve,
              reason: '',
              who,
              me: user?.username,
              bypass: authStatus === 'off' || flow.canPick,
              okCells: toOkRefs(d.changes.map((c) => `${c.row}:${c.block}`), okRowsOf(d.changes)),
              subAt: d.subAt,
            });
            why = r.ok ? null : (r.error ? userError(r.error) : tr('Алдаа гарлаа'));
          }
        } catch (e) {
          why = userError(e);
        }
        if (why) fails.push(`${ajilLabel(w.ajil)} (${tr(w.bagts)} · ${w.company}) — ${why}`);
        else ok += 1;
        setBulk({ done: i + 1, total: list.length });
      }
    } finally {
      setNavDirty(guardKey, false);
      setBulk(null);
      setBulkFails((f) => (f.length ? f : fails));
      if (ok > 0) {
        setDoneMsg(rs === 'chief'
          ? tr('{0} ажил батлагдаж архивт бүртгэгдлээ.', String(ok))
          : tr('{0} ажил — {1} руу илгээгдлээ.', String(ok), STAGE_LABEL[nextReview(rs) ?? rs]));
        reload();
      }
    }
  };

  /*
   * ГҮЙЦЭТГЭГЧИЙН ХАРАГДАЦ — «миний илгээсэн ажил хаана явж байна вэ».
   */
  const inReview = others.filter((w) => w.status !== STATUS.transferred);
  const done = others.filter((w) => w.status === STATUS.transferred);

  const statusLabel = statusList.find((o) => o.value === status)?.label;
  useEffect(() => setReportSource('guitsetgel', {
    blocks: () => guitsetgelBlocks(filtered, Date.now()),
    filters: () => [
      bagts ? `${tr('Багц')}: ${bagts}` : '',
      company ? `${tr('Гүйцэтгэгч компани')}: ${company}` : '',
      statusLabel ? `${tr('Төлөв')}: ${statusLabel}` : '',
      q.trim() ? `${tr('Хайлт')}: ${q.trim()}` : '',
    ].filter(Boolean),
  }), [filtered, bagts, company, statusLabel, q]);

  const countFor = (x: Stage) =>
    works.filter((w) => w.owner === x && w.status !== STATUS.transferred).length;

  const dirty = q || bagts || company || status;

  /*
   * «ЗАСАХ» — ДОТОГШОО таб солино, гадагш үсрэхгүй.
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
          <div className={s.title}>{tr('Гүйцэтгэл бөглөх')}</div>
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
            <button
              type="button"
              className={`${s.tab} ${tab === 'sent' ? s.tabOn : ''}`}
              onClick={() => void goTab('sent')}
            >
              {stage === 'company' ? tr('Илгээсэн ажил') : tr('Батлах ажил')}
              {tabCount > 0 && <span className={s.count}>{tabCount}</span>}
            </button>
          </>
        )}
        {/*
          * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — төслийн ажлын задаргааны (WBS) мод.
          */}
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

        {sweepFailed > 0 && (
          <div className={s.warnBanner} role="status">
            <div>
              {tr('Батлагдсан {0} илгээлтийг нэгтгэл/IPC-д нөхөж бүртгэж чадсангүй — тэдгээр өдөр нэгтгэлд ороогүй байна.', String(sweepFailed))}
            </div>
            <button className={s.clear} onClick={() => { resetRegSweep(); sweepRetryRef.current = true; setSweepTick((n) => n + 1); }}>{tr('Дахин оролдох')}</button>
          </div>
        )}

        {applyWarns.map(([key, w]) => (
          <div key={key} className={s.warnBanner} role="status">
            <div>
              <b>{tr('Шийдвэр хадгалагдсан, гэхдээ анхаарах зүйл байна')}{w.ajil || w.bagts ? ` — ${[w.ajil, w.bagts].filter(Boolean).join(' · ')}` : ''}</b>
              {w.text}
            </div>
            <button className={s.clear} onClick={() => dismissApplyWarn(key)}>{tr('Хаах')}</button>
          </div>
        ))}

        {doneMsg && (
          <div className={s.okBanner} role="status">
            <div>✓ {doneMsg}</div>
            <button className={s.clear} onClick={() => setDoneMsg('')}>{tr('Хаах')}</button>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : loadFailed ? null : (
          <>
            <div className={s.list}>
              <div className={s.groupHead}>
                <span>{stage === 'company' ? tr('Засах шаардлагатай — буцаасан') : STAGE_LABEL[stage]}</span>
                <span className={s.groupCount}>
                  {tr('хүлээгдэж буй {0}', String(mineOk.length))}
                </span>
              </div>
              {(bulkList.length > 0 || bulk) && (
                <div className={s.row}>
                  <button type="button" className={`${s.btn} ${s.ok}`} disabled={!!bulk} onClick={() => void approveAll()}>
                    {bulk
                      ? tr('Зөвшөөрч байна… {0}/{1}', String(bulk.done), String(bulk.total))
                      : `${tr('Бүгдийг зөвшөөрөх')} (${bulkList.length})`}
                  </button>
                </div>
              )}
              {bulkFails.length > 0 && (
                <div className={s.error} role="alert">
                  {tr('Дараах {0} ажил зөвшөөрөгдсөнгүй:', String(bulkFails.length))}
                  <ul>{bulkFails.map((f) => <li key={f}>{f}</li>)}</ul>
                  <button type="button" className={s.btn} onClick={() => setBulkFails([])}>{tr('Хаах')}</button>
                </div>
              )}
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
              {companyViewOnly && (
                <div className={s.blockedWhy} role="note">
                  {tr('Танд «{0}» шатанд зөвхөн ХАРАХ эрх байна — гүйцэтгэл бөглөх, илгээх, засах боломжгүй. Илгээх бол админаар «Гүйцэтгэлийн урсгал» хэсэгт энэ шатанд (зөвхөн харах тэмдэггүй) томилуулна уу.', STAGE_LABEL[stage])}
                </div>
              )}
              {mine.length === 0 ? (
                <div className={s.empty}>
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
                    : dirty && myQueue.length > 0
                      ? (
                        <>
                          {tr('Шүүлтэд тохирох ажил алга — шүүлтийг цэвэрлэвэл {0} ажил харагдана.', String(myQueue.length))}
                          {' '}
                          <button className={s.clear} onClick={() => { setQ(''); setBagts(ALL); setCompany(ALL); setStatus(ALL); }}>{tr('Цэвэрлэх')}</button>
                        </>
                      )
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

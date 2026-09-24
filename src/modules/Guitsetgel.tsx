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

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  DECISION, F, missingDirectorFields, OWNER, STAGE_ORDER, STATUS,
  REVIEW_STATUS, RETURNED_STATUS, nextReview,
  type ReviewStage, type Row, type Stage, type Status,
} from '@/lib/hyanalt';
import { useAuth } from '@/components/AuthGate';
import { resolveFlowStage, subscribeAcl } from '@/lib/guitsetgelAcl';
import { hasCap } from '@/lib/caps';
import { Sheet } from '@/modules/sheet/Sheet';
import { groupWorks, optionsOf, STAGE_LABEL, type Work } from '@/lib/hyanaltGroup';
import { apply, recheck, useHyanaltRows } from '@/lib/hyanaltStore';
import { loadSubmission, type Change, type Submission } from '@/lib/hyanaltDetail';
import { TusulNegtgel } from '@/modules/TusulNegtgel';
import s from './guitsetgel.module.css';

/* ⚠️ `STAGE_ORDER`-оос (2026-09-23, 6 шат) — энд давхар жагсаавал зөрнө */
const STAGES: Stage[] = STAGE_ORDER;

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
 */
const STATUS_LABEL: Record<Status, string> = {
  [STATUS.engineerReview]: tr('Инженер хянаж байна'),
  [STATUS.engineerReturned]: tr('Инженер буцаасан'),
  [STATUS.managerReview]: tr('Менежер хянаж байна'),
  [STATUS.managerReturned]: tr('Менежер буцаасан'),
  [STATUS.directorReview]: tr('Ерөнхий менежер хянаж байна'),
  [STATUS.directorReturned]: tr('Ерөнхий менежер буцаасан'),
  [STATUS.headReview]: tr('Хэлтсийн дарга хянаж байна'),
  [STATUS.headReturned]: tr('Хэлтсийн дарга буцаасан'),
  [STATUS.chiefReview]: tr('Газрын дарга хянаж байна'),
  [STATUS.chiefReturned]: tr('Газрын дарга буцаасан'),
  [STATUS.transferred]: tr('Шилжүүлсэн'),
};

/** Шатны ХЭНД илгээх үйл үг — зөвшөөрөх товч ба түүхийн мөрөнд */
const APPROVE_LABEL: Record<ReviewStage, string> = {
  engineer: tr('Зөвшөөрч багцын менежерт илгээх'),
  manager: tr('Зөвшөөрч ерөнхий менежерт илгээх'),
  director: tr('Зөвшөөрч хэлтсийн даргад илгээх'),
  head: tr('Зөвшөөрч газрын даргад илгээх'),
  chief: tr('Баталж архивт бүртгэх'),
};
const SENT_VERB: Record<ReviewStage, string> = {
  engineer: tr('шалгаж менежерт илгээв'),
  manager: tr('зөвшөөрч ерөнхий менежерт илгээв'),
  director: tr('зөвшөөрч хэлтсийн даргад илгээв'),
  head: tr('зөвшөөрч газрын даргад илгээв'),
  chief: tr('баталж бүртгэв'),
};
const RETURN_VERB: Record<ReviewStage, string> = {
  engineer: tr('компанид буцаав'),
  manager: tr('инженерт буцаав'),
  director: tr('багцын менежерт буцаав'),
  head: tr('ерөнхий менежерт буцаав'),
  chief: tr('хэлтсийн даргад буцаав'),
};
/** Дахин шалгагчийн товч · placeholder — «дээшээ» ба «доошоо» */
const RECHECK_UP: Record<Exclude<ReviewStage, 'chief'>, string> = {
  engineer: tr('Дахин шалгасан — асуудалгүй, менежерт илгээх'),
  manager: tr('Дахин шалгасан — асуудалгүй, ерөнхий менежерт илгээх'),
  director: tr('Дахин шалгасан — асуудалгүй, хэлтсийн даргад илгээх'),
  head: tr('Дахин шалгасан — асуудалгүй, газрын даргад илгээх'),
};
const RECHECK_DOWN: Record<Exclude<ReviewStage, 'chief'>, string> = {
  engineer: tr('Асуудал байна — компанид буцаах'),
  manager: tr('Асуудал байна — инженерт буцаах'),
  director: tr('Асуудал байна — багцын менежерт буцаах'),
  head: tr('Асуудал байна — ерөнхий менежерт буцаах'),
};
const RECHECK_HINT: Record<Exclude<ReviewStage, 'chief'>, string> = {
  engineer: tr('Компанид буцаах бол шалтгаанаа бичнэ үү (менежерийн бичвэр компанид харагдахгүй)'),
  manager: tr('Инженерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'),
  director: tr('Багцын менежерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'),
  head: tr('Ерөнхий менежерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)'),
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('mn-MN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }) : '—';

/** Компани менежерийн шатыг ОГТ харахгүй */
const seesManager = (stage: Stage) => stage !== 'company';

const badgeClass = (st: Status, stage: Stage) => {
  if (st === STATUS.transferred) return s.bDone;
  // ⚠️ Компанид «Менежер буцаасан» улаанаар ч харагдах ёсгүй — тэр ажил
  //    хараахан компанид ирээгүй, инженер дээр байгаа.
  if (st === STATUS.managerReturned) return stage === 'company' ? s.bWait : s.bBack;
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
};

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

  if (r[F.engineerSent]) {
    out.push({
      who: eng,
      // Компани менежерийн тухай сонсох ёсгүй тул үйл үгийг нь өөрчилнө
      verb: seesManager(stage) ? tr('шалгаж менежерт илгээв') : tr('хүлээн авав'),
      at: r[F.engineerSent],
      reason: '',
      kind: 'ok',
    });
  }
  if (r[F.engineerReturned]) {
    out.push({
      who: eng,
      verb: tr('компанид буцаав'),
      at: r[F.engineerReturned],
      reason: r[F.engineerReason],
      kind: 'bad',
    });
  }

  if (seesManager(stage)) {
    const mgr = `${tr('Менежер')} ${r[F.manager]}`.trim();
    if (r[F.managerSent]) {
      out.push({ who: mgr, verb: tr('зөвшөөрч ерөнхий менежерт илгээв'), at: r[F.managerSent], reason: '', kind: 'ok' });
    }
    if (r[F.managerReturned]) {
      out.push({
        who: mgr,
        verb: tr('инженерт буцаав'),
        at: r[F.managerReturned],
        reason: r[F.managerReason],
        kind: 'bad',
      });
    }

    /* ⚠️ 4·5·6-р шат — нэг загвараар (2026-09-23) */
    const upper: { st: ReviewStage; label: string; who: string; sent: string | null; ret: string | null; why: string }[] = [
      { st: 'director', label: tr('Ерөнхий менежер'), who: r[F.director], sent: r[F.directorSent], ret: r[F.directorReturned], why: r[F.directorReason] },
      { st: 'head', label: tr('Хэлтсийн дарга'), who: r[F.head], sent: r[F.headSent], ret: r[F.headReturned], why: r[F.headReason] },
      { st: 'chief', label: tr('Газрын дарга'), who: r[F.chief], sent: r[F.chiefSent], ret: r[F.chiefReturned], why: r[F.chiefReason] },
    ];
    for (const u of upper) {
      const nm = `${u.label} ${u.who}`.trim();
      if (u.sent) out.push({ who: nm, verb: SENT_VERB[u.st], at: u.sent, reason: '', kind: 'ok' });
      if (u.ret) out.push({ who: nm, verb: RETURN_VERB[u.st], at: u.ret, reason: u.why, kind: 'bad' });
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
  return (
    <div className={s.hist}>
      <div className={s.histHead}>{tr('Түүх')}</div>

      {cycles.map((r, i) => {
        /*
         * ДАХИН ШАЛГАЛТЫН ТОЙРОГ уу? Инженер менежерийн буцаалтыг дахин
         * шалгаад менежерт илгээхэд ШИНЭ мөр үүсдэг боловч компани дахин
         * илгээгээгүй тул `Компани_илгээсэн_огноо` нь өмнөхтэйгээ ИЖИЛ үлдэнэ.
         */
        const again = i > 0 && !!r[F.companySent] && r[F.companySent] === cycles[i - 1][F.companySent];
        const steps = stepsOf(r, stage, !again);
        const out = outcomeOf(r, stage);
        return (
          <div key={r[F.id]} className={s.cyc}>
            <div className={s.cycHead}>
              <span className={s.cycNo}>{i + 1}</span>
              <span className={s.cycTitle}>{tr('{0}-р хянуулалт', String(i + 1))}</span>
              {again && <span className={s.cycTag}>{tr('дахин шалгалт')}</span>}
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
 * ⚠️ ХЯНАГЧ ЮУГ ЗӨВШӨӨРЧ БАЙГААГАА ХАРАХ ЁСТОЙ. Хяналтын бүртгэл нь зөвхөн
 * хэн, хэзээ илгээснийг хэлдэг — компани ЮУ бөглөснийг хэлдэггүй. Түүнгүйгээр
 * зөвшөөрөх товч нь ёсорхуу дарах үйлдэл болно.
 */
function Submitted({
  bagts,
  sheetOid,
  sentAt,
  ok,
  onCell,
  onChanges,
  onSubAt,
  onOkAll,
}: {
  bagts: string;
  sheetOid: number;
  sentAt: string | null;
  /** Зөвшөөрсөн нүднүүд — эцэг (`Item`) эзэмшинэ: товч түүнд байна. */
  ok?: Set<string>;
  onCell?: (row: number, block: string) => void;
  /** Өөрчлөлтийн жагсаалтыг эцэгт мэдэгдэнэ — «бүгд зөвшөөрөгдсөн үү» гэж бодоход. */
  onChanges?: (c: Change[] | null) => void;
  /** Илгээлтийн агшин (`payload.at`) — эцэг `apply`-д `subAt` болгон дамжуулна (2026-09-24). */
  onSubAt?: (at: number | undefined) => void;
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
  const [data, setData] = useState<Submission | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  /** «Дахин оролдох» тоолуур — уншилтын effect-ийг дахин асаана. */
  const [tryN, setTryN] = useState(0);
  /**
   * ӨӨРЧЛӨГДСӨН НҮД РҮҮ ҮСРЭХ хүсэлт — жагсаалтаас дарахад бөглөх хуудас
   * тэр мөр рүү гүйж, нүдийг богино анивчилтаар онцолно.
   * ⚠️ 1,370 мөрөөс өөрчлөгдсөн хэдэн нүдийг гараар олох боломжгүй.
   */
  const [jump, setJump] = useState<{ row: number; block: string; n: number } | null>(null);
  /** Өөрчлөгдсөн нүд: `${мөр}:${блок}` — бөглөх хуудсанд улаанаар тэмдэглэнэ. */
  /** Хэдийг нь зөвшөөрсөн — толгойд харуулна. */
  const okCount = (data?.changes ?? []).filter((c) => ok?.has(`${c.row}:${c.block}`)).length;
  const changedKeys = useMemo(
    () => new Set((data?.changes ?? []).map((c) => `${c.row}:${c.block}`)),
    [data],
  );

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr('');
    /* ⚠️ Уншилт дуустал ба УНАСАН үед `null` (2026-09-06): урьд нь унахад
       `changes` `[]` хэвээр үлдэж, дээд талын батлах товч «өөрчлөлтгүй» мэт
       ИДЭВХТЭЙ байв — хянагч агуулгыг харалгүй батлах зам. `lack`-ийн гурван
       төлөвтэй ижил дүрэм. */
    onChanges?.(null);
    onSubAt?.(undefined);
    loadSubmission(bagts, sheetOid)
      /* ⚠️ Агшин ОЛДООГҮЙ (`null`) бол `[]` БИШ `null` — эс бөгөөс батлах товч
         «өөрчлөлтгүй» гэж нээгддэг байв (2026-09-23). */
      .then((d) => { if (alive) { setData(d); onChanges?.(d ? d.changes : null); onSubAt?.(d?.subAt); } })
      .catch((e) => { if (alive) { setErr(String((e as Error)?.message ?? e)); onChanges?.(null); } })
      .finally(() => { if (alive) setBusy(false); });
    // ⚠️ Задлах бүрд БИШ, нэг л удаа — хамаарал нь зөвхөн бүртгэлийн түлхүүр
    //    (ба «Дахин оролдох» тоолуур)
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagts, sheetOid, tryN]);

  if (busy) return <div className={s.subMuted}>{tr('Нийтэлсэн гүйцэтгэлийг татаж байна…')}</div>;
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
  if (!data) return <div className={s.subMuted}>{tr('Холбогдох архивын агшин олдсонгүй.')}</div>;

  return (
    <div className={s.sub}>
      <div className={s.subHead}>
        <span>{tr('Нийтэлсэн гүйцэтгэл')}</span>
        <span className={s.subMeta}>
          {/*
            * ⚠️ Хараахан АРХИВЛААГҮЙ илгээлтийг «архивлав» гэж ХЭЛЭХГҮЙ
            *    (2026-09-04). Гүйцэтгэл нь ерөнхий менежер баталтал үндсэн
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
        <div className={s.subWarn}>{tr('Энэ нийтлэлд обьём огт бөглөгдөөгүй байна.')}</div>
      )}
      <>
          <div className={s.subMuted}>
            {/*
              * ⚠️ «Анхны нийтлэл» гэхийн оронд НИЙТЭЛСЭН ЯГ АГШНЫГ бичнэ —
              * хянагчид «хэзээ ирсэн бэ» гэдэг нь илүү хэрэгтэй мэдээлэл.
              */}
            {tr('Нийтэлсэн: {0}', stamp(sentAt))}
            {' · '}
            {tr('Обьём бөглөсөн ажил: {0}', String(data.filledCount))}
            {' · '}
            {tr('өөрчлөгдсөн нүд: {0}', String(data.changes.length))}
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
            {onOkAll && okCount < data.changes.length && (
              <>
                {' · '}
                <button
                  type="button"
                  className={s.okAllBtn}
                  onClick={onOkAll}
                  title={tr('Зөвхөн системийн админд. Өөрчлөгдсөн {0} нүдийг бүгдийг нь ногоон болгож тэмдэглэнэ — шийдвэрийг доод талын товч гаргана.', String(data.changes.length - okCount))}
                >
                  {tr('✓ бүгдийг ногоон болгох ({0})', String(data.changes.length - okCount))}
                </button>
              </>
            )}
            {data.compared && (
              <>
                {' · '}
                <span className={s.subLegend}>
                  {tr('улаан хүрээ — энэ нийтлэлд өөрчлөгдсөн')}
                </span>
              </>
            )}
          </div>
          {/*
            * ⚠️ ОГНОО БА «ШИНЭЧЛЭГДСЭН ОГНОО»-ны ЗАСВАР (2026-09-04-ний аудит).
            *   Урьд нь `changes` нь ЗӨВХӨН обьёмын нүднээс бүтдэг байсан тул
            *   хуваарийн огнооны засвар ба `asOf` нь хянагчид ОГТ харагдахгүй,
            *   «өөрчлөгдсөн нүд: 0» гэж бичээд зөвшөөрөх товч ямар ч
            *   тэмдэглэлгүй нээлттэй байв. Ерөнхий менежер батлахад тэр `asOf`
            *   нь БҮХ мөрийн төлөвлөгөөт хувийг дахин бодуулна — хэн ч
            *   хараагүй өөрчлөлт.
            * ⚠️ Зөвшөөрлийн ГАРЦ болгохгүй (`allOk`-д ордоггүй): огнооны нүд
            *   дээр дарж ногоон болгох зам байхгүй тул түгжвэл багц гацна.
            */}
          {data.asOfChanged && (
            <div className={s.subWarn}>
              {tr('«Шинэчлэгдсэн огноо» өөрчлөгдсөн — батлахад БҮХ мөрийн төлөвлөгөөт гүйцэтгэл дахин бодогдоно.')}
            </div>
          )}
          {data.dateChanges.length > 0 && (
            <div className={s.subMuted}>
              {tr('Хуваарийн огноо засагдсан: {0}', String(data.dateChanges.length))}
              {' — '}
              {data.dateChanges.slice(0, 8).map((d, i) => (
                <span key={`${d.no}:${d.block}:${d.se}:${i}`}>
                  {i > 0 ? '; ' : ''}
                  {`${d.block} · ${d.work} · ${d.se === 's' ? tr('эхлэх') : tr('дуусах')}: ${d.from ?? '—'} → ${d.to ?? '—'}`}
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
          {data.subAt != null && sentAt != null && data.subAt > Date.parse(sentAt) + 15 * 60_000 && (
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
                    title={`${c.no} · ${c.work}`}
                    onClick={() =>
                      setJump((j) => ({ row: c.row, block: c.block, n: (j?.n ?? 0) + 1 }))
                    }
                  >
                    <span className={s.chBlk}>{c.block}</span>
                    <span className={s.chWork}>{c.work}</span>
                    <span className={s.chVal}>
                      {/* ⚠️ Обьём өөрчлөгдөөгүй (хувиар бөглөсөн) бол ХУВИЙГ харуулна (2026-09-24) */}
                      {c.from === c.to && c.toPct !== undefined
                        ? <>{c.fromPct == null ? '—' : pcs(c.fromPct)} → <b>{c.toPct == null ? '—' : pcs(c.toPct)}</b></>
                        : <>{c.from == null ? '—' : qty(c.from)} → <b>{qty(c.to)}</b></>}
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
          <div className={s.subSheet}>
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

function Item({ work, stage, who, me, bypass, onFix, readOnly, isSuper }: {
  work: Work; stage: Stage; who: string; onFix: () => void;
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
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
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
     ХААЛТТАЙ; ерөнхий менежерийн шат биш бол ил `[]` тавина. */
  const [lack, setLack] = useState<string[] | null>(null);
  /** «Дахин шалгах» — тоолуур ахих бүрд эффект дахин ажиллана. */
  const [lackTry, setLackTry] = useState(0);
  useEffect(() => {
    /* ⚠️ 4·5·6-р шат — AGOL-д гараар нэмсэн талбарууд (`DIRECTOR_FIELDS`) */
    if (stage !== 'director' && stage !== 'head' && stage !== 'chief') { setLack([]); return; }
    let alive = true;
    setLack(null);
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
        if (m != null) { setLack(m); return; }
        if (i < 2) await new Promise((r) => { setTimeout(r, 400 * (i + 1)); });
      }
    })();
    return () => { alive = false; };
  }, [stage, lackTry]);
  /** Товчийг хаах уу — дутуу ЭСВЭЛ тодорхойгүй бол ХАА. */
  const lackBlocks = lack == null || lack.length > 0;
  /**
   * ДЭЭД ШАТНААС БУЦСАНЫГ ДАХИН ШАЛГАХ — хоёр газарт давтагдана.
   * ⚠️ Буцаалт нэг алхам л ухардаг тул дахин шалгагч нь ДАМЖУУЛАГЧ БИШ:
   *    асуудалгүй бол дээшээ эргүүлж илгээнэ, асуудалтай бол доошоо буцаана.
   */
  const upperOfMe = stage !== 'company' ? nextReview(stage) : null;
  const [okKeys, setOkKeys] = useState<Set<string>>(new Set());
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
  useEffect(() => {
    if (!recheckSeed) { setOkKeys(new Set()); return; }
    try {
      const arr = JSON.parse(String(curOkRaw || '[]')) as unknown;
      setOkKeys(new Set(Array.isArray(arr) ? arr.filter((k): k is string => typeof k === 'string') : []));
    } catch {
      setOkKeys(new Set());
    }
  }, [curSheetOid, recheckSeed, curOkRaw]);
  const toggleOk = useCallback((row: number, block: string) => {
    setOkKeys((prev) => {
      const n = new Set(prev);
      const k = `${row}:${block}`;
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }, []);
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
      .map((c) => `${c.block} · ${c.work} → ${c.from === c.to && c.toPct !== undefined ? (c.toPct == null ? '—' : pcs(c.toPct)) : (c.to ?? '—')}`)
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
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; warn?: string }>) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    /* ⚠️ Анхааруулга (`warn`) нь АЛДАА БИШ — тусдаа шар мөрөөр (2026-09-23);
       урьд нь улаан `error` ангилалд орж «бүтсэнгүй» гэж уншигддаг байв. */
    setErr(r.ok ? '' : (r.error ?? tr('Алдаа гарлаа')));
    setWarn(r.ok ? (r.warn ?? '') : '');
    if (r.ok) setReason('');
  };

  const review = (decision: (typeof DECISION)[keyof typeof DECISION]) =>
    run(() => apply({
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
      okCells: [...okKeys],
      /* ⚠️ Илгээлтийн агуулгын тулгалт (2026-09-24) — `hyanaltStore.apply`-ийн `subAt` */
      subAt,
    }));

  const reviewing = stage !== 'company' && st === REVIEW_STATUS[stage];
  const rechecking = recheckSeed;
  const reBy = (stage === 'company' || stage === 'chief' ? 'engineer' : stage) as Exclude<ReviewStage, 'chief'>;

  return (
    <div className={s.item}>
      <button className={s.itemHead} onClick={() => setOpen((v) => !v)}>
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
        <span className={s.who}>
          <div className={s.ajil} title={work.ajil}>{work.ajil}</div>
          <div className={s.meta} title={`${work.bagts} · ${work.company}`}>{work.bagts} · {work.company}</div>
        </span>
        <Track status={st} stage={stage} />
        <span className={`${s.badge} ${badgeClass(st, stage)}`}>{statusLabel(st, stage)}</span>
      </button>

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
                      disabled={busy || lackBlocks || changes == null || (changes.length > 0 && !allOk)}
                      title={
                        changes == null
                          ? tr('Илгээлтийн агуулга татагдаагүй тул батлах боломжгүй')
                          : changes.length > 0 && !allOk
                          ? tr('Эхлээд өөрчлөгдсөн нүд бүр дээр дарж зөвшөөрнө үү — үлдсэн {0}', String(bad.length))
                          /*
                           * ⚠️ ЕРӨНХИЙ МЕНЕЖЕРИЙН товч нь одоо ЖИНХЭНЭ бичилт
                           *    хийдэг: түүнийг дарж байж л гүйцэтгэл үндсэн
                           *    өгөгдөлд (архив + нэгтгэл) орно. Хэрэглэгч
                           *    үүнийг МЭДЭЖ дарах ёстой.
                           */
                          : stage === 'chief'
                            ? tr('Баталсны дараа гүйцэтгэл архивт бичигдэж, нэгтгэлд бүртгэгдэнэ — үүнээс өмнө үндсэн өгөгдөлд ОРООГҮЙ')
                            : undefined
                      }
                      onClick={() => review(DECISION.approve)}>
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
                      onClick={() => review(DECISION.return)}>
                      {tr('Буцаах')}
                      {bad.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
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
                      {upperOfMe === 'manager' ? cur[F.managerReason]
                        : upperOfMe === 'director' ? cur[F.directorReason]
                          : upperOfMe === 'head' ? cur[F.headReason]
                            : upperOfMe === 'chief' ? cur[F.chiefReason] : ''}
                    </span>
                  </div>
                  <textarea
                    className={s.field}
                    rows={2}
                    placeholder={RECHECK_HINT[reBy]}
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
                    <button className={`${s.btn} ${s.ok}`} disabled={busy || lackBlocks}
                      onClick={() => run(() => recheck(cur.__oid, 'ok', '', who, reBy, me, bypass, undefined))}>
                      {RECHECK_UP[reBy]}
                    </button>
                    <button className={`${s.btn} ${s.bad}`} disabled={busy || lackBlocks}
                      title={bad.length ? tr('Зөвшөөрөгдөөгүй нүднүүд шалтгаанд өөрсдөө жагсаана') : undefined}
                      onClick={() => run(() => recheck(cur.__oid, 'back', badText(), who, reBy, me, bypass, [...okKeys]))}>
                      {RECHECK_DOWN[reBy]}
                      {bad.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
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
                    <button className={`${s.btn} ${s.ok}`} onClick={onFix}>
                      {tr('Засаад дахин илгээх')}
                    </button>
                  </div>
                </>
              )}

              {err && <div className={s.error} role="alert">{err}</div>}
              {warn && <div className={s.warn} role="status">{warn}</div>}
            </div>
          )}

          <Submitted
            bagts={work.bagts}
            sheetOid={cur[F.sheetOid]}
            sentAt={cur[F.companySent]}
            /* ⚠️ Дахин шалгалтад ч нүд тэмдэглэнэ (2026-09-24, дээрх `recheckSeed`-ийн ⚠️) */
            ok={reviewing || rechecking ? okKeys : undefined}
            onCell={reviewing || rechecking ? toggleOk : undefined}
            onChanges={setChanges}
            onSubAt={setSubAt}
            /* ⚠️ ЗӨВХӨН super БА зөвшөөрөх шатанд — эс бөгөөс жинхэнэ хянагч
               нэг товчоор бүгдийг батлах зам нээгдэнэ (2026-08-27-ны дүрэм). */
            onOkAll={isSuper && reviewing
              ? () => setOkKeys(new Set((changes ?? []).map((c) => `${c.row}:${c.block}`)))
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
  const { role, user, status: authStatus } = useAuth();
  /**
   * Хяналтын бүртгэлд бичигдэх НЭР — нэвтэрсэн хэрэглэгчээс.
   *
   * ⚠️ Урьд нь «Б.Болд» гэх мэт туршилтын хатуу нэрс амьд хүснэгтэд бичигдэж,
   *    зөвшөөрлийн түүх зохиомол хүний нэрээр «баталгаажиж» байв.
   * ⚠️ tr() ХЭРЭГЛЭХГҮЙ — энэ нь дэлгэцийн бичвэр биш, ArcGIS-д хадгалагдах
   *    ӨГӨГДӨЛ (төлөвийн утгуудтай ижил дүрэм). Нэвтрэлт унтраалттай (дев)
   *    үед user байхгүй тул худал хүний нэрийн оронд ерөнхий «Хянагч» орно.
   */
  const who = user?.fullName || user?.username || 'Хянагч';
  /** Томилгоо өөрчлөгдөхөд (5 мин poll, өөр таб) дахин бодно */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  /** Админы сонгогчоор сонгосон шат — зөвхөн `canPick` үед утгатай */
  const [picked, setPicked] = useState<Stage>('engineer');
  const flow = useMemo(
    () => resolveFlowStage(user?.username, role, picked, authStatus === 'off'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, picked, authStatus, aclN],
  );
  const stage: Stage = flow.stage ?? 'engineer';
  /** Түгжигдсэн шат (толгойн тэмдэг) — сонгогчтой админд байхгүй */
  const fixed = flow.canPick ? undefined : flow.stage;
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
   * бөгөөс тэр эрх УТГАГҮЙ болно: Ерөнхий менежер мөр нэмэх эрхтэй атлаа
   * хуудас руу орох замгүй байв.
   *
   * ⚠️ 2026-09-03: урьд нь `qaqc` (Inspection Test Plan) эрх ч энэ табыг
   *    нээдэг байсныг чанарын хэсэгтэй хамт хассан.
   *
   * ⚠️ Бөглөх ХУУДАС нь өөрөө багцаар шүүгддэг (`FillNew` дэх `bagtsScope`)
   * тул энэ нь «аль багц» гэдгийг нээхгүй — зөвхөн «энэ таб байна уу».
   */
  const canFill = stage === 'company' || hasCap(user?.username, 'addRow');
  /** Гүйцэтгэгчийн хуудас хоёр талтай: бөглөх ба илгээснээ хянах. */
  /**
   * ⚠️ АНХНЫ ТАБ нь «Илгээсэн ажил» — бөглөх нь БИШ. Хуудсанд ороход эхлээд
   * «миний илгээсэн ажил хаана явж байна» гэдэг харагдах ёстой; бөглөх нь
   * тэндээс сонгож ордог үйлдэл. Урьд нь шууд бөглөх хуудас нээгддэг тул
   * гүйцэтгэгч өөрийн илгээлтийн явцыг хардаггүй байв.
   */
  const [tab, setTab] = useState<'fill' | 'sent' | 'negtgel'>('sent');
  const [q, setQ] = useState('');
  const [bagts, setBagts] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const { rows, loading, error, reload } = useHyanaltRows();
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

  const bagtsList = useMemo(() => optionsOf(works, (w) => w.bagts), [works]);
  const companyList = useMemo(() => optionsOf(works, (w) => w.company), [works]);
  const statusList = useMemo(() => statusOptions(stage), [stage]);

  /** Хайлт нь ажил, багц, компани гурвыг хамарна */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // ⚠️ Төлөвийн шүүлт нь ОЛОН төлөвийг нэгтгэж болно (компанийн харагдац)
    const want = statusList.find((o) => o.value === status)?.match;
    return works.filter((w) =>
      (!needle
        || w.ajil.toLowerCase().includes(needle)
        || w.bagts.toLowerCase().includes(needle)
        || w.company.toLowerCase().includes(needle))
      && (!bagts || w.bagts === bagts)
      && (!company || w.company === company)
      && (!want || want.includes(w.status)));
  }, [works, q, bagts, company, status, statusList]);

  const mine = filtered.filter((w) => w.owner === stage && w.status !== STATUS.transferred);
  const others = filtered.filter((w) => !(w.owner === stage && w.status !== STATUS.transferred));

  /*
   * ГҮЙЦЭТГЭГЧИЙН ХАРАГДАЦ — «миний илгээсэн ажил хаана явж байна вэ».
   *
   * ⚠️ Урьд нь илгээсэн ажил нь «Бусад ажил» гэсэн нэг овоонд ордог байв —
   * тэр нь ӨӨР ХҮНИЙ ажил гэж уншигдах бөгөөд гүйцэтгэгч өөрийн илгээлт ямар
   * шатанд байгааг хаанаас ч харж чаддаггүй байлаа. Одоо гурав салгав:
   *   1. `mine`      — буцаагдсан, ЗАСАХ шаардлагатай (дээд талд)
   *   2. `inReview`  — илгээгдсэн, ХЯНАГДАЖ байна (мөр бүр дээр `Track` нь
   *                    яг аль шатанд байгааг харуулна)
   *   3. `done`      — зургаан шат (инженер → … → газрын дарга) өнгөрч ШИЛЖҮҮЛСЭН
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
  const goFix = () => setTab('fill');

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          <div className={s.title}>{tr('Гүйцэтгэлийн хяналт')}</div>
          {/* ⚠️ Гүйцэтгэгчид дээд шатны НЭР харагдахгүй — `Track`-тай ижил
              дугаарласан хэлхээ (2026-09-23). */}
          <div className={s.sub}>
            {seesManager(stage)
              ? tr('гүйцэтгэгч → хяналтын инженер → багцын менежер → ерөнхий менежер → хэлтсийн дарга → газрын дарга')
              : tr('гүйцэтгэгч → 2-р шат → 3-р шат → 4-р шат → 5-р шат → 6-р шат')}
          </div>
        </div>
        <span className={s.spacer} />
        {/* Хэн болох нь — үүргээс. Солих товч ЗӨВХӨН үүрэггүй (дев/super) үед. */}
        {fixed && <span className={s.roleBadge}>{STAGE_LABEL[fixed]}</span>}
        <Flow
          counts={Object.fromEntries(STAGE_ORDER.map((x) => [x, countFor(x)])) as Record<Stage, number>}
          stage={stage}
          pick={flow.canPick ? (x) => { setPicked(x); setStatus(ALL); } : undefined}
        />
      </header>

      {/* ГҮЙЦЭТГЭГЧИЙН ХОЁР ТАЛ — бөглөх ба илгээснээ хянах. Урьд нь эдгээр
          ХОЁР ТУСДАА харагдац байсан тул компани хуудас хооронд үсэрч,
          «би юу илгээснээ» хаанаас харахаа мэддэггүй байв. */}
      <div className={s.tabs}>
        {canFill && (
          <>
            <button
              type="button"
              className={`${s.tab} ${tab === 'fill' ? s.tabOn : ''}`}
              onClick={() => setTab('fill')}
            >
              {tr('Гүйцэтгэл бөглөх')}
            </button>
            <button
              type="button"
              className={`${s.tab} ${tab === 'sent' ? s.tabOn : ''}`}
              onClick={() => setTab('sent')}
            >
              {tr('Илгээсэн ажил')}
              {countFor('company') > 0 && <span className={s.count}>{countFor('company')}</span>}
            </button>
          </>
        )}
        {/*
          * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — төслийн ажлын задаргааны (WBS) мод.
          *
          * ⚠️ Бөглөх эрхээс ҮЛ ХАМААРНА: энэ нь бөглөх хуудас БИШ, төслийн
          * нэгдсэн явцын харагдац. Гүйцэтгэгч ч, хянагч ч ижил тоог харна.
          */}
        <button
          type="button"
          className={`${s.tab} ${tab === 'negtgel' ? s.tabOn : ''}`}
          onClick={() => setTab('negtgel')}
        >
          {tr('Нэгтгэл гүйцэтгэл')}
        </button>
        {/* ⚠️ «Эрх тохируулах» ЭНДЭЭС ХАСАГДСАН — Админ портал дотор
            тусдаа бүлэг болов. Ажлын хуудсанд тохиргооны товч байвал
            хянагч санамсаргүй дараад хуваарилалт өөрчилнө. */}
      </div>

      {tab === 'negtgel' ? (
        <div className={s.fill}>
          <TusulNegtgel />
        </div>
      ) : canFill && tab === 'fill' ? (
        <div className={s.fill}>
          <Sheet />
        </div>
      ) : (
      <>
      <div className={s.bar}>
        <input className={s.search} placeholder={tr('Ажил, багц, компаниар хайх…')}
          value={q} onChange={(e) => setQ(e.target.value)} />

        <select className={s.select} value={bagts} onChange={(e) => setBagts(e.target.value)}>
          <option value={ALL}>{tr('Бүх багц')}</option>
          {bagtsList.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>

        <select className={s.select} value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value={ALL}>{tr('Бүх компани')}</option>
          {companyList.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>

        <select className={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
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
        <span className={s.total}>{tr('{0} ажил', String(filtered.length))}</span>
      </div>

      <div className={s.body}>
        {error && (
          <div className={s.note}>
            {tr('Үйлчилгээнээс өгөгдөл татаж чадсангүй: {0}', error)}
            <button className={s.clear} onClick={reload}>{tr('Дахин оролдох')}</button>
          </div>
        )}

        {loading ? (
          <div className={s.empty}>{tr('Ачаалж байна…')}</div>
        ) : (
          <>
            <div className={s.list}>
              {/* ⚠️ Нэр ЗҮҮН, тоо БАРУУН — зураасаар холбохгүй */}
              <div className={s.groupHead}>
                <span>{stage === 'company' ? tr('Засах шаардлагатай — буцаагдсан') : STAGE_LABEL[stage]}</span>
                <span className={s.groupCount}>
                  {tr('хүлээгдэж буй {0}', String(mine.length))}
                </span>
              </div>
              {mine.length === 0 ? (
                <div className={s.empty}>
                  {/* ⚠️ Томилгоогүй бол жагсаалт ХООСОН байх нь ХЭВИЙН биш —
                      шалтгааныг нь ялгаж хэлнэ, эс бөгөөс «ажил алга» гэж
                      ойлгоод хүлээсээр байна. */}
                  {noScope
                    ? tr('Танд нэг ч багц хуваарилагдаагүй байна. Админ «Гүйцэтгэлийн урсгал» хэсэгт багц зааж өгсний дараа ажлууд харагдана.')
                    : stage === 'company'
                      ? tr('Буцаагдсан ажил алга — бүх илгээлт хэвийн явж байна.')
                      : tr('Хүлээгдэж буй ажил алга.')}
                </div>
              ) : (
                mine.map((w) => <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} />)
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
                    {inReview.map((w) => (
                      <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} />
                    ))}
                  </div>
                )}
                {done.length > 0 && (
                  <div className={s.list} style={{ marginTop: 18 }}>
                    <div className={s.groupHead}>
                      <span>{tr('Батлагдсан — эх хүснэгтэд шилжсэн')}</span>
                      <span className={s.groupCount}>{done.length}</span>
                    </div>
                    {done.map((w) => (
                      <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} />
                    ))}
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
                  {others.map((w) => <Item key={w.key} work={w} stage={stage} who={who} me={user?.username} bypass={authStatus === 'off' || flow.canPick} onFix={goFix} readOnly={!canReview} isSuper={flow.canPick} />)}
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

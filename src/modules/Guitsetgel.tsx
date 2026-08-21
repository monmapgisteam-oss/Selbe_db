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
 * ⚠️ ШАТЫГ ОДООХОНДОО ТОВЧООР СОЛИНО. Порталын үүрэг (`super`/`beginner`/
 * `tolovlolt`) нь компани/инженер/менежер гэсэн ЭНЭ урсгалын шаттай тохирдоггүй.
 * Бодит нэвтрэлтээс тогтоохын тулд `ROLE_BY_USER`-т шат нэмэх шаардлагатай.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  DECISION, F, missingDirectorFields, OWNER, STAGE_ORDER, STATUS,
  type Row, type Stage, type Status,
} from '@/lib/hyanalt';
import { useAuth } from '@/components/AuthGate';
import { ROLE_STAGE } from '@/lib/services';
import { bagtsFor, subscribeAcl } from '@/lib/guitsetgelAcl';
import { Sheet } from '@/modules/sheet/Sheet';
import { groupWorks, optionsOf, type Work } from '@/lib/hyanaltGroup';
import { apply, recheck, useHyanaltRows } from '@/lib/hyanaltStore';
import { loadSubmission, type Change, type Submission } from '@/lib/hyanaltDetail';
import s from './guitsetgel.module.css';

const STAGES: Stage[] = ['company', 'engineer', 'manager', 'director'];

/** Шатны нэр — эрхийн панел ч ЭНЭ жагсаалтыг хэрэглэнэ (нэг эх сурвалж). */
export const STAGE_LABEL: Record<Stage, string> = {
  company: tr('Гүйцэтгэгч компани'),
  engineer: tr('Хяналтын инженер'),
  manager: tr('Багцын менежер'),
  director: tr('Ерөнхий менежер'),
};

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
  [STATUS.transferred]: tr('Шилжүүлсэн'),
};

/* ⚠️ Туршилтын нэр — бодит системд нэвтэрсэн хэрэглэгчийн нэр орно */
const WHO: Record<'engineer' | 'manager' | 'director', string> = {
  engineer: 'Б.Болд',
  manager: 'С.Отгоо',
  director: 'Д.Ганбат',
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
  // ⚠️ Ерөнхий менежерийн буцаалт нь БАГЦЫН МЕНЕЖЕРТ очно — компани ч,
  //    инженер ч үүнийг «буцсан» гэж харах ёсгүй: тэдний гар дээр ирээгүй.
  if (st === STATUS.directorReturned)
    return stage === 'manager' || stage === 'director' ? s.bBack : s.bWait;
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

    const dir = `${tr('Ерөнхий менежер')} ${r[F.director]}`.trim();
    if (r[F.directorSent]) {
      out.push({ who: dir, verb: tr('баталж бүртгэв'), at: r[F.directorSent], reason: '', kind: 'ok' });
    }
    if (r[F.directorReturned]) {
      out.push({
        who: dir,
        verb: tr('багцын менежерт буцаав'),
        at: r[F.directorReturned],
        reason: r[F.directorReason],
        kind: 'bad',
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
  const back = st === STATUS.managerReturned || st === STATUS.directorReturned;
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
}: {
  bagts: string;
  sheetOid: number;
  sentAt: string | null;
  /** Зөвшөөрсөн нүднүүд — эцэг (`Item`) эзэмшинэ: товч түүнд байна. */
  ok?: Set<string>;
  onCell?: (row: number, block: string) => void;
  /** Өөрчлөлтийн жагсаалтыг эцэгт мэдэгдэнэ — «бүгд зөвшөөрөгдсөн үү» гэж бодоход. */
  onChanges?: (c: Change[]) => void;
}) {
  const [data, setData] = useState<Submission | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
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
    loadSubmission(bagts, sheetOid)
      .then((d) => { if (alive) { setData(d); onChanges?.(d?.changes ?? []); } })
      .catch((e) => { if (alive) setErr(String((e as Error)?.message ?? e)); })
      .finally(() => { if (alive) setBusy(false); });
    // ⚠️ Задлах бүрд БИШ, нэг л удаа — хамаарал нь зөвхөн бүртгэлийн түлхүүр
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagts, sheetOid]);

  if (busy) return <div className={s.subMuted}>{tr('Нийтэлсэн гүйцэтгэлийг татаж байна…')}</div>;
  if (err) return <div className={s.subMuted}>{tr('Гүйцэтгэлийг татаж чадсангүй: {0}', err)}</div>;
  if (!data) return <div className={s.subMuted}>{tr('Холбогдох архивын агшин олдсонгүй.')}</div>;

  return (
    <div className={s.sub}>
      <div className={s.subHead}>
        <span>{tr('Нийтэлсэн гүйцэтгэл')}</span>
        <span className={s.subMeta}>
          {data.pkgLabel} · {tr('{0} мөр архивлав', String(data.rows))}
        </span>
      </div>

      {data.filledCount === 0 ? (
        // ⚠️ Энэ нь ЧУХАЛ дохио: юу ч бөглөөгүй нийтлэлийг зөвшөөрөх ёсгүй
        <div className={s.subWarn}>{tr('Энэ нийтлэлд обьём огт бөглөгдөөгүй байна.')}</div>
      ) : (
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
            {data.compared && (
              <>
                {' · '}
                <span className={s.subLegend}>
                  {tr('улаан хүрээ — энэ нийтлэлд өөрчлөгдсөн')}
                </span>
              </>
            )}
          </div>
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
                      {c.from == null ? '—' : qty(c.from)} → <b>{qty(c.to)}</b>
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
                changed: changedKeys,
                jump,
                ok,
                onCell,
              }}
            />
          </div>

        </>
      )}
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

function Item({ work, stage, onFix }: { work: Work; stage: Stage; onFix: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
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
  const [changes, setChanges] = useState<Change[]>([]);
  /**
   * Үйлчилгээнд 4-р шатны талбар байгаа эсэх.
   * ⚠️ Байхгүй үед «Батлах» дарвал ArcGIS алдаа буцааж, менежер баталсан
   *    гэж бодох боловч юу ч хадгалагдахгүй. Тиймээс ӨМНӨӨС нь хаана.
   */
  const [lack, setLack] = useState<string[]>([]);
  useEffect(() => {
    if (stage !== 'director') return;
    let alive = true;
    missingDirectorFields().then((m) => { if (alive) setLack(m); });
    return () => { alive = false; };
  }, [stage]);
  const [okKeys, setOkKeys] = useState<Set<string>>(new Set());
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
  const bad = changes.filter((c) => !okKeys.has(`${c.row}:${c.block}`));
  const allOk = changes.length > 0 && bad.length === 0;

  /**
   * Буцаах шалтгаанд асуудалтай нүднүүд ӨӨРСДӨӨ орно.
   * ⚠️ «Зөв биш байна» гэсэн ганц өгүүлбэр нь гүйцэтгэгчид юу засахыг
   *    хэлдэггүй — аль блокийн аль ажил нь болохыг нэрлэж өгнө.
   */
  const badText = () => {
    if (!bad.length) return reason.trim();
    const list = bad
      .slice(0, 12)
      .map((c) => `${c.block} · ${c.work} → ${c.to ?? "—"}`)
      .join("; ");
    const more = bad.length > 12 ? ` … +${bad.length - 12}` : "";
    const head = tr("Зөвшөөрөгдөөгүй {0} нүд: ", String(bad.length));
    return [reason.trim(), head + list + more].filter(Boolean).join(" | ");
  };
  const mine = work.owner === stage && st !== STATUS.transferred;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setErr(r.ok ? '' : (r.error ?? tr('Алдаа гарлаа')));
    if (r.ok) setReason('');
  };

  const review = (decision: (typeof DECISION)[keyof typeof DECISION]) =>
    run(() => apply({
      oid: cur.__oid,
      stage: stage === 'engineer' ? 'engineer' : stage === 'manager' ? 'manager' : 'director',
      decision,
      reason: decision === DECISION.return ? badText() : reason,
      who: stage === 'engineer' ? WHO.engineer : stage === 'manager' ? WHO.manager : WHO.director,
    }));

  const reviewing =
    (stage === 'engineer' && st === STATUS.engineerReview) ||
    (stage === 'manager' && st === STATUS.managerReview) ||
    (stage === 'director' && st === STATUS.directorReview);

  /**
   * ДЭЭД ШАТНААС БУЦСАНЫГ ДАХИН ШАЛГАХ — хоёр газарт давтагдана.
   * ⚠️ Буцаалт нэг алхам л ухардаг тул дахин шалгагч нь ДАМЖУУЛАГЧ БИШ:
   *    асуудалгүй бол дээшээ эргүүлж илгээнэ, асуудалтай бол доошоо буцаана.
   */
  const rechecking =
    (stage === 'engineer' && st === STATUS.managerReturned) ||
    (stage === 'manager' && st === STATUS.directorReturned);
  const reBy: 'engineer' | 'manager' = stage === 'manager' ? 'manager' : 'engineer';
  const reWho = stage === 'manager' ? WHO.manager : WHO.engineer;

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
                    placeholder={tr('Буцаах бол шалтгаанаа бичнэ үү (зөвшөөрөхөд шаардлагагүй)')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className={s.row}>
                    {lack.length > 0 && (
                      <div className={s.error}>
                        {tr('Үйлчилгээнд дараах талбарууд алга тул баталгаажуулалт хадгалагдахгүй: {0}', lack.join(', '))}
                      </div>
                    )}
                    {/* ⚠️ Бүх өөрчлөлт ногоон болтол ШИЛЖҮҮЛЭХ БОЛОМЖГҮЙ. */}
                    <button
                      className={`${s.btn} ${s.ok}`}
                      disabled={busy || lack.length > 0 || (changes.length > 0 && !allOk)}
                      title={
                        changes.length > 0 && !allOk
                          ? tr('Эхлээд өөрчлөгдсөн нүд бүр дээр дарж зөвшөөрнө үү — үлдсэн {0}', String(bad.length))
                          : undefined
                      }
                      onClick={() => review(DECISION.approve)}>
                      {stage === 'engineer'
                        ? tr('Зөвшөөрч багцын менежерт илгээх')
                        : stage === 'manager'
                          ? tr('Зөвшөөрч ерөнхий менежерт илгээх')
                          : tr('Баталж бүртгэх')}
                      {changes.length > 0 && !allOk && ` (${bad.length})`}
                    </button>
                    <button className={`${s.btn} ${s.bad}`} disabled={busy}
                      title={bad.length ? tr('Зөвшөөрөгдөөгүй нүднүүд шалтгаанд өөрсдөө жагсаана') : undefined}
                      onClick={() => review(DECISION.return)}>
                      {tr('Буцаах')}
                      {bad.length > 0 && changes.length > 0 && ` (${bad.length})`}
                    </button>
                  </div>
                </>
              )}

              {/* ── Инженер: менежер буцаасныг ДАХИН ШАЛГАНА ── */}
              {rechecking && (
                <>
                  <div className={s.reasonBox}>
                    <span className={s.reasonLabel}>
                      {stage === 'manager' ? tr('Ерөнхий менежер буцаасан') : tr('Багцын менежер буцаасан')}:{' '}
                    </span>
                    <span className={s.reasonText}>
                      {stage === 'manager' ? cur[F.directorReason] : cur[F.managerReason]}
                    </span>
                  </div>
                  <textarea
                    className={s.field}
                    rows={2}
                    placeholder={
                      stage === 'manager'
                        ? tr('Инженерт буцаах бол шалтгаанаа бичнэ үү (дээд шатны бичвэр доошоо дамжихгүй)')
                        : tr('Компанид буцаах бол шалтгаанаа бичнэ үү (менежерийн бичвэр компанид харагдахгүй)')
                    }
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className={s.row}>
                    <button className={`${s.btn} ${s.ok}`} disabled={busy}
                      onClick={() => run(() => recheck(cur.__oid, 'ok', '', reWho, reBy))}>
                      {stage === 'manager'
                        ? tr('Дахин шалгасан — асуудалгүй, ерөнхий менежерт илгээх')
                        : tr('Дахин шалгасан — асуудалгүй, менежерт илгээх')}
                    </button>
                    <button className={`${s.btn} ${s.bad}`} disabled={busy}
                      onClick={() => run(() => recheck(cur.__oid, 'back', reason, reWho, reBy))}>
                      {stage === 'manager'
                        ? tr('Асуудал байна — инженерт буцаах')
                        : tr('Асуудал байна — компанид буцаах')}
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

              {err && <div className={s.error}>{err}</div>}
            </div>
          )}

          <Submitted
            bagts={work.bagts}
            sheetOid={cur[F.sheetOid]}
            sentAt={cur[F.companySent]}
            ok={reviewing ? okKeys : undefined}
            onCell={reviewing ? toggleOk : undefined}
            onChanges={setChanges}
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
      { value: 'w', label: tr('Хянагдаж байна'), match: [STATUS.engineerReview, STATUS.managerReview, STATUS.managerReturned, STATUS.directorReview, STATUS.directorReturned] },
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
            <span className={s.flowName}>{STAGE_LABEL[x]}</span>
            <span className={s.flowNum}>{counts[x]}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function Guitsetgel({ onView }: { onView?: (key: 'sheet') => void }) {
  /**
   * ШАТЫГ АККАУНТЫН ҮҮРГЭЭС авна — гараар сонгохгүй.
   *
   * ⚠️ Урьд нь гурван товчоор өөрийгөө «инженер» гэж зарлаж болдог байсан нь
   *    хяналтын утгыг үгүй хийдэг: зөвшөөрлийг хэн дарсан нь батлагдахгүй.
   *    Одоо үүрэг нь `ROLE_BY_USER`-аас гарах бөгөөд солих боломжгүй.
   *
   * ⚠️ Нэвтрэлт унтраалттай (дев) эсвэл `super` үед л шат солигдоно — бүх
   *    урсгалыг турших шаардлагатай тул.
   */
  const { role, user } = useAuth();
  const fixed = role ? ROLE_STAGE[role] : undefined;
  const [stage, setStage] = useState<Stage>(fixed ?? 'engineer');
  useEffect(() => {
    if (fixed) setStage(fixed);
  }, [fixed]);
  /** Гүйцэтгэгчийн хуудас хоёр талтай: бөглөх ба илгээснээ хянах. */
  const [tab, setTab] = useState<'fill' | 'sent'>('fill');
  const [q, setQ] = useState('');
  const [bagts, setBagts] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const { rows, loading, error, reload } = useHyanaltRows();
  /**
   * БАГЦААР ХУВААРИЛАХ — хэн юуг хариуцахыг эрхийн панелаас.
   * ⚠️ Хуваарилалтгүй үед БҮГДИЙГ харуулна: шинэ систем дээр хэн ч юу ч
   *    харахгүй бол тохируулах хүн өөрөө орж чадахгүй болно.
   */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  const myBagts = useMemo(
    () => bagtsFor(user?.username, stage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, stage, aclN],
  );

  const works = useMemo(() => {
    const all = groupWorks(rows);
    return myBagts ? all.filter((w) => myBagts.includes(w.bagts)) : all;
  }, [rows, myBagts]);

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

  const countFor = (x: Stage) =>
    works.filter((w) => w.owner === x && w.status !== STATUS.transferred).length;

  const dirty = q || bagts || company || status;

  /*
   * ⚠️ `onView` дамжуулагдаагүй бол (тусад нь ашиглах үед) товч ажиллахгүй
   * байхын оронд ЮУ Ч ХИЙХГҮЙ — унахаас сэргийлнэ.
   */
  const goFix = () => onView?.('sheet');

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          <div className={s.title}>{tr('Гүйцэтгэлийн хяналт')}</div>
          <div className={s.sub}>{tr('гүйцэтгэгч → хяналтын инженер → багцын менежер → ерөнхий менежер')}</div>
        </div>
        <span className={s.spacer} />
        {/* Хэн болох нь — үүргээс. Солих товч ЗӨВХӨН үүрэггүй (дев/super) үед. */}
        {fixed && <span className={s.roleBadge}>{STAGE_LABEL[fixed]}</span>}
        <Flow
          counts={{
            company: countFor('company'),
            engineer: countFor('engineer'),
            manager: countFor('manager'),
            director: countFor('director'),
          }}
          stage={stage}
          pick={fixed ? undefined : (x) => { setStage(x); setStatus(ALL); }}
        />
      </header>

      {/* ГҮЙЦЭТГЭГЧИЙН ХОЁР ТАЛ — бөглөх ба илгээснээ хянах. Урьд нь эдгээр
          ХОЁР ТУСДАА харагдац байсан тул компани хуудас хооронд үсэрч,
          «би юу илгээснээ» хаанаас харахаа мэддэггүй байв. */}
      <div className={s.tabs}>
        {stage === 'company' && (
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
        {/* ⚠️ «Эрх тохируулах» ЭНДЭЭС ХАСАГДСАН — Админ портал дотор
            тусдаа бүлэг болов. Ажлын хуудсанд тохиргооны товч байвал
            хянагч санамсаргүй дараад хуваарилалт өөрчилнө. */}
      </div>

      {stage === 'company' && tab === 'fill' ? (
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
                <span>{STAGE_LABEL[stage]}</span>
                <span className={s.groupCount}>
                  {tr('хүлээгдэж буй {0}', String(mine.length))}
                </span>
              </div>
              {mine.length === 0 ? (
                <div className={s.empty}>{tr('Хүлээгдэж буй ажил алга.')}</div>
              ) : (
                mine.map((w) => <Item key={w.key} work={w} stage={stage} onFix={goFix} />)
              )}
            </div>

            {others.length > 0 && (
              <div className={s.list} style={{ marginTop: 18 }}>
                <div className={s.groupHead}>
                <span>{tr('Бусад ажил')}</span>
                <span className={s.groupCount}>{others.length}</span>
              </div>
                {others.map((w) => <Item key={w.key} work={w} stage={stage} onFix={goFix} />)}
              </div>
            )}
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}

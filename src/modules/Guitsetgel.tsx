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

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { DECISION, F, STATUS, type Row, type Stage, type Status } from '@/lib/hyanalt';
import { groupWorks, optionsOf, type Work } from '@/lib/hyanaltGroup';
import { apply, recheck, useHyanaltRows } from '@/lib/hyanaltStore';
import { loadSubmission, type Submission } from '@/lib/hyanaltDetail';
import s from './guitsetgel.module.css';

const STAGES: Stage[] = ['company', 'engineer', 'manager'];

const STAGE_LABEL: Record<Stage, string> = {
  company: tr('Гүйцэтгэгч компани'),
  engineer: tr('Талбайн инженер'),
  manager: tr('Менежер'),
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
  [STATUS.transferred]: tr('Шилжүүлсэн'),
};

/* ⚠️ Туршилтын нэр — бодит системд нэвтэрсэн хэрэглэгчийн нэр орно */
const WHO: Record<'engineer' | 'manager', string> = {
  engineer: 'Б.Болд',
  manager: 'С.Отгоо',
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
      out.push({ who: mgr, verb: tr('зөвшөөрч шилжүүлэв'), at: r[F.managerSent], reason: '', kind: 'ok' });
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
  return { text: STATUS_LABEL[st] ?? st, cls: st === STATUS.managerReturned ? s.bBack : s.bWait };
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
const pc = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(1)}%`;

/**
 * ⚠️ ХЯНАГЧ ЮУГ ЗӨВШӨӨРЧ БАЙГААГАА ХАРАХ ЁСТОЙ. Хяналтын бүртгэл нь зөвхөн
 * хэн, хэзээ илгээснийг хэлдэг — компани ЮУ бөглөснийг хэлдэггүй. Түүнгүйгээр
 * зөвшөөрөх товч нь ёсорхуу дарах үйлдэл болно.
 */
function Submitted(
  { bagts, sheetOid, sentAt }: { bagts: string; sheetOid: number; sentAt: string | null },
) {
  const [data, setData] = useState<Submission | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr('');
    loadSubmission(bagts, sheetOid)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(String((e as Error)?.message ?? e)); })
      .finally(() => { if (alive) setBusy(false); });
    // ⚠️ Задлах бүрд БИШ, нэг л удаа — хамаарал нь зөвхөн бүртгэлийн түлхүүр
    return () => { alive = false; };
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
            {data.compared && (
              <>
                {' · '}
                <span className={s.subLegend}>
                  {tr('улаан хүрээ — энэ нийтлэлд өөрчлөгдсөн')}
                </span>
              </>
            )}
          </div>
          {/* ⚠️ Хүснэгт нь ӨӨРИЙН хүрээндээ хөндлөн гүйнэ — карт өргөсгөхгүй */}
          <div className={s.subScroll}>
            <table className={s.subTable}>
              {/*
                * ⚠️ ХОЁР МӨРТ ТОЛГОЙ — хуудасны бүтэцтэй ижил. Блокийн баганууд
                * «5/1, 5/2…» гэсэн ганц тоогоор зогсвол тэдгээр нь ЮУНЫ тоо
                * болох нь мэдэгдэхгүй. Дээр нь бүлгийн нэр заавал байна.
                */}
              <thead>
                <tr>
                  <th rowSpan={2}>№</th>
                  <th rowSpan={2}>{tr('Ажил')}</th>
                  <th rowSpan={2}>{tr('Обьём')}</th>
                  <th rowSpan={2}>{tr('Обьёмын нийлбэр')}</th>
                  <th rowSpan={2}>{tr('Нэгж өртөг')}</th>
                  <th rowSpan={2}>{tr('Мөнгөн дүн')}</th>
                  <th rowSpan={2}>{tr('Төлөвлөгөөт гүйцэтгэл')}</th>
                  <th rowSpan={2}>{tr('Бодит гүйцэтгэл')}</th>
                  <th rowSpan={2}>{tr('Төлөвлөгөө биелэлт')}</th>
                  <th colSpan={data.blocks.length} className={s.subBand}>
                    {tr('Ажил гүйцэтгэл — обьём ({0} барилга)', String(data.blocks.length))}
                  </th>
                </tr>
                <tr>
                  {data.blocks.map((b) => <th key={b} className={s.subBlk}>{b}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.filled.map((x, i) => (
                  <tr key={i}>
                    <td>{x.no}</td>
                    <td className={s.subWork} title={x.work}>{x.work}</td>
                    <td className={s.subNum}>{qty(x.vol)}</td>
                    <td className={`${s.subNum} ${s.subHi}`}>{qty(x.sum)}</td>
                    <td className={s.subNum}>{qty(x.unit)}</td>
                    <td className={s.subNum}>{qty(x.money)}</td>
                    <td className={s.subNum}>{pc(x.plan)}</td>
                    <td className={s.subNum}>{pc(x.act)}</td>
                    <td className={s.subNum}>{pc(x.ratio)}</td>
                    {x.cells.map((v, k) => (
                      <td
                        key={k}
                        /* ⚠️ Өөрчлөгдсөн нүд УЛААН ХҮРЭЭТЭЙ — хянагч юу шинэчлэгдснийг
                           нэг харцаар олох ёстой. Хүрээг `box-shadow: inset`-ээр өгнө:
                           `border-collapse: collapse` дээр энгийн `border` нь хөршийн
                           шугамтай уралдаж, хэсэг талдаа алга болдог. */
                        className={`${s.subNum} ${x.changed[k] ? s.subCh : ''}`}
                      >
                        {qty(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.filledCount > data.filled.length && (
            <div className={s.subMuted}>
              {tr('… мөн {0} ажил', String(data.filledCount - data.filled.length))}
            </div>
          )}
        </>
      )}
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
      stage: stage === 'engineer' ? 'engineer' : 'manager',
      decision,
      reason,
      who: stage === 'engineer' ? WHO.engineer : WHO.manager,
    }));

  const reviewing =
    (stage === 'engineer' && st === STATUS.engineerReview) ||
    (stage === 'manager' && st === STATUS.managerReview);

  return (
    <div className={s.item}>
      <button className={s.itemHead} onClick={() => setOpen((v) => !v)}>
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
        <span className={s.who}>
          <div className={s.ajil}>{work.ajil}</div>
          <div className={s.meta}>{work.bagts} · {work.company}</div>
        </span>
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
                    <button className={`${s.btn} ${s.ok}`} disabled={busy}
                      onClick={() => review(DECISION.approve)}>
                      {stage === 'engineer' ? tr('Зөвшөөрч менежерт илгээх') : tr('Зөвшөөрч шилжүүлэх')}
                    </button>
                    <button className={`${s.btn} ${s.bad}`} disabled={busy}
                      onClick={() => review(DECISION.return)}>
                      {tr('Буцаах')}
                    </button>
                  </div>
                </>
              )}

              {/* ── Инженер: менежер буцаасныг ДАХИН ШАЛГАНА ── */}
              {stage === 'engineer' && st === STATUS.managerReturned && (
                <>
                  <div className={s.reasonBox}>
                    <span className={s.reasonLabel}>{tr('Менежер буцаасан')}: </span>
                    <span className={s.reasonText}>{cur[F.managerReason]}</span>
                  </div>
                  <textarea
                    className={s.field}
                    rows={2}
                    placeholder={tr('Компанид буцаах бол шалтгаанаа бичнэ үү (менежерийн бичвэр компанид харагдахгүй)')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className={s.row}>
                    <button className={`${s.btn} ${s.ok}`} disabled={busy}
                      onClick={() => run(() => recheck(cur.__oid, 'ok', '', WHO.engineer))}>
                      {tr('Дахин шалгасан — асуудалгүй, менежерт илгээх')}
                    </button>
                    <button className={`${s.btn} ${s.bad}`} disabled={busy}
                      onClick={() => run(() => recheck(cur.__oid, 'back', reason, WHO.engineer))}>
                      {tr('Асуудал байна — компанид буцаах')}
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

          <Submitted bagts={work.bagts} sheetOid={cur[F.sheetOid]} sentAt={cur[F.companySent]} />
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
      { value: 'w', label: tr('Хянагдаж байна'), match: [STATUS.engineerReview, STATUS.managerReview, STATUS.managerReturned] },
      { value: 'b', label: tr('Буцаасан'), match: [STATUS.engineerReturned] },
      { value: 'd', label: tr('Хүлээн авсан'), match: [STATUS.transferred] },
    ]
    : Object.values(STATUS).map((x) => ({ value: x, label: STATUS_LABEL[x], match: [x] }));

export function Guitsetgel({ onView }: { onView?: (key: 'sheet') => void }) {
  const [stage, setStage] = useState<Stage>('engineer');
  const [q, setQ] = useState('');
  const [bagts, setBagts] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const { rows, loading, error, reload } = useHyanaltRows();
  const works = useMemo(() => groupWorks(rows), [rows]);

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
          <div className={s.sub}>{tr('компани → талбайн инженер → менежер')}</div>
        </div>
        <span className={s.spacer} />
        <div className={s.roles}>
          {STAGES.map((x) => (
            <button key={x} className={`${s.role} ${stage === x ? s.roleOn : ''}`}
              onClick={() => { setStage(x); setStatus(ALL); }}>
              {STAGE_LABEL[x]}
              {countFor(x) > 0 && <span className={s.count}>{countFor(x)}</span>}
            </button>
          ))}
        </div>
      </header>

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
    </div>
  );
}

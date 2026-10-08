'use client';

/**
 * NCR — ҮЛ ТОХИРЛЫН МАЯГТ (Багц 4.1-ийн 4 PDF + docx + бүртгэлийн xlsx, тулгалт 2026-09-28).
 *
 *   · Толгой: сэдэв · гэрээ (дугаар · нэр) · ерөнхий/туслан гүйцэтгэгч · хэнд/хэнээс ·
 *     байршил · барилга · ирүүлсэн · хариу ирүүлэх огноо · холбогдох MIR/FIC · үл тохирлын төрөл
 *   · 1. Тодорхойлолт + хавсралт чекбокс 5 + «Зураг, тайлбар» хүснэгт
 *   · 2. Ангилал: Severity (3) + Type (10, олон)
 *   · 3. Залруулгын санал (6, олон) + тайлбар
 *   · 4. Анхны дүгнэлт — НЭЭХ өдөр (Rejected анхдагч / Accepted / Concession) + ТМ
 *   · 5. Гүйцэтгэгчийн «Үл тохирол залруулсан тайлан» — ТУСДАА ЭЗЭНТЭЙ
 *     (`correctionEdit` → `submitCorrection`), нээгчийн засварт ОРОХГҮЙ
 *   · 6. Хаалт — захиалагч баталгаажуулмагц автоматаар (`closure`); гүйцэтгэгчийн
 *     «Хаасан» блок (`closeEdit` → `closeNcrDoc`): баримтын төрөл · арга хэмжээ ·
 *     биелэлт · хаасан ажилтан 2 · архив 3
 *
 * ⚠️ Нээгч нь ЗАХИАЛАГЧ (tuh/chanar/tug хянагч), гүйцэтгэгч зөвхөн 5 ба 6-р
 *    хэсгийг бөглөнө — `canAct.correction` · `canAct.closeNcr`.
 */

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  MS_STATUS, NCR_CLOSURE_DOC_TYPES, NCR_CLOSURE_RESULTS, NCR_PROPOSED, NCR_SEVERITY, NCR_TYPES,
  ncrClosureDocTypeLabel, ncrClosureResultLabel, ncrClosureStatusLabel, ncrProposedLabel, ncrSeverityLabel, ncrTypeLabel, verdictLabel,
  type MsDoc, type MsStatus, type NcrBody, type NcrCloser, type NcrClosure, type NcrClosureDocType, type NcrClosureResult,
  type NcrCorrection, type NcrProposed, type NcrSeverity, type NcrType, type VerdictCode,
} from '@/lib/chanarMs';
import { keepLinesText, linesToList, listToLines, toDateInput, fromDateInput, ymd } from './chanarUi';
import { Sec, Txt, Chk, DateInp, Inp, Radio, Multi, Sel, RowBtn, type Mode } from './fields';
import { DateField } from '@/modules/huvaari/DateField';
import s from '../chanar.module.css';

/** Гүйцэтгэгчийн хаалтын ноорог — `Chanar.tsx` төлөвт барина, `closeNcrDoc`-д өгнө */
export type NcrCloseDraft = {
  docType: NcrClosureDocType | null; action: NcrProposed | null; result: NcrClosureResult | null;
  closedByContractor: NcrCloser[]; archive: NcrClosure['archive'];
};
export const emptyNcrClose = (): NcrCloseDraft => ({
  docType: null, action: null, result: null,
  closedByContractor: [{ name: '', position: '', date: null }, { name: '', position: '', date: null }],
  archive: { original: false, server: false, backup: false },
});
/** Байгаа хаалтаас ноорог (2 мөр заавал) */
export const ncrCloseFrom = (c: NcrClosure | null): NcrCloseDraft => {
  const e = emptyNcrClose();
  if (!c) return e;
  const rows = [...c.closedByContractor, ...e.closedByContractor].slice(0, 2);
  return { docType: c.docType, action: c.action, result: c.result, closedByContractor: rows, archive: { ...c.archive } };
};

/** Үл тохирлын төрлийн санал (чөлөөт текст, `meta.category`) */
const NCR_CATEGORY_HINTS = () => [tr('Бетон'), tr('Арматур'), tr('Хэв хашмал'), tr('Өрлөг'), tr('Цахилгаан'), tr('Сантехник'), tr('Гагнуур'), tr('Ус тусгаарлалт')];

const CODES: readonly VerdictCode[] = ['R', 'A', 'AN'];

/**
 * «ХИЙСЭН АЛХМУУД» — мөр бүр нэг алхам (2026-09-30).
 * ⚠️ ТҮҮХИЙ текстийг ОРОН НУТАГТ барина (`chanarUi.keepLinesText`-ийн ⚠️): урьд нь
 *    товчлуур бүрд `linesToList` зай ба хоосон мөрийг хасаж буцааж зурдаг тул үг
 *    хооронд зай, Enter-ээр шинэ мөр бичих боломжгүй байв. Гадаад утга нь хэвээр
 *    цэвэрлэсэн жагсаалт (`fields.ListInp`-ийн загвар).
 */
function StepsArea({ label, value, disabled, onChange }: {
  label: string; value: readonly string[]; disabled: boolean; onChange: (v: string[]) => void;
}) {
  const joined = listToLines(value);
  const [txt, setTxt] = useState(joined);
  /* Гадна утга өөрчлөгдсөн (өөр баримт) — зурах явцад тааруулна (effect биш) */
  const [prevJoined, setPrevJoined] = useState(joined);
  if (prevJoined !== joined) {
    setPrevJoined(joined);
    const next = keepLinesText(txt, joined);
    if (next !== txt) setTxt(next);
  }
  return (
    <textarea className={s.textarea} aria-label={label} value={txt} disabled={disabled}
      onChange={(e) => { setTxt(e.target.value); onChange(linesToList(e.target.value)); }} />
  );
}

export function NcrForm({
  m, body, onChange, correctionEdit, correction, onCorrection, inspDocs, busy, status, closeEdit, closeDraft, onCloseDraft,
}: {
  m: Mode; body: NcrBody; onChange: (b: NcrBody) => void;
  /** Гүйцэтгэгч залруулгын тайлан бичиж байна */
  correctionEdit?: boolean;
  correction?: NcrCorrection;
  onCorrection?: (c: NcrCorrection) => void;
  /** Тухайн багцын батлагдсан MIR/FIC — `mirRef` сонголт */
  inspDocs?: readonly MsDoc[];
  busy: boolean;
  /** Баримтын төлөв — хаалтын статус шошго (`ncrClosureStatusLabel`) */
  status?: MsStatus;
  /** Гүйцэтгэгч «Хаасан» блок бөглөж байна (`canAct.closeNcr`) */
  closeEdit?: boolean;
  closeDraft?: NcrCloseDraft;
  onCloseDraft?: (c: NcrCloseDraft) => void;
}) {
  const att = body.attachments;
  const cm: Mode = { edit: !!correctionEdit, busy };
  const corr = correctionEdit && correction ? correction : body.correction;
  const setCorr = (p: Partial<NcrCorrection>) => onCorrection?.({ ...corr, ...p });
  const setPhoto = (i: number, p: Partial<NcrBody['photos'][number]>) =>
    onChange({ ...body, photos: body.photos.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const setMeta = (p: Partial<NcrBody['meta']>) => onChange({ ...body, meta: { ...body.meta, ...p } });

  const km: Mode = { edit: !!closeEdit, busy };
  const cd = closeEdit && closeDraft ? closeDraft : ncrCloseFrom(body.closure);
  const setCd = (p: Partial<NcrCloseDraft>) => onCloseDraft?.({ ...cd, ...p });
  const setCloser = (i: number, p: Partial<NcrCloser>) =>
    setCd({ closedByContractor: cd.closedByContractor.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const closerLabel = (i: number) => (i === 0 ? tr('Гүйцэтгэгчийн БУ менежер') : tr('Гүйцэтгэгчийн чанарын инженер'));

  return (
    <>
      <dl className={s.meta}>
        <Inp m={m} label={tr('Сэдэв')} value={body.subject} onChange={(v) => onChange({ ...body, subject: v })} />
        <Inp m={m} label={tr('Гэрээний дугаар')} value={body.contractNo} onChange={(v) => onChange({ ...body, contractNo: v })} />
        <Inp m={m} label={tr('Гэрээний нэр')} value={body.contractName} onChange={(v) => onChange({ ...body, contractName: v })} />
        <Inp m={m} label={tr('Ерөнхий гүйцэтгэгч')} value={body.generalContractor} onChange={(v) => onChange({ ...body, generalContractor: v })} />
        <Inp m={m} label={tr('Туслан гүйцэтгэгч')} value={body.subcontractor} onChange={(v) => onChange({ ...body, subcontractor: v })} />
        <Inp m={m} label={tr('Хэнд')} value={body.toWhom} onChange={(v) => onChange({ ...body, toWhom: v })} />
        <Inp m={m} label={tr('Хэнээс')} value={body.fromWhom} onChange={(v) => onChange({ ...body, fromWhom: v })} />
        <Inp m={m} label={tr('Байршил')} value={body.location} onChange={(v) => onChange({ ...body, location: v })} />
        <Inp m={m} label={tr('Барилгын дугаар')} value={body.building} onChange={(v) => onChange({ ...body, building: v })} />
        <DateInp m={m} label={tr('Ирүүлсэн огноо')} value={body.issuedAt} onChange={(v) => onChange({ ...body, issuedAt: v })} />
        <DateInp m={m} label={tr('Хариу ирүүлэх огноо')} value={body.dueAt} onChange={(v) => onChange({ ...body, dueAt: v })} />
        <Inp m={m} label={tr('Холбогдох үзлэг (MIR/FIC)')} value={body.mirRef} list="chanar-insp-refs"
          onChange={(v) => onChange({ ...body, mirRef: v })} hint={tr('батлагдсан MIR/FIC-ээс сонгох эсвэл бичих')} />
        <Inp m={m} label={tr('Үл тохирлын төрөл')} value={body.meta.category} list="chanar-ncr-cat" onChange={(v) => setMeta({ category: v })}
          hint={tr('Бетон · Арматур · Хэв хашмал …')} />
        {status && (
          <div>
            <dt>{tr('Биелэлтийн статус')}</dt>
            <dd>
              <span className={`${s.tag} ${status === MS_STATUS.approved ? s.tagApproved : status === MS_STATUS.returned ? s.tagReturned : s.tagReview}`}>
                {ncrClosureStatusLabel(status, body.reopened)}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {inspDocs && inspDocs.length > 0 && (
        <datalist id="chanar-insp-refs">
          {inspDocs.map((d) => <option key={d.oid} value={d.docNo}>{d.title}</option>)}
        </datalist>
      )}
      <datalist id="chanar-ncr-cat">
        {NCR_CATEGORY_HINTS().map((c) => <option key={c} value={c} />)}
      </datalist>

      <Sec title={tr('1. Тодорхойлолт')}>
        <Txt m={m} label={tr('Тодорхойлолт')} value={body.description} onChange={(v) => onChange({ ...body, description: v })}
          hint={tr('Юу, хаана, ямар шаардлагаас зөрсөн')} />
        <div className={s.chkRow}>
          <Chk m={m} label={tr('Зураг')} value={att.photo} onChange={(v) => onChange({ ...body, attachments: { ...att, photo: v } })} />
          <Chk m={m} label={tr('Зураглал')} value={att.markup} onChange={(v) => onChange({ ...body, attachments: { ...att, markup: v } })} />
          <Chk m={m} label={tr('MIR/WIR хуулбар')} value={att.mirCopy} onChange={(v) => onChange({ ...body, attachments: { ...att, mirCopy: v } })} />
          <Chk m={m} label={tr('Шалгалтын хуудас')} value={att.checklist} onChange={(v) => onChange({ ...body, attachments: { ...att, checklist: v } })} />
          <Chk m={m} label={tr('Туршилтын дүн')} value={att.testResult} onChange={(v) => onChange({ ...body, attachments: { ...att, testResult: v } })} />
        </div>
        <div className={s.secSub}>{tr('Зураг, тайлбар')}</div>
        <div className={s.tblWrap}>
          <table className={s.tbl}>
            <thead><tr><th>{tr('Зургийн №')}</th><th>{tr('Байршил')}</th><th>{tr('Тайлбар')}</th>{m.edit && <th />}</tr></thead>
            <tbody>
              {body.photos.length === 0 && <tr><td colSpan={4} className={s.secEmpty}>—</td></tr>}
              {body.photos.map((p, i) => (
                <tr key={i}>
                  {(['no', 'location', 'note'] as const).map((k) => (
                    <td key={k}>
                      {m.edit ? (
                        <input className={`${s.input} ${s.cellInp}`} aria-label={`${tr('Зураг')} ${i + 1} ${k}`} value={p[k]}
                          onChange={(e) => setPhoto(i, { [k]: e.target.value })} disabled={m.busy} />
                      ) : (p[k] || '—')}
                    </td>
                  ))}
                  {m.edit && <td><RowBtn m={m} label={tr('Мөр хасах')} onClick={() => onChange({ ...body, photos: body.photos.filter((_, k) => k !== i) })} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RowBtn m={m} label={tr('+ Зураг нэмэх')} onClick={() => onChange({ ...body, photos: [...body.photos, { no: String(body.photos.length + 1), location: '', note: '' }] })} />
      </Sec>

      <Sec title={tr('2. Ангилал')}>
        <div className={s.secSub}>{tr('Ноцтой байдал')}</div>
        <Radio<NcrSeverity> m={m} name="ncr-severity" label={tr('Ноцтой байдал')} value={body.severity}
          onChange={(v) => onChange({ ...body, severity: v })}
          options={NCR_SEVERITY.map((v) => ({ v, l: ncrSeverityLabel(v) }))} />
        <div className={s.secSub}>{tr('Төрөл')}</div>
        <Multi<NcrType> m={m} label={tr('Төрөл')} value={body.types} onChange={(v) => onChange({ ...body, types: v })}
          options={NCR_TYPES.map((v) => ({ v, l: ncrTypeLabel(v) }))} />
      </Sec>

      <Sec title={tr('3. Залруулгын санал')}>
        <Multi<NcrProposed> m={m} label={tr('Залруулгын санал')} value={body.proposed} onChange={(v) => onChange({ ...body, proposed: v })}
          options={NCR_PROPOSED.map((v) => ({ v, l: ncrProposedLabel(v) }))} />
        <Txt m={m} label={tr('Саналын тайлбар')} value={body.proposedText} onChange={(v) => onChange({ ...body, proposedText: v })} />
      </Sec>

      <Sec title={tr('4. Анхны дүгнэлт (нээх өдөр)')}>
        <Radio<VerdictCode> m={m} name="ncr-initial" label={tr('Анхны дүгнэлт')} value={body.initialVerdict}
          onChange={(v) => onChange({ ...body, initialVerdict: v })}
          options={CODES.map((c) => ({ v: c, l: verdictLabel(c, 'NCR') }))} />
        <dl className={s.meta}>
          <Inp m={m} label={tr('Дүгнэсэн (төслийн менежер)')} value={body.initialReviewedBy} onChange={(v) => onChange({ ...body, initialReviewedBy: v })} />
        </dl>
      </Sec>

      <Sec title={tr('5. Залруулгын тайлан (гүйцэтгэгч)')}>
        {!correctionEdit && !body.correctionAt && (
          <p className={`${s.secText} ${s.secEmpty}`}>{tr('гүйцэтгэгч залруулгын тайлан ирүүлээгүй')}</p>
        )}
        {(correctionEdit || body.correctionAt) && (
          <>
            <Txt m={cm} label={tr('Залруулгын тайлбар')} value={corr.text} onChange={(v) => setCorr({ text: v })}
              hint={tr('Юуг, хэрхэн зассан')} />
            <div className={s.secSub}>{tr('Хийсэн алхмууд (мөр бүр нэг алхам)')}</div>
            {cm.edit ? (
              <StepsArea label={tr('Хийсэн алхмууд (мөр бүр нэг алхам)')} value={corr.steps} disabled={busy}
                onChange={(steps) => setCorr({ steps })} />
            ) : (
              corr.steps.length ? <ol className={s.steps}>{corr.steps.map((x, i) => <li key={i}>{x}</li>)}</ol> : <p className={`${s.secText} ${s.secEmpty}`}>—</p>
            )}
            <dl className={s.meta}>
              <DateInp m={cm} label={tr('Засварлаж дууссан огноо')} value={corr.completedAt} onChange={(v) => setCorr({ completedAt: v })} />
              {body.correctionAt && <div><dt>{tr('Тайлан илгээсэн')}</dt><dd>{ymd(body.correctionAt)}</dd></div>}
            </dl>
          </>
        )}
      </Sec>

      {(body.closure || closeEdit) && (
        <Sec title={tr('6. Хаалт')}>
          {body.closure && (
            <dl className={s.meta}>
              <div><dt>{tr('Засварлаж дууссан')}</dt><dd>{ymd(body.closure.completedAt)}</dd></div>
              <div><dt>{tr('Баталгаажуулсан (захиалагч)')}</dt><dd>{body.closure.verifiedBy} · {ymd(body.closure.verifiedAt)}</dd></div>
              {body.reopened > 0 && <div><dt>{tr('Дахин нээсэн')}</dt><dd>{body.reopened}</dd></div>}
            </dl>
          )}
          <dl className={s.meta}>
            <Sel m={km} label={tr('Хаасан баримтын төрөл')} value={cd.docType ?? ''}
              onChange={(v) => setCd({ docType: (NCR_CLOSURE_DOC_TYPES as readonly string[]).includes(v) ? (v as NcrClosureDocType) : null })}
              options={NCR_CLOSURE_DOC_TYPES.map((t) => ({ v: t, l: ncrClosureDocTypeLabel(t) }))} />
            <Sel m={km} label={tr('Авсан арга хэмжээ')} value={cd.action ?? ''}
              onChange={(v) => setCd({ action: (NCR_PROPOSED as readonly string[]).includes(v) ? (v as NcrProposed) : null })}
              options={NCR_PROPOSED.map((p) => ({ v: p, l: ncrProposedLabel(p) }))} />
            <Sel m={km} label={tr('Биелэлтийн үр дүн')} value={cd.result ?? ''}
              onChange={(v) => setCd({ result: (NCR_CLOSURE_RESULTS as readonly string[]).includes(v) ? (v as NcrClosureResult) : null })}
              options={NCR_CLOSURE_RESULTS.map((r) => ({ v: r, l: ncrClosureResultLabel(r) }))} />
          </dl>
          <div className={s.secSub}>{tr('Хаасан (гүйцэтгэгч)')}</div>
          <div className={s.tblWrap}>
            <table className={s.tbl}>
              <thead><tr><th>{tr('Үүрэг')}</th><th>{tr('Нэр')}</th><th>{tr('Албан тушаал')}</th><th>{tr('Огноо')}</th></tr></thead>
              <tbody>
                {cd.closedByContractor.map((c, i) => (
                  <tr key={i}>
                    <td>{closerLabel(i)}</td>
                    {(['name', 'position'] as const).map((k) => (
                      <td key={k}>
                        {km.edit ? (
                          <input className={`${s.input} ${s.cellInp}`} aria-label={`${closerLabel(i)} — ${k}`} value={c[k]}
                            onChange={(e) => setCloser(i, { [k]: e.target.value })} disabled={busy} />
                        ) : (c[k] || '—')}
                      </td>
                    ))}
                    <td>
                      {km.edit ? (
                        /* ⚠️ 2026-10-09: натив `<input type="date">` → `DateField` (`fields.tsx` 2026-10-05-ны ⚠️); хадгалах хэлбэр ХЭВЭЭР (`fromDateInput`) */
                        <DateField label={`${closerLabel(i)} — ${tr('Огноо')}`} value={toDateInput(c.date)} disabled={busy}
                          onChange={(v) => setCloser(i, { date: fromDateInput(v) })} />
                      ) : ymd(c.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.secSub}>{tr('Архив')}</div>
          <div className={s.chkRow}>
            <Chk m={km} label={tr('Эх хувь')} value={cd.archive.original} onChange={(v) => setCd({ archive: { ...cd.archive, original: v } })} />
            <Chk m={km} label={tr('Сервер')} value={cd.archive.server} onChange={(v) => setCd({ archive: { ...cd.archive, server: v } })} />
            <Chk m={km} label={tr('Нөөц хуулбар')} value={cd.archive.backup} onChange={(v) => setCd({ archive: { ...cd.archive, backup: v } })} />
          </div>
        </Sec>
      )}
      {!body.closure && body.reopened > 0 && (
        <p className={s.note}>{tr('Дахин нээгдсэн ({0} удаа)', body.reopened)}</p>
      )}
    </>
  );
}

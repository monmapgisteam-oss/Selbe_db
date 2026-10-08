'use client';

/**
 * MIR · FIC — ҮЗЛЭГИЙН ХУУДАС (Багц 1-ийн MIR скан, Багц 6.2-ийн хос хэлт MIR,
 * FIC-ийн 3 docx загвар; тулгалт 2026-09-28).
 *
 *   · Толгой: барилгын дугаар (+ MIR: материалын нэр, батлагдсан MA-ийн дугаар)
 *   · Загвар (`body.template`) — мөрүүд, хавсралтын олонлог, «Гүйцэтгэл» хэсэг үүгээр
 *   · 1. Шалгах мөрүүд × {Гүйцэтгэгч OK/N/A/X, Захиалагч OK/N/A/X} + тайлбар
 *   · 2. Гүйцэтгэл — тоо хэмжээ (загварт `hasQuantity` бол)
 *   · 3. Нэмэлт тайлбар, залруулах арга хэмжээ + загварын хавсралт чекбокс
 *   · Дүн — талбар биш, `inspResult` бодно (ТУХ A/AN эсвэл батлагдсан → Тэнцсэн)
 *
 * ⚠️ ХОЁР БАГАНА ХОЁР ЭЗЭНТЭЙ: `contractor` баганыг ЗОХИОГЧ (гүйцэтгэгчийн
 *    QC) засах горимд, `client` баганыг ТУХ хянагч `review` төлөвт
 *    (`clientEdit` prop → `saveClientChecks`). Нэг товчлуур null→OK→N/A→X мөчлөг.
 * ⚠️ 2026-09-28: `header.location` ЗУРАГДАХГҮЙ — маягтад «Байршил» талбар үгүй
 *    (хуучин JSON-д үлдсэн утга хадгалалтад хэвээр дамжина).
 */

import type { ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  INSP_ATTACH_KEYS, inspAttachLabel, inspResult,
  type InspBody, type InspCheck, type InspItem, type InspKind, type Meta, type MsDoc, type Verdict, type VerdictCode,
} from '@/lib/chanarMs';
import { inspCommentColLabel, inspItemColLabel, inspTemplateOf, inspTemplates } from '@/lib/chanarTemplates';
import { checkLabel, nextCheck } from './chanarUi';
import { Sec, Txt, Chk, DateInp, Inp, RowBtn, type Mode } from './fields';
import s from '../chanar.module.css';

/** Гүйцэтгэгч/захиалагчийн тэмдэг — товчлуур (засагдахад) эсвэл текст */
function CheckBtn({ v, on, onClick, label }: { v: InspCheck | null; on: boolean; onClick: () => void; label: string }) {
  const cls = v === 'OK' ? s.ckOk : v === 'X' ? s.ckX : v === 'NA' ? s.ckNa : '';
  if (!on) return <span className={`${s.ck} ${cls}`}>{checkLabel(v)}</span>;
  return (
    <button type="button" className={`${s.ck} ${s.ckBtn} ${cls}`} onClick={onClick} aria-label={label} title={tr('Дарах бүрд: OK → N/A → X → хоосон')}>
      {checkLabel(v)}
    </button>
  );
}

export function InspForm({
  m, kind, body, onChange, clientEdit, client, onClient, maDocs, onTemplate, tuhVerdict, approved,
}: {
  m: Mode; kind: InspKind; body: InspBody; onChange: (b: InspBody) => void;
  /** ТУХ хянагч захиалагчийн баганыг бөглөж байна */
  clientEdit?: boolean;
  client?: (InspCheck | null)[];
  onClient?: (v: (InspCheck | null)[]) => void;
  /** MIR: тухайн багцын батлагдсан MA баримтууд — `maRef` сонголт */
  maDocs?: readonly MsDoc[];
  /** Загвар сонгоход нэрийг нь дуудагчид (анхдагч `title`) */
  onTemplate?: (title: string) => void;
  /** Дүнд: ТУХ-ийн шийдвэр · баримт батлагдсан эсэх (`inspResult`) */
  tuhVerdict?: Verdict | VerdictCode | null;
  approved?: boolean;
}) {
  const meta = body.meta;
  const setMeta = (p: Partial<Meta>) => onChange({ ...body, meta: { ...meta, ...p } });
  const setItem = (i: number, p: Partial<InspItem>) =>
    onChange({ ...body, items: body.items.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const tpls = inspTemplates(kind);
  /* ⚠️ 2026-09-25: загвар СОНГООГҮЙ (`template=''`) бол `inspTemplateOf`-ийн эхний
     загварын хавсралт/тоо хэмжээг ЗУРАХГҮЙ — засахад хоосон, харахад зөвхөн
     бөглөгдсөн утга (хуучин мөр). */
  const tpl = body.template ? inspTemplateOf(kind, body.template) : null;
  const applyTpl = (key: string) => {
    /* ⚠️ 2026-10-09: «— загвар сонгох —» руу буцаахад урьд нь юу ч болдоггүй байв (загвар цэвэрлэгдэхгүй).
       Мөрүүд/хавсралт ХЭВЭЭР — зөвхөн загварын холбоос арилна (бөглөсөн зүйл устахгүй тул асуухгүй). */
    if (key === '') { onChange({ ...body, template: '' }); return; }
    const t = tpls.find((x) => x.key === key);
    if (!t) return;
    /* ⚠️ 2026-09-25: бөглөсөн мөр байвал асууна — загвар солих нь мөрүүдийг дарна */
    const filled = body.items.some((it) => it.text.trim() || it.contractor || it.comment.trim());
    if (filled && !window.confirm(tr('Загвар солиход бөглөсөн мөрүүд загварынхаар солигдоно. Үргэлжлүүлэх үү?'))) return;
    /* Загвар солиход мөрүүд + хавсралтын олонлог шинэчлэгдэнэ (загварт байхгүй хавсралт унтарна) */
    const attachments = Object.fromEntries(INSP_ATTACH_KEYS.map((k) => [k, t.attachments.includes(k) ? body.attachments[k] : false])) as InspBody['attachments'];
    onChange({ ...body, template: t.key, items: structuredClone(t.items), attachments });
    onTemplate?.(t.title);
  };
  const clientOf = (i: number): InspCheck | null => (clientEdit && client ? client[i] ?? null : body.items[i].client);
  const items = clientEdit && client ? body.items.map((it, i) => ({ ...it, client: client[i] ?? null })) : body.items;
  const res = inspResult(items, { tuhVerdict: tuhVerdict ?? null, approved: !!approved });
  const att = body.attachments;
  const attKeys = tpl ? tpl.attachments : (m.edit ? [] : INSP_ATTACH_KEYS.filter((k) => att[k]));
  const hasQuantity = tpl ? tpl.hasQuantity : (!m.edit && !!body.quantity.trim());

  return (
    <>
      {/* ⚠️ 2026-09-25: загвар НООРГИЙН засварт ч солигдоно (зөвхөн шинэд биш) — бөглөсөн мөртэй бол баталгаажуулна */}
      {m.edit && (
        <dl className={s.meta}>
          <div>
            <dt>{tr('Загвар')}</dt>
            <dd>
              <select className={`${s.select} ${s.inpFull}`} aria-label={tr('Загвар')} value={body.template} disabled={m.busy} onChange={(e) => applyTpl(e.target.value)}>
                <option value="">{tr('— загвар сонгох (мөрүүд бөглөгдөнө) —')}</option>
                {tpls.map((t) => <option key={t.key} value={t.key}>{t.title} · {t.items.length}</option>)}
              </select>
            </dd>
          </div>
        </dl>
      )}
      <dl className={s.meta}>
        {!m.edit && tpl && <div><dt>{tr('Загвар')}</dt><dd>{tpl.title}</dd></div>}
        <Inp m={m} label={tr('Барилгын дугаар')} value={body.header.building} onChange={(v) => onChange({ ...body, header: { ...body.header, building: v } })} />
        {kind === 'MIR' && (
          <Inp m={m} label={tr('Материалын нэр')} value={body.header.materialName} onChange={(v) => onChange({ ...body, header: { ...body.header, materialName: v } })} />
        )}
        {kind === 'MIR' && (
          <Inp m={m} label={tr('Материал баталгаажуулалтын дугаар (MA)')} value={body.maRef} list="chanar-ma-refs"
            onChange={(v) => onChange({ ...body, maRef: v })} hint={tr('батлагдсан MA-аас сонгох эсвэл бичих')} />
        )}
        <DateInp m={m} label={tr('Огноо')} value={meta.preparedAt} onChange={(v) => setMeta({ preparedAt: v })} />
        <Inp m={m} label={tr('Ангилал')} value={meta.category} onChange={(v) => setMeta({ category: v })} />
        <div>
          <dt>{tr('Дүн')}</dt>
          <dd>
            <span className={`${s.tag} ${res === 'pass' ? s.tagApproved : res === 'fail' ? s.tagReturned : s.tagDraft}`}>
              {res === 'pass' ? tr('Тэнцсэн') : res === 'fail' ? tr('Тэнцээгүй') : tr('Шалгаагүй')}
            </span>
          </dd>
        </div>
      </dl>
      {kind === 'MIR' && maDocs && maDocs.length > 0 && (
        <datalist id="chanar-ma-refs">
          {maDocs.map((d) => <option key={d.oid} value={d.docNo}>{d.title}</option>)}
        </datalist>
      )}

      <Sec title={kind === 'MIR' ? tr('1. Материалын үзлэг') : tr('1. Үзлэг шалгалт')}>
        <div className={s.tblWrap}>
          <table className={s.tbl}>
            <thead>
              <tr>
                <th>№</th><th>{inspItemColLabel(kind)}</th><th>{tr('Гүйцэтгэгч')}</th><th>{tr('Захиалагч')}</th><th>{inspCommentColLabel()}</th>{m.edit && <th />}
              </tr>
            </thead>
            <tbody>
              {body.items.length === 0 && <tr><td colSpan={6} className={s.secEmpty}>{tr('шалгах мөр алга — загвар сонгох эсвэл мөр нэмнэ')}</td></tr>}
              {body.items.map((it, i) => {
                const secRow = it.section && (i === 0 || body.items[i - 1].section !== it.section) ? it.section : null;
                return (
                  <FragRow key={i} secRow={secRow} colSpan={m.edit ? 6 : 5}>
                    <td>{it.no}</td>
                    <td>
                      {m.edit ? (
                        <input className={`${s.input} ${s.cellInp}`} aria-label={tr('{0}-р мөрийн текст', it.no)} value={it.text}
                          onChange={(e) => setItem(i, { text: e.target.value })} disabled={m.busy} />
                      ) : it.text}
                    </td>
                    <td>
                      <CheckBtn v={it.contractor} on={m.edit && !m.busy} label={tr('Гүйцэтгэгч, мөр {0}', it.no)}
                        onClick={() => setItem(i, { contractor: nextCheck(it.contractor) })} />
                    </td>
                    <td>
                      <CheckBtn v={clientOf(i)} on={!!clientEdit && !m.busy} label={tr('Захиалагч, мөр {0}', it.no)}
                        onClick={() => onClient?.(body.items.map((_, k) => (k === i ? nextCheck(clientOf(i)) : clientOf(k))))} />
                    </td>
                    <td>
                      {m.edit ? (
                        <input className={`${s.input} ${s.cellInp}`} aria-label={tr('{0}-р мөрийн тайлбар', it.no)} value={it.comment}
                          onChange={(e) => setItem(i, { comment: e.target.value })} disabled={m.busy} />
                      ) : (it.comment || '—')}
                    </td>
                    {m.edit && (
                      <td>
                        <RowBtn m={m} label={tr('Мөр хасах')} onClick={() => onChange({
                          ...body, items: body.items.filter((_, k) => k !== i).map((x, k) => ({ ...x, no: k + 1 })),
                        })} />
                      </td>
                    )}
                  </FragRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <RowBtn m={m} label={tr('+ Мөр нэмэх')} onClick={() => onChange({
          ...body,
          items: [...body.items, { no: body.items.length + 1, text: '', section: body.items[body.items.length - 1]?.section ?? null, contractor: null, client: null, comment: '' }],
        })} />
      </Sec>

      {hasQuantity && (
        <Sec title={tr('2. Гүйцэтгэл — тоо хэмжээ')}>
          <Txt m={m} label={tr('Тоо хэмжээ')} value={body.quantity} onChange={(v) => onChange({ ...body, quantity: v })} />
        </Sec>
      )}
      <Sec title={hasQuantity ? tr('3. Нэмэлт тайлбар, залруулах арга хэмжээ') : tr('2. Нэмэлт тайлбар, залруулах арга хэмжээ')}>
        <Txt m={m} label={tr('Нэмэлт тайлбар')} value={body.remarks} onChange={(v) => onChange({ ...body, remarks: v })} />
      </Sec>
      <Sec title={tr('Хавсралт')}>
        <div className={s.chkRow}>
          {attKeys.length === 0 && <span className={s.secEmpty}>{m.edit ? tr('загвар сонгоход хавсралтын жагсаалт гарна') : '—'}</span>}
          {attKeys.map((k) => (
            <Chk key={k} m={m} label={inspAttachLabel(k)} value={att[k]} onChange={(v) => onChange({ ...body, attachments: { ...att, [k]: v } })} />
          ))}
        </div>
      </Sec>
    </>
  );
}

/** Бүлгийн гарчигтай мөр — гарчиг өөрчлөгдөхөд дээр нь нэг мөр */
function FragRow({ secRow, colSpan, children }: { secRow: string | null; colSpan: number; children: ReactNode }) {
  return (
    <>
      {secRow && <tr className={s.tblSec}><td colSpan={colSpan}>{secRow}</td></tr>}
      <tr>{children}</tr>
    </>
  );
}

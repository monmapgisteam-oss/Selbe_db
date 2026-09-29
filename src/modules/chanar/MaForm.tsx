'use client';

/**
 * MA — МАТЕРИАЛ БАТАЛГААЖУУЛАЛТЫН МАЯГТ (ирүүлсэн маягт + «MA Submittal's
 * appendix», тулгалт 2026-09-28; 2-р үе шат — практикийн хүснэгтийн бүх багана).
 *
 *   · Мета: ангилал (6) · submittal төрөл · төслийн нэр · гэрээ · хуудас · чиглэл ·
 *     хариуцсан ажилтан (1–2) · туслан гүйцэтгэгч · блок · холбогдох дугаар
 *   · Материалын хүснэгт — нэг MA олон материал; ҮНДСЭН мөр (нэр · марк ·
 *     хэмжээ · нэгж · тоо · ангилал · шийдвэр) + ДЭЛГЭГДЭХ дэлгэрэнгүй (стандарт ·
 *     үйлдвэрлэгч · нийлүүлэгч · гарал · үе шат · байршил · зураг · заагдсан↔дүйцэх
 *     стандарт · шаардлага↔санал · хангаж буй эсэх · ирсэн огноо · гэрчилгээ · хуудас)
 *   · Appendix: 11 бүрдлийн чекбокс + анхааруулга + Cost/Time impact
 *   · Зураг төсөлтэй тохирох + зураг төслийн дугаар/өөрчлөлт/тайлбар
 *   · Агуулгын текст 7 + техник үзүүлэлт · зориулалт; хавсралтын жагсаалт;
 *     гүйцэтгэгчийн гарын үсэг 4 мөр (хэвлэхэд `printSigRoles`)
 *
 * ⚠️ ХЯНАГЧИЙН МАТЕРИАЛ БҮРИЙН ШИЙДВЭР (`perMaterial`) — практикт «1–3 AN,
 *    4–8 R» гэж бичдэг. `review` prop өгвөл материал бүрийн мөрөнд A/AN/R
 *    сонголт гарна (хоосон = нийт шийдвэр); харахад REP-ийн нэгтгэл.
 * ⚠️ 2026-09-28: `locked` материал (өмнөх хувилбарт A/AN) САARAL, шийдвэр нь
 *    тэмдгээр — дахин хянагдахгүй (`chanarMs.nextRevisionBody`). Сонголт ГАРАХГҮЙ.
 * ⚠️ ХҮСНЭГТИЙН ӨРГӨН: 20+ багана нэг мөрөнд багтахгүй (утас ч, хэвлэх ч) тул
 *    үндсэн 7 багана + мөр бүрийн «▸» дэлгэлт — хэвлэхэд бүх дэлгэрэнгүй нээлттэй.
 */

import { useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  DISCIPLINES, EMPTY_MATERIAL, MA_CHECKLIST, SUBMITTAL_TYPES,
  maCheckLabel, maChecklistWarning, submittalTypeLabel, verdictLabel,
  type MaAttachment, type MaBody, type MaMaterial, type Meta, type Sig, type VerdictCode,
} from '@/lib/chanarMs';
import { MA_CATEGORIES, maCategoryLabel } from '@/lib/chanarTemplates';
import { toDateInput, fromDateInput, ymd } from './chanarUi';
import { Sec, Txt, Chk, DateInp, Inp, Sel, Multi, NumInp, ListInp, RowBtn, type Mode } from './fields';
import s from '../chanar.module.css';

const TEXTS: { k: 'scope' | 'manufacturer' | 'intro' | 'standards' | 'sample' | 'storage' | 'transport' | 'techSpec' | 'purpose'; label: () => string }[] = [
  { k: 'purpose', label: () => tr('Зориулалт, ашиглах хүрээ') },
  { k: 'scope', label: () => tr('1. Цар хүрээ') },
  { k: 'manufacturer', label: () => tr('2. Үйлдвэрлэгч') },
  { k: 'intro', label: () => tr('3. Танилцуулга') },
  { k: 'standards', label: () => tr('4. Норм, стандарт') },
  { k: 'techSpec', label: () => tr('4.1 Техникийн үзүүлэлт (сонголт)') },
  { k: 'sample', label: () => tr('5. Загвар сорьц') },
  { k: 'storage', label: () => tr('6. Хадгалалт') },
  { k: 'transport', label: () => tr('6.1 Тээвэрлэлт') },
];

const CODES: readonly VerdictCode[] = ['A', 'AN', 'R'];

/** Материалын дэлгэрэнгүй талбарууд — текст (дараалал = маягтын багана) */
const DETAIL_TEXT: { k: keyof MaMaterial; label: () => string }[] = [
  { k: 'standard', label: () => tr('Стандарт') },
  { k: 'manufacturer', label: () => tr('Үйлдвэрлэгч') },
  { k: 'supplier', label: () => tr('Нийлүүлэгч') },
  { k: 'stage', label: () => tr('Үе шатны ажил') },
  { k: 'location', label: () => tr('Ашиглах байршил / блок') },
  { k: 'drawingNo', label: () => tr('Зураг төслийн дугаар') },
  { k: 'designStd', label: () => tr('Заагдсан стандарт') },
  { k: 'equivStd', label: () => tr('Дүйцэх стандарт') },
  { k: 'designReq', label: () => tr('Зураг төслийн / техникийн шаардлага') },
  { k: 'proposed', label: () => tr('Санал болгож буй') },
  { k: 'certNo', label: () => tr('Гэрчилгээний дугаар') },
  { k: 'pageRef', label: () => tr('Хавсралтын хуудас') },
  { k: 'note', label: () => tr('Тайлбар') },
];

const SIG_ROWS: { k: keyof MaBody['signatures']; label: () => string }[] = [
  { k: 'prepared', label: () => tr('Боловсруулсан') },
  { k: 'reviewed', label: () => tr('Хянасан') },
  { k: 'reviewed2', label: () => tr('Хянасан 2 (сонголт)') },
  { k: 'approved', label: () => tr('Баталсан') },
];

/** Материалын мөрийн локал ID-ийн тоолуур (модулийн түвшинд — render дотор ref уншихгүй) */
let UID = 0;
const newUid = (): string => `m${++UID}`;

const vbCls = (c: VerdictCode): string => (c === 'A' ? s.vbA : c === 'AN' ? s.vbAN : s.vbR);

export function MaForm({
  m, body, onChange, review, perMaterial, onPerMaterial, repPer, ownerOptions, refOptions,
}: {
  m: Mode; body: MaBody; onChange: (b: MaBody) => void;
  /** Хянагчийн горим — материал бүрийн шийдвэр сонгох боломж */
  review?: boolean;
  perMaterial?: Record<string, VerdictCode>;
  onPerMaterial?: (v: Record<string, VerdictCode>) => void;
  /** Хариуны (REP) нэгтгэсэн материал бүрийн шийдвэр — харах горимд */
  repPer?: Record<string, VerdictCode>;
  /** Хариуцсан ажилтны сонголт (тухайн багцын хянагчид) */
  ownerOptions?: readonly string[];
  /** Холбогдох дугаарын datalist — багцын батлагдсан MA/MS/QMP/PRC */
  refOptions?: readonly { no: string; title: string }[];
}) {
  const meta = body.meta;
  const setMeta = (p: Partial<Meta>) => onChange({ ...body, meta: { ...meta, ...p } });
  const setMat = (i: number, p: Partial<MaMaterial>) =>
    onChange({ ...body, materials: body.materials.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const setDrw = (i: number, p: Partial<MaBody['drawings'][number]>) =>
    onChange({ ...body, drawings: body.drawings.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const setSig = (k: keyof MaBody['signatures'], p: Partial<Sig>) =>
    onChange({ ...body, signatures: { ...body.signatures, [k]: { ...body.signatures[k], ...p } } });
  const setAtt = (i: number, p: Partial<MaAttachment>) =>
    onChange({ ...body, attachments: body.attachments.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const setOwner = (i: number, v: string) => {
    const next = [...meta.owners];
    if (v) next[i] = v; else next.splice(i, 1);
    const uniq = [...new Set(next.filter(Boolean))].slice(0, 2);
    setMeta({ owners: uniq, owner: uniq[0] ?? null });
  };

  /* Дэлгэгдсэн мөрүүд — харах/засах хоёуланд; хэвлэхэд CSS бүгдийг нээнэ.
     ⚠️ 2026-09-25: түлхүүр нь ИНДЕКС биш — мөр хасахад дараагийн мөр «дэлгэгдсэн»
     болж байв. `uids` нь материал бүрийн тогтвортой локал ID (биед хадгалагдахгүй);
     хасахад хамт хасна, гаднаас урт өөрчлөгдвөл сунгаж/тайрна. */
  const [uidState, setUids] = useState<string[]>(() => body.materials.map(newUid));
  let uids = uidState;
  if (uids.length !== body.materials.length) {
    /* Гаднаас урт өөрчлөгдсөн (structuredClone, хуучин мөр) — render дотор нэг удаа тааруулна */
    uids = uids.length > body.materials.length ? uids.slice(0, body.materials.length)
      : [...uids, ...body.materials.slice(uids.length).map(newUid)];
    setUids(uids);
  }
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (u: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  const removeMat = (i: number) => {
    setUids(uids.filter((_, k) => k !== i));
    onChange({ ...body, materials: body.materials.filter((_, k) => k !== i) });
  };

  const cell = (i: number, k: keyof MaMaterial, label: string) => {
    const mat = body.materials[i];
    const v = String(mat[k] ?? '');
    if (!m.edit || mat.locked) return <td>{v || '—'}</td>;
    return (
      <td>
        <input className={`${s.input} ${s.cellInp}`} aria-label={`${label} ${i + 1}`} value={v}
          onChange={(e) => setMat(i, { [k]: e.target.value })} disabled={m.busy} />
      </td>
    );
  };
  const showPer = review || (repPer && Object.keys(repPer).length > 0) || body.materials.some((x) => x.verdict || x.locked);
  const matVerdict = (i: number): VerdictCode | null => body.materials[i].verdict ?? repPer?.[String(i)] ?? null;
  const owners = [meta.owners[0] ?? '', meta.owners[1] ?? ''];
  const ownerOpts = (cur: string) => [...new Set([...(ownerOptions ?? []), ...(cur ? [cur] : [])])].sort().map((u) => ({ v: u, l: u }));
  const nCols = 8 + (showPer ? 1 : 0) + (m.edit ? 1 : 0);

  return (
    <>
      <dl className={s.meta}>
        <DateInp m={m} label={tr('Боловсруулсан огноо')} value={meta.preparedAt} onChange={(v) => setMeta({ preparedAt: v })} />
        <Sel m={m} label={tr('Материалын ангилал')} value={meta.category} onChange={(v) => setMeta({ category: v })}
          options={MA_CATEGORIES.map((c) => ({ v: c, l: maCategoryLabel(c) }))} />
        <Sel m={m} label={tr('Submittal төрөл')} value={body.submittalType ?? ''}
          onChange={(v) => onChange({ ...body, submittalType: (SUBMITTAL_TYPES as readonly string[]).includes(v) ? (v as MaBody['submittalType']) : null })}
          options={SUBMITTAL_TYPES.map((t) => ({ v: t, l: submittalTypeLabel(t) }))} />
        <Inp m={m} label={tr('Төслийн нэр')} value={meta.projectTitle} onChange={(v) => setMeta({ projectTitle: v })} />
        <Inp m={m} label={tr('Гэрээний дугаар')} value={meta.contractNo} onChange={(v) => setMeta({ contractNo: v })} />
        <NumInp m={m} label={tr('Хуудасны тоо')} value={meta.pageCount} onChange={(v) => setMeta({ pageCount: v })} />
        <Inp m={m} label={tr('Туслан гүйцэтгэгч')} value={body.subcontractor} onChange={(v) => onChange({ ...body, subcontractor: v })} />
        <ListInp m={m} label={tr('Блок (барилга)')} value={body.blocks} onChange={(v) => onChange({ ...body, blocks: v })} hint={tr('жишээ: A1, A2, B3')} />
        <ListInp m={m} label={tr('Холбогдох дугаар (MA · MS · QMP · PRC)')} value={body.refs} onChange={(v) => onChange({ ...body, refs: v })} list="chanar-ma-refs-dl" />
        {owners.map((o, i) => (
          <Sel key={i} m={m} label={i === 0 ? tr('Хариуцсан ажилтан') : tr('Хариуцсан ажилтан 2')} value={o}
            onChange={(v) => setOwner(i, v)} options={ownerOpts(o)} empty="—" />
        ))}
        <div>
          <dt>{tr('Мэргэжлийн чиглэл')}</dt>
          <dd>
            <Multi<string> m={m} label={tr('Мэргэжлийн чиглэл')} value={meta.discipline} onChange={(v) => setMeta({ discipline: v })}
              options={DISCIPLINES.map((d) => ({ v: d, l: d }))} />
          </dd>
        </div>
      </dl>
      {refOptions && refOptions.length > 0 && (
        <datalist id="chanar-ma-refs-dl">
          {refOptions.map((r) => <option key={r.no} value={r.no}>{r.title}</option>)}
        </datalist>
      )}
      {(m.edit || meta.note) && (
        <Sec title={tr('Тэмдэглэл')}>
          <Txt m={m} label={tr('Тэмдэглэл')} value={meta.note} onChange={(v) => setMeta({ note: v })} hint={tr('жишээ: имэйлээр батлагдсан')} />
        </Sec>
      )}

      <Sec title={tr('Материалын жагсаалт')}>
        <div className={s.tblWrap}>
          <table className={`${s.tbl} ${s.matTbl}`}>
            <thead>
              <tr>
                <th>№</th><th>{tr('Материалын нэр')}</th><th>{tr('Брэнд / марк')}</th><th>{tr('Хэмжээ')}</th>
                <th>{tr('Нэгж')}</th><th>{tr('Тоо')}</th><th>{tr('Ангилал')}</th>
                {showPer && <th>{tr('Шийдвэр')}</th>}
                <th><span className={s.srOnly}>{tr('Дэлгэрэнгүй')}</span></th>
                {m.edit && <th />}
              </tr>
            </thead>
            <tbody>
              {body.materials.length === 0 && (
                <tr><td colSpan={nCols} className={s.secEmpty}>{tr('материал нэмээгүй')}</td></tr>
              )}
              {body.materials.map((mat, i) => {
                const uid = uids[i];
                const isOpen = open.has(uid);
                const v = matVerdict(i);
                return (
                  <MatRows key={uid} open={isOpen} colSpan={nCols} locked={mat.locked}
                    details={(
                      <div className={s.matDetails}>
                        {DETAIL_TEXT.map((d) => (
                          <label key={d.k} className={s.matFld}>
                            <span className={s.matLbl}>{d.label()}</span>
                            {m.edit && !mat.locked ? (
                              <input className={`${s.input} ${s.inpFull}`} aria-label={`${d.label()} ${i + 1}`} value={String(mat[d.k] ?? '')}
                                onChange={(e) => setMat(i, { [d.k]: e.target.value })} disabled={m.busy} />
                            ) : <span>{String(mat[d.k] ?? '') || '—'}</span>}
                          </label>
                        ))}
                        <label className={s.matFld}>
                          <span className={s.matLbl}>{tr('Гарал')}</span>
                          {m.edit && !mat.locked ? (
                            <select className={s.select} aria-label={`${tr('Гарал')} ${i + 1}`} value={mat.origin ?? ''} disabled={m.busy}
                              onChange={(e) => setMat(i, { origin: e.target.value === 'domestic' || e.target.value === 'foreign' ? e.target.value : null })}>
                              <option value="">—</option>
                              <option value="domestic">{tr('Дотоодын')}</option>
                              <option value="foreign">{tr('Импортын')}</option>
                            </select>
                          ) : <span>{mat.origin === 'domestic' ? tr('Дотоодын') : mat.origin === 'foreign' ? tr('Импортын') : '—'}</span>}
                        </label>
                        <label className={s.matFld}>
                          <span className={s.matLbl}>{tr('Шаардлага хангаж буй эсэх')}</span>
                          {m.edit && !mat.locked ? (
                            <select className={s.select} aria-label={`${tr('Шаардлага хангаж буй эсэх')} ${i + 1}`} value={mat.meets === null ? '' : mat.meets ? '1' : '0'} disabled={m.busy}
                              onChange={(e) => setMat(i, { meets: e.target.value === '' ? null : e.target.value === '1' })}>
                              <option value="">—</option>
                              <option value="1">{tr('Тийм')}</option>
                              <option value="0">{tr('Үгүй')}</option>
                            </select>
                          ) : <span>{mat.meets === null ? '—' : mat.meets ? tr('Тийм') : tr('Үгүй')}</span>}
                        </label>
                        <label className={s.matFld}>
                          <span className={s.matLbl}>{tr('Талбайд ирсэн огноо')}</span>
                          {m.edit && !mat.locked ? (
                            <input type="date" className={s.input} aria-label={`${tr('Талбайд ирсэн огноо')} ${i + 1}`} value={toDateInput(mat.arrivedAt)} disabled={m.busy}
                              onChange={(e) => setMat(i, { arrivedAt: fromDateInput(e.target.value) })} />
                          ) : <span>{ymd(mat.arrivedAt)}</span>}
                        </label>
                      </div>
                    )}
                  >
                    <td>{i + 1}</td>
                    {cell(i, 'name', tr('Материалын нэр'))}
                    <td>
                      {m.edit && !mat.locked ? (
                        <span className={s.cellPair}>
                          <input className={`${s.input} ${s.cellInp}`} aria-label={`${tr('Брэнд')} ${i + 1}`} placeholder={tr('брэнд')} value={mat.brand}
                            onChange={(e) => setMat(i, { brand: e.target.value })} disabled={m.busy} />
                          <input className={`${s.input} ${s.cellInp}`} aria-label={`${tr('Марк')} ${i + 1}`} placeholder={tr('марк')} value={mat.model}
                            onChange={(e) => setMat(i, { model: e.target.value })} disabled={m.busy} />
                        </span>
                      ) : ([mat.brand, mat.model].filter(Boolean).join(' / ') || '—')}
                    </td>
                    {cell(i, 'size', tr('Хэмжээ'))}
                    {cell(i, 'unit', tr('Нэгж'))}
                    {cell(i, 'qty', tr('Тоо'))}
                    {cell(i, 'category', tr('Ангилал'))}
                    {showPer && (
                      <td>
                        {mat.locked ? (
                          <span title={tr('Өмнөх хувилбарт шийдвэрлэгдсэн — дахин хянагдахгүй')}>
                            {v && <span className={`${s.vb} ${vbCls(v)}`}>{v}</span>} <span className={s.attSize}>{tr('түгжигдсэн')}</span>
                          </span>
                        ) : review && onPerMaterial ? (
                          <select className={s.select} aria-label={tr('{0}-р материалын шийдвэр', i + 1)} value={perMaterial?.[String(i)] ?? ''} disabled={m.busy}
                            onChange={(e) => {
                              const next = { ...(perMaterial ?? {}) };
                              const x = e.target.value;
                              if (x === 'A' || x === 'AN' || x === 'R') next[String(i)] = x; else delete next[String(i)];
                              onPerMaterial(next);
                            }}>
                            <option value="">{tr('нийт')}</option>
                            {CODES.map((c) => <option key={c} value={c}>{verdictLabel(c, 'MA')}</option>)}
                          </select>
                        ) : (v ? <span className={`${s.vb} ${vbCls(v)}`}>{v}</span> : '—')}
                      </td>
                    )}
                    <td>
                      <button type="button" className={`${s.btn} ${s.btnSm}`} aria-expanded={isOpen} aria-label={tr('{0}-р материалын дэлгэрэнгүй', i + 1)}
                        onClick={() => toggle(uid)}>{isOpen ? '▾' : '▸'}</button>
                    </td>
                    {m.edit && (
                      <td>
                        {!mat.locked && (
                          <RowBtn m={m} label={tr('Мөр хасах')} onClick={() => removeMat(i)} />
                        )}
                      </td>
                    )}
                  </MatRows>
                );
              })}
            </tbody>
          </table>
        </div>
        <RowBtn m={m} label={tr('+ Материал нэмэх')} onClick={() => {
          const u = newUid();
          setUids([...uids, u]);
          onChange({ ...body, materials: [...body.materials, { ...EMPTY_MATERIAL }] });
          setOpen((prev) => new Set(prev).add(u));
        }} />
      </Sec>

      <Sec title={tr('Бүрдэл (appendix)')}>
        <div className={s.chkGrid}>
          {MA_CHECKLIST.map((k) => (
            <Chk key={k} m={m} label={maCheckLabel(k)} value={body.checklist[k]}
              onChange={(v) => onChange({ ...body, checklist: { ...body.checklist, [k]: v } })} />
          ))}
        </div>
        <p className={s.warnText}>{maChecklistWarning()}</p>
        <div className={s.chkRow}>
          <Chk m={m} label={tr('Өртөгт нөлөөлнө (Cost impact)')} value={body.costImpact} onChange={(v) => onChange({ ...body, costImpact: v })} />
          <Chk m={m} label={tr('Хугацаанд нөлөөлнө (Time impact)')} value={body.timeImpact} onChange={(v) => onChange({ ...body, timeImpact: v })} />
        </div>
      </Sec>

      <Sec title={tr('Хавсралтын жагсаалт')}>
        <div className={s.tblWrap}>
          <table className={s.tbl}>
            <thead><tr><th>№</th><th>{tr('Төрөл')}</th><th>{tr('Нэр')}</th><th>{tr('Хуудас')}</th>{m.edit && <th />}</tr></thead>
            <tbody>
              {body.attachments.length === 0 && <tr><td colSpan={5} className={s.secEmpty}>—</td></tr>}
              {body.attachments.map((a, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    {m.edit ? (
                      <select className={s.select} aria-label={`${tr('Хавсралтын төрөл')} ${i + 1}`} value={a.kind} disabled={m.busy}
                        onChange={(e) => setAtt(i, { kind: (MA_CHECKLIST as readonly string[]).includes(e.target.value) ? (e.target.value as MaAttachment['kind']) : 'other' })}>
                        {MA_CHECKLIST.map((k) => <option key={k} value={k}>{maCheckLabel(k)}</option>)}
                        <option value="other">{tr('Бусад')}</option>
                      </select>
                    ) : (a.kind === 'other' ? tr('Бусад') : maCheckLabel(a.kind))}
                  </td>
                  <td>
                    {m.edit ? (
                      <input className={`${s.input} ${s.cellInp}`} aria-label={`${tr('Хавсралтын нэр')} ${i + 1}`} value={a.title}
                        onChange={(e) => setAtt(i, { title: e.target.value })} disabled={m.busy} />
                    ) : (a.title || '—')}
                  </td>
                  <td>
                    {m.edit ? (
                      <input className={`${s.input} ${s.cellInp}`} aria-label={`${tr('Хуудас')} ${i + 1}`} value={a.pages}
                        onChange={(e) => setAtt(i, { pages: e.target.value })} disabled={m.busy} />
                    ) : (a.pages || '—')}
                  </td>
                  {m.edit && <td><RowBtn m={m} label={tr('Мөр хасах')} onClick={() => onChange({ ...body, attachments: body.attachments.filter((_, k) => k !== i) })} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RowBtn m={m} label={tr('+ Хавсралт нэмэх')} onClick={() => onChange({ ...body, attachments: [...body.attachments, { kind: 'other', title: '', pages: '' }] })} />
      </Sec>

      <Sec title={tr('Зураг төсөлтэй тохирох эсэх')}>
        <div className={s.chkRow} role="radiogroup" aria-label={tr('Зураг төсөлтэй тохирох эсэх')}>
          {([true, false] as const).map((v) => (
            <label key={String(v)} className={s.chk}>
              <input type="radio" name="drawingsMatch" checked={body.drawingsMatch === v} disabled={!m.edit || m.busy}
                onChange={() => onChange({ ...body, drawingsMatch: v })} />
              <span>{v ? tr('Тийм') : tr('Үгүй')}</span>
            </label>
          ))}
          {body.drawingsMatch === null && !m.edit && <span className={s.secEmpty}>{tr('тэмдэглээгүй')}</span>}
        </div>
        <div className={s.tblWrap}>
          <table className={s.tbl}>
            <thead><tr><th>{tr('Зураг төслийн дугаар')}</th><th>{tr('Өөрчлөлт')}</th><th>{tr('Тайлбар')}</th>{m.edit && <th />}</tr></thead>
            <tbody>
              {body.drawings.length === 0 && <tr><td colSpan={4} className={s.secEmpty}>—</td></tr>}
              {body.drawings.map((d, i) => (
                <tr key={i}>
                  {(['no', 'rev', 'note'] as const).map((k) => (
                    <td key={k}>
                      {m.edit ? (
                        <input className={`${s.input} ${s.cellInp}`} aria-label={`${tr('Зураг төсөл')} ${i + 1} ${k}`} value={d[k]}
                          onChange={(e) => setDrw(i, { [k]: e.target.value })} disabled={m.busy} />
                      ) : (d[k] || '—')}
                    </td>
                  ))}
                  {m.edit && <td><RowBtn m={m} label={tr('Мөр хасах')} onClick={() => onChange({ ...body, drawings: body.drawings.filter((_, k) => k !== i) })} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RowBtn m={m} label={tr('+ Зураг төсөл нэмэх')} onClick={() => onChange({ ...body, drawings: [...body.drawings, { no: '', rev: '', note: '' }] })} />
      </Sec>

      {TEXTS.map((t) => (
        <Sec key={t.k} title={t.label()}>
          <Txt m={m} label={t.label()} value={body[t.k]} onChange={(v) => onChange({ ...body, [t.k]: v })} />
        </Sec>
      ))}

      <Sec title={tr('Гүйцэтгэгчийн гарын үсэг')}>
        <div className={s.tblWrap}>
          <table className={s.tbl}>
            <thead><tr><th>{tr('Үүрэг')}</th><th>{tr('Нэр')}</th><th>{tr('Албан тушаал')}</th><th>{tr('Байгууллага')}</th><th>{tr('Огноо')}</th></tr></thead>
            <tbody>
              {SIG_ROWS.map((r) => {
                const sg = body.signatures[r.k];
                return (
                  <tr key={r.k}>
                    <td>{r.label()}</td>
                    {(['name', 'position', 'org'] as const).map((k) => (
                      <td key={k}>
                        {m.edit ? (
                          <input className={`${s.input} ${s.cellInp}`} aria-label={`${r.label()} — ${k}`} value={sg[k]}
                            onChange={(e) => setSig(r.k, { [k]: e.target.value })} disabled={m.busy} />
                        ) : (sg[k] || '—')}
                      </td>
                    ))}
                    <td>
                      {m.edit ? (
                        <input type="date" className={s.input} aria-label={`${r.label()} — ${tr('Огноо')}`} value={toDateInput(sg.date)} disabled={m.busy}
                          onChange={(e) => setSig(r.k, { date: fromDateInput(e.target.value) })} />
                      ) : ymd(sg.date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sec>
    </>
  );
}

/** Материалын үндсэн мөр + дэлгэгдэх дэлгэрэнгүй мөр (хэвлэхэд CSS-ээр үргэлж нээлттэй) */
function MatRows({ open, colSpan, locked, details, children }: {
  open: boolean; colSpan: number; locked: boolean; details: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <tr className={locked ? s.rowLocked : ''}>{children}</tr>
      <tr className={`${s.matDetailRow} ${open ? '' : s.matDetailHidden} ${locked ? s.rowLocked : ''}`}>
        <td colSpan={colSpan}>{details}</td>
      </tr>
    </>
  );
}

'use client';

/**
 * ЗУРГИЙН БҮРТГЭЛ (2026-11-11, хэрэглэгч: «ЗУРАГ ТӨСӨЛ-LOG»-ийн загвараар; зураг дээр дарахад PDF нээгдэнэ; PDF-ийг системээр
 * оруулна — Enterprise item болно) — «ТЭЗҮ · Ажлын зураг төсөл» хуудасны таб. Өгөгдөл: хүснэгт 234 (`lib/zuragBurtgel.ts`).
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { ZURAG_BURTGEL } from '@/lib/services';
import { entPdfBlob, entUploadPdf } from '@/lib/entDocs';
import { loadZuragBurtgel, groupZ, toZRow, type ZRow } from '@/lib/zuragBurtgel';
import { queryFeatures } from '@/lib/query';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { Data, userError } from '@/components/ui';
import s from './zuragTosol.module.css';

const CAP = { cap: 'zuragEdit' as const };
const ymd = (ms: number | null): string => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
const msOf = (v: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : null);

export function ZuragBurtgel({ canEdit }: { canEdit: boolean }) {
  const q = useAsync(loadZuragBurtgel, []);
  return (
    <Data q={q} loading={tr('Ачаалж байна…')} minH={240}>
      {(rows) => <Body rows={rows} canEdit={canEdit} />}
    </Data>
  );
}

type Edit = { magadlal: string; huleej: string; rev: string; asuudal: string };
type Add = { buleg: string; ded: string; bagts: string; ner: string; shifr: string };

function Body({ rows, canEdit }: { rows: ZRow[]; canEdit: boolean }) {
  const sess = useEntSession();
  const [find, setFind] = useState('');
  const [pkg, setPkg] = useState('');
  const [noPdf, setNoPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ oid: number; v: Edit } | null>(null);
  const [add, setAdd] = useState<Add | null>(null);
  const fileEl = useRef<HTMLInputElement>(null);
  const fileFor = useRef<ZRow | null>(null);

  const pkgs = useMemo(() => [...new Set(rows.map((r) => r.bagts).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'mn')), [rows]);
  const bulegs = useMemo(() => [...new Set(rows.map((r) => r.buleg).filter(Boolean))], [rows]);
  const shown = useMemo(() => {
    const qx = find.trim().toLowerCase();
    return rows.filter((r) => (!pkg || r.bagts === pkg) && (!noPdf || !r.pdfItem)
      && (!qx || `${r.ner} ${r.shifr} ${r.bagts} ${r.asuudal}`.toLowerCase().includes(qx)));
  }, [rows, find, pkg, noPdf]);
  const groups = useMemo(() => groupZ(shown), [shown]);
  const stat = useMemo(() => ({
    total: rows.length,
    magadlal: rows.filter((r) => r.dates.magadlal_ognoo != null || r.dates.davtan_magadlal_ognoo != null).length,
    received: rows.filter((r) => r.dates.huleej_avsan_ognoo != null).length,
    pdf: rows.filter((r) => r.pdfItem).length,
  }), [rows]);

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true); setErr(null); setMsg(null);
    try { const m = await f(); if (m) setMsg(m); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  const open = async (r: ZRow) => {
    const w = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await entPdfBlob(r.pdfItem));
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { w?.close(); setErr(userError(e)); }
  };

  const upload = (file: File) => {
    const r = fileFor.current;
    if (!r) return;
    void run(async () => {
      const title = [r.bagts, r.shifr, r.ner].filter(Boolean).join(' · ').slice(0, 250) || file.name;
      const { item } = await entUploadPdf(file, title, [ZURAG_BURTGEL.tag], ZURAG_BURTGEL.docFolder);
      await applyAll(ZURAG_BURTGEL.url, ZURAG_BURTGEL.oid, { updates: [{ [ZURAG_BURTGEL.oid]: r.oid, pdf_item_id: item.id, pdf_ner: file.name }] }, CAP);
      invalidate('ZURAG_BURTGEL');
      return tr('PDF оруулав: {0}', r.ner);
    });
  };

  const saveEdit = () => {
    if (!edit) return;
    const v = edit.v;
    void run(async () => {
      const r0 = rows.find((x) => x.oid === edit.oid);
      if (!r0) return null;
      /* Дэлгэцийн мөр хуучирсан байж болно — шинээр уншиж, энэ хооронд өөрчлөгдсөн бол зогсоно */
      const fresh = (await queryFeatures(ZURAG_BURTGEL.url, { where: `${ZURAG_BURTGEL.oid} = ${edit.oid}`, outFields: ['*'] })).map(toZRow)[0];
      const sig = (z: ZRow) => [ymd(z.dates.magadlal_ognoo), ymd(z.dates.huleej_avsan_ognoo), z.rev, z.asuudal].join('\u0001');
      if (!fresh || sig(fresh) !== sig(r0)) { invalidate('ZURAG_BURTGEL'); setEdit(null); throw new Error(tr('Энэ хооронд өөр хэрэглэгч өөрчилсөн байна. Шинэчилсэн мэдээллийг шалгаад дахин оролдоно уу.')); }
      const u: Record<string, unknown> = { [ZURAG_BURTGEL.oid]: edit.oid };
      if (v.magadlal !== ymd(r0.dates.magadlal_ognoo)) u.magadlal_ognoo = msOf(v.magadlal);
      if (v.huleej !== ymd(r0.dates.huleej_avsan_ognoo)) u.huleej_avsan_ognoo = msOf(v.huleej);
      if (v.rev.trim() !== r0.rev) u.rev = v.rev.trim() || null;
      if (v.asuudal.trim() !== r0.asuudal) u.asuudal = v.asuudal.trim() || null;
      if (Object.keys(u).length === 1) { setEdit(null); return null; }
      await applyAll(ZURAG_BURTGEL.url, ZURAG_BURTGEL.oid, { updates: [u] }, CAP);
      invalidate('ZURAG_BURTGEL');
      setEdit(null);
      return tr('Хадгалагдав');
    });
  };

  const saveAdd = () => {
    if (!add || !add.ner.trim() || !add.buleg) { setErr(tr('Бүлэг ба баримтын нэрийг бөглөнө үү.')); return; }
    void run(async () => {
      await applyAll(ZURAG_BURTGEL.url, ZURAG_BURTGEL.oid, { adds: [{
        buleg: add.buleg, ded_buleg: add.ded.trim() || null, bagts: add.bagts.trim() || null,
        ner: add.ner.trim(), shifr: add.shifr.trim() || null,
      }] }, CAP);
      invalidate('ZURAG_BURTGEL');
      setAdd(null);
      return tr('Зураг нэмэгдэв');
    });
  };

  const dateIn = (k: 'magadlal' | 'huleej', label: string) => edit && (
    <input type="date" className={`${s.inp} ${s.inpDate}`} value={edit.v[k]} aria-label={label}
      onChange={(e) => setEdit({ ...edit, v: { ...edit.v, [k]: e.target.value } })} />
  );

  return (
    <>
      <div className={s.stats}>
        {([[tr('Нийт баримт'), stat.total], [tr('Магадлалд орсон'), stat.magadlal], [tr('Зохиогчоос хүлээж авсан'), stat.received], [tr('PDF-тэй'), stat.pdf]] as [string, number][]).map(([k, v]) => (
          <div key={k} className={s.stat}><span className={s.statK}>{k}</span><span className={s.statV}>{v}</span></div>
        ))}
      </div>
      <div className={s.card}>
        <div className={s.tools}>
          <select className={s.search} value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label={tr('Багц')}>
            <option value="">{tr('Бүх багц')}</option>
            {pkgs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={s.search} type="search" value={find} placeholder={tr('Нэр, шифр, асуудлаар хайх')} aria-label={tr('Нэр, шифр, асуудлаар хайх')} onChange={(e) => setFind(e.target.value)} />
          <label className={s.hint}><input type="checkbox" checked={noPdf} onChange={(e) => setNoPdf(e.target.checked)} /> {tr('Зөвхөн PDF-гүй')}</label>
          <span className={s.spacer} />
          {canEdit && !sess && <EntSignIn compact />}
          {canEdit && <button type="button" className={s.ghost} disabled={busy} onClick={() => setAdd({ buleg: bulegs[0] ?? '', ded: '', bagts: '', ner: '', shifr: '' })}>{tr('+ Зураг нэмэх')}</button>}
          <button type="button" className={s.ghost} disabled={busy} onClick={() => invalidate('ZURAG_BURTGEL')} title={tr('Дахин ачаалах')} aria-label={tr('Дахин ачаалах')}>↻</button>
        </div>
        {(err || msg) && <div className={s.bar}>{err && <span className={s.err} role="alert">{err}</span>}{msg && <span className={s.ok} role="status">{msg}</span>}</div>}
        {add && (
          <div className={s.bar}>
            <div className={s.addFormIn}>
              <select className={s.inp} value={add.buleg} onChange={(e) => setAdd({ ...add, buleg: e.target.value })} aria-label={tr('Бүлэг')}>
                {bulegs.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <input className={s.inp} value={add.ded} placeholder={tr('Дэд бүлэг')} onChange={(e) => setAdd({ ...add, ded: e.target.value })} />
              <input className={s.inp} value={add.bagts} placeholder={tr('Багц')} onChange={(e) => setAdd({ ...add, bagts: e.target.value })} />
              <input className={`${s.inp} ${s.inpName}`} value={add.ner} placeholder={tr('Бичиг баримтын нэр')} onChange={(e) => setAdd({ ...add, ner: e.target.value })} />
              <input className={s.inp} value={add.shifr} placeholder={tr('Шифр')} onChange={(e) => setAdd({ ...add, shifr: e.target.value })} />
              <button type="button" className={s.save} disabled={busy} onClick={saveAdd}>{tr('Нэмэх')}</button>
              <button type="button" className={s.ghost} disabled={busy} onClick={() => setAdd(null)}>{tr('Болих')}</button>
            </div>
          </div>
        )}
        <input ref={fileEl} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
        <div className={s.scroll}>
          <table className={s.tbl}>
            <thead>
              <tr>
                <th>{tr('Д/Д')}</th>
                <th>{tr('Багц')}</th>
                <th>{tr('Бичиг баримтын нэр')}</th>
                <th>{tr('Магадлал')}</th>
                <th>{tr('Хүлээж авсан')}</th>
                <th>{tr('REV')}</th>
                <th>{tr('PDF')}</th>
                <th>{tr('Асуудал')}</th>
                {canEdit && <th aria-label={tr('Үйлдэл')} />}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.buleg}>
                  <tr className={s.phaseRow}><td colSpan={canEdit ? 9 : 8}>{g.buleg}</td></tr>
                  {g.subs.map((sub) => (
                    <Fragment key={`${g.buleg}|${sub.ded}`}>
                      {sub.ded && <tr className={s.grpRow}><td colSpan={canEdit ? 9 : 8}>{sub.ded}</td></tr>}
                      {sub.rows.map((r) => {
                        const ed = edit?.oid === r.oid ? edit : null;
                        return (
                          <tr key={r.oid} className={s.leafRow}>
                            <td className={s.code}>{r.dd ?? ''}</td>
                            <td className={s.pkg}>{r.bagts}</td>
                            <td className={s.zNm} title={r.tailbar || undefined}>
                              {r.pdfItem
                                ? <button type="button" className={s.zLink} onClick={() => void open(r)}>{r.ner}</button>
                                : r.ner}
                              {r.shifr && <span className={s.zSub}>{r.shifr}</span>}
                            </td>
                            <td>{ed ? dateIn('magadlal', tr('Магадлал')) : ymd(r.dates.magadlal_ognoo ?? r.dates.davtan_magadlal_ognoo) || '—'}</td>
                            <td>{ed ? dateIn('huleej', tr('Хүлээж авсан')) : ymd(r.dates.huleej_avsan_ognoo) || '—'}</td>
                            <td>{ed ? <input className={`${s.inp} ${s.inpPct}`} value={ed.v.rev} onChange={(e) => setEdit({ ...ed, v: { ...ed.v, rev: e.target.value } })} aria-label={tr('REV')} /> : r.rev || '—'}</td>
                            <td>
                              {r.pdfItem ? <button type="button" className={s.ghost} onClick={() => void open(r)}>{tr('Нээх')}</button> : <span className={s.zSub}>{tr('PDF алга')}</span>}
                              {canEdit && sess && (
                                <button type="button" className={s.ghost} disabled={busy} onClick={() => { fileFor.current = r; fileEl.current?.click(); }}>
                                  {r.pdfItem ? tr('Солих') : tr('PDF оруулах')}
                                </button>
                              )}
                            </td>
                            <td className={s.zIss} title={r.asuudal || undefined}>
                              {ed ? <input className={`${s.inp} ${s.inpName}`} value={ed.v.asuudal} onChange={(e) => setEdit({ ...ed, v: { ...ed.v, asuudal: e.target.value } })} aria-label={tr('Асуудал')} /> : r.asuudal}
                            </td>
                            {canEdit && (
                              <td className={s.act}>
                                {ed ? (
                                  <>
                                    <button type="button" className={s.save} disabled={busy} onClick={saveEdit}>{tr('Хадгалах')}</button>
                                    <button type="button" className={s.ghost} disabled={busy} onClick={() => setEdit(null)}>{tr('Болих')}</button>
                                  </>
                                ) : (
                                  <button type="button" className={s.ghost} disabled={busy} onClick={() => setEdit({ oid: r.oid, v: {
                                    magadlal: ymd(r.dates.magadlal_ognoo), huleej: ymd(r.dates.huleej_avsan_ognoo), rev: r.rev, asuudal: r.asuudal,
                                  } })}>{tr('Засах')}</button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

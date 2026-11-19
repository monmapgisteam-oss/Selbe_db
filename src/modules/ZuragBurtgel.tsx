'use client';

/**
 * ЗУРГИЙН БҮРТГЭЛ (2026-11-11, хэрэглэгч: «ЗУРАГ ТӨСӨЛ-LOG»-ийн загвараар; зураг дээр дарахад PDF нээгдэнэ; PDF-ийг системээр
 * оруулна — Enterprise item болно) — «ТЭЗҮ · Ажлын зураг төсөл» хуудасны таб. Өгөгдөл: хүснэгт 234 (`lib/zuragBurtgel.ts`).
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { applyAll } from '@/lib/tableWrite';
import { syncZuragPlan } from '@/lib/zuragPlanSync';
import { invalidate } from '@/lib/dataBus';
import { ZURAG_BURTGEL } from '@/lib/services';
import { entDeletePdf, entPdfBlob, entSearch, entUploadPdf, type EntPdf } from '@/lib/entDocs';
import { pdfIndex, pdfsOf, tagsFor, type ZPdfKind } from '@/lib/zuragPdf';
import { askConfirm } from '@/lib/confirm';
import { loadZuragBurtgel, loadPlanPkgs, bulegLabel, groupByBudget, groupZ, subLabel, toZRow, tolovAvg, Z_TOLOV, type ZRow, type ZTolov } from '@/lib/zuragBurtgel';
import { queryFeatures } from '@/lib/query';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { Data, userError } from '@/components/ui';
import { isTezuBuleg } from '@/lib/zuragPlan';
import s from './zuragTosol.module.css';

const CAP = { cap: 'zuragEdit' as const };
const ymd = (ms: number | null): string => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
/** PDF-ийн төрлийн нэр — цонхонд Гэрээ · Материал хоёр хэсэг */
const pdfKindLabel = (k: ZPdfKind): string => (k === 'geree' ? tr('Гэрээ') : tr('Материал'));
/** Төлөвийн нэр (албан ёсны) */
const tolovLabel = (t: ZTolov): string => (t === 'huleej_avsan' ? tr('Зохиогчоос хүлээж авсан') : t === 'magadlal' ? tr('Магадлалд орсон') : tr('Эхлээгүй'));
const msOf = (v: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : null);


export function ZuragBurtgel({ canEdit, scope }: {
  canEdit: boolean;
  /** 2026-11-16 (хэрэглэгч: «зураг төслөөс ТЭЗҮ-г салга»): `tezu` = зөвхөн 001 бүлэг, `zurag` = бусад; өгөөгүй бол бүгд */
  scope?: 'tezu' | 'zurag';
}) {
  const q = useAsync(loadZuragBurtgel, []);
  return (
    <Data q={q} loading={tr('Ачаалж байна…')} minH={240}>
      {(rows) => <Body key={scope ?? 'all'} rows={scope ? rows.filter((r) => isTezuBuleg(r.buleg) === (scope === 'tezu')) : rows} canEdit={canEdit} />}
    </Data>
  );
}

/** Мөнгөн дүн/тооны бичвэр ↔ тоо — зай, таслалыг үл тооно; хоосон = null; буруу бол undefined */
const uneText = (v: number | null): string => (v == null ? '' : String(v));
const uneOf = (t: string): number | null | undefined => {
  const c = t.replace(/[\s,₮]/g, '');
  if (!c) return null;
  return /^\d+(\.\d+)?$/.test(c) ? Number(c) : undefined;
};
/**
 * ЗАСАГДАХ ТАЛБАРУУД — «Засах» дарахад мөрийн бүх багана засагдана. `k` = засварын түлхүүр, `f` = хүснэгтийн талбар.
 * Төлөв (шууд сонгоно), PDF (товчоор), Д/Д (систем дугаарлана) энд орохгүй.
 */
type EKind = 'text' | 'date' | 'money' | 'int';
const EF: readonly { k: string; f: string; kind: EKind; get: (r: ZRow) => string }[] = [
  { k: 'bagts', f: 'bagts', kind: 'text', get: (r) => r.bagts },
  { k: 'gereeDugaar', f: 'geree_dugaar', kind: 'text', get: (r) => r.gereeDugaar },
  { k: 'gereeNer', f: 'geree_ner', kind: 'text', get: (r) => r.gereeNer },
  { k: 'ner', f: 'ner', kind: 'text', get: (r) => r.ner },
  { k: 'shifr', f: 'shifr', kind: 'text', get: (r) => r.shifr },
  { k: 'une', f: 'ajliin_une', kind: 'money', get: (r) => uneText(r.ajliinUne) },
  { k: 'hyanah', f: 'hyanah_ajiltan', kind: 'text', get: (r) => r.hyanah },
  { k: 'batlagdsan', f: 'batlagdsan_ognoo', kind: 'date', get: (r) => ymd(r.dates.batlagdsan_ognoo) },
  { k: 'zohiogch', f: 'zohiogch', kind: 'text', get: (r) => r.zohiogch },
  { k: 'magadlal', f: 'magadlal_ognoo', kind: 'date', get: (r) => ymd(r.dates.magadlal_ognoo) },
  { k: 'davtan', f: 'davtan_magadlal_ognoo', kind: 'date', get: (r) => ymd(r.dates.davtan_magadlal_ognoo) },
  { k: 'davtanShaardlaga', f: 'davtan_magadlal_shaardlaga', kind: 'text', get: (r) => r.davtanShaardlaga },
  { k: 'huleej', f: 'huleej_avsan_ognoo', kind: 'date', get: (r) => ymd(r.dates.huleej_avsan_ognoo) },
  { k: 'huleejAkt', f: 'huleej_avsan_akt', kind: 'text', get: (r) => r.huleejAkt },
  { k: 'ogson', f: 'guitsetgegchid_ogson_ognoo', kind: 'date', get: (r) => ymd(r.dates.guitsetgegchid_ogson_ognoo) },
  { k: 'ogsonAkt', f: 'guitsetgegchid_ogson_akt', kind: 'text', get: (r) => r.ogsonAkt },
  { k: 'zovshoorol', f: 'zovshoorol', kind: 'text', get: (r) => r.zovshoorol },
  { k: 'rev', f: 'rev', kind: 'text', get: (r) => r.rev },
  { k: 'burdel', f: 'burdel', kind: 'text', get: (r) => r.burdel },
  { k: 'format', f: 'format', kind: 'text', get: (r) => r.format },
  { k: 'burdelDugaar', f: 'burdel_dugaar', kind: 'text', get: (r) => r.burdelDugaar },
  { k: 'helber', f: 'helber', kind: 'text', get: (r) => r.helber },
  { k: 'tsaasaarHuvi', f: 'tsaasaar_huvi', kind: 'text', get: (r) => r.tsaasaarHuvi },
  { k: 'tailbar', f: 'tailbar', kind: 'text', get: (r) => r.tailbar },
  { k: 'pdfHuudas', f: 'pdf_huudas', kind: 'int', get: (r) => uneText(r.pdfHuudas) },
  { k: 'asuudal', f: 'asuudal', kind: 'text', get: (r) => r.asuudal },
];
type Edit = Record<string, string>;
const editOf = (r: ZRow): Edit => Object.fromEntries(EF.map((e) => [e.k, e.get(r)]));
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
  /* 2026-11-17: нэг баримтад хэдэн ч PDF — порталын item-үүд тагаар (`lib/zuragPdf.ts`). Нэвтрээгүй бол жагсаалт уншигдахгүй */
  const [pdfFor, setPdfFor] = useState<number | null>(null);
  const [pdfKind, setPdfKind] = useState<ZPdfKind>('material');
  const [pdfN, setPdfN] = useState(0);
  const pdfQ = useAsync<EntPdf[] | null>(() => (sess ? entSearch(`tags:"${ZURAG_BURTGEL.tag}"`) : Promise.resolve(null)), [sess?.user, pdfN]);
  const pdfIdx = useMemo(() => (pdfQ.data ? pdfIndex(pdfQ.data) : null), [pdfQ.data]);
  const pdfList = (r: ZRow) => (pdfIdx ? pdfsOf(r, pdfIdx) : []);
  const pdfRow = pdfFor == null ? null : rows.find((x) => x.oid === pdfFor) ?? null;

  /* 2026-11-17: багцыг гараар бичихгүй — ТТБ-ийн багцын нэрсээс сонгоно (жагсаалт уншигдаагүй бол бичих талбар хэвээр) */
  const ppQ = useAsync(loadPlanPkgs, []);
  const pkgOpts = useMemo(() => (ppQ.data?.length ? ['Бүх багц', ...ppQ.data] : null), [ppQ.data]);
  /** Багц сонгогч — `cur` жагсаалтад байхгүй (хуучин бичлэг) бол өөрийг нь сонголтод үлдээнэ */
  const pkgSel = (cur: string, set: (v: string) => void, w?: number) => (
    <select className={s.inp} style={w ? { width: w } : undefined} value={cur} aria-label={tr('Багц')} onChange={(e) => set(e.target.value)}>
      <option value="">{tr('Багц сонгоогүй')}</option>
      {cur && !pkgOpts?.includes(cur) && <option value={cur}>{cur}</option>}
      {pkgOpts?.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
  const pkgs = useMemo(() => [...new Set(rows.map((r) => r.bagts).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'mn')), [rows]);
  const bulegs = useMemo(() => [...new Set(rows.map((r) => r.buleg).filter(Boolean))], [rows]);
  const shown = useMemo(() => {
    const qx = find.trim().toLowerCase();
    return rows.filter((r) => (!pkg || r.bagts === pkg) && (!noPdf || !pdfIdx || pdfsOf(r, pdfIdx).length === 0)
      && (!qx || `${r.ner} ${r.shifr} ${r.bagts} ${r.asuudal}`.toLowerCase().includes(qx)));
  }, [rows, find, pkg, noPdf, pdfIdx]);
  /* 2026-11-16 (хэрэглэгч: «төсөв, зургийн бүртгэлийг төсвийн багцын нэрээр нэгтгэнэ») — төсөвтэй бол анхдагч нь багцаар:
     багц → «Төсөв» · «Зураг»; «Төрлөөр» = эх Excel-ийн бүлгээр */
  const hasTosov = useMemo(() => rows.some((r) => r.turul === 'tosov'), [rows]);
  const [mode, setMode] = useState<'bagts' | 'turul'>('bagts');
  const byPkg = hasTosov && mode === 'bagts';
  const groups = useMemo(() => {
    if (!byPkg) return groupZ(shown);
    return groupByBudget(shown).map((g) => ({
      buleg: g.label ? tr(g.label) : g.key ? tr('Багц {0}', g.pkgs.join(', ')) : tr('Багц заагаагүй'),
      subs: [{ ded: tr('Төсөв'), rows: g.tosov }, { ded: tr('Зураг'), rows: g.zurag }].filter((x) => x.rows.length),
    }));
  }, [shown, byPkg]);
  /* 2026-11-16 (хэрэглэгч: «Д/Д-ийг зас») — эх Excel-ийн Д/Д 160 мөрд хоосон, дэд бүлэгт дахин эхэлдэг. Систем дэд бүлэг
     бүрт 1, 2, 3 … гэж өөрөө дугаарлана (БҮХ мөрөөр — шүүлт хийхэд дугаар солигдохгүй). Хүснэгтийн `dd` хөндөгдөхгүй. */
  const ddOf = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of groupZ(rows)) for (const sub of g.subs) sub.rows.forEach((r, i) => m.set(r.oid, i + 1));
    return m;
  }, [rows]);
  /* 2026-11-16 (хэрэглэгч: «хурааж харах боломжтой болго») — бүлэг · дэд бүлгийг хураана; толгойд магадлалд орсон ÷ нийт */
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());
  const flip = (k: string) => setShut((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allKeys = useMemo(() => groups.flatMap((g) => [g.buleg, ...g.subs.filter((x) => x.ded).map((x) => `${g.buleg}|${x.ded}`)]), [groups]);
  /* 2026-11-17: гүйцэтгэл = төлөвийн хувийн дундаж */
  const cntOf = (rs: readonly ZRow[]) => { const a = tolovAvg(rs); return a == null ? '' : tr('{0}% · {1} баримт', a.toFixed(1), String(rs.length)); };
  const head = (k: string, label: string, rs: readonly ZRow[], cls: string) => (
    <tr className={`${cls} ${s.zFold}`} onClick={() => flip(k)}>
      <td colSpan={canEdit ? 30 : 29}>
        <button type="button" className={s.zFoldB} aria-expanded={!shut.has(k)} onClick={(e) => { e.stopPropagation(); flip(k); }}>
          <span aria-hidden>{shut.has(k) ? '▸' : '▾'}</span> {label}
        </button>
        <span className={s.zCnt} title={tr('Гүйцэтгэл — төлөвийн хувийн дундаж')}>{cntOf(rs)}</span>
      </td>
    </tr>
  );
  const stat = useMemo(() => ({
    total: rows.length,
    magadlal: rows.filter((r) => r.dates.magadlal_ognoo != null || r.dates.davtan_magadlal_ognoo != null).length,
    received: rows.filter((r) => r.dates.huleej_avsan_ognoo != null).length,
    pdf: pdfIdx ? rows.filter((r) => pdfsOf(r, pdfIdx).length > 0).length : null,
    pct: tolovAvg(rows),
  }), [rows, pdfIdx]);
  /** Төлөв сонгоход шууд хадгална (нэг нүд — нэг утга) */
  const setTolov = (r: ZRow, v: ZTolov) => {
    if (v === r.tolov) return;
    void run(async () => {
      await applyAll(ZURAG_BURTGEL.url, ZURAG_BURTGEL.oid, { updates: [{ [ZURAG_BURTGEL.oid]: r.oid, tolov: v }] }, CAP);
      invalidate('ZURAG_BURTGEL');
      return toPlan(tr('Төлөв хадгалагдав'));
    });
  };

  /** Бүртгэл өөрчлөгдсөний дараа «Төсөл төлөвлөгөө биелэлт»-ийн хүснэгтийг тааруулна; бүтэлгүйтвэл мэдэгдэлд нэмнэ */
  const toPlan = async (ok: string): Promise<string> => {
    try { await syncZuragPlan(); return ok; } catch (e) { return `${ok} · ${tr('«Төсөл төлөвлөгөө биелэлт»-д бичигдсэнгүй: {0}', userError(e))}`; }
  };

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true); setErr(null); setMsg(null);
    try { const m = await f(); if (m) setMsg(m); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  const open = async (id: string) => {
    const w = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await entPdfBlob(id));
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { w?.close(); setErr(userError(e)); }
  };
  /** Олон файлыг дараалан оруулна — сонгосон төрлөөр (`pdfKind`), попап цонхны мөрөнд (`pdfFor`) */
  const upload = (files: File[]) => {
    const r = rows.find((x) => x.oid === pdfFor);
    if (!r || !files.length) return;
    void run(async () => {
      const tags = tagsFor(r, pdfKind);
      if (!tags) throw new Error(tr('Гэрээний PDF оруулахын тулд эхлээд энэ мөрийн «Гэрээ №»-г бөглөнө үү.'));
      const what = pdfKind === 'geree' ? r.gereeDugaar : [r.bagts, r.shifr, r.ner].filter(Boolean).join(' · ');
      const warns: string[] = [];
      let n = 0;
      try {
        for (const file of files) {
          const title = `${pdfKindLabel(pdfKind)} — ${what} — ${file.name.replace(/\.pdf$/i, '')}`.slice(0, 250);
          const { warn } = await entUploadPdf(file, title, [ZURAG_BURTGEL.tag, ...tags], ZURAG_BURTGEL.docFolder);
          if (warn) warns.push(warn);
          n += 1;
        }
      } finally {
        if (n) setPdfN((x) => x + 1);
      }
      return [tr('{0} PDF оруулав', String(n)), ...warns].join(' · ');
    });
  };
  const removePdf = async (it: EntPdf) => {
    if (!(await askConfirm(tr('«{0}» PDF-ийг геопорталаас устгах уу? Буцаах боломжгүй.', it.title)))) return;
    void run(async () => {
      await entDeletePdf(it.id, it.owner);
      setPdfN((x) => x + 1);
      return tr('PDF устгагдав');
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
      const sig = (z: ZRow) => EF.map((e) => e.get(z)).join('\u0001');
      if (!fresh || sig(fresh) !== sig(r0)) { invalidate('ZURAG_BURTGEL'); setEdit(null); throw new Error(tr('Энэ хооронд өөр хэрэглэгч өөрчилсөн байна. Шинэчилсэн мэдээллийг шалгаад дахин оролдоно уу.')); }
      if (!(v.ner ?? '').trim()) throw new Error(tr('Бичиг баримтын нэрийг бичнэ үү.'));
      const u: Record<string, unknown> = { [ZURAG_BURTGEL.oid]: edit.oid };
      for (const e of EF) {
        const t = (v[e.k] ?? '').trim();
        if (t === e.get(r0)) continue;
        if (e.kind === 'text') { u[e.f] = t || null; continue; }
        if (e.kind === 'date') {
          const ms = msOf(t);
          if (t && ms == null) throw new Error(tr('Огноог ОООО-СС-ӨӨ хэлбэрээр бичнэ үү.'));
          u[e.f] = ms; continue;
        }
        const n = uneOf(t);
        if (n === undefined) throw new Error(e.kind === 'money' ? tr('Ажлын үнийг зөвхөн тоогоор бичнэ үү.') : tr('PDF хуудасны тоог зөвхөн тоогоор бичнэ үү.'));
        u[e.f] = n == null ? null : e.kind === 'int' ? Math.round(n) : n;
      }
      if (Object.keys(u).length === 1) { setEdit(null); return null; }
      await applyAll(ZURAG_BURTGEL.url, ZURAG_BURTGEL.oid, { updates: [u] }, CAP);
      invalidate('ZURAG_BURTGEL');
      setEdit(null);
      return toPlan(tr('Хадгалагдав'));
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
      return toPlan(tr('Зураг нэмэгдэв'));
    });
  };

  /** Засварын оролт — `w` px өргөн; огноо бол огнооны сонгогч */
  const inp = (k: string, label: string, w = 130) => {
    if (!edit) return null;
    const kind = EF.find((e) => e.k === k)?.kind ?? 'text';
    return (
      <input
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={kind === 'money' || kind === 'int' ? 'decimal' : undefined}
        className={s.inp}
        style={{ width: kind === 'date' ? 132 : w }}
        value={edit.v[k] ?? ''}
        aria-label={label}
        title={label}
        onChange={(e) => setEdit({ ...edit, v: { ...edit.v, [k]: e.target.value } })}
      />
    );
  };

  return (
    <>
      <div className={s.stats}>
        {([[tr('Гүйцэтгэл'), stat.pct == null ? '—' : `${stat.pct.toFixed(1)}%`], [tr('Нийт баримт'), stat.total], [tr('Магадлалд орсон'), stat.magadlal], [tr('Зохиогчоос хүлээж авсан'), stat.received], [tr('PDF-тэй'), stat.pdf ?? '—']] as [string, number | string][]).map(([k, v]) => (
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
          {hasTosov && (
            <div className={s.seg} role="tablist" aria-label={tr('Бүлэглэлт')}>
              {([['bagts', tr('Багцаар')], ['turul', tr('Төрлөөр')]] as ['bagts' | 'turul', string][]).map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} className={`${s.segB} ${mode === k ? s.segOn : ''}`} onClick={() => { setMode(k); setShut(new Set()); }}>{t}</button>
              ))}
            </div>
          )}
          <button type="button" className={s.ghost} onClick={() => setShut(new Set(groups.map((g) => g.buleg)))}>{tr('Бүгдийг хураах')}</button>
          <button type="button" className={s.ghost} onClick={() => setShut(new Set(allKeys.filter((k) => k.includes('|'))))}>{tr('Дэд бүлгээр')}</button>
          <button type="button" className={s.ghost} onClick={() => setShut(new Set())}>{tr('Бүгдийг дэлгэх')}</button>
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
              {pkgOpts
                ? pkgSel(add.bagts, (v) => setAdd({ ...add, bagts: v }))
                : <input className={s.inp} value={add.bagts} placeholder={tr('Багц')} onChange={(e) => setAdd({ ...add, bagts: e.target.value })} />}
              <input className={`${s.inp} ${s.inpName}`} value={add.ner} placeholder={tr('Бичиг баримтын нэр')} onChange={(e) => setAdd({ ...add, ner: e.target.value })} />
              <input className={s.inp} value={add.shifr} placeholder={tr('Шифр')} onChange={(e) => setAdd({ ...add, shifr: e.target.value })} />
              <button type="button" className={s.save} disabled={busy} onClick={saveAdd}>{tr('Нэмэх')}</button>
              <button type="button" className={s.ghost} disabled={busy} onClick={() => setAdd(null)}>{tr('Болих')}</button>
            </div>
          </div>
        )}
        <input ref={fileEl} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { const fl = [...(e.target.files ?? [])]; e.target.value = ''; upload(fl); }} />
        {/* 2026-11-17 (хэрэглэгч): «PDF оруулах дарахад попап цонх нээгдэнэ; Гэрээ болон Материал гэсэн тусдаа browse; олныг сонгож оруулна» */}
        {pdfRow && (
          <div className={s.zDlgBack} onClick={() => setPdfFor(null)}>
            <div className={s.zDlg} role="dialog" aria-modal="true" aria-label={tr('PDF оруулах')} onClick={(e) => e.stopPropagation()}>
              <h3 className={s.zDlgTitle}>{pdfRow.ner}</h3>
              {pdfQ.state === 'loading' && <span className={s.zSub}>{tr('Ачаалж байна…')}</span>}
              {pdfQ.state === 'error' && <span className={s.err} role="alert">{userError(pdfQ.error)}</span>}
              {(['geree', 'material'] as ZPdfKind[]).map((k) => {
                const list = pdfList(pdfRow).filter((x) => (k === 'geree' ? x.kind === 'geree' : x.kind !== 'geree'));
                return (
                  <section key={k} className={s.zDlgSec}>
                    <div className={s.zPdfRow}>
                      <b className={s.zPdfKind}>{pdfKindLabel(k)} ({list.length})</b>
                      {canEdit && (
                        <button type="button" className={s.save} disabled={busy} onClick={() => { setPdfKind(k); fileEl.current?.click(); }}>
                          {busy && pdfKind === k ? tr('Оруулж байна…') : tr('Файл сонгох…')}
                        </button>
                      )}
                      {k === 'geree' && <span className={s.zSub}>{tr('«{0}» гэрээний бүх мөрөнд харагдана.', pdfRow.gereeDugaar || '—')}</span>}
                    </div>
                    {list.length === 0 && <span className={s.zSub}>{tr('PDF алга')}</span>}
                    {list.map((x) => (
                      <div key={x.item.id} className={s.zPdfRow}>
                        <span className={s.zPdfTitle} title={x.item.title}>{x.item.title}</span>
                        <button type="button" className={s.ghost} onClick={() => void open(x.item.id)}>{tr('Нээх')}</button>
                        {canEdit && <button type="button" className={s.ghost} disabled={busy} onClick={() => void removePdf(x.item)}>{tr('Устгах')}</button>}
                      </div>
                    ))}
                  </section>
                );
              })}
              {(err || msg) && <div>{err && <span className={s.err} role="alert">{err}</span>}{msg && <span className={s.ok} role="status">{msg}</span>}</div>}
              <div className={s.zPdfRow}><span className={s.spacer} /><button type="button" className={s.ghost} onClick={() => setPdfFor(null)}>{tr('Хаах')}</button></div>
            </div>
          </div>
        )}
        <div className={s.scroll}>
          <table className={s.tbl}>
            <thead>
              <tr>
                {canEdit && <th aria-label={tr('Үйлдэл')} />}
                <th>{tr('PDF')}</th>
                <th>{tr('Төлөв')}</th>
                <th>{tr('Д/Д')}</th>
                <th>{tr('Багц')}</th>
                <th>{tr('Гэрээ №')}</th>
                <th>{tr('Гэрээ')}</th>
                <th>{tr('Бичиг баримтын нэр')}</th>
                <th>{tr('Ажлын үнэ, ₮')}</th>
                <th>{tr('Хянах ажилтан')}</th>
                <th>{tr('ХБХСГ-аар батлагдсан')}</th>
                <th>{tr('Зураг зохиогч')}</th>
                <th>{tr('Магадлал')}</th>
                <th>{tr('Давтан магадлал')}</th>
                <th>{tr('Давтан магадлал шаардлагатай эсэх')}</th>
                <th>{tr('Хүлээж авсан')}</th>
                <th>{tr('Хүлээж авсан акт')}</th>
                <th>{tr('Гүйцэтгэгчид хүлээлгэж өгсөн')}</th>
                <th>{tr('Гүйцэтгэгчид хүлээлгэж өгсөн акт')}</th>
                <th>{tr('Барилгын ажлын зөвшөөрлийн гэрчилгээ')}</th>
                <th>{tr('REV')}</th>
                <th>{tr('Зураг төслийн бүрдэл')}</th>
                <th>{tr('Зургийн формат')}</th>
                <th>{tr('Бүрдлийн дугаар')}</th>
                <th>{tr('Зураг төслийн хэлбэр')}</th>
                <th>{tr('Цаасаар хүлээлцсэн хувь')}</th>
                <th>{tr('Тайлбар')}</th>
                <th>{tr('PDF хуудасны тоо')}</th>
                <th>{tr('PDF файлын нэр')}</th>
                <th>{tr('Асуудал')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => (
                <Fragment key={g.buleg}>
                  {head(g.buleg, byPkg ? g.buleg : bulegLabel(g.buleg, gi), g.subs.flatMap((x) => x.rows), s.phaseRow)}
                  {!shut.has(g.buleg) && g.subs.map((sub, j) => (
                    <Fragment key={`${g.buleg}|${sub.ded}`}>
                      {sub.ded && head(`${g.buleg}|${sub.ded}`, byPkg ? sub.ded : subLabel(sub, j), sub.rows, s.grpRow)}
                      {!(sub.ded && shut.has(`${g.buleg}|${sub.ded}`)) && sub.rows.map((r) => {
                        const ed = edit?.oid === r.oid ? edit : null;
                        return (
                          <tr key={r.oid} className={s.leafRow}>
                            {canEdit && (
                              <td className={s.act}>
                                {ed ? (
                                  <>
                                    <button type="button" className={s.save} disabled={busy} onClick={saveEdit}>{tr('Хадгалах')}</button>
                                    <button type="button" className={s.ghost} disabled={busy} onClick={() => setEdit(null)}>{tr('Болих')}</button>
                                  </>
                                ) : (
                                  <button type="button" className={s.ghost} disabled={busy} onClick={() => setEdit({ oid: r.oid, v: editOf(r) })}>{tr('Засах')}</button>
                                )}
                              </td>
                            )}
                            <td>
                              <button
                                type="button"
                                className={s.ghost}
                                onClick={() => {
                                  if (!sess) { setMsg(null); setErr(tr('PDF харах, оруулахын тулд эхлээд хүснэгтийн дээд талд Enterprise-д нэвтэрнэ үү.')); return; }
                                  setMsg(null); setErr(null); setPdfFor(r.oid);
                                }}
                              >
                                {pdfIdx ? tr('PDF оруулах ({0})', String(pdfList(r).length)) : tr('PDF оруулах')}
                              </button>
                            </td>
                            <td>
                              {canEdit ? (
                                <select className={`${s.zTolov} ${s[`zT_${r.tolov}`] ?? ''}`} value={r.tolov} disabled={busy} aria-label={tr('Төлөв')} onChange={(e) => setTolov(r, e.target.value as ZTolov)}>
                                  {Z_TOLOV.map((t) => <option key={t.code} value={t.code}>{tolovLabel(t.code)}</option>)}
                                </select>
                              ) : <span className={`${s.zTolov} ${s[`zT_${r.tolov}`] ?? ''}`}>{tolovLabel(r.tolov)}</span>}
                            </td>
                            <td className={s.code}>{ddOf.get(r.oid) ?? ''}</td>
                            <td className={s.pkg}>{ed ? (pkgOpts && edit ? pkgSel(edit.v.bagts ?? '', (v) => setEdit({ ...edit, v: { ...edit.v, bagts: v } }), 110) : inp('bagts', tr('Багц'), 90)) : r.bagts}</td>
                            <td className={s.zCell} title={r.gereeDugaar || undefined}>{ed ? inp('gereeDugaar', tr('Гэрээ №')) : r.gereeDugaar}</td>
                            <td className={s.zCell}>{ed ? inp('gereeNer', tr('Гэрээ'), 180) : r.gereeUrl ? <a className={s.zLink} href={r.gereeUrl} target="_blank" rel="noopener noreferrer">{r.gereeNer || tr('Нээх')}</a> : r.gereeNer}</td>
                            <td className={s.zNm}>
                              {ed ? (
                                <>
                                  {inp('ner', tr('Бичиг баримтын нэр'), 300)}
                                  {inp('shifr', tr('Зургийн шифр'), 140)}
                                </>
                              ) : (
                                <>
                                  {(() => {
                                    const m = pdfList(r).find((x) => x.kind !== 'geree');
                                    return m ? <button type="button" className={s.zLink} onClick={() => void open(m.item.id)}>{r.ner}</button> : r.ner;
                                  })()}
                                  {r.shifr && <span className={s.zSub}>{r.shifr}</span>}
                                </>
                              )}
                            </td>
                            <td className={s.r}>{ed ? inp('une', tr('Ажлын үнэ, ₮')) : r.ajliinUne == null ? '' : Math.round(r.ajliinUne).toLocaleString('en-US')}</td>
                            <td className={s.zCell} title={r.hyanah || undefined}>{ed ? inp('hyanah', tr('Хянах ажилтан')) : r.hyanah}</td>
                            <td>{ed ? inp('batlagdsan', tr('ХБХСГ-аар батлагдсан')) : ymd(r.dates.batlagdsan_ognoo) || '—'}</td>
                            <td className={s.zCell} title={r.zohiogch || undefined}>{ed ? inp('zohiogch', tr('Зураг зохиогч')) : r.zohiogch}</td>
                            <td>{ed ? inp('magadlal', tr('Магадлал')) : ymd(r.dates.magadlal_ognoo) || '—'}</td>
                            <td>{ed ? inp('davtan', tr('Давтан магадлал')) : ymd(r.dates.davtan_magadlal_ognoo) || '—'}</td>
                            <td className={s.zCell} title={r.davtanShaardlaga || undefined}>{ed ? inp('davtanShaardlaga', tr('Давтан магадлал шаардлагатай эсэх')) : r.davtanShaardlaga}</td>
                            <td>{ed ? inp('huleej', tr('Хүлээж авсан')) : ymd(r.dates.huleej_avsan_ognoo) || '—'}</td>
                            <td className={s.zCell}>{ed ? inp('huleejAkt', tr('Хүлээж авсан акт')) : r.huleejAktUrl ? <a className={s.zLink} href={r.huleejAktUrl} target="_blank" rel="noopener noreferrer">{r.huleejAkt || tr('Нээх')}</a> : r.huleejAkt}</td>
                            <td>{ed ? inp('ogson', tr('Гүйцэтгэгчид хүлээлгэж өгсөн')) : ymd(r.dates.guitsetgegchid_ogson_ognoo) || '—'}</td>
                            <td className={s.zCell}>{ed ? inp('ogsonAkt', tr('Гүйцэтгэгчид хүлээлгэж өгсөн акт')) : r.ogsonAktUrl ? <a className={s.zLink} href={r.ogsonAktUrl} target="_blank" rel="noopener noreferrer">{r.ogsonAkt || tr('Нээх')}</a> : r.ogsonAkt}</td>
                            <td className={s.zCell} title={r.zovshoorol || undefined}>{ed ? inp('zovshoorol', tr('Барилгын ажлын зөвшөөрлийн гэрчилгээ')) : r.zovshoorol}</td>
                            <td>{ed ? inp('rev', tr('REV'), 80) : r.rev || '—'}</td>
                            <td className={s.zCell} title={r.burdel || undefined}>{ed ? inp('burdel', tr('Зураг төслийн бүрдэл')) : r.burdel}</td>
                            <td className={s.zCell} title={r.format || undefined}>{ed ? inp('format', tr('Зургийн формат'), 80) : r.format}</td>
                            <td className={s.zCell} title={r.burdelDugaar || undefined}>{ed ? inp('burdelDugaar', tr('Бүрдлийн дугаар')) : r.burdelDugaar}</td>
                            <td className={s.zCell} title={r.helber || undefined}>{ed ? inp('helber', tr('Зураг төслийн хэлбэр')) : r.helber}</td>
                            <td className={s.zCell} title={r.tsaasaarHuvi || undefined}>{ed ? inp('tsaasaarHuvi', tr('Цаасаар хүлээлцсэн хувь'), 90) : r.tsaasaarHuvi}</td>
                            <td className={s.zCell} title={r.tailbar || undefined}>{ed ? inp('tailbar', tr('Тайлбар'), 200) : r.tailbar}</td>
                            <td className={s.r}>{ed ? inp('pdfHuudas', tr('PDF хуудасны тоо'), 70) : r.pdfHuudas ?? ''}</td>
                            <td className={s.zCell} title={r.pdfNer || undefined}>
                              {r.pdfUrl ? <a className={s.zLink} href={r.pdfUrl} target="_blank" rel="noopener noreferrer">{r.pdfNer || tr('Нээх')}</a> : r.pdfNer}
                            </td>
                            <td className={s.zIss} title={r.asuudal || undefined}>{ed ? inp('asuudal', tr('Асуудал'), 260) : r.asuudal}</td>
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

'use client';

/**
 * IPC ҮҮСГЭХ ДАРААЛАЛ · ГЭРЭЭ ҮҮСГЭХ (2026-11-04). Дүрэм нь `lib/ipcFlow.ts`-д (цэвэр, тестлэгдэнэ).
 * 2026-11-23 (хэрэглэгч): IPC нь бөглөлт бүрээр БИШ — тухайн өдөр хүртэлх төлөгдөөгүй бөглөлтүүдийн НИЙЛБЭРЭЭС нэг удаа,
 * гэрээ · багц бүрт нэг баримт `Guitsetgel_talbe/238` «ipc»-д үүснэ (`lib/ipcDocTable.ts`). Бөглөлтүүд жагсаалтаар биш,
 * нийлбэрээр харагдана. Хуучин `IPC|…` баримт (185) хэвээр ажиллана (скан · батлах · устгах · PDF).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { t as tr } from '@/lib/i18nCore';
import { dayKey, mnt, MNT_DEC, pct } from '@/lib/format';
import { askConfirm } from '@/lib/confirm';
import { invalidate } from '@/lib/dataBus';
import { applyAll } from '@/lib/tableWrite';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, HO_IPC, IPC_DOC, num } from '@/lib/services';
import { contractCancelled } from '@/lib/ipc';
import { entDeletePdf, entSearch, entUploadPdf } from '@/lib/entDocs';
import { runHoSyncAfter } from '@/lib/hoSync/sync';
import { cfMatches, hoPkgParts, phasesOf } from '@/lib/hoSync/compute';
import { userError } from '@/components/ui';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { downloadIpcDocPdf, downloadIpcFlowPdf } from '@/lib/ipcFlowPdf';
import { freshDocs } from '@/lib/ipcDocRows';
import {
  advanceMissing, advanceOver, approveIpc, contractAlreadySaved, approveWhy, contractCancelFresh, contractCancelWhy, contractUpdates, contractWhy, deleteIpc, deleteWhy,
  docRows, docTitle, overContract, parseMoney, perfRows, signIpc, type ContractWhy, type IpcDocRow, type NewContract, type PerfRow, type Row,
} from '@/lib/ipcFlow';
import {
  DEDUCTIONS, approveDoc, contextOf, cumulative, defaultDeductions, deleteDoc, docCodeOf, docWhy, dupPayDeletes, editDoc, explainDeductions,
  fillBalance, newAdvanceDoc, newWorkDoc, nextDay, nextDocNo, payableOf, pctOf, pkgOf, prevEndOf, recOfDoc, recordsOf, rollbackRelease, sameNo,
  signDoc, stillFree, unpaidFills, unpaidPkgs, type DocWhy, type IpcRec,
} from '@/lib/ipcDocTable';
import s from './ipcTable.module.css';

const S = HO_IPC.status;
const CF = CASHFLOW_NEW.fields;
const F = IPC_DOC.fields;
const SG = IPC_DOC.signers;
/* 2026-11-23 (аудит): 0 ₮ нь «—» биш — `mnt(0)` хоосон гэж үздэг тул тэгийг тусад нь (2 оронтой) */
const money = (v: number | null | undefined): string => (v == null ? '—' : v === 0 ? `${(0).toFixed(MNT_DEC)} ₮` : `${mnt(v)}`);
/* 2026-11-04: Улаанбаатарын хуанлийн өдөр (`dayKey`) — бөглөх хуудасны өдөртэй (`ajilApply.todayLocalMs`) нэг дүрэм; UTC биш */
const today = (): string => dayKey(Date.now());
/** Гэрээний мөрүүдийг сервероос ШИНЭЭР уншина — бичихийн өмнө, өөр хэрэглэгчийн өөрчлөлтийг харахын тулд */
const freshPays = async (code: string, pays: readonly Row[]): Promise<readonly Row[]> => (code
  ? queryFeatures(HO_IPC.url, {
    where: `${HO_IPC.contractFields.code} = N'${code.replace(/'/g, "''")}'`,
    outFields: ['*'],
    orderBy: `${HO_IPC.oid} ASC`,
  })
  : pays);
/* IPC үүсгэх · гэрээ үүсгэх — IPC-ийн өөрийн эрх (`ipcCreate`), санхүүгийн засвараас тусдаа */
const CREATE_CAP = { cap: 'ipcCreate' } as const;
const APPROVE_CAP = { cap: 'ipcApprove' } as const;

/** Төлөвийн нэр — `tr` статик тул нэг бүрчлэн */
const statusText = (st: string): string => {
  if (st === S.created) return tr('IPC үүссэн');
  if (st === S.signed) return tr('Гарын үсэг зурсан');
  if (st === S.paid) return tr('Олгосон');
  if (st === S.cancelled) return tr('Цуцлагдсан');
  return tr('Гүйцэтгэл');
};

/** Суутгалын мөрийн нэр — «Хүснэгт 7»-гийн дарааллаар */
const deductionLabel = (f: string): string => {
  if (f === F.recovery) return tr('Урьдчилгаа эргэн төлөлт');
  if (f === F.overBudget) return tr('Төсвөөс давсан гүйцэтгэл');
  if (f === F.norm) return tr('Норм нормативын сан');
  if (f === F.clientCtl) return tr('Захиалагчийн хяналтын зардал');
  if (f === F.authorCtl) return tr('Зохиогчийн хяналтын зардал');
  return tr('Барьцаа');
};

/** Гарын үсэг зурагчид — сонголттой */
const signerList = (): [string, string][] => [
  [SG.approve, tr('Батлав (Хөрөнгө оруулалтын хэлтсийн дарга)')],
  [SG.ceo, tr('Гүйцэтгэх захирал')],
  [SG.finHead, tr('Санхүүгийн хэлтсийн дарга')],
  [SG.chiefAcc, tr('Ерөнхий нягтлан бодогч')],
  [SG.hoSpec, tr('Хөрөнгө оруулалтын хэлтсийн мэргэжилтэн')],
  [SG.pmoHead, tr('Хяналтын зөвлөхийн дарга')],
  [SG.pm1, tr('Хяналтын менежер 1')],
  [SG.pm2, tr('Хяналтын менежер 2')],
  [SG.cDir, tr('Гүйцэтгэгчийн захирал')],
  [SG.cAcc, tr('Гүйцэтгэгчийн нягтлан бодогч')],
  [SG.cPm, tr('Гүйцэтгэгчийн төслийн удирдагч')],
  [SG.cEng, tr('Гүйцэтгэгчийн инженер')],
];

const whyText = (w: DocWhy): string => {
  if (w === 'total') return tr('Нийт дүн 0-ээс их байх ёстой.');
  if (w === 'negative') return tr('Суутгал сөрөг байж болохгүй.');
  if (w === 'payable') return tr('Гүйцэтгэгчид төлөх дүн сөрөг болж байна — суутгалыг шалгана уу.');
  if (w === 'no-end') return tr('Ажлын үеийн төгсгөлийг сонгоно уу.');
  if (w === 'period-order') return tr('Үеийн төгсгөл эхлэлээс өмнө байна.');
  if (w === 'before-prev') return tr('Үеийн төгсгөл өмнөх IPC-ийн төгсгөлөөс өмнө байна.');
  if (w === 'overlap') return tr('Ажлын үе өмнөх IPC-ийн үетэй давхцаж байна.');
  return tr('Суутгалын тайлбарыг бичнэ үү.');
};

/** Нүдний бичвэр → мөрийн утга: мөнгө тоо, бусад бичвэр. Таних боломжгүй тоо — `NaN` */
const MONEY_IN: readonly string[] = [F.total, F.advance, F.annual, ...DEDUCTIONS];
const toRow = (v: Record<string, string>): Row => {
  const o: Row = {};
  for (const [k, x] of Object.entries(v)) o[k] = MONEY_IN.includes(k) ? parseMoney(x) : x.trim();
  return o;
};
const asText = (v: unknown): string => (v == null ? '' : String(v));

/** Бөглөлтийн жагсаалт — зөвхөн харах */
function FillList({ rows }: { rows: readonly PerfRow[] }) {
  if (!rows.length) return null;
  return (
    <details className={s.fillMore}>
      <summary>{tr('Бөглөлтийн жагсаалт ({0})', rows.length)}</summary>
      <div className={s.pkgScroll}>
        <table className={s.pkgTbl}>
          <thead>
            <tr>
              <th>{tr('Огноо')}</th>
              <th>{tr('Багц')}</th>
              <th>{tr('Мөр')}</th>
              <th className={s.pkgNum}>{tr('Дүн')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.oid}>
                <td>{r.day}</td>
                <td>{r.pkg}</td>
                <td>{r.id}</td>
                <td className={`${s.pkgNum} ${(r.une ?? 0) < 0 ? s.flowNeg : ''}`}>{r.une == null ? tr('дүнгүй') : money(r.une)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

type FormInit = { mode: 'new' } | { mode: 'edit'; rec: IpcRec };

/**
 * IPC-ИЙН МАЯГТ — шинэ (багц · үеийн төгсгөл сонгоход төлөгдөөгүй бөглөлтийн нийлбэр ба суутгалын санал бөглөгдөнө) эсвэл
 * «IPC үүссэн» баримтын засвар. Бүх тоо засагдана; хадгалахын өмнө `docWhy`.
 */
export function DocForm({
  init, pays, recs, docs, contract, busy, onCancel, onSave,
}: {
  init: FormInit;
  pays: readonly Row[];
  recs: readonly IpcRec[];
  docs: readonly Row[];
  contract: number | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: Row, ctx: { pkg: string; end: string; fills: ReturnType<typeof unpaidFills>; no: number }) => void;
}) {
  const pkgs = useMemo(() => unpaidPkgs(pays), [pays]);
  const edit = init.mode === 'edit' ? init.rec : null;
  const no = edit?.no ?? nextDocNo(pays, docs);
  /** Шинэ IPC-ийн санал — багц · үеийн төгсгөлөөр */
  const propose = (pkgKey: string, end: string): Record<string, string> => {
    const p = pkgs.find((x) => x.key === pkgKey);
    const f = unpaidFills(pays, end, pkgKey);
    const ctx = contextOf(recs);
    const d = defaultDeductions(f.total, { amount: contract, perfBefore: ctx.perfBefore }, undefined, ctx.advanceLeft);
    const prevEnd = prevEndOf(recs, p?.pkg ?? pkgKey);
    const out: Record<string, string> = {
      [F.start]: prevEnd ? nextDay(prevEnd) : f.from,
      [F.end]: end,
      [F.kod]: docCodeOf(p?.pkg ?? pkgKey, no),
      [F.note]: explainDeductions(d),
    };
    for (const k of [F.total, ...DEDUCTIONS]) out[k] = asText(d[k]);
    return out;
  };
  const [pkgKey, setPkgKey] = useState(() => pkgs[0]?.key ?? '');
  const [end, setEnd] = useState(() => edit?.to ?? pkgs[0]?.last ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() => {
    if (!edit) return propose(pkgs[0]?.key ?? '', pkgs[0]?.last ?? '');
    const o: Record<string, string> = {};
    for (const k of [F.kod, F.start, F.end, F.annual, F.contractorRd, F.note, F.total, F.advance, ...DEDUCTIONS, ...Object.values(SG)]) o[k] = asText(k === F.start || k === F.end ? (k === F.start ? edit.from : edit.to) : edit.row[k]);
    return o;
  });
  const [proposal] = useState(() => (edit ? null : vals));
  const fills = useMemo(() => (edit ? null : unpaidFills(pays, end, pkgKey)), [edit, pays, end, pkgKey]);
  const set = (k: string, v: string) => setVals((x) => ({ ...x, [k]: v }));
  const repick = (k: string, e: string) => { setPkgKey(k); setEnd(e); setVals((x) => ({ ...x, ...propose(k, e) })); };

  const pkgName = edit ? edit.pkg : pkgs.find((x) => x.key === pkgKey)?.pkg ?? '';
  const draft: Row = { ...toRow(vals), [F.type]: edit?.advance ? IPC_DOC.types.advance : IPC_DOC.types.work, [F.pkg]: pkgName };
  const bad = MONEY_IN.filter((k) => Number.isNaN(draft[k] as number));
  const others = recs.filter((x) => !(edit && x.src === 'doc' && x.oid === edit.oid));
  const why = docWhy(draft, others, edit ? edit.no : null);
  const errs = [
    ...(bad.length ? [tr('Дүнг зөвхөн тоогоор оруулна уу. Жишээ нь 5000000.')] : []),
    ...(fills && !fills.rows.length ? [tr('Энэ өдөр хүртэл төлөгдөөгүй бөглөлт алга.')] : []),
    ...why.map(whyText),
  ];
  const total = num(draft[F.total]);
  const payable = bad.length ? null : payableOf(draft);

  return (
    <div className={s.dlgBack} role="presentation" onClick={() => { if (!busy) onCancel(); }}>
      <div className={s.dlg} role="dialog" aria-modal="true" aria-label={edit ? tr('IPC засах') : tr('IPC үүсгэх')} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.dlgTitle}>
          {edit ? tr('IPC-{0} засах', no) : tr('IPC-{0} үүсгэх', no)}
          {pkgName ? ` · ${pkgName}` : ''}
        </h3>
        <div className={s.dlgList}>
          <div className={s.dlgForm}>
            {!edit && pkgs.length > 1 && (
              <label>
                {tr('Багц')}
                <select className={s.dlgIn} value={pkgKey} onChange={(e) => repick(e.target.value, pkgs.find((x) => x.key === e.target.value)?.last ?? end)}>
                  {pkgs.map((p) => <option key={p.key} value={p.key}>{p.pkg}</option>)}
                </select>
              </label>
            )}
            <label>
              {tr('Ажлын үеийн төгсгөл (энэ өдөр хүртэлх ажил)')}
              <input className={s.dlgIn} type="date" value={edit ? vals[F.end] : end} disabled={!!edit && !edit.advance}
                onChange={(e) => (edit ? set(F.end, e.target.value) : repick(pkgKey, e.target.value))} />
            </label>
            <label>{tr('Ажлын үеийн эхлэл')}<input className={s.dlgIn} type="date" value={vals[F.start] ?? ''} onChange={(e) => set(F.start, e.target.value)} /></label>
            <label>{tr('IPC код')}<input className={s.dlgIn} value={vals[F.kod] ?? ''} onChange={(e) => set(F.kod, e.target.value)} /></label>
          </div>
          {fills && (
            <p className={s.flowHint}>
              {tr('Төлөгдөөгүй бөглөлт: {0} ширхэг · нийлбэр {1} · {2} — {3}', fills.rows.length, money(fills.total), fills.from || '—', fills.to || '—')}
              {fills.rows.some((r) => r.une == null) && <> · <span className={s.flowNeg}>{tr('дүнгүй бөглөлт байна (нэгж үнэгүй ажил нийлбэрт орохгүй)')}</span></>}
            </p>
          )}
          {fills && <FillList rows={fills.rows} />}
          {edit && !edit.advance && <p className={s.flowHint}>{tr('Орсон бөглөлт ба үеийн төгсгөл өөрчлөгдөхгүй — өөрчлөх бол баримтыг устгаад дахин үүсгэнэ.')}</p>}
          <table className={s.pkgTbl}>
            <thead>
              <tr>
                <th>{tr('Хүснэгт 7')}</th>
                <th className={s.pkgNum}>{tr('Дүн')}</th>
                <th className={s.pkgNum}>{tr('Хувь')}</th>
                {proposal && <th className={s.pkgNum}>{tr('Санал')}</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{edit?.advance ? tr('Нийт дүн (урьдчилгаа санхүүжилт)') : tr('Нийт дүн (гүйцэтгэл)')}</td>
                <td className={s.pkgNum}><input className={s.dlgNum} inputMode="decimal" aria-label={tr('Нийт дүн')} value={vals[F.total] ?? ''} onChange={(e) => set(F.total, e.target.value)} /></td>
                <td className={s.pkgNum}>{pct(100)}</td>
                {proposal && <td className={s.pkgNum}>{money(parseMoney(proposal[F.total] ?? ''))}</td>}
              </tr>
              {DEDUCTIONS.map((f) => {
                const v = draft[f] as number | null;
                return (
                  <tr key={f}>
                    <td>− {deductionLabel(f)}</td>
                    <td className={s.pkgNum}><input className={s.dlgNum} inputMode="decimal" aria-label={deductionLabel(f)} value={vals[f] ?? ''} onChange={(e) => set(f, e.target.value)} /></td>
                    <td className={s.pkgNum}>{pct(Number.isNaN(v as number) ? null : pctOf(v, total), 2)}</td>
                    {proposal && <td className={s.pkgNum}>{money(parseMoney(proposal[f] ?? ''))}</td>}
                  </tr>
                );
              })}
              <tr>
                <th>{tr('Гүйцэтгэгчид төлөх дүн')}</th>
                <th className={`${s.pkgNum} ${payable != null && payable < 0 ? s.flowNeg : ''}`}>{money(payable)}</th>
                <th className={s.pkgNum}>{pct(pctOf(payable, total), 2)}</th>
                {proposal && <th />}
              </tr>
            </tbody>
          </table>
          <div className={s.dlgForm}>
            <label className={s.dlgWide}>
              {tr('Суутгалын тайлбар')}
              <textarea className={s.dlgText} rows={2} maxLength={2000} value={vals[F.note] ?? ''} onChange={(e) => set(F.note, e.target.value)} />
            </label>
            <label>{tr('Тухайн онд батлагдсан санхүүжилт')}<input className={s.dlgIn} inputMode="decimal" value={vals[F.annual] ?? ''} onChange={(e) => set(F.annual, e.target.value)} /></label>
            <label>{tr('Гүйцэтгэгчийн регистрийн дугаар')}<input className={s.dlgIn} value={vals[F.contractorRd] ?? ''} onChange={(e) => set(F.contractorRd, e.target.value)} /></label>
          </div>
          <details className={s.fillMore}>
            <summary>{tr('Гарын үсэг зурах хүмүүс (сонголттой)')}</summary>
            <div className={s.dlgForm}>
              {signerList().map(([f, label]) => (
                <label key={f}>{label}<input className={s.dlgIn} value={vals[f] ?? ''} onChange={(e) => set(f, e.target.value)} /></label>
              ))}
            </div>
          </details>
        </div>
        <div className={s.flowBar}>
          {errs.length > 0 && <span className={s.warn} role="alert">{errs.join(' ')}</span>}
          <button type="button" className={s.btn} disabled={busy} onClick={onCancel}>{tr('Болих')}</button>
          <button
            type="button"
            className={s.btn}
            disabled={busy || errs.length > 0}
            onClick={() => onSave(draft, { pkg: pkgKey, end, fills: fills ?? { rows: [], total: 0, from: '', to: '' }, no })}
          >
            {busy ? tr('Хадгалж байна…') : edit ? tr('Хадгалах') : tr('Шалгаад үүсгэх')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Скан оруулах баримт — хуучин (185) эсвэл шинэ (238) */
type ScanFor = { kind: 'legacy'; d: IpcDocRow } | { kind: 'doc'; rec: IpcRec };

/** Скан файлыг (Enterprise item) эзний нэрээр устгана; унавал дуудагч ил хэлнэ */
async function dropScan(id: string): Promise<void> {
  /* 2026-11-09: эзэн нь скан оруулсан хэрэглэгч (одоогийнх биш) — item-ийн мэдээллээс (`chanarDocs`, `docLib`-тэй адил).
     Enterprise сешнгүй бол `entSearch` алдаа өгч, дуудагч «гараар устгана уу» гэж ил хэлнэ */
  const it = /^\w+$/.test(id) ? (await entSearch(`id:${id}`)).find((x) => x.id === id) : undefined;
  if (!it?.owner) throw new Error(tr('Файл (item) устгагдсангүй.'));
  await entDeletePdf(it.id, it.owner);
}

/**
 * ГЭРЭЭНИЙ IPC САМБАР — төлөгдөөгүй бөглөлтийн НИЙЛБЭР, IPC үүсгэх маягт, IPC-үүдийн хүснэгт (238 + хуучин 185), PDF,
 * скан, баталгаажуулах, устгах. `docs` — 238-ийн энэ гэрээний мөрүүд; `null` = уншиж чадаагүй (үүсгэх хаалттай).
 * `children` — төлбөрийн картууд.
 */
export function IpcFlowPanel({
  code, contractNo, contractor, project, pays, docs, contract, paid, canCreate, canApprove, children,
}: {
  code: string;
  contractNo: string;
  contractor: string;
  project: string;
  pays: readonly Row[];
  docs: readonly Row[] | null;
  contract: number | null;
  paid: number | null;
  canCreate: boolean;
  canApprove: boolean;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormInit | null>(null);
  const sess = useEntSession();
  const fileFor = useRef<ScanFor | null>(null);
  const fileEl = useRef<HTMLInputElement>(null);

  /* 2026-11-11: нэгж үнийг хожим тавьсан ажлын мөнгийг чөлөөт гүйцэтгэлд нөхнө — гэрээг нээхэд нэг удаа, IPC үүсгэх эрхтэй хүнд */
  const repricedRef = useRef('');
  /* 2026-11-23 (аудит): үнийн нөхөлт явж байхад IPC үүсгэхийг хаана — нөхөлт уншсанаас хойш түгжигдсэн мөрийн дүнг дардаг байв */
  const [repricing, setRepricing] = useState(false);
  /* 2026-11-23 (хяналт): `alive`-ийн оронд ажиллуулалтын дугаар — `canCreate` унтарч асахад (ижил гэрээ, шинэ ажиллуулалтгүй)
     хуучин `finally` `repricing`-ийг цэвэрлэхгүй үлдээж «IPC үүсгэх» бүрмөсөн идэвхгүй болдог байв */
  const repriceRun = useRef(0);
  useEffect(() => {
    if (!canCreate || repricedRef.current === code) return;
    repricedRef.current = code;
    const run = ++repriceRun.current;
    setRepricing(true);
    void import('@/lib/ipcAutoWrite').then((m) => m.repriceFreeRows(code)).catch((e) => console.warn('[selbe] нэгж үнийн нөхөлт амжилтгүй:', e))
      .finally(() => { if (repriceRun.current === run) setRepricing(false); });
  }, [canCreate, code]);
  const perf = useMemo(() => perfRows(pays), [pays]);
  const legacy = useMemo(() => docRows(pays), [pays]);
  const recs = useMemo(() => recordsOf(pays, docs ?? []), [pays, docs]);
  const cum = useMemo(() => cumulative(recs, contract), [recs, contract]);
  const unpaid = useMemo(() => unpaidFills(pays, ''), [pays]);
  const pkgs = useMemo(() => unpaidPkgs(pays), [pays]);
  const bal = useMemo(() => fillBalance(pays, recs), [pays, recs]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  const changed = () => {
    setForm(null);
    invalidate('HO_IPC', 'IPC_DOC');
    setErr(tr('Энэ хооронд өөр хэрэглэгч өөрчилсөн байна. Шинэчилсэн мэдээллийг шалгаад дахин оролдоно уу.'));
  };

  /* ─────────── ШИНЭ IPC (238) ─────────── */

  const create = (draft: Row, ctx: { pkg: string; end: string; fills: ReturnType<typeof unpaidFills>; no: number }) => run(async () => {
    const f = ctx.fills;
    const total = num(draft[F.total]) ?? 0;
    const pending = recs.filter((x) => x.src !== 'pay' && x.status !== S.paid).reduce((a, x) => a + (x.total ?? 0), 0);
    const lines = [
      tr('IPC-{0} үүсгэх үү?', ctx.no),
      `• ${tr('Багц: {0}', f.rows[0]?.pkg ?? '')}`,
      `• ${tr('Ажлын үе: {0} — {1}', String(draft[F.start] || '—'), ctx.end)}`,
      `• ${tr('Төлөгдөөгүй бөглөлт: {0} ширхэг · {1} · {2} — {3}', f.rows.length, money(f.total), f.from, f.to)}`,
      `• ${tr('Нийт дүн: {0}', money(total))}`,
      ...DEDUCTIONS.filter((k) => (num(draft[k]) ?? 0) !== 0).map((k) => `• − ${deductionLabel(k)}: ${money(num(draft[k]))} (${pct(pctOf(num(draft[k]), total), 2)})`),
      `• ${tr('Гүйцэтгэгчид төлөх дүн: {0}', money(payableOf(draft)))}`,
      ...(Math.abs(total - f.total) >= 0.5 ? [`⚠ ${tr('Нийт дүн бөглөлтийн нийлбэрээс ({0}) өөр байна.', money(f.total))}`] : []),
      ...(f.rows.some((r) => r.une == null) ? [`⚠ ${tr('Сонгосон гүйцэтгэлд дүнгүй мөр байна. Нэгж үнийг бөглөхгүй бол тэр ажил IPC дүнд орохгүй.')}`] : []),
      ...(f.rows.some((r) => (r.une ?? 0) < 0) ? [`⚠ ${tr('Сонгосон гүйцэтгэлд дүн буурсан мөр байна.')}`] : []),
      ...(overContract(paid, total, contract, pending) ? [`⚠ ${tr('Энэ IPC-тэй хамт олгосон ба батлагдаагүй IPC-ийн дүн гэрээний дүнгээс хэтэрнэ.')}`] : []),
    ];
    if (!(await askConfirm(lines.join('\n'), { ok: tr('IPC үүсгэх') }))) return;
    const [fp, fd] = await Promise.all([freshPays(code, pays), freshDocs(code)]);
    const f2 = unpaidFills(fp, ctx.end, ctx.pkg);
    const recs2 = recordsOf(fp, fd);
    const no = nextDocNo(fp, fd);
    if (f2.rows.length !== f.rows.length || Math.abs(f2.total - f.total) >= 0.005 || !f2.rows.length) { changed(); return; }
    const pkg = f2.rows[0].pkg;
    /* Дугаар өөрчлөгдсөн бол (өөр хэрэглэгч энэ хооронд үүсгэсэн) анхдагч код дагана */
    const kod = String(draft[F.kod] ?? '') === docCodeOf(pkg, ctx.no) ? docCodeOf(pkg, no) : draft[F.kod];
    const values = { ...draft, [F.kod]: kod, [F.end]: ctx.end };
    if (docWhy({ ...values, [F.pkg]: pkg }, recs2).length) { changed(); return; }
    const { doc, lock } = newWorkDoc({ code, contractNo, contractor, pkg, no }, f2.rows, values);
    /* 238 ЭХЭЛНЭ: баримт бичигдсэний дараа бөглөлтүүдийг түгжинэ; түгжилт унавал баримтыг буцааж устгана */
    const made = await applyAll(IPC_DOC.url, IPC_DOC.oid, { adds: [doc] }, CREATE_CAP);
    invalidate('IPC_DOC');
    const mine = made.oids[0];
    try {
      /* 2026-11-24 (засвар): түгжихийн өмнө бөглөлт чөлөөтэй хэвээр эсэхийг дахин уншиж шалгана */
      if (!stillFree(await freshPays(code, pays), f2.rows)) throw new Error(tr('Бөглөлтийг өөр хэрэглэгч энэ хооронд IPC-д оруулсан.'));
      await applyAll(HO_IPC.url, HO_IPC.oid, { updates: lock }, CREATE_CAP);
    } catch (e) {
      try {
        if (mine != null) await applyAll(IPC_DOC.url, IPC_DOC.oid, { deletes: [mine] }, CREATE_CAP);
        setErr(tr('Бөглөлтийг түгжиж чадсангүй ({0}) — IPC баримтыг буцааж устгалаа. Дахин оролдоно уу.', userError(e)));
      } catch (e2) {
        setErr(tr('Бөглөлтийг түгжиж чадсангүй ({0}), IPC-{1} баримтыг буцааж устгаж ч чадсангүй ({2}). Жагсаалтаас «Устгах»-ыг дарна уу.', userError(e), no, userError(e2)));
      }
      invalidate('HO_IPC', 'IPC_DOC');
      return;
    }
    invalidate('HO_IPC');
    setForm(null);
    /* Хоёр хэрэглэгч зэрэг үүсгэвэл нэг дугаар авч болно — хожуу үүссэн (их objectid) нь ӨӨРИЙН баримтыг буцаана.
       IPC аль хэдийн бичигдсэн: энэ уншилт унавал «алдаа» гэж хэлэхгүй */
    const after = await Promise.all([freshPays(code, pays), freshDocs(code)]).catch(() => null);
    if (!after || mine == null) return;
    const dup = sameNo(recordsOf(after[0], after[1]), no, mine);
    if (!dup.length) return;
    if (dup.every((x) => x.src === 'doc' && x.oid < mine)) {
      /* 2026-11-24 (засвар): ижил багцын үлдэх баримтын үед ороогүй миний бөглөлтийг чөлөөлнө (урьд нь түгжигдсэн үлдэж
         хэзээ ч олгогдохгүй байв); өөр багцынх бол миний бүх бөглөлт. Сая уншсан мөрөөр, «IPC үүссэн» хэвээрийг л */
      const keepers = dup.filter((x) => pkgOf(x.pkg) === pkgOf(pkg));
      const release = rollbackRelease(after[0], f2.rows, keepers, no);
      if (release.length) await applyAll(HO_IPC.url, HO_IPC.oid, { updates: release }, CREATE_CAP);
      await applyAll(IPC_DOC.url, IPC_DOC.oid, { deletes: [mine] }, CREATE_CAP);
      invalidate('HO_IPC', 'IPC_DOC');
      setErr(tr('IPC-{0} дугаарыг өөр хэрэглэгч зэрэг авсан тул таны баримтыг буцаалаа. Дахин үүсгэнэ үү.', no));
    } else {
      setErr(tr('IPC-{0} дугаартай өөр баримт зэрэг үүссэн байна. Баталгаажуулахаас өмнө админд мэдэгдэнэ үү.', no));
    }
  });

  const save = (rec: IpcRec, draft: Row) => run(async () => {
    const fd = await freshDocs(code);
    const row = fd.find((r) => num(r[IPC_DOC.oid]) === rec.oid);
    const rec2 = row ? recOfDoc(row) : null;
    const e = rec2 ? editDoc(rec2, draft) : 'status';
    if (!rec2 || typeof e === 'string') { changed(); return; }
    await applyAll(IPC_DOC.url, IPC_DOC.oid, { updates: [e] }, CREATE_CAP);
    invalidate('IPC_DOC');
    setForm(null);
  });

  /** Сервероос шинээр уншсан 185 ба 238-ийн мөрөөс энэ баримт */
  const freshRec = async (rec: IpcRec): Promise<{ fp: readonly Row[]; rec2: IpcRec | null }> => {
    const [fp, fd] = await Promise.all([freshPays(code, pays), freshDocs(code)]);
    const row = fd.find((r) => num(r[IPC_DOC.oid]) === rec.oid);
    return { fp, rec2: row ? recOfDoc(row) : null };
  };

  const approveNew = (rec: IpcRec) => run(async () => {
    if (rec.status !== S.signed || !rec.docItem) { setErr(tr('Гарын үсэгтэй сканыг эхлээд оруулна уу.')); return; }
    const q = tr('IPC-{0}-г баталгаажуулах уу? Нийт дүн {1} олгосон дүнд нэмэгдэнэ (гүйцэтгэгчид төлөх {2}). Баталсны дараа устгах, буцаах боломжгүй.',
      rec.no ?? '', money(rec.total), money(rec.payable));
    if (!(await askConfirm(q, { ok: tr('Баталгаажуулах') }))) return;
    const { fp, rec2 } = await freshRec(rec);
    const e = rec2 ? approveDoc(rec2, fp, today()) : 'status';
    if (!rec2 || typeof e === 'string') { changed(); return; }
    /* 185 ЭХЭЛНЭ (нэг атомт бичилт: төлбөрийн мөр + бөглөлтүүд «Олгосон»); 238-ийн төлөв унавал дахин дарахад төлбөр давхардахгүй */
    await applyAll(HO_IPC.url, HO_IPC.oid, { adds: e.pay ? [e.pay] : [], updates: e.auto }, APPROVE_CAP);
    invalidate('HO_IPC');
    /* 2026-11-24 (засвар): хоёр хүн зэрэг баталбал төлбөрийн мөр хоёр болно — дахин уншиж хожуу (их objectid) мөрийг устгана */
    if (e.pay && rec2.no != null) {
      try {
        const del = dupPayDeletes(await freshPays(code, pays), String(e.pay[HO_IPC.contractFields.code] ?? ''), rec2.no);
        if (del.length) await applyAll(HO_IPC.url, HO_IPC.oid, { deletes: del }, APPROVE_CAP);
      } catch (x) {
        setErr(tr('IPC-{0}-ийн төлбөр давхар бичигдсэн эсэхийг шалгаж чадсангүй ({1}). «Төлбөрийн акт (IPC)»-д нэг төлбөрийн мөр байгааг шалгана уу.', rec2.no, userError(x)));
      }
      invalidate('HO_IPC');
    }
    try {
      await applyAll(IPC_DOC.url, IPC_DOC.oid, { updates: [e.doc] }, APPROVE_CAP);
    } catch (x) {
      setErr(tr('Төлбөр «Төлбөрийн акт (IPC)»-д бичигдсэн ч IPC баримтын төлөв шинэчлэгдсэнгүй ({0}). «Баталгаажуулах»-ыг дахин дарна уу — төлбөр давхар бичигдэхгүй.', userError(x)));
    }
    invalidate('IPC_DOC');
  });

  const removeNew = (rec: IpcRec) => run(async () => {
    if (!(await askConfirm(tr('IPC-{0}-г устгах уу? Холбогдсон гүйцэтгэлүүд дахин сонгож болох болно.', rec.no ?? ''), { ok: tr('Устгах'), danger: true }))) return;
    const { fp, rec2 } = await freshRec(rec);
    const e = rec2 ? deleteDoc(rec2, fp) : 'paid';
    if (!rec2 || typeof e === 'string') { changed(); return; }
    /* Бөглөлтийг эхлээд чөлөөлнө; 238-ийн устгал унавал буцааж түгжинэ (төлбөргүй баримтад түгжигдсэн бөглөлт үлдэхгүй) */
    await applyAll(HO_IPC.url, HO_IPC.oid, { updates: e.unlock }, canCreate ? CREATE_CAP : APPROVE_CAP);
    invalidate('HO_IPC');
    try {
      await applyAll(IPC_DOC.url, IPC_DOC.oid, { deletes: [rec2.oid] }, canCreate ? CREATE_CAP : APPROVE_CAP);
    } catch (x) {
      await applyAll(HO_IPC.url, HO_IPC.oid, { updates: e.restore }, canCreate ? CREATE_CAP : APPROVE_CAP).catch(() => {});
      invalidate('HO_IPC', 'IPC_DOC');
      throw x;
    }
    invalidate('IPC_DOC');
    if (rec2.docItem) {
      try {
        await dropScan(rec2.docItem);
      } catch (x) {
        setErr(tr('Баримт устсан ч скан файл устсангүй ({0}). Баримт бичгийн сангаас гараар устгана уу.', userError(x)));
      }
    }
  });

  const pdfNew = (i: number) => run(async () => {
    const rec = recs[i];
    const fills = perf.filter((r) => r.ipcNo === rec.no && (!rec.pkg || pkgOf(r.pkg) === pkgOf(rec.pkg)));
    await downloadIpcDocPdf({ code, contractNo, contractor, project, contract, recs, i, fills });
  });

  /* ─────────── ХУУЧИН БАРИМТ (185) ─────────── */

  const pdf = (d: IpcDocRow) => run(async () => {
    const rows: PerfRow[] = perf.filter((r) => r.ipcNo === d.no);
    await downloadIpcFlowPdf({ code, contractNo, contractor, doc: d, rows });
  });

  const scan = (file: File) => {
    const t = fileFor.current;
    if (!t) return;
    void run(async () => {
      if (t.kind === 'doc') {
        const { rec2 } = await freshRec(t.rec);
        if (!rec2 || rec2.status !== S.created) { changed(); return; }
        const { item } = await entUploadPdf(file, docTitle(code, { no: rec2.no ?? 0, day: rec2.to || today() }), ['selbe-ipc'], HO_IPC.docFolder);
        await applyAll(IPC_DOC.url, IPC_DOC.oid, { updates: [signDoc(rec2, item.id, today())] }, CREATE_CAP);
        invalidate('IPC_DOC');
        return;
      }
      /* Дэлгэцийн мөр хуучирсан байж болно — баталгаажсан баримтын төлөвийг буцаахгүй */
      const d2 = docRows(await freshPays(code, pays)).find((x) => x.oid === t.d.oid);
      if (!d2 || d2.status !== S.created) { changed(); return; }
      const { item } = await entUploadPdf(file, docTitle(code, d2), ['selbe-ipc'], HO_IPC.docFolder);
      await applyAll(HO_IPC.url, HO_IPC.oid, { updates: [signIpc(d2, item.id)] }, CREATE_CAP);
      invalidate('HO_IPC');
    });
  };

  const approve = (d: IpcDocRow) => run(async () => {
    if (approveWhy(d)) { setErr(tr('Гарын үсэгтэй сканыг эхлээд оруулна уу.')); return; }
    const q = tr('IPC-{0}-г баталгаажуулах уу? {1} олгосон дүнд нэмэгдэнэ. Баталсны дараа устгах, буцаах боломжгүй.', d.no, money(d.total));
    if (!(await askConfirm(q, { ok: tr('Баталгаажуулах') }))) return;
    const fresh = await freshPays(code, pays);
    const d2 = docRows(fresh).find((x) => x.oid === d.oid);
    if (!d2 || approveWhy(d2)) { changed(); return; }
    await applyAll(HO_IPC.url, HO_IPC.oid, { updates: approveIpc(d2, fresh, today()) }, APPROVE_CAP);
    invalidate('HO_IPC');
  });

  const remove = (d: IpcDocRow) => run(async () => {
    if (!(await askConfirm(tr('IPC-{0}-г устгах уу? Холбогдсон гүйцэтгэлүүд дахин сонгож болох болно.', d.no), { ok: tr('Устгах'), danger: true }))) return;
    const fresh = await freshPays(code, pays);
    const d2 = docRows(fresh).find((x) => x.oid === d.oid);
    if (!d2 || deleteWhy(d2, fresh)) { changed(); return; }
    await applyAll(HO_IPC.url, HO_IPC.oid, deleteIpc(d2, fresh), canCreate ? CREATE_CAP : APPROVE_CAP);
    invalidate('HO_IPC');
    /* Баримт устсан: скан файл үлдсэн бол бүртгэлгүй хог болохгүй гэж арилгана; унавал баримтад нөлөөгүй, ил хэлнэ */
    if (d2.docItem) {
      try {
        await dropScan(d2.docItem);
      } catch (e) {
        setErr(tr('Баримт устсан ч скан файл устсангүй ({0}). Баримт бичгийн сангаас гараар устгана уу.', userError(e)));
      }
    }
  });

  const pickScan = (t: ScanFor) => { fileFor.current = t; fileEl.current?.click(); };
  const scanBtn = (t: ScanFor) => (sess
    ? <button type="button" className={s.btn} disabled={busy} onClick={() => pickScan(t)}>{tr('Скан оруулах')}</button>
    : <EntSignIn compact />);
  const kindText = (x: IpcRec): string => (x.src === 'pay'
    ? (x.advance ? tr('Урьдчилгаа (өмнөх төлбөр)') : tr('Төлбөр (өмнөх бүртгэл)'))
    : x.src === 'legacy'
      ? (x.advance ? tr('Урьдчилгаа (хуучин баримт)') : tr('IPC (хуучин баримт)'))
      : (x.advance ? tr('Урьдчилгаа') : tr('Гүйцэтгэл')));
  const cellMoney = (x: IpcRec, v: number | null) => (x.src === 'doc'
    ? <>{money(v)}{v ? <span className={s.ipcPct}> {pct(pctOf(v, x.total), 2)}</span> : null}</>
    : '—');
  const canNew = canCreate && !!code && docs != null && pkgs.length > 0;
  const COLS = 16;

  return (
    <div className={s.flow}>
      {(unpaid.rows.length > 0 || bal.fills !== 0) && (
        <section className={s.fillSum}>
          <h4 className={s.dGrpTitle}>{tr('ТӨЛӨГДӨӨГҮЙ ГҮЙЦЭТГЭЛ')}</h4>
          {/* 2026-11-23 (хэрэглэгч: «цуглараад байгаа нь харагдахгүй юу»): IPC-д ороогүй бөглөлтийн хуримтлал — том тоогоор */}
          <div className={s.accum}>
            <span className={s.accumLbl}>{tr('IPC-д ороогүй хуримтлагдсан гүйцэтгэл')}</span>
            <span className={s.accumVal}>{money(bal.due)}</span>
            <span className={s.accumSub}>{tr('{0} бөглөлт · {1} — {2}', unpaid.rows.length, unpaid.from || '—', unpaid.to || '—')}</span>
          </div>
          {pkgs.length > 1 && pkgs.map((p) => {
            const f = unpaidFills(pays, '', p.key);
            return (
              <p key={p.key} className={s.flowHint}>
                {tr('{0}: {1} бөглөлт · нийлбэр {2} · {3} — {4}', p.pkg, f.rows.length, money(f.total), f.from || '—', f.to || '—')}
              </p>
            );
          })}
          <p className={s.flowHint}>
            {tr('Нийт бөглөлт {0} · IPC-д орсон {1} (олгосон {2}) · IPC-д ороогүй {3}', money(bal.fills), money(bal.inIpc), money(bal.paid), money(bal.due))}
          </p>
          <FillList rows={unpaid.rows} />
          {canNew && (
            <div className={s.flowBar}>
              <button type="button" className={s.btn} disabled={busy || repricing}
                title={repricing ? tr('Нэгж үнийн нөхөлт дуустал түр хүлээнэ үү') : undefined} onClick={() => { setErr(null); setForm({ mode: 'new' }); }}>{tr('IPC үүсгэх')}</button>
            </div>
          )}
          {canCreate && !!code && docs == null && <p className={s.warn}>{tr('IPC баримтын хүснэгтийг уншиж чадсангүй — IPC үүсгэх түр боломжгүй.')}</p>}
        </section>
      )}
      {children}
      {recs.length > 0 && (
        <div className={s.pkgScroll}>
          <h4 className={s.dGrpTitle}>{tr('IPC БАРИМТ')}</h4>
          <table className={s.pkgTbl}>
            <thead>
              <tr>
                <th>{tr('Баримт')}</th>
                <th>{tr('Төрөл')}</th>
                <th>{tr('Багц')}</th>
                <th>{tr('Ажлын үе')}</th>
                <th className={s.pkgNum}>{tr('Нийт дүн')}</th>
                {DEDUCTIONS.map((f) => <th key={f} className={s.pkgNum}>{deductionLabel(f)}</th>)}
                <th className={s.pkgNum}>{tr('Гүйцэтгэгчид төлөх дүн')}</th>
                <th className={s.pkgNum}>{tr('Хуримтлагдсан санхүүжилт')}</th>
                <th className={s.pkgNum}>{tr('Үлдэгдэл санхүүжилт')}</th>
                <th>{tr('Төлөв')}</th>
                <th aria-label={tr('Үйлдэл')} />
              </tr>
            </thead>
            <tbody>
              {recs.map((x, i) => {
                const d = x.src === 'legacy' ? legacy.find((y) => y.oid === x.oid) : undefined;
                const c = cum[i];
                return [
                  <tr key={`${x.src}:${x.oid}`}>
                    <td title={x.kod || undefined}>{x.kod || (x.no != null ? `IPC-${String(x.no).padStart(2, '0')}` : '—')}</td>
                    <td>{kindText(x)}</td>
                    <td>{x.pkg || '—'}</td>
                    <td>{x.from || x.to ? `${x.from || '—'} — ${x.to || '—'}` : x.day || '—'}</td>
                    <td className={s.pkgNum}>{money(x.total)}</td>
                    {DEDUCTIONS.map((f) => {
                      const v = f === F.recovery ? x.recovery : f === F.overBudget ? x.overBudget : f === F.norm ? x.norm
                        : f === F.clientCtl ? x.clientCtl : f === F.authorCtl ? x.authorCtl : x.retention;
                      return <td key={f} className={s.pkgNum}>{cellMoney(x, v)}</td>;
                    })}
                    <td className={s.pkgNum}><b>{money(x.payable)}</b></td>
                    <td className={s.pkgNum}>{money(c?.finCum ?? null)}</td>
                    <td className={`${s.pkgNum} ${(c?.finLeft ?? 0) < 0 ? s.flowNeg : ''}`}>{money(c?.finLeft ?? null)}</td>
                    <td>{statusText(x.status)}</td>
                    <td className={s.flowAct}>
                      {x.src === 'doc' && (
                        <>
                          <button type="button" className={s.btn} disabled={busy} onClick={() => void pdfNew(i)}>{tr('PDF')}</button>
                          {x.status === S.created && canCreate && (
                            <button type="button" className={s.btn} disabled={busy} onClick={() => { setErr(null); setForm({ mode: 'edit', rec: x }); }}>{tr('Засах')}</button>
                          )}
                          {x.status === S.created && canCreate && scanBtn({ kind: 'doc', rec: x })}
                          {x.status === S.signed && canApprove && (
                            <button type="button" className={s.btn} disabled={busy} onClick={() => void approveNew(x)}>{tr('Баталгаажуулах')}</button>
                          )}
                          {(canCreate || canApprove) && x.status !== S.paid && (
                            <button type="button" className={s.btn} disabled={busy} onClick={() => void removeNew(x)}>{tr('Устгах')}</button>
                          )}
                        </>
                      )}
                      {d && (
                        <>
                          <button type="button" className={s.btn} disabled={busy} onClick={() => void pdf(d)}>{tr('PDF')}</button>
                          {d.status === S.created && canCreate && scanBtn({ kind: 'legacy', d })}
                          {d.status === S.signed && canApprove && (
                            <button type="button" className={s.btn} disabled={busy} onClick={() => void approve(d)}>{tr('Баталгаажуулах')}</button>
                          )}
                          {(canCreate || canApprove) && !deleteWhy(d, pays) && (
                            <button type="button" className={s.btn} disabled={busy} onClick={() => void remove(d)}>{tr('Устгах')}</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>,
                  x.note.trim() ? (
                    <tr key={`${x.src}:${x.oid}:note`} className={s.ipcNoteRow}>
                      <td colSpan={COLS}>{tr('Суутгалын тайлбар: {0}', x.note.trim())}</td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {form && docs != null && (
        <DocForm
          init={form}
          pays={pays}
          recs={recs}
          docs={docs}
          contract={contract}
          busy={busy}
          onCancel={() => setForm(null)}
          onSave={(draft, ctx) => void (form.mode === 'edit' ? save(form.rec, draft) : create(draft, ctx))}
        />
      )}
      <input
        ref={fileEl}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scan(f); }}
      />
      {err && <p className={s.warn} role="alert">{err}</p>}
    </div>
  );
}

/**
 * Гэрээ цуцлах товч — IPC үүссэн, олгосон мөргүй гэрээнд л. `docs` — IPC баримтын хүснэгтийн (238) тэр гэрээний мөрүүд
 * (2026-11-23); уншиж чадаагүй (`null`) бол товч гарахгүй.
 */
export function ContractCancelButton({ code, pays, cfRows, docs }: { code: string; pays: readonly Row[]; cfRows: readonly Row[]; docs: readonly Row[] | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (docs == null || contractCancelWhy(pays, docs)) return null;
  /* Зөвхөн ЭНЭ гэрээний мөрүүд (`planHoSync`-тэй нэг дүрэм) — дугаараар, эсвэл дугааргүй мөрийн багц БА үе шатаар; ижил багцын өөр дугаартай гэрээ хөндөгдөхгүй.
     Цуцлагдсан дугаартай гэрээ дугааргүй мөрийг эзэмшихгүй: тэр нь дахин байгуулсан шинэ гэрээ */
  const parts = [...new Set(pays.flatMap((r) => hoPkgParts(r[HO_IPC.contractFields.pkg])))];
  const phases = phasesOf(pays.map((r) => String(r[HO_IPC.contractFields.workType] ?? '').trim()).find(Boolean) ?? '');
  const nos = new Set(pays.map((r) => String(r[HO_IPC.contractFields.contractNo] ?? '').trim()).filter(Boolean));
  const dead = contractCancelled(pays);
  const rows = cfRows.filter((r) => {
    if (String(r[CF.amountNote] ?? '').trim() !== 'Гэрээлсэн дүн') return false;
    const no = String(r[CF.contractNo] ?? '').trim();
    return no ? nos.has(no) : (!nos.size || !dead) && cfMatches(r, parts, phases);
  });
  /* Бүрэн цуцлагдсан гэрээнд товч алга; хагас цуцлагдсан (182 бичигдээгүй үлдсэн) бол дахин оролдоно */
  if (dead && !rows.length) return null;
  const go = async () => {
    if (!(await askConfirm(tr('«{0}» гэрээг цуцлах уу? Мөрүүд устахгүй, «Цуцлагдсан» төлөвтэй болно. Урьдчилсан төсөвт өртөг өөрчлөгдөхгүй.', code), { ok: tr('Цуцлах'), danger: true }))) return;
    setBusy(true);
    setErr(null);
    try {
      /* 2026-11-18: дарах мөчид сервероос дахин уншина — дэлгэц хуучирсан үед төлбөр нь олгогдсон гэрээг цуцлахгүй */
      const e = contractCancelFresh(await freshPays(code, pays), rows, await freshDocs(code));
      if (!e.ok) {
        setErr(tr('Энэ гэрээнд IPC үүссэн эсвэл төлбөр олгогдсон байна — цуцлах боломжгүй. Хуудсыг шинэчилнэ үү.'));
        invalidate('HO_IPC', 'IPC_DOC');
        return;
      }
      /* IPC эхэлнэ: дараагийн алхам унавал гэрээ «Цуцлагдсан», 182 хэвээр — `planHoSync` давхар гэрээ үүсгэхгүй, товч дахин гарна */
      await applyAll(HO_IPC.url, HO_IPC.oid, { updates: e.ho }, APPROVE_CAP);
      invalidate('HO_IPC');
      try {
        await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: e.cf }, APPROVE_CAP);
      } catch (x) {
        setErr(tr('IPC-ийн мөрүүд цуцлагдсан ч «Төсөл төлөвлөгөө биелэлт»-ийн гэрээний мэдээлэл арилсангүй ({0}). «Гэрээ цуцлах»-ыг дахин дарна уу.', userError(x)));
        return;
      }
      invalidate('CASHFLOW_NEW');
    } catch (x) {
      setErr(userError(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={s.btn} disabled={busy} onClick={() => void go()}>{tr('Гэрээ цуцлах')}</button>
      {err && <p className={s.warn} role="alert">{err}</p>}
    </>
  );
}

type Item = { oid: number; amount: string; advance: string };

/**
 * ГЭРЭЭ ҮҮСГЭХ ЦОНХ — нэг ба олон багцтай гэрээ. Cashflow-д бичээд `hoSync` IPC-ийн гэрээг үүсгэнэ,
 * дараа нь урьдчилгааны баримт багц бүрээр үүснэ (2026-11-23: IPC баримтын хүснэгтэд `Guitsetgel_talbe/238`, төрөл «Урьдчилгаа»).
 */
export function ContractDialog({ cfRows, onClose }: { cfRows: readonly Row[]; onClose: () => void }) {
  const dlgRef = useRef<HTMLDivElement>(null);
  const downBack = useRef(false);
  useFocusTrap(dlgRef);
  const [no, setNo] = useState('');
  const [contractor, setContractor] = useState('');
  const [date, setDate] = useState(today());
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Гэрээ Cashflow-д хадгалагдсан — дахин оролдоход зөвхөн урьдчилгааны алхам явна */
  const [cfSaved, setCfSaved] = useState(false);
  const [cfFirst] = useState(cfRows);
  const options = useMemo(() => cfFirst.filter((r) => String(r[CF.amountNote] ?? '').trim() !== 'Гэрээлсэн дүн' && String(r[CF.pkg] ?? '').trim()), [cfFirst]);
  const rowOf = (oid: number) => cfFirst.find((r) => Number(r[CASHFLOW_NEW.oid]) === oid);
  const toggle = (oid: number) => setItems((xs) => (xs.some((x) => x.oid === oid)
    ? xs.filter((x) => x.oid !== oid)
    : [...xs, { oid, amount: '', advance: '' }]));
  const set = (oid: number, k: 'amount' | 'advance', v: string) => setItems((xs) => xs.map((x) => (x.oid === oid ? { ...x, [k]: v } : x)));
  const sum = items.reduce((a, x) => a + (parseMoney(x.amount) || 0), 0);
  const whyText = (why: ContractWhy): string => (why === 'no-number' ? tr('Гэрээний дугаарыг оруулна уу.')
    : why === 'empty' ? tr('Багц сонгоно уу.')
      : why === 'amount' ? tr('Багц бүрийн гэрээний дүнг зөв оруулна уу.')
        : why === 'advance' ? tr('Урьдчилгааг зөвхөн тоогоор оруулна уу. Жишээ нь 5000000.')
        : why === 'advance-over' ? tr('Урьдчилгаа гэрээний дүнгээс их байж болохгүй.')
          : why === 'taken' ? tr('Сонгосон багц өөр гэрээтэй байна.')
            : tr('Ийм дугаартай гэрээ бүртгэлтэй байна.'));

  const save = async () => {
    setErr(null);
    const c: NewContract = {
      no,
      contractor,
      date,
      items: items.map((x) => ({ row: rowOf(x.oid) as Row, amount: parseMoney(x.amount) ?? 0, advance: parseMoney(x.advance) })),
    };
    const why: ContractWhy | null = cfSaved
      ? (c.items.some((i) => i.advance != null && !(i.advance >= 0)) ? 'advance' : advanceOver(c) ? 'advance-over' : null)
      : contractWhy(c, cfRows);
    if (why) {
      setErr(whyText(why));
      return;
    }
    setBusy(true);
    try {
      if (!cfSaved) {
        /* Цонх нээгдсэний дараа өөр хэрэглэгч багцыг гэрээлсэн эсвэл дугаарыг авсан байж болно — бичихийн өмнө шинээр шалгана */
        const [cfNow, hoNow] = await Promise.all([
          queryFeatures(CASHFLOW_NEW.url, { where: '1=1', outFields: [CASHFLOW_NEW.oid, CF.amountNote, CF.contractNo, CF.contractAmount] }),
          queryFeatures(HO_IPC.url, { outFields: [HO_IPC.oid, HO_IPC.contractFields.contractNo] }),
        ]);
        const nowOf = new Map(cfNow.map((r) => [Number(r[CASHFLOW_NEW.oid]), r] as const));
        /* 2026-11-23 (аудит №15): өмнөх «Хадгалах» бичигдсэн ч хариу алдагдсан — дахин бичихгүй, синк/урьдчилгааны алхмаар үргэлжилнэ */
        const already = contractAlreadySaved(c, cfNow);
        if (!already && c.items.some((i) => !nowOf.has(Number(i.row[CASHFLOW_NEW.oid])))) {
          setErr(tr('Энэ хооронд өөр хэрэглэгч өөрчилсөн байна. Шинэчилсэн мэдээллийг шалгаад дахин оролдоно уу.'));
          return;
        }
        const why2 = already ? null : contractWhy({ ...c, items: c.items.map((i) => ({ ...i, row: { ...i.row, ...nowOf.get(Number(i.row[CASHFLOW_NEW.oid])) } })) }, cfNow, hoNow);
        if (why2) {
          setErr(whyText(why2));
          return;
        }
        if (!already) await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: contractUpdates(c) }, CREATE_CAP);
        setCfSaved(true);
        invalidate('CASHFLOW_NEW');
      }
      /* 2026-11-05 (аудит): явж буй синк сая бичсэн Cashflow мөрийг хараагүй байж болно — дууссаны дараа шинээр */
      const sync = await runHoSyncAfter();
      if (sync.error === 'no-cap') throw new Error(tr('IPC-ийн хүснэгтэд гэрээ үүсгэх эрх алга — «IPC үүсгэх» эсвэл «Санхүү засах» эрх хэрэгтэй.'));
      if (sync.error?.startsWith('disabled:')) throw new Error(tr('IPC-ийн синк түр хаалттай (эрхийн алдаа): {0}. 10 минутын дараа дахин оролдоно уу.', sync.error.slice(10)));
      if (sync.error) throw new Error(sync.error);
      const adv = c.items.filter((i) => (i.advance ?? 0) > 0);
      if (adv.length) {
        const ho = await queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` });
        /* Цуцлагдсан гэрээний мөр биш — урьдчилгаа шинэ гэрээнд очно */
        const head = ho.find((r) => String(r[HO_IPC.contractFields.contractNo] ?? '').trim() === no.trim()
          && String(r[S.field] ?? '').trim() !== S.cancelled);
        const code = String(head?.[HO_IPC.contractFields.code] ?? '').trim();
        if (!code) throw new Error(tr('Гэрээ хадгалагдсан ч IPC-д хараахан үүсээгүй. Цонхыг хаалгүй «Хадгалах»-ыг дахин дарж урьдчилгааг бичнэ үү.'));
        const pays = ho.filter((r) => String(r[HO_IPC.contractFields.code] ?? '').trim() === code);
        /* Дугаар — 185-ын хуучин мөрүүд ба 238-ийн баримтуудын нэг цуваа */
        const docs0 = await freshDocs(code);
        const first = nextDocNo(pays, docs0);
        /* 2026-11-23 (аудит): аль хэдийн урьдчилгааны баримттай багцыг алгасна — дахин «Хадгалах» давхар баримт үүсгэдэг байв */
        const todo = advanceMissing(pays, adv, (i) => String(i.row[CF.pkg] ?? ''))
          .filter((i) => !docs0.some((d) => String(d[IPC_DOC.fields.type] ?? '') === IPC_DOC.types.advance
            && String(d[IPC_DOC.fields.status] ?? '') !== S.cancelled && pkgOf(d[IPC_DOC.fields.pkg]) === pkgOf(i.row[CF.pkg])));
        if (todo.length) await applyAll(IPC_DOC.url, IPC_DOC.oid, {
          adds: todo.map((i, k) => newAdvanceDoc(
            { code, contractNo: no.trim(), contractor: contractor.trim(), pkg: String(i.row[CF.pkg] ?? ''), no: first + k },
            i.advance as number,
            today(),
          )),
        }, CREATE_CAP);
        invalidate('IPC_DOC');
      }
      onClose();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    /* 2026-11-23 (аудит): дарах ба суллах хоёулаа дэвсгэр дээр байвал л хаана — цонхонд текст сонгоод гадна суллахад бичсэн зүйл алга болдог байв */
    <div className={s.dlgBack} role="presentation"
      onMouseDown={(e) => { downBack.current = e.target === e.currentTarget; }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy && !cfSaved) { e.stopPropagation(); onClose(); } }}
      onClick={(e) => { if (downBack.current && e.target === e.currentTarget && !busy && !cfSaved) onClose(); downBack.current = false; }}>
      <div ref={dlgRef} className={s.dlg} role="dialog" aria-modal="true" aria-label={tr('Гэрээ үүсгэх')} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.dlgTitle}>{tr('Гэрээ үүсгэх')}</h3>
        <div className={s.dlgForm}>
          <label>{tr('Гэрээний дугаар')}<input className={s.dlgIn} value={no} onChange={(e) => setNo(e.target.value)} /></label>
          <label>{tr('Гүйцэтгэгч')}<input className={s.dlgIn} value={contractor} onChange={(e) => setContractor(e.target.value)} /></label>
          <label>{tr('Гэрээ байгуулсан огноо')}<input className={s.dlgIn} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className={s.dlgList}>
          <table className={s.pkgTbl}>
            <thead>
              <tr>
                <th aria-label={tr('Сонгох')} />
                <th>{tr('Багц')}</th>
                <th>{tr('Ажлын нэр')}</th>
                <th className={s.pkgNum}>{tr('Гэрээний дүн')}</th>
                <th className={s.pkgNum}>{tr('Урьдчилгаа')}</th>
              </tr>
            </thead>
            <tbody>
              {options.map((r) => {
                const oid = Number(r[CASHFLOW_NEW.oid]);
                const it = items.find((x) => x.oid === oid);
                return (
                  <tr key={oid}>
                    <td><input type="checkbox" aria-label={String(r[CF.pkg] ?? '')} checked={!!it} disabled={cfSaved} onChange={() => toggle(oid)} /></td>
                    <td>{String(r[CF.pkg] ?? '')}</td>
                    <td className={s.dlgName} title={String(r[CF.detail] ?? '')}>{String(r[CF.detail] ?? '')}</td>
                    <td className={s.pkgNum}>
                      {it ? <input className={s.dlgNum} inputMode="decimal" aria-label={tr('Гэрээний дүн')} disabled={cfSaved} value={it.amount} onChange={(e) => set(oid, 'amount', e.target.value)} /> : money(num(r[CF.budget]))}
                    </td>
                    <td className={s.pkgNum}>
                      {it && <input className={s.dlgNum} inputMode="decimal" aria-label={tr('Урьдчилгаа')} value={it.advance} onChange={(e) => set(oid, 'advance', e.target.value)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={s.flowBar}>
          <span>{tr('Гэрээний нийт дүн: {0}', money(sum))}</span>
          {err && <span className={s.warn} role="alert">{err}</span>}
          <button type="button" className={s.btn} disabled={busy} onClick={onClose}>{tr('Болих')}</button>
          <button type="button" className={s.btn} disabled={busy} onClick={() => void save()}>{busy ? tr('Хадгалж байна…') : tr('Хадгалах')}</button>
        </div>
      </div>
    </div>
  );
}

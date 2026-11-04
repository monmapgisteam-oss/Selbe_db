'use client';

/**
 * IPC ҮҮСГЭХ ДАРААЛАЛ · ГЭРЭЭ ҮҮСГЭХ (2026-11-04). Дүрэм нь `lib/ipcFlow.ts`-д (цэвэр, тестлэгдэнэ).
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { mnt } from '@/lib/format';
import { askConfirm } from '@/lib/confirm';
import { invalidate } from '@/lib/dataBus';
import { applyAll } from '@/lib/tableWrite';
import { queryFeatures } from '@/lib/query';
import { currentUser } from '@/lib/who';
import { CASHFLOW_NEW, HO_IPC, num } from '@/lib/services';
import { entUploadPdf } from '@/lib/entDocs';
import { runHoSync } from '@/lib/hoSync/sync';
import { hoPkgParts } from '@/lib/hoSync/compute';
import { userError } from '@/components/ui';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { downloadIpcFlowPdf } from '@/lib/ipcFlowPdf';
import {
  approveIpc, approveWhy, canCancel, contractCancel, contractCancelWhy, contractUpdates, contractWhy, createAdvance, createCancel,
  createIpc, docRows, docTitle, nextIpcNo, overContract, perfRows, perfTotal, signIpc, type IpcDocRow, type NewContract, type PerfRow, type Row,
} from '@/lib/ipcFlow';
import s from './ipcTable.module.css';

const S = HO_IPC.status;
const CF = CASHFLOW_NEW.fields;
const money = (v: number | null | undefined): string => (v == null ? '—' : `${mnt(v)}`);
const today = (): string => new Date().toISOString().slice(0, 10);
const FIN_CAP = { cap: 'finEdit' } as const;
const APPROVE_CAP = { cap: 'ipcApprove' } as const;

/** Төлөвийн нэр — `tr` статик тул нэг бүрчлэн */
const statusText = (st: string): string => {
  if (st === S.created) return tr('IPC үүссэн');
  if (st === S.signed) return tr('Гарын үсэг зурсан');
  if (st === S.paid) return tr('Олгосон');
  if (st === S.cancelled) return tr('Цуцлагдсан');
  return tr('Гүйцэтгэл');
};

/** Картын чекбокс — «Гүйцэтгэл» карт бүрд (2026-11-04: тусдаа хүснэгтгүй, нэг газар) */
export type CardPick = {
  /** Чеклэх боломжтой гүйцэтгэлийн мөр үү (oid-оор) */
  row: (oid: number) => PerfRow | undefined;
  on: (oid: number) => boolean;
  toggle: (oid: number) => void;
  disabled: boolean;
};

/**
 * ГЭРЭЭНИЙ IPC САМБАР — карт дээр гүйцэтгэл чеклэх, IPC үүсгэх, PDF, скан, баталгаажуулах, цуцлах.
 * `children` — төлбөрийн картууд (чекбоксоо `CardPick`-ээс авна).
 */
export function IpcFlowPanel({
  code, contractNo, contractor, pays, contract, paid, canCreate, canApprove, children,
}: {
  code: string;
  contractNo: string;
  contractor: string;
  pays: readonly Row[];
  contract: number | null;
  paid: number | null;
  canCreate: boolean;
  canApprove: boolean;
  children: (pick: CardPick) => ReactNode;
}) {
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sess = useEntSession();
  const fileFor = useRef<IpcDocRow | null>(null);
  const fileEl = useRef<HTMLInputElement>(null);

  const perf = useMemo(() => perfRows(pays), [pays]);
  const docs = useMemo(() => docRows(pays), [pays]);
  const free = useMemo(() => perf.filter((r) => r.status === S.work), [perf]);
  const sel = free.filter((r) => picked.has(r.oid));
  const total = perfTotal(sel);
  const pick: CardPick = {
    row: (oid) => free.find((r) => r.oid === oid),
    on: (oid) => picked.has(oid),
    toggle: (oid) => setPicked((p) => { const n = new Set(p); if (n.has(oid)) n.delete(oid); else n.add(oid); return n; }),
    disabled: !canCreate || busy,
  };

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

  const create = () => run(async () => {
    const e = createIpc(code, pays, sel, today());
    if (typeof e === 'string') { setErr(e === 'pkg' ? tr('Нэг IPC-д нэг багцын гүйцэтгэлийг л сонгоно.') : tr('Сонгоогүй гүйцэтгэлийг чеклэнэ үү.')); return; }
    const warn = [
      ...(sel.some((r) => (r.delta ?? 0) < 0) ? [tr('Сонгосон гүйцэтгэлд дүн буурсан мөр байна.')] : []),
      ...(overContract(paid, total, contract) ? [tr('Энэ IPC-тэй хамт олгосон дүн гэрээний дүнгээс хэтэрнэ.')] : []),
    ];
    const msg = `${tr('{0} багцын {1} гүйцэтгэлээс IPC үүсгэх үү? Дүн: {2}', sel[0]?.pkg ?? '', sel.length, money(total))}${warn.length ? ` ${warn.join(' ')}` : ''}`;
    if (!(await askConfirm(msg, { ok: tr('IPC үүсгэх') }))) return;
    await applyAll(HO_IPC.url, HO_IPC.oid, e, FIN_CAP);
    setPicked(new Set());
    invalidate('HO_IPC');
  });

  const pdf = (d: IpcDocRow) => run(async () => {
    const rows: PerfRow[] = perf.filter((r) => r.ipcNo === d.no);
    await downloadIpcFlowPdf({ code, contractNo, contractor, doc: d, rows });
  });

  const scan = (file: File) => {
    const d = fileFor.current;
    if (!d) return;
    void run(async () => {
      const { item } = await entUploadPdf(file, docTitle(code, d), ['selbe-ipc'], HO_IPC.docFolder);
      await applyAll(HO_IPC.url, HO_IPC.oid, { updates: [signIpc(d, item.id)] }, FIN_CAP);
      invalidate('HO_IPC');
    });
  };

  const approve = (d: IpcDocRow) => run(async () => {
    const why = approveWhy(d, currentUser());
    if (why === 'same-user') { setErr(tr('IPC үүсгэсэн хүн өөрөө баталгаажуулах боломжгүй.')); return; }
    if (why) { setErr(tr('Гарын үсэгтэй сканыг эхлээд оруулна уу.')); return; }
    const q = d.isCancel ? tr('IPC-{0}-ийн цуцлалтыг баталгаажуулах уу?', d.no) : tr('IPC-{0}-г баталгаажуулах уу? {1} олгосон дүнд нэмэгдэнэ.', d.no, money(d.total));
    if (!(await askConfirm(q, { ok: tr('Баталгаажуулах') }))) return;
    await applyAll(HO_IPC.url, HO_IPC.oid, { updates: approveIpc(d, pays) }, APPROVE_CAP);
    invalidate('HO_IPC');
  });

  const cancel = (d: IpcDocRow) => run(async () => {
    if (!(await askConfirm(tr('IPC-{0}-г цуцлах баримт нээх үү? Эх баримт устахгүй.', d.no), { ok: tr('Цуцлалт нээх'), danger: true }))) return;
    await applyAll(HO_IPC.url, HO_IPC.oid, { adds: [createCancel(code, d, today())] }, APPROVE_CAP);
    invalidate('HO_IPC');
  });

  return (
    <div className={s.flow}>
      {canCreate && free.length > 0 && (
        <div className={s.flowBar}>
          <span>{tr('Чеклэсэн гүйцэтгэлийн нийлбэр: {0}', money(total))}</span>
          <button type="button" className={s.btn} disabled={busy || !sel.length} onClick={() => void create()}>{tr('IPC үүсгэх')}</button>
        </div>
      )}
      {children(pick)}
      {docs.length > 0 && (
        <div className={s.pkgScroll}>
          <h4 className={s.dGrpTitle}>{tr('IPC БАРИМТ')}</h4>
          <table className={s.pkgTbl}>
            <thead>
              <tr>
                <th>{tr('Баримт')}</th>
                <th>{tr('Багц')}</th>
                <th>{tr('Огноо')}</th>
                <th className={s.pkgNum}>{tr('Дүн')}</th>
                <th>{tr('Төлөв')}</th>
                <th aria-label={tr('Үйлдэл')} />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.oid}>
                  <td>
                    {d.isCancel ? tr('Цуцлалт') : d.advance ? tr('Урьдчилгаа') : tr('IPC')}
                    {' '}{String(d.no).padStart(2, '0')}
                  </td>
                  <td>{d.pkg}</td>
                  <td>{d.day}</td>
                  <td className={s.pkgNum}>{money(d.total)}</td>
                  <td>{statusText(d.status)}</td>
                  <td className={s.flowAct}>
                    <button type="button" className={s.btn} disabled={busy} onClick={() => void pdf(d)}>{tr('PDF')}</button>
                    {d.status === S.created && canCreate && (
                      sess ? (
                        <button type="button" className={s.btn} disabled={busy} onClick={() => { fileFor.current = d; fileEl.current?.click(); }}>
                          {tr('Скан оруулах')}
                        </button>
                      ) : <EntSignIn compact />
                    )}
                    {d.status === S.signed && canApprove && (
                      <button type="button" className={s.btn} disabled={busy} onClick={() => void approve(d)}>{tr('Баталгаажуулах')}</button>
                    )}
                    {canApprove && canCancel(d, docs) && (
                      <button type="button" className={s.btn} disabled={busy} onClick={() => void cancel(d)}>{tr('Цуцлах')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

/** Гэрээ цуцлах товч — IPC үүссэн, олгосон мөргүй гэрээнд л */
export function ContractCancelButton({ code, pays, cfRows }: { code: string; pays: readonly Row[]; cfRows: readonly Row[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (contractCancelWhy(pays)) return null;
  const go = async () => {
    if (!(await askConfirm(tr('«{0}» гэрээг цуцлах уу? Мөрүүд устахгүй, «Цуцлагдсан» төлөвтэй болно. Урьдчилсан төсөвт өртөг өөрчлөгдөхгүй.', code), { ok: tr('Цуцлах'), danger: true }))) return;
    setBusy(true);
    setErr(null);
    try {
      const parts = new Set(pays.flatMap((r) => hoPkgParts(r[HO_IPC.contractFields.pkg])));
      const nos = new Set(pays.map((r) => String(r[HO_IPC.contractFields.contractNo] ?? '').trim()).filter(Boolean));
      const rows = cfRows.filter((r) => String(r[CF.amountNote] ?? '').trim() === 'Гэрээлсэн дүн'
        && (nos.has(String(r[CF.contractNo] ?? '').trim()) || parts.has(hoPkgParts(r[CF.pkg])[0] ?? '')));
      const e = contractCancel(pays, rows);
      await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: e.cf }, APPROVE_CAP);
      await applyAll(HO_IPC.url, HO_IPC.oid, { updates: e.ho }, APPROVE_CAP);
      invalidate('CASHFLOW_NEW');
      invalidate('HO_IPC');
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

const parseNum = (t: string): number | null => {
  const v = t.replace(/[\s,]/g, '');
  if (!v) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
};

/**
 * ГЭРЭЭ ҮҮСГЭХ ЦОНХ — нэг ба олон багцтай гэрээ. Cashflow-д бичээд `hoSync` IPC-ийн гэрээг үүсгэнэ,
 * дараа нь урьдчилгааны баримт багц бүрээр үүснэ.
 */
export function ContractDialog({ cfRows, onClose }: { cfRows: readonly Row[]; onClose: () => void }) {
  const [no, setNo] = useState('');
  const [contractor, setContractor] = useState('');
  const [date, setDate] = useState(today());
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = useMemo(() => cfRows.filter((r) => String(r[CF.amountNote] ?? '').trim() !== 'Гэрээлсэн дүн' && String(r[CF.pkg] ?? '').trim()), [cfRows]);
  const rowOf = (oid: number) => cfRows.find((r) => Number(r[CASHFLOW_NEW.oid]) === oid);
  const toggle = (oid: number) => setItems((xs) => (xs.some((x) => x.oid === oid)
    ? xs.filter((x) => x.oid !== oid)
    : [...xs, { oid, amount: '', advance: '' }]));
  const set = (oid: number, k: 'amount' | 'advance', v: string) => setItems((xs) => xs.map((x) => (x.oid === oid ? { ...x, [k]: v } : x)));
  const sum = items.reduce((a, x) => a + (parseNum(x.amount) || 0), 0);

  const save = async () => {
    setErr(null);
    const c: NewContract = {
      no,
      contractor,
      date,
      items: items.map((x) => ({ row: rowOf(x.oid) as Row, amount: parseNum(x.amount) ?? 0, advance: parseNum(x.advance) })),
    };
    const why = contractWhy(c, cfRows);
    if (why) {
      setErr(why === 'no-number' ? tr('Гэрээний дугаарыг оруулна уу.')
        : why === 'empty' ? tr('Багц сонгоно уу.')
          : why === 'amount' ? tr('Багц бүрийн гэрээний дүнг зөв оруулна уу.')
            : why === 'taken' ? tr('Сонгосон багц өөр гэрээтэй байна.')
              : tr('Ийм дугаартай гэрээ бүртгэлтэй байна.'));
      return;
    }
    setBusy(true);
    try {
      await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: contractUpdates(c) }, FIN_CAP);
      invalidate('CASHFLOW_NEW');
      await runHoSync();
      const adv = c.items.filter((i) => (i.advance ?? 0) > 0);
      if (adv.length) {
        const ho = await queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` });
        const head = ho.find((r) => String(r[HO_IPC.contractFields.contractNo] ?? '').trim() === no.trim());
        const code = String(head?.[HO_IPC.contractFields.code] ?? '').trim();
        if (!code) throw new Error(tr('IPC-д гэрээ үүссэнгүй. Урьдчилгааг дараа оруулна уу.'));
        const pays = ho.filter((r) => String(r[HO_IPC.contractFields.code] ?? '').trim() === code);
        const first = nextIpcNo(pays);
        await applyAll(HO_IPC.url, HO_IPC.oid, {
          adds: adv.map((i, k) => createAdvance(code, String(i.row[CF.pkg] ?? ''), i.advance as number, first + k, today())),
        }, FIN_CAP);
        invalidate('HO_IPC');
      }
      onClose();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.dlgBack} role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <div className={s.dlg} role="dialog" aria-modal="true" aria-label={tr('Гэрээ үүсгэх')} onClick={(e) => e.stopPropagation()}>
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
                    <td><input type="checkbox" aria-label={String(r[CF.pkg] ?? '')} checked={!!it} onChange={() => toggle(oid)} /></td>
                    <td>{String(r[CF.pkg] ?? '')}</td>
                    <td className={s.dlgName} title={String(r[CF.detail] ?? '')}>{String(r[CF.detail] ?? '')}</td>
                    <td className={s.pkgNum}>
                      {it ? <input className={s.dlgNum} inputMode="decimal" aria-label={tr('Гэрээний дүн')} value={it.amount} onChange={(e) => set(oid, 'amount', e.target.value)} /> : money(num(r[CF.budget]))}
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

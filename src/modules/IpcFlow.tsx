'use client';

/**
 * IPC ҮҮСГЭХ ДАРААЛАЛ · ГЭРЭЭ ҮҮСГЭХ (2026-11-04). Дүрэм нь `lib/ipcFlow.ts`-д (цэвэр, тестлэгдэнэ).
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { dayKey, mnt } from '@/lib/format';
import { askConfirm } from '@/lib/confirm';
import { invalidate } from '@/lib/dataBus';
import { applyAll } from '@/lib/tableWrite';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, CF_MONTH, HO_IPC, num } from '@/lib/services';
import { contractCancelled } from '@/lib/ipc';
import { entDeletePdf, entSession, entUploadPdf } from '@/lib/entDocs';
import { runHoSyncAfter } from '@/lib/hoSync/sync';
import { cfMatches, hoPkgParts, phasesOf } from '@/lib/hoSync/compute';
import { userError } from '@/components/ui';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { downloadIpcFlowPdf } from '@/lib/ipcFlowPdf';
import {
  approveIpc, approveWhy, contractCancel, contractCancelWhy, contractUpdates, contractWhy, createAdvance, deleteIpc, deleteWhy,
  createIpc, docRows, docTitle, dupDocNos, nextIpcNo, overContract, parseMoney, perfRows, perfTotal, signIpc, type ContractWhy, type IpcDocRow, type NewContract, type PerfRow, type Row,
} from '@/lib/ipcFlow';
import s from './ipcTable.module.css';

const S = HO_IPC.status;
const CF = CASHFLOW_NEW.fields;
const money = (v: number | null | undefined): string => (v == null ? '—' : `${mnt(v)}`);
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

  const changed = () => {
    setPicked(new Set());
    invalidate('HO_IPC');
    setErr(tr('Энэ хооронд өөр хэрэглэгч өөрчилсөн байна. Шинэчилсэн мэдээллийг шалгаад дахин оролдоно уу.'));
  };

  const create = () => run(async () => {
    const e = createIpc(code, pays, sel, today());
    if (typeof e === 'string') { setErr(e === 'pkg' ? tr('Нэг IPC-д нэг багцын гүйцэтгэлийг л сонгоно.') : tr('Сонгоогүй гүйцэтгэлийг чеклэнэ үү.')); return; }
    const warn = [
      ...(sel.some((r) => (r.delta ?? 0) < 0) ? [tr('Сонгосон гүйцэтгэлд дүн буурсан мөр байна.')] : []),
      ...(sel.some((r) => r.une == null) ? [tr('Сонгосон гүйцэтгэлд дүнгүй мөр байна. Нэгж үнийг бөглөхгүй бол тэр ажил IPC дүнд орохгүй.')] : []),
      ...(overContract(paid, total, contract) ? [tr('Энэ IPC-тэй хамт олгосон дүн гэрээний дүнгээс хэтэрнэ.')] : []),
    ];
    const msg = `${tr('{0} багцын {1} гүйцэтгэлээс IPC үүсгэх үү? Дүн: {2}', sel[0]?.pkg ?? '', sel.length, money(total))}${warn.length ? ` ${warn.join(' ')}` : ''}`;
    if (!(await askConfirm(msg, { ok: tr('IPC үүсгэх') }))) return;
    const fresh = await freshPays(code, pays);
    const sel2 = perfRows(fresh).filter((r) => r.status === S.work && picked.has(r.oid));
    const e2 = sel2.length === sel.length && perfTotal(sel2) === total ? createIpc(code, fresh, sel2, today()) : null;
    if (!e2 || typeof e2 === 'string') { changed(); return; }
    await applyAll(HO_IPC.url, HO_IPC.oid, e2, CREATE_CAP);
    setPicked(new Set());
    invalidate('HO_IPC');
    /* Хоёр хэрэглэгч зэрэг үүсгэвэл нэг дугаар авч болно (сервер давхардлыг хорихгүй) — мөр устгахгүй, ил хэлнэ */
    const no = Number(e2.adds[0][HO_IPC.payFields.ipcNo]);
    /* IPC аль хэдийн бичигдсэн: энэ уншилт унавал «алдаа» гэж хэлэхгүй */
    const after = await freshPays(code, pays).catch(() => null);
    if (after && dupDocNos(after).includes(no)) {
      setErr(tr('IPC-{0} дугаартай өөр баримт зэрэг үүссэн байна. Баталгаажуулахаас өмнө админд мэдэгдэнэ үү.', no));
    }
  });

  const pdf = (d: IpcDocRow) => run(async () => {
    const rows: PerfRow[] = perf.filter((r) => r.ipcNo === d.no);
    await downloadIpcFlowPdf({ code, contractNo, contractor, doc: d, rows });
  });

  const scan = (file: File) => {
    const d = fileFor.current;
    if (!d) return;
    void run(async () => {
      /* Дэлгэцийн мөр хуучирсан байж болно — баталгаажсан баримтын төлөвийг буцаахгүй */
      const d2 = docRows(await freshPays(code, pays)).find((x) => x.oid === d.oid);
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
    await applyAll(HO_IPC.url, HO_IPC.oid, { updates: approveIpc(d2, fresh) }, APPROVE_CAP);
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
        const owner = entSession()?.user;
        if (owner) await entDeletePdf(d2.docItem, owner);
      } catch (e) {
        setErr(tr('Баримт устсан ч скан файл устсангүй ({0}). Баримт бичгийн сангаас гараар устгана уу.', userError(e)));
      }
    }
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
                    {d.advance ? tr('Урьдчилгаа') : tr('IPC')}
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
                    {(canCreate || canApprove) && !deleteWhy(d, pays) && (
                      <button type="button" className={s.btn} disabled={busy} onClick={() => void remove(d)}>{tr('Устгах')}</button>
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
      const e = contractCancel(pays, rows);
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
 * дараа нь урьдчилгааны баримт багц бүрээр үүснэ.
 */
export function ContractDialog({ cfRows, onClose }: { cfRows: readonly Row[]; onClose: () => void }) {
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
    const why: ContractWhy | null = cfSaved ? (c.items.some((i) => i.advance != null && !(i.advance >= 0)) ? 'advance' : null) : contractWhy(c, cfRows);
    if (why) {
      setErr(whyText(why));
      return;
    }
    setBusy(true);
    try {
      if (!cfSaved) {
        /* Цонх нээгдсэний дараа өөр хэрэглэгч багцыг гэрээлсэн эсвэл дугаарыг авсан байж болно — бичихийн өмнө шинээр шалгана */
        const [cfNow, hoNow] = await Promise.all([
          queryFeatures(CASHFLOW_NEW.url, { where: `${CF_MONTH.start} IS NULL`, outFields: [CASHFLOW_NEW.oid, CF.amountNote, CF.contractNo] }),
          queryFeatures(HO_IPC.url, { outFields: [HO_IPC.oid, HO_IPC.contractFields.contractNo] }),
        ]);
        const nowOf = new Map(cfNow.map((r) => [Number(r[CASHFLOW_NEW.oid]), r] as const));
        if (c.items.some((i) => !nowOf.has(Number(i.row[CASHFLOW_NEW.oid])))) {
          setErr(tr('Энэ хооронд өөр хэрэглэгч өөрчилсөн байна. Шинэчилсэн мэдээллийг шалгаад дахин оролдоно уу.'));
          return;
        }
        const why2 = contractWhy({ ...c, items: c.items.map((i) => ({ ...i, row: { ...i.row, ...nowOf.get(Number(i.row[CASHFLOW_NEW.oid])) } })) }, cfNow, hoNow);
        if (why2) {
          setErr(whyText(why2));
          return;
        }
        await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: contractUpdates(c) }, CREATE_CAP);
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
        const first = nextIpcNo(pays);
        await applyAll(HO_IPC.url, HO_IPC.oid, {
          adds: adv.map((i, k) => createAdvance(code, String(i.row[CF.pkg] ?? ''), i.advance as number, first + k, today())),
        }, CREATE_CAP);
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
    <div className={s.dlgBack} role="presentation" onClick={() => { if (!busy && !cfSaved) onClose(); }}>
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

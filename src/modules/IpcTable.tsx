'use client';

/**
 * IPC — ОЛГОСОН САНХҮҮЖИЛТ, ГЭРЭЭГЭЭР БҮЛЭГЛЭСЭН УНШИГДАХУЙЦ ХАРАГДАЦ.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { phasesOf } from '@/lib/hoSync/compute';
import { groupByRegistry } from '@/lib/ipcZurag';
import { loadZuragBurtgel } from '@/lib/zuragBurtgel';
import { HO_IPC, IPC_DOC } from '@/lib/services';
import { hoSyncErrorText, hoUnassignedText, subscribeHoSync } from '@/lib/hoSync/sync';
import { t as tr } from '@/lib/i18nCore';
import { mnt, MNT_DEC, num, pct, dayKey } from '@/lib/format';
import {
  contractBlocks, anyObyem, sortBlocks, ipcTotals, payCount, ipcHeadShare, packageRows,
  type ContractBlock, type Detail, type PackageRow, type PayRow, type SortKey,
} from '@/lib/ipcTable';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import { useAsync } from '@/lib/useAsync';
import { loadFinance } from '@/lib/reportData';
import { paidPctOf } from '@/lib/paidShare';
import type { HoContract } from '@/lib/ipc';
import { useTip } from '@/components/ui';
import { IpcFlowPanel, ContractCancelButton, ContractDialog } from './IpcFlow';
import { loadIpcDocs } from '@/lib/ipcDocRows';
import { isAuto } from '@/lib/ipcAuto';
import { statusOf } from '@/lib/ipcFlow';
import { useAuth } from '@/components/AuthGate';
import { hasCap } from '@/lib/caps';
import s from './ipcTable.module.css';

const money = (v: number | null): string => {
  if (v == null) return '—';
  if (v === 0) return `${num(0, MNT_DEC)} ₮`; // 2026-11-23: мөнгө ҮРГЭЛЖ 2 аравтын оронтой («0.00 ₮»)
  return mnt(v);
};

/** Обьём — нэгж холилдсон тул тоог нь л харуулна (₮ БИШ) */
const vol = (v: number | null): string => (v == null ? '—' : num(Math.round(v)));

/** Түүхий утгыг тоо руу — тоо биш бол `null`. `0` нь ЖИНХЭНЭ тэг. */
const num2 = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * ТӨЛБӨРИЙН ОГНОО — `YYYY-MM-DD`.
 */
const payDate = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return dayKey(v);
  }
  const s2 = String(v);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s2.trim());
  return m ? m[1] : s2;
};

/* ─────────────────────── БҮЛГИЙН ТОЛГОЙ ─────────────────────── */

function Head({
  b, open, onToggle,
}: {
  b: ContractBlock;
  open: boolean;
  onToggle: () => void;
}) {
  const p = b.paidPct;
  const tip = useTip();
  return (
    <>
    <button
      type="button"
      className={s.gBtn}
      onClick={onToggle}
      aria-expanded={open}
    >
          <span className={s.caret} aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className={s.gTitle}>{b.title}</span>
          <span className={s.gMeta}>{b.contractor || '—'}</span>
          <span className={s.gCount}>
            {tr('{0} төлбөр', num(payCount(b.rows)))}
          </span>
          <span className={s.gSpacer} />
          <span className={s.gSum}>
            <span className={s.gSumLbl}>{tr('гэрээт')}</span>
            {money(b.contractTotal)}
          </span>
          <span className={s.gSum}>
            <span className={s.gSumLbl}>{tr('олгосон')}</span>
            {money(b.paidTotal)}
          </span>
          <span
            className={s.gPct}
            {...tip.bind({
              label: b.title,
              value: pct(p),
              hint: `${tr('олгосон')} ${money(b.paidTotal)} / ${tr('гэрээт')} ${money(b.contractTotal)}`,
            })}
          >
            {p == null ? (
              <span className={s.gPctNone}>—</span>
            ) : (
              <>
                <span className={`${s.gPctNum} num`}>{pct(p)}</span>
                <span className={s.bar} aria-hidden="true">
                  <span
                    className={s.barIn}
                    style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
                  />
                </span>
              </>
            )}
          </span>
    </button>
    {tip.node}
    </>
  );
}

/* ─────────────────────── ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ ─────────────────────── */

/**
 * Гэрээний бүх үлдсэн талбар — дэлгэсэн бүлгийн ЭХНИЙ мөрөнд.
 */
function Details({ b }: { b: ContractBlock }) {
  const fmt = (d: Detail): string => {
    if (d.kind === 'money') return money(num2(d.value));
    if (d.kind === 'date') return payDate(d.value);
    return String(d.value);
  };
  /** Нэг бүлгийн тодорхойлолтын жагсаалт */
  const Rows = ({ items }: { items: readonly Detail[] }) => (
    <dl className={s.dl}>
      {items.map((d) => (
        <div className={s.dItem} key={d.field}>
          <dt className={s.dt}>{d.label ?? finFieldLabel(d.field)}</dt>
          <dd className={`${s.dd} ${d.kind === 'money' ? s.ddNum : ''}`}>
            {fmt(d)}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className={s.dCell}>
        <div className={s.dCols}>
          {b.details.map((g) => (
            <section className={s.dGrp} key={g.title}>
              <h4 className={s.dGrpTitle}>{g.title}</h4>
              <Rows items={g.items} />
            </section>
          ))}
          <section className={s.dGrp}>
            <h4 className={s.dGrpTitle}>{tr('ОЛГОЛТ')}</h4>
            <dl className={s.dl}>
              <div className={s.dItem}>
                <dt className={s.dt}>{tr('Урьдчилгаа төлбөр — нийт')}</dt>
                <dd className={`${s.dd} ${s.ddNum}`}>{money(b.advanceTotal)}</dd>
              </div>
              <div className={s.dItem}>
                <dt className={s.dt}>{tr('Гүйцэтгэлийн төлбөр — нийт')}</dt>
                <dd className={`${s.dd} ${s.ddNum}`}>{money(b.workTotal)}</dd>
              </div>
            </dl>
          </section>
        </div>
        {b.savingMismatch && (
          <p className={s.warn}>
            {tr('⚠️ Хадгалагдсан «Хэмнэлт / хэтрэлт» нь төсөв − гэрээт төсвийн зөрүүтэй таарахгүй байна — эх өгөгдлийг шалгана уу.')}
          </p>
      )}
    </div>
  );
}

/**
 * ОЛОН БАГЦТАЙ ГЭРЭЭНИЙ БАГЦ БҮРИЙН ЗАДАРГАА — утга нь «Төсөл төлөвлөгөө биелэлт»-ээс.
 */
function PackageTable({ rows }: { rows: readonly PackageRow[] }) {
  if (rows.length < 2) return null;
  const COLS: { k: keyof PackageRow; label: string }[] = [
    { k: 'contract', label: tr('Гэрээний дүн') },
    { k: 'order', label: tr('Захирамжийн дүн') },
    { k: 'paid', label: tr('Олгосон дүн') },
  ];
  const total = (k: keyof PackageRow): number | null => {
    let s: number | null = null;
    for (const r of rows) { const v = r[k]; if (typeof v === 'number') s = (s ?? 0) + v; }
    return s;
  };
  return (
    <div className={s.pkgWrap}>
      <h4 className={s.dGrpTitle}>{tr('БАГЦ БҮРИЙН ЗАДАРГАА')}</h4>
      <div className={s.pkgScroll}>
        <table className={s.pkgTbl}>
          <thead>
            <tr>
              <th>{tr('Багц')}</th>
              {COLS.map((c) => <th key={c.k} className={s.pkgNum}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.pkg}</td>
                {COLS.map((c) => <td key={c.k} className={s.pkgNum}>{money(r[c.k] as number | null)}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>{tr('Нийт')}</th>
              {COLS.map((c) => <th key={c.k} className={s.pkgNum}>{money(total(c.k))}</th>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────── ТӨЛБӨРИЙН КАРТ ─────────────────────── */

/**
 * НЭГ ТӨЛБӨР = НЭГ КАРТ.
 */
/**
 * Картын нэг мөр.
 */
function Line({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className={s.kv}>
      <span className={s.k}>{k}</span>
      <span className={`${s.v} ${cls ?? ''}`}>{v}</span>
    </div>
  );
}

/* 2026-11-23 (хэрэглэгч): бөглөлт бүрээр карт/чекбокс БИШ — төлөгдөөгүй бөглөлт IPC самбарт нийлбэрээр харагдана */
function PayCard({ r }: { r: PayRow }) {
  return (
    <article className={`${s.card} ${r.advance ? s.cardAdv : ''}`}>
      {/* ── ТОЛГОЙ: IPC дугаар + ХУГАЦАА ── */}
      <header className={s.cardHd}>
        <span className={r.advance ? s.tagAdv : s.tagIpc}>{r.code}</span>
        <span className={s.cardDate}>
          {r.date != null && r.date !== ''
            ? payDate(r.date)
            : (r.year == null ? '—' : String(r.year))}
        </span>
      </header>

      <div className={s.cardBody}>
        {/* ── БАРИМТ ── */}
        <Line k={tr('Захирамж')} v={r.orderNo || '—'} />

        {/* ── БОДИТ ГҮЙЦЭТГЭЛ ── */}
        <div className={s.sep} />
        <h5 className={s.sect}>{tr('Бодит гүйцэтгэл')}</h5>
        <Line k={tr('Обьём')} v={vol(r.obyem)} />
        <Line k={tr('Мөнгөн дүн')} v={money(r.une)} />
        {/* 2026-11-04: нэг IPC = нэг карт — олгосон гүйцэтгэлийн өдрүүд энд */}
        {r.days.length > 0 && <Line k={tr('Гүйцэтгэлийн өдөр')} v={r.days.join(', ')} />}
        {(r.une ?? 0) < 0 && <Line k={tr('Анхааруулга')} v={tr('дүн сөрөг')} cls={s.over} />}

        {/* ── ОЛГОЛТ ── картын ГОЛ тоо, томоор */}
        <div className={s.sep} />
        <div className={s.big}>
          <span className={s.bigLbl}>{tr('Олгосон')}</span>
          <span className={s.bigNum}>{money(r.amount)}</span>
        </div>
        <Line
          k={tr('Зөрүү')}
          v={money(r.zoruu)}
          cls={r.zoruu == null ? '' : r.zoruu > 0 ? s.over : s.under}
        />
      </div>

      <footer className={s.cardFt}>{r.id}</footer>
    </article>
  );
}

/**
 * Картууд — олгоогүй бөглөлтийн AUTO мөр (төлөв «Гүйцэтгэл» · «IPC үүссэн» · «Гарын үсэг зурсан») карт болохгүй: төлөгдөөгүй нь
 * IPC самбарт нийлбэрээр, IPC-д орсон нь IPC баримтын мөрөөр харагдана (2026-11-23). Олгосон бөглөлт төлбөрийн картад нийлсэн хэвээр.
 */
const HIDDEN_FILL: readonly string[] = [HO_IPC.status.work, HO_IPC.status.created, HO_IPC.status.signed];
function cardRows(b: ContractBlock): PayRow[] {
  const hide = new Set(b.pays.filter((r) => isAuto(r) && HIDDEN_FILL.includes(statusOf(r))).map((r) => Number(r[HO_IPC.oid])));
  return b.rows.filter((r) => r.oid == null || !hide.has(r.oid));
}

export function IpcTable({ contracts, cfRows = [] }: { contracts: HoContract[]; cfRows?: readonly Record<string, unknown>[] }) {
  const [sort, setSort] = useState<SortKey>('paid');
  /** Хаагдсан бүлгүүд — анхдагчаар БҮГД НЭЭЛТТЭЙ */
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [newContract, setNewContract] = useState(false);
  const unassigned = useSyncExternalStore(subscribeHoSync, hoUnassignedText, () => '');
  /* 2026-11-05 (аудит №3): HO ← Cashflow синкийн алдаа — урьд нь зөвхөн console; олгосон дүн 182-т хоцорсныг хэн ч мэддэггүй байв */
  const syncErr = useSyncExternalStore(subscribeHoSync, hoSyncErrorText, () => '');
  const { user } = useAuth();
  const canCreate = hasCap(user?.username, 'ipcCreate');
  const canApprove = hasCap(user?.username, 'ipcApprove');

  const blocks = useMemo(() => contractBlocks(contracts), [contracts]);
  const sorted = useMemo(() => sortBlocks(blocks, sort), [blocks, sort]);
  const showObyem = useMemo(() => anyObyem(blocks), [blocks]);
  const t = useMemo(() => ipcTotals(blocks), [blocks]);
  const finQ = useAsync(() => loadFinance(), []);
  /* 2026-11-23: IPC баримтын хүснэгт (`Guitsetgel_talbe/238`) — гэрээний кодоор */
  const docsQ = useAsync(loadIpcDocs, []);
  const docsBy = useMemo(() => {
    const m = new Map<string, Record<string, unknown>[]>();
    if (docsQ.state !== 'ready') return m;
    for (const r of docsQ.data) {
      const c = String(r[IPC_DOC.fields.code] ?? '').trim();
      if (c) m.set(c, [...(m.get(c) ?? []), r]);
    }
    return m;
  }, [docsQ.state, docsQ.data]);
  const docsOf = (code: string): readonly Record<string, unknown>[] | null => (docsQ.state === 'ready' ? docsBy.get(code) ?? [] : null);
  const head = useMemo(() => ipcHeadShare(t, finQ.state === 'ready'
    ? {
      contract: finQ.data.contractAmount,
      pct: finQ.data.paid == null ? null : finQ.data.paidPct ?? paidPctOf(finQ.data.paidContracted, finQ.data.contractAmount),
      paidOther: finQ.data.paidOther,
    }
    : null), [t, finQ.state, finQ.data]);
  const keyMap = useMemo(() => {
    const m = new Map<ContractBlock, string>();
    const seen = new Map<string, number>();
    for (const b of blocks) {
      const oids = b.rows.map((r) => r.oid).filter((x): x is number => x != null);
      const base = b.code ? `c:${b.code}` : b.contractNo ? `n:${b.contractNo}` : oids.length ? `o:${Math.min(...oids)}` : `i:${b.rows[0]?.id ?? ''}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      m.set(b, n ? `${base}#${n}` : base);
    }
    return m;
  }, [blocks]);
  const keyOf = (b: ContractBlock) => keyMap.get(b) ?? `?:${b.code}`;
  const liveKeys = useMemo(() => new Set(keyMap.values()), [keyMap]);
  const prune = (p: Set<string>) => new Set([...p].filter((k) => liveKeys.has(k)));

  /* 2026-11-17 (хэрэглэгч: «орох нь зөв, гэхдээ Зураг гэдэг бүлгээр орох ёстой») — ТЭЗҮ · зураг төслийн гэрээнүүд (зургийн
     бүртгэлийн баримт бүр нэг мөр) барилгын гэрээнүүдтэй холилдохгүй: жагсаалтын төгсгөлд нэг хураагддаг бүлэг, анхдагчаар хураалттай */
  /* 2026-11-23 (хэрэглэгч: «багцууд ба зургийн дүнг 2 тусдаа товч болгож тус бүрийн нийлбэр, бүгдийн нийлбэрийг харуул»):
     жагсаалт нэг удаад нэг бүлгийг харуулна — «Багцууд» (барилга угсралт · ГИШС) эсвэл «Зураг» (ТЭЗҮ · зураг төсөл) */
  const [tab, setTab] = useState<'build' | 'design'>('build');
  /* Дотроо — Зургийн бүртгэлийн бүлэг → дэд бүлгээр (хэрэглэгч: «зураг дотроо бүлэглэхгүй юм уу»); нээсэн бүлгүүд */
  const [zShown, setZShown] = useState<ReadonlySet<string>>(() => new Set());
  const zFlip = (k: string) => setZShown((q) => { const n = new Set(q); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const zQ = useAsync(loadZuragBurtgel, []);
  const isDesign = (b: ContractBlock) => phasesOf(b.workType).includes('ТЭЗҮ');
  const build = useMemo(() => sorted.filter((b) => !isDesign(b)), [sorted]);
  const design = useMemo(() => sorted.filter(isDesign), [sorted]);
  const dTree = useMemo(() => {
    const f = (b: ContractBlock, k: string) => String(b.pays.map((r) => r[k]).find((v) => v != null && String(v).trim() !== '') ?? '');
    return groupByRegistry(design, zQ.state === 'ready' ? zQ.data : [], (b) => f(b, HO_IPC.contractFields.project), (b) => f(b, HO_IPC.contractFields.pkg) || b.title);
  }, [design, zQ.state, zQ.data]);
  const sumOf = (bs: readonly ContractBlock[]) => tr('{0} гэрээ · гэрээт {1} · олгосон {2}', num(bs.length),
    money(bs.reduce((a, b) => a + (b.contractTotal ?? 0), 0)), money(bs.reduce((a, b) => a + (b.paidTotal ?? 0), 0)));
  /** «Зураг» бүлгийн дотоод толгой + (нээлттэй бол) агуулга */
  const zSect = (k: string, label: string, bs: readonly ContractBlock[], body: () => React.ReactNode) => (
    <section className={s.blk} key={k}>
      <button type="button" className={s.gBtn} onClick={() => zFlip(k)} aria-expanded={zShown.has(k)}>
        <span className={s.caret} aria-hidden="true">{zShown.has(k) ? '▾' : '▸'}</span>
        <span className={s.gTitle}>{label}</span>
        <span className={s.gCount}>{sumOf(bs)}</span>
      </button>
      {zShown.has(k) && <div className={s.zGrp}>{body()}</div>}
    </section>
  );
  const totalOf = (bs: readonly ContractBlock[]) => ({
    n: bs.length,
    contract: bs.reduce((a, b) => a + (b.contractTotal ?? 0), 0),
    paid: bs.reduce((a, b) => a + (b.paidTotal ?? 0), 0),
  });
  const dSum = useMemo(() => totalOf(design), [design]);
  const bSum = useMemo(() => totalOf(build), [build]);
  const allSum = { n: bSum.n + dSum.n, contract: bSum.contract + dSum.contract, paid: bSum.paid + dSum.paid };
  const sumLine = (x: { n: number; contract: number; paid: number }) =>
    tr('{0} гэрээ · гэрээт {1} · олгосон {2}', num(x.n), money(x.contract), money(x.paid));

  const allShut = sorted.every((b) => shut.has(keyOf(b)));
  const toggleAll = () => {
    setShut(allShut ? new Set() : new Set(sorted.map((b) => keyOf(b))));
  };

  const block = (b: ContractBlock) => {
    const k = keyOf(b);
      const open = !shut.has(k);
      return (
        <section className={s.blk} key={k}>
          <Head
            b={b}
            open={open}
            onToggle={() => setShut((p) => {
              const n = prune(p);
              if (n.has(k)) n.delete(k); else n.add(k);
              return n;
            })}
          />
          {open && (
            <>
              <Details b={b} />
              <PackageTable rows={packageRows(b, cfRows)} />
              <IpcFlowPanel
                code={b.code}
                contractNo={b.contractNo}
                contractor={b.contractor}
                project={String(b.pays.map((r) => r[HO_IPC.contractFields.project]).find((v) => v != null && String(v).trim() !== '') ?? '')}
                pays={b.pays}
                docs={docsOf(b.code)}
                contract={b.contractTotal}
                paid={b.paidTotal}
                canCreate={canCreate}
                canApprove={canApprove}
              >
                <div className={s.cards}>
                  {cardRows(b).map((r) => <PayCard key={`${k}|${r.oid ?? r.id}`} r={r} />)}
                </div>
              </IpcFlowPanel>
              {canApprove && b.code && <div className={s.flowBar}><ContractCancelButton code={b.code} pays={b.pays} cfRows={cfRows} docs={docsOf(b.code)} /></div>}
            </>
          )}
        </section>
      );
  };

  return (
    <section className={s.wrap}>
      <header className={s.hd}>
        <div className={s.hdL}>
          <h3 className={s.title}>{tr('Олгосон санхүүжилт — гэрээгээр')}</h3>
          <p className={s.sub}>
            {tr(
              '{0} гэрээ · {1} төлбөр · гэрээт {2} · олгосон {3}',
              num(t.contracts),
              num(t.pays),
              money(t.contract),
              money(t.paid),
            )}
            {head.src === 'cashflow' ? (
              <>
                {' · '}{tr('гэрээлсэн дүн {0} (Cashflow)', money(head.contract))}
                {head.pct != null && <> · {tr('олгосон хувь (гэрээнд) {0}', pct(head.pct))}</>}
                {head.other != null && (
                  <> · {tr('гэрээлсэн багцаас гадуур олгосон {0} (хувьд ороогүй)', money(head.other))}</>
                )}
              </>
            ) : (
              <>
                
                {head.other != null && (
                  <> · {tr('гэрээт дүн тодорхойгүй гэрээнд олгосон {0} (хувьд ороогүй)', money(head.other))}</>
                )}
              </>
            )}
          </p>
        </div>
        <div className={s.hdR}>
          <label className={s.sortLbl} htmlFor="ipc-sort">{tr('Эрэмбэ')}</label>
          <select
            id="ipc-sort"
            data-rep-skip=""
            className={s.sel}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="paid">{tr('Олгосон дүнгээр')}</option>
            <option value="pct">{tr('Олгосон хувиар')}</option>
            <option value="contract">{tr('Гэрээт төсвөөр')}</option>
            <option value="pkg">{tr('Багцын нэрээр')}</option>
          </select>
          {canCreate && <button type="button" className={s.btn} onClick={() => setNewContract(true)}>{tr('Гэрээ үүсгэх')}</button>}
          <button type="button" className={s.btn} onClick={toggleAll}>
            {allShut ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
          </button>
        </div>
      </header>

      <div className={s.tabs} role="group" aria-label={tr('Гэрээний бүлэг')}>
        <button type="button" className={s.tab} aria-pressed={tab === 'build'} onClick={() => setTab('build')}>
          <span className={s.tabName}>{tr('Багцууд')}</span>
          <span className={s.tabSum}>{sumLine(bSum)}</span>
        </button>
        <button type="button" className={s.tab} aria-pressed={tab === 'design'} onClick={() => setTab('design')}>
          <span className={s.tabName}>{tr('Зураг')}</span>
          <span className={s.tabSum}>{sumLine(dSum)}</span>
        </button>
        <div className={s.tabAll}>
          <span className={s.tabName}>{tr('Бүгд')}</span>
          <span className={s.tabSum}>{sumLine(allSum)}</span>
        </div>
      </div>

      <div className={s.list}>
        {tab === 'build' && (build.length ? build.map(block) : <p className={s.note}>{tr('Багцын гэрээ алга')}</p>)}
        {tab === 'design' && (design.length ? (
          <div className={s.zGrp}>
            {dTree.tree.map((g) => zSect(g.key, g.label, [...g.items, ...g.subs.flatMap((x) => x.items)], () => (
              <>
                {g.subs.map((x) => zSect(x.key, x.label, x.items, () => x.items.map(block)))}
                {g.items.map(block)}
              </>
            )))}
            {dTree.rest.length > 0 && (dTree.tree.length ? zSect('rest', tr('Бусад'), dTree.rest, () => dTree.rest.map(block)) : dTree.rest.map(block))}
          </div>
        ) : <p className={s.note}>{tr('Зургийн гэрээ алга')}</p>)}
      </div>


      {unassigned && <p className={s.warn} role="alert">{tr('Гэрээний мөрт оноогдоогүй төлбөр олголтын дүнд ороогүй: {0}', unassigned)}</p>}
      {syncErr && <p className={s.warn} role="alert">{tr('Төлбөрийн дүнг «Төсөл төлөвлөгөө биелэлт»-д бичих автомат холболт унав ({0}) — олгосон хувь хоцорч болно; 10 минутын дараа дахин оролдоно.', syncErr)}</p>}
      {newContract && <ContractDialog cfRows={cfRows} onClose={() => setNewContract(false)} />}

      {!showObyem && (
        <p className={s.note}>
          {tr(
            'Гүйцэтгэлийн обьём · үнэ · зөрүүгийн багана өгөгдөл орсон үед '
            + 'автоматаар нэмэгдэнэ. Одоогийн төлбөрүүд бөглөлтийн архив '
            + 'эхлэхээс өмнөх тул холбогдох гүйцэтгэл алга.',
          )}
        </p>
      )}
    </section>
  );
}

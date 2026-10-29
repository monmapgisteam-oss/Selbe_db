'use client';

/**
 * IPC — ОЛГОСОН САНХҮҮЖИЛТ, ГЭРЭЭГЭЭР БҮЛЭГЛЭСЭН УНШИГДАХУЙЦ ХАРАГДАЦ.
 */
import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { mnt, num, pct, dayKey } from '@/lib/format';
import {
  contractBlocks, anyObyem, sortBlocks, ipcTotals, payCount, ipcNumbers, ipcHeadShare,
  type ContractBlock, type Detail, type PayRow, type SortKey,
} from '@/lib/ipcTable';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import { useAsync } from '@/lib/useAsync';
import { loadFinance } from '@/lib/reportData';
import { paidPctOf } from '@/lib/paidShare';
import type { HoContract } from '@/lib/ipc';
import { pkgKeyOf } from '@/lib/services';
import { AUTO_PREFIX } from '@/lib/ipcAuto';
import { IpcDocDialog, hasIpcDoc } from '@/components/IpcDocDialog';
import { loadSheetStarts, sheetsOf } from '@/lib/ipcDocLoad';
import { lateSheetsOf, type IpcSheetStart } from '@/lib/ipcDoc';
import { useTip } from '@/components/ui';
import s from './ipcTable.module.css';

/**
 * ГҮЙЦЭТГЭЛЭЭС ҮҮССЭН (AUTO) мөрийн өдөр — `AUTO|<багц>|YYYY-MM-DD` (2026-09-29).
 */
const autoDayOf = (r: PayRow): string | null => {
  if (!r.id.startsWith(AUTO_PREFIX)) return null;
  const m = /(\d{4}-\d{2}-\d{2})$/.exec(r.id);
  return m ? m[1] : null;
};

const money = (v: number | null): string => {
  if (v == null) return '—';
  if (v === 0) return tr('0 ₮');
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

/** Нээлттэй IPC баримтын цонх — картаас */
type DocAsk = { packKey: string; packName: string; month: string; ipcNo: number };

function PayCard({ r, ipcNo, onDoc, late }: {
  r: PayRow;
  /** Гэрээний дараалсан IPC дугаар (`ipcTable.ipcNumbers`) — AUTO картын «IPC-NN» */
  ipcNo?: number;
  /** IPC баримт татах (2026-09-29) — AUTO картад л */
  onDoc?: () => void;
  late?: string[];
}) {
  return (
    <article className={`${s.card} ${r.advance ? s.cardAdv : ''}`}>
      {/* ── ТОЛГОЙ: IPC дугаар + ХУГАЦАА ── */}
      <header className={s.cardHd}>
        <span className={r.advance ? s.tagAdv : s.tagIpc}>
          {onDoc && ipcNo ? `IPC-${String(ipcNo).padStart(2, '0')}` : r.code}
        </span>
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
      {late && late.length > 0 && (
        <p className={s.lateNote} role="note">
          {tr('⚠ {0} хуудасны анхны батлагдсан гүйцэтгэл энэ сард — өмнөх IPC саруудад хэмжигдээгүй тул энэ IPC-ийн тайлант гүйцэтгэлд гэрээний эхнээс хуримтлагдсан ажил орсон.', late.join(', '))}
        </p>
      )}
      {onDoc && (
        <button type="button" className={s.docBtn} onClick={onDoc}
          title={tr('Сар бүрийн гүйцэтгэлээс Хүснэгт 7 · Гүйцэтгэл-1 · Хавсралт 12-ыг PDF-ээр')}>
          {tr('IPC баримт татах (PDF)')}
        </button>
      )}
    </article>
  );
}

/**
 * ОЛОН ХУУДАСТАЙ багцуудын хуудас бүрийн ЭХНИЙ агшин (`ipcDocLoad.loadSheetStarts`) —
 * орой эхэлсэн хуудсын анхааруулга (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
function useSheetStarts(packKeys: readonly string[]): Map<string, IpcSheetStart[]> {
  const [m, setM] = useState<Map<string, IpcSheetStart[]>>(() => new Map());
  const key = packKeys.join('|');
  useEffect(() => {
    let alive = true;
    const keys = key ? key.split('|') : [];
    void Promise.all(keys.map((k) => loadSheetStarts(k)
      .then((v): [string, IpcSheetStart[]] => [k, v])
      .catch(() => null)))
      .then((xs) => {
        if (alive) setM(new Map(xs.filter((x): x is [string, IpcSheetStart[]] => x != null)));
      });
    return () => { alive = false; };
  }, [key]);
  return m;
}

/* ─────────────────────── ҮНДСЭН ХАРАГДАЦ ─────────────────────── */

export function IpcTable({ contracts }: { contracts: HoContract[] }) {
  const [sort, setSort] = useState<SortKey>('paid');
  /** Хаагдсан бүлгүүд — анхдагчаар БҮГД НЭЭЛТТЭЙ */
  const [shut, setShut] = useState<Set<string>>(new Set());
  /** Нээлттэй IPC баримтын цонх (2026-09-29) */
  const [doc, setDoc] = useState<DocAsk | null>(null);

  const blocks = useMemo(() => contractBlocks(contracts), [contracts]);
  const sorted = useMemo(() => sortBlocks(blocks, sort), [blocks, sort]);
  const showObyem = useMemo(() => anyObyem(blocks), [blocks]);
  const t = useMemo(() => ipcTotals(blocks), [blocks]);
  const finQ = useAsync(() => loadFinance(), []);
  const head = useMemo(() => ipcHeadShare(t, finQ.state === 'ready'
    ? {
      contract: finQ.data.contractAmount,
      pct: finQ.data.paid == null ? null : finQ.data.paidPct ?? paidPctOf(finQ.data.paidContracted, finQ.data.contractAmount),
      paidOther: finQ.data.paidOther,
    }
    : null), [t, finQ.state, finQ.data]);
  const multiPacks = useMemo(() => [...new Set(blocks
    .filter((b) => b.rows.some((r) => autoDayOf(r) != null))
    .map((b) => pkgKeyOf(b.code))
    .filter((k) => k && sheetsOf(k).length > 1))].sort(), [blocks]);
  const starts = useSheetStarts(multiPacks);

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

  const allShut = sorted.every((b) => shut.has(keyOf(b)));
  const toggleAll = () => {
    setShut(allShut ? new Set() : new Set(sorted.map((b) => keyOf(b))));
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
                {head.pct != null && <> · {tr('гэрээнд эзлэх {0}', pct(head.pct))}</>}
                {head.other != null && (
                  <> · {tr('гэрээлсэн багцаас гадуур олгосон {0} (хувьд ороогүй)', money(head.other))}</>
                )}
              </>
            ) : (
              <>
                {head.pct != null && <> · {tr('гэрээнд эзлэх {0} (HO хүснэгтээр)', pct(head.pct))}</>}
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
          <button type="button" className={s.btn} onClick={toggleAll}>
            {allShut ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
          </button>
        </div>
      </header>

      <div className={s.list}>
        {sorted.map((b) => {
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
                  <div className={s.cards}>
                    {(() => {
                      const packKey = pkgKeyOf(b.code);
                      const docOk = hasIpcDoc(packKey);
                      const nos = ipcNumbers(b.rows, autoDayOf);
                      const st = starts.get(packKey);
                      return b.rows.map((r) => {
                        const day = docOk ? autoDayOf(r) : null;
                        const no = nos.get(r);
                        const late = day && st ? lateSheetsOf(st, day.slice(0, 7)) : undefined;
                        return (
                          <PayCard key={`${k}|${r.oid ?? r.id}`} r={r} ipcNo={no} late={late}
                            onDoc={day ? () => setDoc({ packKey, packName: b.title, month: day.slice(0, 7), ipcNo: no ?? 1 }) : undefined} />
                        );
                      });
                    })()}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {doc && (
        <IpcDocDialog packKey={doc.packKey} packName={doc.packName} month={doc.month} ipcNo={doc.ipcNo}
          onClose={() => setDoc(null)} />
      )}

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

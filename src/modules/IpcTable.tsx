'use client';

/**
 * IPC — ОЛГОСОН САНХҮҮЖИЛТ, ГЭРЭЭГЭЭР БҮЛЭГЛЭСЭН УНШИГДАХУЙЦ ХАРАГДАЦ.
 *
 * ⚠️ ЭНЭ БОЛ IPC-ИЙН ЦОРЫН ГАНЦ ХУУДАС (2026-09-09, хэрэглэгчийн шаардлага:
 * «IPC service дээрх бүх мэдээллийг харах ёстой НЭГ page байх ёстой»).
 * Түүхий 37 баганат хүснэгт навигациас ХАСАГДСАН тул үйлчилгээний талбар
 * бүр ЭНД харагдах ЁСТОЙ:
 *   · ТӨЛБӨРИЙН талбар (мөр бүрд өөр) → хүснэгтийн мөрөнд
 *   · ГЭРЭЭНИЙ талбар (мөрд давтагддаг) → дэлгэрэнгүйд, НЭГ УДАА
 * Шинэ талбар нэмэгдвэл `ipcTable.ts`-ийн `DETAIL_SPEC`-д ЗААВАЛ нэм —
 * эс бөгөөс тэр мэдээлэл хэрэглэгчид ХЭЗЭЭ Ч харагдахгүй.
 *
 * ⚠️ ЗАСВАР ЭНД БАЙХГҮЙ — энэ нь ЗӨВХӨН УНШИХ харагдац. Засварын код нь
 * `Finance.tsx`-ийн `IpcRawTableUnused`-д хадгалагдсан (навигацид залгаагүй).
 *
 * ⚠️ НИЙЛБЭР ЭНД БОДОГДОХГҮЙ. Бүх тоо `groupHo()` → `contractBlocks()`-оос
 * ирнэ; тэдгээр нь гэрээний давхардлыг аль хэдийн арилгасан. Энэ файлд
 * `rows.reduce(...)` мэт нийлүүлэлт БИЧИХГҮЙ — Багц-4.1 (7 мөр) -ийн төсөв
 * 7 дахин давхардана.
 *
 * ⚠️ ГҮЙЦЭТГЭЛИЙН 3 БАГАНА (обьём · үнэ · зөрүү) нь ӨГӨГДӨЛТЭЙ үедээ л
 * гарна (хэрэглэгчийн шийдвэр 2026-09-09: «байгаа нь гарна, байхгүй нь
 * хоосон»). Одоогоор 45/45 хоосон тул харагдахгүй; бөглөгдмөгц
 * автоматаар нээгдэнэ.
 */
import { useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { mnt, num, pct } from '@/lib/format';
import {
  contractBlocks, anyObyem, sortBlocks, ipcTotals,
  type ContractBlock, type Detail, type PayRow, type SortKey,
} from '@/lib/ipcTable';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import type { HoContract } from '@/lib/ipc';
import s from './ipcTable.module.css';

/**
 * ⚠️ `null` ба `0`-ийг ЯЛГАНА. `mnt()` нь `0`-ийг «—» болгодог тул шууд
 * хэрэглэвэл «тэг төлбөр» ба «хэмжигдээгүй» хоёр нэг харагдана. Энд
 * `null` бол «—», жинхэнэ `0` бол «0 ₮».
 */
const money = (v: number | null): string => {
  if (v == null) return '—';
  if (v === 0) return tr('0 ₮');
  return mnt(v);
};

/** Обьём — нэгж холилдсон тул тоог нь л харуулна (₮ БИШ) */
const vol = (v: number | null): string => (v == null ? '—' : num(Math.round(v)));

/** Түүхий утгыг тоо руу — тоо биш бол `null`. ⚠️ `0` нь ЖИНХЭНЭ тэг. */
const num2 = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * ТӨЛБӨРИЙН ОГНОО — `YYYY-MM-DD`.
 *
 * ⚠️ Ерөнхий `date()` хэрэглэхгүй: тэр нь `toLocaleDateString('mn-MN')`
 * дуудах бөгөөд Chrome үүнийг `09/25/2025` (сар/өдөр/жил) гэж гаргадаг.
 * Энэ хүснэгт нь ЦАГ ХУГАЦААНЫ дараалалтай — олон арван мөрийг нүдээр
 * гүйлгэхэд `YYYY-MM-DD` нь эрэмбэтэй нэг мөр болж уншигдана, мөн
 * сар/өдрийн дараалал эргэлзээ төрүүлэхгүй.
 *
 * ⚠️ `guilgee_ognoo` нь аль хэдийн `YYYY-MM-DD` мөр (эсвэл ms epoch) —
 * эхний 10 тэмдэгтийг ШУУД авна. Танихгүй хэлбэрийг ГАЖУУДУУЛАХГҮЙ,
 * түүхий утгаар нь харуулна.
 */
const payDate = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(v).toISOString().slice(0, 10);
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
  /* ⚠️ Хувь нь 0–100 — `pct()` 100-аар үржүүлдэггүй. Мөн `null` үед
     туузыг ОГТ зурахгүй (0% гэж зурвал «олгоогүй» гэж худлаа уншигдана). */
  const p = b.paidPct;
  return (
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
            {tr('{0} төлбөр', num(b.rows.length))}
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
          <span className={s.gPct}>
            {/* ⚠️ Тууз нь ЗӨВХӨН хэмжигдсэн үед. Өргөнийг 100-д таслав —
                хэтэрсэн гэрээ (>100%) туузыг нүднээс гаргахгүй. */}
            {p == null ? (
              <span className={s.gPctNone}>—</span>
            ) : (
              <>
                <span className={s.bar} aria-hidden="true">
                  <span
                    className={s.barIn}
                    style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
                  />
                </span>
                <span className={s.gPctNum}>{pct(p)}</span>
              </>
            )}
          </span>
    </button>
  );
}

/* ─────────────────────── ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ ─────────────────────── */

/**
 * Гэрээний бүх үлдсэн талбар — дэлгэсэн бүлгийн ЭХНИЙ мөрөнд.
 *
 * ⚠️ ЭНЭ БАЙХГҮЙ БОЛ мэдээлэл АЛДАГДАНА: түүхий хүснэгт хасагдсан тул
 * `tosol_ner`, `huuliin_undeslel`, захирамжууд, эх үүсвэрийн задаргаа
 * зэргийг өөр ХААНААС Ч харах боломжгүй.
 */
function Details({ b }: { b: ContractBlock }) {
  const fmt = (d: Detail): string => {
    if (d.kind === 'money') return money(num2(d.value));
    if (d.kind === 'date') return payDate(d.value);
    /* ⚠️ 'pair' нь аль хэдийн нэгтгэгдсэн текст — дахин форматлахгүй */
    return String(d.value);
  };
  /** Нэг бүлгийн тодорхойлолтын жагсаалт */
  const Rows = ({ items }: { items: readonly Detail[] }) => (
    <dl className={s.dl}>
      {items.map((d) => (
        <div className={s.dItem} key={d.field}>
          {/* ⚠️ Хосолсон мөрд өөрийн шошиг («Захирамж 1») — толины нэр биш */}
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
        {/* ⚠️ ХОЁР БАГАНА (хэрэглэгчийн шийдвэр 2026-09-09: «хүснэгт харахад
            ойлгомжгүй»). Урьд нь 6 баганат нэг сүлжээ байсан тул нүд юуг
            эхэлж унших нь тодорхойгүй, ойролцоо талбарууд (захирамжийн
            огноо ↔ дугаар) хол тарж байв. Одоо бүлэг бүр өөрийн гарчигтай,
            дотроо ДЭЭРЭЭС ДООШ уншигдана. */}
        <div className={s.dCols}>
          {b.details.map((g) => (
            <section className={s.dGrp} key={g.title}>
              <h4 className={s.dGrpTitle}>{g.title}</h4>
              <Rows items={g.items} />
            </section>
          ))}
          {/* ⚠️ «Олгосон»-ы задаргаа — урьдчилгаа vs гүйцэтгэл. Эх өгөгдөлд
              ийм багана БАЙХГҮЙ, бодогдсон утга тул тусдаа бүлэгт. */}
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
        {/* ⚠️ Эх сурвалж эвдэрсний ДОХИО — чимээгүй өнгөрөөвөл буруу тоо
            тайланд орно. Амьдаар 45/45 таарсан тул энэ ХЭЗЭЭ Ч гарах
            ёсгүй; гарвал эх өгөгдөл өөрчлөгдсөн гэсэн үг. */}
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
 *
 * ⚠️ Хэрэглэгчийн шийдвэр (2026-09-09): «нэг ipc нэг нүдэн бүх мэдээлэл
 * агуулна». Хүснэгтийн мөр нь багана бүрийг ТОЛГОЙТОЙ нь тулгаж уншихыг
 * шаарддаг (мөр доош гүйхэд толгой нүднээс гардаг) — картад шошго нь
 * утгынхаа ХАЖУУД байна.
 *
 * ⚠️ Хоосон талбарыг ОГТ гаргахгүй: урьдчилгаад обьём/зөрүү/хуримтлал
 * байхгүй тул тэдгээр мөр картад ОРОХГҮЙ («—» гэж зай эзлэхгүй).
 */
/**
 * Картын нэг мөр.
 *
 * ⚠️ МОДУЛИЙН ТҮВШИНД: `PayCard` дотор тодорхойлбол render бүрд шинэ
 * төрөл болж, React мөр бүрийг дахин байгуулна.
 *
 * ⚠️ Утга `null` байсан ч мөр ГАРНА («—»). Нуувал карт дутуу болж,
 * «энэ IPC-д обьём хэмжигдээгүй» гэдэг чимээгүй өнгөрнө.
 */
function Line({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className={s.kv}>
      <span className={s.k}>{k}</span>
      <span className={`${s.v} ${cls ?? ''}`}>{v}</span>
    </div>
  );
}

function PayCard({ r }: { r: PayRow }) {
  return (
    <article className={`${s.card} ${r.advance ? s.cardAdv : ''}`}>
      {/* ── ТОЛГОЙ: IPC дугаар + ХУГАЦАА ──
          ⚠️ Огноо БАЙВАЛ огноо, ЭС БӨГӨӨС он. Автоматаар үүссэн мөрд
          `guilgee_ognoo` хоосон (гүйлгээ хийгдээгүй) тул зөвхөн огноо
          харуулбал толгой «—» болж, ганц мэдэгдэж буй хугацааны утга
          (он) доор нуугдана. ⚠️ Он нь ТАНИГЧ — мянгатын таслалгүй. */}
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

        {/* ── БОДИТ ГҮЙЦЭТГЭЛ ──
            ⚠️ Обьём нь IPC-ийн ОГНООНД тохирох бөглөлтийн агшнаас
            (`ipcLink.snapAt`), мөнгөн дүн нь тэр обьём × нэгж өртөг.
            Одоогоор 45/45 хоосон: IPC-үүд 2026-03…08-д, бөглөлтийн архив
            2026-09-03-аас эхэлдэг тул таарах агшин алга. Цаашид
            санхүүжилт ЭНЭ тооноос бодогдоно. */}
        <div className={s.sep} />
        <h5 className={s.sect}>{tr('Бодит гүйцэтгэл')}</h5>
        <Line k={tr('Обьём')} v={vol(r.obyem)} />
        <Line k={tr('Мөнгөн дүн')} v={money(r.une)} />

        {/* ── ОЛГОЛТ ── ⚠️ картын ГОЛ тоо, томоор */}
        <div className={s.sep} />
        <div className={s.big}>
          <span className={s.bigLbl}>{tr('Олгосон')}</span>
          <span className={s.bigNum}>{money(r.amount)}</span>
        </div>
        {/* ⚠️ Зөрүүг ӨНГӨӨР ялгана: илүү олгосон нь анхаарал татах ёстой.
            `null` үед өнгөгүй «—» — «таарсан» гэж уншигдахгүй.
            ⚠️ Цаашид санхүүжилт обьёмоос бодогдох тул зөрүү 0 байх ЁСТОЙ;
            хуучин 22 IPC нь өөр аргаар олгогдсон тул «—». */}
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

/* ─────────────────────── ҮНДСЭН ХАРАГДАЦ ─────────────────────── */

export function IpcTable({ contracts }: { contracts: HoContract[] }) {
  const [sort, setSort] = useState<SortKey>('paid');
  /** Хаагдсан бүлгүүд — анхдагчаар БҮГД НЭЭЛТТЭЙ */
  const [shut, setShut] = useState<Set<string>>(new Set());

  const blocks = useMemo(() => contractBlocks(contracts), [contracts]);
  const sorted = useMemo(() => sortBlocks(blocks, sort), [blocks, sort]);
  const showObyem = useMemo(() => anyObyem(blocks), [blocks]);
  const t = useMemo(() => ipcTotals(blocks), [blocks]);

  /* ⚠️ Түлхүүр нь `code` — кодгүй гэрээ (амьдаар ХО-0045) `''` болно.
     Тиймээс индексийг ХАМТ хэрэглэнэ, эс бөгөөс хоёр кодгүй гэрээ
     нэг зэрэг нээгдэж хаагдана. */
  const keyOf = (b: ContractBlock, i: number) => `${b.code}#${i}`;

  const allShut = shut.size >= sorted.length;
  const toggleAll = () => {
    setShut(allShut ? new Set() : new Set(sorted.map(keyOf)));
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
            {t.paidPct != null && ` (${pct(t.paidPct)})`}
          </p>
        </div>
        <div className={s.hdR}>
          <label className={s.sortLbl} htmlFor="ipc-sort">{tr('Эрэмбэ')}</label>
          <select
            id="ipc-sort"
            className={s.sel}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="paid">{tr('Олгосон дүнгээр')}</option>
            <option value="pct">{tr('Гүйцэтгэлийн хувиар')}</option>
            <option value="contract">{tr('Гэрээт төсвөөр')}</option>
            <option value="pkg">{tr('Багцын нэрээр')}</option>
          </select>
          <button type="button" className={s.btn} onClick={toggleAll}>
            {allShut ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
          </button>
        </div>
      </header>

      {/* ⚠️ ХҮСНЭГТ БИШ, ЖАГСААЛТ (2026-09-09): төлбөр бүр КАРТ болсон тул
          нийтлэг `<table>` баганын бүтэц шаардлагагүй. Гэрээ бүр нь
          толгой + дэлгэрэнгүй + картын сүлжээ. */}
      <div className={s.list}>
        {sorted.map((b, i) => {
          const k = keyOf(b, i);
          const open = !shut.has(k);
          return (
            <section className={s.blk} key={k}>
              <Head
                b={b}
                open={open}
                onToggle={() => setShut((p) => {
                  const n = new Set(p);
                  if (n.has(k)) n.delete(k); else n.add(k);
                  return n;
                })}
              />
              {open && (
                <>
                  <Details b={b} />
                  <div className={s.cards}>
                    {b.rows.map((r) => (
                      <PayCard key={`${k}|${r.oid ?? r.id}`} r={r} />
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

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

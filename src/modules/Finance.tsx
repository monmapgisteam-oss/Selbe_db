'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { Data, Empty } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW2, IPC_LOG, TASK_SHEET, bagtsKey } from '@/lib/services';
import { mntShort, num, text } from '@/lib/format';
import f from './finance.module.css';

/* ═══════════════════════════════════════════════════════════
   САНХҮҮЖИЛТ — CASHFLOW (төлөвлөгөө) + IPC (олгосон акт).
   МӨР (гэрээ/багц) БҮРД тусдаа график: сар бүр хэдэн хувьд гүйцэтгэж,
   хэдэн төгрөг ТӨЛӨВЛӨСӨН (цэнхэр) ба IPC-ээр хэдийг ОЛГОСОН (ногоон).
   ═══════════════════════════════════════════════════════════ */

/** Утгыг тоо руу — ArcGIS Double эсвэл "0" мэт мөр ирдэг */
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Хувийг хэвшүүлэх: эх дата бутархай (0–1) ба % (0–100) холилдсон */
const pctVal = (v: unknown): number => {
  const x = n(v);
  return x > 0 && x <= 1.5 ? x * 100 : x;
};

/** IPC огноог "YYYY-MM" болгох ("2026.05.04" ба "2026-05-04" 2-уул) */
function ym(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/\./g, '-');
  const m = s.match(/(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : null;
}

/** Багцын түлхүүр: том үсэг + зөвхөн үсэг/тоо/цэг — «БАГЦ-4.2» = «Багц 4.2» */
const pkgKey = (v: unknown) =>
  String(v ?? '')
    .toUpperCase()
    .replace(/[^А-ЯЁҮӨA-Z0-9.]/g, '');

/** Жинхэнэ акт мөн үү — "Contract Price" псевдо-мөр, хоосон мөрийг хасна */
const isRealAct = (no: unknown) => /^(IPC|APC|АРС)[-\s]?\d+/i.test(String(no ?? '').trim());

const PLAN = '#0891b2'; // төлөвлөсөн (багана)
const ACT = '#22c55e'; // олгосон IPC (багана)
const CUM = '#f59e0b'; // санхүүжилтийн өссөн хувь (шошго)
const PHYS = '#a855f7'; // биет гүйцэтгэлийн хувь (шошго)

type Row = Record<string, unknown>;

/** Нэг сарын цэг: төлөвлөгөө + олгосон + биет гүйцэтгэл */
type MonthPt = {
  label: string; // «2025-10»
  amount: number; // тухайн сард авах санхүүжилт ₮ (төлөвлөгөө)
  amountCum: number; // өссөн төлөвлөгөө ₮
  cumPct: number; // өссөн гүйцэтгэлийн хувь (0–100)
  given: number; // тухайн сард IPC-ээр олгосон ₮ (net)
  phys: number; // сарын эцсийн байдлаарх БИЕТ гүйцэтгэл % («Гүйцэтгэл бөглөх»); 0 = дата алга
};

/** Багц бүрийн IPC: сар → олгосон нийлбэр */
type GivenMap = Map<string, Map<string, number>>;

/** Багц бүрийн биет гүйцэтгэл: сар → % (блокуудын дундаж, тухайн сарын эцсээр) */
type PhysMap = Map<string, Map<string, number>>;

type FinData = { contracts: Row[]; given: GivenMap; phys: PhysMap };

// ═══════════════════════════════════════════════════════════
//  AREA ГРАФИК (shadcn gradient загвар) — нэг цуваа: сарын авах дүн ₮.
//  Гөлгөр natural муруй · градиент дүүргэлт · hover tooltip.
//  X тэнхлэгт он сар (товчлохгүй) + хүрэх өссөн хувь шараар.
// ═══════════════════════════════════════════════════════════

function ComboChart({ items, height = 280 }: { items: MonthPt[]; height?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  // Нэг баганат бүтэн өргөнд ойролцоо — 12 сар × ~133px слот: бүтэн дүн давхцахгүй
  const W = 1600;
  const H = height;
  const padT = 32; // дээр — сөөлжилсөн дүнгийн шошгонд зай
  const padB = 46; // доор — он сар + санхүү хувь (2 мөр)
  const N = items.length;
  const maxA = Math.max(1, ...items.map((i) => Math.max(i.amount, i.given)));
  const slot = W / N;
  const hasGiven = items.some((i) => i.given > 0);
  const hasPhys = items.some((i) => i.phys > 0);
  // Олон багана (shadcn Bar Chart Multiple): төлөвлөгөө · олгосон · биет
  const series = 1 + (hasGiven ? 1 : 0) + (hasPhys ? 1 : 0);
  const gap = series > 1 ? 3 : 0;
  const barW = Math.min(series > 1 ? 22 : 48, (slot * 0.66 - gap * (series - 1)) / series);
  const cx = (i: number) => slot * i + slot / 2;
  const groupW = series * barW + (series - 1) * gap;
  /** k дэх цувааны баганын зүүн х (k: 0=план, 1=олгосон, 2=биет) */
  const barX = (i: number, k: number) => cx(i) - groupW / 2 + k * (barW + gap);
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHi(Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N))));
  };
  const pt = hi != null ? items[hi] : null;

  return (
    <div className={f.chartWrap} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg
        className={f.comboSvg}
        style={{ height: H }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Сарын санхүүжилтийн төлөвлөгөө: авах дүн ба хүрэх хувь"
      >
        {/* CartesianGrid vertical={false} — зөвхөн хэвтээ тор */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = padT + t * plotH;
          return <line key={t} x1={0} x2={W} y1={gy} y2={gy} className={f.curveGrid} />;
        })}

        {/* Bar radius={4} — shadcn Bar Chart Multiple: төлөвлөгөө · олгосон · биет */}
        {items.map((it, i) => {
          const h = it.amount > 0 ? Math.max(3, (it.amount / maxA) * plotH) : 0;
          const hg = it.given > 0 ? Math.max(3, (it.given / maxA) * plotH) : 0;
          // Биет гүйцэтгэл ӨӨРИЙН 0–100% масштабтай: 100% = графикийн бүтэн өндөр
          const hp = it.phys > 0 ? Math.max(3, (Math.min(100, it.phys) / 100) * plotH) : 0;
          const kGiven = 1;
          const kPhys = hasGiven ? 2 : 1;
          const dim = hi != null && hi !== i;
          // Шошгоны байрлал: нэг слот доторх шошгууд ойртвол дээш нь түлхэж салгана
          const planLblY = baseY - h - (i % 2 === 0 ? 6 : 18);
          let givenLblY = baseY - hg - (i % 2 === 0 ? 18 : 6);
          if (it.amount > 0 && it.given > 0 && Math.abs(planLblY - givenLblY) < 12) {
            givenLblY = Math.min(planLblY, givenLblY) - 12;
          }
          let physLblY = baseY - hp - 6;
          const taken = [it.amount > 0 ? planLblY : null, it.given > 0 ? givenLblY : null].filter(
            (y): y is number => y != null,
          );
          while (taken.some((y) => Math.abs(y - physLblY) < 12)) physLblY -= 12;
          return (
            <g key={it.label} opacity={dim ? 0.55 : 1}>
              {it.amount > 0 && (
                <>
                  <rect x={barX(i, 0)} y={baseY - h} width={barW} height={h} rx={4} fill={PLAN} />
                  {/* Төлөвлөсөн дүн БҮТНЭЭРЭЭ — сөөлжлөн */}
                  <text
                    x={barX(i, 0) + barW / 2}
                    y={planLblY}
                    className={f.barVal}
                    textAnchor="middle"
                  >
                    {num(it.amount)}
                  </text>
                </>
              )}
              {it.given > 0 && (
                <>
                  <rect x={barX(i, kGiven)} y={baseY - hg} width={barW} height={hg} rx={4} fill={ACT} />
                  {/* Олгосон дүн БҮТНЭЭРЭЭ — эсрэг сөөлжилтөөр (давхцахгүй) */}
                  <text
                    x={barX(i, kGiven) + barW / 2}
                    y={givenLblY}
                    className={f.barValG}
                    textAnchor="middle"
                  >
                    {num(it.given)}
                  </text>
                </>
              )}
              {it.phys > 0 && (
                <>
                  <rect x={barX(i, kPhys)} y={baseY - hp} width={barW} height={hp} rx={4} fill={PHYS} />
                  {/* Биет гүйцэтгэлийн хувь — баганынхаа дээр */}
                  <text
                    x={barX(i, kPhys) + barW / 2}
                    y={physLblY}
                    className={f.barValP}
                    textAnchor="middle"
                  >
                    {it.phys.toFixed(1)}%
                  </text>
                </>
              )}
              {/* X тэнхлэг: он сар (товчлохгүй) + санхүү хувь шараар */}
              <text x={cx(i)} y={H - 24} className={f.axisX} textAnchor="middle">{it.label}</text>
              {it.cumPct > 0 && (
                <text x={cx(i)} y={H - 7} className={f.axisXPct} textAnchor="middle">
                  {it.cumPct.toFixed(1)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {pt && (
        <div
          className={f.tip}
          style={{ left: `${((hi! + 0.5) / N) * 100}%`, transform: `translateX(${hi! < N / 2 ? '10px' : 'calc(-100% - 10px)'})` }}
        >
          <p className={f.tipHd}>{pt.label}</p>
          <p className={f.tipRow}><i style={{ background: PLAN }} />Төлөвлөсөн<b>{pt.amount > 0 ? mntShort(pt.amount) : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: PLAN }} />Өссөн төлөвлөгөө<b>{pt.amountCum > 0 ? mntShort(pt.amountCum) : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: ACT }} />Олгосон (IPC)<b>{pt.given > 0 ? mntShort(pt.given) : '—'}</b></p>
          <p className={`${f.tipRow} ${f.tipGap}`}><i style={{ background: CUM }} />Санхүү. өссөн хувь<b>{pt.cumPct > 0 ? `${pt.cumPct.toFixed(1)}%` : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: PHYS }} />Биет гүйцэтгэл<b>{pt.phys > 0 ? `${pt.phys.toFixed(1)}%` : '—'}</b></p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ДАТА
// ═══════════════════════════════════════════════════════════
export function Finance() {
  const q = useAsync<FinData>(async () => {
    const S = TASK_SHEET.fields;
    const [contracts, ipc, sheet] = await Promise.all([
      queryFeatures(CASHFLOW2.url, { outFields: ['*'], orderBy: `${CASHFLOW2.oid} ASC` }),
      queryFeatures(IPC_LOG.url, { outFields: ['*'] }),
      // «Гүйцэтгэл бөглөх» — блок бүрийн НИЙТ гүйцэтгэлийн мөр (Б.), append-лог
      queryFeatures(TASK_SHEET.url, {
        where: `${S.no}='${TASK_SHEET.constructionNo}'`,
        outFields: [S.bagts, S.block, S.date, S.progress],
      }),
    ]);

    // IPC → багц бүрд: сар → олгосон net нийлбэр.
    // "Contract Price" псевдо-мөр, дугааргүй мөрийг хасна (services.ts-ийн санамж).
    const F = IPC_LOG.fields;
    const labels = CASHFLOW2.months.map((m) => m.label);
    const first = labels[0];
    const last = labels[labels.length - 1];
    const given: GivenMap = new Map();
    ipc.forEach((r) => {
      if (!isRealAct(r[F.no])) return;
      const net = n(r[F.net]);
      if (net === 0) return;
      const k = pkgKey(r[F.pkg]);
      if (!k || k === '0') return;
      let mon = ym(r[F.submitDate]) ?? ym(r[F.periodTo]) ?? ym(r[F.approvedDate]) ?? last;
      if (mon < first) mon = first;
      if (mon > last) mon = last;
      const byMon = given.get(k) ?? new Map<string, number>();
      byMon.set(mon, (byMon.get(mon) ?? 0) + net);
      given.set(k, byMon);
    });

    // Биет гүйцэтгэл → багц бүрд: сар → % (блокуудын дундаж, сарын эцсийн байдлаар).
    // Append-лог тул блок бүрийн тухайн сараас өмнөх ХАМГИЙН СҮҮЛИЙН бичилтийг авна.
    const nowYm = new Date().toISOString().slice(0, 7);
    const phys: PhysMap = new Map();
    {
      // багц → блок → [огноо, гүйцэтгэл][] (огноогоор эрэмбэлсэн)
      const byPkg = new Map<string, Map<string, { d: string; g: number }[]>>();
      sheet.forEach((r) => {
        const k = bagtsKey(r[S.bagts]);
        const d = String(r[S.date] ?? '').slice(0, 10);
        if (!k || !d) return;
        const blocks = byPkg.get(k) ?? new Map<string, { d: string; g: number }[]>();
        const arr = blocks.get(String(r[S.block] ?? '?')) ?? [];
        arr.push({ d, g: n(r[S.progress]) });
        blocks.set(String(r[S.block] ?? '?'), blocks.get(String(r[S.block] ?? '?')) ?? arr);
        byPkg.set(k, blocks);
      });
      byPkg.forEach((blocks, k) => {
        const byMon = new Map<string, number>();
        CASHFLOW2.months.forEach((m) => {
          if (m.label > nowYm) return; // ирээдүйн сард биет дата байхгүй
          let sum = 0;
          let cnt = 0;
          blocks.forEach((arr) => {
            // тухайн сарын эцсээс өмнөх сүүлийн бичилт
            let best: { d: string; g: number } | null = null;
            arr.forEach((e) => {
              if (e.d.slice(0, 7) <= m.label && (!best || e.d > best.d)) best = e;
            });
            if (best) {
              sum += (best as { d: string; g: number }).g;
              cnt++;
            }
          });
          if (cnt > 0) byMon.set(m.label, (sum / cnt) * 100);
        });
        phys.set(k, byMon);
      });
    }

    return { contracts, given, phys };
  }, []);

  return (
    <div className={f.frame}>
      <Data q={q} loading="Санхүүжилтийн төлөвлөгөө…">
        {(d) => <FinanceBody d={d} />}
      </Data>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ХАРАГДАЦ — мөр (гэрээ/багц) бүрд ТУСДАА график
// ═══════════════════════════════════════════════════════════

/** Гэрээний мөрөөс сарын цэгүүд — ЯГ датаных нь дагуу + IPC олгосон + биет гүйцэтгэл */
function contractMonths(r: Row, given: GivenMap, phys: PhysMap): MonthPt[] {
  const C = CASHFLOW2.fields;
  const byMon = given.get(pkgKey(r[C.pkg2])) ?? given.get(pkgKey(r[C.pkg]));
  const ph = phys.get(bagtsKey(r[C.pkg2])) ?? phys.get(bagtsKey(r[C.pkg]));
  return CASHFLOW2.months.map((m) => ({
    label: m.label,
    amount: n(r[m.amount]),
    amountCum: n(r[m.amountCum]),
    cumPct: pctVal(r[m.pctCum]),
    given: byMon?.get(m.label) ?? 0,
    phys: ph?.get(m.label) ?? 0,
  }));
}

function FinanceBody({ d }: { d: FinData }) {
  const C = CASHFLOW2.fields;

  // Сарын хуваарьтай мөрүүдийг ТӨРЛӨӨР нь бүлэглэнэ (эх дарааллаар)
  const groups = useMemo(() => {
    const rows = d.contracts
      .map((r) => ({ r, months: contractMonths(r, d.given, d.phys) }))
      // ⚠️ m.phys ч бас — санхүүгийн хуваарь нь хоосон ч биет гүйцэтгэлтэй багц
      //    жагсаалтаас бүрмөсөн алга болохоос сэргийлнэ (phys нь TASK_SHEET-ээс
      //    тусдаа эх үүсвэртэй).
      .filter(({ months }) => months.some((m) => m.amount > 0 || m.cumPct > 0 || m.given > 0 || m.phys > 0));
    const map = new Map<string, typeof rows>();
    rows.forEach((row) => {
      const t = text(row.r[C.type]).replace(/\s+/g, ' ').trim();
      const key = t === '—' || t === '0' ? 'БУСАД' : t;
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    });
    return { rows, list: [...map.entries()] };
  }, [d.contracts, d.given, d.phys, C.type]);

  return (
    <>
      <header className={f.pageHd}>
        <div>
          <h2>Санхүүжилтийн төлөвлөгөө — багц тус бүрээр</h2>
          <p>
            {groups.rows.length} гэрээ сарын хуваарьтай ({d.contracts.length}-аас) · 2025-10-аас сар
            бүр хэдэн хувьд гүйцэтгэж, хэдэн төгрөгний санхүүжилт авах
          </p>
        </div>
        <div className={f.legend}>
          <span><i className={f.legendBar} style={{ background: PLAN }} />Төлөвлөсөн санхүүжилт (₮)</span>
          <span><i className={f.legendBar} style={{ background: ACT }} />Олгосон · IPC акт (₮)</span>
          <span><i className={f.legendBar} style={{ background: CUM }} />Санхүүжилтийн өссөн хувь (%)</span>
          <span><i className={f.legendBar} style={{ background: PHYS }} />Биет гүйцэтгэл · Гүйцэтгэл бөглөх (%)</span>
        </div>
      </header>

      {groups.list.map(([type, rows]) => (
        <div key={type} className={f.group}>
          <header className={f.groupHd}>
            <h2>{type}</h2>
            <span>{rows.length}</span>
          </header>
          <div className={f.grid}>
            {rows.map(({ r, months }, i) => {
              // Толгой: CF004 (дэд багцтай) → CF003 → дугаар; "0" гэсэн утгыг алгасна
              const t4 = text(r[C.pkg2]);
              const t3 = text(r[C.pkg]);
              const title =
                t4 !== '—' && t4 !== '0' ? t4 : t3 !== '—' && t3 !== '0' ? t3 : `Гэрээ ${i + 1}`;
              // Олгогдох нийт = өмнө шилжүүлсэн (CF028) + сарын хуваарийн нийлбэр
              const total = n(r[C.prevAmount]) + months.reduce((a, m) => a + m.amount, 0);
              return (
              <section key={i} className={f.panel} aria-label={text(r[C.name])}>
                <header className={f.panelHd}>
                  <div>
                    <h3>{title}</h3>
                    <p>{text(r[C.name])}</p>
                    <p className={f.subContractor}>{text(r[C.contractor])}</p>
                  </div>
                  {total > 0 && (
                    <div className={f.totBadge}>
                      <span>Олгогдох нийт санхүүжилт</span>
                      <b>{num(total)} ₮</b>
                    </div>
                  )}
                </header>
                <ComboChart items={months} height={230} />
              </section>
              );
            })}
          </div>
        </div>
      ))}
      {groups.rows.length === 0 && <Empty label="Сарын хуваарьтай гэрээ алга." />}
    </>
  );
}

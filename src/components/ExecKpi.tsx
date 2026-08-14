'use client';

import { useMemo, type CSSProperties } from 'react';
import { useAsync } from '@/lib/useAsync';
import { loadBudget, loadProjectProgress } from '@/lib/live';
import { loadFinData, contractMonths, lagOf, lagLevel } from '@/modules/Finance';
import { useBagtsTable, useSuitability } from '@/modules/Dashboard';
import { HABEA, CASHFLOW2, bagtsKey, type ViewKey } from '@/lib/services';
import { queryCount } from '@/lib/query';
import { scoreLabel } from '@/lib/analysis/score';
import { num, pct } from '@/lib/format';
import s from './execKpi.module.css';

/**
 * ГҮЙЦЭТГЭЛИЙН ҮНЭЛГЭЭ — нүүр хуудсан дахь удирдлагад (CEO) зориулсан АМЬД KPI
 * самбар. Багц ажил, гүйцэтгэгч, санхүүжилт, аюулгүй ажиллагаа, төлөвлөлтийн
 * эх сурвалжаас traffic-light дүгнэлт гаргана — бүх тоо ArcGIS-ээс амьд.
 *
 * ⚠️ Хот төлөвлөлтийн оноо (`useSuitability`) нь ХҮНД орон зайн анализ тул
 * арын дэвсгэрт (кэшлэн) ачаална — тухайн карт «…»-ээс бодогдоод гарна,
 * бусад картууд шууд харагдана.
 */

type Status = 'good' | 'warn' | 'bad' | 'idle';
const TONE: Record<Status, string> = {
  good: '#22c55e', warn: '#f59e0b', bad: '#e11d48', idle: '#64748b',
};
type CardData = { label: string; value: string; note: string; status: Status };
type Card = CardData & { view: ViewKey };

export function ExecKpi({ onView }: { onView: (key: ViewKey) => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const finQ = useAsync(loadFinData, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const budgetQ = useAsync(loadBudget, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const progQ = useAsync(loadProjectProgress, []);
  const bagtsQ = useBagtsTable();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const incQ = useAsync(() => queryCount(HABEA.incident.url), []);
  const suitQ = useSuitability(true); // арын дэвсгэрт (хүнд, кэшлэнэ)

  // 1. Хуваарийн биелэлт — багц бүрийн хоцрогдол (Cashflow төлөвлөгөө vs биет %)
  const schedule = useMemo<CardData>(() => {
    if (finQ.state !== 'ready')
      return { label: 'Хуваарийн биелэлт', value: '…', note: 'Cashflow+IPC ачаалж байна', status: 'idle' };
    const C = CASHFLOW2.fields;
    const d = finQ.data;
    const seen = new Set<string>();
    let red = 0, yellow = 0, worst = 0, total = 0;
    d.contracts.forEach((r) => {
      const key = bagtsKey(String(r[C.pkg2] ?? '')) || bagtsKey(String(r[C.pkg] ?? ''));
      if (!key || key === '0' || seen.has(key)) return;
      seen.add(key);
      const lag = lagOf(contractMonths(r, d.given, d.phys));
      if (!lag) return;
      total += 1;
      const lvl = lagLevel(lag.gap);
      if (lvl === 'red') red += 1;
      else if (lvl === 'yellow') yellow += 1;
      if (lag.gap > worst) worst = lag.gap;
    });
    const lagging = red + yellow;
    return {
      label: 'Хуваарийн биелэлт',
      value: lagging === 0 ? 'Хэвийн' : `${num(lagging)} багц хоцорч байна`,
      note: lagging === 0
        ? `${num(total)} багц хуваарьтаа нийцэж байна`
        : `${num(red)} эрсдэлтэй · ${num(yellow)} анхаарах · хамгийн муу −${worst.toFixed(0)}%`,
      status: red > 0 ? 'bad' : yellow > 0 ? 'warn' : 'good',
    };
  }, [finQ]);

  // 2. Санхүүжилт vs гүйцэтгэл — олгосон (IPC) төсвийн %-ийг биет %-тэй харьцуулна
  const finance = useMemo<CardData>(() => {
    if (finQ.state !== 'ready' || budgetQ.state !== 'ready' || progQ.state !== 'ready')
      return { label: 'Санхүүжилт vs гүйцэтгэл', value: '…', note: 'тооцож байна', status: 'idle' };
    let given = 0;
    finQ.data.given.forEach((byMon) => byMon.forEach((v) => { given += v; }));
    const budget = budgetQ.data.total;
    const finPct = budget > 0 ? (given / budget) * 100 : 0;
    const physPct = progQ.data.actual;
    const gap = finPct - physPct;
    return {
      label: 'Санхүүжилт vs гүйцэтгэл',
      value: `Санхүүжилт ${pct(finPct, 0)} · Биет ${pct(physPct, 0)}`,
      note: Math.abs(gap) <= 5 ? 'санхүүжилт гүйцэтгэлтэй тэнцвэртэй'
        : gap > 0 ? `санхүүжилт гүйцэтгэлээс ${gap.toFixed(0)}пп түрүүлж байна`
          : `гүйцэтгэл санхүүжилтээс ${(-gap).toFixed(0)}пп түрүүлж байна`,
      status: Math.abs(gap) <= 5 ? 'good' : Math.abs(gap) <= 15 ? 'warn' : 'bad',
    };
  }, [finQ, budgetQ, progQ]);

  // 3. Аюулгүй ажиллагаа — осол/зөрчлийн бүртгэлийн тоо (ХАБЭА)
  const safety = useMemo<CardData>(() => {
    if (incQ.state !== 'ready')
      return { label: 'Аюулгүй ажиллагаа', value: '…', note: 'ХАБЭА бүртгэл', status: 'idle' };
    const n = incQ.data;
    return {
      label: 'Аюулгүй ажиллагаа',
      value: n === 0 ? 'Бүртгэлгүй' : `${num(n)} осол/зөрчил`,
      note: 'ХАБЭА-гийн нийт бүртгэл',
      status: n === 0 ? 'good' : n <= 5 ? 'warn' : 'bad',
    };
  }, [incQ]);

  // 4. Хот төлөвлөлтийн оноо — тохиромжтой байдлын дундаж (арын дэвсгэрт)
  const urban = useMemo<CardData>(() => {
    if (suitQ.state !== 'ready')
      return { label: 'Хот төлөвлөлтийн оноо', value: '…', note: 'орон зайн анализ бодож байна', status: 'idle' };
    const sc = suitQ.data.avgScore;
    if (sc == null)
      return { label: 'Хот төлөвлөлтийн оноо', value: '—', note: 'өгөгдөл дутуу', status: 'idle' };
    return {
      label: 'Хот төлөвлөлтийн оноо',
      value: `${Math.round(sc)} / 100`,
      note: `${scoreLabel(sc)} · ${num(suitQ.data.zones)} бүсийн дундаж`,
      status: sc >= 65 ? 'good' : sc >= 45 ? 'warn' : 'bad',
    };
  }, [suitQ]);

  // 5. Гүйцэтгэгчийн зэрэглэл — блокоор жигнэсэн дундаж явцаар (тэргүүлэгч/хойгуур)
  const contractor = useMemo<CardData>(() => {
    if (bagtsQ.state !== 'ready')
      return { label: 'Гүйцэтгэгчийн зэрэглэл', value: '…', note: 'багц ачаалж байна', status: 'idle' };
    const by = new Map<string, { blocks: number; wsum: number }>();
    bagtsQ.data.forEach((r) => {
      if (!r.contractor || r.contractor === '—' || r.progress == null) return;
      const cur = by.get(r.contractor) ?? { blocks: 0, wsum: 0 };
      cur.blocks += r.blocks;
      cur.wsum += r.progress * r.blocks;
      by.set(r.contractor, cur);
    });
    const ranked = [...by.entries()]
      .map(([c, v]) => ({ c, p: v.blocks ? v.wsum / v.blocks : 0 }))
      .sort((a, b) => b.p - a.p);
    if (!ranked.length)
      return { label: 'Гүйцэтгэгчийн зэрэглэл', value: '—', note: 'мэдээлэл алга', status: 'idle' };
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    return {
      label: 'Гүйцэтгэгчийн зэрэглэл',
      value: `Тэргүүлэгч ${pct(best.p, 0)}`,
      note: `${best.c} · хойгуур ${worst.c} (${pct(worst.p, 0)})`,
      status: 'idle',
    };
  }, [bagtsQ]);

  // Карт бүр ХОЛБООТОЙ харагдац руу үсэрнэ (дэлгэрэнгүйг тэндээс)
  const cards: Card[] = [
    { ...schedule, view: 'tsogts' },     // хоцрогдолтой багцууд
    { ...finance, view: 'tsogts' },      // санхүүжилт vs гүйцэтгэлийн зөрүү KPI
    { ...safety, view: 'habea' },        // осол/зөрчлийн бүртгэл
    { ...urban, view: 'analysis' },      // тохиромжтой байдлын үнэлгээ
    { ...contractor, view: 'tsogts' },   // багц/гүйцэтгэгчийн задаргаа
  ];

  return (
    <section className={s.panel} aria-label="Гүйцэтгэлийн үнэлгээ">
      <header className={s.head}>
        <h2>Гүйцэтгэлийн үнэлгээ</h2>
        <span>Багц, гүйцэтгэгч, санхүүжилт, аюулгүй ажиллагаа, төлөвлөлтийн амьд дүгнэлт — дарж дэлгэрэнгүйг үзнэ</span>
      </header>
      <div className={s.grid}>
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            className={s.card}
            style={{ ['--st']: TONE[c.status] } as CSSProperties}
            onClick={() => onView(c.view)}
            title={`${c.label} — дэлгэрэнгүй рүү очих`}
          >
            <div className={s.top}>
              <i className={s.dot} />
              <span className={s.label}>{c.label}</span>
              <span className={s.go} aria-hidden>→</span>
            </div>
            <span className={s.value}>{c.value}</span>
            <span className={s.note}>{c.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

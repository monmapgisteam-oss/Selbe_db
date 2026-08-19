'use client';

import { useMemo, type CSSProperties } from 'react';
import { useAsync } from '@/lib/useAsync';
import { loadBudget, loadClearance, loadProjectProgress } from '@/lib/live';
import { loadFinData, contractMonths, lagOf, lagLevel } from '@/modules/Finance';
import { useBagtsTable, useSuitability } from '@/modules/Dashboard';
import { HABEA, CASHFLOW2, pkgKeyOf, type ViewKey } from '@/lib/services';
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
/**
 * ⚠️ Токен, hex БИШ. Урьд нь тогтмол hex байсан тул энэ зурвас нь ГАНЦ цайвар
 * горимд тохирч, харанхуйд гэрэлтэж/бүдгэрч байв. Эдгээр нь `--st` гэсэн CSS
 * ХУВЬСАГЧид ордог тул `var()` хэвийн задарч, горим солиход дагаж өөрчлөгдөнө.
 */
const TONE: Record<Status, string> = {
  good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', idle: 'var(--ink-3)',
};
type CardData = {
  label: string;
  value: string;
  note: string;
  status: Status;
  /** Зөвхөн АЛДААТАЙ картад — байвал карт дарахад харагдац солихын оронд дахин татна */
  retry?: () => void;
};
type Card = CardData & { view: ViewKey };

/**
 * Ачаалагдаагүй карт — АЧААЛЖ БАЙГАА ба АЛДАА хоёрыг ЯЛГАНА.
 *
 * ⚠️ 2026-08-19: Урьд нь карт бүр `state !== 'ready'` гэсэн ГАНЦ салаатай байсан
 * тул алдаа гарахад «…» + «ачаалж байна» гэсэн мөнхийн ХУДАЛ мэдэгдэл үлддэг
 * байв. `query.ts`-ийн тайлбарын дагуу ArcGIS-ийн «Too many requests» нь ердийн
 * үзэгдэл — 4 дахин оролдоод унасны дараа `useAsync` нь `error` төлөвт ордог ба
 * `retry()` бэлэн байдаг. Удирдлагын самбар дээр «ачаалж байна» гэж хэвтэх нь
 * хуудсыг бүхэлд нь refresh хийхээс өөр гарцгүй болгодог — яг тэр регрессийг
 * `useAsync.retry` арилгахаар хийгдсэн юм.
 *
 * ⚠️ Дуудлага нь ЗААВАЛ `state !== 'ready'` хамгаалалтын ДОТОР байна — тэгж
 * байж TypeScript үлдсэн кодод `q.data`-г null БИШ гэж нарийсгана.
 */
const notReady = (
  label: string,
  loadingNote: string,
  qs: { state: string; retry?: () => void }[],
): CardData => {
  const failed = qs.find((q) => q.state === 'error');
  if (failed)
    return { label, value: '—', note: 'Татагдсангүй — дарж дахин оролдоно уу', status: 'bad', retry: failed.retry };
  return { label, value: '…', note: loadingNote, status: 'idle' };
};

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clearQ = useAsync(loadClearance, []);

  // 1. Хуваарийн биелэлт — багц бүрийн хоцрогдол (Cashflow төлөвлөгөө vs биет %)
  const schedule = useMemo<CardData>(() => {
    if (finQ.state !== 'ready') return notReady('Хуваарийн биелэлт', 'Cashflow+IPC ачаалж байна', [finQ]);
    const C = CASHFLOW2.fields;
    const d = finQ.data;
    const seen = new Set<string>();
    let red = 0, yellow = 0, worst = 0, total = 0;
    d.contracts.forEach((r) => {
      // ⚠️ `pkgKeyOf` — «БАГЦ 1-4» мэт диапазон мөр `bagtsKey`-ээр «БАГЦ14» болж,
      //    бодит «Багц 14»-ийн оронд тоологдож хоцрогдлын тоог гажуудуулдаг байв.
      const key = pkgKeyOf(r[C.pkg2]) || pkgKeyOf(r[C.pkg]);
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
      return notReady('Санхүүжилт vs гүйцэтгэл', 'тооцож байна', [finQ, budgetQ, progQ]);
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
    if (incQ.state !== 'ready') return notReady('Аюулгүй ажиллагаа', 'ХАБЭА бүртгэл', [incQ]);
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
    if (suitQ.state !== 'ready') return notReady('Хот төлөвлөлтийн оноо', 'орон зайн анализ бодож байна', [suitQ]);
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
    if (bagtsQ.state !== 'ready') return notReady('Гүйцэтгэгчийн зэрэглэл', 'багц ачаалж байна', [bagtsQ]);
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

  // 6. Газар чөлөөлөлт — чөлөөлсөн % ба ЧӨЛӨӨЛӨӨГҮЙ үлдэгдэл (хэрэглэгчийн
  //    хүсэлт, 2026-08-18). Үлдсэн талбар нь барилга эхлүүлэхэд саад тул
  //    статусыг үлдэгдлийн жингээр өгнө.
  const clearance = useMemo<CardData>(() => {
    if (clearQ.state !== 'ready') return notReady('Газар чөлөөлөлт', 'кадастр ачаалж байна', [clearQ]);
    const d = clearQ.data;
    if (d.pct == null)
      return { label: 'Газар чөлөөлөлт', value: '—', note: 'өгөгдөл алга', status: 'idle' };
    return {
      label: 'Газар чөлөөлөлт',
      value: `Чөлөөлсөн ${pct(d.pct, 1)}`,
      note: `${num(d.remaining)} нэгж талбар чөлөөлөгдөөгүй (${num(d.remainingHa, 1)} га)`,
      status: d.pct >= 95 ? 'good' : d.pct >= 80 ? 'warn' : 'bad',
    };
  }, [clearQ]);

  // Карт бүр ХОЛБООТОЙ харагдац руу үсэрнэ (дэлгэрэнгүйг тэндээс)
  const cards: Card[] = [
    { ...schedule, view: 'tsogts' },     // хоцрогдолтой багцууд
    { ...finance, view: 'tsogts' },      // санхүүжилт vs гүйцэтгэлийн зөрүү KPI
    { ...clearance, view: 'gazar' },     // газар чөлөөлөлт — чөлөөлсөн/үлдсэн
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
            /* ⚠️ Карт нь өөрөө `<button>` тул дотор нь «дахин оролдох» товч
               ҮҮРЛҮҮЛЭХ боломжгүй (HTML зөвшөөрөхгүй). Алдаатай үед картын
               өөрийнх нь даралт л дахин татах үйлдэл болно — сум нь ⟲ болж
               өөрчлөгдөж, юу болохыг урьдчилан хэлнэ. */
            onClick={() => (c.retry ? c.retry() : onView(c.view))}
            title={c.retry ? `${c.label} — дахин татах` : `${c.label} — дэлгэрэнгүй рүү очих`}
          >
            <div className={s.top}>
              <i className={s.dot} />
              <span className={s.label}>{c.label}</span>
              <span className={s.go} aria-hidden>{c.retry ? '⟲' : '→'}</span>
            </div>
            <span className={s.value}>{c.value}</span>
            <span className={s.note}>{c.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

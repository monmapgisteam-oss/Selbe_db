'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { loadBudget, loadClearance, loadProjectProgress } from '@/lib/live';
import { loadFinData, contractMonths, lagOf, lagLevel } from '@/modules/Finance';
import { useBagtsTable, useSuitability } from '@/modules/Dashboard';
import { HABEA, CASHFLOW2, pkgKeyOf, type ViewKey } from '@/lib/services';
import { count, queryGroup } from '@/lib/query';
import { scoreLabel } from '@/lib/analysis/score';
import { num, pct } from '@/lib/format';
import { Bars, HBars, Ring, Spark } from './MiniChart';
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

type Status = 'good' | 'warn' | 'bad' | 'idle' | 'info';
/**
 * ⚠️ Токен, hex БИШ. Урьд нь тогтмол hex байсан тул энэ зурвас нь ГАНЦ цайвар
 * горимд тохирч, харанхуйд гэрэлтэж/бүдгэрч байв. Эдгээр нь `--st` гэсэн CSS
 * ХУВЬСАГЧид ордог тул `var()` хэвийн задарч, горим солиход дагаж өөрчлөгдөнө.
 */
const TONE: Record<Status, string> = {
  good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', idle: 'var(--ink-3)',
  /* ⚠️ `info` нь ГЭРЛЭН ДОХИО БИШ. «Сайн/муу» гэж дүгнэх боломжгүй үзүүлэлтэд
     (жишээ нь гүйцэтгэгчийн зэрэглэл) саарал биш, брэндийн өнгө тохирно. */
  info: 'var(--hue)',
};
type CardData = {
  label: string;
  value: string;
  note: string;
  status: Status;
  /**
   * Картын баруун талын жижиг график.
   * ⚠️ ЗӨВХӨН бодит цуваа/харьцаа байвал үзүүлнэ. Байхгүй бол ОРХИНО — хоосон
   * зайг дүүргэхийн тулд хиймэл дүрс ХЭЗЭЭ Ч зурахгүй.
   */
  chart?: ReactNode;
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
    return { label, value: '—', note: tr('Татагдсангүй — дарж дахин оролдоно уу'), status: 'bad', retry: failed.retry };
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
  /*
   * Осол/зөрчлийг ТӨРЛӨӨР нь бүлэглэж татна.
   * ⚠️ Урьд нь `queryCount` — зөвхөн нийт тоо. Тэгвэл картын график зурах
   * ЖИНХЭНЭ задаргаа байхгүй байв. Бүлэглэсэн асуулга нь нэг хүсэлтээр нийт
   * дүн БА задаргаа хоёуланг өгнө (нийт нь бүлгүүдийн нийлбэр).
   */
  const incQ = useAsync(() => queryGroup(
    HABEA.incident.url, HABEA.incident.fields.turul, [count('objectid', 'n')],
  ), []);
  const suitQ = useSuitability(true); // арын дэвсгэрт (хүнд, кэшлэнэ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clearQ = useAsync(loadClearance, []);

  // 1. Хуваарийн биелэлт — багц бүрийн хоцрогдол (Cashflow төлөвлөгөө vs биет %)
  const schedule = useMemo<CardData>(() => {
    if (finQ.state !== 'ready') return notReady(tr('Хуваарийн биелэлт'), tr('Cashflow+IPC ачаалж байна'), [finQ]);
    const C = CASHFLOW2.fields;
    const d = finQ.data;
    const seen = new Set<string>();
    let red = 0, yellow = 0, worst = 0, total = 0;
    // ⚠️ Багц бүрийн хоцрогдлыг ХАДГАЛНА — график энэ бодит цуваанаас зурагдана
    const gaps: number[] = [];
    /*
     * САР БҮРИЙН БИЕТ ГҮЙЦЭТГЭЛ — шугаман графикийн бодит эх сурвалж.
     * ⚠️ Дүн БИШ, ДУНДАЖ: гэрээ бүр өөр өөр сард эхэлдэг тул нийлбэр авбал
     * зүгээр л гэрээний тоог давхарлан харуулна.
     */
    const mn = CASHFLOW2.months.length;
    const physSum = new Array<number>(mn).fill(0);
    const physCnt = new Array<number>(mn).fill(0);
    d.contracts.forEach((r) => {
      // ⚠️ `pkgKeyOf` — «БАГЦ 1-4» мэт диапазон мөр `bagtsKey`-ээр «БАГЦ14» болж,
      //    бодит «Багц 14»-ийн оронд тоологдож хоцрогдлын тоог гажуудуулдаг байв.
      const key = pkgKeyOf(r[C.pkg2]) || pkgKeyOf(r[C.pkg]);
      if (!key || key === '0' || seen.has(key)) return;
      seen.add(key);
      const ms = contractMonths(r, d.given, d.phys);
      ms.forEach((m, i) => { if (m.phys > 0) { physSum[i] += m.phys; physCnt[i] += 1; } });
      const lag = lagOf(ms);
      if (!lag) return;
      total += 1;
      const lvl = lagLevel(lag.gap);
      if (lvl === 'red') red += 1;
      else if (lvl === 'yellow') yellow += 1;
      if (lag.gap > worst) worst = lag.gap;
      if (lag.gap > 0) gaps.push(lag.gap);
    });
    const lagging = red + yellow;
    /*
     * ⚠️ ХОЁР ТАЛААС нь хоосон саруудыг тайрна.
     *   ЭХЭНД — төсөл эхлэхээс өмнөх 0-үүд хавтгай сүүл болж өсөлтийг шахна.
     *   СҮҮЛД — мэдээлэл ирээгүй сар 0 болж бичигдэн ЭГЦ УНАЛТ мэт харагдана.
     *     «Өгөгдөл алга» гэдэг нь «гүйцэтгэл тэг болов» гэсэн үг БИШ.
     */
    const avg = physSum.map((v, i) => (physCnt[i] ? v / physCnt[i] : 0));
    const first = avg.findIndex((v) => v > 0);
    let lastIdx = avg.length - 1;
    while (lastIdx >= 0 && avg[lastIdx] <= 0) lastIdx -= 1;
    const series = first < 0 || lastIdx < first ? [] : avg.slice(first, lastIdx + 1);
    return {
      label: tr('Хуваарийн биелэлт'),
      value: lagging === 0 ? tr('Хэвийн') : tr('{0} багц хоцорч байна', num(lagging)),
      note: lagging === 0
        ? tr('{0} багц хуваарьтаа нийцэж байна', num(total))
        : tr('{0} эрсдэлтэй · {1} анхаарах · хамгийн муу −{2}%', num(red), num(yellow), worst.toFixed(0)),
      status: red > 0 ? 'bad' : yellow > 0 ? 'warn' : 'good',
      chart: series.length >= 2
        ? <Spark data={series} w={104} h={44} />
        // Цуваа богино бол хоцрогдлын хэмжээг багцаар нь үзүүлнэ
        : gaps.length ? <Bars data={gaps.sort((a, b) => b - a).slice(0, 10)} w={104} h={44} />
          : undefined,
    };
  }, [finQ]);

  // 2. Санхүүжилт vs гүйцэтгэл — олгосон (IPC) төсвийн %-ийг биет %-тэй харьцуулна
  const finance = useMemo<CardData>(() => {
    if (finQ.state !== 'ready' || budgetQ.state !== 'ready' || progQ.state !== 'ready')
      return notReady(tr('Санхүүжилт vs гүйцэтгэл'), tr('тооцож байна'), [finQ, budgetQ, progQ]);
    let given = 0;
    finQ.data.given.forEach((byMon) => byMon.forEach((v) => { given += v; }));
    const budget = budgetQ.data.total;
    const finPct = budget > 0 ? (given / budget) * 100 : 0;
    const physPct = progQ.data.actual;
    const gap = finPct - physPct;
    /*
     * САР БҮРИЙН IPC олголт — `CASHFLOW2.months`-ийн бодит цуваа.
     * ⚠️ Өсөлтийн ХАНДЛАГА биш, сар тутмын ДҮН тул шугам биш БАГАНА-аар
     * үзүүлнэ — шугам нь хуримтлалыг илэрхийлдэг.
     */
    const all = CASHFLOW2.months.map((m) => {
      let sum = 0;
      finQ.data.given.forEach((byMon) => { sum += byMon.get(m.label) ?? 0; });
      return sum;
    });
    // ⚠️ Сүүлийн хоосон саруудыг тайрна — «олголт зогссон» мэт хуурамч сүүл гарна
    let mLast = all.length - 1;
    while (mLast >= 0 && all[mLast] <= 0) mLast -= 1;
    const monthly = mLast < 0 ? [] : all.slice(0, mLast + 1);
    return {
      label: tr('Санхүүжилт vs гүйцэтгэл'),
      value: tr('Санхүүжилт {0} · Биет {1}', pct(finPct, 0), pct(physPct, 0)),
      note: Math.abs(gap) <= 5 ? tr('санхүүжилт гүйцэтгэлтэй тэнцвэртэй')
        : gap > 0 ? tr('санхүүжилт гүйцэтгэлээс {0}пп түрүүлж байна', gap.toFixed(0))
          : tr('гүйцэтгэл санхүүжилтээс {0}пп түрүүлж байна', (-gap).toFixed(0)),
      status: Math.abs(gap) <= 5 ? 'good' : Math.abs(gap) <= 15 ? 'warn' : 'bad',
      chart: monthly.some((x) => x > 0) ? <Bars data={monthly} w={104} h={44} /> : undefined,
    };
  }, [finQ, budgetQ, progQ]);

  // 3. Аюулгүй ажиллагаа — осол/зөрчлийн бүртгэлийн тоо (ХАБЭА)
  const safety = useMemo<CardData>(() => {
    if (incQ.state !== 'ready') return notReady(tr('Аюулгүй ажиллагаа'), tr('ХАБЭА бүртгэл'), [incQ]);
    const F = HABEA.incident.fields;
    // ⚠️ Төрөл ХООСОН мөр ч байж болно — тоолохоос хасахгүй, шошгыг нь л орлуулна
    const byType = incQ.data
      .map((r) => ({ label: String(r[F.turul] ?? '') || tr('Тодорхойгүй'), n: Number(r.n) || 0 }))
      .sort((a, b) => b.n - a.n);
    const n = byType.reduce((acc, x) => acc + x.n, 0);
    const top = byType[0];
    return {
      label: tr('Аюулгүй ажиллагаа'),
      value: n === 0 ? tr('Бүртгэлгүй') : tr('{0} осол/зөрчил', num(n)),
      note: top && n > 0
        ? tr('{0} төрөл · хамгийн олон нь «{1}» ({2})', num(byType.length), top.label, num(top.n))
        : tr('ХАБЭА-гийн нийт бүртгэл'),
      status: n === 0 ? 'good' : n <= 5 ? 'warn' : 'bad',
      chart: n > 0 ? <Bars data={byType.map((x) => x.n)} w={104} h={44} /> : undefined,
    };
  }, [incQ]);

  // 4. Хот төлөвлөлтийн оноо — тохиромжтой байдлын дундаж (арын дэвсгэрт)
  const urban = useMemo<CardData>(() => {
    if (suitQ.state !== 'ready') return notReady(tr('Хот төлөвлөлтийн оноо'), tr('орон зайн анализ бодож байна'), [suitQ]);
    const sc = suitQ.data.avgScore;
    if (sc == null)
      return { label: tr('Хот төлөвлөлтийн оноо'), value: '—', note: tr('өгөгдөл дутуу'), status: 'idle' };
    return {
      label: tr('Хот төлөвлөлтийн оноо'),
      value: `${Math.round(sc)} / 100`,
      note: tr('{0} · {1} бүсийн дундаж', scoreLabel(sc), num(suitQ.data.zones)),
      status: sc >= 65 ? 'good' : sc >= 45 ? 'warn' : 'bad',
      /*
       * ⚠️ Онооны ТҮҮХЭН цуваа БАЙХГҮЙ — өнөөдрийн ганц утга л бий. Өсөлтийн
       * шугам зурвал болоогүй ахиц зурсан болно. Тиймээс бүсүүдийн онооны
       * БОДИТ хуваарилалтыг (SCORE_LEVELS тус бүрд хэдэн бүс) үзүүлэв.
       */
      chart: <Spark data={suitQ.data.levels.map((L) => L.n)} w={104} h={44} />,
    };
  }, [suitQ]);

  // 5. Гүйцэтгэгчийн зэрэглэл — блокоор жигнэсэн дундаж явцаар (тэргүүлэгч/хойгуур)
  const contractor = useMemo<CardData>(() => {
    if (bagtsQ.state !== 'ready') return notReady(tr('Гүйцэтгэгчийн зэрэглэл'), tr('багц ачаалж байна'), [bagtsQ]);
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
      return { label: tr('Гүйцэтгэгчийн зэрэглэл'), value: '—', note: tr('мэдээлэл алга'), status: 'idle' };
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    return {
      label: tr('Гүйцэтгэгчийн зэрэглэл'),
      value: tr('Тэргүүлэгч {0}', pct(best.p, 0)),
      note: tr('{0} · хойгуур {1} ({2})', tr(best.c), tr(worst.c), pct(worst.p, 0)),
      // ⚠️ Зэрэглэл нь «сайн/муу» гэсэн гэрлэн дохио БИШ — `info` өнгө
      status: 'info',
      chart: <HBars items={ranked.slice(0, 4).map((r) => ({ label: r.c, value: r.p }))} max={100} />,
    };
  }, [bagtsQ]);

  // 6. Газар чөлөөлөлт — чөлөөлсөн % ба ЧӨЛӨӨЛӨӨГҮЙ үлдэгдэл (хэрэглэгчийн
  //    хүсэлт, 2026-08-18). Үлдсэн талбар нь барилга эхлүүлэхэд саад тул
  //    статусыг үлдэгдлийн жингээр өгнө.
  const clearance = useMemo<CardData>(() => {
    if (clearQ.state !== 'ready') return notReady(tr('Газар чөлөөлөлт'), tr('кадастр ачаалж байна'), [clearQ]);
    const d = clearQ.data;
    if (d.pct == null)
      return { label: tr('Газар чөлөөлөлт'), value: '—', note: tr('өгөгдөл алга'), status: 'idle' };
    return {
      label: tr('Газар чөлөөлөлт'),
      value: tr('Чөлөөлсөн {0}', pct(d.pct, 1)),
      note: tr('{0} нэгж талбар чөлөөлөгдөөгүй ({1} га)', num(d.remaining), num(d.remainingHa, 1)),
      status: d.pct >= 95 ? 'good' : d.pct >= 80 ? 'warn' : 'bad',
      chart: <Ring value={d.pct} size={74} width={9} label={pct(d.pct, 0)} />,
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
    <section className={s.panel} aria-label={tr('Гүйцэтгэлийн үнэлгээ')}>
      <header className={s.head}>
        <h2>{tr('Гүйцэтгэлийн үнэлгээ')}</h2>
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
            title={c.retry ? tr('{0} — дахин татах', c.label) : tr('{0} — дэлгэрэнгүй рүү очих', c.label)}
          >
            <div className={s.top}>
              <i className={s.dot} />
              <span className={s.label}>{c.label}</span>
              <span className={s.go} aria-hidden>{c.retry ? '⟲' : '→'}</span>
            </div>
            {/* ⚠️ График нь `--st` өнгийг `color`-оор өвлөнө — SVG нь
                `currentColor` ашигладаг тул энд өөр өнгө тавихгүй */}
            <div className={s.body}>
              <span className={s.text}>
                <span className={s.value}>{c.value}</span>
                <span className={s.note}>{c.note}</span>
              </span>
              {c.chart && <span className={s.chart}>{c.chart}</span>}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

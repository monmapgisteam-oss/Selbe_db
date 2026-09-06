'use client';

/**
 * НҮҮРИЙН УДИРДЛАГЫН САМБАР — СХЕМ ӨӨРӨӨ ДАШБОАРД.
 *
 * ⚠️ 2026-09-06, хэрэглэгчийн шийдвэр: «KPI-ийн одоо байгаа дизайн ойлгомжгүй,
 * энэ загварыг бүрэн хал; схем төвд, KPI-ууд схемийг тойрсон бүтэцтэй». Хоёр
 * хувилбар танилцуулснаас **KPI-г схемийн ДОТОР** гэдгийг сонгосон.
 *
 * ⚠️ ЯАГААД ДЭРГЭД БИШ, ДОТОР ВЭ. Схемийн хажууд байрлах KPI карт зангилаатайгаа
 * зөвхөн БАЙРЛАЛААР холбогдоно — дэлгэцийн өргөн өөрчлөгдөх, багана нурах бүрд
 * тэр холбоос эвдэрч «энэ тоо аль алхамынх вэ» гэдэг дахин ойлгомжгүй болно.
 * Зангилааны дотор байрлуулснаар холбоос нь БАЙНГЫН.
 *
 * ⚠️ ХОЁР ДАХЬ АШИГ: «яагаад улаан байна вэ» гэдэг ЗУРАГТ харагдана. Дээд
 * урсгалын улаан зангилаа (жиш. Газар чөлөөлөлт) доод урсгалынхаа улааныг
 * (Барилга угсралт) тайлбарлана — хавтгай жагсаалт үүнийг ХЭЗЭЭ Ч хэлж чадахгүй.
 *
 * ⚠️ ӨГӨГДӨЛ ШИНЭЭР БИЧИГДЭЭГҮЙ. Зангилаа бүрийн амьд тоо нь `buildSchem()`
 * -ээс — «Үйл ажиллагааны схем» харагдацтай ЯГ НЭГ эх сурвалж, нэг босго, нэг
 * тооцоо (`schem.check.mjs` шалгадаг). Хоёр газар өөрөөр бодвол нүүр ба схем
 * зөрөх бөгөөд аль нь үнэн болохыг хэрэглэгч мэдэхгүй.
 *
 * ⚠️ ХАМРАХ ХҮРЭЭНИЙ ТОО ТУСДАА ЗУРВАСТ (хэрэглэгчийн сонголт): талбай, хүн ам,
 * блок, нийгмийн байгууламж зэрэг нь ҮЕ ШАТАНД хамаарахгүй — тэдгээр нь
 * төслийн ХЭМЖЭЭ буюу контекст. Зангилаанд шахвал «Ерөнхий төлөвлөгөө» долоон
 * тоотой болж бусдаасаа хэмжээгээр давж, урсгалын тэнцвэр алдагдана.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { useAsync } from '@/lib/useAsync';
import { loadHeadline, loadHousing, loadSocial } from '@/lib/live';
import { loadSchemSources } from '@/lib/schemData';
import { nodeDetail, type Cell, type DetailTable } from '@/lib/schemDetail';
import { useExecMetrics } from './execMetrics';
import { nodeOf, supersededLabels } from '@/lib/kpiNodes';
import { LEVEL_TONE, levelLabel, type Level } from '@/lib/kpiLevels';
import type { Metric as KpiMetric } from '@/lib/kpiModel';
import {
  NODES, buildSchem,
  type Health, type Metric, type SchemId, type SchemNode,
} from '@/lib/schem';
import { num, pct, mnt } from '@/lib/format';
import type { ViewKey } from '@/lib/services';
import s from './homeBoard.module.css';

/* ══════════════ Туслах ══════════════ */

/**
 * Метрикийн утга → текст.
 * ⚠️ `null` нь «—» — ТЭГ-ээр ХЭЗЭЭ Ч орлуулахгүй (төслийн үндсэн дүрэм).
 * ⚠️ `Schem.tsx`-ийн `show()`-той ИЖИЛ дүрэм. Хоёр газар өөрөөр форматлавал
 *    нэг тоо хоёр дэлгэцэд өөр харагдана.
 */
function show(m: Metric): string {
  if (m.value == null) return '—';
  switch (m.kind) {
    case 'pct': return pct(m.value, 0);
    case 'mnt': return mnt(m.value);
    case 'ha': return `${num(m.value, 1)} ${tr('га')}`;
    case 'day': return tr('{0} хоног', num(m.value));
    default: return num(m.value);
  }
}

const HEALTH_TONE: Record<Health, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  none: 'var(--ink-3)',
};
/* ⚠️ `healthText` ХАСАГДСАН (2026-09-06): дүгнэлтийн шошго одоо ГАНЦ эх
   сурвалжтай — `levelLabel` (`kpiLevels.ts`). Схемийн `Health` нь
   `HEALTH_AS_LEVEL`-ээр эхлээд `Level` рүү хөрвөнө. Хоёр өөр шошгын
   функцтэй байхад «Хэвийн» гэсэн үг хоёр газар бичигдэж, нэгийг нь
   өөрчлөхөд нөгөө нь чимээгүй хоцордог байв. */

/**
 * ЗАНГИЛААНЫ ЭЦСИЙН ДОХИО — `buildSchem`-ийн `health` ба тэр зангилаанд
 * харьяалагдах `execMetrics` үзүүлэлтүүдийн ХАМГИЙН МУУГИЙН нийлбэр.
 *
 * ⚠️ ЯАГААД ХОЁР ЭХ СУРВАЛЖ ВЭ. `buildSchem` нь схемийн өөрийн тоонуудаас
 * дүгнэдэг ч түүнд ОГТ БАЙХГҮЙ дохио бий — обьёмын зөрүү (56.8 тэрбум ₮),
 * нэгж талбарын давхцал, санхүүжилт↔гүйцэтгэлийн зөрүү, ослын хохирол.
 * Зөвхөн нэгээр нь дүгнэвэл тэдгээр улаанууд зангилаан дээр ХАРАГДАХГҮЙ.
 *
 * ⚠️ `loading`/`unknown`/`neutral` нь дохио БИШ — «хараахан мэдэхгүй» гэдгийг
 * улаан/шар болгож болохгүй.
 */
const RANK: Record<Level, number> = {
  bad: 0, warn: 1, good: 2, neutral: 3, unknown: 4, loading: 5,
};
function worstLevel(list: readonly Level[]): Level | null {
  let best: Level | null = null;
  for (const l of list) {
    if (l !== 'bad' && l !== 'warn' && l !== 'good') continue;
    if (best == null || RANK[l] < RANK[best]) best = l;
  }
  return best;
}

/**
 * ДОХИОНЫ ТООЛУУР — «!3» / «▲1».
 *
 * ⚠️ ЯАГААД ҮГИЙН ОРОНД ТОО ВЭ (2026-09-06). Эхний хувилбарт зангилаа бүр
 * «Яаралтай» гэсэн ШОШГОТОЙ байв — амьд өгөгдөл дээр 10 зангилааны 7 нь улаан
 * болж, гэрлэн дохио утгаа АЛДСАН: бүгд улаан бол алийг нь эхэлж шийдэхээ
 * хэрэглэгч мэдэхгүй. Тоо нь ЭРЭМБЭ өгнө — «!3» нь «!1»-ээс эхэнд.
 *
 * ⚠️ Зөвхөн улаан ба шар. Ногооныг тоолвол «✓5» гэсэн тэмдэг нь анхаарлыг
 * ХЭВИЙН зангилаа руу татна.
 */
function signalCounts(list: readonly Level[]): { bad: number; warn: number } {
  let bad = 0;
  let warn = 0;
  for (const l of list) {
    if (l === 'bad') bad += 1;
    else if (l === 'warn') warn += 1;
  }
  return { bad, warn };
}

/** Схемийн `Health` → KPI-ийн `Level` (нэг хэл рүү) */
const HEALTH_AS_LEVEL: Record<Health, Level> = {
  good: 'good', warn: 'warn', bad: 'bad', none: 'neutral',
};

/** Багана → зангилаанууд (баганын дугаараар, дотроо мөрөөр) */
function columns(): { col: number; list: SchemNode[] }[] {
  const by = new Map<number, SchemNode[]>();
  for (const n of NODES) by.set(n.col, [...(by.get(n.col) ?? []), n]);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, list]) => ({ col, list: [...list].sort((a, b) => a.row - b.row) }));
}

/* ══════════════ Хамрах хүрээний зурвас ══════════════ */

/**
 * ТӨСЛИЙН ХЭМЖЭЭ — үе шатанд хамаарахгүй контекст.
 *
 * ⚠️ ГЭРЛЭН ДОХИО ТАВИХГҮЙ. «158 га» нь сайн ч биш, муу ч биш — өнгө оногдуулбал
 * хэрэглэгчид «энэ талбай хангалттай юу» гэсэн хариултгүй асуулт төрүүлнэ.
 * Тиймээс зурвас нь бүхэлдээ саарал, зөвхөн ТОО ба ШОШГО.
 */
function ScopeStrip({ onView }: { onView: (k: ViewKey) => void }) {
  const headQ = useAsync(loadHeadline, []);
  const housQ = useAsync(loadHousing, []);
  const socQ = useAsync(loadSocial, []);

  const hd = headQ.state === 'ready' ? headQ.data : null;
  const hs = housQ.state === 'ready' ? housQ.data : null;
  const sc = socQ.state === 'ready' ? socQ.data : null;

  /* ⚠️ `Number.isFinite` — `loadHeadline` нь хэсэгчилсэн уналтад `NaN` буцаадаг
     (`allSettled`). `NaN` -ыг `num()` рүү дамжуулбал «NaN» гэж хэвлэгдэнэ. */
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

  const tiles: { key: string; label: string; value: string; view: ViewKey }[] = [
    { key: 'area', label: tr('Төслийн талбай'), value: ok(hd?.areaHa) ? tr('{0} га', num(hd.areaHa, 1)) : '…', view: 'plan' },
    { key: 'pop', label: tr('Хамрагдах хүн ам'), value: ok(hd?.population) ? num(hd.population) : '…', view: 'irged' },
    { key: 'blocks', label: tr('Барилгын блок'), value: hs ? num(hs.blocks) : '…', view: 'pkgProg' },
    { key: 'usable', label: tr('Барилгажих талбай'), value: ok(hd?.usableM2) ? tr('{0} м²', num(hd.usableM2, 0)) : '…', view: 'plan' },
    { key: 'social', label: tr('Нийгмийн байгууламж'), value: sc ? num(sc.totalN) : '…', view: 'irged' },
    { key: 'green', label: tr('Ногоон байгууламж'), value: ok(hd?.greenHa) ? tr('{0} га', num(hd.greenHa, 1)) : '…', view: 'plan' },
  ];

  return (
    <div className={s.scope} role="group" aria-label={tr('Төслийн хэмжээ')}>
      {tiles.map((t) => (
        <button key={t.key} type="button" className={s.scopeTile} onClick={() => onView(t.view)}>
          <span className={`${s.scopeVal} num`}>{t.value}</span>
          <span className={s.scopeLbl}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * ЗАНГИЛААНЫ ЗАДАРГААНЫ ХҮСНЭГТ.
 *
 * ⚠️ Хэвтээ гүйлт нь ХҮСНЭГТ ДОТРОО (`.tWrap`) — хуудас өөрөө хэвтээ гүйвэл
 * зүүн талын навигаци алга болно.
 * ⚠️ `null` нь «—»: тооцоологдоогүй нүдийг 0 гэж бичвэл өгөгдөлгүйг «тэг
 * үзүүлэлт» гэж уншина (энэ репогийн хамгийн олон давтагдсан алдаа).
 */
function Table({ t }: { t: DetailTable }) {
  const text = (c: Cell): string => {
    if (c.v == null || c.v === '') return '—';
    if (typeof c.v !== 'number') return String(c.v);
    switch (c.kind) {
      case 'pct': return pct(c.v, 0);
      case 'mnt': return mnt(c.v);
      case 'ha': return `${num(c.v, 1)} ${tr('га')}`;
      case 'day': return tr('{0} хоног', num(c.v));
      default: return num(c.v);
    }
  };
  return (
    <div className={s.tBox}>
      <div className={s.tTitle}>{t.title}</div>
      <div className={s.tWrap}>
        <table className={s.tbl}>
          <thead>
            <tr>{t.cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={typeof c.v === 'number' ? `num ${s.tNum}` : undefined}>
                    {text(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ Гол самбар ══════════════ */

export function HomeBoard({ onView }: { onView: (key: ViewKey) => void }) {
  const srcQ = useAsync(loadSchemSources, []);
  /* ⚠️ Hook — ЗААВАЛ дээд түвшинд, нөхцөлгүй (React-ийн дүрэм) */
  const exec = useExecMetrics();

  /** Зангилаа → тэр алхамд харьяалагдах `execMetrics` үзүүлэлтүүд */
  const byNode = useMemo(() => {
    const m = new Map<SchemId, KpiMetric[]>();
    for (const x of exec) {
      const id = nodeOf(x.key);
      /* ⚠️ `null` (хамрах хүрээ) ба `undefined` (зураглалгүй) хоёулаа
         зангилаанд ОРОХГҮЙ — эхнийх нь дээд зурваст, хоёр дахийг нь
         `kpiNodes.check.mjs` барина. */
      if (!id) continue;
      m.set(id, [...(m.get(id) ?? []), x]);
    }
    return m;
  }, [exec]);
  /* ⚠️ Багц СОНГОХГҮЙ (`null`) — нүүр нь ТӨСЛИЙН зураг. Багцаар задлах нь
     «Үйл ажиллагааны схем» харагдацын ажил. */
  const live = useMemo(
    () => (srcQ.state === 'ready' ? buildSchem(srcQ.data, null) : null),
    [srcQ],
  );

  /**
   * ХАМГИЙН АСУУДАЛТАЙ ЗАНГИЛАА — улаан дохионы тоогоор, тэнцвэл шараар.
   *
   * ⚠️ Дата ирэхээс ӨМНӨ `null` — «эхний зангилааг нээе» гэж таамаглавал дата
   * ирэхэд самбар өөрөө үсэрч, хэрэглэгчийн уншиж байсан зүйл алга болно.
   */
  const worstNode = useMemo<SchemId | null>(() => {
    let best: { id: SchemId; bad: number; warn: number } | null = null;
    for (const n of NODES) {
      const c = signalCounts((byNode.get(n.id) ?? []).map((x) => x.level));
      if (c.bad + c.warn === 0) continue;
      if (!best || c.bad > best.bad || (c.bad === best.bad && c.warn > best.warn)) {
        best = { id: n.id, bad: c.bad, warn: c.warn };
      }
    }
    return best?.id ?? null;
  }, [byNode]);

  /**
   * Дэлгэрэнгүй нээгдсэн зангилаа — НЭГ зэрэг ганц.
   *
   * ⚠️ АНХДАГЧААР ХАМГИЙН МУУГ НЬ НЭЭНЭ (2026-09-06). Хоосон самбар нь
   * «юунаас эхлэх вэ» гэсэн асуултыг хэрэглэгч рүү шилжүүлдэг; удирдлагын
   * самбарын үүрэг бол эсрэгээрээ ТЭР асуултад хариулах явдал.
   * ⚠️ Хэрэглэгч ХААСАН бол хаалттай хэвээр (`touched`) — эс бөгөөс дата
   * сэргэх бүрд самбар өөрөө дахин нээгдэж, хаах товч ажиллахгүй мэт болно.
   */
  const [openId, setOpenId] = useState<SchemId | null>(null);
  const [touched, setTouched] = useState(false);
  const shownId = touched ? openId : openId ?? worstNode;
  const open = shownId ? NODES.find((n) => n.id === shownId) ?? null : null;
  const openState = open && live ? live[open.id] : null;
  /* Тэр алхмын нэмэлт дохионууд — `buildSchem`-д байхгүй нь */
  const openExec = open ? byNode.get(open.id) ?? [] : [];
  /*
   * ⚠️ ДАВХАРДЛЫГ АРИЛГАНА (2026-09-06-ны согог). `buildSchem` ба
   *    `execMetrics` хоёр НЭГ зүйлийг өөр аргачлалаар боддог тул дэлгэц дээр
   *    «Гүйцэтгэл 4%» ба «Барилга угсралтын гүйцэтгэл 3.8%» зэрэгцэн зогсож
   *    байв. Аль нь албан ёсны болохыг `SUPERSEDES` шийднэ.
   */
  const hidden = supersededLabels(openExec.map((x) => x.key));

  /**
   * ЗАНГИЛААНЫ БҮРЭН ДЭЛГЭРЭНГҮЙ — `nodeDetail()`.
   *
   * ⚠️ 2026-09-06, хэрэглэгч: «мэдээллүүд бүрэн харагдах ёстой… «Зөвшөөрөл»
   * дээр гэхэд л ямар бичиг баримт асуудалтай байгаа нь харагдахгүй, зөвхөн
   * 2 гэж байгаа нь утгагүй. Энэ цонхноос бүрэн асуудалтай бүх зүйлээ харж
   * чаддаг байх ёстой».
   *
   * ⚠️ ЭНЭ НЬ ШИНЭ ХҮСЭЛТ ҮҮСГЭХГҮЙ. `schemDetail` нь `SchemSources` аль
   * хэдийн татсан мөрүүд дээр л ажилладаг (тэр модулийн толгойн ⚠️-г үз):
   * `zov` нь зөвшөөрлийн БҮХ мөр, `review` нь хяналтын БҮХ мөр, `bagts` нь
   * багц бүрийн задаргааг агуулна. Өгөгдөл дутуу байгаагүй — ДЭЛГЭЦЭД
   * ГАРААГҮЙ байсан.
   *
   * ⚠️ «Үйл ажиллагааны схем» харагдацтай НЭГ функц — хоёр дэлгэц ижил
   * агшинд өөр тоо харуулах боломжгүй.
   */
  const detail = useMemo(
    () => (open && srcQ.state === 'ready' ? nodeDetail(srcQ.data, open.id, null) : null),
    [open, srcQ],
  );
  /* ⚠️ Орлуулагдсаныг ЭНД Ч хасна — `nodeDetail` нь `buildSchem`-ээс
     хамаардаггүй тул давхардал өөр замаар буцаж орж ирнэ. */
  const openSchem = (detail?.metrics ?? openState?.metrics ?? [])
    .filter((m) => !hidden.has(m.label));

  const cols = columns();

  return (
    <section className={s.board} aria-label={tr('Удирдлагын үзүүлэлт')}>
      <header className={s.head}>
        <h2 className={s.title}>{tr('Төслийн үйл ажиллагаа')}</h2>
        <p className={s.sub}>
          {tr('Алхам бүр өөрийн амьд үзүүлэлттэй. Дарж дэлгэрэнгүйг үзнэ.')}
        </p>
      </header>

      <ScopeStrip onView={onView} />

      {/*
        * ⚠️ `<ol>` — ЖАГСААЛТ биш ДАРААЛАЛ. Дэлгэц уншигч «1 из 6» гэж уншсанаар
        *    урсгалын мөн чанар дуу хоолойгоор ч дамжина.
        * ⚠️ Хэвтээ ГҮЙЛТ нь ЗӨВХӨН энд — хуудас өөрөө хэвтээ гүйхгүй.
        */}
      <ol className={s.flow}>
        {cols.map(({ col, list }, i) => (
          <li key={col} className={s.step}>
            <div className={s.stack}>
              {list.map((n) => {
                const st = live ? live[n.id] : null;
                const ex = byNode.get(n.id) ?? [];
                /* Схемийн дүгнэлт + тэр алхмын үзүүлэлтүүдийн хамгийн муу */
                /*
                 * ⚠️ ДОХИОНЫ ЭХ СУРВАЛЖ НЭГ БАЙХ ЁСТОЙ. Үзүүлэлт (`ex`) байвал
                 *    ЗӨВХӨН тэдгээр; схемийн `health` нь ХЭРЭГЛЭГДЭХГҮЙ.
                 *
                 *    Шалтгаан: `buildSchem`-ийн дүгнэлт нь ӨӨРИЙНХӨӨ метрикээс
                 *    гардаг бөгөөд тэдгээрийн заримыг үзүүлэлт нь ОРЛУУЛСАН
                 *    (`SUPERSEDES`). Хоёуланг нийлүүлбэл орлуулагдсан тоо
                 *    дүгнэлтээрээ буцаж орж ирнэ: «Барилга угсралт» картын
                 *    ирмэг УЛААН (схемийн 4%) атлаа тэмдэг нь «▲1» (үзүүлэлтийн
                 *    3.8% → анхаарах) болж зөрж байв.
                 * ⚠️ Үзүүлэлтгүй зангилаанд (Зөвшөөрөл · Эрсдэл · Тайлан)
                 *    схемийн дүгнэлт ХЭВЭЭР — өөр эх сурвалж байхгүй.
                 */
                const levels = ex.length
                  ? ex.map((x) => x.level)
                  : st ? [HEALTH_AS_LEVEL[st.health]] : [];
                const lv = worstLevel(levels);
                const cnt = signalCounts(levels);
                /*
                 * ⚠️ КАРТАД ЭХЛЭЭД СХЕМИЙН тоо, ДАРАА нь ДОХИОТОЙ үзүүлэлт.
                 *    Шалтгаан: «Хуваарь» зангилааны схем-метрик нь `null`
                 *    (хуваарь багц бүрээр ачаалагддаг) тул зөвхөн схемээр
                 *    дүүргэвэл карт нь «—» ганцхан мөртэй атлаа УЛААН тэмдэгтэй
                 *    болж, шалтгаан нь ХААНА Ч харагдахгүй байв.
                 * ⚠️ Дохиогүй (`neutral`/`loading`) үзүүлэлтийг картад
                 *    оруулахгүй — тэдгээр нь дэлгэрэнгүйд бүрэн гарна.
                 */
                /* ⚠️ Орлуулагдсан схем-метрик КАРТ ДЭЭР Ч гарахгүй — эс
                   бөгөөс карт «4%», дэлгэрэнгүй «3.8%» гэж нэг зүйлийн тухай
                   хоёр өөр тоо зэрэгцэн зогсоно (2026-09-06-ны согог). */
                const skip = supersededLabels(ex.map((x) => x.key));
                const rows: { k: string; val: string; lbl: string; none: boolean }[] = [
                  ...(st ? st.metrics : []).filter((m) => !skip.has(m.label)).map((m) => ({
                    k: m.label, val: show(m), lbl: m.label, none: m.value == null,
                  })),
                  ...ex
                    .filter((x) => x.level === 'bad' || x.level === 'warn')
                    .map((x) => ({ k: x.key, val: x.value, lbl: x.label, none: false })),
                ].slice(0, 3);
                const on = shownId === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`${s.node} ${on ? s.nodeOn : ''}`}
                    style={{ ['--h']: lv ? LEVEL_TONE[lv] : HEALTH_TONE['none'] } as CSSProperties}
                    aria-expanded={on}
                    onClick={() => { setTouched(true); setOpenId(on ? null : n.id); }}
                    title={n.desc}
                  >
                    <span className={s.nodeHead}>
                      <span className={s.nodeIcon} aria-hidden><Icon name={n.icon} size={15} /></span>
                      <span className={s.nodeTitle}>{n.title}</span>
                      {/* ⚠️ Өнгө ГАНЦААРАА утга дамжуулж болохгүй (WCAG 1.4.1) —
                          дүгнэлт нь ҮГЭЭР ч бичигдэнэ. `none` үед тэмдэг гарахгүй:
                          «дүгнэлтгүй» гэсэн шошго нь мэдээлэл биш чимээ. */}
                      {/* ⚠️ Өнгө ГАНЦААРАА утга дамжуулж болохгүй (WCAG 1.4.1)
                          — тэмдэг ба тоо нь дэлгэц уншигчид бүрэн үгээр гарна */}
                      {lv && (
                        <span className={s.nodeTag}>
                          {cnt.bad + cnt.warn > 0 ? (
                            <>
                              {cnt.bad > 0 && <b className="num">{tr('!{0}', num(cnt.bad))}</b>}
                              {cnt.warn > 0 && <i className={`${s.tagWarn} num`}>{tr('▲{0}', num(cnt.warn))}</i>}
                              <em className={s.sr}>{levelLabel(lv)}</em>
                            </>
                          ) : levelLabel(lv)}
                        </span>
                      )}
                    </span>
                    {/*
                      * ⚠️ ГУРВААС ИЛҮҮГҮЙ. `buildSchem` зарим зангилаанд 4 метрик
                      *    өгдөг ч зангилааны хайрцаг өндөрсвөл урсгал шүдэрхэг
                      *    болно. Бүгд нь дэлгэрэнгүй самбарт гарна.
                      * ⚠️ Ачаалж байхад МӨРИЙН ТОО ХЭВЭЭР (араг яс) — эс бөгөөс
                      *    дата ирэхэд бүх зангилаа өндөрсөж зохиомж үсэрнэ.
                      */}
                    <span className={s.nodeStats}>
                      {(rows.length ? rows : [null, null]).map((r, k) => (
                        <span key={r ? r.k : `sk-${k}`} className={s.stat}>
                          <b className={`${s.statVal} num ${r?.none ? s.statNone : ''} ${r ? '' : s.statSkel}`}>
                            {r ? r.val : ''}
                          </b>
                          <i className={s.statLbl}>{r ? r.lbl : ''}</i>
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            {i < cols.length - 1 && <span className={s.arrow} aria-hidden>→</span>}
          </li>
        ))}
      </ol>

      {/*
        * ДЭЛГЭРЭНГҮЙ — сонгосон зангилааны БҮХ үзүүлэлт.
        * ⚠️ Зангилааны ДООР, тусдаа самбарт: зангилааны дотор дэлгэвэл эргэн
        *    тойрны бүх карт хөдөлж, урсгалын зураг алдагдана.
        */}
      {open && (
        <div className={s.detail} style={{ ['--h']: HEALTH_TONE[openState?.health ?? 'none'] } as CSSProperties}>
          <header className={s.dHead}>
            <span className={s.nodeIcon} aria-hidden><Icon name={open.icon} size={16} /></span>
            <span className={s.dText}>
              <b className={s.dTitle}>{open.title}</b>
              <span className={s.dDesc}>{open.desc}</span>
            </span>
            {/* ⚠️ Картынхтай ЯГ НЭГ дүрэм: үзүүлэлт байвал тэднийх,
                эс бөгөөс схемийнх. Хоёр газар өөрөөр бодвол гарчиг ба карт
                зөрнө. */}
            {(() => {
              const dl = openExec.length
                ? worstLevel(openExec.map((x) => x.level))
                : openState && openState.health !== 'none'
                  ? HEALTH_AS_LEVEL[openState.health] : null;
              return dl ? <span className={s.nodeTag}>{levelLabel(dl)}</span> : null;
            })()}
            {open.view && (
              <button type="button" className={s.dGo} onClick={() => onView(open.view as ViewKey)}>
                {tr('Харагдац руу орох')}
                <span aria-hidden>→</span>
              </button>
            )}
            <button
              type="button"
              className={s.dClose}
              onClick={() => { setTouched(true); setOpenId(null); }}
              aria-label={tr('Хаах')}
            >
              ✕
            </button>
          </header>

          {srcQ.state === 'error' ? (
            <p className={s.dNote}>{tr('Үзүүлэлт татагдсангүй.')}</p>
          ) : !openState ? (
            <p className={s.dNote}>{tr('Ачаалж байна…')}</p>
          ) : (
            <>
              {/*
                * ГОЛ ҮЗҮҮЛЭЛТҮҮД — шошго · тоо · дүгнэлт · ЗАДАРГАА.
                *
                * ⚠️ 2026-09-06, хэрэглэгч: «тайлбар биш бодит үзүүлэлт гарахад
                *    л болно». Түр хугацаанд үзүүлэлт бүрд «энэ юуг хэмжсэн бэ»
                *    ба «ямар босгоор өнгө нь тогтдог вэ» гэсэн ТЕКСТ бичигдсэн
                *    байсныг ХАСАВ — самбарын мөр бүр гурван мөр зохиол болж,
                *    ТОО нь тэдгээрийн дунд живж байлаа.
                * ⚠️ `note` нь ҮЛДЭНЭ: тэр нь зохиол БИШ, тухайн тооны ЗАДАРГАА
                *    («8/113 блок · хамгийн их: Багц 1») буюу бодит өгөгдөл.
                */}
              {openExec.length > 0 && (
                <ul className={s.dList}>
                  {openExec.map((x) => (
                    <li
                      key={x.key}
                      className={s.dRow}
                      style={{ ['--h']: LEVEL_TONE[x.level] } as CSSProperties}
                    >
                      <span className={s.dRowMain}>
                        <b className={s.dRowLbl}>{x.label}</b>
                        <span className={`${s.dRowVal} num`}>{x.value}</span>
                        <span className={s.dRowLvl}>{levelLabel(x.level)}</span>
                      </span>
                      {x.note && <span className={s.dRowNote}>{x.note}</span>}
                    </li>
                  ))}
                </ul>
              )}

              {/*
                * НЭМЭЛТ ТОО — схемийн зангилааны өөрийн үзүүлэлт, дүгнэлтгүй.
                * ⚠️ ОРЛУУЛАГДСАН нь эндээс ХАСАГДСАН (`hidden`): нэг зүйлийн
                *    тухай хоёр өөр тоо зэрэгцэн зогсох нь итгэлийг эвдэнэ.
                */}
              {openSchem.length > 0 && (
                <div className={s.dGrid}>
                  {openSchem.map((m) => (
                    <span key={m.label} className={s.dStat}>
                      <b className={`${s.dVal} num ${m.value == null ? s.statNone : ''}`}>{show(m)}</b>
                      <i className={s.dLbl}>{m.label}</i>
                      {/* ⚠️ `why` нь `null`-ын ШАЛТГААН — чимээгүй алга болгохгүй */}
                      {m.value == null && m.why && <em className={s.dWhy}>{m.why}</em>}
                    </span>
                  ))}
                </div>
              )}
              {/*
                * АСУУДЛУУД — «юу нь болохгүй байна» гэдгийг НЭР ЗААЖ хэлнэ.
                * ⚠️ Тоо (жиш. «Зөвшөөрөөгүй 1») нь асуудал БАЙГААГ хэлдэг ч
                *    АЛЬ НЬ болохыг хэлдэггүй — хэрэглэгчийн гомдол яг энэ тухай.
                */}
              {detail && detail.issues.length > 0 && (
                <ul className={s.dIssues}>
                  {detail.issues.map((is, i) => (
                    <li key={i} className={s.dIssue} style={{ ['--h']: HEALTH_TONE[is.tone] } as CSSProperties}>
                      {is.text}
                    </li>
                  ))}
                </ul>
              )}

              {/* ЗАДАРГАА — багц/мөр тутмын БҮХ өгөгдөл */}
              {detail?.tables.map((t) => <Table key={t.title} t={t} />)}

              {/*
                * ЭХ СУРВАЛЖ — «—» гэсэн нүд нь ҮЙЛЧИЛГЭЭ УНАСНААС уу, эсвэл
                * үнэхээр өгөгдөл байхгүйгээс үү гэдгийг хэрэглэгч ТААХГҮЙ.
                */}
              {detail && detail.sources.length > 0 && (
                <p className={s.dSrc}>
                  {tr('Эх сурвалж:')}{' '}
                  {detail.sources.map((x, i) => (
                    <span key={x.name} className={x.ok ? undefined : s.dSrcBad}>
                      {i > 0 && ' · '}
                      {x.name}
                      {!x.ok && ` — ${tr('татагдсангүй')}`}
                    </span>
                  ))}
                </p>
              )}

              {openState.note && <p className={s.dNote}>{openState.note}</p>}
              {/* ⚠️ Багцаар задардаггүй тоог ИЛ хэлнэ — эс бөгөөс хэрэглэгч
                  багцын дүн гэж уншина */}
              {openState.projectWide && (
                <p className={s.dNote}>{tr('Төслийн нийт дүн — багцаар задардаггүй.')}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

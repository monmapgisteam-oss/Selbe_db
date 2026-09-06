'use client';

/**
 * CEO-ГИЙН САМБАР — ҮЙЛ АЖИЛЛАГААНЫ СХЕМ ӨӨРӨӨ ДАШБОАРД.
 *
 * ⚠️ 2026-09-06, хэрэглэгч: «схем бүхэлдээ харагдаад, түрүүнд өгсөн листүүд
 * тохирох картууд дээр ерөнхийд нь харагдаад, дарж дэлгэрэнгүй харъя». Тиймээс
 * нүүр хуудас нь `schemFine.ts`-ийн 24 карттай НАРИЙВЧИЛСАН СХЕМ бөгөөд CEO-гийн
 * 13 үзүүлэлт нь өөр өөрийн зангилаан дээр (`ceo/schemMap.ts`) сууна.
 *
 * ⚠️ ЗУРАХ АРГА нь `Schem.tsx`-ийнхтэй ЯГ ИЖИЛ: карт нь үнэмлэхүй байрлалтай
 * HTML `<button>`, ирмэг нь тэдгээрийн АРД байрлах нэг `<svg>`; хоёулаа
 * `layoutOf(FINE_NODES, GEO_HOME)`-ийн НЭГ координатыг хэрэглэнэ тул хэзээ ч
 * зөрөхгүй. Топологи, байрлал, ирмэгийн дүрэм БҮГД `schemFine.ts`-д —
 * энд дахин бичээгүй, эс бөгөөс хоёр схем чимээгүй зөрнө.
 *
 * ⚠️ КАРТ ДЭЭР ЗӨВХӨН ГОЛ ТОО. Хэрэглэгч: «ерөнхийд нь харагдаад» — 24 карт
 * тус бүр 3 тоо, тайлбартай байвал зураг уншигдахаа болино (2026-09-01-нд яг
 * энэ шалтгаанаар нарийн схемээс метрик хасагдсан). Тиймээс үзүүлэлттэй карт
 * дээр НЭГ мөр: утга + нэгж; бүрэн задаргаа нь ДАРАХАД доор нээгдэнэ.
 *
 * ⚠️ ҮЗҮҮЛЭЛТГҮЙ ЗАНГИЛАА ЧИМЭЭГҮЙ ҮЛДЭХГҮЙ. 24 картын 12-т CEO-гийн
 * үзүүлэлт байрлана; үлдсэн нь схемийн бүтцийг бүтэн байлгах үүрэгтэй
 * (урсгал тасарвал «юу юунаас хамаардаг» гэдэг алдагдана) бөгөөд дарахад
 * `schemDetail.nodeDetail`-ийн задаргаа гарна — тэдгээр нь өмнөх схем
 * харагдацтай ЯГ НЭГ эх сурвалж.
 *
 * ⚠️ ТООЦОО ЭНД БАЙХГҮЙ: үзүүлэлт бүр `src/lib/ceo/<key>.ts`-ээс `KpiResult`
 * хэлбэрээр ирнэ. Босго, дүрэм өөрчлөх бол тэнд.
 */
import {
  useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { dataVersion, subscribeData } from '@/lib/dataBus';
import { useAsync, type Async } from '@/lib/useAsync';
import { CEO_KPIS, type CeoKpiDef } from '@/lib/ceo/registry';
import { kpisAt, fineOf } from '@/lib/ceo/schemMap';
import { ALL_PKG, filterResult, pkgOptions } from '@/lib/ceo/filter';
import type { Cell, DetailTable, KpiResult } from '@/lib/ceo/kpi';
import { LEVEL_MARK, LEVEL_TONE, levelLabel, type Level } from '@/lib/kpiLevels';
import {
  FINE_NODES, FINE_EDGES, FINE_BY_ID, fineOrder, type FineId,
} from '@/lib/schemFine';
import { edgePath, layoutOf, type Box } from '@/lib/schem';
import { nodeDetail } from '@/lib/schemDetail';
import { loadSchemSources } from '@/lib/schemData';
import { num, pct, mnt, date } from '@/lib/format';
import type { ViewKey } from '@/lib/services';
import s from './ceoBoard.module.css';

/* ══════════════ Ачаалалт ══════════════ */

type Slot = Async<KpiResult>;
const LOADING: Slot = { state: 'loading', data: null, error: null };

/**
 * 13 ачаалагчийг НЭГ эффектээр удирдана.
 *
 * ⚠️ Карт бүрд `useAsync` дуудаж болохгүй — hook-ийн тоо render бүрд ижил
 * байх ёстой, харин самбар нь бүх үр дүнг ХАМТ хэрэглэнэ (толгойн тоолуур,
 * анхдагчаар нээх зангилаа). Тиймээс нэг төлөв, нэг эффект.
 *
 * ⚠️ `dataVersion` deps-т орно (`useAsync`-тай ижил дүрэм): портал дотроос
 * хүснэгт рүү бичихэд `cached()` кэшүүд хаягдаж, зөвхөн хамааралтай ачаалагч
 * дахин татагдана; бусад нь хадгалсан амлалтаа шууд буцаана (сүлжээгүй).
 *
 * ⚠️ ХҮНД АЧААЛАГЧИД ХОЙШЛОНО (`heavy`): обьёмын зөрүү 10 хуудас, QAQC 10
 * хүснэгт, давхцал геометр, тохиромжтой байдал орон зайн шинжилгээ. Нүүр
 * нээгдмэгц бүгд зэрэг буувал хөнгөн картуудын асуулгыг хааж ArcGIS «Too many
 * requests» өдөөнө (2026-08-21-ний аудит).
 */
function useKpis(): { slots: Record<string, Slot>; retry: (key: string) => void } {
  const [slots, setSlots] = useState<Record<string, Slot>>(() => (
    Object.fromEntries(CEO_KPIS.map((d) => [d.key, LOADING]))
  ));
  const bus = useSyncExternalStore(subscribeData, dataVersion, () => 0);
  const [nonce, setNonce] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    let idle: number | null = null;

    const run = (d: CeoKpiDef) => {
      d.load().then(
        (data) => { if (alive) setSlots((r) => ({ ...r, [d.key]: { state: 'ready', data, error: null } })); },
        (e: unknown) => {
          if (!alive) return;
          const error = e instanceof Error ? e : new Error(String(e));
          setSlots((r) => ({ ...r, [d.key]: { state: 'error', data: null, error } }));
        },
      );
    };

    CEO_KPIS.filter((d) => !d.heavy).forEach(run);
    const heavy = CEO_KPIS.filter((d) => d.heavy);
    const startHeavy = () => {
      heavy.forEach((d, i) => {
        timers.push(window.setTimeout(() => { if (alive) run(d); }, i * 400));
      });
    };
    /* ⚠️ `'requestIdleCallback' in window` гэж шалгавал TS `else` салааг
       `never` болгож `window.setTimeout`-ыг алдаа гэнэ — `typeof`-оор шалгана. */
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(startHeavy, { timeout: 2500 });
    } else {
      timers.push(window.setTimeout(startHeavy, 1200));
    }
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
      if (idle != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    };
  }, [bus, nonce]);

  /**
   * Нэг үзүүлэлтийг дахин татна.
   * ⚠️ `cached()` алдааг кэшлэдэггүй (`live.ts`) тул `load()`-ыг дахин дуудахад
   *    шинээр татна; амжилттай кэш хэвээр — бусад карт хөдлөхгүй.
   */
  const retry = (key: string) => {
    setSlots((r) => ({ ...r, [key]: LOADING }));
    setNonce((n) => ({ ...n, [key]: (n[key] ?? 0) + 1 }));
  };
  return { slots, retry };
}

/* ══════════════ Туслах ══════════════ */

const levelOf = (x: Slot | undefined): Level => (
  !x ? 'loading' : x.state === 'ready' ? x.data.level : x.state === 'error' ? 'unknown' : 'loading'
);

/**
 * Хэд хэдэн үзүүлэлтийн ХАМГИЙН МУУ түвшин — зангилааны дохио.
 * ⚠️ `loading`/`unknown`/`neutral` нь дохио БИШ — «хараахан мэдэхгүй»-г
 *    улаан/шар болгож болохгүй.
 */
function worstLevel(list: readonly Level[]): Level | null {
  if (list.includes('bad')) return 'bad';
  if (list.includes('warn')) return 'warn';
  if (list.includes('good')) return 'good';
  return null;
}

/**
 * Хүснэгтийн нүд → текст.
 * ⚠️ `null` нь «—» — ТЭГ-ээр ХЭЗЭЭ Ч орлуулахгүй (төслийн үндсэн дүрэм).
 * ⚠️ `pct` нь 0–100 утга авна (`format.pct` 100-аар үржүүлдэггүй).
 */
function cellText(c: Cell): string {
  if (c.v == null || c.v === '') return '—';
  if (typeof c.v !== 'number') return String(c.v);
  switch (c.kind) {
    case 'pct': return pct(c.v, 1);
    case 'mnt': return mnt(c.v);
    case 'ha': return `${num(c.v, 1)} ${tr('га')}`;
    case 'day': return tr('{0} хоног', num(c.v));
    default: return num(c.v, Number.isInteger(c.v) ? 0 : 1);
  }
}

/**
 * ЗАДАРГААНЫ ХҮСНЭГТ.
 * ⚠️ Хэвтээ ба босоо гүйлт нь ХҮСНЭГТ ДОТРОО (`.tWrap`) — хуудас өөрөө хэвтээ
 *    гүйвэл зүүн талын навигаци алга болно.
 * ⚠️ Хоосон хүснэгт ЗУРАГДАХГҮЙ — «Хэтэрсэн ажлууд: (хоосон)» гэдэг нь
 *    мэдээлэл биш; тоо нь картан дээр аль хэдийн 0 гэж бичигдсэн.
 */
function Table({ t }: { t: DetailTable }) {
  if (t.rows.length === 0) return null;
  return (
    <div className={s.tBox}>
      <div className={s.tTitle}>
        {t.title}
        <span className={`${s.tCount} num`}>{num(t.rows.length)}</span>
      </div>
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
                    {cellText(c)}
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

/* ══════════════ Схемийн зангилаа ══════════════ */

/** Зангилаан дээр гарах нэг мөр — үзүүлэлтийн гол тоо */
type NodeLine = { key: string; title: string; value: string; unit: string; level: Level };

function NodeCard({
  id, box, lines, on, onClick,
}: {
  id: FineId; box: Box; lines: NodeLine[]; on: boolean; onClick: () => void;
}) {
  const n = FINE_BY_ID[id];
  const lv = worstLevel(lines.map((l) => l.level));
  /* Ачаалж буй/алдаатай ч гэсэн зангилаа нь үзүүлэлттэйгээ мэдэгдэнэ */
  const pending = lines.length > 0 && lv == null;
  const tip = [
    n.desc,
    ...lines.map((l) => `${l.title}: ${l.value} ${l.unit}`),
    tr('Дарж дэлгэрэнгүйг харна'),
  ].join('\n');

  return (
    <button
      type="button"
      className={`${s.node} ${lines.length ? s.nodeKpi : ''} ${on ? s.nodeOn : ''}`}
      style={{
        left: box.x, top: box.y, width: box.w, minHeight: box.h,
        ['--h']: lv ? LEVEL_TONE[lv] : 'var(--line-strong)',
      } as CSSProperties}
      aria-expanded={on}
      title={tip}
      onClick={onClick}
    >
      <span className={s.nHead}>
        <span className={s.nIcon} aria-hidden><Icon name={n.icon} size={11} /></span>
        <span className={s.nTitle}>{n.title}</span>
        {/* ⚠️ Өнгө ГАНЦААРАА утга дамжуулж болохгүй (WCAG 1.4.1) — тэмдэг + үг */}
        {lv && (
          <span className={s.nMark} title={levelLabel(lv)}>
            <b aria-hidden>{LEVEL_MARK[lv]}</b>
            <em className={s.sr}>{levelLabel(lv)}</em>
          </span>
        )}
      </span>

      {/* ⚠️ ТОДОРХОЙЛОЛТ нь ЗӨВХӨН үзүүлэлтгүй зангилаанд — тэнд картын цорын
          ганц агуулга нь «энэ алхамд юу хийгддэг» гэдэг. Үзүүлэлттэй карт дээр
          тоо нь тайлбараас илүү чухал бөгөөд хоёулаа багтахгүй. */}
      {lines.length === 0
        ? <span className={s.nDesc}>{n.desc}</span>
        : (
          <span className={s.nLines}>
            {lines.map((l) => (
              <span key={l.key} className={s.nLine} style={{ ['--h']: LEVEL_TONE[l.level] } as CSSProperties}>
                <b className={`${s.nVal} num ${l.value ? '' : s.skel}`}>{l.value}</b>
                <i className={s.nUnit}>{l.unit}</i>
              </span>
            ))}
          </span>
        )}
      {pending && <span className={s.sr}>{tr('Ачаалж байна…')}</span>}
    </button>
  );
}

/* ══════════════ Дэлгэрэнгүй ══════════════ */

/**
 * Нэг үзүүлэлтийн бүрэн задаргаа.
 *
 * ⚠️ `pkg` нь ЗӨВХӨН ЖАГСААЛТЫГ шүүнэ (`ceo/filter.ts`-ийн толгойн ⚠️): гол
 * тоо нь дүнгээр бодогдсон тул эргүүлэн задлах боломжгүй. Тэр ялгааг дэлгэц
 * дээр ИЛ хэлнэ — эс бөгөөс «56.8 тэрбум нь энэ багцынх» гэж ХУДАЛ уншигдана.
 */
function KpiDetail({
  def, slot, pkg, onView, onRetry,
}: {
  def: CeoKpiDef; slot: Slot; pkg: string;
  onView: (k: ViewKey) => void; onRetry: () => void;
}) {
  const lv = levelOf(slot);
  const raw = slot.state === 'ready' ? slot.data : null;
  const d = raw && pkg ? filterResult(raw, pkg) : raw;
  return (
    <section className={s.kpi} style={{ ['--h']: LEVEL_TONE[lv] } as CSSProperties}>
      <header className={s.kHead}>
        <span className={s.nIcon} aria-hidden><Icon name={def.icon} size={13} /></span>
        <b className={s.kTitle}>{def.title}</b>
        <span className={s.kTag}>{LEVEL_MARK[lv]} {levelLabel(lv)}</span>
        {d && (
          <span className={s.kValue}>
            <b className="num">{d.value}</b>
            {d.unit && <i>{d.unit}</i>}
          </span>
        )}
        <button type="button" className={s.kGo} onClick={() => onView(def.view)}>
          {tr('Харагдац руу орох')}
          <span aria-hidden>→</span>
        </button>
      </header>

      {/* ⚠️ ГОЛ ТОО нь ТӨСЛИЙНХ гэдгийг багц сонгосон үед ЗААВАЛ хэлнэ */}
      {pkg && d && (
        <p className={s.dScope}>
          {tr('Жагсаалт: {0} · дээрх тоо нь төслийн нийт', pkg)}
        </p>
      )}

      {/*
        * ⚠️ ХООСОН ҮР ДҮНГ ЧИМЭЭГҮЙ ҮЛДЭЭХГҮЙ. Шүүлтийн дараа мөр үлдээгүй бол
        * хэрэглэгч «эвдэрсэн» эсвэл «ачаалж байна» гэж уншина — үнэн хариулт нь
        * «энэ багцад асуудал алга». Эх жагсаалт нь ХООСОН байсан тохиолдлыг
        * (`raw.tables` ч хоосон) тусад нь ялгана: тэр нь шүүлтийн үр дүн БИШ.
        */}
      {pkg && d && d.tables.length === 0 && raw && raw.tables.length > 0 && (
        <p className={s.dNote}>{tr('{0}-д энэ үзүүлэлтээр асуудалтай мөр алга.', pkg)}</p>
      )}

      {slot.state === 'error' ? (
        <p className={s.dNote}>
          {tr('Татагдсангүй.')}{' '}
          <button type="button" className={s.dRetry} onClick={onRetry}>{tr('Дахин оролдох')}</button>
          <span className={s.dErr}> {slot.error.message}</span>
        </p>
      ) : !d ? (
        <p className={s.dNote}>{tr('Ачаалж байна…')}</p>
      ) : (
        <>
          {d.facts.length > 0 && (
            <ul className={s.dFacts}>
              {d.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}

          {/* АСУУДЛУУД — «юу нь болохгүй байна» гэдгийг НЭР ЗААЖ */}
          {d.issues.length > 0 && (
            <ul className={s.dIssues}>
              {d.issues.map((is, i) => (
                <li key={i} className={s.dIssue} style={{ ['--h']: LEVEL_TONE[is.tone] } as CSSProperties}>
                  {is.text}
                </li>
              ))}
            </ul>
          )}

          {/* ЗАДАРГАА — асуудалтай мөр БҮР нэрээрээ */}
          {d.tables.map((t) => <Table key={t.title} t={t} />)}

          {/*
            * ЭХ СУРВАЛЖ — «—» нь ҮЙЛЧИЛГЭЭ УНАСНААС уу, үнэхээр байхгүйгээс үү
            * гэдгийг хэрэглэгч ТААХГҮЙ. Хэсэгчилсэн уналтыг ил хэлнэ.
            */}
          {(d.failedSources.length > 0 || d.asOf != null) && (
            <p className={s.dSrc}>
              {d.asOf != null && <span>{tr('Өгөгдөл: {0}', date(d.asOf))}</span>}
              {d.failedSources.length > 0 && (
                <span className={s.dSrcBad}>
                  {d.asOf != null && ' · '}
                  {tr('Татагдсангүй: {0}', d.failedSources.join(', '))}
                </span>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ══════════════ Самбар ══════════════ */

/** Схемийн байрлал — модулийн түвшинд НЭГ удаа (тор нь тогтмол) */
const ORDER = fineOrder();

/**
 * НҮҮРИЙН ТОР — «Үйл ажиллагааны схем» харагдацынхаас НЯГТ.
 *
 * ⚠️ `GEO_FINE`-ийг ШУУД хэрэглэхгүй: тэр нь БҮРЭН ДЭЛГЭЦИЙН харагдацад
 * зориулагдсан (карт бүр 4 мөр тодорхойлолт, 196×130) бөгөөд 9 багана нь
 * 2,152px болж нүүрэнд хэзээ ч бүтнээр багтахгүй. Нүүрэнд карт нь ГОЛ ТОО л
 * агуулна (тодорхойлолт нь зөвхөн үзүүлэлтгүй зангилаанд, 3 мөрөөр таслагдана)
 * тул илүү нам, нарийн байж болно: 9 багана × 158 + 8 завсар × 20 + 32 = 1,614px
 * — 1,700px дэлгэцийн боломжит талбарт (≈1,610px) БҮТНЭЭР багтана.
 *
 * ⚠️ МӨРИЙН АЛХАМ (h + gapY = 132) нь картын БОЛОМЖИТ ДЭЭД ӨНДРӨӨС ИХ байх
 * ЁСТОЙ. Тооцоо: pad 17 + толгой 18 + зай 4 + агуулга. Хамгийн өндөр агуулга нь
 * ХОЁР үзүүлэлтийн мөр («Гэрээний дүн» — гэрээ↔төсвийн зөрүү ба гэрээгүй ажил),
 * мөр бүр нь тоо (16) + нэгж 2 мөр (16) + padding 7 ≈ 39 → 2×39 + 4 = 82;
 * бүгд 17+18+4+82 = 121 < 132. Агуулга нэмэх бол ЭНЭ тооцоог шинэчил — эс
 * бөгөөс доод мөрийн зангилаатай ЧИМЭЭГҮЙ ДАВХЦАНА (`GEO_FINE`-ийн ижил занга).
 */
const GEO_HOME = { w: 158, h: 102, gapX: 20, gapY: 30, pad: 16 };
const L = layoutOf<FineId>(FINE_NODES, GEO_HOME);

export function CeoBoard({ onView }: { onView: (key: ViewKey) => void }) {
  const { slots, retry } = useKpis();
  /* Схемийн ӨӨРИЙН задаргаа — үзүүлэлтгүй зангилаанд (өмнөх схемтэй нэг эх) */
  const srcQ = useAsync(loadSchemSources, []);
  /**
   * СОНГОСОН БАГЦ — задаргааны жагсаалтыг шүүнэ.
   * ⚠️ Схем ба картын тоог ХӨНДӨХГҮЙ: тэдгээр нь дүнгээр бодогдсон
   *    (`ceo/filter.ts`). Багц сонгоход зөвхөн ДЭЛГЭРЭНГҮЙ дэх мөрүүд шүүгдэнэ.
   */
  const [pkg, setPkg] = useState<string>(ALL_PKG);
  /**
   * «ЯАРАЛТАЙ» ЖАГСААЛТ нээлттэй эсэх.
   * ⚠️ 2026-09-06: толгойд «! 8 яаралтай» гэсэн ТОО байсан ч аль 8 болохыг
   *    харахын тулд 24 зангилааг нүдээр эргэх шаардлагатай байв. Одоо дарахад
   *    нэрсээрээ жагсаж, мөр дарахад тэр зангилаа нээгдэнэ.
   */
  const [alertsOpen, setAlertsOpen] = useState(false);
  /**
   * Багцын сонголтууд — АМЬД өгөгдлөөс.
   * ⚠️ `PKG_GROUPS` (7 барилгын багц) ХАНГАЛТГҮЙ: гацсан ажлын ихэнх нь
   *    дэд бүтцийн багцад (БАГЦ-16.7, БАГЦ-19.1 …) байдаг.
   */
  const pkgs = useMemo(() => pkgOptions(
    CEO_KPIS.map((d) => slots[d.key]).filter((x) => x?.state === 'ready').map((x) => x.data),
  ), [slots]);

  /* Зангилаа бүрийн мөрүүд */
  const linesOf = useMemo(() => {
    const m = new Map<FineId, NodeLine[]>();
    for (const n of FINE_NODES) {
      const keys = kpisAt(n.id);
      if (!keys.length) continue;
      m.set(n.id, keys.map((k) => {
        const def = CEO_KPIS.find((d) => d.key === k)!;
        const slot = slots[k];
        const d = slot?.state === 'ready' ? slot.data : null;
        return {
          key: k,
          title: def.title,
          value: slot?.state === 'error' ? '—' : d ? d.value : '',
          unit: d ? d.unit : '',
          level: levelOf(slot),
        };
      }));
    }
    return m;
  }, [slots]);

  /**
   * Нээлттэй зангилаа — НЭГ зэрэг ганц.
   * ⚠️ АНХДАГЧААР ХАМГИЙН МУУГ НЬ НЭЭНЭ: хоосон самбар «юунаас эхлэх вэ» гэсэн
   *    асуултыг хэрэглэгч рүү шилжүүлдэг; самбарын үүрэг бол тэр асуултад
   *    хариулах. Хэрэглэгч ХААСАН бол хаалттай хэвээр (`touched`).
   */
  const [openId, setOpenId] = useState<FineId | null>(null);
  const [touched, setTouched] = useState(false);
  const worstNode = useMemo<FineId | null>(() => {
    for (const lv of ['bad', 'warn'] as const) {
      const hit = ORDER.find((id) => (linesOf.get(id) ?? []).some((l) => l.level === lv));
      if (hit) return hit;
    }
    return null;
  }, [linesOf]);
  const shownId = touched ? openId : openId ?? worstNode;
  const open = shownId ? FINE_BY_ID[shownId] : null;
  const openKpis = shownId ? kpisAt(shownId) : [];

  /**
   * СХЕМИЙН ӨӨРИЙН ЗАДАРГАА — үзүүлэлтгүй зангилаанд.
   * ⚠️ «Үйл ажиллагааны схем» харагдацтай НЭГ функц (`nodeDetail`) — хоёр
   *    дэлгэц ижил агшинд өөр тоо харуулах боломжгүй.
   */
  const schemDetail = useMemo(
    () => (open && !openKpis.length && srcQ.state === 'ready'
      ? nodeDetail(srcQ.data, open.group, null) : null),
    [open, openKpis.length, srcQ],
  );

  /* Толгойн тоолуур — дохиотой үзүүлэлтүүд */
  const counts = useMemo(() => {
    const c = { bad: 0, warn: 0, good: 0, loading: 0, unknown: 0 };
    for (const d of CEO_KPIS) {
      const lv = levelOf(slots[d.key]);
      if (lv === 'bad' || lv === 'warn' || lv === 'good' || lv === 'loading' || lv === 'unknown') c[lv] += 1;
    }
    return c;
  }, [slots]);

  /**
   * ЯАРАЛТАЙ/АНХААРАХ ҮЗҮҮЛЭЛТҮҮД — нэр, тоо, схемийн байрлалтайгаа.
   * ⚠️ Улаан нь эхэнд, дараа нь шар; тэнцүү бол БҮРТГЭЛИЙН дараалал
   *    (төслийн мөчлөг) хадгалагдана — `sort` тогтвортой.
   */
  const alertRows = useMemo(() => {
    const rank = { bad: 0, warn: 1 } as const;
    return CEO_KPIS
      .map((def) => {
        const slot = slots[def.key];
        const lv = levelOf(slot);
        if (lv !== 'bad' && lv !== 'warn') return null;
        const d = slot?.state === 'ready' ? slot.data : null;
        const node = fineOf(def.key);
        return {
          key: def.key,
          title: def.title,
          value: d ? d.value : '—',
          unit: d ? d.unit : '',
          level: lv,
          node: node ?? null,
          at: node ? FINE_BY_ID[node].title : '',
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => rank[a.level] - rank[b.level]);
  }, [slots]);

  const toggle = (id: FineId) => {
    setTouched(true);
    setOpenId(shownId === id ? null : id);
    for (const k of kpisAt(id)) if (slots[k]?.state === 'error') retry(k);
  };

  return (
    <section className={s.board} aria-label={tr('Удирдлагын үзүүлэлт')}>
      <header className={s.head}>
        <h2 className={s.title}>{tr('Удирдлагын үзүүлэлт')}</h2>
        {/*
          * ⚠️ Тоолуур нь ЭРЭМБЭ өгнө: «! 8» гэдэг нь «8 үзүүлэлт яаралтай».
          *    Ногооныг ч тоолно — «бүгд улаан биш» гэдэг өөрөө мэдээлэл.
          */}
        <span className={s.counts} aria-live="polite">
          {/*
            * ⚠️ УЛААН ба ШАР нь ТОВЧ — дарахад жагсаалт нээгдэнэ. Ногоон нь
            *    ЭНГИЙН текст: «хэвийн 3»-ыг задалж үзэх шалтгаан байхгүй,
            *    товч болговол дарах юмгүй товч болж төөрөгдүүлнэ.
            */}
          {counts.bad + counts.warn > 0 ? (
            <button
              type="button"
              className={s.cntBtn}
              aria-expanded={alertsOpen}
              onClick={() => setAlertsOpen((v) => !v)}
            >
              {counts.bad > 0 && <b className={s.cntBad}><span aria-hidden>{LEVEL_MARK.bad}</span> {num(counts.bad)} {tr('яаралтай')}</b>}
              {counts.warn > 0 && <b className={s.cntWarn}><span aria-hidden>{LEVEL_MARK.warn}</span> {num(counts.warn)} {tr('анхаарах')}</b>}
              <span className={s.cntCaret} aria-hidden>{alertsOpen ? '▴' : '▾'}</span>
            </button>
          ) : null}
          {counts.good > 0 && <b className={s.cntGood}><span aria-hidden>{LEVEL_MARK.good}</span> {num(counts.good)} {tr('хэвийн')}</b>}
          {counts.unknown > 0 && <b className={s.cntNone}>{num(counts.unknown)} {tr('татагдсангүй')}</b>}
          {counts.loading > 0 && <b className={s.cntNone}>{num(counts.loading)} {tr('ачаалж байна')}</b>}
        </span>

        {/*
          * БАГЦЫН ШҮҮЛТ — задаргааны жагсаалтад л үйлчилнэ.
          * ⚠️ Сонголт ирэхээс ӨМНӨ огт гарахгүй: хоосон сонгогч нь «багц алга»
          *    гэж уншигдана. Ачаалалт дуусмагц өөрөө гарч ирнэ.
          */}
        {pkgs.length > 0 && (
          <label className={s.pkgPick}>
            <span className={s.sr}>{tr('Багц')}</span>
            <select
              className={s.pkgSel}
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
            >
              <option value={ALL_PKG}>{tr('Бүх багц')}</option>
              {pkgs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
      </header>

      {/*
        * ЯАРАЛТАЙ ҮЗҮҮЛЭЛТИЙН ЖАГСААЛТ — нэрээрээ.
        * ⚠️ Мөр дарахад тэр ЗАНГИЛАА нээгдэж, схем дээр нь тодорно — хэрэглэгч
        *    «энэ асуудал урсгалын хаана байна» гэдгийг байрлалаар нь ойлгоно.
        */}
      {alertsOpen && alertRows.length > 0 && (
        <ul className={s.alerts}>
          {alertRows.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                className={s.alertRow}
                style={{ ['--h']: LEVEL_TONE[a.level] } as CSSProperties}
                onClick={() => { if (a.node) { setTouched(true); setOpenId(a.node); } }}
              >
                <span className={s.alertMark} aria-hidden>{LEVEL_MARK[a.level]}</span>
                <b className={s.alertTitle}>{a.title}</b>
                <span className={`${s.alertVal} num`}>{a.value}</span>
                <i className={s.alertUnit}>{a.unit}</i>
                {a.at && <span className={s.alertAt}>{a.at}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        * СХЕМ — хэвтээ гүйлт нь ЗӨВХӨН энд (хуудас өөрөө хэвтээ гүйхгүй).
        * ⚠️ `min-width` нь зурагтайгаа тэнцүү: доторх карт үнэмлэхүй байрлалтай
        *    тул эцэг нь өргөнөө өөрөө мэдэхгүй, зарлаагүй бол зураг тасарна.
        */}
      <div className={s.canvasWrap}>
        <div className={s.canvas} style={{ width: L.w, height: L.h }}>
          <svg className={s.edges} width={L.w} height={L.h} aria-hidden focusable="false">
            <defs>
              <marker id="ceo-a" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L7 3.5 L0 7 z" fill="var(--line-strong)" />
              </marker>
              <marker id="ceo-b" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L7 3.5 L0 7 z" fill="var(--bad)" />
              </marker>
            </defs>
            {FINE_EDGES.map((e) => (
              <path
                key={`${e.from}-${e.to}-${e.kind}`}
                d={edgePath(L.box[e.from], L.box[e.to], e.kind)}
                className={e.kind === 'back' ? s.edgeBack : e.kind === 'feed' ? s.edgeFeed : s.edgeMain}
                markerEnd={`url(#${e.kind === 'back' ? 'ceo-b' : 'ceo-a'})`}
              />
            ))}
          </svg>

          {/* ⚠️ DOM-ийн дараалал нь ТОПОЛОГИ (`fineOrder`), дэлгэцийн байрлал
              БИШ — Tab дарахад хэрэглэгч төслийн мөчлөгөөр алхана. */}
          {ORDER.map((id) => (
            <NodeCard
              key={id}
              id={id}
              box={L.box[id]}
              lines={linesOf.get(id) ?? []}
              on={shownId === id}
              onClick={() => toggle(id)}
            />
          ))}
        </div>
      </div>

      {/*
        * ДЭЛГЭРЭНГҮЙ — схемийн ДООР, тусдаа самбарт.
        * ⚠️ Зангилааны дотор дэлгэвэл эргэн тойрны бүх карт хөдөлж, урсгалын
        *    зураг алдагдана (2026-09-06-нд яг энэ шалтгаанаар өөрчлөгдсөн).
        */}
      {open && (
        <div className={s.detail} aria-label={open.title}>
          <header className={s.dHead}>
            <span className={s.nIcon} aria-hidden><Icon name={open.icon} size={15} /></span>
            <span className={s.dText}>
              <b className={s.dTitle}>{open.title}</b>
              <span className={s.dDesc}>{open.desc}</span>
            </span>
            {open.view && !openKpis.length && (
              <button type="button" className={s.kGo} onClick={() => onView(open.view as ViewKey)}>
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

          {openKpis.length > 0
            ? openKpis.map((k) => {
              const def = CEO_KPIS.find((d) => d.key === k)!;
              return (
                <KpiDetail
                  key={k}
                  def={def}
                  slot={slots[k]}
                  pkg={pkg}
                  onView={onView}
                  onRetry={() => retry(k)}
                />
              );
            })
            : (
              /*
               * ҮЗҮҮЛЭЛТГҮЙ ЗАНГИЛАА — схемийн өөрийн задаргаа.
               * ⚠️ ХООСОН ҮЛДЭЭХГҮЙ: карт дарахад юу ч гарахгүй бол хэрэглэгч
               *    «эвдэрсэн» гэж уншина. `nodeDetail` нь аль хэдийн татсан
               *    `SchemSources` дээр ажилладаг — шинэ хүсэлт үүсэхгүй.
               */
              srcQ.state === 'error' ? <p className={s.dNote}>{tr('Татагдсангүй.')}</p>
                : !schemDetail ? <p className={s.dNote}>{tr('Ачаалж байна…')}</p>
                  : (
                    <>
                      {schemDetail.metrics.length > 0 && (
                        <ul className={s.dFacts}>
                          {schemDetail.metrics.map((m) => (
                            <li key={m.label}>
                              {m.label}: {m.value == null ? '—' : cellText({ v: m.value, kind: m.kind })}
                            </li>
                          ))}
                        </ul>
                      )}
                      {schemDetail.issues.length > 0 && (
                        <ul className={s.dIssues}>
                          {schemDetail.issues.map((is, i) => (
                            <li key={i} className={s.dIssue}
                              style={{ ['--h']: is.tone === 'none' ? 'var(--ink-3)' : `var(--${is.tone})` } as CSSProperties}>
                              {is.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      {schemDetail.tables.map((t) => <Table key={t.title} t={t} />)}
                    </>
                  )
            )}
        </div>
      )}
    </section>
  );
}

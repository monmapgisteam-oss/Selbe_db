'use client';

/**
 * ТӨСЛИЙН ҮЙЛ АЖИЛЛАГААНЫ СХЕМ.
 *
 * ⚠️ ХОЁР ТОПОЛОГИ (2026-09-01, хэрэглэгч: «схем хэт ерөнхий байна … үйл
 * ажиллагааг илүү нарийн, нэг бүрчлэн харуулдаг ОЛОН КАРТТАЙ схем болго»):
 *
 *   «Ерөнхий»     — `schem.ts`-ийн 10 карт. Төслийн мөчлөгийн товч зураг.
 *   «Дэлгэрэнгүй» — `schemFine.ts`-ийн 24 карт. АЖИЛЛАГАА БҮР өөрийн хайрцагтай:
 *                   зөвшөөрсөн · хүлээгдэж буй · татгалзсан · чөлөөлсөн ·
 *                   үлдсэн · тайлагнасан блок · тайлангүй блок · хяналтын 4
 *                   шат · шилжүүлсэн · төсөв · гэрээ · олголт …
 *
 * ⚠️ ЗУРАХ АРГА: карт нь HTML `<button>` (үнэмлэхүй байрлалтай), ирмэг нь
 * түүний АРД байрлах НЭГ `<svg>`. Хоёулаа `layoutOf()`-ийн НЭГ координатыг
 * хэрэглэнэ тул хэзээ ч зөрөхгүй. HTML карт сонгосон шалтгаан: focus ring,
 * tab дараалал, текстийн тайрал, сэдвийн token бүгд үнэгүй ирнэ.
 *
 * ⚠️ БҮХ ТООЦОО `schem.ts` · `schemFine.ts` · `schemDetail.ts`-д (React-гүй) —
 * `*.check.mjs` тэднийг шууд шалгана. Энд зөвхөн зурах ажил.
 *
 * ⚠️ КАРТ ДАРАХАД ХАРАГДАЦ РУУ ҮСРЭХГҮЙ. Дарахад дэлгэрэнгүй САМБАР нээгдэнэ;
 * шилжилт нь самбар доторх ИЛ товч. Урьд нь дарах = шилжих байсан тул схем
 * дээр байж дэлгэрэнгүйг харах арга ОГТ байхгүй байв.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAsync } from '@/lib/useAsync';
import { num, pct, mntAbbr } from '@/lib/format';
import type { ViewKey } from '@/lib/services';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import {
  NODES, NODE_BY_ID, EDGES, GEO, buildSchem, edgePath, layoutOf, stageRail, topoOrder,
  type Box, type EdgeKind, type Geo, type Health, type Metric, type SchemId,
  type SchemSources, type SchemState,
} from '@/lib/schem';
import {
  FINE_NODES, FINE_EDGES, FINE_BY_ID, GEO_FINE, fineOrder,
} from '@/lib/schemFine';
import { nodeDetail, type Cell } from '@/lib/schemDetail';
import { loadSchemSources } from '@/lib/schemData';
import c from './schem.module.css';

/* ══════════════════ Туслах ══════════════════ */

/**
 * Төлөвийн ҮГ — өнгө ганцаараа хангалтгүй (өнгө сохор, хар цагаан хэвлэлт).
 *
 * ⚠️ ЭНЭ ЯАГААД ТОЛЬ БИШ, ФУНКЦ ВЭ. Урьд нь `Record<Health, string>` байж
 * дэлгэцэд толины утгыг `tr()` рүү ДИНАМИКААР дамжуулдаг байв. `i18n-extract`
 * нь зөвхөн СТАТИК мөрийн аргументыг цуглуулдаг тул эдгээр дөрвөн түлхүүрийг
 * «хэрэглэгдээгүй» гэж үзэж, «ДУТУУ 0» гэж ХУДАЛ ногоон гаргаж байсан.
 * ⚠️ Модулийн түвшинд `tr()` дуудахгүй — хэл солиход дахин бодогдох ёстой.
 */
const healthText = (h: Health): string => (
  h === 'good' ? tr('Хэвийн')
    : h === 'warn' ? tr('Анхаарах')
      : h === 'bad' ? tr('Эрсдэлтэй')
        : tr('Мэдээлэлгүй')
);
const HEALTH_TAG: Record<Health, string> = {
  good: c.hGood, warn: c.hWarn, bad: c.hBad, none: c.hNone,
};
const HEALTH_BORDER: Record<Health, string> = {
  good: c.bGood, warn: c.bWarn, bad: c.bBad, none: c.bNone,
};
const HEALTH_SWATCH: Record<Health, string> = {
  good: c.legGood, warn: c.legWarn, bad: c.legBad, none: c.legNone,
};

/**
 * Метрикийн бичиглэл.
 * ⚠️ `null` нь «—» болно, 0 БИШ. `pct()` нь 100-аар үржүүлдэггүй тул утга нь
 *    аль хэдийн 0–100 масштабтай ирсэн байх ёстой (`schem.ts`-ийн гэрээ).
 */
function show(m: Metric): string {
  if (m.value == null) return '—';
  switch (m.kind) {
    case 'pct': return pct(m.value, 0);
    case 'mnt': return mntAbbr(m.value);
    /* ⚠️ `format.ts::ha()` нь м²-ыг га руу ХӨРВҮҮЛДЭГ. Энд ирж буй утга
       (`areaHa`, `remainingHa`) АЛЬ ХЭДИЙН га тул дахин хуваавал 10,000
       дахин жижигрэнэ. */
    case 'ha': return `${num(m.value, 1)} ${tr('га')}`;
    case 'day': return tr('{0} хоног', num(m.value));
    default: return num(m.value);
  }
}

/**
 * Хүснэгтийн нүд.
 * ⚠️ Метриктэй ИЖИЛ дүрмээр — `null` нь «—». Тоон нүдэнд `kind` өгөгдсөн бол
 *    метрикийн хэлбэржүүлэлт дамжина, эс тэгвээс түүхий текст.
 */
function cellText(x: Cell): string {
  if (x.v == null) return '—';
  if (x.kind && typeof x.v === 'number') return show({ label: '', value: x.v, kind: x.kind });
  return String(x.v);
}

/* ══════════════════ Нэг карт ══════════════════ */

/**
 * Зурагдах карт — ХОЁУЛАНГ НЬ (ерөнхий 10, нарийн 24) нэг хэлбэрт оруулсан.
 * ⚠️ `group` нь ДЭЛГЭРЭНГҮЙ САМБАР аль бүлгийг нээхийг заана: «Хяналтын
 *    инженер» карт дарахад бүхэл хяналтын самбар нээгдэнэ. Карт бүрд тусдаа
 *    самбар бичвэл нэг дүрэм 24 газар давхардана.
 */
type Card = {
  id: string;
  group: SchemId;
  title: string;
  desc: string;
  icon: string;
  view: ViewKey | null;
  /** ⚠️ Торны байрлал — `layoutOf` энэ хоёроос координат гаргана */
  col: number;
  row: number;
};

function Node({
  card, st, box, rail, fine, allowed, selected, onOpen,
}: {
  card: Card;
  /**
   * Амьд төлөв. `null` бол ПРОЦЕССЫН карт — зөвхөн юу хийгддэг нь бичигдэнэ.
   * ⚠️ Нарийвчилсан схемд ЗОРИУДААР `null`: 24 карт тус бүр 2 тоо, төлвийн
   * шошготой байхад зураг уншигдахаа больж, «ямар ажиллагаа явдаг вэ» гэсэн
   * үндсэн асуулт тоонуудын дунд алдагдаж байв.
   */
  st: SchemState | null;
  /** `null` бол БОСОО жагсаалтын горим — байрлал нь урсгалаар тодорхойлогдоно */
  box: Box | null;
  rail: { stage: string; n: number }[] | null;
  /** Нарийн схемийн карт — жижиг үсэг, нягт зай */
  fine: boolean;
  allowed: boolean;
  selected: boolean;
  onOpen: (cardId: string, g: SchemId) => void;
}) {
  const stacked = box == null;
  return (
    <button
      type="button"
      className={[
        c.node,
        fine ? c.fineNode : '',
        st ? HEALTH_BORDER[st.health] : '',
        st?.projectWide ? c.wide : '',
        stacked ? c.stackNode : '',
        selected ? c.sel : '',
      ].filter(Boolean).join(' ')}
      /* ⚠️ `height` БИШ `minHeight`: тэмдэглэлтэй карт агуулгаараа тэлнэ,
         торны утга нь зөвхөн ДООД хязгаар. */
      style={box ? { left: box.x, top: box.y, width: box.w, minHeight: box.h } : undefined}
      /* ⚠️ ЭРХГҮЙ ХЭРЭГЛЭГЧИД Ч ДАРАГДАНА. Самбар нь ЗӨВХӨН уншина — эрх нь
         зөвхөн ХАРАГДАЦ РУУ ШИЛЖИХИЙГ хаана (самбар доторх товч). */
      aria-expanded={selected}
      title={`${card.desc}\n${tr('Дарж дэлгэрэнгүйг харна')}`}
      onClick={() => onOpen(card.id, card.group)}
    >
      <span className={c.nodeHead}>
        <span className={c.nodeIcon}><Icon name={card.icon} size={fine ? 11 : 13} /></span>
        <span className={c.nodeTitle}>{card.title}</span>
      </span>

      {/**
        * КАРТЫН ТОДОРХОЙЛОЛТ — «тайлагнасан блок гэж юу вэ» гэсэн асуулт
        * зурган дээрээс шууд хариулагдана.
        * ⚠️ ЗӨВХӨН нарийвчилсан горимд. «Ерөнхий» картад гурван үзүүлэлт,
        * зурвас, тэмдэглэл аль хэдийн багтсан тул нэмбэл доод мөр тасарна —
        * тэнд тайлбар нь hover-ийн бичээс хэвээр.
        */}
      {fine && <span className={c.nodeDesc}>{card.desc}</span>}

      {/* ХЯНАЛТЫН ДӨРВӨН ЦЭГ — «Ерөнхий» горимд төлөвийн машиныг ил үлдээнэ.
          ⚠️ «Дэлгэрэнгүй» горимд ХЭРЭГГҮЙ: тэнд дөрвөн шат нь бие даасан карт. */}
      {st && rail && (
        <span className={c.rail}>
          {rail.map((r, i) => (
            <span key={r.stage} className={`${c.railDot} ${r.n > 0 ? c.railOn : ''}`}
              title={`${STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL]}: ${num(r.n)}`}>
              {i > 0 && <span className={c.railSep}>›</span>}
              <i aria-hidden />
              {num(r.n)}
            </span>
          ))}
        </span>
      )}

      {st && (
      <span className={c.metrics}>
        {st.metrics.map((m) => (
          <span key={m.label} className={c.metric} title={m.why ?? undefined}>
            <span className={c.mLabel}>{m.label}</span>
            <span className={`${c.mValue} ${m.value == null ? c.mNone : ''}`}>{show(m)}</span>
          </span>
        ))}
      </span>
      )}

      {st?.note && <span className={c.note} title={st.note}>{st.note}</span>}

      {/* ⚠️ ПРОЦЕССЫН КАРТАД ЗӨВХӨН «эрхгүй» шошго. Төлвийн өнгө нь тоогүйгээр
          утгагүй — өнгө ганцаараа юу ч хэлэхгүй гэдэг нь энэ репогийн дүрэм. */}
      {(st || (!allowed && card.view)) && (
      <span className={c.tags}>
        {st && <span className={`${c.tag} ${HEALTH_TAG[st.health]}`}>{healthText(st.health)}</span>}
        {st?.projectWide && <span className={c.tag}>{tr('төслийн нийт')}</span>}
        {!allowed && card.view && <span className={c.tag}>{tr('эрхгүй')}</span>}
      </span>
      )}
    </button>
  );
}

/* ══════════════════ Дэлгэрэнгүй самбар ══════════════════ */

function Panel({
  id, src, pkg, allowed, onGo, onClose,
}: {
  id: SchemId;
  src: SchemSources;
  pkg: string;
  allowed: boolean;
  onGo: (v: ViewKey) => void;
  onClose: () => void;
}) {
  const n = NODE_BY_ID[id];
  const d = useMemo(() => nodeDetail(src, id, pkg || null), [src, id, pkg]);

  return (
    <aside className={c.panel} role="complementary" aria-label={n.title}>
      <div className={c.panelHead}>
        <span className={c.nodeIcon}><Icon name={n.icon} size={14} /></span>
        <h3 className={c.panelTitle}>{n.title}</h3>
        <span className={c.spacer} />
        <button type="button" className={c.xBtn} onClick={onClose}
          title={tr('Хаах')} aria-label={tr('Хаах')}>✕</button>
      </div>

      <p className={c.panelDesc}>{n.desc}</p>
      <p className={c.panelScope}>{pkg || tr('Төслийн нийт')}</p>

      {/**
        * ⚠️ ЭХ СУРВАЛЖИЙН ТӨЛӨВ — «—» гэсэн тоо ЯАГААД хоосон байгааг хэлнэ.
        * Үүнгүйгээр «үйлчилгээ унасан» ба «үнэхээр өгөгдөл байхгүй» хоёр
        * дэлгэц дээр ЯГ адилхан харагдана.
        */}
      {d.sources.length > 0 && (
        <div className={c.pSrc}>
          {d.sources.map((s) => (
            <span key={s.name} className={`${c.srcTag} ${s.ok ? c.srcOk : c.srcBad}`}>
              {s.ok ? `${s.name} ✓` : `${s.name} — ${tr('татагдсангүй')}`}
            </span>
          ))}
        </div>
      )}

      <section className={c.pSec}>
        <h4 className={c.pSecTitle}>{tr('Үзүүлэлт')}</h4>
        <div className={c.pMetrics}>
          {d.metrics.map((m) => (
            <div key={m.label} className={c.pMetric} title={m.why ?? undefined}>
              <span className={c.mLabel}>{m.label}</span>
              <span className={`${c.mValue} ${m.value == null ? c.mNone : ''}`}>{show(m)}</span>
            </div>
          ))}
        </div>
      </section>

      {d.tables.map((t) => (
        <section key={t.title} className={c.pSec}>
          <h4 className={c.pSecTitle}>{t.title}</h4>
          {t.rows.length === 0 ? (
            <p className={c.pEmpty}>{tr('Мөр алга')}</p>
          ) : (
            /* ⚠️ Хүснэгт бүр ӨӨРИЙН гүйлтийн савтай — эс тэгвээс өргөн хүснэгт
               самбарыг тэлж, БҮХ хуудсанд хэвтээ гүйлт үүсгэнэ. */
            <div className={c.pTableWrap}>
              <table className={c.pTable}>
                <thead>
                  <tr>{t.cols.map((col) => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={`${t.title}-${i}`}>
                      {r.map((x, k) => (
                        <td key={`${t.cols[k] ?? k}`} className={x.v == null ? c.mNone : undefined}>
                          {cellText(x)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {d.issues.length > 0 && (
        <section className={c.pSec}>
          <h4 className={c.pSecTitle}>{tr('Анхаарах')}</h4>
          <ul className={c.pIssues}>
            {d.issues.map((is, i) => (
              <li key={`${is.tone}-${i}`} className={`${c.pIssue} ${HEALTH_TAG[is.tone]}`}>
                {is.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {n.view && (
        /**
         * ⚠️ ЭРХГҮЙ ҮЕД ИДЭВХГҮЙ, НУУГДАХГҮЙ. Дарахад чимээгүй өөр хуудас руу
         * шидвэл хэрэглэгч алдаа гарлаа гэж бодно; идэвхгүй товч нь «энэ хэсэг
         * байгаа ч танд нээлттэй биш» гэдгийг шууд хэлнэ.
         */
        <button type="button" className={c.goBtn} disabled={!allowed}
          onClick={() => n.view && onGo(n.view)}>
          {allowed ? tr('Харагдац руу очих') : tr('Энэ харагдац танд нээлттэй биш')}
        </button>
      )}
    </aside>
  );
}

/* ══════════════════ Зураг ══════════════════ */

type Wire = { from: string; to: string; kind: EdgeKind; label?: string };

function Diagram({
  cards, state, edges, geo, rail, fine, allowed, openCard, onOpen,
}: {
  /** ⚠️ ТОПОЛОГИЙН дараалалтай — DOM-ийн дараалал = Tab-ийн дараалал */
  cards: Card[];
  /** `null` бол процессын зураг — картууд тоогүй */
  state: Record<string, SchemState> | null;
  edges: readonly Wire[];
  geo: Geo;
  rail: { stage: string; n: number }[] | null;
  fine: boolean;
  allowed: (v: ViewKey | null) => boolean;
  /** Сонгогдсон КАРТЫН id — самбар нээсэн карт */
  openCard: string | null;
  onOpen: (cardId: string, g: SchemId) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [k, setK] = useState(1);
  const [stacked, setStacked] = useState(false);

  const L = useMemo(() => layoutOf(cards, geo), [cards, geo]);

  /**
   * ⚠️ БҮХЭЛД НЬ МАСШТАБЛАНА, дахин байрлуулахгүй. Картуудын харьцангуй
   * байрлал нь хэрэглэгчийн ой санамжийн хэсэг — нарийн цонхонд өөр зураг
   * үзүүлбэл өмнө сурсан зүйл нь ажиллахаа болино.
   *
   * ⚠️ 1-ЭЭС ДЭЭШ Ч ТОМРУУЛНА. Урьд нь `Math.min(1, …)` байсан тул том дэлгэц
   * дээр схем нь зүүн дээд буланд жижигхэн үлдэж, доод 60% нь хоосон байв.
   * ⚠️ 1.9-өөс дээш ТОМРУУЛАХГҮЙ · 0.62-оос доош БУУРАХГҮЙ (тэрнээс жижиг бол
   * текст уншигдахаа больдог тул оронд нь БОСОО ЖАГСААЛТ болно).
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 16;
      const h = el.clientHeight - 16;
      const raw = Math.min(w / L.w, h / L.h);
      setStacked(el.clientWidth < 760 || raw < 0.62);
      setK(Math.min(1.9, Math.max(0.62, raw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [L.w, L.h]);

  /**
   * Дэлгэц уншигчид зориулсан урсгалын өгүүлбэр.
   * ⚠️ ИРМЭГЭЭС ҮҮСНЭ, гараар бичигдэхгүй — эс тэгвээс зураг өөрчлөгдөхөд
   *    тайлбар нь хуучраад дэлгэц уншигчид ХУДАЛ зураг өгнө.
   */
  const byId = useMemo(
    () => Object.fromEntries(cards.map((x) => [x.id, x])) as Record<string, Card>,
    [cards],
  );
  const prose = useMemo(
    () => edges.filter((e) => e.kind !== 'back')
      .map((e) => `${byId[e.from].title} → ${byId[e.to].title}`)
      .join('; '),
    [edges, byId],
  );

  const nodeOf = (card: Card, box: Box | null) => (
    <Node key={card.id} card={card} st={state ? state[card.id] ?? null : null} box={box} fine={fine}
      /* ⚠️ Зурвас зөвхөн ЕРӨНХИЙ горимын хяналтын карт дээр */
      rail={!fine && card.id === 'hyanalt' ? rail : null}
      allowed={allowed(card.view)} selected={openCard === card.id} onOpen={onOpen} />
  );

  if (stacked) {
    return (
      <div className={c.canvas} ref={wrap}>
        <div className={c.stack}>
          {cards.map((card, i) => (
            <div key={card.id}>
              {i > 0 && <div className={c.stackArrow} aria-hidden>↓</div>}
              {nodeOf(card, null)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={c.canvas} ref={wrap}>
      <p className={c.sr}>{tr('Урсгал')}: {prose}</p>
      <div className={c.stage} style={{ width: L.w, height: L.h, transform: `scale(${k})` }}>
        <svg className={c.edges} width={L.w} height={L.h} viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
          <defs>
            <marker id="schem-a" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0 0 L7 3.5 L0 7 z" fill="var(--line-strong)" />
            </marker>
            <marker id="schem-b" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0 0 L7 3.5 L0 7 z" fill="var(--bad)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const d = edgePath(L.box[e.from], L.box[e.to], e.kind);
            const cls = e.kind === 'back' ? c.edgeBack : e.kind === 'feed' ? c.edgeFeed : c.edgeMain;
            return (
              <g key={`${e.from}-${e.to}-${e.kind}`}>
                <path d={d} className={cls}
                  markerEnd={`url(#${e.kind === 'back' ? 'schem-b' : 'schem-a'})`} />
                {e.label && (
                  <text className={c.edgeLab}
                    x={(L.box[e.from].x + L.box[e.to].x) / 2 + geo.w / 2}
                    y={Math.max(L.box[e.from].y + L.box[e.from].h, L.box[e.to].y + L.box[e.to].h) + 34}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {cards.map((card) => nodeOf(card, L.box[card.id]))}
      </div>
    </div>
  );
}

/* ══════════════════ Үндсэн харагдац ══════════════════ */

/** «Ерөнхий» схемийн картууд — топологийн дараалалтай */
const COARSE_CARDS: Card[] = topoOrder().map((id) => {
  const n = NODE_BY_ID[id];
  return { id, group: id, title: n.title, desc: n.desc, icon: n.icon, view: n.view, col: n.col, row: n.row };
});
/** «Дэлгэрэнгүй» схемийн 24 карт */
const FINE_CARDS: Card[] = fineOrder().map((id) => {
  const n = FINE_BY_ID[id];
  return { id, group: n.group, title: n.title, desc: n.desc, icon: n.icon, view: n.view, col: n.col, row: n.row };
});

/* ⚠️ Топологи бүрэн зурагдаж байгаа эсэх — карт мартвал ажиллах үед биш ЭНД */
if (COARSE_CARDS.length !== NODES.length || FINE_CARDS.length !== FINE_NODES.length) {
  throw new Error('[selbe] схемийн топологи бүрэн биш — карт мөчлөгт орсон байж магадгүй');
}

export function Schem({
  setView, navScope = 'all',
}: {
  setView: (v: ViewKey) => void;
  /** Хэрэглэгчийн эрхэд байгаа харагдацууд; `'all'` бол хязгааргүй */
  navScope?: 'all' | ViewKey[];
}) {
  const q = useAsync<SchemSources>(loadSchemSources, []);
  const [pkg, setPkg] = useState<string>('');
  /**
   * СОНГОГДСОН КАРТ ба түүний БҮЛЭГ — НЭГ төлөвт.
   *
   * ⚠️ ХОЁР ТУСДАА `useState` БОЛГОХГҮЙ. Нарийвчилсан схемд нэг бүлэгт 3–5
   * карт байдаг тул «энэ карт дахин дарагдсан уу» гэдгийг мэдэхийн тулд
   * хоёулаа зэрэг шинэчлэгдэх ёстой; тусад нь байвал нэг нь нөгөөгийнхөө
   * хуучин утгыг уншиж, «Зөвшөөрсөн»-өөс «Хүлээгдэж буй» рүү шилжихэд
   * самбар чимээгүй ХААГДАНА.
   */
  const [pick, setPick] = useState<{ card: string; group: SchemId } | null>(null);
  /**
   * ⚠️ АНХДАГЧААР «ДЭЛГЭРЭНГҮЙ» (2026-09-01, хэрэглэгчийн шаардлага).
   * «Ерөнхий» нь танилцуулга, хэвлэлтэд зориулсан хураангуй хувилбар болж
   * үлдэнэ — устгаагүй, учир нь түүний тор ба шалтгаанууд баримтжуулагдсан.
   */
  const [fine, setFine] = useState(true);

  const allowed = useCallback(
    (v: ViewKey | null) => !!v && (navScope === 'all' || navScope.includes(v)),
    [navScope],
  );

  /**
   * ⚠️ ШИЛЖИХДЭЭ ЗААВАЛ `setView`. URL-аар (`writeParams`) тойрч гарвал өмнөх
   * харагдацын SQL шүүлт үлдэж, шинэ харагдацын зураг чимээгүй хоосорно.
   */
  const go = useCallback((v: ViewKey) => setView(v), [setView]);

  /** Esc — самбар хаана. Хулганагүй хэрэглэгч зөвхөн ✕ хайх шаардлагагүй. */
  useEffect(() => {
    if (pick == null) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pick]);

  const toggle = useCallback((cardId: string, g: SchemId) => {
    /* ЯГ ТЭР картыг дахин дарвал хаана; өөр картыг дарвал самбар СОЛИГДОНО */
    setPick((cur) => (cur?.card === cardId ? null : { card: cardId, group: g }));
  }, []);

  return (
    <div className={c.frame}>
      <header className={c.head}>
        <div>
          <h2 className={c.title}>{tr('Үйл ажиллагааны схем')}</h2>
          <p className={c.sub}>{tr('Төлөвлөхөөс тайлагнах хүртэлх урсгал — амьд тоогоор')}</p>
        </div>
        <span className={c.spacer} />
        {/* ⚠️ Хоёр товчны бүлэг — checkbox биш: горим ХОЁУЛАА нэр төрөлтэй */}
        <span className={c.modes} role="group" aria-label={tr('Нарийвчлал')}>
          {([true, false] as const).map((d) => (
            <button key={String(d)} type="button"
              className={`${c.mode} ${fine === d ? c.modeOn : ''}`}
              aria-pressed={fine === d}
              onClick={() => setFine(d)}>
              {d ? tr('Дэлгэрэнгүй') : tr('Ерөнхий')}
            </button>
          ))}
        </span>
        <label className={c.field}>
          {tr('Багц')}{' '}
          <select className={c.select} value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="">{tr('Төслийн нийт')}</option>
            {q.state === 'ready' && (q.data.bagts ?? []).map((b) => (
              <option key={b.key} value={b.label}>{b.label}</option>
            ))}
          </select>
        </label>
      </header>

      <div className={c.legend}>
        <span className={c.leg}><i className={c.legLine} />{tr('үе шатны хамаарал')}</span>
        <span className={c.leg}><i className={`${c.legLine} ${c.legDash}`} />{tr('тэжээх холбоо')}</span>
        <span className={c.leg}><i className={`${c.legLine} ${c.legBack}`} />{tr('буцаах шилжилт')}</span>
        {(['good', 'warn', 'bad', 'none'] as Health[]).map((h) => (
          <span key={h} className={c.leg}>
            <i className={`${c.legDot} ${HEALTH_SWATCH[h]}`} />
            {healthText(h)}
          </span>
        ))}
        <span className={c.spacer} />
        <span className={c.leg}>{tr('Карт дээр дарж дэлгэрэнгүйг харна')}</span>
      </div>

      <Data q={q} minH={420} loading={tr('Схем бэлтгэж байна…')}>
        {(src) => {
          /* ⚠️ Нарийвчилсан горимд амьд тоо ОГТ бодогдохгүй — карт дээр
             гарахгүй тул тооцох ч шаардлагагүй. */
          const state = fine ? null : buildSchem(src, pkg || null);
          const rail = stageRail(src, pkg || null);
          return (
            <>
              {src.failed.length > 0 && (
                <p className={c.warnBar} role="status">
                  {tr('{0} эх сурвалж татагдсангүй — тэдгээрийн тоо «—» байна.', src.failed.join(', '))}
                </p>
              )}
              <div className={c.body}>
                <Diagram
                  cards={fine ? FINE_CARDS : COARSE_CARDS}
                  state={state}
                  edges={fine ? FINE_EDGES : EDGES}
                  geo={fine ? GEO_FINE : GEO}
                  rail={rail} fine={fine} allowed={allowed}
                  openCard={pick?.card ?? null} onOpen={toggle} />
                {pick && (
                  <Panel id={pick.group} src={src} pkg={pkg}
                    allowed={allowed(NODE_BY_ID[pick.group].view)}
                    onGo={go} onClose={() => setPick(null)} />
                )}
              </div>
            </>
          );
        }}
      </Data>
    </div>
  );
}

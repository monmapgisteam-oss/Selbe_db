'use client';

/**
 * ТӨСЛИЙН ҮЙЛ АЖИЛЛАГААНЫ СХЕМ.
 *
 *   Төлөвлөгөө ─┬─ Зөвшөөрөл ─┬─ Хуваарь ── Барилга ─┬─ Хяналт ─┬─ Санхүү ── Тайлан
 *               └─ Газар ─────┘                       └─ ХАБЭА ─┘
 *                                          ▲                │
 *                                          └──── буцаасан ───┘
 *
 * ⚠️ ЯАГААД (2026-08-31, хэрэглэгчийн шийдвэр): порталд 15 харагдац бий ч
 * тэдгээр нь хоорондоо ХЭРХЭН ХОЛБОГДОХЫГ хэлдэг газар байгаагүй.
 *
 * ⚠️ ЗУРАХ АРГА: зангилаа нь HTML `<button>` (үнэмлэхүй байрлалтай), ирмэг нь
 * түүний АРД байрлах НЭГ `<svg>`. Хоёулаа `schem.ts`-ийн `layout()`-ийн НЭГ
 * координатыг хэрэглэнэ тул хэзээ ч зөрөхгүй. HTML зангилаа сонгосон шалтгаан:
 * focus ring, tab дараалал, текстийн тайрал, сэдвийн token бүгд үнэгүй ирнэ;
 * SVG `<text>`-д эдгээрийг тус бүрд нь гараар хийх шаардлагатай болно.
 *
 * ⚠️ БҮХ ТООЦОО `src/lib/schem.ts`-д (React-гүй) — `schem.check.mjs` түүнийг
 * шууд шалгана. Энд зөвхөн зурах ажил.
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
  NODE_BY_ID, EDGES, GEO, buildSchem, edgePath, layout, stageRail, topoOrder,
  type Box, type Health, type Metric, type SchemId,
  type SchemLive, type SchemNode, type SchemSources,
} from '@/lib/schem';
import { loadSchemSources } from '@/lib/schemData';
import c from './schem.module.css';

/* ══════════════════ Туслах ══════════════════ */

const HEALTH_TEXT: Record<Health, string> = {
  good: 'Хэвийн', warn: 'Анхаарах', bad: 'Эрсдэлтэй', none: 'Мэдээлэлгүй',
};
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

/* ══════════════════ Нэг зангилаа ══════════════════ */

function Node({
  n, st, box, rail, allowed, onGo,
}: {
  n: SchemNode;
  st: SchemLive[SchemId];
  /** `null` бол БОСОО жагсаалтын горим — байрлал нь урсгалаар тодорхойлогдоно */
  box: Box | null;
  rail: { stage: string; n: number }[] | null;
  allowed: boolean;
  onGo: (v: ViewKey) => void;
}) {
  const stacked = box == null;
  const clickable = allowed && n.view != null;
  return (
    <button
      type="button"
      className={[
        c.node,
        HEALTH_BORDER[st.health],
        st.projectWide ? c.wide : '',
        stacked ? c.stackNode : '',
      ].filter(Boolean).join(' ')}
      /* ⚠️ `height` БИШ `minHeight`: тэмдэглэлтэй зангилаа агуулгаараа тэлнэ,
         торны утга нь зөвхөн ДООД хязгаар. */
      style={box ? { left: box.x, top: box.y, width: box.w, minHeight: box.h } : undefined}
      disabled={!clickable}
      title={clickable ? `${n.desc}\n${tr('Дарж нээнэ')}` : n.desc}
      onClick={() => n.view && onGo(n.view)}
    >
      <span className={c.nodeHead}>
        <span className={c.nodeIcon}><Icon name={n.icon} size={13} /></span>
        <span className={c.nodeTitle}>{n.title}</span>
      </span>

      {/* ХЯНАЛТЫН ДӨРВӨН ЦЭГ — жинхэнэ төлөвийн машиныг ил үлдээнэ */}
      {rail && (
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

      <span className={c.metrics}>
        {st.metrics.map((m) => (
          <span key={m.label} className={c.metric} title={m.why ?? undefined}>
            <span className={c.mLabel}>{m.label}</span>
            <span className={`${c.mValue} ${m.value == null ? c.mNone : ''}`}>{show(m)}</span>
          </span>
        ))}
      </span>

      {st.note && <span className={c.note} title={st.note}>{st.note}</span>}

      <span className={c.tags}>
        <span className={`${c.tag} ${HEALTH_TAG[st.health]}`}>{tr(HEALTH_TEXT[st.health])}</span>
        {st.projectWide && <span className={c.tag}>{tr('төслийн нийт')}</span>}
        {!allowed && n.view && <span className={c.tag}>{tr('эрхгүй')}</span>}
      </span>
    </button>
  );
}

/* ══════════════════ Зураг ══════════════════ */

function Diagram({
  live, rail, allowed, onGo,
}: {
  live: SchemLive;
  rail: { stage: string; n: number }[] | null;
  allowed: (v: ViewKey | null) => boolean;
  onGo: (v: ViewKey) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [k, setK] = useState(1);
  const [stacked, setStacked] = useState(false);
  const L = useMemo(() => layout(), []);

  /**
   * ⚠️ БҮХЭЛД НЬ МАСШТАБЛАНА, дахин байрлуулахгүй. Зангилааны харьцангуй
   * байрлал нь хэрэглэгчийн ой санамжийн хэсэг — нарийн цонхонд өөр зураг
   * үзүүлбэл өмнө сурсан зүйл нь ажиллахаа болино.
   *
   * ⚠️ 1-ЭЭС ДЭЭШ Ч ТОМРУУЛНА (2026-08-31). Урьд нь `Math.min(1, …)` байсан
   * тул том дэлгэц дээр схем нь зүүн дээд буланд жижигхэн хэвээр үлдэж,
   * доод 60% нь хоосон байв. Одоо өргөн ба өндөр ХОЁУЛАНГ нь тооцож, аль
   * хязгаарлаж байгаагаар нь дүүргэнэ.
   *
   * ⚠️ 1.9-өөс дээш ТОМРУУЛАХГҮЙ: 12px текст 24px болоход зураг «том үсэгтэй
   * танилцуулга» болж, мэдээллийн нягтрал алдагдана.
   * ⚠️ 0.62-оос доош БУУРАХГҮЙ: тэрнээс жижиг бол текст уншигдахаа больдог
   * тул оронд нь БОСОО ЖАГСААЛТ болно.
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
   * ⚠️ `EDGES`-ээс ҮҮСНЭ, гараар бичигдэхгүй — эс тэгвээс зураг өөрчлөгдөхөд
   *    тайлбар нь хуучраад дэлгэц уншигчид ХУДАЛ зураг өгнө.
   */
  const prose = useMemo(
    () => EDGES.filter((e) => e.kind !== 'back')
      .map((e) => `${NODE_BY_ID[e.from].title} → ${NODE_BY_ID[e.to].title}`)
      .join('; '),
    [],
  );

  const order = useMemo(() => topoOrder(), []);

  if (stacked) {
    return (
      <div className={c.canvas} ref={wrap}>
        <div className={c.stack}>
          {order.map((id, i) => (
            <div key={id}>
              {i > 0 && <div className={c.stackArrow} aria-hidden>↓</div>}
              <Node n={NODE_BY_ID[id]} st={live[id]} box={null}
                rail={id === 'hyanalt' ? rail : null}
                allowed={allowed(NODE_BY_ID[id].view)} onGo={onGo} />
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
          {EDGES.map((e) => {
            const d = edgePath(L.box[e.from], L.box[e.to], e.kind);
            const cls = e.kind === 'back' ? c.edgeBack : e.kind === 'feed' ? c.edgeFeed : c.edgeMain;
            return (
              <g key={`${e.from}-${e.to}-${e.kind}`}>
                <path d={d} className={cls}
                  markerEnd={`url(#${e.kind === 'back' ? 'schem-b' : 'schem-a'})`} />
                {e.label && (
                  <text className={c.edgeLab}
                    x={(L.box[e.from].x + L.box[e.to].x) / 2 + GEO.w / 2}
                    y={Math.max(L.box[e.from].y + L.box[e.from].h, L.box[e.to].y + L.box[e.to].h) + 48}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ⚠️ DOM-ийн дараалал = ТОПОЛОГИЙН дараалал: Tab дарахад хэрэглэгч
            төслийн мөчлөгөөр алхана, дэлгэц дээрх байрлалаар биш. */}
        {order.map((id) => (
          <Node key={id} n={NODE_BY_ID[id]} st={live[id]} box={L.box[id]}
            rail={id === 'hyanalt' ? rail : null}
            allowed={allowed(NODE_BY_ID[id].view)} onGo={onGo} />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════ Үндсэн харагдац ══════════════════ */

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
   * ⚠️ ЭРХГҮЙ ХАРАГДАЦ РУУ ЗААСАН ЗАНГИЛАА ИДЭВХГҮЙ. Дарахад чимээгүй өөр
   * хуудас руу шидвэл хэрэглэгч алдаа гарлаа гэж бодно; идэвхгүй байдал нь
   * «энэ хэсэг байгаа ч танд нээлттэй биш» гэдгийг шууд хэлнэ.
   */
  const allowed = useCallback(
    (v: ViewKey | null) => !!v && (navScope === 'all' || navScope.includes(v)),
    [navScope],
  );

  /**
   * ⚠️ ШИЛЖИХДЭЭ ЗААВАЛ `setView`. URL-аар (`writeParams`) тойрч гарвал өмнөх
   * харагдацын SQL шүүлт үлдэж, шинэ харагдацын зураг чимээгүй хоосорно —
   * `Portal.tsx`-ийн `setView` нь `visible`/`picked`/`layer`-ийг дахин
   * тохируулж шүүлтийг цэвэрлэдэг.
   */
  const go = useCallback((v: ViewKey) => setView(v), [setView]);

  return (
    <div className={c.frame}>
      <header className={c.head}>
        <div>
          <h2 className={c.title}>{tr('Үйл ажиллагааны схем')}</h2>
          <p className={c.sub}>{tr('Төлөвлөхөөс тайлагнах хүртэлх урсгал — амьд тоогоор')}</p>
        </div>
        <span className={c.spacer} />
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
            {tr(HEALTH_TEXT[h])}
          </span>
        ))}
      </div>

      <Data q={q} minH={420} loading={tr('Схем бэлтгэж байна…')}>
        {(src) => {
          const live = buildSchem(src, pkg || null);
          const rail = stageRail(src, pkg || null);
          return (
            <>
              {src.failed.length > 0 && (
                <p className={c.warnBar} role="status">
                  {tr('{0} эх сурвалж татагдсангүй — тэдгээрийн тоо «—» байна.', src.failed.join(', '))}
                </p>
              )}
              <Diagram live={live} rail={rail} allowed={allowed} onGo={go} />
            </>
          );
        }}
      </Data>
    </div>
  );
}

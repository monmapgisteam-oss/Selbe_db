'use client';

/**
 * ТАЙЛАНГИЙН ГРАФИКУУД — цэвэр SVG/CSS, ямар ч сан ашиглаагүй.
 *
 * ⚠️ ЯАГААД (2026-09-03, хэрэглэгчийн хүсэлт): тайлан нь 16 хүснэгт, хэдэн зуун
 * тоо байв. «Тоонууд нь сайн ч нэг бүрчлэн уншихад хэцүү» — өөрөөр хэлбэл
 * ХАРЬЦУУЛАЛТ нь нүдэнд шууд харагдахгүй байлаа. График нь хүснэгтийг СОЛИХГҮЙ:
 * дээр нь харьцуулалтыг зурж, хүснэгт нь нарийвчилсан бүртгэл хэвээр үлдэнэ
 * (мөн дэлгэц уншигчийн хувьд график нь `aria-hidden`, хүснэгт нь эх сурвалж).
 *
 * ⚠️ НЭР ТОМЬЁОНЫ БУС КАТЕГОРТ ӨНГӨНИЙ ШАТЛАЛ ХЭРЭГЛЭХГҮЙ. Багц, гүйцэтгэгч,
 * ажлын бүлэг зэрэг нь эрэмбэгүй нэрс — баганыг «том нь бараан» гэж будвал
 * уртаар нь аль хэдийн харуулсан мэдээллийг өнгөөр ДАВХАРДУУЛЖ, өнгөний
 * цорын ганц чөлөөт сувгийг үрнэ. Тиймээс бүх багана НЭГ өнгөтэй (`--data`).
 *
 * ⚠️ ХОЁР ТЭНХЛЭГТ ГРАФИК ОГТ ХИЙХГҮЙ. Төсөв (₮) ба гүйцэтгэл (%) хоёрыг нэг
 * зурагт давхарлавал масштабын харьцаа нь дурын болж, байхгүй хамаарлыг
 * зохионо. Хоёр хэмжигдэхүүн = хоёр график.
 *
 * ⚠️ СТАТУСЫН ӨНГӨ (`--good`/`--warn`/`--bad`) нь ЗӨВХӨН төлөв заана — «3 дахь
 * цуваа» болгож хэрэглэхгүй. Мөн өнгө нь ганцаараа мэдээлэл дамжуулахгүй:
 * шошго үргэлж дагалдана.
 *
 * ⚠️ ДАВХАРЛАСАН НЭГ ЗУРВАС (stacked bar) ХЭРЭГЛЭХГҮЙ — 2026-09-03-нд
 * хэрэглэгч ХАССАН. Шалтгаан нь бодит: хэрчим бүр өөр цэгээс эхэлдэг тул
 * ойролцоо утгуудыг («Багц 1 15.4%» ↔ «Багц 4.1 10.7%») нүдээр харьцуулах
 * боломжгүй, мөн 0.2%-иас бага хэсэг үл үзэгдэх зураас болдог. Хэсэг-бүтэн
 * харьцааг ч ХЭВТЭЭ БАГАНААР харуулна: бүгд нэг суурьтай тул урт нь шууд
 * харьцуулагдаж, шошго нь хувийг хэлнэ.
 */

import { num, pct } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import c from './tailanChart.module.css';

/* ══════════════════ Туслах ══════════════════ */

/** 0 хуваахаас хамгаална; хязгаараас гарсныг 0–1-д барина. */
const frac = (v: number, top: number) =>
  top > 0 && Number.isFinite(v) ? Math.max(0, Math.min(1, v / top)) : 0;

/** График зурах утга байна уу — ⚠️ хоосон дээр «0» зурвал ХУДАЛ мэдээлэл */
const hasData = (vals: (number | null | undefined)[]) =>
  vals.some((v) => v != null && Number.isFinite(v) && v !== 0);

export type BarItem = {
  label: string;
  value: number | null;
  /** Багана дээр гарах бэлэн шошго (мөнгө, хувь, ширхэг…) */
  text?: string;
  /** Онцлох багана — «энэ нэг нь гол» түүх (эмфазис) */
  hot?: boolean;
};

/* ══════════════════ Хүснэгтийн гарчиг ══════════════════ */

/**
 * Графикийн дугаартай тайлбар — хүснэгтийн `Cap`-тай ИЖИЛ хэлбэр.
 * ⚠️ Дугаарлалт нь хүснэгтийнхээс ТУСДАА («Зураг 2»), эс тэгвээс эх бичвэрт
 *    «2-р хүснэгт» гэж заасан лавлагаа хоёрдмол утгатай болно.
 */
export function Fig({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={c.cap}>{tr('Зураг')} {no}. <span>{children}</span></p>;
}

/* ══════════════════ Эрэмбэлсэн багана ══════════════════ */

/**
 * ХЭВТЭЭ БАГАНА — хэмжээг харьцуулна.
 *
 * ⚠️ ХЭВТЭЭ байх шалтгаан: ангиллын нэр урт («Хятадын Хоёрдугаар металлурги
 * Групп Корпораци ХХК»). Босоо баганад ийм нэр 45°-аар эргэж, уншигдахгүй
 * болно.
 *
 * ⚠️ Шошго нь багана БҮРД гарна — 10-аас цөөн зүйлд «сонгомол шошго» гэсэн
 * дүрэм үйлчлэхгүй, харин хүснэгт рүү харах шаардлагыг арилгана.
 */
export function RankBars({
  items,
  fmt = (v) => num(v),
  title,
  max,
}: {
  items: BarItem[];
  fmt?: (v: number) => string;
  /** Дэлгэц уншигчид зориулсан нэг өгүүлбэр */
  title: string;
  /** Тэнхлэгийн дээд утга — өгөөгүй бол хамгийн их гишүүн */
  max?: number;
}) {
  const vals = items.map((i) => i.value);
  if (!items.length || !hasData(vals)) return null;
  const top = max ?? Math.max(...vals.map((v) => v ?? 0), 0);
  if (!(top > 0)) return null;

  return (
    <figure className={c.fig} role="img" aria-label={title}>
      <div className={c.bars}>
        {items.map((it, i) => (
          <div key={`${it.label}-${i}`} className={c.barRow}>
            <span className={c.barName} title={it.label}>{it.label}</span>
            <span className={c.barTrack}>
              {/* ⚠️ Хэмжигдээгүйг (`null`) 0 гэж ЗУРАХГҮЙ — «мэдээлэлгүй» ба
                  «тэг гүйцэтгэл» хоёр огт өөр утгатай. */}
              {it.value == null ? null : (
                <span
                  className={`${c.bar} ${it.hot ? c.barHot : ''}`}
                  style={{ width: `${frac(it.value, top) * 100}%` }}
                />
              )}
            </span>
            <span className={c.barVal}>
              {it.value == null ? <i className={c.na}>{tr('мэдээлэлгүй')}</i> : (it.text ?? fmt(it.value))}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/* ══════════════════ Хугацааны цуваа ══════════════════ */

/**
 * САР ТУТМЫН ЦУВАА — нэг цуваа тул ТАЛБАЙ (area), домог хэрэггүй.
 *
 * ⚠️ Хэмжилтгүй сарыг АЛГАСАХГҮЙ, харин ЦООРХОЙ үлдээнэ: 0 гэж зурвал
 * «тэр сард юу ч олгоогүй» гэсэн ХУДАЛ мэдээлэл болно.
 */
export function TrendArea({
  points,
  fmt = (v) => num(v),
  title,
}: {
  points: { label: string; value: number | null }[];
  fmt?: (v: number) => string;
  title: string;
}) {
  const vals = points.map((p) => p.value);
  if (points.length < 2 || !hasData(vals)) return null;
  const top = Math.max(...vals.map((v) => v ?? 0), 0);
  if (!(top > 0)) return null;

  const W = 100;
  const H = 34;
  const x = (i: number) => (points.length === 1 ? 0 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - frac(v, top) * H;

  /* ⚠️ Цоорхойг таслана: `null` дээр шинэ сегмент эхэлнэ — эс тэгвээс шугам
     хэмжилтгүй сарыг дамжин «шулуун» зурагдаж, байхгүй өгөгдөл зохиогдоно. */
  const runs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value == null) { if (cur.length) runs.push(cur); cur = []; return; }
    cur.push({ i, v: p.value });
  });
  if (cur.length) runs.push(cur);

  const hi = points.reduce(
    (best, p, i) => (p.value != null && p.value > (best.v ?? -Infinity) ? { i, v: p.value } : best),
    { i: -1, v: null as number | null },
  );

  return (
    <figure className={c.fig} role="img" aria-label={title}>
      <svg className={c.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {runs.map((run, k) => (
          <g key={k}>
            {run.length > 1 && (
              <path
                className={c.area}
                d={`M ${x(run[0].i)} ${H} ${run.map((p) => `L ${x(p.i)} ${y(p.v)}`).join(' ')} L ${x(run[run.length - 1].i)} ${H} Z`}
              />
            )}
            <path
              className={c.line}
              /* ⚠️ `vector-effect` нь CSS-д: `preserveAspectRatio="none"` нь
                 зурааст сунгалт үүсгэдэг тул шугамын өргөн гажина. */
              d={`M ${run.map((p) => `${x(p.i)} ${y(p.v)}`).join(' L ')}`}
            />
          </g>
        ))}
      </svg>
      <div className={c.axis}>
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`} className={i === hi.i ? c.axHot : undefined}>
            {/* ⚠️ Шошго нь ЗӨВХӨН эхэн, төгсгөл, оргилд — сар бүрд бичвэл
                бие бие рүүгээ орж, аль аль нь уншигдахгүй. */}
            {i === 0 || i === points.length - 1 || i === hi.i ? p.label : ''}
          </span>
        ))}
      </div>
      {hi.i >= 0 && hi.v != null && (
        <p className={c.note}>
          {tr('Оргил')}: <b>{points[hi.i].label}</b> — {fmt(hi.v)}
        </p>
      )}
    </figure>
  );
}

/* ══════════════════ Хэмжүүр ══════════════════ */

/**
 * ХЭМЖҮҮР — нэг харьцаа, лавлах утгатай.
 * ⚠️ Нэг баганатай баганан график БИШ: цорын ганц тоог зурвасаар харуулна.
 */
export function Meter({
  value,
  plan,
  label,
}: {
  /** 0–100 хувь */
  value: number | null;
  /** Төлөвлөгөөт хувь — лавлах зураас (0–100) */
  plan?: number | null;
  label: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  /* ⚠️ Хоцрогдлыг ӨНГӨӨР заана — статусын өнгө яг энэ зориулалттай. */
  const late = plan != null && Number.isFinite(plan) && value < plan;
  return (
    <div className={c.meter} role="img" aria-label={`${label}: ${pct(value, 2)}`}>
      <span className={c.meterTrack}>
        <span
          className={`${c.meterFill} ${late ? c.t_warn : ''}`}
          style={{ width: `${frac(value, 100) * 100}%` }}
        />
        {plan != null && Number.isFinite(plan) && (
          <i className={c.meterPlan} style={{ left: `${frac(plan, 100) * 100}%` }}
            title={`${tr('Төлөвлөгөө')} ${pct(plan, 2)}`} />
        )}
      </span>
      <span className={c.meterVal}>{pct(value, 2)}</span>
    </div>
  );
}

/* ══════════════════ Үзүүлэлтийн эгнээ ══════════════════ */

export type Kpi = { label: string; value: string; sub?: string };

/**
 * ГОЛ ҮЗҮҮЛЭЛТИЙН ЭГНЭЭ — цөөн толгой тоо.
 * ⚠️ Эдгээрийг график болгохгүй: нэг тоог багана болгон зурах нь мэдээлэл
 *    нэмэхгүй, зөвхөн зай иднэ. Тоо нь өөрөө «график».
 */
export function KpiRow({ items }: { items: Kpi[] }) {
  if (!items.length) return null;
  return (
    <div className={c.kpis}>
      {items.map((k, i) => (
        <div key={`${k.label}-${i}`} className={c.kpi}>
          <span className={c.kpiLabel}>{k.label}</span>
          <b className={c.kpiVal}>{k.value}</b>
          {k.sub && <span className={c.kpiSub}>{k.sub}</span>}
        </div>
      ))}
    </div>
  );
}

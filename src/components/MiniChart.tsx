'use client';

/**
 * KPI КАРТАД ОРОХ ЖИЖИГ ГРАФИКУУД — цэвэр SVG, ямар ч сан ашиглаагүй.
 *
 * ⚠️ ЭДГЭЭР НЬ ЧИМЭГЛЭЛ БИШ, ӨГӨГДӨЛ. Дүрслэх утга нь ЗААВАЛ ArcGIS-ээс
 * ирсэн бодит тоо байна. Хэлбэр дүрсийг «дүүргэх» гэж хиймэл цуваа, дүрсэлбэр
 * ХЭЗЭЭ Ч зурахгүй — цуваа байхгүй бол графикийг огт үзүүлэхгүй.
 *
 * ⚠️ Өнгийг `currentColor`-оор авна. Тиймээс эцэг элемент дээр `color` тавихад
 * л хангалттай бөгөөд гэрэл/харанхуй горимд өөрөө дагаж өөрчлөгдөнө.
 *
 * ⚠️ Бүгд `aria-hidden` — яг тэр тоо нь картын текстэд аль хэдийн бичигдсэн тул
 * дэлгэц уншигчид давхардуулж уншуулах нь зөвхөн саад болно.
 */

import { useId } from 'react';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/* ══════════════ Цагираг — НЭГ хувь/оноо ══════════════ */

export function Ring({
  value,
  max = 100,
  size = 66,
  width = 7,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  width?: number;
  /** Голд бичих богино текст — байхгүй бол хоосон цагираг */
  label?: string;
}) {
  const r = (size - width) / 2;
  const circ = 2 * Math.PI * r;
  const frac = clamp01(max > 0 ? value / max : 0);
  const mid = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
      <circle
        cx={mid} cy={mid} r={r} fill="none" strokeWidth={width}
        stroke="color-mix(in srgb, currentColor 16%, transparent)"
      />
      {/* ⚠️ -90° эргүүлэлт — эс бөгөөс цагираг 3 цагийн зүгээс эхэлнэ */}
      <circle
        cx={mid} cy={mid} r={r} fill="none" strokeWidth={width}
        stroke="currentColor" strokeLinecap="round"
        strokeDasharray={`${circ * frac} ${circ}`}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      {label && (
        <text
          x={mid} y={mid} textAnchor="middle" dominantBaseline="central"
          fill="currentColor" fontSize={size * 0.23} fontWeight={750}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/* ══════════════ Босоо баганууд — цувааны ХЭМЖЭЭ ══════════════ */

export function Bars({
  data,
  w = 104,
  h = 44,
}: {
  data: number[];
  w?: number;
  h?: number;
}) {
  if (!data.length) return null;
  // ⚠️ Сөрөг утгыг 0 болгоно — баганы өндөр сөрөг байж болохгүй
  const v = data.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const max = Math.max(...v, 1);
  const gap = v.length > 24 ? 1 : 2;
  const bw = Math.max(1, (w - gap * (v.length - 1)) / v.length);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden focusable="false">
      {v.map((x, i) => {
        const bh = Math.max(1, (x / max) * h);
        return (
          <rect
            key={i}
            x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={Math.min(1.5, bw / 2)}
            fill="currentColor"
            /* Сүүлийн үеийн багана тод — цаг хугацааны чиглэлийг нүдэнд харуулна */
            opacity={0.35 + 0.65 * ((i + 1) / v.length)}
          />
        );
      })}
    </svg>
  );
}

/* ══════════════ Чиг хандлагын шугам ══════════════ */

/**
 * Цэгүүдийг ГӨЛГӨР муруйгаар холбоно (Catmull-Rom → куб Безье).
 *
 * ⚠️ Хурцлалыг 1.0 БИШ 0.82 авав: 1.0 үед муруй нь цэгүүдээс давж «дүүлж»,
 * доод/дээд ирмэгээс гарч, байхгүй өсөлт/уналт зурсан мэт харагдана.
 * ⚠️ Гарсан цэгийг ирмэг рүү нь ЗААВАЛ хумина — эс бөгөөс талбайн дүүргэлт
 * хайрцгаас цухуйна.
 */
function smoothPath(pts: { x: number; y: number }[], lo: number, hi: number): string {
  if (pts.length < 2) return '';
  const T = 0.82;
  const cl = (v: number) => Math.max(lo, Math.min(hi, v));
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * T;
    const c1y = cl(p1.y + ((p2.y - p0.y) / 6) * T);
    const c2x = p2.x - ((p3.x - p1.x) / 6) * T;
    const c2y = cl(p2.y - ((p3.y - p1.y) / 6) * T);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)}`
      + ` ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export function Spark({
  data,
  w = 110,
  h = 46,
  dots = true,
}: {
  data: number[];
  w?: number;
  h?: number;
  dots?: boolean;
}) {
  /*
   * ⚠️ `useId` — нэг хуудсанд хэд хэдэн Spark байх ба градиентын `id` давхцвал
   * бүгд ЭХНИЙХИЙНХЭЭ өнгийг өмсөнө. React-ийн ID нь давхцахгүйг баталгаажуулна.
   */
  const uid = useId().replace(/:/g, '');

  // ⚠️ Хоёроос цөөн цэгээр ЧИГ ХАНДЛАГА гаргах боломжгүй — юу ч зурахгүй
  if (data.length < 2) return null;
  const v = data.map((x) => (Number.isFinite(x) ? x : 0));
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pad = 4;
  const px = (i: number) => (i / (v.length - 1)) * (w - pad * 2) + pad;
  const py = (x: number) => h - pad - ((x - min) / span) * (h - pad * 2);
  const pts = v.map((x, i) => ({ x: px(i), y: py(x) }));

  const line = smoothPath(pts, pad, h - pad);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden focusable="false">
      <defs>
        {/* Талбайг тэгш опацитигаар биш, ДЭЭРЭЭС ДООШ уусгаж дүүргэнэ */}
        <linearGradient id={`sp${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.10" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#sp${uid})`} />
      <path
        d={line} fill="none" stroke="currentColor" strokeWidth={1.9}
        strokeLinecap="round" strokeLinejoin="round"
      />
      {dots && (
        <>
          {/* Сүүлийн цэг л онцолно — цэг бүрийг дүүргэвэл шугам бөөгнөрч харагдана */}
          <circle cx={last.x} cy={last.y} r={4} fill="currentColor" opacity={0.22} />
          <circle cx={last.x} cy={last.y} r={2.1} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/* ══════════════ Хэвтээ жагсаалт — ЭРЭМБЭ ══════════════ */

export function HBars({
  items,
  max,
}: {
  items: { label: string; value: number }[];
  /** Тэнхлэгийн дээд утга — өгөөгүй бол хамгийн их гишүүнээр */
  max?: number;
}) {
  if (!items.length) return null;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);

  return (
    /*
     * ⚠️ `width: 100%` ЗААВАЛ. Эцэг элемент нь `place-items: center` (grid) тул
     * хүүхдийг агуулгаараа нарийсгадаг — тэр үед доорх `flex: 1` зурвас 0
     * өргөнтэй болж, БАГАНУУД ОГТ ХАРАГДАХГҮЙ, зөвхөн хувийн тоо үлдэнэ.
     */
    <div style={{ display: 'grid', gap: 4, width: '100%', minWidth: 0 }} aria-hidden>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              height: 6,
              borderRadius: 999,
              background: 'color-mix(in srgb, currentColor 14%, transparent)',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                borderRadius: 999,
                background: 'currentColor',
                width: `${clamp01(it.value / top) * 100}%`,
                opacity: 0.45 + 0.55 * ((items.length - i) / items.length),
              }}
            />
          </span>
          <span
            style={{
              flex: 'none',
              fontSize: '0.66rem',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--ink-3)',
              minWidth: 26,
              textAlign: 'right',
            }}
          >
            {Math.round(it.value)}%
          </span>
        </div>
      ))}
    </div>
  );
}

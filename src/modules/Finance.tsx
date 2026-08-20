'use client';

import { useState, type MouseEvent } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Data, Empty } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW2, IPC_LOG, TASK_SHEET, bagtsKey, pkgKeyOf } from '@/lib/services';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import { mntShort, num, text, cat } from '@/lib/format';
import f from './finance.module.css';

/* ═══════════════════════════════════════════════════════════
   САНХҮҮЖИЛТ — CASHFLOW (төлөвлөгөө) + IPC (олгосон акт).
   МӨР (гэрээ/багц) БҮРД тусдаа график: сар бүр хэдэн хувьд гүйцэтгэж,
   хэдэн төгрөг ТӨЛӨВЛӨСӨН (PLAN слот) ба IPC-ээр хэдийг ОЛГОСОН (ACT слот).
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

/**
 * ⚠️ 2026-08-18: багцын түлхүүр нь `bagtsKey` (services.ts) — ЛОКАЛ `pkgKey`
 * хасагдав. Тэр нь цэгийг үлдээж, зурааныг хаядаг байсан тул «БАГЦ-3.1»
 * (/107 IPC) ба «Багц 3-1» (/106 Cashflow) хоёр өөр түлхүүр болж, тухайн
 * гэрээний «Өссөн олгосон» багана чимээгүй алга болдог байв. `phys`/`PhysMap`
 * аль хэдийн `bagtsKey` хэрэглэдэг байсан — одоо гурвуулаа НЭГ дүрэмтэй.
 */

/** Жинхэнэ акт мөн үү — "Contract Price" псевдо-мөр, хоосон мөрийг хасна */
const isRealAct = (no: unknown) => /^(IPC|APC|АРС)[-\s]?\d+/i.test(String(no ?? '').trim());

/**
 * S-муруйн гурван цуваа — баталгаажсан палитрын слотууд.
 *
 * ⚠️ 2026-08-17: Урьд нь тогтмол hex байсан (`#0891b2 / #22c55e / #a855f7`) —
 * хоёр асуудалтай: горим дагадаггүй, мөн `#22c55e`/`#a855f7` нь цагаан дээр
 * 2.0–3.4:1 буюу хэмжээст тэмдэгт болоход сул.
 *
 * ⚠️ 2026-08-18: слот 1/4/7 → 1/2/3. Гурван цуваа нь графикт ЗЭРЭГЦЭЭ орох тул
 * аль ч хоёр нь зэрэгцэж болно — палитрын эхний ГУРВАН слот нь CVD-ийн
 * шалгуурт хамгийн сайн салгагдсан дараалал (усан цэнхэр · улбар шар · индиго).
 * Хуучин 1/4/7 нь усан цэнхэр↔ногоонийг зэрэгцүүлж, өнгө ялгах бэрхшээлтэй
 * хэрэглэгчид төлөвлөгөө/санхүүжилт хоёрыг ялгахад хүндрэлтэй байв.
 * ⚠️ Эдгээр нь `var(--cN)` буцаадаг тул ЗӨВХӨН CSS контекстэд ажиллана — энэ
 * файлын SVG будаг бүхэн `style={{ fill/stroke }}` руу шилжсэн (presentation
 * ШИНЖ дотор `var()` задардаггүй).
 */
const PLAN = cat(2); // төлөвлөгөөт өссөн % — индиго (суурь лавлагаа)
const ACT = cat(0); // олгосон санхүүжилтийн өссөн % — усан цэнхэр (аппын акцент)
const PHYS = cat(1); // биет гүйцэтгэлийн % — улбар шар (муруй, хоёуланаас тодрох)

type Row = Record<string, unknown>;

/** Нэг сарын цэг: төлөвлөгөө + олгосон + биет гүйцэтгэл */
export type MonthPt = {
  label: string; // «2025-10»
  amount: number; // тухайн сард авах санхүүжилт ₮ (төлөвлөгөө)
  amountCum: number; // өссөн төлөвлөгөө ₮
  cumPct: number; // өссөн гүйцэтгэлийн хувь (0–100)
  given: number; // тухайн сард IPC-ээр олгосон ₮ (net)
  phys: number; // сарын эцсийн байдлаарх БИЕТ гүйцэтгэл % («Гүйцэтгэл бөглөх»); 0 = дата алга
};

/** Багц бүрийн IPC: сар → олгосон нийлбэр */
export type GivenMap = Map<string, Map<string, number>>;

/** Багц бүрийн биет гүйцэтгэл: сар → % (блокуудын дундаж, тухайн сарын эцсээр) */
export type PhysMap = Map<string, Map<string, number>>;

/**
 * `physCnt` — багц бүрийн сар тутмын БЛОКИЙН ТОО (phys дундаж хэдэн блокоос гарсан).
 * Төслийн нэгтгэсэн биет гүйцэтгэлийг багцуудаар блок-жигнэхэд (давхар дунджийг
 * зайлсхийхэд) ашиглана — `phys`-ийн утгыг ХӨНДӨХГҮЙ, зэрэгцээ мэдээлэл.
 */
export type FinData = { contracts: Row[]; given: GivenMap; phys: PhysMap; physCnt: PhysMap };

// ═══════════════════════════════════════════════════════════
//  КОМБО ГРАФИК (envhub хэлээр) — градиентгүй, glow-гүй хавтгай дүрслэл.
//  Багана = өссөн олгосон ₮ (ACT) · шугам = төлөвлөгөө (PLAN) ба биет (PHYS).
//  X тэнхлэгт он сар + өссөн хувиуд цуваа өөрийн слотын өнгөөр.
// ═══════════════════════════════════════════════════════════

export function ComboChart({
  items,
  height = 280,
  lagMonth,
  lagLvl,
}: {
  items: MonthPt[];
  height?: number;
  /** Хоцрогдол хэмжсэн сар — тэр сарын БИЕТ багана анивчина */
  lagMonth?: string;
  lagLvl?: 'red' | 'yellow' | null;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 1600;
  const H = height;
  const padL = 76; // зүүн — Y тэнхлэгийн ₮ шошго (зүүн ирмэгээс эхэлнэ)
  const padR = 40; // баруун — сүүлийн цэгийн шошго
  const padT = 22;
  const padB = 58; // доор — он сар + төлөвлөгөөт % + биет % (3 мөр)
  const N = items.length;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);

  // ── Өссөн S-муруйн өгөгдөл — ₮ ТЭНХЛЭГ (нэг тэнхлэг): төлөвлөгөө · санхүүжилт · биет.
  //    Мөнгө нь ₮-ээр (хуучинтай адил утга); биет нь ₮ өндөртэй ч %-аар шошголно. ──
  const totalPlan = Math.max(1, ...items.map((i) => i.amountCum));
  const yMax = totalPlan;
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
  let gsum = 0;
  const rows = items.map((it) => {
    gsum += it.given;
    return {
      label: it.label,
      planned: it.amountCum, // өссөн төлөвлөгөө ₮
      financing: gsum, // өссөн олгосон санхүүжилт ₮
      physical: (it.phys / 100) * totalPlan, // биет гүйцэтгэлийн үнэ цэнэ ₮ (өндөр тогтооно)
      physPct: it.phys, // шошго/тултипт харуулах биет %
      givenCum: gsum,
      it,
    };
  });
  // Бодит муруйнууд (санхүүжилт, биет) зөвхөн ОДОО хүртэл; төлөвлөгөө л дуустал хүрнэ
  let lastPhys = -1;
  rows.forEach((r, i) => { if (r.physPct > 0) lastPhys = i; });

  // Шугам зурах цуваа — ТӨЛӨВЛӨГӨӨ + БИЕТ (санхүүжилт нь БАГАНА, доор тусад нь).
  const series: { key: 'planned' | 'physical'; color: string; end: number }[] = [
    { key: 'planned', color: PLAN, end: N - 1 },
    { key: 'physical', color: PHYS, end: lastPhys },
  ];

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHi(Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width) * (N - 1)))));
  };
  const pt = hi != null ? rows[hi] : null;
  const showLabel = (i: number) => N <= 15 || i % 2 === 0 || i === N - 1;
  // Ирмэг дээрх шошго халхлагдахгүй: эхнийх баруун тийш, сүүлчийнх зүүн тийш
  const anchorFor = (i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');

  return (
    <div className={f.chartWrap} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg
        className={f.comboSvg}
        style={{ height: H }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={tr('Өссөн явцын S-муруй: төлөвлөгөө, санхүүжилт, биет гүйцэтгэл (%)')}
      >
        {/* Хэвтээ тор + Y тэнхлэгийн ₮ (0 → нийт төлөвлөгөө) */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const val = t * yMax;
          const gy = yFor(val);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={f.curveGrid} />
              {/* Зүүн ирмэгээс эхэлж баруун тийш — хэзээ ч халхлагдахгүй */}
              <text x={4} y={gy - 4} className={f.sAxisY} textAnchor="start">
                {t === 0 ? '0' : mntShort(val).replace(' ₮', '')}
              </text>
            </g>
          );
        })}

        {/* Хоцрогдсон сарын тэмдэг — босоо шугам + биет цэг дээр ЛУГШДАГ статус
            цэг (glow-гүй; өнгө нь --bad/--warn, зэрэг нь лугшилтын хурдаар) */}
        {lagMonth != null && lagLvl != null && (() => {
          const li = rows.findIndex((r) => r.label === lagMonth);
          if (li < 0) return null;
          const color = lagLvl === 'red' ? 'var(--bad)' : 'var(--warn)';
          const cx = xFor(li);
          return (
            <g>
              <line
                x1={cx} x2={cx} y1={padT} y2={padT + plotH}
                stroke={color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.5}
              />
              {rows[li].physPct > 0 && (
                <circle
                  cx={cx} cy={yFor(rows[li].physical)} r={5} fill={color}
                  className={lagLvl === 'red' ? f.barBlinkRed : f.barBlinkYellow}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })()}

        {/* САНХҮҮЖИЛТ (IPC) — ӨССӨН ОЛГОСОН ₮ БАГАНА (шугам БИШ) */}
        {(() => {
          const step = N > 1 ? plotW / (N - 1) : plotW;
          const bw = Math.min(18, step * 0.5);
          return rows.map((r, i) => {
            if (r.givenCum <= 0) return null;
            const y = yFor(r.givenCum);
            const hgt = padT + plotH - y;
            return (
              <g key={`ipc-${i}`}>
                <rect x={xFor(i) - bw / 2} y={y} width={bw} height={hgt} rx={2} opacity={0.82} style={{ fill: ACT }} />
                {/* Баганын шошго — зөвхөн төлөвлөгөөний цэгээс ХАНГАЛТТАЙ доор бол
                    (эс бөгөөс эхэн үед утга ойролцоо тул төлөвлөгөөнийхтэй давхцана).
                    Өнгө нь ACT цувааныхаа слот — identity, статус биш. */}
                {showLabel(i) && y - yFor(r.planned) > 14 && (
                  <text x={xFor(i)} y={y - 4} className={f.barValG} style={{ fill: ACT }} textAnchor={anchorFor(i)}>
                    {mntShort(r.givenCum).replace(' ₮', '')}
                  </text>
                )}
              </g>
            );
          });
        })()}

        {/* Шугам: төлөвлөгөө (PLAN — индиго) + биет (PHYS — улбар шар);
            санхүүжилт нь багана тул энд алга */}
        {series.map((sd) => {
          if (sd.end < 1) return null;
          const linePts = rows.slice(0, sd.end + 1).map((r, i) => ({ x: xFor(i), y: yFor(r[sd.key]) }));
          return (
            <path
              key={sd.key}
              d={smoothPath(linePts)}
              className={f.sLine}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: sd.color }}
            />
          );
        })}

        {/* ТӨЛӨВЛӨГӨӨ — цэг бүр дээр ТОЙРОГ + өссөн ₮ (сөөлжилсөн байрлал) */}
        {rows.map((r, i) => {
          if (r.planned <= 0) return null;
          const x = xFor(i);
          const y = yFor(r.planned);
          return (
            <g key={`pl-${i}`}>
              <circle cx={x} cy={y} r={3.5} className={f.sDot} vectorEffect="non-scaling-stroke" style={{ fill: PLAN }} />
              {showLabel(i) && (
                <text x={x} y={y - (i % 2 === 0 ? 8 : 18)} className={f.barVal} textAnchor={anchorFor(i)}>
                  {mntShort(r.planned).replace(' ₮', '')}
                </text>
              )}
            </g>
          );
        })}

        {/* БИЕТ ГҮЙЦЭТГЭЛ — цэг бүр дээр зөвхөн ТОЙРОГ (% нь доод тэнхлэгийн мөрөнд,
            баганатай давхцахгүйн тулд) */}
        {rows.map((r, i) => (i > lastPhys || r.physPct <= 0 ? null : (
          <circle
            key={`ph-${i}`}
            cx={xFor(i)} cy={yFor(r.physical)} r={3.5}
            className={f.sDot} vectorEffect="non-scaling-stroke" style={{ fill: PHYS }}
          />
        )))}

        {/* Hover: crosshair + сарын цэгүүд */}
        {hi != null && (
          <>
            <line x1={xFor(hi)} x2={xFor(hi)} y1={padT} y2={padT + plotH} className={f.curveCursor} />
            {series.map((sd) => (hi <= sd.end ? (
              <circle
                key={sd.key}
                cx={xFor(hi)} cy={yFor(rows[hi][sd.key])} r={3.5}
                className={f.sDot} vectorEffect="non-scaling-stroke" style={{ fill: sd.color }}
              />
            ) : null))}
          </>
        )}

        {/* X тэнхлэг — 3 мөр: он сар · ТӨЛӨВЛӨГӨӨТ өссөн % · БИЕТ гүйцэтгэл %.
            Хоёр % мөр зэрэгцдэг тул цуваа бүр ӨӨРИЙН слотын өнгөөр (fill inline) —
            энэ нь envhub-ийн «өнгө = утга» дүрэмд нийцсэн identity будаг.
            Хувиудыг ЭНД эмхлэснээр график дотор баганатай давхцахгүй. */}
        {rows.map((r, i) => (showLabel(i) ? (
          <g key={r.label}>
            <text x={xFor(i)} y={H - 36} className={f.axisX} textAnchor="middle">{r.label}</text>
            {r.it.cumPct > 0 && (
              <text x={xFor(i)} y={H - 21} className={f.axisXPct} style={{ fill: PLAN }} textAnchor="middle">
                {r.it.cumPct.toFixed(1)}%
              </text>
            )}
            {i <= lastPhys && r.physPct > 0 && (
              <text x={xFor(i)} y={H - 6} className={f.axisXPct} style={{ fill: PHYS }} textAnchor="middle">
                {r.physPct.toFixed(1)}%
              </text>
            )}
          </g>
        ) : null))}
      </svg>

      {/* Tooltip */}
      {pt && (
        <div
          className={f.tip}
          style={{ left: `${(hi! / Math.max(1, N - 1)) * 100}%`, transform: `translateX(${hi! < N / 2 ? '10px' : 'calc(-100% - 10px)'})` }}
        >
          <p className={`num ${f.tipHd}`}>{pt.label}</p>
          <p className={f.tipRow}><i style={{ background: PLAN }} />{tr('Өссөн төлөвлөгөө')}<b className="num">{pt.planned > 0 ? mntShort(pt.planned) : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: ACT }} />{tr('Өссөн олгосон')}<b className="num">{pt.givenCum > 0 ? mntShort(pt.givenCum) : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: PHYS }} />{tr('Биет гүйцэтгэл')}<b className="num">{pt.physPct > 0 ? `${pt.physPct.toFixed(1)}%` : '—'}</b></p>
          <p className={`${f.tipRow} ${f.tipGap}`}><i style={{ background: PLAN }} />{tr('Санхүүжилтийн явц')}<b className="num">{pt.planned > 0 ? `${((pt.givenCum / pt.planned) * 100).toFixed(0)}%` : '—'}</b></p>
        </div>
      )}
    </div>
  );
}

/** Catmull-Rom → куб Безье гөлгөрүүлэлт — S-муруй жигд, эвдрэлгүй харагдана */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ═══════════════════════════════════════════════════════════
//  ДАТА
// ═══════════════════════════════════════════════════════════

/**
 * Санхүүжилтийн бүх дата — CASHFLOW2 (төлөвлөгөө) + IPC (олгосон, цэвэрлэсэн) +
 * TASK_SHEET (биет гүйцэтгэл, сарын эцсийн байдлаар).
 * ⚠️ export — «Барилгын цогц хяналт» (Tsogts) мөн энэ ГАНЦ ачаалагчийг ашиглана.
 */
export async function loadFinData(): Promise<FinData> {
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
      const k = bagtsKey(r[F.pkg]);
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
    const physCnt: PhysMap = new Map(); // багц·сар → блокийн тоо (жин)
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
        const cntMon = new Map<string, number>();
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
          if (cnt > 0) { byMon.set(m.label, (sum / cnt) * 100); cntMon.set(m.label, cnt); }
        });
        phys.set(k, byMon);
        physCnt.set(k, cntMon);
      });
    }

  return { contracts, given, phys, physCnt };
}

/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛ — ГРАФИКГҮЙ, зөвхөн ХОЁР ХҮСНЭГТ (хэрэглэгчийн хүсэлт,
 * 2026-08-14): Cashflow (гэрээ/захирамжийн санхүүжилт /106) ба IPC (олгосон
 * акт /107). Хуучин комбо графикууд (ComboChart) энэ харагдацаас ХАСАГДСАН —
 * ComboChart нь «Багцын хяналт» (Tsogts)-д ХЭВЭЭР ашиглагдана.
 */
/** Үйлчилгээний талбарын тодорхойлолт — нэр, харагдах alias, төрөл */
type FieldDef = { name: string; alias: string; type: string };
type FinTables = {
  cashflow: Row[]; ipc: Row[];
  cfFields: FieldDef[]; ipcFields: FieldDef[];
};

/** Давхаргын талбарын метадата (`?f=json`) — alias нь хүний уншихуйц баганын нэр */
async function loadFields(url: string): Promise<FieldDef[]> {
  try {
    const res = await fetch(`${url}?f=json`);
    const j = await res.json();
    return Array.isArray(j?.fields)
      ? j.fields.map((x: { name: string; alias?: string; type: string }) => ({
          name: x.name, alias: x.alias || x.name, type: x.type,
        }))
      : [];
  } catch {
    return [];
  }
}

async function loadFinRegister(): Promise<FinTables> {
  const [cfFields, ipcFields, cashflow, ipc] = await Promise.all([
    loadFields(CASHFLOW2.url),
    loadFields(IPC_LOG.url),
    queryFeatures(CASHFLOW2.url, { outFields: ['*'], orderBy: `${CASHFLOW2.oid} ASC` }),
    queryFeatures(IPC_LOG.url, { outFields: ['*'] }),
  ]);
  return { cashflow, ipc, cfFields, ipcFields };
}

export function Finance() {
  const q = useAsync<FinTables>(loadFinRegister, []);

  return (
    <div className={f.frame}>
      <Data q={q} loading={tr('Санхүүжилтийн бүртгэл…')}>
        {(d) => <FinTablesView d={d} />}
      </Data>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ХАРАГДАЦ — мөр (гэрээ/багц) бүрд ТУСДАА график
// ═══════════════════════════════════════════════════════════

/** Гэрээний мөрөөс сарын цэгүүд — ЯГ датаных нь дагуу + IPC олгосон + биет гүйцэтгэл */
export function contractMonths(r: Row, given: GivenMap, phys: PhysMap): MonthPt[] {
  const C = CASHFLOW2.fields;
  // ⚠️ `pkgKeyOf` (bagtsKey БИШ): «БАГЦ 1-4» мэт диапазон мөр нь bagtsKey-ээр
  //    «БАГЦ14» болж, бодит «Багц 14»-ийн олголт/биет гүйцэтгэлийг өөрийн болгон
  //    зурдаг байв. Диапазон мөр одоо хоосон түлхүүртэй — юутай ч таарахгүй.
  const byMon = given.get(pkgKeyOf(r[C.pkg2])) ?? given.get(pkgKeyOf(r[C.pkg]));
  const ph = phys.get(pkgKeyOf(r[C.pkg2])) ?? phys.get(pkgKeyOf(r[C.pkg]));
  return CASHFLOW2.months.map((m) => ({
    label: m.label,
    amount: n(r[m.amount]),
    amountCum: n(r[m.amountCum]),
    cumPct: pctVal(r[m.pctCum]),
    given: byMon?.get(m.label) ?? 0,
    phys: ph?.get(m.label) ?? 0,
  }));
}

/**
 * ХОЦРОГДЛЫН ШАЛГАЛТ — гүйцэтгэлийн ХУВИЙГ жишнэ (дүн биш):
 * сүүлийн биет дататай сар дээр «төлөвлөсөн өссөн хувь (CF)» − «бодит биет %».
 * Хоёул бөглөгдсөн үед л утга буцаана — өрөөсгөл дататай харьцуулалт хийхгүй.
 */
export function lagOf(months: MonthPt[]): { month: string; planned: number; actual: number; gap: number } | null {
  const nowYm = new Date().toISOString().slice(0, 7);
  let mi = -1;
  months.forEach((m, i) => {
    if (m.label <= nowYm && m.phys > 0) mi = i;
  });
  if (mi < 0) return null;
  // Төлөвлөгөө: тухайн сар хүртэлх сүүлийн бөглөгдсөн өссөн хувь
  let planned = 0;
  for (let i = 0; i <= mi; i++) if (months[i].cumPct > 0) planned = months[i].cumPct;
  if (planned <= 0) return null;
  const actual = months[mi].phys;
  return { month: months[mi].label, planned, actual, gap: planned - actual };
}

/** Хоцрогдлын зэрэглэл: ≥10% улаан, 5–10% шар, бусад нь alert биш */
export const lagLevel = (gap: number): 'red' | 'yellow' | null =>
  gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null;

/* ═══════════════════════════════════════════════════════════
   САНХҮҮЖИЛТ — ХОЁР БҮРЭН ХҮСНЭГТ (Cashflow · IPC), ГРАФИКГҮЙ
   ⚠️ Багана/мөрийг ҮЙЛЧИЛГЭЭ ЯГ БАЙГААГААР нь харуулна: багана нь давхаргын
   талбар БҮР (alias-аар нэрлэсэн, эх дараалалд), мөр нь БҮХ мөр (шүүлтгүй).
   ═══════════════════════════════════════════════════════════ */

const NUMERIC_TYPES = new Set([
  'esriFieldTypeDouble', 'esriFieldTypeInteger', 'esriFieldTypeSingle',
  'esriFieldTypeSmallInteger', 'esriFieldTypeBigInteger', 'esriFieldTypeOID',
]);

/** Нүдний утгыг талбарын ТӨРЛӨӨР нь форматлана — үйлчилгээ дэх утгыг гажуудуулахгүй */
function fmtCell(v: unknown, type: string): { text: string; num: boolean } {
  if (v == null || v === '') return { text: '', num: false };
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    return { text: Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10), num: true };
  }
  if (NUMERIC_TYPES.has(type)) {
    const x = Number(v);
    if (!Number.isFinite(x)) return { text: String(v), num: true };
    // ⚠️ Бутархайг ч `num()`-оор — мянгатын таслал ба модулийн локал хадгална
    //    (өмнө нь `String(x)` бүлэглэлгүй, экспонент хэлбэрт ордог байв).
    const dec = Math.min(4, String(x).split('.')[1]?.length ?? 0);
    return { text: num(x, dec), num: true };
  }
  return { text: text(v), num: false };
}

/** Үйлчилгээний БҮРЭН хүснэгт — талбар бүр багана (alias), мөр бүр яг байгаагаар */
function FullTable({
  title, subtitle, rows, fields,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  fields: FieldDef[];
}) {
  // Багана нь талбарын метадатагийн дараалалд; ирээгүй бол эхний мөрийн түлхүүрээс.
  // ⚠️ GlobalID баганыг ХАСНА (хэрэглэгчийн хүсэлт — утгагүй UUID).
  const isSkip = (name: string, type: string) =>
    type === 'esriFieldTypeGlobalID' || /globalid/i.test(name);
  const cols: FieldDef[] = (
    fields.length
      ? fields
      : rows[0]
        ? Object.keys(rows[0]).map((k) => ({ name: k, alias: k, type: 'esriFieldTypeString' }))
        : []
  ).filter((c) => !isSkip(c.name, c.type));
  return (
    <section className={f.reg}>
      <header className={f.regHd}>
        <h2>{title}</h2>
        {/* envhub: бүх тоо «num» (tabular) — мөр·баганын тоолол */}
        <span className="num">{subtitle}</span>
      </header>
      {rows.length === 0 || cols.length === 0 ? (
        <Empty label={tr('Мөр алга.')} />
      ) : (
        <div className={f.tblWrap}>
          <table className={f.tbl}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.name} title={c.name}>{finFieldLabel(c.name)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => {
                    const cell = fmtCell(r[c.name], c.type);
                    return (
                      // envhub: тоон нүд бүр глобал «num» (tabular) + баруун зэрэгцүүлэлт
                      <td key={c.name} className={cell.num ? `num ${f.cellNum}` : undefined}>{cell.text}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Санхүүжилт — Cashflow ба IPC-ийн БҮРЭН хүснэгт (график огт байхгүй) */
function FinTablesView({ d }: { d: FinTables }) {
  return (
    <>
      <header className={f.pageHd}>
        <div>
          <h2>{tr('Санхүүжилтийн бүртгэл — Cashflow ба IPC')}</h2>
          <p>
            {tr('Эх үйлчилгээний бүрэн хүснэгт — багана бүр (талбарын нэр), мөр бүр яг байгаагаар. Огноо ба тоон утгыг талбарын төрлөөр форматлав.')}
          </p>
        </div>
      </header>

      <FullTable
        title={tr('Cashflow — гэрээ, захирамжийн санхүүжилт (/106)')}
        subtitle={tr('{0} мөр · {1} багана', num(d.cashflow.length), d.cfFields.length)}
        rows={d.cashflow}
        fields={d.cfFields}
      />

      <FullTable
        title={tr('IPC — олгосон акт (/107)')}
        subtitle={tr('{0} мөр · {1} багана', num(d.ipc.length), d.ipcFields.length)}
        rows={d.ipc}
        fields={d.ipcFields}
      />
    </>
  );
}

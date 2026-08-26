'use client';

import { useState, type MouseEvent } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Data, Empty } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { cached } from '@/lib/live';
import { CASHFLOW2, IPC_LOG, TASK_SHEET, bagtsKey, blockKey, pkgKeyOf } from '@/lib/services';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import { mntShort, num, text, cat } from '@/lib/format';
import { ResizableTable } from '@/components/ResizableTable';
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
export type FinData = {
  contracts: Row[];
  given: GivenMap;
  phys: PhysMap;
  physCnt: PhysMap;
  /**
   * ГҮЙЦЭТГЭЛИЙН АКТУУД (IPC) — түүхий мөрүүд.
   *
   * ⚠️ `given` нь актуудыг сар бүрийн НИЙЛБЭР болгож хураадаг тул
   *    акт бүрийн дугаар, хамрах хугацаа, барьцаа, үлдэгдэл алдагддаг.
   *    Санхүүгийн дэлгэрэнгүйд «энэ мөнгө ЯМАР актаар олгогдсон бэ»
   *    гэдэг нь гол мөрдөх мөр тул түүхий мөрийг ХАДГАЛНА.
   */
  acts: Row[];
};

// ═══════════════════════════════════════════════════════════
//  КОМБО ГРАФИК (envhub хэлээр) — градиентгүй, glow-гүй хавтгай дүрслэл.
//  ГУРВАН шугам давхацна: төлөвлөгөө (PLAN) · олгосон санхүүжилт (ACT —
//  нарийн, цэгтэй; 2026-08-21-нд багана байсныг шугам болгов) · биет (PHYS).
//  X тэнхлэгт он сар + өссөн хувиуд цуваа өөрийн слотын өнгөөр.
// ═══════════════════════════════════════════════════════════

export function ComboChart({
  items,
  height = 280,
  lagMonth,
  lagLvl,
  hidePhys = false,
}: {
  items: MonthPt[];
  height?: number;
  /** Хоцрогдол хэмжсэн сар — тэр сарын БИЕТ багана анивчина */
  lagMonth?: string;
  lagLvl?: 'red' | 'yellow' | null;
  /**
   * БИЕТ гүйцэтгэлийн цуваа, шошго, тултипын мөрийг НУУНА.
   *
   * ⚠️ 2026-08-21: «Багцын санхүү» харагдац нь ЗӨВХӨН мөнгөний асуултад
   * хариулна — биет явц нь «Багцын гүйцэтгэл» талд. Цувааг нууснаар график
   * төлөвлөгөө/олголтын хоёр шугам болж, уншихад ойлгомжтой болно.
   */
  hidePhys?: boolean;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const N = items.length;

  // ── Өссөн S-муруйн өгөгдөл — ₮ ТЭНХЛЭГ (нэг тэнхлэг): төлөвлөгөө · санхүүжилт · биет.
  //    Мөнгө нь ₮-ээр (хуучинтай адил утга); биет нь ₮ өндөртэй ч %-аар шошголно. ──
  const totalPlan = Math.max(1, ...items.map((i) => i.amountCum));
  const yMax = totalPlan;
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
  // Нуусан үед сүүлийн биет цэгийг -1 болгоно — доорх бүх зурах нөхцөл унтарна
  if (hidePhys) lastPhys = -1;

  /*
   * ── ХЭМЖЭЭ ─────────────────────────────────────────────────────────────
   * ⚠️ Тоон шошгыг ЦЭГ БҮР дээр бичихээ БОЛИВ (2026-08-25). 12 сар × 3 цуваа =
   *    36 шошго нь муруйг бүрхэж, хоорондоо мөргөлдөж, графикийг «тоонуудын
   *    хана» болгодог байв. Одоо: ЗӨВХӨН сүүлийн цэг тогтмол бичигдэнэ, бусад
   *    нь hover дээр tooltip-д гарна. Муруй өөрөө үлдэнэ — график нь ЧИГ
   *    ХАНДЛАГЫГ хэлэх ёстой, задаргааг tooltip хэлнэ.
   */
  const W = 1600;
  const H = height;
  const padL = 8;   // зүүн — Y шошго торны ДЭЭР суудаг тул зай бага
  const padR = 30;  // баруун — сүүлийн шошгыг багтаах зай
  const padT = 26;
  const padB = 30;  // доор — ЗӨВХӨН он сар (хувиуд tooltip руу шилжсэн)

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

  /* Сүүлийн УТГАТАЙ цэгүүд — тэдгээр дээр л шошго, том цэг үлдэнэ */
  const lastPlan = rows.reduce((a, r, i) => (r.planned > 0 ? i : a), -1);
  const lastGiven = rows.reduce((a, r, i) => (r.givenCum > 0 ? i : a), -1);

  /* Цэгүүдийг нэг л удаа бодно — зам, талбай, шошго бүгд эндээс */
  const planPts = rows.slice(0, lastPlan + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.planned) }));
  const givenPts = rows.slice(0, lastGiven + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.givenCum) }));
  const physPts = rows.slice(0, lastPhys + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.physical) }));

  /*
   * ── ЗӨРҮҮГИЙН ТАЛБАЙ ──────────────────────────────────────────────────
   * ⚠️ Энэ графикийн ГОЛ өгүүлэмж нь «төлөвлөгөө ба бодит олголтын хооронд
   *    хэдий хэмжээний зай байна вэ» — хоёр шугам ойрхон явахад тэр зай нүдэнд
   *    ОГТ баригддаггүй байв. Хооронд нь будсанаар зөрүү нь ХЭМЖЭЭ болж
   *    харагдана: талбай өргөсөх тусам хоцрогдол их.
   */
  const gapArea = givenPts.length > 1
    ? smoothPath(planPts.slice(0, givenPts.length))
      + ' L ' + [...givenPts].reverse().map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' L ')
      + ' Z'
    : '';

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHi(Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width) * (N - 1)))));
  };
  const pt = hi != null ? rows[hi] : null;

  /*
   * Шошгын нягт — САР БҮР бичигдэнэ. 18-аас олон сартай үед л сөөлжинө:
   * 1600 өргөнтэй виртуал зурагт 18 хүртэлх шошго зайтай багтана.
   */
  const step = Math.max(1, Math.ceil(N / 18));
  const showLabel = (i: number) => i === 0 || i === N - 1 || i % step === 0;
  const anchorFor = (i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');

  return (
    <div className={f.chartWrap} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg
        className={f.comboSvg}
        style={{ height: H }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={tr('Санхүүжилтийн явц: төлөвлөсөн, олгосон, биет гүйцэтгэл')}
      >
        {/* ── ТОР ба Y тэнхлэг ──
            ⚠️ Шошго нь торны ДЭЭР, зүүн ирмэгт наалдаж суусан: тусдаа багана
            эзлүүлбэл 76px алдагдаж, муруйн талбай нарийсдаг байв. Мөн 5 биш
            4 шугам — нягт тор нь өгөгдлөөс илүү анхаарал татдаг. */}
        {[0, 1 / 3, 2 / 3, 1].map((t) => {
          const gy = yFor(t * yMax);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={f.curveGrid} />
              <text x={padL} y={gy - 5} className={f.sAxisY} textAnchor="start">
                {t === 0 ? '0' : mntShort(t * yMax).replace(' ₮', '')}
              </text>
            </g>
          );
        })}

        {/* ЗӨРҮҮГИЙН ТАЛБАЙ — төлөвлөгөө ба олголтын хоорондох зай */}
        {gapArea && <path d={gapArea} className={f.gapArea} style={{ fill: PLAN }} />}

        {/* ХОЦРОГДСОН САР — тасархай босоо шугам + лугшдаг цэг */}
        {lagMonth != null && lagLvl != null && (() => {
          const li = rows.findIndex((r) => r.label === lagMonth);
          if (li < 0) return null;
          const color = lagLvl === 'red' ? 'var(--bad)' : 'var(--warn)';
          const cx = xFor(li);
          return (
            <g>
              <line
                x1={cx} x2={cx} y1={padT} y2={padT + plotH}
                stroke={color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.45}
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

        {/* ── МУРУЙНУУД ──
            Төлөвлөгөө нь ЛАВЛАГАА тул нимгэн, тасархай; бодит олголт нь ГОЛ
            хариулт тул зузаан, бүтэн. Урьд нь хоёулаа ижил зузаантай байсан
            тул аль нь баримт, аль нь зорилт болох нь ялгардаггүй байв. */}
        {planPts.length > 1 && (
          <path d={smoothPath(planPts)} className={f.planLine} style={{ stroke: PLAN }} vectorEffect="non-scaling-stroke" />
        )}
        {givenPts.length > 1 && (
          <path d={smoothPath(givenPts)} className={f.actLine} style={{ stroke: ACT }} vectorEffect="non-scaling-stroke" />
        )}
        {physPts.length > 1 && (
          <path d={smoothPath(physPts)} className={f.physLine} style={{ stroke: PHYS }} vectorEffect="non-scaling-stroke" />
        )}

        {/* ── ЦЭГ БҮР ДЭЭР УТГА ──
            ⚠️ Зөвхөн эцсийн утга үзүүлэх нь БУРУУ байв: 12 сарын урт графикийг
               гаргаад ганц тоо уншуулах юм бол график хэрэггүй. Сар бүрийн
               утга нүдэнд харагдах ёстой.
            ⚠️ Мөргөлдөхөөс сэргийлэх дүрэм: төлөвлөгөө нь муруйнхаа ДЭЭР,
               олголт нь ДООР бичигдэнэ — хоёр цуваа ойртсон ч давхцахгүй.
               Биет нь олголттой ойрхон явдаг тул мөн доор, илүү зайтай. */}
        {rows.map((r, i) => {
          if (i > lastPlan || r.planned <= 0 || !showLabel(i)) return null;
          const x = xFor(i);
          const y = yFor(r.planned);
          return (
            <g key={`pl-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: PLAN }} vectorEffect="non-scaling-stroke" />
              {/* ⚠️ y-г 12-оос дээш барина: дээд ирмэгт хүрсэн цэгийн шошго
                  SVG-ийн гаднаас тасарч, тоо хагас харагддаг байв. */}
              <text x={x} y={Math.max(12, y - 9)} className={f.ptVal} style={{ fill: PLAN }} textAnchor={anchorFor(i)}>
                {mntShort(r.planned).replace(' ₮', '')}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          if (i > lastGiven || r.givenCum <= 0 || !showLabel(i)) return null;
          const x = xFor(i);
          const y = yFor(r.givenCum);
          return (
            <g key={`gv-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: ACT }} vectorEffect="non-scaling-stroke" />
              <text x={x} y={Math.min(padT + plotH - 4, y + 16)} className={f.ptVal} style={{ fill: ACT }} textAnchor={anchorFor(i)}>
                {mntShort(r.givenCum).replace(' ₮', '')}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          if (i > lastPhys || r.physPct <= 0 || !showLabel(i)) return null;
          const x = xFor(i);
          const y = yFor(r.physical);
          return (
            <g key={`ph-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: PHYS }} vectorEffect="non-scaling-stroke" />
              <text x={x} y={Math.min(padT + plotH - 4, y + 28)} className={f.ptVal} style={{ fill: PHYS }} textAnchor={anchorFor(i)}>
                {r.physPct.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* ── HOVER — босоо шугам + цуваа бүрийн цэг ── */}
        {hi != null && (
          <g>
            <line x1={xFor(hi)} x2={xFor(hi)} y1={padT} y2={padT + plotH} className={f.curveCursor} />
            {rows[hi].planned > 0 && hi <= lastPlan && (
              <circle cx={xFor(hi)} cy={yFor(rows[hi].planned)} r={4} className={f.sDot} style={{ fill: PLAN }} vectorEffect="non-scaling-stroke" />
            )}
            {hi <= lastGiven && (
              <circle cx={xFor(hi)} cy={yFor(rows[hi].givenCum)} r={4} className={f.sDot} style={{ fill: ACT }} vectorEffect="non-scaling-stroke" />
            )}
            {hi <= lastPhys && rows[hi].physPct > 0 && (
              <circle cx={xFor(hi)} cy={yFor(rows[hi].physical)} r={4} className={f.sDot} style={{ fill: PHYS }} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        )}

        {/* ── X тэнхлэг — ЗӨВХӨН он сар. Хоёр хувийн мөр tooltip руу шилжсэн:
            тэдгээр нь харьцуулах биш, лавлах тоо тул байнга харагдах шаардлагагүй
            бөгөөд график доор гурван мөр эзэлж, муруйд өгөх зайг иддэг байв. */}
        {rows.map((r, i) => (showLabel(i) ? (
          <text key={r.label} x={xFor(i)} y={H - 10} className={f.axisX} textAnchor={anchorFor(i)}>
            {r.label}
          </text>
        ) : null))}
      </svg>

      {/* ── TOOLTIP — задаргаа бүхэлдээ энд ── */}
      {pt && (
        <div
          className={f.tip}
          style={{ left: `${(hi! / Math.max(1, N - 1)) * 100}%`, transform: `translateX(${hi! < N / 2 ? '10px' : 'calc(-100% - 10px)'})` }}
        >
          <p className={`num ${f.tipHd}`}>{pt.label}</p>
          <p className={f.tipRow}><i style={{ background: PLAN }} />{tr('Төлөвлөсөн санхүүжилт')}<b className="num">{pt.planned > 0 ? mntShort(pt.planned) : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: ACT }} />{tr('Олгосон санхүүжилт')}<b className="num">{pt.givenCum > 0 ? mntShort(pt.givenCum) : '—'}</b></p>
          {!hidePhys && <p className={f.tipRow}><i style={{ background: PHYS }} />{tr('Биет гүйцэтгэл')}<b className="num">{pt.physPct > 0 ? `${pt.physPct.toFixed(1)}%` : '—'}</b></p>}
          <p className={`${f.tipRow} ${f.tipGap}`}>
            {tr('Төлөвлөгөөний биелэлт')}
            <b className="num">{pt.it.cumPct > 0 ? `${pt.it.cumPct.toFixed(1)}%` : '—'}</b>
          </p>
          <p className={f.tipRow}>
            {tr('Олгосон хувь')}
            <b className="num">{pt.planned > 0 ? `${((pt.givenCum / pt.planned) * 100).toFixed(0)}%` : '—'}</b>
          </p>
          {/* ЗӨРҮҮ — графикийн будсан талбайн тоон илэрхийлэл */}
          <p className={f.tipRow}>
            {tr('Олгогдоогүй үлдэгдэл')}
            <b className="num">{pt.planned > pt.givenCum ? mntShort(pt.planned - pt.givenCum) : '—'}</b>
          </p>
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
 * ⚠️ 5 мин кэш (2026-08-21 гүйцэтгэлийн аудит): Нүүр (супер) · Tsogts · Санхүү
 *   гурвуулаа дууддаг тул харагдац сэлгэх бүрд 3 query + O(багц×сар×блок)
 *   тооцоо ДАХИН хийгддэг байв.
 */
export const loadFinData = cached(loadFinDataRaw, 5 * 60_000);

/**
 * CASHFLOW2/IPC_LOG-ийн түүхий мөрүүд — НЭГ кэштэй эх (2026-08-24 аудит):
 * урьд нь `loadFinDataRaw` ба `loadFinRegister` ижил хоёр хүснэгтийг тус
 * тусдаа '*'-аар татдаг тул Нүүр (ExecKpi) · Tsogts · Санхүү гурвыг дараалан
 * нээхэд CASHFLOW2/IPC_LOG давхар татагдаж, 6 слотын хязгаарлагчийг дэмий
 * эзэлдэг байв. ⚠️ `outFields: '*'` ХЭВЭЭР — Санхүүгийн бүртгэл (FullTable)
 * үйлчилгээний талбар БҮРИЙГ баганаар харуулдаг тул нарийсгаж болохгүй.
 */
const loadCashflowRows = cached(
  () => queryFeatures(CASHFLOW2.url, { outFields: ['*'], orderBy: `${CASHFLOW2.oid} ASC` }),
  5 * 60_000,
);
const loadIpcRows = cached(
  () => queryFeatures(IPC_LOG.url, { outFields: ['*'] }),
  5 * 60_000,
);

async function loadFinDataRaw(): Promise<FinData> {
  const S = TASK_SHEET.fields;
    const [contracts, ipc, sheet] = await Promise.all([
      loadCashflowRows(),
      loadIpcRows(),
      // «Гүйцэтгэл бөглөх» — блок бүрийн НИЙТ гүйцэтгэлийн мөр (Б.), append-лог
      queryFeatures(TASK_SHEET.url, {
        // ⚠️ Блокгүй мөр аль ч блокт хамаарахгүй — blockProgress.ts-тэй ижил шүүлт
        where: `${S.no}='${TASK_SHEET.constructionNo}' AND ${S.block} IS NOT NULL`,
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
      const byPkg = new Map<string, Map<string, { d: string; g: number | null }[]>>();
      sheet.forEach((r) => {
        const k = bagtsKey(r[S.bagts]);
        const d = String(r[S.date] ?? '').slice(0, 10);
        /**
         * ⚠️ `blockKey` (2026-08-24 аудит) — түүхий нэрээр бүлэглэхэд «5/1
         * барилга» ба «5/1 блок» ХОЁР өөр блок болж, хуучирсан 12-р сарын
         * өндөр утга давхар тоологдон Багц 4.1-ийн биет % 29.8 гарч байв
         * (blockProgress-ийн зөв дундаж 21.6) — нэг мөрөнд хоёр өөр тоо.
         */
        const b = blockKey(r[S.block]);
        if (!k || !d || !b) return;
        const blocks = byPkg.get(k) ?? new Map<string, { d: string; g: number | null }[]>();
        const arr = blocks.get(b) ?? [];
        // null = нүд цэвэрлэгдсэн/бөглөгдөөгүй — 0 гэж тоолбол дундаж худал буурна
        arr.push({ d, g: r[S.progress] == null ? null : n(r[S.progress]) });
        blocks.set(b, arr);
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
            let best: { d: string; g: number | null } | null = null;
            arr.forEach((e) => {
              if (e.d.slice(0, 7) <= m.label && (!best || e.d > best.d)) best = e;
            });
            // Сүүлийн бичилт нь null бол блок «мэдээлэлгүй» — дунджид ОРУУЛАХГҮЙ
            // (blockProgress.compute-ийн дүрэмтэй ижил: 0% гэж будвал худал мэдээлэл)
            const g = (best as { d: string; g: number | null } | null)?.g;
            if (g != null) {
              sum += g;
              cnt++;
            }
          });
          if (cnt > 0) { byMon.set(m.label, (sum / cnt) * 100); cntMon.set(m.label, cnt); }
        });
        phys.set(k, byMon);
        physCnt.set(k, cntMon);
      });
    }
    return { contracts, given, phys, physCnt, acts: ipc };
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

/**
 * ⚠️ 5 мин кэш (2026-08-24 аудит) — урьд нь Санхүү харагдац mount болох бүрд
 * 4 хүсэлт (метадата ×2 + бүтэн хүснэгт ×2) кэшгүй дахин явдаг байв; мөрүүд нь
 * одоо `loadCashflowRows`/`loadIpcRows`-оор `loadFinData`-тай хуваалцагдана.
 */
const loadFinRegister = cached(loadFinRegisterRaw, 5 * 60_000);

async function loadFinRegisterRaw(): Promise<FinTables> {
  const [cfFields, ipcFields, cashflow, ipc] = await Promise.all([
    loadFields(CASHFLOW2.url),
    loadFields(IPC_LOG.url),
    loadCashflowRows(),
    loadIpcRows(),
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

/**
 * САНХҮҮЖИЛТИЙН ХОЦРОГДОЛ — ТӨЛӨВЛӨГӨӨТ ХУВААРЬ vs БОДИТ ОЛГОЛТ.
 *
 * ⚠️ `lagOf` нь БИЕТ гүйцэтгэлийн хоцрогдлыг хэмждэг — өөр асуулт.
 *    Энэ нь: «төлөвлөгөөгөөр авах ёстой байсан хугацаа өнгөрсөн атлаа
 *    аваагүй» тохиолдлыг барина. Гүйцэтгэгч ажлаа хийсэн ч мөнгө нь
 *    хугацаандаа гараагүй бол энэ нь САНХҮҮГИЙН асуудал бөгөөд биет
 *    явцын хоцрогдлоос ТУСДАА мөрдөгдөх ёстой.
 *
 * ⚠️ ЗӨВХӨН ӨНГӨРСӨН сарууд. Ирээдүйн төлөвлөгөө «аваагүй» гэж
 *    тооцогдвол бүх багц улаан болно — хугацаа нь болоогүй мөнгө
 *    хоцрогдол БИШ.
 */
export function finLagOf(months: MonthPt[]): {
  /** Хугацаа нь өнгөрсөн сүүлийн төлөвлөгөөт сар */
  month: string;
  /** Тэр хүртэл авах ЁСТОЙ байсан өссөн дүн ₮ */
  planned: number;
  /** Бодитоор олгогдсон өссөн дүн ₮ */
  given: number;
  /** Дутуу олгогдсон ₮ (planned − given) */
  gap: number;
  /** Дутуугийн ХУВЬ — зэрэглэл үүгээр тогтоно */
  pct: number;
  /** Хугацаа нь өнгөрсөн ч дүн нь бүрэн ороогүй сарын тоо */
  lateMonths: number;
  /**
   * ОЛГОЛТЫН БҮРТГЭЛ ОГТ АЛГА (IPC акт нэг ч байхгүй).
   *
   * ⚠️ 2026-08-25-нд амьд өгөгдлөөр шалгахад: 65 багцын 41 нь «хоцорсон»
   *    гэж тэмдэглэгдэж байсны 34 нь ЭНЭ ангилалд байв — 84 актын 63 нь
   *    дүнгүй. Ийм мөрийг улаанаар тэмдэглэвэл «мөнгө хоцорсон» гэсэн ХУДАЛ
   *    дүгнэлт гарна: бид «төлөгдөөгүй» ба «бүртгэгдээгүй» хоёрыг ялгаж
   *    чадахгүй. Тиймээс тусад нь, ӨӨР хэлээр хэлнэ.
   */
  noRecord: boolean;
} | null {
  const nowYm = new Date().toISOString().slice(0, 7);
  let planned = 0;
  let given = 0;
  let month = "";
  let lateMonths = 0;
  let runPlan = 0;
  let runGiven = 0;
  for (const m of months) {
    if (m.label > nowYm) break;      // ирээдүй — хугацаа нь болоогүй
    runPlan += m.amount;
    runGiven += m.given;
    if (m.amount > 0) {
      month = m.label;
      planned = runPlan;
      given = runGiven;
      // Тэр сар хүртэлх ХУРИМТЛАЛААР дутуу байвал «хоцорсон сар»
      if (runGiven + 1 < runPlan) lateMonths += 1;
    }
  }
  if (planned <= 0) return null;
  const gap = planned - given;
  if (gap <= 0) return null;         // хугацаандаа, эсвэл илүү олгогдсон
  const noRecord = months.every((m) => m.given === 0);
  return { month, planned, given, gap, pct: (gap / planned) * 100, lateMonths, noRecord };
}

/**
 * Санхүүжилтийн хоцрогдлын зэрэглэл.
 *
 * ⚠️ ЗӨВХӨН хувиар БИШ, ДҮНГЭЭР ч шалгана: 500 сая төлөвлөснөөс 100 сая
 *    дутуу (20%) нь 200 тэрбумаас 20 тэрбум дутуутай (10%) ижил зэрэг
 *    БИШ. Аль нэг нь босго давбал улаан.
 */
export const finLagLevel = (
  pct: number,
  gap: number,
  noRecord = false,
): 'red' | 'yellow' | null => {
  /*
   * ⚠️ БҮРТГЭЛГҮЙ багц ХЭЗЭЭ Ч улаан болохгүй. «Олгоогүй» ба «бүртгээгүй»
   *    хоёрын аль нь болохыг өгөгдлөөс мэдэх БОЛОМЖГҮЙ тул хамгийн хүнд
   *    дүгнэлтийг сонгож болохгүй — тэр нь гүйцэтгэгчийг үндэслэлгүйгээр
   *    буруутгана. Дэлгэц дээр тэдгээр нь «бүртгэл алга» гэж тусдаа гарна.
   */
  if (noRecord) return null;
  if (pct >= 30 || gap >= 10_000_000_000) return 'red';
  if (pct >= 10 || gap >= 1_000_000_000) return 'yellow';
  return null;
};

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
          {/* ⚠️ Түлхүүр нь ГАРЧГААС — энэ бүрэлдэхүүн хуудсанд хэд хэдэн
              удаа зурагддаг тул тогтмол түлхүүр өгвөл хүснэгтүүд нэг
              хадгалалтыг булаацалдаж, өргөн нь хоорондоо холилдоно. */}
          <ResizableTable
            storeKey={`finance.${title.replace(/\s+/g, "-").toLowerCase()}`}
            className={f.tbl}
          >
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
          </ResizableTable>
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

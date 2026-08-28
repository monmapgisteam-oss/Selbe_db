'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Data, Empty } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { cached } from '@/lib/live';

/**
 * ӨДӨР ТУТАМ ЗАСАГДДАГ хүснэгтийн кэшийн хугацаа.
 *
 * ⚠️ 5 минут байсныг 1 минут болгов (2026-08-28). Хоёр өөр эрсдэл бий:
 *   · ӨӨРИЙН засвар — `invalidate()` шууд харуулна, TTL хамаагүй.
 *   · ӨӨР ХЭРЭГЛЭГЧИЙН засвар — зөвхөн TTL л барина. IPC/CASHFLOW нь өдөр
 *     бүр олон хүн засдаг тул 5 минут нь хоёр хүн ЗӨРСӨН тоо хараад маргах
 *     хангалттай урт хугацаа.
 *
 * ⚠️ Илүү богиносговол ашиг бага, зардал их: хүснэгт бүтнээрээ (257 талбар)
 * татагддаг тул минутанд нэгээс олон удаа татах нь сүлжээг дэмий эзэлнэ.
 */
const LIVE_TTL = 60_000;
import { loadBlockHistory } from '@/lib/blockProgress';
import { CASHFLOW2, IPC_LOG, TASK_SHEET, bagtsKey, blockKey, pkgKeyOf } from '@/lib/services';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import { mntShort, num, text, cat } from '@/lib/format';
import { ResizableTable } from '@/components/ResizableTable';
import { applyAll } from '@/lib/tableWrite';
import { invalidate, type DataKey } from '@/lib/dataBus';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
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
  /**
   * Сарын эцсийн байдлаарх БИЕТ гүйцэтгэл, % («Гүйцэтгэл бөглөх»).
   *
   * ⚠️ `null` = ТУХАЙН САРД ДАТА АЛГА. Энэ нь 0%-ЭЭС ЯЛГААТАЙ: 0% гэдэг нь
   *    «ажил эхлээгүй» гэсэн ХЭМЖИЛТ, null нь «хэмжигдээгүй» гэсэн үг.
   *    Урьд нь хоёуланг нь 0 гэж нэгтгэдэг байсан тул бөглөгдөөгүй багцын
   *    график дээр «Бодит гүйцэтгэл» ба «Зөрүү» шугам ОГТ зурагдахгүй,
   *    гэхдээ тайлбар нь тэдгээрийг амлаад зогсдог байв — хэрэглэгч
   *    графикийг эвдэрсэн гэж үздэг (2026-08-27).
   */
  phys: number | null;
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
      // ⚠️ Дата алга (null) бол 0 өндөртэй цэг зурвал «биет гүйцэтгэл тэг»
      //    гэсэн ХУДАЛ уншилт өгнө — доорх `lastPhys` нь ийм саруудыг алгасна.
      physical: ((it.phys ?? 0) / 100) * totalPlan, // биет гүйцэтгэлийн үнэ цэнэ ₮
      physPct: it.phys, // шошго/тултипт харуулах биет % (null = хэмжигдээгүй)
      givenCum: gsum,
      it,
    };
  });
  // Бодит муруйнууд (санхүүжилт, биет) зөвхөн ОДОО хүртэл; төлөвлөгөө л дуустал хүрнэ
  let lastPhys = -1;
  // ⚠️ `> 0` БИШ `!= null`: жинхэнэ 0% (ажил эхлээгүй) нь ХЭМЖИЛТ мөн тул
  //    муруй түүнээс эхлэх ёстой. Урьд нь эхний бодит тэгүүд таслагдаж,
  //    муруй хожуу сараас эхэлдэг байв.
  rows.forEach((r, i) => { if (r.physPct != null) lastPhys = i; });
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
              {rows[li].physPct != null && (
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
          // ⚠️ `== null` (`<= 0` БИШ): 0% нь бодит хэмжилт тул шошготой байна
          if (i > lastPhys || r.physPct == null || !showLabel(i)) return null;
          const x = xFor(i);
          const y = yFor(r.physical);
          return (
            <g key={`ph-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: PHYS }} vectorEffect="non-scaling-stroke" />
              <text x={x} y={Math.min(padT + plotH - 4, y + 28)} className={f.ptVal} style={{ fill: PHYS }} textAnchor={anchorFor(i)}>
                {r.physPct?.toFixed(0)}%
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
            {hi <= lastPhys && rows[hi].physPct != null && (
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
          {!hidePhys && <p className={f.tipRow}><i style={{ background: PHYS }} />{/* «—» = ХЭМЖИГДЭЭГҮЙ; жинхэнэ 0% нь «0.0%» гэж гарна */}
            {tr('Биет гүйцэтгэл')}<b className="num">{pt.physPct == null ? '—' : `${pt.physPct.toFixed(1)}%`}</b></p>}
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
export const loadFinData = cached(loadFinDataRaw, LIVE_TTL, ['IPC_LOG', 'CASHFLOW2', 'BAGTS_SHEET']);

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
  LIVE_TTL,
  ['CASHFLOW2'],
);
const loadIpcRows = cached(
  () => queryFeatures(IPC_LOG.url, { outFields: ['*'] }),
  LIVE_TTL,
  ['IPC_LOG'],
);

async function loadFinDataRaw(): Promise<FinData> {
  const S = TASK_SHEET.fields;
    const [contracts, ipc, hist] = await Promise.all([
      loadCashflowRows(),
      loadIpcRows(),
      /*
       * БИЕТ ГҮЙЦЭТГЭЛ — блок бүрийн «Б.» мөрийн бүх агшин.
       *
       * ⚠️ 2026-08-25: урьд нь `Selbe_guitsetgel_consolidated`-ээс шууд асуудаг
       *    байв. Тэр хүснэгт CSV-гээр гараар шинэчлэгддэг бөгөөд 2026-07-25-нд
       *    зогссон тул график сарын өмнөх байдлыг үзүүлсээр байлаа. Одоо
       *    `loadBlockHistory()` нь `Bagts_*` бөглөх хуудсуудаас уншдаг болсон —
       *    ижил эх сурвалжийг ДАХИН асуухын оронд түүнийг хуваалцана.
       */
      loadBlockHistory(),
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
      /*
       * `BlockHistory` нь `${БАГЦ}|${блок}` түлхүүртэй Map — доорх логик УРТ
       * мөр хүлээдэг тул задалж өгнө. Гүйцэтгэл нь 0–100 хувиар ирдэг ч энэ
       * тооцоолол 0–1 бутархайг хүлээдэг тул 100-д хуваана.
       */
      const sheet = [...hist].flatMap(([key, pts]) => {
        const [bg, bl] = key.split('|');
        return pts.map((pt) => ({
          [S.bagts]: bg,
          [S.block]: bl,
          [S.date]: pt.date,
          [S.progress]: pt.pct == null ? null : pt.pct / 100,
        }) as Row);
      });
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
const loadFinRegister = cached(loadFinRegisterRaw, LIVE_TTL, ['IPC_LOG', 'CASHFLOW2']);

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
        {/*
          ⚠️ `onSaved` нь `retry` — нийтэлсний дараа энэ хуудасны мөрүүдийг
          ДАХИН татна. `invalidate()` нь кэшийг аль хэдийн хаясан тул энэ нь
          үйлчилгээ рүү шинэ хүсэлт болно; `useAsync` хуучин мөрүүдийг барьж
          байгаад солино (`dataBus`-ийн stale-while-revalidate).
        */}
        {(d) => <FinTablesView d={d} onSaved={() => q.retry?.()} />}
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

  /*
   * ⚠️ ХАДГАЛАГДСАН `pctCum` (CF-ийн «өссөн хувь») БАГАНЫГ ХЭРЭГЛЭХГҮЙ —
   *    тэр нь ЖИЛ БҮР ТЭГЛЭГДДЭГ. Амьд өгөгдөл (2026-08-27, Багц 2):
   *
   *      2025-10..12  19.3%   → 2026-01..06  0.0%   → 2026-09  39.8%
   *
   *    Өссөн дүн ДУНДАА 0 болж унана гэдэг боломжгүй — график дээр
   *    төлөвлөгөөний муруй зургаан сар шалан дээр хэвтээд, эцсийн цэг нь
   *    100%-ийн оронд 39.8% дээр зогсдог байв. `services.ts` нь `amountCum`-ийн
   *    хувьд яг энэ занг («ЖИЛ БҮР ТЭГЛЭГДДЭГ») аль хэдийн тэмдэглэсэн
   *    бөгөөд `loadBudget` түүнийг хэрэглэхээс зайлсхийдэг.
   *
   *    Тиймээс өссөн хувийг гэрээний ӨӨРИЙНХ нь сарын дүнгээс бодно —
   *    үргэлж өсөх ба төгсгөлдөө 100% болно. Төслийн нэгтгэсэн график
   *    (`aggregateMonths`) аль хэдийн ЯГ ЭНЭ дүрмээр боддог тул хоёр
   *    график нэг хэлээр ярина.
   */
  const amounts = CASHFLOW2.months.map((m) => n(r[m.amount]));
  const total = amounts.reduce((a, b) => a + b, 0);
  let cum = 0;

  return CASHFLOW2.months.map((m, i) => {
    cum += amounts[i];
    return {
      label: m.label,
      amount: amounts[i],
      amountCum: n(r[m.amountCum]),
      // ⚠️ Нийт нь 0 бол хувь утгагүй — хадгалагдсан баганад ЭНД Л буцаж
      //    найдна (сарын хуваарь огт бөглөгдөөгүй гэрээ).
      cumPct: total > 0 ? (cum / total) * 100 : pctVal(r[m.pctCum]),
      given: byMon?.get(m.label) ?? 0,
      phys: ph?.get(m.label) ?? null,
    };
  });
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
    // ⚠️ `!= null`: 0% нь бодит хэмжилт — хоцрогдлын тооцооноос хасахгүй
    if (m.label <= nowYm && m.phys != null) mi = i;
  });
  if (mi < 0) return null;
  // Төлөвлөгөө: тухайн сар хүртэлх сүүлийн бөглөгдсөн өссөн хувь
  let planned = 0;
  for (let i = 0; i <= mi; i++) if (months[i].cumPct > 0) planned = months[i].cumPct;
  if (planned <= 0) return null;
  const actual = months[mi].phys ?? 0;
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

/**
 * ЗАСАХ БОЛОМЖГҮЙ талбарууд — серверийн удирддаг багана.
 *
 * ⚠️ `tableWrite.ts` эдгээрийг илгээхийн өмнө ч шүүдэг (давхар хамгаалалт).
 * Энд шүүх нь UI-д зориулагдсан: засаж болохгүй нүдэнд оролт харуулбал
 * хэрэглэгч бичээд, дараа нь чимээгүй алга болоход гайхна.
 */
const SERVER_RO = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor)/i;

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

/**
 * Нүдийг ЗАСАХ талбарт тавих түүхий текст.
 *
 * ⚠️ `fmtCell`-ийн гаралтыг ХЭРЭГЛЭХГҮЙ: тэр нь мянгатын таслал нэмдэг
 * («62,791,703,684») тул засварт оруулбал хадгалахад тоо болж хөрвөхгүй.
 * Огноог `YYYY-MM-DD` болгоно — оруулахад ч мөн тэр хэлбэрийг хүлээнэ.
 */
function editText(v: unknown, type: string): string {
  if (v == null) return '';
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  return String(v);
}

/**
 * Засварласан текстийг үйлчилгээ хүлээж авах ТӨРӨЛ рүү хөрвүүлнэ.
 *
 * ⚠️ Хоосон нүд нь `null` — хоосон мөр (`''`) БИШ. Тоон талбарт `''` илгээвэл
 * ArcGIS 0 болгож хадгалдаг: «бөглөөгүй» ба «тэг» хоёр ЗААВАЛ ялгаатай байх
 * ёстой, эс бөгөөс дашбоардын дундаж чимээгүй гажина.
 *
 * ⚠️ Буруу тоо/огноог ЧИМЭЭГҮЙ 0 болгохгүй — `Error` шиднэ, дуудагч тал
 * тухайн нүдийг тодруулж хэрэглэгчид буцаана.
 */
function parseCell(s: string, type: string, label: string): unknown {
  const v = s.trim();
  if (v === '') return null;
  if (type === 'esriFieldTypeDate') {
    const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
    if (Number.isNaN(d.getTime())) throw new Error(tr('«{0}» — огноо буруу: {1}', label, v));
    return d.getTime();
  }
  if (NUMERIC_TYPES.has(type)) {
    /* Хэрэглэгч хуулж тавихад мянгатын таслал/зай дагалдаж болно */
    const x = Number(v.replace(/[\s,\u00a0]/g, ''));
    if (!Number.isFinite(x)) throw new Error(tr('«{0}» — тоо буруу: {1}', label, v));
    return x;
  }
  return v;
}

/**
 * Үйлчилгээний БҮРЭН хүснэгт — талбар бүр багана (alias), мөр бүр яг байгаагаар.
 *
 * ⚠️ ЗАСВАРЫН ГОРИМ (2026-08-28). Эдгээр хоёр хүснэгт нь өдөр тутам засагддаг
 * тул AGOL руу орохгүйгээр порталаас шууд засах шаардлагатай болов. Гурван
 * зарчмаар барьсан:
 *
 *   1. ЗАСВАР ХУРИМТЛАГДАНА, шууд илгээгдэхгүй (`pend`). Нүд бүрийг тусад нь
 *      илгээвэл 250 нүд засахад 250 хүсэлт явж, дунд нь тасрахад хагас
 *      бичигдсэн мөр үлдэнэ. «Нийтлэх» дарахад л нэг багц болж явна.
 *   2. ЗӨВХӨН ӨӨРЧЛӨГДСӨН талбарыг илгээнэ. Бүтэн мөрийг буцааж бичвэл өөр
 *      хүний зэрэг зассан багана дарагдана (257 талбартай хүснэгтэд бодит
 *      эрсдэл).
 *   3. НИЙТЭЛСНИЙ ДАРАА `invalidate()` — дашбоардын тоо тэр дор нь дагана.
 *      Эс бөгөөс хэрэглэгч засвараа хараад «бичигдээгүй юм болов уу» гэж
 *      дахин дарна.
 */
function FullTable({
  title, subtitle, rows, fields, url, oidField, dataKey, canEdit, canRow, onSaved,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  fields: FieldDef[];
  /** Бичих хаяг — засварын горим үүгээр л боломжтой */
  url: string;
  oidField: string;
  /** Нийтэлсний дараа хүчингүй болгох хүснэгтийн түлхүүр */
  dataKey: DataKey;
  canEdit: boolean;
  canRow: boolean;
  /** Амжилттай нийтэлсний дараа — эцэг талд дахин татуулна */
  onSaved: () => void;
}) {
  /** Засварын горим асаалттай эсэх — эрхтэй хүнд л товч гарна */
  const [edit, setEdit] = useState(false);
  /** `oid:талбар` → шинэ ТЕКСТ. Хоосон мөр ('') нь «null болгоно» гэсэн үг. */
  const [pend, setPend] = useState<Record<string, string>>({});
  /** Нийтлээгүй ШИНЭ мөрүүд — сөрөг түр дугаартай */
  const [adds, setAdds] = useState<Record<string, string>[]>([]);
  const [del, setDel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = Object.keys(pend).length + adds.length + del.size;

  /* ⚠️ Нийтлээгүй засвартай байхад таб хаахад хөтөч анхааруулна — «Гүйцэтгэл
     бөглөх»-тэй ижил зан. Гараар хийсэн 200 нүдний ажил алдагдах нь эргэж
     нөхөгдөшгүй. */
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const reset = () => { setPend({}); setAdds([]); setDel(new Set()); setErr(null); };

  const publish = async () => {
    if (busy || !dirty) return;
    /*
     * ⚠️ УСТГАЛ БУЦААГДАХГҮЙ. Эдгээр үйлчилгээнд хувилбарын түүх асаагүй тул
     * устгасан мөр бүрмөсөн алга болно — «Нийтлэх (3)» гэсэн тоо нь тэдгээрийн
     * нэг нь БУЦААГДАШГҮЙ устгал гэдгийг хэлдэггүй. `UserAdmin`, `FillNew`
     * зэрэгт эргэлт буцалтгүй үйлдлийн өмнө баталгаажуулалт асуудаг дүрэмтэй
     * ижил.
     *
     * ⚠️ Зөвхөн УСТГАЛД асууна: утга засах, мөр нэмэхэд асуувал өдөр тутмын
     * ажил бүрд шаардлагагүй цонх гарч, хүн уншихаа болино — тэр үед жинхэнэ
     * анхааруулга ч мөн адил дарагдана.
     */
    if (del.size > 0
      && !window.confirm(tr('{0} мөр БУЦААГДАШГҮЙ устгагдана. Үргэлжлүүлэх үү?', del.size))) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const byName = new Map(fields.map((c) => [c.name, c]));
      const typeOf = (n: string) => byName.get(n)?.type ?? 'esriFieldTypeString';
      const labelOf = (n: string) => finFieldLabel(n);

      /* ── Засварласан утга — мөрөөр бүлэглэнэ ── */
      const upd = new Map<number, Record<string, unknown>>();
      for (const [k, v] of Object.entries(pend)) {
        const cut = k.indexOf(':');
        const oid = Number(k.slice(0, cut));
        const fld = k.slice(cut + 1);
        if (del.has(oid)) continue;                 // устгах мөрийн засвар утгагүй
        const a = upd.get(oid) ?? { [oidField]: oid };
        a[fld] = parseCell(v, typeOf(fld), labelOf(fld));
        upd.set(oid, a);
      }

      /* ── Шинэ мөрүүд ── */
      const newRows = adds.map((a) => {
        const o: Record<string, unknown> = {};
        for (const [fld, v] of Object.entries(a)) {
          if (v.trim() === '') continue;            // хоосон нүд — талбарыг огт илгээхгүй
          o[fld] = parseCell(v, typeOf(fld), labelOf(fld));
        }
        return o;
      }).filter((o) => Object.keys(o).length > 0);

      /* ⚠️ ГУРВЫГ НЭГ ХҮСЭЛТЭЭР — атомаар. Салгаж явуулбал нэмэлт амжилттай
         болоод устгал уначихад хэрэглэгч дахин дарж, нэмсэн мөр ДАВХАРДАНА. */
      const { n } = await applyAll(url, oidField, {
        updates: [...upd.values()],
        adds: newRows,
        deletes: [...del],
      });

      /* ⚠️ Кэшийг зөвхөн АМЖИЛТТАЙ бичилтийн дараа хаяна */
      invalidate(dataKey);
      reset();
      setMsg(tr('{0} мөр хадгалагдав', n));
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };
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
    /*
     * ⚠️ ЗАСВАРЫН ГОРИМД БҮТЭН ДЭЛГЭЦ (`position: fixed`). Хажуугийн цэс ба
     * дээд толгой алга болж, хүснэгт нүүрийг бүтнээр эзэлнэ.
     *
     * ⚠️ Яагаад overlay вэ, эцэг талын төлөв БИШ: цэс ба толгой нь `Portal`/
     * `Root`-д, өөр модульд байна. Тэднийг нуухын тулд төлөв дамжуулбал
     * «хэн юуг нууж байна» гэдэг гурван файлд тарна. `fixed` overlay нь
     * ЭНЭ ФАЙЛААС гарахгүйгээр яг тэр үр дүнг өгнө.
     */
    <section className={`${f.reg} ${edit ? f.regFull : ''}`}>
      <header className={f.regHd}>
        <h2>{title}</h2>
        {/* envhub: бүх тоо «num» (tabular) — мөр·баганын тоолол */}
        <span className="num">{subtitle}</span>
        {/* ⚠️ Эрхгүй хэрэглэгчид товч ОГТ гарахгүй — унтраасан товч харуулбал
            «яагаад надад болохгүй байна вэ» гэсэн асуулт төрүүлнэ. */}
        {canEdit && (
          <div className={f.regAct}>
            {!edit ? (
              <button type="button" className={f.editBtn} onClick={() => setEdit(true)}>
                {tr('Засах')}
              </button>
            ) : (
              <>
                {/* ⚠️ «Мөр нэмэх» ТОЛГОЙД. Урьд нь хүснэгтийн доор байсан бөгөөд
                    бүтэн дэлгэцийн горимд хөвөгч товчнуудтай (хэрэглэгчийн
                    зураг, «AI туслах») давхцаж, хагас халхлагдаж байв. Бүх
                    үйлдэл НЭГ мөрөнд байх нь олоход ч хялбар. */}
                {canRow && (
                  <button
                    type="button"
                    className={f.editBtn}
                    disabled={busy}
                    onClick={() => setAdds((s) => [...s, {}])}
                  >
                    {tr('+ Мөр нэмэх')}
                  </button>
                )}
                <button
                  type="button"
                  className={`${f.editBtn} ${dirty > 0 ? f.editBtnOn : ''}`}
                  disabled={busy || dirty === 0}
                  onClick={publish}
                >
                  {busy ? tr('Хадгалж байна…') : tr('Нийтлэх ({0})', dirty)}
                </button>
                <button
                  type="button"
                  className={f.editBtn}
                  disabled={busy}
                  onClick={() => { reset(); setEdit(false); }}
                >
                  {tr('Болих')}
                </button>
              </>
            )}
          </div>
        )}
      </header>
      {err && <p className={f.editErr}>{err}</p>}
      {msg && !err && <p className={f.editOk}>{msg}</p>}
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
                {edit && canRow && <th className={f.rowBtnCell} aria-label={tr('Мөр')} />}
                {cols.map((c) => (
                  <th key={c.name} title={c.name}>{finFieldLabel(c.name)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const oid = typeof r[oidField] === 'number' ? (r[oidField] as number) : null;
                const dropped = oid != null && del.has(oid);
                return (
                  <tr key={oid ?? i} className={dropped ? f.rowDel : undefined}>
                    {/* ⚠️ Устгах баганыг ЗАСВАРЫН горимд л гаргана — уншиж буй
                        хэрэглэгчийн хүснэгтийн өргөнийг дэмий иддэггүй. */}
                    {edit && canRow && (
                      <td className={f.rowBtnCell}>
                        <button
                          type="button"
                          className={f.rowBtn}
                          title={dropped ? tr('Устгахаа болих') : tr('Мөр устгах')}
                          onClick={() => {
                            if (oid == null) return;
                            setDel((s) => {
                              const nx = new Set(s);
                              if (nx.has(oid)) nx.delete(oid); else nx.add(oid);
                              return nx;
                            });
                          }}
                        >
                          {dropped ? '↩' : '×'}
                        </button>
                      </td>
                    )}
                    {cols.map((c) => {
                      const key = `${oid}:${c.name}`;
                      const editable = edit && oid != null && !dropped && !SERVER_RO.test(c.name);
                      if (editable) {
                        const cur = key in pend ? pend[key] : editText(r[c.name], c.type);
                        return (
                          <td key={c.name} className={f.cellEdit}>
                            <input
                              className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
                              value={cur}
                              onChange={(ev) => {
                                const v = ev.target.value;
                                setPend((p) => {
                                  const nx = { ...p };
                                  /* Анхны утга руугаа буцвал «засвар» гэж тоолохгүй */
                                  if (v === editText(r[c.name], c.type)) delete nx[key];
                                  else nx[key] = v;
                                  return nx;
                                });
                              }}
                            />
                          </td>
                        );
                      }
                      const cell = fmtCell(r[c.name], c.type);
                      return (
                        // envhub: тоон нүд бүр глобал «num» (tabular) + баруун зэрэгцүүлэлт
                        <td key={c.name} className={cell.num ? `num ${f.cellNum}` : undefined}>{cell.text}</td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* ── НИЙТЛЭЭГҮЙ ШИНЭ МӨРҮҮД ── */}
              {edit && adds.map((a, ai) => (
                <tr key={`new-${ai}`} className={f.rowNew}>
                  {canRow && (
                    <td className={f.rowBtnCell}>
                      <button
                        type="button"
                        className={f.rowBtn}
                        title={tr('Мөр хасах')}
                        onClick={() => setAdds((s) => s.filter((_, k) => k !== ai))}
                      >×</button>
                    </td>
                  )}
                  {cols.map((c) => (
                    <td key={c.name} className={f.cellEdit}>
                      {SERVER_RO.test(c.name) ? null : (
                        <input
                          className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
                          value={a[c.name] ?? ''}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            setAdds((s) => s.map((x, k) => (k === ai ? { ...x, [c.name]: v } : x)));
                          }}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </ResizableTable>
        </div>
      )}
    </section>
  );
}

/**
 * Санхүүжилт — Cashflow ба IPC-ийн БҮРЭН хүснэгт (график огт байхгүй).
 *
 * ⚠️ ЭРХИЙГ ЭНД шалгаж доош дамжуулна, `FullTable` дотор БИШ: тэр бүрэлдэхүүн
 * дурын үйлчилгээнд ажиллах ёстой тул `caps`-аас хараат байх нь буруу
 * хамаарал болно.
 */
function FinTablesView({ d, onSaved }: { d: FinTables; onSaved: () => void }) {
  const { user, status } = useAuth();
  /* ⚠️ Эрх нь ArcGIS-ээс АСИНХРОНООР ирдэг (`initRemote`) тул захиалж, ирэхэд
     дахин зурна — эс бөгөөс админ эрх өгсний дараа хэрэглэгч хуудсаа дахин
     ачаалж байж товчоо олно. */
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCaps(() => setTick((n) => n + 1)), []);
  void tick;
  /**
   * НЭВТРЭЛТ УНТРААЛТТАЙ үед эрх НЭЭЛТТЭЙ.
   *
   * ⚠️ Энэ нь порталын БУСАД хэсэгтэй нийцүүлсэн зан: `Root.tsx` нь
   * `status === 'off'` үед `views: 'all'`, `docs: true` өгөөд хэрэглэгчийг
   * СУПЕР АДМИН гэж үздэг (`isSuper`). Зөвхөн санхүүгийн засварыг өөрөөр
   * хаавал хөгжүүлэлтийн орчинд бүх зүйл нээлттэй атал энэ ганц хуудас
   * ойлгомжгүй хаалттай үлдэнэ.
   *
   * ⚠️ ҮЙЛДВЭРЛЭЛД ЭНЭ САЛАА АЖИЛЛАХГҮЙ: `status === 'off'` нь
   * `NEXT_PUBLIC_AUTH_APP_ID` ХООСОН үед л үүсдэг бөгөөд тэр нь зөвхөн
   * `.env.development.local` (`next dev`) дотор хоосон. Статик build нь
   * `.env`-ийг уншдаг тул нэвтрэлт АСААЛТТАЙ, эрх нь `caps`-аар л шийдэгдэнэ.
   *
   * ⚠️ Нэвтэрсэн үед админ ч гэсэн эрхээ панелаас ӨӨРТӨӨ ил асаана
   * («Гүйцэтгэл бөглөх»-ийн «Мөр нэмэх»-тэй ижил дүрэм) — ингэснээр «хэн
   * санхүүгийн тоо засаж чадах вэ» гэдэг НЭГ жагсаалтаас бүрэн харагдана.
   */
  const devOpen = status === 'off';
  const canEdit = devOpen || hasCap(user?.username, 'finEdit');
  const canRow = devOpen || hasCap(user?.username, 'finRow');

  /**
   * ⚠️ ХОЁР ХҮСНЭГТ ДАРААЛЖ БИШ, СОЛИГДОЖ гарна.
   *
   * Урьд нь Cashflow (76 мөр) ба IPC (90 мөр) нэг хуудсанд дараалж
   * зурагддаг байв. Хоёулаа дотроо хоёр тэнхлэгээр гүйдэг тул хуудас
   * бүхэлдээ гурван өөр гүйлгэлттэй болж, доод хүснэгтийг олохын тулд
   * дээдийг нь өнгөрөх шаардлагатай байлаа. Нэг мөчид НЭГ хүснэгт.
   */
  const [tab, setTab] = useState<'cf' | 'ipc'>('cf');

  return (
    <>
      <header className={f.pageHd}>
        <div>
          <h2>{tr('Санхүүжилтийн бүртгэл — Cashflow ба IPC')}</h2>
          <p>
            {tr('Эх үйлчилгээний бүрэн хүснэгт — багана бүр (талбарын нэр), мөр бүр яг байгаагаар. Огноо ба тоон утгыг талбарын төрлөөр форматлав.')}
          </p>
        </div>
        {/* Хүснэгт солих — идэвхтэй нь дүүргэлттэй */}
        <div className={f.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cf'}
            className={`${f.tab} ${tab === 'cf' ? f.tabOn : ''}`}
            onClick={() => setTab('cf')}
          >
            {tr('Cashflow')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ipc'}
            className={`${f.tab} ${tab === 'ipc' ? f.tabOn : ''}`}
            onClick={() => setTab('ipc')}
          >
            {tr('IPC')}
          </button>
        </div>
      </header>

      {tab === 'cf' ? (
      <FullTable
        title={tr('Cashflow — гэрээ, захирамжийн санхүүжилт (/106)')}
        subtitle={tr('{0} мөр · {1} багана', num(d.cashflow.length), d.cfFields.length)}
        rows={d.cashflow}
        fields={d.cfFields}
        url={CASHFLOW2.url}
        oidField={CASHFLOW2.oid}
        dataKey="CASHFLOW2"
        canEdit={canEdit}
        canRow={canRow}
        onSaved={onSaved}
      />
      ) : (
      <FullTable
        title={tr('IPC — олгосон акт (/107)')}
        subtitle={tr('{0} мөр · {1} багана', num(d.ipc.length), d.ipcFields.length)}
        rows={d.ipc}
        fields={d.ipcFields}
        url={IPC_LOG.url}
        oidField={IPC_LOG.oid}
        dataKey="IPC_LOG"
        canEdit={canEdit}
        canRow={canRow}
        onSaved={onSaved}
      />
      )}
    </>
  );
}

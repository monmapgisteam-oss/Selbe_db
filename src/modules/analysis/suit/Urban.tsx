'use client';

import { useState, type ReactNode } from 'react';
import {
  CATEGORIES, DENSITY_BY_TYPE, PARKING_SOURCES, GREEN_SOURCES, GREEN_RADII, LOCATION_RADII, BUILDING_PURPOSES, BUILDING_PURPOSE_OTHER,
  type Indicator, type ParkingOpt, type ParkingSource, type CategoryKey,
  type GreenOpt, type GreenSource,
} from '@/lib/analysis/config';
import { scoreColor, clamp } from '@/lib/analysis/score';
import { Donut } from '@/components/ui';
import { shade } from '@/lib/format';
import { nf, normLine } from './format';
import type { LocationPt } from '@/lib/analysis/data';
import type { Row } from './model';
import s from '../suitability.module.css';

/**
 * «Зогсоол» ба «Ногоон байгууламж» картын ДИАГРАМЫН ЦОРЫН ГАНЦ ӨНГӨ.
 *
 * ⚠️ Оноолтын шатлал (ногоон→шар→улаан) хэрэглэхээ БОЛЬСОН: эдгээр карт нь
 * хэмжилтийн тайлан болохоос үнэлгээ биш тул улаан өнгө «алдаа гарлаа» гэсэн
 * худал дохио өгдөг байв (хэрэглэгчийн шийдвэр, 2026-08-12). Бүдэг цэнхэр нь
 * `SuitDetail`-ийн C1-тэй ижил — самбар даяар нэг диаграмын өнгө.
 */
const CHART = '#4f83cc';

/**
 * ТООЦООНЫ ТОМЬЁО — хураадаг блок.
 *
 * ⚠️ Анхдагчаар НЭЭЛТТЭЙ: хангалтын хувь ХААНААС гарсныг харуулах нь энэ
 * картуудын гол зорилго (хэрэглэгчийн хүсэлт, 2026-08-12). Хураах боломж нь
 * зөвхөн зай чөлөөлөх сонголт — нуух өгөгдмөл БИШ.
 */
function Formula({ children }: { children: ReactNode }) {
  const [off, setOff] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${s.subLabel} ${s.toggleLabel} ${off ? s.toggleOff : ''}`}
        onClick={() => setOff((v) => !v)}
      >
        <span>Тооцооны томьёо</span><i>▼</i>
      </button>
      {!off && <div className={s.parkFormula}>{children}</div>}
    </>
  );
}

/* ══════════════════ Үндсэн 3 төрлийн дугуй диаграм ══════════════════ */

/**
 * Хот төлөвлөлтийн үзүүлэлтүүд 3 үндсэн төрөлд бүлэглэгдэнэ. Диаграм нь
 * тэдгээрийн ЖИНГИЙН эзлэх хувийг харуулж, тайлбарт нь тухайн төрлийн дундаж
 * ОНОО гарна.
 *
 * ⚠️ SVG дугуйг `stroke-dasharray`-аар зурна — олон `<path>` үүсгэхээс хямд
 * бөгөөд өнцөг тооцох тригонометр шаардахгүй.
 */
export function CategoryPie({
  rows, indicators, totalW, filter, setFilter,
}: {
  rows: Row[];
  indicators: Indicator[];
  totalW: number;
  filter: CategoryKey | null;
  setFilter: (c: CategoryKey | null) => void;
}) {
  const cats = CATEGORIES.map((c) => {
    const mine = indicators.filter((i) => i.cat === c.key);
    const weight = mine.reduce((a, i) => a + i.weight, 0);
    // Тухайн төрлийн дундаж оноо — бүх бүс, бүх гишүүн үзүүлэлтээр жигнэсэн
    let sum = 0, wsum = 0;
    for (const row of rows) {
      for (const i of mine) {
        const p = row.parts[i.id];
        if (p?.score == null || i.weight <= 0) continue;
        sum += p.score * i.weight;
        wsum += i.weight;
      }
    }
    return { ...c, weight, share: (weight / totalW) * 100, score: wsum ? sum / wsum : null };
  });

  /** Голд — гурван төрлийн жигнэсэн ерөнхий дундаж оноо */
  let tSum = 0, tW = 0;
  for (const c of cats) {
    if (c.score == null) continue;
    tSum += c.score * c.weight;
    tW += c.weight;
  }
  const overall = tW ? Math.round(tSum / tW) : null;

  /**
   * ⚠️ Порталын БУСАД дашбоардтай ИЖИЛ `ui.tsx`-ийн Donut — урьд нь энд өөрийн
   * SVG дугуй байсан нь ижил өгөгдлийг өөр дүрслэлээр харуулж байв. Зүсмэгийн
   * хэмжээ нь жингийн эзлэх хувь; тайлбарт төрлийн дундаж оноо (өнгөөр) ба
   * жингийн хувь. Харанхуй палитрт `ui`-ийн хувьсагчид `.app`-ын CSS гүүрээр
   * буудаг тул өнгө нь энэ модулийн дэвсгэртэй зохицно.
   */
  return (
    <Donut
      size={116}
      width={20}
      items={cats.map((c, i) => ({
        key: c.key,
        label: c.short,
        value: c.weight,
        // НЭГ ӨНГӨ (accent) тодоос бүдгэр — зүсмэгийн өнгө нь ангиллын «утга» биш,
        // зөвхөн ялгах зорилготой. Онооны утгыг тайлбарын тоо (scoreColor) хэлнэ.
        color: shade('#4fd1c5', i, cats.length),
        display: (
          <>
            <b style={{ color: scoreColor(c.score) }}>
              {c.score == null ? '—' : Math.round(c.score)}
            </b>
            {' · '}
            {c.share.toFixed(0)}%
          </>
        ),
      }))}
      center={overall ?? '—'}
      centerLabel="дундаж оноо"
      selected={filter}
      onSelect={(k) => setFilter(filter === k ? null : (k as CategoryKey))}
    />
  );
}

/* ══════════════════ Үзүүлэлт сонгох ══════════════════ */

export function IndicatorPicker({
  rows, indicators, active, setActive, totalW, filter,
}: {
  rows: Row[];
  indicators: Indicator[];
  active: string;
  setActive: (id: string) => void;
  totalW: number;
  /** Дугуй диаграмаас сонгосон төрөл — `null` бол бүгд */
  filter: CategoryKey | null;
}) {
  const ind = indicators.find((i) => i.id === active) ?? indicators[0];
  const groups = CATEGORIES
    .filter((c) => !filter || c.key === filter)
    // ⚠️ ЛАВЛАГААНЫ үзүүлэлтийг ХАСНА: нормгүй тул «норм хангасан %» ба газрын
    //    зургийн будалт нь худал (бүх бүс 100 оноо мэт харагдана).
    .map((c) => ({ c, items: indicators.filter((i) => i.cat === c.key && !i.ref) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className={s.indHead} style={{ marginTop: 10 }}>
        <span>Үзүүлэлт</span><span>Жин</span><span>Норм хангасан</span><span />
      </div>

      {groups.map(({ c, items }) => (
        <div key={c.key}>
          <div className={s.subLabel} style={{ color: c.color }}>{c.label}</div>
          <div className={s.indList}>
            {items.map((i) => {
              let pass = 0, total = 0;
              for (const r of rows) {
                const p = r.parts[i.id];
                if (!p || p.value == null) continue;
                total++;
                // ⚠️ «Норм хангасан» гэдэг нь ЯГ 100 оноо — хөвөгч тооны
                //    нарийвчлалыг бодож 99.9-ээр шалгана
                if ((p.score ?? 0) >= 99.9) pass++;
              }
              const pct = total ? (pass / total) * 100 : 0;
              return (
                <button
                  key={i.id}
                  type="button"
                  className={`${s.ind} ${i.id === active ? s.indOn : ''}`}
                  title={i.name}
                  onClick={() => setActive(i.id)}
                >
                  {/* FAR/BCR нь дангаараа (богино нэр), бусад нь бүтэн нэршлээрээ */}
                  <span className="nm">{i.byType ? i.short : i.name}</span>
                  <span className="wt">{((i.weight / totalW) * 100).toFixed(0)}%</span>
                  <span className="cnt">{total ? `${pass}/${total}` : '—'}</span>
                  <span className="bar"><i style={{ width: `${pct}%`, background: scoreColor(pct) }} /></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className={s.indNote}>
        <div className={s.wReq}>
          <b>Норм:</b> {normLine(ind)}
          <span className="wt">жин {((ind.weight / totalW) * 100).toFixed(0)}%</span>
        </div>
        <div className={s.wSrc}>{ind.norm}</div>
      </div>
    </>
  );
}

/* ══════════════════ Жингийн тохиргоо ══════════════════ */

export function Weights({
  indicators, setIndicators, totalW,
}: {
  indicators: Indicator[];
  setIndicators: (v: Indicator[]) => void;
  totalW: number;
}) {
  const patch = (id: string, key: keyof Indicator, value: number) =>
    setIndicators(indicators.map((i) => (i.id === id ? { ...i, [key]: value } : i)));

  return (
    <div>
      {/* ⚠️ ЛАВЛАГААНЫ үзүүлэлт нормгүй тул жин/босго засварлах утгагүй */}
      {indicators.filter((i) => !i.ref).map((i) => {
        // Босго засварлах талбарууд — горимоос хамаарч өөр
        const fields: [keyof Indicator, string][] = i.mode === 'band'
          ? [['optMin', 'Нормын доод'], ['optMax', 'Нормын дээд'], ['hardMin', '0 оноо (доош)'], ['hardMax', '0 оноо (дээш)']]
          : i.mode === 'higher'
            ? [['target', 'Нормын доод'], ['hardMin', '0 оноо']]
            : [['best', 'Нормын дээд'], ['hardMax', '0 оноо']];

        return (
          <div key={i.id} className={s.wRow} style={{ opacity: i.weight === 0 ? 0.45 : 1 }}>
            <div className={s.wTop}>
              <span className="nm">{i.name}</span>
              <span className="pct">{((i.weight / totalW) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" className={s.wSlider} min={0} max={40} step={1}
              value={i.weight}
              aria-label={`${i.name} — жин`}
              onChange={(e) => patch(i.id, 'weight', Number(e.target.value))}
            />
            <div className={s.wReq}><b>Норм:</b> {normLine(i)}</div>
            <div className={s.wSrc}>{i.norm}</div>

            {i.byType ? (
              // FAR / BCR — бүсийн төрөл бүрд өөр дээд хязгаартай тул хүснэгтээр
              <div className={s.wTypes}>
                {Object.entries(DENSITY_BY_TYPE).map(([t, v]) => (
                  <div key={t}>
                    <span>{t}</span>
                    <b>≤ {nf(v[i.byType!], i.decimals)}{i.unit ? ` ${i.unit}` : ''}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.wThr}>
                {fields.map(([key, label]) => (
                  <label key={String(key)}>
                    <span>{label}</span>
                    {/* ⚠️ Controlled: «Анхны утга» reset хийхэд дэлгэцийн тоо
                        төлөвтэйгээ ХАМТ буцах ёстой — defaultValue бол DOM
                        хуучин засварласан утгаа хадгалж, оноололтой зөрдөг. */}
                    <input
                      type="number" step="any"
                      value={i[key] as number}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) patch(i.id, key, v);
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════ Зогсоол ══════════════════ */

export function Parking({
  rows, parking, setParking,
}: {
  rows: Row[];
  parking: ParkingOpt;
  setParking: (p: ParkingOpt) => void;
}) {
  const supply = rows.reduce((a, r) => a + r.parkingSupply, 0);
  const need = rows.reduce((a, r) => a + (r.parkingNeed ?? 0), 0);
  const il = rows.reduce((a, r) => a + r.etIl, 0);
  const dald = rows.reduce((a, r) => a + r.etDald, 0);
  const gap = supply - need;
  const withNeed = rows.filter((r) => r.parkingGap != null);
  const short = withNeed.filter((r) => (r.parkingGap ?? 0) < 0).length;
  const pct = need > 0 ? (supply / need) * 100 : null;

  const hh = rows.reduce((a, r) => a + r.households, 0);
  const pop = rows.reduce((a, r) => a + r.population, 0);
  /** Хэрэгцээний томьёоны ЗҮҮН тал — сонгосон аргаас хамаарна */
  const needExpr = parking.source === 'households'
    ? <>{nf(hh)} өрх × {parking.perHousehold.toFixed(2)} зогсоол</>
    : parking.source === 'population'
      ? <>{nf(pop)} хүн × {parking.per1000} ÷ 1000</>
      : <>бүх бүсийн нормд заасан зогсоолын нийлбэр</>;

  return (
    // ⚠️ `.plain` — бичвэр БҮГД цагаан, онооны ногоон/улаан алга
    <div className={s.plain}>
      <div className={s.subLabel}>Хэрэгцээг ямар аргаар тооцох вэ?</div>
      <div className={s.toggles}>
        {PARKING_SOURCES.map((src) => (
          <label key={src.key} className={s.chk}>
            <input
              type="radio" name="parkSrc"
              checked={parking.source === src.key}
              onChange={() => setParking({ ...parking, source: src.key as ParkingSource })}
            />
            <span>{src.label}</span>
          </label>
        ))}
      </div>

      {parking.source !== 'norm' && (
        <div className={s.sliderRow}>
          <label>
            <span>{parking.source === 'households' ? 'Нэг өрхөд ногдох зогсоол' : '1000 хүнд ногдох зогсоол'}</span>
            <span className="val">
              {parking.source === 'households' ? parking.perHousehold.toFixed(2) : parking.per1000}
            </span>
          </label>
          <input
            type="range"
            min={parking.source === 'households' ? 0.2 : 50}
            max={parking.source === 'households' ? 2 : 600}
            step={parking.source === 'households' ? 0.05 : 10}
            value={parking.source === 'households' ? parking.perHousehold : parking.per1000}
            aria-label="Зогсоолын коэффициент"
            onChange={(e) => setParking(parking.source === 'households'
              ? { ...parking, perHousehold: Number(e.target.value) }
              : { ...parking, per1000: Number(e.target.value) })}
          />
        </div>
      )}

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: CHART }}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>Хэрэгцээ хангасан хувь</b>
          <span>Төлөвлөгөөнд <b>{nf(supply)}</b> · шаардлагатай <b>{nf(need)}</b> зогсоол</span>
        </div>
      </div>

      <div className={s.parkBar} title="Ерөнхий төлөвлөгөөнд тусгагдсан зогсоол нийт хэрэгцээний хэдэн хувийг хангаж байгааг харуулна">
        <span style={{ width: `${pct == null ? 0 : clamp(pct, 0, 100)}%`, background: CHART }} />
      </div>
      <div className={s.parkScale}><span>0%</span><span>Норм 100%</span></div>

      {/* ⚠️ БҮТЭН гинж: хэрэгцээ → байгаа → хангалт. Урьд нь зөвхөн хэрэгцээний
          мөр байсан тул дээрх хувь ХААНААС гарсан нь харагддаггүй байв. */}
      <Formula>
        Хэрэгцээ = {needExpr} = <b>{nf(need)}</b> зогсоол<br />
        Ерөнхий төлөвлөгөөнд тусгагдсан = {nf(il)} ил + {nf(dald)} далд = <b>{nf(supply)}</b> зогсоол<br />
        Хангалт = {nf(supply)} ÷ {nf(need)} × 100 = <b>{pct == null ? '—' : `${Math.round(pct)}%`}</b>
      </Formula>

      <div className={s.finSummary}>
        <div><span>Ил болон далд зогсоол</span><b>{nf(il)} / {nf(dald)}</b></div>
        <div>
          <span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
          <b>{gap >= 0 ? '+' : '−'}{nf(Math.abs(gap))}</b>
        </div>
        {/* ⚠️ «N / M» биш ЦЭВЭР ТОО: хуваарь нь хоёр нүдэнд давхардаж, «23/23»
            гэдгийг «23 бүсийн 23» гэхээсээ бутархай мэт уншиж болзошгүй байв. */}
        <div><span>Дутагдалтай бүс</span><b>{short}</b></div>
        <div><span>Хангалттай бүс</span><b>{withNeed.length - short}</b></div>
      </div>
    </div>
  );
}

/* ══════════════════ Ногоон байгууламж ══════════════════ */

/**
 * НОГООН БАЙГУУЛАМЖИЙН ХАНГАМЖ — «Зогсоолын хэрэгцээ» картын ЯГ ИЖИЛ зарчим:
 * байгаа хэмжээ ба шаардлагатай хэмжээ хоёрыг харьцуулж, хангалтын хувийг гаргана.
 *
 * ⚠️ Хоёр арга нь ӨӨР ЗҮЙЛ хэмждэг (`GreenSource`-ын тайлбарыг үз):
 *   · 6 м²/хүн — ЗӨВХӨН оршин суугчтай бүсэд хэрэгцээ гарна. Оршин суугчгүй
 *     (сургууль, үйлчилгээ) бүс «хэрэгцээгүй» тул тоололд ОРОХГҮЙ — эс бөгөөс
 *     ногоонгүй ч гэсэн «хангалттай» гэж тоологдож, дүнг хөөрөгдөнө.
 *   · Талбайн % — хүн амаас хамаарахгүй тул БҮХ бүсэд үйлчилнэ.
 *
 * ⚠️ ТАЛБАЙ нь `polyHa` (полигоны БОДИТ талбай): ногоон байгууламжийн м² нь
 * бүсийн полигоноор ТАЙРАГДСАН (`nogoon_baiguulamj/0` — бүсээр огтлолцуулсан)
 * тул хувь тооцоход ижил суурьтай байх ёстой. `areaHa` (албан ёсны, зам хассан)
 * авбал хүртээмж хиймлээр өсөж харагдана.
 */
export function Green({
  rows, green, setGreen,
}: {
  rows: Row[];
  green: GreenOpt;
  setGreen: (g: GreenOpt) => void;
}) {
  const perPerson = green.source === 'perPerson';
  const buffer = green.source === 'buffer';
  /** Нэгж — «нөлөөллийн бүс» арга нь ХҮН тоолдог, бусад нь м² хэмждэг */
  const unit = buffer ? 'оршин суугч' : 'м²';

  /**
   * Бүс бүрийн байгаа ба шаардлагатай хэмжээ. Хэрэгцээгүй бол `null`.
   *
   * ⚠️ «Нөлөөллийн бүс» арга нь ӨӨР ЗҮЙЛ хэмждэг: талбай биш, ХҮН. Хэрэгцээ =
   * бүсийн бүх оршин суугч (бүгд ногоонд хүрэх ёстой), байгаа = радиус дотор
   * амьдардаг нь. Тиймээс нэгж, шошго нь бусад хоёроос ялгаатай.
   */
  const per = rows.map((r) => {
    if (buffer) {
      const pop = r.greenDist.reduce((a, x) => a + x.pop, 0);
      const cov = r.greenDist.reduce((a, x) => a + (x.d <= green.radius ? x.pop : 0), 0);
      return { r, have: cov, need: pop > 0 ? pop : null };
    }
    const have = r.greenM2;
    const need = perPerson
      ? (r.residentPop > 0 ? r.residentPop * green.perPerson : null)
      : (r.polyHa > 0 ? r.polyHa * 10_000 * (green.share / 100) : null);
    return { r, have, need };
  });

  const withNeed = per.filter((p) => p.need != null && p.need > 0);
  const haveAll = rows.reduce((a, r) => a + r.greenM2, 0);
  const need = withNeed.reduce((a, p) => a + (p.need ?? 0), 0);
  // ⚠️ Хангалтын хувийг ЗӨВХӨН хэрэгцээтэй бүсийн ногооноор — эс бөгөөс
  //    хэрэгцээгүй бүсийн ногоон нь бусдын дутагдлыг нөхөж, дүн худал өснө.
  const haveNeeded = withNeed.reduce((a, p) => a + p.have, 0);
  const gap = haveNeeded - need;
  const short = withNeed.filter((p) => p.have < (p.need ?? 0)).length;
  const pct = need > 0 ? (haveNeeded / need) * 100 : null;

  /** Төслийн НИЙТ талбайд ногоон эзлэх хувь — «30% ногоон уу?» гэсэн асуултын хариу */
  const landM2 = rows.reduce((a, r) => a + r.polyHa * 10_000, 0);
  const sharePct = landM2 > 0 ? (haveAll / landM2) * 100 : null;

  /**
   * Хэрэгцээний томьёоны ЗҮҮН тал.
   * ⚠️ Хүн ам/талбайг ЗӨВХӨН хэрэгцээтэй бүсээр нийлбэрлэнэ — томьёо нь
   * баруун талын дүнгээ ГАРГАХ ёстой. Бүх бүсээр нийлбэрлэвэл «6,280 × 6 =
   * 37,680» гэж бичээд өөр тоо гарч, хэрэглэгч арифметик нь буруу гэж бодно.
   */
  const needPop = withNeed.reduce((a, p) => a + p.r.residentPop, 0);
  const needLandM2 = withNeed.reduce((a, p) => a + p.r.polyHa * 10_000, 0);
  const needExpr = buffer
    ? <>бүсийн бүх оршин суугч</>
    : perPerson
      ? <>{nf(needPop)} оршин суугч × {green.perPerson} м²</>
      : <>{nf(needLandM2 / 10_000, 1)} га × {green.share}%</>;

  return (
    // ⚠️ `.plain` — бичвэр БҮГД цагаан, онооны ногоон/улаан алга
    <div className={s.plain}>
      <div className={s.subLabel}>Хэрэгцээг ямар аргаар тооцох вэ?</div>
      <div className={s.toggles}>
        {GREEN_SOURCES.map((src) => (
          <label key={src.key} className={s.chk}>
            <input
              type="radio" name="greenSrc"
              checked={green.source === src.key}
              onChange={() => setGreen({ ...green, source: src.key as GreenSource })}
            />
            <span>{src.label}</span>
          </label>
        ))}
      </div>

      <div className={s.sliderRow}>
        <label>
          <span>{buffer ? 'Нөлөөллийн бүсийн радиус' : perPerson ? 'Нэг оршин суугчид ногдох ногоон' : 'Талбайд ногоон эзлэх хувь'}</span>
          <span className="val">
            {buffer ? `${green.radius} м` : perPerson ? `${green.perPerson.toFixed(1)} м²` : `${green.share}%`}
          </span>
        </label>

        {/* ⚠️ Радиус нь ТОГТСОН шатлалтай (гулсуур БИШ): 100 м-ээс дээш бүх утга
            100% өгдөг тул тасралтгүй гулсуурын дийлэнх нь үхмэл байв. */}
        {buffer ? (
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            {GREEN_RADII.map((v) => {
              const on = green.radius === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGreen({ ...green, radius: v })}
                  style={{
                    flex: 1, padding: '4px 0', fontSize: 11, borderRadius: 6,
                    border: `1px solid ${on ? CHART : 'var(--line)'}`,
                    background: on ? 'var(--panel-2)' : 'transparent',
                    color: 'var(--text)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            type="range"
            min={perPerson ? 2 : 5}
            max={perPerson ? 20 : 60}
            step={perPerson ? 0.5 : 1}
            value={perPerson ? green.perPerson : green.share}
            aria-label="Ногоон байгууламжийн коэффициент"
            onChange={(e) => {
              const v = Number(e.target.value);
              setGreen(perPerson ? { ...green, perPerson: v } : { ...green, share: v });
            }}
          />
        )}
      </div>

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: CHART }}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>{buffer ? 'Ногоон байгууламжийн хүртээмж' : 'Хэрэгцээ хангасан хувь'}</b>
          <span>
            {buffer ? 'Хамрагдсан' : 'Байгаа'} <b>{nf(haveNeeded)}</b> ·{' '}
            {buffer ? 'нийт' : 'шаардлагатай'} <b>{nf(need)}</b> {unit}
          </span>
        </div>
      </div>

      <div className={s.parkBar} title={buffer
        ? 'Ногоон байгууламжийн нөлөөллийн бүсэд хамрагдсан оршин суугчийн эзлэх хувь'
        : 'Байгаа ногоон байгууламж нийт хэрэгцээний хэдэн хувийг хангаж байгааг харуулна'}>
        <span style={{ width: `${pct == null ? 0 : clamp(pct, 0, 100)}%`, background: CHART }} />
      </div>
      <div className={s.parkScale}><span>0%</span><span>Норм 100%</span></div>

      {/* ⚠️ БҮТЭН гинж — дээрх хувь хаанаас гарсныг мөр мөрөөр нь харуулна */}
      <Formula>
        {buffer ? 'Нийт' : 'Хэрэгцээ'} = {needExpr} = <b>{nf(need)}</b> {unit}<br />
        {buffer ? `Хамрагдсан (${green.radius} м дотор)` : 'Байгаа'} = <b>{nf(haveNeeded)}</b> {unit}<br />
        Хангалт = {nf(haveNeeded)} ÷ {nf(need)} × 100 = <b>{pct == null ? '—' : `${Math.round(pct)}%`}</b>
      </Formula>

      <div className={s.finSummary}>
        <div>
          <span>Ногоон эзлэх хувь (төсөл)</span>
          {/* ⚠️ Энэ нь ХАНГАМЖААС тусдаа тоо: нийт газарт ногоон хэдэн хувийг
              эзэлж байгааг заана («30% ногоон уу?» гэсэн асуултын шууд хариу). */}
          <b>{sharePct == null ? '—' : `${nf(sharePct, 1)}%`}</b>
        </div>
        <div>
          <span>Ногоон / нийт талбай</span>
          <b>{nf(haveAll / 10_000, 1)} / {nf(landM2 / 10_000, 1)} га</b>
        </div>
        <div>
          <span>{buffer ? 'Хамрагдаагүй' : gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
          <b>{buffer ? nf(need - haveNeeded) : `${gap >= 0 ? '+' : '−'}${nf(Math.abs(gap))}`} {unit}</b>
        </div>
        <div><span>Дутагдалтай бүс</span><b>{short}</b></div>
      </div>
    </div>
  );
}

/* ══════════════════ Байршил ══════════════════ */

/** Зориулалтын бүлгийн өнгө — «Барилгын ангилал» картын палитртай НЭГ эх сурвалж */
const groupColor = (g: string) =>
  BUILDING_PURPOSES.find((x) => x.key === g)?.color ?? BUILDING_PURPOSE_OTHER.color;

/**
 * БАЙРШЛЫН ШИНЖИЛГЭЭ — газрын зурагтай ХОЁР ТАЛЫН холбоотой.
 *
 * Газрын зураг дээрх барилга дээр дарахад тухайн барилгын ХӨРШИЙН зураг гарна:
 * радиус тус бүрд хэдэн барилга байгаа, тэдгээр нь ямар зориулалттай, хэдэн
 * метрийн зайд байгаа.
 *
 * ⚠️ Зайг УРЬДЧИЛАН бодоогүй (`LocationPt` тайлбарыг үз): сонгосон барилгаас
 * бусад руу 368 тооцоо л явна — сонголт бүрд шинэчлэгдэнэ.
 *
 * ⚠️ «Өдрийн урсгал» нь тээврийн загварын оргил цагийн ХҮН-ЗОРЧИЛТ: орон сууц
 * үүсгэнэ, сургууль/оффис/үйлчилгээ татна. Оршин суугчийн тоо нь «хэн энд
 * амьдардаг», зорчилт нь «энд хэдэн хүн хөдөлж байна» — бизнесийн байршилд
 * сүүлийнх нь чухал.
 */
export function Location({ pts, sel, onSel, radius, setRadius, publicOnly, setPublicOnly }: {
  pts: LocationPt[];
  /** Сонгосон барилгын OBJECTID (газрын зургаас эсвэл жагсаалтаас) */
  sel: number | null;
  onSel: (oid: number | null) => void;
  radius: number;
  setRadius: (r: number) => void;
  /** ЗӨВХӨН олон нийтийн бүсийн барилгыг зурагт ба шинжилгээнд үлдээх */
  publicOnly: boolean;
  setPublicOnly: (v: boolean) => void;
}) {
  const me = sel == null ? null : pts.find((p) => p.oid === sel) ?? null;

  /** Сонгосон барилгаас бусад руу — зайгаар эрэмбэлсэн */
  const near = me
    ? pts
      .filter((p) => p.oid !== me.oid)
      .map((p) => ({ p, d: Math.hypot(p.x - me.x, p.y - me.y) }))
      .sort((a, b) => a.d - b.d)
    : [];

  /* ⚠️ Чагт нь ХОЁУЛАНГ нь хумина: газрын зургийн барилга БА энэ картын
     хөршийн жагсаалт. Эс бөгөөс зурагт үл харагдах барилга жагсаалтад гарч,
     дарахад «хаана байна?» гэсэн асуулт төрнө. */
  const check = (
    <label className={s.chk} style={{ marginBottom: 4 }}>
      <input
        type="checkbox"
        checked={publicOnly}
        onChange={(e) => setPublicOnly(e.target.checked)}
      />
      <span>Улаан бүсийн барилга</span>
    </label>
  );

  if (!pts.length) {
    return (
      <div className={s.plain}>
        {check}
        <p className={`${s.muted} ${s.small}`}>Барилгын өгөгдөл алга</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className={s.plain}>{check}</div>
    );
  }

  const within = (r: number) => near.filter((x) => x.d <= r);
  const list = within(radius);
  const flow = list.reduce((a, x) => a + x.p.trips, 0);
  const rivals = list.filter((x) => x.p.group === me.group).length;

  return (
    <div className={s.plain}>
      {check}
      {/**
        * СОНГОСОН БАРИЛГА — толгойд нь «ЮУ сонгосон» гэдэг л байна.
        *
        * ⚠️ Урьд нь энд «210 м» гэсэн том тоо байсан бөгөөд утга нь гурав дахь
        * мөрөнд («хамгийн ойрын барилга хүртэл») нуугдаж, юуны тоо болох нь
        * ойлгомжгүй байв. Зайг доорх нүд рүү шошготой нь хамт зөөв.
        */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        marginTop: 2, marginBottom: 9,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>
            {me.purpose || 'Тодорхойгүй'}
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>
            {me.zone ?? '—'} · барилга #{me.oid}
            {me.pop > 0 ? ` · ${nf(me.pop)} оршин суугч` : ''}
            {me.trips > 0 ? ` · ${nf(me.trips)} зорчилт/ц` : ''}
          </div>
        </div>
        <button type="button" className={s.mini} onClick={() => onSel(null)}>
          Цуцлах
        </button>
      </div>

      {/* Радиусын задаргаа — дарж дэлгэрэнгүйг сольно */}
      <div className={s.subLabel} style={{ marginTop: 11 }}>Эргэн тойрны барилга</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {LOCATION_RADII.map((v) => {
          const on = radius === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => setRadius(v)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6,
                border: `1px solid ${on ? CHART : 'var(--line)'}`,
                background: on ? 'var(--panel-2)' : 'transparent',
                color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{within(v).length}</div>
              <div style={{ fontSize: 9.5, opacity: 0.75 }}>{v} м</div>
            </button>
          );
        })}
      </div>

      <div className={s.finSummary} style={{ marginTop: 9 }}>
        {/* ⚠️ Зай нь ЭНД, шошготойгоо хамт — толгойн «том тоо» байхдаа юуны
            тоо болох нь ойлгомжгүй байв. */}
        <div>
          <span>Хамгийн ойр барилга</span>
          <b>{near.length ? `${Math.round(near[0].d)} м` : '—'}</b>
        </div>
        <div><span>Өдрийн урсгал</span><b>{nf(flow)} /ц</b></div>
        <div><span>Ижил зориулалт</span><b>{rivals}</b></div>
        <div><span>{radius} м доторх</span><b>{list.length} барилга</b></div>
      </div>

      {/* Дэлгэрэнгүй жагсаалт — зай + зориулалт */}
      <div className={s.subLabel} style={{ marginTop: 11 }}>
        {radius} м доторх {list.length} барилга
      </div>
      <div className={`${s.econChart} ${s.pchart}`}>
        {list.length === 0 && (
          <p className={`${s.muted} ${s.small}`}>Энэ зайд өөр барилга алга</p>
        )}
        {list.map((x) => (
          <button
            key={x.p.oid}
            type="button"
            className={s.econRow}
            title="Дарвал энэ барилга руу шилжинэ"
            onClick={() => onSel(x.p.oid)}
          >
            <div className={s.econRowTop}>
              <i style={{ background: groupColor(x.p.group) }} />
              <span className="nm">{x.p.purpose || 'Тодорхойгүй'}</span>
              <b>{Math.round(x.d)} м</b>
            </div>
            <div className={s.econMeta}>
              {x.p.zone ?? '—'}
              {x.p.pop > 0 ? ` · ${nf(x.p.pop)} оршин суугч` : ''}
              {x.p.trips > 0 ? ` · ${nf(x.p.trips)} зорчилт/ц` : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

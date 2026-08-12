'use client';

import {
  CATEGORIES, DENSITY_BY_TYPE, PARKING_SOURCES, GREEN_SOURCES,
  type Indicator, type ParkingOpt, type ParkingSource, type CategoryKey,
  type GreenOpt, type GreenSource,
} from '@/lib/analysis/config';
import { scoreColor, scoreIndicator, clamp } from '@/lib/analysis/score';
import { Donut } from '@/components/ui';
import { shade } from '@/lib/format';
import { nf, normLine } from './format';
import type { Row } from './model';
import s from '../suitability.module.css';

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
  rows, parking, setParking, indicators,
}: {
  rows: Row[];
  parking: ParkingOpt;
  setParking: (p: ParkingOpt) => void;
  indicators: Indicator[];
}) {
  const supply = rows.reduce((a, r) => a + r.parkingSupply, 0);
  const need = rows.reduce((a, r) => a + (r.parkingNeed ?? 0), 0);
  const il = rows.reduce((a, r) => a + r.etIl, 0);
  const dald = rows.reduce((a, r) => a + r.etDald, 0);
  const gap = supply - need;
  const withNeed = rows.filter((r) => r.parkingGap != null);
  const short = withNeed.filter((r) => (r.parkingGap ?? 0) < 0).length;
  const pct = need > 0 ? (supply / need) * 100 : null;

  // Хангалтын өнгө нь газрын зураг, оноололтой ижил шатлалаас гарна
  const parkInd = indicators.find((i) => i.id === 'parking')!;
  const col = scoreColor(scoreIndicator(pct, parkInd));

  const hh = rows.reduce((a, r) => a + r.households, 0);
  const pop = rows.reduce((a, r) => a + r.population, 0);
  const formula = parking.source === 'households'
    ? `${nf(hh)} өрх × ${parking.perHousehold.toFixed(2)} зогсоол = <b>${nf(hh * parking.perHousehold)}</b>`
    : parking.source === 'population'
      ? `${nf(pop)} хүн × ${parking.per1000} ÷ 1000 = <b>${nf((pop * parking.per1000) / 1000)}</b>`
      : 'Бүх бүсийн <b>нормд заасан зогсоолын тоо</b>-ны нийлбэр';

  return (
    <>
      <p className={`${s.muted} ${s.small}`}>
        <b>Байгаа зогсоол</b> = Ерөнхий төлөвлөгөөнд батлагдсан нийт авто зогсоол — ил ба далд зогсоолын нийлбэр.
        <b> Шаардлагатай зогсоол</b>-ыг доорх гурван аргын аль нэгээр тооцож, хоёуланг нь харьцуулна.
      </p>

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
        <div className={s.parkPct} style={{ color: col }}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>Хэрэгцээ хангасан хувь</b>
          <span>Байгаа <b>{nf(supply)}</b> · шаардлагатай <b>{nf(need)}</b> зогсоол</span>
        </div>
      </div>

      <div className={s.parkBar} title="Байгаа зогсоол нийт хэрэгцээний хэдэн хувийг хангаж байгааг харуулна">
        <span style={{ width: `${pct == null ? 0 : clamp(pct, 0, 100)}%`, background: col }} />
      </div>
      <div className={s.parkScale}><span>0%</span><span>Норм 100%</span></div>

      <div className={s.parkFormula}>
        Хэрэгцээ: <span dangerouslySetInnerHTML={{ __html: formula }} />
      </div>

      <div className={s.finSummary}>
        <div><span>Ил болон далд зогсоол</span><b>{nf(il)} / {nf(dald)}</b></div>
        <div>
          <span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
          <b className={gap >= 0 ? s.pos : s.neg}>{gap >= 0 ? '+' : '−'}{nf(Math.abs(gap))}</b>
        </div>
        <div><span>Дутагдалтай бүс</span><b className={short ? s.neg : s.pos}>{short} / {withNeed.length}</b></div>
        <div><span>Хангалттай бүс</span><b className={s.pos}>{withNeed.length - short} / {withNeed.length}</b></div>
      </div>
    </>
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
  rows, green, setGreen, indicators,
}: {
  rows: Row[];
  green: GreenOpt;
  setGreen: (g: GreenOpt) => void;
  indicators: Indicator[];
}) {
  const perPerson = green.source === 'perPerson';

  /** Бүс бүрийн байгаа ба шаардлагатай ногоон (м²). Хэрэгцээгүй бол `null`. */
  const per = rows.map((r) => {
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

  // Хангалтын өнгө нь газрын зураг, оноололтой ижил шатлалаас гарна
  const greenInd = indicators.find((i) => i.id === 'green')!;
  const col = scoreColor(scoreIndicator(pct, { ...greenInd, mode: 'higher', hardMin: 0, target: 100 }));

  const pop = rows.reduce((a, r) => a + r.residentPop, 0);
  const formula = perPerson
    ? `${nf(pop)} оршин суугч × ${green.perPerson} м² = <b>${nf(need)} м²</b>`
    : `${nf(landM2 / 10_000, 1)} га × ${green.share}% = <b>${nf(need)} м²</b>`;

  return (
    <>
      <p className={`${s.muted} ${s.small}`}>
        <b>Байгаа ногоон</b> = бүсийн полигоноор тайрсан ногоон байгууламжийн талбай.
        <b> Шаардлагатай ногоон</b>-ыг доорх хоёр аргын аль нэгээр тооцож, хоёуланг нь харьцуулна.
      </p>

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
          <span>{perPerson ? 'Нэг оршин суугчид ногдох ногоон' : 'Талбайд ногоон эзлэх хувь'}</span>
          <span className="val">{perPerson ? `${green.perPerson.toFixed(1)} м²` : `${green.share}%`}</span>
        </label>
        <input
          type="range"
          min={perPerson ? 2 : 5}
          max={perPerson ? 20 : 60}
          step={perPerson ? 0.5 : 1}
          value={perPerson ? green.perPerson : green.share}
          aria-label="Ногоон байгууламжийн коэффициент"
          onChange={(e) => setGreen(perPerson
            ? { ...green, perPerson: Number(e.target.value) }
            : { ...green, share: Number(e.target.value) })}
        />
      </div>

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: col }}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>Хэрэгцээ хангасан хувь</b>
          <span>Байгаа <b>{nf(haveNeeded)}</b> · шаардлагатай <b>{nf(need)}</b> м²</span>
        </div>
      </div>

      <div className={s.parkBar} title="Байгаа ногоон байгууламж нийт хэрэгцээний хэдэн хувийг хангаж байгааг харуулна">
        <span style={{ width: `${pct == null ? 0 : clamp(pct, 0, 100)}%`, background: col }} />
      </div>
      <div className={s.parkScale}><span>0%</span><span>Норм 100%</span></div>

      <div className={s.parkFormula}>
        Хэрэгцээ: <span dangerouslySetInnerHTML={{ __html: formula }} />
      </div>

      <div className={s.finSummary}>
        <div>
          <span>Ногоон эзлэх хувь (төсөл)</span>
          {/* ⚠️ Энэ нь ХАНГАМЖААС тусдаа тоо: нийт газарт ногоон хэдэн хувийг
              эзэлж байгааг заана («30% ногоон уу?» гэсэн асуултын шууд хариу). */}
          <b style={{ color: scoreColor(sharePct == null ? null
            : clamp((sharePct / green.share) * 100, 0, 100)) }}>
            {sharePct == null ? '—' : `${nf(sharePct, 1)}%`}
          </b>
        </div>
        <div>
          <span>Ногоон / нийт талбай</span>
          <b>{nf(haveAll / 10_000, 1)} / {nf(landM2 / 10_000, 1)} га</b>
        </div>
        <div>
          <span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
          <b className={gap >= 0 ? s.pos : s.neg}>{gap >= 0 ? '+' : '−'}{nf(Math.abs(gap))} м²</b>
        </div>
        <div><span>Дутагдалтай бүс</span><b className={short ? s.neg : s.pos}>{short} / {withNeed.length}</b></div>
      </div>
    </>
  );
}

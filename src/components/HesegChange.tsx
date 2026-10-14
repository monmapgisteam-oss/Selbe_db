'use client';

import { t as tr } from '@/lib/i18nCore';
import { useEffect, useState } from 'react';
import { computeChange, compareChangeQuantity, CHANGE_ITEMS, type ChangeKey, type ChangeResult, type ChangeFilter, type ChangePiece, type ChangeRow, type ChangeGroup } from '@/lib/hesegChange';
import { fmtLen } from '@/lib/planOverlap';
import { num, ha } from '@/lib/format';
import s from './heseg.module.css';
import c from './hesegChange.module.css';

/**
 * «ХЭСЭГЧИЛСЭН ЕТ» → 01 ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨНИЙ ӨӨРЧЛӨЛТ — самбар (тооцоо: `lib/hesegChange.ts`).
 *
 * Мөр бүр: шинэчлэгдсэн тоо хэмжээ + хуучин ЕТ-өөс (13-р хэсэг) хэдий хэмжээгээр нэмэгдсэн/буурсан —
 * харьцуулах хүрээ нь мөр бүрт өөр (`lib/hesegChange.ts`); ногоон байгууламж — хоёр төлөвлөгөөний бүтэн талбай.
 * ДАРАХАД (хэрэглэгч: «дарахаар өмнөх ЕТ дээр идэвжих байдлаар»):
 *   · мөр → зураг дээр ЗӨВХӨН тэр ангиллын ШИНЭ давхаргууд үлдэнэ (`ChangePick.layers`,
 *     Portal §detailVisible) ба дотор нь задарна;
 *   · задлалын мөр → хуучин ба шинэ төлөвлөгөөг тухайн бүсээр бодитоор шүүнэ.
 */

export type ChangePick = {
  /** Эх давхаргын ID/шүүлт; тооцоолсон тэнхлэгийг зурагт дамжуулахгүй. */
  key: ChangeKey; layers: string[]; oldLayers: string[]; filters: ChangeFilter[]; pieces: ChangePiece[];
  sub?: string | null; geometry?: __esri.GeometryUnion;
} | null;

const rowPick = (r: ChangeRow, g?: ChangeGroup): NonNullable<ChangePick> => {
  const it = CHANGE_ITEMS.find((x) => x.key === r.key)!;
  return {
    key: r.key, layers: it.next, oldLayers: it.old ? it.now : [], filters: g?.filters ?? r.filters, pieces: g?.pieces ?? r.pieces,
    ...(g ? { sub: g.label ?? '', geometry: g.geometry ?? undefined } : {}),
  };
};

const fmt = (key: ChangeKey, v: number) => {
  const it = CHANGE_ITEMS.find((x) => x.key === key)!;
  return it.metric === 'count' ? num(v) : it.metric === 'area' ? `${ha(v, 1)} ${tr('га')}` : fmtLen(v);
};

/** Карт, хүснэгтэд ижил хэмжилтийн зөрүүг ижил тэмдэг, нэгжээр харуулна. */
const deltaText = (key: ChangeKey, value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(key, Math.abs(value))}`;
const directionText = (value: number) => value > 0 ? tr('Нэмэгдсэн') : value < 0 ? tr('Буурсан') : tr('өөрчлөлтгүй');

export function ChangePanel({ pick, setPick }: { pick: ChangePick; setPick: (p: ChangePick) => void }) {
  const [st, setSt] = useState<{ res: ChangeResult | null; err: string | null }>({ res: null, err: null });

  useEffect(() => {
    let alive = true;
    computeChange()
      .then((res) => { if (alive) setSt({ res, err: null }); })
      .catch((e: unknown) => { if (alive) setSt({ res: null, err: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, []);

  if (st.err) return <p className={s.err}>{tr('Тооцоолж чадсангүй')}: {st.err}</p>;
  if (!st.res) return <p className={s.wait}><span className={s.spin} aria-hidden />{tr('Тооцоолж байна…')}</p>;

  return (
    <>
      <ul className={s.list}>
        {CHANGE_ITEMS.map((it) => {
          const r = st.res!.rows.find((x) => x.key === it.key)!;
          /* Харьцуулалт — хуучин тал мөр бүрийн хүрээгээр, шинэ тал бүтнээрээ (`lib/hesegChange.ts`-ийн ⚠️) */
          const { delta, percent: pctD, status } = compareChangeQuantity(r);
          const cmp = delta != null;
          const d = delta ?? 0;
          const open = pick?.key === it.key;
          const showChange = it.key !== 'road' && it.key !== 'green';
          /* ⚠️ 2026-10-13: 01-д зөвхөн ШИНЭ хэсэгчилсэн ЕТ (хэрэглэгч: «шинэ хэсэгчилсэн ЕТ мэдээллийг л харуул») */
          return (
            <li key={it.key} className={`${s.item} ${open ? s.itemOn : ''}`}>
              <button
                type="button"
                className={s.itemHead}
                aria-expanded={open}
                onClick={() => setPick(open && pick?.sub === undefined ? null : rowPick(r))}
              >
                <span className={`${s.chev} ${open ? s.chevOn : ''}`} aria-hidden>▸</span>
                <span className={s.swatch} style={{ background: it.hue }} aria-hidden />
                <span className={s.name}>{it.title()}</span>
                <span className={c.measure}>{it.metric === 'len' ? tr('Тэнхлэгийн урт') : it.metric === 'area' ? tr('Талбай') : tr('Бүсийн тоо')}</span>
              </button>
              <dl className={`${c.stats} ${showChange ? '' : c.statsPair}`}>
                <div>
                  <dt>{tr('Хуучин ЕТ')}</dt>
                  <dd>{r.oldMeasurementAvailable && r.old != null ? fmt(it.key, r.old) : '—'}</dd>
                  {r.boundary?.oldIn != null && r.old != null && <BoundarySplit inside={r.boundary.oldIn} total={r.old} />}
                  {it.key === 'road' && r.old != null && <small>{tr('ArcGIS Pro-гоор бодсон лавлах тоо')}</small>}
                  {r.oldSourceComplete && !r.oldComplete && <small>{tr('Тэнхлэгийн хэсэгчилсэн тооцоо')}</small>}
                </div>
                <div>
                  <dt>{tr('Хэсэгчилсэн ЕТ')}</dt>
                  <dd>{r.nextMeasurementAvailable ? fmt(it.key, r.nextCmp) : '—'}</dd>
                  {r.boundary && r.nextMeasurementAvailable && <BoundarySplit inside={r.boundary.nextIn} total={r.nextCmp} />}
                  {r.nextSourceComplete && !r.nextComplete && <small>{tr('Тэнхлэгийн хэсэгчилсэн тооцоо')}</small>}
                </div>
                {showChange && <div>
                  <dt>{tr('Өөрчлөлт')}</dt>
                  <dd className={cmp ? d > 0 ? s.up : d < 0 ? s.down : '' : ''}>
                    {cmp ? deltaText(it.key, d) : '—'}
                  </dd>
                  {cmp && <small>{directionText(d)}{pctD != null && d !== 0 && ` · ${d > 0 ? '+' : '−'}${num(Math.abs(pctD), 1)}%`}</small>}
                  {status === 'partial' && <small>{tr('Хэсэгчилсэн хэмжилтийн зөрүү')}</small>}
                  {!cmp && <small>{it.old ? tr('Мэдээлэл дутуу') : tr('харьцуулахгүй')}</small>}
                </div>}
              </dl>
              {r.centerlineResolutionM != null && <p className={c.resolution}>{tr('Тэнхлэгийн тор: {0} м', num(r.centerlineResolutionM, 2))}</p>}
              {open && r.nextSourceComplete && r.groups.length > 0 && (
                <ul className={s.rows}>
                  {r.groups.map((g) => {
                    const on = pick?.sub === (g.label ?? '');
                    return (
                      <li key={g.label ?? '—'}>
                        <button type="button" aria-pressed={on}
                          className={`${s.itemHead} ${s.row} ${on ? s.rowOn : ''}`}
                          onClick={() => setPick(rowPick(r, on ? undefined : g))}>
                          <span className={s.rowName}>{g.label ?? tr('Бүсээс гадуур')}</span>
                          <span className={s.rowVal}>
                            {fmt(it.key, g.value)}
                            {r.next > 0 && <small> · {num((g.value / r.next) * 100, 0)}%</small>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* ХУУЧИН ЕТ-ТЭЙ ХАРЬЦУУЛАЛТ (2026-10-13, хэрэглэгч: «scroll доод ерөнхий төлөвлөгөөтэй
          харьцуулдаг хэсгийг нэм, ижил агуулгын дагуу») — дээрх мөрүүдтэй ИЖИЛ ангилал, хүрээ. */}
      <section className={s.cmp} aria-label={tr('Ерөнхий төлөвлөгөөтэй харьцуулалт')}>
        <h4 className={s.cmpTitle}>{tr('Ерөнхий төлөвлөгөөтэй харьцуулалт')}</h4>
        <p className={c.formula}>{tr('Өөрчлөлт = Хэсэгчилсэн ЕТ − Хуучин ЕТ')}</p>
        <table className={s.cmpTbl}>
          <thead>
            <tr>
              <th>{tr('Ангилал')}</th>
              <th>{tr('Хуучин ЕТ')}</th>
              <th>{tr('Хэсэгчилсэн ЕТ')}</th>
              <th>{tr('Өөрчлөлт')}</th>
            </tr>
          </thead>
          <tbody>
            {CHANGE_ITEMS.map((it) => {
              const r = st.res!.rows.find((x) => x.key === it.key)!;
              const { delta: d, percent, status } = compareChangeQuantity(r);
              const sourceCmp = r.oldSourceComplete && r.nextSourceComplete;
              const showChange = it.key !== 'road' && it.key !== 'green';
              return (
                <tr key={it.key}>
                  <th scope="row">
                    <span className={s.swatch} style={{ background: it.hue }} aria-hidden />
                    {it.title()}
                    {it.metric === 'len' && <small>{tr('Тэнхлэгийн урт')}</small>}
                    {/* Хуучин талын хүрээ — «Олон нийтийн бүс» дотор уу, бүтэн үү */}
                    {r.oldScope === 'red' && <small>{tr('Хуучин: ОНБ · шинэ: бүтэн')}</small>}
                    {r.oldScope === 'khil' && <small>{tr('Сэлбэ 1 хил дотор')}</small>}
                    {r.oldScope === 'all' && <small>{it.key === 'zone' ? tr('Бүх бүс') : tr('Бүтэн төлөвлөгөө')}</small>}
                    {r.boundary && <small>{tr('Сэлбэ 1 хилээр задалсан')}</small>}
                  </th>
                  {/* Хэмжээ + ОБЪЕКТЫН ТОО (хэрэглэгч: «тоо хэмжээний хамт харьцуулалт хий») */}
                  <td>
                    <div>{r.oldMeasurementAvailable && r.old != null ? fmt(it.key, r.old) : '—'}</div>
                    {r.boundary?.oldIn != null && r.old != null && <BoundarySplit inside={r.boundary.oldIn} total={r.old} />}
                  {it.key === 'road' && r.old != null && <small>{tr('ArcGIS Pro-гоор бодсон лавлах тоо')}</small>}
                    {r.oldSourceComplete && !r.oldComplete && <div><small>{tr('Тэнхлэгийн хэсэгчилсэн тооцоо')}</small></div>}
                    {r.oldN != null && <div><small>{tr('{0} объект', num(r.oldN))}</small></div>}
                    {r.oldLayersN != null && <div><small>{tr('{0} давхарга', num(r.oldLayersN))}</small></div>}
                    {(it.metric === 'len' || it.key === 'zone') && r.oldArea != null && <div><small>{tr('Талбай')}: {ha(r.oldArea, 2)} {tr('га')}</small></div>}
                  </td>
                  <td>
                    {r.nextSourceComplete ? <>
                      <div>{r.nextMeasurementAvailable ? fmt(it.key, r.nextCmp) : '—'}</div>
                      {r.boundary && r.nextMeasurementAvailable && <BoundarySplit inside={r.boundary.nextIn} total={r.nextCmp} />}
                      {!r.nextComplete && <div><small>{tr('Тэнхлэгийн хэсэгчилсэн тооцоо')}</small></div>}
                      <div><small>{tr('{0} объект', num(r.nextN))}</small></div>
                      <div><small>{tr('{0} давхарга', num(r.nextLayersN))}</small></div>
                      {(it.metric === 'len' || it.key === 'zone') && <div><small>{tr('Талбай')}: {ha(r.nextArea, 2)} {tr('га')}</small></div>}
                    </> : tr('Мэдээлэл дутуу')}
                  </td>
                  <td className={!showChange || d == null ? '' : d > 0 ? s.up : d < 0 ? s.down : ''}>
                    {showChange && <>
                    <div>{d == null ? it.old ? tr('Мэдээлэл дутуу') : tr('харьцуулахгүй')
                      : deltaText(it.key, d)}</div>
                    {d != null && <div><small>{directionText(d)}{percent != null && d !== 0 && ` · ${d > 0 ? '+' : '−'}${num(Math.abs(percent), 1)}%`}</small></div>}
                    {status === 'partial' && <div><small>{tr('Хэсэгчилсэн хэмжилтийн зөрүү')}</small></div>}
                    {sourceCmp && r.oldN != null && <div><small>{tr('{0} объект', `${r.nextN - r.oldN > 0 ? '+' : ''}${num(r.nextN - r.oldN)}`)}</small></div>}
                    {sourceCmp && r.oldLayersN != null && <div><small>{tr('{0} давхарга', `${r.nextLayersN - r.oldLayersN > 0 ? '+' : ''}${num(r.nextLayersN - r.oldLayersN)}`)}</small></div>}
                    {sourceCmp && (it.metric === 'len' || it.key === 'zone') && r.oldArea != null && <div><small>{r.nextArea - r.oldArea > 0 ? '+' : ''}{ha(r.nextArea - r.oldArea, 2)} {tr('га')}</small></div>}
                    </>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {st.res.failed.length > 0 && (
        <p className={s.err}>{tr('Мэдээлэл болон тооцооны анхааруулга')}: {st.res.failed.join(', ')}</p>
      )}
      <p className={s.note}>
        {tr('Самбарт замын тооцоолсон тэнхлэгийн уртыг хуучин, шинэ төлөвлөгөө болон нэмэгдсэн/буурсан хэмжээгээр харьцуулна. Газрын зурагт төлөвлөгөөний эх давхаргуудыг харьцуулна. Тэнхлэгийг бүтэн полигоноос тооцож, дараа нь хил болон бүсээр тайрна; торны нарийвчлал мөр бүрд харагдана. Автозам: хуучин ЕТ болон хэсэгчилсэн ЕТ-ийн бүтэн тэнхлэгийн урт. Дугуйн зам, явган зам: хуучин «Олон нийтийн бүс» доторх урттай шинэ төлөвлөгөөний бүтэн уртыг харьцуулна. Бүс: хуучин, шинэ бүх бүсийн тоо ба талбай. Объектын тоо, талбайг эх полигоноос тусад нь тооцно. Ногоон байгууламж: хуучин ЕТ болон хэсэгчилсэн ЕТ-ийн бүтэн талбайг харьцуулна.')}
      </p>
    </>
  );
}

/**
 * «Сэлбэ 1 хил»-ээр ЗАДАРГАА — хил дотор · хилээс гадуур (2026-10-14, хэрэглэгчийн заавар; «нийт» нь
 * дээрх гол тоо тул давтахгүй — хэрэглэгч хасуулсан).
 * ⚠️ Гадуур = нийт − дотор (тэнхлэгийг хилээр тайрсан урт; `lib/hesegChange.ts` §boundary).
 */
function BoundarySplit({ inside, total }: { inside: number; total: number }) {
  const outside = Math.max(0, total - inside);
  return (
    <small className={c.split}>
      {tr('Хил дотор {0}', fmtLen(inside))} · {tr('Хилээс гадуур {0}', fmtLen(outside))}
    </small>
  );
}

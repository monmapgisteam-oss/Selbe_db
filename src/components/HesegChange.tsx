'use client';

import { t as tr } from '@/lib/i18nCore';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { refreshEpoch, subscribeData } from '@/lib/dataBus';
import { computeChange, compareChangeQuantity, CHANGE_ITEMS, type ChangeKey, type ChangeResult, type ChangeFilter, type ChangePiece, type ChangeRow, type ChangeGroup } from '@/lib/hesegChange';
import { fmtLen } from '@/lib/planOverlap';
import { num, ha } from '@/lib/format';
import { userError } from '@/components/ui';
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
/** Тоон зөрүү — «+3» · «−2» (ASCII «-» биш) */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`;
/** Талбайн зөрүү (га) — 2026-10-19 (аудит): сөрөг тэмдэг нь ASCII «-» биш «−» (`deltaText`-тэй ижил) */
const haDelta = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${ha(Math.abs(value), 2)}`;

export function useElapsed(active: boolean): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const upd = () => setSecs(Math.round((Date.now() - t0) / 1000));
    const first = setTimeout(upd, 0);
    const id = setInterval(upd, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active]);
  return secs;
}

/** «Шинэчлэх»-ийн дараах дахин бодолтын саатал — дараалсан `invalidateAll`-ийг нэг тооцоо болгоно */
const REFRESH_DEBOUNCE_MS = 400;

export function ChangePanel({ pick, setPick }: { pick: ChangePick; setPick: (p: ChangePick) => void }) {
  const [st, setSt] = useState<{ res: ChangeResult | null; err: string | null }>({ res: null, err: null });
  const epoch = useSyncExternalStore(subscribeData, refreshEpoch, () => 0);
  const mountEpoch = useRef(epoch);
  const secs = useElapsed(!st.res && !st.err);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      computeChange()
        .then((res) => { if (alive) setSt({ res, err: null }); })
        .catch((e: unknown) => {
          console.error('[selbe] хэсэгчилсэн ЕТ — өөрчлөлт:', e);
          if (alive) setSt({ res: null, err: userError(e) });
        });
    }, epoch === mountEpoch.current ? 0 : REFRESH_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [epoch]);

  if (st.err) return <p className={s.err}>{tr('Тооцоолж чадсангүй')}: {st.err}</p>;
  if (!st.res) {
    return (
      <p className={s.wait}>
        <span className={s.spin} aria-hidden />
        {secs >= 3
          ? tr('Тооцоолж байна… {0} с — ихэвчлэн 30 секунд хүртэл үргэлжилнэ.', num(secs))
          : tr('Тооцоолж байна…')}
      </p>
    );
  }

  return (
    <>
      <ul className={s.list}>
        {CHANGE_ITEMS.map((it) => {
          const r = st.res!.rows.find((x) => x.key === it.key)!;
          /* Харьцуулалт — хуучин тал мөр бүрийн хүрээгээр, шинэ тал бүтнээрээ (`lib/hesegChange.ts`) */
          const { delta, percent: pctD } = compareChangeQuantity(r);
          const cmp = delta != null;
          const d = delta ?? 0;
          const open = pick?.key === it.key;
          const showChange = it.key !== 'green';
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
              </button>
              <dl className={`${c.stats} ${showChange ? '' : c.statsPair}`}>
                <div>
                  <dt>{tr('Хуучин ЕТ')}</dt>
                  <dd>{r.oldMeasurementAvailable && r.old != null ? fmt(it.key, r.old) : '—'}</dd>
                  {r.boundary?.oldIn != null && r.old != null && <BoundarySplit inside={r.boundary.oldIn} total={r.old} />}
                </div>
                <div>
                  <dt>{tr('Хэсэгчилсэн ЕТ')}</dt>
                  <dd>{r.nextMeasurementAvailable ? fmt(it.key, r.nextCmp) : '—'}</dd>
                  {r.boundary && r.nextMeasurementAvailable && <BoundarySplit inside={r.boundary.nextIn} total={r.nextCmp} />}
                </div>
                {showChange && <div>
                  <dt>{tr('Өөрчлөлт')}</dt>
                  <dd className={cmp ? d > 0 ? s.up : d < 0 ? s.down : '' : ''}>
                    {cmp ? deltaText(it.key, d) : '—'}
                  </dd>
                  {cmp && pctD != null && d !== 0 && <small>{`${d > 0 ? '+' : '−'}${num(Math.abs(pctD), 1)}%`}</small>}
                  {!cmp && <small>{it.old ? tr('Мэдээлэл дутуу') : tr('харьцуулахгүй')}</small>}
                </div>}
              </dl>
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
                            {r.next > 0 && <small> · {num(Math.min(100, (g.value / r.next) * 100), 0)}%</small>}
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
              const { delta: d, percent } = compareChangeQuantity(r);
              const sourceCmp = r.oldSourceComplete && r.nextSourceComplete;
          const showChange = it.key !== 'green';
              return (
                <tr key={it.key}>
                  <th scope="row">
                    <span className={s.swatch} style={{ background: it.hue }} aria-hidden />
                    {it.title()}
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
                    {r.oldN != null && <div><small>{tr('{0} объект', num(r.oldN))}</small></div>}
                    {r.oldLayersN != null && <div><small>{tr('{0} давхарга', num(r.oldLayersN))}</small></div>}
                    {(it.metric === 'len' || it.key === 'zone') && r.oldArea != null && <div><small>{tr('Талбай')}: {ha(r.oldArea, 2)} {tr('га')}</small></div>}
                  </td>
                  <td>
                    {r.nextSourceComplete ? <>
                      <div>{r.nextMeasurementAvailable ? fmt(it.key, r.nextCmp) : '—'}</div>
                      {r.boundary && r.nextMeasurementAvailable && <BoundarySplit inside={r.boundary.nextIn} total={r.nextCmp} />}
                      <div><small>{tr('{0} объект', num(r.nextN))}</small></div>
                      <div><small>{tr('{0} давхарга', num(r.nextLayersN))}</small></div>
                      {(it.metric === 'len' || it.key === 'zone') && <div><small>{tr('Талбай')}: {ha(r.nextArea, 2)} {tr('га')}</small></div>}
                    </> : tr('Мэдээлэл дутуу')}
                  </td>
                  <td className={!showChange || d == null ? '' : d > 0 ? s.up : d < 0 ? s.down : ''}>
                    {showChange && <>
                    <div>{d == null ? it.old ? tr('Мэдээлэл дутуу') : tr('харьцуулахгүй')
                      : deltaText(it.key, d)}</div>
                    {d != null && percent != null && d !== 0 && <div><small>{`${d > 0 ? '+' : '−'}${num(Math.abs(percent), 1)}%`}</small></div>}
                    {sourceCmp && r.oldN != null && <div><small>{tr('{0} объект', signed(r.nextN - r.oldN))}</small></div>}
                    {sourceCmp && r.oldLayersN != null && <div><small>{tr('{0} давхарга', signed(r.nextLayersN - r.oldLayersN))}</small></div>}
                    {sourceCmp && (it.metric === 'len' || it.key === 'zone') && r.oldArea != null && <div><small>{haDelta(r.nextArea - r.oldArea)} {tr('га')}</small></div>}
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
    </>
  );
}

/**
 * «Сэлбэ 1 хил»-ээр ЗАДАРГАА — хил дотор · хилээс гадуур (2026-10-14, хэрэглэгчийн заавар; «нийт» нь
 * дээрх гол тоо тул давтахгүй — хэрэглэгч хасуулсан).
 */
function BoundarySplit({ inside, total }: { inside: number; total: number }) {
  const outside = Math.max(0, total - inside);
  return (
    <ul className={c.split}>
      <li>{tr('Хил дотор {0}', fmtLen(inside))}</li>
      <li>{tr('Хилээс гадуур {0}', fmtLen(outside))}</li>
    </ul>
  );
}

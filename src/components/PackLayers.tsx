'use client';

/**
 * БАГЦЫН ДАВХАРГУУД — багц дарахад доор нь давхаргууд задарч, давхарга дарахад
 * доор нь түүний ӨГӨГДӨЛ задарна (2026-09-11, хэрэглэгчийн хүсэлт).
 *
 * «Багцын гүйцэтгэл» (`PkgProg`) ба «Инженерийн дэд бүтэц» (`DedButets`)
 * ХОЁУЛАА энэ бүрэлдэхүүнийг хэрэглэнэ.
 *
 * ⚠️ ЯАГААД ХУВААЛЦСАН ВЭ: эхэндээ `DedButets.tsx` дотор бичигдсэн байсан тул
 * хэрэглэгч «Багцын гүйцэтгэл» дээр дарахад юу ч задарсангүй — хоёр хуудас
 * ИЖИЛ жагсаалт харуулдаг ч код нь өөр байв. Хуулбарлавал нэгийг засахад
 * нөгөө нь хоцорно.
 *
 * ⚠️ ДАВХАРГА ЗАДЛАХ нь газрын зурагт НӨЛӨӨЛӨХГҮЙ — зөвхөн уншина. Тиймээс
 * төлөв нь ЭНД дотооддоо (`openLayer`): багц хаагдахад бүрэлдэхүүн салж,
 * төлөв өөрөө арилна — дуудагч талд цэвэрлэх код хэрэггүй.
 */

import { Fragment, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { LAYER_BY_ID, srcLineWidth, type LayerDef } from '@/lib/services';
import { useAsync } from '@/lib/useAsync';
import { num } from '@/lib/format';
import { loadLayerSummary, type LayerSummary } from '@/lib/layerSummary';
import { subscribeTotals, totalsEpoch } from '@/lib/totals';
import s from './packLayers.module.css';

export function PackLayers({
  layerIds,
  valueFor,
}: {
  layerIds: string[];
  /**
   * Мөрийн баруун талын утга (урт г.м) — өгөөгүй бол багана гарахгүй.
   * ⚠️ `valueOf` гэж НЭРЛЭЖ БОЛОХГҮЙ: `Object.prototype.valueOf`-той давхцаж,
   * проп өгөөгүй үед TS удамшсан аргыг уншиж төрлийн алдаа өгдөг (2026-09-11).
   */
  valueFor?: (id: string) => ReactNode;
}) {
  const [openLayer, setOpenLayer] = useState<string | null>(null);
  return (
    <>
      {layerIds.map((id) => {
        const L = LAYER_BY_ID[id];
        if (!L) return null;
        /* ⚠️ Нэрнээс багцын угтварыг ХАСНА: «Багц 5.1 · Дулааны өгөх» →
           «Дулааны өгөх». Эцэг мөрөнд нь аль хэдийн бичигдсэн. */
        const short = tr(L.title).replace(/^.*?\s·\s/, '');
        const open = openLayer === id;
        return (
          <Fragment key={id}>
            <button
              type="button"
              className={`${s.row} ${open ? s.on : ''}`}
              aria-expanded={open}
              onClick={() => setOpenLayer(open ? null : id)}
            >
              <span className={s.caret} aria-hidden>{open ? '▾' : '▸'}</span>
              <Swatch L={L} />
              <span className={s.name} title={tr(L.title)}>{short}</span>
              {valueFor && <span className={`${s.val} num`}>{valueFor(id)}</span>}
            </button>
            {open && <LayerFields layerId={id} />}
          </Fragment>
        );
      })}
    </>
  );
}

/** Зураасны хээ → SVG `stroke-dasharray` (ArcGIS-ийн харгалзах хэлбэр) */
const DASH: Record<NonNullable<LayerDef["dash"]>, string | undefined> = {
  solid: undefined, dash: '6 3', dot: '1.5 3', 'dash-dot': '6 3 1.5 3', 'long-dash': '10 4',
};

/**
 * ТЭМДЭГ — ArcGIS-ийн тайлбар (legend) шиг (2026-09-11, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ Өнгөт ЦЭГ бүх геометрт ижил харагддаг байсан тул «Дулааны өгөх» ба
 * «Дулааны буцах» (ижил улбар шар, нэг нь тасархай) ялгагдахгүй байв. Одоо
 * зурган дээр яг юу зурагдахыг тэмдэг өөрөө хэлнэ: шугам нь ХЭЭТЭЙГЭЭ,
 * талбай нь хүрээ+дүүргэлттэй, цэг нь маркертай.
 *
 * ⚠️ Хэмжээ нь `LayerDef`-ийн `width`/`fill`-ийг ДАГАНА — газрын зураг
 * (`MapCanvas.layerStyle`) яг эдгээр утгаар зурдаг тул тайлбар нь зурагтай
 * нэгэн адил. Тусдаа тогтмол тавивал хоёр нь салж хоцорно.
 */
export function Swatch({ L }: { L: LayerDef }) {
  if (L.geom === 'line') {
    return (
      <svg className={s.swatch} viewBox="0 0 24 10" aria-hidden>
        <line
          x1="1" y1="5" x2="23" y2="5"
          stroke={L.hue}
          /* ⚠️ Зурагтай ИЖИЛ өргөн (`srcLineWidth`) — тайлбар нь зурган дээр
             юу харагдахыг хэлэх ёстой. Эх симболгүй хуучин давхаргад
             порталын анхдагч 1.6-г хэвээр. */
          strokeWidth={L.srcSym ? srcLineWidth(L.width) : Math.max(1.5, L.width ?? 1.6)}
          strokeDasharray={DASH[L.dash ?? 'solid']}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (L.geom === 'area') {
    /* ⚠️ Хүрээ нь `stroke` (эх үйлчилгээнийх) — дүүргэлттэй ижил гэж үзвэл
       ДХТ (цэнхэр дүүргэлт, САРААЛ хүрээ) мэт давхаргууд зурагтайгаа зөрнө. */
    return (
      <svg className={s.swatch} viewBox="0 0 24 10" aria-hidden>
        <rect
          x="1.5" y="1.5" width="21" height="7"
          fill={L.hue}
          fillOpacity={L.fill ?? 0.35}
          stroke={L.stroke ?? L.hue}
          strokeWidth={1}
          strokeDasharray={DASH[L.strokeDash ?? 'solid']}
        />
      </svg>
    );
  }
  /* ⚠️ Цэг — ХЭЛБЭР нь эхийнхээрээ, ХЭМЖЭЭ нь тайлбарын доод хязгаартай:
     эх үйлчилгээнд ХТП/РП нь 1pt тул шууд авбал тэмдэг нь бараг үл үзэгдэх
     цэг болно. Зурагт ч тэднийг `scaledDot` масштабаар томруулж зурдаг. */
  const r = Math.min(4, Math.max(2.5, (L.size ?? 7) / 2));
  return (
    <svg className={s.swatch} viewBox="0 0 24 10" aria-hidden>
      {L.marker === 'square'
        ? <rect x={12 - r} y={5 - r} width={r * 2} height={r * 2} fill={L.hue} />
        : L.marker === 'diamond'
          ? <polygon points={`12,${5 - r} ${12 + r},5 12,${5 + r} ${12 - r},5`} fill={L.hue} />
          : <circle cx="12" cy="5" r={r} fill={L.hue} />}
    </svg>
  );
}

/**
 * ДАВХАРГЫН ӨГӨГДӨЛ — дэд мөр дарахад доор нь задарна.
 *
 * ⚠️ Ачаалж буй / унасан / бэлэн гурван төлөвийг ЯЛГАНА: хоосон давхарга ба
 * унасан хүсэлт нэг «юу ч алга» болж харагдвал эвдрэл анзаарагдахгүй.
 * ⚠️ Хоосон талбар «0» гэж биш «бөглөгдөөгүй» гэж тусдаа — `layerSummary.ts`.
 */
function LayerFields({ layerId }: { layerId: string }) {
  /* ⚠️ `epoch` deps-д ОРНО: кэш хаягдах нь ГАНЦААРАА хангалтгүй — `useAsync`
     нь deps өөрчлөгдөхгүй бол дахин татдаггүй тул нээлттэй самбар хуучин
     хураангуйгаа харуулсаар байна (`totals.usePlanTotals`-ийн ижил загвар). */
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const q = useAsync<LayerSummary>(() => loadLayerSummary(layerId), [layerId, epoch]);
  if (q.state === 'loading') return <div className={s.note}>{tr('Ачаалж байна…')}</div>;
  if (q.state === 'error') {
    return <div className={s.note}>{tr('Татагдсангүй: {0}', q.error.message)}</div>;
  }
  if (q.state !== 'ready') return null;
  const { total, fields, empty } = q.data;
  return (
    <div className={s.fields}>
      <div className={s.head}>{tr('{0} объект', num(total))}</div>
      {fields.map((f) => (
        <div key={f.name} className={s.field}>
          <div className={s.fieldTop}>
            <span className={s.fieldName} title={f.name}>{f.label}</span>
            <span className={`${s.fill} num`}>{num(f.filled)}/{num(total)}</span>
          </div>
          {f.num && (
            <div className={`${s.vals} num`}>
              {f.num.min === f.num.max
                ? num(f.num.min, 2)
                : `${num(f.num.min, 2)} … ${num(f.num.max, 2)}`}
              {f.num.sum != null && ` · ${tr('нийт')} ${num(f.num.sum, 0)} ${tr('м')}`}
            </div>
          )}
          {f.top && (
            <div className={s.vals}>
              {f.top.map((v) => (
                <span key={v.value} className={s.chip}>
                  {v.value} <b className="num">{num(v.count)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {empty.length > 0 && (
        <div className={s.empty}>{tr('Бөглөгдөөгүй: {0}', empty.join(', '))}</div>
      )}
    </div>
  );
}

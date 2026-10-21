'use client';

import type { Dispatch, SetStateAction } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { LayerSwatch } from './LayerSwatch';
import { LAYER_BY_ID, REFERENCE_IDS, layerUrl } from '@/lib/services';
import { webmapStyleOf } from '@/lib/webmapStyle';
import { plan2dStyleOf } from '@/lib/plan2d';
import s from './opacity.module.css';

/**
 * Override-гүй давхаргын АНХДАГЧ тунгалаг (0–1).
 * ⚠️ 2026-10-21: урьд нь гулсуур `?? 1` (100%) харуулдаг байсан ч зураг дээр давхарга эх webmap-ийн
 *    opacity-оор (жиш. 60%) явдаг — «100%» худал, «Сэргээх» ч гарахгүй. `MapCanvas`-ийн давхарга
 *    үүсгэх дүрэмтэй ЯГ ижил: план2d загвартай бол webmap-ийн opacity-г тавихгүй (1), эс бөгөөс
 *    `webmapStyleOf(styleUrl ?? layerUrl).opacity ?? 1`. Тэр дүрмийг өөрчилбөл энд ч дагуулна.
 */
function baseOpacity(id: string): number {
  const d = LAYER_BY_ID[id];
  if (!d || plan2dStyleOf(id)) return 1;
  return webmapStyleOf(d.styleUrl ?? layerUrl(d))?.opacity ?? 1;
}

/**
 * ТУНГАЛАГ — газрын зураг дээрх хөвөгч цонх. Яг одоо ИЛ байгаа давхаргуудыг
 * жагсааж, тус бүрийн тунгалаг байдлыг (0–100%) гулсуураар тохируулна.
 *
 * ⚠️ Зөвхөн каталогийн ЖИНХЭНЭ давхаргууд (`LAYER_BY_ID`) — лавлагааны хил
 * (`REFERENCE_IDS`) нь зөвхөн зураас тул тунгалагжуулах утгагүй, хасна.
 */
export function OpacityPanel({
  visible,
  opacity,
  setOpacity,
  onClose,
  dock = false,
}: {
  visible: string[];
  opacity: Record<string, number>;
  setOpacity: Dispatch<SetStateAction<Record<string, number>>>;
  onClose: () => void;
  /**
   * ЗҮҮН ХАВТАСНЫ ЗОХИОМЖ — зургийн зүүн ирмэгт, толгойн эгнээний доор
   * (2026-09-15). ⚠️ ЗӨВХӨН «Ерөнхий төлөвлөгөө»-д; бусад харагдацад
   * хавтан хуучин байрлалдаа (`MapTools`-ийн `dock` тайлбарыг үз).
   */
  dock?: boolean;
}) {
  const ref = new Set<string>(REFERENCE_IDS as readonly string[]);
  const ids = visible.filter((id) => LAYER_BY_ID[id] && !ref.has(id));

  const set = (id: string, pct: number) =>
    setOpacity((prev) => ({ ...prev, [id]: pct / 100 }));

  /** Тухайн давхаргын одоогийн хувь — override байхгүй бол давхаргын АНХДАГЧ (`baseOpacity`) */
  const pctOf = (id: string) => Math.round((opacity[id] ?? baseOpacity(id)) * 100);

  /* ⚠️ 2026-10-21: «Сэргээх» нь анхдагчаас ЗӨРСӨН override байвал — 1-тэй биш, давхаргын өөрийн анхдагчтай жишнэ */
  const touched = ids.some((id) => opacity[id] != null && opacity[id] !== baseOpacity(id));

  return (
    <aside data-report-skip="" className={`${s.panel} ${dock ? s.dock : ''} mapOpacity`} aria-label={tr('Давхаргын тунгалаг')}>
      <header className={s.head}>
        <span className={s.title}>{tr('Тунгалаг')}</span>
        {touched && (
          <button
            type="button"
            className={s.reset}
            onClick={() =>
              setOpacity((prev) => {
                const next = { ...prev };
                for (const id of ids) delete next[id];
                return next;
              })
            }
          >
            {tr('Сэргээх')}
          </button>
        )}
        <button type="button" className={s.close} onClick={onClose} aria-label={tr('Хаах')}>×</button>
      </header>

      <div className={s.body}>
        {ids.length === 0 ? (
          <p className={s.empty}>{tr('Идэвхтэй давхарга алга. Каталогоос давхарга асаана уу.')}</p>
        ) : (
          ids.map((id) => {
            const d = LAYER_BY_ID[id];
            const pct = pctOf(id);
            return (
              <div key={id} className={s.row} style={{ ['--tone' as string]: d.hue }}>
                <div className={s.rowTop}>
                  <LayerSwatch d={d} />
                  <span className={s.name}>{d.title}</span>
                  <span className={`${s.pct} num`}>{pct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  className={s.slider}
                  aria-label={tr('{0} — тунгалаг', d.title)}
                  onChange={(e) => set(id, Number(e.target.value))}
                />
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

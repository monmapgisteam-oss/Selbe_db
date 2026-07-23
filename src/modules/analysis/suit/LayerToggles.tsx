'use client';

import { MAP_LAYERS, MAP_GROUPS } from '@/lib/analysis/config';
import s from '../suitability.module.css';

/**
 * Контекст давхаргыг оноон будалт дээр НЭМЖ харуулах.
 *
 * ⚠️ Бүсийн будалт нь ЭНЭ модулийн гол мессеж тул давхаргууд түүнийг дардаггүй
 * байх ёстой: барилга 0.30 тунгалаг, шугамууд нимгэн (0.75 px).
 */
export function LayerToggles({
  layerOn, setLayerOn,
}: {
  layerOn: Record<string, boolean>;
  setLayerOn: (v: Record<string, boolean>) => void;
}) {
  const groups = Object.keys(MAP_GROUPS)
    .map((key) => ({ key, label: MAP_GROUPS[key], items: MAP_LAYERS.filter((l) => l.group === key) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={s.toggles}>
      {groups.map((g) => {
        const on = g.items.filter((l) => layerOn[l.key]).length;
        const allOff = on === 0;
        return (
          <div key={g.key}>
            <button
              type="button"
              className={s.lyrGrp}
              title={allOff ? 'Бүгдийг асаах' : 'Бүгдийг унтраах'}
              onClick={() => {
                const next = { ...layerOn };
                for (const l of g.items) next[l.key] = allOff;
                setLayerOn(next);
              }}
            >
              <span>{g.label}</span>
              <b>{on}/{g.items.length}</b>
            </button>

            {g.items.map((l) => (
              <label key={l.key} className={s.chk}>
                <input
                  type="checkbox"
                  checked={!!layerOn[l.key]}
                  onChange={() => setLayerOn({ ...layerOn, [l.key]: !layerOn[l.key] })}
                />
                <span
                  className={l.kind === 'line' ? 'swatch' : 'dot'}
                  style={{ background: `rgb(${l.color.join(',')})` }}
                />
                <span>{l.title}</span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

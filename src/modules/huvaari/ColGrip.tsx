import { t as tr } from '@/lib/i18nCore';
import h from '../huvaari.module.css';
import type { useColWidths } from './useColWidths';

type Grip = ReturnType<ReturnType<typeof useColWidths>['grip']>;

/**
 * Толгойн нүдний баруун ирмэгийн ЧИРЭХ БАРИУЛ (2026-10-08) — `useColWidths.grip(key)`.
 */
export function ColGrip({ g, label, tab = true }: { g: Grip; label: string; tab?: boolean }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={g.value}
      aria-valuemin={g.min}
      aria-valuemax={g.max}
      tabIndex={tab ? 0 : -1}
      className={`${h.colGrip}${g.on ? ` ${h.colGripOn}` : ''}`}
      title={tr('Чирж баганын өргөнийг өөрчилнө · давхар дарвал анхны өргөн')}
      onPointerDown={g.onPointerDown}
      onKeyDown={g.onKeyDown}
      onKeyUp={g.onKeyUp}
      onBlur={g.onBlur}
      onDoubleClick={g.onDoubleClick}
    />
  );
}

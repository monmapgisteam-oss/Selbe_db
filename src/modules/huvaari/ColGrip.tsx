import { t as tr } from '@/lib/i18nCore';
import h from '../huvaari.module.css';
import type { useColWidths } from './useColWidths';

type Grip = ReturnType<ReturnType<typeof useColWidths>['grip']>;

/**
 * Толгойн нүдний баруун ирмэгийн ЧИРЭХ БАРИУЛ (2026-10-08) — `useColWidths.grip(key)`.
 * ⚠️ Толгойн нүд `position: relative` байх ёстой (`.gHeadDes` г.м., CSS-д тавьсан).
 * ⚠️ `onPointerDown` нь `stopPropagation` хийдэг — толгой дээрх бусад товшилтын логикт хүрэхгүй.
 */
export function ColGrip({ g, label }: { g: Grip; label: string }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={g.value}
      tabIndex={0}
      className={`${h.colGrip}${g.on ? ` ${h.colGripOn}` : ''}`}
      title={tr('Чирж баганын өргөнийг өөрчилнө · давхар дарвал анхны өргөн')}
      onPointerDown={g.onPointerDown}
      onKeyDown={g.onKeyDown}
      onDoubleClick={g.onDoubleClick}
    />
  );
}

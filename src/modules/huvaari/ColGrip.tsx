import { t as tr } from '@/lib/i18nCore';
import h from '../huvaari.module.css';
import type { useColWidths } from './useColWidths';

type Grip = ReturnType<ReturnType<typeof useColWidths>['grip']>;

/**
 * Толгойн нүдний баруун ирмэгийн ЧИРЭХ БАРИУЛ (2026-10-08) — `useColWidths.grip(key)`.
 * ⚠️ Толгойн нүд `position: relative` байх ёстой (`.gHeadDes` г.м., CSS-д тавьсан).
 * ⚠️ `onPointerDown` нь `stopPropagation` хийдэг — толгой дээрх бусад товшилтын логикт хүрэхгүй.
 * ⚠️ 2026-10-09 (a11y): `aria-valuemin/max` (`useColWidths.SPEC`) нэмэв; шошго багана бүрд ӨӨР
 *    (дуудагч баганын нэрээр). Нэг хувьсагчтай давтагдах баганууд (огноо ×4–6 · хоног ×2 · нөөц ×2)
 *    нэг өргөнийг хуваалцдаг тул ЗӨВХӨН эхнийх нь Tab-ын дараалалд (`tab`); бусад нь хулганаар л —
 *    урьд нь нэг өргөнийг 10 удаа Tab-аар дайрч гардаг байв.
 * ⚠️ 2026-10-08: багана бүр ТУСДАА өргөнтэй болсон (`useColWidths`-ийн ⚠️) тул бүх бариул Tab-д;
 *    `tab` нь сонголт хэвээр (анхдагч `true`).
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
      onDoubleClick={g.onDoubleClick}
    />
  );
}

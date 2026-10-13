import type { OverlapCat, OverlapSide } from './planOverlap';

export type OverlapFocus = { side: OverlapSide; type?: string; layer?: string; cat?: OverlapCat; zone?: string } | null;
type OverlapItem = { type: string; layer: string; cat?: OverlapCat; cats?: readonly string[]; zone?: string };

export const matchesOverlapFocus = (focus: OverlapFocus, side: OverlapSide, item: OverlapItem) =>
  !!focus && focus.side === side
  && (!focus.type || focus.type === item.type)
  && (!focus.layer || focus.layer === item.layer)
  && (!focus.cat || focus.cat === item.cat || !!item.cats?.includes(focus.cat))
  && (!focus.zone || focus.zone === item.zone);

/** Бүсийн сонголт эрэмбийг өөрчлөхгүй — ангилал/давхаргын хүрээг тусад нь авна. */
export const overlapScopeFocus = (focus: OverlapFocus): OverlapFocus => focus
  ? { side: focus.side, type: focus.type, layer: focus.layer, cat: focus.cat } : null;

/** Тогтмол сонголт идэвхтэй ангиллыг нарийсгана; hover харагдах хүрээг тэлэхгүй. */
export function visibleOverlapItems<T extends OverlapItem>(
  items: readonly T[], side: OverlapSide, shown: readonly OverlapCat[], selected: OverlapFocus,
): T[] {
  return items.filter((item) => (item.cat ? shown.includes(item.cat) : item.cats?.some((cat) => shown.includes(cat as OverlapCat)))
    && (!selected || matchesOverlapFocus(selected, side, item)));
}

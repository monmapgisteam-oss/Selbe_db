/**
 * НҮҮРИЙН УДИРДЛАГЫН САМБАР (KPI) ХЭНД ХАРАГДАХ ВЭ — 2026-10-22 (аудит).
 */
import { VIEWS, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS } from './caps';

/**
 * @param role 2026-10-23: «Ерөнхий захирал» (`zahiral`) — удирдлагын самбар ҮРГЭЛЖ (загвар нь харагдацыг хумьсан ч);
 *   самбар зөвхөн уншина. `roleOf` нь remote уншигдаагүй бол override үүргийг үл тооцно (fail-closed).
 */
/** Шинэ хуудас — хадгалсан жагсаалтад байхгүй ч удирдлагын самбар хаагдахгүй (2026-11-04) */
const BOARD_OPTIONAL: readonly ViewKey[] = ['gazarOgnoo', 'zahiramj', 'songon', 'zovshoorolTtb', 'ashiglalt'];

export function boardAllowedFor(allowed: 'all' | readonly ViewKey[], isSuper: boolean, role: Role | null = null): boolean {
  if (isSuper || allowed === 'all' || role === 'zahiral') return true;
  return VIEWS.every((v) => WORKFLOW_VIEWS.includes(v.key) || BOARD_OPTIONAL.includes(v.key) || allowed.includes(v.key));
}

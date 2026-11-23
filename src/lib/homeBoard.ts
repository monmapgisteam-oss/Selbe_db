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
/* 2026-11-23: «ipc» — «Санхүүжилт»-ээс салсан цэс; «finance»-тэй хүн автоматаар харна (`permissions.resolveAccess`) */
const BOARD_OPTIONAL: readonly ViewKey[] = ['zahiramj', 'songon', 'zovshoorolTtb', 'ashiglalt', 'hyanaltHugatsaa', 'ipc', 'dulaan'];

/**
 * @param authOff нэвтрэлт унтраалттай (локал dev). 2026-11-20: админ (super) энд үл хамаарна — бусдын адил харагдацаар.
 */
export function boardAllowedFor(allowed: 'all' | readonly ViewKey[], authOff: boolean, role: Role | null = null): boolean {
  if (authOff || allowed === 'all' || role === 'zahiral') return true;
  return VIEWS.every((v) => WORKFLOW_VIEWS.includes(v.key) || BOARD_OPTIONAL.includes(v.key) || allowed.includes(v.key));
}

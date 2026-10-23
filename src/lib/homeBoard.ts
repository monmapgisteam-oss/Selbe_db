/**
 * НҮҮРИЙН УДИРДЛАГЫН САМБАР (KPI) ХЭНД ХАРАГДАХ ВЭ — ⚠️ 2026-10-22 (аудит).
 *
 * ⚠️ ЯАГААД: `Root` самбарыг `isSuper || allowed === 'all'`-д нээдэг байв (2026-09-15: «бүх харагдац» эрхтэй удирдлагад).
 *    Гэтэл 2026-10-01-ээс `permissions.resolveAccess` super-ээс бусдад `'all'` ХЭЗЭЭ Ч буцаадаггүй (урсгалтай 6 харагдац
 *    зөвхөн хуваарилалтаас — `workflowViewsOf`, хадгалсан `'all'` ч жагсаалт болж задарна) тул super биш удирдлага
 *    (Төлөвлөлтийн ахлах инженер · Хэлтсийн дарга · Газрын дарга) самбарыг ХЭЗЭЭ Ч хардаггүй болсон.
 *    Анхны санааг сэргээнэ: урсгалтай БУС бүх харагдацтай хүн = «бүх харагдац» эрхтэй удирдлага. Урсгалтай хуудас
 *    (Гүйцэтгэл · Хуваарь · QAQC …) нь хуваарилалтын асуудал — удирдлагын ХАРАХ эрхийн шалгуурт орохгүй.
 * ⚠️ Самбар зөвхөн УНШИНА (бичих үйлдэлгүй); админ товч `isSuper`-ээр хаалттай хэвээр (`Home`).
 * ⚠️ Цэвэр функц — `homeBoard.check.mjs` шалгана.
 */
import { VIEWS, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS } from './caps';

/**
 * @param role ⚠️ 2026-10-23: «Ерөнхий захирал» (`zahiral`) — удирдлагын самбар ҮРГЭЛЖ (загвар нь харагдацыг хумьсан ч);
 *   самбар зөвхөн уншина. `roleOf` нь remote уншигдаагүй бол override үүргийг үл тооцно (fail-closed).
 */
export function boardAllowedFor(allowed: 'all' | readonly ViewKey[], isSuper: boolean, role: Role | null = null): boolean {
  if (isSuper || allowed === 'all' || role === 'zahiral') return true;
  return VIEWS.every((v) => WORKFLOW_VIEWS.includes(v.key) || allowed.includes(v.key));
}

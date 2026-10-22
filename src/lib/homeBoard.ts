/**
 * НҮҮРИЙН УДИРДЛАГЫН САМБАР (KPI) ХЭНД ХАРАГДАХ ВЭ — ⚠️ 2026-10-22 (аудит).
 *
 * ⚠️ ЯАГААД: `Root` самбарыг `isSuper || allowed === 'all'`-д нээдэг байв (2026-09-15: «бүх харагдац» эрхтэй удирдлагад).
 *    Гэтэл 2026-10-01-ээс `permissions.resolveAccess` super-ээс бусдад `'all'` ХЭЗЭЭ Ч буцаадаггүй (урсгалтай 6 харагдац
 *    зөвхөн хуваарилалтаас — `workflowViewsOf`, хадгалсан `'all'` ч жагсаалт болж задарна) тул super биш удирдлага
 *    (Ерөнхий менежер · Хэлтсийн дарга · Газрын дарга) самбарыг ХЭЗЭЭ Ч хардаггүй болсон.
 *    Анхны санааг сэргээнэ: урсгалтай БУС бүх харагдацтай хүн = «бүх харагдац» эрхтэй удирдлага. Урсгалтай хуудас
 *    (Гүйцэтгэл · Хуваарь · QAQC …) нь хуваарилалтын асуудал — удирдлагын ХАРАХ эрхийн шалгуурт орохгүй.
 * ⚠️ Самбар зөвхөн УНШИНА (бичих үйлдэлгүй); админ товч `isSuper`-ээр хаалттай хэвээр (`Home`).
 * ⚠️ Цэвэр функц — `homeBoard.check.mjs` шалгана.
 */
import { VIEWS, type ViewKey } from './services';
import { WORKFLOW_VIEWS } from './caps';

export function boardAllowedFor(allowed: 'all' | readonly ViewKey[], isSuper: boolean): boolean {
  if (isSuper || allowed === 'all') return true;
  return VIEWS.every((v) => WORKFLOW_VIEWS.includes(v.key) || allowed.includes(v.key));
}

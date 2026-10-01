/**
 * УРСГАЛТАЙ 6 ХАРАГДАЦЫН ЭХ СУРВАЛЖ — «энэ хуудас ЯАГААД нээлттэй/хаалттай вэ» (2026-10-01).
 *
 * ⚠️ ЯАГААД («хэрэглэгч: бүгдийг зас»): урсгалтай 6 харагдац (Гүйцэтгэл · Хуваарь · Хуваарь
 *    батлах · Нэмэлт ажил батлах · Чанарын баримт · Чанар (QAQC)) ЗӨВХӨН хуваарилалтаар нээгддэг
 *    болсон (`permissions.workflowViewsOf`). Хэрэглэгчийн карт тэднийг унтраалгагүй, ЗӨВХӨН
 *    ХАРУУЛАХ мөрөөр — «Хуваарийн эрх · Зохиогч · Багц 3.1» гэх мэт эх сурвалж ба тэр хуудас руу
 *    холбоостой — харуулна. Эх сурвалжийн дүрэм энд НЭГ газар (UI-д давтахгүй).
 *
 * ⚠️ `resolveAccess`-ТЭЙ ИЖИЛ ДҮРЭМ: харагдац нээлттэй ⇔ (а) урсгалын томилгоо (Гүйцэтгэл), эсвэл
 *    (б) эрх нь ОЛГОГДСОН (`granted`) хуваарилалт / шууд олголт. Хуваарилалт бий атлаа эрх нь
 *    алга (`granted: false`, `erhOverview.missingCaps`) бол хуудас ХААЛТТАЙ — картын «Дахин олгох».
 *
 * ⚠️ ЦЭВЭР МОДУЛЬ: `UserErh` (`erhOverview.userErh`)-ээс тооцно — localStorage, React хамааралгүй.
 */

import { CAP_HOST_VIEW, WORKFLOW_VIEWS, type CapKey } from './caps';
import { QAQC_CAP, ROLE_CAPS, SCOPED_SYSTEMS, type ScopedSys } from './aclRoleCaps';
import type { UserErh } from './erhOverview';
import type { ViewKey } from './services';

/** Нэг эх сурвалж */
export type WfSource = {
  /**
   * `flow` — урсгалын томилгоо · `qaqc` · үүрэгтэй тав — хуваарилалт ·
   * `cap` — хуваарилалтгүй ШУУД олгосон эрх (хатуу super-ийн шууд олголт / өнчин эрх)
   */
  sys: 'flow' | 'qaqc' | ScopedSys | 'cap';
  /** Урсгалд — шат; үүрэгтэй системд — үүрэг; `qaqc`-д — ''; `cap`-д — эрхийн түлхүүр */
  role: string;
  /** Багцууд — `null` = бүх багц; `cap`-д `null` (хязгааргүй) */
  bagts: string[] | null;
  /** Харагдацыг нээх эрх — урсгалд `null` (томилгоо өөрөө нээнэ) */
  cap: CapKey | null;
  /** Эрх нь олгогдсон (урсгалд үргэлж `true`) — `false` бол «Дахин олгох» */
  granted: boolean;
  /** Урсгалын «Зөвхөн харна» */
  viewOnly?: boolean;
};

export type WfRow = {
  view: ViewKey;
  sources: WfSource[];
  /** `resolveAccess`-ийн дүрмээр нээлттэй эсэх (super-т үргэлж) */
  open: boolean;
};

const hosts = (cap: CapKey): ViewKey[] => CAP_HOST_VIEW[cap].filter((v) => WORKFLOW_VIEWS.includes(v));

/**
 * Хэрэглэгчийн урсгалтай 6 харагдац тус бүрийн эх сурвалж — `WORKFLOW_VIEWS`-ийн дарааллаар.
 * ⚠️ Нэг эрх ОЛОН харагдац нээнэ (`planApprove` → Хуваарь батлах + Хуваарь) — эх сурвалж хоёуланд.
 * ⚠️ Хуваарилалтаас гараагүй эрх (`cap`) — хуваарилалтаар тайлбарлагдаагүй үлдсэн эрх л.
 */
export function workflowRows(u: UserErh): WfRow[] {
  const by = new Map<ViewKey, WfSource[]>(WORKFLOW_VIEWS.map((v) => [v, []]));
  const push = (v: ViewKey, s: WfSource) => by.get(v)?.push(s);
  /** Хуваарилалтаар тайлбарлагдсан эрхүүд */
  const explained = new Set<CapKey>();

  if (u.flow) {
    push('guitsetgel', {
      sys: 'flow', role: u.flow.stage, bagts: u.flow.bagts, cap: null, granted: true,
      ...(u.flow.viewOnly ? { viewOnly: true } : {}),
    });
  }
  if (u.qaqcAssigned) {
    explained.add(QAQC_CAP);
    const granted = u.caps.includes(QAQC_CAP);
    for (const v of hosts(QAQC_CAP)) push(v, { sys: 'qaqc', role: '', bagts: u.qaqc, cap: QAQC_CAP, granted });
  }
  for (const sys of SCOPED_SYSTEMS) {
    const map = ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>;
    for (const l of u[sys]) {
      const cap = map[l.role];
      if (!cap) continue;
      explained.add(cap);
      const granted = u.caps.includes(cap);
      for (const v of hosts(cap)) push(v, { sys, role: l.role, bagts: l.bagts, cap, granted });
    }
  }
  for (const c of u.caps as CapKey[]) {
    if (explained.has(c) || !CAP_HOST_VIEW[c]) continue;
    for (const v of hosts(c)) push(v, { sys: 'cap', role: c, bagts: null, cap: c, granted: true });
  }

  return WORKFLOW_VIEWS.map((view) => {
    const sources = by.get(view) ?? [];
    return { view, sources, open: u.superUser || sources.some((s) => s.granted) };
  });
}

/** Олгогдоогүй эрхүүд (давхардалгүй) — «Дахин олгох» товчны оролт */
export const ungrantedCaps = (rows: WfRow[]): CapKey[] =>
  [...new Set(rows.flatMap((r) => r.sources.filter((s) => !s.granted && s.cap).map((s) => s.cap as CapKey)))];

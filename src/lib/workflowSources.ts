/**
 * УРСГАЛТАЙ 6 ХАРАГДАЦЫН ЭХ СУРВАЛЖ — «энэ хуудас ЯАГААД нээлттэй/хаалттай вэ» (2026-10-01).
 */

import { CAP_HOST_VIEW, WORKFLOW_VIEWS, type CapKey } from './caps';
import { ROLE_CAPS, SCOPED_SYSTEMS, type ScopedSys } from './aclRoleCaps';
import type { UserErh } from './erhOverview';
import type { ViewKey } from './services';

/** Нэг эх сурвалж */
export type WfSource = {
  /**
   * `flow` — урсгалын томилгоо · үүрэгтэй тав — хуваарилалт (2026-10-23: QAQC хасагдсан) ·
   * `cap` — хуваарилалтгүй ШУУД олгосон эрх (хатуу super-ийн шууд олголт / өнчин эрх)
   */
  sys: 'flow' | ScopedSys | 'cap' | 'type';
  /** Урсгалд — шат; үүрэгтэй системд — үүрэг; `cap`-д — эрхийн түлхүүр; `type`-д — «Хуваарь харах» утга (`all`/`own`, 2026-10-26), эсвэл `zahiral` («Гүйцэтгэл»-ийг төрлөөр зөвхөн харна) */
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
  if (u.viewRole && !u.flow) {
    push('guitsetgel', { sys: 'type', role: 'zahiral', bagts: null, cap: null, granted: true, viewOnly: true });
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

  if (u.hvType && (u.hvType.bagts === null || u.hvType.bagts.length > 0)) {
    push('huvaari', { sys: 'type', role: u.hvType.scope, bagts: u.hvType.bagts, cap: null, granted: true, viewOnly: true });
  }

  return WORKFLOW_VIEWS.map((view) => {
    const sources = by.get(view) ?? [];
    const viaPlan = view === 'huvaari' && sources.some((s) => s.sys === 'huvaari'
      && (s.bagts === null || s.bagts.some((b) => !u.unknownBagts.includes(b))));
    return { view, sources, open: u.superUser || viaPlan || sources.some((s) => s.granted) };
  });
}

/** Олгогдоогүй эрхүүд (давхардалгүй) — «Дахин олгох» товчны оролт */
export const ungrantedCaps = (rows: WfRow[]): CapKey[] =>
  [...new Set(rows.flatMap((r) => r.sources.filter((s) => !s.granted && s.cap).map((s) => s.cap as CapKey)))];

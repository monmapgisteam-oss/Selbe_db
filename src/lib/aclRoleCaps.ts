/**
 * ҮҮРЭГ → ЭРХИЙН ГАНЦ ХҮСНЭГТ — багцаар хуваарилагддаг эрхүүдийн эх сурвалж.
 */

import type { CapKey } from './caps';

/**
 * Багцаар хуваарилагддаг таван систем — үүрэг → эрх.
 */
export const ROLE_CAPS = {
  huvaari: { author: 'plan', approver: 'planApprove' },
  obyem: { editor: 'obyemEdit', approver: 'obyemApprove' },
  ajil: { editor: 'addRow', approver: 'ajilApprove' },
  chanar: { author: 'chanarAuthor', tuh: 'chanarReview', chanar: 'chanarReview', habea: 'chanarReview', tug: 'chanarReview', cheng: 'chanarReview' },
  butets: { editor: 'butets' },
} as const satisfies Record<string, Readonly<Record<string, CapKey>>>;

/** Үүрэгтэй таван систем */
export type ScopedSys = keyof typeof ROLE_CAPS;
export const SCOPED_SYSTEMS: readonly ScopedSys[] = ['huvaari', 'obyem', 'ajil', 'chanar', 'butets'];

/** Хуваарилалтаас гардаг эрхийн систем — 2026-10-23: QAQC (үүрэггүй систем) хасагдсан */
export type DerivedSys = ScopedSys;

/**
 * ХУВААРИЛАЛТААС ГАРДАГГҮЙ таван эрх — зөвхөн нэрээр, унтраалгаар олгоно.
 */
export const PLAIN_CAPS: readonly CapKey[] = ['zovshoorol', 'finEdit', 'finRow', 'gazar', 'hamaaral', 'habeaData', 'sysClose', 'docsUpload', 'docsGroups', 'zuragEdit', 'cfSwitch'];

/** Эрх аль системийн хуваарилалтаас гардаг вэ — энгийн эрхэд `null` */
export function capSystem(cap: CapKey): DerivedSys | null {
  for (const sys of SCOPED_SYSTEMS) {
    if ((Object.values(ROLE_CAPS[sys]) as string[]).includes(cap)) return sys;
  }
  return null;
}

/** Хуваарилалтаас гардаг эрх мөн эсэх */
export const isDerivedCap = (cap: CapKey): boolean => capSystem(cap) !== null;

/** Тухайн эрх рүү заадаг үүргүүд (Чанарын `chanarReview` → таван хянагч, 2026-09-28-аас) */
export function rolesOfCap(cap: CapKey): string[] {
  const sys = capSystem(cap);
  if (!sys) return [];
  return Object.entries(ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>)
    .filter(([, c]) => c === cap)
    .map(([r]) => r);
}

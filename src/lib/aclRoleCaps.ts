/**
 * ҮҮРЭГ → ЭРХИЙН ГАНЦ ХҮСНЭГТ — багцаар хуваарилагддаг эрхүүдийн эх сурвалж.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ БАЙХ ЁСТОЙ ВЭ (2026-09-25). «Хуваарь зохиогч → `plan`»
 *    гэх мэт зураглал урьд нь НАЙМ газар гараар давтагдсан байв: таван
 *    `*Acl.ts`-ийн `roleCaps`, гурван панелийн `roleCaps`/`removeRevokingRoles`,
 *    `ChanarAcl`-ийн хоёр inline объект, `DedButetsAcl`, `UserAdmin.flipScoped`.
 *    Нэгийг нь солиход бусад нь хоцорч, эрх буцаалт буруу эрх рүү явах байв —
 *    `aclParity.check.mjs`-ийн «нэгд нь зассан, бусдад хуулаагүй» хэв шинж.
 *
 * ⚠️ ЦЭВЭР МОДУЛЬ: зөвхөн `type CapKey` импортлоно — `erhOverview.ts` ба
 *    Node дээрх тест шууд ачаална (localStorage, React хамааралгүй).
 *
 * ⚠️ ГАРГАЛГААТАЙ (derived) ба ЭНГИЙН (plain) эрх (2026-09-25, хэрэглэгчийн
 *    баталсан төлөвлөгөө): хуваарилалтаас гардаг 10 эрхийн ЭХ СУРВАЛЖ нь
 *    хуваарилалт. «Хэрэглэгчид» самбарын унтраалга тэднийг `[ALL]`-аар
 *    олгодог байсан нь хоёр дахь эх сурвалж болж, багцын хязгаарыг чимээгүй
 *    тэлдэг байв. Одоо super-ээс бусдад тэр нь зөвхөн ҮЗҮҮЛЭЛТ.
 */

import type { CapKey } from './caps';

/**
 * Багцаар хуваарилагддаг таван систем — үүрэг → эрх.
 * ⚠️ Чанарын гурван хянагч НЭГ эрх (`chanarReview`) хуваалцана — `caps.ts`-ийн ⚠️.
 * ⚠️ `ajil.editor` нь БАЙГАА `addRow` эрх (`ajilAcl.ts`-ийн ⚠️).
 */
export const ROLE_CAPS = {
  huvaari: { author: 'plan', approver: 'planApprove' },
  obyem: { editor: 'obyemEdit', approver: 'obyemApprove' },
  ajil: { editor: 'addRow', approver: 'ajilApprove' },
  chanar: { author: 'chanarAuthor', tuh: 'chanarReview', chanar: 'chanarReview', habea: 'chanarReview' },
  butets: { editor: 'butets' },
} as const satisfies Record<string, Readonly<Record<string, CapKey>>>;

/** Үүрэгтэй таван систем */
export type ScopedSys = keyof typeof ROLE_CAPS;
export const SCOPED_SYSTEMS: readonly ScopedSys[] = ['huvaari', 'obyem', 'ajil', 'chanar', 'butets'];

/** QAQC — ҮҮРЭГГҮЙ систем, ганц эрх (`qaqcAcl.soleCap`) */
export const QAQC_CAP = 'qaqc' as const satisfies CapKey;

/** Хуваарилалтаас гардаг эрхийн систем */
export type DerivedSys = ScopedSys | 'qaqc';

/**
 * ХУВААРИЛАЛТААС ГАРДАГГҮЙ дөрвөн эрх — зөвхөн нэрээр, унтраалгаар олгоно.
 * ⚠️ `caps.CAPS` = гаргалгаатай ∪ энгийн, давхцалгүй (`aclParity.check.mjs` барина).
 */
export const PLAIN_CAPS: readonly CapKey[] = ['zovshoorol', 'finEdit', 'finRow', 'gazar'];

/** Эрх аль системийн хуваарилалтаас гардаг вэ — энгийн эрхэд `null` */
export function capSystem(cap: CapKey): DerivedSys | null {
  if (cap === QAQC_CAP) return 'qaqc';
  for (const sys of SCOPED_SYSTEMS) {
    if ((Object.values(ROLE_CAPS[sys]) as string[]).includes(cap)) return sys;
  }
  return null;
}

/** Хуваарилалтаас гардаг эрх мөн эсэх */
export const isDerivedCap = (cap: CapKey): boolean => capSystem(cap) !== null;

/** Тухайн эрх рүү заадаг үүргүүд (Чанарын `chanarReview` → гурван хянагч) */
export function rolesOfCap(cap: CapKey): string[] {
  const sys = capSystem(cap);
  if (!sys || sys === 'qaqc') return [];
  return Object.entries(ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>)
    .filter(([, c]) => c === cap)
    .map(([r]) => r);
}

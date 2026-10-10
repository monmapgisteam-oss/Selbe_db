'use client';

/**
 * ЧАНАРЫН БАРИМТЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР, ЗУРГААН ҮҮРЭГ.
 *
 * ⚠️ `ScopedAclPanel`-ИЙГ ХЭРЭГЛЭХГҮЙ (2026-09-16). Тэр нь ХОЁР үүргийн
 *    (зохиогч · батлагч) хатуу хосолсон бүтэцтэй — `roles: readonly [R, R]`,
 *    «зохиогч=батлагч гацаа» шалгуур хоёр үүрэг л мэднэ. Энд зураглалын
 *    ДӨРВӨН эгнээ: Гүйцэтгэгч ирүүлнэ, ТУХ · Чанар · ХАБЭА гурав ЗЭРЭГЦЭЭ
 *    хянана. Түүнийг хоёр үүрэгт шахвал «хэн ТУХ, хэн ХАБЭА вэ» алдагдана.
 *    2026-09-28: ТАВ ДАХЬ үүрэг ТУГ — MA/NCR-ийн хянагч; ЗУРГАА ДАХЬ (2-р үе шат)
 *    Чанарын хяналтын инженер (`cheng`) — MA-ийн эхний шат (cheng → chanar → tug).
 *    Тиймээс мөрийн логик (`addTo` · `removeFrom`) нь тэр панелтэй ижил,
 *    харин үүргийн тоо ба гацааны шалгуур өөр.
 *
 * ⚠️ ГАЦААНЫ ШАЛГУУР — таван хянагчийн АЛЬ НЭГ нь томилогдоогүй бол тэр
 *    төрлийн баримт ХЭЗЭЭ Ч батлагдахгүй (`chanarMs.resolve`: төрлийн бүх
 *    хянагч зөвшөөрөх ёстой; `REVIEWERS_OF`). Мөн тухайн хянагчийн үүрэгт ЗӨВХӨН зохиогч өөрөө байвал мөн
 *    гацна (`review()` зохиогч=хянагчийг татгалзана).
 *
 * ⚠️ ХАДГАЛАЛТ нь ХЭРЭГЛЭГЧЭЭР — `ScopedAclPanel`-ийн ижил зарчим.
 *
 * ⚠️ ХӨЗӨР → ХҮСНЭГТ (2026-09-30, `GuitsetgelAcl` загвар): мөр = багц,
 *    багана = зургаан үүрэг (`CHANAR_ROLES`-ийн дараалал), нүдэнд аккаунтын
 *    чипүүд (`AclGrid`). Бичилт `aclOps.scopedCellOp('chanar', …)`. Хянагчгүй
 *    үүргийн нүд бүдэг шар; «хянагч дутуу» ба «нэг хүн хоёр үүрэгт» анхааруулга
 *    мөрийн толгойд ⚠, бүтэн текст нь хүснэгтийн доор.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import {
  CHANAR_ROLES, chanarAclReady, chanarFailedUsers, listChanarAssigns, subscribeChanarAcl, type ChanarRole,
} from '@/lib/chanarAcl';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { reviewerClashes } from '@/lib/chanarMs';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import s from './guitsetgel.module.css';

/** Үүргийн шошго — зурагдах агшинд (`tr()` модулийн түвшинд хэрэглэхгүй) */
export const chanarRoleLabel = (r: ChanarRole): string => {
  if (r === 'author') return tr('Гүйцэтгэгч (ирүүлэгч)');
  if (r === 'tuh') return tr('ТУХ — инженер · менежер');
  if (r === 'chanar') return tr('Чанарын хэлтэс');
  if (r === 'tug') return tr('ТУГ — төслийн менежер (MA · NCR)');
  if (r === 'cheng') return tr('Чанарын хяналтын инженер (MA)');
  return tr('ХАБЭА');
};

export function ChanarAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listChanarAssigns();
  const failed = new Set(chanarFailedUsers());
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `ScopedAclPanel`-тэй ИЖИЛ.
   *    Remote уншигдаагүй үед `rows` нь `[]` тул «Нэмэх» дарахад
   *    `setChanarGrants` тэр хүний БҮХ мөрийг нэг багцаар дарж бичнэ.
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const ready = () => remoteReady() && capsRemoteReady() && chanarAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /* ⚠️ `false` буцвал ArcGIS бичилт унасан — `runOp` зурвас тавина; давхар товшилтыг `busy` барина */
  const { busy, err, setErr, run } = useAclRunner(ready);

  /*
   * ⚠️ БИЧИХ ДҮРЭМ `aclOps`-Д (2026-09-25) — ALL хамгаалалт, багцгүй grant унах,
   *    `revoke=false` + зөвхөн хасагдсан үүргийн эрх (Чанарын гурван хянагч нэг
   *    `chanarReview` хуваалцдаг тул үлдсэн хянагч байвал буцаахгүй).
   */
  const addTo = (group: string, role: ChanarRole, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('chanar', user, role, group, true));
  };

  const removeFrom = (group: string, role: ChanarRole, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp('chanar', user, role, group, false));
  };

  /** Тухайн багцад тэр үүргээр хуваарилагдсан аккаунтууд (+ «бүх багц»-аар эсэх) */
  const holdersOf = (group: string, role: string): GridHolder[] =>
    rows.flatMap((a) => {
      const held = grantHolds(a.grants, role, group);
      return held ? [{
        user: a.user,
        viaAll: held === 'all',
        gone: !known.has(a.user),
        /* ⚠️ 2026-09-30: хатуу super-ийн хуучин мөр — «админ» тэмдэг (`GuitsetgelAcl`-тэй ижил); ✕ нь мөрийг бүхэлд нь цэвэрлэнэ (`aclOps.isCleanup`) */
        admin: roleForUser(a.user) === 'super',
        failed: failed.has(a.user),
        dirty: dirtyPerms.has(a.user),
      }] : [];
    });

  /** Багц бүрийн гацаа — нэг удаа тооцоод мөр, нүд хоёуланд */
  const state = new Map(PKG_GROUPS.map((group) => {
    /* ⚠️ 2026-09-30: устгагдсан аккаунт (`gone`) гацааны шалгуурт тоологдохгүй — `ScopedAclPanel`-ийн ижил дүрэм */
    const by = Object.fromEntries(CHANAR_ROLES.map((r) => [r, holdersOf(group, r).filter((h) => !h.gone).map((h) => h.user)])) as Record<ChanarRole, string[]>;
    const authors = by.author;
    /* Хянагчийн үүрэг тус бүрд ЗОХИОГЧООС ӨӨР хүн бий эсэх.
       ⚠️ ЗОХИОГЧ БҮРЭЭР (2026-09-25, `erhOverview.noOther` ба ScopedAclPanel
       `stuck`-тай ижил): аль нэг зохиогчид ӨӨРӨӨС НЬ өөр хянагч байхгүй бол
       л дутуу. Урьд нь А ба Б хоёулаа зохиогч + хянагч үед бие биеэ хянаж
       чадах атал «дутуу» гэж худал анхааруулдаг байв. */
    const missing: ChanarRole[] = (['tuh', 'chanar', 'habea', 'tug', 'cheng'] as const)
      .filter((r) => authors.length > 0 && authors.some((a) => !by[r].some((u) => u !== a)));
    /* ⚠️ 2026-09-30: НЭГ ХҮН ХОЁР ҮҮРЭГТ — «нэг хүн зөвхөн НЭГ үүргээр» (`chanarMs.review`)
       тул тухайн төрлийн хоёр үүргийн ЦОРЫН ГАНЦ эзэн нэг хүн бол баримт гацна
       (`erhOverview`-ийн `chanarOneManRoles`-той НЭГ шалгуур — `reviewerClashes`). */
    const clashes = reviewerClashes(by, authors);
    const warn = [
      missing.length > 0
        ? tr('⚠️ {0} — зохиогчоос өөр хянагч томилоогүй. Тухайн төрлийн хянагч бүгд зөвшөөрөх ёстой тул энэ багцын баримт батлагдахгүй.', missing.map(chanarRoleLabel).join(' · '))
        : '',
      ...clashes.map((c) => tr('⚠️ Нэг хүн хоёр үүрэгт — баримт гацна ({0}): {1} нь {2} үүргийн цорын ганц хянагч. Нэг хүн зөвхөн нэг үүргээр хянадаг тул үүрэг тус бүрд өөр хүн томилно уу.',
        c.kinds.join(', '), c.users.join(', '), c.roles.map(chanarRoleLabel).join(' · '))),
    ].filter(Boolean);
    return [group, { missing, clashed: new Set<string>(clashes.flatMap((c) => c.roles)), warn }] as const;
  }));

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Багц тус бүрд Гүйцэтгэгч ба таван хянагч (ТУХ · Чанар · ХАБЭА · ТУГ · Чанарын хяналтын инженер) аккаунтыг тусад нь томилно. Нэг үүрэгт хэдэн ч аккаунт байж болно.')}
        {' '}
        {tr('MS · QMP · PRC: ТУХ · Чанар · ХАБЭА зэрэгцээ; MA: Чанарын хяналтын инженер → Чанар → ТУГ дараалсан; MIR/FIC: ТУХ, дараа нь Чанар; NCR: ТУХ · Чанар эсвэл ТУГ нээж, гүйцэтгэгчийн залруулгыг ТУХ · Чанар · ТУГ дүгнэнэ. Бүгд зөвшөөрвөл батлагдана, нэг нь татгалзвал буцаагдана.')}
        {' '}
        {tr('⚠️ QAQC (ITP бөглөх) ба гүйцэтгэлийн урсгалын эрхээс ТУСДАА: энд үүрэг олгосон нь тэдгээрийг өгөхгүй.')}
      </p>
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <AclGrid
        corner={tr('Багц')}
        rows={PKG_GROUPS.map((g) => ({ key: g, label: g, warn: state.get(g)?.warn }))}
        cols={CHANAR_ROLES.map((r) => ({
          key: r,
          label: chanarRoleLabel(r),
          count: rows.filter((a) => a.grants.some((g) => g.role === r)).length,
        }))}
        holders={holdersOf}
        /* ⚠️ Гацаа: зохиогчоос өөр хянагчгүй үүрэг, эсвэл нэг хүн хоёр үүрэгт давхцсан үүрэг */
        stuck={(g, role) => {
          const st = state.get(g);
          return !!st && (st.missing.includes(role as ChanarRole) || st.clashed.has(role));
        }}
        stuckTitle={(g, role) => (state.get(g)?.missing.includes(role as ChanarRole)
          ? tr('Зохиогчоос өөр хянагч алга — энэ багцын баримт батлагдахгүй')
          : tr('Нэг хүн хоёр үүрэгт — баримт гацна'))}
        /* Тэр багцад тэр үүргээр аль хэдийн байгааг («бүх багц»-аар ч) санал болгохгүй */
        candidates={(g, role) => {
          const list = holdersOf(g, role).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase())).map((a) => ({ value: a, label: a }));
        }}
        onAdd={(g, role, u) => addTo(g, role as ChanarRole, u)}
        onRemove={(g, role, h) => removeFrom(g, role as ChanarRole, h.user)}
        addTitle={(r, c) => tr('{0} — {1}: аккаунт нэмэх', r.label, c.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}

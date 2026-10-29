'use client';

/**
 * ХЭРЭГЛЭГЧИЙН КАРТ — нэг хүний ХАРАХ эрх нэг дэлгэцэнд (2026-09-25 · 2026-09-30).
 */

import { t as tr } from '@/lib/i18nCore';
import { UserRights } from './UserRights';
import { UserTypeSection } from './UserTypeSection';
import { UserWorkflow } from './UserWorkflow';
import type { ErhPane } from '@/modules/capText';
import { roleOf } from '@/lib/permissions';
import { ROLE_STAGE } from '@/lib/services';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import { flowAclReady } from '@/lib/guitsetgelAcl';
import { portalMissing } from '@/lib/portalPresence';
import { UserHeadActions, UserHeadBadges, rightsProps, type UserRowProps } from './UserRow';
import s from './userAdmin.module.css';

export type UserCardProps = {
  /** Мөрийн props — толгой ба `UserRights` ИЖИЛ бүрэлдэхүүнээр зурагдана */
  p: UserRowProps;
  /** Энэ хэрэглэгчид хадгалаагүй ноорог байна — «Төрлөөр тохируулах» хаалттай */
  hasDraft: boolean;
  onBack: () => void;
  /** Урсгалтай хуудасны эх сурвалжийн холбоос — тэр эрхийн хуудас руу (2026-10-01) */
  onGo: (pane: ErhPane | 'types') => void;
};

export function UserCard({ p, hasDraft, onBack, onGo }: UserCardProps) {
  const { u, d } = p;
  const key = u.username.trim().toLowerCase();
  /** Шинэ (хадгалаагүй) эсвэл устгахаар тэмдэглэсэн — шууд бичих хэсэг хаалттай */
  const blocked = !!d.isNew || !!d.remove;
  const want = d.role ? ROLE_STAGE[d.role] : undefined;
  const typeGap = !d.remove && !!want && flowAclReady() && p.st !== want ? want : null;
  const absent = portalMissing(u.username);

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <button type="button" className={s.cancelBtn} onClick={onBack}>{tr('← Жагсаалт')}</button>
        <span className={s.cardName}>{u.username}</span>
        <UserHeadBadges p={p} />
        <UserHeadActions p={p} />
      </div>
      {d.remove && <div className={s.capNote}>{tr('Хадгалахад энэ аккаунт устгагдана.')}</div>}
      {absent && (
        <div className={s.capErr} role="alert">
          {tr('Enterprise порталд энэ нэртэй аккаунт алга — нэвтэрч чадахгүй тул түүний хуваарилалт ажил гүйцэтгэхгүй. Хуваарилалтыг нь өөр хүнд шилжүүлэх, эсвэл аккаунтыг устгана уу.')}
        </div>
      )}
      {typeGap && (
        <div className={s.capErr} role="alert">
          {p.st
            ? tr('«{0}» төрөлтэй атлаа «{1}» шатанд томилогдсон — шат нь томилгооноос гардаг тул төрөл ба шат зөрж байна.', STAGE_LABEL[typeGap], STAGE_LABEL[p.st])
            : tr('«{0}» төрөл урсгалын шат олгодоггүй — «{0}» шатанд томилохгүй бол «Гүйцэтгэл» хуудас нээгдэхгүй, батлах боломжгүй.', STAGE_LABEL[typeGap])}
          {' '}
          <button type="button" className={s.linkBtn} onClick={() => onGo('guits')}>{tr('Гүйцэтгэлийн урсгалын эрх →')}</button>
        </div>
      )}
      {d.isNew && <div className={s.capNote}>{tr('Эхлээд хадгална уу — «Төрлөөр тохируулах» хадгалагдсан аккаунтад л ажиллана.')}</div>}

      {/* ── 2. Эрхийн төрөл — загвараар нэг дор (2026-09-25) ── */}
      {!d.remove && (
        <UserTypeSection key={key} user={key} role={roleOf(key)} disabled={blocked || hasDraft} hardSuper={p.superUser} />
      )}

      {/* ── 3. Харагдац · ТЭЗҮ-БОНУ ── */}
      {!d.remove && (
        <section className={s.cardSec} id="erh-sec-rights">
          <UserRights {...rightsProps(p)} />
        </section>
      )}

      {/* ── 4. Урсгалтай 6 хуудас — ЗӨВХӨН ХАРУУЛНА (2026-10-01); шинэ/устгах аккаунтад хуваарилалт байхгүй ── */}
      {!blocked && <UserWorkflow key={`wf-${key}`} user={key} onGo={onGo} />}
      <p className={s.capNote}>
        {tr('Засах эрх (хуваарь · нэмэлт ажил · обьём · чанарын баримт · дэд бүтэц · зөвшөөрөл · санхүү · газар) хажуугийн цэсний тухайн урсгалын хуудсанд олгогдоно.')}
      </p>
    </div>
  );
}

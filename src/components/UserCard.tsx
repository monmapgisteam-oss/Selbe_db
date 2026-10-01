'use client';

/**
 * ХЭРЭГЛЭГЧИЙН КАРТ — нэг хүний ХАРАХ эрх нэг дэлгэцэнд (2026-09-25 · 2026-09-30).
 *
 * ⚠️ 2026-09-30 (хэрэглэгчийн шийдвэр): «Хэрэглэгчдийн эрх удирдах» = ЗӨВХӨН
 *    аккаунт · үүргийн шошго · 23 харагдац · ТЭЗҮ-БОНУ · хадгалах. Урьд нь энэ
 *    картад гүйцэтгэлийн урсгал · QAQC · таван үүрэгтэй системийн хуваарилалт
 *    (шууд бичигддэг) ба «Нэмэлт эрх» блок байсныг ХАСАВ — засах эрх БҮР админ
 *    порталын өөрийн хуудсанд (хажуугийн цэс). Карт нь одоо:
 *      1 толгой (шошго · preset · Сэргээх/Устгах) — НООРОГ
 *      2 эрхийн төрөл — «Төрлөөр тохируулах» (харагдац · нүүр цонх · ТЭЗҮ-БОНУ)
 *      3 харагдац · ТЭЗҮ-БОНУ — \`UserRights\` (ноорог)
 *      4 урсгалтай 6 хуудас — \`UserWorkflow\` (ЗӨВХӨН ХАРУУЛНА, 2026-10-01: эх сурвалж ·
 *        холбоос · «Дахин олгох»; хуудас нь хуваарилалтаар л нээгдэнэ)
 *
 * ⚠️ ХАДГАЛАХ ДҮРЭМ — хэрэглэгчийн эрхийн мөр (харагдац, үүрэг, устгах, сэргээх)
 *    НООРОГ; «Төрлөөр тохируулах» ШУУД (\`roleTypeApply\`) тул ноорогтой үед хаалттай.
 */

import { t as tr } from '@/lib/i18nCore';
import { UserRights } from './UserRights';
import { UserTypeSection } from './UserTypeSection';
import { UserWorkflow } from './UserWorkflow';
import type { ErhPane } from '@/modules/capText';
import { roleOf } from '@/lib/permissions';
import { UserHeadActions, UserHeadBadges, rightsProps, type UserRowProps } from './UserRow';
import s from './userAdmin.module.css';

export type UserCardProps = {
  /** Мөрийн props — толгой ба `UserRights` ИЖИЛ бүрэлдэхүүнээр зурагдана */
  p: UserRowProps;
  /** Энэ хэрэглэгчид хадгалаагүй ноорог байна — «Төрлөөр тохируулах» хаалттай */
  hasDraft: boolean;
  onBack: () => void;
  /** Урсгалтай хуудасны эх сурвалжийн холбоос — тэр эрхийн хуудас руу (2026-10-01) */
  onGo: (pane: ErhPane) => void;
};

export function UserCard({ p, hasDraft, onBack, onGo }: UserCardProps) {
  const { u, d } = p;
  const key = u.username.trim().toLowerCase();
  /** Шинэ (хадгалаагүй) эсвэл устгахаар тэмдэглэсэн — шууд бичих хэсэг хаалттай */
  const blocked = !!d.isNew || !!d.remove;

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <button type="button" className={s.cancelBtn} onClick={onBack}>{tr('← Жагсаалт')}</button>
        <span className={s.cardName}>{u.username}</span>
        <UserHeadBadges p={p} />
        <UserHeadActions p={p} />
      </div>
      {d.remove && <div className={s.capNote}>{tr('Хадгалахад энэ аккаунт устгагдана.')}</div>}
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
        {tr('Засах эрх (хуваарь · нэмэлт ажил · обьём · чанарын баримт · QAQC · дэд бүтэц · зөвшөөрөл · санхүү · газар) хажуугийн цэсний тухайн урсгалын хуудсанд олгогдоно.')}
      </p>
    </div>
  );
}

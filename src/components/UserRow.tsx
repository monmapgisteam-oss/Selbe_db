'use client';

/**
 * ХЭРЭГЛЭГЧИЙН НЭГ МӨР — админ панелийн жагсаалтын нэгж.
 */

import { t as tr } from '@/lib/i18nCore';
import { ROLE_STAGE, isCodeSuper, type ViewKey, type Role } from '@/lib/services';
import { portalMissing } from '@/lib/portalPresence';
import { flowAclReady } from '@/lib/guitsetgelAcl';
import type { UserPerm } from '@/lib/permissions';
import type { CapKey } from '@/lib/caps';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';
import { typeLabel } from '@/lib/roleTypes';
import s from './userAdmin.module.css';
import type { Draft } from './UserAdmin';
import { UserRights, type UserRightsProps } from './UserRights';

/** Эцгээс ирэх бүх зүйл — энэ бүрэлдэхүүн өөрийн төлөвгүй */
export type UserRowProps = {
  u: UserPerm;
  /** ЖИЖИГ үсгээр — бүх Map/Set-ийн түлхүүр */
  rowKey: string;
  d: Draft;
  dirty: boolean;
  /** Гүйцэтгэлийн урсгалын шат — ЗӨВХӨН ХАРУУЛАХ тэмдэг */
  st: Stage | null;
  expanded: boolean;
  /** Нээлттэй харагдацын тоо (нэмэлт эрхийн дагуулыг оруулаад) */
  on: number;
  capViews: ViewKey[];
  /** `caps` дэх эрхүүд (runtime) — засах эрхээр нээгдсэн харагдацын tooltip-д */
  caps: CapKey[];
  selected: boolean;
  dirtyPerm: boolean;
  myName: string | null;
  allKeys: ViewKey[];
  rolePresets: { key: Role; label: string }[];
  hasView: (views: ViewKey[] | 'all', k: ViewKey) => boolean;
  onPick: (checked: boolean) => void;
  onExpand: () => void;
  onRole: (role: Role) => void;
  onFlipView: (k: ViewKey) => void;
  onAllViews: (on: boolean) => void;
  onFlipRemove: () => void;
  onGoFlow: () => void;
  superUser: boolean;
  viewsLocked?: boolean;
  /** Хэрэглэгчийн карт нээх */
  onOpenCard: () => void;
};

/** Мөр ба картын `UserRights`-ийн props — НЭГ газар */
export const rightsProps = (p: UserRowProps): UserRightsProps => ({
  d: p.d,
  capViews: p.capViews,
  caps: p.caps,
  hasView: p.hasView,
  onFlipView: p.onFlipView,
  onAllViews: p.onAllViews,
  superUser: p.superUser || !!p.viewsLocked,
});

/** Толгойн шошгууд — шинэ · устгагдана · тоо · шат · ноорог · синк (мөр ба карт) */
export function UserHeadBadges({ p }: { p: UserRowProps }) {
  const { d, dirty, st, on, allKeys, dirtyPerm, onGoFlow } = p;
  const want = d.role ? ROLE_STAGE[d.role] : undefined;
  const typeGap = !d.remove && !!want && flowAclReady() && st !== want;
  return (
    <span className={s.badges}>
      {d.isNew && (
        <span className={s.newBadge} title={tr('Хадгалаагүй шинэ аккаунт — «Хадгалах» дарсны дараа багц, засах эрх олгох хуудсуудад сонгогдоно.')}>
          {tr('шинэ')}
        </span>
      )}
      {portalMissing(p.u.username) && (
        <span className={s.removeBadge} title={tr('Enterprise порталд энэ нэртэй аккаунт алга — нэвтэрч чадахгүй. Хуваарилалтыг нь өөр хүнд шилжүүлэх, эсвэл устгана уу.')}>
          {tr('порталд алга')}
        </span>
      )}
      {typeGap && want && (
        <button
          type="button"
          className={s.stageBadge}
          onClick={() => onGoFlow()}
          title={st
            ? tr('«{0}» төрөлтэй атлаа «{1}» шатанд томилогдсон — шат нь томилгооноос. Дарж «Гүйцэтгэлийн урсгалын эрх» руу очно.', STAGE_LABEL[want], STAGE_LABEL[st])
            : tr('«{0}» төрөл урсгалын шат олгодоггүй — «Гүйцэтгэлийн урсгалын эрх» хуудсанд «{0}» шатанд томилохгүй бол «Гүйцэтгэл» хуудас нээгдэхгүй, батлахгүй. Дарж очно.', STAGE_LABEL[want])}
        >
          {st ? tr('⚠ төрөл ≠ шат') : tr('⚠ шатгүй')}
        </button>
      )}
      {d.remove && <span className={s.removeBadge}>{tr('хадгалахад устгагдана')}</span>}
      {!d.remove && (
        <span className={s.countBadge} title={tr('Нээлттэй харагдацын тоо')}>
          {`${on}/${allKeys.length}`}
        </span>
      )}
      {st && (
        <button
          type="button"
          className={s.stageBadge}
          onClick={() => onGoFlow()}
          title={tr('Урсгалын томилгоог «Гүйцэтгэлийн урсгалын эрх» хуудсанд засна — дарж очно')}
        >
          {STAGE_LABEL[st]}
        </button>
      )}
      {dirty && !d.remove && (
        <span className={s.dirtyDot} title={tr('Хадгалаагүй өөрчлөлттэй')} />
      )}
      {dirtyPerm && (
        <span
          className={s.unsynced}
          title={tr('ArcGIS хүснэгтэд бичиж чадсангүй — өөрчлөлт бусад төхөөрөмжид үйлчлэхгүй. «Дахин илгээх» товчоор дахин илгээнэ.')}
        >
          {tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид')}
        </span>
      )}
    </span>
  );
}

/** Үүргийн preset · Устгах (мөр ба карт) — бүгд НООРОГ */
export function UserHeadActions({ p }: { p: UserRowProps }) {
  const { u, rowKey: key, d, myName, rolePresets, onRole, onFlipRemove } = p;
  return (
    <div className={s.presets}>
      <select
        className={s.roleSelect}
        value={d.role ?? ''}
        disabled={p.superUser}
        onChange={(e) => { if (e.target.value) onRole(e.target.value as Role); }}
        aria-label={tr('Үүрэг')}
        title={p.superUser
          ? tr('Өөрийн super эрх — өөр super админ өөрчилнө')
          : d.role === 'super'
            ? tr('Бүх харагдац ба админ портал нээгдэнэ — super эрх нь эрхийн тохиргооноос (өөр super админ олгоно/хасна).')
            : tr('Үүрэг')}
      >
        {!d.role && <option value="">{tr('Үүрэг сонгох…')}</option>}
        {d.role && !rolePresets.some((r) => r.key === d.role) && (
          <option value={d.role} disabled>{typeLabel(d.role)}</option>
        )}
        {rolePresets.map((r) => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
      {key !== myName && !isCodeSuper(u.username) && (
        <button
          type="button"
          className={`${s.delBtn} ${d.remove ? s.delBtnOn : ''}`}
          onClick={() => onFlipRemove()}
          title={d.remove
            ? tr('Устгалтыг болиулна')
            : tr('Аккаунтыг устгана (хадгалахад үйлчилнэ)')}
        >
          {d.remove ? tr('Болиулах') : tr('Устгах')}
        </button>
      )}
    </div>
  );
}

export function UserRow(props: UserRowProps) {
  const { u, rowKey: key, d, dirty, expanded, selected, onPick, onExpand, onOpenCard } = props;

  return (
          <div key={key} className={`${s.user} ${dirty ? s.userDirty : ''} ${d.remove ? s.userRemoving : ''}`}>
            <div className={s.userHead}>
              <input
                type="checkbox"
                className={s.pick}
                checked={selected}
                onChange={(e) => onPick(e.target.checked)}
                aria-label={tr('{0} сонгох', u.username)}
              />
              <button
                type="button"
                className={s.expand}
                aria-expanded={expanded}
                aria-label={tr('Дэлгэх')}
                onClick={onExpand}
              >
                <span className={`${s.caret} ${expanded ? s.caretOn : ''}`} aria-hidden>▸</span>
              </button>
              <button
                type="button"
                className={s.unameBtn}
                onClick={() => onOpenCard()}
                title={tr('Хэрэглэгчийн карт — бүх эрх, хуваарилалт нэг дор')}
              >
                <span className={s.uname}>{u.username}</span>
              </button>
              <UserHeadBadges p={props} />
              <UserHeadActions p={props} />
            </div>

            {expanded && !d.remove && <UserRights {...rightsProps(props)} />}
          </div>
  );
}

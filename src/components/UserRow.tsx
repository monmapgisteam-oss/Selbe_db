'use client';

/**
 * ХЭРЭГЛЭГЧИЙН НЭГ МӨР — админ панелийн жагсаалтын нэгж.
 *
 * ⚠️ `UserAdmin.tsx`-ЭЭС САЛГАСАН (2026-09-10). Эцэг файл 1339 мөр болж
 * ургасан тул нэг дэлгэцэнд багтахаа больж, засвар хийхэд аль хэсэг нь юунд
 * нөлөөлөхийг харахад хүндэрсэн. Мөрийн зурагдалт нь БҮРЭН тусдаа асуудал:
 * түүнд эцгийн төлөв ХЭРЭГТЭЙ ч ХАРИУЦЛАГА нь өөр.
 *
 * ⚠️ ЛОГИК ОГТ ӨӨРЧЛӨГДӨӨГҮЙ — зөвхөн байрлал. Эцгийн бүх төлөв ба үйлдэл
 * props-оор ирнэ; энэ файл нь ӨӨРИЙН төлөв хадгалахгүй (цорын ганц эх сурвалж
 * эцэгтээ хэвээр).
 *
 * ⚠️ 2026-09-25: дэлгэсэн хэсэг (харагдац · ТЭЗҮ-БОНУ · нэмэлт эрх) нь
 *    `UserRights.tsx`-д, толгойн шошго/товчнууд нь `UserHeadBadges` ·
 *    `UserHeadActions` — хэрэглэгчийн карт ч ИЖИЛ бүрэлдэхүүнийг зурна.
 *    НЭР дээр дарвал КАРТ нээгдэнэ; ▸ нь мөрийг дэлгэнэ.
 */

import { t as tr } from '@/lib/i18nCore';
import { roleForUser, type ViewKey, type Role } from '@/lib/services';
import type { UserPerm } from '@/lib/permissions';
import type { CapKey } from '@/lib/caps';
import type { DerivedSys } from '@/lib/aclRoleCaps';
import type { UserErh } from '@/lib/erhOverview';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';
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
  /** `caps` дэх эрхүүд (runtime) */
  caps: CapKey[];
  /** ⚠️ Remote эрхийн хүснэгт уншигдаагүй — унтраалга хаалттай (2026-09-21) */
  capsLocked?: boolean;
  capsLockMsg?: string;
  selected: boolean;
  capErr: boolean;
  dirtyPerm: boolean;
  /** ⚠️ Нэвтэрсэн хүний нэр — ӨӨРИЙГӨӨ устгах товч харагдахгүй */
  myName: string | null;
  allKeys: ViewKey[];
  rolePresets: { key: Role; label: string }[];
  hasView: (views: ViewKey[] | 'all', k: ViewKey) => boolean;
  capLabel: (k: CapKey) => string;
  capHint: (k: CapKey) => string;
  onPick: (checked: boolean) => void;
  onExpand: () => void;
  onRole: (role: Role) => void;
  onFlipView: (k: ViewKey) => void;
  onAllViews: (on: boolean) => void;
  onFlipDocs: () => void;
  onFlipCap: (c: CapKey) => void;
  onFlipRemove: () => void;
  onClear: () => void;
  onGoFlow: () => void;
  /** Хатуу super — гаргалгаатай эрх унтраалгаар (`UserRights`-ийн ⚠️) */
  superUser: boolean;
  /** Бүх ACL уншигдсан үеийн эрхийн зураг (`null` = түгжээтэй) */
  erh: UserErh | null;
  /** `aclOps` бичилт явагдаж байна — өнчин/дутуу тэмдэг нуугдана (`UserRights`) */
  settling: boolean;
  /** Хэрэглэгчийн карт нээх — `sys` өгвөл тэр хэсэг рүү гүйлгэнэ */
  onOpenCard: (sys?: DerivedSys | 'flow') => void;
  /** Өнчин эрхийг ИЛ хасах */
  onDropOrphan: (c: CapKey) => void;
};

/** Мөр ба картын `UserRights`-ийн props — НЭГ газар */
export const rightsProps = (p: UserRowProps): UserRightsProps => ({
  d: p.d,
  capViews: p.capViews,
  caps: p.caps,
  capsLocked: p.capsLocked,
  capsLockMsg: p.capsLockMsg,
  capErr: p.capErr,
  superUser: p.superUser,
  erh: p.erh,
  settling: p.settling,
  hasView: p.hasView,
  capLabel: p.capLabel,
  capHint: p.capHint,
  onFlipView: p.onFlipView,
  onAllViews: p.onAllViews,
  onFlipDocs: p.onFlipDocs,
  onFlipCap: p.onFlipCap,
  onDropOrphan: p.onDropOrphan,
  onOpenCard: (sys) => p.onOpenCard(sys),
});

/** Толгойн шошгууд — шинэ · устгагдана · тоо · шат · ноорог · синк (мөр ба карт) */
export function UserHeadBadges({ p }: { p: UserRowProps }) {
  const { d, dirty, st, on, allKeys, dirtyPerm, onGoFlow } = p;
  return (
    <span className={s.badges}>
      {d.isNew && <span className={s.newBadge}>{tr('шинэ')}</span>}
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
          title={tr('ArcGIS хүснэгтэд бичиж чадсангүй — өөрчлөлт бусад төхөөрөмжид үйлчлэхгүй. «Дахин синк» товчоор дахин илгээнэ.')}
        >
          {tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}
        </span>
      )}
    </span>
  );
}

/** Үүргийн preset · Сэргээх · Устгах (мөр ба карт) — бүгд НООРОГ */
export function UserHeadActions({ p }: { p: UserRowProps }) {
  const { u, rowKey: key, d, dirty, myName, rolePresets, onRole, onClear, onFlipRemove } = p;
  return (
    <div className={s.presets}>
      {rolePresets.map((r) => (
        <button
          key={r.key}
          type="button"
          className={`${s.preset} ${d.role === r.key ? s.presetOn : ''}`}
          onClick={() => onRole(r.key)}
          title={r.key === 'super'
            ? tr('Бүх харагдац нээгдэнэ. ⚠️ Админ портал нээх эрх зөвхөн кодын хатуу тохиргооны супер админд бий.')
            : tr('{0} эрхийн багц', r.label)}
        >
          {r.label}
        </button>
      ))}
      {/* ⚠️ Зөвхөн хатуу суурьтай хэрэглэгчид — панелаас нэмсэн аккаунтад
          «сэргээх» = чимээгүй устгах байв; тэдэнд «Устгах» л байна */}
      {roleForUser(u.username) && (u.overridden || dirty) && !d.remove && !d.isNew && (
        <button
          type="button"
          className={s.reset}
          onClick={() => onClear()}
          title={tr('Хатуу тохиргоо руу сэргээх (хадгалахад үйлчилнэ)')}
        >
          {tr('Сэргээх')}
        </button>
      )}
      {/* ⚠️ Хатуу тохиргооны super устгагдахгүй — хуваалцсан хүснэгтээр
          бүх админыг түгжих замыг хаана; хасах цор ганц зам = код. */}
      {key !== myName && roleForUser(u.username) !== 'super' && (
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
              {/* ⚠️ ▸ нь мөрийг дэлгэнэ, НЭР нь картыг нээнэ (2026-09-25) */}
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

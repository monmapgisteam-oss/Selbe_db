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
 * ⚠️ 2026-09-25: дэлгэсэн хэсэг (харагдац · ТЭЗҮ-БОНУ) нь `UserRights.tsx`-д,
 *    толгойн шошго/товчнууд нь `UserHeadBadges` · `UserHeadActions` —
 *    хэрэглэгчийн карт ч ИЖИЛ бүрэлдэхүүнийг зурна.
 *    НЭР дээр дарвал КАРТ нээгдэнэ; ▸ нь мөрийг дэлгэнэ.
 * ⚠️ 2026-09-30: нэмэлт эрхийн props (`onFlipCap` · `onDropOrphan` · `capLabel` ·
 *    `capHint` · `erh` · `settling` · `capErr` · `capsLocked`) ХАСАГДСАН — засах
 *    эрх админ порталын өөрийн хуудсуудад (`UserRights.tsx`-ийн ⚠️).
 */

import { t as tr } from '@/lib/i18nCore';
import { roleForUser, type ViewKey, type Role } from '@/lib/services';
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
  /** ⚠️ Нэвтэрсэн хүний нэр — ӨӨРИЙГӨӨ устгах товч харагдахгүй */
  myName: string | null;
  allKeys: ViewKey[];
  rolePresets: { key: Role; label: string }[];
  hasView: (views: ViewKey[] | 'all', k: ViewKey) => boolean;
  onPick: (checked: boolean) => void;
  onExpand: () => void;
  onRole: (role: Role) => void;
  onFlipView: (k: ViewKey) => void;
  onAllViews: (on: boolean) => void;
  onFlipDocs: () => void;
  onFlipRemove: () => void;
  onClear: () => void;
  onGoFlow: () => void;
  /** Хатуу super — «Төрлөөр тохируулах»-д Super төрөл зөвхөн түүнд */
  superUser: boolean;
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
  onFlipDocs: p.onFlipDocs,
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
      {/* ⚠️ 2026-09-30: 10 чип бүгд ил байхад мөр бүр 2 мөр зай эзэлдэг байв
          (хэрэглэгчийн хүсэлт) — нэрийн ард нэг сонгогч. Сонголт = өмнөх чип дарахтай ижил (`onRole`). */}
      {/* ⚠️ 2026-09-30: хатуу super-т ИДЭВХГҮЙ — `UserAdmin.applyRole`-ийн дүрэм (кодонд бүртгэлтэй
          админыг доошлуулахгүй). Хуучин override-той бол «Сэргээх» super руу буцаана. */}
      <select
        className={s.roleSelect}
        value={d.role ?? ''}
        disabled={p.superUser}
        onChange={(e) => { if (e.target.value) onRole(e.target.value as Role); }}
        aria-label={tr('Үүрэг')}
        title={p.superUser
          ? tr('Кодонд бүртгэлтэй админ')
          : d.role === 'super'
            ? tr('Бүх харагдац нээгдэнэ. ⚠️ Админ портал нээх эрх зөвхөн кодын хатуу тохиргооны супер админд бий.')
            : tr('Үүрэг')}
      >
        {!d.role && <option value="">{tr('Үүрэг сонгох…')}</option>}
        {/* ⚠️ 2026-09-30: ХУУЧИН үүрэг (`beginner` · `tolovlolt` — шинэ аккаунтын анхдагч ч) 10 төрлийн
            жагсаалтад БАЙХГҮЙ тул сонгогч ЭХНИЙ сонголтыг («Гүйцэтгэгч компани») харуулж, хадгалагдах
            бодит үүргийг нууж байв. Тэр үүргийг идэвхгүй сонголтоор ил харуулна (дахин сонгогдохгүй). */}
        {d.role && !rolePresets.some((r) => r.key === d.role) && (
          <option value={d.role} disabled>{typeLabel(d.role)}</option>
        )}
        {rolePresets.map((r) => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
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

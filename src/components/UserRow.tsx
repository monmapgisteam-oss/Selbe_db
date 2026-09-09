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
 */

import { Icon } from '@/components/Icon';
import { t as tr } from '@/lib/i18nCore';
import { roleForUser, VIEWS, type ViewKey, type Role } from '@/lib/services';
import type { UserPerm } from '@/lib/permissions';
import { CAPS, type CapKey } from '@/lib/caps';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';
import s from './userAdmin.module.css';
import type { Draft } from './UserAdmin';

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
};

export function UserRow(props: UserRowProps) {
  const {
    u, rowKey: key, d, dirty, st, expanded, on, capViews, caps, selected,
    capErr, dirtyPerm, myName, allKeys, rolePresets, hasView, capLabel, capHint,
    onPick, onExpand, onRole, onFlipView, onAllViews, onFlipDocs, onFlipCap,
    onFlipRemove, onClear, onGoFlow,
  } = props;

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
                onClick={onExpand}
              >
                <span className={`${s.caret} ${expanded ? s.caretOn : ''}`} aria-hidden>▸</span>
                <span className={s.uname}>{u.username}</span>
              </button>
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
            </div>

            {expanded && !d.remove && (
              <>
                {/*
                  * СЭДВҮҮД — жагсаалт хэлбэрээр, мөр бүрийн АРД унтраалга.
                  * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): chip-үүдийн үүл байсныг
                  * жагсаалт + switch болгов — аль сэдэв нээлттэйг нэг харцаар
                  * ялгахад унтраалгын байрлал тогтмол байх нь чухал.
                  */}
                <div className={s.topicHead}>
                  <span className={s.topicHeadLabel}>{tr('Харагдац')}</span>
                  <button type="button" className={s.linkBtn} onClick={() => onAllViews(true)}>
                    {tr('Бүгдийг асаах')}
                  </button>
                  <button type="button" className={s.linkBtn} onClick={() => onAllViews(false)}>
                    {tr('Бүгдийг унтраах')}
                  </button>
                </div>
                <div className={s.topicList}>
                  {VIEWS.map((v) => {
                    const base = hasView(d.views, v.key);
                    /* ⚠️ Нэмэлт эрхийн гэр харагдац (CAP_HOST_VIEW) runtime дээр
                       НЭЭЛТТЭЙ — унтраалга үүнийг ч харуулна, эс бөгөөс админ
                       «унтраасан» атлаа хэрэглэгч харсаар байдаг байв. Дарвал
                       суурь жагсаалтад ил орно (эрх хасагдсан ч үлдэнэ). */
                    const implied = !base && capViews.includes(v.key);
                    const vOn = base || implied;
                    return (
                      <div key={v.key} className={s.topicRow}>
                        <span className={s.topicName}>
                          <span className={s.topicIcon}><Icon name={v.icon} size={14} /></span>
                          {v.title}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={vOn}
                          aria-label={v.title}
                          title={implied ? tr('Нэмэлт эрхээр нээлттэй — хаахын тулд тухайн эрхийг унтраана') : undefined}
                          className={`${s.sw} ${vOn ? s.swOn : ''} ${implied ? s.swImplied : ''}`}
                          onClick={() => onFlipView(v.key)}
                        >
                          <span className={s.swKnob} />
                        </button>
                      </div>
                    );
                  })}
                  <div className={s.topicRow}>
                    <span className={s.topicName}>
                      <span className={s.topicIcon}><Icon name="file" size={14} /></span>
                      {tr('ТЭЗҮ-БОНУ')}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={d.docs}
                      aria-label={tr('ТЭЗҮ-БОНУ')}
                      className={`${s.sw} ${d.docs ? s.swOn : ''}`}
                      onClick={() => onFlipDocs()}
                    >
                      <span className={s.swKnob} />
                    </button>
                  </div>
                  {/* ── НЭМЭЛТ ЭРХҮҮД — харагдацаас ТУСДАА олгоно ──
                      ⚠️ Үүрэг сонгоход өөрчлөгддөггүй: эрсдэлтэй үйлдлийг
                      урьдчилсан тохиргоогоор чимээгүй тараах ёсгүй. */}
                  {capErr && (
                    <div className={s.capErr} role="alert">
                      {tr('⚠️ ArcGIS-т бичигдсэнгүй — эрх түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин дарна уу.')}
                    </div>
                  )}
                  {/* ⚠️ Эрх бүр өөрийн харагдацыг дагуулдаг (CAP_HOST_VIEW) —
                      админ харагдацыг тусад нь асаах шаардлагагүй. */}
                  <div className={s.capNote}>
                    {tr('Нэмэлт эрх олгоход түүний харагдац (Гүйцэтгэл · Зөвшөөрөл · Санхүүжилт · Хуваарь · Газар чөлөөлөлт) тухайн хүнд автоматаар нээгдэнэ.')}
                  </div>
                  {d.isNew && (
                    <div className={s.capNote}>{tr('Нэмэлт эрхийг эхлээд хадгалсны дараа олгоно.')}</div>
                  )}
                  {CAPS.map((c) => (
                    <div key={c.key} className={s.topicRow}>
                      <span className={s.topicName} title={capHint(c.key)}>
                        <span className={s.topicIcon}><Icon name={c.icon} size={14} /></span>
                        {capLabel(c.key)}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={caps.includes(c.key)}
                        aria-label={capLabel(c.key)}
                        disabled={!!d.isNew}
                        title={d.isNew ? tr('Эхлээд хадгална уу — нэмэлт эрх хадгалагдсан аккаунтад олгогдоно') : undefined}
                        className={`${s.sw} ${caps.includes(c.key) ? s.swOn : ''}`}
                        onClick={() => onFlipCap(c.key)}
                      >
                        <span className={s.swKnob} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
  );
}

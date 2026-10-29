'use client';

/**
 * НЭГ ХЭРЭГЛЭГЧИЙН ХАРАГДАЦ · ТЭЗҮ-БОНУ — жагсаалтын дэлгэсэн мөр ба
 * хэрэглэгчийн карт ХОЁУЛАА энэ бүрэлдэхүүнийг зурна (2026-09-25).
 */

import { Icon } from '@/components/Icon';
import { t as tr } from '@/lib/i18nCore';
import { VIEWS, type ViewKey } from '@/lib/services';
import { CAP_HOST_VIEW, WORKFLOW_VIEWS, type CapKey } from '@/lib/caps';
import { paneLabel, paneOfCap } from '@/modules/capText';
import s from './userAdmin.module.css';
import type { Draft } from './UserAdmin';

export type UserRightsProps = {
  d: Draft;
  /** Засах эрхээр нээгдсэн харагдацууд (`capViewsOf`) */
  capViews: ViewKey[];
  /** Хэрэглэгчийн эрхүүд — аль эрх аль харагдацыг нээснийг tooltip-д хэлнэ */
  caps: CapKey[];
  hasView: (views: ViewKey[] | 'all', k: ViewKey) => boolean;
  onFlipView: (k: ViewKey) => void;
  onAllViews: (on: boolean) => void;
  superUser?: boolean;
};

export function UserRights(props: UserRightsProps) {
  const { d, capViews, caps, hasView, onFlipView, onAllViews } = props;
  const superUser = !!props.superUser;

  /** Энэ харагдацыг нээсэн эрхүүдийн ХУУДАСНЫ нэр (хажуугийн цэс) */
  const impliedBy = (v: ViewKey): string =>
    [...new Set(caps.filter((c) => CAP_HOST_VIEW[c].includes(v)).map((c) => paneLabel(paneOfCap(c))))].join(' · ');
  const shownViews = VIEWS.filter((v) => !WORKFLOW_VIEWS.includes(v.key));
  const workflowNames = VIEWS.filter((v) => WORKFLOW_VIEWS.includes(v.key)).map((v) => v.title).join(' · ');

  return (
    <>
      {/*
        * СЭДВҮҮД — жагсаалт хэлбэрээр, мөр бүрийн АРД унтраалга.
        */}
      <div className={s.topicHead}>
        <span className={s.topicHeadLabel}>{tr('Харагдац')}</span>
        <span className={s.saveHint}>{superUser ? tr('админ эрхээр — засагдахгүй') : tr('ноорог — «Хадгалах»')}</span>
        {!superUser && (
          <>
            <button type="button" className={s.linkBtn} onClick={() => onAllViews(true)}>
              {tr('Бүгдийг асаах')}
            </button>
            <button type="button" className={s.linkBtn} onClick={() => onAllViews(false)}>
              {tr('Бүгдийг унтраах')}
            </button>
          </>
        )}
      </div>
      <div className={s.capNote}>
        {superUser
          ? tr('Админ (super) — бүх харагдац ба ТЭЗҮ-БОНУ админ эрхээр нээлттэй; энд засагдахгүй (төрлийг өөр super админ солино).')
          : tr('Урсгалтай хуудсууд ({0}) урсгалын эрхийн хуудсаар нээгдэнэ — хуваарилалт олгоход нээгдэж, хасахад хаагдана.', workflowNames)}
      </div>
      {!superUser && capViews.some((k) => !WORKFLOW_VIEWS.includes(k)) && (
        <div className={s.capNote}>
          {tr('Бүдэг унтраалга — засах эрхээр автоматаар нээгдсэн харагдац; хаахын тулд тухайн эрхийн хуудсанд (хажуугийн цэс) эрхийг нь хасна.')}
        </div>
      )}
      <div className={s.topicList}>
        {shownViews.map((v) => {
          const base = hasView(d.views, v.key);
          const implied = !base && capViews.includes(v.key);
          const locked = superUser || implied;
          const vOn = superUser || base || implied;
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
                aria-disabled={locked || undefined}
                aria-label={v.title}
                title={superUser
                  ? tr('Админ (super) — админ эрхээр нээлттэй')
                  : implied
                    ? tr('Засах эрхээс үүссэн ({0}) — тухайн эрхийн хуудсаас хаана', impliedBy(v.key))
                    : undefined}
                className={`${s.sw} ${vOn ? s.swOn : ''} ${locked ? s.swImplied : ''}`}
                style={locked ? { cursor: 'not-allowed' } : undefined}
                onClick={locked ? undefined : () => onFlipView(v.key)}
              >
                <span className={s.swKnob} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

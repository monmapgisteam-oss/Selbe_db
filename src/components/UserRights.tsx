'use client';

/**
 * НЭГ ХЭРЭГЛЭГЧИЙН ХАРАГДАЦ · ТЭЗҮ-БОНУ — жагсаалтын дэлгэсэн мөр ба
 * хэрэглэгчийн карт ХОЁУЛАА энэ бүрэлдэхүүнийг зурна (2026-09-25).
 *
 * ⚠️ `UserRow.tsx`-ээс САЛГАСАН: карт ба мөр хоёр газар ижил унтраалгыг
 *    тусад нь бичвэл нэгд нь засвар хүрч нөгөөд нь хоцорно (`aclParity`-ийн
 *    хэв шинж). Өөрийн төлөвгүй — бүгд props-оор.
 *
 * ⚠️ ХАДГАЛАХ ДҮРЭМ: харагдац ба ТЭЗҮ-БОНУ нь НООРОГ («Хадгалах» товч).
 *
 * ⚠️ «НЭМЭЛТ ЭРХ» БЛОК ХАСАГДСАН (2026-09-30, хэрэглэгчийн шийдвэр). Урьд нь энд
 *    13 засах эрх (4 энгийн унтраалга + 9 «хуваарилалтаас · Засах →» үзүүлэлт)
 *    зурагддаг байв. Одоо «Хэрэглэгчдийн эрх удирдах» = ЗӨВХӨН ХАРАХ: аккаунт ·
 *    үүргийн шошго · 23 харагдац · ТЭЗҮ-БОНУ · хадгалах. Засах эрх БҮР админ
 *    порталын ӨӨРИЙН хуудсанд (багцаар — `ScopedAclPanel` · `ChanarAcl` ·
 *    `QaqcAcl` · `DedButetsAcl`; аккаунтаар — `PlainCapAcl`). Өнчин/дутуу эрхийн
 *    анхааруулга тэр хуудсанд (`CapOrphanNote`).
 *
 * ⚠️ ЗАСАХ ЭРХЭЭР НЭЭГДСЭН ХАРАГДАЦ (`CAP_HOST_VIEW`) runtime дээр НЭЭЛТТЭЙ тул
 *    унтраалга үүнийг ч харуулна («хаалттай» атлаа хэрэглэгч харсаар байдаг байв).
 *    Tooltip нь тухайн эрхийн хуудас руу заана — унтраалгаар хаагдахгүй.
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
  onFlipDocs: () => void;
};

export function UserRights(props: UserRightsProps) {
  const { d, capViews, caps, hasView, onFlipView, onAllViews, onFlipDocs } = props;

  /** Энэ харагдацыг нээсэн эрхүүдийн ХУУДАСНЫ нэр (хажуугийн цэс) */
  const impliedBy = (v: ViewKey): string =>
    [...new Set(caps.filter((c) => CAP_HOST_VIEW[c].includes(v)).map((c) => paneLabel(paneOfCap(c))))].join(' · ');
  /*
   * ⚠️ УРСГАЛТАЙ 6 ХАРАГДАЦ ЖАГСААЛТАД ОРОХГҮЙ (2026-09-30, хэрэглэгчийн шийдвэр):
   *    Гүйцэтгэл · Хуваарь · Хуваарь батлах · Нэмэлт ажил батлах · Чанарын баримт ·
   *    Чанар (QAQC) нь урсгалын хуваарилалтаар нээгдэж, хасахад буцаагдана
   *    (`caps.WORKFLOW_VIEWS`). Хадгалагдсан утга нь хөндөгдөхгүй — зөвхөн энд
   *    засагдахгүй; `hasAccess`/`resolveAccess` хэвээр.
   */
  const shownViews = VIEWS.filter((v) => !WORKFLOW_VIEWS.includes(v.key));
  const workflowNames = VIEWS.filter((v) => WORKFLOW_VIEWS.includes(v.key)).map((v) => v.title).join(' · ');

  return (
    <>
      {/*
        * СЭДВҮҮД — жагсаалт хэлбэрээр, мөр бүрийн АРД унтраалга.
        * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): chip-үүдийн үүл байсныг
        * жагсаалт + switch болгов — аль сэдэв нээлттэйг нэг харцаар
        * ялгахад унтраалгын байрлал тогтмол байх нь чухал.
        */}
      <div className={s.topicHead}>
        <span className={s.topicHeadLabel}>{tr('Харагдац')}</span>
        <span className={s.saveHint}>{tr('ноорог — «Хадгалах»')}</span>
        <button type="button" className={s.linkBtn} onClick={() => onAllViews(true)}>
          {tr('Бүгдийг асаах')}
        </button>
        <button type="button" className={s.linkBtn} onClick={() => onAllViews(false)}>
          {tr('Бүгдийг унтраах')}
        </button>
      </div>
      <div className={s.capNote}>
        {tr('Урсгалтай хуудсууд ({0}) урсгалын эрхийн хуудсаар нээгдэнэ — хуваарилалт олгоход нээгдэж, хасахад хаагдана.', workflowNames)}
      </div>
      {capViews.some((k) => !WORKFLOW_VIEWS.includes(k)) && (
        <div className={s.capNote}>
          {tr('Бүдэг унтраалга — засах эрхээр автоматаар нээгдсэн харагдац; хаахын тулд тухайн эрхийн хуудсанд (хажуугийн цэс) эрхийг нь хасна.')}
        </div>
      )}
      <div className={s.topicList}>
        {shownViews.map((v) => {
          const base = hasView(d.views, v.key);
          /* ⚠️ Засах эрхийн гэр харагдац (CAP_HOST_VIEW) runtime дээр
             НЭЭЛТТЭЙ — унтраалга үүнийг ч харуулна (толгойн ⚠️). Дарвал
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
                title={implied
                  ? tr('Засах эрхээр нээлттэй ({0}) — хаахын тулд тэр эрхийн хуудсанд эрхийг нь хасна', impliedBy(v.key))
                  : undefined}
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
      </div>
    </>
  );
}

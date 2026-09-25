'use client';

/**
 * НЭГ ХЭРЭГЛЭГЧИЙН ХАРАГДАЦ · ТЭЗҮ-БОНУ · НЭМЭЛТ ЭРХ — жагсаалтын дэлгэсэн мөр
 * ба хэрэглэгчийн карт ХОЁУЛАА энэ бүрэлдэхүүнийг зурна (2026-09-25).
 *
 * ⚠️ `UserRow.tsx`-ээс САЛГАСАН: карт ба мөр хоёр газар ижил унтраалгыг
 *    тусад нь бичвэл нэгд нь засвар хүрч нөгөөд нь хоцорно (`aclParity`-ийн
 *    хэв шинж). Өөрийн төлөвгүй — бүгд props-оор.
 *
 * ⚠️ ХАДГАЛАХ ДҮРЭМ: харагдац ба ТЭЗҮ-БОНУ нь НООРОГ («Хадгалах» товч);
 *    нэмэлт эрх ШУУД хадгалагдана (2026-08-28-аас) — хэсэг бүрт ил бичнэ.
 *
 * ⚠️ ГАРГАЛГААТАЙ ЭРХ = ҮЗҮҮЛЭЛТ (2026-09-25, баталсан төлөвлөгөө). Хуваарилалтаас
 *    гардаг 10 эрх (`aclRoleCaps.isDerivedCap`) super-ээс бусдад унтраалга БИШ:
 *    урьд нь унтраалга нь `[ALL]` хуваарилалт бичиж багцын хязгаарыг чимээгүй
 *    тэлдэг байв. Одоо «хуваарилалтаас · N багц» + «Засах →» (картын хэсэг рүү).
 *    ⚠️ SUPER-Т УНТРААЛГА ХЭВЭЭР: `setGrants` super-ийг татгалздаг, `hasCap`-д
 *    super-ийн тойрох зам байхгүй — эрхийг ШУУД олгох цорын ганц зам.
 * ⚠️ ӨНЧИН ЭРХ (асаалттай атлаа хуваарилалтгүй): улаан анхааруулга + ИЛ «хасах».
 *    Ачаалахад АВТОМАТААР юу ч хасахгүй; бүх ACL уншигдтал (`erh` null) харуулахгүй
 *    — эс бөгөөс `[]` жагсаалтаас худал өнчин гарна.
 */

import { Icon } from '@/components/Icon';
import { t as tr } from '@/lib/i18nCore';
import { VIEWS, type ViewKey } from '@/lib/services';
import { CAPS, CAP_HOST_VIEW, type CapKey } from '@/lib/caps';
import { capSystem, type DerivedSys } from '@/lib/aclRoleCaps';
import { capBacking, missingCaps, orphanCaps, type UserErh } from '@/lib/erhOverview';
import s from './userAdmin.module.css';
import type { Draft } from './UserAdmin';

export type UserRightsProps = {
  d: Draft;
  /** Нэмэлт эрхээр нээгдсэн харагдацууд (`capViewsOf`) */
  capViews: ViewKey[];
  /** `caps` дэх эрхүүд (runtime) */
  caps: CapKey[];
  /** ⚠️ Remote эрхийн хүснэгт уншигдаагүй — унтраалга хаалттай (2026-09-21) */
  capsLocked?: boolean;
  capsLockMsg?: string;
  capErr: boolean;
  /** Хатуу super — гаргалгаатай эрх ч унтраалгаар (дээрх ⚠️) */
  superUser: boolean;
  /** Бүх ACL уншигдсан үеийн эрхийн зураг — `null` бол үзүүлэлт/өнчин нуугдана */
  erh: UserErh | null;
  /**
   * Энэ хэрэглэгчид `aclOps` бичилт явагдаж байна (`aclPendingFor`, 2026-09-25).
   * ⚠️ Хуваарилалт локалд шууд, эрх нь `sync`-ийн дараа өөрчлөгддөг тул тэр
   *    хооронд өнчин/дутуу тэмдэг ХУДАЛ гарна — нууж, «хасах»-ыг хаана.
   */
  settling?: boolean;
  hasView: (views: ViewKey[] | 'all', k: ViewKey) => boolean;
  capLabel: (k: CapKey) => string;
  capHint: (k: CapKey) => string;
  onFlipView: (k: ViewKey) => void;
  onAllViews: (on: boolean) => void;
  onFlipDocs: () => void;
  onFlipCap: (c: CapKey) => void;
  /** Өнчин эрхийг ИЛ хасах (баталгаажуулалт эцэгт) */
  onDropOrphan: (c: CapKey) => void;
  /** Картын тухайн системийн хэсэг рүү */
  onOpenCard: (sys: DerivedSys) => void;
};

export function UserRights(props: UserRightsProps) {
  const {
    d, capViews, caps, capsLocked, capsLockMsg, capErr, superUser, erh, settling, hasView, capLabel, capHint,
    onFlipView, onAllViews, onFlipDocs, onFlipCap, onDropOrphan, onOpenCard,
  } = props;

  /* ⚠️ Бичилт явагдаж байхад (`settling`) тэмдэг ГАРГАХГҮЙ — дээрх ⚠️ */
  const orphans = erh && !settling ? orphanCaps(erh) : [];
  const missing = erh && !settling ? missingCaps(erh) : [];

  /** Гаргалгаатай эрхийн эх сурвалжийн текст */
  const srcText = (c: CapKey): string => {
    if (!erh) return caps.includes(c) ? tr('асаалттай') : '—';
    if (settling) return tr('хадгалж байна…');
    if (orphans.includes(c)) return tr('⚠️ Хуваарилалтгүй эрх');
    const b = capBacking(erh, c);
    const base = b === null
      ? tr('хуваарилалтаас · бүх багц')
      : b.length ? tr('хуваарилалтаас · {0} багц', String(b.length)) : tr('хуваарилаагүй');
    return missing.includes(c) ? `${base} · ${tr('⚠️ эрх олгогдоогүй — хуваарилалтыг дахин хадгална уу')}` : base;
  };

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
      </div>

      {/* ── НЭМЭЛТ ЭРХҮҮД — харагдацаас ТУСДАА олгоно ──
          ⚠️ Үүрэг сонгоход өөрчлөгддөггүй: эрсдэлтэй үйлдлийг
          урьдчилсан тохиргоогоор чимээгүй тараах ёсгүй. */}
      <div className={s.topicHead}>
        <span className={s.topicHeadLabel}>{tr('Нэмэлт эрх')}</span>
        <span className={s.saveHint}>{tr('шууд хадгалагдана')}</span>
      </div>
      {capErr && (
        <div className={s.capErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — эрх түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин дарна уу.')}
        </div>
      )}
      {/* ⚠️ Харагдацын жагсаалт `CAP_HOST_VIEW`-ээс ГАРНА (2026-09-23) —
          урьд нь гараар бичсэн 6 нэр байсан тул шинэ эрх нэмэгдэх бүрд хоцордог байв. */}
      <div className={s.capNote}>
        {tr('Нэмэлт эрх олгоход түүний харагдац ({0}) тухайн хүнд автоматаар нээгдэнэ.',
          [...new Set(Object.values(CAP_HOST_VIEW).flat())]
            .map((v) => VIEWS.find((x) => x.key === v)?.title ?? v)
            .join(' · '))}
      </div>
      {!superUser && (
        <div className={s.capNote}>
          {tr('Багцаар хуваарилагддаг эрх (хуваарь, обьём, нэмэлт ажил, чанар, QAQC, дэд бүтэц) нь хуваарилалтаас гарна — «Засах →» дарж тухайн хэсэгт багц онооно.')}
        </div>
      )}
      {d.isNew && (
        <div className={s.capNote}>{tr('Нэмэлт эрхийг эхлээд хадгалсны дараа олгоно.')}</div>
      )}
      <div className={s.topicList}>
        {CAPS.map((c) => {
          const sys = capSystem(c.key);
          /* ⚠️ Гаргалгаатай эрх super-ээс бусдад — ҮЗҮҮЛЭЛТ (толгойн ⚠️) */
          if (sys && !superUser) {
            const orphan = orphans.includes(c.key);
            return (
              <div key={c.key} className={`${s.topicRow} ${s.capDerived} ${orphan ? s.capOrphan : ''}`}>
                <span className={s.topicName} title={capHint(c.key)}>
                  <span className={s.topicIcon}><Icon name={c.icon} size={14} /></span>
                  {capLabel(c.key)}
                </span>
                <span className={s.capSrc}>
                  <span
                    className={orphan ? s.capOrphanText : undefined}
                    title={orphan && c.key === 'addRow'
                      ? tr('Хасвал «Гүйцэтгэл бөглөх» хуудасны «Бөглөх» таб мөн хаагдана (урсгалын гүйцэтгэгч шатнаас бусдад).')
                      : undefined}
                  >
                    {srcText(c.key)}
                  </span>
                  {orphan && (
                    <button
                      type="button"
                      className={s.capOrphanX}
                      disabled={!!d.isNew || !!capsLocked || !!settling}
                      title={capsLocked ? capsLockMsg : tr('Энэ эрхийг хасна — хуваарилалт байхгүй')}
                      onClick={() => onDropOrphan(c.key)}
                    >
                      {tr('хасах')}
                    </button>
                  )}
                  <button type="button" className={s.linkBtn} onClick={() => onOpenCard(sys)}>
                    {tr('Засах →')}
                  </button>
                </span>
              </div>
            );
          }
          return (
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
                /* ⚠️ `capsLocked` — remote уншигдаагүй бол `[]∪{cap}` бичилт
                   remote-ийг дарах тул хаалттай (2026-09-21, UserAdmin-ы тайлбар) */
                disabled={!!d.isNew || !!capsLocked}
                title={d.isNew
                  ? tr('Эхлээд хадгална уу — нэмэлт эрх хадгалагдсан аккаунтад олгогдоно')
                  : capsLocked ? capsLockMsg : undefined}
                className={`${s.sw} ${caps.includes(c.key) ? s.swOn : ''}`}
                onClick={() => onFlipCap(c.key)}
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

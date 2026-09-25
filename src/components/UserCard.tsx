'use client';

/**
 * ХЭРЭГЛЭГЧИЙН КАРТ — нэг хүний БҮХ эрх, хуваарилалт нэг дэлгэцэнд (2026-09-25).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн баталсан төлөвлөгөө). «Батбаяр юу хийж чадах вэ,
 *    түүнд Багц 3-ын хуваарь батлахыг өгье» гэхэд урьд нь ДОЛООН хуудас нээж,
 *    тус бүрд нэрийг нь хайдаг байв. Карт нь тэр бүгдийг хэсэг хэсгээр:
 *      1 толгой (шошго · preset · Сэргээх/Устгах) — НООРОГ
 *      2 харагдац · ТЭЗҮ-БОНУ (ноорог) · нэмэлт эрх (шууд) — `UserRights`
 *      3 гүйцэтгэлийн урсгал — шат · багц · «Зөвхөн харна» (шууд)
 *      4 QAQC · Хуваарь · Обьём · Нэмэлт ажил · Чанарын баримт · Дэд бүтэц (шууд)
 *
 * ⚠️ ХАДГАЛАХ ДҮРЭМ — хэрэглэгчийн ӨӨРИЙН эрхийн мөр (харагдац, үүрэг, устгах,
 *    сэргээх) НООРОГ; `__cap__:` ба ACL мөрүүд ШУУД. Шалтгаан: `set*Grants`-ийг
 *    snapshot-оос дахин тоглуулбал хуучин snapshot шинэ бичилтийг дарна
 *    (`scopedAcl.ts`-ийн «Remote агшин»); `revokeGoneRoles` амьд жагсаалтыг
 *    дахин уншдаг; түгжээ бичих агшинд шалгагдана. Хэсэг бүрт ил бичнэ.
 * ⚠️ ШИНЭ (хадгалаагүй) эсвэл УСТГАХААР тэмдэглэсэн аккаунтад шууд хэсгүүд
 *    хаалттай — ноорог цуцлагдвал remote дээр өнчин мөр үлдэнэ.
 * ⚠️ УРСГАЛ ноорогтой үед ХААЛТТАЙ: `grantFlowAccess`/`revokeFlowAccess` нь
 *    хэрэглэгчийн эрхийн мөрийг (`setUser`) бичдэг тул ноорогтой уралдана.
 * ⚠️ Бүх бичилт `aclOps`-оор — бүлгийн панел ба матрицтай ИЖИЛ дүрэм, асуулт.
 */

import { useEffect } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import { ALL_BAGTS } from '@/lib/scopedAcl';
import { listAssigns } from '@/lib/guitsetgelAcl';
import { listQaqcAssigns } from '@/lib/qaqcAcl';
import { ROLE_CAPS, SCOPED_SYSTEMS, type ScopedSys } from '@/lib/aclRoleCaps';
import type { CapKey } from '@/lib/caps';
import {
  SCOPED_SYS, addPkgOp, allAclReady, dropRoleOp, flowAllOp, flowChipOp, flowFailed, flowStageOp,
  flowViewOnlyOp, lockMsg, qaqcAllOp, qaqcChipOp, qaqcDropOp, qaqcFailed, removePkgOp, setRoleAllOp,
  type AclOp,
} from '@/lib/aclOps';
import { useAclRunner } from '@/modules/useAclRunner';
import { draftFlowMsg, newAccountMsg, removeMarkedMsg, roleLabel, sysTitle } from '@/modules/erhLabels';
import { UserRights } from './UserRights';
import { UserTypeSection } from './UserTypeSection';
import { roleOf } from '@/lib/permissions';
import { UserHeadActions, UserHeadBadges, rightsProps, type UserRowProps } from './UserRow';
import s from './userAdmin.module.css';

export type UserCardProps = {
  /** Мөрийн props — толгой ба `UserRights` ИЖИЛ бүрэлдэхүүнээр зурагдана */
  p: UserRowProps;
  /** Нээхдээ гүйлгэх хэсэг (`erh-sec-{sys}`) */
  focus?: string;
  /** Энэ хэрэглэгчид хадгалаагүй ноорог байна — урсгалын засвар хаалттай */
  hasDraft: boolean;
  onBack: () => void;
};

export function UserCard({ p, focus, hasDraft, onBack }: UserCardProps) {
  const { u, d } = p;
  const key = u.username.trim().toLowerCase();
  const { busy, err, run } = useAclRunner();

  /* ⚠️ `focus` — «Засах →» эсвэл матрицаас ирсэн бол тэр хэсэг рүү */
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(`erh-sec-${focus}`)?.scrollIntoView({ block: 'start' }), 30);
    return () => clearTimeout(t);
  }, [focus, key]);

  const ready = allAclReady();
  /** Шууд бичих хэсгүүд хаалттай эсэх (толгойн ⚠️) */
  const blocked = !!d.isNew || !!d.remove;
  const off = blocked || !ready || busy;
  const exec = (op: AclOp) => { void run(op); };

  const blockNote = d.isNew
    ? newAccountMsg()
    : d.remove ? removeMarkedMsg() : '';

  const flow = listAssigns().find((a) => a.user === key) ?? null;
  const qaqc = listQaqcAssigns().find((a) => a.user === key) ?? null;
  const flowOff = off || hasDraft;

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <button type="button" className={s.cancelBtn} onClick={onBack}>{tr('← Жагсаалт')}</button>
        <span className={s.cardName}>{u.username}</span>
        <UserHeadBadges p={p} />
        <UserHeadActions p={p} />
      </div>
      {d.remove && <div className={s.capNote}>{tr('Хадгалахад энэ аккаунт устгагдана.')}</div>}

      {!ready && <div className={s.capErr} role="alert">{lockMsg()}</div>}
      {err && <div className={s.capErr} role="alert">{err}</div>}
      {blockNote && <div className={s.capNote}>{blockNote}</div>}

      {/* ── 1б. Эрхийн төрөл — загвараар нэг дор (2026-09-25) ── */}
      {!d.remove && (
        <UserTypeSection key={key} user={key} role={roleOf(key)} disabled={off || hasDraft} hardSuper={p.superUser} />
      )}

      {/* ── 2. Харагдац · ТЭЗҮ-БОНУ · нэмэлт эрх ── */}
      {!d.remove && (
        <section className={s.cardSec} id="erh-sec-rights">
          <UserRights {...rightsProps(p)} />
        </section>
      )}

      {/* ── 3. Гүйцэтгэлийн урсгал ── */}
      <section className={s.cardSec} id="erh-sec-flow">
        <SecHead title={sysTitle('flow')} failed={flowFailed().includes(key)} />
        {p.superUser ? (
          <div className={s.capNote}>{tr('Админ — бүх шат, бүх багц; хуваарилалт үйлчлэхгүй.')}</div>
        ) : (
          <>
            {hasDraft && (
              <div className={s.capNote}>
                {draftFlowMsg()}
              </div>
            )}
            <div className={s.cardRole}>
              <span className={s.cardRoleName}>{tr('Шат')}</span>
              <select
                className={s.cardSelect}
                value={flow?.stage ?? ''}
                disabled={flowOff}
                onChange={(e) => exec(flowStageOp(key, (e.target.value || null) as Stage | null))}
                aria-label={tr('Шат')}
              >
                <option value="">{tr('— томилоогүй —')}</option>
                {STAGE_ORDER.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
              </select>
              {flow && (
                <button
                  type="button"
                  className={`${s.chip} ${flow.viewOnly ? s.chipOn : ''}`}
                  disabled={flowOff}
                  title={tr('Асаавал энэ хүн гүйцэтгэлийг ХАРНА, гэхдээ батлах/буцаах товч идэвхгүй байна.')}
                  onClick={() => exec(flowViewOnlyOp(key, !flow.viewOnly))}
                >
                  {flow.viewOnly ? tr('◉ Зөвхөн харна') : tr('○ Зөвхөн харна')}
                </button>
              )}
            </div>
            {flow && (
              <Chips
                all={flow.bagts.includes(ALL_BAGTS)}
                pkgs={PKG_GROUPS.map((g) => ({ key: g, name: g, on: flow.bagts.includes(g) }))}
                disabled={flowOff}
                onAll={() => exec(flowAllOp(key))}
                onPkg={(g) => exec(flowChipOp(key, g))}
              />
            )}
          </>
        )}
      </section>

      {/* ── 4. QAQC ── */}
      <section className={s.cardSec} id="erh-sec-qaqc">
        <SecHead title={sysTitle('qaqc')} failed={qaqcFailed().includes(key)} capOn={p.caps.includes('qaqc')} />
        {p.superUser ? <SuperNote /> : (
          <div className={s.cardRole}>
            <span className={s.cardRoleName}>{tr('Хариуцагч')}</span>
            <Chips
              all={!!qaqc?.bagts.includes(ALL_BAGTS)}
              pkgs={PKG_GROUPS.map((g) => ({ key: g, name: g, on: !!qaqc?.bagts.includes(g) }))}
              disabled={off}
              onAll={() => exec(qaqcAllOp(key))}
              onPkg={(g) => exec(qaqcChipOp(key, g))}
            />
            {qaqc && (
              <button
                type="button"
                className={s.capOrphanX}
                disabled={off}
                title={tr('Хуваарилалтаас хасах')}
                onClick={() => exec(qaqcDropOp(key))}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── 4. Үүрэгтэй таван систем ── */}
      {SCOPED_SYSTEMS.map((sys) => (
        <ScopedSection
          key={sys}
          sys={sys}
          user={key}
          superUser={p.superUser}
          caps={p.caps}
          disabled={off}
          exec={exec}
        />
      ))}
    </div>
  );
}

/** Хэсгийн гарчиг — шууд хадгалагдана · бичилт унасан ⚠️ · эрхийн төлөв */
function SecHead({ title, failed, capOn }: { title: string; failed: boolean; capOn?: boolean }) {
  return (
    <div className={s.topicHead}>
      <span className={s.topicHeadLabel}>{title}</span>
      {capOn !== undefined && (
        <span className={s.saveHint}>{capOn ? tr('эрх: асаалттай') : tr('эрх: унтраалттай')}</span>
      )}
      {failed && (
        <span className={s.capOrphanText} title={tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}>⚠️</span>
      )}
      <span className={s.saveHint}>{tr('шууд хадгалагдана')}</span>
    </div>
  );
}

function SuperNote() {
  return (
    <div className={s.capNote}>
      {tr('Админ — хуваарилалт үйлчлэхгүй, бүх багц нээлттэй. Эрхийг дээрх унтраалгаар шууд олгоно.')}
    </div>
  );
}

/** «Бүх багц» + багц бүрийн чип */
function Chips({
  all, pkgs, disabled, onAll, onPkg,
}: {
  all: boolean;
  pkgs: { key: string; name: string; on: boolean }[];
  disabled: boolean;
  onAll: () => void;
  onPkg: (key: string) => void;
}) {
  return (
    <div className={s.chips}>
      <button type="button" className={`${s.chip} ${all ? s.chipOn : ''}`} disabled={disabled} onClick={onAll}>
        {tr('Бүх багц')}
      </button>
      {pkgs.map((g) => (
        <button
          key={g.key}
          type="button"
          className={`${s.chip} ${g.on ? s.chipOn : ''}`}
          disabled={disabled}
          onClick={() => onPkg(g.key)}
        >
          {g.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Нэг үүрэгтэй системийн хэсэг — үүрэг бүрд «Бүх багц» + багцын чип.
 * ⚠️ Чип «асаалттай» = тэр багцад ХАМААРНА («Бүх багц»-тай бол бүгд). Бүх
 *    багцтай үүргийн нэг чипийг дарвал `removePkgOp`-ийн дүрэм: үүргийг бүхэлд
 *    нь хасахыг асууна (дэд бүтэц — бусад багц руу задарна).
 */
function ScopedSection({
  sys, user, superUser, caps, disabled, exec,
}: {
  sys: ScopedSys;
  user: string;
  superUser: boolean;
  caps: CapKey[];
  disabled: boolean;
  exec: (op: AclOp) => void;
}) {
  const spec = SCOPED_SYS[sys];
  const row = spec.list().find((a) => a.user === user);
  const map = ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>;
  const universe = sys === 'butets'
    ? BUTETS_PACKS.map((p) => ({ key: p.key, name: p.name }))
    : PKG_GROUPS.map((g) => ({ key: g, name: g }));

  return (
    <section className={s.cardSec} id={`erh-sec-${sys}`}>
      <SecHead title={sysTitle(sys)} failed={spec.failedUsers().includes(user)} />
      {superUser ? <SuperNote /> : spec.roles.map((role) => {
        const g = row?.grants.find((x) => x.role === role);
        const all = !!g?.bagts.includes(ALL_BAGTS);
        const cap = map[role];
        return (
          <div key={role} className={s.cardRole}>
            <span className={s.cardRoleName} title={cap}>
              {roleLabel(sys, role)}
              <small className={s.saveHint}>{caps.includes(cap) ? tr('эрх: асаалттай') : tr('эрх: унтраалттай')}</small>
            </span>
            <Chips
              all={all}
              pkgs={universe.map((p) => ({ ...p, on: all || !!g?.bagts.includes(p.key) }))}
              disabled={disabled}
              onAll={() => exec(all ? dropRoleOp(sys, user, role) : setRoleAllOp(sys, user, role))}
              onPkg={(k) => exec(all || g?.bagts.includes(k)
                ? removePkgOp(sys, user, role, k)
                : addPkgOp(sys, user, role, k))}
            />
          </div>
        );
      })}
    </section>
  );
}

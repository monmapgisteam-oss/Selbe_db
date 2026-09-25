'use client';

/**
 * ЭРХИЙН ТОЙМ — «хэн юу хийж чадах вэ» ба «багц бүрд хэн байгаа вэ».
 *
 * ⚠️ ЯАГААД ЭНЭ БҮЛЭГ БАЙХ ЁСТОЙ ВЭ (2026-09-09). Админ панел нь ТАВАН
 * бүлэгт хуваагдсан бөгөөд тус бүр нь ӨӨР асуултад хариулна. Гэвч админд
 * байнга гардаг хоёр асуултад хариулах газар БАЙХГҮЙ байв:
 *
 *   · «Батбаяр юу хийж чадах вэ?» — таван бүлгийг тус тусад нь нээж, нэрийг
 *     нь хайх ёстой (5 удаа).
 *   · «Багц 3.1-ийг хэн хариуцаж байна?» — мөн адил.
 *
 * ⚠️ 2026-09-25: «ЗӨВХӨН ХАРУУЛНА» дүрэм ӨӨРЧЛӨГДСӨН (баталсан төлөвлөгөө).
 *    «Багцаар» хөзрүүдийн оронд засварлах боломжтой БАГЦ × СИСТЕМИЙН МАТРИЦ
 *    (`ErhMatrix`), «Хүнээр» хөзөр дарвал ХЭРЭГЛЭГЧИЙН КАРТ нээгдэнэ.
 *    «Хоёр газраас засвал аль нь үнэн болох нь бүрхэг» гэсэн хуучин айдас
 *    нь бичих ДҮРЭМ хоёр байснаас үүдэлтэй байв — одоо матриц, карт, бүлгийн
 *    панел бүгд НЭГ давхаргаар (`aclOps`) бичдэг тул дүрэм нэг.
 *
 * ⚠️ ГАЦААГ УРЬДЧИЛЖ ХЭЛНЭ. Одоо систем нь гацахыг ХҮЛЭЭДЭГ: батлагч
 * томилоогүй багц илгээлт ирэх хүртэл чимээгүй, зохиогч=батлагч болсон багц
 * `decidePlan` татгалзах хүртэл чимээгүй. Тооцоо нь `erhOverview.ts`-д
 * (цэвэр функц, бүрэн тесттэй).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { subscribe } from '@/lib/permissions';
import { subscribeCaps, CAP_HOST_VIEW, type CapKey } from '@/lib/caps';
import { subscribeAcl } from '@/lib/guitsetgelAcl';
import { subscribeQaqcAcl } from '@/lib/qaqcAcl';
import { subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { subscribeObyemAcl } from '@/lib/obyemAcl';
import { subscribeChanarAcl } from '@/lib/chanarAcl';
import { subscribeAjilAcl } from '@/lib/ajilAcl';
import { subscribeButetsAcl } from '@/lib/butetsAcl';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import { allAclReady, liveErhSource, lockMsg } from '@/lib/aclOps';
import { allPkgErh, allUserErh, type RoleLine } from '@/lib/erhOverview';
import { bagtsText, capLabelShort, issueText, roleLabel, type ScopedKind } from './erhLabels';
import { ErhMatrix } from './ErhMatrix';
import s from './guitsetgel.module.css';

export function ErhOverview({
  onGo, onOpenUser, drafts,
}: {
  onGo: (pane: string) => void;
  /** `UserAdmin`-ы хадгалаагүй ноорог — матриц картын хамгаалалтыг мөрдөнө (2026-09-25) */
  drafts: ReadonlyMap<string, { remove?: boolean; isNew?: boolean }>;
  /** Хүний хөзөр дарахад хэрэглэгчийн карт нээнэ (2026-09-25) */
  onOpenUser: (user: string) => void;
}) {
  const [, tick] = useState(0);
  /* ⚠️ ТАВАН эх сурвалж бүрд захиална — аль нэгэнд нь захиалахгүй бол
     тэр бүлгийн засвар тоймд хүрэхгүй, админ хуучин зургийг харна. */
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeCaps(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeQaqcAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeHuvaariAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeAjilAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeButetsAcl(() => tick((n) => n + 1)), []);

  /* ⚠️ Матриц АНХДАГЧ (2026-09-25) — «Багцаар» хөзрийн горимыг орлоно */
  const [mode, setMode] = useState<'matrix' | 'user'>('matrix');

  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-24) — панелуудтай ИЖИЛ туг. Аль нэг эх сурвалж энэ
   *    сешнд уншигдаагүй бол `list*()` нь `[]` тул тойм «бүгд томилоогүй»,
   *    «Цоорхой алга» гэсэн ХУДАЛ зураг харуулдаг байв. Уншигдтал ил хэлнэ.
   * ⚠️ 2026-09-25: илэрхийлэл `aclOps.allAclReady`-д НЭГ газар.
   */
  const locked = !allAclReady();
  const LOCK_MSG = lockMsg();

  const src = liveErhSource();
  const pkgs = allPkgErh(src);
  const people = allUserErh(src);
  const allIssues = pkgs.flatMap((p) => p.issues);

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Засвар бүгд нэг бичих давхаргаар — матриц, хэрэглэгчийн карт, бүлгийн хуудас ижил дүрмээр бичиж, ижил асуулт асууна. Хуваарилалт шууд хадгалагдана.')}
      </p>

      {/* ⚠️ ЦООРХОЙ ЭХЭНД: админ хуудас нээмэгц ажил гацах эрсдэлийг харна */}
      {allIssues.length > 0 && (
        <div className={s.aclCol}>
          <div className={s.aclHead}>
            <span>{tr('Анхаарах')}</span>
            <span className={s.aclCount}>{allIssues.length}</span>
          </div>
          {allIssues.map((i, k) => (
            <div key={`${i.key}-${i.args[0]}-${k}`} className={s.aclErr} role="alert">
              {issueText(i)}
            </div>
          ))}
        </div>
      )}
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {/* ⚠️ Уншигдаагүй үед «цоорхой алга» гэж худал тайтгаруулахгүй */}
      {!locked && allIssues.length === 0 && (
        <div className={s.aclEmpty}>{tr('Цоорхой алга — багц бүр бүрэн томилогдсон.')}</div>
      )}

      <div className={s.aclAdd}>
        <button
          type="button"
          className={`${s.aclPkg} ${mode === 'matrix' ? s.aclPkgOn : ''}`}
          onClick={() => setMode('matrix')}
        >
          {tr('Багцаар')}
        </button>
        <button
          type="button"
          className={`${s.aclPkg} ${mode === 'user' ? s.aclPkgOn : ''}`}
          onClick={() => setMode('user')}
        >
          {tr('Хүнээр')}
        </button>
      </div>

      {mode === 'matrix' ? (
        <ErhMatrix src={src} locked={locked} drafts={drafts} />
      ) : (
        <div className={s.aclGrid}>
          {people.map((u) => (
            <div
              key={u.user}
              className={`${s.aclCol} ${s.mxCard}`}
              role="button"
              tabIndex={0}
              title={tr('Хэрэглэгчийн карт — бүх эрх, хуваарилалт нэг дор')}
              onClick={() => onOpenUser(u.user)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenUser(u.user); } }}
            >
              <div className={s.aclHead}>
                <span>{u.user}</span>
                <span className={s.aclCount}>{u.views.open}/{u.views.total}</span>
              </div>

              {/* ⚠️ Хатуу super нь хуваарилалтгүй ч бүх эрхтэй — «эрх олгоогүй» БИШ (2026-09-24) */}
              {u.superUser && (
                <div className={s.aclName}>{tr('Админ — бүх багц, бүх шат')}</div>
              )}
              {!u.any && (
                <div className={s.aclEmpty}>{tr('Эрх олгоогүй — зөвхөн харагдац.')}</div>
              )}

              {u.flow && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Гүйцэтгэлийн урсгал')}</div>
                  <div className={s.aclName}>
                    {STAGE_LABEL[u.flow.stage]} · {bagtsText(u.flow.bagts)}
                    {u.flow.viewOnly && <> · <em className={s.aclEmpty}>{tr('зөвхөн харна')}</em></>}
                  </div>
                </div>
              )}

              <UserRoles title={tr('Хуваарь')} kind="huvaari" lines={u.huvaari} />
              <UserRoles title={tr('Инженерийн обьём')} kind="obyem" lines={u.obyem} />
              <UserRoles title={tr('Чанарын баримт')} kind="chanar" lines={u.chanar} />
              <UserRoles title={tr('Нэмэлт ажил')} kind="ajil" lines={u.ajil} />
              {/* ⚠️ Дэд бүтцийн багц нь түлхүүр (`p.key`) хэлбэрээр хадгалагддаг — нэрээр нь харуулна */}
              <UserRoles
                title={tr('Дэд бүтцийн засвар')}
                kind="butets"
                lines={u.butets.map((l) => ({
                  ...l,
                  bagts: l.bagts?.map((k) => BUTETS_PACKS.find((x) => x.key === k)?.name ?? k) ?? null,
                }))}
              />

              {/* ⚠️ `qaqcAssigned` (2026-09-25): `qaqc === null` нь «бүх багц»-ийг ч
                  илэрхийлдэг тул урьд нь бүх багцтай QAQC хүн энд харагддаггүй байв */}
              {u.qaqcAssigned && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Чанар (QAQC)')}</div>
                  <div className={s.aclName}>{bagtsText(u.qaqc)}</div>
                </div>
              )}

              {u.caps.length > 0 && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Нэмэлт эрх')}</div>
                  {/* ⚠️ `join` ЗААВАЛ (2026-09-16): `CAP_HOST_VIEW` нь массив
                      болсон тул шууд өгвөл React түүнийг тусгаарлагчгүй
                      нийлүүлж «huvaariBatlahhuvaari» болгоно. */}
                  <div className={s.aclPkgs}>
                    {u.caps.map((c) => (
                      <span key={c} className={s.aclPkg} title={CAP_HOST_VIEW[c as CapKey].join(', ')}>
                        {capLabelShort(c as CapKey)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className={s.aclNote}>
        {tr('Засах бол:')}{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('users')}>{tr('Хэрэглэгчдийн эрх')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('guits')}>{tr('Гүйцэтгэлийн урсгал')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('qaqc')}>{tr('Чанар')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('huvaari')}>{tr('Хуваарь')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('obyem')}>{tr('Обьём')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('chanar')}>{tr('Чанарын баримт')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('ajil')}>{tr('Нэмэлт ажил')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('butets')}>{tr('Дэд бүтэц')}</button>
      </p>
    </div>
  );
}

/** Хүний хөзөр дэх нэг дэд системийн үүргүүд */
function UserRoles({
  title, kind, lines,
}: { title: string; kind: ScopedKind; lines: RoleLine[] }) {
  if (!lines.length) return null;
  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{title}</div>
      {lines.map((l) => (
        <div key={l.role} className={s.aclUser}>
          <span className={s.aclEmpty} style={{ minWidth: 96 }}>{roleLabel(kind, l.role)}</span>
          <span className={s.aclName}>{bagtsText(l.bagts)}</span>
        </div>
      ))}
    </div>
  );
}

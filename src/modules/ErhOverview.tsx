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
 * ⚠️ ЗӨВХӨН ХАРУУЛНА, ЗАСАХГҮЙ. Засвар нь харгалзах бүлэгтээ хэвээр —
 * хоёр газраас нэг зүйлийг засвал аль нь үнэн болох нь бүрхэг болно.
 * Мөрийн ✏️ товч нь тухайн бүлэг рүү ШИЛЖҮҮЛНЭ.
 *
 * ⚠️ ГАЦААГ УРЬДЧИЛЖ ХЭЛНЭ. Одоо систем нь гацахыг ХҮЛЭЭДЭГ: батлагч
 * томилоогүй багц илгээлт ирэх хүртэл чимээгүй, зохиогч=батлагч болсон багц
 * `decidePlan` татгалзах хүртэл чимээгүй. Тооцоо нь `erhOverview.ts`-д
 * (цэвэр функц, бүрэн тесттэй).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { listUsers, subscribe } from '@/lib/permissions';
import { capsOf, subscribeCaps, CAP_HOST_VIEW, type CapKey } from '@/lib/caps';
import { listAssigns, subscribeAcl } from '@/lib/guitsetgelAcl';
import { listQaqcAssigns, subscribeQaqcAcl } from '@/lib/qaqcAcl';
import { listHuvaariAssigns, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { listObyemAssigns, subscribeObyemAcl } from '@/lib/obyemAcl';
import { resolveAccess } from '@/lib/permissions';
import { VIEWS } from '@/lib/services';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import {
  allPkgErh, allUserErh, type ErhSource, type PkgIssue, type RoleLine,
} from '@/lib/erhOverview';
import s from './guitsetgel.module.css';

/** Цоорхойн мессеж — `⚠️` тайлбарын дагуу тайлбарлана */
const issueText = (i: PkgIssue): string => {
  if (i.key === 'huvaariNoApprover') {
    return tr('{0}: хуваарийн батлагч томилоогүй — илгээсэн хуваарийг хэн ч батлахгүй.', i.args[0]);
  }
  if (i.key === 'huvaariSelfApprove') {
    return tr('{0}: {1} нь зохиогч БА батлагч хоёулаа — өөрийн илгээснийг өөрөө батлах боломжгүй тул хуваарь гацна.', i.args[0], i.args[1]);
  }
  if (i.key === 'obyemNoApprover') {
    return tr('{0}: обьёмын батлагч томилоогүй — илгээсэн засварыг хэн ч батлахгүй.', i.args[0]);
  }
  if (i.key === 'obyemSelfApprove') {
    return tr('{0}: {1} нь засварлагч БА батлагч хоёулаа — обьёмын засвар гацна.', i.args[0], i.args[1]);
  }
  if (i.key === 'flowGap') {
    return tr('{0}: гүйцэтгэлийн урсгалын {1} шат томилогдоогүй — илгээлт тэр шатанд зогсоно.', i.args[0], i.args[1]);
  }
  return i.key;
};

/** Үүргийн монгол нэр — дэд систем бүрд өөр */
const roleLabel = (kind: 'huvaari' | 'obyem', role: string): string => {
  if (kind === 'huvaari') return role === 'author' ? tr('Зохиогч') : tr('Батлагч');
  return role === 'editor' ? tr('Засварлагч') : tr('Батлагч');
};

/** Багцын жагсаалт — `null` = бүх багц */
const bagtsText = (b: string[] | null): string =>
  (b === null ? tr('бүх багц') : b.join(' · '));

const capLabelShort = (k: CapKey): string => {
  if (k === 'addRow') return tr('Мөр нэмэх');
  if (k === 'qaqc') return tr('QAQC');
  if (k === 'zovshoorol') return tr('Зөвшөөрөл');
  if (k === 'finEdit') return tr('Санхүү — утга');
  if (k === 'finRow') return tr('Санхүү — мөр');
  if (k === 'plan') return tr('Хуваарь зохиох');
  if (k === 'planApprove') return tr('Хуваарь батлах');
  if (k === 'obyemEdit') return tr('Обьём засах');
  if (k === 'obyemApprove') return tr('Обьём батлах');
  if (k === 'gazar') return tr('Газар');
  if (k === 'butets') return tr('Дэд бүтэц');
  return k;
};

export function ErhOverview({ onGo }: { onGo: (pane: string) => void }) {
  const [, tick] = useState(0);
  /* ⚠️ ТАВАН эх сурвалж бүрд захиална — аль нэгэнд нь захиалахгүй бол
     тэр бүлгийн засвар тоймд хүрэхгүй, админ хуучин зургийг харна. */
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeCaps(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeQaqcAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeHuvaariAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => tick((n) => n + 1)), []);

  const [mode, setMode] = useState<'user' | 'pkg'>('pkg');

  const users = listUsers().map((u) => u.username);
  const src: ErhSource = {
    users,
    flow: listAssigns(),
    /* Чанар нь үүрэггүй — grants нь ганц мөр, үүргийн нэр хоосон */
    qaqc: listQaqcAssigns().map((a) => ({ user: a.user, bagts: a.bagts })),
    huvaari: listHuvaariAssigns(),
    obyem: listObyemAssigns(),
    caps: Object.fromEntries(users.map((u) => [u.toLowerCase(), capsOf(u)])),
    views: Object.fromEntries(users.map((u) => {
      const a = resolveAccess(u);
      const open = a ? (a.views === 'all' ? VIEWS.length : a.views.length) : 0;
      return [u.toLowerCase(), { open, total: VIEWS.length }];
    })),
  };

  const pkgs = allPkgErh(src);
  const people = allUserErh(src);
  const allIssues = pkgs.flatMap((p) => p.issues);

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Эрхийг ЗӨВХӨН харуулна — засвар нь харгалзах бүлэгтээ. Хоёр газраас нэг зүйлийг засвал аль нь үнэн болох нь бүрхэг болно.')}
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
      {allIssues.length === 0 && (
        <div className={s.aclEmpty}>{tr('Цоорхой алга — багц бүр бүрэн томилогдсон.')}</div>
      )}

      <div className={s.aclAdd}>
        <button
          type="button"
          className={`${s.aclPkg} ${mode === 'pkg' ? s.aclPkgOn : ''}`}
          onClick={() => setMode('pkg')}
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

      {mode === 'pkg' ? (
        <div className={s.aclGrid}>
          {pkgs.map((p) => (
            <div key={p.bagts} className={s.aclCol}>
              <div className={s.aclHead}>
                <span>{p.bagts}</span>
                {p.issues.length > 0 && <span className={s.aclCount}>⚠️ {p.issues.length}</span>}
              </div>

              <div className={s.aclRole}>
                <div className={s.aclRoleHead}>{tr('Гүйцэтгэлийн урсгал')}</div>
                {Object.entries(p.flow).map(([st, who]) => (
                  <div key={st} className={s.aclUser}>
                    <span className={s.aclEmpty} style={{ minWidth: 132 }}>
                      {STAGE_LABEL[st as keyof typeof STAGE_LABEL]}
                    </span>
                    <span className={s.aclName}>
                      {who.length ? who.join(', ') : <em className={s.aclErr}>{tr('томилоогүй')}</em>}
                    </span>
                  </div>
                ))}
              </div>

              <RoleBlock title={tr('Хуваарь')} kind="huvaari" map={p.huvaari} />
              <RoleBlock title={tr('Инженерийн обьём')} kind="obyem" map={p.obyem} />

              <div className={s.aclRole}>
                <div className={s.aclRoleHead}>{tr('Чанар (QAQC)')}</div>
                <div className={s.aclName}>
                  {p.qaqc.length ? p.qaqc.join(', ') : <em className={s.aclEmpty}>{tr('томилоогүй')}</em>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.aclGrid}>
          {people.map((u) => (
            <div key={u.user} className={s.aclCol}>
              <div className={s.aclHead}>
                <span>{u.user}</span>
                <span className={s.aclCount}>{u.views.open}/{u.views.total}</span>
              </div>

              {!u.any && (
                <div className={s.aclEmpty}>{tr('Эрх олгоогүй — зөвхөн харагдац.')}</div>
              )}

              {u.flow && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Гүйцэтгэлийн урсгал')}</div>
                  <div className={s.aclName}>
                    {STAGE_LABEL[u.flow.stage]} · {bagtsText(u.flow.bagts)}
                  </div>
                </div>
              )}

              <UserRoles title={tr('Хуваарь')} kind="huvaari" lines={u.huvaari} />
              <UserRoles title={tr('Инженерийн обьём')} kind="obyem" lines={u.obyem} />

              {u.qaqc !== null && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Чанар (QAQC)')}</div>
                  <div className={s.aclName}>{bagtsText(u.qaqc)}</div>
                </div>
              )}

              {u.caps.length > 0 && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Нэмэлт эрх')}</div>
                  <div className={s.aclPkgs}>
                    {u.caps.map((c) => (
                      <span key={c} className={s.aclPkg} title={CAP_HOST_VIEW[c as CapKey]}>
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
        <button type="button" className={s.aclPkg} onClick={() => onGo('obyem')}>{tr('Обьём')}</button>
      </p>
    </div>
  );
}

/** Багцын хөзөр дэх нэг дэд системийн үүргүүд */
function RoleBlock({
  title, kind, map,
}: { title: string; kind: 'huvaari' | 'obyem'; map: Record<string, string[]> }) {
  const roles = Object.keys(map);
  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{title}</div>
      {roles.length === 0 && <div className={s.aclEmpty}>{tr('томилоогүй')}</div>}
      {roles.map((r) => (
        <div key={r} className={s.aclUser}>
          <span className={s.aclEmpty} style={{ minWidth: 96 }}>{roleLabel(kind, r)}</span>
          <span className={s.aclName}>{map[r].join(', ')}</span>
        </div>
      ))}
    </div>
  );
}

/** Хүний хөзөр дэх нэг дэд системийн үүргүүд */
function UserRoles({
  title, kind, lines,
}: { title: string; kind: 'huvaari' | 'obyem'; lines: RoleLine[] }) {
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
